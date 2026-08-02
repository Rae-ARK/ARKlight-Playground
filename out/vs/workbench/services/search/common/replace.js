import * as strings from "../../../../base/common/strings.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { buildReplaceStringWithCasePreserved } from "../../../../base/common/search.js";
class ReplacePattern {
  constructor(replaceString, arg2, arg3) {
    this._hasParameters = false;
    this._replacePattern = replaceString;
    let searchPatternInfo;
    let parseParameters;
    if (typeof arg2 === "boolean") {
      parseParameters = arg2;
      this._regExp = arg3;
    } else {
      searchPatternInfo = arg2;
      parseParameters = !!searchPatternInfo.isRegExp;
      this._regExp = strings.createRegExp(searchPatternInfo.pattern, !!searchPatternInfo.isRegExp, { matchCase: searchPatternInfo.isCaseSensitive, wholeWord: searchPatternInfo.isWordMatch, multiline: searchPatternInfo.isMultiline, global: false, unicode: true });
    }
    if (parseParameters) {
      this.parseReplaceString(replaceString);
    }
    if (this._regExp.global) {
      this._regExp = strings.createRegExp(this._regExp.source, true, { matchCase: !this._regExp.ignoreCase, wholeWord: false, multiline: this._regExp.multiline, global: false });
    }
    this._caseOpsRegExp = new RegExp(/([\s\S]*?)((?:\\[uUlL])+?|)(\$[0-9]+)([\s\S]*?)/g);
  }
  get hasParameters() {
    return this._hasParameters;
  }
  get pattern() {
    return this._replacePattern;
  }
  get regExp() {
    return this._regExp;
  }
  /**
  * Returns the replace string for the first match in the given text.
  * If text has no matches then returns null.
  */
  getReplaceString(text, preserveCase) {
    this._regExp.lastIndex = 0;
    const match = this._regExp.exec(text);
    if (match) {
      if (this.hasParameters) {
        const replaceString = this.replaceWithCaseOperations(text, this._regExp, this.buildReplaceString(match, preserveCase));
        if (match[0] === text) {
          return replaceString;
        }
        return replaceString.substr(match.index, match[0].length - (text.length - replaceString.length));
      }
      return this.buildReplaceString(match, preserveCase);
    }
    return null;
  }
  /**
   * replaceWithCaseOperations applies case operations to relevant replacement strings and applies
   * the affected $N arguments. It then passes unaffected $N arguments through to string.replace().
   *
   * \u			=> upper-cases one character in a match.
   * \U			=> upper-cases ALL remaining characters in a match.
   * \l			=> lower-cases one character in a match.
   * \L			=> lower-cases ALL remaining characters in a match.
   */
  replaceWithCaseOperations(text, regex, replaceString) {
    if (!/\\[uUlL]/.test(replaceString)) {
      return text.replace(regex, replaceString);
    }
    const firstMatch = regex.exec(text);
    if (firstMatch === null) {
      return text.replace(regex, replaceString);
    }
    let patMatch;
    let newReplaceString = "";
    let lastIndex = 0;
    let lastMatch = "";
    while ((patMatch = this._caseOpsRegExp.exec(replaceString)) !== null) {
      lastIndex = patMatch.index;
      const fullMatch = patMatch[0];
      lastMatch = fullMatch;
      let caseOps = patMatch[2];
      const money = patMatch[3];
      if (!caseOps) {
        newReplaceString += fullMatch;
        continue;
      }
      const replacement = firstMatch[parseInt(money.slice(1))];
      if (!replacement) {
        newReplaceString += fullMatch;
        continue;
      }
      const replacementLen = replacement.length;
      newReplaceString += patMatch[1];
      caseOps = caseOps.replace(/\\/g, "");
      let i = 0;
      for (; i < caseOps.length; i++) {
        switch (caseOps[i]) {
          case "U":
            newReplaceString += replacement.slice(i).toUpperCase();
            i = replacementLen;
            break;
          case "u":
            newReplaceString += replacement[i].toUpperCase();
            break;
          case "L":
            newReplaceString += replacement.slice(i).toLowerCase();
            i = replacementLen;
            break;
          case "l":
            newReplaceString += replacement[i].toLowerCase();
            break;
        }
      }
      if (i < replacementLen) {
        newReplaceString += replacement.slice(i);
      }
      newReplaceString += patMatch[4];
    }
    newReplaceString += replaceString.slice(lastIndex + lastMatch.length);
    return text.replace(regex, newReplaceString);
  }
  buildReplaceString(matches, preserveCase) {
    if (preserveCase) {
      return buildReplaceStringWithCasePreserved(matches, this._replacePattern);
    } else {
      return this._replacePattern;
    }
  }
  /**
   * \n => LF
   * \t => TAB
   * \\ => \
   * $0 => $& (see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter)
   * everything else stays untouched
   */
  parseReplaceString(replaceString) {
    if (!replaceString || replaceString.length === 0) {
      return;
    }
    let substrFrom = 0, result = "";
    for (let i = 0, len = replaceString.length; i < len; i++) {
      const chCode = replaceString.charCodeAt(i);
      if (chCode === CharCode.Backslash) {
        i++;
        if (i >= len) {
          break;
        }
        const nextChCode = replaceString.charCodeAt(i);
        let replaceWithCharacter = null;
        switch (nextChCode) {
          case CharCode.Backslash:
            replaceWithCharacter = "\\";
            break;
          case CharCode.n:
            replaceWithCharacter = "\n";
            break;
          case CharCode.t:
            replaceWithCharacter = "	";
            break;
        }
        if (replaceWithCharacter) {
          result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
          substrFrom = i + 1;
        }
      }
      if (chCode === CharCode.DollarSign) {
        i++;
        if (i >= len) {
          break;
        }
        const nextChCode = replaceString.charCodeAt(i);
        let replaceWithCharacter = null;
        switch (nextChCode) {
          case CharCode.Digit0:
            replaceWithCharacter = "$&";
            this._hasParameters = true;
            break;
          case CharCode.BackTick:
          case CharCode.SingleQuote:
            this._hasParameters = true;
            break;
          default: {
            if (!this.between(nextChCode, CharCode.Digit1, CharCode.Digit9)) {
              break;
            }
            if (i === replaceString.length - 1) {
              this._hasParameters = true;
              break;
            }
            let charCode = replaceString.charCodeAt(++i);
            if (!this.between(charCode, CharCode.Digit0, CharCode.Digit9)) {
              this._hasParameters = true;
              --i;
              break;
            }
            if (i === replaceString.length - 1) {
              this._hasParameters = true;
              break;
            }
            charCode = replaceString.charCodeAt(++i);
            if (!this.between(charCode, CharCode.Digit0, CharCode.Digit9)) {
              this._hasParameters = true;
              --i;
              break;
            }
            break;
          }
        }
        if (replaceWithCharacter) {
          result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
          substrFrom = i + 1;
        }
      }
    }
    if (substrFrom === 0) {
      return;
    }
    this._replacePattern = result + replaceString.substring(substrFrom);
  }
  between(value, from, to) {
    return from <= value && value <= to;
  }
}
export {
  ReplacePattern
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3JlcGxhY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVBhdHRlcm5JbmZvIH0gZnJvbSAnLi9zZWFyY2guanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBidWlsZFJlcGxhY2VTdHJpbmdXaXRoQ2FzZVByZXNlcnZlZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlYXJjaC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZXBsYWNlUGF0dGVybiB7XG5cblx0cHJpdmF0ZSBfcmVwbGFjZVBhdHRlcm46IHN0cmluZztcblx0cHJpdmF0ZSBfaGFzUGFyYW1ldGVyczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9yZWdFeHA6IFJlZ0V4cDtcblx0cHJpdmF0ZSBfY2FzZU9wc1JlZ0V4cDogUmVnRXhwO1xuXG5cdGNvbnN0cnVjdG9yKHJlcGxhY2VTdHJpbmc6IHN0cmluZywgc2VhcmNoUGF0dGVybkluZm86IElQYXR0ZXJuSW5mbyk7XG5cdGNvbnN0cnVjdG9yKHJlcGxhY2VTdHJpbmc6IHN0cmluZywgcGFyc2VQYXJhbWV0ZXJzOiBib29sZWFuLCByZWdFeDogUmVnRXhwKTtcblx0Y29uc3RydWN0b3IocmVwbGFjZVN0cmluZzogc3RyaW5nLCBhcmcyOiBhbnksIGFyZzM/OiBhbnkpIHtcblx0XHR0aGlzLl9yZXBsYWNlUGF0dGVybiA9IHJlcGxhY2VTdHJpbmc7XG5cdFx0bGV0IHNlYXJjaFBhdHRlcm5JbmZvOiBJUGF0dGVybkluZm87XG5cdFx0bGV0IHBhcnNlUGFyYW1ldGVyczogYm9vbGVhbjtcblx0XHRpZiAodHlwZW9mIGFyZzIgPT09ICdib29sZWFuJykge1xuXHRcdFx0cGFyc2VQYXJhbWV0ZXJzID0gYXJnMjtcblx0XHRcdHRoaXMuX3JlZ0V4cCA9IGFyZzM7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VhcmNoUGF0dGVybkluZm8gPSBhcmcyO1xuXHRcdFx0cGFyc2VQYXJhbWV0ZXJzID0gISFzZWFyY2hQYXR0ZXJuSW5mby5pc1JlZ0V4cDtcblx0XHRcdHRoaXMuX3JlZ0V4cCA9IHN0cmluZ3MuY3JlYXRlUmVnRXhwKHNlYXJjaFBhdHRlcm5JbmZvLnBhdHRlcm4sICEhc2VhcmNoUGF0dGVybkluZm8uaXNSZWdFeHAsIHsgbWF0Y2hDYXNlOiBzZWFyY2hQYXR0ZXJuSW5mby5pc0Nhc2VTZW5zaXRpdmUsIHdob2xlV29yZDogc2VhcmNoUGF0dGVybkluZm8uaXNXb3JkTWF0Y2gsIG11bHRpbGluZTogc2VhcmNoUGF0dGVybkluZm8uaXNNdWx0aWxpbmUsIGdsb2JhbDogZmFsc2UsIHVuaWNvZGU6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnNlUGFyYW1ldGVycykge1xuXHRcdFx0dGhpcy5wYXJzZVJlcGxhY2VTdHJpbmcocmVwbGFjZVN0cmluZyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3JlZ0V4cC5nbG9iYWwpIHtcblx0XHRcdHRoaXMuX3JlZ0V4cCA9IHN0cmluZ3MuY3JlYXRlUmVnRXhwKHRoaXMuX3JlZ0V4cC5zb3VyY2UsIHRydWUsIHsgbWF0Y2hDYXNlOiAhdGhpcy5fcmVnRXhwLmlnbm9yZUNhc2UsIHdob2xlV29yZDogZmFsc2UsIG11bHRpbGluZTogdGhpcy5fcmVnRXhwLm11bHRpbGluZSwgZ2xvYmFsOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9jYXNlT3BzUmVnRXhwID0gbmV3IFJlZ0V4cCgvKFtcXHNcXFNdKj8pKCg/OlxcXFxbdVVsTF0pKz98KShcXCRbMC05XSspKFtcXHNcXFNdKj8pL2cpO1xuXHR9XG5cblx0Z2V0IGhhc1BhcmFtZXRlcnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhc1BhcmFtZXRlcnM7XG5cdH1cblxuXHRnZXQgcGF0dGVybigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9yZXBsYWNlUGF0dGVybjtcblx0fVxuXG5cdGdldCByZWdFeHAoKTogUmVnRXhwIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVnRXhwO1xuXHR9XG5cblx0LyoqXG5cdCogUmV0dXJucyB0aGUgcmVwbGFjZSBzdHJpbmcgZm9yIHRoZSBmaXJzdCBtYXRjaCBpbiB0aGUgZ2l2ZW4gdGV4dC5cblx0KiBJZiB0ZXh0IGhhcyBubyBtYXRjaGVzIHRoZW4gcmV0dXJucyBudWxsLlxuXHQqL1xuXHRnZXRSZXBsYWNlU3RyaW5nKHRleHQ6IHN0cmluZywgcHJlc2VydmVDYXNlPzogYm9vbGVhbik6IHN0cmluZyB8IG51bGwge1xuXHRcdHRoaXMuX3JlZ0V4cC5sYXN0SW5kZXggPSAwO1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5fcmVnRXhwLmV4ZWModGV4dCk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRpZiAodGhpcy5oYXNQYXJhbWV0ZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHJlcGxhY2VTdHJpbmcgPSB0aGlzLnJlcGxhY2VXaXRoQ2FzZU9wZXJhdGlvbnModGV4dCwgdGhpcy5fcmVnRXhwLCB0aGlzLmJ1aWxkUmVwbGFjZVN0cmluZyhtYXRjaCwgcHJlc2VydmVDYXNlKSk7XG5cdFx0XHRcdGlmIChtYXRjaFswXSA9PT0gdGV4dCkge1xuXHRcdFx0XHRcdHJldHVybiByZXBsYWNlU3RyaW5nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXBsYWNlU3RyaW5nLnN1YnN0cihtYXRjaC5pbmRleCwgbWF0Y2hbMF0ubGVuZ3RoIC0gKHRleHQubGVuZ3RoIC0gcmVwbGFjZVN0cmluZy5sZW5ndGgpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmJ1aWxkUmVwbGFjZVN0cmluZyhtYXRjaCwgcHJlc2VydmVDYXNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8qKlxuXHQgKiByZXBsYWNlV2l0aENhc2VPcGVyYXRpb25zIGFwcGxpZXMgY2FzZSBvcGVyYXRpb25zIHRvIHJlbGV2YW50IHJlcGxhY2VtZW50IHN0cmluZ3MgYW5kIGFwcGxpZXNcblx0ICogdGhlIGFmZmVjdGVkICROIGFyZ3VtZW50cy4gSXQgdGhlbiBwYXNzZXMgdW5hZmZlY3RlZCAkTiBhcmd1bWVudHMgdGhyb3VnaCB0byBzdHJpbmcucmVwbGFjZSgpLlxuXHQgKlxuXHQgKiBcXHVcdFx0XHQ9PiB1cHBlci1jYXNlcyBvbmUgY2hhcmFjdGVyIGluIGEgbWF0Y2guXG5cdCAqIFxcVVx0XHRcdD0+IHVwcGVyLWNhc2VzIEFMTCByZW1haW5pbmcgY2hhcmFjdGVycyBpbiBhIG1hdGNoLlxuXHQgKiBcXGxcdFx0XHQ9PiBsb3dlci1jYXNlcyBvbmUgY2hhcmFjdGVyIGluIGEgbWF0Y2guXG5cdCAqIFxcTFx0XHRcdD0+IGxvd2VyLWNhc2VzIEFMTCByZW1haW5pbmcgY2hhcmFjdGVycyBpbiBhIG1hdGNoLlxuXHQgKi9cblx0cHJpdmF0ZSByZXBsYWNlV2l0aENhc2VPcGVyYXRpb25zKHRleHQ6IHN0cmluZywgcmVnZXg6IFJlZ0V4cCwgcmVwbGFjZVN0cmluZzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBTaG9ydC1jaXJjdWl0IHRoZSBjb21tb24gcGF0aC5cblx0XHRpZiAoIS9cXFxcW3VVbExdLy50ZXN0KHJlcGxhY2VTdHJpbmcpKSB7XG5cdFx0XHRyZXR1cm4gdGV4dC5yZXBsYWNlKHJlZ2V4LCByZXBsYWNlU3RyaW5nKTtcblx0XHR9XG5cdFx0Ly8gU3RvcmUgdGhlIHZhbHVlcyBvZiB0aGUgc2VhcmNoIHBhcmFtZXRlcnMuXG5cdFx0Y29uc3QgZmlyc3RNYXRjaCA9IHJlZ2V4LmV4ZWModGV4dCk7XG5cdFx0aWYgKGZpcnN0TWF0Y2ggPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0ZXh0LnJlcGxhY2UocmVnZXgsIHJlcGxhY2VTdHJpbmcpO1xuXHRcdH1cblxuXHRcdGxldCBwYXRNYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHRsZXQgbmV3UmVwbGFjZVN0cmluZyA9ICcnO1xuXHRcdGxldCBsYXN0SW5kZXggPSAwO1xuXHRcdGxldCBsYXN0TWF0Y2ggPSAnJztcblx0XHQvLyBGb3IgZWFjaCBhbm5vdGF0ZWQgJE4sIHBlcmZvcm0gdGV4dCBwcm9jZXNzaW5nIG9uIHRoZSBwYXJhbWV0ZXJzIGFuZCBwZXJmb3JtIHRoZSBzdWJzdGl0dXRpb24uXG5cdFx0d2hpbGUgKChwYXRNYXRjaCA9IHRoaXMuX2Nhc2VPcHNSZWdFeHAuZXhlYyhyZXBsYWNlU3RyaW5nKSkgIT09IG51bGwpIHtcblx0XHRcdGxhc3RJbmRleCA9IHBhdE1hdGNoLmluZGV4O1xuXHRcdFx0Y29uc3QgZnVsbE1hdGNoID0gcGF0TWF0Y2hbMF07XG5cdFx0XHRsYXN0TWF0Y2ggPSBmdWxsTWF0Y2g7XG5cdFx0XHRsZXQgY2FzZU9wcyA9IHBhdE1hdGNoWzJdOyAvLyBcXHUsIFxcbFxcdSwgZXRjLlxuXHRcdFx0Y29uc3QgbW9uZXkgPSBwYXRNYXRjaFszXTsgLy8gJDEsICQyLCBldGMuXG5cblx0XHRcdGlmICghY2FzZU9wcykge1xuXHRcdFx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IGZ1bGxNYXRjaDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IGZpcnN0TWF0Y2hbcGFyc2VJbnQobW9uZXkuc2xpY2UoMSkpXTtcblx0XHRcdGlmICghcmVwbGFjZW1lbnQpIHtcblx0XHRcdFx0bmV3UmVwbGFjZVN0cmluZyArPSBmdWxsTWF0Y2g7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnRMZW4gPSByZXBsYWNlbWVudC5sZW5ndGg7XG5cblx0XHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gcGF0TWF0Y2hbMV07IC8vIHByZWZpeFxuXHRcdFx0Y2FzZU9wcyA9IGNhc2VPcHMucmVwbGFjZSgvXFxcXC9nLCAnJyk7XG5cdFx0XHRsZXQgaSA9IDA7XG5cdFx0XHRmb3IgKDsgaSA8IGNhc2VPcHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0c3dpdGNoIChjYXNlT3BzW2ldKSB7XG5cdFx0XHRcdFx0Y2FzZSAnVSc6XG5cdFx0XHRcdFx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IHJlcGxhY2VtZW50LnNsaWNlKGkpLnRvVXBwZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRpID0gcmVwbGFjZW1lbnRMZW47XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd1Jzpcblx0XHRcdFx0XHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gcmVwbGFjZW1lbnRbaV0udG9VcHBlckNhc2UoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ0wnOlxuXHRcdFx0XHRcdFx0bmV3UmVwbGFjZVN0cmluZyArPSByZXBsYWNlbWVudC5zbGljZShpKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdFx0aSA9IHJlcGxhY2VtZW50TGVuO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbCc6XG5cdFx0XHRcdFx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IHJlcGxhY2VtZW50W2ldLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gQXBwZW5kIGFueSByZW1haW5pbmcgcmVwbGFjZW1lbnQgc3RyaW5nIGNvbnRlbnQgbm90IGNvdmVyZWQgYnkgY2FzZSBvcGVyYXRpb25zLlxuXHRcdFx0aWYgKGkgPCByZXBsYWNlbWVudExlbikge1xuXHRcdFx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IHJlcGxhY2VtZW50LnNsaWNlKGkpO1xuXHRcdFx0fVxuXG5cdFx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IHBhdE1hdGNoWzRdOyAvLyBzdWZmaXhcblx0XHR9XG5cblx0XHQvLyBBcHBlbmQgYW55IHJlbWFpbmluZyB0cmFpbGluZyBjb250ZW50IGFmdGVyIHRoZSBmaW5hbCByZWdleCBtYXRjaC5cblx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IHJlcGxhY2VTdHJpbmcuc2xpY2UobGFzdEluZGV4ICsgbGFzdE1hdGNoLmxlbmd0aCk7XG5cblx0XHRyZXR1cm4gdGV4dC5yZXBsYWNlKHJlZ2V4LCBuZXdSZXBsYWNlU3RyaW5nKTtcblx0fVxuXG5cdHB1YmxpYyBidWlsZFJlcGxhY2VTdHJpbmcobWF0Y2hlczogc3RyaW5nW10gfCBudWxsLCBwcmVzZXJ2ZUNhc2U/OiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRpZiAocHJlc2VydmVDYXNlKSB7XG5cdFx0XHRyZXR1cm4gYnVpbGRSZXBsYWNlU3RyaW5nV2l0aENhc2VQcmVzZXJ2ZWQobWF0Y2hlcywgdGhpcy5fcmVwbGFjZVBhdHRlcm4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVwbGFjZVBhdHRlcm47XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFxcbiA9PiBMRlxuXHQgKiBcXHQgPT4gVEFCXG5cdCAqIFxcXFwgPT4gXFxcblx0ICogJDAgPT4gJCYgKHNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9TdHJpbmcvcmVwbGFjZSNTcGVjaWZ5aW5nX2Ffc3RyaW5nX2FzX2FfcGFyYW1ldGVyKVxuXHQgKiBldmVyeXRoaW5nIGVsc2Ugc3RheXMgdW50b3VjaGVkXG5cdCAqL1xuXHRwcml2YXRlIHBhcnNlUmVwbGFjZVN0cmluZyhyZXBsYWNlU3RyaW5nOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXJlcGxhY2VTdHJpbmcgfHwgcmVwbGFjZVN0cmluZy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc3Vic3RyRnJvbSA9IDAsIHJlc3VsdCA9ICcnO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByZXBsYWNlU3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjaENvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cblx0XHRcdGlmIChjaENvZGUgPT09IENoYXJDb2RlLkJhY2tzbGFzaCkge1xuXG5cdFx0XHRcdC8vIG1vdmUgdG8gbmV4dCBjaGFyXG5cdFx0XHRcdGkrKztcblxuXHRcdFx0XHRpZiAoaSA+PSBsZW4pIHtcblx0XHRcdFx0XHQvLyBzdHJpbmcgZW5kcyB3aXRoIGEgXFxcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5leHRDaENvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cdFx0XHRcdGxldCByZXBsYWNlV2l0aENoYXJhY3Rlcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHRcdFx0c3dpdGNoIChuZXh0Q2hDb2RlKSB7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5CYWNrc2xhc2g6XG5cdFx0XHRcdFx0XHQvLyBcXFxcID0+IFxcXG5cdFx0XHRcdFx0XHRyZXBsYWNlV2l0aENoYXJhY3RlciA9ICdcXFxcJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUubjpcblx0XHRcdFx0XHRcdC8vIFxcbiA9PiBMRlxuXHRcdFx0XHRcdFx0cmVwbGFjZVdpdGhDaGFyYWN0ZXIgPSAnXFxuJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUudDpcblx0XHRcdFx0XHRcdC8vIFxcdCA9PiBUQUJcblx0XHRcdFx0XHRcdHJlcGxhY2VXaXRoQ2hhcmFjdGVyID0gJ1xcdCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXBsYWNlV2l0aENoYXJhY3Rlcikge1xuXHRcdFx0XHRcdHJlc3VsdCArPSByZXBsYWNlU3RyaW5nLnN1YnN0cmluZyhzdWJzdHJGcm9tLCBpIC0gMSkgKyByZXBsYWNlV2l0aENoYXJhY3Rlcjtcblx0XHRcdFx0XHRzdWJzdHJGcm9tID0gaSArIDE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoQ29kZSA9PT0gQ2hhckNvZGUuRG9sbGFyU2lnbikge1xuXG5cdFx0XHRcdC8vIG1vdmUgdG8gbmV4dCBjaGFyXG5cdFx0XHRcdGkrKztcblxuXHRcdFx0XHRpZiAoaSA+PSBsZW4pIHtcblx0XHRcdFx0XHQvLyBzdHJpbmcgZW5kcyB3aXRoIGEgJFxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV4dENoQ29kZSA9IHJlcGxhY2VTdHJpbmcuY2hhckNvZGVBdChpKTtcblx0XHRcdFx0bGV0IHJlcGxhY2VXaXRoQ2hhcmFjdGVyOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0XHRzd2l0Y2ggKG5leHRDaENvZGUpIHtcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkRpZ2l0MDpcblx0XHRcdFx0XHRcdC8vICQwID0+ICQmXG5cdFx0XHRcdFx0XHRyZXBsYWNlV2l0aENoYXJhY3RlciA9ICckJic7XG5cdFx0XHRcdFx0XHR0aGlzLl9oYXNQYXJhbWV0ZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuQmFja1RpY2s6XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5TaW5nbGVRdW90ZTpcblx0XHRcdFx0XHRcdHRoaXMuX2hhc1BhcmFtZXRlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdFx0Ly8gY2hlY2sgaWYgaXQgaXMgYSB2YWxpZCBzdHJpbmcgcGFyYW1ldGVyICRuICgwIDw9IG4gPD0gOTkpLiAkMCBpcyBhbHJlYWR5IGhhbmRsZWQgYnkgbm93LlxuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLmJldHdlZW4obmV4dENoQ29kZSwgQ2hhckNvZGUuRGlnaXQxLCBDaGFyQ29kZS5EaWdpdDkpKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGkgPT09IHJlcGxhY2VTdHJpbmcubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9oYXNQYXJhbWV0ZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRsZXQgY2hhckNvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoKytpKTtcblx0XHRcdFx0XHRcdGlmICghdGhpcy5iZXR3ZWVuKGNoYXJDb2RlLCBDaGFyQ29kZS5EaWdpdDAsIENoYXJDb2RlLkRpZ2l0OSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5faGFzUGFyYW1ldGVycyA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdC0taTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaSA9PT0gcmVwbGFjZVN0cmluZy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2hhc1BhcmFtZXRlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNoYXJDb2RlID0gcmVwbGFjZVN0cmluZy5jaGFyQ29kZUF0KCsraSk7XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuYmV0d2VlbihjaGFyQ29kZSwgQ2hhckNvZGUuRGlnaXQwLCBDaGFyQ29kZS5EaWdpdDkpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2hhc1BhcmFtZXRlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHQtLWk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlcGxhY2VXaXRoQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdFx0cmVzdWx0ICs9IHJlcGxhY2VTdHJpbmcuc3Vic3RyaW5nKHN1YnN0ckZyb20sIGkgLSAxKSArIHJlcGxhY2VXaXRoQ2hhcmFjdGVyO1xuXHRcdFx0XHRcdHN1YnN0ckZyb20gPSBpICsgMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzdWJzdHJGcm9tID09PSAwKSB7XG5cdFx0XHQvLyBubyByZXBsYWNlbWVudCBvY2N1cnJlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcGxhY2VQYXR0ZXJuID0gcmVzdWx0ICsgcmVwbGFjZVN0cmluZy5zdWJzdHJpbmcoc3Vic3RyRnJvbSk7XG5cdH1cblxuXHRwcml2YXRlIGJldHdlZW4odmFsdWU6IG51bWJlciwgZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZyb20gPD0gdmFsdWUgJiYgdmFsdWUgPD0gdG87XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksYUFBYTtBQUV6QixTQUFTLGdCQUFn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
