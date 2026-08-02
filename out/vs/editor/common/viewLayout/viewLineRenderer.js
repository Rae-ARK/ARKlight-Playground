import * as nls from "../../../nls.js";
import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { StringBuilder } from "../core/stringBuilder.js";
import { LineDecoration, LineDecorationsNormalizer } from "./lineDecorations.js";
import { LinePart, LinePartMetadata } from "./linePart.js";
import { InlineDecorationType } from "../viewModel/inlineDecorations.js";
import { TextDirection } from "../model.js";
var RenderWhitespace = /* @__PURE__ */ ((RenderWhitespace2) => {
  RenderWhitespace2[RenderWhitespace2["None"] = 0] = "None";
  RenderWhitespace2[RenderWhitespace2["Boundary"] = 1] = "Boundary";
  RenderWhitespace2[RenderWhitespace2["Selection"] = 2] = "Selection";
  RenderWhitespace2[RenderWhitespace2["Trailing"] = 3] = "Trailing";
  RenderWhitespace2[RenderWhitespace2["All"] = 4] = "All";
  return RenderWhitespace2;
})(RenderWhitespace || {});
class RenderLineInput {
  get isLTR() {
    return !this.containsRTL && this.textDirection !== TextDirection.RTL;
  }
  constructor(useMonospaceOptimizations, canUseHalfwidthRightwardsArrow, lineContent, continuesWithWrappedLine, isBasicASCII, containsRTL, fauxIndentLength, lineTokens, lineDecorations, tabSize, startVisibleColumn, spaceWidth, middotWidth, wsmiddotWidth, stopRenderingLineAfter, renderWhitespace, renderControlCharacters, fontLigatures, selectionsOnLine, textDirection, verticalScrollbarSize, renderNewLineWhenEmpty = false) {
    this.useMonospaceOptimizations = useMonospaceOptimizations;
    this.canUseHalfwidthRightwardsArrow = canUseHalfwidthRightwardsArrow;
    this.lineContent = lineContent;
    this.continuesWithWrappedLine = continuesWithWrappedLine;
    this.isBasicASCII = isBasicASCII;
    this.containsRTL = containsRTL;
    this.fauxIndentLength = fauxIndentLength;
    this.lineTokens = lineTokens;
    this.lineDecorations = lineDecorations.sort(LineDecoration.compare);
    this.tabSize = tabSize;
    this.startVisibleColumn = startVisibleColumn;
    this.spaceWidth = spaceWidth;
    this.stopRenderingLineAfter = stopRenderingLineAfter;
    this.renderWhitespace = renderWhitespace === "all" ? 4 /* All */ : renderWhitespace === "boundary" ? 1 /* Boundary */ : renderWhitespace === "selection" ? 2 /* Selection */ : renderWhitespace === "trailing" ? 3 /* Trailing */ : 0 /* None */;
    this.renderControlCharacters = renderControlCharacters;
    this.fontLigatures = fontLigatures;
    this.selectionsOnLine = selectionsOnLine && selectionsOnLine.sort((a, b) => a.start < b.start ? -1 : 1);
    this.renderNewLineWhenEmpty = renderNewLineWhenEmpty;
    this.textDirection = textDirection;
    this.verticalScrollbarSize = verticalScrollbarSize;
    const wsmiddotDiff = Math.abs(wsmiddotWidth - spaceWidth);
    const middotDiff = Math.abs(middotWidth - spaceWidth);
    if (wsmiddotDiff < middotDiff) {
      this.renderSpaceWidth = wsmiddotWidth;
      this.renderSpaceCharCode = 11825;
    } else {
      this.renderSpaceWidth = middotWidth;
      this.renderSpaceCharCode = 183;
    }
  }
  sameSelection(otherSelections) {
    if (this.selectionsOnLine === null) {
      return otherSelections === null;
    }
    if (otherSelections === null) {
      return false;
    }
    if (otherSelections.length !== this.selectionsOnLine.length) {
      return false;
    }
    for (let i = 0; i < this.selectionsOnLine.length; i++) {
      if (!this.selectionsOnLine[i].equals(otherSelections[i])) {
        return false;
      }
    }
    return true;
  }
  equals(other) {
    return this.useMonospaceOptimizations === other.useMonospaceOptimizations && this.canUseHalfwidthRightwardsArrow === other.canUseHalfwidthRightwardsArrow && this.lineContent === other.lineContent && this.continuesWithWrappedLine === other.continuesWithWrappedLine && this.isBasicASCII === other.isBasicASCII && this.containsRTL === other.containsRTL && this.fauxIndentLength === other.fauxIndentLength && this.tabSize === other.tabSize && this.startVisibleColumn === other.startVisibleColumn && this.spaceWidth === other.spaceWidth && this.renderSpaceWidth === other.renderSpaceWidth && this.renderSpaceCharCode === other.renderSpaceCharCode && this.stopRenderingLineAfter === other.stopRenderingLineAfter && this.renderWhitespace === other.renderWhitespace && this.renderControlCharacters === other.renderControlCharacters && this.fontLigatures === other.fontLigatures && LineDecoration.equalsArr(this.lineDecorations, other.lineDecorations) && this.lineTokens.equals(other.lineTokens) && this.sameSelection(other.selectionsOnLine) && this.textDirection === other.textDirection && this.verticalScrollbarSize === other.verticalScrollbarSize && this.renderNewLineWhenEmpty === other.renderNewLineWhenEmpty;
  }
}
var CharacterMappingConstants = /* @__PURE__ */ ((CharacterMappingConstants2) => {
  CharacterMappingConstants2[CharacterMappingConstants2["PART_INDEX_MASK"] = 4294901760] = "PART_INDEX_MASK";
  CharacterMappingConstants2[CharacterMappingConstants2["CHAR_INDEX_MASK"] = 65535] = "CHAR_INDEX_MASK";
  CharacterMappingConstants2[CharacterMappingConstants2["CHAR_INDEX_OFFSET"] = 0] = "CHAR_INDEX_OFFSET";
  CharacterMappingConstants2[CharacterMappingConstants2["PART_INDEX_OFFSET"] = 16] = "PART_INDEX_OFFSET";
  return CharacterMappingConstants2;
})(CharacterMappingConstants || {});
class DomPosition {
  constructor(partIndex, charIndex) {
    this.partIndex = partIndex;
    this.charIndex = charIndex;
  }
}
class CharacterMapping {
  static getPartIndex(partData) {
    return (partData & 4294901760 /* PART_INDEX_MASK */) >>> 16 /* PART_INDEX_OFFSET */;
  }
  static getCharIndex(partData) {
    return (partData & 65535 /* CHAR_INDEX_MASK */) >>> 0 /* CHAR_INDEX_OFFSET */;
  }
  constructor(length, partCount) {
    this.length = length;
    this._data = new Uint32Array(this.length);
    this._horizontalOffset = new Uint32Array(this.length);
  }
  setColumnInfo(column, partIndex, charIndex, horizontalOffset) {
    const partData = (partIndex << 16 /* PART_INDEX_OFFSET */ | charIndex << 0 /* CHAR_INDEX_OFFSET */) >>> 0;
    this._data[column - 1] = partData;
    this._horizontalOffset[column - 1] = horizontalOffset;
  }
  getHorizontalOffset(column) {
    if (this._horizontalOffset.length === 0) {
      return 0;
    }
    return this._horizontalOffset[column - 1];
  }
  charOffsetToPartData(charOffset) {
    if (this.length === 0) {
      return 0;
    }
    if (charOffset < 0) {
      return this._data[0];
    }
    if (charOffset >= this.length) {
      return this._data[this.length - 1];
    }
    return this._data[charOffset];
  }
  getDomPosition(column) {
    const partData = this.charOffsetToPartData(column - 1);
    const partIndex = CharacterMapping.getPartIndex(partData);
    const charIndex = CharacterMapping.getCharIndex(partData);
    return new DomPosition(partIndex, charIndex);
  }
  getColumn(domPosition, partLength) {
    const charOffset = this.partDataToCharOffset(domPosition.partIndex, partLength, domPosition.charIndex);
    return charOffset + 1;
  }
  partDataToCharOffset(partIndex, partLength, charIndex) {
    if (this.length === 0) {
      return 0;
    }
    const searchEntry = (partIndex << 16 /* PART_INDEX_OFFSET */ | charIndex << 0 /* CHAR_INDEX_OFFSET */) >>> 0;
    let min = 0;
    let max = this.length - 1;
    while (min + 1 < max) {
      const mid = min + max >>> 1;
      const midEntry = this._data[mid];
      if (midEntry === searchEntry) {
        return mid;
      } else if (midEntry > searchEntry) {
        max = mid;
      } else {
        min = mid;
      }
    }
    if (min === max) {
      return min;
    }
    const minEntry = this._data[min];
    const maxEntry = this._data[max];
    if (minEntry === searchEntry) {
      return min;
    }
    if (maxEntry === searchEntry) {
      return max;
    }
    const minPartIndex = CharacterMapping.getPartIndex(minEntry);
    const minCharIndex = CharacterMapping.getCharIndex(minEntry);
    const maxPartIndex = CharacterMapping.getPartIndex(maxEntry);
    let maxCharIndex;
    if (minPartIndex !== maxPartIndex) {
      maxCharIndex = partLength;
    } else {
      maxCharIndex = CharacterMapping.getCharIndex(maxEntry);
    }
    const minEntryDistance = charIndex - minCharIndex;
    const maxEntryDistance = maxCharIndex - charIndex;
    if (minEntryDistance <= maxEntryDistance) {
      return min;
    }
    return max;
  }
  inflate() {
    const result = [];
    for (let i = 0; i < this.length; i++) {
      const partData = this._data[i];
      const partIndex = CharacterMapping.getPartIndex(partData);
      const charIndex = CharacterMapping.getCharIndex(partData);
      const visibleColumn = this._horizontalOffset[i];
      result.push([partIndex, charIndex, visibleColumn]);
    }
    return result;
  }
}
var ForeignElementType = /* @__PURE__ */ ((ForeignElementType2) => {
  ForeignElementType2[ForeignElementType2["None"] = 0] = "None";
  ForeignElementType2[ForeignElementType2["Before"] = 1] = "Before";
  ForeignElementType2[ForeignElementType2["After"] = 2] = "After";
  return ForeignElementType2;
})(ForeignElementType || {});
class RenderLineOutput {
  constructor(characterMapping, containsForeignElements) {
    this._renderLineOutputBrand = void 0;
    this.characterMapping = characterMapping;
    this.containsForeignElements = containsForeignElements;
  }
}
function renderViewLine(input, sb) {
  if (input.lineContent.length === 0) {
    if (input.lineDecorations.length > 0) {
      sb.appendString(`<span>`);
      let beforeCount = 0;
      let afterCount = 0;
      let containsForeignElements = 0 /* None */;
      for (const lineDecoration of input.lineDecorations) {
        if (lineDecoration.type === InlineDecorationType.Before || lineDecoration.type === InlineDecorationType.After) {
          sb.appendString(`<span class="`);
          sb.appendString(lineDecoration.className);
          sb.appendString(`"></span>`);
          if (lineDecoration.type === InlineDecorationType.Before) {
            containsForeignElements |= 1 /* Before */;
            beforeCount++;
          }
          if (lineDecoration.type === InlineDecorationType.After) {
            containsForeignElements |= 2 /* After */;
            afterCount++;
          }
        }
      }
      sb.appendString(`</span>`);
      const characterMapping = new CharacterMapping(1, beforeCount + afterCount);
      characterMapping.setColumnInfo(1, beforeCount, 0, 0);
      return new RenderLineOutput(
        characterMapping,
        containsForeignElements
      );
    }
    if (input.renderNewLineWhenEmpty) {
      sb.appendString("<span><span>\n</span></span>");
    } else {
      sb.appendString("<span><span></span></span>");
    }
    return new RenderLineOutput(
      new CharacterMapping(0, 0),
      0 /* None */
    );
  }
  return _renderLine(resolveRenderLineInput(input), sb);
}
class RenderLineOutput2 {
  constructor(characterMapping, html, containsForeignElements) {
    this.characterMapping = characterMapping;
    this.html = html;
    this.containsForeignElements = containsForeignElements;
  }
}
function renderViewLine2(input) {
  const sb = new StringBuilder(1e4);
  const out = renderViewLine(input, sb);
  return new RenderLineOutput2(out.characterMapping, sb.build(), out.containsForeignElements);
}
class ResolvedRenderLineInput {
  constructor(fontIsMonospace, canUseHalfwidthRightwardsArrow, lineContent, len, isOverflowing, overflowingCharCount, parts, containsForeignElements, fauxIndentLength, tabSize, startVisibleColumn, spaceWidth, renderSpaceCharCode, renderWhitespace, renderControlCharacters) {
    this.fontIsMonospace = fontIsMonospace;
    this.canUseHalfwidthRightwardsArrow = canUseHalfwidthRightwardsArrow;
    this.lineContent = lineContent;
    this.len = len;
    this.isOverflowing = isOverflowing;
    this.overflowingCharCount = overflowingCharCount;
    this.parts = parts;
    this.containsForeignElements = containsForeignElements;
    this.fauxIndentLength = fauxIndentLength;
    this.tabSize = tabSize;
    this.startVisibleColumn = startVisibleColumn;
    this.spaceWidth = spaceWidth;
    this.renderSpaceCharCode = renderSpaceCharCode;
    this.renderWhitespace = renderWhitespace;
    this.renderControlCharacters = renderControlCharacters;
  }
}
function resolveRenderLineInput(input) {
  const lineContent = input.lineContent;
  let isOverflowing;
  let overflowingCharCount;
  let len;
  if (input.stopRenderingLineAfter !== -1 && input.stopRenderingLineAfter < lineContent.length) {
    isOverflowing = true;
    overflowingCharCount = lineContent.length - input.stopRenderingLineAfter;
    len = input.stopRenderingLineAfter;
  } else {
    isOverflowing = false;
    overflowingCharCount = 0;
    len = lineContent.length;
  }
  let tokens = transformAndRemoveOverflowing(lineContent, input.containsRTL, input.lineTokens, input.fauxIndentLength, len);
  if (input.renderControlCharacters && !input.isBasicASCII) {
    tokens = extractControlCharacters(lineContent, tokens);
  }
  if (input.renderWhitespace === 4 /* All */ || input.renderWhitespace === 1 /* Boundary */ || input.renderWhitespace === 2 /* Selection */ && !!input.selectionsOnLine || input.renderWhitespace === 3 /* Trailing */ && !input.continuesWithWrappedLine) {
    tokens = _applyRenderWhitespace(input, lineContent, len, tokens);
  }
  let containsForeignElements = 0 /* None */;
  if (input.lineDecorations.length > 0) {
    for (let i = 0, len2 = input.lineDecorations.length; i < len2; i++) {
      const lineDecoration = input.lineDecorations[i];
      if (lineDecoration.type === InlineDecorationType.RegularAffectingLetterSpacing) {
        containsForeignElements |= 1 /* Before */;
      } else if (lineDecoration.type === InlineDecorationType.Before) {
        containsForeignElements |= 1 /* Before */;
      } else if (lineDecoration.type === InlineDecorationType.After) {
        containsForeignElements |= 2 /* After */;
      }
    }
    tokens = _applyInlineDecorations(lineContent, len, tokens, input.lineDecorations);
  }
  if (!input.containsRTL) {
    tokens = splitLargeTokens(lineContent, tokens, !input.isBasicASCII || input.fontLigatures);
  } else {
    tokens = splitLeadingWhitespaceFromRTL(lineContent, tokens);
  }
  return new ResolvedRenderLineInput(
    input.useMonospaceOptimizations,
    input.canUseHalfwidthRightwardsArrow,
    lineContent,
    len,
    isOverflowing,
    overflowingCharCount,
    tokens,
    containsForeignElements,
    input.fauxIndentLength,
    input.tabSize,
    input.startVisibleColumn,
    input.spaceWidth,
    input.renderSpaceCharCode,
    input.renderWhitespace,
    input.renderControlCharacters
  );
}
function transformAndRemoveOverflowing(lineContent, lineContainsRTL, tokens, fauxIndentLength, len) {
  const result = [];
  let resultLen = 0;
  if (fauxIndentLength > 0) {
    result[resultLen++] = new LinePart(fauxIndentLength, "", 0, false);
  }
  let startOffset = fauxIndentLength;
  for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
    const endIndex = tokens.getEndOffset(tokenIndex);
    if (endIndex <= fauxIndentLength) {
      continue;
    }
    const type = tokens.getClassName(tokenIndex);
    if (endIndex >= len) {
      const tokenContainsRTL2 = lineContainsRTL ? strings.containsRTL(lineContent.substring(startOffset, len)) : false;
      result[resultLen++] = new LinePart(len, type, 0, tokenContainsRTL2);
      break;
    }
    const tokenContainsRTL = lineContainsRTL ? strings.containsRTL(lineContent.substring(startOffset, endIndex)) : false;
    result[resultLen++] = new LinePart(endIndex, type, 0, tokenContainsRTL);
    startOffset = endIndex;
  }
  return result;
}
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["LongToken"] = 50] = "LongToken";
  return Constants2;
})(Constants || {});
function splitLargeTokens(lineContent, tokens, onlyAtSpaces) {
  let lastTokenEndIndex = 0;
  const result = [];
  let resultLen = 0;
  if (onlyAtSpaces) {
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const tokenEndIndex = token.endIndex;
      if (lastTokenEndIndex + 50 /* LongToken */ < tokenEndIndex) {
        const tokenType = token.type;
        const tokenMetadata = token.metadata;
        const tokenContainsRTL = token.containsRTL;
        let lastSpaceOffset = -1;
        let currTokenStart = lastTokenEndIndex;
        for (let j = lastTokenEndIndex; j < tokenEndIndex; j++) {
          if (lineContent.charCodeAt(j) === CharCode.Space) {
            lastSpaceOffset = j;
          }
          if (lastSpaceOffset !== -1 && j - currTokenStart >= 50 /* LongToken */) {
            result[resultLen++] = new LinePart(lastSpaceOffset + 1, tokenType, tokenMetadata, tokenContainsRTL);
            currTokenStart = lastSpaceOffset + 1;
            lastSpaceOffset = -1;
          }
        }
        if (currTokenStart !== tokenEndIndex) {
          result[resultLen++] = new LinePart(tokenEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
        }
      } else {
        result[resultLen++] = token;
      }
      lastTokenEndIndex = tokenEndIndex;
    }
  } else {
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const tokenEndIndex = token.endIndex;
      const diff = tokenEndIndex - lastTokenEndIndex;
      if (diff > 50 /* LongToken */) {
        const tokenType = token.type;
        const tokenMetadata = token.metadata;
        const tokenContainsRTL = token.containsRTL;
        const piecesCount = Math.ceil(diff / 50 /* LongToken */);
        for (let j = 1; j < piecesCount; j++) {
          const pieceEndIndex = lastTokenEndIndex + j * 50 /* LongToken */;
          result[resultLen++] = new LinePart(pieceEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
        }
        result[resultLen++] = new LinePart(tokenEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
      } else {
        result[resultLen++] = token;
      }
      lastTokenEndIndex = tokenEndIndex;
    }
  }
  return result;
}
function splitLeadingWhitespaceFromRTL(lineContent, tokens) {
  if (tokens.length === 0) {
    return tokens;
  }
  const firstToken = tokens[0];
  if (!firstToken.containsRTL) {
    return tokens;
  }
  const firstTokenEndIndex = firstToken.endIndex;
  let firstNonWhitespaceIndex = 0;
  for (let i = 0; i < firstTokenEndIndex; i++) {
    const charCode = lineContent.charCodeAt(i);
    if (charCode !== CharCode.Space && charCode !== CharCode.Tab) {
      firstNonWhitespaceIndex = i;
      break;
    }
  }
  if (firstNonWhitespaceIndex === 0) {
    return tokens;
  }
  const result = [];
  result.push(new LinePart(firstNonWhitespaceIndex, firstToken.type, firstToken.metadata, false));
  result.push(new LinePart(firstTokenEndIndex, firstToken.type, firstToken.metadata, firstToken.containsRTL));
  for (let i = 1; i < tokens.length; i++) {
    result.push(tokens[i]);
  }
  return result;
}
function isControlCharacter(charCode) {
  if (charCode < 32) {
    return charCode !== CharCode.Tab;
  }
  if (charCode === 127) {
    return true;
  }
  if (charCode >= 8234 && charCode <= 8238 || charCode >= 8294 && charCode <= 8297 || charCode >= 8206 && charCode <= 8207 || charCode === 1564) {
    return true;
  }
  return false;
}
function extractControlCharacters(lineContent, tokens) {
  const result = [];
  let lastLinePart = new LinePart(0, "", 0, false);
  let charOffset = 0;
  for (const token of tokens) {
    const tokenEndIndex = token.endIndex;
    for (; charOffset < tokenEndIndex; charOffset++) {
      const charCode = lineContent.charCodeAt(charOffset);
      if (isControlCharacter(charCode)) {
        if (charOffset > lastLinePart.endIndex) {
          lastLinePart = new LinePart(charOffset, token.type, token.metadata, token.containsRTL);
          result.push(lastLinePart);
        }
        lastLinePart = new LinePart(charOffset + 1, "mtkcontrol", token.metadata, false);
        result.push(lastLinePart);
      }
    }
    if (charOffset > lastLinePart.endIndex) {
      lastLinePart = new LinePart(tokenEndIndex, token.type, token.metadata, token.containsRTL);
      result.push(lastLinePart);
    }
  }
  return result;
}
function _applyRenderWhitespace(input, lineContent, len, tokens) {
  const continuesWithWrappedLine = input.continuesWithWrappedLine;
  const fauxIndentLength = input.fauxIndentLength;
  const tabSize = input.tabSize;
  const startVisibleColumn = input.startVisibleColumn;
  const useMonospaceOptimizations = input.useMonospaceOptimizations;
  const selections = input.selectionsOnLine;
  const onlyBoundary = input.renderWhitespace === 1 /* Boundary */;
  const onlyTrailing = input.renderWhitespace === 3 /* Trailing */;
  const generateLinePartForEachWhitespace = input.renderSpaceWidth !== input.spaceWidth;
  const result = [];
  let resultLen = 0;
  let tokenIndex = 0;
  let tokenType = tokens[tokenIndex].type;
  let tokenContainsRTL = tokens[tokenIndex].containsRTL;
  let tokenEndIndex = tokens[tokenIndex].endIndex;
  const tokensLength = tokens.length;
  let lineIsEmptyOrWhitespace = false;
  let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
  let lastNonWhitespaceIndex;
  if (firstNonWhitespaceIndex === -1) {
    lineIsEmptyOrWhitespace = true;
    firstNonWhitespaceIndex = len;
    lastNonWhitespaceIndex = len;
  } else {
    lastNonWhitespaceIndex = strings.lastNonWhitespaceIndex(lineContent);
  }
  let wasInWhitespace = false;
  let currentSelectionIndex = 0;
  let currentSelection = selections && selections[currentSelectionIndex];
  let tmpIndent = startVisibleColumn % tabSize;
  for (let charIndex = fauxIndentLength; charIndex < len; charIndex++) {
    const chCode = lineContent.charCodeAt(charIndex);
    if (currentSelection && currentSelection.endExclusive <= charIndex) {
      currentSelectionIndex++;
      currentSelection = selections && selections[currentSelectionIndex];
    }
    let isInWhitespace;
    if (charIndex < firstNonWhitespaceIndex || charIndex > lastNonWhitespaceIndex) {
      isInWhitespace = true;
    } else if (chCode === CharCode.Tab) {
      isInWhitespace = true;
    } else if (chCode === CharCode.Space) {
      if (onlyBoundary) {
        if (wasInWhitespace) {
          isInWhitespace = true;
        } else {
          const nextChCode = charIndex + 1 < len ? lineContent.charCodeAt(charIndex + 1) : CharCode.Null;
          isInWhitespace = nextChCode === CharCode.Space || nextChCode === CharCode.Tab;
        }
      } else {
        isInWhitespace = true;
      }
    } else {
      isInWhitespace = false;
    }
    if (isInWhitespace && selections) {
      isInWhitespace = !!currentSelection && currentSelection.start <= charIndex && charIndex < currentSelection.endExclusive;
    }
    if (isInWhitespace && onlyTrailing) {
      isInWhitespace = lineIsEmptyOrWhitespace || charIndex > lastNonWhitespaceIndex;
    }
    if (isInWhitespace && tokenContainsRTL) {
      if (charIndex >= firstNonWhitespaceIndex && charIndex <= lastNonWhitespaceIndex) {
        isInWhitespace = false;
      }
    }
    if (wasInWhitespace) {
      if (!isInWhitespace || !useMonospaceOptimizations && tmpIndent >= tabSize) {
        if (generateLinePartForEachWhitespace) {
          const lastEndIndex = resultLen > 0 ? result[resultLen - 1].endIndex : fauxIndentLength;
          for (let i = lastEndIndex + 1; i <= charIndex; i++) {
            result[resultLen++] = new LinePart(i, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
          }
        } else {
          result[resultLen++] = new LinePart(charIndex, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
        }
        tmpIndent = tmpIndent % tabSize;
      }
    } else {
      if (charIndex === tokenEndIndex || isInWhitespace && charIndex > fauxIndentLength) {
        result[resultLen++] = new LinePart(charIndex, tokenType, 0, tokenContainsRTL);
        tmpIndent = tmpIndent % tabSize;
      }
    }
    if (chCode === CharCode.Tab) {
      tmpIndent = tabSize;
    } else if (strings.isFullWidthCharacter(chCode)) {
      tmpIndent += 2;
    } else {
      tmpIndent++;
    }
    wasInWhitespace = isInWhitespace;
    while (charIndex === tokenEndIndex) {
      tokenIndex++;
      if (tokenIndex < tokensLength) {
        tokenType = tokens[tokenIndex].type;
        tokenContainsRTL = tokens[tokenIndex].containsRTL;
        tokenEndIndex = tokens[tokenIndex].endIndex;
      } else {
        break;
      }
    }
  }
  let generateWhitespace = false;
  if (wasInWhitespace) {
    if (continuesWithWrappedLine && onlyBoundary) {
      const lastCharCode = len > 0 ? lineContent.charCodeAt(len - 1) : CharCode.Null;
      const prevCharCode = len > 1 ? lineContent.charCodeAt(len - 2) : CharCode.Null;
      const isSingleTrailingSpace = lastCharCode === CharCode.Space && (prevCharCode !== CharCode.Space && prevCharCode !== CharCode.Tab);
      if (!isSingleTrailingSpace) {
        generateWhitespace = true;
      }
    } else {
      generateWhitespace = true;
    }
  }
  if (generateWhitespace) {
    if (generateLinePartForEachWhitespace) {
      const lastEndIndex = resultLen > 0 ? result[resultLen - 1].endIndex : fauxIndentLength;
      for (let i = lastEndIndex + 1; i <= len; i++) {
        result[resultLen++] = new LinePart(i, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
      }
    } else {
      result[resultLen++] = new LinePart(len, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
    }
  } else {
    result[resultLen++] = new LinePart(len, tokenType, 0, tokenContainsRTL);
  }
  return result;
}
function _applyInlineDecorations(lineContent, len, tokens, _lineDecorations) {
  _lineDecorations.sort(LineDecoration.compare);
  const lineDecorations = LineDecorationsNormalizer.normalize(lineContent, _lineDecorations);
  const lineDecorationsLen = lineDecorations.length;
  let lineDecorationIndex = 0;
  const result = [];
  let resultLen = 0;
  let lastResultEndIndex = 0;
  for (let tokenIndex = 0, len2 = tokens.length; tokenIndex < len2; tokenIndex++) {
    const token = tokens[tokenIndex];
    const tokenEndIndex = token.endIndex;
    const tokenType = token.type;
    const tokenMetadata = token.metadata;
    const tokenContainsRTL = token.containsRTL;
    while (lineDecorationIndex < lineDecorationsLen && lineDecorations[lineDecorationIndex].startOffset < tokenEndIndex) {
      const lineDecoration = lineDecorations[lineDecorationIndex];
      if (lineDecoration.startOffset > lastResultEndIndex) {
        lastResultEndIndex = lineDecoration.startOffset;
        result[resultLen++] = new LinePart(lastResultEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
      }
      if (lineDecoration.endOffset + 1 <= tokenEndIndex) {
        lastResultEndIndex = lineDecoration.endOffset + 1;
        result[resultLen++] = new LinePart(lastResultEndIndex, tokenType + " " + lineDecoration.className, tokenMetadata | lineDecoration.metadata, tokenContainsRTL);
        lineDecorationIndex++;
      } else {
        lastResultEndIndex = tokenEndIndex;
        result[resultLen++] = new LinePart(lastResultEndIndex, tokenType + " " + lineDecoration.className, tokenMetadata | lineDecoration.metadata, tokenContainsRTL);
        break;
      }
    }
    if (tokenEndIndex > lastResultEndIndex) {
      lastResultEndIndex = tokenEndIndex;
      result[resultLen++] = new LinePart(lastResultEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
    }
  }
  const lastTokenEndIndex = tokens[tokens.length - 1].endIndex;
  if (lineDecorationIndex < lineDecorationsLen && lineDecorations[lineDecorationIndex].startOffset === lastTokenEndIndex) {
    while (lineDecorationIndex < lineDecorationsLen && lineDecorations[lineDecorationIndex].startOffset === lastTokenEndIndex) {
      const lineDecoration = lineDecorations[lineDecorationIndex];
      result[resultLen++] = new LinePart(lastResultEndIndex, lineDecoration.className, lineDecoration.metadata, false);
      lineDecorationIndex++;
    }
  }
  return result;
}
function _renderLine(input, sb) {
  const fontIsMonospace = input.fontIsMonospace;
  const canUseHalfwidthRightwardsArrow = input.canUseHalfwidthRightwardsArrow;
  const containsForeignElements = input.containsForeignElements;
  const lineContent = input.lineContent;
  const len = input.len;
  const isOverflowing = input.isOverflowing;
  const overflowingCharCount = input.overflowingCharCount;
  const parts = input.parts;
  const fauxIndentLength = input.fauxIndentLength;
  const tabSize = input.tabSize;
  const startVisibleColumn = input.startVisibleColumn;
  const spaceWidth = input.spaceWidth;
  const renderSpaceCharCode = input.renderSpaceCharCode;
  const renderWhitespace = input.renderWhitespace;
  const renderControlCharacters = input.renderControlCharacters;
  const characterMapping = new CharacterMapping(len + 1, parts.length);
  let lastCharacterMappingDefined = false;
  let charIndex = 0;
  let visibleColumn = startVisibleColumn;
  let charOffsetInPart = 0;
  let charHorizontalOffset = 0;
  let partDisplacement = 0;
  sb.appendString("<span>");
  for (let partIndex = 0, tokensLen = parts.length; partIndex < tokensLen; partIndex++) {
    const part = parts[partIndex];
    const partEndIndex = part.endIndex;
    const partType = part.type;
    const partContainsRTL = part.containsRTL;
    const partRendersWhitespace = renderWhitespace !== 0 /* None */ && part.isWhitespace();
    const partRendersWhitespaceWithWidth = partRendersWhitespace && !fontIsMonospace && (partType === "mtkw" || !containsForeignElements);
    const partIsEmptyAndHasPseudoAfter = charIndex === partEndIndex && part.isPseudoAfter();
    charOffsetInPart = 0;
    sb.appendString("<span ");
    if (partContainsRTL) {
      sb.appendString('style="unicode-bidi:isolate" ');
    }
    sb.appendString('class="');
    sb.appendString(partRendersWhitespaceWithWidth ? "mtkz" : partType);
    sb.appendASCIICharCode(CharCode.DoubleQuote);
    if (partRendersWhitespace) {
      let partWidth = 0;
      {
        let _charIndex = charIndex;
        let _visibleColumn = visibleColumn;
        for (; _charIndex < partEndIndex; _charIndex++) {
          const charCode = lineContent.charCodeAt(_charIndex);
          const charWidth = (charCode === CharCode.Tab ? tabSize - _visibleColumn % tabSize : 1) | 0;
          partWidth += charWidth;
          if (_charIndex >= fauxIndentLength) {
            _visibleColumn += charWidth;
          }
        }
      }
      if (partRendersWhitespaceWithWidth) {
        sb.appendString(' style="width:');
        sb.appendString(String(spaceWidth * partWidth));
        sb.appendString('px"');
      }
      sb.appendASCIICharCode(CharCode.GreaterThan);
      for (; charIndex < partEndIndex; charIndex++) {
        characterMapping.setColumnInfo(charIndex + 1, partIndex - partDisplacement, charOffsetInPart, charHorizontalOffset);
        partDisplacement = 0;
        const charCode = lineContent.charCodeAt(charIndex);
        let producedCharacters;
        let charWidth;
        if (charCode === CharCode.Tab) {
          producedCharacters = tabSize - visibleColumn % tabSize | 0;
          charWidth = producedCharacters;
          if (!canUseHalfwidthRightwardsArrow || charWidth > 1) {
            sb.appendCharCode(8594);
          } else {
            sb.appendCharCode(65515);
          }
          for (let space = 2; space <= charWidth; space++) {
            sb.appendCharCode(160);
          }
        } else {
          producedCharacters = 2;
          charWidth = 1;
          sb.appendCharCode(renderSpaceCharCode);
          sb.appendCharCode(8204);
        }
        charOffsetInPart += producedCharacters;
        charHorizontalOffset += charWidth;
        if (charIndex >= fauxIndentLength) {
          visibleColumn += charWidth;
        }
      }
    } else {
      sb.appendASCIICharCode(CharCode.GreaterThan);
      for (; charIndex < partEndIndex; charIndex++) {
        characterMapping.setColumnInfo(charIndex + 1, partIndex - partDisplacement, charOffsetInPart, charHorizontalOffset);
        partDisplacement = 0;
        const charCode = lineContent.charCodeAt(charIndex);
        let producedCharacters = 1;
        let charWidth = 1;
        switch (charCode) {
          case CharCode.Tab:
            producedCharacters = tabSize - visibleColumn % tabSize;
            charWidth = producedCharacters;
            for (let space = 1; space <= producedCharacters; space++) {
              sb.appendCharCode(160);
            }
            break;
          case CharCode.Space:
            sb.appendCharCode(160);
            break;
          case CharCode.LessThan:
            sb.appendString("&lt;");
            break;
          case CharCode.GreaterThan:
            sb.appendString("&gt;");
            break;
          case CharCode.Ampersand:
            sb.appendString("&amp;");
            break;
          case CharCode.Null:
            if (renderControlCharacters) {
              sb.appendCharCode(9216);
            } else {
              sb.appendString("&#00;");
            }
            break;
          case CharCode.UTF8_BOM:
          case CharCode.LINE_SEPARATOR:
          case CharCode.PARAGRAPH_SEPARATOR:
          case CharCode.NEXT_LINE:
            sb.appendCharCode(65533);
            break;
          default:
            if (strings.isFullWidthCharacter(charCode)) {
              charWidth++;
            }
            if (renderControlCharacters && charCode < 32) {
              sb.appendCharCode(9216 + charCode);
            } else if (renderControlCharacters && charCode === 127) {
              sb.appendCharCode(9249);
            } else if (renderControlCharacters && isControlCharacter(charCode)) {
              sb.appendString("[U+");
              sb.appendString(to4CharHex(charCode));
              sb.appendString("]");
              producedCharacters = 8;
              charWidth = producedCharacters;
            } else {
              sb.appendCharCode(charCode);
            }
        }
        charOffsetInPart += producedCharacters;
        charHorizontalOffset += charWidth;
        if (charIndex >= fauxIndentLength) {
          visibleColumn += charWidth;
        }
      }
    }
    if (partIsEmptyAndHasPseudoAfter) {
      partDisplacement++;
    } else {
      partDisplacement = 0;
    }
    if (charIndex >= len && !lastCharacterMappingDefined && part.isPseudoAfter()) {
      lastCharacterMappingDefined = true;
      characterMapping.setColumnInfo(charIndex + 1, partIndex, charOffsetInPart, charHorizontalOffset);
    }
    sb.appendString("</span>");
  }
  if (!lastCharacterMappingDefined) {
    characterMapping.setColumnInfo(len + 1, parts.length - 1, charOffsetInPart, charHorizontalOffset);
  }
  if (isOverflowing) {
    sb.appendString('<span class="mtkoverflow">');
    sb.appendString(nls.localize("showMore", "Show more ({0})", renderOverflowingCharCount(overflowingCharCount)));
    sb.appendString("</span>");
  }
  sb.appendString("</span>");
  return new RenderLineOutput(characterMapping, containsForeignElements);
}
function to4CharHex(n) {
  return n.toString(16).toUpperCase().padStart(4, "0");
}
function renderOverflowingCharCount(n) {
  if (n < 1024) {
    return nls.localize("overflow.chars", "{0} chars", n);
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export {
  CharacterMapping,
  DomPosition,
  ForeignElementType,
  RenderLineInput,
  RenderLineOutput,
  RenderLineOutput2,
  RenderWhitespace,
  renderViewLine,
  renderViewLine2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdmlld0xheW91dC92aWV3TGluZVJlbmRlcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJVmlld0xpbmVUb2tlbnMgfSBmcm9tICcuLi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBTdHJpbmdCdWlsZGVyIH0gZnJvbSAnLi4vY29yZS9zdHJpbmdCdWlsZGVyLmpzJztcbmltcG9ydCB7IExpbmVEZWNvcmF0aW9uLCBMaW5lRGVjb3JhdGlvbnNOb3JtYWxpemVyIH0gZnJvbSAnLi9saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgTGluZVBhcnQsIExpbmVQYXJ0TWV0YWRhdGEgfSBmcm9tICcuL2xpbmVQYXJ0LmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgSW5saW5lRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgVGV4dERpcmVjdGlvbiB9IGZyb20gJy4uL21vZGVsLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gUmVuZGVyV2hpdGVzcGFjZSB7XG5cdE5vbmUgPSAwLFxuXHRCb3VuZGFyeSA9IDEsXG5cdFNlbGVjdGlvbiA9IDIsXG5cdFRyYWlsaW5nID0gMyxcblx0QWxsID0gNFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZW5kZXJMaW5lSW5wdXRPcHRpb25zIHtcblx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogYm9vbGVhbjtcblx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBib29sZWFuO1xuXHRsaW5lQ29udGVudDogc3RyaW5nO1xuXHRjb250aW51ZXNXaXRoV3JhcHBlZExpbmU6IGJvb2xlYW47XG5cdGlzQmFzaWNBU0NJSTogYm9vbGVhbjtcblx0Y29udGFpbnNSVEw6IGJvb2xlYW47XG5cdGZhdXhJbmRlbnRMZW5ndGg6IG51bWJlcjtcblx0bGluZVRva2VuczogSVZpZXdMaW5lVG9rZW5zO1xuXHRsaW5lRGVjb3JhdGlvbnM6IExpbmVEZWNvcmF0aW9uW107XG5cdHRhYlNpemU6IG51bWJlcjtcblx0c3RhcnRWaXNpYmxlQ29sdW1uOiBudW1iZXI7XG5cdHNwYWNlV2lkdGg6IG51bWJlcjtcblx0bWlkZG90V2lkdGg6IG51bWJlcjtcblx0d3NtaWRkb3RXaWR0aDogbnVtYmVyO1xuXHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiBudW1iZXI7XG5cdHJlbmRlcldoaXRlc3BhY2U6ICdub25lJyB8ICdib3VuZGFyeScgfCAnc2VsZWN0aW9uJyB8ICd0cmFpbGluZycgfCAnYWxsJztcblx0cmVuZGVyQ29udHJvbENoYXJhY3RlcnM6IGJvb2xlYW47XG5cdGZvbnRMaWdhdHVyZXM6IGJvb2xlYW47XG5cdHNlbGVjdGlvbnNPbkxpbmU6IE9mZnNldFJhbmdlW10gfCBudWxsO1xuXHR0ZXh0RGlyZWN0aW9uOiBUZXh0RGlyZWN0aW9uIHwgbnVsbDtcblx0dmVydGljYWxTY3JvbGxiYXJTaXplOiBudW1iZXI7XG5cdHJlbmRlck5ld0xpbmVXaGVuRW1wdHk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBSZW5kZXJMaW5lSW5wdXQge1xuXG5cdHB1YmxpYyByZWFkb25seSB1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGluZUNvbnRlbnQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZTogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGlzQmFzaWNBU0NJSTogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGNvbnRhaW5zUlRMOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgZmF1eEluZGVudExlbmd0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGluZVRva2VuczogSVZpZXdMaW5lVG9rZW5zO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGluZURlY29yYXRpb25zOiBMaW5lRGVjb3JhdGlvbltdO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGFiU2l6ZTogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRWaXNpYmxlQ29sdW1uOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzcGFjZVdpZHRoOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSByZW5kZXJTcGFjZVdpZHRoOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSByZW5kZXJTcGFjZUNoYXJDb2RlOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSByZW5kZXJXaGl0ZXNwYWNlOiBSZW5kZXJXaGl0ZXNwYWNlO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyQ29udHJvbENoYXJhY3RlcnM6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBmb250TGlnYXR1cmVzOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGV4dERpcmVjdGlvbjogVGV4dERpcmVjdGlvbiB8IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSB2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IG51bWJlcjtcblxuXHQvKipcblx0ICogRGVmaW5lZCBvbmx5IHdoZW4gcmVuZGVyV2hpdGVzcGFjZSBpcyAnc2VsZWN0aW9uJy4gU2VsZWN0aW9ucyBhcmUgbm9uLW92ZXJsYXBwaW5nLFxuXHQgKiBhbmQgb3JkZXJlZCBieSBwb3NpdGlvbiB3aXRoaW4gdGhlIGxpbmUuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgc2VsZWN0aW9uc09uTGluZTogT2Zmc2V0UmFuZ2VbXSB8IG51bGw7XG5cdC8qKlxuXHQgKiBXaGVuIHJlbmRlcmluZyBhbiBlbXB0eSBsaW5lLCB3aGV0aGVyIHRvIHJlbmRlciBhIG5ldyBsaW5lIGluc3RlYWRcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSByZW5kZXJOZXdMaW5lV2hlbkVtcHR5OiBib29sZWFuO1xuXG5cdHB1YmxpYyBnZXQgaXNMVFIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmNvbnRhaW5zUlRMICYmIHRoaXMudGV4dERpcmVjdGlvbiAhPT0gVGV4dERpcmVjdGlvbi5SVEw7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiBib29sZWFuLFxuXHRcdGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogYm9vbGVhbixcblx0XHRsaW5lQ29udGVudDogc3RyaW5nLFxuXHRcdGNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZTogYm9vbGVhbixcblx0XHRpc0Jhc2ljQVNDSUk6IGJvb2xlYW4sXG5cdFx0Y29udGFpbnNSVEw6IGJvb2xlYW4sXG5cdFx0ZmF1eEluZGVudExlbmd0aDogbnVtYmVyLFxuXHRcdGxpbmVUb2tlbnM6IElWaWV3TGluZVRva2Vucyxcblx0XHRsaW5lRGVjb3JhdGlvbnM6IExpbmVEZWNvcmF0aW9uW10sXG5cdFx0dGFiU2l6ZTogbnVtYmVyLFxuXHRcdHN0YXJ0VmlzaWJsZUNvbHVtbjogbnVtYmVyLFxuXHRcdHNwYWNlV2lkdGg6IG51bWJlcixcblx0XHRtaWRkb3RXaWR0aDogbnVtYmVyLFxuXHRcdHdzbWlkZG90V2lkdGg6IG51bWJlcixcblx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiBudW1iZXIsXG5cdFx0cmVuZGVyV2hpdGVzcGFjZTogJ25vbmUnIHwgJ2JvdW5kYXJ5JyB8ICdzZWxlY3Rpb24nIHwgJ3RyYWlsaW5nJyB8ICdhbGwnLFxuXHRcdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiBib29sZWFuLFxuXHRcdGZvbnRMaWdhdHVyZXM6IGJvb2xlYW4sXG5cdFx0c2VsZWN0aW9uc09uTGluZTogT2Zmc2V0UmFuZ2VbXSB8IG51bGwsXG5cdFx0dGV4dERpcmVjdGlvbjogVGV4dERpcmVjdGlvbiB8IG51bGwsXG5cdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiBudW1iZXIsXG5cdFx0cmVuZGVyTmV3TGluZVdoZW5FbXB0eTogYm9vbGVhbiA9IGZhbHNlLFxuXHQpIHtcblx0XHR0aGlzLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMgPSB1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zO1xuXHRcdHRoaXMuY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93ID0gY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93O1xuXHRcdHRoaXMubGluZUNvbnRlbnQgPSBsaW5lQ29udGVudDtcblx0XHR0aGlzLmNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZSA9IGNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZTtcblx0XHR0aGlzLmlzQmFzaWNBU0NJSSA9IGlzQmFzaWNBU0NJSTtcblx0XHR0aGlzLmNvbnRhaW5zUlRMID0gY29udGFpbnNSVEw7XG5cdFx0dGhpcy5mYXV4SW5kZW50TGVuZ3RoID0gZmF1eEluZGVudExlbmd0aDtcblx0XHR0aGlzLmxpbmVUb2tlbnMgPSBsaW5lVG9rZW5zO1xuXHRcdHRoaXMubGluZURlY29yYXRpb25zID0gbGluZURlY29yYXRpb25zLnNvcnQoTGluZURlY29yYXRpb24uY29tcGFyZSk7XG5cdFx0dGhpcy50YWJTaXplID0gdGFiU2l6ZTtcblx0XHR0aGlzLnN0YXJ0VmlzaWJsZUNvbHVtbiA9IHN0YXJ0VmlzaWJsZUNvbHVtbjtcblx0XHR0aGlzLnNwYWNlV2lkdGggPSBzcGFjZVdpZHRoO1xuXHRcdHRoaXMuc3RvcFJlbmRlcmluZ0xpbmVBZnRlciA9IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI7XG5cdFx0dGhpcy5yZW5kZXJXaGl0ZXNwYWNlID0gKFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZSA9PT0gJ2FsbCdcblx0XHRcdFx0PyBSZW5kZXJXaGl0ZXNwYWNlLkFsbFxuXHRcdFx0XHQ6IHJlbmRlcldoaXRlc3BhY2UgPT09ICdib3VuZGFyeSdcblx0XHRcdFx0XHQ/IFJlbmRlcldoaXRlc3BhY2UuQm91bmRhcnlcblx0XHRcdFx0XHQ6IHJlbmRlcldoaXRlc3BhY2UgPT09ICdzZWxlY3Rpb24nXG5cdFx0XHRcdFx0XHQ/IFJlbmRlcldoaXRlc3BhY2UuU2VsZWN0aW9uXG5cdFx0XHRcdFx0XHQ6IHJlbmRlcldoaXRlc3BhY2UgPT09ICd0cmFpbGluZydcblx0XHRcdFx0XHRcdFx0PyBSZW5kZXJXaGl0ZXNwYWNlLlRyYWlsaW5nXG5cdFx0XHRcdFx0XHRcdDogUmVuZGVyV2hpdGVzcGFjZS5Ob25lXG5cdFx0KTtcblx0XHR0aGlzLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzID0gcmVuZGVyQ29udHJvbENoYXJhY3RlcnM7XG5cdFx0dGhpcy5mb250TGlnYXR1cmVzID0gZm9udExpZ2F0dXJlcztcblx0XHR0aGlzLnNlbGVjdGlvbnNPbkxpbmUgPSBzZWxlY3Rpb25zT25MaW5lICYmIHNlbGVjdGlvbnNPbkxpbmUuc29ydCgoYSwgYikgPT4gYS5zdGFydCA8IGIuc3RhcnQgPyAtMSA6IDEpO1xuXHRcdHRoaXMucmVuZGVyTmV3TGluZVdoZW5FbXB0eSA9IHJlbmRlck5ld0xpbmVXaGVuRW1wdHk7XG5cdFx0dGhpcy50ZXh0RGlyZWN0aW9uID0gdGV4dERpcmVjdGlvbjtcblx0XHR0aGlzLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSA9IHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTtcblxuXHRcdGNvbnN0IHdzbWlkZG90RGlmZiA9IE1hdGguYWJzKHdzbWlkZG90V2lkdGggLSBzcGFjZVdpZHRoKTtcblx0XHRjb25zdCBtaWRkb3REaWZmID0gTWF0aC5hYnMobWlkZG90V2lkdGggLSBzcGFjZVdpZHRoKTtcblx0XHRpZiAod3NtaWRkb3REaWZmIDwgbWlkZG90RGlmZikge1xuXHRcdFx0dGhpcy5yZW5kZXJTcGFjZVdpZHRoID0gd3NtaWRkb3RXaWR0aDtcblx0XHRcdHRoaXMucmVuZGVyU3BhY2VDaGFyQ29kZSA9IDB4MkUzMTsgLy8gVSsyRTMxIC0gV09SRCBTRVBBUkFUT1IgTUlERExFIERPVFxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlbmRlclNwYWNlV2lkdGggPSBtaWRkb3RXaWR0aDtcblx0XHRcdHRoaXMucmVuZGVyU3BhY2VDaGFyQ29kZSA9IDB4Qjc7IC8vIFUrMDBCNyAtIE1JRERMRSBET1Rcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNhbWVTZWxlY3Rpb24ob3RoZXJTZWxlY3Rpb25zOiBPZmZzZXRSYW5nZVtdIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnNlbGVjdGlvbnNPbkxpbmUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBvdGhlclNlbGVjdGlvbnMgPT09IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVyU2VsZWN0aW9ucyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlclNlbGVjdGlvbnMubGVuZ3RoICE9PSB0aGlzLnNlbGVjdGlvbnNPbkxpbmUubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnNlbGVjdGlvbnNPbkxpbmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICghdGhpcy5zZWxlY3Rpb25zT25MaW5lW2ldLmVxdWFscyhvdGhlclNlbGVjdGlvbnNbaV0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IFJlbmRlckxpbmVJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMgPT09IG90aGVyLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnNcblx0XHRcdCYmIHRoaXMuY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93ID09PSBvdGhlci5jYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3dcblx0XHRcdCYmIHRoaXMubGluZUNvbnRlbnQgPT09IG90aGVyLmxpbmVDb250ZW50XG5cdFx0XHQmJiB0aGlzLmNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZSA9PT0gb3RoZXIuY29udGludWVzV2l0aFdyYXBwZWRMaW5lXG5cdFx0XHQmJiB0aGlzLmlzQmFzaWNBU0NJSSA9PT0gb3RoZXIuaXNCYXNpY0FTQ0lJXG5cdFx0XHQmJiB0aGlzLmNvbnRhaW5zUlRMID09PSBvdGhlci5jb250YWluc1JUTFxuXHRcdFx0JiYgdGhpcy5mYXV4SW5kZW50TGVuZ3RoID09PSBvdGhlci5mYXV4SW5kZW50TGVuZ3RoXG5cdFx0XHQmJiB0aGlzLnRhYlNpemUgPT09IG90aGVyLnRhYlNpemVcblx0XHRcdCYmIHRoaXMuc3RhcnRWaXNpYmxlQ29sdW1uID09PSBvdGhlci5zdGFydFZpc2libGVDb2x1bW5cblx0XHRcdCYmIHRoaXMuc3BhY2VXaWR0aCA9PT0gb3RoZXIuc3BhY2VXaWR0aFxuXHRcdFx0JiYgdGhpcy5yZW5kZXJTcGFjZVdpZHRoID09PSBvdGhlci5yZW5kZXJTcGFjZVdpZHRoXG5cdFx0XHQmJiB0aGlzLnJlbmRlclNwYWNlQ2hhckNvZGUgPT09IG90aGVyLnJlbmRlclNwYWNlQ2hhckNvZGVcblx0XHRcdCYmIHRoaXMuc3RvcFJlbmRlcmluZ0xpbmVBZnRlciA9PT0gb3RoZXIuc3RvcFJlbmRlcmluZ0xpbmVBZnRlclxuXHRcdFx0JiYgdGhpcy5yZW5kZXJXaGl0ZXNwYWNlID09PSBvdGhlci5yZW5kZXJXaGl0ZXNwYWNlXG5cdFx0XHQmJiB0aGlzLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzID09PSBvdGhlci5yZW5kZXJDb250cm9sQ2hhcmFjdGVyc1xuXHRcdFx0JiYgdGhpcy5mb250TGlnYXR1cmVzID09PSBvdGhlci5mb250TGlnYXR1cmVzXG5cdFx0XHQmJiBMaW5lRGVjb3JhdGlvbi5lcXVhbHNBcnIodGhpcy5saW5lRGVjb3JhdGlvbnMsIG90aGVyLmxpbmVEZWNvcmF0aW9ucylcblx0XHRcdCYmIHRoaXMubGluZVRva2Vucy5lcXVhbHMob3RoZXIubGluZVRva2Vucylcblx0XHRcdCYmIHRoaXMuc2FtZVNlbGVjdGlvbihvdGhlci5zZWxlY3Rpb25zT25MaW5lKVxuXHRcdFx0JiYgdGhpcy50ZXh0RGlyZWN0aW9uID09PSBvdGhlci50ZXh0RGlyZWN0aW9uXG5cdFx0XHQmJiB0aGlzLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSA9PT0gb3RoZXIudmVydGljYWxTY3JvbGxiYXJTaXplXG5cdFx0XHQmJiB0aGlzLnJlbmRlck5ld0xpbmVXaGVuRW1wdHkgPT09IG90aGVyLnJlbmRlck5ld0xpbmVXaGVuRW1wdHlcblx0XHQpO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gQ2hhcmFjdGVyTWFwcGluZ0NvbnN0YW50cyB7XG5cdFBBUlRfSU5ERVhfTUFTSyA9IDBiMTExMTExMTExMTExMTExMTAwMDAwMDAwMDAwMDAwMDAsXG5cdENIQVJfSU5ERVhfTUFTSyA9IDBiMDAwMDAwMDAwMDAwMDAwMDExMTExMTExMTExMTExMTEsXG5cblx0Q0hBUl9JTkRFWF9PRkZTRVQgPSAwLFxuXHRQQVJUX0lOREVYX09GRlNFVCA9IDE2XG59XG5cbmV4cG9ydCBjbGFzcyBEb21Qb3NpdGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBwYXJ0SW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgY2hhckluZGV4OiBudW1iZXJcblx0KSB7IH1cbn1cblxuLyoqXG4gKiBQcm92aWRlcyBhIGJvdGggZGlyZWN0aW9uIG1hcHBpbmcgYmV0d2VlbiBhIGxpbmUncyBjaGFyYWN0ZXIgYW5kIGl0cyByZW5kZXJlZCBwb3NpdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXJhY3Rlck1hcHBpbmcge1xuXG5cdHByaXZhdGUgc3RhdGljIGdldFBhcnRJbmRleChwYXJ0RGF0YTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKHBhcnREYXRhICYgQ2hhcmFjdGVyTWFwcGluZ0NvbnN0YW50cy5QQVJUX0lOREVYX01BU0spID4+PiBDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzLlBBUlRfSU5ERVhfT0ZGU0VUO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0Q2hhckluZGV4KHBhcnREYXRhOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiAocGFydERhdGEgJiBDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzLkNIQVJfSU5ERVhfTUFTSykgPj4+IENoYXJhY3Rlck1hcHBpbmdDb25zdGFudHMuQ0hBUl9JTkRFWF9PRkZTRVQ7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgbGVuZ3RoOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGE6IFVpbnQzMkFycmF5O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3Jpem9udGFsT2Zmc2V0OiBVaW50MzJBcnJheTtcblxuXHRjb25zdHJ1Y3RvcihsZW5ndGg6IG51bWJlciwgcGFydENvdW50OiBudW1iZXIpIHtcblx0XHR0aGlzLmxlbmd0aCA9IGxlbmd0aDtcblx0XHR0aGlzLl9kYXRhID0gbmV3IFVpbnQzMkFycmF5KHRoaXMubGVuZ3RoKTtcblx0XHR0aGlzLl9ob3Jpem9udGFsT2Zmc2V0ID0gbmV3IFVpbnQzMkFycmF5KHRoaXMubGVuZ3RoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDb2x1bW5JbmZvKGNvbHVtbjogbnVtYmVyLCBwYXJ0SW5kZXg6IG51bWJlciwgY2hhckluZGV4OiBudW1iZXIsIGhvcml6b250YWxPZmZzZXQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHBhcnREYXRhID0gKFxuXHRcdFx0KHBhcnRJbmRleCA8PCBDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzLlBBUlRfSU5ERVhfT0ZGU0VUKVxuXHRcdFx0fCAoY2hhckluZGV4IDw8IENoYXJhY3Rlck1hcHBpbmdDb25zdGFudHMuQ0hBUl9JTkRFWF9PRkZTRVQpXG5cdFx0KSA+Pj4gMDtcblx0XHR0aGlzLl9kYXRhW2NvbHVtbiAtIDFdID0gcGFydERhdGE7XG5cdFx0dGhpcy5faG9yaXpvbnRhbE9mZnNldFtjb2x1bW4gLSAxXSA9IGhvcml6b250YWxPZmZzZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SG9yaXpvbnRhbE9mZnNldChjb2x1bW46IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2hvcml6b250YWxPZmZzZXQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBObyBjaGFyYWN0ZXJzIG9uIHRoaXMgbGluZVxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9ob3Jpem9udGFsT2Zmc2V0W2NvbHVtbiAtIDFdO1xuXHR9XG5cblx0cHJpdmF0ZSBjaGFyT2Zmc2V0VG9QYXJ0RGF0YShjaGFyT2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGlmIChjaGFyT2Zmc2V0IDwgMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RhdGFbMF07XG5cdFx0fVxuXHRcdGlmIChjaGFyT2Zmc2V0ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGF0YVt0aGlzLmxlbmd0aCAtIDFdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGF0YVtjaGFyT2Zmc2V0XTtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Qb3NpdGlvbihjb2x1bW46IG51bWJlcik6IERvbVBvc2l0aW9uIHtcblx0XHRjb25zdCBwYXJ0RGF0YSA9IHRoaXMuY2hhck9mZnNldFRvUGFydERhdGEoY29sdW1uIC0gMSk7XG5cdFx0Y29uc3QgcGFydEluZGV4ID0gQ2hhcmFjdGVyTWFwcGluZy5nZXRQYXJ0SW5kZXgocGFydERhdGEpO1xuXHRcdGNvbnN0IGNoYXJJbmRleCA9IENoYXJhY3Rlck1hcHBpbmcuZ2V0Q2hhckluZGV4KHBhcnREYXRhKTtcblx0XHRyZXR1cm4gbmV3IERvbVBvc2l0aW9uKHBhcnRJbmRleCwgY2hhckluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb2x1bW4oZG9tUG9zaXRpb246IERvbVBvc2l0aW9uLCBwYXJ0TGVuZ3RoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNoYXJPZmZzZXQgPSB0aGlzLnBhcnREYXRhVG9DaGFyT2Zmc2V0KGRvbVBvc2l0aW9uLnBhcnRJbmRleCwgcGFydExlbmd0aCwgZG9tUG9zaXRpb24uY2hhckluZGV4KTtcblx0XHRyZXR1cm4gY2hhck9mZnNldCArIDE7XG5cdH1cblxuXHRwcml2YXRlIHBhcnREYXRhVG9DaGFyT2Zmc2V0KHBhcnRJbmRleDogbnVtYmVyLCBwYXJ0TGVuZ3RoOiBudW1iZXIsIGNoYXJJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlYXJjaEVudHJ5ID0gKFxuXHRcdFx0KHBhcnRJbmRleCA8PCBDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzLlBBUlRfSU5ERVhfT0ZGU0VUKVxuXHRcdFx0fCAoY2hhckluZGV4IDw8IENoYXJhY3Rlck1hcHBpbmdDb25zdGFudHMuQ0hBUl9JTkRFWF9PRkZTRVQpXG5cdFx0KSA+Pj4gMDtcblxuXHRcdGxldCBtaW4gPSAwO1xuXHRcdGxldCBtYXggPSB0aGlzLmxlbmd0aCAtIDE7XG5cdFx0d2hpbGUgKG1pbiArIDEgPCBtYXgpIHtcblx0XHRcdGNvbnN0IG1pZCA9ICgobWluICsgbWF4KSA+Pj4gMSk7XG5cdFx0XHRjb25zdCBtaWRFbnRyeSA9IHRoaXMuX2RhdGFbbWlkXTtcblx0XHRcdGlmIChtaWRFbnRyeSA9PT0gc2VhcmNoRW50cnkpIHtcblx0XHRcdFx0cmV0dXJuIG1pZDtcblx0XHRcdH0gZWxzZSBpZiAobWlkRW50cnkgPiBzZWFyY2hFbnRyeSkge1xuXHRcdFx0XHRtYXggPSBtaWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtaW4gPSBtaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1pbiA9PT0gbWF4KSB7XG5cdFx0XHRyZXR1cm4gbWluO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pbkVudHJ5ID0gdGhpcy5fZGF0YVttaW5dO1xuXHRcdGNvbnN0IG1heEVudHJ5ID0gdGhpcy5fZGF0YVttYXhdO1xuXG5cdFx0aWYgKG1pbkVudHJ5ID09PSBzZWFyY2hFbnRyeSkge1xuXHRcdFx0cmV0dXJuIG1pbjtcblx0XHR9XG5cdFx0aWYgKG1heEVudHJ5ID09PSBzZWFyY2hFbnRyeSkge1xuXHRcdFx0cmV0dXJuIG1heDtcblx0XHR9XG5cblx0XHRjb25zdCBtaW5QYXJ0SW5kZXggPSBDaGFyYWN0ZXJNYXBwaW5nLmdldFBhcnRJbmRleChtaW5FbnRyeSk7XG5cdFx0Y29uc3QgbWluQ2hhckluZGV4ID0gQ2hhcmFjdGVyTWFwcGluZy5nZXRDaGFySW5kZXgobWluRW50cnkpO1xuXG5cdFx0Y29uc3QgbWF4UGFydEluZGV4ID0gQ2hhcmFjdGVyTWFwcGluZy5nZXRQYXJ0SW5kZXgobWF4RW50cnkpO1xuXHRcdGxldCBtYXhDaGFySW5kZXg6IG51bWJlcjtcblxuXHRcdGlmIChtaW5QYXJ0SW5kZXggIT09IG1heFBhcnRJbmRleCkge1xuXHRcdFx0Ly8gc2l0dGluZyBiZXR3ZWVuIHBhcnRzXG5cdFx0XHRtYXhDaGFySW5kZXggPSBwYXJ0TGVuZ3RoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtYXhDaGFySW5kZXggPSBDaGFyYWN0ZXJNYXBwaW5nLmdldENoYXJJbmRleChtYXhFbnRyeSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWluRW50cnlEaXN0YW5jZSA9IGNoYXJJbmRleCAtIG1pbkNoYXJJbmRleDtcblx0XHRjb25zdCBtYXhFbnRyeURpc3RhbmNlID0gbWF4Q2hhckluZGV4IC0gY2hhckluZGV4O1xuXG5cdFx0aWYgKG1pbkVudHJ5RGlzdGFuY2UgPD0gbWF4RW50cnlEaXN0YW5jZSkge1xuXHRcdFx0cmV0dXJuIG1pbjtcblx0XHR9XG5cdFx0cmV0dXJuIG1heDtcblx0fVxuXG5cdHB1YmxpYyBpbmZsYXRlKCkge1xuXHRcdGNvbnN0IHJlc3VsdDogW251bWJlciwgbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhcnREYXRhID0gdGhpcy5fZGF0YVtpXTtcblx0XHRcdGNvbnN0IHBhcnRJbmRleCA9IENoYXJhY3Rlck1hcHBpbmcuZ2V0UGFydEluZGV4KHBhcnREYXRhKTtcblx0XHRcdGNvbnN0IGNoYXJJbmRleCA9IENoYXJhY3Rlck1hcHBpbmcuZ2V0Q2hhckluZGV4KHBhcnREYXRhKTtcblx0XHRcdGNvbnN0IHZpc2libGVDb2x1bW4gPSB0aGlzLl9ob3Jpem9udGFsT2Zmc2V0W2ldO1xuXHRcdFx0cmVzdWx0LnB1c2goW3BhcnRJbmRleCwgY2hhckluZGV4LCB2aXNpYmxlQ29sdW1uXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRm9yZWlnbkVsZW1lbnRUeXBlIHtcblx0Tm9uZSA9IDAsXG5cdEJlZm9yZSA9IDEsXG5cdEFmdGVyID0gMlxufVxuXG5leHBvcnQgY2xhc3MgUmVuZGVyTGluZU91dHB1dCB7XG5cdF9yZW5kZXJMaW5lT3V0cHV0QnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZztcblx0cmVhZG9ubHkgY29udGFpbnNGb3JlaWduRWxlbWVudHM6IEZvcmVpZ25FbGVtZW50VHlwZTtcblxuXHRjb25zdHJ1Y3RvcihjaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nLCBjb250YWluc0ZvcmVpZ25FbGVtZW50czogRm9yZWlnbkVsZW1lbnRUeXBlKSB7XG5cdFx0dGhpcy5jaGFyYWN0ZXJNYXBwaW5nID0gY2hhcmFjdGVyTWFwcGluZztcblx0XHR0aGlzLmNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzID0gY29udGFpbnNGb3JlaWduRWxlbWVudHM7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclZpZXdMaW5lKGlucHV0OiBSZW5kZXJMaW5lSW5wdXQsIHNiOiBTdHJpbmdCdWlsZGVyKTogUmVuZGVyTGluZU91dHB1dCB7XG5cdGlmIChpbnB1dC5saW5lQ29udGVudC5sZW5ndGggPT09IDApIHtcblxuXHRcdGlmIChpbnB1dC5saW5lRGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gVGhpcyBsaW5lIGlzIGVtcHR5LCBidXQgaXQgY29udGFpbnMgaW5saW5lIGRlY29yYXRpb25zXG5cdFx0XHRzYi5hcHBlbmRTdHJpbmcoYDxzcGFuPmApO1xuXG5cdFx0XHRsZXQgYmVmb3JlQ291bnQgPSAwO1xuXHRcdFx0bGV0IGFmdGVyQ291bnQgPSAwO1xuXHRcdFx0bGV0IGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzID0gRm9yZWlnbkVsZW1lbnRUeXBlLk5vbmU7XG5cdFx0XHRmb3IgKGNvbnN0IGxpbmVEZWNvcmF0aW9uIG9mIGlucHV0LmxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRpZiAobGluZURlY29yYXRpb24udHlwZSA9PT0gSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlIHx8IGxpbmVEZWNvcmF0aW9uLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSB7XG5cdFx0XHRcdFx0c2IuYXBwZW5kU3RyaW5nKGA8c3BhbiBjbGFzcz1cImApO1xuXHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZyhsaW5lRGVjb3JhdGlvbi5jbGFzc05hbWUpO1xuXHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZyhgXCI+PC9zcGFuPmApO1xuXG5cdFx0XHRcdFx0aWYgKGxpbmVEZWNvcmF0aW9uLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSkge1xuXHRcdFx0XHRcdFx0Y29udGFpbnNGb3JlaWduRWxlbWVudHMgfD0gRm9yZWlnbkVsZW1lbnRUeXBlLkJlZm9yZTtcblx0XHRcdFx0XHRcdGJlZm9yZUNvdW50Kys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChsaW5lRGVjb3JhdGlvbi50eXBlID09PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlcikge1xuXHRcdFx0XHRcdFx0Y29udGFpbnNGb3JlaWduRWxlbWVudHMgfD0gRm9yZWlnbkVsZW1lbnRUeXBlLkFmdGVyO1xuXHRcdFx0XHRcdFx0YWZ0ZXJDb3VudCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzYi5hcHBlbmRTdHJpbmcoYDwvc3Bhbj5gKTtcblxuXHRcdFx0Y29uc3QgY2hhcmFjdGVyTWFwcGluZyA9IG5ldyBDaGFyYWN0ZXJNYXBwaW5nKDEsIGJlZm9yZUNvdW50ICsgYWZ0ZXJDb3VudCk7XG5cdFx0XHRjaGFyYWN0ZXJNYXBwaW5nLnNldENvbHVtbkluZm8oMSwgYmVmb3JlQ291bnQsIDAsIDApO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFJlbmRlckxpbmVPdXRwdXQoXG5cdFx0XHRcdGNoYXJhY3Rlck1hcHBpbmcsXG5cdFx0XHRcdGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIGNvbXBsZXRlbHkgZW1wdHkgbGluZVxuXHRcdGlmIChpbnB1dC5yZW5kZXJOZXdMaW5lV2hlbkVtcHR5KSB7XG5cdFx0XHRzYi5hcHBlbmRTdHJpbmcoJzxzcGFuPjxzcGFuPlxcbjwvc3Bhbj48L3NwYW4+Jyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNiLmFwcGVuZFN0cmluZygnPHNwYW4+PHNwYW4+PC9zcGFuPjwvc3Bhbj4nKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSZW5kZXJMaW5lT3V0cHV0KFxuXHRcdFx0bmV3IENoYXJhY3Rlck1hcHBpbmcoMCwgMCksXG5cdFx0XHRGb3JlaWduRWxlbWVudFR5cGUuTm9uZVxuXHRcdCk7XG5cdH1cblxuXHRyZXR1cm4gX3JlbmRlckxpbmUocmVzb2x2ZVJlbmRlckxpbmVJbnB1dChpbnB1dCksIHNiKTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlbmRlckxpbmVPdXRwdXQyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGh0bWw6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29udGFpbnNGb3JlaWduRWxlbWVudHM6IEZvcmVpZ25FbGVtZW50VHlwZVxuXHQpIHtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyVmlld0xpbmUyKGlucHV0OiBSZW5kZXJMaW5lSW5wdXQpOiBSZW5kZXJMaW5lT3V0cHV0MiB7XG5cdGNvbnN0IHNiID0gbmV3IFN0cmluZ0J1aWxkZXIoMTAwMDApO1xuXHRjb25zdCBvdXQgPSByZW5kZXJWaWV3TGluZShpbnB1dCwgc2IpO1xuXHRyZXR1cm4gbmV3IFJlbmRlckxpbmVPdXRwdXQyKG91dC5jaGFyYWN0ZXJNYXBwaW5nLCBzYi5idWlsZCgpLCBvdXQuY29udGFpbnNGb3JlaWduRWxlbWVudHMpO1xufVxuXG5jbGFzcyBSZXNvbHZlZFJlbmRlckxpbmVJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBmb250SXNNb25vc3BhY2U6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGluZUNvbnRlbnQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGVuOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGlzT3ZlcmZsb3dpbmc6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IG92ZXJmbG93aW5nQ2hhckNvdW50OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHBhcnRzOiBMaW5lUGFydFtdLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250YWluc0ZvcmVpZ25FbGVtZW50czogRm9yZWlnbkVsZW1lbnRUeXBlLFxuXHRcdHB1YmxpYyByZWFkb25seSBmYXV4SW5kZW50TGVuZ3RoOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRhYlNpemU6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRWaXNpYmxlQ29sdW1uOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNwYWNlV2lkdGg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyU3BhY2VDaGFyQ29kZTogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSByZW5kZXJXaGl0ZXNwYWNlOiBSZW5kZXJXaGl0ZXNwYWNlLFxuXHRcdHB1YmxpYyByZWFkb25seSByZW5kZXJDb250cm9sQ2hhcmFjdGVyczogYm9vbGVhbixcblx0KSB7XG5cdFx0Ly9cblx0fVxufVxuXG5mdW5jdGlvbiByZXNvbHZlUmVuZGVyTGluZUlucHV0KGlucHV0OiBSZW5kZXJMaW5lSW5wdXQpOiBSZXNvbHZlZFJlbmRlckxpbmVJbnB1dCB7XG5cdGNvbnN0IGxpbmVDb250ZW50ID0gaW5wdXQubGluZUNvbnRlbnQ7XG5cblx0bGV0IGlzT3ZlcmZsb3dpbmc6IGJvb2xlYW47XG5cdGxldCBvdmVyZmxvd2luZ0NoYXJDb3VudDogbnVtYmVyO1xuXHRsZXQgbGVuOiBudW1iZXI7XG5cblx0aWYgKGlucHV0LnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgIT09IC0xICYmIGlucHV0LnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgPCBsaW5lQ29udGVudC5sZW5ndGgpIHtcblx0XHRpc092ZXJmbG93aW5nID0gdHJ1ZTtcblx0XHRvdmVyZmxvd2luZ0NoYXJDb3VudCA9IGxpbmVDb250ZW50Lmxlbmd0aCAtIGlucHV0LnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI7XG5cdFx0bGVuID0gaW5wdXQuc3RvcFJlbmRlcmluZ0xpbmVBZnRlcjtcblx0fSBlbHNlIHtcblx0XHRpc092ZXJmbG93aW5nID0gZmFsc2U7XG5cdFx0b3ZlcmZsb3dpbmdDaGFyQ291bnQgPSAwO1xuXHRcdGxlbiA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblx0fVxuXG5cdGxldCB0b2tlbnMgPSB0cmFuc2Zvcm1BbmRSZW1vdmVPdmVyZmxvd2luZyhsaW5lQ29udGVudCwgaW5wdXQuY29udGFpbnNSVEwsIGlucHV0LmxpbmVUb2tlbnMsIGlucHV0LmZhdXhJbmRlbnRMZW5ndGgsIGxlbik7XG5cdGlmIChpbnB1dC5yZW5kZXJDb250cm9sQ2hhcmFjdGVycyAmJiAhaW5wdXQuaXNCYXNpY0FTQ0lJKSB7XG5cdFx0Ly8gQ2FsbGluZyBgZXh0cmFjdENvbnRyb2xDaGFyYWN0ZXJzYCBiZWZvcmUgYWRkaW5nIChwb3NzaWJseSBlbXB0eSkgbGluZSBwYXJ0c1xuXHRcdC8vIGZvciBpbmxpbmUgZGVjb3JhdGlvbnMuIGBleHRyYWN0Q29udHJvbENoYXJhY3RlcnNgIHJlbW92ZXMgZW1wdHkgbGluZSBwYXJ0cy5cblx0XHR0b2tlbnMgPSBleHRyYWN0Q29udHJvbENoYXJhY3RlcnMobGluZUNvbnRlbnQsIHRva2Vucyk7XG5cdH1cblx0aWYgKGlucHV0LnJlbmRlcldoaXRlc3BhY2UgPT09IFJlbmRlcldoaXRlc3BhY2UuQWxsIHx8XG5cdFx0aW5wdXQucmVuZGVyV2hpdGVzcGFjZSA9PT0gUmVuZGVyV2hpdGVzcGFjZS5Cb3VuZGFyeSB8fFxuXHRcdChpbnB1dC5yZW5kZXJXaGl0ZXNwYWNlID09PSBSZW5kZXJXaGl0ZXNwYWNlLlNlbGVjdGlvbiAmJiAhIWlucHV0LnNlbGVjdGlvbnNPbkxpbmUpIHx8XG5cdFx0KGlucHV0LnJlbmRlcldoaXRlc3BhY2UgPT09IFJlbmRlcldoaXRlc3BhY2UuVHJhaWxpbmcgJiYgIWlucHV0LmNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZSlcblx0KSB7XG5cdFx0dG9rZW5zID0gX2FwcGx5UmVuZGVyV2hpdGVzcGFjZShpbnB1dCwgbGluZUNvbnRlbnQsIGxlbiwgdG9rZW5zKTtcblx0fVxuXHRsZXQgY29udGFpbnNGb3JlaWduRWxlbWVudHMgPSBGb3JlaWduRWxlbWVudFR5cGUuTm9uZTtcblx0aWYgKGlucHV0LmxpbmVEZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGlucHV0LmxpbmVEZWNvcmF0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZURlY29yYXRpb24gPSBpbnB1dC5saW5lRGVjb3JhdGlvbnNbaV07XG5cdFx0XHRpZiAobGluZURlY29yYXRpb24udHlwZSA9PT0gSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhckFmZmVjdGluZ0xldHRlclNwYWNpbmcpIHtcblx0XHRcdFx0Ly8gUHJldGVuZCB0aGVyZSBhcmUgZm9yZWlnbiBlbGVtZW50cy4uLiBhbHRob3VnaCBub3QgMTAwJSBhY2N1cmF0ZS5cblx0XHRcdFx0Y29udGFpbnNGb3JlaWduRWxlbWVudHMgfD0gRm9yZWlnbkVsZW1lbnRUeXBlLkJlZm9yZTtcblx0XHRcdH0gZWxzZSBpZiAobGluZURlY29yYXRpb24udHlwZSA9PT0gSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKSB7XG5cdFx0XHRcdGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzIHw9IEZvcmVpZ25FbGVtZW50VHlwZS5CZWZvcmU7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVEZWNvcmF0aW9uLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSB7XG5cdFx0XHRcdGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzIHw9IEZvcmVpZ25FbGVtZW50VHlwZS5BZnRlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0dG9rZW5zID0gX2FwcGx5SW5saW5lRGVjb3JhdGlvbnMobGluZUNvbnRlbnQsIGxlbiwgdG9rZW5zLCBpbnB1dC5saW5lRGVjb3JhdGlvbnMpO1xuXHR9XG5cdGlmICghaW5wdXQuY29udGFpbnNSVEwpIHtcblx0XHQvLyBXZSBjYW4gbmV2ZXIgc3BsaXQgUlRMIHRleHQsIGFzIGl0IHJ1aW5zIHRoZSByZW5kZXJpbmdcblx0XHR0b2tlbnMgPSBzcGxpdExhcmdlVG9rZW5zKGxpbmVDb250ZW50LCB0b2tlbnMsICFpbnB1dC5pc0Jhc2ljQVNDSUkgfHwgaW5wdXQuZm9udExpZ2F0dXJlcyk7XG5cdH0gZWxzZSB7XG5cdFx0Ly8gU3BsaXQgdGhlIGZpcnN0IHRva2VuIGlmIGl0IGNvbnRhaW5zIGJvdGggbGVhZGluZyB3aGl0ZXNwYWNlIGFuZCBSVEwgdGV4dFxuXHRcdHRva2VucyA9IHNwbGl0TGVhZGluZ1doaXRlc3BhY2VGcm9tUlRMKGxpbmVDb250ZW50LCB0b2tlbnMpO1xuXHR9XG5cblx0cmV0dXJuIG5ldyBSZXNvbHZlZFJlbmRlckxpbmVJbnB1dChcblx0XHRpbnB1dC51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zLFxuXHRcdGlucHV0LmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyxcblx0XHRsaW5lQ29udGVudCxcblx0XHRsZW4sXG5cdFx0aXNPdmVyZmxvd2luZyxcblx0XHRvdmVyZmxvd2luZ0NoYXJDb3VudCxcblx0XHR0b2tlbnMsXG5cdFx0Y29udGFpbnNGb3JlaWduRWxlbWVudHMsXG5cdFx0aW5wdXQuZmF1eEluZGVudExlbmd0aCxcblx0XHRpbnB1dC50YWJTaXplLFxuXHRcdGlucHV0LnN0YXJ0VmlzaWJsZUNvbHVtbixcblx0XHRpbnB1dC5zcGFjZVdpZHRoLFxuXHRcdGlucHV0LnJlbmRlclNwYWNlQ2hhckNvZGUsXG5cdFx0aW5wdXQucmVuZGVyV2hpdGVzcGFjZSxcblx0XHRpbnB1dC5yZW5kZXJDb250cm9sQ2hhcmFjdGVyc1xuXHQpO1xufVxuXG4vKipcbiAqIEluIHRoZSByZW5kZXJpbmcgcGhhc2UsIGNoYXJhY3RlcnMgYXJlIGFsd2F5cyBsb29wZWQgdW50aWwgdG9rZW4uZW5kSW5kZXguXG4gKiBFbnN1cmUgdGhhdCBhbGwgdG9rZW5zIGVuZCBiZWZvcmUgYGxlbmAgYW5kIHRoZSBsYXN0IG9uZSBlbmRzIHByZWNpc2VseSBhdCBgbGVuYC5cbiAqL1xuZnVuY3Rpb24gdHJhbnNmb3JtQW5kUmVtb3ZlT3ZlcmZsb3dpbmcobGluZUNvbnRlbnQ6IHN0cmluZywgbGluZUNvbnRhaW5zUlRMOiBib29sZWFuLCB0b2tlbnM6IElWaWV3TGluZVRva2VucywgZmF1eEluZGVudExlbmd0aDogbnVtYmVyLCBsZW46IG51bWJlcik6IExpbmVQYXJ0W10ge1xuXHRjb25zdCByZXN1bHQ6IExpbmVQYXJ0W10gPSBbXTtcblx0bGV0IHJlc3VsdExlbiA9IDA7XG5cblx0Ly8gVGhlIGZhdXggaW5kZW50IHBhcnQgb2YgdGhlIGxpbmUgc2hvdWxkIGhhdmUgbm8gdG9rZW4gdHlwZVxuXHRpZiAoZmF1eEluZGVudExlbmd0aCA+IDApIHtcblx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGZhdXhJbmRlbnRMZW5ndGgsICcnLCAwLCBmYWxzZSk7XG5cdH1cblx0bGV0IHN0YXJ0T2Zmc2V0ID0gZmF1eEluZGVudExlbmd0aDtcblx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDAsIHRva2Vuc0xlbiA9IHRva2Vucy5nZXRDb3VudCgpOyB0b2tlbkluZGV4IDwgdG9rZW5zTGVuOyB0b2tlbkluZGV4KyspIHtcblx0XHRjb25zdCBlbmRJbmRleCA9IHRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0aWYgKGVuZEluZGV4IDw9IGZhdXhJbmRlbnRMZW5ndGgpIHtcblx0XHRcdC8vIFRoZSBmYXV4IGluZGVudCBwYXJ0IG9mIHRoZSBsaW5lIHNob3VsZCBoYXZlIG5vIHRva2VuIHR5cGVcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCB0eXBlID0gdG9rZW5zLmdldENsYXNzTmFtZSh0b2tlbkluZGV4KTtcblx0XHRpZiAoZW5kSW5kZXggPj0gbGVuKSB7XG5cdFx0XHRjb25zdCB0b2tlbkNvbnRhaW5zUlRMID0gKGxpbmVDb250YWluc1JUTCA/IHN0cmluZ3MuY29udGFpbnNSVEwobGluZUNvbnRlbnQuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBsZW4pKSA6IGZhbHNlKTtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQobGVuLCB0eXBlLCAwLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbkNvbnRhaW5zUlRMID0gKGxpbmVDb250YWluc1JUTCA/IHN0cmluZ3MuY29udGFpbnNSVEwobGluZUNvbnRlbnQuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBlbmRJbmRleCkpIDogZmFsc2UpO1xuXHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQoZW5kSW5kZXgsIHR5cGUsIDAsIHRva2VuQ29udGFpbnNSVEwpO1xuXHRcdHN0YXJ0T2Zmc2V0ID0gZW5kSW5kZXg7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIHdyaXR0ZW4gYXMgYSBjb25zdCBlbnVtIHRvIGdldCB2YWx1ZSBpbmxpbmluZy5cbiAqL1xuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHRMb25nVG9rZW4gPSA1MFxufVxuXG4vKipcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNjg4NS5cbiAqIEl0IGFwcGVhcnMgdGhhdCBoYXZpbmcgdmVyeSBsYXJnZSBzcGFucyBjYXVzZXMgdmVyeSBzbG93IHJlYWRpbmcgb2YgY2hhcmFjdGVyIHBvc2l0aW9ucy5cbiAqIFNvIGhlcmUgd2UgdHJ5IHRvIGF2b2lkIHRoYXQuXG4gKi9cbmZ1bmN0aW9uIHNwbGl0TGFyZ2VUb2tlbnMobGluZUNvbnRlbnQ6IHN0cmluZywgdG9rZW5zOiBMaW5lUGFydFtdLCBvbmx5QXRTcGFjZXM6IGJvb2xlYW4pOiBMaW5lUGFydFtdIHtcblx0bGV0IGxhc3RUb2tlbkVuZEluZGV4ID0gMDtcblx0Y29uc3QgcmVzdWx0OiBMaW5lUGFydFtdID0gW107XG5cdGxldCByZXN1bHRMZW4gPSAwO1xuXG5cdGlmIChvbmx5QXRTcGFjZXMpIHtcblx0XHQvLyBTcGxpdCBvbmx5IGF0IHNwYWNlcyA9PiB3ZSBuZWVkIHRvIHdhbGsgZWFjaCBjaGFyYWN0ZXJcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdG9rZW5zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRva2Vuc1tpXTtcblx0XHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSB0b2tlbi5lbmRJbmRleDtcblx0XHRcdGlmIChsYXN0VG9rZW5FbmRJbmRleCArIENvbnN0YW50cy5Mb25nVG9rZW4gPCB0b2tlbkVuZEluZGV4KSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuVHlwZSA9IHRva2VuLnR5cGU7XG5cdFx0XHRcdGNvbnN0IHRva2VuTWV0YWRhdGEgPSB0b2tlbi5tZXRhZGF0YTtcblx0XHRcdFx0Y29uc3QgdG9rZW5Db250YWluc1JUTCA9IHRva2VuLmNvbnRhaW5zUlRMO1xuXG5cdFx0XHRcdGxldCBsYXN0U3BhY2VPZmZzZXQgPSAtMTtcblx0XHRcdFx0bGV0IGN1cnJUb2tlblN0YXJ0ID0gbGFzdFRva2VuRW5kSW5kZXg7XG5cdFx0XHRcdGZvciAobGV0IGogPSBsYXN0VG9rZW5FbmRJbmRleDsgaiA8IHRva2VuRW5kSW5kZXg7IGorKykge1xuXHRcdFx0XHRcdGlmIChsaW5lQ29udGVudC5jaGFyQ29kZUF0KGopID09PSBDaGFyQ29kZS5TcGFjZSkge1xuXHRcdFx0XHRcdFx0bGFzdFNwYWNlT2Zmc2V0ID0gajtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGxhc3RTcGFjZU9mZnNldCAhPT0gLTEgJiYgaiAtIGN1cnJUb2tlblN0YXJ0ID49IENvbnN0YW50cy5Mb25nVG9rZW4pIHtcblx0XHRcdFx0XHRcdC8vIFNwbGl0IGF0IGBsYXN0U3BhY2VPZmZzZXRgICsgMVxuXHRcdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChsYXN0U3BhY2VPZmZzZXQgKyAxLCB0b2tlblR5cGUsIHRva2VuTWV0YWRhdGEsIHRva2VuQ29udGFpbnNSVEwpO1xuXHRcdFx0XHRcdFx0Y3VyclRva2VuU3RhcnQgPSBsYXN0U3BhY2VPZmZzZXQgKyAxO1xuXHRcdFx0XHRcdFx0bGFzdFNwYWNlT2Zmc2V0ID0gLTE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjdXJyVG9rZW5TdGFydCAhPT0gdG9rZW5FbmRJbmRleCkge1xuXHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQodG9rZW5FbmRJbmRleCwgdG9rZW5UeXBlLCB0b2tlbk1ldGFkYXRhLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IHRva2VuO1xuXHRcdFx0fVxuXG5cdFx0XHRsYXN0VG9rZW5FbmRJbmRleCA9IHRva2VuRW5kSW5kZXg7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIFNwbGl0IGFueXdoZXJlID0+IHdlIGRvbid0IG5lZWQgdG8gd2FsayBlYWNoIGNoYXJhY3RlclxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0b2tlbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHRva2VuID0gdG9rZW5zW2ldO1xuXHRcdFx0Y29uc3QgdG9rZW5FbmRJbmRleCA9IHRva2VuLmVuZEluZGV4O1xuXHRcdFx0Y29uc3QgZGlmZiA9ICh0b2tlbkVuZEluZGV4IC0gbGFzdFRva2VuRW5kSW5kZXgpO1xuXHRcdFx0aWYgKGRpZmYgPiBDb25zdGFudHMuTG9uZ1Rva2VuKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuVHlwZSA9IHRva2VuLnR5cGU7XG5cdFx0XHRcdGNvbnN0IHRva2VuTWV0YWRhdGEgPSB0b2tlbi5tZXRhZGF0YTtcblx0XHRcdFx0Y29uc3QgdG9rZW5Db250YWluc1JUTCA9IHRva2VuLmNvbnRhaW5zUlRMO1xuXHRcdFx0XHRjb25zdCBwaWVjZXNDb3VudCA9IE1hdGguY2VpbChkaWZmIC8gQ29uc3RhbnRzLkxvbmdUb2tlbik7XG5cdFx0XHRcdGZvciAobGV0IGogPSAxOyBqIDwgcGllY2VzQ291bnQ7IGorKykge1xuXHRcdFx0XHRcdGNvbnN0IHBpZWNlRW5kSW5kZXggPSBsYXN0VG9rZW5FbmRJbmRleCArIChqICogQ29uc3RhbnRzLkxvbmdUb2tlbik7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChwaWVjZUVuZEluZGV4LCB0b2tlblR5cGUsIHRva2VuTWV0YWRhdGEsIHRva2VuQ29udGFpbnNSVEwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQodG9rZW5FbmRJbmRleCwgdG9rZW5UeXBlLCB0b2tlbk1ldGFkYXRhLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSB0b2tlbjtcblx0XHRcdH1cblx0XHRcdGxhc3RUb2tlbkVuZEluZGV4ID0gdG9rZW5FbmRJbmRleDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFNwbGl0cyBsZWFkaW5nIHdoaXRlc3BhY2UgZnJvbSB0aGUgZmlyc3QgdG9rZW4gaWYgaXQgY29udGFpbnMgUlRMIHRleHQuXG4gKi9cbmZ1bmN0aW9uIHNwbGl0TGVhZGluZ1doaXRlc3BhY2VGcm9tUlRMKGxpbmVDb250ZW50OiBzdHJpbmcsIHRva2VuczogTGluZVBhcnRbXSk6IExpbmVQYXJ0W10ge1xuXHRpZiAodG9rZW5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB0b2tlbnM7XG5cdH1cblxuXHRjb25zdCBmaXJzdFRva2VuID0gdG9rZW5zWzBdO1xuXHRpZiAoIWZpcnN0VG9rZW4uY29udGFpbnNSVEwpIHtcblx0XHRyZXR1cm4gdG9rZW5zO1xuXHR9XG5cblx0Ly8gQ2hlY2sgaWYgdGhlIGZpcnN0IHRva2VuIHN0YXJ0cyB3aXRoIHdoaXRlc3BhY2Vcblx0Y29uc3QgZmlyc3RUb2tlbkVuZEluZGV4ID0gZmlyc3RUb2tlbi5lbmRJbmRleDtcblx0bGV0IGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gMDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaXJzdFRva2VuRW5kSW5kZXg7IGkrKykge1xuXHRcdGNvbnN0IGNoYXJDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChpKTtcblx0XHRpZiAoY2hhckNvZGUgIT09IENoYXJDb2RlLlNwYWNlICYmIGNoYXJDb2RlICE9PSBDaGFyQ29kZS5UYWIpIHtcblx0XHRcdGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gaTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGlmIChmaXJzdE5vbldoaXRlc3BhY2VJbmRleCA9PT0gMCkge1xuXHRcdC8vIE5vIGxlYWRpbmcgd2hpdGVzcGFjZVxuXHRcdHJldHVybiB0b2tlbnM7XG5cdH1cblxuXHQvLyBTcGxpdCB0aGUgZmlyc3QgdG9rZW4gaW50byBsZWFkaW5nIHdoaXRlc3BhY2UgYW5kIHRoZSByZXN0XG5cdGNvbnN0IHJlc3VsdDogTGluZVBhcnRbXSA9IFtdO1xuXHRyZXN1bHQucHVzaChuZXcgTGluZVBhcnQoZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgsIGZpcnN0VG9rZW4udHlwZSwgZmlyc3RUb2tlbi5tZXRhZGF0YSwgZmFsc2UpKTtcblx0cmVzdWx0LnB1c2gobmV3IExpbmVQYXJ0KGZpcnN0VG9rZW5FbmRJbmRleCwgZmlyc3RUb2tlbi50eXBlLCBmaXJzdFRva2VuLm1ldGFkYXRhLCBmaXJzdFRva2VuLmNvbnRhaW5zUlRMKSk7XG5cblx0Ly8gQWRkIHJlbWFpbmluZyB0b2tlbnNcblx0Zm9yIChsZXQgaSA9IDE7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcblx0XHRyZXN1bHQucHVzaCh0b2tlbnNbaV0pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gaXNDb250cm9sQ2hhcmFjdGVyKGNoYXJDb2RlOiBudW1iZXIpOiBib29sZWFuIHtcblx0aWYgKGNoYXJDb2RlIDwgMzIpIHtcblx0XHRyZXR1cm4gKGNoYXJDb2RlICE9PSBDaGFyQ29kZS5UYWIpO1xuXHR9XG5cdGlmIChjaGFyQ29kZSA9PT0gMTI3KSB7XG5cdFx0Ly8gREVMXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAoXG5cdFx0KGNoYXJDb2RlID49IDB4MjAyQSAmJiBjaGFyQ29kZSA8PSAweDIwMkUpXG5cdFx0fHwgKGNoYXJDb2RlID49IDB4MjA2NiAmJiBjaGFyQ29kZSA8PSAweDIwNjkpXG5cdFx0fHwgKGNoYXJDb2RlID49IDB4MjAwRSAmJiBjaGFyQ29kZSA8PSAweDIwMEYpXG5cdFx0fHwgY2hhckNvZGUgPT09IDB4MDYxQ1xuXHQpIHtcblx0XHQvLyBVbmljb2RlIERpcmVjdGlvbmFsIEZvcm1hdHRpbmcgQ2hhcmFjdGVyc1xuXHRcdC8vIExSRVx0VSsyMDJBXHRMRUZULVRPLVJJR0hUIEVNQkVERElOR1xuXHRcdC8vIFJMRVx0VSsyMDJCXHRSSUdIVC1UTy1MRUZUIEVNQkVERElOR1xuXHRcdC8vIFBERlx0VSsyMDJDXHRQT1AgRElSRUNUSU9OQUwgRk9STUFUVElOR1xuXHRcdC8vIExST1x0VSsyMDJEXHRMRUZULVRPLVJJR0hUIE9WRVJSSURFXG5cdFx0Ly8gUkxPXHRVKzIwMkVcdFJJR0hULVRPLUxFRlQgT1ZFUlJJREVcblx0XHQvLyBMUklcdFUrMjA2Nlx0TEVGVC1UTy1SSUdIVCBJU09MQVRFXG5cdFx0Ly8gUkxJXHRVKzIwNjdcdFJJR0hULVRPLUxFRlQgSVNPTEFURVxuXHRcdC8vIEZTSVx0VSsyMDY4XHRGSVJTVCBTVFJPTkcgSVNPTEFURVxuXHRcdC8vIFBESVx0VSsyMDY5XHRQT1AgRElSRUNUSU9OQUwgSVNPTEFURVxuXHRcdC8vIExSTVx0VSsyMDBFXHRMRUZULVRPLVJJR0hUIE1BUktcblx0XHQvLyBSTE1cdFUrMjAwRlx0UklHSFQtVE8tTEVGVCBNQVJLXG5cdFx0Ly8gQUxNXHRVKzA2MUNcdEFSQUJJQyBMRVRURVIgTUFSS1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Q29udHJvbENoYXJhY3RlcnMobGluZUNvbnRlbnQ6IHN0cmluZywgdG9rZW5zOiBMaW5lUGFydFtdKTogTGluZVBhcnRbXSB7XG5cdGNvbnN0IHJlc3VsdDogTGluZVBhcnRbXSA9IFtdO1xuXHRsZXQgbGFzdExpbmVQYXJ0OiBMaW5lUGFydCA9IG5ldyBMaW5lUGFydCgwLCAnJywgMCwgZmFsc2UpO1xuXHRsZXQgY2hhck9mZnNldCA9IDA7XG5cdGZvciAoY29uc3QgdG9rZW4gb2YgdG9rZW5zKSB7XG5cdFx0Y29uc3QgdG9rZW5FbmRJbmRleCA9IHRva2VuLmVuZEluZGV4O1xuXHRcdGZvciAoOyBjaGFyT2Zmc2V0IDwgdG9rZW5FbmRJbmRleDsgY2hhck9mZnNldCsrKSB7XG5cdFx0XHRjb25zdCBjaGFyQ29kZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY2hhck9mZnNldCk7XG5cdFx0XHRpZiAoaXNDb250cm9sQ2hhcmFjdGVyKGNoYXJDb2RlKSkge1xuXHRcdFx0XHRpZiAoY2hhck9mZnNldCA+IGxhc3RMaW5lUGFydC5lbmRJbmRleCkge1xuXHRcdFx0XHRcdC8vIGVtaXQgcHJldmlvdXMgcGFydCBpZiBpdCBoYXMgdGV4dFxuXHRcdFx0XHRcdGxhc3RMaW5lUGFydCA9IG5ldyBMaW5lUGFydChjaGFyT2Zmc2V0LCB0b2tlbi50eXBlLCB0b2tlbi5tZXRhZGF0YSwgdG9rZW4uY29udGFpbnNSVEwpO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGxhc3RMaW5lUGFydCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdExpbmVQYXJ0ID0gbmV3IExpbmVQYXJ0KGNoYXJPZmZzZXQgKyAxLCAnbXRrY29udHJvbCcsIHRva2VuLm1ldGFkYXRhLCBmYWxzZSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGxhc3RMaW5lUGFydCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjaGFyT2Zmc2V0ID4gbGFzdExpbmVQYXJ0LmVuZEluZGV4KSB7XG5cdFx0XHQvLyBlbWl0IHByZXZpb3VzIHBhcnQgaWYgaXQgaGFzIHRleHRcblx0XHRcdGxhc3RMaW5lUGFydCA9IG5ldyBMaW5lUGFydCh0b2tlbkVuZEluZGV4LCB0b2tlbi50eXBlLCB0b2tlbi5tZXRhZGF0YSwgdG9rZW4uY29udGFpbnNSVEwpO1xuXHRcdFx0cmVzdWx0LnB1c2gobGFzdExpbmVQYXJ0KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBXaGl0ZXNwYWNlIGlzIHJlbmRlcmVkIGJ5IFwicmVwbGFjaW5nXCIgdG9rZW5zIHdpdGggYSBzcGVjaWFsLXB1cnBvc2UgYG10a3dgIHR5cGUgdGhhdCBpcyBsYXRlciByZWNvZ25pemVkIGluIHRoZSByZW5kZXJpbmcgcGhhc2UuXG4gKiBNb3Jlb3ZlciwgYSB0b2tlbiBpcyBjcmVhdGVkIGZvciBldmVyeSB2aXN1YWwgaW5kZW50IGJlY2F1c2Ugb24gc29tZSBmb250cyB0aGUgZ2x5cGhzIHVzZWQgZm9yIHJlbmRlcmluZyB3aGl0ZXNwYWNlICgmcmFycjsgb3IgJm1pZGRvdDspIGRvIG5vdCBoYXZlIHRoZSBzYW1lIHdpZHRoIGFzICZuYnNwOy5cbiAqIFRoZSByZW5kZXJpbmcgcGhhc2Ugd2lsbCBnZW5lcmF0ZSBgc3R5bGU9XCJ3aWR0aDouLi5cImAgZm9yIHRoZXNlIHRva2Vucy5cbiAqL1xuZnVuY3Rpb24gX2FwcGx5UmVuZGVyV2hpdGVzcGFjZShpbnB1dDogUmVuZGVyTGluZUlucHV0LCBsaW5lQ29udGVudDogc3RyaW5nLCBsZW46IG51bWJlciwgdG9rZW5zOiBMaW5lUGFydFtdKTogTGluZVBhcnRbXSB7XG5cblx0Y29uc3QgY29udGludWVzV2l0aFdyYXBwZWRMaW5lID0gaW5wdXQuY29udGludWVzV2l0aFdyYXBwZWRMaW5lO1xuXHRjb25zdCBmYXV4SW5kZW50TGVuZ3RoID0gaW5wdXQuZmF1eEluZGVudExlbmd0aDtcblx0Y29uc3QgdGFiU2l6ZSA9IGlucHV0LnRhYlNpemU7XG5cdGNvbnN0IHN0YXJ0VmlzaWJsZUNvbHVtbiA9IGlucHV0LnN0YXJ0VmlzaWJsZUNvbHVtbjtcblx0Y29uc3QgdXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucyA9IGlucHV0LnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM7XG5cdGNvbnN0IHNlbGVjdGlvbnMgPSBpbnB1dC5zZWxlY3Rpb25zT25MaW5lO1xuXHRjb25zdCBvbmx5Qm91bmRhcnkgPSAoaW5wdXQucmVuZGVyV2hpdGVzcGFjZSA9PT0gUmVuZGVyV2hpdGVzcGFjZS5Cb3VuZGFyeSk7XG5cdGNvbnN0IG9ubHlUcmFpbGluZyA9IChpbnB1dC5yZW5kZXJXaGl0ZXNwYWNlID09PSBSZW5kZXJXaGl0ZXNwYWNlLlRyYWlsaW5nKTtcblx0Y29uc3QgZ2VuZXJhdGVMaW5lUGFydEZvckVhY2hXaGl0ZXNwYWNlID0gKGlucHV0LnJlbmRlclNwYWNlV2lkdGggIT09IGlucHV0LnNwYWNlV2lkdGgpO1xuXG5cdGNvbnN0IHJlc3VsdDogTGluZVBhcnRbXSA9IFtdO1xuXHRsZXQgcmVzdWx0TGVuID0gMDtcblx0bGV0IHRva2VuSW5kZXggPSAwO1xuXHRsZXQgdG9rZW5UeXBlID0gdG9rZW5zW3Rva2VuSW5kZXhdLnR5cGU7XG5cdGxldCB0b2tlbkNvbnRhaW5zUlRMID0gdG9rZW5zW3Rva2VuSW5kZXhdLmNvbnRhaW5zUlRMO1xuXHRsZXQgdG9rZW5FbmRJbmRleCA9IHRva2Vuc1t0b2tlbkluZGV4XS5lbmRJbmRleDtcblx0Y29uc3QgdG9rZW5zTGVuZ3RoID0gdG9rZW5zLmxlbmd0aDtcblxuXHRsZXQgbGluZUlzRW1wdHlPcldoaXRlc3BhY2UgPSBmYWxzZTtcblx0bGV0IGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lQ29udGVudCk7XG5cdGxldCBsYXN0Tm9uV2hpdGVzcGFjZUluZGV4OiBudW1iZXI7XG5cdGlmIChmaXJzdE5vbldoaXRlc3BhY2VJbmRleCA9PT0gLTEpIHtcblx0XHRsaW5lSXNFbXB0eU9yV2hpdGVzcGFjZSA9IHRydWU7XG5cdFx0Zmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggPSBsZW47XG5cdFx0bGFzdE5vbldoaXRlc3BhY2VJbmRleCA9IGxlbjtcblx0fSBlbHNlIHtcblx0XHRsYXN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVDb250ZW50KTtcblx0fVxuXG5cdGxldCB3YXNJbldoaXRlc3BhY2UgPSBmYWxzZTtcblx0bGV0IGN1cnJlbnRTZWxlY3Rpb25JbmRleCA9IDA7XG5cdGxldCBjdXJyZW50U2VsZWN0aW9uID0gc2VsZWN0aW9ucyAmJiBzZWxlY3Rpb25zW2N1cnJlbnRTZWxlY3Rpb25JbmRleF07XG5cdGxldCB0bXBJbmRlbnQgPSBzdGFydFZpc2libGVDb2x1bW4gJSB0YWJTaXplO1xuXHRmb3IgKGxldCBjaGFySW5kZXggPSBmYXV4SW5kZW50TGVuZ3RoOyBjaGFySW5kZXggPCBsZW47IGNoYXJJbmRleCsrKSB7XG5cdFx0Y29uc3QgY2hDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaGFySW5kZXgpO1xuXG5cdFx0aWYgKGN1cnJlbnRTZWxlY3Rpb24gJiYgY3VycmVudFNlbGVjdGlvbi5lbmRFeGNsdXNpdmUgPD0gY2hhckluZGV4KSB7XG5cdFx0XHRjdXJyZW50U2VsZWN0aW9uSW5kZXgrKztcblx0XHRcdGN1cnJlbnRTZWxlY3Rpb24gPSBzZWxlY3Rpb25zICYmIHNlbGVjdGlvbnNbY3VycmVudFNlbGVjdGlvbkluZGV4XTtcblx0XHR9XG5cblx0XHRsZXQgaXNJbldoaXRlc3BhY2U6IGJvb2xlYW47XG5cdFx0aWYgKGNoYXJJbmRleCA8IGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4IHx8IGNoYXJJbmRleCA+IGxhc3ROb25XaGl0ZXNwYWNlSW5kZXgpIHtcblx0XHRcdC8vIGluIGxlYWRpbmcgb3IgdHJhaWxpbmcgd2hpdGVzcGFjZVxuXHRcdFx0aXNJbldoaXRlc3BhY2UgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoY2hDb2RlID09PSBDaGFyQ29kZS5UYWIpIHtcblx0XHRcdC8vIGEgdGFiIGNoYXJhY3RlciBpcyByZW5kZXJlZCBib3RoIGluIGFsbCBhbmQgYm91bmRhcnkgY2FzZXNcblx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGNoQ29kZSA9PT0gQ2hhckNvZGUuU3BhY2UpIHtcblx0XHRcdC8vIGhpdCBhIHNwYWNlIGNoYXJhY3RlclxuXHRcdFx0aWYgKG9ubHlCb3VuZGFyeSkge1xuXHRcdFx0XHQvLyByZW5kZXJpbmcgb25seSBib3VuZGFyeSB3aGl0ZXNwYWNlXG5cdFx0XHRcdGlmICh3YXNJbldoaXRlc3BhY2UpIHtcblx0XHRcdFx0XHRpc0luV2hpdGVzcGFjZSA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dENoQ29kZSA9IChjaGFySW5kZXggKyAxIDwgbGVuID8gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaGFySW5kZXggKyAxKSA6IENoYXJDb2RlLk51bGwpO1xuXHRcdFx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gKG5leHRDaENvZGUgPT09IENoYXJDb2RlLlNwYWNlIHx8IG5leHRDaENvZGUgPT09IENoYXJDb2RlLlRhYik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aXNJbldoaXRlc3BhY2UgPSBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBJZiByZW5kZXJpbmcgd2hpdGVzcGFjZSBvbiBzZWxlY3Rpb24sIGNoZWNrIHRoYXQgdGhlIGNoYXJJbmRleCBmYWxscyB3aXRoaW4gYSBzZWxlY3Rpb25cblx0XHRpZiAoaXNJbldoaXRlc3BhY2UgJiYgc2VsZWN0aW9ucykge1xuXHRcdFx0aXNJbldoaXRlc3BhY2UgPSAhIWN1cnJlbnRTZWxlY3Rpb24gJiYgY3VycmVudFNlbGVjdGlvbi5zdGFydCA8PSBjaGFySW5kZXggJiYgY2hhckluZGV4IDwgY3VycmVudFNlbGVjdGlvbi5lbmRFeGNsdXNpdmU7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgcmVuZGVyaW5nIG9ubHkgdHJhaWxpbmcgd2hpdGVzcGFjZSwgY2hlY2sgdGhhdCB0aGUgY2hhckluZGV4IHBvaW50cyB0byB0cmFpbGluZyB3aGl0ZXNwYWNlLlxuXHRcdGlmIChpc0luV2hpdGVzcGFjZSAmJiBvbmx5VHJhaWxpbmcpIHtcblx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gbGluZUlzRW1wdHlPcldoaXRlc3BhY2UgfHwgY2hhckluZGV4ID4gbGFzdE5vbldoaXRlc3BhY2VJbmRleDtcblx0XHR9XG5cblx0XHRpZiAoaXNJbldoaXRlc3BhY2UgJiYgdG9rZW5Db250YWluc1JUTCkge1xuXHRcdFx0Ly8gSWYgdGhlIHRva2VuIGNvbnRhaW5zIFJUTCB0ZXh0LCBicmVha2luZyBpdCB1cCBpbnRvIG11bHRpcGxlIGxpbmUgcGFydHNcblx0XHRcdC8vIHRvIHJlbmRlciB3aGl0ZXNwYWNlIG1pZ2h0IGFmZmVjdCB0aGUgYnJvd3NlcidzIGJpZGkgbGF5b3V0LlxuXHRcdFx0Ly9cblx0XHRcdC8vIFdlIHJlbmRlciB3aGl0ZXNwYWNlIGluIHN1Y2ggdG9rZW5zIG9ubHkgaWYgdGhlIHdoaXRlc3BhY2Vcblx0XHRcdC8vIGlzIHRoZSBsZWFkaW5nIG9yIHRoZSB0cmFpbGluZyB3aGl0ZXNwYWNlIG9mIHRoZSBsaW5lLFxuXHRcdFx0Ly8gd2hpY2ggZG9lc24ndCBhZmZlY3QgdGhlIGJyb3dzZXIncyBiaWRpIGxheW91dC5cblx0XHRcdGlmIChjaGFySW5kZXggPj0gZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggJiYgY2hhckluZGV4IDw9IGxhc3ROb25XaGl0ZXNwYWNlSW5kZXgpIHtcblx0XHRcdFx0aXNJbldoaXRlc3BhY2UgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAod2FzSW5XaGl0ZXNwYWNlKSB7XG5cdFx0XHQvLyB3YXMgaW4gd2hpdGVzcGFjZSB0b2tlblxuXHRcdFx0aWYgKCFpc0luV2hpdGVzcGFjZSB8fCAoIXVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMgJiYgdG1wSW5kZW50ID49IHRhYlNpemUpKSB7XG5cdFx0XHRcdC8vIGxlYXZpbmcgd2hpdGVzcGFjZSB0b2tlbiBvciBlbnRlcmluZyBhIG5ldyBpbmRlbnRcblx0XHRcdFx0aWYgKGdlbmVyYXRlTGluZVBhcnRGb3JFYWNoV2hpdGVzcGFjZSkge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RFbmRJbmRleCA9IChyZXN1bHRMZW4gPiAwID8gcmVzdWx0W3Jlc3VsdExlbiAtIDFdLmVuZEluZGV4IDogZmF1eEluZGVudExlbmd0aCk7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IGxhc3RFbmRJbmRleCArIDE7IGkgPD0gY2hhckluZGV4OyBpKyspIHtcblx0XHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQoaSwgJ210a3cnLCBMaW5lUGFydE1ldGFkYXRhLklTX1dISVRFU1BBQ0UsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChjaGFySW5kZXgsICdtdGt3JywgTGluZVBhcnRNZXRhZGF0YS5JU19XSElURVNQQUNFLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG1wSW5kZW50ID0gdG1wSW5kZW50ICUgdGFiU2l6ZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gd2FzIGluIHJlZ3VsYXIgdG9rZW5cblx0XHRcdGlmIChjaGFySW5kZXggPT09IHRva2VuRW5kSW5kZXggfHwgKGlzSW5XaGl0ZXNwYWNlICYmIGNoYXJJbmRleCA+IGZhdXhJbmRlbnRMZW5ndGgpKSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQoY2hhckluZGV4LCB0b2tlblR5cGUsIDAsIHRva2VuQ29udGFpbnNSVEwpO1xuXHRcdFx0XHR0bXBJbmRlbnQgPSB0bXBJbmRlbnQgJSB0YWJTaXplO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjaENvZGUgPT09IENoYXJDb2RlLlRhYikge1xuXHRcdFx0dG1wSW5kZW50ID0gdGFiU2l6ZTtcblx0XHR9IGVsc2UgaWYgKHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoY2hDb2RlKSkge1xuXHRcdFx0dG1wSW5kZW50ICs9IDI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRtcEluZGVudCsrO1xuXHRcdH1cblxuXHRcdHdhc0luV2hpdGVzcGFjZSA9IGlzSW5XaGl0ZXNwYWNlO1xuXG5cdFx0d2hpbGUgKGNoYXJJbmRleCA9PT0gdG9rZW5FbmRJbmRleCkge1xuXHRcdFx0dG9rZW5JbmRleCsrO1xuXHRcdFx0aWYgKHRva2VuSW5kZXggPCB0b2tlbnNMZW5ndGgpIHtcblx0XHRcdFx0dG9rZW5UeXBlID0gdG9rZW5zW3Rva2VuSW5kZXhdLnR5cGU7XG5cdFx0XHRcdHRva2VuQ29udGFpbnNSVEwgPSB0b2tlbnNbdG9rZW5JbmRleF0uY29udGFpbnNSVEw7XG5cdFx0XHRcdHRva2VuRW5kSW5kZXggPSB0b2tlbnNbdG9rZW5JbmRleF0uZW5kSW5kZXg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRsZXQgZ2VuZXJhdGVXaGl0ZXNwYWNlID0gZmFsc2U7XG5cdGlmICh3YXNJbldoaXRlc3BhY2UpIHtcblx0XHQvLyB3YXMgaW4gd2hpdGVzcGFjZSB0b2tlblxuXHRcdGlmIChjb250aW51ZXNXaXRoV3JhcHBlZExpbmUgJiYgb25seUJvdW5kYXJ5KSB7XG5cdFx0XHRjb25zdCBsYXN0Q2hhckNvZGUgPSAobGVuID4gMCA/IGxpbmVDb250ZW50LmNoYXJDb2RlQXQobGVuIC0gMSkgOiBDaGFyQ29kZS5OdWxsKTtcblx0XHRcdGNvbnN0IHByZXZDaGFyQ29kZSA9IChsZW4gPiAxID8gbGluZUNvbnRlbnQuY2hhckNvZGVBdChsZW4gLSAyKSA6IENoYXJDb2RlLk51bGwpO1xuXHRcdFx0Y29uc3QgaXNTaW5nbGVUcmFpbGluZ1NwYWNlID0gKGxhc3RDaGFyQ29kZSA9PT0gQ2hhckNvZGUuU3BhY2UgJiYgKHByZXZDaGFyQ29kZSAhPT0gQ2hhckNvZGUuU3BhY2UgJiYgcHJldkNoYXJDb2RlICE9PSBDaGFyQ29kZS5UYWIpKTtcblx0XHRcdGlmICghaXNTaW5nbGVUcmFpbGluZ1NwYWNlKSB7XG5cdFx0XHRcdGdlbmVyYXRlV2hpdGVzcGFjZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdlbmVyYXRlV2hpdGVzcGFjZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGdlbmVyYXRlV2hpdGVzcGFjZSkge1xuXHRcdGlmIChnZW5lcmF0ZUxpbmVQYXJ0Rm9yRWFjaFdoaXRlc3BhY2UpIHtcblx0XHRcdGNvbnN0IGxhc3RFbmRJbmRleCA9IChyZXN1bHRMZW4gPiAwID8gcmVzdWx0W3Jlc3VsdExlbiAtIDFdLmVuZEluZGV4IDogZmF1eEluZGVudExlbmd0aCk7XG5cdFx0XHRmb3IgKGxldCBpID0gbGFzdEVuZEluZGV4ICsgMTsgaSA8PSBsZW47IGkrKykge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGksICdtdGt3JywgTGluZVBhcnRNZXRhZGF0YS5JU19XSElURVNQQUNFLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQobGVuLCAnbXRrdycsIExpbmVQYXJ0TWV0YWRhdGEuSVNfV0hJVEVTUEFDRSwgZmFsc2UpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGxlbiwgdG9rZW5UeXBlLCAwLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogSW5saW5lIGRlY29yYXRpb25zIGFyZSBcIm1lcmdlZFwiIG9uIHRvcCBvZiB0b2tlbnMuXG4gKiBTcGVjaWFsIGNhcmUgbXVzdCBiZSB0YWtlbiB3aGVuIG11bHRpcGxlIGlubGluZSBkZWNvcmF0aW9ucyBhcmUgYXQgcGxheSBhbmQgdGhleSBvdmVybGFwLlxuICovXG5mdW5jdGlvbiBfYXBwbHlJbmxpbmVEZWNvcmF0aW9ucyhsaW5lQ29udGVudDogc3RyaW5nLCBsZW46IG51bWJlciwgdG9rZW5zOiBMaW5lUGFydFtdLCBfbGluZURlY29yYXRpb25zOiBMaW5lRGVjb3JhdGlvbltdKTogTGluZVBhcnRbXSB7XG5cdF9saW5lRGVjb3JhdGlvbnMuc29ydChMaW5lRGVjb3JhdGlvbi5jb21wYXJlKTtcblx0Y29uc3QgbGluZURlY29yYXRpb25zID0gTGluZURlY29yYXRpb25zTm9ybWFsaXplci5ub3JtYWxpemUobGluZUNvbnRlbnQsIF9saW5lRGVjb3JhdGlvbnMpO1xuXHRjb25zdCBsaW5lRGVjb3JhdGlvbnNMZW4gPSBsaW5lRGVjb3JhdGlvbnMubGVuZ3RoO1xuXG5cdGxldCBsaW5lRGVjb3JhdGlvbkluZGV4ID0gMDtcblx0Y29uc3QgcmVzdWx0OiBMaW5lUGFydFtdID0gW107XG5cdGxldCByZXN1bHRMZW4gPSAwO1xuXHRsZXQgbGFzdFJlc3VsdEVuZEluZGV4ID0gMDtcblx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDAsIGxlbiA9IHRva2Vucy5sZW5ndGg7IHRva2VuSW5kZXggPCBsZW47IHRva2VuSW5kZXgrKykge1xuXHRcdGNvbnN0IHRva2VuID0gdG9rZW5zW3Rva2VuSW5kZXhdO1xuXHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSB0b2tlbi5lbmRJbmRleDtcblx0XHRjb25zdCB0b2tlblR5cGUgPSB0b2tlbi50eXBlO1xuXHRcdGNvbnN0IHRva2VuTWV0YWRhdGEgPSB0b2tlbi5tZXRhZGF0YTtcblx0XHRjb25zdCB0b2tlbkNvbnRhaW5zUlRMID0gdG9rZW4uY29udGFpbnNSVEw7XG5cblx0XHR3aGlsZSAobGluZURlY29yYXRpb25JbmRleCA8IGxpbmVEZWNvcmF0aW9uc0xlbiAmJiBsaW5lRGVjb3JhdGlvbnNbbGluZURlY29yYXRpb25JbmRleF0uc3RhcnRPZmZzZXQgPCB0b2tlbkVuZEluZGV4KSB7XG5cdFx0XHRjb25zdCBsaW5lRGVjb3JhdGlvbiA9IGxpbmVEZWNvcmF0aW9uc1tsaW5lRGVjb3JhdGlvbkluZGV4XTtcblxuXHRcdFx0aWYgKGxpbmVEZWNvcmF0aW9uLnN0YXJ0T2Zmc2V0ID4gbGFzdFJlc3VsdEVuZEluZGV4KSB7XG5cdFx0XHRcdGxhc3RSZXN1bHRFbmRJbmRleCA9IGxpbmVEZWNvcmF0aW9uLnN0YXJ0T2Zmc2V0O1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGxhc3RSZXN1bHRFbmRJbmRleCwgdG9rZW5UeXBlLCB0b2tlbk1ldGFkYXRhLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGxpbmVEZWNvcmF0aW9uLmVuZE9mZnNldCArIDEgPD0gdG9rZW5FbmRJbmRleCkge1xuXHRcdFx0XHQvLyBUaGlzIGxpbmUgZGVjb3JhdGlvbiBlbmRzIGJlZm9yZSB0aGlzIHRva2VuIGVuZHNcblx0XHRcdFx0bGFzdFJlc3VsdEVuZEluZGV4ID0gbGluZURlY29yYXRpb24uZW5kT2Zmc2V0ICsgMTtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChsYXN0UmVzdWx0RW5kSW5kZXgsIHRva2VuVHlwZSArICcgJyArIGxpbmVEZWNvcmF0aW9uLmNsYXNzTmFtZSwgdG9rZW5NZXRhZGF0YSB8IGxpbmVEZWNvcmF0aW9uLm1ldGFkYXRhLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdFx0bGluZURlY29yYXRpb25JbmRleCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVGhpcyBsaW5lIGRlY29yYXRpb24gY29udGludWVzIG9uIHRvIHRoZSBuZXh0IHRva2VuXG5cdFx0XHRcdGxhc3RSZXN1bHRFbmRJbmRleCA9IHRva2VuRW5kSW5kZXg7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQobGFzdFJlc3VsdEVuZEluZGV4LCB0b2tlblR5cGUgKyAnICcgKyBsaW5lRGVjb3JhdGlvbi5jbGFzc05hbWUsIHRva2VuTWV0YWRhdGEgfCBsaW5lRGVjb3JhdGlvbi5tZXRhZGF0YSwgdG9rZW5Db250YWluc1JUTCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0b2tlbkVuZEluZGV4ID4gbGFzdFJlc3VsdEVuZEluZGV4KSB7XG5cdFx0XHRsYXN0UmVzdWx0RW5kSW5kZXggPSB0b2tlbkVuZEluZGV4O1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChsYXN0UmVzdWx0RW5kSW5kZXgsIHRva2VuVHlwZSwgdG9rZW5NZXRhZGF0YSwgdG9rZW5Db250YWluc1JUTCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgbGFzdFRva2VuRW5kSW5kZXggPSB0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLmVuZEluZGV4O1xuXHRpZiAobGluZURlY29yYXRpb25JbmRleCA8IGxpbmVEZWNvcmF0aW9uc0xlbiAmJiBsaW5lRGVjb3JhdGlvbnNbbGluZURlY29yYXRpb25JbmRleF0uc3RhcnRPZmZzZXQgPT09IGxhc3RUb2tlbkVuZEluZGV4KSB7XG5cdFx0d2hpbGUgKGxpbmVEZWNvcmF0aW9uSW5kZXggPCBsaW5lRGVjb3JhdGlvbnNMZW4gJiYgbGluZURlY29yYXRpb25zW2xpbmVEZWNvcmF0aW9uSW5kZXhdLnN0YXJ0T2Zmc2V0ID09PSBsYXN0VG9rZW5FbmRJbmRleCkge1xuXHRcdFx0Y29uc3QgbGluZURlY29yYXRpb24gPSBsaW5lRGVjb3JhdGlvbnNbbGluZURlY29yYXRpb25JbmRleF07XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGxhc3RSZXN1bHRFbmRJbmRleCwgbGluZURlY29yYXRpb24uY2xhc3NOYW1lLCBsaW5lRGVjb3JhdGlvbi5tZXRhZGF0YSwgZmFsc2UpO1xuXHRcdFx0bGluZURlY29yYXRpb25JbmRleCsrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogVGhpcyBmdW5jdGlvbiBpcyBvbiBwdXJwb3NlIG5vdCBzcGxpdCB1cCBpbnRvIG11bHRpcGxlIGZ1bmN0aW9ucyB0byBhbGxvdyBydW50aW1lIHR5cGUgaW5mZXJlbmNlIChpLmUuIHBlcmZvcm1hbmNlIHJlYXNvbnMpLlxuICogTm90aWNlIGhvdyBhbGwgdGhlIG5lZWRlZCBkYXRhIGlzIGZ1bGx5IHJlc29sdmVkIGFuZCBwYXNzZWQgaW4gKGkuZS4gbm8gb3RoZXIgY2FsbHMpLlxuICovXG5mdW5jdGlvbiBfcmVuZGVyTGluZShpbnB1dDogUmVzb2x2ZWRSZW5kZXJMaW5lSW5wdXQsIHNiOiBTdHJpbmdCdWlsZGVyKTogUmVuZGVyTGluZU91dHB1dCB7XG5cdGNvbnN0IGZvbnRJc01vbm9zcGFjZSA9IGlucHV0LmZvbnRJc01vbm9zcGFjZTtcblx0Y29uc3QgY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93ID0gaW5wdXQuY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93O1xuXHRjb25zdCBjb250YWluc0ZvcmVpZ25FbGVtZW50cyA9IGlucHV0LmNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzO1xuXHRjb25zdCBsaW5lQ29udGVudCA9IGlucHV0LmxpbmVDb250ZW50O1xuXHRjb25zdCBsZW4gPSBpbnB1dC5sZW47XG5cdGNvbnN0IGlzT3ZlcmZsb3dpbmcgPSBpbnB1dC5pc092ZXJmbG93aW5nO1xuXHRjb25zdCBvdmVyZmxvd2luZ0NoYXJDb3VudCA9IGlucHV0Lm92ZXJmbG93aW5nQ2hhckNvdW50O1xuXHRjb25zdCBwYXJ0cyA9IGlucHV0LnBhcnRzO1xuXHRjb25zdCBmYXV4SW5kZW50TGVuZ3RoID0gaW5wdXQuZmF1eEluZGVudExlbmd0aDtcblx0Y29uc3QgdGFiU2l6ZSA9IGlucHV0LnRhYlNpemU7XG5cdGNvbnN0IHN0YXJ0VmlzaWJsZUNvbHVtbiA9IGlucHV0LnN0YXJ0VmlzaWJsZUNvbHVtbjtcblx0Y29uc3Qgc3BhY2VXaWR0aCA9IGlucHV0LnNwYWNlV2lkdGg7XG5cdGNvbnN0IHJlbmRlclNwYWNlQ2hhckNvZGUgPSBpbnB1dC5yZW5kZXJTcGFjZUNoYXJDb2RlO1xuXHRjb25zdCByZW5kZXJXaGl0ZXNwYWNlID0gaW5wdXQucmVuZGVyV2hpdGVzcGFjZTtcblx0Y29uc3QgcmVuZGVyQ29udHJvbENoYXJhY3RlcnMgPSBpbnB1dC5yZW5kZXJDb250cm9sQ2hhcmFjdGVycztcblxuXHRjb25zdCBjaGFyYWN0ZXJNYXBwaW5nID0gbmV3IENoYXJhY3Rlck1hcHBpbmcobGVuICsgMSwgcGFydHMubGVuZ3RoKTtcblx0bGV0IGxhc3RDaGFyYWN0ZXJNYXBwaW5nRGVmaW5lZCA9IGZhbHNlO1xuXG5cdGxldCBjaGFySW5kZXggPSAwO1xuXHRsZXQgdmlzaWJsZUNvbHVtbiA9IHN0YXJ0VmlzaWJsZUNvbHVtbjtcblx0bGV0IGNoYXJPZmZzZXRJblBhcnQgPSAwOyAvLyB0aGUgY2hhcmFjdGVyIG9mZnNldCBpbiB0aGUgY3VycmVudCBwYXJ0XG5cdGxldCBjaGFySG9yaXpvbnRhbE9mZnNldCA9IDA7IC8vIHRoZSBjaGFyYWN0ZXIgaG9yaXpvbnRhbCBwb3NpdGlvbiBpbiB0ZXJtcyBvZiBjaGFycyByZWxhdGl2ZSB0byBsaW5lIHN0YXJ0XG5cblx0bGV0IHBhcnREaXNwbGFjZW1lbnQgPSAwO1xuXG5cdHNiLmFwcGVuZFN0cmluZygnPHNwYW4+Jyk7XG5cblx0Zm9yIChsZXQgcGFydEluZGV4ID0gMCwgdG9rZW5zTGVuID0gcGFydHMubGVuZ3RoOyBwYXJ0SW5kZXggPCB0b2tlbnNMZW47IHBhcnRJbmRleCsrKSB7XG5cblx0XHRjb25zdCBwYXJ0ID0gcGFydHNbcGFydEluZGV4XTtcblx0XHRjb25zdCBwYXJ0RW5kSW5kZXggPSBwYXJ0LmVuZEluZGV4O1xuXHRcdGNvbnN0IHBhcnRUeXBlID0gcGFydC50eXBlO1xuXHRcdGNvbnN0IHBhcnRDb250YWluc1JUTCA9IHBhcnQuY29udGFpbnNSVEw7XG5cdFx0Y29uc3QgcGFydFJlbmRlcnNXaGl0ZXNwYWNlID0gKHJlbmRlcldoaXRlc3BhY2UgIT09IFJlbmRlcldoaXRlc3BhY2UuTm9uZSAmJiBwYXJ0LmlzV2hpdGVzcGFjZSgpKTtcblx0XHRjb25zdCBwYXJ0UmVuZGVyc1doaXRlc3BhY2VXaXRoV2lkdGggPSBwYXJ0UmVuZGVyc1doaXRlc3BhY2UgJiYgIWZvbnRJc01vbm9zcGFjZSAmJiAocGFydFR5cGUgPT09ICdtdGt3Jy8qb25seSB3aGl0ZXNwYWNlKi8gfHwgIWNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzKTtcblx0XHRjb25zdCBwYXJ0SXNFbXB0eUFuZEhhc1BzZXVkb0FmdGVyID0gKGNoYXJJbmRleCA9PT0gcGFydEVuZEluZGV4ICYmIHBhcnQuaXNQc2V1ZG9BZnRlcigpKTtcblx0XHRjaGFyT2Zmc2V0SW5QYXJ0ID0gMDtcblxuXHRcdHNiLmFwcGVuZFN0cmluZygnPHNwYW4gJyk7XG5cdFx0aWYgKHBhcnRDb250YWluc1JUTCkge1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKCdzdHlsZT1cInVuaWNvZGUtYmlkaTppc29sYXRlXCIgJyk7XG5cdFx0fVxuXHRcdHNiLmFwcGVuZFN0cmluZygnY2xhc3M9XCInKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcocGFydFJlbmRlcnNXaGl0ZXNwYWNlV2l0aFdpZHRoID8gJ210a3onIDogcGFydFR5cGUpO1xuXHRcdHNiLmFwcGVuZEFTQ0lJQ2hhckNvZGUoQ2hhckNvZGUuRG91YmxlUXVvdGUpO1xuXG5cdFx0aWYgKHBhcnRSZW5kZXJzV2hpdGVzcGFjZSkge1xuXG5cdFx0XHRsZXQgcGFydFdpZHRoID0gMDtcblx0XHRcdHtcblx0XHRcdFx0bGV0IF9jaGFySW5kZXggPSBjaGFySW5kZXg7XG5cdFx0XHRcdGxldCBfdmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cblx0XHRcdFx0Zm9yICg7IF9jaGFySW5kZXggPCBwYXJ0RW5kSW5kZXg7IF9jaGFySW5kZXgrKykge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXJDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChfY2hhckluZGV4KTtcblx0XHRcdFx0XHRjb25zdCBjaGFyV2lkdGggPSAoY2hhckNvZGUgPT09IENoYXJDb2RlLlRhYiA/ICh0YWJTaXplIC0gKF92aXNpYmxlQ29sdW1uICUgdGFiU2l6ZSkpIDogMSkgfCAwO1xuXHRcdFx0XHRcdHBhcnRXaWR0aCArPSBjaGFyV2lkdGg7XG5cdFx0XHRcdFx0aWYgKF9jaGFySW5kZXggPj0gZmF1eEluZGVudExlbmd0aCkge1xuXHRcdFx0XHRcdFx0X3Zpc2libGVDb2x1bW4gKz0gY2hhcldpZHRoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocGFydFJlbmRlcnNXaGl0ZXNwYWNlV2l0aFdpZHRoKSB7XG5cdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnIHN0eWxlPVwid2lkdGg6Jyk7XG5cdFx0XHRcdHNiLmFwcGVuZFN0cmluZyhTdHJpbmcoc3BhY2VXaWR0aCAqIHBhcnRXaWR0aCkpO1xuXHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJ3B4XCInKTtcblx0XHRcdH1cblx0XHRcdHNiLmFwcGVuZEFTQ0lJQ2hhckNvZGUoQ2hhckNvZGUuR3JlYXRlclRoYW4pO1xuXG5cdFx0XHRmb3IgKDsgY2hhckluZGV4IDwgcGFydEVuZEluZGV4OyBjaGFySW5kZXgrKykge1xuXHRcdFx0XHRjaGFyYWN0ZXJNYXBwaW5nLnNldENvbHVtbkluZm8oY2hhckluZGV4ICsgMSwgcGFydEluZGV4IC0gcGFydERpc3BsYWNlbWVudCwgY2hhck9mZnNldEluUGFydCwgY2hhckhvcml6b250YWxPZmZzZXQpO1xuXHRcdFx0XHRwYXJ0RGlzcGxhY2VtZW50ID0gMDtcblx0XHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNoYXJJbmRleCk7XG5cblx0XHRcdFx0bGV0IHByb2R1Y2VkQ2hhcmFjdGVyczogbnVtYmVyO1xuXHRcdFx0XHRsZXQgY2hhcldpZHRoOiBudW1iZXI7XG5cblx0XHRcdFx0aWYgKGNoYXJDb2RlID09PSBDaGFyQ29kZS5UYWIpIHtcblx0XHRcdFx0XHRwcm9kdWNlZENoYXJhY3RlcnMgPSAodGFiU2l6ZSAtICh2aXNpYmxlQ29sdW1uICUgdGFiU2l6ZSkpIHwgMDtcblx0XHRcdFx0XHRjaGFyV2lkdGggPSBwcm9kdWNlZENoYXJhY3RlcnM7XG5cblx0XHRcdFx0XHRpZiAoIWNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyB8fCBjaGFyV2lkdGggPiAxKSB7XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSgweDIxOTIpOyAvLyBSSUdIVFdBUkRTIEFSUk9XXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNiLmFwcGVuZENoYXJDb2RlKDB4RkZFQik7IC8vIEhBTEZXSURUSCBSSUdIVFdBUkRTIEFSUk9XXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAobGV0IHNwYWNlID0gMjsgc3BhY2UgPD0gY2hhcldpZHRoOyBzcGFjZSsrKSB7XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSgweEEwKTsgLy8gJm5ic3A7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7IC8vIG11c3QgYmUgQ2hhckNvZGUuU3BhY2Vcblx0XHRcdFx0XHRwcm9kdWNlZENoYXJhY3RlcnMgPSAyO1xuXHRcdFx0XHRcdGNoYXJXaWR0aCA9IDE7XG5cblx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZShyZW5kZXJTcGFjZUNoYXJDb2RlKTsgLy8gJm1pZGRvdDsgb3Igd29yZCBzZXBhcmF0b3IgbWlkZGxlIGRvdFxuXHRcdFx0XHRcdHNiLmFwcGVuZENoYXJDb2RlKDB4MjAwQyk7IC8vIFpFUk8gV0lEVEggTk9OLUpPSU5FUlxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhck9mZnNldEluUGFydCArPSBwcm9kdWNlZENoYXJhY3RlcnM7XG5cdFx0XHRcdGNoYXJIb3Jpem9udGFsT2Zmc2V0ICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0aWYgKGNoYXJJbmRleCA+PSBmYXV4SW5kZW50TGVuZ3RoKSB7XG5cdFx0XHRcdFx0dmlzaWJsZUNvbHVtbiArPSBjaGFyV2lkdGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdHNiLmFwcGVuZEFTQ0lJQ2hhckNvZGUoQ2hhckNvZGUuR3JlYXRlclRoYW4pO1xuXG5cdFx0XHRmb3IgKDsgY2hhckluZGV4IDwgcGFydEVuZEluZGV4OyBjaGFySW5kZXgrKykge1xuXHRcdFx0XHRjaGFyYWN0ZXJNYXBwaW5nLnNldENvbHVtbkluZm8oY2hhckluZGV4ICsgMSwgcGFydEluZGV4IC0gcGFydERpc3BsYWNlbWVudCwgY2hhck9mZnNldEluUGFydCwgY2hhckhvcml6b250YWxPZmZzZXQpO1xuXHRcdFx0XHRwYXJ0RGlzcGxhY2VtZW50ID0gMDtcblx0XHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNoYXJJbmRleCk7XG5cblx0XHRcdFx0bGV0IHByb2R1Y2VkQ2hhcmFjdGVycyA9IDE7XG5cdFx0XHRcdGxldCBjaGFyV2lkdGggPSAxO1xuXG5cdFx0XHRcdHN3aXRjaCAoY2hhckNvZGUpIHtcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLlRhYjpcblx0XHRcdFx0XHRcdHByb2R1Y2VkQ2hhcmFjdGVycyA9ICh0YWJTaXplIC0gKHZpc2libGVDb2x1bW4gJSB0YWJTaXplKSk7XG5cdFx0XHRcdFx0XHRjaGFyV2lkdGggPSBwcm9kdWNlZENoYXJhY3RlcnM7XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBzcGFjZSA9IDE7IHNwYWNlIDw9IHByb2R1Y2VkQ2hhcmFjdGVyczsgc3BhY2UrKykge1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSgweEEwKTsgLy8gJm5ic3A7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSgweEEwKTsgLy8gJm5ic3A7XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuTGVzc1RoYW46XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJyZsdDsnKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5HcmVhdGVyVGhhbjpcblx0XHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnJmd0OycpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkFtcGVyc2FuZDpcblx0XHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnJmFtcDsnKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5OdWxsOlxuXHRcdFx0XHRcdFx0aWYgKHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFNlZSBodHRwczovL3VuaWNvZGUtdGFibGUuY29tL2VuL2Jsb2Nrcy9jb250cm9sLXBpY3R1cmVzL1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSg5MjE2KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnJiMwMDsnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5VVEY4X0JPTTpcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkxJTkVfU0VQQVJBVE9SOlxuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuUEFSQUdSQVBIX1NFUEFSQVRPUjpcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLk5FWFRfTElORTpcblx0XHRcdFx0XHRcdHNiLmFwcGVuZENoYXJDb2RlKDB4RkZGRCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRpZiAoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcihjaGFyQ29kZSkpIHtcblx0XHRcdFx0XHRcdFx0Y2hhcldpZHRoKys7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly91bmljb2RlLXRhYmxlLmNvbS9lbi9ibG9ja3MvY29udHJvbC1waWN0dXJlcy9cblx0XHRcdFx0XHRcdGlmIChyZW5kZXJDb250cm9sQ2hhcmFjdGVycyAmJiBjaGFyQ29kZSA8IDMyKSB7XG5cdFx0XHRcdFx0XHRcdHNiLmFwcGVuZENoYXJDb2RlKDkyMTYgKyBjaGFyQ29kZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzICYmIGNoYXJDb2RlID09PSAxMjcpIHtcblx0XHRcdFx0XHRcdFx0Ly8gREVMXG5cdFx0XHRcdFx0XHRcdHNiLmFwcGVuZENoYXJDb2RlKDkyNDkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChyZW5kZXJDb250cm9sQ2hhcmFjdGVycyAmJiBpc0NvbnRyb2xDaGFyYWN0ZXIoY2hhckNvZGUpKSB7XG5cdFx0XHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnW1UrJyk7XG5cdFx0XHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZyh0bzRDaGFySGV4KGNoYXJDb2RlKSk7XG5cdFx0XHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZygnXScpO1xuXHRcdFx0XHRcdFx0XHRwcm9kdWNlZENoYXJhY3RlcnMgPSA4O1xuXHRcdFx0XHRcdFx0XHRjaGFyV2lkdGggPSBwcm9kdWNlZENoYXJhY3RlcnM7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZShjaGFyQ29kZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGFyT2Zmc2V0SW5QYXJ0ICs9IHByb2R1Y2VkQ2hhcmFjdGVycztcblx0XHRcdFx0Y2hhckhvcml6b250YWxPZmZzZXQgKz0gY2hhcldpZHRoO1xuXHRcdFx0XHRpZiAoY2hhckluZGV4ID49IGZhdXhJbmRlbnRMZW5ndGgpIHtcblx0XHRcdFx0XHR2aXNpYmxlQ29sdW1uICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwYXJ0SXNFbXB0eUFuZEhhc1BzZXVkb0FmdGVyKSB7XG5cdFx0XHRwYXJ0RGlzcGxhY2VtZW50Kys7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBhcnREaXNwbGFjZW1lbnQgPSAwO1xuXHRcdH1cblxuXHRcdGlmIChjaGFySW5kZXggPj0gbGVuICYmICFsYXN0Q2hhcmFjdGVyTWFwcGluZ0RlZmluZWQgJiYgcGFydC5pc1BzZXVkb0FmdGVyKCkpIHtcblx0XHRcdGxhc3RDaGFyYWN0ZXJNYXBwaW5nRGVmaW5lZCA9IHRydWU7XG5cdFx0XHRjaGFyYWN0ZXJNYXBwaW5nLnNldENvbHVtbkluZm8oY2hhckluZGV4ICsgMSwgcGFydEluZGV4LCBjaGFyT2Zmc2V0SW5QYXJ0LCBjaGFySG9yaXpvbnRhbE9mZnNldCk7XG5cdFx0fVxuXG5cdFx0c2IuYXBwZW5kU3RyaW5nKCc8L3NwYW4+Jyk7XG5cblx0fVxuXG5cdGlmICghbGFzdENoYXJhY3Rlck1hcHBpbmdEZWZpbmVkKSB7XG5cdFx0Ly8gV2hlbiBnZXR0aW5nIGNsaWVudCByZWN0cyBmb3IgdGhlIGxhc3QgY2hhcmFjdGVyLCB3ZSB3aWxsIHBvc2l0aW9uIHRoZVxuXHRcdC8vIHRleHQgcmFuZ2UgYXQgdGhlIGVuZCBvZiB0aGUgc3BhbiwgaW5zdGVhZiBvZiBhdCB0aGUgYmVnaW5uaW5nIG9mIG5leHQgc3BhblxuXHRcdGNoYXJhY3Rlck1hcHBpbmcuc2V0Q29sdW1uSW5mbyhsZW4gKyAxLCBwYXJ0cy5sZW5ndGggLSAxLCBjaGFyT2Zmc2V0SW5QYXJ0LCBjaGFySG9yaXpvbnRhbE9mZnNldCk7XG5cdH1cblxuXHRpZiAoaXNPdmVyZmxvd2luZykge1xuXHRcdHNiLmFwcGVuZFN0cmluZygnPHNwYW4gY2xhc3M9XCJtdGtvdmVyZmxvd1wiPicpO1xuXHRcdHNiLmFwcGVuZFN0cmluZyhubHMubG9jYWxpemUoJ3Nob3dNb3JlJywgXCJTaG93IG1vcmUgKHswfSlcIiwgcmVuZGVyT3ZlcmZsb3dpbmdDaGFyQ291bnQob3ZlcmZsb3dpbmdDaGFyQ291bnQpKSk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCc8L3NwYW4+Jyk7XG5cdH1cblxuXHRzYi5hcHBlbmRTdHJpbmcoJzwvc3Bhbj4nKTtcblxuXHRyZXR1cm4gbmV3IFJlbmRlckxpbmVPdXRwdXQoY2hhcmFjdGVyTWFwcGluZywgY29udGFpbnNGb3JlaWduRWxlbWVudHMpO1xufVxuXG5mdW5jdGlvbiB0bzRDaGFySGV4KG46IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiBuLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpLnBhZFN0YXJ0KDQsICcwJyk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlck92ZXJmbG93aW5nQ2hhckNvdW50KG46IG51bWJlcik6IHN0cmluZyB7XG5cdGlmIChuIDwgMTAyNCkge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ292ZXJmbG93LmNoYXJzJywgXCJ7MH0gY2hhcnNcIiwgbik7XG5cdH1cblx0aWYgKG4gPCAxMDI0ICogMTAyNCkge1xuXHRcdHJldHVybiBgJHsobiAvIDEwMjQpLnRvRml4ZWQoMSl9IEtCYDtcblx0fVxuXHRyZXR1cm4gYCR7KG4gLyAxMDI0IC8gMTAyNCkudG9GaXhlZCgxKX0gTUJgO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUV6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQixpQ0FBaUM7QUFDMUQsU0FBUyxVQUFVLHdCQUF3QjtBQUUzQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQUV2QixJQUFXLG1CQUFYLGtCQUFXQSxzQkFBWDtBQUNOLEVBQUFBLG9DQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLG9DQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLG9DQUFBLGVBQVksS0FBWjtBQUNBLEVBQUFBLG9DQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLG9DQUFBLFNBQU0sS0FBTjtBQUxpQixTQUFBQTtB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QSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksOEJBQThCO0FBQ2pDO0FBQUEsSUFDRCxPQUFPO0FBQ04seUJBQW1CO0FBQUEsSUFDcEI7QUFFQSxRQUFJLGFBQWEsT0FBTyxDQUFDLCtCQUErQixLQUFLLGNBQWMsR0FBRztBQUM3RSxvQ0FBOEI7QUFDOUIsdUJBQWlCLGNBQWMsWUFBWSxHQUFHLFdBQVcsa0JBQWtCLG9CQUFvQjtBQUFBLElBQ2hHO0FBRUEsT0FBRyxhQUFhLFNBQVM7QUFBQSxFQUUxQjtBQUVBLE1BQUksQ0FBQyw2QkFBNkI7QUFHakMscUJBQWlCLGNBQWMsTUFBTSxHQUFHLE1BQU0sU0FBUyxHQUFHLGtCQUFrQixvQkFBb0I7QUFBQSxFQUNqRztBQUVBLE1BQUksZUFBZTtBQUNsQixPQUFHLGFBQWEsNEJBQTRCO0FBQzVDLE9BQUcsYUFBYSxJQUFJLFNBQVMsWUFBWSxtQkFBbUIsMkJBQTJCLG9CQUFvQixDQUFDLENBQUM7QUFDN0csT0FBRyxhQUFhLFNBQVM7QUFBQSxFQUMxQjtBQUVBLEtBQUcsYUFBYSxTQUFTO0FBRXpCLFNBQU8sSUFBSSxpQkFBaUIsa0JBQWtCLHVCQUF1QjtBQUN0RTtBQUVBLFNBQVMsV0FBVyxHQUFtQjtBQUN0QyxTQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUsWUFBWSxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQ3BEO0FBRUEsU0FBUywyQkFBMkIsR0FBbUI7QUFDdEQsTUFBSSxJQUFJLE1BQU07QUFDYixXQUFPLElBQUksU0FBUyxrQkFBa0IsYUFBYSxDQUFDO0FBQUEsRUFDckQ7QUFDQSxNQUFJLElBQUksT0FBTyxNQUFNO0FBQ3BCLFdBQU8sSUFBSSxJQUFJLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNoQztBQUNBLFNBQU8sSUFBSSxJQUFJLE9BQU8sTUFBTSxRQUFRLENBQUMsQ0FBQztBQUN2QzsiLAogICJuYW1lcyI6IFsiUmVuZGVyV2hpdGVzcGFjZSIsICJDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzIiwgIkZvcmVpZ25FbGVtZW50VHlwZSIsICJsZW4iLCAidG9rZW5Db250YWluc1JUTCIsICJDb25zdGFudHMiXQp9Cg==
