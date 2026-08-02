import { Range } from "../core/range.js";
import { Searcher } from "../model/textModelSearch.js";
import * as strings from "../../../base/common/strings.js";
import { assertNever } from "../../../base/common/assert.js";
import { DEFAULT_WORD_REGEXP, getWordAtText } from "../core/wordHelper.js";
class UnicodeTextModelHighlighter {
  static computeUnicodeHighlights(model, options, range) {
    const startLine = range ? range.startLineNumber : 1;
    const endLine = range ? range.endLineNumber : model.getLineCount();
    const codePointHighlighter = new CodePointHighlighter(options);
    const candidates = codePointHighlighter.getCandidateCodePoints();
    let regex;
    if (candidates === "allNonBasicAscii") {
      regex = new RegExp("[^\\t\\n\\r\\x20-\\x7E]", "g");
    } else {
      regex = new RegExp(`${buildRegExpCharClassExpr(Array.from(candidates))}`, "g");
    }
    const searcher = new Searcher(null, regex);
    const ranges = [];
    let hasMore = false;
    let m;
    let ambiguousCharacterCount = 0;
    let invisibleCharacterCount = 0;
    let nonBasicAsciiCharacterCount = 0;
    forLoop:
      for (let lineNumber = startLine, lineCount = endLine; lineNumber <= lineCount; lineNumber++) {
        const lineContent = model.getLineContent(lineNumber);
        const lineLength = lineContent.length;
        searcher.reset(0);
        do {
          m = searcher.next(lineContent);
          if (m) {
            let startIndex = m.index;
            let endIndex = m.index + m[0].length;
            if (startIndex > 0) {
              const charCodeBefore = lineContent.charCodeAt(startIndex - 1);
              if (strings.isHighSurrogate(charCodeBefore)) {
                startIndex--;
              }
            }
            if (endIndex + 1 < lineLength) {
              const charCodeBefore = lineContent.charCodeAt(endIndex - 1);
              if (strings.isHighSurrogate(charCodeBefore)) {
                endIndex++;
              }
            }
            const str = lineContent.substring(startIndex, endIndex);
            let word = getWordAtText(startIndex + 1, DEFAULT_WORD_REGEXP, lineContent, 0);
            if (word && word.endColumn <= startIndex + 1) {
              word = null;
            }
            const highlightReason = codePointHighlighter.shouldHighlightNonBasicASCII(str, word ? word.word : null);
            if (highlightReason !== 0 /* None */) {
              if (highlightReason === 3 /* Ambiguous */) {
                ambiguousCharacterCount++;
              } else if (highlightReason === 2 /* Invisible */) {
                invisibleCharacterCount++;
              } else if (highlightReason === 1 /* NonBasicASCII */) {
                nonBasicAsciiCharacterCount++;
              } else {
                assertNever(highlightReason);
              }
              const MAX_RESULT_LENGTH = 1e3;
              if (ranges.length >= MAX_RESULT_LENGTH) {
                hasMore = true;
                break forLoop;
              }
              ranges.push(new Range(lineNumber, startIndex + 1, lineNumber, endIndex + 1));
            }
          }
        } while (m);
      }
    return {
      ranges,
      hasMore,
      ambiguousCharacterCount,
      invisibleCharacterCount,
      nonBasicAsciiCharacterCount
    };
  }
  static computeUnicodeHighlightReason(char, options) {
    const codePointHighlighter = new CodePointHighlighter(options);
    const reason = codePointHighlighter.shouldHighlightNonBasicASCII(char, null);
    switch (reason) {
      case 0 /* None */:
        return null;
      case 2 /* Invisible */:
        return { kind: 1 /* Invisible */ };
      case 3 /* Ambiguous */: {
        const codePoint = char.codePointAt(0);
        const primaryConfusable = codePointHighlighter.ambiguousCharacters.getPrimaryConfusable(codePoint);
        const notAmbiguousInLocales = strings.AmbiguousCharacters.getLocales().filter(
          (l) => !strings.AmbiguousCharacters.getInstance(
            /* @__PURE__ */ new Set([...options.allowedLocales, l])
          ).isAmbiguous(codePoint)
        );
        return { kind: 0 /* Ambiguous */, confusableWith: String.fromCodePoint(primaryConfusable), notAmbiguousInLocales };
      }
      case 1 /* NonBasicASCII */:
        return { kind: 2 /* NonBasicAscii */ };
    }
  }
}
function buildRegExpCharClassExpr(codePoints, flags) {
  const src = `[${strings.escapeRegExpCharacters(
    codePoints.map((i) => String.fromCodePoint(i)).join("")
  )}]`;
  return src;
}
var UnicodeHighlighterReasonKind = /* @__PURE__ */ ((UnicodeHighlighterReasonKind2) => {
  UnicodeHighlighterReasonKind2[UnicodeHighlighterReasonKind2["Ambiguous"] = 0] = "Ambiguous";
  UnicodeHighlighterReasonKind2[UnicodeHighlighterReasonKind2["Invisible"] = 1] = "Invisible";
  UnicodeHighlighterReasonKind2[UnicodeHighlighterReasonKind2["NonBasicAscii"] = 2] = "NonBasicAscii";
  return UnicodeHighlighterReasonKind2;
})(UnicodeHighlighterReasonKind || {});
class CodePointHighlighter {
  constructor(options) {
    this.options = options;
    this.allowedCodePoints = new Set(options.allowedCodePoints);
    this.ambiguousCharacters = strings.AmbiguousCharacters.getInstance(new Set(options.allowedLocales));
  }
  getCandidateCodePoints() {
    if (this.options.nonBasicASCII) {
      return "allNonBasicAscii";
    }
    const set = /* @__PURE__ */ new Set();
    if (this.options.invisibleCharacters) {
      for (const cp of strings.InvisibleCharacters.codePoints) {
        if (!isAllowedInvisibleCharacter(String.fromCodePoint(cp))) {
          set.add(cp);
        }
      }
    }
    if (this.options.ambiguousCharacters) {
      for (const cp of this.ambiguousCharacters.getConfusableCodePoints()) {
        set.add(cp);
      }
    }
    for (const cp of this.allowedCodePoints) {
      set.delete(cp);
    }
    return set;
  }
  shouldHighlightNonBasicASCII(character, wordContext) {
    const codePoint = character.codePointAt(0);
    if (this.allowedCodePoints.has(codePoint)) {
      return 0 /* None */;
    }
    if (this.options.nonBasicASCII) {
      return 1 /* NonBasicASCII */;
    }
    let hasBasicASCIICharacters = false;
    let hasNonConfusableNonBasicAsciiCharacter = false;
    if (wordContext) {
      for (const char of wordContext) {
        const codePoint2 = char.codePointAt(0);
        const isBasicASCII = strings.isBasicASCII(char);
        hasBasicASCIICharacters = hasBasicASCIICharacters || isBasicASCII;
        if (!isBasicASCII && !this.ambiguousCharacters.isAmbiguous(codePoint2) && !strings.InvisibleCharacters.isInvisibleCharacter(codePoint2)) {
          hasNonConfusableNonBasicAsciiCharacter = true;
        }
      }
    }
    if (
      /* Don't allow mixing weird looking characters with ASCII */
      !hasBasicASCIICharacters && /* Is there an obviously weird looking character? */
      hasNonConfusableNonBasicAsciiCharacter
    ) {
      return 0 /* None */;
    }
    if (this.options.invisibleCharacters) {
      if (!isAllowedInvisibleCharacter(character) && strings.InvisibleCharacters.isInvisibleCharacter(codePoint)) {
        return 2 /* Invisible */;
      }
    }
    if (this.options.ambiguousCharacters) {
      if (this.ambiguousCharacters.isAmbiguous(codePoint)) {
        return 3 /* Ambiguous */;
      }
    }
    return 0 /* None */;
  }
}
function isAllowedInvisibleCharacter(character) {
  return character === " " || character === "\n" || character === "	";
}
var SimpleHighlightReason = /* @__PURE__ */ ((SimpleHighlightReason2) => {
  SimpleHighlightReason2[SimpleHighlightReason2["None"] = 0] = "None";
  SimpleHighlightReason2[SimpleHighlightReason2["NonBasicASCII"] = 1] = "NonBasicASCII";
  SimpleHighlightReason2[SimpleHighlightReason2["Invisible"] = 2] = "Invisible";
  SimpleHighlightReason2[SimpleHighlightReason2["Ambiguous"] = 3] = "Ambiguous";
  return SimpleHighlightReason2;
})(SimpleHighlightReason || {});
export {
  UnicodeHighlighterReasonKind,
  UnicodeTextModelHighlighter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vc2VydmljZXMvdW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VhcmNoZXIgfSBmcm9tICcuLi9tb2RlbC90ZXh0TW9kZWxTZWFyY2guanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElVbmljb2RlSGlnaGxpZ2h0c1Jlc3VsdCB9IGZyb20gJy4vZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IERFRkFVTFRfV09SRF9SRUdFWFAsIGdldFdvcmRBdFRleHQgfSBmcm9tICcuLi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgVW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyIHtcblx0cHVibGljIHN0YXRpYyBjb21wdXRlVW5pY29kZUhpZ2hsaWdodHMobW9kZWw6IElVbmljb2RlQ2hhcmFjdGVyU2VhcmNoZXJUYXJnZXQsIG9wdGlvbnM6IFVuaWNvZGVIaWdobGlnaHRlck9wdGlvbnMsIHJhbmdlPzogSVJhbmdlKTogSVVuaWNvZGVIaWdobGlnaHRzUmVzdWx0IHtcblx0XHRjb25zdCBzdGFydExpbmUgPSByYW5nZSA/IHJhbmdlLnN0YXJ0TGluZU51bWJlciA6IDE7XG5cdFx0Y29uc3QgZW5kTGluZSA9IHJhbmdlID8gcmFuZ2UuZW5kTGluZU51bWJlciA6IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0Y29uc3QgY29kZVBvaW50SGlnaGxpZ2h0ZXIgPSBuZXcgQ29kZVBvaW50SGlnaGxpZ2h0ZXIob3B0aW9ucyk7XG5cblx0XHRjb25zdCBjYW5kaWRhdGVzID0gY29kZVBvaW50SGlnaGxpZ2h0ZXIuZ2V0Q2FuZGlkYXRlQ29kZVBvaW50cygpO1xuXHRcdGxldCByZWdleDogUmVnRXhwO1xuXHRcdGlmIChjYW5kaWRhdGVzID09PSAnYWxsTm9uQmFzaWNBc2NpaScpIHtcblx0XHRcdHJlZ2V4ID0gbmV3IFJlZ0V4cCgnW15cXFxcdFxcXFxuXFxcXHJcXFxceDIwLVxcXFx4N0VdJywgJ2cnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVnZXggPSBuZXcgUmVnRXhwKGAke2J1aWxkUmVnRXhwQ2hhckNsYXNzRXhwcihBcnJheS5mcm9tKGNhbmRpZGF0ZXMpKX1gLCAnZycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlYXJjaGVyID0gbmV3IFNlYXJjaGVyKG51bGwsIHJlZ2V4KTtcblx0XHRjb25zdCByYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHRsZXQgaGFzTW9yZSA9IGZhbHNlO1xuXHRcdGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG5cdFx0bGV0IGFtYmlndW91c0NoYXJhY3RlckNvdW50ID0gMDtcblx0XHRsZXQgaW52aXNpYmxlQ2hhcmFjdGVyQ291bnQgPSAwO1xuXHRcdGxldCBub25CYXNpY0FzY2lpQ2hhcmFjdGVyQ291bnQgPSAwO1xuXG5cdFx0Zm9yTG9vcDpcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lLCBsaW5lQ291bnQgPSBlbmRMaW5lOyBsaW5lTnVtYmVyIDw9IGxpbmVDb3VudDsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbGluZUxlbmd0aCA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblxuXHRcdFx0Ly8gUmVzZXQgcmVnZXggdG8gc2VhcmNoIGZyb20gdGhlIGJlZ2lubmluZ1xuXHRcdFx0c2VhcmNoZXIucmVzZXQoMCk7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdG0gPSBzZWFyY2hlci5uZXh0KGxpbmVDb250ZW50KTtcblx0XHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0XHRsZXQgc3RhcnRJbmRleCA9IG0uaW5kZXg7XG5cdFx0XHRcdFx0bGV0IGVuZEluZGV4ID0gbS5pbmRleCArIG1bMF0ubGVuZ3RoO1xuXG5cdFx0XHRcdFx0Ly8gRXh0ZW5kIHJhbmdlIHRvIGVudGlyZSBjb2RlIHBvaW50XG5cdFx0XHRcdFx0aWYgKHN0YXJ0SW5kZXggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoc3RhcnRJbmRleCAtIDEpO1xuXHRcdFx0XHRcdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlQmVmb3JlKSkge1xuXHRcdFx0XHRcdFx0XHRzdGFydEluZGV4LS07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbmRJbmRleCArIDEgPCBsaW5lTGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoZW5kSW5kZXggLSAxKTtcblx0XHRcdFx0XHRcdGlmIChzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZUJlZm9yZSkpIHtcblx0XHRcdFx0XHRcdFx0ZW5kSW5kZXgrKztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgc3RyID0gbGluZUNvbnRlbnQuc3Vic3RyaW5nKHN0YXJ0SW5kZXgsIGVuZEluZGV4KTtcblx0XHRcdFx0XHRsZXQgd29yZCA9IGdldFdvcmRBdFRleHQoc3RhcnRJbmRleCArIDEsIERFRkFVTFRfV09SRF9SRUdFWFAsIGxpbmVDb250ZW50LCAwKTtcblx0XHRcdFx0XHRpZiAod29yZCAmJiB3b3JkLmVuZENvbHVtbiA8PSBzdGFydEluZGV4ICsgMSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIHdvcmQgZG9lcyBub3QgaW5jbHVkZSB0aGUgcHJvYmxlbWF0aWMgY2hhcmFjdGVyLCBpZ25vcmUgdGhlIHdvcmRcblx0XHRcdFx0XHRcdHdvcmQgPSBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBoaWdobGlnaHRSZWFzb24gPSBjb2RlUG9pbnRIaWdobGlnaHRlci5zaG91bGRIaWdobGlnaHROb25CYXNpY0FTQ0lJKHN0ciwgd29yZCA/IHdvcmQud29yZCA6IG51bGwpO1xuXG5cdFx0XHRcdFx0aWYgKGhpZ2hsaWdodFJlYXNvbiAhPT0gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLk5vbmUpIHtcblx0XHRcdFx0XHRcdGlmIChoaWdobGlnaHRSZWFzb24gPT09IFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5BbWJpZ3VvdXMpIHtcblx0XHRcdFx0XHRcdFx0YW1iaWd1b3VzQ2hhcmFjdGVyQ291bnQrKztcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaGlnaGxpZ2h0UmVhc29uID09PSBTaW1wbGVIaWdobGlnaHRSZWFzb24uSW52aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHRcdGludmlzaWJsZUNoYXJhY3RlckNvdW50Kys7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGhpZ2hsaWdodFJlYXNvbiA9PT0gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLk5vbkJhc2ljQVNDSUkpIHtcblx0XHRcdFx0XHRcdFx0bm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50Kys7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhc3NlcnROZXZlcihoaWdobGlnaHRSZWFzb24pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBNQVhfUkVTVUxUX0xFTkdUSCA9IDEwMDA7XG5cdFx0XHRcdFx0XHRpZiAocmFuZ2VzLmxlbmd0aCA+PSBNQVhfUkVTVUxUX0xFTkdUSCkge1xuXHRcdFx0XHRcdFx0XHRoYXNNb3JlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0YnJlYWsgZm9yTG9vcDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmFuZ2VzLnB1c2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIHN0YXJ0SW5kZXggKyAxLCBsaW5lTnVtYmVyLCBlbmRJbmRleCArIDEpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gd2hpbGUgKG0pO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2VzLFxuXHRcdFx0aGFzTW9yZSxcblx0XHRcdGFtYmlndW91c0NoYXJhY3RlckNvdW50LFxuXHRcdFx0aW52aXNpYmxlQ2hhcmFjdGVyQ291bnQsXG5cdFx0XHRub25CYXNpY0FzY2lpQ2hhcmFjdGVyQ291bnRcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wdXRlVW5pY29kZUhpZ2hsaWdodFJlYXNvbihjaGFyOiBzdHJpbmcsIG9wdGlvbnM6IFVuaWNvZGVIaWdobGlnaHRlck9wdGlvbnMpOiBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb24gfCBudWxsIHtcblx0XHRjb25zdCBjb2RlUG9pbnRIaWdobGlnaHRlciA9IG5ldyBDb2RlUG9pbnRIaWdobGlnaHRlcihvcHRpb25zKTtcblxuXHRcdGNvbnN0IHJlYXNvbiA9IGNvZGVQb2ludEhpZ2hsaWdodGVyLnNob3VsZEhpZ2hsaWdodE5vbkJhc2ljQVNDSUkoY2hhciwgbnVsbCk7XG5cdFx0c3dpdGNoIChyZWFzb24pIHtcblx0XHRcdGNhc2UgU2ltcGxlSGlnaGxpZ2h0UmVhc29uLk5vbmU6XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBTaW1wbGVIaWdobGlnaHRSZWFzb24uSW52aXNpYmxlOlxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLkludmlzaWJsZSB9O1xuXG5cdFx0XHRjYXNlIFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5BbWJpZ3VvdXM6IHtcblx0XHRcdFx0Y29uc3QgY29kZVBvaW50ID0gY2hhci5jb2RlUG9pbnRBdCgwKSE7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlDb25mdXNhYmxlID0gY29kZVBvaW50SGlnaGxpZ2h0ZXIuYW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRQcmltYXJ5Q29uZnVzYWJsZShjb2RlUG9pbnQpITtcblx0XHRcdFx0Y29uc3Qgbm90QW1iaWd1b3VzSW5Mb2NhbGVzID1cblx0XHRcdFx0XHRzdHJpbmdzLkFtYmlndW91c0NoYXJhY3RlcnMuZ2V0TG9jYWxlcygpLmZpbHRlcihcblx0XHRcdFx0XHRcdChsKSA9PlxuXHRcdFx0XHRcdFx0XHQhc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKFxuXHRcdFx0XHRcdFx0XHRcdG5ldyBTZXQoWy4uLm9wdGlvbnMuYWxsb3dlZExvY2FsZXMsIGxdKVxuXHRcdFx0XHRcdFx0XHQpLmlzQW1iaWd1b3VzKGNvZGVQb2ludClcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLkFtYmlndW91cywgY29uZnVzYWJsZVdpdGg6IFN0cmluZy5mcm9tQ29kZVBvaW50KHByaW1hcnlDb25mdXNhYmxlKSwgbm90QW1iaWd1b3VzSW5Mb2NhbGVzIH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5Ob25CYXNpY0FTQ0lJOlxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLk5vbkJhc2ljQXNjaWkgfTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gYnVpbGRSZWdFeHBDaGFyQ2xhc3NFeHByKGNvZGVQb2ludHM6IG51bWJlcltdLCBmbGFncz86IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNyYyA9IGBbJHtzdHJpbmdzLmVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoXG5cdFx0Y29kZVBvaW50cy5tYXAoKGkpID0+IFN0cmluZy5mcm9tQ29kZVBvaW50KGkpKS5qb2luKCcnKVxuXHQpfV1gO1xuXHRyZXR1cm4gc3JjO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kIHtcblx0QW1iaWd1b3VzLCBJbnZpc2libGUsIE5vbkJhc2ljQXNjaWlcbn1cblxuZXhwb3J0IHR5cGUgVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uID0ge1xuXHRraW5kOiBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLkFtYmlndW91cztcblx0Y29uZnVzYWJsZVdpdGg6IHN0cmluZztcblx0bm90QW1iaWd1b3VzSW5Mb2NhbGVzOiBzdHJpbmdbXTtcbn0gfCB7XG5cdGtpbmQ6IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuSW52aXNpYmxlO1xufSB8IHtcblx0a2luZDogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5Ob25CYXNpY0FzY2lpO1xufTtcblxuY2xhc3MgQ29kZVBvaW50SGlnaGxpZ2h0ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IGFsbG93ZWRDb2RlUG9pbnRzOiBTZXQ8bnVtYmVyPjtcblx0cHVibGljIHJlYWRvbmx5IGFtYmlndW91c0NoYXJhY3RlcnM6IHN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycztcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zKSB7XG5cdFx0dGhpcy5hbGxvd2VkQ29kZVBvaW50cyA9IG5ldyBTZXQob3B0aW9ucy5hbGxvd2VkQ29kZVBvaW50cyk7XG5cdFx0dGhpcy5hbWJpZ3VvdXNDaGFyYWN0ZXJzID0gc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKG5ldyBTZXQob3B0aW9ucy5hbGxvd2VkTG9jYWxlcykpO1xuXHR9XG5cblx0cHVibGljIGdldENhbmRpZGF0ZUNvZGVQb2ludHMoKTogU2V0PG51bWJlcj4gfCAnYWxsTm9uQmFzaWNBc2NpaScge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMubm9uQmFzaWNBU0NJSSkge1xuXHRcdFx0cmV0dXJuICdhbGxOb25CYXNpY0FzY2lpJztcblx0XHR9XG5cblx0XHRjb25zdCBzZXQgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuaW52aXNpYmxlQ2hhcmFjdGVycykge1xuXHRcdFx0Zm9yIChjb25zdCBjcCBvZiBzdHJpbmdzLkludmlzaWJsZUNoYXJhY3RlcnMuY29kZVBvaW50cykge1xuXHRcdFx0XHRpZiAoIWlzQWxsb3dlZEludmlzaWJsZUNoYXJhY3RlcihTdHJpbmcuZnJvbUNvZGVQb2ludChjcCkpKSB7XG5cdFx0XHRcdFx0c2V0LmFkZChjcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmFtYmlndW91c0NoYXJhY3RlcnMpIHtcblx0XHRcdGZvciAoY29uc3QgY3Agb2YgdGhpcy5hbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldENvbmZ1c2FibGVDb2RlUG9pbnRzKCkpIHtcblx0XHRcdFx0c2V0LmFkZChjcCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjcCBvZiB0aGlzLmFsbG93ZWRDb2RlUG9pbnRzKSB7XG5cdFx0XHRzZXQuZGVsZXRlKGNwKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2V0O1xuXHR9XG5cblx0cHVibGljIHNob3VsZEhpZ2hsaWdodE5vbkJhc2ljQVNDSUkoY2hhcmFjdGVyOiBzdHJpbmcsIHdvcmRDb250ZXh0OiBzdHJpbmcgfCBudWxsKTogU2ltcGxlSGlnaGxpZ2h0UmVhc29uIHtcblx0XHRjb25zdCBjb2RlUG9pbnQgPSBjaGFyYWN0ZXIuY29kZVBvaW50QXQoMCkhO1xuXG5cdFx0aWYgKHRoaXMuYWxsb3dlZENvZGVQb2ludHMuaGFzKGNvZGVQb2ludCkpIHtcblx0XHRcdHJldHVybiBTaW1wbGVIaWdobGlnaHRSZWFzb24uTm9uZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLm5vbkJhc2ljQVNDSUkpIHtcblx0XHRcdHJldHVybiBTaW1wbGVIaWdobGlnaHRSZWFzb24uTm9uQmFzaWNBU0NJSTtcblx0XHR9XG5cblx0XHRsZXQgaGFzQmFzaWNBU0NJSUNoYXJhY3RlcnMgPSBmYWxzZTtcblx0XHRsZXQgaGFzTm9uQ29uZnVzYWJsZU5vbkJhc2ljQXNjaWlDaGFyYWN0ZXIgPSBmYWxzZTtcblx0XHRpZiAod29yZENvbnRleHQpIHtcblx0XHRcdGZvciAoY29uc3QgY2hhciBvZiB3b3JkQ29udGV4dCkge1xuXHRcdFx0XHRjb25zdCBjb2RlUG9pbnQgPSBjaGFyLmNvZGVQb2ludEF0KDApITtcblx0XHRcdFx0Y29uc3QgaXNCYXNpY0FTQ0lJID0gc3RyaW5ncy5pc0Jhc2ljQVNDSUkoY2hhcik7XG5cdFx0XHRcdGhhc0Jhc2ljQVNDSUlDaGFyYWN0ZXJzID0gaGFzQmFzaWNBU0NJSUNoYXJhY3RlcnMgfHwgaXNCYXNpY0FTQ0lJO1xuXG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHQhaXNCYXNpY0FTQ0lJICYmXG5cdFx0XHRcdFx0IXRoaXMuYW1iaWd1b3VzQ2hhcmFjdGVycy5pc0FtYmlndW91cyhjb2RlUG9pbnQpICYmXG5cdFx0XHRcdFx0IXN0cmluZ3MuSW52aXNpYmxlQ2hhcmFjdGVycy5pc0ludmlzaWJsZUNoYXJhY3Rlcihjb2RlUG9pbnQpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGhhc05vbkNvbmZ1c2FibGVOb25CYXNpY0FzY2lpQ2hhcmFjdGVyID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdC8qIERvbid0IGFsbG93IG1peGluZyB3ZWlyZCBsb29raW5nIGNoYXJhY3RlcnMgd2l0aCBBU0NJSSAqLyAhaGFzQmFzaWNBU0NJSUNoYXJhY3RlcnMgJiZcblx0XHRcdC8qIElzIHRoZXJlIGFuIG9idmlvdXNseSB3ZWlyZCBsb29raW5nIGNoYXJhY3Rlcj8gKi8gaGFzTm9uQ29uZnVzYWJsZU5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJcblx0XHQpIHtcblx0XHRcdHJldHVybiBTaW1wbGVIaWdobGlnaHRSZWFzb24uTm9uZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmludmlzaWJsZUNoYXJhY3RlcnMpIHtcblx0XHRcdC8vIFRPRE8gY2hlY2sgZm9yIGVtb2ppc1xuXHRcdFx0aWYgKCFpc0FsbG93ZWRJbnZpc2libGVDaGFyYWN0ZXIoY2hhcmFjdGVyKSAmJiBzdHJpbmdzLkludmlzaWJsZUNoYXJhY3RlcnMuaXNJbnZpc2libGVDaGFyYWN0ZXIoY29kZVBvaW50KSkge1xuXHRcdFx0XHRyZXR1cm4gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLkludmlzaWJsZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmFtYmlndW91c0NoYXJhY3RlcnMpIHtcblx0XHRcdGlmICh0aGlzLmFtYmlndW91c0NoYXJhY3RlcnMuaXNBbWJpZ3VvdXMoY29kZVBvaW50KSkge1xuXHRcdFx0XHRyZXR1cm4gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLkFtYmlndW91cztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLk5vbmU7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNBbGxvd2VkSW52aXNpYmxlQ2hhcmFjdGVyKGNoYXJhY3Rlcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBjaGFyYWN0ZXIgPT09ICcgJyB8fCBjaGFyYWN0ZXIgPT09ICdcXG4nIHx8IGNoYXJhY3RlciA9PT0gJ1xcdCc7XG59XG5cbmNvbnN0IGVudW0gU2ltcGxlSGlnaGxpZ2h0UmVhc29uIHtcblx0Tm9uZSxcblx0Tm9uQmFzaWNBU0NJSSxcblx0SW52aXNpYmxlLFxuXHRBbWJpZ3VvdXNcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVW5pY29kZUNoYXJhY3RlclNlYXJjaGVyVGFyZ2V0IHtcblx0Z2V0TGluZUNvdW50KCk6IG51bWJlcjtcblx0Z2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVuaWNvZGVIaWdobGlnaHRlck9wdGlvbnMge1xuXHRub25CYXNpY0FTQ0lJOiBib29sZWFuO1xuXHRhbWJpZ3VvdXNDaGFyYWN0ZXJzOiBib29sZWFuO1xuXHRpbnZpc2libGVDaGFyYWN0ZXJzOiBib29sZWFuO1xuXHRpbmNsdWRlQ29tbWVudHM6IGJvb2xlYW47XG5cdGluY2x1ZGVTdHJpbmdzOiBib29sZWFuO1xuXHRhbGxvd2VkQ29kZVBvaW50czogbnVtYmVyW107XG5cdGFsbG93ZWRMb2NhbGVzOiBzdHJpbmdbXTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQWlCLGFBQWE7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxhQUFhO0FBRXpCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCLHFCQUFxQjtBQUU1QyxNQUFNLDRCQUE0QjtBQUFBLEVBQ3hDLE9BQWMseUJBQXlCLE9BQXdDLFNBQW9DLE9BQTBDO0FBQzVKLFVBQU0sWUFBWSxRQUFRLE1BQU0sa0JBQWtCO0FBQ2xELFVBQU0sVUFBVSxRQUFR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YyxFQUFFLENBQUMsR0FBRztBQUMzRCxjQUFJLElBQUksRUFBRTtBQUFBLFFBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxRQUFRLHFCQUFxQjtBQUNyQyxpQkFBVyxNQUFNLEtBQUssb0JBQW9CLHdCQUF3QixHQUFHO0FBQ3BFLFlBQUksSUFBSSxFQUFFO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFFQSxlQUFXLE1BQU0sS0FBSyxtQkFBbUI7QUFDeEMsVUFBSSxPQUFPLEVBQUU7QUFBQSxJQUNkO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLDZCQUE2QixXQUFtQixhQUFtRDtBQUN6RyxVQUFNLFlBQVksVUFBVSxZQUFZLENBQUM7QUFFekMsUUFBSSxLQUFLLGtCQUFrQixJQUFJLFNBQVMsR0FBRztBQUMxQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxRQUFRLGVBQWU7QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLDBCQUEwQjtBQUM5QixRQUFJLHlDQUF5QztBQUM3QyxRQUFJLGFBQWE7QUFDaEIsaUJBQVcsUUFBUSxhQUFhO0FBQy9CLGNBQU1DLGFBQVksS0FBSyxZQUFZLENBQUM7QUFDcEMsY0FBTSxlQUFlLFFBQVEsYUFBYSxJQUFJO0FBQzlDLGtDQUEwQiwyQkFBMkI7QUFFckQsWUFDQyxDQUFDLGdCQUNELENBQUMsS0FBSyxvQkFBb0IsWUFBWUEsVUFBUyxLQUMvQyxDQUFDLFFBQVEsb0JBQW9CLHFCQUFxQkEsVUFBUyxHQUMxRDtBQUNELG1EQUF5QztBQUFBLFFBQzFDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQTtBQUFBO0FBQUEsTUFDOEQsQ0FBQztBQUFBLE1BQ1Q7QUFBQSxNQUNwRDtBQUNELGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLFFBQVEscUJBQXFCO0FBRXJDLFVBQUksQ0FBQyw0QkFBNEIsU0FBUyxLQUFLLFFBQVEsb0JBQW9CLHFCQUFxQixTQUFTLEdBQUc7QUFDM0csZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLFFBQVEscUJBQXFCO0FBQ3JDLFVBQUksS0FBSyxvQkFBb0IsWUFBWSxTQUFTLEdBQUc7QUFDcEQsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMsNEJBQTRCLFdBQTRCO0FBQ2hFLFNBQU8sY0FBYyxPQUFPLGNBQWMsUUFBUSxjQUFjO0FBQ2pFO0FBRUEsSUFBVyx3QkFBWCxrQkFBV0MsMkJBQVg7QUFDQyxFQUFBQSw4Q0FBQTtBQUNBLEVBQUFBLDhDQUFBO0FBQ0EsRUFBQUEsOENBQUE7QUFDQSxFQUFBQSw4Q0FBQTtBQUpVLFNBQUFBO0FBQUEsR0FBQTsiLAogICJuYW1lcyI6IFsiVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZCIsICJjb2RlUG9pbnQiLCAiU2ltcGxlSGlnaGxpZ2h0UmVhc29uIl0KfQo=
