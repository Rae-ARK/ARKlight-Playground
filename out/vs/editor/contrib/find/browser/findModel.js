import { findFirstIdxMonotonousOrArrLen } from "../../../../base/common/arraysFind.js";
import { RunOnceScheduler, TimeoutTimer } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { Constants } from "../../../../base/common/uint.js";
import { ReplaceCommand, ReplaceCommandThatPreservesSelection } from "../../../common/commands/replaceCommand.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EndOfLinePreference } from "../../../common/model.js";
import { SearchParams } from "../../../common/model/textModelSearch.js";
import { FindDecorations } from "./findDecorations.js";
import { ReplaceAllCommand } from "./replaceAllCommand.js";
import { parseReplaceString, ReplacePattern } from "./replacePattern.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
const CONTEXT_FIND_WIDGET_VISIBLE = new RawContextKey("findWidgetVisible", false);
const CONTEXT_FIND_WIDGET_NOT_VISIBLE = CONTEXT_FIND_WIDGET_VISIBLE.toNegated();
const CONTEXT_FIND_INPUT_FOCUSED = new RawContextKey("findInputFocussed", false);
const CONTEXT_REPLACE_INPUT_FOCUSED = new RawContextKey("replaceInputFocussed", false);
const CONTEXT_FIND_WIDGET_FOCUSED = new RawContextKey("findWidgetFocused", false);
const ToggleCaseSensitiveKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyC,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC }
};
const ToggleWholeWordKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyW,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW }
};
const ToggleRegexKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyR,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR }
};
const ToggleSearchScopeKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyL,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL }
};
const TogglePreserveCaseKeybinding = {
  primary: KeyMod.Alt | KeyCode.KeyP,
  mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP }
};
const FIND_IDS = {
  StartFindAction: "actions.find",
  StartFindWithSelection: "actions.findWithSelection",
  StartFindWithArgs: "editor.actions.findWithArgs",
  NextMatchFindAction: "editor.action.nextMatchFindAction",
  PreviousMatchFindAction: "editor.action.previousMatchFindAction",
  GoToMatchFindAction: "editor.action.goToMatchFindAction",
  NextSelectionMatchFindAction: "editor.action.nextSelectionMatchFindAction",
  PreviousSelectionMatchFindAction: "editor.action.previousSelectionMatchFindAction",
  StartFindReplaceAction: "editor.action.startFindReplaceAction",
  CloseFindWidgetCommand: "closeFindWidget",
  ToggleCaseSensitiveCommand: "toggleFindCaseSensitive",
  ToggleWholeWordCommand: "toggleFindWholeWord",
  ToggleRegexCommand: "toggleFindRegex",
  ToggleSearchScopeCommand: "toggleFindInSelection",
  TogglePreserveCaseCommand: "togglePreserveCase",
  ReplaceOneAction: "editor.action.replaceOne",
  ReplaceAllAction: "editor.action.replaceAll",
  SelectAllMatchesAction: "editor.action.selectAllMatches"
};
const MATCHES_LIMIT = 19999;
const RESEARCH_DELAY = 240;
class FindModelBoundToEditorModel {
  constructor(editor, state) {
    this._toDispose = new DisposableStore();
    this._editor = editor;
    this._state = state;
    this._isDisposed = false;
    this._startSearchingTimer = new TimeoutTimer();
    this._decorations = new FindDecorations(editor);
    this._toDispose.add(this._decorations);
    this._updateDecorationsScheduler = new RunOnceScheduler(() => {
      if (!this._editor.hasModel()) {
        return;
      }
      return this.research(false);
    }, 100);
    this._toDispose.add(this._updateDecorationsScheduler);
    this._toDispose.add(this._editor.onDidChangeCursorPosition((e) => {
      if (e.reason === CursorChangeReason.Explicit || e.reason === CursorChangeReason.Undo || e.reason === CursorChangeReason.Redo) {
        this._decorations.setStartPosition(this._editor.getPosition());
      }
    }));
    this._ignoreModelContentChanged = false;
    this._toDispose.add(this._editor.onDidChangeModelContent((e) => {
      if (this._ignoreModelContentChanged) {
        return;
      }
      if (e.isFlush) {
        this._decorations.reset();
      }
      this._decorations.setStartPosition(this._editor.getPosition());
      this._updateDecorationsScheduler.schedule();
    }));
    this._toDispose.add(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this.research(false, this._state.searchScope);
  }
  dispose() {
    this._isDisposed = true;
    dispose(this._startSearchingTimer);
    this._toDispose.dispose();
  }
  _onStateChanged(e) {
    if (this._isDisposed) {
      return;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    if (e.searchString || e.isReplaceRevealed || e.isRegex || e.wholeWord || e.matchCase || e.searchScope) {
      const model = this._editor.getModel();
      if (model.isTooLargeForSyncing()) {
        this._startSearchingTimer.cancel();
        this._startSearchingTimer.setIfNotSet(() => {
          if (e.searchScope) {
            this.research(e.moveCursor, this._state.searchScope);
          } else {
            this.research(e.moveCursor);
          }
        }, RESEARCH_DELAY);
      } else {
        if (e.searchScope) {
          this.research(e.moveCursor, this._state.searchScope);
        } else {
          this.research(e.moveCursor);
        }
      }
    }
  }
  static _getSearchRange(model, findScope) {
    if (findScope) {
      return findScope;
    }
    return model.getFullModelRange();
  }
  research(moveCursor, newFindScope) {
    let findScopes = null;
    if (typeof newFindScope !== "undefined") {
      if (newFindScope !== null) {
        if (!Array.isArray(newFindScope)) {
          findScopes = [newFindScope];
        } else {
          findScopes = newFindScope;
        }
      }
    } else {
      findScopes = this._decorations.getFindScopes();
    }
    if (findScopes !== null) {
      findScopes = findScopes.map((findScope) => {
        if (findScope.startLineNumber !== findScope.endLineNumber) {
          let endLineNumber = findScope.endLineNumber;
          if (findScope.endColumn === 1) {
            endLineNumber = endLineNumber - 1;
          }
          return new Range(findScope.startLineNumber, 1, endLineNumber, this._editor.getModel().getLineMaxColumn(endLineNumber));
        }
        return findScope;
      });
    }
    const findMatches = this._findMatches(findScopes, false, MATCHES_LIMIT);
    this._decorations.set(findMatches, findScopes);
    const editorSelection = this._editor.getSelection();
    let currentMatchesPosition = this._decorations.getCurrentMatchesPosition(editorSelection);
    if (currentMatchesPosition === 0 && findMatches.length > 0) {
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches.map((match) => match.range), (range) => Range.compareRangesUsingStarts(range, editorSelection) >= 0);
      currentMatchesPosition = matchAfterSelection > 0 ? matchAfterSelection - 1 + 1 : currentMatchesPosition;
    }
    this._state.changeMatchInfo(
      currentMatchesPosition,
      this._decorations.getCount(),
      void 0
    );
    if (moveCursor && this._editor.getOption(EditorOption.find).cursorMoveOnType) {
      this._moveToNextMatch(this._decorations.getStartPosition());
    }
  }
  _hasMatches() {
    return this._state.matchesCount > 0;
  }
  _cannotFind() {
    if (!this._hasMatches()) {
      const findScope = this._decorations.getFindScope();
      if (findScope) {
        this._editor.revealRangeInCenterIfOutsideViewport(findScope, ScrollType.Smooth);
      }
      return true;
    }
    return false;
  }
  _setCurrentFindMatch(match) {
    const matchesPosition = this._decorations.setCurrentFindMatch(match);
    this._state.changeMatchInfo(
      matchesPosition,
      this._decorations.getCount(),
      match
    );
    this._editor.setSelection(match);
    this._editor.revealRangeInCenterIfOutsideViewport(match, ScrollType.Smooth);
  }
  _prevSearchPosition(before) {
    const isUsingLineStops = this._state.isRegex && (this._state.searchString.indexOf("^") >= 0 || this._state.searchString.indexOf("$") >= 0);
    let { lineNumber, column } = before;
    const model = this._editor.getModel();
    if (isUsingLineStops || column === 1) {
      if (lineNumber === 1) {
        lineNumber = model.getLineCount();
      } else {
        lineNumber--;
      }
      column = model.getLineMaxColumn(lineNumber);
    } else {
      column--;
    }
    return new Position(lineNumber, column);
  }
  _moveToPrevMatch(before, isRecursed = false) {
    if (!this._state.canNavigateBack()) {
      const nextMatchRange = this._decorations.matchAfterPosition(before);
      if (nextMatchRange) {
        this._setCurrentFindMatch(nextMatchRange);
      }
      return;
    }
    if (this._decorations.getCount() < MATCHES_LIMIT) {
      let prevMatchRange = this._decorations.matchBeforePosition(before);
      if (prevMatchRange && prevMatchRange.isEmpty() && prevMatchRange.getStartPosition().equals(before)) {
        before = this._prevSearchPosition(before);
        prevMatchRange = this._decorations.matchBeforePosition(before);
      }
      if (prevMatchRange) {
        this._setCurrentFindMatch(prevMatchRange);
      }
      return;
    }
    if (this._cannotFind()) {
      return;
    }
    const findScope = this._decorations.getFindScope();
    const searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), findScope);
    if (searchRange.getEndPosition().isBefore(before)) {
      before = searchRange.getEndPosition();
    }
    if (before.isBefore(searchRange.getStartPosition())) {
      before = searchRange.getEndPosition();
    }
    const { lineNumber, column } = before;
    const model = this._editor.getModel();
    let position = new Position(lineNumber, column);
    let prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    if (prevMatch && prevMatch.range.isEmpty() && prevMatch.range.getStartPosition().equals(position)) {
      position = this._prevSearchPosition(position);
      prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);
    }
    if (!prevMatch) {
      return;
    }
    if (!isRecursed && !searchRange.containsRange(prevMatch.range)) {
      return this._moveToPrevMatch(prevMatch.range.getStartPosition(), true);
    }
    this._setCurrentFindMatch(prevMatch.range);
  }
  moveToPrevMatch() {
    this._moveToPrevMatch(this._editor.getSelection().getStartPosition());
  }
  _nextSearchPosition(after) {
    const isUsingLineStops = this._state.isRegex && (this._state.searchString.indexOf("^") >= 0 || this._state.searchString.indexOf("$") >= 0);
    let { lineNumber, column } = after;
    const model = this._editor.getModel();
    if (isUsingLineStops || column === model.getLineMaxColumn(lineNumber)) {
      if (lineNumber === model.getLineCount()) {
        lineNumber = 1;
      } else {
        lineNumber++;
      }
      column = 1;
    } else {
      column++;
    }
    return new Position(lineNumber, column);
  }
  _moveToNextMatch(after) {
    if (!this._state.canNavigateForward()) {
      const prevMatchRange = this._decorations.matchBeforePosition(after);
      if (prevMatchRange) {
        this._setCurrentFindMatch(prevMatchRange);
      }
      return;
    }
    if (this._decorations.getCount() < MATCHES_LIMIT) {
      let nextMatchRange = this._decorations.matchAfterPosition(after);
      if (nextMatchRange && nextMatchRange.isEmpty() && nextMatchRange.getStartPosition().equals(after)) {
        after = this._nextSearchPosition(after);
        nextMatchRange = this._decorations.matchAfterPosition(after);
      }
      if (nextMatchRange) {
        this._setCurrentFindMatch(nextMatchRange);
      }
      return;
    }
    const nextMatch = this._getNextMatch(after, false, true);
    if (nextMatch) {
      this._setCurrentFindMatch(nextMatch.range);
    }
  }
  _getNextMatch(after, captureMatches, forceMove, isRecursed = false) {
    if (this._cannotFind()) {
      return null;
    }
    const findScope = this._decorations.getFindScope();
    const searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), findScope);
    if (searchRange.getEndPosition().isBefore(after)) {
      after = searchRange.getStartPosition();
    }
    if (after.isBefore(searchRange.getStartPosition())) {
      after = searchRange.getStartPosition();
    }
    const { lineNumber, column } = after;
    const model = this._editor.getModel();
    let position = new Position(lineNumber, column);
    let nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, captureMatches);
    if (forceMove && nextMatch && nextMatch.range.isEmpty() && nextMatch.range.getStartPosition().equals(position)) {
      position = this._nextSearchPosition(position);
      nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, captureMatches);
    }
    if (!nextMatch) {
      return null;
    }
    if (!isRecursed && !searchRange.containsRange(nextMatch.range)) {
      return this._getNextMatch(nextMatch.range.getEndPosition(), captureMatches, forceMove, true);
    }
    return nextMatch;
  }
  moveToNextMatch() {
    this._moveToNextMatch(this._editor.getSelection().getEndPosition());
  }
  _moveToMatch(index) {
    const decorationRange = this._decorations.getDecorationRangeAt(index);
    if (decorationRange) {
      this._setCurrentFindMatch(decorationRange);
    }
  }
  moveToMatch(index) {
    this._moveToMatch(index);
  }
  _getReplacePattern() {
    if (this._state.isRegex) {
      return parseReplaceString(this._state.replaceString);
    }
    return ReplacePattern.fromStaticValue(this._state.replaceString);
  }
  replace() {
    if (!this._hasMatches()) {
      return;
    }
    const replacePattern = this._getReplacePattern();
    const selection = this._editor.getSelection();
    const nextMatch = this._getNextMatch(selection.getStartPosition(), true, false);
    if (nextMatch) {
      if (selection.equalsRange(nextMatch.range)) {
        const replaceString = replacePattern.buildReplaceString(nextMatch.matches, this._state.preserveCase);
        const command = new ReplaceCommand(selection, replaceString);
        this._executeEditorCommand("replace", command);
        this._decorations.setStartPosition(new Position(selection.startLineNumber, selection.startColumn + replaceString.length));
        this.research(true);
      } else {
        this._decorations.setStartPosition(this._editor.getPosition());
        this._setCurrentFindMatch(nextMatch.range);
      }
    }
  }
  _findMatches(findScopes, captureMatches, limitResultCount) {
    const searchRanges = (findScopes || [null]).map(
      (scope) => FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), scope)
    );
    return this._editor.getModel().findMatches(this._state.searchString, searchRanges, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, captureMatches, limitResultCount);
  }
  replaceAll() {
    if (!this._hasMatches()) {
      return;
    }
    const findScopes = this._decorations.getFindScopes();
    if (findScopes === null && this._state.matchesCount >= MATCHES_LIMIT) {
      this._largeReplaceAll();
    } else {
      this._regularReplaceAll(findScopes);
    }
    this.research(false);
  }
  _largeReplaceAll() {
    const searchParams = new SearchParams(this._state.searchString, this._state.isRegex, this._state.matchCase, this._state.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null);
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return;
    }
    let searchRegex = searchData.regex;
    if (!searchRegex.multiline) {
      let mod = "mu";
      if (searchRegex.ignoreCase) {
        mod += "i";
      }
      if (searchRegex.global) {
        mod += "g";
      }
      searchRegex = new RegExp(searchRegex.source, mod);
    }
    const model = this._editor.getModel();
    const modelText = model.getValue(EndOfLinePreference.LF);
    const fullModelRange = model.getFullModelRange();
    const replacePattern = this._getReplacePattern();
    let resultText;
    const preserveCase = this._state.preserveCase;
    if (replacePattern.hasReplacementPatterns || preserveCase) {
      resultText = modelText.replace(searchRegex, function() {
        return replacePattern.buildReplaceString(arguments, preserveCase);
      });
    } else {
      resultText = modelText.replace(searchRegex, replacePattern.buildReplaceString(null, preserveCase));
    }
    const command = new ReplaceCommandThatPreservesSelection(fullModelRange, resultText, this._editor.getSelection());
    this._executeEditorCommand("replaceAll", command);
  }
  _regularReplaceAll(findScopes) {
    const replacePattern = this._getReplacePattern();
    const matches = this._findMatches(findScopes, replacePattern.hasReplacementPatterns || this._state.preserveCase, Constants.MAX_SAFE_SMALL_INTEGER);
    const replaceStrings = [];
    for (let i = 0, len = matches.length; i < len; i++) {
      replaceStrings[i] = replacePattern.buildReplaceString(matches[i].matches, this._state.preserveCase);
    }
    const command = new ReplaceAllCommand(this._editor.getSelection(), matches.map((m) => m.range), replaceStrings);
    this._executeEditorCommand("replaceAll", command);
  }
  selectAllMatches() {
    if (!this._hasMatches()) {
      return;
    }
    const findScopes = this._decorations.getFindScopes();
    const matches = this._findMatches(findScopes, false, Constants.MAX_SAFE_SMALL_INTEGER);
    let selections = matches.map((m) => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn));
    const editorSelection = this._editor.getSelection();
    for (let i = 0, len = selections.length; i < len; i++) {
      const sel = selections[i];
      if (sel.equalsRange(editorSelection)) {
        selections = [editorSelection].concat(selections.slice(0, i)).concat(selections.slice(i + 1));
        break;
      }
    }
    this._editor.setSelections(selections);
  }
  _executeEditorCommand(source, command) {
    try {
      this._ignoreModelContentChanged = true;
      this._editor.pushUndoStop();
      this._editor.executeCommand(source, command);
      this._editor.pushUndoStop();
    } finally {
      this._ignoreModelContentChanged = false;
    }
  }
}
export {
  CONTEXT_FIND_INPUT_FOCUSED,
  CONTEXT_FIND_WIDGET_FOCUSED,
  CONTEXT_FIND_WIDGET_NOT_VISIBLE,
  CONTEXT_FIND_WIDGET_VISIBLE,
  CONTEXT_REPLACE_INPUT_FOCUSED,
  FIND_IDS,
  FindModelBoundToEditorModel,
  MATCHES_LIMIT,
  ToggleCaseSensitiveKeybinding,
  TogglePreserveCaseKeybinding,
  ToggleRegexKeybinding,
  ToggleSearchScopeKeybinding,
  ToggleWholeWordKeybinding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFJlcGxhY2VDb21tYW5kLCBSZXBsYWNlQ29tbWFuZFRoYXRQcmVzZXJ2ZXNTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvcmVwbGFjZUNvbW1hbmQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiwgSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlLCBGaW5kTWF0Y2gsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgU2VhcmNoUGFyYW1zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbFNlYXJjaC5qcyc7XG5pbXBvcnQgeyBGaW5kRGVjb3JhdGlvbnMgfSBmcm9tICcuL2ZpbmREZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBGaW5kUmVwbGFjZVN0YXRlLCBGaW5kUmVwbGFjZVN0YXRlQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi9maW5kU3RhdGUuanMnO1xuaW1wb3J0IHsgUmVwbGFjZUFsbENvbW1hbmQgfSBmcm9tICcuL3JlcGxhY2VBbGxDb21tYW5kLmpzJztcbmltcG9ydCB7IHBhcnNlUmVwbGFjZVN0cmluZywgUmVwbGFjZVBhdHRlcm4gfSBmcm9tICcuL3JlcGxhY2VQYXR0ZXJuLmpzJztcbmltcG9ydCB7IFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5ncyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuXG5leHBvcnQgY29uc3QgQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2ZpbmRXaWRnZXRWaXNpYmxlJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfRklORF9XSURHRVRfTk9UX1ZJU0lCTEUgPSBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUudG9OZWdhdGVkKCk7XG4vLyBLZWVwIENvbnRleHRLZXkgdXNlIG9mICdGb2N1c3NlZCcgdG8gbm90IGJyZWFrIHdoZW4gY2xhdXNlc1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfRklORF9JTlBVVF9GT0NVU0VEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2ZpbmRJbnB1dEZvY3Vzc2VkJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfUkVQTEFDRV9JTlBVVF9GT0NVU0VEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3JlcGxhY2VJbnB1dEZvY3Vzc2VkJywgZmFsc2UpO1xuLyoqXG4gKiBDb250ZXh0IGtleSB0aGF0IGlzIHRydWUgd2hlbiBhbnkgZWxlbWVudCB3aXRoaW4gdGhlIEZpbmQgd2lkZ2V0IGhhcyBmb2N1cy5cbiAqIFRoaXMgaW5jbHVkZXMgdGhlIEZpbmQgaW5wdXQsIFJlcGxhY2UgaW5wdXQsIGNoZWNrYm94ZXMsIGJ1dHRvbnMsIGV0Yy5cbiAqL1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfRklORF9XSURHRVRfRk9DVVNFRCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdmaW5kV2lkZ2V0Rm9jdXNlZCcsIGZhbHNlKTtcblxuZXhwb3J0IGNvbnN0IFRvZ2dsZUNhc2VTZW5zaXRpdmVLZXliaW5kaW5nOiBJS2V5YmluZGluZ3MgPSB7XG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUMsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUMgfVxufTtcbmV4cG9ydCBjb25zdCBUb2dnbGVXaG9sZVdvcmRLZXliaW5kaW5nOiBJS2V5YmluZGluZ3MgPSB7XG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVcsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVcgfVxufTtcbmV4cG9ydCBjb25zdCBUb2dnbGVSZWdleEtleWJpbmRpbmc6IElLZXliaW5kaW5ncyA9IHtcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Uixcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5UiB9XG59O1xuZXhwb3J0IGNvbnN0IFRvZ2dsZVNlYXJjaFNjb3BlS2V5YmluZGluZzogSUtleWJpbmRpbmdzID0ge1xuXHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlMLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlMIH1cbn07XG5leHBvcnQgY29uc3QgVG9nZ2xlUHJlc2VydmVDYXNlS2V5YmluZGluZzogSUtleWJpbmRpbmdzID0ge1xuXHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlQLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlQIH1cbn07XG5cbmV4cG9ydCBjb25zdCBGSU5EX0lEUyA9IHtcblx0U3RhcnRGaW5kQWN0aW9uOiAnYWN0aW9ucy5maW5kJyxcblx0U3RhcnRGaW5kV2l0aFNlbGVjdGlvbjogJ2FjdGlvbnMuZmluZFdpdGhTZWxlY3Rpb24nLFxuXHRTdGFydEZpbmRXaXRoQXJnczogJ2VkaXRvci5hY3Rpb25zLmZpbmRXaXRoQXJncycsXG5cdE5leHRNYXRjaEZpbmRBY3Rpb246ICdlZGl0b3IuYWN0aW9uLm5leHRNYXRjaEZpbmRBY3Rpb24nLFxuXHRQcmV2aW91c01hdGNoRmluZEFjdGlvbjogJ2VkaXRvci5hY3Rpb24ucHJldmlvdXNNYXRjaEZpbmRBY3Rpb24nLFxuXHRHb1RvTWF0Y2hGaW5kQWN0aW9uOiAnZWRpdG9yLmFjdGlvbi5nb1RvTWF0Y2hGaW5kQWN0aW9uJyxcblx0TmV4dFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbjogJ2VkaXRvci5hY3Rpb24ubmV4dFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbicsXG5cdFByZXZpb3VzU2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uOiAnZWRpdG9yLmFjdGlvbi5wcmV2aW91c1NlbGVjdGlvbk1hdGNoRmluZEFjdGlvbicsXG5cdFN0YXJ0RmluZFJlcGxhY2VBY3Rpb246ICdlZGl0b3IuYWN0aW9uLnN0YXJ0RmluZFJlcGxhY2VBY3Rpb24nLFxuXHRDbG9zZUZpbmRXaWRnZXRDb21tYW5kOiAnY2xvc2VGaW5kV2lkZ2V0Jyxcblx0VG9nZ2xlQ2FzZVNlbnNpdGl2ZUNvbW1hbmQ6ICd0b2dnbGVGaW5kQ2FzZVNlbnNpdGl2ZScsXG5cdFRvZ2dsZVdob2xlV29yZENvbW1hbmQ6ICd0b2dnbGVGaW5kV2hvbGVXb3JkJyxcblx0VG9nZ2xlUmVnZXhDb21tYW5kOiAndG9nZ2xlRmluZFJlZ2V4Jyxcblx0VG9nZ2xlU2VhcmNoU2NvcGVDb21tYW5kOiAndG9nZ2xlRmluZEluU2VsZWN0aW9uJyxcblx0VG9nZ2xlUHJlc2VydmVDYXNlQ29tbWFuZDogJ3RvZ2dsZVByZXNlcnZlQ2FzZScsXG5cdFJlcGxhY2VPbmVBY3Rpb246ICdlZGl0b3IuYWN0aW9uLnJlcGxhY2VPbmUnLFxuXHRSZXBsYWNlQWxsQWN0aW9uOiAnZWRpdG9yLmFjdGlvbi5yZXBsYWNlQWxsJyxcblx0U2VsZWN0QWxsTWF0Y2hlc0FjdGlvbjogJ2VkaXRvci5hY3Rpb24uc2VsZWN0QWxsTWF0Y2hlcydcbn07XG5cbmV4cG9ydCBjb25zdCBNQVRDSEVTX0xJTUlUID0gMTk5OTk7XG5jb25zdCBSRVNFQVJDSF9ERUxBWSA9IDI0MDtcblxuZXhwb3J0IGNsYXNzIEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU6IEZpbmRSZXBsYWNlU3RhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnM6IEZpbmREZWNvcmF0aW9ucztcblx0cHJpdmF0ZSBfaWdub3JlTW9kZWxDb250ZW50Q2hhbmdlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRTZWFyY2hpbmdUaW1lcjogVGltZW91dFRpbWVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZURlY29yYXRpb25zU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsIHN0YXRlOiBGaW5kUmVwbGFjZVN0YXRlKSB7XG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3N0YXJ0U2VhcmNoaW5nVGltZXIgPSBuZXcgVGltZW91dFRpbWVyKCk7XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IG5ldyBGaW5kRGVjb3JhdGlvbnMoZWRpdG9yKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2RlY29yYXRpb25zKTtcblxuXHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zU2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNlYXJjaChmYWxzZSk7XG5cdFx0fSwgMTAwKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX3VwZGF0ZURlY29yYXRpb25zU2NoZWR1bGVyKTtcblxuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKGU6IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0XG5cdFx0XHRcdHx8IGUucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uVW5kb1xuXHRcdFx0XHR8fCBlLnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLlJlZG9cblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXRTdGFydFBvc2l0aW9uKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9pZ25vcmVNb2RlbENvbnRlbnRDaGFuZ2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pZ25vcmVNb2RlbENvbnRlbnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmlzRmx1c2gpIHtcblx0XHRcdFx0Ly8gYSBtb2RlbC5zZXRWYWx1ZSgpIHdhcyBjYWxsZWRcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMucmVzZXQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RlY29yYXRpb25zLnNldFN0YXJ0UG9zaXRpb24odGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX3N0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZSgoZSkgPT4gdGhpcy5fb25TdGF0ZUNoYW5nZWQoZSkpKTtcblxuXHRcdHRoaXMucmVzZWFyY2goZmFsc2UsIHRoaXMuX3N0YXRlLnNlYXJjaFNjb3BlKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdGRpc3Bvc2UodGhpcy5fc3RhcnRTZWFyY2hpbmdUaW1lcik7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uU3RhdGVDaGFuZ2VkKGU6IEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0Ly8gVGhlIGZpbmQgbW9kZWwgaXMgZGlzcG9zZWQgZHVyaW5nIGEgZmluZCBzdGF0ZSBjaGFuZ2VkIGV2ZW50XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdC8vIFRoZSBmaW5kIG1vZGVsIHdpbGwgYmUgZGlzcG9zZWQgbW9tZW50YXJpbHlcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGUuc2VhcmNoU3RyaW5nIHx8IGUuaXNSZXBsYWNlUmV2ZWFsZWQgfHwgZS5pc1JlZ2V4IHx8IGUud2hvbGVXb3JkIHx8IGUubWF0Y2hDYXNlIHx8IGUuc2VhcmNoU2NvcGUpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRcdGlmIChtb2RlbC5pc1Rvb0xhcmdlRm9yU3luY2luZygpKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0U2VhcmNoaW5nVGltZXIuY2FuY2VsKCk7XG5cblx0XHRcdFx0dGhpcy5fc3RhcnRTZWFyY2hpbmdUaW1lci5zZXRJZk5vdFNldCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuc2VhcmNoU2NvcGUpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVzZWFyY2goZS5tb3ZlQ3Vyc29yLCB0aGlzLl9zdGF0ZS5zZWFyY2hTY29wZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMucmVzZWFyY2goZS5tb3ZlQ3Vyc29yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFJFU0VBUkNIX0RFTEFZKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChlLnNlYXJjaFNjb3BlKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXNlYXJjaChlLm1vdmVDdXJzb3IsIHRoaXMuX3N0YXRlLnNlYXJjaFNjb3BlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnJlc2VhcmNoKGUubW92ZUN1cnNvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0U2VhcmNoUmFuZ2UobW9kZWw6IElUZXh0TW9kZWwsIGZpbmRTY29wZTogUmFuZ2UgfCBudWxsKTogUmFuZ2Uge1xuXHRcdC8vIElmIHdlIGhhdmUgc2V0IG5vdyBvciBiZWZvcmUgYSBmaW5kIHNjb3BlLCB1c2UgaXQgZm9yIGNvbXB1dGluZyB0aGUgc2VhcmNoIHJhbmdlXG5cdFx0aWYgKGZpbmRTY29wZSkge1xuXHRcdFx0cmV0dXJuIGZpbmRTY29wZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZWFyY2gobW92ZUN1cnNvcjogYm9vbGVhbiwgbmV3RmluZFNjb3BlPzogUmFuZ2UgfCBSYW5nZVtdIHwgbnVsbCk6IHZvaWQge1xuXHRcdGxldCBmaW5kU2NvcGVzOiBSYW5nZVtdIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKHR5cGVvZiBuZXdGaW5kU2NvcGUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRpZiAobmV3RmluZFNjb3BlICE9PSBudWxsKSB7XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShuZXdGaW5kU2NvcGUpKSB7XG5cdFx0XHRcdFx0ZmluZFNjb3BlcyA9IFtuZXdGaW5kU2NvcGVdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZpbmRTY29wZXMgPSBuZXdGaW5kU2NvcGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZmluZFNjb3BlcyA9IHRoaXMuX2RlY29yYXRpb25zLmdldEZpbmRTY29wZXMoKTtcblx0XHR9XG5cdFx0aWYgKGZpbmRTY29wZXMgIT09IG51bGwpIHtcblx0XHRcdGZpbmRTY29wZXMgPSBmaW5kU2NvcGVzLm1hcChmaW5kU2NvcGUgPT4ge1xuXHRcdFx0XHRpZiAoZmluZFNjb3BlLnN0YXJ0TGluZU51bWJlciAhPT0gZmluZFNjb3BlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRsZXQgZW5kTGluZU51bWJlciA9IGZpbmRTY29wZS5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0XHRcdFx0aWYgKGZpbmRTY29wZS5lbmRDb2x1bW4gPT09IDEpIHtcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBlbmRMaW5lTnVtYmVyIC0gMTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKGZpbmRTY29wZS5zdGFydExpbmVOdW1iZXIsIDEsIGVuZExpbmVOdW1iZXIsIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmaW5kU2NvcGU7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBmaW5kTWF0Y2hlcyA9IHRoaXMuX2ZpbmRNYXRjaGVzKGZpbmRTY29wZXMsIGZhbHNlLCBNQVRDSEVTX0xJTUlUKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXQoZmluZE1hdGNoZXMsIGZpbmRTY29wZXMpO1xuXG5cdFx0Y29uc3QgZWRpdG9yU2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGxldCBjdXJyZW50TWF0Y2hlc1Bvc2l0aW9uID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0Q3VycmVudE1hdGNoZXNQb3NpdGlvbihlZGl0b3JTZWxlY3Rpb24pO1xuXHRcdGlmIChjdXJyZW50TWF0Y2hlc1Bvc2l0aW9uID09PSAwICYmIGZpbmRNYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIGN1cnJlbnQgc2VsZWN0aW9uIGlzIG5vdCBvbiB0b3Agb2YgYSBtYXRjaFxuXHRcdFx0Ly8gdHJ5IHRvIGZpbmQgaXRzIG5lYXJlc3QgcmVzdWx0IGZyb20gdGhlIHRvcCBvZiB0aGUgZG9jdW1lbnRcblx0XHRcdGNvbnN0IG1hdGNoQWZ0ZXJTZWxlY3Rpb24gPSBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oZmluZE1hdGNoZXMubWFwKG1hdGNoID0+IG1hdGNoLnJhbmdlKSwgcmFuZ2UgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKHJhbmdlLCBlZGl0b3JTZWxlY3Rpb24pID49IDApO1xuXHRcdFx0Y3VycmVudE1hdGNoZXNQb3NpdGlvbiA9IG1hdGNoQWZ0ZXJTZWxlY3Rpb24gPiAwID8gbWF0Y2hBZnRlclNlbGVjdGlvbiAtIDEgKyAxIC8qKiBtYXRjaCBwb3NpdGlvbiBpcyBvbmUgYmFzZWQgKi8gOiBjdXJyZW50TWF0Y2hlc1Bvc2l0aW9uO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZU1hdGNoSW5mbyhcblx0XHRcdGN1cnJlbnRNYXRjaGVzUG9zaXRpb24sXG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5nZXRDb3VudCgpLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblxuXHRcdGlmIChtb3ZlQ3Vyc29yICYmIHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmN1cnNvck1vdmVPblR5cGUpIHtcblx0XHRcdHRoaXMuX21vdmVUb05leHRNYXRjaCh0aGlzLl9kZWNvcmF0aW9ucy5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc01hdGNoZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPiAwKTtcblx0fVxuXG5cdHByaXZhdGUgX2Nhbm5vdEZpbmQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9oYXNNYXRjaGVzKCkpIHtcblx0XHRcdGNvbnN0IGZpbmRTY29wZSA9IHRoaXMuX2RlY29yYXRpb25zLmdldEZpbmRTY29wZSgpO1xuXHRcdFx0aWYgKGZpbmRTY29wZSkge1xuXHRcdFx0XHQvLyBSZXZlYWwgdGhlIHNlbGVjdGlvbiBzbyB1c2VyIGlzIHJlbWluZGVkIHRoYXQgJ3NlbGVjdGlvbiBmaW5kJyBpcyBvbi5cblx0XHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChmaW5kU2NvcGUsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDdXJyZW50RmluZE1hdGNoKG1hdGNoOiBSYW5nZSk6IHZvaWQge1xuXHRcdGNvbnN0IG1hdGNoZXNQb3NpdGlvbiA9IHRoaXMuX2RlY29yYXRpb25zLnNldEN1cnJlbnRGaW5kTWF0Y2gobWF0Y2gpO1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZU1hdGNoSW5mbyhcblx0XHRcdG1hdGNoZXNQb3NpdGlvbixcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zLmdldENvdW50KCksXG5cdFx0XHRtYXRjaFxuXHRcdCk7XG5cblx0XHR0aGlzLl9lZGl0b3Iuc2V0U2VsZWN0aW9uKG1hdGNoKTtcblx0XHR0aGlzLl9lZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KG1hdGNoLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2U2VhcmNoUG9zaXRpb24oYmVmb3JlOiBQb3NpdGlvbikge1xuXHRcdGNvbnN0IGlzVXNpbmdMaW5lU3RvcHMgPSB0aGlzLl9zdGF0ZS5pc1JlZ2V4ICYmIChcblx0XHRcdHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZy5pbmRleE9mKCdeJykgPj0gMFxuXHRcdFx0fHwgdGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLmluZGV4T2YoJyQnKSA+PSAwXG5cdFx0KTtcblx0XHRsZXQgeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSA9IGJlZm9yZTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0aWYgKGlzVXNpbmdMaW5lU3RvcHMgfHwgY29sdW1uID09PSAxKSB7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gMSkge1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsaW5lTnVtYmVyLS07XG5cdFx0XHR9XG5cdFx0XHRjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb2x1bW4tLTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIF9tb3ZlVG9QcmV2TWF0Y2goYmVmb3JlOiBQb3NpdGlvbiwgaXNSZWN1cnNlZDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSkge1xuXHRcdFx0Ly8gd2UgYXJlIGJleW9uZCB0aGUgZmlyc3QgbWF0Y2hlZCBmaW5kIHJlc3VsdFxuXHRcdFx0Ly8gaW5zdGVhZCBvZiBkb2luZyBub3RoaW5nLCB3ZSBzaG91bGQgcmVmb2N1cyB0aGUgZmlyc3QgaXRlbVxuXHRcdFx0Y29uc3QgbmV4dE1hdGNoUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9ucy5tYXRjaEFmdGVyUG9zaXRpb24oYmVmb3JlKTtcblxuXHRcdFx0aWYgKG5leHRNYXRjaFJhbmdlKSB7XG5cdFx0XHRcdHRoaXMuX3NldEN1cnJlbnRGaW5kTWF0Y2gobmV4dE1hdGNoUmFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGVjb3JhdGlvbnMuZ2V0Q291bnQoKSA8IE1BVENIRVNfTElNSVQpIHtcblx0XHRcdGxldCBwcmV2TWF0Y2hSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zLm1hdGNoQmVmb3JlUG9zaXRpb24oYmVmb3JlKTtcblxuXHRcdFx0aWYgKHByZXZNYXRjaFJhbmdlICYmIHByZXZNYXRjaFJhbmdlLmlzRW1wdHkoKSAmJiBwcmV2TWF0Y2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkuZXF1YWxzKGJlZm9yZSkpIHtcblx0XHRcdFx0YmVmb3JlID0gdGhpcy5fcHJldlNlYXJjaFBvc2l0aW9uKGJlZm9yZSk7XG5cdFx0XHRcdHByZXZNYXRjaFJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnMubWF0Y2hCZWZvcmVQb3NpdGlvbihiZWZvcmUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldk1hdGNoUmFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fc2V0Q3VycmVudEZpbmRNYXRjaChwcmV2TWF0Y2hSYW5nZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY2Fubm90RmluZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmluZFNjb3BlID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RmluZFNjb3BlKCk7XG5cdFx0Y29uc3Qgc2VhcmNoUmFuZ2UgPSBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwuX2dldFNlYXJjaFJhbmdlKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLCBmaW5kU2NvcGUpO1xuXG5cdFx0Ly8gLi4uKC0tLS0pLi4ufC4uLlxuXHRcdGlmIChzZWFyY2hSYW5nZS5nZXRFbmRQb3NpdGlvbigpLmlzQmVmb3JlKGJlZm9yZSkpIHtcblx0XHRcdGJlZm9yZSA9IHNlYXJjaFJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gLi4ufC4uLigtLS0tKS4uLlxuXHRcdGlmIChiZWZvcmUuaXNCZWZvcmUoc2VhcmNoUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSkge1xuXHRcdFx0YmVmb3JlID0gc2VhcmNoUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9ID0gYmVmb3JlO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRsZXQgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblxuXHRcdGxldCBwcmV2TWF0Y2ggPSBtb2RlbC5maW5kUHJldmlvdXNNYXRjaCh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcsIHBvc2l0aW9uLCB0aGlzLl9zdGF0ZS5pc1JlZ2V4LCB0aGlzLl9zdGF0ZS5tYXRjaENhc2UsIHRoaXMuX3N0YXRlLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwsIGZhbHNlKTtcblxuXHRcdGlmIChwcmV2TWF0Y2ggJiYgcHJldk1hdGNoLnJhbmdlLmlzRW1wdHkoKSAmJiBwcmV2TWF0Y2gucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLmVxdWFscyhwb3NpdGlvbikpIHtcblx0XHRcdC8vIExvb2tzIGxpa2Ugd2UncmUgc3R1Y2sgYXQgdGhpcyBwb3NpdGlvbiwgdW5hY2NlcHRhYmxlIVxuXHRcdFx0cG9zaXRpb24gPSB0aGlzLl9wcmV2U2VhcmNoUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0cHJldk1hdGNoID0gbW9kZWwuZmluZFByZXZpb3VzTWF0Y2godGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLCBwb3NpdGlvbiwgdGhpcy5fc3RhdGUuaXNSZWdleCwgdGhpcy5fc3RhdGUubWF0Y2hDYXNlLCB0aGlzLl9zdGF0ZS53aG9sZVdvcmQgPyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycykgOiBudWxsLCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFwcmV2TWF0Y2gpIHtcblx0XHRcdC8vIHRoZXJlIGlzIHByZWNpc2VseSBvbmUgbWF0Y2ggYW5kIHNlbGVjdGlvbiBpcyBvbiB0b3Agb2YgaXRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWlzUmVjdXJzZWQgJiYgIXNlYXJjaFJhbmdlLmNvbnRhaW5zUmFuZ2UocHJldk1hdGNoLnJhbmdlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vdmVUb1ByZXZNYXRjaChwcmV2TWF0Y2gucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCB0cnVlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRDdXJyZW50RmluZE1hdGNoKHByZXZNYXRjaC5yYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgbW92ZVRvUHJldk1hdGNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vdmVUb1ByZXZNYXRjaCh0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCkuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0fVxuXG5cdHByaXZhdGUgX25leHRTZWFyY2hQb3NpdGlvbihhZnRlcjogUG9zaXRpb24pIHtcblx0XHRjb25zdCBpc1VzaW5nTGluZVN0b3BzID0gdGhpcy5fc3RhdGUuaXNSZWdleCAmJiAoXG5cdFx0XHR0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcuaW5kZXhPZignXicpID49IDBcblx0XHRcdHx8IHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZy5pbmRleE9mKCckJykgPj0gMFxuXHRcdCk7XG5cblx0XHRsZXQgeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSA9IGFmdGVyO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRpZiAoaXNVc2luZ0xpbmVTdG9wcyB8fCBjb2x1bW4gPT09IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpIHtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVOdW1iZXIrKztcblx0XHRcdH1cblx0XHRcdGNvbHVtbiA9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbHVtbisrO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHByaXZhdGUgX21vdmVUb05leHRNYXRjaChhZnRlcjogUG9zaXRpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3N0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpKSB7XG5cdFx0XHQvLyB3ZSBhcmUgYmV5b25kIHRoZSBsYXN0IG1hdGNoZWQgZmluZCByZXN1bHRcblx0XHRcdC8vIGluc3RlYWQgb2YgZG9pbmcgbm90aGluZywgd2Ugc2hvdWxkIHJlZm9jdXMgdGhlIGxhc3QgaXRlbVxuXHRcdFx0Y29uc3QgcHJldk1hdGNoUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9ucy5tYXRjaEJlZm9yZVBvc2l0aW9uKGFmdGVyKTtcblxuXHRcdFx0aWYgKHByZXZNYXRjaFJhbmdlKSB7XG5cdFx0XHRcdHRoaXMuX3NldEN1cnJlbnRGaW5kTWF0Y2gocHJldk1hdGNoUmFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGVjb3JhdGlvbnMuZ2V0Q291bnQoKSA8IE1BVENIRVNfTElNSVQpIHtcblx0XHRcdGxldCBuZXh0TWF0Y2hSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zLm1hdGNoQWZ0ZXJQb3NpdGlvbihhZnRlcik7XG5cblx0XHRcdGlmIChuZXh0TWF0Y2hSYW5nZSAmJiBuZXh0TWF0Y2hSYW5nZS5pc0VtcHR5KCkgJiYgbmV4dE1hdGNoUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLmVxdWFscyhhZnRlcikpIHtcblx0XHRcdFx0Ly8gTG9va3MgbGlrZSB3ZSdyZSBzdHVjayBhdCB0aGlzIHBvc2l0aW9uLCB1bmFjY2VwdGFibGUhXG5cdFx0XHRcdGFmdGVyID0gdGhpcy5fbmV4dFNlYXJjaFBvc2l0aW9uKGFmdGVyKTtcblx0XHRcdFx0bmV4dE1hdGNoUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9ucy5tYXRjaEFmdGVyUG9zaXRpb24oYWZ0ZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHRNYXRjaFJhbmdlKSB7XG5cdFx0XHRcdHRoaXMuX3NldEN1cnJlbnRGaW5kTWF0Y2gobmV4dE1hdGNoUmFuZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dE1hdGNoID0gdGhpcy5fZ2V0TmV4dE1hdGNoKGFmdGVyLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0aWYgKG5leHRNYXRjaCkge1xuXHRcdFx0dGhpcy5fc2V0Q3VycmVudEZpbmRNYXRjaChuZXh0TWF0Y2gucmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldE5leHRNYXRjaChhZnRlcjogUG9zaXRpb24sIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBmb3JjZU1vdmU6IGJvb2xlYW4sIGlzUmVjdXJzZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9jYW5ub3RGaW5kKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmRTY29wZSA9IHRoaXMuX2RlY29yYXRpb25zLmdldEZpbmRTY29wZSgpO1xuXHRcdGNvbnN0IHNlYXJjaFJhbmdlID0gRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsLl9nZXRTZWFyY2hSYW5nZSh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSwgZmluZFNjb3BlKTtcblxuXHRcdC8vIC4uLigtLS0tKS4uLnwuLi5cblx0XHRpZiAoc2VhcmNoUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKS5pc0JlZm9yZShhZnRlcikpIHtcblx0XHRcdGFmdGVyID0gc2VhcmNoUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdH1cblxuXHRcdC8vIC4uLnwuLi4oLS0tLSkuLi5cblx0XHRpZiAoYWZ0ZXIuaXNCZWZvcmUoc2VhcmNoUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSkge1xuXHRcdFx0YWZ0ZXIgPSBzZWFyY2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSA9IGFmdGVyO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRsZXQgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblxuXHRcdGxldCBuZXh0TWF0Y2ggPSBtb2RlbC5maW5kTmV4dE1hdGNoKHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZywgcG9zaXRpb24sIHRoaXMuX3N0YXRlLmlzUmVnZXgsIHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSwgdGhpcy5fc3RhdGUud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgY2FwdHVyZU1hdGNoZXMpO1xuXG5cdFx0aWYgKGZvcmNlTW92ZSAmJiBuZXh0TWF0Y2ggJiYgbmV4dE1hdGNoLnJhbmdlLmlzRW1wdHkoKSAmJiBuZXh0TWF0Y2gucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLmVxdWFscyhwb3NpdGlvbikpIHtcblx0XHRcdC8vIExvb2tzIGxpa2Ugd2UncmUgc3R1Y2sgYXQgdGhpcyBwb3NpdGlvbiwgdW5hY2NlcHRhYmxlIVxuXHRcdFx0cG9zaXRpb24gPSB0aGlzLl9uZXh0U2VhcmNoUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0bmV4dE1hdGNoID0gbW9kZWwuZmluZE5leHRNYXRjaCh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcsIHBvc2l0aW9uLCB0aGlzLl9zdGF0ZS5pc1JlZ2V4LCB0aGlzLl9zdGF0ZS5tYXRjaENhc2UsIHRoaXMuX3N0YXRlLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwsIGNhcHR1cmVNYXRjaGVzKTtcblx0XHR9XG5cblx0XHRpZiAoIW5leHRNYXRjaCkge1xuXHRcdFx0Ly8gdGhlcmUgaXMgcHJlY2lzZWx5IG9uZSBtYXRjaCBhbmQgc2VsZWN0aW9uIGlzIG9uIHRvcCBvZiBpdFxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1JlY3Vyc2VkICYmICFzZWFyY2hSYW5nZS5jb250YWluc1JhbmdlKG5leHRNYXRjaC5yYW5nZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXROZXh0TWF0Y2gobmV4dE1hdGNoLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIGNhcHR1cmVNYXRjaGVzLCBmb3JjZU1vdmUsIHRydWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXh0TWF0Y2g7XG5cdH1cblxuXHRwdWJsaWMgbW92ZVRvTmV4dE1hdGNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vdmVUb05leHRNYXRjaCh0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCkuZ2V0RW5kUG9zaXRpb24oKSk7XG5cdH1cblxuXHRwcml2YXRlIF9tb3ZlVG9NYXRjaChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVjb3JhdGlvblJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RGVjb3JhdGlvblJhbmdlQXQoaW5kZXgpO1xuXHRcdGlmIChkZWNvcmF0aW9uUmFuZ2UpIHtcblx0XHRcdHRoaXMuX3NldEN1cnJlbnRGaW5kTWF0Y2goZGVjb3JhdGlvblJhbmdlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbW92ZVRvTWF0Y2goaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX21vdmVUb01hdGNoKGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlcGxhY2VQYXR0ZXJuKCk6IFJlcGxhY2VQYXR0ZXJuIHtcblx0XHRpZiAodGhpcy5fc3RhdGUuaXNSZWdleCkge1xuXHRcdFx0cmV0dXJuIHBhcnNlUmVwbGFjZVN0cmluZyh0aGlzLl9zdGF0ZS5yZXBsYWNlU3RyaW5nKTtcblx0XHR9XG5cdFx0cmV0dXJuIFJlcGxhY2VQYXR0ZXJuLmZyb21TdGF0aWNWYWx1ZSh0aGlzLl9zdGF0ZS5yZXBsYWNlU3RyaW5nKTtcblx0fVxuXG5cdHB1YmxpYyByZXBsYWNlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGFzTWF0Y2hlcygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwbGFjZVBhdHRlcm4gPSB0aGlzLl9nZXRSZXBsYWNlUGF0dGVybigpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBuZXh0TWF0Y2ggPSB0aGlzLl9nZXROZXh0TWF0Y2goc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdGlmIChuZXh0TWF0Y2gpIHtcblx0XHRcdGlmIChzZWxlY3Rpb24uZXF1YWxzUmFuZ2UobmV4dE1hdGNoLnJhbmdlKSkge1xuXHRcdFx0XHQvLyBzZWxlY3Rpb24gc2l0cyBvbiBhIGZpbmQgbWF0Y2ggPT4gcmVwbGFjZSBpdCFcblx0XHRcdFx0Y29uc3QgcmVwbGFjZVN0cmluZyA9IHJlcGxhY2VQYXR0ZXJuLmJ1aWxkUmVwbGFjZVN0cmluZyhuZXh0TWF0Y2gubWF0Y2hlcywgdGhpcy5fc3RhdGUucHJlc2VydmVDYXNlKTtcblxuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gbmV3IFJlcGxhY2VDb21tYW5kKHNlbGVjdGlvbiwgcmVwbGFjZVN0cmluZyk7XG5cblx0XHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRvckNvbW1hbmQoJ3JlcGxhY2UnLCBjb21tYW5kKTtcblxuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXRTdGFydFBvc2l0aW9uKG5ldyBQb3NpdGlvbihzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4gKyByZXBsYWNlU3RyaW5nLmxlbmd0aCkpO1xuXHRcdFx0XHR0aGlzLnJlc2VhcmNoKHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0U3RhcnRQb3NpdGlvbih0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHRcdHRoaXMuX3NldEN1cnJlbnRGaW5kTWF0Y2gobmV4dE1hdGNoLnJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTWF0Y2hlcyhmaW5kU2NvcGVzOiBSYW5nZVtdIHwgbnVsbCwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IEZpbmRNYXRjaFtdIHtcblx0XHRjb25zdCBzZWFyY2hSYW5nZXMgPSAoZmluZFNjb3BlcyBhcyBbXSB8fCBbbnVsbF0pLm1hcCgoc2NvcGU6IFJhbmdlIHwgbnVsbCkgPT5cblx0XHRcdEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbC5fZ2V0U2VhcmNoUmFuZ2UodGhpcy5fZWRpdG9yLmdldE1vZGVsKCksIHNjb3BlKVxuXHRcdCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkuZmluZE1hdGNoZXModGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLCBzZWFyY2hSYW5nZXMsIHRoaXMuX3N0YXRlLmlzUmVnZXgsIHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSwgdGhpcy5fc3RhdGUud2hvbGVXb3JkID8gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpIDogbnVsbCwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHR9XG5cblx0cHVibGljIHJlcGxhY2VBbGwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNNYXRjaGVzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaW5kU2NvcGVzID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RmluZFNjb3BlcygpO1xuXG5cdFx0aWYgKGZpbmRTY29wZXMgPT09IG51bGwgJiYgdGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50ID49IE1BVENIRVNfTElNSVQpIHtcblx0XHRcdC8vIERvaW5nIGEgcmVwbGFjZSBvbiB0aGUgZW50aXJlIGZpbGUgdGhhdCBpcyBvdmVyICR7TUFUQ0hFU19MSU1JVH0gbWF0Y2hlc1xuXHRcdFx0dGhpcy5fbGFyZ2VSZXBsYWNlQWxsKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ3VsYXJSZXBsYWNlQWxsKGZpbmRTY29wZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVzZWFyY2goZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGFyZ2VSZXBsYWNlQWxsKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXModGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLCB0aGlzLl9zdGF0ZS5pc1JlZ2V4LCB0aGlzLl9zdGF0ZS5tYXRjaENhc2UsIHRoaXMuX3N0YXRlLndob2xlV29yZCA/IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSA6IG51bGwpO1xuXHRcdGNvbnN0IHNlYXJjaERhdGEgPSBzZWFyY2hQYXJhbXMucGFyc2VTZWFyY2hSZXF1ZXN0KCk7XG5cdFx0aWYgKCFzZWFyY2hEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHNlYXJjaFJlZ2V4ID0gc2VhcmNoRGF0YS5yZWdleDtcblx0XHRpZiAoIXNlYXJjaFJlZ2V4Lm11bHRpbGluZSkge1xuXHRcdFx0bGV0IG1vZCA9ICdtdSc7XG5cdFx0XHRpZiAoc2VhcmNoUmVnZXguaWdub3JlQ2FzZSkge1xuXHRcdFx0XHRtb2QgKz0gJ2knO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlYXJjaFJlZ2V4Lmdsb2JhbCkge1xuXHRcdFx0XHRtb2QgKz0gJ2cnO1xuXHRcdFx0fVxuXHRcdFx0c2VhcmNoUmVnZXggPSBuZXcgUmVnRXhwKHNlYXJjaFJlZ2V4LnNvdXJjZSwgbW9kKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsVGV4dCA9IG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpO1xuXHRcdGNvbnN0IGZ1bGxNb2RlbFJhbmdlID0gbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKTtcblxuXHRcdGNvbnN0IHJlcGxhY2VQYXR0ZXJuID0gdGhpcy5fZ2V0UmVwbGFjZVBhdHRlcm4oKTtcblx0XHRsZXQgcmVzdWx0VGV4dDogc3RyaW5nO1xuXHRcdGNvbnN0IHByZXNlcnZlQ2FzZSA9IHRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZTtcblxuXHRcdGlmIChyZXBsYWNlUGF0dGVybi5oYXNSZXBsYWNlbWVudFBhdHRlcm5zIHx8IHByZXNlcnZlQ2FzZSkge1xuXHRcdFx0cmVzdWx0VGV4dCA9IG1vZGVsVGV4dC5yZXBsYWNlKHNlYXJjaFJlZ2V4LCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRyZXR1cm4gcmVwbGFjZVBhdHRlcm4uYnVpbGRSZXBsYWNlU3RyaW5nKDxzdHJpbmdbXT48YW55PmFyZ3VtZW50cywgcHJlc2VydmVDYXNlKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHRUZXh0ID0gbW9kZWxUZXh0LnJlcGxhY2Uoc2VhcmNoUmVnZXgsIHJlcGxhY2VQYXR0ZXJuLmJ1aWxkUmVwbGFjZVN0cmluZyhudWxsLCBwcmVzZXJ2ZUNhc2UpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kID0gbmV3IFJlcGxhY2VDb21tYW5kVGhhdFByZXNlcnZlc1NlbGVjdGlvbihmdWxsTW9kZWxSYW5nZSwgcmVzdWx0VGV4dCwgdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpKTtcblx0XHR0aGlzLl9leGVjdXRlRWRpdG9yQ29tbWFuZCgncmVwbGFjZUFsbCcsIGNvbW1hbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVndWxhclJlcGxhY2VBbGwoZmluZFNjb3BlczogUmFuZ2VbXSB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCByZXBsYWNlUGF0dGVybiA9IHRoaXMuX2dldFJlcGxhY2VQYXR0ZXJuKCk7XG5cdFx0Ly8gR2V0IGFsbCB0aGUgcmFuZ2VzIChldmVuIG1vcmUgdGhhbiB0aGUgaGlnaGxpZ2h0ZWQgb25lcylcblx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5fZmluZE1hdGNoZXMoZmluZFNjb3BlcywgcmVwbGFjZVBhdHRlcm4uaGFzUmVwbGFjZW1lbnRQYXR0ZXJucyB8fCB0aGlzLl9zdGF0ZS5wcmVzZXJ2ZUNhc2UsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKTtcblxuXHRcdGNvbnN0IHJlcGxhY2VTdHJpbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBtYXRjaGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRyZXBsYWNlU3RyaW5nc1tpXSA9IHJlcGxhY2VQYXR0ZXJuLmJ1aWxkUmVwbGFjZVN0cmluZyhtYXRjaGVzW2ldLm1hdGNoZXMsIHRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZCA9IG5ldyBSZXBsYWNlQWxsQ29tbWFuZCh0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCksIG1hdGNoZXMubWFwKG0gPT4gbS5yYW5nZSksIHJlcGxhY2VTdHJpbmdzKTtcblx0XHR0aGlzLl9leGVjdXRlRWRpdG9yQ29tbWFuZCgncmVwbGFjZUFsbCcsIGNvbW1hbmQpO1xuXHR9XG5cblx0cHVibGljIHNlbGVjdEFsbE1hdGNoZXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNNYXRjaGVzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaW5kU2NvcGVzID0gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RmluZFNjb3BlcygpO1xuXG5cdFx0Ly8gR2V0IGFsbCB0aGUgcmFuZ2VzIChldmVuIG1vcmUgdGhhbiB0aGUgaGlnaGxpZ2h0ZWQgb25lcylcblx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5fZmluZE1hdGNoZXMoZmluZFNjb3BlcywgZmFsc2UsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKTtcblx0XHRsZXQgc2VsZWN0aW9ucyA9IG1hdGNoZXMubWFwKG0gPT4gbmV3IFNlbGVjdGlvbihtLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgbS5yYW5nZS5zdGFydENvbHVtbiwgbS5yYW5nZS5lbmRMaW5lTnVtYmVyLCBtLnJhbmdlLmVuZENvbHVtbikpO1xuXG5cdFx0Ly8gSWYgb25lIG9mIHRoZSByYW5nZXMgaXMgdGhlIGVkaXRvciBzZWxlY3Rpb24sIHRoZW4gbWFpbnRhaW4gaXQgYXMgcHJpbWFyeVxuXHRcdGNvbnN0IGVkaXRvclNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsID0gc2VsZWN0aW9uc1tpXTtcblx0XHRcdGlmIChzZWwuZXF1YWxzUmFuZ2UoZWRpdG9yU2VsZWN0aW9uKSkge1xuXHRcdFx0XHRzZWxlY3Rpb25zID0gW2VkaXRvclNlbGVjdGlvbl0uY29uY2F0KHNlbGVjdGlvbnMuc2xpY2UoMCwgaSkpLmNvbmNhdChzZWxlY3Rpb25zLnNsaWNlKGkgKyAxKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhlY3V0ZUVkaXRvckNvbW1hbmQoc291cmNlOiBzdHJpbmcsIGNvbW1hbmQ6IElDb21tYW5kKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lnbm9yZU1vZGVsQ29udGVudENoYW5nZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmV4ZWN1dGVDb21tYW5kKHNvdXJjZSwgY29tbWFuZCk7XG5cdFx0XHR0aGlzLl9lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lnbm9yZU1vZGVsQ29udGVudENoYW5nZWQgPSBmYWxzZTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsa0JBQWtCLG9CQUFvQjtBQUMvQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGlCQUFpQixlQUFl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
