import { LinkedList } from "../../../../base/common/linkedList.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
const _BracketSelectionRangeProvider = class _BracketSelectionRangeProvider {
  async provideSelectionRanges(model, positions) {
    const result = [];
    for (const position of positions) {
      const bucket = [];
      result.push(bucket);
      const ranges = /* @__PURE__ */ new Map();
      await new Promise((resolve) => _BracketSelectionRangeProvider._bracketsRightYield(resolve, 0, model, position, ranges));
      await new Promise((resolve) => _BracketSelectionRangeProvider._bracketsLeftYield(resolve, 0, model, position, ranges, bucket));
    }
    return result;
  }
  static _bracketsRightYield(resolve, round, model, pos, ranges) {
    const counts = /* @__PURE__ */ new Map();
    const t1 = Date.now();
    while (true) {
      if (round >= _BracketSelectionRangeProvider._maxRounds) {
        resolve();
        break;
      }
      if (!pos) {
        resolve();
        break;
      }
      const bracket = model.bracketPairs.findNextBracket(pos);
      if (!bracket) {
        resolve();
        break;
      }
      const d = Date.now() - t1;
      if (d > _BracketSelectionRangeProvider._maxDuration) {
        setTimeout(() => _BracketSelectionRangeProvider._bracketsRightYield(resolve, round + 1, model, pos, ranges));
        break;
      }
      if (bracket.bracketInfo.isOpeningBracket) {
        const key = bracket.bracketInfo.bracketText;
        const val = counts.has(key) ? counts.get(key) : 0;
        counts.set(key, val + 1);
      } else {
        const key = bracket.bracketInfo.getOpeningBrackets()[0].bracketText;
        let val = counts.has(key) ? counts.get(key) : 0;
        val -= 1;
        counts.set(key, Math.max(0, val));
        if (val < 0) {
          let list = ranges.get(key);
          if (!list) {
            list = new LinkedList();
            ranges.set(key, list);
          }
          list.push(bracket.range);
        }
      }
      pos = bracket.range.getEndPosition();
    }
  }
  static _bracketsLeftYield(resolve, round, model, pos, ranges, bucket) {
    const counts = /* @__PURE__ */ new Map();
    const t1 = Date.now();
    while (true) {
      if (round >= _BracketSelectionRangeProvider._maxRounds && ranges.size === 0) {
        resolve();
        break;
      }
      if (!pos) {
        resolve();
        break;
      }
      const bracket = model.bracketPairs.findPrevBracket(pos);
      if (!bracket) {
        resolve();
        break;
      }
      const d = Date.now() - t1;
      if (d > _BracketSelectionRangeProvider._maxDuration) {
        setTimeout(() => _BracketSelectionRangeProvider._bracketsLeftYield(resolve, round + 1, model, pos, ranges, bucket));
        break;
      }
      if (!bracket.bracketInfo.isOpeningBracket) {
        const key = bracket.bracketInfo.getOpeningBrackets()[0].bracketText;
        const val = counts.has(key) ? counts.get(key) : 0;
        counts.set(key, val + 1);
      } else {
        const key = bracket.bracketInfo.bracketText;
        let val = counts.has(key) ? counts.get(key) : 0;
        val -= 1;
        counts.set(key, Math.max(0, val));
        if (val < 0) {
          const list = ranges.get(key);
          if (list) {
            const closing = list.shift();
            if (list.size === 0) {
              ranges.delete(key);
            }
            const innerBracket = Range.fromPositions(bracket.range.getEndPosition(), closing.getStartPosition());
            const outerBracket = Range.fromPositions(bracket.range.getStartPosition(), closing.getEndPosition());
            bucket.push({ range: innerBracket });
            bucket.push({ range: outerBracket });
            _BracketSelectionRangeProvider._addBracketLeading(model, outerBracket, bucket);
          }
        }
      }
      pos = bracket.range.getStartPosition();
    }
  }
  static _addBracketLeading(model, bracket, bucket) {
    if (bracket.startLineNumber === bracket.endLineNumber) {
      return;
    }
    const startLine = bracket.startLineNumber;
    const column = model.getLineFirstNonWhitespaceColumn(startLine);
    if (column !== 0 && column !== bracket.startColumn) {
      bucket.push({ range: Range.fromPositions(new Position(startLine, column), bracket.getEndPosition()) });
      bucket.push({ range: Range.fromPositions(new Position(startLine, 1), bracket.getEndPosition()) });
    }
    const aboveLine = startLine - 1;
    if (aboveLine > 0) {
      const column2 = model.getLineFirstNonWhitespaceColumn(aboveLine);
      if (column2 === bracket.startColumn && column2 !== model.getLineLastNonWhitespaceColumn(aboveLine)) {
        bucket.push({ range: Range.fromPositions(new Position(aboveLine, column2), bracket.getEndPosition()) });
        bucket.push({ range: Range.fromPositions(new Position(aboveLine, 1), bracket.getEndPosition()) });
      }
    }
  }
};
_BracketSelectionRangeProvider._maxDuration = 30;
_BracketSelectionRangeProvider._maxRounds = 2;
let BracketSelectionRangeProvider = _BracketSelectionRangeProvider;
export {
  BracketSelectionRangeProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3NtYXJ0U2VsZWN0L2Jyb3dzZXIvYnJhY2tldFNlbGVjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb25SYW5nZSwgU2VsZWN0aW9uUmFuZ2VQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIgaW1wbGVtZW50cyBTZWxlY3Rpb25SYW5nZVByb3ZpZGVyIHtcblxuXHRhc3luYyBwcm92aWRlU2VsZWN0aW9uUmFuZ2VzKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbnM6IFBvc2l0aW9uW10pOiBQcm9taXNlPFNlbGVjdGlvblJhbmdlW11bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogU2VsZWN0aW9uUmFuZ2VbXVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHBvc2l0aW9uIG9mIHBvc2l0aW9ucykge1xuXHRcdFx0Y29uc3QgYnVja2V0OiBTZWxlY3Rpb25SYW5nZVtdID0gW107XG5cdFx0XHRyZXN1bHQucHVzaChidWNrZXQpO1xuXG5cdFx0XHRjb25zdCByYW5nZXMgPSBuZXcgTWFwPHN0cmluZywgTGlua2VkTGlzdDxSYW5nZT4+KCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9icmFja2V0c1JpZ2h0WWllbGQocmVzb2x2ZSwgMCwgbW9kZWwsIHBvc2l0aW9uLCByYW5nZXMpKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX2JyYWNrZXRzTGVmdFlpZWxkKHJlc29sdmUsIDAsIG1vZGVsLCBwb3NpdGlvbiwgcmFuZ2VzLCBidWNrZXQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBfbWF4RHVyYXRpb24gPSAzMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX21heFJvdW5kcyA9IDI7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2JyYWNrZXRzUmlnaHRZaWVsZChyZXNvbHZlOiAoKSA9PiB2b2lkLCByb3VuZDogbnVtYmVyLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBQb3NpdGlvbiwgcmFuZ2VzOiBNYXA8c3RyaW5nLCBMaW5rZWRMaXN0PFJhbmdlPj4pOiB2b2lkIHtcblx0XHRjb25zdCBjb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGNvbnN0IHQxID0gRGF0ZS5ub3coKTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHJvdW5kID49IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9tYXhSb3VuZHMpIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICghcG9zKSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBicmFja2V0ID0gbW9kZWwuYnJhY2tldFBhaXJzLmZpbmROZXh0QnJhY2tldChwb3MpO1xuXHRcdFx0aWYgKCFicmFja2V0KSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkID0gRGF0ZS5ub3coKSAtIHQxO1xuXHRcdFx0aWYgKGQgPiBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlci5fbWF4RHVyYXRpb24pIHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlci5fYnJhY2tldHNSaWdodFlpZWxkKHJlc29sdmUsIHJvdW5kICsgMSwgbW9kZWwsIHBvcywgcmFuZ2VzKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGJyYWNrZXQuYnJhY2tldEluZm8uaXNPcGVuaW5nQnJhY2tldCkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBicmFja2V0LmJyYWNrZXRJbmZvLmJyYWNrZXRUZXh0O1xuXHRcdFx0XHQvLyB3YWl0IGZvciBjbG9zaW5nXG5cdFx0XHRcdGNvbnN0IHZhbCA9IGNvdW50cy5oYXMoa2V5KSA/IGNvdW50cy5nZXQoa2V5KSEgOiAwO1xuXHRcdFx0XHRjb3VudHMuc2V0KGtleSwgdmFsICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBicmFja2V0LmJyYWNrZXRJbmZvLmdldE9wZW5pbmdCcmFja2V0cygpWzBdLmJyYWNrZXRUZXh0O1xuXHRcdFx0XHQvLyBwcm9jZXNzIGNsb3Npbmdcblx0XHRcdFx0bGV0IHZhbCA9IGNvdW50cy5oYXMoa2V5KSA/IGNvdW50cy5nZXQoa2V5KSEgOiAwO1xuXHRcdFx0XHR2YWwgLT0gMTtcblx0XHRcdFx0Y291bnRzLnNldChrZXksIE1hdGgubWF4KDAsIHZhbCkpO1xuXHRcdFx0XHRpZiAodmFsIDwgMCkge1xuXHRcdFx0XHRcdGxldCBsaXN0ID0gcmFuZ2VzLmdldChrZXkpO1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0bGlzdCA9IG5ldyBMaW5rZWRMaXN0KCk7XG5cdFx0XHRcdFx0XHRyYW5nZXMuc2V0KGtleSwgbGlzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxpc3QucHVzaChicmFja2V0LnJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cG9zID0gYnJhY2tldC5yYW5nZS5nZXRFbmRQb3NpdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9icmFja2V0c0xlZnRZaWVsZChyZXNvbHZlOiAoKSA9PiB2b2lkLCByb3VuZDogbnVtYmVyLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBQb3NpdGlvbiwgcmFuZ2VzOiBNYXA8c3RyaW5nLCBMaW5rZWRMaXN0PFJhbmdlPj4sIGJ1Y2tldDogU2VsZWN0aW9uUmFuZ2VbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0Y29uc3QgdDEgPSBEYXRlLm5vdygpO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAocm91bmQgPj0gQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX21heFJvdW5kcyAmJiByYW5nZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwb3MpIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJyYWNrZXQgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZFByZXZCcmFja2V0KHBvcyk7XG5cdFx0XHRpZiAoIWJyYWNrZXQpIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGQgPSBEYXRlLm5vdygpIC0gdDE7XG5cdFx0XHRpZiAoZCA+IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9tYXhEdXJhdGlvbikge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9icmFja2V0c0xlZnRZaWVsZChyZXNvbHZlLCByb3VuZCArIDEsIG1vZGVsLCBwb3MsIHJhbmdlcywgYnVja2V0KSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFicmFja2V0LmJyYWNrZXRJbmZvLmlzT3BlbmluZ0JyYWNrZXQpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gYnJhY2tldC5icmFja2V0SW5mby5nZXRPcGVuaW5nQnJhY2tldHMoKVswXS5icmFja2V0VGV4dDtcblx0XHRcdFx0Ly8gd2FpdCBmb3Igb3BlbmluZ1xuXHRcdFx0XHRjb25zdCB2YWwgPSBjb3VudHMuaGFzKGtleSkgPyBjb3VudHMuZ2V0KGtleSkhIDogMDtcblx0XHRcdFx0Y291bnRzLnNldChrZXksIHZhbCArIDEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gYnJhY2tldC5icmFja2V0SW5mby5icmFja2V0VGV4dDtcblx0XHRcdFx0Ly8gb3BlbmluZ1xuXHRcdFx0XHRsZXQgdmFsID0gY291bnRzLmhhcyhrZXkpID8gY291bnRzLmdldChrZXkpISA6IDA7XG5cdFx0XHRcdHZhbCAtPSAxO1xuXHRcdFx0XHRjb3VudHMuc2V0KGtleSwgTWF0aC5tYXgoMCwgdmFsKSk7XG5cdFx0XHRcdGlmICh2YWwgPCAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGlzdCA9IHJhbmdlcy5nZXQoa2V5KTtcblx0XHRcdFx0XHRpZiAobGlzdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2xvc2luZyA9IGxpc3Quc2hpZnQoKTtcblx0XHRcdFx0XHRcdGlmIChsaXN0LnNpemUgPT09IDApIHtcblx0XHRcdFx0XHRcdFx0cmFuZ2VzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgaW5uZXJCcmFja2V0ID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhicmFja2V0LnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIGNsb3NpbmchLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRlckJyYWNrZXQgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGJyYWNrZXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCBjbG9zaW5nIS5nZXRFbmRQb3NpdGlvbigpKTtcblx0XHRcdFx0XHRcdGJ1Y2tldC5wdXNoKHsgcmFuZ2U6IGlubmVyQnJhY2tldCB9KTtcblx0XHRcdFx0XHRcdGJ1Y2tldC5wdXNoKHsgcmFuZ2U6IG91dGVyQnJhY2tldCB9KTtcblx0XHRcdFx0XHRcdEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9hZGRCcmFja2V0TGVhZGluZyhtb2RlbCwgb3V0ZXJCcmFja2V0LCBidWNrZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cG9zID0gYnJhY2tldC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FkZEJyYWNrZXRMZWFkaW5nKG1vZGVsOiBJVGV4dE1vZGVsLCBicmFja2V0OiBSYW5nZSwgYnVja2V0OiBTZWxlY3Rpb25SYW5nZVtdKTogdm9pZCB7XG5cdFx0aWYgKGJyYWNrZXQuc3RhcnRMaW5lTnVtYmVyID09PSBicmFja2V0LmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8geHh4eHh4eHgge1xuXHRcdC8vXG5cdFx0Ly8gfVxuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IGJyYWNrZXQuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGNvbHVtbiA9IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oc3RhcnRMaW5lKTtcblx0XHRpZiAoY29sdW1uICE9PSAwICYmIGNvbHVtbiAhPT0gYnJhY2tldC5zdGFydENvbHVtbikge1xuXHRcdFx0YnVja2V0LnB1c2goeyByYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhuZXcgUG9zaXRpb24oc3RhcnRMaW5lLCBjb2x1bW4pLCBicmFja2V0LmdldEVuZFBvc2l0aW9uKCkpIH0pO1xuXHRcdFx0YnVja2V0LnB1c2goeyByYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhuZXcgUG9zaXRpb24oc3RhcnRMaW5lLCAxKSwgYnJhY2tldC5nZXRFbmRQb3NpdGlvbigpKSB9KTtcblx0XHR9XG5cblx0XHQvLyB4eHh4eHh4eFxuXHRcdC8vIHtcblx0XHQvL1xuXHRcdC8vIH1cblx0XHRjb25zdCBhYm92ZUxpbmUgPSBzdGFydExpbmUgLSAxO1xuXHRcdGlmIChhYm92ZUxpbmUgPiAwKSB7XG5cdFx0XHRjb25zdCBjb2x1bW4gPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGFib3ZlTGluZSk7XG5cdFx0XHRpZiAoY29sdW1uID09PSBicmFja2V0LnN0YXJ0Q29sdW1uICYmIGNvbHVtbiAhPT0gbW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGFib3ZlTGluZSkpIHtcblx0XHRcdFx0YnVja2V0LnB1c2goeyByYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhuZXcgUG9zaXRpb24oYWJvdmVMaW5lLCBjb2x1bW4pLCBicmFja2V0LmdldEVuZFBvc2l0aW9uKCkpIH0pO1xuXHRcdFx0XHRidWNrZXQucHVzaCh7IHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihhYm92ZUxpbmUsIDEpLCBicmFja2V0LmdldEVuZFBvc2l0aW9uKCkpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBSWYsTUFBTSxpQ0FBTixNQUFNLCtCQUFnRTtBQUFBLEVBRTVFLE1BQU0sdUJBQXVCLE9BQW1CLFdBQW9EO0FBQ25HLFVBQU0sU0FBNkIsQ0FBQztBQUVwQyxlQUFXLFlBQVksV0FBVztBQUNqQyxZQUFNLFNBQTJCLENBQUM7QUFDbEMsYUFBTyxLQUFLLE1BQU07QUFFbEIsWUFBTSxTQUFTLG9CQUFJLElBQStCO0FBQ2xELFlBQU0sSUFBSSxRQUFjLGFBQVcsK0JBQThCLG9CQUFvQixTQUFTLEdBQUcsT0FBTyxVQUFVLE1BQU0sQ0FBQztBQUN6SCxZQUFNLElBQUksUUFBYyxhQUFXLCtCQUE4QixtQkFBbUIsU0FBUyxHQUFHLE9BQU8sVUFBVSxRQUFRLE1BQU0sQ0FBQztBQUFBLElBQ2pJO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUtBLE9BQWUsb0JBQW9CLFNBQXFCLE9BQWUsT0FBbUIsS0FBZSxRQUE4QztBQUN0SixVQUFNLFNBQVMsb0JBQUksSUFBb0I7QUFDdkMsVUFBTSxLQUFLLEtBQUssSUFBSTtBQUNwQixXQUFPLE1BQU07QUFDWixVQUFJLFNBQVMsK0JBQThCLFlBQVk7QUFDdEQsZ0JBQVE7QUFDUjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsS0FBSztBQUNULGdCQUFRO0FBQ1I7QUFBQSxNQUNEO0FBQ0EsWUFBTSxVQUFVLE1BQU0sYUFBYSxnQkFBZ0IsR0FBRztBQUN0RCxVQUFJLENBQUMsU0FBUztBQUNiLGdCQUFRO0FBQ1I7QUFBQSxNQUNEO0FBQ0EsWUFBTSxJ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
