var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { FontStyle, MetadataConsts, TokenMetadata } from "../encodedTokenAttributes.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { ILogService, LogLevel } from "../../../platform/log/common/log.js";
import { SparseMultilineTokens } from "../tokens/sparseMultilineTokens.js";
import { ILanguageService } from "../languages/language.js";
var SemanticTokensProviderStylingConstants = /* @__PURE__ */ ((SemanticTokensProviderStylingConstants2) => {
  SemanticTokensProviderStylingConstants2[SemanticTokensProviderStylingConstants2["NO_STYLING"] = 2147483647] = "NO_STYLING";
  return SemanticTokensProviderStylingConstants2;
})(SemanticTokensProviderStylingConstants || {});
const ENABLE_TRACE = false;
let SemanticTokensProviderStyling = class {
  constructor(_legend, _themeService, _languageService, _logService) {
    this._legend = _legend;
    this._themeService = _themeService;
    this._languageService = _languageService;
    this._logService = _logService;
    this._hasWarnedOverlappingTokens = false;
    this._hasWarnedInvalidLengthTokens = false;
    this._hasWarnedInvalidEditStart = false;
    this._hashTable = new HashTable();
  }
  getMetadata(tokenTypeIndex, tokenModifierSet, languageId) {
    const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
    const entry = this._hashTable.get(tokenTypeIndex, tokenModifierSet, encodedLanguageId);
    let metadata;
    if (entry) {
      metadata = entry.metadata;
      if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
        this._logService.trace(`SemanticTokensProviderStyling [CACHED] ${tokenTypeIndex} / ${tokenModifierSet}: foreground ${TokenMetadata.getForeground(metadata)}, fontStyle ${TokenMetadata.getFontStyle(metadata).toString(2)}`);
      }
    } else {
      let tokenType = this._legend.tokenTypes[tokenTypeIndex];
      const tokenModifiers = [];
      if (tokenType) {
        let modifierSet = tokenModifierSet;
        for (let modifierIndex = 0; modifierSet > 0 && modifierIndex < this._legend.tokenModifiers.length; modifierIndex++) {
          if (modifierSet & 1) {
            tokenModifiers.push(this._legend.tokenModifiers[modifierIndex]);
          }
          modifierSet = modifierSet >> 1;
        }
        if (ENABLE_TRACE && modifierSet > 0 && this._logService.getLevel() === LogLevel.Trace) {
          this._logService.trace(`SemanticTokensProviderStyling: unknown token modifier index: ${tokenModifierSet.toString(2)} for legend: ${JSON.stringify(this._legend.tokenModifiers)}`);
          tokenModifiers.push("not-in-legend");
        }
        const tokenStyle = this._themeService.getColorTheme().getTokenStyleMetadata(tokenType, tokenModifiers, languageId);
        if (typeof tokenStyle === "undefined") {
          metadata = 2147483647 /* NO_STYLING */;
        } else {
          metadata = 0;
          if (typeof tokenStyle.italic !== "undefined") {
            const italicBit = (tokenStyle.italic ? FontStyle.Italic : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= italicBit | MetadataConsts.SEMANTIC_USE_ITALIC;
          }
          if (typeof tokenStyle.bold !== "undefined") {
            const boldBit = (tokenStyle.bold ? FontStyle.Bold : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= boldBit | MetadataConsts.SEMANTIC_USE_BOLD;
          }
          if (typeof tokenStyle.underline !== "undefined") {
            const underlineBit = (tokenStyle.underline ? FontStyle.Underline : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= underlineBit | MetadataConsts.SEMANTIC_USE_UNDERLINE;
          }
          if (typeof tokenStyle.strikethrough !== "undefined") {
            const strikethroughBit = (tokenStyle.strikethrough ? FontStyle.Strikethrough : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= strikethroughBit | MetadataConsts.SEMANTIC_USE_STRIKETHROUGH;
          }
          if (tokenStyle.foreground) {
            const foregroundBits = tokenStyle.foreground << MetadataConsts.FOREGROUND_OFFSET;
            metadata |= foregroundBits | MetadataConsts.SEMANTIC_USE_FOREGROUND;
          }
          if (metadata === 0) {
            metadata = 2147483647 /* NO_STYLING */;
          }
        }
      } else {
        if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
          this._logService.trace(`SemanticTokensProviderStyling: unknown token type index: ${tokenTypeIndex} for legend: ${JSON.stringify(this._legend.tokenTypes)}`);
        }
        metadata = 2147483647 /* NO_STYLING */;
        tokenType = "not-in-legend";
      }
      this._hashTable.add(tokenTypeIndex, tokenModifierSet, encodedLanguageId, metadata);
      if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
        this._logService.trace(`SemanticTokensProviderStyling ${tokenTypeIndex} (${tokenType}) / ${tokenModifierSet} (${tokenModifiers.join(" ")}): foreground ${TokenMetadata.getForeground(metadata)}, fontStyle ${TokenMetadata.getFontStyle(metadata).toString(2)}`);
      }
    }
    return metadata;
  }
  warnOverlappingSemanticTokens(lineNumber, startColumn) {
    if (!this._hasWarnedOverlappingTokens) {
      this._hasWarnedOverlappingTokens = true;
      this._logService.warn(`Overlapping semantic tokens detected at lineNumber ${lineNumber}, column ${startColumn}`);
    }
  }
  warnInvalidLengthSemanticTokens(lineNumber, startColumn) {
    if (!this._hasWarnedInvalidLengthTokens) {
      this._hasWarnedInvalidLengthTokens = true;
      this._logService.warn(`Semantic token with invalid length detected at lineNumber ${lineNumber}, column ${startColumn}`);
    }
  }
  warnInvalidEditStart(previousResultId, resultId, editIndex, editStart, maxExpectedStart) {
    if (!this._hasWarnedInvalidEditStart) {
      this._hasWarnedInvalidEditStart = true;
      this._logService.warn(`Invalid semantic tokens edit detected (previousResultId: ${previousResultId}, resultId: ${resultId}) at edit #${editIndex}: The provided start offset ${editStart} is outside the previous data (length ${maxExpectedStart}).`);
    }
  }
};
SemanticTokensProviderStyling = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, ILogService)
], SemanticTokensProviderStyling);
var SemanticColoringConstants = /* @__PURE__ */ ((SemanticColoringConstants2) => {
  SemanticColoringConstants2[SemanticColoringConstants2["DesiredTokensPerArea"] = 400] = "DesiredTokensPerArea";
  SemanticColoringConstants2[SemanticColoringConstants2["DesiredMaxAreas"] = 1024] = "DesiredMaxAreas";
  return SemanticColoringConstants2;
})(SemanticColoringConstants || {});
function toMultilineTokens2(tokens, styling, languageId) {
  const srcData = tokens.data;
  const tokenCount = tokens.data.length / 5 | 0;
  const tokensPerArea = Math.max(Math.ceil(tokenCount / 1024 /* DesiredMaxAreas */), 400 /* DesiredTokensPerArea */);
  const result = [];
  let tokenIndex = 0;
  let lastLineNumber = 1;
  let lastStartCharacter = 0;
  while (tokenIndex < tokenCount) {
    const tokenStartIndex = tokenIndex;
    let tokenEndIndex = Math.min(tokenStartIndex + tokensPerArea, tokenCount);
    if (tokenEndIndex < tokenCount) {
      let smallTokenEndIndex = tokenEndIndex;
      while (smallTokenEndIndex - 1 > tokenStartIndex && srcData[5 * smallTokenEndIndex] === 0) {
        smallTokenEndIndex--;
      }
      if (smallTokenEndIndex - 1 === tokenStartIndex) {
        let bigTokenEndIndex = tokenEndIndex;
        while (bigTokenEndIndex + 1 < tokenCount && srcData[5 * bigTokenEndIndex] === 0) {
          bigTokenEndIndex++;
        }
        tokenEndIndex = bigTokenEndIndex;
      } else {
        tokenEndIndex = smallTokenEndIndex;
      }
    }
    let destData = new Uint32Array((tokenEndIndex - tokenStartIndex) * 4);
    let destOffset = 0;
    let areaLine = 0;
    let prevLineNumber = 0;
    let prevEndCharacter = 0;
    while (tokenIndex < tokenEndIndex) {
      const srcOffset = 5 * tokenIndex;
      const deltaLine = srcData[srcOffset];
      const deltaCharacter = srcData[srcOffset + 1];
      const lineNumber = lastLineNumber + deltaLine | 0;
      const startCharacter = deltaLine === 0 ? lastStartCharacter + deltaCharacter | 0 : deltaCharacter;
      const length = srcData[srcOffset + 2];
      const endCharacter = startCharacter + length | 0;
      const tokenTypeIndex = srcData[srcOffset + 3];
      const tokenModifierSet = srcData[srcOffset + 4];
      if (endCharacter <= startCharacter) {
        styling.warnInvalidLengthSemanticTokens(lineNumber, startCharacter + 1);
      } else if (prevLineNumber === lineNumber && prevEndCharacter > startCharacter) {
        styling.warnOverlappingSemanticTokens(lineNumber, startCharacter + 1);
      } else {
        const metadata = styling.getMetadata(tokenTypeIndex, tokenModifierSet, languageId);
        if (metadata !== 2147483647 /* NO_STYLING */) {
          if (areaLine === 0) {
            areaLine = lineNumber;
          }
          destData[destOffset] = lineNumber - areaLine;
          destData[destOffset + 1] = startCharacter;
          destData[destOffset + 2] = endCharacter;
          destData[destOffset + 3] = metadata;
          destOffset += 4;
          prevLineNumber = lineNumber;
          prevEndCharacter = endCharacter;
        }
      }
      lastLineNumber = lineNumber;
      lastStartCharacter = startCharacter;
      tokenIndex++;
    }
    if (destOffset !== destData.length) {
      destData = destData.subarray(0, destOffset);
    }
    const tokens2 = SparseMultilineTokens.create(areaLine, destData);
    result.push(tokens2);
  }
  return result;
}
class HashTableEntry {
  constructor(tokenTypeIndex, tokenModifierSet, languageId, metadata) {
    this.tokenTypeIndex = tokenTypeIndex;
    this.tokenModifierSet = tokenModifierSet;
    this.languageId = languageId;
    this.metadata = metadata;
    this.next = null;
  }
}
const _HashTable = class _HashTable {
  constructor() {
    this._elementsCount = 0;
    this._currentLengthIndex = 0;
    this._currentLength = _HashTable._SIZES[this._currentLengthIndex];
    this._growCount = Math.round(this._currentLengthIndex + 1 < _HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0);
    this._elements = [];
    _HashTable._nullOutEntries(this._elements, this._currentLength);
  }
  static _nullOutEntries(entries, length) {
    for (let i = 0; i < length; i++) {
      entries[i] = null;
    }
  }
  _hash2(n1, n2) {
    return (n1 << 5) - n1 + n2 | 0;
  }
  _hashFunc(tokenTypeIndex, tokenModifierSet, languageId) {
    return this._hash2(this._hash2(tokenTypeIndex, tokenModifierSet), languageId) % this._currentLength;
  }
  get(tokenTypeIndex, tokenModifierSet, languageId) {
    const hash = this._hashFunc(tokenTypeIndex, tokenModifierSet, languageId);
    let p = this._elements[hash];
    while (p) {
      if (p.tokenTypeIndex === tokenTypeIndex && p.tokenModifierSet === tokenModifierSet && p.languageId === languageId) {
        return p;
      }
      p = p.next;
    }
    return null;
  }
  add(tokenTypeIndex, tokenModifierSet, languageId, metadata) {
    this._elementsCount++;
    if (this._growCount !== 0 && this._elementsCount >= this._growCount) {
      const oldElements = this._elements;
      this._currentLengthIndex++;
      this._currentLength = _HashTable._SIZES[this._currentLengthIndex];
      this._growCount = Math.round(this._currentLengthIndex + 1 < _HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0);
      this._elements = [];
      _HashTable._nullOutEntries(this._elements, this._currentLength);
      for (const first of oldElements) {
        let p = first;
        while (p) {
          const oldNext = p.next;
          p.next = null;
          this._add(p);
          p = oldNext;
        }
      }
    }
    this._add(new HashTableEntry(tokenTypeIndex, tokenModifierSet, languageId, metadata));
  }
  _add(element) {
    const hash = this._hashFunc(element.tokenTypeIndex, element.tokenModifierSet, element.languageId);
    element.next = this._elements[hash];
    this._elements[hash] = element;
  }
};
_HashTable._SIZES = [3, 7, 13, 31, 61, 127, 251, 509, 1021, 2039, 4093, 8191, 16381, 32749, 65521, 131071, 262139, 524287, 1048573, 2097143];
let HashTable = _HashTable;
export {
  SemanticTokensProviderStyling,
  toMultilineTokens2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vc2VydmljZXMvc2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZW1hbnRpY1Rva2Vuc0xlZ2VuZCwgU2VtYW50aWNUb2tlbnMgfSBmcm9tICcuLi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRm9udFN0eWxlLCBNZXRhZGF0YUNvbnN0cywgVG9rZW5NZXRhZGF0YSB9IGZyb20gJy4uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU3BhcnNlTXVsdGlsaW5lVG9rZW5zIH0gZnJvbSAnLi4vdG9rZW5zL3NwYXJzZU11bHRpbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcblxuY29uc3QgZW51bSBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZ0NvbnN0YW50cyB7XG5cdE5PX1NUWUxJTkcgPSAwYjAxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExXG59XG5cbmNvbnN0IEVOQUJMRV9UUkFDRSA9IGZhbHNlO1xuXG5leHBvcnQgY2xhc3MgU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmcge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc2hUYWJsZTogSGFzaFRhYmxlO1xuXHRwcml2YXRlIF9oYXNXYXJuZWRPdmVybGFwcGluZ1Rva2VucyA9IGZhbHNlO1xuXHRwcml2YXRlIF9oYXNXYXJuZWRJbnZhbGlkTGVuZ3RoVG9rZW5zID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc1dhcm5lZEludmFsaWRFZGl0U3RhcnQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sZWdlbmQ6IFNlbWFudGljVG9rZW5zTGVnZW5kLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2hhc2hUYWJsZSA9IG5ldyBIYXNoVGFibGUoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNZXRhZGF0YSh0b2tlblR5cGVJbmRleDogbnVtYmVyLCB0b2tlbk1vZGlmaWVyU2V0OiBudW1iZXIsIGxhbmd1YWdlSWQ6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9oYXNoVGFibGUuZ2V0KHRva2VuVHlwZUluZGV4LCB0b2tlbk1vZGlmaWVyU2V0LCBlbmNvZGVkTGFuZ3VhZ2VJZCk7XG5cdFx0bGV0IG1ldGFkYXRhOiBudW1iZXI7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRtZXRhZGF0YSA9IGVudHJ5Lm1ldGFkYXRhO1xuXHRcdFx0aWYgKEVOQUJMRV9UUkFDRSAmJiB0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nIFtDQUNIRURdICR7dG9rZW5UeXBlSW5kZXh9IC8gJHt0b2tlbk1vZGlmaWVyU2V0fTogZm9yZWdyb3VuZCAke1Rva2VuTWV0YWRhdGEuZ2V0Rm9yZWdyb3VuZChtZXRhZGF0YSl9LCBmb250U3R5bGUgJHtUb2tlbk1ldGFkYXRhLmdldEZvbnRTdHlsZShtZXRhZGF0YSkudG9TdHJpbmcoMil9YCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB0b2tlblR5cGUgPSB0aGlzLl9sZWdlbmQudG9rZW5UeXBlc1t0b2tlblR5cGVJbmRleF07XG5cdFx0XHRjb25zdCB0b2tlbk1vZGlmaWVyczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmICh0b2tlblR5cGUpIHtcblx0XHRcdFx0bGV0IG1vZGlmaWVyU2V0ID0gdG9rZW5Nb2RpZmllclNldDtcblx0XHRcdFx0Zm9yIChsZXQgbW9kaWZpZXJJbmRleCA9IDA7IG1vZGlmaWVyU2V0ID4gMCAmJiBtb2RpZmllckluZGV4IDwgdGhpcy5fbGVnZW5kLnRva2VuTW9kaWZpZXJzLmxlbmd0aDsgbW9kaWZpZXJJbmRleCsrKSB7XG5cdFx0XHRcdFx0aWYgKG1vZGlmaWVyU2V0ICYgMSkge1xuXHRcdFx0XHRcdFx0dG9rZW5Nb2RpZmllcnMucHVzaCh0aGlzLl9sZWdlbmQudG9rZW5Nb2RpZmllcnNbbW9kaWZpZXJJbmRleF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtb2RpZmllclNldCA9IG1vZGlmaWVyU2V0ID4+IDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKEVOQUJMRV9UUkFDRSAmJiBtb2RpZmllclNldCA+IDAgJiYgdGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nOiB1bmtub3duIHRva2VuIG1vZGlmaWVyIGluZGV4OiAke3Rva2VuTW9kaWZpZXJTZXQudG9TdHJpbmcoMil9IGZvciBsZWdlbmQ6ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5fbGVnZW5kLnRva2VuTW9kaWZpZXJzKX1gKTtcblx0XHRcdFx0XHR0b2tlbk1vZGlmaWVycy5wdXNoKCdub3QtaW4tbGVnZW5kJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0b2tlblN0eWxlID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRUb2tlblN0eWxlTWV0YWRhdGEodG9rZW5UeXBlLCB0b2tlbk1vZGlmaWVycywgbGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdGlmICh0eXBlb2YgdG9rZW5TdHlsZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRtZXRhZGF0YSA9IFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nQ29uc3RhbnRzLk5PX1NUWUxJTkc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWV0YWRhdGEgPSAwO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgdG9rZW5TdHlsZS5pdGFsaWMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGFsaWNCaXQgPSAodG9rZW5TdHlsZS5pdGFsaWMgPyBGb250U3R5bGUuSXRhbGljIDogMCkgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQ7XG5cdFx0XHRcdFx0XHRtZXRhZGF0YSB8PSBpdGFsaWNCaXQgfCBNZXRhZGF0YUNvbnN0cy5TRU1BTlRJQ19VU0VfSVRBTElDO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHlwZW9mIHRva2VuU3R5bGUuYm9sZCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJvbGRCaXQgPSAodG9rZW5TdHlsZS5ib2xkID8gRm9udFN0eWxlLkJvbGQgOiAwKSA8PCBNZXRhZGF0YUNvbnN0cy5GT05UX1NUWUxFX09GRlNFVDtcblx0XHRcdFx0XHRcdG1ldGFkYXRhIHw9IGJvbGRCaXQgfCBNZXRhZGF0YUNvbnN0cy5TRU1BTlRJQ19VU0VfQk9MRDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB0b2tlblN0eWxlLnVuZGVybGluZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVuZGVybGluZUJpdCA9ICh0b2tlblN0eWxlLnVuZGVybGluZSA/IEZvbnRTdHlsZS5VbmRlcmxpbmUgOiAwKSA8PCBNZXRhZGF0YUNvbnN0cy5GT05UX1NUWUxFX09GRlNFVDtcblx0XHRcdFx0XHRcdG1ldGFkYXRhIHw9IHVuZGVybGluZUJpdCB8IE1ldGFkYXRhQ29uc3RzLlNFTUFOVElDX1VTRV9VTkRFUkxJTkU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0eXBlb2YgdG9rZW5TdHlsZS5zdHJpa2V0aHJvdWdoICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RyaWtldGhyb3VnaEJpdCA9ICh0b2tlblN0eWxlLnN0cmlrZXRocm91Z2ggPyBGb250U3R5bGUuU3RyaWtldGhyb3VnaCA6IDApIDw8IE1ldGFkYXRhQ29uc3RzLkZPTlRfU1RZTEVfT0ZGU0VUO1xuXHRcdFx0XHRcdFx0bWV0YWRhdGEgfD0gc3RyaWtldGhyb3VnaEJpdCB8IE1ldGFkYXRhQ29uc3RzLlNFTUFOVElDX1VTRV9TVFJJS0VUSFJPVUdIO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodG9rZW5TdHlsZS5mb3JlZ3JvdW5kKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmb3JlZ3JvdW5kQml0cyA9ICh0b2tlblN0eWxlLmZvcmVncm91bmQpIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUO1xuXHRcdFx0XHRcdFx0bWV0YWRhdGEgfD0gZm9yZWdyb3VuZEJpdHMgfCBNZXRhZGF0YUNvbnN0cy5TRU1BTlRJQ19VU0VfRk9SRUdST1VORDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1ldGFkYXRhID09PSAwKSB7XG5cdFx0XHRcdFx0XHQvLyBOb3RoaW5nIVxuXHRcdFx0XHRcdFx0bWV0YWRhdGEgPSBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZ0NvbnN0YW50cy5OT19TVFlMSU5HO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKEVOQUJMRV9UUkFDRSAmJiB0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmc6IHVua25vd24gdG9rZW4gdHlwZSBpbmRleDogJHt0b2tlblR5cGVJbmRleH0gZm9yIGxlZ2VuZDogJHtKU09OLnN0cmluZ2lmeSh0aGlzLl9sZWdlbmQudG9rZW5UeXBlcyl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWV0YWRhdGEgPSBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZ0NvbnN0YW50cy5OT19TVFlMSU5HO1xuXHRcdFx0XHR0b2tlblR5cGUgPSAnbm90LWluLWxlZ2VuZCc7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9oYXNoVGFibGUuYWRkKHRva2VuVHlwZUluZGV4LCB0b2tlbk1vZGlmaWVyU2V0LCBlbmNvZGVkTGFuZ3VhZ2VJZCwgbWV0YWRhdGEpO1xuXG5cdFx0XHRpZiAoRU5BQkxFX1RSQUNFICYmIHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmcgJHt0b2tlblR5cGVJbmRleH0gKCR7dG9rZW5UeXBlfSkgLyAke3Rva2VuTW9kaWZpZXJTZXR9ICgke3Rva2VuTW9kaWZpZXJzLmpvaW4oJyAnKX0pOiBmb3JlZ3JvdW5kICR7VG9rZW5NZXRhZGF0YS5nZXRGb3JlZ3JvdW5kKG1ldGFkYXRhKX0sIGZvbnRTdHlsZSAke1Rva2VuTWV0YWRhdGEuZ2V0Rm9udFN0eWxlKG1ldGFkYXRhKS50b1N0cmluZygyKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbWV0YWRhdGE7XG5cdH1cblxuXHRwdWJsaWMgd2Fybk92ZXJsYXBwaW5nU2VtYW50aWNUb2tlbnMobGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNXYXJuZWRPdmVybGFwcGluZ1Rva2Vucykge1xuXHRcdFx0dGhpcy5faGFzV2FybmVkT3ZlcmxhcHBpbmdUb2tlbnMgPSB0cnVlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBPdmVybGFwcGluZyBzZW1hbnRpYyB0b2tlbnMgZGV0ZWN0ZWQgYXQgbGluZU51bWJlciAke2xpbmVOdW1iZXJ9LCBjb2x1bW4gJHtzdGFydENvbHVtbn1gKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgd2FybkludmFsaWRMZW5ndGhTZW1hbnRpY1Rva2VucyhsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc1dhcm5lZEludmFsaWRMZW5ndGhUb2tlbnMpIHtcblx0XHRcdHRoaXMuX2hhc1dhcm5lZEludmFsaWRMZW5ndGhUb2tlbnMgPSB0cnVlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBTZW1hbnRpYyB0b2tlbiB3aXRoIGludmFsaWQgbGVuZ3RoIGRldGVjdGVkIGF0IGxpbmVOdW1iZXIgJHtsaW5lTnVtYmVyfSwgY29sdW1uICR7c3RhcnRDb2x1bW59YCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHdhcm5JbnZhbGlkRWRpdFN0YXJ0KHByZXZpb3VzUmVzdWx0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzdWx0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZWRpdEluZGV4OiBudW1iZXIsIGVkaXRTdGFydDogbnVtYmVyLCBtYXhFeHBlY3RlZFN0YXJ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc1dhcm5lZEludmFsaWRFZGl0U3RhcnQpIHtcblx0XHRcdHRoaXMuX2hhc1dhcm5lZEludmFsaWRFZGl0U3RhcnQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBJbnZhbGlkIHNlbWFudGljIHRva2VucyBlZGl0IGRldGVjdGVkIChwcmV2aW91c1Jlc3VsdElkOiAke3ByZXZpb3VzUmVzdWx0SWR9LCByZXN1bHRJZDogJHtyZXN1bHRJZH0pIGF0IGVkaXQgIyR7ZWRpdEluZGV4fTogVGhlIHByb3ZpZGVkIHN0YXJ0IG9mZnNldCAke2VkaXRTdGFydH0gaXMgb3V0c2lkZSB0aGUgcHJldmlvdXMgZGF0YSAobGVuZ3RoICR7bWF4RXhwZWN0ZWRTdGFydH0pLmApO1xuXHRcdH1cblx0fVxuXG59XG5cbmNvbnN0IGVudW0gU2VtYW50aWNDb2xvcmluZ0NvbnN0YW50cyB7XG5cdC8qKlxuXHQgKiBMZXQncyBhaW0gYXQgaGF2aW5nIDhLQiBidWZmZXJzIGlmIHBvc3NpYmxlLi4uXG5cdCAqIFNvIHRoYXQgd291bGQgYmUgODE5MiAvICg1ICogNCkgPSA0MDkuNiB0b2tlbnMgcGVyIGFyZWFcblx0ICovXG5cdERlc2lyZWRUb2tlbnNQZXJBcmVhID0gNDAwLFxuXG5cdC8qKlxuXHQgKiBUcnkgdG8ga2VlcCB0aGUgdG90YWwgbnVtYmVyIG9mIGFyZWFzIHVuZGVyIDEwMjQgaWYgcG9zc2libGUsXG5cdCAqIHNpbXBseSBjb21wZW5zYXRlIGJ5IGhhdmluZyBtb3JlIHRva2VucyBwZXIgYXJlYS4uLlxuXHQgKi9cblx0RGVzaXJlZE1heEFyZWFzID0gMTAyNCxcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvTXVsdGlsaW5lVG9rZW5zMih0b2tlbnM6IFNlbWFudGljVG9rZW5zLCBzdHlsaW5nOiBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZywgbGFuZ3VhZ2VJZDogc3RyaW5nKTogU3BhcnNlTXVsdGlsaW5lVG9rZW5zW10ge1xuXHRjb25zdCBzcmNEYXRhID0gdG9rZW5zLmRhdGE7XG5cdGNvbnN0IHRva2VuQ291bnQgPSAodG9rZW5zLmRhdGEubGVuZ3RoIC8gNSkgfCAwO1xuXHRjb25zdCB0b2tlbnNQZXJBcmVhID0gTWF0aC5tYXgoTWF0aC5jZWlsKHRva2VuQ291bnQgLyBTZW1hbnRpY0NvbG9yaW5nQ29uc3RhbnRzLkRlc2lyZWRNYXhBcmVhcyksIFNlbWFudGljQ29sb3JpbmdDb25zdGFudHMuRGVzaXJlZFRva2Vuc1BlckFyZWEpO1xuXHRjb25zdCByZXN1bHQ6IFNwYXJzZU11bHRpbGluZVRva2Vuc1tdID0gW107XG5cblx0bGV0IHRva2VuSW5kZXggPSAwO1xuXHRsZXQgbGFzdExpbmVOdW1iZXIgPSAxO1xuXHRsZXQgbGFzdFN0YXJ0Q2hhcmFjdGVyID0gMDtcblx0d2hpbGUgKHRva2VuSW5kZXggPCB0b2tlbkNvdW50KSB7XG5cdFx0Y29uc3QgdG9rZW5TdGFydEluZGV4ID0gdG9rZW5JbmRleDtcblx0XHRsZXQgdG9rZW5FbmRJbmRleCA9IE1hdGgubWluKHRva2VuU3RhcnRJbmRleCArIHRva2Vuc1BlckFyZWEsIHRva2VuQ291bnQpO1xuXG5cdFx0Ly8gS2VlcCB0b2tlbnMgb24gdGhlIHNhbWUgbGluZSBpbiB0aGUgc2FtZSBhcmVhLi4uXG5cdFx0aWYgKHRva2VuRW5kSW5kZXggPCB0b2tlbkNvdW50KSB7XG5cblx0XHRcdGxldCBzbWFsbFRva2VuRW5kSW5kZXggPSB0b2tlbkVuZEluZGV4O1xuXHRcdFx0d2hpbGUgKHNtYWxsVG9rZW5FbmRJbmRleCAtIDEgPiB0b2tlblN0YXJ0SW5kZXggJiYgc3JjRGF0YVs1ICogc21hbGxUb2tlbkVuZEluZGV4XSA9PT0gMCkge1xuXHRcdFx0XHRzbWFsbFRva2VuRW5kSW5kZXgtLTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNtYWxsVG9rZW5FbmRJbmRleCAtIDEgPT09IHRva2VuU3RhcnRJbmRleCkge1xuXHRcdFx0XHQvLyB0aGVyZSBhcmUgc28gbWFueSB0b2tlbnMgb24gdGhpcyBsaW5lIHRoYXQgb3VyIGFyZWEgd291bGQgYmUgZW1wdHksIHdlIG11c3Qgbm93IGdvIHJpZ2h0XG5cdFx0XHRcdGxldCBiaWdUb2tlbkVuZEluZGV4ID0gdG9rZW5FbmRJbmRleDtcblx0XHRcdFx0d2hpbGUgKGJpZ1Rva2VuRW5kSW5kZXggKyAxIDwgdG9rZW5Db3VudCAmJiBzcmNEYXRhWzUgKiBiaWdUb2tlbkVuZEluZGV4XSA9PT0gMCkge1xuXHRcdFx0XHRcdGJpZ1Rva2VuRW5kSW5kZXgrKztcblx0XHRcdFx0fVxuXHRcdFx0XHR0b2tlbkVuZEluZGV4ID0gYmlnVG9rZW5FbmRJbmRleDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRva2VuRW5kSW5kZXggPSBzbWFsbFRva2VuRW5kSW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGRlc3REYXRhID0gbmV3IFVpbnQzMkFycmF5KCh0b2tlbkVuZEluZGV4IC0gdG9rZW5TdGFydEluZGV4KSAqIDQpO1xuXHRcdGxldCBkZXN0T2Zmc2V0ID0gMDtcblx0XHRsZXQgYXJlYUxpbmUgPSAwO1xuXHRcdGxldCBwcmV2TGluZU51bWJlciA9IDA7XG5cdFx0bGV0IHByZXZFbmRDaGFyYWN0ZXIgPSAwO1xuXHRcdHdoaWxlICh0b2tlbkluZGV4IDwgdG9rZW5FbmRJbmRleCkge1xuXHRcdFx0Y29uc3Qgc3JjT2Zmc2V0ID0gNSAqIHRva2VuSW5kZXg7XG5cdFx0XHRjb25zdCBkZWx0YUxpbmUgPSBzcmNEYXRhW3NyY09mZnNldF07XG5cdFx0XHRjb25zdCBkZWx0YUNoYXJhY3RlciA9IHNyY0RhdGFbc3JjT2Zmc2V0ICsgMV07XG5cdFx0XHQvLyBDYXN0aW5nIGJvdGggYGxpbmVOdW1iZXJgLCBgc3RhcnRDaGFyYWN0ZXJgIGFuZCBgZW5kQ2hhcmFjdGVyYCBoZXJlIHRvIHVpbnQzMiB1c2luZyBgfDBgXG5cdFx0XHQvLyB0byB2YWxpZGF0ZSBiZWxvdyB3aXRoIHRoZSBhY3R1YWwgdmFsdWVzIHRoYXQgd2lsbCBiZSBpbnNlcnRlZCBpbiB0aGUgVWludDMyQXJyYXkgcmVzdWx0XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gKGxhc3RMaW5lTnVtYmVyICsgZGVsdGFMaW5lKSB8IDA7XG5cdFx0XHRjb25zdCBzdGFydENoYXJhY3RlciA9IChkZWx0YUxpbmUgPT09IDAgPyAobGFzdFN0YXJ0Q2hhcmFjdGVyICsgZGVsdGFDaGFyYWN0ZXIpIHwgMCA6IGRlbHRhQ2hhcmFjdGVyKTtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IHNyY0RhdGFbc3JjT2Zmc2V0ICsgMl07XG5cdFx0XHRjb25zdCBlbmRDaGFyYWN0ZXIgPSAoc3RhcnRDaGFyYWN0ZXIgKyBsZW5ndGgpIHwgMDtcblx0XHRcdGNvbnN0IHRva2VuVHlwZUluZGV4ID0gc3JjRGF0YVtzcmNPZmZzZXQgKyAzXTtcblx0XHRcdGNvbnN0IHRva2VuTW9kaWZpZXJTZXQgPSBzcmNEYXRhW3NyY09mZnNldCArIDRdO1xuXG5cdFx0XHRpZiAoZW5kQ2hhcmFjdGVyIDw9IHN0YXJ0Q2hhcmFjdGVyKSB7XG5cdFx0XHRcdC8vIHRoaXMgdG9rZW4gaXMgaW52YWxpZCAobW9zdCBsaWtlbHkgYSBuZWdhdGl2ZSBsZW5ndGggY2FzdGVkIHRvIHVpbnQzMilcblx0XHRcdFx0c3R5bGluZy53YXJuSW52YWxpZExlbmd0aFNlbWFudGljVG9rZW5zKGxpbmVOdW1iZXIsIHN0YXJ0Q2hhcmFjdGVyICsgMSk7XG5cdFx0XHR9IGVsc2UgaWYgKHByZXZMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyICYmIHByZXZFbmRDaGFyYWN0ZXIgPiBzdGFydENoYXJhY3Rlcikge1xuXHRcdFx0XHQvLyB0aGlzIHRva2VuIG92ZXJsYXBzIHdpdGggdGhlIHByZXZpb3VzIHRva2VuXG5cdFx0XHRcdHN0eWxpbmcud2Fybk92ZXJsYXBwaW5nU2VtYW50aWNUb2tlbnMobGluZU51bWJlciwgc3RhcnRDaGFyYWN0ZXIgKyAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gc3R5bGluZy5nZXRNZXRhZGF0YSh0b2tlblR5cGVJbmRleCwgdG9rZW5Nb2RpZmllclNldCwgbGFuZ3VhZ2VJZCk7XG5cblx0XHRcdFx0aWYgKG1ldGFkYXRhICE9PSBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZ0NvbnN0YW50cy5OT19TVFlMSU5HKSB7XG5cdFx0XHRcdFx0aWYgKGFyZWFMaW5lID09PSAwKSB7XG5cdFx0XHRcdFx0XHRhcmVhTGluZSA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlc3REYXRhW2Rlc3RPZmZzZXRdID0gbGluZU51bWJlciAtIGFyZWFMaW5lO1xuXHRcdFx0XHRcdGRlc3REYXRhW2Rlc3RPZmZzZXQgKyAxXSA9IHN0YXJ0Q2hhcmFjdGVyO1xuXHRcdFx0XHRcdGRlc3REYXRhW2Rlc3RPZmZzZXQgKyAyXSA9IGVuZENoYXJhY3Rlcjtcblx0XHRcdFx0XHRkZXN0RGF0YVtkZXN0T2Zmc2V0ICsgM10gPSBtZXRhZGF0YTtcblx0XHRcdFx0XHRkZXN0T2Zmc2V0ICs9IDQ7XG5cblx0XHRcdFx0XHRwcmV2TGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0cHJldkVuZENoYXJhY3RlciA9IGVuZENoYXJhY3Rlcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsYXN0TGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0XHRsYXN0U3RhcnRDaGFyYWN0ZXIgPSBzdGFydENoYXJhY3Rlcjtcblx0XHRcdHRva2VuSW5kZXgrKztcblx0XHR9XG5cblx0XHRpZiAoZGVzdE9mZnNldCAhPT0gZGVzdERhdGEubGVuZ3RoKSB7XG5cdFx0XHRkZXN0RGF0YSA9IGRlc3REYXRhLnN1YmFycmF5KDAsIGRlc3RPZmZzZXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VucyA9IFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoYXJlYUxpbmUsIGRlc3REYXRhKTtcblx0XHRyZXN1bHQucHVzaCh0b2tlbnMpO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuY2xhc3MgSGFzaFRhYmxlRW50cnkge1xuXHRwdWJsaWMgcmVhZG9ubHkgdG9rZW5UeXBlSW5kZXg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHRva2VuTW9kaWZpZXJTZXQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IG1ldGFkYXRhOiBudW1iZXI7XG5cdHB1YmxpYyBuZXh0OiBIYXNoVGFibGVFbnRyeSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IodG9rZW5UeXBlSW5kZXg6IG51bWJlciwgdG9rZW5Nb2RpZmllclNldDogbnVtYmVyLCBsYW5ndWFnZUlkOiBudW1iZXIsIG1ldGFkYXRhOiBudW1iZXIpIHtcblx0XHR0aGlzLnRva2VuVHlwZUluZGV4ID0gdG9rZW5UeXBlSW5kZXg7XG5cdFx0dGhpcy50b2tlbk1vZGlmaWVyU2V0ID0gdG9rZW5Nb2RpZmllclNldDtcblx0XHR0aGlzLmxhbmd1YWdlSWQgPSBsYW5ndWFnZUlkO1xuXHRcdHRoaXMubWV0YWRhdGEgPSBtZXRhZGF0YTtcblx0XHR0aGlzLm5leHQgPSBudWxsO1xuXHR9XG59XG5cbmNsYXNzIEhhc2hUYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX1NJWkVTID0gWzMsIDcsIDEzLCAzMSwgNjEsIDEyNywgMjUxLCA1MDksIDEwMjEsIDIwMzksIDQwOTMsIDgxOTEsIDE2MzgxLCAzMjc0OSwgNjU1MjEsIDEzMTA3MSwgMjYyMTM5LCA1MjQyODcsIDEwNDg1NzMsIDIwOTcxNDNdO1xuXG5cdHByaXZhdGUgX2VsZW1lbnRzQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfY3VycmVudExlbmd0aEluZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgX2N1cnJlbnRMZW5ndGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfZ3Jvd0NvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgX2VsZW1lbnRzOiAoSGFzaFRhYmxlRW50cnkgfCBudWxsKVtdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2VsZW1lbnRzQ291bnQgPSAwO1xuXHRcdHRoaXMuX2N1cnJlbnRMZW5ndGhJbmRleCA9IDA7XG5cdFx0dGhpcy5fY3VycmVudExlbmd0aCA9IEhhc2hUYWJsZS5fU0laRVNbdGhpcy5fY3VycmVudExlbmd0aEluZGV4XTtcblx0XHR0aGlzLl9ncm93Q291bnQgPSBNYXRoLnJvdW5kKHRoaXMuX2N1cnJlbnRMZW5ndGhJbmRleCArIDEgPCBIYXNoVGFibGUuX1NJWkVTLmxlbmd0aCA/IDIgLyAzICogdGhpcy5fY3VycmVudExlbmd0aCA6IDApO1xuXHRcdHRoaXMuX2VsZW1lbnRzID0gW107XG5cdFx0SGFzaFRhYmxlLl9udWxsT3V0RW50cmllcyh0aGlzLl9lbGVtZW50cywgdGhpcy5fY3VycmVudExlbmd0aCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbnVsbE91dEVudHJpZXMoZW50cmllczogKEhhc2hUYWJsZUVudHJ5IHwgbnVsbClbXSwgbGVuZ3RoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRlbnRyaWVzW2ldID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYXNoMihuMTogbnVtYmVyLCBuMjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKCgobjEgPDwgNSkgLSBuMSkgKyBuMikgfCAwOyAgLy8gbjEgKiAzMSArIG4yLCBrZWVwIGFzIGludDMyXG5cdH1cblxuXHRwcml2YXRlIF9oYXNoRnVuYyh0b2tlblR5cGVJbmRleDogbnVtYmVyLCB0b2tlbk1vZGlmaWVyU2V0OiBudW1iZXIsIGxhbmd1YWdlSWQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhc2gyKHRoaXMuX2hhc2gyKHRva2VuVHlwZUluZGV4LCB0b2tlbk1vZGlmaWVyU2V0KSwgbGFuZ3VhZ2VJZCkgJSB0aGlzLl9jdXJyZW50TGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldCh0b2tlblR5cGVJbmRleDogbnVtYmVyLCB0b2tlbk1vZGlmaWVyU2V0OiBudW1iZXIsIGxhbmd1YWdlSWQ6IG51bWJlcik6IEhhc2hUYWJsZUVudHJ5IHwgbnVsbCB7XG5cdFx0Y29uc3QgaGFzaCA9IHRoaXMuX2hhc2hGdW5jKHRva2VuVHlwZUluZGV4LCB0b2tlbk1vZGlmaWVyU2V0LCBsYW5ndWFnZUlkKTtcblxuXHRcdGxldCBwID0gdGhpcy5fZWxlbWVudHNbaGFzaF07XG5cdFx0d2hpbGUgKHApIHtcblx0XHRcdGlmIChwLnRva2VuVHlwZUluZGV4ID09PSB0b2tlblR5cGVJbmRleCAmJiBwLnRva2VuTW9kaWZpZXJTZXQgPT09IHRva2VuTW9kaWZpZXJTZXQgJiYgcC5sYW5ndWFnZUlkID09PSBsYW5ndWFnZUlkKSB7XG5cdFx0XHRcdHJldHVybiBwO1xuXHRcdFx0fVxuXHRcdFx0cCA9IHAubmV4dDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBhZGQodG9rZW5UeXBlSW5kZXg6IG51bWJlciwgdG9rZW5Nb2RpZmllclNldDogbnVtYmVyLCBsYW5ndWFnZUlkOiBudW1iZXIsIG1ldGFkYXRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9lbGVtZW50c0NvdW50Kys7XG5cdFx0aWYgKHRoaXMuX2dyb3dDb3VudCAhPT0gMCAmJiB0aGlzLl9lbGVtZW50c0NvdW50ID49IHRoaXMuX2dyb3dDb3VudCkge1xuXHRcdFx0Ly8gZXhwYW5kIVxuXHRcdFx0Y29uc3Qgb2xkRWxlbWVudHMgPSB0aGlzLl9lbGVtZW50cztcblxuXHRcdFx0dGhpcy5fY3VycmVudExlbmd0aEluZGV4Kys7XG5cdFx0XHR0aGlzLl9jdXJyZW50TGVuZ3RoID0gSGFzaFRhYmxlLl9TSVpFU1t0aGlzLl9jdXJyZW50TGVuZ3RoSW5kZXhdO1xuXHRcdFx0dGhpcy5fZ3Jvd0NvdW50ID0gTWF0aC5yb3VuZCh0aGlzLl9jdXJyZW50TGVuZ3RoSW5kZXggKyAxIDwgSGFzaFRhYmxlLl9TSVpFUy5sZW5ndGggPyAyIC8gMyAqIHRoaXMuX2N1cnJlbnRMZW5ndGggOiAwKTtcblx0XHRcdHRoaXMuX2VsZW1lbnRzID0gW107XG5cdFx0XHRIYXNoVGFibGUuX251bGxPdXRFbnRyaWVzKHRoaXMuX2VsZW1lbnRzLCB0aGlzLl9jdXJyZW50TGVuZ3RoKTtcblxuXHRcdFx0Zm9yIChjb25zdCBmaXJzdCBvZiBvbGRFbGVtZW50cykge1xuXHRcdFx0XHRsZXQgcCA9IGZpcnN0O1xuXHRcdFx0XHR3aGlsZSAocCkge1xuXHRcdFx0XHRcdGNvbnN0IG9sZE5leHQgPSBwLm5leHQ7XG5cdFx0XHRcdFx0cC5uZXh0ID0gbnVsbDtcblx0XHRcdFx0XHR0aGlzLl9hZGQocCk7XG5cdFx0XHRcdFx0cCA9IG9sZE5leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYWRkKG5ldyBIYXNoVGFibGVFbnRyeSh0b2tlblR5cGVJbmRleCwgdG9rZW5Nb2RpZmllclNldCwgbGFuZ3VhZ2VJZCwgbWV0YWRhdGEpKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZChlbGVtZW50OiBIYXNoVGFibGVFbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IGhhc2ggPSB0aGlzLl9oYXNoRnVuYyhlbGVtZW50LnRva2VuVHlwZUluZGV4LCBlbGVtZW50LnRva2VuTW9kaWZpZXJTZXQsIGVsZW1lbnQubGFuZ3VhZ2VJZCk7XG5cdFx0ZWxlbWVudC5uZXh0ID0gdGhpcy5fZWxlbWVudHNbaGFzaF07XG5cdFx0dGhpcy5fZWxlbWVudHNbaGFzaF0gPSBlbGVtZW50O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsV0FBVyxnQkFBZ0IscUJBQXFCO0FBQ3pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYSxnQkFBZ0I7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFFakMsSUFBVyx5Q0FBWCxrQkFBV0EsNENBQVg7QUFDQyxFQUFBQSxnRkFBQSxnQkFBYSxjQUFiO0FBRFUsU0FBQUE7QUFBQSxHQUFBO0FBSVgsTUFBTSxlQUFlO0FBRWQsSUFBTSxnQ0FBTixNQUFvQztBQUFBLEVBTzFDLFlBQ2tCLFNBQ2UsZUFDRyxrQkFDTCxhQUM3QjtBQUpnQjtBQUNlO0FBQ0c7QUFDTDtBQVIvQixTQUFRLDhCQUE4QjtBQUN0QyxTQUFRLGdDQUFnQztBQUN4QyxTQUFRLDZCQUE2QjtBQVFwQyxTQUFLLGFBQWEsSUFBSSxVQUFVO0FBQUEsRUFDakM7QUFBQSxFQUVPLFlBQVksZ0JBQXdCLGtCQUEwQixZQUE0QjtBQUNoRyxVQUFNLG9CQUFvQixLQUFLLGlCQUFpQixnQkFBZ0IsaUJBQWlCLFVBQVU7QUFDM0YsVUFBTSxRQUFRLEtBQUssV0FBVyxJQUFJLGdCQUFnQixrQkFBa0IsaUJBQWlCO0FBQ3JGLFFBQUk7QUFDSixRQUFJLE9BQU87QUFDVixpQkFBVyxNQUFNO0FBQ2pCLFVBQUksZ0JBQWdCLEtBQUssWUFBWSxTQUFTLE1BQU0sU0FBUyxPQUFPO0FBQ25FLGFBQUssWUFBWSxNQUFNLDBDQUEwQyxjQUFjLE1BQU0sZ0JB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QU87QUFDVCxlQUFLLEtBQUssQ0FBQztBQUNYLGNBQUk7QUFBQSxRQUNMO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLEtBQUssSUFBSSxlQUFlLGdCQUFnQixrQkFBa0IsWUFBWSxRQUFRLENBQUM7QUFBQSxFQUNyRjtBQUFBLEVBRVEsS0FBSyxTQUErQjtBQUMzQyxVQUFNLE9BQU8sS0FBSyxVQUFVLFFBQVEsZ0JBQWdCLFFBQVEsa0JBQWtCLFFBQVEsVUFBVTtBQUNoRyxZQUFRLE9BQU8sS0FBSyxVQUFVLElBQUk7QUFDbEMsU0FBSyxVQUFVLElBQUksSUFBSTtBQUFBLEVBQ3hCO0FBQ0Q7QUE3RU0sV0FFVSxTQUFTLENBQUMsR0FBRyxHQUFHLElBQUksSUFBSSxJQUFJLEtBQUssS0FBSyxLQUFLLE1BQU0sTUFBTSxNQUFNLE1BQU0sT0FBTyxPQUFPLE9BQU8sUUFBUSxRQUFRLFFBQVEsU0FBUyxPQUFPO0FBRmhKLElBQU0sWUFBTjsiLAogICJuYW1lcyI6IFsiU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmdDb25zdGFudHMiLCAiU2VtYW50aWNDb2xvcmluZ0NvbnN0YW50cyIsICJ0b2tlbnMiXQp9Cg==
