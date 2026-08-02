import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { GraphemeIterator, forAnsiStringParts, removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import "./media/testMessageColorizer.css";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
const colorAttrRe = /^\x1b\[([0-9]+)m$/;
var Classes = /* @__PURE__ */ ((Classes2) => {
  Classes2["Prefix"] = "tstm-ansidec-";
  Classes2["ForegroundPrefix"] = "tstm-ansidec-fg";
  Classes2["BackgroundPrefix"] = "tstm-ansidec-bg";
  Classes2["Bold"] = "tstm-ansidec-1";
  Classes2["Faint"] = "tstm-ansidec-2";
  Classes2["Italic"] = "tstm-ansidec-3";
  Classes2["Underline"] = "tstm-ansidec-4";
  return Classes2;
})(Classes || {});
const renderTestMessageAsText = (tm) => typeof tm === "string" ? removeAnsiEscapeCodes(tm) : renderAsPlaintext(tm);
const colorizeTestMessageInEditor = (message, editor) => {
  const decos = [];
  editor.changeDecorations((changeAccessor) => {
    let start = new Position(1, 1);
    let cls = [];
    for (const part of forAnsiStringParts(message)) {
      if (part.isCode) {
        const colorAttr = colorAttrRe.exec(part.str)?.[1];
        if (!colorAttr) {
          continue;
        }
        const n = Number(colorAttr);
        if (n === 0) {
          cls.length = 0;
        } else if (n === 22) {
          cls = cls.filter((c) => c !== "tstm-ansidec-1" /* Bold */ && c !== "tstm-ansidec-3" /* Italic */);
        } else if (n === 23) {
          cls = cls.filter((c) => c !== "tstm-ansidec-3" /* Italic */);
        } else if (n === 24) {
          cls = cls.filter((c) => c !== "tstm-ansidec-4" /* Underline */);
        } else if (n >= 30 && n <= 39 || n >= 90 && n <= 99) {
          cls = cls.filter((c) => !c.startsWith("tstm-ansidec-fg" /* ForegroundPrefix */));
          cls.push("tstm-ansidec-fg" /* ForegroundPrefix */ + colorAttr);
        } else if (n >= 40 && n <= 49 || n >= 100 && n <= 109) {
          cls = cls.filter((c) => !c.startsWith("tstm-ansidec-bg" /* BackgroundPrefix */));
          cls.push("tstm-ansidec-bg" /* BackgroundPrefix */ + colorAttr);
        } else {
          cls.push("tstm-ansidec-" /* Prefix */ + colorAttr);
        }
      } else {
        let line = start.lineNumber;
        let col = start.column;
        const graphemes = new GraphemeIterator(part.str);
        for (let i = 0; !graphemes.eol(); i += graphemes.nextGraphemeLength()) {
          if (part.str[i] === "\n") {
            line++;
            col = 1;
          } else {
            col++;
          }
        }
        const end = new Position(line, col);
        if (cls.length) {
          decos.push(changeAccessor.addDecoration(Range.fromPositions(start, end), {
            inlineClassName: cls.join(" "),
            description: "test-message-colorized"
          }));
        }
        start = end;
      }
    }
  });
  return toDisposable(() => editor.removeDecorations(decos));
};
export {
  colorizeTestMessageInEditor,
  renderTestMessageAsText
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0TWVzc2FnZUNvbG9yaXplci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBHcmFwaGVtZUl0ZXJhdG9yLCBmb3JBbnNpU3RyaW5nUGFydHMsIHJlbW92ZUFuc2lFc2NhcGVDb2RlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICcuL21lZGlhL3Rlc3RNZXNzYWdlQ29sb3JpemVyLmNzcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5cbmNvbnN0IGNvbG9yQXR0clJlID0gL15cXHgxYlxcWyhbMC05XSspbSQvO1xuXG5jb25zdCBlbnVtIENsYXNzZXMge1xuXHRQcmVmaXggPSAndHN0bS1hbnNpZGVjLScsXG5cdEZvcmVncm91bmRQcmVmaXggPSBDbGFzc2VzLlByZWZpeCArICdmZycsXG5cdEJhY2tncm91bmRQcmVmaXggPSBDbGFzc2VzLlByZWZpeCArICdiZycsXG5cdEJvbGQgPSBDbGFzc2VzLlByZWZpeCArICcxJyxcblx0RmFpbnQgPSBDbGFzc2VzLlByZWZpeCArICcyJyxcblx0SXRhbGljID0gQ2xhc3Nlcy5QcmVmaXggKyAnMycsXG5cdFVuZGVybGluZSA9IENsYXNzZXMuUHJlZml4ICsgJzQnLFxufVxuXG5leHBvcnQgY29uc3QgcmVuZGVyVGVzdE1lc3NhZ2VBc1RleHQgPSAodG06IHN0cmluZyB8IElNYXJrZG93blN0cmluZykgPT5cblx0dHlwZW9mIHRtID09PSAnc3RyaW5nJyA/IHJlbW92ZUFuc2lFc2NhcGVDb2Rlcyh0bSkgOiByZW5kZXJBc1BsYWludGV4dCh0bSk7XG5cblxuLyoqXG4gKiBBcHBsaWVzIGRlY29yYXRpb25zIGJhc2VkIG9uIEFOU0kgc3R5bGVzIGZyb20gdGhlIHRlc3QgbWVzc2FnZSBpbiB0aGUgZWRpdG9yLlxuICogQU5TSSBzZXF1ZW5jZXMgYXJlIHN0cmlwcGVkIGZyb20gdGhlIHRleHQgZGlzcGxheWVkIGluIGVkaXRvciwgYW5kIHRoaXNcbiAqIHJlLWFwcGxpZXMgdGhlaXIgY29sb3JpemF0aW9uLlxuICpcbiAqIFRoaXMgdXNlcyBkZWNvcmF0aW9ucyByYXRoZXIgdGhhbiBsYW5ndWFnZSBmZWF0dXJlcyBiZWNhdXNlIHRoZSBzdHJpbmdcbiAqIHJlbmRlcmVkIGluIHRoZSBlZGl0b3IgbGFja3MgdGhlIEFOU0kgY29kZXMgbmVlZGVkIHRvIGFjdHVhbGx5IGFwcGx5IHRoZVxuICogY29sb3JpemF0aW9uLlxuICpcbiAqIE5vdGU6IGRvZXMgbm90IHN1cHBvcnQgVHJ1ZUNvbG9yLlxuICovXG5leHBvcnQgY29uc3QgY29sb3JpemVUZXN0TWVzc2FnZUluRWRpdG9yID0gKG1lc3NhZ2U6IHN0cmluZywgZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0KTogSURpc3Bvc2FibGUgPT4ge1xuXHRjb25zdCBkZWNvczogc3RyaW5nW10gPSBbXTtcblxuXHRlZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoY2hhbmdlQWNjZXNzb3IgPT4ge1xuXHRcdGxldCBzdGFydCA9IG5ldyBQb3NpdGlvbigxLCAxKTtcblx0XHRsZXQgY2xzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiBmb3JBbnNpU3RyaW5nUGFydHMobWVzc2FnZSkpIHtcblx0XHRcdGlmIChwYXJ0LmlzQ29kZSkge1xuXHRcdFx0XHRjb25zdCBjb2xvckF0dHIgPSBjb2xvckF0dHJSZS5leGVjKHBhcnQuc3RyKT8uWzFdO1xuXHRcdFx0XHRpZiAoIWNvbG9yQXR0cikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbiA9IE51bWJlcihjb2xvckF0dHIpO1xuXHRcdFx0XHRpZiAobiA9PT0gMCkge1xuXHRcdFx0XHRcdGNscy5sZW5ndGggPSAwO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG4gPT09IDIyKSB7XG5cdFx0XHRcdFx0Y2xzID0gY2xzLmZpbHRlcihjID0+IGMgIT09IENsYXNzZXMuQm9sZCAmJiBjICE9PSBDbGFzc2VzLkl0YWxpYyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobiA9PT0gMjMpIHtcblx0XHRcdFx0XHRjbHMgPSBjbHMuZmlsdGVyKGMgPT4gYyAhPT0gQ2xhc3Nlcy5JdGFsaWMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG4gPT09IDI0KSB7XG5cdFx0XHRcdFx0Y2xzID0gY2xzLmZpbHRlcihjID0+IGMgIT09IENsYXNzZXMuVW5kZXJsaW5lKTtcblx0XHRcdFx0fSBlbHNlIGlmICgobiA+PSAzMCAmJiBuIDw9IDM5KSB8fCAobiA+PSA5MCAmJiBuIDw9IDk5KSkge1xuXHRcdFx0XHRcdGNscyA9IGNscy5maWx0ZXIoYyA9PiAhYy5zdGFydHNXaXRoKENsYXNzZXMuRm9yZWdyb3VuZFByZWZpeCkpO1xuXHRcdFx0XHRcdGNscy5wdXNoKENsYXNzZXMuRm9yZWdyb3VuZFByZWZpeCArIGNvbG9yQXR0cik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoKG4gPj0gNDAgJiYgbiA8PSA0OSkgfHwgKG4gPj0gMTAwICYmIG4gPD0gMTA5KSkge1xuXHRcdFx0XHRcdGNscyA9IGNscy5maWx0ZXIoYyA9PiAhYy5zdGFydHNXaXRoKENsYXNzZXMuQmFja2dyb3VuZFByZWZpeCkpO1xuXHRcdFx0XHRcdGNscy5wdXNoKENsYXNzZXMuQmFja2dyb3VuZFByZWZpeCArIGNvbG9yQXR0cik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2xzLnB1c2goQ2xhc3Nlcy5QcmVmaXggKyBjb2xvckF0dHIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgbGluZSA9IHN0YXJ0LmxpbmVOdW1iZXI7XG5cdFx0XHRcdGxldCBjb2wgPSBzdGFydC5jb2x1bW47XG5cblx0XHRcdFx0Y29uc3QgZ3JhcGhlbWVzID0gbmV3IEdyYXBoZW1lSXRlcmF0b3IocGFydC5zdHIpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgIWdyYXBoZW1lcy5lb2woKTsgaSArPSBncmFwaGVtZXMubmV4dEdyYXBoZW1lTGVuZ3RoKCkpIHtcblx0XHRcdFx0XHRpZiAocGFydC5zdHJbaV0gPT09ICdcXG4nKSB7XG5cdFx0XHRcdFx0XHRsaW5lKys7XG5cdFx0XHRcdFx0XHRjb2wgPSAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb2wrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBlbmQgPSBuZXcgUG9zaXRpb24obGluZSwgY29sKTtcblx0XHRcdFx0aWYgKGNscy5sZW5ndGgpIHtcblx0XHRcdFx0XHRkZWNvcy5wdXNoKGNoYW5nZUFjY2Vzc29yLmFkZERlY29yYXRpb24oUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydCwgZW5kKSwge1xuXHRcdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBjbHMuam9pbignICcpLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0LW1lc3NhZ2UtY29sb3JpemVkJyxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhcnQgPSBlbmQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvci5yZW1vdmVEZWNvcmF0aW9ucyhkZWNvcykpO1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBRWxDLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLGtCQUFrQixvQkFBb0IsNkJBQTZCO0FBQzVFLE9BQU87QUFFUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFdEIsTUFBTSxjQUFjO0FBRXBCLElBQVcsVUFBWCxrQkFBV0EsYUFBWDtBQUNDLEVBQUFBLFNBQUEsWUFBUztBQUNULEVBQUFBLFNBQUEsc0JBQW1CO0FBQ25CLEVBQUFBLFNBQUEsc0JBQW1CO0FBQ25CLEVBQUFBLFNBQUEsVUFBTztBQUNQLEVBQUFBLFNBQUEsV0FBUTtBQUNSLEVBQUFB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
