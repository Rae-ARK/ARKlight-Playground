import { ok } from "../../../base/common/assert.js";
import { Schemas } from "../../../base/common/network.js";
import { regExpLeadsToEndlessLoop } from "../../../base/common/strings.js";
import { MirrorTextModel } from "../../../editor/common/model/mirrorTextModel.js";
import { ensureValidWordDefinition, getWordAtText } from "../../../editor/common/core/wordHelper.js";
import { equals } from "../../../base/common/arrays.js";
import { EndOfLine } from "./extHostTypes/textEdit.js";
import { Position } from "./extHostTypes/position.js";
import { Range } from "./extHostTypes/range.js";
const _languageId2WordDefinition = /* @__PURE__ */ new Map();
function setWordDefinitionFor(languageId, wordDefinition) {
  if (!wordDefinition) {
    _languageId2WordDefinition.delete(languageId);
  } else {
    _languageId2WordDefinition.set(languageId, wordDefinition);
  }
}
function getWordDefinitionFor(languageId) {
  return _languageId2WordDefinition.get(languageId);
}
class ExtHostDocumentData extends MirrorTextModel {
  constructor(_proxy, uri, lines, eol, versionId, _languageId, _isDirty, _encoding, _strictInstanceofChecks = true) {
    super(uri, lines, eol, versionId);
    this._proxy = _proxy;
    this._languageId = _languageId;
    this._isDirty = _isDirty;
    this._encoding = _encoding;
    this._strictInstanceofChecks = _strictInstanceofChecks;
    this._isDisposed = false;
  }
  // eslint-disable-next-line local/code-must-use-super-dispose
  dispose() {
    ok(!this._isDisposed);
    this._isDisposed = true;
    this._isDirty = false;
  }
  equalLines(lines) {
    return equals(this._lines, lines);
  }
  get document() {
    if (!this._document) {
      const that = this;
      this._document = {
        get uri() {
          return that._uri;
        },
        get fileName() {
          return that._uri.fsPath;
        },
        get isUntitled() {
          return that._uri.scheme === Schemas.untitled;
        },
        get languageId() {
          return that._languageId;
        },
        get version() {
          return that._versionId;
        },
        get isClosed() {
          return that._isDisposed;
        },
        get isDirty() {
          return that._isDirty;
        },
        get encoding() {
          return that._encoding;
        },
        save() {
          return that._save();
        },
        getText(range) {
          return range ? that._getTextInRange(range) : that.getText();
        },
        get eol() {
          return that._eol === "\n" ? EndOfLine.LF : EndOfLine.CRLF;
        },
        get lineCount() {
          return that._lines.length;
        },
        lineAt(lineOrPos) {
          return that._lineAt(lineOrPos);
        },
        offsetAt(pos) {
          return that._offsetAt(pos);
        },
        positionAt(offset) {
          return that._positionAt(offset);
        },
        validateRange(ran) {
          return that._validateRange(ran);
        },
        validatePosition(pos) {
          return that._validatePosition(pos);
        },
        getWordRangeAtPosition(pos, regexp) {
          return that._getWordRangeAtPosition(pos, regexp);
        },
        [/* @__PURE__ */ Symbol.for("debug.description")]() {
          return `TextDocument(${that._uri.toString()})`;
        }
      };
    }
    return Object.freeze(this._document);
  }
  _acceptLanguageId(newLanguageId) {
    ok(!this._isDisposed);
    this._languageId = newLanguageId;
  }
  _acceptIsDirty(isDirty) {
    ok(!this._isDisposed);
    this._isDirty = isDirty;
  }
  _acceptEncoding(encoding) {
    ok(!this._isDisposed);
    this._encoding = encoding;
  }
  _save() {
    if (this._isDisposed) {
      return Promise.reject(new Error("Document has been closed"));
    }
    return this._proxy.$trySaveDocument(this._uri);
  }
  _getTextInRange(_range) {
    const range = this._validateRange(_range);
    if (range.isEmpty) {
      return "";
    }
    if (range.isSingleLine) {
      return this._lines[range.start.line].substring(range.start.character, range.end.character);
    }
    const lineEnding = this._eol, startLineIndex = range.start.line, endLineIndex = range.end.line, resultLines = [];
    resultLines.push(this._lines[startLineIndex].substring(range.start.character));
    for (let i = startLineIndex + 1; i < endLineIndex; i++) {
      resultLines.push(this._lines[i]);
    }
    resultLines.push(this._lines[endLineIndex].substring(0, range.end.character));
    return resultLines.join(lineEnding);
  }
  _lineAt(lineOrPosition) {
    let line;
    if (lineOrPosition instanceof Position) {
      line = lineOrPosition.line;
    } else if (typeof lineOrPosition === "number") {
      line = lineOrPosition;
    } else if (!this._strictInstanceofChecks && Position.isPosition(lineOrPosition)) {
      line = lineOrPosition.line;
    }
    if (typeof line !== "number" || line < 0 || line >= this._lines.length || Math.floor(line) !== line) {
      throw new Error("Illegal value for `line`");
    }
    return new ExtHostDocumentLine(line, this._lines[line], line === this._lines.length - 1);
  }
  _offsetAt(position) {
    position = this._validatePosition(position);
    this._ensureLineStarts();
    return this._lineStarts.getPrefixSum(position.line - 1) + position.character;
  }
  _positionAt(offset) {
    offset = Math.floor(offset);
    offset = Math.max(0, offset);
    this._ensureLineStarts();
    const out = this._lineStarts.getIndexOf(offset);
    const lineLength = this._lines[out.index].length;
    return new Position(out.index, Math.min(out.remainder, lineLength));
  }
  // ---- range math
  _validateRange(range) {
    if (this._strictInstanceofChecks) {
      if (!(range instanceof Range)) {
        throw new Error("Invalid argument");
      }
    } else {
      if (!Range.isRange(range)) {
        throw new Error("Invalid argument");
      }
    }
    const start = this._validatePosition(range.start);
    const end = this._validatePosition(range.end);
    if (start === range.start && end === range.end) {
      return range;
    }
    return new Range(start.line, start.character, end.line, end.character);
  }
  _validatePosition(position) {
    if (this._strictInstanceofChecks) {
      if (!(position instanceof Position)) {
        throw new Error("Invalid argument");
      }
    } else {
      if (!Position.isPosition(position)) {
        throw new Error("Invalid argument");
      }
    }
    if (this._lines.length === 0) {
      return position.with(0, 0);
    }
    let { line, character } = position;
    let hasChanged = false;
    if (line < 0) {
      line = 0;
      character = 0;
      hasChanged = true;
    } else if (line >= this._lines.length) {
      line = this._lines.length - 1;
      character = this._lines[line].length;
      hasChanged = true;
    } else {
      const maxCharacter = this._lines[line].length;
      if (character < 0) {
        character = 0;
        hasChanged = true;
      } else if (character > maxCharacter) {
        character = maxCharacter;
        hasChanged = true;
      }
    }
    if (!hasChanged) {
      return position;
    }
    return new Position(line, character);
  }
  _getWordRangeAtPosition(_position, regexp) {
    const position = this._validatePosition(_position);
    if (!regexp) {
      regexp = getWordDefinitionFor(this._languageId);
    } else if (regExpLeadsToEndlessLoop(regexp)) {
      throw new Error(`[getWordRangeAtPosition]: ignoring custom regexp '${regexp.source}' because it matches the empty string.`);
    }
    const wordAtText = getWordAtText(
      position.character + 1,
      ensureValidWordDefinition(regexp),
      this._lines[position.line],
      0
    );
    if (wordAtText) {
      return new Range(position.line, wordAtText.startColumn - 1, position.line, wordAtText.endColumn - 1);
    }
    return void 0;
  }
}
class ExtHostDocumentLine {
  constructor(line, text, isLastLine) {
    this._line = line;
    this._text = text;
    this._isLastLine = isLastLine;
  }
  get lineNumber() {
    return this._line;
  }
  get text() {
    return this._text;
  }
  get range() {
    return new Range(this._line, 0, this._line, this._text.length);
  }
  get rangeIncludingLineBreak() {
    if (this._isLastLine) {
      return this.range;
    }
    return new Range(this._line, 0, this._line + 1, 0);
  }
  get firstNonWhitespaceCharacterIndex() {
    return /^(\s*)/.exec(this._text)[1].length;
  }
  get isEmptyOrWhitespace() {
    return this.firstNonWhitespaceCharacterIndex === this._text.length;
  }
}
export {
  ExtHostDocumentData,
  ExtHostDocumentLine,
  setWordDefinitionFor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REb2N1bWVudERhdGEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvayB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyByZWdFeHBMZWFkc1RvRW5kbGVzc0xvb3AgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNaXJyb3JUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL21pcnJvclRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVWYWxpZFdvcmREZWZpbml0aW9uLCBnZXRXb3JkQXRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmUgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvcmFuZ2UuanMnO1xuXG5jb25zdCBfbGFuZ3VhZ2VJZDJXb3JkRGVmaW5pdGlvbiA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5leHBvcnQgZnVuY3Rpb24gc2V0V29yZERlZmluaXRpb25Gb3IobGFuZ3VhZ2VJZDogc3RyaW5nLCB3b3JkRGVmaW5pdGlvbjogUmVnRXhwIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdGlmICghd29yZERlZmluaXRpb24pIHtcblx0XHRfbGFuZ3VhZ2VJZDJXb3JkRGVmaW5pdGlvbi5kZWxldGUobGFuZ3VhZ2VJZCk7XG5cdH0gZWxzZSB7XG5cdFx0X2xhbmd1YWdlSWQyV29yZERlZmluaXRpb24uc2V0KGxhbmd1YWdlSWQsIHdvcmREZWZpbml0aW9uKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRXb3JkRGVmaW5pdGlvbkZvcihsYW5ndWFnZUlkOiBzdHJpbmcpOiBSZWdFeHAgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gX2xhbmd1YWdlSWQyV29yZERlZmluaXRpb24uZ2V0KGxhbmd1YWdlSWQpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0RG9jdW1lbnRTYXZlRGVsZWdhdGUge1xuXHQkdHJ5U2F2ZURvY3VtZW50KHVyaTogVXJpQ29tcG9uZW50cyk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RG9jdW1lbnREYXRhIGV4dGVuZHMgTWlycm9yVGV4dE1vZGVsIHtcblxuXHRwcml2YXRlIF9kb2N1bWVudD86IHZzY29kZS5UZXh0RG9jdW1lbnQ7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogSUV4dEhvc3REb2N1bWVudFNhdmVEZWxlZ2F0ZSxcblx0XHR1cmk6IFVSSSwgbGluZXM6IHN0cmluZ1tdLCBlb2w6IHN0cmluZywgdmVyc2lvbklkOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfbGFuZ3VhZ2VJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2lzRGlydHk6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSBfZW5jb2Rpbmc6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdHJpY3RJbnN0YW5jZW9mQ2hlY2tzID0gdHJ1ZSAvLyB1c2VkIGZvciBjb2RlIHJldXNlXG5cdCkge1xuXHRcdHN1cGVyKHVyaSwgbGluZXMsIGVvbCwgdmVyc2lvbklkKTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW11c3QtdXNlLXN1cGVyLWRpc3Bvc2Vcblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyB3ZSBkb24ndCByZWFsbHkgZGlzcG9zZSBkb2N1bWVudHMgYnV0IGxldFxuXHRcdC8vIGV4dGVuc2lvbnMgc3RpbGwgcmVhZCBmcm9tIHRoZW0uIHNvbWVcblx0XHQvLyBvcGVyYXRpb25zLCBsaXZlIHNhdmluZywgd2lsbCBub3cgZXJyb3IgdGhvXG5cdFx0b2soIXRoaXMuX2lzRGlzcG9zZWQpO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX2lzRGlydHkgPSBmYWxzZTtcblx0fVxuXG5cdGVxdWFsTGluZXMobGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVxdWFscyh0aGlzLl9saW5lcywgbGluZXMpO1xuXHR9XG5cblx0Z2V0IGRvY3VtZW50KCk6IHZzY29kZS5UZXh0RG9jdW1lbnQge1xuXHRcdGlmICghdGhpcy5fZG9jdW1lbnQpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0dGhpcy5fZG9jdW1lbnQgPSB7XG5cdFx0XHRcdGdldCB1cmkoKSB7IHJldHVybiB0aGF0Ll91cmk7IH0sXG5cdFx0XHRcdGdldCBmaWxlTmFtZSgpIHsgcmV0dXJuIHRoYXQuX3VyaS5mc1BhdGg7IH0sXG5cdFx0XHRcdGdldCBpc1VudGl0bGVkKCkgeyByZXR1cm4gdGhhdC5fdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZDsgfSxcblx0XHRcdFx0Z2V0IGxhbmd1YWdlSWQoKSB7IHJldHVybiB0aGF0Ll9sYW5ndWFnZUlkOyB9LFxuXHRcdFx0XHRnZXQgdmVyc2lvbigpIHsgcmV0dXJuIHRoYXQuX3ZlcnNpb25JZDsgfSxcblx0XHRcdFx0Z2V0IGlzQ2xvc2VkKCkgeyByZXR1cm4gdGhhdC5faXNEaXNwb3NlZDsgfSxcblx0XHRcdFx0Z2V0IGlzRGlydHkoKSB7IHJldHVybiB0aGF0Ll9pc0RpcnR5OyB9LFxuXHRcdFx0XHRnZXQgZW5jb2RpbmcoKSB7IHJldHVybiB0aGF0Ll9lbmNvZGluZzsgfSxcblx0XHRcdFx0c2F2ZSgpIHsgcmV0dXJuIHRoYXQuX3NhdmUoKTsgfSxcblx0XHRcdFx0Z2V0VGV4dChyYW5nZT8pIHsgcmV0dXJuIHJhbmdlID8gdGhhdC5fZ2V0VGV4dEluUmFuZ2UocmFuZ2UpIDogdGhhdC5nZXRUZXh0KCk7IH0sXG5cdFx0XHRcdGdldCBlb2woKSB7IHJldHVybiB0aGF0Ll9lb2wgPT09ICdcXG4nID8gRW5kT2ZMaW5lLkxGIDogRW5kT2ZMaW5lLkNSTEY7IH0sXG5cdFx0XHRcdGdldCBsaW5lQ291bnQoKSB7IHJldHVybiB0aGF0Ll9saW5lcy5sZW5ndGg7IH0sXG5cdFx0XHRcdGxpbmVBdChsaW5lT3JQb3M6IG51bWJlciB8IHZzY29kZS5Qb3NpdGlvbikgeyByZXR1cm4gdGhhdC5fbGluZUF0KGxpbmVPclBvcyk7IH0sXG5cdFx0XHRcdG9mZnNldEF0KHBvcykgeyByZXR1cm4gdGhhdC5fb2Zmc2V0QXQocG9zKTsgfSxcblx0XHRcdFx0cG9zaXRpb25BdChvZmZzZXQpIHsgcmV0dXJuIHRoYXQuX3Bvc2l0aW9uQXQob2Zmc2V0KTsgfSxcblx0XHRcdFx0dmFsaWRhdGVSYW5nZShyYW4pIHsgcmV0dXJuIHRoYXQuX3ZhbGlkYXRlUmFuZ2UocmFuKTsgfSxcblx0XHRcdFx0dmFsaWRhdGVQb3NpdGlvbihwb3MpIHsgcmV0dXJuIHRoYXQuX3ZhbGlkYXRlUG9zaXRpb24ocG9zKTsgfSxcblx0XHRcdFx0Z2V0V29yZFJhbmdlQXRQb3NpdGlvbihwb3MsIHJlZ2V4cD8pIHsgcmV0dXJuIHRoYXQuX2dldFdvcmRSYW5nZUF0UG9zaXRpb24ocG9zLCByZWdleHApOyB9LFxuXHRcdFx0XHRbU3ltYm9sLmZvcignZGVidWcuZGVzY3JpcHRpb24nKV0oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGBUZXh0RG9jdW1lbnQoJHt0aGF0Ll91cmkudG9TdHJpbmcoKX0pYDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUodGhpcy5fZG9jdW1lbnQpO1xuXHR9XG5cblx0X2FjY2VwdExhbmd1YWdlSWQobmV3TGFuZ3VhZ2VJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0b2soIXRoaXMuX2lzRGlzcG9zZWQpO1xuXHRcdHRoaXMuX2xhbmd1YWdlSWQgPSBuZXdMYW5ndWFnZUlkO1xuXHR9XG5cblx0X2FjY2VwdElzRGlydHkoaXNEaXJ0eTogYm9vbGVhbik6IHZvaWQge1xuXHRcdG9rKCF0aGlzLl9pc0Rpc3Bvc2VkKTtcblx0XHR0aGlzLl9pc0RpcnR5ID0gaXNEaXJ0eTtcblx0fVxuXG5cdF9hY2NlcHRFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0b2soIXRoaXMuX2lzRGlzcG9zZWQpO1xuXHRcdHRoaXMuX2VuY29kaW5nID0gZW5jb2Rpbmc7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdEb2N1bWVudCBoYXMgYmVlbiBjbG9zZWQnKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kdHJ5U2F2ZURvY3VtZW50KHRoaXMuX3VyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUZXh0SW5SYW5nZShfcmFuZ2U6IHZzY29kZS5SYW5nZSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl92YWxpZGF0ZVJhbmdlKF9yYW5nZSk7XG5cblx0XHRpZiAocmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGlmIChyYW5nZS5pc1NpbmdsZUxpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9saW5lc1tyYW5nZS5zdGFydC5saW5lXS5zdWJzdHJpbmcocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCByYW5nZS5lbmQuY2hhcmFjdGVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lRW5kaW5nID0gdGhpcy5fZW9sLFxuXHRcdFx0c3RhcnRMaW5lSW5kZXggPSByYW5nZS5zdGFydC5saW5lLFxuXHRcdFx0ZW5kTGluZUluZGV4ID0gcmFuZ2UuZW5kLmxpbmUsXG5cdFx0XHRyZXN1bHRMaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHRcdHJlc3VsdExpbmVzLnB1c2godGhpcy5fbGluZXNbc3RhcnRMaW5lSW5kZXhdLnN1YnN0cmluZyhyYW5nZS5zdGFydC5jaGFyYWN0ZXIpKTtcblx0XHRmb3IgKGxldCBpID0gc3RhcnRMaW5lSW5kZXggKyAxOyBpIDwgZW5kTGluZUluZGV4OyBpKyspIHtcblx0XHRcdHJlc3VsdExpbmVzLnB1c2godGhpcy5fbGluZXNbaV0pO1xuXHRcdH1cblx0XHRyZXN1bHRMaW5lcy5wdXNoKHRoaXMuX2xpbmVzW2VuZExpbmVJbmRleF0uc3Vic3RyaW5nKDAsIHJhbmdlLmVuZC5jaGFyYWN0ZXIpKTtcblxuXHRcdHJldHVybiByZXN1bHRMaW5lcy5qb2luKGxpbmVFbmRpbmcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGluZUF0KGxpbmVPclBvc2l0aW9uOiBudW1iZXIgfCB2c2NvZGUuUG9zaXRpb24pOiB2c2NvZGUuVGV4dExpbmUge1xuXG5cdFx0bGV0IGxpbmU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAobGluZU9yUG9zaXRpb24gaW5zdGFuY2VvZiBQb3NpdGlvbikge1xuXHRcdFx0bGluZSA9IGxpbmVPclBvc2l0aW9uLmxpbmU7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgbGluZU9yUG9zaXRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRsaW5lID0gbGluZU9yUG9zaXRpb247XG5cdFx0fSBlbHNlIGlmICghdGhpcy5fc3RyaWN0SW5zdGFuY2VvZkNoZWNrcyAmJiBQb3NpdGlvbi5pc1Bvc2l0aW9uKGxpbmVPclBvc2l0aW9uKSkge1xuXHRcdFx0bGluZSA9IGxpbmVPclBvc2l0aW9uLmxpbmU7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBsaW5lICE9PSAnbnVtYmVyJyB8fCBsaW5lIDwgMCB8fCBsaW5lID49IHRoaXMuX2xpbmVzLmxlbmd0aCB8fCBNYXRoLmZsb29yKGxpbmUpICE9PSBsaW5lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIGBsaW5lYCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgRXh0SG9zdERvY3VtZW50TGluZShsaW5lLCB0aGlzLl9saW5lc1tsaW5lXSwgbGluZSA9PT0gdGhpcy5fbGluZXMubGVuZ3RoIC0gMSk7XG5cdH1cblxuXHRwcml2YXRlIF9vZmZzZXRBdChwb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRwb3NpdGlvbiA9IHRoaXMuX3ZhbGlkYXRlUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdHRoaXMuX2Vuc3VyZUxpbmVTdGFydHMoKTtcblx0XHRyZXR1cm4gdGhpcy5fbGluZVN0YXJ0cyEuZ2V0UHJlZml4U3VtKHBvc2l0aW9uLmxpbmUgLSAxKSArIHBvc2l0aW9uLmNoYXJhY3Rlcjtcblx0fVxuXG5cdHByaXZhdGUgX3Bvc2l0aW9uQXQob2Zmc2V0OiBudW1iZXIpOiB2c2NvZGUuUG9zaXRpb24ge1xuXHRcdG9mZnNldCA9IE1hdGguZmxvb3Iob2Zmc2V0KTtcblx0XHRvZmZzZXQgPSBNYXRoLm1heCgwLCBvZmZzZXQpO1xuXG5cdFx0dGhpcy5fZW5zdXJlTGluZVN0YXJ0cygpO1xuXHRcdGNvbnN0IG91dCA9IHRoaXMuX2xpbmVTdGFydHMhLmdldEluZGV4T2Yob2Zmc2V0KTtcblxuXHRcdGNvbnN0IGxpbmVMZW5ndGggPSB0aGlzLl9saW5lc1tvdXQuaW5kZXhdLmxlbmd0aDtcblxuXHRcdC8vIEVuc3VyZSB3ZSByZXR1cm4gYSB2YWxpZCBwb3NpdGlvblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24ob3V0LmluZGV4LCBNYXRoLm1pbihvdXQucmVtYWluZGVyLCBsaW5lTGVuZ3RoKSk7XG5cdH1cblxuXHQvLyAtLS0tIHJhbmdlIG1hdGhcblxuXHRwcml2YXRlIF92YWxpZGF0ZVJhbmdlKHJhbmdlOiB2c2NvZGUuUmFuZ2UpOiB2c2NvZGUuUmFuZ2Uge1xuXHRcdGlmICh0aGlzLl9zdHJpY3RJbnN0YW5jZW9mQ2hlY2tzKSB7XG5cdFx0XHRpZiAoIShyYW5nZSBpbnN0YW5jZW9mIFJhbmdlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQnKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCFSYW5nZS5pc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX3ZhbGlkYXRlUG9zaXRpb24ocmFuZ2Uuc3RhcnQpO1xuXHRcdGNvbnN0IGVuZCA9IHRoaXMuX3ZhbGlkYXRlUG9zaXRpb24ocmFuZ2UuZW5kKTtcblxuXHRcdGlmIChzdGFydCA9PT0gcmFuZ2Uuc3RhcnQgJiYgZW5kID09PSByYW5nZS5lbmQpIHtcblx0XHRcdHJldHVybiByYW5nZTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydC5saW5lLCBzdGFydC5jaGFyYWN0ZXIsIGVuZC5saW5lLCBlbmQuY2hhcmFjdGVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlUG9zaXRpb24ocG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbik6IHZzY29kZS5Qb3NpdGlvbiB7XG5cdFx0aWYgKHRoaXMuX3N0cmljdEluc3RhbmNlb2ZDaGVja3MpIHtcblx0XHRcdGlmICghKHBvc2l0aW9uIGluc3RhbmNlb2YgUG9zaXRpb24pKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudCcpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIVBvc2l0aW9uLmlzUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9saW5lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBwb3NpdGlvbi53aXRoKDAsIDApO1xuXHRcdH1cblxuXHRcdGxldCB7IGxpbmUsIGNoYXJhY3RlciB9ID0gcG9zaXRpb247XG5cdFx0bGV0IGhhc0NoYW5nZWQgPSBmYWxzZTtcblxuXHRcdGlmIChsaW5lIDwgMCkge1xuXHRcdFx0bGluZSA9IDA7XG5cdFx0XHRjaGFyYWN0ZXIgPSAwO1xuXHRcdFx0aGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKGxpbmUgPj0gdGhpcy5fbGluZXMubGVuZ3RoKSB7XG5cdFx0XHRsaW5lID0gdGhpcy5fbGluZXMubGVuZ3RoIC0gMTtcblx0XHRcdGNoYXJhY3RlciA9IHRoaXMuX2xpbmVzW2xpbmVdLmxlbmd0aDtcblx0XHRcdGhhc0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IG1heENoYXJhY3RlciA9IHRoaXMuX2xpbmVzW2xpbmVdLmxlbmd0aDtcblx0XHRcdGlmIChjaGFyYWN0ZXIgPCAwKSB7XG5cdFx0XHRcdGNoYXJhY3RlciA9IDA7XG5cdFx0XHRcdGhhc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoY2hhcmFjdGVyID4gbWF4Q2hhcmFjdGVyKSB7XG5cdFx0XHRcdGNoYXJhY3RlciA9IG1heENoYXJhY3Rlcjtcblx0XHRcdFx0aGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFoYXNDaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm4gcG9zaXRpb247XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZSwgY2hhcmFjdGVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFdvcmRSYW5nZUF0UG9zaXRpb24oX3Bvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sIHJlZ2V4cD86IFJlZ0V4cCk6IHZzY29kZS5SYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl92YWxpZGF0ZVBvc2l0aW9uKF9wb3NpdGlvbik7XG5cblx0XHRpZiAoIXJlZ2V4cCkge1xuXHRcdFx0Ly8gdXNlIGRlZmF1bHQgd2hlbiBjdXN0b20tcmVnZXhwIGlzbid0IHByb3ZpZGVkXG5cdFx0XHRyZWdleHAgPSBnZXRXb3JkRGVmaW5pdGlvbkZvcih0aGlzLl9sYW5ndWFnZUlkKTtcblxuXHRcdH0gZWxzZSBpZiAocmVnRXhwTGVhZHNUb0VuZGxlc3NMb29wKHJlZ2V4cCkpIHtcblx0XHRcdC8vIHVzZSBkZWZhdWx0IHdoZW4gY3VzdG9tLXJlZ2V4cCBpcyBiYWRcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2dldFdvcmRSYW5nZUF0UG9zaXRpb25dOiBpZ25vcmluZyBjdXN0b20gcmVnZXhwICcke3JlZ2V4cC5zb3VyY2V9JyBiZWNhdXNlIGl0IG1hdGNoZXMgdGhlIGVtcHR5IHN0cmluZy5gKTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JkQXRUZXh0ID0gZ2V0V29yZEF0VGV4dChcblx0XHRcdHBvc2l0aW9uLmNoYXJhY3RlciArIDEsXG5cdFx0XHRlbnN1cmVWYWxpZFdvcmREZWZpbml0aW9uKHJlZ2V4cCksXG5cdFx0XHR0aGlzLl9saW5lc1twb3NpdGlvbi5saW5lXSxcblx0XHRcdDBcblx0XHQpO1xuXG5cdFx0aWYgKHdvcmRBdFRleHQpIHtcblx0XHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZSwgd29yZEF0VGV4dC5zdGFydENvbHVtbiAtIDEsIHBvc2l0aW9uLmxpbmUsIHdvcmRBdFRleHQuZW5kQ29sdW1uIC0gMSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3REb2N1bWVudExpbmUgaW1wbGVtZW50cyB2c2NvZGUuVGV4dExpbmUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmU6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0xhc3RMaW5lOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGxpbmU6IG51bWJlciwgdGV4dDogc3RyaW5nLCBpc0xhc3RMaW5lOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbGluZSA9IGxpbmU7XG5cdFx0dGhpcy5fdGV4dCA9IHRleHQ7XG5cdFx0dGhpcy5faXNMYXN0TGluZSA9IGlzTGFzdExpbmU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGxpbmVOdW1iZXIoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdGV4dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90ZXh0O1xuXHR9XG5cblx0cHVibGljIGdldCByYW5nZSgpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZSh0aGlzLl9saW5lLCAwLCB0aGlzLl9saW5lLCB0aGlzLl90ZXh0Lmxlbmd0aCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJhbmdlSW5jbHVkaW5nTGluZUJyZWFrKCk6IFJhbmdlIHtcblx0XHRpZiAodGhpcy5faXNMYXN0TGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmFuZ2U7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmFuZ2UodGhpcy5fbGluZSwgMCwgdGhpcy5fbGluZSArIDEsIDApO1xuXHR9XG5cblx0cHVibGljIGdldCBmaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXJJbmRleCgpOiBudW1iZXIge1xuXHRcdC8vVE9ET0BhcGksIHJlbmFtZSB0byAnbGVhZGluZ1doaXRlc3BhY2VMZW5ndGgnXG5cdFx0cmV0dXJuIC9eKFxccyopLy5leGVjKHRoaXMuX3RleHQpIVsxXS5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzRW1wdHlPcldoaXRlc3BhY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVySW5kZXggPT09IHRoaXMuX3RleHQubGVuZ3RoO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVU7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCLHFCQUFxQjtBQUV6RCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBRXRCLE1BQU0sNkJBQTZCLG9CQUFJLElBQW9CO0FBQ3BELFNBQVMscUJBQXFCLFlB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QUFJLENBQUMsWUFBWTtBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sSUFBSSxTQUFTLE1BQU0sU0FBUztBQUFBLEVBQ3BDO0FBQUEsRUFFUSx3QkFBd0IsV0FBNEIsUUFBMkM7QUFDdEcsVUFBTSxXQUFXLEtBQUssa0JBQWtCLFNBQVM7QUFFakQsUUFBSSxDQUFDLFFBQVE7QUFFWixlQUFTLHFCQUFxQixLQUFLLFdBQVc7QUFBQSxJQUUvQyxXQUFXLHlCQUF5QixNQUFNLEdBQUc7QUFFNUMsWUFBTSxJQUFJLE1BQU0scURBQXFELE9BQU8sTUFBTSx3Q0FBd0M7QUFBQSxJQUMzSDtBQUVBLFVBQU0sYUFBYTtBQUFBLE1BQ2xCLFNBQVMsWUFBWTtBQUFBLE1BQ3JCLDBCQUEwQixNQUFNO0FBQUEsTUFDaEMsS0FBSyxPQUFPLFNBQVMsSUFBSTtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUVBLFFBQUksWUFBWTtBQUNmLGFBQU8sSUFBSSxNQUFNLFNBQVMsTUFBTSxXQUFXLGNBQWMsR0FBRyxTQUFTLE1BQU0sV0FBVyxZQUFZLENBQUM7QUFBQSxJQUNwRztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFTyxNQUFNLG9CQUErQztBQUFBLEVBTTNELFlBQVksTUFBYyxNQUFjLFlBQXFCO0FBQzVELFNBQUssUUFBUTtBQUNiLFNBQUssUUFBUTtBQUNiLFNBQUssY0FBYztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxJQUFXLGFBQXFCO0FBQy9CLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQVcsT0FBZTtBQUN6QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFXLFFBQWU7QUFDekIsV0FBTyxJQUFJLE1BQU0sS0FBSyxPQUFPLEdBQUcsS0FBSyxPQUFPLEtBQUssTUFBTSxNQUFNO0FBQUEsRUFDOUQ7QUFBQSxFQUVBLElBQVcsMEJBQWlDO0FBQzNDLFFBQUksS0FBSyxhQUFhO0FBQ3JCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPLElBQUksTUFBTSxLQUFLLE9BQU8sR0FBRyxLQUFLLFFBQVEsR0FBRyxDQUFDO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLElBQVcsbUNBQTJDO0FBRXJELFdBQU8sU0FBUyxLQUFLLEtBQUssS0FBSyxFQUFHLENBQUMsRUFBRTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxJQUFXLHNCQUErQjtBQUN6QyxXQUFPLEtBQUsscUNBQXFDLEtBQUssTUFBTTtBQUFBLEVBQzdEO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
