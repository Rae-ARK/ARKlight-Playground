import { CharCode } from "../../../../base/common/charCode.js";
import { buildReplaceStringWithCasePreserved } from "../../../../base/common/search.js";
var ReplacePatternKind = /* @__PURE__ */ ((ReplacePatternKind2) => {
  ReplacePatternKind2[ReplacePatternKind2["StaticValue"] = 0] = "StaticValue";
  ReplacePatternKind2[ReplacePatternKind2["DynamicPieces"] = 1] = "DynamicPieces";
  return ReplacePatternKind2;
})(ReplacePatternKind || {});
class StaticValueReplacePattern {
  constructor(staticValue) {
    this.staticValue = staticValue;
    this.kind = 0 /* StaticValue */;
  }
}
class DynamicPiecesReplacePattern {
  constructor(pieces) {
    this.pieces = pieces;
    this.kind = 1 /* DynamicPieces */;
  }
}
class ReplacePattern {
  static fromStaticValue(value) {
    return new ReplacePattern([ReplacePiece.staticValue(value)]);
  }
  get hasReplacementPatterns() {
    return this._state.kind === 1 /* DynamicPieces */;
  }
  constructor(pieces) {
    if (!pieces || pieces.length === 0) {
      this._state = new StaticValueReplacePattern("");
    } else if (pieces.length === 1 && pieces[0].staticValue !== null) {
      this._state = new StaticValueReplacePattern(pieces[0].staticValue);
    } else {
      this._state = new DynamicPiecesReplacePattern(pieces);
    }
  }
  buildReplaceString(matches, preserveCase) {
    if (this._state.kind === 0 /* StaticValue */) {
      if (preserveCase) {
        return buildReplaceStringWithCasePreserved(matches, this._state.staticValue);
      } else {
        return this._state.staticValue;
      }
    }
    let result = "";
    for (let i = 0, len = this._state.pieces.length; i < len; i++) {
      const piece = this._state.pieces[i];
      if (piece.staticValue !== null) {
        result += piece.staticValue;
        continue;
      }
      let match = ReplacePattern._substitute(piece.matchIndex, matches);
      if (piece.caseOps !== null && piece.caseOps.length > 0) {
        const repl = [];
        const lenOps = piece.caseOps.length;
        let opIdx = 0;
        for (let idx = 0, len2 = match.length; idx < len2; idx++) {
          if (opIdx >= lenOps) {
            repl.push(match.slice(idx));
            break;
          }
          switch (piece.caseOps[opIdx]) {
            case "U":
              repl.push(match[idx].toUpperCase());
              break;
            case "u":
              repl.push(match[idx].toUpperCase());
              opIdx++;
              break;
            case "L":
              repl.push(match[idx].toLowerCase());
              break;
            case "l":
              repl.push(match[idx].toLowerCase());
              opIdx++;
              break;
            default:
              repl.push(match[idx]);
          }
        }
        match = repl.join("");
      }
      result += match;
    }
    return result;
  }
  static _substitute(matchIndex, matches) {
    if (matches === null) {
      return "";
    }
    if (matchIndex === 0) {
      return matches[0];
    }
    let remainder = "";
    while (matchIndex > 0) {
      if (matchIndex < matches.length) {
        const match = matches[matchIndex] || "";
        return match + remainder;
      }
      remainder = String(matchIndex % 10) + remainder;
      matchIndex = Math.floor(matchIndex / 10);
    }
    return "$" + remainder;
  }
}
class ReplacePiece {
  static staticValue(value) {
    return new ReplacePiece(value, -1, null);
  }
  static matchIndex(index) {
    return new ReplacePiece(null, index, null);
  }
  static caseOps(index, caseOps) {
    return new ReplacePiece(null, index, caseOps);
  }
  constructor(staticValue, matchIndex, caseOps) {
    this.staticValue = staticValue;
    this.matchIndex = matchIndex;
    if (!caseOps || caseOps.length === 0) {
      this.caseOps = null;
    } else {
      this.caseOps = caseOps.slice(0);
    }
  }
}
class ReplacePieceBuilder {
  constructor(source) {
    this._source = source;
    this._lastCharIndex = 0;
    this._result = [];
    this._resultLen = 0;
    this._currentStaticPiece = "";
  }
  emitUnchanged(toCharIndex) {
    this._emitStatic(this._source.substring(this._lastCharIndex, toCharIndex));
    this._lastCharIndex = toCharIndex;
  }
  emitStatic(value, toCharIndex) {
    this._emitStatic(value);
    this._lastCharIndex = toCharIndex;
  }
  _emitStatic(value) {
    if (value.length === 0) {
      return;
    }
    this._currentStaticPiece += value;
  }
  emitMatchIndex(index, toCharIndex, caseOps) {
    if (this._currentStaticPiece.length !== 0) {
      this._result[this._resultLen++] = ReplacePiece.staticValue(this._currentStaticPiece);
      this._currentStaticPiece = "";
    }
    this._result[this._resultLen++] = ReplacePiece.caseOps(index, caseOps);
    this._lastCharIndex = toCharIndex;
  }
  finalize() {
    this.emitUnchanged(this._source.length);
    if (this._currentStaticPiece.length !== 0) {
      this._result[this._resultLen++] = ReplacePiece.staticValue(this._currentStaticPiece);
      this._currentStaticPiece = "";
    }
    return new ReplacePattern(this._result);
  }
}
function parseReplaceString(replaceString) {
  if (!replaceString || replaceString.length === 0) {
    return new ReplacePattern(null);
  }
  const caseOps = [];
  const result = new ReplacePieceBuilder(replaceString);
  for (let i = 0, len = replaceString.length; i < len; i++) {
    const chCode = replaceString.charCodeAt(i);
    if (chCode === CharCode.Backslash) {
      i++;
      if (i >= len) {
        break;
      }
      const nextChCode = replaceString.charCodeAt(i);
      switch (nextChCode) {
        case CharCode.Backslash:
          result.emitUnchanged(i - 1);
          result.emitStatic("\\", i + 1);
          break;
        case CharCode.n:
          result.emitUnchanged(i - 1);
          result.emitStatic("\n", i + 1);
          break;
        case CharCode.t:
          result.emitUnchanged(i - 1);
          result.emitStatic("	", i + 1);
          break;
        // Case modification of string replacements, patterned after Boost, but only applied
        // to the replacement text, not subsequent content.
        case CharCode.u:
        // \u => upper-cases one character.
        case CharCode.U:
        // \U => upper-cases ALL following characters.
        case CharCode.l:
        // \l => lower-cases one character.
        case CharCode.L:
          result.emitUnchanged(i - 1);
          result.emitStatic("", i + 1);
          caseOps.push(String.fromCharCode(nextChCode));
          break;
      }
      continue;
    }
    if (chCode === CharCode.DollarSign) {
      i++;
      if (i >= len) {
        break;
      }
      const nextChCode = replaceString.charCodeAt(i);
      if (nextChCode === CharCode.DollarSign) {
        result.emitUnchanged(i - 1);
        result.emitStatic("$", i + 1);
        continue;
      }
      if (nextChCode === CharCode.Digit0 || nextChCode === CharCode.Ampersand) {
        result.emitUnchanged(i - 1);
        result.emitMatchIndex(0, i + 1, caseOps);
        caseOps.length = 0;
        continue;
      }
      if (CharCode.Digit1 <= nextChCode && nextChCode <= CharCode.Digit9) {
        let matchIndex = nextChCode - CharCode.Digit0;
        if (i + 1 < len) {
          const nextNextChCode = replaceString.charCodeAt(i + 1);
          if (CharCode.Digit0 <= nextNextChCode && nextNextChCode <= CharCode.Digit9) {
            i++;
            matchIndex = matchIndex * 10 + (nextNextChCode - CharCode.Digit0);
            result.emitUnchanged(i - 2);
            result.emitMatchIndex(matchIndex, i + 1, caseOps);
            caseOps.length = 0;
            continue;
          }
        }
        result.emitUnchanged(i - 1);
        result.emitMatchIndex(matchIndex, i + 1, caseOps);
        caseOps.length = 0;
        continue;
      }
    }
  }
  return result.finalize();
}
export {
  ReplacePattern,
  ReplacePiece,
  parseReplaceString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9yZXBsYWNlUGF0dGVybi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgYnVpbGRSZXBsYWNlU3RyaW5nV2l0aENhc2VQcmVzZXJ2ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZWFyY2guanMnO1xuXG5jb25zdCBlbnVtIFJlcGxhY2VQYXR0ZXJuS2luZCB7XG5cdFN0YXRpY1ZhbHVlID0gMCxcblx0RHluYW1pY1BpZWNlcyA9IDFcbn1cblxuLyoqXG4gKiBBc3NpZ25lZCB3aGVuIHRoZSByZXBsYWNlIHBhdHRlcm4gaXMgZW50aXJlbHkgc3RhdGljLlxuICovXG5jbGFzcyBTdGF0aWNWYWx1ZVJlcGxhY2VQYXR0ZXJuIHtcblx0cHVibGljIHJlYWRvbmx5IGtpbmQgPSBSZXBsYWNlUGF0dGVybktpbmQuU3RhdGljVmFsdWU7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBzdGF0aWNWYWx1ZTogc3RyaW5nKSB7IH1cbn1cblxuLyoqXG4gKiBBc3NpZ25lZCB3aGVuIHRoZSByZXBsYWNlIHBhdHRlcm4gaGFzIHJlcGxhY2VtZW50IHBhdHRlcm5zLlxuICovXG5jbGFzcyBEeW5hbWljUGllY2VzUmVwbGFjZVBhdHRlcm4ge1xuXHRwdWJsaWMgcmVhZG9ubHkga2luZCA9IFJlcGxhY2VQYXR0ZXJuS2luZC5EeW5hbWljUGllY2VzO1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgcGllY2VzOiBSZXBsYWNlUGllY2VbXSkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsYWNlUGF0dGVybiB7XG5cblx0cHVibGljIHN0YXRpYyBmcm9tU3RhdGljVmFsdWUodmFsdWU6IHN0cmluZyk6IFJlcGxhY2VQYXR0ZXJuIHtcblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VQYXR0ZXJuKFtSZXBsYWNlUGllY2Uuc3RhdGljVmFsdWUodmFsdWUpXSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogU3RhdGljVmFsdWVSZXBsYWNlUGF0dGVybiB8IER5bmFtaWNQaWVjZXNSZXBsYWNlUGF0dGVybjtcblxuXHRwdWJsaWMgZ2V0IGhhc1JlcGxhY2VtZW50UGF0dGVybnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9zdGF0ZS5raW5kID09PSBSZXBsYWNlUGF0dGVybktpbmQuRHluYW1pY1BpZWNlcyk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwaWVjZXM6IFJlcGxhY2VQaWVjZVtdIHwgbnVsbCkge1xuXHRcdGlmICghcGllY2VzIHx8IHBpZWNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gbmV3IFN0YXRpY1ZhbHVlUmVwbGFjZVBhdHRlcm4oJycpO1xuXHRcdH0gZWxzZSBpZiAocGllY2VzLmxlbmd0aCA9PT0gMSAmJiBwaWVjZXNbMF0uc3RhdGljVmFsdWUgIT09IG51bGwpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gbmV3IFN0YXRpY1ZhbHVlUmVwbGFjZVBhdHRlcm4ocGllY2VzWzBdLnN0YXRpY1ZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBuZXcgRHluYW1pY1BpZWNlc1JlcGxhY2VQYXR0ZXJuKHBpZWNlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGJ1aWxkUmVwbGFjZVN0cmluZyhtYXRjaGVzOiBzdHJpbmdbXSB8IG51bGwsIHByZXNlcnZlQ2FzZT86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBSZXBsYWNlUGF0dGVybktpbmQuU3RhdGljVmFsdWUpIHtcblx0XHRcdGlmIChwcmVzZXJ2ZUNhc2UpIHtcblx0XHRcdFx0cmV0dXJuIGJ1aWxkUmVwbGFjZVN0cmluZ1dpdGhDYXNlUHJlc2VydmVkKG1hdGNoZXMsIHRoaXMuX3N0YXRlLnN0YXRpY1ZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zdGF0ZS5zdGF0aWNWYWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0ID0gJyc7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3N0YXRlLnBpZWNlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcGllY2UgPSB0aGlzLl9zdGF0ZS5waWVjZXNbaV07XG5cdFx0XHRpZiAocGllY2Uuc3RhdGljVmFsdWUgIT09IG51bGwpIHtcblx0XHRcdFx0Ly8gc3RhdGljIHZhbHVlIFJlcGxhY2VQaWVjZVxuXHRcdFx0XHRyZXN1bHQgKz0gcGllY2Uuc3RhdGljVmFsdWU7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBtYXRjaCBpbmRleCBSZXBsYWNlUGllY2Vcblx0XHRcdGxldCBtYXRjaDogc3RyaW5nID0gUmVwbGFjZVBhdHRlcm4uX3N1YnN0aXR1dGUocGllY2UubWF0Y2hJbmRleCwgbWF0Y2hlcyk7XG5cdFx0XHRpZiAocGllY2UuY2FzZU9wcyAhPT0gbnVsbCAmJiBwaWVjZS5jYXNlT3BzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgcmVwbDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgbGVuT3BzOiBudW1iZXIgPSBwaWVjZS5jYXNlT3BzLmxlbmd0aDtcblx0XHRcdFx0bGV0IG9wSWR4OiBudW1iZXIgPSAwO1xuXHRcdFx0XHRmb3IgKGxldCBpZHg6IG51bWJlciA9IDAsIGxlbjogbnVtYmVyID0gbWF0Y2gubGVuZ3RoOyBpZHggPCBsZW47IGlkeCsrKSB7XG5cdFx0XHRcdFx0aWYgKG9wSWR4ID49IGxlbk9wcykge1xuXHRcdFx0XHRcdFx0cmVwbC5wdXNoKG1hdGNoLnNsaWNlKGlkeCkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHN3aXRjaCAocGllY2UuY2FzZU9wc1tvcElkeF0pIHtcblx0XHRcdFx0XHRcdGNhc2UgJ1UnOlxuXHRcdFx0XHRcdFx0XHRyZXBsLnB1c2gobWF0Y2hbaWR4XS50b1VwcGVyQ2FzZSgpKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICd1Jzpcblx0XHRcdFx0XHRcdFx0cmVwbC5wdXNoKG1hdGNoW2lkeF0udG9VcHBlckNhc2UoKSk7XG5cdFx0XHRcdFx0XHRcdG9wSWR4Kys7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAnTCc6XG5cdFx0XHRcdFx0XHRcdHJlcGwucHVzaChtYXRjaFtpZHhdLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgJ2wnOlxuXHRcdFx0XHRcdFx0XHRyZXBsLnB1c2gobWF0Y2hbaWR4XS50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0XHRcdFx0b3BJZHgrKztcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHRyZXBsLnB1c2gobWF0Y2hbaWR4XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdG1hdGNoID0gcmVwbC5qb2luKCcnKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdCArPSBtYXRjaDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3N1YnN0aXR1dGUobWF0Y2hJbmRleDogbnVtYmVyLCBtYXRjaGVzOiBzdHJpbmdbXSB8IG51bGwpOiBzdHJpbmcge1xuXHRcdGlmIChtYXRjaGVzID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChtYXRjaEluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2hlc1swXTtcblx0XHR9XG5cblx0XHRsZXQgcmVtYWluZGVyID0gJyc7XG5cdFx0d2hpbGUgKG1hdGNoSW5kZXggPiAwKSB7XG5cdFx0XHRpZiAobWF0Y2hJbmRleCA8IG1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIEEgbWF0Y2ggY2FuIGJlIHVuZGVmaW5lZFxuXHRcdFx0XHRjb25zdCBtYXRjaCA9IChtYXRjaGVzW21hdGNoSW5kZXhdIHx8ICcnKTtcblx0XHRcdFx0cmV0dXJuIG1hdGNoICsgcmVtYWluZGVyO1xuXHRcdFx0fVxuXHRcdFx0cmVtYWluZGVyID0gU3RyaW5nKG1hdGNoSW5kZXggJSAxMCkgKyByZW1haW5kZXI7XG5cdFx0XHRtYXRjaEluZGV4ID0gTWF0aC5mbG9vcihtYXRjaEluZGV4IC8gMTApO1xuXHRcdH1cblx0XHRyZXR1cm4gJyQnICsgcmVtYWluZGVyO1xuXHR9XG59XG5cbi8qKlxuICogQSByZXBsYWNlIHBpZWNlIGNhbiBlaXRoZXIgYmUgYSBzdGF0aWMgc3RyaW5nIG9yIGFuIGluZGV4IHRvIGEgc3BlY2lmaWMgbWF0Y2guXG4gKi9cbmV4cG9ydCBjbGFzcyBSZXBsYWNlUGllY2Uge1xuXG5cdHB1YmxpYyBzdGF0aWMgc3RhdGljVmFsdWUodmFsdWU6IHN0cmluZyk6IFJlcGxhY2VQaWVjZSB7XG5cdFx0cmV0dXJuIG5ldyBSZXBsYWNlUGllY2UodmFsdWUsIC0xLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbWF0Y2hJbmRleChpbmRleDogbnVtYmVyKTogUmVwbGFjZVBpZWNlIHtcblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VQaWVjZShudWxsLCBpbmRleCwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNhc2VPcHMoaW5kZXg6IG51bWJlciwgY2FzZU9wczogc3RyaW5nW10pOiBSZXBsYWNlUGllY2Uge1xuXHRcdHJldHVybiBuZXcgUmVwbGFjZVBpZWNlKG51bGwsIGluZGV4LCBjYXNlT3BzKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBzdGF0aWNWYWx1ZTogc3RyaW5nIHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IG1hdGNoSW5kZXg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGNhc2VPcHM6IHN0cmluZ1tdIHwgbnVsbDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKHN0YXRpY1ZhbHVlOiBzdHJpbmcgfCBudWxsLCBtYXRjaEluZGV4OiBudW1iZXIsIGNhc2VPcHM6IHN0cmluZ1tdIHwgbnVsbCkge1xuXHRcdHRoaXMuc3RhdGljVmFsdWUgPSBzdGF0aWNWYWx1ZTtcblx0XHR0aGlzLm1hdGNoSW5kZXggPSBtYXRjaEluZGV4O1xuXHRcdGlmICghY2FzZU9wcyB8fCBjYXNlT3BzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5jYXNlT3BzID0gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jYXNlT3BzID0gY2FzZU9wcy5zbGljZSgwKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUmVwbGFjZVBpZWNlQnVpbGRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc291cmNlOiBzdHJpbmc7XG5cdHByaXZhdGUgX2xhc3RDaGFySW5kZXg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzdWx0OiBSZXBsYWNlUGllY2VbXTtcblx0cHJpdmF0ZSBfcmVzdWx0TGVuOiBudW1iZXI7XG5cdHByaXZhdGUgX2N1cnJlbnRTdGF0aWNQaWVjZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuX2xhc3RDaGFySW5kZXggPSAwO1xuXHRcdHRoaXMuX3Jlc3VsdCA9IFtdO1xuXHRcdHRoaXMuX3Jlc3VsdExlbiA9IDA7XG5cdFx0dGhpcy5fY3VycmVudFN0YXRpY1BpZWNlID0gJyc7XG5cdH1cblxuXHRwdWJsaWMgZW1pdFVuY2hhbmdlZCh0b0NoYXJJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZW1pdFN0YXRpYyh0aGlzLl9zb3VyY2Uuc3Vic3RyaW5nKHRoaXMuX2xhc3RDaGFySW5kZXgsIHRvQ2hhckluZGV4KSk7XG5cdFx0dGhpcy5fbGFzdENoYXJJbmRleCA9IHRvQ2hhckluZGV4O1xuXHR9XG5cblx0cHVibGljIGVtaXRTdGF0aWModmFsdWU6IHN0cmluZywgdG9DaGFySW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2VtaXRTdGF0aWModmFsdWUpO1xuXHRcdHRoaXMuX2xhc3RDaGFySW5kZXggPSB0b0NoYXJJbmRleDtcblx0fVxuXG5cdHByaXZhdGUgX2VtaXRTdGF0aWModmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudFN0YXRpY1BpZWNlICs9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGVtaXRNYXRjaEluZGV4KGluZGV4OiBudW1iZXIsIHRvQ2hhckluZGV4OiBudW1iZXIsIGNhc2VPcHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRTdGF0aWNQaWVjZS5sZW5ndGggIT09IDApIHtcblx0XHRcdHRoaXMuX3Jlc3VsdFt0aGlzLl9yZXN1bHRMZW4rK10gPSBSZXBsYWNlUGllY2Uuc3RhdGljVmFsdWUodGhpcy5fY3VycmVudFN0YXRpY1BpZWNlKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRTdGF0aWNQaWVjZSA9ICcnO1xuXHRcdH1cblx0XHR0aGlzLl9yZXN1bHRbdGhpcy5fcmVzdWx0TGVuKytdID0gUmVwbGFjZVBpZWNlLmNhc2VPcHMoaW5kZXgsIGNhc2VPcHMpO1xuXHRcdHRoaXMuX2xhc3RDaGFySW5kZXggPSB0b0NoYXJJbmRleDtcblx0fVxuXG5cblx0cHVibGljIGZpbmFsaXplKCk6IFJlcGxhY2VQYXR0ZXJuIHtcblx0XHR0aGlzLmVtaXRVbmNoYW5nZWQodGhpcy5fc291cmNlLmxlbmd0aCk7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRTdGF0aWNQaWVjZS5sZW5ndGggIT09IDApIHtcblx0XHRcdHRoaXMuX3Jlc3VsdFt0aGlzLl9yZXN1bHRMZW4rK10gPSBSZXBsYWNlUGllY2Uuc3RhdGljVmFsdWUodGhpcy5fY3VycmVudFN0YXRpY1BpZWNlKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRTdGF0aWNQaWVjZSA9ICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VQYXR0ZXJuKHRoaXMuX3Jlc3VsdCk7XG5cdH1cbn1cblxuLyoqXG4gKiBcXG5cdFx0XHQ9PiBpbnNlcnRzIGEgTEZcbiAqIFxcdFx0XHRcdD0+IGluc2VydHMgYSBUQUJcbiAqIFxcXFxcdFx0XHQ9PiBpbnNlcnRzIGEgXCJcXFwiLlxuICogXFx1XHRcdFx0PT4gdXBwZXItY2FzZXMgb25lIGNoYXJhY3RlciBpbiBhIG1hdGNoLlxuICogXFxVXHRcdFx0PT4gdXBwZXItY2FzZXMgQUxMIHJlbWFpbmluZyBjaGFyYWN0ZXJzIGluIGEgbWF0Y2guXG4gKiBcXGxcdFx0XHQ9PiBsb3dlci1jYXNlcyBvbmUgY2hhcmFjdGVyIGluIGEgbWF0Y2guXG4gKiBcXExcdFx0XHQ9PiBsb3dlci1jYXNlcyBBTEwgcmVtYWluaW5nIGNoYXJhY3RlcnMgaW4gYSBtYXRjaC5cbiAqICQkXHRcdFx0PT4gaW5zZXJ0cyBhIFwiJFwiLlxuICogJCYgYW5kICQwXHQ9PiBpbnNlcnRzIHRoZSBtYXRjaGVkIHN1YnN0cmluZy5cbiAqICRuXHRcdFx0PT4gV2hlcmUgbiBpcyBhIG5vbi1uZWdhdGl2ZSBpbnRlZ2VyIGxlc3NlciB0aGFuIDEwMCwgaW5zZXJ0cyB0aGUgbnRoIHBhcmVudGhlc2l6ZWQgc3VibWF0Y2ggc3RyaW5nXG4gKiBldmVyeXRoaW5nIGVsc2Ugc3RheXMgdW50b3VjaGVkXG4gKlxuICogQWxzbyBzZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvU3RyaW5nL3JlcGxhY2UjU3BlY2lmeWluZ19hX3N0cmluZ19hc19hX3BhcmFtZXRlclxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXBsYWNlU3RyaW5nKHJlcGxhY2VTdHJpbmc6IHN0cmluZyk6IFJlcGxhY2VQYXR0ZXJuIHtcblx0aWYgKCFyZXBsYWNlU3RyaW5nIHx8IHJlcGxhY2VTdHJpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIG5ldyBSZXBsYWNlUGF0dGVybihudWxsKTtcblx0fVxuXG5cdGNvbnN0IGNhc2VPcHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBSZXBsYWNlUGllY2VCdWlsZGVyKHJlcGxhY2VTdHJpbmcpO1xuXG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSByZXBsYWNlU3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0Y29uc3QgY2hDb2RlID0gcmVwbGFjZVN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG5cdFx0aWYgKGNoQ29kZSA9PT0gQ2hhckNvZGUuQmFja3NsYXNoKSB7XG5cblx0XHRcdC8vIG1vdmUgdG8gbmV4dCBjaGFyXG5cdFx0XHRpKys7XG5cblx0XHRcdGlmIChpID49IGxlbikge1xuXHRcdFx0XHQvLyBzdHJpbmcgZW5kcyB3aXRoIGEgXFxcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5leHRDaENvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cdFx0XHQvLyBsZXQgcmVwbGFjZVdpdGhDaGFyYWN0ZXI6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRzd2l0Y2ggKG5leHRDaENvZGUpIHtcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5CYWNrc2xhc2g6XG5cdFx0XHRcdFx0Ly8gXFxcXCA9PiBpbnNlcnRzIGEgXCJcXFwiXG5cdFx0XHRcdFx0cmVzdWx0LmVtaXRVbmNoYW5nZWQoaSAtIDEpO1xuXHRcdFx0XHRcdHJlc3VsdC5lbWl0U3RhdGljKCdcXFxcJywgaSArIDEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLm46XG5cdFx0XHRcdFx0Ly8gXFxuID0+IGluc2VydHMgYSBMRlxuXHRcdFx0XHRcdHJlc3VsdC5lbWl0VW5jaGFuZ2VkKGkgLSAxKTtcblx0XHRcdFx0XHRyZXN1bHQuZW1pdFN0YXRpYygnXFxuJywgaSArIDEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLnQ6XG5cdFx0XHRcdFx0Ly8gXFx0ID0+IGluc2VydHMgYSBUQUJcblx0XHRcdFx0XHRyZXN1bHQuZW1pdFVuY2hhbmdlZChpIC0gMSk7XG5cdFx0XHRcdFx0cmVzdWx0LmVtaXRTdGF0aWMoJ1xcdCcsIGkgKyAxKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Ly8gQ2FzZSBtb2RpZmljYXRpb24gb2Ygc3RyaW5nIHJlcGxhY2VtZW50cywgcGF0dGVybmVkIGFmdGVyIEJvb3N0LCBidXQgb25seSBhcHBsaWVkXG5cdFx0XHRcdC8vIHRvIHRoZSByZXBsYWNlbWVudCB0ZXh0LCBub3Qgc3Vic2VxdWVudCBjb250ZW50LlxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLnU6XG5cdFx0XHRcdC8vIFxcdSA9PiB1cHBlci1jYXNlcyBvbmUgY2hhcmFjdGVyLlxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlU6XG5cdFx0XHRcdC8vIFxcVSA9PiB1cHBlci1jYXNlcyBBTEwgZm9sbG93aW5nIGNoYXJhY3RlcnMuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUubDpcblx0XHRcdFx0Ly8gXFxsID0+IGxvd2VyLWNhc2VzIG9uZSBjaGFyYWN0ZXIuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuTDpcblx0XHRcdFx0XHQvLyBcXEwgPT4gbG93ZXItY2FzZXMgQUxMIGZvbGxvd2luZyBjaGFyYWN0ZXJzLlxuXHRcdFx0XHRcdHJlc3VsdC5lbWl0VW5jaGFuZ2VkKGkgLSAxKTtcblx0XHRcdFx0XHRyZXN1bHQuZW1pdFN0YXRpYygnJywgaSArIDEpO1xuXHRcdFx0XHRcdGNhc2VPcHMucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlKG5leHRDaENvZGUpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNoQ29kZSA9PT0gQ2hhckNvZGUuRG9sbGFyU2lnbikge1xuXG5cdFx0XHQvLyBtb3ZlIHRvIG5leHQgY2hhclxuXHRcdFx0aSsrO1xuXG5cdFx0XHRpZiAoaSA+PSBsZW4pIHtcblx0XHRcdFx0Ly8gc3RyaW5nIGVuZHMgd2l0aCBhICRcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5leHRDaENvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cblx0XHRcdGlmIChuZXh0Q2hDb2RlID09PSBDaGFyQ29kZS5Eb2xsYXJTaWduKSB7XG5cdFx0XHRcdC8vICQkID0+IGluc2VydHMgYSBcIiRcIlxuXHRcdFx0XHRyZXN1bHQuZW1pdFVuY2hhbmdlZChpIC0gMSk7XG5cdFx0XHRcdHJlc3VsdC5lbWl0U3RhdGljKCckJywgaSArIDEpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5leHRDaENvZGUgPT09IENoYXJDb2RlLkRpZ2l0MCB8fCBuZXh0Q2hDb2RlID09PSBDaGFyQ29kZS5BbXBlcnNhbmQpIHtcblx0XHRcdFx0Ly8gJCYgYW5kICQwID0+IGluc2VydHMgdGhlIG1hdGNoZWQgc3Vic3RyaW5nLlxuXHRcdFx0XHRyZXN1bHQuZW1pdFVuY2hhbmdlZChpIC0gMSk7XG5cdFx0XHRcdHJlc3VsdC5lbWl0TWF0Y2hJbmRleCgwLCBpICsgMSwgY2FzZU9wcyk7XG5cdFx0XHRcdGNhc2VPcHMubGVuZ3RoID0gMDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChDaGFyQ29kZS5EaWdpdDEgPD0gbmV4dENoQ29kZSAmJiBuZXh0Q2hDb2RlIDw9IENoYXJDb2RlLkRpZ2l0OSkge1xuXHRcdFx0XHQvLyAkblxuXG5cdFx0XHRcdGxldCBtYXRjaEluZGV4ID0gbmV4dENoQ29kZSAtIENoYXJDb2RlLkRpZ2l0MDtcblxuXHRcdFx0XHQvLyBwZWVrIG5leHQgY2hhciB0byBwcm9iZSBmb3IgJG5uXG5cdFx0XHRcdGlmIChpICsgMSA8IGxlbikge1xuXHRcdFx0XHRcdGNvbnN0IG5leHROZXh0Q2hDb2RlID0gcmVwbGFjZVN0cmluZy5jaGFyQ29kZUF0KGkgKyAxKTtcblx0XHRcdFx0XHRpZiAoQ2hhckNvZGUuRGlnaXQwIDw9IG5leHROZXh0Q2hDb2RlICYmIG5leHROZXh0Q2hDb2RlIDw9IENoYXJDb2RlLkRpZ2l0OSkge1xuXHRcdFx0XHRcdFx0Ly8gJG5uXG5cblx0XHRcdFx0XHRcdC8vIG1vdmUgdG8gbmV4dCBjaGFyXG5cdFx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdFx0XHRtYXRjaEluZGV4ID0gbWF0Y2hJbmRleCAqIDEwICsgKG5leHROZXh0Q2hDb2RlIC0gQ2hhckNvZGUuRGlnaXQwKTtcblxuXHRcdFx0XHRcdFx0cmVzdWx0LmVtaXRVbmNoYW5nZWQoaSAtIDIpO1xuXHRcdFx0XHRcdFx0cmVzdWx0LmVtaXRNYXRjaEluZGV4KG1hdGNoSW5kZXgsIGkgKyAxLCBjYXNlT3BzKTtcblx0XHRcdFx0XHRcdGNhc2VPcHMubGVuZ3RoID0gMDtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdC5lbWl0VW5jaGFuZ2VkKGkgLSAxKTtcblx0XHRcdFx0cmVzdWx0LmVtaXRNYXRjaEluZGV4KG1hdGNoSW5kZXgsIGkgKyAxLCBjYXNlT3BzKTtcblx0XHRcdFx0Y2FzZU9wcy5sZW5ndGggPSAwO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0LmZpbmFsaXplKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJDQUEyQztBQUVwRCxJQUFXLHFCQUFYLGtCQUFXQSx3QkFBWDtBQUNDLEVBQUFBLHdDQUFBLGlCQUFjLEtBQWQ7QUFDQSxFQUFBQSx3Q0FBQSxtQkFBZ0IsS0FBaEI7QUFGVSxTQUFBQTtBQUFBLEdBQUE7QUFRWCxNQUFNLDBCQUEwQjtBQUFBLEVBRS9CLFlBQTRCLGFBQXFCO0FBQXJCO0FBRDVCLFNBQWdCLE9BQU87QUFBQSxFQUM0QjtBQUNwRDtBQUtBLE1BQU0sNEJBQTRCO0FBQUEsRUFFakMsWUFBNEIsUUFBd0I7QUFBeEI7QUFENUIsU0FBZ0IsT0FBTztBQUFBLEVBQytCO0FBQ3ZEO0FBRU8sTUFBTSxlQUFlO0FBQUEsRUFFM0IsT0FBYyxnQkFBZ0IsT0FBK0I7QUFDNUQsV0FBTyxJQUFJLGVBQWUsQ0FBQyxhQUFhLFlBQVksS0FBSyxDQUFDLENBQUM7QUFBQSxFQUM1RDtBQUFBLEVBSUEsSUFBVyx5QkFBa0M7QUFDNUMsV0FBUSxLQUFLLE9BQU8sU0FBUztBQUFBLEVBQzlCO0FBQUEsRUFFQSxZQUFZLFFBQStCO0FBQzFDLFFBQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxHQUFHO0FBQ25DLFdBQUssU0FBUyxJQUFJ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
