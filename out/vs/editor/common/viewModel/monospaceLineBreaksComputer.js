import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { WrappingIndent, EditorOption } from "../config/editorOptions.js";
import { CharacterClassifier } from "../core/characterClassifier.js";
import { LineInjectedText } from "../textModelEvents.js";
import { ModelLineProjectionData } from "../modelLineProjectionData.js";
class MonospaceLineBreaksComputerFactory {
  static create(options) {
    return new MonospaceLineBreaksComputerFactory(
      options.get(EditorOption.wordWrapBreakBeforeCharacters),
      options.get(EditorOption.wordWrapBreakAfterCharacters)
    );
  }
  constructor(breakBeforeChars, breakAfterChars) {
    this.classifier = new WrappingCharacterClassifier(breakBeforeChars, breakAfterChars);
  }
  createLineBreaksComputer(context, fontInfo, tabSize, wrappingColumn, wrappingIndent, wordBreak, wrapOnEscapedLineFeeds) {
    const lineNumbers = [];
    const previousBreakingData = [];
    return {
      addRequest: (lineNumber, previousLineBreakData) => {
        lineNumbers.push(lineNumber);
        previousBreakingData.push(previousLineBreakData);
      },
      finalize: () => {
        const columnsForFullWidthChar = fontInfo.typicalFullwidthCharacterWidth / fontInfo.typicalHalfwidthCharacterWidth;
        const result = [];
        for (let i = 0, len = lineNumbers.length; i < len; i++) {
          const lineNumber = lineNumbers[i];
          const injectedText = context.getLineInjectedText(lineNumber);
          const lineText = context.getLineContent(lineNumber);
          const previousLineBreakData = previousBreakingData[i];
          const isLineFeedWrappingEnabled = wrapOnEscapedLineFeeds && lineText.includes('"') && lineText.includes("\\n");
          if (previousLineBreakData && !previousLineBreakData.injectionOptions && !injectedText && !isLineFeedWrappingEnabled) {
            result[i] = createLineBreaksFromPreviousLineBreaks(this.classifier, previousLineBreakData, lineText, tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent, wordBreak);
          } else {
            result[i] = createLineBreaks(this.classifier, lineText, injectedText, tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent, wordBreak, isLineFeedWrappingEnabled);
          }
        }
        arrPool1.length = 0;
        arrPool2.length = 0;
        return result;
      }
    };
  }
}
var CharacterClass = /* @__PURE__ */ ((CharacterClass2) => {
  CharacterClass2[CharacterClass2["NONE"] = 0] = "NONE";
  CharacterClass2[CharacterClass2["BREAK_BEFORE"] = 1] = "BREAK_BEFORE";
  CharacterClass2[CharacterClass2["BREAK_AFTER"] = 2] = "BREAK_AFTER";
  CharacterClass2[CharacterClass2["BREAK_IDEOGRAPHIC"] = 3] = "BREAK_IDEOGRAPHIC";
  return CharacterClass2;
})(CharacterClass || {});
class WrappingCharacterClassifier extends CharacterClassifier {
  constructor(BREAK_BEFORE, BREAK_AFTER) {
    super(0 /* NONE */);
    for (let i = 0; i < BREAK_BEFORE.length; i++) {
      this.set(BREAK_BEFORE.charCodeAt(i), 1 /* BREAK_BEFORE */);
    }
    for (let i = 0; i < BREAK_AFTER.length; i++) {
      this.set(BREAK_AFTER.charCodeAt(i), 2 /* BREAK_AFTER */);
    }
  }
  get(charCode) {
    if (charCode >= 0 && charCode < 256) {
      return this._asciiMap[charCode];
    } else {
      if (charCode >= 12352 && charCode <= 12543 || charCode >= 13312 && charCode <= 19903 || charCode >= 19968 && charCode <= 40959) {
        return 3 /* BREAK_IDEOGRAPHIC */;
      }
      return this._map.get(charCode) || this._defaultValue;
    }
  }
}
let arrPool1 = [];
let arrPool2 = [];
function createLineBreaksFromPreviousLineBreaks(classifier, previousBreakingData, lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent, wordBreak) {
  if (firstLineBreakColumn === -1) {
    return null;
  }
  const len = lineText.length;
  if (len <= 1) {
    return null;
  }
  const isKeepAll = wordBreak === "keepAll";
  const prevBreakingOffsets = previousBreakingData.breakOffsets;
  const prevBreakingOffsetsVisibleColumn = previousBreakingData.breakOffsetsVisibleColumn;
  const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent);
  const wrappedLineBreakColumn = firstLineBreakColumn - wrappedTextIndentLength;
  const breakingOffsets = arrPool1;
  const breakingOffsetsVisibleColumn = arrPool2;
  let breakingOffsetsCount = 0;
  let lastBreakingOffset = 0;
  let lastBreakingOffsetVisibleColumn = 0;
  let breakingColumn = firstLineBreakColumn;
  const prevLen = prevBreakingOffsets.length;
  let prevIndex = 0;
  if (prevIndex >= 0) {
    let bestDistance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
    while (prevIndex + 1 < prevLen) {
      const distance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
      if (distance >= bestDistance) {
        break;
      }
      bestDistance = distance;
      prevIndex++;
    }
  }
  while (prevIndex < prevLen) {
    let prevBreakOffset = prevIndex < 0 ? 0 : prevBreakingOffsets[prevIndex];
    let prevBreakOffsetVisibleColumn = prevIndex < 0 ? 0 : prevBreakingOffsetsVisibleColumn[prevIndex];
    if (lastBreakingOffset > prevBreakOffset) {
      prevBreakOffset = lastBreakingOffset;
      prevBreakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn;
    }
    let breakOffset = 0;
    let breakOffsetVisibleColumn = 0;
    let forcedBreakOffset = 0;
    let forcedBreakOffsetVisibleColumn = 0;
    if (prevBreakOffsetVisibleColumn <= breakingColumn) {
      let visibleColumn = prevBreakOffsetVisibleColumn;
      let prevCharCode = prevBreakOffset === 0 ? CharCode.Null : lineText.charCodeAt(prevBreakOffset - 1);
      let prevCharCodeClass = prevBreakOffset === 0 ? 0 /* NONE */ : classifier.get(prevCharCode);
      let entireLineFits = true;
      for (let i = prevBreakOffset; i < len; i++) {
        const charStartOffset = i;
        const charCode = lineText.charCodeAt(i);
        let charCodeClass;
        let charWidth;
        if (strings.isHighSurrogate(charCode)) {
          i++;
          charCodeClass = 0 /* NONE */;
          charWidth = 2;
        } else {
          charCodeClass = classifier.get(charCode);
          charWidth = computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar);
        }
        if (charStartOffset > lastBreakingOffset && canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
          breakOffset = charStartOffset;
          breakOffsetVisibleColumn = visibleColumn;
        }
        visibleColumn += charWidth;
        if (visibleColumn > breakingColumn) {
          if (charStartOffset > lastBreakingOffset) {
            forcedBreakOffset = charStartOffset;
            forcedBreakOffsetVisibleColumn = visibleColumn - charWidth;
          } else {
            forcedBreakOffset = i + 1;
            forcedBreakOffsetVisibleColumn = visibleColumn;
          }
          if (visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakColumn) {
            breakOffset = 0;
          }
          entireLineFits = false;
          break;
        }
        prevCharCode = charCode;
        prevCharCodeClass = charCodeClass;
      }
      if (entireLineFits) {
        if (breakingOffsetsCount > 0) {
          breakingOffsets[breakingOffsetsCount] = prevBreakingOffsets[prevBreakingOffsets.length - 1];
          breakingOffsetsVisibleColumn[breakingOffsetsCount] = prevBreakingOffsetsVisibleColumn[prevBreakingOffsets.length - 1];
          breakingOffsetsCount++;
        }
        break;
      }
    }
    if (breakOffset === 0) {
      let visibleColumn = prevBreakOffsetVisibleColumn;
      let charCode = lineText.charCodeAt(prevBreakOffset);
      let charCodeClass = classifier.get(charCode);
      let hitATabCharacter = false;
      for (let i = prevBreakOffset - 1; i >= lastBreakingOffset; i--) {
        const charStartOffset = i + 1;
        const prevCharCode = lineText.charCodeAt(i);
        if (prevCharCode === CharCode.Tab) {
          hitATabCharacter = true;
          break;
        }
        let prevCharCodeClass;
        let prevCharWidth;
        if (strings.isLowSurrogate(prevCharCode)) {
          i--;
          prevCharCodeClass = 0 /* NONE */;
          prevCharWidth = 2;
        } else {
          prevCharCodeClass = classifier.get(prevCharCode);
          prevCharWidth = strings.isFullWidthCharacter(prevCharCode) ? columnsForFullWidthChar : 1;
        }
        if (visibleColumn <= breakingColumn) {
          if (forcedBreakOffset === 0) {
            forcedBreakOffset = charStartOffset;
            forcedBreakOffsetVisibleColumn = visibleColumn;
          }
          if (visibleColumn <= breakingColumn - wrappedLineBreakColumn) {
            break;
          }
          if (canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
            breakOffset = charStartOffset;
            breakOffsetVisibleColumn = visibleColumn;
            break;
          }
        }
        visibleColumn -= prevCharWidth;
        charCode = prevCharCode;
        charCodeClass = prevCharCodeClass;
      }
      if (breakOffset !== 0) {
        const remainingWidthOfNextLine = wrappedLineBreakColumn - (forcedBreakOffsetVisibleColumn - breakOffsetVisibleColumn);
        if (remainingWidthOfNextLine <= tabSize) {
          const charCodeAtForcedBreakOffset = lineText.charCodeAt(forcedBreakOffset);
          let charWidth;
          if (strings.isHighSurrogate(charCodeAtForcedBreakOffset)) {
            charWidth = 2;
          } else {
            charWidth = computeCharWidth(charCodeAtForcedBreakOffset, forcedBreakOffsetVisibleColumn, tabSize, columnsForFullWidthChar);
          }
          if (remainingWidthOfNextLine - charWidth < 0) {
            breakOffset = 0;
          }
        }
      }
      if (hitATabCharacter) {
        prevIndex--;
        continue;
      }
    }
    if (breakOffset === 0) {
      breakOffset = forcedBreakOffset;
      breakOffsetVisibleColumn = forcedBreakOffsetVisibleColumn;
    }
    if (breakOffset <= lastBreakingOffset) {
      const charCode = lineText.charCodeAt(lastBreakingOffset);
      if (strings.isHighSurrogate(charCode)) {
        breakOffset = lastBreakingOffset + 2;
        breakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn + 2;
      } else {
        breakOffset = lastBreakingOffset + 1;
        breakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn + computeCharWidth(charCode, lastBreakingOffsetVisibleColumn, tabSize, columnsForFullWidthChar);
      }
    }
    lastBreakingOffset = breakOffset;
    breakingOffsets[breakingOffsetsCount] = breakOffset;
    lastBreakingOffsetVisibleColumn = breakOffsetVisibleColumn;
    breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
    breakingOffsetsCount++;
    breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakColumn;
    while (prevIndex < 0 || prevIndex < prevLen && prevBreakingOffsetsVisibleColumn[prevIndex] < breakOffsetVisibleColumn) {
      prevIndex++;
    }
    let bestDistance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
    while (prevIndex + 1 < prevLen) {
      const distance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
      if (distance >= bestDistance) {
        break;
      }
      bestDistance = distance;
      prevIndex++;
    }
  }
  if (breakingOffsetsCount === 0) {
    return null;
  }
  breakingOffsets.length = breakingOffsetsCount;
  breakingOffsetsVisibleColumn.length = breakingOffsetsCount;
  arrPool1 = previousBreakingData.breakOffsets;
  arrPool2 = previousBreakingData.breakOffsetsVisibleColumn;
  previousBreakingData.breakOffsets = breakingOffsets;
  previousBreakingData.breakOffsetsVisibleColumn = breakingOffsetsVisibleColumn;
  previousBreakingData.wrappedTextIndentLength = wrappedTextIndentLength;
  return previousBreakingData;
}
function createLineBreaks(classifier, _lineText, injectedTexts, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent, wordBreak, wrapOnEscapedLineFeeds) {
  const lineText = LineInjectedText.applyInjectedText(_lineText, injectedTexts);
  let injectionOptions;
  let injectionOffsets;
  if (injectedTexts && injectedTexts.length > 0) {
    injectionOptions = injectedTexts.map((t) => t.options);
    injectionOffsets = injectedTexts.map((text) => text.column - 1);
  } else {
    injectionOptions = null;
    injectionOffsets = null;
  }
  if (firstLineBreakColumn === -1) {
    if (!injectionOptions) {
      return null;
    }
    return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
  }
  const len = lineText.length;
  if (len <= 1) {
    if (!injectionOptions) {
      return null;
    }
    return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
  }
  const isKeepAll = wordBreak === "keepAll";
  const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent);
  const wrappedLineBreakColumn = firstLineBreakColumn - wrappedTextIndentLength;
  const breakingOffsets = [];
  const breakingOffsetsVisibleColumn = [];
  let breakingOffsetsCount = 0;
  let breakOffset = 0;
  let breakOffsetVisibleColumn = 0;
  let breakingColumn = firstLineBreakColumn;
  let prevCharCode = lineText.charCodeAt(0);
  let prevCharCodeClass = classifier.get(prevCharCode);
  let visibleColumn = computeCharWidth(prevCharCode, 0, tabSize, columnsForFullWidthChar);
  let startOffset = 1;
  if (strings.isHighSurrogate(prevCharCode)) {
    visibleColumn += 1;
    prevCharCode = lineText.charCodeAt(1);
    prevCharCodeClass = classifier.get(prevCharCode);
    startOffset++;
  }
  for (let i = startOffset; i < len; i++) {
    const charStartOffset = i;
    const charCode = lineText.charCodeAt(i);
    let charCodeClass;
    let charWidth;
    let wrapEscapedLineFeed = false;
    if (strings.isHighSurrogate(charCode)) {
      i++;
      charCodeClass = 0 /* NONE */;
      charWidth = 2;
    } else {
      charCodeClass = classifier.get(charCode);
      charWidth = computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar);
    }
    if (wrapOnEscapedLineFeeds && isEscapedLineBreakAtPosition(lineText, i)) {
      breakOffset = charStartOffset;
      breakOffsetVisibleColumn = visibleColumn;
      wrapEscapedLineFeed = true;
    } else if (canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
      breakOffset = charStartOffset;
      breakOffsetVisibleColumn = visibleColumn;
    }
    visibleColumn += charWidth;
    if (visibleColumn > breakingColumn || wrapEscapedLineFeed) {
      if (breakOffset === 0 || visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakColumn) {
        breakOffset = charStartOffset;
        breakOffsetVisibleColumn = visibleColumn - charWidth;
      }
      breakingOffsets[breakingOffsetsCount] = breakOffset;
      breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
      breakingOffsetsCount++;
      breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakColumn;
      breakOffset = 0;
    }
    prevCharCode = charCode;
    prevCharCodeClass = charCodeClass;
  }
  if (breakingOffsetsCount === 0 && (!injectedTexts || injectedTexts.length === 0)) {
    return null;
  }
  breakingOffsets[breakingOffsetsCount] = len;
  breakingOffsetsVisibleColumn[breakingOffsetsCount] = visibleColumn;
  return new ModelLineProjectionData(injectionOffsets, injectionOptions, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
}
function computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar) {
  if (charCode === CharCode.Tab) {
    return tabSize - visibleColumn % tabSize;
  }
  if (strings.isFullWidthCharacter(charCode)) {
    return columnsForFullWidthChar;
  }
  if (charCode < 32) {
    return columnsForFullWidthChar;
  }
  return 1;
}
function tabCharacterWidth(visibleColumn, tabSize) {
  return tabSize - visibleColumn % tabSize;
}
function isEscapedLineBreakAtPosition(lineText, i) {
  if (i >= 2 && lineText.charAt(i - 1) === "n") {
    let escapeCount = 0;
    for (let j = i - 2; j >= 0; j--) {
      if (lineText.charAt(j) === "\\") {
        escapeCount++;
      } else {
        return escapeCount % 2 === 1;
      }
    }
  }
  return false;
}
function canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll) {
  return charCode !== CharCode.Space && (prevCharCodeClass === 2 /* BREAK_AFTER */ && charCodeClass !== 2 /* BREAK_AFTER */ || prevCharCodeClass !== 1 /* BREAK_BEFORE */ && charCodeClass === 1 /* BREAK_BEFORE */ || !isKeepAll && prevCharCodeClass === 3 /* BREAK_IDEOGRAPHIC */ && charCodeClass !== 2 /* BREAK_AFTER */ || !isKeepAll && charCodeClass === 3 /* BREAK_IDEOGRAPHIC */ && prevCharCodeClass !== 1 /* BREAK_BEFORE */);
}
function computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent) {
  let wrappedTextIndentLength = 0;
  if (wrappingIndent !== WrappingIndent.None) {
    const firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineText);
    if (firstNonWhitespaceIndex !== -1) {
      for (let i = 0; i < firstNonWhitespaceIndex; i++) {
        const charWidth = lineText.charCodeAt(i) === CharCode.Tab ? tabCharacterWidth(wrappedTextIndentLength, tabSize) : 1;
        wrappedTextIndentLength += charWidth;
      }
      const numberOfAdditionalTabs = wrappingIndent === WrappingIndent.DeepIndent ? 2 : wrappingIndent === WrappingIndent.Indent ? 1 : 0;
      for (let i = 0; i < numberOfAdditionalTabs; i++) {
        const charWidth = tabCharacterWidth(wrappedTextIndentLength, tabSize);
        wrappedTextIndentLength += charWidth;
      }
      if (wrappedTextIndentLength + columnsForFullWidthChar > firstLineBreakColumn) {
        wrappedTextIndentLength = 0;
      }
    }
  }
  return wrappedTextIndentLength;
}
export {
  MonospaceLineBreaksComputerFactory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdmlld01vZGVsL21vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFdyYXBwaW5nSW5kZW50LCBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGFyYWN0ZXJDbGFzc2lmaWVyIH0gZnJvbSAnLi4vY29yZS9jaGFyYWN0ZXJDbGFzc2lmaWVyLmpzJztcbmltcG9ydCB7IEZvbnRJbmZvIH0gZnJvbSAnLi4vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IExpbmVJbmplY3RlZFRleHQgfSBmcm9tICcuLi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgSW5qZWN0ZWRUZXh0T3B0aW9ucyB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LCBJTGluZUJyZWFrc0NvbXB1dGVyLCBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSwgSUxpbmVCcmVha3NDb21wdXRlckNvbnRleHQgfSBmcm9tICcuLi9tb2RlbExpbmVQcm9qZWN0aW9uRGF0YS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5IGltcGxlbWVudHMgSUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnkge1xuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zKTogTW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSB7XG5cdFx0cmV0dXJuIG5ldyBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5KFxuXHRcdFx0b3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzKSxcblx0XHRcdG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcEJyZWFrQWZ0ZXJDaGFyYWN0ZXJzKVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNsYXNzaWZpZXI6IFdyYXBwaW5nQ2hhcmFjdGVyQ2xhc3NpZmllcjtcblxuXHRjb25zdHJ1Y3RvcihicmVha0JlZm9yZUNoYXJzOiBzdHJpbmcsIGJyZWFrQWZ0ZXJDaGFyczogc3RyaW5nKSB7XG5cdFx0dGhpcy5jbGFzc2lmaWVyID0gbmV3IFdyYXBwaW5nQ2hhcmFjdGVyQ2xhc3NpZmllcihicmVha0JlZm9yZUNoYXJzLCBicmVha0FmdGVyQ2hhcnMpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUxpbmVCcmVha3NDb21wdXRlcihjb250ZXh0OiBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCwgZm9udEluZm86IEZvbnRJbmZvLCB0YWJTaXplOiBudW1iZXIsIHdyYXBwaW5nQ29sdW1uOiBudW1iZXIsIHdyYXBwaW5nSW5kZW50OiBXcmFwcGluZ0luZGVudCwgd29yZEJyZWFrOiAnbm9ybWFsJyB8ICdrZWVwQWxsJywgd3JhcE9uRXNjYXBlZExpbmVGZWVkczogYm9vbGVhbik6IElMaW5lQnJlYWtzQ29tcHV0ZXIge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHByZXZpb3VzQnJlYWtpbmdEYXRhOiAoTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsKVtdID0gW107XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFkZFJlcXVlc3Q6IChsaW5lTnVtYmVyOiBudW1iZXIsIHByZXZpb3VzTGluZUJyZWFrRGF0YTogTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsKSA9PiB7XG5cdFx0XHRcdGxpbmVOdW1iZXJzLnB1c2gobGluZU51bWJlcik7XG5cdFx0XHRcdHByZXZpb3VzQnJlYWtpbmdEYXRhLnB1c2gocHJldmlvdXNMaW5lQnJlYWtEYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRmaW5hbGl6ZTogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhciA9IGZvbnRJbmZvLnR5cGljYWxGdWxsd2lkdGhDaGFyYWN0ZXJXaWR0aCAvIGZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiAoTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsKVtdID0gW107XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lTnVtYmVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyc1tpXTtcblx0XHRcdFx0XHRjb25zdCBpbmplY3RlZFRleHQgPSBjb250ZXh0LmdldExpbmVJbmplY3RlZFRleHQobGluZU51bWJlcik7XG5cdFx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBjb250ZXh0LmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpb3VzTGluZUJyZWFrRGF0YSA9IHByZXZpb3VzQnJlYWtpbmdEYXRhW2ldO1xuXHRcdFx0XHRcdGNvbnN0IGlzTGluZUZlZWRXcmFwcGluZ0VuYWJsZWQgPSB3cmFwT25Fc2NhcGVkTGluZUZlZWRzICYmIGxpbmVUZXh0LmluY2x1ZGVzKCdcIicpICYmIGxpbmVUZXh0LmluY2x1ZGVzKCdcXFxcbicpO1xuXHRcdFx0XHRcdGlmIChwcmV2aW91c0xpbmVCcmVha0RhdGEgJiYgIXByZXZpb3VzTGluZUJyZWFrRGF0YS5pbmplY3Rpb25PcHRpb25zICYmICFpbmplY3RlZFRleHQgJiYgIWlzTGluZUZlZWRXcmFwcGluZ0VuYWJsZWQpIHtcblx0XHRcdFx0XHRcdHJlc3VsdFtpXSA9IGNyZWF0ZUxpbmVCcmVha3NGcm9tUHJldmlvdXNMaW5lQnJlYWtzKHRoaXMuY2xhc3NpZmllciwgcHJldmlvdXNMaW5lQnJlYWtEYXRhLCBsaW5lVGV4dCwgdGFiU2l6ZSwgd3JhcHBpbmdDb2x1bW4sIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyLCB3cmFwcGluZ0luZGVudCwgd29yZEJyZWFrKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0W2ldID0gY3JlYXRlTGluZUJyZWFrcyh0aGlzLmNsYXNzaWZpZXIsIGxpbmVUZXh0LCBpbmplY3RlZFRleHQsIHRhYlNpemUsIHdyYXBwaW5nQ29sdW1uLCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhciwgd3JhcHBpbmdJbmRlbnQsIHdvcmRCcmVhaywgaXNMaW5lRmVlZFdyYXBwaW5nRW5hYmxlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGFyclBvb2wxLmxlbmd0aCA9IDA7XG5cdFx0XHRcdGFyclBvb2wyLmxlbmd0aCA9IDA7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCBlbnVtIENoYXJhY3RlckNsYXNzIHtcblx0Tk9ORSA9IDAsXG5cdEJSRUFLX0JFRk9SRSA9IDEsXG5cdEJSRUFLX0FGVEVSID0gMixcblx0QlJFQUtfSURFT0dSQVBISUMgPSAzIC8vIGZvciBIYW4gYW5kIEthbmEuXG59XG5cbmNsYXNzIFdyYXBwaW5nQ2hhcmFjdGVyQ2xhc3NpZmllciBleHRlbmRzIENoYXJhY3RlckNsYXNzaWZpZXI8Q2hhcmFjdGVyQ2xhc3M+IHtcblxuXHRjb25zdHJ1Y3RvcihCUkVBS19CRUZPUkU6IHN0cmluZywgQlJFQUtfQUZURVI6IHN0cmluZykge1xuXHRcdHN1cGVyKENoYXJhY3RlckNsYXNzLk5PTkUpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBCUkVBS19CRUZPUkUubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuc2V0KEJSRUFLX0JFRk9SRS5jaGFyQ29kZUF0KGkpLCBDaGFyYWN0ZXJDbGFzcy5CUkVBS19CRUZPUkUpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgQlJFQUtfQUZURVIubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuc2V0KEJSRUFLX0FGVEVSLmNoYXJDb2RlQXQoaSksIENoYXJhY3RlckNsYXNzLkJSRUFLX0FGVEVSKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0KGNoYXJDb2RlOiBudW1iZXIpOiBDaGFyYWN0ZXJDbGFzcyB7XG5cdFx0aWYgKGNoYXJDb2RlID49IDAgJiYgY2hhckNvZGUgPCAyNTYpIHtcblx0XHRcdHJldHVybiA8Q2hhcmFjdGVyQ2xhc3M+dGhpcy5fYXNjaWlNYXBbY2hhckNvZGVdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBJbml0aWFsaXplIENoYXJhY3RlckNsYXNzLkJSRUFLX0lERU9HUkFQSElDIGZvciB0aGVzZSBVbmljb2RlIHJhbmdlczpcblx0XHRcdC8vIDEuIENKSyBVbmlmaWVkIElkZW9ncmFwaHMgKDB4NEUwMCAtLSAweDlGRkYpXG5cdFx0XHQvLyAyLiBDSksgVW5pZmllZCBJZGVvZ3JhcGhzIEV4dGVuc2lvbiBBICgweDM0MDAgLS0gMHg0REJGKVxuXHRcdFx0Ly8gMy4gSGlyYWdhbmEgYW5kIEthdGFrYW5hICgweDMwNDAgLS0gMHgzMEZGKVxuXHRcdFx0aWYgKFxuXHRcdFx0XHQoY2hhckNvZGUgPj0gMHgzMDQwICYmIGNoYXJDb2RlIDw9IDB4MzBGRilcblx0XHRcdFx0fHwgKGNoYXJDb2RlID49IDB4MzQwMCAmJiBjaGFyQ29kZSA8PSAweDREQkYpXG5cdFx0XHRcdHx8IChjaGFyQ29kZSA+PSAweDRFMDAgJiYgY2hhckNvZGUgPD0gMHg5RkZGKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiBDaGFyYWN0ZXJDbGFzcy5CUkVBS19JREVPR1JBUEhJQztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDxDaGFyYWN0ZXJDbGFzcz4odGhpcy5fbWFwLmdldChjaGFyQ29kZSkgfHwgdGhpcy5fZGVmYXVsdFZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxubGV0IGFyclBvb2wxOiBudW1iZXJbXSA9IFtdO1xubGV0IGFyclBvb2wyOiBudW1iZXJbXSA9IFtdO1xuXG5mdW5jdGlvbiBjcmVhdGVMaW5lQnJlYWtzRnJvbVByZXZpb3VzTGluZUJyZWFrcyhjbGFzc2lmaWVyOiBXcmFwcGluZ0NoYXJhY3RlckNsYXNzaWZpZXIsIHByZXZpb3VzQnJlYWtpbmdEYXRhOiBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSwgbGluZVRleHQ6IHN0cmluZywgdGFiU2l6ZTogbnVtYmVyLCBmaXJzdExpbmVCcmVha0NvbHVtbjogbnVtYmVyLCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhcjogbnVtYmVyLCB3cmFwcGluZ0luZGVudDogV3JhcHBpbmdJbmRlbnQsIHdvcmRCcmVhazogJ25vcm1hbCcgfCAna2VlcEFsbCcpOiBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB8IG51bGwge1xuXHRpZiAoZmlyc3RMaW5lQnJlYWtDb2x1bW4gPT09IC0xKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBsZW4gPSBsaW5lVGV4dC5sZW5ndGg7XG5cdGlmIChsZW4gPD0gMSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgaXNLZWVwQWxsID0gKHdvcmRCcmVhayA9PT0gJ2tlZXBBbGwnKTtcblxuXHRjb25zdCBwcmV2QnJlYWtpbmdPZmZzZXRzID0gcHJldmlvdXNCcmVha2luZ0RhdGEuYnJlYWtPZmZzZXRzO1xuXHRjb25zdCBwcmV2QnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbiA9IHByZXZpb3VzQnJlYWtpbmdEYXRhLmJyZWFrT2Zmc2V0c1Zpc2libGVDb2x1bW47XG5cblx0Y29uc3Qgd3JhcHBlZFRleHRJbmRlbnRMZW5ndGggPSBjb21wdXRlV3JhcHBlZFRleHRJbmRlbnRMZW5ndGgobGluZVRleHQsIHRhYlNpemUsIGZpcnN0TGluZUJyZWFrQ29sdW1uLCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhciwgd3JhcHBpbmdJbmRlbnQpO1xuXHRjb25zdCB3cmFwcGVkTGluZUJyZWFrQ29sdW1uID0gZmlyc3RMaW5lQnJlYWtDb2x1bW4gLSB3cmFwcGVkVGV4dEluZGVudExlbmd0aDtcblxuXHRjb25zdCBicmVha2luZ09mZnNldHM6IG51bWJlcltdID0gYXJyUG9vbDE7XG5cdGNvbnN0IGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW46IG51bWJlcltdID0gYXJyUG9vbDI7XG5cdGxldCBicmVha2luZ09mZnNldHNDb3VudCA9IDA7XG5cdGxldCBsYXN0QnJlYWtpbmdPZmZzZXQgPSAwO1xuXHRsZXQgbGFzdEJyZWFraW5nT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IDA7XG5cblx0bGV0IGJyZWFraW5nQ29sdW1uID0gZmlyc3RMaW5lQnJlYWtDb2x1bW47XG5cdGNvbnN0IHByZXZMZW4gPSBwcmV2QnJlYWtpbmdPZmZzZXRzLmxlbmd0aDtcblx0bGV0IHByZXZJbmRleCA9IDA7XG5cblx0aWYgKHByZXZJbmRleCA+PSAwKSB7XG5cdFx0bGV0IGJlc3REaXN0YW5jZSA9IE1hdGguYWJzKHByZXZCcmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uW3ByZXZJbmRleF0gLSBicmVha2luZ0NvbHVtbik7XG5cdFx0d2hpbGUgKHByZXZJbmRleCArIDEgPCBwcmV2TGVuKSB7XG5cdFx0XHRjb25zdCBkaXN0YW5jZSA9IE1hdGguYWJzKHByZXZCcmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uW3ByZXZJbmRleCArIDFdIC0gYnJlYWtpbmdDb2x1bW4pO1xuXHRcdFx0aWYgKGRpc3RhbmNlID49IGJlc3REaXN0YW5jZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGJlc3REaXN0YW5jZSA9IGRpc3RhbmNlO1xuXHRcdFx0cHJldkluZGV4Kys7XG5cdFx0fVxuXHR9XG5cblx0d2hpbGUgKHByZXZJbmRleCA8IHByZXZMZW4pIHtcblx0XHQvLyBBbGxvdyBmb3IgcHJldkluZGV4IHRvIGJlIC0xIChmb3IgdGhlIGNhc2Ugd2hlcmUgd2UgaGl0IGEgdGFiIHdoZW4gd2Fsa2luZyBiYWNrd2FyZHMgZnJvbSB0aGUgZmlyc3QgYnJlYWspXG5cdFx0bGV0IHByZXZCcmVha09mZnNldCA9IHByZXZJbmRleCA8IDAgPyAwIDogcHJldkJyZWFraW5nT2Zmc2V0c1twcmV2SW5kZXhdO1xuXHRcdGxldCBwcmV2QnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gcHJldkluZGV4IDwgMCA/IDAgOiBwcmV2QnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbltwcmV2SW5kZXhdO1xuXHRcdGlmIChsYXN0QnJlYWtpbmdPZmZzZXQgPiBwcmV2QnJlYWtPZmZzZXQpIHtcblx0XHRcdHByZXZCcmVha09mZnNldCA9IGxhc3RCcmVha2luZ09mZnNldDtcblx0XHRcdHByZXZCcmVha09mZnNldFZpc2libGVDb2x1bW4gPSBsYXN0QnJlYWtpbmdPZmZzZXRWaXNpYmxlQ29sdW1uO1xuXHRcdH1cblxuXHRcdGxldCBicmVha09mZnNldCA9IDA7XG5cdFx0bGV0IGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IDA7XG5cblx0XHRsZXQgZm9yY2VkQnJlYWtPZmZzZXQgPSAwO1xuXHRcdGxldCBmb3JjZWRCcmVha09mZnNldFZpc2libGVDb2x1bW4gPSAwO1xuXG5cdFx0Ly8gaW5pdGlhbGx5LCB3ZSBzZWFyY2ggYXMgbXVjaCBhcyBwb3NzaWJsZSB0byB0aGUgcmlnaHQgKGlmIGl0IGZpdHMpXG5cdFx0aWYgKHByZXZCcmVha09mZnNldFZpc2libGVDb2x1bW4gPD0gYnJlYWtpbmdDb2x1bW4pIHtcblx0XHRcdGxldCB2aXNpYmxlQ29sdW1uID0gcHJldkJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbjtcblx0XHRcdGxldCBwcmV2Q2hhckNvZGUgPSBwcmV2QnJlYWtPZmZzZXQgPT09IDAgPyBDaGFyQ29kZS5OdWxsIDogbGluZVRleHQuY2hhckNvZGVBdChwcmV2QnJlYWtPZmZzZXQgLSAxKTtcblx0XHRcdGxldCBwcmV2Q2hhckNvZGVDbGFzcyA9IHByZXZCcmVha09mZnNldCA9PT0gMCA/IENoYXJhY3RlckNsYXNzLk5PTkUgOiBjbGFzc2lmaWVyLmdldChwcmV2Q2hhckNvZGUpO1xuXHRcdFx0bGV0IGVudGlyZUxpbmVGaXRzID0gdHJ1ZTtcblx0XHRcdGZvciAobGV0IGkgPSBwcmV2QnJlYWtPZmZzZXQ7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGFyU3RhcnRPZmZzZXQgPSBpO1xuXHRcdFx0XHRjb25zdCBjaGFyQ29kZSA9IGxpbmVUZXh0LmNoYXJDb2RlQXQoaSk7XG5cdFx0XHRcdGxldCBjaGFyQ29kZUNsYXNzOiBudW1iZXI7XG5cdFx0XHRcdGxldCBjaGFyV2lkdGg6IG51bWJlcjtcblxuXHRcdFx0XHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGUpKSB7XG5cdFx0XHRcdFx0Ly8gQSBzdXJyb2dhdGUgcGFpciBtdXN0IGFsd2F5cyBiZSBjb25zaWRlcmVkIGFzIGEgc2luZ2xlIHVuaXQsIHNvIGl0IGlzIG5ldmVyIHRvIGJlIGJyb2tlblxuXHRcdFx0XHRcdGkrKztcblx0XHRcdFx0XHRjaGFyQ29kZUNsYXNzID0gQ2hhcmFjdGVyQ2xhc3MuTk9ORTtcblx0XHRcdFx0XHRjaGFyV2lkdGggPSAyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoYXJDb2RlQ2xhc3MgPSBjbGFzc2lmaWVyLmdldChjaGFyQ29kZSk7XG5cdFx0XHRcdFx0Y2hhcldpZHRoID0gY29tcHV0ZUNoYXJXaWR0aChjaGFyQ29kZSwgdmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNoYXJTdGFydE9mZnNldCA+IGxhc3RCcmVha2luZ09mZnNldCAmJiBjYW5CcmVhayhwcmV2Q2hhckNvZGUsIHByZXZDaGFyQ29kZUNsYXNzLCBjaGFyQ29kZSwgY2hhckNvZGVDbGFzcywgaXNLZWVwQWxsKSkge1xuXHRcdFx0XHRcdGJyZWFrT2Zmc2V0ID0gY2hhclN0YXJ0T2Zmc2V0O1xuXHRcdFx0XHRcdGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2aXNpYmxlQ29sdW1uICs9IGNoYXJXaWR0aDtcblxuXHRcdFx0XHQvLyBjaGVjayBpZiBhZGRpbmcgY2hhcmFjdGVyIGF0IGBpYCB3aWxsIGdvIG92ZXIgdGhlIGJyZWFraW5nIGNvbHVtblxuXHRcdFx0XHRpZiAodmlzaWJsZUNvbHVtbiA+IGJyZWFraW5nQ29sdW1uKSB7XG5cdFx0XHRcdFx0Ly8gV2UgbmVlZCB0byBicmVhayBhdCBsZWFzdCBiZWZvcmUgY2hhcmFjdGVyIGF0IGBpYDpcblx0XHRcdFx0XHRpZiAoY2hhclN0YXJ0T2Zmc2V0ID4gbGFzdEJyZWFraW5nT2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRmb3JjZWRCcmVha09mZnNldCA9IGNoYXJTdGFydE9mZnNldDtcblx0XHRcdFx0XHRcdGZvcmNlZEJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW4gLSBjaGFyV2lkdGg7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHdlIG5lZWQgdG8gYWR2YW5jZSBhdCBsZWFzdCBieSBvbmUgY2hhcmFjdGVyXG5cdFx0XHRcdFx0XHRmb3JjZWRCcmVha09mZnNldCA9IGkgKyAxO1xuXHRcdFx0XHRcdFx0Zm9yY2VkQnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gdmlzaWJsZUNvbHVtbjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodmlzaWJsZUNvbHVtbiAtIGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA+IHdyYXBwZWRMaW5lQnJlYWtDb2x1bW4pIHtcblx0XHRcdFx0XHRcdC8vIENhbm5vdCBicmVhayBhdCBgYnJlYWtPZmZzZXRgID0+IHJlc2V0IGl0IGlmIGl0IHdhcyBzZXRcblx0XHRcdFx0XHRcdGJyZWFrT2Zmc2V0ID0gMDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRlbnRpcmVMaW5lRml0cyA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJldkNoYXJDb2RlID0gY2hhckNvZGU7XG5cdFx0XHRcdHByZXZDaGFyQ29kZUNsYXNzID0gY2hhckNvZGVDbGFzcztcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVudGlyZUxpbmVGaXRzKSB7XG5cdFx0XHRcdC8vIHRoZXJlIGlzIG5vIG1vcmUgbmVlZCB0byBicmVhayA9PiBzdG9wIHRoZSBvdXRlciBsb29wIVxuXHRcdFx0XHRpZiAoYnJlYWtpbmdPZmZzZXRzQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0Ly8gQWRkIGxhc3Qgc2VnbWVudCwgbm8gbmVlZCB0byBhc3NpZ24gdG8gYGxhc3RCcmVha2luZ09mZnNldGAgYW5kIGBsYXN0QnJlYWtpbmdPZmZzZXRWaXNpYmxlQ29sdW1uYFxuXHRcdFx0XHRcdGJyZWFraW5nT2Zmc2V0c1ticmVha2luZ09mZnNldHNDb3VudF0gPSBwcmV2QnJlYWtpbmdPZmZzZXRzW3ByZXZCcmVha2luZ09mZnNldHMubGVuZ3RoIC0gMV07XG5cdFx0XHRcdFx0YnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtblticmVha2luZ09mZnNldHNDb3VudF0gPSBwcmV2QnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbltwcmV2QnJlYWtpbmdPZmZzZXRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdGJyZWFraW5nT2Zmc2V0c0NvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGJyZWFrT2Zmc2V0ID09PSAwKSB7XG5cdFx0XHQvLyBtdXN0IHNlYXJjaCBsZWZ0XG5cdFx0XHRsZXQgdmlzaWJsZUNvbHVtbiA9IHByZXZCcmVha09mZnNldFZpc2libGVDb2x1bW47XG5cdFx0XHRsZXQgY2hhckNvZGUgPSBsaW5lVGV4dC5jaGFyQ29kZUF0KHByZXZCcmVha09mZnNldCk7XG5cdFx0XHRsZXQgY2hhckNvZGVDbGFzcyA9IGNsYXNzaWZpZXIuZ2V0KGNoYXJDb2RlKTtcblx0XHRcdGxldCBoaXRBVGFiQ2hhcmFjdGVyID0gZmFsc2U7XG5cdFx0XHRmb3IgKGxldCBpID0gcHJldkJyZWFrT2Zmc2V0IC0gMTsgaSA+PSBsYXN0QnJlYWtpbmdPZmZzZXQ7IGktLSkge1xuXHRcdFx0XHRjb25zdCBjaGFyU3RhcnRPZmZzZXQgPSBpICsgMTtcblx0XHRcdFx0Y29uc3QgcHJldkNoYXJDb2RlID0gbGluZVRleHQuY2hhckNvZGVBdChpKTtcblxuXHRcdFx0XHRpZiAocHJldkNoYXJDb2RlID09PSBDaGFyQ29kZS5UYWIpIHtcblx0XHRcdFx0XHQvLyBjYW5ub3QgZGV0ZXJtaW5lIHRoZSB3aWR0aCBvZiBhIHRhYiB3aGVuIGdvaW5nIGJhY2t3YXJkcywgc28gd2UgbXVzdCBnbyBmb3J3YXJkc1xuXHRcdFx0XHRcdGhpdEFUYWJDaGFyYWN0ZXIgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHByZXZDaGFyQ29kZUNsYXNzOiBudW1iZXI7XG5cdFx0XHRcdGxldCBwcmV2Q2hhcldpZHRoOiBudW1iZXI7XG5cblx0XHRcdFx0aWYgKHN0cmluZ3MuaXNMb3dTdXJyb2dhdGUocHJldkNoYXJDb2RlKSkge1xuXHRcdFx0XHRcdC8vIEEgc3Vycm9nYXRlIHBhaXIgbXVzdCBhbHdheXMgYmUgY29uc2lkZXJlZCBhcyBhIHNpbmdsZSB1bml0LCBzbyBpdCBpcyBuZXZlciB0byBiZSBicm9rZW5cblx0XHRcdFx0XHRpLS07XG5cdFx0XHRcdFx0cHJldkNoYXJDb2RlQ2xhc3MgPSBDaGFyYWN0ZXJDbGFzcy5OT05FO1xuXHRcdFx0XHRcdHByZXZDaGFyV2lkdGggPSAyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByZXZDaGFyQ29kZUNsYXNzID0gY2xhc3NpZmllci5nZXQocHJldkNoYXJDb2RlKTtcblx0XHRcdFx0XHRwcmV2Q2hhcldpZHRoID0gKHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIocHJldkNoYXJDb2RlKSA/IGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyIDogMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodmlzaWJsZUNvbHVtbiA8PSBicmVha2luZ0NvbHVtbikge1xuXHRcdFx0XHRcdGlmIChmb3JjZWRCcmVha09mZnNldCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Zm9yY2VkQnJlYWtPZmZzZXQgPSBjaGFyU3RhcnRPZmZzZXQ7XG5cdFx0XHRcdFx0XHRmb3JjZWRCcmVha09mZnNldFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh2aXNpYmxlQ29sdW1uIDw9IGJyZWFraW5nQ29sdW1uIC0gd3JhcHBlZExpbmVCcmVha0NvbHVtbikge1xuXHRcdFx0XHRcdFx0Ly8gd2VudCB0b28gZmFyIVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGNhbkJyZWFrKHByZXZDaGFyQ29kZSwgcHJldkNoYXJDb2RlQ2xhc3MsIGNoYXJDb2RlLCBjaGFyQ29kZUNsYXNzLCBpc0tlZXBBbGwpKSB7XG5cdFx0XHRcdFx0XHRicmVha09mZnNldCA9IGNoYXJTdGFydE9mZnNldDtcblx0XHRcdFx0XHRcdGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2aXNpYmxlQ29sdW1uIC09IHByZXZDaGFyV2lkdGg7XG5cdFx0XHRcdGNoYXJDb2RlID0gcHJldkNoYXJDb2RlO1xuXHRcdFx0XHRjaGFyQ29kZUNsYXNzID0gcHJldkNoYXJDb2RlQ2xhc3M7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChicmVha09mZnNldCAhPT0gMCkge1xuXHRcdFx0XHRjb25zdCByZW1haW5pbmdXaWR0aE9mTmV4dExpbmUgPSB3cmFwcGVkTGluZUJyZWFrQ29sdW1uIC0gKGZvcmNlZEJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiAtIGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbik7XG5cdFx0XHRcdGlmIChyZW1haW5pbmdXaWR0aE9mTmV4dExpbmUgPD0gdGFiU2l6ZSkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXJDb2RlQXRGb3JjZWRCcmVha09mZnNldCA9IGxpbmVUZXh0LmNoYXJDb2RlQXQoZm9yY2VkQnJlYWtPZmZzZXQpO1xuXHRcdFx0XHRcdGxldCBjaGFyV2lkdGg6IG51bWJlcjtcblx0XHRcdFx0XHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVBdEZvcmNlZEJyZWFrT2Zmc2V0KSkge1xuXHRcdFx0XHRcdFx0Ly8gQSBzdXJyb2dhdGUgcGFpciBtdXN0IGFsd2F5cyBiZSBjb25zaWRlcmVkIGFzIGEgc2luZ2xlIHVuaXQsIHNvIGl0IGlzIG5ldmVyIHRvIGJlIGJyb2tlblxuXHRcdFx0XHRcdFx0Y2hhcldpZHRoID0gMjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y2hhcldpZHRoID0gY29tcHV0ZUNoYXJXaWR0aChjaGFyQ29kZUF0Rm9yY2VkQnJlYWtPZmZzZXQsIGZvcmNlZEJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocmVtYWluaW5nV2lkdGhPZk5leHRMaW5lIC0gY2hhcldpZHRoIDwgMCkge1xuXHRcdFx0XHRcdFx0Ly8gaXQgaXMgbm90IHdvcnRoIGl0IHRvIGJyZWFrIGF0IGJyZWFrT2Zmc2V0LCBpdCBqdXN0IGludHJvZHVjZXMgYW4gZXh0cmEgbmVlZGxlc3MgbGluZSFcblx0XHRcdFx0XHRcdGJyZWFrT2Zmc2V0ID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGhpdEFUYWJDaGFyYWN0ZXIpIHtcblx0XHRcdFx0Ly8gY2Fubm90IGRldGVybWluZSB0aGUgd2lkdGggb2YgYSB0YWIgd2hlbiBnb2luZyBiYWNrd2FyZHMsIHNvIHdlIG11c3QgZ28gZm9yd2FyZHMgZnJvbSB0aGUgcHJldmlvdXMgYnJlYWtcblx0XHRcdFx0cHJldkluZGV4LS07XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChicmVha09mZnNldCA9PT0gMCkge1xuXHRcdFx0Ly8gQ291bGQgbm90IGZpbmQgYSBnb29kIGJyZWFraW5nIHBvaW50XG5cdFx0XHRicmVha09mZnNldCA9IGZvcmNlZEJyZWFrT2Zmc2V0O1xuXHRcdFx0YnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gZm9yY2VkQnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uO1xuXHRcdH1cblxuXHRcdGlmIChicmVha09mZnNldCA8PSBsYXN0QnJlYWtpbmdPZmZzZXQpIHtcblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGF0IHdlIGFyZSBhZHZhbmNpbmcgKGF0IGxlYXN0IG9uZSBjaGFyYWN0ZXIpXG5cdFx0XHRjb25zdCBjaGFyQ29kZSA9IGxpbmVUZXh0LmNoYXJDb2RlQXQobGFzdEJyZWFraW5nT2Zmc2V0KTtcblx0XHRcdGlmIChzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZSkpIHtcblx0XHRcdFx0Ly8gQSBzdXJyb2dhdGUgcGFpciBtdXN0IGFsd2F5cyBiZSBjb25zaWRlcmVkIGFzIGEgc2luZ2xlIHVuaXQsIHNvIGl0IGlzIG5ldmVyIHRvIGJlIGJyb2tlblxuXHRcdFx0XHRicmVha09mZnNldCA9IGxhc3RCcmVha2luZ09mZnNldCArIDI7XG5cdFx0XHRcdGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IGxhc3RCcmVha2luZ09mZnNldFZpc2libGVDb2x1bW4gKyAyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWtPZmZzZXQgPSBsYXN0QnJlYWtpbmdPZmZzZXQgKyAxO1xuXHRcdFx0XHRicmVha09mZnNldFZpc2libGVDb2x1bW4gPSBsYXN0QnJlYWtpbmdPZmZzZXRWaXNpYmxlQ29sdW1uICsgY29tcHV0ZUNoYXJXaWR0aChjaGFyQ29kZSwgbGFzdEJyZWFraW5nT2Zmc2V0VmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxhc3RCcmVha2luZ09mZnNldCA9IGJyZWFrT2Zmc2V0O1xuXHRcdGJyZWFraW5nT2Zmc2V0c1ticmVha2luZ09mZnNldHNDb3VudF0gPSBicmVha09mZnNldDtcblx0XHRsYXN0QnJlYWtpbmdPZmZzZXRWaXNpYmxlQ29sdW1uID0gYnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uO1xuXHRcdGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bYnJlYWtpbmdPZmZzZXRzQ291bnRdID0gYnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uO1xuXHRcdGJyZWFraW5nT2Zmc2V0c0NvdW50Kys7XG5cdFx0YnJlYWtpbmdDb2x1bW4gPSBicmVha09mZnNldFZpc2libGVDb2x1bW4gKyB3cmFwcGVkTGluZUJyZWFrQ29sdW1uO1xuXG5cdFx0d2hpbGUgKHByZXZJbmRleCA8IDAgfHwgKHByZXZJbmRleCA8IHByZXZMZW4gJiYgcHJldkJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bcHJldkluZGV4XSA8IGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbikpIHtcblx0XHRcdHByZXZJbmRleCsrO1xuXHRcdH1cblxuXHRcdGxldCBiZXN0RGlzdGFuY2UgPSBNYXRoLmFicyhwcmV2QnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbltwcmV2SW5kZXhdIC0gYnJlYWtpbmdDb2x1bW4pO1xuXHRcdHdoaWxlIChwcmV2SW5kZXggKyAxIDwgcHJldkxlbikge1xuXHRcdFx0Y29uc3QgZGlzdGFuY2UgPSBNYXRoLmFicyhwcmV2QnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbltwcmV2SW5kZXggKyAxXSAtIGJyZWFraW5nQ29sdW1uKTtcblx0XHRcdGlmIChkaXN0YW5jZSA+PSBiZXN0RGlzdGFuY2UpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRiZXN0RGlzdGFuY2UgPSBkaXN0YW5jZTtcblx0XHRcdHByZXZJbmRleCsrO1xuXHRcdH1cblx0fVxuXG5cdGlmIChicmVha2luZ09mZnNldHNDb3VudCA9PT0gMCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Ly8gRG9pbmcgaGVyZSBzb21lIG9iamVjdCByZXVzZSB3aGljaCBlbmRzIHVwIGhlbHBpbmcgYSBodWdlIGRlYWwgd2l0aCBHQyBwYXVzZXMhXG5cdGJyZWFraW5nT2Zmc2V0cy5sZW5ndGggPSBicmVha2luZ09mZnNldHNDb3VudDtcblx0YnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbi5sZW5ndGggPSBicmVha2luZ09mZnNldHNDb3VudDtcblx0YXJyUG9vbDEgPSBwcmV2aW91c0JyZWFraW5nRGF0YS5icmVha09mZnNldHM7XG5cdGFyclBvb2wyID0gcHJldmlvdXNCcmVha2luZ0RhdGEuYnJlYWtPZmZzZXRzVmlzaWJsZUNvbHVtbjtcblx0cHJldmlvdXNCcmVha2luZ0RhdGEuYnJlYWtPZmZzZXRzID0gYnJlYWtpbmdPZmZzZXRzO1xuXHRwcmV2aW91c0JyZWFraW5nRGF0YS5icmVha09mZnNldHNWaXNpYmxlQ29sdW1uID0gYnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbjtcblx0cHJldmlvdXNCcmVha2luZ0RhdGEud3JhcHBlZFRleHRJbmRlbnRMZW5ndGggPSB3cmFwcGVkVGV4dEluZGVudExlbmd0aDtcblx0cmV0dXJuIHByZXZpb3VzQnJlYWtpbmdEYXRhO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaW5lQnJlYWtzKGNsYXNzaWZpZXI6IFdyYXBwaW5nQ2hhcmFjdGVyQ2xhc3NpZmllciwgX2xpbmVUZXh0OiBzdHJpbmcsIGluamVjdGVkVGV4dHM6IExpbmVJbmplY3RlZFRleHRbXSB8IG51bGwsIHRhYlNpemU6IG51bWJlciwgZmlyc3RMaW5lQnJlYWtDb2x1bW46IG51bWJlciwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXI6IG51bWJlciwgd3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50LCB3b3JkQnJlYWs6ICdub3JtYWwnIHwgJ2tlZXBBbGwnLCB3cmFwT25Fc2NhcGVkTGluZUZlZWRzOiBib29sZWFuKTogTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsIHtcblx0Y29uc3QgbGluZVRleHQgPSBMaW5lSW5qZWN0ZWRUZXh0LmFwcGx5SW5qZWN0ZWRUZXh0KF9saW5lVGV4dCwgaW5qZWN0ZWRUZXh0cyk7XG5cblx0bGV0IGluamVjdGlvbk9wdGlvbnM6IEluamVjdGVkVGV4dE9wdGlvbnNbXSB8IG51bGw7XG5cdGxldCBpbmplY3Rpb25PZmZzZXRzOiBudW1iZXJbXSB8IG51bGw7XG5cdGlmIChpbmplY3RlZFRleHRzICYmIGluamVjdGVkVGV4dHMubGVuZ3RoID4gMCkge1xuXHRcdGluamVjdGlvbk9wdGlvbnMgPSBpbmplY3RlZFRleHRzLm1hcCh0ID0+IHQub3B0aW9ucyk7XG5cdFx0aW5qZWN0aW9uT2Zmc2V0cyA9IGluamVjdGVkVGV4dHMubWFwKHRleHQgPT4gdGV4dC5jb2x1bW4gLSAxKTtcblx0fSBlbHNlIHtcblx0XHRpbmplY3Rpb25PcHRpb25zID0gbnVsbDtcblx0XHRpbmplY3Rpb25PZmZzZXRzID0gbnVsbDtcblx0fVxuXG5cdGlmIChmaXJzdExpbmVCcmVha0NvbHVtbiA9PT0gLTEpIHtcblx0XHRpZiAoIWluamVjdGlvbk9wdGlvbnMpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHQvLyBjcmVhdGluZyBhIGBMaW5lQnJlYWtEYXRhYCB3aXRoIGFuIGludmFsaWQgYGJyZWFrT2Zmc2V0c1Zpc2libGVDb2x1bW5gIGlzIE9LXG5cdFx0Ly8gYmVjYXVzZSBgYnJlYWtPZmZzZXRzVmlzaWJsZUNvbHVtbmAgd2lsbCBuZXZlciBiZSB1c2VkIGJlY2F1c2UgaXQgY29udGFpbnMgaW5qZWN0ZWQgdGV4dFxuXHRcdHJldHVybiBuZXcgTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEoaW5qZWN0aW9uT2Zmc2V0cywgaW5qZWN0aW9uT3B0aW9ucywgW2xpbmVUZXh0Lmxlbmd0aF0sIFtdLCAwKTtcblx0fVxuXG5cdGNvbnN0IGxlbiA9IGxpbmVUZXh0Lmxlbmd0aDtcblx0aWYgKGxlbiA8PSAxKSB7XG5cdFx0aWYgKCFpbmplY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Ly8gY3JlYXRpbmcgYSBgTGluZUJyZWFrRGF0YWAgd2l0aCBhbiBpbnZhbGlkIGBicmVha09mZnNldHNWaXNpYmxlQ29sdW1uYCBpcyBPS1xuXHRcdC8vIGJlY2F1c2UgYGJyZWFrT2Zmc2V0c1Zpc2libGVDb2x1bW5gIHdpbGwgbmV2ZXIgYmUgdXNlZCBiZWNhdXNlIGl0IGNvbnRhaW5zIGluamVjdGVkIHRleHRcblx0XHRyZXR1cm4gbmV3IE1vZGVsTGluZVByb2plY3Rpb25EYXRhKGluamVjdGlvbk9mZnNldHMsIGluamVjdGlvbk9wdGlvbnMsIFtsaW5lVGV4dC5sZW5ndGhdLCBbXSwgMCk7XG5cdH1cblxuXHRjb25zdCBpc0tlZXBBbGwgPSAod29yZEJyZWFrID09PSAna2VlcEFsbCcpO1xuXHRjb25zdCB3cmFwcGVkVGV4dEluZGVudExlbmd0aCA9IGNvbXB1dGVXcmFwcGVkVGV4dEluZGVudExlbmd0aChsaW5lVGV4dCwgdGFiU2l6ZSwgZmlyc3RMaW5lQnJlYWtDb2x1bW4sIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyLCB3cmFwcGluZ0luZGVudCk7XG5cdGNvbnN0IHdyYXBwZWRMaW5lQnJlYWtDb2x1bW4gPSBmaXJzdExpbmVCcmVha0NvbHVtbiAtIHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoO1xuXG5cdGNvbnN0IGJyZWFraW5nT2Zmc2V0czogbnVtYmVyW10gPSBbXTtcblx0Y29uc3QgYnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbjogbnVtYmVyW10gPSBbXTtcblx0bGV0IGJyZWFraW5nT2Zmc2V0c0NvdW50OiBudW1iZXIgPSAwO1xuXHRsZXQgYnJlYWtPZmZzZXQgPSAwO1xuXHRsZXQgYnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gMDtcblxuXHRsZXQgYnJlYWtpbmdDb2x1bW4gPSBmaXJzdExpbmVCcmVha0NvbHVtbjtcblx0bGV0IHByZXZDaGFyQ29kZSA9IGxpbmVUZXh0LmNoYXJDb2RlQXQoMCk7XG5cdGxldCBwcmV2Q2hhckNvZGVDbGFzcyA9IGNsYXNzaWZpZXIuZ2V0KHByZXZDaGFyQ29kZSk7XG5cdGxldCB2aXNpYmxlQ29sdW1uID0gY29tcHV0ZUNoYXJXaWR0aChwcmV2Q2hhckNvZGUsIDAsIHRhYlNpemUsIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyKTtcblxuXHRsZXQgc3RhcnRPZmZzZXQgPSAxO1xuXHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUocHJldkNoYXJDb2RlKSkge1xuXHRcdC8vIEEgc3Vycm9nYXRlIHBhaXIgbXVzdCBhbHdheXMgYmUgY29uc2lkZXJlZCBhcyBhIHNpbmdsZSB1bml0LCBzbyBpdCBpcyBuZXZlciB0byBiZSBicm9rZW5cblx0XHR2aXNpYmxlQ29sdW1uICs9IDE7XG5cdFx0cHJldkNoYXJDb2RlID0gbGluZVRleHQuY2hhckNvZGVBdCgxKTtcblx0XHRwcmV2Q2hhckNvZGVDbGFzcyA9IGNsYXNzaWZpZXIuZ2V0KHByZXZDaGFyQ29kZSk7XG5cdFx0c3RhcnRPZmZzZXQrKztcblx0fVxuXG5cdGZvciAobGV0IGkgPSBzdGFydE9mZnNldDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0Y29uc3QgY2hhclN0YXJ0T2Zmc2V0ID0gaTtcblx0XHRjb25zdCBjaGFyQ29kZSA9IGxpbmVUZXh0LmNoYXJDb2RlQXQoaSk7XG5cdFx0bGV0IGNoYXJDb2RlQ2xhc3M6IENoYXJhY3RlckNsYXNzO1xuXHRcdGxldCBjaGFyV2lkdGg6IG51bWJlcjtcblx0XHRsZXQgd3JhcEVzY2FwZWRMaW5lRmVlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlKSkge1xuXHRcdFx0Ly8gQSBzdXJyb2dhdGUgcGFpciBtdXN0IGFsd2F5cyBiZSBjb25zaWRlcmVkIGFzIGEgc2luZ2xlIHVuaXQsIHNvIGl0IGlzIG5ldmVyIHRvIGJlIGJyb2tlblxuXHRcdFx0aSsrO1xuXHRcdFx0Y2hhckNvZGVDbGFzcyA9IENoYXJhY3RlckNsYXNzLk5PTkU7XG5cdFx0XHRjaGFyV2lkdGggPSAyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjaGFyQ29kZUNsYXNzID0gY2xhc3NpZmllci5nZXQoY2hhckNvZGUpO1xuXHRcdFx0Y2hhcldpZHRoID0gY29tcHV0ZUNoYXJXaWR0aChjaGFyQ29kZSwgdmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIpO1xuXHRcdH1cblxuXHRcdC8vIGxpdGVyYWwgXFxuIHNoYWxsIHRyaWdnZXIgYSBzb2Z0d3JhcFxuXHRcdGlmICh3cmFwT25Fc2NhcGVkTGluZUZlZWRzICYmIGlzRXNjYXBlZExpbmVCcmVha0F0UG9zaXRpb24obGluZVRleHQsIGkpKSB7XG5cdFx0XHRicmVha09mZnNldCA9IGNoYXJTdGFydE9mZnNldDtcblx0XHRcdGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cdFx0XHR3cmFwRXNjYXBlZExpbmVGZWVkID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGNhbkJyZWFrKHByZXZDaGFyQ29kZSwgcHJldkNoYXJDb2RlQ2xhc3MsIGNoYXJDb2RlLCBjaGFyQ29kZUNsYXNzLCBpc0tlZXBBbGwpKSB7XG5cdFx0XHRicmVha09mZnNldCA9IGNoYXJTdGFydE9mZnNldDtcblx0XHRcdGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cdFx0fVxuXG5cdFx0dmlzaWJsZUNvbHVtbiArPSBjaGFyV2lkdGg7XG5cblx0XHQvLyBjaGVjayBpZiBhZGRpbmcgY2hhcmFjdGVyIGF0IGBpYCB3aWxsIGdvIG92ZXIgdGhlIGJyZWFraW5nIGNvbHVtblxuXHRcdGlmICh2aXNpYmxlQ29sdW1uID4gYnJlYWtpbmdDb2x1bW4gfHwgd3JhcEVzY2FwZWRMaW5lRmVlZCkge1xuXHRcdFx0Ly8gV2UgbmVlZCB0byBicmVhayBhdCBsZWFzdCBiZWZvcmUgY2hhcmFjdGVyIGF0IGBpYDpcblxuXHRcdFx0aWYgKGJyZWFrT2Zmc2V0ID09PSAwIHx8IHZpc2libGVDb2x1bW4gLSBicmVha09mZnNldFZpc2libGVDb2x1bW4gPiB3cmFwcGVkTGluZUJyZWFrQ29sdW1uKSB7XG5cdFx0XHRcdC8vIENhbm5vdCBicmVhayBhdCBgYnJlYWtPZmZzZXRgLCBtdXN0IGJyZWFrIGF0IGBpYFxuXHRcdFx0XHRicmVha09mZnNldCA9IGNoYXJTdGFydE9mZnNldDtcblx0XHRcdFx0YnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gdmlzaWJsZUNvbHVtbiAtIGNoYXJXaWR0aDtcblx0XHRcdH1cblxuXHRcdFx0YnJlYWtpbmdPZmZzZXRzW2JyZWFraW5nT2Zmc2V0c0NvdW50XSA9IGJyZWFrT2Zmc2V0O1xuXHRcdFx0YnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtblticmVha2luZ09mZnNldHNDb3VudF0gPSBicmVha09mZnNldFZpc2libGVDb2x1bW47XG5cdFx0XHRicmVha2luZ09mZnNldHNDb3VudCsrO1xuXHRcdFx0YnJlYWtpbmdDb2x1bW4gPSBicmVha09mZnNldFZpc2libGVDb2x1bW4gKyB3cmFwcGVkTGluZUJyZWFrQ29sdW1uO1xuXHRcdFx0YnJlYWtPZmZzZXQgPSAwO1xuXHRcdH1cblxuXHRcdHByZXZDaGFyQ29kZSA9IGNoYXJDb2RlO1xuXHRcdHByZXZDaGFyQ29kZUNsYXNzID0gY2hhckNvZGVDbGFzcztcblx0fVxuXG5cdGlmIChicmVha2luZ09mZnNldHNDb3VudCA9PT0gMCAmJiAoIWluamVjdGVkVGV4dHMgfHwgaW5qZWN0ZWRUZXh0cy5sZW5ndGggPT09IDApKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyBBZGQgbGFzdCBzZWdtZW50XG5cdGJyZWFraW5nT2Zmc2V0c1ticmVha2luZ09mZnNldHNDb3VudF0gPSBsZW47XG5cdGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bYnJlYWtpbmdPZmZzZXRzQ291bnRdID0gdmlzaWJsZUNvbHVtbjtcblxuXHRyZXR1cm4gbmV3IE1vZGVsTGluZVByb2plY3Rpb25EYXRhKGluamVjdGlvbk9mZnNldHMsIGluamVjdGlvbk9wdGlvbnMsIGJyZWFraW5nT2Zmc2V0cywgYnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbiwgd3JhcHBlZFRleHRJbmRlbnRMZW5ndGgpO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlQ2hhcldpZHRoKGNoYXJDb2RlOiBudW1iZXIsIHZpc2libGVDb2x1bW46IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyLCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhcjogbnVtYmVyKTogbnVtYmVyIHtcblx0aWYgKGNoYXJDb2RlID09PSBDaGFyQ29kZS5UYWIpIHtcblx0XHRyZXR1cm4gKHRhYlNpemUgLSAodmlzaWJsZUNvbHVtbiAlIHRhYlNpemUpKTtcblx0fVxuXHRpZiAoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcihjaGFyQ29kZSkpIHtcblx0XHRyZXR1cm4gY29sdW1uc0ZvckZ1bGxXaWR0aENoYXI7XG5cdH1cblx0aWYgKGNoYXJDb2RlIDwgMzIpIHtcblx0XHQvLyB3aGVuIHVzaW5nIGBlZGl0b3IucmVuZGVyQ29udHJvbENoYXJhY3RlcnNgLCB0aGUgc3Vic3RpdHV0aW9ucyBhcmUgb2Z0ZW4gd2lkZVxuXHRcdHJldHVybiBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhcjtcblx0fVxuXHRyZXR1cm4gMTtcbn1cblxuZnVuY3Rpb24gdGFiQ2hhcmFjdGVyV2lkdGgodmlzaWJsZUNvbHVtbjogbnVtYmVyLCB0YWJTaXplOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gKHRhYlNpemUgLSAodmlzaWJsZUNvbHVtbiAlIHRhYlNpemUpKTtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgdGhlIGN1cnJlbnQgcG9zaXRpb24gaW4gdGhlIHRleHQgc2hvdWxkIHRyaWdnZXIgYSBzb2Z0IHdyYXAgZHVlIHRvIGVzY2FwZWQgbGluZSBmZWVkcy5cbiAqIFRoaXMgaGFuZGxlcyB0aGUgd3JhcE9uRXNjYXBlZExpbmVGZWVkcyBmZWF0dXJlIHdoaWNoIGFsbG93cyBcXG4gc2VxdWVuY2VzIGluIHN0cmluZ3MgdG8gdHJpZ2dlciB3cmFwcGluZy5cbiAqL1xuZnVuY3Rpb24gaXNFc2NhcGVkTGluZUJyZWFrQXRQb3NpdGlvbihsaW5lVGV4dDogc3RyaW5nLCBpOiBudW1iZXIpOiBib29sZWFuIHtcblx0aWYgKGkgPj0gMiAmJiBsaW5lVGV4dC5jaGFyQXQoaSAtIDEpID09PSAnbicpIHtcblx0XHQvLyBDaGVjayBpZiB0aGVyZSdzIGFuIG9kZCBudW1iZXIgb2YgYmFja3NsYXNoZXNcblx0XHRsZXQgZXNjYXBlQ291bnQgPSAwO1xuXHRcdGZvciAobGV0IGogPSBpIC0gMjsgaiA+PSAwOyBqLS0pIHtcblx0XHRcdGlmIChsaW5lVGV4dC5jaGFyQXQoaikgPT09ICdcXFxcJykge1xuXHRcdFx0XHRlc2NhcGVDb3VudCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGVzY2FwZUNvdW50ICUgMiA9PT0gMTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEtpbnNva3UgU2hvcmkgOiBEb24ndCBicmVhayBhZnRlciBhIGxlYWRpbmcgY2hhcmFjdGVyLCBsaWtlIGFuIG9wZW4gYnJhY2tldFxuICogS2luc29rdSBTaG9yaSA6IERvbid0IGJyZWFrIGJlZm9yZSBhIHRyYWlsaW5nIGNoYXJhY3RlciwgbGlrZSBhIHBlcmlvZFxuICovXG5mdW5jdGlvbiBjYW5CcmVhayhwcmV2Q2hhckNvZGU6IG51bWJlciwgcHJldkNoYXJDb2RlQ2xhc3M6IENoYXJhY3RlckNsYXNzLCBjaGFyQ29kZTogbnVtYmVyLCBjaGFyQ29kZUNsYXNzOiBDaGFyYWN0ZXJDbGFzcywgaXNLZWVwQWxsOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiAoXG5cdFx0Y2hhckNvZGUgIT09IENoYXJDb2RlLlNwYWNlXG5cdFx0JiYgKFxuXHRcdFx0KHByZXZDaGFyQ29kZUNsYXNzID09PSBDaGFyYWN0ZXJDbGFzcy5CUkVBS19BRlRFUiAmJiBjaGFyQ29kZUNsYXNzICE9PSBDaGFyYWN0ZXJDbGFzcy5CUkVBS19BRlRFUikgLy8gYnJlYWsgYXQgdGhlIGVuZCBvZiBtdWx0aXBsZSBCUkVBS19BRlRFUlxuXHRcdFx0fHwgKHByZXZDaGFyQ29kZUNsYXNzICE9PSBDaGFyYWN0ZXJDbGFzcy5CUkVBS19CRUZPUkUgJiYgY2hhckNvZGVDbGFzcyA9PT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfQkVGT1JFKSAvLyBicmVhayBhdCB0aGUgc3RhcnQgb2YgbXVsdGlwbGUgQlJFQUtfQkVGT1JFXG5cdFx0XHR8fCAoIWlzS2VlcEFsbCAmJiBwcmV2Q2hhckNvZGVDbGFzcyA9PT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfSURFT0dSQVBISUMgJiYgY2hhckNvZGVDbGFzcyAhPT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfQUZURVIpXG5cdFx0XHR8fCAoIWlzS2VlcEFsbCAmJiBjaGFyQ29kZUNsYXNzID09PSBDaGFyYWN0ZXJDbGFzcy5CUkVBS19JREVPR1JBUEhJQyAmJiBwcmV2Q2hhckNvZGVDbGFzcyAhPT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfQkVGT1JFKVxuXHRcdClcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZVdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoKGxpbmVUZXh0OiBzdHJpbmcsIHRhYlNpemU6IG51bWJlciwgZmlyc3RMaW5lQnJlYWtDb2x1bW46IG51bWJlciwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXI6IG51bWJlciwgd3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50KTogbnVtYmVyIHtcblx0bGV0IHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoID0gMDtcblx0aWYgKHdyYXBwaW5nSW5kZW50ICE9PSBXcmFwcGluZ0luZGVudC5Ob25lKSB7XG5cdFx0Y29uc3QgZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggPSBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVUZXh0KTtcblx0XHRpZiAoZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggIT09IC0xKSB7XG5cdFx0XHQvLyBUcmFjayBleGlzdGluZyBpbmRlbnRcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaXJzdE5vbldoaXRlc3BhY2VJbmRleDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXJXaWR0aCA9IChsaW5lVGV4dC5jaGFyQ29kZUF0KGkpID09PSBDaGFyQ29kZS5UYWIgPyB0YWJDaGFyYWN0ZXJXaWR0aCh3cmFwcGVkVGV4dEluZGVudExlbmd0aCwgdGFiU2l6ZSkgOiAxKTtcblx0XHRcdFx0d3JhcHBlZFRleHRJbmRlbnRMZW5ndGggKz0gY2hhcldpZHRoO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmNyZWFzZSBpbmRlbnQgb2YgY29udGludWF0aW9uIGxpbmVzLCBpZiBkZXNpcmVkXG5cdFx0XHRjb25zdCBudW1iZXJPZkFkZGl0aW9uYWxUYWJzID0gKHdyYXBwaW5nSW5kZW50ID09PSBXcmFwcGluZ0luZGVudC5EZWVwSW5kZW50ID8gMiA6IHdyYXBwaW5nSW5kZW50ID09PSBXcmFwcGluZ0luZGVudC5JbmRlbnQgPyAxIDogMCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG51bWJlck9mQWRkaXRpb25hbFRhYnM7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGFyV2lkdGggPSB0YWJDaGFyYWN0ZXJXaWR0aCh3cmFwcGVkVGV4dEluZGVudExlbmd0aCwgdGFiU2l6ZSk7XG5cdFx0XHRcdHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoICs9IGNoYXJXaWR0aDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9yY2Ugc3RpY2tpbmcgdG8gYmVnaW5uaW5nIG9mIGxpbmUgaWYgbm8gY2hhcmFjdGVyIHdvdWxkIGZpdCBleGNlcHQgZm9yIHRoZSBpbmRlbnRhdGlvblxuXHRcdFx0aWYgKHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoICsgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIgPiBmaXJzdExpbmVCcmVha0NvbHVtbikge1xuXHRcdFx0XHR3cmFwcGVkVGV4dEluZGVudExlbmd0aCA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiB3cmFwcGVkVGV4dEluZGVudExlbmd0aDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUN6QixTQUFTLGdCQUF3QyxvQkFBb0I7QUFDckUsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBMEQsK0JBQTJE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
