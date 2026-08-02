import { Emitter } from "../../../../base/common/event.js";
import * as strings from "../../../../base/common/strings.js";
import { Range } from "../../core/range.js";
import { ApplyEditsResult, EndOfLinePreference } from "../../model.js";
import { PieceTreeBase } from "./pieceTreeBase.js";
import { countEOL, StringEOL } from "../../core/misc/eolCounter.js";
import { TextChange } from "../../core/textChange.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
class PieceTreeTextBuffer extends Disposable {
  constructor(chunks, BOM, eol, containsRTL, containsUnusualLineTerminators, isBasicASCII, eolNormalized) {
    super();
    this._onDidChangeContent = this._register(new Emitter());
    this._BOM = BOM;
    this._mightContainNonBasicASCII = !isBasicASCII;
    this._mightContainRTL = containsRTL;
    this._mightContainUnusualLineTerminators = containsUnusualLineTerminators;
    this._pieceTree = new PieceTreeBase(chunks, eol, eolNormalized);
  }
  get onDidChangeContent() {
    return this._onDidChangeContent.event;
  }
  // #region TextBuffer
  equals(other) {
    if (!(other instanceof PieceTreeTextBuffer)) {
      return false;
    }
    if (this._BOM !== other._BOM) {
      return false;
    }
    if (this.getEOL() !== other.getEOL()) {
      return false;
    }
    return this._pieceTree.equal(other._pieceTree);
  }
  mightContainRTL() {
    return this._mightContainRTL;
  }
  mightContainUnusualLineTerminators() {
    return this._mightContainUnusualLineTerminators;
  }
  resetMightContainUnusualLineTerminators() {
    this._mightContainUnusualLineTerminators = false;
  }
  mightContainNonBasicASCII() {
    return this._mightContainNonBasicASCII;
  }
  getBOM() {
    return this._BOM;
  }
  getEOL() {
    return this._pieceTree.getEOL();
  }
  createSnapshot(preserveBOM) {
    return this._pieceTree.createSnapshot(preserveBOM ? this._BOM : "");
  }
  getOffsetAt(lineNumber, column) {
    return this._pieceTree.getOffsetAt(lineNumber, column);
  }
  getPositionAt(offset) {
    return this._pieceTree.getPositionAt(offset);
  }
  getRangeAt(start, length) {
    const end = start + length;
    const startPosition = this.getPositionAt(start);
    const endPosition = this.getPositionAt(end);
    return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
  }
  getValueInRange(range, eol = EndOfLinePreference.TextDefined) {
    if (range.isEmpty()) {
      return "";
    }
    const lineEnding = this._getEndOfLine(eol);
    return this._pieceTree.getValueInRange(range, lineEnding);
  }
  getValueLengthInRange(range, eol = EndOfLinePreference.TextDefined) {
    if (range.isEmpty()) {
      return 0;
    }
    if (range.startLineNumber === range.endLineNumber) {
      return range.endColumn - range.startColumn;
    }
    const startOffset = this.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this.getOffsetAt(range.endLineNumber, range.endColumn);
    let eolOffsetCompensation = 0;
    const desiredEOL = this._getEndOfLine(eol);
    const actualEOL = this.getEOL();
    if (desiredEOL.length !== actualEOL.length) {
      const delta = desiredEOL.length - actualEOL.length;
      const eolCount = range.endLineNumber - range.startLineNumber;
      eolOffsetCompensation = delta * eolCount;
    }
    return endOffset - startOffset + eolOffsetCompensation;
  }
  getCharacterCountInRange(range, eol = EndOfLinePreference.TextDefined) {
    if (this._mightContainNonBasicASCII) {
      let result = 0;
      const fromLineNumber = range.startLineNumber;
      const toLineNumber = range.endLineNumber;
      for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
        const lineContent = this.getLineContent(lineNumber);
        const fromOffset = lineNumber === fromLineNumber ? range.startColumn - 1 : 0;
        const toOffset = lineNumber === toLineNumber ? range.endColumn - 1 : lineContent.length;
        for (let offset = fromOffset; offset < toOffset; offset++) {
          if (strings.isHighSurrogate(lineContent.charCodeAt(offset))) {
            result = result + 1;
            offset = offset + 1;
          } else {
            result = result + 1;
          }
        }
      }
      result += this._getEndOfLine(eol).length * (toLineNumber - fromLineNumber);
      return result;
    }
    return this.getValueLengthInRange(range, eol);
  }
  getNearestChunk(offset) {
    return this._pieceTree.getNearestChunk(offset);
  }
  getLength() {
    return this._pieceTree.getLength();
  }
  getLineCount() {
    return this._pieceTree.getLineCount();
  }
  getLinesContent() {
    return this._pieceTree.getLinesContent();
  }
  getLineContent(lineNumber) {
    return this._pieceTree.getLineContent(lineNumber);
  }
  getLineCharCode(lineNumber, index) {
    return this._pieceTree.getLineCharCode(lineNumber, index);
  }
  getCharCode(offset) {
    return this._pieceTree.getCharCode(offset);
  }
  getLineLength(lineNumber) {
    return this._pieceTree.getLineLength(lineNumber);
  }
  getLineMinColumn(lineNumber) {
    return 1;
  }
  getLineMaxColumn(lineNumber) {
    return this.getLineLength(lineNumber) + 1;
  }
  getLineFirstNonWhitespaceColumn(lineNumber) {
    const result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 1;
  }
  getLineLastNonWhitespaceColumn(lineNumber) {
    const result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 2;
  }
  _getEndOfLine(eol) {
    switch (eol) {
      case EndOfLinePreference.LF:
        return "\n";
      case EndOfLinePreference.CRLF:
        return "\r\n";
      case EndOfLinePreference.TextDefined:
        return this.getEOL();
      default:
        throw new Error("Unknown EOL preference");
    }
  }
  setEOL(newEOL) {
    this._pieceTree.setEOL(newEOL);
  }
  applyEdits(rawOperations, recordTrimAutoWhitespace, computeUndoEdits) {
    let mightContainRTL = this._mightContainRTL;
    let mightContainUnusualLineTerminators = this._mightContainUnusualLineTerminators;
    let mightContainNonBasicASCII = this._mightContainNonBasicASCII;
    let canReduceOperations = true;
    let operations = [];
    for (let i = 0; i < rawOperations.length; i++) {
      const op = rawOperations[i];
      if (canReduceOperations && op._isTracked) {
        canReduceOperations = false;
      }
      const validatedRange = op.range;
      if (op.text) {
        let textMightContainNonBasicASCII = true;
        if (!mightContainNonBasicASCII) {
          textMightContainNonBasicASCII = !strings.isBasicASCII(op.text);
          mightContainNonBasicASCII = textMightContainNonBasicASCII;
        }
        if (!mightContainRTL && textMightContainNonBasicASCII) {
          mightContainRTL = strings.containsRTL(op.text);
        }
        if (!mightContainUnusualLineTerminators && textMightContainNonBasicASCII) {
          mightContainUnusualLineTerminators = strings.containsUnusualLineTerminators(op.text);
        }
      }
      let validText = "";
      let eolCount = 0;
      let firstLineLength = 0;
      let lastLineLength = 0;
      if (op.text) {
        let strEOL;
        [eolCount, firstLineLength, lastLineLength, strEOL] = countEOL(op.text);
        const bufferEOL = this.getEOL();
        const expectedStrEOL = bufferEOL === "\r\n" ? StringEOL.CRLF : StringEOL.LF;
        if (strEOL === StringEOL.Unknown || strEOL === expectedStrEOL) {
          validText = op.text;
        } else {
          validText = op.text.replace(/\r\n|\r|\n/g, bufferEOL);
        }
      }
      operations[i] = {
        sortIndex: i,
        identifier: op.identifier || null,
        range: validatedRange,
        rangeOffset: this.getOffsetAt(validatedRange.startLineNumber, validatedRange.startColumn),
        rangeLength: this.getValueLengthInRange(validatedRange),
        text: validText,
        eolCount,
        firstLineLength,
        lastLineLength,
        forceMoveMarkers: Boolean(op.forceMoveMarkers),
        isAutoWhitespaceEdit: op.isAutoWhitespaceEdit || false
      };
    }
    operations.sort(PieceTreeTextBuffer._sortOpsAscending);
    let hasTouchingRanges = false;
    for (let i = 0, count = operations.length - 1; i < count; i++) {
      const rangeEnd = operations[i].range.getEndPosition();
      const nextRangeStart = operations[i + 1].range.getStartPosition();
      if (nextRangeStart.isBeforeOrEqual(rangeEnd)) {
        if (nextRangeStart.isBefore(rangeEnd)) {
          throw new Error("Overlapping ranges are not allowed!");
        }
        hasTouchingRanges = true;
      }
    }
    if (canReduceOperations) {
      operations = this._reduceOperations(operations);
    }
    const reverseRanges = computeUndoEdits || recordTrimAutoWhitespace ? PieceTreeTextBuffer._getInverseEditRanges(operations) : [];
    const newTrimAutoWhitespaceCandidates = [];
    if (recordTrimAutoWhitespace) {
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const reverseRange = reverseRanges[i];
        if (op.isAutoWhitespaceEdit && op.range.isEmpty()) {
          for (let lineNumber = reverseRange.startLineNumber; lineNumber <= reverseRange.endLineNumber; lineNumber++) {
            let currentLineContent = "";
            if (lineNumber === reverseRange.startLineNumber) {
              currentLineContent = this.getLineContent(op.range.startLineNumber);
              if (strings.firstNonWhitespaceIndex(currentLineContent) !== -1) {
                continue;
              }
            }
            newTrimAutoWhitespaceCandidates.push({ lineNumber, oldContent: currentLineContent });
          }
        }
      }
    }
    let reverseOperations = null;
    if (computeUndoEdits) {
      let reverseRangeDeltaOffset = 0;
      reverseOperations = [];
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const reverseRange = reverseRanges[i];
        const bufferText = this.getValueInRange(op.range);
        const reverseRangeOffset = op.rangeOffset + reverseRangeDeltaOffset;
        reverseRangeDeltaOffset += op.text.length - bufferText.length;
        reverseOperations[i] = {
          sortIndex: op.sortIndex,
          identifier: op.identifier,
          range: reverseRange,
          text: bufferText,
          textChange: new TextChange(op.rangeOffset, bufferText, reverseRangeOffset, op.text)
        };
      }
      if (!hasTouchingRanges) {
        reverseOperations.sort((a, b) => a.sortIndex - b.sortIndex);
      }
    }
    this._mightContainRTL = mightContainRTL;
    this._mightContainUnusualLineTerminators = mightContainUnusualLineTerminators;
    this._mightContainNonBasicASCII = mightContainNonBasicASCII;
    const contentChanges = this._doApplyEdits(operations);
    let trimAutoWhitespaceLineNumbers = null;
    if (recordTrimAutoWhitespace && newTrimAutoWhitespaceCandidates.length > 0) {
      newTrimAutoWhitespaceCandidates.sort((a, b) => b.lineNumber - a.lineNumber);
      trimAutoWhitespaceLineNumbers = [];
      for (let i = 0, len = newTrimAutoWhitespaceCandidates.length; i < len; i++) {
        const lineNumber = newTrimAutoWhitespaceCandidates[i].lineNumber;
        if (i > 0 && newTrimAutoWhitespaceCandidates[i - 1].lineNumber === lineNumber) {
          continue;
        }
        const prevContent = newTrimAutoWhitespaceCandidates[i].oldContent;
        const lineContent = this.getLineContent(lineNumber);
        if (lineContent.length === 0 || lineContent === prevContent || strings.firstNonWhitespaceIndex(lineContent) !== -1) {
          continue;
        }
        trimAutoWhitespaceLineNumbers.push(lineNumber);
      }
    }
    this._onDidChangeContent.fire();
    return new ApplyEditsResult(
      reverseOperations,
      contentChanges,
      trimAutoWhitespaceLineNumbers
    );
  }
  /**
   * Transform operations such that they represent the same logic edit,
   * but that they also do not cause OOM crashes.
   */
  _reduceOperations(operations) {
    if (operations.length < 1e3) {
      return operations;
    }
    return [this._toSingleEditOperation(operations)];
  }
  _toSingleEditOperation(operations) {
    let forceMoveMarkers = false;
    const firstEditRange = operations[0].range;
    const lastEditRange = operations[operations.length - 1].range;
    const entireEditRange = new Range(firstEditRange.startLineNumber, firstEditRange.startColumn, lastEditRange.endLineNumber, lastEditRange.endColumn);
    let lastEndLineNumber = firstEditRange.startLineNumber;
    let lastEndColumn = firstEditRange.startColumn;
    const result = [];
    for (let i = 0, len = operations.length; i < len; i++) {
      const operation = operations[i];
      const range = operation.range;
      forceMoveMarkers = forceMoveMarkers || operation.forceMoveMarkers;
      result.push(this.getValueInRange(new Range(lastEndLineNumber, lastEndColumn, range.startLineNumber, range.startColumn)));
      if (operation.text.length > 0) {
        result.push(operation.text);
      }
      lastEndLineNumber = range.endLineNumber;
      lastEndColumn = range.endColumn;
    }
    const text = result.join("");
    const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
    return {
      sortIndex: 0,
      identifier: operations[0].identifier,
      range: entireEditRange,
      rangeOffset: this.getOffsetAt(entireEditRange.startLineNumber, entireEditRange.startColumn),
      rangeLength: this.getValueLengthInRange(entireEditRange, EndOfLinePreference.TextDefined),
      text,
      eolCount,
      firstLineLength,
      lastLineLength,
      forceMoveMarkers,
      isAutoWhitespaceEdit: false
    };
  }
  _doApplyEdits(operations) {
    operations.sort(PieceTreeTextBuffer._sortOpsDescending);
    const contentChanges = [];
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const startLineNumber = op.range.startLineNumber;
      const startColumn = op.range.startColumn;
      const endLineNumber = op.range.endLineNumber;
      const endColumn = op.range.endColumn;
      if (startLineNumber === endLineNumber && startColumn === endColumn && op.text.length === 0) {
        continue;
      }
      if (op.text) {
        this._pieceTree.delete(op.rangeOffset, op.rangeLength);
        this._pieceTree.insert(op.rangeOffset, op.text, true);
      } else {
        this._pieceTree.delete(op.rangeOffset, op.rangeLength);
      }
      const contentChangeRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
      contentChanges.push({
        range: contentChangeRange,
        rangeLength: op.rangeLength,
        text: op.text,
        rangeOffset: op.rangeOffset,
        forceMoveMarkers: op.forceMoveMarkers
      });
    }
    return contentChanges;
  }
  findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount) {
    return this._pieceTree.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
  }
  // #endregion
  // #region helper
  // testing purpose.
  getPieceTree() {
    return this._pieceTree;
  }
  static _getInverseEditRange(range, text) {
    const startLineNumber = range.startLineNumber;
    const startColumn = range.startColumn;
    const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
    let resultRange;
    if (text.length > 0) {
      const lineCount = eolCount + 1;
      if (lineCount === 1) {
        resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn + firstLineLength);
      } else {
        resultRange = new Range(startLineNumber, startColumn, startLineNumber + lineCount - 1, lastLineLength + 1);
      }
    } else {
      resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn);
    }
    return resultRange;
  }
  /**
   * Assumes `operations` are validated and sorted ascending
   */
  static _getInverseEditRanges(operations) {
    const result = [];
    let prevOpEndLineNumber = 0;
    let prevOpEndColumn = 0;
    let prevOp = null;
    for (let i = 0, len = operations.length; i < len; i++) {
      const op = operations[i];
      let startLineNumber;
      let startColumn;
      if (prevOp) {
        if (prevOp.range.endLineNumber === op.range.startLineNumber) {
          startLineNumber = prevOpEndLineNumber;
          startColumn = prevOpEndColumn + (op.range.startColumn - prevOp.range.endColumn);
        } else {
          startLineNumber = prevOpEndLineNumber + (op.range.startLineNumber - prevOp.range.endLineNumber);
          startColumn = op.range.startColumn;
        }
      } else {
        startLineNumber = op.range.startLineNumber;
        startColumn = op.range.startColumn;
      }
      let resultRange;
      if (op.text.length > 0) {
        const lineCount = op.eolCount + 1;
        if (lineCount === 1) {
          resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn + op.firstLineLength);
        } else {
          resultRange = new Range(startLineNumber, startColumn, startLineNumber + lineCount - 1, op.lastLineLength + 1);
        }
      } else {
        resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn);
      }
      prevOpEndLineNumber = resultRange.endLineNumber;
      prevOpEndColumn = resultRange.endColumn;
      result.push(resultRange);
      prevOp = op;
    }
    return result;
  }
  static _sortOpsAscending(a, b) {
    const r = Range.compareRangesUsingEnds(a.range, b.range);
    if (r === 0) {
      return a.sortIndex - b.sortIndex;
    }
    return r;
  }
  static _sortOpsDescending(a, b) {
    const r = Range.compareRangesUsingEnds(a.range, b.range);
    if (r === 0) {
      return b.sortIndex - a.sortIndex;
    }
    return -r;
  }
  // #endregion
}
export {
  PieceTreeTextBuffer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvcGllY2VUcmVlVGV4dEJ1ZmZlci9waWVjZVRyZWVUZXh0QnVmZmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBBcHBseUVkaXRzUmVzdWx0LCBFbmRPZkxpbmVQcmVmZXJlbmNlLCBGaW5kTWF0Y2gsIElJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZSwgSVNpbmdsZUVkaXRPcGVyYXRpb25JZGVudGlmaWVyLCBJVGV4dEJ1ZmZlciwgSVRleHRTbmFwc2hvdCwgVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uLCBJVmFsaWRFZGl0T3BlcmF0aW9uLCBTZWFyY2hEYXRhIH0gZnJvbSAnLi4vLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlQmFzZSwgU3RyaW5nQnVmZmVyIH0gZnJvbSAnLi9waWVjZVRyZWVCYXNlLmpzJztcbmltcG9ydCB7IGNvdW50RU9MLCBTdHJpbmdFT0wgfSBmcm9tICcuLi8uLi9jb3JlL21pc2MvZW9sQ291bnRlci5qcyc7XG5pbXBvcnQgeyBUZXh0Q2hhbmdlIH0gZnJvbSAnLi4vLi4vY29yZS90ZXh0Q2hhbmdlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uIHtcblx0c29ydEluZGV4OiBudW1iZXI7XG5cdGlkZW50aWZpZXI6IElTaW5nbGVFZGl0T3BlcmF0aW9uSWRlbnRpZmllciB8IG51bGw7XG5cdHJhbmdlOiBSYW5nZTtcblx0cmFuZ2VPZmZzZXQ6IG51bWJlcjtcblx0cmFuZ2VMZW5ndGg6IG51bWJlcjtcblx0dGV4dDogc3RyaW5nO1xuXHRlb2xDb3VudDogbnVtYmVyO1xuXHRmaXJzdExpbmVMZW5ndGg6IG51bWJlcjtcblx0bGFzdExpbmVMZW5ndGg6IG51bWJlcjtcblx0Zm9yY2VNb3ZlTWFya2VyczogYm9vbGVhbjtcblx0aXNBdXRvV2hpdGVzcGFjZUVkaXQ6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJUmV2ZXJzZVNpbmdsZUVkaXRPcGVyYXRpb24gZXh0ZW5kcyBJVmFsaWRFZGl0T3BlcmF0aW9uIHtcblx0c29ydEluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBQaWVjZVRyZWVUZXh0QnVmZmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXh0QnVmZmVyIHtcblx0cHJpdmF0ZSBfcGllY2VUcmVlOiBQaWVjZVRyZWVCYXNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9CT006IHN0cmluZztcblx0cHJpdmF0ZSBfbWlnaHRDb250YWluUlRMOiBib29sZWFuO1xuXHRwcml2YXRlIF9taWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzOiBib29sZWFuO1xuXHRwcml2YXRlIF9taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlQ29udGVudCgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3RvcihjaHVua3M6IFN0cmluZ0J1ZmZlcltdLCBCT006IHN0cmluZywgZW9sOiAnXFxyXFxuJyB8ICdcXG4nLCBjb250YWluc1JUTDogYm9vbGVhbiwgY29udGFpbnNVbnVzdWFsTGluZVRlcm1pbmF0b3JzOiBib29sZWFuLCBpc0Jhc2ljQVNDSUk6IGJvb2xlYW4sIGVvbE5vcm1hbGl6ZWQ6IGJvb2xlYW4pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX0JPTSA9IEJPTTtcblx0XHR0aGlzLl9taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJID0gIWlzQmFzaWNBU0NJSTtcblx0XHR0aGlzLl9taWdodENvbnRhaW5SVEwgPSBjb250YWluc1JUTDtcblx0XHR0aGlzLl9taWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzID0gY29udGFpbnNVbnVzdWFsTGluZVRlcm1pbmF0b3JzO1xuXHRcdHRoaXMuX3BpZWNlVHJlZSA9IG5ldyBQaWVjZVRyZWVCYXNlKGNodW5rcywgZW9sLCBlb2xOb3JtYWxpemVkKTtcblx0fVxuXG5cdC8vICNyZWdpb24gVGV4dEJ1ZmZlclxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBJVGV4dEJ1ZmZlcik6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgUGllY2VUcmVlVGV4dEJ1ZmZlcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX0JPTSAhPT0gb3RoZXIuX0JPTSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5nZXRFT0woKSAhPT0gb3RoZXIuZ2V0RU9MKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5lcXVhbChvdGhlci5fcGllY2VUcmVlKTtcblx0fVxuXHRwdWJsaWMgbWlnaHRDb250YWluUlRMKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9taWdodENvbnRhaW5SVEw7XG5cdH1cblx0cHVibGljIG1pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnM7XG5cdH1cblx0cHVibGljIHJlc2V0TWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycygpOiB2b2lkIHtcblx0XHR0aGlzLl9taWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzID0gZmFsc2U7XG5cdH1cblx0cHVibGljIG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUk7XG5cdH1cblx0cHVibGljIGdldEJPTSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9CT007XG5cdH1cblx0cHVibGljIGdldEVPTCgpOiAnXFxyXFxuJyB8ICdcXG4nIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldEVPTCgpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVNuYXBzaG90KHByZXNlcnZlQk9NOiBib29sZWFuKTogSVRleHRTbmFwc2hvdCB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5jcmVhdGVTbmFwc2hvdChwcmVzZXJ2ZUJPTSA/IHRoaXMuX0JPTSA6ICcnKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRPZmZzZXRBdChsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldE9mZnNldEF0KGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UG9zaXRpb25BdChvZmZzZXQ6IG51bWJlcik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSYW5nZUF0KHN0YXJ0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdGNvbnN0IGVuZCA9IHN0YXJ0ICsgbGVuZ3RoO1xuXHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSB0aGlzLmdldFBvc2l0aW9uQXQoc3RhcnQpO1xuXHRcdGNvbnN0IGVuZFBvc2l0aW9uID0gdGhpcy5nZXRQb3NpdGlvbkF0KGVuZCk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uLCBlbmRQb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRQb3NpdGlvbi5jb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlSW5SYW5nZShyYW5nZTogUmFuZ2UsIGVvbDogRW5kT2ZMaW5lUHJlZmVyZW5jZSA9IEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lRW5kaW5nID0gdGhpcy5fZ2V0RW5kT2ZMaW5lKGVvbCk7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UsIGxpbmVFbmRpbmcpO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlTGVuZ3RoSW5SYW5nZShyYW5nZTogUmFuZ2UsIGVvbDogRW5kT2ZMaW5lUHJlZmVyZW5jZSA9IEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpOiBudW1iZXIge1xuXHRcdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiAocmFuZ2UuZW5kQ29sdW1uIC0gcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5nZXRPZmZzZXRBdChyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLmdldE9mZnNldEF0KHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cblx0XHQvLyBvZmZzZXRzIHVzZSB0aGUgdGV4dCBFT0wsIHNvIHdlIG5lZWQgdG8gY29tcGVuc2F0ZSBmb3IgbGVuZ3RoIGRpZmZlcmVuY2VzXG5cdFx0Ly8gaWYgdGhlIHJlcXVlc3RlZCBFT0wgZG9lc24ndCBtYXRjaCB0aGUgdGV4dCBFT0xcblx0XHRsZXQgZW9sT2Zmc2V0Q29tcGVuc2F0aW9uID0gMDtcblx0XHRjb25zdCBkZXNpcmVkRU9MID0gdGhpcy5fZ2V0RW5kT2ZMaW5lKGVvbCk7XG5cdFx0Y29uc3QgYWN0dWFsRU9MID0gdGhpcy5nZXRFT0woKTtcblx0XHRpZiAoZGVzaXJlZEVPTC5sZW5ndGggIT09IGFjdHVhbEVPTC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGRlbHRhID0gZGVzaXJlZEVPTC5sZW5ndGggLSBhY3R1YWxFT0wubGVuZ3RoO1xuXHRcdFx0Y29uc3QgZW9sQ291bnQgPSByYW5nZS5lbmRMaW5lTnVtYmVyIC0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0ZW9sT2Zmc2V0Q29tcGVuc2F0aW9uID0gZGVsdGEgKiBlb2xDb3VudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW5kT2Zmc2V0IC0gc3RhcnRPZmZzZXQgKyBlb2xPZmZzZXRDb21wZW5zYXRpb247XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2hhcmFjdGVyQ291bnRJblJhbmdlKHJhbmdlOiBSYW5nZSwgZW9sOiBFbmRPZkxpbmVQcmVmZXJlbmNlID0gRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX21pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkpIHtcblx0XHRcdC8vIHdlIG11c3QgY291bnQgYnkgaXRlcmF0aW5nXG5cblx0XHRcdGxldCByZXN1bHQgPSAwO1xuXG5cdFx0XHRjb25zdCBmcm9tTGluZU51bWJlciA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHRvTGluZU51bWJlciA9IHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdG9MaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB0aGlzLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBmcm9tT2Zmc2V0ID0gKGxpbmVOdW1iZXIgPT09IGZyb21MaW5lTnVtYmVyID8gcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIDogMCk7XG5cdFx0XHRcdGNvbnN0IHRvT2Zmc2V0ID0gKGxpbmVOdW1iZXIgPT09IHRvTGluZU51bWJlciA/IHJhbmdlLmVuZENvbHVtbiAtIDEgOiBsaW5lQ29udGVudC5sZW5ndGgpO1xuXG5cdFx0XHRcdGZvciAobGV0IG9mZnNldCA9IGZyb21PZmZzZXQ7IG9mZnNldCA8IHRvT2Zmc2V0OyBvZmZzZXQrKykge1xuXHRcdFx0XHRcdGlmIChzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShsaW5lQ29udGVudC5jaGFyQ29kZUF0KG9mZnNldCkpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSByZXN1bHQgKyAxO1xuXHRcdFx0XHRcdFx0b2Zmc2V0ID0gb2Zmc2V0ICsgMTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0ICsgMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0ICs9IHRoaXMuX2dldEVuZE9mTGluZShlb2wpLmxlbmd0aCAqICh0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlcik7XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHJhbmdlLCBlb2wpO1xuXHR9XG5cblx0cHVibGljIGdldE5lYXJlc3RDaHVuayhvZmZzZXQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5nZXROZWFyZXN0Q2h1bmsob2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldExlbmd0aCgpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0TGluZUNvdW50KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZXNDb250ZW50KCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldExpbmVzQ29udGVudCgpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ2hhckNvZGUobGluZU51bWJlcjogbnVtYmVyLCBpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldExpbmVDaGFyQ29kZShsaW5lTnVtYmVyLCBpbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2hhckNvZGUob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0Q2hhckNvZGUob2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVNaW5Db2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKSArIDE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0cmluZ3MuZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgodGhpcy5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0ICsgMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCByZXN1bHQgPSBzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgodGhpcy5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0ICsgMjtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVuZE9mTGluZShlb2w6IEVuZE9mTGluZVByZWZlcmVuY2UpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoZW9sKSB7XG5cdFx0XHRjYXNlIEVuZE9mTGluZVByZWZlcmVuY2UuTEY6XG5cdFx0XHRcdHJldHVybiAnXFxuJztcblx0XHRcdGNhc2UgRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGOlxuXHRcdFx0XHRyZXR1cm4gJ1xcclxcbic7XG5cdFx0XHRjYXNlIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldEVPTCgpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIEVPTCBwcmVmZXJlbmNlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEVPTChuZXdFT0w6ICdcXHJcXG4nIHwgJ1xcbicpOiB2b2lkIHtcblx0XHR0aGlzLl9waWVjZVRyZWUuc2V0RU9MKG5ld0VPTCk7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlFZGl0cyhyYXdPcGVyYXRpb25zOiBWYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb25bXSwgcmVjb3JkVHJpbUF1dG9XaGl0ZXNwYWNlOiBib29sZWFuLCBjb21wdXRlVW5kb0VkaXRzOiBib29sZWFuKTogQXBwbHlFZGl0c1Jlc3VsdCB7XG5cdFx0bGV0IG1pZ2h0Q29udGFpblJUTCA9IHRoaXMuX21pZ2h0Q29udGFpblJUTDtcblx0XHRsZXQgbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycyA9IHRoaXMuX21pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnM7XG5cdFx0bGV0IG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkgPSB0aGlzLl9taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJO1xuXHRcdGxldCBjYW5SZWR1Y2VPcGVyYXRpb25zID0gdHJ1ZTtcblxuXHRcdGxldCBvcGVyYXRpb25zOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByYXdPcGVyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBvcCA9IHJhd09wZXJhdGlvbnNbaV07XG5cdFx0XHRpZiAoY2FuUmVkdWNlT3BlcmF0aW9ucyAmJiBvcC5faXNUcmFja2VkKSB7XG5cdFx0XHRcdGNhblJlZHVjZU9wZXJhdGlvbnMgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhbGlkYXRlZFJhbmdlID0gb3AucmFuZ2U7XG5cdFx0XHRpZiAob3AudGV4dCkge1xuXHRcdFx0XHRsZXQgdGV4dE1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkgPSB0cnVlO1xuXHRcdFx0XHRpZiAoIW1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkpIHtcblx0XHRcdFx0XHR0ZXh0TWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSA9ICFzdHJpbmdzLmlzQmFzaWNBU0NJSShvcC50ZXh0KTtcblx0XHRcdFx0XHRtaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJID0gdGV4dE1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFtaWdodENvbnRhaW5SVEwgJiYgdGV4dE1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkpIHtcblx0XHRcdFx0XHQvLyBjaGVjayBpZiB0aGUgbmV3IGluc2VydGVkIHRleHQgY29udGFpbnMgUlRMXG5cdFx0XHRcdFx0bWlnaHRDb250YWluUlRMID0gc3RyaW5ncy5jb250YWluc1JUTChvcC50ZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW1pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnMgJiYgdGV4dE1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkpIHtcblx0XHRcdFx0XHQvLyBjaGVjayBpZiB0aGUgbmV3IGluc2VydGVkIHRleHQgY29udGFpbnMgdW51c3VhbCBsaW5lIHRlcm1pbmF0b3JzXG5cdFx0XHRcdFx0bWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycyA9IHN0cmluZ3MuY29udGFpbnNVbnVzdWFsTGluZVRlcm1pbmF0b3JzKG9wLnRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCB2YWxpZFRleHQgPSAnJztcblx0XHRcdGxldCBlb2xDb3VudCA9IDA7XG5cdFx0XHRsZXQgZmlyc3RMaW5lTGVuZ3RoID0gMDtcblx0XHRcdGxldCBsYXN0TGluZUxlbmd0aCA9IDA7XG5cdFx0XHRpZiAob3AudGV4dCkge1xuXHRcdFx0XHRsZXQgc3RyRU9MOiBTdHJpbmdFT0w7XG5cdFx0XHRcdFtlb2xDb3VudCwgZmlyc3RMaW5lTGVuZ3RoLCBsYXN0TGluZUxlbmd0aCwgc3RyRU9MXSA9IGNvdW50RU9MKG9wLnRleHQpO1xuXG5cdFx0XHRcdGNvbnN0IGJ1ZmZlckVPTCA9IHRoaXMuZ2V0RU9MKCk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkU3RyRU9MID0gKGJ1ZmZlckVPTCA9PT0gJ1xcclxcbicgPyBTdHJpbmdFT0wuQ1JMRiA6IFN0cmluZ0VPTC5MRik7XG5cdFx0XHRcdGlmIChzdHJFT0wgPT09IFN0cmluZ0VPTC5Vbmtub3duIHx8IHN0ckVPTCA9PT0gZXhwZWN0ZWRTdHJFT0wpIHtcblx0XHRcdFx0XHR2YWxpZFRleHQgPSBvcC50ZXh0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhbGlkVGV4dCA9IG9wLnRleHQucmVwbGFjZSgvXFxyXFxufFxccnxcXG4vZywgYnVmZmVyRU9MKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRvcGVyYXRpb25zW2ldID0ge1xuXHRcdFx0XHRzb3J0SW5kZXg6IGksXG5cdFx0XHRcdGlkZW50aWZpZXI6IG9wLmlkZW50aWZpZXIgfHwgbnVsbCxcblx0XHRcdFx0cmFuZ2U6IHZhbGlkYXRlZFJhbmdlLFxuXHRcdFx0XHRyYW5nZU9mZnNldDogdGhpcy5nZXRPZmZzZXRBdCh2YWxpZGF0ZWRSYW5nZS5zdGFydExpbmVOdW1iZXIsIHZhbGlkYXRlZFJhbmdlLnN0YXJ0Q29sdW1uKSxcblx0XHRcdFx0cmFuZ2VMZW5ndGg6IHRoaXMuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHZhbGlkYXRlZFJhbmdlKSxcblx0XHRcdFx0dGV4dDogdmFsaWRUZXh0LFxuXHRcdFx0XHRlb2xDb3VudDogZW9sQ291bnQsXG5cdFx0XHRcdGZpcnN0TGluZUxlbmd0aDogZmlyc3RMaW5lTGVuZ3RoLFxuXHRcdFx0XHRsYXN0TGluZUxlbmd0aDogbGFzdExpbmVMZW5ndGgsXG5cdFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IEJvb2xlYW4ob3AuZm9yY2VNb3ZlTWFya2VycyksXG5cdFx0XHRcdGlzQXV0b1doaXRlc3BhY2VFZGl0OiBvcC5pc0F1dG9XaGl0ZXNwYWNlRWRpdCB8fCBmYWxzZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBTb3J0IG9wZXJhdGlvbnMgYXNjZW5kaW5nXG5cdFx0b3BlcmF0aW9ucy5zb3J0KFBpZWNlVHJlZVRleHRCdWZmZXIuX3NvcnRPcHNBc2NlbmRpbmcpO1xuXG5cdFx0bGV0IGhhc1RvdWNoaW5nUmFuZ2VzID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGNvdW50ID0gb3BlcmF0aW9ucy5sZW5ndGggLSAxOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgcmFuZ2VFbmQgPSBvcGVyYXRpb25zW2ldLnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBuZXh0UmFuZ2VTdGFydCA9IG9wZXJhdGlvbnNbaSArIDFdLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0aWYgKG5leHRSYW5nZVN0YXJ0LmlzQmVmb3JlT3JFcXVhbChyYW5nZUVuZCkpIHtcblx0XHRcdFx0aWYgKG5leHRSYW5nZVN0YXJ0LmlzQmVmb3JlKHJhbmdlRW5kKSkge1xuXHRcdFx0XHRcdC8vIG92ZXJsYXBwaW5nIHJhbmdlc1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignT3ZlcmxhcHBpbmcgcmFuZ2VzIGFyZSBub3QgYWxsb3dlZCEnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRoYXNUb3VjaGluZ1JhbmdlcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNhblJlZHVjZU9wZXJhdGlvbnMpIHtcblx0XHRcdG9wZXJhdGlvbnMgPSB0aGlzLl9yZWR1Y2VPcGVyYXRpb25zKG9wZXJhdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIERlbHRhIGVuY29kZSBvcGVyYXRpb25zXG5cdFx0Y29uc3QgcmV2ZXJzZVJhbmdlcyA9IChjb21wdXRlVW5kb0VkaXRzIHx8IHJlY29yZFRyaW1BdXRvV2hpdGVzcGFjZSA/IFBpZWNlVHJlZVRleHRCdWZmZXIuX2dldEludmVyc2VFZGl0UmFuZ2VzKG9wZXJhdGlvbnMpIDogW10pO1xuXHRcdGNvbnN0IG5ld1RyaW1BdXRvV2hpdGVzcGFjZUNhbmRpZGF0ZXM6IHsgbGluZU51bWJlcjogbnVtYmVyOyBvbGRDb250ZW50OiBzdHJpbmcgfVtdID0gW107XG5cdFx0aWYgKHJlY29yZFRyaW1BdXRvV2hpdGVzcGFjZSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvcGVyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG9wID0gb3BlcmF0aW9uc1tpXTtcblx0XHRcdFx0Y29uc3QgcmV2ZXJzZVJhbmdlID0gcmV2ZXJzZVJhbmdlc1tpXTtcblxuXHRcdFx0XHRpZiAob3AuaXNBdXRvV2hpdGVzcGFjZUVkaXQgJiYgb3AucmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0Ly8gUmVjb3JkIGFscmVhZHkgdGhlIGZ1dHVyZSBsaW5lIG51bWJlcnMgdGhhdCBtaWdodCBiZSBhdXRvIHdoaXRlc3BhY2UgcmVtb3ZhbCBjYW5kaWRhdGVzIG9uIG5leHQgZWRpdFxuXHRcdFx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByZXZlcnNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJldmVyc2VSYW5nZS5lbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0XHRcdGxldCBjdXJyZW50TGluZUNvbnRlbnQgPSAnJztcblx0XHRcdFx0XHRcdGlmIChsaW5lTnVtYmVyID09PSByZXZlcnNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdGN1cnJlbnRMaW5lQ29udGVudCA9IHRoaXMuZ2V0TGluZUNvbnRlbnQob3AucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0aWYgKHN0cmluZ3MuZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgoY3VycmVudExpbmVDb250ZW50KSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bmV3VHJpbUF1dG9XaGl0ZXNwYWNlQ2FuZGlkYXRlcy5wdXNoKHsgbGluZU51bWJlcjogbGluZU51bWJlciwgb2xkQ29udGVudDogY3VycmVudExpbmVDb250ZW50IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXZlcnNlT3BlcmF0aW9uczogSVJldmVyc2VTaW5nbGVFZGl0T3BlcmF0aW9uW10gfCBudWxsID0gbnVsbDtcblx0XHRpZiAoY29tcHV0ZVVuZG9FZGl0cykge1xuXG5cdFx0XHRsZXQgcmV2ZXJzZVJhbmdlRGVsdGFPZmZzZXQgPSAwO1xuXHRcdFx0cmV2ZXJzZU9wZXJhdGlvbnMgPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3BlcmF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBvcCA9IG9wZXJhdGlvbnNbaV07XG5cdFx0XHRcdGNvbnN0IHJldmVyc2VSYW5nZSA9IHJldmVyc2VSYW5nZXNbaV07XG5cdFx0XHRcdGNvbnN0IGJ1ZmZlclRleHQgPSB0aGlzLmdldFZhbHVlSW5SYW5nZShvcC5yYW5nZSk7XG5cdFx0XHRcdGNvbnN0IHJldmVyc2VSYW5nZU9mZnNldCA9IG9wLnJhbmdlT2Zmc2V0ICsgcmV2ZXJzZVJhbmdlRGVsdGFPZmZzZXQ7XG5cdFx0XHRcdHJldmVyc2VSYW5nZURlbHRhT2Zmc2V0ICs9IChvcC50ZXh0Lmxlbmd0aCAtIGJ1ZmZlclRleHQubGVuZ3RoKTtcblxuXHRcdFx0XHRyZXZlcnNlT3BlcmF0aW9uc1tpXSA9IHtcblx0XHRcdFx0XHRzb3J0SW5kZXg6IG9wLnNvcnRJbmRleCxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBvcC5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdHJhbmdlOiByZXZlcnNlUmFuZ2UsXG5cdFx0XHRcdFx0dGV4dDogYnVmZmVyVGV4dCxcblx0XHRcdFx0XHR0ZXh0Q2hhbmdlOiBuZXcgVGV4dENoYW5nZShvcC5yYW5nZU9mZnNldCwgYnVmZmVyVGV4dCwgcmV2ZXJzZVJhbmdlT2Zmc2V0LCBvcC50ZXh0KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDYW4gb25seSBzb3J0IHJldmVyc2Ugb3BlcmF0aW9ucyB3aGVuIHRoZSBvcmRlciBpcyBub3Qgc2lnbmlmaWNhbnRcblx0XHRcdGlmICghaGFzVG91Y2hpbmdSYW5nZXMpIHtcblx0XHRcdFx0cmV2ZXJzZU9wZXJhdGlvbnMuc29ydCgoYSwgYikgPT4gYS5zb3J0SW5kZXggLSBiLnNvcnRJbmRleCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHR0aGlzLl9taWdodENvbnRhaW5SVEwgPSBtaWdodENvbnRhaW5SVEw7XG5cdFx0dGhpcy5fbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycyA9IG1pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnM7XG5cdFx0dGhpcy5fbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSA9IG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUk7XG5cblx0XHRjb25zdCBjb250ZW50Q2hhbmdlcyA9IHRoaXMuX2RvQXBwbHlFZGl0cyhvcGVyYXRpb25zKTtcblxuXHRcdGxldCB0cmltQXV0b1doaXRlc3BhY2VMaW5lTnVtYmVyczogbnVtYmVyW10gfCBudWxsID0gbnVsbDtcblx0XHRpZiAocmVjb3JkVHJpbUF1dG9XaGl0ZXNwYWNlICYmIG5ld1RyaW1BdXRvV2hpdGVzcGFjZUNhbmRpZGF0ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gc29ydCBsaW5lIG51bWJlcnMgYXV0byB3aGl0ZXNwYWNlIHJlbW92YWwgY2FuZGlkYXRlcyBmb3IgbmV4dCBlZGl0IGRlc2NlbmRpbmdcblx0XHRcdG5ld1RyaW1BdXRvV2hpdGVzcGFjZUNhbmRpZGF0ZXMuc29ydCgoYSwgYikgPT4gYi5saW5lTnVtYmVyIC0gYS5saW5lTnVtYmVyKTtcblxuXHRcdFx0dHJpbUF1dG9XaGl0ZXNwYWNlTGluZU51bWJlcnMgPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBuZXdUcmltQXV0b1doaXRlc3BhY2VDYW5kaWRhdGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBuZXdUcmltQXV0b1doaXRlc3BhY2VDYW5kaWRhdGVzW2ldLmxpbmVOdW1iZXI7XG5cdFx0XHRcdGlmIChpID4gMCAmJiBuZXdUcmltQXV0b1doaXRlc3BhY2VDYW5kaWRhdGVzW2kgLSAxXS5saW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Ly8gRG8gbm90IGhhdmUgdGhlIHNhbWUgbGluZSBudW1iZXIgdHdpY2Vcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHByZXZDb250ZW50ID0gbmV3VHJpbUF1dG9XaGl0ZXNwYWNlQ2FuZGlkYXRlc1tpXS5vbGRDb250ZW50O1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cblx0XHRcdFx0aWYgKGxpbmVDb250ZW50Lmxlbmd0aCA9PT0gMCB8fCBsaW5lQ29udGVudCA9PT0gcHJldkNvbnRlbnQgfHwgc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lQ29udGVudCkgIT09IC0xKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cmltQXV0b1doaXRlc3BhY2VMaW5lTnVtYmVycy5wdXNoKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5maXJlKCk7XG5cblx0XHRyZXR1cm4gbmV3IEFwcGx5RWRpdHNSZXN1bHQoXG5cdFx0XHRyZXZlcnNlT3BlcmF0aW9ucyxcblx0XHRcdGNvbnRlbnRDaGFuZ2VzLFxuXHRcdFx0dHJpbUF1dG9XaGl0ZXNwYWNlTGluZU51bWJlcnNcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zZm9ybSBvcGVyYXRpb25zIHN1Y2ggdGhhdCB0aGV5IHJlcHJlc2VudCB0aGUgc2FtZSBsb2dpYyBlZGl0LFxuXHQgKiBidXQgdGhhdCB0aGV5IGFsc28gZG8gbm90IGNhdXNlIE9PTSBjcmFzaGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVkdWNlT3BlcmF0aW9ucyhvcGVyYXRpb25zOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbltdKTogSVZhbGlkYXRlZEVkaXRPcGVyYXRpb25bXSB7XG5cdFx0aWYgKG9wZXJhdGlvbnMubGVuZ3RoIDwgMTAwMCkge1xuXHRcdFx0Ly8gV2Uga25vdyBmcm9tIGVtcGlyaWNhbCB0ZXN0aW5nIHRoYXQgYSB0aG91c2FuZCBlZGl0cyB3b3JrIGZpbmUgcmVnYXJkbGVzcyBvZiB0aGVpciBzaGFwZS5cblx0XHRcdHJldHVybiBvcGVyYXRpb25zO1xuXHRcdH1cblxuXHRcdC8vIEF0IG9uZSBwb2ludCwgZHVlIHRvIGhvdyBldmVudHMgYXJlIGVtaXR0ZWQgYW5kIGhvdyBlYWNoIG9wZXJhdGlvbiBpcyBoYW5kbGVkLFxuXHRcdC8vIHNvbWUgb3BlcmF0aW9ucyBjYW4gdHJpZ2dlciBhIGhpZ2ggYW1vdW50IG9mIHRlbXBvcmFyeSBzdHJpbmcgYWxsb2NhdGlvbnMsXG5cdFx0Ly8gdGhhdCB3aWxsIGltbWVkaWF0ZWx5IGdldCBlZGl0ZWQgYWdhaW4uXG5cdFx0Ly8gZS5nLiBhIGZvcm1hdHRlciBpbnNlcnRpbmcgcmlkaWN1bG91cyBhbW1vdW50cyBvZiBcXG4gb24gYSBtb2RlbCB3aXRoIGEgc2luZ2xlIGxpbmVcblx0XHQvLyBUaGVyZWZvcmUsIHRoZSBzdHJhdGVneSBpcyB0byBjb2xsYXBzZSBhbGwgdGhlIG9wZXJhdGlvbnMgaW50byBhIGh1Z2Ugc2luZ2xlIGVkaXQgb3BlcmF0aW9uXG5cdFx0cmV0dXJuIFt0aGlzLl90b1NpbmdsZUVkaXRPcGVyYXRpb24ob3BlcmF0aW9ucyldO1xuXHR9XG5cblx0X3RvU2luZ2xlRWRpdE9wZXJhdGlvbihvcGVyYXRpb25zOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbltdKTogSVZhbGlkYXRlZEVkaXRPcGVyYXRpb24ge1xuXHRcdGxldCBmb3JjZU1vdmVNYXJrZXJzID0gZmFsc2U7XG5cdFx0Y29uc3QgZmlyc3RFZGl0UmFuZ2UgPSBvcGVyYXRpb25zWzBdLnJhbmdlO1xuXHRcdGNvbnN0IGxhc3RFZGl0UmFuZ2UgPSBvcGVyYXRpb25zW29wZXJhdGlvbnMubGVuZ3RoIC0gMV0ucmFuZ2U7XG5cdFx0Y29uc3QgZW50aXJlRWRpdFJhbmdlID0gbmV3IFJhbmdlKGZpcnN0RWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlciwgZmlyc3RFZGl0UmFuZ2Uuc3RhcnRDb2x1bW4sIGxhc3RFZGl0UmFuZ2UuZW5kTGluZU51bWJlciwgbGFzdEVkaXRSYW5nZS5lbmRDb2x1bW4pO1xuXHRcdGxldCBsYXN0RW5kTGluZU51bWJlciA9IGZpcnN0RWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRsZXQgbGFzdEVuZENvbHVtbiA9IGZpcnN0RWRpdFJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBvcGVyYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBvcGVyYXRpb24gPSBvcGVyYXRpb25zW2ldO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBvcGVyYXRpb24ucmFuZ2U7XG5cblx0XHRcdGZvcmNlTW92ZU1hcmtlcnMgPSBmb3JjZU1vdmVNYXJrZXJzIHx8IG9wZXJhdGlvbi5mb3JjZU1vdmVNYXJrZXJzO1xuXG5cdFx0XHQvLyAoMSkgLS0gUHVzaCBvbGQgdGV4dFxuXHRcdFx0cmVzdWx0LnB1c2godGhpcy5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKGxhc3RFbmRMaW5lTnVtYmVyLCBsYXN0RW5kQ29sdW1uLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKSkpO1xuXG5cdFx0XHQvLyAoMikgLS0gUHVzaCBuZXcgdGV4dFxuXHRcdFx0aWYgKG9wZXJhdGlvbi50ZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gob3BlcmF0aW9uLnRleHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRsYXN0RW5kTGluZU51bWJlciA9IHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRsYXN0RW5kQ29sdW1uID0gcmFuZ2UuZW5kQ29sdW1uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHQgPSByZXN1bHQuam9pbignJyk7XG5cdFx0Y29uc3QgW2VvbENvdW50LCBmaXJzdExpbmVMZW5ndGgsIGxhc3RMaW5lTGVuZ3RoXSA9IGNvdW50RU9MKHRleHQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNvcnRJbmRleDogMCxcblx0XHRcdGlkZW50aWZpZXI6IG9wZXJhdGlvbnNbMF0uaWRlbnRpZmllcixcblx0XHRcdHJhbmdlOiBlbnRpcmVFZGl0UmFuZ2UsXG5cdFx0XHRyYW5nZU9mZnNldDogdGhpcy5nZXRPZmZzZXRBdChlbnRpcmVFZGl0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlbnRpcmVFZGl0UmFuZ2Uuc3RhcnRDb2x1bW4pLFxuXHRcdFx0cmFuZ2VMZW5ndGg6IHRoaXMuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKGVudGlyZUVkaXRSYW5nZSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCksXG5cdFx0XHR0ZXh0OiB0ZXh0LFxuXHRcdFx0ZW9sQ291bnQ6IGVvbENvdW50LFxuXHRcdFx0Zmlyc3RMaW5lTGVuZ3RoOiBmaXJzdExpbmVMZW5ndGgsXG5cdFx0XHRsYXN0TGluZUxlbmd0aDogbGFzdExpbmVMZW5ndGgsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmb3JjZU1vdmVNYXJrZXJzLFxuXHRcdFx0aXNBdXRvV2hpdGVzcGFjZUVkaXQ6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2RvQXBwbHlFZGl0cyhvcGVyYXRpb25zOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbltdKTogSUludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlW10ge1xuXHRcdG9wZXJhdGlvbnMuc29ydChQaWVjZVRyZWVUZXh0QnVmZmVyLl9zb3J0T3BzRGVzY2VuZGluZyk7XG5cblx0XHRjb25zdCBjb250ZW50Q2hhbmdlczogSUludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlW10gPSBbXTtcblxuXHRcdC8vIG9wZXJhdGlvbnMgYXJlIGZyb20gYm90dG9tIHRvIHRvcFxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3BlcmF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgb3AgPSBvcGVyYXRpb25zW2ldO1xuXG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBvcC5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IG9wLnJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IG9wLnJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSBvcC5yYW5nZS5lbmRDb2x1bW47XG5cblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXIgJiYgc3RhcnRDb2x1bW4gPT09IGVuZENvbHVtbiAmJiBvcC50ZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyBuby1vcFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wLnRleHQpIHtcblx0XHRcdFx0Ly8gcmVwbGFjZW1lbnRcblx0XHRcdFx0dGhpcy5fcGllY2VUcmVlLmRlbGV0ZShvcC5yYW5nZU9mZnNldCwgb3AucmFuZ2VMZW5ndGgpO1xuXHRcdFx0XHR0aGlzLl9waWVjZVRyZWUuaW5zZXJ0KG9wLnJhbmdlT2Zmc2V0LCBvcC50ZXh0LCB0cnVlKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZGVsZXRpb25cblx0XHRcdFx0dGhpcy5fcGllY2VUcmVlLmRlbGV0ZShvcC5yYW5nZU9mZnNldCwgb3AucmFuZ2VMZW5ndGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZW50Q2hhbmdlUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKTtcblx0XHRcdGNvbnRlbnRDaGFuZ2VzLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogY29udGVudENoYW5nZVJhbmdlLFxuXHRcdFx0XHRyYW5nZUxlbmd0aDogb3AucmFuZ2VMZW5ndGgsXG5cdFx0XHRcdHRleHQ6IG9wLnRleHQsXG5cdFx0XHRcdHJhbmdlT2Zmc2V0OiBvcC5yYW5nZU9mZnNldCxcblx0XHRcdFx0Zm9yY2VNb3ZlTWFya2Vyczogb3AuZm9yY2VNb3ZlTWFya2Vyc1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZW50Q2hhbmdlcztcblx0fVxuXG5cdGZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZTogUmFuZ2UsIHNlYXJjaERhdGE6IFNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIpOiBGaW5kTWF0Y2hbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5maW5kTWF0Y2hlc0xpbmVCeUxpbmUoc2VhcmNoUmFuZ2UsIHNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIGhlbHBlclxuXHQvLyB0ZXN0aW5nIHB1cnBvc2UuXG5cdHB1YmxpYyBnZXRQaWVjZVRyZWUoKTogUGllY2VUcmVlQmFzZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgX2dldEludmVyc2VFZGl0UmFuZ2UocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpIHtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSByYW5nZS5zdGFydENvbHVtbjtcblx0XHRjb25zdCBbZW9sQ291bnQsIGZpcnN0TGluZUxlbmd0aCwgbGFzdExpbmVMZW5ndGhdID0gY291bnRFT0wodGV4dCk7XG5cdFx0bGV0IHJlc3VsdFJhbmdlOiBSYW5nZTtcblxuXHRcdGlmICh0ZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIHRoZSBvcGVyYXRpb24gaW5zZXJ0cyBzb21ldGhpbmdcblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IGVvbENvdW50ICsgMTtcblxuXHRcdFx0aWYgKGxpbmVDb3VudCA9PT0gMSkge1xuXHRcdFx0XHQvLyBzaW5nbGUgbGluZSBpbnNlcnRcblx0XHRcdFx0cmVzdWx0UmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiArIGZpcnN0TGluZUxlbmd0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBtdWx0aSBsaW5lIGluc2VydFxuXHRcdFx0XHRyZXN1bHRSYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBzdGFydExpbmVOdW1iZXIgKyBsaW5lQ291bnQgLSAxLCBsYXN0TGluZUxlbmd0aCArIDEpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUaGVyZSBpcyBub3RoaW5nIHRvIGluc2VydFxuXHRcdFx0cmVzdWx0UmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdFJhbmdlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFzc3VtZXMgYG9wZXJhdGlvbnNgIGFyZSB2YWxpZGF0ZWQgYW5kIHNvcnRlZCBhc2NlbmRpbmdcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgX2dldEludmVyc2VFZGl0UmFuZ2VzKG9wZXJhdGlvbnM6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uW10pOiBSYW5nZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFJhbmdlW10gPSBbXTtcblxuXHRcdGxldCBwcmV2T3BFbmRMaW5lTnVtYmVyOiBudW1iZXIgPSAwO1xuXHRcdGxldCBwcmV2T3BFbmRDb2x1bW46IG51bWJlciA9IDA7XG5cdFx0bGV0IHByZXZPcDogSVZhbGlkYXRlZEVkaXRPcGVyYXRpb24gfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gb3BlcmF0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgb3AgPSBvcGVyYXRpb25zW2ldO1xuXG5cdFx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0XHRsZXQgc3RhcnRDb2x1bW46IG51bWJlcjtcblxuXHRcdFx0aWYgKHByZXZPcCkge1xuXHRcdFx0XHRpZiAocHJldk9wLnJhbmdlLmVuZExpbmVOdW1iZXIgPT09IG9wLnJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IHByZXZPcEVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW4gPSBwcmV2T3BFbmRDb2x1bW4gKyAob3AucmFuZ2Uuc3RhcnRDb2x1bW4gLSBwcmV2T3AucmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBwcmV2T3BFbmRMaW5lTnVtYmVyICsgKG9wLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIHByZXZPcC5yYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRzdGFydENvbHVtbiA9IG9wLnJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBvcC5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uID0gb3AucmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXN1bHRSYW5nZTogUmFuZ2U7XG5cblx0XHRcdGlmIChvcC50ZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gdGhlIG9wZXJhdGlvbiBpbnNlcnRzIHNvbWV0aGluZ1xuXHRcdFx0XHRjb25zdCBsaW5lQ291bnQgPSBvcC5lb2xDb3VudCArIDE7XG5cblx0XHRcdFx0aWYgKGxpbmVDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRcdC8vIHNpbmdsZSBsaW5lIGluc2VydFxuXHRcdFx0XHRcdHJlc3VsdFJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4gKyBvcC5maXJzdExpbmVMZW5ndGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIG11bHRpIGxpbmUgaW5zZXJ0XG5cdFx0XHRcdFx0cmVzdWx0UmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgc3RhcnRMaW5lTnVtYmVyICsgbGluZUNvdW50IC0gMSwgb3AubGFzdExpbmVMZW5ndGggKyAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVGhlcmUgaXMgbm90aGluZyB0byBpbnNlcnRcblx0XHRcdFx0cmVzdWx0UmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdHByZXZPcEVuZExpbmVOdW1iZXIgPSByZXN1bHRSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0cHJldk9wRW5kQ29sdW1uID0gcmVzdWx0UmFuZ2UuZW5kQ29sdW1uO1xuXG5cdFx0XHRyZXN1bHQucHVzaChyZXN1bHRSYW5nZSk7XG5cdFx0XHRwcmV2T3AgPSBvcDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NvcnRPcHNBc2NlbmRpbmcoYTogSVZhbGlkYXRlZEVkaXRPcGVyYXRpb24sIGI6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCByID0gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nRW5kcyhhLnJhbmdlLCBiLnJhbmdlKTtcblx0XHRpZiAociA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGEuc29ydEluZGV4IC0gYi5zb3J0SW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NvcnRPcHNEZXNjZW5kaW5nKGE6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uLCBiOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbik6IG51bWJlciB7XG5cdFx0Y29uc3QgciA9IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ0VuZHMoYS5yYW5nZSwgYi5yYW5nZSk7XG5cdFx0aWYgKHIgPT09IDApIHtcblx0XHRcdHJldHVybiBiLnNvcnRJbmRleCAtIGEuc29ydEluZGV4O1xuXHRcdH1cblx0XHRyZXR1cm4gLXI7XG5cdH1cblx0Ly8gI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFzQjtBQUMvQixZQUFZLGFBQWE7QUFFekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCLDJCQUE2TDtBQUN4TixTQUFTLHFCQUFtQztBQUM1QyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBb0JwQixNQUFNLDRCQUE0QixXQUFrQztBQUFBLEVBVTFFLFlBQVksUUFBd0IsS0FBYSxLQUFvQixhQUFzQixnQ0FBeUMsY0FBdUIsZUFBd0I7QUFDbEwsVUFBTTtBQUpQLFNBQWlCLHNCQUFxQyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFLdkYsU0FBSyxPQUFPO0FBQ1osU0FBSyw2QkFBNkIsQ0FBQztBQUNuQyxTQUFLLG1CQUFtQjtBQUN4QixTQUFLLHNDQUFzQztBQUMzQyxTQUFLLGFBQWEsSUFBSSxjQUFjLFFBQVEsS0FBSyxhQUFhO0FBQUEsRUFDL0Q7QUFBQSxFQVRBLElBQVcscUJBQWtDO0FBQUUsV0FBTyxLQUFLLG9CQUFvQjtBQUFBLEVBQU87QUFBQTtBQUFBLEVBWS9FLE9BQU8sT0FBNkI7QUFDMUMsUUFBSSxFQUFFLGlCQUFpQixzQkFBc0I7QUFDNUMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssU0FBUyxNQUFNLE1BQU07QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssT0FBTyxNQUFNLE1BQU0sT0FBTyxHQUFHO0FBQ3JDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLFdBQVcsTUFBTSxNQUFNLFVBQVU7QUFBQSxFQUM5QztBQUFBLEVB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
