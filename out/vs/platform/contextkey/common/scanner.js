import { CharCode } from "../../../base/common/charCode.js";
import { illegalState } from "../../../base/common/errors.js";
import { localize } from "../../../nls.js";
var TokenType = /* @__PURE__ */ ((TokenType2) => {
  TokenType2[TokenType2["LParen"] = 0] = "LParen";
  TokenType2[TokenType2["RParen"] = 1] = "RParen";
  TokenType2[TokenType2["Neg"] = 2] = "Neg";
  TokenType2[TokenType2["Eq"] = 3] = "Eq";
  TokenType2[TokenType2["NotEq"] = 4] = "NotEq";
  TokenType2[TokenType2["Lt"] = 5] = "Lt";
  TokenType2[TokenType2["LtEq"] = 6] = "LtEq";
  TokenType2[TokenType2["Gt"] = 7] = "Gt";
  TokenType2[TokenType2["GtEq"] = 8] = "GtEq";
  TokenType2[TokenType2["RegexOp"] = 9] = "RegexOp";
  TokenType2[TokenType2["RegexStr"] = 10] = "RegexStr";
  TokenType2[TokenType2["True"] = 11] = "True";
  TokenType2[TokenType2["False"] = 12] = "False";
  TokenType2[TokenType2["In"] = 13] = "In";
  TokenType2[TokenType2["Not"] = 14] = "Not";
  TokenType2[TokenType2["And"] = 15] = "And";
  TokenType2[TokenType2["Or"] = 16] = "Or";
  TokenType2[TokenType2["Str"] = 17] = "Str";
  TokenType2[TokenType2["QuotedStr"] = 18] = "QuotedStr";
  TokenType2[TokenType2["Error"] = 19] = "Error";
  TokenType2[TokenType2["EOF"] = 20] = "EOF";
  return TokenType2;
})(TokenType || {});
function hintDidYouMean(...meant) {
  switch (meant.length) {
    case 1:
      return localize("contextkey.scanner.hint.didYouMean1", "Did you mean {0}?", meant[0]);
    case 2:
      return localize("contextkey.scanner.hint.didYouMean2", "Did you mean {0} or {1}?", meant[0], meant[1]);
    case 3:
      return localize("contextkey.scanner.hint.didYouMean3", "Did you mean {0}, {1} or {2}?", meant[0], meant[1], meant[2]);
    default:
      return void 0;
  }
}
const hintDidYouForgetToOpenOrCloseQuote = localize("contextkey.scanner.hint.didYouForgetToOpenOrCloseQuote", "Did you forget to open or close the quote?");
const hintDidYouForgetToEscapeSlash = localize("contextkey.scanner.hint.didYouForgetToEscapeSlash", "Did you forget to escape the '/' (slash) character? Put two backslashes before it to escape, e.g., '\\\\/'.");
const _Scanner = class _Scanner {
  constructor() {
    this._input = "";
    this._start = 0;
    this._current = 0;
    this._tokens = [];
    this._errors = [];
    // u - unicode, y - sticky // TODO@ulugbekna: we accept double quotes as part of the string rather than as a delimiter (to preserve old parser's behavior)
    this.stringRe = /[a-zA-Z0-9_<>\-\./\\:\*\?\+\[\]\^,#@;"%\$\p{L}-]+/uy;
  }
  static getLexeme(token) {
    switch (token.type) {
      case 0 /* LParen */:
        return "(";
      case 1 /* RParen */:
        return ")";
      case 2 /* Neg */:
        return "!";
      case 3 /* Eq */:
        return token.isTripleEq ? "===" : "==";
      case 4 /* NotEq */:
        return token.isTripleEq ? "!==" : "!=";
      case 5 /* Lt */:
        return "<";
      case 6 /* LtEq */:
        return "<=";
      case 7 /* Gt */:
        return ">";
      case 8 /* GtEq */:
        return ">=";
      case 9 /* RegexOp */:
        return "=~";
      case 10 /* RegexStr */:
        return token.lexeme;
      case 11 /* True */:
        return "true";
      case 12 /* False */:
        return "false";
      case 13 /* In */:
        return "in";
      case 14 /* Not */:
        return "not";
      case 15 /* And */:
        return "&&";
      case 16 /* Or */:
        return "||";
      case 17 /* Str */:
        return token.lexeme;
      case 18 /* QuotedStr */:
        return token.lexeme;
      case 19 /* Error */:
        return token.lexeme;
      case 20 /* EOF */:
        return "EOF";
      default:
        throw illegalState(`unhandled token type: ${JSON.stringify(token)}; have you forgotten to add a case?`);
    }
  }
  get errors() {
    return this._errors;
  }
  reset(value) {
    this._input = value;
    this._start = 0;
    this._current = 0;
    this._tokens = [];
    this._errors = [];
    return this;
  }
  scan() {
    while (!this._isAtEnd()) {
      this._start = this._current;
      const ch = this._advance();
      switch (ch) {
        case CharCode.OpenParen:
          this._addToken(0 /* LParen */);
          break;
        case CharCode.CloseParen:
          this._addToken(1 /* RParen */);
          break;
        case CharCode.ExclamationMark:
          if (this._match(CharCode.Equals)) {
            const isTripleEq = this._match(CharCode.Equals);
            this._tokens.push({ type: 4 /* NotEq */, offset: this._start, isTripleEq });
          } else {
            this._addToken(2 /* Neg */);
          }
          break;
        case CharCode.SingleQuote:
          this._quotedString();
          break;
        case CharCode.Slash:
          this._regex();
          break;
        case CharCode.Equals:
          if (this._match(CharCode.Equals)) {
            const isTripleEq = this._match(CharCode.Equals);
            this._tokens.push({ type: 3 /* Eq */, offset: this._start, isTripleEq });
          } else if (this._match(CharCode.Tilde)) {
            this._addToken(9 /* RegexOp */);
          } else {
            this._error(hintDidYouMean("==", "=~"));
          }
          break;
        case CharCode.LessThan:
          this._addToken(this._match(CharCode.Equals) ? 6 /* LtEq */ : 5 /* Lt */);
          break;
        case CharCode.GreaterThan:
          this._addToken(this._match(CharCode.Equals) ? 8 /* GtEq */ : 7 /* Gt */);
          break;
        case CharCode.Ampersand:
          if (this._match(CharCode.Ampersand)) {
            this._addToken(15 /* And */);
          } else {
            this._error(hintDidYouMean("&&"));
          }
          break;
        case CharCode.Pipe:
          if (this._match(CharCode.Pipe)) {
            this._addToken(16 /* Or */);
          } else {
            this._error(hintDidYouMean("||"));
          }
          break;
        // TODO@ulugbekna: 1) rewrite using a regex 2) reconsider what characters are considered whitespace, including unicode, nbsp, etc.
        case CharCode.Space:
        case CharCode.CarriageReturn:
        case CharCode.Tab:
        case CharCode.LineFeed:
        case CharCode.NoBreakSpace:
          break;
        default:
          this._string();
      }
    }
    this._start = this._current;
    this._addToken(20 /* EOF */);
    return Array.from(this._tokens);
  }
  _match(expected) {
    if (this._isAtEnd()) {
      return false;
    }
    if (this._input.charCodeAt(this._current) !== expected) {
      return false;
    }
    this._current++;
    return true;
  }
  _advance() {
    return this._input.charCodeAt(this._current++);
  }
  _peek() {
    return this._isAtEnd() ? CharCode.Null : this._input.charCodeAt(this._current);
  }
  _addToken(type) {
    this._tokens.push({ type, offset: this._start });
  }
  _error(additional) {
    const offset = this._start;
    const lexeme = this._input.substring(this._start, this._current);
    const errToken = { type: 19 /* Error */, offset: this._start, lexeme };
    this._errors.push({ offset, lexeme, additionalInfo: additional });
    this._tokens.push(errToken);
  }
  _string() {
    this.stringRe.lastIndex = this._start;
    const match = this.stringRe.exec(this._input);
    if (match) {
      this._current = this._start + match[0].length;
      const lexeme = this._input.substring(this._start, this._current);
      const keyword = _Scanner._keywords.get(lexeme);
      if (keyword) {
        this._addToken(keyword);
      } else {
        this._tokens.push({ type: 17 /* Str */, lexeme, offset: this._start });
      }
    }
  }
  // captures the lexeme without the leading and trailing '
  _quotedString() {
    while (this._peek() !== CharCode.SingleQuote && !this._isAtEnd()) {
      this._advance();
    }
    if (this._isAtEnd()) {
      this._error(hintDidYouForgetToOpenOrCloseQuote);
      return;
    }
    this._advance();
    this._tokens.push({ type: 18 /* QuotedStr */, lexeme: this._input.substring(this._start + 1, this._current - 1), offset: this._start + 1 });
  }
  /*
   * Lexing a regex expression: /.../[igsmyu]*
   * Based on https://github.com/microsoft/TypeScript/blob/9247ef115e617805983740ba795d7a8164babf89/src/compiler/scanner.ts#L2129-L2181
   *
   * Note that we want slashes within a regex to be escaped, e.g., /file:\\/\\/\\// should match `file:///`
   */
  _regex() {
    let p = this._current;
    let inEscape = false;
    let inCharacterClass = false;
    while (true) {
      if (p >= this._input.length) {
        this._current = p;
        this._error(hintDidYouForgetToEscapeSlash);
        return;
      }
      const ch = this._input.charCodeAt(p);
      if (inEscape) {
        inEscape = false;
      } else if (ch === CharCode.Slash && !inCharacterClass) {
        p++;
        break;
      } else if (ch === CharCode.OpenSquareBracket) {
        inCharacterClass = true;
      } else if (ch === CharCode.Backslash) {
        inEscape = true;
      } else if (ch === CharCode.CloseSquareBracket) {
        inCharacterClass = false;
      }
      p++;
    }
    while (p < this._input.length && _Scanner._regexFlags.has(this._input.charCodeAt(p))) {
      p++;
    }
    this._current = p;
    const lexeme = this._input.substring(this._start, this._current);
    this._tokens.push({ type: 10 /* RegexStr */, lexeme, offset: this._start });
  }
  _isAtEnd() {
    return this._current >= this._input.length;
  }
};
_Scanner._regexFlags = new Set(["i", "g", "s", "m", "y", "u"].map((ch) => ch.charCodeAt(0)));
_Scanner._keywords = /* @__PURE__ */ new Map([
  ["not", 14 /* Not */],
  ["in", 13 /* In */],
  ["false", 12 /* False */],
  ["true", 11 /* True */]
]);
let Scanner = _Scanner;
export {
  Scanner,
  TokenType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL3NjYW5uZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IGlsbGVnYWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRva2VuVHlwZSB7XG5cdExQYXJlbixcblx0UlBhcmVuLFxuXHROZWcsXG5cdEVxLFxuXHROb3RFcSxcblx0THQsXG5cdEx0RXEsXG5cdEd0LFxuXHRHdEVxLFxuXHRSZWdleE9wLFxuXHRSZWdleFN0cixcblx0VHJ1ZSxcblx0RmFsc2UsXG5cdEluLFxuXHROb3QsXG5cdEFuZCxcblx0T3IsXG5cdFN0cixcblx0UXVvdGVkU3RyLFxuXHRFcnJvcixcblx0RU9GLFxufVxuXG5leHBvcnQgdHlwZSBUb2tlbiA9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuTFBhcmVuOyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuUlBhcmVuOyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuTmVnOyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuRXE7IG9mZnNldDogbnVtYmVyOyBpc1RyaXBsZUVxOiBib29sZWFuIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5Ob3RFcTsgb2Zmc2V0OiBudW1iZXI7IGlzVHJpcGxlRXE6IGJvb2xlYW4gfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkx0OyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuTHRFcTsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkd0OyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuR3RFcTsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLlJlZ2V4T3A7IG9mZnNldDogbnVtYmVyIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5SZWdleFN0cjsgb2Zmc2V0OiBudW1iZXI7IGxleGVtZTogc3RyaW5nIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5UcnVlOyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuRmFsc2U7IG9mZnNldDogbnVtYmVyIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5Jbjsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLk5vdDsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkFuZDsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLk9yOyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuU3RyOyBvZmZzZXQ6IG51bWJlcjsgbGV4ZW1lOiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLlF1b3RlZFN0cjsgb2Zmc2V0OiBudW1iZXI7IGxleGVtZTogc3RyaW5nIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5FcnJvcjsgb2Zmc2V0OiBudW1iZXI7IGxleGVtZTogc3RyaW5nIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5FT0Y7IG9mZnNldDogbnVtYmVyIH07XG5cbnR5cGUgS2V5d29yZFRva2VuVHlwZSA9IFRva2VuVHlwZS5Ob3QgfCBUb2tlblR5cGUuSW4gfCBUb2tlblR5cGUuRmFsc2UgfCBUb2tlblR5cGUuVHJ1ZTtcbnR5cGUgVG9rZW5UeXBlV2l0aG91dExleGVtZSA9XG5cdFRva2VuVHlwZS5MUGFyZW4gfFxuXHRUb2tlblR5cGUuUlBhcmVuIHxcblx0VG9rZW5UeXBlLk5lZyB8XG5cdFRva2VuVHlwZS5MdCB8XG5cdFRva2VuVHlwZS5MdEVxIHxcblx0VG9rZW5UeXBlLkd0IHxcblx0VG9rZW5UeXBlLkd0RXEgfFxuXHRUb2tlblR5cGUuUmVnZXhPcCB8XG5cdFRva2VuVHlwZS5UcnVlIHxcblx0VG9rZW5UeXBlLkZhbHNlIHxcblx0VG9rZW5UeXBlLkluIHxcblx0VG9rZW5UeXBlLk5vdCB8XG5cdFRva2VuVHlwZS5BbmQgfFxuXHRUb2tlblR5cGUuT3IgfFxuXHRUb2tlblR5cGUuRU9GO1xuXG4vKipcbiAqIEV4YW1wbGU6XG4gKiBgZm9vID09IGJhcidgIC0gbm90ZSBob3cgc2luZ2xlIHF1b3RlIGRvZXNuJ3QgaGF2ZSBhIGNvcnJlc3BvbmRpbmcgY2xvc2luZyBxdW90ZSxcbiAqIHNvIGl0J3MgcmVwb3J0ZWQgYXMgdW5leHBlY3RlZFxuICovXG5leHBvcnQgdHlwZSBMZXhpbmdFcnJvciA9IHtcblx0b2Zmc2V0OiBudW1iZXI7IC8qKiBub3RlIHRoYXQgdGhpcyBkb2Vzbid0IHRha2UgaW50byBhY2NvdW50IGVzY2FwZSBjaGFyYWN0ZXJzIGZyb20gdGhlIG9yaWdpbmFsIGVuY29kaW5nIG9mIHRoZSBzdHJpbmcsIGUuZy4sIHdpdGhpbiBhbiBleHRlbnNpb24gbWFuaWZlc3QgZmlsZSdzIEpTT04gZW5jb2RpbmcgICovXG5cdGxleGVtZTogc3RyaW5nO1xuXHRhZGRpdGlvbmFsSW5mbz86IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIGhpbnREaWRZb3VNZWFuKC4uLm1lYW50OiBzdHJpbmdbXSkge1xuXHRzd2l0Y2ggKG1lYW50Lmxlbmd0aCkge1xuXHRcdGNhc2UgMTpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY29udGV4dGtleS5zY2FubmVyLmhpbnQuZGlkWW91TWVhbjEnLCBcIkRpZCB5b3UgbWVhbiB7MH0/XCIsIG1lYW50WzBdKTtcblx0XHRjYXNlIDI6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRrZXkuc2Nhbm5lci5oaW50LmRpZFlvdU1lYW4yJywgXCJEaWQgeW91IG1lYW4gezB9IG9yIHsxfT9cIiwgbWVhbnRbMF0sIG1lYW50WzFdKTtcblx0XHRjYXNlIDM6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRrZXkuc2Nhbm5lci5oaW50LmRpZFlvdU1lYW4zJywgXCJEaWQgeW91IG1lYW4gezB9LCB7MX0gb3IgezJ9P1wiLCBtZWFudFswXSwgbWVhbnRbMV0sIG1lYW50WzJdKTtcblx0XHRkZWZhdWx0OiAvLyB3ZSBqdXN0IGRvbid0IGV4cGVjdCB0aGF0IG1hbnlcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY29uc3QgaGludERpZFlvdUZvcmdldFRvT3Blbk9yQ2xvc2VRdW90ZSA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnNjYW5uZXIuaGludC5kaWRZb3VGb3JnZXRUb09wZW5PckNsb3NlUXVvdGUnLCBcIkRpZCB5b3UgZm9yZ2V0IHRvIG9wZW4gb3IgY2xvc2UgdGhlIHF1b3RlP1wiKTtcbmNvbnN0IGhpbnREaWRZb3VGb3JnZXRUb0VzY2FwZVNsYXNoID0gbG9jYWxpemUoJ2NvbnRleHRrZXkuc2Nhbm5lci5oaW50LmRpZFlvdUZvcmdldFRvRXNjYXBlU2xhc2gnLCBcIkRpZCB5b3UgZm9yZ2V0IHRvIGVzY2FwZSB0aGUgJy8nIChzbGFzaCkgY2hhcmFjdGVyPyBQdXQgdHdvIGJhY2tzbGFzaGVzIGJlZm9yZSBpdCB0byBlc2NhcGUsIGUuZy4sICdcXFxcXFxcXC9cXCcuXCIpO1xuXG4vKipcbiAqIEEgc2ltcGxlIHNjYW5uZXIgZm9yIGNvbnRleHQga2V5cy5cbiAqXG4gKiBFeGFtcGxlOlxuICpcbiAqIGBgYHRzXG4gKiBjb25zdCBzY2FubmVyID0gbmV3IFNjYW5uZXIoKS5yZXNldCgncmVzb3VyY2VGaWxlTmFtZSA9fiAvZG9ja2VyLyAmJiAhY29uZmlnLmRvY2tlci5lbmFibGVkJyk7XG4gKiBjb25zdCB0b2tlbnMgPSBbLi4uc2Nhbm5lcl07XG4gKiBpZiAoc2Nhbm5lci5lcnJvclRva2Vucy5sZW5ndGggPiAwKSB7XG4gKiAgICAgc2Nhbm5lci5lcnJvclRva2Vucy5mb3JFYWNoKGVyciA9PiBjb25zb2xlLmVycm9yKGBVbmV4cGVjdGVkIHRva2VuIGF0ICR7ZXJyLm9mZnNldH06ICR7ZXJyLmxleGVtZX1cXG5IaW50OiAke2Vyci5hZGRpdGlvbmFsfWApKTtcbiAqIH0gZWxzZSB7XG4gKiAgICAgLy8gcHJvY2VzcyB0b2tlbnNcbiAqIH1cbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgU2Nhbm5lciB7XG5cblx0c3RhdGljIGdldExleGVtZSh0b2tlbjogVG9rZW4pOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodG9rZW4udHlwZSkge1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuTFBhcmVuOlxuXHRcdFx0XHRyZXR1cm4gJygnO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuUlBhcmVuOlxuXHRcdFx0XHRyZXR1cm4gJyknO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuTmVnOlxuXHRcdFx0XHRyZXR1cm4gJyEnO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuRXE6XG5cdFx0XHRcdHJldHVybiB0b2tlbi5pc1RyaXBsZUVxID8gJz09PScgOiAnPT0nO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuTm90RXE6XG5cdFx0XHRcdHJldHVybiB0b2tlbi5pc1RyaXBsZUVxID8gJyE9PScgOiAnIT0nO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuTHQ6XG5cdFx0XHRcdHJldHVybiAnPCc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5MdEVxOlxuXHRcdFx0XHRyZXR1cm4gJzw9Jztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkd0OlxuXHRcdFx0XHRyZXR1cm4gJz4nO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuR3RFcTpcblx0XHRcdFx0cmV0dXJuICc+PSc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5SZWdleE9wOlxuXHRcdFx0XHRyZXR1cm4gJz1+Jztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlJlZ2V4U3RyOlxuXHRcdFx0XHRyZXR1cm4gdG9rZW4ubGV4ZW1lO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuVHJ1ZTpcblx0XHRcdFx0cmV0dXJuICd0cnVlJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkZhbHNlOlxuXHRcdFx0XHRyZXR1cm4gJ2ZhbHNlJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkluOlxuXHRcdFx0XHRyZXR1cm4gJ2luJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLk5vdDpcblx0XHRcdFx0cmV0dXJuICdub3QnO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuQW5kOlxuXHRcdFx0XHRyZXR1cm4gJyYmJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLk9yOlxuXHRcdFx0XHRyZXR1cm4gJ3x8Jztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlN0cjpcblx0XHRcdFx0cmV0dXJuIHRva2VuLmxleGVtZTtcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlF1b3RlZFN0cjpcblx0XHRcdFx0cmV0dXJuIHRva2VuLmxleGVtZTtcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkVycm9yOlxuXHRcdFx0XHRyZXR1cm4gdG9rZW4ubGV4ZW1lO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuRU9GOlxuXHRcdFx0XHRyZXR1cm4gJ0VPRic7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBpbGxlZ2FsU3RhdGUoYHVuaGFuZGxlZCB0b2tlbiB0eXBlOiAke0pTT04uc3RyaW5naWZ5KHRva2VuKX07IGhhdmUgeW91IGZvcmdvdHRlbiB0byBhZGQgYSBjYXNlP2ApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWdleEZsYWdzID0gbmV3IFNldChbJ2knLCAnZycsICdzJywgJ20nLCAneScsICd1J10ubWFwKGNoID0+IGNoLmNoYXJDb2RlQXQoMCkpKTtcblxuXHRwcml2YXRlIHN0YXRpYyBfa2V5d29yZHMgPSBuZXcgTWFwPHN0cmluZywgS2V5d29yZFRva2VuVHlwZT4oW1xuXHRcdFsnbm90JywgVG9rZW5UeXBlLk5vdF0sXG5cdFx0WydpbicsIFRva2VuVHlwZS5Jbl0sXG5cdFx0WydmYWxzZScsIFRva2VuVHlwZS5GYWxzZV0sXG5cdFx0Wyd0cnVlJywgVG9rZW5UeXBlLlRydWVdLFxuXHRdKTtcblxuXHRwcml2YXRlIF9pbnB1dDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX3N0YXJ0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9jdXJyZW50OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF90b2tlbnM6IFRva2VuW10gPSBbXTtcblx0cHJpdmF0ZSBfZXJyb3JzOiBMZXhpbmdFcnJvcltdID0gW107XG5cblx0Z2V0IGVycm9ycygpOiBSZWFkb25seTxMZXhpbmdFcnJvcltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vycm9ycztcblx0fVxuXG5cdHJlc2V0KHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9pbnB1dCA9IHZhbHVlO1xuXG5cdFx0dGhpcy5fc3RhcnQgPSAwO1xuXHRcdHRoaXMuX2N1cnJlbnQgPSAwO1xuXHRcdHRoaXMuX3Rva2VucyA9IFtdO1xuXHRcdHRoaXMuX2Vycm9ycyA9IFtdO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRzY2FuKCkge1xuXHRcdHdoaWxlICghdGhpcy5faXNBdEVuZCgpKSB7XG5cblx0XHRcdHRoaXMuX3N0YXJ0ID0gdGhpcy5fY3VycmVudDtcblxuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRzd2l0Y2ggKGNoKSB7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuT3BlblBhcmVuOiB0aGlzLl9hZGRUb2tlbihUb2tlblR5cGUuTFBhcmVuKTsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuQ2xvc2VQYXJlbjogdGhpcy5fYWRkVG9rZW4oVG9rZW5UeXBlLlJQYXJlbik7IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuRXhjbGFtYXRpb25NYXJrOlxuXHRcdFx0XHRcdGlmICh0aGlzLl9tYXRjaChDaGFyQ29kZS5FcXVhbHMpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpc1RyaXBsZUVxID0gdGhpcy5fbWF0Y2goQ2hhckNvZGUuRXF1YWxzKTsgLy8gZWF0IGxhc3QgYD1gIGlmIGAhPT1gXG5cdFx0XHRcdFx0XHR0aGlzLl90b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5Ob3RFcSwgb2Zmc2V0OiB0aGlzLl9zdGFydCwgaXNUcmlwbGVFcSB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWRkVG9rZW4oVG9rZW5UeXBlLk5lZyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuU2luZ2xlUXVvdGU6IHRoaXMuX3F1b3RlZFN0cmluZygpOyBicmVhaztcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5TbGFzaDogdGhpcy5fcmVnZXgoKTsgYnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5FcXVhbHM6XG5cdFx0XHRcdFx0aWYgKHRoaXMuX21hdGNoKENoYXJDb2RlLkVxdWFscykpIHsgLy8gc3VwcG9ydCBgPT1gXG5cdFx0XHRcdFx0XHRjb25zdCBpc1RyaXBsZUVxID0gdGhpcy5fbWF0Y2goQ2hhckNvZGUuRXF1YWxzKTsgLy8gZWF0IGxhc3QgYD1gIGlmIGA9PT1gXG5cdFx0XHRcdFx0XHR0aGlzLl90b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5FcSwgb2Zmc2V0OiB0aGlzLl9zdGFydCwgaXNUcmlwbGVFcSB9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX21hdGNoKENoYXJDb2RlLlRpbGRlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWRkVG9rZW4oVG9rZW5UeXBlLlJlZ2V4T3ApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcihoaW50RGlkWW91TWVhbignPT0nLCAnPX4nKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuTGVzc1RoYW46IHRoaXMuX2FkZFRva2VuKHRoaXMuX21hdGNoKENoYXJDb2RlLkVxdWFscykgPyBUb2tlblR5cGUuTHRFcSA6IFRva2VuVHlwZS5MdCk7IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuR3JlYXRlclRoYW46IHRoaXMuX2FkZFRva2VuKHRoaXMuX21hdGNoKENoYXJDb2RlLkVxdWFscykgPyBUb2tlblR5cGUuR3RFcSA6IFRva2VuVHlwZS5HdCk7IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuQW1wZXJzYW5kOlxuXHRcdFx0XHRcdGlmICh0aGlzLl9tYXRjaChDaGFyQ29kZS5BbXBlcnNhbmQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hZGRUb2tlbihUb2tlblR5cGUuQW5kKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3IoaGludERpZFlvdU1lYW4oJyYmJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlBpcGU6XG5cdFx0XHRcdFx0aWYgKHRoaXMuX21hdGNoKENoYXJDb2RlLlBpcGUpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hZGRUb2tlbihUb2tlblR5cGUuT3IpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lcnJvcihoaW50RGlkWW91TWVhbignfHwnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdC8vIFRPRE9AdWx1Z2Jla25hOiAxKSByZXdyaXRlIHVzaW5nIGEgcmVnZXggMikgcmVjb25zaWRlciB3aGF0IGNoYXJhY3RlcnMgYXJlIGNvbnNpZGVyZWQgd2hpdGVzcGFjZSwgaW5jbHVkaW5nIHVuaWNvZGUsIG5ic3AsIGV0Yy5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5TcGFjZTpcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybjpcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5UYWI6XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuTGluZUZlZWQ6XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuTm9CcmVha1NwYWNlOiAvLyAmbmJzcFxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhpcy5fc3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhcnQgPSB0aGlzLl9jdXJyZW50O1xuXHRcdHRoaXMuX2FkZFRva2VuKFRva2VuVHlwZS5FT0YpO1xuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fdG9rZW5zKTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoKGV4cGVjdGVkOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXNBdEVuZCgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pbnB1dC5jaGFyQ29kZUF0KHRoaXMuX2N1cnJlbnQpICE9PSBleHBlY3RlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50Kys7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9hZHZhbmNlKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0LmNoYXJDb2RlQXQodGhpcy5fY3VycmVudCsrKTtcblx0fVxuXG5cdHByaXZhdGUgX3BlZWsoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5faXNBdEVuZCgpID8gQ2hhckNvZGUuTnVsbCA6IHRoaXMuX2lucHV0LmNoYXJDb2RlQXQodGhpcy5fY3VycmVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRUb2tlbih0eXBlOiBUb2tlblR5cGVXaXRob3V0TGV4ZW1lKSB7XG5cdFx0dGhpcy5fdG9rZW5zLnB1c2goeyB0eXBlLCBvZmZzZXQ6IHRoaXMuX3N0YXJ0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXJyb3IoYWRkaXRpb25hbD86IHN0cmluZykge1xuXHRcdGNvbnN0IG9mZnNldCA9IHRoaXMuX3N0YXJ0O1xuXHRcdGNvbnN0IGxleGVtZSA9IHRoaXMuX2lucHV0LnN1YnN0cmluZyh0aGlzLl9zdGFydCwgdGhpcy5fY3VycmVudCk7XG5cdFx0Y29uc3QgZXJyVG9rZW46IFRva2VuID0geyB0eXBlOiBUb2tlblR5cGUuRXJyb3IsIG9mZnNldDogdGhpcy5fc3RhcnQsIGxleGVtZSB9O1xuXHRcdHRoaXMuX2Vycm9ycy5wdXNoKHsgb2Zmc2V0LCBsZXhlbWUsIGFkZGl0aW9uYWxJbmZvOiBhZGRpdGlvbmFsIH0pO1xuXHRcdHRoaXMuX3Rva2Vucy5wdXNoKGVyclRva2VuKTtcblx0fVxuXG5cdC8vIHUgLSB1bmljb2RlLCB5IC0gc3RpY2t5IC8vIFRPRE9AdWx1Z2Jla25hOiB3ZSBhY2NlcHQgZG91YmxlIHF1b3RlcyBhcyBwYXJ0IG9mIHRoZSBzdHJpbmcgcmF0aGVyIHRoYW4gYXMgYSBkZWxpbWl0ZXIgKHRvIHByZXNlcnZlIG9sZCBwYXJzZXIncyBiZWhhdmlvcilcblx0cHJpdmF0ZSBzdHJpbmdSZSA9IC9bYS16QS1aMC05Xzw+XFwtXFwuL1xcXFw6XFwqXFw/XFwrXFxbXFxdXFxeLCNAO1wiJVxcJFxccHtMfS1dKy91eTtcblx0cHJpdmF0ZSBfc3RyaW5nKCkge1xuXHRcdHRoaXMuc3RyaW5nUmUubGFzdEluZGV4ID0gdGhpcy5fc3RhcnQ7XG5cdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLnN0cmluZ1JlLmV4ZWModGhpcy5faW5wdXQpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0dGhpcy5fY3VycmVudCA9IHRoaXMuX3N0YXJ0ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuXHRcdFx0Y29uc3QgbGV4ZW1lID0gdGhpcy5faW5wdXQuc3Vic3RyaW5nKHRoaXMuX3N0YXJ0LCB0aGlzLl9jdXJyZW50KTtcblx0XHRcdGNvbnN0IGtleXdvcmQgPSBTY2FubmVyLl9rZXl3b3Jkcy5nZXQobGV4ZW1lKTtcblx0XHRcdGlmIChrZXl3b3JkKSB7XG5cdFx0XHRcdHRoaXMuX2FkZFRva2VuKGtleXdvcmQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuU3RyLCBsZXhlbWUsIG9mZnNldDogdGhpcy5fc3RhcnQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gY2FwdHVyZXMgdGhlIGxleGVtZSB3aXRob3V0IHRoZSBsZWFkaW5nIGFuZCB0cmFpbGluZyAnXG5cdHByaXZhdGUgX3F1b3RlZFN0cmluZygpIHtcblx0XHR3aGlsZSAodGhpcy5fcGVlaygpICE9PSBDaGFyQ29kZS5TaW5nbGVRdW90ZSAmJiAhdGhpcy5faXNBdEVuZCgpKSB7IC8vIFRPRE9AdWx1Z2Jla25hOiBhZGQgc3VwcG9ydCBmb3IgZXNjYXBpbmcgJyA/XG5cdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzQXRFbmQoKSkge1xuXHRcdFx0dGhpcy5fZXJyb3IoaGludERpZFlvdUZvcmdldFRvT3Blbk9yQ2xvc2VRdW90ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gY29uc3VtZSB0aGUgY2xvc2luZyAnXG5cdFx0dGhpcy5fYWR2YW5jZSgpO1xuXG5cdFx0dGhpcy5fdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuUXVvdGVkU3RyLCBsZXhlbWU6IHRoaXMuX2lucHV0LnN1YnN0cmluZyh0aGlzLl9zdGFydCArIDEsIHRoaXMuX2N1cnJlbnQgLSAxKSwgb2Zmc2V0OiB0aGlzLl9zdGFydCArIDEgfSk7XG5cdH1cblxuXHQvKlxuXHQgKiBMZXhpbmcgYSByZWdleCBleHByZXNzaW9uOiAvLi4uL1tpZ3NteXVdKlxuXHQgKiBCYXNlZCBvbiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L1R5cGVTY3JpcHQvYmxvYi85MjQ3ZWYxMTVlNjE3ODA1OTgzNzQwYmE3OTVkN2E4MTY0YmFiZjg5L3NyYy9jb21waWxlci9zY2FubmVyLnRzI0wyMTI5LUwyMTgxXG5cdCAqXG5cdCAqIE5vdGUgdGhhdCB3ZSB3YW50IHNsYXNoZXMgd2l0aGluIGEgcmVnZXggdG8gYmUgZXNjYXBlZCwgZS5nLiwgL2ZpbGU6XFxcXC9cXFxcL1xcXFwvLyBzaG91bGQgbWF0Y2ggYGZpbGU6Ly8vYFxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnZXgoKSB7XG5cdFx0bGV0IHAgPSB0aGlzLl9jdXJyZW50O1xuXG5cdFx0bGV0IGluRXNjYXBlID0gZmFsc2U7XG5cdFx0bGV0IGluQ2hhcmFjdGVyQ2xhc3MgPSBmYWxzZTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHAgPj0gdGhpcy5faW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnQgPSBwO1xuXHRcdFx0XHR0aGlzLl9lcnJvcihoaW50RGlkWW91Rm9yZ2V0VG9Fc2NhcGVTbGFzaCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLl9pbnB1dC5jaGFyQ29kZUF0KHApO1xuXG5cdFx0XHRpZiAoaW5Fc2NhcGUpIHsgLy8gcGFyc2luZyBhbiBlc2NhcGUgY2hhcmFjdGVyXG5cdFx0XHRcdGluRXNjYXBlID0gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKGNoID09PSBDaGFyQ29kZS5TbGFzaCAmJiAhaW5DaGFyYWN0ZXJDbGFzcykgeyAvLyBlbmQgb2YgcmVnZXhcblx0XHRcdFx0cCsrO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSBpZiAoY2ggPT09IENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0KSB7XG5cdFx0XHRcdGluQ2hhcmFjdGVyQ2xhc3MgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gQ2hhckNvZGUuQmFja3NsYXNoKSB7XG5cdFx0XHRcdGluRXNjYXBlID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoY2ggPT09IENoYXJDb2RlLkNsb3NlU3F1YXJlQnJhY2tldCkge1xuXHRcdFx0XHRpbkNoYXJhY3RlckNsYXNzID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRwKys7XG5cdFx0fVxuXG5cdFx0Ly8gQ29uc3VtZSBmbGFncyAvLyBUT0RPQHVsdWdiZWtuYTogdXNlIHJlZ2V4IGluc3RlYWRcblx0XHR3aGlsZSAocCA8IHRoaXMuX2lucHV0Lmxlbmd0aCAmJiBTY2FubmVyLl9yZWdleEZsYWdzLmhhcyh0aGlzLl9pbnB1dC5jaGFyQ29kZUF0KHApKSkge1xuXHRcdFx0cCsrO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnQgPSBwO1xuXG5cdFx0Y29uc3QgbGV4ZW1lID0gdGhpcy5faW5wdXQuc3Vic3RyaW5nKHRoaXMuX3N0YXJ0LCB0aGlzLl9jdXJyZW50KTtcblx0XHR0aGlzLl90b2tlbnMucHVzaCh7IHR5cGU6IFRva2VuVHlwZS5SZWdleFN0ciwgbGV4ZW1lLCBvZmZzZXQ6IHRoaXMuX3N0YXJ0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNBdEVuZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudCA+PSB0aGlzLl9pbnB1dC5sZW5ndGg7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNB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R0EsU0FBSyxTQUFTO0FBRWQsU0FBSyxRQUFRLEtBQUssRUFBRSxNQUFNLG9CQUFxQixRQUFRLEtBQUssT0FBTyxVQUFVLEtBQUssU0FBUyxHQUFHLEtBQUssV0FBVyxDQUFDLEdBQUcsUUFBUSxLQUFLLFNBQVMsRUFBRSxDQUFDO0FBQUEsRUFDNUk7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLFNBQVM7QUFDaEIsUUFBSSxJQUFJLEtBQUs7QUFFYixRQUFJLFdBQVc7QUFDZixRQUFJLG1CQUFtQjtBQUN2QixXQUFPLE1BQU07QUFDWixVQUFJLEtBQUssS0FBSyxPQUFPLFFBQVE7QUFDNUIsYUFBSyxXQUFXO0FBQ2hCLGFBQUssT0FBTyw2QkFBNkI7QUFDekM7QUFBQSxNQUNEO0FBRUEsWUFBTSxLQUFLLEtBQUssT0FBTyxXQUFXLENBQUM7QUFFbkMsVUFBSSxVQUFVO0FBQ2IsbUJBQVc7QUFBQSxNQUNaLFdBQVcsT0FBTyxTQUFTLFNBQVMsQ0FBQyxrQkFBa0I7QUFDdEQ7QUFDQTtBQUFBLE1BQ0QsV0FBVyxPQUFPLFNBQVMsbUJBQW1CO0FBQzdDLDJCQUFtQjtBQUFBLE1BQ3BCLFdBQVcsT0FBTyxTQUFTLFdBQVc7QUFDckMsbUJBQVc7QUFBQSxNQUNaLFdBQVcsT0FBTyxTQUFTLG9CQUFvQjtBQUM5QywyQkFBbUI7QUFBQSxNQUNwQjtBQUNBO0FBQUEsSUFDRDtBQUdBLFdBQU8sSUFBSSxLQUFLLE9BQU8sVUFBVSxTQUFRLFlBQVksSUFBSSxLQUFLLE9BQU8sV0FBVyxDQUFDLENBQUMsR0FBRztBQUNwRjtBQUFBLElBQ0Q7QUFFQSxTQUFLLFdBQVc7QUFFaEIsVUFBTSxTQUFTLEtBQUssT0FBTyxVQUFVLEtBQUssUUFBUSxLQUFLLFFBQVE7QUFDL0QsU0FBSyxRQUFRLEtBQUssRUFBRSxNQUFNLG1CQUFvQixRQUFRLFFBQVEsS0FBSyxPQUFPLENBQUM7QUFBQSxFQUM1RTtBQUFBLEVBRVEsV0FBVztBQUNsQixXQUFPLEtBQUssWUFBWSxLQUFLLE9BQU87QUFBQSxFQUNyQztBQUNEO0FBM1FhLFNBbURHLGNBQWMsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEdBQUcsRUFBRSxJQUFJLFFBQU0sR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBbkRuRixTQXFERyxZQUFZLG9CQUFJLElBQThCO0FBQUEsRUFDNUQsQ0FBQyxPQUFPLFlBQWE7QUFBQSxFQUNyQixDQUFDLE1BQU0sV0FBWTtBQUFBLEVBQ25CLENBQUMsU0FBUyxjQUFlO0FBQUEsRUFDekIsQ0FBQyxRQUFRLGFBQWM7QUFDeEIsQ0FBQztBQTFESyxJQUFNLFVBQU47IiwKICAibmFtZXMiOiBbIlRva2VuVHlwZSJdCn0K
