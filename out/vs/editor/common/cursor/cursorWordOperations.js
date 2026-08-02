import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { SelectionStartKind, SingleCursorState } from "../cursorCommon.js";
import { DeleteOperations } from "./cursorDeleteOperations.js";
import { WordCharacterClass, getMapForWordSeparators } from "../core/wordCharacterClassifier.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
var WordType = /* @__PURE__ */ ((WordType2) => {
  WordType2[WordType2["None"] = 0] = "None";
  WordType2[WordType2["Regular"] = 1] = "Regular";
  WordType2[WordType2["Separator"] = 2] = "Separator";
  return WordType2;
})(WordType || {});
var WordNavigationType = /* @__PURE__ */ ((WordNavigationType2) => {
  WordNavigationType2[WordNavigationType2["WordStart"] = 0] = "WordStart";
  WordNavigationType2[WordNavigationType2["WordStartFast"] = 1] = "WordStartFast";
  WordNavigationType2[WordNavigationType2["WordEnd"] = 2] = "WordEnd";
  WordNavigationType2[WordNavigationType2["WordAccessibility"] = 3] = "WordAccessibility";
  return WordNavigationType2;
})(WordNavigationType || {});
class WordOperations {
  static _createWord(lineContent, wordType, nextCharClass, start, end) {
    return { start, end, wordType, nextCharClass };
  }
  static _createIntlWord(intlWord, nextCharClass) {
    return { start: intlWord.index, end: intlWord.index + intlWord.segment.length, wordType: 1 /* Regular */, nextCharClass };
  }
  static _findPreviousWordOnLine(wordSeparators, model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    return this._doFindPreviousWordOnLine(lineContent, wordSeparators, position);
  }
  static _doFindPreviousWordOnLine(lineContent, wordSeparators, position) {
    let wordType = 0 /* None */;
    const previousIntlWord = wordSeparators.findPrevIntlWordBeforeOrAtOffset(lineContent, position.column - 2);
    for (let chIndex = position.column - 2; chIndex >= 0; chIndex--) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (previousIntlWord && chIndex === previousIntlWord.index) {
        return this._createIntlWord(previousIntlWord, chClass);
      }
      if (chClass === WordCharacterClass.Regular) {
        if (wordType === 2 /* Separator */) {
          return this._createWord(lineContent, wordType, chClass, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
        }
        wordType = 1 /* Regular */;
      } else if (chClass === WordCharacterClass.WordSeparator) {
        if (wordType === 1 /* Regular */) {
          return this._createWord(lineContent, wordType, chClass, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
        }
        wordType = 2 /* Separator */;
      } else if (chClass === WordCharacterClass.Whitespace) {
        if (wordType !== 0 /* None */) {
          return this._createWord(lineContent, wordType, chClass, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
        }
      }
    }
    if (wordType !== 0 /* None */) {
      return this._createWord(lineContent, wordType, WordCharacterClass.Whitespace, 0, this._findEndOfWord(lineContent, wordSeparators, wordType, 0));
    }
    return null;
  }
  static _findEndOfWord(lineContent, wordSeparators, wordType, startIndex) {
    const nextIntlWord = wordSeparators.findNextIntlWordAtOrAfterOffset(lineContent, startIndex);
    const len = lineContent.length;
    for (let chIndex = startIndex; chIndex < len; chIndex++) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (nextIntlWord && chIndex === nextIntlWord.index + nextIntlWord.segment.length) {
        return chIndex;
      }
      if (chClass === WordCharacterClass.Whitespace) {
        return chIndex;
      }
      if (wordType === 1 /* Regular */ && chClass === WordCharacterClass.WordSeparator) {
        return chIndex;
      }
      if (wordType === 2 /* Separator */ && chClass === WordCharacterClass.Regular) {
        return chIndex;
      }
    }
    return len;
  }
  static _findNextWordOnLine(wordSeparators, model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    return this._doFindNextWordOnLine(lineContent, wordSeparators, position);
  }
  static _doFindNextWordOnLine(lineContent, wordSeparators, position) {
    let wordType = 0 /* None */;
    const len = lineContent.length;
    const nextIntlWord = wordSeparators.findNextIntlWordAtOrAfterOffset(lineContent, position.column - 1);
    for (let chIndex = position.column - 1; chIndex < len; chIndex++) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (nextIntlWord && chIndex === nextIntlWord.index) {
        return this._createIntlWord(nextIntlWord, chClass);
      }
      if (chClass === WordCharacterClass.Regular) {
        if (wordType === 2 /* Separator */) {
          return this._createWord(lineContent, wordType, chClass, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
        }
        wordType = 1 /* Regular */;
      } else if (chClass === WordCharacterClass.WordSeparator) {
        if (wordType === 1 /* Regular */) {
          return this._createWord(lineContent, wordType, chClass, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
        }
        wordType = 2 /* Separator */;
      } else if (chClass === WordCharacterClass.Whitespace) {
        if (wordType !== 0 /* None */) {
          return this._createWord(lineContent, wordType, chClass, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
        }
      }
    }
    if (wordType !== 0 /* None */) {
      return this._createWord(lineContent, wordType, WordCharacterClass.Whitespace, this._findStartOfWord(lineContent, wordSeparators, wordType, len - 1), len);
    }
    return null;
  }
  static _findStartOfWord(lineContent, wordSeparators, wordType, startIndex) {
    const previousIntlWord = wordSeparators.findPrevIntlWordBeforeOrAtOffset(lineContent, startIndex);
    for (let chIndex = startIndex; chIndex >= 0; chIndex--) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (previousIntlWord && chIndex === previousIntlWord.index) {
        return chIndex;
      }
      if (chClass === WordCharacterClass.Whitespace) {
        return chIndex + 1;
      }
      if (wordType === 1 /* Regular */ && chClass === WordCharacterClass.WordSeparator) {
        return chIndex + 1;
      }
      if (wordType === 2 /* Separator */ && chClass === WordCharacterClass.Regular) {
        return chIndex + 1;
      }
    }
    return 0;
  }
  static moveWordLeft(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
    let lineNumber = position.lineNumber;
    let column = position.column;
    if (column === 1) {
      if (lineNumber > 1) {
        lineNumber = lineNumber - 1;
        column = model.getLineMaxColumn(lineNumber);
      }
    }
    let prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, column));
    if (wordNavigationType === 0 /* WordStart */) {
      return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.start + 1 : 1);
    }
    if (wordNavigationType === 1 /* WordStartFast */) {
      if (!hasMulticursor && prevWordOnLine && prevWordOnLine.wordType === 2 /* Separator */ && prevWordOnLine.end - prevWordOnLine.start === 1 && prevWordOnLine.nextCharClass === WordCharacterClass.Regular) {
        prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
      }
      return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.start + 1 : 1);
    }
    if (wordNavigationType === 3 /* WordAccessibility */) {
      while (prevWordOnLine && prevWordOnLine.wordType === 2 /* Separator */) {
        prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
      }
      return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.start + 1 : 1);
    }
    if (prevWordOnLine && column <= prevWordOnLine.end + 1) {
      prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
    }
    return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.end + 1 : 1);
  }
  static _moveWordPartLeft(model, position) {
    const lineNumber = position.lineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    if (position.column === 1) {
      return lineNumber > 1 ? new Position(lineNumber - 1, model.getLineMaxColumn(lineNumber - 1)) : position;
    }
    const lineContent = model.getLineContent(lineNumber);
    for (let column = position.column - 1; column > 1; column--) {
      const left = lineContent.charCodeAt(column - 2);
      const right = lineContent.charCodeAt(column - 1);
      if (left === CharCode.Underline && right !== CharCode.Underline) {
        return new Position(lineNumber, column);
      }
      if (left === CharCode.Dash && right !== CharCode.Dash) {
        return new Position(lineNumber, column);
      }
      if ((strings.isLowerAsciiLetter(left) || strings.isAsciiDigit(left)) && strings.isUpperAsciiLetter(right)) {
        return new Position(lineNumber, column);
      }
      if (strings.isUpperAsciiLetter(left) && strings.isUpperAsciiLetter(right)) {
        if (column + 1 < maxColumn) {
          const rightRight = lineContent.charCodeAt(column);
          if (strings.isLowerAsciiLetter(rightRight) || strings.isAsciiDigit(rightRight)) {
            return new Position(lineNumber, column);
          }
        }
      }
    }
    return new Position(lineNumber, 1);
  }
  static moveWordRight(wordSeparators, model, position, wordNavigationType) {
    let lineNumber = position.lineNumber;
    let column = position.column;
    let movedDown = false;
    if (column === model.getLineMaxColumn(lineNumber)) {
      if (lineNumber < model.getLineCount()) {
        movedDown = true;
        lineNumber = lineNumber + 1;
        column = 1;
      }
    }
    let nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, column));
    if (wordNavigationType === 2 /* WordEnd */) {
      if (nextWordOnLine && nextWordOnLine.wordType === 2 /* Separator */) {
        if (nextWordOnLine.end - nextWordOnLine.start === 1 && nextWordOnLine.nextCharClass === WordCharacterClass.Regular) {
          nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
        }
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.end + 1;
      } else {
        column = model.getLineMaxColumn(lineNumber);
      }
    } else if (wordNavigationType === 3 /* WordAccessibility */) {
      if (movedDown) {
        column = 0;
      }
      while (nextWordOnLine && (nextWordOnLine.wordType === 2 /* Separator */ || nextWordOnLine.start + 1 <= column)) {
        nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.start + 1;
      } else {
        column = model.getLineMaxColumn(lineNumber);
      }
    } else {
      if (nextWordOnLine && !movedDown && column >= nextWordOnLine.start + 1) {
        nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.start + 1;
      } else {
        column = model.getLineMaxColumn(lineNumber);
      }
    }
    return new Position(lineNumber, column);
  }
  static _moveWordPartRight(model, position) {
    const lineNumber = position.lineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    if (position.column === maxColumn) {
      return lineNumber < model.getLineCount() ? new Position(lineNumber + 1, 1) : position;
    }
    const lineContent = model.getLineContent(lineNumber);
    for (let column = position.column + 1; column < maxColumn; column++) {
      const left = lineContent.charCodeAt(column - 2);
      const right = lineContent.charCodeAt(column - 1);
      if (left !== CharCode.Underline && right === CharCode.Underline) {
        return new Position(lineNumber, column);
      }
      if (left !== CharCode.Dash && right === CharCode.Dash) {
        return new Position(lineNumber, column);
      }
      if ((strings.isLowerAsciiLetter(left) || strings.isAsciiDigit(left)) && strings.isUpperAsciiLetter(right)) {
        return new Position(lineNumber, column);
      }
      if (strings.isUpperAsciiLetter(left) && strings.isUpperAsciiLetter(right)) {
        if (column + 1 < maxColumn) {
          const rightRight = lineContent.charCodeAt(column);
          if (strings.isLowerAsciiLetter(rightRight) || strings.isAsciiDigit(rightRight)) {
            return new Position(lineNumber, column);
          }
        }
      }
    }
    return new Position(lineNumber, maxColumn);
  }
  static _deleteWordLeftWhitespace(model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    const startIndex = position.column - 2;
    const lastNonWhitespace = strings.lastNonWhitespaceIndex(lineContent, startIndex);
    if (lastNonWhitespace + 1 < startIndex) {
      return new Range(position.lineNumber, lastNonWhitespace + 2, position.lineNumber, position.column);
    }
    return null;
  }
  static deleteWordLeft(ctx, wordNavigationType) {
    const wordSeparators = ctx.wordSeparators;
    const model = ctx.model;
    const selection = ctx.selection;
    const whitespaceHeuristics = ctx.whitespaceHeuristics;
    if (!selection.isEmpty()) {
      return selection;
    }
    if (DeleteOperations.isAutoClosingPairDelete(ctx.autoClosingDelete, ctx.autoClosingBrackets, ctx.autoClosingQuotes, ctx.autoClosingPairs.autoClosingPairsOpenByEnd, ctx.model, [ctx.selection], ctx.autoClosedCharacters)) {
      const position2 = ctx.selection.getPosition();
      return new Range(position2.lineNumber, position2.column - 1, position2.lineNumber, position2.column + 1);
    }
    const position = new Position(selection.positionLineNumber, selection.positionColumn);
    let lineNumber = position.lineNumber;
    let column = position.column;
    if (lineNumber === 1 && column === 1) {
      return null;
    }
    if (whitespaceHeuristics) {
      const r = this._deleteWordLeftWhitespace(model, position);
      if (r) {
        return r;
      }
    }
    let prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    if (wordNavigationType === 0 /* WordStart */) {
      if (prevWordOnLine) {
        column = prevWordOnLine.start + 1;
      } else {
        if (column > 1) {
          column = 1;
        } else {
          lineNumber--;
          column = model.getLineMaxColumn(lineNumber);
        }
      }
    } else {
      if (prevWordOnLine && column <= prevWordOnLine.end + 1) {
        prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
      }
      if (prevWordOnLine) {
        column = prevWordOnLine.end + 1;
      } else {
        if (column > 1) {
          column = 1;
        } else {
          lineNumber--;
          column = model.getLineMaxColumn(lineNumber);
        }
      }
    }
    return new Range(lineNumber, column, position.lineNumber, position.column);
  }
  static deleteInsideWord(wordSeparators, model, selection, onlyWord = false) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const position = new Position(selection.positionLineNumber, selection.positionColumn);
    const r = this._deleteInsideWordWhitespace(model, position);
    if (r) {
      return r;
    }
    return this._deleteInsideWordDetermineDeleteRange(wordSeparators, model, position, onlyWord);
  }
  static _charAtIsWhitespace(str, index) {
    const charCode = str.charCodeAt(index);
    return charCode === CharCode.Space || charCode === CharCode.Tab;
  }
  static _deleteInsideWordWhitespace(model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    const lineContentLength = lineContent.length;
    if (lineContentLength === 0) {
      return null;
    }
    let leftIndex = Math.max(position.column - 2, 0);
    if (!this._charAtIsWhitespace(lineContent, leftIndex)) {
      return null;
    }
    let rightIndex = Math.min(position.column - 1, lineContentLength - 1);
    if (!this._charAtIsWhitespace(lineContent, rightIndex)) {
      return null;
    }
    while (leftIndex > 0 && this._charAtIsWhitespace(lineContent, leftIndex - 1)) {
      leftIndex--;
    }
    while (rightIndex + 1 < lineContentLength && this._charAtIsWhitespace(lineContent, rightIndex + 1)) {
      rightIndex++;
    }
    return new Range(position.lineNumber, leftIndex + 1, position.lineNumber, rightIndex + 2);
  }
  static _deleteInsideWordDetermineDeleteRange(wordSeparators, model, position, onlyWord) {
    const lineContent = model.getLineContent(position.lineNumber);
    const lineLength = lineContent.length;
    if (lineLength === 0) {
      if (position.lineNumber > 1) {
        return new Range(position.lineNumber - 1, model.getLineMaxColumn(position.lineNumber - 1), position.lineNumber, 1);
      } else {
        if (position.lineNumber < model.getLineCount()) {
          return new Range(position.lineNumber, 1, position.lineNumber + 1, 1);
        } else {
          return new Range(position.lineNumber, 1, position.lineNumber, 1);
        }
      }
    }
    const touchesWord = (word) => {
      return word.start + 1 <= position.column && position.column <= word.end + 1;
    };
    const createRangeWithPosition = (startColumn, endColumn) => {
      startColumn = Math.min(startColumn, position.column);
      endColumn = Math.max(endColumn, position.column);
      return new Range(position.lineNumber, startColumn, position.lineNumber, endColumn);
    };
    const deleteWordAndAdjacentWhitespace = (word) => {
      let startColumn = word.start + 1;
      let endColumn = word.end + 1;
      if (onlyWord) {
        return createRangeWithPosition(startColumn, endColumn);
      }
      let expandedToTheRight = false;
      while (endColumn - 1 < lineLength && this._charAtIsWhitespace(lineContent, endColumn - 1)) {
        expandedToTheRight = true;
        endColumn++;
      }
      if (!expandedToTheRight) {
        while (startColumn > 1 && this._charAtIsWhitespace(lineContent, startColumn - 2)) {
          startColumn--;
        }
      }
      return createRangeWithPosition(startColumn, endColumn);
    };
    const prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    if (prevWordOnLine && touchesWord(prevWordOnLine)) {
      return deleteWordAndAdjacentWhitespace(prevWordOnLine);
    }
    const nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (nextWordOnLine && touchesWord(nextWordOnLine)) {
      return deleteWordAndAdjacentWhitespace(nextWordOnLine);
    }
    if (prevWordOnLine && nextWordOnLine) {
      return createRangeWithPosition(prevWordOnLine.end + 1, nextWordOnLine.start + 1);
    }
    if (prevWordOnLine) {
      return createRangeWithPosition(prevWordOnLine.start + 1, prevWordOnLine.end + 1);
    }
    if (nextWordOnLine) {
      return createRangeWithPosition(nextWordOnLine.start + 1, nextWordOnLine.end + 1);
    }
    return createRangeWithPosition(1, lineLength + 1);
  }
  static _deleteWordPartLeft(model, selection) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const pos = selection.getPosition();
    const toPosition = WordOperations._moveWordPartLeft(model, pos);
    return new Range(pos.lineNumber, pos.column, toPosition.lineNumber, toPosition.column);
  }
  static _findFirstNonWhitespaceChar(str, startIndex) {
    const len = str.length;
    for (let chIndex = startIndex; chIndex < len; chIndex++) {
      const ch = str.charAt(chIndex);
      if (ch !== " " && ch !== "	") {
        return chIndex;
      }
    }
    return len;
  }
  static _deleteWordRightWhitespace(model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    const startIndex = position.column - 1;
    const firstNonWhitespace = this._findFirstNonWhitespaceChar(lineContent, startIndex);
    if (startIndex < firstNonWhitespace) {
      return new Range(position.lineNumber, position.column, position.lineNumber, firstNonWhitespace + 1);
    }
    return null;
  }
  static deleteWordRight(ctx, wordNavigationType) {
    const wordSeparators = ctx.wordSeparators;
    const model = ctx.model;
    const selection = ctx.selection;
    const whitespaceHeuristics = ctx.whitespaceHeuristics;
    if (!selection.isEmpty()) {
      return selection;
    }
    const position = new Position(selection.positionLineNumber, selection.positionColumn);
    let lineNumber = position.lineNumber;
    let column = position.column;
    const lineCount = model.getLineCount();
    const maxColumn = model.getLineMaxColumn(lineNumber);
    if (lineNumber === lineCount && column === maxColumn) {
      return null;
    }
    if (whitespaceHeuristics) {
      const r = this._deleteWordRightWhitespace(model, position);
      if (r) {
        return r;
      }
    }
    let nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (wordNavigationType === 2 /* WordEnd */) {
      if (nextWordOnLine) {
        column = nextWordOnLine.end + 1;
      } else {
        if (column < maxColumn || lineNumber === lineCount) {
          column = maxColumn;
        } else {
          lineNumber++;
          nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, 1));
          if (nextWordOnLine) {
            column = nextWordOnLine.start + 1;
          } else {
            column = model.getLineMaxColumn(lineNumber);
          }
        }
      }
    } else {
      if (nextWordOnLine && column >= nextWordOnLine.start + 1) {
        nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.start + 1;
      } else {
        if (column < maxColumn || lineNumber === lineCount) {
          column = maxColumn;
        } else {
          lineNumber++;
          nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, 1));
          if (nextWordOnLine) {
            column = nextWordOnLine.start + 1;
          } else {
            column = model.getLineMaxColumn(lineNumber);
          }
        }
      }
    }
    return new Range(lineNumber, column, position.lineNumber, position.column);
  }
  static _deleteWordPartRight(model, selection) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const pos = selection.getPosition();
    const toPosition = WordOperations._moveWordPartRight(model, pos);
    return new Range(pos.lineNumber, pos.column, toPosition.lineNumber, toPosition.column);
  }
  static _createWordAtPosition(model, lineNumber, word) {
    const range = new Range(lineNumber, word.start + 1, lineNumber, word.end + 1);
    return {
      word: model.getValueInRange(range),
      startColumn: range.startColumn,
      endColumn: range.endColumn
    };
  }
  static getWordAtPosition(model, _wordSeparators, _intlSegmenterLocales, position) {
    const wordSeparators = getMapForWordSeparators(_wordSeparators, _intlSegmenterLocales);
    const prevWord = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    if (prevWord && prevWord.wordType === 1 /* Regular */ && prevWord.start <= position.column - 1 && position.column - 1 <= prevWord.end) {
      return WordOperations._createWordAtPosition(model, position.lineNumber, prevWord);
    }
    const nextWord = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (nextWord && nextWord.wordType === 1 /* Regular */ && nextWord.start <= position.column - 1 && position.column - 1 <= nextWord.end) {
      return WordOperations._createWordAtPosition(model, position.lineNumber, nextWord);
    }
    return null;
  }
  static word(config, model, cursor, inSelectionMode, position) {
    const wordSeparators = getMapForWordSeparators(config.wordSeparators, config.wordSegmenterLocales);
    const prevWord = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    const nextWord = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (!inSelectionMode) {
      let startColumn2;
      let endColumn2;
      if (prevWord && prevWord.wordType === 1 /* Regular */ && prevWord.start <= position.column - 1 && position.column - 1 <= prevWord.end) {
        startColumn2 = prevWord.start + 1;
        endColumn2 = prevWord.end + 1;
      } else if (prevWord && prevWord.wordType === 2 /* Separator */ && prevWord.start <= position.column - 1 && position.column - 1 < prevWord.end) {
        startColumn2 = prevWord.start + 1;
        endColumn2 = prevWord.end + 1;
      } else if (nextWord && nextWord.wordType === 1 /* Regular */ && nextWord.start <= position.column - 1 && position.column - 1 <= nextWord.end) {
        startColumn2 = nextWord.start + 1;
        endColumn2 = nextWord.end + 1;
      } else if (nextWord && nextWord.wordType === 2 /* Separator */ && nextWord.start <= position.column - 1 && position.column - 1 < nextWord.end) {
        startColumn2 = nextWord.start + 1;
        endColumn2 = nextWord.end + 1;
      } else {
        if (prevWord) {
          startColumn2 = prevWord.end + 1;
        } else {
          startColumn2 = 1;
        }
        if (nextWord) {
          endColumn2 = nextWord.start + 1;
        } else {
          endColumn2 = model.getLineMaxColumn(position.lineNumber);
        }
      }
      return new SingleCursorState(
        new Range(position.lineNumber, startColumn2, position.lineNumber, endColumn2),
        SelectionStartKind.Word,
        0,
        new Position(position.lineNumber, endColumn2),
        0
      );
    }
    let startColumn;
    let endColumn;
    if (prevWord && prevWord.wordType === 1 /* Regular */ && prevWord.start < position.column - 1 && position.column - 1 < prevWord.end) {
      startColumn = prevWord.start + 1;
      endColumn = prevWord.end + 1;
    } else if (nextWord && nextWord.wordType === 1 /* Regular */ && nextWord.start < position.column - 1 && position.column - 1 < nextWord.end) {
      startColumn = nextWord.start + 1;
      endColumn = nextWord.end + 1;
    } else {
      startColumn = position.column;
      endColumn = position.column;
    }
    const lineNumber = position.lineNumber;
    let column;
    if (cursor.selectionStart.containsPosition(position)) {
      column = cursor.selectionStart.endColumn;
    } else if (position.isBeforeOrEqual(cursor.selectionStart.getStartPosition())) {
      column = startColumn;
      const possiblePosition = new Position(lineNumber, column);
      if (cursor.selectionStart.containsPosition(possiblePosition)) {
        column = cursor.selectionStart.endColumn;
      }
    } else {
      column = endColumn;
      const possiblePosition = new Position(lineNumber, column);
      if (cursor.selectionStart.containsPosition(possiblePosition)) {
        column = cursor.selectionStart.startColumn;
      }
    }
    return cursor.move(true, lineNumber, column, 0);
  }
}
class WordPartOperations extends WordOperations {
  static deleteWordPartLeft(ctx) {
    const candidates = enforceDefined([
      WordOperations.deleteWordLeft(ctx, 0 /* WordStart */),
      WordOperations.deleteWordLeft(ctx, 2 /* WordEnd */),
      WordOperations._deleteWordPartLeft(ctx.model, ctx.selection)
    ]);
    candidates.sort(Range.compareRangesUsingEnds);
    return candidates[2];
  }
  static deleteWordPartRight(ctx) {
    const candidates = enforceDefined([
      WordOperations.deleteWordRight(ctx, 0 /* WordStart */),
      WordOperations.deleteWordRight(ctx, 2 /* WordEnd */),
      WordOperations._deleteWordPartRight(ctx.model, ctx.selection)
    ]);
    candidates.sort(Range.compareRangesUsingStarts);
    return candidates[0];
  }
  static moveWordPartLeft(wordSeparators, model, position, hasMulticursor) {
    const candidates = enforceDefined([
      WordOperations.moveWordLeft(wordSeparators, model, position, 0 /* WordStart */, hasMulticursor),
      WordOperations.moveWordLeft(wordSeparators, model, position, 2 /* WordEnd */, hasMulticursor),
      WordOperations._moveWordPartLeft(model, position)
    ]);
    candidates.sort(Position.compare);
    return candidates[2];
  }
  static moveWordPartRight(wordSeparators, model, position) {
    const candidates = enforceDefined([
      WordOperations.moveWordRight(wordSeparators, model, position, 0 /* WordStart */),
      WordOperations.moveWordRight(wordSeparators, model, position, 2 /* WordEnd */),
      WordOperations._moveWordPartRight(model, position)
    ]);
    candidates.sort(Position.compare);
    return candidates[0];
  }
}
function enforceDefined(arr) {
  return arr.filter((el) => Boolean(el));
}
export {
  WordNavigationType,
  WordOperations,
  WordPartOperations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY3Vyc29yL2N1cnNvcldvcmRPcGVyYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgRWRpdG9yQXV0b0Nsb3NpbmdFZGl0U3RyYXRlZ3ksIEVkaXRvckF1dG9DbG9zaW5nU3RyYXRlZ3kgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb25maWd1cmF0aW9uLCBJQ3Vyc29yU2ltcGxlTW9kZWwsIFNlbGVjdGlvblN0YXJ0S2luZCwgU2luZ2xlQ3Vyc29yU3RhdGUgfSBmcm9tICcuLi9jdXJzb3JDb21tb24uanMnO1xuaW1wb3J0IHsgRGVsZXRlT3BlcmF0aW9ucyB9IGZyb20gJy4vY3Vyc29yRGVsZXRlT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBXb3JkQ2hhcmFjdGVyQ2xhc3MsIFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBJbnRsV29yZFNlZ21lbnREYXRhLCBnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyB9IGZyb20gJy4uL2NvcmUvd29yZENoYXJhY3RlckNsYXNzaWZpZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVdvcmRBdFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IEF1dG9DbG9zaW5nUGFpcnMgfSBmcm9tICcuLi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uLmpzJztcblxuaW50ZXJmYWNlIElGaW5kV29yZFJlc3VsdCB7XG5cdC8qKlxuXHQgKiBUaGUgaW5kZXggd2hlcmUgdGhlIHdvcmQgc3RhcnRzLlxuXHQgKi9cblx0c3RhcnQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBpbmRleCB3aGVyZSB0aGUgd29yZCBlbmRzLlxuXHQgKi9cblx0ZW5kOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgd29yZCB0eXBlLlxuXHQgKi9cblx0d29yZFR5cGU6IFdvcmRUeXBlO1xuXHQvKipcblx0ICogVGhlIHJlYXNvbiB0aGUgd29yZCBlbmRlZC5cblx0ICovXG5cdG5leHRDaGFyQ2xhc3M6IFdvcmRDaGFyYWN0ZXJDbGFzcztcbn1cblxuY29uc3QgZW51bSBXb3JkVHlwZSB7XG5cdE5vbmUgPSAwLFxuXHRSZWd1bGFyID0gMSxcblx0U2VwYXJhdG9yID0gMlxufVxuXG5leHBvcnQgY29uc3QgZW51bSBXb3JkTmF2aWdhdGlvblR5cGUge1xuXHRXb3JkU3RhcnQgPSAwLFxuXHRXb3JkU3RhcnRGYXN0ID0gMSxcblx0V29yZEVuZCA9IDIsXG5cdFdvcmRBY2Nlc3NpYmlsaXR5ID0gMyAvLyBSZXNwZWN0IGNocm9tZSBkZWZpbml0aW9uIG9mIGEgd29yZFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERlbGV0ZVdvcmRDb250ZXh0IHtcblx0d29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyO1xuXHRtb2RlbDogSVRleHRNb2RlbDtcblx0c2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdHdoaXRlc3BhY2VIZXVyaXN0aWNzOiBib29sZWFuO1xuXHRhdXRvQ2xvc2luZ0RlbGV0ZTogRWRpdG9yQXV0b0Nsb3NpbmdFZGl0U3RyYXRlZ3k7XG5cdGF1dG9DbG9zaW5nQnJhY2tldHM6IEVkaXRvckF1dG9DbG9zaW5nU3RyYXRlZ3k7XG5cdGF1dG9DbG9zaW5nUXVvdGVzOiBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5O1xuXHRhdXRvQ2xvc2luZ1BhaXJzOiBBdXRvQ2xvc2luZ1BhaXJzO1xuXHRhdXRvQ2xvc2VkQ2hhcmFjdGVyczogUmFuZ2VbXTtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmRPcGVyYXRpb25zIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlV29yZChsaW5lQ29udGVudDogc3RyaW5nLCB3b3JkVHlwZTogV29yZFR5cGUsIG5leHRDaGFyQ2xhc3M6IFdvcmRDaGFyYWN0ZXJDbGFzcywgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpOiBJRmluZFdvcmRSZXN1bHQge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdXT1JEID09PiAnICsgc3RhcnQgKyAnID0+ICcgKyBlbmQgKyAnOjo6OiA8PDwnICsgbGluZUNvbnRlbnQuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpICsgJz4+PicpO1xuXHRcdHJldHVybiB7IHN0YXJ0OiBzdGFydCwgZW5kOiBlbmQsIHdvcmRUeXBlOiB3b3JkVHlwZSwgbmV4dENoYXJDbGFzczogbmV4dENoYXJDbGFzcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZUludGxXb3JkKGludGxXb3JkOiBJbnRsV29yZFNlZ21lbnREYXRhLCBuZXh0Q2hhckNsYXNzOiBXb3JkQ2hhcmFjdGVyQ2xhc3MpOiBJRmluZFdvcmRSZXN1bHQge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdJTlRMIFdPUkQgPT0+ICcgKyBpbnRsV29yZC5pbmRleCArICcgPT4gJyArIGludGxXb3JkLmluZGV4ICsgaW50bFdvcmQuc2VnbWVudC5sZW5ndGggKyAnOjo6OiA8PDwnICsgaW50bFdvcmQuc2VnbWVudCArICc+Pj4nKTtcblx0XHRyZXR1cm4geyBzdGFydDogaW50bFdvcmQuaW5kZXgsIGVuZDogaW50bFdvcmQuaW5kZXggKyBpbnRsV29yZC5zZWdtZW50Lmxlbmd0aCwgd29yZFR5cGU6IFdvcmRUeXBlLlJlZ3VsYXIsIG5leHRDaGFyQ2xhc3M6IG5leHRDaGFyQ2xhc3MgfTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kUHJldmlvdXNXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogSUZpbmRXb3JkUmVzdWx0IHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5fZG9GaW5kUHJldmlvdXNXb3JkT25MaW5lKGxpbmVDb250ZW50LCB3b3JkU2VwYXJhdG9ycywgcG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RvRmluZFByZXZpb3VzV29yZE9uTGluZShsaW5lQ29udGVudDogc3RyaW5nLCB3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIHBvc2l0aW9uOiBQb3NpdGlvbik6IElGaW5kV29yZFJlc3VsdCB8IG51bGwge1xuXHRcdGxldCB3b3JkVHlwZSA9IFdvcmRUeXBlLk5vbmU7XG5cblx0XHRjb25zdCBwcmV2aW91c0ludGxXb3JkID0gd29yZFNlcGFyYXRvcnMuZmluZFByZXZJbnRsV29yZEJlZm9yZU9yQXRPZmZzZXQobGluZUNvbnRlbnQsIHBvc2l0aW9uLmNvbHVtbiAtIDIpO1xuXG5cdFx0Zm9yIChsZXQgY2hJbmRleCA9IHBvc2l0aW9uLmNvbHVtbiAtIDI7IGNoSW5kZXggPj0gMDsgY2hJbmRleC0tKSB7XG5cdFx0XHRjb25zdCBjaENvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNoSW5kZXgpO1xuXHRcdFx0Y29uc3QgY2hDbGFzcyA9IHdvcmRTZXBhcmF0b3JzLmdldChjaENvZGUpO1xuXG5cdFx0XHRpZiAocHJldmlvdXNJbnRsV29yZCAmJiBjaEluZGV4ID09PSBwcmV2aW91c0ludGxXb3JkLmluZGV4KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVJbnRsV29yZChwcmV2aW91c0ludGxXb3JkLCBjaENsYXNzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoQ2xhc3MgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyKSB7XG5cdFx0XHRcdGlmICh3b3JkVHlwZSA9PT0gV29yZFR5cGUuU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVdvcmQobGluZUNvbnRlbnQsIHdvcmRUeXBlLCBjaENsYXNzLCBjaEluZGV4ICsgMSwgdGhpcy5fZmluZEVuZE9mV29yZChsaW5lQ29udGVudCwgd29yZFNlcGFyYXRvcnMsIHdvcmRUeXBlLCBjaEluZGV4ICsgMSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdvcmRUeXBlID0gV29yZFR5cGUuUmVndWxhcjtcblx0XHRcdH0gZWxzZSBpZiAoY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLldvcmRTZXBhcmF0b3IpIHtcblx0XHRcdFx0aWYgKHdvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVdvcmQobGluZUNvbnRlbnQsIHdvcmRUeXBlLCBjaENsYXNzLCBjaEluZGV4ICsgMSwgdGhpcy5fZmluZEVuZE9mV29yZChsaW5lQ29udGVudCwgd29yZFNlcGFyYXRvcnMsIHdvcmRUeXBlLCBjaEluZGV4ICsgMSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdvcmRUeXBlID0gV29yZFR5cGUuU2VwYXJhdG9yO1xuXHRcdFx0fSBlbHNlIGlmIChjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuV2hpdGVzcGFjZSkge1xuXHRcdFx0XHRpZiAod29yZFR5cGUgIT09IFdvcmRUeXBlLk5vbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlV29yZChsaW5lQ29udGVudCwgd29yZFR5cGUsIGNoQ2xhc3MsIGNoSW5kZXggKyAxLCB0aGlzLl9maW5kRW5kT2ZXb3JkKGxpbmVDb250ZW50LCB3b3JkU2VwYXJhdG9ycywgd29yZFR5cGUsIGNoSW5kZXggKyAxKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAod29yZFR5cGUgIT09IFdvcmRUeXBlLk5vbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVXb3JkKGxpbmVDb250ZW50LCB3b3JkVHlwZSwgV29yZENoYXJhY3RlckNsYXNzLldoaXRlc3BhY2UsIDAsIHRoaXMuX2ZpbmRFbmRPZldvcmQobGluZUNvbnRlbnQsIHdvcmRTZXBhcmF0b3JzLCB3b3JkVHlwZSwgMCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmRFbmRPZldvcmQobGluZUNvbnRlbnQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCB3b3JkVHlwZTogV29yZFR5cGUsIHN0YXJ0SW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cblx0XHRjb25zdCBuZXh0SW50bFdvcmQgPSB3b3JkU2VwYXJhdG9ycy5maW5kTmV4dEludGxXb3JkQXRPckFmdGVyT2Zmc2V0KGxpbmVDb250ZW50LCBzdGFydEluZGV4KTtcblxuXHRcdGNvbnN0IGxlbiA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblx0XHRmb3IgKGxldCBjaEluZGV4ID0gc3RhcnRJbmRleDsgY2hJbmRleCA8IGxlbjsgY2hJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjaENvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNoSW5kZXgpO1xuXHRcdFx0Y29uc3QgY2hDbGFzcyA9IHdvcmRTZXBhcmF0b3JzLmdldChjaENvZGUpO1xuXG5cdFx0XHRpZiAobmV4dEludGxXb3JkICYmIGNoSW5kZXggPT09IG5leHRJbnRsV29yZC5pbmRleCArIG5leHRJbnRsV29yZC5zZWdtZW50Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoQ2xhc3MgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5XaGl0ZXNwYWNlKSB7XG5cdFx0XHRcdHJldHVybiBjaEluZGV4O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyICYmIGNoQ2xhc3MgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5Xb3JkU2VwYXJhdG9yKSB7XG5cdFx0XHRcdHJldHVybiBjaEluZGV4O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3IgJiYgY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHRcdFx0cmV0dXJuIGNoSW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsZW47XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogSUZpbmRXb3JkUmVzdWx0IHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5fZG9GaW5kTmV4dFdvcmRPbkxpbmUobGluZUNvbnRlbnQsIHdvcmRTZXBhcmF0b3JzLCBwb3NpdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZG9GaW5kTmV4dFdvcmRPbkxpbmUobGluZUNvbnRlbnQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBwb3NpdGlvbjogUG9zaXRpb24pOiBJRmluZFdvcmRSZXN1bHQgfCBudWxsIHtcblx0XHRsZXQgd29yZFR5cGUgPSBXb3JkVHlwZS5Ob25lO1xuXHRcdGNvbnN0IGxlbiA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblxuXHRcdGNvbnN0IG5leHRJbnRsV29yZCA9IHdvcmRTZXBhcmF0b3JzLmZpbmROZXh0SW50bFdvcmRBdE9yQWZ0ZXJPZmZzZXQobGluZUNvbnRlbnQsIHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXG5cdFx0Zm9yIChsZXQgY2hJbmRleCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7IGNoSW5kZXggPCBsZW47IGNoSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgY2hDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaEluZGV4KTtcblx0XHRcdGNvbnN0IGNoQ2xhc3MgPSB3b3JkU2VwYXJhdG9ycy5nZXQoY2hDb2RlKTtcblxuXHRcdFx0aWYgKG5leHRJbnRsV29yZCAmJiBjaEluZGV4ID09PSBuZXh0SW50bFdvcmQuaW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUludGxXb3JkKG5leHRJbnRsV29yZCwgY2hDbGFzcyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhcikge1xuXHRcdFx0XHRpZiAod29yZFR5cGUgPT09IFdvcmRUeXBlLlNlcGFyYXRvcikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVXb3JkKGxpbmVDb250ZW50LCB3b3JkVHlwZSwgY2hDbGFzcywgdGhpcy5fZmluZFN0YXJ0T2ZXb3JkKGxpbmVDb250ZW50LCB3b3JkU2VwYXJhdG9ycywgd29yZFR5cGUsIGNoSW5kZXggLSAxKSwgY2hJbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0d29yZFR5cGUgPSBXb3JkVHlwZS5SZWd1bGFyO1xuXHRcdFx0fSBlbHNlIGlmIChjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuV29yZFNlcGFyYXRvcikge1xuXHRcdFx0XHRpZiAod29yZFR5cGUgPT09IFdvcmRUeXBlLlJlZ3VsYXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlV29yZChsaW5lQ29udGVudCwgd29yZFR5cGUsIGNoQ2xhc3MsIHRoaXMuX2ZpbmRTdGFydE9mV29yZChsaW5lQ29udGVudCwgd29yZFNlcGFyYXRvcnMsIHdvcmRUeXBlLCBjaEluZGV4IC0gMSksIGNoSW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdvcmRUeXBlID0gV29yZFR5cGUuU2VwYXJhdG9yO1xuXHRcdFx0fSBlbHNlIGlmIChjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuV2hpdGVzcGFjZSkge1xuXHRcdFx0XHRpZiAod29yZFR5cGUgIT09IFdvcmRUeXBlLk5vbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlV29yZChsaW5lQ29udGVudCwgd29yZFR5cGUsIGNoQ2xhc3MsIHRoaXMuX2ZpbmRTdGFydE9mV29yZChsaW5lQ29udGVudCwgd29yZFNlcGFyYXRvcnMsIHdvcmRUeXBlLCBjaEluZGV4IC0gMSksIGNoSW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmRUeXBlICE9PSBXb3JkVHlwZS5Ob25lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlV29yZChsaW5lQ29udGVudCwgd29yZFR5cGUsIFdvcmRDaGFyYWN0ZXJDbGFzcy5XaGl0ZXNwYWNlLCB0aGlzLl9maW5kU3RhcnRPZldvcmQobGluZUNvbnRlbnQsIHdvcmRTZXBhcmF0b3JzLCB3b3JkVHlwZSwgbGVuIC0gMSksIGxlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZFN0YXJ0T2ZXb3JkKGxpbmVDb250ZW50OiBzdHJpbmcsIHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgd29yZFR5cGU6IFdvcmRUeXBlLCBzdGFydEluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXG5cdFx0Y29uc3QgcHJldmlvdXNJbnRsV29yZCA9IHdvcmRTZXBhcmF0b3JzLmZpbmRQcmV2SW50bFdvcmRCZWZvcmVPckF0T2Zmc2V0KGxpbmVDb250ZW50LCBzdGFydEluZGV4KTtcblxuXHRcdGZvciAobGV0IGNoSW5kZXggPSBzdGFydEluZGV4OyBjaEluZGV4ID49IDA7IGNoSW5kZXgtLSkge1xuXHRcdFx0Y29uc3QgY2hDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaEluZGV4KTtcblx0XHRcdGNvbnN0IGNoQ2xhc3MgPSB3b3JkU2VwYXJhdG9ycy5nZXQoY2hDb2RlKTtcblxuXHRcdFx0aWYgKHByZXZpb3VzSW50bFdvcmQgJiYgY2hJbmRleCA9PT0gcHJldmlvdXNJbnRsV29yZC5pbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoQ2xhc3MgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5XaGl0ZXNwYWNlKSB7XG5cdFx0XHRcdHJldHVybiBjaEluZGV4ICsgMTtcblx0XHRcdH1cblx0XHRcdGlmICh3b3JkVHlwZSA9PT0gV29yZFR5cGUuUmVndWxhciAmJiBjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuV29yZFNlcGFyYXRvcikge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleCArIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAod29yZFR5cGUgPT09IFdvcmRUeXBlLlNlcGFyYXRvciAmJiBjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhcikge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleCArIDE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBtb3ZlV29yZExlZnQod29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcjogYm9vbGVhbik6IFBvc2l0aW9uIHtcblx0XHRsZXQgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0bGV0IGNvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblxuXHRcdGlmIChjb2x1bW4gPT09IDEpIHtcblx0XHRcdGlmIChsaW5lTnVtYmVyID4gMSkge1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gbGluZU51bWJlciAtIDE7XG5cdFx0XHRcdGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHByZXZXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKSk7XG5cblx0XHRpZiAod29yZE5hdmlnYXRpb25UeXBlID09PSBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIHByZXZXb3JkT25MaW5lID8gcHJldldvcmRPbkxpbmUuc3RhcnQgKyAxIDogMSk7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmROYXZpZ2F0aW9uVHlwZSA9PT0gV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydEZhc3QpIHtcblx0XHRcdGlmIChcblx0XHRcdFx0IWhhc011bHRpY3Vyc29yIC8vIGF2b2lkIGhhdmluZyBtdWx0aXBsZSBjdXJzb3JzIHN0b3AgYXQgZGlmZmVyZW50IGxvY2F0aW9ucyB3aGVuIGRvaW5nIHdvcmQgc3RhcnRcblx0XHRcdFx0JiYgcHJldldvcmRPbkxpbmVcblx0XHRcdFx0JiYgcHJldldvcmRPbkxpbmUud29yZFR5cGUgPT09IFdvcmRUeXBlLlNlcGFyYXRvclxuXHRcdFx0XHQmJiBwcmV2V29yZE9uTGluZS5lbmQgLSBwcmV2V29yZE9uTGluZS5zdGFydCA9PT0gMVxuXHRcdFx0XHQmJiBwcmV2V29yZE9uTGluZS5uZXh0Q2hhckNsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhclxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIFNraXAgb3ZlciBhIHdvcmQgbWFkZSB1cCBvZiBvbmUgc2luZ2xlIHNlcGFyYXRvciBhbmQgZm9sbG93ZWQgYnkgYSByZWd1bGFyIGNoYXJhY3RlclxuXHRcdFx0XHRwcmV2V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kUHJldmlvdXNXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIHByZXZXb3JkT25MaW5lLnN0YXJ0ICsgMSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIHByZXZXb3JkT25MaW5lID8gcHJldldvcmRPbkxpbmUuc3RhcnQgKyAxIDogMSk7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmROYXZpZ2F0aW9uVHlwZSA9PT0gV29yZE5hdmlnYXRpb25UeXBlLldvcmRBY2Nlc3NpYmlsaXR5KSB7XG5cdFx0XHR3aGlsZSAoXG5cdFx0XHRcdHByZXZXb3JkT25MaW5lXG5cdFx0XHRcdCYmIHByZXZXb3JkT25MaW5lLndvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3Jcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBTa2lwIG92ZXIgd29yZHMgbWFkZSB1cCBvZiBvbmx5IHNlcGFyYXRvcnNcblx0XHRcdFx0cHJldldvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZFByZXZpb3VzV29yZE9uTGluZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBwcmV2V29yZE9uTGluZS5zdGFydCArIDEpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBwcmV2V29yZE9uTGluZSA/IHByZXZXb3JkT25MaW5lLnN0YXJ0ICsgMSA6IDEpO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBzdG9wcGluZyBhdCB0aGUgZW5kaW5nIG9mIHdvcmRzXG5cblx0XHRpZiAocHJldldvcmRPbkxpbmUgJiYgY29sdW1uIDw9IHByZXZXb3JkT25MaW5lLmVuZCArIDEpIHtcblx0XHRcdHByZXZXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgcHJldldvcmRPbkxpbmUuc3RhcnQgKyAxKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBwcmV2V29yZE9uTGluZSA/IHByZXZXb3JkT25MaW5lLmVuZCArIDEgOiAxKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgX21vdmVXb3JkUGFydExlZnQobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cblx0XHRpZiAocG9zaXRpb24uY29sdW1uID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gKGxpbmVOdW1iZXIgPiAxID8gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIgLSAxLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIgLSAxKSkgOiBwb3NpdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRmb3IgKGxldCBjb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW4gLSAxOyBjb2x1bW4gPiAxOyBjb2x1bW4tLSkge1xuXHRcdFx0Y29uc3QgbGVmdCA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY29sdW1uIC0gMik7XG5cdFx0XHRjb25zdCByaWdodCA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY29sdW1uIC0gMSk7XG5cblx0XHRcdGlmIChsZWZ0ID09PSBDaGFyQ29kZS5VbmRlcmxpbmUgJiYgcmlnaHQgIT09IENoYXJDb2RlLlVuZGVybGluZSkge1xuXHRcdFx0XHQvLyBzbmFrZV9jYXNlX3ZhcmlhYmxlc1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChsZWZ0ID09PSBDaGFyQ29kZS5EYXNoICYmIHJpZ2h0ICE9PSBDaGFyQ29kZS5EYXNoKSB7XG5cdFx0XHRcdC8vIGtlYmFiLWNhc2UtdmFyaWFibGVzXG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKChzdHJpbmdzLmlzTG93ZXJBc2NpaUxldHRlcihsZWZ0KSB8fCBzdHJpbmdzLmlzQXNjaWlEaWdpdChsZWZ0KSkgJiYgc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIocmlnaHQpKSB7XG5cdFx0XHRcdC8vIGNhbWVsQ2FzZVZhcmlhYmxlc1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdHJpbmdzLmlzVXBwZXJBc2NpaUxldHRlcihsZWZ0KSAmJiBzdHJpbmdzLmlzVXBwZXJBc2NpaUxldHRlcihyaWdodCkpIHtcblx0XHRcdFx0Ly8gdGhpc0lzQUNhbWVsQ2FzZVdpdGhPbmVMZXR0ZXJXb3Jkc1xuXHRcdFx0XHRpZiAoY29sdW1uICsgMSA8IG1heENvbHVtbikge1xuXHRcdFx0XHRcdGNvbnN0IHJpZ2h0UmlnaHQgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNvbHVtbik7XG5cdFx0XHRcdFx0aWYgKHN0cmluZ3MuaXNMb3dlckFzY2lpTGV0dGVyKHJpZ2h0UmlnaHQpIHx8IHN0cmluZ3MuaXNBc2NpaURpZ2l0KHJpZ2h0UmlnaHQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAxKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbW92ZVdvcmRSaWdodCh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUpOiBQb3NpdGlvbiB7XG5cdFx0bGV0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGxldCBjb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cblx0XHRsZXQgbW92ZWREb3duID0gZmFsc2U7XG5cdFx0aWYgKGNvbHVtbiA9PT0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSkge1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPCBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRtb3ZlZERvd24gPSB0cnVlO1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gbGluZU51bWJlciArIDE7XG5cdFx0XHRcdGNvbHVtbiA9IDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IG5leHRXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmROZXh0V29yZE9uTGluZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pKTtcblxuXHRcdGlmICh3b3JkTmF2aWdhdGlvblR5cGUgPT09IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kKSB7XG5cdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUgJiYgbmV4dFdvcmRPbkxpbmUud29yZFR5cGUgPT09IFdvcmRUeXBlLlNlcGFyYXRvcikge1xuXHRcdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUuZW5kIC0gbmV4dFdvcmRPbkxpbmUuc3RhcnQgPT09IDEgJiYgbmV4dFdvcmRPbkxpbmUubmV4dENoYXJDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHRcdFx0XHQvLyBTa2lwIG92ZXIgYSB3b3JkIG1hZGUgdXAgb2Ygb25lIHNpbmdsZSBzZXBhcmF0b3IgYW5kIGZvbGxvd2VkIGJ5IGEgcmVndWxhciBjaGFyYWN0ZXJcblx0XHRcdFx0XHRuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgbmV4dFdvcmRPbkxpbmUuZW5kICsgMSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUpIHtcblx0XHRcdFx0Y29sdW1uID0gbmV4dFdvcmRPbkxpbmUuZW5kICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh3b3JkTmF2aWdhdGlvblR5cGUgPT09IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkQWNjZXNzaWJpbGl0eSkge1xuXHRcdFx0aWYgKG1vdmVkRG93bikge1xuXHRcdFx0XHQvLyBJZiB3ZSBtb3ZlIHRvIHRoZSBuZXh0IGxpbmUsIHByZXRlbmQgdGhhdCB0aGUgY3Vyc29yIGlzIHJpZ2h0IGJlZm9yZSB0aGUgZmlyc3QgY2hhcmFjdGVyLlxuXHRcdFx0XHQvLyBUaGlzIGlzIG5lZWRlZCB3aGVuIHRoZSBmaXJzdCB3b3JkIHN0YXJ0cyByaWdodCBhdCB0aGUgZmlyc3QgY2hhcmFjdGVyIC0gYW5kIGluIG9yZGVyIG5vdCB0byBtaXNzIGl0LFxuXHRcdFx0XHQvLyB3ZSBuZWVkIHRvIHN0YXJ0IGJlZm9yZS5cblx0XHRcdFx0Y29sdW1uID0gMDtcblx0XHRcdH1cblxuXHRcdFx0d2hpbGUgKFxuXHRcdFx0XHRuZXh0V29yZE9uTGluZVxuXHRcdFx0XHQmJiAobmV4dFdvcmRPbkxpbmUud29yZFR5cGUgPT09IFdvcmRUeXBlLlNlcGFyYXRvclxuXHRcdFx0XHRcdHx8IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMSA8PSBjb2x1bW5cblx0XHRcdFx0KVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIFNraXAgb3ZlciBhIHdvcmQgbWFkZSB1cCBvZiBvbmUgc2luZ2xlIHNlcGFyYXRvclxuXHRcdFx0XHQvLyBBbHNvIHNraXAgb3ZlciB3b3JkIGlmIGl0IGJlZ2lucyBiZWZvcmUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24gdG8gYXNjZXJ0YWluIHdlJ3JlIG1vdmluZyBmb3J3YXJkIGF0IGxlYXN0IDEgY2hhcmFjdGVyLlxuXHRcdFx0XHRuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgbmV4dFdvcmRPbkxpbmUuZW5kICsgMSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUpIHtcblx0XHRcdFx0Y29sdW1uID0gbmV4dFdvcmRPbkxpbmUuc3RhcnQgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lICYmICFtb3ZlZERvd24gJiYgY29sdW1uID49IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMSkge1xuXHRcdFx0XHRuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgbmV4dFdvcmRPbkxpbmUuZW5kICsgMSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lKSB7XG5cdFx0XHRcdGNvbHVtbiA9IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBfbW92ZVdvcmRQYXJ0UmlnaHQobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cblx0XHRpZiAocG9zaXRpb24uY29sdW1uID09PSBtYXhDb2x1bW4pIHtcblx0XHRcdHJldHVybiAobGluZU51bWJlciA8IG1vZGVsLmdldExpbmVDb3VudCgpID8gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIgKyAxLCAxKSA6IHBvc2l0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdGZvciAobGV0IGNvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbiArIDE7IGNvbHVtbiA8IG1heENvbHVtbjsgY29sdW1uKyspIHtcblx0XHRcdGNvbnN0IGxlZnQgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNvbHVtbiAtIDIpO1xuXHRcdFx0Y29uc3QgcmlnaHQgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNvbHVtbiAtIDEpO1xuXG5cdFx0XHRpZiAobGVmdCAhPT0gQ2hhckNvZGUuVW5kZXJsaW5lICYmIHJpZ2h0ID09PSBDaGFyQ29kZS5VbmRlcmxpbmUpIHtcblx0XHRcdFx0Ly8gc25ha2VfY2FzZV92YXJpYWJsZXNcblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobGVmdCAhPT0gQ2hhckNvZGUuRGFzaCAmJiByaWdodCA9PT0gQ2hhckNvZGUuRGFzaCkge1xuXHRcdFx0XHQvLyBrZWJhYi1jYXNlLXZhcmlhYmxlc1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmICgoc3RyaW5ncy5pc0xvd2VyQXNjaWlMZXR0ZXIobGVmdCkgfHwgc3RyaW5ncy5pc0FzY2lpRGlnaXQobGVmdCkpICYmIHN0cmluZ3MuaXNVcHBlckFzY2lpTGV0dGVyKHJpZ2h0KSkge1xuXHRcdFx0XHQvLyBjYW1lbENhc2VWYXJpYWJsZXNcblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIobGVmdCkgJiYgc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIocmlnaHQpKSB7XG5cdFx0XHRcdC8vIHRoaXNJc0FDYW1lbENhc2VXaXRoT25lTGV0dGVyV29yZHNcblx0XHRcdFx0aWYgKGNvbHVtbiArIDEgPCBtYXhDb2x1bW4pIHtcblx0XHRcdFx0XHRjb25zdCByaWdodFJpZ2h0ID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjb2x1bW4pO1xuXHRcdFx0XHRcdGlmIChzdHJpbmdzLmlzTG93ZXJBc2NpaUxldHRlcihyaWdodFJpZ2h0KSB8fCBzdHJpbmdzLmlzQXNjaWlEaWdpdChyaWdodFJpZ2h0KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgbWF4Q29sdW1uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBzdGF0aWMgX2RlbGV0ZVdvcmRMZWZ0V2hpdGVzcGFjZShtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pOiBSYW5nZSB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3Qgc3RhcnRJbmRleCA9IHBvc2l0aW9uLmNvbHVtbiAtIDI7XG5cdFx0Y29uc3QgbGFzdE5vbldoaXRlc3BhY2UgPSBzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgobGluZUNvbnRlbnQsIHN0YXJ0SW5kZXgpO1xuXHRcdGlmIChsYXN0Tm9uV2hpdGVzcGFjZSArIDEgPCBzdGFydEluZGV4KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGxhc3ROb25XaGl0ZXNwYWNlICsgMiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZVdvcmRMZWZ0KGN0eDogRGVsZXRlV29yZENvbnRleHQsIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlKTogUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IGN0eC53b3JkU2VwYXJhdG9ycztcblx0XHRjb25zdCBtb2RlbCA9IGN0eC5tb2RlbDtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBjdHguc2VsZWN0aW9uO1xuXHRcdGNvbnN0IHdoaXRlc3BhY2VIZXVyaXN0aWNzID0gY3R4LndoaXRlc3BhY2VIZXVyaXN0aWNzO1xuXG5cdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdH1cblxuXHRcdGlmIChEZWxldGVPcGVyYXRpb25zLmlzQXV0b0Nsb3NpbmdQYWlyRGVsZXRlKGN0eC5hdXRvQ2xvc2luZ0RlbGV0ZSwgY3R4LmF1dG9DbG9zaW5nQnJhY2tldHMsIGN0eC5hdXRvQ2xvc2luZ1F1b3RlcywgY3R4LmF1dG9DbG9zaW5nUGFpcnMuYXV0b0Nsb3NpbmdQYWlyc09wZW5CeUVuZCwgY3R4Lm1vZGVsLCBbY3R4LnNlbGVjdGlvbl0sIGN0eC5hdXRvQ2xvc2VkQ2hhcmFjdGVycykpIHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gY3R4LnNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdFx0cmV0dXJuIG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4gLSAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4gKyAxKTtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihzZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyLCBzZWxlY3Rpb24ucG9zaXRpb25Db2x1bW4pO1xuXG5cdFx0bGV0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGxldCBjb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cblx0XHRpZiAobGluZU51bWJlciA9PT0gMSAmJiBjb2x1bW4gPT09IDEpIHtcblx0XHRcdC8vIElnbm9yZSBkZWxldGluZyBhdCBiZWdpbm5pbmcgb2YgZmlsZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHdoaXRlc3BhY2VIZXVyaXN0aWNzKSB7XG5cdFx0XHRjb25zdCByID0gdGhpcy5fZGVsZXRlV29yZExlZnRXaGl0ZXNwYWNlKG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0XHRpZiAocikge1xuXHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcHJldldvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZFByZXZpb3VzV29yZE9uTGluZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uKTtcblxuXHRcdGlmICh3b3JkTmF2aWdhdGlvblR5cGUgPT09IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQpIHtcblx0XHRcdGlmIChwcmV2V29yZE9uTGluZSkge1xuXHRcdFx0XHRjb2x1bW4gPSBwcmV2V29yZE9uTGluZS5zdGFydCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY29sdW1uID4gMSkge1xuXHRcdFx0XHRcdGNvbHVtbiA9IDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGluZU51bWJlci0tO1xuXHRcdFx0XHRcdGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHByZXZXb3JkT25MaW5lICYmIGNvbHVtbiA8PSBwcmV2V29yZE9uTGluZS5lbmQgKyAxKSB7XG5cdFx0XHRcdHByZXZXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgcHJldldvcmRPbkxpbmUuc3RhcnQgKyAxKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJldldvcmRPbkxpbmUpIHtcblx0XHRcdFx0Y29sdW1uID0gcHJldldvcmRPbkxpbmUuZW5kICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjb2x1bW4gPiAxKSB7XG5cdFx0XHRcdFx0Y29sdW1uID0gMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsaW5lTnVtYmVyLS07XG5cdFx0XHRcdFx0Y29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUmFuZ2UobGluZU51bWJlciwgY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWxldGVJbnNpZGVXb3JkKHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBvbmx5V29yZDogYm9vbGVhbiA9IGZhbHNlKTogUmFuZ2Uge1xuXHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihzZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyLCBzZWxlY3Rpb24ucG9zaXRpb25Db2x1bW4pO1xuXG5cdFx0Y29uc3QgciA9IHRoaXMuX2RlbGV0ZUluc2lkZVdvcmRXaGl0ZXNwYWNlKG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0aWYgKHIpIHtcblx0XHRcdHJldHVybiByO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9kZWxldGVJbnNpZGVXb3JkRGV0ZXJtaW5lRGVsZXRlUmFuZ2Uod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbiwgb25seVdvcmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NoYXJBdElzV2hpdGVzcGFjZShzdHI6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYXJDb2RlID0gc3RyLmNoYXJDb2RlQXQoaW5kZXgpO1xuXHRcdHJldHVybiAoY2hhckNvZGUgPT09IENoYXJDb2RlLlNwYWNlIHx8IGNoYXJDb2RlID09PSBDaGFyQ29kZS5UYWIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RlbGV0ZUluc2lkZVdvcmRXaGl0ZXNwYWNlKG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBsaW5lQ29udGVudExlbmd0aCA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblxuXHRcdGlmIChsaW5lQ29udGVudExlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gZW1wdHkgbGluZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IGxlZnRJbmRleCA9IE1hdGgubWF4KHBvc2l0aW9uLmNvbHVtbiAtIDIsIDApO1xuXHRcdGlmICghdGhpcy5fY2hhckF0SXNXaGl0ZXNwYWNlKGxpbmVDb250ZW50LCBsZWZ0SW5kZXgpKSB7XG5cdFx0XHQvLyB0b3VjaGVzIGEgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVyIHRvIHRoZSBsZWZ0XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgcmlnaHRJbmRleCA9IE1hdGgubWluKHBvc2l0aW9uLmNvbHVtbiAtIDEsIGxpbmVDb250ZW50TGVuZ3RoIC0gMSk7XG5cdFx0aWYgKCF0aGlzLl9jaGFyQXRJc1doaXRlc3BhY2UobGluZUNvbnRlbnQsIHJpZ2h0SW5kZXgpKSB7XG5cdFx0XHQvLyB0b3VjaGVzIGEgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVyIHRvIHRoZSByaWdodFxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gd2FsayBvdmVyIHdoaXRlc3BhY2UgdG8gdGhlIGxlZnRcblx0XHR3aGlsZSAobGVmdEluZGV4ID4gMCAmJiB0aGlzLl9jaGFyQXRJc1doaXRlc3BhY2UobGluZUNvbnRlbnQsIGxlZnRJbmRleCAtIDEpKSB7XG5cdFx0XHRsZWZ0SW5kZXgtLTtcblx0XHR9XG5cblx0XHQvLyB3YWxrIG92ZXIgd2hpdGVzcGFjZSB0byB0aGUgcmlnaHRcblx0XHR3aGlsZSAocmlnaHRJbmRleCArIDEgPCBsaW5lQ29udGVudExlbmd0aCAmJiB0aGlzLl9jaGFyQXRJc1doaXRlc3BhY2UobGluZUNvbnRlbnQsIHJpZ2h0SW5kZXggKyAxKSkge1xuXHRcdFx0cmlnaHRJbmRleCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgbGVmdEluZGV4ICsgMSwgcG9zaXRpb24ubGluZU51bWJlciwgcmlnaHRJbmRleCArIDIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RlbGV0ZUluc2lkZVdvcmREZXRlcm1pbmVEZWxldGVSYW5nZSh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgb25seVdvcmQ6IGJvb2xlYW4pOiBSYW5nZSB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gbGluZUNvbnRlbnQubGVuZ3RoO1xuXHRcdGlmIChsaW5lTGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBlbXB0eSBsaW5lXG5cdFx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA+IDEpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyIC0gMSksIHBvc2l0aW9uLmxpbmVOdW1iZXIsIDEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPCBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgMSwgcG9zaXRpb24ubGluZU51bWJlciArIDEsIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGVtcHR5IG1vZGVsXG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRvdWNoZXNXb3JkID0gKHdvcmQ6IElGaW5kV29yZFJlc3VsdCkgPT4ge1xuXHRcdFx0cmV0dXJuICh3b3JkLnN0YXJ0ICsgMSA8PSBwb3NpdGlvbi5jb2x1bW4gJiYgcG9zaXRpb24uY29sdW1uIDw9IHdvcmQuZW5kICsgMSk7XG5cdFx0fTtcblx0XHRjb25zdCBjcmVhdGVSYW5nZVdpdGhQb3NpdGlvbiA9IChzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcikgPT4ge1xuXHRcdFx0c3RhcnRDb2x1bW4gPSBNYXRoLm1pbihzdGFydENvbHVtbiwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRcdGVuZENvbHVtbiA9IE1hdGgubWF4KGVuZENvbHVtbiwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdFx0fTtcblx0XHRjb25zdCBkZWxldGVXb3JkQW5kQWRqYWNlbnRXaGl0ZXNwYWNlID0gKHdvcmQ6IElGaW5kV29yZFJlc3VsdCkgPT4ge1xuXHRcdFx0bGV0IHN0YXJ0Q29sdW1uID0gd29yZC5zdGFydCArIDE7XG5cdFx0XHRsZXQgZW5kQ29sdW1uID0gd29yZC5lbmQgKyAxO1xuXHRcdFx0aWYgKG9ubHlXb3JkKSB7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVSYW5nZVdpdGhQb3NpdGlvbihzdGFydENvbHVtbiwgZW5kQ29sdW1uKTtcblx0XHRcdH1cblx0XHRcdGxldCBleHBhbmRlZFRvVGhlUmlnaHQgPSBmYWxzZTtcblx0XHRcdHdoaWxlIChlbmRDb2x1bW4gLSAxIDwgbGluZUxlbmd0aCAmJiB0aGlzLl9jaGFyQXRJc1doaXRlc3BhY2UobGluZUNvbnRlbnQsIGVuZENvbHVtbiAtIDEpKSB7XG5cdFx0XHRcdGV4cGFuZGVkVG9UaGVSaWdodCA9IHRydWU7XG5cdFx0XHRcdGVuZENvbHVtbisrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFleHBhbmRlZFRvVGhlUmlnaHQpIHtcblx0XHRcdFx0d2hpbGUgKHN0YXJ0Q29sdW1uID4gMSAmJiB0aGlzLl9jaGFyQXRJc1doaXRlc3BhY2UobGluZUNvbnRlbnQsIHN0YXJ0Q29sdW1uIC0gMikpIHtcblx0XHRcdFx0XHRzdGFydENvbHVtbi0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY3JlYXRlUmFuZ2VXaXRoUG9zaXRpb24oc3RhcnRDb2x1bW4sIGVuZENvbHVtbik7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByZXZXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0aWYgKHByZXZXb3JkT25MaW5lICYmIHRvdWNoZXNXb3JkKHByZXZXb3JkT25MaW5lKSkge1xuXHRcdFx0cmV0dXJuIGRlbGV0ZVdvcmRBbmRBZGphY2VudFdoaXRlc3BhY2UocHJldldvcmRPbkxpbmUpO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0aWYgKG5leHRXb3JkT25MaW5lICYmIHRvdWNoZXNXb3JkKG5leHRXb3JkT25MaW5lKSkge1xuXHRcdFx0cmV0dXJuIGRlbGV0ZVdvcmRBbmRBZGphY2VudFdoaXRlc3BhY2UobmV4dFdvcmRPbkxpbmUpO1xuXHRcdH1cblx0XHRpZiAocHJldldvcmRPbkxpbmUgJiYgbmV4dFdvcmRPbkxpbmUpIHtcblx0XHRcdHJldHVybiBjcmVhdGVSYW5nZVdpdGhQb3NpdGlvbihwcmV2V29yZE9uTGluZS5lbmQgKyAxLCBuZXh0V29yZE9uTGluZS5zdGFydCArIDEpO1xuXHRcdH1cblx0XHRpZiAocHJldldvcmRPbkxpbmUpIHtcblx0XHRcdHJldHVybiBjcmVhdGVSYW5nZVdpdGhQb3NpdGlvbihwcmV2V29yZE9uTGluZS5zdGFydCArIDEsIHByZXZXb3JkT25MaW5lLmVuZCArIDEpO1xuXHRcdH1cblx0XHRpZiAobmV4dFdvcmRPbkxpbmUpIHtcblx0XHRcdHJldHVybiBjcmVhdGVSYW5nZVdpdGhQb3NpdGlvbihuZXh0V29yZE9uTGluZS5zdGFydCArIDEsIG5leHRXb3JkT25MaW5lLmVuZCArIDEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjcmVhdGVSYW5nZVdpdGhQb3NpdGlvbigxLCBsaW5lTGVuZ3RoICsgMSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIF9kZWxldGVXb3JkUGFydExlZnQobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiBSYW5nZSB7XG5cdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvcyA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHRvUG9zaXRpb24gPSBXb3JkT3BlcmF0aW9ucy5fbW92ZVdvcmRQYXJ0TGVmdChtb2RlbCwgcG9zKTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uLCB0b1Bvc2l0aW9uLmxpbmVOdW1iZXIsIHRvUG9zaXRpb24uY29sdW1uKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcihzdHI6IHN0cmluZywgc3RhcnRJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBsZW4gPSBzdHIubGVuZ3RoO1xuXHRcdGZvciAobGV0IGNoSW5kZXggPSBzdGFydEluZGV4OyBjaEluZGV4IDwgbGVuOyBjaEluZGV4KyspIHtcblx0XHRcdGNvbnN0IGNoID0gc3RyLmNoYXJBdChjaEluZGV4KTtcblx0XHRcdGlmIChjaCAhPT0gJyAnICYmIGNoICE9PSAnXFx0Jykge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxlbjtcblx0fVxuXG5cdHByb3RlY3RlZCBzdGF0aWMgX2RlbGV0ZVdvcmRSaWdodFdoaXRlc3BhY2UobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSBwb3NpdGlvbi5jb2x1bW4gLSAxO1xuXHRcdGNvbnN0IGZpcnN0Tm9uV2hpdGVzcGFjZSA9IHRoaXMuX2ZpbmRGaXJzdE5vbldoaXRlc3BhY2VDaGFyKGxpbmVDb250ZW50LCBzdGFydEluZGV4KTtcblx0XHRpZiAoc3RhcnRJbmRleCA8IGZpcnN0Tm9uV2hpdGVzcGFjZSkge1xuXHRcdFx0Ly8gYmluZ29cblx0XHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBmaXJzdE5vbldoaXRlc3BhY2UgKyAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZVdvcmRSaWdodChjdHg6IERlbGV0ZVdvcmRDb250ZXh0LCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSBjdHgud29yZFNlcGFyYXRvcnM7XG5cdFx0Y29uc3QgbW9kZWwgPSBjdHgubW9kZWw7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gY3R4LnNlbGVjdGlvbjtcblx0XHRjb25zdCB3aGl0ZXNwYWNlSGV1cmlzdGljcyA9IGN0eC53aGl0ZXNwYWNlSGV1cmlzdGljcztcblxuXHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihzZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyLCBzZWxlY3Rpb24ucG9zaXRpb25Db2x1bW4pO1xuXG5cdFx0bGV0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGxldCBjb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBtYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdGlmIChsaW5lTnVtYmVyID09PSBsaW5lQ291bnQgJiYgY29sdW1uID09PSBtYXhDb2x1bW4pIHtcblx0XHRcdC8vIElnbm9yZSBkZWxldGluZyBhdCBlbmQgb2YgZmlsZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHdoaXRlc3BhY2VIZXVyaXN0aWNzKSB7XG5cdFx0XHRjb25zdCByID0gdGhpcy5fZGVsZXRlV29yZFJpZ2h0V2hpdGVzcGFjZShtb2RlbCwgcG9zaXRpb24pO1xuXHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IG5leHRXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmROZXh0V29yZE9uTGluZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uKTtcblxuXHRcdGlmICh3b3JkTmF2aWdhdGlvblR5cGUgPT09IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kKSB7XG5cdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUpIHtcblx0XHRcdFx0Y29sdW1uID0gbmV4dFdvcmRPbkxpbmUuZW5kICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjb2x1bW4gPCBtYXhDb2x1bW4gfHwgbGluZU51bWJlciA9PT0gbGluZUNvdW50KSB7XG5cdFx0XHRcdFx0Y29sdW1uID0gbWF4Q29sdW1uO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXIrKztcblx0XHRcdFx0XHRuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSkpO1xuXHRcdFx0XHRcdGlmIChuZXh0V29yZE9uTGluZSkge1xuXHRcdFx0XHRcdFx0Y29sdW1uID0gbmV4dFdvcmRPbkxpbmUuc3RhcnQgKyAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUgJiYgY29sdW1uID49IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMSkge1xuXHRcdFx0XHRuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgbmV4dFdvcmRPbkxpbmUuZW5kICsgMSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lKSB7XG5cdFx0XHRcdGNvbHVtbiA9IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjb2x1bW4gPCBtYXhDb2x1bW4gfHwgbGluZU51bWJlciA9PT0gbGluZUNvdW50KSB7XG5cdFx0XHRcdFx0Y29sdW1uID0gbWF4Q29sdW1uO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXIrKztcblx0XHRcdFx0XHRuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSkpO1xuXHRcdFx0XHRcdGlmIChuZXh0V29yZE9uTGluZSkge1xuXHRcdFx0XHRcdFx0Y29sdW1uID0gbmV4dFdvcmRPbkxpbmUuc3RhcnQgKyAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUmFuZ2UobGluZU51bWJlciwgY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBfZGVsZXRlV29yZFBhcnRSaWdodChtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbik6IFJhbmdlIHtcblx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zID0gc2VsZWN0aW9uLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgdG9Qb3NpdGlvbiA9IFdvcmRPcGVyYXRpb25zLl9tb3ZlV29yZFBhcnRSaWdodChtb2RlbCwgcG9zKTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uLCB0b1Bvc2l0aW9uLmxpbmVOdW1iZXIsIHRvUG9zaXRpb24uY29sdW1uKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jcmVhdGVXb3JkQXRQb3NpdGlvbihtb2RlbDogSVRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCB3b3JkOiBJRmluZFdvcmRSZXN1bHQpOiBJV29yZEF0UG9zaXRpb24ge1xuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIHdvcmQuc3RhcnQgKyAxLCBsaW5lTnVtYmVyLCB3b3JkLmVuZCArIDEpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR3b3JkOiBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpLFxuXHRcdFx0c3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0ZW5kQ29sdW1uOiByYW5nZS5lbmRDb2x1bW5cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXRXb3JkQXRQb3NpdGlvbihtb2RlbDogSVRleHRNb2RlbCwgX3dvcmRTZXBhcmF0b3JzOiBzdHJpbmcsIF9pbnRsU2VnbWVudGVyTG9jYWxlczogc3RyaW5nW10sIHBvc2l0aW9uOiBQb3NpdGlvbik6IElXb3JkQXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoX3dvcmRTZXBhcmF0b3JzLCBfaW50bFNlZ21lbnRlckxvY2FsZXMpO1xuXHRcdGNvbnN0IHByZXZXb3JkID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0aWYgKHByZXZXb3JkICYmIHByZXZXb3JkLndvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyICYmIHByZXZXb3JkLnN0YXJ0IDw9IHBvc2l0aW9uLmNvbHVtbiAtIDEgJiYgcG9zaXRpb24uY29sdW1uIC0gMSA8PSBwcmV2V29yZC5lbmQpIHtcblx0XHRcdHJldHVybiBXb3JkT3BlcmF0aW9ucy5fY3JlYXRlV29yZEF0UG9zaXRpb24obW9kZWwsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHByZXZXb3JkKTtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dFdvcmQgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24pO1xuXHRcdGlmIChuZXh0V29yZCAmJiBuZXh0V29yZC53b3JkVHlwZSA9PT0gV29yZFR5cGUuUmVndWxhciAmJiBuZXh0V29yZC5zdGFydCA8PSBwb3NpdGlvbi5jb2x1bW4gLSAxICYmIHBvc2l0aW9uLmNvbHVtbiAtIDEgPD0gbmV4dFdvcmQuZW5kKSB7XG5cdFx0XHRyZXR1cm4gV29yZE9wZXJhdGlvbnMuX2NyZWF0ZVdvcmRBdFBvc2l0aW9uKG1vZGVsLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBuZXh0V29yZCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyB3b3JkKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgY3Vyc29yOiBTaW5nbGVDdXJzb3JTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBwb3NpdGlvbjogUG9zaXRpb24pOiBTaW5nbGVDdXJzb3JTdGF0ZSB7XG5cdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSBnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyhjb25maWcud29yZFNlcGFyYXRvcnMsIGNvbmZpZy53b3JkU2VnbWVudGVyTG9jYWxlcyk7XG5cdFx0Y29uc3QgcHJldldvcmQgPSBXb3JkT3BlcmF0aW9ucy5fZmluZFByZXZpb3VzV29yZE9uTGluZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uKTtcblx0XHRjb25zdCBuZXh0V29yZCA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbik7XG5cblx0XHRpZiAoIWluU2VsZWN0aW9uTW9kZSkge1xuXHRcdFx0Ly8gRW50ZXJpbmcgd29yZCBzZWxlY3Rpb24gZm9yIHRoZSBmaXJzdCB0aW1lXG5cdFx0XHRsZXQgc3RhcnRDb2x1bW46IG51bWJlcjtcblx0XHRcdGxldCBlbmRDb2x1bW46IG51bWJlcjtcblxuXHRcdFx0aWYgKHByZXZXb3JkICYmIHByZXZXb3JkLndvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyICYmIHByZXZXb3JkLnN0YXJ0IDw9IHBvc2l0aW9uLmNvbHVtbiAtIDEgJiYgcG9zaXRpb24uY29sdW1uIC0gMSA8PSBwcmV2V29yZC5lbmQpIHtcblx0XHRcdFx0Ly8gaXNUb3VjaGluZ1ByZXZXb3JkIChSZWd1bGFyIHdvcmQpXG5cdFx0XHRcdHN0YXJ0Q29sdW1uID0gcHJldldvcmQuc3RhcnQgKyAxO1xuXHRcdFx0XHRlbmRDb2x1bW4gPSBwcmV2V29yZC5lbmQgKyAxO1xuXHRcdFx0fSBlbHNlIGlmIChwcmV2V29yZCAmJiBwcmV2V29yZC53b3JkVHlwZSA9PT0gV29yZFR5cGUuU2VwYXJhdG9yICYmIHByZXZXb3JkLnN0YXJ0IDw9IHBvc2l0aW9uLmNvbHVtbiAtIDEgJiYgcG9zaXRpb24uY29sdW1uIC0gMSA8IHByZXZXb3JkLmVuZCkge1xuXHRcdFx0XHQvLyBpc1RvdWNoaW5nUHJldldvcmQgKFNlcGFyYXRvciB3b3JkKSAtIHN0cmljdGVyIGNoZWNrLCBkb24ndCBpbmNsdWRlIGVuZCBib3VuZGFyeVxuXHRcdFx0XHRzdGFydENvbHVtbiA9IHByZXZXb3JkLnN0YXJ0ICsgMTtcblx0XHRcdFx0ZW5kQ29sdW1uID0gcHJldldvcmQuZW5kICsgMTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dFdvcmQgJiYgbmV4dFdvcmQud29yZFR5cGUgPT09IFdvcmRUeXBlLlJlZ3VsYXIgJiYgbmV4dFdvcmQuc3RhcnQgPD0gcG9zaXRpb24uY29sdW1uIC0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gLSAxIDw9IG5leHRXb3JkLmVuZCkge1xuXHRcdFx0XHQvLyBpc1RvdWNoaW5nTmV4dFdvcmQgKFJlZ3VsYXIgd29yZClcblx0XHRcdFx0c3RhcnRDb2x1bW4gPSBuZXh0V29yZC5zdGFydCArIDE7XG5cdFx0XHRcdGVuZENvbHVtbiA9IG5leHRXb3JkLmVuZCArIDE7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHRXb3JkICYmIG5leHRXb3JkLndvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3IgJiYgbmV4dFdvcmQuc3RhcnQgPD0gcG9zaXRpb24uY29sdW1uIC0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gLSAxIDwgbmV4dFdvcmQuZW5kKSB7XG5cdFx0XHRcdC8vIGlzVG91Y2hpbmdOZXh0V29yZCAoU2VwYXJhdG9yIHdvcmQpIC0gc3RyaWN0ZXIgY2hlY2ssIGRvbid0IGluY2x1ZGUgZW5kIGJvdW5kYXJ5XG5cdFx0XHRcdHN0YXJ0Q29sdW1uID0gbmV4dFdvcmQuc3RhcnQgKyAxO1xuXHRcdFx0XHRlbmRDb2x1bW4gPSBuZXh0V29yZC5lbmQgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHByZXZXb3JkKSB7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW4gPSBwcmV2V29yZC5lbmQgKyAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uID0gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmV4dFdvcmQpIHtcblx0XHRcdFx0XHRlbmRDb2x1bW4gPSBuZXh0V29yZC5zdGFydCArIDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW5kQ29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmV3IFNpbmdsZUN1cnNvclN0YXRlKFxuXHRcdFx0XHRuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIGVuZENvbHVtbiksIFNlbGVjdGlvblN0YXJ0S2luZC5Xb3JkLCAwLFxuXHRcdFx0XHRuZXcgUG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciwgZW5kQ29sdW1uKSwgMFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRsZXQgc3RhcnRDb2x1bW46IG51bWJlcjtcblx0XHRsZXQgZW5kQ29sdW1uOiBudW1iZXI7XG5cblx0XHRpZiAocHJldldvcmQgJiYgcHJldldvcmQud29yZFR5cGUgPT09IFdvcmRUeXBlLlJlZ3VsYXIgJiYgcHJldldvcmQuc3RhcnQgPCBwb3NpdGlvbi5jb2x1bW4gLSAxICYmIHBvc2l0aW9uLmNvbHVtbiAtIDEgPCBwcmV2V29yZC5lbmQpIHtcblx0XHRcdC8vIGlzSW5zaWRlUHJldldvcmQgKFJlZ3VsYXIgd29yZClcblx0XHRcdHN0YXJ0Q29sdW1uID0gcHJldldvcmQuc3RhcnQgKyAxO1xuXHRcdFx0ZW5kQ29sdW1uID0gcHJldldvcmQuZW5kICsgMTtcblx0XHR9IGVsc2UgaWYgKG5leHRXb3JkICYmIG5leHRXb3JkLndvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyICYmIG5leHRXb3JkLnN0YXJ0IDwgcG9zaXRpb24uY29sdW1uIC0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gLSAxIDwgbmV4dFdvcmQuZW5kKSB7XG5cdFx0XHQvLyBpc0luc2lkZU5leHRXb3JkIChSZWd1bGFyIHdvcmQpXG5cdFx0XHRzdGFydENvbHVtbiA9IG5leHRXb3JkLnN0YXJ0ICsgMTtcblx0XHRcdGVuZENvbHVtbiA9IG5leHRXb3JkLmVuZCArIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXJ0Q29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXHRcdFx0ZW5kQ29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGxldCBjb2x1bW46IG51bWJlcjtcblx0XHRpZiAoY3Vyc29yLnNlbGVjdGlvblN0YXJ0LmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRjb2x1bW4gPSBjdXJzb3Iuc2VsZWN0aW9uU3RhcnQuZW5kQ29sdW1uO1xuXHRcdH0gZWxzZSBpZiAocG9zaXRpb24uaXNCZWZvcmVPckVxdWFsKGN1cnNvci5zZWxlY3Rpb25TdGFydC5nZXRTdGFydFBvc2l0aW9uKCkpKSB7XG5cdFx0XHRjb2x1bW4gPSBzdGFydENvbHVtbjtcblx0XHRcdGNvbnN0IHBvc3NpYmxlUG9zaXRpb24gPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0XHRcdGlmIChjdXJzb3Iuc2VsZWN0aW9uU3RhcnQuY29udGFpbnNQb3NpdGlvbihwb3NzaWJsZVBvc2l0aW9uKSkge1xuXHRcdFx0XHRjb2x1bW4gPSBjdXJzb3Iuc2VsZWN0aW9uU3RhcnQuZW5kQ29sdW1uO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb2x1bW4gPSBlbmRDb2x1bW47XG5cdFx0XHRjb25zdCBwb3NzaWJsZVBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHRpZiAoY3Vyc29yLnNlbGVjdGlvblN0YXJ0LmNvbnRhaW5zUG9zaXRpb24ocG9zc2libGVQb3NpdGlvbikpIHtcblx0XHRcdFx0Y29sdW1uID0gY3Vyc29yLnNlbGVjdGlvblN0YXJ0LnN0YXJ0Q29sdW1uO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjdXJzb3IubW92ZSh0cnVlLCBsaW5lTnVtYmVyLCBjb2x1bW4sIDApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JkUGFydE9wZXJhdGlvbnMgZXh0ZW5kcyBXb3JkT3BlcmF0aW9ucyB7XG5cdHB1YmxpYyBzdGF0aWMgZGVsZXRlV29yZFBhcnRMZWZ0KGN0eDogRGVsZXRlV29yZENvbnRleHQpOiBSYW5nZSB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGVuZm9yY2VEZWZpbmVkKFtcblx0XHRcdFdvcmRPcGVyYXRpb25zLmRlbGV0ZVdvcmRMZWZ0KGN0eCwgV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCksXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5kZWxldGVXb3JkTGVmdChjdHgsIFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kKSxcblx0XHRcdFdvcmRPcGVyYXRpb25zLl9kZWxldGVXb3JkUGFydExlZnQoY3R4Lm1vZGVsLCBjdHguc2VsZWN0aW9uKVxuXHRcdF0pO1xuXHRcdGNhbmRpZGF0ZXMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdFbmRzKTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlc1syXTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVsZXRlV29yZFBhcnRSaWdodChjdHg6IERlbGV0ZVdvcmRDb250ZXh0KTogUmFuZ2Uge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBlbmZvcmNlRGVmaW5lZChbXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5kZWxldGVXb3JkUmlnaHQoY3R4LCBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0KSxcblx0XHRcdFdvcmRPcGVyYXRpb25zLmRlbGV0ZVdvcmRSaWdodChjdHgsIFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kKSxcblx0XHRcdFdvcmRPcGVyYXRpb25zLl9kZWxldGVXb3JkUGFydFJpZ2h0KGN0eC5tb2RlbCwgY3R4LnNlbGVjdGlvbilcblx0XHRdKTtcblx0XHRjYW5kaWRhdGVzLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlc1swXTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbW92ZVdvcmRQYXJ0TGVmdCh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgaGFzTXVsdGljdXJzb3I6IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGVuZm9yY2VEZWZpbmVkKFtcblx0XHRcdFdvcmRPcGVyYXRpb25zLm1vdmVXb3JkTGVmdCh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uLCBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0LCBoYXNNdWx0aWN1cnNvciksXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5tb3ZlV29yZExlZnQod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbiwgV29yZE5hdmlnYXRpb25UeXBlLldvcmRFbmQsIGhhc011bHRpY3Vyc29yKSxcblx0XHRcdFdvcmRPcGVyYXRpb25zLl9tb3ZlV29yZFBhcnRMZWZ0KG1vZGVsLCBwb3NpdGlvbilcblx0XHRdKTtcblx0XHRjYW5kaWRhdGVzLnNvcnQoUG9zaXRpb24uY29tcGFyZSk7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZXNbMl07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1vdmVXb3JkUGFydFJpZ2h0KHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBlbmZvcmNlRGVmaW5lZChbXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5tb3ZlV29yZFJpZ2h0KHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24sIFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQpLFxuXHRcdFx0V29yZE9wZXJhdGlvbnMubW92ZVdvcmRSaWdodCh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uLCBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCksXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5fbW92ZVdvcmRQYXJ0UmlnaHQobW9kZWwsIHBvc2l0aW9uKVxuXHRcdF0pO1xuXHRcdGNhbmRpZGF0ZXMuc29ydChQb3NpdGlvbi5jb21wYXJlKTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlc1swXTtcblx0fVxufVxuXG5mdW5jdGlvbiBlbmZvcmNlRGVmaW5lZDxUPihhcnI6IEFycmF5PFQgfCB1bmRlZmluZWQgfCBudWxsPik6IFRbXSB7XG5cdHJldHVybiA8VFtdPmFyci5maWx0ZXIoZWwgPT4gQm9vbGVhbihlbCkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxhQUFhO0FBRXpCLFNBQWtELG9CQUFvQix5QkFBeUI7QUFDL0YsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBa0UsK0JBQStCO0FBQzFHLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQXlCdEIsSUFBVyxXQUFYLGtCQUFXQSxjQUFYO0FBQ0MsRUFBQUEsb0JBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsb0JBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsb0JBQUEsZUFBWSxLQUFaO0FBSFUsU0FBQUE7QUFBQSxHQUFBO0FBTUosSUFBVyxxQkFBWCxrQkFBV0Msd0JBQVg7QUFDTixFQUFBQSx3Q0FBQSxlQUFZLEtBQVo7QUFDQSxFQUFBQSx3Q0FBQSxtQkFBZ0IsS0FBaEI7QUFDQSxFQUFBQSx3Q0FBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSx3Q0FBQSx1QkFBb0IsS0FBcEI7QUFKaUIsU0FBQUE7QUFBQSxHQUFBO0FBbUJYLE1BQU0sZUFBZTtBQUFBLEVBRTNCLE9BQWUsWUFBWSxhQUFxQixVQUFvQixlQUFtQyxPQUFlLEtBQThCO0FBRW5KLFdBQU8sRUFBRSxPQUFjLEtBQVUsVUFBb0IsY0FBNkI7QUFBQSxFQUNuRjtBQUFBLEVBRUEsT0FBZSxnQkFB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Q2pDLGVBQWUsZUFBZSxLQUFLLGlCQUE0QjtBQUFBLE1BQy9ELGVBQWUsZUFBZSxLQUFLLGVBQTBCO0FBQUEsTUFDN0QsZUFBZSxvQkFBb0IsSUFBSSxPQUFPLElBQUksU0FBUztBQUFBLElBQzVELENBQUM7QUFDRCxlQUFXLEtBQUssTUFBTSxzQkFBc0I7QUFDNUMsV0FBTyxXQUFXLENBQUM7QUFBQSxFQUNwQjtBQUFBLEVBRUEsT0FBYyxvQkFBb0IsS0FBK0I7QUFDaEUsVUFBTSxhQUFhLGVBQWU7QUFBQSxNQUNqQyxlQUFlLGdCQUFnQixLQUFLLGlCQUE0QjtBQUFBLE1BQ2hFLGVBQWUsZ0JBQWdCLEtBQUssZUFBMEI7QUFBQSxNQUM5RCxlQUFlLHFCQUFxQixJQUFJLE9BQU8sSUFBSSxTQUFTO0FBQUEsSUFDN0QsQ0FBQztBQUNELGVBQVcsS0FBSyxNQUFNLHdCQUF3QjtBQUM5QyxXQUFPLFdBQVcsQ0FBQztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxPQUFjLGlCQUFpQixnQkFBeUMsT0FBMkIsVUFBb0IsZ0JBQW1DO0FBQ3pKLFVBQU0sYUFBYSxlQUFlO0FBQUEsTUFDakMsZUFBZSxhQUFhLGdCQUFnQixPQUFPLFVBQVUsbUJBQThCLGNBQWM7QUFBQSxNQUN6RyxlQUFlLGFBQWEsZ0JBQWdCLE9BQU8sVUFBVSxpQkFBNEIsY0FBYztBQUFBLE1BQ3ZHLGVBQWUsa0JBQWtCLE9BQU8sUUFBUTtBQUFBLElBQ2pELENBQUM7QUFDRCxlQUFXLEtBQUssU0FBUyxPQUFPO0FBQ2hDLFdBQU8sV0FBVyxDQUFDO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE9BQWMsa0JBQWtCLGdCQUF5QyxPQUEyQixVQUE4QjtBQUNqSSxVQUFNLGFBQWEsZUFBZTtBQUFBLE1BQ2pDLGVBQWUsY0FBYyxnQkFBZ0IsT0FBTyxVQUFVLGlCQUE0QjtBQUFBLE1BQzFGLGVBQWUsY0FBYyxnQkFBZ0IsT0FBTyxVQUFVLGVBQTBCO0FBQUEsTUFDeEYsZUFBZSxtQkFBbUIsT0FBTyxRQUFRO0FBQUEsSUFDbEQsQ0FBQztBQUNELGVBQVcsS0FBSyxTQUFTLE9BQU87QUFDaEMsV0FBTyxXQUFXLENBQUM7QUFBQSxFQUNwQjtBQUNEO0FBRUEsU0FBUyxlQUFrQixLQUF1QztBQUNqRSxTQUFZLElBQUksT0FBTyxRQUFNLFFBQVEsRUFBRSxDQUFDO0FBQ3pDOyIsCiAgIm5hbWVzIjogWyJXb3JkVHlwZSIsICJXb3JkTmF2aWdhdGlvblR5cGUiLCAicG9zaXRpb24iLCAic3RhcnRDb2x1bW4iLCAiZW5kQ29sdW1uIl0KfQo=
