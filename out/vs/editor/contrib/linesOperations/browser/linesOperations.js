import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CoreEditingCommands } from "../../../browser/coreCommands.js";
import { EditorAction, registerEditorAction } from "../../../browser/editorExtensions.js";
import { ReplaceCommand, ReplaceCommandThatPreservesSelection, ReplaceCommandThatSelectsText } from "../../../common/commands/replaceCommand.js";
import { TrimTrailingWhitespaceCommand } from "../../../common/commands/trimTrailingWhitespaceCommand.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { EnterOperation } from "../../../common/cursor/cursorTypeEditOperations.js";
import { TypeOperations } from "../../../common/cursor/cursorTypeOperations.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { CopyLinesCommand } from "./copyLinesCommand.js";
import { MoveLinesCommand } from "./moveLinesCommand.js";
import { SortLinesCommand } from "./sortLinesCommand.js";
class AbstractCopyLinesAction extends EditorAction {
  constructor(down, opts) {
    super(opts);
    this.down = down;
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections().map((selection, index) => ({ selection, index, ignore: false }));
    selections.sort((a, b) => Range.compareRangesUsingStarts(a.selection, b.selection));
    let prev = selections[0];
    for (let i = 1; i < selections.length; i++) {
      const curr = selections[i];
      if (prev.selection.endLineNumber === curr.selection.startLineNumber) {
        if (prev.index < curr.index) {
          curr.ignore = true;
        } else {
          prev.ignore = true;
          prev = curr;
        }
      }
    }
    const commands = [];
    for (const selection of selections) {
      commands.push(new CopyLinesCommand(selection.selection, this.down, selection.ignore));
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class CopyLinesUpAction extends AbstractCopyLinesAction {
  constructor() {
    super(false, {
      id: "editor.action.copyLinesUpAction",
      label: nls.localize2("lines.copyUp", "Copy Line Up"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miCopyLinesUp", comment: ["&& denotes a mnemonic"] }, "&&Copy Line Up"),
        order: 1
      },
      canTriggerInlineEdits: true
    });
  }
}
class CopyLinesDownAction extends AbstractCopyLinesAction {
  constructor() {
    super(true, {
      id: "editor.action.copyLinesDownAction",
      label: nls.localize2("lines.copyDown", "Copy Line Down"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miCopyLinesDown", comment: ["&& denotes a mnemonic"] }, "Co&&py Line Down"),
        order: 2
      },
      canTriggerInlineEdits: true
    });
  }
}
class DuplicateSelectionAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.duplicateSelection",
      label: nls.localize2("duplicateSelection", "Duplicate Selection"),
      precondition: EditorContextKeys.writable,
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miDuplicateSelection", comment: ["&& denotes a mnemonic"] }, "&&Duplicate Selection"),
        order: 5
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const commands = [];
    const selections = editor.getSelections();
    const model = editor.getModel();
    for (const selection of selections) {
      if (selection.isEmpty()) {
        commands.push(new CopyLinesCommand(selection, true));
      } else {
        const insertSelection = new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn);
        commands.push(new ReplaceCommandThatSelectsText(insertSelection, model.getValueInRange(selection)));
      }
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class AbstractMoveLinesAction extends EditorAction {
  constructor(down, opts) {
    super(opts);
    this.down = down;
  }
  run(accessor, editor) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const commands = [];
    const selections = editor.getSelections() || [];
    const autoIndent = editor.getOption(EditorOption.autoIndent);
    for (const selection of selections) {
      commands.push(new MoveLinesCommand(selection, this.down, autoIndent, languageConfigurationService));
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class MoveLinesUpAction extends AbstractMoveLinesAction {
  constructor() {
    super(false, {
      id: "editor.action.moveLinesUpAction",
      label: nls.localize2("lines.moveUp", "Move Line Up"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyCode.UpArrow,
        linux: { primary: KeyMod.Alt | KeyCode.UpArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miMoveLinesUp", comment: ["&& denotes a mnemonic"] }, "Mo&&ve Line Up"),
        order: 3
      },
      canTriggerInlineEdits: true
    });
  }
}
class MoveLinesDownAction extends AbstractMoveLinesAction {
  constructor() {
    super(true, {
      id: "editor.action.moveLinesDownAction",
      label: nls.localize2("lines.moveDown", "Move Line Down"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Alt | KeyCode.DownArrow,
        linux: { primary: KeyMod.Alt | KeyCode.DownArrow },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "2_line",
        title: nls.localize({ key: "miMoveLinesDown", comment: ["&& denotes a mnemonic"] }, "Move &&Line Down"),
        order: 4
      },
      canTriggerInlineEdits: true
    });
  }
}
class AbstractSortLinesAction extends EditorAction {
  constructor(descending, opts) {
    super(opts);
    this.descending = descending;
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    let selections = editor.getSelections();
    if (selections.length === 1 && selections[0].isSingleLine()) {
      selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
    }
    for (const selection of selections) {
      if (!SortLinesCommand.canRun(editor.getModel(), selection, this.descending)) {
        return;
      }
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      commands[i] = new SortLinesCommand(selections[i], this.descending);
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class SortLinesAscendingAction extends AbstractSortLinesAction {
  constructor() {
    super(false, {
      id: "editor.action.sortLinesAscending",
      label: nls.localize2("lines.sortAscending", "Sort Lines Ascending"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
}
class SortLinesDescendingAction extends AbstractSortLinesAction {
  constructor() {
    super(true, {
      id: "editor.action.sortLinesDescending",
      label: nls.localize2("lines.sortDescending", "Sort Lines Descending"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
}
class DeleteDuplicateLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.removeDuplicateLines",
      label: nls.localize2("lines.deleteDuplicates", "Delete Duplicate Lines"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
      return;
    }
    const edits = [];
    const endCursorState = [];
    let linesDeleted = 0;
    let updateSelection = true;
    let selections = editor.getSelections();
    if (selections.length === 1 && selections[0].isSingleLine()) {
      selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
      updateSelection = false;
    }
    for (const selection of selections) {
      const uniqueLines = /* @__PURE__ */ new Set();
      const lines = [];
      for (let i = selection.startLineNumber; i <= selection.endLineNumber; i++) {
        const line = model.getLineContent(i);
        if (uniqueLines.has(line)) {
          continue;
        }
        lines.push(line);
        uniqueLines.add(line);
      }
      const selectionToReplace = new Selection(
        selection.startLineNumber,
        1,
        selection.endLineNumber,
        model.getLineMaxColumn(selection.endLineNumber)
      );
      const adjustedSelectionStart = selection.startLineNumber - linesDeleted;
      const finalSelection = new Selection(
        adjustedSelectionStart,
        1,
        adjustedSelectionStart + lines.length - 1,
        lines[lines.length - 1].length + 1
      );
      edits.push(EditOperation.replace(selectionToReplace, lines.join("\n")));
      endCursorState.push(finalSelection);
      linesDeleted += selection.endLineNumber - selection.startLineNumber + 1 - lines.length;
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, updateSelection ? endCursorState : void 0);
    editor.pushUndoStop();
  }
}
class ReverseLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.reverseLines",
      label: nls.localize2("lines.reverseLines", "Reverse lines"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    const originalSelections = editor.getSelections();
    let selections = originalSelections;
    if (selections.length === 1 && selections[0].isSingleLine()) {
      selections = [new Selection(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()))];
    }
    const edits = [];
    const resultingSelections = [];
    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      const originalSelection = originalSelections[i];
      let endLineNumber = selection.endLineNumber;
      if (selection.startLineNumber < selection.endLineNumber && selection.endColumn === 1) {
        endLineNumber--;
      }
      let range = new Range(selection.startLineNumber, 1, endLineNumber, model.getLineMaxColumn(endLineNumber));
      if (endLineNumber === model.getLineCount() && model.getLineContent(range.endLineNumber) === "") {
        range = range.setEndPosition(range.endLineNumber - 1, model.getLineMaxColumn(range.endLineNumber - 1));
      }
      const lines = [];
      for (let i2 = range.endLineNumber; i2 >= range.startLineNumber; i2--) {
        lines.push(model.getLineContent(i2));
      }
      const edit = EditOperation.replace(range, lines.join("\n"));
      edits.push(edit);
      const updateLineNumber = function(lineNumber) {
        return lineNumber <= range.endLineNumber ? range.endLineNumber - lineNumber + range.startLineNumber : lineNumber;
      };
      const updateSelection = function(sel) {
        if (sel.isEmpty()) {
          return new Selection(updateLineNumber(sel.positionLineNumber), sel.positionColumn, updateLineNumber(sel.positionLineNumber), sel.positionColumn);
        } else {
          const newSelectionStart = updateLineNumber(sel.selectionStartLineNumber);
          const newPosition = updateLineNumber(sel.positionLineNumber);
          const newSelectionStartColumn = sel.selectionStartColumn;
          const newPositionColumn = sel.positionColumn;
          return new Selection(newSelectionStart, newSelectionStartColumn, newPosition, newPositionColumn);
        }
      };
      resultingSelections.push(updateSelection(originalSelection));
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, resultingSelections);
    editor.pushUndoStop();
  }
}
const _TrimTrailingWhitespaceAction = class _TrimTrailingWhitespaceAction extends EditorAction {
  constructor() {
    super({
      id: _TrimTrailingWhitespaceAction.ID,
      label: nls.localize2("lines.trimTrailingWhitespace", "Trim Trailing Whitespace"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(_accessor, editor, args) {
    let cursors = [];
    if (args.reason === "auto-save") {
      cursors = (editor.getSelections() || []).map((s) => new Position(s.positionLineNumber, s.positionColumn));
    }
    const selection = editor.getSelection();
    if (selection === null) {
      return;
    }
    const config = _accessor.get(IConfigurationService);
    const model = editor.getModel();
    const trimInRegexAndStrings = config.getValue("files.trimTrailingWhitespaceInRegexAndStrings", { overrideIdentifier: model?.getLanguageId(), resource: model?.uri });
    const command = new TrimTrailingWhitespaceCommand(selection, cursors, trimInRegexAndStrings);
    editor.pushUndoStop();
    editor.executeCommands(this.id, [command]);
    editor.pushUndoStop();
  }
};
_TrimTrailingWhitespaceAction.ID = "editor.action.trimTrailingWhitespace";
let TrimTrailingWhitespaceAction = _TrimTrailingWhitespaceAction;
class DeleteLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.deleteLines",
      label: nls.localize2("lines.delete", "Delete Line"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const ops = this._getLinesToRemove(editor);
    const model = editor.getModel();
    if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
      return;
    }
    let linesDeleted = 0;
    const edits = [];
    const cursorState = [];
    for (let i = 0, len = ops.length; i < len; i++) {
      const op = ops[i];
      let startLineNumber = op.startLineNumber;
      let endLineNumber = op.endLineNumber;
      let startColumn = 1;
      let endColumn = model.getLineMaxColumn(endLineNumber);
      if (endLineNumber < model.getLineCount()) {
        endLineNumber += 1;
        endColumn = 1;
      } else if (startLineNumber > 1) {
        startLineNumber -= 1;
        startColumn = model.getLineMaxColumn(startLineNumber);
      }
      edits.push(EditOperation.replace(new Selection(startLineNumber, startColumn, endLineNumber, endColumn), ""));
      cursorState.push(new Selection(startLineNumber - linesDeleted, op.positionColumn, startLineNumber - linesDeleted, op.positionColumn));
      linesDeleted += op.endLineNumber - op.startLineNumber + 1;
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, cursorState);
    editor.revealAllCursors(true);
    editor.pushUndoStop();
  }
  _getLinesToRemove(editor) {
    const operations = editor.getSelections().map((s) => {
      let endLineNumber = s.endLineNumber;
      if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
        endLineNumber -= 1;
      }
      return {
        startLineNumber: s.startLineNumber,
        selectionStartColumn: s.selectionStartColumn,
        endLineNumber,
        positionColumn: s.positionColumn
      };
    });
    operations.sort((a, b) => {
      if (a.startLineNumber === b.startLineNumber) {
        return a.endLineNumber - b.endLineNumber;
      }
      return a.startLineNumber - b.startLineNumber;
    });
    const mergedOperations = [];
    let previousOperation = operations[0];
    for (let i = 1; i < operations.length; i++) {
      if (previousOperation.endLineNumber + 1 >= operations[i].startLineNumber) {
        previousOperation.endLineNumber = operations[i].endLineNumber;
      } else {
        mergedOperations.push(previousOperation);
        previousOperation = operations[i];
      }
    }
    mergedOperations.push(previousOperation);
    return mergedOperations;
  }
}
class IndentLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.indentLines",
      label: nls.localize2("lines.indent", "Indent Line"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.BracketRight,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const viewModel = editor._getViewModel();
    if (!viewModel) {
      return;
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
    editor.pushUndoStop();
  }
}
class OutdentLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.outdentLines",
      label: nls.localize2("lines.outdent", "Outdent Line"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.BracketLeft,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    CoreEditingCommands.Outdent.runEditorCommand(_accessor, editor, null);
  }
}
const _InsertLineBeforeAction = class _InsertLineBeforeAction extends EditorAction {
  constructor() {
    super({
      id: _InsertLineBeforeAction.ID,
      label: nls.localize2("lines.insertBefore", "Insert Line Above"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const viewModel = editor._getViewModel();
    if (!viewModel) {
      return;
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, EnterOperation.lineInsertBefore(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
  }
};
_InsertLineBeforeAction.ID = "editor.action.insertLineBefore";
let InsertLineBeforeAction = _InsertLineBeforeAction;
const _InsertLineAfterAction = class _InsertLineAfterAction extends EditorAction {
  constructor() {
    super({
      id: _InsertLineAfterAction.ID,
      label: nls.localize2("lines.insertAfter", "Insert Line Below"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const viewModel = editor._getViewModel();
    if (!viewModel) {
      return;
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, EnterOperation.lineInsertAfter(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
  }
};
_InsertLineAfterAction.ID = "editor.action.insertLineAfter";
let InsertLineAfterAction = _InsertLineAfterAction;
class AbstractDeleteAllToBoundaryAction extends EditorAction {
  run(_accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const primaryCursor = editor.getSelection();
    const rangesToDelete = this._getRangesToDelete(editor);
    const effectiveRanges = [];
    for (let i = 0, count = rangesToDelete.length - 1; i < count; i++) {
      const range = rangesToDelete[i];
      const nextRange = rangesToDelete[i + 1];
      if (Range.intersectRanges(range, nextRange) === null) {
        effectiveRanges.push(range);
      } else {
        rangesToDelete[i + 1] = Range.plusRange(range, nextRange);
      }
    }
    effectiveRanges.push(rangesToDelete[rangesToDelete.length - 1]);
    const endCursorState = this._getEndCursorState(primaryCursor, effectiveRanges);
    const edits = effectiveRanges.map((range) => {
      return EditOperation.replace(range, "");
    });
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, endCursorState);
    editor.pushUndoStop();
  }
}
class DeleteAllLeftAction extends AbstractDeleteAllToBoundaryAction {
  constructor() {
    super({
      id: "deleteAllLeft",
      label: nls.localize2("lines.deleteAllLeft", "Delete All Left"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: 0,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  _getEndCursorState(primaryCursor, rangesToDelete) {
    let endPrimaryCursor = null;
    const endCursorState = [];
    let deletedLines = 0;
    rangesToDelete.forEach((range) => {
      let endCursor;
      if (range.endColumn === 1 && deletedLines > 0) {
        const newStartLine = range.startLineNumber - deletedLines;
        endCursor = new Selection(newStartLine, range.startColumn, newStartLine, range.startColumn);
      } else {
        endCursor = new Selection(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn);
      }
      deletedLines += range.endLineNumber - range.startLineNumber;
      if (range.intersectRanges(primaryCursor)) {
        endPrimaryCursor = endCursor;
      } else {
        endCursorState.push(endCursor);
      }
    });
    if (endPrimaryCursor) {
      endCursorState.unshift(endPrimaryCursor);
    }
    return endCursorState;
  }
  _getRangesToDelete(editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return [];
    }
    let rangesToDelete = selections;
    const model = editor.getModel();
    if (model === null) {
      return [];
    }
    rangesToDelete.sort(Range.compareRangesUsingStarts);
    rangesToDelete = rangesToDelete.map((selection) => {
      if (selection.isEmpty()) {
        if (selection.startColumn === 1) {
          const deleteFromLine = Math.max(1, selection.startLineNumber - 1);
          const deleteFromColumn = selection.startLineNumber === 1 ? 1 : model.getLineLength(deleteFromLine) + 1;
          return new Range(deleteFromLine, deleteFromColumn, selection.startLineNumber, 1);
        } else {
          return new Range(selection.startLineNumber, 1, selection.startLineNumber, selection.startColumn);
        }
      } else {
        return new Range(selection.startLineNumber, 1, selection.endLineNumber, selection.endColumn);
      }
    });
    return rangesToDelete;
  }
}
class DeleteAllRightAction extends AbstractDeleteAllToBoundaryAction {
  constructor() {
    super({
      id: "deleteAllRight",
      label: nls.localize2("lines.deleteAllRight", "Delete All Right"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: 0,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyK, secondary: [KeyMod.CtrlCmd | KeyCode.Delete] },
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  _getEndCursorState(primaryCursor, rangesToDelete) {
    let endPrimaryCursor = null;
    const endCursorState = [];
    for (let i = 0, len = rangesToDelete.length, offset = 0; i < len; i++) {
      const range = rangesToDelete[i];
      const endCursor = new Selection(range.startLineNumber - offset, range.startColumn, range.startLineNumber - offset, range.startColumn);
      if (range.intersectRanges(primaryCursor)) {
        endPrimaryCursor = endCursor;
      } else {
        endCursorState.push(endCursor);
      }
    }
    if (endPrimaryCursor) {
      endCursorState.unshift(endPrimaryCursor);
    }
    return endCursorState;
  }
  _getRangesToDelete(editor) {
    const model = editor.getModel();
    if (model === null) {
      return [];
    }
    const selections = editor.getSelections();
    if (selections === null) {
      return [];
    }
    const rangesToDelete = selections.map((sel) => {
      if (sel.isEmpty()) {
        const maxColumn = model.getLineMaxColumn(sel.startLineNumber);
        if (sel.startColumn === maxColumn) {
          return new Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber + 1, 1);
        } else {
          return new Range(sel.startLineNumber, sel.startColumn, sel.startLineNumber, maxColumn);
        }
      }
      return sel;
    });
    rangesToDelete.sort(Range.compareRangesUsingStarts);
    return rangesToDelete;
  }
}
class JoinLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.joinLines",
      label: nls.localize2("lines.joinLines", "Join Lines"),
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: 0,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyJ },
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    let primaryCursor = editor.getSelection();
    if (primaryCursor === null) {
      return;
    }
    selections.sort(Range.compareRangesUsingStarts);
    const reducedSelections = [];
    const lastSelection = selections.reduce((previousValue, currentValue) => {
      if (previousValue.isEmpty()) {
        if (previousValue.endLineNumber === currentValue.startLineNumber) {
          if (primaryCursor.equalsSelection(previousValue)) {
            primaryCursor = currentValue;
          }
          return currentValue;
        }
        if (currentValue.startLineNumber > previousValue.endLineNumber + 1) {
          reducedSelections.push(previousValue);
          return currentValue;
        } else {
          return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
        }
      } else {
        if (currentValue.startLineNumber > previousValue.endLineNumber) {
          reducedSelections.push(previousValue);
          return currentValue;
        } else {
          return new Selection(previousValue.startLineNumber, previousValue.startColumn, currentValue.endLineNumber, currentValue.endColumn);
        }
      }
    });
    reducedSelections.push(lastSelection);
    const model = editor.getModel();
    if (model === null) {
      return;
    }
    const edits = [];
    const endCursorState = [];
    let endPrimaryCursor = primaryCursor;
    let lineOffset = 0;
    for (let i = 0, len = reducedSelections.length; i < len; i++) {
      const selection = reducedSelections[i];
      const startLineNumber = selection.startLineNumber;
      const startColumn = 1;
      let columnDeltaOffset = 0;
      let endLineNumber, endColumn;
      const selectionEndPositionOffset = model.getLineLength(selection.endLineNumber) - selection.endColumn;
      if (selection.isEmpty() || selection.startLineNumber === selection.endLineNumber) {
        const position = selection.getStartPosition();
        if (position.lineNumber < model.getLineCount()) {
          endLineNumber = startLineNumber + 1;
          endColumn = model.getLineMaxColumn(endLineNumber);
        } else {
          endLineNumber = position.lineNumber;
          endColumn = model.getLineMaxColumn(position.lineNumber);
        }
      } else {
        endLineNumber = selection.endLineNumber;
        endColumn = model.getLineMaxColumn(endLineNumber);
      }
      let trimmedLinesContent = model.getLineContent(startLineNumber);
      for (let i2 = startLineNumber + 1; i2 <= endLineNumber; i2++) {
        const lineText = model.getLineContent(i2);
        const firstNonWhitespaceIdx = model.getLineFirstNonWhitespaceColumn(i2);
        if (firstNonWhitespaceIdx >= 1) {
          let insertSpace = true;
          if (trimmedLinesContent === "") {
            insertSpace = false;
          }
          if (insertSpace && (trimmedLinesContent.charAt(trimmedLinesContent.length - 1) === " " || trimmedLinesContent.charAt(trimmedLinesContent.length - 1) === "	")) {
            insertSpace = false;
            trimmedLinesContent = trimmedLinesContent.replace(/[\s\uFEFF\xA0]+$/g, " ");
          }
          const lineTextWithoutIndent = lineText.substr(firstNonWhitespaceIdx - 1);
          trimmedLinesContent += (insertSpace ? " " : "") + lineTextWithoutIndent;
          if (insertSpace) {
            columnDeltaOffset = lineTextWithoutIndent.length + 1;
          } else {
            columnDeltaOffset = lineTextWithoutIndent.length;
          }
        } else {
          columnDeltaOffset = 0;
        }
      }
      const deleteSelection = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
      if (!deleteSelection.isEmpty()) {
        let resultSelection;
        if (selection.isEmpty()) {
          edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
          resultSelection = new Selection(deleteSelection.startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1, startLineNumber - lineOffset, trimmedLinesContent.length - columnDeltaOffset + 1);
        } else {
          if (selection.startLineNumber === selection.endLineNumber) {
            edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
            resultSelection = new Selection(
              selection.startLineNumber - lineOffset,
              selection.startColumn,
              selection.endLineNumber - lineOffset,
              selection.endColumn
            );
          } else {
            edits.push(EditOperation.replace(deleteSelection, trimmedLinesContent));
            resultSelection = new Selection(
              selection.startLineNumber - lineOffset,
              selection.startColumn,
              selection.startLineNumber - lineOffset,
              trimmedLinesContent.length - selectionEndPositionOffset
            );
          }
        }
        if (Range.intersectRanges(deleteSelection, primaryCursor) !== null) {
          endPrimaryCursor = resultSelection;
        } else {
          endCursorState.push(resultSelection);
        }
      }
      lineOffset += deleteSelection.endLineNumber - deleteSelection.startLineNumber;
    }
    endCursorState.unshift(endPrimaryCursor);
    editor.pushUndoStop();
    editor.executeEdits(this.id, edits, endCursorState);
    editor.pushUndoStop();
  }
}
class TransposeAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.transpose",
      label: nls.localize2("editor.transpose", "Transpose Characters around the Cursor"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  run(_accessor, editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    const model = editor.getModel();
    if (model === null) {
      return;
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      if (!selection.isEmpty()) {
        continue;
      }
      const cursor = selection.getStartPosition();
      const maxColumn = model.getLineMaxColumn(cursor.lineNumber);
      if (cursor.column >= maxColumn) {
        if (cursor.lineNumber === model.getLineCount()) {
          continue;
        }
        const deleteSelection = new Range(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber + 1, 1);
        const chars = model.getValueInRange(deleteSelection).split("").reverse().join("");
        commands.push(new ReplaceCommand(new Selection(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber + 1, 1), chars));
      } else {
        const deleteSelection = new Range(cursor.lineNumber, Math.max(1, cursor.column - 1), cursor.lineNumber, cursor.column + 1);
        const chars = model.getValueInRange(deleteSelection).split("").reverse().join("");
        commands.push(new ReplaceCommandThatPreservesSelection(
          deleteSelection,
          chars,
          new Selection(cursor.lineNumber, cursor.column + 1, cursor.lineNumber, cursor.column + 1)
        ));
      }
    }
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class AbstractCaseAction extends EditorAction {
  run(_accessor, editor) {
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    const model = editor.getModel();
    if (model === null) {
      return;
    }
    const wordSeparators = editor.getOption(EditorOption.wordSeparators);
    const textEdits = [];
    for (const selection of selections) {
      if (selection.isEmpty()) {
        const cursor = selection.getStartPosition();
        const word = editor.getConfiguredWordAtPosition(cursor);
        if (!word) {
          continue;
        }
        const wordRange = new Range(cursor.lineNumber, word.startColumn, cursor.lineNumber, word.endColumn);
        const text = model.getValueInRange(wordRange);
        textEdits.push(EditOperation.replace(wordRange, this._modifyText(text, wordSeparators)));
      } else {
        const text = model.getValueInRange(selection);
        textEdits.push(EditOperation.replace(selection, this._modifyText(text, wordSeparators)));
      }
    }
    editor.pushUndoStop();
    editor.executeEdits(this.id, textEdits);
    editor.pushUndoStop();
  }
}
class UpperCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToUppercase",
      label: nls.localize2("editor.transformToUppercase", "Transform to Uppercase"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    return text.toLocaleUpperCase();
  }
}
class LowerCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToLowercase",
      label: nls.localize2("editor.transformToLowercase", "Transform to Lowercase"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    return text.toLocaleLowerCase();
  }
}
class BackwardsCompatibleRegExp {
  constructor(_pattern, _flags) {
    this._pattern = _pattern;
    this._flags = _flags;
    this._actual = null;
    this._evaluated = false;
  }
  get() {
    if (!this._evaluated) {
      this._evaluated = true;
      try {
        this._actual = new RegExp(this._pattern, this._flags);
      } catch (err) {
      }
    }
    return this._actual;
  }
  isSupported() {
    return this.get() !== null;
  }
}
const _TitleCaseAction = class _TitleCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToTitlecase",
      label: nls.localize2("editor.transformToTitlecase", "Transform to Title Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const titleBoundary = _TitleCaseAction.titleBoundary.get();
    if (!titleBoundary) {
      return text;
    }
    return text.toLocaleLowerCase().replace(titleBoundary, (b) => b.toLocaleUpperCase());
  }
};
_TitleCaseAction.titleBoundary = new BackwardsCompatibleRegExp("(^|[^\\p{L}\\p{N}']|((^|\\P{L})'))\\p{L}", "gmu");
let TitleCaseAction = _TitleCaseAction;
const _SnakeCaseAction = class _SnakeCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToSnakecase",
      label: nls.localize2("editor.transformToSnakecase", "Transform to Snake Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const caseBoundary = _SnakeCaseAction.caseBoundary.get();
    const singleLetters = _SnakeCaseAction.singleLetters.get();
    if (!caseBoundary || !singleLetters) {
      return text;
    }
    return text.replace(caseBoundary, "$1_$2").replace(singleLetters, "$1_$2$3").toLocaleLowerCase();
  }
};
_SnakeCaseAction.caseBoundary = new BackwardsCompatibleRegExp("(\\p{Ll})(\\p{Lu})", "gmu");
_SnakeCaseAction.singleLetters = new BackwardsCompatibleRegExp("(\\p{Lu}|\\p{N})(\\p{Lu})(\\p{Ll})", "gmu");
let SnakeCaseAction = _SnakeCaseAction;
const _CamelCaseAction = class _CamelCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToCamelcase",
      label: nls.localize2("editor.transformToCamelcase", "Transform to Camel Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const wordBoundary = /\r\n|\r|\n/.test(text) ? _CamelCaseAction.multiLineWordBoundary.get() : _CamelCaseAction.singleLineWordBoundary.get();
    const validWordStart = _CamelCaseAction.validWordStart.get();
    if (!wordBoundary || !validWordStart) {
      return text;
    }
    const words = text.split(wordBoundary);
    const firstWord = words.shift()?.replace(validWordStart, (start) => start.toLocaleLowerCase());
    return firstWord + words.map((word) => word.substring(0, 1).toLocaleUpperCase() + word.substring(1)).join("");
  }
};
_CamelCaseAction.singleLineWordBoundary = new BackwardsCompatibleRegExp("[_\\s-]+", "gm");
_CamelCaseAction.multiLineWordBoundary = new BackwardsCompatibleRegExp("[_-]+", "gm");
_CamelCaseAction.validWordStart = new BackwardsCompatibleRegExp("^(\\p{Lu}[^\\p{Lu}])", "gmu");
let CamelCaseAction = _CamelCaseAction;
const _PascalCaseAction = class _PascalCaseAction extends AbstractCaseAction {
  constructor() {
    super({
      id: "editor.action.transformToPascalcase",
      label: nls.localize2("editor.transformToPascalcase", "Transform to Pascal Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, wordSeparators) {
    const wordBoundary = _PascalCaseAction.wordBoundary.get();
    const wordBoundaryToMaintain = _PascalCaseAction.wordBoundaryToMaintain.get();
    const upperCaseWordMatcher = _PascalCaseAction.upperCaseWordMatcher.get();
    if (!wordBoundary || !wordBoundaryToMaintain || !upperCaseWordMatcher) {
      return text;
    }
    const wordsWithMaintainBoundaries = text.split(wordBoundaryToMaintain);
    const words = wordsWithMaintainBoundaries.map((word) => word.split(wordBoundary)).flat();
    return words.map((word) => {
      const normalizedWord = word.charAt(0).toLocaleUpperCase() + word.slice(1);
      const isAllCaps = normalizedWord.length > 1 && upperCaseWordMatcher.test(normalizedWord);
      if (isAllCaps) {
        return normalizedWord.charAt(0) + normalizedWord.slice(1).toLocaleLowerCase();
      }
      return normalizedWord;
    }).join("");
  }
};
_PascalCaseAction.wordBoundary = new BackwardsCompatibleRegExp("[_ \\t-]", "gm");
_PascalCaseAction.wordBoundaryToMaintain = new BackwardsCompatibleRegExp("(?<=\\.)", "gm");
_PascalCaseAction.upperCaseWordMatcher = new BackwardsCompatibleRegExp("^\\p{Lu}+$", "mu");
let PascalCaseAction = _PascalCaseAction;
const _KebabCaseAction = class _KebabCaseAction extends AbstractCaseAction {
  static isSupported() {
    const areAllRegexpsSupported = [
      this.caseBoundary,
      this.singleLetters,
      this.underscoreBoundary
    ].every((regexp) => regexp.isSupported());
    return areAllRegexpsSupported;
  }
  constructor() {
    super({
      id: "editor.action.transformToKebabcase",
      label: nls.localize2("editor.transformToKebabcase", "Transform to Kebab Case"),
      precondition: EditorContextKeys.writable,
      canTriggerInlineEdits: true
    });
  }
  _modifyText(text, _) {
    const caseBoundary = _KebabCaseAction.caseBoundary.get();
    const singleLetters = _KebabCaseAction.singleLetters.get();
    const underscoreBoundary = _KebabCaseAction.underscoreBoundary.get();
    if (!caseBoundary || !singleLetters || !underscoreBoundary) {
      return text;
    }
    return text.replace(underscoreBoundary, "$1-$3").replace(caseBoundary, "$1-$2").replace(singleLetters, "$1-$2").toLocaleLowerCase();
  }
};
_KebabCaseAction.caseBoundary = new BackwardsCompatibleRegExp("(\\p{Ll})(\\p{Lu})", "gmu");
_KebabCaseAction.singleLetters = new BackwardsCompatibleRegExp("(\\p{Lu}|\\p{N})(\\p{Lu}\\p{Ll})", "gmu");
_KebabCaseAction.underscoreBoundary = new BackwardsCompatibleRegExp("(\\S)(_)(\\S)", "gm");
let KebabCaseAction = _KebabCaseAction;
registerEditorAction(CopyLinesUpAction);
registerEditorAction(CopyLinesDownAction);
registerEditorAction(DuplicateSelectionAction);
registerEditorAction(MoveLinesUpAction);
registerEditorAction(MoveLinesDownAction);
registerEditorAction(SortLinesAscendingAction);
registerEditorAction(SortLinesDescendingAction);
registerEditorAction(DeleteDuplicateLinesAction);
registerEditorAction(TrimTrailingWhitespaceAction);
registerEditorAction(DeleteLinesAction);
registerEditorAction(IndentLinesAction);
registerEditorAction(OutdentLinesAction);
registerEditorAction(InsertLineBeforeAction);
registerEditorAction(InsertLineAfterAction);
registerEditorAction(DeleteAllLeftAction);
registerEditorAction(DeleteAllRightAction);
registerEditorAction(JoinLinesAction);
registerEditorAction(TransposeAction);
registerEditorAction(UpperCaseAction);
registerEditorAction(LowerCaseAction);
registerEditorAction(ReverseLinesAction);
if (SnakeCaseAction.caseBoundary.isSupported() && SnakeCaseAction.singleLetters.isSupported()) {
  registerEditorAction(SnakeCaseAction);
}
if (CamelCaseAction.singleLineWordBoundary.isSupported() && CamelCaseAction.multiLineWordBoundary.isSupported()) {
  registerEditorAction(CamelCaseAction);
}
if (PascalCaseAction.wordBoundary.isSupported()) {
  registerEditorAction(PascalCaseAction);
}
if (TitleCaseAction.titleBoundary.isSupported()) {
  registerEditorAction(TitleCaseAction);
}
if (KebabCaseAction.isSupported()) {
  registerEditorAction(KebabCaseAction);
}
export {
  AbstractCaseAction,
  AbstractDeleteAllToBoundaryAction,
  AbstractSortLinesAction,
  CamelCaseAction,
  DeleteAllLeftAction,
  DeleteAllRightAction,
  DeleteDuplicateLinesAction,
  DeleteLinesAction,
  DuplicateSelectionAction,
  IndentLinesAction,
  InsertLineAfterAction,
  InsertLineBeforeAction,
  JoinLinesAction,
  KebabCaseAction,
  LowerCaseAction,
  PascalCaseAction,
  ReverseLinesAction,
  SnakeCaseAction,
  SortLinesAscendingAction,
  SortLinesDescendingAction,
  TitleCaseAction,
  TransposeAction,
  TrimTrailingWhitespaceAction,
  UpperCaseAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2xpbmVzT3BlcmF0aW9ucy9icm93c2VyL2xpbmVzT3BlcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZUNvZGVFZGl0b3IsIElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgSUFjdGlvbk9wdGlvbnMsIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJlcGxhY2VDb21tYW5kLCBSZXBsYWNlQ29tbWFuZFRoYXRQcmVzZXJ2ZXNTZWxlY3Rpb24sIFJlcGxhY2VDb21tYW5kVGhhdFNlbGVjdHNUZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbW1hbmRzL3JlcGxhY2VDb21tYW5kLmpzJztcbmltcG9ydCB7IFRyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbW1hbmRzL3RyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uLCBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBFbnRlck9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3IvY3Vyc29yVHlwZUVkaXRPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IFR5cGVPcGVyYXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvci9jdXJzb3JUeXBlT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29weUxpbmVzQ29tbWFuZCB9IGZyb20gJy4vY29weUxpbmVzQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBNb3ZlTGluZXNDb21tYW5kIH0gZnJvbSAnLi9tb3ZlTGluZXNDb21tYW5kLmpzJztcbmltcG9ydCB7IFNvcnRMaW5lc0NvbW1hbmQgfSBmcm9tICcuL3NvcnRMaW5lc0NvbW1hbmQuanMnO1xuXG4vLyBjb3B5IGxpbmVzXG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0Q29weUxpbmVzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRvd246IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoZG93bjogYm9vbGVhbiwgb3B0czogSUFjdGlvbk9wdGlvbnMpIHtcblx0XHRzdXBlcihvcHRzKTtcblx0XHR0aGlzLmRvd24gPSBkb3duO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCkubWFwKChzZWxlY3Rpb24sIGluZGV4KSA9PiAoeyBzZWxlY3Rpb24sIGluZGV4LCBpZ25vcmU6IGZhbHNlIH0pKTtcblx0XHRzZWxlY3Rpb25zLnNvcnQoKGEsIGIpID0+IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLnNlbGVjdGlvbiwgYi5zZWxlY3Rpb24pKTtcblxuXHRcdC8vIFJlbW92ZSBzZWxlY3Rpb25zIHRoYXQgd291bGQgcmVzdWx0IGluIGNvcHlpbmcgdGhlIHNhbWUgbGluZVxuXHRcdGxldCBwcmV2ID0gc2VsZWN0aW9uc1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHNlbGVjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnIgPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0aWYgKHByZXYuc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPT09IGN1cnIuc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHQvLyB0aGVzZSB0d28gc2VsZWN0aW9ucyB3b3VsZCBjb3B5IHRoZSBzYW1lIGxpbmVcblx0XHRcdFx0aWYgKHByZXYuaW5kZXggPCBjdXJyLmluZGV4KSB7XG5cdFx0XHRcdFx0Ly8gcHJldiB3aW5zXG5cdFx0XHRcdFx0Y3Vyci5pZ25vcmUgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGN1cnIgd2luc1xuXHRcdFx0XHRcdHByZXYuaWdub3JlID0gdHJ1ZTtcblx0XHRcdFx0XHRwcmV2ID0gY3Vycjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0Y29tbWFuZHMucHVzaChuZXcgQ29weUxpbmVzQ29tbWFuZChzZWxlY3Rpb24uc2VsZWN0aW9uLCB0aGlzLmRvd24sIHNlbGVjdGlvbi5pZ25vcmUpKTtcblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBjb21tYW5kcyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbmNsYXNzIENvcHlMaW5lc1VwQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDb3B5TGluZXNBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihmYWxzZSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmNvcHlMaW5lc1VwQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5jb3B5VXAnLCBcIkNvcHkgTGluZSBVcFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvdyB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRzOiB7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJTZWxlY3Rpb25NZW51LFxuXHRcdFx0XHRncm91cDogJzJfbGluZScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUNvcHlMaW5lc1VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29weSBMaW5lIFVwXCIpLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBDb3B5TGluZXNEb3duQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDb3B5TGluZXNBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih0cnVlLCB7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uY29weUxpbmVzRG93bkFjdGlvbicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMuY29weURvd24nLCBcIkNvcHkgTGluZSBEb3duXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRzOiB7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJTZWxlY3Rpb25NZW51LFxuXHRcdFx0XHRncm91cDogJzJfbGluZScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUNvcHlMaW5lc0Rvd24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQ28mJnB5IExpbmUgRG93blwiKSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIER1cGxpY2F0ZVNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmR1cGxpY2F0ZVNlbGVjdGlvbicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZHVwbGljYXRlU2VsZWN0aW9uJywgXCJEdXBsaWNhdGUgU2VsZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdG1lbnVPcHRzOiB7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJTZWxlY3Rpb25NZW51LFxuXHRcdFx0XHRncm91cDogJzJfbGluZScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUR1cGxpY2F0ZVNlbGVjdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkR1cGxpY2F0ZSBTZWxlY3Rpb25cIiksXG5cdFx0XHRcdG9yZGVyOiA1XG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKG5ldyBDb3B5TGluZXNDb21tYW5kKHNlbGVjdGlvbiwgdHJ1ZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaW5zZXJ0U2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbihzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgc2VsZWN0aW9uLmVuZENvbHVtbiwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRDb2x1bW4pO1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKG5ldyBSZXBsYWNlQ29tbWFuZFRoYXRTZWxlY3RzVGV4dChpbnNlcnRTZWxlY3Rpb24sIG1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24pKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5pZCwgY29tbWFuZHMpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxufVxuXG4vLyBtb3ZlIGxpbmVzXG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0TW92ZUxpbmVzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRvd246IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoZG93bjogYm9vbGVhbiwgb3B0czogSUFjdGlvbk9wdGlvbnMpIHtcblx0XHRzdXBlcihvcHRzKTtcblx0XHR0aGlzLmRvd24gPSBkb3duO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKSB8fCBbXTtcblx0XHRjb25zdCBhdXRvSW5kZW50ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXV0b0luZGVudCk7XG5cblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRjb21tYW5kcy5wdXNoKG5ldyBNb3ZlTGluZXNDb21tYW5kKHNlbGVjdGlvbiwgdGhpcy5kb3duLCBhdXRvSW5kZW50LCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5pZCwgY29tbWFuZHMpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxufVxuXG5jbGFzcyBNb3ZlTGluZXNVcEFjdGlvbiBleHRlbmRzIEFic3RyYWN0TW92ZUxpbmVzQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5tb3ZlTGluZXNVcEFjdGlvbicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMubW92ZVVwJywgXCJNb3ZlIExpbmUgVXBcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9saW5lJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pTW92ZUxpbmVzVXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiTW8mJnZlIExpbmUgVXBcIiksXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIE1vdmVMaW5lc0Rvd25BY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdE1vdmVMaW5lc0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5tb3ZlTGluZXNEb3duQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5tb3ZlRG93bicsIFwiTW92ZSBMaW5lIERvd25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvdyB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRzOiB7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLk1lbnViYXJTZWxlY3Rpb25NZW51LFxuXHRcdFx0XHRncm91cDogJzJfbGluZScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaU1vdmVMaW5lc0Rvd24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiTW92ZSAmJkxpbmUgRG93blwiKSxcblx0XHRcdFx0b3JkZXI6IDRcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0U29ydExpbmVzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBkZXNjZW5kaW5nOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGRlc2NlbmRpbmc6IGJvb2xlYW4sIG9wdHM6IElBY3Rpb25PcHRpb25zKSB7XG5cdFx0c3VwZXIob3B0cyk7XG5cdFx0dGhpcy5kZXNjZW5kaW5nID0gZGVzY2VuZGluZztcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0bGV0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBzZWxlY3Rpb25zWzBdLmlzU2luZ2xlTGluZSgpKSB7XG5cdFx0XHQvLyBBcHBseSB0byB3aG9sZSBkb2N1bWVudC5cblx0XHRcdHNlbGVjdGlvbnMgPSBbbmV3IFNlbGVjdGlvbigxLCAxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbC5nZXRMaW5lQ291bnQoKSkpXTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRpZiAoIVNvcnRMaW5lc0NvbW1hbmQuY2FuUnVuKGVkaXRvci5nZXRNb2RlbCgpLCBzZWxlY3Rpb24sIHRoaXMuZGVzY2VuZGluZykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IFNvcnRMaW5lc0NvbW1hbmQoc2VsZWN0aW9uc1tpXSwgdGhpcy5kZXNjZW5kaW5nKTtcblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBjb21tYW5kcyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTb3J0TGluZXNBc2NlbmRpbmdBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdFNvcnRMaW5lc0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKGZhbHNlLCB7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uc29ydExpbmVzQXNjZW5kaW5nJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5zb3J0QXNjZW5kaW5nJywgXCJTb3J0IExpbmVzIEFzY2VuZGluZ1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNvcnRMaW5lc0Rlc2NlbmRpbmdBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdFNvcnRMaW5lc0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5zb3J0TGluZXNEZXNjZW5kaW5nJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5zb3J0RGVzY2VuZGluZycsIFwiU29ydCBMaW5lcyBEZXNjZW5kaW5nXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlRHVwbGljYXRlTGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ucmVtb3ZlRHVwbGljYXRlTGluZXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLmRlbGV0ZUR1cGxpY2F0ZXMnLCBcIkRlbGV0ZSBEdXBsaWNhdGUgTGluZXNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWw6IElUZXh0TW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwuZ2V0TGluZUNvdW50KCkgPT09IDEgJiYgbW9kZWwuZ2V0TGluZU1heENvbHVtbigxKSA9PT0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0Y29uc3QgZW5kQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdID0gW107XG5cblx0XHRsZXQgbGluZXNEZWxldGVkID0gMDtcblx0XHRsZXQgdXBkYXRlU2VsZWN0aW9uID0gdHJ1ZTtcblxuXHRcdGxldCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoc2VsZWN0aW9ucy5sZW5ndGggPT09IDEgJiYgc2VsZWN0aW9uc1swXS5pc1NpbmdsZUxpbmUoKSkge1xuXHRcdFx0Ly8gQXBwbHkgdG8gd2hvbGUgZG9jdW1lbnQuXG5cdFx0XHRzZWxlY3Rpb25zID0gW25ldyBTZWxlY3Rpb24oMSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCksIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWwuZ2V0TGluZUNvdW50KCkpKV07XG5cdFx0XHR1cGRhdGVTZWxlY3Rpb24gPSBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRjb25zdCB1bmlxdWVMaW5lcyA9IG5ldyBTZXQoKTtcblx0XHRcdGNvbnN0IGxpbmVzID0gW107XG5cblx0XHRcdGZvciAobGV0IGkgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyOyBpIDw9IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KGkpO1xuXG5cdFx0XHRcdGlmICh1bmlxdWVMaW5lcy5oYXMobGluZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxpbmVzLnB1c2gobGluZSk7XG5cdFx0XHRcdHVuaXF1ZUxpbmVzLmFkZChsaW5lKTtcblx0XHRcdH1cblxuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb25Ub1JlcGxhY2UgPSBuZXcgU2VsZWN0aW9uKFxuXHRcdFx0XHRzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHQxLFxuXHRcdFx0XHRzZWxlY3Rpb24uZW5kTGluZU51bWJlcixcblx0XHRcdFx0bW9kZWwuZ2V0TGluZU1heENvbHVtbihzZWxlY3Rpb24uZW5kTGluZU51bWJlcilcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGFkanVzdGVkU2VsZWN0aW9uU3RhcnQgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyIC0gbGluZXNEZWxldGVkO1xuXHRcdFx0Y29uc3QgZmluYWxTZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKFxuXHRcdFx0XHRhZGp1c3RlZFNlbGVjdGlvblN0YXJ0LFxuXHRcdFx0XHQxLFxuXHRcdFx0XHRhZGp1c3RlZFNlbGVjdGlvblN0YXJ0ICsgbGluZXMubGVuZ3RoIC0gMSxcblx0XHRcdFx0bGluZXNbbGluZXMubGVuZ3RoIC0gMV0ubGVuZ3RoICsgMVxuXHRcdFx0KTtcblxuXHRcdFx0ZWRpdHMucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2Uoc2VsZWN0aW9uVG9SZXBsYWNlLCBsaW5lcy5qb2luKCdcXG4nKSkpO1xuXHRcdFx0ZW5kQ3Vyc29yU3RhdGUucHVzaChmaW5hbFNlbGVjdGlvbik7XG5cblx0XHRcdGxpbmVzRGVsZXRlZCArPSAoc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgLSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICsgMSkgLSBsaW5lcy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlRWRpdHModGhpcy5pZCwgZWRpdHMsIHVwZGF0ZVNlbGVjdGlvbiA/IGVuZEN1cnNvclN0YXRlIDogdW5kZWZpbmVkKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJldmVyc2VMaW5lc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5yZXZlcnNlTGluZXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLnJldmVyc2VMaW5lcycsIFwiUmV2ZXJzZSBsaW5lc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsOiBJVGV4dE1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRsZXQgc2VsZWN0aW9ucyA9IG9yaWdpbmFsU2VsZWN0aW9ucztcblx0XHRpZiAoc2VsZWN0aW9ucy5sZW5ndGggPT09IDEgJiYgc2VsZWN0aW9uc1swXS5pc1NpbmdsZUxpbmUoKSkge1xuXHRcdFx0Ly8gQXBwbHkgdG8gd2hvbGUgZG9jdW1lbnQuXG5cdFx0XHRzZWxlY3Rpb25zID0gW25ldyBTZWxlY3Rpb24oMSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCksIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWwuZ2V0TGluZUNvdW50KCkpKV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHRpbmdTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZWxlY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTZWxlY3Rpb24gPSBvcmlnaW5hbFNlbGVjdGlvbnNbaV07XG5cdFx0XHRsZXQgZW5kTGluZU51bWJlciA9IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPCBzZWxlY3Rpb24uZW5kTGluZU51bWJlciAmJiBzZWxlY3Rpb24uZW5kQ29sdW1uID09PSAxKSB7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXItLTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJhbmdlOiBSYW5nZSA9IG5ldyBSYW5nZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCAxLCBlbmRMaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpKTtcblxuXHRcdFx0Ly8gRXhjbHVkZSBsYXN0IGxpbmUgaWYgZW1wdHkgYW5kIHdlJ3JlIGF0IHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50XG5cdFx0XHRpZiAoZW5kTGluZU51bWJlciA9PT0gbW9kZWwuZ2V0TGluZUNvdW50KCkgJiYgbW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2UuZW5kTGluZU51bWJlcikgPT09ICcnKSB7XG5cdFx0XHRcdHJhbmdlID0gcmFuZ2Uuc2V0RW5kUG9zaXRpb24ocmFuZ2UuZW5kTGluZU51bWJlciAtIDEsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocmFuZ2UuZW5kTGluZU51bWJlciAtIDEpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gcmFuZ2UuZW5kTGluZU51bWJlcjsgaSA+PSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGktLSkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKG1vZGVsLmdldExpbmVDb250ZW50KGkpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXQ6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0gRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHJhbmdlLCBsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0XHRlZGl0cy5wdXNoKGVkaXQpO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVMaW5lTnVtYmVyID0gZnVuY3Rpb24gKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiBsaW5lTnVtYmVyIDw9IHJhbmdlLmVuZExpbmVOdW1iZXIgPyByYW5nZS5lbmRMaW5lTnVtYmVyIC0gbGluZU51bWJlciArIHJhbmdlLnN0YXJ0TGluZU51bWJlciA6IGxpbmVOdW1iZXI7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdXBkYXRlU2VsZWN0aW9uID0gZnVuY3Rpb24gKHNlbDogU2VsZWN0aW9uKTogU2VsZWN0aW9uIHtcblx0XHRcdFx0aWYgKHNlbC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHQvLyBrZWVwIGp1c3QgdGhlIGN1cnNvclxuXHRcdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKHVwZGF0ZUxpbmVOdW1iZXIoc2VsLnBvc2l0aW9uTGluZU51bWJlciksIHNlbC5wb3NpdGlvbkNvbHVtbiwgdXBkYXRlTGluZU51bWJlcihzZWwucG9zaXRpb25MaW5lTnVtYmVyKSwgc2VsLnBvc2l0aW9uQ29sdW1uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBrZWVwIHNlbGVjdGlvbiAtIG1haW50YWluIGRpcmVjdGlvbiBieSBjcmVhdGluZyBiYWNrd2FyZCBzZWxlY3Rpb25cblx0XHRcdFx0XHRjb25zdCBuZXdTZWxlY3Rpb25TdGFydCA9IHVwZGF0ZUxpbmVOdW1iZXIoc2VsLnNlbGVjdGlvblN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdFx0Y29uc3QgbmV3UG9zaXRpb24gPSB1cGRhdGVMaW5lTnVtYmVyKHNlbC5wb3NpdGlvbkxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvblN0YXJ0Q29sdW1uID0gc2VsLnNlbGVjdGlvblN0YXJ0Q29sdW1uO1xuXHRcdFx0XHRcdGNvbnN0IG5ld1Bvc2l0aW9uQ29sdW1uID0gc2VsLnBvc2l0aW9uQ29sdW1uO1xuXG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIHNlbGVjdGlvbjogZnJvbSAobmV3U2VsZWN0aW9uU3RhcnQsIG5ld1NlbGVjdGlvblN0YXJ0Q29sdW1uKSB0byAobmV3UG9zaXRpb24sIG5ld1Bvc2l0aW9uQ29sdW1uKVxuXHRcdFx0XHRcdC8vIEFmdGVyIHJldmVyc2FsOiBmcm9tICgzLCAyKSB0byAoMSwgMylcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihuZXdTZWxlY3Rpb25TdGFydCwgbmV3U2VsZWN0aW9uU3RhcnRDb2x1bW4sIG5ld1Bvc2l0aW9uLCBuZXdQb3NpdGlvbkNvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRyZXN1bHRpbmdTZWxlY3Rpb25zLnB1c2godXBkYXRlU2VsZWN0aW9uKG9yaWdpbmFsU2VsZWN0aW9uKSk7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlRWRpdHModGhpcy5pZCwgZWRpdHMsIHJlc3VsdGluZ1NlbGVjdGlvbnMpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUFyZ3Mge1xuXHRyZWFzb24/OiAnYXV0by1zYXZlJztcbn1cblxuZXhwb3J0IGNsYXNzIFRyaW1UcmFpbGluZ1doaXRlc3BhY2VBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmFjdGlvbi50cmltVHJhaWxpbmdXaGl0ZXNwYWNlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUFjdGlvbi5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy50cmltVHJhaWxpbmdXaGl0ZXNwYWNlJywgXCJUcmltIFRyYWlsaW5nIFdoaXRlc3BhY2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVgpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IFRyaW1UcmFpbGluZ1doaXRlc3BhY2VBcmdzKTogdm9pZCB7XG5cblx0XHRsZXQgY3Vyc29yczogUG9zaXRpb25bXSA9IFtdO1xuXHRcdGlmIChhcmdzLnJlYXNvbiA9PT0gJ2F1dG8tc2F2ZScpIHtcblx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vZWRpdG9yY29uZmlnL2VkaXRvcmNvbmZpZy12c2NvZGUvaXNzdWVzLzQ3XG5cdFx0XHQvLyBJdCBpcyB2ZXJ5IGNvbnZlbmllbnQgZm9yIHRoZSBlZGl0b3IgY29uZmlnIGV4dGVuc2lvbiB0byBpbnZva2UgdGhpcyBhY3Rpb24uXG5cdFx0XHQvLyBTbywgaWYgd2UgZ2V0IGEgcmVhc29uOidhdXRvLXNhdmUnIHBhc3NlZCBpbiwgbGV0J3MgcHJlc2VydmUgY3Vyc29yIHBvc2l0aW9ucy5cblx0XHRcdGN1cnNvcnMgPSAoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSB8fCBbXSkubWFwKHMgPT4gbmV3IFBvc2l0aW9uKHMucG9zaXRpb25MaW5lTnVtYmVyLCBzLnBvc2l0aW9uQ29sdW1uKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmIChzZWxlY3Rpb24gPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWcgPSBfYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCB0cmltSW5SZWdleEFuZFN0cmluZ3MgPSBjb25maWcuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2ZpbGVzLnRyaW1UcmFpbGluZ1doaXRlc3BhY2VJblJlZ2V4QW5kU3RyaW5ncycsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbD8uZ2V0TGFuZ3VhZ2VJZCgpLCByZXNvdXJjZTogbW9kZWw/LnVyaSB9KTtcblxuXHRcdGNvbnN0IGNvbW1hbmQgPSBuZXcgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQoc2VsZWN0aW9uLCBjdXJzb3JzLCB0cmltSW5SZWdleEFuZFN0cmluZ3MpO1xuXG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5pZCwgW2NvbW1hbmRdKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxuLy8gZGVsZXRlIGxpbmVzXG5cbmludGVyZmFjZSBJRGVsZXRlTGluZXNPcGVyYXRpb24ge1xuXHRzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0c2VsZWN0aW9uU3RhcnRDb2x1bW46IG51bWJlcjtcblx0ZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRwb3NpdGlvbkNvbHVtbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlTGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5kZWxldGVMaW5lcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMuZGVsZXRlJywgXCJEZWxldGUgTGluZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUssXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BzID0gdGhpcy5fZ2V0TGluZXNUb1JlbW92ZShlZGl0b3IpO1xuXG5cdFx0Y29uc3QgbW9kZWw6IElUZXh0TW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwuZ2V0TGluZUNvdW50KCkgPT09IDEgJiYgbW9kZWwuZ2V0TGluZU1heENvbHVtbigxKSA9PT0gMSkge1xuXHRcdFx0Ly8gTW9kZWwgaXMgZW1wdHlcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbGluZXNEZWxldGVkID0gMDtcblx0XHRjb25zdCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBvcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG9wID0gb3BzW2ldO1xuXG5cdFx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gb3Auc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0bGV0IGVuZExpbmVOdW1iZXIgPSBvcC5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0XHRsZXQgc3RhcnRDb2x1bW4gPSAxO1xuXHRcdFx0bGV0IGVuZENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcik7XG5cdFx0XHRpZiAoZW5kTGluZU51bWJlciA8IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXIgKz0gMTtcblx0XHRcdFx0ZW5kQ29sdW1uID0gMTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhcnRMaW5lTnVtYmVyID4gMSkge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgLT0gMTtcblx0XHRcdFx0c3RhcnRDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRzLnB1c2goRWRpdE9wZXJhdGlvbi5yZXBsYWNlKG5ldyBTZWxlY3Rpb24oc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKSwgJycpKTtcblx0XHRcdGN1cnNvclN0YXRlLnB1c2gobmV3IFNlbGVjdGlvbihzdGFydExpbmVOdW1iZXIgLSBsaW5lc0RlbGV0ZWQsIG9wLnBvc2l0aW9uQ29sdW1uLCBzdGFydExpbmVOdW1iZXIgLSBsaW5lc0RlbGV0ZWQsIG9wLnBvc2l0aW9uQ29sdW1uKSk7XG5cdFx0XHRsaW5lc0RlbGV0ZWQgKz0gKG9wLmVuZExpbmVOdW1iZXIgLSBvcC5zdGFydExpbmVOdW1iZXIgKyAxKTtcblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cyh0aGlzLmlkLCBlZGl0cywgY3Vyc29yU3RhdGUpO1xuXHRcdGVkaXRvci5yZXZlYWxBbGxDdXJzb3JzKHRydWUpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExpbmVzVG9SZW1vdmUoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IElEZWxldGVMaW5lc09wZXJhdGlvbltdIHtcblx0XHQvLyBDb25zdHJ1Y3QgZGVsZXRlIG9wZXJhdGlvbnNcblx0XHRjb25zdCBvcGVyYXRpb25zOiBJRGVsZXRlTGluZXNPcGVyYXRpb25bXSA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCkubWFwKChzKSA9PiB7XG5cblx0XHRcdGxldCBlbmRMaW5lTnVtYmVyID0gcy5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0aWYgKHMuc3RhcnRMaW5lTnVtYmVyIDwgcy5lbmRMaW5lTnVtYmVyICYmIHMuZW5kQ29sdW1uID09PSAxKSB7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXIgLT0gMTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnRDb2x1bW46IHMuc2VsZWN0aW9uU3RhcnRDb2x1bW4sXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdHBvc2l0aW9uQ29sdW1uOiBzLnBvc2l0aW9uQ29sdW1uXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Ly8gU29ydCBkZWxldGUgb3BlcmF0aW9uc1xuXHRcdG9wZXJhdGlvbnMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEuc3RhcnRMaW5lTnVtYmVyID09PSBiLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gYS5lbmRMaW5lTnVtYmVyIC0gYi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGEuc3RhcnRMaW5lTnVtYmVyIC0gYi5zdGFydExpbmVOdW1iZXI7XG5cdFx0fSk7XG5cblx0XHQvLyBNZXJnZSBkZWxldGUgb3BlcmF0aW9ucyB3aGljaCBhcmUgYWRqYWNlbnQgb3Igb3ZlcmxhcHBpbmdcblx0XHRjb25zdCBtZXJnZWRPcGVyYXRpb25zOiBJRGVsZXRlTGluZXNPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGxldCBwcmV2aW91c09wZXJhdGlvbiA9IG9wZXJhdGlvbnNbMF07XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBvcGVyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAocHJldmlvdXNPcGVyYXRpb24uZW5kTGluZU51bWJlciArIDEgPj0gb3BlcmF0aW9uc1tpXS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gTWVyZ2UgY3VycmVudCBvcGVyYXRpb25zIGludG8gdGhlIHByZXZpb3VzIG9uZVxuXHRcdFx0XHRwcmV2aW91c09wZXJhdGlvbi5lbmRMaW5lTnVtYmVyID0gb3BlcmF0aW9uc1tpXS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUHVzaCBwcmV2aW91cyBvcGVyYXRpb25cblx0XHRcdFx0bWVyZ2VkT3BlcmF0aW9ucy5wdXNoKHByZXZpb3VzT3BlcmF0aW9uKTtcblx0XHRcdFx0cHJldmlvdXNPcGVyYXRpb24gPSBvcGVyYXRpb25zW2ldO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBQdXNoIHRoZSBsYXN0IG9wZXJhdGlvblxuXHRcdG1lcmdlZE9wZXJhdGlvbnMucHVzaChwcmV2aW91c09wZXJhdGlvbik7XG5cblx0XHRyZXR1cm4gbWVyZ2VkT3BlcmF0aW9ucztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5kZW50TGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uaW5kZW50TGluZXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLmluZGVudCcsIFwiSW5kZW50IExpbmVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBUeXBlT3BlcmF0aW9ucy5pbmRlbnQodmlld01vZGVsLmN1cnNvckNvbmZpZywgZWRpdG9yLmdldE1vZGVsKCksIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxuY2xhc3MgT3V0ZGVudExpbmVzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLm91dGRlbnRMaW5lcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMub3V0ZGVudCcsIFwiT3V0ZGVudCBMaW5lXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJyYWNrZXRMZWZ0LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Q29yZUVkaXRpbmdDb21tYW5kcy5PdXRkZW50LnJ1bkVkaXRvckNvbW1hbmQoX2FjY2Vzc29yLCBlZGl0b3IsIG51bGwpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnNlcnRMaW5lQmVmb3JlQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLmluc2VydExpbmVCZWZvcmUnO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSW5zZXJ0TGluZUJlZm9yZUFjdGlvbi5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5pbnNlcnRCZWZvcmUnLCBcIkluc2VydCBMaW5lIEFib3ZlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBFbnRlck9wZXJhdGlvbi5saW5lSW5zZXJ0QmVmb3JlKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIGVkaXRvci5nZXRNb2RlbCgpLCBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc2VydExpbmVBZnRlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmFjdGlvbi5pbnNlcnRMaW5lQWZ0ZXInO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSW5zZXJ0TGluZUFmdGVyQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmVzLmluc2VydEFmdGVyJywgXCJJbnNlcnQgTGluZSBCZWxvd1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5pZCwgRW50ZXJPcGVyYXRpb24ubGluZUluc2VydEFmdGVyKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIGVkaXRvci5nZXRNb2RlbCgpLCBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpKSk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RGVsZXRlQWxsVG9Cb3VuZGFyeUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmltYXJ5Q3Vyc29yID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0Y29uc3QgcmFuZ2VzVG9EZWxldGUgPSB0aGlzLl9nZXRSYW5nZXNUb0RlbGV0ZShlZGl0b3IpO1xuXHRcdC8vIG1lcmdlIG92ZXJsYXBwaW5nIHNlbGVjdGlvbnNcblx0XHRjb25zdCBlZmZlY3RpdmVSYW5nZXM6IFJhbmdlW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBjb3VudCA9IHJhbmdlc1RvRGVsZXRlLmxlbmd0aCAtIDE7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IHJhbmdlc1RvRGVsZXRlW2ldO1xuXHRcdFx0Y29uc3QgbmV4dFJhbmdlID0gcmFuZ2VzVG9EZWxldGVbaSArIDFdO1xuXG5cdFx0XHRpZiAoUmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKHJhbmdlLCBuZXh0UmFuZ2UpID09PSBudWxsKSB7XG5cdFx0XHRcdGVmZmVjdGl2ZVJhbmdlcy5wdXNoKHJhbmdlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJhbmdlc1RvRGVsZXRlW2kgKyAxXSA9IFJhbmdlLnBsdXNSYW5nZShyYW5nZSwgbmV4dFJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlZmZlY3RpdmVSYW5nZXMucHVzaChyYW5nZXNUb0RlbGV0ZVtyYW5nZXNUb0RlbGV0ZS5sZW5ndGggLSAxXSk7XG5cblx0XHRjb25zdCBlbmRDdXJzb3JTdGF0ZSA9IHRoaXMuX2dldEVuZEN1cnNvclN0YXRlKHByaW1hcnlDdXJzb3IsIGVmZmVjdGl2ZVJhbmdlcyk7XG5cblx0XHRjb25zdCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IGVmZmVjdGl2ZVJhbmdlcy5tYXAocmFuZ2UgPT4ge1xuXHRcdFx0cmV0dXJuIEVkaXRPcGVyYXRpb24ucmVwbGFjZShyYW5nZSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlRWRpdHModGhpcy5pZCwgZWRpdHMsIGVuZEN1cnNvclN0YXRlKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSB0aGUgY3Vyc29yIHN0YXRlIGFmdGVyIHRoZSBlZGl0IG9wZXJhdGlvbnMgd2VyZSBhcHBsaWVkLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRFbmRDdXJzb3JTdGF0ZShwcmltYXJ5Q3Vyc29yOiBSYW5nZSwgcmFuZ2VzVG9EZWxldGU6IFJhbmdlW10pOiBTZWxlY3Rpb25bXTtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldFJhbmdlc1RvRGVsZXRlKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBSYW5nZVtdO1xufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlQWxsTGVmdEFjdGlvbiBleHRlbmRzIEFic3RyYWN0RGVsZXRlQWxsVG9Cb3VuZGFyeUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVsZXRlQWxsTGVmdCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGluZXMuZGVsZXRlQWxsTGVmdCcsIFwiRGVsZXRlIEFsbCBMZWZ0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0RW5kQ3Vyc29yU3RhdGUocHJpbWFyeUN1cnNvcjogUmFuZ2UsIHJhbmdlc1RvRGVsZXRlOiBSYW5nZVtdKTogU2VsZWN0aW9uW10ge1xuXHRcdGxldCBlbmRQcmltYXJ5Q3Vyc29yOiBTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBlbmRDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRsZXQgZGVsZXRlZExpbmVzID0gMDtcblxuXHRcdHJhbmdlc1RvRGVsZXRlLmZvckVhY2gocmFuZ2UgPT4ge1xuXHRcdFx0bGV0IGVuZEN1cnNvcjtcblx0XHRcdGlmIChyYW5nZS5lbmRDb2x1bW4gPT09IDEgJiYgZGVsZXRlZExpbmVzID4gMCkge1xuXHRcdFx0XHRjb25zdCBuZXdTdGFydExpbmUgPSByYW5nZS5zdGFydExpbmVOdW1iZXIgLSBkZWxldGVkTGluZXM7XG5cdFx0XHRcdGVuZEN1cnNvciA9IG5ldyBTZWxlY3Rpb24obmV3U3RhcnRMaW5lLCByYW5nZS5zdGFydENvbHVtbiwgbmV3U3RhcnRMaW5lLCByYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbmRDdXJzb3IgPSBuZXcgU2VsZWN0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWxldGVkTGluZXMgKz0gcmFuZ2UuZW5kTGluZU51bWJlciAtIHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0aWYgKHJhbmdlLmludGVyc2VjdFJhbmdlcyhwcmltYXJ5Q3Vyc29yKSkge1xuXHRcdFx0XHRlbmRQcmltYXJ5Q3Vyc29yID0gZW5kQ3Vyc29yO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW5kQ3Vyc29yU3RhdGUucHVzaChlbmRDdXJzb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGVuZFByaW1hcnlDdXJzb3IpIHtcblx0XHRcdGVuZEN1cnNvclN0YXRlLnVuc2hpZnQoZW5kUHJpbWFyeUN1cnNvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVuZEN1cnNvclN0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRSYW5nZXNUb0RlbGV0ZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRsZXQgcmFuZ2VzVG9EZWxldGU6IFJhbmdlW10gPSBzZWxlY3Rpb25zO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyYW5nZXNUb0RlbGV0ZS5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0cmFuZ2VzVG9EZWxldGUgPSByYW5nZXNUb0RlbGV0ZS5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24uc3RhcnRDb2x1bW4gPT09IDEpIHtcblx0XHRcdFx0XHRjb25zdCBkZWxldGVGcm9tTGluZSA9IE1hdGgubWF4KDEsIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0XHRjb25zdCBkZWxldGVGcm9tQ29sdW1uID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gMSA/IDEgOiBtb2RlbC5nZXRMaW5lTGVuZ3RoKGRlbGV0ZUZyb21MaW5lKSArIDE7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShkZWxldGVGcm9tTGluZSwgZGVsZXRlRnJvbUNvbHVtbiwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCAxLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIDEsIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uZW5kQ29sdW1uKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByYW5nZXNUb0RlbGV0ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlQWxsUmlnaHRBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdERlbGV0ZUFsbFRvQm91bmRhcnlBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2RlbGV0ZUFsbFJpZ2h0Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5kZWxldGVBbGxSaWdodCcsIFwiRGVsZXRlIEFsbCBSaWdodFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlLLCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRGVsZXRlXSB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0RW5kQ3Vyc29yU3RhdGUocHJpbWFyeUN1cnNvcjogUmFuZ2UsIHJhbmdlc1RvRGVsZXRlOiBSYW5nZVtdKTogU2VsZWN0aW9uW10ge1xuXHRcdGxldCBlbmRQcmltYXJ5Q3Vyc29yOiBTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBlbmRDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmFuZ2VzVG9EZWxldGUubGVuZ3RoLCBvZmZzZXQgPSAwOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gcmFuZ2VzVG9EZWxldGVbaV07XG5cdFx0XHRjb25zdCBlbmRDdXJzb3IgPSBuZXcgU2VsZWN0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIG9mZnNldCwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIG9mZnNldCwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXG5cdFx0XHRpZiAocmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKHByaW1hcnlDdXJzb3IpKSB7XG5cdFx0XHRcdGVuZFByaW1hcnlDdXJzb3IgPSBlbmRDdXJzb3I7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbmRDdXJzb3JTdGF0ZS5wdXNoKGVuZEN1cnNvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuZFByaW1hcnlDdXJzb3IpIHtcblx0XHRcdGVuZEN1cnNvclN0YXRlLnVuc2hpZnQoZW5kUHJpbWFyeUN1cnNvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVuZEN1cnNvclN0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRSYW5nZXNUb0RlbGV0ZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblxuXHRcdGlmIChzZWxlY3Rpb25zID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2VzVG9EZWxldGU6IFJhbmdlW10gPSBzZWxlY3Rpb25zLm1hcCgoc2VsKSA9PiB7XG5cdFx0XHRpZiAoc2VsLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRjb25zdCBtYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHNlbC5zdGFydExpbmVOdW1iZXIpO1xuXG5cdFx0XHRcdGlmIChzZWwuc3RhcnRDb2x1bW4gPT09IG1heENvbHVtbikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUmFuZ2Uoc2VsLnN0YXJ0TGluZU51bWJlciwgc2VsLnN0YXJ0Q29sdW1uLCBzZWwuc3RhcnRMaW5lTnVtYmVyICsgMSwgMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzZWwuc3RhcnRMaW5lTnVtYmVyLCBzZWwuc3RhcnRDb2x1bW4sIHNlbC5zdGFydExpbmVOdW1iZXIsIG1heENvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBzZWw7XG5cdFx0fSk7XG5cblx0XHRyYW5nZXNUb0RlbGV0ZS5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0cmV0dXJuIHJhbmdlc1RvRGVsZXRlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBKb2luTGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uam9pbkxpbmVzJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsaW5lcy5qb2luTGluZXMnLCBcIkpvaW4gTGluZXNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleUogfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHByaW1hcnlDdXJzb3IgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHByaW1hcnlDdXJzb3IgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzZWxlY3Rpb25zLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblx0XHRjb25zdCByZWR1Y2VkU2VsZWN0aW9uczogU2VsZWN0aW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IGxhc3RTZWxlY3Rpb24gPSBzZWxlY3Rpb25zLnJlZHVjZSgocHJldmlvdXNWYWx1ZSwgY3VycmVudFZhbHVlKSA9PiB7XG5cdFx0XHRpZiAocHJldmlvdXNWYWx1ZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0aWYgKHByZXZpb3VzVmFsdWUuZW5kTGluZU51bWJlciA9PT0gY3VycmVudFZhbHVlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdGlmIChwcmltYXJ5Q3Vyc29yIS5lcXVhbHNTZWxlY3Rpb24ocHJldmlvdXNWYWx1ZSkpIHtcblx0XHRcdFx0XHRcdHByaW1hcnlDdXJzb3IgPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlLnN0YXJ0TGluZU51bWJlciA+IHByZXZpb3VzVmFsdWUuZW5kTGluZU51bWJlciArIDEpIHtcblx0XHRcdFx0XHRyZWR1Y2VkU2VsZWN0aW9ucy5wdXNoKHByZXZpb3VzVmFsdWUpO1xuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocHJldmlvdXNWYWx1ZS5zdGFydExpbmVOdW1iZXIsIHByZXZpb3VzVmFsdWUuc3RhcnRDb2x1bW4sIGN1cnJlbnRWYWx1ZS5lbmRMaW5lTnVtYmVyLCBjdXJyZW50VmFsdWUuZW5kQ29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZS5zdGFydExpbmVOdW1iZXIgPiBwcmV2aW91c1ZhbHVlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZWR1Y2VkU2VsZWN0aW9ucy5wdXNoKHByZXZpb3VzVmFsdWUpO1xuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocHJldmlvdXNWYWx1ZS5zdGFydExpbmVOdW1iZXIsIHByZXZpb3VzVmFsdWUuc3RhcnRDb2x1bW4sIGN1cnJlbnRWYWx1ZS5lbmRMaW5lTnVtYmVyLCBjdXJyZW50VmFsdWUuZW5kQ29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmVkdWNlZFNlbGVjdGlvbnMucHVzaChsYXN0U2VsZWN0aW9uKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBlbmRDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRsZXQgZW5kUHJpbWFyeUN1cnNvciA9IHByaW1hcnlDdXJzb3I7XG5cdFx0bGV0IGxpbmVPZmZzZXQgPSAwO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJlZHVjZWRTZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSByZWR1Y2VkU2VsZWN0aW9uc1tpXTtcblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IDE7XG5cdFx0XHRsZXQgY29sdW1uRGVsdGFPZmZzZXQgPSAwO1xuXHRcdFx0bGV0IGVuZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRcdFx0ZW5kQ29sdW1uOiBudW1iZXI7XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbkVuZFBvc2l0aW9uT2Zmc2V0ID0gbW9kZWwuZ2V0TGluZUxlbmd0aChzZWxlY3Rpb24uZW5kTGluZU51bWJlcikgLSBzZWxlY3Rpb24uZW5kQ29sdW1uO1xuXG5cdFx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSB8fCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID09PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRcdGlmIChwb3NpdGlvbi5saW5lTnVtYmVyIDwgbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyICsgMTtcblx0XHRcdFx0XHRlbmRDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGVuZENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcjtcblx0XHRcdFx0ZW5kQ29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHRyaW1tZWRMaW5lc0NvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gc3RhcnRMaW5lTnVtYmVyICsgMTsgaSA8PSBlbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChpKTtcblx0XHRcdFx0Y29uc3QgZmlyc3ROb25XaGl0ZXNwYWNlSWR4ID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihpKTtcblxuXHRcdFx0XHRpZiAoZmlyc3ROb25XaGl0ZXNwYWNlSWR4ID49IDEpIHtcblx0XHRcdFx0XHRsZXQgaW5zZXJ0U3BhY2UgPSB0cnVlO1xuXHRcdFx0XHRcdGlmICh0cmltbWVkTGluZXNDb250ZW50ID09PSAnJykge1xuXHRcdFx0XHRcdFx0aW5zZXJ0U3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaW5zZXJ0U3BhY2UgJiYgKHRyaW1tZWRMaW5lc0NvbnRlbnQuY2hhckF0KHRyaW1tZWRMaW5lc0NvbnRlbnQubGVuZ3RoIC0gMSkgPT09ICcgJyB8fFxuXHRcdFx0XHRcdFx0dHJpbW1lZExpbmVzQ29udGVudC5jaGFyQXQodHJpbW1lZExpbmVzQ29udGVudC5sZW5ndGggLSAxKSA9PT0gJ1xcdCcpKSB7XG5cdFx0XHRcdFx0XHRpbnNlcnRTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0dHJpbW1lZExpbmVzQ29udGVudCA9IHRyaW1tZWRMaW5lc0NvbnRlbnQucmVwbGFjZSgvW1xcc1xcdUZFRkZcXHhBMF0rJC9nLCAnICcpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGxpbmVUZXh0V2l0aG91dEluZGVudCA9IGxpbmVUZXh0LnN1YnN0cihmaXJzdE5vbldoaXRlc3BhY2VJZHggLSAxKTtcblxuXHRcdFx0XHRcdHRyaW1tZWRMaW5lc0NvbnRlbnQgKz0gKGluc2VydFNwYWNlID8gJyAnIDogJycpICsgbGluZVRleHRXaXRob3V0SW5kZW50O1xuXG5cdFx0XHRcdFx0aWYgKGluc2VydFNwYWNlKSB7XG5cdFx0XHRcdFx0XHRjb2x1bW5EZWx0YU9mZnNldCA9IGxpbmVUZXh0V2l0aG91dEluZGVudC5sZW5ndGggKyAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb2x1bW5EZWx0YU9mZnNldCA9IGxpbmVUZXh0V2l0aG91dEluZGVudC5sZW5ndGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbHVtbkRlbHRhT2Zmc2V0ID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWxldGVTZWxlY3Rpb24gPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKTtcblxuXHRcdFx0aWYgKCFkZWxldGVTZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGxldCByZXN1bHRTZWxlY3Rpb246IFNlbGVjdGlvbjtcblxuXHRcdFx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdGVkaXRzLnB1c2goRWRpdE9wZXJhdGlvbi5yZXBsYWNlKGRlbGV0ZVNlbGVjdGlvbiwgdHJpbW1lZExpbmVzQ29udGVudCkpO1xuXHRcdFx0XHRcdHJlc3VsdFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oZGVsZXRlU2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAtIGxpbmVPZmZzZXQsIHRyaW1tZWRMaW5lc0NvbnRlbnQubGVuZ3RoIC0gY29sdW1uRGVsdGFPZmZzZXQgKyAxLCBzdGFydExpbmVOdW1iZXIgLSBsaW5lT2Zmc2V0LCB0cmltbWVkTGluZXNDb250ZW50Lmxlbmd0aCAtIGNvbHVtbkRlbHRhT2Zmc2V0ICsgMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRlZGl0cy5wdXNoKEVkaXRPcGVyYXRpb24ucmVwbGFjZShkZWxldGVTZWxlY3Rpb24sIHRyaW1tZWRMaW5lc0NvbnRlbnQpKTtcblx0XHRcdFx0XHRcdHJlc3VsdFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAtIGxpbmVPZmZzZXQsIHNlbGVjdGlvbi5zdGFydENvbHVtbixcblx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgLSBsaW5lT2Zmc2V0LCBzZWxlY3Rpb24uZW5kQ29sdW1uKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZWRpdHMucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2UoZGVsZXRlU2VsZWN0aW9uLCB0cmltbWVkTGluZXNDb250ZW50KSk7XG5cdFx0XHRcdFx0XHRyZXN1bHRTZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgLSBsaW5lT2Zmc2V0LCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRcdHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgLSBsaW5lT2Zmc2V0LCB0cmltbWVkTGluZXNDb250ZW50Lmxlbmd0aCAtIHNlbGVjdGlvbkVuZFBvc2l0aW9uT2Zmc2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoUmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKGRlbGV0ZVNlbGVjdGlvbiwgcHJpbWFyeUN1cnNvcikgIT09IG51bGwpIHtcblx0XHRcdFx0XHRlbmRQcmltYXJ5Q3Vyc29yID0gcmVzdWx0U2VsZWN0aW9uO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVuZEN1cnNvclN0YXRlLnB1c2gocmVzdWx0U2VsZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsaW5lT2Zmc2V0ICs9IGRlbGV0ZVNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIC0gZGVsZXRlU2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRlbmRDdXJzb3JTdGF0ZS51bnNoaWZ0KGVuZFByaW1hcnlDdXJzb3IpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKHRoaXMuaWQsIGVkaXRzLCBlbmRDdXJzb3JTdGF0ZSk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUcmFuc3Bvc2VBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24udHJhbnNwb3NlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdlZGl0b3IudHJhbnNwb3NlJywgXCJUcmFuc3Bvc2UgQ2hhcmFjdGVycyBhcm91bmQgdGhlIEN1cnNvclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cblx0XHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3Vyc29yID0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oY3Vyc29yLmxpbmVOdW1iZXIpO1xuXG5cdFx0XHRpZiAoY3Vyc29yLmNvbHVtbiA+PSBtYXhDb2x1bW4pIHtcblx0XHRcdFx0aWYgKGN1cnNvci5saW5lTnVtYmVyID09PSBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGhlIGN1cnNvciBpcyBhdCB0aGUgZW5kIG9mIGN1cnJlbnQgbGluZSBhbmQgY3VycmVudCBsaW5lIGlzIG5vdCBlbXB0eVxuXHRcdFx0XHQvLyB0aGVuIHdlIHRyYW5zcG9zZSB0aGUgY2hhcmFjdGVyIGJlZm9yZSB0aGUgY3Vyc29yIGFuZCB0aGUgbGluZSBicmVhayBpZiB0aGVyZSBpcyBhbnkgZm9sbG93aW5nIGxpbmUuXG5cdFx0XHRcdGNvbnN0IGRlbGV0ZVNlbGVjdGlvbiA9IG5ldyBSYW5nZShjdXJzb3IubGluZU51bWJlciwgTWF0aC5tYXgoMSwgY3Vyc29yLmNvbHVtbiAtIDEpLCBjdXJzb3IubGluZU51bWJlciArIDEsIDEpO1xuXHRcdFx0XHRjb25zdCBjaGFycyA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShkZWxldGVTZWxlY3Rpb24pLnNwbGl0KCcnKS5yZXZlcnNlKCkuam9pbignJyk7XG5cblx0XHRcdFx0Y29tbWFuZHMucHVzaChuZXcgUmVwbGFjZUNvbW1hbmQobmV3IFNlbGVjdGlvbihjdXJzb3IubGluZU51bWJlciwgTWF0aC5tYXgoMSwgY3Vyc29yLmNvbHVtbiAtIDEpLCBjdXJzb3IubGluZU51bWJlciArIDEsIDEpLCBjaGFycykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGVsZXRlU2VsZWN0aW9uID0gbmV3IFJhbmdlKGN1cnNvci5saW5lTnVtYmVyLCBNYXRoLm1heCgxLCBjdXJzb3IuY29sdW1uIC0gMSksIGN1cnNvci5saW5lTnVtYmVyLCBjdXJzb3IuY29sdW1uICsgMSk7XG5cdFx0XHRcdGNvbnN0IGNoYXJzID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKGRlbGV0ZVNlbGVjdGlvbikuc3BsaXQoJycpLnJldmVyc2UoKS5qb2luKCcnKTtcblx0XHRcdFx0Y29tbWFuZHMucHVzaChuZXcgUmVwbGFjZUNvbW1hbmRUaGF0UHJlc2VydmVzU2VsZWN0aW9uKGRlbGV0ZVNlbGVjdGlvbiwgY2hhcnMsXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbihjdXJzb3IubGluZU51bWJlciwgY3Vyc29yLmNvbHVtbiArIDEsIGN1cnNvci5saW5lTnVtYmVyLCBjdXJzb3IuY29sdW1uICsgMSkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBjb21tYW5kcyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdENhc2VBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKTtcblx0XHRjb25zdCB0ZXh0RWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnNvciA9IHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IHdvcmQgPSBlZGl0b3IuZ2V0Q29uZmlndXJlZFdvcmRBdFBvc2l0aW9uKGN1cnNvcik7XG5cblx0XHRcdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB3b3JkUmFuZ2UgPSBuZXcgUmFuZ2UoY3Vyc29yLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIGN1cnNvci5saW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbik7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uod29yZFJhbmdlKTtcblx0XHRcdFx0dGV4dEVkaXRzLnB1c2goRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHdvcmRSYW5nZSwgdGhpcy5fbW9kaWZ5VGV4dCh0ZXh0LCB3b3JkU2VwYXJhdG9ycykpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uKTtcblx0XHRcdFx0dGV4dEVkaXRzLnB1c2goRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHNlbGVjdGlvbiwgdGhpcy5fbW9kaWZ5VGV4dCh0ZXh0LCB3b3JkU2VwYXJhdG9ycykpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cyh0aGlzLmlkLCB0ZXh0RWRpdHMpO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfbW9kaWZ5VGV4dCh0ZXh0OiBzdHJpbmcsIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcpOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBVcHBlckNhc2VBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENhc2VBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24udHJhbnNmb3JtVG9VcHBlcmNhc2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci50cmFuc2Zvcm1Ub1VwcGVyY2FzZScsIFwiVHJhbnNmb3JtIHRvIFVwcGVyY2FzZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX21vZGlmeVRleHQodGV4dDogc3RyaW5nLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGV4dC50b0xvY2FsZVVwcGVyQ2FzZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMb3dlckNhc2VBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENhc2VBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24udHJhbnNmb3JtVG9Mb3dlcmNhc2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci50cmFuc2Zvcm1Ub0xvd2VyY2FzZScsIFwiVHJhbnNmb3JtIHRvIExvd2VyY2FzZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfbW9kaWZ5VGV4dCh0ZXh0OiBzdHJpbmcsIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0ZXh0LnRvTG9jYWxlTG93ZXJDYXNlKCk7XG5cdH1cbn1cblxuY2xhc3MgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCB7XG5cblx0cHJpdmF0ZSBfYWN0dWFsOiBSZWdFeHAgfCBudWxsO1xuXHRwcml2YXRlIF9ldmFsdWF0ZWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGF0dGVybjogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZsYWdzOiBzdHJpbmdcblx0KSB7XG5cdFx0dGhpcy5fYWN0dWFsID0gbnVsbDtcblx0XHR0aGlzLl9ldmFsdWF0ZWQgPSBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQoKTogUmVnRXhwIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9ldmFsdWF0ZWQpIHtcblx0XHRcdHRoaXMuX2V2YWx1YXRlZCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9hY3R1YWwgPSBuZXcgUmVnRXhwKHRoaXMuX3BhdHRlcm4sIHRoaXMuX2ZsYWdzKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHQvLyB0aGlzIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCB0aGlzIHJlZ3VsYXIgZXhwcmVzc2lvblxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsO1xuXHR9XG5cblx0cHVibGljIGlzU3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5nZXQoKSAhPT0gbnVsbCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRpdGxlQ2FzZUFjdGlvbiBleHRlbmRzIEFic3RyYWN0Q2FzZUFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyB0aXRsZUJvdW5kYXJ5ID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJyhefFteXFxcXHB7TH1cXFxccHtOfVxcJ118KChefFxcXFxQe0x9KVxcJykpXFxcXHB7TH0nLCAnZ211Jyk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnRyYW5zZm9ybVRvVGl0bGVjYXNlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdlZGl0b3IudHJhbnNmb3JtVG9UaXRsZWNhc2UnLCBcIlRyYW5zZm9ybSB0byBUaXRsZSBDYXNlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9tb2RpZnlUZXh0KHRleHQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdGl0bGVCb3VuZGFyeSA9IFRpdGxlQ2FzZUFjdGlvbi50aXRsZUJvdW5kYXJ5LmdldCgpO1xuXHRcdGlmICghdGl0bGVCb3VuZGFyeSkge1xuXHRcdFx0Ly8gY2Fubm90IHN1cHBvcnQgdGhpc1xuXHRcdFx0cmV0dXJuIHRleHQ7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0XG5cdFx0XHQudG9Mb2NhbGVMb3dlckNhc2UoKVxuXHRcdFx0LnJlcGxhY2UodGl0bGVCb3VuZGFyeSwgKGIpID0+IGIudG9Mb2NhbGVVcHBlckNhc2UoKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNuYWtlQ2FzZUFjdGlvbiBleHRlbmRzIEFic3RyYWN0Q2FzZUFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjYXNlQm91bmRhcnkgPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnKFxcXFxwe0xsfSkoXFxcXHB7THV9KScsICdnbXUnKTtcblx0cHVibGljIHN0YXRpYyBzaW5nbGVMZXR0ZXJzID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJyhcXFxccHtMdX18XFxcXHB7Tn0pKFxcXFxwe0x1fSkoXFxcXHB7TGx9KScsICdnbXUnKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24udHJhbnNmb3JtVG9TbmFrZWNhc2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci50cmFuc2Zvcm1Ub1NuYWtlY2FzZScsIFwiVHJhbnNmb3JtIHRvIFNuYWtlIENhc2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9tb2RpZnlUZXh0KHRleHQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY2FzZUJvdW5kYXJ5ID0gU25ha2VDYXNlQWN0aW9uLmNhc2VCb3VuZGFyeS5nZXQoKTtcblx0XHRjb25zdCBzaW5nbGVMZXR0ZXJzID0gU25ha2VDYXNlQWN0aW9uLnNpbmdsZUxldHRlcnMuZ2V0KCk7XG5cdFx0aWYgKCFjYXNlQm91bmRhcnkgfHwgIXNpbmdsZUxldHRlcnMpIHtcblx0XHRcdC8vIGNhbm5vdCBzdXBwb3J0IHRoaXNcblx0XHRcdHJldHVybiB0ZXh0O1xuXHRcdH1cblx0XHRyZXR1cm4gKHRleHRcblx0XHRcdC5yZXBsYWNlKGNhc2VCb3VuZGFyeSwgJyQxXyQyJylcblx0XHRcdC5yZXBsYWNlKHNpbmdsZUxldHRlcnMsICckMV8kMiQzJylcblx0XHRcdC50b0xvY2FsZUxvd2VyQ2FzZSgpXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2FtZWxDYXNlQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDYXNlQWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyBzaW5nbGVMaW5lV29yZEJvdW5kYXJ5ID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJ1tfXFxcXHMtXSsnLCAnZ20nKTtcblx0cHVibGljIHN0YXRpYyBtdWx0aUxpbmVXb3JkQm91bmRhcnkgPSBuZXcgQmFja3dhcmRzQ29tcGF0aWJsZVJlZ0V4cCgnW18tXSsnLCAnZ20nKTtcblx0cHVibGljIHN0YXRpYyB2YWxpZFdvcmRTdGFydCA9IG5ldyBCYWNrd2FyZHNDb21wYXRpYmxlUmVnRXhwKCdeKFxcXFxwe0x1fVteXFxcXHB7THV9XSknLCAnZ211Jyk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnRyYW5zZm9ybVRvQ2FtZWxjYXNlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdlZGl0b3IudHJhbnNmb3JtVG9DYW1lbGNhc2UnLCBcIlRyYW5zZm9ybSB0byBDYW1lbCBDYXNlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9tb2RpZnlUZXh0KHRleHQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgd29yZEJvdW5kYXJ5ID0gL1xcclxcbnxcXHJ8XFxuLy50ZXN0KHRleHQpID8gQ2FtZWxDYXNlQWN0aW9uLm11bHRpTGluZVdvcmRCb3VuZGFyeS5nZXQoKSA6IENhbWVsQ2FzZUFjdGlvbi5zaW5nbGVMaW5lV29yZEJvdW5kYXJ5LmdldCgpO1xuXHRcdGNvbnN0IHZhbGlkV29yZFN0YXJ0ID0gQ2FtZWxDYXNlQWN0aW9uLnZhbGlkV29yZFN0YXJ0LmdldCgpO1xuXHRcdGlmICghd29yZEJvdW5kYXJ5IHx8ICF2YWxpZFdvcmRTdGFydCkge1xuXHRcdFx0Ly8gY2Fubm90IHN1cHBvcnQgdGhpc1xuXHRcdFx0cmV0dXJuIHRleHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmRzID0gdGV4dC5zcGxpdCh3b3JkQm91bmRhcnkpO1xuXHRcdGNvbnN0IGZpcnN0V29yZCA9IHdvcmRzLnNoaWZ0KCk/LnJlcGxhY2UodmFsaWRXb3JkU3RhcnQsIChzdGFydDogc3RyaW5nKSA9PiBzdGFydC50b0xvY2FsZUxvd2VyQ2FzZSgpKTtcblx0XHRyZXR1cm4gZmlyc3RXb3JkICsgd29yZHMubWFwKCh3b3JkOiBzdHJpbmcpID0+IHdvcmQuc3Vic3RyaW5nKDAsIDEpLnRvTG9jYWxlVXBwZXJDYXNlKCkgKyB3b3JkLnN1YnN0cmluZygxKSlcblx0XHRcdC5qb2luKCcnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUGFzY2FsQ2FzZUFjdGlvbiBleHRlbmRzIEFic3RyYWN0Q2FzZUFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgd29yZEJvdW5kYXJ5ID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJ1tfIFxcXFx0LV0nLCAnZ20nKTtcblx0cHVibGljIHN0YXRpYyB3b3JkQm91bmRhcnlUb01haW50YWluID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJyg/PD1cXFxcLiknLCAnZ20nKTtcblx0cHVibGljIHN0YXRpYyB1cHBlckNhc2VXb3JkTWF0Y2hlciA9IG5ldyBCYWNrd2FyZHNDb21wYXRpYmxlUmVnRXhwKCdeXFxcXHB7THV9KyQnLCAnbXUnKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24udHJhbnNmb3JtVG9QYXNjYWxjYXNlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdlZGl0b3IudHJhbnNmb3JtVG9QYXNjYWxjYXNlJywgXCJUcmFuc2Zvcm0gdG8gUGFzY2FsIENhc2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9tb2RpZnlUZXh0KHRleHQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgd29yZEJvdW5kYXJ5ID0gUGFzY2FsQ2FzZUFjdGlvbi53b3JkQm91bmRhcnkuZ2V0KCk7XG5cdFx0Y29uc3Qgd29yZEJvdW5kYXJ5VG9NYWludGFpbiA9IFBhc2NhbENhc2VBY3Rpb24ud29yZEJvdW5kYXJ5VG9NYWludGFpbi5nZXQoKTtcblx0XHRjb25zdCB1cHBlckNhc2VXb3JkTWF0Y2hlciA9IFBhc2NhbENhc2VBY3Rpb24udXBwZXJDYXNlV29yZE1hdGNoZXIuZ2V0KCk7XG5cblx0XHRpZiAoIXdvcmRCb3VuZGFyeSB8fCAhd29yZEJvdW5kYXJ5VG9NYWludGFpbiB8fCAhdXBwZXJDYXNlV29yZE1hdGNoZXIpIHtcblx0XHRcdC8vIGNhbm5vdCBzdXBwb3J0IHRoaXNcblx0XHRcdHJldHVybiB0ZXh0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmRzV2l0aE1haW50YWluQm91bmRhcmllcyA9IHRleHQuc3BsaXQod29yZEJvdW5kYXJ5VG9NYWludGFpbik7XG5cdFx0Y29uc3Qgd29yZHMgPSB3b3Jkc1dpdGhNYWludGFpbkJvdW5kYXJpZXMubWFwKHdvcmQgPT4gd29yZC5zcGxpdCh3b3JkQm91bmRhcnkpKS5mbGF0KCk7XG5cblx0XHRyZXR1cm4gd29yZHMubWFwKHdvcmQgPT4ge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZFdvcmQgPSB3b3JkLmNoYXJBdCgwKS50b0xvY2FsZVVwcGVyQ2FzZSgpICsgd29yZC5zbGljZSgxKTtcblx0XHRcdGNvbnN0IGlzQWxsQ2FwcyA9IG5vcm1hbGl6ZWRXb3JkLmxlbmd0aCA+IDEgJiYgdXBwZXJDYXNlV29yZE1hdGNoZXIudGVzdChub3JtYWxpemVkV29yZCk7XG5cdFx0XHRpZiAoaXNBbGxDYXBzKSB7XG5cdFx0XHRcdHJldHVybiBub3JtYWxpemVkV29yZC5jaGFyQXQoMCkgKyBub3JtYWxpemVkV29yZC5zbGljZSgxKS50b0xvY2FsZUxvd2VyQ2FzZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZWRXb3JkO1xuXHRcdH0pLmpvaW4oJycpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBLZWJhYkNhc2VBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENhc2VBY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgaXNTdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYXJlQWxsUmVnZXhwc1N1cHBvcnRlZCA9IFtcblx0XHRcdHRoaXMuY2FzZUJvdW5kYXJ5LFxuXHRcdFx0dGhpcy5zaW5nbGVMZXR0ZXJzLFxuXHRcdFx0dGhpcy51bmRlcnNjb3JlQm91bmRhcnksXG5cdFx0XS5ldmVyeSgocmVnZXhwKSA9PiByZWdleHAuaXNTdXBwb3J0ZWQoKSk7XG5cblx0XHRyZXR1cm4gYXJlQWxsUmVnZXhwc1N1cHBvcnRlZDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGNhc2VCb3VuZGFyeSA9IG5ldyBCYWNrd2FyZHNDb21wYXRpYmxlUmVnRXhwKCcoXFxcXHB7TGx9KShcXFxccHtMdX0pJywgJ2dtdScpO1xuXHRwcml2YXRlIHN0YXRpYyBzaW5nbGVMZXR0ZXJzID0gbmV3IEJhY2t3YXJkc0NvbXBhdGlibGVSZWdFeHAoJyhcXFxccHtMdX18XFxcXHB7Tn0pKFxcXFxwe0x1fVxcXFxwe0xsfSknLCAnZ211Jyk7XG5cdHByaXZhdGUgc3RhdGljIHVuZGVyc2NvcmVCb3VuZGFyeSA9IG5ldyBCYWNrd2FyZHNDb21wYXRpYmxlUmVnRXhwKCcoXFxcXFMpKF8pKFxcXFxTKScsICdnbScpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi50cmFuc2Zvcm1Ub0tlYmFiY2FzZScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZWRpdG9yLnRyYW5zZm9ybVRvS2ViYWJjYXNlJywgJ1RyYW5zZm9ybSB0byBLZWJhYiBDYXNlJyksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9tb2RpZnlUZXh0KHRleHQ6IHN0cmluZywgXzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBjYXNlQm91bmRhcnkgPSBLZWJhYkNhc2VBY3Rpb24uY2FzZUJvdW5kYXJ5LmdldCgpO1xuXHRcdGNvbnN0IHNpbmdsZUxldHRlcnMgPSBLZWJhYkNhc2VBY3Rpb24uc2luZ2xlTGV0dGVycy5nZXQoKTtcblx0XHRjb25zdCB1bmRlcnNjb3JlQm91bmRhcnkgPSBLZWJhYkNhc2VBY3Rpb24udW5kZXJzY29yZUJvdW5kYXJ5LmdldCgpO1xuXG5cdFx0aWYgKCFjYXNlQm91bmRhcnkgfHwgIXNpbmdsZUxldHRlcnMgfHwgIXVuZGVyc2NvcmVCb3VuZGFyeSkge1xuXHRcdFx0Ly8gb25lIG9yIG1vcmUgcmVnZXhwcyBhcmVuJ3Qgc3VwcG9ydGVkXG5cdFx0XHRyZXR1cm4gdGV4dDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGV4dFxuXHRcdFx0LnJlcGxhY2UodW5kZXJzY29yZUJvdW5kYXJ5LCAnJDEtJDMnKVxuXHRcdFx0LnJlcGxhY2UoY2FzZUJvdW5kYXJ5LCAnJDEtJDInKVxuXHRcdFx0LnJlcGxhY2Uoc2luZ2xlTGV0dGVycywgJyQxLSQyJylcblx0XHRcdC50b0xvY2FsZUxvd2VyQ2FzZSgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKENvcHlMaW5lc1VwQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKENvcHlMaW5lc0Rvd25BY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRHVwbGljYXRlU2VsZWN0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKE1vdmVMaW5lc1VwQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKE1vdmVMaW5lc0Rvd25BY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU29ydExpbmVzQXNjZW5kaW5nQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFNvcnRMaW5lc0Rlc2NlbmRpbmdBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRGVsZXRlRHVwbGljYXRlTGluZXNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihEZWxldGVMaW5lc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbmRlbnRMaW5lc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihPdXRkZW50TGluZXNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5zZXJ0TGluZUJlZm9yZUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbnNlcnRMaW5lQWZ0ZXJBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRGVsZXRlQWxsTGVmdEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihEZWxldGVBbGxSaWdodEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihKb2luTGluZXNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oVHJhbnNwb3NlQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFVwcGVyQ2FzZUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihMb3dlckNhc2VBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUmV2ZXJzZUxpbmVzQWN0aW9uKTtcblxuaWYgKFNuYWtlQ2FzZUFjdGlvbi5jYXNlQm91bmRhcnkuaXNTdXBwb3J0ZWQoKSAmJiBTbmFrZUNhc2VBY3Rpb24uc2luZ2xlTGV0dGVycy5pc1N1cHBvcnRlZCgpKSB7XG5cdHJlZ2lzdGVyRWRpdG9yQWN0aW9uKFNuYWtlQ2FzZUFjdGlvbik7XG59XG5pZiAoQ2FtZWxDYXNlQWN0aW9uLnNpbmdsZUxpbmVXb3JkQm91bmRhcnkuaXNTdXBwb3J0ZWQoKSAmJiBDYW1lbENhc2VBY3Rpb24ubXVsdGlMaW5lV29yZEJvdW5kYXJ5LmlzU3VwcG9ydGVkKCkpIHtcblx0cmVnaXN0ZXJFZGl0b3JBY3Rpb24oQ2FtZWxDYXNlQWN0aW9uKTtcbn1cbmlmIChQYXNjYWxDYXNlQWN0aW9uLndvcmRCb3VuZGFyeS5pc1N1cHBvcnRlZCgpKSB7XG5cdHJlZ2lzdGVyRWRpdG9yQWN0aW9uKFBhc2NhbENhc2VBY3Rpb24pO1xufVxuaWYgKFRpdGxlQ2FzZUFjdGlvbi50aXRsZUJvdW5kYXJ5LmlzU3VwcG9ydGVkKCkpIHtcblx0cmVnaXN0ZXJFZGl0b3JBY3Rpb24oVGl0bGVDYXNlQWN0aW9uKTtcbn1cblxuaWYgKEtlYmFiQ2FzZUFjdGlvbi5pc1N1cHBvcnRlZCgpKSB7XG5cdHJlZ2lzdGVyRWRpdG9yQWN0aW9uKEtlYmFiQ2FzZUFjdGlvbik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxjQUE4Qiw0QkFBOEM7QUFDckYsU0FBUyxnQkFBZ0Isc0NBQXNDLHFDQUFxQztBQUNwRyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUEyQztBQUNwRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFJakMsTUFBZSxnQ0FBZ0MsYUFBYTtBQUFBLEVBSTNELFlBQVksTUFBZSxNQUFzQjtBQUNoRCxVQUFNLElBQUk7QUFDVixTQUFLLE9BQU87QUFBQSxFQUNiO0FBQUEsRUFFTyxJQUFJLFdBQTZCLFFBQTJCO0FBQ2xFLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRztBQUN2QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsT0FBTyxj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
