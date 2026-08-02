import * as strings from "../../../base/common/strings.js";
import { LineHeightsManager } from "./lineHeights.js";
class PendingChanges {
  constructor() {
    this._hasPending = false;
    this._inserts = [];
    this._changes = [];
    this._removes = [];
  }
  insert(x) {
    this._hasPending = true;
    this._inserts.push(x);
  }
  change(x) {
    this._hasPending = true;
    this._changes.push(x);
  }
  remove(x) {
    this._hasPending = true;
    this._removes.push(x);
  }
  commit(linesLayout) {
    if (!this._hasPending) {
      return;
    }
    const inserts = this._inserts;
    const changes = this._changes;
    const removes = this._removes;
    this._hasPending = false;
    this._inserts = [];
    this._changes = [];
    this._removes = [];
    linesLayout._commitPendingChanges(inserts, changes, removes);
  }
}
class EditorWhitespace {
  constructor(id, afterLineNumber, ordinal, height, minWidth) {
    this.id = id;
    this.afterLineNumber = afterLineNumber;
    this.ordinal = ordinal;
    this.height = height;
    this.minWidth = minWidth;
    this.prefixSum = 0;
  }
}
const _LinesLayout = class _LinesLayout {
  constructor(lineCount, defaultLineHeight, paddingTop, paddingBottom, customLineHeightData) {
    this._instanceId = strings.singleLetterHash(++_LinesLayout.INSTANCE_COUNT);
    this._pendingChanges = new PendingChanges();
    this._lastWhitespaceId = 0;
    this._arr = [];
    this._prefixSumValidIndex = -1;
    this._minWidth = -1;
    this._lineCount = lineCount;
    this._paddingTop = paddingTop;
    this._paddingBottom = paddingBottom;
    this._lineHeightsManager = new LineHeightsManager(defaultLineHeight, customLineHeightData);
  }
  /**
   * Find the insertion index for a new value inside a sorted array of values.
   * If the value is already present in the sorted array, the insertion index will be after the already existing value.
   */
  static findInsertionIndex(arr, afterLineNumber, ordinal) {
    let low = 0;
    let high = arr.length;
    while (low < high) {
      const mid = low + high >>> 1;
      if (afterLineNumber === arr[mid].afterLineNumber) {
        if (ordinal < arr[mid].ordinal) {
          high = mid;
        } else {
          low = mid + 1;
        }
      } else if (afterLineNumber < arr[mid].afterLineNumber) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low;
  }
  /**
   * Change the height of a line in pixels.
   */
  setDefaultLineHeight(lineHeight) {
    this._lineHeightsManager.defaultLineHeight = lineHeight;
  }
  /**
   * Changes the padding used to calculate vertical offsets.
   */
  setPadding(paddingTop, paddingBottom) {
    this._paddingTop = paddingTop;
    this._paddingBottom = paddingBottom;
  }
  /**
   * Set the number of lines.
   *
   * @param lineCount New number of lines.
   */
  onFlushed(lineCount, customLineHeightData) {
    this._lineCount = lineCount;
    this._lineHeightsManager = new LineHeightsManager(this._lineHeightsManager.defaultLineHeight, customLineHeightData);
  }
  changeLineHeights(callback) {
    let hadAChange = false;
    const accessor = {
      insertOrChangeCustomLineHeight: (decorationId, startLineNumber, endLineNumber, lineHeight) => {
        hadAChange = true;
        this._lineHeightsManager.insertOrChangeCustomLineHeight(decorationId, startLineNumber, endLineNumber, lineHeight);
      },
      removeCustomLineHeight: (decorationId) => {
        hadAChange = true;
        this._lineHeightsManager.removeCustomLineHeight(decorationId);
      }
    };
    callback(accessor);
    return hadAChange;
  }
  changeWhitespace(callback) {
    let hadAChange = false;
    try {
      const accessor = {
        insertWhitespace: (afterLineNumber, ordinal, heightInPx, minWidth) => {
          hadAChange = true;
          afterLineNumber = afterLineNumber | 0;
          ordinal = ordinal | 0;
          heightInPx = heightInPx | 0;
          minWidth = minWidth | 0;
          const id = this._instanceId + ++this._lastWhitespaceId;
          this._pendingChanges.insert(new EditorWhitespace(id, afterLineNumber, ordinal, heightInPx, minWidth));
          return id;
        },
        changeOneWhitespace: (id, newAfterLineNumber, newHeight) => {
          hadAChange = true;
          newAfterLineNumber = newAfterLineNumber | 0;
          newHeight = newHeight | 0;
          this._pendingChanges.change({ id, newAfterLineNumber, newHeight });
        },
        removeWhitespace: (id) => {
          hadAChange = true;
          this._pendingChanges.remove({ id });
        }
      };
      callback(accessor);
    } finally {
      this._pendingChanges.commit(this);
    }
    return hadAChange;
  }
  _commitPendingChanges(inserts, changes, removes) {
    if (inserts.length > 0 || removes.length > 0) {
      this._minWidth = -1;
    }
    if (inserts.length + changes.length + removes.length <= 1) {
      for (const insert of inserts) {
        this._insertWhitespace(insert);
      }
      for (const change of changes) {
        this._changeOneWhitespace(change.id, change.newAfterLineNumber, change.newHeight);
      }
      for (const remove of removes) {
        const index = this._findWhitespaceIndex(remove.id);
        if (index === -1) {
          continue;
        }
        this._removeWhitespace(index);
      }
      return;
    }
    const toRemove = /* @__PURE__ */ new Set();
    for (const remove of removes) {
      toRemove.add(remove.id);
    }
    const toChange = /* @__PURE__ */ new Map();
    for (const change of changes) {
      toChange.set(change.id, change);
    }
    const applyRemoveAndChange = (whitespaces) => {
      const result2 = [];
      for (const whitespace of whitespaces) {
        if (toRemove.has(whitespace.id)) {
          continue;
        }
        if (toChange.has(whitespace.id)) {
          const change = toChange.get(whitespace.id);
          whitespace.afterLineNumber = change.newAfterLineNumber;
          whitespace.height = change.newHeight;
        }
        result2.push(whitespace);
      }
      return result2;
    };
    const result = applyRemoveAndChange(this._arr).concat(applyRemoveAndChange(inserts));
    result.sort((a, b) => {
      if (a.afterLineNumber === b.afterLineNumber) {
        return a.ordinal - b.ordinal;
      }
      return a.afterLineNumber - b.afterLineNumber;
    });
    this._arr = result;
    this._prefixSumValidIndex = -1;
  }
  _insertWhitespace(whitespace) {
    const insertIndex = _LinesLayout.findInsertionIndex(this._arr, whitespace.afterLineNumber, whitespace.ordinal);
    this._arr.splice(insertIndex, 0, whitespace);
    this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, insertIndex - 1);
  }
  _findWhitespaceIndex(id) {
    const arr = this._arr;
    for (let i = 0, len = arr.length; i < len; i++) {
      if (arr[i].id === id) {
        return i;
      }
    }
    return -1;
  }
  _changeOneWhitespace(id, newAfterLineNumber, newHeight) {
    const index = this._findWhitespaceIndex(id);
    if (index === -1) {
      return;
    }
    if (this._arr[index].height !== newHeight) {
      this._arr[index].height = newHeight;
      this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, index - 1);
    }
    if (this._arr[index].afterLineNumber !== newAfterLineNumber) {
      const whitespace = this._arr[index];
      this._removeWhitespace(index);
      whitespace.afterLineNumber = newAfterLineNumber;
      this._insertWhitespace(whitespace);
    }
  }
  _removeWhitespace(removeIndex) {
    this._arr.splice(removeIndex, 1);
    this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, removeIndex - 1);
  }
  /**
   * Notify the layouter that lines have been deleted (a continuous zone of lines).
   *
   * @param fromLineNumber The line number at which the deletion started, inclusive
   * @param toLineNumber The line number at which the deletion ended, inclusive
   */
  onLinesDeleted(fromLineNumber, toLineNumber) {
    fromLineNumber = fromLineNumber | 0;
    toLineNumber = toLineNumber | 0;
    this._lineCount -= toLineNumber - fromLineNumber + 1;
    for (let i = 0, len = this._arr.length; i < len; i++) {
      const afterLineNumber = this._arr[i].afterLineNumber;
      if (fromLineNumber <= afterLineNumber && afterLineNumber <= toLineNumber) {
        this._arr[i].afterLineNumber = fromLineNumber - 1;
      } else if (afterLineNumber > toLineNumber) {
        this._arr[i].afterLineNumber -= toLineNumber - fromLineNumber + 1;
      }
    }
    this._lineHeightsManager.onLinesDeleted(fromLineNumber, toLineNumber);
  }
  /**
   * Notify the layouter that lines have been inserted (a continuous zone of lines).
   *
   * @param fromLineNumber The line number at which the insertion started, inclusive
   * @param toLineNumber The line number at which the insertion ended, inclusive.
   */
  onLinesInserted(fromLineNumber, toLineNumber) {
    fromLineNumber = fromLineNumber | 0;
    toLineNumber = toLineNumber | 0;
    this._lineCount += toLineNumber - fromLineNumber + 1;
    for (let i = 0, len = this._arr.length; i < len; i++) {
      const afterLineNumber = this._arr[i].afterLineNumber;
      if (fromLineNumber <= afterLineNumber) {
        this._arr[i].afterLineNumber += toLineNumber - fromLineNumber + 1;
      }
    }
    this._lineHeightsManager.onLinesInserted(fromLineNumber, toLineNumber);
  }
  /**
   * Get the sum of all the whitespaces.
   */
  getWhitespacesTotalHeight() {
    if (this._arr.length === 0) {
      return 0;
    }
    return this.getWhitespacesAccumulatedHeight(this._arr.length - 1);
  }
  /**
   * Return the sum of the heights of the whitespaces at [0..index].
   * This includes the whitespace at `index`.
   *
   * @param index The index of the whitespace.
   * @return The sum of the heights of all whitespaces before the one at `index`, including the one at `index`.
   */
  getWhitespacesAccumulatedHeight(index) {
    index = index | 0;
    let startIndex = Math.max(0, this._prefixSumValidIndex + 1);
    if (startIndex === 0) {
      this._arr[0].prefixSum = this._arr[0].height;
      startIndex++;
    }
    for (let i = startIndex; i <= index; i++) {
      this._arr[i].prefixSum = this._arr[i - 1].prefixSum + this._arr[i].height;
    }
    this._prefixSumValidIndex = Math.max(this._prefixSumValidIndex, index);
    return this._arr[index].prefixSum;
  }
  /**
   * Get the sum of heights for all objects.
   *
   * @return The sum of heights for all objects.
   */
  getLinesTotalHeight() {
    const linesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(this._lineCount);
    const whitespacesHeight = this.getWhitespacesTotalHeight();
    return linesHeight + whitespacesHeight + this._paddingTop + this._paddingBottom;
  }
  /**
   * Returns the accumulated height of whitespaces before the given line number.
   *
   * @param lineNumber The line number
   */
  getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    const lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);
    if (lastWhitespaceBeforeLineNumber === -1) {
      return 0;
    }
    return this.getWhitespacesAccumulatedHeight(lastWhitespaceBeforeLineNumber);
  }
  _findLastWhitespaceBeforeLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    const arr = this._arr;
    let low = 0;
    let high = arr.length - 1;
    while (low <= high) {
      const delta = high - low | 0;
      const halfDelta = delta / 2 | 0;
      const mid = low + halfDelta | 0;
      if (arr[mid].afterLineNumber < lineNumber) {
        if (mid + 1 >= arr.length || arr[mid + 1].afterLineNumber >= lineNumber) {
          return mid;
        } else {
          low = mid + 1 | 0;
        }
      } else {
        high = mid - 1 | 0;
      }
    }
    return -1;
  }
  _findFirstWhitespaceAfterLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    const lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);
    const firstWhitespaceAfterLineNumber = lastWhitespaceBeforeLineNumber + 1;
    if (firstWhitespaceAfterLineNumber < this._arr.length) {
      return firstWhitespaceAfterLineNumber;
    }
    return -1;
  }
  /**
   * Find the index of the first whitespace which has `afterLineNumber` >= `lineNumber`.
   * @return The index of the first whitespace with `afterLineNumber` >= `lineNumber` or -1 if no whitespace is found.
   */
  getFirstWhitespaceIndexAfterLineNumber(lineNumber) {
    lineNumber = lineNumber | 0;
    return this._findFirstWhitespaceAfterLineNumber(lineNumber);
  }
  /**
   * Get the vertical offset (the sum of heights for all objects above) a certain line number.
   *
   * @param lineNumber The line number
   * @return The sum of heights for all objects above `lineNumber`.
   */
  getVerticalOffsetForLineNumber(lineNumber, includeViewZones = false) {
    lineNumber = lineNumber | 0;
    let previousLinesHeight;
    if (lineNumber > 1) {
      previousLinesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(lineNumber - 1);
    } else {
      previousLinesHeight = 0;
    }
    const previousWhitespacesHeight = this.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber - (includeViewZones ? 1 : 0));
    return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
  }
  getLineHeightForLineNumber(lineNumber) {
    return this._lineHeightsManager.heightForLineNumber(lineNumber);
  }
  /**
   * Get the vertical offset (the sum of heights for all objects above) a certain line number and also the line height of the line.
   *
   * @param lineNumber The line number
   * @return The sum of heights for all objects above `lineNumber`.
   */
  getVerticalOffsetAfterLineNumber(lineNumber, includeViewZones = false) {
    lineNumber = lineNumber | 0;
    const previousLinesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(lineNumber);
    const previousWhitespacesHeight = this.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber + (includeViewZones ? 1 : 0));
    return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
  }
  /**
   * Returns if there is any whitespace in the document.
   */
  hasWhitespace() {
    return this.getWhitespacesCount() > 0;
  }
  /**
   * The maximum min width for all whitespaces.
   */
  getWhitespaceMinWidth() {
    if (this._minWidth === -1) {
      let minWidth = 0;
      for (let i = 0, len = this._arr.length; i < len; i++) {
        minWidth = Math.max(minWidth, this._arr[i].minWidth);
      }
      this._minWidth = minWidth;
    }
    return this._minWidth;
  }
  /**
   * Check if `verticalOffset` is below all lines.
   */
  isAfterLines(verticalOffset) {
    const totalHeight = this.getLinesTotalHeight();
    return verticalOffset > totalHeight;
  }
  isInTopPadding(verticalOffset) {
    if (this._paddingTop === 0) {
      return false;
    }
    return verticalOffset < this._paddingTop;
  }
  isInBottomPadding(verticalOffset) {
    if (this._paddingBottom === 0) {
      return false;
    }
    const totalHeight = this.getLinesTotalHeight();
    return verticalOffset >= totalHeight - this._paddingBottom;
  }
  /**
   * Find the first line number that is at or after vertical offset `verticalOffset`.
   * i.e. if getVerticalOffsetForLine(line) is x and getVerticalOffsetForLine(line + 1) is y, then
   * getLineNumberAtOrAfterVerticalOffset(i) = line, x <= i < y.
   *
   * @param verticalOffset The vertical offset to search at.
   * @return The line number at or after vertical offset `verticalOffset`.
   */
  getLineNumberAtOrAfterVerticalOffset(verticalOffset) {
    verticalOffset = verticalOffset | 0;
    if (verticalOffset < 0) {
      return 1;
    }
    const linesCount = this._lineCount | 0;
    let minLineNumber = 1;
    let maxLineNumber = linesCount;
    while (minLineNumber < maxLineNumber) {
      const midLineNumber = (minLineNumber + maxLineNumber) / 2 | 0;
      const lineHeight = this.getLineHeightForLineNumber(midLineNumber);
      const midLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(midLineNumber) | 0;
      if (verticalOffset >= midLineNumberVerticalOffset + lineHeight) {
        minLineNumber = midLineNumber + 1;
      } else if (verticalOffset >= midLineNumberVerticalOffset) {
        return midLineNumber;
      } else {
        maxLineNumber = midLineNumber;
      }
    }
    if (minLineNumber > linesCount) {
      return linesCount;
    }
    return minLineNumber;
  }
  /**
   * Get all the lines and their relative vertical offsets that are positioned between `verticalOffset1` and `verticalOffset2`.
   *
   * @param verticalOffset1 The beginning of the viewport.
   * @param verticalOffset2 The end of the viewport.
   * @return A structure describing the lines positioned between `verticalOffset1` and `verticalOffset2`.
   */
  getLinesViewportData(verticalOffset1, verticalOffset2) {
    verticalOffset1 = verticalOffset1 | 0;
    verticalOffset2 = verticalOffset2 | 0;
    const startLineNumber = this.getLineNumberAtOrAfterVerticalOffset(verticalOffset1) | 0;
    const startLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(startLineNumber) | 0;
    let endLineNumber = this._lineCount | 0;
    let whitespaceIndex = this.getFirstWhitespaceIndexAfterLineNumber(startLineNumber) | 0;
    const whitespaceCount = this.getWhitespacesCount() | 0;
    let currentWhitespaceHeight;
    let currentWhitespaceAfterLineNumber;
    if (whitespaceIndex === -1) {
      whitespaceIndex = whitespaceCount;
      currentWhitespaceAfterLineNumber = endLineNumber + 1;
      currentWhitespaceHeight = 0;
    } else {
      currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
      currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
    }
    let currentVerticalOffset = startLineNumberVerticalOffset;
    let currentLineRelativeOffset = currentVerticalOffset;
    const STEP_SIZE = 5e5;
    let bigNumbersDelta = 0;
    if (startLineNumberVerticalOffset >= STEP_SIZE) {
      bigNumbersDelta = Math.floor(startLineNumberVerticalOffset / STEP_SIZE) * STEP_SIZE;
      bigNumbersDelta = Math.floor(bigNumbersDelta / this._lineHeightsManager.defaultLineHeight) * this._lineHeightsManager.defaultLineHeight;
      currentLineRelativeOffset -= bigNumbersDelta;
    }
    const linesOffsets = [];
    const verticalCenter = verticalOffset1 + (verticalOffset2 - verticalOffset1) / 2;
    let centeredLineNumber = -1;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineHeight = this.getLineHeightForLineNumber(lineNumber);
      if (centeredLineNumber === -1) {
        const currentLineTop = currentVerticalOffset;
        const currentLineBottom = currentVerticalOffset + lineHeight;
        if (currentLineTop <= verticalCenter && verticalCenter < currentLineBottom || currentLineTop > verticalCenter) {
          centeredLineNumber = lineNumber;
        }
      }
      currentVerticalOffset += lineHeight;
      linesOffsets[lineNumber - startLineNumber] = currentLineRelativeOffset;
      currentLineRelativeOffset += lineHeight;
      while (currentWhitespaceAfterLineNumber === lineNumber) {
        currentLineRelativeOffset += currentWhitespaceHeight;
        currentVerticalOffset += currentWhitespaceHeight;
        whitespaceIndex++;
        if (whitespaceIndex >= whitespaceCount) {
          currentWhitespaceAfterLineNumber = endLineNumber + 1;
        } else {
          currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
          currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
        }
      }
      if (currentVerticalOffset >= verticalOffset2) {
        endLineNumber = lineNumber;
        break;
      }
    }
    if (centeredLineNumber === -1) {
      centeredLineNumber = endLineNumber;
    }
    const endLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(endLineNumber) | 0;
    let completelyVisibleStartLineNumber = startLineNumber;
    let completelyVisibleEndLineNumber = endLineNumber;
    if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
      if (startLineNumberVerticalOffset < verticalOffset1) {
        completelyVisibleStartLineNumber++;
      }
    }
    if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
      const endLineHeight = this.getLineHeightForLineNumber(endLineNumber);
      if (endLineNumberVerticalOffset + endLineHeight > verticalOffset2) {
        completelyVisibleEndLineNumber--;
      }
    }
    return {
      bigNumbersDelta,
      startLineNumber,
      endLineNumber,
      relativeVerticalOffset: linesOffsets,
      centeredLineNumber,
      completelyVisibleStartLineNumber,
      completelyVisibleEndLineNumber,
      lineHeight: this._lineHeightsManager.defaultLineHeight
    };
  }
  getVerticalOffsetForWhitespaceIndex(whitespaceIndex) {
    whitespaceIndex = whitespaceIndex | 0;
    const afterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);
    let previousLinesHeight;
    if (afterLineNumber >= 1) {
      previousLinesHeight = this._lineHeightsManager.getAccumulatedLineHeightsIncludingLineNumber(afterLineNumber);
    } else {
      previousLinesHeight = 0;
    }
    let previousWhitespacesHeight;
    if (whitespaceIndex > 0) {
      previousWhitespacesHeight = this.getWhitespacesAccumulatedHeight(whitespaceIndex - 1);
    } else {
      previousWhitespacesHeight = 0;
    }
    return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
  }
  getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset) {
    verticalOffset = verticalOffset | 0;
    let minWhitespaceIndex = 0;
    let maxWhitespaceIndex = this.getWhitespacesCount() - 1;
    if (maxWhitespaceIndex < 0) {
      return -1;
    }
    const maxWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(maxWhitespaceIndex);
    const maxWhitespaceHeight = this.getHeightForWhitespaceIndex(maxWhitespaceIndex);
    if (verticalOffset >= maxWhitespaceVerticalOffset + maxWhitespaceHeight) {
      return -1;
    }
    while (minWhitespaceIndex < maxWhitespaceIndex) {
      const midWhitespaceIndex = Math.floor((minWhitespaceIndex + maxWhitespaceIndex) / 2);
      const midWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(midWhitespaceIndex);
      const midWhitespaceHeight = this.getHeightForWhitespaceIndex(midWhitespaceIndex);
      if (verticalOffset >= midWhitespaceVerticalOffset + midWhitespaceHeight) {
        minWhitespaceIndex = midWhitespaceIndex + 1;
      } else if (verticalOffset >= midWhitespaceVerticalOffset) {
        return midWhitespaceIndex;
      } else {
        maxWhitespaceIndex = midWhitespaceIndex;
      }
    }
    return minWhitespaceIndex;
  }
  /**
   * Get exactly the whitespace that is layouted at `verticalOffset`.
   *
   * @param verticalOffset The vertical offset.
   * @return Precisely the whitespace that is layouted at `verticaloffset` or null.
   */
  getWhitespaceAtVerticalOffset(verticalOffset) {
    verticalOffset = verticalOffset | 0;
    const candidateIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset);
    if (candidateIndex < 0) {
      return null;
    }
    if (candidateIndex >= this.getWhitespacesCount()) {
      return null;
    }
    const candidateTop = this.getVerticalOffsetForWhitespaceIndex(candidateIndex);
    if (candidateTop > verticalOffset) {
      return null;
    }
    const candidateHeight = this.getHeightForWhitespaceIndex(candidateIndex);
    const candidateId = this.getIdForWhitespaceIndex(candidateIndex);
    const candidateAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(candidateIndex);
    return {
      id: candidateId,
      afterLineNumber: candidateAfterLineNumber,
      verticalOffset: candidateTop,
      height: candidateHeight
    };
  }
  /**
   * Get a list of whitespaces that are positioned between `verticalOffset1` and `verticalOffset2`.
   *
   * @param verticalOffset1 The beginning of the viewport.
   * @param verticalOffset2 The end of the viewport.
   * @return An array with all the whitespaces in the viewport. If no whitespace is in viewport, the array is empty.
   */
  getWhitespaceViewportData(verticalOffset1, verticalOffset2) {
    verticalOffset1 = verticalOffset1 | 0;
    verticalOffset2 = verticalOffset2 | 0;
    const startIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset1);
    const endIndex = this.getWhitespacesCount() - 1;
    if (startIndex < 0) {
      return [];
    }
    const result = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const top = this.getVerticalOffsetForWhitespaceIndex(i);
      const height = this.getHeightForWhitespaceIndex(i);
      if (top >= verticalOffset2) {
        break;
      }
      result.push({
        id: this.getIdForWhitespaceIndex(i),
        afterLineNumber: this.getAfterLineNumberForWhitespaceIndex(i),
        verticalOffset: top,
        height
      });
    }
    return result;
  }
  /**
   * Get all whitespaces.
   */
  getWhitespaces() {
    return this._arr.slice(0);
  }
  /**
   * The number of whitespaces.
   */
  getWhitespacesCount() {
    return this._arr.length;
  }
  /**
   * Get the `id` for whitespace at index `index`.
   *
   * @param index The index of the whitespace.
   * @return `id` of whitespace at `index`.
   */
  getIdForWhitespaceIndex(index) {
    index = index | 0;
    return this._arr[index].id;
  }
  /**
   * Get the `afterLineNumber` for whitespace at index `index`.
   *
   * @param index The index of the whitespace.
   * @return `afterLineNumber` of whitespace at `index`.
   */
  getAfterLineNumberForWhitespaceIndex(index) {
    index = index | 0;
    return this._arr[index].afterLineNumber;
  }
  /**
   * Get the `height` for whitespace at index `index`.
   *
   * @param index The index of the whitespace.
   * @return `height` of whitespace at `index`.
   */
  getHeightForWhitespaceIndex(index) {
    index = index | 0;
    return this._arr[index].height;
  }
};
_LinesLayout.INSTANCE_COUNT = 0;
let LinesLayout = _LinesLayout;
export {
  EditorWhitespace,
  LinesLayout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdmlld0xheW91dC9saW5lc0xheW91dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElFZGl0b3JXaGl0ZXNwYWNlLCBJUGFydGlhbFZpZXdMaW5lc1ZpZXdwb3J0RGF0YSwgSUxpbmVIZWlnaHRDaGFuZ2VBY2Nlc3NvciwgSVZpZXdXaGl0ZXNwYWNlVmlld3BvcnREYXRhLCBJV2hpdGVzcGFjZUNoYW5nZUFjY2Vzc29yIH0gZnJvbSAnLi4vdmlld01vZGVsLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDdXN0b21MaW5lSGVpZ2h0RGF0YSwgTGluZUhlaWdodHNNYW5hZ2VyIH0gZnJvbSAnLi9saW5lSGVpZ2h0cy5qcyc7XG5cbmludGVyZmFjZSBJUGVuZGluZ0NoYW5nZSB7IGlkOiBzdHJpbmc7IG5ld0FmdGVyTGluZU51bWJlcjogbnVtYmVyOyBuZXdIZWlnaHQ6IG51bWJlciB9XG5pbnRlcmZhY2UgSVBlbmRpbmdSZW1vdmUgeyBpZDogc3RyaW5nIH1cblxuY2xhc3MgUGVuZGluZ0NoYW5nZXMge1xuXHRwcml2YXRlIF9oYXNQZW5kaW5nOiBib29sZWFuO1xuXHRwcml2YXRlIF9pbnNlcnRzOiBFZGl0b3JXaGl0ZXNwYWNlW107XG5cdHByaXZhdGUgX2NoYW5nZXM6IElQZW5kaW5nQ2hhbmdlW107XG5cdHByaXZhdGUgX3JlbW92ZXM6IElQZW5kaW5nUmVtb3ZlW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5faGFzUGVuZGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2luc2VydHMgPSBbXTtcblx0XHR0aGlzLl9jaGFuZ2VzID0gW107XG5cdFx0dGhpcy5fcmVtb3ZlcyA9IFtdO1xuXHR9XG5cblx0cHVibGljIGluc2VydCh4OiBFZGl0b3JXaGl0ZXNwYWNlKTogdm9pZCB7XG5cdFx0dGhpcy5faGFzUGVuZGluZyA9IHRydWU7XG5cdFx0dGhpcy5faW5zZXJ0cy5wdXNoKHgpO1xuXHR9XG5cblx0cHVibGljIGNoYW5nZSh4OiBJUGVuZGluZ0NoYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX2hhc1BlbmRpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX2NoYW5nZXMucHVzaCh4KTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmUoeDogSVBlbmRpbmdSZW1vdmUpOiB2b2lkIHtcblx0XHR0aGlzLl9oYXNQZW5kaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9yZW1vdmVzLnB1c2goeCk7XG5cdH1cblxuXHRwdWJsaWMgY29tbWl0KGxpbmVzTGF5b3V0OiBMaW5lc0xheW91dCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGFzUGVuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc2VydHMgPSB0aGlzLl9pbnNlcnRzO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLl9jaGFuZ2VzO1xuXHRcdGNvbnN0IHJlbW92ZXMgPSB0aGlzLl9yZW1vdmVzO1xuXG5cdFx0dGhpcy5faGFzUGVuZGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2luc2VydHMgPSBbXTtcblx0XHR0aGlzLl9jaGFuZ2VzID0gW107XG5cdFx0dGhpcy5fcmVtb3ZlcyA9IFtdO1xuXG5cdFx0bGluZXNMYXlvdXQuX2NvbW1pdFBlbmRpbmdDaGFuZ2VzKGluc2VydHMsIGNoYW5nZXMsIHJlbW92ZXMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JXaGl0ZXNwYWNlIGltcGxlbWVudHMgSUVkaXRvcldoaXRlc3BhY2Uge1xuXHRwdWJsaWMgaWQ6IHN0cmluZztcblx0cHVibGljIGFmdGVyTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgb3JkaW5hbDogbnVtYmVyO1xuXHRwdWJsaWMgaGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyBtaW5XaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcHJlZml4U3VtOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgYWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXIsIG9yZGluYWw6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIG1pbldpZHRoOiBudW1iZXIpIHtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5hZnRlckxpbmVOdW1iZXIgPSBhZnRlckxpbmVOdW1iZXI7XG5cdFx0dGhpcy5vcmRpbmFsID0gb3JkaW5hbDtcblx0XHR0aGlzLmhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLm1pbldpZHRoID0gbWluV2lkdGg7XG5cdFx0dGhpcy5wcmVmaXhTdW0gPSAwO1xuXHR9XG59XG5cbi8qKlxuICogTGF5b3V0aW5nIG9mIG9iamVjdHMgdGhhdCB0YWtlIHZlcnRpY2FsIHNwYWNlIChieSBoYXZpbmcgYSBoZWlnaHQpIGFuZCBwdXNoIGRvd24gb3RoZXIgb2JqZWN0cy5cbiAqXG4gKiBUaGVzZSBvYmplY3RzIGFyZSBiYXNpY2FsbHkgZWl0aGVyIHRleHQgKGxpbmVzKSBvciBzcGFjZXMgYmV0d2VlbiB0aG9zZSBsaW5lcyAod2hpdGVzcGFjZXMpLlxuICogVGhpcyBwcm92aWRlcyBjb21tb2RpdHkgb3BlcmF0aW9ucyBmb3Igd29ya2luZyB3aXRoIGxpbmVzIHRoYXQgY29udGFpbiB3aGl0ZXNwYWNlIHRoYXQgcHVzaGVzIGxpbmVzIGxvd2VyICh2ZXJ0aWNhbGx5KS5cbiAqL1xuZXhwb3J0IGNsYXNzIExpbmVzTGF5b3V0IHtcblxuXHRwcml2YXRlIHN0YXRpYyBJTlNUQU5DRV9DT1VOVCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFuY2VJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2hhbmdlczogUGVuZGluZ0NoYW5nZXM7XG5cdHByaXZhdGUgX2xhc3RXaGl0ZXNwYWNlSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfYXJyOiBFZGl0b3JXaGl0ZXNwYWNlW107XG5cdHByaXZhdGUgX3ByZWZpeFN1bVZhbGlkSW5kZXg6IG51bWJlcjtcblx0cHJpdmF0ZSBfbWluV2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfbGluZUNvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgX3BhZGRpbmdUb3A6IG51bWJlcjtcblx0cHJpdmF0ZSBfcGFkZGluZ0JvdHRvbTogbnVtYmVyO1xuXHRwcml2YXRlIF9saW5lSGVpZ2h0c01hbmFnZXI6IExpbmVIZWlnaHRzTWFuYWdlcjtcblxuXHRjb25zdHJ1Y3RvcihsaW5lQ291bnQ6IG51bWJlciwgZGVmYXVsdExpbmVIZWlnaHQ6IG51bWJlciwgcGFkZGluZ1RvcDogbnVtYmVyLCBwYWRkaW5nQm90dG9tOiBudW1iZXIsIGN1c3RvbUxpbmVIZWlnaHREYXRhOiBDdXN0b21MaW5lSGVpZ2h0RGF0YVtdKSB7XG5cdFx0dGhpcy5faW5zdGFuY2VJZCA9IHN0cmluZ3Muc2luZ2xlTGV0dGVySGFzaCgrK0xpbmVzTGF5b3V0LklOU1RBTkNFX0NPVU5UKTtcblx0XHR0aGlzLl9wZW5kaW5nQ2hhbmdlcyA9IG5ldyBQZW5kaW5nQ2hhbmdlcygpO1xuXHRcdHRoaXMuX2xhc3RXaGl0ZXNwYWNlSWQgPSAwO1xuXHRcdHRoaXMuX2FyciA9IFtdO1xuXHRcdHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXggPSAtMTtcblx0XHR0aGlzLl9taW5XaWR0aCA9IC0xOyAvKiBtYXJrZXIgZm9yIG5vdCBiZWluZyBjb21wdXRlZCAqL1xuXHRcdHRoaXMuX2xpbmVDb3VudCA9IGxpbmVDb3VudDtcblx0XHR0aGlzLl9wYWRkaW5nVG9wID0gcGFkZGluZ1RvcDtcblx0XHR0aGlzLl9wYWRkaW5nQm90dG9tID0gcGFkZGluZ0JvdHRvbTtcblx0XHR0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKGRlZmF1bHRMaW5lSGVpZ2h0LCBjdXN0b21MaW5lSGVpZ2h0RGF0YSk7XG5cdH1cblxuXHQvKipcblx0ICogRmluZCB0aGUgaW5zZXJ0aW9uIGluZGV4IGZvciBhIG5ldyB2YWx1ZSBpbnNpZGUgYSBzb3J0ZWQgYXJyYXkgb2YgdmFsdWVzLlxuXHQgKiBJZiB0aGUgdmFsdWUgaXMgYWxyZWFkeSBwcmVzZW50IGluIHRoZSBzb3J0ZWQgYXJyYXksIHRoZSBpbnNlcnRpb24gaW5kZXggd2lsbCBiZSBhZnRlciB0aGUgYWxyZWFkeSBleGlzdGluZyB2YWx1ZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgZmluZEluc2VydGlvbkluZGV4KGFycjogRWRpdG9yV2hpdGVzcGFjZVtdLCBhZnRlckxpbmVOdW1iZXI6IG51bWJlciwgb3JkaW5hbDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgbG93ID0gMDtcblx0XHRsZXQgaGlnaCA9IGFyci5sZW5ndGg7XG5cblx0XHR3aGlsZSAobG93IDwgaGlnaCkge1xuXHRcdFx0Y29uc3QgbWlkID0gKChsb3cgKyBoaWdoKSA+Pj4gMSk7XG5cblx0XHRcdGlmIChhZnRlckxpbmVOdW1iZXIgPT09IGFyclttaWRdLmFmdGVyTGluZU51bWJlcikge1xuXHRcdFx0XHRpZiAob3JkaW5hbCA8IGFyclttaWRdLm9yZGluYWwpIHtcblx0XHRcdFx0XHRoaWdoID0gbWlkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoYWZ0ZXJMaW5lTnVtYmVyIDwgYXJyW21pZF0uYWZ0ZXJMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGhpZ2ggPSBtaWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb3cgPSBtaWQgKyAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsb3c7XG5cdH1cblxuXHQvKipcblx0ICogQ2hhbmdlIHRoZSBoZWlnaHQgb2YgYSBsaW5lIGluIHBpeGVscy5cblx0ICovXG5cdHB1YmxpYyBzZXREZWZhdWx0TGluZUhlaWdodChsaW5lSGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuZGVmYXVsdExpbmVIZWlnaHQgPSBsaW5lSGVpZ2h0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENoYW5nZXMgdGhlIHBhZGRpbmcgdXNlZCB0byBjYWxjdWxhdGUgdmVydGljYWwgb2Zmc2V0cy5cblx0ICovXG5cdHB1YmxpYyBzZXRQYWRkaW5nKHBhZGRpbmdUb3A6IG51bWJlciwgcGFkZGluZ0JvdHRvbTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFkZGluZ1RvcCA9IHBhZGRpbmdUb3A7XG5cdFx0dGhpcy5fcGFkZGluZ0JvdHRvbSA9IHBhZGRpbmdCb3R0b207XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBudW1iZXIgb2YgbGluZXMuXG5cdCAqXG5cdCAqIEBwYXJhbSBsaW5lQ291bnQgTmV3IG51bWJlciBvZiBsaW5lcy5cblx0ICovXG5cdHB1YmxpYyBvbkZsdXNoZWQobGluZUNvdW50OiBudW1iZXIsIGN1c3RvbUxpbmVIZWlnaHREYXRhOiBDdXN0b21MaW5lSGVpZ2h0RGF0YVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fbGluZUNvdW50ID0gbGluZUNvdW50O1xuXHRcdHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIodGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmRlZmF1bHRMaW5lSGVpZ2h0LCBjdXN0b21MaW5lSGVpZ2h0RGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgY2hhbmdlTGluZUhlaWdodHMoY2FsbGJhY2s6IChhY2Nlc3NvcjogSUxpbmVIZWlnaHRDaGFuZ2VBY2Nlc3NvcikgPT4gdm9pZCk6IGJvb2xlYW4ge1xuXHRcdGxldCBoYWRBQ2hhbmdlID0gZmFsc2U7XG5cdFx0Y29uc3QgYWNjZXNzb3I6IElMaW5lSGVpZ2h0Q2hhbmdlQWNjZXNzb3IgPSB7XG5cdFx0XHRpbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQ6IChkZWNvcmF0aW9uSWQ6IHN0cmluZywgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyKTogdm9pZCA9PiB7XG5cdFx0XHRcdGhhZEFDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KGRlY29yYXRpb25JZCwgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyLCBsaW5lSGVpZ2h0KTtcblx0XHRcdH0sXG5cdFx0XHRyZW1vdmVDdXN0b21MaW5lSGVpZ2h0OiAoZGVjb3JhdGlvbklkOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdFx0aGFkQUNoYW5nZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KGRlY29yYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjYWxsYmFjayhhY2Nlc3Nvcik7XG5cdFx0cmV0dXJuIGhhZEFDaGFuZ2U7XG5cdH1cblxuXHRwdWJsaWMgY2hhbmdlV2hpdGVzcGFjZShjYWxsYmFjazogKGFjY2Vzc29yOiBJV2hpdGVzcGFjZUNoYW5nZUFjY2Vzc29yKSA9PiB2b2lkKTogYm9vbGVhbiB7XG5cdFx0bGV0IGhhZEFDaGFuZ2UgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjZXNzb3I6IElXaGl0ZXNwYWNlQ2hhbmdlQWNjZXNzb3IgPSB7XG5cdFx0XHRcdGluc2VydFdoaXRlc3BhY2U6IChhZnRlckxpbmVOdW1iZXI6IG51bWJlciwgb3JkaW5hbDogbnVtYmVyLCBoZWlnaHRJblB4OiBudW1iZXIsIG1pbldpZHRoOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRcdGhhZEFDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdGFmdGVyTGluZU51bWJlciA9IGFmdGVyTGluZU51bWJlciB8IDA7XG5cdFx0XHRcdFx0b3JkaW5hbCA9IG9yZGluYWwgfCAwO1xuXHRcdFx0XHRcdGhlaWdodEluUHggPSBoZWlnaHRJblB4IHwgMDtcblx0XHRcdFx0XHRtaW5XaWR0aCA9IG1pbldpZHRoIHwgMDtcblx0XHRcdFx0XHRjb25zdCBpZCA9IHRoaXMuX2luc3RhbmNlSWQgKyAoKyt0aGlzLl9sYXN0V2hpdGVzcGFjZUlkKTtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2hhbmdlcy5pbnNlcnQobmV3IEVkaXRvcldoaXRlc3BhY2UoaWQsIGFmdGVyTGluZU51bWJlciwgb3JkaW5hbCwgaGVpZ2h0SW5QeCwgbWluV2lkdGgpKTtcblx0XHRcdFx0XHRyZXR1cm4gaWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNoYW5nZU9uZVdoaXRlc3BhY2U6IChpZDogc3RyaW5nLCBuZXdBZnRlckxpbmVOdW1iZXI6IG51bWJlciwgbmV3SGVpZ2h0OiBudW1iZXIpOiB2b2lkID0+IHtcblx0XHRcdFx0XHRoYWRBQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHRuZXdBZnRlckxpbmVOdW1iZXIgPSBuZXdBZnRlckxpbmVOdW1iZXIgfCAwO1xuXHRcdFx0XHRcdG5ld0hlaWdodCA9IG5ld0hlaWdodCB8IDA7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMuY2hhbmdlKHsgaWQsIG5ld0FmdGVyTGluZU51bWJlciwgbmV3SGVpZ2h0IH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW1vdmVXaGl0ZXNwYWNlOiAoaWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdFx0XHRcdGhhZEFDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzLnJlbW92ZSh7IGlkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y2FsbGJhY2soYWNjZXNzb3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ2hhbmdlcy5jb21taXQodGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiBoYWRBQ2hhbmdlO1xuXHR9XG5cblx0cHVibGljIF9jb21taXRQZW5kaW5nQ2hhbmdlcyhpbnNlcnRzOiBFZGl0b3JXaGl0ZXNwYWNlW10sIGNoYW5nZXM6IElQZW5kaW5nQ2hhbmdlW10sIHJlbW92ZXM6IElQZW5kaW5nUmVtb3ZlW10pOiB2b2lkIHtcblx0XHRpZiAoaW5zZXJ0cy5sZW5ndGggPiAwIHx8IHJlbW92ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbWluV2lkdGggPSAtMTsgLyogbWFya2VyIGZvciBub3QgYmVpbmcgY29tcHV0ZWQgKi9cblx0XHR9XG5cblx0XHRpZiAoaW5zZXJ0cy5sZW5ndGggKyBjaGFuZ2VzLmxlbmd0aCArIHJlbW92ZXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdC8vIHdoZW4gb25seSBvbmUgdGhpbmcgaGFwcGVuZWQsIGhhbmRsZSBpdCBcImRlbGljYXRlbHlcIlxuXHRcdFx0Zm9yIChjb25zdCBpbnNlcnQgb2YgaW5zZXJ0cykge1xuXHRcdFx0XHR0aGlzLl9pbnNlcnRXaGl0ZXNwYWNlKGluc2VydCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdHRoaXMuX2NoYW5nZU9uZVdoaXRlc3BhY2UoY2hhbmdlLmlkLCBjaGFuZ2UubmV3QWZ0ZXJMaW5lTnVtYmVyLCBjaGFuZ2UubmV3SGVpZ2h0KTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgcmVtb3ZlIG9mIHJlbW92ZXMpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9maW5kV2hpdGVzcGFjZUluZGV4KHJlbW92ZS5pZCk7XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZW1vdmVXaGl0ZXNwYWNlKGluZGV4KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBzaW1wbHkgcmVidWlsZCB0aGUgZW50aXJlIGRhdGFzdHJ1Y3R1cmVcblxuXHRcdGNvbnN0IHRvUmVtb3ZlID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCByZW1vdmUgb2YgcmVtb3Zlcykge1xuXHRcdFx0dG9SZW1vdmUuYWRkKHJlbW92ZS5pZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9DaGFuZ2UgPSBuZXcgTWFwPHN0cmluZywgSVBlbmRpbmdDaGFuZ2U+KCk7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdFx0dG9DaGFuZ2Uuc2V0KGNoYW5nZS5pZCwgY2hhbmdlKTtcblx0XHR9XG5cblx0XHRjb25zdCBhcHBseVJlbW92ZUFuZENoYW5nZSA9ICh3aGl0ZXNwYWNlczogRWRpdG9yV2hpdGVzcGFjZVtdKTogRWRpdG9yV2hpdGVzcGFjZVtdID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogRWRpdG9yV2hpdGVzcGFjZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHdoaXRlc3BhY2Ugb2Ygd2hpdGVzcGFjZXMpIHtcblx0XHRcdFx0aWYgKHRvUmVtb3ZlLmhhcyh3aGl0ZXNwYWNlLmlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b0NoYW5nZS5oYXMod2hpdGVzcGFjZS5pZCkpIHtcblx0XHRcdFx0XHRjb25zdCBjaGFuZ2UgPSB0b0NoYW5nZS5nZXQod2hpdGVzcGFjZS5pZCkhO1xuXHRcdFx0XHRcdHdoaXRlc3BhY2UuYWZ0ZXJMaW5lTnVtYmVyID0gY2hhbmdlLm5ld0FmdGVyTGluZU51bWJlcjtcblx0XHRcdFx0XHR3aGl0ZXNwYWNlLmhlaWdodCA9IGNoYW5nZS5uZXdIZWlnaHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2god2hpdGVzcGFjZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhcHBseVJlbW92ZUFuZENoYW5nZSh0aGlzLl9hcnIpLmNvbmNhdChhcHBseVJlbW92ZUFuZENoYW5nZShpbnNlcnRzKSk7XG5cdFx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLmFmdGVyTGluZU51bWJlciA9PT0gYi5hZnRlckxpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuIGEub3JkaW5hbCAtIGIub3JkaW5hbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLmFmdGVyTGluZU51bWJlciAtIGIuYWZ0ZXJMaW5lTnVtYmVyO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fYXJyID0gcmVzdWx0O1xuXHRcdHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXggPSAtMTtcblx0fVxuXG5cdHByaXZhdGUgX2luc2VydFdoaXRlc3BhY2Uod2hpdGVzcGFjZTogRWRpdG9yV2hpdGVzcGFjZSk6IHZvaWQge1xuXHRcdGNvbnN0IGluc2VydEluZGV4ID0gTGluZXNMYXlvdXQuZmluZEluc2VydGlvbkluZGV4KHRoaXMuX2Fyciwgd2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIsIHdoaXRlc3BhY2Uub3JkaW5hbCk7XG5cdFx0dGhpcy5fYXJyLnNwbGljZShpbnNlcnRJbmRleCwgMCwgd2hpdGVzcGFjZSk7XG5cdFx0dGhpcy5fcHJlZml4U3VtVmFsaWRJbmRleCA9IE1hdGgubWluKHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXgsIGluc2VydEluZGV4IC0gMSk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kV2hpdGVzcGFjZUluZGV4KGlkOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGNvbnN0IGFyciA9IHRoaXMuX2Fycjtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoYXJyW2ldLmlkID09PSBpZCkge1xuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hhbmdlT25lV2hpdGVzcGFjZShpZDogc3RyaW5nLCBuZXdBZnRlckxpbmVOdW1iZXI6IG51bWJlciwgbmV3SGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2ZpbmRXaGl0ZXNwYWNlSW5kZXgoaWQpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FycltpbmRleF0uaGVpZ2h0ICE9PSBuZXdIZWlnaHQpIHtcblx0XHRcdHRoaXMuX2FycltpbmRleF0uaGVpZ2h0ID0gbmV3SGVpZ2h0O1xuXHRcdFx0dGhpcy5fcHJlZml4U3VtVmFsaWRJbmRleCA9IE1hdGgubWluKHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXgsIGluZGV4IC0gMSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hcnJbaW5kZXhdLmFmdGVyTGluZU51bWJlciAhPT0gbmV3QWZ0ZXJMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBgYWZ0ZXJMaW5lTnVtYmVyYCBjaGFuZ2VkIGZvciB0aGlzIHdoaXRlc3BhY2VcblxuXHRcdFx0Ly8gUmVjb3JkIG9sZCB3aGl0ZXNwYWNlXG5cdFx0XHRjb25zdCB3aGl0ZXNwYWNlID0gdGhpcy5fYXJyW2luZGV4XTtcblxuXHRcdFx0Ly8gU2luY2UgY2hhbmdpbmcgYGFmdGVyTGluZU51bWJlcmAgY2FuIHRyaWdnZXIgYSByZW9yZGVyaW5nLCB3ZSdyZSBnb25uYSByZW1vdmUgdGhpcyB3aGl0ZXNwYWNlXG5cdFx0XHR0aGlzLl9yZW1vdmVXaGl0ZXNwYWNlKGluZGV4KTtcblxuXHRcdFx0d2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIgPSBuZXdBZnRlckxpbmVOdW1iZXI7XG5cblx0XHRcdC8vIEFuZCBhZGQgaXQgYWdhaW5cblx0XHRcdHRoaXMuX2luc2VydFdoaXRlc3BhY2Uod2hpdGVzcGFjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlV2hpdGVzcGFjZShyZW1vdmVJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYXJyLnNwbGljZShyZW1vdmVJbmRleCwgMSk7XG5cdFx0dGhpcy5fcHJlZml4U3VtVmFsaWRJbmRleCA9IE1hdGgubWluKHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXgsIHJlbW92ZUluZGV4IC0gMSk7XG5cdH1cblxuXHQvKipcblx0ICogTm90aWZ5IHRoZSBsYXlvdXRlciB0aGF0IGxpbmVzIGhhdmUgYmVlbiBkZWxldGVkIChhIGNvbnRpbnVvdXMgem9uZSBvZiBsaW5lcykuXG5cdCAqXG5cdCAqIEBwYXJhbSBmcm9tTGluZU51bWJlciBUaGUgbGluZSBudW1iZXIgYXQgd2hpY2ggdGhlIGRlbGV0aW9uIHN0YXJ0ZWQsIGluY2x1c2l2ZVxuXHQgKiBAcGFyYW0gdG9MaW5lTnVtYmVyIFRoZSBsaW5lIG51bWJlciBhdCB3aGljaCB0aGUgZGVsZXRpb24gZW5kZWQsIGluY2x1c2l2ZVxuXHQgKi9cblx0cHVibGljIG9uTGluZXNEZWxldGVkKGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0ZnJvbUxpbmVOdW1iZXIgPSBmcm9tTGluZU51bWJlciB8IDA7XG5cdFx0dG9MaW5lTnVtYmVyID0gdG9MaW5lTnVtYmVyIHwgMDtcblxuXHRcdHRoaXMuX2xpbmVDb3VudCAtPSAodG9MaW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIgKyAxKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBhZnRlckxpbmVOdW1iZXIgPSB0aGlzLl9hcnJbaV0uYWZ0ZXJMaW5lTnVtYmVyO1xuXG5cdFx0XHRpZiAoZnJvbUxpbmVOdW1iZXIgPD0gYWZ0ZXJMaW5lTnVtYmVyICYmIGFmdGVyTGluZU51bWJlciA8PSB0b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gVGhlIGxpbmUgdGhpcyB3aGl0ZXNwYWNlIHdhcyBhZnRlciBoYXMgYmVlbiBkZWxldGVkXG5cdFx0XHRcdC8vICA9PiBtb3ZlIHdoaXRlc3BhY2UgdG8gYmVmb3JlIGZpcnN0IGRlbGV0ZWQgbGluZVxuXHRcdFx0XHR0aGlzLl9hcnJbaV0uYWZ0ZXJMaW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXIgLSAxO1xuXHRcdFx0fSBlbHNlIGlmIChhZnRlckxpbmVOdW1iZXIgPiB0b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gVGhlIGxpbmUgdGhpcyB3aGl0ZXNwYWNlIHdhcyBhZnRlciBoYXMgYmVlbiBtb3ZlZCB1cFxuXHRcdFx0XHQvLyAgPT4gbW92ZSB3aGl0ZXNwYWNlIHVwXG5cdFx0XHRcdHRoaXMuX2FycltpXS5hZnRlckxpbmVOdW1iZXIgLT0gKHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyICsgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5vbkxpbmVzRGVsZXRlZChmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RpZnkgdGhlIGxheW91dGVyIHRoYXQgbGluZXMgaGF2ZSBiZWVuIGluc2VydGVkIChhIGNvbnRpbnVvdXMgem9uZSBvZiBsaW5lcykuXG5cdCAqXG5cdCAqIEBwYXJhbSBmcm9tTGluZU51bWJlciBUaGUgbGluZSBudW1iZXIgYXQgd2hpY2ggdGhlIGluc2VydGlvbiBzdGFydGVkLCBpbmNsdXNpdmVcblx0ICogQHBhcmFtIHRvTGluZU51bWJlciBUaGUgbGluZSBudW1iZXIgYXQgd2hpY2ggdGhlIGluc2VydGlvbiBlbmRlZCwgaW5jbHVzaXZlLlxuXHQgKi9cblx0cHVibGljIG9uTGluZXNJbnNlcnRlZChmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGZyb21MaW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXIgfCAwO1xuXHRcdHRvTGluZU51bWJlciA9IHRvTGluZU51bWJlciB8IDA7XG5cblx0XHR0aGlzLl9saW5lQ291bnQgKz0gKHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyICsgMSk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2Fyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgYWZ0ZXJMaW5lTnVtYmVyID0gdGhpcy5fYXJyW2ldLmFmdGVyTGluZU51bWJlcjtcblxuXHRcdFx0aWYgKGZyb21MaW5lTnVtYmVyIDw9IGFmdGVyTGluZU51bWJlcikge1xuXHRcdFx0XHR0aGlzLl9hcnJbaV0uYWZ0ZXJMaW5lTnVtYmVyICs9ICh0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIub25MaW5lc0luc2VydGVkKGZyb21MaW5lTnVtYmVyLCB0b0xpbmVOdW1iZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgc3VtIG9mIGFsbCB0aGUgd2hpdGVzcGFjZXMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0V2hpdGVzcGFjZXNUb3RhbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9hcnIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V2hpdGVzcGFjZXNBY2N1bXVsYXRlZEhlaWdodCh0aGlzLl9hcnIubGVuZ3RoIC0gMSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBzdW0gb2YgdGhlIGhlaWdodHMgb2YgdGhlIHdoaXRlc3BhY2VzIGF0IFswLi5pbmRleF0uXG5cdCAqIFRoaXMgaW5jbHVkZXMgdGhlIHdoaXRlc3BhY2UgYXQgYGluZGV4YC5cblx0ICpcblx0ICogQHBhcmFtIGluZGV4IFRoZSBpbmRleCBvZiB0aGUgd2hpdGVzcGFjZS5cblx0ICogQHJldHVybiBUaGUgc3VtIG9mIHRoZSBoZWlnaHRzIG9mIGFsbCB3aGl0ZXNwYWNlcyBiZWZvcmUgdGhlIG9uZSBhdCBgaW5kZXhgLCBpbmNsdWRpbmcgdGhlIG9uZSBhdCBgaW5kZXhgLlxuXHQgKi9cblx0cHVibGljIGdldFdoaXRlc3BhY2VzQWNjdW11bGF0ZWRIZWlnaHQoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aW5kZXggPSBpbmRleCB8IDA7XG5cblx0XHRsZXQgc3RhcnRJbmRleCA9IE1hdGgubWF4KDAsIHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXggKyAxKTtcblx0XHRpZiAoc3RhcnRJbmRleCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fYXJyWzBdLnByZWZpeFN1bSA9IHRoaXMuX2FyclswXS5oZWlnaHQ7XG5cdFx0XHRzdGFydEluZGV4Kys7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0SW5kZXg7IGkgPD0gaW5kZXg7IGkrKykge1xuXHRcdFx0dGhpcy5fYXJyW2ldLnByZWZpeFN1bSA9IHRoaXMuX2FycltpIC0gMV0ucHJlZml4U3VtICsgdGhpcy5fYXJyW2ldLmhlaWdodDtcblx0XHR9XG5cdFx0dGhpcy5fcHJlZml4U3VtVmFsaWRJbmRleCA9IE1hdGgubWF4KHRoaXMuX3ByZWZpeFN1bVZhbGlkSW5kZXgsIGluZGV4KTtcblx0XHRyZXR1cm4gdGhpcy5fYXJyW2luZGV4XS5wcmVmaXhTdW07XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBzdW0gb2YgaGVpZ2h0cyBmb3IgYWxsIG9iamVjdHMuXG5cdCAqXG5cdCAqIEByZXR1cm4gVGhlIHN1bSBvZiBoZWlnaHRzIGZvciBhbGwgb2JqZWN0cy5cblx0ICovXG5cdHB1YmxpYyBnZXRMaW5lc1RvdGFsSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgbGluZXNIZWlnaHQgPSB0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIodGhpcy5fbGluZUNvdW50KTtcblx0XHRjb25zdCB3aGl0ZXNwYWNlc0hlaWdodCA9IHRoaXMuZ2V0V2hpdGVzcGFjZXNUb3RhbEhlaWdodCgpO1xuXG5cdFx0cmV0dXJuIGxpbmVzSGVpZ2h0ICsgd2hpdGVzcGFjZXNIZWlnaHQgKyB0aGlzLl9wYWRkaW5nVG9wICsgdGhpcy5fcGFkZGluZ0JvdHRvbTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhY2N1bXVsYXRlZCBoZWlnaHQgb2Ygd2hpdGVzcGFjZXMgYmVmb3JlIHRoZSBnaXZlbiBsaW5lIG51bWJlci5cblx0ICpcblx0ICogQHBhcmFtIGxpbmVOdW1iZXIgVGhlIGxpbmUgbnVtYmVyXG5cdCAqL1xuXHRwdWJsaWMgZ2V0V2hpdGVzcGFjZUFjY3VtdWxhdGVkSGVpZ2h0QmVmb3JlTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIHwgMDtcblxuXHRcdGNvbnN0IGxhc3RXaGl0ZXNwYWNlQmVmb3JlTGluZU51bWJlciA9IHRoaXMuX2ZpbmRMYXN0V2hpdGVzcGFjZUJlZm9yZUxpbmVOdW1iZXIobGluZU51bWJlcik7XG5cblx0XHRpZiAobGFzdFdoaXRlc3BhY2VCZWZvcmVMaW5lTnVtYmVyID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0V2hpdGVzcGFjZXNBY2N1bXVsYXRlZEhlaWdodChsYXN0V2hpdGVzcGFjZUJlZm9yZUxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZExhc3RXaGl0ZXNwYWNlQmVmb3JlTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIHwgMDtcblxuXHRcdC8vIEZpbmQgdGhlIHdoaXRlc3BhY2UgYmVmb3JlIGxpbmUgbnVtYmVyXG5cdFx0Y29uc3QgYXJyID0gdGhpcy5fYXJyO1xuXHRcdGxldCBsb3cgPSAwO1xuXHRcdGxldCBoaWdoID0gYXJyLmxlbmd0aCAtIDE7XG5cblx0XHR3aGlsZSAobG93IDw9IGhpZ2gpIHtcblx0XHRcdGNvbnN0IGRlbHRhID0gKGhpZ2ggLSBsb3cpIHwgMDtcblx0XHRcdGNvbnN0IGhhbGZEZWx0YSA9IChkZWx0YSAvIDIpIHwgMDtcblx0XHRcdGNvbnN0IG1pZCA9IChsb3cgKyBoYWxmRGVsdGEpIHwgMDtcblxuXHRcdFx0aWYgKGFyclttaWRdLmFmdGVyTGluZU51bWJlciA8IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0aWYgKG1pZCArIDEgPj0gYXJyLmxlbmd0aCB8fCBhcnJbbWlkICsgMV0uYWZ0ZXJMaW5lTnVtYmVyID49IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gbWlkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxvdyA9IChtaWQgKyAxKSB8IDA7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhpZ2ggPSAobWlkIC0gMSkgfCAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRGaXJzdFdoaXRlc3BhY2VBZnRlckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsaW5lTnVtYmVyID0gbGluZU51bWJlciB8IDA7XG5cblx0XHRjb25zdCBsYXN0V2hpdGVzcGFjZUJlZm9yZUxpbmVOdW1iZXIgPSB0aGlzLl9maW5kTGFzdFdoaXRlc3BhY2VCZWZvcmVMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGZpcnN0V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlciA9IGxhc3RXaGl0ZXNwYWNlQmVmb3JlTGluZU51bWJlciArIDE7XG5cblx0XHRpZiAoZmlyc3RXaGl0ZXNwYWNlQWZ0ZXJMaW5lTnVtYmVyIDwgdGhpcy5fYXJyLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZpcnN0V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHQvKipcblx0ICogRmluZCB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IHdoaXRlc3BhY2Ugd2hpY2ggaGFzIGBhZnRlckxpbmVOdW1iZXJgID49IGBsaW5lTnVtYmVyYC5cblx0ICogQHJldHVybiBUaGUgaW5kZXggb2YgdGhlIGZpcnN0IHdoaXRlc3BhY2Ugd2l0aCBgYWZ0ZXJMaW5lTnVtYmVyYCA+PSBgbGluZU51bWJlcmAgb3IgLTEgaWYgbm8gd2hpdGVzcGFjZSBpcyBmb3VuZC5cblx0ICovXG5cdHB1YmxpYyBnZXRGaXJzdFdoaXRlc3BhY2VJbmRleEFmdGVyTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIHwgMDtcblxuXHRcdHJldHVybiB0aGlzLl9maW5kRmlyc3RXaGl0ZXNwYWNlQWZ0ZXJMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgdmVydGljYWwgb2Zmc2V0ICh0aGUgc3VtIG9mIGhlaWdodHMgZm9yIGFsbCBvYmplY3RzIGFib3ZlKSBhIGNlcnRhaW4gbGluZSBudW1iZXIuXG5cdCAqXG5cdCAqIEBwYXJhbSBsaW5lTnVtYmVyIFRoZSBsaW5lIG51bWJlclxuXHQgKiBAcmV0dXJuIFRoZSBzdW0gb2YgaGVpZ2h0cyBmb3IgYWxsIG9iamVjdHMgYWJvdmUgYGxpbmVOdW1iZXJgLlxuXHQgKi9cblx0cHVibGljIGdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIsIGluY2x1ZGVWaWV3Wm9uZXMgPSBmYWxzZSk6IG51bWJlciB7XG5cdFx0bGluZU51bWJlciA9IGxpbmVOdW1iZXIgfCAwO1xuXG5cdFx0bGV0IHByZXZpb3VzTGluZXNIZWlnaHQ6IG51bWJlcjtcblx0XHRpZiAobGluZU51bWJlciA+IDEpIHtcblx0XHRcdHByZXZpb3VzTGluZXNIZWlnaHQgPSB0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIobGluZU51bWJlciAtIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcmV2aW91c0xpbmVzSGVpZ2h0ID0gMDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c1doaXRlc3BhY2VzSGVpZ2h0ID0gdGhpcy5nZXRXaGl0ZXNwYWNlQWNjdW11bGF0ZWRIZWlnaHRCZWZvcmVMaW5lTnVtYmVyKGxpbmVOdW1iZXIgLSAoaW5jbHVkZVZpZXdab25lcyA/IDEgOiAwKSk7XG5cblx0XHRyZXR1cm4gcHJldmlvdXNMaW5lc0hlaWdodCArIHByZXZpb3VzV2hpdGVzcGFjZXNIZWlnaHQgKyB0aGlzLl9wYWRkaW5nVG9wO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgdmVydGljYWwgb2Zmc2V0ICh0aGUgc3VtIG9mIGhlaWdodHMgZm9yIGFsbCBvYmplY3RzIGFib3ZlKSBhIGNlcnRhaW4gbGluZSBudW1iZXIgYW5kIGFsc28gdGhlIGxpbmUgaGVpZ2h0IG9mIHRoZSBsaW5lLlxuXHQgKlxuXHQgKiBAcGFyYW0gbGluZU51bWJlciBUaGUgbGluZSBudW1iZXJcblx0ICogQHJldHVybiBUaGUgc3VtIG9mIGhlaWdodHMgZm9yIGFsbCBvYmplY3RzIGFib3ZlIGBsaW5lTnVtYmVyYC5cblx0ICovXG5cdHB1YmxpYyBnZXRWZXJ0aWNhbE9mZnNldEFmdGVyTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIsIGluY2x1ZGVWaWV3Wm9uZXMgPSBmYWxzZSk6IG51bWJlciB7XG5cdFx0bGluZU51bWJlciA9IGxpbmVOdW1iZXIgfCAwO1xuXHRcdGNvbnN0IHByZXZpb3VzTGluZXNIZWlnaHQgPSB0aGlzLl9saW5lSGVpZ2h0c01hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdFx0Y29uc3QgcHJldmlvdXNXaGl0ZXNwYWNlc0hlaWdodCA9IHRoaXMuZ2V0V2hpdGVzcGFjZUFjY3VtdWxhdGVkSGVpZ2h0QmVmb3JlTGluZU51bWJlcihsaW5lTnVtYmVyICsgKGluY2x1ZGVWaWV3Wm9uZXMgPyAxIDogMCkpO1xuXHRcdHJldHVybiBwcmV2aW91c0xpbmVzSGVpZ2h0ICsgcHJldmlvdXNXaGl0ZXNwYWNlc0hlaWdodCArIHRoaXMuX3BhZGRpbmdUb3A7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBpZiB0aGVyZSBpcyBhbnkgd2hpdGVzcGFjZSBpbiB0aGUgZG9jdW1lbnQuXG5cdCAqL1xuXHRwdWJsaWMgaGFzV2hpdGVzcGFjZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRXaGl0ZXNwYWNlc0NvdW50KCkgPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIG1pbiB3aWR0aCBmb3IgYWxsIHdoaXRlc3BhY2VzLlxuXHQgKi9cblx0cHVibGljIGdldFdoaXRlc3BhY2VNaW5XaWR0aCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9taW5XaWR0aCA9PT0gLTEpIHtcblx0XHRcdGxldCBtaW5XaWR0aCA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdG1pbldpZHRoID0gTWF0aC5tYXgobWluV2lkdGgsIHRoaXMuX2FycltpXS5taW5XaWR0aCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9taW5XaWR0aCA9IG1pbldpZHRoO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWluV2lkdGg7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgYHZlcnRpY2FsT2Zmc2V0YCBpcyBiZWxvdyBhbGwgbGluZXMuXG5cdCAqL1xuXHRwdWJsaWMgaXNBZnRlckxpbmVzKHZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCB0b3RhbEhlaWdodCA9IHRoaXMuZ2V0TGluZXNUb3RhbEhlaWdodCgpO1xuXHRcdHJldHVybiB2ZXJ0aWNhbE9mZnNldCA+IHRvdGFsSGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIGlzSW5Ub3BQYWRkaW5nKHZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcGFkZGluZ1RvcCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHZlcnRpY2FsT2Zmc2V0IDwgdGhpcy5fcGFkZGluZ1RvcCk7XG5cdH1cblxuXHRwdWJsaWMgaXNJbkJvdHRvbVBhZGRpbmcodmVydGljYWxPZmZzZXQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9wYWRkaW5nQm90dG9tID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHRvdGFsSGVpZ2h0ID0gdGhpcy5nZXRMaW5lc1RvdGFsSGVpZ2h0KCk7XG5cdFx0cmV0dXJuICh2ZXJ0aWNhbE9mZnNldCA+PSB0b3RhbEhlaWdodCAtIHRoaXMuX3BhZGRpbmdCb3R0b20pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGhlIGZpcnN0IGxpbmUgbnVtYmVyIHRoYXQgaXMgYXQgb3IgYWZ0ZXIgdmVydGljYWwgb2Zmc2V0IGB2ZXJ0aWNhbE9mZnNldGAuXG5cdCAqIGkuZS4gaWYgZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lKGxpbmUpIGlzIHggYW5kIGdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZShsaW5lICsgMSkgaXMgeSwgdGhlblxuXHQgKiBnZXRMaW5lTnVtYmVyQXRPckFmdGVyVmVydGljYWxPZmZzZXQoaSkgPSBsaW5lLCB4IDw9IGkgPCB5LlxuXHQgKlxuXHQgKiBAcGFyYW0gdmVydGljYWxPZmZzZXQgVGhlIHZlcnRpY2FsIG9mZnNldCB0byBzZWFyY2ggYXQuXG5cdCAqIEByZXR1cm4gVGhlIGxpbmUgbnVtYmVyIGF0IG9yIGFmdGVyIHZlcnRpY2FsIG9mZnNldCBgdmVydGljYWxPZmZzZXRgLlxuXHQgKi9cblx0cHVibGljIGdldExpbmVOdW1iZXJBdE9yQWZ0ZXJWZXJ0aWNhbE9mZnNldCh2ZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR2ZXJ0aWNhbE9mZnNldCA9IHZlcnRpY2FsT2Zmc2V0IHwgMDtcblxuXHRcdGlmICh2ZXJ0aWNhbE9mZnNldCA8IDApIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVzQ291bnQgPSB0aGlzLl9saW5lQ291bnQgfCAwO1xuXHRcdGxldCBtaW5MaW5lTnVtYmVyID0gMTtcblx0XHRsZXQgbWF4TGluZU51bWJlciA9IGxpbmVzQ291bnQ7XG5cblx0XHR3aGlsZSAobWluTGluZU51bWJlciA8IG1heExpbmVOdW1iZXIpIHtcblx0XHRcdGNvbnN0IG1pZExpbmVOdW1iZXIgPSAoKG1pbkxpbmVOdW1iZXIgKyBtYXhMaW5lTnVtYmVyKSAvIDIpIHwgMDtcblxuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZ2V0TGluZUhlaWdodEZvckxpbmVOdW1iZXIobWlkTGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBtaWRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQgPSB0aGlzLmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihtaWRMaW5lTnVtYmVyKSB8IDA7XG5cblx0XHRcdGlmICh2ZXJ0aWNhbE9mZnNldCA+PSBtaWRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQgKyBsaW5lSGVpZ2h0KSB7XG5cdFx0XHRcdC8vIHZlcnRpY2FsIG9mZnNldCBpcyBhZnRlciBtaWQgbGluZSBudW1iZXJcblx0XHRcdFx0bWluTGluZU51bWJlciA9IG1pZExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0fSBlbHNlIGlmICh2ZXJ0aWNhbE9mZnNldCA+PSBtaWRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQpIHtcblx0XHRcdFx0Ly8gSGl0XG5cdFx0XHRcdHJldHVybiBtaWRMaW5lTnVtYmVyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gdmVydGljYWwgb2Zmc2V0IGlzIGJlZm9yZSBtaWQgbGluZSBudW1iZXIsIGJ1dCBtaWQgbGluZSBudW1iZXIgY291bGQgc3RpbGwgYmUgd2hhdCB3ZSdyZSBzZWFyY2hpbmcgZm9yXG5cdFx0XHRcdG1heExpbmVOdW1iZXIgPSBtaWRMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtaW5MaW5lTnVtYmVyID4gbGluZXNDb3VudCkge1xuXHRcdFx0cmV0dXJuIGxpbmVzQ291bnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1pbkxpbmVOdW1iZXI7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGFsbCB0aGUgbGluZXMgYW5kIHRoZWlyIHJlbGF0aXZlIHZlcnRpY2FsIG9mZnNldHMgdGhhdCBhcmUgcG9zaXRpb25lZCBiZXR3ZWVuIGB2ZXJ0aWNhbE9mZnNldDFgIGFuZCBgdmVydGljYWxPZmZzZXQyYC5cblx0ICpcblx0ICogQHBhcmFtIHZlcnRpY2FsT2Zmc2V0MSBUaGUgYmVnaW5uaW5nIG9mIHRoZSB2aWV3cG9ydC5cblx0ICogQHBhcmFtIHZlcnRpY2FsT2Zmc2V0MiBUaGUgZW5kIG9mIHRoZSB2aWV3cG9ydC5cblx0ICogQHJldHVybiBBIHN0cnVjdHVyZSBkZXNjcmliaW5nIHRoZSBsaW5lcyBwb3NpdGlvbmVkIGJldHdlZW4gYHZlcnRpY2FsT2Zmc2V0MWAgYW5kIGB2ZXJ0aWNhbE9mZnNldDJgLlxuXHQgKi9cblx0cHVibGljIGdldExpbmVzVmlld3BvcnREYXRhKHZlcnRpY2FsT2Zmc2V0MTogbnVtYmVyLCB2ZXJ0aWNhbE9mZnNldDI6IG51bWJlcik6IElQYXJ0aWFsVmlld0xpbmVzVmlld3BvcnREYXRhIHtcblx0XHR2ZXJ0aWNhbE9mZnNldDEgPSB2ZXJ0aWNhbE9mZnNldDEgfCAwO1xuXHRcdHZlcnRpY2FsT2Zmc2V0MiA9IHZlcnRpY2FsT2Zmc2V0MiB8IDA7XG5cblx0XHQvLyBGaW5kIGZpcnN0IGxpbmUgbnVtYmVyXG5cdFx0Ly8gV2UgZG9uJ3QgbGl2ZSBpbiBhIHBlcmZlY3Qgd29ybGQsIHNvIHRoZSBsaW5lIG51bWJlciBtaWdodCBzdGFydCBiZWZvcmUgb3IgYWZ0ZXIgdmVydGljYWxPZmZzZXQxXG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gdGhpcy5nZXRMaW5lTnVtYmVyQXRPckFmdGVyVmVydGljYWxPZmZzZXQodmVydGljYWxPZmZzZXQxKSB8IDA7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQgPSB0aGlzLmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihzdGFydExpbmVOdW1iZXIpIHwgMDtcblxuXHRcdGxldCBlbmRMaW5lTnVtYmVyID0gdGhpcy5fbGluZUNvdW50IHwgMDtcblxuXHRcdC8vIEFsc28ga2VlcCB0cmFjayBvZiB3aGF0IHdoaXRlc3BhY2Ugd2UndmUgZ290XG5cdFx0bGV0IHdoaXRlc3BhY2VJbmRleCA9IHRoaXMuZ2V0Rmlyc3RXaGl0ZXNwYWNlSW5kZXhBZnRlckxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyKSB8IDA7XG5cdFx0Y29uc3Qgd2hpdGVzcGFjZUNvdW50ID0gdGhpcy5nZXRXaGl0ZXNwYWNlc0NvdW50KCkgfCAwO1xuXHRcdGxldCBjdXJyZW50V2hpdGVzcGFjZUhlaWdodDogbnVtYmVyO1xuXHRcdGxldCBjdXJyZW50V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlcjogbnVtYmVyO1xuXG5cdFx0aWYgKHdoaXRlc3BhY2VJbmRleCA9PT0gLTEpIHtcblx0XHRcdHdoaXRlc3BhY2VJbmRleCA9IHdoaXRlc3BhY2VDb3VudDtcblx0XHRcdGN1cnJlbnRXaGl0ZXNwYWNlQWZ0ZXJMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlciArIDE7XG5cdFx0XHRjdXJyZW50V2hpdGVzcGFjZUhlaWdodCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnJlbnRXaGl0ZXNwYWNlQWZ0ZXJMaW5lTnVtYmVyID0gdGhpcy5nZXRBZnRlckxpbmVOdW1iZXJGb3JXaGl0ZXNwYWNlSW5kZXgod2hpdGVzcGFjZUluZGV4KSB8IDA7XG5cdFx0XHRjdXJyZW50V2hpdGVzcGFjZUhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0Rm9yV2hpdGVzcGFjZUluZGV4KHdoaXRlc3BhY2VJbmRleCkgfCAwO1xuXHRcdH1cblxuXHRcdGxldCBjdXJyZW50VmVydGljYWxPZmZzZXQgPSBzdGFydExpbmVOdW1iZXJWZXJ0aWNhbE9mZnNldDtcblx0XHRsZXQgY3VycmVudExpbmVSZWxhdGl2ZU9mZnNldCA9IGN1cnJlbnRWZXJ0aWNhbE9mZnNldDtcblxuXHRcdC8vIElFIChhbGwgdmVyc2lvbnMpIGNhbm5vdCBoYW5kbGUgdW5pdHMgYWJvdmUgYWJvdXQgMSw1MzMsOTA4IHB4LCBzbyBldmVyeSA1MDBrIHBpeGVscyBicmluZyBudW1iZXJzIGRvd25cblx0XHRjb25zdCBTVEVQX1NJWkUgPSA1MDAwMDA7XG5cdFx0bGV0IGJpZ051bWJlcnNEZWx0YSA9IDA7XG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlclZlcnRpY2FsT2Zmc2V0ID49IFNURVBfU0laRSkge1xuXHRcdFx0Ly8gQ29tcHV0ZSBhIGRlbHRhIHRoYXQgZ3VhcmFudGVlcyB0aGF0IGxpbmVzIGFyZSBwb3NpdGlvbmVkIGF0IGBsaW5lSGVpZ2h0YCBpbmNyZW1lbnRzXG5cdFx0XHRiaWdOdW1iZXJzRGVsdGEgPSBNYXRoLmZsb29yKHN0YXJ0TGluZU51bWJlclZlcnRpY2FsT2Zmc2V0IC8gU1RFUF9TSVpFKSAqIFNURVBfU0laRTtcblx0XHRcdGJpZ051bWJlcnNEZWx0YSA9IE1hdGguZmxvb3IoYmlnTnVtYmVyc0RlbHRhIC8gdGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmRlZmF1bHRMaW5lSGVpZ2h0KSAqIHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5kZWZhdWx0TGluZUhlaWdodDtcblxuXHRcdFx0Y3VycmVudExpbmVSZWxhdGl2ZU9mZnNldCAtPSBiaWdOdW1iZXJzRGVsdGE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZXNPZmZzZXRzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0Y29uc3QgdmVydGljYWxDZW50ZXIgPSB2ZXJ0aWNhbE9mZnNldDEgKyAodmVydGljYWxPZmZzZXQyIC0gdmVydGljYWxPZmZzZXQxKSAvIDI7XG5cdFx0bGV0IGNlbnRlcmVkTGluZU51bWJlciA9IC0xO1xuXG5cdFx0Ly8gRmlndXJlIG91dCBob3cgZmFyIHRoZSBsaW5lcyBnb1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5nZXRMaW5lSGVpZ2h0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0XHRcdGlmIChjZW50ZXJlZExpbmVOdW1iZXIgPT09IC0xKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRMaW5lVG9wID0gY3VycmVudFZlcnRpY2FsT2Zmc2V0O1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TGluZUJvdHRvbSA9IGN1cnJlbnRWZXJ0aWNhbE9mZnNldCArIGxpbmVIZWlnaHQ7XG5cdFx0XHRcdGlmICgoY3VycmVudExpbmVUb3AgPD0gdmVydGljYWxDZW50ZXIgJiYgdmVydGljYWxDZW50ZXIgPCBjdXJyZW50TGluZUJvdHRvbSkgfHwgY3VycmVudExpbmVUb3AgPiB2ZXJ0aWNhbENlbnRlcikge1xuXHRcdFx0XHRcdGNlbnRlcmVkTGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ291bnQgY3VycmVudCBsaW5lIGhlaWdodCBpbiB0aGUgdmVydGljYWwgb2Zmc2V0c1xuXHRcdFx0Y3VycmVudFZlcnRpY2FsT2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG5cdFx0XHRsaW5lc09mZnNldHNbbGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlcl0gPSBjdXJyZW50TGluZVJlbGF0aXZlT2Zmc2V0O1xuXG5cdFx0XHQvLyBOZXh0IGxpbmUgc3RhcnRzIGltbWVkaWF0ZWx5IGFmdGVyIHRoaXMgb25lXG5cdFx0XHRjdXJyZW50TGluZVJlbGF0aXZlT2Zmc2V0ICs9IGxpbmVIZWlnaHQ7XG5cdFx0XHR3aGlsZSAoY3VycmVudFdoaXRlc3BhY2VBZnRlckxpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gUHVzaCBkb3duIG5leHQgbGluZSB3aXRoIHRoZSBoZWlnaHQgb2YgdGhlIGN1cnJlbnQgd2hpdGVzcGFjZVxuXHRcdFx0XHRjdXJyZW50TGluZVJlbGF0aXZlT2Zmc2V0ICs9IGN1cnJlbnRXaGl0ZXNwYWNlSGVpZ2h0O1xuXG5cdFx0XHRcdC8vIENvdW50IGN1cnJlbnQgd2hpdGVzcGFjZSBpbiB0aGUgdmVydGljYWwgb2Zmc2V0c1xuXHRcdFx0XHRjdXJyZW50VmVydGljYWxPZmZzZXQgKz0gY3VycmVudFdoaXRlc3BhY2VIZWlnaHQ7XG5cdFx0XHRcdHdoaXRlc3BhY2VJbmRleCsrO1xuXG5cdFx0XHRcdGlmICh3aGl0ZXNwYWNlSW5kZXggPj0gd2hpdGVzcGFjZUNvdW50KSB7XG5cdFx0XHRcdFx0Y3VycmVudFdoaXRlc3BhY2VBZnRlckxpbmVOdW1iZXIgPSBlbmRMaW5lTnVtYmVyICsgMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJyZW50V2hpdGVzcGFjZUFmdGVyTGluZU51bWJlciA9IHRoaXMuZ2V0QWZ0ZXJMaW5lTnVtYmVyRm9yV2hpdGVzcGFjZUluZGV4KHdoaXRlc3BhY2VJbmRleCkgfCAwO1xuXHRcdFx0XHRcdGN1cnJlbnRXaGl0ZXNwYWNlSGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHRGb3JXaGl0ZXNwYWNlSW5kZXgod2hpdGVzcGFjZUluZGV4KSB8IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJlbnRWZXJ0aWNhbE9mZnNldCA+PSB2ZXJ0aWNhbE9mZnNldDIpIHtcblx0XHRcdFx0Ly8gV2UgaGF2ZSBjb3ZlcmVkIHRoZSBlbnRpcmUgdmlld3BvcnQgYXJlYSwgdGltZSB0byBzdG9wXG5cdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2VudGVyZWRMaW5lTnVtYmVyID09PSAtMSkge1xuXHRcdFx0Y2VudGVyZWRMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQgPSB0aGlzLmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihlbmRMaW5lTnVtYmVyKSB8IDA7XG5cblx0XHRsZXQgY29tcGxldGVseVZpc2libGVTdGFydExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0bGV0IGNvbXBsZXRlbHlWaXNpYmxlRW5kTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXI7XG5cblx0XHRpZiAoY29tcGxldGVseVZpc2libGVTdGFydExpbmVOdW1iZXIgPCBjb21wbGV0ZWx5VmlzaWJsZUVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXJWZXJ0aWNhbE9mZnNldCA8IHZlcnRpY2FsT2Zmc2V0MSkge1xuXHRcdFx0XHRjb21wbGV0ZWx5VmlzaWJsZVN0YXJ0TGluZU51bWJlcisrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY29tcGxldGVseVZpc2libGVTdGFydExpbmVOdW1iZXIgPCBjb21wbGV0ZWx5VmlzaWJsZUVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGNvbnN0IGVuZExpbmVIZWlnaHQgPSB0aGlzLmdldExpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKGVuZExpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGVuZExpbmVOdW1iZXJWZXJ0aWNhbE9mZnNldCArIGVuZExpbmVIZWlnaHQgPiB2ZXJ0aWNhbE9mZnNldDIpIHtcblx0XHRcdFx0Y29tcGxldGVseVZpc2libGVFbmRMaW5lTnVtYmVyLS07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGJpZ051bWJlcnNEZWx0YTogYmlnTnVtYmVyc0RlbHRhLFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiBlbmRMaW5lTnVtYmVyLFxuXHRcdFx0cmVsYXRpdmVWZXJ0aWNhbE9mZnNldDogbGluZXNPZmZzZXRzLFxuXHRcdFx0Y2VudGVyZWRMaW5lTnVtYmVyOiBjZW50ZXJlZExpbmVOdW1iZXIsXG5cdFx0XHRjb21wbGV0ZWx5VmlzaWJsZVN0YXJ0TGluZU51bWJlcjogY29tcGxldGVseVZpc2libGVTdGFydExpbmVOdW1iZXIsXG5cdFx0XHRjb21wbGV0ZWx5VmlzaWJsZUVuZExpbmVOdW1iZXI6IGNvbXBsZXRlbHlWaXNpYmxlRW5kTGluZU51bWJlcixcblx0XHRcdGxpbmVIZWlnaHQ6IHRoaXMuX2xpbmVIZWlnaHRzTWFuYWdlci5kZWZhdWx0TGluZUhlaWdodCxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldFZlcnRpY2FsT2Zmc2V0Rm9yV2hpdGVzcGFjZUluZGV4KHdoaXRlc3BhY2VJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR3aGl0ZXNwYWNlSW5kZXggPSB3aGl0ZXNwYWNlSW5kZXggfCAwO1xuXG5cdFx0Y29uc3QgYWZ0ZXJMaW5lTnVtYmVyID0gdGhpcy5nZXRBZnRlckxpbmVOdW1iZXJGb3JXaGl0ZXNwYWNlSW5kZXgod2hpdGVzcGFjZUluZGV4KTtcblxuXHRcdGxldCBwcmV2aW91c0xpbmVzSGVpZ2h0OiBudW1iZXI7XG5cdFx0aWYgKGFmdGVyTGluZU51bWJlciA+PSAxKSB7XG5cdFx0XHRwcmV2aW91c0xpbmVzSGVpZ2h0ID0gdGhpcy5fbGluZUhlaWdodHNNYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKGFmdGVyTGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByZXZpb3VzTGluZXNIZWlnaHQgPSAwO1xuXHRcdH1cblxuXHRcdGxldCBwcmV2aW91c1doaXRlc3BhY2VzSGVpZ2h0OiBudW1iZXI7XG5cdFx0aWYgKHdoaXRlc3BhY2VJbmRleCA+IDApIHtcblx0XHRcdHByZXZpb3VzV2hpdGVzcGFjZXNIZWlnaHQgPSB0aGlzLmdldFdoaXRlc3BhY2VzQWNjdW11bGF0ZWRIZWlnaHQod2hpdGVzcGFjZUluZGV4IC0gMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByZXZpb3VzV2hpdGVzcGFjZXNIZWlnaHQgPSAwO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJldmlvdXNMaW5lc0hlaWdodCArIHByZXZpb3VzV2hpdGVzcGFjZXNIZWlnaHQgKyB0aGlzLl9wYWRkaW5nVG9wO1xuXHR9XG5cblx0cHVibGljIGdldFdoaXRlc3BhY2VJbmRleEF0T3JBZnRlclZlcnRpY2FsbE9mZnNldCh2ZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR2ZXJ0aWNhbE9mZnNldCA9IHZlcnRpY2FsT2Zmc2V0IHwgMDtcblxuXHRcdGxldCBtaW5XaGl0ZXNwYWNlSW5kZXggPSAwO1xuXHRcdGxldCBtYXhXaGl0ZXNwYWNlSW5kZXggPSB0aGlzLmdldFdoaXRlc3BhY2VzQ291bnQoKSAtIDE7XG5cblx0XHRpZiAobWF4V2hpdGVzcGFjZUluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdC8vIFNwZWNpYWwgY2FzZTogbm90aGluZyB0byBiZSBmb3VuZFxuXHRcdGNvbnN0IG1heFdoaXRlc3BhY2VWZXJ0aWNhbE9mZnNldCA9IHRoaXMuZ2V0VmVydGljYWxPZmZzZXRGb3JXaGl0ZXNwYWNlSW5kZXgobWF4V2hpdGVzcGFjZUluZGV4KTtcblx0XHRjb25zdCBtYXhXaGl0ZXNwYWNlSGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHRGb3JXaGl0ZXNwYWNlSW5kZXgobWF4V2hpdGVzcGFjZUluZGV4KTtcblx0XHRpZiAodmVydGljYWxPZmZzZXQgPj0gbWF4V2hpdGVzcGFjZVZlcnRpY2FsT2Zmc2V0ICsgbWF4V2hpdGVzcGFjZUhlaWdodCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdHdoaWxlIChtaW5XaGl0ZXNwYWNlSW5kZXggPCBtYXhXaGl0ZXNwYWNlSW5kZXgpIHtcblx0XHRcdGNvbnN0IG1pZFdoaXRlc3BhY2VJbmRleCA9IE1hdGguZmxvb3IoKG1pbldoaXRlc3BhY2VJbmRleCArIG1heFdoaXRlc3BhY2VJbmRleCkgLyAyKTtcblxuXHRcdFx0Y29uc3QgbWlkV2hpdGVzcGFjZVZlcnRpY2FsT2Zmc2V0ID0gdGhpcy5nZXRWZXJ0aWNhbE9mZnNldEZvcldoaXRlc3BhY2VJbmRleChtaWRXaGl0ZXNwYWNlSW5kZXgpO1xuXHRcdFx0Y29uc3QgbWlkV2hpdGVzcGFjZUhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0Rm9yV2hpdGVzcGFjZUluZGV4KG1pZFdoaXRlc3BhY2VJbmRleCk7XG5cblx0XHRcdGlmICh2ZXJ0aWNhbE9mZnNldCA+PSBtaWRXaGl0ZXNwYWNlVmVydGljYWxPZmZzZXQgKyBtaWRXaGl0ZXNwYWNlSGVpZ2h0KSB7XG5cdFx0XHRcdC8vIHZlcnRpY2FsIG9mZnNldCBpcyBhZnRlciB3aGl0ZXNwYWNlXG5cdFx0XHRcdG1pbldoaXRlc3BhY2VJbmRleCA9IG1pZFdoaXRlc3BhY2VJbmRleCArIDE7XG5cdFx0XHR9IGVsc2UgaWYgKHZlcnRpY2FsT2Zmc2V0ID49IG1pZFdoaXRlc3BhY2VWZXJ0aWNhbE9mZnNldCkge1xuXHRcdFx0XHQvLyBIaXRcblx0XHRcdFx0cmV0dXJuIG1pZFdoaXRlc3BhY2VJbmRleDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHZlcnRpY2FsIG9mZnNldCBpcyBiZWZvcmUgd2hpdGVzcGFjZSwgYnV0IG1pZFdoaXRlc3BhY2VJbmRleCBtaWdodCBzdGlsbCBiZSB3aGF0IHdlJ3JlIHNlYXJjaGluZyBmb3Jcblx0XHRcdFx0bWF4V2hpdGVzcGFjZUluZGV4ID0gbWlkV2hpdGVzcGFjZUluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWluV2hpdGVzcGFjZUluZGV4O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBleGFjdGx5IHRoZSB3aGl0ZXNwYWNlIHRoYXQgaXMgbGF5b3V0ZWQgYXQgYHZlcnRpY2FsT2Zmc2V0YC5cblx0ICpcblx0ICogQHBhcmFtIHZlcnRpY2FsT2Zmc2V0IFRoZSB2ZXJ0aWNhbCBvZmZzZXQuXG5cdCAqIEByZXR1cm4gUHJlY2lzZWx5IHRoZSB3aGl0ZXNwYWNlIHRoYXQgaXMgbGF5b3V0ZWQgYXQgYHZlcnRpY2Fsb2Zmc2V0YCBvciBudWxsLlxuXHQgKi9cblx0cHVibGljIGdldFdoaXRlc3BhY2VBdFZlcnRpY2FsT2Zmc2V0KHZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBJVmlld1doaXRlc3BhY2VWaWV3cG9ydERhdGEgfCBudWxsIHtcblx0XHR2ZXJ0aWNhbE9mZnNldCA9IHZlcnRpY2FsT2Zmc2V0IHwgMDtcblxuXHRcdGNvbnN0IGNhbmRpZGF0ZUluZGV4ID0gdGhpcy5nZXRXaGl0ZXNwYWNlSW5kZXhBdE9yQWZ0ZXJWZXJ0aWNhbGxPZmZzZXQodmVydGljYWxPZmZzZXQpO1xuXG5cdFx0aWYgKGNhbmRpZGF0ZUluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKGNhbmRpZGF0ZUluZGV4ID49IHRoaXMuZ2V0V2hpdGVzcGFjZXNDb3VudCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5kaWRhdGVUb3AgPSB0aGlzLmdldFZlcnRpY2FsT2Zmc2V0Rm9yV2hpdGVzcGFjZUluZGV4KGNhbmRpZGF0ZUluZGV4KTtcblxuXHRcdGlmIChjYW5kaWRhdGVUb3AgPiB2ZXJ0aWNhbE9mZnNldCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FuZGlkYXRlSGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHRGb3JXaGl0ZXNwYWNlSW5kZXgoY2FuZGlkYXRlSW5kZXgpO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZUlkID0gdGhpcy5nZXRJZEZvcldoaXRlc3BhY2VJbmRleChjYW5kaWRhdGVJbmRleCk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlQWZ0ZXJMaW5lTnVtYmVyID0gdGhpcy5nZXRBZnRlckxpbmVOdW1iZXJGb3JXaGl0ZXNwYWNlSW5kZXgoY2FuZGlkYXRlSW5kZXgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBjYW5kaWRhdGVJZCxcblx0XHRcdGFmdGVyTGluZU51bWJlcjogY2FuZGlkYXRlQWZ0ZXJMaW5lTnVtYmVyLFxuXHRcdFx0dmVydGljYWxPZmZzZXQ6IGNhbmRpZGF0ZVRvcCxcblx0XHRcdGhlaWdodDogY2FuZGlkYXRlSGVpZ2h0XG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYSBsaXN0IG9mIHdoaXRlc3BhY2VzIHRoYXQgYXJlIHBvc2l0aW9uZWQgYmV0d2VlbiBgdmVydGljYWxPZmZzZXQxYCBhbmQgYHZlcnRpY2FsT2Zmc2V0MmAuXG5cdCAqXG5cdCAqIEBwYXJhbSB2ZXJ0aWNhbE9mZnNldDEgVGhlIGJlZ2lubmluZyBvZiB0aGUgdmlld3BvcnQuXG5cdCAqIEBwYXJhbSB2ZXJ0aWNhbE9mZnNldDIgVGhlIGVuZCBvZiB0aGUgdmlld3BvcnQuXG5cdCAqIEByZXR1cm4gQW4gYXJyYXkgd2l0aCBhbGwgdGhlIHdoaXRlc3BhY2VzIGluIHRoZSB2aWV3cG9ydC4gSWYgbm8gd2hpdGVzcGFjZSBpcyBpbiB2aWV3cG9ydCwgdGhlIGFycmF5IGlzIGVtcHR5LlxuXHQgKi9cblx0cHVibGljIGdldFdoaXRlc3BhY2VWaWV3cG9ydERhdGEodmVydGljYWxPZmZzZXQxOiBudW1iZXIsIHZlcnRpY2FsT2Zmc2V0MjogbnVtYmVyKTogSVZpZXdXaGl0ZXNwYWNlVmlld3BvcnREYXRhW10ge1xuXHRcdHZlcnRpY2FsT2Zmc2V0MSA9IHZlcnRpY2FsT2Zmc2V0MSB8IDA7XG5cdFx0dmVydGljYWxPZmZzZXQyID0gdmVydGljYWxPZmZzZXQyIHwgMDtcblxuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSB0aGlzLmdldFdoaXRlc3BhY2VJbmRleEF0T3JBZnRlclZlcnRpY2FsbE9mZnNldCh2ZXJ0aWNhbE9mZnNldDEpO1xuXHRcdGNvbnN0IGVuZEluZGV4ID0gdGhpcy5nZXRXaGl0ZXNwYWNlc0NvdW50KCkgLSAxO1xuXG5cdFx0aWYgKHN0YXJ0SW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJVmlld1doaXRlc3BhY2VWaWV3cG9ydERhdGFbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4OyBpIDw9IGVuZEluZGV4OyBpKyspIHtcblx0XHRcdGNvbnN0IHRvcCA9IHRoaXMuZ2V0VmVydGljYWxPZmZzZXRGb3JXaGl0ZXNwYWNlSW5kZXgoaSk7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmdldEhlaWdodEZvcldoaXRlc3BhY2VJbmRleChpKTtcblx0XHRcdGlmICh0b3AgPj0gdmVydGljYWxPZmZzZXQyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdGlkOiB0aGlzLmdldElkRm9yV2hpdGVzcGFjZUluZGV4KGkpLFxuXHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IHRoaXMuZ2V0QWZ0ZXJMaW5lTnVtYmVyRm9yV2hpdGVzcGFjZUluZGV4KGkpLFxuXHRcdFx0XHR2ZXJ0aWNhbE9mZnNldDogdG9wLFxuXHRcdFx0XHRoZWlnaHQ6IGhlaWdodFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYWxsIHdoaXRlc3BhY2VzLlxuXHQgKi9cblx0cHVibGljIGdldFdoaXRlc3BhY2VzKCk6IElFZGl0b3JXaGl0ZXNwYWNlW10ge1xuXHRcdHJldHVybiB0aGlzLl9hcnIuc2xpY2UoMCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG51bWJlciBvZiB3aGl0ZXNwYWNlcy5cblx0ICovXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlc0NvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2Fyci5sZW5ndGg7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBgaWRgIGZvciB3aGl0ZXNwYWNlIGF0IGluZGV4IGBpbmRleGAuXG5cdCAqXG5cdCAqIEBwYXJhbSBpbmRleCBUaGUgaW5kZXggb2YgdGhlIHdoaXRlc3BhY2UuXG5cdCAqIEByZXR1cm4gYGlkYCBvZiB3aGl0ZXNwYWNlIGF0IGBpbmRleGAuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0SWRGb3JXaGl0ZXNwYWNlSW5kZXgoaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aW5kZXggPSBpbmRleCB8IDA7XG5cblx0XHRyZXR1cm4gdGhpcy5fYXJyW2luZGV4XS5pZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGBhZnRlckxpbmVOdW1iZXJgIGZvciB3aGl0ZXNwYWNlIGF0IGluZGV4IGBpbmRleGAuXG5cdCAqXG5cdCAqIEBwYXJhbSBpbmRleCBUaGUgaW5kZXggb2YgdGhlIHdoaXRlc3BhY2UuXG5cdCAqIEByZXR1cm4gYGFmdGVyTGluZU51bWJlcmAgb2Ygd2hpdGVzcGFjZSBhdCBgaW5kZXhgLlxuXHQgKi9cblx0cHVibGljIGdldEFmdGVyTGluZU51bWJlckZvcldoaXRlc3BhY2VJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpbmRleCA9IGluZGV4IHwgMDtcblxuXHRcdHJldHVybiB0aGlzLl9hcnJbaW5kZXhdLmFmdGVyTGluZU51bWJlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGBoZWlnaHRgIGZvciB3aGl0ZXNwYWNlIGF0IGluZGV4IGBpbmRleGAuXG5cdCAqXG5cdCAqIEBwYXJhbSBpbmRleCBUaGUgaW5kZXggb2YgdGhlIHdoaXRlc3BhY2UuXG5cdCAqIEByZXR1cm4gYGhlaWdodGAgb2Ygd2hpdGVzcGFjZSBhdCBgaW5kZXhgLlxuXHQgKi9cblx0cHVibGljIGdldEhlaWdodEZvcldoaXRlc3BhY2VJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpbmRleCA9IGluZGV4IHwgMDtcblxuXHRcdHJldHVybiB0aGlzLl9hcnJbaW5kZXhdLmhlaWdodDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsWUFBWSxhQUFhO0FBQ3pCLFNBQStCLDBCQUEwQjtBQUt6RCxNQUFNLGVBQWU7QUFBQSxFQU1wQixjQUFjO0FBQ2IsU0FBSyxjQUFjO0FBQ25CLFNBQUssV0FBVyxDQUFDO0FBQ2pCLFNBQUssV0FBVyxDQUFDO0FBQ2pCLFNBQUssV0FBVyxDQUFDO0FBQUEsRUFDbEI7QUFBQSxFQUVPLE9BQU8sR0FBMkI7QUFDeEMsU0FBSyxjQUFjO0FBQ25CLFNBQUssU0FBUyxLQUFLLENBQUM7QUFBQSxFQUNyQjtBQUFBLEVBRU8sT0FBTyxHQUF5QjtBQUN0QyxTQUFLLGNBQWM7QUFDbkIsU0FBSyxTQUFTLEtBQUssQ0FBQztBQUFBLEVBQ3JCO0FBQUEsRUFFTyxPQUFPLEdBQXlCO0FBQ3RDLFNBQUssY0FBYztBQUNuQixTQUFLLFNBQVMsS0FBSyxDQUFDO0FBQUEs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Q0osaUJBQWlCO0FBQUEsTUFDakIsZ0JBQWdCO0FBQUEsTUFDaEIsUUFBUTtBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNPLDBCQUEwQixpQkFBeUIsaUJBQXdEO0FBQ2pILHNCQUFrQixrQkFBa0I7QUFDcEMsc0JBQWtCLGtCQUFrQjtBQUVwQyxVQUFNLGFBQWEsS0FBSywyQ0FBMkMsZUFBZTtBQUNsRixVQUFNLFdBQVcsS0FBSyxvQkFBb0IsSUFBSTtBQUU5QyxRQUFJLGFBQWEsR0FBRztBQUNuQixhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxTQUF3QyxDQUFDO0FBQy9DLGFBQVMsSUFBSSxZQUFZLEtBQUssVUFBVSxLQUFLO0FBQzVDLFlBQU0sTUFBTSxLQUFLLG9DQUFvQyxDQUFDO0FBQ3RELFlBQU0sU0FBUyxLQUFLLDRCQUE0QixDQUFDO0FBQ2pELFVBQUksT0FBTyxpQkFBaUI7QUFDM0I7QUFBQSxNQUNEO0FBRUEsYUFBTyxLQUFLO0FBQUEsUUFDWCxJQUFJLEtBQUssd0JBQXdCLENBQUM7QUFBQSxRQUNsQyxpQkFBaUIsS0FBSyxxQ0FBcUMsQ0FBQztBQUFBLFFBQzVELGdCQUFnQjtBQUFBLFFBQ2hCO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxpQkFBc0M7QUFDNUMsV0FBTyxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFDekI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLHNCQUE4QjtBQUNwQyxXQUFPLEtBQUssS0FBSztBQUFBLEVBQ2xCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRTyx3QkFBd0IsT0FBdUI7QUFDckQsWUFBUSxRQUFRO0FBRWhCLFdBQU8sS0FBSyxLQUFLLEtBQUssRUFBRTtBQUFBLEVBQ3pCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRTyxxQ0FBcUMsT0FBdUI7QUFDbEUsWUFBUSxRQUFRO0FBRWhCLFdBQU8sS0FBSyxLQUFLLEtBQUssRUFBRTtBQUFBLEVBQ3pCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRTyw0QkFBNEIsT0FBdUI7QUFDekQsWUFBUSxRQUFRO0FBRWhCLFdBQU8sS0FBSyxLQUFLLEtBQUssRUFBRTtBQUFBLEVBQ3pCO0FBQ0Q7QUE3ekJhLGFBRUcsaUJBQWlCO0FBRjFCLElBQU0sY0FBTjsiLAogICJuYW1lcyI6IFsicmVzdWx0Il0KfQo=
