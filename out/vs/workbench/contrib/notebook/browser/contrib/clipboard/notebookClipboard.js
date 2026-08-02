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
import { localize, localize2 } from "../../../../../../nls.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED } from "../../../common/notebookContextKeys.js";
import { cellRangeToViewCells, expandCellRangesWithHiddenCells, getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { CopyAction, CutAction, PasteAction } from "../../../../../../editor/contrib/clipboard/browser/clipboard.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { cloneNotebookCellTextModel } from "../../../common/model/notebookCellTextModel.js";
import { CellEditType, SelectionStateType } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import * as platform from "../../../../../../base/common/platform.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { CellOverflowToolbarGroups, NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT } from "../../controller/coreActions.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContextKey } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { RedoCommand, UndoCommand } from "../../../../../../editor/browser/editorExtensions.js";
import { Categories } from "../../../../../../platform/action/common/actionCommonCategories.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { showWindowLogActionId } from "../../../../../services/log/common/logConstants.js";
import { getActiveElement, getWindow, isEditableElement, isHTMLElement } from "../../../../../../base/browser/dom.js";
let _logging = false;
function toggleLogging() {
  _logging = !_logging;
}
function _log(loggerService, str) {
  if (_logging) {
    loggerService.info(`[NotebookClipboard]: ${str}`);
  }
}
function getFocusedEditor(accessor) {
  const loggerService = accessor.get(ILogService);
  const editorService = accessor.get(IEditorService);
  const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
  if (!editor) {
    _log(loggerService, "[Revive Webview] No notebook editor found for active editor pane, bypass");
    return;
  }
  if (!editor.hasEditorFocus()) {
    _log(loggerService, "[Revive Webview] Notebook editor is not focused, bypass");
    return;
  }
  if (!editor.hasWebviewFocus()) {
    _log(loggerService, "[Revive Webview] Notebook editor backlayer webview is not focused, bypass");
    return;
  }
  const view = editor.getViewModel();
  if (view && view.viewCells.every((cell) => !cell.outputIsFocused && !cell.outputIsHovered)) {
    return;
  }
  return { editor, loggerService };
}
function getFocusedWebviewDelegate(accessor) {
  const result = getFocusedEditor(accessor);
  if (!result) {
    return;
  }
  const webview = result.editor.getInnerWebview();
  _log(result.loggerService, "[Revive Webview] Notebook editor backlayer webview is focused");
  return webview;
}
function withWebview(accessor, f) {
  const webview = getFocusedWebviewDelegate(accessor);
  if (webview) {
    f(webview);
    return true;
  }
  return false;
}
function withEditor(accessor, f) {
  const result = getFocusedEditor(accessor);
  return result ? f(result.editor) : false;
}
const PRIORITY = 105;
UndoCommand.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.undo());
});
RedoCommand.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.redo());
});
CopyAction?.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.copy());
});
PasteAction?.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.paste());
});
CutAction?.addImplementation(PRIORITY, "notebook-webview", (accessor) => {
  return withWebview(accessor, (webview) => webview.cut());
});
function runPasteCells(editor, activeCell, pasteCells) {
  if (!editor.hasModel()) {
    return false;
  }
  const textModel = editor.textModel;
  if (editor.isReadOnly) {
    return false;
  }
  const originalState = {
    kind: SelectionStateType.Index,
    focus: editor.getFocus(),
    selections: editor.getSelections()
  };
  if (activeCell) {
    const currCellIndex = editor.getCellIndex(activeCell);
    const newFocusIndex = typeof currCellIndex === "number" ? currCellIndex + 1 : 0;
    textModel.applyEdits([
      {
        editType: CellEditType.Replace,
        index: newFocusIndex,
        count: 0,
        cells: pasteCells.items.map((cell) => cloneNotebookCellTextModel(cell))
      }
    ], true, originalState, () => ({
      kind: SelectionStateType.Index,
      focus: { start: newFocusIndex, end: newFocusIndex + 1 },
      selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
    }), void 0, true);
  } else {
    if (editor.getLength() !== 0) {
      return false;
    }
    textModel.applyEdits([
      {
        editType: CellEditType.Replace,
        index: 0,
        count: 0,
        cells: pasteCells.items.map((cell) => cloneNotebookCellTextModel(cell))
      }
    ], true, originalState, () => ({
      kind: SelectionStateType.Index,
      focus: { start: 0, end: 1 },
      selections: [{ start: 1, end: pasteCells.items.length + 1 }]
    }), void 0, true);
  }
  return true;
}
function runCopyCells(accessor, editor, targetCell) {
  if (!editor.hasModel()) {
    return false;
  }
  if (editor.hasOutputTextSelection()) {
    getWindow(editor.getDomNode()).document.execCommand("copy");
    return true;
  }
  const clipboardService = accessor.get(IClipboardService);
  const notebookService = accessor.get(INotebookService);
  const selections = editor.getSelections();
  if (targetCell) {
    const targetCellIndex = editor.getCellIndex(targetCell);
    const containingSelection = selections.find((selection) => selection.start <= targetCellIndex && targetCellIndex < selection.end);
    if (!containingSelection) {
      clipboardService.writeText(targetCell.getText());
      notebookService.setToCopy([targetCell.model], true);
      return true;
    }
  }
  const selectionRanges = expandCellRangesWithHiddenCells(editor, editor.getSelections());
  const selectedCells = cellRangeToViewCells(editor, selectionRanges);
  if (!selectedCells.length) {
    return false;
  }
  clipboardService.writeText(selectedCells.map((cell) => cell.getText()).join("\n"));
  notebookService.setToCopy(selectedCells.map((cell) => cell.model), true);
  return true;
}
function runCutCells(accessor, editor, targetCell) {
  if (!editor.hasModel() || editor.isReadOnly) {
    return false;
  }
  const textModel = editor.textModel;
  const clipboardService = accessor.get(IClipboardService);
  const notebookService = accessor.get(INotebookService);
  const selections = editor.getSelections();
  if (targetCell) {
    const targetCellIndex = editor.getCellIndex(targetCell);
    const containingSelection2 = selections.find((selection) => selection.start <= targetCellIndex && targetCellIndex < selection.end);
    if (!containingSelection2) {
      clipboardService.writeText(targetCell.getText());
      const focus2 = editor.getFocus();
      const newFocus = focus2.end <= targetCellIndex ? focus2 : { start: focus2.start - 1, end: focus2.end - 1 };
      const newSelections = selections.map((selection) => selection.end <= targetCellIndex ? selection : { start: selection.start - 1, end: selection.end - 1 });
      textModel.applyEdits([
        { editType: CellEditType.Replace, index: targetCellIndex, count: 1, cells: [] }
      ], true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }), void 0, true);
      notebookService.setToCopy([targetCell.model], false);
      return true;
    }
  }
  const focus = editor.getFocus();
  const containingSelection = selections.find((selection) => selection.start <= focus.start && focus.end <= selection.end);
  if (!containingSelection) {
    const targetCell2 = editor.cellAt(focus.start);
    clipboardService.writeText(targetCell2.getText());
    const newFocus = focus.end === editor.getLength() ? { start: focus.start - 1, end: focus.end - 1 } : focus;
    const newSelections = selections.map((selection) => selection.end <= focus.start ? selection : { start: selection.start - 1, end: selection.end - 1 });
    textModel.applyEdits([
      { editType: CellEditType.Replace, index: focus.start, count: 1, cells: [] }
    ], true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections }, () => ({ kind: SelectionStateType.Index, focus: newFocus, selections: newSelections }), void 0, true);
    notebookService.setToCopy([targetCell2.model], false);
    return true;
  }
  const selectionRanges = expandCellRangesWithHiddenCells(editor, editor.getSelections());
  const selectedCells = cellRangeToViewCells(editor, selectionRanges);
  if (!selectedCells.length) {
    return false;
  }
  clipboardService.writeText(selectedCells.map((cell) => cell.getText()).join("\n"));
  const edits = selectionRanges.map((range) => ({ editType: CellEditType.Replace, index: range.start, count: range.end - range.start, cells: [] }));
  const firstSelectIndex = selectionRanges[0].start;
  const newFocusedCellIndex = firstSelectIndex < textModel.cells.length - 1 ? firstSelectIndex : Math.max(textModel.cells.length - 2, 0);
  textModel.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: selectionRanges }, () => {
    return {
      kind: SelectionStateType.Index,
      focus: { start: newFocusedCellIndex, end: newFocusedCellIndex + 1 },
      selections: [{ start: newFocusedCellIndex, end: newFocusedCellIndex + 1 }]
    };
  }, void 0, true);
  notebookService.setToCopy(selectedCells.map((cell) => cell.model), false);
  return true;
}
let NotebookClipboardContribution = class extends Disposable {
  constructor(_editorService) {
    super();
    this._editorService = _editorService;
    const PRIORITY2 = 105;
    if (CopyAction) {
      this._register(CopyAction.addImplementation(PRIORITY2, "notebook-clipboard", (accessor) => {
        return this.runCopyAction(accessor);
      }));
    }
    if (PasteAction) {
      this._register(PasteAction.addImplementation(PRIORITY2, "notebook-clipboard", (accessor) => {
        return this.runPasteAction(accessor);
      }));
    }
    if (CutAction) {
      this._register(CutAction.addImplementation(PRIORITY2, "notebook-clipboard", (accessor) => {
        return this.runCutAction(accessor);
      }));
    }
  }
  _getContext() {
    const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    const activeCell = editor?.getActiveCell();
    return {
      editor,
      activeCell
    };
  }
  _focusInsideEmebedMonaco(editor) {
    const windowSelection = getWindow(editor.getDomNode()).getSelection();
    if (windowSelection?.rangeCount !== 1) {
      return false;
    }
    const activeSelection = windowSelection.getRangeAt(0);
    if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
      return false;
    }
    let container = activeSelection.commonAncestorContainer;
    const body = editor.getDomNode();
    if (!body.contains(container)) {
      return false;
    }
    while (container && container !== body) {
      if (container.classList && container.classList.contains("monaco-editor")) {
        return true;
      }
      container = container.parentNode;
    }
    return false;
  }
  runCopyAction(accessor) {
    const loggerService = accessor.get(ILogService);
    const activeElement = getActiveElement();
    if (isHTMLElement(activeElement) && isEditableElement(activeElement)) {
      _log(loggerService, "[NotebookEditor] focus is on input or textarea element, bypass");
      return false;
    }
    const { editor } = this._getContext();
    if (!editor) {
      _log(loggerService, "[NotebookEditor] no active notebook editor, bypass");
      return false;
    }
    if (!editor.hasEditorFocus()) {
      _log(loggerService, "[NotebookEditor] focus is outside of the notebook editor, bypass");
      return false;
    }
    if (this._focusInsideEmebedMonaco(editor)) {
      _log(loggerService, "[NotebookEditor] focus is on embed monaco editor, bypass");
      return false;
    }
    _log(loggerService, "[NotebookEditor] run copy actions on notebook model");
    return runCopyCells(accessor, editor, void 0);
  }
  runPasteAction(accessor) {
    const activeElement = getActiveElement();
    if (activeElement && isEditableElement(activeElement)) {
      return false;
    }
    const { editor, activeCell } = this._getContext();
    if (!editor || !editor.hasEditorFocus() || this._focusInsideEmebedMonaco(editor)) {
      return false;
    }
    const notebookService = accessor.get(INotebookService);
    const pasteCells = notebookService.getToCopy();
    if (!pasteCells) {
      return false;
    }
    return runPasteCells(editor, activeCell, pasteCells);
  }
  runCutAction(accessor) {
    const activeElement = getActiveElement();
    if (activeElement && isEditableElement(activeElement)) {
      return false;
    }
    const { editor } = this._getContext();
    if (!editor || !editor.hasEditorFocus() || this._focusInsideEmebedMonaco(editor)) {
      return false;
    }
    return runCutCells(accessor, editor, void 0);
  }
};
NotebookClipboardContribution.ID = "workbench.contrib.notebookClipboard";
NotebookClipboardContribution = __decorateClass([
  __decorateParam(0, IEditorService)
], NotebookClipboardContribution);
registerWorkbenchContribution2(NotebookClipboardContribution.ID, NotebookClipboardContribution, WorkbenchPhase.BlockRestore);
const COPY_CELL_COMMAND_ID = "notebook.cell.copy";
const CUT_CELL_COMMAND_ID = "notebook.cell.cut";
const PASTE_CELL_COMMAND_ID = "notebook.cell.paste";
const PASTE_CELL_ABOVE_COMMAND_ID = "notebook.cell.pasteAbove";
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: COPY_CELL_COMMAND_ID,
        title: localize("notebookActions.copy", "Copy Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: NOTEBOOK_EDITOR_FOCUSED,
          group: CellOverflowToolbarGroups.Copy,
          order: 2
        },
        keybinding: platform.isNative ? void 0 : {
          primary: KeyMod.CtrlCmd | KeyCode.KeyC,
          win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] },
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    runCopyCells(accessor, context.notebookEditor, context.cell);
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: CUT_CELL_COMMAND_ID,
        title: localize("notebookActions.cut", "Cut Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
          group: CellOverflowToolbarGroups.Copy,
          order: 1
        },
        keybinding: platform.isNative ? void 0 : {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.KeyX,
          win: { primary: KeyMod.CtrlCmd | KeyCode.KeyX, secondary: [KeyMod.Shift | KeyCode.Delete] },
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    runCutCells(accessor, context.notebookEditor, context.cell);
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super(
      {
        id: PASTE_CELL_COMMAND_ID,
        title: localize("notebookActions.paste", "Paste Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Copy,
          order: 3
        },
        keybinding: platform.isNative ? void 0 : {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.KeyV,
          win: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
          linux: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
          weight: KeybindingWeight.EditorContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const notebookService = accessor.get(INotebookService);
    const pasteCells = notebookService.getToCopy();
    if (!context.notebookEditor.hasModel() || context.notebookEditor.isReadOnly) {
      return;
    }
    if (!pasteCells) {
      return;
    }
    runPasteCells(context.notebookEditor, context.cell, pasteCells);
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: PASTE_CELL_ABOVE_COMMAND_ID,
        title: localize("notebookActions.pasteAbove", "Paste Cell Above"),
        keybinding: {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const notebookService = accessor.get(INotebookService);
    const pasteCells = notebookService.getToCopy();
    const editor = context.notebookEditor;
    const textModel = editor.textModel;
    if (editor.isReadOnly) {
      return;
    }
    if (!pasteCells) {
      return;
    }
    const originalState = {
      kind: SelectionStateType.Index,
      focus: editor.getFocus(),
      selections: editor.getSelections()
    };
    const currCellIndex = context.notebookEditor.getCellIndex(context.cell);
    const newFocusIndex = currCellIndex;
    textModel.applyEdits([
      {
        editType: CellEditType.Replace,
        index: currCellIndex,
        count: 0,
        cells: pasteCells.items.map((cell) => cloneNotebookCellTextModel(cell))
      }
    ], true, originalState, () => ({
      kind: SelectionStateType.Index,
      focus: { start: newFocusIndex, end: newFocusIndex + 1 },
      selections: [{ start: newFocusIndex, end: newFocusIndex + pasteCells.items.length }]
    }), void 0, true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleNotebookClipboardLog",
      title: localize2("toggleNotebookClipboardLog", "Toggle Notebook Clipboard Troubleshooting"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    toggleLogging();
    if (_logging) {
      const commandService = accessor.get(ICommandService);
      commandService.executeCommand(showWindowLogActionId);
    }
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: "notebook.cell.output.selectAll",
        title: localize("notebook.cell.output.selectAll", "Select All"),
        keybinding: {
          primary: KeyMod.CtrlCmd | KeyCode.KeyA,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
          weight: NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT
        }
      }
    );
  }
  async runWithContext(accessor, _context) {
    withEditor(accessor, (editor) => {
      if (!editor.hasEditorFocus()) {
        return false;
      }
      if (editor.hasEditorFocus() && !editor.hasWebviewFocus()) {
        return true;
      }
      const cell = editor.getActiveCell();
      if (!cell || !cell.outputIsFocused || !editor.hasWebviewFocus()) {
        return true;
      }
      if (cell.inputInOutputIsFocused) {
        editor.selectInputContents(cell);
      } else {
        editor.selectOutputContent(cell);
      }
      return true;
    });
  }
});
export {
  NotebookClipboardContribution,
  runCopyCells,
  runCutCells,
  runPasteCells
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9jbGlwYm9hcmQvbm90ZWJvb2tDbGlwYm9hcmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NFTExfRURJVEFCTEUsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX09VVFBVVF9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgY2VsbFJhbmdlVG9WaWV3Q2VsbHMsIGV4cGFuZENlbGxSYW5nZXNXaXRoSGlkZGVuQ2VsbHMsIGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUsIElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ29weUFjdGlvbiwgQ3V0QWN0aW9uLCBQYXN0ZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NsaXBib2FyZC9icm93c2VyL2NsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjbG9uZU5vdGVib29rQ2VsbFRleHRNb2RlbCwgTm90ZWJvb2tDZWxsVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rQ2VsbFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIElDZWxsRWRpdE9wZXJhdGlvbiwgSVNlbGVjdGlvblN0YXRlLCBTZWxlY3Rpb25TdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMsIElOb3RlYm9va0FjdGlvbkNvbnRleHQsIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0LCBOb3RlYm9va0FjdGlvbiwgTm90ZWJvb2tDZWxsQWN0aW9uLCBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQsIE5PVEVCT09LX09VVFBVVF9XRUJWSUVXX0FDVElPTl9XRUlHSFQgfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgUmVkb0NvbW1hbmQsIFVuZG9Db21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV2VidmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgc2hvd1dpbmRvd0xvZ0FjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbG9nL2NvbW1vbi9sb2dDb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRWxlbWVudCwgZ2V0V2luZG93LCBpc0VkaXRhYmxlRWxlbWVudCwgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5sZXQgX2xvZ2dpbmc6IGJvb2xlYW4gPSBmYWxzZTtcbmZ1bmN0aW9uIHRvZ2dsZUxvZ2dpbmcoKSB7XG5cdF9sb2dnaW5nID0gIV9sb2dnaW5nO1xufVxuXG5mdW5jdGlvbiBfbG9nKGxvZ2dlclNlcnZpY2U6IElMb2dTZXJ2aWNlLCBzdHI6IHN0cmluZykge1xuXHRpZiAoX2xvZ2dpbmcpIHtcblx0XHRsb2dnZXJTZXJ2aWNlLmluZm8oYFtOb3RlYm9va0NsaXBib2FyZF06ICR7c3RyfWApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEZvY3VzZWRFZGl0b3IoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0Y29uc3QgbG9nZ2VyU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdGlmICghZWRpdG9yKSB7XG5cdFx0X2xvZyhsb2dnZXJTZXJ2aWNlLCAnW1Jldml2ZSBXZWJ2aWV3XSBObyBub3RlYm9vayBlZGl0b3IgZm91bmQgZm9yIGFjdGl2ZSBlZGl0b3IgcGFuZSwgYnlwYXNzJyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKCFlZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSkge1xuXHRcdF9sb2cobG9nZ2VyU2VydmljZSwgJ1tSZXZpdmUgV2Vidmlld10gTm90ZWJvb2sgZWRpdG9yIGlzIG5vdCBmb2N1c2VkLCBieXBhc3MnKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoIWVkaXRvci5oYXNXZWJ2aWV3Rm9jdXMoKSkge1xuXHRcdF9sb2cobG9nZ2VyU2VydmljZSwgJ1tSZXZpdmUgV2Vidmlld10gTm90ZWJvb2sgZWRpdG9yIGJhY2tsYXllciB3ZWJ2aWV3IGlzIG5vdCBmb2N1c2VkLCBieXBhc3MnKTtcblx0XHRyZXR1cm47XG5cdH1cblx0Ly8gSWYgbm9uZSBvZiB0aGUgb3V0cHV0cyBoYXZlIGZvY3VzLCB0aGVuIHdlYnZpZXcgaXMgbm90IGZvY3VzZWRcblx0Y29uc3QgdmlldyA9IGVkaXRvci5nZXRWaWV3TW9kZWwoKTtcblx0aWYgKHZpZXcgJiYgdmlldy52aWV3Q2VsbHMuZXZlcnkoY2VsbCA9PiAhY2VsbC5vdXRwdXRJc0ZvY3VzZWQgJiYgIWNlbGwub3V0cHV0SXNIb3ZlcmVkKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJldHVybiB7IGVkaXRvciwgbG9nZ2VyU2VydmljZSB9O1xufVxuZnVuY3Rpb24gZ2V0Rm9jdXNlZFdlYnZpZXdEZWxlZ2F0ZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElXZWJ2aWV3IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVzdWx0ID0gZ2V0Rm9jdXNlZEVkaXRvcihhY2Nlc3Nvcik7XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHdlYnZpZXcgPSByZXN1bHQuZWRpdG9yLmdldElubmVyV2VidmlldygpO1xuXHRfbG9nKHJlc3VsdC5sb2dnZXJTZXJ2aWNlLCAnW1Jldml2ZSBXZWJ2aWV3XSBOb3RlYm9vayBlZGl0b3IgYmFja2xheWVyIHdlYnZpZXcgaXMgZm9jdXNlZCcpO1xuXHRyZXR1cm4gd2Vidmlldztcbn1cblxuZnVuY3Rpb24gd2l0aFdlYnZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGY6ICh3ZWJ2aWV3ZTogSVdlYnZpZXcpID0+IHZvaWQpIHtcblx0Y29uc3Qgd2VidmlldyA9IGdldEZvY3VzZWRXZWJ2aWV3RGVsZWdhdGUoYWNjZXNzb3IpO1xuXHRpZiAod2Vidmlldykge1xuXHRcdGYod2Vidmlldyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiB3aXRoRWRpdG9yKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmOiAoZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IpID0+IGJvb2xlYW4pIHtcblx0Y29uc3QgcmVzdWx0ID0gZ2V0Rm9jdXNlZEVkaXRvcihhY2Nlc3Nvcik7XG5cdHJldHVybiByZXN1bHQgPyBmKHJlc3VsdC5lZGl0b3IpIDogZmFsc2U7XG59XG5cbmNvbnN0IFBSSU9SSVRZID0gMTA1O1xuXG5VbmRvQ29tbWFuZC5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLXdlYnZpZXcnLCBhY2Nlc3NvciA9PiB7XG5cdHJldHVybiB3aXRoV2VidmlldyhhY2Nlc3Nvciwgd2VidmlldyA9PiB3ZWJ2aWV3LnVuZG8oKSk7XG59KTtcblxuUmVkb0NvbW1hbmQuYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay13ZWJ2aWV3JywgYWNjZXNzb3IgPT4ge1xuXHRyZXR1cm4gd2l0aFdlYnZpZXcoYWNjZXNzb3IsIHdlYnZpZXcgPT4gd2Vidmlldy5yZWRvKCkpO1xufSk7XG5cbkNvcHlBY3Rpb24/LmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnbm90ZWJvb2std2VidmlldycsIGFjY2Vzc29yID0+IHtcblx0cmV0dXJuIHdpdGhXZWJ2aWV3KGFjY2Vzc29yLCB3ZWJ2aWV3ID0+IHdlYnZpZXcuY29weSgpKTtcbn0pO1xuXG5QYXN0ZUFjdGlvbj8uYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay13ZWJ2aWV3JywgYWNjZXNzb3IgPT4ge1xuXHRyZXR1cm4gd2l0aFdlYnZpZXcoYWNjZXNzb3IsIHdlYnZpZXcgPT4gd2Vidmlldy5wYXN0ZSgpKTtcbn0pO1xuXG5DdXRBY3Rpb24/LmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnbm90ZWJvb2std2VidmlldycsIGFjY2Vzc29yID0+IHtcblx0cmV0dXJuIHdpdGhXZWJ2aWV3KGFjY2Vzc29yLCB3ZWJ2aWV3ID0+IHdlYnZpZXcuY3V0KCkpO1xufSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5QYXN0ZUNlbGxzKGVkaXRvcjogSU5vdGVib29rRWRpdG9yLCBhY3RpdmVDZWxsOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCwgcGFzdGVDZWxsczoge1xuXHRpdGVtczogTm90ZWJvb2tDZWxsVGV4dE1vZGVsW107XG5cdGlzQ29weTogYm9vbGVhbjtcbn0pOiBib29sZWFuIHtcblx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdGlmIChlZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IG9yaWdpbmFsU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSA9IHtcblx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0Zm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLFxuXHRcdHNlbGVjdGlvbnM6IGVkaXRvci5nZXRTZWxlY3Rpb25zKClcblx0fTtcblxuXHRpZiAoYWN0aXZlQ2VsbCkge1xuXHRcdGNvbnN0IGN1cnJDZWxsSW5kZXggPSBlZGl0b3IuZ2V0Q2VsbEluZGV4KGFjdGl2ZUNlbGwpO1xuXHRcdGNvbnN0IG5ld0ZvY3VzSW5kZXggPSB0eXBlb2YgY3VyckNlbGxJbmRleCA9PT0gJ251bWJlcicgPyBjdXJyQ2VsbEluZGV4ICsgMSA6IDA7XG5cdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0e1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdGluZGV4OiBuZXdGb2N1c0luZGV4LFxuXHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0Y2VsbHM6IHBhc3RlQ2VsbHMuaXRlbXMubWFwKGNlbGwgPT4gY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwoY2VsbCkpXG5cdFx0XHR9XG5cdFx0XSwgdHJ1ZSwgb3JpZ2luYWxTdGF0ZSwgKCkgPT4gKHtcblx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdGZvY3VzOiB7IHN0YXJ0OiBuZXdGb2N1c0luZGV4LCBlbmQ6IG5ld0ZvY3VzSW5kZXggKyAxIH0sXG5cdFx0XHRzZWxlY3Rpb25zOiBbeyBzdGFydDogbmV3Rm9jdXNJbmRleCwgZW5kOiBuZXdGb2N1c0luZGV4ICsgcGFzdGVDZWxscy5pdGVtcy5sZW5ndGggfV1cblx0XHR9KSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fSBlbHNlIHtcblx0XHRpZiAoZWRpdG9yLmdldExlbmd0aCgpICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0e1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0Y2VsbHM6IHBhc3RlQ2VsbHMuaXRlbXMubWFwKGNlbGwgPT4gY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwoY2VsbCkpXG5cdFx0XHR9XG5cdFx0XSwgdHJ1ZSwgb3JpZ2luYWxTdGF0ZSwgKCkgPT4gKHtcblx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdGZvY3VzOiB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAxLCBlbmQ6IHBhc3RlQ2VsbHMuaXRlbXMubGVuZ3RoICsgMSB9XVxuXHRcdH0pLCB1bmRlZmluZWQsIHRydWUpO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5Db3B5Q2VsbHMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSU5vdGVib29rRWRpdG9yLCB0YXJnZXRDZWxsOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGVkaXRvci5oYXNPdXRwdXRUZXh0U2VsZWN0aW9uKCkpIHtcblx0XHRnZXRXaW5kb3coZWRpdG9yLmdldERvbU5vZGUoKSkuZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2NvcHknKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQ8SUNsaXBib2FyZFNlcnZpY2U+KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0Y29uc3Qgbm90ZWJvb2tTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpO1xuXHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblxuXHRpZiAodGFyZ2V0Q2VsbCkge1xuXHRcdGNvbnN0IHRhcmdldENlbGxJbmRleCA9IGVkaXRvci5nZXRDZWxsSW5kZXgodGFyZ2V0Q2VsbCk7XG5cdFx0Y29uc3QgY29udGFpbmluZ1NlbGVjdGlvbiA9IHNlbGVjdGlvbnMuZmluZChzZWxlY3Rpb24gPT4gc2VsZWN0aW9uLnN0YXJ0IDw9IHRhcmdldENlbGxJbmRleCAmJiB0YXJnZXRDZWxsSW5kZXggPCBzZWxlY3Rpb24uZW5kKTtcblxuXHRcdGlmICghY29udGFpbmluZ1NlbGVjdGlvbikge1xuXHRcdFx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGFyZ2V0Q2VsbC5nZXRUZXh0KCkpO1xuXHRcdFx0bm90ZWJvb2tTZXJ2aWNlLnNldFRvQ29weShbdGFyZ2V0Q2VsbC5tb2RlbF0sIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc2VsZWN0aW9uUmFuZ2VzID0gZXhwYW5kQ2VsbFJhbmdlc1dpdGhIaWRkZW5DZWxscyhlZGl0b3IsIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpO1xuXHRjb25zdCBzZWxlY3RlZENlbGxzID0gY2VsbFJhbmdlVG9WaWV3Q2VsbHMoZWRpdG9yLCBzZWxlY3Rpb25SYW5nZXMpO1xuXG5cdGlmICghc2VsZWN0ZWRDZWxscy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChzZWxlY3RlZENlbGxzLm1hcChjZWxsID0+IGNlbGwuZ2V0VGV4dCgpKS5qb2luKCdcXG4nKSk7XG5cdG5vdGVib29rU2VydmljZS5zZXRUb0NvcHkoc2VsZWN0ZWRDZWxscy5tYXAoY2VsbCA9PiBjZWxsLm1vZGVsKSwgdHJ1ZSk7XG5cblx0cmV0dXJuIHRydWU7XG59XG5leHBvcnQgZnVuY3Rpb24gcnVuQ3V0Q2VsbHMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSU5vdGVib29rRWRpdG9yLCB0YXJnZXRDZWxsOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpIHx8IGVkaXRvci5pc1JlYWRPbmx5KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldDxJQ2xpcGJvYXJkU2VydmljZT4oSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRjb25zdCBub3RlYm9va1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSk7XG5cdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXG5cdGlmICh0YXJnZXRDZWxsKSB7XG5cdFx0Ly8gZnJvbSB1aVxuXHRcdGNvbnN0IHRhcmdldENlbGxJbmRleCA9IGVkaXRvci5nZXRDZWxsSW5kZXgodGFyZ2V0Q2VsbCk7XG5cdFx0Y29uc3QgY29udGFpbmluZ1NlbGVjdGlvbiA9IHNlbGVjdGlvbnMuZmluZChzZWxlY3Rpb24gPT4gc2VsZWN0aW9uLnN0YXJ0IDw9IHRhcmdldENlbGxJbmRleCAmJiB0YXJnZXRDZWxsSW5kZXggPCBzZWxlY3Rpb24uZW5kKTtcblxuXHRcdGlmICghY29udGFpbmluZ1NlbGVjdGlvbikge1xuXHRcdFx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGFyZ2V0Q2VsbC5nZXRUZXh0KCkpO1xuXHRcdFx0Ly8gZGVsZXRlIGNlbGxcblx0XHRcdGNvbnN0IGZvY3VzID0gZWRpdG9yLmdldEZvY3VzKCk7XG5cdFx0XHRjb25zdCBuZXdGb2N1cyA9IGZvY3VzLmVuZCA8PSB0YXJnZXRDZWxsSW5kZXggPyBmb2N1cyA6IHsgc3RhcnQ6IGZvY3VzLnN0YXJ0IC0gMSwgZW5kOiBmb2N1cy5lbmQgLSAxIH07XG5cdFx0XHRjb25zdCBuZXdTZWxlY3Rpb25zID0gc2VsZWN0aW9ucy5tYXAoc2VsZWN0aW9uID0+IChzZWxlY3Rpb24uZW5kIDw9IHRhcmdldENlbGxJbmRleCA/IHNlbGVjdGlvbiA6IHsgc3RhcnQ6IHNlbGVjdGlvbi5zdGFydCAtIDEsIGVuZDogc2VsZWN0aW9uLmVuZCAtIDEgfSkpO1xuXG5cdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogdGFyZ2V0Q2VsbEluZGV4LCBjb3VudDogMSwgY2VsbHM6IFtdIH1cblx0XHRcdF0sIHRydWUsIHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogZWRpdG9yLmdldEZvY3VzKCksIHNlbGVjdGlvbnM6IHNlbGVjdGlvbnMgfSwgKCkgPT4gKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogbmV3Rm9jdXMsIHNlbGVjdGlvbnM6IG5ld1NlbGVjdGlvbnMgfSksIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdG5vdGVib29rU2VydmljZS5zZXRUb0NvcHkoW3RhcmdldENlbGwubW9kZWxdLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBmb2N1cyA9IGVkaXRvci5nZXRGb2N1cygpO1xuXHRjb25zdCBjb250YWluaW5nU2VsZWN0aW9uID0gc2VsZWN0aW9ucy5maW5kKHNlbGVjdGlvbiA9PiBzZWxlY3Rpb24uc3RhcnQgPD0gZm9jdXMuc3RhcnQgJiYgZm9jdXMuZW5kIDw9IHNlbGVjdGlvbi5lbmQpO1xuXG5cdGlmICghY29udGFpbmluZ1NlbGVjdGlvbikge1xuXHRcdC8vIGZvY3VzIGlzIG91dCBvZiBhbnkgc2VsZWN0aW9uLCB3ZSBzaG91bGQgb25seSBjdXQgdGhpcyBjZWxsXG5cdFx0Y29uc3QgdGFyZ2V0Q2VsbCA9IGVkaXRvci5jZWxsQXQoZm9jdXMuc3RhcnQpO1xuXHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRhcmdldENlbGwuZ2V0VGV4dCgpKTtcblx0XHRjb25zdCBuZXdGb2N1cyA9IGZvY3VzLmVuZCA9PT0gZWRpdG9yLmdldExlbmd0aCgpID8geyBzdGFydDogZm9jdXMuc3RhcnQgLSAxLCBlbmQ6IGZvY3VzLmVuZCAtIDEgfSA6IGZvY3VzO1xuXHRcdGNvbnN0IG5ld1NlbGVjdGlvbnMgPSBzZWxlY3Rpb25zLm1hcChzZWxlY3Rpb24gPT4gKHNlbGVjdGlvbi5lbmQgPD0gZm9jdXMuc3RhcnQgPyBzZWxlY3Rpb24gOiB7IHN0YXJ0OiBzZWxlY3Rpb24uc3RhcnQgLSAxLCBlbmQ6IHNlbGVjdGlvbi5lbmQgLSAxIH0pKTtcblx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IGZvY3VzLnN0YXJ0LCBjb3VudDogMSwgY2VsbHM6IFtdIH1cblx0XHRdLCB0cnVlLCB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLCBzZWxlY3Rpb25zOiBzZWxlY3Rpb25zIH0sICgpID0+ICh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IG5ld0ZvY3VzLCBzZWxlY3Rpb25zOiBuZXdTZWxlY3Rpb25zIH0pLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0bm90ZWJvb2tTZXJ2aWNlLnNldFRvQ29weShbdGFyZ2V0Q2VsbC5tb2RlbF0sIGZhbHNlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IHNlbGVjdGlvblJhbmdlcyA9IGV4cGFuZENlbGxSYW5nZXNXaXRoSGlkZGVuQ2VsbHMoZWRpdG9yLCBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpKTtcblx0Y29uc3Qgc2VsZWN0ZWRDZWxscyA9IGNlbGxSYW5nZVRvVmlld0NlbGxzKGVkaXRvciwgc2VsZWN0aW9uUmFuZ2VzKTtcblxuXHRpZiAoIXNlbGVjdGVkQ2VsbHMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoc2VsZWN0ZWRDZWxscy5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSkuam9pbignXFxuJykpO1xuXHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBzZWxlY3Rpb25SYW5nZXMubWFwKHJhbmdlID0+ICh7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IHJhbmdlLnN0YXJ0LCBjb3VudDogcmFuZ2UuZW5kIC0gcmFuZ2Uuc3RhcnQsIGNlbGxzOiBbXSB9KSk7XG5cdGNvbnN0IGZpcnN0U2VsZWN0SW5kZXggPSBzZWxlY3Rpb25SYW5nZXNbMF0uc3RhcnQ7XG5cblx0LyoqXG5cdCAqIElmIHdlIGhhdmUgY2VsbHMsIDAsIDEsIDIsIDMsIDQsIDUsIDZcblx0ICogYW5kIGNlbGxzIDEsIDIgYXJlIHNlbGVjdGVkLCBhbmQgdGhlbiB3ZSBkZWxldGUgY2VsbHMgMSBhbmQgMlxuXHQgKiB0aGUgbmV3IGZvY3VzZWQgY2VsbCBzaG91bGQgc3RpbGwgYmUgYXQgaW5kZXggMVxuXHQgKi9cblx0Y29uc3QgbmV3Rm9jdXNlZENlbGxJbmRleCA9IGZpcnN0U2VsZWN0SW5kZXggPCB0ZXh0TW9kZWwuY2VsbHMubGVuZ3RoIC0gMVxuXHRcdD8gZmlyc3RTZWxlY3RJbmRleFxuXHRcdDogTWF0aC5tYXgodGV4dE1vZGVsLmNlbGxzLmxlbmd0aCAtIDIsIDApO1xuXG5cdHRleHRNb2RlbC5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IGVkaXRvci5nZXRGb2N1cygpLCBzZWxlY3Rpb25zOiBzZWxlY3Rpb25SYW5nZXMgfSwgKCkgPT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRmb2N1czogeyBzdGFydDogbmV3Rm9jdXNlZENlbGxJbmRleCwgZW5kOiBuZXdGb2N1c2VkQ2VsbEluZGV4ICsgMSB9LFxuXHRcdFx0c2VsZWN0aW9uczogW3sgc3RhcnQ6IG5ld0ZvY3VzZWRDZWxsSW5kZXgsIGVuZDogbmV3Rm9jdXNlZENlbGxJbmRleCArIDEgfV1cblx0XHR9O1xuXHR9LCB1bmRlZmluZWQsIHRydWUpO1xuXHRub3RlYm9va1NlcnZpY2Uuc2V0VG9Db3B5KHNlbGVjdGVkQ2VsbHMubWFwKGNlbGwgPT4gY2VsbC5tb2RlbCksIGZhbHNlKTtcblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQ2xpcGJvYXJkQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm5vdGVib29rQ2xpcGJvYXJkJztcblxuXHRjb25zdHJ1Y3RvcihASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgUFJJT1JJVFkgPSAxMDU7XG5cblx0XHRpZiAoQ29weUFjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoQ29weUFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLWNsaXBib2FyZCcsIGFjY2Vzc29yID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucnVuQ29weUFjdGlvbihhY2Nlc3Nvcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKFBhc3RlQWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihQYXN0ZUFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLWNsaXBib2FyZCcsIGFjY2Vzc29yID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucnVuUGFzdGVBY3Rpb24oYWNjZXNzb3IpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChDdXRBY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEN1dEFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLWNsaXBib2FyZCcsIGFjY2Vzc29yID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucnVuQ3V0QWN0aW9uKGFjY2Vzc29yKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb250ZXh0KCkge1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRjb25zdCBhY3RpdmVDZWxsID0gZWRpdG9yPy5nZXRBY3RpdmVDZWxsKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0YWN0aXZlQ2VsbFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9mb2N1c0luc2lkZUVtZWJlZE1vbmFjbyhlZGl0b3I6IElOb3RlYm9va0VkaXRvcikge1xuXHRcdGNvbnN0IHdpbmRvd1NlbGVjdGlvbiA9IGdldFdpbmRvdyhlZGl0b3IuZ2V0RG9tTm9kZSgpKS5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdGlmICh3aW5kb3dTZWxlY3Rpb24/LnJhbmdlQ291bnQgIT09IDEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVTZWxlY3Rpb24gPSB3aW5kb3dTZWxlY3Rpb24uZ2V0UmFuZ2VBdCgwKTtcblx0XHRpZiAoYWN0aXZlU2VsZWN0aW9uLnN0YXJ0Q29udGFpbmVyID09PSBhY3RpdmVTZWxlY3Rpb24uZW5kQ29udGFpbmVyICYmIGFjdGl2ZVNlbGVjdGlvbi5lbmRPZmZzZXQgLSBhY3RpdmVTZWxlY3Rpb24uc3RhcnRPZmZzZXQgPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgY29udGFpbmVyOiBhbnkgPSBhY3RpdmVTZWxlY3Rpb24uY29tbW9uQW5jZXN0b3JDb250YWluZXI7XG5cdFx0Y29uc3QgYm9keSA9IGVkaXRvci5nZXREb21Ob2RlKCk7XG5cblx0XHRpZiAoIWJvZHkuY29udGFpbnMoY29udGFpbmVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHdoaWxlIChjb250YWluZXJcblx0XHRcdCYmXG5cdFx0XHRjb250YWluZXIgIT09IGJvZHkpIHtcblx0XHRcdGlmICgoY29udGFpbmVyIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QgJiYgKGNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tZWRpdG9yJykpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRhaW5lciA9IGNvbnRhaW5lci5wYXJlbnROb2RlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJ1bkNvcHlBY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBsb2dnZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0aWYgKGlzSFRNTEVsZW1lbnQoYWN0aXZlRWxlbWVudCkgJiYgaXNFZGl0YWJsZUVsZW1lbnQoYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdF9sb2cobG9nZ2VyU2VydmljZSwgJ1tOb3RlYm9va0VkaXRvcl0gZm9jdXMgaXMgb24gaW5wdXQgb3IgdGV4dGFyZWEgZWxlbWVudCwgYnlwYXNzJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBlZGl0b3IgfSA9IHRoaXMuX2dldENvbnRleHQoKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0X2xvZyhsb2dnZXJTZXJ2aWNlLCAnW05vdGVib29rRWRpdG9yXSBubyBhY3RpdmUgbm90ZWJvb2sgZWRpdG9yLCBieXBhc3MnKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWVkaXRvci5oYXNFZGl0b3JGb2N1cygpKSB7XG5cdFx0XHRfbG9nKGxvZ2dlclNlcnZpY2UsICdbTm90ZWJvb2tFZGl0b3JdIGZvY3VzIGlzIG91dHNpZGUgb2YgdGhlIG5vdGVib29rIGVkaXRvciwgYnlwYXNzJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2ZvY3VzSW5zaWRlRW1lYmVkTW9uYWNvKGVkaXRvcikpIHtcblx0XHRcdF9sb2cobG9nZ2VyU2VydmljZSwgJ1tOb3RlYm9va0VkaXRvcl0gZm9jdXMgaXMgb24gZW1iZWQgbW9uYWNvIGVkaXRvciwgYnlwYXNzJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0X2xvZyhsb2dnZXJTZXJ2aWNlLCAnW05vdGVib29rRWRpdG9yXSBydW4gY29weSBhY3Rpb25zIG9uIG5vdGVib29rIG1vZGVsJyk7XG5cdFx0cmV0dXJuIHJ1bkNvcHlDZWxscyhhY2Nlc3NvciwgZWRpdG9yLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cnVuUGFzdGVBY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gPEhUTUxFbGVtZW50PmdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRpZiAoYWN0aXZlRWxlbWVudCAmJiBpc0VkaXRhYmxlRWxlbWVudChhY3RpdmVFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZWRpdG9yLCBhY3RpdmVDZWxsIH0gPSB0aGlzLl9nZXRDb250ZXh0KCk7XG5cdFx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNFZGl0b3JGb2N1cygpIHx8IHRoaXMuX2ZvY3VzSW5zaWRlRW1lYmVkTW9uYWNvKGVkaXRvcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBub3RlYm9va1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSk7XG5cdFx0Y29uc3QgcGFzdGVDZWxscyA9IG5vdGVib29rU2VydmljZS5nZXRUb0NvcHkoKTtcblxuXHRcdGlmICghcGFzdGVDZWxscykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBydW5QYXN0ZUNlbGxzKGVkaXRvciwgYWN0aXZlQ2VsbCwgcGFzdGVDZWxscyk7XG5cdH1cblxuXHRydW5DdXRBY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gPEhUTUxFbGVtZW50PmdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRpZiAoYWN0aXZlRWxlbWVudCAmJiBpc0VkaXRhYmxlRWxlbWVudChhY3RpdmVFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZWRpdG9yIH0gPSB0aGlzLl9nZXRDb250ZXh0KCk7XG5cdFx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNFZGl0b3JGb2N1cygpIHx8IHRoaXMuX2ZvY3VzSW5zaWRlRW1lYmVkTW9uYWNvKGVkaXRvcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcnVuQ3V0Q2VsbHMoYWNjZXNzb3IsIGVkaXRvciwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tDbGlwYm9hcmRDb250cmlidXRpb24uSUQsIE5vdGVib29rQ2xpcGJvYXJkQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuXG5jb25zdCBDT1BZX0NFTExfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmNvcHknO1xuY29uc3QgQ1VUX0NFTExfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmN1dCc7XG5jb25zdCBQQVNURV9DRUxMX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5wYXN0ZSc7XG5jb25zdCBQQVNURV9DRUxMX0FCT1ZFX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5wYXN0ZUFib3ZlJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBDT1BZX0NFTExfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuY29weScsIFwiQ29weSBDZWxsXCIpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRncm91cDogQ2VsbE92ZXJmbG93VG9vbGJhckdyb3Vwcy5Db3B5LFxuXHRcdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRrZXliaW5kaW5nOiBwbGF0Zm9ybS5pc05hdGl2ZSA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qyxcblx0XHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5JbnNlcnRdIH0sXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSkpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0cnVuQ29weUNlbGxzKGFjY2Vzc29yLCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLCBjb250ZXh0LmNlbGwpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBDVVRfQ0VMTF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5jdXQnLCBcIkN1dCBDZWxsXCIpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgTk9URUJPT0tfQ0VMTF9FRElUQUJMRSksXG5cdFx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuQ29weSxcblx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5YmluZGluZzogcGxhdGZvcm0uaXNOYXRpdmUgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSkpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYLFxuXHRcdFx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WCwgc2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5EZWxldGVdIH0sXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRydW5DdXRDZWxscyhhY2Nlc3NvciwgY29udGV4dC5ub3RlYm9va0VkaXRvciwgY29udGV4dC5jZWxsKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBQQVNURV9DRUxMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLnBhc3RlJywgXCJQYXN0ZSBDZWxsXCIpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSksXG5cdFx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuQ29weSxcblx0XHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5YmluZGluZzogcGxhdGZvcm0uaXNOYXRpdmUgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSkpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlWLFxuXHRcdFx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Viwgc2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5JbnNlcnRdIH0sXG5cdFx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVYsIHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuSW5zZXJ0XSB9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpIHtcblx0XHRjb25zdCBub3RlYm9va1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSk7XG5cdFx0Y29uc3QgcGFzdGVDZWxscyA9IG5vdGVib29rU2VydmljZS5nZXRUb0NvcHkoKTtcblxuXHRcdGlmICghY29udGV4dC5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpIHx8IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghcGFzdGVDZWxscykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJ1blBhc3RlQ2VsbHMoY29udGV4dC5ub3RlYm9va0VkaXRvciwgY29udGV4dC5jZWxsLCBwYXN0ZUNlbGxzKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogUEFTVEVfQ0VMTF9BQk9WRV9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5wYXN0ZUFib3ZlJywgXCJQYXN0ZSBDZWxsIEFib3ZlXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSkpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlWLFxuXHRcdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdGNvbnN0IG5vdGVib29rU2VydmljZSA9IGFjY2Vzc29yLmdldDxJTm90ZWJvb2tTZXJ2aWNlPihJTm90ZWJvb2tTZXJ2aWNlKTtcblx0XHRjb25zdCBwYXN0ZUNlbGxzID0gbm90ZWJvb2tTZXJ2aWNlLmdldFRvQ29weSgpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdGlmIChlZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghcGFzdGVDZWxscykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSA9IHtcblx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdGZvY3VzOiBlZGl0b3IuZ2V0Rm9jdXMoKSxcblx0XHRcdHNlbGVjdGlvbnM6IGVkaXRvci5nZXRTZWxlY3Rpb25zKClcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VyckNlbGxJbmRleCA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGNvbnRleHQuY2VsbCk7XG5cdFx0Y29uc3QgbmV3Rm9jdXNJbmRleCA9IGN1cnJDZWxsSW5kZXg7XG5cdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0e1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdGluZGV4OiBjdXJyQ2VsbEluZGV4LFxuXHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0Y2VsbHM6IHBhc3RlQ2VsbHMuaXRlbXMubWFwKGNlbGwgPT4gY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwoY2VsbCkpXG5cdFx0XHR9XG5cdFx0XSwgdHJ1ZSwgb3JpZ2luYWxTdGF0ZSwgKCkgPT4gKHtcblx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdGZvY3VzOiB7IHN0YXJ0OiBuZXdGb2N1c0luZGV4LCBlbmQ6IG5ld0ZvY3VzSW5kZXggKyAxIH0sXG5cdFx0XHRzZWxlY3Rpb25zOiBbeyBzdGFydDogbmV3Rm9jdXNJbmRleCwgZW5kOiBuZXdGb2N1c0luZGV4ICsgcGFzdGVDZWxscy5pdGVtcy5sZW5ndGggfV1cblx0XHR9KSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTm90ZWJvb2tDbGlwYm9hcmRMb2cnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlTm90ZWJvb2tDbGlwYm9hcmRMb2cnLCAnVG9nZ2xlIE5vdGVib29rIENsaXBib2FyZCBUcm91Ymxlc2hvb3RpbmcnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHR0b2dnbGVMb2dnaW5nKCk7XG5cdFx0aWYgKF9sb2dnaW5nKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoc2hvd1dpbmRvd0xvZ0FjdGlvbklkKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ25vdGVib29rLmNlbGwub3V0cHV0LnNlbGVjdEFsbCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2suY2VsbC5vdXRwdXQuc2VsZWN0QWxsJywgXCJTZWxlY3QgQWxsXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19PVVRQVVRfRk9DVVNFRCksXG5cdFx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19PVVRQVVRfV0VCVklFV19BQ1RJT05fV0VJR0hUXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9jb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdHdpdGhFZGl0b3IoYWNjZXNzb3IsIGVkaXRvciA9PiB7XG5cdFx0XHRpZiAoIWVkaXRvci5oYXNFZGl0b3JGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChlZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSAmJiAhZWRpdG9yLmhhc1dlYnZpZXdGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2VsbCA9IGVkaXRvci5nZXRBY3RpdmVDZWxsKCk7XG5cdFx0XHRpZiAoIWNlbGwgfHwgIWNlbGwub3V0cHV0SXNGb2N1c2VkIHx8ICFlZGl0b3IuaGFzV2Vidmlld0ZvY3VzKCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2VsbC5pbnB1dEluT3V0cHV0SXNGb2N1c2VkKSB7XG5cdFx0XHRcdGVkaXRvci5zZWxlY3RJbnB1dENvbnRlbnRzKGNlbGwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWRpdG9yLnNlbGVjdE91dHB1dENvbnRlbnQoY2VsbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQixzQ0FBc0M7QUFDL0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0IsMEJBQTBCLHlCQUF5QiwrQkFBK0I7QUFDbkgsU0FBUyxzQkFBc0IsaUNBQWlDLHVDQUF3RTtBQUN4SSxTQUFTLFlBQVksV0FBVyxtQkFBbUI7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQ0FBeUQ7QUFDbEUsU0FBUyxjQUFtRCwwQkFBMEI7QUFDdEYsU0FBUyx3QkFBd0I7QUFDakMsWUFBWSxjQUFjO0FBQzFCLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLDJCQUErRSxnQkFBZ0Isb0JBQW9CLHNDQUFzQyw2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QUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixVQUFzQztBQUN0RixlQUFXLFVBQVUsWUFBVTtBQUM5QixVQUFJLENBQUMsT0FBTyxlQUFlLEdBQUc7QUFDN0IsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLE9BQU8sZUFBZSxLQUFLLENBQUMsT0FBTyxnQkFBZ0IsR0FBRztBQUN6RCxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sT0FBTyxPQUFPLGNBQWM7QUFDbEMsVUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLG1CQUFtQixDQUFDLE9BQU8sZ0JBQWdCLEdBQUc7QUFDaEUsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLEtBQUssd0JBQXdCO0FBQ2hDLGVBQU8sb0JBQW9CLElBQUk7QUFBQSxNQUNoQyxPQUFPO0FBQ04sZUFBTyxvQkFBb0IsSUFBSTtBQUFBLE1BQ2hDO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBRUY7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJjb250YWluaW5nU2VsZWN0aW9uIiwgImZvY3VzIiwgInRhcmdldENlbGwiLCAiUFJJT1JJVFkiXQp9Cg==
