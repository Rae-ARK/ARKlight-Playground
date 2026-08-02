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
import { rejectIfNotCanceled, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableSignal, observableSignalFromEvent, observableValue, transaction, waitForState } from "../../../../base/common/observable.js";
import { IDiffProviderFactoryService } from "./diffProviderFactoryService.js";
import { filterWithPrevious } from "./utils.js";
import { readHotReloadableExport } from "../../../../base/common/hotReloadHelpers.js";
import { LineRange, LineRangeSet } from "../../../common/core/ranges/lineRange.js";
import { DefaultLinesDiffComputer } from "../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js";
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from "../../../common/diff/rangeMapping.js";
import { TextEditInfo } from "../../../common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper.js";
import { combineTextEditInfos } from "../../../common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos.js";
import { optimizeSequenceDiffs } from "../../../common/diff/defaultLinesDiffComputer/heuristicSequenceOptimizations.js";
import { isDefined } from "../../../../base/common/types.js";
import { groupAdjacentBy } from "../../../../base/common/arrays.js";
import { softAssert } from "../../../../base/common/assert.js";
let DiffEditorViewModel = class extends Disposable {
  constructor(model, _options, _diffProviderFactoryService) {
    super();
    this.model = model;
    this._options = _options;
    this._diffProviderFactoryService = _diffProviderFactoryService;
    this._isDiffUpToDate = observableValue(this, false);
    this.isDiffUpToDate = this._isDiffUpToDate;
    this._diff = observableValue(this, void 0);
    this.diff = this._diff;
    this._unchangedRegions = observableValue(this, void 0);
    this.unchangedRegions = derived(
      this,
      (r) => {
        if (this._options.hideUnchangedRegions.read(r)) {
          return this._unchangedRegions.read(r)?.regions ?? [];
        } else {
          transaction((tx) => {
            for (const r2 of this._unchangedRegions.read(void 0)?.regions || []) {
              r2.collapseAll(tx);
            }
          });
          return [];
        }
      }
    );
    this.movedTextToCompare = observableValue(this, void 0);
    this._activeMovedText = observableValue(this, void 0);
    this._hoveredMovedText = observableValue(this, void 0);
    this.activeMovedText = derived(this, (r) => this.movedTextToCompare.read(r) ?? this._hoveredMovedText.read(r) ?? this._activeMovedText.read(r));
    this._cancellationTokenSource = new CancellationTokenSource();
    this._diffProvider = derived(this, (reader) => {
      const diffProvider = this._diffProviderFactoryService.createDiffProvider({
        diffAlgorithm: this._options.diffAlgorithm.read(reader)
      });
      const onChangeSignal = observableSignalFromEvent("onDidChange", diffProvider.onDidChange);
      return {
        diffProvider,
        onChangeSignal
      };
    });
    this._register(toDisposable(() => this._cancellationTokenSource.cancel()));
    const contentChangedSignal = observableSignal("contentChangedSignal");
    const debouncer = this._register(new RunOnceScheduler(() => contentChangedSignal.trigger(void 0), 200));
    this._register(autorun((reader) => {
      const lastUnchangedRegions = this._unchangedRegions.read(reader);
      if (!lastUnchangedRegions || lastUnchangedRegions.regions.some((r) => r.isDragged.read(reader))) {
        return;
      }
      const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds.map((id) => model.original.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
      const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds.map((id) => model.modified.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
      const updatedLastUnchangedRegions = lastUnchangedRegions.regions.map((r, idx) => !lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx] ? void 0 : new UnchangedRegion(
        lastUnchangedRegionsOrigRanges[idx].startLineNumber,
        lastUnchangedRegionsModRanges[idx].startLineNumber,
        lastUnchangedRegionsOrigRanges[idx].length,
        r.visibleLineCountTop.read(reader),
        r.visibleLineCountBottom.read(reader)
      )).filter(isDefined);
      const newRanges = [];
      let didChange = false;
      for (const touching of groupAdjacentBy(updatedLastUnchangedRegions, (a, b) => a.getHiddenModifiedRange(reader).endLineNumberExclusive === b.getHiddenModifiedRange(reader).startLineNumber)) {
        if (touching.length > 1) {
          didChange = true;
          const sumLineCount = touching.reduce((sum, r2) => sum + r2.lineCount, 0);
          const r = new UnchangedRegion(touching[0].originalLineNumber, touching[0].modifiedLineNumber, sumLineCount, touching[0].visibleLineCountTop.read(void 0), touching[touching.length - 1].visibleLineCountBottom.read(void 0));
          newRanges.push(r);
        } else {
          newRanges.push(touching[0]);
        }
      }
      if (didChange) {
        const originalDecorationIds = model.original.deltaDecorations(
          lastUnchangedRegions.originalDecorationIds,
          newRanges.map((r) => ({ range: r.originalUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
        );
        const modifiedDecorationIds = model.modified.deltaDecorations(
          lastUnchangedRegions.modifiedDecorationIds,
          newRanges.map((r) => ({ range: r.modifiedUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
        );
        transaction((tx) => {
          this._unchangedRegions.set(
            {
              regions: newRanges,
              originalDecorationIds,
              modifiedDecorationIds
            },
            tx
          );
        });
      }
    }));
    const updateUnchangedRegions = (result, tx, reader) => {
      const newUnchangedRegions = UnchangedRegion.fromDiffs(
        result.changes,
        model.original.getLineCount(),
        model.modified.getLineCount(),
        this._options.hideUnchangedRegionsMinimumLineCount.read(reader),
        this._options.hideUnchangedRegionsContextLineCount.read(reader)
      );
      let visibleRegions = void 0;
      const lastUnchangedRegions = this._unchangedRegions.get();
      if (lastUnchangedRegions) {
        const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds.map((id) => model.original.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
        const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds.map((id) => model.modified.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
        const updatedLastUnchangedRegions = filterWithPrevious(
          lastUnchangedRegions.regions.map(
            (r, idx) => {
              if (!lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx]) {
                return void 0;
              }
              const length = lastUnchangedRegionsOrigRanges[idx].length;
              return new UnchangedRegion(
                lastUnchangedRegionsOrigRanges[idx].startLineNumber,
                lastUnchangedRegionsModRanges[idx].startLineNumber,
                length,
                // The visible area can shrink by edits -> we have to account for this
                Math.min(r.visibleLineCountTop.get(), length),
                Math.min(r.visibleLineCountBottom.get(), length - r.visibleLineCountTop.get())
              );
            }
          ).filter(isDefined),
          (cur, prev) => !prev || cur.modifiedLineNumber >= prev.modifiedLineNumber + prev.lineCount && cur.originalLineNumber >= prev.originalLineNumber + prev.lineCount
        );
        let hiddenRegions = updatedLastUnchangedRegions.map((r) => new LineRangeMapping(r.getHiddenOriginalRange(reader), r.getHiddenModifiedRange(reader)));
        hiddenRegions = LineRangeMapping.clip(hiddenRegions, LineRange.ofLength(1, model.original.getLineCount()), LineRange.ofLength(1, model.modified.getLineCount()));
        visibleRegions = LineRangeMapping.inverse(hiddenRegions, model.original.getLineCount(), model.modified.getLineCount());
      }
      const newUnchangedRegions2 = [];
      if (visibleRegions) {
        for (const r of newUnchangedRegions) {
          const intersecting = visibleRegions.filter((f) => f.original.intersectsStrict(r.originalUnchangedRange) && f.modified.intersectsStrict(r.modifiedUnchangedRange));
          newUnchangedRegions2.push(...r.setVisibleRanges(intersecting, tx));
        }
      } else {
        newUnchangedRegions2.push(...newUnchangedRegions);
      }
      const originalDecorationIds = model.original.deltaDecorations(
        lastUnchangedRegions?.originalDecorationIds || [],
        newUnchangedRegions2.map((r) => ({ range: r.originalUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
      );
      const modifiedDecorationIds = model.modified.deltaDecorations(
        lastUnchangedRegions?.modifiedDecorationIds || [],
        newUnchangedRegions2.map((r) => ({ range: r.modifiedUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
      );
      this._unchangedRegions.set(
        {
          regions: newUnchangedRegions2,
          originalDecorationIds,
          modifiedDecorationIds
        },
        tx
      );
    };
    this._register(model.modified.onDidChangeContent((e) => {
      const diff = this._diff.get();
      if (diff) {
        const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
        const result = applyModifiedEdits(this._lastDiff, textEdits, model.original, model.modified);
        if (result) {
          this._lastDiff = result;
          transaction((tx) => {
            this._diff.set(DiffState.fromDiffResult(this._lastDiff), tx);
            updateUnchangedRegions(result, tx);
            const currentSyncedMovedText = this.movedTextToCompare.get();
            this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find((m) => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : void 0, tx);
          });
        }
      }
      this._isDiffUpToDate.set(false, void 0);
      debouncer.schedule();
    }));
    this._register(model.original.onDidChangeContent((e) => {
      const diff = this._diff.get();
      if (diff) {
        const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
        const result = applyOriginalEdits(this._lastDiff, textEdits, model.original, model.modified);
        if (result) {
          this._lastDiff = result;
          transaction((tx) => {
            this._diff.set(DiffState.fromDiffResult(this._lastDiff), tx);
            updateUnchangedRegions(result, tx);
            const currentSyncedMovedText = this.movedTextToCompare.get();
            this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find((m) => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : void 0, tx);
          });
        }
      }
      this._isDiffUpToDate.set(false, void 0);
      debouncer.schedule();
    }));
    this._register(autorun(async (reader) => {
      const store = reader.store;
      this._options.hideUnchangedRegionsMinimumLineCount.read(reader);
      this._options.hideUnchangedRegionsContextLineCount.read(reader);
      debouncer.cancel();
      contentChangedSignal.read(reader);
      const documentDiffProvider = this._diffProvider.read(reader);
      documentDiffProvider.onChangeSignal.read(reader);
      readHotReloadableExport(DefaultLinesDiffComputer, reader);
      readHotReloadableExport(optimizeSequenceDiffs, reader);
      this._isDiffUpToDate.set(false, void 0);
      let originalTextEditInfos = [];
      store.add(model.original.onDidChangeContent((e) => {
        const edits = TextEditInfo.fromModelContentChanges(e.changes);
        originalTextEditInfos = combineTextEditInfos(originalTextEditInfos, edits);
      }));
      let modifiedTextEditInfos = [];
      store.add(model.modified.onDidChangeContent((e) => {
        const edits = TextEditInfo.fromModelContentChanges(e.changes);
        modifiedTextEditInfos = combineTextEditInfos(modifiedTextEditInfos, edits);
      }));
      let result = await documentDiffProvider.diffProvider.computeDiff(model.original, model.modified, {
        ignoreTrimWhitespace: this._options.ignoreTrimWhitespace.read(reader),
        maxComputationTimeMs: this._options.maxComputationTimeMs.read(reader),
        computeMoves: this._options.showMoves.read(reader)
      }, this._cancellationTokenSource.token).catch(rejectIfNotCanceled);
      if (!result || this._cancellationTokenSource.token.isCancellationRequested) {
        return;
      }
      if (model.original.isDisposed() || model.modified.isDisposed()) {
        return;
      }
      result = normalizeDocumentDiff(result, model.original, model.modified);
      result = applyOriginalEdits(result, originalTextEditInfos, model.original, model.modified) ?? result;
      result = applyModifiedEdits(result, modifiedTextEditInfos, model.original, model.modified) ?? result;
      transaction((tx) => {
        updateUnchangedRegions(result, tx);
        this._lastDiff = result;
        const state = DiffState.fromDiffResult(result);
        this._diff.set(state, tx);
        this._isDiffUpToDate.set(true, tx);
        const currentSyncedMovedText = this.movedTextToCompare.read(void 0);
        this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find((m) => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : void 0, tx);
      });
    }));
  }
  setActiveMovedText(movedText) {
    this._activeMovedText.set(movedText, void 0);
  }
  setHoveredMovedText(movedText) {
    this._hoveredMovedText.set(movedText, void 0);
  }
  ensureModifiedLineIsVisible(lineNumber, preference, tx) {
    if (this.diff.get()?.mappings.length === 0) {
      return;
    }
    const unchangedRegions = this._unchangedRegions.get()?.regions || [];
    for (const r of unchangedRegions) {
      if (r.getHiddenModifiedRange(void 0).contains(lineNumber)) {
        r.showModifiedLine(lineNumber, preference, tx);
        return;
      }
    }
  }
  ensureOriginalLineIsVisible(lineNumber, preference, tx) {
    if (this.diff.get()?.mappings.length === 0) {
      return;
    }
    const unchangedRegions = this._unchangedRegions.get()?.regions || [];
    for (const r of unchangedRegions) {
      if (r.getHiddenOriginalRange(void 0).contains(lineNumber)) {
        r.showOriginalLine(lineNumber, preference, tx);
        return;
      }
    }
  }
  async waitForDiff() {
    await waitForState(this.isDiffUpToDate, (s) => s, void 0, this._cancellationTokenSource.token).catch(rejectIfNotCanceled);
  }
  serializeState() {
    const regions = this._unchangedRegions.get();
    return {
      collapsedRegions: regions?.regions.map((r) => ({ range: r.getHiddenModifiedRange(void 0).serialize() }))
    };
  }
  restoreSerializedState(state) {
    const ranges = state.collapsedRegions?.map((r) => LineRange.deserialize(r.range));
    const regions = this._unchangedRegions.get();
    if (!regions || !ranges) {
      return;
    }
    transaction((tx) => {
      for (const r of regions.regions) {
        for (const range of ranges) {
          if (r.modifiedUnchangedRange.intersect(range)) {
            r.setHiddenModifiedRange(range, tx);
            break;
          }
        }
      }
    });
  }
};
DiffEditorViewModel = __decorateClass([
  __decorateParam(2, IDiffProviderFactoryService)
], DiffEditorViewModel);
function normalizeDocumentDiff(diff, original, modified) {
  return {
    changes: diff.changes.map((c) => new DetailedLineRangeMapping(
      c.original,
      c.modified,
      c.innerChanges ? c.innerChanges.map((i) => normalizeRangeMapping(i, original, modified)) : void 0
    )),
    moves: diff.moves,
    identical: diff.identical,
    quitEarly: diff.quitEarly
  };
}
function normalizeRangeMapping(rangeMapping, original, modified) {
  let originalRange = rangeMapping.originalRange;
  let modifiedRange = rangeMapping.modifiedRange;
  if (originalRange.startColumn === 1 && modifiedRange.startColumn === 1 && (originalRange.endColumn !== 1 || modifiedRange.endColumn !== 1) && originalRange.endColumn === original.getLineMaxColumn(originalRange.endLineNumber) && modifiedRange.endColumn === modified.getLineMaxColumn(modifiedRange.endLineNumber) && originalRange.endLineNumber < original.getLineCount() && modifiedRange.endLineNumber < modified.getLineCount()) {
    originalRange = originalRange.setEndPosition(originalRange.endLineNumber + 1, 1);
    modifiedRange = modifiedRange.setEndPosition(modifiedRange.endLineNumber + 1, 1);
  }
  return new RangeMapping(originalRange, modifiedRange);
}
class DiffState {
  constructor(mappings, movedTexts, identical, quitEarly) {
    this.mappings = mappings;
    this.movedTexts = movedTexts;
    this.identical = identical;
    this.quitEarly = quitEarly;
  }
  static fromDiffResult(result) {
    return new DiffState(
      result.changes.map((c) => new DiffMapping(c)),
      result.moves || [],
      result.identical,
      result.quitEarly
    );
  }
}
class DiffMapping {
  constructor(lineRangeMapping) {
    this.lineRangeMapping = lineRangeMapping;
  }
}
class UnchangedRegion {
  constructor(originalLineNumber, modifiedLineNumber, lineCount, visibleLineCountTop, visibleLineCountBottom) {
    this.originalLineNumber = originalLineNumber;
    this.modifiedLineNumber = modifiedLineNumber;
    this.lineCount = lineCount;
    this._visibleLineCountTop = observableValue(this, 0);
    this.visibleLineCountTop = this._visibleLineCountTop;
    this._visibleLineCountBottom = observableValue(this, 0);
    this.visibleLineCountBottom = this._visibleLineCountBottom;
    this._shouldHideControls = derived(this, (reader) => (
      /** @description isVisible */
      this.visibleLineCountTop.read(reader) + this.visibleLineCountBottom.read(reader) === this.lineCount && !this.isDragged.read(reader)
    ));
    this.isDragged = observableValue(this, void 0);
    const visibleLineCountTop2 = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
    const visibleLineCountBottom2 = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);
    softAssert(visibleLineCountTop === visibleLineCountTop2);
    softAssert(visibleLineCountBottom === visibleLineCountBottom2);
    this._visibleLineCountTop.set(visibleLineCountTop2, void 0);
    this._visibleLineCountBottom.set(visibleLineCountBottom2, void 0);
  }
  static fromDiffs(changes, originalLineCount, modifiedLineCount, minHiddenLineCount, minContext) {
    const inversedMappings = DetailedLineRangeMapping.inverse(changes, originalLineCount, modifiedLineCount);
    const result = [];
    for (const mapping of inversedMappings) {
      let origStart = mapping.original.startLineNumber;
      let modStart = mapping.modified.startLineNumber;
      let length = mapping.original.length;
      const atStart = origStart === 1 && modStart === 1;
      const atEnd = origStart + length === originalLineCount + 1 && modStart + length === modifiedLineCount + 1;
      if ((atStart || atEnd) && length >= minContext + minHiddenLineCount) {
        if (atStart && !atEnd) {
          length -= minContext;
        }
        if (atEnd && !atStart) {
          origStart += minContext;
          modStart += minContext;
          length -= minContext;
        }
        result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
      } else if (length >= minContext * 2 + minHiddenLineCount) {
        origStart += minContext;
        modStart += minContext;
        length -= minContext * 2;
        result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
      }
    }
    return result;
  }
  get originalUnchangedRange() {
    return LineRange.ofLength(this.originalLineNumber, this.lineCount);
  }
  get modifiedUnchangedRange() {
    return LineRange.ofLength(this.modifiedLineNumber, this.lineCount);
  }
  setVisibleRanges(visibleRanges, tx) {
    const result = [];
    const hiddenModified = new LineRangeSet(visibleRanges.map((r) => r.modified)).subtractFrom(this.modifiedUnchangedRange);
    let originalStartLineNumber = this.originalLineNumber;
    let modifiedStartLineNumber = this.modifiedLineNumber;
    const modifiedEndLineNumberEx = this.modifiedLineNumber + this.lineCount;
    if (hiddenModified.ranges.length === 0) {
      this.showAll(tx);
      result.push(this);
    } else {
      let i = 0;
      for (const r of hiddenModified.ranges) {
        const isLast = i === hiddenModified.ranges.length - 1;
        i++;
        const length = (isLast ? modifiedEndLineNumberEx : r.endLineNumberExclusive) - modifiedStartLineNumber;
        const newR = new UnchangedRegion(originalStartLineNumber, modifiedStartLineNumber, length, 0, 0);
        newR.setHiddenModifiedRange(r, tx);
        result.push(newR);
        originalStartLineNumber = newR.originalUnchangedRange.endLineNumberExclusive;
        modifiedStartLineNumber = newR.modifiedUnchangedRange.endLineNumberExclusive;
      }
    }
    return result;
  }
  shouldHideControls(reader) {
    return this._shouldHideControls.read(reader);
  }
  getHiddenOriginalRange(reader) {
    return LineRange.ofLength(
      this.originalLineNumber + this._visibleLineCountTop.read(reader),
      this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader)
    );
  }
  getHiddenModifiedRange(reader) {
    return LineRange.ofLength(
      this.modifiedLineNumber + this._visibleLineCountTop.read(reader),
      this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader)
    );
  }
  setHiddenModifiedRange(range, tx) {
    const visibleLineCountTop = range.startLineNumber - this.modifiedLineNumber;
    const visibleLineCountBottom = this.modifiedLineNumber + this.lineCount - range.endLineNumberExclusive;
    this.setState(visibleLineCountTop, visibleLineCountBottom, tx);
  }
  getMaxVisibleLineCountTop() {
    return this.lineCount - this._visibleLineCountBottom.get();
  }
  getMaxVisibleLineCountBottom() {
    return this.lineCount - this._visibleLineCountTop.get();
  }
  showMoreAbove(count = 10, tx) {
    const maxVisibleLineCountTop = this.getMaxVisibleLineCountTop();
    this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + count, maxVisibleLineCountTop), tx);
  }
  showMoreBelow(count = 10, tx) {
    const maxVisibleLineCountBottom = this.lineCount - this._visibleLineCountTop.get();
    this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + count, maxVisibleLineCountBottom), tx);
  }
  showAll(tx) {
    this._visibleLineCountBottom.set(this.lineCount - this._visibleLineCountTop.get(), tx);
  }
  showModifiedLine(lineNumber, preference, tx) {
    const top = lineNumber + 1 - (this.modifiedLineNumber + this._visibleLineCountTop.get());
    const bottom = this.modifiedLineNumber - this._visibleLineCountBottom.get() + this.lineCount - lineNumber;
    if (preference === 0 /* FromCloserSide */ && top < bottom || preference === 1 /* FromTop */) {
      this._visibleLineCountTop.set(this._visibleLineCountTop.get() + top, tx);
    } else {
      this._visibleLineCountBottom.set(this._visibleLineCountBottom.get() + bottom, tx);
    }
  }
  showOriginalLine(lineNumber, preference, tx) {
    const top = lineNumber - this.originalLineNumber;
    const bottom = this.originalLineNumber + this.lineCount - lineNumber;
    if (preference === 0 /* FromCloserSide */ && top < bottom || preference === 1 /* FromTop */) {
      this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + bottom - top, this.getMaxVisibleLineCountTop()), tx);
    } else {
      this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + top - bottom, this.getMaxVisibleLineCountBottom()), tx);
    }
  }
  collapseAll(tx) {
    this._visibleLineCountTop.set(0, tx);
    this._visibleLineCountBottom.set(0, tx);
  }
  setState(visibleLineCountTop, visibleLineCountBottom, tx) {
    visibleLineCountTop = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
    visibleLineCountBottom = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);
    this._visibleLineCountTop.set(visibleLineCountTop, tx);
    this._visibleLineCountBottom.set(visibleLineCountBottom, tx);
  }
}
var RevealPreference = /* @__PURE__ */ ((RevealPreference2) => {
  RevealPreference2[RevealPreference2["FromCloserSide"] = 0] = "FromCloserSide";
  RevealPreference2[RevealPreference2["FromTop"] = 1] = "FromTop";
  RevealPreference2[RevealPreference2["FromBottom"] = 2] = "FromBottom";
  return RevealPreference2;
})(RevealPreference || {});
function applyOriginalEdits(diff, textEdits, originalTextModel, modifiedTextModel) {
  return void 0;
}
function applyModifiedEdits(diff, textEdits, originalTextModel, modifiedTextModel) {
  return void 0;
}
export {
  DiffEditorViewModel,
  DiffMapping,
  DiffState,
  RevealPreference,
  UnchangedRegion
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZFZGl0b3JWaWV3TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZWplY3RJZk5vdENhbmNlbGVkLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24sIGF1dG9ydW4sIGRlcml2ZWQsIG9ic2VydmFibGVTaWduYWwsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24sIHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSURpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi9kaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBmaWx0ZXJXaXRoUHJldmlvdXMgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaG90UmVsb2FkSGVscGVycy5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZExpbmVSYW5nZSwgTGluZVJhbmdlLCBMaW5lUmFuZ2VTZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IERlZmF1bHRMaW5lc0RpZmZDb21wdXRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL2RlZmF1bHRMaW5lc0RpZmZDb21wdXRlci9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSURvY3VtZW50RGlmZiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE1vdmVkVGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZywgTGluZVJhbmdlTWFwcGluZywgUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yTW9kZWwsIElEaWZmRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRFZGl0SW5mbyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9icmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0L2JyYWNrZXRQYWlyc1RyZWUvYmVmb3JlRWRpdFBvc2l0aW9uTWFwcGVyLmpzJztcbmltcG9ydCB7IGNvbWJpbmVUZXh0RWRpdEluZm9zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvYnJhY2tldFBhaXJzVHJlZS9jb21iaW5lVGV4dEVkaXRJbmZvcy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4vZGlmZkVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgb3B0aW1pemVTZXF1ZW5jZURpZmZzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyL2hldXJpc3RpY1NlcXVlbmNlT3B0aW1pemF0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBncm91cEFkamFjZW50QnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgc29mdEFzc2VydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEaWZmRWRpdG9yVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEaWZmRWRpdG9yVmlld01vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNEaWZmVXBUb0RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNEaWZmVXBUb0RhdGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faXNEaWZmVXBUb0RhdGU7XG5cblx0cHJpdmF0ZSBfbGFzdERpZmY6IElEb2N1bWVudERpZmYgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZmYgPSBvYnNlcnZhYmxlVmFsdWU8RGlmZlN0YXRlIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwdWJsaWMgcmVhZG9ubHkgZGlmZjogSU9ic2VydmFibGU8RGlmZlN0YXRlIHwgdW5kZWZpbmVkPiA9IHRoaXMuX2RpZmY7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdW5jaGFuZ2VkUmVnaW9ucyA9IG9ic2VydmFibGVWYWx1ZTx7IHJlZ2lvbnM6IFVuY2hhbmdlZFJlZ2lvbltdOyBvcmlnaW5hbERlY29yYXRpb25JZHM6IHN0cmluZ1tdOyBtb2RpZmllZERlY29yYXRpb25JZHM6IHN0cmluZ1tdIH0gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHB1YmxpYyByZWFkb25seSB1bmNoYW5nZWRSZWdpb25zOiBJT2JzZXJ2YWJsZTxVbmNoYW5nZWRSZWdpb25bXT4gPSBkZXJpdmVkKHRoaXMsIHIgPT4ge1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLmhpZGVVbmNoYW5nZWRSZWdpb25zLnJlYWQocikpIHtcblx0XHRcdHJldHVybiB0aGlzLl91bmNoYW5nZWRSZWdpb25zLnJlYWQocik/LnJlZ2lvbnMgPz8gW107XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFJlc2V0IHN0YXRlXG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgciBvZiB0aGlzLl91bmNoYW5nZWRSZWdpb25zLnJlYWQodW5kZWZpbmVkKT8ucmVnaW9ucyB8fCBbXSkge1xuXHRcdFx0XHRcdHIuY29sbGFwc2VBbGwodHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblx0KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbW92ZWRUZXh0VG9Db21wYXJlID0gb2JzZXJ2YWJsZVZhbHVlPE1vdmVkVGV4dCB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVNb3ZlZFRleHQgPSBvYnNlcnZhYmxlVmFsdWU8TW92ZWRUZXh0IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlcmVkTW92ZWRUZXh0ID0gb2JzZXJ2YWJsZVZhbHVlPE1vdmVkVGV4dCB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXG5cdHB1YmxpYyByZWFkb25seSBhY3RpdmVNb3ZlZFRleHQgPSBkZXJpdmVkKHRoaXMsIHIgPT4gdGhpcy5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyKSA/PyB0aGlzLl9ob3ZlcmVkTW92ZWRUZXh0LnJlYWQocikgPz8gdGhpcy5fYWN0aXZlTW92ZWRUZXh0LnJlYWQocikpO1xuXG5cdHB1YmxpYyBzZXRBY3RpdmVNb3ZlZFRleHQobW92ZWRUZXh0OiBNb3ZlZFRleHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVNb3ZlZFRleHQuc2V0KG1vdmVkVGV4dCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRIb3ZlcmVkTW92ZWRUZXh0KG1vdmVkVGV4dDogTW92ZWRUZXh0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5faG92ZXJlZE1vdmVkVGV4dC5zZXQobW92ZWRUZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmUHJvdmlkZXIgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgZGlmZlByb3ZpZGVyID0gdGhpcy5fZGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UuY3JlYXRlRGlmZlByb3ZpZGVyKHtcblx0XHRcdGRpZmZBbGdvcml0aG06IHRoaXMuX29wdGlvbnMuZGlmZkFsZ29yaXRobS5yZWFkKHJlYWRlcilcblx0XHR9KTtcblx0XHRjb25zdCBvbkNoYW5nZVNpZ25hbCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQoJ29uRGlkQ2hhbmdlJywgZGlmZlByb3ZpZGVyLm9uRGlkQ2hhbmdlKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlmZlByb3ZpZGVyLFxuXHRcdFx0b25DaGFuZ2VTaWduYWwsXG5cdFx0fTtcblx0fSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGVsOiBJRGlmZkVkaXRvck1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IERpZmZFZGl0b3JPcHRpb25zLFxuXHRcdEBJRGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2U6IElEaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKSkpO1xuXG5cdFx0Y29uc3QgY29udGVudENoYW5nZWRTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKCdjb250ZW50Q2hhbmdlZFNpZ25hbCcpO1xuXHRcdGNvbnN0IGRlYm91bmNlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IGNvbnRlbnRDaGFuZ2VkU2lnbmFsLnRyaWdnZXIodW5kZWZpbmVkKSwgMjAwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGNvbGxhcHNlIHRvdWNoaW5nIHVuY2hhbmdlZCByYW5nZXMgKi9cblxuXHRcdFx0Y29uc3QgbGFzdFVuY2hhbmdlZFJlZ2lvbnMgPSB0aGlzLl91bmNoYW5nZWRSZWdpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGFzdFVuY2hhbmdlZFJlZ2lvbnMgfHwgbGFzdFVuY2hhbmdlZFJlZ2lvbnMucmVnaW9ucy5zb21lKHIgPT4gci5pc0RyYWdnZWQucmVhZChyZWFkZXIpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxhc3RVbmNoYW5nZWRSZWdpb25zT3JpZ1JhbmdlcyA9IGxhc3RVbmNoYW5nZWRSZWdpb25zLm9yaWdpbmFsRGVjb3JhdGlvbklkc1xuXHRcdFx0XHQubWFwKGlkID0+IG1vZGVsLm9yaWdpbmFsLmdldERlY29yYXRpb25SYW5nZShpZCkpXG5cdFx0XHRcdC5tYXAociA9PiByID8gTGluZVJhbmdlLmZyb21SYW5nZUluY2x1c2l2ZShyKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBsYXN0VW5jaGFuZ2VkUmVnaW9uc01vZFJhbmdlcyA9IGxhc3RVbmNoYW5nZWRSZWdpb25zLm1vZGlmaWVkRGVjb3JhdGlvbklkc1xuXHRcdFx0XHQubWFwKGlkID0+IG1vZGVsLm1vZGlmaWVkLmdldERlY29yYXRpb25SYW5nZShpZCkpXG5cdFx0XHRcdC5tYXAociA9PiByID8gTGluZVJhbmdlLmZyb21SYW5nZUluY2x1c2l2ZShyKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB1cGRhdGVkTGFzdFVuY2hhbmdlZFJlZ2lvbnMgPSBsYXN0VW5jaGFuZ2VkUmVnaW9ucy5yZWdpb25zLm1hcCgociwgaWR4KSA9PlxuXHRcdFx0XHQoIWxhc3RVbmNoYW5nZWRSZWdpb25zT3JpZ1Jhbmdlc1tpZHhdIHx8ICFsYXN0VW5jaGFuZ2VkUmVnaW9uc01vZFJhbmdlc1tpZHhdKSA/IHVuZGVmaW5lZCA6XG5cdFx0XHRcdFx0bmV3IFVuY2hhbmdlZFJlZ2lvbihcblx0XHRcdFx0XHRcdGxhc3RVbmNoYW5nZWRSZWdpb25zT3JpZ1Jhbmdlc1tpZHhdLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdGxhc3RVbmNoYW5nZWRSZWdpb25zTW9kUmFuZ2VzW2lkeF0uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnNPcmlnUmFuZ2VzW2lkeF0ubGVuZ3RoLFxuXHRcdFx0XHRcdFx0ci52aXNpYmxlTGluZUNvdW50VG9wLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdHIudmlzaWJsZUxpbmVDb3VudEJvdHRvbS5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0KSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IG5ld1JhbmdlczogVW5jaGFuZ2VkUmVnaW9uW10gPSBbXTtcblxuXHRcdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCB0b3VjaGluZyBvZiBncm91cEFkamFjZW50QnkodXBkYXRlZExhc3RVbmNoYW5nZWRSZWdpb25zLCAoYSwgYikgPT4gYS5nZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHJlYWRlcikuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA9PT0gYi5nZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHJlYWRlcikuc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRpZiAodG91Y2hpbmcubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0Y29uc3Qgc3VtTGluZUNvdW50ID0gdG91Y2hpbmcucmVkdWNlKChzdW0sIHIpID0+IHN1bSArIHIubGluZUNvdW50LCAwKTtcblx0XHRcdFx0XHRjb25zdCByID0gbmV3IFVuY2hhbmdlZFJlZ2lvbih0b3VjaGluZ1swXS5vcmlnaW5hbExpbmVOdW1iZXIsIHRvdWNoaW5nWzBdLm1vZGlmaWVkTGluZU51bWJlciwgc3VtTGluZUNvdW50LCB0b3VjaGluZ1swXS52aXNpYmxlTGluZUNvdW50VG9wLnJlYWQodW5kZWZpbmVkKSwgdG91Y2hpbmdbdG91Y2hpbmcubGVuZ3RoIC0gMV0udmlzaWJsZUxpbmVDb3VudEJvdHRvbS5yZWFkKHVuZGVmaW5lZCkpO1xuXHRcdFx0XHRcdG5ld1Jhbmdlcy5wdXNoKHIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5ld1Jhbmdlcy5wdXNoKHRvdWNoaW5nWzBdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGRpZENoYW5nZSkge1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbERlY29yYXRpb25JZHMgPSBtb2RlbC5vcmlnaW5hbC5kZWx0YURlY29yYXRpb25zKFxuXHRcdFx0XHRcdGxhc3RVbmNoYW5nZWRSZWdpb25zLm9yaWdpbmFsRGVjb3JhdGlvbklkcyxcblx0XHRcdFx0XHRuZXdSYW5nZXMubWFwKHIgPT4gKHsgcmFuZ2U6IHIub3JpZ2luYWxVbmNoYW5nZWRSYW5nZS50b0luY2x1c2l2ZVJhbmdlKCkhLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndW5jaGFuZ2VkJyB9IH0pKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZERlY29yYXRpb25JZHMgPSBtb2RlbC5tb2RpZmllZC5kZWx0YURlY29yYXRpb25zKFxuXHRcdFx0XHRcdGxhc3RVbmNoYW5nZWRSZWdpb25zLm1vZGlmaWVkRGVjb3JhdGlvbklkcyxcblx0XHRcdFx0XHRuZXdSYW5nZXMubWFwKHIgPT4gKHsgcmFuZ2U6IHIubW9kaWZpZWRVbmNoYW5nZWRSYW5nZS50b0luY2x1c2l2ZVJhbmdlKCkhLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndW5jaGFuZ2VkJyB9IH0pKVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHR0aGlzLl91bmNoYW5nZWRSZWdpb25zLnNldChcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0cmVnaW9uczogbmV3UmFuZ2VzLFxuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbERlY29yYXRpb25JZHMsXG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbklkc1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHR4XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlVW5jaGFuZ2VkUmVnaW9ucyA9IChyZXN1bHQ6IElEb2N1bWVudERpZmYsIHR4OiBJVHJhbnNhY3Rpb24sIHJlYWRlcj86IElSZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IG5ld1VuY2hhbmdlZFJlZ2lvbnMgPSBVbmNoYW5nZWRSZWdpb24uZnJvbURpZmZzKFxuXHRcdFx0XHRyZXN1bHQuY2hhbmdlcyxcblx0XHRcdFx0bW9kZWwub3JpZ2luYWwuZ2V0TGluZUNvdW50KCksXG5cdFx0XHRcdG1vZGVsLm1vZGlmaWVkLmdldExpbmVDb3VudCgpLFxuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmhpZGVVbmNoYW5nZWRSZWdpb25zTWluaW11bUxpbmVDb3VudC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnNDb250ZXh0TGluZUNvdW50LnJlYWQocmVhZGVyKSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIFRyYW5zZmVyIHN0YXRlIGZyb20gY3VyIHN0YXRlXG5cdFx0XHRsZXQgdmlzaWJsZVJlZ2lvbnM6IExpbmVSYW5nZU1hcHBpbmdbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgbGFzdFVuY2hhbmdlZFJlZ2lvbnMgPSB0aGlzLl91bmNoYW5nZWRSZWdpb25zLmdldCgpO1xuXHRcdFx0aWYgKGxhc3RVbmNoYW5nZWRSZWdpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RVbmNoYW5nZWRSZWdpb25zT3JpZ1JhbmdlcyA9IGxhc3RVbmNoYW5nZWRSZWdpb25zLm9yaWdpbmFsRGVjb3JhdGlvbklkc1xuXHRcdFx0XHRcdC5tYXAoaWQgPT4gbW9kZWwub3JpZ2luYWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkKSlcblx0XHRcdFx0XHQubWFwKHIgPT4gciA/IExpbmVSYW5nZS5mcm9tUmFuZ2VJbmNsdXNpdmUocikgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBsYXN0VW5jaGFuZ2VkUmVnaW9uc01vZFJhbmdlcyA9IGxhc3RVbmNoYW5nZWRSZWdpb25zLm1vZGlmaWVkRGVjb3JhdGlvbklkc1xuXHRcdFx0XHRcdC5tYXAoaWQgPT4gbW9kZWwubW9kaWZpZWQuZ2V0RGVjb3JhdGlvblJhbmdlKGlkKSlcblx0XHRcdFx0XHQubWFwKHIgPT4gciA/IExpbmVSYW5nZS5mcm9tUmFuZ2VJbmNsdXNpdmUocikgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkTGFzdFVuY2hhbmdlZFJlZ2lvbnMgPSBmaWx0ZXJXaXRoUHJldmlvdXMoXG5cdFx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnMucmVnaW9uc1xuXHRcdFx0XHRcdFx0Lm1hcCgociwgaWR4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghbGFzdFVuY2hhbmdlZFJlZ2lvbnNPcmlnUmFuZ2VzW2lkeF0gfHwgIWxhc3RVbmNoYW5nZWRSZWdpb25zTW9kUmFuZ2VzW2lkeF0pIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRcdFx0XHRjb25zdCBsZW5ndGggPSBsYXN0VW5jaGFuZ2VkUmVnaW9uc09yaWdSYW5nZXNbaWR4XS5sZW5ndGg7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBuZXcgVW5jaGFuZ2VkUmVnaW9uKFxuXHRcdFx0XHRcdFx0XHRcdGxhc3RVbmNoYW5nZWRSZWdpb25zT3JpZ1Jhbmdlc1tpZHhdLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdFx0XHRsYXN0VW5jaGFuZ2VkUmVnaW9uc01vZFJhbmdlc1tpZHhdLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdFx0XHRsZW5ndGgsXG5cdFx0XHRcdFx0XHRcdFx0Ly8gVGhlIHZpc2libGUgYXJlYSBjYW4gc2hyaW5rIGJ5IGVkaXRzIC0+IHdlIGhhdmUgdG8gYWNjb3VudCBmb3IgdGhpc1xuXHRcdFx0XHRcdFx0XHRcdE1hdGgubWluKHIudmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKSwgbGVuZ3RoKSxcblx0XHRcdFx0XHRcdFx0XHRNYXRoLm1pbihyLnZpc2libGVMaW5lQ291bnRCb3R0b20uZ2V0KCksIGxlbmd0aCAtIHIudmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKSksXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQpLmZpbHRlcihpc0RlZmluZWQpLFxuXHRcdFx0XHRcdChjdXIsIHByZXYpID0+ICFwcmV2IHx8IChjdXIubW9kaWZpZWRMaW5lTnVtYmVyID49IHByZXYubW9kaWZpZWRMaW5lTnVtYmVyICsgcHJldi5saW5lQ291bnQgJiYgY3VyLm9yaWdpbmFsTGluZU51bWJlciA+PSBwcmV2Lm9yaWdpbmFsTGluZU51bWJlciArIHByZXYubGluZUNvdW50KVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGxldCBoaWRkZW5SZWdpb25zID0gdXBkYXRlZExhc3RVbmNoYW5nZWRSZWdpb25zLm1hcChyID0+IG5ldyBMaW5lUmFuZ2VNYXBwaW5nKHIuZ2V0SGlkZGVuT3JpZ2luYWxSYW5nZShyZWFkZXIpLCByLmdldEhpZGRlbk1vZGlmaWVkUmFuZ2UocmVhZGVyKSkpO1xuXHRcdFx0XHRoaWRkZW5SZWdpb25zID0gTGluZVJhbmdlTWFwcGluZy5jbGlwKGhpZGRlblJlZ2lvbnMsIExpbmVSYW5nZS5vZkxlbmd0aCgxLCBtb2RlbC5vcmlnaW5hbC5nZXRMaW5lQ291bnQoKSksIExpbmVSYW5nZS5vZkxlbmd0aCgxLCBtb2RlbC5tb2RpZmllZC5nZXRMaW5lQ291bnQoKSkpO1xuXHRcdFx0XHR2aXNpYmxlUmVnaW9ucyA9IExpbmVSYW5nZU1hcHBpbmcuaW52ZXJzZShoaWRkZW5SZWdpb25zLCBtb2RlbC5vcmlnaW5hbC5nZXRMaW5lQ291bnQoKSwgbW9kZWwubW9kaWZpZWQuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXdVbmNoYW5nZWRSZWdpb25zMiA9IFtdO1xuXHRcdFx0aWYgKHZpc2libGVSZWdpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgciBvZiBuZXdVbmNoYW5nZWRSZWdpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW50ZXJzZWN0aW5nID0gdmlzaWJsZVJlZ2lvbnMuZmlsdGVyKGYgPT4gZi5vcmlnaW5hbC5pbnRlcnNlY3RzU3RyaWN0KHIub3JpZ2luYWxVbmNoYW5nZWRSYW5nZSkgJiYgZi5tb2RpZmllZC5pbnRlcnNlY3RzU3RyaWN0KHIubW9kaWZpZWRVbmNoYW5nZWRSYW5nZSkpO1xuXHRcdFx0XHRcdG5ld1VuY2hhbmdlZFJlZ2lvbnMyLnB1c2goLi4uci5zZXRWaXNpYmxlUmFuZ2VzKGludGVyc2VjdGluZywgdHgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bmV3VW5jaGFuZ2VkUmVnaW9uczIucHVzaCguLi5uZXdVbmNoYW5nZWRSZWdpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxEZWNvcmF0aW9uSWRzID0gbW9kZWwub3JpZ2luYWwuZGVsdGFEZWNvcmF0aW9ucyhcblx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnM/Lm9yaWdpbmFsRGVjb3JhdGlvbklkcyB8fCBbXSxcblx0XHRcdFx0bmV3VW5jaGFuZ2VkUmVnaW9uczIubWFwKHIgPT4gKHsgcmFuZ2U6IHIub3JpZ2luYWxVbmNoYW5nZWRSYW5nZS50b0luY2x1c2l2ZVJhbmdlKCkhLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndW5jaGFuZ2VkJyB9IH0pKVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkRGVjb3JhdGlvbklkcyA9IG1vZGVsLm1vZGlmaWVkLmRlbHRhRGVjb3JhdGlvbnMoXG5cdFx0XHRcdGxhc3RVbmNoYW5nZWRSZWdpb25zPy5tb2RpZmllZERlY29yYXRpb25JZHMgfHwgW10sXG5cdFx0XHRcdG5ld1VuY2hhbmdlZFJlZ2lvbnMyLm1hcChyID0+ICh7IHJhbmdlOiByLm1vZGlmaWVkVW5jaGFuZ2VkUmFuZ2UudG9JbmNsdXNpdmVSYW5nZSgpISwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3VuY2hhbmdlZCcgfSB9KSlcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMuX3VuY2hhbmdlZFJlZ2lvbnMuc2V0KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cmVnaW9uczogbmV3VW5jaGFuZ2VkUmVnaW9uczIsXG5cdFx0XHRcdFx0b3JpZ2luYWxEZWNvcmF0aW9uSWRzLFxuXHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbklkc1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0eFxuXHRcdFx0KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwubW9kaWZpZWQub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gdGhpcy5fZGlmZi5nZXQoKTtcblx0XHRcdGlmIChkaWZmKSB7XG5cdFx0XHRcdGNvbnN0IHRleHRFZGl0cyA9IFRleHRFZGl0SW5mby5mcm9tTW9kZWxDb250ZW50Q2hhbmdlcyhlLmNoYW5nZXMpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhcHBseU1vZGlmaWVkRWRpdHModGhpcy5fbGFzdERpZmYhLCB0ZXh0RWRpdHMsIG1vZGVsLm9yaWdpbmFsLCBtb2RlbC5tb2RpZmllZCk7XG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0RGlmZiA9IHJlc3VsdDtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaWZmLnNldChEaWZmU3RhdGUuZnJvbURpZmZSZXN1bHQodGhpcy5fbGFzdERpZmYhKSwgdHgpO1xuXHRcdFx0XHRcdFx0dXBkYXRlVW5jaGFuZ2VkUmVnaW9ucyhyZXN1bHQsIHR4KTtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRTeW5jZWRNb3ZlZFRleHQgPSB0aGlzLm1vdmVkVGV4dFRvQ29tcGFyZS5nZXQoKTtcblx0XHRcdFx0XHRcdHRoaXMubW92ZWRUZXh0VG9Db21wYXJlLnNldChjdXJyZW50U3luY2VkTW92ZWRUZXh0ID8gdGhpcy5fbGFzdERpZmYhLm1vdmVzLmZpbmQobSA9PiBtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaW50ZXJzZWN0KGN1cnJlbnRTeW5jZWRNb3ZlZFRleHQubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZCkpIDogdW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5faXNEaWZmVXBUb0RhdGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0ZGVib3VuY2VyLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9yaWdpbmFsLm9uRGlkQ2hhbmdlQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IHRoaXMuX2RpZmYuZ2V0KCk7XG5cdFx0XHRpZiAoZGlmZikge1xuXHRcdFx0XHRjb25zdCB0ZXh0RWRpdHMgPSBUZXh0RWRpdEluZm8uZnJvbU1vZGVsQ29udGVudENoYW5nZXMoZS5jaGFuZ2VzKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXBwbHlPcmlnaW5hbEVkaXRzKHRoaXMuX2xhc3REaWZmISwgdGV4dEVkaXRzLCBtb2RlbC5vcmlnaW5hbCwgbW9kZWwubW9kaWZpZWQpO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdERpZmYgPSByZXN1bHQ7XG5cdFx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGlmZi5zZXQoRGlmZlN0YXRlLmZyb21EaWZmUmVzdWx0KHRoaXMuX2xhc3REaWZmISksIHR4KTtcblx0XHRcdFx0XHRcdHVwZGF0ZVVuY2hhbmdlZFJlZ2lvbnMocmVzdWx0LCB0eCk7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50U3luY2VkTW92ZWRUZXh0ID0gdGhpcy5tb3ZlZFRleHRUb0NvbXBhcmUuZ2V0KCk7XG5cdFx0XHRcdFx0XHR0aGlzLm1vdmVkVGV4dFRvQ29tcGFyZS5zZXQoY3VycmVudFN5bmNlZE1vdmVkVGV4dCA/IHRoaXMuX2xhc3REaWZmIS5tb3Zlcy5maW5kKG0gPT4gbS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmludGVyc2VjdChjdXJyZW50U3luY2VkTW92ZWRUZXh0LmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQpKSA6IHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2lzRGlmZlVwVG9EYXRlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdGRlYm91bmNlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oYXN5bmMgKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBjb21wdXRlIGRpZmYgKi9cblx0XHRcdGNvbnN0IHN0b3JlID0gcmVhZGVyLnN0b3JlO1xuXG5cdFx0XHQvLyBTbyB0aGF0IHRoZXkgZ2V0IHJlY29tcHV0ZWQgd2hlbiB0aGVzZSBzZXR0aW5ncyBjaGFuZ2Vcblx0XHRcdHRoaXMuX29wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnNNaW5pbXVtTGluZUNvdW50LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX29wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnNDb250ZXh0TGluZUNvdW50LnJlYWQocmVhZGVyKTtcblxuXHRcdFx0ZGVib3VuY2VyLmNhbmNlbCgpO1xuXHRcdFx0Y29udGVudENoYW5nZWRTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZG9jdW1lbnREaWZmUHJvdmlkZXIgPSB0aGlzLl9kaWZmUHJvdmlkZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0ZG9jdW1lbnREaWZmUHJvdmlkZXIub25DaGFuZ2VTaWduYWwucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRyZWFkSG90UmVsb2FkYWJsZUV4cG9ydChEZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIsIHJlYWRlcik7XG5cdFx0XHRyZWFkSG90UmVsb2FkYWJsZUV4cG9ydChvcHRpbWl6ZVNlcXVlbmNlRGlmZnMsIHJlYWRlcik7XG5cblx0XHRcdHRoaXMuX2lzRGlmZlVwVG9EYXRlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0bGV0IG9yaWdpbmFsVGV4dEVkaXRJbmZvczogVGV4dEVkaXRJbmZvW10gPSBbXTtcblx0XHRcdHN0b3JlLmFkZChtb2RlbC5vcmlnaW5hbC5vbkRpZENoYW5nZUNvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdHMgPSBUZXh0RWRpdEluZm8uZnJvbU1vZGVsQ29udGVudENoYW5nZXMoZS5jaGFuZ2VzKTtcblx0XHRcdFx0b3JpZ2luYWxUZXh0RWRpdEluZm9zID0gY29tYmluZVRleHRFZGl0SW5mb3Mob3JpZ2luYWxUZXh0RWRpdEluZm9zLCBlZGl0cyk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGxldCBtb2RpZmllZFRleHRFZGl0SW5mb3M6IFRleHRFZGl0SW5mb1tdID0gW107XG5cdFx0XHRzdG9yZS5hZGQobW9kZWwubW9kaWZpZWQub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRzID0gVGV4dEVkaXRJbmZvLmZyb21Nb2RlbENvbnRlbnRDaGFuZ2VzKGUuY2hhbmdlcyk7XG5cdFx0XHRcdG1vZGlmaWVkVGV4dEVkaXRJbmZvcyA9IGNvbWJpbmVUZXh0RWRpdEluZm9zKG1vZGlmaWVkVGV4dEVkaXRJbmZvcywgZWRpdHMpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgZG9jdW1lbnREaWZmUHJvdmlkZXIuZGlmZlByb3ZpZGVyLmNvbXB1dGVEaWZmKG1vZGVsLm9yaWdpbmFsLCBtb2RlbC5tb2RpZmllZCwge1xuXHRcdFx0XHRpZ25vcmVUcmltV2hpdGVzcGFjZTogdGhpcy5fb3B0aW9ucy5pZ25vcmVUcmltV2hpdGVzcGFjZS5yZWFkKHJlYWRlciksXG5cdFx0XHRcdG1heENvbXB1dGF0aW9uVGltZU1zOiB0aGlzLl9vcHRpb25zLm1heENvbXB1dGF0aW9uVGltZU1zLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0Y29tcHV0ZU1vdmVzOiB0aGlzLl9vcHRpb25zLnNob3dNb3Zlcy5yZWFkKHJlYWRlciksXG5cdFx0XHR9LCB0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbikuY2F0Y2gocmVqZWN0SWZOb3RDYW5jZWxlZCk7XG5cblx0XHRcdGlmICghcmVzdWx0IHx8IHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RlbC5vcmlnaW5hbC5pc0Rpc3Bvc2VkKCkgfHwgbW9kZWwubW9kaWZpZWQuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdC8vIFRPRE9AaGVkaWV0IGZpc2h5P1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQgPSBub3JtYWxpemVEb2N1bWVudERpZmYocmVzdWx0LCBtb2RlbC5vcmlnaW5hbCwgbW9kZWwubW9kaWZpZWQpO1xuXHRcdFx0cmVzdWx0ID0gYXBwbHlPcmlnaW5hbEVkaXRzKHJlc3VsdCwgb3JpZ2luYWxUZXh0RWRpdEluZm9zLCBtb2RlbC5vcmlnaW5hbCwgbW9kZWwubW9kaWZpZWQpID8/IHJlc3VsdDtcblx0XHRcdHJlc3VsdCA9IGFwcGx5TW9kaWZpZWRFZGl0cyhyZXN1bHQsIG1vZGlmaWVkVGV4dEVkaXRJbmZvcywgbW9kZWwub3JpZ2luYWwsIG1vZGVsLm1vZGlmaWVkKSA/PyByZXN1bHQ7XG5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB3cml0ZSBkaWZmIHJlc3VsdCAqL1xuXHRcdFx0XHR1cGRhdGVVbmNoYW5nZWRSZWdpb25zKHJlc3VsdCwgdHgpO1xuXG5cdFx0XHRcdHRoaXMuX2xhc3REaWZmID0gcmVzdWx0O1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IERpZmZTdGF0ZS5mcm9tRGlmZlJlc3VsdChyZXN1bHQpO1xuXHRcdFx0XHR0aGlzLl9kaWZmLnNldChzdGF0ZSwgdHgpO1xuXHRcdFx0XHR0aGlzLl9pc0RpZmZVcFRvRGF0ZS5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50U3luY2VkTW92ZWRUZXh0ID0gdGhpcy5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLm1vdmVkVGV4dFRvQ29tcGFyZS5zZXQoY3VycmVudFN5bmNlZE1vdmVkVGV4dCA/IHRoaXMuX2xhc3REaWZmLm1vdmVzLmZpbmQobSA9PiBtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaW50ZXJzZWN0KGN1cnJlbnRTeW5jZWRNb3ZlZFRleHQubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZCkpIDogdW5kZWZpbmVkLCB0eCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZW5zdXJlTW9kaWZpZWRMaW5lSXNWaXNpYmxlKGxpbmVOdW1iZXI6IG51bWJlciwgcHJlZmVyZW5jZTogUmV2ZWFsUHJlZmVyZW5jZSwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpZmYuZ2V0KCk/Lm1hcHBpbmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1bmNoYW5nZWRSZWdpb25zID0gdGhpcy5fdW5jaGFuZ2VkUmVnaW9ucy5nZXQoKT8ucmVnaW9ucyB8fCBbXTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdW5jaGFuZ2VkUmVnaW9ucykge1xuXHRcdFx0aWYgKHIuZ2V0SGlkZGVuTW9kaWZpZWRSYW5nZSh1bmRlZmluZWQpLmNvbnRhaW5zKGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdHIuc2hvd01vZGlmaWVkTGluZShsaW5lTnVtYmVyLCBwcmVmZXJlbmNlLCB0eCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZW5zdXJlT3JpZ2luYWxMaW5lSXNWaXNpYmxlKGxpbmVOdW1iZXI6IG51bWJlciwgcHJlZmVyZW5jZTogUmV2ZWFsUHJlZmVyZW5jZSwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpZmYuZ2V0KCk/Lm1hcHBpbmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1bmNoYW5nZWRSZWdpb25zID0gdGhpcy5fdW5jaGFuZ2VkUmVnaW9ucy5nZXQoKT8ucmVnaW9ucyB8fCBbXTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdW5jaGFuZ2VkUmVnaW9ucykge1xuXHRcdFx0aWYgKHIuZ2V0SGlkZGVuT3JpZ2luYWxSYW5nZSh1bmRlZmluZWQpLmNvbnRhaW5zKGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdHIuc2hvd09yaWdpbmFsTGluZShsaW5lTnVtYmVyLCBwcmVmZXJlbmNlLCB0eCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgd2FpdEZvckRpZmYoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHRoaXMuaXNEaWZmVXBUb0RhdGUsIHMgPT4gcywgdW5kZWZpbmVkLCB0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbikuY2F0Y2gocmVqZWN0SWZOb3RDYW5jZWxlZCk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplU3RhdGUoKTogU2VyaWFsaXplZFN0YXRlIHtcblx0XHRjb25zdCByZWdpb25zID0gdGhpcy5fdW5jaGFuZ2VkUmVnaW9ucy5nZXQoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29sbGFwc2VkUmVnaW9uczogcmVnaW9ucz8ucmVnaW9ucy5tYXAociA9PiAoeyByYW5nZTogci5nZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHVuZGVmaW5lZCkuc2VyaWFsaXplKCkgfSkpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlU2VyaWFsaXplZFN0YXRlKHN0YXRlOiBTZXJpYWxpemVkU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCByYW5nZXMgPSBzdGF0ZS5jb2xsYXBzZWRSZWdpb25zPy5tYXAociA9PiBMaW5lUmFuZ2UuZGVzZXJpYWxpemUoci5yYW5nZSkpO1xuXHRcdGNvbnN0IHJlZ2lvbnMgPSB0aGlzLl91bmNoYW5nZWRSZWdpb25zLmdldCgpO1xuXHRcdGlmICghcmVnaW9ucyB8fCAhcmFuZ2VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdGZvciAoY29uc3QgciBvZiByZWdpb25zLnJlZ2lvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiByYW5nZXMpIHtcblx0XHRcdFx0XHRpZiAoci5tb2RpZmllZFVuY2hhbmdlZFJhbmdlLmludGVyc2VjdChyYW5nZSkpIHtcblx0XHRcdFx0XHRcdHIuc2V0SGlkZGVuTW9kaWZpZWRSYW5nZShyYW5nZSwgdHgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplRG9jdW1lbnREaWZmKGRpZmY6IElEb2N1bWVudERpZmYsIG9yaWdpbmFsOiBJVGV4dE1vZGVsLCBtb2RpZmllZDogSVRleHRNb2RlbCk6IElEb2N1bWVudERpZmYge1xuXHRyZXR1cm4ge1xuXHRcdGNoYW5nZXM6IGRpZmYuY2hhbmdlcy5tYXAoYyA9PiBuZXcgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKFxuXHRcdFx0Yy5vcmlnaW5hbCxcblx0XHRcdGMubW9kaWZpZWQsXG5cdFx0XHRjLmlubmVyQ2hhbmdlcyA/IGMuaW5uZXJDaGFuZ2VzLm1hcChpID0+IG5vcm1hbGl6ZVJhbmdlTWFwcGluZyhpLCBvcmlnaW5hbCwgbW9kaWZpZWQpKSA6IHVuZGVmaW5lZFxuXHRcdCkpLFxuXHRcdG1vdmVzOiBkaWZmLm1vdmVzLFxuXHRcdGlkZW50aWNhbDogZGlmZi5pZGVudGljYWwsXG5cdFx0cXVpdEVhcmx5OiBkaWZmLnF1aXRFYXJseSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUmFuZ2VNYXBwaW5nKHJhbmdlTWFwcGluZzogUmFuZ2VNYXBwaW5nLCBvcmlnaW5hbDogSVRleHRNb2RlbCwgbW9kaWZpZWQ6IElUZXh0TW9kZWwpOiBSYW5nZU1hcHBpbmcge1xuXHRsZXQgb3JpZ2luYWxSYW5nZSA9IHJhbmdlTWFwcGluZy5vcmlnaW5hbFJhbmdlO1xuXHRsZXQgbW9kaWZpZWRSYW5nZSA9IHJhbmdlTWFwcGluZy5tb2RpZmllZFJhbmdlO1xuXHRpZiAoXG5cdFx0b3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbiA9PT0gMSAmJiBtb2RpZmllZFJhbmdlLnN0YXJ0Q29sdW1uID09PSAxICYmXG5cdFx0KG9yaWdpbmFsUmFuZ2UuZW5kQ29sdW1uICE9PSAxIHx8IG1vZGlmaWVkUmFuZ2UuZW5kQ29sdW1uICE9PSAxKSAmJlxuXHRcdG9yaWdpbmFsUmFuZ2UuZW5kQ29sdW1uID09PSBvcmlnaW5hbC5nZXRMaW5lTWF4Q29sdW1uKG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlcilcblx0XHQmJiBtb2RpZmllZFJhbmdlLmVuZENvbHVtbiA9PT0gbW9kaWZpZWQuZ2V0TGluZU1heENvbHVtbihtb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXIpXG5cdFx0JiYgb3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyIDwgb3JpZ2luYWwuZ2V0TGluZUNvdW50KClcblx0XHQmJiBtb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXIgPCBtb2RpZmllZC5nZXRMaW5lQ291bnQoKVxuXHQpIHtcblx0XHRvcmlnaW5hbFJhbmdlID0gb3JpZ2luYWxSYW5nZS5zZXRFbmRQb3NpdGlvbihvcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXIgKyAxLCAxKTtcblx0XHRtb2RpZmllZFJhbmdlID0gbW9kaWZpZWRSYW5nZS5zZXRFbmRQb3NpdGlvbihtb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXIgKyAxLCAxKTtcblx0fVxuXHRyZXR1cm4gbmV3IFJhbmdlTWFwcGluZyhvcmlnaW5hbFJhbmdlLCBtb2RpZmllZFJhbmdlKTtcbn1cblxuaW50ZXJmYWNlIFNlcmlhbGl6ZWRTdGF0ZSB7XG5cdGNvbGxhcHNlZFJlZ2lvbnM6IHsgcmFuZ2U6IElTZXJpYWxpemVkTGluZVJhbmdlIH1bXSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIERpZmZTdGF0ZSB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbURpZmZSZXN1bHQocmVzdWx0OiBJRG9jdW1lbnREaWZmKTogRGlmZlN0YXRlIHtcblx0XHRyZXR1cm4gbmV3IERpZmZTdGF0ZShcblx0XHRcdHJlc3VsdC5jaGFuZ2VzLm1hcChjID0+IG5ldyBEaWZmTWFwcGluZyhjKSksXG5cdFx0XHRyZXN1bHQubW92ZXMgfHwgW10sXG5cdFx0XHRyZXN1bHQuaWRlbnRpY2FsLFxuXHRcdFx0cmVzdWx0LnF1aXRFYXJseSxcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1hcHBpbmdzOiByZWFkb25seSBEaWZmTWFwcGluZ1tdLFxuXHRcdHB1YmxpYyByZWFkb25seSBtb3ZlZFRleHRzOiByZWFkb25seSBNb3ZlZFRleHRbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWRlbnRpY2FsOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBxdWl0RWFybHk6IGJvb2xlYW4sXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBEaWZmTWFwcGluZyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGxpbmVSYW5nZU1hcHBpbmc6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyxcblx0KSB7XG5cdFx0Lypcblx0XHRyZWFkb25seSBtb3ZlZFRvOiBNb3ZlZFRleHQgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgbW92ZWRGcm9tOiBNb3ZlZFRleHQgfCB1bmRlZmluZWQsXG5cblx0XHRpZiAobW92ZWRUbykge1xuXHRcdFx0YXNzZXJ0Rm4oKCkgPT5cblx0XHRcdFx0bW92ZWRUby5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkUmFuZ2UuZXF1YWxzKGxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWRSYW5nZSlcblx0XHRcdFx0JiYgbGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbFJhbmdlLmlzRW1wdHlcblx0XHRcdFx0JiYgIW1vdmVkRnJvbVxuXHRcdFx0KTtcblx0XHR9IGVsc2UgaWYgKG1vdmVkRnJvbSkge1xuXHRcdFx0YXNzZXJ0Rm4oKCkgPT5cblx0XHRcdFx0bW92ZWRGcm9tLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWxSYW5nZS5lcXVhbHMobGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbFJhbmdlKVxuXHRcdFx0XHQmJiBsaW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkUmFuZ2UuaXNFbXB0eVxuXHRcdFx0XHQmJiAhbW92ZWRUb1xuXHRcdFx0KTtcblx0XHR9XG5cdFx0Ki9cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5jaGFuZ2VkUmVnaW9uIHtcblx0cHVibGljIHN0YXRpYyBmcm9tRGlmZnMoXG5cdFx0Y2hhbmdlczogcmVhZG9ubHkgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10sXG5cdFx0b3JpZ2luYWxMaW5lQ291bnQ6IG51bWJlcixcblx0XHRtb2RpZmllZExpbmVDb3VudDogbnVtYmVyLFxuXHRcdG1pbkhpZGRlbkxpbmVDb3VudDogbnVtYmVyLFxuXHRcdG1pbkNvbnRleHQ6IG51bWJlcixcblx0KTogVW5jaGFuZ2VkUmVnaW9uW10ge1xuXHRcdGNvbnN0IGludmVyc2VkTWFwcGluZ3MgPSBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcuaW52ZXJzZShjaGFuZ2VzLCBvcmlnaW5hbExpbmVDb3VudCwgbW9kaWZpZWRMaW5lQ291bnQpO1xuXHRcdGNvbnN0IHJlc3VsdDogVW5jaGFuZ2VkUmVnaW9uW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgbWFwcGluZyBvZiBpbnZlcnNlZE1hcHBpbmdzKSB7XG5cdFx0XHRsZXQgb3JpZ1N0YXJ0ID0gbWFwcGluZy5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRsZXQgbW9kU3RhcnQgPSBtYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGxldCBsZW5ndGggPSBtYXBwaW5nLm9yaWdpbmFsLmxlbmd0aDtcblxuXHRcdFx0Y29uc3QgYXRTdGFydCA9IG9yaWdTdGFydCA9PT0gMSAmJiBtb2RTdGFydCA9PT0gMTtcblx0XHRcdGNvbnN0IGF0RW5kID0gb3JpZ1N0YXJ0ICsgbGVuZ3RoID09PSBvcmlnaW5hbExpbmVDb3VudCArIDEgJiYgbW9kU3RhcnQgKyBsZW5ndGggPT09IG1vZGlmaWVkTGluZUNvdW50ICsgMTtcblxuXHRcdFx0aWYgKChhdFN0YXJ0IHx8IGF0RW5kKSAmJiBsZW5ndGggPj0gbWluQ29udGV4dCArIG1pbkhpZGRlbkxpbmVDb3VudCkge1xuXHRcdFx0XHRpZiAoYXRTdGFydCAmJiAhYXRFbmQpIHtcblx0XHRcdFx0XHRsZW5ndGggLT0gbWluQ29udGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYXRFbmQgJiYgIWF0U3RhcnQpIHtcblx0XHRcdFx0XHRvcmlnU3RhcnQgKz0gbWluQ29udGV4dDtcblx0XHRcdFx0XHRtb2RTdGFydCArPSBtaW5Db250ZXh0O1xuXHRcdFx0XHRcdGxlbmd0aCAtPSBtaW5Db250ZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5ldyBVbmNoYW5nZWRSZWdpb24ob3JpZ1N0YXJ0LCBtb2RTdGFydCwgbGVuZ3RoLCAwLCAwKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGxlbmd0aCA+PSBtaW5Db250ZXh0ICogMiArIG1pbkhpZGRlbkxpbmVDb3VudCkge1xuXHRcdFx0XHRvcmlnU3RhcnQgKz0gbWluQ29udGV4dDtcblx0XHRcdFx0bW9kU3RhcnQgKz0gbWluQ29udGV4dDtcblx0XHRcdFx0bGVuZ3RoIC09IG1pbkNvbnRleHQgKiAyO1xuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgVW5jaGFuZ2VkUmVnaW9uKG9yaWdTdGFydCwgbW9kU3RhcnQsIGxlbmd0aCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9yaWdpbmFsVW5jaGFuZ2VkUmFuZ2UoKTogTGluZVJhbmdlIHtcblx0XHRyZXR1cm4gTGluZVJhbmdlLm9mTGVuZ3RoKHRoaXMub3JpZ2luYWxMaW5lTnVtYmVyLCB0aGlzLmxpbmVDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1vZGlmaWVkVW5jaGFuZ2VkUmFuZ2UoKTogTGluZVJhbmdlIHtcblx0XHRyZXR1cm4gTGluZVJhbmdlLm9mTGVuZ3RoKHRoaXMubW9kaWZpZWRMaW5lTnVtYmVyLCB0aGlzLmxpbmVDb3VudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlTGluZUNvdW50VG9wID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgMCk7XG5cdHB1YmxpYyByZWFkb25seSB2aXNpYmxlTGluZUNvdW50VG9wOiBJU2V0dGFibGVPYnNlcnZhYmxlPG51bWJlcj4gPSB0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVMaW5lQ291bnRCb3R0b20gPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0cHVibGljIHJlYWRvbmx5IHZpc2libGVMaW5lQ291bnRCb3R0b206IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPiA9IHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b207XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hvdWxkSGlkZUNvbnRyb2xzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gLyoqIEBkZXNjcmlwdGlvbiBpc1Zpc2libGUgKi9cblx0XHR0aGlzLnZpc2libGVMaW5lQ291bnRUb3AucmVhZChyZWFkZXIpICsgdGhpcy52aXNpYmxlTGluZUNvdW50Qm90dG9tLnJlYWQocmVhZGVyKSA9PT0gdGhpcy5saW5lQ291bnQgJiYgIXRoaXMuaXNEcmFnZ2VkLnJlYWQocmVhZGVyKSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGlzRHJhZ2dlZCA9IG9ic2VydmFibGVWYWx1ZTx1bmRlZmluZWQgfCAnYm90dG9tJyB8ICd0b3AnPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kaWZpZWRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVDb3VudDogbnVtYmVyLFxuXHRcdHZpc2libGVMaW5lQ291bnRUb3A6IG51bWJlcixcblx0XHR2aXNpYmxlTGluZUNvdW50Qm90dG9tOiBudW1iZXIsXG5cdCkge1xuXHRcdGNvbnN0IHZpc2libGVMaW5lQ291bnRUb3AyID0gTWF0aC5tYXgoTWF0aC5taW4odmlzaWJsZUxpbmVDb3VudFRvcCwgdGhpcy5saW5lQ291bnQpLCAwKTtcblx0XHRjb25zdCB2aXNpYmxlTGluZUNvdW50Qm90dG9tMiA9IE1hdGgubWF4KE1hdGgubWluKHZpc2libGVMaW5lQ291bnRCb3R0b20sIHRoaXMubGluZUNvdW50IC0gdmlzaWJsZUxpbmVDb3VudFRvcCksIDApO1xuXG5cdFx0c29mdEFzc2VydCh2aXNpYmxlTGluZUNvdW50VG9wID09PSB2aXNpYmxlTGluZUNvdW50VG9wMik7XG5cdFx0c29mdEFzc2VydCh2aXNpYmxlTGluZUNvdW50Qm90dG9tID09PSB2aXNpYmxlTGluZUNvdW50Qm90dG9tMik7XG5cblx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLnNldCh2aXNpYmxlTGluZUNvdW50VG9wMiwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50Qm90dG9tLnNldCh2aXNpYmxlTGluZUNvdW50Qm90dG9tMiwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWaXNpYmxlUmFuZ2VzKHZpc2libGVSYW5nZXM6IExpbmVSYW5nZU1hcHBpbmdbXSwgdHg6IElUcmFuc2FjdGlvbik6IFVuY2hhbmdlZFJlZ2lvbltdIHtcblx0XHRjb25zdCByZXN1bHQ6IFVuY2hhbmdlZFJlZ2lvbltdID0gW107XG5cblx0XHRjb25zdCBoaWRkZW5Nb2RpZmllZCA9IG5ldyBMaW5lUmFuZ2VTZXQodmlzaWJsZVJhbmdlcy5tYXAociA9PiByLm1vZGlmaWVkKSkuc3VidHJhY3RGcm9tKHRoaXMubW9kaWZpZWRVbmNoYW5nZWRSYW5nZSk7XG5cblx0XHRsZXQgb3JpZ2luYWxTdGFydExpbmVOdW1iZXIgPSB0aGlzLm9yaWdpbmFsTGluZU51bWJlcjtcblx0XHRsZXQgbW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPSB0aGlzLm1vZGlmaWVkTGluZU51bWJlcjtcblx0XHRjb25zdCBtb2RpZmllZEVuZExpbmVOdW1iZXJFeCA9IHRoaXMubW9kaWZpZWRMaW5lTnVtYmVyICsgdGhpcy5saW5lQ291bnQ7XG5cdFx0aWYgKGhpZGRlbk1vZGlmaWVkLnJhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuc2hvd0FsbCh0eCk7XG5cdFx0XHRyZXN1bHQucHVzaCh0aGlzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IGkgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIGhpZGRlbk1vZGlmaWVkLnJhbmdlcykge1xuXHRcdFx0XHRjb25zdCBpc0xhc3QgPSBpID09PSBoaWRkZW5Nb2RpZmllZC5yYW5nZXMubGVuZ3RoIC0gMTtcblx0XHRcdFx0aSsrO1xuXG5cdFx0XHRcdGNvbnN0IGxlbmd0aCA9IChpc0xhc3QgPyBtb2RpZmllZEVuZExpbmVOdW1iZXJFeCA6IHIuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSkgLSBtb2RpZmllZFN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0XHRjb25zdCBuZXdSID0gbmV3IFVuY2hhbmdlZFJlZ2lvbihvcmlnaW5hbFN0YXJ0TGluZU51bWJlciwgbW9kaWZpZWRTdGFydExpbmVOdW1iZXIsIGxlbmd0aCwgMCwgMCk7XG5cdFx0XHRcdG5ld1Iuc2V0SGlkZGVuTW9kaWZpZWRSYW5nZShyLCB0eCk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5ld1IpO1xuXG5cdFx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyID0gbmV3Ui5vcmlnaW5hbFVuY2hhbmdlZFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cdFx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID0gbmV3Ui5tb2RpZmllZFVuY2hhbmdlZFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRIaWRlQ29udHJvbHMocmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3VsZEhpZGVDb250cm9scy5yZWFkKHJlYWRlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SGlkZGVuT3JpZ2luYWxSYW5nZShyZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBMaW5lUmFuZ2Uge1xuXHRcdHJldHVybiBMaW5lUmFuZ2Uub2ZMZW5ndGgoXG5cdFx0XHR0aGlzLm9yaWdpbmFsTGluZU51bWJlciArIHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AucmVhZChyZWFkZXIpLFxuXHRcdFx0dGhpcy5saW5lQ291bnQgLSB0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLnJlYWQocmVhZGVyKSAtIHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20ucmVhZChyZWFkZXIpLFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SGlkZGVuTW9kaWZpZWRSYW5nZShyZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBMaW5lUmFuZ2Uge1xuXHRcdHJldHVybiBMaW5lUmFuZ2Uub2ZMZW5ndGgoXG5cdFx0XHR0aGlzLm1vZGlmaWVkTGluZU51bWJlciArIHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AucmVhZChyZWFkZXIpLFxuXHRcdFx0dGhpcy5saW5lQ291bnQgLSB0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLnJlYWQocmVhZGVyKSAtIHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20ucmVhZChyZWFkZXIpLFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0SGlkZGVuTW9kaWZpZWRSYW5nZShyYW5nZTogTGluZVJhbmdlLCB0eDogSVRyYW5zYWN0aW9uKSB7XG5cdFx0Y29uc3QgdmlzaWJsZUxpbmVDb3VudFRvcCA9IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIHRoaXMubW9kaWZpZWRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHZpc2libGVMaW5lQ291bnRCb3R0b20gPSAodGhpcy5tb2RpZmllZExpbmVOdW1iZXIgKyB0aGlzLmxpbmVDb3VudCkgLSByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHRcdHRoaXMuc2V0U3RhdGUodmlzaWJsZUxpbmVDb3VudFRvcCwgdmlzaWJsZUxpbmVDb3VudEJvdHRvbSwgdHgpO1xuXHR9XG5cblx0cHVibGljIGdldE1heFZpc2libGVMaW5lQ291bnRUb3AoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGluZUNvdW50IC0gdGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNYXhWaXNpYmxlTGluZUNvdW50Qm90dG9tKCkge1xuXHRcdHJldHVybiB0aGlzLmxpbmVDb3VudCAtIHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AuZ2V0KCk7XG5cdH1cblxuXHRwdWJsaWMgc2hvd01vcmVBYm92ZShjb3VudCA9IDEwLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF4VmlzaWJsZUxpbmVDb3VudFRvcCA9IHRoaXMuZ2V0TWF4VmlzaWJsZUxpbmVDb3VudFRvcCgpO1xuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3Auc2V0KE1hdGgubWluKHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AuZ2V0KCkgKyBjb3VudCwgbWF4VmlzaWJsZUxpbmVDb3VudFRvcCksIHR4KTtcblx0fVxuXG5cdHB1YmxpYyBzaG93TW9yZUJlbG93KGNvdW50ID0gMTAsIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBtYXhWaXNpYmxlTGluZUNvdW50Qm90dG9tID0gdGhpcy5saW5lQ291bnQgLSB0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLmdldCgpO1xuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uc2V0KE1hdGgubWluKHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uZ2V0KCkgKyBjb3VudCwgbWF4VmlzaWJsZUxpbmVDb3VudEJvdHRvbSksIHR4KTtcblx0fVxuXG5cdHB1YmxpYyBzaG93QWxsKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50Qm90dG9tLnNldCh0aGlzLmxpbmVDb3VudCAtIHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AuZ2V0KCksIHR4KTtcblx0fVxuXG5cdHB1YmxpYyBzaG93TW9kaWZpZWRMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgcHJlZmVyZW5jZTogUmV2ZWFsUHJlZmVyZW5jZSwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvcCA9IGxpbmVOdW1iZXIgKyAxIC0gKHRoaXMubW9kaWZpZWRMaW5lTnVtYmVyICsgdGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKSk7XG5cdFx0Y29uc3QgYm90dG9tID0gKHRoaXMubW9kaWZpZWRMaW5lTnVtYmVyIC0gdGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5nZXQoKSArIHRoaXMubGluZUNvdW50KSAtIGxpbmVOdW1iZXI7XG5cdFx0aWYgKHByZWZlcmVuY2UgPT09IFJldmVhbFByZWZlcmVuY2UuRnJvbUNsb3NlclNpZGUgJiYgdG9wIDwgYm90dG9tIHx8IHByZWZlcmVuY2UgPT09IFJldmVhbFByZWZlcmVuY2UuRnJvbVRvcCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5zZXQodGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKSArIHRvcCwgdHgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50Qm90dG9tLnNldCh0aGlzLl92aXNpYmxlTGluZUNvdW50Qm90dG9tLmdldCgpICsgYm90dG9tLCB0eCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNob3dPcmlnaW5hbExpbmUobGluZU51bWJlcjogbnVtYmVyLCBwcmVmZXJlbmNlOiBSZXZlYWxQcmVmZXJlbmNlLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9wID0gbGluZU51bWJlciAtIHRoaXMub3JpZ2luYWxMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGJvdHRvbSA9ICh0aGlzLm9yaWdpbmFsTGluZU51bWJlciArIHRoaXMubGluZUNvdW50KSAtIGxpbmVOdW1iZXI7XG5cdFx0aWYgKHByZWZlcmVuY2UgPT09IFJldmVhbFByZWZlcmVuY2UuRnJvbUNsb3NlclNpZGUgJiYgdG9wIDwgYm90dG9tIHx8IHByZWZlcmVuY2UgPT09IFJldmVhbFByZWZlcmVuY2UuRnJvbVRvcCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5zZXQoTWF0aC5taW4odGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKSArIGJvdHRvbSAtIHRvcCwgdGhpcy5nZXRNYXhWaXNpYmxlTGluZUNvdW50VG9wKCkpLCB0eCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uc2V0KE1hdGgubWluKHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uZ2V0KCkgKyB0b3AgLSBib3R0b20sIHRoaXMuZ2V0TWF4VmlzaWJsZUxpbmVDb3VudEJvdHRvbSgpKSwgdHgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjb2xsYXBzZUFsbCh0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5zZXQoMCwgdHgpO1xuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uc2V0KDAsIHR4KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTdGF0ZSh2aXNpYmxlTGluZUNvdW50VG9wOiBudW1iZXIsIHZpc2libGVMaW5lQ291bnRCb3R0b206IG51bWJlciwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHZpc2libGVMaW5lQ291bnRUb3AgPSBNYXRoLm1heChNYXRoLm1pbih2aXNpYmxlTGluZUNvdW50VG9wLCB0aGlzLmxpbmVDb3VudCksIDApO1xuXHRcdHZpc2libGVMaW5lQ291bnRCb3R0b20gPSBNYXRoLm1heChNYXRoLm1pbih2aXNpYmxlTGluZUNvdW50Qm90dG9tLCB0aGlzLmxpbmVDb3VudCAtIHZpc2libGVMaW5lQ291bnRUb3ApLCAwKTtcblxuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3Auc2V0KHZpc2libGVMaW5lQ291bnRUb3AsIHR4KTtcblx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50Qm90dG9tLnNldCh2aXNpYmxlTGluZUNvdW50Qm90dG9tLCB0eCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUmV2ZWFsUHJlZmVyZW5jZSB7XG5cdEZyb21DbG9zZXJTaWRlLFxuXHRGcm9tVG9wLFxuXHRGcm9tQm90dG9tLFxufVxuXG5mdW5jdGlvbiBhcHBseU9yaWdpbmFsRWRpdHMoZGlmZjogSURvY3VtZW50RGlmZiwgdGV4dEVkaXRzOiBUZXh0RWRpdEluZm9bXSwgb3JpZ2luYWxUZXh0TW9kZWw6IElUZXh0TW9kZWwsIG1vZGlmaWVkVGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogSURvY3VtZW50RGlmZiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB1bmRlZmluZWQ7XG5cdC8qXG5cdFRPRE9AaGVkaWV0XG5cdGlmICh0ZXh0RWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGRpZmY7XG5cdH1cblxuXHRjb25zdCBkaWZmMiA9IGZsaXAoZGlmZik7XG5cdGNvbnN0IGRpZmYzID0gYXBwbHlNb2RpZmllZEVkaXRzKGRpZmYyLCB0ZXh0RWRpdHMsIG1vZGlmaWVkVGV4dE1vZGVsLCBvcmlnaW5hbFRleHRNb2RlbCk7XG5cdGlmICghZGlmZjMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBmbGlwKGRpZmYzKTsqL1xufVxuLypcbmZ1bmN0aW9uIGZsaXAoZGlmZjogSURvY3VtZW50RGlmZik6IElEb2N1bWVudERpZmYge1xuXHRyZXR1cm4ge1xuXHRcdGNoYW5nZXM6IGRpZmYuY2hhbmdlcy5tYXAoYyA9PiBjLmZsaXAoKSksXG5cdFx0bW92ZXM6IGRpZmYubW92ZXMubWFwKG0gPT4gbS5mbGlwKCkpLFxuXHRcdGlkZW50aWNhbDogZGlmZi5pZGVudGljYWwsXG5cdFx0cXVpdEVhcmx5OiBkaWZmLnF1aXRFYXJseSxcblx0fTtcbn1cbiovXG5mdW5jdGlvbiBhcHBseU1vZGlmaWVkRWRpdHMoZGlmZjogSURvY3VtZW50RGlmZiwgdGV4dEVkaXRzOiBUZXh0RWRpdEluZm9bXSwgb3JpZ2luYWxUZXh0TW9kZWw6IElUZXh0TW9kZWwsIG1vZGlmaWVkVGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogSURvY3VtZW50RGlmZiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB1bmRlZmluZWQ7XG5cdC8qXG5cdFRPRE9AaGVkaWV0XG5cdGlmICh0ZXh0RWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGRpZmY7XG5cdH1cblx0aWYgKGRpZmYuY2hhbmdlcy5zb21lKGMgPT4gIWMuaW5uZXJDaGFuZ2VzKSB8fCBkaWZmLm1vdmVzLmxlbmd0aCA+IDApIHtcblx0XHQvLyBUT0RPIHN1cHBvcnQgdGhlc2UgY2FzZXNcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgY2hhbmdlcyA9IGFwcGx5TW9kaWZpZWRFZGl0c1RvTGluZVJhbmdlTWFwcGluZ3MoZGlmZi5jaGFuZ2VzLCB0ZXh0RWRpdHMsIG9yaWdpbmFsVGV4dE1vZGVsLCBtb2RpZmllZFRleHRNb2RlbCk7XG5cblx0Y29uc3QgbW92ZXMgPSBkaWZmLm1vdmVzLm1hcChtID0+IHtcblx0XHRjb25zdCBuZXdNb2RpZmllZFJhbmdlID0gYXBwbHlFZGl0VG9MaW5lUmFuZ2UobS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLCB0ZXh0RWRpdHMpO1xuXHRcdHJldHVybiBuZXdNb2RpZmllZFJhbmdlID8gbmV3IE1vdmVkVGV4dChcblx0XHRcdG5ldyBTaW1wbGVMaW5lUmFuZ2VNYXBwaW5nKG0ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbCwgbmV3TW9kaWZpZWRSYW5nZSksXG5cdFx0XHRhcHBseU1vZGlmaWVkRWRpdHNUb0xpbmVSYW5nZU1hcHBpbmdzKG0uY2hhbmdlcywgdGV4dEVkaXRzLCBvcmlnaW5hbFRleHRNb2RlbCwgbW9kaWZpZWRUZXh0TW9kZWwpLFxuXHRcdCkgOiB1bmRlZmluZWQ7XG5cdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdHJldHVybiB7XG5cdFx0aWRlbnRpY2FsOiBmYWxzZSxcblx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdGNoYW5nZXMsXG5cdFx0bW92ZXMsXG5cdH07Ki9cbn1cbi8qXG5mdW5jdGlvbiBhcHBseUVkaXRUb0xpbmVSYW5nZShyYW5nZTogTGluZVJhbmdlLCB0ZXh0RWRpdHM6IFRleHRFZGl0SW5mb1tdKTogTGluZVJhbmdlIHwgdW5kZWZpbmVkIHtcblx0bGV0IHJhbmdlU3RhcnRMaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRsZXQgcmFuZ2VFbmRMaW5lTnVtYmVyRXggPSByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXG5cdGZvciAobGV0IGkgPSB0ZXh0RWRpdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRjb25zdCB0ZXh0RWRpdCA9IHRleHRFZGl0c1tpXTtcblx0XHRjb25zdCB0ZXh0RWRpdFN0YXJ0TGluZU51bWJlciA9IGxlbmd0aEdldExpbmVDb3VudCh0ZXh0RWRpdC5zdGFydE9mZnNldCkgKyAxO1xuXHRcdGNvbnN0IHRleHRFZGl0RW5kTGluZU51bWJlciA9IGxlbmd0aEdldExpbmVDb3VudCh0ZXh0RWRpdC5lbmRPZmZzZXQpICsgMTtcblx0XHRjb25zdCBuZXdMZW5ndGhMaW5lQ291bnQgPSBsZW5ndGhHZXRMaW5lQ291bnQodGV4dEVkaXQubmV3TGVuZ3RoKTtcblx0XHRjb25zdCBkZWx0YSA9IG5ld0xlbmd0aExpbmVDb3VudCAtICh0ZXh0RWRpdEVuZExpbmVOdW1iZXIgLSB0ZXh0RWRpdFN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRpZiAodGV4dEVkaXRFbmRMaW5lTnVtYmVyIDwgcmFuZ2VTdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIHRoZSB0ZXh0IGVkaXQgaXMgYmVmb3JlIHVzXG5cdFx0XHRyYW5nZVN0YXJ0TGluZU51bWJlciArPSBkZWx0YTtcblx0XHRcdHJhbmdlRW5kTGluZU51bWJlckV4ICs9IGRlbHRhO1xuXHRcdH0gZWxzZSBpZiAodGV4dEVkaXRTdGFydExpbmVOdW1iZXIgPiByYW5nZUVuZExpbmVOdW1iZXJFeCkge1xuXHRcdFx0Ly8gdGhlIHRleHQgZWRpdCBpcyBhZnRlciB1c1xuXHRcdFx0Ly8gTk9PUFxuXHRcdH0gZWxzZSBpZiAodGV4dEVkaXRTdGFydExpbmVOdW1iZXIgPCByYW5nZVN0YXJ0TGluZU51bWJlciAmJiByYW5nZUVuZExpbmVOdW1iZXJFeCA8IHRleHRFZGl0RW5kTGluZU51bWJlcikge1xuXHRcdFx0Ly8gdGhlIHJhbmdlIGlzIGZ1bGx5IGNvbnRhaW5lZCBpbiB0aGUgdGV4dCBlZGl0XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAodGV4dEVkaXRTdGFydExpbmVOdW1iZXIgPCByYW5nZVN0YXJ0TGluZU51bWJlciAmJiB0ZXh0RWRpdEVuZExpbmVOdW1iZXIgPD0gcmFuZ2VFbmRMaW5lTnVtYmVyRXgpIHtcblx0XHRcdC8vIHRoZSB0ZXh0IGVkaXQgZW5kcyBpbnNpZGUgb3VyIHJhbmdlXG5cdFx0XHRyYW5nZVN0YXJ0TGluZU51bWJlciA9IHRleHRFZGl0RW5kTGluZU51bWJlciArIDE7XG5cdFx0XHRyYW5nZVN0YXJ0TGluZU51bWJlciArPSBkZWx0YTtcblx0XHRcdHJhbmdlRW5kTGluZU51bWJlckV4ICs9IGRlbHRhO1xuXHRcdH0gZWxzZSBpZiAocmFuZ2VTdGFydExpbmVOdW1iZXIgPD0gdGV4dEVkaXRTdGFydExpbmVOdW1iZXIgJiYgdGV4dEVkaXRFbmRMaW5lTnVtYmVyIDwgcmFuZ2VTdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIHRoZSB0ZXh0IGVkaXQgc3RhcnRzIGluc2lkZSBvdXIgcmFuZ2Vcblx0XHRcdHJhbmdlRW5kTGluZU51bWJlckV4ID0gdGV4dEVkaXRTdGFydExpbmVOdW1iZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJhbmdlRW5kTGluZU51bWJlckV4ICs9IGRlbHRhO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBuZXcgTGluZVJhbmdlKHJhbmdlU3RhcnRMaW5lTnVtYmVyLCByYW5nZUVuZExpbmVOdW1iZXJFeCk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5TW9kaWZpZWRFZGl0c1RvTGluZVJhbmdlTWFwcGluZ3MoY2hhbmdlczogcmVhZG9ubHkgTGluZVJhbmdlTWFwcGluZ1tdLCB0ZXh0RWRpdHM6IFRleHRFZGl0SW5mb1tdLCBvcmlnaW5hbFRleHRNb2RlbDogSVRleHRNb2RlbCwgbW9kaWZpZWRUZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBMaW5lUmFuZ2VNYXBwaW5nW10ge1xuXHRjb25zdCBkaWZmVGV4dEVkaXRzID0gY2hhbmdlcy5mbGF0TWFwKGMgPT4gYy5pbm5lckNoYW5nZXMhLm1hcChjID0+IG5ldyBUZXh0RWRpdEluZm8oXG5cdFx0cG9zaXRpb25Ub0xlbmd0aChjLm9yaWdpbmFsUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSxcblx0XHRwb3NpdGlvblRvTGVuZ3RoKGMub3JpZ2luYWxSYW5nZS5nZXRFbmRQb3NpdGlvbigpKSxcblx0XHRsZW5ndGhPZlJhbmdlKGMubW9kaWZpZWRSYW5nZSkudG9MZW5ndGgoKSxcblx0KSkpO1xuXG5cdGNvbnN0IGNvbWJpbmVkID0gY29tYmluZVRleHRFZGl0SW5mb3MoZGlmZlRleHRFZGl0cywgdGV4dEVkaXRzKTtcblxuXHRsZXQgbGFzdE9yaWdpbmFsRW5kT2Zmc2V0ID0gbGVuZ3RoWmVybztcblx0bGV0IGxhc3RNb2RpZmllZEVuZE9mZnNldCA9IGxlbmd0aFplcm87XG5cdGNvbnN0IHJhbmdlTWFwcGluZ3MgPSBjb21iaW5lZC5tYXAoYyA9PiB7XG5cdFx0Y29uc3QgbW9kaWZpZWRTdGFydE9mZnNldCA9IGxlbmd0aEFkZChsYXN0TW9kaWZpZWRFbmRPZmZzZXQsIGxlbmd0aERpZmZOb25OZWdhdGl2ZShsYXN0T3JpZ2luYWxFbmRPZmZzZXQsIGMuc3RhcnRPZmZzZXQpKTtcblx0XHRsYXN0T3JpZ2luYWxFbmRPZmZzZXQgPSBjLmVuZE9mZnNldDtcblx0XHRsYXN0TW9kaWZpZWRFbmRPZmZzZXQgPSBsZW5ndGhBZGQobW9kaWZpZWRTdGFydE9mZnNldCwgYy5uZXdMZW5ndGgpO1xuXG5cdFx0cmV0dXJuIG5ldyBSYW5nZU1hcHBpbmcoXG5cdFx0XHRSYW5nZS5mcm9tUG9zaXRpb25zKGxlbmd0aFRvUG9zaXRpb24oYy5zdGFydE9mZnNldCksIGxlbmd0aFRvUG9zaXRpb24oYy5lbmRPZmZzZXQpKSxcblx0XHRcdFJhbmdlLmZyb21Qb3NpdGlvbnMobGVuZ3RoVG9Qb3NpdGlvbihtb2RpZmllZFN0YXJ0T2Zmc2V0KSwgbGVuZ3RoVG9Qb3NpdGlvbihsYXN0TW9kaWZpZWRFbmRPZmZzZXQpKSxcblx0XHQpO1xuXHR9KTtcblxuXHRjb25zdCBuZXdDaGFuZ2VzID0gbGluZVJhbmdlTWFwcGluZ0Zyb21SYW5nZU1hcHBpbmdzKFxuXHRcdHJhbmdlTWFwcGluZ3MsXG5cdFx0b3JpZ2luYWxUZXh0TW9kZWwuZ2V0TGluZXNDb250ZW50KCksXG5cdFx0bW9kaWZpZWRUZXh0TW9kZWwuZ2V0TGluZXNDb250ZW50KCksXG5cdCk7XG5cdHJldHVybiBuZXdDaGFuZ2VzO1xufVxuKi9cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBa0UsU0FBUyxTQUFTLGtCQUFrQiwyQkFBMkIsaUJBQWlCLGFBQWEsb0JBQW9CO0FBQ25MLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQStCLFdBQVcsb0JBQW9CO0FBQzlELFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMsMEJBQTBCLGtCQUFrQixvQkFBb0I7QUFHekUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0I7QUFFcEIsSUFBTSxzQkFBTixjQUFrQyxXQUEyQztBQUFBLEVBcURuRixZQUNpQixPQUNDLFVBQzZCLDZCQUM3QztBQUNELFVBQU07QUFKVTtBQUNDO0FBQzZCO0FBdkQvQyxTQUFpQixrQkFBa0IsZ0JBQXlCLE1BQU0sS0FBSztBQUN2RSxTQUFnQixp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
