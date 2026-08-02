import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { PositionAffinity } from "../model.js";
import { IndentGuide, IndentGuideHorizontalLine } from "../textModelGuides.js";
import { ModelDecorationOptions } from "../model/textModel.js";
import * as viewEvents from "../viewEvents.js";
import { createModelLineProjection } from "./modelLineProjection.js";
import { ConstantTimePrefixSumComputer } from "../model/prefixSumComputer.js";
import { ViewLineData } from "../viewModel.js";
import { IdentityCoordinatesConverter } from "../coordinatesConverter.js";
class ViewModelLinesFromProjectedModel {
  constructor(editorId, model, domLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, fontInfo, tabSize, wrappingStrategy, wrappingColumn, wrappingIndent, wordBreak, wrapOnEscapedLineFeeds) {
    this._editorId = editorId;
    this.model = model;
    this._validModelVersionId = -1;
    this._domLineBreaksComputerFactory = domLineBreaksComputerFactory;
    this._monospaceLineBreaksComputerFactory = monospaceLineBreaksComputerFactory;
    this.fontInfo = fontInfo;
    this.tabSize = tabSize;
    this.wrappingStrategy = wrappingStrategy;
    this.wrappingColumn = wrappingColumn;
    this.wrappingIndent = wrappingIndent;
    this.wordBreak = wordBreak;
    this.wrapOnEscapedLineFeeds = wrapOnEscapedLineFeeds;
    this._constructLines(
      /*resetHiddenAreas*/
      true,
      null
    );
  }
  dispose() {
    this.hiddenAreasDecorationIds = this.model.deltaDecorations(this.hiddenAreasDecorationIds, []);
  }
  createCoordinatesConverter() {
    return new CoordinatesConverter(this);
  }
  _constructLines(resetHiddenAreas, previousLineBreaks) {
    this.modelLineProjections = [];
    if (resetHiddenAreas) {
      this.hiddenAreasDecorationIds = this.model.deltaDecorations(this.hiddenAreasDecorationIds, []);
    }
    const linesContent = this.model.getLinesContent();
    const lineCount = linesContent.length;
    const lineBreaksComputer = this.createLineBreaksComputer();
    for (let i = 0; i < lineCount; i++) {
      lineBreaksComputer.addRequest(i + 1, previousLineBreaks ? previousLineBreaks[i] : null);
    }
    const linesBreaks = lineBreaksComputer.finalize();
    const values = [];
    const hiddenAreas = this.hiddenAreasDecorationIds.map((areaId) => this.model.getDecorationRange(areaId)).sort(Range.compareRangesUsingStarts);
    let hiddenAreaStart = 1, hiddenAreaEnd = 0;
    let hiddenAreaIdx = -1;
    let nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : lineCount + 2;
    for (let i = 0; i < lineCount; i++) {
      const lineNumber = i + 1;
      if (lineNumber === nextLineNumberToUpdateHiddenArea) {
        hiddenAreaIdx++;
        hiddenAreaStart = hiddenAreas[hiddenAreaIdx].startLineNumber;
        hiddenAreaEnd = hiddenAreas[hiddenAreaIdx].endLineNumber;
        nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : lineCount + 2;
      }
      const isInHiddenArea = lineNumber >= hiddenAreaStart && lineNumber <= hiddenAreaEnd;
      const line = createModelLineProjection(linesBreaks[i], !isInHiddenArea);
      values[i] = line.getViewLineCount();
      this.modelLineProjections[i] = line;
    }
    this._validModelVersionId = this.model.getVersionId();
    this.projectedModelLineLineCounts = new ConstantTimePrefixSumComputer(values);
    this._ensureAtLeastOneVisibleLine();
  }
  getHiddenAreas() {
    return this.hiddenAreasDecorationIds.map(
      (decId) => this.model.getDecorationRange(decId)
    );
  }
  setHiddenAreas(_ranges) {
    const validatedRanges = _ranges.map((r) => this.model.validateRange(r));
    const newRanges = normalizeLineRanges(validatedRanges);
    const oldRanges = this.hiddenAreasDecorationIds.map((areaId) => this.model.getDecorationRange(areaId)).sort(Range.compareRangesUsingStarts);
    if (newRanges.length === oldRanges.length) {
      let hasDifference = false;
      for (let i = 0; i < newRanges.length; i++) {
        if (!newRanges[i].equalsRange(oldRanges[i])) {
          hasDifference = true;
          break;
        }
      }
      if (!hasDifference) {
        return false;
      }
    }
    const newDecorations = newRanges.map(
      (r) => ({
        range: r,
        options: ModelDecorationOptions.EMPTY
      })
    );
    this.hiddenAreasDecorationIds = this.model.deltaDecorations(this.hiddenAreasDecorationIds, newDecorations);
    const hiddenAreas = newRanges;
    let hiddenAreaStart = 1, hiddenAreaEnd = 0;
    let hiddenAreaIdx = -1;
    let nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : this.modelLineProjections.length + 2;
    let hasVisibleLine = false;
    for (let i = 0; i < this.modelLineProjections.length; i++) {
      const lineNumber = i + 1;
      if (lineNumber === nextLineNumberToUpdateHiddenArea) {
        hiddenAreaIdx++;
        hiddenAreaStart = hiddenAreas[hiddenAreaIdx].startLineNumber;
        hiddenAreaEnd = hiddenAreas[hiddenAreaIdx].endLineNumber;
        nextLineNumberToUpdateHiddenArea = hiddenAreaIdx + 1 < hiddenAreas.length ? hiddenAreaEnd + 1 : this.modelLineProjections.length + 2;
      }
      let lineChanged = false;
      if (lineNumber >= hiddenAreaStart && lineNumber <= hiddenAreaEnd) {
        if (this.modelLineProjections[i].isVisible()) {
          this.modelLineProjections[i] = this.modelLineProjections[i].setVisible(false);
          lineChanged = true;
        }
      } else {
        hasVisibleLine = true;
        if (!this.modelLineProjections[i].isVisible()) {
          this.modelLineProjections[i] = this.modelLineProjections[i].setVisible(true);
          lineChanged = true;
        }
      }
      if (lineChanged) {
        const newOutputLineCount = this.modelLineProjections[i].getViewLineCount();
        this.projectedModelLineLineCounts.setValue(i, newOutputLineCount);
      }
    }
    if (!hasVisibleLine) {
      this.setHiddenAreas([]);
    }
    return true;
  }
  modelPositionIsVisible(modelLineNumber, _modelColumn) {
    if (modelLineNumber < 1 || modelLineNumber > this.modelLineProjections.length) {
      return false;
    }
    return this.modelLineProjections[modelLineNumber - 1].isVisible();
  }
  getModelLineViewLineCount(modelLineNumber) {
    if (modelLineNumber < 1 || modelLineNumber > this.modelLineProjections.length) {
      return 1;
    }
    return this.modelLineProjections[modelLineNumber - 1].getViewLineCount();
  }
  setTabSize(newTabSize) {
    if (this.tabSize === newTabSize) {
      return false;
    }
    this.tabSize = newTabSize;
    this._constructLines(
      /*resetHiddenAreas*/
      false,
      null
    );
    return true;
  }
  setWrappingSettings(fontInfo, wrappingStrategy, wrappingColumn, wrappingIndent, wordBreak) {
    const equalFontInfo = this.fontInfo.equals(fontInfo);
    const equalWrappingStrategy = this.wrappingStrategy === wrappingStrategy;
    const equalWrappingColumn = this.wrappingColumn === wrappingColumn;
    const equalWrappingIndent = this.wrappingIndent === wrappingIndent;
    const equalWordBreak = this.wordBreak === wordBreak;
    if (equalFontInfo && equalWrappingStrategy && equalWrappingColumn && equalWrappingIndent && equalWordBreak) {
      return false;
    }
    const onlyWrappingColumnChanged = equalFontInfo && equalWrappingStrategy && !equalWrappingColumn && equalWrappingIndent && equalWordBreak;
    this.fontInfo = fontInfo;
    this.wrappingStrategy = wrappingStrategy;
    this.wrappingColumn = wrappingColumn;
    this.wrappingIndent = wrappingIndent;
    this.wordBreak = wordBreak;
    let previousLineBreaks = null;
    if (onlyWrappingColumnChanged) {
      previousLineBreaks = [];
      for (let i = 0, len = this.modelLineProjections.length; i < len; i++) {
        previousLineBreaks[i] = this.modelLineProjections[i].getProjectionData();
      }
    }
    this._constructLines(
      /*resetHiddenAreas*/
      false,
      previousLineBreaks
    );
    return true;
  }
  createLineBreaksComputer(_context) {
    const lineBreaksComputerFactory = this.wrappingStrategy === "advanced" ? this._domLineBreaksComputerFactory : this._monospaceLineBreaksComputerFactory;
    const context = _context ?? {
      getLineContent: (lineNumber) => {
        return this.model.getLineContent(lineNumber);
      },
      getLineInjectedText: (lineNumber) => {
        return this.model.getLineInjectedText(lineNumber, this._editorId);
      }
    };
    return lineBreaksComputerFactory.createLineBreaksComputer(context, this.fontInfo, this.tabSize, this.wrappingColumn, this.wrappingIndent, this.wordBreak, this.wrapOnEscapedLineFeeds);
  }
  onModelFlushed() {
    this._constructLines(
      /*resetHiddenAreas*/
      true,
      null
    );
  }
  onModelLinesDeleted(versionId, fromLineNumber, toLineNumber) {
    if (!versionId || versionId <= this._validModelVersionId) {
      return null;
    }
    const outputFromLineNumber = fromLineNumber === 1 ? 1 : this.projectedModelLineLineCounts.getPrefixSum(fromLineNumber - 1) + 1;
    const outputToLineNumber = this.projectedModelLineLineCounts.getPrefixSum(toLineNumber);
    this.modelLineProjections.splice(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);
    this.projectedModelLineLineCounts.removeValues(fromLineNumber - 1, toLineNumber - fromLineNumber + 1);
    return new viewEvents.ViewLinesDeletedEvent(outputFromLineNumber, outputToLineNumber);
  }
  onModelLinesInserted(versionId, fromLineNumber, _toLineNumber, lineBreaks) {
    if (!versionId || versionId <= this._validModelVersionId) {
      return null;
    }
    const isInHiddenArea = fromLineNumber > 2 && !this.modelLineProjections[fromLineNumber - 2].isVisible();
    const outputFromLineNumber = fromLineNumber === 1 ? 1 : this.projectedModelLineLineCounts.getPrefixSum(fromLineNumber - 1) + 1;
    let totalOutputLineCount = 0;
    const insertLines = [];
    const insertPrefixSumValues = [];
    for (let i = 0, len = lineBreaks.length; i < len; i++) {
      const line = createModelLineProjection(lineBreaks[i], !isInHiddenArea);
      insertLines.push(line);
      const outputLineCount = line.getViewLineCount();
      totalOutputLineCount += outputLineCount;
      insertPrefixSumValues[i] = outputLineCount;
    }
    this.modelLineProjections = this.modelLineProjections.slice(0, fromLineNumber - 1).concat(insertLines).concat(this.modelLineProjections.slice(fromLineNumber - 1));
    this.projectedModelLineLineCounts.insertValues(fromLineNumber - 1, insertPrefixSumValues);
    return new viewEvents.ViewLinesInsertedEvent(outputFromLineNumber, outputFromLineNumber + totalOutputLineCount - 1);
  }
  onModelLineChanged(versionId, lineNumber, lineBreakData) {
    if (versionId !== null && versionId <= this._validModelVersionId) {
      return [false, null, null, null];
    }
    const lineIndex = lineNumber - 1;
    const oldOutputLineCount = this.modelLineProjections[lineIndex].getViewLineCount();
    const isVisible = this.modelLineProjections[lineIndex].isVisible();
    const line = createModelLineProjection(lineBreakData, isVisible);
    this.modelLineProjections[lineIndex] = line;
    const newOutputLineCount = this.modelLineProjections[lineIndex].getViewLineCount();
    let lineMappingChanged = false;
    let changeFrom = 0;
    let changeTo = -1;
    let insertFrom = 0;
    let insertTo = -1;
    let deleteFrom = 0;
    let deleteTo = -1;
    if (oldOutputLineCount > newOutputLineCount) {
      changeFrom = this.projectedModelLineLineCounts.getPrefixSum(lineNumber - 1) + 1;
      changeTo = changeFrom + newOutputLineCount - 1;
      deleteFrom = changeTo + 1;
      deleteTo = deleteFrom + (oldOutputLineCount - newOutputLineCount) - 1;
      lineMappingChanged = true;
    } else if (oldOutputLineCount < newOutputLineCount) {
      changeFrom = this.projectedModelLineLineCounts.getPrefixSum(lineNumber - 1) + 1;
      changeTo = changeFrom + oldOutputLineCount - 1;
      insertFrom = changeTo + 1;
      insertTo = insertFrom + (newOutputLineCount - oldOutputLineCount) - 1;
      lineMappingChanged = true;
    } else {
      changeFrom = this.projectedModelLineLineCounts.getPrefixSum(lineNumber - 1) + 1;
      changeTo = changeFrom + newOutputLineCount - 1;
    }
    this.projectedModelLineLineCounts.setValue(lineIndex, newOutputLineCount);
    const viewLinesChangedEvent = changeFrom <= changeTo ? new viewEvents.ViewLinesChangedEvent(changeFrom, changeTo - changeFrom + 1) : null;
    const viewLinesInsertedEvent = insertFrom <= insertTo ? new viewEvents.ViewLinesInsertedEvent(insertFrom, insertTo) : null;
    const viewLinesDeletedEvent = deleteFrom <= deleteTo ? new viewEvents.ViewLinesDeletedEvent(deleteFrom, deleteTo) : null;
    return [lineMappingChanged, viewLinesChangedEvent, viewLinesInsertedEvent, viewLinesDeletedEvent];
  }
  acceptVersionId(versionId) {
    this._validModelVersionId = versionId;
    this._ensureAtLeastOneVisibleLine();
  }
  _ensureAtLeastOneVisibleLine() {
    if (this.getViewLineCount() === 0 && this.modelLineProjections.length > 0) {
      this.modelLineProjections[0] = this.modelLineProjections[0].setVisible(true);
      this.projectedModelLineLineCounts.setValue(0, this.modelLineProjections[0].getViewLineCount());
    }
  }
  getViewLineCount() {
    return this.projectedModelLineLineCounts.getTotalSum();
  }
  _toValidViewLineNumber(viewLineNumber) {
    if (viewLineNumber < 1) {
      return 1;
    }
    const viewLineCount = this.getViewLineCount();
    if (viewLineNumber > viewLineCount) {
      return viewLineCount;
    }
    return viewLineNumber | 0;
  }
  getActiveIndentGuide(viewLineNumber, minLineNumber, maxLineNumber) {
    viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
    minLineNumber = this._toValidViewLineNumber(minLineNumber);
    maxLineNumber = this._toValidViewLineNumber(maxLineNumber);
    const modelPosition = this.convertViewPositionToModelPosition(viewLineNumber, this.getViewLineMinColumn(viewLineNumber));
    const modelMinPosition = this.convertViewPositionToModelPosition(minLineNumber, this.getViewLineMinColumn(minLineNumber));
    const modelMaxPosition = this.convertViewPositionToModelPosition(maxLineNumber, this.getViewLineMinColumn(maxLineNumber));
    const result = this.model.guides.getActiveIndentGuide(modelPosition.lineNumber, modelMinPosition.lineNumber, modelMaxPosition.lineNumber);
    const viewStartPosition = this.convertModelPositionToViewPosition(result.startLineNumber, 1);
    const viewEndPosition = this.convertModelPositionToViewPosition(result.endLineNumber, this.model.getLineMaxColumn(result.endLineNumber));
    return {
      startLineNumber: viewStartPosition.lineNumber,
      endLineNumber: viewEndPosition.lineNumber,
      indent: result.indent
    };
  }
  // #region ViewLineInfo
  getViewLineInfo(viewLineNumber) {
    viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
    const r = this.projectedModelLineLineCounts.getIndexOf(viewLineNumber - 1);
    const lineIndex = r.index;
    const remainder = r.remainder;
    return new ViewLineInfo(lineIndex + 1, remainder);
  }
  getMinColumnOfViewLine(viewLineInfo) {
    return this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewLineMinColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
  }
  getMaxColumnOfViewLine(viewLineInfo) {
    return this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewLineMaxColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
  }
  getModelStartPositionOfViewLine(viewLineInfo) {
    const line = this.modelLineProjections[viewLineInfo.modelLineNumber - 1];
    const minViewColumn = line.getViewLineMinColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
    const column = line.getModelColumnOfViewPosition(
      viewLineInfo.modelLineWrappedLineIdx,
      minViewColumn
    );
    return new Position(viewLineInfo.modelLineNumber, column);
  }
  getModelEndPositionOfViewLine(viewLineInfo) {
    const line = this.modelLineProjections[viewLineInfo.modelLineNumber - 1];
    const maxViewColumn = line.getViewLineMaxColumn(
      this.model,
      viewLineInfo.modelLineNumber,
      viewLineInfo.modelLineWrappedLineIdx
    );
    const column = line.getModelColumnOfViewPosition(
      viewLineInfo.modelLineWrappedLineIdx,
      maxViewColumn
    );
    return new Position(viewLineInfo.modelLineNumber, column);
  }
  getViewLineInfosGroupedByModelRanges(viewStartLineNumber, viewEndLineNumber) {
    const startViewLine = this.getViewLineInfo(viewStartLineNumber);
    const endViewLine = this.getViewLineInfo(viewEndLineNumber);
    const result = new Array();
    let lastVisibleModelPos = this.getModelStartPositionOfViewLine(startViewLine);
    let viewLines = new Array();
    for (let curModelLine = startViewLine.modelLineNumber; curModelLine <= endViewLine.modelLineNumber; curModelLine++) {
      const line = this.modelLineProjections[curModelLine - 1];
      if (line.isVisible()) {
        const startOffset = curModelLine === startViewLine.modelLineNumber ? startViewLine.modelLineWrappedLineIdx : 0;
        const endOffset = curModelLine === endViewLine.modelLineNumber ? endViewLine.modelLineWrappedLineIdx + 1 : line.getViewLineCount();
        for (let i = startOffset; i < endOffset; i++) {
          viewLines.push(new ViewLineInfo(curModelLine, i));
        }
      }
      if (!line.isVisible() && lastVisibleModelPos) {
        const lastVisibleModelPos2 = new Position(curModelLine - 1, this.model.getLineMaxColumn(curModelLine - 1) + 1);
        const modelRange = Range.fromPositions(lastVisibleModelPos, lastVisibleModelPos2);
        result.push(new ViewLineInfoGroupedByModelRange(modelRange, viewLines));
        viewLines = [];
        lastVisibleModelPos = null;
      } else if (line.isVisible() && !lastVisibleModelPos) {
        lastVisibleModelPos = new Position(curModelLine, 1);
      }
    }
    if (lastVisibleModelPos) {
      const modelRange = Range.fromPositions(lastVisibleModelPos, this.getModelEndPositionOfViewLine(endViewLine));
      result.push(new ViewLineInfoGroupedByModelRange(modelRange, viewLines));
    }
    return result;
  }
  // #endregion
  getViewLinesBracketGuides(viewStartLineNumber, viewEndLineNumber, activeViewPosition, options) {
    const modelActivePosition = activeViewPosition ? this.convertViewPositionToModelPosition(activeViewPosition.lineNumber, activeViewPosition.column) : null;
    const resultPerViewLine = [];
    for (const group of this.getViewLineInfosGroupedByModelRanges(viewStartLineNumber, viewEndLineNumber)) {
      const modelRangeStartLineNumber = group.modelRange.startLineNumber;
      const bracketGuidesPerModelLine = this.model.guides.getLinesBracketGuides(
        modelRangeStartLineNumber,
        group.modelRange.endLineNumber,
        modelActivePosition,
        options
      );
      for (const viewLineInfo of group.viewLines) {
        const bracketGuides = bracketGuidesPerModelLine[viewLineInfo.modelLineNumber - modelRangeStartLineNumber];
        const result = bracketGuides.map((g) => {
          if (g.forWrappedLinesAfterColumn !== -1) {
            const p2 = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.forWrappedLinesAfterColumn);
            if (p2.lineNumber >= viewLineInfo.modelLineWrappedLineIdx) {
              return void 0;
            }
          }
          if (g.forWrappedLinesBeforeOrAtColumn !== -1) {
            const p2 = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.forWrappedLinesBeforeOrAtColumn);
            if (p2.lineNumber < viewLineInfo.modelLineWrappedLineIdx) {
              return void 0;
            }
          }
          if (!g.horizontalLine) {
            return g;
          }
          let column = -1;
          if (g.column !== -1) {
            const p2 = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.column);
            if (p2.lineNumber === viewLineInfo.modelLineWrappedLineIdx) {
              column = p2.column;
            } else if (p2.lineNumber < viewLineInfo.modelLineWrappedLineIdx) {
              column = this.getMinColumnOfViewLine(viewLineInfo);
            } else if (p2.lineNumber > viewLineInfo.modelLineWrappedLineIdx) {
              return void 0;
            }
          }
          const viewPosition = this.convertModelPositionToViewPosition(viewLineInfo.modelLineNumber, g.horizontalLine.endColumn);
          const p = this.modelLineProjections[viewLineInfo.modelLineNumber - 1].getViewPositionOfModelPosition(0, g.horizontalLine.endColumn);
          if (p.lineNumber === viewLineInfo.modelLineWrappedLineIdx) {
            return new IndentGuide(
              g.visibleColumn,
              column,
              g.className,
              new IndentGuideHorizontalLine(
                g.horizontalLine.top,
                viewPosition.column
              ),
              -1,
              -1
            );
          } else if (p.lineNumber < viewLineInfo.modelLineWrappedLineIdx) {
            return void 0;
          } else {
            if (g.visibleColumn !== -1) {
              return void 0;
            }
            return new IndentGuide(
              g.visibleColumn,
              column,
              g.className,
              new IndentGuideHorizontalLine(
                g.horizontalLine.top,
                this.getMaxColumnOfViewLine(viewLineInfo)
              ),
              -1,
              -1
            );
          }
        });
        resultPerViewLine.push(result.filter((r) => !!r));
      }
    }
    return resultPerViewLine;
  }
  getViewLinesIndentGuides(viewStartLineNumber, viewEndLineNumber) {
    viewStartLineNumber = this._toValidViewLineNumber(viewStartLineNumber);
    viewEndLineNumber = this._toValidViewLineNumber(viewEndLineNumber);
    const modelStart = this.convertViewPositionToModelPosition(viewStartLineNumber, this.getViewLineMinColumn(viewStartLineNumber));
    const modelEnd = this.convertViewPositionToModelPosition(viewEndLineNumber, this.getViewLineMaxColumn(viewEndLineNumber));
    let result = [];
    const resultRepeatCount = [];
    const resultRepeatOption = [];
    const modelStartLineIndex = modelStart.lineNumber - 1;
    const modelEndLineIndex = modelEnd.lineNumber - 1;
    let reqStart = null;
    for (let modelLineIndex = modelStartLineIndex; modelLineIndex <= modelEndLineIndex; modelLineIndex++) {
      const line = this.modelLineProjections[modelLineIndex];
      if (line.isVisible()) {
        const viewLineStartIndex = line.getViewLineNumberOfModelPosition(0, modelLineIndex === modelStartLineIndex ? modelStart.column : 1);
        const viewLineEndIndex = line.getViewLineNumberOfModelPosition(0, this.model.getLineMaxColumn(modelLineIndex + 1));
        const count = viewLineEndIndex - viewLineStartIndex + 1;
        let option = 0 /* BlockNone */;
        if (count > 1 && line.getViewLineMinColumn(this.model, modelLineIndex + 1, viewLineEndIndex) === 1) {
          option = viewLineStartIndex === 0 ? 1 /* BlockSubsequent */ : 2 /* BlockAll */;
        }
        resultRepeatCount.push(count);
        resultRepeatOption.push(option);
        if (reqStart === null) {
          reqStart = new Position(modelLineIndex + 1, 0);
        }
      } else {
        if (reqStart !== null) {
          result = result.concat(this.model.guides.getLinesIndentGuides(reqStart.lineNumber, modelLineIndex));
          reqStart = null;
        }
      }
    }
    if (reqStart !== null) {
      result = result.concat(this.model.guides.getLinesIndentGuides(reqStart.lineNumber, modelEnd.lineNumber));
      reqStart = null;
    }
    const viewLineCount = viewEndLineNumber - viewStartLineNumber + 1;
    const viewIndents = new Array(viewLineCount);
    let currIndex = 0;
    for (let i = 0, len = result.length; i < len; i++) {
      let value = result[i];
      const count = Math.min(viewLineCount - currIndex, resultRepeatCount[i]);
      const option = resultRepeatOption[i];
      let blockAtIndex;
      if (option === 2 /* BlockAll */) {
        blockAtIndex = 0;
      } else if (option === 1 /* BlockSubsequent */) {
        blockAtIndex = 1;
      } else {
        blockAtIndex = count;
      }
      for (let j = 0; j < count; j++) {
        if (j === blockAtIndex) {
          value = 0;
        }
        viewIndents[currIndex++] = value;
      }
    }
    return viewIndents;
  }
  getViewLineContent(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineContent(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineLength(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineLength(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineMinColumn(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineMinColumn(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineMaxColumn(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineMaxColumn(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx);
  }
  getViewLineData(viewLineNumber) {
    const info = this.getViewLineInfo(viewLineNumber);
    const baseViewLineNumber = this.projectedModelLineLineCounts.getPrefixSum(info.modelLineNumber - 1) + 1;
    return this.modelLineProjections[info.modelLineNumber - 1].getViewLineData(this.model, info.modelLineNumber, info.modelLineWrappedLineIdx, baseViewLineNumber);
  }
  getViewLinesData(viewStartLineNumber, viewEndLineNumber, needed) {
    viewStartLineNumber = this._toValidViewLineNumber(viewStartLineNumber);
    viewEndLineNumber = this._toValidViewLineNumber(viewEndLineNumber);
    const start = this.projectedModelLineLineCounts.getIndexOf(viewStartLineNumber - 1);
    let viewLineNumber = viewStartLineNumber;
    const startModelLineIndex = start.index;
    const startRemainder = start.remainder;
    const result = [];
    for (let modelLineIndex = startModelLineIndex, len = this.model.getLineCount(); modelLineIndex < len; modelLineIndex++) {
      const line = this.modelLineProjections[modelLineIndex];
      if (!line.isVisible()) {
        continue;
      }
      const fromViewLineIndex = modelLineIndex === startModelLineIndex ? startRemainder : 0;
      let remainingViewLineCount = line.getViewLineCount() - fromViewLineIndex;
      let lastLine = false;
      if (viewLineNumber + remainingViewLineCount > viewEndLineNumber) {
        lastLine = true;
        remainingViewLineCount = viewEndLineNumber - viewLineNumber + 1;
      }
      const baseViewLineNumber = this.projectedModelLineLineCounts.getPrefixSum(modelLineIndex) + 1;
      line.getViewLinesData(this.model, modelLineIndex + 1, fromViewLineIndex, remainingViewLineCount, baseViewLineNumber, viewLineNumber - viewStartLineNumber, needed, result);
      viewLineNumber += remainingViewLineCount;
      if (lastLine) {
        break;
      }
    }
    return result;
  }
  validateViewPosition(viewLineNumber, viewColumn, expectedModelPosition) {
    viewLineNumber = this._toValidViewLineNumber(viewLineNumber);
    const r = this.projectedModelLineLineCounts.getIndexOf(viewLineNumber - 1);
    const lineIndex = r.index;
    const remainder = r.remainder;
    const line = this.modelLineProjections[lineIndex];
    const minColumn = line.getViewLineMinColumn(this.model, lineIndex + 1, remainder);
    const maxColumn = line.getViewLineMaxColumn(this.model, lineIndex + 1, remainder);
    if (viewColumn < minColumn) {
      viewColumn = minColumn;
    }
    if (viewColumn > maxColumn) {
      viewColumn = maxColumn;
    }
    const computedModelColumn = line.getModelColumnOfViewPosition(remainder, viewColumn);
    const computedModelPosition = this.model.validatePosition(new Position(lineIndex + 1, computedModelColumn));
    if (computedModelPosition.equals(expectedModelPosition)) {
      return new Position(viewLineNumber, viewColumn);
    }
    return this.convertModelPositionToViewPosition(expectedModelPosition.lineNumber, expectedModelPosition.column);
  }
  validateViewRange(viewRange, expectedModelRange) {
    const validViewStart = this.validateViewPosition(viewRange.startLineNumber, viewRange.startColumn, expectedModelRange.getStartPosition());
    const validViewEnd = this.validateViewPosition(viewRange.endLineNumber, viewRange.endColumn, expectedModelRange.getEndPosition());
    return new Range(validViewStart.lineNumber, validViewStart.column, validViewEnd.lineNumber, validViewEnd.column);
  }
  convertViewPositionToModelPosition(viewLineNumber, viewColumn) {
    const info = this.getViewLineInfo(viewLineNumber);
    const inputColumn = this.modelLineProjections[info.modelLineNumber - 1].getModelColumnOfViewPosition(info.modelLineWrappedLineIdx, viewColumn);
    return this.model.validatePosition(new Position(info.modelLineNumber, inputColumn));
  }
  convertViewRangeToModelRange(viewRange) {
    const start = this.convertViewPositionToModelPosition(viewRange.startLineNumber, viewRange.startColumn);
    const end = this.convertViewPositionToModelPosition(viewRange.endLineNumber, viewRange.endColumn);
    return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }
  convertModelPositionToViewPosition(_modelLineNumber, _modelColumn, affinity = PositionAffinity.None, allowZeroLineNumber = false, belowHiddenRanges = false) {
    const validPosition = this.model.validatePosition(new Position(_modelLineNumber, _modelColumn));
    const inputLineNumber = validPosition.lineNumber;
    const inputColumn = validPosition.column;
    let lineIndex = inputLineNumber - 1, lineIndexChanged = false;
    if (belowHiddenRanges) {
      while (lineIndex < this.modelLineProjections.length && !this.modelLineProjections[lineIndex].isVisible()) {
        lineIndex++;
        lineIndexChanged = true;
      }
    } else {
      while (lineIndex > 0 && !this.modelLineProjections[lineIndex].isVisible()) {
        lineIndex--;
        lineIndexChanged = true;
      }
    }
    if (lineIndex === 0 && !this.modelLineProjections[lineIndex].isVisible()) {
      return new Position(allowZeroLineNumber ? 0 : 1, 1);
    }
    const deltaLineNumber = 1 + this.projectedModelLineLineCounts.getPrefixSum(lineIndex);
    let r;
    if (lineIndexChanged) {
      if (belowHiddenRanges) {
        r = this.modelLineProjections[lineIndex].getViewPositionOfModelPosition(deltaLineNumber, 1, affinity);
      } else {
        r = this.modelLineProjections[lineIndex].getViewPositionOfModelPosition(deltaLineNumber, this.model.getLineMaxColumn(lineIndex + 1), affinity);
      }
    } else {
      r = this.modelLineProjections[inputLineNumber - 1].getViewPositionOfModelPosition(deltaLineNumber, inputColumn, affinity);
    }
    return r;
  }
  /**
   * @param affinity The affinity in case of an empty range. Has no effect for non-empty ranges.
  */
  convertModelRangeToViewRange(modelRange, affinity = PositionAffinity.Left) {
    if (modelRange.isEmpty()) {
      const start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn, affinity);
      return Range.fromPositions(start);
    } else {
      const start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn, PositionAffinity.Right);
      const end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, modelRange.endColumn, PositionAffinity.Left);
      return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
    }
  }
  getViewLineNumberOfModelPosition(modelLineNumber, modelColumn) {
    let lineIndex = modelLineNumber - 1;
    if (this.modelLineProjections[lineIndex].isVisible()) {
      const deltaLineNumber2 = 1 + this.projectedModelLineLineCounts.getPrefixSum(lineIndex);
      return this.modelLineProjections[lineIndex].getViewLineNumberOfModelPosition(deltaLineNumber2, modelColumn);
    }
    while (lineIndex > 0 && !this.modelLineProjections[lineIndex].isVisible()) {
      lineIndex--;
    }
    if (lineIndex === 0 && !this.modelLineProjections[lineIndex].isVisible()) {
      return 1;
    }
    const deltaLineNumber = 1 + this.projectedModelLineLineCounts.getPrefixSum(lineIndex);
    return this.modelLineProjections[lineIndex].getViewLineNumberOfModelPosition(deltaLineNumber, this.model.getLineMaxColumn(lineIndex + 1));
  }
  getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations) {
    const modelStart = this.convertViewPositionToModelPosition(range.startLineNumber, range.startColumn);
    const modelEnd = this.convertViewPositionToModelPosition(range.endLineNumber, range.endColumn);
    if (modelEnd.lineNumber - modelStart.lineNumber <= range.endLineNumber - range.startLineNumber) {
      return this.model.getDecorationsInRange(new Range(modelStart.lineNumber, 1, modelEnd.lineNumber, modelEnd.column), ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations);
    }
    let result = [];
    const modelStartLineIndex = modelStart.lineNumber - 1;
    const modelEndLineIndex = modelEnd.lineNumber - 1;
    let reqStart = null;
    for (let modelLineIndex = modelStartLineIndex; modelLineIndex <= modelEndLineIndex; modelLineIndex++) {
      const line = this.modelLineProjections[modelLineIndex];
      if (line.isVisible()) {
        if (reqStart === null) {
          reqStart = new Position(modelLineIndex + 1, modelLineIndex === modelStartLineIndex ? modelStart.column : 1);
        }
      } else {
        if (reqStart !== null) {
          const maxLineColumn = this.model.getLineMaxColumn(modelLineIndex);
          result = result.concat(this.model.getDecorationsInRange(new Range(reqStart.lineNumber, reqStart.column, modelLineIndex, maxLineColumn), ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
          reqStart = null;
        }
      }
    }
    if (reqStart !== null) {
      result = result.concat(this.model.getDecorationsInRange(new Range(reqStart.lineNumber, reqStart.column, modelEnd.lineNumber, modelEnd.column), ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
      reqStart = null;
    }
    result.sort((a, b) => {
      const res = Range.compareRangesUsingStarts(a.range, b.range);
      if (res === 0) {
        if (a.id < b.id) {
          return -1;
        }
        if (a.id > b.id) {
          return 1;
        }
        return 0;
      }
      return res;
    });
    const finalResult = [];
    let finalResultLen = 0;
    let prevDecId = null;
    for (const dec of result) {
      const decId = dec.id;
      if (prevDecId === decId) {
        continue;
      }
      prevDecId = decId;
      finalResult[finalResultLen++] = dec;
    }
    return finalResult;
  }
  getInjectedTextAt(position) {
    const info = this.getViewLineInfo(position.lineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].getInjectedTextAt(info.modelLineWrappedLineIdx, position.column);
  }
  normalizePosition(position, affinity) {
    const info = this.getViewLineInfo(position.lineNumber);
    return this.modelLineProjections[info.modelLineNumber - 1].normalizePosition(info.modelLineWrappedLineIdx, position, affinity);
  }
  getLineIndentColumn(lineNumber) {
    const info = this.getViewLineInfo(lineNumber);
    if (info.modelLineWrappedLineIdx === 0) {
      return this.model.getLineIndentColumn(info.modelLineNumber);
    }
    return 0;
  }
}
function normalizeLineRanges(ranges) {
  if (ranges.length === 0) {
    return [];
  }
  const sortedRanges = ranges.slice();
  sortedRanges.sort(Range.compareRangesUsingStarts);
  const result = [];
  let currentRangeStart = sortedRanges[0].startLineNumber;
  let currentRangeEnd = sortedRanges[0].endLineNumber;
  for (let i = 1, len = sortedRanges.length; i < len; i++) {
    const range = sortedRanges[i];
    if (range.startLineNumber > currentRangeEnd + 1) {
      result.push(new Range(currentRangeStart, 1, currentRangeEnd, 1));
      currentRangeStart = range.startLineNumber;
      currentRangeEnd = range.endLineNumber;
    } else if (range.endLineNumber > currentRangeEnd) {
      currentRangeEnd = range.endLineNumber;
    }
  }
  result.push(new Range(currentRangeStart, 1, currentRangeEnd, 1));
  return result;
}
class ViewLineInfo {
  constructor(modelLineNumber, modelLineWrappedLineIdx) {
    this.modelLineNumber = modelLineNumber;
    this.modelLineWrappedLineIdx = modelLineWrappedLineIdx;
  }
  get isWrappedLineContinuation() {
    return this.modelLineWrappedLineIdx > 0;
  }
}
class ViewLineInfoGroupedByModelRange {
  constructor(modelRange, viewLines) {
    this.modelRange = modelRange;
    this.viewLines = viewLines;
  }
}
class CoordinatesConverter {
  constructor(lines) {
    this._lines = lines;
  }
  // View -> Model conversion and related methods
  convertViewPositionToModelPosition(viewPosition) {
    return this._lines.convertViewPositionToModelPosition(viewPosition.lineNumber, viewPosition.column);
  }
  convertViewRangeToModelRange(viewRange) {
    return this._lines.convertViewRangeToModelRange(viewRange);
  }
  validateViewPosition(viewPosition, expectedModelPosition) {
    return this._lines.validateViewPosition(viewPosition.lineNumber, viewPosition.column, expectedModelPosition);
  }
  validateViewRange(viewRange, expectedModelRange) {
    return this._lines.validateViewRange(viewRange, expectedModelRange);
  }
  // Model -> View conversion and related methods
  convertModelPositionToViewPosition(modelPosition, affinity, allowZero, belowHiddenRanges) {
    return this._lines.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column, affinity, allowZero, belowHiddenRanges);
  }
  convertModelRangeToViewRange(modelRange, affinity) {
    return this._lines.convertModelRangeToViewRange(modelRange, affinity);
  }
  modelPositionIsVisible(modelPosition) {
    return this._lines.modelPositionIsVisible(modelPosition.lineNumber, modelPosition.column);
  }
  getModelLineViewLineCount(modelLineNumber) {
    return this._lines.getModelLineViewLineCount(modelLineNumber);
  }
  getViewLineNumberOfModelPosition(modelLineNumber, modelColumn) {
    return this._lines.getViewLineNumberOfModelPosition(modelLineNumber, modelColumn);
  }
}
var IndentGuideRepeatOption = /* @__PURE__ */ ((IndentGuideRepeatOption2) => {
  IndentGuideRepeatOption2[IndentGuideRepeatOption2["BlockNone"] = 0] = "BlockNone";
  IndentGuideRepeatOption2[IndentGuideRepeatOption2["BlockSubsequent"] = 1] = "BlockSubsequent";
  IndentGuideRepeatOption2[IndentGuideRepeatOption2["BlockAll"] = 2] = "BlockAll";
  return IndentGuideRepeatOption2;
})(IndentGuideRepeatOption || {});
class ViewModelLinesFromModelAsIs {
  constructor(model) {
    this.model = model;
  }
  dispose() {
  }
  createCoordinatesConverter() {
    return new IdentityCoordinatesConverter(this.model);
  }
  getHiddenAreas() {
    return [];
  }
  setHiddenAreas(_ranges) {
    return false;
  }
  setTabSize(_newTabSize) {
    return false;
  }
  setWrappingSettings(_fontInfo, _wrappingStrategy, _wrappingColumn, _wrappingIndent) {
    return false;
  }
  createLineBreaksComputer() {
    const result = [];
    return {
      addRequest: (lineNumber, previousLineBreakData) => {
        result.push(null);
      },
      finalize: () => {
        return result;
      }
    };
  }
  onModelFlushed() {
  }
  onModelLinesDeleted(_versionId, fromLineNumber, toLineNumber) {
    return new viewEvents.ViewLinesDeletedEvent(fromLineNumber, toLineNumber);
  }
  onModelLinesInserted(_versionId, fromLineNumber, toLineNumber, lineBreaks) {
    return new viewEvents.ViewLinesInsertedEvent(fromLineNumber, toLineNumber);
  }
  onModelLineChanged(_versionId, lineNumber, lineBreakData) {
    return [false, new viewEvents.ViewLinesChangedEvent(lineNumber, 1), null, null];
  }
  acceptVersionId(_versionId) {
  }
  getViewLineCount() {
    return this.model.getLineCount();
  }
  getActiveIndentGuide(viewLineNumber, _minLineNumber, _maxLineNumber) {
    return {
      startLineNumber: viewLineNumber,
      endLineNumber: viewLineNumber,
      indent: 0
    };
  }
  getViewLinesBracketGuides(startLineNumber, endLineNumber, activePosition) {
    return new Array(endLineNumber - startLineNumber + 1).fill([]);
  }
  getViewLinesIndentGuides(viewStartLineNumber, viewEndLineNumber) {
    const viewLineCount = viewEndLineNumber - viewStartLineNumber + 1;
    const result = new Array(viewLineCount);
    for (let i = 0; i < viewLineCount; i++) {
      result[i] = 0;
    }
    return result;
  }
  getViewLineContent(viewLineNumber) {
    return this.model.getLineContent(viewLineNumber);
  }
  getViewLineLength(viewLineNumber) {
    return this.model.getLineLength(viewLineNumber);
  }
  getViewLineMinColumn(viewLineNumber) {
    return this.model.getLineMinColumn(viewLineNumber);
  }
  getViewLineMaxColumn(viewLineNumber) {
    return this.model.getLineMaxColumn(viewLineNumber);
  }
  getViewLineData(viewLineNumber) {
    const lineTokens = this.model.tokenization.getLineTokens(viewLineNumber);
    const lineContent = lineTokens.getLineContent();
    return new ViewLineData(
      lineContent,
      false,
      1,
      lineContent.length + 1,
      0,
      lineTokens.inflate(),
      null
    );
  }
  getViewLinesData(viewStartLineNumber, viewEndLineNumber, needed) {
    const lineCount = this.model.getLineCount();
    viewStartLineNumber = Math.min(Math.max(1, viewStartLineNumber), lineCount);
    viewEndLineNumber = Math.min(Math.max(1, viewEndLineNumber), lineCount);
    const result = [];
    for (let lineNumber = viewStartLineNumber; lineNumber <= viewEndLineNumber; lineNumber++) {
      const idx = lineNumber - viewStartLineNumber;
      result[idx] = needed[idx] ? this.getViewLineData(lineNumber) : null;
    }
    return result;
  }
  getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations) {
    return this.model.getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations, onlyMarginDecorations);
  }
  normalizePosition(position, affinity) {
    return this.model.normalizePosition(position, affinity);
  }
  getLineIndentColumn(lineNumber) {
    return this.model.getLineIndentColumn(lineNumber);
  }
  getInjectedTextAt(position) {
    return null;
  }
}
export {
  ViewModelLinesFromModelAsIs,
  ViewModelLinesFromProjectedModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbExpbmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgV3JhcHBpbmdJbmRlbnQgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBGb250SW5mbyB9IGZyb20gJy4uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbiwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsLCBQb3NpdGlvbkFmZmluaXR5IH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZUluZGVudEd1aWRlSW5mbywgQnJhY2tldEd1aWRlT3B0aW9ucywgSW5kZW50R3VpZGUsIEluZGVudEd1aWRlSG9yaXpvbnRhbExpbmUgfSBmcm9tICcuLi90ZXh0TW9kZWxHdWlkZXMuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxMaW5lUHJvamVjdGlvbiwgSU1vZGVsTGluZVByb2plY3Rpb24gfSBmcm9tICcuL21vZGVsTGluZVByb2plY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxpbmVCcmVha3NDb21wdXRlciwgTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEsIEluamVjdGVkVGV4dCwgSUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksIElMaW5lQnJlYWtzQ29tcHV0ZXJDb250ZXh0IH0gZnJvbSAnLi4vbW9kZWxMaW5lUHJvamVjdGlvbkRhdGEuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRUaW1lUHJlZml4U3VtQ29tcHV0ZXIgfSBmcm9tICcuLi9tb2RlbC9wcmVmaXhTdW1Db21wdXRlci5qcyc7XG5pbXBvcnQgeyBWaWV3TGluZURhdGEgfSBmcm9tICcuLi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvb3JkaW5hdGVzQ29udmVydGVyLCBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyIH0gZnJvbSAnLi4vY29vcmRpbmF0ZXNDb252ZXJ0ZXIuanMnO1xuaW1wb3J0IHsgTGluZUluamVjdGVkVGV4dCB9IGZyb20gJy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdNb2RlbExpbmVzIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRjcmVhdGVDb29yZGluYXRlc0NvbnZlcnRlcigpOiBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXI7XG5cblx0c2V0V3JhcHBpbmdTZXR0aW5ncyhmb250SW5mbzogRm9udEluZm8sIHdyYXBwaW5nU3RyYXRlZ3k6ICdzaW1wbGUnIHwgJ2FkdmFuY2VkJywgd3JhcHBpbmdDb2x1bW46IG51bWJlciwgd3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50LCB3b3JkQnJlYWs6ICdub3JtYWwnIHwgJ2tlZXBBbGwnKTogYm9vbGVhbjtcblx0c2V0VGFiU2l6ZShuZXdUYWJTaXplOiBudW1iZXIpOiBib29sZWFuO1xuXHRnZXRIaWRkZW5BcmVhcygpOiBSYW5nZVtdO1xuXHRzZXRIaWRkZW5BcmVhcyhfcmFuZ2VzOiByZWFkb25seSBSYW5nZVtdKTogYm9vbGVhbjtcblxuXHRjcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoY29udGV4dD86IElMaW5lQnJlYWtzQ29tcHV0ZXJDb250ZXh0KTogSUxpbmVCcmVha3NDb21wdXRlcjtcblx0b25Nb2RlbEZsdXNoZWQoKTogdm9pZDtcblx0b25Nb2RlbExpbmVzRGVsZXRlZCh2ZXJzaW9uSWQ6IG51bWJlciB8IG51bGwsIGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyKTogdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQgfCBudWxsO1xuXHRvbk1vZGVsTGluZXNJbnNlcnRlZCh2ZXJzaW9uSWQ6IG51bWJlciB8IG51bGwsIGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyLCBsaW5lQnJlYWtzOiAoTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsKVtdKTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50IHwgbnVsbDtcblx0b25Nb2RlbExpbmVDaGFuZ2VkKHZlcnNpb25JZDogbnVtYmVyIHwgbnVsbCwgbGluZU51bWJlcjogbnVtYmVyLCBsaW5lQnJlYWtEYXRhOiBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwpOiBbYm9vbGVhbiwgdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQgfCBudWxsLCB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQgfCBudWxsLCB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCB8IG51bGxdO1xuXHRhY2NlcHRWZXJzaW9uSWQodmVyc2lvbklkOiBudW1iZXIpOiB2b2lkO1xuXG5cdGdldFZpZXdMaW5lQ291bnQoKTogbnVtYmVyO1xuXHRnZXRBY3RpdmVJbmRlbnRHdWlkZSh2aWV3TGluZU51bWJlcjogbnVtYmVyLCBtaW5MaW5lTnVtYmVyOiBudW1iZXIsIG1heExpbmVOdW1iZXI6IG51bWJlcik6IElBY3RpdmVJbmRlbnRHdWlkZUluZm87XG5cdGdldFZpZXdMaW5lc0luZGVudEd1aWRlcyh2aWV3U3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHZpZXdFbmRMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXJbXTtcblx0Z2V0Vmlld0xpbmVzQnJhY2tldEd1aWRlcyhzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBhY3RpdmVQb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCwgb3B0aW9uczogQnJhY2tldEd1aWRlT3B0aW9ucyk6IEluZGVudEd1aWRlW11bXTtcblx0Z2V0Vmlld0xpbmVDb250ZW50KHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmc7XG5cdGdldFZpZXdMaW5lTGVuZ3RoKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXI7XG5cdGdldFZpZXdMaW5lTWluQ29sdW1uKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXI7XG5cdGdldFZpZXdMaW5lTWF4Q29sdW1uKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXI7XG5cdGdldFZpZXdMaW5lRGF0YSh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogVmlld0xpbmVEYXRhO1xuXHRnZXRWaWV3TGluZXNEYXRhKHZpZXdTdGFydExpbmVOdW1iZXI6IG51bWJlciwgdmlld0VuZExpbmVOdW1iZXI6IG51bWJlciwgbmVlZGVkOiBib29sZWFuW10pOiBBcnJheTxWaWV3TGluZURhdGEgfCBudWxsPjtcblxuXHRnZXREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2U6IFJhbmdlLCBvd25lcklkOiBudW1iZXIsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4sIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiwgb25seU1pbmltYXBEZWNvcmF0aW9uczogYm9vbGVhbiwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSU1vZGVsRGVjb3JhdGlvbltdO1xuXG5cdGdldEluamVjdGVkVGV4dEF0KHZpZXdQb3NpdGlvbjogUG9zaXRpb24pOiBJbmplY3RlZFRleHQgfCBudWxsO1xuXG5cdG5vcm1hbGl6ZVBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkpOiBQb3NpdGlvbjtcblx0LyoqXG5cdCAqIEdldHMgdGhlIGNvbHVtbiBhdCB3aGljaCBpbmRlbnRhdGlvbiBzdG9wcyBhdCBhIGdpdmVuIGxpbmUuXG5cdCAqIEBpbnRlcm5hbFxuXHQqL1xuXHRnZXRMaW5lSW5kZW50Q29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFZpZXdNb2RlbExpbmVzRnJvbVByb2plY3RlZE1vZGVsIGltcGxlbWVudHMgSVZpZXdNb2RlbExpbmVzIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9ySWQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSBfdmFsaWRNb2RlbFZlcnNpb25JZDogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk6IElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5OiBJTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeTtcblxuXHRwcml2YXRlIGZvbnRJbmZvOiBGb250SW5mbztcblx0cHJpdmF0ZSB0YWJTaXplOiBudW1iZXI7XG5cdHByaXZhdGUgd3JhcHBpbmdDb2x1bW46IG51bWJlcjtcblx0cHJpdmF0ZSB3cmFwcGluZ0luZGVudDogV3JhcHBpbmdJbmRlbnQ7XG5cdHByaXZhdGUgd29yZEJyZWFrOiAnbm9ybWFsJyB8ICdrZWVwQWxsJztcblx0cHJpdmF0ZSB3cmFwcGluZ1N0cmF0ZWd5OiAnc2ltcGxlJyB8ICdhZHZhbmNlZCc7XG5cdHByaXZhdGUgd3JhcE9uRXNjYXBlZExpbmVGZWVkczogYm9vbGVhbjtcblxuXHRwcml2YXRlIG1vZGVsTGluZVByb2plY3Rpb25zITogSU1vZGVsTGluZVByb2plY3Rpb25bXTtcblxuXHQvKipcblx0ICogUmVmbGVjdHMgdGhlIHN1bSBvZiB0aGUgbGluZSBjb3VudHMgb2YgYWxsIHByb2plY3RlZCBtb2RlbCBsaW5lcy5cblx0Ki9cblx0cHJpdmF0ZSBwcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzITogQ29uc3RhbnRUaW1lUHJlZml4U3VtQ29tcHV0ZXI7XG5cblx0cHJpdmF0ZSBoaWRkZW5BcmVhc0RlY29yYXRpb25JZHMhOiBzdHJpbmdbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3JJZDogbnVtYmVyLFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdGRvbUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk6IElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk6IElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdGZvbnRJbmZvOiBGb250SW5mbyxcblx0XHR0YWJTaXplOiBudW1iZXIsXG5cdFx0d3JhcHBpbmdTdHJhdGVneTogJ3NpbXBsZScgfCAnYWR2YW5jZWQnLFxuXHRcdHdyYXBwaW5nQ29sdW1uOiBudW1iZXIsXG5cdFx0d3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50LFxuXHRcdHdvcmRCcmVhazogJ25vcm1hbCcgfCAna2VlcEFsbCcsXG5cdFx0d3JhcE9uRXNjYXBlZExpbmVGZWVkczogYm9vbGVhblxuXHQpIHtcblx0XHR0aGlzLl9lZGl0b3JJZCA9IGVkaXRvcklkO1xuXHRcdHRoaXMubW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl92YWxpZE1vZGVsVmVyc2lvbklkID0gLTE7XG5cdFx0dGhpcy5fZG9tTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSA9IGRvbUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk7XG5cdFx0dGhpcy5fbW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSA9IG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk7XG5cdFx0dGhpcy5mb250SW5mbyA9IGZvbnRJbmZvO1xuXHRcdHRoaXMudGFiU2l6ZSA9IHRhYlNpemU7XG5cdFx0dGhpcy53cmFwcGluZ1N0cmF0ZWd5ID0gd3JhcHBpbmdTdHJhdGVneTtcblx0XHR0aGlzLndyYXBwaW5nQ29sdW1uID0gd3JhcHBpbmdDb2x1bW47XG5cdFx0dGhpcy53cmFwcGluZ0luZGVudCA9IHdyYXBwaW5nSW5kZW50O1xuXHRcdHRoaXMud29yZEJyZWFrID0gd29yZEJyZWFrO1xuXHRcdHRoaXMud3JhcE9uRXNjYXBlZExpbmVGZWVkcyA9IHdyYXBPbkVzY2FwZWRMaW5lRmVlZHM7XG5cblx0XHR0aGlzLl9jb25zdHJ1Y3RMaW5lcygvKnJlc2V0SGlkZGVuQXJlYXMqL3RydWUsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRkZW5BcmVhc0RlY29yYXRpb25JZHMgPSB0aGlzLm1vZGVsLmRlbHRhRGVjb3JhdGlvbnModGhpcy5oaWRkZW5BcmVhc0RlY29yYXRpb25JZHMsIFtdKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVDb29yZGluYXRlc0NvbnZlcnRlcigpOiBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXIge1xuXHRcdHJldHVybiBuZXcgQ29vcmRpbmF0ZXNDb252ZXJ0ZXIodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25zdHJ1Y3RMaW5lcyhyZXNldEhpZGRlbkFyZWFzOiBib29sZWFuLCBwcmV2aW91c0xpbmVCcmVha3M6ICgoTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsKVtdKSB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zID0gW107XG5cblx0XHRpZiAocmVzZXRIaWRkZW5BcmVhcykge1xuXHRcdFx0dGhpcy5oaWRkZW5BcmVhc0RlY29yYXRpb25JZHMgPSB0aGlzLm1vZGVsLmRlbHRhRGVjb3JhdGlvbnModGhpcy5oaWRkZW5BcmVhc0RlY29yYXRpb25JZHMsIFtdKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lc0NvbnRlbnQgPSB0aGlzLm1vZGVsLmdldExpbmVzQ29udGVudCgpO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IGxpbmVzQ29udGVudC5sZW5ndGg7XG5cdFx0Y29uc3QgbGluZUJyZWFrc0NvbXB1dGVyID0gdGhpcy5jcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZUNvdW50OyBpKyspIHtcblx0XHRcdGxpbmVCcmVha3NDb21wdXRlci5hZGRSZXF1ZXN0KGkgKyAxLCBwcmV2aW91c0xpbmVCcmVha3MgPyBwcmV2aW91c0xpbmVCcmVha3NbaV0gOiBudWxsKTtcblx0XHR9XG5cdFx0Y29uc3QgbGluZXNCcmVha3MgPSBsaW5lQnJlYWtzQ29tcHV0ZXIuZmluYWxpemUoKTtcblxuXHRcdGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcblxuXHRcdGNvbnN0IGhpZGRlbkFyZWFzID0gdGhpcy5oaWRkZW5BcmVhc0RlY29yYXRpb25JZHMubWFwKChhcmVhSWQpID0+IHRoaXMubW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGFyZWFJZCkhKS5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0bGV0IGhpZGRlbkFyZWFTdGFydCA9IDEsIGhpZGRlbkFyZWFFbmQgPSAwO1xuXHRcdGxldCBoaWRkZW5BcmVhSWR4ID0gLTE7XG5cdFx0bGV0IG5leHRMaW5lTnVtYmVyVG9VcGRhdGVIaWRkZW5BcmVhID0gKGhpZGRlbkFyZWFJZHggKyAxIDwgaGlkZGVuQXJlYXMubGVuZ3RoKSA/IGhpZGRlbkFyZWFFbmQgKyAxIDogbGluZUNvdW50ICsgMjtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblxuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IG5leHRMaW5lTnVtYmVyVG9VcGRhdGVIaWRkZW5BcmVhKSB7XG5cdFx0XHRcdGhpZGRlbkFyZWFJZHgrKztcblx0XHRcdFx0aGlkZGVuQXJlYVN0YXJ0ID0gaGlkZGVuQXJlYXNbaGlkZGVuQXJlYUlkeF0uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRoaWRkZW5BcmVhRW5kID0gaGlkZGVuQXJlYXNbaGlkZGVuQXJlYUlkeF0uZW5kTGluZU51bWJlcjtcblx0XHRcdFx0bmV4dExpbmVOdW1iZXJUb1VwZGF0ZUhpZGRlbkFyZWEgPSAoaGlkZGVuQXJlYUlkeCArIDEgPCBoaWRkZW5BcmVhcy5sZW5ndGgpID8gaGlkZGVuQXJlYUVuZCArIDEgOiBsaW5lQ291bnQgKyAyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0luSGlkZGVuQXJlYSA9IChsaW5lTnVtYmVyID49IGhpZGRlbkFyZWFTdGFydCAmJiBsaW5lTnVtYmVyIDw9IGhpZGRlbkFyZWFFbmQpO1xuXHRcdFx0Y29uc3QgbGluZSA9IGNyZWF0ZU1vZGVsTGluZVByb2plY3Rpb24obGluZXNCcmVha3NbaV0sICFpc0luSGlkZGVuQXJlYSk7XG5cdFx0XHR2YWx1ZXNbaV0gPSBsaW5lLmdldFZpZXdMaW5lQ291bnQoKTtcblx0XHRcdHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaV0gPSBsaW5lO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZhbGlkTW9kZWxWZXJzaW9uSWQgPSB0aGlzLm1vZGVsLmdldFZlcnNpb25JZCgpO1xuXG5cdFx0dGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzID0gbmV3IENvbnN0YW50VGltZVByZWZpeFN1bUNvbXB1dGVyKHZhbHVlcyk7XG5cblx0XHR0aGlzLl9lbnN1cmVBdExlYXN0T25lVmlzaWJsZUxpbmUoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRIaWRkZW5BcmVhcygpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5oaWRkZW5BcmVhc0RlY29yYXRpb25JZHMubWFwKFxuXHRcdFx0KGRlY0lkKSA9PiB0aGlzLm1vZGVsLmdldERlY29yYXRpb25SYW5nZShkZWNJZCkhXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRIaWRkZW5BcmVhcyhfcmFuZ2VzOiBSYW5nZVtdKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdmFsaWRhdGVkUmFuZ2VzID0gX3Jhbmdlcy5tYXAociA9PiB0aGlzLm1vZGVsLnZhbGlkYXRlUmFuZ2UocikpO1xuXHRcdGNvbnN0IG5ld1JhbmdlcyA9IG5vcm1hbGl6ZUxpbmVSYW5nZXModmFsaWRhdGVkUmFuZ2VzKTtcblxuXHRcdC8vIFRPRE9ATWFydGluOiBQbGVhc2Ugc3RvcCBjYWxsaW5nIHRoaXMgbWV0aG9kIG9uIGVhY2ggbW9kZWwgY2hhbmdlIVxuXG5cdFx0Ly8gVGhpcyBjaGVja3MgaWYgdGhlcmUgcmVhbGx5IHdhcyBhIGNoYW5nZVxuXHRcdGNvbnN0IG9sZFJhbmdlcyA9IHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzLm1hcCgoYXJlYUlkKSA9PiB0aGlzLm1vZGVsLmdldERlY29yYXRpb25SYW5nZShhcmVhSWQpISkuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRcdGlmIChuZXdSYW5nZXMubGVuZ3RoID09PSBvbGRSYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRsZXQgaGFzRGlmZmVyZW5jZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuZXdSYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKCFuZXdSYW5nZXNbaV0uZXF1YWxzUmFuZ2Uob2xkUmFuZ2VzW2ldKSkge1xuXHRcdFx0XHRcdGhhc0RpZmZlcmVuY2UgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWhhc0RpZmZlcmVuY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zID0gbmV3UmFuZ2VzLm1hcDxJTW9kZWxEZWx0YURlY29yYXRpb24+KFxuXHRcdFx0KHIpID0+XG5cdFx0XHQoe1xuXHRcdFx0XHRyYW5nZTogcixcblx0XHRcdFx0b3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5FTVBUWSxcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzID0gdGhpcy5tb2RlbC5kZWx0YURlY29yYXRpb25zKHRoaXMuaGlkZGVuQXJlYXNEZWNvcmF0aW9uSWRzLCBuZXdEZWNvcmF0aW9ucyk7XG5cblx0XHRjb25zdCBoaWRkZW5BcmVhcyA9IG5ld1Jhbmdlcztcblx0XHRsZXQgaGlkZGVuQXJlYVN0YXJ0ID0gMSwgaGlkZGVuQXJlYUVuZCA9IDA7XG5cdFx0bGV0IGhpZGRlbkFyZWFJZHggPSAtMTtcblx0XHRsZXQgbmV4dExpbmVOdW1iZXJUb1VwZGF0ZUhpZGRlbkFyZWEgPSAoaGlkZGVuQXJlYUlkeCArIDEgPCBoaWRkZW5BcmVhcy5sZW5ndGgpID8gaGlkZGVuQXJlYUVuZCArIDEgOiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLmxlbmd0aCArIDI7XG5cblx0XHRsZXQgaGFzVmlzaWJsZUxpbmUgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblxuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IG5leHRMaW5lTnVtYmVyVG9VcGRhdGVIaWRkZW5BcmVhKSB7XG5cdFx0XHRcdGhpZGRlbkFyZWFJZHgrKztcblx0XHRcdFx0aGlkZGVuQXJlYVN0YXJ0ID0gaGlkZGVuQXJlYXNbaGlkZGVuQXJlYUlkeF0uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRoaWRkZW5BcmVhRW5kID0gaGlkZGVuQXJlYXNbaGlkZGVuQXJlYUlkeF0uZW5kTGluZU51bWJlcjtcblx0XHRcdFx0bmV4dExpbmVOdW1iZXJUb1VwZGF0ZUhpZGRlbkFyZWEgPSAoaGlkZGVuQXJlYUlkeCArIDEgPCBoaWRkZW5BcmVhcy5sZW5ndGgpID8gaGlkZGVuQXJlYUVuZCArIDEgOiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zLmxlbmd0aCArIDI7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBsaW5lQ2hhbmdlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPj0gaGlkZGVuQXJlYVN0YXJ0ICYmIGxpbmVOdW1iZXIgPD0gaGlkZGVuQXJlYUVuZCkge1xuXHRcdFx0XHQvLyBMaW5lIHNob3VsZCBiZSBoaWRkZW5cblx0XHRcdFx0aWYgKHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaV0uaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0XHR0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2ldID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpXS5zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdFx0XHRsaW5lQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhhc1Zpc2libGVMaW5lID0gdHJ1ZTtcblx0XHRcdFx0Ly8gTGluZSBzaG91bGQgYmUgdmlzaWJsZVxuXHRcdFx0XHRpZiAoIXRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaV0uaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0XHR0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2ldID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpXS5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdFx0XHRcdGxpbmVDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGxpbmVDaGFuZ2VkKSB7XG5cdFx0XHRcdGNvbnN0IG5ld091dHB1dExpbmVDb3VudCA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaV0uZ2V0Vmlld0xpbmVDb3VudCgpO1xuXHRcdFx0XHR0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuc2V0VmFsdWUoaSwgbmV3T3V0cHV0TGluZUNvdW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWhhc1Zpc2libGVMaW5lKSB7XG5cdFx0XHQvLyBDYW5ub3QgaGF2ZSBldmVyeXRoaW5nIGJlIGhpZGRlbiA9PiByZXZlYWwgZXZlcnl0aGluZyFcblx0XHRcdHRoaXMuc2V0SGlkZGVuQXJlYXMoW10pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG1vZGVsUG9zaXRpb25Jc1Zpc2libGUobW9kZWxMaW5lTnVtYmVyOiBudW1iZXIsIF9tb2RlbENvbHVtbjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKG1vZGVsTGluZU51bWJlciA8IDEgfHwgbW9kZWxMaW5lTnVtYmVyID4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdC8vIGludmFsaWQgYXJndW1lbnRzXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW21vZGVsTGluZU51bWJlciAtIDFdLmlzVmlzaWJsZSgpO1xuXHR9XG5cblx0cHVibGljIGdldE1vZGVsTGluZVZpZXdMaW5lQ291bnQobW9kZWxMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChtb2RlbExpbmVOdW1iZXIgPCAxIHx8IG1vZGVsTGluZU51bWJlciA+IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHQvLyBpbnZhbGlkIGFyZ3VtZW50c1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW21vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdMaW5lQ291bnQoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRUYWJTaXplKG5ld1RhYlNpemU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnRhYlNpemUgPT09IG5ld1RhYlNpemUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy50YWJTaXplID0gbmV3VGFiU2l6ZTtcblxuXHRcdHRoaXMuX2NvbnN0cnVjdExpbmVzKC8qcmVzZXRIaWRkZW5BcmVhcyovZmFsc2UsIG51bGwpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgc2V0V3JhcHBpbmdTZXR0aW5ncyhmb250SW5mbzogRm9udEluZm8sIHdyYXBwaW5nU3RyYXRlZ3k6ICdzaW1wbGUnIHwgJ2FkdmFuY2VkJywgd3JhcHBpbmdDb2x1bW46IG51bWJlciwgd3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50LCB3b3JkQnJlYWs6ICdub3JtYWwnIHwgJ2tlZXBBbGwnKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXF1YWxGb250SW5mbyA9IHRoaXMuZm9udEluZm8uZXF1YWxzKGZvbnRJbmZvKTtcblx0XHRjb25zdCBlcXVhbFdyYXBwaW5nU3RyYXRlZ3kgPSAodGhpcy53cmFwcGluZ1N0cmF0ZWd5ID09PSB3cmFwcGluZ1N0cmF0ZWd5KTtcblx0XHRjb25zdCBlcXVhbFdyYXBwaW5nQ29sdW1uID0gKHRoaXMud3JhcHBpbmdDb2x1bW4gPT09IHdyYXBwaW5nQ29sdW1uKTtcblx0XHRjb25zdCBlcXVhbFdyYXBwaW5nSW5kZW50ID0gKHRoaXMud3JhcHBpbmdJbmRlbnQgPT09IHdyYXBwaW5nSW5kZW50KTtcblx0XHRjb25zdCBlcXVhbFdvcmRCcmVhayA9ICh0aGlzLndvcmRCcmVhayA9PT0gd29yZEJyZWFrKTtcblx0XHRpZiAoZXF1YWxGb250SW5mbyAmJiBlcXVhbFdyYXBwaW5nU3RyYXRlZ3kgJiYgZXF1YWxXcmFwcGluZ0NvbHVtbiAmJiBlcXVhbFdyYXBwaW5nSW5kZW50ICYmIGVxdWFsV29yZEJyZWFrKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25seVdyYXBwaW5nQ29sdW1uQ2hhbmdlZCA9IChlcXVhbEZvbnRJbmZvICYmIGVxdWFsV3JhcHBpbmdTdHJhdGVneSAmJiAhZXF1YWxXcmFwcGluZ0NvbHVtbiAmJiBlcXVhbFdyYXBwaW5nSW5kZW50ICYmIGVxdWFsV29yZEJyZWFrKTtcblxuXHRcdHRoaXMuZm9udEluZm8gPSBmb250SW5mbztcblx0XHR0aGlzLndyYXBwaW5nU3RyYXRlZ3kgPSB3cmFwcGluZ1N0cmF0ZWd5O1xuXHRcdHRoaXMud3JhcHBpbmdDb2x1bW4gPSB3cmFwcGluZ0NvbHVtbjtcblx0XHR0aGlzLndyYXBwaW5nSW5kZW50ID0gd3JhcHBpbmdJbmRlbnQ7XG5cdFx0dGhpcy53b3JkQnJlYWsgPSB3b3JkQnJlYWs7XG5cblx0XHRsZXQgcHJldmlvdXNMaW5lQnJlYWtzOiAoKE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbClbXSkgfCBudWxsID0gbnVsbDtcblx0XHRpZiAob25seVdyYXBwaW5nQ29sdW1uQ2hhbmdlZCkge1xuXHRcdFx0cHJldmlvdXNMaW5lQnJlYWtzID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRwcmV2aW91c0xpbmVCcmVha3NbaV0gPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2ldLmdldFByb2plY3Rpb25EYXRhKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29uc3RydWN0TGluZXMoLypyZXNldEhpZGRlbkFyZWFzKi9mYWxzZSwgcHJldmlvdXNMaW5lQnJlYWtzKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUxpbmVCcmVha3NDb21wdXRlcihfY29udGV4dD86IElMaW5lQnJlYWtzQ29tcHV0ZXJDb250ZXh0KTogSUxpbmVCcmVha3NDb21wdXRlciB7XG5cdFx0Y29uc3QgbGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSA9IChcblx0XHRcdHRoaXMud3JhcHBpbmdTdHJhdGVneSA9PT0gJ2FkdmFuY2VkJ1xuXHRcdFx0XHQ/IHRoaXMuX2RvbUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnlcblx0XHRcdFx0OiB0aGlzLl9tb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5XG5cdFx0KTtcblx0XHRjb25zdCBjb250ZXh0OiBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCA9IF9jb250ZXh0ID8/IHtcblx0XHRcdGdldExpbmVDb250ZW50OiAobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZUluamVjdGVkVGV4dDogKGxpbmVOdW1iZXI6IG51bWJlcik6IExpbmVJbmplY3RlZFRleHRbXSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVJbmplY3RlZFRleHQobGluZU51bWJlciwgdGhpcy5fZWRpdG9ySWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIGxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkuY3JlYXRlTGluZUJyZWFrc0NvbXB1dGVyKGNvbnRleHQsIHRoaXMuZm9udEluZm8sIHRoaXMudGFiU2l6ZSwgdGhpcy53cmFwcGluZ0NvbHVtbiwgdGhpcy53cmFwcGluZ0luZGVudCwgdGhpcy53b3JkQnJlYWssIHRoaXMud3JhcE9uRXNjYXBlZExpbmVGZWVkcyk7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbEZsdXNoZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29uc3RydWN0TGluZXMoLypyZXNldEhpZGRlbkFyZWFzKi90cnVlLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBvbk1vZGVsTGluZXNEZWxldGVkKHZlcnNpb25JZDogbnVtYmVyIHwgbnVsbCwgZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCB8IG51bGwge1xuXHRcdGlmICghdmVyc2lvbklkIHx8IHZlcnNpb25JZCA8PSB0aGlzLl92YWxpZE1vZGVsVmVyc2lvbklkKSB7XG5cdFx0XHQvLyBIZXJlIHdlIGNoZWNrIGZvciB2ZXJzaW9uSWQgaW4gY2FzZSB0aGUgbGluZXMgd2VyZSByZWNvbnN0cnVjdGVkIGluIHRoZSBtZWFudGltZS5cblx0XHRcdC8vIFdlIGRvbid0IHdhbnQgdG8gYXBwbHkgc3RhbGUgY2hhbmdlIGV2ZW50cyBvbiB0b3Agb2YgYSBuZXdlciByZWFkIG1vZGVsIHN0YXRlLlxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3V0cHV0RnJvbUxpbmVOdW1iZXIgPSAoZnJvbUxpbmVOdW1iZXIgPT09IDEgPyAxIDogdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFByZWZpeFN1bShmcm9tTGluZU51bWJlciAtIDEpICsgMSk7XG5cdFx0Y29uc3Qgb3V0cHV0VG9MaW5lTnVtYmVyID0gdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFByZWZpeFN1bSh0b0xpbmVOdW1iZXIpO1xuXG5cdFx0dGhpcy5tb2RlbExpbmVQcm9qZWN0aW9ucy5zcGxpY2UoZnJvbUxpbmVOdW1iZXIgLSAxLCB0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDEpO1xuXHRcdHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5yZW1vdmVWYWx1ZXMoZnJvbUxpbmVOdW1iZXIgLSAxLCB0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDEpO1xuXG5cdFx0cmV0dXJuIG5ldyB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudChvdXRwdXRGcm9tTGluZU51bWJlciwgb3V0cHV0VG9MaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBvbk1vZGVsTGluZXNJbnNlcnRlZCh2ZXJzaW9uSWQ6IG51bWJlciB8IG51bGwsIGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIF90b0xpbmVOdW1iZXI6IG51bWJlciwgbGluZUJyZWFrczogKE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbClbXSk6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCB8IG51bGwge1xuXHRcdGlmICghdmVyc2lvbklkIHx8IHZlcnNpb25JZCA8PSB0aGlzLl92YWxpZE1vZGVsVmVyc2lvbklkKSB7XG5cdFx0XHQvLyBIZXJlIHdlIGNoZWNrIGZvciB2ZXJzaW9uSWQgaW4gY2FzZSB0aGUgbGluZXMgd2VyZSByZWNvbnN0cnVjdGVkIGluIHRoZSBtZWFudGltZS5cblx0XHRcdC8vIFdlIGRvbid0IHdhbnQgdG8gYXBwbHkgc3RhbGUgY2hhbmdlIGV2ZW50cyBvbiB0b3Agb2YgYSBuZXdlciByZWFkIG1vZGVsIHN0YXRlLlxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gY2Fubm90IHVzZSB0aGlzLmdldEhpZGRlbkFyZWFzKCkgYmVjYXVzZSB0aG9zZSBkZWNvcmF0aW9ucyBoYXZlIGFscmVhZHkgc2VlbiB0aGUgZWZmZWN0IG9mIHRoaXMgbW9kZWwgY2hhbmdlXG5cdFx0Y29uc3QgaXNJbkhpZGRlbkFyZWEgPSAoZnJvbUxpbmVOdW1iZXIgPiAyICYmICF0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2Zyb21MaW5lTnVtYmVyIC0gMl0uaXNWaXNpYmxlKCkpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0RnJvbUxpbmVOdW1iZXIgPSAoZnJvbUxpbmVOdW1iZXIgPT09IDEgPyAxIDogdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFByZWZpeFN1bShmcm9tTGluZU51bWJlciAtIDEpICsgMSk7XG5cblx0XHRsZXQgdG90YWxPdXRwdXRMaW5lQ291bnQgPSAwO1xuXHRcdGNvbnN0IGluc2VydExpbmVzOiBJTW9kZWxMaW5lUHJvamVjdGlvbltdID0gW107XG5cdFx0Y29uc3QgaW5zZXJ0UHJlZml4U3VtVmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVCcmVha3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBjcmVhdGVNb2RlbExpbmVQcm9qZWN0aW9uKGxpbmVCcmVha3NbaV0sICFpc0luSGlkZGVuQXJlYSk7XG5cdFx0XHRpbnNlcnRMaW5lcy5wdXNoKGxpbmUpO1xuXG5cdFx0XHRjb25zdCBvdXRwdXRMaW5lQ291bnQgPSBsaW5lLmdldFZpZXdMaW5lQ291bnQoKTtcblx0XHRcdHRvdGFsT3V0cHV0TGluZUNvdW50ICs9IG91dHB1dExpbmVDb3VudDtcblx0XHRcdGluc2VydFByZWZpeFN1bVZhbHVlc1tpXSA9IG91dHB1dExpbmVDb3VudDtcblx0XHR9XG5cblx0XHQvLyBUT0RPQEFsZXg6IHVzZSBhcnJheXMuYXJyYXlJbnNlcnRcblx0XHR0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zID1cblx0XHRcdHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMuc2xpY2UoMCwgZnJvbUxpbmVOdW1iZXIgLSAxKVxuXHRcdFx0XHQuY29uY2F0KGluc2VydExpbmVzKVxuXHRcdFx0XHQuY29uY2F0KHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMuc2xpY2UoZnJvbUxpbmVOdW1iZXIgLSAxKSk7XG5cblx0XHR0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuaW5zZXJ0VmFsdWVzKGZyb21MaW5lTnVtYmVyIC0gMSwgaW5zZXJ0UHJlZml4U3VtVmFsdWVzKTtcblxuXHRcdHJldHVybiBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KG91dHB1dEZyb21MaW5lTnVtYmVyLCBvdXRwdXRGcm9tTGluZU51bWJlciArIHRvdGFsT3V0cHV0TGluZUNvdW50IC0gMSk7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbExpbmVDaGFuZ2VkKHZlcnNpb25JZDogbnVtYmVyIHwgbnVsbCwgbGluZU51bWJlcjogbnVtYmVyLCBsaW5lQnJlYWtEYXRhOiBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwpOiBbYm9vbGVhbiwgdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQgfCBudWxsLCB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQgfCBudWxsLCB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCB8IG51bGxdIHtcblx0XHRpZiAodmVyc2lvbklkICE9PSBudWxsICYmIHZlcnNpb25JZCA8PSB0aGlzLl92YWxpZE1vZGVsVmVyc2lvbklkKSB7XG5cdFx0XHQvLyBIZXJlIHdlIGNoZWNrIGZvciB2ZXJzaW9uSWQgaW4gY2FzZSB0aGUgbGluZXMgd2VyZSByZWNvbnN0cnVjdGVkIGluIHRoZSBtZWFudGltZS5cblx0XHRcdC8vIFdlIGRvbid0IHdhbnQgdG8gYXBwbHkgc3RhbGUgY2hhbmdlIGV2ZW50cyBvbiB0b3Agb2YgYSBuZXdlciByZWFkIG1vZGVsIHN0YXRlLlxuXHRcdFx0cmV0dXJuIFtmYWxzZSwgbnVsbCwgbnVsbCwgbnVsbF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUluZGV4ID0gbGluZU51bWJlciAtIDE7XG5cblx0XHRjb25zdCBvbGRPdXRwdXRMaW5lQ291bnQgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uZ2V0Vmlld0xpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGlzVmlzaWJsZSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5pc1Zpc2libGUoKTtcblx0XHRjb25zdCBsaW5lID0gY3JlYXRlTW9kZWxMaW5lUHJvamVjdGlvbihsaW5lQnJlYWtEYXRhLCBpc1Zpc2libGUpO1xuXHRcdHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XSA9IGxpbmU7XG5cdFx0Y29uc3QgbmV3T3V0cHV0TGluZUNvdW50ID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmdldFZpZXdMaW5lQ291bnQoKTtcblxuXHRcdGxldCBsaW5lTWFwcGluZ0NoYW5nZWQgPSBmYWxzZTtcblx0XHRsZXQgY2hhbmdlRnJvbSA9IDA7XG5cdFx0bGV0IGNoYW5nZVRvID0gLTE7XG5cdFx0bGV0IGluc2VydEZyb20gPSAwO1xuXHRcdGxldCBpbnNlcnRUbyA9IC0xO1xuXHRcdGxldCBkZWxldGVGcm9tID0gMDtcblx0XHRsZXQgZGVsZXRlVG8gPSAtMTtcblxuXHRcdGlmIChvbGRPdXRwdXRMaW5lQ291bnQgPiBuZXdPdXRwdXRMaW5lQ291bnQpIHtcblx0XHRcdGNoYW5nZUZyb20gPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKGxpbmVOdW1iZXIgLSAxKSArIDE7XG5cdFx0XHRjaGFuZ2VUbyA9IGNoYW5nZUZyb20gKyBuZXdPdXRwdXRMaW5lQ291bnQgLSAxO1xuXHRcdFx0ZGVsZXRlRnJvbSA9IGNoYW5nZVRvICsgMTtcblx0XHRcdGRlbGV0ZVRvID0gZGVsZXRlRnJvbSArIChvbGRPdXRwdXRMaW5lQ291bnQgLSBuZXdPdXRwdXRMaW5lQ291bnQpIC0gMTtcblx0XHRcdGxpbmVNYXBwaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChvbGRPdXRwdXRMaW5lQ291bnQgPCBuZXdPdXRwdXRMaW5lQ291bnQpIHtcblx0XHRcdGNoYW5nZUZyb20gPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKGxpbmVOdW1iZXIgLSAxKSArIDE7XG5cdFx0XHRjaGFuZ2VUbyA9IGNoYW5nZUZyb20gKyBvbGRPdXRwdXRMaW5lQ291bnQgLSAxO1xuXHRcdFx0aW5zZXJ0RnJvbSA9IGNoYW5nZVRvICsgMTtcblx0XHRcdGluc2VydFRvID0gaW5zZXJ0RnJvbSArIChuZXdPdXRwdXRMaW5lQ291bnQgLSBvbGRPdXRwdXRMaW5lQ291bnQpIC0gMTtcblx0XHRcdGxpbmVNYXBwaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNoYW5nZUZyb20gPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKGxpbmVOdW1iZXIgLSAxKSArIDE7XG5cdFx0XHRjaGFuZ2VUbyA9IGNoYW5nZUZyb20gKyBuZXdPdXRwdXRMaW5lQ291bnQgLSAxO1xuXHRcdH1cblxuXHRcdHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5zZXRWYWx1ZShsaW5lSW5kZXgsIG5ld091dHB1dExpbmVDb3VudCk7XG5cblx0XHRjb25zdCB2aWV3TGluZXNDaGFuZ2VkRXZlbnQgPSAoY2hhbmdlRnJvbSA8PSBjaGFuZ2VUbyA/IG5ldyB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudChjaGFuZ2VGcm9tLCBjaGFuZ2VUbyAtIGNoYW5nZUZyb20gKyAxKSA6IG51bGwpO1xuXHRcdGNvbnN0IHZpZXdMaW5lc0luc2VydGVkRXZlbnQgPSAoaW5zZXJ0RnJvbSA8PSBpbnNlcnRUbyA/IG5ldyB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQoaW5zZXJ0RnJvbSwgaW5zZXJ0VG8pIDogbnVsbCk7XG5cdFx0Y29uc3Qgdmlld0xpbmVzRGVsZXRlZEV2ZW50ID0gKGRlbGV0ZUZyb20gPD0gZGVsZXRlVG8gPyBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQoZGVsZXRlRnJvbSwgZGVsZXRlVG8pIDogbnVsbCk7XG5cblx0XHRyZXR1cm4gW2xpbmVNYXBwaW5nQ2hhbmdlZCwgdmlld0xpbmVzQ2hhbmdlZEV2ZW50LCB2aWV3TGluZXNJbnNlcnRlZEV2ZW50LCB2aWV3TGluZXNEZWxldGVkRXZlbnRdO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdFZlcnNpb25JZCh2ZXJzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbGlkTW9kZWxWZXJzaW9uSWQgPSB2ZXJzaW9uSWQ7XG5cdFx0dGhpcy5fZW5zdXJlQXRMZWFzdE9uZVZpc2libGVMaW5lKCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVBdExlYXN0T25lVmlzaWJsZUxpbmUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZ2V0Vmlld0xpbmVDb3VudCgpID09PSAwICYmIHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1swXSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbMF0uc2V0VmlzaWJsZSh0cnVlKTtcblx0XHRcdHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5zZXRWYWx1ZSgwLCB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zWzBdLmdldFZpZXdMaW5lQ291bnQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5wcm9qZWN0ZWRNb2RlbExpbmVMaW5lQ291bnRzLmdldFRvdGFsU3VtKCk7XG5cdH1cblxuXHRwcml2YXRlIF90b1ZhbGlkVmlld0xpbmVOdW1iZXIodmlld0xpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHZpZXdMaW5lTnVtYmVyIDwgMSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGNvbnN0IHZpZXdMaW5lQ291bnQgPSB0aGlzLmdldFZpZXdMaW5lQ291bnQoKTtcblx0XHRpZiAodmlld0xpbmVOdW1iZXIgPiB2aWV3TGluZUNvdW50KSB7XG5cdFx0XHRyZXR1cm4gdmlld0xpbmVDb3VudDtcblx0XHR9XG5cdFx0cmV0dXJuIHZpZXdMaW5lTnVtYmVyIHwgMDtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVJbmRlbnRHdWlkZSh2aWV3TGluZU51bWJlcjogbnVtYmVyLCBtaW5MaW5lTnVtYmVyOiBudW1iZXIsIG1heExpbmVOdW1iZXI6IG51bWJlcik6IElBY3RpdmVJbmRlbnRHdWlkZUluZm8ge1xuXHRcdHZpZXdMaW5lTnVtYmVyID0gdGhpcy5fdG9WYWxpZFZpZXdMaW5lTnVtYmVyKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRtaW5MaW5lTnVtYmVyID0gdGhpcy5fdG9WYWxpZFZpZXdMaW5lTnVtYmVyKG1pbkxpbmVOdW1iZXIpO1xuXHRcdG1heExpbmVOdW1iZXIgPSB0aGlzLl90b1ZhbGlkVmlld0xpbmVOdW1iZXIobWF4TGluZU51bWJlcik7XG5cblx0XHRjb25zdCBtb2RlbFBvc2l0aW9uID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldFZpZXdMaW5lTWluQ29sdW1uKHZpZXdMaW5lTnVtYmVyKSk7XG5cdFx0Y29uc3QgbW9kZWxNaW5Qb3NpdGlvbiA9IHRoaXMuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihtaW5MaW5lTnVtYmVyLCB0aGlzLmdldFZpZXdMaW5lTWluQ29sdW1uKG1pbkxpbmVOdW1iZXIpKTtcblx0XHRjb25zdCBtb2RlbE1heFBvc2l0aW9uID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG1heExpbmVOdW1iZXIsIHRoaXMuZ2V0Vmlld0xpbmVNaW5Db2x1bW4obWF4TGluZU51bWJlcikpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubW9kZWwuZ3VpZGVzLmdldEFjdGl2ZUluZGVudEd1aWRlKG1vZGVsUG9zaXRpb24ubGluZU51bWJlciwgbW9kZWxNaW5Qb3NpdGlvbi5saW5lTnVtYmVyLCBtb2RlbE1heFBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3Qgdmlld1N0YXJ0UG9zaXRpb24gPSB0aGlzLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24ocmVzdWx0LnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0Y29uc3Qgdmlld0VuZFBvc2l0aW9uID0gdGhpcy5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHJlc3VsdC5lbmRMaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4ocmVzdWx0LmVuZExpbmVOdW1iZXIpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiB2aWV3U3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogdmlld0VuZFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRpbmRlbnQ6IHJlc3VsdC5pbmRlbnRcblx0XHR9O1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBWaWV3TGluZUluZm9cblxuXHRwcml2YXRlIGdldFZpZXdMaW5lSW5mbyh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogVmlld0xpbmVJbmZvIHtcblx0XHR2aWV3TGluZU51bWJlciA9IHRoaXMuX3RvVmFsaWRWaWV3TGluZU51bWJlcih2aWV3TGluZU51bWJlcik7XG5cdFx0Y29uc3QgciA9IHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRJbmRleE9mKHZpZXdMaW5lTnVtYmVyIC0gMSk7XG5cdFx0Y29uc3QgbGluZUluZGV4ID0gci5pbmRleDtcblx0XHRjb25zdCByZW1haW5kZXIgPSByLnJlbWFpbmRlcjtcblx0XHRyZXR1cm4gbmV3IFZpZXdMaW5lSW5mbyhsaW5lSW5kZXggKyAxLCByZW1haW5kZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNaW5Db2x1bW5PZlZpZXdMaW5lKHZpZXdMaW5lSW5mbzogVmlld0xpbmVJbmZvKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1t2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oXG5cdFx0XHR0aGlzLm1vZGVsLFxuXHRcdFx0dmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlcixcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1heENvbHVtbk9mVmlld0xpbmUodmlld0xpbmVJbmZvOiBWaWV3TGluZUluZm8pOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW3ZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRWaWV3TGluZU1heENvbHVtbihcblx0XHRcdHRoaXMubW9kZWwsXG5cdFx0XHR2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyLFxuXHRcdFx0dmlld0xpbmVJbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9kZWxTdGFydFBvc2l0aW9uT2ZWaWV3TGluZSh2aWV3TGluZUluZm86IFZpZXdMaW5lSW5mbyk6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBsaW5lID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1t2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV07XG5cdFx0Y29uc3QgbWluVmlld0NvbHVtbiA9IGxpbmUuZ2V0Vmlld0xpbmVNaW5Db2x1bW4oXG5cdFx0XHR0aGlzLm1vZGVsLFxuXHRcdFx0dmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlcixcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeFxuXHRcdCk7XG5cdFx0Y29uc3QgY29sdW1uID0gbGluZS5nZXRNb2RlbENvbHVtbk9mVmlld1Bvc2l0aW9uKFxuXHRcdFx0dmlld0xpbmVJbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4LFxuXHRcdFx0bWluVmlld0NvbHVtblxuXHRcdCk7XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbih2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbEVuZFBvc2l0aW9uT2ZWaWV3TGluZSh2aWV3TGluZUluZm86IFZpZXdMaW5lSW5mbyk6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBsaW5lID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1t2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV07XG5cdFx0Y29uc3QgbWF4Vmlld0NvbHVtbiA9IGxpbmUuZ2V0Vmlld0xpbmVNYXhDb2x1bW4oXG5cdFx0XHR0aGlzLm1vZGVsLFxuXHRcdFx0dmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlcixcblx0XHRcdHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeFxuXHRcdCk7XG5cdFx0Y29uc3QgY29sdW1uID0gbGluZS5nZXRNb2RlbENvbHVtbk9mVmlld1Bvc2l0aW9uKFxuXHRcdFx0dmlld0xpbmVJbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4LFxuXHRcdFx0bWF4Vmlld0NvbHVtblxuXHRcdCk7XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbih2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3TGluZUluZm9zR3JvdXBlZEJ5TW9kZWxSYW5nZXModmlld1N0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB2aWV3RW5kTGluZU51bWJlcjogbnVtYmVyKTogVmlld0xpbmVJbmZvR3JvdXBlZEJ5TW9kZWxSYW5nZVtdIHtcblx0XHRjb25zdCBzdGFydFZpZXdMaW5lID0gdGhpcy5nZXRWaWV3TGluZUluZm8odmlld1N0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgZW5kVmlld0xpbmUgPSB0aGlzLmdldFZpZXdMaW5lSW5mbyh2aWV3RW5kTGluZU51bWJlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgQXJyYXk8Vmlld0xpbmVJbmZvR3JvdXBlZEJ5TW9kZWxSYW5nZT4oKTtcblx0XHRsZXQgbGFzdFZpc2libGVNb2RlbFBvczogUG9zaXRpb24gfCBudWxsID0gdGhpcy5nZXRNb2RlbFN0YXJ0UG9zaXRpb25PZlZpZXdMaW5lKHN0YXJ0Vmlld0xpbmUpO1xuXHRcdGxldCB2aWV3TGluZXMgPSBuZXcgQXJyYXk8Vmlld0xpbmVJbmZvPigpO1xuXG5cdFx0Zm9yIChsZXQgY3VyTW9kZWxMaW5lID0gc3RhcnRWaWV3TGluZS5tb2RlbExpbmVOdW1iZXI7IGN1ck1vZGVsTGluZSA8PSBlbmRWaWV3TGluZS5tb2RlbExpbmVOdW1iZXI7IGN1ck1vZGVsTGluZSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tjdXJNb2RlbExpbmUgLSAxXTtcblxuXHRcdFx0aWYgKGxpbmUuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPVxuXHRcdFx0XHRcdGN1ck1vZGVsTGluZSA9PT0gc3RhcnRWaWV3TGluZS5tb2RlbExpbmVOdW1iZXJcblx0XHRcdFx0XHRcdD8gc3RhcnRWaWV3TGluZS5tb2RlbExpbmVXcmFwcGVkTGluZUlkeFxuXHRcdFx0XHRcdFx0OiAwO1xuXG5cdFx0XHRcdGNvbnN0IGVuZE9mZnNldCA9XG5cdFx0XHRcdFx0Y3VyTW9kZWxMaW5lID09PSBlbmRWaWV3TGluZS5tb2RlbExpbmVOdW1iZXJcblx0XHRcdFx0XHRcdD8gZW5kVmlld0xpbmUubW9kZWxMaW5lV3JhcHBlZExpbmVJZHggKyAxXG5cdFx0XHRcdFx0XHQ6IGxpbmUuZ2V0Vmlld0xpbmVDb3VudCgpO1xuXG5cdFx0XHRcdGZvciAobGV0IGkgPSBzdGFydE9mZnNldDsgaSA8IGVuZE9mZnNldDsgaSsrKSB7XG5cdFx0XHRcdFx0dmlld0xpbmVzLnB1c2gobmV3IFZpZXdMaW5lSW5mbyhjdXJNb2RlbExpbmUsIGkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWxpbmUuaXNWaXNpYmxlKCkgJiYgbGFzdFZpc2libGVNb2RlbFBvcykge1xuXHRcdFx0XHRjb25zdCBsYXN0VmlzaWJsZU1vZGVsUG9zMiA9IG5ldyBQb3NpdGlvbihjdXJNb2RlbExpbmUgLSAxLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4oY3VyTW9kZWxMaW5lIC0gMSkgKyAxKTtcblxuXHRcdFx0XHRjb25zdCBtb2RlbFJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhsYXN0VmlzaWJsZU1vZGVsUG9zLCBsYXN0VmlzaWJsZU1vZGVsUG9zMik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5ldyBWaWV3TGluZUluZm9Hcm91cGVkQnlNb2RlbFJhbmdlKG1vZGVsUmFuZ2UsIHZpZXdMaW5lcykpO1xuXHRcdFx0XHR2aWV3TGluZXMgPSBbXTtcblxuXHRcdFx0XHRsYXN0VmlzaWJsZU1vZGVsUG9zID0gbnVsbDtcblx0XHRcdH0gZWxzZSBpZiAobGluZS5pc1Zpc2libGUoKSAmJiAhbGFzdFZpc2libGVNb2RlbFBvcykge1xuXHRcdFx0XHRsYXN0VmlzaWJsZU1vZGVsUG9zID0gbmV3IFBvc2l0aW9uKGN1ck1vZGVsTGluZSwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RWaXNpYmxlTW9kZWxQb3MpIHtcblx0XHRcdGNvbnN0IG1vZGVsUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGxhc3RWaXNpYmxlTW9kZWxQb3MsIHRoaXMuZ2V0TW9kZWxFbmRQb3NpdGlvbk9mVmlld0xpbmUoZW5kVmlld0xpbmUpKTtcblx0XHRcdHJlc3VsdC5wdXNoKG5ldyBWaWV3TGluZUluZm9Hcm91cGVkQnlNb2RlbFJhbmdlKG1vZGVsUmFuZ2UsIHZpZXdMaW5lcykpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0cHVibGljIGdldFZpZXdMaW5lc0JyYWNrZXRHdWlkZXModmlld1N0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB2aWV3RW5kTGluZU51bWJlcjogbnVtYmVyLCBhY3RpdmVWaWV3UG9zaXRpb246IElQb3NpdGlvbiB8IG51bGwsIG9wdGlvbnM6IEJyYWNrZXRHdWlkZU9wdGlvbnMpOiBJbmRlbnRHdWlkZVtdW10ge1xuXHRcdGNvbnN0IG1vZGVsQWN0aXZlUG9zaXRpb24gPSBhY3RpdmVWaWV3UG9zaXRpb24gPyB0aGlzLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oYWN0aXZlVmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsIGFjdGl2ZVZpZXdQb3NpdGlvbi5jb2x1bW4pIDogbnVsbDtcblx0XHRjb25zdCByZXN1bHRQZXJWaWV3TGluZTogSW5kZW50R3VpZGVbXVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ2V0Vmlld0xpbmVJbmZvc0dyb3VwZWRCeU1vZGVsUmFuZ2VzKHZpZXdTdGFydExpbmVOdW1iZXIsIHZpZXdFbmRMaW5lTnVtYmVyKSkge1xuXHRcdFx0Y29uc3QgbW9kZWxSYW5nZVN0YXJ0TGluZU51bWJlciA9IGdyb3VwLm1vZGVsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHRjb25zdCBicmFja2V0R3VpZGVzUGVyTW9kZWxMaW5lID0gdGhpcy5tb2RlbC5ndWlkZXMuZ2V0TGluZXNCcmFja2V0R3VpZGVzKFxuXHRcdFx0XHRtb2RlbFJhbmdlU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRncm91cC5tb2RlbFJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdG1vZGVsQWN0aXZlUG9zaXRpb24sXG5cdFx0XHRcdG9wdGlvbnNcblx0XHRcdCk7XG5cblx0XHRcdGZvciAoY29uc3Qgdmlld0xpbmVJbmZvIG9mIGdyb3VwLnZpZXdMaW5lcykge1xuXG5cdFx0XHRcdGNvbnN0IGJyYWNrZXRHdWlkZXMgPSBicmFja2V0R3VpZGVzUGVyTW9kZWxMaW5lW3ZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIgLSBtb2RlbFJhbmdlU3RhcnRMaW5lTnVtYmVyXTtcblxuXHRcdFx0XHQvLyB2aXNpYmxlQ29sdW1ucyBzdGF5IGFzIHRoZXkgYXJlICh0aGlzIGlzIGEgYnVnIGFuZCBuZWVkcyB0byBiZSBmaXhlZCwgYnV0IGl0IGlzIG5vdCBhIHJlZ3Jlc3Npb24pXG5cdFx0XHRcdC8vIG1vZGVsLWNvbHVtbnMgbXVzdCBiZSBjb252ZXJ0ZWQgdG8gdmlldy1tb2RlbCBjb2x1bW5zLlxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBicmFja2V0R3VpZGVzLm1hcChnID0+IHtcblx0XHRcdFx0XHRpZiAoZy5mb3JXcmFwcGVkTGluZXNBZnRlckNvbHVtbiAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHAgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW3ZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRWaWV3UG9zaXRpb25PZk1vZGVsUG9zaXRpb24oMCwgZy5mb3JXcmFwcGVkTGluZXNBZnRlckNvbHVtbik7XG5cdFx0XHRcdFx0XHRpZiAocC5saW5lTnVtYmVyID49IHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChnLmZvcldyYXBwZWRMaW5lc0JlZm9yZU9yQXRDb2x1bW4gIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1t2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKDAsIGcuZm9yV3JhcHBlZExpbmVzQmVmb3JlT3JBdENvbHVtbik7XG5cdFx0XHRcdFx0XHRpZiAocC5saW5lTnVtYmVyIDwgdmlld0xpbmVJbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFnLmhvcml6b250YWxMaW5lKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgY29sdW1uID0gLTE7XG5cdFx0XHRcdFx0aWYgKGcuY29sdW1uICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcCA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbdmlld0xpbmVJbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBnLmNvbHVtbik7XG5cdFx0XHRcdFx0XHRpZiAocC5saW5lTnVtYmVyID09PSB2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgpIHtcblx0XHRcdFx0XHRcdFx0Y29sdW1uID0gcC5jb2x1bW47XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHAubGluZU51bWJlciA8IHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCkge1xuXHRcdFx0XHRcdFx0XHRjb2x1bW4gPSB0aGlzLmdldE1pbkNvbHVtbk9mVmlld0xpbmUodmlld0xpbmVJbmZvKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocC5saW5lTnVtYmVyID4gdmlld0xpbmVJbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdGhpcy5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHZpZXdMaW5lSW5mby5tb2RlbExpbmVOdW1iZXIsIGcuaG9yaXpvbnRhbExpbmUuZW5kQ29sdW1uKTtcblx0XHRcdFx0XHRjb25zdCBwID0gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1t2aWV3TGluZUluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKDAsIGcuaG9yaXpvbnRhbExpbmUuZW5kQ29sdW1uKTtcblx0XHRcdFx0XHRpZiAocC5saW5lTnVtYmVyID09PSB2aWV3TGluZUluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgSW5kZW50R3VpZGUoZy52aXNpYmxlQ29sdW1uLCBjb2x1bW4sIGcuY2xhc3NOYW1lLFxuXHRcdFx0XHRcdFx0XHRuZXcgSW5kZW50R3VpZGVIb3Jpem9udGFsTGluZShnLmhvcml6b250YWxMaW5lLnRvcCxcblx0XHRcdFx0XHRcdFx0XHR2aWV3UG9zaXRpb24uY29sdW1uKSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHAubGluZU51bWJlciA8IHZpZXdMaW5lSW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGcudmlzaWJsZUNvbHVtbiAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0Ly8gRG9uJ3QgcmVwZWF0IGhvcml6b250YWwgbGluZXMgdGhhdCB1c2UgdmlzaWJsZUNvbHVtbiBmb3IgdW5yZWxhdGVkIGxpbmVzLlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBJbmRlbnRHdWlkZShnLnZpc2libGVDb2x1bW4sIGNvbHVtbiwgZy5jbGFzc05hbWUsXG5cdFx0XHRcdFx0XHRcdG5ldyBJbmRlbnRHdWlkZUhvcml6b250YWxMaW5lKGcuaG9yaXpvbnRhbExpbmUudG9wLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZ2V0TWF4Q29sdW1uT2ZWaWV3TGluZSh2aWV3TGluZUluZm8pXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVzdWx0UGVyVmlld0xpbmUucHVzaChyZXN1bHQuZmlsdGVyKChyKTogciBpcyBJbmRlbnRHdWlkZSA9PiAhIXIpKTtcblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHRQZXJWaWV3TGluZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZXNJbmRlbnRHdWlkZXModmlld1N0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB2aWV3RW5kTGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyW10ge1xuXHRcdC8vIFRPRE86IFVzZSB0aGUgc2FtZSBjb2RlIGFzIGluIGBnZXRWaWV3TGluZXNCcmFja2V0R3VpZGVzYC5cblx0XHQvLyBGdXR1cmUgVE9ETzogTWVyZ2Ugd2l0aCBgZ2V0Vmlld0xpbmVzQnJhY2tldEd1aWRlc2AuXG5cdFx0Ly8gSG93ZXZlciwgdGhpcyByZXF1aXJlcyBtb3JlIHJlZmFjdG9yaW5nIG9mIGluZGVudCBndWlkZXMuXG5cdFx0dmlld1N0YXJ0TGluZU51bWJlciA9IHRoaXMuX3RvVmFsaWRWaWV3TGluZU51bWJlcih2aWV3U3RhcnRMaW5lTnVtYmVyKTtcblx0XHR2aWV3RW5kTGluZU51bWJlciA9IHRoaXMuX3RvVmFsaWRWaWV3TGluZU51bWJlcih2aWV3RW5kTGluZU51bWJlcik7XG5cblx0XHRjb25zdCBtb2RlbFN0YXJ0ID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdTdGFydExpbmVOdW1iZXIsIHRoaXMuZ2V0Vmlld0xpbmVNaW5Db2x1bW4odmlld1N0YXJ0TGluZU51bWJlcikpO1xuXHRcdGNvbnN0IG1vZGVsRW5kID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdFbmRMaW5lTnVtYmVyLCB0aGlzLmdldFZpZXdMaW5lTWF4Q29sdW1uKHZpZXdFbmRMaW5lTnVtYmVyKSk7XG5cblx0XHRsZXQgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdFJlcGVhdENvdW50OiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdFJlcGVhdE9wdGlvbjogSW5kZW50R3VpZGVSZXBlYXRPcHRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGVsU3RhcnRMaW5lSW5kZXggPSBtb2RlbFN0YXJ0LmxpbmVOdW1iZXIgLSAxO1xuXHRcdGNvbnN0IG1vZGVsRW5kTGluZUluZGV4ID0gbW9kZWxFbmQubGluZU51bWJlciAtIDE7XG5cblx0XHRsZXQgcmVxU3RhcnQ6IFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgbW9kZWxMaW5lSW5kZXggPSBtb2RlbFN0YXJ0TGluZUluZGV4OyBtb2RlbExpbmVJbmRleCA8PSBtb2RlbEVuZExpbmVJbmRleDsgbW9kZWxMaW5lSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbW9kZWxMaW5lSW5kZXhdO1xuXHRcdFx0aWYgKGxpbmUuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0Y29uc3Qgdmlld0xpbmVTdGFydEluZGV4ID0gbGluZS5nZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbigwLCBtb2RlbExpbmVJbmRleCA9PT0gbW9kZWxTdGFydExpbmVJbmRleCA/IG1vZGVsU3RhcnQuY29sdW1uIDogMSk7XG5cdFx0XHRcdGNvbnN0IHZpZXdMaW5lRW5kSW5kZXggPSBsaW5lLmdldFZpZXdMaW5lTnVtYmVyT2ZNb2RlbFBvc2l0aW9uKDAsIHRoaXMubW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbExpbmVJbmRleCArIDEpKTtcblx0XHRcdFx0Y29uc3QgY291bnQgPSB2aWV3TGluZUVuZEluZGV4IC0gdmlld0xpbmVTdGFydEluZGV4ICsgMTtcblx0XHRcdFx0bGV0IG9wdGlvbiA9IEluZGVudEd1aWRlUmVwZWF0T3B0aW9uLkJsb2NrTm9uZTtcblx0XHRcdFx0aWYgKGNvdW50ID4gMSAmJiBsaW5lLmdldFZpZXdMaW5lTWluQ29sdW1uKHRoaXMubW9kZWwsIG1vZGVsTGluZUluZGV4ICsgMSwgdmlld0xpbmVFbmRJbmRleCkgPT09IDEpIHtcblx0XHRcdFx0XHQvLyB3cmFwcGVkIGxpbmVzIHNob3VsZCBibG9jayBpbmRlbnQgZ3VpZGVzXG5cdFx0XHRcdFx0b3B0aW9uID0gKHZpZXdMaW5lU3RhcnRJbmRleCA9PT0gMCA/IEluZGVudEd1aWRlUmVwZWF0T3B0aW9uLkJsb2NrU3Vic2VxdWVudCA6IEluZGVudEd1aWRlUmVwZWF0T3B0aW9uLkJsb2NrQWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHRSZXBlYXRDb3VudC5wdXNoKGNvdW50KTtcblx0XHRcdFx0cmVzdWx0UmVwZWF0T3B0aW9uLnB1c2gob3B0aW9uKTtcblx0XHRcdFx0Ly8gbWVyZ2UgaW50byBwcmV2aW91cyByZXF1ZXN0XG5cdFx0XHRcdGlmIChyZXFTdGFydCA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdHJlcVN0YXJ0ID0gbmV3IFBvc2l0aW9uKG1vZGVsTGluZUluZGV4ICsgMSwgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGhpdCBpbnZpc2libGUgbGluZSA9PiBmbHVzaCByZXF1ZXN0XG5cdFx0XHRcdGlmIChyZXFTdGFydCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IHJlc3VsdC5jb25jYXQodGhpcy5tb2RlbC5ndWlkZXMuZ2V0TGluZXNJbmRlbnRHdWlkZXMocmVxU3RhcnQubGluZU51bWJlciwgbW9kZWxMaW5lSW5kZXgpKTtcblx0XHRcdFx0XHRyZXFTdGFydCA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmVxU3RhcnQgIT09IG51bGwpIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5jb25jYXQodGhpcy5tb2RlbC5ndWlkZXMuZ2V0TGluZXNJbmRlbnRHdWlkZXMocmVxU3RhcnQubGluZU51bWJlciwgbW9kZWxFbmQubGluZU51bWJlcikpO1xuXHRcdFx0cmVxU3RhcnQgPSBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdMaW5lQ291bnQgPSB2aWV3RW5kTGluZU51bWJlciAtIHZpZXdTdGFydExpbmVOdW1iZXIgKyAxO1xuXHRcdGNvbnN0IHZpZXdJbmRlbnRzID0gbmV3IEFycmF5PG51bWJlcj4odmlld0xpbmVDb3VudCk7XG5cdFx0bGV0IGN1cnJJbmRleCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJlc3VsdC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0bGV0IHZhbHVlID0gcmVzdWx0W2ldO1xuXHRcdFx0Y29uc3QgY291bnQgPSBNYXRoLm1pbih2aWV3TGluZUNvdW50IC0gY3VyckluZGV4LCByZXN1bHRSZXBlYXRDb3VudFtpXSk7XG5cdFx0XHRjb25zdCBvcHRpb24gPSByZXN1bHRSZXBlYXRPcHRpb25baV07XG5cdFx0XHRsZXQgYmxvY2tBdEluZGV4OiBudW1iZXI7XG5cdFx0XHRpZiAob3B0aW9uID09PSBJbmRlbnRHdWlkZVJlcGVhdE9wdGlvbi5CbG9ja0FsbCkge1xuXHRcdFx0XHRibG9ja0F0SW5kZXggPSAwO1xuXHRcdFx0fSBlbHNlIGlmIChvcHRpb24gPT09IEluZGVudEd1aWRlUmVwZWF0T3B0aW9uLkJsb2NrU3Vic2VxdWVudCkge1xuXHRcdFx0XHRibG9ja0F0SW5kZXggPSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YmxvY2tBdEluZGV4ID0gY291bnQ7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IGNvdW50OyBqKyspIHtcblx0XHRcdFx0aWYgKGogPT09IGJsb2NrQXRJbmRleCkge1xuXHRcdFx0XHRcdHZhbHVlID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0XHR2aWV3SW5kZW50c1tjdXJySW5kZXgrK10gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHZpZXdJbmRlbnRzO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lQ29udGVudCh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRWaWV3TGluZUluZm8odmlld0xpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2luZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld0xpbmVDb250ZW50KHRoaXMubW9kZWwsIGluZm8ubW9kZWxMaW5lTnVtYmVyLCBpbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZUxlbmd0aCh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRWaWV3TGluZUluZm8odmlld0xpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2luZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld0xpbmVMZW5ndGgodGhpcy5tb2RlbCwgaW5mby5tb2RlbExpbmVOdW1iZXIsIGluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lTWluQ29sdW1uKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldFZpZXdMaW5lSW5mbyh2aWV3TGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRWaWV3TGluZU1pbkNvbHVtbih0aGlzLm1vZGVsLCBpbmZvLm1vZGVsTGluZU51bWJlciwgaW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVNYXhDb2x1bW4odmlld0xpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuZ2V0Vmlld0xpbmVJbmZvKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldFZpZXdMaW5lTWF4Q29sdW1uKHRoaXMubW9kZWwsIGluZm8ubW9kZWxMaW5lTnVtYmVyLCBpbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZURhdGEodmlld0xpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdMaW5lRGF0YSB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuZ2V0Vmlld0xpbmVJbmZvKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBiYXNlVmlld0xpbmVOdW1iZXIgPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0UHJlZml4U3VtKGluZm8ubW9kZWxMaW5lTnVtYmVyIC0gMSkgKyAxO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2luZm8ubW9kZWxMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld0xpbmVEYXRhKHRoaXMubW9kZWwsIGluZm8ubW9kZWxMaW5lTnVtYmVyLCBpbmZvLm1vZGVsTGluZVdyYXBwZWRMaW5lSWR4LCBiYXNlVmlld0xpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lc0RhdGEodmlld1N0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB2aWV3RW5kTGluZU51bWJlcjogbnVtYmVyLCBuZWVkZWQ6IGJvb2xlYW5bXSk6IFZpZXdMaW5lRGF0YVtdIHtcblxuXHRcdHZpZXdTdGFydExpbmVOdW1iZXIgPSB0aGlzLl90b1ZhbGlkVmlld0xpbmVOdW1iZXIodmlld1N0YXJ0TGluZU51bWJlcik7XG5cdFx0dmlld0VuZExpbmVOdW1iZXIgPSB0aGlzLl90b1ZhbGlkVmlld0xpbmVOdW1iZXIodmlld0VuZExpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLnByb2plY3RlZE1vZGVsTGluZUxpbmVDb3VudHMuZ2V0SW5kZXhPZih2aWV3U3RhcnRMaW5lTnVtYmVyIC0gMSk7XG5cdFx0bGV0IHZpZXdMaW5lTnVtYmVyID0gdmlld1N0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBzdGFydE1vZGVsTGluZUluZGV4ID0gc3RhcnQuaW5kZXg7XG5cdFx0Y29uc3Qgc3RhcnRSZW1haW5kZXIgPSBzdGFydC5yZW1haW5kZXI7XG5cblx0XHRjb25zdCByZXN1bHQ6IFZpZXdMaW5lRGF0YVtdID0gW107XG5cdFx0Zm9yIChsZXQgbW9kZWxMaW5lSW5kZXggPSBzdGFydE1vZGVsTGluZUluZGV4LCBsZW4gPSB0aGlzLm1vZGVsLmdldExpbmVDb3VudCgpOyBtb2RlbExpbmVJbmRleCA8IGxlbjsgbW9kZWxMaW5lSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbW9kZWxMaW5lSW5kZXhdO1xuXHRcdFx0aWYgKCFsaW5lLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZnJvbVZpZXdMaW5lSW5kZXggPSAobW9kZWxMaW5lSW5kZXggPT09IHN0YXJ0TW9kZWxMaW5lSW5kZXggPyBzdGFydFJlbWFpbmRlciA6IDApO1xuXHRcdFx0bGV0IHJlbWFpbmluZ1ZpZXdMaW5lQ291bnQgPSBsaW5lLmdldFZpZXdMaW5lQ291bnQoKSAtIGZyb21WaWV3TGluZUluZGV4O1xuXG5cdFx0XHRsZXQgbGFzdExpbmUgPSBmYWxzZTtcblx0XHRcdGlmICh2aWV3TGluZU51bWJlciArIHJlbWFpbmluZ1ZpZXdMaW5lQ291bnQgPiB2aWV3RW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRsYXN0TGluZSA9IHRydWU7XG5cdFx0XHRcdHJlbWFpbmluZ1ZpZXdMaW5lQ291bnQgPSB2aWV3RW5kTGluZU51bWJlciAtIHZpZXdMaW5lTnVtYmVyICsgMTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJhc2VWaWV3TGluZU51bWJlciA9IHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRQcmVmaXhTdW0obW9kZWxMaW5lSW5kZXgpICsgMTtcblx0XHRcdGxpbmUuZ2V0Vmlld0xpbmVzRGF0YSh0aGlzLm1vZGVsLCBtb2RlbExpbmVJbmRleCArIDEsIGZyb21WaWV3TGluZUluZGV4LCByZW1haW5pbmdWaWV3TGluZUNvdW50LCBiYXNlVmlld0xpbmVOdW1iZXIsIHZpZXdMaW5lTnVtYmVyIC0gdmlld1N0YXJ0TGluZU51bWJlciwgbmVlZGVkLCByZXN1bHQpO1xuXG5cdFx0XHR2aWV3TGluZU51bWJlciArPSByZW1haW5pbmdWaWV3TGluZUNvdW50O1xuXG5cdFx0XHRpZiAobGFzdExpbmUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZVZpZXdQb3NpdGlvbih2aWV3TGluZU51bWJlcjogbnVtYmVyLCB2aWV3Q29sdW1uOiBudW1iZXIsIGV4cGVjdGVkTW9kZWxQb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XG5cdFx0dmlld0xpbmVOdW1iZXIgPSB0aGlzLl90b1ZhbGlkVmlld0xpbmVOdW1iZXIodmlld0xpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgciA9IHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRJbmRleE9mKHZpZXdMaW5lTnVtYmVyIC0gMSk7XG5cdFx0Y29uc3QgbGluZUluZGV4ID0gci5pbmRleDtcblx0XHRjb25zdCByZW1haW5kZXIgPSByLnJlbWFpbmRlcjtcblxuXHRcdGNvbnN0IGxpbmUgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF07XG5cblx0XHRjb25zdCBtaW5Db2x1bW4gPSBsaW5lLmdldFZpZXdMaW5lTWluQ29sdW1uKHRoaXMubW9kZWwsIGxpbmVJbmRleCArIDEsIHJlbWFpbmRlcik7XG5cdFx0Y29uc3QgbWF4Q29sdW1uID0gbGluZS5nZXRWaWV3TGluZU1heENvbHVtbih0aGlzLm1vZGVsLCBsaW5lSW5kZXggKyAxLCByZW1haW5kZXIpO1xuXHRcdGlmICh2aWV3Q29sdW1uIDwgbWluQ29sdW1uKSB7XG5cdFx0XHR2aWV3Q29sdW1uID0gbWluQ29sdW1uO1xuXHRcdH1cblx0XHRpZiAodmlld0NvbHVtbiA+IG1heENvbHVtbikge1xuXHRcdFx0dmlld0NvbHVtbiA9IG1heENvbHVtbjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wdXRlZE1vZGVsQ29sdW1uID0gbGluZS5nZXRNb2RlbENvbHVtbk9mVmlld1Bvc2l0aW9uKHJlbWFpbmRlciwgdmlld0NvbHVtbik7XG5cdFx0Y29uc3QgY29tcHV0ZWRNb2RlbFBvc2l0aW9uID0gdGhpcy5tb2RlbC52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbihsaW5lSW5kZXggKyAxLCBjb21wdXRlZE1vZGVsQ29sdW1uKSk7XG5cblx0XHRpZiAoY29tcHV0ZWRNb2RlbFBvc2l0aW9uLmVxdWFscyhleHBlY3RlZE1vZGVsUG9zaXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHZpZXdMaW5lTnVtYmVyLCB2aWV3Q29sdW1uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKGV4cGVjdGVkTW9kZWxQb3NpdGlvbi5saW5lTnVtYmVyLCBleHBlY3RlZE1vZGVsUG9zaXRpb24uY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZVZpZXdSYW5nZSh2aWV3UmFuZ2U6IFJhbmdlLCBleHBlY3RlZE1vZGVsUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHZhbGlkVmlld1N0YXJ0ID0gdGhpcy52YWxpZGF0ZVZpZXdQb3NpdGlvbih2aWV3UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB2aWV3UmFuZ2Uuc3RhcnRDb2x1bW4sIGV4cGVjdGVkTW9kZWxSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdGNvbnN0IHZhbGlkVmlld0VuZCA9IHRoaXMudmFsaWRhdGVWaWV3UG9zaXRpb24odmlld1JhbmdlLmVuZExpbmVOdW1iZXIsIHZpZXdSYW5nZS5lbmRDb2x1bW4sIGV4cGVjdGVkTW9kZWxSYW5nZS5nZXRFbmRQb3NpdGlvbigpKTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHZhbGlkVmlld1N0YXJ0LmxpbmVOdW1iZXIsIHZhbGlkVmlld1N0YXJ0LmNvbHVtbiwgdmFsaWRWaWV3RW5kLmxpbmVOdW1iZXIsIHZhbGlkVmlld0VuZC5jb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIGNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24odmlld0xpbmVOdW1iZXI6IG51bWJlciwgdmlld0NvbHVtbjogbnVtYmVyKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldFZpZXdMaW5lSW5mbyh2aWV3TGluZU51bWJlcik7XG5cblx0XHRjb25zdCBpbnB1dENvbHVtbiA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaW5mby5tb2RlbExpbmVOdW1iZXIgLSAxXS5nZXRNb2RlbENvbHVtbk9mVmlld1Bvc2l0aW9uKGluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgsIHZpZXdDb2x1bW4pO1xuXHRcdC8vIGNvbnNvbGUubG9nKCdvdXQgLT4gaW4gJyArIHZpZXdMaW5lTnVtYmVyICsgJywnICsgdmlld0NvbHVtbiArICcgPT09PiAnICsgKGxpbmVJbmRleCsxKSArICcsJyArIGlucHV0Q29sdW1uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbihpbmZvLm1vZGVsTGluZU51bWJlciwgaW5wdXRDb2x1bW4pKTtcblx0fVxuXG5cdHB1YmxpYyBjb252ZXJ0Vmlld1JhbmdlVG9Nb2RlbFJhbmdlKHZpZXdSYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24odmlld1JhbmdlLnN0YXJ0TGluZU51bWJlciwgdmlld1JhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBlbmQgPSB0aGlzLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24odmlld1JhbmdlLmVuZExpbmVOdW1iZXIsIHZpZXdSYW5nZS5lbmRDb2x1bW4pO1xuXHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQubGluZU51bWJlciwgc3RhcnQuY29sdW1uLCBlbmQubGluZU51bWJlciwgZW5kLmNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihfbW9kZWxMaW5lTnVtYmVyOiBudW1iZXIsIF9tb2RlbENvbHVtbjogbnVtYmVyLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSA9IFBvc2l0aW9uQWZmaW5pdHkuTm9uZSwgYWxsb3daZXJvTGluZU51bWJlcjogYm9vbGVhbiA9IGZhbHNlLCBiZWxvd0hpZGRlblJhbmdlczogYm9vbGVhbiA9IGZhbHNlKTogUG9zaXRpb24ge1xuXG5cdFx0Y29uc3QgdmFsaWRQb3NpdGlvbiA9IHRoaXMubW9kZWwudmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oX21vZGVsTGluZU51bWJlciwgX21vZGVsQ29sdW1uKSk7XG5cdFx0Y29uc3QgaW5wdXRMaW5lTnVtYmVyID0gdmFsaWRQb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGlucHV0Q29sdW1uID0gdmFsaWRQb3NpdGlvbi5jb2x1bW47XG5cblx0XHRsZXQgbGluZUluZGV4ID0gaW5wdXRMaW5lTnVtYmVyIC0gMSwgbGluZUluZGV4Q2hhbmdlZCA9IGZhbHNlO1xuXHRcdGlmIChiZWxvd0hpZGRlblJhbmdlcykge1xuXHRcdFx0d2hpbGUgKGxpbmVJbmRleCA8IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnMubGVuZ3RoICYmICF0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0bGluZUluZGV4Kys7XG5cdFx0XHRcdGxpbmVJbmRleENoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aGlsZSAobGluZUluZGV4ID4gMCAmJiAhdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdGxpbmVJbmRleC0tO1xuXHRcdFx0XHRsaW5lSW5kZXhDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGxpbmVJbmRleCA9PT0gMCAmJiAhdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHQvLyBDb3VsZCBub3QgcmVhY2ggYSByZWFsIGxpbmVcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdpbiAtPiBvdXQgJyArIGlucHV0TGluZU51bWJlciArICcsJyArIGlucHV0Q29sdW1uICsgJyA9PT0+ICcgKyAxICsgJywnICsgMSk7XG5cdFx0XHQvLyBUT0RPQGFsZXhkaW1hQGhlZGlldCB0aGlzIGlzbid0IHNvbyBwcmV0dHlcblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24oYWxsb3daZXJvTGluZU51bWJlciA/IDAgOiAxLCAxKTtcblx0XHR9XG5cdFx0Y29uc3QgZGVsdGFMaW5lTnVtYmVyID0gMSArIHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRQcmVmaXhTdW0obGluZUluZGV4KTtcblxuXHRcdGxldCByOiBQb3NpdGlvbjtcblx0XHRpZiAobGluZUluZGV4Q2hhbmdlZCkge1xuXHRcdFx0aWYgKGJlbG93SGlkZGVuUmFuZ2VzKSB7XG5cdFx0XHRcdHIgPSB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKGRlbHRhTGluZU51bWJlciwgMSwgYWZmaW5pdHkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ciA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5nZXRWaWV3UG9zaXRpb25PZk1vZGVsUG9zaXRpb24oZGVsdGFMaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUluZGV4ICsgMSksIGFmZmluaXR5KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ciA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbaW5wdXRMaW5lTnVtYmVyIC0gMV0uZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKGRlbHRhTGluZU51bWJlciwgaW5wdXRDb2x1bW4sIGFmZmluaXR5KTtcblx0XHR9XG5cblx0XHQvLyBjb25zb2xlLmxvZygnaW4gLT4gb3V0ICcgKyBpbnB1dExpbmVOdW1iZXIgKyAnLCcgKyBpbnB1dENvbHVtbiArICcgPT09PiAnICsgci5saW5lTnVtYmVyICsgJywnICsgcik7XG5cdFx0cmV0dXJuIHI7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIGFmZmluaXR5IFRoZSBhZmZpbml0eSBpbiBjYXNlIG9mIGFuIGVtcHR5IHJhbmdlLiBIYXMgbm8gZWZmZWN0IGZvciBub24tZW1wdHkgcmFuZ2VzLlxuXHQqL1xuXHRwdWJsaWMgY29udmVydE1vZGVsUmFuZ2VUb1ZpZXdSYW5nZShtb2RlbFJhbmdlOiBSYW5nZSwgYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkgPSBQb3NpdGlvbkFmZmluaXR5LkxlZnQpOiBSYW5nZSB7XG5cdFx0aWYgKG1vZGVsUmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHRoaXMuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgbW9kZWxSYW5nZS5zdGFydENvbHVtbiwgYWZmaW5pdHkpO1xuXHRcdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMoc3RhcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHRoaXMuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgbW9kZWxSYW5nZS5zdGFydENvbHVtbiwgUG9zaXRpb25BZmZpbml0eS5SaWdodCk7XG5cdFx0XHRjb25zdCBlbmQgPSB0aGlzLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obW9kZWxSYW5nZS5lbmRMaW5lTnVtYmVyLCBtb2RlbFJhbmdlLmVuZENvbHVtbiwgUG9zaXRpb25BZmZpbml0eS5MZWZ0KTtcblx0XHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQubGluZU51bWJlciwgc3RhcnQuY29sdW1uLCBlbmQubGluZU51bWJlciwgZW5kLmNvbHVtbik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lTnVtYmVyT2ZNb2RlbFBvc2l0aW9uKG1vZGVsTGluZU51bWJlcjogbnVtYmVyLCBtb2RlbENvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgbGluZUluZGV4ID0gbW9kZWxMaW5lTnVtYmVyIC0gMTtcblx0XHRpZiAodGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHQvLyB0aGlzIG1vZGVsIGxpbmUgaXMgdmlzaWJsZVxuXHRcdFx0Y29uc3QgZGVsdGFMaW5lTnVtYmVyID0gMSArIHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRQcmVmaXhTdW0obGluZUluZGV4KTtcblx0XHRcdHJldHVybiB0aGlzLm1vZGVsTGluZVByb2plY3Rpb25zW2xpbmVJbmRleF0uZ2V0Vmlld0xpbmVOdW1iZXJPZk1vZGVsUG9zaXRpb24oZGVsdGFMaW5lTnVtYmVyLCBtb2RlbENvbHVtbik7XG5cdFx0fVxuXG5cdFx0Ly8gdGhpcyBtb2RlbCBsaW5lIGlzIG5vdCB2aXNpYmxlXG5cdFx0d2hpbGUgKGxpbmVJbmRleCA+IDAgJiYgIXRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5pc1Zpc2libGUoKSkge1xuXHRcdFx0bGluZUluZGV4LS07XG5cdFx0fVxuXHRcdGlmIChsaW5lSW5kZXggPT09IDAgJiYgIXRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbGluZUluZGV4XS5pc1Zpc2libGUoKSkge1xuXHRcdFx0Ly8gQ291bGQgbm90IHJlYWNoIGEgcmVhbCBsaW5lXG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0Y29uc3QgZGVsdGFMaW5lTnVtYmVyID0gMSArIHRoaXMucHJvamVjdGVkTW9kZWxMaW5lTGluZUNvdW50cy5nZXRQcmVmaXhTdW0obGluZUluZGV4KTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tsaW5lSW5kZXhdLmdldFZpZXdMaW5lTnVtYmVyT2ZNb2RlbFBvc2l0aW9uKGRlbHRhTGluZU51bWJlciwgdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVJbmRleCArIDEpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2U6IFJhbmdlLCBvd25lcklkOiBudW1iZXIsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4sIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiwgb25seU1pbmltYXBEZWNvcmF0aW9uczogYm9vbGVhbiwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCBtb2RlbFN0YXJ0ID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdGNvbnN0IG1vZGVsRW5kID0gdGhpcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cblx0XHRpZiAobW9kZWxFbmQubGluZU51bWJlciAtIG1vZGVsU3RhcnQubGluZU51bWJlciA8PSByYW5nZS5lbmRMaW5lTnVtYmVyIC0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBtb3N0IGxpa2VseSB0aGVyZSBhcmUgbm8gaGlkZGVuIGxpbmVzID0+IGZhc3QgcGF0aFxuXHRcdFx0Ly8gZmV0Y2ggZGVjb3JhdGlvbnMgZnJvbSBjb2x1bW4gMSB0byBjb3ZlciB0aGUgY2FzZSBvZiB3cmFwcGVkIGxpbmVzIHRoYXQgaGF2ZSB3aG9sZSBsaW5lIGRlY29yYXRpb25zIGF0IGNvbHVtbiAxXG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXREZWNvcmF0aW9uc0luUmFuZ2UobmV3IFJhbmdlKG1vZGVsU3RhcnQubGluZU51bWJlciwgMSwgbW9kZWxFbmQubGluZU51bWJlciwgbW9kZWxFbmQuY29sdW1uKSwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvbmx5TWluaW1hcERlY29yYXRpb25zLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQ6IElNb2RlbERlY29yYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGVsU3RhcnRMaW5lSW5kZXggPSBtb2RlbFN0YXJ0LmxpbmVOdW1iZXIgLSAxO1xuXHRcdGNvbnN0IG1vZGVsRW5kTGluZUluZGV4ID0gbW9kZWxFbmQubGluZU51bWJlciAtIDE7XG5cblx0XHRsZXQgcmVxU3RhcnQ6IFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgbW9kZWxMaW5lSW5kZXggPSBtb2RlbFN0YXJ0TGluZUluZGV4OyBtb2RlbExpbmVJbmRleCA8PSBtb2RlbEVuZExpbmVJbmRleDsgbW9kZWxMaW5lSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMubW9kZWxMaW5lUHJvamVjdGlvbnNbbW9kZWxMaW5lSW5kZXhdO1xuXHRcdFx0aWYgKGxpbmUuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0Ly8gbWVyZ2UgaW50byBwcmV2aW91cyByZXF1ZXN0XG5cdFx0XHRcdGlmIChyZXFTdGFydCA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdHJlcVN0YXJ0ID0gbmV3IFBvc2l0aW9uKG1vZGVsTGluZUluZGV4ICsgMSwgbW9kZWxMaW5lSW5kZXggPT09IG1vZGVsU3RhcnRMaW5lSW5kZXggPyBtb2RlbFN0YXJ0LmNvbHVtbiA6IDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBoaXQgaW52aXNpYmxlIGxpbmUgPT4gZmx1c2ggcmVxdWVzdFxuXHRcdFx0XHRpZiAocmVxU3RhcnQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRjb25zdCBtYXhMaW5lQ29sdW1uID0gdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG1vZGVsTGluZUluZGV4KTtcblx0XHRcdFx0XHRyZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMubW9kZWwuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKG5ldyBSYW5nZShyZXFTdGFydC5saW5lTnVtYmVyLCByZXFTdGFydC5jb2x1bW4sIG1vZGVsTGluZUluZGV4LCBtYXhMaW5lQ29sdW1uKSwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvbmx5TWluaW1hcERlY29yYXRpb25zKSk7XG5cdFx0XHRcdFx0cmVxU3RhcnQgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlcVN0YXJ0ICE9PSBudWxsKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMubW9kZWwuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKG5ldyBSYW5nZShyZXFTdGFydC5saW5lTnVtYmVyLCByZXFTdGFydC5jb2x1bW4sIG1vZGVsRW5kLmxpbmVOdW1iZXIsIG1vZGVsRW5kLmNvbHVtbiksIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb25seU1pbmltYXBEZWNvcmF0aW9ucykpO1xuXHRcdFx0cmVxU3RhcnQgPSBudWxsO1xuXHRcdH1cblxuXHRcdHJlc3VsdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCByZXMgPSBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYS5yYW5nZSwgYi5yYW5nZSk7XG5cdFx0XHRpZiAocmVzID09PSAwKSB7XG5cdFx0XHRcdGlmIChhLmlkIDwgYi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYS5pZCA+IGIuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXM7XG5cdFx0fSk7XG5cblx0XHQvLyBFbGltaW5hdGUgZHVwbGljYXRlIGRlY29yYXRpb25zIHRoYXQgbWlnaHQgaGF2ZSBpbnRlcnNlY3RlZCBvdXIgdmlzaWJsZSByYW5nZXMgbXVsdGlwbGUgdGltZXNcblx0XHRjb25zdCBmaW5hbFJlc3VsdDogSU1vZGVsRGVjb3JhdGlvbltdID0gW107XG5cdFx0bGV0IGZpbmFsUmVzdWx0TGVuID0gMDtcblx0XHRsZXQgcHJldkRlY0lkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGNvbnN0IGRlYyBvZiByZXN1bHQpIHtcblx0XHRcdGNvbnN0IGRlY0lkID0gZGVjLmlkO1xuXHRcdFx0aWYgKHByZXZEZWNJZCA9PT0gZGVjSWQpIHtcblx0XHRcdFx0Ly8gc2tpcFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHByZXZEZWNJZCA9IGRlY0lkO1xuXHRcdFx0ZmluYWxSZXN1bHRbZmluYWxSZXN1bHRMZW4rK10gPSBkZWM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbmFsUmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldEluamVjdGVkVGV4dEF0KHBvc2l0aW9uOiBQb3NpdGlvbik6IEluamVjdGVkVGV4dCB8IG51bGwge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldFZpZXdMaW5lSW5mbyhwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLmdldEluamVjdGVkVGV4dEF0KGluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgsIHBvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRub3JtYWxpemVQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5KTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldFZpZXdMaW5lSW5mbyhwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbExpbmVQcm9qZWN0aW9uc1tpbmZvLm1vZGVsTGluZU51bWJlciAtIDFdLm5vcm1hbGl6ZVBvc2l0aW9uKGluZm8ubW9kZWxMaW5lV3JhcHBlZExpbmVJZHgsIHBvc2l0aW9uLCBhZmZpbml0eSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUluZGVudENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldFZpZXdMaW5lSW5mbyhsaW5lTnVtYmVyKTtcblx0XHRpZiAoaW5mby5tb2RlbExpbmVXcmFwcGVkTGluZUlkeCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGluZUluZGVudENvbHVtbihpbmZvLm1vZGVsTGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0Ly8gd3JhcHBlZCBsaW5lcyBoYXZlIG5vIGluZGVudGF0aW9uLlxuXHRcdC8vIFdlIGRlbGliZXJhdGVseSBkb24ndCBoYW5kbGUgdGhlIGNhc2UgdGhhdCBpbmRlbnRhdGlvbiBpcyB3cmFwcGVkXG5cdFx0Ly8gdG8gYXZvaWQgdHdvIHZpZXcgbGluZXMgcmVwb3J0aW5nIGluZGVudGF0aW9uIGZvciB0aGUgdmVyeSBzYW1lIG1vZGVsIGxpbmUuXG5cdFx0cmV0dXJuIDA7XG5cdH1cbn1cblxuLyoqXG4gKiBPdmVybGFwcGluZyB1bnNvcnRlZCByYW5nZXM6XG4gKiBbICAgKSAgICAgIFsgKSAgICAgICBbICApXG4gKiAgICBbICAgICkgICAgICBbICAgICAgIClcbiAqIC0+XG4gKiBOb24gb3ZlcmxhcHBpbmcgc29ydGVkIHJhbmdlczpcbiAqIFsgICAgICAgKSAgWyApIFsgICAgICAgIClcbiAqXG4gKiBOb3RlOiBUaGlzIGZ1bmN0aW9uIG9ubHkgY29uc2lkZXJzIGxpbmUgaW5mb3JtYXRpb24hIENvbHVtbnMgYXJlIGlnbm9yZWQuXG4qL1xuZnVuY3Rpb24gbm9ybWFsaXplTGluZVJhbmdlcyhyYW5nZXM6IFJhbmdlW10pOiBSYW5nZVtdIHtcblx0aWYgKHJhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBzb3J0ZWRSYW5nZXMgPSByYW5nZXMuc2xpY2UoKTtcblx0c29ydGVkUmFuZ2VzLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblxuXHRjb25zdCByZXN1bHQ6IFJhbmdlW10gPSBbXTtcblx0bGV0IGN1cnJlbnRSYW5nZVN0YXJ0ID0gc29ydGVkUmFuZ2VzWzBdLnN0YXJ0TGluZU51bWJlcjtcblx0bGV0IGN1cnJlbnRSYW5nZUVuZCA9IHNvcnRlZFJhbmdlc1swXS5lbmRMaW5lTnVtYmVyO1xuXG5cdGZvciAobGV0IGkgPSAxLCBsZW4gPSBzb3J0ZWRSYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCByYW5nZSA9IHNvcnRlZFJhbmdlc1tpXTtcblxuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPiBjdXJyZW50UmFuZ2VFbmQgKyAxKSB7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgUmFuZ2UoY3VycmVudFJhbmdlU3RhcnQsIDEsIGN1cnJlbnRSYW5nZUVuZCwgMSkpO1xuXHRcdFx0Y3VycmVudFJhbmdlU3RhcnQgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjdXJyZW50UmFuZ2VFbmQgPSByYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdH0gZWxzZSBpZiAocmFuZ2UuZW5kTGluZU51bWJlciA+IGN1cnJlbnRSYW5nZUVuZCkge1xuXHRcdFx0Y3VycmVudFJhbmdlRW5kID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHR9XG5cdH1cblx0cmVzdWx0LnB1c2gobmV3IFJhbmdlKGN1cnJlbnRSYW5nZVN0YXJ0LCAxLCBjdXJyZW50UmFuZ2VFbmQsIDEpKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgdmlldyBsaW5lLiBDYW4gYmUgdXNlZCB0byBlZmZpY2llbnRseSBxdWVyeSBtb3JlIGluZm9ybWF0aW9uIGFib3V0IGl0LlxuICovXG5jbGFzcyBWaWV3TGluZUluZm8ge1xuXHRwdWJsaWMgZ2V0IGlzV3JhcHBlZExpbmVDb250aW51YXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxMaW5lV3JhcHBlZExpbmVJZHggPiAwO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGVsTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RlbExpbmVXcmFwcGVkTGluZUlkeDogbnVtYmVyLFxuXHQpIHsgfVxufVxuXG4vKipcbiAqIEEgbGlzdCBvZiB2aWV3IGxpbmVzIHRoYXQgaGF2ZSBhIGNvbnRpZ3VvdXMgc3BhbiBpbiB0aGUgbW9kZWwuXG4qL1xuY2xhc3MgVmlld0xpbmVJbmZvR3JvdXBlZEJ5TW9kZWxSYW5nZSB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBtb2RlbFJhbmdlOiBSYW5nZSwgcHVibGljIHJlYWRvbmx5IHZpZXdMaW5lczogVmlld0xpbmVJbmZvW10pIHtcblx0fVxufVxuXG5jbGFzcyBDb29yZGluYXRlc0NvbnZlcnRlciBpbXBsZW1lbnRzIElDb29yZGluYXRlc0NvbnZlcnRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVzOiBWaWV3TW9kZWxMaW5lc0Zyb21Qcm9qZWN0ZWRNb2RlbDtcblxuXHRjb25zdHJ1Y3RvcihsaW5lczogVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwpIHtcblx0XHR0aGlzLl9saW5lcyA9IGxpbmVzO1xuXHR9XG5cblx0Ly8gVmlldyAtPiBNb2RlbCBjb252ZXJzaW9uIGFuZCByZWxhdGVkIG1ldGhvZHNcblxuXHRwdWJsaWMgY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbih2aWV3UG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCB2aWV3UG9zaXRpb24uY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBjb252ZXJ0Vmlld1JhbmdlVG9Nb2RlbFJhbmdlKHZpZXdSYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmNvbnZlcnRWaWV3UmFuZ2VUb01vZGVsUmFuZ2Uodmlld1JhbmdlKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZVZpZXdQb3NpdGlvbih2aWV3UG9zaXRpb246IFBvc2l0aW9uLCBleHBlY3RlZE1vZGVsUG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy52YWxpZGF0ZVZpZXdQb3NpdGlvbih2aWV3UG9zaXRpb24ubGluZU51bWJlciwgdmlld1Bvc2l0aW9uLmNvbHVtbiwgZXhwZWN0ZWRNb2RlbFBvc2l0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZVZpZXdSYW5nZSh2aWV3UmFuZ2U6IFJhbmdlLCBleHBlY3RlZE1vZGVsUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy52YWxpZGF0ZVZpZXdSYW5nZSh2aWV3UmFuZ2UsIGV4cGVjdGVkTW9kZWxSYW5nZSk7XG5cdH1cblxuXHQvLyBNb2RlbCAtPiBWaWV3IGNvbnZlcnNpb24gYW5kIHJlbGF0ZWQgbWV0aG9kc1xuXG5cdHB1YmxpYyBjb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG1vZGVsUG9zaXRpb246IFBvc2l0aW9uLCBhZmZpbml0eT86IFBvc2l0aW9uQWZmaW5pdHksIGFsbG93WmVybz86IGJvb2xlYW4sIGJlbG93SGlkZGVuUmFuZ2VzPzogYm9vbGVhbik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFBvc2l0aW9uLmxpbmVOdW1iZXIsIG1vZGVsUG9zaXRpb24uY29sdW1uLCBhZmZpbml0eSwgYWxsb3daZXJvLCBiZWxvd0hpZGRlblJhbmdlcyk7XG5cdH1cblxuXHRwdWJsaWMgY29udmVydE1vZGVsUmFuZ2VUb1ZpZXdSYW5nZShtb2RlbFJhbmdlOiBSYW5nZSwgYWZmaW5pdHk/OiBQb3NpdGlvbkFmZmluaXR5KTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5jb252ZXJ0TW9kZWxSYW5nZVRvVmlld1JhbmdlKG1vZGVsUmFuZ2UsIGFmZmluaXR5KTtcblx0fVxuXG5cdHB1YmxpYyBtb2RlbFBvc2l0aW9uSXNWaXNpYmxlKG1vZGVsUG9zaXRpb246IFBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUobW9kZWxQb3NpdGlvbi5saW5lTnVtYmVyLCBtb2RlbFBvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW9kZWxMaW5lVmlld0xpbmVDb3VudChtb2RlbExpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldE1vZGVsTGluZVZpZXdMaW5lQ291bnQobW9kZWxMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbihtb2RlbExpbmVOdW1iZXI6IG51bWJlciwgbW9kZWxDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lTnVtYmVyT2ZNb2RlbFBvc2l0aW9uKG1vZGVsTGluZU51bWJlciwgbW9kZWxDb2x1bW4pO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gSW5kZW50R3VpZGVSZXBlYXRPcHRpb24ge1xuXHRCbG9ja05vbmUgPSAwLFxuXHRCbG9ja1N1YnNlcXVlbnQgPSAxLFxuXHRCbG9ja0FsbCA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIFZpZXdNb2RlbExpbmVzRnJvbU1vZGVsQXNJcyBpbXBsZW1lbnRzIElWaWV3TW9kZWxMaW5lcyB7XG5cdHB1YmxpYyByZWFkb25seSBtb2RlbDogSVRleHRNb2RlbDtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdHRoaXMubW9kZWwgPSBtb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUNvb3JkaW5hdGVzQ29udmVydGVyKCk6IElDb29yZGluYXRlc0NvbnZlcnRlciB7XG5cdFx0cmV0dXJuIG5ldyBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyKHRoaXMubW9kZWwpO1xuXHR9XG5cblx0cHVibGljIGdldEhpZGRlbkFyZWFzKCk6IFJhbmdlW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBzZXRIaWRkZW5BcmVhcyhfcmFuZ2VzOiBSYW5nZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHNldFRhYlNpemUoX25ld1RhYlNpemU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRXcmFwcGluZ1NldHRpbmdzKF9mb250SW5mbzogRm9udEluZm8sIF93cmFwcGluZ1N0cmF0ZWd5OiAnc2ltcGxlJyB8ICdhZHZhbmNlZCcsIF93cmFwcGluZ0NvbHVtbjogbnVtYmVyLCBfd3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUxpbmVCcmVha3NDb21wdXRlcigpOiBJTGluZUJyZWFrc0NvbXB1dGVyIHtcblx0XHRjb25zdCByZXN1bHQ6IG51bGxbXSA9IFtdO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRSZXF1ZXN0OiAobGluZU51bWJlcjogbnVtYmVyLCBwcmV2aW91c0xpbmVCcmVha0RhdGE6IE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRyZXN1bHQucHVzaChudWxsKTtcblx0XHRcdH0sXG5cdFx0XHRmaW5hbGl6ZTogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbEZsdXNoZWQoKTogdm9pZCB7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbExpbmVzRGVsZXRlZChfdmVyc2lvbklkOiBudW1iZXIgfCBudWxsLCBmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50IHwgbnVsbCB7XG5cdFx0cmV0dXJuIG5ldyB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudChmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBvbk1vZGVsTGluZXNJbnNlcnRlZChfdmVyc2lvbklkOiBudW1iZXIgfCBudWxsLCBmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlciwgbGluZUJyZWFrczogKE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbClbXSk6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCB8IG51bGwge1xuXHRcdHJldHVybiBuZXcgdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KGZyb21MaW5lTnVtYmVyLCB0b0xpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIG9uTW9kZWxMaW5lQ2hhbmdlZChfdmVyc2lvbklkOiBudW1iZXIgfCBudWxsLCBsaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVCcmVha0RhdGE6IE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbCk6IFtib29sZWFuLCB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudCB8IG51bGwsIHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCB8IG51bGwsIHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50IHwgbnVsbF0ge1xuXHRcdHJldHVybiBbZmFsc2UsIG5ldyB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudChsaW5lTnVtYmVyLCAxKSwgbnVsbCwgbnVsbF07XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0VmVyc2lvbklkKF92ZXJzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVJbmRlbnRHdWlkZSh2aWV3TGluZU51bWJlcjogbnVtYmVyLCBfbWluTGluZU51bWJlcjogbnVtYmVyLCBfbWF4TGluZU51bWJlcjogbnVtYmVyKTogSUFjdGl2ZUluZGVudEd1aWRlSW5mbyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogdmlld0xpbmVOdW1iZXIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiB2aWV3TGluZU51bWJlcixcblx0XHRcdGluZGVudDogMFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVzQnJhY2tldEd1aWRlcyhzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBhY3RpdmVQb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCk6IEluZGVudEd1aWRlW11bXSB7XG5cdFx0cmV0dXJuIG5ldyBBcnJheShlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMSkuZmlsbChbXSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKHZpZXdTdGFydExpbmVOdW1iZXI6IG51bWJlciwgdmlld0VuZExpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlcltdIHtcblx0XHRjb25zdCB2aWV3TGluZUNvdW50ID0gdmlld0VuZExpbmVOdW1iZXIgLSB2aWV3U3RhcnRMaW5lTnVtYmVyICsgMTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgQXJyYXk8bnVtYmVyPih2aWV3TGluZUNvdW50KTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpZXdMaW5lQ291bnQ7IGkrKykge1xuXHRcdFx0cmVzdWx0W2ldID0gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZUNvbnRlbnQodmlld0xpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGluZUNvbnRlbnQodmlld0xpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lTGVuZ3RoKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVMZW5ndGgodmlld0xpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lTWluQ29sdW1uKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVNaW5Db2x1bW4odmlld0xpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lTWF4Q29sdW1uKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4odmlld0xpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lRGF0YSh2aWV3TGluZU51bWJlcjogbnVtYmVyKTogVmlld0xpbmVEYXRhIHtcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gdGhpcy5tb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2Vucyh2aWV3TGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBsaW5lVG9rZW5zLmdldExpbmVDb250ZW50KCk7XG5cdFx0cmV0dXJuIG5ldyBWaWV3TGluZURhdGEoXG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0MSxcblx0XHRcdGxpbmVDb250ZW50Lmxlbmd0aCArIDEsXG5cdFx0XHQwLFxuXHRcdFx0bGluZVRva2Vucy5pbmZsYXRlKCksXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZXNEYXRhKHZpZXdTdGFydExpbmVOdW1iZXI6IG51bWJlciwgdmlld0VuZExpbmVOdW1iZXI6IG51bWJlciwgbmVlZGVkOiBib29sZWFuW10pOiBBcnJheTxWaWV3TGluZURhdGEgfCBudWxsPiB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gdGhpcy5tb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHR2aWV3U3RhcnRMaW5lTnVtYmVyID0gTWF0aC5taW4oTWF0aC5tYXgoMSwgdmlld1N0YXJ0TGluZU51bWJlciksIGxpbmVDb3VudCk7XG5cdFx0dmlld0VuZExpbmVOdW1iZXIgPSBNYXRoLm1pbihNYXRoLm1heCgxLCB2aWV3RW5kTGluZU51bWJlciksIGxpbmVDb3VudCk7XG5cblx0XHRjb25zdCByZXN1bHQ6IEFycmF5PFZpZXdMaW5lRGF0YSB8IG51bGw+ID0gW107XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHZpZXdTdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdmlld0VuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgaWR4ID0gbGluZU51bWJlciAtIHZpZXdTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRyZXN1bHRbaWR4XSA9IG5lZWRlZFtpZHhdID8gdGhpcy5nZXRWaWV3TGluZURhdGEobGluZU51bWJlcikgOiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlOiBSYW5nZSwgb3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNaW5pbWFwRGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIG9ubHlNaW5pbWFwRGVjb3JhdGlvbnMsIG9ubHlNYXJnaW5EZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRub3JtYWxpemVQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5KTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKHBvc2l0aW9uLCBhZmZpbml0eSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUluZGVudENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExpbmVJbmRlbnRDb2x1bW4obGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SW5qZWN0ZWRUZXh0QXQocG9zaXRpb246IFBvc2l0aW9uKTogSW5qZWN0ZWRUZXh0IHwgbnVsbCB7XG5cdFx0Ly8gSWRlbnRpdHkgbGluZXMgY29sbGVjdGlvbiBkb2VzIG5vdCBzdXBwb3J0IGluamVjdGVkIHRleHQuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQVFBLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFTLGFBQWE7QUFDdEIsU0FBOEQsd0JBQXdCO0FBQ3RGLFNBQXNELGFBQWEsaUNBQWlDO0FBQ3BHLFNBQVMsOEJBQThCO0FBQ3ZDLFlBQVksZ0JBQWdCO0FBQzVCLFNBQVMsaUNBQXVEO0FBRWhFLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQWdDLG9DQUFvQztBQXlDN0QsTUFBTSxpQ0FBNEQ7QUFBQSxFQXlCeEUsWUFDQyxVQUNBLE9BQ0EsOEJBQ0Esb0NBQ0EsVUFDQSxTQUNBLGtCQUNBLGdCQUNBLGdCQUNBLFdBQ0Esd0JBQ0M7QUFDRCxTQUFLLFlBQVk7QUFDakIsU0FBSyxRQUFRO0FBQ2IsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxnQ0FBZ0M7QUFDckMsU0FBSyxzQ0FBc0M7QUFDM0MsU0FBSyxXQUFXO0FBQ2hCLFNBQUssVUFBVTtBQUNmLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssWUFBWTtBQUNqQixTQUFLLHlCQUF5QjtBQUU5QixTQUFLO0FBQUE7QUFBQSxNQUFvQztBQUFBLE1BQU07QUFBQSxJQUFJO0FBQUEsRUFDcEQ7QUFBQSxFQUVPLFVBQWdCO0FBQ3RCLFNBQUss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SUFBSSxPQUFPLEdBQUcsSUFBSSxLQUFLLGdCQUFnQixVQUFVLElBQUk7QUFBQSxJQUNoRTtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxzQkFBc0IsT0FBYyxTQUFpQixxQkFBOEIsdUJBQWdDLHdCQUFpQyx1QkFBb0Q7QUFDOU0sV0FBTyxLQUFLLE1BQU0sc0JBQXNCLE9BQU8sU0FBUyxxQkFBcUIsdUJBQXVCLHdCQUF3QixxQkFBcUI7QUFBQSxFQUNsSjtBQUFBLEVBRUEsa0JBQWtCLFVBQW9CLFVBQXNDO0FBQzNFLFdBQU8sS0FBSyxNQUFNLGtCQUFrQixVQUFVLFFBQVE7QUFBQSxFQUN2RDtBQUFBLEVBRU8sb0JBQW9CLFlBQTRCO0FBQ3RELFdBQU8sS0FBSyxNQUFNLG9CQUFvQixVQUFVO0FBQUEsRUFDakQ7QUFBQSxFQUVPLGtCQUFrQixVQUF5QztBQUVqRSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJwIiwgImRlbHRhTGluZU51bWJlciIsICJJbmRlbnRHdWlkZVJlcGVhdE9wdGlvbiJdCn0K
