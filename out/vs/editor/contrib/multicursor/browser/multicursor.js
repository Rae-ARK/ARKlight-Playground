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
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Constants } from "../../../../base/common/uint.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { CursorMoveCommands } from "../../../common/cursor/cursorMoveCommands.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { CommonFindController } from "../../find/browser/findController.js";
import { FindOptionOverride } from "../../find/browser/findState.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { getSelectionHighlightDecorationOptions } from "../../wordHighlighter/browser/highlightDecorations.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
function announceCursorChange(previousCursorState, cursorState) {
  const cursorDiff = cursorState.filter((cs) => !previousCursorState.find((pcs) => pcs.equals(cs)));
  if (cursorDiff.length >= 1) {
    const cursorPositions = cursorDiff.map((cs) => `line ${cs.viewState.position.lineNumber} column ${cs.viewState.position.column}`).join(", ");
    const msg = cursorDiff.length === 1 ? nls.localize("cursorAdded", "Cursor added: {0}", cursorPositions) : nls.localize("cursorsAdded", "Cursors added: {0}", cursorPositions);
    status(msg);
  }
}
class InsertCursorAbove extends EditorAction {
  constructor() {
    super({
      id: "editor.action.insertCursorAbove",
      label: nls.localize2("mutlicursor.insertAbove", "Add Cursor Above"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
        linux: {
          primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
        },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miInsertCursorAbove", comment: ["&& denotes a mnemonic"] }, "&&Add Cursor Above"),
        order: 2
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    let useLogicalLine = true;
    if (args && args.logicalLine === false) {
      useLogicalLine = false;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = viewModel.getCursorStates();
    viewModel.setCursorStates(
      args.source,
      CursorChangeReason.Explicit,
      CursorMoveCommands.addCursorUp(viewModel, previousCursorState, useLogicalLine)
    );
    viewModel.revealTopMostCursor(args.source);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorBelow extends EditorAction {
  constructor() {
    super({
      id: "editor.action.insertCursorBelow",
      label: nls.localize2("mutlicursor.insertBelow", "Add Cursor Below"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
        linux: {
          primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
        },
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miInsertCursorBelow", comment: ["&& denotes a mnemonic"] }, "A&&dd Cursor Below"),
        order: 3
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    let useLogicalLine = true;
    if (args && args.logicalLine === false) {
      useLogicalLine = false;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = viewModel.getCursorStates();
    viewModel.setCursorStates(
      args.source,
      CursorChangeReason.Explicit,
      CursorMoveCommands.addCursorDown(viewModel, previousCursorState, useLogicalLine)
    );
    viewModel.revealBottomMostCursor(args.source);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorAtEndOfEachLineSelected extends EditorAction {
  constructor() {
    super({
      id: "editor.action.insertCursorAtEndOfEachLineSelected",
      label: nls.localize2("mutlicursor.insertAtEndOfEachLineSelected", "Add Cursors to Line Ends"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyI,
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miInsertCursorAtEndOfEachLineSelected", comment: ["&& denotes a mnemonic"] }, "Add C&&ursors to Line Ends"),
        order: 4
      }
    });
  }
  getCursorsForSelection(selection, model, result) {
    if (selection.isEmpty()) {
      return;
    }
    for (let i = selection.startLineNumber; i < selection.endLineNumber; i++) {
      const currentLineMaxColumn = model.getLineMaxColumn(i);
      result.push(new Selection(i, currentLineMaxColumn, i, currentLineMaxColumn));
    }
    if (selection.endColumn > 1) {
      result.push(new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn));
    }
  }
  run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const model = editor.getModel();
    const selections = editor.getSelections();
    const viewModel = editor._getViewModel();
    const previousCursorState = viewModel.getCursorStates();
    const newSelections = [];
    selections.forEach((sel) => this.getCursorsForSelection(sel, model, newSelections));
    if (newSelections.length > 0) {
      editor.setSelections(newSelections);
    }
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorAtEndOfLineSelected extends EditorAction {
  constructor() {
    super({
      id: "editor.action.addCursorsToBottom",
      label: nls.localize2("mutlicursor.addCursorsToBottom", "Add Cursors to Bottom"),
      precondition: void 0
    });
  }
  run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections();
    const lineCount = editor.getModel().getLineCount();
    const newSelections = [];
    for (let i = selections[0].startLineNumber; i <= lineCount; i++) {
      newSelections.push(new Selection(i, selections[0].startColumn, i, selections[0].endColumn));
    }
    const viewModel = editor._getViewModel();
    const previousCursorState = viewModel.getCursorStates();
    if (newSelections.length > 0) {
      editor.setSelections(newSelections);
    }
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class InsertCursorAtTopOfLineSelected extends EditorAction {
  constructor() {
    super({
      id: "editor.action.addCursorsToTop",
      label: nls.localize2("mutlicursor.addCursorsToTop", "Add Cursors to Top"),
      precondition: void 0
    });
  }
  run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections();
    const newSelections = [];
    for (let i = selections[0].startLineNumber; i >= 1; i--) {
      newSelections.push(new Selection(i, selections[0].startColumn, i, selections[0].endColumn));
    }
    const viewModel = editor._getViewModel();
    const previousCursorState = viewModel.getCursorStates();
    if (newSelections.length > 0) {
      editor.setSelections(newSelections);
    }
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class MultiCursorSessionResult {
  constructor(selections, revealRange, revealScrollType) {
    this.selections = selections;
    this.revealRange = revealRange;
    this.revealScrollType = revealScrollType;
  }
}
class MultiCursorSession {
  constructor(_editor, findController, isDisconnectedFromFindController, searchText, wholeWord, matchCase, currentMatch) {
    this._editor = _editor;
    this.findController = findController;
    this.isDisconnectedFromFindController = isDisconnectedFromFindController;
    this.searchText = searchText;
    this.wholeWord = wholeWord;
    this.matchCase = matchCase;
    this.currentMatch = currentMatch;
  }
  static create(editor, findController) {
    if (!editor.hasModel()) {
      return null;
    }
    const findState = findController.getState();
    if (!editor.hasTextFocus() && findState.isRevealed && findState.searchString.length > 0) {
      return new MultiCursorSession(editor, findController, false, findState.searchString, findState.wholeWord, findState.matchCase, null);
    }
    let isDisconnectedFromFindController = false;
    let wholeWord;
    let matchCase;
    const selections = editor.getSelections();
    if (selections.length === 1 && selections[0].isEmpty()) {
      isDisconnectedFromFindController = true;
      wholeWord = true;
      matchCase = true;
    } else {
      wholeWord = findState.wholeWord;
      matchCase = findState.matchCase;
    }
    const s = editor.getSelection();
    let searchText;
    let currentMatch = null;
    if (s.isEmpty()) {
      const word = editor.getConfiguredWordAtPosition(s.getStartPosition());
      if (!word) {
        return null;
      }
      searchText = word.word;
      currentMatch = new Selection(s.startLineNumber, word.startColumn, s.startLineNumber, word.endColumn);
    } else {
      searchText = editor.getModel().getValueInRange(s).replace(/\r\n/g, "\n");
    }
    return new MultiCursorSession(editor, findController, isDisconnectedFromFindController, searchText, wholeWord, matchCase, currentMatch);
  }
  addSelectionToNextFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const nextMatch = this._getNextMatch();
    if (!nextMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.concat(nextMatch), nextMatch, ScrollType.Smooth);
  }
  moveSelectionToNextFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const nextMatch = this._getNextMatch();
    if (!nextMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(nextMatch), nextMatch, ScrollType.Smooth);
  }
  _getNextMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    if (this.currentMatch) {
      const result = this.currentMatch;
      this.currentMatch = null;
      return result;
    }
    this.findController.highlightFindOptions();
    const allSelections = this._editor.getSelections();
    const lastAddedSelection = allSelections[allSelections.length - 1];
    const nextMatch = this._editor.getModel().findNextMatch(this.searchText, lastAddedSelection.getEndPosition(), false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    if (!nextMatch) {
      return null;
    }
    return new Selection(nextMatch.range.startLineNumber, nextMatch.range.startColumn, nextMatch.range.endLineNumber, nextMatch.range.endColumn);
  }
  addSelectionToPreviousFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const previousMatch = this._getPreviousMatch();
    if (!previousMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.concat(previousMatch), previousMatch, ScrollType.Smooth);
  }
  moveSelectionToPreviousFindMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    const previousMatch = this._getPreviousMatch();
    if (!previousMatch) {
      return null;
    }
    const allSelections = this._editor.getSelections();
    return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(previousMatch), previousMatch, ScrollType.Smooth);
  }
  _getPreviousMatch() {
    if (!this._editor.hasModel()) {
      return null;
    }
    if (this.currentMatch) {
      const result = this.currentMatch;
      this.currentMatch = null;
      return result;
    }
    this.findController.highlightFindOptions();
    const allSelections = this._editor.getSelections();
    const lastAddedSelection = allSelections[allSelections.length - 1];
    const previousMatch = this._editor.getModel().findPreviousMatch(this.searchText, lastAddedSelection.getStartPosition(), false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    if (!previousMatch) {
      return null;
    }
    return new Selection(previousMatch.range.startLineNumber, previousMatch.range.startColumn, previousMatch.range.endLineNumber, previousMatch.range.endColumn);
  }
  selectAll(searchScope) {
    if (!this._editor.hasModel()) {
      return [];
    }
    this.findController.highlightFindOptions();
    const editorModel = this._editor.getModel();
    if (searchScope) {
      return editorModel.findMatches(this.searchText, searchScope, false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
    }
    return editorModel.findMatches(this.searchText, true, false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
  }
}
const _MultiCursorSelectionController = class _MultiCursorSelectionController extends Disposable {
  constructor(editor) {
    super();
    this._sessionDispose = this._register(new DisposableStore());
    this._editor = editor;
    this._ignoreSelectionChange = false;
    this._session = null;
  }
  static get(editor) {
    return editor.getContribution(_MultiCursorSelectionController.ID);
  }
  dispose() {
    this._endSession();
    super.dispose();
  }
  _beginSessionIfNeeded(findController) {
    if (!this._session) {
      const session = MultiCursorSession.create(this._editor, findController);
      if (!session) {
        return;
      }
      this._session = session;
      const newState = { searchString: this._session.searchText };
      if (this._session.isDisconnectedFromFindController) {
        newState.wholeWordOverride = FindOptionOverride.True;
        newState.matchCaseOverride = FindOptionOverride.True;
        newState.isRegexOverride = FindOptionOverride.False;
      }
      findController.getState().change(newState, false);
      this._sessionDispose.add(this._editor.onDidChangeCursorSelection((e) => {
        if (this._ignoreSelectionChange) {
          return;
        }
        this._endSession();
      }));
      this._sessionDispose.add(this._editor.onDidBlurEditorText(() => {
        this._endSession();
      }));
      this._sessionDispose.add(findController.getState().onFindReplaceStateChange((e) => {
        if (e.matchCase || e.wholeWord) {
          this._endSession();
        }
      }));
    }
  }
  _endSession() {
    this._sessionDispose.clear();
    if (this._session && this._session.isDisconnectedFromFindController) {
      const newState = {
        wholeWordOverride: FindOptionOverride.NotSet,
        matchCaseOverride: FindOptionOverride.NotSet,
        isRegexOverride: FindOptionOverride.NotSet
      };
      this._session.findController.getState().change(newState, false);
    }
    this._session = null;
  }
  _setSelections(selections) {
    this._ignoreSelectionChange = true;
    this._editor.setSelections(selections);
    this._ignoreSelectionChange = false;
  }
  _expandEmptyToWord(model, selection) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const word = this._editor.getConfiguredWordAtPosition(selection.getStartPosition());
    if (!word) {
      return selection;
    }
    return new Selection(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
  }
  _applySessionResult(result) {
    if (!result) {
      return;
    }
    this._setSelections(result.selections);
    if (result.revealRange) {
      this._editor.revealRangeInCenterIfOutsideViewport(result.revealRange, result.revealScrollType);
    }
  }
  getSession(findController) {
    return this._session;
  }
  addSelectionToNextFindMatch(findController) {
    if (!this._editor.hasModel()) {
      return;
    }
    if (!this._session) {
      const allSelections = this._editor.getSelections();
      if (allSelections.length > 1) {
        const findState = findController.getState();
        const matchCase = findState.matchCase;
        const selectionsContainSameText = modelRangesContainSameText(this._editor.getModel(), allSelections, matchCase);
        if (!selectionsContainSameText) {
          const model = this._editor.getModel();
          const resultingSelections = [];
          for (let i = 0, len = allSelections.length; i < len; i++) {
            resultingSelections[i] = this._expandEmptyToWord(model, allSelections[i]);
          }
          this._editor.setSelections(resultingSelections);
          return;
        }
      }
    }
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.addSelectionToNextFindMatch());
    }
  }
  addSelectionToPreviousFindMatch(findController) {
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.addSelectionToPreviousFindMatch());
    }
  }
  moveSelectionToNextFindMatch(findController) {
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.moveSelectionToNextFindMatch());
    }
  }
  moveSelectionToPreviousFindMatch(findController) {
    this._beginSessionIfNeeded(findController);
    if (this._session) {
      this._applySessionResult(this._session.moveSelectionToPreviousFindMatch());
    }
  }
  selectAll(findController) {
    if (!this._editor.hasModel()) {
      return;
    }
    let matches = null;
    const findState = findController.getState();
    if (findState.isRevealed && findState.searchString.length > 0 && findState.isRegex) {
      const editorModel = this._editor.getModel();
      if (findState.searchScope) {
        matches = editorModel.findMatches(findState.searchString, findState.searchScope, findState.isRegex, findState.matchCase, findState.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
      } else {
        matches = editorModel.findMatches(findState.searchString, true, findState.isRegex, findState.matchCase, findState.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
      }
    } else {
      this._beginSessionIfNeeded(findController);
      if (!this._session) {
        return;
      }
      matches = this._session.selectAll(findState.searchScope);
    }
    if (matches.length > 0) {
      const editorSelection = this._editor.getSelection();
      for (let i = 0, len = matches.length; i < len; i++) {
        const match = matches[i];
        const intersection = match.range.intersectRanges(editorSelection);
        if (intersection) {
          matches[i] = matches[0];
          matches[0] = match;
          break;
        }
      }
      this._setSelections(matches.map((m) => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn)));
    }
  }
  selectAllUsingSelections(selections) {
    if (selections.length > 0) {
      this._setSelections(selections);
    }
  }
};
_MultiCursorSelectionController.ID = "editor.contrib.multiCursorController";
let MultiCursorSelectionController = _MultiCursorSelectionController;
class MultiCursorSelectionControllerAction extends EditorAction {
  run(accessor, editor) {
    const multiCursorController = MultiCursorSelectionController.get(editor);
    if (!multiCursorController) {
      return;
    }
    const viewModel = editor._getViewModel();
    if (viewModel) {
      const previousCursorState = viewModel.getCursorStates();
      const findController = CommonFindController.get(editor);
      if (findController) {
        this._run(multiCursorController, findController);
      } else {
        const newFindController = accessor.get(IInstantiationService).createInstance(CommonFindController, editor);
        this._run(multiCursorController, newFindController);
        newFindController.dispose();
      }
      announceCursorChange(previousCursorState, viewModel.getCursorStates());
    }
  }
}
class AddSelectionToNextFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.addSelectionToNextFindMatch",
      label: nls.localize2("addSelectionToNextFindMatch", "Add Selection to Next Find Match"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyCode.KeyD,
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miAddSelectionToNextFindMatch", comment: ["&& denotes a mnemonic"] }, "Add &&Next Occurrence"),
        order: 5
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.addSelectionToNextFindMatch(findController);
  }
}
class AddSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.addSelectionToPreviousFindMatch",
      label: nls.localize2("addSelectionToPreviousFindMatch", "Add Selection to Previous Find Match"),
      precondition: void 0,
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miAddSelectionToPreviousFindMatch", comment: ["&& denotes a mnemonic"] }, "Add P&&revious Occurrence"),
        order: 6
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.addSelectionToPreviousFindMatch(findController);
  }
}
class MoveSelectionToNextFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.moveSelectionToNextFindMatch",
      label: nls.localize2("moveSelectionToNextFindMatch", "Move Last Selection to Next Find Match"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyD),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.moveSelectionToNextFindMatch(findController);
  }
}
class MoveSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.moveSelectionToPreviousFindMatch",
      label: nls.localize2("moveSelectionToPreviousFindMatch", "Move Last Selection to Previous Find Match"),
      precondition: void 0
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.moveSelectionToPreviousFindMatch(findController);
  }
}
class SelectHighlightsAction extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.selectHighlights",
      label: nls.localize2("selectAllOccurrencesOfFindMatch", "Select All Occurrences of Find Match"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarSelectionMenu,
        group: "3_multi",
        title: nls.localize({ key: "miSelectHighlights", comment: ["&& denotes a mnemonic"] }, "Select All &&Occurrences"),
        order: 7
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.selectAll(findController);
  }
}
class CompatChangeAll extends MultiCursorSelectionControllerAction {
  constructor() {
    super({
      id: "editor.action.changeAll",
      label: nls.localize2("changeAll.label", "Change All Occurrences"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.editorTextFocus),
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyCode.F2,
        weight: KeybindingWeight.EditorContrib
      },
      contextMenuOpts: {
        group: "1_modification",
        order: 1.2
      }
    });
  }
  _run(multiCursorController, findController) {
    multiCursorController.selectAll(findController);
  }
}
class SelectionHighlighterState {
  constructor(_model, _searchText, _matchCase, _wordSeparators, prevState) {
    this._model = _model;
    this._searchText = _searchText;
    this._matchCase = _matchCase;
    this._wordSeparators = _wordSeparators;
    this._cachedFindMatches = null;
    this._modelVersionId = this._model.getVersionId();
    if (prevState && this._model === prevState._model && this._searchText === prevState._searchText && this._matchCase === prevState._matchCase && this._wordSeparators === prevState._wordSeparators && this._modelVersionId === prevState._modelVersionId) {
      this._cachedFindMatches = prevState._cachedFindMatches;
    }
  }
  findMatches() {
    if (this._cachedFindMatches === null) {
      this._cachedFindMatches = this._model.findMatches(this._searchText, true, false, this._matchCase, this._wordSeparators, false).map((m) => m.range);
      this._cachedFindMatches.sort(Range.compareRangesUsingStarts);
    }
    return this._cachedFindMatches;
  }
}
let SelectionHighlighter = class extends Disposable {
  constructor(editor, _languageFeaturesService) {
    super();
    this._languageFeaturesService = _languageFeaturesService;
    this.editor = editor;
    this._isEnabled = editor.getOption(EditorOption.selectionHighlight);
    this._isEnabledMultiline = editor.getOption(EditorOption.selectionHighlightMultiline);
    this._maxLength = editor.getOption(EditorOption.selectionHighlightMaxLength);
    this._decorations = editor.createDecorationsCollection();
    this.updateSoon = this._register(new RunOnceScheduler(() => this._update(), 300));
    this.state = null;
    this._register(editor.onDidChangeConfiguration((e) => {
      this._isEnabled = editor.getOption(EditorOption.selectionHighlight);
      this._isEnabledMultiline = editor.getOption(EditorOption.selectionHighlightMultiline);
      this._maxLength = editor.getOption(EditorOption.selectionHighlightMaxLength);
    }));
    this._register(editor.onDidChangeCursorSelection((e) => {
      if (!this._isEnabled) {
        return;
      }
      if (e.selection.isEmpty()) {
        if (e.reason === CursorChangeReason.Explicit) {
          if (this.state) {
            this._setState(null);
          }
          this.updateSoon.schedule();
        } else {
          this._setState(null);
        }
      } else {
        this._update();
      }
    }));
    this._register(editor.onDidChangeModel((e) => {
      this._setState(null);
    }));
    this._register(editor.onDidChangeModelContent((e) => {
      if (this._isEnabled) {
        this.updateSoon.schedule();
      }
    }));
    const findController = CommonFindController.get(editor);
    if (findController) {
      this._register(findController.getState().onFindReplaceStateChange((e) => {
        this._update();
      }));
    }
    this.updateSoon.schedule();
  }
  _update() {
    this._setState(SelectionHighlighter._createState(this.state, this._isEnabled, this._isEnabledMultiline, this._maxLength, this.editor));
  }
  static _createState(oldState, isEnabled, isEnabledMultiline, maxLength, editor) {
    if (!isEnabled) {
      return null;
    }
    if (!editor.hasModel()) {
      return null;
    }
    if (!isEnabledMultiline) {
      const s = editor.getSelection();
      if (s.startLineNumber !== s.endLineNumber) {
        return null;
      }
    }
    const multiCursorController = MultiCursorSelectionController.get(editor);
    if (!multiCursorController) {
      return null;
    }
    const findController = CommonFindController.get(editor);
    if (!findController) {
      return null;
    }
    let r = multiCursorController.getSession(findController);
    if (!r) {
      const allSelections = editor.getSelections();
      if (allSelections.length > 1) {
        const findState2 = findController.getState();
        const matchCase = findState2.matchCase;
        const selectionsContainSameText = modelRangesContainSameText(editor.getModel(), allSelections, matchCase);
        if (!selectionsContainSameText) {
          return null;
        }
      }
      r = MultiCursorSession.create(editor, findController);
    }
    if (!r) {
      return null;
    }
    if (r.currentMatch) {
      return null;
    }
    if (/^[ \t]+$/.test(r.searchText)) {
      return null;
    }
    if (maxLength > 0 && r.searchText.length > maxLength) {
      return null;
    }
    const findState = findController.getState();
    const caseSensitive = findState.matchCase;
    if (findState.isRevealed) {
      let findStateSearchString = findState.searchString;
      if (!caseSensitive) {
        findStateSearchString = findStateSearchString.toLowerCase();
      }
      let mySearchString = r.searchText;
      if (!caseSensitive) {
        mySearchString = mySearchString.toLowerCase();
      }
      if (findStateSearchString === mySearchString && r.matchCase === findState.matchCase && r.wholeWord === findState.wholeWord && !findState.isRegex) {
        return null;
      }
    }
    return new SelectionHighlighterState(editor.getModel(), r.searchText, r.matchCase, r.wholeWord ? editor.getOption(EditorOption.wordSeparators) : null, oldState);
  }
  _setState(newState) {
    this.state = newState;
    if (!this.state) {
      this._decorations.clear();
      return;
    }
    if (!this.editor.hasModel()) {
      return;
    }
    const model = this.editor.getModel();
    if (model.isTooLargeForTokenization()) {
      return;
    }
    const allMatches = this.state.findMatches();
    const selections = this.editor.getSelections();
    selections.sort(Range.compareRangesUsingStarts);
    const matches = [];
    for (let i = 0, j = 0, len = allMatches.length, lenJ = selections.length; i < len; ) {
      const match = allMatches[i];
      if (j >= lenJ) {
        matches.push(match);
        i++;
      } else {
        const cmp = Range.compareRangesUsingStarts(match, selections[j]);
        if (cmp < 0) {
          if (selections[j].isEmpty() || !Range.areIntersecting(match, selections[j])) {
            matches.push(match);
          }
          i++;
        } else if (cmp > 0) {
          j++;
        } else {
          i++;
          j++;
        }
      }
    }
    const occurrenceHighlighting = this.editor.getOption(EditorOption.occurrencesHighlight) !== "off";
    const hasSemanticHighlights = this._languageFeaturesService.documentHighlightProvider.has(model) && occurrenceHighlighting;
    const decorations = matches.map((r) => {
      return {
        range: r,
        options: getSelectionHighlightDecorationOptions(hasSemanticHighlights)
      };
    });
    this._decorations.set(decorations);
  }
  dispose() {
    this._setState(null);
    super.dispose();
  }
};
SelectionHighlighter.ID = "editor.contrib.selectionHighlighter";
SelectionHighlighter = __decorateClass([
  __decorateParam(1, ILanguageFeaturesService)
], SelectionHighlighter);
function modelRangesContainSameText(model, ranges, matchCase) {
  const selectedText = getValueInRange(model, ranges[0], !matchCase);
  for (let i = 1, len = ranges.length; i < len; i++) {
    const range = ranges[i];
    if (range.isEmpty()) {
      return false;
    }
    const thisSelectedText = getValueInRange(model, range, !matchCase);
    if (selectedText !== thisSelectedText) {
      return false;
    }
  }
  return true;
}
function getValueInRange(model, range, toLowerCase) {
  const text = model.getValueInRange(range);
  return toLowerCase ? text.toLowerCase() : text;
}
class FocusNextCursor extends EditorAction {
  constructor() {
    super({
      id: "editor.action.focusNextCursor",
      label: nls.localize2("mutlicursor.focusNextCursor", "Focus Next Cursor"),
      metadata: {
        description: nls.localize("mutlicursor.focusNextCursor.description", "Focuses the next cursor"),
        args: []
      },
      precondition: void 0
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = Array.from(viewModel.getCursorStates());
    const firstCursor = previousCursorState.shift();
    if (!firstCursor) {
      return;
    }
    previousCursorState.push(firstCursor);
    viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, previousCursorState);
    viewModel.revealPrimaryCursor(args.source, true);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
class FocusPreviousCursor extends EditorAction {
  constructor() {
    super({
      id: "editor.action.focusPreviousCursor",
      label: nls.localize2("mutlicursor.focusPreviousCursor", "Focus Previous Cursor"),
      metadata: {
        description: nls.localize("mutlicursor.focusPreviousCursor.description", "Focuses the previous cursor"),
        args: []
      },
      precondition: void 0
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const viewModel = editor._getViewModel();
    if (viewModel.cursorConfig.readOnly) {
      return;
    }
    viewModel.model.pushStackElement();
    const previousCursorState = Array.from(viewModel.getCursorStates());
    const firstCursor = previousCursorState.pop();
    if (!firstCursor) {
      return;
    }
    previousCursorState.unshift(firstCursor);
    viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, previousCursorState);
    viewModel.revealPrimaryCursor(args.source, true);
    announceCursorChange(previousCursorState, viewModel.getCursorStates());
  }
}
registerEditorContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController, EditorContributionInstantiation.Lazy);
registerEditorContribution(SelectionHighlighter.ID, SelectionHighlighter, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(InsertCursorAbove);
registerEditorAction(InsertCursorBelow);
registerEditorAction(InsertCursorAtEndOfEachLineSelected);
registerEditorAction(AddSelectionToNextFindMatchAction);
registerEditorAction(AddSelectionToPreviousFindMatchAction);
registerEditorAction(MoveSelectionToNextFindMatchAction);
registerEditorAction(MoveSelectionToPreviousFindMatchAction);
registerEditorAction(SelectHighlightsAction);
registerEditorAction(CompatChangeAll);
registerEditorAction(InsertCursorAtEndOfLineSelected);
registerEditorAction(InsertCursorAtTopOfLineSelected);
registerEditorAction(FocusNextCursor);
registerEditorAction(FocusPreviousCursor);
export {
  AddSelectionToNextFindMatchAction,
  AddSelectionToPreviousFindMatchAction,
  CompatChangeAll,
  FocusNextCursor,
  FocusPreviousCursor,
  InsertCursorAbove,
  InsertCursorBelow,
  MoveSelectionToNextFindMatchAction,
  MoveSelectionToPreviousFindMatchAction,
  MultiCursorSelectionController,
  MultiCursorSelectionControllerAction,
  MultiCursorSession,
  MultiCursorSessionResult,
  SelectHighlightsAction,
  SelectionHighlighter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL211bHRpY3Vyc29yL2Jyb3dzZXIvbXVsdGljdXJzb3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEN1cnNvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDaGFuZ2VSZWFzb24sIElDdXJzb3JTZWxlY3Rpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IEN1cnNvck1vdmVDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3IvY3Vyc29yTW92ZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaCwgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21tb25GaW5kQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL2ZpbmQvYnJvd3Nlci9maW5kQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBGaW5kT3B0aW9uT3ZlcnJpZGUsIElOZXdGaW5kUmVwbGFjZVN0YXRlIH0gZnJvbSAnLi4vLi4vZmluZC9icm93c2VyL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IGdldFNlbGVjdGlvbkhpZ2hsaWdodERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vd29yZEhpZ2hsaWdodGVyL2Jyb3dzZXIvaGlnaGxpZ2h0RGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmZ1bmN0aW9uIGFubm91bmNlQ3Vyc29yQ2hhbmdlKHByZXZpb3VzQ3Vyc29yU3RhdGU6IEN1cnNvclN0YXRlW10sIGN1cnNvclN0YXRlOiBDdXJzb3JTdGF0ZVtdKTogdm9pZCB7XG5cdGNvbnN0IGN1cnNvckRpZmYgPSBjdXJzb3JTdGF0ZS5maWx0ZXIoY3MgPT4gIXByZXZpb3VzQ3Vyc29yU3RhdGUuZmluZChwY3MgPT4gcGNzLmVxdWFscyhjcykpKTtcblx0aWYgKGN1cnNvckRpZmYubGVuZ3RoID49IDEpIHtcblx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbnMgPSBjdXJzb3JEaWZmLm1hcChjcyA9PiBgbGluZSAke2NzLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyfSBjb2x1bW4gJHtjcy52aWV3U3RhdGUucG9zaXRpb24uY29sdW1ufWApLmpvaW4oJywgJyk7XG5cdFx0Y29uc3QgbXNnID0gY3Vyc29yRGlmZi5sZW5ndGggPT09IDEgPyBubHMubG9jYWxpemUoJ2N1cnNvckFkZGVkJywgXCJDdXJzb3IgYWRkZWQ6IHswfVwiLCBjdXJzb3JQb3NpdGlvbnMpIDogbmxzLmxvY2FsaXplKCdjdXJzb3JzQWRkZWQnLCBcIkN1cnNvcnMgYWRkZWQ6IHswfVwiLCBjdXJzb3JQb3NpdGlvbnMpO1xuXHRcdHN0YXR1cyhtc2cpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJbnNlcnRDdXJzb3JBcmdzIHtcblx0c291cmNlPzogc3RyaW5nO1xuXHRsb2dpY2FsTGluZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBJbnNlcnRDdXJzb3JBYm92ZSBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmluc2VydEN1cnNvckFib3ZlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtdXRsaWN1cnNvci5pbnNlcnRBYm92ZScsIFwiQWRkIEN1cnNvciBBYm92ZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvd11cblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyU2VsZWN0aW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX211bHRpJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pSW5zZXJ0Q3Vyc29yQWJvdmUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZBZGQgQ3Vyc29yIEFib3ZlXCIpLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogSW5zZXJ0Q3Vyc29yQXJncyk6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgdXNlTG9naWNhbExpbmUgPSB0cnVlO1xuXHRcdGlmIChhcmdzICYmIGFyZ3MubG9naWNhbExpbmUgPT09IGZhbHNlKSB7XG5cdFx0XHR1c2VMb2dpY2FsTGluZSA9IGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXG5cdFx0aWYgKHZpZXdNb2RlbC5jdXJzb3JDb25maWcucmVhZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2aWV3TW9kZWwubW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdGNvbnN0IHByZXZpb3VzQ3Vyc29yU3RhdGUgPSB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCk7XG5cdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhcblx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0Q3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0LFxuXHRcdFx0Q3Vyc29yTW92ZUNvbW1hbmRzLmFkZEN1cnNvclVwKHZpZXdNb2RlbCwgcHJldmlvdXNDdXJzb3JTdGF0ZSwgdXNlTG9naWNhbExpbmUpXG5cdFx0KTtcblx0XHR2aWV3TW9kZWwucmV2ZWFsVG9wTW9zdEN1cnNvcihhcmdzLnNvdXJjZSk7XG5cdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5zZXJ0Q3Vyc29yQmVsb3cgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5pbnNlcnRDdXJzb3JCZWxvdycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbXV0bGljdXJzb3IuaW5zZXJ0QmVsb3cnLCBcIkFkZCBDdXJzb3IgQmVsb3dcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3ddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19tdWx0aScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUluc2VydEN1cnNvckJlbG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkEmJmRkIEN1cnNvciBCZWxvd1wiKSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IEluc2VydEN1cnNvckFyZ3MpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHVzZUxvZ2ljYWxMaW5lID0gdHJ1ZTtcblx0XHRpZiAoYXJncyAmJiBhcmdzLmxvZ2ljYWxMaW5lID09PSBmYWxzZSkge1xuXHRcdFx0dXNlTG9naWNhbExpbmUgPSBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblxuXHRcdGlmICh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLnJlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRjb25zdCBwcmV2aW91c0N1cnNvclN0YXRlID0gdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpO1xuXHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRhcmdzLnNvdXJjZSxcblx0XHRcdEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCxcblx0XHRcdEN1cnNvck1vdmVDb21tYW5kcy5hZGRDdXJzb3JEb3duKHZpZXdNb2RlbCwgcHJldmlvdXNDdXJzb3JTdGF0ZSwgdXNlTG9naWNhbExpbmUpXG5cdFx0KTtcblx0XHR2aWV3TW9kZWwucmV2ZWFsQm90dG9tTW9zdEN1cnNvcihhcmdzLnNvdXJjZSk7XG5cdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0fVxufVxuXG5jbGFzcyBJbnNlcnRDdXJzb3JBdEVuZE9mRWFjaExpbmVTZWxlY3RlZCBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmluc2VydEN1cnNvckF0RW5kT2ZFYWNoTGluZVNlbGVjdGVkJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtdXRsaWN1cnNvci5pbnNlcnRBdEVuZE9mRWFjaExpbmVTZWxlY3RlZCcsIFwiQWRkIEN1cnNvcnMgdG8gTGluZSBFbmRzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19tdWx0aScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUluc2VydEN1cnNvckF0RW5kT2ZFYWNoTGluZVNlbGVjdGVkJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkFkZCBDJiZ1cnNvcnMgdG8gTGluZSBFbmRzXCIpLFxuXHRcdFx0XHRvcmRlcjogNFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXJzb3JzRm9yU2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgcmVzdWx0OiBTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7IGkgPCBzZWxlY3Rpb24uZW5kTGluZU51bWJlcjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50TGluZU1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oaSk7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgU2VsZWN0aW9uKGksIGN1cnJlbnRMaW5lTWF4Q29sdW1uLCBpLCBjdXJyZW50TGluZU1heENvbHVtbikpO1xuXHRcdH1cblx0XHRpZiAoc2VsZWN0aW9uLmVuZENvbHVtbiA+IDEpIHtcblx0XHRcdHJlc3VsdC5wdXNoKG5ldyBTZWxlY3Rpb24oc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRDb2x1bW4sIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uZW5kQ29sdW1uKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3QgcHJldmlvdXNDdXJzb3JTdGF0ZSA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdHNlbGVjdGlvbnMuZm9yRWFjaCgoc2VsKSA9PiB0aGlzLmdldEN1cnNvcnNGb3JTZWxlY3Rpb24oc2VsLCBtb2RlbCwgbmV3U2VsZWN0aW9ucykpO1xuXG5cdFx0aWYgKG5ld1NlbGVjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMobmV3U2VsZWN0aW9ucyk7XG5cdFx0fVxuXHRcdGFubm91bmNlQ3Vyc29yQ2hhbmdlKHByZXZpb3VzQ3Vyc29yU3RhdGUsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSk7XG5cdH1cbn1cblxuY2xhc3MgSW5zZXJ0Q3Vyc29yQXRFbmRPZkxpbmVTZWxlY3RlZCBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmFkZEN1cnNvcnNUb0JvdHRvbScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbXV0bGljdXJzb3IuYWRkQ3Vyc29yc1RvQm90dG9tJywgXCJBZGQgQ3Vyc29ycyB0byBCb3R0b21cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBlZGl0b3IuZ2V0TW9kZWwoKS5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGNvbnN0IG5ld1NlbGVjdGlvbnM6IFNlbGVjdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IHNlbGVjdGlvbnNbMF0uc3RhcnRMaW5lTnVtYmVyOyBpIDw9IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRuZXdTZWxlY3Rpb25zLnB1c2gobmV3IFNlbGVjdGlvbihpLCBzZWxlY3Rpb25zWzBdLnN0YXJ0Q29sdW1uLCBpLCBzZWxlY3Rpb25zWzBdLmVuZENvbHVtbikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3QgcHJldmlvdXNDdXJzb3JTdGF0ZSA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHRpZiAobmV3U2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhuZXdTZWxlY3Rpb25zKTtcblx0XHR9XG5cdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0fVxufVxuXG5jbGFzcyBJbnNlcnRDdXJzb3JBdFRvcE9mTGluZVNlbGVjdGVkIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uYWRkQ3Vyc29yc1RvVG9wJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtdXRsaWN1cnNvci5hZGRDdXJzb3JzVG9Ub3AnLCBcIkFkZCBDdXJzb3JzIHRvIFRvcFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXG5cdFx0Y29uc3QgbmV3U2VsZWN0aW9uczogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gc2VsZWN0aW9uc1swXS5zdGFydExpbmVOdW1iZXI7IGkgPj0gMTsgaS0tKSB7XG5cdFx0XHRuZXdTZWxlY3Rpb25zLnB1c2gobmV3IFNlbGVjdGlvbihpLCBzZWxlY3Rpb25zWzBdLnN0YXJ0Q29sdW1uLCBpLCBzZWxlY3Rpb25zWzBdLmVuZENvbHVtbikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3QgcHJldmlvdXNDdXJzb3JTdGF0ZSA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHRpZiAobmV3U2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhuZXdTZWxlY3Rpb25zKTtcblx0XHR9XG5cdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlDdXJzb3JTZXNzaW9uUmVzdWx0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLFxuXHRcdHB1YmxpYyByZWFkb25seSByZXZlYWxSYW5nZTogUmFuZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJldmVhbFNjcm9sbFR5cGU6IFNjcm9sbFR5cGVcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE11bHRpQ3Vyc29yU2Vzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoZWRpdG9yOiBJQ29kZUVkaXRvciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogTXVsdGlDdXJzb3JTZXNzaW9uIHwgbnVsbCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cblx0XHQvLyBGaW5kIHdpZGdldCBvd25zIGVudGlyZWx5IHdoYXQgd2Ugc2VhcmNoIGZvciBpZjpcblx0XHQvLyAgLSBmb2N1cyBpcyBub3QgaW4gdGhlIGVkaXRvciAoaS5lLiBpdCBpcyBpbiB0aGUgZmluZCB3aWRnZXQpXG5cdFx0Ly8gIC0gYW5kIHRoZSBzZWFyY2ggd2lkZ2V0IGlzIHZpc2libGVcblx0XHQvLyAgLSBhbmQgdGhlIHNlYXJjaCBzdHJpbmcgaXMgbm9uLWVtcHR5XG5cdFx0aWYgKCFlZGl0b3IuaGFzVGV4dEZvY3VzKCkgJiYgZmluZFN0YXRlLmlzUmV2ZWFsZWQgJiYgZmluZFN0YXRlLnNlYXJjaFN0cmluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBGaW5kIHdpZGdldCBvd25zIHdoYXQgaXMgc2VhcmNoZWQgZm9yXG5cdFx0XHRyZXR1cm4gbmV3IE11bHRpQ3Vyc29yU2Vzc2lvbihlZGl0b3IsIGZpbmRDb250cm9sbGVyLCBmYWxzZSwgZmluZFN0YXRlLnNlYXJjaFN0cmluZywgZmluZFN0YXRlLndob2xlV29yZCwgZmluZFN0YXRlLm1hdGNoQ2FzZSwgbnVsbCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlLCB0aGUgc2VsZWN0aW9uIGdpdmVzIHRoZSBzZWFyY2ggdGV4dCwgYW5kIHRoZSBmaW5kIHdpZGdldCBnaXZlcyB0aGUgc2VhcmNoIHNldHRpbmdzXG5cdFx0Ly8gVGhlIGV4Y2VwdGlvbiBpcyB0aGUgZmluZCBzdGF0ZSBkaXNhc3NvY2lhdGlvbiBjYXNlOiB3aGVuIGJlZ2lubmluZyB3aXRoIGEgc2luZ2xlLCBjb2xsYXBzZWQgc2VsZWN0aW9uXG5cdFx0bGV0IGlzRGlzY29ubmVjdGVkRnJvbUZpbmRDb250cm9sbGVyID0gZmFsc2U7XG5cdFx0bGV0IHdob2xlV29yZDogYm9vbGVhbjtcblx0XHRsZXQgbWF0Y2hDYXNlOiBib29sZWFuO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBzZWxlY3Rpb25zWzBdLmlzRW1wdHkoKSkge1xuXHRcdFx0aXNEaXNjb25uZWN0ZWRGcm9tRmluZENvbnRyb2xsZXIgPSB0cnVlO1xuXHRcdFx0d2hvbGVXb3JkID0gdHJ1ZTtcblx0XHRcdG1hdGNoQ2FzZSA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdob2xlV29yZCA9IGZpbmRTdGF0ZS53aG9sZVdvcmQ7XG5cdFx0XHRtYXRjaENhc2UgPSBmaW5kU3RhdGUubWF0Y2hDYXNlO1xuXHRcdH1cblxuXHRcdC8vIFNlbGVjdGlvbiBvd25zIHdoYXQgaXMgc2VhcmNoZWQgZm9yXG5cdFx0Y29uc3QgcyA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdGxldCBzZWFyY2hUZXh0OiBzdHJpbmc7XG5cdFx0bGV0IGN1cnJlbnRNYXRjaDogU2VsZWN0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAocy5pc0VtcHR5KCkpIHtcblx0XHRcdC8vIHNlbGVjdGlvbiBpcyBlbXB0eSA9PiBleHBhbmQgdG8gY3VycmVudCB3b3JkXG5cdFx0XHRjb25zdCB3b3JkID0gZWRpdG9yLmdldENvbmZpZ3VyZWRXb3JkQXRQb3NpdGlvbihzLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRpZiAoIXdvcmQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRzZWFyY2hUZXh0ID0gd29yZC53b3JkO1xuXHRcdFx0Y3VycmVudE1hdGNoID0gbmV3IFNlbGVjdGlvbihzLnN0YXJ0TGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgcy5zdGFydExpbmVOdW1iZXIsIHdvcmQuZW5kQ29sdW1uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VhcmNoVGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpLmdldFZhbHVlSW5SYW5nZShzKS5yZXBsYWNlKC9cXHJcXG4vZywgJ1xcbicpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTXVsdGlDdXJzb3JTZXNzaW9uKGVkaXRvciwgZmluZENvbnRyb2xsZXIsIGlzRGlzY29ubmVjdGVkRnJvbUZpbmRDb250cm9sbGVyLCBzZWFyY2hUZXh0LCB3aG9sZVdvcmQsIG1hdGNoQ2FzZSwgY3VycmVudE1hdGNoKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHVibGljIHJlYWRvbmx5IGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaXNEaXNjb25uZWN0ZWRGcm9tRmluZENvbnRyb2xsZXI6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlYXJjaFRleHQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgd2hvbGVXb3JkOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBtYXRjaENhc2U6IGJvb2xlYW4sXG5cdFx0cHVibGljIGN1cnJlbnRNYXRjaDogU2VsZWN0aW9uIHwgbnVsbFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBhZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2goKTogTXVsdGlDdXJzb3JTZXNzaW9uUmVzdWx0IHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dE1hdGNoID0gdGhpcy5fZ2V0TmV4dE1hdGNoKCk7XG5cdFx0aWYgKCFuZXh0TWF0Y2gpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbFNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdHJldHVybiBuZXcgTXVsdGlDdXJzb3JTZXNzaW9uUmVzdWx0KGFsbFNlbGVjdGlvbnMuY29uY2F0KG5leHRNYXRjaCksIG5leHRNYXRjaCwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHR9XG5cblx0cHVibGljIG1vdmVTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2goKTogTXVsdGlDdXJzb3JTZXNzaW9uUmVzdWx0IHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dE1hdGNoID0gdGhpcy5fZ2V0TmV4dE1hdGNoKCk7XG5cdFx0aWYgKCFuZXh0TWF0Y2gpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbFNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdHJldHVybiBuZXcgTXVsdGlDdXJzb3JTZXNzaW9uUmVzdWx0KGFsbFNlbGVjdGlvbnMuc2xpY2UoMCwgYWxsU2VsZWN0aW9ucy5sZW5ndGggLSAxKS5jb25jYXQobmV4dE1hdGNoKSwgbmV4dE1hdGNoLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXROZXh0TWF0Y2goKTogU2VsZWN0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY3VycmVudE1hdGNoKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmN1cnJlbnRNYXRjaDtcblx0XHRcdHRoaXMuY3VycmVudE1hdGNoID0gbnVsbDtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5maW5kQ29udHJvbGxlci5oaWdobGlnaHRGaW5kT3B0aW9ucygpO1xuXG5cdFx0Y29uc3QgYWxsU2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3QgbGFzdEFkZGVkU2VsZWN0aW9uID0gYWxsU2VsZWN0aW9uc1thbGxTZWxlY3Rpb25zLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IG5leHRNYXRjaCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmZpbmROZXh0TWF0Y2godGhpcy5zZWFyY2hUZXh0LCBsYXN0QWRkZWRTZWxlY3Rpb24uZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UsIHRoaXMubWF0Y2hDYXNlLCB0aGlzLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwsIGZhbHNlKTtcblxuXHRcdGlmICghbmV4dE1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24obmV4dE1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgbmV4dE1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCBuZXh0TWF0Y2gucmFuZ2UuZW5kTGluZU51bWJlciwgbmV4dE1hdGNoLnJhbmdlLmVuZENvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgYWRkU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCgpOiBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c01hdGNoID0gdGhpcy5fZ2V0UHJldmlvdXNNYXRjaCgpO1xuXHRcdGlmICghcHJldmlvdXNNYXRjaCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsU2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0cmV0dXJuIG5ldyBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQoYWxsU2VsZWN0aW9ucy5jb25jYXQocHJldmlvdXNNYXRjaCksIHByZXZpb3VzTWF0Y2gsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0fVxuXG5cdHB1YmxpYyBtb3ZlU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCgpOiBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c01hdGNoID0gdGhpcy5fZ2V0UHJldmlvdXNNYXRjaCgpO1xuXHRcdGlmICghcHJldmlvdXNNYXRjaCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsU2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0cmV0dXJuIG5ldyBNdWx0aUN1cnNvclNlc3Npb25SZXN1bHQoYWxsU2VsZWN0aW9ucy5zbGljZSgwLCBhbGxTZWxlY3Rpb25zLmxlbmd0aCAtIDEpLmNvbmNhdChwcmV2aW91c01hdGNoKSwgcHJldmlvdXNNYXRjaCwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UHJldmlvdXNNYXRjaCgpOiBTZWxlY3Rpb24gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jdXJyZW50TWF0Y2gpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY3VycmVudE1hdGNoO1xuXHRcdFx0dGhpcy5jdXJyZW50TWF0Y2ggPSBudWxsO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHR0aGlzLmZpbmRDb250cm9sbGVyLmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cblx0XHRjb25zdCBhbGxTZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRjb25zdCBsYXN0QWRkZWRTZWxlY3Rpb24gPSBhbGxTZWxlY3Rpb25zW2FsbFNlbGVjdGlvbnMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgcHJldmlvdXNNYXRjaCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmZpbmRQcmV2aW91c01hdGNoKHRoaXMuc2VhcmNoVGV4dCwgbGFzdEFkZGVkU2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSwgZmFsc2UsIHRoaXMubWF0Y2hDYXNlLCB0aGlzLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwsIGZhbHNlKTtcblxuXHRcdGlmICghcHJldmlvdXNNYXRjaCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKHByZXZpb3VzTWF0Y2gucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBwcmV2aW91c01hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCBwcmV2aW91c01hdGNoLnJhbmdlLmVuZExpbmVOdW1iZXIsIHByZXZpb3VzTWF0Y2gucmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBzZWxlY3RBbGwoc2VhcmNoU2NvcGU6IFJhbmdlW10gfCBudWxsKTogRmluZE1hdGNoW10ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0aGlzLmZpbmRDb250cm9sbGVyLmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cblx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChzZWFyY2hTY29wZSkge1xuXHRcdFx0cmV0dXJuIGVkaXRvck1vZGVsLmZpbmRNYXRjaGVzKHRoaXMuc2VhcmNoVGV4dCwgc2VhcmNoU2NvcGUsIGZhbHNlLCB0aGlzLm1hdGNoQ2FzZSwgdGhpcy53aG9sZVdvcmQgPyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBmYWxzZSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXHRcdH1cblx0XHRyZXR1cm4gZWRpdG9yTW9kZWwuZmluZE1hdGNoZXModGhpcy5zZWFyY2hUZXh0LCB0cnVlLCBmYWxzZSwgdGhpcy5tYXRjaENhc2UsIHRoaXMud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgZmFsc2UsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIubXVsdGlDdXJzb3JDb250cm9sbGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIF9pZ25vcmVTZWxlY3Rpb25DaGFuZ2U6IGJvb2xlYW47XG5cdHByaXZhdGUgX3Nlc3Npb246IE11bHRpQ3Vyc29yU2Vzc2lvbiB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248TXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyPihNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX2lnbm9yZVNlbGVjdGlvbkNoYW5nZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3Nlc3Npb24gPSBudWxsO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5kU2Vzc2lvbigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2JlZ2luU2Vzc2lvbklmTmVlZGVkKGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0Ly8gQ3JlYXRlIGEgbmV3IHNlc3Npb25cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBNdWx0aUN1cnNvclNlc3Npb24uY3JlYXRlKHRoaXMuX2VkaXRvciwgZmluZENvbnRyb2xsZXIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2Vzc2lvbiA9IHNlc3Npb247XG5cblx0XHRcdGNvbnN0IG5ld1N0YXRlOiBJTmV3RmluZFJlcGxhY2VTdGF0ZSA9IHsgc2VhcmNoU3RyaW5nOiB0aGlzLl9zZXNzaW9uLnNlYXJjaFRleHQgfTtcblx0XHRcdGlmICh0aGlzLl9zZXNzaW9uLmlzRGlzY29ubmVjdGVkRnJvbUZpbmRDb250cm9sbGVyKSB7XG5cdFx0XHRcdG5ld1N0YXRlLndob2xlV29yZE92ZXJyaWRlID0gRmluZE9wdGlvbk92ZXJyaWRlLlRydWU7XG5cdFx0XHRcdG5ld1N0YXRlLm1hdGNoQ2FzZU92ZXJyaWRlID0gRmluZE9wdGlvbk92ZXJyaWRlLlRydWU7XG5cdFx0XHRcdG5ld1N0YXRlLmlzUmVnZXhPdmVycmlkZSA9IEZpbmRPcHRpb25PdmVycmlkZS5GYWxzZTtcblx0XHRcdH1cblx0XHRcdGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCkuY2hhbmdlKG5ld1N0YXRlLCBmYWxzZSk7XG5cblx0XHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2lnbm9yZVNlbGVjdGlvbkNoYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9lbmRTZXNzaW9uKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQmx1ckVkaXRvclRleHQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lbmRTZXNzaW9uKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zZS5hZGQoZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoKGUpID0+IHtcblx0XHRcdFx0aWYgKGUubWF0Y2hDYXNlIHx8IGUud2hvbGVXb3JkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZW5kU2Vzc2lvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5kU2Vzc2lvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zZS5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uICYmIHRoaXMuX3Nlc3Npb24uaXNEaXNjb25uZWN0ZWRGcm9tRmluZENvbnRyb2xsZXIpIHtcblx0XHRcdGNvbnN0IG5ld1N0YXRlOiBJTmV3RmluZFJlcGxhY2VTdGF0ZSA9IHtcblx0XHRcdFx0d2hvbGVXb3JkT3ZlcnJpZGU6IEZpbmRPcHRpb25PdmVycmlkZS5Ob3RTZXQsXG5cdFx0XHRcdG1hdGNoQ2FzZU92ZXJyaWRlOiBGaW5kT3B0aW9uT3ZlcnJpZGUuTm90U2V0LFxuXHRcdFx0XHRpc1JlZ2V4T3ZlcnJpZGU6IEZpbmRPcHRpb25PdmVycmlkZS5Ob3RTZXQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fc2Vzc2lvbi5maW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLmNoYW5nZShuZXdTdGF0ZSwgZmFsc2UpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uID0gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX3NldFNlbGVjdGlvbnMoc2VsZWN0aW9uczogU2VsZWN0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLl9pZ25vcmVTZWxlY3Rpb25DaGFuZ2UgPSB0cnVlO1xuXHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHRcdHRoaXMuX2lnbm9yZVNlbGVjdGlvbkNoYW5nZSA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhwYW5kRW1wdHlUb1dvcmQobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uKTogU2VsZWN0aW9uIHtcblx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmQgPSB0aGlzLl9lZGl0b3IuZ2V0Q29uZmlndXJlZFdvcmRBdFBvc2l0aW9uKHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdGlmICghd29yZCkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24oc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlTZXNzaW9uUmVzdWx0KHJlc3VsdDogTXVsdGlDdXJzb3JTZXNzaW9uUmVzdWx0IHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NldFNlbGVjdGlvbnMocmVzdWx0LnNlbGVjdGlvbnMpO1xuXHRcdGlmIChyZXN1bHQucmV2ZWFsUmFuZ2UpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocmVzdWx0LnJldmVhbFJhbmdlLCByZXN1bHQucmV2ZWFsU2Nyb2xsVHlwZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFNlc3Npb24oZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogTXVsdGlDdXJzb3JTZXNzaW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb247XG5cdH1cblxuXHRwdWJsaWMgYWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoKGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgY3Vyc29ycywgaGFuZGxlIHRoZSBjYXNlIHdoZXJlIHRoZXkgZG8gbm90IGFsbCBzZWxlY3QgdGhlIHNhbWUgdGV4dC5cblx0XHRcdGNvbnN0IGFsbFNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0aWYgKGFsbFNlbGVjdGlvbnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBmaW5kU3RhdGUgPSBmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpO1xuXHRcdFx0XHRjb25zdCBtYXRjaENhc2UgPSBmaW5kU3RhdGUubWF0Y2hDYXNlO1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zQ29udGFpblNhbWVUZXh0ID0gbW9kZWxSYW5nZXNDb250YWluU2FtZVRleHQodGhpcy5fZWRpdG9yLmdldE1vZGVsKCksIGFsbFNlbGVjdGlvbnMsIG1hdGNoQ2FzZSk7XG5cdFx0XHRcdGlmICghc2VsZWN0aW9uc0NvbnRhaW5TYW1lVGV4dCkge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0aW5nU2VsZWN0aW9uczogU2VsZWN0aW9uW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYWxsU2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdFx0cmVzdWx0aW5nU2VsZWN0aW9uc1tpXSA9IHRoaXMuX2V4cGFuZEVtcHR5VG9Xb3JkKG1vZGVsLCBhbGxTZWxlY3Rpb25zW2ldKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLnNldFNlbGVjdGlvbnMocmVzdWx0aW5nU2VsZWN0aW9ucyk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2JlZ2luU2Vzc2lvbklmTmVlZGVkKGZpbmRDb250cm9sbGVyKTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fYXBwbHlTZXNzaW9uUmVzdWx0KHRoaXMuX3Nlc3Npb24uYWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoKCkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhZGRTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoKGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdHRoaXMuX2JlZ2luU2Vzc2lvbklmTmVlZGVkKGZpbmRDb250cm9sbGVyKTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fYXBwbHlTZXNzaW9uUmVzdWx0KHRoaXMuX3Nlc3Npb24uYWRkU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCgpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbW92ZVNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaChmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9iZWdpblNlc3Npb25JZk5lZWRlZChmaW5kQ29udHJvbGxlcik7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb24pIHtcblx0XHRcdHRoaXMuX2FwcGx5U2Vzc2lvblJlc3VsdCh0aGlzLl9zZXNzaW9uLm1vdmVTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2goKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG1vdmVTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoKGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdHRoaXMuX2JlZ2luU2Vzc2lvbklmTmVlZGVkKGZpbmRDb250cm9sbGVyKTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fYXBwbHlTZXNzaW9uUmVzdWx0KHRoaXMuX3Nlc3Npb24ubW92ZVNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2goKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNlbGVjdEFsbChmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG1hdGNoZXM6IEZpbmRNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cblx0XHRjb25zdCBmaW5kU3RhdGUgPSBmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpO1xuXG5cdFx0Ly8gU3BlY2lhbCBjYXNlOiBmaW5kIHdpZGdldCBvd25zIGVudGlyZWx5IHdoYXQgd2Ugc2VhcmNoIGZvciBpZjpcblx0XHQvLyAtIGZvY3VzIGlzIG5vdCBpbiB0aGUgZWRpdG9yIChpLmUuIGl0IGlzIGluIHRoZSBmaW5kIHdpZGdldClcblx0XHQvLyAtIGFuZCB0aGUgc2VhcmNoIHdpZGdldCBpcyB2aXNpYmxlXG5cdFx0Ly8gLSBhbmQgdGhlIHNlYXJjaCBzdHJpbmcgaXMgbm9uLWVtcHR5XG5cdFx0Ly8gLSBhbmQgd2UncmUgc2VhcmNoaW5nIGZvciBhIHJlZ2V4XG5cdFx0aWYgKGZpbmRTdGF0ZS5pc1JldmVhbGVkICYmIGZpbmRTdGF0ZS5zZWFyY2hTdHJpbmcubGVuZ3RoID4gMCAmJiBmaW5kU3RhdGUuaXNSZWdleCkge1xuXHRcdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChmaW5kU3RhdGUuc2VhcmNoU2NvcGUpIHtcblx0XHRcdFx0bWF0Y2hlcyA9IGVkaXRvck1vZGVsLmZpbmRNYXRjaGVzKGZpbmRTdGF0ZS5zZWFyY2hTdHJpbmcsIGZpbmRTdGF0ZS5zZWFyY2hTY29wZSwgZmluZFN0YXRlLmlzUmVnZXgsIGZpbmRTdGF0ZS5tYXRjaENhc2UsIGZpbmRTdGF0ZS53aG9sZVdvcmQgPyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBmYWxzZSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWF0Y2hlcyA9IGVkaXRvck1vZGVsLmZpbmRNYXRjaGVzKGZpbmRTdGF0ZS5zZWFyY2hTdHJpbmcsIHRydWUsIGZpbmRTdGF0ZS5pc1JlZ2V4LCBmaW5kU3RhdGUubWF0Y2hDYXNlLCBmaW5kU3RhdGUud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgZmFsc2UsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXG5cdFx0XHR0aGlzLl9iZWdpblNlc3Npb25JZk5lZWRlZChmaW5kQ29udHJvbGxlcik7XG5cdFx0XHRpZiAoIXRoaXMuX3Nlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXRjaGVzID0gdGhpcy5fc2Vzc2lvbi5zZWxlY3RBbGwoZmluZFN0YXRlLnNlYXJjaFNjb3BlKTtcblx0XHR9XG5cblx0XHRpZiAobWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JTZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHQvLyBIYXZlIHRoZSBwcmltYXJ5IGN1cnNvciByZW1haW4gdGhlIG9uZSB3aGVyZSB0aGUgYWN0aW9uIHdhcyBpbnZva2VkXG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbWF0Y2hlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBtYXRjaCA9IG1hdGNoZXNbaV07XG5cdFx0XHRcdGNvbnN0IGludGVyc2VjdGlvbiA9IG1hdGNoLnJhbmdlLmludGVyc2VjdFJhbmdlcyhlZGl0b3JTZWxlY3Rpb24pO1xuXHRcdFx0XHRpZiAoaW50ZXJzZWN0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gYmluZ28hXG5cdFx0XHRcdFx0bWF0Y2hlc1tpXSA9IG1hdGNoZXNbMF07XG5cdFx0XHRcdFx0bWF0Y2hlc1swXSA9IG1hdGNoO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3NldFNlbGVjdGlvbnMobWF0Y2hlcy5tYXAobSA9PiBuZXcgU2VsZWN0aW9uKG0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBtLnJhbmdlLnN0YXJ0Q29sdW1uLCBtLnJhbmdlLmVuZExpbmVOdW1iZXIsIG0ucmFuZ2UuZW5kQ29sdW1uKSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZWxlY3RBbGxVc2luZ1NlbGVjdGlvbnMoc2VsZWN0aW9uczogU2VsZWN0aW9uW10pOiB2b2lkIHtcblx0XHRpZiAoc2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgbXVsdGlDdXJzb3JDb250cm9sbGVyID0gTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghbXVsdGlDdXJzb3JDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0aWYgKHZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNDdXJzb3JTdGF0ZSA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0XHRpZiAoZmluZENvbnRyb2xsZXIpIHtcblx0XHRcdFx0dGhpcy5fcnVuKG11bHRpQ3Vyc29yQ29udHJvbGxlciwgZmluZENvbnRyb2xsZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbmV3RmluZENvbnRyb2xsZXIgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5jcmVhdGVJbnN0YW5jZShDb21tb25GaW5kQ29udHJvbGxlciwgZWRpdG9yKTtcblx0XHRcdFx0dGhpcy5fcnVuKG11bHRpQ3Vyc29yQ29udHJvbGxlciwgbmV3RmluZENvbnRyb2xsZXIpO1xuXHRcdFx0XHRuZXdGaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGFubm91bmNlQ3Vyc29yQ2hhbmdlKHByZXZpb3VzQ3Vyc29yU3RhdGUsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9ydW4obXVsdGlDdXJzb3JDb250cm9sbGVyOiBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIsIGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24gZXh0ZW5kcyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXJBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uYWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2gnLCBcIkFkZCBTZWxlY3Rpb24gdG8gTmV4dCBGaW5kIE1hdGNoXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19tdWx0aScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJBZGQgJiZOZXh0IE9jY3VycmVuY2VcIiksXG5cdFx0XHRcdG9yZGVyOiA1XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0cHJvdGVjdGVkIF9ydW4obXVsdGlDdXJzb3JDb250cm9sbGVyOiBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIsIGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdG11bHRpQ3Vyc29yQ29udHJvbGxlci5hZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2goZmluZENvbnRyb2xsZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZGRTZWxlY3Rpb25Ub1ByZXZpb3VzRmluZE1hdGNoQWN0aW9uIGV4dGVuZHMgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmFkZFNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2gnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FkZFNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2gnLCBcIkFkZCBTZWxlY3Rpb24gdG8gUHJldmlvdXMgRmluZCBNYXRjaFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19tdWx0aScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUFkZFNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2gnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQWRkIFAmJnJldmlvdXMgT2NjdXJyZW5jZVwiKSxcblx0XHRcdFx0b3JkZXI6IDZcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRwcm90ZWN0ZWQgX3J1bihtdWx0aUN1cnNvckNvbnRyb2xsZXI6IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0bXVsdGlDdXJzb3JDb250cm9sbGVyLmFkZFNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2goZmluZENvbnRyb2xsZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uIGV4dGVuZHMgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLm1vdmVTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2gnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ21vdmVTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2gnLCBcIk1vdmUgTGFzdCBTZWxlY3Rpb24gdG8gTmV4dCBGaW5kIE1hdGNoXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlEKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRwcm90ZWN0ZWQgX3J1bihtdWx0aUN1cnNvckNvbnRyb2xsZXI6IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0bXVsdGlDdXJzb3JDb250cm9sbGVyLm1vdmVTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2goZmluZENvbnRyb2xsZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaEFjdGlvbiBleHRlbmRzIE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5tb3ZlU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbW92ZVNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2gnLCBcIk1vdmUgTGFzdCBTZWxlY3Rpb24gdG8gUHJldmlvdXMgRmluZCBNYXRjaFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblx0cHJvdGVjdGVkIF9ydW4obXVsdGlDdXJzb3JDb250cm9sbGVyOiBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIsIGZpbmRDb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdG11bHRpQ3Vyc29yQ29udHJvbGxlci5tb3ZlU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaChmaW5kQ29udHJvbGxlcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbGVjdEhpZ2hsaWdodHNBY3Rpb24gZXh0ZW5kcyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXJBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uc2VsZWN0SGlnaGxpZ2h0cycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc2VsZWN0QWxsT2NjdXJyZW5jZXNPZkZpbmRNYXRjaCcsIFwiU2VsZWN0IEFsbCBPY2N1cnJlbmNlcyBvZiBGaW5kIE1hdGNoXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUwsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudU9wdHM6IHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTWVudWJhclNlbGVjdGlvbk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19tdWx0aScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVNlbGVjdEhpZ2hsaWdodHMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU2VsZWN0IEFsbCAmJk9jY3VycmVuY2VzXCIpLFxuXHRcdFx0XHRvcmRlcjogN1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHByb3RlY3RlZCBfcnVuKG11bHRpQ3Vyc29yQ29udHJvbGxlcjogTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLCBmaW5kQ29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHRtdWx0aUN1cnNvckNvbnRyb2xsZXIuc2VsZWN0QWxsKGZpbmRDb250cm9sbGVyKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29tcGF0Q2hhbmdlQWxsIGV4dGVuZHMgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmNoYW5nZUFsbCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignY2hhbmdlQWxsLmxhYmVsJywgXCJDaGFuZ2UgQWxsIE9jY3VycmVuY2VzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsIEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyksXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5GMixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRjb250ZXh0TWVudU9wdHM6IHtcblx0XHRcdFx0Z3JvdXA6ICcxX21vZGlmaWNhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLjJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRwcm90ZWN0ZWQgX3J1bihtdWx0aUN1cnNvckNvbnRyb2xsZXI6IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0bXVsdGlDdXJzb3JDb250cm9sbGVyLnNlbGVjdEFsbChmaW5kQ29udHJvbGxlcik7XG5cdH1cbn1cblxuY2xhc3MgU2VsZWN0aW9uSGlnaGxpZ2h0ZXJTdGF0ZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsVmVyc2lvbklkOiBudW1iZXI7XG5cdHByaXZhdGUgX2NhY2hlZEZpbmRNYXRjaGVzOiBSYW5nZVtdIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VhcmNoVGV4dDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21hdGNoQ2FzZTogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93b3JkU2VwYXJhdG9yczogc3RyaW5nIHwgbnVsbCxcblx0XHRwcmV2U3RhdGU6IFNlbGVjdGlvbkhpZ2hsaWdodGVyU3RhdGUgfCBudWxsXG5cdCkge1xuXHRcdHRoaXMuX21vZGVsVmVyc2lvbklkID0gdGhpcy5fbW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0aWYgKHByZXZTdGF0ZVxuXHRcdFx0JiYgdGhpcy5fbW9kZWwgPT09IHByZXZTdGF0ZS5fbW9kZWxcblx0XHRcdCYmIHRoaXMuX3NlYXJjaFRleHQgPT09IHByZXZTdGF0ZS5fc2VhcmNoVGV4dFxuXHRcdFx0JiYgdGhpcy5fbWF0Y2hDYXNlID09PSBwcmV2U3RhdGUuX21hdGNoQ2FzZVxuXHRcdFx0JiYgdGhpcy5fd29yZFNlcGFyYXRvcnMgPT09IHByZXZTdGF0ZS5fd29yZFNlcGFyYXRvcnNcblx0XHRcdCYmIHRoaXMuX21vZGVsVmVyc2lvbklkID09PSBwcmV2U3RhdGUuX21vZGVsVmVyc2lvbklkXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRGaW5kTWF0Y2hlcyA9IHByZXZTdGF0ZS5fY2FjaGVkRmluZE1hdGNoZXM7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZpbmRNYXRjaGVzKCk6IFJhbmdlW10ge1xuXHRcdGlmICh0aGlzLl9jYWNoZWRGaW5kTWF0Y2hlcyA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fY2FjaGVkRmluZE1hdGNoZXMgPSB0aGlzLl9tb2RlbC5maW5kTWF0Y2hlcyh0aGlzLl9zZWFyY2hUZXh0LCB0cnVlLCBmYWxzZSwgdGhpcy5fbWF0Y2hDYXNlLCB0aGlzLl93b3JkU2VwYXJhdG9ycywgZmFsc2UpLm1hcChtID0+IG0ucmFuZ2UpO1xuXHRcdFx0dGhpcy5fY2FjaGVkRmluZE1hdGNoZXMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkRmluZE1hdGNoZXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbGVjdGlvbkhpZ2hsaWdodGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLnNlbGVjdGlvbkhpZ2hsaWdodGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgX2lzRW5hYmxlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaXNFbmFibGVkTXVsdGlsaW5lOiBib29sZWFuO1xuXHRwcml2YXRlIF9tYXhMZW5ndGg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlU29vbjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBzdGF0ZTogU2VsZWN0aW9uSGlnaGxpZ2h0ZXJTdGF0ZSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLl9pc0VuYWJsZWQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zZWxlY3Rpb25IaWdobGlnaHQpO1xuXHRcdHRoaXMuX2lzRW5hYmxlZE11bHRpbGluZSA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNlbGVjdGlvbkhpZ2hsaWdodE11bHRpbGluZSk7XG5cdFx0dGhpcy5fbWF4TGVuZ3RoID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc2VsZWN0aW9uSGlnaGxpZ2h0TWF4TGVuZ3RoKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IGVkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLnVwZGF0ZVNvb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl91cGRhdGUoKSwgMzAwKSk7XG5cdFx0dGhpcy5zdGF0ZSA9IG51bGw7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0VuYWJsZWQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zZWxlY3Rpb25IaWdobGlnaHQpO1xuXHRcdFx0dGhpcy5faXNFbmFibGVkTXVsdGlsaW5lID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc2VsZWN0aW9uSGlnaGxpZ2h0TXVsdGlsaW5lKTtcblx0XHRcdHRoaXMuX21heExlbmd0aCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNlbGVjdGlvbkhpZ2hsaWdodE1heExlbmd0aCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZTogSUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXG5cdFx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCkge1xuXHRcdFx0XHQvLyBFYXJseSBleGl0IGlmIG5vdGhpbmcgbmVlZHMgdG8gYmUgZG9uZSFcblx0XHRcdFx0Ly8gTGVhdmUgc29tZSBmb3JtIG9mIGVhcmx5IGV4aXQgY2hlY2sgaGVyZSBpZiB5b3Ugd2lzaCB0byBjb250aW51ZSBiZWluZyBhIGN1cnNvciBwb3NpdGlvbiBjaGFuZ2UgbGlzdGVuZXIgOylcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGlmIChlLnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc3RhdGUpIHtcblx0XHRcdFx0XHRcdC8vIG5vIGxvbmdlciB2YWxpZFxuXHRcdFx0XHRcdFx0dGhpcy5fc2V0U3RhdGUobnVsbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMudXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3NldFN0YXRlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKGUpID0+IHtcblx0XHRcdHRoaXMuX3NldFN0YXRlKG51bGwpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0VuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTb29uLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKGZpbmRDb250cm9sbGVyKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZSgoZSkgPT4ge1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVTb29uLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0U3RhdGUoU2VsZWN0aW9uSGlnaGxpZ2h0ZXIuX2NyZWF0ZVN0YXRlKHRoaXMuc3RhdGUsIHRoaXMuX2lzRW5hYmxlZCwgdGhpcy5faXNFbmFibGVkTXVsdGlsaW5lLCB0aGlzLl9tYXhMZW5ndGgsIHRoaXMuZWRpdG9yKSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlU3RhdGUob2xkU3RhdGU6IFNlbGVjdGlvbkhpZ2hsaWdodGVyU3RhdGUgfCBudWxsLCBpc0VuYWJsZWQ6IGJvb2xlYW4sIGlzRW5hYmxlZE11bHRpbGluZTogYm9vbGVhbiwgbWF4TGVuZ3RoOiBudW1iZXIsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBTZWxlY3Rpb25IaWdobGlnaHRlclN0YXRlIHwgbnVsbCB7XG5cdFx0aWYgKCFpc0VuYWJsZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKCFpc0VuYWJsZWRNdWx0aWxpbmUpIHtcblx0XHRcdGNvbnN0IHMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAocy5zdGFydExpbmVOdW1iZXIgIT09IHMuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBtdWx0aWxpbmUgZm9yYmlkZGVuIGZvciBwZXJmIHJlYXNvbnNcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG11bHRpQ3Vyc29yQ29udHJvbGxlciA9IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIW11bHRpQ3Vyc29yQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFmaW5kQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGxldCByID0gbXVsdGlDdXJzb3JDb250cm9sbGVyLmdldFNlc3Npb24oZmluZENvbnRyb2xsZXIpO1xuXHRcdGlmICghcikge1xuXHRcdFx0Y29uc3QgYWxsU2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0XHRpZiAoYWxsU2VsZWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cdFx0XHRcdGNvbnN0IG1hdGNoQ2FzZSA9IGZpbmRTdGF0ZS5tYXRjaENhc2U7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnNDb250YWluU2FtZVRleHQgPSBtb2RlbFJhbmdlc0NvbnRhaW5TYW1lVGV4dChlZGl0b3IuZ2V0TW9kZWwoKSwgYWxsU2VsZWN0aW9ucywgbWF0Y2hDYXNlKTtcblx0XHRcdFx0aWYgKCFzZWxlY3Rpb25zQ29udGFpblNhbWVUZXh0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ciA9IE11bHRpQ3Vyc29yU2Vzc2lvbi5jcmVhdGUoZWRpdG9yLCBmaW5kQ29udHJvbGxlcik7XG5cdFx0fVxuXHRcdGlmICghcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHIuY3VycmVudE1hdGNoKSB7XG5cdFx0XHQvLyBUaGlzIGlzIGFuIGVtcHR5IHNlbGVjdGlvblxuXHRcdFx0Ly8gRG8gbm90IGludGVyZmVyZSB3aXRoIHNlbWFudGljIHdvcmQgaGlnaGxpZ2h0aW5nIGluIHRoZSBubyBzZWxlY3Rpb24gY2FzZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICgvXlsgXFx0XSskLy50ZXN0KHIuc2VhcmNoVGV4dCkpIHtcblx0XHRcdC8vIHdoaXRlc3BhY2Ugb25seSBzZWxlY3Rpb25cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAobWF4TGVuZ3RoID4gMCAmJiByLnNlYXJjaFRleHQubGVuZ3RoID4gbWF4TGVuZ3RoKSB7XG5cdFx0XHQvLyB2ZXJ5IGxvbmcgc2VsZWN0aW9uXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBUT0RPOiBiZXR0ZXIgaGFuZGxpbmcgb2YgdGhpcyBjYXNlXG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKTtcblx0XHRjb25zdCBjYXNlU2Vuc2l0aXZlID0gZmluZFN0YXRlLm1hdGNoQ2FzZTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGUgZmluZCB3aWRnZXQgc2hvd3MgdGhlIGV4YWN0IHNhbWUgbWF0Y2hlc1xuXHRcdGlmIChmaW5kU3RhdGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0bGV0IGZpbmRTdGF0ZVNlYXJjaFN0cmluZyA9IGZpbmRTdGF0ZS5zZWFyY2hTdHJpbmc7XG5cdFx0XHRpZiAoIWNhc2VTZW5zaXRpdmUpIHtcblx0XHRcdFx0ZmluZFN0YXRlU2VhcmNoU3RyaW5nID0gZmluZFN0YXRlU2VhcmNoU3RyaW5nLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBteVNlYXJjaFN0cmluZyA9IHIuc2VhcmNoVGV4dDtcblx0XHRcdGlmICghY2FzZVNlbnNpdGl2ZSkge1xuXHRcdFx0XHRteVNlYXJjaFN0cmluZyA9IG15U2VhcmNoU3RyaW5nLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaW5kU3RhdGVTZWFyY2hTdHJpbmcgPT09IG15U2VhcmNoU3RyaW5nICYmIHIubWF0Y2hDYXNlID09PSBmaW5kU3RhdGUubWF0Y2hDYXNlICYmIHIud2hvbGVXb3JkID09PSBmaW5kU3RhdGUud2hvbGVXb3JkICYmICFmaW5kU3RhdGUuaXNSZWdleCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbkhpZ2hsaWdodGVyU3RhdGUoZWRpdG9yLmdldE1vZGVsKCksIHIuc2VhcmNoVGV4dCwgci5tYXRjaENhc2UsIHIud2hvbGVXb3JkID8gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgb2xkU3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U3RhdGUobmV3U3RhdGU6IFNlbGVjdGlvbkhpZ2hsaWdodGVyU3RhdGUgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0ZSA9IG5ld1N0YXRlO1xuXG5cdFx0aWYgKCF0aGlzLnN0YXRlKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwuaXNUb29MYXJnZUZvclRva2VuaXphdGlvbigpKSB7XG5cdFx0XHQvLyB0aGUgZmlsZSBpcyB0b28gbGFyZ2UsIHNvIHNlYXJjaGluZyB3b3JkIHVuZGVyIGN1cnNvciBpbiB0aGUgd2hvbGUgZG9jdW1lbnQgd291bGQgYmUgYmxvY2tpbmcgdGhlIFVJLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbE1hdGNoZXMgPSB0aGlzLnN0YXRlLmZpbmRNYXRjaGVzKCk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdHNlbGVjdGlvbnMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0Ly8gZG8gbm90IG92ZXJsYXAgd2l0aCBzZWxlY3Rpb24gKGlzc3VlICM2NCBhbmQgIzUxMilcblx0XHRjb25zdCBtYXRjaGVzOiBSYW5nZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGogPSAwLCBsZW4gPSBhbGxNYXRjaGVzLmxlbmd0aCwgbGVuSiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOykge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBhbGxNYXRjaGVzW2ldO1xuXG5cdFx0XHRpZiAoaiA+PSBsZW5KKSB7XG5cdFx0XHRcdC8vIGZpbmlzaGVkIGFsbCBlZGl0b3Igc2VsZWN0aW9uc1xuXHRcdFx0XHRtYXRjaGVzLnB1c2gobWF0Y2gpO1xuXHRcdFx0XHRpKys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjbXAgPSBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMobWF0Y2gsIHNlbGVjdGlvbnNbal0pO1xuXHRcdFx0XHRpZiAoY21wIDwgMCkge1xuXHRcdFx0XHRcdC8vIG1hdGNoIGlzIGJlZm9yZSBzZWxcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uc1tqXS5pc0VtcHR5KCkgfHwgIVJhbmdlLmFyZUludGVyc2VjdGluZyhtYXRjaCwgc2VsZWN0aW9uc1tqXSkpIHtcblx0XHRcdFx0XHRcdG1hdGNoZXMucHVzaChtYXRjaCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGkrKztcblx0XHRcdFx0fSBlbHNlIGlmIChjbXAgPiAwKSB7XG5cdFx0XHRcdFx0Ly8gc2VsIGlzIGJlZm9yZSBtYXRjaFxuXHRcdFx0XHRcdGorKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBzZWwgaXMgZXF1YWwgdG8gbWF0Y2hcblx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdFx0aisrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2NjdXJyZW5jZUhpZ2hsaWdodGluZzogYm9vbGVhbiA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ub2NjdXJyZW5jZXNIaWdobGlnaHQpICE9PSAnb2ZmJztcblx0XHRjb25zdCBoYXNTZW1hbnRpY0hpZ2hsaWdodHMgPSB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLmhhcyhtb2RlbCkgJiYgb2NjdXJyZW5jZUhpZ2hsaWdodGluZztcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IG1hdGNoZXMubWFwKHIgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IHIsXG5cdFx0XHRcdG9wdGlvbnM6IGdldFNlbGVjdGlvbkhpZ2hsaWdodERlY29yYXRpb25PcHRpb25zKGhhc1NlbWFudGljSGlnaGxpZ2h0cylcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXQoZGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0U3RhdGUobnVsbCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vZGVsUmFuZ2VzQ29udGFpblNhbWVUZXh0KG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZXM6IFJhbmdlW10sIG1hdGNoQ2FzZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRjb25zdCBzZWxlY3RlZFRleHQgPSBnZXRWYWx1ZUluUmFuZ2UobW9kZWwsIHJhbmdlc1swXSwgIW1hdGNoQ2FzZSk7XG5cdGZvciAobGV0IGkgPSAxLCBsZW4gPSByYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCByYW5nZSA9IHJhbmdlc1tpXTtcblx0XHRpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHRoaXNTZWxlY3RlZFRleHQgPSBnZXRWYWx1ZUluUmFuZ2UobW9kZWwsIHJhbmdlLCAhbWF0Y2hDYXNlKTtcblx0XHRpZiAoc2VsZWN0ZWRUZXh0ICE9PSB0aGlzU2VsZWN0ZWRUZXh0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBnZXRWYWx1ZUluUmFuZ2UobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSwgdG9Mb3dlckNhc2U6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRjb25zdCB0ZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKTtcblx0cmV0dXJuICh0b0xvd2VyQ2FzZSA/IHRleHQudG9Mb3dlckNhc2UoKSA6IHRleHQpO1xufVxuXG5pbnRlcmZhY2UgRm9jdXNDdXJzb3JBcmdzIHtcblx0c291cmNlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRm9jdXNOZXh0Q3Vyc29yIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmZvY3VzTmV4dEN1cnNvcicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbXV0bGljdXJzb3IuZm9jdXNOZXh0Q3Vyc29yJywgXCJGb2N1cyBOZXh0IEN1cnNvclwiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ211dGxpY3Vyc29yLmZvY3VzTmV4dEN1cnNvci5kZXNjcmlwdGlvbicsIFwiRm9jdXNlcyB0aGUgbmV4dCBjdXJzb3JcIiksXG5cdFx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBGb2N1c0N1cnNvckFyZ3MpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblxuXHRcdGlmICh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLnJlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRjb25zdCBwcmV2aW91c0N1cnNvclN0YXRlID0gQXJyYXkuZnJvbSh2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpO1xuXHRcdGNvbnN0IGZpcnN0Q3Vyc29yID0gcHJldmlvdXNDdXJzb3JTdGF0ZS5zaGlmdCgpO1xuXHRcdGlmICghZmlyc3RDdXJzb3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cHJldmlvdXNDdXJzb3JTdGF0ZS5wdXNoKGZpcnN0Q3Vyc29yKTtcblxuXHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoYXJncy5zb3VyY2UsIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCwgcHJldmlvdXNDdXJzb3JTdGF0ZSk7XG5cdFx0dmlld01vZGVsLnJldmVhbFByaW1hcnlDdXJzb3IoYXJncy5zb3VyY2UsIHRydWUpO1xuXHRcdGFubm91bmNlQ3Vyc29yQ2hhbmdlKHByZXZpb3VzQ3Vyc29yU3RhdGUsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvY3VzUHJldmlvdXNDdXJzb3IgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZm9jdXNQcmV2aW91c0N1cnNvcicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbXV0bGljdXJzb3IuZm9jdXNQcmV2aW91c0N1cnNvcicsIFwiRm9jdXMgUHJldmlvdXMgQ3Vyc29yXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbXV0bGljdXJzb3IuZm9jdXNQcmV2aW91c0N1cnNvci5kZXNjcmlwdGlvbicsIFwiRm9jdXNlcyB0aGUgcHJldmlvdXMgY3Vyc29yXCIpLFxuXHRcdFx0XHRhcmdzOiBbXSxcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogRm9jdXNDdXJzb3JBcmdzKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cblx0XHRpZiAodmlld01vZGVsLmN1cnNvckNvbmZpZy5yZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZpZXdNb2RlbC5tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0Y29uc3QgcHJldmlvdXNDdXJzb3JTdGF0ZSA9IEFycmF5LmZyb20odmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0XHRjb25zdCBmaXJzdEN1cnNvciA9IHByZXZpb3VzQ3Vyc29yU3RhdGUucG9wKCk7XG5cdFx0aWYgKCFmaXJzdEN1cnNvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRwcmV2aW91c0N1cnNvclN0YXRlLnVuc2hpZnQoZmlyc3RDdXJzb3IpO1xuXG5cdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhhcmdzLnNvdXJjZSwgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0LCBwcmV2aW91c0N1cnNvclN0YXRlKTtcblx0XHR2aWV3TW9kZWwucmV2ZWFsUHJpbWFyeUN1cnNvcihhcmdzLnNvdXJjZSwgdHJ1ZSk7XG5cdFx0YW5ub3VuY2VDdXJzb3JDaGFuZ2UocHJldmlvdXNDdXJzb3JTdGF0ZSwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpKTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIuSUQsIE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5MYXp5KTtcbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKFNlbGVjdGlvbkhpZ2hsaWdodGVyLklELCBTZWxlY3Rpb25IaWdobGlnaHRlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5BZnRlckZpcnN0UmVuZGVyKTtcblxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5zZXJ0Q3Vyc29yQWJvdmUpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5zZXJ0Q3Vyc29yQmVsb3cpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5zZXJ0Q3Vyc29yQXRFbmRPZkVhY2hMaW5lU2VsZWN0ZWQpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEFkZFNlbGVjdGlvblRvUHJldmlvdXNGaW5kTWF0Y2hBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oTW92ZVNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihNb3ZlU2VsZWN0aW9uVG9QcmV2aW91c0ZpbmRNYXRjaEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihTZWxlY3RIaWdobGlnaHRzQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKENvbXBhdENoYW5nZUFsbCk7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbnNlcnRDdXJzb3JBdEVuZE9mTGluZVNlbGVjdGVkKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluc2VydEN1cnNvckF0VG9wT2ZMaW5lU2VsZWN0ZWQpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRm9jdXNOZXh0Q3Vyc29yKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEZvY3VzUHJldmlvdXNDdXJzb3IpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsY0FBYyxpQ0FBaUMsc0JBQXNCLGtDQUFvRDtBQUNsSSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDBCQUF3RDtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBNEQsa0JBQWtCO0FBQzlFLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsNEJBQTRC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
