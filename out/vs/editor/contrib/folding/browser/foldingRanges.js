var FoldSource = /* @__PURE__ */ ((FoldSource2) => {
  FoldSource2[FoldSource2["provider"] = 0] = "provider";
  FoldSource2[FoldSource2["userDefined"] = 1] = "userDefined";
  FoldSource2[FoldSource2["recovered"] = 2] = "recovered";
  return FoldSource2;
})(FoldSource || {});
const foldSourceAbbr = {
  [0 /* provider */]: " ",
  [1 /* userDefined */]: "u",
  [2 /* recovered */]: "r"
};
const MAX_FOLDING_REGIONS = 65535;
const MAX_LINE_NUMBER = 16777215;
const MASK_INDENT = 4278190080;
class BitField {
  constructor(size) {
    const numWords = Math.ceil(size / 32);
    this._states = new Uint32Array(numWords);
  }
  get(index) {
    const arrayIndex = index / 32 | 0;
    const bit = index % 32;
    return (this._states[arrayIndex] & 1 << bit) !== 0;
  }
  set(index, newState) {
    const arrayIndex = index / 32 | 0;
    const bit = index % 32;
    const value = this._states[arrayIndex];
    if (newState) {
      this._states[arrayIndex] = value | 1 << bit;
    } else {
      this._states[arrayIndex] = value & ~(1 << bit);
    }
  }
}
class FoldingRegions {
  constructor(startIndexes, endIndexes, types) {
    if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
      throw new Error("invalid startIndexes or endIndexes size");
    }
    this._startIndexes = startIndexes;
    this._endIndexes = endIndexes;
    this._collapseStates = new BitField(startIndexes.length);
    this._userDefinedStates = new BitField(startIndexes.length);
    this._recoveredStates = new BitField(startIndexes.length);
    this._types = types;
    this._parentsComputed = false;
  }
  ensureParentIndices() {
    if (!this._parentsComputed) {
      this._parentsComputed = true;
      const parentIndexes = [];
      const isInsideLast = (startLineNumber, endLineNumber) => {
        const index = parentIndexes[parentIndexes.length - 1];
        return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
      };
      for (let i = 0, len = this._startIndexes.length; i < len; i++) {
        const startLineNumber = this._startIndexes[i];
        const endLineNumber = this._endIndexes[i];
        if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
          throw new Error("startLineNumber or endLineNumber must not exceed " + MAX_LINE_NUMBER);
        }
        while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
          parentIndexes.pop();
        }
        const parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1;
        parentIndexes.push(i);
        this._startIndexes[i] = startLineNumber + ((parentIndex & 255) << 24);
        this._endIndexes[i] = endLineNumber + ((parentIndex & 65280) << 16);
      }
    }
  }
  get length() {
    return this._startIndexes.length;
  }
  getStartLineNumber(index) {
    return this._startIndexes[index] & MAX_LINE_NUMBER;
  }
  getEndLineNumber(index) {
    return this._endIndexes[index] & MAX_LINE_NUMBER;
  }
  getType(index) {
    return this._types ? this._types[index] : void 0;
  }
  hasTypes() {
    return !!this._types;
  }
  isCollapsed(index) {
    return this._collapseStates.get(index);
  }
  setCollapsed(index, newState) {
    this._collapseStates.set(index, newState);
  }
  isUserDefined(index) {
    return this._userDefinedStates.get(index);
  }
  setUserDefined(index, newState) {
    return this._userDefinedStates.set(index, newState);
  }
  isRecovered(index) {
    return this._recoveredStates.get(index);
  }
  setRecovered(index, newState) {
    return this._recoveredStates.set(index, newState);
  }
  getSource(index) {
    if (this.isUserDefined(index)) {
      return 1 /* userDefined */;
    } else if (this.isRecovered(index)) {
      return 2 /* recovered */;
    }
    return 0 /* provider */;
  }
  setSource(index, source) {
    if (source === 1 /* userDefined */) {
      this.setUserDefined(index, true);
      this.setRecovered(index, false);
    } else if (source === 2 /* recovered */) {
      this.setUserDefined(index, false);
      this.setRecovered(index, true);
    } else {
      this.setUserDefined(index, false);
      this.setRecovered(index, false);
    }
  }
  setCollapsedAllOfType(type, newState) {
    let hasChanged = false;
    if (this._types) {
      for (let i = 0; i < this._types.length; i++) {
        if (this._types[i] === type) {
          this.setCollapsed(i, newState);
          hasChanged = true;
        }
      }
    }
    return hasChanged;
  }
  toRegion(index) {
    return new FoldingRegion(this, index);
  }
  getParentIndex(index) {
    this.ensureParentIndices();
    const parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
    if (parent === MAX_FOLDING_REGIONS) {
      return -1;
    }
    return parent;
  }
  contains(index, line) {
    return this.getStartLineNumber(index) <= line && this.getEndLineNumber(index) >= line;
  }
  findIndex(line) {
    let low = 0, high = this._startIndexes.length;
    if (high === 0) {
      return -1;
    }
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (line < this.getStartLineNumber(mid)) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low - 1;
  }
  findRange(line) {
    let index = this.findIndex(line);
    if (index >= 0) {
      const endLineNumber = this.getEndLineNumber(index);
      if (endLineNumber >= line) {
        return index;
      }
      index = this.getParentIndex(index);
      while (index !== -1) {
        if (this.contains(index, line)) {
          return index;
        }
        index = this.getParentIndex(index);
      }
    }
    return -1;
  }
  toString() {
    const res = [];
    for (let i = 0; i < this.length; i++) {
      res[i] = `[${foldSourceAbbr[this.getSource(i)]}${this.isCollapsed(i) ? "+" : "-"}] ${this.getStartLineNumber(i)}/${this.getEndLineNumber(i)}`;
    }
    return res.join(", ");
  }
  toFoldRange(index) {
    return {
      startLineNumber: this._startIndexes[index] & MAX_LINE_NUMBER,
      endLineNumber: this._endIndexes[index] & MAX_LINE_NUMBER,
      type: this._types ? this._types[index] : void 0,
      isCollapsed: this.isCollapsed(index),
      source: this.getSource(index)
    };
  }
  static fromFoldRanges(ranges) {
    const rangesLength = ranges.length;
    const startIndexes = new Uint32Array(rangesLength);
    const endIndexes = new Uint32Array(rangesLength);
    let types = [];
    let gotTypes = false;
    for (let i = 0; i < rangesLength; i++) {
      const range = ranges[i];
      startIndexes[i] = range.startLineNumber;
      endIndexes[i] = range.endLineNumber;
      types.push(range.type);
      if (range.type) {
        gotTypes = true;
      }
    }
    if (!gotTypes) {
      types = void 0;
    }
    const regions = new FoldingRegions(startIndexes, endIndexes, types);
    for (let i = 0; i < rangesLength; i++) {
      if (ranges[i].isCollapsed) {
        regions.setCollapsed(i, true);
      }
      regions.setSource(i, ranges[i].source);
    }
    return regions;
  }
  /**
   * Two inputs, each a FoldingRegions or a FoldRange[], are merged.
   * Each input must be pre-sorted on startLineNumber.
   * The first list is assumed to always include all regions currently defined by range providers.
   * The second list only contains the previously collapsed and all manual ranges.
   * If the line position matches, the range of the new range is taken, and the range is no longer manual
   * When an entry in one list overlaps an entry in the other, the second list's entry "wins" and
   * overlapping entries in the first list are discarded.
   * Invalid entries are discarded. An entry is invalid if:
   * 		the start and end line numbers aren't a valid range of line numbers,
   * 		it is out of sequence or has the same start line as a preceding entry,
   * 		it overlaps a preceding entry and is not fully contained by that entry.
   */
  static sanitizeAndMerge(rangesA, rangesB, maxLineNumber, selection) {
    maxLineNumber = maxLineNumber ?? Number.MAX_VALUE;
    const getIndexedFunction = (r, limit) => {
      return Array.isArray(r) ? ((i) => {
        return i < limit ? r[i] : void 0;
      }) : ((i) => {
        return i < limit ? r.toFoldRange(i) : void 0;
      });
    };
    const getA = getIndexedFunction(rangesA, rangesA.length);
    const getB = getIndexedFunction(rangesB, rangesB.length);
    let indexA = 0;
    let indexB = 0;
    let nextA = getA(0);
    let nextB = getB(0);
    const stackedRanges = [];
    let topStackedRange;
    let prevLineNumber = 0;
    const resultRanges = [];
    while (nextA || nextB) {
      let useRange = void 0;
      if (nextB && (!nextA || nextA.startLineNumber >= nextB.startLineNumber)) {
        if (nextA && nextA.startLineNumber === nextB.startLineNumber) {
          if (nextB.source === 1 /* userDefined */) {
            useRange = nextB;
          } else {
            useRange = nextA;
            useRange.isCollapsed = nextB.isCollapsed && (nextA.endLineNumber === nextB.endLineNumber || !selection?.startsInside(nextA.startLineNumber + 1, nextA.endLineNumber + 1));
            useRange.source = 0 /* provider */;
          }
          nextA = getA(++indexA);
        } else {
          useRange = nextB;
          if (nextB.isCollapsed && nextB.source === 0 /* provider */) {
            useRange.source = 2 /* recovered */;
          }
        }
        nextB = getB(++indexB);
      } else {
        let scanIndex = indexB;
        let prescanB = nextB;
        while (true) {
          if (!prescanB || prescanB.startLineNumber > nextA.endLineNumber) {
            useRange = nextA;
            break;
          }
          if (prescanB.source === 1 /* userDefined */ && prescanB.endLineNumber > nextA.endLineNumber) {
            break;
          }
          prescanB = getB(++scanIndex);
        }
        nextA = getA(++indexA);
      }
      if (useRange) {
        while (topStackedRange && topStackedRange.endLineNumber < useRange.startLineNumber) {
          topStackedRange = stackedRanges.pop();
        }
        if (useRange.endLineNumber > useRange.startLineNumber && useRange.startLineNumber > prevLineNumber && useRange.endLineNumber <= maxLineNumber && (!topStackedRange || topStackedRange.endLineNumber >= useRange.endLineNumber)) {
          resultRanges.push(useRange);
          prevLineNumber = useRange.startLineNumber;
          if (topStackedRange) {
            stackedRanges.push(topStackedRange);
          }
          topStackedRange = useRange;
        }
      }
    }
    return resultRanges;
  }
}
class FoldingRegion {
  constructor(ranges, index) {
    this.ranges = ranges;
    this.index = index;
  }
  get startLineNumber() {
    return this.ranges.getStartLineNumber(this.index);
  }
  get endLineNumber() {
    return this.ranges.getEndLineNumber(this.index);
  }
  get regionIndex() {
    return this.index;
  }
  get parentIndex() {
    return this.ranges.getParentIndex(this.index);
  }
  get isCollapsed() {
    return this.ranges.isCollapsed(this.index);
  }
  containedBy(range) {
    return range.startLineNumber <= this.startLineNumber && range.endLineNumber >= this.endLineNumber;
  }
  containsLine(lineNumber) {
    return this.startLineNumber <= lineNumber && lineNumber <= this.endLineNumber;
  }
  hidesLine(lineNumber) {
    return this.startLineNumber < lineNumber && lineNumber <= this.endLineNumber;
  }
}
export {
  FoldSource,
  FoldingRegion,
  FoldingRegions,
  MAX_FOLDING_REGIONS,
  MAX_LINE_NUMBER,
  foldSourceAbbr
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nUmFuZ2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VsZWN0ZWRMaW5lcyB9IGZyb20gJy4vZm9sZGluZy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmVSYW5nZSB7XG5cdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZvbGRTb3VyY2Uge1xuXHRwcm92aWRlciA9IDAsXG5cdHVzZXJEZWZpbmVkID0gMSxcblx0cmVjb3ZlcmVkID0gMlxufVxuXG5leHBvcnQgY29uc3QgZm9sZFNvdXJjZUFiYnIgPSB7XG5cdFtGb2xkU291cmNlLnByb3ZpZGVyXTogJyAnLFxuXHRbRm9sZFNvdXJjZS51c2VyRGVmaW5lZF06ICd1Jyxcblx0W0ZvbGRTb3VyY2UucmVjb3ZlcmVkXTogJ3InLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBGb2xkUmFuZ2Uge1xuXHRzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0ZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHR0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGlzQ29sbGFwc2VkOiBib29sZWFuO1xuXHRzb3VyY2U6IEZvbGRTb3VyY2U7XG59XG5cbmV4cG9ydCBjb25zdCBNQVhfRk9MRElOR19SRUdJT05TID0gMHhGRkZGO1xuZXhwb3J0IGNvbnN0IE1BWF9MSU5FX05VTUJFUiA9IDB4RkZGRkZGO1xuXG5jb25zdCBNQVNLX0lOREVOVCA9IDB4RkYwMDAwMDA7XG5cbmNsYXNzIEJpdEZpZWxkIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGVzOiBVaW50MzJBcnJheTtcblx0Y29uc3RydWN0b3Ioc2l6ZTogbnVtYmVyKSB7XG5cdFx0Y29uc3QgbnVtV29yZHMgPSBNYXRoLmNlaWwoc2l6ZSAvIDMyKTtcblx0XHR0aGlzLl9zdGF0ZXMgPSBuZXcgVWludDMyQXJyYXkobnVtV29yZHMpO1xuXHR9XG5cblx0cHVibGljIGdldChpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYXJyYXlJbmRleCA9IChpbmRleCAvIDMyKSB8IDA7XG5cdFx0Y29uc3QgYml0ID0gaW5kZXggJSAzMjtcblx0XHRyZXR1cm4gKHRoaXMuX3N0YXRlc1thcnJheUluZGV4XSAmICgxIDw8IGJpdCkpICE9PSAwO1xuXHR9XG5cblx0cHVibGljIHNldChpbmRleDogbnVtYmVyLCBuZXdTdGF0ZTogYm9vbGVhbikge1xuXHRcdGNvbnN0IGFycmF5SW5kZXggPSAoaW5kZXggLyAzMikgfCAwO1xuXHRcdGNvbnN0IGJpdCA9IGluZGV4ICUgMzI7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9zdGF0ZXNbYXJyYXlJbmRleF07XG5cdFx0aWYgKG5ld1N0YXRlKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZXNbYXJyYXlJbmRleF0gPSB2YWx1ZSB8ICgxIDw8IGJpdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0YXRlc1thcnJheUluZGV4XSA9IHZhbHVlICYgfigxIDw8IGJpdCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2xkaW5nUmVnaW9ucyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0SW5kZXhlczogVWludDMyQXJyYXk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuZEluZGV4ZXM6IFVpbnQzMkFycmF5O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2xsYXBzZVN0YXRlczogQml0RmllbGQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VzZXJEZWZpbmVkU3RhdGVzOiBCaXRGaWVsZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb3ZlcmVkU3RhdGVzOiBCaXRGaWVsZDtcblxuXHRwcml2YXRlIF9wYXJlbnRzQ29tcHV0ZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R5cGVzOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0SW5kZXhlczogVWludDMyQXJyYXksIGVuZEluZGV4ZXM6IFVpbnQzMkFycmF5LCB0eXBlcz86IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4pIHtcblx0XHRpZiAoc3RhcnRJbmRleGVzLmxlbmd0aCAhPT0gZW5kSW5kZXhlcy5sZW5ndGggfHwgc3RhcnRJbmRleGVzLmxlbmd0aCA+IE1BWF9GT0xESU5HX1JFR0lPTlMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBzdGFydEluZGV4ZXMgb3IgZW5kSW5kZXhlcyBzaXplJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXJ0SW5kZXhlcyA9IHN0YXJ0SW5kZXhlcztcblx0XHR0aGlzLl9lbmRJbmRleGVzID0gZW5kSW5kZXhlcztcblx0XHR0aGlzLl9jb2xsYXBzZVN0YXRlcyA9IG5ldyBCaXRGaWVsZChzdGFydEluZGV4ZXMubGVuZ3RoKTtcblx0XHR0aGlzLl91c2VyRGVmaW5lZFN0YXRlcyA9IG5ldyBCaXRGaWVsZChzdGFydEluZGV4ZXMubGVuZ3RoKTtcblx0XHR0aGlzLl9yZWNvdmVyZWRTdGF0ZXMgPSBuZXcgQml0RmllbGQoc3RhcnRJbmRleGVzLmxlbmd0aCk7XG5cdFx0dGhpcy5fdHlwZXMgPSB0eXBlcztcblx0XHR0aGlzLl9wYXJlbnRzQ29tcHV0ZWQgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlUGFyZW50SW5kaWNlcygpIHtcblx0XHRpZiAoIXRoaXMuX3BhcmVudHNDb21wdXRlZCkge1xuXHRcdFx0dGhpcy5fcGFyZW50c0NvbXB1dGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHBhcmVudEluZGV4ZXM6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBpc0luc2lkZUxhc3QgPSAoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHBhcmVudEluZGV4ZXNbcGFyZW50SW5kZXhlcy5sZW5ndGggLSAxXTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKGluZGV4KSA8PSBzdGFydExpbmVOdW1iZXIgJiYgdGhpcy5nZXRFbmRMaW5lTnVtYmVyKGluZGV4KSA+PSBlbmRMaW5lTnVtYmVyO1xuXHRcdFx0fTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9zdGFydEluZGV4ZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fc3RhcnRJbmRleGVzW2ldO1xuXHRcdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5fZW5kSW5kZXhlc1tpXTtcblx0XHRcdFx0aWYgKHN0YXJ0TGluZU51bWJlciA+IE1BWF9MSU5FX05VTUJFUiB8fCBlbmRMaW5lTnVtYmVyID4gTUFYX0xJTkVfTlVNQkVSKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdzdGFydExpbmVOdW1iZXIgb3IgZW5kTGluZU51bWJlciBtdXN0IG5vdCBleGNlZWQgJyArIE1BWF9MSU5FX05VTUJFUik7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2hpbGUgKHBhcmVudEluZGV4ZXMubGVuZ3RoID4gMCAmJiAhaXNJbnNpZGVMYXN0KHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRwYXJlbnRJbmRleGVzLnBvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBhcmVudEluZGV4ID0gcGFyZW50SW5kZXhlcy5sZW5ndGggPiAwID8gcGFyZW50SW5kZXhlc1twYXJlbnRJbmRleGVzLmxlbmd0aCAtIDFdIDogLTE7XG5cdFx0XHRcdHBhcmVudEluZGV4ZXMucHVzaChpKTtcblx0XHRcdFx0dGhpcy5fc3RhcnRJbmRleGVzW2ldID0gc3RhcnRMaW5lTnVtYmVyICsgKChwYXJlbnRJbmRleCAmIDB4RkYpIDw8IDI0KTtcblx0XHRcdFx0dGhpcy5fZW5kSW5kZXhlc1tpXSA9IGVuZExpbmVOdW1iZXIgKyAoKHBhcmVudEluZGV4ICYgMHhGRjAwKSA8PCAxNik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRJbmRleGVzLmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGFydExpbmVOdW1iZXIoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0SW5kZXhlc1tpbmRleF0gJiBNQVhfTElORV9OVU1CRVI7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5kTGluZU51bWJlcihpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5kSW5kZXhlc1tpbmRleF0gJiBNQVhfTElORV9OVU1CRVI7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VHlwZShpbmRleDogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdHlwZXMgPyB0aGlzLl90eXBlc1tpbmRleF0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgaGFzVHlwZXMoKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5fdHlwZXM7XG5cdH1cblxuXHRwdWJsaWMgaXNDb2xsYXBzZWQoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb2xsYXBzZVN0YXRlcy5nZXQoaW5kZXgpO1xuXHR9XG5cblx0cHVibGljIHNldENvbGxhcHNlZChpbmRleDogbnVtYmVyLCBuZXdTdGF0ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2NvbGxhcHNlU3RhdGVzLnNldChpbmRleCwgbmV3U3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1VzZXJEZWZpbmVkKGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdXNlckRlZmluZWRTdGF0ZXMuZ2V0KGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0VXNlckRlZmluZWQoaW5kZXg6IG51bWJlciwgbmV3U3RhdGU6IGJvb2xlYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fdXNlckRlZmluZWRTdGF0ZXMuc2V0KGluZGV4LCBuZXdTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGlzUmVjb3ZlcmVkKGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVjb3ZlcmVkU3RhdGVzLmdldChpbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFJlY292ZXJlZChpbmRleDogbnVtYmVyLCBuZXdTdGF0ZTogYm9vbGVhbikge1xuXHRcdHJldHVybiB0aGlzLl9yZWNvdmVyZWRTdGF0ZXMuc2V0KGluZGV4LCBuZXdTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U291cmNlKGluZGV4OiBudW1iZXIpOiBGb2xkU291cmNlIHtcblx0XHRpZiAodGhpcy5pc1VzZXJEZWZpbmVkKGluZGV4KSkge1xuXHRcdFx0cmV0dXJuIEZvbGRTb3VyY2UudXNlckRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlzUmVjb3ZlcmVkKGluZGV4KSkge1xuXHRcdFx0cmV0dXJuIEZvbGRTb3VyY2UucmVjb3ZlcmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gRm9sZFNvdXJjZS5wcm92aWRlcjtcblx0fVxuXG5cdHB1YmxpYyBzZXRTb3VyY2UoaW5kZXg6IG51bWJlciwgc291cmNlOiBGb2xkU291cmNlKTogdm9pZCB7XG5cdFx0aWYgKHNvdXJjZSA9PT0gRm9sZFNvdXJjZS51c2VyRGVmaW5lZCkge1xuXHRcdFx0dGhpcy5zZXRVc2VyRGVmaW5lZChpbmRleCwgdHJ1ZSk7XG5cdFx0XHR0aGlzLnNldFJlY292ZXJlZChpbmRleCwgZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAoc291cmNlID09PSBGb2xkU291cmNlLnJlY292ZXJlZCkge1xuXHRcdFx0dGhpcy5zZXRVc2VyRGVmaW5lZChpbmRleCwgZmFsc2UpO1xuXHRcdFx0dGhpcy5zZXRSZWNvdmVyZWQoaW5kZXgsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNldFVzZXJEZWZpbmVkKGluZGV4LCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNldFJlY292ZXJlZChpbmRleCwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRDb2xsYXBzZWRBbGxPZlR5cGUodHlwZTogc3RyaW5nLCBuZXdTdGF0ZTogYm9vbGVhbikge1xuXHRcdGxldCBoYXNDaGFuZ2VkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX3R5cGVzKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3R5cGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLl90eXBlc1tpXSA9PT0gdHlwZSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29sbGFwc2VkKGksIG5ld1N0YXRlKTtcblx0XHRcdFx0XHRoYXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGFzQ2hhbmdlZDtcblx0fVxuXG5cdHB1YmxpYyB0b1JlZ2lvbihpbmRleDogbnVtYmVyKTogRm9sZGluZ1JlZ2lvbiB7XG5cdFx0cmV0dXJuIG5ldyBGb2xkaW5nUmVnaW9uKHRoaXMsIGluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQYXJlbnRJbmRleChpbmRleDogbnVtYmVyKSB7XG5cdFx0dGhpcy5lbnN1cmVQYXJlbnRJbmRpY2VzKCk7XG5cdFx0Y29uc3QgcGFyZW50ID0gKCh0aGlzLl9zdGFydEluZGV4ZXNbaW5kZXhdICYgTUFTS19JTkRFTlQpID4+PiAyNCkgKyAoKHRoaXMuX2VuZEluZGV4ZXNbaW5kZXhdICYgTUFTS19JTkRFTlQpID4+PiAxNik7XG5cdFx0aWYgKHBhcmVudCA9PT0gTUFYX0ZPTERJTkdfUkVHSU9OUykge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFyZW50O1xuXHR9XG5cblx0cHVibGljIGNvbnRhaW5zKGluZGV4OiBudW1iZXIsIGxpbmU6IG51bWJlcikge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YXJ0TGluZU51bWJlcihpbmRleCkgPD0gbGluZSAmJiB0aGlzLmdldEVuZExpbmVOdW1iZXIoaW5kZXgpID49IGxpbmU7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRJbmRleChsaW5lOiBudW1iZXIpIHtcblx0XHRsZXQgbG93ID0gMCwgaGlnaCA9IHRoaXMuX3N0YXJ0SW5kZXhlcy5sZW5ndGg7XG5cdFx0aWYgKGhpZ2ggPT09IDApIHtcblx0XHRcdHJldHVybiAtMTsgLy8gbm8gY2hpbGRyZW5cblx0XHR9XG5cdFx0d2hpbGUgKGxvdyA8IGhpZ2gpIHtcblx0XHRcdGNvbnN0IG1pZCA9IE1hdGguZmxvb3IoKGxvdyArIGhpZ2gpIC8gMik7XG5cdFx0XHRpZiAobGluZSA8IHRoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKG1pZCkpIHtcblx0XHRcdFx0aGlnaCA9IG1pZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsb3cgLSAxO1xuXHR9XG5cblx0cHVibGljIGZpbmRSYW5nZShsaW5lOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBpbmRleCA9IHRoaXMuZmluZEluZGV4KGxpbmUpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5nZXRFbmRMaW5lTnVtYmVyKGluZGV4KTtcblx0XHRcdGlmIChlbmRMaW5lTnVtYmVyID49IGxpbmUpIHtcblx0XHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdFx0fVxuXHRcdFx0aW5kZXggPSB0aGlzLmdldFBhcmVudEluZGV4KGluZGV4KTtcblx0XHRcdHdoaWxlIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0aWYgKHRoaXMuY29udGFpbnMoaW5kZXgsIGxpbmUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluZGV4ID0gdGhpcy5nZXRQYXJlbnRJbmRleChpbmRleCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cblx0cHVibGljIHRvU3RyaW5nKCkge1xuXHRcdGNvbnN0IHJlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJlc1tpXSA9IGBbJHtmb2xkU291cmNlQWJiclt0aGlzLmdldFNvdXJjZShpKV19JHt0aGlzLmlzQ29sbGFwc2VkKGkpID8gJysnIDogJy0nfV0gJHt0aGlzLmdldFN0YXJ0TGluZU51bWJlcihpKX0vJHt0aGlzLmdldEVuZExpbmVOdW1iZXIoaSl9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcy5qb2luKCcsICcpO1xuXHR9XG5cblx0cHVibGljIHRvRm9sZFJhbmdlKGluZGV4OiBudW1iZXIpOiBGb2xkUmFuZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IHRoaXMuX3N0YXJ0SW5kZXhlc1tpbmRleF0gJiBNQVhfTElORV9OVU1CRVIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiB0aGlzLl9lbmRJbmRleGVzW2luZGV4XSAmIE1BWF9MSU5FX05VTUJFUixcblx0XHRcdHR5cGU6IHRoaXMuX3R5cGVzID8gdGhpcy5fdHlwZXNbaW5kZXhdIDogdW5kZWZpbmVkLFxuXHRcdFx0aXNDb2xsYXBzZWQ6IHRoaXMuaXNDb2xsYXBzZWQoaW5kZXgpLFxuXHRcdFx0c291cmNlOiB0aGlzLmdldFNvdXJjZShpbmRleClcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tRm9sZFJhbmdlcyhyYW5nZXM6IEZvbGRSYW5nZVtdKTogRm9sZGluZ1JlZ2lvbnMge1xuXHRcdGNvbnN0IHJhbmdlc0xlbmd0aCA9IHJhbmdlcy5sZW5ndGg7XG5cdFx0Y29uc3Qgc3RhcnRJbmRleGVzID0gbmV3IFVpbnQzMkFycmF5KHJhbmdlc0xlbmd0aCk7XG5cdFx0Y29uc3QgZW5kSW5kZXhlcyA9IG5ldyBVaW50MzJBcnJheShyYW5nZXNMZW5ndGgpO1xuXHRcdGxldCB0eXBlczogQXJyYXk8c3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCA9IFtdO1xuXHRcdGxldCBnb3RUeXBlcyA9IGZhbHNlO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFuZ2VzTGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gcmFuZ2VzW2ldO1xuXHRcdFx0c3RhcnRJbmRleGVzW2ldID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0ZW5kSW5kZXhlc1tpXSA9IHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHR0eXBlcy5wdXNoKHJhbmdlLnR5cGUpO1xuXHRcdFx0aWYgKHJhbmdlLnR5cGUpIHtcblx0XHRcdFx0Z290VHlwZXMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWdvdFR5cGVzKSB7XG5cdFx0XHR0eXBlcyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVnaW9ucyA9IG5ldyBGb2xkaW5nUmVnaW9ucyhzdGFydEluZGV4ZXMsIGVuZEluZGV4ZXMsIHR5cGVzKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJhbmdlc0xlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAocmFuZ2VzW2ldLmlzQ29sbGFwc2VkKSB7XG5cdFx0XHRcdHJlZ2lvbnMuc2V0Q29sbGFwc2VkKGksIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0cmVnaW9ucy5zZXRTb3VyY2UoaSwgcmFuZ2VzW2ldLnNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZWdpb25zO1xuXHR9XG5cblx0LyoqXG5cdCAqIFR3byBpbnB1dHMsIGVhY2ggYSBGb2xkaW5nUmVnaW9ucyBvciBhIEZvbGRSYW5nZVtdLCBhcmUgbWVyZ2VkLlxuXHQgKiBFYWNoIGlucHV0IG11c3QgYmUgcHJlLXNvcnRlZCBvbiBzdGFydExpbmVOdW1iZXIuXG5cdCAqIFRoZSBmaXJzdCBsaXN0IGlzIGFzc3VtZWQgdG8gYWx3YXlzIGluY2x1ZGUgYWxsIHJlZ2lvbnMgY3VycmVudGx5IGRlZmluZWQgYnkgcmFuZ2UgcHJvdmlkZXJzLlxuXHQgKiBUaGUgc2Vjb25kIGxpc3Qgb25seSBjb250YWlucyB0aGUgcHJldmlvdXNseSBjb2xsYXBzZWQgYW5kIGFsbCBtYW51YWwgcmFuZ2VzLlxuXHQgKiBJZiB0aGUgbGluZSBwb3NpdGlvbiBtYXRjaGVzLCB0aGUgcmFuZ2Ugb2YgdGhlIG5ldyByYW5nZSBpcyB0YWtlbiwgYW5kIHRoZSByYW5nZSBpcyBubyBsb25nZXIgbWFudWFsXG5cdCAqIFdoZW4gYW4gZW50cnkgaW4gb25lIGxpc3Qgb3ZlcmxhcHMgYW4gZW50cnkgaW4gdGhlIG90aGVyLCB0aGUgc2Vjb25kIGxpc3QncyBlbnRyeSBcIndpbnNcIiBhbmRcblx0ICogb3ZlcmxhcHBpbmcgZW50cmllcyBpbiB0aGUgZmlyc3QgbGlzdCBhcmUgZGlzY2FyZGVkLlxuXHQgKiBJbnZhbGlkIGVudHJpZXMgYXJlIGRpc2NhcmRlZC4gQW4gZW50cnkgaXMgaW52YWxpZCBpZjpcblx0ICogXHRcdHRoZSBzdGFydCBhbmQgZW5kIGxpbmUgbnVtYmVycyBhcmVuJ3QgYSB2YWxpZCByYW5nZSBvZiBsaW5lIG51bWJlcnMsXG5cdCAqIFx0XHRpdCBpcyBvdXQgb2Ygc2VxdWVuY2Ugb3IgaGFzIHRoZSBzYW1lIHN0YXJ0IGxpbmUgYXMgYSBwcmVjZWRpbmcgZW50cnksXG5cdCAqIFx0XHRpdCBvdmVybGFwcyBhIHByZWNlZGluZyBlbnRyeSBhbmQgaXMgbm90IGZ1bGx5IGNvbnRhaW5lZCBieSB0aGF0IGVudHJ5LlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBzYW5pdGl6ZUFuZE1lcmdlKFxuXHRcdHJhbmdlc0E6IEZvbGRpbmdSZWdpb25zIHwgRm9sZFJhbmdlW10sXG5cdFx0cmFuZ2VzQjogRm9sZGluZ1JlZ2lvbnMgfCBGb2xkUmFuZ2VbXSxcblx0XHRtYXhMaW5lTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0c2VsZWN0aW9uPzogU2VsZWN0ZWRMaW5lc1xuXHQpOiBGb2xkUmFuZ2VbXSB7XG5cblx0XHRtYXhMaW5lTnVtYmVyID0gbWF4TGluZU51bWJlciA/PyBOdW1iZXIuTUFYX1ZBTFVFO1xuXG5cdFx0Y29uc3QgZ2V0SW5kZXhlZEZ1bmN0aW9uID0gKHI6IEZvbGRpbmdSZWdpb25zIHwgRm9sZFJhbmdlW10sIGxpbWl0OiBudW1iZXIpID0+IHtcblx0XHRcdHJldHVybiBBcnJheS5pc0FycmF5KHIpXG5cdFx0XHRcdD8gKChpOiBudW1iZXIpID0+IHsgcmV0dXJuIChpIDwgbGltaXQpID8gcltpXSA6IHVuZGVmaW5lZDsgfSlcblx0XHRcdFx0OiAoKGk6IG51bWJlcikgPT4geyByZXR1cm4gKGkgPCBsaW1pdCkgPyByLnRvRm9sZFJhbmdlKGkpIDogdW5kZWZpbmVkOyB9KTtcblx0XHR9O1xuXHRcdGNvbnN0IGdldEEgPSBnZXRJbmRleGVkRnVuY3Rpb24ocmFuZ2VzQSwgcmFuZ2VzQS5sZW5ndGgpO1xuXHRcdGNvbnN0IGdldEIgPSBnZXRJbmRleGVkRnVuY3Rpb24ocmFuZ2VzQiwgcmFuZ2VzQi5sZW5ndGgpO1xuXHRcdGxldCBpbmRleEEgPSAwO1xuXHRcdGxldCBpbmRleEIgPSAwO1xuXHRcdGxldCBuZXh0QSA9IGdldEEoMCk7XG5cdFx0bGV0IG5leHRCID0gZ2V0QigwKTtcblxuXHRcdGNvbnN0IHN0YWNrZWRSYW5nZXM6IEZvbGRSYW5nZVtdID0gW107XG5cdFx0bGV0IHRvcFN0YWNrZWRSYW5nZTogRm9sZFJhbmdlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcmV2TGluZU51bWJlciA9IDA7XG5cdFx0Y29uc3QgcmVzdWx0UmFuZ2VzOiBGb2xkUmFuZ2VbXSA9IFtdO1xuXG5cdFx0d2hpbGUgKG5leHRBIHx8IG5leHRCKSB7XG5cblx0XHRcdGxldCB1c2VSYW5nZTogRm9sZFJhbmdlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG5leHRCICYmICghbmV4dEEgfHwgbmV4dEEuc3RhcnRMaW5lTnVtYmVyID49IG5leHRCLnN0YXJ0TGluZU51bWJlcikpIHtcblx0XHRcdFx0aWYgKG5leHRBICYmIG5leHRBLnN0YXJ0TGluZU51bWJlciA9PT0gbmV4dEIuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0aWYgKG5leHRCLnNvdXJjZSA9PT0gRm9sZFNvdXJjZS51c2VyRGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Ly8gYSB1c2VyIGRlZmluZWQgcmFuZ2UgKHBvc3NpYmx5IHVuZm9sZGVkKVxuXHRcdFx0XHRcdFx0dXNlUmFuZ2UgPSBuZXh0Qjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gYSBwcmV2aW91c2x5IGZvbGRlZCByYW5nZSBvciBhIChwb3NzaWJseSB1bmZvbGRlZCkgcmVjb3ZlcmVkIHJhbmdlXG5cdFx0XHRcdFx0XHR1c2VSYW5nZSA9IG5leHRBO1xuXHRcdFx0XHRcdFx0Ly8gc3RheXMgY29sbGFwc2VkIGlmIHRoZSByYW5nZSBzdGlsbCBoYXMgdGhlIHNhbWUgbnVtYmVyIG9mIGxpbmVzIG9yIHRoZSBzZWxlY3Rpb24gaXMgbm90IGluIHRoZSByYW5nZSBvciBhZnRlciBpdFxuXHRcdFx0XHRcdFx0dXNlUmFuZ2UuaXNDb2xsYXBzZWQgPSBuZXh0Qi5pc0NvbGxhcHNlZCAmJiAobmV4dEEuZW5kTGluZU51bWJlciA9PT0gbmV4dEIuZW5kTGluZU51bWJlciB8fCAhc2VsZWN0aW9uPy5zdGFydHNJbnNpZGUobmV4dEEuc3RhcnRMaW5lTnVtYmVyICsgMSwgbmV4dEEuZW5kTGluZU51bWJlciArIDEpKTtcblx0XHRcdFx0XHRcdHVzZVJhbmdlLnNvdXJjZSA9IEZvbGRTb3VyY2UucHJvdmlkZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG5leHRBID0gZ2V0QSgrK2luZGV4QSk7IC8vIG5vdCBuZWNlc3NhcnksIGp1c3QgZm9yIHNwZWVkXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dXNlUmFuZ2UgPSBuZXh0Qjtcblx0XHRcdFx0XHRpZiAobmV4dEIuaXNDb2xsYXBzZWQgJiYgbmV4dEIuc291cmNlID09PSBGb2xkU291cmNlLnByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0XHQvLyBhIHByZXZpb3VzbHkgY29sbGFwc2VkIHJhbmdlXG5cdFx0XHRcdFx0XHR1c2VSYW5nZS5zb3VyY2UgPSBGb2xkU291cmNlLnJlY292ZXJlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV4dEIgPSBnZXRCKCsraW5kZXhCKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG5leHRBIGlzIG5leHQuIFRoZSB1c2VyIGZvbGRlZCBCIHNldCB0YWtlcyBwcmVjZWRlbmNlIGFuZCB3ZSBzb21ldGltZXMgbmVlZCB0byBsb29rXG5cdFx0XHRcdC8vIGFoZWFkIGluIGl0IHRvIGNoZWNrIGZvciBhbiB1cGNvbWluZyBjb25mbGljdC5cblx0XHRcdFx0bGV0IHNjYW5JbmRleCA9IGluZGV4Qjtcblx0XHRcdFx0bGV0IHByZXNjYW5CID0gbmV4dEI7XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0aWYgKCFwcmVzY2FuQiB8fCBwcmVzY2FuQi5zdGFydExpbmVOdW1iZXIgPiBuZXh0QSEuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0dXNlUmFuZ2UgPSBuZXh0QTtcblx0XHRcdFx0XHRcdGJyZWFrOyAvLyBubyBjb25mbGljdCwgdXNlIHRoaXMgbmV4dEFcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHByZXNjYW5CLnNvdXJjZSA9PT0gRm9sZFNvdXJjZS51c2VyRGVmaW5lZCAmJiBwcmVzY2FuQi5lbmRMaW5lTnVtYmVyID4gbmV4dEEhLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdC8vIHdlIGZvdW5kIGEgdXNlciBmb2xkZWQgcmFuZ2UsIGl0IHdpbnNcblx0XHRcdFx0XHRcdGJyZWFrOyAvLyB3aXRob3V0IHNldHRpbmcgbmV4dFJlc3VsdCwgc28gdGhpcyBuZXh0QSBnZXRzIHNraXBwZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHJlc2NhbkIgPSBnZXRCKCsrc2NhbkluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXh0QSA9IGdldEEoKytpbmRleEEpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodXNlUmFuZ2UpIHtcblx0XHRcdFx0d2hpbGUgKHRvcFN0YWNrZWRSYW5nZVxuXHRcdFx0XHRcdCYmIHRvcFN0YWNrZWRSYW5nZS5lbmRMaW5lTnVtYmVyIDwgdXNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0dG9wU3RhY2tlZFJhbmdlID0gc3RhY2tlZFJhbmdlcy5wb3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodXNlUmFuZ2UuZW5kTGluZU51bWJlciA+IHVzZVJhbmdlLnN0YXJ0TGluZU51bWJlclxuXHRcdFx0XHRcdCYmIHVzZVJhbmdlLnN0YXJ0TGluZU51bWJlciA+IHByZXZMaW5lTnVtYmVyXG5cdFx0XHRcdFx0JiYgdXNlUmFuZ2UuZW5kTGluZU51bWJlciA8PSBtYXhMaW5lTnVtYmVyXG5cdFx0XHRcdFx0JiYgKCF0b3BTdGFja2VkUmFuZ2Vcblx0XHRcdFx0XHRcdHx8IHRvcFN0YWNrZWRSYW5nZS5lbmRMaW5lTnVtYmVyID49IHVzZVJhbmdlLmVuZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0cmVzdWx0UmFuZ2VzLnB1c2godXNlUmFuZ2UpO1xuXHRcdFx0XHRcdHByZXZMaW5lTnVtYmVyID0gdXNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdGlmICh0b3BTdGFja2VkUmFuZ2UpIHtcblx0XHRcdFx0XHRcdHN0YWNrZWRSYW5nZXMucHVzaCh0b3BTdGFja2VkUmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0b3BTdGFja2VkUmFuZ2UgPSB1c2VSYW5nZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHRSYW5nZXM7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRm9sZGluZ1JlZ2lvbiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSByYW5nZXM6IEZvbGRpbmdSZWdpb25zLCBwcml2YXRlIGluZGV4OiBudW1iZXIpIHtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3RhcnRMaW5lTnVtYmVyKCkge1xuXHRcdHJldHVybiB0aGlzLnJhbmdlcy5nZXRTdGFydExpbmVOdW1iZXIodGhpcy5pbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGVuZExpbmVOdW1iZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMucmFuZ2VzLmdldEVuZExpbmVOdW1iZXIodGhpcy5pbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJlZ2lvbkluZGV4KCkge1xuXHRcdHJldHVybiB0aGlzLmluZGV4O1xuXHR9XG5cblx0cHVibGljIGdldCBwYXJlbnRJbmRleCgpIHtcblx0XHRyZXR1cm4gdGhpcy5yYW5nZXMuZ2V0UGFyZW50SW5kZXgodGhpcy5pbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzQ29sbGFwc2VkKCkge1xuXHRcdHJldHVybiB0aGlzLnJhbmdlcy5pc0NvbGxhcHNlZCh0aGlzLmluZGV4KTtcblx0fVxuXG5cdGNvbnRhaW5lZEJ5KHJhbmdlOiBJTGluZVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSB0aGlzLnN0YXJ0TGluZU51bWJlciAmJiByYW5nZS5lbmRMaW5lTnVtYmVyID49IHRoaXMuZW5kTGluZU51bWJlcjtcblx0fVxuXHRjb250YWluc0xpbmUobGluZU51bWJlcjogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhcnRMaW5lTnVtYmVyIDw9IGxpbmVOdW1iZXIgJiYgbGluZU51bWJlciA8PSB0aGlzLmVuZExpbmVOdW1iZXI7XG5cdH1cblx0aGlkZXNMaW5lKGxpbmVOdW1iZXI6IG51bWJlcikge1xuXHRcdHJldHVybiB0aGlzLnN0YXJ0TGluZU51bWJlciA8IGxpbmVOdW1iZXIgJiYgbGluZU51bWJlciA8PSB0aGlzLmVuZExpbmVOdW1iZXI7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQVlPLElBQVcsYUFBWCxrQkFBV0EsZ0JBQVg7QUFDTixFQUFBQSx3QkFBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSx3QkFBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsd0JBQUEsZUFBWSxLQUFaO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQU1YLE1BQU0saUJBQWlCO0FBQUEsRUFDN0IsQ0FBQyxnQkFBbUIsR0FBRztBQUFBLEVBQ3ZCLENBQUMsbUJBQXNCLEdBQUc7QUFBQSxFQUMxQixDQUFDLGlCQUFvQixHQUFHO0FBQ3pCO0FBVU8sTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxrQkFBa0I7QUFFL0IsTUFBTSxjQUFjO0FBRXBCLE1BQU0sU0FBUztBQUFBLEVBRWQsWUFBWSxNQUFjO0FBQ3pCLFVBQU0sV0FBVyxLQUFLLEtBQUssT0FBTyxFQUFFO0FBQ3BDLFNBQUssVUFBVSxJQUFJLFlBQVksUUFBUTtB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
