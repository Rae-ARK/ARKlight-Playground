import { CharCode } from "../../../base/common/charCode.js";
import { LcsDiff } from "../../../base/common/diff/diff.js";
import { LinesDiff } from "./linesDiffComputer.js";
import { RangeMapping, DetailedLineRangeMapping } from "./rangeMapping.js";
import * as strings from "../../../base/common/strings.js";
import { Range } from "../core/range.js";
import { assertFn, checkAdjacentItems } from "../../../base/common/assert.js";
import { LineRange } from "../core/ranges/lineRange.js";
const MINIMUM_MATCHING_CHARACTER_LENGTH = 3;
class LegacyLinesDiffComputer {
  computeDiff(originalLines, modifiedLines, options) {
    const diffComputer = new DiffComputer(originalLines, modifiedLines, {
      maxComputationTime: options.maxComputationTimeMs,
      shouldIgnoreTrimWhitespace: options.ignoreTrimWhitespace,
      shouldComputeCharChanges: true,
      shouldMakePrettyDiff: true,
      shouldPostProcessCharChanges: true
    });
    const result = diffComputer.computeDiff();
    const changes = [];
    let lastChange = null;
    for (const c of result.changes) {
      let originalRange;
      if (c.originalEndLineNumber === 0) {
        originalRange = new LineRange(c.originalStartLineNumber + 1, c.originalStartLineNumber + 1);
      } else {
        originalRange = new LineRange(c.originalStartLineNumber, c.originalEndLineNumber + 1);
      }
      let modifiedRange;
      if (c.modifiedEndLineNumber === 0) {
        modifiedRange = new LineRange(c.modifiedStartLineNumber + 1, c.modifiedStartLineNumber + 1);
      } else {
        modifiedRange = new LineRange(c.modifiedStartLineNumber, c.modifiedEndLineNumber + 1);
      }
      let change = new DetailedLineRangeMapping(originalRange, modifiedRange, c.charChanges?.map((c2) => new RangeMapping(
        new Range(c2.originalStartLineNumber, c2.originalStartColumn, c2.originalEndLineNumber, c2.originalEndColumn),
        new Range(c2.modifiedStartLineNumber, c2.modifiedStartColumn, c2.modifiedEndLineNumber, c2.modifiedEndColumn)
      )));
      if (lastChange) {
        if (lastChange.modified.endLineNumberExclusive === change.modified.startLineNumber || lastChange.original.endLineNumberExclusive === change.original.startLineNumber) {
          change = new DetailedLineRangeMapping(
            lastChange.original.join(change.original),
            lastChange.modified.join(change.modified),
            lastChange.innerChanges && change.innerChanges ? lastChange.innerChanges.concat(change.innerChanges) : void 0
          );
          changes.pop();
        }
      }
      changes.push(change);
      lastChange = change;
    }
    assertFn(() => {
      return checkAdjacentItems(
        changes,
        (m1, m2) => m2.original.startLineNumber - m1.original.endLineNumberExclusive === m2.modified.startLineNumber - m1.modified.endLineNumberExclusive && // There has to be an unchanged line in between (otherwise both diffs should have been joined)
        m1.original.endLineNumberExclusive < m2.original.startLineNumber && m1.modified.endLineNumberExclusive < m2.modified.startLineNumber
      );
    });
    return new LinesDiff(changes, [], result.quitEarly);
  }
}
function computeDiff(originalSequence, modifiedSequence, continueProcessingPredicate, pretty) {
  const diffAlgo = new LcsDiff(originalSequence, modifiedSequence, continueProcessingPredicate);
  return diffAlgo.ComputeDiff(pretty);
}
class LineSequence {
  constructor(lines) {
    const startColumns = [];
    const endColumns = [];
    for (let i = 0, length = lines.length; i < length; i++) {
      startColumns[i] = getFirstNonBlankColumn(lines[i], 1);
      endColumns[i] = getLastNonBlankColumn(lines[i], 1);
    }
    this.lines = lines;
    this._startColumns = startColumns;
    this._endColumns = endColumns;
  }
  getElements() {
    const elements = [];
    for (let i = 0, len = this.lines.length; i < len; i++) {
      elements[i] = this.lines[i].substring(this._startColumns[i] - 1, this._endColumns[i] - 1);
    }
    return elements;
  }
  getStrictElement(index) {
    return this.lines[index];
  }
  getStartLineNumber(i) {
    return i + 1;
  }
  getEndLineNumber(i) {
    return i + 1;
  }
  createCharSequence(shouldIgnoreTrimWhitespace, startIndex, endIndex) {
    const charCodes = [];
    const lineNumbers = [];
    const columns = [];
    let len = 0;
    for (let index = startIndex; index <= endIndex; index++) {
      const lineContent = this.lines[index];
      const startColumn = shouldIgnoreTrimWhitespace ? this._startColumns[index] : 1;
      const endColumn = shouldIgnoreTrimWhitespace ? this._endColumns[index] : lineContent.length + 1;
      for (let col = startColumn; col < endColumn; col++) {
        charCodes[len] = lineContent.charCodeAt(col - 1);
        lineNumbers[len] = index + 1;
        columns[len] = col;
        len++;
      }
      if (!shouldIgnoreTrimWhitespace && index < endIndex) {
        charCodes[len] = CharCode.LineFeed;
        lineNumbers[len] = index + 1;
        columns[len] = lineContent.length + 1;
        len++;
      }
    }
    return new CharSequence(charCodes, lineNumbers, columns);
  }
}
class CharSequence {
  constructor(charCodes, lineNumbers, columns) {
    this._charCodes = charCodes;
    this._lineNumbers = lineNumbers;
    this._columns = columns;
  }
  toString() {
    return "[" + this._charCodes.map((s, idx) => (s === CharCode.LineFeed ? "\\n" : String.fromCharCode(s)) + `-(${this._lineNumbers[idx]},${this._columns[idx]})`).join(", ") + "]";
  }
  _assertIndex(index, arr) {
    if (index < 0 || index >= arr.length) {
      throw new Error(`Illegal index`);
    }
  }
  getElements() {
    return this._charCodes;
  }
  getStartLineNumber(i) {
    if (i > 0 && i === this._lineNumbers.length) {
      return this.getEndLineNumber(i - 1);
    }
    this._assertIndex(i, this._lineNumbers);
    return this._lineNumbers[i];
  }
  getEndLineNumber(i) {
    if (i === -1) {
      return this.getStartLineNumber(i + 1);
    }
    this._assertIndex(i, this._lineNumbers);
    if (this._charCodes[i] === CharCode.LineFeed) {
      return this._lineNumbers[i] + 1;
    }
    return this._lineNumbers[i];
  }
  getStartColumn(i) {
    if (i > 0 && i === this._columns.length) {
      return this.getEndColumn(i - 1);
    }
    this._assertIndex(i, this._columns);
    return this._columns[i];
  }
  getEndColumn(i) {
    if (i === -1) {
      return this.getStartColumn(i + 1);
    }
    this._assertIndex(i, this._columns);
    if (this._charCodes[i] === CharCode.LineFeed) {
      return 1;
    }
    return this._columns[i] + 1;
  }
}
class CharChange {
  constructor(originalStartLineNumber, originalStartColumn, originalEndLineNumber, originalEndColumn, modifiedStartLineNumber, modifiedStartColumn, modifiedEndLineNumber, modifiedEndColumn) {
    this.originalStartLineNumber = originalStartLineNumber;
    this.originalStartColumn = originalStartColumn;
    this.originalEndLineNumber = originalEndLineNumber;
    this.originalEndColumn = originalEndColumn;
    this.modifiedStartLineNumber = modifiedStartLineNumber;
    this.modifiedStartColumn = modifiedStartColumn;
    this.modifiedEndLineNumber = modifiedEndLineNumber;
    this.modifiedEndColumn = modifiedEndColumn;
  }
  static createFromDiffChange(diffChange, originalCharSequence, modifiedCharSequence) {
    const originalStartLineNumber = originalCharSequence.getStartLineNumber(diffChange.originalStart);
    const originalStartColumn = originalCharSequence.getStartColumn(diffChange.originalStart);
    const originalEndLineNumber = originalCharSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
    const originalEndColumn = originalCharSequence.getEndColumn(diffChange.originalStart + diffChange.originalLength - 1);
    const modifiedStartLineNumber = modifiedCharSequence.getStartLineNumber(diffChange.modifiedStart);
    const modifiedStartColumn = modifiedCharSequence.getStartColumn(diffChange.modifiedStart);
    const modifiedEndLineNumber = modifiedCharSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
    const modifiedEndColumn = modifiedCharSequence.getEndColumn(diffChange.modifiedStart + diffChange.modifiedLength - 1);
    return new CharChange(
      originalStartLineNumber,
      originalStartColumn,
      originalEndLineNumber,
      originalEndColumn,
      modifiedStartLineNumber,
      modifiedStartColumn,
      modifiedEndLineNumber,
      modifiedEndColumn
    );
  }
}
function postProcessCharChanges(rawChanges) {
  if (rawChanges.length <= 1) {
    return rawChanges;
  }
  const result = [rawChanges[0]];
  let prevChange = result[0];
  for (let i = 1, len = rawChanges.length; i < len; i++) {
    const currChange = rawChanges[i];
    const originalMatchingLength = currChange.originalStart - (prevChange.originalStart + prevChange.originalLength);
    const modifiedMatchingLength = currChange.modifiedStart - (prevChange.modifiedStart + prevChange.modifiedLength);
    const matchingLength = Math.min(originalMatchingLength, modifiedMatchingLength);
    if (matchingLength < MINIMUM_MATCHING_CHARACTER_LENGTH) {
      prevChange.originalLength = currChange.originalStart + currChange.originalLength - prevChange.originalStart;
      prevChange.modifiedLength = currChange.modifiedStart + currChange.modifiedLength - prevChange.modifiedStart;
    } else {
      result.push(currChange);
      prevChange = currChange;
    }
  }
  return result;
}
class LineChange {
  constructor(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges) {
    this.originalStartLineNumber = originalStartLineNumber;
    this.originalEndLineNumber = originalEndLineNumber;
    this.modifiedStartLineNumber = modifiedStartLineNumber;
    this.modifiedEndLineNumber = modifiedEndLineNumber;
    this.charChanges = charChanges;
  }
  static createFromDiffResult(shouldIgnoreTrimWhitespace, diffChange, originalLineSequence, modifiedLineSequence, continueCharDiff, shouldComputeCharChanges, shouldPostProcessCharChanges) {
    let originalStartLineNumber;
    let originalEndLineNumber;
    let modifiedStartLineNumber;
    let modifiedEndLineNumber;
    let charChanges = void 0;
    if (diffChange.originalLength === 0) {
      originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart) - 1;
      originalEndLineNumber = 0;
    } else {
      originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart);
      originalEndLineNumber = originalLineSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
    }
    if (diffChange.modifiedLength === 0) {
      modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart) - 1;
      modifiedEndLineNumber = 0;
    } else {
      modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart);
      modifiedEndLineNumber = modifiedLineSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
    }
    if (shouldComputeCharChanges && diffChange.originalLength > 0 && diffChange.originalLength < 20 && diffChange.modifiedLength > 0 && diffChange.modifiedLength < 20 && continueCharDiff()) {
      const originalCharSequence = originalLineSequence.createCharSequence(shouldIgnoreTrimWhitespace, diffChange.originalStart, diffChange.originalStart + diffChange.originalLength - 1);
      const modifiedCharSequence = modifiedLineSequence.createCharSequence(shouldIgnoreTrimWhitespace, diffChange.modifiedStart, diffChange.modifiedStart + diffChange.modifiedLength - 1);
      if (originalCharSequence.getElements().length > 0 && modifiedCharSequence.getElements().length > 0) {
        let rawChanges = computeDiff(originalCharSequence, modifiedCharSequence, continueCharDiff, true).changes;
        if (shouldPostProcessCharChanges) {
          rawChanges = postProcessCharChanges(rawChanges);
        }
        charChanges = [];
        for (let i = 0, length = rawChanges.length; i < length; i++) {
          charChanges.push(CharChange.createFromDiffChange(rawChanges[i], originalCharSequence, modifiedCharSequence));
        }
      }
    }
    return new LineChange(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges);
  }
}
class DiffComputer {
  constructor(originalLines, modifiedLines, opts) {
    this.shouldComputeCharChanges = opts.shouldComputeCharChanges;
    this.shouldPostProcessCharChanges = opts.shouldPostProcessCharChanges;
    this.shouldIgnoreTrimWhitespace = opts.shouldIgnoreTrimWhitespace;
    this.shouldMakePrettyDiff = opts.shouldMakePrettyDiff;
    this.originalLines = originalLines;
    this.modifiedLines = modifiedLines;
    this.original = new LineSequence(originalLines);
    this.modified = new LineSequence(modifiedLines);
    this.continueLineDiff = createContinueProcessingPredicate(opts.maxComputationTime);
    this.continueCharDiff = createContinueProcessingPredicate(opts.maxComputationTime === 0 ? 0 : Math.min(opts.maxComputationTime, 5e3));
  }
  computeDiff() {
    if (this.original.lines.length === 1 && this.original.lines[0].length === 0) {
      if (this.modified.lines.length === 1 && this.modified.lines[0].length === 0) {
        return {
          quitEarly: false,
          changes: []
        };
      }
      return {
        quitEarly: false,
        changes: [{
          originalStartLineNumber: 1,
          originalEndLineNumber: 1,
          modifiedStartLineNumber: 1,
          modifiedEndLineNumber: this.modified.lines.length,
          charChanges: void 0
        }]
      };
    }
    if (this.modified.lines.length === 1 && this.modified.lines[0].length === 0) {
      return {
        quitEarly: false,
        changes: [{
          originalStartLineNumber: 1,
          originalEndLineNumber: this.original.lines.length,
          modifiedStartLineNumber: 1,
          modifiedEndLineNumber: 1,
          charChanges: void 0
        }]
      };
    }
    const diffResult = computeDiff(this.original, this.modified, this.continueLineDiff, this.shouldMakePrettyDiff);
    const rawChanges = diffResult.changes;
    const quitEarly = diffResult.quitEarly;
    if (this.shouldIgnoreTrimWhitespace) {
      const lineChanges = [];
      for (let i = 0, length = rawChanges.length; i < length; i++) {
        lineChanges.push(LineChange.createFromDiffResult(this.shouldIgnoreTrimWhitespace, rawChanges[i], this.original, this.modified, this.continueCharDiff, this.shouldComputeCharChanges, this.shouldPostProcessCharChanges));
      }
      return {
        quitEarly,
        changes: lineChanges
      };
    }
    const result = [];
    let originalLineIndex = 0;
    let modifiedLineIndex = 0;
    for (let i = -1, len = rawChanges.length; i < len; i++) {
      const nextChange = i + 1 < len ? rawChanges[i + 1] : null;
      const originalStop = nextChange ? nextChange.originalStart : this.originalLines.length;
      const modifiedStop = nextChange ? nextChange.modifiedStart : this.modifiedLines.length;
      while (originalLineIndex < originalStop && modifiedLineIndex < modifiedStop) {
        const originalLine = this.originalLines[originalLineIndex];
        const modifiedLine = this.modifiedLines[modifiedLineIndex];
        if (originalLine !== modifiedLine) {
          {
            let originalStartColumn = getFirstNonBlankColumn(originalLine, 1);
            let modifiedStartColumn = getFirstNonBlankColumn(modifiedLine, 1);
            while (originalStartColumn > 1 && modifiedStartColumn > 1) {
              const originalChar = originalLine.charCodeAt(originalStartColumn - 2);
              const modifiedChar = modifiedLine.charCodeAt(modifiedStartColumn - 2);
              if (originalChar !== modifiedChar) {
                break;
              }
              originalStartColumn--;
              modifiedStartColumn--;
            }
            if (originalStartColumn > 1 || modifiedStartColumn > 1) {
              this._pushTrimWhitespaceCharChange(
                result,
                originalLineIndex + 1,
                1,
                originalStartColumn,
                modifiedLineIndex + 1,
                1,
                modifiedStartColumn
              );
            }
          }
          {
            let originalEndColumn = getLastNonBlankColumn(originalLine, 1);
            let modifiedEndColumn = getLastNonBlankColumn(modifiedLine, 1);
            const originalMaxColumn = originalLine.length + 1;
            const modifiedMaxColumn = modifiedLine.length + 1;
            while (originalEndColumn < originalMaxColumn && modifiedEndColumn < modifiedMaxColumn) {
              const originalChar = originalLine.charCodeAt(originalEndColumn - 1);
              const modifiedChar = originalLine.charCodeAt(modifiedEndColumn - 1);
              if (originalChar !== modifiedChar) {
                break;
              }
              originalEndColumn++;
              modifiedEndColumn++;
            }
            if (originalEndColumn < originalMaxColumn || modifiedEndColumn < modifiedMaxColumn) {
              this._pushTrimWhitespaceCharChange(
                result,
                originalLineIndex + 1,
                originalEndColumn,
                originalMaxColumn,
                modifiedLineIndex + 1,
                modifiedEndColumn,
                modifiedMaxColumn
              );
            }
          }
        }
        originalLineIndex++;
        modifiedLineIndex++;
      }
      if (nextChange) {
        result.push(LineChange.createFromDiffResult(this.shouldIgnoreTrimWhitespace, nextChange, this.original, this.modified, this.continueCharDiff, this.shouldComputeCharChanges, this.shouldPostProcessCharChanges));
        originalLineIndex += nextChange.originalLength;
        modifiedLineIndex += nextChange.modifiedLength;
      }
    }
    return {
      quitEarly,
      changes: result
    };
  }
  _pushTrimWhitespaceCharChange(result, originalLineNumber, originalStartColumn, originalEndColumn, modifiedLineNumber, modifiedStartColumn, modifiedEndColumn) {
    if (this._mergeTrimWhitespaceCharChange(result, originalLineNumber, originalStartColumn, originalEndColumn, modifiedLineNumber, modifiedStartColumn, modifiedEndColumn)) {
      return;
    }
    let charChanges = void 0;
    if (this.shouldComputeCharChanges) {
      charChanges = [new CharChange(
        originalLineNumber,
        originalStartColumn,
        originalLineNumber,
        originalEndColumn,
        modifiedLineNumber,
        modifiedStartColumn,
        modifiedLineNumber,
        modifiedEndColumn
      )];
    }
    result.push(new LineChange(
      originalLineNumber,
      originalLineNumber,
      modifiedLineNumber,
      modifiedLineNumber,
      charChanges
    ));
  }
  _mergeTrimWhitespaceCharChange(result, originalLineNumber, originalStartColumn, originalEndColumn, modifiedLineNumber, modifiedStartColumn, modifiedEndColumn) {
    const len = result.length;
    if (len === 0) {
      return false;
    }
    const prevChange = result[len - 1];
    if (prevChange.originalEndLineNumber === 0 || prevChange.modifiedEndLineNumber === 0) {
      return false;
    }
    if (prevChange.originalEndLineNumber === originalLineNumber && prevChange.modifiedEndLineNumber === modifiedLineNumber) {
      if (this.shouldComputeCharChanges && prevChange.charChanges) {
        prevChange.charChanges.push(new CharChange(
          originalLineNumber,
          originalStartColumn,
          originalLineNumber,
          originalEndColumn,
          modifiedLineNumber,
          modifiedStartColumn,
          modifiedLineNumber,
          modifiedEndColumn
        ));
      }
      return true;
    }
    if (prevChange.originalEndLineNumber + 1 === originalLineNumber && prevChange.modifiedEndLineNumber + 1 === modifiedLineNumber) {
      prevChange.originalEndLineNumber = originalLineNumber;
      prevChange.modifiedEndLineNumber = modifiedLineNumber;
      if (this.shouldComputeCharChanges && prevChange.charChanges) {
        prevChange.charChanges.push(new CharChange(
          originalLineNumber,
          originalStartColumn,
          originalLineNumber,
          originalEndColumn,
          modifiedLineNumber,
          modifiedStartColumn,
          modifiedLineNumber,
          modifiedEndColumn
        ));
      }
      return true;
    }
    return false;
  }
}
function getFirstNonBlankColumn(txt, defaultValue) {
  const r = strings.firstNonWhitespaceIndex(txt);
  if (r === -1) {
    return defaultValue;
  }
  return r + 1;
}
function getLastNonBlankColumn(txt, defaultValue) {
  const r = strings.lastNonWhitespaceIndex(txt);
  if (r === -1) {
    return defaultValue;
  }
  return r + 2;
}
function createContinueProcessingPredicate(maximumRuntime) {
  if (maximumRuntime === 0) {
    return () => true;
  }
  const startTime = Date.now();
  return () => {
    return Date.now() - startTime < maximumRuntime;
  };
}
export {
  DiffComputer,
  LegacyLinesDiffComputer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vZGlmZi9sZWdhY3lMaW5lc0RpZmZDb21wdXRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgSURpZmZDaGFuZ2UsIElTZXF1ZW5jZSwgTGNzRGlmZiwgSURpZmZSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kaWZmL2RpZmYuanMnO1xuaW1wb3J0IHsgSUxpbmVzRGlmZkNvbXB1dGVyLCBJTGluZXNEaWZmQ29tcHV0ZXJPcHRpb25zLCBMaW5lc0RpZmYgfSBmcm9tICcuL2xpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IFJhbmdlTWFwcGluZywgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRGbiwgY2hlY2tBZGphY2VudEl0ZW1zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5cbmNvbnN0IE1JTklNVU1fTUFUQ0hJTkdfQ0hBUkFDVEVSX0xFTkdUSCA9IDM7XG5cbmV4cG9ydCBjbGFzcyBMZWdhY3lMaW5lc0RpZmZDb21wdXRlciBpbXBsZW1lbnRzIElMaW5lc0RpZmZDb21wdXRlciB7XG5cdGNvbXB1dGVEaWZmKG9yaWdpbmFsTGluZXM6IHN0cmluZ1tdLCBtb2RpZmllZExpbmVzOiBzdHJpbmdbXSwgb3B0aW9uczogSUxpbmVzRGlmZkNvbXB1dGVyT3B0aW9ucyk6IExpbmVzRGlmZiB7XG5cdFx0Y29uc3QgZGlmZkNvbXB1dGVyID0gbmV3IERpZmZDb21wdXRlcihvcmlnaW5hbExpbmVzLCBtb2RpZmllZExpbmVzLCB7XG5cdFx0XHRtYXhDb21wdXRhdGlvblRpbWU6IG9wdGlvbnMubWF4Q29tcHV0YXRpb25UaW1lTXMsXG5cdFx0XHRzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZTogb3B0aW9ucy5pZ25vcmVUcmltV2hpdGVzcGFjZSxcblx0XHRcdHNob3VsZENvbXB1dGVDaGFyQ2hhbmdlczogdHJ1ZSxcblx0XHRcdHNob3VsZE1ha2VQcmV0dHlEaWZmOiB0cnVlLFxuXHRcdFx0c2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlczogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBkaWZmQ29tcHV0ZXIuY29tcHV0ZURpZmYoKTtcblx0XHRjb25zdCBjaGFuZ2VzOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSA9IFtdO1xuXHRcdGxldCBsYXN0Q2hhbmdlOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfCBudWxsID0gbnVsbDtcblxuXG5cdFx0Zm9yIChjb25zdCBjIG9mIHJlc3VsdC5jaGFuZ2VzKSB7XG5cdFx0XHRsZXQgb3JpZ2luYWxSYW5nZTogTGluZVJhbmdlO1xuXHRcdFx0aWYgKGMub3JpZ2luYWxFbmRMaW5lTnVtYmVyID09PSAwKSB7XG5cdFx0XHRcdC8vIEluc2VydGlvblxuXHRcdFx0XHRvcmlnaW5hbFJhbmdlID0gbmV3IExpbmVSYW5nZShjLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyICsgMSwgYy5vcmlnaW5hbFN0YXJ0TGluZU51bWJlciArIDEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3JpZ2luYWxSYW5nZSA9IG5ldyBMaW5lUmFuZ2UoYy5vcmlnaW5hbFN0YXJ0TGluZU51bWJlciwgYy5vcmlnaW5hbEVuZExpbmVOdW1iZXIgKyAxKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG1vZGlmaWVkUmFuZ2U6IExpbmVSYW5nZTtcblx0XHRcdGlmIChjLm1vZGlmaWVkRW5kTGluZU51bWJlciA9PT0gMCkge1xuXHRcdFx0XHQvLyBEZWxldGlvblxuXHRcdFx0XHRtb2RpZmllZFJhbmdlID0gbmV3IExpbmVSYW5nZShjLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyICsgMSwgYy5tb2RpZmllZFN0YXJ0TGluZU51bWJlciArIDEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW9kaWZpZWRSYW5nZSA9IG5ldyBMaW5lUmFuZ2UoYy5tb2RpZmllZFN0YXJ0TGluZU51bWJlciwgYy5tb2RpZmllZEVuZExpbmVOdW1iZXIgKyAxKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGNoYW5nZSA9IG5ldyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcob3JpZ2luYWxSYW5nZSwgbW9kaWZpZWRSYW5nZSwgYy5jaGFyQ2hhbmdlcz8ubWFwKGMgPT4gbmV3IFJhbmdlTWFwcGluZyhcblx0XHRcdFx0bmV3IFJhbmdlKGMub3JpZ2luYWxTdGFydExpbmVOdW1iZXIsIGMub3JpZ2luYWxTdGFydENvbHVtbiwgYy5vcmlnaW5hbEVuZExpbmVOdW1iZXIsIGMub3JpZ2luYWxFbmRDb2x1bW4pLFxuXHRcdFx0XHRuZXcgUmFuZ2UoYy5tb2RpZmllZFN0YXJ0TGluZU51bWJlciwgYy5tb2RpZmllZFN0YXJ0Q29sdW1uLCBjLm1vZGlmaWVkRW5kTGluZU51bWJlciwgYy5tb2RpZmllZEVuZENvbHVtbiksXG5cdFx0XHQpKSk7XG5cdFx0XHRpZiAobGFzdENoYW5nZSkge1xuXHRcdFx0XHRpZiAobGFzdENoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlID09PSBjaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyXG5cdFx0XHRcdFx0fHwgbGFzdENoYW5nZS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlID09PSBjaGFuZ2Uub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Ly8gam9pbiB0b3VjaGluZyBkaWZmcy4gUHJvYmFibHkgbW92aW5nIGRpZmZzIHVwL2Rvd24gaW4gdGhlIGFsZ29yaXRobSBjYXVzZXMgdG91Y2hpbmcgZGlmZnMuXG5cdFx0XHRcdFx0Y2hhbmdlID0gbmV3IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyhcblx0XHRcdFx0XHRcdGxhc3RDaGFuZ2Uub3JpZ2luYWwuam9pbihjaGFuZ2Uub3JpZ2luYWwpLFxuXHRcdFx0XHRcdFx0bGFzdENoYW5nZS5tb2RpZmllZC5qb2luKGNoYW5nZS5tb2RpZmllZCksXG5cdFx0XHRcdFx0XHRsYXN0Q2hhbmdlLmlubmVyQ2hhbmdlcyAmJiBjaGFuZ2UuaW5uZXJDaGFuZ2VzID9cblx0XHRcdFx0XHRcdFx0bGFzdENoYW5nZS5pbm5lckNoYW5nZXMuY29uY2F0KGNoYW5nZS5pbm5lckNoYW5nZXMpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRjaGFuZ2VzLnBvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNoYW5nZXMucHVzaChjaGFuZ2UpO1xuXHRcdFx0bGFzdENoYW5nZSA9IGNoYW5nZTtcblx0XHR9XG5cblx0XHRhc3NlcnRGbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY2hlY2tBZGphY2VudEl0ZW1zKGNoYW5nZXMsXG5cdFx0XHRcdChtMSwgbTIpID0+IG0yLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciAtIG0xLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPT09IG0yLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciAtIG0xLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgJiZcblx0XHRcdFx0XHQvLyBUaGVyZSBoYXMgdG8gYmUgYW4gdW5jaGFuZ2VkIGxpbmUgaW4gYmV0d2VlbiAob3RoZXJ3aXNlIGJvdGggZGlmZnMgc2hvdWxkIGhhdmUgYmVlbiBqb2luZWQpXG5cdFx0XHRcdFx0bTEub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA8IG0yLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciAmJlxuXHRcdFx0XHRcdG0xLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPCBtMi5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG5ldyBMaW5lc0RpZmYoY2hhbmdlcywgW10sIHJlc3VsdC5xdWl0RWFybHkpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpZmZDb21wdXRhdGlvblJlc3VsdCB7XG5cdHF1aXRFYXJseTogYm9vbGVhbjtcblx0aWRlbnRpY2FsOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgY2hhbmdlcyBhcyAobGVnYWN5KSBsaW5lIGNoYW5nZSBhcnJheS5cblx0ICogQGRlcHJlY2F0ZWQgVXNlIGBjaGFuZ2VzMmAgaW5zdGVhZC5cblx0ICovXG5cdGNoYW5nZXM6IElMaW5lQ2hhbmdlW107XG5cblx0LyoqXG5cdCAqIFRoZSBjaGFuZ2VzIGFzIChtb2Rlcm4pIGxpbmUgcmFuZ2UgbWFwcGluZyBhcnJheS5cblx0ICovXG5cdGNoYW5nZXMyOiByZWFkb25seSBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXTtcbn1cblxuLyoqXG4gKiBBIGNoYW5nZVxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGFuZ2Uge1xuXHRyZWFkb25seSBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSBvcmlnaW5hbEVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgbW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgbW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBjaGFyYWN0ZXIgbGV2ZWwgY2hhbmdlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGFyQ2hhbmdlIGV4dGVuZHMgSUNoYW5nZSB7XG5cdHJlYWRvbmx5IG9yaWdpbmFsU3RhcnRDb2x1bW46IG51bWJlcjtcblx0cmVhZG9ubHkgb3JpZ2luYWxFbmRDb2x1bW46IG51bWJlcjtcblx0cmVhZG9ubHkgbW9kaWZpZWRTdGFydENvbHVtbjogbnVtYmVyO1xuXHRyZWFkb25seSBtb2RpZmllZEVuZENvbHVtbjogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgbGluZSBjaGFuZ2VcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTGluZUNoYW5nZSBleHRlbmRzIElDaGFuZ2Uge1xuXHRyZWFkb25seSBjaGFyQ2hhbmdlczogSUNoYXJDaGFuZ2VbXSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlmZkNvbXB1dGVyUmVzdWx0IHtcblx0cXVpdEVhcmx5OiBib29sZWFuO1xuXHRjaGFuZ2VzOiBJTGluZUNoYW5nZVtdO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlRGlmZihvcmlnaW5hbFNlcXVlbmNlOiBJU2VxdWVuY2UsIG1vZGlmaWVkU2VxdWVuY2U6IElTZXF1ZW5jZSwgY29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlOiAoKSA9PiBib29sZWFuLCBwcmV0dHk6IGJvb2xlYW4pOiBJRGlmZlJlc3VsdCB7XG5cdGNvbnN0IGRpZmZBbGdvID0gbmV3IExjc0RpZmYob3JpZ2luYWxTZXF1ZW5jZSwgbW9kaWZpZWRTZXF1ZW5jZSwgY29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlKTtcblx0cmV0dXJuIGRpZmZBbGdvLkNvbXB1dGVEaWZmKHByZXR0eSk7XG59XG5cbmNsYXNzIExpbmVTZXF1ZW5jZSBpbXBsZW1lbnRzIElTZXF1ZW5jZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IGxpbmVzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRDb2x1bW5zOiBudW1iZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5kQ29sdW1uczogbnVtYmVyW107XG5cblx0Y29uc3RydWN0b3IobGluZXM6IHN0cmluZ1tdKSB7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW5zOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGVuZENvbHVtbnM6IG51bWJlcltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbmd0aCA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRzdGFydENvbHVtbnNbaV0gPSBnZXRGaXJzdE5vbkJsYW5rQ29sdW1uKGxpbmVzW2ldLCAxKTtcblx0XHRcdGVuZENvbHVtbnNbaV0gPSBnZXRMYXN0Tm9uQmxhbmtDb2x1bW4obGluZXNbaV0sIDEpO1xuXHRcdH1cblx0XHR0aGlzLmxpbmVzID0gbGluZXM7XG5cdFx0dGhpcy5fc3RhcnRDb2x1bW5zID0gc3RhcnRDb2x1bW5zO1xuXHRcdHRoaXMuX2VuZENvbHVtbnMgPSBlbmRDb2x1bW5zO1xuXHR9XG5cblx0cHVibGljIGdldEVsZW1lbnRzKCk6IEludDMyQXJyYXkgfCBudW1iZXJbXSB8IHN0cmluZ1tdIHtcblx0XHRjb25zdCBlbGVtZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5saW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0ZWxlbWVudHNbaV0gPSB0aGlzLmxpbmVzW2ldLnN1YnN0cmluZyh0aGlzLl9zdGFydENvbHVtbnNbaV0gLSAxLCB0aGlzLl9lbmRDb2x1bW5zW2ldIC0gMSk7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50cztcblx0fVxuXG5cdHB1YmxpYyBnZXRTdHJpY3RFbGVtZW50KGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmxpbmVzW2luZGV4XTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGFydExpbmVOdW1iZXIoaTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gaSArIDE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5kTGluZU51bWJlcihpOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBpICsgMTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVDaGFyU2VxdWVuY2Uoc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW4sIHN0YXJ0SW5kZXg6IG51bWJlciwgZW5kSW5kZXg6IG51bWJlcik6IENoYXJTZXF1ZW5jZSB7XG5cdFx0Y29uc3QgY2hhckNvZGVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbHVtbnM6IG51bWJlcltdID0gW107XG5cdFx0bGV0IGxlbiA9IDA7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSBzdGFydEluZGV4OyBpbmRleCA8PSBlbmRJbmRleDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB0aGlzLmxpbmVzW2luZGV4XTtcblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gKHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlID8gdGhpcy5fc3RhcnRDb2x1bW5zW2luZGV4XSA6IDEpO1xuXHRcdFx0Y29uc3QgZW5kQ29sdW1uID0gKHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlID8gdGhpcy5fZW5kQ29sdW1uc1tpbmRleF0gOiBsaW5lQ29udGVudC5sZW5ndGggKyAxKTtcblx0XHRcdGZvciAobGV0IGNvbCA9IHN0YXJ0Q29sdW1uOyBjb2wgPCBlbmRDb2x1bW47IGNvbCsrKSB7XG5cdFx0XHRcdGNoYXJDb2Rlc1tsZW5dID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjb2wgLSAxKTtcblx0XHRcdFx0bGluZU51bWJlcnNbbGVuXSA9IGluZGV4ICsgMTtcblx0XHRcdFx0Y29sdW1uc1tsZW5dID0gY29sO1xuXHRcdFx0XHRsZW4rKztcblx0XHRcdH1cblx0XHRcdGlmICghc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2UgJiYgaW5kZXggPCBlbmRJbmRleCkge1xuXHRcdFx0XHQvLyBBZGQgXFxuIGlmIHRyaW0gd2hpdGVzcGFjZSBpcyBub3QgaWdub3JlZFxuXHRcdFx0XHRjaGFyQ29kZXNbbGVuXSA9IENoYXJDb2RlLkxpbmVGZWVkO1xuXHRcdFx0XHRsaW5lTnVtYmVyc1tsZW5dID0gaW5kZXggKyAxO1xuXHRcdFx0XHRjb2x1bW5zW2xlbl0gPSBsaW5lQ29udGVudC5sZW5ndGggKyAxO1xuXHRcdFx0XHRsZW4rKztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBDaGFyU2VxdWVuY2UoY2hhckNvZGVzLCBsaW5lTnVtYmVycywgY29sdW1ucyk7XG5cdH1cbn1cblxuY2xhc3MgQ2hhclNlcXVlbmNlIGltcGxlbWVudHMgSVNlcXVlbmNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFyQ29kZXM6IG51bWJlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lTnVtYmVyczogbnVtYmVyW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbHVtbnM6IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKGNoYXJDb2RlczogbnVtYmVyW10sIGxpbmVOdW1iZXJzOiBudW1iZXJbXSwgY29sdW1uczogbnVtYmVyW10pIHtcblx0XHR0aGlzLl9jaGFyQ29kZXMgPSBjaGFyQ29kZXM7XG5cdFx0dGhpcy5fbGluZU51bWJlcnMgPSBsaW5lTnVtYmVycztcblx0XHR0aGlzLl9jb2x1bW5zID0gY29sdW1ucztcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZygpIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0J1snICsgdGhpcy5fY2hhckNvZGVzLm1hcCgocywgaWR4KSA9PiAocyA9PT0gQ2hhckNvZGUuTGluZUZlZWQgPyAnXFxcXG4nIDogU3RyaW5nLmZyb21DaGFyQ29kZShzKSkgKyBgLSgke3RoaXMuX2xpbmVOdW1iZXJzW2lkeF19LCR7dGhpcy5fY29sdW1uc1tpZHhdfSlgKS5qb2luKCcsICcpICsgJ10nXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2Fzc2VydEluZGV4KGluZGV4OiBudW1iZXIsIGFycjogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IGFyci5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSWxsZWdhbCBpbmRleGApO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRFbGVtZW50cygpOiBJbnQzMkFycmF5IHwgbnVtYmVyW10gfCBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXJDb2Rlcztcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGFydExpbmVOdW1iZXIoaTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoaSA+IDAgJiYgaSA9PT0gdGhpcy5fbGluZU51bWJlcnMubGVuZ3RoKSB7XG5cdFx0XHQvLyB0aGUgc3RhcnQgbGluZSBudW1iZXIgb2YgdGhlIGVsZW1lbnQgYWZ0ZXIgdGhlIGxhc3QgZWxlbWVudFxuXHRcdFx0Ly8gaXMgdGhlIGVuZCBsaW5lIG51bWJlciBvZiB0aGUgbGFzdCBlbGVtZW50XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRFbmRMaW5lTnVtYmVyKGkgLSAxKTtcblx0XHR9XG5cdFx0dGhpcy5fYXNzZXJ0SW5kZXgoaSwgdGhpcy5fbGluZU51bWJlcnMpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVOdW1iZXJzW2ldO1xuXHR9XG5cblx0cHVibGljIGdldEVuZExpbmVOdW1iZXIoaTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoaSA9PT0gLTEpIHtcblx0XHRcdC8vIHRoZSBlbmQgbGluZSBudW1iZXIgb2YgdGhlIGVsZW1lbnQgYmVmb3JlIHRoZSBmaXJzdCBlbGVtZW50XG5cdFx0XHQvLyBpcyB0aGUgc3RhcnQgbGluZSBudW1iZXIgb2YgdGhlIGZpcnN0IGVsZW1lbnRcblx0XHRcdHJldHVybiB0aGlzLmdldFN0YXJ0TGluZU51bWJlcihpICsgMSk7XG5cdFx0fVxuXHRcdHRoaXMuX2Fzc2VydEluZGV4KGksIHRoaXMuX2xpbmVOdW1iZXJzKTtcblxuXHRcdGlmICh0aGlzLl9jaGFyQ29kZXNbaV0gPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGluZU51bWJlcnNbaV0gKyAxO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbGluZU51bWJlcnNbaV07XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhcnRDb2x1bW4oaTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoaSA+IDAgJiYgaSA9PT0gdGhpcy5fY29sdW1ucy5sZW5ndGgpIHtcblx0XHRcdC8vIHRoZSBzdGFydCBjb2x1bW4gb2YgdGhlIGVsZW1lbnQgYWZ0ZXIgdGhlIGxhc3QgZWxlbWVudFxuXHRcdFx0Ly8gaXMgdGhlIGVuZCBjb2x1bW4gb2YgdGhlIGxhc3QgZWxlbWVudFxuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0RW5kQ29sdW1uKGkgLSAxKTtcblx0XHR9XG5cdFx0dGhpcy5fYXNzZXJ0SW5kZXgoaSwgdGhpcy5fY29sdW1ucyk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbHVtbnNbaV07XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5kQ29sdW1uKGk6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGkgPT09IC0xKSB7XG5cdFx0XHQvLyB0aGUgZW5kIGNvbHVtbiBvZiB0aGUgZWxlbWVudCBiZWZvcmUgdGhlIGZpcnN0IGVsZW1lbnRcblx0XHRcdC8vIGlzIHRoZSBzdGFydCBjb2x1bW4gb2YgdGhlIGZpcnN0IGVsZW1lbnRcblx0XHRcdHJldHVybiB0aGlzLmdldFN0YXJ0Q29sdW1uKGkgKyAxKTtcblx0XHR9XG5cdFx0dGhpcy5fYXNzZXJ0SW5kZXgoaSwgdGhpcy5fY29sdW1ucyk7XG5cblx0XHRpZiAodGhpcy5fY2hhckNvZGVzW2ldID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb2x1bW5zW2ldICsgMTtcblx0fVxufVxuXG5jbGFzcyBDaGFyQ2hhbmdlIGltcGxlbWVudHMgSUNoYXJDaGFuZ2Uge1xuXG5cdHB1YmxpYyBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgb3JpZ2luYWxTdGFydENvbHVtbjogbnVtYmVyO1xuXHRwdWJsaWMgb3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyBvcmlnaW5hbEVuZENvbHVtbjogbnVtYmVyO1xuXG5cdHB1YmxpYyBtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgbW9kaWZpZWRTdGFydENvbHVtbjogbnVtYmVyO1xuXHRwdWJsaWMgbW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyBtb2RpZmllZEVuZENvbHVtbjogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0b3JpZ2luYWxTdGFydENvbHVtbjogbnVtYmVyLFxuXHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdG9yaWdpbmFsRW5kQ29sdW1uOiBudW1iZXIsXG5cdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRtb2RpZmllZFN0YXJ0Q29sdW1uOiBudW1iZXIsXG5cdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0bW9kaWZpZWRFbmRDb2x1bW46IG51bWJlclxuXHQpIHtcblx0XHR0aGlzLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyID0gb3JpZ2luYWxTdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5vcmlnaW5hbFN0YXJ0Q29sdW1uID0gb3JpZ2luYWxTdGFydENvbHVtbjtcblx0XHR0aGlzLm9yaWdpbmFsRW5kTGluZU51bWJlciA9IG9yaWdpbmFsRW5kTGluZU51bWJlcjtcblx0XHR0aGlzLm9yaWdpbmFsRW5kQ29sdW1uID0gb3JpZ2luYWxFbmRDb2x1bW47XG5cdFx0dGhpcy5tb2RpZmllZFN0YXJ0TGluZU51bWJlciA9IG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyO1xuXHRcdHRoaXMubW9kaWZpZWRTdGFydENvbHVtbiA9IG1vZGlmaWVkU3RhcnRDb2x1bW47XG5cdFx0dGhpcy5tb2RpZmllZEVuZExpbmVOdW1iZXIgPSBtb2RpZmllZEVuZExpbmVOdW1iZXI7XG5cdFx0dGhpcy5tb2RpZmllZEVuZENvbHVtbiA9IG1vZGlmaWVkRW5kQ29sdW1uO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGVGcm9tRGlmZkNoYW5nZShkaWZmQ2hhbmdlOiBJRGlmZkNoYW5nZSwgb3JpZ2luYWxDaGFyU2VxdWVuY2U6IENoYXJTZXF1ZW5jZSwgbW9kaWZpZWRDaGFyU2VxdWVuY2U6IENoYXJTZXF1ZW5jZSk6IENoYXJDaGFuZ2Uge1xuXHRcdGNvbnN0IG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyID0gb3JpZ2luYWxDaGFyU2VxdWVuY2UuZ2V0U3RhcnRMaW5lTnVtYmVyKGRpZmZDaGFuZ2Uub3JpZ2luYWxTdGFydCk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTdGFydENvbHVtbiA9IG9yaWdpbmFsQ2hhclNlcXVlbmNlLmdldFN0YXJ0Q29sdW1uKGRpZmZDaGFuZ2Uub3JpZ2luYWxTdGFydCk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxFbmRMaW5lTnVtYmVyID0gb3JpZ2luYWxDaGFyU2VxdWVuY2UuZ2V0RW5kTGluZU51bWJlcihkaWZmQ2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBkaWZmQ2hhbmdlLm9yaWdpbmFsTGVuZ3RoIC0gMSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxFbmRDb2x1bW4gPSBvcmlnaW5hbENoYXJTZXF1ZW5jZS5nZXRFbmRDb2x1bW4oZGlmZkNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgZGlmZkNoYW5nZS5vcmlnaW5hbExlbmd0aCAtIDEpO1xuXG5cdFx0Y29uc3QgbW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPSBtb2RpZmllZENoYXJTZXF1ZW5jZS5nZXRTdGFydExpbmVOdW1iZXIoZGlmZkNoYW5nZS5tb2RpZmllZFN0YXJ0KTtcblx0XHRjb25zdCBtb2RpZmllZFN0YXJ0Q29sdW1uID0gbW9kaWZpZWRDaGFyU2VxdWVuY2UuZ2V0U3RhcnRDb2x1bW4oZGlmZkNoYW5nZS5tb2RpZmllZFN0YXJ0KTtcblx0XHRjb25zdCBtb2RpZmllZEVuZExpbmVOdW1iZXIgPSBtb2RpZmllZENoYXJTZXF1ZW5jZS5nZXRFbmRMaW5lTnVtYmVyKGRpZmZDaGFuZ2UubW9kaWZpZWRTdGFydCArIGRpZmZDaGFuZ2UubW9kaWZpZWRMZW5ndGggLSAxKTtcblx0XHRjb25zdCBtb2RpZmllZEVuZENvbHVtbiA9IG1vZGlmaWVkQ2hhclNlcXVlbmNlLmdldEVuZENvbHVtbihkaWZmQ2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBkaWZmQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoIC0gMSk7XG5cblx0XHRyZXR1cm4gbmV3IENoYXJDaGFuZ2UoXG5cdFx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlciwgb3JpZ2luYWxTdGFydENvbHVtbiwgb3JpZ2luYWxFbmRMaW5lTnVtYmVyLCBvcmlnaW5hbEVuZENvbHVtbixcblx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLCBtb2RpZmllZFN0YXJ0Q29sdW1uLCBtb2RpZmllZEVuZExpbmVOdW1iZXIsIG1vZGlmaWVkRW5kQ29sdW1uLFxuXHRcdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcG9zdFByb2Nlc3NDaGFyQ2hhbmdlcyhyYXdDaGFuZ2VzOiBJRGlmZkNoYW5nZVtdKTogSURpZmZDaGFuZ2VbXSB7XG5cdGlmIChyYXdDaGFuZ2VzLmxlbmd0aCA8PSAxKSB7XG5cdFx0cmV0dXJuIHJhd0NoYW5nZXM7XG5cdH1cblxuXHRjb25zdCByZXN1bHQgPSBbcmF3Q2hhbmdlc1swXV07XG5cdGxldCBwcmV2Q2hhbmdlID0gcmVzdWx0WzBdO1xuXG5cdGZvciAobGV0IGkgPSAxLCBsZW4gPSByYXdDaGFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0Y29uc3QgY3VyckNoYW5nZSA9IHJhd0NoYW5nZXNbaV07XG5cblx0XHRjb25zdCBvcmlnaW5hbE1hdGNoaW5nTGVuZ3RoID0gY3VyckNoYW5nZS5vcmlnaW5hbFN0YXJ0IC0gKHByZXZDaGFuZ2Uub3JpZ2luYWxTdGFydCArIHByZXZDaGFuZ2Uub3JpZ2luYWxMZW5ndGgpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTWF0Y2hpbmdMZW5ndGggPSBjdXJyQ2hhbmdlLm1vZGlmaWVkU3RhcnQgLSAocHJldkNoYW5nZS5tb2RpZmllZFN0YXJ0ICsgcHJldkNoYW5nZS5tb2RpZmllZExlbmd0aCk7XG5cdFx0Ly8gQm90aCBvZiB0aGUgYWJvdmUgc2hvdWxkIGJlIGVxdWFsLCBidXQgdGhlIGNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZSBtYXkgcHJldmVudCB0aGlzIGZyb20gYmVpbmcgdHJ1ZVxuXHRcdGNvbnN0IG1hdGNoaW5nTGVuZ3RoID0gTWF0aC5taW4ob3JpZ2luYWxNYXRjaGluZ0xlbmd0aCwgbW9kaWZpZWRNYXRjaGluZ0xlbmd0aCk7XG5cblx0XHRpZiAobWF0Y2hpbmdMZW5ndGggPCBNSU5JTVVNX01BVENISU5HX0NIQVJBQ1RFUl9MRU5HVEgpIHtcblx0XHRcdC8vIE1lcmdlIHRoZSBjdXJyZW50IGNoYW5nZSBpbnRvIHRoZSBwcmV2aW91cyBvbmVcblx0XHRcdHByZXZDaGFuZ2Uub3JpZ2luYWxMZW5ndGggPSAoY3VyckNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgY3VyckNoYW5nZS5vcmlnaW5hbExlbmd0aCkgLSBwcmV2Q2hhbmdlLm9yaWdpbmFsU3RhcnQ7XG5cdFx0XHRwcmV2Q2hhbmdlLm1vZGlmaWVkTGVuZ3RoID0gKGN1cnJDaGFuZ2UubW9kaWZpZWRTdGFydCArIGN1cnJDaGFuZ2UubW9kaWZpZWRMZW5ndGgpIC0gcHJldkNoYW5nZS5tb2RpZmllZFN0YXJ0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBBZGQgdGhlIGN1cnJlbnQgY2hhbmdlXG5cdFx0XHRyZXN1bHQucHVzaChjdXJyQ2hhbmdlKTtcblx0XHRcdHByZXZDaGFuZ2UgPSBjdXJyQ2hhbmdlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmNsYXNzIExpbmVDaGFuZ2UgaW1wbGVtZW50cyBJTGluZUNoYW5nZSB7XG5cdHB1YmxpYyBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgb3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyBtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgbW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyBjaGFyQ2hhbmdlczogQ2hhckNoYW5nZVtdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRjaGFyQ2hhbmdlczogQ2hhckNoYW5nZVtdIHwgdW5kZWZpbmVkXG5cdCkge1xuXHRcdHRoaXMub3JpZ2luYWxTdGFydExpbmVOdW1iZXIgPSBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjtcblx0XHR0aGlzLm9yaWdpbmFsRW5kTGluZU51bWJlciA9IG9yaWdpbmFsRW5kTGluZU51bWJlcjtcblx0XHR0aGlzLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID0gbW9kaWZpZWRTdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5tb2RpZmllZEVuZExpbmVOdW1iZXIgPSBtb2RpZmllZEVuZExpbmVOdW1iZXI7XG5cdFx0dGhpcy5jaGFyQ2hhbmdlcyA9IGNoYXJDaGFuZ2VzO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGVGcm9tRGlmZlJlc3VsdChzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZTogYm9vbGVhbiwgZGlmZkNoYW5nZTogSURpZmZDaGFuZ2UsIG9yaWdpbmFsTGluZVNlcXVlbmNlOiBMaW5lU2VxdWVuY2UsIG1vZGlmaWVkTGluZVNlcXVlbmNlOiBMaW5lU2VxdWVuY2UsIGNvbnRpbnVlQ2hhckRpZmY6ICgpID0+IGJvb2xlYW4sIHNob3VsZENvbXB1dGVDaGFyQ2hhbmdlczogYm9vbGVhbiwgc2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlczogYm9vbGVhbik6IExpbmVDaGFuZ2Uge1xuXHRcdGxldCBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdGxldCBvcmlnaW5hbEVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgbW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgbW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0bGV0IGNoYXJDaGFuZ2VzOiBDaGFyQ2hhbmdlW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoZGlmZkNoYW5nZS5vcmlnaW5hbExlbmd0aCA9PT0gMCkge1xuXHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXIgPSBvcmlnaW5hbExpbmVTZXF1ZW5jZS5nZXRTdGFydExpbmVOdW1iZXIoZGlmZkNoYW5nZS5vcmlnaW5hbFN0YXJ0KSAtIDE7XG5cdFx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXIgPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlciA9IG9yaWdpbmFsTGluZVNlcXVlbmNlLmdldFN0YXJ0TGluZU51bWJlcihkaWZmQ2hhbmdlLm9yaWdpbmFsU3RhcnQpO1xuXHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyID0gb3JpZ2luYWxMaW5lU2VxdWVuY2UuZ2V0RW5kTGluZU51bWJlcihkaWZmQ2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBkaWZmQ2hhbmdlLm9yaWdpbmFsTGVuZ3RoIC0gMSk7XG5cdFx0fVxuXG5cdFx0aWYgKGRpZmZDaGFuZ2UubW9kaWZpZWRMZW5ndGggPT09IDApIHtcblx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID0gbW9kaWZpZWRMaW5lU2VxdWVuY2UuZ2V0U3RhcnRMaW5lTnVtYmVyKGRpZmZDaGFuZ2UubW9kaWZpZWRTdGFydCkgLSAxO1xuXHRcdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPSBtb2RpZmllZExpbmVTZXF1ZW5jZS5nZXRTdGFydExpbmVOdW1iZXIoZGlmZkNoYW5nZS5tb2RpZmllZFN0YXJ0KTtcblx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlciA9IG1vZGlmaWVkTGluZVNlcXVlbmNlLmdldEVuZExpbmVOdW1iZXIoZGlmZkNoYW5nZS5tb2RpZmllZFN0YXJ0ICsgZGlmZkNoYW5nZS5tb2RpZmllZExlbmd0aCAtIDEpO1xuXHRcdH1cblxuXHRcdGlmIChzaG91bGRDb21wdXRlQ2hhckNoYW5nZXMgJiYgZGlmZkNoYW5nZS5vcmlnaW5hbExlbmd0aCA+IDAgJiYgZGlmZkNoYW5nZS5vcmlnaW5hbExlbmd0aCA8IDIwICYmIGRpZmZDaGFuZ2UubW9kaWZpZWRMZW5ndGggPiAwICYmIGRpZmZDaGFuZ2UubW9kaWZpZWRMZW5ndGggPCAyMCAmJiBjb250aW51ZUNoYXJEaWZmKCkpIHtcblx0XHRcdC8vIENvbXB1dGUgY2hhcmFjdGVyIGNoYW5nZXMgZm9yIGRpZmYgY2h1bmtzIG9mIGF0IG1vc3QgMjAgbGluZXMuLi5cblx0XHRcdGNvbnN0IG9yaWdpbmFsQ2hhclNlcXVlbmNlID0gb3JpZ2luYWxMaW5lU2VxdWVuY2UuY3JlYXRlQ2hhclNlcXVlbmNlKHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlLCBkaWZmQ2hhbmdlLm9yaWdpbmFsU3RhcnQsIGRpZmZDaGFuZ2Uub3JpZ2luYWxTdGFydCArIGRpZmZDaGFuZ2Uub3JpZ2luYWxMZW5ndGggLSAxKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkQ2hhclNlcXVlbmNlID0gbW9kaWZpZWRMaW5lU2VxdWVuY2UuY3JlYXRlQ2hhclNlcXVlbmNlKHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlLCBkaWZmQ2hhbmdlLm1vZGlmaWVkU3RhcnQsIGRpZmZDaGFuZ2UubW9kaWZpZWRTdGFydCArIGRpZmZDaGFuZ2UubW9kaWZpZWRMZW5ndGggLSAxKTtcblxuXHRcdFx0aWYgKG9yaWdpbmFsQ2hhclNlcXVlbmNlLmdldEVsZW1lbnRzKCkubGVuZ3RoID4gMCAmJiBtb2RpZmllZENoYXJTZXF1ZW5jZS5nZXRFbGVtZW50cygpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bGV0IHJhd0NoYW5nZXMgPSBjb21wdXRlRGlmZihvcmlnaW5hbENoYXJTZXF1ZW5jZSwgbW9kaWZpZWRDaGFyU2VxdWVuY2UsIGNvbnRpbnVlQ2hhckRpZmYsIHRydWUpLmNoYW5nZXM7XG5cblx0XHRcdFx0aWYgKHNob3VsZFBvc3RQcm9jZXNzQ2hhckNoYW5nZXMpIHtcblx0XHRcdFx0XHRyYXdDaGFuZ2VzID0gcG9zdFByb2Nlc3NDaGFyQ2hhbmdlcyhyYXdDaGFuZ2VzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNoYXJDaGFuZ2VzID0gW107XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW5ndGggPSByYXdDaGFuZ2VzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y2hhckNoYW5nZXMucHVzaChDaGFyQ2hhbmdlLmNyZWF0ZUZyb21EaWZmQ2hhbmdlKHJhd0NoYW5nZXNbaV0sIG9yaWdpbmFsQ2hhclNlcXVlbmNlLCBtb2RpZmllZENoYXJTZXF1ZW5jZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBMaW5lQ2hhbmdlKG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLCBvcmlnaW5hbEVuZExpbmVOdW1iZXIsIG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLCBtb2RpZmllZEVuZExpbmVOdW1iZXIsIGNoYXJDaGFuZ2VzKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaWZmQ29tcHV0ZXJPcHRzIHtcblx0c2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzOiBib29sZWFuO1xuXHRzaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzOiBib29sZWFuO1xuXHRzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZTogYm9vbGVhbjtcblx0c2hvdWxkTWFrZVByZXR0eURpZmY6IGJvb2xlYW47XG5cdG1heENvbXB1dGF0aW9uVGltZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgRGlmZkNvbXB1dGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNob3VsZENvbXB1dGVDaGFyQ2hhbmdlczogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBzaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNob3VsZE1ha2VQcmV0dHlEaWZmOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9yaWdpbmFsTGluZXM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGlmaWVkTGluZXM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9yaWdpbmFsOiBMaW5lU2VxdWVuY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kaWZpZWQ6IExpbmVTZXF1ZW5jZTtcblx0cHJpdmF0ZSByZWFkb25seSBjb250aW51ZUxpbmVEaWZmOiAoKSA9PiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRpbnVlQ2hhckRpZmY6ICgpID0+IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3Iob3JpZ2luYWxMaW5lczogc3RyaW5nW10sIG1vZGlmaWVkTGluZXM6IHN0cmluZ1tdLCBvcHRzOiBJRGlmZkNvbXB1dGVyT3B0cykge1xuXHRcdHRoaXMuc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzID0gb3B0cy5zaG91bGRDb21wdXRlQ2hhckNoYW5nZXM7XG5cdFx0dGhpcy5zaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzID0gb3B0cy5zaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzO1xuXHRcdHRoaXMuc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2UgPSBvcHRzLnNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlO1xuXHRcdHRoaXMuc2hvdWxkTWFrZVByZXR0eURpZmYgPSBvcHRzLnNob3VsZE1ha2VQcmV0dHlEaWZmO1xuXHRcdHRoaXMub3JpZ2luYWxMaW5lcyA9IG9yaWdpbmFsTGluZXM7XG5cdFx0dGhpcy5tb2RpZmllZExpbmVzID0gbW9kaWZpZWRMaW5lcztcblx0XHR0aGlzLm9yaWdpbmFsID0gbmV3IExpbmVTZXF1ZW5jZShvcmlnaW5hbExpbmVzKTtcblx0XHR0aGlzLm1vZGlmaWVkID0gbmV3IExpbmVTZXF1ZW5jZShtb2RpZmllZExpbmVzKTtcblxuXHRcdHRoaXMuY29udGludWVMaW5lRGlmZiA9IGNyZWF0ZUNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZShvcHRzLm1heENvbXB1dGF0aW9uVGltZSk7XG5cdFx0dGhpcy5jb250aW51ZUNoYXJEaWZmID0gY3JlYXRlQ29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlKG9wdHMubWF4Q29tcHV0YXRpb25UaW1lID09PSAwID8gMCA6IE1hdGgubWluKG9wdHMubWF4Q29tcHV0YXRpb25UaW1lLCA1MDAwKSk7IC8vIG5ldmVyIHJ1biBhZnRlciA1cyBmb3IgY2hhcmFjdGVyIGNoYW5nZXMuLi5cblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlRGlmZigpOiBJRGlmZkNvbXB1dGVyUmVzdWx0IHtcblxuXHRcdGlmICh0aGlzLm9yaWdpbmFsLmxpbmVzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLm9yaWdpbmFsLmxpbmVzWzBdLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gZW1wdHkgb3JpZ2luYWwgPT4gZmFzdCBwYXRoXG5cdFx0XHRpZiAodGhpcy5tb2RpZmllZC5saW5lcy5sZW5ndGggPT09IDEgJiYgdGhpcy5tb2RpZmllZC5saW5lc1swXS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0XHRcdGNoYW5nZXM6IFtdXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogdGhpcy5tb2RpZmllZC5saW5lcy5sZW5ndGgsXG5cdFx0XHRcdFx0Y2hhckNoYW5nZXM6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5tb2RpZmllZC5saW5lcy5sZW5ndGggPT09IDEgJiYgdGhpcy5tb2RpZmllZC5saW5lc1swXS5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGVtcHR5IG1vZGlmaWVkID0+IGZhc3QgcGF0aFxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cXVpdEVhcmx5OiBmYWxzZSxcblx0XHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXI6IHRoaXMub3JpZ2luYWwubGluZXMubGVuZ3RoLFxuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRjaGFyQ2hhbmdlczogdW5kZWZpbmVkXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpZmZSZXN1bHQgPSBjb21wdXRlRGlmZih0aGlzLm9yaWdpbmFsLCB0aGlzLm1vZGlmaWVkLCB0aGlzLmNvbnRpbnVlTGluZURpZmYsIHRoaXMuc2hvdWxkTWFrZVByZXR0eURpZmYpO1xuXHRcdGNvbnN0IHJhd0NoYW5nZXMgPSBkaWZmUmVzdWx0LmNoYW5nZXM7XG5cdFx0Y29uc3QgcXVpdEVhcmx5ID0gZGlmZlJlc3VsdC5xdWl0RWFybHk7XG5cblx0XHQvLyBUaGUgZGlmZiBpcyBhbHdheXMgY29tcHV0ZWQgd2l0aCBpZ25vcmluZyB0cmltIHdoaXRlc3BhY2Vcblx0XHQvLyBUaGlzIGVuc3VyZXMgd2UgZ2V0IHRoZSBwcmV0dGllc3QgZGlmZlxuXG5cdFx0aWYgKHRoaXMuc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2UpIHtcblx0XHRcdGNvbnN0IGxpbmVDaGFuZ2VzOiBMaW5lQ2hhbmdlW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW5ndGggPSByYXdDaGFuZ2VzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGxpbmVDaGFuZ2VzLnB1c2goTGluZUNoYW5nZS5jcmVhdGVGcm9tRGlmZlJlc3VsdCh0aGlzLnNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlLCByYXdDaGFuZ2VzW2ldLCB0aGlzLm9yaWdpbmFsLCB0aGlzLm1vZGlmaWVkLCB0aGlzLmNvbnRpbnVlQ2hhckRpZmYsIHRoaXMuc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzLCB0aGlzLnNob3VsZFBvc3RQcm9jZXNzQ2hhckNoYW5nZXMpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHF1aXRFYXJseTogcXVpdEVhcmx5LFxuXHRcdFx0XHRjaGFuZ2VzOiBsaW5lQ2hhbmdlc1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBOZWVkIHRvIHBvc3QtcHJvY2VzcyBhbmQgaW50cm9kdWNlIGNoYW5nZXMgd2hlcmUgdGhlIHRyaW0gd2hpdGVzcGFjZSBpcyBkaWZmZXJlbnRcblx0XHQvLyBOb3RlIHRoYXQgd2UgYXJlIGxvb3Bpbmcgc3RhcnRpbmcgYXQgLTEgdG8gYWxzbyBjb3ZlciB0aGUgbGluZXMgYmVmb3JlIHRoZSBmaXJzdCBjaGFuZ2Vcblx0XHRjb25zdCByZXN1bHQ6IExpbmVDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0bGV0IG9yaWdpbmFsTGluZUluZGV4ID0gMDtcblx0XHRsZXQgbW9kaWZpZWRMaW5lSW5kZXggPSAwO1xuXHRcdGZvciAobGV0IGkgPSAtMSAvKiAhISEhICovLCBsZW4gPSByYXdDaGFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBuZXh0Q2hhbmdlID0gKGkgKyAxIDwgbGVuID8gcmF3Q2hhbmdlc1tpICsgMV0gOiBudWxsKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsU3RvcCA9IChuZXh0Q2hhbmdlID8gbmV4dENoYW5nZS5vcmlnaW5hbFN0YXJ0IDogdGhpcy5vcmlnaW5hbExpbmVzLmxlbmd0aCk7XG5cdFx0XHRjb25zdCBtb2RpZmllZFN0b3AgPSAobmV4dENoYW5nZSA/IG5leHRDaGFuZ2UubW9kaWZpZWRTdGFydCA6IHRoaXMubW9kaWZpZWRMaW5lcy5sZW5ndGgpO1xuXG5cdFx0XHR3aGlsZSAob3JpZ2luYWxMaW5lSW5kZXggPCBvcmlnaW5hbFN0b3AgJiYgbW9kaWZpZWRMaW5lSW5kZXggPCBtb2RpZmllZFN0b3ApIHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxMaW5lID0gdGhpcy5vcmlnaW5hbExpbmVzW29yaWdpbmFsTGluZUluZGV4XTtcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRMaW5lID0gdGhpcy5tb2RpZmllZExpbmVzW21vZGlmaWVkTGluZUluZGV4XTtcblxuXHRcdFx0XHRpZiAob3JpZ2luYWxMaW5lICE9PSBtb2RpZmllZExpbmUpIHtcblx0XHRcdFx0XHQvLyBUaGVzZSBsaW5lcyBkaWZmZXIgb25seSBpbiB0cmltIHdoaXRlc3BhY2VcblxuXHRcdFx0XHRcdC8vIENoZWNrIHRoZSBsZWFkaW5nIHdoaXRlc3BhY2Vcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXQgb3JpZ2luYWxTdGFydENvbHVtbiA9IGdldEZpcnN0Tm9uQmxhbmtDb2x1bW4ob3JpZ2luYWxMaW5lLCAxKTtcblx0XHRcdFx0XHRcdGxldCBtb2RpZmllZFN0YXJ0Q29sdW1uID0gZ2V0Rmlyc3ROb25CbGFua0NvbHVtbihtb2RpZmllZExpbmUsIDEpO1xuXHRcdFx0XHRcdFx0d2hpbGUgKG9yaWdpbmFsU3RhcnRDb2x1bW4gPiAxICYmIG1vZGlmaWVkU3RhcnRDb2x1bW4gPiAxKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsQ2hhciA9IG9yaWdpbmFsTGluZS5jaGFyQ29kZUF0KG9yaWdpbmFsU3RhcnRDb2x1bW4gLSAyKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRDaGFyID0gbW9kaWZpZWRMaW5lLmNoYXJDb2RlQXQobW9kaWZpZWRTdGFydENvbHVtbiAtIDIpO1xuXHRcdFx0XHRcdFx0XHRpZiAob3JpZ2luYWxDaGFyICE9PSBtb2RpZmllZENoYXIpIHtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbFN0YXJ0Q29sdW1uLS07XG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkU3RhcnRDb2x1bW4tLTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKG9yaWdpbmFsU3RhcnRDb2x1bW4gPiAxIHx8IG1vZGlmaWVkU3RhcnRDb2x1bW4gPiAxKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3B1c2hUcmltV2hpdGVzcGFjZUNoYXJDaGFuZ2UocmVzdWx0LFxuXHRcdFx0XHRcdFx0XHRcdG9yaWdpbmFsTGluZUluZGV4ICsgMSwgMSwgb3JpZ2luYWxTdGFydENvbHVtbixcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZExpbmVJbmRleCArIDEsIDEsIG1vZGlmaWVkU3RhcnRDb2x1bW5cblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBDaGVjayB0aGUgdHJhaWxpbmcgd2hpdGVzcGFjZVxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldCBvcmlnaW5hbEVuZENvbHVtbiA9IGdldExhc3ROb25CbGFua0NvbHVtbihvcmlnaW5hbExpbmUsIDEpO1xuXHRcdFx0XHRcdFx0bGV0IG1vZGlmaWVkRW5kQ29sdW1uID0gZ2V0TGFzdE5vbkJsYW5rQ29sdW1uKG1vZGlmaWVkTGluZSwgMSk7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbE1heENvbHVtbiA9IG9yaWdpbmFsTGluZS5sZW5ndGggKyAxO1xuXHRcdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRNYXhDb2x1bW4gPSBtb2RpZmllZExpbmUubGVuZ3RoICsgMTtcblx0XHRcdFx0XHRcdHdoaWxlIChvcmlnaW5hbEVuZENvbHVtbiA8IG9yaWdpbmFsTWF4Q29sdW1uICYmIG1vZGlmaWVkRW5kQ29sdW1uIDwgbW9kaWZpZWRNYXhDb2x1bW4pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxDaGFyID0gb3JpZ2luYWxMaW5lLmNoYXJDb2RlQXQob3JpZ2luYWxFbmRDb2x1bW4gLSAxKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRDaGFyID0gb3JpZ2luYWxMaW5lLmNoYXJDb2RlQXQobW9kaWZpZWRFbmRDb2x1bW4gLSAxKTtcblx0XHRcdFx0XHRcdFx0aWYgKG9yaWdpbmFsQ2hhciAhPT0gbW9kaWZpZWRDaGFyKSB7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0b3JpZ2luYWxFbmRDb2x1bW4rKztcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWRFbmRDb2x1bW4rKztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKG9yaWdpbmFsRW5kQ29sdW1uIDwgb3JpZ2luYWxNYXhDb2x1bW4gfHwgbW9kaWZpZWRFbmRDb2x1bW4gPCBtb2RpZmllZE1heENvbHVtbikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wdXNoVHJpbVdoaXRlc3BhY2VDaGFyQ2hhbmdlKHJlc3VsdCxcblx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbExpbmVJbmRleCArIDEsIG9yaWdpbmFsRW5kQ29sdW1uLCBvcmlnaW5hbE1heENvbHVtbixcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZExpbmVJbmRleCArIDEsIG1vZGlmaWVkRW5kQ29sdW1uLCBtb2RpZmllZE1heENvbHVtblxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRvcmlnaW5hbExpbmVJbmRleCsrO1xuXHRcdFx0XHRtb2RpZmllZExpbmVJbmRleCsrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV4dENoYW5nZSkge1xuXHRcdFx0XHQvLyBFbWl0IHRoZSBhY3R1YWwgY2hhbmdlXG5cdFx0XHRcdHJlc3VsdC5wdXNoKExpbmVDaGFuZ2UuY3JlYXRlRnJvbURpZmZSZXN1bHQodGhpcy5zaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZSwgbmV4dENoYW5nZSwgdGhpcy5vcmlnaW5hbCwgdGhpcy5tb2RpZmllZCwgdGhpcy5jb250aW51ZUNoYXJEaWZmLCB0aGlzLnNob3VsZENvbXB1dGVDaGFyQ2hhbmdlcywgdGhpcy5zaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzKSk7XG5cblx0XHRcdFx0b3JpZ2luYWxMaW5lSW5kZXggKz0gbmV4dENoYW5nZS5vcmlnaW5hbExlbmd0aDtcblx0XHRcdFx0bW9kaWZpZWRMaW5lSW5kZXggKz0gbmV4dENoYW5nZS5tb2RpZmllZExlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cXVpdEVhcmx5OiBxdWl0RWFybHksXG5cdFx0XHRjaGFuZ2VzOiByZXN1bHRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVzaFRyaW1XaGl0ZXNwYWNlQ2hhckNoYW5nZShcblx0XHRyZXN1bHQ6IExpbmVDaGFuZ2VbXSxcblx0XHRvcmlnaW5hbExpbmVOdW1iZXI6IG51bWJlciwgb3JpZ2luYWxTdGFydENvbHVtbjogbnVtYmVyLCBvcmlnaW5hbEVuZENvbHVtbjogbnVtYmVyLFxuXHRcdG1vZGlmaWVkTGluZU51bWJlcjogbnVtYmVyLCBtb2RpZmllZFN0YXJ0Q29sdW1uOiBudW1iZXIsIG1vZGlmaWVkRW5kQ29sdW1uOiBudW1iZXJcblx0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21lcmdlVHJpbVdoaXRlc3BhY2VDaGFyQ2hhbmdlKHJlc3VsdCwgb3JpZ2luYWxMaW5lTnVtYmVyLCBvcmlnaW5hbFN0YXJ0Q29sdW1uLCBvcmlnaW5hbEVuZENvbHVtbiwgbW9kaWZpZWRMaW5lTnVtYmVyLCBtb2RpZmllZFN0YXJ0Q29sdW1uLCBtb2RpZmllZEVuZENvbHVtbikpIHtcblx0XHRcdC8vIE1lcmdlZCBpbnRvIHByZXZpb3VzXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNoYXJDaGFuZ2VzOiBDaGFyQ2hhbmdlW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzKSB7XG5cdFx0XHRjaGFyQ2hhbmdlcyA9IFtuZXcgQ2hhckNoYW5nZShcblx0XHRcdFx0b3JpZ2luYWxMaW5lTnVtYmVyLCBvcmlnaW5hbFN0YXJ0Q29sdW1uLCBvcmlnaW5hbExpbmVOdW1iZXIsIG9yaWdpbmFsRW5kQ29sdW1uLFxuXHRcdFx0XHRtb2RpZmllZExpbmVOdW1iZXIsIG1vZGlmaWVkU3RhcnRDb2x1bW4sIG1vZGlmaWVkTGluZU51bWJlciwgbW9kaWZpZWRFbmRDb2x1bW5cblx0XHRcdCldO1xuXHRcdH1cblx0XHRyZXN1bHQucHVzaChuZXcgTGluZUNoYW5nZShcblx0XHRcdG9yaWdpbmFsTGluZU51bWJlciwgb3JpZ2luYWxMaW5lTnVtYmVyLFxuXHRcdFx0bW9kaWZpZWRMaW5lTnVtYmVyLCBtb2RpZmllZExpbmVOdW1iZXIsXG5cdFx0XHRjaGFyQ2hhbmdlc1xuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVyZ2VUcmltV2hpdGVzcGFjZUNoYXJDaGFuZ2UoXG5cdFx0cmVzdWx0OiBMaW5lQ2hhbmdlW10sXG5cdFx0b3JpZ2luYWxMaW5lTnVtYmVyOiBudW1iZXIsIG9yaWdpbmFsU3RhcnRDb2x1bW46IG51bWJlciwgb3JpZ2luYWxFbmRDb2x1bW46IG51bWJlcixcblx0XHRtb2RpZmllZExpbmVOdW1iZXI6IG51bWJlciwgbW9kaWZpZWRTdGFydENvbHVtbjogbnVtYmVyLCBtb2RpZmllZEVuZENvbHVtbjogbnVtYmVyXG5cdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGxlbiA9IHJlc3VsdC5sZW5ndGg7XG5cdFx0aWYgKGxlbiA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZDaGFuZ2UgPSByZXN1bHRbbGVuIC0gMV07XG5cblx0XHRpZiAocHJldkNoYW5nZS5vcmlnaW5hbEVuZExpbmVOdW1iZXIgPT09IDAgfHwgcHJldkNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgPT09IDApIHtcblx0XHRcdC8vIERvbid0IG1lcmdlIHdpdGggaW5zZXJ0cy9kZWxldGVzXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHByZXZDaGFuZ2Uub3JpZ2luYWxFbmRMaW5lTnVtYmVyID09PSBvcmlnaW5hbExpbmVOdW1iZXIgJiYgcHJldkNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgPT09IG1vZGlmaWVkTGluZU51bWJlcikge1xuXHRcdFx0aWYgKHRoaXMuc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzICYmIHByZXZDaGFuZ2UuY2hhckNoYW5nZXMpIHtcblx0XHRcdFx0cHJldkNoYW5nZS5jaGFyQ2hhbmdlcy5wdXNoKG5ldyBDaGFyQ2hhbmdlKFxuXHRcdFx0XHRcdG9yaWdpbmFsTGluZU51bWJlciwgb3JpZ2luYWxTdGFydENvbHVtbiwgb3JpZ2luYWxMaW5lTnVtYmVyLCBvcmlnaW5hbEVuZENvbHVtbixcblx0XHRcdFx0XHRtb2RpZmllZExpbmVOdW1iZXIsIG1vZGlmaWVkU3RhcnRDb2x1bW4sIG1vZGlmaWVkTGluZU51bWJlciwgbW9kaWZpZWRFbmRDb2x1bW5cblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAocHJldkNoYW5nZS5vcmlnaW5hbEVuZExpbmVOdW1iZXIgKyAxID09PSBvcmlnaW5hbExpbmVOdW1iZXIgJiYgcHJldkNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgKyAxID09PSBtb2RpZmllZExpbmVOdW1iZXIpIHtcblx0XHRcdHByZXZDaGFuZ2Uub3JpZ2luYWxFbmRMaW5lTnVtYmVyID0gb3JpZ2luYWxMaW5lTnVtYmVyO1xuXHRcdFx0cHJldkNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgPSBtb2RpZmllZExpbmVOdW1iZXI7XG5cdFx0XHRpZiAodGhpcy5zaG91bGRDb21wdXRlQ2hhckNoYW5nZXMgJiYgcHJldkNoYW5nZS5jaGFyQ2hhbmdlcykge1xuXHRcdFx0XHRwcmV2Q2hhbmdlLmNoYXJDaGFuZ2VzLnB1c2gobmV3IENoYXJDaGFuZ2UoXG5cdFx0XHRcdFx0b3JpZ2luYWxMaW5lTnVtYmVyLCBvcmlnaW5hbFN0YXJ0Q29sdW1uLCBvcmlnaW5hbExpbmVOdW1iZXIsIG9yaWdpbmFsRW5kQ29sdW1uLFxuXHRcdFx0XHRcdG1vZGlmaWVkTGluZU51bWJlciwgbW9kaWZpZWRTdGFydENvbHVtbiwgbW9kaWZpZWRMaW5lTnVtYmVyLCBtb2RpZmllZEVuZENvbHVtblxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRGaXJzdE5vbkJsYW5rQ29sdW1uKHR4dDogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHIgPSBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KHR4dCk7XG5cdGlmIChyID09PSAtMSkge1xuXHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdH1cblx0cmV0dXJuIHIgKyAxO1xufVxuXG5mdW5jdGlvbiBnZXRMYXN0Tm9uQmxhbmtDb2x1bW4odHh0OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgciA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCh0eHQpO1xuXHRpZiAociA9PT0gLTEpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdHJldHVybiByICsgMjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29udGludWVQcm9jZXNzaW5nUHJlZGljYXRlKG1heGltdW1SdW50aW1lOiBudW1iZXIpOiAoKSA9PiBib29sZWFuIHtcblx0aWYgKG1heGltdW1SdW50aW1lID09PSAwKSB7XG5cdFx0cmV0dXJuICgpID0+IHRydWU7XG5cdH1cblxuXHRjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXHRyZXR1cm4gKCkgPT4ge1xuXHRcdHJldHVybiBEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgbWF4aW11bVJ1bnRpbWU7XG5cdH07XG59XG4iXSwKICAibWFwcGlu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
