import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as nls from "../../../../nls.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IsWindowsContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand } from "../../../browser/editorExtensions.js";
import { ReplaceCommand } from "../../../common/commands/replaceCommand.js";
import { EditorOption, EditorOptions } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { getMapForWordSeparators } from "../../../common/core/wordCharacterClassifier.js";
import { WordNavigationType, WordOperations } from "../../../common/cursor/cursorWordOperations.js";
import { CursorState } from "../../../common/cursorCommon.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
class MoveWordCommand extends EditorCommand {
  constructor(opts) {
    super(opts);
    this._inSelectionMode = opts.inSelectionMode;
    this._wordNavigationType = opts.wordNavigationType;
  }
  runEditorCommand(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
    const model = editor.getModel();
    const selections = editor.getSelections();
    const hasMulticursor = selections.length > 1;
    const result = selections.map((sel) => {
      const inPosition = new Position(sel.positionLineNumber, sel.positionColumn);
      const outPosition = this._move(wordSeparators, model, inPosition, this._wordNavigationType, hasMulticursor);
      return this._moveTo(sel, outPosition, this._inSelectionMode);
    });
    model.pushStackElement();
    editor._getViewModel().setCursorStates("moveWordCommand", CursorChangeReason.Explicit, result.map((r) => CursorState.fromModelSelection(r)));
    if (result.length === 1) {
      const pos = new Position(result[0].positionLineNumber, result[0].positionColumn);
      editor.revealPosition(pos, ScrollType.Smooth);
    }
  }
  _moveTo(from, to, inSelectionMode) {
    if (inSelectionMode) {
      return new Selection(
        from.selectionStartLineNumber,
        from.selectionStartColumn,
        to.lineNumber,
        to.column
      );
    } else {
      return new Selection(
        to.lineNumber,
        to.column,
        to.lineNumber,
        to.column
      );
    }
  }
}
class WordLeftCommand extends MoveWordCommand {
  _move(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
    return WordOperations.moveWordLeft(wordSeparators, model, position, wordNavigationType, hasMulticursor);
  }
}
class WordRightCommand extends MoveWordCommand {
  _move(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
    return WordOperations.moveWordRight(wordSeparators, model, position, wordNavigationType);
  }
}
class CursorWordStartLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartLeft",
      precondition: void 0
    });
  }
}
class CursorWordEndLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndLeft",
      precondition: void 0
    });
  }
}
class CursorWordLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordStartFast,
      id: "cursorWordLeft",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
        mac: { primary: KeyMod.Alt | KeyCode.LeftArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordStartLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartLeftSelect",
      precondition: void 0
    });
  }
}
class CursorWordEndLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndLeftSelect",
      precondition: void 0
    });
  }
}
class CursorWordLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordStartFast,
      id: "cursorWordLeftSelect",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow,
        mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordAccessibilityLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityLeft",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class CursorWordAccessibilityLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityLeftSelect",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class CursorWordStartRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartRight",
      precondition: void 0
    });
  }
}
class CursorWordEndRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndRight",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
        mac: { primary: KeyMod.Alt | KeyCode.RightArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordRight",
      precondition: void 0
    });
  }
}
class CursorWordStartRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartRightSelect",
      precondition: void 0
    });
  }
}
class CursorWordEndRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndRightSelect",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow,
        mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordRightSelect",
      precondition: void 0
    });
  }
}
class CursorWordAccessibilityRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityRight",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class CursorWordAccessibilityRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityRightSelect",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class DeleteWordCommand extends EditorCommand {
  constructor(opts) {
    super({ canTriggerInlineEdits: true, ...opts });
    this._whitespaceHeuristics = opts.whitespaceHeuristics;
    this._wordNavigationType = opts.wordNavigationType;
  }
  runEditorCommand(accessor, editor, args) {
    const languageConfigurationService = accessor?.get(ILanguageConfigurationService);
    if (!editor.hasModel() || !languageConfigurationService) {
      return;
    }
    const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
    const model = editor.getModel();
    const selections = editor.getSelections();
    const autoClosingBrackets = editor.getOption(EditorOption.autoClosingBrackets);
    const autoClosingQuotes = editor.getOption(EditorOption.autoClosingQuotes);
    const autoClosingPairs = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getAutoClosingPairs();
    const viewModel = editor._getViewModel();
    const commands = selections.map((sel) => {
      const deleteRange = this._delete({
        wordSeparators,
        model,
        selection: sel,
        whitespaceHeuristics: this._whitespaceHeuristics,
        autoClosingDelete: editor.getOption(EditorOption.autoClosingDelete),
        autoClosingBrackets,
        autoClosingQuotes,
        autoClosingPairs,
        autoClosedCharacters: viewModel.getCursorAutoClosedCharacters()
      }, this._wordNavigationType);
      return new ReplaceCommand(deleteRange, "");
    });
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class DeleteWordLeftCommand extends DeleteWordCommand {
  _delete(ctx, wordNavigationType) {
    const r = WordOperations.deleteWordLeft(ctx, wordNavigationType);
    if (r) {
      return r;
    }
    return new Range(1, 1, 1, 1);
  }
}
class DeleteWordRightCommand extends DeleteWordCommand {
  _delete(ctx, wordNavigationType) {
    const r = WordOperations.deleteWordRight(ctx, wordNavigationType);
    if (r) {
      return r;
    }
    const lineCount = ctx.model.getLineCount();
    const maxColumn = ctx.model.getLineMaxColumn(lineCount);
    return new Range(lineCount, maxColumn, lineCount, maxColumn);
  }
}
class DeleteWordStartLeft extends DeleteWordLeftCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "deleteWordStartLeft",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordEndLeft extends DeleteWordLeftCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "deleteWordEndLeft",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordLeft extends DeleteWordLeftCommand {
  constructor() {
    super({
      whitespaceHeuristics: true,
      wordNavigationType: WordNavigationType.WordStart,
      id: "deleteWordLeft",
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Backspace,
        mac: { primary: KeyMod.Alt | KeyCode.Backspace },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class DeleteWordStartRight extends DeleteWordRightCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "deleteWordStartRight",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordEndRight extends DeleteWordRightCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "deleteWordEndRight",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordRight extends DeleteWordRightCommand {
  constructor() {
    super({
      whitespaceHeuristics: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "deleteWordRight",
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Delete,
        mac: { primary: KeyMod.Alt | KeyCode.Delete },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class DeleteInsideWord extends EditorAction {
  constructor() {
    super({
      id: "deleteInsideWord",
      precondition: EditorContextKeys.writable,
      label: nls.localize2("deleteInsideWord", "Delete Word"),
      metadata: {
        description: nls.localize2("deleteInsideWord.description", "Delete the word at the cursor"),
        args: [{
          name: "args",
          schema: {
            type: "object",
            properties: {
              "onlyWord": {
                type: "boolean",
                default: false,
                description: nls.localize("deleteInsideWord.args.onlyWord", "Delete only the word and leave surrounding whitespace")
              }
            }
          }
        }]
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const onlyWord = !!(args && typeof args === "object" && args.onlyWord);
    const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
    const model = editor.getModel();
    const selections = editor.getSelections();
    const commands = selections.map((sel) => {
      const deleteRange = WordOperations.deleteInsideWord(wordSeparators, model, sel, onlyWord);
      return new ReplaceCommand(deleteRange, "");
    });
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
registerEditorCommand(new CursorWordStartLeft());
registerEditorCommand(new CursorWordEndLeft());
registerEditorCommand(new CursorWordLeft());
registerEditorCommand(new CursorWordStartLeftSelect());
registerEditorCommand(new CursorWordEndLeftSelect());
registerEditorCommand(new CursorWordLeftSelect());
registerEditorCommand(new CursorWordStartRight());
registerEditorCommand(new CursorWordEndRight());
registerEditorCommand(new CursorWordRight());
registerEditorCommand(new CursorWordStartRightSelect());
registerEditorCommand(new CursorWordEndRightSelect());
registerEditorCommand(new CursorWordRightSelect());
registerEditorCommand(new CursorWordAccessibilityLeft());
registerEditorCommand(new CursorWordAccessibilityLeftSelect());
registerEditorCommand(new CursorWordAccessibilityRight());
registerEditorCommand(new CursorWordAccessibilityRightSelect());
registerEditorCommand(new DeleteWordStartLeft());
registerEditorCommand(new DeleteWordEndLeft());
registerEditorCommand(new DeleteWordLeft());
registerEditorCommand(new DeleteWordStartRight());
registerEditorCommand(new DeleteWordEndRight());
registerEditorCommand(new DeleteWordRight());
registerEditorAction(DeleteInsideWord);
export {
  CursorWordAccessibilityLeft,
  CursorWordAccessibilityLeftSelect,
  CursorWordAccessibilityRight,
  CursorWordAccessibilityRightSelect,
  CursorWordEndLeft,
  CursorWordEndLeftSelect,
  CursorWordEndRight,
  CursorWordEndRightSelect,
  CursorWordLeft,
  CursorWordLeftSelect,
  CursorWordRight,
  CursorWordRightSelect,
  CursorWordStartLeft,
  CursorWordStartLeftSelect,
  CursorWordStartRight,
  CursorWordStartRightSelect,
  DeleteInsideWord,
  DeleteWordCommand,
  DeleteWordEndLeft,
  DeleteWordEndRight,
  DeleteWordLeft,
  DeleteWordLeftCommand,
  DeleteWordRight,
  DeleteWordRightCommand,
  DeleteWordStartLeft,
  DeleteWordStartRight,
  MoveWordCommand,
  WordLeftCommand,
  WordRightCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3dvcmRPcGVyYXRpb25zL2Jyb3dzZXIvd29yZE9wZXJhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1dpbmRvd3NDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb21tYW5kLCBJQ29tbWFuZE9wdGlvbnMsIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbW1hbmQsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUmVwbGFjZUNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvcmVwbGFjZUNvbW1hbmQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMsIFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZENoYXJhY3RlckNsYXNzaWZpZXIuanMnO1xuaW1wb3J0IHsgRGVsZXRlV29yZENvbnRleHQsIFdvcmROYXZpZ2F0aW9uVHlwZSwgV29yZE9wZXJhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yL2N1cnNvcldvcmRPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IEN1cnNvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDaGFuZ2VSZWFzb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBNb3ZlV29yZE9wdGlvbnMgZXh0ZW5kcyBJQ29tbWFuZE9wdGlvbnMge1xuXHRpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTW92ZVdvcmRDb21tYW5kIGV4dGVuZHMgRWRpdG9yQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZTtcblxuXHRjb25zdHJ1Y3RvcihvcHRzOiBNb3ZlV29yZE9wdGlvbnMpIHtcblx0XHRzdXBlcihvcHRzKTtcblx0XHR0aGlzLl9pblNlbGVjdGlvbk1vZGUgPSBvcHRzLmluU2VsZWN0aW9uTW9kZTtcblx0XHR0aGlzLl93b3JkTmF2aWdhdGlvblR5cGUgPSBvcHRzLndvcmROYXZpZ2F0aW9uVHlwZTtcblx0fVxuXG5cdHB1YmxpYyBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSwgZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlZ21lbnRlckxvY2FsZXMpKTtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IGhhc011bHRpY3Vyc29yID0gc2VsZWN0aW9ucy5sZW5ndGggPiAxO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlbGVjdGlvbnMubWFwKChzZWwpID0+IHtcblx0XHRcdGNvbnN0IGluUG9zaXRpb24gPSBuZXcgUG9zaXRpb24oc2VsLnBvc2l0aW9uTGluZU51bWJlciwgc2VsLnBvc2l0aW9uQ29sdW1uKTtcblx0XHRcdGNvbnN0IG91dFBvc2l0aW9uID0gdGhpcy5fbW92ZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIGluUG9zaXRpb24sIHRoaXMuX3dvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3IpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vdmVUbyhzZWwsIG91dFBvc2l0aW9uLCB0aGlzLl9pblNlbGVjdGlvbk1vZGUpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdGVkaXRvci5fZ2V0Vmlld01vZGVsKCkuc2V0Q3Vyc29yU3RhdGVzKCdtb3ZlV29yZENvbW1hbmQnLCBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsIHJlc3VsdC5tYXAociA9PiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTZWxlY3Rpb24ocikpKTtcblx0XHRpZiAocmVzdWx0Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKHJlc3VsdFswXS5wb3NpdGlvbkxpbmVOdW1iZXIsIHJlc3VsdFswXS5wb3NpdGlvbkNvbHVtbik7XG5cdFx0XHRlZGl0b3IucmV2ZWFsUG9zaXRpb24ocG9zLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbW92ZVRvKGZyb206IFNlbGVjdGlvbiwgdG86IFBvc2l0aW9uLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBTZWxlY3Rpb24ge1xuXHRcdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRcdC8vIG1vdmUganVzdCBwb3NpdGlvblxuXHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRcdGZyb20uc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRmcm9tLnNlbGVjdGlvblN0YXJ0Q29sdW1uLFxuXHRcdFx0XHR0by5saW5lTnVtYmVyLFxuXHRcdFx0XHR0by5jb2x1bW5cblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG1vdmUgZXZlcnl0aGluZ1xuXHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRcdHRvLmxpbmVOdW1iZXIsXG5cdFx0XHRcdHRvLmNvbHVtbixcblx0XHRcdFx0dG8ubGluZU51bWJlcixcblx0XHRcdFx0dG8uY29sdW1uXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfbW92ZSh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcjogYm9vbGVhbik6IFBvc2l0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgV29yZExlZnRDb21tYW5kIGV4dGVuZHMgTW92ZVdvcmRDb21tYW5kIHtcblx0cHJvdGVjdGVkIF9tb3ZlKHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yOiBib29sZWFuKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBXb3JkT3BlcmF0aW9ucy5tb3ZlV29yZExlZnQod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFdvcmRSaWdodENvbW1hbmQgZXh0ZW5kcyBNb3ZlV29yZENvbW1hbmQge1xuXHRwcm90ZWN0ZWQgX21vdmUod29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3I6IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIFdvcmRPcGVyYXRpb25zLm1vdmVXb3JkUmlnaHQod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZFN0YXJ0TGVmdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQsXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRTdGFydExlZnQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZEVuZExlZnQgZXh0ZW5kcyBXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZEVuZExlZnQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZExlZnQgZXh0ZW5kcyBXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0RmFzdCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZExlZnQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBJc1dpbmRvd3NDb250ZXh0KT8ubmVnYXRlKCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRTdGFydExlZnRTZWxlY3QgZXh0ZW5kcyBXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQsXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRTdGFydExlZnRTZWxlY3QnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZEVuZExlZnRTZWxlY3QgZXh0ZW5kcyBXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kLFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkRW5kTGVmdFNlbGVjdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkTGVmdFNlbGVjdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydEZhc3QsXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRMZWZ0U2VsZWN0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgSXNXaW5kb3dzQ29udGV4dCk/Lm5lZ2F0ZSgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkxlZnRBcnJvdyB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbi8vIEFjY2Vzc2liaWxpdHkgbmF2aWdhdGlvbiBjb21tYW5kcyBzaG91bGQgb25seSBiZSBlbmFibGVkIG9uIHdpbmRvd3Mgc2luY2UgdGhleSBhcmUgdHVuZWQgdG8gd2hhdCBOVkRBIGV4cGVjdHNcbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnQgZXh0ZW5kcyBXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEFjY2Vzc2liaWxpdHksXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9tb3ZlKHdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yOiBib29sZWFuKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBzdXBlci5fbW92ZShnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyhFZGl0b3JPcHRpb25zLndvcmRTZXBhcmF0b3JzLmRlZmF1bHRWYWx1ZSwgd29yZENoYXJhY3RlckNsYXNzaWZpZXIuaW50bFNlZ21lbnRlckxvY2FsZXMpLCBtb2RlbCwgcG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3IpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnRTZWxlY3QgZXh0ZW5kcyBXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkQWNjZXNzaWJpbGl0eSxcblx0XHRcdGlkOiAnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlMZWZ0U2VsZWN0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX21vdmUod29yZENoYXJhY3RlckNsYXNzaWZpZXI6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3I6IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHN1cGVyLl9tb3ZlKGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKEVkaXRvck9wdGlvbnMud29yZFNlcGFyYXRvcnMuZGVmYXVsdFZhbHVlLCB3b3JkQ2hhcmFjdGVyQ2xhc3NpZmllci5pbnRsU2VnbWVudGVyTG9jYWxlcyksIG1vZGVsLCBwb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRTdGFydFJpZ2h0IGV4dGVuZHMgV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQsXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRTdGFydFJpZ2h0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRFbmRSaWdodCBleHRlbmRzIFdvcmRSaWdodENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZEVuZFJpZ2h0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgSXNXaW5kb3dzQ29udGV4dCk/Lm5lZ2F0ZSgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5SaWdodEFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRSaWdodCBleHRlbmRzIFdvcmRSaWdodENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZFJpZ2h0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRTdGFydFJpZ2h0U2VsZWN0IGV4dGVuZHMgV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZFN0YXJ0UmlnaHRTZWxlY3QnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZEVuZFJpZ2h0U2VsZWN0IGV4dGVuZHMgV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRFbmQsXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRFbmRSaWdodFNlbGVjdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cywgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQsIElzV2luZG93c0NvbnRleHQpPy5uZWdhdGUoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5SaWdodEFycm93LFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUmlnaHRBcnJvdyB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkUmlnaHRTZWxlY3QgZXh0ZW5kcyBXb3JkUmlnaHRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiB0cnVlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZFJpZ2h0U2VsZWN0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5UmlnaHQgZXh0ZW5kcyBXb3JkUmlnaHRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiBmYWxzZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRBY2Nlc3NpYmlsaXR5LFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkQWNjZXNzaWJpbGl0eVJpZ2h0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX21vdmUod29yZENoYXJhY3RlckNsYXNzaWZpZXI6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3I6IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHN1cGVyLl9tb3ZlKGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKEVkaXRvck9wdGlvbnMud29yZFNlcGFyYXRvcnMuZGVmYXVsdFZhbHVlLCB3b3JkQ2hhcmFjdGVyQ2xhc3NpZmllci5pbnRsU2VnbWVudGVyTG9jYWxlcyksIG1vZGVsLCBwb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5UmlnaHRTZWxlY3QgZXh0ZW5kcyBXb3JkUmlnaHRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiB0cnVlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEFjY2Vzc2liaWxpdHksXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5UmlnaHRTZWxlY3QnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfbW92ZSh3b3JkQ2hhcmFjdGVyQ2xhc3NpZmllcjogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcjogYm9vbGVhbik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gc3VwZXIuX21vdmUoZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoRWRpdG9yT3B0aW9ucy53b3JkU2VwYXJhdG9ycy5kZWZhdWx0VmFsdWUsIHdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLmludGxTZWdtZW50ZXJMb2NhbGVzKSwgbW9kZWwsIHBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERlbGV0ZVdvcmRPcHRpb25zIGV4dGVuZHMgSUNvbW1hbmRPcHRpb25zIHtcblx0d2hpdGVzcGFjZUhldXJpc3RpY3M6IGJvb2xlYW47XG5cdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRGVsZXRlV29yZENvbW1hbmQgZXh0ZW5kcyBFZGl0b3JDb21tYW5kIHtcblx0cHJpdmF0ZSByZWFkb25seSBfd2hpdGVzcGFjZUhldXJpc3RpY3M6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlO1xuXG5cdGNvbnN0cnVjdG9yKG9wdHM6IERlbGV0ZVdvcmRPcHRpb25zKSB7XG5cdFx0c3VwZXIoeyBjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsIC4uLm9wdHMgfSk7XG5cdFx0dGhpcy5fd2hpdGVzcGFjZUhldXJpc3RpY3MgPSBvcHRzLndoaXRlc3BhY2VIZXVyaXN0aWNzO1xuXHRcdHRoaXMuX3dvcmROYXZpZ2F0aW9uVHlwZSA9IG9wdHMud29yZE5hdmlnYXRpb25UeXBlO1xuXHR9XG5cblx0cHVibGljIHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3I/LmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpIHx8ICFsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpLCBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VnbWVudGVyTG9jYWxlcykpO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3QgYXV0b0Nsb3NpbmdCcmFja2V0cyA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmF1dG9DbG9zaW5nQnJhY2tldHMpO1xuXHRcdGNvbnN0IGF1dG9DbG9zaW5nUXVvdGVzID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdRdW90ZXMpO1xuXHRcdGNvbnN0IGF1dG9DbG9zaW5nUGFpcnMgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihtb2RlbC5nZXRMYW5ndWFnZUlkKCkpLmdldEF1dG9DbG9zaW5nUGFpcnMoKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBzZWxlY3Rpb25zLm1hcCgoc2VsKSA9PiB7XG5cdFx0XHRjb25zdCBkZWxldGVSYW5nZSA9IHRoaXMuX2RlbGV0ZSh7XG5cdFx0XHRcdHdvcmRTZXBhcmF0b3JzLFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0c2VsZWN0aW9uOiBzZWwsXG5cdFx0XHRcdHdoaXRlc3BhY2VIZXVyaXN0aWNzOiB0aGlzLl93aGl0ZXNwYWNlSGV1cmlzdGljcyxcblx0XHRcdFx0YXV0b0Nsb3NpbmdEZWxldGU6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmF1dG9DbG9zaW5nRGVsZXRlKSxcblx0XHRcdFx0YXV0b0Nsb3NpbmdCcmFja2V0cyxcblx0XHRcdFx0YXV0b0Nsb3NpbmdRdW90ZXMsXG5cdFx0XHRcdGF1dG9DbG9zaW5nUGFpcnMsXG5cdFx0XHRcdGF1dG9DbG9zZWRDaGFyYWN0ZXJzOiB2aWV3TW9kZWwuZ2V0Q3Vyc29yQXV0b0Nsb3NlZENoYXJhY3RlcnMoKSxcblx0XHRcdH0sIHRoaXMuX3dvcmROYXZpZ2F0aW9uVHlwZSk7XG5cdFx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kKGRlbGV0ZVJhbmdlLCAnJyk7XG5cdFx0fSk7XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBjb21tYW5kcyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9kZWxldGUoY3R4OiBEZWxldGVXb3JkQ29udGV4dCwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUpOiBSYW5nZTtcbn1cblxuZXhwb3J0IGNsYXNzIERlbGV0ZVdvcmRMZWZ0Q29tbWFuZCBleHRlbmRzIERlbGV0ZVdvcmRDb21tYW5kIHtcblx0cHJvdGVjdGVkIF9kZWxldGUoY3R4OiBEZWxldGVXb3JkQ29udGV4dCwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUpOiBSYW5nZSB7XG5cdFx0Y29uc3QgciA9IFdvcmRPcGVyYXRpb25zLmRlbGV0ZVdvcmRMZWZ0KGN0eCwgd29yZE5hdmlnYXRpb25UeXBlKTtcblx0XHRpZiAocikge1xuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlbGV0ZVdvcmRSaWdodENvbW1hbmQgZXh0ZW5kcyBEZWxldGVXb3JkQ29tbWFuZCB7XG5cdHByb3RlY3RlZCBfZGVsZXRlKGN0eDogRGVsZXRlV29yZENvbnRleHQsIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHIgPSBXb3JkT3BlcmF0aW9ucy5kZWxldGVXb3JkUmlnaHQoY3R4LCB3b3JkTmF2aWdhdGlvblR5cGUpO1xuXHRcdGlmIChyKSB7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gY3R4Lm1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IG1heENvbHVtbiA9IGN0eC5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVDb3VudCk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShsaW5lQ291bnQsIG1heENvbHVtbiwgbGluZUNvdW50LCBtYXhDb2x1bW4pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVXb3JkU3RhcnRMZWZ0IGV4dGVuZHMgRGVsZXRlV29yZExlZnRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0d2hpdGVzcGFjZUhldXJpc3RpY3M6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0LFxuXHRcdFx0aWQ6ICdkZWxldGVXb3JkU3RhcnRMZWZ0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlV29yZEVuZExlZnQgZXh0ZW5kcyBEZWxldGVXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHR3aGl0ZXNwYWNlSGV1cmlzdGljczogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kLFxuXHRcdFx0aWQ6ICdkZWxldGVXb3JkRW5kTGVmdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlbGV0ZVdvcmRMZWZ0IGV4dGVuZHMgRGVsZXRlV29yZExlZnRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0d2hpdGVzcGFjZUhldXJpc3RpY3M6IHRydWUsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQsXG5cdFx0XHRpZDogJ2RlbGV0ZVdvcmRMZWZ0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkJhY2tzcGFjZSB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVXb3JkU3RhcnRSaWdodCBleHRlbmRzIERlbGV0ZVdvcmRSaWdodENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHR3aGl0ZXNwYWNlSGV1cmlzdGljczogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQsXG5cdFx0XHRpZDogJ2RlbGV0ZVdvcmRTdGFydFJpZ2h0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlV29yZEVuZFJpZ2h0IGV4dGVuZHMgRGVsZXRlV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdHdoaXRlc3BhY2VIZXVyaXN0aWNzOiBmYWxzZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRFbmQsXG5cdFx0XHRpZDogJ2RlbGV0ZVdvcmRFbmRSaWdodCcsXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlbGV0ZVdvcmRSaWdodCBleHRlbmRzIERlbGV0ZVdvcmRSaWdodENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHR3aGl0ZXNwYWNlSGV1cmlzdGljczogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRFbmQsXG5cdFx0XHRpZDogJ2RlbGV0ZVdvcmRSaWdodCcsXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5EZWxldGUgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlSW5zaWRlV29yZCBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdkZWxldGVJbnNpZGVXb3JkJyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZGVsZXRlSW5zaWRlV29yZCcsIFwiRGVsZXRlIFdvcmRcIiksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignZGVsZXRlSW5zaWRlV29yZC5kZXNjcmlwdGlvbicsIFwiRGVsZXRlIHRoZSB3b3JkIGF0IHRoZSBjdXJzb3JcIiksXG5cdFx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ2FyZ3MnLFxuXHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdCdvbmx5V29yZCc6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGVsZXRlSW5zaWRlV29yZC5hcmdzLm9ubHlXb3JkJywgXCJEZWxldGUgb25seSB0aGUgd29yZCBhbmQgbGVhdmUgc3Vycm91bmRpbmcgd2hpdGVzcGFjZVwiKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0eXBlIERlbGV0ZUluc2lkZVdvcmRBcmdzID0geyByZWFkb25seSBvbmx5V29yZD86IGJvb2xlYW4gfTtcblx0XHRjb25zdCBvbmx5V29yZCA9ICEhKGFyZ3MgJiYgdHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnICYmIChhcmdzIGFzIERlbGV0ZUluc2lkZVdvcmRBcmdzKS5vbmx5V29yZCk7XG5cdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSBnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyhlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycyksIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZWdtZW50ZXJMb2NhbGVzKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblxuXHRcdGNvbnN0IGNvbW1hbmRzID0gc2VsZWN0aW9ucy5tYXAoKHNlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVsZXRlUmFuZ2UgPSBXb3JkT3BlcmF0aW9ucy5kZWxldGVJbnNpZGVXb3JkKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgc2VsLCBvbmx5V29yZCk7XG5cdFx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kKGRlbGV0ZVJhbmdlLCAnJyk7XG5cdFx0fSk7XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBjb21tYW5kcyk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZFN0YXJ0TGVmdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZEVuZExlZnQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRMZWZ0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkU3RhcnRMZWZ0U2VsZWN0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkRW5kTGVmdFNlbGVjdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZExlZnRTZWxlY3QoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRTdGFydFJpZ2h0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkRW5kUmlnaHQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRSaWdodCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZFN0YXJ0UmlnaHRTZWxlY3QoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRFbmRSaWdodFNlbGVjdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZFJpZ2h0U2VsZWN0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdFNlbGVjdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodFNlbGVjdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRGVsZXRlV29yZFN0YXJ0TGVmdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRGVsZXRlV29yZEVuZExlZnQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IERlbGV0ZVdvcmRMZWZ0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBEZWxldGVXb3JkU3RhcnRSaWdodCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRGVsZXRlV29yZEVuZFJpZ2h0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBEZWxldGVXb3JkUmlnaHQoKSk7XG5yZWdpc3RlckVkaXRvckFjdGlvbihEZWxldGVJbnNpZGVXb3JkKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFlBQVksU0FBUztBQUNyQixTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGNBQWMsZUFBZ0Msc0JBQXNCLDZCQUErQztBQUM1SCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGNBQWMscUJBQXFCO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtCQUF3RDtBQUNqRSxTQUE0QixvQkFBb0Isc0JBQXNCO0FBQ3RFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBUXZDLE1BQWUsd0JBQXdCLGNBQWM7QUFBQSxFQUszRCxZQUFZLE1BQXVCO0FBQ2xDLFVBQU0sSUFBSTtBQUNWLFNBQUssbUJBQW1CLEtBQUs7QUFDN0IsU0FBSyxzQkFBc0IsS0FBSztBQUFBLEVBQ2pDO0FBQUEsRUFFTyxpQkFBaUIsVUFBNEIsUUFBcUIsTUFBcUI7QUFDN0YsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLFVBQU0saUJBQWlCLHdCQUF3QixPQUFPLFVBQVUsYUFBYSxjQUFjLEdBQUcsT0FBTyxVQUFVLGFBQWEsb0JBQW9CLENBQUM7QUFDakosVUFBTSxRQUFRLE9BQU8sU0FBUztBQUM5QixVQUFNLGFBQWEsT0FBTyxjQUFjO0FBQ3hDLFVBQU0saUJBQWlCLFdBQVcsU0FBUztBQUMzQyxVQUFNLFNBQVMsV0FBVyxJQUFJLENBQUMsUUFBUTtB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
