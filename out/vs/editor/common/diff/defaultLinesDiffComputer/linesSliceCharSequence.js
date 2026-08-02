import { findLastIdxMonotonous, findLastMonotonous, findFirstMonotonous } from "../../../../base/common/arraysFind.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { OffsetRange } from "../../core/ranges/offsetRange.js";
import { Position } from "../../core/position.js";
import { Range } from "../../core/range.js";
import { isSpace } from "./utils.js";
class LinesSliceCharSequence {
  constructor(lines, range, considerWhitespaceChanges) {
    this.lines = lines;
    this.range = range;
    this.considerWhitespaceChanges = considerWhitespaceChanges;
    this.elements = [];
    this.firstElementOffsetByLineIdx = [];
    this.lineStartOffsets = [];
    this.trimmedWsLengthsByLineIdx = [];
    this.firstElementOffsetByLineIdx.push(0);
    for (let lineNumber = this.range.startLineNumber; lineNumber <= this.range.endLineNumber; lineNumber++) {
      let line = lines[lineNumber - 1];
      let lineStartOffset = 0;
      if (lineNumber === this.range.startLineNumber && this.range.startColumn > 1) {
        lineStartOffset = this.range.startColumn - 1;
        line = line.substring(lineStartOffset);
      }
      this.lineStartOffsets.push(lineStartOffset);
      let trimmedWsLength = 0;
      if (!considerWhitespaceChanges) {
        const trimmedStartLine = line.trimStart();
        trimmedWsLength = line.length - trimmedStartLine.length;
        line = trimmedStartLine.trimEnd();
      }
      this.trimmedWsLengthsByLineIdx.push(trimmedWsLength);
      const lineLength = lineNumber === this.range.endLineNumber ? Math.min(this.range.endColumn - 1 - lineStartOffset - trimmedWsLength, line.length) : line.length;
      for (let i = 0; i < lineLength; i++) {
        this.elements.push(line.charCodeAt(i));
      }
      if (lineNumber < this.range.endLineNumber) {
        this.elements.push("\n".charCodeAt(0));
        this.firstElementOffsetByLineIdx.push(this.elements.length);
      }
    }
  }
  toString() {
    return `Slice: "${this.text}"`;
  }
  get text() {
    return this.getText(new OffsetRange(0, this.length));
  }
  getText(range) {
    return this.elements.slice(range.start, range.endExclusive).map((e) => String.fromCharCode(e)).join("");
  }
  getElement(offset) {
    return this.elements[offset];
  }
  get length() {
    return this.elements.length;
  }
  getBoundaryScore(length) {
    const prevCategory = getCategory(length > 0 ? this.elements[length - 1] : -1);
    const nextCategory = getCategory(length < this.elements.length ? this.elements[length] : -1);
    if (prevCategory === 7 /* LineBreakCR */ && nextCategory === 8 /* LineBreakLF */) {
      return 0;
    }
    if (prevCategory === 8 /* LineBreakLF */) {
      return 150;
    }
    let score2 = 0;
    if (prevCategory !== nextCategory) {
      score2 += 10;
      if (prevCategory === 0 /* WordLower */ && nextCategory === 1 /* WordUpper */) {
        score2 += 1;
      }
    }
    score2 += getCategoryBoundaryScore(prevCategory);
    score2 += getCategoryBoundaryScore(nextCategory);
    return score2;
  }
  translateOffset(offset, preference = "right") {
    const i = findLastIdxMonotonous(this.firstElementOffsetByLineIdx, (value) => value <= offset);
    const lineOffset = offset - this.firstElementOffsetByLineIdx[i];
    return new Position(
      this.range.startLineNumber + i,
      1 + this.lineStartOffsets[i] + lineOffset + (lineOffset === 0 && preference === "left" ? 0 : this.trimmedWsLengthsByLineIdx[i])
    );
  }
  translateRange(range) {
    const pos1 = this.translateOffset(range.start, "right");
    const pos2 = this.translateOffset(range.endExclusive, "left");
    if (pos2.isBefore(pos1)) {
      return Range.fromPositions(pos2, pos2);
    }
    return Range.fromPositions(pos1, pos2);
  }
  /**
   * Finds the word that contains the character at the given offset
   */
  findWordContaining(offset) {
    if (offset < 0 || offset >= this.elements.length) {
      return void 0;
    }
    if (!isWordChar(this.elements[offset])) {
      return void 0;
    }
    let start = offset;
    while (start > 0 && isWordChar(this.elements[start - 1])) {
      start--;
    }
    let end = offset;
    while (end < this.elements.length && isWordChar(this.elements[end])) {
      end++;
    }
    return new OffsetRange(start, end);
  }
  /** fooBar has the two sub-words foo and bar */
  findSubWordContaining(offset) {
    if (offset < 0 || offset >= this.elements.length) {
      return void 0;
    }
    if (!isWordChar(this.elements[offset])) {
      return void 0;
    }
    let start = offset;
    while (start > 0 && isWordChar(this.elements[start - 1]) && !isUpperCase(this.elements[start])) {
      start--;
    }
    let end = offset;
    while (end < this.elements.length && isWordChar(this.elements[end]) && !isUpperCase(this.elements[end])) {
      end++;
    }
    return new OffsetRange(start, end);
  }
  countLinesIn(range) {
    return this.translateOffset(range.endExclusive).lineNumber - this.translateOffset(range.start).lineNumber;
  }
  isStronglyEqual(offset1, offset2) {
    return this.elements[offset1] === this.elements[offset2];
  }
  extendToFullLines(range) {
    const start = findLastMonotonous(this.firstElementOffsetByLineIdx, (x) => x <= range.start) ?? 0;
    const end = findFirstMonotonous(this.firstElementOffsetByLineIdx, (x) => range.endExclusive <= x) ?? this.elements.length;
    return new OffsetRange(start, end);
  }
}
function isWordChar(charCode) {
  return charCode >= CharCode.a && charCode <= CharCode.z || charCode >= CharCode.A && charCode <= CharCode.Z || charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9;
}
function isUpperCase(charCode) {
  return charCode >= CharCode.A && charCode <= CharCode.Z;
}
var CharBoundaryCategory = /* @__PURE__ */ ((CharBoundaryCategory2) => {
  CharBoundaryCategory2[CharBoundaryCategory2["WordLower"] = 0] = "WordLower";
  CharBoundaryCategory2[CharBoundaryCategory2["WordUpper"] = 1] = "WordUpper";
  CharBoundaryCategory2[CharBoundaryCategory2["WordNumber"] = 2] = "WordNumber";
  CharBoundaryCategory2[CharBoundaryCategory2["End"] = 3] = "End";
  CharBoundaryCategory2[CharBoundaryCategory2["Other"] = 4] = "Other";
  CharBoundaryCategory2[CharBoundaryCategory2["Separator"] = 5] = "Separator";
  CharBoundaryCategory2[CharBoundaryCategory2["Space"] = 6] = "Space";
  CharBoundaryCategory2[CharBoundaryCategory2["LineBreakCR"] = 7] = "LineBreakCR";
  CharBoundaryCategory2[CharBoundaryCategory2["LineBreakLF"] = 8] = "LineBreakLF";
  return CharBoundaryCategory2;
})(CharBoundaryCategory || {});
const score = {
  [0 /* WordLower */]: 0,
  [1 /* WordUpper */]: 0,
  [2 /* WordNumber */]: 0,
  [3 /* End */]: 10,
  [4 /* Other */]: 2,
  [5 /* Separator */]: 30,
  [6 /* Space */]: 3,
  [7 /* LineBreakCR */]: 10,
  [8 /* LineBreakLF */]: 10
};
function getCategoryBoundaryScore(category) {
  return score[category];
}
function getCategory(charCode) {
  if (charCode === CharCode.LineFeed) {
    return 8 /* LineBreakLF */;
  } else if (charCode === CharCode.CarriageReturn) {
    return 7 /* LineBreakCR */;
  } else if (isSpace(charCode)) {
    return 6 /* Space */;
  } else if (charCode >= CharCode.a && charCode <= CharCode.z) {
    return 0 /* WordLower */;
  } else if (charCode >= CharCode.A && charCode <= CharCode.Z) {
    return 1 /* WordUpper */;
  } else if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9) {
    return 2 /* WordNumber */;
  } else if (charCode === -1) {
    return 3 /* End */;
  } else if (charCode === CharCode.Comma || charCode === CharCode.Semicolon) {
    return 5 /* Separator */;
  } else {
    return 4 /* Other */;
  }
}
export {
  LinesSliceCharSequence
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vZGlmZi9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIvbGluZXNTbGljZUNoYXJTZXF1ZW5jZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZpbmRMYXN0SWR4TW9ub3Rvbm91cywgZmluZExhc3RNb25vdG9ub3VzLCBmaW5kRmlyc3RNb25vdG9ub3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VxdWVuY2UgfSBmcm9tICcuL2FsZ29yaXRobXMvZGlmZkFsZ29yaXRobS5qcyc7XG5pbXBvcnQgeyBpc1NwYWNlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMaW5lc1NsaWNlQ2hhclNlcXVlbmNlIGltcGxlbWVudHMgSVNlcXVlbmNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50czogbnVtYmVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBmaXJzdEVsZW1lbnRPZmZzZXRCeUxpbmVJZHg6IG51bWJlcltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgbGluZVN0YXJ0T2Zmc2V0czogbnVtYmVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSB0cmltbWVkV3NMZW5ndGhzQnlMaW5lSWR4OiBudW1iZXJbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBsaW5lczogc3RyaW5nW10sIHByaXZhdGUgcmVhZG9ubHkgcmFuZ2U6IFJhbmdlLCBwdWJsaWMgcmVhZG9ubHkgY29uc2lkZXJXaGl0ZXNwYWNlQ2hhbmdlczogYm9vbGVhbikge1xuXHRcdHRoaXMuZmlyc3RFbGVtZW50T2Zmc2V0QnlMaW5lSWR4LnB1c2goMCk7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHRoaXMucmFuZ2UuZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRsZXQgbGluZSA9IGxpbmVzW2xpbmVOdW1iZXIgLSAxXTtcblx0XHRcdGxldCBsaW5lU3RhcnRPZmZzZXQgPSAwO1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW4gPiAxKSB7XG5cdFx0XHRcdGxpbmVTdGFydE9mZnNldCA9IHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxO1xuXHRcdFx0XHRsaW5lID0gbGluZS5zdWJzdHJpbmcobGluZVN0YXJ0T2Zmc2V0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGluZVN0YXJ0T2Zmc2V0cy5wdXNoKGxpbmVTdGFydE9mZnNldCk7XG5cblx0XHRcdGxldCB0cmltbWVkV3NMZW5ndGggPSAwO1xuXHRcdFx0aWYgKCFjb25zaWRlcldoaXRlc3BhY2VDaGFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHRyaW1tZWRTdGFydExpbmUgPSBsaW5lLnRyaW1TdGFydCgpO1xuXHRcdFx0XHR0cmltbWVkV3NMZW5ndGggPSBsaW5lLmxlbmd0aCAtIHRyaW1tZWRTdGFydExpbmUubGVuZ3RoO1xuXHRcdFx0XHRsaW5lID0gdHJpbW1lZFN0YXJ0TGluZS50cmltRW5kKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRyaW1tZWRXc0xlbmd0aHNCeUxpbmVJZHgucHVzaCh0cmltbWVkV3NMZW5ndGgpO1xuXG5cdFx0XHRjb25zdCBsaW5lTGVuZ3RoID0gbGluZU51bWJlciA9PT0gdGhpcy5yYW5nZS5lbmRMaW5lTnVtYmVyID8gTWF0aC5taW4odGhpcy5yYW5nZS5lbmRDb2x1bW4gLSAxIC0gbGluZVN0YXJ0T2Zmc2V0IC0gdHJpbW1lZFdzTGVuZ3RoLCBsaW5lLmxlbmd0aCkgOiBsaW5lLmxlbmd0aDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudHMucHVzaChsaW5lLmNoYXJDb2RlQXQoaSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobGluZU51bWJlciA8IHRoaXMucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnRzLnB1c2goJ1xcbicuY2hhckNvZGVBdCgwKSk7XG5cdFx0XHRcdHRoaXMuZmlyc3RFbGVtZW50T2Zmc2V0QnlMaW5lSWR4LnB1c2godGhpcy5lbGVtZW50cy5sZW5ndGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRvU3RyaW5nKCkge1xuXHRcdHJldHVybiBgU2xpY2U6IFwiJHt0aGlzLnRleHR9XCJgO1xuXHR9XG5cblx0Z2V0IHRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUZXh0KG5ldyBPZmZzZXRSYW5nZSgwLCB0aGlzLmxlbmd0aCkpO1xuXHR9XG5cblx0Z2V0VGV4dChyYW5nZTogT2Zmc2V0UmFuZ2UpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRzLnNsaWNlKHJhbmdlLnN0YXJ0LCByYW5nZS5lbmRFeGNsdXNpdmUpLm1hcChlID0+IFN0cmluZy5mcm9tQ2hhckNvZGUoZSkpLmpvaW4oJycpO1xuXHR9XG5cblx0Z2V0RWxlbWVudChvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHNbb2Zmc2V0XTtcblx0fVxuXG5cdGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50cy5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Qm91bmRhcnlTY29yZShsZW5ndGg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Ly8gICBhICAgYiAgIGMgICAsICAgICAgICAgICBkICAgZSAgIGZcblx0XHQvLyAxMSAgMCAgIDAgICAxMiAgMTUgIDYgICAxMyAgMCAgIDAgICAxMVxuXG5cdFx0Y29uc3QgcHJldkNhdGVnb3J5ID0gZ2V0Q2F0ZWdvcnkobGVuZ3RoID4gMCA/IHRoaXMuZWxlbWVudHNbbGVuZ3RoIC0gMV0gOiAtMSk7XG5cdFx0Y29uc3QgbmV4dENhdGVnb3J5ID0gZ2V0Q2F0ZWdvcnkobGVuZ3RoIDwgdGhpcy5lbGVtZW50cy5sZW5ndGggPyB0aGlzLmVsZW1lbnRzW2xlbmd0aF0gOiAtMSk7XG5cblx0XHRpZiAocHJldkNhdGVnb3J5ID09PSBDaGFyQm91bmRhcnlDYXRlZ29yeS5MaW5lQnJlYWtDUiAmJiBuZXh0Q2F0ZWdvcnkgPT09IENoYXJCb3VuZGFyeUNhdGVnb3J5LkxpbmVCcmVha0xGKSB7XG5cdFx0XHQvLyBkb24ndCBicmVhayBiZXR3ZWVuIFxcciBhbmQgXFxuXG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0aWYgKHByZXZDYXRlZ29yeSA9PT0gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuTGluZUJyZWFrTEYpIHtcblx0XHRcdC8vIHByZWZlciB0aGUgbGluZWJyZWFrIGJlZm9yZSB0aGUgY2hhbmdlXG5cdFx0XHRyZXR1cm4gMTUwO1xuXHRcdH1cblxuXHRcdGxldCBzY29yZSA9IDA7XG5cdFx0aWYgKHByZXZDYXRlZ29yeSAhPT0gbmV4dENhdGVnb3J5KSB7XG5cdFx0XHRzY29yZSArPSAxMDtcblx0XHRcdGlmIChwcmV2Q2F0ZWdvcnkgPT09IENoYXJCb3VuZGFyeUNhdGVnb3J5LldvcmRMb3dlciAmJiBuZXh0Q2F0ZWdvcnkgPT09IENoYXJCb3VuZGFyeUNhdGVnb3J5LldvcmRVcHBlcikge1xuXHRcdFx0XHRzY29yZSArPSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNjb3JlICs9IGdldENhdGVnb3J5Qm91bmRhcnlTY29yZShwcmV2Q2F0ZWdvcnkpO1xuXHRcdHNjb3JlICs9IGdldENhdGVnb3J5Qm91bmRhcnlTY29yZShuZXh0Q2F0ZWdvcnkpO1xuXG5cdFx0cmV0dXJuIHNjb3JlO1xuXHR9XG5cblx0cHVibGljIHRyYW5zbGF0ZU9mZnNldChvZmZzZXQ6IG51bWJlciwgcHJlZmVyZW5jZTogJ2xlZnQnIHwgJ3JpZ2h0JyA9ICdyaWdodCcpOiBQb3NpdGlvbiB7XG5cdFx0Ly8gZmluZCBzbWFsbGVzdCBpLCBzbyB0aGF0IGxpbmVCcmVha09mZnNldHNbaV0gPD0gb2Zmc2V0IHVzaW5nIGJpbmFyeSBzZWFyY2hcblx0XHRjb25zdCBpID0gZmluZExhc3RJZHhNb25vdG9ub3VzKHRoaXMuZmlyc3RFbGVtZW50T2Zmc2V0QnlMaW5lSWR4LCAodmFsdWUpID0+IHZhbHVlIDw9IG9mZnNldCk7XG5cdFx0Y29uc3QgbGluZU9mZnNldCA9IG9mZnNldCAtIHRoaXMuZmlyc3RFbGVtZW50T2Zmc2V0QnlMaW5lSWR4W2ldO1xuXHRcdHJldHVybiBuZXcgUG9zaXRpb24oXG5cdFx0XHR0aGlzLnJhbmdlLnN0YXJ0TGluZU51bWJlciArIGksXG5cdFx0XHQxICsgdGhpcy5saW5lU3RhcnRPZmZzZXRzW2ldICsgbGluZU9mZnNldCArICgobGluZU9mZnNldCA9PT0gMCAmJiBwcmVmZXJlbmNlID09PSAnbGVmdCcpID8gMCA6IHRoaXMudHJpbW1lZFdzTGVuZ3Roc0J5TGluZUlkeFtpXSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHRyYW5zbGF0ZVJhbmdlKHJhbmdlOiBPZmZzZXRSYW5nZSk6IFJhbmdlIHtcblx0XHRjb25zdCBwb3MxID0gdGhpcy50cmFuc2xhdGVPZmZzZXQocmFuZ2Uuc3RhcnQsICdyaWdodCcpO1xuXHRcdGNvbnN0IHBvczIgPSB0aGlzLnRyYW5zbGF0ZU9mZnNldChyYW5nZS5lbmRFeGNsdXNpdmUsICdsZWZ0Jyk7XG5cdFx0aWYgKHBvczIuaXNCZWZvcmUocG9zMSkpIHtcblx0XHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvczIsIHBvczIpO1xuXHRcdH1cblx0XHRyZXR1cm4gUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3MxLCBwb3MyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kcyB0aGUgd29yZCB0aGF0IGNvbnRhaW5zIHRoZSBjaGFyYWN0ZXIgYXQgdGhlIGdpdmVuIG9mZnNldFxuXHQgKi9cblx0cHVibGljIGZpbmRXb3JkQ29udGFpbmluZyhvZmZzZXQ6IG51bWJlcik6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAob2Zmc2V0IDwgMCB8fCBvZmZzZXQgPj0gdGhpcy5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1dvcmRDaGFyKHRoaXMuZWxlbWVudHNbb2Zmc2V0XSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gZmluZCBzdGFydFxuXHRcdGxldCBzdGFydCA9IG9mZnNldDtcblx0XHR3aGlsZSAoc3RhcnQgPiAwICYmIGlzV29yZENoYXIodGhpcy5lbGVtZW50c1tzdGFydCAtIDFdKSkge1xuXHRcdFx0c3RhcnQtLTtcblx0XHR9XG5cblx0XHQvLyBmaW5kIGVuZFxuXHRcdGxldCBlbmQgPSBvZmZzZXQ7XG5cdFx0d2hpbGUgKGVuZCA8IHRoaXMuZWxlbWVudHMubGVuZ3RoICYmIGlzV29yZENoYXIodGhpcy5lbGVtZW50c1tlbmRdKSkge1xuXHRcdFx0ZW5kKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBPZmZzZXRSYW5nZShzdGFydCwgZW5kKTtcblx0fVxuXG5cdC8qKiBmb29CYXIgaGFzIHRoZSB0d28gc3ViLXdvcmRzIGZvbyBhbmQgYmFyICovXG5cdHB1YmxpYyBmaW5kU3ViV29yZENvbnRhaW5pbmcob2Zmc2V0OiBudW1iZXIpOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG9mZnNldCA8IDAgfHwgb2Zmc2V0ID49IHRoaXMuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghaXNXb3JkQ2hhcih0aGlzLmVsZW1lbnRzW29mZnNldF0pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIGZpbmQgc3RhcnRcblx0XHRsZXQgc3RhcnQgPSBvZmZzZXQ7XG5cdFx0d2hpbGUgKHN0YXJ0ID4gMCAmJiBpc1dvcmRDaGFyKHRoaXMuZWxlbWVudHNbc3RhcnQgLSAxXSkgJiYgIWlzVXBwZXJDYXNlKHRoaXMuZWxlbWVudHNbc3RhcnRdKSkge1xuXHRcdFx0c3RhcnQtLTtcblx0XHR9XG5cblx0XHQvLyBmaW5kIGVuZFxuXHRcdGxldCBlbmQgPSBvZmZzZXQ7XG5cdFx0d2hpbGUgKGVuZCA8IHRoaXMuZWxlbWVudHMubGVuZ3RoICYmIGlzV29yZENoYXIodGhpcy5lbGVtZW50c1tlbmRdKSAmJiAhaXNVcHBlckNhc2UodGhpcy5lbGVtZW50c1tlbmRdKSkge1xuXHRcdFx0ZW5kKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBPZmZzZXRSYW5nZShzdGFydCwgZW5kKTtcblx0fVxuXG5cdHB1YmxpYyBjb3VudExpbmVzSW4ocmFuZ2U6IE9mZnNldFJhbmdlKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50cmFuc2xhdGVPZmZzZXQocmFuZ2UuZW5kRXhjbHVzaXZlKS5saW5lTnVtYmVyIC0gdGhpcy50cmFuc2xhdGVPZmZzZXQocmFuZ2Uuc3RhcnQpLmxpbmVOdW1iZXI7XG5cdH1cblxuXHRwdWJsaWMgaXNTdHJvbmdseUVxdWFsKG9mZnNldDE6IG51bWJlciwgb2Zmc2V0MjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHNbb2Zmc2V0MV0gPT09IHRoaXMuZWxlbWVudHNbb2Zmc2V0Ml07XG5cdH1cblxuXHRwdWJsaWMgZXh0ZW5kVG9GdWxsTGluZXMocmFuZ2U6IE9mZnNldFJhbmdlKTogT2Zmc2V0UmFuZ2Uge1xuXHRcdGNvbnN0IHN0YXJ0ID0gZmluZExhc3RNb25vdG9ub3VzKHRoaXMuZmlyc3RFbGVtZW50T2Zmc2V0QnlMaW5lSWR4LCB4ID0+IHggPD0gcmFuZ2Uuc3RhcnQpID8/IDA7XG5cdFx0Y29uc3QgZW5kID0gZmluZEZpcnN0TW9ub3Rvbm91cyh0aGlzLmZpcnN0RWxlbWVudE9mZnNldEJ5TGluZUlkeCwgeCA9PiByYW5nZS5lbmRFeGNsdXNpdmUgPD0geCkgPz8gdGhpcy5lbGVtZW50cy5sZW5ndGg7XG5cdFx0cmV0dXJuIG5ldyBPZmZzZXRSYW5nZShzdGFydCwgZW5kKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1dvcmRDaGFyKGNoYXJDb2RlOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIGNoYXJDb2RlID49IENoYXJDb2RlLmEgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUuelxuXHRcdHx8IGNoYXJDb2RlID49IENoYXJDb2RlLkEgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUuWlxuXHRcdHx8IGNoYXJDb2RlID49IENoYXJDb2RlLkRpZ2l0MCAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS5EaWdpdDk7XG59XG5cbmZ1bmN0aW9uIGlzVXBwZXJDYXNlKGNoYXJDb2RlOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIGNoYXJDb2RlID49IENoYXJDb2RlLkEgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUuWjtcbn1cblxuY29uc3QgZW51bSBDaGFyQm91bmRhcnlDYXRlZ29yeSB7XG5cdFdvcmRMb3dlcixcblx0V29yZFVwcGVyLFxuXHRXb3JkTnVtYmVyLFxuXHRFbmQsXG5cdE90aGVyLFxuXHRTZXBhcmF0b3IsXG5cdFNwYWNlLFxuXHRMaW5lQnJlYWtDUixcblx0TGluZUJyZWFrTEYsXG59XG5cbmNvbnN0IHNjb3JlOiBSZWNvcmQ8Q2hhckJvdW5kYXJ5Q2F0ZWdvcnksIG51bWJlcj4gPSB7XG5cdFtDaGFyQm91bmRhcnlDYXRlZ29yeS5Xb3JkTG93ZXJdOiAwLFxuXHRbQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuV29yZFVwcGVyXTogMCxcblx0W0NoYXJCb3VuZGFyeUNhdGVnb3J5LldvcmROdW1iZXJdOiAwLFxuXHRbQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuRW5kXTogMTAsXG5cdFtDaGFyQm91bmRhcnlDYXRlZ29yeS5PdGhlcl06IDIsXG5cdFtDaGFyQm91bmRhcnlDYXRlZ29yeS5TZXBhcmF0b3JdOiAzMCxcblx0W0NoYXJCb3VuZGFyeUNhdGVnb3J5LlNwYWNlXTogMyxcblx0W0NoYXJCb3VuZGFyeUNhdGVnb3J5LkxpbmVCcmVha0NSXTogMTAsXG5cdFtDaGFyQm91bmRhcnlDYXRlZ29yeS5MaW5lQnJlYWtMRl06IDEwLFxufTtcblxuZnVuY3Rpb24gZ2V0Q2F0ZWdvcnlCb3VuZGFyeVNjb3JlKGNhdGVnb3J5OiBDaGFyQm91bmRhcnlDYXRlZ29yeSk6IG51bWJlciB7XG5cdHJldHVybiBzY29yZVtjYXRlZ29yeV07XG59XG5cbmZ1bmN0aW9uIGdldENhdGVnb3J5KGNoYXJDb2RlOiBudW1iZXIpOiBDaGFyQm91bmRhcnlDYXRlZ29yeSB7XG5cdGlmIChjaGFyQ29kZSA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHRyZXR1cm4gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuTGluZUJyZWFrTEY7XG5cdH0gZWxzZSBpZiAoY2hhckNvZGUgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuKSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNhdGVnb3J5LkxpbmVCcmVha0NSO1xuXHR9IGVsc2UgaWYgKGlzU3BhY2UoY2hhckNvZGUpKSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNhdGVnb3J5LlNwYWNlO1xuXHR9IGVsc2UgaWYgKGNoYXJDb2RlID49IENoYXJDb2RlLmEgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUueikge1xuXHRcdHJldHVybiBDaGFyQm91bmRhcnlDYXRlZ29yeS5Xb3JkTG93ZXI7XG5cdH0gZWxzZSBpZiAoY2hhckNvZGUgPj0gQ2hhckNvZGUuQSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS5aKSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNhdGVnb3J5LldvcmRVcHBlcjtcblx0fSBlbHNlIGlmIChjaGFyQ29kZSA+PSBDaGFyQ29kZS5EaWdpdDAgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUuRGlnaXQ5KSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNhdGVnb3J5LldvcmROdW1iZXI7XG5cdH0gZWxzZSBpZiAoY2hhckNvZGUgPT09IC0xKSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNhdGVnb3J5LkVuZDtcblx0fSBlbHNlIGlmIChjaGFyQ29kZSA9PT0gQ2hhckNvZGUuQ29tbWEgfHwgY2hhckNvZGUgPT09IENoYXJDb2RlLlNlbWljb2xvbikge1xuXHRcdHJldHVybiBDaGFyQm91bmRhcnlDYXRlZ29yeS5TZXBhcmF0b3I7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNh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QVM7QUFDakgsV0FBTyxJQUFJLFlBQVksT0FBTyxHQUFHO0FBQUEsRUFDbEM7QUFDRDtBQUVBLFNBQVMsV0FBVyxVQUEyQjtBQUM5QyxTQUFPLFlBQVksU0FBUyxLQUFLLFlBQVksU0FBUyxLQUNsRCxZQUFZLFNBQVMsS0FBSyxZQUFZLFNBQVMsS0FDL0MsWUFBWSxTQUFTLFVBQVUsWUFBWSxTQUFTO0FBQ3pEO0FBRUEsU0FBUyxZQUFZLFVBQTJCO0FBQy9DLFNBQU8sWUFBWSxTQUFTLEtBQUssWUFBWSxTQUFTO0FBQ3ZEO0FBRUEsSUFBVyx1QkFBWCxrQkFBV0MsMEJBQVg7QUFDQyxFQUFBQSw0Q0FBQTtBQUNBLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFDQSxFQUFBQSw0Q0FBQTtBQUNBLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFDQSxFQUFBQSw0Q0FBQTtBQUNBLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFUVSxTQUFBQTtBQUFBLEdBQUE7QUFZWCxNQUFNLFFBQThDO0FBQUEsRUFDbkQsQ0FBQyxpQkFBOEIsR0FBRztBQUFBLEVBQ2xDLENBQUMsaUJBQThCLEdBQUc7QUFBQSxFQUNsQyxDQUFDLGtCQUErQixHQUFHO0FBQUEsRUFDbkMsQ0FBQyxXQUF3QixHQUFHO0FBQUEsRUFDNUIsQ0FBQyxhQUEwQixHQUFHO0FBQUEsRUFDOUIsQ0FBQyxpQkFBOEIsR0FBRztBQUFBLEVBQ2xDLENBQUMsYUFBMEIsR0FBRztBQUFBLEVBQzlCLENBQUMsbUJBQWdDLEdBQUc7QUFBQSxFQUNwQyxDQUFDLG1CQUFnQyxHQUFHO0FBQ3JDO0FBRUEsU0FBUyx5QkFBeUIsVUFBd0M7QUFDekUsU0FBTyxNQUFNLFFBQVE7QUFDdEI7QUFFQSxTQUFTLFlBQVksVUFBd0M7QUFDNUQsTUFBSSxhQUFhLFNBQVMsVUFBVTtBQUNuQyxXQUFPO0FBQUEsRUFDUixXQUFXLGFBQWEsU0FBUyxnQkFBZ0I7QUFDaEQsV0FBTztBQUFBLEVBQ1IsV0FBVyxRQUFRLFFBQVEsR0FBRztBQUM3QixXQUFPO0FBQUEsRUFDUixXQUFXLFlBQVksU0FBUyxLQUFLLFlBQVksU0FBUyxHQUFHO0FBQzVELFdBQU87QUFBQSxFQUNSLFdBQVcsWUFBWSxTQUFTLEtBQUssWUFBWSxTQUFTLEdBQUc7QUFDNUQsV0FBTztBQUFBLEVBQ1IsV0FBVyxZQUFZLFNBQVMsVUFBVSxZQUFZLFNBQVMsUUFBUTtBQUN0RSxXQUFPO0FBQUEsRUFDUixXQUFXLGFBQWEsSUFBSTtBQUMzQixXQUFPO0FBQUEsRUFDUixXQUFXLGFBQWEsU0FBUyxTQUFTLGFBQWEsU0FBUyxXQUFXO0FBQzFFLFdBQU87QUFBQSxFQUNSLE9BQU87QUFDTixXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJzY29yZSIsICJDaGFyQm91bmRhcnlDYXRlZ29yeSJdCn0K
