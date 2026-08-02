import { KeyChord, KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Mimes } from "../../../../../../base/common/mime.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../../editor/browser/services/bulkEditService.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext, InputFocusedContextKey } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ResourceNotebookCellEdit } from "../../../../bulkEdit/browser/bulkCellEdits.js";
import { changeCellToKind, computeCellLinesContents, copyCellRange, joinCellsWithSurrounds, joinSelectedCells, moveCellRange } from "../../controller/cellOperations.js";
import { cellExecutionArgs, CellOverflowToolbarGroups, CellToolbarOrder, CELL_TITLE_CELL_GROUP_ID, NotebookCellAction, NotebookMultiCellAction, parseMultiCellExecutionArgs } from "../../controller/coreActions.js";
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID, EXPAND_CELL_OUTPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_INPUT_COLLAPSED, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_OUTPUT_FOCUSED } from "../../../common/notebookContextKeys.js";
import * as icons from "../../notebookIcons.js";
import { CellEditType, CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
const MOVE_CELL_UP_COMMAND_ID = "notebook.cell.moveUp";
const MOVE_CELL_DOWN_COMMAND_ID = "notebook.cell.moveDown";
const COPY_CELL_UP_COMMAND_ID = "notebook.cell.copyUp";
const COPY_CELL_DOWN_COMMAND_ID = "notebook.cell.copyDown";
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: MOVE_CELL_UP_COMMAND_ID,
        title: localize2("notebookActions.moveCellUp", "Move Cell Up"),
        icon: icons.moveUpIcon,
        keybinding: {
          primary: KeyMod.Alt | KeyCode.UpArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.equals("config.notebook.dragAndDropEnabled", false),
          group: CellOverflowToolbarGroups.Edit,
          order: 14
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return moveCellRange(context, "up");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: MOVE_CELL_DOWN_COMMAND_ID,
        title: localize2("notebookActions.moveCellDown", "Move Cell Down"),
        icon: icons.moveDownIcon,
        keybinding: {
          primary: KeyMod.Alt | KeyCode.DownArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.equals("config.notebook.dragAndDropEnabled", false),
          group: CellOverflowToolbarGroups.Edit,
          order: 14
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return moveCellRange(context, "down");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: COPY_CELL_UP_COMMAND_ID,
        title: localize2("notebookActions.copyCellUp", "Copy Cell Up"),
        keybinding: {
          primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return copyCellRange(context, "up");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: COPY_CELL_DOWN_COMMAND_ID,
        title: localize2("notebookActions.copyCellDown", "Copy Cell Down"),
        keybinding: {
          primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 13
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return copyCellRange(context, "down");
  }
});
const SPLIT_CELL_COMMAND_ID = "notebook.cell.split";
const JOIN_SELECTED_CELLS_COMMAND_ID = "notebook.cell.joinSelected";
const JOIN_CELL_ABOVE_COMMAND_ID = "notebook.cell.joinAbove";
const JOIN_CELL_BELOW_COMMAND_ID = "notebook.cell.joinBelow";
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: SPLIT_CELL_COMMAND_ID,
        title: localize2("notebookActions.splitCell", "Split Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_EDITABLE,
            NOTEBOOK_CELL_EDITABLE,
            NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated()
          ),
          order: CellToolbarOrder.SplitCell,
          group: CELL_TITLE_CELL_GROUP_ID
        },
        icon: icons.splitCellIcon,
        keybinding: {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, EditorContextKeys.editorTextFocus),
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash),
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    if (context.notebookEditor.isReadOnly) {
      return;
    }
    const bulkEditService = accessor.get(IBulkEditService);
    const cell = context.cell;
    const index = context.notebookEditor.getCellIndex(cell);
    const splitPoints = cell.focusMode === CellFocusMode.Container ? [{ lineNumber: 1, column: 1 }] : cell.getSelectionsStartPosition();
    if (splitPoints && splitPoints.length > 0) {
      await cell.resolveTextModel();
      if (!cell.hasModel()) {
        return;
      }
      const newLinesContents = computeCellLinesContents(cell, splitPoints);
      if (newLinesContents) {
        const language = cell.language;
        const kind = cell.cellKind;
        const mime = cell.mime;
        const textModel = await cell.resolveTextModel();
        await bulkEditService.apply(
          [
            new ResourceTextEdit(cell.uri, { range: textModel.getFullModelRange(), text: newLinesContents[0] }),
            new ResourceNotebookCellEdit(
              context.notebookEditor.textModel.uri,
              {
                editType: CellEditType.Replace,
                index: index + 1,
                count: 0,
                cells: newLinesContents.slice(1).map((line) => ({
                  cellKind: kind,
                  language,
                  mime,
                  source: line,
                  outputs: [],
                  metadata: {}
                }))
              }
            )
          ],
          { quotableLabel: "Split Notebook Cell" }
        );
        context.notebookEditor.cellAt(index + 1)?.updateEditState(cell.getEditState(), "splitCell");
      }
    }
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: JOIN_CELL_ABOVE_COMMAND_ID,
        title: localize2("notebookActions.joinCellAbove", "Join With Previous Cell"),
        keybinding: {
          when: NOTEBOOK_EDITOR_FOCUSED,
          primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyJ,
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 10
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const bulkEditService = accessor.get(IBulkEditService);
    return joinCellsWithSurrounds(bulkEditService, context, "above");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: JOIN_CELL_BELOW_COMMAND_ID,
        title: localize2("notebookActions.joinCellBelow", "Join With Next Cell"),
        keybinding: {
          when: NOTEBOOK_EDITOR_FOCUSED,
          primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyJ,
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 11
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const bulkEditService = accessor.get(IBulkEditService);
    return joinCellsWithSurrounds(bulkEditService, context, "below");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: JOIN_SELECTED_CELLS_COMMAND_ID,
        title: localize2("notebookActions.joinSelectedCells", "Join Selected Cells"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 12
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const bulkEditService = accessor.get(IBulkEditService);
    const notificationService = accessor.get(INotificationService);
    return joinSelectedCells(bulkEditService, notificationService, context);
  }
});
const CHANGE_CELL_TO_CODE_COMMAND_ID = "notebook.cell.changeToCode";
const CHANGE_CELL_TO_MARKDOWN_COMMAND_ID = "notebook.cell.changeToMarkdown";
registerAction2(class ChangeCellToCodeAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: CHANGE_CELL_TO_CODE_COMMAND_ID,
      title: localize2("notebookActions.changeCellToCode", "Change Cell to Code"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_FOCUSED.toNegated()),
        primary: KeyCode.KeyY,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo("markup")),
      menu: {
        id: MenuId.NotebookCellTitle,
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo("markup")),
        group: CellOverflowToolbarGroups.Edit
      }
    });
  }
  async runWithContext(accessor, context) {
    await changeCellToKind(CellKind.Code, context);
  }
});
registerAction2(class ChangeCellToMarkdownAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: CHANGE_CELL_TO_MARKDOWN_COMMAND_ID,
      title: localize2("notebookActions.changeCellToMarkdown", "Change Cell to Markdown"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_FOCUSED.toNegated()),
        primary: KeyCode.KeyM,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo("code")),
      menu: {
        id: MenuId.NotebookCellTitle,
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo("code")),
        group: CellOverflowToolbarGroups.Edit
      }
    });
  }
  async runWithContext(accessor, context) {
    await changeCellToKind(CellKind.Markup, context, "markdown", Mimes.markdown);
  }
});
const COLLAPSE_CELL_INPUT_COMMAND_ID = "notebook.cell.collapseCellInput";
const COLLAPSE_CELL_OUTPUT_COMMAND_ID = "notebook.cell.collapseCellOutput";
const COLLAPSE_ALL_CELL_INPUTS_COMMAND_ID = "notebook.cell.collapseAllCellInputs";
const EXPAND_ALL_CELL_INPUTS_COMMAND_ID = "notebook.cell.expandAllCellInputs";
const COLLAPSE_ALL_CELL_OUTPUTS_COMMAND_ID = "notebook.cell.collapseAllCellOutputs";
const EXPAND_ALL_CELL_OUTPUTS_COMMAND_ID = "notebook.cell.expandAllCellOutputs";
const TOGGLE_CELL_OUTPUTS_COMMAND_ID = "notebook.cell.toggleOutputs";
const TOGGLE_CELL_OUTPUT_SCROLLING = "notebook.cell.toggleOutputScrolling";
registerAction2(class CollapseCellInputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_CELL_INPUT_COMMAND_ID,
      title: localize2("notebookActions.collapseCellInput", "Collapse Cell Input"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated()),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isInputCollapsed = true;
    } else {
      context.selectedCells.forEach((cell) => cell.isInputCollapsed = true);
    }
  }
});
registerAction2(class ExpandCellInputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_CELL_INPUT_COMMAND_ID,
      title: localize2("notebookActions.expandCellInput", "Expand Cell Input"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isInputCollapsed = false;
    } else {
      context.selectedCells.forEach((cell) => cell.isInputCollapsed = false);
    }
  }
});
registerAction2(class CollapseCellOutputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_CELL_OUTPUT_COMMAND_ID,
      title: localize2("notebookActions.collapseCellOutput", "Collapse Cell Output"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyT),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isOutputCollapsed = true;
    } else {
      context.selectedCells.forEach((cell) => cell.isOutputCollapsed = true);
    }
  }
});
registerAction2(class ExpandCellOuputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_CELL_OUTPUT_COMMAND_ID,
      title: localize2("notebookActions.expandCellOutput", "Expand Cell Output"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyT),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isOutputCollapsed = false;
    } else {
      context.selectedCells.forEach((cell) => cell.isOutputCollapsed = false);
    }
  }
});
registerAction2(class extends NotebookMultiCellAction {
  constructor() {
    super({
      id: TOGGLE_CELL_OUTPUTS_COMMAND_ID,
      precondition: NOTEBOOK_CELL_LIST_FOCUSED,
      title: localize2("notebookActions.toggleOutputs", "Toggle Outputs"),
      metadata: {
        description: localize("notebookActions.toggleOutputs", "Toggle Outputs"),
        args: cellExecutionArgs
      }
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    let cells = [];
    if (context.ui) {
      cells = [context.cell];
    } else if (context.selectedCells) {
      cells = context.selectedCells;
    }
    for (const cell of cells) {
      cell.isOutputCollapsed = !cell.isOutputCollapsed;
    }
  }
});
registerAction2(class CollapseAllCellInputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_ALL_CELL_INPUTS_COMMAND_ID,
      title: localize2("notebookActions.collapseAllCellInput", "Collapse All Cell Inputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isInputCollapsed = true);
  }
});
registerAction2(class ExpandAllCellInputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_ALL_CELL_INPUTS_COMMAND_ID,
      title: localize2("notebookActions.expandAllCellInput", "Expand All Cell Inputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isInputCollapsed = false);
  }
});
registerAction2(class CollapseAllCellOutputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_ALL_CELL_OUTPUTS_COMMAND_ID,
      title: localize2("notebookActions.collapseAllCellOutput", "Collapse All Cell Outputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isOutputCollapsed = true);
  }
});
registerAction2(class ExpandAllCellOutputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_ALL_CELL_OUTPUTS_COMMAND_ID,
      title: localize2("notebookActions.expandAllCellOutput", "Expand All Cell Outputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isOutputCollapsed = false);
  }
});
registerAction2(class ToggleCellOutputScrolling extends NotebookMultiCellAction {
  constructor() {
    super({
      id: TOGGLE_CELL_OUTPUT_SCROLLING,
      title: localize2("notebookActions.toggleScrolling", "Toggle Scroll Cell Output"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyY),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  toggleOutputScrolling(viewModel, globalScrollSetting, collapsed) {
    const cellMetadata = viewModel.model.metadata;
    if (cellMetadata) {
      const currentlyEnabled = cellMetadata["scrollable"] !== void 0 ? cellMetadata["scrollable"] : globalScrollSetting;
      const shouldEnableScrolling = collapsed || !currentlyEnabled;
      cellMetadata["scrollable"] = shouldEnableScrolling;
      viewModel.resetRenderer();
    }
  }
  async runWithContext(accessor, context) {
    const globalScrolling = accessor.get(IConfigurationService).getValue(NotebookSetting.outputScrolling);
    if (context.ui) {
      context.cell.outputsViewModels.forEach((viewModel) => {
        this.toggleOutputScrolling(viewModel, globalScrolling, context.cell.isOutputCollapsed);
      });
      context.cell.isOutputCollapsed = false;
    } else {
      context.selectedCells.forEach((cell) => {
        cell.outputsViewModels.forEach((viewModel) => {
          this.toggleOutputScrolling(viewModel, globalScrolling, cell.isOutputCollapsed);
        });
        cell.isOutputCollapsed = false;
      });
    }
  }
});
function forEachCell(editor, callback) {
  for (let i = 0; i < editor.getLength(); i++) {
    const cell = editor.cellAt(i);
    callback(cell, i);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9jZWxsQ29tbWFuZHMvY2VsbENvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0LCBJbnB1dEZvY3VzZWRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnVsa0VkaXQvYnJvd3Nlci9idWxrQ2VsbEVkaXRzLmpzJztcbmltcG9ydCB7IGNoYW5nZUNlbGxUb0tpbmQsIGNvbXB1dGVDZWxsTGluZXNDb250ZW50cywgY29weUNlbGxSYW5nZSwgam9pbkNlbGxzV2l0aFN1cnJvdW5kcywgam9pblNlbGVjdGVkQ2VsbHMsIG1vdmVDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL2NlbGxPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IGNlbGxFeGVjdXRpb25BcmdzLCBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLCBDZWxsVG9vbGJhck9yZGVyLCBDRUxMX1RJVExFX0NFTExfR1JPVVBfSUQsIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0LCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQsIElOb3RlYm9va0NvbW1hbmRDb250ZXh0LCBOb3RlYm9va0NlbGxBY3Rpb24sIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uLCBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MgfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENlbGxGb2N1c01vZGUsIEVYUEFORF9DRUxMX0lOUFVUX0NPTU1BTkRfSUQsIEVYUEFORF9DRUxMX09VVFBVVF9DT01NQU5EX0lELCBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19DRUxMX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0hBU19PVVRQVVRTLCBOT1RFQk9PS19DRUxMX0lOUFVUX0NPTExBUFNFRCwgTk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQsIE5PVEVCT09LX0NFTExfT1VUUFVUX0NPTExBUFNFRCwgTk9URUJPT0tfQ0VMTF9UWVBFLCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLCBOT1RFQk9PS19PVVRQVVRfRk9DVVNFRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4uLy4uL25vdGVib29rSWNvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBDZWxsS2luZCwgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG4vLyNyZWdpb24gTW92ZS9Db3B5IGNlbGxzXG5jb25zdCBNT1ZFX0NFTExfVVBfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLm1vdmVVcCc7XG5jb25zdCBNT1ZFX0NFTExfRE9XTl9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwubW92ZURvd24nO1xuY29uc3QgQ09QWV9DRUxMX1VQX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jb3B5VXAnO1xuY29uc3QgQ09QWV9DRUxMX0RPV05fQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmNvcHlEb3duJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNT1ZFX0NFTExfVVBfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLm1vdmVDZWxsVXAnLCBcIk1vdmUgQ2VsbCBVcFwiKSxcblx0XHRcdFx0aWNvbjogaWNvbnMubW92ZVVwSWNvbixcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBJbnB1dEZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5kcmFnQW5kRHJvcEVuYWJsZWQnLCBmYWxzZSksXG5cdFx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogMTRcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRyZXR1cm4gbW92ZUNlbGxSYW5nZShjb250ZXh0LCAndXAnKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTU9WRV9DRUxMX0RPV05fQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLm1vdmVDZWxsRG93bicsIFwiTW92ZSBDZWxsIERvd25cIiksXG5cdFx0XHRcdGljb246IGljb25zLm1vdmVEb3duSWNvbixcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIElucHV0Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLmRyYWdBbmREcm9wRW5hYmxlZCcsIGZhbHNlKSxcblx0XHRcdFx0XHRncm91cDogQ2VsbE92ZXJmbG93VG9vbGJhckdyb3Vwcy5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAxNFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdHJldHVybiBtb3ZlQ2VsbFJhbmdlKGNvbnRleHQsICdkb3duJyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IENPUFlfQ0VMTF9VUF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuY29weUNlbGxVcCcsIFwiQ29weSBDZWxsIFVwXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIElucHV0Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0cmV0dXJuIGNvcHlDZWxsUmFuZ2UoY29udGV4dCwgJ3VwJyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IENPUFlfQ0VMTF9ET1dOX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5jb3B5Q2VsbERvd24nLCBcIkNvcHkgQ2VsbCBEb3duXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfRURJVEFCTEUpLFxuXHRcdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDEzXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0cmV0dXJuIGNvcHlDZWxsUmFuZ2UoY29udGV4dCwgJ2Rvd24nKTtcblx0fVxufSk7XG5cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBKb2luL1NwbGl0XG5cbmNvbnN0IFNQTElUX0NFTExfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLnNwbGl0JztcbmNvbnN0IEpPSU5fU0VMRUNURURfQ0VMTFNfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmpvaW5TZWxlY3RlZCc7XG5jb25zdCBKT0lOX0NFTExfQUJPVkVfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmpvaW5BYm92ZSc7XG5jb25zdCBKT0lOX0NFTExfQkVMT1dfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmpvaW5CZWxvdyc7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBTUExJVF9DRUxMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5zcGxpdENlbGwnLCBcIlNwbGl0IENlbGxcIiksXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfRURJVEFCTEUsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0lOUFVUX0NPTExBUFNFRC50b05lZ2F0ZWQoKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0b3JkZXI6IENlbGxUb29sYmFyT3JkZXIuU3BsaXRDZWxsLFxuXHRcdFx0XHRcdGdyb3VwOiBDRUxMX1RJVExFX0NFTExfR1JPVVBfSURcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjogaWNvbnMuc3BsaXRDZWxsSWNvbixcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0VESVRBQkxFLCBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NsYXNoKSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRpZiAoY29udGV4dC5ub3RlYm9va0VkaXRvci5pc1JlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNlbGwgPSBjb250ZXh0LmNlbGw7XG5cdFx0Y29uc3QgaW5kZXggPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChjZWxsKTtcblx0XHRjb25zdCBzcGxpdFBvaW50cyA9IGNlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkNvbnRhaW5lciA/IFt7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9XSA6IGNlbGwuZ2V0U2VsZWN0aW9uc1N0YXJ0UG9zaXRpb24oKTtcblx0XHRpZiAoc3BsaXRQb2ludHMgJiYgc3BsaXRQb2ludHMubGVuZ3RoID4gMCkge1xuXHRcdFx0YXdhaXQgY2VsbC5yZXNvbHZlVGV4dE1vZGVsKCk7XG5cblx0XHRcdGlmICghY2VsbC5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3TGluZXNDb250ZW50cyA9IGNvbXB1dGVDZWxsTGluZXNDb250ZW50cyhjZWxsLCBzcGxpdFBvaW50cyk7XG5cdFx0XHRpZiAobmV3TGluZXNDb250ZW50cykge1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZSA9IGNlbGwubGFuZ3VhZ2U7XG5cdFx0XHRcdGNvbnN0IGtpbmQgPSBjZWxsLmNlbGxLaW5kO1xuXHRcdFx0XHRjb25zdCBtaW1lID0gY2VsbC5taW1lO1xuXG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGF3YWl0IGNlbGwucmVzb2x2ZVRleHRNb2RlbCgpO1xuXHRcdFx0XHRhd2FpdCBidWxrRWRpdFNlcnZpY2UuYXBwbHkoXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0bmV3IFJlc291cmNlVGV4dEVkaXQoY2VsbC51cmksIHsgcmFuZ2U6IHRleHRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB0ZXh0OiBuZXdMaW5lc0NvbnRlbnRzWzBdIH0pLFxuXHRcdFx0XHRcdFx0bmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChjb250ZXh0Lm5vdGVib29rRWRpdG9yLnRleHRNb2RlbC51cmksXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IGluZGV4ICsgMSxcblx0XHRcdFx0XHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0XHRcdFx0XHRjZWxsczogbmV3TGluZXNDb250ZW50cy5zbGljZSgxKS5tYXAobGluZSA9PiAoe1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2VsbEtpbmQ6IGtpbmQsXG5cdFx0XHRcdFx0XHRcdFx0XHRsYW5ndWFnZSxcblx0XHRcdFx0XHRcdFx0XHRcdG1pbWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRzb3VyY2U6IGxpbmUsXG5cdFx0XHRcdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fVxuXHRcdFx0XHRcdFx0XHRcdH0pKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR7IHF1b3RhYmxlTGFiZWw6ICdTcGxpdCBOb3RlYm9vayBDZWxsJyB9XG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Y29udGV4dC5ub3RlYm9va0VkaXRvci5jZWxsQXQoaW5kZXggKyAxKT8udXBkYXRlRWRpdFN0YXRlKGNlbGwuZ2V0RWRpdFN0YXRlKCksICdzcGxpdENlbGwnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogSk9JTl9DRUxMX0FCT1ZFX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5qb2luQ2VsbEFib3ZlJywgXCJKb2luIFdpdGggUHJldmlvdXMgQ2VsbFwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdoZW46IE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Sixcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSksXG5cdFx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRjb25zdCBidWxrRWRpdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUJ1bGtFZGl0U2VydmljZSk7XG5cdFx0cmV0dXJuIGpvaW5DZWxsc1dpdGhTdXJyb3VuZHMoYnVsa0VkaXRTZXJ2aWNlLCBjb250ZXh0LCAnYWJvdmUnKTtcblx0fVxufSk7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBKT0lOX0NFTExfQkVMT1dfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmpvaW5DZWxsQmVsb3cnLCBcIkpvaW4gV2l0aCBOZXh0IENlbGxcIiksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3aGVuOiBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUosXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUpLFxuXHRcdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDExXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdHJldHVybiBqb2luQ2VsbHNXaXRoU3Vycm91bmRzKGJ1bGtFZGl0U2VydmljZSwgY29udGV4dCwgJ2JlbG93Jyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IEpPSU5fU0VMRUNURURfQ0VMTFNfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmpvaW5TZWxlY3RlZENlbGxzJywgXCJKb2luIFNlbGVjdGVkIENlbGxzXCIpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSksXG5cdFx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogMTJcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRjb25zdCBidWxrRWRpdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUJ1bGtFZGl0U2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIGpvaW5TZWxlY3RlZENlbGxzKGJ1bGtFZGl0U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgY29udGV4dCk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIENoYW5nZSBDZWxsIFR5cGVcblxuY29uc3QgQ0hBTkdFX0NFTExfVE9fQ09ERV9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY2hhbmdlVG9Db2RlJztcbmNvbnN0IENIQU5HRV9DRUxMX1RPX01BUktET1dOX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jaGFuZ2VUb01hcmtkb3duJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENoYW5nZUNlbGxUb0NvZGVBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDSEFOR0VfQ0VMTF9UT19DT0RFX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuY2hhbmdlQ2VsbFRvQ29kZScsIFwiQ2hhbmdlIENlbGwgdG8gQ29kZVwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksIE5PVEVCT09LX09VVFBVVF9GT0NVU0VELnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5LZXlZLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX0NFTExfVFlQRS5pc0VxdWFsVG8oJ21hcmt1cCcpKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfVFlQRS5pc0VxdWFsVG8oJ21hcmt1cCcpKSxcblx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuRWRpdCxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNoYW5nZUNlbGxUb0tpbmQoQ2VsbEtpbmQuQ29kZSwgY29udGV4dCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2hhbmdlQ2VsbFRvTWFya2Rvd25BY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDSEFOR0VfQ0VMTF9UT19NQVJLRE9XTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmNoYW5nZUNlbGxUb01hcmtkb3duJywgXCJDaGFuZ2UgQ2VsbCB0byBNYXJrZG93blwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksIE5PVEVCT09LX09VVFBVVF9GT0NVU0VELnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5LZXlNLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX0NFTExfVFlQRS5pc0VxdWFsVG8oJ2NvZGUnKSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdjb2RlJykpLFxuXHRcdFx0XHRncm91cDogQ2VsbE92ZXJmbG93VG9vbGJhckdyb3Vwcy5FZGl0LFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY2hhbmdlQ2VsbFRvS2luZChDZWxsS2luZC5NYXJrdXAsIGNvbnRleHQsICdtYXJrZG93bicsIE1pbWVzLm1hcmtkb3duKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQ29sbGFwc2UgQ2VsbFxuXG5jb25zdCBDT0xMQVBTRV9DRUxMX0lOUFVUX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jb2xsYXBzZUNlbGxJbnB1dCc7XG5jb25zdCBDT0xMQVBTRV9DRUxMX09VVFBVVF9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY29sbGFwc2VDZWxsT3V0cHV0JztcbmNvbnN0IENPTExBUFNFX0FMTF9DRUxMX0lOUFVUU19DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY29sbGFwc2VBbGxDZWxsSW5wdXRzJztcbmNvbnN0IEVYUEFORF9BTExfQ0VMTF9JTlBVVFNfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmV4cGFuZEFsbENlbGxJbnB1dHMnO1xuY29uc3QgQ09MTEFQU0VfQUxMX0NFTExfT1VUUFVUU19DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY29sbGFwc2VBbGxDZWxsT3V0cHV0cyc7XG5jb25zdCBFWFBBTkRfQUxMX0NFTExfT1VUUFVUU19DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuZXhwYW5kQWxsQ2VsbE91dHB1dHMnO1xuY29uc3QgVE9HR0xFX0NFTExfT1VUUFVUU19DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwudG9nZ2xlT3V0cHV0cyc7XG5jb25zdCBUT0dHTEVfQ0VMTF9PVVRQVVRfU0NST0xMSU5HID0gJ25vdGVib29rLmNlbGwudG9nZ2xlT3V0cHV0U2Nyb2xsaW5nJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbGxhcHNlQ2VsbElucHV0QWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09MTEFQU0VfQ0VMTF9JTlBVVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmNvbGxhcHNlQ2VsbElucHV0JywgXCJDb2xsYXBzZSBDZWxsIElucHV0XCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQsIE5PVEVCT09LX0NFTExfSU5QVVRfQ09MTEFQU0VELnRvTmVnYXRlZCgpLCBJbnB1dEZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHBhcnNlQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRcdGNvbnRleHQuY2VsbC5pc0lucHV0Q29sbGFwc2VkID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGV4dC5zZWxlY3RlZENlbGxzLmZvckVhY2goY2VsbCA9PiBjZWxsLmlzSW5wdXRDb2xsYXBzZWQgPSB0cnVlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhwYW5kQ2VsbElucHV0QWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRVhQQU5EX0NFTExfSU5QVVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5leHBhbmRDZWxsSW5wdXQnLCBcIkV4cGFuZCBDZWxsIElucHV0XCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQsIE5PVEVCT09LX0NFTExfSU5QVVRfQ09MTEFQU0VEKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHBhcnNlQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRcdGNvbnRleHQuY2VsbC5pc0lucHV0Q29sbGFwc2VkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRleHQuc2VsZWN0ZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4gY2VsbC5pc0lucHV0Q29sbGFwc2VkID0gZmFsc2UpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb2xsYXBzZUNlbGxPdXRwdXRBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDT0xMQVBTRV9DRUxMX09VVFBVVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmNvbGxhcHNlQ2VsbE91dHB1dCcsIFwiQ29sbGFwc2UgQ2VsbCBPdXRwdXRcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCwgTk9URUJPT0tfQ0VMTF9PVVRQVVRfQ09MTEFQU0VELnRvTmVnYXRlZCgpLCBJbnB1dEZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpLCBOT1RFQk9PS19DRUxMX0hBU19PVVRQVVRTKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5VCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29udGV4dC51aSkge1xuXHRcdFx0Y29udGV4dC5jZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGV4dC5zZWxlY3RlZENlbGxzLmZvckVhY2goY2VsbCA9PiBjZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4cGFuZENlbGxPdXB1dEFjdGlvbiBleHRlbmRzIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVYUEFORF9DRUxMX09VVFBVVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmV4cGFuZENlbGxPdXRwdXQnLCBcIkV4cGFuZCBDZWxsIE91dHB1dFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBOT1RFQk9PS19DRUxMX09VVFBVVF9DT0xMQVBTRUQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlUKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0LnVpKSB7XG5cdFx0XHRjb250ZXh0LmNlbGwuaXNPdXRwdXRDb2xsYXBzZWQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGV4dC5zZWxlY3RlZENlbGxzLmZvckVhY2goY2VsbCA9PiBjZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gZmFsc2UpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRPR0dMRV9DRUxMX09VVFBVVFNfQ09NTUFORF9JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogTk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMudG9nZ2xlT3V0cHV0cycsIFwiVG9nZ2xlIE91dHB1dHNcIiksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy50b2dnbGVPdXRwdXRzJywgXCJUb2dnbGUgT3V0cHV0c1wiKSxcblx0XHRcdFx0YXJnczogY2VsbEV4ZWN1dGlvbkFyZ3Ncblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHBhcnNlQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGNlbGxzOiByZWFkb25seSBJQ2VsbFZpZXdNb2RlbFtdID0gW107XG5cdFx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRcdGNlbGxzID0gW2NvbnRleHQuY2VsbF07XG5cdFx0fSBlbHNlIGlmIChjb250ZXh0LnNlbGVjdGVkQ2VsbHMpIHtcblx0XHRcdGNlbGxzID0gY29udGV4dC5zZWxlY3RlZENlbGxzO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0Y2VsbC5pc091dHB1dENvbGxhcHNlZCA9ICFjZWxsLmlzT3V0cHV0Q29sbGFwc2VkO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb2xsYXBzZUFsbENlbGxJbnB1dHNBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDT0xMQVBTRV9BTExfQ0VMTF9JTlBVVFNfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5jb2xsYXBzZUFsbENlbGxJbnB1dCcsIFwiQ29sbGFwc2UgQWxsIENlbGwgSW5wdXRzXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3JFYWNoQ2VsbChjb250ZXh0Lm5vdGVib29rRWRpdG9yLCBjZWxsID0+IGNlbGwuaXNJbnB1dENvbGxhcHNlZCA9IHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4cGFuZEFsbENlbGxJbnB1dHNBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFWFBBTkRfQUxMX0NFTExfSU5QVVRTX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuZXhwYW5kQWxsQ2VsbElucHV0JywgXCJFeHBhbmQgQWxsIENlbGwgSW5wdXRzXCIpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvckVhY2hDZWxsKGNvbnRleHQubm90ZWJvb2tFZGl0b3IsIGNlbGwgPT4gY2VsbC5pc0lucHV0Q29sbGFwc2VkID0gZmFsc2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbGxhcHNlQWxsQ2VsbE91dHB1dHNBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDT0xMQVBTRV9BTExfQ0VMTF9PVVRQVVRTX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuY29sbGFwc2VBbGxDZWxsT3V0cHV0JywgXCJDb2xsYXBzZSBBbGwgQ2VsbCBPdXRwdXRzXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3JFYWNoQ2VsbChjb250ZXh0Lm5vdGVib29rRWRpdG9yLCBjZWxsID0+IGNlbGwuaXNPdXRwdXRDb2xsYXBzZWQgPSB0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFeHBhbmRBbGxDZWxsT3V0cHV0c0FjdGlvbiBleHRlbmRzIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVYUEFORF9BTExfQ0VMTF9PVVRQVVRTX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuZXhwYW5kQWxsQ2VsbE91dHB1dCcsIFwiRXhwYW5kIEFsbCBDZWxsIE91dHB1dHNcIiksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yRWFjaENlbGwoY29udGV4dC5ub3RlYm9va0VkaXRvciwgY2VsbCA9PiBjZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gZmFsc2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZUNlbGxPdXRwdXRTY3JvbGxpbmcgZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUT0dHTEVfQ0VMTF9PVVRQVVRfU0NST0xMSU5HLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLnRvZ2dsZVNjcm9sbGluZycsIFwiVG9nZ2xlIFNjcm9sbCBDZWxsIE91dHB1dFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBJbnB1dEZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpLCBOT1RFQk9PS19DRUxMX0hBU19PVVRQVVRTKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5WSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZU91dHB1dFNjcm9sbGluZyh2aWV3TW9kZWw6IElDZWxsT3V0cHV0Vmlld01vZGVsLCBnbG9iYWxTY3JvbGxTZXR0aW5nOiBib29sZWFuLCBjb2xsYXBzZWQ6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBjZWxsTWV0YWRhdGEgPSB2aWV3TW9kZWwubW9kZWwubWV0YWRhdGE7XG5cdFx0Ly8gVE9ETzogd2hlbiBpcyBjZWxsTWV0YWRhdGEgdW5kZWZpbmVkPyBJcyB0aGF0IGEgY2FzZSB3ZSBuZWVkIHRvIHN1cHBvcnQ/IEl0IGlzIGN1cnJlbnRseSBhIHJlYWQtb25seSBwcm9wZXJ0eS5cblx0XHRpZiAoY2VsbE1ldGFkYXRhKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50bHlFbmFibGVkID0gY2VsbE1ldGFkYXRhWydzY3JvbGxhYmxlJ10gIT09IHVuZGVmaW5lZCA/IGNlbGxNZXRhZGF0YVsnc2Nyb2xsYWJsZSddIDogZ2xvYmFsU2Nyb2xsU2V0dGluZztcblx0XHRcdGNvbnN0IHNob3VsZEVuYWJsZVNjcm9sbGluZyA9IGNvbGxhcHNlZCB8fCAhY3VycmVudGx5RW5hYmxlZDtcblx0XHRcdGNlbGxNZXRhZGF0YVsnc2Nyb2xsYWJsZSddID0gc2hvdWxkRW5hYmxlU2Nyb2xsaW5nO1xuXHRcdFx0dmlld01vZGVsLnJlc2V0UmVuZGVyZXIoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBnbG9iYWxTY3JvbGxpbmcgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0cHV0U2Nyb2xsaW5nKTtcblx0XHRpZiAoY29udGV4dC51aSkge1xuXHRcdFx0Y29udGV4dC5jZWxsLm91dHB1dHNWaWV3TW9kZWxzLmZvckVhY2goKHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHR0aGlzLnRvZ2dsZU91dHB1dFNjcm9sbGluZyh2aWV3TW9kZWwsIGdsb2JhbFNjcm9sbGluZywgY29udGV4dC5jZWxsLmlzT3V0cHV0Q29sbGFwc2VkKTtcblx0XHRcdH0pO1xuXHRcdFx0Y29udGV4dC5jZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRleHQuc2VsZWN0ZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0XHRjZWxsLm91dHB1dHNWaWV3TW9kZWxzLmZvckVhY2goKHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlT3V0cHV0U2Nyb2xsaW5nKHZpZXdNb2RlbCwgZ2xvYmFsU2Nyb2xsaW5nLCBjZWxsLmlzT3V0cHV0Q29sbGFwc2VkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNlbGwuaXNPdXRwdXRDb2xsYXBzZWQgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG5mdW5jdGlvbiBmb3JFYWNoQ2VsbChlZGl0b3I6IElOb3RlYm9va0VkaXRvciwgY2FsbGJhY2s6IChjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgaW5kZXg6IG51bWJlcikgPT4gdm9pZCkge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGVkaXRvci5nZXRMZW5ndGgoKTsgaSsrKSB7XG5cdFx0Y29uc3QgY2VsbCA9IGVkaXRvci5jZWxsQXQoaSk7XG5cdFx0Y2FsbGJhY2soY2VsbCEsIGkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFr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
