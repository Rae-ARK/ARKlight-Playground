import * as strings from "../../../base/common/strings.js";
import { Constants } from "../../../base/common/uint.js";
import { InlineDecorationType } from "../viewModel/inlineDecorations.js";
import { LinePartMetadata } from "./linePart.js";
class LineDecoration {
  constructor(startColumn, endColumn, className, type) {
    this.startColumn = startColumn;
    this.endColumn = endColumn;
    this.className = className;
    this.type = type;
    this._lineDecorationBrand = void 0;
  }
  static _equals(a, b) {
    return a.startColumn === b.startColumn && a.endColumn === b.endColumn && a.className === b.className && a.type === b.type;
  }
  static equalsArr(a, b) {
    const aLen = a.length;
    const bLen = b.length;
    if (aLen !== bLen) {
      return false;
    }
    for (let i = 0; i < aLen; i++) {
      if (!LineDecoration._equals(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  static extractWrapped(arr, startOffset, endOffset) {
    if (arr.length === 0) {
      return arr;
    }
    const startColumn = startOffset + 1;
    const endColumn = endOffset + 1;
    const lineLength = endOffset - startOffset;
    const r = [];
    let rLength = 0;
    for (const dec of arr) {
      if (dec.endColumn <= startColumn || dec.startColumn >= endColumn) {
        continue;
      }
      r[rLength++] = new LineDecoration(Math.max(1, dec.startColumn - startColumn + 1), Math.min(lineLength + 1, dec.endColumn - startColumn + 1), dec.className, dec.type);
    }
    return r;
  }
  static filter(lineDecorations, lineNumber, minLineColumn, maxLineColumn) {
    if (lineDecorations.length === 0) {
      return [];
    }
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = lineDecorations.length; i < len; i++) {
      const d = lineDecorations[i];
      const range = d.range;
      if (range.endLineNumber < lineNumber || range.startLineNumber > lineNumber) {
        continue;
      }
      if (range.isEmpty() && (d.type === InlineDecorationType.Regular || d.type === InlineDecorationType.RegularAffectingLetterSpacing)) {
        continue;
      }
      const startColumn = range.startLineNumber === lineNumber ? range.startColumn : minLineColumn;
      const endColumn = range.endLineNumber === lineNumber ? range.endColumn : maxLineColumn;
      result[resultLen++] = new LineDecoration(startColumn, endColumn, d.inlineClassName, d.type);
    }
    return result;
  }
  static _typeCompare(a, b) {
    const ORDER = [2, 0, 1, 3];
    return ORDER[a] - ORDER[b];
  }
  static compare(a, b) {
    if (a.startColumn !== b.startColumn) {
      return a.startColumn - b.startColumn;
    }
    if (a.endColumn !== b.endColumn) {
      return a.endColumn - b.endColumn;
    }
    const typeCmp = LineDecoration._typeCompare(a.type, b.type);
    if (typeCmp !== 0) {
      return typeCmp;
    }
    if (a.className !== b.className) {
      return a.className < b.className ? -1 : 1;
    }
    return 0;
  }
}
class DecorationSegment {
  constructor(startOffset, endOffset, className, metadata) {
    this.startOffset = startOffset;
    this.endOffset = endOffset;
    this.className = className;
    this.metadata = metadata;
  }
}
class Stack {
  constructor() {
    this.stopOffsets = [];
    this.classNames = [];
    this.metadata = [];
    this.count = 0;
  }
  static _metadata(metadata) {
    let result = 0;
    for (let i = 0, len = metadata.length; i < len; i++) {
      result |= metadata[i];
    }
    return result;
  }
  consumeLowerThan(maxStopOffset, nextStartOffset, result) {
    while (this.count > 0 && this.stopOffsets[0] < maxStopOffset) {
      let i = 0;
      while (i + 1 < this.count && this.stopOffsets[i] === this.stopOffsets[i + 1]) {
        i++;
      }
      result.push(new DecorationSegment(nextStartOffset, this.stopOffsets[i], this.classNames.join(" "), Stack._metadata(this.metadata)));
      nextStartOffset = this.stopOffsets[i] + 1;
      this.stopOffsets.splice(0, i + 1);
      this.classNames.splice(0, i + 1);
      this.metadata.splice(0, i + 1);
      this.count -= i + 1;
    }
    if (this.count > 0 && nextStartOffset < maxStopOffset) {
      result.push(new DecorationSegment(nextStartOffset, maxStopOffset - 1, this.classNames.join(" "), Stack._metadata(this.metadata)));
      nextStartOffset = maxStopOffset;
    }
    return nextStartOffset;
  }
  insert(stopOffset, className, metadata) {
    if (this.count === 0 || this.stopOffsets[this.count - 1] <= stopOffset) {
      this.stopOffsets.push(stopOffset);
      this.classNames.push(className);
      this.metadata.push(metadata);
    } else {
      for (let i = 0; i < this.count; i++) {
        if (this.stopOffsets[i] >= stopOffset) {
          this.stopOffsets.splice(i, 0, stopOffset);
          this.classNames.splice(i, 0, className);
          this.metadata.splice(i, 0, metadata);
          break;
        }
      }
    }
    this.count++;
    return;
  }
}
class LineDecorationsNormalizer {
  /**
   * Normalize line decorations. Overlapping decorations will generate multiple segments
   */
  static normalize(lineContent, lineDecorations) {
    if (lineDecorations.length === 0) {
      return [];
    }
    const result = [];
    const stack = new Stack();
    let nextStartOffset = 0;
    for (let i = 0, len = lineDecorations.length; i < len; i++) {
      const d = lineDecorations[i];
      let startColumn = d.startColumn;
      let endColumn = d.endColumn;
      const className = d.className;
      const metadata = d.type === InlineDecorationType.Before ? LinePartMetadata.PSEUDO_BEFORE : d.type === InlineDecorationType.After ? LinePartMetadata.PSEUDO_AFTER : 0;
      if (startColumn > 1) {
        const charCodeBefore = lineContent.charCodeAt(startColumn - 2);
        if (strings.isHighSurrogate(charCodeBefore)) {
          startColumn--;
        }
      }
      if (endColumn > 1) {
        const charCodeBefore = lineContent.charCodeAt(endColumn - 2);
        if (strings.isHighSurrogate(charCodeBefore)) {
          endColumn--;
        }
      }
      const currentStartOffset = startColumn - 1;
      const currentEndOffset = endColumn - 2;
      nextStartOffset = stack.consumeLowerThan(currentStartOffset, nextStartOffset, result);
      if (stack.count === 0) {
        nextStartOffset = currentStartOffset;
      }
      stack.insert(currentEndOffset, className, metadata);
    }
    stack.consumeLowerThan(Constants.MAX_SAFE_SMALL_INTEGER, nextStartOffset, result);
    return result;
  }
}
export {
  DecorationSegment,
  LineDecoration,
  LineDecorationsNormalizer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdmlld0xheW91dC9saW5lRGVjb3JhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uLCBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaW5lUGFydE1ldGFkYXRhIH0gZnJvbSAnLi9saW5lUGFydC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMaW5lRGVjb3JhdGlvbiB7XG5cdF9saW5lRGVjb3JhdGlvbkJyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydENvbHVtbjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBlbmRDb2x1bW46IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgY2xhc3NOYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHR5cGU6IElubGluZURlY29yYXRpb25UeXBlXG5cdCkge1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2VxdWFscyhhOiBMaW5lRGVjb3JhdGlvbiwgYjogTGluZURlY29yYXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0YS5zdGFydENvbHVtbiA9PT0gYi5zdGFydENvbHVtblxuXHRcdFx0JiYgYS5lbmRDb2x1bW4gPT09IGIuZW5kQ29sdW1uXG5cdFx0XHQmJiBhLmNsYXNzTmFtZSA9PT0gYi5jbGFzc05hbWVcblx0XHRcdCYmIGEudHlwZSA9PT0gYi50eXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZXF1YWxzQXJyKGE6IHJlYWRvbmx5IExpbmVEZWNvcmF0aW9uW10sIGI6IHJlYWRvbmx5IExpbmVEZWNvcmF0aW9uW10pOiBib29sZWFuIHtcblx0XHRjb25zdCBhTGVuID0gYS5sZW5ndGg7XG5cdFx0Y29uc3QgYkxlbiA9IGIubGVuZ3RoO1xuXHRcdGlmIChhTGVuICE9PSBiTGVuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYUxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoIUxpbmVEZWNvcmF0aW9uLl9lcXVhbHMoYVtpXSwgYltpXSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZXh0cmFjdFdyYXBwZWQoYXJyOiBMaW5lRGVjb3JhdGlvbltdLCBzdGFydE9mZnNldDogbnVtYmVyLCBlbmRPZmZzZXQ6IG51bWJlcik6IExpbmVEZWNvcmF0aW9uW10ge1xuXHRcdGlmIChhcnIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gYXJyO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydENvbHVtbiA9IHN0YXJ0T2Zmc2V0ICsgMTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBlbmRPZmZzZXQgKyAxO1xuXHRcdGNvbnN0IGxpbmVMZW5ndGggPSBlbmRPZmZzZXQgLSBzdGFydE9mZnNldDtcblx0XHRjb25zdCByID0gW107XG5cdFx0bGV0IHJMZW5ndGggPSAwO1xuXHRcdGZvciAoY29uc3QgZGVjIG9mIGFycikge1xuXHRcdFx0aWYgKGRlYy5lbmRDb2x1bW4gPD0gc3RhcnRDb2x1bW4gfHwgZGVjLnN0YXJ0Q29sdW1uID49IGVuZENvbHVtbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJbckxlbmd0aCsrXSA9IG5ldyBMaW5lRGVjb3JhdGlvbihNYXRoLm1heCgxLCBkZWMuc3RhcnRDb2x1bW4gLSBzdGFydENvbHVtbiArIDEpLCBNYXRoLm1pbihsaW5lTGVuZ3RoICsgMSwgZGVjLmVuZENvbHVtbiAtIHN0YXJ0Q29sdW1uICsgMSksIGRlYy5jbGFzc05hbWUsIGRlYy50eXBlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZpbHRlcihsaW5lRGVjb3JhdGlvbnM6IElubGluZURlY29yYXRpb25bXSwgbGluZU51bWJlcjogbnVtYmVyLCBtaW5MaW5lQ29sdW1uOiBudW1iZXIsIG1heExpbmVDb2x1bW46IG51bWJlcik6IExpbmVEZWNvcmF0aW9uW10ge1xuXHRcdGlmIChsaW5lRGVjb3JhdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBMaW5lRGVjb3JhdGlvbltdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZURlY29yYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBkID0gbGluZURlY29yYXRpb25zW2ldO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBkLnJhbmdlO1xuXG5cdFx0XHRpZiAocmFuZ2UuZW5kTGluZU51bWJlciA8IGxpbmVOdW1iZXIgfHwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBJZ25vcmUgZGVjb3JhdGlvbnMgdGhhdCBzaXQgb3V0c2lkZSB0aGlzIGxpbmVcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyYW5nZS5pc0VtcHR5KCkgJiYgKGQudHlwZSA9PT0gSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhciB8fCBkLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJBZmZlY3RpbmdMZXR0ZXJTcGFjaW5nKSkge1xuXHRcdFx0XHQvLyBJZ25vcmUgZW1wdHkgcmFuZ2UgZGVjb3JhdGlvbnNcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gKHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gbGluZU51bWJlciA/IHJhbmdlLnN0YXJ0Q29sdW1uIDogbWluTGluZUNvbHVtbik7XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSAocmFuZ2UuZW5kTGluZU51bWJlciA9PT0gbGluZU51bWJlciA/IHJhbmdlLmVuZENvbHVtbiA6IG1heExpbmVDb2x1bW4pO1xuXG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVEZWNvcmF0aW9uKHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4sIGQuaW5saW5lQ2xhc3NOYW1lLCBkLnR5cGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfdHlwZUNvbXBhcmUoYTogSW5saW5lRGVjb3JhdGlvblR5cGUsIGI6IElubGluZURlY29yYXRpb25UeXBlKTogbnVtYmVyIHtcblx0XHRjb25zdCBPUkRFUiA9IFsyLCAwLCAxLCAzXTtcblx0XHRyZXR1cm4gT1JERVJbYV0gLSBPUkRFUltiXTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29tcGFyZShhOiBMaW5lRGVjb3JhdGlvbiwgYjogTGluZURlY29yYXRpb24pOiBudW1iZXIge1xuXHRcdGlmIChhLnN0YXJ0Q29sdW1uICE9PSBiLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gYS5zdGFydENvbHVtbiAtIGIuc3RhcnRDb2x1bW47XG5cdFx0fVxuXG5cdFx0aWYgKGEuZW5kQ29sdW1uICE9PSBiLmVuZENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGEuZW5kQ29sdW1uIC0gYi5lbmRDb2x1bW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHlwZUNtcCA9IExpbmVEZWNvcmF0aW9uLl90eXBlQ29tcGFyZShhLnR5cGUsIGIudHlwZSk7XG5cdFx0aWYgKHR5cGVDbXAgIT09IDApIHtcblx0XHRcdHJldHVybiB0eXBlQ21wO1xuXHRcdH1cblxuXHRcdGlmIChhLmNsYXNzTmFtZSAhPT0gYi5jbGFzc05hbWUpIHtcblx0XHRcdHJldHVybiBhLmNsYXNzTmFtZSA8IGIuY2xhc3NOYW1lID8gLTEgOiAxO1xuXHRcdH1cblxuXHRcdHJldHVybiAwO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWNvcmF0aW9uU2VnbWVudCB7XG5cdHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdGVuZE9mZnNldDogbnVtYmVyO1xuXHRjbGFzc05hbWU6IHN0cmluZztcblx0bWV0YWRhdGE6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihzdGFydE9mZnNldDogbnVtYmVyLCBlbmRPZmZzZXQ6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcsIG1ldGFkYXRhOiBudW1iZXIpIHtcblx0XHR0aGlzLnN0YXJ0T2Zmc2V0ID0gc3RhcnRPZmZzZXQ7XG5cdFx0dGhpcy5lbmRPZmZzZXQgPSBlbmRPZmZzZXQ7XG5cdFx0dGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IG1ldGFkYXRhO1xuXHR9XG59XG5cbmNsYXNzIFN0YWNrIHtcblx0cHVibGljIGNvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcE9mZnNldHM6IG51bWJlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNsYXNzTmFtZXM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1ldGFkYXRhOiBudW1iZXJbXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnN0b3BPZmZzZXRzID0gW107XG5cdFx0dGhpcy5jbGFzc05hbWVzID0gW107XG5cdFx0dGhpcy5tZXRhZGF0YSA9IFtdO1xuXHRcdHRoaXMuY291bnQgPSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21ldGFkYXRhKG1ldGFkYXRhOiBudW1iZXJbXSk6IG51bWJlciB7XG5cdFx0bGV0IHJlc3VsdCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG1ldGFkYXRhLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRyZXN1bHQgfD0gbWV0YWRhdGFbaV07XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgY29uc3VtZUxvd2VyVGhhbihtYXhTdG9wT2Zmc2V0OiBudW1iZXIsIG5leHRTdGFydE9mZnNldDogbnVtYmVyLCByZXN1bHQ6IERlY29yYXRpb25TZWdtZW50W10pOiBudW1iZXIge1xuXG5cdFx0d2hpbGUgKHRoaXMuY291bnQgPiAwICYmIHRoaXMuc3RvcE9mZnNldHNbMF0gPCBtYXhTdG9wT2Zmc2V0KSB7XG5cdFx0XHRsZXQgaSA9IDA7XG5cblx0XHRcdC8vIFRha2UgYWxsIGVxdWFsIHN0b3BwaW5nIG9mZnNldHNcblx0XHRcdHdoaWxlIChpICsgMSA8IHRoaXMuY291bnQgJiYgdGhpcy5zdG9wT2Zmc2V0c1tpXSA9PT0gdGhpcy5zdG9wT2Zmc2V0c1tpICsgMV0pIHtcblx0XHRcdFx0aSsrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBCYXNpY2FsbHkgd2UgYXJlIGNvbnN1bWluZyB0aGUgZmlyc3QgaSArIDEgZWxlbWVudHMgb2YgdGhlIHN0YWNrXG5cdFx0XHRyZXN1bHQucHVzaChuZXcgRGVjb3JhdGlvblNlZ21lbnQobmV4dFN0YXJ0T2Zmc2V0LCB0aGlzLnN0b3BPZmZzZXRzW2ldLCB0aGlzLmNsYXNzTmFtZXMuam9pbignICcpLCBTdGFjay5fbWV0YWRhdGEodGhpcy5tZXRhZGF0YSkpKTtcblx0XHRcdG5leHRTdGFydE9mZnNldCA9IHRoaXMuc3RvcE9mZnNldHNbaV0gKyAxO1xuXG5cdFx0XHQvLyBDb25zdW1lIHRoZW1cblx0XHRcdHRoaXMuc3RvcE9mZnNldHMuc3BsaWNlKDAsIGkgKyAxKTtcblx0XHRcdHRoaXMuY2xhc3NOYW1lcy5zcGxpY2UoMCwgaSArIDEpO1xuXHRcdFx0dGhpcy5tZXRhZGF0YS5zcGxpY2UoMCwgaSArIDEpO1xuXHRcdFx0dGhpcy5jb3VudCAtPSAoaSArIDEpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvdW50ID4gMCAmJiBuZXh0U3RhcnRPZmZzZXQgPCBtYXhTdG9wT2Zmc2V0KSB7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgRGVjb3JhdGlvblNlZ21lbnQobmV4dFN0YXJ0T2Zmc2V0LCBtYXhTdG9wT2Zmc2V0IC0gMSwgdGhpcy5jbGFzc05hbWVzLmpvaW4oJyAnKSwgU3RhY2suX21ldGFkYXRhKHRoaXMubWV0YWRhdGEpKSk7XG5cdFx0XHRuZXh0U3RhcnRPZmZzZXQgPSBtYXhTdG9wT2Zmc2V0O1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXh0U3RhcnRPZmZzZXQ7XG5cdH1cblxuXHRwdWJsaWMgaW5zZXJ0KHN0b3BPZmZzZXQ6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcsIG1ldGFkYXRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb3VudCA9PT0gMCB8fCB0aGlzLnN0b3BPZmZzZXRzW3RoaXMuY291bnQgLSAxXSA8PSBzdG9wT2Zmc2V0KSB7XG5cdFx0XHQvLyBJbnNlcnQgYXQgdGhlIGVuZFxuXHRcdFx0dGhpcy5zdG9wT2Zmc2V0cy5wdXNoKHN0b3BPZmZzZXQpO1xuXHRcdFx0dGhpcy5jbGFzc05hbWVzLnB1c2goY2xhc3NOYW1lKTtcblx0XHRcdHRoaXMubWV0YWRhdGEucHVzaChtZXRhZGF0YSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZpbmQgdGhlIGluc2VydGlvbiBwb3NpdGlvbiBmb3IgYHN0b3BPZmZzZXRgXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY291bnQ7IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy5zdG9wT2Zmc2V0c1tpXSA+PSBzdG9wT2Zmc2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9wT2Zmc2V0cy5zcGxpY2UoaSwgMCwgc3RvcE9mZnNldCk7XG5cdFx0XHRcdFx0dGhpcy5jbGFzc05hbWVzLnNwbGljZShpLCAwLCBjbGFzc05hbWUpO1xuXHRcdFx0XHRcdHRoaXMubWV0YWRhdGEuc3BsaWNlKGksIDAsIG1ldGFkYXRhKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmNvdW50Kys7XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5lRGVjb3JhdGlvbnNOb3JtYWxpemVyIHtcblx0LyoqXG5cdCAqIE5vcm1hbGl6ZSBsaW5lIGRlY29yYXRpb25zLiBPdmVybGFwcGluZyBkZWNvcmF0aW9ucyB3aWxsIGdlbmVyYXRlIG11bHRpcGxlIHNlZ21lbnRzXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIG5vcm1hbGl6ZShsaW5lQ29udGVudDogc3RyaW5nLCBsaW5lRGVjb3JhdGlvbnM6IExpbmVEZWNvcmF0aW9uW10pOiBEZWNvcmF0aW9uU2VnbWVudFtdIHtcblx0XHRpZiAobGluZURlY29yYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogRGVjb3JhdGlvblNlZ21lbnRbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc3RhY2sgPSBuZXcgU3RhY2soKTtcblx0XHRsZXQgbmV4dFN0YXJ0T2Zmc2V0ID0gMDtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lRGVjb3JhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGQgPSBsaW5lRGVjb3JhdGlvbnNbaV07XG5cdFx0XHRsZXQgc3RhcnRDb2x1bW4gPSBkLnN0YXJ0Q29sdW1uO1xuXHRcdFx0bGV0IGVuZENvbHVtbiA9IGQuZW5kQ29sdW1uO1xuXHRcdFx0Y29uc3QgY2xhc3NOYW1lID0gZC5jbGFzc05hbWU7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IChcblx0XHRcdFx0ZC50eXBlID09PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmVcblx0XHRcdFx0XHQ/IExpbmVQYXJ0TWV0YWRhdGEuUFNFVURPX0JFRk9SRVxuXHRcdFx0XHRcdDogZC50eXBlID09PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlclxuXHRcdFx0XHRcdFx0PyBMaW5lUGFydE1ldGFkYXRhLlBTRVVET19BRlRFUlxuXHRcdFx0XHRcdFx0OiAwXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBJZiB0aGUgcG9zaXRpb24gd291bGQgZW5kIHVwIGluIHRoZSBtaWRkbGUgb2YgYSBoaWdoLWxvdyBzdXJyb2dhdGUgcGFpciwgd2UgbW92ZSBpdCB0byBiZWZvcmUgdGhlIHBhaXJcblx0XHRcdGlmIChzdGFydENvbHVtbiA+IDEpIHtcblx0XHRcdFx0Y29uc3QgY2hhckNvZGVCZWZvcmUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KHN0YXJ0Q29sdW1uIC0gMik7XG5cdFx0XHRcdGlmIChzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZUJlZm9yZSkpIHtcblx0XHRcdFx0XHRzdGFydENvbHVtbi0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbmRDb2x1bW4gPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXJDb2RlQmVmb3JlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChlbmRDb2x1bW4gLSAyKTtcblx0XHRcdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlQmVmb3JlKSkge1xuXHRcdFx0XHRcdGVuZENvbHVtbi0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRTdGFydE9mZnNldCA9IHN0YXJ0Q29sdW1uIC0gMTtcblx0XHRcdGNvbnN0IGN1cnJlbnRFbmRPZmZzZXQgPSBlbmRDb2x1bW4gLSAyO1xuXG5cdFx0XHRuZXh0U3RhcnRPZmZzZXQgPSBzdGFjay5jb25zdW1lTG93ZXJUaGFuKGN1cnJlbnRTdGFydE9mZnNldCwgbmV4dFN0YXJ0T2Zmc2V0LCByZXN1bHQpO1xuXG5cdFx0XHRpZiAoc3RhY2suY291bnQgPT09IDApIHtcblx0XHRcdFx0bmV4dFN0YXJ0T2Zmc2V0ID0gY3VycmVudFN0YXJ0T2Zmc2V0O1xuXHRcdFx0fVxuXHRcdFx0c3RhY2suaW5zZXJ0KGN1cnJlbnRFbmRPZmZzZXQsIGNsYXNzTmFtZSwgbWV0YWRhdGEpO1xuXHRcdH1cblxuXHRcdHN0YWNrLmNvbnN1bWVMb3dlclRoYW4oQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsIG5leHRTdGFydE9mZnNldCwgcmVzdWx0KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQTJCLDRCQUE0QjtBQUN2RCxTQUFTLHdCQUF3QjtBQUUxQixNQUFNLGVBQWU7QUFBQSxFQUczQixZQUNpQixhQUNBLFdBQ0EsV0FDQSxNQUNmO0FBSmU7QUFDQTtBQUNBO0FBQ0E7QUFOakIsZ0NBQTZCO0FBQUEsRUFRN0I7QUFBQSxFQUVBLE9BQWUsUUFBUSxHQUFtQixHQUE0QjtBQUNyRSxXQUNDLEVBQUUsZ0JBQWdCLEVBQUUsZUFDakIs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
