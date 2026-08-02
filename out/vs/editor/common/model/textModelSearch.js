import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { WordCharacterClass, getMapForWordSeparators } from "../core/wordCharacterClassifier.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { EndOfLinePreference, FindMatch, SearchData } from "../model.js";
const LIMIT_FIND_COUNT = 999;
class SearchParams {
  constructor(searchString, isRegex, matchCase, wordSeparators) {
    this.searchString = searchString;
    this.isRegex = isRegex;
    this.matchCase = matchCase;
    this.wordSeparators = wordSeparators;
  }
  parseSearchRequest() {
    if (this.searchString === "") {
      return null;
    }
    let multiline;
    if (this.isRegex) {
      multiline = isMultilineRegexSource(this.searchString);
    } else {
      multiline = this.searchString.indexOf("\n") >= 0;
    }
    let regex = null;
    try {
      regex = strings.createRegExp(this.searchString, this.isRegex, {
        matchCase: this.matchCase,
        wholeWord: false,
        multiline,
        global: true,
        unicode: true
      });
    } catch (err) {
      return null;
    }
    if (!regex) {
      return null;
    }
    let canUseSimpleSearch = !this.isRegex && !multiline;
    if (canUseSimpleSearch && this.searchString.toLowerCase() !== this.searchString.toUpperCase()) {
      canUseSimpleSearch = this.matchCase;
    }
    return new SearchData(regex, this.wordSeparators ? getMapForWordSeparators(this.wordSeparators, []) : null, canUseSimpleSearch ? this.searchString : null);
  }
}
function isMultilineRegexSource(searchString) {
  if (!searchString || searchString.length === 0) {
    return false;
  }
  for (let i = 0, len = searchString.length; i < len; i++) {
    const chCode = searchString.charCodeAt(i);
    if (chCode === CharCode.LineFeed) {
      return true;
    }
    if (chCode === CharCode.Backslash) {
      i++;
      if (i >= len) {
        break;
      }
      const nextChCode = searchString.charCodeAt(i);
      if (nextChCode === CharCode.n || nextChCode === CharCode.r || nextChCode === CharCode.W) {
        return true;
      }
    }
  }
  return false;
}
function createFindMatch(range, rawMatches, captureMatches) {
  if (!captureMatches) {
    return new FindMatch(range, null);
  }
  const matches = [];
  for (let i = 0, len = rawMatches.length; i < len; i++) {
    matches[i] = rawMatches[i];
  }
  return new FindMatch(range, matches);
}
class LineFeedCounter {
  constructor(text) {
    const lineFeedsOffsets = [];
    let lineFeedsOffsetsLen = 0;
    for (let i = 0, textLen = text.length; i < textLen; i++) {
      if (text.charCodeAt(i) === CharCode.LineFeed) {
        lineFeedsOffsets[lineFeedsOffsetsLen++] = i;
      }
    }
    this._lineFeedsOffsets = lineFeedsOffsets;
  }
  findLineFeedCountBeforeOffset(offset) {
    const lineFeedsOffsets = this._lineFeedsOffsets;
    let min = 0;
    let max = lineFeedsOffsets.length - 1;
    if (max === -1) {
      return 0;
    }
    if (offset <= lineFeedsOffsets[0]) {
      return 0;
    }
    while (min < max) {
      const mid = min + ((max - min) / 2 >> 0);
      if (lineFeedsOffsets[mid] >= offset) {
        max = mid - 1;
      } else {
        if (lineFeedsOffsets[mid + 1] >= offset) {
          min = mid;
          max = mid;
        } else {
          min = mid + 1;
        }
      }
    }
    return min + 1;
  }
}
class TextModelSearch {
  static findMatches(model, searchParams, searchRange, captureMatches, limitResultCount) {
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return [];
    }
    if (searchData.regex.multiline) {
      return this._doFindMatchesMultiline(model, searchRange, new Searcher(searchData.wordSeparators, searchData.regex), captureMatches, limitResultCount);
    }
    return this._doFindMatchesLineByLine(model, searchRange, searchData, captureMatches, limitResultCount);
  }
  /**
   * Multiline search always executes on the lines concatenated with \n.
   * We must therefore compensate for the count of \n in case the model is CRLF
   */
  static _getMultilineMatchRange(model, deltaOffset, text, lfCounter, matchIndex, match0) {
    let startOffset;
    let lineFeedCountBeforeMatch = 0;
    if (lfCounter) {
      lineFeedCountBeforeMatch = lfCounter.findLineFeedCountBeforeOffset(matchIndex);
      startOffset = deltaOffset + matchIndex + lineFeedCountBeforeMatch;
    } else {
      startOffset = deltaOffset + matchIndex;
    }
    let endOffset;
    if (lfCounter) {
      const lineFeedCountBeforeEndOfMatch = lfCounter.findLineFeedCountBeforeOffset(matchIndex + match0.length);
      const lineFeedCountInMatch = lineFeedCountBeforeEndOfMatch - lineFeedCountBeforeMatch;
      endOffset = startOffset + match0.length + lineFeedCountInMatch;
    } else {
      endOffset = startOffset + match0.length;
    }
    const startPosition = model.getPositionAt(startOffset);
    const endPosition = model.getPositionAt(endOffset);
    return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
  }
  static _doFindMatchesMultiline(model, searchRange, searcher, captureMatches, limitResultCount) {
    const deltaOffset = model.getOffsetAt(searchRange.getStartPosition());
    const text = model.getValueInRange(searchRange, EndOfLinePreference.LF);
    const lfCounter = model.getEOL() === "\r\n" ? new LineFeedCounter(text) : null;
    const result = [];
    let counter = 0;
    let m;
    searcher.reset(0);
    while (m = searcher.next(text)) {
      result[counter++] = createFindMatch(this._getMultilineMatchRange(model, deltaOffset, text, lfCounter, m.index, m[0]), m, captureMatches);
      if (counter >= limitResultCount) {
        return result;
      }
    }
    return result;
  }
  static _doFindMatchesLineByLine(model, searchRange, searchData, captureMatches, limitResultCount) {
    const result = [];
    let resultLen = 0;
    if (searchRange.startLineNumber === searchRange.endLineNumber) {
      const text2 = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1, searchRange.endColumn - 1);
      resultLen = this._findMatchesInLine(searchData, text2, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount);
      return result;
    }
    const text = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1);
    resultLen = this._findMatchesInLine(searchData, text, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount);
    for (let lineNumber = searchRange.startLineNumber + 1; lineNumber < searchRange.endLineNumber && resultLen < limitResultCount; lineNumber++) {
      resultLen = this._findMatchesInLine(searchData, model.getLineContent(lineNumber), lineNumber, 0, resultLen, result, captureMatches, limitResultCount);
    }
    if (resultLen < limitResultCount) {
      const text2 = model.getLineContent(searchRange.endLineNumber).substring(0, searchRange.endColumn - 1);
      resultLen = this._findMatchesInLine(searchData, text2, searchRange.endLineNumber, 0, resultLen, result, captureMatches, limitResultCount);
    }
    return result;
  }
  static _findMatchesInLine(searchData, text, lineNumber, deltaOffset, resultLen, result, captureMatches, limitResultCount) {
    const wordSeparators = searchData.wordSeparators;
    if (!captureMatches && searchData.simpleSearch) {
      const searchString = searchData.simpleSearch;
      const searchStringLen = searchString.length;
      const textLength = text.length;
      let lastMatchIndex = -searchStringLen;
      while ((lastMatchIndex = text.indexOf(searchString, lastMatchIndex + searchStringLen)) !== -1) {
        if (!wordSeparators || isValidMatch(wordSeparators, text, textLength, lastMatchIndex, searchStringLen)) {
          result[resultLen++] = new FindMatch(new Range(lineNumber, lastMatchIndex + 1 + deltaOffset, lineNumber, lastMatchIndex + 1 + searchStringLen + deltaOffset), null);
          if (resultLen >= limitResultCount) {
            return resultLen;
          }
        }
      }
      return resultLen;
    }
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    let m;
    searcher.reset(0);
    do {
      m = searcher.next(text);
      if (m) {
        result[resultLen++] = createFindMatch(new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset), m, captureMatches);
        if (resultLen >= limitResultCount) {
          return resultLen;
        }
      }
    } while (m);
    return resultLen;
  }
  static findNextMatch(model, searchParams, searchStart, captureMatches) {
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return null;
    }
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    if (searchData.regex.multiline) {
      return this._doFindNextMatchMultiline(model, searchStart, searcher, captureMatches);
    }
    return this._doFindNextMatchLineByLine(model, searchStart, searcher, captureMatches);
  }
  static _doFindNextMatchMultiline(model, searchStart, searcher, captureMatches) {
    const searchTextStart = new Position(searchStart.lineNumber, 1);
    const deltaOffset = model.getOffsetAt(searchTextStart);
    const lineCount = model.getLineCount();
    const text = model.getValueInRange(new Range(searchTextStart.lineNumber, searchTextStart.column, lineCount, model.getLineMaxColumn(lineCount)), EndOfLinePreference.LF);
    const lfCounter = model.getEOL() === "\r\n" ? new LineFeedCounter(text) : null;
    searcher.reset(searchStart.column - 1);
    const m = searcher.next(text);
    if (m) {
      return createFindMatch(
        this._getMultilineMatchRange(model, deltaOffset, text, lfCounter, m.index, m[0]),
        m,
        captureMatches
      );
    }
    if (searchStart.lineNumber !== 1 || searchStart.column !== 1) {
      return this._doFindNextMatchMultiline(model, new Position(1, 1), searcher, captureMatches);
    }
    return null;
  }
  static _doFindNextMatchLineByLine(model, searchStart, searcher, captureMatches) {
    const lineCount = model.getLineCount();
    const startLineNumber = searchStart.lineNumber;
    const text = model.getLineContent(startLineNumber);
    const r = this._findFirstMatchInLine(searcher, text, startLineNumber, searchStart.column, captureMatches);
    if (r) {
      return r;
    }
    for (let i = 1; i <= lineCount; i++) {
      const lineIndex = (startLineNumber + i - 1) % lineCount;
      const text2 = model.getLineContent(lineIndex + 1);
      const r2 = this._findFirstMatchInLine(searcher, text2, lineIndex + 1, 1, captureMatches);
      if (r2) {
        return r2;
      }
    }
    return null;
  }
  static _findFirstMatchInLine(searcher, text, lineNumber, fromColumn, captureMatches) {
    searcher.reset(fromColumn - 1);
    const m = searcher.next(text);
    if (m) {
      return createFindMatch(
        new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length),
        m,
        captureMatches
      );
    }
    return null;
  }
  static findPreviousMatch(model, searchParams, searchStart, captureMatches) {
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return null;
    }
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    if (searchData.regex.multiline) {
      return this._doFindPreviousMatchMultiline(model, searchStart, searcher, captureMatches);
    }
    return this._doFindPreviousMatchLineByLine(model, searchStart, searcher, captureMatches);
  }
  static _doFindPreviousMatchMultiline(model, searchStart, searcher, captureMatches) {
    const matches = this._doFindMatchesMultiline(model, new Range(1, 1, searchStart.lineNumber, searchStart.column), searcher, captureMatches, 10 * LIMIT_FIND_COUNT);
    if (matches.length > 0) {
      return matches[matches.length - 1];
    }
    const lineCount = model.getLineCount();
    if (searchStart.lineNumber !== lineCount || searchStart.column !== model.getLineMaxColumn(lineCount)) {
      return this._doFindPreviousMatchMultiline(model, new Position(lineCount, model.getLineMaxColumn(lineCount)), searcher, captureMatches);
    }
    return null;
  }
  static _doFindPreviousMatchLineByLine(model, searchStart, searcher, captureMatches) {
    const lineCount = model.getLineCount();
    const startLineNumber = searchStart.lineNumber;
    const text = model.getLineContent(startLineNumber).substring(0, searchStart.column - 1);
    const r = this._findLastMatchInLine(searcher, text, startLineNumber, captureMatches);
    if (r) {
      return r;
    }
    for (let i = 1; i <= lineCount; i++) {
      const lineIndex = (lineCount + startLineNumber - i - 1) % lineCount;
      const text2 = model.getLineContent(lineIndex + 1);
      const r2 = this._findLastMatchInLine(searcher, text2, lineIndex + 1, captureMatches);
      if (r2) {
        return r2;
      }
    }
    return null;
  }
  static _findLastMatchInLine(searcher, text, lineNumber, captureMatches) {
    let bestResult = null;
    let m;
    searcher.reset(0);
    while (m = searcher.next(text)) {
      bestResult = createFindMatch(new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length), m, captureMatches);
    }
    return bestResult;
  }
}
function leftIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength) {
  if (matchStartIndex === 0) {
    return true;
  }
  const charBefore = text.charCodeAt(matchStartIndex - 1);
  if (wordSeparators.get(charBefore) !== WordCharacterClass.Regular) {
    return true;
  }
  if (charBefore === CharCode.CarriageReturn || charBefore === CharCode.LineFeed) {
    return true;
  }
  if (matchLength > 0) {
    const firstCharInMatch = text.charCodeAt(matchStartIndex);
    if (wordSeparators.get(firstCharInMatch) !== WordCharacterClass.Regular) {
      return true;
    }
  }
  return false;
}
function rightIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength) {
  if (matchStartIndex + matchLength === textLength) {
    return true;
  }
  const charAfter = text.charCodeAt(matchStartIndex + matchLength);
  if (wordSeparators.get(charAfter) !== WordCharacterClass.Regular) {
    return true;
  }
  if (charAfter === CharCode.CarriageReturn || charAfter === CharCode.LineFeed) {
    return true;
  }
  if (matchLength > 0) {
    const lastCharInMatch = text.charCodeAt(matchStartIndex + matchLength - 1);
    if (wordSeparators.get(lastCharInMatch) !== WordCharacterClass.Regular) {
      return true;
    }
  }
  return false;
}
function isValidMatch(wordSeparators, text, textLength, matchStartIndex, matchLength) {
  return leftIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength) && rightIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength);
}
class Searcher {
  constructor(wordSeparators, searchRegex) {
    this._wordSeparators = wordSeparators;
    this._searchRegex = searchRegex;
    this._prevMatchStartIndex = -1;
    this._prevMatchLength = 0;
  }
  reset(lastIndex) {
    this._searchRegex.lastIndex = lastIndex;
    this._prevMatchStartIndex = -1;
    this._prevMatchLength = 0;
  }
  next(text) {
    const textLength = text.length;
    let m;
    do {
      if (this._prevMatchStartIndex + this._prevMatchLength === textLength) {
        return null;
      }
      m = this._searchRegex.exec(text);
      if (!m) {
        return null;
      }
      const matchStartIndex = m.index;
      const matchLength = m[0].length;
      if (matchStartIndex === this._prevMatchStartIndex && matchLength === this._prevMatchLength) {
        if (matchLength === 0) {
          if (strings.getNextCodePoint(text, textLength, this._searchRegex.lastIndex) > 65535) {
            this._searchRegex.lastIndex += 2;
          } else {
            this._searchRegex.lastIndex += 1;
          }
          continue;
        }
        return null;
      }
      this._prevMatchStartIndex = matchStartIndex;
      this._prevMatchLength = matchLength;
      if (!this._wordSeparators || isValidMatch(this._wordSeparators, text, textLength, matchStartIndex, matchLength)) {
        return m;
      }
    } while (m);
    return null;
  }
}
export {
  SearchParams,
  Searcher,
  TextModelSearch,
  createFindMatch,
  isMultilineRegexSource,
  isValidMatch
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgV29yZENoYXJhY3RlckNsYXNzLCBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMgfSBmcm9tICcuLi9jb3JlL3dvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lUHJlZmVyZW5jZSwgRmluZE1hdGNoLCBTZWFyY2hEYXRhIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi90ZXh0TW9kZWwuanMnO1xuXG5jb25zdCBMSU1JVF9GSU5EX0NPVU5UID0gOTk5O1xuXG5leHBvcnQgY2xhc3MgU2VhcmNoUGFyYW1zIHtcblx0cHVibGljIHJlYWRvbmx5IHNlYXJjaFN0cmluZzogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNSZWdleDogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IG1hdGNoQ2FzZTogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHNlYXJjaFN0cmluZzogc3RyaW5nLCBpc1JlZ2V4OiBib29sZWFuLCBtYXRjaENhc2U6IGJvb2xlYW4sIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcgfCBudWxsKSB7XG5cdFx0dGhpcy5zZWFyY2hTdHJpbmcgPSBzZWFyY2hTdHJpbmc7XG5cdFx0dGhpcy5pc1JlZ2V4ID0gaXNSZWdleDtcblx0XHR0aGlzLm1hdGNoQ2FzZSA9IG1hdGNoQ2FzZTtcblx0XHR0aGlzLndvcmRTZXBhcmF0b3JzID0gd29yZFNlcGFyYXRvcnM7XG5cdH1cblxuXHRwdWJsaWMgcGFyc2VTZWFyY2hSZXF1ZXN0KCk6IFNlYXJjaERhdGEgfCBudWxsIHtcblx0XHRpZiAodGhpcy5zZWFyY2hTdHJpbmcgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gY3JlYXRlIGEgUmVnRXhwIG91dCBvZiB0aGUgcGFyYW1zXG5cdFx0bGV0IG11bHRpbGluZTogYm9vbGVhbjtcblx0XHRpZiAodGhpcy5pc1JlZ2V4KSB7XG5cdFx0XHRtdWx0aWxpbmUgPSBpc011bHRpbGluZVJlZ2V4U291cmNlKHRoaXMuc2VhcmNoU3RyaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bXVsdGlsaW5lID0gKHRoaXMuc2VhcmNoU3RyaW5nLmluZGV4T2YoJ1xcbicpID49IDApO1xuXHRcdH1cblxuXHRcdGxldCByZWdleDogUmVnRXhwIHwgbnVsbCA9IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdHJlZ2V4ID0gc3RyaW5ncy5jcmVhdGVSZWdFeHAodGhpcy5zZWFyY2hTdHJpbmcsIHRoaXMuaXNSZWdleCwge1xuXHRcdFx0XHRtYXRjaENhc2U6IHRoaXMubWF0Y2hDYXNlLFxuXHRcdFx0XHR3aG9sZVdvcmQ6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aWxpbmU6IG11bHRpbGluZSxcblx0XHRcdFx0Z2xvYmFsOiB0cnVlLFxuXHRcdFx0XHR1bmljb2RlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghcmVnZXgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBjYW5Vc2VTaW1wbGVTZWFyY2ggPSAoIXRoaXMuaXNSZWdleCAmJiAhbXVsdGlsaW5lKTtcblx0XHRpZiAoY2FuVXNlU2ltcGxlU2VhcmNoICYmIHRoaXMuc2VhcmNoU3RyaW5nLnRvTG93ZXJDYXNlKCkgIT09IHRoaXMuc2VhcmNoU3RyaW5nLnRvVXBwZXJDYXNlKCkpIHtcblx0XHRcdC8vIGNhc2luZyBtaWdodCBtYWtlIGEgZGlmZmVyZW5jZVxuXHRcdFx0Y2FuVXNlU2ltcGxlU2VhcmNoID0gdGhpcy5tYXRjaENhc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBTZWFyY2hEYXRhKHJlZ2V4LCB0aGlzLndvcmRTZXBhcmF0b3JzID8gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnModGhpcy53b3JkU2VwYXJhdG9ycywgW10pIDogbnVsbCwgY2FuVXNlU2ltcGxlU2VhcmNoID8gdGhpcy5zZWFyY2hTdHJpbmcgOiBudWxsKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNdWx0aWxpbmVSZWdleFNvdXJjZShzZWFyY2hTdHJpbmc6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoIXNlYXJjaFN0cmluZyB8fCBzZWFyY2hTdHJpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlYXJjaFN0cmluZy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGNoQ29kZSA9IHNlYXJjaFN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG5cdFx0aWYgKGNoQ29kZSA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChjaENvZGUgPT09IENoYXJDb2RlLkJhY2tzbGFzaCkge1xuXG5cdFx0XHQvLyBtb3ZlIHRvIG5leHQgY2hhclxuXHRcdFx0aSsrO1xuXG5cdFx0XHRpZiAoaSA+PSBsZW4pIHtcblx0XHRcdFx0Ly8gc3RyaW5nIGVuZHMgd2l0aCBhIFxcXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXh0Q2hDb2RlID0gc2VhcmNoU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cdFx0XHRpZiAobmV4dENoQ29kZSA9PT0gQ2hhckNvZGUubiB8fCBuZXh0Q2hDb2RlID09PSBDaGFyQ29kZS5yIHx8IG5leHRDaENvZGUgPT09IENoYXJDb2RlLlcpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmluZE1hdGNoKHJhbmdlOiBSYW5nZSwgcmF3TWF0Y2hlczogUmVnRXhwRXhlY0FycmF5LCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB7XG5cdGlmICghY2FwdHVyZU1hdGNoZXMpIHtcblx0XHRyZXR1cm4gbmV3IEZpbmRNYXRjaChyYW5nZSwgbnVsbCk7XG5cdH1cblx0Y29uc3QgbWF0Y2hlczogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJhd01hdGNoZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRtYXRjaGVzW2ldID0gcmF3TWF0Y2hlc1tpXTtcblx0fVxuXHRyZXR1cm4gbmV3IEZpbmRNYXRjaChyYW5nZSwgbWF0Y2hlcyk7XG59XG5cbmNsYXNzIExpbmVGZWVkQ291bnRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGluZUZlZWRzT2Zmc2V0czogbnVtYmVyW107XG5cblx0Y29uc3RydWN0b3IodGV4dDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbGluZUZlZWRzT2Zmc2V0czogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgbGluZUZlZWRzT2Zmc2V0c0xlbiA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIHRleHRMZW4gPSB0ZXh0Lmxlbmd0aDsgaSA8IHRleHRMZW47IGkrKykge1xuXHRcdFx0aWYgKHRleHQuY2hhckNvZGVBdChpKSA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHRcdFx0bGluZUZlZWRzT2Zmc2V0c1tsaW5lRmVlZHNPZmZzZXRzTGVuKytdID0gaTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbGluZUZlZWRzT2Zmc2V0cyA9IGxpbmVGZWVkc09mZnNldHM7XG5cdH1cblxuXHRwdWJsaWMgZmluZExpbmVGZWVkQ291bnRCZWZvcmVPZmZzZXQob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxpbmVGZWVkc09mZnNldHMgPSB0aGlzLl9saW5lRmVlZHNPZmZzZXRzO1xuXHRcdGxldCBtaW4gPSAwO1xuXHRcdGxldCBtYXggPSBsaW5lRmVlZHNPZmZzZXRzLmxlbmd0aCAtIDE7XG5cblx0XHRpZiAobWF4ID09PSAtMSkge1xuXHRcdFx0Ly8gbm8gbGluZSBmZWVkc1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0aWYgKG9mZnNldCA8PSBsaW5lRmVlZHNPZmZzZXRzWzBdKSB7XG5cdFx0XHQvLyBiZWZvcmUgZmlyc3QgbGluZSBmZWVkXG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHR3aGlsZSAobWluIDwgbWF4KSB7XG5cdFx0XHRjb25zdCBtaWQgPSBtaW4gKyAoKG1heCAtIG1pbikgLyAyID4+IDApO1xuXG5cdFx0XHRpZiAobGluZUZlZWRzT2Zmc2V0c1ttaWRdID49IG9mZnNldCkge1xuXHRcdFx0XHRtYXggPSBtaWQgLSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGxpbmVGZWVkc09mZnNldHNbbWlkICsgMV0gPj0gb2Zmc2V0KSB7XG5cdFx0XHRcdFx0Ly8gYmluZ28hXG5cdFx0XHRcdFx0bWluID0gbWlkO1xuXHRcdFx0XHRcdG1heCA9IG1pZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtaW4gPSBtaWQgKyAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtaW4gKyAxO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0TW9kZWxTZWFyY2gge1xuXG5cdHB1YmxpYyBzdGF0aWMgZmluZE1hdGNoZXMobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoUGFyYW1zOiBTZWFyY2hQYXJhbXMsIHNlYXJjaFJhbmdlOiBSYW5nZSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IEZpbmRNYXRjaFtdIHtcblx0XHRjb25zdCBzZWFyY2hEYXRhID0gc2VhcmNoUGFyYW1zLnBhcnNlU2VhcmNoUmVxdWVzdCgpO1xuXHRcdGlmICghc2VhcmNoRGF0YSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChzZWFyY2hEYXRhLnJlZ2V4Lm11bHRpbGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvRmluZE1hdGNoZXNNdWx0aWxpbmUobW9kZWwsIHNlYXJjaFJhbmdlLCBuZXcgU2VhcmNoZXIoc2VhcmNoRGF0YS53b3JkU2VwYXJhdG9ycywgc2VhcmNoRGF0YS5yZWdleCksIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RvRmluZE1hdGNoZXNMaW5lQnlMaW5lKG1vZGVsLCBzZWFyY2hSYW5nZSwgc2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE11bHRpbGluZSBzZWFyY2ggYWx3YXlzIGV4ZWN1dGVzIG9uIHRoZSBsaW5lcyBjb25jYXRlbmF0ZWQgd2l0aCBcXG4uXG5cdCAqIFdlIG11c3QgdGhlcmVmb3JlIGNvbXBlbnNhdGUgZm9yIHRoZSBjb3VudCBvZiBcXG4gaW4gY2FzZSB0aGUgbW9kZWwgaXMgQ1JMRlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2dldE11bHRpbGluZU1hdGNoUmFuZ2UobW9kZWw6IFRleHRNb2RlbCwgZGVsdGFPZmZzZXQ6IG51bWJlciwgdGV4dDogc3RyaW5nLCBsZkNvdW50ZXI6IExpbmVGZWVkQ291bnRlciB8IG51bGwsIG1hdGNoSW5kZXg6IG51bWJlciwgbWF0Y2gwOiBzdHJpbmcpOiBSYW5nZSB7XG5cdFx0bGV0IHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdFx0bGV0IGxpbmVGZWVkQ291bnRCZWZvcmVNYXRjaCA9IDA7XG5cdFx0aWYgKGxmQ291bnRlcikge1xuXHRcdFx0bGluZUZlZWRDb3VudEJlZm9yZU1hdGNoID0gbGZDb3VudGVyLmZpbmRMaW5lRmVlZENvdW50QmVmb3JlT2Zmc2V0KG1hdGNoSW5kZXgpO1xuXHRcdFx0c3RhcnRPZmZzZXQgPSBkZWx0YU9mZnNldCArIG1hdGNoSW5kZXggKyBsaW5lRmVlZENvdW50QmVmb3JlTWF0Y2ggLyogYWRkIGFzIG1hbnkgXFxyIGFzIHRoZXJlIHdlcmUgXFxuICovO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydE9mZnNldCA9IGRlbHRhT2Zmc2V0ICsgbWF0Y2hJbmRleDtcblx0XHR9XG5cblx0XHRsZXQgZW5kT2Zmc2V0OiBudW1iZXI7XG5cdFx0aWYgKGxmQ291bnRlcikge1xuXHRcdFx0Y29uc3QgbGluZUZlZWRDb3VudEJlZm9yZUVuZE9mTWF0Y2ggPSBsZkNvdW50ZXIuZmluZExpbmVGZWVkQ291bnRCZWZvcmVPZmZzZXQobWF0Y2hJbmRleCArIG1hdGNoMC5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgbGluZUZlZWRDb3VudEluTWF0Y2ggPSBsaW5lRmVlZENvdW50QmVmb3JlRW5kT2ZNYXRjaCAtIGxpbmVGZWVkQ291bnRCZWZvcmVNYXRjaDtcblx0XHRcdGVuZE9mZnNldCA9IHN0YXJ0T2Zmc2V0ICsgbWF0Y2gwLmxlbmd0aCArIGxpbmVGZWVkQ291bnRJbk1hdGNoIC8qIGFkZCBhcyBtYW55IFxcciBhcyB0aGVyZSB3ZXJlIFxcbiAqLztcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZW5kT2Zmc2V0ID0gc3RhcnRPZmZzZXQgKyBtYXRjaDAubGVuZ3RoO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KHN0YXJ0T2Zmc2V0KTtcblx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQoZW5kT2Zmc2V0KTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0UG9zaXRpb24ubGluZU51bWJlciwgc3RhcnRQb3NpdGlvbi5jb2x1bW4sIGVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsIGVuZFBvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZG9GaW5kTWF0Y2hlc011bHRpbGluZShtb2RlbDogVGV4dE1vZGVsLCBzZWFyY2hSYW5nZTogUmFuZ2UsIHNlYXJjaGVyOiBTZWFyY2hlciwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IEZpbmRNYXRjaFtdIHtcblx0XHRjb25zdCBkZWx0YU9mZnNldCA9IG1vZGVsLmdldE9mZnNldEF0KHNlYXJjaFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0Ly8gV2UgYWx3YXlzIGV4ZWN1dGUgbXVsdGlsaW5lIHNlYXJjaCBvdmVyIHRoZSBsaW5lcyBqb2luZWQgd2l0aCBcXG5cblx0XHQvLyBUaGlzIG1ha2VzIGl0IHRoYXQgXFxuIHdpbGwgbWF0Y2ggdGhlIEVPTCBmb3IgYm90aCBDUkxGIGFuZCBMRiBtb2RlbHNcblx0XHQvLyBXZSBjb21wZW5zYXRlIGZvciBvZmZzZXQgZXJyb3JzIGluIGBfZ2V0TXVsdGlsaW5lTWF0Y2hSYW5nZWBcblx0XHRjb25zdCB0ZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHNlYXJjaFJhbmdlLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKTtcblx0XHRjb25zdCBsZkNvdW50ZXIgPSAobW9kZWwuZ2V0RU9MKCkgPT09ICdcXHJcXG4nID8gbmV3IExpbmVGZWVkQ291bnRlcih0ZXh0KSA6IG51bGwpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBGaW5kTWF0Y2hbXSA9IFtdO1xuXHRcdGxldCBjb3VudGVyID0gMDtcblxuXHRcdGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdHNlYXJjaGVyLnJlc2V0KDApO1xuXHRcdHdoaWxlICgobSA9IHNlYXJjaGVyLm5leHQodGV4dCkpKSB7XG5cdFx0XHRyZXN1bHRbY291bnRlcisrXSA9IGNyZWF0ZUZpbmRNYXRjaCh0aGlzLl9nZXRNdWx0aWxpbmVNYXRjaFJhbmdlKG1vZGVsLCBkZWx0YU9mZnNldCwgdGV4dCwgbGZDb3VudGVyLCBtLmluZGV4LCBtWzBdKSwgbSwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdFx0aWYgKGNvdW50ZXIgPj0gbGltaXRSZXN1bHRDb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZG9GaW5kTWF0Y2hlc0xpbmVCeUxpbmUobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoUmFuZ2U6IFJhbmdlLCBzZWFyY2hEYXRhOiBTZWFyY2hEYXRhLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbiwgbGltaXRSZXN1bHRDb3VudDogbnVtYmVyKTogRmluZE1hdGNoW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogRmluZE1hdGNoW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblxuXHRcdC8vIEVhcmx5IGNhc2UgZm9yIGEgc2VhcmNoIHJhbmdlIHRoYXQgc3RhcnRzICYgc3RvcHMgb24gdGhlIHNhbWUgbGluZSBudW1iZXJcblx0XHRpZiAoc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKS5zdWJzdHJpbmcoc2VhcmNoUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBzZWFyY2hSYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdHJlc3VsdExlbiA9IHRoaXMuX2ZpbmRNYXRjaGVzSW5MaW5lKHNlYXJjaERhdGEsIHRleHQsIHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlciwgc2VhcmNoUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCByZXN1bHRMZW4sIHJlc3VsdCwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBDb2xsZWN0IHJlc3VsdHMgZnJvbSBmaXJzdCBsaW5lXG5cdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlcikuc3Vic3RyaW5nKHNlYXJjaFJhbmdlLnN0YXJ0Q29sdW1uIC0gMSk7XG5cdFx0cmVzdWx0TGVuID0gdGhpcy5fZmluZE1hdGNoZXNJbkxpbmUoc2VhcmNoRGF0YSwgdGV4dCwgc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzZWFyY2hSYW5nZS5zdGFydENvbHVtbiAtIDEsIHJlc3VsdExlbiwgcmVzdWx0LCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cblx0XHQvLyBDb2xsZWN0IHJlc3VsdHMgZnJvbSBtaWRkbGUgbGluZXNcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc2VhcmNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgMTsgbGluZU51bWJlciA8IHNlYXJjaFJhbmdlLmVuZExpbmVOdW1iZXIgJiYgcmVzdWx0TGVuIDwgbGltaXRSZXN1bHRDb3VudDsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRyZXN1bHRMZW4gPSB0aGlzLl9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhLCBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSwgbGluZU51bWJlciwgMCwgcmVzdWx0TGVuLCByZXN1bHQsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0XHR9XG5cblx0XHQvLyBDb2xsZWN0IHJlc3VsdHMgZnJvbSBsYXN0IGxpbmVcblx0XHRpZiAocmVzdWx0TGVuIDwgbGltaXRSZXN1bHRDb3VudCkge1xuXHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHNlYXJjaFJhbmdlLmVuZExpbmVOdW1iZXIpLnN1YnN0cmluZygwLCBzZWFyY2hSYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdHJlc3VsdExlbiA9IHRoaXMuX2ZpbmRNYXRjaGVzSW5MaW5lKHNlYXJjaERhdGEsIHRleHQsIHNlYXJjaFJhbmdlLmVuZExpbmVOdW1iZXIsIDAsIHJlc3VsdExlbiwgcmVzdWx0LCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhOiBTZWFyY2hEYXRhLCB0ZXh0OiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlciwgZGVsdGFPZmZzZXQ6IG51bWJlciwgcmVzdWx0TGVuOiBudW1iZXIsIHJlc3VsdDogRmluZE1hdGNoW10sIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gc2VhcmNoRGF0YS53b3JkU2VwYXJhdG9ycztcblx0XHRpZiAoIWNhcHR1cmVNYXRjaGVzICYmIHNlYXJjaERhdGEuc2ltcGxlU2VhcmNoKSB7XG5cdFx0XHRjb25zdCBzZWFyY2hTdHJpbmcgPSBzZWFyY2hEYXRhLnNpbXBsZVNlYXJjaDtcblx0XHRcdGNvbnN0IHNlYXJjaFN0cmluZ0xlbiA9IHNlYXJjaFN0cmluZy5sZW5ndGg7XG5cdFx0XHRjb25zdCB0ZXh0TGVuZ3RoID0gdGV4dC5sZW5ndGg7XG5cblx0XHRcdGxldCBsYXN0TWF0Y2hJbmRleCA9IC1zZWFyY2hTdHJpbmdMZW47XG5cdFx0XHR3aGlsZSAoKGxhc3RNYXRjaEluZGV4ID0gdGV4dC5pbmRleE9mKHNlYXJjaFN0cmluZywgbGFzdE1hdGNoSW5kZXggKyBzZWFyY2hTdHJpbmdMZW4pKSAhPT0gLTEpIHtcblx0XHRcdFx0aWYgKCF3b3JkU2VwYXJhdG9ycyB8fCBpc1ZhbGlkTWF0Y2god29yZFNlcGFyYXRvcnMsIHRleHQsIHRleHRMZW5ndGgsIGxhc3RNYXRjaEluZGV4LCBzZWFyY2hTdHJpbmdMZW4pKSB7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIGxhc3RNYXRjaEluZGV4ICsgMSArIGRlbHRhT2Zmc2V0LCBsaW5lTnVtYmVyLCBsYXN0TWF0Y2hJbmRleCArIDEgKyBzZWFyY2hTdHJpbmdMZW4gKyBkZWx0YU9mZnNldCksIG51bGwpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHRMZW4gPj0gbGltaXRSZXN1bHRDb3VudCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHRMZW47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VhcmNoZXIgPSBuZXcgU2VhcmNoZXIoc2VhcmNoRGF0YS53b3JkU2VwYXJhdG9ycywgc2VhcmNoRGF0YS5yZWdleCk7XG5cdFx0bGV0IG06IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0Ly8gUmVzZXQgcmVnZXggdG8gc2VhcmNoIGZyb20gdGhlIGJlZ2lubmluZ1xuXHRcdHNlYXJjaGVyLnJlc2V0KDApO1xuXHRcdGRvIHtcblx0XHRcdG0gPSBzZWFyY2hlci5uZXh0KHRleHQpO1xuXHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IGNyZWF0ZUZpbmRNYXRjaChuZXcgUmFuZ2UobGluZU51bWJlciwgbS5pbmRleCArIDEgKyBkZWx0YU9mZnNldCwgbGluZU51bWJlciwgbS5pbmRleCArIDEgKyBtWzBdLmxlbmd0aCArIGRlbHRhT2Zmc2V0KSwgbSwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdFx0XHRpZiAocmVzdWx0TGVuID49IGxpbWl0UmVzdWx0Q291bnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSB3aGlsZSAobSk7XG5cdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZmluZE5leHRNYXRjaChtb2RlbDogVGV4dE1vZGVsLCBzZWFyY2hQYXJhbXM6IFNlYXJjaFBhcmFtcywgc2VhcmNoU3RhcnQ6IFBvc2l0aW9uLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IHNlYXJjaERhdGEgPSBzZWFyY2hQYXJhbXMucGFyc2VTZWFyY2hSZXF1ZXN0KCk7XG5cdFx0aWYgKCFzZWFyY2hEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hlciA9IG5ldyBTZWFyY2hlcihzZWFyY2hEYXRhLndvcmRTZXBhcmF0b3JzLCBzZWFyY2hEYXRhLnJlZ2V4KTtcblxuXHRcdGlmIChzZWFyY2hEYXRhLnJlZ2V4Lm11bHRpbGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvRmluZE5leHRNYXRjaE11bHRpbGluZShtb2RlbCwgc2VhcmNoU3RhcnQsIHNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kb0ZpbmROZXh0TWF0Y2hMaW5lQnlMaW5lKG1vZGVsLCBzZWFyY2hTdGFydCwgc2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kb0ZpbmROZXh0TWF0Y2hNdWx0aWxpbmUobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoU3RhcnQ6IFBvc2l0aW9uLCBzZWFyY2hlcjogU2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuKTogRmluZE1hdGNoIHwgbnVsbCB7XG5cdFx0Y29uc3Qgc2VhcmNoVGV4dFN0YXJ0ID0gbmV3IFBvc2l0aW9uKHNlYXJjaFN0YXJ0LmxpbmVOdW1iZXIsIDEpO1xuXHRcdGNvbnN0IGRlbHRhT2Zmc2V0ID0gbW9kZWwuZ2V0T2Zmc2V0QXQoc2VhcmNoVGV4dFN0YXJ0KTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHQvLyBXZSBhbHdheXMgZXhlY3V0ZSBtdWx0aWxpbmUgc2VhcmNoIG92ZXIgdGhlIGxpbmVzIGpvaW5lZCB3aXRoIFxcblxuXHRcdC8vIFRoaXMgbWFrZXMgaXQgdGhhdCBcXG4gd2lsbCBtYXRjaCB0aGUgRU9MIGZvciBib3RoIENSTEYgYW5kIExGIG1vZGVsc1xuXHRcdC8vIFdlIGNvbXBlbnNhdGUgZm9yIG9mZnNldCBlcnJvcnMgaW4gYF9nZXRNdWx0aWxpbmVNYXRjaFJhbmdlYFxuXHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHNlYXJjaFRleHRTdGFydC5saW5lTnVtYmVyLCBzZWFyY2hUZXh0U3RhcnQuY29sdW1uLCBsaW5lQ291bnQsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KSksIEVuZE9mTGluZVByZWZlcmVuY2UuTEYpO1xuXHRcdGNvbnN0IGxmQ291bnRlciA9IChtb2RlbC5nZXRFT0woKSA9PT0gJ1xcclxcbicgPyBuZXcgTGluZUZlZWRDb3VudGVyKHRleHQpIDogbnVsbCk7XG5cdFx0c2VhcmNoZXIucmVzZXQoc2VhcmNoU3RhcnQuY29sdW1uIC0gMSk7XG5cdFx0Y29uc3QgbSA9IHNlYXJjaGVyLm5leHQodGV4dCk7XG5cdFx0aWYgKG0pIHtcblx0XHRcdHJldHVybiBjcmVhdGVGaW5kTWF0Y2goXG5cdFx0XHRcdHRoaXMuX2dldE11bHRpbGluZU1hdGNoUmFuZ2UobW9kZWwsIGRlbHRhT2Zmc2V0LCB0ZXh0LCBsZkNvdW50ZXIsIG0uaW5kZXgsIG1bMF0pLFxuXHRcdFx0XHRtLFxuXHRcdFx0XHRjYXB0dXJlTWF0Y2hlc1xuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAoc2VhcmNoU3RhcnQubGluZU51bWJlciAhPT0gMSB8fCBzZWFyY2hTdGFydC5jb2x1bW4gIT09IDEpIHtcblx0XHRcdC8vIFRyeSBhZ2FpbiBmcm9tIHRoZSB0b3Bcblx0XHRcdHJldHVybiB0aGlzLl9kb0ZpbmROZXh0TWF0Y2hNdWx0aWxpbmUobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSwgc2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kb0ZpbmROZXh0TWF0Y2hMaW5lQnlMaW5lKG1vZGVsOiBUZXh0TW9kZWwsIHNlYXJjaFN0YXJ0OiBQb3NpdGlvbiwgc2VhcmNoZXI6IFNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHNlYXJjaFN0YXJ0LmxpbmVOdW1iZXI7XG5cblx0XHQvLyBMb29rIGluIGZpcnN0IGxpbmVcblx0XHRjb25zdCB0ZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCByID0gdGhpcy5fZmluZEZpcnN0TWF0Y2hJbkxpbmUoc2VhcmNoZXIsIHRleHQsIHN0YXJ0TGluZU51bWJlciwgc2VhcmNoU3RhcnQuY29sdW1uLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0aWYgKHIpIHtcblx0XHRcdHJldHVybiByO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDw9IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lSW5kZXggPSAoc3RhcnRMaW5lTnVtYmVyICsgaSAtIDEpICUgbGluZUNvdW50O1xuXHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVJbmRleCArIDEpO1xuXHRcdFx0Y29uc3QgciA9IHRoaXMuX2ZpbmRGaXJzdE1hdGNoSW5MaW5lKHNlYXJjaGVyLCB0ZXh0LCBsaW5lSW5kZXggKyAxLCAxLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0XHRpZiAocikge1xuXHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kRmlyc3RNYXRjaEluTGluZShzZWFyY2hlcjogU2VhcmNoZXIsIHRleHQ6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyLCBmcm9tQ29sdW1uOiBudW1iZXIsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuKTogRmluZE1hdGNoIHwgbnVsbCB7XG5cdFx0Ly8gU2V0IHJlZ2V4IHRvIHNlYXJjaCBmcm9tIGNvbHVtblxuXHRcdHNlYXJjaGVyLnJlc2V0KGZyb21Db2x1bW4gLSAxKTtcblx0XHRjb25zdCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsID0gc2VhcmNoZXIubmV4dCh0ZXh0KTtcblx0XHRpZiAobSkge1xuXHRcdFx0cmV0dXJuIGNyZWF0ZUZpbmRNYXRjaChcblx0XHRcdFx0bmV3IFJhbmdlKGxpbmVOdW1iZXIsIG0uaW5kZXggKyAxLCBsaW5lTnVtYmVyLCBtLmluZGV4ICsgMSArIG1bMF0ubGVuZ3RoKSxcblx0XHRcdFx0bSxcblx0XHRcdFx0Y2FwdHVyZU1hdGNoZXNcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmaW5kUHJldmlvdXNNYXRjaChtb2RlbDogVGV4dE1vZGVsLCBzZWFyY2hQYXJhbXM6IFNlYXJjaFBhcmFtcywgc2VhcmNoU3RhcnQ6IFBvc2l0aW9uLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IHNlYXJjaERhdGEgPSBzZWFyY2hQYXJhbXMucGFyc2VTZWFyY2hSZXF1ZXN0KCk7XG5cdFx0aWYgKCFzZWFyY2hEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hlciA9IG5ldyBTZWFyY2hlcihzZWFyY2hEYXRhLndvcmRTZXBhcmF0b3JzLCBzZWFyY2hEYXRhLnJlZ2V4KTtcblxuXHRcdGlmIChzZWFyY2hEYXRhLnJlZ2V4Lm11bHRpbGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvRmluZFByZXZpb3VzTWF0Y2hNdWx0aWxpbmUobW9kZWwsIHNlYXJjaFN0YXJ0LCBzZWFyY2hlciwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZG9GaW5kUHJldmlvdXNNYXRjaExpbmVCeUxpbmUobW9kZWwsIHNlYXJjaFN0YXJ0LCBzZWFyY2hlciwgY2FwdHVyZU1hdGNoZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RvRmluZFByZXZpb3VzTWF0Y2hNdWx0aWxpbmUobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoU3RhcnQ6IFBvc2l0aW9uLCBzZWFyY2hlcjogU2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuKTogRmluZE1hdGNoIHwgbnVsbCB7XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IHRoaXMuX2RvRmluZE1hdGNoZXNNdWx0aWxpbmUobW9kZWwsIG5ldyBSYW5nZSgxLCAxLCBzZWFyY2hTdGFydC5saW5lTnVtYmVyLCBzZWFyY2hTdGFydC5jb2x1bW4pLCBzZWFyY2hlciwgY2FwdHVyZU1hdGNoZXMsIDEwICogTElNSVRfRklORF9DT1VOVCk7XG5cdFx0aWYgKG1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIG1hdGNoZXNbbWF0Y2hlcy5sZW5ndGggLSAxXTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRpZiAoc2VhcmNoU3RhcnQubGluZU51bWJlciAhPT0gbGluZUNvdW50IHx8IHNlYXJjaFN0YXJ0LmNvbHVtbiAhPT0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpKSB7XG5cdFx0XHQvLyBUcnkgYWdhaW4gd2l0aCBhbGwgY29udGVudFxuXHRcdFx0cmV0dXJuIHRoaXMuX2RvRmluZFByZXZpb3VzTWF0Y2hNdWx0aWxpbmUobW9kZWwsIG5ldyBQb3NpdGlvbihsaW5lQ291bnQsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KSksIHNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZG9GaW5kUHJldmlvdXNNYXRjaExpbmVCeUxpbmUobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoU3RhcnQ6IFBvc2l0aW9uLCBzZWFyY2hlcjogU2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuKTogRmluZE1hdGNoIHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gc2VhcmNoU3RhcnQubGluZU51bWJlcjtcblxuXHRcdC8vIExvb2sgaW4gZmlyc3QgbGluZVxuXHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpLnN1YnN0cmluZygwLCBzZWFyY2hTdGFydC5jb2x1bW4gLSAxKTtcblx0XHRjb25zdCByID0gdGhpcy5fZmluZExhc3RNYXRjaEluTGluZShzZWFyY2hlciwgdGV4dCwgc3RhcnRMaW5lTnVtYmVyLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0aWYgKHIpIHtcblx0XHRcdHJldHVybiByO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDw9IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lSW5kZXggPSAobGluZUNvdW50ICsgc3RhcnRMaW5lTnVtYmVyIC0gaSAtIDEpICUgbGluZUNvdW50O1xuXHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVJbmRleCArIDEpO1xuXHRcdFx0Y29uc3QgciA9IHRoaXMuX2ZpbmRMYXN0TWF0Y2hJbkxpbmUoc2VhcmNoZXIsIHRleHQsIGxpbmVJbmRleCArIDEsIGNhcHR1cmVNYXRjaGVzKTtcblx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdHJldHVybiByO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmRMYXN0TWF0Y2hJbkxpbmUoc2VhcmNoZXI6IFNlYXJjaGVyLCB0ZXh0OiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlciwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4pOiBGaW5kTWF0Y2ggfCBudWxsIHtcblx0XHRsZXQgYmVzdFJlc3VsdDogRmluZE1hdGNoIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IG06IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0c2VhcmNoZXIucmVzZXQoMCk7XG5cdFx0d2hpbGUgKChtID0gc2VhcmNoZXIubmV4dCh0ZXh0KSkpIHtcblx0XHRcdGJlc3RSZXN1bHQgPSBjcmVhdGVGaW5kTWF0Y2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIG0uaW5kZXggKyAxLCBsaW5lTnVtYmVyLCBtLmluZGV4ICsgMSArIG1bMF0ubGVuZ3RoKSwgbSwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gYmVzdFJlc3VsdDtcblx0fVxufVxuXG5mdW5jdGlvbiBsZWZ0SXNXb3JkQm91bmRheSh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIHRleHQ6IHN0cmluZywgdGV4dExlbmd0aDogbnVtYmVyLCBtYXRjaFN0YXJ0SW5kZXg6IG51bWJlciwgbWF0Y2hMZW5ndGg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRpZiAobWF0Y2hTdGFydEluZGV4ID09PSAwKSB7XG5cdFx0Ly8gTWF0Y2ggc3RhcnRzIGF0IHN0YXJ0IG9mIHN0cmluZ1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3QgY2hhckJlZm9yZSA9IHRleHQuY2hhckNvZGVBdChtYXRjaFN0YXJ0SW5kZXggLSAxKTtcblx0aWYgKHdvcmRTZXBhcmF0b3JzLmdldChjaGFyQmVmb3JlKSAhPT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHQvLyBUaGUgY2hhcmFjdGVyIGJlZm9yZSB0aGUgbWF0Y2ggaXMgYSB3b3JkIHNlcGFyYXRvclxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKGNoYXJCZWZvcmUgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuIHx8IGNoYXJCZWZvcmUgPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0Ly8gVGhlIGNoYXJhY3RlciBiZWZvcmUgdGhlIG1hdGNoIGlzIGxpbmUgYnJlYWsgb3IgY2FycmlhZ2UgcmV0dXJuLlxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKG1hdGNoTGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IGZpcnN0Q2hhckluTWF0Y2ggPSB0ZXh0LmNoYXJDb2RlQXQobWF0Y2hTdGFydEluZGV4KTtcblx0XHRpZiAod29yZFNlcGFyYXRvcnMuZ2V0KGZpcnN0Q2hhckluTWF0Y2gpICE9PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhcikge1xuXHRcdFx0Ly8gVGhlIGZpcnN0IGNoYXJhY3RlciBpbnNpZGUgdGhlIG1hdGNoIGlzIGEgd29yZCBzZXBhcmF0b3Jcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gcmlnaHRJc1dvcmRCb3VuZGF5KHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgdGV4dDogc3RyaW5nLCB0ZXh0TGVuZ3RoOiBudW1iZXIsIG1hdGNoU3RhcnRJbmRleDogbnVtYmVyLCBtYXRjaExlbmd0aDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdGlmIChtYXRjaFN0YXJ0SW5kZXggKyBtYXRjaExlbmd0aCA9PT0gdGV4dExlbmd0aCkge1xuXHRcdC8vIE1hdGNoIGVuZHMgYXQgZW5kIG9mIHN0cmluZ1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3QgY2hhckFmdGVyID0gdGV4dC5jaGFyQ29kZUF0KG1hdGNoU3RhcnRJbmRleCArIG1hdGNoTGVuZ3RoKTtcblx0aWYgKHdvcmRTZXBhcmF0b3JzLmdldChjaGFyQWZ0ZXIpICE9PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhcikge1xuXHRcdC8vIFRoZSBjaGFyYWN0ZXIgYWZ0ZXIgdGhlIG1hdGNoIGlzIGEgd29yZCBzZXBhcmF0b3Jcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChjaGFyQWZ0ZXIgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuIHx8IGNoYXJBZnRlciA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHQvLyBUaGUgY2hhcmFjdGVyIGFmdGVyIHRoZSBtYXRjaCBpcyBsaW5lIGJyZWFrIG9yIGNhcnJpYWdlIHJldHVybi5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChtYXRjaExlbmd0aCA+IDApIHtcblx0XHRjb25zdCBsYXN0Q2hhckluTWF0Y2ggPSB0ZXh0LmNoYXJDb2RlQXQobWF0Y2hTdGFydEluZGV4ICsgbWF0Y2hMZW5ndGggLSAxKTtcblx0XHRpZiAod29yZFNlcGFyYXRvcnMuZ2V0KGxhc3RDaGFySW5NYXRjaCkgIT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyKSB7XG5cdFx0XHQvLyBUaGUgbGFzdCBjaGFyYWN0ZXIgaW4gdGhlIG1hdGNoIGlzIGEgd29yZCBzZXBhcmF0b3Jcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWRNYXRjaCh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIHRleHQ6IHN0cmluZywgdGV4dExlbmd0aDogbnVtYmVyLCBtYXRjaFN0YXJ0SW5kZXg6IG51bWJlciwgbWF0Y2hMZW5ndGg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKFxuXHRcdGxlZnRJc1dvcmRCb3VuZGF5KHdvcmRTZXBhcmF0b3JzLCB0ZXh0LCB0ZXh0TGVuZ3RoLCBtYXRjaFN0YXJ0SW5kZXgsIG1hdGNoTGVuZ3RoKVxuXHRcdCYmIHJpZ2h0SXNXb3JkQm91bmRheSh3b3JkU2VwYXJhdG9ycywgdGV4dCwgdGV4dExlbmd0aCwgbWF0Y2hTdGFydEluZGV4LCBtYXRjaExlbmd0aClcblx0KTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlYXJjaGVyIHtcblx0cHVibGljIHJlYWRvbmx5IF93b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWFyY2hSZWdleDogUmVnRXhwO1xuXHRwcml2YXRlIF9wcmV2TWF0Y2hTdGFydEluZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgX3ByZXZNYXRjaExlbmd0aDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciB8IG51bGwsIHNlYXJjaFJlZ2V4OiBSZWdFeHAsKSB7XG5cdFx0dGhpcy5fd29yZFNlcGFyYXRvcnMgPSB3b3JkU2VwYXJhdG9ycztcblx0XHR0aGlzLl9zZWFyY2hSZWdleCA9IHNlYXJjaFJlZ2V4O1xuXHRcdHRoaXMuX3ByZXZNYXRjaFN0YXJ0SW5kZXggPSAtMTtcblx0XHR0aGlzLl9wcmV2TWF0Y2hMZW5ndGggPSAwO1xuXHR9XG5cblx0cHVibGljIHJlc2V0KGxhc3RJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VhcmNoUmVnZXgubGFzdEluZGV4ID0gbGFzdEluZGV4O1xuXHRcdHRoaXMuX3ByZXZNYXRjaFN0YXJ0SW5kZXggPSAtMTtcblx0XHR0aGlzLl9wcmV2TWF0Y2hMZW5ndGggPSAwO1xuXHR9XG5cblx0cHVibGljIG5leHQodGV4dDogc3RyaW5nKTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB7XG5cdFx0Y29uc3QgdGV4dExlbmd0aCA9IHRleHQubGVuZ3RoO1xuXG5cdFx0bGV0IG06IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0ZG8ge1xuXHRcdFx0aWYgKHRoaXMuX3ByZXZNYXRjaFN0YXJ0SW5kZXggKyB0aGlzLl9wcmV2TWF0Y2hMZW5ndGggPT09IHRleHRMZW5ndGgpIHtcblx0XHRcdFx0Ly8gUmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBsaW5lXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRtID0gdGhpcy5fc2VhcmNoUmVnZXguZXhlYyh0ZXh0KTtcblx0XHRcdGlmICghbSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF0Y2hTdGFydEluZGV4ID0gbS5pbmRleDtcblx0XHRcdGNvbnN0IG1hdGNoTGVuZ3RoID0gbVswXS5sZW5ndGg7XG5cdFx0XHRpZiAobWF0Y2hTdGFydEluZGV4ID09PSB0aGlzLl9wcmV2TWF0Y2hTdGFydEluZGV4ICYmIG1hdGNoTGVuZ3RoID09PSB0aGlzLl9wcmV2TWF0Y2hMZW5ndGgpIHtcblx0XHRcdFx0aWYgKG1hdGNoTGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gdGhlIHNlYXJjaCByZXN1bHQgaXMgYW4gZW1wdHkgc3RyaW5nIGFuZCB3b24ndCBhZHZhbmNlIGByZWdleC5sYXN0SW5kZXhgLCBzbyBgcmVnZXguZXhlY2Agd2lsbCBzdHVjayBoZXJlXG5cdFx0XHRcdFx0Ly8gd2UgYXR0ZW1wdCB0byByZWNvdmVyIGZyb20gdGhhdCBieSBhZHZhbmNpbmcgYnkgdHdvIGlmIHN1cnJvZ2F0ZSBwYWlyIGZvdW5kIGFuZCBieSBvbmUgb3RoZXJ3aXNlXG5cdFx0XHRcdFx0aWYgKHN0cmluZ3MuZ2V0TmV4dENvZGVQb2ludCh0ZXh0LCB0ZXh0TGVuZ3RoLCB0aGlzLl9zZWFyY2hSZWdleC5sYXN0SW5kZXgpID4gMHhGRkZGKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZWFyY2hSZWdleC5sYXN0SW5kZXggKz0gMjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VhcmNoUmVnZXgubGFzdEluZGV4ICs9IDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEV4aXQgZWFybHkgaWYgdGhlIHJlZ2V4IG1hdGNoZXMgdGhlIHNhbWUgcmFuZ2UgdHdpY2Vcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcmV2TWF0Y2hTdGFydEluZGV4ID0gbWF0Y2hTdGFydEluZGV4O1xuXHRcdFx0dGhpcy5fcHJldk1hdGNoTGVuZ3RoID0gbWF0Y2hMZW5ndGg7XG5cblx0XHRcdGlmICghdGhpcy5fd29yZFNlcGFyYXRvcnMgfHwgaXNWYWxpZE1hdGNoKHRoaXMuX3dvcmRTZXBhcmF0b3JzLCB0ZXh0LCB0ZXh0TGVuZ3RoLCBtYXRjaFN0YXJ0SW5kZXgsIG1hdGNoTGVuZ3RoKSkge1xuXHRcdFx0XHRyZXR1cm4gbTtcblx0XHRcdH1cblxuXHRcdH0gd2hpbGUgKG0pO1xuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUN6QixTQUFTLG9CQUE2QywrQkFBK0I7QUFDckYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCLFdBQVcsa0JBQWtCO0FBRzNELE1BQU0sbUJBQW1CO0FBRWxCLE1BQU0sYUFBYTtBQUFBLEVBTXpCLFlBQVksY0FBc0IsU0FBa0IsV0FBb0IsZ0JBQStCO0FBQ3RHLFNBQUssZUFBZTtBQUNwQixTQUFLLFVBQVU7QUFDZixTQUFLLFlBQVk7QUFDakIsU0FBSyxpQkFBaUI7QUFBQSxFQUN2QjtBQUFBLEVBRU8scUJBQXdDO0FBQzlDLFFBQUksS0FBSyxpQkFBaUIsSUFBSTtBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUdBLFFBQUk7QUFDSixRQUFJLEtBQUssU0FBUztBQUNqQixrQkFBWSx1QkFBdUIsS0FBSyxZQUFZO0FBQUEsSUFDckQsT0FBTztBQUNOLGtCQUFhLEtBQUssYUFBYSxRQUFRLElBQUksS0FBSztBQUFBLElBQ2pEO0FBRUEsUUFBSSxRQUF1QjtBQUMzQixRQUFJO0FBQ0gsY0FBUSxRQUFRLGFBQWEsS0FBSyxjQUFjLEtBQUssU0FBUztBQUFBLFFBQzdELFdBQVcsS0FBSztBQUFBLFFBQ2hCLFdBQVc7QUFBQSxRQUNYO0FBQUEsUUFDQSxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsTUFDVixDQUFDO0FBQUEsSUFDRixTQUFTLEtBQUs7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLHFCQUFzQixDQUFDLEtBQUssV0FBVyxDQUFDO0FBQzVDLFFBQUksc0JBQXNCLEtBQUssYUFBYSxZQUFZLE1BQU0sS0FBSyxhQUFhLFlBQVksR0FBRztBQUU5RiwyQkFBcUIsS0FBSztBQUFB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
