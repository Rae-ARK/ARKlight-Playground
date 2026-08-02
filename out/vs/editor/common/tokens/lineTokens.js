import { FontStyle, ColorId, MetadataConsts, TokenMetadata } from "../encodedTokenAttributes.js";
import { OffsetRange } from "../core/ranges/offsetRange.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
const _LineTokens = class _LineTokens {
  constructor(tokens, text, decoder) {
    this._lineTokensBrand = void 0;
    const tokensLength = tokens.length > 1 ? tokens[tokens.length - 2] : 0;
    if (tokensLength !== text.length) {
      onUnexpectedError(new Error("Token length and text length do not match!"));
    }
    this._tokens = tokens;
    this._tokensCount = this._tokens.length >>> 1;
    this._text = text;
    this.languageIdCodec = decoder;
  }
  static createEmpty(lineContent, decoder) {
    const defaultMetadata = _LineTokens.defaultTokenMetadata;
    const tokens = new Uint32Array(2);
    tokens[0] = lineContent.length;
    tokens[1] = defaultMetadata;
    return new _LineTokens(tokens, lineContent, decoder);
  }
  static createFromTextAndMetadata(data, decoder) {
    let offset = 0;
    let fullText = "";
    const tokens = new Array();
    for (const { text, metadata } of data) {
      tokens.push(offset + text.length, metadata);
      offset += text.length;
      fullText += text;
    }
    return new _LineTokens(new Uint32Array(tokens), fullText, decoder);
  }
  static convertToEndOffset(tokens, lineTextLength) {
    const tokenCount = tokens.length >>> 1;
    const lastTokenIndex = tokenCount - 1;
    for (let tokenIndex = 0; tokenIndex < lastTokenIndex; tokenIndex++) {
      tokens[tokenIndex << 1] = tokens[tokenIndex + 1 << 1];
    }
    tokens[lastTokenIndex << 1] = lineTextLength;
  }
  static findIndexInTokensArray(tokens, desiredIndex) {
    if (tokens.length <= 2) {
      return 0;
    }
    let low = 0;
    let high = (tokens.length >>> 1) - 1;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      const endOffset = tokens[mid << 1];
      if (endOffset === desiredIndex) {
        return mid + 1;
      } else if (endOffset < desiredIndex) {
        low = mid + 1;
      } else if (endOffset > desiredIndex) {
        high = mid;
      }
    }
    return low;
  }
  getTextLength() {
    return this._text.length;
  }
  equals(other) {
    if (other instanceof _LineTokens) {
      return this.slicedEquals(other, 0, this._tokensCount);
    }
    return false;
  }
  slicedEquals(other, sliceFromTokenIndex, sliceTokenCount) {
    if (this._text !== other._text) {
      return false;
    }
    if (this._tokensCount !== other._tokensCount) {
      return false;
    }
    const from = sliceFromTokenIndex << 1;
    const to = from + (sliceTokenCount << 1);
    for (let i = from; i < to; i++) {
      if (this._tokens[i] !== other._tokens[i]) {
        return false;
      }
    }
    return true;
  }
  getLineContent() {
    return this._text;
  }
  getCount() {
    return this._tokensCount;
  }
  getStartOffset(tokenIndex) {
    if (tokenIndex > 0) {
      return this._tokens[tokenIndex - 1 << 1];
    }
    return 0;
  }
  getMetadata(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return metadata;
  }
  getLanguageId(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    const languageId = TokenMetadata.getLanguageId(metadata);
    return this.languageIdCodec.decodeLanguageId(languageId);
  }
  getStandardTokenType(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getTokenType(metadata);
  }
  getForeground(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getForeground(metadata);
  }
  getClassName(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getClassNameFromMetadata(metadata);
  }
  getInlineStyle(tokenIndex, colorMap) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getInlineStyleFromMetadata(metadata, colorMap);
  }
  getPresentation(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getPresentationFromMetadata(metadata);
  }
  getEndOffset(tokenIndex) {
    return this._tokens[tokenIndex << 1];
  }
  /**
   * Find the token containing offset `offset`.
   * @param offset The search offset
   * @return The index of the token containing the offset.
   */
  findTokenIndexAtOffset(offset) {
    return _LineTokens.findIndexInTokensArray(this._tokens, offset);
  }
  inflate() {
    return this;
  }
  sliceAndInflate(startOffset, endOffset, deltaOffset) {
    return new SliceLineTokens(this, startOffset, endOffset, deltaOffset);
  }
  sliceZeroCopy(range) {
    return this.sliceAndInflate(range.start, range.endExclusive, 0);
  }
  /**
   * @pure
   * @param insertTokens Must be sorted by offset.
  */
  withInserted(insertTokens) {
    if (insertTokens.length === 0) {
      return this;
    }
    let nextOriginalTokenIdx = 0;
    let nextInsertTokenIdx = 0;
    let text = "";
    const newTokens = new Array();
    let originalEndOffset = 0;
    while (true) {
      const nextOriginalTokenEndOffset = nextOriginalTokenIdx < this._tokensCount ? this._tokens[nextOriginalTokenIdx << 1] : -1;
      const nextInsertToken = nextInsertTokenIdx < insertTokens.length ? insertTokens[nextInsertTokenIdx] : null;
      if (nextOriginalTokenEndOffset !== -1 && (nextInsertToken === null || nextOriginalTokenEndOffset <= nextInsertToken.offset)) {
        text += this._text.substring(originalEndOffset, nextOriginalTokenEndOffset);
        const metadata = this._tokens[(nextOriginalTokenIdx << 1) + 1];
        newTokens.push(text.length, metadata);
        nextOriginalTokenIdx++;
        originalEndOffset = nextOriginalTokenEndOffset;
      } else if (nextInsertToken) {
        if (nextInsertToken.offset > originalEndOffset) {
          text += this._text.substring(originalEndOffset, nextInsertToken.offset);
          const metadata = this._tokens[(nextOriginalTokenIdx << 1) + 1];
          newTokens.push(text.length, metadata);
          originalEndOffset = nextInsertToken.offset;
        }
        text += nextInsertToken.text;
        newTokens.push(text.length, nextInsertToken.tokenMetadata);
        nextInsertTokenIdx++;
      } else {
        break;
      }
    }
    return new _LineTokens(new Uint32Array(newTokens), text, this.languageIdCodec);
  }
  getTokensInRange(range) {
    const builder = new TokenArrayBuilder();
    const startTokenIndex = this.findTokenIndexAtOffset(range.start);
    const endTokenIndex = this.findTokenIndexAtOffset(range.endExclusive);
    for (let tokenIndex = startTokenIndex; tokenIndex <= endTokenIndex; tokenIndex++) {
      const tokenRange = new OffsetRange(this.getStartOffset(tokenIndex), this.getEndOffset(tokenIndex));
      const length = tokenRange.intersectionLength(range);
      if (length > 0) {
        builder.add(length, this.getMetadata(tokenIndex));
      }
    }
    return builder.build();
  }
  getTokenText(tokenIndex) {
    const startOffset = this.getStartOffset(tokenIndex);
    const endOffset = this.getEndOffset(tokenIndex);
    const text = this._text.substring(startOffset, endOffset);
    return text;
  }
  forEach(callback) {
    const tokenCount = this.getCount();
    for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
      callback(tokenIndex);
    }
  }
  toString() {
    let result = "";
    this.forEach((i) => {
      result += `[${this.getTokenText(i)}]{${this.getClassName(i)}}`;
    });
    return result;
  }
};
_LineTokens.defaultTokenMetadata = (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET | ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET | ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET) >>> 0;
let LineTokens = _LineTokens;
class SliceLineTokens {
  constructor(source, startOffset, endOffset, deltaOffset) {
    this._source = source;
    this._startOffset = startOffset;
    this._endOffset = endOffset;
    this._deltaOffset = deltaOffset;
    this._firstTokenIndex = source.findTokenIndexAtOffset(startOffset);
    this.languageIdCodec = source.languageIdCodec;
    this._tokensCount = 0;
    for (let i = this._firstTokenIndex, len = source.getCount(); i < len; i++) {
      const tokenStartOffset = source.getStartOffset(i);
      if (tokenStartOffset >= endOffset) {
        break;
      }
      this._tokensCount++;
    }
  }
  getMetadata(tokenIndex) {
    return this._source.getMetadata(this._firstTokenIndex + tokenIndex);
  }
  getLanguageId(tokenIndex) {
    return this._source.getLanguageId(this._firstTokenIndex + tokenIndex);
  }
  getLineContent() {
    return this._source.getLineContent().substring(this._startOffset, this._endOffset);
  }
  equals(other) {
    if (other instanceof SliceLineTokens) {
      return this._startOffset === other._startOffset && this._endOffset === other._endOffset && this._deltaOffset === other._deltaOffset && this._source.slicedEquals(other._source, this._firstTokenIndex, this._tokensCount);
    }
    return false;
  }
  getCount() {
    return this._tokensCount;
  }
  getStandardTokenType(tokenIndex) {
    return this._source.getStandardTokenType(this._firstTokenIndex + tokenIndex);
  }
  getForeground(tokenIndex) {
    return this._source.getForeground(this._firstTokenIndex + tokenIndex);
  }
  getEndOffset(tokenIndex) {
    const tokenEndOffset = this._source.getEndOffset(this._firstTokenIndex + tokenIndex);
    return Math.min(this._endOffset, tokenEndOffset) - this._startOffset + this._deltaOffset;
  }
  getClassName(tokenIndex) {
    return this._source.getClassName(this._firstTokenIndex + tokenIndex);
  }
  getInlineStyle(tokenIndex, colorMap) {
    return this._source.getInlineStyle(this._firstTokenIndex + tokenIndex, colorMap);
  }
  getPresentation(tokenIndex) {
    return this._source.getPresentation(this._firstTokenIndex + tokenIndex);
  }
  findTokenIndexAtOffset(offset) {
    return this._source.findTokenIndexAtOffset(offset + this._startOffset - this._deltaOffset) - this._firstTokenIndex;
  }
  getTokenText(tokenIndex) {
    const adjustedTokenIndex = this._firstTokenIndex + tokenIndex;
    const tokenStartOffset = this._source.getStartOffset(adjustedTokenIndex);
    const tokenEndOffset = this._source.getEndOffset(adjustedTokenIndex);
    let text = this._source.getTokenText(adjustedTokenIndex);
    if (tokenStartOffset < this._startOffset) {
      text = text.substring(this._startOffset - tokenStartOffset);
    }
    if (tokenEndOffset > this._endOffset) {
      text = text.substring(0, text.length - (tokenEndOffset - this._endOffset));
    }
    return text;
  }
  forEach(callback) {
    for (let tokenIndex = 0; tokenIndex < this.getCount(); tokenIndex++) {
      callback(tokenIndex);
    }
  }
}
function getStandardTokenTypeAtPosition(model, position) {
  const lineNumber = position.lineNumber;
  if (!model.tokenization.isCheapToTokenize(lineNumber)) {
    return void 0;
  }
  model.tokenization.forceTokenization(lineNumber);
  const lineTokens = model.tokenization.getLineTokens(lineNumber);
  const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
  const tokenType = lineTokens.getStandardTokenType(tokenIndex);
  return tokenType;
}
class TokenArray {
  constructor(_tokenInfo) {
    this._tokenInfo = _tokenInfo;
  }
  static fromLineTokens(lineTokens) {
    const tokenInfo = [];
    for (let i = 0; i < lineTokens.getCount(); i++) {
      tokenInfo.push(new TokenInfo(lineTokens.getEndOffset(i) - lineTokens.getStartOffset(i), lineTokens.getMetadata(i)));
    }
    return TokenArray.create(tokenInfo);
  }
  static create(tokenInfo) {
    return new TokenArray(tokenInfo);
  }
  toLineTokens(lineContent, decoder) {
    return LineTokens.createFromTextAndMetadata(this.map((r, t) => ({ text: r.substring(lineContent), metadata: t.metadata })), decoder);
  }
  forEach(cb) {
    let lengthSum = 0;
    for (const tokenInfo of this._tokenInfo) {
      const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
      cb(range, tokenInfo);
      lengthSum += tokenInfo.length;
    }
  }
  map(cb) {
    const result = [];
    let lengthSum = 0;
    for (const tokenInfo of this._tokenInfo) {
      const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
      result.push(cb(range, tokenInfo));
      lengthSum += tokenInfo.length;
    }
    return result;
  }
  slice(range) {
    const result = [];
    let lengthSum = 0;
    for (const tokenInfo of this._tokenInfo) {
      const tokenStart = lengthSum;
      const tokenEndEx = tokenStart + tokenInfo.length;
      if (tokenEndEx > range.start) {
        if (tokenStart >= range.endExclusive) {
          break;
        }
        const deltaBefore = Math.max(0, range.start - tokenStart);
        const deltaAfter = Math.max(0, tokenEndEx - range.endExclusive);
        result.push(new TokenInfo(tokenInfo.length - deltaBefore - deltaAfter, tokenInfo.metadata));
      }
      lengthSum += tokenInfo.length;
    }
    return TokenArray.create(result);
  }
  append(other) {
    const result = this._tokenInfo.concat(other._tokenInfo);
    return TokenArray.create(result);
  }
}
class TokenInfo {
  constructor(length, metadata) {
    this.length = length;
    this.metadata = metadata;
  }
}
class TokenArrayBuilder {
  constructor() {
    this._tokens = [];
  }
  add(length, metadata) {
    this._tokens.push(new TokenInfo(length, metadata));
  }
  build() {
    return TokenArray.create(this._tokens);
  }
}
export {
  LineTokens,
  TokenArray,
  TokenArrayBuilder,
  TokenInfo,
  getStandardTokenTypeAtPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTGFuZ3VhZ2VJZENvZGVjIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEZvbnRTdHlsZSwgQ29sb3JJZCwgU3RhbmRhcmRUb2tlblR5cGUsIE1ldGFkYXRhQ29uc3RzLCBJVG9rZW5QcmVzZW50YXRpb24sIFRva2VuTWV0YWRhdGEgfSBmcm9tICcuLi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdMaW5lVG9rZW5zIHtcblx0bGFuZ3VhZ2VJZENvZGVjOiBJTGFuZ3VhZ2VJZENvZGVjO1xuXHRlcXVhbHMob3RoZXI6IElWaWV3TGluZVRva2Vucyk6IGJvb2xlYW47XG5cdGdldENvdW50KCk6IG51bWJlcjtcblx0Z2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleDogbnVtYmVyKTogU3RhbmRhcmRUb2tlblR5cGU7XG5cdGdldEZvcmVncm91bmQodG9rZW5JbmRleDogbnVtYmVyKTogQ29sb3JJZDtcblx0Z2V0RW5kT2Zmc2V0KHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0Q2xhc3NOYW1lKHRva2VuSW5kZXg6IG51bWJlcik6IHN0cmluZztcblx0Z2V0SW5saW5lU3R5bGUodG9rZW5JbmRleDogbnVtYmVyLCBjb2xvck1hcDogc3RyaW5nW10pOiBzdHJpbmc7XG5cdGdldFByZXNlbnRhdGlvbih0b2tlbkluZGV4OiBudW1iZXIpOiBJVG9rZW5QcmVzZW50YXRpb247XG5cdGZpbmRUb2tlbkluZGV4QXRPZmZzZXQob2Zmc2V0OiBudW1iZXIpOiBudW1iZXI7XG5cdGdldExpbmVDb250ZW50KCk6IHN0cmluZztcblx0Z2V0TWV0YWRhdGEodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXRMYW5ndWFnZUlkKHRva2VuSW5kZXg6IG51bWJlcik6IHN0cmluZztcblx0Z2V0VG9rZW5UZXh0KHRva2VuSW5kZXg6IG51bWJlcik6IHN0cmluZztcblx0Zm9yRWFjaChjYWxsYmFjazogKHRva2VuSW5kZXg6IG51bWJlcikgPT4gdm9pZCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5lVG9rZW5zIGltcGxlbWVudHMgSVZpZXdMaW5lVG9rZW5zIHtcblx0cHVibGljIHN0YXRpYyBjcmVhdGVFbXB0eShsaW5lQ29udGVudDogc3RyaW5nLCBkZWNvZGVyOiBJTGFuZ3VhZ2VJZENvZGVjKTogTGluZVRva2VucyB7XG5cdFx0Y29uc3QgZGVmYXVsdE1ldGFkYXRhID0gTGluZVRva2Vucy5kZWZhdWx0VG9rZW5NZXRhZGF0YTtcblxuXHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheSgyKTtcblx0XHR0b2tlbnNbMF0gPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cdFx0dG9rZW5zWzFdID0gZGVmYXVsdE1ldGFkYXRhO1xuXG5cdFx0cmV0dXJuIG5ldyBMaW5lVG9rZW5zKHRva2VucywgbGluZUNvbnRlbnQsIGRlY29kZXIpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGVGcm9tVGV4dEFuZE1ldGFkYXRhKGRhdGE6IHsgdGV4dDogc3RyaW5nOyBtZXRhZGF0YTogbnVtYmVyIH1bXSwgZGVjb2RlcjogSUxhbmd1YWdlSWRDb2RlYyk6IExpbmVUb2tlbnMge1xuXHRcdGxldCBvZmZzZXQ6IG51bWJlciA9IDA7XG5cdFx0bGV0IGZ1bGxUZXh0OiBzdHJpbmcgPSAnJztcblx0XHRjb25zdCB0b2tlbnMgPSBuZXcgQXJyYXk8bnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgeyB0ZXh0LCBtZXRhZGF0YSB9IG9mIGRhdGEpIHtcblx0XHRcdHRva2Vucy5wdXNoKG9mZnNldCArIHRleHQubGVuZ3RoLCBtZXRhZGF0YSk7XG5cdFx0XHRvZmZzZXQgKz0gdGV4dC5sZW5ndGg7XG5cdFx0XHRmdWxsVGV4dCArPSB0ZXh0O1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KHRva2VucyksIGZ1bGxUZXh0LCBkZWNvZGVyKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29udmVydFRvRW5kT2Zmc2V0KHRva2VuczogVWludDMyQXJyYXksIGxpbmVUZXh0TGVuZ3RoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0b2tlbkNvdW50ID0gKHRva2Vucy5sZW5ndGggPj4+IDEpO1xuXHRcdGNvbnN0IGxhc3RUb2tlbkluZGV4ID0gdG9rZW5Db3VudCAtIDE7XG5cdFx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDA7IHRva2VuSW5kZXggPCBsYXN0VG9rZW5JbmRleDsgdG9rZW5JbmRleCsrKSB7XG5cdFx0XHR0b2tlbnNbdG9rZW5JbmRleCA8PCAxXSA9IHRva2Vuc1sodG9rZW5JbmRleCArIDEpIDw8IDFdO1xuXHRcdH1cblx0XHR0b2tlbnNbbGFzdFRva2VuSW5kZXggPDwgMV0gPSBsaW5lVGV4dExlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZmluZEluZGV4SW5Ub2tlbnNBcnJheSh0b2tlbnM6IFVpbnQzMkFycmF5LCBkZXNpcmVkSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHRva2Vucy5sZW5ndGggPD0gMikge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0bGV0IGxvdyA9IDA7XG5cdFx0bGV0IGhpZ2ggPSAodG9rZW5zLmxlbmd0aCA+Pj4gMSkgLSAxO1xuXG5cdFx0d2hpbGUgKGxvdyA8IGhpZ2gpIHtcblxuXHRcdFx0Y29uc3QgbWlkID0gbG93ICsgTWF0aC5mbG9vcigoaGlnaCAtIGxvdykgLyAyKTtcblx0XHRcdGNvbnN0IGVuZE9mZnNldCA9IHRva2Vuc1sobWlkIDw8IDEpXTtcblxuXHRcdFx0aWYgKGVuZE9mZnNldCA9PT0gZGVzaXJlZEluZGV4KSB7XG5cdFx0XHRcdHJldHVybiBtaWQgKyAxO1xuXHRcdFx0fSBlbHNlIGlmIChlbmRPZmZzZXQgPCBkZXNpcmVkSW5kZXgpIHtcblx0XHRcdFx0bG93ID0gbWlkICsgMTtcblx0XHRcdH0gZWxzZSBpZiAoZW5kT2Zmc2V0ID4gZGVzaXJlZEluZGV4KSB7XG5cdFx0XHRcdGhpZ2ggPSBtaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvdztcblx0fVxuXG5cdF9saW5lVG9rZW5zQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5zOiBVaW50MzJBcnJheTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5zQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dDogc3RyaW5nO1xuXG5cdHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkQ29kZWM6IElMYW5ndWFnZUlkQ29kZWM7XG5cblx0cHVibGljIHN0YXRpYyBkZWZhdWx0VG9rZW5NZXRhZGF0YSA9IChcblx0XHQoRm9udFN0eWxlLk5vbmUgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQpXG5cdFx0fCAoQ29sb3JJZC5EZWZhdWx0Rm9yZWdyb3VuZCA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHR8IChDb2xvcklkLkRlZmF1bHRCYWNrZ3JvdW5kIDw8IE1ldGFkYXRhQ29uc3RzLkJBQ0tHUk9VTkRfT0ZGU0VUKVxuXHQpID4+PiAwO1xuXG5cdGNvbnN0cnVjdG9yKHRva2VuczogVWludDMyQXJyYXksIHRleHQ6IHN0cmluZywgZGVjb2RlcjogSUxhbmd1YWdlSWRDb2RlYykge1xuXHRcdGNvbnN0IHRva2Vuc0xlbmd0aCA9IHRva2Vucy5sZW5ndGggPiAxID8gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAyXSA6IDA7XG5cdFx0aWYgKHRva2Vuc0xlbmd0aCAhPT0gdGV4dC5sZW5ndGgpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBFcnJvcignVG9rZW4gbGVuZ3RoIGFuZCB0ZXh0IGxlbmd0aCBkbyBub3QgbWF0Y2ghJykpO1xuXHRcdH1cblx0XHR0aGlzLl90b2tlbnMgPSB0b2tlbnM7XG5cdFx0dGhpcy5fdG9rZW5zQ291bnQgPSAodGhpcy5fdG9rZW5zLmxlbmd0aCA+Pj4gMSk7XG5cdFx0dGhpcy5fdGV4dCA9IHRleHQ7XG5cdFx0dGhpcy5sYW5ndWFnZUlkQ29kZWMgPSBkZWNvZGVyO1xuXHR9XG5cblx0cHVibGljIGdldFRleHRMZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdGV4dC5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBJVmlld0xpbmVUb2tlbnMpOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIgaW5zdGFuY2VvZiBMaW5lVG9rZW5zKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zbGljZWRFcXVhbHMob3RoZXIsIDAsIHRoaXMuX3Rva2Vuc0NvdW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHNsaWNlZEVxdWFscyhvdGhlcjogTGluZVRva2Vucywgc2xpY2VGcm9tVG9rZW5JbmRleDogbnVtYmVyLCBzbGljZVRva2VuQ291bnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl90ZXh0ICE9PSBvdGhlci5fdGV4dCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdG9rZW5zQ291bnQgIT09IG90aGVyLl90b2tlbnNDb3VudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBmcm9tID0gKHNsaWNlRnJvbVRva2VuSW5kZXggPDwgMSk7XG5cdFx0Y29uc3QgdG8gPSBmcm9tICsgKHNsaWNlVG9rZW5Db3VudCA8PCAxKTtcblx0XHRmb3IgKGxldCBpID0gZnJvbTsgaSA8IHRvOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLl90b2tlbnNbaV0gIT09IG90aGVyLl90b2tlbnNbaV0pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90ZXh0O1xuXHR9XG5cblx0cHVibGljIGdldENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2Vuc0NvdW50O1xuXHR9XG5cblx0cHVibGljIGdldFN0YXJ0T2Zmc2V0KHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHRva2VuSW5kZXggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zWyh0b2tlbkluZGV4IC0gMSkgPDwgMV07XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHVibGljIGdldE1ldGFkYXRhKHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl90b2tlbnNbKHRva2VuSW5kZXggPDwgMSkgKyAxXTtcblx0XHRyZXR1cm4gbWV0YWRhdGE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fdG9rZW5zWyh0b2tlbkluZGV4IDw8IDEpICsgMV07XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IFRva2VuTWV0YWRhdGEuZ2V0TGFuZ3VhZ2VJZChtZXRhZGF0YSk7XG5cdFx0cmV0dXJuIHRoaXMubGFuZ3VhZ2VJZENvZGVjLmRlY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleDogbnVtYmVyKTogU3RhbmRhcmRUb2tlblR5cGUge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fdG9rZW5zWyh0b2tlbkluZGV4IDw8IDEpICsgMV07XG5cdFx0cmV0dXJuIFRva2VuTWV0YWRhdGEuZ2V0VG9rZW5UeXBlKG1ldGFkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGb3JlZ3JvdW5kKHRva2VuSW5kZXg6IG51bWJlcik6IENvbG9ySWQge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fdG9rZW5zWyh0b2tlbkluZGV4IDw8IDEpICsgMV07XG5cdFx0cmV0dXJuIFRva2VuTWV0YWRhdGEuZ2V0Rm9yZWdyb3VuZChtZXRhZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2xhc3NOYW1lKHRva2VuSW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl90b2tlbnNbKHRva2VuSW5kZXggPDwgMSkgKyAxXTtcblx0XHRyZXR1cm4gVG9rZW5NZXRhZGF0YS5nZXRDbGFzc05hbWVGcm9tTWV0YWRhdGEobWV0YWRhdGEpO1xuXHR9XG5cblx0cHVibGljIGdldElubGluZVN0eWxlKHRva2VuSW5kZXg6IG51bWJlciwgY29sb3JNYXA6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX3Rva2Vuc1sodG9rZW5JbmRleCA8PCAxKSArIDFdO1xuXHRcdHJldHVybiBUb2tlbk1ldGFkYXRhLmdldElubGluZVN0eWxlRnJvbU1ldGFkYXRhKG1ldGFkYXRhLCBjb2xvck1hcCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJlc2VudGF0aW9uKHRva2VuSW5kZXg6IG51bWJlcik6IElUb2tlblByZXNlbnRhdGlvbiB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl90b2tlbnNbKHRva2VuSW5kZXggPDwgMSkgKyAxXTtcblx0XHRyZXR1cm4gVG9rZW5NZXRhZGF0YS5nZXRQcmVzZW50YXRpb25Gcm9tTWV0YWRhdGEobWV0YWRhdGEpO1xuXHR9XG5cblx0cHVibGljIGdldEVuZE9mZnNldCh0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbdG9rZW5JbmRleCA8PCAxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIHRoZSB0b2tlbiBjb250YWluaW5nIG9mZnNldCBgb2Zmc2V0YC5cblx0ICogQHBhcmFtIG9mZnNldCBUaGUgc2VhcmNoIG9mZnNldFxuXHQgKiBAcmV0dXJuIFRoZSBpbmRleCBvZiB0aGUgdG9rZW4gY29udGFpbmluZyB0aGUgb2Zmc2V0LlxuXHQgKi9cblx0cHVibGljIGZpbmRUb2tlbkluZGV4QXRPZmZzZXQob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBMaW5lVG9rZW5zLmZpbmRJbmRleEluVG9rZW5zQXJyYXkodGhpcy5fdG9rZW5zLCBvZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGluZmxhdGUoKTogSVZpZXdMaW5lVG9rZW5zIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBzbGljZUFuZEluZmxhdGUoc3RhcnRPZmZzZXQ6IG51bWJlciwgZW5kT2Zmc2V0OiBudW1iZXIsIGRlbHRhT2Zmc2V0OiBudW1iZXIpOiBJVmlld0xpbmVUb2tlbnMge1xuXHRcdHJldHVybiBuZXcgU2xpY2VMaW5lVG9rZW5zKHRoaXMsIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQsIGRlbHRhT2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBzbGljZVplcm9Db3B5KHJhbmdlOiBPZmZzZXRSYW5nZSk6IElWaWV3TGluZVRva2VucyB7XG5cdFx0cmV0dXJuIHRoaXMuc2xpY2VBbmRJbmZsYXRlKHJhbmdlLnN0YXJ0LCByYW5nZS5lbmRFeGNsdXNpdmUsIDApO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwdXJlXG5cdCAqIEBwYXJhbSBpbnNlcnRUb2tlbnMgTXVzdCBiZSBzb3J0ZWQgYnkgb2Zmc2V0LlxuXHQqL1xuXHRwdWJsaWMgd2l0aEluc2VydGVkKGluc2VydFRva2VuczogeyBvZmZzZXQ6IG51bWJlcjsgdGV4dDogc3RyaW5nOyB0b2tlbk1ldGFkYXRhOiBudW1iZXIgfVtdKTogTGluZVRva2VucyB7XG5cdFx0aWYgKGluc2VydFRva2Vucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGxldCBuZXh0T3JpZ2luYWxUb2tlbklkeCA9IDA7XG5cdFx0bGV0IG5leHRJbnNlcnRUb2tlbklkeCA9IDA7XG5cdFx0bGV0IHRleHQgPSAnJztcblx0XHRjb25zdCBuZXdUb2tlbnMgPSBuZXcgQXJyYXk8bnVtYmVyPigpO1xuXG5cdFx0bGV0IG9yaWdpbmFsRW5kT2Zmc2V0ID0gMDtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmV4dE9yaWdpbmFsVG9rZW5FbmRPZmZzZXQgPSBuZXh0T3JpZ2luYWxUb2tlbklkeCA8IHRoaXMuX3Rva2Vuc0NvdW50ID8gdGhpcy5fdG9rZW5zW25leHRPcmlnaW5hbFRva2VuSWR4IDw8IDFdIDogLTE7XG5cdFx0XHRjb25zdCBuZXh0SW5zZXJ0VG9rZW4gPSBuZXh0SW5zZXJ0VG9rZW5JZHggPCBpbnNlcnRUb2tlbnMubGVuZ3RoID8gaW5zZXJ0VG9rZW5zW25leHRJbnNlcnRUb2tlbklkeF0gOiBudWxsO1xuXG5cdFx0XHRpZiAobmV4dE9yaWdpbmFsVG9rZW5FbmRPZmZzZXQgIT09IC0xICYmIChuZXh0SW5zZXJ0VG9rZW4gPT09IG51bGwgfHwgbmV4dE9yaWdpbmFsVG9rZW5FbmRPZmZzZXQgPD0gbmV4dEluc2VydFRva2VuLm9mZnNldCkpIHtcblx0XHRcdFx0Ly8gb3JpZ2luYWwgdG9rZW4gZW5kcyBiZWZvcmUgbmV4dCBpbnNlcnQgdG9rZW5cblx0XHRcdFx0dGV4dCArPSB0aGlzLl90ZXh0LnN1YnN0cmluZyhvcmlnaW5hbEVuZE9mZnNldCwgbmV4dE9yaWdpbmFsVG9rZW5FbmRPZmZzZXQpO1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX3Rva2Vuc1sobmV4dE9yaWdpbmFsVG9rZW5JZHggPDwgMSkgKyAxXTtcblx0XHRcdFx0bmV3VG9rZW5zLnB1c2godGV4dC5sZW5ndGgsIG1ldGFkYXRhKTtcblx0XHRcdFx0bmV4dE9yaWdpbmFsVG9rZW5JZHgrKztcblx0XHRcdFx0b3JpZ2luYWxFbmRPZmZzZXQgPSBuZXh0T3JpZ2luYWxUb2tlbkVuZE9mZnNldDtcblxuXHRcdFx0fSBlbHNlIGlmIChuZXh0SW5zZXJ0VG9rZW4pIHtcblx0XHRcdFx0aWYgKG5leHRJbnNlcnRUb2tlbi5vZmZzZXQgPiBvcmlnaW5hbEVuZE9mZnNldCkge1xuXHRcdFx0XHRcdC8vIGluc2VydCB0b2tlbiBpcyBpbiB0aGUgbWlkZGxlIG9mIHRoZSBuZXh0IHRva2VuLlxuXHRcdFx0XHRcdHRleHQgKz0gdGhpcy5fdGV4dC5zdWJzdHJpbmcob3JpZ2luYWxFbmRPZmZzZXQsIG5leHRJbnNlcnRUb2tlbi5vZmZzZXQpO1xuXHRcdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fdG9rZW5zWyhuZXh0T3JpZ2luYWxUb2tlbklkeCA8PCAxKSArIDFdO1xuXHRcdFx0XHRcdG5ld1Rva2Vucy5wdXNoKHRleHQubGVuZ3RoLCBtZXRhZGF0YSk7XG5cdFx0XHRcdFx0b3JpZ2luYWxFbmRPZmZzZXQgPSBuZXh0SW5zZXJ0VG9rZW4ub2Zmc2V0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGV4dCArPSBuZXh0SW5zZXJ0VG9rZW4udGV4dDtcblx0XHRcdFx0bmV3VG9rZW5zLnB1c2godGV4dC5sZW5ndGgsIG5leHRJbnNlcnRUb2tlbi50b2tlbk1ldGFkYXRhKTtcblx0XHRcdFx0bmV4dEluc2VydFRva2VuSWR4Kys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KG5ld1Rva2VucyksIHRleHQsIHRoaXMubGFuZ3VhZ2VJZENvZGVjKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlbnNJblJhbmdlKHJhbmdlOiBPZmZzZXRSYW5nZSk6IFRva2VuQXJyYXkge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgVG9rZW5BcnJheUJ1aWxkZXIoKTtcblxuXHRcdGNvbnN0IHN0YXJ0VG9rZW5JbmRleCA9IHRoaXMuZmluZFRva2VuSW5kZXhBdE9mZnNldChyYW5nZS5zdGFydCk7XG5cdFx0Y29uc3QgZW5kVG9rZW5JbmRleCA9IHRoaXMuZmluZFRva2VuSW5kZXhBdE9mZnNldChyYW5nZS5lbmRFeGNsdXNpdmUpO1xuXG5cdFx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IHN0YXJ0VG9rZW5JbmRleDsgdG9rZW5JbmRleCA8PSBlbmRUb2tlbkluZGV4OyB0b2tlbkluZGV4KyspIHtcblx0XHRcdGNvbnN0IHRva2VuUmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2UodGhpcy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KSwgdGhpcy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCkpO1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gdG9rZW5SYW5nZS5pbnRlcnNlY3Rpb25MZW5ndGgocmFuZ2UpO1xuXHRcdFx0aWYgKGxlbmd0aCA+IDApIHtcblx0XHRcdFx0YnVpbGRlci5hZGQobGVuZ3RoLCB0aGlzLmdldE1ldGFkYXRhKHRva2VuSW5kZXgpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYnVpbGRlci5idWlsZCgpO1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuVGV4dCh0b2tlbkluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fdGV4dC5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIGVuZE9mZnNldCk7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRwdWJsaWMgZm9yRWFjaChjYWxsYmFjazogKHRva2VuSW5kZXg6IG51bWJlcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRva2VuQ291bnQgPSB0aGlzLmdldENvdW50KCk7XG5cdFx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDA7IHRva2VuSW5kZXggPCB0b2tlbkNvdW50OyB0b2tlbkluZGV4KyspIHtcblx0XHRcdGNhbGxiYWNrKHRva2VuSW5kZXgpO1xuXHRcdH1cblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9ICcnO1xuXHRcdHRoaXMuZm9yRWFjaCgoaSkgPT4ge1xuXHRcdFx0cmVzdWx0ICs9IGBbJHt0aGlzLmdldFRva2VuVGV4dChpKX1deyR7dGhpcy5nZXRDbGFzc05hbWUoaSl9fWA7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBTbGljZUxpbmVUb2tlbnMgaW1wbGVtZW50cyBJVmlld0xpbmVUb2tlbnMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NvdXJjZTogTGluZVRva2Vucztcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRPZmZzZXQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5kT2Zmc2V0OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbHRhT2Zmc2V0OiBudW1iZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZmlyc3RUb2tlbkluZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2Vuc0NvdW50OiBudW1iZXI7XG5cblx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWRDb2RlYzogSUxhbmd1YWdlSWRDb2RlYztcblxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IExpbmVUb2tlbnMsIHN0YXJ0T2Zmc2V0OiBudW1iZXIsIGVuZE9mZnNldDogbnVtYmVyLCBkZWx0YU9mZnNldDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuX3N0YXJ0T2Zmc2V0ID0gc3RhcnRPZmZzZXQ7XG5cdFx0dGhpcy5fZW5kT2Zmc2V0ID0gZW5kT2Zmc2V0O1xuXHRcdHRoaXMuX2RlbHRhT2Zmc2V0ID0gZGVsdGFPZmZzZXQ7XG5cdFx0dGhpcy5fZmlyc3RUb2tlbkluZGV4ID0gc291cmNlLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQoc3RhcnRPZmZzZXQpO1xuXHRcdHRoaXMubGFuZ3VhZ2VJZENvZGVjID0gc291cmNlLmxhbmd1YWdlSWRDb2RlYztcblxuXHRcdHRoaXMuX3Rva2Vuc0NvdW50ID0gMDtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5fZmlyc3RUb2tlbkluZGV4LCBsZW4gPSBzb3VyY2UuZ2V0Q291bnQoKTsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCB0b2tlblN0YXJ0T2Zmc2V0ID0gc291cmNlLmdldFN0YXJ0T2Zmc2V0KGkpO1xuXHRcdFx0aWYgKHRva2VuU3RhcnRPZmZzZXQgPj0gZW5kT2Zmc2V0KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdG9rZW5zQ291bnQrKztcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWV0YWRhdGEodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmdldE1ldGFkYXRhKHRoaXMuX2ZpcnN0VG9rZW5JbmRleCArIHRva2VuSW5kZXgpO1xuXHR9XG5cblx0cHVibGljIGdldExhbmd1YWdlSWQodG9rZW5JbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmdldExhbmd1YWdlSWQodGhpcy5fZmlyc3RUb2tlbkluZGV4ICsgdG9rZW5JbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmdldExpbmVDb250ZW50KCkuc3Vic3RyaW5nKHRoaXMuX3N0YXJ0T2Zmc2V0LCB0aGlzLl9lbmRPZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogSVZpZXdMaW5lVG9rZW5zKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyIGluc3RhbmNlb2YgU2xpY2VMaW5lVG9rZW5zKSB7XG5cdFx0XHRyZXR1cm4gKFxuXHRcdFx0XHR0aGlzLl9zdGFydE9mZnNldCA9PT0gb3RoZXIuX3N0YXJ0T2Zmc2V0XG5cdFx0XHRcdCYmIHRoaXMuX2VuZE9mZnNldCA9PT0gb3RoZXIuX2VuZE9mZnNldFxuXHRcdFx0XHQmJiB0aGlzLl9kZWx0YU9mZnNldCA9PT0gb3RoZXIuX2RlbHRhT2Zmc2V0XG5cdFx0XHRcdCYmIHRoaXMuX3NvdXJjZS5zbGljZWRFcXVhbHMob3RoZXIuX3NvdXJjZSwgdGhpcy5fZmlyc3RUb2tlbkluZGV4LCB0aGlzLl90b2tlbnNDb3VudClcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNDb3VudDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4OiBudW1iZXIpOiBTdGFuZGFyZFRva2VuVHlwZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5nZXRTdGFuZGFyZFRva2VuVHlwZSh0aGlzLl9maXJzdFRva2VuSW5kZXggKyB0b2tlbkluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGb3JlZ3JvdW5kKHRva2VuSW5kZXg6IG51bWJlcik6IENvbG9ySWQge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuZ2V0Rm9yZWdyb3VuZCh0aGlzLl9maXJzdFRva2VuSW5kZXggKyB0b2tlbkluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmRPZmZzZXQodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCB0b2tlbkVuZE9mZnNldCA9IHRoaXMuX3NvdXJjZS5nZXRFbmRPZmZzZXQodGhpcy5fZmlyc3RUb2tlbkluZGV4ICsgdG9rZW5JbmRleCk7XG5cdFx0cmV0dXJuIE1hdGgubWluKHRoaXMuX2VuZE9mZnNldCwgdG9rZW5FbmRPZmZzZXQpIC0gdGhpcy5fc3RhcnRPZmZzZXQgKyB0aGlzLl9kZWx0YU9mZnNldDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDbGFzc05hbWUodG9rZW5JbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmdldENsYXNzTmFtZSh0aGlzLl9maXJzdFRva2VuSW5kZXggKyB0b2tlbkluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmxpbmVTdHlsZSh0b2tlbkluZGV4OiBudW1iZXIsIGNvbG9yTWFwOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5nZXRJbmxpbmVTdHlsZSh0aGlzLl9maXJzdFRva2VuSW5kZXggKyB0b2tlbkluZGV4LCBjb2xvck1hcCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJlc2VudGF0aW9uKHRva2VuSW5kZXg6IG51bWJlcik6IElUb2tlblByZXNlbnRhdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5nZXRQcmVzZW50YXRpb24odGhpcy5fZmlyc3RUb2tlbkluZGV4ICsgdG9rZW5JbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZmluZFRva2VuSW5kZXhBdE9mZnNldChvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KG9mZnNldCArIHRoaXMuX3N0YXJ0T2Zmc2V0IC0gdGhpcy5fZGVsdGFPZmZzZXQpIC0gdGhpcy5fZmlyc3RUb2tlbkluZGV4O1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuVGV4dCh0b2tlbkluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGFkanVzdGVkVG9rZW5JbmRleCA9IHRoaXMuX2ZpcnN0VG9rZW5JbmRleCArIHRva2VuSW5kZXg7XG5cdFx0Y29uc3QgdG9rZW5TdGFydE9mZnNldCA9IHRoaXMuX3NvdXJjZS5nZXRTdGFydE9mZnNldChhZGp1c3RlZFRva2VuSW5kZXgpO1xuXHRcdGNvbnN0IHRva2VuRW5kT2Zmc2V0ID0gdGhpcy5fc291cmNlLmdldEVuZE9mZnNldChhZGp1c3RlZFRva2VuSW5kZXgpO1xuXHRcdGxldCB0ZXh0ID0gdGhpcy5fc291cmNlLmdldFRva2VuVGV4dChhZGp1c3RlZFRva2VuSW5kZXgpO1xuXHRcdGlmICh0b2tlblN0YXJ0T2Zmc2V0IDwgdGhpcy5fc3RhcnRPZmZzZXQpIHtcblx0XHRcdHRleHQgPSB0ZXh0LnN1YnN0cmluZyh0aGlzLl9zdGFydE9mZnNldCAtIHRva2VuU3RhcnRPZmZzZXQpO1xuXHRcdH1cblx0XHRpZiAodG9rZW5FbmRPZmZzZXQgPiB0aGlzLl9lbmRPZmZzZXQpIHtcblx0XHRcdHRleHQgPSB0ZXh0LnN1YnN0cmluZygwLCB0ZXh0Lmxlbmd0aCAtICh0b2tlbkVuZE9mZnNldCAtIHRoaXMuX2VuZE9mZnNldCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdHB1YmxpYyBmb3JFYWNoKGNhbGxiYWNrOiAodG9rZW5JbmRleDogbnVtYmVyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDA7IHRva2VuSW5kZXggPCB0aGlzLmdldENvdW50KCk7IHRva2VuSW5kZXgrKykge1xuXHRcdFx0Y2FsbGJhY2sodG9rZW5JbmRleCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTdGFuZGFyZFRva2VuVHlwZUF0UG9zaXRpb24obW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBJUG9zaXRpb24pOiBTdGFuZGFyZFRva2VuVHlwZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRpZiAoIW1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShsaW5lTnVtYmVyKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRjb25zdCBsaW5lVG9rZW5zID0gbW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdGNvbnN0IHRva2VuSW5kZXggPSBsaW5lVG9rZW5zLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdGNvbnN0IHRva2VuVHlwZSA9IGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCk7XG5cdHJldHVybiB0b2tlblR5cGU7XG59XG5cblxuXG4vKipcbiAqIFRoaXMgY2xhc3MgcmVwcmVzZW50cyBhIHNlcXVlbmNlIG9mIHRva2Vucy5cbiAqIENvbmNlcHR1YWxseSwgZWFjaCB0b2tlbiBoYXMgYSBsZW5ndGggYW5kIGEgbWV0YWRhdGEgbnVtYmVyLlxuICogQSB0b2tlbiBhcnJheSBtaWdodCBiZSB1c2VkIHRvIGFubm90YXRlIGEgc3RyaW5nIHdpdGggbWV0YWRhdGEuXG4gKiBVc2Uge0BsaW5rIFRva2VuQXJyYXlCdWlsZGVyfSB0byBlZmZpY2llbnRseSBjcmVhdGUgYSB0b2tlbiBhcnJheS5cbiAqXG4gKiBUT0RPOiBNYWtlIHRoaXMgY2xhc3MgbW9yZSBlZmZpY2llbnQgKGUuZy4gYnkgdXNpbmcgYSBJbnQzMkFycmF5KS5cbiovXG5leHBvcnQgY2xhc3MgVG9rZW5BcnJheSB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbUxpbmVUb2tlbnMobGluZVRva2VuczogTGluZVRva2Vucyk6IFRva2VuQXJyYXkge1xuXHRcdGNvbnN0IHRva2VuSW5mbzogVG9rZW5JbmZvW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTsgaSsrKSB7XG5cdFx0XHR0b2tlbkluZm8ucHVzaChuZXcgVG9rZW5JbmZvKGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KGkpIC0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldChpKSwgbGluZVRva2Vucy5nZXRNZXRhZGF0YShpKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gVG9rZW5BcnJheS5jcmVhdGUodG9rZW5JbmZvKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKHRva2VuSW5mbzogVG9rZW5JbmZvW10pOiBUb2tlbkFycmF5IHtcblx0XHRyZXR1cm4gbmV3IFRva2VuQXJyYXkodG9rZW5JbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5JbmZvOiBUb2tlbkluZm9bXVxuXHQpIHsgfVxuXG5cdHB1YmxpYyB0b0xpbmVUb2tlbnMobGluZUNvbnRlbnQ6IHN0cmluZywgZGVjb2RlcjogSUxhbmd1YWdlSWRDb2RlYyk6IExpbmVUb2tlbnMge1xuXHRcdHJldHVybiBMaW5lVG9rZW5zLmNyZWF0ZUZyb21UZXh0QW5kTWV0YWRhdGEodGhpcy5tYXAoKHIsIHQpID0+ICh7IHRleHQ6IHIuc3Vic3RyaW5nKGxpbmVDb250ZW50KSwgbWV0YWRhdGE6IHQubWV0YWRhdGEgfSkpLCBkZWNvZGVyKTtcblx0fVxuXG5cdHB1YmxpYyBmb3JFYWNoKGNiOiAocmFuZ2U6IE9mZnNldFJhbmdlLCB0b2tlbkluZm86IFRva2VuSW5mbykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGxldCBsZW5ndGhTdW0gPSAwO1xuXHRcdGZvciAoY29uc3QgdG9rZW5JbmZvIG9mIHRoaXMuX3Rva2VuSW5mbykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2UobGVuZ3RoU3VtLCBsZW5ndGhTdW0gKyB0b2tlbkluZm8ubGVuZ3RoKTtcblx0XHRcdGNiKHJhbmdlLCB0b2tlbkluZm8pO1xuXHRcdFx0bGVuZ3RoU3VtICs9IHRva2VuSW5mby5sZW5ndGg7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG1hcDxUPihjYjogKHJhbmdlOiBPZmZzZXRSYW5nZSwgdG9rZW5JbmZvOiBUb2tlbkluZm8pID0+IFQpOiBUW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogVFtdID0gW107XG5cdFx0bGV0IGxlbmd0aFN1bSA9IDA7XG5cdFx0Zm9yIChjb25zdCB0b2tlbkluZm8gb2YgdGhpcy5fdG9rZW5JbmZvKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShsZW5ndGhTdW0sIGxlbmd0aFN1bSArIHRva2VuSW5mby5sZW5ndGgpO1xuXHRcdFx0cmVzdWx0LnB1c2goY2IocmFuZ2UsIHRva2VuSW5mbykpO1xuXHRcdFx0bGVuZ3RoU3VtICs9IHRva2VuSW5mby5sZW5ndGg7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc2xpY2UocmFuZ2U6IE9mZnNldFJhbmdlKTogVG9rZW5BcnJheSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBUb2tlbkluZm9bXSA9IFtdO1xuXHRcdGxldCBsZW5ndGhTdW0gPSAwO1xuXHRcdGZvciAoY29uc3QgdG9rZW5JbmZvIG9mIHRoaXMuX3Rva2VuSW5mbykge1xuXHRcdFx0Y29uc3QgdG9rZW5TdGFydCA9IGxlbmd0aFN1bTtcblx0XHRcdGNvbnN0IHRva2VuRW5kRXggPSB0b2tlblN0YXJ0ICsgdG9rZW5JbmZvLmxlbmd0aDtcblx0XHRcdGlmICh0b2tlbkVuZEV4ID4gcmFuZ2Uuc3RhcnQpIHtcblx0XHRcdFx0aWYgKHRva2VuU3RhcnQgPj0gcmFuZ2UuZW5kRXhjbHVzaXZlKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkZWx0YUJlZm9yZSA9IE1hdGgubWF4KDAsIHJhbmdlLnN0YXJ0IC0gdG9rZW5TdGFydCk7XG5cdFx0XHRcdGNvbnN0IGRlbHRhQWZ0ZXIgPSBNYXRoLm1heCgwLCB0b2tlbkVuZEV4IC0gcmFuZ2UuZW5kRXhjbHVzaXZlKTtcblxuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgVG9rZW5JbmZvKHRva2VuSW5mby5sZW5ndGggLSBkZWx0YUJlZm9yZSAtIGRlbHRhQWZ0ZXIsIHRva2VuSW5mby5tZXRhZGF0YSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZW5ndGhTdW0gKz0gdG9rZW5JbmZvLmxlbmd0aDtcblx0XHR9XG5cdFx0cmV0dXJuIFRva2VuQXJyYXkuY3JlYXRlKHJlc3VsdCk7XG5cdH1cblxuXHRwdWJsaWMgYXBwZW5kKG90aGVyOiBUb2tlbkFycmF5KTogVG9rZW5BcnJheSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBUb2tlbkluZm9bXSA9IHRoaXMuX3Rva2VuSW5mby5jb25jYXQob3RoZXIuX3Rva2VuSW5mbyk7XG5cdFx0cmV0dXJuIFRva2VuQXJyYXkuY3JlYXRlKHJlc3VsdCk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgSVRva2VuTWV0YWRhdGEgPSBudW1iZXI7XG5cbmV4cG9ydCBjbGFzcyBUb2tlbkluZm8ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGVuZ3RoOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1ldGFkYXRhOiBJVG9rZW5NZXRhZGF0YVxuXHQpIHsgfVxufVxuLyoqXG4gKiBUT0RPOiBNYWtlIHRoaXMgY2xhc3MgbW9yZSBlZmZpY2llbnQgKGUuZy4gYnkgdXNpbmcgYSBJbnQzMkFycmF5KS5cbiovXG5cbmV4cG9ydCBjbGFzcyBUb2tlbkFycmF5QnVpbGRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuczogVG9rZW5JbmZvW10gPSBbXTtcblxuXHRwdWJsaWMgYWRkKGxlbmd0aDogbnVtYmVyLCBtZXRhZGF0YTogSVRva2VuTWV0YWRhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl90b2tlbnMucHVzaChuZXcgVG9rZW5JbmZvKGxlbmd0aCwgbWV0YWRhdGEpKTtcblx0fVxuXG5cdHB1YmxpYyBidWlsZCgpOiBUb2tlbkFycmF5IHtcblx0XHRyZXR1cm4gVG9rZW5BcnJheS5jcmVhdGUodGhpcy5fdG9rZW5zKTtcblx0fVxufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFdBQVcsU0FBNEIsZ0JBQW9DLHFCQUFxQjtBQUd6RyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQXFCM0IsTUFBTSxjQUFOLE1BQU0sWUFBc0M7QUFBQSxFQXVFbEQsWUFBWSxRQUFxQixNQUFjLFNBQTJCO0FBZDFFLDRCQUF5QjtBQWV4QixVQUFNLGVBQWUsT0FBTyxTQUFTLElBQUksT0FBTyxPQUFPLFNBQVMsQ0FBQyxJQUFJO0FBQ3JFLFFBQUksaUJBQWlCLEtBQUssUUFBUTtBQUNqQyx3QkFBa0IsSUFBSSxNQUFNLDRDQUE0QyxDQUFDO0FBQUEsSUFDMUU7QUFDQSxTQUFLLFVBQVU7QUFDZixTQUFLLGVBQWdCLEtBQUssUUFBUSxXQUFXO0FBQzdDLFNBQUssUUFBUTtB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
