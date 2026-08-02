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
import { $, addDisposableListener } from "../../../../../../base/browser/dom.js";
import { ArrayQueue } from "../../../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { assertReturnsDefined } from "../../../../../../base/common/types.js";
import { applyFontInfo } from "../../../../config/domFontInfo.js";
import { diffDeleteDecoration, diffRemoveIcon } from "../../registrations.contribution.js";
import { DiffMapping } from "../../diffEditorViewModel.js";
import { InlineDiffDeletedCodeMargin } from "./inlineDiffDeletedCodeMargin.js";
import { LineSource, RenderOptions, renderLines } from "./renderLines.js";
import { animatedObservable, joinCombine } from "../../utils.js";
import { EditorOption } from "../../../../../common/config/editorOptions.js";
import { LineRange } from "../../../../../common/core/ranges/lineRange.js";
import { Position } from "../../../../../common/core/position.js";
import { ScrollType } from "../../../../../common/editorCommon.js";
import { BackgroundTokenizationState } from "../../../../../common/tokenizationTextModelPart.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { Range } from "../../../../../common/core/range.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../common/viewModel/inlineDecorations.js";
let DiffEditorViewZones = class extends Disposable {
  constructor(_targetWindow, _editors, _diffModel, _options, _diffEditorWidget, _canIgnoreViewZoneUpdateEvent, _origViewZonesToIgnore, _modViewZonesToIgnore, _clipboardService, _contextMenuService) {
    super();
    this._targetWindow = _targetWindow;
    this._editors = _editors;
    this._diffModel = _diffModel;
    this._options = _options;
    this._diffEditorWidget = _diffEditorWidget;
    this._canIgnoreViewZoneUpdateEvent = _canIgnoreViewZoneUpdateEvent;
    this._origViewZonesToIgnore = _origViewZonesToIgnore;
    this._modViewZonesToIgnore = _modViewZonesToIgnore;
    this._clipboardService = _clipboardService;
    this._contextMenuService = _contextMenuService;
    this._originalTopPadding = observableValue(this, 0);
    this._originalScrollOffset = observableValue(this, 0);
    this._originalScrollOffsetAnimated = animatedObservable(this._targetWindow, this._originalScrollOffset, this._store);
    this._modifiedTopPadding = observableValue(this, 0);
    this._modifiedScrollOffset = observableValue(this, 0);
    this._modifiedScrollOffsetAnimated = animatedObservable(this._targetWindow, this._modifiedScrollOffset, this._store);
    const state = observableValue("invalidateAlignmentsState", 0);
    const updateImmediately = this._register(new RunOnceScheduler(() => {
      state.set(state.get() + 1, void 0);
    }, 0));
    this._register(this._editors.original.onDidChangeViewZones((_args) => {
      if (!this._canIgnoreViewZoneUpdateEvent()) {
        updateImmediately.schedule();
      }
    }));
    this._register(this._editors.modified.onDidChangeViewZones((_args) => {
      if (!this._canIgnoreViewZoneUpdateEvent()) {
        updateImmediately.schedule();
      }
    }));
    this._register(this._editors.original.onDidChangeConfiguration((args) => {
      if (args.hasChanged(EditorOption.wrappingInfo) || args.hasChanged(EditorOption.lineHeight)) {
        updateImmediately.schedule();
      }
    }));
    this._register(this._editors.modified.onDidChangeConfiguration((args) => {
      if (args.hasChanged(EditorOption.wrappingInfo) || args.hasChanged(EditorOption.lineHeight)) {
        updateImmediately.schedule();
      }
    }));
    const originalModelTokenizationCompleted = this._diffModel.map(
      (m) => m ? observableFromEvent(this, m.model.original.onDidChangeTokens, () => m.model.original.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) : void 0
    ).map((m, reader) => m?.read(reader));
    const alignments = derived((reader) => {
      const diffModel = this._diffModel.read(reader);
      const diff = diffModel?.diff.read(reader);
      if (!diffModel || !diff) {
        return null;
      }
      state.read(reader);
      const renderSideBySide = this._options.renderSideBySide.read(reader);
      const innerHunkAlignment = renderSideBySide;
      return computeRangeAlignment(
        this._editors.original,
        this._editors.modified,
        diff.mappings,
        this._origViewZonesToIgnore,
        this._modViewZonesToIgnore,
        innerHunkAlignment
      );
    });
    const alignmentsSyncedMovedText = derived((reader) => {
      const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
      if (!syncedMovedText) {
        return null;
      }
      state.read(reader);
      const mappings = syncedMovedText.changes.map((c) => new DiffMapping(c));
      return computeRangeAlignment(
        this._editors.original,
        this._editors.modified,
        mappings,
        this._origViewZonesToIgnore,
        this._modViewZonesToIgnore,
        true
      );
    });
    function createFakeLinesDiv() {
      const r = document.createElement("div");
      r.className = "diagonal-fill";
      return r;
    }
    const alignmentViewZonesDisposables = this._register(new DisposableStore());
    this.viewZones = derived(this, (reader) => {
      alignmentViewZonesDisposables.clear();
      const alignmentsVal = alignments.read(reader) || [];
      const origViewZones = [];
      const modViewZones = [];
      const modifiedTopPaddingVal = this._modifiedTopPadding.read(reader);
      if (modifiedTopPaddingVal > 0) {
        modViewZones.push({
          afterLineNumber: 0,
          domNode: document.createElement("div"),
          heightInPx: modifiedTopPaddingVal,
          showInHiddenAreas: true,
          suppressMouseDown: true
        });
      }
      const originalTopPaddingVal = this._originalTopPadding.read(reader);
      if (originalTopPaddingVal > 0) {
        origViewZones.push({
          afterLineNumber: 0,
          domNode: document.createElement("div"),
          heightInPx: originalTopPaddingVal,
          showInHiddenAreas: true,
          suppressMouseDown: true
        });
      }
      const renderSideBySide = this._options.renderSideBySide.read(reader);
      const context = {
        getLineContent: (lineNumber) => {
          return this._editors.original.getModel().getLineContent(lineNumber);
        },
        getLineInjectedText: (lineNumber) => {
          return null;
        }
      };
      const deletedCodeLineBreaksComputer = !renderSideBySide ? this._editors.modified._getViewModel()?.createLineBreaksComputer(context) : void 0;
      if (deletedCodeLineBreaksComputer) {
        const originalModel = this._editors.original.getModel();
        for (const a of alignmentsVal) {
          if (a.diff) {
            for (let i = a.originalRange.startLineNumber; i < a.originalRange.endLineNumberExclusive; i++) {
              if (i > originalModel.getLineCount()) {
                return { orig: origViewZones, mod: modViewZones };
              }
              deletedCodeLineBreaksComputer?.addRequest(i, null);
            }
          }
        }
      }
      const lineBreakData = deletedCodeLineBreaksComputer?.finalize() ?? [];
      let lineBreakDataIdx = 0;
      const modLineHeight = this._editors.modified.getOption(EditorOption.lineHeight);
      const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
      const mightContainNonBasicASCII = this._editors.original.getModel()?.mightContainNonBasicASCII() ?? false;
      const mightContainRTL = this._editors.original.getModel()?.mightContainRTL() ?? false;
      const renderOptions = RenderOptions.fromEditor(this._editors.modified);
      for (const a of alignmentsVal) {
        if (a.diff && !renderSideBySide && (!this._options.useTrueInlineDiffRendering.read(reader) || !allowsTrueInlineDiffRendering(a.diff))) {
          if (!a.originalRange.isEmpty) {
            originalModelTokenizationCompleted.read(reader);
            const deletedCodeDomNode = document.createElement("div");
            deletedCodeDomNode.classList.add("view-lines", "line-delete", "line-delete-selectable", "monaco-mouse-cursor-text");
            const originalModel = this._editors.original.getModel();
            if (a.originalRange.endLineNumberExclusive - 1 > originalModel.getLineCount()) {
              return { orig: origViewZones, mod: modViewZones };
            }
            const source = new LineSource(
              a.originalRange.mapToLineArray((l) => originalModel.tokenization.getLineTokens(l)),
              a.originalRange.mapToLineArray((_) => lineBreakData[lineBreakDataIdx++]),
              mightContainNonBasicASCII,
              mightContainRTL
            );
            const decorations = [];
            for (const i of a.diff.innerChanges || []) {
              decorations.push(new InlineDecoration(
                i.originalRange.delta(-(a.diff.original.startLineNumber - 1)),
                diffDeleteDecoration.className,
                InlineDecorationType.Regular
              ));
            }
            const result = renderLines(source, renderOptions, decorations, deletedCodeDomNode);
            const marginDomNode2 = document.createElement("div");
            marginDomNode2.className = "inline-deleted-margin-view-zone";
            applyFontInfo(marginDomNode2, renderOptions.fontInfo);
            if (this._options.renderIndicators.read(reader)) {
              for (let i = 0; i < result.heightInLines; i++) {
                const marginElement = document.createElement("div");
                marginElement.className = `delete-sign ${ThemeIcon.asClassName(diffRemoveIcon)}`;
                marginElement.setAttribute("style", `position:absolute;top:${i * modLineHeight}px;width:${renderOptions.lineDecorationsWidth}px;height:${modLineHeight}px;right:0;`);
                marginDomNode2.appendChild(marginElement);
              }
            }
            let zoneId = void 0;
            alignmentViewZonesDisposables.add(
              new InlineDiffDeletedCodeMargin(
                () => assertReturnsDefined(zoneId),
                marginDomNode2,
                deletedCodeDomNode,
                this._editors.modified,
                a.diff,
                this._diffEditorWidget,
                result,
                this._editors.original.getModel(),
                this._contextMenuService,
                this._clipboardService
              )
            );
            for (let i = 0; i < result.viewLineCounts.length; i++) {
              const count = result.viewLineCounts[i];
              if (count > 1) {
                origViewZones.push({
                  afterLineNumber: a.originalRange.startLineNumber + i,
                  domNode: createFakeLinesDiv(),
                  heightInPx: (count - 1) * modLineHeight,
                  showInHiddenAreas: true,
                  suppressMouseDown: true
                });
              }
            }
            modViewZones.push({
              afterLineNumber: a.modifiedRange.startLineNumber - 1,
              domNode: deletedCodeDomNode,
              heightInPx: result.heightInLines * modLineHeight,
              minWidthInPx: result.minWidthInPx,
              marginDomNode: marginDomNode2,
              setZoneId(id) {
                zoneId = id;
              },
              showInHiddenAreas: true,
              suppressMouseDown: false
            });
          }
          const marginDomNode = document.createElement("div");
          marginDomNode.className = "gutter-delete";
          origViewZones.push({
            afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
            domNode: createFakeLinesDiv(),
            heightInPx: a.modifiedHeightInPx,
            marginDomNode,
            showInHiddenAreas: true,
            suppressMouseDown: true
          });
        } else {
          const delta = a.modifiedHeightInPx - a.originalHeightInPx;
          if (delta > 0) {
            if (syncedMovedText?.lineRangeMapping.original.delta(-1).deltaLength(2).contains(a.originalRange.endLineNumberExclusive - 1)) {
              continue;
            }
            origViewZones.push({
              afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
              domNode: createFakeLinesDiv(),
              heightInPx: delta,
              showInHiddenAreas: true,
              suppressMouseDown: true
            });
          } else {
            let createViewZoneMarginArrow2 = function() {
              const arrow = document.createElement("div");
              arrow.className = "arrow-revert-change " + ThemeIcon.asClassName(Codicon.arrowRight);
              reader.store.add(addDisposableListener(arrow, "mousedown", (e) => e.stopPropagation()));
              reader.store.add(addDisposableListener(arrow, "click", (e) => {
                e.stopPropagation();
                _diffEditorWidget.revert(a.diff);
              }));
              return $("div", {}, arrow);
            };
            var createViewZoneMarginArrow = createViewZoneMarginArrow2;
            if (syncedMovedText?.lineRangeMapping.modified.delta(-1).deltaLength(2).contains(a.modifiedRange.endLineNumberExclusive - 1)) {
              continue;
            }
            let marginDomNode = void 0;
            if (a.diff && a.diff.modified.isEmpty && this._options.shouldRenderOldRevertArrows.read(reader)) {
              marginDomNode = createViewZoneMarginArrow2();
            }
            modViewZones.push({
              afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
              domNode: createFakeLinesDiv(),
              heightInPx: -delta,
              marginDomNode,
              showInHiddenAreas: true,
              suppressMouseDown: true
            });
          }
        }
      }
      for (const a of alignmentsSyncedMovedText.read(reader) ?? []) {
        if (!syncedMovedText?.lineRangeMapping.original.intersect(a.originalRange) || !syncedMovedText?.lineRangeMapping.modified.intersect(a.modifiedRange)) {
          continue;
        }
        const delta = a.modifiedHeightInPx - a.originalHeightInPx;
        if (delta > 0) {
          origViewZones.push({
            afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
            domNode: createFakeLinesDiv(),
            heightInPx: delta,
            showInHiddenAreas: true,
            suppressMouseDown: true
          });
        } else {
          modViewZones.push({
            afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
            domNode: createFakeLinesDiv(),
            heightInPx: -delta,
            showInHiddenAreas: true,
            suppressMouseDown: true
          });
        }
      }
      return { orig: origViewZones, mod: modViewZones };
    });
    let ignoreChange = false;
    this._register(this._editors.original.onDidScrollChange((e) => {
      if (e.scrollLeftChanged && !ignoreChange) {
        ignoreChange = true;
        this._editors.modified.setScrollLeft(e.scrollLeft);
        ignoreChange = false;
      }
    }));
    this._register(this._editors.modified.onDidScrollChange((e) => {
      if (e.scrollLeftChanged && !ignoreChange) {
        ignoreChange = true;
        this._editors.original.setScrollLeft(e.scrollLeft);
        ignoreChange = false;
      }
    }));
    this._originalScrollTop = observableFromEvent(this._editors.original.onDidScrollChange, () => (
      /** @description original.getScrollTop */
      this._editors.original.getScrollTop()
    ));
    this._modifiedScrollTop = observableFromEvent(this._editors.modified.onDidScrollChange, () => (
      /** @description modified.getScrollTop */
      this._editors.modified.getScrollTop()
    ));
    this._register(autorun((reader) => {
      const newScrollTopModified = this._originalScrollTop.read(reader) - (this._originalScrollOffsetAnimated.read(void 0) - this._modifiedScrollOffsetAnimated.read(reader)) - (this._originalTopPadding.read(void 0) - this._modifiedTopPadding.read(reader));
      if (newScrollTopModified !== this._editors.modified.getScrollTop()) {
        this._editors.modified.setScrollTop(newScrollTopModified, ScrollType.Immediate);
      }
    }));
    this._register(autorun((reader) => {
      const newScrollTopOriginal = this._modifiedScrollTop.read(reader) - (this._modifiedScrollOffsetAnimated.read(void 0) - this._originalScrollOffsetAnimated.read(reader)) - (this._modifiedTopPadding.read(void 0) - this._originalTopPadding.read(reader));
      if (newScrollTopOriginal !== this._editors.original.getScrollTop()) {
        this._editors.original.setScrollTop(newScrollTopOriginal, ScrollType.Immediate);
      }
    }));
    this._register(autorun((reader) => {
      const m = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
      let deltaOrigToMod = 0;
      if (m) {
        const trueTopOriginal = this._editors.original.getTopForLineNumber(m.lineRangeMapping.original.startLineNumber, true) - this._originalTopPadding.read(void 0);
        const trueTopModified = this._editors.modified.getTopForLineNumber(m.lineRangeMapping.modified.startLineNumber, true) - this._modifiedTopPadding.read(void 0);
        deltaOrigToMod = trueTopModified - trueTopOriginal;
      }
      if (deltaOrigToMod > 0) {
        this._modifiedTopPadding.set(0, void 0);
        this._originalTopPadding.set(deltaOrigToMod, void 0);
      } else if (deltaOrigToMod < 0) {
        this._modifiedTopPadding.set(-deltaOrigToMod, void 0);
        this._originalTopPadding.set(0, void 0);
      } else {
        setTimeout(() => {
          this._modifiedTopPadding.set(0, void 0);
          this._originalTopPadding.set(0, void 0);
        }, 400);
      }
      if (this._editors.modified.hasTextFocus()) {
        this._originalScrollOffset.set(this._modifiedScrollOffset.read(void 0) - deltaOrigToMod, void 0, true);
      } else {
        this._modifiedScrollOffset.set(this._originalScrollOffset.read(void 0) + deltaOrigToMod, void 0, true);
      }
    }));
  }
};
DiffEditorViewZones = __decorateClass([
  __decorateParam(8, IClipboardService),
  __decorateParam(9, IContextMenuService)
], DiffEditorViewZones);
function computeRangeAlignment(originalEditor, modifiedEditor, diffs, originalEditorAlignmentViewZones, modifiedEditorAlignmentViewZones, innerHunkAlignment) {
  const originalLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(originalEditor, originalEditorAlignmentViewZones));
  const modifiedLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(modifiedEditor, modifiedEditorAlignmentViewZones));
  const origLineHeight = originalEditor.getOption(EditorOption.lineHeight);
  const modLineHeight = modifiedEditor.getOption(EditorOption.lineHeight);
  const result = [];
  let lastOriginalLineNumber = 0;
  let lastModifiedLineNumber = 0;
  function handleAlignmentsOutsideOfDiffs(untilOriginalLineNumberExclusive, untilModifiedLineNumberExclusive) {
    while (true) {
      let origNext = originalLineHeightOverrides.peek();
      let modNext = modifiedLineHeightOverrides.peek();
      if (origNext && origNext.lineNumber >= untilOriginalLineNumberExclusive) {
        origNext = void 0;
      }
      if (modNext && modNext.lineNumber >= untilModifiedLineNumberExclusive) {
        modNext = void 0;
      }
      if (!origNext && !modNext) {
        break;
      }
      const distOrig = origNext ? origNext.lineNumber - lastOriginalLineNumber : Number.MAX_VALUE;
      const distNext = modNext ? modNext.lineNumber - lastModifiedLineNumber : Number.MAX_VALUE;
      if (distOrig < distNext) {
        originalLineHeightOverrides.dequeue();
        modNext = {
          lineNumber: origNext.lineNumber - lastOriginalLineNumber + lastModifiedLineNumber,
          heightInPx: 0
        };
      } else if (distOrig > distNext) {
        modifiedLineHeightOverrides.dequeue();
        origNext = {
          lineNumber: modNext.lineNumber - lastModifiedLineNumber + lastOriginalLineNumber,
          heightInPx: 0
        };
      } else {
        originalLineHeightOverrides.dequeue();
        modifiedLineHeightOverrides.dequeue();
      }
      result.push({
        originalRange: LineRange.ofLength(origNext.lineNumber, 1),
        modifiedRange: LineRange.ofLength(modNext.lineNumber, 1),
        originalHeightInPx: origLineHeight + origNext.heightInPx,
        modifiedHeightInPx: modLineHeight + modNext.heightInPx,
        diff: void 0
      });
    }
  }
  for (const m of diffs) {
    let emitAlignment2 = function(origLineNumberExclusive, modLineNumberExclusive, forceAlignment = false) {
      if (origLineNumberExclusive < lastOrigLineNumber || modLineNumberExclusive < lastModLineNumber) {
        return;
      }
      if (first) {
        first = false;
      } else if (!forceAlignment && (origLineNumberExclusive === lastOrigLineNumber || modLineNumberExclusive === lastModLineNumber)) {
        return;
      }
      const originalRange = new LineRange(lastOrigLineNumber, origLineNumberExclusive);
      const modifiedRange = new LineRange(lastModLineNumber, modLineNumberExclusive);
      if (originalRange.isEmpty && modifiedRange.isEmpty) {
        return;
      }
      const originalAdditionalHeight = originalLineHeightOverrides.takeWhile((v) => v.lineNumber < origLineNumberExclusive)?.reduce((p, c2) => p + c2.heightInPx, 0) ?? 0;
      const modifiedAdditionalHeight = modifiedLineHeightOverrides.takeWhile((v) => v.lineNumber < modLineNumberExclusive)?.reduce((p, c2) => p + c2.heightInPx, 0) ?? 0;
      result.push({
        originalRange,
        modifiedRange,
        originalHeightInPx: originalRange.length * origLineHeight + originalAdditionalHeight,
        modifiedHeightInPx: modifiedRange.length * modLineHeight + modifiedAdditionalHeight,
        diff: m.lineRangeMapping
      });
      lastOrigLineNumber = origLineNumberExclusive;
      lastModLineNumber = modLineNumberExclusive;
    };
    var emitAlignment = emitAlignment2;
    const c = m.lineRangeMapping;
    handleAlignmentsOutsideOfDiffs(c.original.startLineNumber, c.modified.startLineNumber);
    let first = true;
    let lastModLineNumber = c.modified.startLineNumber;
    let lastOrigLineNumber = c.original.startLineNumber;
    if (innerHunkAlignment) {
      for (const i of c.innerChanges || []) {
        if (i.originalRange.startColumn > 1 && i.modifiedRange.startColumn > 1) {
          emitAlignment2(i.originalRange.startLineNumber, i.modifiedRange.startLineNumber);
        }
        const originalModel = originalEditor.getModel();
        const maxColumn = i.originalRange.endLineNumber <= originalModel.getLineCount() ? originalModel.getLineMaxColumn(i.originalRange.endLineNumber) : Number.MAX_SAFE_INTEGER;
        if (i.originalRange.endColumn < maxColumn) {
          emitAlignment2(i.originalRange.endLineNumber, i.modifiedRange.endLineNumber);
        }
      }
    }
    emitAlignment2(c.original.endLineNumberExclusive, c.modified.endLineNumberExclusive, true);
    lastOriginalLineNumber = c.original.endLineNumberExclusive;
    lastModifiedLineNumber = c.modified.endLineNumberExclusive;
  }
  handleAlignmentsOutsideOfDiffs(Number.MAX_VALUE, Number.MAX_VALUE);
  return result;
}
function getAdditionalLineHeights(editor, viewZonesToIgnore) {
  const viewZoneHeights = [];
  const wrappingZoneHeights = [];
  const hasWrapping = editor.getOption(EditorOption.wrappingInfo).wrappingColumn !== -1;
  const coordinatesConverter = editor._getViewModel().coordinatesConverter;
  const editorLineHeight = editor.getOption(EditorOption.lineHeight);
  if (hasWrapping) {
    for (let i = 1; i <= editor.getModel().getLineCount(); i++) {
      const lineCount = coordinatesConverter.getModelLineViewLineCount(i);
      if (lineCount > 1) {
        wrappingZoneHeights.push({ lineNumber: i, heightInPx: editorLineHeight * (lineCount - 1) });
      }
    }
  }
  for (const w of editor.getWhitespaces()) {
    if (viewZonesToIgnore.has(w.id)) {
      continue;
    }
    const modelLineNumber = w.afterLineNumber === 0 ? 0 : coordinatesConverter.convertViewPositionToModelPosition(
      new Position(w.afterLineNumber, 1)
    ).lineNumber;
    viewZoneHeights.push({ lineNumber: modelLineNumber, heightInPx: w.height });
  }
  const result = joinCombine(
    viewZoneHeights,
    wrappingZoneHeights,
    (v) => v.lineNumber,
    (v1, v2) => ({ lineNumber: v1.lineNumber, heightInPx: v1.heightInPx + v2.heightInPx })
  );
  return result;
}
function allowsTrueInlineDiffRendering(mapping) {
  if (!mapping.innerChanges) {
    return false;
  }
  return mapping.innerChanges.every(
    (c) => rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange) || c.originalRange.equalsRange(new Range(1, 1, 1, 1))
  );
}
function rangeIsSingleLine(range) {
  return range.startLineNumber === range.endLineNumber;
}
export {
  DiffEditorViewZones,
  allowsTrueInlineDiffRendering,
  rangeIsSingleLine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9kaWZmRWRpdG9yVmlld1pvbmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBcnJheVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGFwcGx5Rm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9jb25maWcvZG9tRm9udEluZm8uanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uL2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBkaWZmRGVsZXRlRGVjb3JhdGlvbiwgZGlmZlJlbW92ZUljb24gfSBmcm9tICcuLi8uLi9yZWdpc3RyYXRpb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yRWRpdG9ycyB9IGZyb20gJy4uL2RpZmZFZGl0b3JFZGl0b3JzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JWaWV3TW9kZWwsIERpZmZNYXBwaW5nIH0gZnJvbSAnLi4vLi4vZGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEaWZmRGVsZXRlZENvZGVNYXJnaW4gfSBmcm9tICcuL2lubGluZURpZmZEZWxldGVkQ29kZU1hcmdpbi5qcyc7XG5pbXBvcnQgeyBMaW5lU291cmNlLCBSZW5kZXJPcHRpb25zLCByZW5kZXJMaW5lcyB9IGZyb20gJy4vcmVuZGVyTGluZXMuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGVWaWV3Wm9uZSwgYW5pbWF0ZWRPYnNlcnZhYmxlLCBqb2luQ29tYmluZSB9IGZyb20gJy4uLy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEJhY2tncm91bmRUb2tlbml6YXRpb25TdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vZGlmZkVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uLCBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUxpbmVCcmVha3NDb21wdXRlckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWxMaW5lUHJvamVjdGlvbkRhdGEuanMnO1xuXG4vKipcbiAqIEVuc3VyZXMgYm90aCBlZGl0b3JzIGhhdmUgdGhlIHNhbWUgaGVpZ2h0IGJ5IGFsaWduaW5nIHVuY2hhbmdlZCBsaW5lcy5cbiAqIEluIGlubGluZSB2aWV3IG1vZGUsIGluc2VydHMgdmlld3pvbmVzIHRvIHNob3cgZGVsZXRlZCBjb2RlIGZyb20gdGhlIG9yaWdpbmFsIHRleHQgbW9kZWwgaW4gdGhlIG1vZGlmaWVkIGNvZGUgZWRpdG9yLlxuICogU3luY2hyb25pemVzIHNjcm9sbGluZy5cbiAqXG4gKiBNYWtlIHN1cmUgdG8gYWRkIHRoZSB2aWV3IHpvbmVzIVxuICovXG5leHBvcnQgY2xhc3MgRGlmZkVkaXRvclZpZXdab25lcyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFRvcFBhZGRpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsU2Nyb2xsVG9wOiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFNjcm9sbE9mZnNldDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxTY3JvbGxPZmZzZXRBbmltYXRlZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFRvcFBhZGRpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkU2Nyb2xsVG9wOiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFNjcm9sbE9mZnNldDtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRTY3JvbGxPZmZzZXRBbmltYXRlZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdmlld1pvbmVzOiBJT2JzZXJ2YWJsZTx7IG9yaWc6IElPYnNlcnZhYmxlVmlld1pvbmVbXTsgbW9kOiBJT2JzZXJ2YWJsZVZpZXdab25lW10gfT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0V2luZG93OiBXaW5kb3csXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yczogRGlmZkVkaXRvckVkaXRvcnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZk1vZGVsOiBJT2JzZXJ2YWJsZTxEaWZmRWRpdG9yVmlld01vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBEaWZmRWRpdG9yT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmRWRpdG9yV2lkZ2V0OiBEaWZmRWRpdG9yV2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nhbklnbm9yZVZpZXdab25lVXBkYXRlRXZlbnQ6ICgpID0+IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ1ZpZXdab25lc1RvSWdub3JlOiBTZXQ8c3RyaW5nPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RWaWV3Wm9uZXNUb0lnbm9yZTogU2V0PHN0cmluZz4sXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9vcmlnaW5hbFRvcFBhZGRpbmcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdFx0dGhpcy5fb3JpZ2luYWxTY3JvbGxPZmZzZXQgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyLCBib29sZWFuPih0aGlzLCAwKTtcblx0XHR0aGlzLl9vcmlnaW5hbFNjcm9sbE9mZnNldEFuaW1hdGVkID0gYW5pbWF0ZWRPYnNlcnZhYmxlKHRoaXMuX3RhcmdldFdpbmRvdywgdGhpcy5fb3JpZ2luYWxTY3JvbGxPZmZzZXQsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9tb2RpZmllZFRvcFBhZGRpbmcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdFx0dGhpcy5fbW9kaWZpZWRTY3JvbGxPZmZzZXQgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyLCBib29sZWFuPih0aGlzLCAwKTtcblx0XHR0aGlzLl9tb2RpZmllZFNjcm9sbE9mZnNldEFuaW1hdGVkID0gYW5pbWF0ZWRPYnNlcnZhYmxlKHRoaXMuX3RhcmdldFdpbmRvdywgdGhpcy5fbW9kaWZpZWRTY3JvbGxPZmZzZXQsIHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdpbnZhbGlkYXRlQWxpZ25tZW50c1N0YXRlJywgMCk7XG5cblx0XHRjb25zdCB1cGRhdGVJbW1lZGlhdGVseSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHN0YXRlLnNldChzdGF0ZS5nZXQoKSArIDEsIHVuZGVmaW5lZCk7XG5cdFx0fSwgMCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5vbkRpZENoYW5nZVZpZXdab25lcygoX2FyZ3MpID0+IHsgaWYgKCF0aGlzLl9jYW5JZ25vcmVWaWV3Wm9uZVVwZGF0ZUV2ZW50KCkpIHsgdXBkYXRlSW1tZWRpYXRlbHkuc2NoZWR1bGUoKTsgfSB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9ycy5tb2RpZmllZC5vbkRpZENoYW5nZVZpZXdab25lcygoX2FyZ3MpID0+IHsgaWYgKCF0aGlzLl9jYW5JZ25vcmVWaWV3Wm9uZVVwZGF0ZUV2ZW50KCkpIHsgdXBkYXRlSW1tZWRpYXRlbHkuc2NoZWR1bGUoKTsgfSB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGFyZ3MpID0+IHtcblx0XHRcdGlmIChhcmdzLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5mbykgfHwgYXJncy5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSkgeyB1cGRhdGVJbW1lZGlhdGVseS5zY2hlZHVsZSgpOyB9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChhcmdzKSA9PiB7XG5cdFx0XHRpZiAoYXJncy5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pIHx8IGFyZ3MuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZUhlaWdodCkpIHsgdXBkYXRlSW1tZWRpYXRlbHkuc2NoZWR1bGUoKTsgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWxUb2tlbml6YXRpb25Db21wbGV0ZWQgPSB0aGlzLl9kaWZmTW9kZWwubWFwKG0gPT5cblx0XHRcdG0gPyBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIG0ubW9kZWwub3JpZ2luYWwub25EaWRDaGFuZ2VUb2tlbnMsICgpID0+IG0ubW9kZWwub3JpZ2luYWwudG9rZW5pemF0aW9uLmJhY2tncm91bmRUb2tlbml6YXRpb25TdGF0ZSA9PT0gQmFja2dyb3VuZFRva2VuaXphdGlvblN0YXRlLkNvbXBsZXRlZCkgOiB1bmRlZmluZWRcblx0XHQpLm1hcCgobSwgcmVhZGVyKSA9PiBtPy5yZWFkKHJlYWRlcikpO1xuXG5cdFx0Y29uc3QgYWxpZ25tZW50cyA9IGRlcml2ZWQ8SUxpbmVSYW5nZUFsaWdubWVudFtdIHwgbnVsbD4oKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBhbGlnbm1lbnRzICovXG5cdFx0XHRjb25zdCBkaWZmTW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZGlmZiA9IGRpZmZNb2RlbD8uZGlmZi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWRpZmZNb2RlbCB8fCAhZGlmZikgeyByZXR1cm4gbnVsbDsgfVxuXHRcdFx0c3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVuZGVyU2lkZUJ5U2lkZSA9IHRoaXMuX29wdGlvbnMucmVuZGVyU2lkZUJ5U2lkZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpbm5lckh1bmtBbGlnbm1lbnQgPSByZW5kZXJTaWRlQnlTaWRlO1xuXHRcdFx0cmV0dXJuIGNvbXB1dGVSYW5nZUFsaWdubWVudChcblx0XHRcdFx0dGhpcy5fZWRpdG9ycy5vcmlnaW5hbCxcblx0XHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZCxcblx0XHRcdFx0ZGlmZi5tYXBwaW5ncyxcblx0XHRcdFx0dGhpcy5fb3JpZ1ZpZXdab25lc1RvSWdub3JlLFxuXHRcdFx0XHR0aGlzLl9tb2RWaWV3Wm9uZXNUb0lnbm9yZSxcblx0XHRcdFx0aW5uZXJIdW5rQWxpZ25tZW50XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWxpZ25tZW50c1N5bmNlZE1vdmVkVGV4dCA9IGRlcml2ZWQ8SUxpbmVSYW5nZUFsaWdubWVudFtdIHwgbnVsbD4oKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBhbGlnbm1lbnRzU3luY2VkTW92ZWRUZXh0ICovXG5cdFx0XHRjb25zdCBzeW5jZWRNb3ZlZFRleHQgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpPy5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzeW5jZWRNb3ZlZFRleHQpIHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdHN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1hcHBpbmdzID0gc3luY2VkTW92ZWRUZXh0LmNoYW5nZXMubWFwKGMgPT4gbmV3IERpZmZNYXBwaW5nKGMpKTtcblx0XHRcdC8vIFRPRE8gZG9udCBpbmNsdWRlIGFsaWdubWVudHMgb3V0c2lkZSBzeW5jZWRNb3ZlZFRleHRcblx0XHRcdHJldHVybiBjb21wdXRlUmFuZ2VBbGlnbm1lbnQoXG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwsXG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQsXG5cdFx0XHRcdG1hcHBpbmdzLFxuXHRcdFx0XHR0aGlzLl9vcmlnVmlld1pvbmVzVG9JZ25vcmUsXG5cdFx0XHRcdHRoaXMuX21vZFZpZXdab25lc1RvSWdub3JlLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlRmFrZUxpbmVzRGl2KCk6IEhUTUxFbGVtZW50IHtcblx0XHRcdGNvbnN0IHIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHIuY2xhc3NOYW1lID0gJ2RpYWdvbmFsLWZpbGwnO1xuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxpZ25tZW50Vmlld1pvbmVzRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMudmlld1pvbmVzID0gZGVyaXZlZDx7IG9yaWc6IElPYnNlcnZhYmxlVmlld1pvbmVbXTsgbW9kOiBJT2JzZXJ2YWJsZVZpZXdab25lW10gfT4odGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdFx0YWxpZ25tZW50Vmlld1pvbmVzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3QgYWxpZ25tZW50c1ZhbCA9IGFsaWdubWVudHMucmVhZChyZWFkZXIpIHx8IFtdO1xuXG5cdFx0XHRjb25zdCBvcmlnVmlld1pvbmVzOiBJT2JzZXJ2YWJsZVZpZXdab25lW10gPSBbXTtcblx0XHRcdGNvbnN0IG1vZFZpZXdab25lczogSU9ic2VydmFibGVWaWV3Wm9uZVtdID0gW107XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkVG9wUGFkZGluZ1ZhbCA9IHRoaXMuX21vZGlmaWVkVG9wUGFkZGluZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAobW9kaWZpZWRUb3BQYWRkaW5nVmFsID4gMCkge1xuXHRcdFx0XHRtb2RWaWV3Wm9uZXMucHVzaCh7XG5cdFx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiAwLFxuXHRcdFx0XHRcdGRvbU5vZGU6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0XHRcdGhlaWdodEluUHg6IG1vZGlmaWVkVG9wUGFkZGluZ1ZhbCxcblx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRzdXBwcmVzc01vdXNlRG93bjogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvcmlnaW5hbFRvcFBhZGRpbmdWYWwgPSB0aGlzLl9vcmlnaW5hbFRvcFBhZGRpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKG9yaWdpbmFsVG9wUGFkZGluZ1ZhbCA+IDApIHtcblx0XHRcdFx0b3JpZ1ZpZXdab25lcy5wdXNoKHtcblx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IDAsXG5cdFx0XHRcdFx0ZG9tTm9kZTogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRcdFx0aGVpZ2h0SW5QeDogb3JpZ2luYWxUb3BQYWRkaW5nVmFsLFxuXHRcdFx0XHRcdHNob3dJbkhpZGRlbkFyZWFzOiB0cnVlLFxuXHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVuZGVyU2lkZUJ5U2lkZSA9IHRoaXMuX29wdGlvbnMucmVuZGVyU2lkZUJ5U2lkZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjb250ZXh0OiBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdFx0Z2V0TGluZUNvbnRlbnQ6IChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRMaW5lSW5qZWN0ZWRUZXh0OiAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBkZWxldGVkQ29kZUxpbmVCcmVha3NDb21wdXRlciA9ICFyZW5kZXJTaWRlQnlTaWRlID8gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5fZ2V0Vmlld01vZGVsKCk/LmNyZWF0ZUxpbmVCcmVha3NDb21wdXRlcihjb250ZXh0KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChkZWxldGVkQ29kZUxpbmVCcmVha3NDb21wdXRlcikge1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbE1vZGVsID0gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5nZXRNb2RlbCgpITtcblx0XHRcdFx0Zm9yIChjb25zdCBhIG9mIGFsaWdubWVudHNWYWwpIHtcblx0XHRcdFx0XHRpZiAoYS5kaWZmKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gYS5vcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaSA8IGEub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Ly8gYGlgIGNhbiBiZSBvdXQgb2YgYm91bmQgd2hlbiB0aGUgZGlmZiBoYXMgbm90IGJlZW4gdXBkYXRlZCB5ZXQuXG5cdFx0XHRcdFx0XHRcdC8vIEluIHRoaXMgY2FzZSwgd2UgZG8gYW4gZWFybHkgcmV0dXJuLlxuXHRcdFx0XHRcdFx0XHQvLyBUT0RPQGhlZGlldDogRml4IHRoaXMgYnkgYXBwbHlpbmcgdGhlIGVkaXQgZGlyZWN0bHkgdG8gdGhlIGRpZmYgbW9kZWwsIHNvIHRoYXQgdGhlIGRpZmYgaXMgYWx3YXlzIHZhbGlkLlxuXHRcdFx0XHRcdFx0XHRpZiAoaSA+IG9yaWdpbmFsTW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBvcmlnOiBvcmlnVmlld1pvbmVzLCBtb2Q6IG1vZFZpZXdab25lcyB9O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGRlbGV0ZWRDb2RlTGluZUJyZWFrc0NvbXB1dGVyPy5hZGRSZXF1ZXN0KGksIG51bGwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lQnJlYWtEYXRhID0gZGVsZXRlZENvZGVMaW5lQnJlYWtzQ29tcHV0ZXI/LmZpbmFsaXplKCkgPz8gW107XG5cdFx0XHRsZXQgbGluZUJyZWFrRGF0YUlkeCA9IDA7XG5cblx0XHRcdGNvbnN0IG1vZExpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cblx0XHRcdGNvbnN0IHN5bmNlZE1vdmVkVGV4dCA9IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcik/Lm1vdmVkVGV4dFRvQ29tcGFyZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkgPSB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldE1vZGVsKCk/Lm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IG1pZ2h0Q29udGFpblJUTCA9IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuZ2V0TW9kZWwoKT8ubWlnaHRDb250YWluUlRMKCkgPz8gZmFsc2U7XG5cdFx0XHRjb25zdCByZW5kZXJPcHRpb25zID0gUmVuZGVyT3B0aW9ucy5mcm9tRWRpdG9yKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGEgb2YgYWxpZ25tZW50c1ZhbCkge1xuXHRcdFx0XHRpZiAoYS5kaWZmICYmICFyZW5kZXJTaWRlQnlTaWRlICYmICghdGhpcy5fb3B0aW9ucy51c2VUcnVlSW5saW5lRGlmZlJlbmRlcmluZy5yZWFkKHJlYWRlcikgfHwgIWFsbG93c1RydWVJbmxpbmVEaWZmUmVuZGVyaW5nKGEuZGlmZikpKSB7XG5cdFx0XHRcdFx0aWYgKCFhLm9yaWdpbmFsUmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWxNb2RlbFRva2VuaXphdGlvbkNvbXBsZXRlZC5yZWFkKHJlYWRlcik7IC8vIFVwZGF0ZSB2aWV3LXpvbmVzIG9uY2UgdG9rZW5pemF0aW9uIGNvbXBsZXRlc1xuXG5cdFx0XHRcdFx0XHRjb25zdCBkZWxldGVkQ29kZURvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHRcdGRlbGV0ZWRDb2RlRG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd2aWV3LWxpbmVzJywgJ2xpbmUtZGVsZXRlJywgJ2xpbmUtZGVsZXRlLXNlbGVjdGFibGUnLCAnbW9uYWNvLW1vdXNlLWN1cnNvci10ZXh0Jyk7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbE1vZGVsID0gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRcdC8vIGBhLm9yaWdpbmFsUmFuZ2VgIGNhbiBiZSBvdXQgb2YgYm91bmQgd2hlbiB0aGUgZGlmZiBoYXMgbm90IGJlZW4gdXBkYXRlZCB5ZXQuXG5cdFx0XHRcdFx0XHQvLyBJbiB0aGlzIGNhc2UsIHdlIGRvIGFuIGVhcmx5IHJldHVybi5cblx0XHRcdFx0XHRcdC8vIFRPRE9AaGVkaWV0OiBGaXggdGhpcyBieSBhcHBseWluZyB0aGUgZWRpdCBkaXJlY3RseSB0byB0aGUgZGlmZiBtb2RlbCwgc28gdGhhdCB0aGUgZGlmZiBpcyBhbHdheXMgdmFsaWQuXG5cdFx0XHRcdFx0XHRpZiAoYS5vcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxID4gb3JpZ2luYWxNb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBvcmlnOiBvcmlnVmlld1pvbmVzLCBtb2Q6IG1vZFZpZXdab25lcyB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IExpbmVTb3VyY2UoXG5cdFx0XHRcdFx0XHRcdGEub3JpZ2luYWxSYW5nZS5tYXBUb0xpbmVBcnJheShsID0+IG9yaWdpbmFsTW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobCkpLFxuXHRcdFx0XHRcdFx0XHRhLm9yaWdpbmFsUmFuZ2UubWFwVG9MaW5lQXJyYXkoXyA9PiBsaW5lQnJlYWtEYXRhW2xpbmVCcmVha0RhdGFJZHgrK10pLFxuXHRcdFx0XHRcdFx0XHRtaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJLFxuXHRcdFx0XHRcdFx0XHRtaWdodENvbnRhaW5SVEwsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElubGluZURlY29yYXRpb25bXSA9IFtdO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBpIG9mIGEuZGlmZi5pbm5lckNoYW5nZXMgfHwgW10pIHtcblx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaChuZXcgSW5saW5lRGVjb3JhdGlvbihcblx0XHRcdFx0XHRcdFx0XHRpLm9yaWdpbmFsUmFuZ2UuZGVsdGEoLShhLmRpZmYub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyIC0gMSkpLFxuXHRcdFx0XHRcdFx0XHRcdGRpZmZEZWxldGVEZWNvcmF0aW9uLmNsYXNzTmFtZSEsXG5cdFx0XHRcdFx0XHRcdFx0SW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhclxuXHRcdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlbmRlckxpbmVzKHNvdXJjZSwgcmVuZGVyT3B0aW9ucywgZGVjb3JhdGlvbnMsIGRlbGV0ZWRDb2RlRG9tTm9kZSk7XG5cblx0XHRcdFx0XHRcdGNvbnN0IG1hcmdpbkRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHRcdG1hcmdpbkRvbU5vZGUuY2xhc3NOYW1lID0gJ2lubGluZS1kZWxldGVkLW1hcmdpbi12aWV3LXpvbmUnO1xuXHRcdFx0XHRcdFx0YXBwbHlGb250SW5mbyhtYXJnaW5Eb21Ob2RlLCByZW5kZXJPcHRpb25zLmZvbnRJbmZvKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX29wdGlvbnMucmVuZGVySW5kaWNhdG9ycy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXN1bHQuaGVpZ2h0SW5MaW5lczsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbWFyZ2luRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRcdFx0XHRcdG1hcmdpbkVsZW1lbnQuY2xhc3NOYW1lID0gYGRlbGV0ZS1zaWduICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGRpZmZSZW1vdmVJY29uKX1gO1xuXHRcdFx0XHRcdFx0XHRcdG1hcmdpbkVsZW1lbnQuc2V0QXR0cmlidXRlKCdzdHlsZScsIGBwb3NpdGlvbjphYnNvbHV0ZTt0b3A6JHtpICogbW9kTGluZUhlaWdodH1weDt3aWR0aDoke3JlbmRlck9wdGlvbnMubGluZURlY29yYXRpb25zV2lkdGh9cHg7aGVpZ2h0OiR7bW9kTGluZUhlaWdodH1weDtyaWdodDowO2ApO1xuXHRcdFx0XHRcdFx0XHRcdG1hcmdpbkRvbU5vZGUuYXBwZW5kQ2hpbGQobWFyZ2luRWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0bGV0IHpvbmVJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0YWxpZ25tZW50Vmlld1pvbmVzRGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0XHRcdFx0XHRuZXcgSW5saW5lRGlmZkRlbGV0ZWRDb2RlTWFyZ2luKFxuXHRcdFx0XHRcdFx0XHRcdCgpID0+IGFzc2VydFJldHVybnNEZWZpbmVkKHpvbmVJZCksXG5cdFx0XHRcdFx0XHRcdFx0bWFyZ2luRG9tTm9kZSxcblx0XHRcdFx0XHRcdFx0XHRkZWxldGVkQ29kZURvbU5vZGUsXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZCxcblx0XHRcdFx0XHRcdFx0XHRhLmRpZmYsXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fZGlmZkVkaXRvcldpZGdldCxcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5nZXRNb2RlbCgpISxcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fY2xpcGJvYXJkU2VydmljZSxcblx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXN1bHQudmlld0xpbmVDb3VudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY291bnQgPSByZXN1bHQudmlld0xpbmVDb3VudHNbaV07XG5cdFx0XHRcdFx0XHRcdC8vIEFjY291bnQgZm9yIHdyYXBwZWQgbGluZXMgaW4gdGhlIChjb2xsYXBzZWQpIG9yaWdpbmFsIGVkaXRvciAod2hpY2ggZG9lc24ndCB3cmFwIGxpbmVzKS5cblx0XHRcdFx0XHRcdFx0aWYgKGNvdW50ID4gMSkge1xuXHRcdFx0XHRcdFx0XHRcdG9yaWdWaWV3Wm9uZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IGEub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIgKyBpLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZG9tTm9kZTogY3JlYXRlRmFrZUxpbmVzRGl2KCksXG5cdFx0XHRcdFx0XHRcdFx0XHRoZWlnaHRJblB4OiAoY291bnQgLSAxKSAqIG1vZExpbmVIZWlnaHQsXG5cdFx0XHRcdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdG1vZFZpZXdab25lcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiBhLm1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSxcblx0XHRcdFx0XHRcdFx0ZG9tTm9kZTogZGVsZXRlZENvZGVEb21Ob2RlLFxuXHRcdFx0XHRcdFx0XHRoZWlnaHRJblB4OiByZXN1bHQuaGVpZ2h0SW5MaW5lcyAqIG1vZExpbmVIZWlnaHQsXG5cdFx0XHRcdFx0XHRcdG1pbldpZHRoSW5QeDogcmVzdWx0Lm1pbldpZHRoSW5QeCxcblx0XHRcdFx0XHRcdFx0bWFyZ2luRG9tTm9kZSxcblx0XHRcdFx0XHRcdFx0c2V0Wm9uZUlkKGlkKSB7IHpvbmVJZCA9IGlkOyB9LFxuXHRcdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c3VwcHJlc3NNb3VzZURvd246IGZhbHNlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgbWFyZ2luRG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRcdG1hcmdpbkRvbU5vZGUuY2xhc3NOYW1lID0gJ2d1dHRlci1kZWxldGUnO1xuXG5cdFx0XHRcdFx0b3JpZ1ZpZXdab25lcy5wdXNoKHtcblx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogYS5vcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0XHRcdFx0ZG9tTm9kZTogY3JlYXRlRmFrZUxpbmVzRGl2KCksXG5cdFx0XHRcdFx0XHRoZWlnaHRJblB4OiBhLm1vZGlmaWVkSGVpZ2h0SW5QeCxcblx0XHRcdFx0XHRcdG1hcmdpbkRvbU5vZGUsXG5cdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGRlbHRhID0gYS5tb2RpZmllZEhlaWdodEluUHggLSBhLm9yaWdpbmFsSGVpZ2h0SW5QeDtcblx0XHRcdFx0XHRpZiAoZGVsdGEgPiAwKSB7XG5cdFx0XHRcdFx0XHRpZiAoc3luY2VkTW92ZWRUZXh0Py5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmRlbHRhKC0xKS5kZWx0YUxlbmd0aCgyKS5jb250YWlucyhhLm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRvcmlnVmlld1pvbmVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IGEub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0XHRcdFx0ZG9tTm9kZTogY3JlYXRlRmFrZUxpbmVzRGl2KCksXG5cdFx0XHRcdFx0XHRcdGhlaWdodEluUHg6IGRlbHRhLFxuXHRcdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c3VwcHJlc3NNb3VzZURvd246IHRydWUsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKHN5bmNlZE1vdmVkVGV4dD8ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5kZWx0YSgtMSkuZGVsdGFMZW5ndGgoMikuY29udGFpbnMoYS5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0ZnVuY3Rpb24gY3JlYXRlVmlld1pvbmVNYXJnaW5BcnJvdygpOiBIVE1MRWxlbWVudCB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFycm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0XHRcdGFycm93LmNsYXNzTmFtZSA9ICdhcnJvdy1yZXZlcnQtY2hhbmdlICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5hcnJvd1JpZ2h0KTtcblx0XHRcdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYXJyb3csICdtb3VzZWRvd24nLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblx0XHRcdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYXJyb3csICdjbGljaycsIGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHRcdFx0X2RpZmZFZGl0b3JXaWRnZXQucmV2ZXJ0KGEuZGlmZiEpO1xuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAkKCdkaXYnLCB7fSwgYXJyb3cpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRsZXQgbWFyZ2luRG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAoYS5kaWZmICYmIGEuZGlmZi5tb2RpZmllZC5pc0VtcHR5ICYmIHRoaXMuX29wdGlvbnMuc2hvdWxkUmVuZGVyT2xkUmV2ZXJ0QXJyb3dzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdFx0XHRtYXJnaW5Eb21Ob2RlID0gY3JlYXRlVmlld1pvbmVNYXJnaW5BcnJvdygpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRtb2RWaWV3Wm9uZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogYS5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0XHRcdFx0XHRkb21Ob2RlOiBjcmVhdGVGYWtlTGluZXNEaXYoKSxcblx0XHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogLWRlbHRhLFxuXHRcdFx0XHRcdFx0XHRtYXJnaW5Eb21Ob2RlLFxuXHRcdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c3VwcHJlc3NNb3VzZURvd246IHRydWUsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBhIG9mIGFsaWdubWVudHNTeW5jZWRNb3ZlZFRleHQucmVhZChyZWFkZXIpID8/IFtdKSB7XG5cdFx0XHRcdGlmICghc3luY2VkTW92ZWRUZXh0Py5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmludGVyc2VjdChhLm9yaWdpbmFsUmFuZ2UpXG5cdFx0XHRcdFx0fHwgIXN5bmNlZE1vdmVkVGV4dD8ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5pbnRlcnNlY3QoYS5tb2RpZmllZFJhbmdlKSkge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSB1bnJlbGF0ZWQgYWxpZ25tZW50cyBvdXRzaWRlIHRoZSBzeW5jZWQgbW92ZWQgdGV4dFxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGVsdGEgPSBhLm1vZGlmaWVkSGVpZ2h0SW5QeCAtIGEub3JpZ2luYWxIZWlnaHRJblB4O1xuXHRcdFx0XHRpZiAoZGVsdGEgPiAwKSB7XG5cdFx0XHRcdFx0b3JpZ1ZpZXdab25lcy5wdXNoKHtcblx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogYS5vcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0XHRcdFx0ZG9tTm9kZTogY3JlYXRlRmFrZUxpbmVzRGl2KCksXG5cdFx0XHRcdFx0XHRoZWlnaHRJblB4OiBkZWx0YSxcblx0XHRcdFx0XHRcdHNob3dJbkhpZGRlbkFyZWFzOiB0cnVlLFxuXHRcdFx0XHRcdFx0c3VwcHJlc3NNb3VzZURvd246IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bW9kVmlld1pvbmVzLnB1c2goe1xuXHRcdFx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiBhLm1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBjcmVhdGVGYWtlTGluZXNEaXYoKSxcblx0XHRcdFx0XHRcdGhlaWdodEluUHg6IC1kZWx0YSxcblx0XHRcdFx0XHRcdHNob3dJbkhpZGRlbkFyZWFzOiB0cnVlLFxuXHRcdFx0XHRcdFx0c3VwcHJlc3NNb3VzZURvd246IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgb3JpZzogb3JpZ1ZpZXdab25lcywgbW9kOiBtb2RWaWV3Wm9uZXMgfTtcblx0XHR9KTtcblxuXHRcdGxldCBpZ25vcmVDaGFuZ2UgPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLm9uRGlkU2Nyb2xsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsTGVmdENoYW5nZWQgJiYgIWlnbm9yZUNoYW5nZSkge1xuXHRcdFx0XHRpZ25vcmVDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnNldFNjcm9sbExlZnQoZS5zY3JvbGxMZWZ0KTtcblx0XHRcdFx0aWdub3JlQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQub25EaWRTY3JvbGxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5zY3JvbGxMZWZ0Q2hhbmdlZCAmJiAhaWdub3JlQ2hhbmdlKSB7XG5cdFx0XHRcdGlnbm9yZUNoYW5nZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuc2V0U2Nyb2xsTGVmdChlLnNjcm9sbExlZnQpO1xuXHRcdFx0XHRpZ25vcmVDaGFuZ2UgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9vcmlnaW5hbFNjcm9sbFRvcCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5vbkRpZFNjcm9sbENoYW5nZSwgKCkgPT4gLyoqIEBkZXNjcmlwdGlvbiBvcmlnaW5hbC5nZXRTY3JvbGxUb3AgKi8gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5nZXRTY3JvbGxUb3AoKSk7XG5cdFx0dGhpcy5fbW9kaWZpZWRTY3JvbGxUb3AgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuX2VkaXRvcnMubW9kaWZpZWQub25EaWRTY3JvbGxDaGFuZ2UsICgpID0+IC8qKiBAZGVzY3JpcHRpb24gbW9kaWZpZWQuZ2V0U2Nyb2xsVG9wICovIHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuZ2V0U2Nyb2xsVG9wKCkpO1xuXG5cdFx0Ly8gb3JpZ0V4dHJhSGVpZ2h0ICsgb3JpZ09mZnNldCAtIG9yaWdTY3JvbGxUb3AgPSBtb2RFeHRyYUhlaWdodCArIG1vZE9mZnNldCAtIG1vZFNjcm9sbFRvcFxuXG5cdFx0Ly8gb3JpZ1Njcm9sbFRvcCA9IG9yaWdFeHRyYUhlaWdodCArIG9yaWdPZmZzZXQgLSBtb2RFeHRyYUhlaWdodCAtIG1vZE9mZnNldCArIG1vZFNjcm9sbFRvcFxuXHRcdC8vIG1vZFNjcm9sbFRvcCA9IG1vZEV4dHJhSGVpZ2h0ICsgbW9kT2Zmc2V0IC0gb3JpZ0V4dHJhSGVpZ2h0IC0gb3JpZ09mZnNldCArIG9yaWdTY3JvbGxUb3BcblxuXHRcdC8vIG9yaWdPZmZzZXQgLSBtb2RPZmZzZXQgPSBoZWlnaHRPZkxpbmVzKDEuLlkpIC0gaGVpZ2h0T2ZMaW5lcygxLi5YKVxuXHRcdC8vIG9yaWdTY3JvbGxUb3AgPj0gMCwgbW9kU2Nyb2xsVG9wID49IDBcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIHNjcm9sbCBtb2RpZmllZCAqL1xuXHRcdFx0Y29uc3QgbmV3U2Nyb2xsVG9wTW9kaWZpZWQgPSB0aGlzLl9vcmlnaW5hbFNjcm9sbFRvcC5yZWFkKHJlYWRlcilcblx0XHRcdFx0LSAodGhpcy5fb3JpZ2luYWxTY3JvbGxPZmZzZXRBbmltYXRlZC5yZWFkKHVuZGVmaW5lZCkgLSB0aGlzLl9tb2RpZmllZFNjcm9sbE9mZnNldEFuaW1hdGVkLnJlYWQocmVhZGVyKSlcblx0XHRcdFx0LSAodGhpcy5fb3JpZ2luYWxUb3BQYWRkaW5nLnJlYWQodW5kZWZpbmVkKSAtIHRoaXMuX21vZGlmaWVkVG9wUGFkZGluZy5yZWFkKHJlYWRlcikpO1xuXHRcdFx0aWYgKG5ld1Njcm9sbFRvcE1vZGlmaWVkICE9PSB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmdldFNjcm9sbFRvcCgpKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuc2V0U2Nyb2xsVG9wKG5ld1Njcm9sbFRvcE1vZGlmaWVkLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgc2Nyb2xsIG9yaWdpbmFsICovXG5cdFx0XHRjb25zdCBuZXdTY3JvbGxUb3BPcmlnaW5hbCA9IHRoaXMuX21vZGlmaWVkU2Nyb2xsVG9wLnJlYWQocmVhZGVyKVxuXHRcdFx0XHQtICh0aGlzLl9tb2RpZmllZFNjcm9sbE9mZnNldEFuaW1hdGVkLnJlYWQodW5kZWZpbmVkKSAtIHRoaXMuX29yaWdpbmFsU2Nyb2xsT2Zmc2V0QW5pbWF0ZWQucmVhZChyZWFkZXIpKVxuXHRcdFx0XHQtICh0aGlzLl9tb2RpZmllZFRvcFBhZGRpbmcucmVhZCh1bmRlZmluZWQpIC0gdGhpcy5fb3JpZ2luYWxUb3BQYWRkaW5nLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRpZiAobmV3U2Nyb2xsVG9wT3JpZ2luYWwgIT09IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuZ2V0U2Nyb2xsVG9wKCkpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5zZXRTY3JvbGxUb3AobmV3U2Nyb2xsVG9wT3JpZ2luYWwsIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIGVkaXRvciB0b3Agb2Zmc2V0cyAqL1xuXHRcdFx0Y29uc3QgbSA9IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcik/Lm1vdmVkVGV4dFRvQ29tcGFyZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBkZWx0YU9yaWdUb01vZCA9IDA7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRjb25zdCB0cnVlVG9wT3JpZ2luYWwgPSB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldFRvcEZvckxpbmVOdW1iZXIobS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciwgdHJ1ZSkgLSB0aGlzLl9vcmlnaW5hbFRvcFBhZGRpbmcucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCB0cnVlVG9wTW9kaWZpZWQgPSB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmdldFRvcEZvckxpbmVOdW1iZXIobS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciwgdHJ1ZSkgLSB0aGlzLl9tb2RpZmllZFRvcFBhZGRpbmcucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0XHRkZWx0YU9yaWdUb01vZCA9IHRydWVUb3BNb2RpZmllZCAtIHRydWVUb3BPcmlnaW5hbDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRlbHRhT3JpZ1RvTW9kID4gMCkge1xuXHRcdFx0XHR0aGlzLl9tb2RpZmllZFRvcFBhZGRpbmcuc2V0KDAsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuX29yaWdpbmFsVG9wUGFkZGluZy5zZXQoZGVsdGFPcmlnVG9Nb2QsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGRlbHRhT3JpZ1RvTW9kIDwgMCkge1xuXHRcdFx0XHR0aGlzLl9tb2RpZmllZFRvcFBhZGRpbmcuc2V0KC1kZWx0YU9yaWdUb01vZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fb3JpZ2luYWxUb3BQYWRkaW5nLnNldCgwLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbW9kaWZpZWRUb3BQYWRkaW5nLnNldCgwLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuX29yaWdpbmFsVG9wUGFkZGluZy5zZXQoMCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSwgNDAwKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdFx0dGhpcy5fb3JpZ2luYWxTY3JvbGxPZmZzZXQuc2V0KHRoaXMuX21vZGlmaWVkU2Nyb2xsT2Zmc2V0LnJlYWQodW5kZWZpbmVkKSAtIGRlbHRhT3JpZ1RvTW9kLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbW9kaWZpZWRTY3JvbGxPZmZzZXQuc2V0KHRoaXMuX29yaWdpbmFsU2Nyb2xsT2Zmc2V0LnJlYWQodW5kZWZpbmVkKSArIGRlbHRhT3JpZ1RvTW9kLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUxpbmVSYW5nZUFsaWdubWVudCB7XG5cdG9yaWdpbmFsUmFuZ2U6IExpbmVSYW5nZTtcblx0bW9kaWZpZWRSYW5nZTogTGluZVJhbmdlO1xuXG5cdC8vIGFjY291bnRzIGZvciBmb3JlaWduIHZpZXd6b25lcyBhbmQgbGluZSB3cmFwcGluZ1xuXHRvcmlnaW5hbEhlaWdodEluUHg6IG51bWJlcjtcblx0bW9kaWZpZWRIZWlnaHRJblB4OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIElmIHRoaXMgcmFuZ2UgYWxpZ25tZW50IGlzIGEgZGlyZWN0IHJlc3VsdCBvZiBhIGRpZmYsIHRoZW4gdGhpcyBpcyB0aGUgZGlmZidzIGxpbmUgbWFwcGluZy5cblx0ICogT25seSB1c2VkIGZvciBpbmxpbmUtdmlldy5cblx0ICovXG5cdGRpZmY/OiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmc7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSYW5nZUFsaWdubWVudChcblx0b3JpZ2luYWxFZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQsXG5cdG1vZGlmaWVkRWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LFxuXHRkaWZmczogcmVhZG9ubHkgRGlmZk1hcHBpbmdbXSxcblx0b3JpZ2luYWxFZGl0b3JBbGlnbm1lbnRWaWV3Wm9uZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4sXG5cdG1vZGlmaWVkRWRpdG9yQWxpZ25tZW50Vmlld1pvbmVzOiBSZWFkb25seVNldDxzdHJpbmc+LFxuXHRpbm5lckh1bmtBbGlnbm1lbnQ6IGJvb2xlYW4sXG4pOiBJTGluZVJhbmdlQWxpZ25tZW50W10ge1xuXHRjb25zdCBvcmlnaW5hbExpbmVIZWlnaHRPdmVycmlkZXMgPSBuZXcgQXJyYXlRdWV1ZShnZXRBZGRpdGlvbmFsTGluZUhlaWdodHMob3JpZ2luYWxFZGl0b3IsIG9yaWdpbmFsRWRpdG9yQWxpZ25tZW50Vmlld1pvbmVzKSk7XG5cdGNvbnN0IG1vZGlmaWVkTGluZUhlaWdodE92ZXJyaWRlcyA9IG5ldyBBcnJheVF1ZXVlKGdldEFkZGl0aW9uYWxMaW5lSGVpZ2h0cyhtb2RpZmllZEVkaXRvciwgbW9kaWZpZWRFZGl0b3JBbGlnbm1lbnRWaWV3Wm9uZXMpKTtcblxuXHRjb25zdCBvcmlnTGluZUhlaWdodCA9IG9yaWdpbmFsRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdGNvbnN0IG1vZExpbmVIZWlnaHQgPSBtb2RpZmllZEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXG5cdGNvbnN0IHJlc3VsdDogSUxpbmVSYW5nZUFsaWdubWVudFtdID0gW107XG5cblx0bGV0IGxhc3RPcmlnaW5hbExpbmVOdW1iZXIgPSAwO1xuXHRsZXQgbGFzdE1vZGlmaWVkTGluZU51bWJlciA9IDA7XG5cblx0ZnVuY3Rpb24gaGFuZGxlQWxpZ25tZW50c091dHNpZGVPZkRpZmZzKHVudGlsT3JpZ2luYWxMaW5lTnVtYmVyRXhjbHVzaXZlOiBudW1iZXIsIHVudGlsTW9kaWZpZWRMaW5lTnVtYmVyRXhjbHVzaXZlOiBudW1iZXIpIHtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IG9yaWdOZXh0ID0gb3JpZ2luYWxMaW5lSGVpZ2h0T3ZlcnJpZGVzLnBlZWsoKTtcblx0XHRcdGxldCBtb2ROZXh0ID0gbW9kaWZpZWRMaW5lSGVpZ2h0T3ZlcnJpZGVzLnBlZWsoKTtcblx0XHRcdGlmIChvcmlnTmV4dCAmJiBvcmlnTmV4dC5saW5lTnVtYmVyID49IHVudGlsT3JpZ2luYWxMaW5lTnVtYmVyRXhjbHVzaXZlKSB7XG5cdFx0XHRcdG9yaWdOZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZE5leHQgJiYgbW9kTmV4dC5saW5lTnVtYmVyID49IHVudGlsTW9kaWZpZWRMaW5lTnVtYmVyRXhjbHVzaXZlKSB7XG5cdFx0XHRcdG1vZE5leHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW9yaWdOZXh0ICYmICFtb2ROZXh0KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXN0T3JpZyA9IG9yaWdOZXh0ID8gb3JpZ05leHQubGluZU51bWJlciAtIGxhc3RPcmlnaW5hbExpbmVOdW1iZXIgOiBOdW1iZXIuTUFYX1ZBTFVFO1xuXHRcdFx0Y29uc3QgZGlzdE5leHQgPSBtb2ROZXh0ID8gbW9kTmV4dC5saW5lTnVtYmVyIC0gbGFzdE1vZGlmaWVkTGluZU51bWJlciA6IE51bWJlci5NQVhfVkFMVUU7XG5cblx0XHRcdGlmIChkaXN0T3JpZyA8IGRpc3ROZXh0KSB7XG5cdFx0XHRcdG9yaWdpbmFsTGluZUhlaWdodE92ZXJyaWRlcy5kZXF1ZXVlKCk7XG5cdFx0XHRcdG1vZE5leHQgPSB7XG5cdFx0XHRcdFx0bGluZU51bWJlcjogb3JpZ05leHQhLmxpbmVOdW1iZXIgLSBsYXN0T3JpZ2luYWxMaW5lTnVtYmVyICsgbGFzdE1vZGlmaWVkTGluZU51bWJlcixcblx0XHRcdFx0XHRoZWlnaHRJblB4OiAwLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmIChkaXN0T3JpZyA+IGRpc3ROZXh0KSB7XG5cdFx0XHRcdG1vZGlmaWVkTGluZUhlaWdodE92ZXJyaWRlcy5kZXF1ZXVlKCk7XG5cdFx0XHRcdG9yaWdOZXh0ID0ge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IG1vZE5leHQhLmxpbmVOdW1iZXIgLSBsYXN0TW9kaWZpZWRMaW5lTnVtYmVyICsgbGFzdE9yaWdpbmFsTGluZU51bWJlcixcblx0XHRcdFx0XHRoZWlnaHRJblB4OiAwLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3JpZ2luYWxMaW5lSGVpZ2h0T3ZlcnJpZGVzLmRlcXVldWUoKTtcblx0XHRcdFx0bW9kaWZpZWRMaW5lSGVpZ2h0T3ZlcnJpZGVzLmRlcXVldWUoKTtcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRvcmlnaW5hbFJhbmdlOiBMaW5lUmFuZ2Uub2ZMZW5ndGgob3JpZ05leHQhLmxpbmVOdW1iZXIsIDEpLFxuXHRcdFx0XHRtb2RpZmllZFJhbmdlOiBMaW5lUmFuZ2Uub2ZMZW5ndGgobW9kTmV4dCEubGluZU51bWJlciwgMSksXG5cdFx0XHRcdG9yaWdpbmFsSGVpZ2h0SW5QeDogb3JpZ0xpbmVIZWlnaHQgKyBvcmlnTmV4dCEuaGVpZ2h0SW5QeCxcblx0XHRcdFx0bW9kaWZpZWRIZWlnaHRJblB4OiBtb2RMaW5lSGVpZ2h0ICsgbW9kTmV4dCEuaGVpZ2h0SW5QeCxcblx0XHRcdFx0ZGlmZjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9yIChjb25zdCBtIG9mIGRpZmZzKSB7XG5cdFx0Y29uc3QgYyA9IG0ubGluZVJhbmdlTWFwcGluZztcblx0XHRoYW5kbGVBbGlnbm1lbnRzT3V0c2lkZU9mRGlmZnMoYy5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIsIGMubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdGxldCBmaXJzdCA9IHRydWU7XG5cdFx0bGV0IGxhc3RNb2RMaW5lTnVtYmVyID0gYy5tb2RpZmllZC5zdGFydExpbmVOdW1iZXI7XG5cdFx0bGV0IGxhc3RPcmlnTGluZU51bWJlciA9IGMub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0ZnVuY3Rpb24gZW1pdEFsaWdubWVudChvcmlnTGluZU51bWJlckV4Y2x1c2l2ZTogbnVtYmVyLCBtb2RMaW5lTnVtYmVyRXhjbHVzaXZlOiBudW1iZXIsIGZvcmNlQWxpZ25tZW50ID0gZmFsc2UpIHtcblx0XHRcdGlmIChvcmlnTGluZU51bWJlckV4Y2x1c2l2ZSA8IGxhc3RPcmlnTGluZU51bWJlciB8fCBtb2RMaW5lTnVtYmVyRXhjbHVzaXZlIDwgbGFzdE1vZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpcnN0KSB7XG5cdFx0XHRcdGZpcnN0ID0gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKCFmb3JjZUFsaWdubWVudCAmJiAob3JpZ0xpbmVOdW1iZXJFeGNsdXNpdmUgPT09IGxhc3RPcmlnTGluZU51bWJlciB8fCBtb2RMaW5lTnVtYmVyRXhjbHVzaXZlID09PSBsYXN0TW9kTGluZU51bWJlcikpIHtcblx0XHRcdFx0Ly8gVGhpcyBjYXVzZXMgYSByZS1hbGlnbm1lbnQgb2YgYW4gYWxyZWFkeSBhbGlnbmVkIGxpbmUuXG5cdFx0XHRcdC8vIEhvd2V2ZXIsIHdlIGRvbid0IGNhcmUgZm9yIHRoZSBmaW5hbCBhbGlnbm1lbnQuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmFuZ2UgPSBuZXcgTGluZVJhbmdlKGxhc3RPcmlnTGluZU51bWJlciwgb3JpZ0xpbmVOdW1iZXJFeGNsdXNpdmUpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRSYW5nZSA9IG5ldyBMaW5lUmFuZ2UobGFzdE1vZExpbmVOdW1iZXIsIG1vZExpbmVOdW1iZXJFeGNsdXNpdmUpO1xuXHRcdFx0aWYgKG9yaWdpbmFsUmFuZ2UuaXNFbXB0eSAmJiBtb2RpZmllZFJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbEFkZGl0aW9uYWxIZWlnaHQgPSBvcmlnaW5hbExpbmVIZWlnaHRPdmVycmlkZXNcblx0XHRcdFx0LnRha2VXaGlsZSh2ID0+IHYubGluZU51bWJlciA8IG9yaWdMaW5lTnVtYmVyRXhjbHVzaXZlKVxuXHRcdFx0XHQ/LnJlZHVjZSgocCwgYykgPT4gcCArIGMuaGVpZ2h0SW5QeCwgMCkgPz8gMDtcblx0XHRcdGNvbnN0IG1vZGlmaWVkQWRkaXRpb25hbEhlaWdodCA9IG1vZGlmaWVkTGluZUhlaWdodE92ZXJyaWRlc1xuXHRcdFx0XHQudGFrZVdoaWxlKHYgPT4gdi5saW5lTnVtYmVyIDwgbW9kTGluZU51bWJlckV4Y2x1c2l2ZSlcblx0XHRcdFx0Py5yZWR1Y2UoKHAsIGMpID0+IHAgKyBjLmhlaWdodEluUHgsIDApID8/IDA7XG5cblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0b3JpZ2luYWxSYW5nZSxcblx0XHRcdFx0bW9kaWZpZWRSYW5nZSxcblx0XHRcdFx0b3JpZ2luYWxIZWlnaHRJblB4OiBvcmlnaW5hbFJhbmdlLmxlbmd0aCAqIG9yaWdMaW5lSGVpZ2h0ICsgb3JpZ2luYWxBZGRpdGlvbmFsSGVpZ2h0LFxuXHRcdFx0XHRtb2RpZmllZEhlaWdodEluUHg6IG1vZGlmaWVkUmFuZ2UubGVuZ3RoICogbW9kTGluZUhlaWdodCArIG1vZGlmaWVkQWRkaXRpb25hbEhlaWdodCxcblx0XHRcdFx0ZGlmZjogbS5saW5lUmFuZ2VNYXBwaW5nLFxuXHRcdFx0fSk7XG5cblx0XHRcdGxhc3RPcmlnTGluZU51bWJlciA9IG9yaWdMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHRcdFx0bGFzdE1vZExpbmVOdW1iZXIgPSBtb2RMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHRcdH1cblxuXHRcdGlmIChpbm5lckh1bmtBbGlnbm1lbnQpIHtcblx0XHRcdGZvciAoY29uc3QgaSBvZiBjLmlubmVyQ2hhbmdlcyB8fCBbXSkge1xuXHRcdFx0XHRpZiAoaS5vcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uID4gMSAmJiBpLm1vZGlmaWVkUmFuZ2Uuc3RhcnRDb2x1bW4gPiAxKSB7XG5cdFx0XHRcdFx0Ly8gVGhlcmUgaXMgc29tZSB1bm1vZGlmaWVkIHRleHQgb24gdGhpcyBsaW5lIGJlZm9yZSB0aGUgZGlmZlxuXHRcdFx0XHRcdGVtaXRBbGlnbm1lbnQoaS5vcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgaS5tb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxNb2RlbCA9IG9yaWdpbmFsRWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHQvLyBXaGVuIHRoZSBkaWZmIGlzIGludmFsaWQsIHRoZSByYW5nZXMgbWlnaHQgYmUgb3V0IG9mIGJvdW5kcyAodGhpcyBzaG91bGQgYmUgZml4ZWQgaW4gdGhlIGRpZmYgbW9kZWwgYnkgYXBwbHlpbmcgZWRpdHMgZGlyZWN0bHkpLlxuXHRcdFx0XHRjb25zdCBtYXhDb2x1bW4gPSBpLm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlciA8PSBvcmlnaW5hbE1vZGVsLmdldExpbmVDb3VudCgpID8gb3JpZ2luYWxNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGkub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyKSA6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRcdFx0XHRpZiAoaS5vcmlnaW5hbFJhbmdlLmVuZENvbHVtbiA8IG1heENvbHVtbikge1xuXHRcdFx0XHRcdC8vIC8vIFRoZXJlIGlzIHNvbWUgdW5tb2RpZmllZCB0ZXh0IG9uIHRoaXMgbGluZSBhZnRlciB0aGUgZGlmZlxuXHRcdFx0XHRcdGVtaXRBbGlnbm1lbnQoaS5vcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXIsIGkubW9kaWZpZWRSYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVtaXRBbGlnbm1lbnQoYy5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLCBjLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsIHRydWUpO1xuXG5cdFx0bGFzdE9yaWdpbmFsTGluZU51bWJlciA9IGMub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0XHRsYXN0TW9kaWZpZWRMaW5lTnVtYmVyID0gYy5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHR9XG5cdGhhbmRsZUFsaWdubWVudHNPdXRzaWRlT2ZEaWZmcyhOdW1iZXIuTUFYX1ZBTFVFLCBOdW1iZXIuTUFYX1ZBTFVFKTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5pbnRlcmZhY2UgQWRkaXRpb25hbExpbmVIZWlnaHRJbmZvIHtcblx0bGluZU51bWJlcjogbnVtYmVyO1xuXHRoZWlnaHRJblB4OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdldEFkZGl0aW9uYWxMaW5lSGVpZ2h0cyhlZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQsIHZpZXdab25lc1RvSWdub3JlOiBSZWFkb25seVNldDxzdHJpbmc+KTogcmVhZG9ubHkgQWRkaXRpb25hbExpbmVIZWlnaHRJbmZvW10ge1xuXHRjb25zdCB2aWV3Wm9uZUhlaWdodHM6IHsgbGluZU51bWJlcjogbnVtYmVyOyBoZWlnaHRJblB4OiBudW1iZXIgfVtdID0gW107XG5cdGNvbnN0IHdyYXBwaW5nWm9uZUhlaWdodHM6IHsgbGluZU51bWJlcjogbnVtYmVyOyBoZWlnaHRJblB4OiBudW1iZXIgfVtdID0gW107XG5cblx0Y29uc3QgaGFzV3JhcHBpbmcgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pLndyYXBwaW5nQ29sdW1uICE9PSAtMTtcblx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpIS5jb29yZGluYXRlc0NvbnZlcnRlcjtcblx0Y29uc3QgZWRpdG9yTGluZUhlaWdodCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRpZiAoaGFzV3JhcHBpbmcpIHtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSBlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvdW50KCk7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZUNvdW50ID0gY29vcmRpbmF0ZXNDb252ZXJ0ZXIuZ2V0TW9kZWxMaW5lVmlld0xpbmVDb3VudChpKTtcblx0XHRcdGlmIChsaW5lQ291bnQgPiAxKSB7XG5cdFx0XHRcdHdyYXBwaW5nWm9uZUhlaWdodHMucHVzaCh7IGxpbmVOdW1iZXI6IGksIGhlaWdodEluUHg6IGVkaXRvckxpbmVIZWlnaHQgKiAobGluZUNvdW50IC0gMSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zm9yIChjb25zdCB3IG9mIGVkaXRvci5nZXRXaGl0ZXNwYWNlcygpKSB7XG5cdFx0aWYgKHZpZXdab25lc1RvSWdub3JlLmhhcyh3LmlkKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsTGluZU51bWJlciA9IHcuYWZ0ZXJMaW5lTnVtYmVyID09PSAwID8gMCA6IGNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oXG5cdFx0XHRuZXcgUG9zaXRpb24ody5hZnRlckxpbmVOdW1iZXIsIDEpXG5cdFx0KS5saW5lTnVtYmVyO1xuXHRcdHZpZXdab25lSGVpZ2h0cy5wdXNoKHsgbGluZU51bWJlcjogbW9kZWxMaW5lTnVtYmVyLCBoZWlnaHRJblB4OiB3LmhlaWdodCB9KTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdCA9IGpvaW5Db21iaW5lKFxuXHRcdHZpZXdab25lSGVpZ2h0cyxcblx0XHR3cmFwcGluZ1pvbmVIZWlnaHRzLFxuXHRcdHYgPT4gdi5saW5lTnVtYmVyLFxuXHRcdCh2MSwgdjIpID0+ICh7IGxpbmVOdW1iZXI6IHYxLmxpbmVOdW1iZXIsIGhlaWdodEluUHg6IHYxLmhlaWdodEluUHggKyB2Mi5oZWlnaHRJblB4IH0pXG5cdCk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93c1RydWVJbmxpbmVEaWZmUmVuZGVyaW5nKG1hcHBpbmc6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyk6IGJvb2xlYW4ge1xuXHRpZiAoIW1hcHBpbmcuaW5uZXJDaGFuZ2VzKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBtYXBwaW5nLmlubmVyQ2hhbmdlcy5ldmVyeShjID0+XG5cdFx0KHJhbmdlSXNTaW5nbGVMaW5lKGMubW9kaWZpZWRSYW5nZSkgJiYgcmFuZ2VJc1NpbmdsZUxpbmUoYy5vcmlnaW5hbFJhbmdlKSlcblx0XHR8fCBjLm9yaWdpbmFsUmFuZ2UuZXF1YWxzUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDEpKVxuXHQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmFuZ2VJc1NpbmdsZUxpbmUocmFuZ2U6IFJhbmdlKTogYm9vbGVhbiB7XG5cdHJldHVybiByYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXI7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyw2QkFBNkI7QUFDekMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBc0IsU0FBUyxTQUFTLHFCQUFxQix1QkFBdUI7QUFDcEYsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxzQkFBc0Isc0JBQXNCO0FBRXJELFNBQThCLG1CQUFtQjtBQUVqRCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLFlBQVksZUFBZSxtQkFBbUI7QUFDdkQsU0FBOEIsb0JBQW9CLG1CQUFtQjtBQUNyRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0IsNEJBQTRCO0FBVWhELElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBYW5ELFlBQ2tCLGVBQ0EsVUFDQSxZQUNBLFVBQ0EsbUJBQ0EsK0JBQ0Esd0JBQ0EsdUJBQ21CLG1CQUNFLHFCQUNyQztBQUNELFVBQU07QUFYVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ21CO0FBQ0U7QUFHdEMsU0FBSyxz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QUNEO0FBRUEsSUFBQUEsZUFBYyxFQUFFLFNBQVMsd0JBQXdCLEVBQUUsU0FBUyx3QkFBd0IsSUFBSTtBQUV4Riw2QkFBeUIsRUFBRSxTQUFTO0FBQ3BDLDZCQUF5QixFQUFFLFNBQVM7QUFBQSxFQUNyQztBQUNBLGlDQUErQixPQUFPLFdBQVcsT0FBTyxTQUFTO0FBRWpFLFNBQU87QUFDUjtBQU9BLFNBQVMseUJBQXlCLFFBQTBCLG1CQUE2RTtBQUN4SSxRQUFNLGtCQUFnRSxDQUFDO0FBQ3ZFLFFBQU0sc0JBQW9FLENBQUM7QUFFM0UsUUFBTSxjQUFjLE9BQU8sVUFBVSxhQUFhLFlBQVksRUFBRSxtQkFBbUI7QUFDbkYsUUFBTSx1QkFBdUIsT0FBTyxjQUFjLEVBQUc7QUFDckQsUUFBTSxtQkFBbUIsT0FBTyxVQUFVLGFBQWEsVUFBVTtBQUNqRSxNQUFJLGFBQWE7QUFDaEIsYUFBUyxJQUFJLEdBQUcsS0FBSyxPQUFPLFNBQVMsRUFBRyxhQUFhLEdBQUcsS0FBSztBQUM1RCxZQUFNLFlBQVkscUJBQXFCLDBCQUEwQixDQUFDO0FBQ2xFLFVBQUksWUFBWSxHQUFHO0FBQ2xCLDRCQUFvQixLQUFLLEVBQUUsWUFBWSxHQUFHLFlBQVksb0JBQW9CLFlBQVksR0FBRyxDQUFDO0FBQUEsTUFDM0Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLGFBQVcsS0FBSyxPQUFPLGVBQWUsR0FBRztBQUN4QyxRQUFJLGtCQUFrQixJQUFJLEVBQUUsRUFBRSxHQUFHO0FBQ2hDO0FBQUEsSUFDRDtBQUNBLFVBQU0sa0JBQWtCLEVBQUUsb0JBQW9CLElBQUksSUFBSSxxQkFBcUI7QUFBQSxNQUMxRSxJQUFJLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQztBQUFBLElBQ2xDLEVBQUU7QUFDRixvQkFBZ0IsS0FBSyxFQUFFLFlBQVksaUJBQWlCLFlBQVksRUFBRSxPQUFPLENBQUM7QUFBQSxFQUMzRTtBQUVBLFFBQU0sU0FBUztBQUFBLElBQ2Q7QUFBQSxJQUNBO0FBQUEsSUFDQSxPQUFLLEVBQUU7QUFBQSxJQUNQLENBQUMsSUFBSSxRQUFRLEVBQUUsWUFBWSxHQUFHLFlBQVksWUFBWSxHQUFHLGFBQWEsR0FBRyxXQUFXO0FBQUEsRUFDckY7QUFFQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLDhCQUE4QixTQUE0QztBQUN6RixNQUFJLENBQUMsUUFBUSxjQUFjO0FBQzFCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxRQUFRLGFBQWE7QUFBQSxJQUFNLE9BQ2hDLGtCQUFrQixFQUFFLGFBQWEsS0FBSyxrQkFBa0IsRUFBRSxhQUFhLEtBQ3JFLEVBQUUsY0FBYyxZQUFZLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNyRDtBQUNEO0FBRU8sU0FBUyxrQkFBa0IsT0FBdUI7QUFDeEQsU0FBTyxNQUFNLG9CQUFvQixNQUFNO0FBQ3hDOyIsCiAgIm5hbWVzIjogWyJtYXJnaW5Eb21Ob2RlIiwgImNyZWF0ZVZpZXdab25lTWFyZ2luQXJyb3ciLCAiZW1pdEFsaWdubWVudCIsICJjIl0KfQo=
