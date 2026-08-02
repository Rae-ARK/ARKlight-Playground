import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { FoldingRegions, MAX_LINE_NUMBER } from "./foldingRanges.js";
const foldingContext = {};
const ID_SYNTAX_PROVIDER = "syntax";
class SyntaxRangeProvider {
  constructor(editorModel, providers, handleFoldingRangesChange, foldingRangesLimit, fallbackRangeProvider) {
    this.editorModel = editorModel;
    this.providers = providers;
    this.handleFoldingRangesChange = handleFoldingRangesChange;
    this.foldingRangesLimit = foldingRangesLimit;
    this.fallbackRangeProvider = fallbackRangeProvider;
    this.id = ID_SYNTAX_PROVIDER;
    this.disposables = new DisposableStore();
    if (fallbackRangeProvider) {
      this.disposables.add(fallbackRangeProvider);
    }
    for (const provider of providers) {
      if (typeof provider.onDidChange === "function") {
        this.disposables.add(provider.onDidChange(handleFoldingRangesChange));
      }
    }
  }
  compute(cancellationToken) {
    return collectSyntaxRanges(this.providers, this.editorModel, cancellationToken).then((ranges) => {
      if (this.editorModel.isDisposed()) {
        return null;
      }
      if (ranges) {
        const res = sanitizeRanges(ranges, this.foldingRangesLimit);
        return res;
      }
      return this.fallbackRangeProvider?.compute(cancellationToken) ?? null;
    });
  }
  dispose() {
    this.disposables.dispose();
  }
}
function collectSyntaxRanges(providers, model, cancellationToken) {
  let rangeData = null;
  const promises = providers.map((provider, i) => {
    return Promise.resolve(provider.provideFoldingRanges(model, foldingContext, cancellationToken)).then((ranges) => {
      if (cancellationToken.isCancellationRequested) {
        return;
      }
      if (Array.isArray(ranges)) {
        if (!Array.isArray(rangeData)) {
          rangeData = [];
        }
        const nLines = model.getLineCount();
        for (const r of ranges) {
          if (r.start > 0 && r.end > r.start && r.end <= nLines) {
            rangeData.push({ start: r.start, end: r.end, rank: i, kind: r.kind });
          }
        }
      }
    }, onUnexpectedExternalError);
  });
  return Promise.all(promises).then((_) => {
    return rangeData;
  });
}
class RangesCollector {
  constructor(foldingRangesLimit) {
    this._startIndexes = [];
    this._endIndexes = [];
    this._nestingLevels = [];
    this._nestingLevelCounts = [];
    this._types = [];
    this._length = 0;
    this._foldingRangesLimit = foldingRangesLimit;
  }
  add(startLineNumber, endLineNumber, type, nestingLevel) {
    if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
      return;
    }
    const index = this._length;
    this._startIndexes[index] = startLineNumber;
    this._endIndexes[index] = endLineNumber;
    this._nestingLevels[index] = nestingLevel;
    this._types[index] = type;
    this._length++;
    if (nestingLevel < 30) {
      this._nestingLevelCounts[nestingLevel] = (this._nestingLevelCounts[nestingLevel] || 0) + 1;
    }
  }
  toIndentRanges() {
    const limit = this._foldingRangesLimit.limit;
    if (this._length <= limit) {
      this._foldingRangesLimit.update(this._length, false);
      const startIndexes = new Uint32Array(this._length);
      const endIndexes = new Uint32Array(this._length);
      for (let i = 0; i < this._length; i++) {
        startIndexes[i] = this._startIndexes[i];
        endIndexes[i] = this._endIndexes[i];
      }
      return new FoldingRegions(startIndexes, endIndexes, this._types);
    } else {
      this._foldingRangesLimit.update(this._length, limit);
      let entries = 0;
      let maxLevel = this._nestingLevelCounts.length;
      for (let i = 0; i < this._nestingLevelCounts.length; i++) {
        const n = this._nestingLevelCounts[i];
        if (n) {
          if (n + entries > limit) {
            maxLevel = i;
            break;
          }
          entries += n;
        }
      }
      const startIndexes = new Uint32Array(limit);
      const endIndexes = new Uint32Array(limit);
      const types = [];
      for (let i = 0, k = 0; i < this._length; i++) {
        const level = this._nestingLevels[i];
        if (level < maxLevel || level === maxLevel && entries++ < limit) {
          startIndexes[k] = this._startIndexes[i];
          endIndexes[k] = this._endIndexes[i];
          types[k] = this._types[i];
          k++;
        }
      }
      return new FoldingRegions(startIndexes, endIndexes, types);
    }
  }
}
function sanitizeRanges(rangeData, foldingRangesLimit) {
  const sorted = rangeData.sort((d1, d2) => {
    let diff = d1.start - d2.start;
    if (diff === 0) {
      diff = d1.rank - d2.rank;
    }
    return diff;
  });
  const collector = new RangesCollector(foldingRangesLimit);
  let top = void 0;
  const previous = [];
  for (const entry of sorted) {
    if (!top) {
      top = entry;
      collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
    } else {
      if (entry.start > top.start) {
        if (entry.end <= top.end) {
          previous.push(top);
          top = entry;
          collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
        } else {
          if (entry.start > top.end) {
            do {
              top = previous.pop();
            } while (top && entry.start > top.end);
            if (top) {
              previous.push(top);
            }
            top = entry;
          }
          collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
        }
      }
    }
  }
  return collector.toIndentRanges();
}
export {
  SyntaxRangeProvider,
  sanitizeRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9zeW50YXhSYW5nZVByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nQ29udGV4dCwgRm9sZGluZ1JhbmdlLCBGb2xkaW5nUmFuZ2VQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRm9sZGluZ0xpbWl0UmVwb3J0ZXIsIFJhbmdlUHJvdmlkZXIgfSBmcm9tICcuL2ZvbGRpbmcuanMnO1xuaW1wb3J0IHsgRm9sZGluZ1JlZ2lvbnMsIE1BWF9MSU5FX05VTUJFUiB9IGZyb20gJy4vZm9sZGluZ1Jhbmdlcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZvbGRpbmdSYW5nZURhdGEgZXh0ZW5kcyBGb2xkaW5nUmFuZ2Uge1xuXHRyYW5rOiBudW1iZXI7XG59XG5cbmNvbnN0IGZvbGRpbmdDb250ZXh0OiBGb2xkaW5nQ29udGV4dCA9IHtcbn07XG5cbmNvbnN0IElEX1NZTlRBWF9QUk9WSURFUiA9ICdzeW50YXgnO1xuXG5leHBvcnQgY2xhc3MgU3ludGF4UmFuZ2VQcm92aWRlciBpbXBsZW1lbnRzIFJhbmdlUHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IGlkID0gSURfU1lOVEFYX1BST1ZJREVSO1xuXG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVyczogRm9sZGluZ1JhbmdlUHJvdmlkZXJbXSxcblx0XHRyZWFkb25seSBoYW5kbGVGb2xkaW5nUmFuZ2VzQ2hhbmdlOiAoKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZm9sZGluZ1Jhbmdlc0xpbWl0OiBGb2xkaW5nTGltaXRSZXBvcnRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZhbGxiYWNrUmFuZ2VQcm92aWRlcjogUmFuZ2VQcm92aWRlciB8IHVuZGVmaW5lZCAvLyB1c2VkIHdoZW4gYWxsIHByb3ZpZGVycyByZXR1cm4gbnVsbFxuXHQpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGlmIChmYWxsYmFja1JhbmdlUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGZhbGxiYWNrUmFuZ2VQcm92aWRlcik7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBwcm92aWRlcnMpIHtcblx0XHRcdGlmICh0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2UgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2UoaGFuZGxlRm9sZGluZ1Jhbmdlc0NoYW5nZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbXB1dGUoY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxGb2xkaW5nUmVnaW9ucyB8IG51bGw+IHtcblx0XHRyZXR1cm4gY29sbGVjdFN5bnRheFJhbmdlcyh0aGlzLnByb3ZpZGVycywgdGhpcy5lZGl0b3JNb2RlbCwgY2FuY2VsbGF0aW9uVG9rZW4pLnRoZW4ocmFuZ2VzID0+IHtcblx0XHRcdGlmICh0aGlzLmVkaXRvck1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChyYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzID0gc2FuaXRpemVSYW5nZXMocmFuZ2VzLCB0aGlzLmZvbGRpbmdSYW5nZXNMaW1pdCk7XG5cdFx0XHRcdHJldHVybiByZXM7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5mYWxsYmFja1JhbmdlUHJvdmlkZXI/LmNvbXB1dGUoY2FuY2VsbGF0aW9uVG9rZW4pID8/IG51bGw7XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3RTeW50YXhSYW5nZXMocHJvdmlkZXJzOiBGb2xkaW5nUmFuZ2VQcm92aWRlcltdLCBtb2RlbDogSVRleHRNb2RlbCwgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRm9sZGluZ1JhbmdlRGF0YVtdIHwgbnVsbD4ge1xuXHRsZXQgcmFuZ2VEYXRhOiBJRm9sZGluZ1JhbmdlRGF0YVtdIHwgbnVsbCA9IG51bGw7XG5cdGNvbnN0IHByb21pc2VzID0gcHJvdmlkZXJzLm1hcCgocHJvdmlkZXIsIGkpID0+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLnByb3ZpZGVGb2xkaW5nUmFuZ2VzKG1vZGVsLCBmb2xkaW5nQ29udGV4dCwgY2FuY2VsbGF0aW9uVG9rZW4pKS50aGVuKHJhbmdlcyA9PiB7XG5cdFx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocmFuZ2VzKSkge1xuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocmFuZ2VEYXRhKSkge1xuXHRcdFx0XHRcdHJhbmdlRGF0YSA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5MaW5lcyA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgcmFuZ2VzKSB7XG5cdFx0XHRcdFx0aWYgKHIuc3RhcnQgPiAwICYmIHIuZW5kID4gci5zdGFydCAmJiByLmVuZCA8PSBuTGluZXMpIHtcblx0XHRcdFx0XHRcdHJhbmdlRGF0YS5wdXNoKHsgc3RhcnQ6IHIuc3RhcnQsIGVuZDogci5lbmQsIHJhbms6IGksIGtpbmQ6IHIua2luZCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKTtcblx0fSk7XG5cdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihfID0+IHtcblx0XHRyZXR1cm4gcmFuZ2VEYXRhO1xuXHR9KTtcbn1cblxuY2xhc3MgUmFuZ2VzQ29sbGVjdG9yIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRJbmRleGVzOiBudW1iZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5kSW5kZXhlczogbnVtYmVyW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX25lc3RpbmdMZXZlbHM6IG51bWJlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uZXN0aW5nTGV2ZWxDb3VudHM6IG51bWJlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90eXBlczogQXJyYXk8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBfbGVuZ3RoOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvbGRpbmdSYW5nZXNMaW1pdDogRm9sZGluZ0xpbWl0UmVwb3J0ZXI7XG5cblx0Y29uc3RydWN0b3IoZm9sZGluZ1Jhbmdlc0xpbWl0OiBGb2xkaW5nTGltaXRSZXBvcnRlcikge1xuXHRcdHRoaXMuX3N0YXJ0SW5kZXhlcyA9IFtdO1xuXHRcdHRoaXMuX2VuZEluZGV4ZXMgPSBbXTtcblx0XHR0aGlzLl9uZXN0aW5nTGV2ZWxzID0gW107XG5cdFx0dGhpcy5fbmVzdGluZ0xldmVsQ291bnRzID0gW107XG5cdFx0dGhpcy5fdHlwZXMgPSBbXTtcblx0XHR0aGlzLl9sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2ZvbGRpbmdSYW5nZXNMaW1pdCA9IGZvbGRpbmdSYW5nZXNMaW1pdDtcblx0fVxuXG5cdHB1YmxpYyBhZGQoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgdHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBuZXN0aW5nTGV2ZWw6IG51bWJlcikge1xuXHRcdGlmIChzdGFydExpbmVOdW1iZXIgPiBNQVhfTElORV9OVU1CRVIgfHwgZW5kTGluZU51bWJlciA+IE1BWF9MSU5FX05VTUJFUikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2xlbmd0aDtcblx0XHR0aGlzLl9zdGFydEluZGV4ZXNbaW5kZXhdID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdHRoaXMuX2VuZEluZGV4ZXNbaW5kZXhdID0gZW5kTGluZU51bWJlcjtcblx0XHR0aGlzLl9uZXN0aW5nTGV2ZWxzW2luZGV4XSA9IG5lc3RpbmdMZXZlbDtcblx0XHR0aGlzLl90eXBlc1tpbmRleF0gPSB0eXBlO1xuXHRcdHRoaXMuX2xlbmd0aCsrO1xuXHRcdGlmIChuZXN0aW5nTGV2ZWwgPCAzMCkge1xuXHRcdFx0dGhpcy5fbmVzdGluZ0xldmVsQ291bnRzW25lc3RpbmdMZXZlbF0gPSAodGhpcy5fbmVzdGluZ0xldmVsQ291bnRzW25lc3RpbmdMZXZlbF0gfHwgMCkgKyAxO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0b0luZGVudFJhbmdlcygpIHtcblx0XHRjb25zdCBsaW1pdCA9IHRoaXMuX2ZvbGRpbmdSYW5nZXNMaW1pdC5saW1pdDtcblx0XHRpZiAodGhpcy5fbGVuZ3RoIDw9IGxpbWl0KSB7XG5cdFx0XHR0aGlzLl9mb2xkaW5nUmFuZ2VzTGltaXQudXBkYXRlKHRoaXMuX2xlbmd0aCwgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBzdGFydEluZGV4ZXMgPSBuZXcgVWludDMyQXJyYXkodGhpcy5fbGVuZ3RoKTtcblx0XHRcdGNvbnN0IGVuZEluZGV4ZXMgPSBuZXcgVWludDMyQXJyYXkodGhpcy5fbGVuZ3RoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0c3RhcnRJbmRleGVzW2ldID0gdGhpcy5fc3RhcnRJbmRleGVzW2ldO1xuXHRcdFx0XHRlbmRJbmRleGVzW2ldID0gdGhpcy5fZW5kSW5kZXhlc1tpXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgRm9sZGluZ1JlZ2lvbnMoc3RhcnRJbmRleGVzLCBlbmRJbmRleGVzLCB0aGlzLl90eXBlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2ZvbGRpbmdSYW5nZXNMaW1pdC51cGRhdGUodGhpcy5fbGVuZ3RoLCBsaW1pdCk7XG5cblx0XHRcdGxldCBlbnRyaWVzID0gMDtcblx0XHRcdGxldCBtYXhMZXZlbCA9IHRoaXMuX25lc3RpbmdMZXZlbENvdW50cy5sZW5ndGg7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX25lc3RpbmdMZXZlbENvdW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBuID0gdGhpcy5fbmVzdGluZ0xldmVsQ291bnRzW2ldO1xuXHRcdFx0XHRpZiAobikge1xuXHRcdFx0XHRcdGlmIChuICsgZW50cmllcyA+IGxpbWl0KSB7XG5cdFx0XHRcdFx0XHRtYXhMZXZlbCA9IGk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZW50cmllcyArPSBuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0SW5kZXhlcyA9IG5ldyBVaW50MzJBcnJheShsaW1pdCk7XG5cdFx0XHRjb25zdCBlbmRJbmRleGVzID0gbmV3IFVpbnQzMkFycmF5KGxpbWl0KTtcblx0XHRcdGNvbnN0IHR5cGVzOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgayA9IDA7IGkgPCB0aGlzLl9sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBsZXZlbCA9IHRoaXMuX25lc3RpbmdMZXZlbHNbaV07XG5cdFx0XHRcdGlmIChsZXZlbCA8IG1heExldmVsIHx8IChsZXZlbCA9PT0gbWF4TGV2ZWwgJiYgZW50cmllcysrIDwgbGltaXQpKSB7XG5cdFx0XHRcdFx0c3RhcnRJbmRleGVzW2tdID0gdGhpcy5fc3RhcnRJbmRleGVzW2ldO1xuXHRcdFx0XHRcdGVuZEluZGV4ZXNba10gPSB0aGlzLl9lbmRJbmRleGVzW2ldO1xuXHRcdFx0XHRcdHR5cGVzW2tdID0gdGhpcy5fdHlwZXNbaV07XG5cdFx0XHRcdFx0aysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IEZvbGRpbmdSZWdpb25zKHN0YXJ0SW5kZXhlcywgZW5kSW5kZXhlcywgdHlwZXMpO1xuXHRcdH1cblxuXHR9XG5cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplUmFuZ2VzKHJhbmdlRGF0YTogSUZvbGRpbmdSYW5nZURhdGFbXSwgZm9sZGluZ1Jhbmdlc0xpbWl0OiBGb2xkaW5nTGltaXRSZXBvcnRlcik6IEZvbGRpbmdSZWdpb25zIHtcblx0Y29uc3Qgc29ydGVkID0gcmFuZ2VEYXRhLnNvcnQoKGQxLCBkMikgPT4ge1xuXHRcdGxldCBkaWZmID0gZDEuc3RhcnQgLSBkMi5zdGFydDtcblx0XHRpZiAoZGlmZiA9PT0gMCkge1xuXHRcdFx0ZGlmZiA9IGQxLnJhbmsgLSBkMi5yYW5rO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlmZjtcblx0fSk7XG5cdGNvbnN0IGNvbGxlY3RvciA9IG5ldyBSYW5nZXNDb2xsZWN0b3IoZm9sZGluZ1Jhbmdlc0xpbWl0KTtcblxuXHRsZXQgdG9wOiBJRm9sZGluZ1JhbmdlRGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Y29uc3QgcHJldmlvdXM6IElGb2xkaW5nUmFuZ2VEYXRhW10gPSBbXTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBzb3J0ZWQpIHtcblx0XHRpZiAoIXRvcCkge1xuXHRcdFx0dG9wID0gZW50cnk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkKGVudHJ5LnN0YXJ0LCBlbnRyeS5lbmQsIGVudHJ5LmtpbmQgJiYgZW50cnkua2luZC52YWx1ZSwgcHJldmlvdXMubGVuZ3RoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGVudHJ5LnN0YXJ0ID4gdG9wLnN0YXJ0KSB7XG5cdFx0XHRcdGlmIChlbnRyeS5lbmQgPD0gdG9wLmVuZCkge1xuXHRcdFx0XHRcdHByZXZpb3VzLnB1c2godG9wKTtcblx0XHRcdFx0XHR0b3AgPSBlbnRyeTtcblx0XHRcdFx0XHRjb2xsZWN0b3IuYWRkKGVudHJ5LnN0YXJ0LCBlbnRyeS5lbmQsIGVudHJ5LmtpbmQgJiYgZW50cnkua2luZC52YWx1ZSwgcHJldmlvdXMubGVuZ3RoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoZW50cnkuc3RhcnQgPiB0b3AuZW5kKSB7XG5cdFx0XHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0XHRcdHRvcCA9IHByZXZpb3VzLnBvcCgpO1xuXHRcdFx0XHRcdFx0fSB3aGlsZSAodG9wICYmIGVudHJ5LnN0YXJ0ID4gdG9wLmVuZCk7XG5cdFx0XHRcdFx0XHRpZiAodG9wKSB7XG5cdFx0XHRcdFx0XHRcdHByZXZpb3VzLnB1c2godG9wKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRvcCA9IGVudHJ5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb2xsZWN0b3IuYWRkKGVudHJ5LnN0YXJ0LCBlbnRyeS5lbmQsIGVudHJ5LmtpbmQgJiYgZW50cnkua2luZC52YWx1ZSwgcHJldmlvdXMubGVuZ3RoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gY29sbGVjdG9yLnRvSW5kZW50UmFuZ2VzKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHVCQUF1QjtBQUloQyxTQUFTLGdCQUFnQix1QkFBdUI7QUFNaEQsTUFBTSxpQkFBaUMsQ0FDdkM7QUFFQSxNQUFNLHFCQUFxQjtBQUVwQixNQUFNLG9CQUE2QztBQUFBLEVBTXpELFlBQ2tCLGFBQ0EsV0FDUiwyQkFDUSxvQkFDQSx1QkFDaEI7QUFMZ0I7QUFDQTtBQUNSO0FBQ1E7QUFDQTtBQVRsQixTQUFTLEtBQUs7QUFXYixTQUFLLGNBQWMsSUFBSSxnQkFBZ0I7QUFDdkMsUUFBSSx1QkFBdUI7QUFDMUIsV0FBSyxZQUFZLElBQUkscUJBQXFCO0FBQUEsSUFDM0M7QUFFQSxlQUFXLFlBQVksV0FBVztBQUNqQyxVQUFJLE9BQU8sU0FBUyxnQkFBZ0IsWUFBWTtBQUMvQyxhQUFLLFlBQVksSUFBSSxTQUFTLFlB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
