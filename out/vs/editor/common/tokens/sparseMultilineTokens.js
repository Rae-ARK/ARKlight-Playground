import { CharCode } from "../../../base/common/charCode.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { countEOL } from "../core/misc/eolCounter.js";
import { RateLimiter } from "./common.js";
class SparseMultilineTokens {
  static create(startLineNumber, tokens) {
    return new SparseMultilineTokens(startLineNumber, new SparseMultilineTokensStorage(tokens));
  }
  /**
   * (Inclusive) start line number for these tokens.
   */
  get startLineNumber() {
    return this._startLineNumber;
  }
  /**
   * (Inclusive) end line number for these tokens.
   */
  get endLineNumber() {
    return this._endLineNumber;
  }
  constructor(startLineNumber, tokens) {
    this._startLineNumber = startLineNumber;
    this._tokens = tokens;
    this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine();
  }
  toString() {
    return this._tokens.toString(this._startLineNumber);
  }
  _updateEndLineNumber() {
    this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine();
  }
  isEmpty() {
    return this._tokens.isEmpty();
  }
  getLineTokens(lineNumber) {
    if (this._startLineNumber <= lineNumber && lineNumber <= this._endLineNumber) {
      return this._tokens.getLineTokens(lineNumber - this._startLineNumber);
    }
    return null;
  }
  getRange() {
    const deltaRange = this._tokens.getRange();
    if (!deltaRange) {
      return deltaRange;
    }
    return new Range(this._startLineNumber + deltaRange.startLineNumber, deltaRange.startColumn, this._startLineNumber + deltaRange.endLineNumber, deltaRange.endColumn);
  }
  removeTokens(range) {
    const startLineIndex = range.startLineNumber - this._startLineNumber;
    const endLineIndex = range.endLineNumber - this._startLineNumber;
    this._startLineNumber += this._tokens.removeTokens(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1);
    this._updateEndLineNumber();
  }
  split(range) {
    const startLineIndex = range.startLineNumber - this._startLineNumber;
    const endLineIndex = range.endLineNumber - this._startLineNumber;
    const [a, b, bDeltaLine] = this._tokens.split(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1);
    return [new SparseMultilineTokens(this._startLineNumber, a), new SparseMultilineTokens(this._startLineNumber + bDeltaLine, b)];
  }
  applyEdit(range, text) {
    const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
    this.acceptEdit(range, eolCount, firstLineLength, lastLineLength, text.length > 0 ? text.charCodeAt(0) : CharCode.Null);
  }
  acceptEdit(range, eolCount, firstLineLength, lastLineLength, firstCharCode) {
    this._acceptDeleteRange(range);
    this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength, lastLineLength, firstCharCode);
    this._updateEndLineNumber();
  }
  _acceptDeleteRange(range) {
    if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
      return;
    }
    const firstLineIndex = range.startLineNumber - this._startLineNumber;
    const lastLineIndex = range.endLineNumber - this._startLineNumber;
    if (lastLineIndex < 0) {
      const deletedLinesCount = lastLineIndex - firstLineIndex;
      this._startLineNumber -= deletedLinesCount;
      return;
    }
    const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine();
    if (firstLineIndex >= tokenMaxDeltaLine + 1) {
      return;
    }
    if (firstLineIndex < 0 && lastLineIndex >= tokenMaxDeltaLine + 1) {
      this._startLineNumber = 0;
      this._tokens.clear();
      return;
    }
    if (firstLineIndex < 0) {
      const deletedBefore = -firstLineIndex;
      this._startLineNumber -= deletedBefore;
      this._tokens.acceptDeleteRange(range.startColumn - 1, 0, 0, lastLineIndex, range.endColumn - 1);
    } else {
      this._tokens.acceptDeleteRange(0, firstLineIndex, range.startColumn - 1, lastLineIndex, range.endColumn - 1);
    }
  }
  _acceptInsertText(position, eolCount, firstLineLength, lastLineLength, firstCharCode) {
    if (eolCount === 0 && firstLineLength === 0) {
      return;
    }
    const lineIndex = position.lineNumber - this._startLineNumber;
    if (lineIndex < 0) {
      this._startLineNumber += eolCount;
      return;
    }
    const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine();
    if (lineIndex >= tokenMaxDeltaLine + 1) {
      return;
    }
    this._tokens.acceptInsertText(lineIndex, position.column - 1, eolCount, firstLineLength, lastLineLength, firstCharCode);
  }
  reportIfInvalid(model) {
    this._tokens.reportIfInvalid(model, this._startLineNumber);
  }
}
const _SparseMultilineTokensStorage = class _SparseMultilineTokensStorage {
  constructor(tokens) {
    this._tokens = tokens;
    this._tokenCount = tokens.length / 4;
  }
  toString(startLineNumber) {
    const pieces = [];
    for (let i = 0; i < this._tokenCount; i++) {
      pieces.push(`(${this._getDeltaLine(i) + startLineNumber},${this._getStartCharacter(i)}-${this._getEndCharacter(i)})`);
    }
    return `[${pieces.join(",")}]`;
  }
  getMaxDeltaLine() {
    const tokenCount = this._getTokenCount();
    if (tokenCount === 0) {
      return -1;
    }
    return this._getDeltaLine(tokenCount - 1);
  }
  getRange() {
    const tokenCount = this._getTokenCount();
    if (tokenCount === 0) {
      return null;
    }
    const startChar = this._getStartCharacter(0);
    const maxDeltaLine = this._getDeltaLine(tokenCount - 1);
    const endChar = this._getEndCharacter(tokenCount - 1);
    return new Range(0, startChar + 1, maxDeltaLine, endChar + 1);
  }
  _getTokenCount() {
    return this._tokenCount;
  }
  _getDeltaLine(tokenIndex) {
    return this._tokens[4 * tokenIndex];
  }
  _getStartCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 1];
  }
  _getEndCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 2];
  }
  isEmpty() {
    return this._getTokenCount() === 0;
  }
  getLineTokens(deltaLine) {
    let low = 0;
    let high = this._getTokenCount() - 1;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      const midDeltaLine = this._getDeltaLine(mid);
      if (midDeltaLine < deltaLine) {
        low = mid + 1;
      } else if (midDeltaLine > deltaLine) {
        high = mid - 1;
      } else {
        let min = mid;
        while (min > low && this._getDeltaLine(min - 1) === deltaLine) {
          min--;
        }
        let max = mid;
        while (max < high && this._getDeltaLine(max + 1) === deltaLine) {
          max++;
        }
        return new SparseLineTokens(this._tokens.subarray(4 * min, 4 * max + 4));
      }
    }
    if (this._getDeltaLine(low) === deltaLine) {
      return new SparseLineTokens(this._tokens.subarray(4 * low, 4 * low + 4));
    }
    return null;
  }
  clear() {
    this._tokenCount = 0;
  }
  removeTokens(startDeltaLine, startChar, endDeltaLine, endChar) {
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    let newTokenCount = 0;
    let hasDeletedTokens = false;
    let firstDeltaLine = 0;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 4 * i;
      const tokenDeltaLine = tokens[srcOffset];
      const tokenStartCharacter = tokens[srcOffset + 1];
      const tokenEndCharacter = tokens[srcOffset + 2];
      const tokenMetadata = tokens[srcOffset + 3];
      if ((tokenDeltaLine > startDeltaLine || tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar) && (tokenDeltaLine < endDeltaLine || tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar)) {
        hasDeletedTokens = true;
      } else {
        if (newTokenCount === 0) {
          firstDeltaLine = tokenDeltaLine;
        }
        if (hasDeletedTokens) {
          const destOffset = 4 * newTokenCount;
          tokens[destOffset] = tokenDeltaLine - firstDeltaLine;
          tokens[destOffset + 1] = tokenStartCharacter;
          tokens[destOffset + 2] = tokenEndCharacter;
          tokens[destOffset + 3] = tokenMetadata;
        } else if (firstDeltaLine !== 0) {
          tokens[srcOffset] = tokenDeltaLine - firstDeltaLine;
        }
        newTokenCount++;
      }
    }
    this._tokenCount = newTokenCount;
    return firstDeltaLine;
  }
  split(startDeltaLine, startChar, endDeltaLine, endChar) {
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    const aTokens = [];
    const bTokens = [];
    let destTokens = aTokens;
    let destOffset = 0;
    let destFirstDeltaLine = 0;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 4 * i;
      const tokenDeltaLine = tokens[srcOffset];
      const tokenStartCharacter = tokens[srcOffset + 1];
      const tokenEndCharacter = tokens[srcOffset + 2];
      const tokenMetadata = tokens[srcOffset + 3];
      if (tokenDeltaLine > startDeltaLine || tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar) {
        if (tokenDeltaLine < endDeltaLine || tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar) {
          continue;
        } else {
          if (destTokens !== bTokens) {
            destTokens = bTokens;
            destOffset = 0;
            destFirstDeltaLine = tokenDeltaLine;
          }
        }
      }
      destTokens[destOffset++] = tokenDeltaLine - destFirstDeltaLine;
      destTokens[destOffset++] = tokenStartCharacter;
      destTokens[destOffset++] = tokenEndCharacter;
      destTokens[destOffset++] = tokenMetadata;
    }
    return [new _SparseMultilineTokensStorage(new Uint32Array(aTokens)), new _SparseMultilineTokensStorage(new Uint32Array(bTokens)), destFirstDeltaLine];
  }
  acceptDeleteRange(horizontalShiftForFirstLineTokens, startDeltaLine, startCharacter, endDeltaLine, endCharacter) {
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    const deletedLineCount = endDeltaLine - startDeltaLine;
    let newTokenCount = 0;
    let hasDeletedTokens = false;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 4 * i;
      let tokenDeltaLine = tokens[srcOffset];
      let tokenStartCharacter = tokens[srcOffset + 1];
      let tokenEndCharacter = tokens[srcOffset + 2];
      const tokenMetadata = tokens[srcOffset + 3];
      if (tokenDeltaLine < startDeltaLine || tokenDeltaLine === startDeltaLine && tokenEndCharacter <= startCharacter) {
        newTokenCount++;
        continue;
      } else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter < startCharacter) {
        if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
          tokenEndCharacter -= endCharacter - startCharacter;
        } else {
          tokenEndCharacter = startCharacter;
        }
      } else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter === startCharacter) {
        if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
          tokenEndCharacter -= endCharacter - startCharacter;
        } else {
          hasDeletedTokens = true;
          continue;
        }
      } else if (tokenDeltaLine < endDeltaLine || tokenDeltaLine === endDeltaLine && tokenStartCharacter < endCharacter) {
        if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
          tokenDeltaLine = startDeltaLine;
          tokenStartCharacter = startCharacter;
          tokenEndCharacter = tokenStartCharacter + (tokenEndCharacter - endCharacter);
        } else {
          hasDeletedTokens = true;
          continue;
        }
      } else if (tokenDeltaLine > endDeltaLine) {
        if (deletedLineCount === 0 && !hasDeletedTokens) {
          newTokenCount = tokenCount;
          break;
        }
        tokenDeltaLine -= deletedLineCount;
      } else if (tokenDeltaLine === endDeltaLine && tokenStartCharacter >= endCharacter) {
        if (horizontalShiftForFirstLineTokens && tokenDeltaLine === 0) {
          tokenStartCharacter += horizontalShiftForFirstLineTokens;
          tokenEndCharacter += horizontalShiftForFirstLineTokens;
        }
        tokenDeltaLine -= deletedLineCount;
        tokenStartCharacter -= endCharacter - startCharacter;
        tokenEndCharacter -= endCharacter - startCharacter;
      } else {
        throw new Error(`Not possible!`);
      }
      const destOffset = 4 * newTokenCount;
      tokens[destOffset] = tokenDeltaLine;
      tokens[destOffset + 1] = tokenStartCharacter;
      tokens[destOffset + 2] = tokenEndCharacter;
      tokens[destOffset + 3] = tokenMetadata;
      newTokenCount++;
    }
    this._tokenCount = newTokenCount;
  }
  acceptInsertText(deltaLine, character, eolCount, firstLineLength, lastLineLength, firstCharCode) {
    const isInsertingPreciselyOneWordCharacter = eolCount === 0 && firstLineLength === 1 && (firstCharCode >= CharCode.Digit0 && firstCharCode <= CharCode.Digit9 || firstCharCode >= CharCode.A && firstCharCode <= CharCode.Z || firstCharCode >= CharCode.a && firstCharCode <= CharCode.z);
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    for (let i = 0; i < tokenCount; i++) {
      const offset = 4 * i;
      let tokenDeltaLine = tokens[offset];
      let tokenStartCharacter = tokens[offset + 1];
      let tokenEndCharacter = tokens[offset + 2];
      if (tokenDeltaLine < deltaLine || tokenDeltaLine === deltaLine && tokenEndCharacter < character) {
        continue;
      } else if (tokenDeltaLine === deltaLine && tokenEndCharacter === character) {
        if (isInsertingPreciselyOneWordCharacter) {
          tokenEndCharacter += 1;
        } else {
          continue;
        }
      } else if (tokenDeltaLine === deltaLine && tokenStartCharacter < character && character < tokenEndCharacter) {
        if (eolCount === 0) {
          tokenEndCharacter += firstLineLength;
        } else {
          tokenEndCharacter = character;
        }
      } else {
        if (tokenDeltaLine === deltaLine && tokenStartCharacter === character) {
          if (isInsertingPreciselyOneWordCharacter) {
            continue;
          }
        }
        if (tokenDeltaLine === deltaLine) {
          tokenDeltaLine += eolCount;
          if (eolCount === 0) {
            tokenStartCharacter += firstLineLength;
            tokenEndCharacter += firstLineLength;
          } else {
            const tokenLength = tokenEndCharacter - tokenStartCharacter;
            tokenStartCharacter = lastLineLength + (tokenStartCharacter - character);
            tokenEndCharacter = tokenStartCharacter + tokenLength;
          }
        } else {
          tokenDeltaLine += eolCount;
        }
      }
      tokens[offset] = tokenDeltaLine;
      tokens[offset + 1] = tokenStartCharacter;
      tokens[offset + 2] = tokenEndCharacter;
    }
  }
  // limit to 10 times per minute
  reportIfInvalid(model, startLineNumber) {
    for (let i = 0; i < this._tokenCount; i++) {
      const lineNumber = this._getDeltaLine(i) + startLineNumber;
      if (lineNumber < 1) {
        _SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
          console.error("Invalid Semantic Tokens Data From Extension: lineNumber < 1");
        });
      } else if (lineNumber > model.getLineCount()) {
        _SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
          console.error("Invalid Semantic Tokens Data From Extension: lineNumber > model.getLineCount()");
        });
      } else if (this._getEndCharacter(i) > model.getLineLength(lineNumber)) {
        _SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
          console.error("Invalid Semantic Tokens Data From Extension: end character > model.getLineLength(lineNumber)");
        });
      }
    }
  }
};
_SparseMultilineTokensStorage._rateLimiter = new RateLimiter(10 / 60);
let SparseMultilineTokensStorage = _SparseMultilineTokensStorage;
class SparseLineTokens {
  constructor(tokens) {
    this._tokens = tokens;
  }
  getCount() {
    return this._tokens.length / 4;
  }
  getStartCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 1];
  }
  getEndCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 2];
  }
  getMetadata(tokenIndex) {
    return this._tokens[4 * tokenIndex + 3];
  }
}
export {
  SparseLineTokens,
  SparseMultilineTokens
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdG9rZW5zL3NwYXJzZU11bHRpbGluZVRva2Vucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGNvdW50RU9MIH0gZnJvbSAnLi4vY29yZS9taXNjL2VvbENvdW50ZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IFJhdGVMaW1pdGVyIH0gZnJvbSAnLi9jb21tb24uanMnO1xuXG4vKipcbiAqIFJlcHJlc2VudHMgc3BhcnNlIHRva2VucyBvdmVyIGEgY29udGlndW91cyByYW5nZSBvZiBsaW5lcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFNwYXJzZU11bHRpbGluZVRva2VucyB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHRva2VuczogVWludDMyQXJyYXkpOiBTcGFyc2VNdWx0aWxpbmVUb2tlbnMge1xuXHRcdHJldHVybiBuZXcgU3BhcnNlTXVsdGlsaW5lVG9rZW5zKHN0YXJ0TGluZU51bWJlciwgbmV3IFNwYXJzZU11bHRpbGluZVRva2Vuc1N0b3JhZ2UodG9rZW5zKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHJpdmF0ZSBfZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbnM6IFNwYXJzZU11bHRpbGluZVRva2Vuc1N0b3JhZ2U7XG5cblx0LyoqXG5cdCAqIChJbmNsdXNpdmUpIHN0YXJ0IGxpbmUgbnVtYmVyIGZvciB0aGVzZSB0b2tlbnMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHN0YXJ0TGluZU51bWJlcigpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydExpbmVOdW1iZXI7XG5cdH1cblxuXHQvKipcblx0ICogKEluY2x1c2l2ZSkgZW5kIGxpbmUgbnVtYmVyIGZvciB0aGVzZSB0b2tlbnMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGVuZExpbmVOdW1iZXIoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5kTGluZU51bWJlcjtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0b3Ioc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHRva2VuczogU3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZSkge1xuXHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblx0XHR0aGlzLl90b2tlbnMgPSB0b2tlbnM7XG5cdFx0dGhpcy5fZW5kTGluZU51bWJlciA9IHRoaXMuX3N0YXJ0TGluZU51bWJlciArIHRoaXMuX3Rva2Vucy5nZXRNYXhEZWx0YUxpbmUoKTtcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnMudG9TdHJpbmcodGhpcy5fc3RhcnRMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUVuZExpbmVOdW1iZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5kTGluZU51bWJlciA9IHRoaXMuX3N0YXJ0TGluZU51bWJlciArIHRoaXMuX3Rva2Vucy5nZXRNYXhEZWx0YUxpbmUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnMuaXNFbXB0eSgpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVUb2tlbnMobGluZU51bWJlcjogbnVtYmVyKTogU3BhcnNlTGluZVRva2VucyB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9zdGFydExpbmVOdW1iZXIgPD0gbGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IHRoaXMuX2VuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b2tlbnMuZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmFuZ2UoKTogUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCBkZWx0YVJhbmdlID0gdGhpcy5fdG9rZW5zLmdldFJhbmdlKCk7XG5cdFx0aWYgKCFkZWx0YVJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gZGVsdGFSYW5nZTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSYW5nZSh0aGlzLl9zdGFydExpbmVOdW1iZXIgKyBkZWx0YVJhbmdlLnN0YXJ0TGluZU51bWJlciwgZGVsdGFSYW5nZS5zdGFydENvbHVtbiwgdGhpcy5fc3RhcnRMaW5lTnVtYmVyICsgZGVsdGFSYW5nZS5lbmRMaW5lTnVtYmVyLCBkZWx0YVJhbmdlLmVuZENvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlVG9rZW5zKHJhbmdlOiBSYW5nZSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXJ0TGluZUluZGV4ID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZExpbmVJbmRleCA9IHJhbmdlLmVuZExpbmVOdW1iZXIgLSB0aGlzLl9zdGFydExpbmVOdW1iZXI7XG5cblx0XHR0aGlzLl9zdGFydExpbmVOdW1iZXIgKz0gdGhpcy5fdG9rZW5zLnJlbW92ZVRva2VucyhzdGFydExpbmVJbmRleCwgcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBlbmRMaW5lSW5kZXgsIHJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdHRoaXMuX3VwZGF0ZUVuZExpbmVOdW1iZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBzcGxpdChyYW5nZTogUmFuZ2UpOiBbU3BhcnNlTXVsdGlsaW5lVG9rZW5zLCBTcGFyc2VNdWx0aWxpbmVUb2tlbnNdIHtcblx0XHQvLyBzcGxpdCB0b2tlbnMgdG8gdHdvOlxuXHRcdC8vIGEpIGFsbCB0aGUgdG9rZW5zIGJlZm9yZSBgcmFuZ2VgXG5cdFx0Ly8gYikgYWxsIHRoZSB0b2tlbnMgYWZ0ZXIgYHJhbmdlYFxuXHRcdGNvbnN0IHN0YXJ0TGluZUluZGV4ID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZExpbmVJbmRleCA9IHJhbmdlLmVuZExpbmVOdW1iZXIgLSB0aGlzLl9zdGFydExpbmVOdW1iZXI7XG5cblx0XHRjb25zdCBbYSwgYiwgYkRlbHRhTGluZV0gPSB0aGlzLl90b2tlbnMuc3BsaXQoc3RhcnRMaW5lSW5kZXgsIHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgZW5kTGluZUluZGV4LCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRyZXR1cm4gW25ldyBTcGFyc2VNdWx0aWxpbmVUb2tlbnModGhpcy5fc3RhcnRMaW5lTnVtYmVyLCBhKSwgbmV3IFNwYXJzZU11bHRpbGluZVRva2Vucyh0aGlzLl9zdGFydExpbmVOdW1iZXIgKyBiRGVsdGFMaW5lLCBiKV07XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlFZGl0KHJhbmdlOiBJUmFuZ2UsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IFtlb2xDb3VudCwgZmlyc3RMaW5lTGVuZ3RoLCBsYXN0TGluZUxlbmd0aF0gPSBjb3VudEVPTCh0ZXh0KTtcblx0XHR0aGlzLmFjY2VwdEVkaXQocmFuZ2UsIGVvbENvdW50LCBmaXJzdExpbmVMZW5ndGgsIGxhc3RMaW5lTGVuZ3RoLCB0ZXh0Lmxlbmd0aCA+IDAgPyB0ZXh0LmNoYXJDb2RlQXQoMCkgOiBDaGFyQ29kZS5OdWxsKTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRFZGl0KHJhbmdlOiBJUmFuZ2UsIGVvbENvdW50OiBudW1iZXIsIGZpcnN0TGluZUxlbmd0aDogbnVtYmVyLCBsYXN0TGluZUxlbmd0aDogbnVtYmVyLCBmaXJzdENoYXJDb2RlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2NlcHREZWxldGVSYW5nZShyYW5nZSk7XG5cdFx0dGhpcy5fYWNjZXB0SW5zZXJ0VGV4dChuZXcgUG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiksIGVvbENvdW50LCBmaXJzdExpbmVMZW5ndGgsIGxhc3RMaW5lTGVuZ3RoLCBmaXJzdENoYXJDb2RlKTtcblx0XHR0aGlzLl91cGRhdGVFbmRMaW5lTnVtYmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9hY2NlcHREZWxldGVSYW5nZShyYW5nZTogSVJhbmdlKTogdm9pZCB7XG5cdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlciAmJiByYW5nZS5zdGFydENvbHVtbiA9PT0gcmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGRlbGV0ZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpcnN0TGluZUluZGV4ID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGxhc3RMaW5lSW5kZXggPSByYW5nZS5lbmRMaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0aWYgKGxhc3RMaW5lSW5kZXggPCAwKSB7XG5cdFx0XHQvLyB0aGlzIGRlbGV0aW9uIG9jY3VycyBlbnRpcmVseSBiZWZvcmUgdGhpcyBibG9jaywgc28gd2Ugb25seSBuZWVkIHRvIGFkanVzdCBsaW5lIG51bWJlcnNcblx0XHRcdGNvbnN0IGRlbGV0ZWRMaW5lc0NvdW50ID0gbGFzdExpbmVJbmRleCAtIGZpcnN0TGluZUluZGV4O1xuXHRcdFx0dGhpcy5fc3RhcnRMaW5lTnVtYmVyIC09IGRlbGV0ZWRMaW5lc0NvdW50O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuTWF4RGVsdGFMaW5lID0gdGhpcy5fdG9rZW5zLmdldE1heERlbHRhTGluZSgpO1xuXG5cdFx0aWYgKGZpcnN0TGluZUluZGV4ID49IHRva2VuTWF4RGVsdGFMaW5lICsgMSkge1xuXHRcdFx0Ly8gdGhpcyBkZWxldGlvbiBvY2N1cnMgZW50aXJlbHkgYWZ0ZXIgdGhpcyBibG9jaywgc28gdGhlcmUgaXMgbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChmaXJzdExpbmVJbmRleCA8IDAgJiYgbGFzdExpbmVJbmRleCA+PSB0b2tlbk1heERlbHRhTGluZSArIDEpIHtcblx0XHRcdC8vIHRoaXMgZGVsZXRpb24gY29tcGxldGVseSBlbmNvbXBhc3NlcyB0aGlzIGJsb2NrXG5cdFx0XHR0aGlzLl9zdGFydExpbmVOdW1iZXIgPSAwO1xuXHRcdFx0dGhpcy5fdG9rZW5zLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGZpcnN0TGluZUluZGV4IDwgMCkge1xuXHRcdFx0Y29uc3QgZGVsZXRlZEJlZm9yZSA9IC1maXJzdExpbmVJbmRleDtcblx0XHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciAtPSBkZWxldGVkQmVmb3JlO1xuXG5cdFx0XHR0aGlzLl90b2tlbnMuYWNjZXB0RGVsZXRlUmFuZ2UocmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCAwLCAwLCBsYXN0TGluZUluZGV4LCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9rZW5zLmFjY2VwdERlbGV0ZVJhbmdlKDAsIGZpcnN0TGluZUluZGV4LCByYW5nZS5zdGFydENvbHVtbiAtIDEsIGxhc3RMaW5lSW5kZXgsIHJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdEluc2VydFRleHQocG9zaXRpb246IFBvc2l0aW9uLCBlb2xDb3VudDogbnVtYmVyLCBmaXJzdExpbmVMZW5ndGg6IG51bWJlciwgbGFzdExpbmVMZW5ndGg6IG51bWJlciwgZmlyc3RDaGFyQ29kZTogbnVtYmVyKTogdm9pZCB7XG5cblx0XHRpZiAoZW9sQ291bnQgPT09IDAgJiYgZmlyc3RMaW5lTGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGluc2VydFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVJbmRleCA9IHBvc2l0aW9uLmxpbmVOdW1iZXIgLSB0aGlzLl9zdGFydExpbmVOdW1iZXI7XG5cblx0XHRpZiAobGluZUluZGV4IDwgMCkge1xuXHRcdFx0Ly8gdGhpcyBpbnNlcnRpb24gb2NjdXJzIGJlZm9yZSB0aGlzIGJsb2NrLCBzbyB3ZSBvbmx5IG5lZWQgdG8gYWRqdXN0IGxpbmUgbnVtYmVyc1xuXHRcdFx0dGhpcy5fc3RhcnRMaW5lTnVtYmVyICs9IGVvbENvdW50O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuTWF4RGVsdGFMaW5lID0gdGhpcy5fdG9rZW5zLmdldE1heERlbHRhTGluZSgpO1xuXG5cdFx0aWYgKGxpbmVJbmRleCA+PSB0b2tlbk1heERlbHRhTGluZSArIDEpIHtcblx0XHRcdC8vIHRoaXMgaW5zZXJ0aW9uIG9jY3VycyBhZnRlciB0aGlzIGJsb2NrLCBzbyB0aGVyZSBpcyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG9rZW5zLmFjY2VwdEluc2VydFRleHQobGluZUluZGV4LCBwb3NpdGlvbi5jb2x1bW4gLSAxLCBlb2xDb3VudCwgZmlyc3RMaW5lTGVuZ3RoLCBsYXN0TGluZUxlbmd0aCwgZmlyc3RDaGFyQ29kZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVwb3J0SWZJbnZhbGlkKG1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9rZW5zLnJlcG9ydElmSW52YWxpZChtb2RlbCwgdGhpcy5fc3RhcnRMaW5lTnVtYmVyKTtcblx0fVxufVxuXG5jbGFzcyBTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlIHtcblx0LyoqXG5cdCAqIFRoZSBlbmNvZGluZyBvZiB0b2tlbnMgaXM6XG5cdCAqICA0KmkgICAgZGVsdGFMaW5lIChmcm9tIGBzdGFydExpbmVOdW1iZXJgKVxuXHQgKiAgNCppKzEgIHN0YXJ0Q2hhcmFjdGVyIChmcm9tIHRoZSBsaW5lIHN0YXJ0KVxuXHQgKiAgNCppKzIgIGVuZENoYXJhY3RlciAoZnJvbSB0aGUgbGluZSBzdGFydClcblx0ICogIDQqaSszICBtZXRhZGF0YVxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5zOiBVaW50MzJBcnJheTtcblx0cHJpdmF0ZSBfdG9rZW5Db3VudDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHRva2VuczogVWludDMyQXJyYXkpIHtcblx0XHR0aGlzLl90b2tlbnMgPSB0b2tlbnM7XG5cdFx0dGhpcy5fdG9rZW5Db3VudCA9IHRva2Vucy5sZW5ndGggLyA0O1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBwaWVjZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl90b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdHBpZWNlcy5wdXNoKGAoJHt0aGlzLl9nZXREZWx0YUxpbmUoaSkgKyBzdGFydExpbmVOdW1iZXJ9LCR7dGhpcy5fZ2V0U3RhcnRDaGFyYWN0ZXIoaSl9LSR7dGhpcy5fZ2V0RW5kQ2hhcmFjdGVyKGkpfSlgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGBbJHtwaWVjZXMuam9pbignLCcpfV1gO1xuXHR9XG5cblx0cHVibGljIGdldE1heERlbHRhTGluZSgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHRva2VuQ291bnQgPSB0aGlzLl9nZXRUb2tlbkNvdW50KCk7XG5cdFx0aWYgKHRva2VuQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dldERlbHRhTGluZSh0b2tlbkNvdW50IC0gMSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmFuZ2UoKTogUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCB0b2tlbkNvdW50ID0gdGhpcy5fZ2V0VG9rZW5Db3VudCgpO1xuXHRcdGlmICh0b2tlbkNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnRDaGFyID0gdGhpcy5fZ2V0U3RhcnRDaGFyYWN0ZXIoMCk7XG5cdFx0Y29uc3QgbWF4RGVsdGFMaW5lID0gdGhpcy5fZ2V0RGVsdGFMaW5lKHRva2VuQ291bnQgLSAxKTtcblx0XHRjb25zdCBlbmRDaGFyID0gdGhpcy5fZ2V0RW5kQ2hhcmFjdGVyKHRva2VuQ291bnQgLSAxKTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKDAsIHN0YXJ0Q2hhciArIDEsIG1heERlbHRhTGluZSwgZW5kQ2hhciArIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VG9rZW5Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbkNvdW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVsdGFMaW5lKHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2Vuc1s0ICogdG9rZW5JbmRleF07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdGFydENoYXJhY3Rlcih0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbNCAqIHRva2VuSW5kZXggKyAxXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVuZENoYXJhY3Rlcih0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbNCAqIHRva2VuSW5kZXggKyAyXTtcblx0fVxuXG5cdHB1YmxpYyBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5fZ2V0VG9rZW5Db3VudCgpID09PSAwKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lVG9rZW5zKGRlbHRhTGluZTogbnVtYmVyKTogU3BhcnNlTGluZVRva2VucyB8IG51bGwge1xuXHRcdGxldCBsb3cgPSAwO1xuXHRcdGxldCBoaWdoID0gdGhpcy5fZ2V0VG9rZW5Db3VudCgpIC0gMTtcblxuXHRcdHdoaWxlIChsb3cgPCBoaWdoKSB7XG5cdFx0XHRjb25zdCBtaWQgPSBsb3cgKyBNYXRoLmZsb29yKChoaWdoIC0gbG93KSAvIDIpO1xuXHRcdFx0Y29uc3QgbWlkRGVsdGFMaW5lID0gdGhpcy5fZ2V0RGVsdGFMaW5lKG1pZCk7XG5cblx0XHRcdGlmIChtaWREZWx0YUxpbmUgPCBkZWx0YUxpbmUpIHtcblx0XHRcdFx0bG93ID0gbWlkICsgMTtcblx0XHRcdH0gZWxzZSBpZiAobWlkRGVsdGFMaW5lID4gZGVsdGFMaW5lKSB7XG5cdFx0XHRcdGhpZ2ggPSBtaWQgLSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG1pbiA9IG1pZDtcblx0XHRcdFx0d2hpbGUgKG1pbiA+IGxvdyAmJiB0aGlzLl9nZXREZWx0YUxpbmUobWluIC0gMSkgPT09IGRlbHRhTGluZSkge1xuXHRcdFx0XHRcdG1pbi0tO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBtYXggPSBtaWQ7XG5cdFx0XHRcdHdoaWxlIChtYXggPCBoaWdoICYmIHRoaXMuX2dldERlbHRhTGluZShtYXggKyAxKSA9PT0gZGVsdGFMaW5lKSB7XG5cdFx0XHRcdFx0bWF4Kys7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBTcGFyc2VMaW5lVG9rZW5zKHRoaXMuX3Rva2Vucy5zdWJhcnJheSg0ICogbWluLCA0ICogbWF4ICsgNCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9nZXREZWx0YUxpbmUobG93KSA9PT0gZGVsdGFMaW5lKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNwYXJzZUxpbmVUb2tlbnModGhpcy5fdG9rZW5zLnN1YmFycmF5KDQgKiBsb3csIDQgKiBsb3cgKyA0KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9rZW5Db3VudCA9IDA7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlVG9rZW5zKHN0YXJ0RGVsdGFMaW5lOiBudW1iZXIsIHN0YXJ0Q2hhcjogbnVtYmVyLCBlbmREZWx0YUxpbmU6IG51bWJlciwgZW5kQ2hhcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLl90b2tlbnM7XG5cdFx0Y29uc3QgdG9rZW5Db3VudCA9IHRoaXMuX3Rva2VuQ291bnQ7XG5cdFx0bGV0IG5ld1Rva2VuQ291bnQgPSAwO1xuXHRcdGxldCBoYXNEZWxldGVkVG9rZW5zID0gZmFsc2U7XG5cdFx0bGV0IGZpcnN0RGVsdGFMaW5lID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2VuQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgc3JjT2Zmc2V0ID0gNCAqIGk7XG5cdFx0XHRjb25zdCB0b2tlbkRlbHRhTGluZSA9IHRva2Vuc1tzcmNPZmZzZXRdO1xuXHRcdFx0Y29uc3QgdG9rZW5TdGFydENoYXJhY3RlciA9IHRva2Vuc1tzcmNPZmZzZXQgKyAxXTtcblx0XHRcdGNvbnN0IHRva2VuRW5kQ2hhcmFjdGVyID0gdG9rZW5zW3NyY09mZnNldCArIDJdO1xuXHRcdFx0Y29uc3QgdG9rZW5NZXRhZGF0YSA9IHRva2Vuc1tzcmNPZmZzZXQgKyAzXTtcblxuXHRcdFx0aWYgKFxuXHRcdFx0XHQodG9rZW5EZWx0YUxpbmUgPiBzdGFydERlbHRhTGluZSB8fCAodG9rZW5EZWx0YUxpbmUgPT09IHN0YXJ0RGVsdGFMaW5lICYmIHRva2VuRW5kQ2hhcmFjdGVyID49IHN0YXJ0Q2hhcikpXG5cdFx0XHRcdCYmICh0b2tlbkRlbHRhTGluZSA8IGVuZERlbHRhTGluZSB8fCAodG9rZW5EZWx0YUxpbmUgPT09IGVuZERlbHRhTGluZSAmJiB0b2tlblN0YXJ0Q2hhcmFjdGVyIDw9IGVuZENoYXIpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGhhc0RlbGV0ZWRUb2tlbnMgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKG5ld1Rva2VuQ291bnQgPT09IDApIHtcblx0XHRcdFx0XHRmaXJzdERlbHRhTGluZSA9IHRva2VuRGVsdGFMaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNEZWxldGVkVG9rZW5zKSB7XG5cdFx0XHRcdFx0Ly8gbXVzdCBtb3ZlIHRoZSB0b2tlbiB0byB0aGUgbGVmdFxuXHRcdFx0XHRcdGNvbnN0IGRlc3RPZmZzZXQgPSA0ICogbmV3VG9rZW5Db3VudDtcblx0XHRcdFx0XHR0b2tlbnNbZGVzdE9mZnNldF0gPSB0b2tlbkRlbHRhTGluZSAtIGZpcnN0RGVsdGFMaW5lO1xuXHRcdFx0XHRcdHRva2Vuc1tkZXN0T2Zmc2V0ICsgMV0gPSB0b2tlblN0YXJ0Q2hhcmFjdGVyO1xuXHRcdFx0XHRcdHRva2Vuc1tkZXN0T2Zmc2V0ICsgMl0gPSB0b2tlbkVuZENoYXJhY3Rlcjtcblx0XHRcdFx0XHR0b2tlbnNbZGVzdE9mZnNldCArIDNdID0gdG9rZW5NZXRhZGF0YTtcblx0XHRcdFx0fSBlbHNlIGlmIChmaXJzdERlbHRhTGluZSAhPT0gMCkge1xuXHRcdFx0XHRcdC8vIG11c3QgYWRqdXN0IHRoZSBkZWx0YSBsaW5lIGluIHBsYWNlXG5cdFx0XHRcdFx0dG9rZW5zW3NyY09mZnNldF0gPSB0b2tlbkRlbHRhTGluZSAtIGZpcnN0RGVsdGFMaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5ld1Rva2VuQ291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl90b2tlbkNvdW50ID0gbmV3VG9rZW5Db3VudDtcblxuXHRcdHJldHVybiBmaXJzdERlbHRhTGluZTtcblx0fVxuXG5cdHB1YmxpYyBzcGxpdChzdGFydERlbHRhTGluZTogbnVtYmVyLCBzdGFydENoYXI6IG51bWJlciwgZW5kRGVsdGFMaW5lOiBudW1iZXIsIGVuZENoYXI6IG51bWJlcik6IFtTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlLCBTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlLCBudW1iZXJdIHtcblx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLl90b2tlbnM7XG5cdFx0Y29uc3QgdG9rZW5Db3VudCA9IHRoaXMuX3Rva2VuQ291bnQ7XG5cdFx0Y29uc3QgYVRva2VuczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBiVG9rZW5zOiBudW1iZXJbXSA9IFtdO1xuXHRcdGxldCBkZXN0VG9rZW5zOiBudW1iZXJbXSA9IGFUb2tlbnM7XG5cdFx0bGV0IGRlc3RPZmZzZXQgPSAwO1xuXHRcdGxldCBkZXN0Rmlyc3REZWx0YUxpbmU6IG51bWJlciA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHNyY09mZnNldCA9IDQgKiBpO1xuXHRcdFx0Y29uc3QgdG9rZW5EZWx0YUxpbmUgPSB0b2tlbnNbc3JjT2Zmc2V0XTtcblx0XHRcdGNvbnN0IHRva2VuU3RhcnRDaGFyYWN0ZXIgPSB0b2tlbnNbc3JjT2Zmc2V0ICsgMV07XG5cdFx0XHRjb25zdCB0b2tlbkVuZENoYXJhY3RlciA9IHRva2Vuc1tzcmNPZmZzZXQgKyAyXTtcblx0XHRcdGNvbnN0IHRva2VuTWV0YWRhdGEgPSB0b2tlbnNbc3JjT2Zmc2V0ICsgM107XG5cblx0XHRcdGlmICgodG9rZW5EZWx0YUxpbmUgPiBzdGFydERlbHRhTGluZSB8fCAodG9rZW5EZWx0YUxpbmUgPT09IHN0YXJ0RGVsdGFMaW5lICYmIHRva2VuRW5kQ2hhcmFjdGVyID49IHN0YXJ0Q2hhcikpKSB7XG5cdFx0XHRcdGlmICgodG9rZW5EZWx0YUxpbmUgPCBlbmREZWx0YUxpbmUgfHwgKHRva2VuRGVsdGFMaW5lID09PSBlbmREZWx0YUxpbmUgJiYgdG9rZW5TdGFydENoYXJhY3RlciA8PSBlbmRDaGFyKSkpIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIGlzIHRvdWNoaW5nIHRoZSByYW5nZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gaXMgYWZ0ZXIgdGhlIHJhbmdlXG5cdFx0XHRcdFx0aWYgKGRlc3RUb2tlbnMgIT09IGJUb2tlbnMpIHtcblx0XHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gaXMgdGhlIGZpcnN0IHRva2VuIGFmdGVyIHRoZSByYW5nZVxuXHRcdFx0XHRcdFx0ZGVzdFRva2VucyA9IGJUb2tlbnM7XG5cdFx0XHRcdFx0XHRkZXN0T2Zmc2V0ID0gMDtcblx0XHRcdFx0XHRcdGRlc3RGaXJzdERlbHRhTGluZSA9IHRva2VuRGVsdGFMaW5lO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRkZXN0VG9rZW5zW2Rlc3RPZmZzZXQrK10gPSB0b2tlbkRlbHRhTGluZSAtIGRlc3RGaXJzdERlbHRhTGluZTtcblx0XHRcdGRlc3RUb2tlbnNbZGVzdE9mZnNldCsrXSA9IHRva2VuU3RhcnRDaGFyYWN0ZXI7XG5cdFx0XHRkZXN0VG9rZW5zW2Rlc3RPZmZzZXQrK10gPSB0b2tlbkVuZENoYXJhY3Rlcjtcblx0XHRcdGRlc3RUb2tlbnNbZGVzdE9mZnNldCsrXSA9IHRva2VuTWV0YWRhdGE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtuZXcgU3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZShuZXcgVWludDMyQXJyYXkoYVRva2VucykpLCBuZXcgU3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZShuZXcgVWludDMyQXJyYXkoYlRva2VucykpLCBkZXN0Rmlyc3REZWx0YUxpbmVdO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdERlbGV0ZVJhbmdlKGhvcml6b250YWxTaGlmdEZvckZpcnN0TGluZVRva2VuczogbnVtYmVyLCBzdGFydERlbHRhTGluZTogbnVtYmVyLCBzdGFydENoYXJhY3RlcjogbnVtYmVyLCBlbmREZWx0YUxpbmU6IG51bWJlciwgZW5kQ2hhcmFjdGVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBUaGlzIGlzIGEgYml0IGNvbXBsZXgsIGhlcmUgYXJlIHRoZSBjYXNlcyBJIHVzZWQgdG8gdGhpbmsgYWJvdXQgdGhpczpcblx0XHQvL1xuXHRcdC8vIDEuIFRoZSB0b2tlbiBzdGFydHMgYmVmb3JlIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdC8vIDFhLiBUaGUgdG9rZW4gaXMgY29tcGxldGVseSBiZWZvcmUgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0Ly8gICAgICAgICAgICAgICAtLS0tLS0tLS0tLVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgICB4eHh4eHh4eHh4eFxuXHRcdC8vIDFiLiBUaGUgdG9rZW4gc3RhcnRzIGJlZm9yZSwgdGhlIGRlbGV0aW9uIHJhbmdlIGVuZHMgYWZ0ZXIgdGhlIHRva2VuXG5cdFx0Ly8gICAgICAgICAgICAgICAtLS0tLS0tLS0tLVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgIHh4eHh4eHh4eHh4XG5cdFx0Ly8gMWMuIFRoZSB0b2tlbiBzdGFydHMgYmVmb3JlLCB0aGUgZGVsZXRpb24gcmFuZ2UgZW5kcyBwcmVjaXNlbHkgd2l0aCB0aGUgdG9rZW5cblx0XHQvLyAgICAgICAgICAgICAgIC0tLS0tLS0tLS0tLS0tLVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgIHh4eHh4eHh4XG5cdFx0Ly8gMWQuIFRoZSB0b2tlbiBzdGFydHMgYmVmb3JlLCB0aGUgZGVsZXRpb24gcmFuZ2UgaXMgaW5zaWRlIHRoZSB0b2tlblxuXHRcdC8vICAgICAgICAgICAgICAgLS0tLS0tLS0tLS0tLS0tXG5cdFx0Ly8gICAgICAgICAgICAgICAgICAgIHh4eHh4XG5cdFx0Ly9cblx0XHQvLyAyLiBUaGUgdG9rZW4gc3RhcnRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uIHdpdGggdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0Ly8gMmEuIFRoZSB0b2tlbiBzdGFydHMgYXQgdGhlIHNhbWUgcG9zaXRpb24sIGFuZCBlbmRzIGluc2lkZSB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAgICAgICAgICAgICAgIC0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICAgIHh4eHh4eHh4eHh4XG5cdFx0Ly8gMmIuIFRoZSB0b2tlbiBzdGFydHMgYXQgdGhlIHNhbWUgcG9zaXRpb24sIGFuZCBlbmRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uIGFzIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdC8vICAgICAgICAgICAgICAgLS0tLS0tLS0tLVxuXHRcdC8vICAgICAgICAgICAgICAgeHh4eHh4eHh4eFxuXHRcdC8vIDJjLiBUaGUgdG9rZW4gc3RhcnRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uLCBhbmQgZW5kcyBhZnRlciB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAgICAgICAgICAgICAgIC0tLS0tLS0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICAgIHh4eHh4eHhcblx0XHQvL1xuXHRcdC8vIDMuIFRoZSB0b2tlbiBzdGFydHMgaW5zaWRlIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdC8vIDNhLiBUaGUgdG9rZW4gaXMgaW5zaWRlIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdC8vICAgICAgICAgICAgICAgIC0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICB4eHh4eHh4eHh4eHh4XG5cdFx0Ly8gM2IuIFRoZSB0b2tlbiBzdGFydHMgaW5zaWRlIHRoZSBkZWxldGlvbiByYW5nZSwgYW5kIGVuZHMgYXQgdGhlIHNhbWUgcG9zaXRpb24gYXMgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0Ly8gICAgICAgICAgICAgICAgLS0tLS0tLS0tLVxuXHRcdC8vICAgICAgICAgICAgIHh4eHh4eHh4eHh4eHhcblx0XHQvLyAzYy4gVGhlIHRva2VuIHN0YXJ0cyBpbnNpZGUgdGhlIGRlbGV0aW9uIHJhbmdlLCBhbmQgZW5kcyBhZnRlciB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAgICAgICAgICAgICAgICAtLS0tLS0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICB4eHh4eHh4eHh4eFxuXHRcdC8vXG5cdFx0Ly8gNC4gVGhlIHRva2VuIHN0YXJ0cyBhZnRlciB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAgICAgICAgICAgICAgICAgIC0tLS0tLS0tLS0tXG5cdFx0Ly8gICAgICAgICAgeHh4eHh4eHhcblx0XHQvL1xuXHRcdGNvbnN0IHRva2VucyA9IHRoaXMuX3Rva2Vucztcblx0XHRjb25zdCB0b2tlbkNvdW50ID0gdGhpcy5fdG9rZW5Db3VudDtcblx0XHRjb25zdCBkZWxldGVkTGluZUNvdW50ID0gKGVuZERlbHRhTGluZSAtIHN0YXJ0RGVsdGFMaW5lKTtcblx0XHRsZXQgbmV3VG9rZW5Db3VudCA9IDA7XG5cdFx0bGV0IGhhc0RlbGV0ZWRUb2tlbnMgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2VuQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgc3JjT2Zmc2V0ID0gNCAqIGk7XG5cdFx0XHRsZXQgdG9rZW5EZWx0YUxpbmUgPSB0b2tlbnNbc3JjT2Zmc2V0XTtcblx0XHRcdGxldCB0b2tlblN0YXJ0Q2hhcmFjdGVyID0gdG9rZW5zW3NyY09mZnNldCArIDFdO1xuXHRcdFx0bGV0IHRva2VuRW5kQ2hhcmFjdGVyID0gdG9rZW5zW3NyY09mZnNldCArIDJdO1xuXHRcdFx0Y29uc3QgdG9rZW5NZXRhZGF0YSA9IHRva2Vuc1tzcmNPZmZzZXQgKyAzXTtcblxuXHRcdFx0aWYgKHRva2VuRGVsdGFMaW5lIDwgc3RhcnREZWx0YUxpbmUgfHwgKHRva2VuRGVsdGFMaW5lID09PSBzdGFydERlbHRhTGluZSAmJiB0b2tlbkVuZENoYXJhY3RlciA8PSBzdGFydENoYXJhY3RlcikpIHtcblx0XHRcdFx0Ly8gMWEuIFRoZSB0b2tlbiBpcyBjb21wbGV0ZWx5IGJlZm9yZSB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHRcdFx0Ly8gPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRuZXdUb2tlbkNvdW50Kys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmICh0b2tlbkRlbHRhTGluZSA9PT0gc3RhcnREZWx0YUxpbmUgJiYgdG9rZW5TdGFydENoYXJhY3RlciA8IHN0YXJ0Q2hhcmFjdGVyKSB7XG5cdFx0XHRcdC8vIDFiLCAxYywgMWRcblx0XHRcdFx0Ly8gPT4gdGhlIHRva2VuIHN1cnZpdmVzLCBidXQgaXQgbmVlZHMgdG8gc2hyaW5rXG5cdFx0XHRcdGlmICh0b2tlbkRlbHRhTGluZSA9PT0gZW5kRGVsdGFMaW5lICYmIHRva2VuRW5kQ2hhcmFjdGVyID4gZW5kQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdFx0Ly8gMWQuIFRoZSB0b2tlbiBzdGFydHMgYmVmb3JlLCB0aGUgZGVsZXRpb24gcmFuZ2UgaXMgaW5zaWRlIHRoZSB0b2tlblxuXHRcdFx0XHRcdC8vID0+IHRoZSB0b2tlbiBzaHJpbmtzIGJ5IHRoZSBkZWxldGlvbiBjaGFyYWN0ZXIgY291bnRcblx0XHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciAtPSAoZW5kQ2hhcmFjdGVyIC0gc3RhcnRDaGFyYWN0ZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIDFiLiBUaGUgdG9rZW4gc3RhcnRzIGJlZm9yZSwgdGhlIGRlbGV0aW9uIHJhbmdlIGVuZHMgYWZ0ZXIgdGhlIHRva2VuXG5cdFx0XHRcdFx0Ly8gMWMuIFRoZSB0b2tlbiBzdGFydHMgYmVmb3JlLCB0aGUgZGVsZXRpb24gcmFuZ2UgZW5kcyBwcmVjaXNlbHkgd2l0aCB0aGUgdG9rZW5cblx0XHRcdFx0XHQvLyA9PiB0aGUgdG9rZW4gc2hyaW5rcyBpdHMgZW5kaW5nIHRvIHRoZSBkZWxldGlvbiBzdGFydFxuXHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyID0gc3RhcnRDaGFyYWN0ZXI7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodG9rZW5EZWx0YUxpbmUgPT09IHN0YXJ0RGVsdGFMaW5lICYmIHRva2VuU3RhcnRDaGFyYWN0ZXIgPT09IHN0YXJ0Q2hhcmFjdGVyKSB7XG5cdFx0XHRcdC8vIDJhLCAyYiwgMmNcblx0XHRcdFx0aWYgKHRva2VuRGVsdGFMaW5lID09PSBlbmREZWx0YUxpbmUgJiYgdG9rZW5FbmRDaGFyYWN0ZXIgPiBlbmRDaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHQvLyAyYy4gVGhlIHRva2VuIHN0YXJ0cyBhdCB0aGUgc2FtZSBwb3NpdGlvbiwgYW5kIGVuZHMgYWZ0ZXIgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0XHRcdFx0Ly8gPT4gdGhlIHRva2VuIHNocmlua3MgYnkgdGhlIGRlbGV0aW9uIGNoYXJhY3RlciBjb3VudFxuXHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyIC09IChlbmRDaGFyYWN0ZXIgLSBzdGFydENoYXJhY3Rlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gMmEuIFRoZSB0b2tlbiBzdGFydHMgYXQgdGhlIHNhbWUgcG9zaXRpb24sIGFuZCBlbmRzIGluc2lkZSB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHRcdFx0XHQvLyAyYi4gVGhlIHRva2VuIHN0YXJ0cyBhdCB0aGUgc2FtZSBwb3NpdGlvbiwgYW5kIGVuZHMgYXQgdGhlIHNhbWUgcG9zaXRpb24gYXMgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0XHRcdFx0Ly8gPT4gdGhlIHRva2VuIGlzIGRlbGV0ZWRcblx0XHRcdFx0XHRoYXNEZWxldGVkVG9rZW5zID0gdHJ1ZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0b2tlbkRlbHRhTGluZSA8IGVuZERlbHRhTGluZSB8fCAodG9rZW5EZWx0YUxpbmUgPT09IGVuZERlbHRhTGluZSAmJiB0b2tlblN0YXJ0Q2hhcmFjdGVyIDwgZW5kQ2hhcmFjdGVyKSkge1xuXHRcdFx0XHQvLyAzYSwgM2IsIDNjXG5cdFx0XHRcdGlmICh0b2tlbkRlbHRhTGluZSA9PT0gZW5kRGVsdGFMaW5lICYmIHRva2VuRW5kQ2hhcmFjdGVyID4gZW5kQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdFx0Ly8gM2MuIFRoZSB0b2tlbiBzdGFydHMgaW5zaWRlIHRoZSBkZWxldGlvbiByYW5nZSwgYW5kIGVuZHMgYWZ0ZXIgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0XHRcdFx0Ly8gPT4gdGhlIHRva2VuIG1vdmVzIHRvIGNvbnRpbnVlIHJpZ2h0IGFmdGVyIHRoZSBkZWxldGlvblxuXHRcdFx0XHRcdHRva2VuRGVsdGFMaW5lID0gc3RhcnREZWx0YUxpbmU7XG5cdFx0XHRcdFx0dG9rZW5TdGFydENoYXJhY3RlciA9IHN0YXJ0Q2hhcmFjdGVyO1xuXHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyID0gdG9rZW5TdGFydENoYXJhY3RlciArICh0b2tlbkVuZENoYXJhY3RlciAtIGVuZENoYXJhY3Rlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gM2EuIFRoZSB0b2tlbiBpcyBpbnNpZGUgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0XHRcdFx0Ly8gM2IuIFRoZSB0b2tlbiBzdGFydHMgaW5zaWRlIHRoZSBkZWxldGlvbiByYW5nZSwgYW5kIGVuZHMgYXQgdGhlIHNhbWUgcG9zaXRpb24gYXMgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0XHRcdFx0Ly8gPT4gdGhlIHRva2VuIGlzIGRlbGV0ZWRcblx0XHRcdFx0XHRoYXNEZWxldGVkVG9rZW5zID0gdHJ1ZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0b2tlbkRlbHRhTGluZSA+IGVuZERlbHRhTGluZSkge1xuXHRcdFx0XHQvLyA0LiAocGFydGlhbCkgVGhlIHRva2VuIHN0YXJ0cyBhZnRlciB0aGUgZGVsZXRpb24gcmFuZ2UsIG9uIGEgbGluZSBiZWxvdy4uLlxuXHRcdFx0XHRpZiAoZGVsZXRlZExpbmVDb3VudCA9PT0gMCAmJiAhaGFzRGVsZXRlZFRva2Vucykge1xuXHRcdFx0XHRcdC8vIGVhcmx5IHN0b3AsIHRoZXJlIGlzIG5vIG5lZWQgdG8gd2FsayBhbGwgdGhlIHRva2VucyBhbmQgZG8gbm90aGluZy4uLlxuXHRcdFx0XHRcdG5ld1Rva2VuQ291bnQgPSB0b2tlbkNvdW50O1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRva2VuRGVsdGFMaW5lIC09IGRlbGV0ZWRMaW5lQ291bnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHRva2VuRGVsdGFMaW5lID09PSBlbmREZWx0YUxpbmUgJiYgdG9rZW5TdGFydENoYXJhY3RlciA+PSBlbmRDaGFyYWN0ZXIpIHtcblx0XHRcdFx0Ly8gNC4gKGNvbnRpbnVlZCkgVGhlIHRva2VuIHN0YXJ0cyBhZnRlciB0aGUgZGVsZXRpb24gcmFuZ2UsIG9uIHRoZSBsYXN0IGxpbmUgd2hlcmUgYSBkZWxldGlvbiBvY2N1cnNcblx0XHRcdFx0aWYgKGhvcml6b250YWxTaGlmdEZvckZpcnN0TGluZVRva2VucyAmJiB0b2tlbkRlbHRhTGluZSA9PT0gMCkge1xuXHRcdFx0XHRcdHRva2VuU3RhcnRDaGFyYWN0ZXIgKz0gaG9yaXpvbnRhbFNoaWZ0Rm9yRmlyc3RMaW5lVG9rZW5zO1xuXHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyICs9IGhvcml6b250YWxTaGlmdEZvckZpcnN0TGluZVRva2Vucztcblx0XHRcdFx0fVxuXHRcdFx0XHR0b2tlbkRlbHRhTGluZSAtPSBkZWxldGVkTGluZUNvdW50O1xuXHRcdFx0XHR0b2tlblN0YXJ0Q2hhcmFjdGVyIC09IChlbmRDaGFyYWN0ZXIgLSBzdGFydENoYXJhY3Rlcik7XG5cdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyIC09IChlbmRDaGFyYWN0ZXIgLSBzdGFydENoYXJhY3Rlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vdCBwb3NzaWJsZSFgKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVzdE9mZnNldCA9IDQgKiBuZXdUb2tlbkNvdW50O1xuXHRcdFx0dG9rZW5zW2Rlc3RPZmZzZXRdID0gdG9rZW5EZWx0YUxpbmU7XG5cdFx0XHR0b2tlbnNbZGVzdE9mZnNldCArIDFdID0gdG9rZW5TdGFydENoYXJhY3Rlcjtcblx0XHRcdHRva2Vuc1tkZXN0T2Zmc2V0ICsgMl0gPSB0b2tlbkVuZENoYXJhY3Rlcjtcblx0XHRcdHRva2Vuc1tkZXN0T2Zmc2V0ICsgM10gPSB0b2tlbk1ldGFkYXRhO1xuXHRcdFx0bmV3VG9rZW5Db3VudCsrO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Rva2VuQ291bnQgPSBuZXdUb2tlbkNvdW50O1xuXHR9XG5cblx0cHVibGljIGFjY2VwdEluc2VydFRleHQoZGVsdGFMaW5lOiBudW1iZXIsIGNoYXJhY3RlcjogbnVtYmVyLCBlb2xDb3VudDogbnVtYmVyLCBmaXJzdExpbmVMZW5ndGg6IG51bWJlciwgbGFzdExpbmVMZW5ndGg6IG51bWJlciwgZmlyc3RDaGFyQ29kZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gSGVyZSBhcmUgdGhlIGNhc2VzIEkgdXNlZCB0byB0aGluayBhYm91dCB0aGlzOlxuXHRcdC8vXG5cdFx0Ly8gMS4gVGhlIHRva2VuIGlzIGNvbXBsZXRlbHkgYmVmb3JlIHRoZSBpbnNlcnRpb24gcG9pbnRcblx0XHQvLyAgICAgICAgICAgIC0tLS0tLS0tLS0tICAgfFxuXHRcdC8vIDIuIFRoZSB0b2tlbiBlbmRzIHByZWNpc2VseSBhdCB0aGUgaW5zZXJ0aW9uIHBvaW50XG5cdFx0Ly8gICAgICAgICAgICAtLS0tLS0tLS0tLXxcblx0XHQvLyAzLiBUaGUgdG9rZW4gY29udGFpbnMgdGhlIGluc2VydGlvbiBwb2ludFxuXHRcdC8vICAgICAgICAgICAgLS0tLS18LS0tLS0tXG5cdFx0Ly8gNC4gVGhlIHRva2VuIHN0YXJ0cyBwcmVjaXNlbHkgYXQgdGhlIGluc2VydGlvbiBwb2ludFxuXHRcdC8vICAgICAgICAgICAgfC0tLS0tLS0tLS0tXG5cdFx0Ly8gNS4gVGhlIHRva2VuIGlzIGNvbXBsZXRlbHkgYWZ0ZXIgdGhlIGluc2VydGlvbiBwb2ludFxuXHRcdC8vICAgICAgICAgICAgfCAgIC0tLS0tLS0tLS0tXG5cdFx0Ly9cblx0XHRjb25zdCBpc0luc2VydGluZ1ByZWNpc2VseU9uZVdvcmRDaGFyYWN0ZXIgPSAoXG5cdFx0XHRlb2xDb3VudCA9PT0gMFxuXHRcdFx0JiYgZmlyc3RMaW5lTGVuZ3RoID09PSAxXG5cdFx0XHQmJiAoXG5cdFx0XHRcdChmaXJzdENoYXJDb2RlID49IENoYXJDb2RlLkRpZ2l0MCAmJiBmaXJzdENoYXJDb2RlIDw9IENoYXJDb2RlLkRpZ2l0OSlcblx0XHRcdFx0fHwgKGZpcnN0Q2hhckNvZGUgPj0gQ2hhckNvZGUuQSAmJiBmaXJzdENoYXJDb2RlIDw9IENoYXJDb2RlLlopXG5cdFx0XHRcdHx8IChmaXJzdENoYXJDb2RlID49IENoYXJDb2RlLmEgJiYgZmlyc3RDaGFyQ29kZSA8PSBDaGFyQ29kZS56KVxuXHRcdFx0KVxuXHRcdCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5fdG9rZW5zO1xuXHRcdGNvbnN0IHRva2VuQ291bnQgPSB0aGlzLl90b2tlbkNvdW50O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5Db3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSA0ICogaTtcblx0XHRcdGxldCB0b2tlbkRlbHRhTGluZSA9IHRva2Vuc1tvZmZzZXRdO1xuXHRcdFx0bGV0IHRva2VuU3RhcnRDaGFyYWN0ZXIgPSB0b2tlbnNbb2Zmc2V0ICsgMV07XG5cdFx0XHRsZXQgdG9rZW5FbmRDaGFyYWN0ZXIgPSB0b2tlbnNbb2Zmc2V0ICsgMl07XG5cblx0XHRcdGlmICh0b2tlbkRlbHRhTGluZSA8IGRlbHRhTGluZSB8fCAodG9rZW5EZWx0YUxpbmUgPT09IGRlbHRhTGluZSAmJiB0b2tlbkVuZENoYXJhY3RlciA8IGNoYXJhY3RlcikpIHtcblx0XHRcdFx0Ly8gMS4gVGhlIHRva2VuIGlzIGNvbXBsZXRlbHkgYmVmb3JlIHRoZSBpbnNlcnRpb24gcG9pbnRcblx0XHRcdFx0Ly8gPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSBpZiAodG9rZW5EZWx0YUxpbmUgPT09IGRlbHRhTGluZSAmJiB0b2tlbkVuZENoYXJhY3RlciA9PT0gY2hhcmFjdGVyKSB7XG5cdFx0XHRcdC8vIDIuIFRoZSB0b2tlbiBlbmRzIHByZWNpc2VseSBhdCB0aGUgaW5zZXJ0aW9uIHBvaW50XG5cdFx0XHRcdC8vID0+IGV4cGFuZCB0aGUgZW5kIGNoYXJhY3RlciBvbmx5IGlmIGluc2VydGluZyBwcmVjaXNlbHkgb25lIGNoYXJhY3RlciB0aGF0IGlzIGEgd29yZCBjaGFyYWN0ZXJcblx0XHRcdFx0aWYgKGlzSW5zZXJ0aW5nUHJlY2lzZWx5T25lV29yZENoYXJhY3Rlcikge1xuXHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyICs9IDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodG9rZW5EZWx0YUxpbmUgPT09IGRlbHRhTGluZSAmJiB0b2tlblN0YXJ0Q2hhcmFjdGVyIDwgY2hhcmFjdGVyICYmIGNoYXJhY3RlciA8IHRva2VuRW5kQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdC8vIDMuIFRoZSB0b2tlbiBjb250YWlucyB0aGUgaW5zZXJ0aW9uIHBvaW50XG5cdFx0XHRcdGlmIChlb2xDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vID0+IGp1c3QgZXhwYW5kIHRoZSBlbmQgY2hhcmFjdGVyXG5cdFx0XHRcdFx0dG9rZW5FbmRDaGFyYWN0ZXIgKz0gZmlyc3RMaW5lTGVuZ3RoO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vID0+IGN1dCBvZmYgdGhlIHRva2VuXG5cdFx0XHRcdFx0dG9rZW5FbmRDaGFyYWN0ZXIgPSBjaGFyYWN0ZXI7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIDQuIG9yIDUuXG5cdFx0XHRcdGlmICh0b2tlbkRlbHRhTGluZSA9PT0gZGVsdGFMaW5lICYmIHRva2VuU3RhcnRDaGFyYWN0ZXIgPT09IGNoYXJhY3Rlcikge1xuXHRcdFx0XHRcdC8vIDQuIFRoZSB0b2tlbiBzdGFydHMgcHJlY2lzZWx5IGF0IHRoZSBpbnNlcnRpb24gcG9pbnRcblx0XHRcdFx0XHQvLyA9PiBncm93IHRoZSB0b2tlbiAoYnkga2VlcGluZyBpdHMgc3RhcnQgY29uc3RhbnQpIG9ubHkgaWYgaW5zZXJ0aW5nIHByZWNpc2VseSBvbmUgY2hhcmFjdGVyIHRoYXQgaXMgYSB3b3JkIGNoYXJhY3RlclxuXHRcdFx0XHRcdC8vID0+IG90aGVyd2lzZSBiZWhhdmUgYXMgaW4gY2FzZSA1LlxuXHRcdFx0XHRcdGlmIChpc0luc2VydGluZ1ByZWNpc2VseU9uZVdvcmRDaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyA9PiB0aGUgdG9rZW4gbXVzdCBtb3ZlIGFuZCBrZWVwIGl0cyBzaXplIGNvbnN0YW50XG5cdFx0XHRcdGlmICh0b2tlbkRlbHRhTGluZSA9PT0gZGVsdGFMaW5lKSB7XG5cdFx0XHRcdFx0dG9rZW5EZWx0YUxpbmUgKz0gZW9sQ291bnQ7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBpcyBvbiB0aGUgbGluZSB3aGVyZSB0aGUgaW5zZXJ0aW9uIGlzIHRha2luZyBwbGFjZVxuXHRcdFx0XHRcdGlmIChlb2xDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dG9rZW5TdGFydENoYXJhY3RlciArPSBmaXJzdExpbmVMZW5ndGg7XG5cdFx0XHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciArPSBmaXJzdExpbmVMZW5ndGg7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VuTGVuZ3RoID0gdG9rZW5FbmRDaGFyYWN0ZXIgLSB0b2tlblN0YXJ0Q2hhcmFjdGVyO1xuXHRcdFx0XHRcdFx0dG9rZW5TdGFydENoYXJhY3RlciA9IGxhc3RMaW5lTGVuZ3RoICsgKHRva2VuU3RhcnRDaGFyYWN0ZXIgLSBjaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdFx0dG9rZW5FbmRDaGFyYWN0ZXIgPSB0b2tlblN0YXJ0Q2hhcmFjdGVyICsgdG9rZW5MZW5ndGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRva2VuRGVsdGFMaW5lICs9IGVvbENvdW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRva2Vuc1tvZmZzZXRdID0gdG9rZW5EZWx0YUxpbmU7XG5cdFx0XHR0b2tlbnNbb2Zmc2V0ICsgMV0gPSB0b2tlblN0YXJ0Q2hhcmFjdGVyO1xuXHRcdFx0dG9rZW5zW29mZnNldCArIDJdID0gdG9rZW5FbmRDaGFyYWN0ZXI7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JhdGVMaW1pdGVyID0gbmV3IFJhdGVMaW1pdGVyKDEwIC8gNjApOyAvLyBsaW1pdCB0byAxMCB0aW1lcyBwZXIgbWludXRlXG5cblx0cHVibGljIHJlcG9ydElmSW52YWxpZChtb2RlbDogSVRleHRNb2RlbCwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3Rva2VuQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX2dldERlbHRhTGluZShpKSArIHN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPCAxKSB7XG5cdFx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vuc1N0b3JhZ2UuX3JhdGVMaW1pdGVyLnJ1bklmTm90TGltaXRlZCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignSW52YWxpZCBTZW1hbnRpYyBUb2tlbnMgRGF0YSBGcm9tIEV4dGVuc2lvbjogbGluZU51bWJlciA8IDEnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVOdW1iZXIgPiBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlLl9yYXRlTGltaXRlci5ydW5JZk5vdExpbWl0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgU2VtYW50aWMgVG9rZW5zIERhdGEgRnJvbSBFeHRlbnNpb246IGxpbmVOdW1iZXIgPiBtb2RlbC5nZXRMaW5lQ291bnQoKScpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZ2V0RW5kQ2hhcmFjdGVyKGkpID4gbW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlLl9yYXRlTGltaXRlci5ydW5JZk5vdExpbWl0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgU2VtYW50aWMgVG9rZW5zIERhdGEgRnJvbSBFeHRlbnNpb246IGVuZCBjaGFyYWN0ZXIgPiBtb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BhcnNlTGluZVRva2VucyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5zOiBVaW50MzJBcnJheTtcblxuXHRjb25zdHJ1Y3Rvcih0b2tlbnM6IFVpbnQzMkFycmF5KSB7XG5cdFx0dGhpcy5fdG9rZW5zID0gdG9rZW5zO1xuXHR9XG5cblx0cHVibGljIGdldENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2Vucy5sZW5ndGggLyA0O1xuXHR9XG5cblx0cHVibGljIGdldFN0YXJ0Q2hhcmFjdGVyKHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2Vuc1s0ICogdG9rZW5JbmRleCArIDFdO1xuXHR9XG5cblx0cHVibGljIGdldEVuZENoYXJhY3Rlcih0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbNCAqIHRva2VuSW5kZXggKyAyXTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNZXRhZGF0YSh0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbNCAqIHRva2VuSW5kZXggKyAzXTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG1CQUFtQjtBQUtyQixNQUFNLHNCQUFzQjtBQUFBLEVBRWxDLE9BQWMsT0FBTyxpQkFBeUIsUUFBNEM7QUFDekYsV0FBTyxJQUFJLHNCQUFzQixpQkFBaUIsSUFBSSw2QkFBNkIsTUFBTSxDQUFDO0FBQUEsRUFDM0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLElBQVcsa0JBQTBCO0FBQ3BDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7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
