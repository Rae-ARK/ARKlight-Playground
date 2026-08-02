import { compareBy, equals } from "../../../../base/common/arrays.js";
import { assertFn, checkAdjacentItems } from "../../../../base/common/assert.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { commonPrefixLength, commonSuffixLength } from "../../../../base/common/strings.js";
import { Position } from "../position.js";
import { Range } from "../range.js";
import { TextLength } from "../text/textLength.js";
import { StringText } from "../text/abstractText.js";
class TextEdit {
  constructor(replacements) {
    this.replacements = replacements;
    assertFn(() => checkAdjacentItems(replacements, (a, b) => a.range.getEndPosition().isBeforeOrEqual(b.range.getStartPosition())));
  }
  static fromStringEdit(edit, initialState) {
    const edits = edit.replacements.map((e) => TextReplacement.fromStringReplacement(e, initialState));
    return new TextEdit(edits);
  }
  static replace(originalRange, newText) {
    return new TextEdit([new TextReplacement(originalRange, newText)]);
  }
  static delete(range) {
    return new TextEdit([new TextReplacement(range, "")]);
  }
  static insert(position, newText) {
    return new TextEdit([new TextReplacement(Range.fromPositions(position, position), newText)]);
  }
  static fromParallelReplacementsUnsorted(replacements) {
    const r = replacements.slice().sort(compareBy((i) => i.range, Range.compareRangesUsingStarts));
    return new TextEdit(r);
  }
  /**
   * Joins touching edits and removes empty edits.
   */
  normalize() {
    const replacements = [];
    for (const r of this.replacements) {
      if (replacements.length > 0 && replacements[replacements.length - 1].range.getEndPosition().equals(r.range.getStartPosition())) {
        const last = replacements[replacements.length - 1];
        replacements[replacements.length - 1] = new TextReplacement(last.range.plusRange(r.range), last.text + r.text);
      } else if (!r.isEmpty) {
        replacements.push(r);
      }
    }
    return new TextEdit(replacements);
  }
  mapPosition(position) {
    let lineDelta = 0;
    let curLine = 0;
    let columnDeltaInCurLine = 0;
    for (const replacement of this.replacements) {
      const start = replacement.range.getStartPosition();
      if (position.isBeforeOrEqual(start)) {
        break;
      }
      const end = replacement.range.getEndPosition();
      const len = TextLength.ofText(replacement.text);
      if (position.isBefore(end)) {
        const startPos = new Position(start.lineNumber + lineDelta, start.column + (start.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
        const endPos = len.addToPosition(startPos);
        return rangeFromPositions(startPos, endPos);
      }
      if (start.lineNumber + lineDelta !== curLine) {
        columnDeltaInCurLine = 0;
      }
      lineDelta += len.lineCount - (replacement.range.endLineNumber - replacement.range.startLineNumber);
      if (len.lineCount === 0) {
        if (end.lineNumber !== start.lineNumber) {
          columnDeltaInCurLine += len.columnCount - (end.column - 1);
        } else {
          columnDeltaInCurLine += len.columnCount - (end.column - start.column);
        }
      } else {
        columnDeltaInCurLine = len.columnCount;
      }
      curLine = end.lineNumber + lineDelta;
    }
    return new Position(position.lineNumber + lineDelta, position.column + (position.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
  }
  mapRange(range) {
    function getStart(p) {
      return p instanceof Position ? p : p.getStartPosition();
    }
    function getEnd(p) {
      return p instanceof Position ? p : p.getEndPosition();
    }
    const start = getStart(this.mapPosition(range.getStartPosition()));
    const end = getEnd(this.mapPosition(range.getEndPosition()));
    return rangeFromPositions(start, end);
  }
  // TODO: `doc` is not needed for this!
  inverseMapPosition(positionAfterEdit, doc) {
    const reversed = this.inverse(doc);
    return reversed.mapPosition(positionAfterEdit);
  }
  inverseMapRange(range, doc) {
    const reversed = this.inverse(doc);
    return reversed.mapRange(range);
  }
  apply(text) {
    let result = "";
    let lastEditEnd = new Position(1, 1);
    for (const replacement of this.replacements) {
      const editRange = replacement.range;
      const editStart = editRange.getStartPosition();
      const editEnd = editRange.getEndPosition();
      const r2 = rangeFromPositions(lastEditEnd, editStart);
      if (!r2.isEmpty()) {
        result += text.getValueOfRange(r2);
      }
      result += replacement.text;
      lastEditEnd = editEnd;
    }
    const r = rangeFromPositions(lastEditEnd, text.endPositionExclusive);
    if (!r.isEmpty()) {
      result += text.getValueOfRange(r);
    }
    return result;
  }
  applyToString(str) {
    const strText = new StringText(str);
    return this.apply(strText);
  }
  inverse(doc) {
    const ranges = this.getNewRanges();
    return new TextEdit(this.replacements.map((e, idx) => new TextReplacement(ranges[idx], doc.getValueOfRange(e.range))));
  }
  getNewRanges() {
    const newRanges = [];
    let previousEditEndLineNumber = 0;
    let lineOffset = 0;
    let columnOffset = 0;
    for (const replacement of this.replacements) {
      const textLength = TextLength.ofText(replacement.text);
      const newRangeStart = Position.lift({
        lineNumber: replacement.range.startLineNumber + lineOffset,
        column: replacement.range.startColumn + (replacement.range.startLineNumber === previousEditEndLineNumber ? columnOffset : 0)
      });
      const newRange = textLength.createRange(newRangeStart);
      newRanges.push(newRange);
      lineOffset = newRange.endLineNumber - replacement.range.endLineNumber;
      columnOffset = newRange.endColumn - replacement.range.endColumn;
      previousEditEndLineNumber = replacement.range.endLineNumber;
    }
    return newRanges;
  }
  toReplacement(text) {
    if (this.replacements.length === 0) {
      throw new BugIndicatingError();
    }
    if (this.replacements.length === 1) {
      return this.replacements[0];
    }
    const startPos = this.replacements[0].range.getStartPosition();
    const endPos = this.replacements[this.replacements.length - 1].range.getEndPosition();
    let newText = "";
    for (let i = 0; i < this.replacements.length; i++) {
      const curEdit = this.replacements[i];
      newText += curEdit.text;
      if (i < this.replacements.length - 1) {
        const nextEdit = this.replacements[i + 1];
        const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
        const gapText = text.getValueOfRange(gapRange);
        newText += gapText;
      }
    }
    return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
  }
  equals(other) {
    return equals(this.replacements, other.replacements, (a, b) => a.equals(b));
  }
  /**
   * Combines two edits into one with the same effect.
   * WARNING: This is written by AI, but well tested. I do not understand the implementation myself.
   *
   * Invariant:
   * ```
   * other.applyToString(this.applyToString(s0)) = this.compose(other).applyToString(s0)
   * ```
   */
  compose(other) {
    const edits1 = this.normalize();
    const edits2 = other.normalize();
    if (edits1.replacements.length === 0) {
      return edits2;
    }
    if (edits2.replacements.length === 0) {
      return edits1;
    }
    const resultReplacements = [];
    let edit1Idx = 0;
    let lastEdit1EndS0Line = 1;
    let lastEdit1EndS0Col = 1;
    let headSrcRangeStartLine = 0;
    let headSrcRangeStartCol = 0;
    let headSrcRangeEndLine = 0;
    let headSrcRangeEndCol = 0;
    let headText = null;
    let headLengthLine = 0;
    let headLengthCol = 0;
    let headHasValue = false;
    let headIsInfinite = false;
    let currentPosInS1Line = 1;
    let currentPosInS1Col = 1;
    function ensureHead() {
      if (headHasValue) {
        return;
      }
      if (edit1Idx < edits1.replacements.length) {
        const nextEdit = edits1.replacements[edit1Idx];
        const nextEditStart = nextEdit.range.getStartPosition();
        const gapIsEmpty = lastEdit1EndS0Line === nextEditStart.lineNumber && lastEdit1EndS0Col === nextEditStart.column;
        if (!gapIsEmpty) {
          headSrcRangeStartLine = lastEdit1EndS0Line;
          headSrcRangeStartCol = lastEdit1EndS0Col;
          headSrcRangeEndLine = nextEditStart.lineNumber;
          headSrcRangeEndCol = nextEditStart.column;
          headText = null;
          if (lastEdit1EndS0Line === nextEditStart.lineNumber) {
            headLengthLine = 0;
            headLengthCol = nextEditStart.column - lastEdit1EndS0Col;
          } else {
            headLengthLine = nextEditStart.lineNumber - lastEdit1EndS0Line;
            headLengthCol = nextEditStart.column - 1;
          }
          headHasValue = true;
          lastEdit1EndS0Line = nextEditStart.lineNumber;
          lastEdit1EndS0Col = nextEditStart.column;
        } else {
          const nextEditEnd = nextEdit.range.getEndPosition();
          headSrcRangeStartLine = nextEditStart.lineNumber;
          headSrcRangeStartCol = nextEditStart.column;
          headSrcRangeEndLine = nextEditEnd.lineNumber;
          headSrcRangeEndCol = nextEditEnd.column;
          headText = nextEdit.text;
          let line = 0;
          let column = 0;
          const text = nextEdit.text;
          for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) {
              line++;
              column = 0;
            } else {
              column++;
            }
          }
          headLengthLine = line;
          headLengthCol = column;
          headHasValue = true;
          lastEdit1EndS0Line = nextEditEnd.lineNumber;
          lastEdit1EndS0Col = nextEditEnd.column;
          edit1Idx++;
        }
      } else {
        headIsInfinite = true;
        headSrcRangeStartLine = lastEdit1EndS0Line;
        headSrcRangeStartCol = lastEdit1EndS0Col;
        headHasValue = true;
      }
    }
    function splitText(text, lenLine, lenCol) {
      if (lenLine === 0 && lenCol === 0) {
        return ["", text];
      }
      let line = 0;
      let offset = 0;
      while (line < lenLine) {
        const idx = text.indexOf("\n", offset);
        if (idx === -1) {
          throw new BugIndicatingError("Text length mismatch");
        }
        offset = idx + 1;
        line++;
      }
      offset += lenCol;
      return [text.substring(0, offset), text.substring(offset)];
    }
    for (const r2 of edits2.replacements) {
      const r2Start = r2.range.getStartPosition();
      const r2End = r2.range.getEndPosition();
      while (true) {
        if (currentPosInS1Line === r2Start.lineNumber && currentPosInS1Col === r2Start.column) {
          break;
        }
        ensureHead();
        if (headIsInfinite) {
          let distLine, distCol;
          if (currentPosInS1Line === r2Start.lineNumber) {
            distLine = 0;
            distCol = r2Start.column - currentPosInS1Col;
          } else {
            distLine = r2Start.lineNumber - currentPosInS1Line;
            distCol = r2Start.column - 1;
          }
          currentPosInS1Line = r2Start.lineNumber;
          currentPosInS1Col = r2Start.column;
          if (distLine === 0) {
            headSrcRangeStartCol += distCol;
          } else {
            headSrcRangeStartLine += distLine;
            headSrcRangeStartCol = distCol + 1;
          }
          break;
        }
        let headEndInS1Line, headEndInS1Col;
        if (headLengthLine === 0) {
          headEndInS1Line = currentPosInS1Line;
          headEndInS1Col = currentPosInS1Col + headLengthCol;
        } else {
          headEndInS1Line = currentPosInS1Line + headLengthLine;
          headEndInS1Col = headLengthCol + 1;
        }
        let r2StartIsBeforeHeadEnd = false;
        if (r2Start.lineNumber < headEndInS1Line) {
          r2StartIsBeforeHeadEnd = true;
        } else if (r2Start.lineNumber === headEndInS1Line) {
          r2StartIsBeforeHeadEnd = r2Start.column < headEndInS1Col;
        }
        if (r2StartIsBeforeHeadEnd) {
          let splitLenLine, splitLenCol;
          if (currentPosInS1Line === r2Start.lineNumber) {
            splitLenLine = 0;
            splitLenCol = r2Start.column - currentPosInS1Col;
          } else {
            splitLenLine = r2Start.lineNumber - currentPosInS1Line;
            splitLenCol = r2Start.column - 1;
          }
          let remainingLenLine, remainingLenCol;
          if (splitLenLine === headLengthLine) {
            remainingLenLine = 0;
            remainingLenCol = headLengthCol - splitLenCol;
          } else {
            remainingLenLine = headLengthLine - splitLenLine;
            remainingLenCol = headLengthCol;
          }
          if (headText !== null) {
            const [t1, t2] = splitText(headText, splitLenLine, splitLenCol);
            resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), t1));
            headText = t2;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
            headSrcRangeStartLine = headSrcRangeEndLine;
            headSrcRangeStartCol = headSrcRangeEndCol;
          } else {
            let splitPosLine, splitPosCol;
            if (splitLenLine === 0) {
              splitPosLine = headSrcRangeStartLine;
              splitPosCol = headSrcRangeStartCol + splitLenCol;
            } else {
              splitPosLine = headSrcRangeStartLine + splitLenLine;
              splitPosCol = splitLenCol + 1;
            }
            headSrcRangeStartLine = splitPosLine;
            headSrcRangeStartCol = splitPosCol;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
          }
          currentPosInS1Line = r2Start.lineNumber;
          currentPosInS1Col = r2Start.column;
          break;
        }
        if (headText !== null) {
          resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
        }
        currentPosInS1Line = headEndInS1Line;
        currentPosInS1Col = headEndInS1Col;
        headHasValue = false;
      }
      let consumedStartS0Line = null;
      let consumedStartS0Col = null;
      let consumedEndS0Line = null;
      let consumedEndS0Col = null;
      while (true) {
        if (currentPosInS1Line === r2End.lineNumber && currentPosInS1Col === r2End.column) {
          break;
        }
        ensureHead();
        if (headIsInfinite) {
          let distLine, distCol;
          if (currentPosInS1Line === r2End.lineNumber) {
            distLine = 0;
            distCol = r2End.column - currentPosInS1Col;
          } else {
            distLine = r2End.lineNumber - currentPosInS1Line;
            distCol = r2End.column - 1;
          }
          let rangeInS0EndLine, rangeInS0EndCol;
          if (distLine === 0) {
            rangeInS0EndLine = headSrcRangeStartLine;
            rangeInS0EndCol = headSrcRangeStartCol + distCol;
          } else {
            rangeInS0EndLine = headSrcRangeStartLine + distLine;
            rangeInS0EndCol = distCol + 1;
          }
          if (consumedStartS0Line === null) {
            consumedStartS0Line = headSrcRangeStartLine;
            consumedStartS0Col = headSrcRangeStartCol;
          }
          consumedEndS0Line = rangeInS0EndLine;
          consumedEndS0Col = rangeInS0EndCol;
          currentPosInS1Line = r2End.lineNumber;
          currentPosInS1Col = r2End.column;
          headSrcRangeStartLine = rangeInS0EndLine;
          headSrcRangeStartCol = rangeInS0EndCol;
          break;
        }
        let headEndInS1Line, headEndInS1Col;
        if (headLengthLine === 0) {
          headEndInS1Line = currentPosInS1Line;
          headEndInS1Col = currentPosInS1Col + headLengthCol;
        } else {
          headEndInS1Line = currentPosInS1Line + headLengthLine;
          headEndInS1Col = headLengthCol + 1;
        }
        let r2EndIsBeforeHeadEnd = false;
        if (r2End.lineNumber < headEndInS1Line) {
          r2EndIsBeforeHeadEnd = true;
        } else if (r2End.lineNumber === headEndInS1Line) {
          r2EndIsBeforeHeadEnd = r2End.column < headEndInS1Col;
        }
        if (r2EndIsBeforeHeadEnd) {
          let splitLenLine, splitLenCol;
          if (currentPosInS1Line === r2End.lineNumber) {
            splitLenLine = 0;
            splitLenCol = r2End.column - currentPosInS1Col;
          } else {
            splitLenLine = r2End.lineNumber - currentPosInS1Line;
            splitLenCol = r2End.column - 1;
          }
          let remainingLenLine, remainingLenCol;
          if (splitLenLine === headLengthLine) {
            remainingLenLine = 0;
            remainingLenCol = headLengthCol - splitLenCol;
          } else {
            remainingLenLine = headLengthLine - splitLenLine;
            remainingLenCol = headLengthCol;
          }
          if (headText !== null) {
            if (consumedStartS0Line === null) {
              consumedStartS0Line = headSrcRangeStartLine;
              consumedStartS0Col = headSrcRangeStartCol;
            }
            consumedEndS0Line = headSrcRangeEndLine;
            consumedEndS0Col = headSrcRangeEndCol;
            const [, t2] = splitText(headText, splitLenLine, splitLenCol);
            headText = t2;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
            headSrcRangeStartLine = headSrcRangeEndLine;
            headSrcRangeStartCol = headSrcRangeEndCol;
          } else {
            let splitPosLine, splitPosCol;
            if (splitLenLine === 0) {
              splitPosLine = headSrcRangeStartLine;
              splitPosCol = headSrcRangeStartCol + splitLenCol;
            } else {
              splitPosLine = headSrcRangeStartLine + splitLenLine;
              splitPosCol = splitLenCol + 1;
            }
            if (consumedStartS0Line === null) {
              consumedStartS0Line = headSrcRangeStartLine;
              consumedStartS0Col = headSrcRangeStartCol;
            }
            consumedEndS0Line = splitPosLine;
            consumedEndS0Col = splitPosCol;
            headSrcRangeStartLine = splitPosLine;
            headSrcRangeStartCol = splitPosCol;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
          }
          currentPosInS1Line = r2End.lineNumber;
          currentPosInS1Col = r2End.column;
          break;
        }
        if (consumedStartS0Line === null) {
          consumedStartS0Line = headSrcRangeStartLine;
          consumedStartS0Col = headSrcRangeStartCol;
        }
        consumedEndS0Line = headSrcRangeEndLine;
        consumedEndS0Col = headSrcRangeEndCol;
        currentPosInS1Line = headEndInS1Line;
        currentPosInS1Col = headEndInS1Col;
        headHasValue = false;
      }
      if (consumedStartS0Line !== null) {
        resultReplacements.push(new TextReplacement(new Range(consumedStartS0Line, consumedStartS0Col, consumedEndS0Line, consumedEndS0Col), r2.text));
      } else {
        ensureHead();
        const insertPosS0Line = headSrcRangeStartLine;
        const insertPosS0Col = headSrcRangeStartCol;
        resultReplacements.push(new TextReplacement(new Range(insertPosS0Line, insertPosS0Col, insertPosS0Line, insertPosS0Col), r2.text));
      }
    }
    while (true) {
      ensureHead();
      if (headIsInfinite) {
        break;
      }
      if (headText !== null) {
        resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
      }
      headHasValue = false;
    }
    return new TextEdit(resultReplacements).normalize();
  }
  toString(text) {
    if (text === void 0) {
      return this.replacements.map((edit) => edit.toString()).join("\n");
    }
    if (typeof text === "string") {
      return this.toString(new StringText(text));
    }
    if (this.replacements.length === 0) {
      return "";
    }
    return this.replacements.map((r) => {
      const maxLength = 10;
      const originalText = text.getValueOfRange(r.range);
      const beforeRange = Range.fromPositions(
        new Position(Math.max(1, r.range.startLineNumber - 1), 1),
        r.range.getStartPosition()
      );
      let beforeText = text.getValueOfRange(beforeRange);
      if (beforeText.length > maxLength) {
        beforeText = "..." + beforeText.substring(beforeText.length - maxLength);
      }
      const afterRange = Range.fromPositions(
        r.range.getEndPosition(),
        new Position(r.range.endLineNumber + 1, 1)
      );
      let afterText = text.getValueOfRange(afterRange);
      if (afterText.length > maxLength) {
        afterText = afterText.substring(0, maxLength) + "...";
      }
      let replacedText = originalText;
      if (replacedText.length > maxLength) {
        const halfMax = Math.floor(maxLength / 2);
        replacedText = replacedText.substring(0, halfMax) + "..." + replacedText.substring(replacedText.length - halfMax);
      }
      let newText = r.text;
      if (newText.length > maxLength) {
        const halfMax = Math.floor(maxLength / 2);
        newText = newText.substring(0, halfMax) + "..." + newText.substring(newText.length - halfMax);
      }
      if (replacedText.length === 0) {
        return `${beforeText}\u2770${newText}\u2771${afterText}`;
      }
      return `${beforeText}\u2770${replacedText}\u21A6${newText}\u2771${afterText}`;
    }).join("\n");
  }
}
class TextReplacement {
  constructor(range, text) {
    this.range = range;
    this.text = text;
  }
  static joinReplacements(replacements, initialValue) {
    if (replacements.length === 0) {
      throw new BugIndicatingError();
    }
    if (replacements.length === 1) {
      return replacements[0];
    }
    const startPos = replacements[0].range.getStartPosition();
    const endPos = replacements[replacements.length - 1].range.getEndPosition();
    let newText = "";
    for (let i = 0; i < replacements.length; i++) {
      const curEdit = replacements[i];
      newText += curEdit.text;
      if (i < replacements.length - 1) {
        const nextEdit = replacements[i + 1];
        const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
        const gapText = initialValue.getValueOfRange(gapRange);
        newText += gapText;
      }
    }
    return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
  }
  static fromStringReplacement(replacement, initialState) {
    return new TextReplacement(initialState.getTransformer().getRange(replacement.replaceRange), replacement.newText);
  }
  static delete(range) {
    return new TextReplacement(range, "");
  }
  get isEmpty() {
    return this.range.isEmpty() && this.text.length === 0;
  }
  static equals(first, second) {
    return first.range.equalsRange(second.range) && first.text === second.text;
  }
  toSingleEditOperation() {
    return {
      range: this.range,
      text: this.text
    };
  }
  toEdit() {
    return new TextEdit([this]);
  }
  equals(other) {
    return TextReplacement.equals(this, other);
  }
  extendToCoverRange(range, initialValue) {
    if (this.range.containsRange(range)) {
      return this;
    }
    const newRange = this.range.plusRange(range);
    const textBefore = initialValue.getValueOfRange(Range.fromPositions(newRange.getStartPosition(), this.range.getStartPosition()));
    const textAfter = initialValue.getValueOfRange(Range.fromPositions(this.range.getEndPosition(), newRange.getEndPosition()));
    const newText = textBefore + this.text + textAfter;
    return new TextReplacement(newRange, newText);
  }
  extendToFullLine(initialValue) {
    const newRange = new Range(
      this.range.startLineNumber,
      1,
      this.range.endLineNumber,
      initialValue.getTransformer().getLineLength(this.range.endLineNumber) + 1
    );
    return this.extendToCoverRange(newRange, initialValue);
  }
  removeCommonPrefixAndSuffix(text) {
    const prefix = this.removeCommonPrefix(text);
    const suffix = prefix.removeCommonSuffix(text);
    return suffix;
  }
  removeCommonPrefix(text) {
    const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll("\r\n", "\n");
    const normalizedModifiedText = this.text.replaceAll("\r\n", "\n");
    const commonPrefixLen = commonPrefixLength(normalizedOriginalText, normalizedModifiedText);
    const start = TextLength.ofText(normalizedOriginalText.substring(0, commonPrefixLen)).addToPosition(this.range.getStartPosition());
    const newText = normalizedModifiedText.substring(commonPrefixLen);
    const range = Range.fromPositions(start, this.range.getEndPosition());
    return new TextReplacement(range, newText);
  }
  removeCommonSuffix(text) {
    const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll("\r\n", "\n");
    const normalizedModifiedText = this.text.replaceAll("\r\n", "\n");
    const commonSuffixLen = commonSuffixLength(normalizedOriginalText, normalizedModifiedText);
    const end = TextLength.ofText(normalizedOriginalText.substring(0, normalizedOriginalText.length - commonSuffixLen)).addToPosition(this.range.getStartPosition());
    const newText = normalizedModifiedText.substring(0, normalizedModifiedText.length - commonSuffixLen);
    const range = Range.fromPositions(this.range.getStartPosition(), end);
    return new TextReplacement(range, newText);
  }
  isEffectiveDeletion(text) {
    let newText = this.text.replaceAll("\r\n", "\n");
    let existingText = text.getValueOfRange(this.range).replaceAll("\r\n", "\n");
    const l = commonPrefixLength(newText, existingText);
    newText = newText.substring(l);
    existingText = existingText.substring(l);
    const r = commonSuffixLength(newText, existingText);
    newText = newText.substring(0, newText.length - r);
    existingText = existingText.substring(0, existingText.length - r);
    return newText === "";
  }
  toString() {
    const start = this.range.getStartPosition();
    const end = this.range.getEndPosition();
    return `(${start.lineNumber},${start.column} -> ${end.lineNumber},${end.column}): "${this.text}"`;
  }
}
function rangeFromPositions(start, end) {
  if (start.lineNumber === end.lineNumber && start.column === Number.MAX_SAFE_INTEGER) {
    return Range.fromPositions(end, end);
  } else if (!start.isBeforeOrEqual(end)) {
    throw new BugIndicatingError("start must be before end");
  }
  return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
}
export {
  TextEdit,
  TextReplacement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbXBhcmVCeSwgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFzc2VydEZuLCBjaGVja0FkamFjZW50SXRlbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGNvbW1vblByZWZpeExlbmd0aCwgY29tbW9uU3VmZml4TGVuZ3RoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgQmFzZVN0cmluZ0VkaXQsIFN0cmluZ1JlcGxhY2VtZW50IH0gZnJvbSAnLi9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0TGVuZ3RoIH0gZnJvbSAnLi4vdGV4dC90ZXh0TGVuZ3RoLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VGV4dCwgU3RyaW5nVGV4dCB9IGZyb20gJy4uL3RleHQvYWJzdHJhY3RUZXh0LmpzJztcbmltcG9ydCB7IElFcXVhdGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgVGV4dEVkaXQge1xuXHRwdWJsaWMgc3RhdGljIGZyb21TdHJpbmdFZGl0KGVkaXQ6IEJhc2VTdHJpbmdFZGl0LCBpbml0aWFsU3RhdGU6IEFic3RyYWN0VGV4dCk6IFRleHRFZGl0IHtcblx0XHRjb25zdCBlZGl0cyA9IGVkaXQucmVwbGFjZW1lbnRzLm1hcChlID0+IFRleHRSZXBsYWNlbWVudC5mcm9tU3RyaW5nUmVwbGFjZW1lbnQoZSwgaW5pdGlhbFN0YXRlKSk7XG5cdFx0cmV0dXJuIG5ldyBUZXh0RWRpdChlZGl0cyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlcGxhY2Uob3JpZ2luYWxSYW5nZTogUmFuZ2UsIG5ld1RleHQ6IHN0cmluZyk6IFRleHRFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KFtuZXcgVGV4dFJlcGxhY2VtZW50KG9yaWdpbmFsUmFuZ2UsIG5ld1RleHQpXSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZShyYW5nZTogUmFuZ2UpOiBUZXh0RWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBUZXh0RWRpdChbbmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgJycpXSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGluc2VydChwb3NpdGlvbjogUG9zaXRpb24sIG5ld1RleHQ6IHN0cmluZyk6IFRleHRFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KFtuZXcgVGV4dFJlcGxhY2VtZW50KFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24sIHBvc2l0aW9uKSwgbmV3VGV4dCldKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbVBhcmFsbGVsUmVwbGFjZW1lbnRzVW5zb3J0ZWQocmVwbGFjZW1lbnRzOiByZWFkb25seSBUZXh0UmVwbGFjZW1lbnRbXSk6IFRleHRFZGl0IHtcblx0XHRjb25zdCByID0gcmVwbGFjZW1lbnRzLnNsaWNlKCkuc29ydChjb21wYXJlQnkoaSA9PiBpLnJhbmdlLCBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpKTtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KHIpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcGxhY2VtZW50czogcmVhZG9ubHkgVGV4dFJlcGxhY2VtZW50W11cblx0KSB7XG5cdFx0YXNzZXJ0Rm4oKCkgPT4gY2hlY2tBZGphY2VudEl0ZW1zKHJlcGxhY2VtZW50cywgKGEsIGIpID0+IGEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKS5pc0JlZm9yZU9yRXF1YWwoYi5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpKSk7XG5cdH1cblxuXHQvKipcblx0ICogSm9pbnMgdG91Y2hpbmcgZWRpdHMgYW5kIHJlbW92ZXMgZW1wdHkgZWRpdHMuXG5cdCAqL1xuXHRub3JtYWxpemUoKTogVGV4dEVkaXQge1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50czogVGV4dFJlcGxhY2VtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGlmIChyZXBsYWNlbWVudHMubGVuZ3RoID4gMCAmJiByZXBsYWNlbWVudHNbcmVwbGFjZW1lbnRzLmxlbmd0aCAtIDFdLnJhbmdlLmdldEVuZFBvc2l0aW9uKCkuZXF1YWxzKHIucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSkge1xuXHRcdFx0XHRjb25zdCBsYXN0ID0gcmVwbGFjZW1lbnRzW3JlcGxhY2VtZW50cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0cmVwbGFjZW1lbnRzW3JlcGxhY2VtZW50cy5sZW5ndGggLSAxXSA9IG5ldyBUZXh0UmVwbGFjZW1lbnQobGFzdC5yYW5nZS5wbHVzUmFuZ2Uoci5yYW5nZSksIGxhc3QudGV4dCArIHIudGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFyLmlzRW1wdHkpIHtcblx0XHRcdFx0cmVwbGFjZW1lbnRzLnB1c2gocik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVGV4dEVkaXQocmVwbGFjZW1lbnRzKTtcblx0fVxuXG5cdG1hcFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHwgUmFuZ2Uge1xuXHRcdGxldCBsaW5lRGVsdGEgPSAwO1xuXHRcdGxldCBjdXJMaW5lID0gMDtcblx0XHRsZXQgY29sdW1uRGVsdGFJbkN1ckxpbmUgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCByZXBsYWNlbWVudCBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSByZXBsYWNlbWVudC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cblx0XHRcdGlmIChwb3NpdGlvbi5pc0JlZm9yZU9yRXF1YWwoc3RhcnQpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmQgPSByZXBsYWNlbWVudC5yYW5nZS5nZXRFbmRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgbGVuID0gVGV4dExlbmd0aC5vZlRleHQocmVwbGFjZW1lbnQudGV4dCk7XG5cdFx0XHRpZiAocG9zaXRpb24uaXNCZWZvcmUoZW5kKSkge1xuXHRcdFx0XHRjb25zdCBzdGFydFBvcyA9IG5ldyBQb3NpdGlvbihzdGFydC5saW5lTnVtYmVyICsgbGluZURlbHRhLCBzdGFydC5jb2x1bW4gKyAoc3RhcnQubGluZU51bWJlciArIGxpbmVEZWx0YSA9PT0gY3VyTGluZSA/IGNvbHVtbkRlbHRhSW5DdXJMaW5lIDogMCkpO1xuXHRcdFx0XHRjb25zdCBlbmRQb3MgPSBsZW4uYWRkVG9Qb3NpdGlvbihzdGFydFBvcyk7XG5cdFx0XHRcdHJldHVybiByYW5nZUZyb21Qb3NpdGlvbnMoc3RhcnRQb3MsIGVuZFBvcyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGFydC5saW5lTnVtYmVyICsgbGluZURlbHRhICE9PSBjdXJMaW5lKSB7XG5cdFx0XHRcdGNvbHVtbkRlbHRhSW5DdXJMaW5lID0gMDtcblx0XHRcdH1cblxuXHRcdFx0bGluZURlbHRhICs9IGxlbi5saW5lQ291bnQgLSAocmVwbGFjZW1lbnQucmFuZ2UuZW5kTGluZU51bWJlciAtIHJlcGxhY2VtZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRcdGlmIChsZW4ubGluZUNvdW50ID09PSAwKSB7XG5cdFx0XHRcdGlmIChlbmQubGluZU51bWJlciAhPT0gc3RhcnQubGluZU51bWJlcikge1xuXHRcdFx0XHRcdGNvbHVtbkRlbHRhSW5DdXJMaW5lICs9IGxlbi5jb2x1bW5Db3VudCAtIChlbmQuY29sdW1uIC0gMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29sdW1uRGVsdGFJbkN1ckxpbmUgKz0gbGVuLmNvbHVtbkNvdW50IC0gKGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb2x1bW5EZWx0YUluQ3VyTGluZSA9IGxlbi5jb2x1bW5Db3VudDtcblx0XHRcdH1cblx0XHRcdGN1ckxpbmUgPSBlbmQubGluZU51bWJlciArIGxpbmVEZWx0YTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIgKyBsaW5lRGVsdGEsIHBvc2l0aW9uLmNvbHVtbiArIChwb3NpdGlvbi5saW5lTnVtYmVyICsgbGluZURlbHRhID09PSBjdXJMaW5lID8gY29sdW1uRGVsdGFJbkN1ckxpbmUgOiAwKSk7XG5cdH1cblxuXHRtYXBSYW5nZShyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0ZnVuY3Rpb24gZ2V0U3RhcnQocDogUG9zaXRpb24gfCBSYW5nZSkge1xuXHRcdFx0cmV0dXJuIHAgaW5zdGFuY2VvZiBQb3NpdGlvbiA/IHAgOiBwLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRFbmQocDogUG9zaXRpb24gfCBSYW5nZSkge1xuXHRcdFx0cmV0dXJuIHAgaW5zdGFuY2VvZiBQb3NpdGlvbiA/IHAgOiBwLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSBnZXRTdGFydCh0aGlzLm1hcFBvc2l0aW9uKHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkpO1xuXHRcdGNvbnN0IGVuZCA9IGdldEVuZCh0aGlzLm1hcFBvc2l0aW9uKHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpKTtcblxuXHRcdHJldHVybiByYW5nZUZyb21Qb3NpdGlvbnMoc3RhcnQsIGVuZCk7XG5cdH1cblxuXHQvLyBUT0RPOiBgZG9jYCBpcyBub3QgbmVlZGVkIGZvciB0aGlzIVxuXHRpbnZlcnNlTWFwUG9zaXRpb24ocG9zaXRpb25BZnRlckVkaXQ6IFBvc2l0aW9uLCBkb2M6IEFic3RyYWN0VGV4dCk6IFBvc2l0aW9uIHwgUmFuZ2Uge1xuXHRcdGNvbnN0IHJldmVyc2VkID0gdGhpcy5pbnZlcnNlKGRvYyk7XG5cdFx0cmV0dXJuIHJldmVyc2VkLm1hcFBvc2l0aW9uKHBvc2l0aW9uQWZ0ZXJFZGl0KTtcblx0fVxuXG5cdGludmVyc2VNYXBSYW5nZShyYW5nZTogUmFuZ2UsIGRvYzogQWJzdHJhY3RUZXh0KTogUmFuZ2Uge1xuXHRcdGNvbnN0IHJldmVyc2VkID0gdGhpcy5pbnZlcnNlKGRvYyk7XG5cdFx0cmV0dXJuIHJldmVyc2VkLm1hcFJhbmdlKHJhbmdlKTtcblx0fVxuXG5cdGFwcGx5KHRleHQ6IEFic3RyYWN0VGV4dCk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9ICcnO1xuXHRcdGxldCBsYXN0RWRpdEVuZCA9IG5ldyBQb3NpdGlvbigxLCAxKTtcblx0XHRmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBlZGl0UmFuZ2UgPSByZXBsYWNlbWVudC5yYW5nZTtcblx0XHRcdGNvbnN0IGVkaXRTdGFydCA9IGVkaXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBlZGl0RW5kID0gZWRpdFJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cblx0XHRcdGNvbnN0IHIgPSByYW5nZUZyb21Qb3NpdGlvbnMobGFzdEVkaXRFbmQsIGVkaXRTdGFydCk7XG5cdFx0XHRpZiAoIXIuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHJlc3VsdCArPSB0ZXh0LmdldFZhbHVlT2ZSYW5nZShyKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdCArPSByZXBsYWNlbWVudC50ZXh0O1xuXHRcdFx0bGFzdEVkaXRFbmQgPSBlZGl0RW5kO1xuXHRcdH1cblx0XHRjb25zdCByID0gcmFuZ2VGcm9tUG9zaXRpb25zKGxhc3RFZGl0RW5kLCB0ZXh0LmVuZFBvc2l0aW9uRXhjbHVzaXZlKTtcblx0XHRpZiAoIXIuaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXN1bHQgKz0gdGV4dC5nZXRWYWx1ZU9mUmFuZ2Uocik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhcHBseVRvU3RyaW5nKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdHJUZXh0ID0gbmV3IFN0cmluZ1RleHQoc3RyKTtcblx0XHRyZXR1cm4gdGhpcy5hcHBseShzdHJUZXh0KTtcblx0fVxuXG5cdGludmVyc2UoZG9jOiBBYnN0cmFjdFRleHQpOiBUZXh0RWRpdCB7XG5cdFx0Y29uc3QgcmFuZ2VzID0gdGhpcy5nZXROZXdSYW5nZXMoKTtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KHRoaXMucmVwbGFjZW1lbnRzLm1hcCgoZSwgaWR4KSA9PiBuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlc1tpZHhdLCBkb2MuZ2V0VmFsdWVPZlJhbmdlKGUucmFuZ2UpKSkpO1xuXHR9XG5cblx0Z2V0TmV3UmFuZ2VzKCk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IG5ld1JhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGxldCBwcmV2aW91c0VkaXRFbmRMaW5lTnVtYmVyID0gMDtcblx0XHRsZXQgbGluZU9mZnNldCA9IDA7XG5cdFx0bGV0IGNvbHVtbk9mZnNldCA9IDA7XG5cdFx0Zm9yIChjb25zdCByZXBsYWNlbWVudCBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0Y29uc3QgdGV4dExlbmd0aCA9IFRleHRMZW5ndGgub2ZUZXh0KHJlcGxhY2VtZW50LnRleHQpO1xuXHRcdFx0Y29uc3QgbmV3UmFuZ2VTdGFydCA9IFBvc2l0aW9uLmxpZnQoe1xuXHRcdFx0XHRsaW5lTnVtYmVyOiByZXBsYWNlbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXIgKyBsaW5lT2Zmc2V0LFxuXHRcdFx0XHRjb2x1bW46IHJlcGxhY2VtZW50LnJhbmdlLnN0YXJ0Q29sdW1uICsgKHJlcGxhY2VtZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcHJldmlvdXNFZGl0RW5kTGluZU51bWJlciA/IGNvbHVtbk9mZnNldCA6IDApXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG5ld1JhbmdlID0gdGV4dExlbmd0aC5jcmVhdGVSYW5nZShuZXdSYW5nZVN0YXJ0KTtcblx0XHRcdG5ld1Jhbmdlcy5wdXNoKG5ld1JhbmdlKTtcblx0XHRcdGxpbmVPZmZzZXQgPSBuZXdSYW5nZS5lbmRMaW5lTnVtYmVyIC0gcmVwbGFjZW1lbnQucmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdGNvbHVtbk9mZnNldCA9IG5ld1JhbmdlLmVuZENvbHVtbiAtIHJlcGxhY2VtZW50LnJhbmdlLmVuZENvbHVtbjtcblx0XHRcdHByZXZpb3VzRWRpdEVuZExpbmVOdW1iZXIgPSByZXBsYWNlbWVudC5yYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3UmFuZ2VzO1xuXHR9XG5cblx0dG9SZXBsYWNlbWVudCh0ZXh0OiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdGlmICh0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHsgdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpOyB9XG5cdFx0aWYgKHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMSkgeyByZXR1cm4gdGhpcy5yZXBsYWNlbWVudHNbMF07IH1cblxuXHRcdGNvbnN0IHN0YXJ0UG9zID0gdGhpcy5yZXBsYWNlbWVudHNbMF0ucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGVuZFBvcyA9IHRoaXMucmVwbGFjZW1lbnRzW3RoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCAtIDFdLnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cblx0XHRsZXQgbmV3VGV4dCA9ICcnO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VyRWRpdCA9IHRoaXMucmVwbGFjZW1lbnRzW2ldO1xuXHRcdFx0bmV3VGV4dCArPSBjdXJFZGl0LnRleHQ7XG5cdFx0XHRpZiAoaSA8IHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0Y29uc3QgbmV4dEVkaXQgPSB0aGlzLnJlcGxhY2VtZW50c1tpICsgMV07XG5cdFx0XHRcdGNvbnN0IGdhcFJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhjdXJFZGl0LnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIG5leHRFZGl0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdGNvbnN0IGdhcFRleHQgPSB0ZXh0LmdldFZhbHVlT2ZSYW5nZShnYXBSYW5nZSk7XG5cdFx0XHRcdG5ld1RleHQgKz0gZ2FwVGV4dDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBUZXh0UmVwbGFjZW1lbnQoUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydFBvcywgZW5kUG9zKSwgbmV3VGV4dCk7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFRleHRFZGl0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVxdWFscyh0aGlzLnJlcGxhY2VtZW50cywgb3RoZXIucmVwbGFjZW1lbnRzLCAoYSwgYikgPT4gYS5lcXVhbHMoYikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbWJpbmVzIHR3byBlZGl0cyBpbnRvIG9uZSB3aXRoIHRoZSBzYW1lIGVmZmVjdC5cblx0ICogV0FSTklORzogVGhpcyBpcyB3cml0dGVuIGJ5IEFJLCBidXQgd2VsbCB0ZXN0ZWQuIEkgZG8gbm90IHVuZGVyc3RhbmQgdGhlIGltcGxlbWVudGF0aW9uIG15c2VsZi5cblx0ICpcblx0ICogSW52YXJpYW50OlxuXHQgKiBgYGBcblx0ICogb3RoZXIuYXBwbHlUb1N0cmluZyh0aGlzLmFwcGx5VG9TdHJpbmcoczApKSA9IHRoaXMuY29tcG9zZShvdGhlcikuYXBwbHlUb1N0cmluZyhzMClcblx0ICogYGBgXG5cdCAqL1xuXHRjb21wb3NlKG90aGVyOiBUZXh0RWRpdCk6IFRleHRFZGl0IHtcblx0XHRjb25zdCBlZGl0czEgPSB0aGlzLm5vcm1hbGl6ZSgpO1xuXHRcdGNvbnN0IGVkaXRzMiA9IG90aGVyLm5vcm1hbGl6ZSgpO1xuXG5cdFx0aWYgKGVkaXRzMS5yZXBsYWNlbWVudHMubGVuZ3RoID09PSAwKSB7IHJldHVybiBlZGl0czI7IH1cblx0XHRpZiAoZWRpdHMyLnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHsgcmV0dXJuIGVkaXRzMTsgfVxuXG5cdFx0Y29uc3QgcmVzdWx0UmVwbGFjZW1lbnRzOiBUZXh0UmVwbGFjZW1lbnRbXSA9IFtdO1xuXG5cdFx0bGV0IGVkaXQxSWR4ID0gMDtcblx0XHRsZXQgbGFzdEVkaXQxRW5kUzBMaW5lID0gMTtcblx0XHRsZXQgbGFzdEVkaXQxRW5kUzBDb2wgPSAxO1xuXG5cdFx0bGV0IGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IDA7XG5cdFx0bGV0IGhlYWRTcmNSYW5nZVN0YXJ0Q29sID0gMDtcblx0XHRsZXQgaGVhZFNyY1JhbmdlRW5kTGluZSA9IDA7XG5cdFx0bGV0IGhlYWRTcmNSYW5nZUVuZENvbCA9IDA7XG5cdFx0bGV0IGhlYWRUZXh0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgaGVhZExlbmd0aExpbmUgPSAwO1xuXHRcdGxldCBoZWFkTGVuZ3RoQ29sID0gMDtcblxuXHRcdGxldCBoZWFkSGFzVmFsdWUgPSBmYWxzZTtcblx0XHRsZXQgaGVhZElzSW5maW5pdGUgPSBmYWxzZTtcblxuXHRcdGxldCBjdXJyZW50UG9zSW5TMUxpbmUgPSAxO1xuXHRcdGxldCBjdXJyZW50UG9zSW5TMUNvbCA9IDE7XG5cblx0XHRmdW5jdGlvbiBlbnN1cmVIZWFkKCkge1xuXHRcdFx0aWYgKGhlYWRIYXNWYWx1ZSkgeyByZXR1cm47IH1cblxuXHRcdFx0aWYgKGVkaXQxSWR4IDwgZWRpdHMxLnJlcGxhY2VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgbmV4dEVkaXQgPSBlZGl0czEucmVwbGFjZW1lbnRzW2VkaXQxSWR4XTtcblx0XHRcdFx0Y29uc3QgbmV4dEVkaXRTdGFydCA9IG5leHRFZGl0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0XHRjb25zdCBnYXBJc0VtcHR5ID0gKGxhc3RFZGl0MUVuZFMwTGluZSA9PT0gbmV4dEVkaXRTdGFydC5saW5lTnVtYmVyKSAmJiAobGFzdEVkaXQxRW5kUzBDb2wgPT09IG5leHRFZGl0U3RhcnQuY29sdW1uKTtcblxuXHRcdFx0XHRpZiAoIWdhcElzRW1wdHkpIHtcblx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydExpbmUgPSBsYXN0RWRpdDFFbmRTMExpbmU7XG5cdFx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRDb2wgPSBsYXN0RWRpdDFFbmRTMENvbDtcblx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VFbmRMaW5lID0gbmV4dEVkaXRTdGFydC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZUVuZENvbCA9IG5leHRFZGl0U3RhcnQuY29sdW1uO1xuXG5cdFx0XHRcdFx0aGVhZFRleHQgPSBudWxsO1xuXG5cdFx0XHRcdFx0aWYgKGxhc3RFZGl0MUVuZFMwTGluZSA9PT0gbmV4dEVkaXRTdGFydC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoTGluZSA9IDA7XG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoQ29sID0gbmV4dEVkaXRTdGFydC5jb2x1bW4gLSBsYXN0RWRpdDFFbmRTMENvbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aGVhZExlbmd0aExpbmUgPSBuZXh0RWRpdFN0YXJ0LmxpbmVOdW1iZXIgLSBsYXN0RWRpdDFFbmRTMExpbmU7XG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoQ29sID0gbmV4dEVkaXRTdGFydC5jb2x1bW4gLSAxO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGhlYWRIYXNWYWx1ZSA9IHRydWU7XG5cdFx0XHRcdFx0bGFzdEVkaXQxRW5kUzBMaW5lID0gbmV4dEVkaXRTdGFydC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGxhc3RFZGl0MUVuZFMwQ29sID0gbmV4dEVkaXRTdGFydC5jb2x1bW47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dEVkaXRFbmQgPSBuZXh0RWRpdC5yYW5nZS5nZXRFbmRQb3NpdGlvbigpO1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IG5leHRFZGl0U3RhcnQubGluZU51bWJlcjtcblx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCA9IG5leHRFZGl0U3RhcnQuY29sdW1uO1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZUVuZExpbmUgPSBuZXh0RWRpdEVuZC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZUVuZENvbCA9IG5leHRFZGl0RW5kLmNvbHVtbjtcblxuXHRcdFx0XHRcdGhlYWRUZXh0ID0gbmV4dEVkaXQudGV4dDtcblxuXHRcdFx0XHRcdGxldCBsaW5lID0gMDtcblx0XHRcdFx0XHRsZXQgY29sdW1uID0gMDtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gbmV4dEVkaXQudGV4dDtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQoaSkgPT09IDEwKSB7XG5cdFx0XHRcdFx0XHRcdGxpbmUrKztcblx0XHRcdFx0XHRcdFx0Y29sdW1uID0gMDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbHVtbisrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRoZWFkTGVuZ3RoTGluZSA9IGxpbmU7XG5cdFx0XHRcdFx0aGVhZExlbmd0aENvbCA9IGNvbHVtbjtcblxuXHRcdFx0XHRcdGhlYWRIYXNWYWx1ZSA9IHRydWU7XG5cdFx0XHRcdFx0bGFzdEVkaXQxRW5kUzBMaW5lID0gbmV4dEVkaXRFbmQubGluZU51bWJlcjtcblx0XHRcdFx0XHRsYXN0RWRpdDFFbmRTMENvbCA9IG5leHRFZGl0RW5kLmNvbHVtbjtcblx0XHRcdFx0XHRlZGl0MUlkeCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoZWFkSXNJbmZpbml0ZSA9IHRydWU7XG5cdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IGxhc3RFZGl0MUVuZFMwTGluZTtcblx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRDb2wgPSBsYXN0RWRpdDFFbmRTMENvbDtcblx0XHRcdFx0aGVhZEhhc1ZhbHVlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzcGxpdFRleHQodGV4dDogc3RyaW5nLCBsZW5MaW5lOiBudW1iZXIsIGxlbkNvbDogbnVtYmVyKTogW3N0cmluZywgc3RyaW5nXSB7XG5cdFx0XHRpZiAobGVuTGluZSA9PT0gMCAmJiBsZW5Db2wgPT09IDApIHsgcmV0dXJuIFsnJywgdGV4dF07IH1cblx0XHRcdGxldCBsaW5lID0gMDtcblx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdFx0d2hpbGUgKGxpbmUgPCBsZW5MaW5lKSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IHRleHQuaW5kZXhPZignXFxuJywgb2Zmc2V0KTtcblx0XHRcdFx0aWYgKGlkeCA9PT0gLTEpIHsgdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVGV4dCBsZW5ndGggbWlzbWF0Y2gnKTsgfVxuXHRcdFx0XHRvZmZzZXQgPSBpZHggKyAxO1xuXHRcdFx0XHRsaW5lKys7XG5cdFx0XHR9XG5cdFx0XHRvZmZzZXQgKz0gbGVuQ29sO1xuXHRcdFx0cmV0dXJuIFt0ZXh0LnN1YnN0cmluZygwLCBvZmZzZXQpLCB0ZXh0LnN1YnN0cmluZyhvZmZzZXQpXTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHIyIG9mIGVkaXRzMi5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGNvbnN0IHIyU3RhcnQgPSByMi5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCByMkVuZCA9IHIyLnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGlmIChjdXJyZW50UG9zSW5TMUxpbmUgPT09IHIyU3RhcnQubGluZU51bWJlciAmJiBjdXJyZW50UG9zSW5TMUNvbCA9PT0gcjJTdGFydC5jb2x1bW4pIHsgYnJlYWs7IH1cblx0XHRcdFx0ZW5zdXJlSGVhZCgpO1xuXG5cdFx0XHRcdGlmIChoZWFkSXNJbmZpbml0ZSkge1xuXHRcdFx0XHRcdGxldCBkaXN0TGluZTogbnVtYmVyLCBkaXN0Q29sOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRQb3NJblMxTGluZSA9PT0gcjJTdGFydC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRkaXN0TGluZSA9IDA7XG5cdFx0XHRcdFx0XHRkaXN0Q29sID0gcjJTdGFydC5jb2x1bW4gLSBjdXJyZW50UG9zSW5TMUNvbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGlzdExpbmUgPSByMlN0YXJ0LmxpbmVOdW1iZXIgLSBjdXJyZW50UG9zSW5TMUxpbmU7XG5cdFx0XHRcdFx0XHRkaXN0Q29sID0gcjJTdGFydC5jb2x1bW4gLSAxO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGN1cnJlbnRQb3NJblMxTGluZSA9IHIyU3RhcnQubGluZU51bWJlcjtcblx0XHRcdFx0XHRjdXJyZW50UG9zSW5TMUNvbCA9IHIyU3RhcnQuY29sdW1uO1xuXG5cdFx0XHRcdFx0aWYgKGRpc3RMaW5lID09PSAwKSB7XG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCArPSBkaXN0Q29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydExpbmUgKz0gZGlzdExpbmU7XG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCA9IGRpc3RDb2wgKyAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBoZWFkRW5kSW5TMUxpbmU6IG51bWJlciwgaGVhZEVuZEluUzFDb2w6IG51bWJlcjtcblx0XHRcdFx0aWYgKGhlYWRMZW5ndGhMaW5lID09PSAwKSB7XG5cdFx0XHRcdFx0aGVhZEVuZEluUzFMaW5lID0gY3VycmVudFBvc0luUzFMaW5lO1xuXHRcdFx0XHRcdGhlYWRFbmRJblMxQ29sID0gY3VycmVudFBvc0luUzFDb2wgKyBoZWFkTGVuZ3RoQ29sO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhlYWRFbmRJblMxTGluZSA9IGN1cnJlbnRQb3NJblMxTGluZSArIGhlYWRMZW5ndGhMaW5lO1xuXHRcdFx0XHRcdGhlYWRFbmRJblMxQ29sID0gaGVhZExlbmd0aENvbCArIDE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgcjJTdGFydElzQmVmb3JlSGVhZEVuZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAocjJTdGFydC5saW5lTnVtYmVyIDwgaGVhZEVuZEluUzFMaW5lKSB7XG5cdFx0XHRcdFx0cjJTdGFydElzQmVmb3JlSGVhZEVuZCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAocjJTdGFydC5saW5lTnVtYmVyID09PSBoZWFkRW5kSW5TMUxpbmUpIHtcblx0XHRcdFx0XHRyMlN0YXJ0SXNCZWZvcmVIZWFkRW5kID0gcjJTdGFydC5jb2x1bW4gPCBoZWFkRW5kSW5TMUNvbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyMlN0YXJ0SXNCZWZvcmVIZWFkRW5kKSB7XG5cdFx0XHRcdFx0bGV0IHNwbGl0TGVuTGluZTogbnVtYmVyLCBzcGxpdExlbkNvbDogbnVtYmVyO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50UG9zSW5TMUxpbmUgPT09IHIyU3RhcnQubGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0c3BsaXRMZW5MaW5lID0gMDtcblx0XHRcdFx0XHRcdHNwbGl0TGVuQ29sID0gcjJTdGFydC5jb2x1bW4gLSBjdXJyZW50UG9zSW5TMUNvbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c3BsaXRMZW5MaW5lID0gcjJTdGFydC5saW5lTnVtYmVyIC0gY3VycmVudFBvc0luUzFMaW5lO1xuXHRcdFx0XHRcdFx0c3BsaXRMZW5Db2wgPSByMlN0YXJ0LmNvbHVtbiAtIDE7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IHJlbWFpbmluZ0xlbkxpbmU6IG51bWJlciwgcmVtYWluaW5nTGVuQ29sOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKHNwbGl0TGVuTGluZSA9PT0gaGVhZExlbmd0aExpbmUpIHtcblx0XHRcdFx0XHRcdHJlbWFpbmluZ0xlbkxpbmUgPSAwO1xuXHRcdFx0XHRcdFx0cmVtYWluaW5nTGVuQ29sID0gaGVhZExlbmd0aENvbCAtIHNwbGl0TGVuQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZW1haW5pbmdMZW5MaW5lID0gaGVhZExlbmd0aExpbmUgLSBzcGxpdExlbkxpbmU7XG5cdFx0XHRcdFx0XHRyZW1haW5pbmdMZW5Db2wgPSBoZWFkTGVuZ3RoQ29sO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChoZWFkVGV4dCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgW3QxLCB0Ml0gPSBzcGxpdFRleHQoaGVhZFRleHQsIHNwbGl0TGVuTGluZSwgc3BsaXRMZW5Db2wpO1xuXHRcdFx0XHRcdFx0cmVzdWx0UmVwbGFjZW1lbnRzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChuZXcgUmFuZ2UoaGVhZFNyY1JhbmdlU3RhcnRMaW5lLCBoZWFkU3JjUmFuZ2VTdGFydENvbCwgaGVhZFNyY1JhbmdlRW5kTGluZSwgaGVhZFNyY1JhbmdlRW5kQ29sKSwgdDEpKTtcblxuXHRcdFx0XHRcdFx0aGVhZFRleHQgPSB0Mjtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhMaW5lID0gcmVtYWluaW5nTGVuTGluZTtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhDb2wgPSByZW1haW5pbmdMZW5Db2w7XG5cblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IGhlYWRTcmNSYW5nZUVuZExpbmU7XG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCA9IGhlYWRTcmNSYW5nZUVuZENvbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGV0IHNwbGl0UG9zTGluZTogbnVtYmVyLCBzcGxpdFBvc0NvbDogbnVtYmVyO1xuXHRcdFx0XHRcdFx0aWYgKHNwbGl0TGVuTGluZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRzcGxpdFBvc0xpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdFx0XHRcdHNwbGl0UG9zQ29sID0gaGVhZFNyY1JhbmdlU3RhcnRDb2wgKyBzcGxpdExlbkNvbDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNwbGl0UG9zTGluZSA9IGhlYWRTcmNSYW5nZVN0YXJ0TGluZSArIHNwbGl0TGVuTGluZTtcblx0XHRcdFx0XHRcdFx0c3BsaXRQb3NDb2wgPSBzcGxpdExlbkNvbCArIDE7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IHNwbGl0UG9zTGluZTtcblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0Q29sID0gc3BsaXRQb3NDb2w7XG5cblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhMaW5lID0gcmVtYWluaW5nTGVuTGluZTtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhDb2wgPSByZW1haW5pbmdMZW5Db2w7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGN1cnJlbnRQb3NJblMxTGluZSA9IHIyU3RhcnQubGluZU51bWJlcjtcblx0XHRcdFx0XHRjdXJyZW50UG9zSW5TMUNvbCA9IHIyU3RhcnQuY29sdW1uO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGhlYWRUZXh0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0cmVzdWx0UmVwbGFjZW1lbnRzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChuZXcgUmFuZ2UoaGVhZFNyY1JhbmdlU3RhcnRMaW5lLCBoZWFkU3JjUmFuZ2VTdGFydENvbCwgaGVhZFNyY1JhbmdlRW5kTGluZSwgaGVhZFNyY1JhbmdlRW5kQ29sKSwgaGVhZFRleHQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGN1cnJlbnRQb3NJblMxTGluZSA9IGhlYWRFbmRJblMxTGluZTtcblx0XHRcdFx0Y3VycmVudFBvc0luUzFDb2wgPSBoZWFkRW5kSW5TMUNvbDtcblx0XHRcdFx0aGVhZEhhc1ZhbHVlID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjb25zdW1lZFN0YXJ0UzBMaW5lOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0XHRcdGxldCBjb25zdW1lZFN0YXJ0UzBDb2w6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IGNvbnN1bWVkRW5kUzBMaW5lOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0XHRcdGxldCBjb25zdW1lZEVuZFMwQ29sOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRQb3NJblMxTGluZSA9PT0gcjJFbmQubGluZU51bWJlciAmJiBjdXJyZW50UG9zSW5TMUNvbCA9PT0gcjJFbmQuY29sdW1uKSB7IGJyZWFrOyB9XG5cdFx0XHRcdGVuc3VyZUhlYWQoKTtcblxuXHRcdFx0XHRpZiAoaGVhZElzSW5maW5pdGUpIHtcblx0XHRcdFx0XHRsZXQgZGlzdExpbmU6IG51bWJlciwgZGlzdENvbDogbnVtYmVyO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50UG9zSW5TMUxpbmUgPT09IHIyRW5kLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGRpc3RMaW5lID0gMDtcblx0XHRcdFx0XHRcdGRpc3RDb2wgPSByMkVuZC5jb2x1bW4gLSBjdXJyZW50UG9zSW5TMUNvbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGlzdExpbmUgPSByMkVuZC5saW5lTnVtYmVyIC0gY3VycmVudFBvc0luUzFMaW5lO1xuXHRcdFx0XHRcdFx0ZGlzdENvbCA9IHIyRW5kLmNvbHVtbiAtIDE7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IHJhbmdlSW5TMEVuZExpbmU6IG51bWJlciwgcmFuZ2VJblMwRW5kQ29sOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKGRpc3RMaW5lID09PSAwKSB7XG5cdFx0XHRcdFx0XHRyYW5nZUluUzBFbmRMaW5lID0gaGVhZFNyY1JhbmdlU3RhcnRMaW5lO1xuXHRcdFx0XHRcdFx0cmFuZ2VJblMwRW5kQ29sID0gaGVhZFNyY1JhbmdlU3RhcnRDb2wgKyBkaXN0Q29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyYW5nZUluUzBFbmRMaW5lID0gaGVhZFNyY1JhbmdlU3RhcnRMaW5lICsgZGlzdExpbmU7XG5cdFx0XHRcdFx0XHRyYW5nZUluUzBFbmRDb2wgPSBkaXN0Q29sICsgMTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoY29uc3VtZWRTdGFydFMwTGluZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29uc3VtZWRTdGFydFMwTGluZSA9IGhlYWRTcmNSYW5nZVN0YXJ0TGluZTtcblx0XHRcdFx0XHRcdGNvbnN1bWVkU3RhcnRTMENvbCA9IGhlYWRTcmNSYW5nZVN0YXJ0Q29sO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdW1lZEVuZFMwTGluZSA9IHJhbmdlSW5TMEVuZExpbmU7XG5cdFx0XHRcdFx0Y29uc3VtZWRFbmRTMENvbCA9IHJhbmdlSW5TMEVuZENvbDtcblxuXHRcdFx0XHRcdGN1cnJlbnRQb3NJblMxTGluZSA9IHIyRW5kLmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0Y3VycmVudFBvc0luUzFDb2wgPSByMkVuZC5jb2x1bW47XG5cblx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydExpbmUgPSByYW5nZUluUzBFbmRMaW5lO1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0Q29sID0gcmFuZ2VJblMwRW5kQ29sO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGhlYWRFbmRJblMxTGluZTogbnVtYmVyLCBoZWFkRW5kSW5TMUNvbDogbnVtYmVyO1xuXHRcdFx0XHRpZiAoaGVhZExlbmd0aExpbmUgPT09IDApIHtcblx0XHRcdFx0XHRoZWFkRW5kSW5TMUxpbmUgPSBjdXJyZW50UG9zSW5TMUxpbmU7XG5cdFx0XHRcdFx0aGVhZEVuZEluUzFDb2wgPSBjdXJyZW50UG9zSW5TMUNvbCArIGhlYWRMZW5ndGhDb2w7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGVhZEVuZEluUzFMaW5lID0gY3VycmVudFBvc0luUzFMaW5lICsgaGVhZExlbmd0aExpbmU7XG5cdFx0XHRcdFx0aGVhZEVuZEluUzFDb2wgPSBoZWFkTGVuZ3RoQ29sICsgMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCByMkVuZElzQmVmb3JlSGVhZEVuZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAocjJFbmQubGluZU51bWJlciA8IGhlYWRFbmRJblMxTGluZSkge1xuXHRcdFx0XHRcdHIyRW5kSXNCZWZvcmVIZWFkRW5kID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChyMkVuZC5saW5lTnVtYmVyID09PSBoZWFkRW5kSW5TMUxpbmUpIHtcblx0XHRcdFx0XHRyMkVuZElzQmVmb3JlSGVhZEVuZCA9IHIyRW5kLmNvbHVtbiA8IGhlYWRFbmRJblMxQ29sO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHIyRW5kSXNCZWZvcmVIZWFkRW5kKSB7XG5cdFx0XHRcdFx0bGV0IHNwbGl0TGVuTGluZTogbnVtYmVyLCBzcGxpdExlbkNvbDogbnVtYmVyO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50UG9zSW5TMUxpbmUgPT09IHIyRW5kLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHNwbGl0TGVuTGluZSA9IDA7XG5cdFx0XHRcdFx0XHRzcGxpdExlbkNvbCA9IHIyRW5kLmNvbHVtbiAtIGN1cnJlbnRQb3NJblMxQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzcGxpdExlbkxpbmUgPSByMkVuZC5saW5lTnVtYmVyIC0gY3VycmVudFBvc0luUzFMaW5lO1xuXHRcdFx0XHRcdFx0c3BsaXRMZW5Db2wgPSByMkVuZC5jb2x1bW4gLSAxO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCByZW1haW5pbmdMZW5MaW5lOiBudW1iZXIsIHJlbWFpbmluZ0xlbkNvbDogbnVtYmVyO1xuXHRcdFx0XHRcdGlmIChzcGxpdExlbkxpbmUgPT09IGhlYWRMZW5ndGhMaW5lKSB7XG5cdFx0XHRcdFx0XHRyZW1haW5pbmdMZW5MaW5lID0gMDtcblx0XHRcdFx0XHRcdHJlbWFpbmluZ0xlbkNvbCA9IGhlYWRMZW5ndGhDb2wgLSBzcGxpdExlbkNvbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVtYWluaW5nTGVuTGluZSA9IGhlYWRMZW5ndGhMaW5lIC0gc3BsaXRMZW5MaW5lO1xuXHRcdFx0XHRcdFx0cmVtYWluaW5nTGVuQ29sID0gaGVhZExlbmd0aENvbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaGVhZFRleHQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdGlmIChjb25zdW1lZFN0YXJ0UzBMaW5lID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN1bWVkU3RhcnRTMExpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdFx0XHRcdGNvbnN1bWVkU3RhcnRTMENvbCA9IGhlYWRTcmNSYW5nZVN0YXJ0Q29sO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3VtZWRFbmRTMExpbmUgPSBoZWFkU3JjUmFuZ2VFbmRMaW5lO1xuXHRcdFx0XHRcdFx0Y29uc3VtZWRFbmRTMENvbCA9IGhlYWRTcmNSYW5nZUVuZENvbDtcblxuXHRcdFx0XHRcdFx0Y29uc3QgWywgdDJdID0gc3BsaXRUZXh0KGhlYWRUZXh0LCBzcGxpdExlbkxpbmUsIHNwbGl0TGVuQ29sKTtcblx0XHRcdFx0XHRcdGhlYWRUZXh0ID0gdDI7XG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoTGluZSA9IHJlbWFpbmluZ0xlbkxpbmU7XG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoQ29sID0gcmVtYWluaW5nTGVuQ29sO1xuXG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydExpbmUgPSBoZWFkU3JjUmFuZ2VFbmRMaW5lO1xuXHRcdFx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRDb2wgPSBoZWFkU3JjUmFuZ2VFbmRDb2w7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxldCBzcGxpdFBvc0xpbmU6IG51bWJlciwgc3BsaXRQb3NDb2w6IG51bWJlcjtcblx0XHRcdFx0XHRcdGlmIChzcGxpdExlbkxpbmUgPT09IDApIHtcblx0XHRcdFx0XHRcdFx0c3BsaXRQb3NMaW5lID0gaGVhZFNyY1JhbmdlU3RhcnRMaW5lO1xuXHRcdFx0XHRcdFx0XHRzcGxpdFBvc0NvbCA9IGhlYWRTcmNSYW5nZVN0YXJ0Q29sICsgc3BsaXRMZW5Db2w7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzcGxpdFBvc0xpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmUgKyBzcGxpdExlbkxpbmU7XG5cdFx0XHRcdFx0XHRcdHNwbGl0UG9zQ29sID0gc3BsaXRMZW5Db2wgKyAxO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoY29uc3VtZWRTdGFydFMwTGluZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdW1lZFN0YXJ0UzBMaW5lID0gaGVhZFNyY1JhbmdlU3RhcnRMaW5lO1xuXHRcdFx0XHRcdFx0XHRjb25zdW1lZFN0YXJ0UzBDb2wgPSBoZWFkU3JjUmFuZ2VTdGFydENvbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN1bWVkRW5kUzBMaW5lID0gc3BsaXRQb3NMaW5lO1xuXHRcdFx0XHRcdFx0Y29uc3VtZWRFbmRTMENvbCA9IHNwbGl0UG9zQ29sO1xuXG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydExpbmUgPSBzcGxpdFBvc0xpbmU7XG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCA9IHNwbGl0UG9zQ29sO1xuXG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoTGluZSA9IHJlbWFpbmluZ0xlbkxpbmU7XG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoQ29sID0gcmVtYWluaW5nTGVuQ29sO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjdXJyZW50UG9zSW5TMUxpbmUgPSByMkVuZC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGN1cnJlbnRQb3NJblMxQ29sID0gcjJFbmQuY29sdW1uO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvbnN1bWVkU3RhcnRTMExpbmUgPT09IG51bGwpIHtcblx0XHRcdFx0XHRjb25zdW1lZFN0YXJ0UzBMaW5lID0gaGVhZFNyY1JhbmdlU3RhcnRMaW5lO1xuXHRcdFx0XHRcdGNvbnN1bWVkU3RhcnRTMENvbCA9IGhlYWRTcmNSYW5nZVN0YXJ0Q29sO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN1bWVkRW5kUzBMaW5lID0gaGVhZFNyY1JhbmdlRW5kTGluZTtcblx0XHRcdFx0Y29uc3VtZWRFbmRTMENvbCA9IGhlYWRTcmNSYW5nZUVuZENvbDtcblxuXHRcdFx0XHRjdXJyZW50UG9zSW5TMUxpbmUgPSBoZWFkRW5kSW5TMUxpbmU7XG5cdFx0XHRcdGN1cnJlbnRQb3NJblMxQ29sID0gaGVhZEVuZEluUzFDb2w7XG5cdFx0XHRcdGhlYWRIYXNWYWx1ZSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29uc3VtZWRTdGFydFMwTGluZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRyZXN1bHRSZXBsYWNlbWVudHMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KG5ldyBSYW5nZShjb25zdW1lZFN0YXJ0UzBMaW5lLCBjb25zdW1lZFN0YXJ0UzBDb2whLCBjb25zdW1lZEVuZFMwTGluZSEsIGNvbnN1bWVkRW5kUzBDb2whKSwgcjIudGV4dCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW5zdXJlSGVhZCgpO1xuXHRcdFx0XHRjb25zdCBpbnNlcnRQb3NTMExpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdGNvbnN0IGluc2VydFBvc1MwQ29sID0gaGVhZFNyY1JhbmdlU3RhcnRDb2w7XG5cdFx0XHRcdHJlc3VsdFJlcGxhY2VtZW50cy5wdXNoKG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3IFJhbmdlKGluc2VydFBvc1MwTGluZSwgaW5zZXJ0UG9zUzBDb2wsIGluc2VydFBvc1MwTGluZSwgaW5zZXJ0UG9zUzBDb2wpLCByMi50ZXh0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGVuc3VyZUhlYWQoKTtcblx0XHRcdGlmIChoZWFkSXNJbmZpbml0ZSkgeyBicmVhazsgfVxuXHRcdFx0aWYgKGhlYWRUZXh0ICE9PSBudWxsKSB7XG5cdFx0XHRcdHJlc3VsdFJlcGxhY2VtZW50cy5wdXNoKG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3IFJhbmdlKGhlYWRTcmNSYW5nZVN0YXJ0TGluZSwgaGVhZFNyY1JhbmdlU3RhcnRDb2wsIGhlYWRTcmNSYW5nZUVuZExpbmUsIGhlYWRTcmNSYW5nZUVuZENvbCksIGhlYWRUZXh0KSk7XG5cdFx0XHR9XG5cdFx0XHRoZWFkSGFzVmFsdWUgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KHJlc3VsdFJlcGxhY2VtZW50cykubm9ybWFsaXplKCk7XG5cdH1cblxuXHR0b1N0cmluZyh0ZXh0OiBBYnN0cmFjdFRleHQgfCBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICh0ZXh0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5tYXAoZWRpdCA9PiBlZGl0LnRvU3RyaW5nKCkpLmpvaW4oJ1xcbicpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLnRvU3RyaW5nKG5ldyBTdHJpbmdUZXh0KHRleHQpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5yZXBsYWNlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZW1lbnRzLm1hcChyID0+IHtcblx0XHRcdGNvbnN0IG1heExlbmd0aCA9IDEwO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxUZXh0ID0gdGV4dC5nZXRWYWx1ZU9mUmFuZ2Uoci5yYW5nZSk7XG5cblx0XHRcdC8vIEdldCB0ZXh0IGJlZm9yZSB0aGUgZWRpdFxuXHRcdFx0Y29uc3QgYmVmb3JlUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0XHRuZXcgUG9zaXRpb24oTWF0aC5tYXgoMSwgci5yYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxKSwgMSksXG5cdFx0XHRcdHIucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpXG5cdFx0XHQpO1xuXHRcdFx0bGV0IGJlZm9yZVRleHQgPSB0ZXh0LmdldFZhbHVlT2ZSYW5nZShiZWZvcmVSYW5nZSk7XG5cdFx0XHRpZiAoYmVmb3JlVGV4dC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcblx0XHRcdFx0YmVmb3JlVGV4dCA9ICcuLi4nICsgYmVmb3JlVGV4dC5zdWJzdHJpbmcoYmVmb3JlVGV4dC5sZW5ndGggLSBtYXhMZW5ndGgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBHZXQgdGV4dCBhZnRlciB0aGUgZWRpdFxuXHRcdFx0Y29uc3QgYWZ0ZXJSYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRcdHIucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSxcblx0XHRcdFx0bmV3IFBvc2l0aW9uKHIucmFuZ2UuZW5kTGluZU51bWJlciArIDEsIDEpXG5cdFx0XHQpO1xuXHRcdFx0bGV0IGFmdGVyVGV4dCA9IHRleHQuZ2V0VmFsdWVPZlJhbmdlKGFmdGVyUmFuZ2UpO1xuXHRcdFx0aWYgKGFmdGVyVGV4dC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcblx0XHRcdFx0YWZ0ZXJUZXh0ID0gYWZ0ZXJUZXh0LnN1YnN0cmluZygwLCBtYXhMZW5ndGgpICsgJy4uLic7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvcm1hdCB0aGUgcmVwbGFjZWQgdGV4dFxuXHRcdFx0bGV0IHJlcGxhY2VkVGV4dCA9IG9yaWdpbmFsVGV4dDtcblx0XHRcdGlmIChyZXBsYWNlZFRleHQubGVuZ3RoID4gbWF4TGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGhhbGZNYXggPSBNYXRoLmZsb29yKG1heExlbmd0aCAvIDIpO1xuXHRcdFx0XHRyZXBsYWNlZFRleHQgPSByZXBsYWNlZFRleHQuc3Vic3RyaW5nKDAsIGhhbGZNYXgpICsgJy4uLicgK1xuXHRcdFx0XHRcdHJlcGxhY2VkVGV4dC5zdWJzdHJpbmcocmVwbGFjZWRUZXh0Lmxlbmd0aCAtIGhhbGZNYXgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3JtYXQgdGhlIG5ldyB0ZXh0XG5cdFx0XHRsZXQgbmV3VGV4dCA9IHIudGV4dDtcblx0XHRcdGlmIChuZXdUZXh0Lmxlbmd0aCA+IG1heExlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBoYWxmTWF4ID0gTWF0aC5mbG9vcihtYXhMZW5ndGggLyAyKTtcblx0XHRcdFx0bmV3VGV4dCA9IG5ld1RleHQuc3Vic3RyaW5nKDAsIGhhbGZNYXgpICsgJy4uLicgK1xuXHRcdFx0XHRcdG5ld1RleHQuc3Vic3RyaW5nKG5ld1RleHQubGVuZ3RoIC0gaGFsZk1heCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXBsYWNlZFRleHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdFx0XHRyZXR1cm4gYCR7YmVmb3JlVGV4dH1cdTI3NzAke25ld1RleHR9XHUyNzcxJHthZnRlclRleHR9YDtcblx0XHRcdH1cblx0XHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdFx0cmV0dXJuIGAke2JlZm9yZVRleHR9XHUyNzcwJHtyZXBsYWNlZFRleHR9XHUyMUE2JHtuZXdUZXh0fVx1Mjc3MSR7YWZ0ZXJUZXh0fWA7XG5cdFx0fSkuam9pbignXFxuJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHRSZXBsYWNlbWVudCBpbXBsZW1lbnRzIElFcXVhdGFibGU8VGV4dFJlcGxhY2VtZW50PiB7XG5cdHB1YmxpYyBzdGF0aWMgam9pblJlcGxhY2VtZW50cyhyZXBsYWNlbWVudHM6IFRleHRSZXBsYWNlbWVudFtdLCBpbml0aWFsVmFsdWU6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudCB7XG5cdFx0aWYgKHJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHsgdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpOyB9XG5cdFx0aWYgKHJlcGxhY2VtZW50cy5sZW5ndGggPT09IDEpIHsgcmV0dXJuIHJlcGxhY2VtZW50c1swXTsgfVxuXG5cdFx0Y29uc3Qgc3RhcnRQb3MgPSByZXBsYWNlbWVudHNbMF0ucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGVuZFBvcyA9IHJlcGxhY2VtZW50c1tyZXBsYWNlbWVudHMubGVuZ3RoIC0gMV0ucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblxuXHRcdGxldCBuZXdUZXh0ID0gJyc7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlcGxhY2VtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VyRWRpdCA9IHJlcGxhY2VtZW50c1tpXTtcblx0XHRcdG5ld1RleHQgKz0gY3VyRWRpdC50ZXh0O1xuXHRcdFx0aWYgKGkgPCByZXBsYWNlbWVudHMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRjb25zdCBuZXh0RWRpdCA9IHJlcGxhY2VtZW50c1tpICsgMV07XG5cdFx0XHRcdGNvbnN0IGdhcFJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhjdXJFZGl0LnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIG5leHRFZGl0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdGNvbnN0IGdhcFRleHQgPSBpbml0aWFsVmFsdWUuZ2V0VmFsdWVPZlJhbmdlKGdhcFJhbmdlKTtcblx0XHRcdFx0bmV3VGV4dCArPSBnYXBUZXh0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXJ0UG9zLCBlbmRQb3MpLCBuZXdUZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbVN0cmluZ1JlcGxhY2VtZW50KHJlcGxhY2VtZW50OiBTdHJpbmdSZXBsYWNlbWVudCwgaW5pdGlhbFN0YXRlOiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KGluaXRpYWxTdGF0ZS5nZXRUcmFuc2Zvcm1lcigpLmdldFJhbmdlKHJlcGxhY2VtZW50LnJlcGxhY2VSYW5nZSksIHJlcGxhY2VtZW50Lm5ld1RleHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWxldGUocmFuZ2U6IFJhbmdlKTogVGV4dFJlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgJycpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJhbmdlOiBSYW5nZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdGV4dDogc3RyaW5nLFxuXHQpIHtcblx0fVxuXG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJhbmdlLmlzRW1wdHkoKSAmJiB0aGlzLnRleHQubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0c3RhdGljIGVxdWFscyhmaXJzdDogVGV4dFJlcGxhY2VtZW50LCBzZWNvbmQ6IFRleHRSZXBsYWNlbWVudCkge1xuXHRcdHJldHVybiBmaXJzdC5yYW5nZS5lcXVhbHNSYW5nZShzZWNvbmQucmFuZ2UpICYmIGZpcnN0LnRleHQgPT09IHNlY29uZC50ZXh0O1xuXHR9XG5cblx0cHVibGljIHRvU2luZ2xlRWRpdE9wZXJhdGlvbigpOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiB0aGlzLnJhbmdlLFxuXHRcdFx0dGV4dDogdGhpcy50ZXh0LFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgdG9FZGl0KCk6IFRleHRFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KFt0aGlzXSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBUZXh0UmVwbGFjZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gVGV4dFJlcGxhY2VtZW50LmVxdWFscyh0aGlzLCBvdGhlcik7XG5cdH1cblxuXHRwdWJsaWMgZXh0ZW5kVG9Db3ZlclJhbmdlKHJhbmdlOiBSYW5nZSwgaW5pdGlhbFZhbHVlOiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdGlmICh0aGlzLnJhbmdlLmNvbnRhaW5zUmFuZ2UocmFuZ2UpKSB7IHJldHVybiB0aGlzOyB9XG5cblx0XHRjb25zdCBuZXdSYW5nZSA9IHRoaXMucmFuZ2UucGx1c1JhbmdlKHJhbmdlKTtcblx0XHRjb25zdCB0ZXh0QmVmb3JlID0gaW5pdGlhbFZhbHVlLmdldFZhbHVlT2ZSYW5nZShSYW5nZS5mcm9tUG9zaXRpb25zKG5ld1JhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgdGhpcy5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpKTtcblx0XHRjb25zdCB0ZXh0QWZ0ZXIgPSBpbml0aWFsVmFsdWUuZ2V0VmFsdWVPZlJhbmdlKFJhbmdlLmZyb21Qb3NpdGlvbnModGhpcy5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBuZXdSYW5nZS5nZXRFbmRQb3NpdGlvbigpKSk7XG5cdFx0Y29uc3QgbmV3VGV4dCA9IHRleHRCZWZvcmUgKyB0aGlzLnRleHQgKyB0ZXh0QWZ0ZXI7XG5cdFx0cmV0dXJuIG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3UmFuZ2UsIG5ld1RleHQpO1xuXHR9XG5cblx0cHVibGljIGV4dGVuZFRvRnVsbExpbmUoaW5pdGlhbFZhbHVlOiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdGNvbnN0IG5ld1JhbmdlID0gbmV3IFJhbmdlKFxuXHRcdFx0dGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHQxLFxuXHRcdFx0dGhpcy5yYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0aW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkuZ2V0TGluZUxlbmd0aCh0aGlzLnJhbmdlLmVuZExpbmVOdW1iZXIpICsgMVxuXHRcdCk7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5kVG9Db3ZlclJhbmdlKG5ld1JhbmdlLCBpbml0aWFsVmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbW1vblByZWZpeEFuZFN1ZmZpeCh0ZXh0OiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdGNvbnN0IHByZWZpeCA9IHRoaXMucmVtb3ZlQ29tbW9uUHJlZml4KHRleHQpO1xuXHRcdGNvbnN0IHN1ZmZpeCA9IHByZWZpeC5yZW1vdmVDb21tb25TdWZmaXgodGV4dCk7XG5cdFx0cmV0dXJuIHN1ZmZpeDtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb21tb25QcmVmaXgodGV4dDogQWJzdHJhY3RUZXh0KTogVGV4dFJlcGxhY2VtZW50IHtcblx0XHRjb25zdCBub3JtYWxpemVkT3JpZ2luYWxUZXh0ID0gdGV4dC5nZXRWYWx1ZU9mUmFuZ2UodGhpcy5yYW5nZSkucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRNb2RpZmllZFRleHQgPSB0aGlzLnRleHQucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpO1xuXG5cdFx0Y29uc3QgY29tbW9uUHJlZml4TGVuID0gY29tbW9uUHJlZml4TGVuZ3RoKG5vcm1hbGl6ZWRPcmlnaW5hbFRleHQsIG5vcm1hbGl6ZWRNb2RpZmllZFRleHQpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gVGV4dExlbmd0aC5vZlRleHQobm9ybWFsaXplZE9yaWdpbmFsVGV4dC5zdWJzdHJpbmcoMCwgY29tbW9uUHJlZml4TGVuKSlcblx0XHRcdC5hZGRUb1Bvc2l0aW9uKHRoaXMucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblxuXHRcdGNvbnN0IG5ld1RleHQgPSBub3JtYWxpemVkTW9kaWZpZWRUZXh0LnN1YnN0cmluZyhjb21tb25QcmVmaXhMZW4pO1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydCwgdGhpcy5yYW5nZS5nZXRFbmRQb3NpdGlvbigpKTtcblx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgbmV3VGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQ29tbW9uU3VmZml4KHRleHQ6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudCB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZE9yaWdpbmFsVGV4dCA9IHRleHQuZ2V0VmFsdWVPZlJhbmdlKHRoaXMucmFuZ2UpLnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXG4nKTtcblx0XHRjb25zdCBub3JtYWxpemVkTW9kaWZpZWRUZXh0ID0gdGhpcy50ZXh0LnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXG4nKTtcblxuXHRcdGNvbnN0IGNvbW1vblN1ZmZpeExlbiA9IGNvbW1vblN1ZmZpeExlbmd0aChub3JtYWxpemVkT3JpZ2luYWxUZXh0LCBub3JtYWxpemVkTW9kaWZpZWRUZXh0KTtcblx0XHRjb25zdCBlbmQgPSBUZXh0TGVuZ3RoLm9mVGV4dChub3JtYWxpemVkT3JpZ2luYWxUZXh0LnN1YnN0cmluZygwLCBub3JtYWxpemVkT3JpZ2luYWxUZXh0Lmxlbmd0aCAtIGNvbW1vblN1ZmZpeExlbikpXG5cdFx0XHQuYWRkVG9Qb3NpdGlvbih0aGlzLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cblx0XHRjb25zdCBuZXdUZXh0ID0gbm9ybWFsaXplZE1vZGlmaWVkVGV4dC5zdWJzdHJpbmcoMCwgbm9ybWFsaXplZE1vZGlmaWVkVGV4dC5sZW5ndGggLSBjb21tb25TdWZmaXhMZW4pO1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyh0aGlzLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgZW5kKTtcblx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgbmV3VGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgaXNFZmZlY3RpdmVEZWxldGlvbih0ZXh0OiBBYnN0cmFjdFRleHQpOiBib29sZWFuIHtcblx0XHRsZXQgbmV3VGV4dCA9IHRoaXMudGV4dC5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJyk7XG5cdFx0bGV0IGV4aXN0aW5nVGV4dCA9IHRleHQuZ2V0VmFsdWVPZlJhbmdlKHRoaXMucmFuZ2UpLnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXG4nKTtcblx0XHRjb25zdCBsID0gY29tbW9uUHJlZml4TGVuZ3RoKG5ld1RleHQsIGV4aXN0aW5nVGV4dCk7XG5cdFx0bmV3VGV4dCA9IG5ld1RleHQuc3Vic3RyaW5nKGwpO1xuXHRcdGV4aXN0aW5nVGV4dCA9IGV4aXN0aW5nVGV4dC5zdWJzdHJpbmcobCk7XG5cdFx0Y29uc3QgciA9IGNvbW1vblN1ZmZpeExlbmd0aChuZXdUZXh0LCBleGlzdGluZ1RleHQpO1xuXHRcdG5ld1RleHQgPSBuZXdUZXh0LnN1YnN0cmluZygwLCBuZXdUZXh0Lmxlbmd0aCAtIHIpO1xuXHRcdGV4aXN0aW5nVGV4dCA9IGV4aXN0aW5nVGV4dC5zdWJzdHJpbmcoMCwgZXhpc3RpbmdUZXh0Lmxlbmd0aCAtIHIpO1xuXG5cdFx0cmV0dXJuIG5ld1RleHQgPT09ICcnO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRjb25zdCBlbmQgPSB0aGlzLnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0cmV0dXJuIGAoJHtzdGFydC5saW5lTnVtYmVyfSwke3N0YXJ0LmNvbHVtbn0gLT4gJHtlbmQubGluZU51bWJlcn0sJHtlbmQuY29sdW1ufSk6IFwiJHt0aGlzLnRleHR9XCJgO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJhbmdlRnJvbVBvc2l0aW9ucyhzdGFydDogUG9zaXRpb24sIGVuZDogUG9zaXRpb24pOiBSYW5nZSB7XG5cdGlmIChzdGFydC5saW5lTnVtYmVyID09PSBlbmQubGluZU51bWJlciAmJiBzdGFydC5jb2x1bW4gPT09IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG5cdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMoZW5kLCBlbmQpO1xuXHR9IGVsc2UgaWYgKCFzdGFydC5pc0JlZm9yZU9yRXF1YWwoZW5kKSkge1xuXHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ3N0YXJ0IG11c3QgYmUgYmVmb3JlIGVuZCcpO1xuXHR9XG5cdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQubGluZU51bWJlciwgc3RhcnQuY29sdW1uLCBlbmQubGluZU51bWJlciwgZW5kLmNvbHVtbik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVcsY0FBYztBQUNsQyxTQUFTLFVBQVUsMEJBQTBCO0FBQzdDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CLDBCQUEwQjtBQUd2RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBdUIsa0JBQWtCO0FBR2xDLE1BQU0sU0FBUztBQUFBLEVBdUJyQixZQUNpQixjQUNmO0FBRGU7QUFFaEIsYUFBUyxNQUFNLG1CQUFtQixjQUFjLENBQUMsR0FBRyxNQUFNLEVBQUUsTUFBTSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNoSTtBQUFBLEVBMUJBLE9BQWMsZUFBZSxNQUFzQixjQUFzQztBQUN4RixVQUFNLFFBQVEsS0FBSyxhQUFhLElBQUksT0FBSyxnQkFBZ0Isc0JBQXNCLEdBQUcsWUFBWSxDQUFDO0FBQy9GLFdBQU8sSUFBSSxTQUFTLEtBQUs7QUFBQSxFQUMxQjtBQUFBLEVBRUEsT0FBYyxRQUFRLGVBQXNCLFNBQTJCO0FBQ3RF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
