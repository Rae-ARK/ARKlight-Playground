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
import { findFirstIdxMonotonousOrArrLen } from "../../../../../../base/common/arraysFind.js";
import { createCancelablePromise, Delayer } from "../../../../../../base/common/async.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { PrefixSumComputer } from "../../../../../../editor/common/model/prefixSumComputer.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { FindMatchDecorationModel } from "./findMatchDecorationModel.js";
import { CellEditState } from "../../notebookBrowser.js";
import { CellKind, NotebookCellsChangeType } from "../../../common/notebookCommon.js";
import { hasKey } from "../../../../../../base/common/types.js";
class CellFindMatchModel {
  get length() {
    return this._contentMatches.length + this._webviewMatches.length;
  }
  get contentMatches() {
    return this._contentMatches;
  }
  get webviewMatches() {
    return this._webviewMatches;
  }
  constructor(cell, index, contentMatches, webviewMatches) {
    this.cell = cell;
    this.index = index;
    this._contentMatches = contentMatches;
    this._webviewMatches = webviewMatches;
  }
  getMatch(index) {
    if (index >= this.length) {
      throw new Error("NotebookCellFindMatch: index out of range");
    }
    if (index < this._contentMatches.length) {
      return this._contentMatches[index];
    }
    return this._webviewMatches[index - this._contentMatches.length];
  }
}
let FindModel = class extends Disposable {
  constructor(_notebookEditor, _state, _configurationService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._state = _state;
    this._configurationService = _configurationService;
    this._findMatches = [];
    this._findMatchesStarts = null;
    this._currentMatch = -1;
    this._computePromise = null;
    this._modelDisposable = this._register(new DisposableStore());
    this._throttledDelayer = this._register(new Delayer(20));
    this._computePromise = null;
    this._register(_state.onFindReplaceStateChange((e) => {
      this._updateCellStates(e);
      if (e.searchString || e.isRegex || e.matchCase || e.searchScope || e.wholeWord || e.isRevealed && this._state.isRevealed || e.filters || e.isReplaceRevealed) {
        this.research();
      }
      if (e.isRevealed && !this._state.isRevealed) {
        this.clear();
      }
    }));
    this._register(this._notebookEditor.onDidChangeModel((e) => {
      this._registerModelListener(e);
    }));
    this._register(this._notebookEditor.onDidChangeCellState((e) => {
      if (e.cell.cellKind === CellKind.Markup && e.source.editStateChanged) {
        this.research();
      }
    }));
    if (this._notebookEditor.hasModel()) {
      this._registerModelListener(this._notebookEditor.textModel);
    }
    this._findMatchDecorationModel = new FindMatchDecorationModel(this._notebookEditor, this._notebookEditor.getId());
  }
  get findMatches() {
    return this._findMatches;
  }
  get currentMatch() {
    return this._currentMatch;
  }
  _updateCellStates(e) {
    if (!this._state.filters?.markupInput || !this._state.filters?.markupPreview || !this._state.filters?.findScope) {
      return;
    }
    const updateEditingState = () => {
      const viewModel = this._notebookEditor.getViewModel();
      if (!viewModel) {
        return;
      }
      const wordSeparators = this._configurationService.inspect("editor.wordSeparators").value;
      const options = {
        regex: this._state.isRegex,
        wholeWord: this._state.wholeWord,
        caseSensitive: this._state.matchCase,
        wordSeparators,
        includeMarkupInput: true,
        includeCodeInput: false,
        includeMarkupPreview: false,
        includeOutput: false,
        findScope: this._state.filters?.findScope
      };
      const contentMatches = viewModel.find(this._state.searchString, options);
      for (let i = 0; i < viewModel.length; i++) {
        const cell = viewModel.cellAt(i);
        if (cell && cell.cellKind === CellKind.Markup) {
          const foundContentMatch = contentMatches.find((m) => m.cell.handle === cell.handle && m.contentMatches.length > 0);
          const targetState = foundContentMatch ? CellEditState.Editing : CellEditState.Preview;
          const currentEditingState = cell.getEditState();
          if (currentEditingState === CellEditState.Editing && cell.editStateSource !== "find") {
            continue;
          }
          if (currentEditingState !== targetState) {
            cell.updateEditState(targetState, "find");
          }
        }
      }
    };
    if (e.isReplaceRevealed && !this._state.isReplaceRevealed) {
      const viewModel = this._notebookEditor.getViewModel();
      if (!viewModel) {
        return;
      }
      for (let i = 0; i < viewModel.length; i++) {
        const cell = viewModel.cellAt(i);
        if (cell && cell.cellKind === CellKind.Markup) {
          if (cell.getEditState() === CellEditState.Editing && cell.editStateSource === "find") {
            cell.updateEditState(CellEditState.Preview, "find");
          }
        }
      }
      return;
    }
    if (e.isReplaceRevealed) {
      updateEditingState();
    } else if ((e.filters || e.isRevealed || e.searchString || e.replaceString) && this._state.isRevealed && this._state.isReplaceRevealed) {
      updateEditingState();
    }
  }
  ensureFindMatches() {
    if (!this._findMatchesStarts) {
      this.set(this._findMatches, true);
    }
  }
  getCurrentMatch() {
    const nextIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    const cell = this._findMatches[nextIndex.index].cell;
    const match = this._findMatches[nextIndex.index].getMatch(nextIndex.remainder);
    return {
      cell,
      match,
      isModelMatch: nextIndex.remainder < this._findMatches[nextIndex.index].contentMatches.length
    };
  }
  refreshCurrentMatch(focus) {
    const findMatchIndex = this.findMatches.findIndex((match) => match.cell === focus.cell);
    if (findMatchIndex === -1) {
      return;
    }
    const findMatch = this.findMatches[findMatchIndex];
    const index = findMatch.contentMatches.findIndex((match) => match.range.intersectRanges(focus.range) !== null);
    if (index === void 0) {
      return;
    }
    const matchesBefore = findMatchIndex === 0 ? 0 : this._findMatchesStarts?.getPrefixSum(findMatchIndex - 1) ?? 0;
    this._currentMatch = matchesBefore + index;
    this.highlightCurrentFindMatchDecoration(findMatchIndex, index).then(async (offset) => {
      await this.revealCellRange(findMatchIndex, index, offset);
      this._state.changeMatchInfo(
        this._currentMatch,
        this._findMatches.reduce((p, c) => p + c.length, 0),
        void 0
      );
    });
  }
  find(option) {
    if (!this.findMatches.length) {
      return;
    }
    if (!this._findMatchesStarts) {
      this.set(this._findMatches, true);
      if (hasKey(option, { index: true })) {
        this._currentMatch = option.index;
      }
    } else {
      const totalVal = this._findMatchesStarts.getTotalSum();
      if (hasKey(option, { index: true })) {
        this._currentMatch = option.index;
      } else if (this._currentMatch === -1) {
        this._currentMatch = option.previous ? totalVal - 1 : 0;
      } else {
        const nextVal = (this._currentMatch + (option.previous ? -1 : 1) + totalVal) % totalVal;
        this._currentMatch = nextVal;
      }
    }
    const nextIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    this.highlightCurrentFindMatchDecoration(nextIndex.index, nextIndex.remainder).then(async (offset) => {
      await this.revealCellRange(nextIndex.index, nextIndex.remainder, offset);
      this._state.changeMatchInfo(
        this._currentMatch,
        this._findMatches.reduce((p, c) => p + c.length, 0),
        void 0
      );
    });
  }
  async revealCellRange(cellIndex, matchIndex, outputOffset) {
    const findMatch = this._findMatches[cellIndex];
    if (matchIndex >= findMatch.contentMatches.length) {
      this._notebookEditor.focusElement(findMatch.cell);
      const index = this._notebookEditor.getCellIndex(findMatch.cell);
      if (index !== void 0) {
        this._notebookEditor.revealCellOffsetInCenter(findMatch.cell, outputOffset ?? 0);
      }
    } else {
      const match = findMatch.getMatch(matchIndex);
      if (findMatch.cell.getEditState() !== CellEditState.Editing) {
        findMatch.cell.updateEditState(CellEditState.Editing, "find");
      }
      findMatch.cell.isInputCollapsed = false;
      this._notebookEditor.focusElement(findMatch.cell);
      this._notebookEditor.setCellEditorSelection(findMatch.cell, match.range);
      await this._notebookEditor.revealInView(findMatch.cell);
      this._notebookEditor.revealRangeInCenterIfOutsideViewportAsync(findMatch.cell, match.range);
    }
  }
  _registerModelListener(notebookTextModel) {
    this._modelDisposable.clear();
    if (notebookTextModel) {
      this._modelDisposable.add(notebookTextModel.onDidChangeContent((e) => {
        if (!e.rawEvents.some((event) => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ModelChange)) {
          return;
        }
        this.research();
      }));
    }
    this.research();
  }
  async research() {
    return this._throttledDelayer.trigger(async () => {
      this._state.change({ isSearching: true }, false);
      await this._research();
      this._state.change({ isSearching: false }, false);
    });
  }
  async _research() {
    this._computePromise?.cancel();
    if (!this._state.isRevealed || !this._notebookEditor.hasModel()) {
      this.set([], false);
      return;
    }
    this._computePromise = createCancelablePromise((token) => this._compute(token));
    const findMatches = await this._computePromise;
    if (!findMatches) {
      this.set([], false);
      return;
    }
    if (findMatches.length === 0) {
      this.set([], false);
      return;
    }
    const findFirstMatchAfterCellIndex = (cellIndex) => {
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches.map((match) => match.index), (index) => index >= cellIndex);
      this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
    };
    if (this._currentMatch === -1) {
      if (this._notebookEditor.getLength() === 0) {
        this.set(findMatches, false);
        return;
      } else {
        const focus = this._notebookEditor.getFocus().start;
        findFirstMatchAfterCellIndex(focus);
        this.set(findMatches, false);
        return;
      }
    }
    const oldCurrIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    const oldCurrCell = this._findMatches[oldCurrIndex.index].cell;
    const oldCurrMatchCellIndex = this._notebookEditor.getCellIndex(oldCurrCell);
    if (oldCurrMatchCellIndex < 0) {
      if (this._notebookEditor.getLength() === 0) {
        this.set(findMatches, false);
        return;
      }
      findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
      return;
    }
    const cell = this._notebookEditor.cellAt(oldCurrMatchCellIndex);
    if (cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Preview) {
      findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
      return;
    }
    if (!this._findMatchDecorationModel.currentMatchDecorations) {
      findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
      return;
    }
    if (this._findMatchDecorationModel.currentMatchDecorations.kind === "input") {
      const currentMatchDecorationId = this._findMatchDecorationModel.currentMatchDecorations.decorations.find((decoration) => decoration.ownerId === cell.handle);
      if (!currentMatchDecorationId) {
        findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
        return;
      }
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches, (match) => match.index >= oldCurrMatchCellIndex) % findMatches.length;
      if (findMatches[matchAfterSelection].index > oldCurrMatchCellIndex) {
        this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
        return;
      } else {
        let currMatchRangeInEditor = cell.editorAttached && currentMatchDecorationId.decorations[0] ? cell.getCellDecorationRange(currentMatchDecorationId.decorations[0]) : null;
        if (currMatchRangeInEditor === null && oldCurrIndex.remainder < this._findMatches[oldCurrIndex.index].contentMatches.length) {
          currMatchRangeInEditor = this._findMatches[oldCurrIndex.index].getMatch(oldCurrIndex.remainder).range;
        }
        if (currMatchRangeInEditor !== null) {
          const cellMatch = findMatches[matchAfterSelection];
          const matchAfterOldSelection = findFirstIdxMonotonousOrArrLen(cellMatch.contentMatches, (match) => Range.compareRangesUsingStarts(match.range, currMatchRangeInEditor) >= 0);
          this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection) + matchAfterOldSelection);
        } else {
          this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
          return;
        }
      }
    } else {
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches.map((match) => match.index), (index) => index >= oldCurrMatchCellIndex) % findMatches.length;
      this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
    }
  }
  set(cellFindMatches, autoStart) {
    if (!cellFindMatches || !cellFindMatches.length) {
      this._findMatches = [];
      this._findMatchDecorationModel.setAllFindMatchesDecorations([]);
      this.constructFindMatchesStarts();
      this._currentMatch = -1;
      this._findMatchDecorationModel.clearCurrentFindMatchDecoration();
      this._state.changeMatchInfo(
        this._currentMatch,
        this._findMatches.reduce((p, c) => p + c.length, 0),
        void 0
      );
      return;
    }
    this._findMatches = cellFindMatches;
    this._findMatchDecorationModel.setAllFindMatchesDecorations(cellFindMatches || []);
    this.constructFindMatchesStarts();
    if (autoStart) {
      this._currentMatch = 0;
      this.highlightCurrentFindMatchDecoration(0, 0);
    }
    this._state.changeMatchInfo(
      this._currentMatch,
      this._findMatches.reduce((p, c) => p + c.length, 0),
      void 0
    );
  }
  async _compute(token) {
    if (!this._notebookEditor.hasModel()) {
      return null;
    }
    let ret = null;
    const val = this._state.searchString;
    const wordSeparators = this._configurationService.inspect("editor.wordSeparators").value;
    const options = {
      regex: this._state.isRegex,
      wholeWord: this._state.wholeWord,
      caseSensitive: this._state.matchCase,
      wordSeparators,
      includeMarkupInput: this._state.filters?.markupInput ?? true,
      includeCodeInput: this._state.filters?.codeInput ?? true,
      includeMarkupPreview: !!this._state.filters?.markupPreview,
      includeOutput: !!this._state.filters?.codeOutput,
      findScope: this._state.filters?.findScope
    };
    ret = await this._notebookEditor.find(val, options, token);
    if (token.isCancellationRequested) {
      return null;
    }
    return ret;
  }
  _updateCurrentMatch(findMatches, currentMatchesPosition) {
    this._currentMatch = currentMatchesPosition % findMatches.length;
    this.set(findMatches, false);
    const nextIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    this.highlightCurrentFindMatchDecoration(nextIndex.index, nextIndex.remainder);
    this._state.changeMatchInfo(
      this._currentMatch,
      this._findMatches.reduce((p, c) => p + c.length, 0),
      void 0
    );
  }
  _matchesCountBeforeIndex(findMatches, index) {
    let prevMatchesCount = 0;
    for (let i = 0; i < index; i++) {
      prevMatchesCount += findMatches[i].length;
    }
    return prevMatchesCount;
  }
  constructFindMatchesStarts() {
    if (this._findMatches && this._findMatches.length) {
      const values = new Uint32Array(this._findMatches.length);
      for (let i = 0; i < this._findMatches.length; i++) {
        values[i] = this._findMatches[i].length;
      }
      this._findMatchesStarts = new PrefixSumComputer(values);
    } else {
      this._findMatchesStarts = null;
    }
  }
  async highlightCurrentFindMatchDecoration(cellIndex, matchIndex) {
    const cell = this._findMatches[cellIndex].cell;
    const match = this._findMatches[cellIndex].getMatch(matchIndex);
    if (matchIndex < this._findMatches[cellIndex].contentMatches.length) {
      return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInCell(cell, match.range);
    } else {
      return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInWebview(cell, match.index);
    }
  }
  clear() {
    this._computePromise?.cancel();
    this._throttledDelayer.cancel();
    this.set([], false);
  }
  dispose() {
    this._findMatchDecorationModel.dispose();
    super.dispose();
  }
};
FindModel = __decorateClass([
  __decorateParam(2, IConfigurationService)
], FindModel);
export {
  CellFindMatchModel,
  FindModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9maW5kL2ZpbmRNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUHJlZml4U3VtQ29tcHV0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3ByZWZpeFN1bUNvbXB1dGVyLmpzJztcbmltcG9ydCB7IEZpbmRSZXBsYWNlU3RhdGUsIEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZFN0YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tGaW5kRmlsdGVycyB9IGZyb20gJy4vZmluZEZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsIH0gZnJvbSAnLi9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgQ2VsbEZpbmRNYXRjaFdpdGhJbmRleCwgQ2VsbFdlYnZpZXdGaW5kTWF0Y2gsIElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvbm90ZWJvb2tWaWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBJTm90ZWJvb2tGaW5kT3B0aW9ucywgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2VsbEZpbmRNYXRjaE1vZGVsIGltcGxlbWVudHMgQ2VsbEZpbmRNYXRjaFdpdGhJbmRleCB7XG5cdHJlYWRvbmx5IGNlbGw6IElDZWxsVmlld01vZGVsO1xuXHRyZWFkb25seSBpbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIF9jb250ZW50TWF0Y2hlczogRmluZE1hdGNoW107XG5cdHByaXZhdGUgX3dlYnZpZXdNYXRjaGVzOiBDZWxsV2Vidmlld0ZpbmRNYXRjaFtdO1xuXHRnZXQgbGVuZ3RoKCkge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50TWF0Y2hlcy5sZW5ndGggKyB0aGlzLl93ZWJ2aWV3TWF0Y2hlcy5sZW5ndGg7XG5cdH1cblxuXHRnZXQgY29udGVudE1hdGNoZXMoKTogRmluZE1hdGNoW10ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50TWF0Y2hlcztcblx0fVxuXG5cdGdldCB3ZWJ2aWV3TWF0Y2hlcygpOiBDZWxsV2Vidmlld0ZpbmRNYXRjaFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fd2Vidmlld01hdGNoZXM7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgY29udGVudE1hdGNoZXM6IEZpbmRNYXRjaFtdLCB3ZWJ2aWV3TWF0Y2hlczogQ2VsbFdlYnZpZXdGaW5kTWF0Y2hbXSkge1xuXHRcdHRoaXMuY2VsbCA9IGNlbGw7XG5cdFx0dGhpcy5pbmRleCA9IGluZGV4O1xuXHRcdHRoaXMuX2NvbnRlbnRNYXRjaGVzID0gY29udGVudE1hdGNoZXM7XG5cdFx0dGhpcy5fd2Vidmlld01hdGNoZXMgPSB3ZWJ2aWV3TWF0Y2hlcztcblx0fVxuXG5cdGdldE1hdGNoKGluZGV4OiBudW1iZXIpIHtcblx0XHRpZiAoaW5kZXggPj0gdGhpcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90ZWJvb2tDZWxsRmluZE1hdGNoOiBpbmRleCBvdXQgb2YgcmFuZ2UnKTtcblx0XHR9XG5cblx0XHRpZiAoaW5kZXggPCB0aGlzLl9jb250ZW50TWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb250ZW50TWF0Y2hlc1tpbmRleF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3dlYnZpZXdNYXRjaGVzW2luZGV4IC0gdGhpcy5fY29udGVudE1hdGNoZXMubGVuZ3RoXTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmluZE1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2ZpbmRNYXRjaGVzOiBDZWxsRmluZE1hdGNoV2l0aEluZGV4W10gPSBbXTtcblx0cHJvdGVjdGVkIF9maW5kTWF0Y2hlc1N0YXJ0czogUHJlZml4U3VtQ29tcHV0ZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudE1hdGNoOiBudW1iZXIgPSAtMTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90aHJvdHRsZWREZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIF9jb21wdXRlUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8Q2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdIHwgbnVsbD4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsOiBGaW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWw7XG5cblx0Z2V0IGZpbmRNYXRjaGVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9maW5kTWF0Y2hlcztcblx0fVxuXG5cdGdldCBjdXJyZW50TWF0Y2goKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRNYXRjaDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU6IEZpbmRSZXBsYWNlU3RhdGU8Tm90ZWJvb2tGaW5kRmlsdGVycz4sXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl90aHJvdHRsZWREZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXIoMjApKTtcblx0XHR0aGlzLl9jb21wdXRlUHJvbWlzZSA9IG51bGw7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihfc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlQ2VsbFN0YXRlcyhlKTtcblxuXHRcdFx0aWYgKGUuc2VhcmNoU3RyaW5nIHx8IGUuaXNSZWdleCB8fCBlLm1hdGNoQ2FzZSB8fCBlLnNlYXJjaFNjb3BlIHx8IGUud2hvbGVXb3JkIHx8IChlLmlzUmV2ZWFsZWQgJiYgdGhpcy5fc3RhdGUuaXNSZXZlYWxlZCkgfHwgZS5maWx0ZXJzIHx8IGUuaXNSZXBsYWNlUmV2ZWFsZWQpIHtcblx0XHRcdFx0dGhpcy5yZXNlYXJjaCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5pc1JldmVhbGVkICYmICF0aGlzLl9zdGF0ZS5pc1JldmVhbGVkKSB7XG5cdFx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZU1vZGVsKGUgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJNb2RlbExpc3RlbmVyKGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlQ2VsbFN0YXRlKGUgPT4ge1xuXHRcdFx0aWYgKGUuY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmIGUuc291cmNlLmVkaXRTdGF0ZUNoYW5nZWQpIHtcblx0XHRcdFx0Ly8gcmVzZWFyY2ggd2hlbiBtYXJrZG93biBjZWxsIGlzIHN3aXRjaGluZyBiZXR3ZWVuIG1hcmtkb3duIHByZXZpZXcgYW5kIGVkaXRpbmcgbW9kZS5cblx0XHRcdFx0dGhpcy5yZXNlYXJjaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlck1vZGVsTGlzdGVuZXIodGhpcy5fbm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsKTtcblx0XHR9XG5cblx0XHR0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwgPSBuZXcgRmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsKHRoaXMuX25vdGVib29rRWRpdG9yLCB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRJZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNlbGxTdGF0ZXMoZTogRmluZFJlcGxhY2VTdGF0ZUNoYW5nZWRFdmVudCkge1xuXHRcdGlmICghdGhpcy5fc3RhdGUuZmlsdGVycz8ubWFya3VwSW5wdXQgfHwgIXRoaXMuX3N0YXRlLmZpbHRlcnM/Lm1hcmt1cFByZXZpZXcgfHwgIXRoaXMuX3N0YXRlLmZpbHRlcnM/LmZpbmRTY29wZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHdlIG9ubHkgdXBkYXRlIGNlbGwgc3RhdGUgaWYgdXNlcnMgYXJlIHVzaW5nIHRoZSBoeWJyaWQgbW9kZSAoYm90aCBpbnB1dCBhbmQgcHJldmlldyBhcmUgZW5hYmxlZClcblx0XHRjb25zdCB1cGRhdGVFZGl0aW5nU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKSBhcyBOb3RlYm9va1ZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICghdmlld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIHNlYXJjaCBtYXJrdXAgc291cmNlcyBmaXJzdCB0byBkZWNpZGUgaWYgYSBtYXJrdXAgY2VsbCBzaG91bGQgYmUgaW4gZWRpdGluZyBtb2RlXG5cdFx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPignZWRpdG9yLndvcmRTZXBhcmF0b3JzJykudmFsdWU7XG5cdFx0XHRjb25zdCBvcHRpb25zOiBJTm90ZWJvb2tGaW5kT3B0aW9ucyA9IHtcblx0XHRcdFx0cmVnZXg6IHRoaXMuX3N0YXRlLmlzUmVnZXgsXG5cdFx0XHRcdHdob2xlV29yZDogdGhpcy5fc3RhdGUud2hvbGVXb3JkLFxuXHRcdFx0XHRjYXNlU2Vuc2l0aXZlOiB0aGlzLl9zdGF0ZS5tYXRjaENhc2UsXG5cdFx0XHRcdHdvcmRTZXBhcmF0b3JzOiB3b3JkU2VwYXJhdG9ycyxcblx0XHRcdFx0aW5jbHVkZU1hcmt1cElucHV0OiB0cnVlLFxuXHRcdFx0XHRpbmNsdWRlQ29kZUlucHV0OiBmYWxzZSxcblx0XHRcdFx0aW5jbHVkZU1hcmt1cFByZXZpZXc6IGZhbHNlLFxuXHRcdFx0XHRpbmNsdWRlT3V0cHV0OiBmYWxzZSxcblx0XHRcdFx0ZmluZFNjb3BlOiB0aGlzLl9zdGF0ZS5maWx0ZXJzPy5maW5kU2NvcGUsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb250ZW50TWF0Y2hlcyA9IHZpZXdNb2RlbC5maW5kKHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZywgb3B0aW9ucyk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpZXdNb2RlbC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLmNlbGxBdChpKTtcblx0XHRcdFx0aWYgKGNlbGwgJiYgY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm91bmRDb250ZW50TWF0Y2ggPSBjb250ZW50TWF0Y2hlcy5maW5kKG0gPT4gbS5jZWxsLmhhbmRsZSA9PT0gY2VsbC5oYW5kbGUgJiYgbS5jb250ZW50TWF0Y2hlcy5sZW5ndGggPiAwKTtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRTdGF0ZSA9IGZvdW5kQ29udGVudE1hdGNoID8gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nIDogQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3O1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRFZGl0aW5nU3RhdGUgPSBjZWxsLmdldEVkaXRTdGF0ZSgpO1xuXG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRFZGl0aW5nU3RhdGUgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyAmJiBjZWxsLmVkaXRTdGF0ZVNvdXJjZSAhPT0gJ2ZpbmQnKSB7XG5cdFx0XHRcdFx0XHQvLyBpdCdzIGFscmVhZHkgaW4gZWRpdGluZyBtb2RlLCB3ZSBzaG91bGQgbm90IHVwZGF0ZVxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjdXJyZW50RWRpdGluZ1N0YXRlICE9PSB0YXJnZXRTdGF0ZSkge1xuXHRcdFx0XHRcdFx0Y2VsbC51cGRhdGVFZGl0U3RhdGUodGFyZ2V0U3RhdGUsICdmaW5kJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXG5cdFx0aWYgKGUuaXNSZXBsYWNlUmV2ZWFsZWQgJiYgIXRoaXMuX3N0YXRlLmlzUmVwbGFjZVJldmVhbGVkKSB7XG5cdFx0XHQvLyByZXBsYWNlIGlzIGhpZGRlbiwgd2UgbmVlZCB0byBzd2l0Y2ggYWxsIG1hcmtkb3duIGNlbGxzIHRvIHByZXZpZXcgbW9kZVxuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCkgYXMgTm90ZWJvb2tWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmlld01vZGVsLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB2aWV3TW9kZWwuY2VsbEF0KGkpO1xuXHRcdFx0XHRpZiAoY2VsbCAmJiBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdFx0XHRpZiAoY2VsbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nICYmIGNlbGwuZWRpdFN0YXRlU291cmNlID09PSAnZmluZCcpIHtcblx0XHRcdFx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuUHJldmlldywgJ2ZpbmQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmlzUmVwbGFjZVJldmVhbGVkKSB7XG5cdFx0XHR1cGRhdGVFZGl0aW5nU3RhdGUoKTtcblx0XHR9IGVsc2UgaWYgKChlLmZpbHRlcnMgfHwgZS5pc1JldmVhbGVkIHx8IGUuc2VhcmNoU3RyaW5nIHx8IGUucmVwbGFjZVN0cmluZykgJiYgdGhpcy5fc3RhdGUuaXNSZXZlYWxlZCAmJiB0aGlzLl9zdGF0ZS5pc1JlcGxhY2VSZXZlYWxlZCkge1xuXHRcdFx0dXBkYXRlRWRpdGluZ1N0YXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0ZW5zdXJlRmluZE1hdGNoZXMoKSB7XG5cdFx0aWYgKCF0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cykge1xuXHRcdFx0dGhpcy5zZXQodGhpcy5fZmluZE1hdGNoZXMsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldEN1cnJlbnRNYXRjaCgpIHtcblx0XHRjb25zdCBuZXh0SW5kZXggPSB0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cyEuZ2V0SW5kZXhPZih0aGlzLl9jdXJyZW50TWF0Y2gpO1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9maW5kTWF0Y2hlc1tuZXh0SW5kZXguaW5kZXhdLmNlbGw7XG5cdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLl9maW5kTWF0Y2hlc1tuZXh0SW5kZXguaW5kZXhdLmdldE1hdGNoKG5leHRJbmRleC5yZW1haW5kZXIpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNlbGwsXG5cdFx0XHRtYXRjaCxcblx0XHRcdGlzTW9kZWxNYXRjaDogbmV4dEluZGV4LnJlbWFpbmRlciA8IHRoaXMuX2ZpbmRNYXRjaGVzW25leHRJbmRleC5pbmRleF0uY29udGVudE1hdGNoZXMubGVuZ3RoXG5cdFx0fTtcblx0fVxuXG5cdHJlZnJlc2hDdXJyZW50TWF0Y2goZm9jdXM6IHsgY2VsbDogSUNlbGxWaWV3TW9kZWw7IHJhbmdlOiBSYW5nZSB9KSB7XG5cdFx0Y29uc3QgZmluZE1hdGNoSW5kZXggPSB0aGlzLmZpbmRNYXRjaGVzLmZpbmRJbmRleChtYXRjaCA9PiBtYXRjaC5jZWxsID09PSBmb2N1cy5jZWxsKTtcblxuXHRcdGlmIChmaW5kTWF0Y2hJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaW5kTWF0Y2ggPSB0aGlzLmZpbmRNYXRjaGVzW2ZpbmRNYXRjaEluZGV4XTtcblx0XHRjb25zdCBpbmRleCA9IGZpbmRNYXRjaC5jb250ZW50TWF0Y2hlcy5maW5kSW5kZXgobWF0Y2ggPT4gbWF0Y2gucmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKGZvY3VzLnJhbmdlKSAhPT0gbnVsbCk7XG5cblx0XHRpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoZXNCZWZvcmUgPSBmaW5kTWF0Y2hJbmRleCA9PT0gMCA/IDAgOiAodGhpcy5fZmluZE1hdGNoZXNTdGFydHM/LmdldFByZWZpeFN1bShmaW5kTWF0Y2hJbmRleCAtIDEpID8/IDApO1xuXHRcdHRoaXMuX2N1cnJlbnRNYXRjaCA9IG1hdGNoZXNCZWZvcmUgKyBpbmRleDtcblxuXHRcdHRoaXMuaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb24oZmluZE1hdGNoSW5kZXgsIGluZGV4KS50aGVuKGFzeW5jIG9mZnNldCA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnJldmVhbENlbGxSYW5nZShmaW5kTWF0Y2hJbmRleCwgaW5kZXgsIG9mZnNldCk7XG5cblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZU1hdGNoSW5mbyhcblx0XHRcdFx0dGhpcy5fY3VycmVudE1hdGNoLFxuXHRcdFx0XHR0aGlzLl9maW5kTWF0Y2hlcy5yZWR1Y2UoKHAsIGMpID0+IHAgKyBjLmxlbmd0aCwgMCksXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdGZpbmQob3B0aW9uOiB7IHByZXZpb3VzOiBib29sZWFuIH0gfCB7IGluZGV4OiBudW1iZXIgfSkge1xuXHRcdGlmICghdGhpcy5maW5kTWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBsZXQgY3VyckNlbGw7XG5cdFx0aWYgKCF0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cykge1xuXHRcdFx0dGhpcy5zZXQodGhpcy5fZmluZE1hdGNoZXMsIHRydWUpO1xuXHRcdFx0aWYgKGhhc0tleShvcHRpb24sIHsgaW5kZXg6IHRydWUgfSkpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudE1hdGNoID0gb3B0aW9uLmluZGV4O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBjb25zdCBjdXJySW5kZXggPSB0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cyEuZ2V0SW5kZXhPZih0aGlzLl9jdXJyZW50TWF0Y2gpO1xuXHRcdFx0Ly8gY3VyckNlbGwgPSB0aGlzLl9maW5kTWF0Y2hlc1tjdXJySW5kZXguaW5kZXhdLmNlbGw7XG5cdFx0XHRjb25zdCB0b3RhbFZhbCA9IHRoaXMuX2ZpbmRNYXRjaGVzU3RhcnRzLmdldFRvdGFsU3VtKCk7XG5cdFx0XHRpZiAoaGFzS2V5KG9wdGlvbiwgeyBpbmRleDogdHJ1ZSB9KSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2ggPSBvcHRpb24uaW5kZXg7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmICh0aGlzLl9jdXJyZW50TWF0Y2ggPT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCA9IG9wdGlvbi5wcmV2aW91cyA/IHRvdGFsVmFsIC0gMSA6IDA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXh0VmFsID0gKHRoaXMuX2N1cnJlbnRNYXRjaCArIChvcHRpb24ucHJldmlvdXMgPyAtMSA6IDEpICsgdG90YWxWYWwpICUgdG90YWxWYWw7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCA9IG5leHRWYWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dEluZGV4ID0gdGhpcy5fZmluZE1hdGNoZXNTdGFydHMhLmdldEluZGV4T2YodGhpcy5fY3VycmVudE1hdGNoKTtcblx0XHQvLyBjb25zdCBuZXdGb2N1c2VkQ2VsbCA9IHRoaXMuX2ZpbmRNYXRjaGVzW25leHRJbmRleC5pbmRleF0uY2VsbDtcblx0XHR0aGlzLmhpZ2hsaWdodEN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKG5leHRJbmRleC5pbmRleCwgbmV4dEluZGV4LnJlbWFpbmRlcikudGhlbihhc3luYyBvZmZzZXQgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxDZWxsUmFuZ2UobmV4dEluZGV4LmluZGV4LCBuZXh0SW5kZXgucmVtYWluZGVyLCBvZmZzZXQpO1xuXG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2VNYXRjaEluZm8oXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCxcblx0XHRcdFx0dGhpcy5fZmluZE1hdGNoZXMucmVkdWNlKChwLCBjKSA9PiBwICsgYy5sZW5ndGgsIDApLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJldmVhbENlbGxSYW5nZShjZWxsSW5kZXg6IG51bWJlciwgbWF0Y2hJbmRleDogbnVtYmVyLCBvdXRwdXRPZmZzZXQ6IG51bWJlciB8IG51bGwpIHtcblx0XHRjb25zdCBmaW5kTWF0Y2ggPSB0aGlzLl9maW5kTWF0Y2hlc1tjZWxsSW5kZXhdO1xuXHRcdGlmIChtYXRjaEluZGV4ID49IGZpbmRNYXRjaC5jb250ZW50TWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdC8vIHJldmVhbCBvdXRwdXQgcmFuZ2Vcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmZvY3VzRWxlbWVudChmaW5kTWF0Y2guY2VsbCk7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChmaW5kTWF0Y2guY2VsbCk7XG5cdFx0XHRpZiAoaW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBjb25zdCByYW5nZTogSUNlbGxSYW5nZSA9IHsgc3RhcnQ6IGluZGV4LCBlbmQ6IGluZGV4ICsgMSB9O1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5yZXZlYWxDZWxsT2Zmc2V0SW5DZW50ZXIoZmluZE1hdGNoLmNlbGwsIG91dHB1dE9mZnNldCA/PyAwKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBmaW5kTWF0Y2guZ2V0TWF0Y2gobWF0Y2hJbmRleCkgYXMgRmluZE1hdGNoO1xuXHRcdFx0aWYgKGZpbmRNYXRjaC5jZWxsLmdldEVkaXRTdGF0ZSgpICE9PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcpIHtcblx0XHRcdFx0ZmluZE1hdGNoLmNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuRWRpdGluZywgJ2ZpbmQnKTtcblx0XHRcdH1cblx0XHRcdGZpbmRNYXRjaC5jZWxsLmlzSW5wdXRDb2xsYXBzZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmZvY3VzRWxlbWVudChmaW5kTWF0Y2guY2VsbCk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5zZXRDZWxsRWRpdG9yU2VsZWN0aW9uKGZpbmRNYXRjaC5jZWxsLCBtYXRjaC5yYW5nZSk7XG5cdFx0XHQvLyBGaXJzdCBlbnN1cmUgdGhlIGNlbGwgaXMgdmlzaWJsZSBpbiB0aGUgbm90ZWJvb2sgdmlld3BvcnRcblx0XHRcdGF3YWl0IHRoaXMuX25vdGVib29rRWRpdG9yLnJldmVhbEluVmlldyhmaW5kTWF0Y2guY2VsbCk7XG5cdFx0XHQvLyBUaGVuIHJldmVhbCB0aGUgc3BlY2lmaWMgcmFuZ2Ugd2l0aGluIHRoZSBjZWxsIGVkaXRvclxuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0QXN5bmMoZmluZE1hdGNoLmNlbGwsIG1hdGNoLnJhbmdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck1vZGVsTGlzdGVuZXIobm90ZWJvb2tUZXh0TW9kZWw/OiBOb3RlYm9va1RleHRNb2RlbCkge1xuXHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0aWYgKG5vdGVib29rVGV4dE1vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGUuYWRkKG5vdGVib29rVGV4dE1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0XHRpZiAoIWUucmF3RXZlbnRzLnNvbWUoZXZlbnQgPT4gZXZlbnQua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQgfHwgZXZlbnQua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5yZXNlYXJjaCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVzZWFyY2goKTtcblx0fVxuXG5cdGFzeW5jIHJlc2VhcmNoKCkge1xuXHRcdHJldHVybiB0aGlzLl90aHJvdHRsZWREZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgaXNTZWFyY2hpbmc6IHRydWUgfSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzZWFyY2goKTtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGlzU2VhcmNoaW5nOiBmYWxzZSB9LCBmYWxzZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBfcmVzZWFyY2goKSB7XG5cdFx0dGhpcy5fY29tcHV0ZVByb21pc2U/LmNhbmNlbCgpO1xuXG5cdFx0aWYgKCF0aGlzLl9zdGF0ZS5pc1JldmVhbGVkIHx8ICF0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLnNldChbXSwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbXB1dGVQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGhpcy5fY29tcHV0ZSh0b2tlbikpO1xuXG5cdFx0Y29uc3QgZmluZE1hdGNoZXMgPSBhd2FpdCB0aGlzLl9jb21wdXRlUHJvbWlzZTtcblx0XHRpZiAoIWZpbmRNYXRjaGVzKSB7XG5cdFx0XHR0aGlzLnNldChbXSwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChmaW5kTWF0Y2hlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuc2V0KFtdLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmluZEZpcnN0TWF0Y2hBZnRlckNlbGxJbmRleCA9IChjZWxsSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgbWF0Y2hBZnRlclNlbGVjdGlvbiA9IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihmaW5kTWF0Y2hlcy5tYXAobWF0Y2ggPT4gbWF0Y2guaW5kZXgpLCBpbmRleCA9PiBpbmRleCA+PSBjZWxsSW5kZXgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ3VycmVudE1hdGNoKGZpbmRNYXRjaGVzLCB0aGlzLl9tYXRjaGVzQ291bnRCZWZvcmVJbmRleChmaW5kTWF0Y2hlcywgbWF0Y2hBZnRlclNlbGVjdGlvbikpO1xuXHRcdH07XG5cblx0XHRpZiAodGhpcy5fY3VycmVudE1hdGNoID09PSAtMSkge1xuXHRcdFx0Ly8gbm8gYWN0aXZlIGN1cnJlbnQgbWF0Y2hcblx0XHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnNldChmaW5kTWF0Y2hlcywgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldEZvY3VzKCkuc3RhcnQ7XG5cdFx0XHRcdGZpbmRGaXJzdE1hdGNoQWZ0ZXJDZWxsSW5kZXgoZm9jdXMpO1xuXHRcdFx0XHR0aGlzLnNldChmaW5kTWF0Y2hlcywgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkQ3VyckluZGV4ID0gdGhpcy5fZmluZE1hdGNoZXNTdGFydHMhLmdldEluZGV4T2YodGhpcy5fY3VycmVudE1hdGNoKTtcblx0XHRjb25zdCBvbGRDdXJyQ2VsbCA9IHRoaXMuX2ZpbmRNYXRjaGVzW29sZEN1cnJJbmRleC5pbmRleF0uY2VsbDtcblx0XHRjb25zdCBvbGRDdXJyTWF0Y2hDZWxsSW5kZXggPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgob2xkQ3VyckNlbGwpO1xuXG5cblx0XHRpZiAob2xkQ3Vyck1hdGNoQ2VsbEluZGV4IDwgMCkge1xuXHRcdFx0Ly8gdGhlIGNlbGwgY29udGFpbmluZyB0aGUgYWN0aXZlIG1hdGNoIGlzIGRlbGV0ZWRcblx0XHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnNldChmaW5kTWF0Y2hlcywgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZpbmRGaXJzdE1hdGNoQWZ0ZXJDZWxsSW5kZXgob2xkQ3Vyck1hdGNoQ2VsbEluZGV4KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyB0aGUgY2VsbCBzdGlsbCBleGlzdFxuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5jZWxsQXQob2xkQ3Vyck1hdGNoQ2VsbEluZGV4KTtcblx0XHQvLyB3ZSB3aWxsIHRyeSByZXN0b3JlIHRoZSBhY3RpdmUgZmluZCBtYXRjaCBpbiB0aGlzIGNlbGwsIGlmIGl0IGNvbnRhaW5zIGFueSBmaW5kIG1hdGNoXG5cblx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmIGNlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuUHJldmlldykge1xuXHRcdFx0Ly8gZmluZCBmaXJzdCBtYXRjaCBpbiB0aGlzIGNlbGwgb3IgYmVsb3dcblx0XHRcdGZpbmRGaXJzdE1hdGNoQWZ0ZXJDZWxsSW5kZXgob2xkQ3Vyck1hdGNoQ2VsbEluZGV4KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyB0aGUgY2VsbCBpcyBhIG1hcmt1cCBjZWxsIGluIGVkaXRpbmcgbW9kZSBvciBhIGNvZGUgY2VsbCwgYm90aCBzaG91bGQgaGF2ZSBtb25hY28gZWRpdG9yIHJlbmRlcmVkXG5cblx0XHRpZiAoIXRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5jdXJyZW50TWF0Y2hEZWNvcmF0aW9ucykge1xuXHRcdFx0Ly8gbm8gY3VycmVudCBoaWdobGlnaHQgZGVjb3JhdGlvblxuXHRcdFx0ZmluZEZpcnN0TWF0Y2hBZnRlckNlbGxJbmRleChvbGRDdXJyTWF0Y2hDZWxsSW5kZXgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIGlmIHRoZXJlIGlzIG1vbmFjbyBlZGl0b3Igc2VsZWN0aW9uIGFuZCBmaW5kIHRoZSBmaXJzdCBtYXRjaCwgb3RoZXJ3aXNlIGZpbmQgdGhlIGZpcnN0IG1hdGNoIGFib3ZlIGN1cnJlbnQgY2VsbFxuXHRcdC8vIHRoaXMuX2ZpbmRNYXRjaGVzW2NlbGxJbmRleF0ubWF0Y2hlc1ttYXRjaEluZGV4XS5yYW5nZVxuXHRcdGlmICh0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwuY3VycmVudE1hdGNoRGVjb3JhdGlvbnMua2luZCA9PT0gJ2lucHV0Jykge1xuXHRcdFx0Y29uc3QgY3VycmVudE1hdGNoRGVjb3JhdGlvbklkID0gdGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLmN1cnJlbnRNYXRjaERlY29yYXRpb25zLmRlY29yYXRpb25zLmZpbmQoZGVjb3JhdGlvbiA9PiBkZWNvcmF0aW9uLm93bmVySWQgPT09IGNlbGwuaGFuZGxlKTtcblxuXHRcdFx0aWYgKCFjdXJyZW50TWF0Y2hEZWNvcmF0aW9uSWQpIHtcblx0XHRcdFx0Ly8gY3VycmVudCBtYXRjaCBkZWNvcmF0aW9uIGlzIG5vIGxvbmdlciB2YWxpZFxuXHRcdFx0XHRmaW5kRmlyc3RNYXRjaEFmdGVyQ2VsbEluZGV4KG9sZEN1cnJNYXRjaENlbGxJbmRleCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF0Y2hBZnRlclNlbGVjdGlvbiA9IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihmaW5kTWF0Y2hlcywgbWF0Y2ggPT4gbWF0Y2guaW5kZXggPj0gb2xkQ3Vyck1hdGNoQ2VsbEluZGV4KSAlIGZpbmRNYXRjaGVzLmxlbmd0aDtcblx0XHRcdGlmIChmaW5kTWF0Y2hlc1ttYXRjaEFmdGVyU2VsZWN0aW9uXS5pbmRleCA+IG9sZEN1cnJNYXRjaENlbGxJbmRleCkge1xuXHRcdFx0XHQvLyB0aGVyZSBpcyBubyBzZWFyY2ggcmVzdWx0IGluIGN1cnIgY2VsbCBhbnltb3JlLCBmaW5kIHRoZSBuZWFyZXN0IG9uZSAoZnJvbSB0b3AgdG8gYm90dG9tKVxuXHRcdFx0XHR0aGlzLl91cGRhdGVDdXJyZW50TWF0Y2goZmluZE1hdGNoZXMsIHRoaXMuX21hdGNoZXNDb3VudEJlZm9yZUluZGV4KGZpbmRNYXRjaGVzLCBtYXRjaEFmdGVyU2VsZWN0aW9uKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHRoZXJlIGFyZSBzdGlsbCBzb21lIHNlYXJjaCByZXN1bHRzIGluIGN1cnJlbnQgY2VsbFxuXHRcdFx0XHRsZXQgY3Vyck1hdGNoUmFuZ2VJbkVkaXRvciA9IGNlbGwuZWRpdG9yQXR0YWNoZWQgJiYgY3VycmVudE1hdGNoRGVjb3JhdGlvbklkLmRlY29yYXRpb25zWzBdID8gY2VsbC5nZXRDZWxsRGVjb3JhdGlvblJhbmdlKGN1cnJlbnRNYXRjaERlY29yYXRpb25JZC5kZWNvcmF0aW9uc1swXSkgOiBudWxsO1xuXG5cdFx0XHRcdGlmIChjdXJyTWF0Y2hSYW5nZUluRWRpdG9yID09PSBudWxsICYmIG9sZEN1cnJJbmRleC5yZW1haW5kZXIgPCB0aGlzLl9maW5kTWF0Y2hlc1tvbGRDdXJySW5kZXguaW5kZXhdLmNvbnRlbnRNYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGN1cnJNYXRjaFJhbmdlSW5FZGl0b3IgPSAodGhpcy5fZmluZE1hdGNoZXNbb2xkQ3VyckluZGV4LmluZGV4XS5nZXRNYXRjaChvbGRDdXJySW5kZXgucmVtYWluZGVyKSBhcyBGaW5kTWF0Y2gpLnJhbmdlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGN1cnJNYXRjaFJhbmdlSW5FZGl0b3IgIT09IG51bGwpIHtcblx0XHRcdFx0XHQvLyB3ZSBmaW5kIGEgcmFuZ2UgZm9yIHRoZSBwcmV2aW91cyBjdXJyZW50IG1hdGNoLCBsZXQncyBmaW5kIHRoZSBuZWFyZXN0IG9uZSBhZnRlciBpdCAoY2FuIG92ZXJsYXApXG5cdFx0XHRcdFx0Y29uc3QgY2VsbE1hdGNoID0gZmluZE1hdGNoZXNbbWF0Y2hBZnRlclNlbGVjdGlvbl07XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hBZnRlck9sZFNlbGVjdGlvbiA9IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihjZWxsTWF0Y2guY29udGVudE1hdGNoZXMsIG1hdGNoID0+IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cygobWF0Y2ggYXMgRmluZE1hdGNoKS5yYW5nZSwgY3Vyck1hdGNoUmFuZ2VJbkVkaXRvcikgPj0gMCk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlQ3VycmVudE1hdGNoKGZpbmRNYXRjaGVzLCB0aGlzLl9tYXRjaGVzQ291bnRCZWZvcmVJbmRleChmaW5kTWF0Y2hlcywgbWF0Y2hBZnRlclNlbGVjdGlvbikgKyBtYXRjaEFmdGVyT2xkU2VsZWN0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBubyByYW5nZSBmb3VuZCwgbGV0J3MgZmFsbCBiYWNrIHRvIGZpbmRpbmcgdGhlIG5lYXJlc3QgbWF0Y2hcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVDdXJyZW50TWF0Y2goZmluZE1hdGNoZXMsIHRoaXMuX21hdGNoZXNDb3VudEJlZm9yZUluZGV4KGZpbmRNYXRjaGVzLCBtYXRjaEFmdGVyU2VsZWN0aW9uKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG91dHB1dCBub3cgaGFzIHRoZSBoaWdobGlnaHRcblx0XHRcdGNvbnN0IG1hdGNoQWZ0ZXJTZWxlY3Rpb24gPSBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oZmluZE1hdGNoZXMubWFwKG1hdGNoID0+IG1hdGNoLmluZGV4KSwgaW5kZXggPT4gaW5kZXggPj0gb2xkQ3Vyck1hdGNoQ2VsbEluZGV4KSAlIGZpbmRNYXRjaGVzLmxlbmd0aDtcblx0XHRcdHRoaXMuX3VwZGF0ZUN1cnJlbnRNYXRjaChmaW5kTWF0Y2hlcywgdGhpcy5fbWF0Y2hlc0NvdW50QmVmb3JlSW5kZXgoZmluZE1hdGNoZXMsIG1hdGNoQWZ0ZXJTZWxlY3Rpb24pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldChjZWxsRmluZE1hdGNoZXM6IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSB8IG51bGwsIGF1dG9TdGFydDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghY2VsbEZpbmRNYXRjaGVzIHx8ICFjZWxsRmluZE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9maW5kTWF0Y2hlcyA9IFtdO1xuXHRcdFx0dGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLnNldEFsbEZpbmRNYXRjaGVzRGVjb3JhdGlvbnMoW10pO1xuXG5cdFx0XHR0aGlzLmNvbnN0cnVjdEZpbmRNYXRjaGVzU3RhcnRzKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2ggPSAtMTtcblx0XHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5jbGVhckN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKCk7XG5cblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZU1hdGNoSW5mbyhcblx0XHRcdFx0dGhpcy5fY3VycmVudE1hdGNoLFxuXHRcdFx0XHR0aGlzLl9maW5kTWF0Y2hlcy5yZWR1Y2UoKHAsIGMpID0+IHAgKyBjLmxlbmd0aCwgMCksXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBhbGwgbWF0Y2hlc1xuXHRcdHRoaXMuX2ZpbmRNYXRjaGVzID0gY2VsbEZpbmRNYXRjaGVzO1xuXHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5zZXRBbGxGaW5kTWF0Y2hlc0RlY29yYXRpb25zKGNlbGxGaW5kTWF0Y2hlcyB8fCBbXSk7XG5cblx0XHQvLyBjdXJyZW50IG1hdGNoXG5cdFx0dGhpcy5jb25zdHJ1Y3RGaW5kTWF0Y2hlc1N0YXJ0cygpO1xuXG5cdFx0aWYgKGF1dG9TdGFydCkge1xuXHRcdFx0dGhpcy5fY3VycmVudE1hdGNoID0gMDtcblx0XHRcdHRoaXMuaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb24oMCwgMCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlTWF0Y2hJbmZvKFxuXHRcdFx0dGhpcy5fY3VycmVudE1hdGNoLFxuXHRcdFx0dGhpcy5fZmluZE1hdGNoZXMucmVkdWNlKChwLCBjKSA9PiBwICsgYy5sZW5ndGgsIDApLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDZWxsRmluZE1hdGNoV2l0aEluZGV4W10gfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0bGV0IHJldDogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdIHwgbnVsbCA9IG51bGw7XG5cdFx0Y29uc3QgdmFsID0gdGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nO1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxzdHJpbmc+KCdlZGl0b3Iud29yZFNlcGFyYXRvcnMnKS52YWx1ZTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElOb3RlYm9va0ZpbmRPcHRpb25zID0ge1xuXHRcdFx0cmVnZXg6IHRoaXMuX3N0YXRlLmlzUmVnZXgsXG5cdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX3N0YXRlLndob2xlV29yZCxcblx0XHRcdGNhc2VTZW5zaXRpdmU6IHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSxcblx0XHRcdHdvcmRTZXBhcmF0b3JzOiB3b3JkU2VwYXJhdG9ycyxcblx0XHRcdGluY2x1ZGVNYXJrdXBJbnB1dDogdGhpcy5fc3RhdGUuZmlsdGVycz8ubWFya3VwSW5wdXQgPz8gdHJ1ZSxcblx0XHRcdGluY2x1ZGVDb2RlSW5wdXQ6IHRoaXMuX3N0YXRlLmZpbHRlcnM/LmNvZGVJbnB1dCA/PyB0cnVlLFxuXHRcdFx0aW5jbHVkZU1hcmt1cFByZXZpZXc6ICEhdGhpcy5fc3RhdGUuZmlsdGVycz8ubWFya3VwUHJldmlldyxcblx0XHRcdGluY2x1ZGVPdXRwdXQ6ICEhdGhpcy5fc3RhdGUuZmlsdGVycz8uY29kZU91dHB1dCxcblx0XHRcdGZpbmRTY29wZTogdGhpcy5fc3RhdGUuZmlsdGVycz8uZmluZFNjb3BlLFxuXHRcdH07XG5cblx0XHRyZXQgPSBhd2FpdCB0aGlzLl9ub3RlYm9va0VkaXRvci5maW5kKHZhbCwgb3B0aW9ucywgdG9rZW4pO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ3VycmVudE1hdGNoKGZpbmRNYXRjaGVzOiBDZWxsRmluZE1hdGNoV2l0aEluZGV4W10sIGN1cnJlbnRNYXRjaGVzUG9zaXRpb246IG51bWJlcikge1xuXHRcdHRoaXMuX2N1cnJlbnRNYXRjaCA9IGN1cnJlbnRNYXRjaGVzUG9zaXRpb24gJSBmaW5kTWF0Y2hlcy5sZW5ndGg7XG5cdFx0dGhpcy5zZXQoZmluZE1hdGNoZXMsIGZhbHNlKTtcblx0XHRjb25zdCBuZXh0SW5kZXggPSB0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cyEuZ2V0SW5kZXhPZih0aGlzLl9jdXJyZW50TWF0Y2gpO1xuXHRcdHRoaXMuaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb24obmV4dEluZGV4LmluZGV4LCBuZXh0SW5kZXgucmVtYWluZGVyKTtcblxuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZU1hdGNoSW5mbyhcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCxcblx0XHRcdHRoaXMuX2ZpbmRNYXRjaGVzLnJlZHVjZSgocCwgYykgPT4gcCArIGMubGVuZ3RoLCAwKSxcblx0XHRcdHVuZGVmaW5lZFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaGVzQ291bnRCZWZvcmVJbmRleChmaW5kTWF0Y2hlczogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0bGV0IHByZXZNYXRjaGVzQ291bnQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5kZXg7IGkrKykge1xuXHRcdFx0cHJldk1hdGNoZXNDb3VudCArPSBmaW5kTWF0Y2hlc1tpXS5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByZXZNYXRjaGVzQ291bnQ7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdEZpbmRNYXRjaGVzU3RhcnRzKCkge1xuXHRcdGlmICh0aGlzLl9maW5kTWF0Y2hlcyAmJiB0aGlzLl9maW5kTWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHZhbHVlcyA9IG5ldyBVaW50MzJBcnJheSh0aGlzLl9maW5kTWF0Y2hlcy5sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9maW5kTWF0Y2hlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR2YWx1ZXNbaV0gPSB0aGlzLl9maW5kTWF0Y2hlc1tpXS5sZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2ZpbmRNYXRjaGVzU3RhcnRzID0gbmV3IFByZWZpeFN1bUNvbXB1dGVyKHZhbHVlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2ZpbmRNYXRjaGVzU3RhcnRzID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb24oY2VsbEluZGV4OiBudW1iZXIsIG1hdGNoSW5kZXg6IG51bWJlcik6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9maW5kTWF0Y2hlc1tjZWxsSW5kZXhdLmNlbGw7XG5cdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLl9maW5kTWF0Y2hlc1tjZWxsSW5kZXhdLmdldE1hdGNoKG1hdGNoSW5kZXgpO1xuXG5cdFx0aWYgKG1hdGNoSW5kZXggPCB0aGlzLl9maW5kTWF0Y2hlc1tjZWxsSW5kZXhdLmNvbnRlbnRNYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5oaWdobGlnaHRDdXJyZW50RmluZE1hdGNoRGVjb3JhdGlvbkluQ2VsbChjZWxsLCAobWF0Y2ggYXMgRmluZE1hdGNoKS5yYW5nZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwuaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb25JbldlYnZpZXcoY2VsbCwgKG1hdGNoIGFzIENlbGxXZWJ2aWV3RmluZE1hdGNoKS5pbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKSB7XG5cdFx0dGhpcy5fY29tcHV0ZVByb21pc2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3Rocm90dGxlZERlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5zZXQoW10sIGZhbHNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBNEIseUJBQXlCLGVBQWU7QUFFcEUsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGFB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
