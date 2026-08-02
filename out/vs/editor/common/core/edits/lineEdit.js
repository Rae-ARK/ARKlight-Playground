import { compareBy, groupAdjacentBy, numberComparator } from "../../../../base/common/arrays.js";
import { assert, checkAdjacentItems } from "../../../../base/common/assert.js";
import { splitLines } from "../../../../base/common/strings.js";
import { LineRange } from "../ranges/lineRange.js";
import { StringEdit, StringReplacement } from "./stringEdit.js";
import { Position } from "../position.js";
import { Range } from "../range.js";
import { TextReplacement, TextEdit } from "./textEdit.js";
const _LineEdit = class _LineEdit {
  constructor(replacements) {
    this.replacements = replacements;
    assert(checkAdjacentItems(replacements, (i1, i2) => i1.lineRange.endLineNumberExclusive <= i2.lineRange.startLineNumber));
  }
  static deserialize(data) {
    return new _LineEdit(data.map((e) => LineReplacement.deserialize(e)));
  }
  static fromStringEdit(edit, initialValue) {
    const textEdit = TextEdit.fromStringEdit(edit, initialValue);
    return _LineEdit.fromTextEdit(textEdit, initialValue);
  }
  static fromTextEdit(edit, initialValue) {
    const edits = edit.replacements;
    const result = [];
    const currentEdits = [];
    for (let i = 0; i < edits.length; i++) {
      const edit2 = edits[i];
      const nextEditRange = i + 1 < edits.length ? edits[i + 1] : void 0;
      currentEdits.push(edit2);
      if (nextEditRange && nextEditRange.range.startLineNumber === edit2.range.endLineNumber) {
        continue;
      }
      const singleEdit = TextReplacement.joinReplacements(currentEdits, initialValue);
      currentEdits.length = 0;
      const singleLineEdit = LineReplacement.fromSingleTextEdit(singleEdit, initialValue);
      result.push(singleLineEdit);
    }
    return new _LineEdit(result);
  }
  static createFromUnsorted(edits) {
    const result = edits.slice();
    result.sort(compareBy((i) => i.lineRange.startLineNumber, numberComparator));
    return new _LineEdit(result);
  }
  isEmpty() {
    return this.replacements.length === 0;
  }
  toEdit(initialValue) {
    const edits = [];
    for (const edit of this.replacements) {
      const singleEdit = edit.toSingleEdit(initialValue);
      edits.push(singleEdit);
    }
    return new StringEdit(edits);
  }
  toString() {
    return this.replacements.map((e) => e.toString()).join(",");
  }
  serialize() {
    return this.replacements.map((e) => e.serialize());
  }
  getNewLineRanges() {
    const ranges = [];
    let offset = 0;
    for (const e of this.replacements) {
      ranges.push(LineRange.ofLength(e.lineRange.startLineNumber + offset, e.newLines.length));
      offset += e.newLines.length - e.lineRange.length;
    }
    return ranges;
  }
  mapLineNumber(lineNumber) {
    let lineDelta = 0;
    for (const e of this.replacements) {
      if (e.lineRange.endLineNumberExclusive > lineNumber) {
        break;
      }
      lineDelta += e.newLines.length - e.lineRange.length;
    }
    return lineNumber + lineDelta;
  }
  mapLineRange(lineRange) {
    return new LineRange(
      this.mapLineNumber(lineRange.startLineNumber),
      this.mapLineNumber(lineRange.endLineNumberExclusive)
    );
  }
  /** TODO improve, dont require originalLines */
  mapBackLineRange(lineRange, originalLines) {
    const i = this.inverse(originalLines);
    return i.mapLineRange(lineRange);
  }
  touches(other) {
    return this.replacements.some((e1) => other.replacements.some((e2) => e1.lineRange.intersect(e2.lineRange)));
  }
  rebase(base) {
    return new _LineEdit(
      this.replacements.map((e) => new LineReplacement(base.mapLineRange(e.lineRange), e.newLines))
    );
  }
  humanReadablePatch(originalLines) {
    const result = [];
    function pushLine(originalLineNumber, modifiedLineNumber, kind, content) {
      const specialChar = kind === "unmodified" ? " " : kind === "deleted" ? "-" : "+";
      if (content === void 0) {
        content = "[[[[[ WARNING: LINE DOES NOT EXIST ]]]]]";
      }
      const origLn = originalLineNumber === -1 ? "   " : originalLineNumber.toString().padStart(3, " ");
      const modLn = modifiedLineNumber === -1 ? "   " : modifiedLineNumber.toString().padStart(3, " ");
      result.push(`${specialChar} ${origLn} ${modLn} ${content}`);
    }
    function pushSeperator() {
      result.push("---");
    }
    let lineDelta = 0;
    let first = true;
    for (const edits of groupAdjacentBy(this.replacements, (e1, e2) => e1.lineRange.distanceToRange(e2.lineRange) <= 5)) {
      if (!first) {
        pushSeperator();
      } else {
        first = false;
      }
      let lastLineNumber = edits[0].lineRange.startLineNumber - 2;
      for (const edit of edits) {
        for (let i = Math.max(1, lastLineNumber); i < edit.lineRange.startLineNumber; i++) {
          pushLine(i, i + lineDelta, "unmodified", originalLines[i - 1]);
        }
        const range = edit.lineRange;
        const newLines = edit.newLines;
        for (const replaceLineNumber of range.mapToLineArray((n) => n)) {
          const line = originalLines[replaceLineNumber - 1];
          pushLine(replaceLineNumber, -1, "deleted", line);
        }
        for (let i = 0; i < newLines.length; i++) {
          const line = newLines[i];
          pushLine(-1, range.startLineNumber + lineDelta + i, "added", line);
        }
        lastLineNumber = range.endLineNumberExclusive;
        lineDelta += edit.newLines.length - edit.lineRange.length;
      }
      for (let i = lastLineNumber; i <= Math.min(lastLineNumber + 2, originalLines.length); i++) {
        pushLine(i, i + lineDelta, "unmodified", originalLines[i - 1]);
      }
    }
    return result.join("\n");
  }
  apply(lines) {
    const result = [];
    let currentLineIndex = 0;
    for (const edit of this.replacements) {
      while (currentLineIndex < edit.lineRange.startLineNumber - 1) {
        result.push(lines[currentLineIndex]);
        currentLineIndex++;
      }
      for (const newLine of edit.newLines) {
        result.push(newLine);
      }
      currentLineIndex = edit.lineRange.endLineNumberExclusive - 1;
    }
    while (currentLineIndex < lines.length) {
      result.push(lines[currentLineIndex]);
      currentLineIndex++;
    }
    return result;
  }
  inverse(originalLines) {
    const newRanges = this.getNewLineRanges();
    return new _LineEdit(this.replacements.map((e, idx) => new LineReplacement(
      newRanges[idx],
      originalLines.slice(e.lineRange.startLineNumber - 1, e.lineRange.endLineNumberExclusive - 1)
    )));
  }
};
_LineEdit.empty = new _LineEdit([]);
let LineEdit = _LineEdit;
class LineReplacement {
  constructor(lineRange, newLines) {
    this.lineRange = lineRange;
    this.newLines = newLines;
  }
  static deserialize(e) {
    return new LineReplacement(
      LineRange.ofLength(e[0], e[1] - e[0]),
      e[2]
    );
  }
  static fromSingleTextEdit(edit, initialValue) {
    const newLines = splitLines(edit.text);
    let startLineNumber = edit.range.startLineNumber;
    const survivingFirstLineText = initialValue.getValueOfRange(Range.fromPositions(
      new Position(edit.range.startLineNumber, 1),
      edit.range.getStartPosition()
    ));
    newLines[0] = survivingFirstLineText + newLines[0];
    let endLineNumberEx = edit.range.endLineNumber + 1;
    const editEndLineNumberMaxColumn = initialValue.getTransformer().getLineLength(edit.range.endLineNumber) + 1;
    const survivingEndLineText = initialValue.getValueOfRange(Range.fromPositions(
      edit.range.getEndPosition(),
      new Position(edit.range.endLineNumber, editEndLineNumberMaxColumn)
    ));
    newLines[newLines.length - 1] = newLines[newLines.length - 1] + survivingEndLineText;
    const startBeforeNewLine = edit.range.startColumn === initialValue.getTransformer().getLineLength(edit.range.startLineNumber) + 1;
    const endAfterNewLine = edit.range.endColumn === 1;
    if (startBeforeNewLine && newLines[0].length === survivingFirstLineText.length) {
      startLineNumber++;
      newLines.shift();
    }
    if (newLines.length > 0 && startLineNumber < endLineNumberEx && endAfterNewLine && newLines[newLines.length - 1].length === survivingEndLineText.length) {
      endLineNumberEx--;
      newLines.pop();
    }
    return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), newLines);
  }
  toSingleTextEdit(initialValue) {
    if (this.newLines.length === 0) {
      const textLen = initialValue.getTransformer().textLength;
      if (this.lineRange.endLineNumberExclusive === textLen.lineCount + 2) {
        let startPos;
        if (this.lineRange.startLineNumber > 1) {
          const startLineNumber = this.lineRange.startLineNumber - 1;
          const startColumn = initialValue.getTransformer().getLineLength(startLineNumber) + 1;
          startPos = new Position(startLineNumber, startColumn);
        } else {
          startPos = new Position(1, 1);
        }
        const lastPosition = textLen.addToPosition(new Position(1, 1));
        return new TextReplacement(Range.fromPositions(startPos, lastPosition), "");
      } else {
        return new TextReplacement(new Range(this.lineRange.startLineNumber, 1, this.lineRange.endLineNumberExclusive, 1), "");
      }
    } else if (this.lineRange.isEmpty) {
      let endLineNumber;
      let column;
      let text;
      const insertionLine = this.lineRange.startLineNumber;
      if (insertionLine === initialValue.getTransformer().textLength.lineCount + 2) {
        endLineNumber = insertionLine - 1;
        column = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
        text = this.newLines.map((l) => "\n" + l).join("");
      } else {
        endLineNumber = insertionLine;
        column = 1;
        text = this.newLines.map((l) => l + "\n").join("");
      }
      return new TextReplacement(Range.fromPositions(new Position(endLineNumber, column)), text);
    } else {
      const endLineNumber = this.lineRange.endLineNumberExclusive - 1;
      const endLineNumberMaxColumn = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
      const range = new Range(
        this.lineRange.startLineNumber,
        1,
        endLineNumber,
        endLineNumberMaxColumn
      );
      const text = this.newLines.join("\n");
      return new TextReplacement(range, text);
    }
  }
  toSingleEdit(initialValue) {
    const textEdit = this.toSingleTextEdit(initialValue);
    const range = initialValue.getTransformer().getOffsetRange(textEdit.range);
    return new StringReplacement(range, textEdit.text);
  }
  toString() {
    return `${this.lineRange}->${JSON.stringify(this.newLines)}`;
  }
  serialize() {
    return [
      this.lineRange.startLineNumber,
      this.lineRange.endLineNumberExclusive,
      this.newLines
    ];
  }
  removeCommonSuffixPrefixLines(initialValue) {
    let startLineNumber = this.lineRange.startLineNumber;
    let endLineNumberEx = this.lineRange.endLineNumberExclusive;
    let trimStartCount = 0;
    while (startLineNumber < endLineNumberEx && trimStartCount < this.newLines.length && this.newLines[trimStartCount] === initialValue.getLineAt(startLineNumber)) {
      startLineNumber++;
      trimStartCount++;
    }
    let trimEndCount = 0;
    while (startLineNumber < endLineNumberEx && trimEndCount + trimStartCount < this.newLines.length && this.newLines[this.newLines.length - 1 - trimEndCount] === initialValue.getLineAt(endLineNumberEx - 1)) {
      endLineNumberEx--;
      trimEndCount++;
    }
    if (trimStartCount === 0 && trimEndCount === 0) {
      return this;
    }
    return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), this.newLines.slice(trimStartCount, this.newLines.length - trimEndCount));
  }
  toLineEdit() {
    return new LineEdit([this]);
  }
}
var SerializedLineReplacement;
((SerializedLineReplacement2) => {
  function is(thing) {
    return Array.isArray(thing) && thing.length === 3 && typeof thing[0] === "number" && typeof thing[1] === "number" && Array.isArray(thing[2]) && thing[2].every((e) => typeof e === "string");
  }
  SerializedLineReplacement2.is = is;
})(SerializedLineReplacement || (SerializedLineReplacement = {}));
export {
  LineEdit,
  LineReplacement,
  SerializedLineReplacement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9saW5lRWRpdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbXBhcmVCeSwgZ3JvdXBBZGphY2VudEJ5LCBudW1iZXJDb21wYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFzc2VydCwgY2hlY2tBZGphY2VudEl0ZW1zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IHNwbGl0TGluZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgQmFzZVN0cmluZ0VkaXQsIFN0cmluZ0VkaXQsIFN0cmluZ1JlcGxhY2VtZW50IH0gZnJvbSAnLi9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0UmVwbGFjZW1lbnQsIFRleHRFZGl0IH0gZnJvbSAnLi90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHQgfSBmcm9tICcuLi90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMaW5lRWRpdCB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZW1wdHkgPSBuZXcgTGluZUVkaXQoW10pO1xuXG5cdHB1YmxpYyBzdGF0aWMgZGVzZXJpYWxpemUoZGF0YTogU2VyaWFsaXplZExpbmVFZGl0KTogTGluZUVkaXQge1xuXHRcdHJldHVybiBuZXcgTGluZUVkaXQoZGF0YS5tYXAoZSA9PiBMaW5lUmVwbGFjZW1lbnQuZGVzZXJpYWxpemUoZSkpKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbVN0cmluZ0VkaXQoZWRpdDogQmFzZVN0cmluZ0VkaXQsIGluaXRpYWxWYWx1ZTogQWJzdHJhY3RUZXh0KTogTGluZUVkaXQge1xuXHRcdGNvbnN0IHRleHRFZGl0ID0gVGV4dEVkaXQuZnJvbVN0cmluZ0VkaXQoZWRpdCwgaW5pdGlhbFZhbHVlKTtcblx0XHRyZXR1cm4gTGluZUVkaXQuZnJvbVRleHRFZGl0KHRleHRFZGl0LCBpbml0aWFsVmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tVGV4dEVkaXQoZWRpdDogVGV4dEVkaXQsIGluaXRpYWxWYWx1ZTogQWJzdHJhY3RUZXh0KTogTGluZUVkaXQge1xuXHRcdGNvbnN0IGVkaXRzID0gZWRpdC5yZXBsYWNlbWVudHM7XG5cblx0XHRjb25zdCByZXN1bHQ6IExpbmVSZXBsYWNlbWVudFtdID0gW107XG5cblx0XHRjb25zdCBjdXJyZW50RWRpdHM6IFRleHRSZXBsYWNlbWVudFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlZGl0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWRpdCA9IGVkaXRzW2ldO1xuXHRcdFx0Y29uc3QgbmV4dEVkaXRSYW5nZSA9IGkgKyAxIDwgZWRpdHMubGVuZ3RoID8gZWRpdHNbaSArIDFdIDogdW5kZWZpbmVkO1xuXHRcdFx0Y3VycmVudEVkaXRzLnB1c2goZWRpdCk7XG5cdFx0XHRpZiAobmV4dEVkaXRSYW5nZSAmJiBuZXh0RWRpdFJhbmdlLnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzaW5nbGVFZGl0ID0gVGV4dFJlcGxhY2VtZW50LmpvaW5SZXBsYWNlbWVudHMoY3VycmVudEVkaXRzLCBpbml0aWFsVmFsdWUpO1xuXHRcdFx0Y3VycmVudEVkaXRzLmxlbmd0aCA9IDA7XG5cblx0XHRcdGNvbnN0IHNpbmdsZUxpbmVFZGl0ID0gTGluZVJlcGxhY2VtZW50LmZyb21TaW5nbGVUZXh0RWRpdChzaW5nbGVFZGl0LCBpbml0aWFsVmFsdWUpO1xuXHRcdFx0cmVzdWx0LnB1c2goc2luZ2xlTGluZUVkaXQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTGluZUVkaXQocmVzdWx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlRnJvbVVuc29ydGVkKGVkaXRzOiByZWFkb25seSBMaW5lUmVwbGFjZW1lbnRbXSk6IExpbmVFZGl0IHtcblx0XHRjb25zdCByZXN1bHQgPSBlZGl0cy5zbGljZSgpO1xuXHRcdHJlc3VsdC5zb3J0KGNvbXBhcmVCeShpID0+IGkubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciwgbnVtYmVyQ29tcGFyYXRvcikpO1xuXHRcdHJldHVybiBuZXcgTGluZUVkaXQocmVzdWx0KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdC8qKlxuXHRcdCAqIEhhdmUgdG8gYmUgc29ydGVkIGJ5IHN0YXJ0IGxpbmUgbnVtYmVyIGFuZCBub24taW50ZXJzZWN0aW5nLlxuXHRcdCovXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcGxhY2VtZW50czogcmVhZG9ubHkgTGluZVJlcGxhY2VtZW50W11cblx0KSB7XG5cdFx0YXNzZXJ0KGNoZWNrQWRqYWNlbnRJdGVtcyhyZXBsYWNlbWVudHMsIChpMSwgaTIpID0+IGkxLmxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIDw9IGkyLmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIpKTtcblx0fVxuXG5cdHB1YmxpYyBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRwdWJsaWMgdG9FZGl0KGluaXRpYWxWYWx1ZTogQWJzdHJhY3RUZXh0KTogU3RyaW5nRWRpdCB7XG5cdFx0Y29uc3QgZWRpdHM6IFN0cmluZ1JlcGxhY2VtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGNvbnN0IHNpbmdsZUVkaXQgPSBlZGl0LnRvU2luZ2xlRWRpdChpbml0aWFsVmFsdWUpO1xuXHRcdFx0ZWRpdHMucHVzaChzaW5nbGVFZGl0KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KGVkaXRzKTtcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5tYXAoZSA9PiBlLnRvU3RyaW5nKCkpLmpvaW4oJywnKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogU2VyaWFsaXplZExpbmVFZGl0IHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsYWNlbWVudHMubWFwKGUgPT4gZS5zZXJpYWxpemUoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TmV3TGluZVJhbmdlcygpOiBMaW5lUmFuZ2VbXSB7XG5cdFx0Y29uc3QgcmFuZ2VzOiBMaW5lUmFuZ2VbXSA9IFtdO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGZvciAoY29uc3QgZSBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0cmFuZ2VzLnB1c2goTGluZVJhbmdlLm9mTGVuZ3RoKGUubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciArIG9mZnNldCwgZS5uZXdMaW5lcy5sZW5ndGgpLCk7XG5cdFx0XHRvZmZzZXQgKz0gZS5uZXdMaW5lcy5sZW5ndGggLSBlLmxpbmVSYW5nZS5sZW5ndGg7XG5cdFx0fVxuXHRcdHJldHVybiByYW5nZXM7XG5cdH1cblxuXHRwdWJsaWMgbWFwTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBsaW5lRGVsdGEgPSAwO1xuXHRcdGZvciAoY29uc3QgZSBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0aWYgKGUubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPiBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRsaW5lRGVsdGEgKz0gZS5uZXdMaW5lcy5sZW5ndGggLSBlLmxpbmVSYW5nZS5sZW5ndGg7XG5cdFx0fVxuXHRcdHJldHVybiBsaW5lTnVtYmVyICsgbGluZURlbHRhO1xuXHR9XG5cblx0cHVibGljIG1hcExpbmVSYW5nZShsaW5lUmFuZ2U6IExpbmVSYW5nZSk6IExpbmVSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBMaW5lUmFuZ2UoXG5cdFx0XHR0aGlzLm1hcExpbmVOdW1iZXIobGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciksXG5cdFx0XHR0aGlzLm1hcExpbmVOdW1iZXIobGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUpLFxuXHRcdCk7XG5cdH1cblxuXG5cdC8qKiBUT0RPIGltcHJvdmUsIGRvbnQgcmVxdWlyZSBvcmlnaW5hbExpbmVzICovXG5cdHB1YmxpYyBtYXBCYWNrTGluZVJhbmdlKGxpbmVSYW5nZTogTGluZVJhbmdlLCBvcmlnaW5hbExpbmVzOiBzdHJpbmdbXSk6IExpbmVSYW5nZSB7XG5cdFx0Y29uc3QgaSA9IHRoaXMuaW52ZXJzZShvcmlnaW5hbExpbmVzKTtcblx0XHRyZXR1cm4gaS5tYXBMaW5lUmFuZ2UobGluZVJhbmdlKTtcblx0fVxuXG5cdHB1YmxpYyB0b3VjaGVzKG90aGVyOiBMaW5lRWRpdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5zb21lKGUxID0+IG90aGVyLnJlcGxhY2VtZW50cy5zb21lKGUyID0+IGUxLmxpbmVSYW5nZS5pbnRlcnNlY3QoZTIubGluZVJhbmdlKSkpO1xuXHR9XG5cblx0cHVibGljIHJlYmFzZShiYXNlOiBMaW5lRWRpdCk6IExpbmVFZGl0IHtcblx0XHRyZXR1cm4gbmV3IExpbmVFZGl0KFxuXHRcdFx0dGhpcy5yZXBsYWNlbWVudHMubWFwKGUgPT4gbmV3IExpbmVSZXBsYWNlbWVudChiYXNlLm1hcExpbmVSYW5nZShlLmxpbmVSYW5nZSksIGUubmV3TGluZXMpKSxcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGh1bWFuUmVhZGFibGVQYXRjaChvcmlnaW5hbExpbmVzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0ZnVuY3Rpb24gcHVzaExpbmUob3JpZ2luYWxMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGlmaWVkTGluZU51bWJlcjogbnVtYmVyLCBraW5kOiAndW5tb2RpZmllZCcgfCAnZGVsZXRlZCcgfCAnYWRkZWQnLCBjb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHNwZWNpYWxDaGFyID0gKGtpbmQgPT09ICd1bm1vZGlmaWVkJyA/ICcgJyA6IChraW5kID09PSAnZGVsZXRlZCcgPyAnLScgOiAnKycpKTtcblxuXHRcdFx0aWYgKGNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250ZW50ID0gJ1tbW1tbIFdBUk5JTkc6IExJTkUgRE9FUyBOT1QgRVhJU1QgXV1dXV0nO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcmlnTG4gPSBvcmlnaW5hbExpbmVOdW1iZXIgPT09IC0xID8gJyAgICcgOiBvcmlnaW5hbExpbmVOdW1iZXIudG9TdHJpbmcoKS5wYWRTdGFydCgzLCAnICcpO1xuXHRcdFx0Y29uc3QgbW9kTG4gPSBtb2RpZmllZExpbmVOdW1iZXIgPT09IC0xID8gJyAgICcgOiBtb2RpZmllZExpbmVOdW1iZXIudG9TdHJpbmcoKS5wYWRTdGFydCgzLCAnICcpO1xuXG5cdFx0XHRyZXN1bHQucHVzaChgJHtzcGVjaWFsQ2hhcn0gJHtvcmlnTG59ICR7bW9kTG59ICR7Y29udGVudH1gKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBwdXNoU2VwZXJhdG9yKCkge1xuXHRcdFx0cmVzdWx0LnB1c2goJy0tLScpO1xuXHRcdH1cblxuXHRcdGxldCBsaW5lRGVsdGEgPSAwO1xuXHRcdGxldCBmaXJzdCA9IHRydWU7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRzIG9mIGdyb3VwQWRqYWNlbnRCeSh0aGlzLnJlcGxhY2VtZW50cywgKGUxLCBlMikgPT4gZTEubGluZVJhbmdlLmRpc3RhbmNlVG9SYW5nZShlMi5saW5lUmFuZ2UpIDw9IDUpKSB7XG5cdFx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRcdHB1c2hTZXBlcmF0b3IoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZpcnN0ID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBsYXN0TGluZU51bWJlciA9IGVkaXRzWzBdLmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIgLSAyO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IE1hdGgubWF4KDEsIGxhc3RMaW5lTnVtYmVyKTsgaSA8IGVkaXQubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaSsrKSB7XG5cdFx0XHRcdFx0cHVzaExpbmUoaSwgaSArIGxpbmVEZWx0YSwgJ3VubW9kaWZpZWQnLCBvcmlnaW5hbExpbmVzW2kgLSAxXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGVkaXQubGluZVJhbmdlO1xuXHRcdFx0XHRjb25zdCBuZXdMaW5lcyA9IGVkaXQubmV3TGluZXM7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVwbGFjZUxpbmVOdW1iZXIgb2YgcmFuZ2UubWFwVG9MaW5lQXJyYXkobiA9PiBuKSkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmUgPSBvcmlnaW5hbExpbmVzW3JlcGxhY2VMaW5lTnVtYmVyIC0gMV07XG5cdFx0XHRcdFx0cHVzaExpbmUocmVwbGFjZUxpbmVOdW1iZXIsIC0xLCAnZGVsZXRlZCcsIGxpbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbmV3TGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lID0gbmV3TGluZXNbaV07XG5cdFx0XHRcdFx0cHVzaExpbmUoLTEsIHJhbmdlLnN0YXJ0TGluZU51bWJlciArIGxpbmVEZWx0YSArIGksICdhZGRlZCcsIGxpbmUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGFzdExpbmVOdW1iZXIgPSByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXG5cdFx0XHRcdGxpbmVEZWx0YSArPSBlZGl0Lm5ld0xpbmVzLmxlbmd0aCAtIGVkaXQubGluZVJhbmdlLmxlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaSA9IGxhc3RMaW5lTnVtYmVyOyBpIDw9IE1hdGgubWluKGxhc3RMaW5lTnVtYmVyICsgMiwgb3JpZ2luYWxMaW5lcy5sZW5ndGgpOyBpKyspIHtcblx0XHRcdFx0cHVzaExpbmUoaSwgaSArIGxpbmVEZWx0YSwgJ3VubW9kaWZpZWQnLCBvcmlnaW5hbExpbmVzW2kgLSAxXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseShsaW5lczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0bGV0IGN1cnJlbnRMaW5lSW5kZXggPSAwO1xuXG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHR3aGlsZSAoY3VycmVudExpbmVJbmRleCA8IGVkaXQubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobGluZXNbY3VycmVudExpbmVJbmRleF0pO1xuXHRcdFx0XHRjdXJyZW50TGluZUluZGV4Kys7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgbmV3TGluZSBvZiBlZGl0Lm5ld0xpbmVzKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5ld0xpbmUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjdXJyZW50TGluZUluZGV4ID0gZWRpdC5saW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDE7XG5cdFx0fVxuXG5cdFx0d2hpbGUgKGN1cnJlbnRMaW5lSW5kZXggPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGxpbmVzW2N1cnJlbnRMaW5lSW5kZXhdKTtcblx0XHRcdGN1cnJlbnRMaW5lSW5kZXgrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGludmVyc2Uob3JpZ2luYWxMaW5lczogc3RyaW5nW10pOiBMaW5lRWRpdCB7XG5cdFx0Y29uc3QgbmV3UmFuZ2VzID0gdGhpcy5nZXROZXdMaW5lUmFuZ2VzKCk7XG5cdFx0cmV0dXJuIG5ldyBMaW5lRWRpdCh0aGlzLnJlcGxhY2VtZW50cy5tYXAoKGUsIGlkeCkgPT4gbmV3IExpbmVSZXBsYWNlbWVudChcblx0XHRcdG5ld1Jhbmdlc1tpZHhdLFxuXHRcdFx0b3JpZ2luYWxMaW5lcy5zbGljZShlLmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxLCBlLmxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSksXG5cdFx0KSkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5lUmVwbGFjZW1lbnQge1xuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplKGU6IFNlcmlhbGl6ZWRMaW5lUmVwbGFjZW1lbnQpOiBMaW5lUmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiBuZXcgTGluZVJlcGxhY2VtZW50KFxuXHRcdFx0TGluZVJhbmdlLm9mTGVuZ3RoKGVbMF0sIGVbMV0gLSBlWzBdKSxcblx0XHRcdGVbMl0sXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbVNpbmdsZVRleHRFZGl0KGVkaXQ6IFRleHRSZXBsYWNlbWVudCwgaW5pdGlhbFZhbHVlOiBBYnN0cmFjdFRleHQpOiBMaW5lUmVwbGFjZW1lbnQge1xuXHRcdC8vIDE6IGFiW2NkZVxuXHRcdC8vIDI6IGZnaGlqa1xuXHRcdC8vIDM6IGxtbl1vcHFcblxuXHRcdC8vIHJlcGxhY2VkIHdpdGhcblxuXHRcdC8vIDFuOiAxMjNcblx0XHQvLyAybjogNDU2XG5cdFx0Ly8gM246IDc4OVxuXG5cdFx0Ly8gc2ltcGxlIHNvbHV0aW9uOiByZXBsYWNlIFsxLi40KSB3aXRoIFsxbi4uNG4pXG5cblx0XHRjb25zdCBuZXdMaW5lcyA9IHNwbGl0TGluZXMoZWRpdC50ZXh0KTtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gZWRpdC5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc3Vydml2aW5nRmlyc3RMaW5lVGV4dCA9IGluaXRpYWxWYWx1ZS5nZXRWYWx1ZU9mUmFuZ2UoUmFuZ2UuZnJvbVBvc2l0aW9ucyhcblx0XHRcdG5ldyBQb3NpdGlvbihlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSksXG5cdFx0XHRlZGl0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKVxuXHRcdCkpO1xuXHRcdG5ld0xpbmVzWzBdID0gc3Vydml2aW5nRmlyc3RMaW5lVGV4dCArIG5ld0xpbmVzWzBdO1xuXG5cdFx0bGV0IGVuZExpbmVOdW1iZXJFeCA9IGVkaXQucmFuZ2UuZW5kTGluZU51bWJlciArIDE7XG5cdFx0Y29uc3QgZWRpdEVuZExpbmVOdW1iZXJNYXhDb2x1bW4gPSBpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS5nZXRMaW5lTGVuZ3RoKGVkaXQucmFuZ2UuZW5kTGluZU51bWJlcikgKyAxO1xuXHRcdGNvbnN0IHN1cnZpdmluZ0VuZExpbmVUZXh0ID0gaW5pdGlhbFZhbHVlLmdldFZhbHVlT2ZSYW5nZShSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0ZWRpdC5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLFxuXHRcdFx0bmV3IFBvc2l0aW9uKGVkaXQucmFuZ2UuZW5kTGluZU51bWJlciwgZWRpdEVuZExpbmVOdW1iZXJNYXhDb2x1bW4pXG5cdFx0KSk7XG5cdFx0bmV3TGluZXNbbmV3TGluZXMubGVuZ3RoIC0gMV0gPSBuZXdMaW5lc1tuZXdMaW5lcy5sZW5ndGggLSAxXSArIHN1cnZpdmluZ0VuZExpbmVUZXh0O1xuXG5cdFx0Ly8gUmVwbGFjaW5nIFtzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJFeCkgd2l0aCBuZXdMaW5lcyB3b3VsZCBiZSBjb3JyZWN0LCBob3dldmVyIGl0IG1pZ2h0IG5vdCBiZSBtaW5pbWFsLlxuXG5cdFx0Y29uc3Qgc3RhcnRCZWZvcmVOZXdMaW5lID0gZWRpdC5yYW5nZS5zdGFydENvbHVtbiA9PT0gaW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkuZ2V0TGluZUxlbmd0aChlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlcikgKyAxO1xuXHRcdGNvbnN0IGVuZEFmdGVyTmV3TGluZSA9IGVkaXQucmFuZ2UuZW5kQ29sdW1uID09PSAxO1xuXG5cdFx0aWYgKHN0YXJ0QmVmb3JlTmV3TGluZSAmJiBuZXdMaW5lc1swXS5sZW5ndGggPT09IHN1cnZpdmluZ0ZpcnN0TGluZVRleHQubGVuZ3RoKSB7XG5cdFx0XHQvLyB0aGUgcmVwbGFjZW1lbnQgd291bGQgbm90IGRlbGV0ZSBhbnkgdGV4dCBvbiB0aGUgZmlyc3QgbGluZVxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyKys7XG5cdFx0XHRuZXdMaW5lcy5zaGlmdCgpO1xuXHRcdH1cblxuXHRcdGlmIChuZXdMaW5lcy5sZW5ndGggPiAwICYmIHN0YXJ0TGluZU51bWJlciA8IGVuZExpbmVOdW1iZXJFeCAmJiBlbmRBZnRlck5ld0xpbmUgJiYgbmV3TGluZXNbbmV3TGluZXMubGVuZ3RoIC0gMV0ubGVuZ3RoID09PSBzdXJ2aXZpbmdFbmRMaW5lVGV4dC5sZW5ndGgpIHtcblx0XHRcdC8vIHRoZSByZXBsYWNlbWVudCB3b3VsZCBub3QgZGVsZXRlIGFueSB0ZXh0IG9uIHRoZSBsYXN0IGxpbmVcblx0XHRcdGVuZExpbmVOdW1iZXJFeC0tO1xuXHRcdFx0bmV3TGluZXMucG9wKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBMaW5lUmVwbGFjZW1lbnQobmV3IExpbmVSYW5nZShzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJFeCksIG5ld0xpbmVzKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lUmFuZ2U6IExpbmVSYW5nZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmV3TGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyB0b1NpbmdsZVRleHRFZGl0KGluaXRpYWxWYWx1ZTogQWJzdHJhY3RUZXh0KTogVGV4dFJlcGxhY2VtZW50IHtcblx0XHRpZiAodGhpcy5uZXdMaW5lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIERlbGV0aW9uXG5cdFx0XHRjb25zdCB0ZXh0TGVuID0gaW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkudGV4dExlbmd0aDtcblx0XHRcdGlmICh0aGlzLmxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlID09PSB0ZXh0TGVuLmxpbmVDb3VudCArIDIpIHtcblx0XHRcdFx0bGV0IHN0YXJ0UG9zOiBQb3NpdGlvbjtcblx0XHRcdFx0aWYgKHRoaXMubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciA+IDEpIHtcblx0XHRcdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSB0aGlzLmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gaW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkuZ2V0TGluZUxlbmd0aChzdGFydExpbmVOdW1iZXIpICsgMTtcblx0XHRcdFx0XHRzdGFydFBvcyA9IG5ldyBQb3NpdGlvbihzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBEZWxldGUgZXZlcnl0aGluZy5cblx0XHRcdFx0XHQvLyBJbiB0ZXJtcyBvZiBsaW5lcywgdGhpcyB3b3VsZCBlbmQgdXAgd2l0aCAwIGxpbmVzLlxuXHRcdFx0XHRcdC8vIEhvd2V2ZXIsIGEgc3RyaW5nIGhhcyBhbHdheXMgMSBsaW5lICh3aGljaCBjYW4gYmUgZW1wdHkpLlxuXHRcdFx0XHRcdHN0YXJ0UG9zID0gbmV3IFBvc2l0aW9uKDEsIDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGFzdFBvc2l0aW9uID0gdGV4dExlbi5hZGRUb1Bvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KFJhbmdlLmZyb21Qb3NpdGlvbnMoc3RhcnRQb3MsIGxhc3RQb3NpdGlvbiksICcnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KG5ldyBSYW5nZSh0aGlzLmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIsIDEsIHRoaXMubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsIDEpLCAnJyk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMubGluZVJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdC8vIEluc2VydGlvblxuXG5cdFx0XHRsZXQgZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRcdFx0bGV0IGNvbHVtbjogbnVtYmVyO1xuXHRcdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRcdGNvbnN0IGluc2VydGlvbkxpbmUgPSB0aGlzLmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRpZiAoaW5zZXJ0aW9uTGluZSA9PT0gaW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkudGV4dExlbmd0aC5saW5lQ291bnQgKyAyKSB7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBpbnNlcnRpb25MaW5lIC0gMTtcblx0XHRcdFx0Y29sdW1uID0gaW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkuZ2V0TGluZUxlbmd0aChlbmRMaW5lTnVtYmVyKSArIDE7XG5cdFx0XHRcdHRleHQgPSB0aGlzLm5ld0xpbmVzLm1hcChsID0+ICdcXG4nICsgbCkuam9pbignJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbmRMaW5lTnVtYmVyID0gaW5zZXJ0aW9uTGluZTtcblx0XHRcdFx0Y29sdW1uID0gMTtcblx0XHRcdFx0dGV4dCA9IHRoaXMubmV3TGluZXMubWFwKGwgPT4gbCArICdcXG4nKS5qb2luKCcnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKGVuZExpbmVOdW1iZXIsIGNvbHVtbikpLCB0ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxO1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlck1heENvbHVtbiA9IGluaXRpYWxWYWx1ZS5nZXRUcmFuc2Zvcm1lcigpLmdldExpbmVMZW5ndGgoZW5kTGluZU51bWJlcikgKyAxO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdHRoaXMubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0MSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcixcblx0XHRcdFx0ZW5kTGluZU51bWJlck1heENvbHVtblxuXHRcdFx0KTtcblx0XHRcdC8vIERvbid0IGFkZCBcXG4gdG8gdGhlIGxhc3QgbGluZS4gVGhpcyBpcyBiZWNhdXNlIHdlIHN1YnRyYWN0IG9uZSBmcm9tIGxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIGZvciBlbmRMaW5lTnVtYmVyLlxuXHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMubmV3TGluZXMuam9pbignXFxuJyk7XG5cdFx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChyYW5nZSwgdGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvU2luZ2xlRWRpdChpbml0aWFsVmFsdWU6IEFic3RyYWN0VGV4dCk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRjb25zdCB0ZXh0RWRpdCA9IHRoaXMudG9TaW5nbGVUZXh0RWRpdChpbml0aWFsVmFsdWUpO1xuXHRcdGNvbnN0IHJhbmdlID0gaW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkuZ2V0T2Zmc2V0UmFuZ2UodGV4dEVkaXQucmFuZ2UpO1xuXHRcdHJldHVybiBuZXcgU3RyaW5nUmVwbGFjZW1lbnQocmFuZ2UsIHRleHRFZGl0LnRleHQpO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMubGluZVJhbmdlfS0+JHtKU09OLnN0cmluZ2lmeSh0aGlzLm5ld0xpbmVzKX1gO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBTZXJpYWxpemVkTGluZVJlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0dGhpcy5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0dGhpcy5saW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHRcdHRoaXMubmV3TGluZXMsXG5cdFx0XTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb21tb25TdWZmaXhQcmVmaXhMaW5lcyhpbml0aWFsVmFsdWU6IEFic3RyYWN0VGV4dCk6IExpbmVSZXBsYWNlbWVudCB7XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRsZXQgZW5kTGluZU51bWJlckV4ID0gdGhpcy5saW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblxuXHRcdGxldCB0cmltU3RhcnRDb3VudCA9IDA7XG5cdFx0d2hpbGUgKFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyIDwgZW5kTGluZU51bWJlckV4ICYmIHRyaW1TdGFydENvdW50IDwgdGhpcy5uZXdMaW5lcy5sZW5ndGhcblx0XHRcdCYmIHRoaXMubmV3TGluZXNbdHJpbVN0YXJ0Q291bnRdID09PSBpbml0aWFsVmFsdWUuZ2V0TGluZUF0KHN0YXJ0TGluZU51bWJlcilcblx0XHQpIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcisrO1xuXHRcdFx0dHJpbVN0YXJ0Q291bnQrKztcblx0XHR9XG5cblx0XHRsZXQgdHJpbUVuZENvdW50ID0gMDtcblx0XHR3aGlsZSAoXG5cdFx0XHRzdGFydExpbmVOdW1iZXIgPCBlbmRMaW5lTnVtYmVyRXggJiYgdHJpbUVuZENvdW50ICsgdHJpbVN0YXJ0Q291bnQgPCB0aGlzLm5ld0xpbmVzLmxlbmd0aFxuXHRcdFx0JiYgdGhpcy5uZXdMaW5lc1t0aGlzLm5ld0xpbmVzLmxlbmd0aCAtIDEgLSB0cmltRW5kQ291bnRdID09PSBpbml0aWFsVmFsdWUuZ2V0TGluZUF0KGVuZExpbmVOdW1iZXJFeCAtIDEpXG5cdFx0KSB7XG5cdFx0XHRlbmRMaW5lTnVtYmVyRXgtLTtcblx0XHRcdHRyaW1FbmRDb3VudCsrO1xuXHRcdH1cblxuXHRcdGlmICh0cmltU3RhcnRDb3VudCA9PT0gMCAmJiB0cmltRW5kQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IExpbmVSZXBsYWNlbWVudChuZXcgTGluZVJhbmdlKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlckV4KSwgdGhpcy5uZXdMaW5lcy5zbGljZSh0cmltU3RhcnRDb3VudCwgdGhpcy5uZXdMaW5lcy5sZW5ndGggLSB0cmltRW5kQ291bnQpKTtcblx0fVxuXG5cdHB1YmxpYyB0b0xpbmVFZGl0KCk6IExpbmVFZGl0IHtcblx0XHRyZXR1cm4gbmV3IExpbmVFZGl0KFt0aGlzXSk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgU2VyaWFsaXplZExpbmVFZGl0ID0gU2VyaWFsaXplZExpbmVSZXBsYWNlbWVudFtdO1xuZXhwb3J0IHR5cGUgU2VyaWFsaXplZExpbmVSZXBsYWNlbWVudCA9IFtzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBuZXdMaW5lczogcmVhZG9ubHkgc3RyaW5nW11dO1xuXG5leHBvcnQgbmFtZXNwYWNlIFNlcmlhbGl6ZWRMaW5lUmVwbGFjZW1lbnQge1xuXHRleHBvcnQgZnVuY3Rpb24gaXModGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBTZXJpYWxpemVkTGluZVJlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0QXJyYXkuaXNBcnJheSh0aGluZylcblx0XHRcdCYmIHRoaW5nLmxlbmd0aCA9PT0gM1xuXHRcdFx0JiYgdHlwZW9mIHRoaW5nWzBdID09PSAnbnVtYmVyJ1xuXHRcdFx0JiYgdHlwZW9mIHRoaW5nWzFdID09PSAnbnVtYmVyJ1xuXHRcdFx0JiYgQXJyYXkuaXNBcnJheSh0aGluZ1syXSlcblx0XHRcdCYmIHRoaW5nWzJdLmV2ZXJ5KChlOiB1bmtub3duKSA9PiB0eXBlb2YgZSA9PT0gJ3N0cmluZycpXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXLGlCQUFpQix3QkFBd0I7QUFDN0QsU0FB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
