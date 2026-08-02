import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { LineTokens } from "../tokens/lineTokens.js";
import { TokenizationRegistry } from "../languages.js";
import { LanguageId } from "../encodedTokenAttributes.js";
import { NullState, nullTokenizeEncoded } from "./nullTokenize.js";
const fallback = {
  getInitialState: () => NullState,
  tokenizeEncoded: (buffer, hasEOL, state) => nullTokenizeEncoded(LanguageId.Null, state)
};
function tokenizeToStringSync(languageService, text, languageId) {
  return _tokenizeToString(text, languageService.languageIdCodec, TokenizationRegistry.get(languageId) || fallback);
}
async function tokenizeToString(languageService, text, languageId) {
  if (!languageId) {
    return _tokenizeToString(text, languageService.languageIdCodec, fallback);
  }
  const tokenizationSupport = await TokenizationRegistry.getOrCreate(languageId);
  return _tokenizeToString(text, languageService.languageIdCodec, tokenizationSupport || fallback);
}
function tokenizeLineToHTML(text, viewLineTokens, colorMap, startOffset, endOffset, tabSize, useNbsp) {
  let result = `<div>`;
  let charIndex = 0;
  let width = 0;
  let prevIsSpace = true;
  for (let tokenIndex = 0, tokenCount = viewLineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
    const tokenEndIndex = viewLineTokens.getEndOffset(tokenIndex);
    let partContent = "";
    for (; charIndex < tokenEndIndex && charIndex < endOffset; charIndex++) {
      const charCode = text.charCodeAt(charIndex);
      const isTab = charCode === CharCode.Tab;
      width += strings.isFullWidthCharacter(charCode) ? 2 : isTab ? 0 : 1;
      if (charIndex < startOffset) {
        if (isTab) {
          const remainder = width % tabSize;
          width += remainder === 0 ? tabSize : tabSize - remainder;
        }
        continue;
      }
      switch (charCode) {
        case CharCode.Tab: {
          const remainder = width % tabSize;
          const insertSpacesCount = remainder === 0 ? tabSize : tabSize - remainder;
          width += insertSpacesCount;
          let spacesRemaining = insertSpacesCount;
          while (spacesRemaining > 0) {
            if (useNbsp && prevIsSpace) {
              partContent += "&#160;";
              prevIsSpace = false;
            } else {
              partContent += " ";
              prevIsSpace = true;
            }
            spacesRemaining--;
          }
          break;
        }
        case CharCode.LessThan:
          partContent += "&lt;";
          prevIsSpace = false;
          break;
        case CharCode.GreaterThan:
          partContent += "&gt;";
          prevIsSpace = false;
          break;
        case CharCode.Ampersand:
          partContent += "&amp;";
          prevIsSpace = false;
          break;
        case CharCode.Null:
          partContent += "&#00;";
          prevIsSpace = false;
          break;
        case CharCode.UTF8_BOM:
        case CharCode.LINE_SEPARATOR:
        case CharCode.PARAGRAPH_SEPARATOR:
        case CharCode.NEXT_LINE:
          partContent += "\uFFFD";
          prevIsSpace = false;
          break;
        case CharCode.CarriageReturn:
          partContent += "&#8203";
          prevIsSpace = false;
          break;
        case CharCode.Space:
          if (useNbsp && prevIsSpace) {
            partContent += "&#160;";
            prevIsSpace = false;
          } else {
            partContent += " ";
            prevIsSpace = true;
          }
          break;
        default:
          partContent += String.fromCharCode(charCode);
          prevIsSpace = false;
      }
    }
    if (tokenEndIndex <= startOffset) {
      continue;
    }
    result += `<span style="${viewLineTokens.getInlineStyle(tokenIndex, colorMap)}">${partContent}</span>`;
    if (tokenEndIndex > endOffset || charIndex >= endOffset || startOffset >= endOffset) {
      break;
    }
  }
  result += `</div>`;
  return result;
}
function _tokenizeToString(text, languageIdCodec, tokenizationSupport) {
  let result = `<div class="monaco-tokenized-source">`;
  const lines = strings.splitLines(text);
  let currentState = tokenizationSupport.getInitialState();
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = lines[i];
    if (i > 0) {
      result += `<br/>`;
    }
    const tokenizationResult = tokenizationSupport.tokenizeEncoded(line, true, currentState);
    LineTokens.convertToEndOffset(tokenizationResult.tokens, line.length);
    const lineTokens = new LineTokens(tokenizationResult.tokens, line, languageIdCodec);
    const viewLineTokens = lineTokens.inflate();
    let startOffset = 0;
    for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
      const type = viewLineTokens.getClassName(j);
      const endIndex = viewLineTokens.getEndOffset(j);
      result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
      startOffset = endIndex;
    }
    currentState = tokenizationResult.endState;
  }
  result += `</div>`;
  return result;
}
export {
  _tokenizeToString,
  tokenizeLineToHTML,
  tokenizeToString,
  tokenizeToStringSync
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3RleHRUb0h0bWxUb2tlbml6ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJVmlld0xpbmVUb2tlbnMsIExpbmVUb2tlbnMgfSBmcm9tICcuLi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VJZENvZGVjLCBJU3RhdGUsIElUb2tlbml6YXRpb25TdXBwb3J0LCBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUlkIH0gZnJvbSAnLi4vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUsIG51bGxUb2tlbml6ZUVuY29kZWQgfSBmcm9tICcuL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi9sYW5ndWFnZS5qcyc7XG5cbmV4cG9ydCB0eXBlIElSZWR1Y2VkVG9rZW5pemF0aW9uU3VwcG9ydCA9IE9taXQ8SVRva2VuaXphdGlvblN1cHBvcnQsICd0b2tlbml6ZSc+O1xuXG5jb25zdCBmYWxsYmFjazogSVJlZHVjZWRUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0dG9rZW5pemVFbmNvZGVkOiAoYnVmZmVyOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSkgPT4gbnVsbFRva2VuaXplRW5jb2RlZChMYW5ndWFnZUlkLk51bGwsIHN0YXRlKVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHRva2VuaXplVG9TdHJpbmdTeW5jKGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgdGV4dDogc3RyaW5nLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gX3Rva2VuaXplVG9TdHJpbmcodGV4dCwgbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYywgVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0KGxhbmd1YWdlSWQpIHx8IGZhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRva2VuaXplVG9TdHJpbmcobGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLCB0ZXh0OiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRpZiAoIWxhbmd1YWdlSWQpIHtcblx0XHRyZXR1cm4gX3Rva2VuaXplVG9TdHJpbmcodGV4dCwgbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYywgZmFsbGJhY2spO1xuXHR9XG5cdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQgPSBhd2FpdCBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRPckNyZWF0ZShsYW5ndWFnZUlkKTtcblx0cmV0dXJuIF90b2tlbml6ZVRvU3RyaW5nKHRleHQsIGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMsIHRva2VuaXphdGlvblN1cHBvcnQgfHwgZmFsbGJhY2spO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9rZW5pemVMaW5lVG9IVE1MKHRleHQ6IHN0cmluZywgdmlld0xpbmVUb2tlbnM6IElWaWV3TGluZVRva2VucywgY29sb3JNYXA6IHN0cmluZ1tdLCBzdGFydE9mZnNldDogbnVtYmVyLCBlbmRPZmZzZXQ6IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyLCB1c2VOYnNwOiBib29sZWFuKTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdCA9IGA8ZGl2PmA7XG5cdGxldCBjaGFySW5kZXggPSAwO1xuXHRsZXQgd2lkdGggPSAwO1xuXG5cdGxldCBwcmV2SXNTcGFjZSA9IHRydWU7XG5cblx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDAsIHRva2VuQ291bnQgPSB2aWV3TGluZVRva2Vucy5nZXRDb3VudCgpOyB0b2tlbkluZGV4IDwgdG9rZW5Db3VudDsgdG9rZW5JbmRleCsrKSB7XG5cdFx0Y29uc3QgdG9rZW5FbmRJbmRleCA9IHZpZXdMaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRsZXQgcGFydENvbnRlbnQgPSAnJztcblxuXHRcdGZvciAoOyBjaGFySW5kZXggPCB0b2tlbkVuZEluZGV4ICYmIGNoYXJJbmRleCA8IGVuZE9mZnNldDsgY2hhckluZGV4KyspIHtcblx0XHRcdGNvbnN0IGNoYXJDb2RlID0gdGV4dC5jaGFyQ29kZUF0KGNoYXJJbmRleCk7XG5cdFx0XHRjb25zdCBpc1RhYiA9IGNoYXJDb2RlID09PSBDaGFyQ29kZS5UYWI7XG5cblx0XHRcdHdpZHRoICs9IHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoY2hhckNvZGUpID8gMiA6IChpc1RhYiA/IDAgOiAxKTtcblxuXHRcdFx0aWYgKGNoYXJJbmRleCA8IHN0YXJ0T2Zmc2V0KSB7XG5cdFx0XHRcdGlmIChpc1RhYikge1xuXHRcdFx0XHRcdGNvbnN0IHJlbWFpbmRlciA9IHdpZHRoICUgdGFiU2l6ZTtcblx0XHRcdFx0XHR3aWR0aCArPSByZW1haW5kZXIgPT09IDAgPyB0YWJTaXplIDogdGFiU2l6ZSAtIHJlbWFpbmRlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChjaGFyQ29kZSkge1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlRhYjoge1xuXHRcdFx0XHRcdGNvbnN0IHJlbWFpbmRlciA9IHdpZHRoICUgdGFiU2l6ZTtcblx0XHRcdFx0XHRjb25zdCBpbnNlcnRTcGFjZXNDb3VudCA9IHJlbWFpbmRlciA9PT0gMCA/IHRhYlNpemUgOiB0YWJTaXplIC0gcmVtYWluZGVyO1xuXHRcdFx0XHRcdHdpZHRoICs9IGluc2VydFNwYWNlc0NvdW50O1xuXHRcdFx0XHRcdGxldCBzcGFjZXNSZW1haW5pbmcgPSBpbnNlcnRTcGFjZXNDb3VudDtcblx0XHRcdFx0XHR3aGlsZSAoc3BhY2VzUmVtYWluaW5nID4gMCkge1xuXHRcdFx0XHRcdFx0aWYgKHVzZU5ic3AgJiYgcHJldklzU3BhY2UpIHtcblx0XHRcdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJyYjMTYwOyc7XG5cdFx0XHRcdFx0XHRcdHByZXZJc1NwYWNlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwYXJ0Q29udGVudCArPSAnICc7XG5cdFx0XHRcdFx0XHRcdHByZXZJc1NwYWNlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHNwYWNlc1JlbWFpbmluZy0tO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkxlc3NUaGFuOlxuXHRcdFx0XHRcdHBhcnRDb250ZW50ICs9ICcmbHQ7Jztcblx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuR3JlYXRlclRoYW46XG5cdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJyZndDsnO1xuXHRcdFx0XHRcdHByZXZJc1NwYWNlID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5BbXBlcnNhbmQ6XG5cdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJyZhbXA7Jztcblx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuTnVsbDpcblx0XHRcdFx0XHRwYXJ0Q29udGVudCArPSAnJiMwMDsnO1xuXHRcdFx0XHRcdHByZXZJc1NwYWNlID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5VVEY4X0JPTTpcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5MSU5FX1NFUEFSQVRPUjpcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5QQVJBR1JBUEhfU0VQQVJBVE9SOlxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLk5FWFRfTElORTpcblx0XHRcdFx0XHRwYXJ0Q29udGVudCArPSAnXFx1ZmZmZCc7XG5cdFx0XHRcdFx0cHJldklzU3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuOlxuXHRcdFx0XHRcdC8vIHplcm8gd2lkdGggc3BhY2UsIGJlY2F1c2UgY2FycmlhZ2UgcmV0dXJuIHdvdWxkIGludHJvZHVjZSBhIGxpbmUgYnJlYWtcblx0XHRcdFx0XHRwYXJ0Q29udGVudCArPSAnJiM4MjAzJztcblx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0XHRcdFx0aWYgKHVzZU5ic3AgJiYgcHJldklzU3BhY2UpIHtcblx0XHRcdFx0XHRcdHBhcnRDb250ZW50ICs9ICcmIzE2MDsnO1xuXHRcdFx0XHRcdFx0cHJldklzU3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJyAnO1xuXHRcdFx0XHRcdFx0cHJldklzU3BhY2UgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHBhcnRDb250ZW50ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhckNvZGUpO1xuXHRcdFx0XHRcdHByZXZJc1NwYWNlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuRW5kSW5kZXggPD0gc3RhcnRPZmZzZXQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdHJlc3VsdCArPSBgPHNwYW4gc3R5bGU9XCIke3ZpZXdMaW5lVG9rZW5zLmdldElubGluZVN0eWxlKHRva2VuSW5kZXgsIGNvbG9yTWFwKX1cIj4ke3BhcnRDb250ZW50fTwvc3Bhbj5gO1xuXG5cdFx0aWYgKHRva2VuRW5kSW5kZXggPiBlbmRPZmZzZXQgfHwgY2hhckluZGV4ID49IGVuZE9mZnNldCB8fCBzdGFydE9mZnNldCA+PSBlbmRPZmZzZXQpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHJlc3VsdCArPSBgPC9kaXY+YDtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF90b2tlbml6ZVRvU3RyaW5nKHRleHQ6IHN0cmluZywgbGFuZ3VhZ2VJZENvZGVjOiBJTGFuZ3VhZ2VJZENvZGVjLCB0b2tlbml6YXRpb25TdXBwb3J0OiBJUmVkdWNlZFRva2VuaXphdGlvblN1cHBvcnQpOiBzdHJpbmcge1xuXHRsZXQgcmVzdWx0ID0gYDxkaXYgY2xhc3M9XCJtb25hY28tdG9rZW5pemVkLXNvdXJjZVwiPmA7XG5cdGNvbnN0IGxpbmVzID0gc3RyaW5ncy5zcGxpdExpbmVzKHRleHQpO1xuXHRsZXQgY3VycmVudFN0YXRlID0gdG9rZW5pemF0aW9uU3VwcG9ydC5nZXRJbml0aWFsU3RhdGUoKTtcblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXG5cdFx0aWYgKGkgPiAwKSB7XG5cdFx0XHRyZXN1bHQgKz0gYDxici8+YDtcblx0XHR9XG5cblx0XHRjb25zdCB0b2tlbml6YXRpb25SZXN1bHQgPSB0b2tlbml6YXRpb25TdXBwb3J0LnRva2VuaXplRW5jb2RlZChsaW5lLCB0cnVlLCBjdXJyZW50U3RhdGUpO1xuXHRcdExpbmVUb2tlbnMuY29udmVydFRvRW5kT2Zmc2V0KHRva2VuaXphdGlvblJlc3VsdC50b2tlbnMsIGxpbmUubGVuZ3RoKTtcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gbmV3IExpbmVUb2tlbnModG9rZW5pemF0aW9uUmVzdWx0LnRva2VucywgbGluZSwgbGFuZ3VhZ2VJZENvZGVjKTtcblx0XHRjb25zdCB2aWV3TGluZVRva2VucyA9IGxpbmVUb2tlbnMuaW5mbGF0ZSgpO1xuXG5cdFx0bGV0IHN0YXJ0T2Zmc2V0ID0gMDtcblx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IHZpZXdMaW5lVG9rZW5zLmdldENvdW50KCk7IGogPCBsZW5KOyBqKyspIHtcblx0XHRcdGNvbnN0IHR5cGUgPSB2aWV3TGluZVRva2Vucy5nZXRDbGFzc05hbWUoaik7XG5cdFx0XHRjb25zdCBlbmRJbmRleCA9IHZpZXdMaW5lVG9rZW5zLmdldEVuZE9mZnNldChqKTtcblx0XHRcdHJlc3VsdCArPSBgPHNwYW4gY2xhc3M9XCIke3R5cGV9XCI+JHtzdHJpbmdzLmVzY2FwZShsaW5lLnN1YnN0cmluZyhzdGFydE9mZnNldCwgZW5kSW5kZXgpKX08L3NwYW4+YDtcblx0XHRcdHN0YXJ0T2Zmc2V0ID0gZW5kSW5kZXg7XG5cdFx0fVxuXG5cdFx0Y3VycmVudFN0YXRlID0gdG9rZW5pemF0aW9uUmVzdWx0LmVuZFN0YXRlO1xuXHR9XG5cblx0cmVzdWx0ICs9IGA8L2Rpdj5gO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxhQUFhO0FBQ3pCLFNBQTBCLGtCQUFrQjtBQUM1QyxTQUF5RCw0QkFBNEI7QUFDckYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLDJCQUEyQjtBQUsvQyxNQUFNLFdBQXdDO0FBQUEsRUFDN0MsaUJBQWlCLE1BQU07QUFBQSxFQUN2QixpQkFBaUIsQ0FBQyxRQUFnQixRQUFpQixVQUFrQixvQkFBb0IsV0FBVyxNQUFNLEtBQUs7QUFDaEg7QUFFTyxTQUFTLHFCQUFxQixpQkFBbUMsTUFBYyxZQUE0QjtBQUNqSCxTQUFPLGtCQUFrQixNQUFNLGdCQUFnQixpQkFBaUIscUJBQXFCLElBQUksVUFBVSxLQUFLLFFBQVE7QUFDakg7QUFFQSxlQUFzQixpQkFBaUIsaUJBQW1DLE1BQWMsWUFBNEM7QUFDbkksTUFBSSxDQUFDLFlBQVk7QUFDaEIsV0FBTyxrQkFBa0IsTUFBTSxnQkFBZ0IsaUJBQWlCLFFBQVE7QUFBQSxFQUN6RTtBQUNBLFFBQU0sc0JBQXNCLE1BQU0scUJBQXFCLFlBQVksVUFBVTtBQUM3RSxTQUFPLGtCQUFrQixNQUFNLGdCQUFnQixpQkFBaUIsdUJBQXVCLFFBQVE7QUFDaEc7QUFFTyxTQUFTLG1CQUFtQixNQUFjLGdCQUFpQyxVQUFvQixhQUFxQixXQUFtQixTQUFpQixTQUEwQjtBQUN4TCxNQUFJLFNBQVM7QUFDYixNQUFJLFlBQVk7QUFDaEIsTUFBSSxRQUFRO0FBRVosTUFBSSxjQUFjO0FBRWxCLFdBQVMsYUFBYSxHQUFHLGFBQWEsZUFBZSxTQUFTLEdBQUcsYUFBYSxZQUFZLGNBQWM7QUFDdkcsVUFBTSxnQkFBZ0IsZUFBZSxhQUFhLFVBQVU7QUFDNUQsUUFBSSxjQUFjO0FBRWxCLFdBQU8sWUFBWSxpQkFBaUIsWUFBWSxXQUFXLGFBQWE7QUFDdkUsWUFBTSxXQUFXLEtBQUssV0FBVyxTQUFTO0FBQzFDLFlBQU0sUUFBUSxhQUFhLFNBQVM7QUFFcEMsZUFBUyxRQUFRLHFCQUFxQixRQUFRLElBQUksSUFBSyxRQUFRLElBQUk7QUFFbkUsVUFBSSxZQUFZLGFBQWE7QUFDNUIsWUFBSSxPQUFPO0FBQ1YsZ0JBQU0sWUFBWSxRQUFRO0FBQzFCLG1CQUFTLGNBQWMsSUFBSSxVQUFVLFVBQVU7QUFBQSxRQUNoRDtBQUNBO0FBQUEsTUFDRDtBQUVBLGNBQVEsVUFBVTtBQUFBLFFBQ2pCLEtBQUssU0FBUyxLQUFLO0FBQ2xCLGdCQUFNLFlBQVksUUFBUTtBQUMxQixnQkFBTSxvQkFBb0IsY0FBYyxJQUFJLFVBQVUsVUFBVTtBQUNoRSxtQkFBUztBQUNULGNBQUksa0JBQWtCO0FBQ3RCLGlCQUFPLGtCQUFrQixHQUFHO0FBQzNCLGdCQUFJLFdBQVcsYUFBYTtBQUMzQiw2QkFBZTtBQUNmLDRCQUFjO0FBQUEsWUFDZixPQUFPO0FBQ04sNkJBQWU7QUFDZiw0QkFBYztBQUFBLFlBQ2Y7QUFDQTtBQUFBLFVBQ0Q7QUFDQTtBQUFBLFFBQ0Q7QUFBQSxRQUNBLEtBQUssU0FBUztBQUNiLHlCQUFlO0FBQ2Ysd0JBQWM7QUFDZDtBQUFBLFFBRUQsS0FBSyxTQUFTO0FBQ2IseUJBQWU7QUFDZix3QkFBYztBQUNkO0FBQUEsUUFFRCxLQUFLLFNBQVM7QUFDYix5QkFBZTtBQUNmLHdCQUFjO0FBQ2Q7QUFBQSxRQUVELEtBQUssU0FBUztBQUNiLHlCQUFlO0FBQ2Ysd0JBQWM7QUFDZDtBQUFBLFFBRUQsS0FBSyxTQUFTO0FBQUEsUUFDZCxLQUFLLFNBQVM7QUFBQSxRQUNkLEtBQUssU0FBUztBQUFBLFFBQ2QsS0FBSyxTQUFTO0FBQ2IseUJBQWU7QUFDZix3QkFBYztBQUNkO0FBQUEsUUFFRCxLQUFLLFNBQVM7QUFFYix5QkFBZTtBQUNmLHdCQUFjO0FBQ2Q7QUFBQSxRQUVELEtBQUssU0FBUztBQUNiLGNBQUksV0FBVyxhQUFhO0FBQzNCLDJCQUFlO0FBQ2YsMEJBQWM7QUFBQSxVQUNmLE9BQU87QUFDTiwyQkFBZTtBQUNmLDBCQUFjO0FBQUEsVUFDZjtBQUNBO0FBQUEsUUFFRDtBQUNDLHlCQUFlLE9BQU8sYUFBYSxRQUFRO0FBQzNDLHdCQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNEO0FBRUEsUUFBSSxpQkFBaUIsYUFBYTtBQUNqQztBQUFBLElBQ0Q7QUFFQSxjQUFVLGdCQUFnQixlQUFlLGVBQWUsWUFBWSxRQUFRLENBQUMsS0FBSyxXQUFXO0FBRTdGLFFBQUksZ0JBQWdCLGFBQWEsYUFBYSxhQUFhLGVBQWUsV0FBVztBQUNwRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsWUFBVTtBQUNWLFNBQU87QUFDUjtBQUVPLFNBQVMsa0JBQWtCLE1BQWMsaUJBQW1DLHFCQUEwRDtBQUM1SSxNQUFJLFNBQVM7QUFDYixRQUFNLFFBQVEsUUFBUSxXQUFXLElBQUk7QUFDckMsTUFBSSxlQUFlLG9CQUFvQixnQkFBZ0I7QUFDdkQsV0FBUyxJQUFJLEdBQUcsTUFBTSxNQUFNLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDakQsVUFBTSxPQUFPLE1BQU0sQ0FBQztBQUVwQixRQUFJLElBQUksR0FBRztBQUNWLGdCQUFVO0FBQUEsSUFDWDtBQUVBLFVBQU0scUJBQXFCLG9CQUFvQixnQkFBZ0IsTUFBTSxNQUFNLFlBQVk7QUFDdkYsZUFBVyxtQkFBbUIsbUJBQW1CLFFBQVEsS0FBSyxNQUFNO0FBQ3BFLFVBQU0sYUFBYSxJQUFJLFdBQVcsbUJBQW1CLFFBQVEsTUFBTSxlQUFlO0FBQ2xGLFVBQU0saUJBQWlCLFdBQVcsUUFBUTtBQUUxQyxRQUFJLGNBQWM7QUFDbEIsYUFBUyxJQUFJLEdBQUcsT0FBTyxlQUFlLFNBQVMsR0FBRyxJQUFJLE1BQU0sS0FBSztBQUNoRSxZQUFNLE9BQU8sZUFBZSxhQUFhLENBQUM7QUFDMUMsWUFBTSxXQUFXLGVBQWUsYUFBYSxDQUFDO0FBQzlDLGdCQUFVLGdCQUFnQixJQUFJLEtBQUssUUFBUSxPQUFPLEtBQUssVUFBVSxhQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQ3hGLG9CQUFjO0FBQUEsSUFDZjtBQUVBLG1CQUFlLG1CQUFtQjtBQUFBLEVBQ25DO0FBRUEsWUFBVTtBQUNWLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
