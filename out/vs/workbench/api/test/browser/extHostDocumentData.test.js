import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocumentData } from "../../common/extHostDocumentData.js";
import { Position } from "../../common/extHostTypes.js";
import { Range } from "../../../../editor/common/core/range.js";
import { mock } from "../../../../base/test/common/mock.js";
import * as perfData from "./extHostDocumentData.test.perf-data.js";
import { setDefaultGetWordAtTextConfig } from "../../../../editor/common/core/wordHelper.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostDocumentData", () => {
  let data;
  function assertPositionAt(offset, line, character) {
    const position = data.document.positionAt(offset);
    assert.strictEqual(position.line, line);
    assert.strictEqual(position.character, character);
  }
  function assertOffsetAt(line, character, offset) {
    const pos = new Position(line, character);
    const actual = data.document.offsetAt(pos);
    assert.strictEqual(actual, offset);
  }
  setup(function() {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      "This is line one",
      //16
      "and this is line number two",
      //27
      "it is followed by #3",
      //20
      "and finished with the fourth."
      //29
    ], "\n", 1, "text", false, "utf8");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("readonly-ness", () => {
    assert.throws(() => data.document.uri = null);
    assert.throws(() => data.document.fileName = "foofile");
    assert.throws(() => data.document.isDirty = false);
    assert.throws(() => data.document.isUntitled = false);
    assert.throws(() => data.document.languageId = "dddd");
    assert.throws(() => data.document.lineCount = 9);
  });
  test("save, when disposed", function() {
    let saved;
    const data2 = new ExtHostDocumentData(new class extends mock() {
      $trySaveDocument(uri) {
        assert.ok(!saved);
        saved = uri;
        return Promise.resolve(true);
      }
    }(), URI.parse("foo:bar"), [], "\n", 1, "text", true, "utf8");
    return data2.document.save().then(() => {
      assert.strictEqual(saved.toString(), "foo:bar");
      data2.dispose();
      return data2.document.save().then(() => {
        assert.ok(false, "expected failure");
      }, (err) => {
        assert.ok(err);
      });
    });
  });
  test("read, when disposed", function() {
    data.dispose();
    const { document } = data;
    assert.strictEqual(document.lineCount, 4);
    assert.strictEqual(document.lineAt(0).text, "This is line one");
  });
  test("lines", () => {
    assert.strictEqual(data.document.lineCount, 4);
    assert.throws(() => data.document.lineAt(-1));
    assert.throws(() => data.document.lineAt(data.document.lineCount));
    assert.throws(() => data.document.lineAt(Number.MAX_VALUE));
    assert.throws(() => data.document.lineAt(Number.MIN_VALUE));
    assert.throws(() => data.document.lineAt(0.8));
    let line = data.document.lineAt(0);
    assert.strictEqual(line.lineNumber, 0);
    assert.strictEqual(line.text.length, 16);
    assert.strictEqual(line.text, "This is line one");
    assert.strictEqual(line.isEmptyOrWhitespace, false);
    assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 0);
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: "	 "
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assert.strictEqual(line.text, "This is line one");
    assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 0);
    line = data.document.lineAt(0);
    assert.strictEqual(line.text, "	 This is line one");
    assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 2);
  });
  test("line, issue #5704", function() {
    let line = data.document.lineAt(0);
    let { range, rangeIncludingLineBreak } = line;
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 16);
    assert.strictEqual(rangeIncludingLineBreak.end.line, 1);
    assert.strictEqual(rangeIncludingLineBreak.end.character, 0);
    line = data.document.lineAt(data.document.lineCount - 1);
    range = line.range;
    rangeIncludingLineBreak = line.rangeIncludingLineBreak;
    assert.strictEqual(range.end.line, 3);
    assert.strictEqual(range.end.character, 29);
    assert.strictEqual(rangeIncludingLineBreak.end.line, 3);
    assert.strictEqual(rangeIncludingLineBreak.end.character, 29);
  });
  test("offsetAt", () => {
    assertOffsetAt(0, 0, 0);
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 16, 16);
    assertOffsetAt(1, 0, 17);
    assertOffsetAt(1, 3, 20);
    assertOffsetAt(2, 0, 45);
    assertOffsetAt(4, 29, 95);
    assertOffsetAt(4, 30, 95);
    assertOffsetAt(4, Number.MAX_VALUE, 95);
    assertOffsetAt(5, 29, 95);
    assertOffsetAt(Number.MAX_VALUE, 29, 95);
    assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
  });
  test("offsetAt, after remove", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: ""
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 13, 13);
    assertOffsetAt(1, 0, 14);
  });
  test("offsetAt, after replace", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: "is could be"
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 24, 24);
    assertOffsetAt(1, 0, 25);
  });
  test("offsetAt, after insert line", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: "is could be\na line with number"
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 13, 13);
    assertOffsetAt(1, 0, 14);
    assertOffsetAt(1, 18, 13 + 1 + 18);
    assertOffsetAt(1, 29, 13 + 1 + 29);
    assertOffsetAt(2, 0, 13 + 1 + 29 + 1);
  });
  test("offsetAt, after remove line", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: ""
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 2, 2);
    assertOffsetAt(1, 0, 25);
  });
  test("positionAt", () => {
    assertPositionAt(0, 0, 0);
    assertPositionAt(Number.MIN_VALUE, 0, 0);
    assertPositionAt(1, 0, 1);
    assertPositionAt(16, 0, 16);
    assertPositionAt(17, 1, 0);
    assertPositionAt(20, 1, 3);
    assertPositionAt(45, 2, 0);
    assertPositionAt(95, 3, 29);
    assertPositionAt(96, 3, 29);
    assertPositionAt(99, 3, 29);
    assertPositionAt(Number.MAX_VALUE, 3, 29);
  });
  test("getWordRangeAtPosition", () => {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      "aaaa bbbb+cccc abc"
    ], "\n", 1, "text", false, "utf8");
    let range = data.document.getWordRangeAtPosition(new Position(0, 2));
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 0);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 4);
    assert.throws(() => data.document.getWordRangeAtPosition(new Position(0, 2), /.*/));
    range = data.document.getWordRangeAtPosition(new Position(0, 5), /[a-z+]+/);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 5);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 14);
    range = data.document.getWordRangeAtPosition(new Position(0, 17), /[a-z+]+/);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 15);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 18);
    range = data.document.getWordRangeAtPosition(new Position(0, 11), /yy/);
    assert.strictEqual(range, void 0);
  });
  test("getWordRangeAtPosition doesn't quite use the regex as expected, #29102", function() {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      "some text here",
      "/** foo bar */",
      "function() {",
      '	"far boo"',
      "}"
    ], "\n", 1, "text", false, "utf8");
    let range = data.document.getWordRangeAtPosition(new Position(0, 0), /\/\*.+\*\//);
    assert.strictEqual(range, void 0);
    range = data.document.getWordRangeAtPosition(new Position(1, 0), /\/\*.+\*\//);
    assert.strictEqual(range.start.line, 1);
    assert.strictEqual(range.start.character, 0);
    assert.strictEqual(range.end.line, 1);
    assert.strictEqual(range.end.character, 14);
    range = data.document.getWordRangeAtPosition(new Position(3, 0), /("|').*\1/);
    assert.strictEqual(range, void 0);
    range = data.document.getWordRangeAtPosition(new Position(3, 1), /("|').*\1/);
    assert.strictEqual(range.start.line, 3);
    assert.strictEqual(range.start.character, 1);
    assert.strictEqual(range.end.line, 3);
    assert.strictEqual(range.end.character, 10);
  });
  test("getWordRangeAtPosition can freeze the extension host #95319", function() {
    const regex = /(https?:\/\/github\.com\/(([^\s]+)\/([^\s]+))\/([^\s]+\/)?(issues|pull)\/([0-9]+))|(([^\s]+)\/([^\s]+))?#([1-9][0-9]*)($|[\s\:\;\-\(\=])/;
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      perfData._$_$_expensive
    ], "\n", 1, "text", false, "utf8");
    const config = setDefaultGetWordAtTextConfig({ maxLen: 1e3, windowSize: 15, timeBudget: 30 });
    try {
      let range = data.document.getWordRangeAtPosition(new Position(0, 1177170), regex);
      assert.strictEqual(range, void 0);
      const pos = new Position(0, 1177170);
      range = data.document.getWordRangeAtPosition(pos);
      assert.ok(range);
      assert.ok(range.contains(pos));
      assert.strictEqual(data.document.getText(range), "TaskDefinition");
    } finally {
      config.dispose();
    }
  });
  test("Rename popup sometimes populates with text on the left side omitted #96013", function() {
    const regex = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;
    const line = "int abcdefhijklmnopqwvrstxyz;";
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      line
    ], "\n", 1, "text", false, "utf8");
    const range = data.document.getWordRangeAtPosition(new Position(0, 27), regex);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.start.character, 4);
    assert.strictEqual(range.end.character, 28);
  });
  test("Custom snippet $TM_SELECTED_TEXT not show suggestion #108892", function() {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      `        <p><span xml:lang="en">Sheldon</span>, soprannominato "<span xml:lang="en">Shelly</span> dalla madre e dalla sorella, \xE8 nato a <span xml:lang="en">Galveston</span>, in <span xml:lang="en">Texas</span>, il 26 febbraio 1980 in un supermercato. \xC8 stato un bambino prodigio, come testimoniato dal suo quoziente d'intelligenza (187, di molto superiore alla norma) e dalla sua rapida carriera scolastica: si \xE8 diplomato all'eta di 11 anni approdando alla stessa et\xE0 alla formazione universitaria e all'et\xE0 di 16 anni ha ottenuto il suo primo dottorato di ricerca. All'inizio della serie e per gran parte di essa vive con il coinquilino Leonard nell'appartamento 4A al 2311 <span xml:lang="en">North Los Robles Avenue</span> di <span xml:lang="en">Pasadena</span>, per poi trasferirsi nell'appartamento di <span xml:lang="en">Penny</span> con <span xml:lang="en">Amy</span> nella decima stagione. Come pi\xF9 volte afferma lui stesso possiede una memoria eidetica e un orecchio assoluto. \xC8 stato educato da una madre estremamente religiosa e, in pi\xF9 occasioni, questo aspetto contrasta con il rigore scientifico di <span xml:lang="en">Sheldon</span>; tuttavia la donna sembra essere l'unica persona in grado di comandarlo a bacchetta.</p>`
    ], "\n", 1, "text", false, "utf8");
    const pos = new Position(0, 55);
    const range = data.document.getWordRangeAtPosition(pos);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.start.character, 47);
    assert.strictEqual(range.end.character, 61);
    assert.strictEqual(data.document.getText(range), "soprannominato");
  });
});
var AssertDocumentLineMappingDirection = /* @__PURE__ */ ((AssertDocumentLineMappingDirection2) => {
  AssertDocumentLineMappingDirection2[AssertDocumentLineMappingDirection2["OffsetToPosition"] = 0] = "OffsetToPosition";
  AssertDocumentLineMappingDirection2[AssertDocumentLineMappingDirection2["PositionToOffset"] = 1] = "PositionToOffset";
  return AssertDocumentLineMappingDirection2;
})(AssertDocumentLineMappingDirection || {});
suite("ExtHostDocumentData updates line mapping", () => {
  function positionToStr(position) {
    return "(" + position.line + "," + position.character + ")";
  }
  function assertDocumentLineMapping(doc, direction) {
    const allText = doc.getText();
    let line = 0, character = 0, previousIsCarriageReturn = false;
    for (let offset = 0; offset <= allText.length; offset++) {
      const position = new Position(line, character + (previousIsCarriageReturn ? -1 : 0));
      if (direction === 0 /* OffsetToPosition */) {
        const actualPosition = doc.document.positionAt(offset);
        assert.strictEqual(positionToStr(actualPosition), positionToStr(position), "positionAt mismatch for offset " + offset);
      } else {
        const expectedOffset = offset + (previousIsCarriageReturn ? -1 : 0);
        const actualOffset = doc.document.offsetAt(position);
        assert.strictEqual(actualOffset, expectedOffset, "offsetAt mismatch for position " + positionToStr(position));
      }
      if (allText.charAt(offset) === "\n") {
        line++;
        character = 0;
      } else {
        character++;
      }
      previousIsCarriageReturn = allText.charAt(offset) === "\r";
    }
  }
  function createChangeEvent(range, text, eol) {
    return {
      changes: [{
        range,
        rangeOffset: void 0,
        rangeLength: void 0,
        text
      }],
      eol,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    };
  }
  function testLineMappingDirectionAfterEvents(lines, eol, direction, e) {
    const myDocument = new ExtHostDocumentData(void 0, URI.file(""), lines.slice(0), eol, 1, "text", false, "utf8");
    assertDocumentLineMapping(myDocument, direction);
    myDocument.onEvents(e);
    assertDocumentLineMapping(myDocument, direction);
  }
  function testLineMappingAfterEvents(lines, e) {
    testLineMappingDirectionAfterEvents(lines, "\n", 1 /* PositionToOffset */, e);
    testLineMappingDirectionAfterEvents(lines, "\n", 0 /* OffsetToPosition */, e);
    testLineMappingDirectionAfterEvents(lines, "\r\n", 1 /* PositionToOffset */, e);
    testLineMappingDirectionAfterEvents(lines, "\r\n", 0 /* OffsetToPosition */, e);
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  test("line mapping", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], { changes: [], eol: void 0, versionId: 7, isRedoing: false, isUndoing: false });
  });
  test("after remove", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), ""));
  });
  test("after replace", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), "is could be"));
  });
  test("after insert line", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), "is could be\na line with number"));
  });
  test("after insert two lines", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), "is could be\na line with number\nyet another line"));
  });
  test("after remove line", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 2, 6), ""));
  });
  test("after remove two lines", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 3, 6), ""));
  });
  test("after deleting entire content", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 4, 30), ""));
  });
  test("after replacing entire content", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 4, 30), "some new text\nthat\nspans multiple lines"));
  });
  test("after changing EOL to CRLF", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 1, 1, 1), "", "\r\n"));
  });
  test("after changing EOL to LF", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 1, 1, 1), "", "\n"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3REb2N1bWVudERhdGEudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnREYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudERhdGEuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWREb2N1bWVudHNTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElNb2RlbENoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvbWlycm9yVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0ICogYXMgcGVyZkRhdGEgZnJvbSAnLi9leHRIb3N0RG9jdW1lbnREYXRhLnRlc3QucGVyZi1kYXRhLmpzJztcbmltcG9ydCB7IHNldERlZmF1bHRHZXRXb3JkQXRUZXh0Q29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0RG9jdW1lbnREYXRhJywgKCkgPT4ge1xuXG5cdGxldCBkYXRhOiBFeHRIb3N0RG9jdW1lbnREYXRhO1xuXG5cdGZ1bmN0aW9uIGFzc2VydFBvc2l0aW9uQXQob2Zmc2V0OiBudW1iZXIsIGxpbmU6IG51bWJlciwgY2hhcmFjdGVyOiBudW1iZXIpIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGRhdGEuZG9jdW1lbnQucG9zaXRpb25BdChvZmZzZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvbi5saW5lLCBsaW5lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9zaXRpb24uY2hhcmFjdGVyLCBjaGFyYWN0ZXIpO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0T2Zmc2V0QXQobGluZTogbnVtYmVyLCBjaGFyYWN0ZXI6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIpIHtcblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24obGluZSwgY2hhcmFjdGVyKTtcblx0XHRjb25zdCBhY3R1YWwgPSBkYXRhLmRvY3VtZW50Lm9mZnNldEF0KHBvcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgb2Zmc2V0KTtcblx0fVxuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRkYXRhID0gbmV3IEV4dEhvc3REb2N1bWVudERhdGEodW5kZWZpbmVkISwgVVJJLmZpbGUoJycpLCBbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsIC8vMTZcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLCAvLzIwXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLCAvLzI5XG5cdFx0XSwgJ1xcbicsIDEsICd0ZXh0JywgZmFsc2UsICd1dGY4Jyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlYWRvbmx5LW5lc3MnLCAoKSA9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoZGF0YSBhcyBhbnkpLmRvY3VtZW50LnVyaSA9IG51bGwpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gKGRhdGEgYXMgYW55KS5kb2N1bWVudC5maWxlTmFtZSA9ICdmb29maWxlJyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoZGF0YSBhcyBhbnkpLmRvY3VtZW50LmlzRGlydHkgPSBmYWxzZSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoZGF0YSBhcyBhbnkpLmRvY3VtZW50LmlzVW50aXRsZWQgPSBmYWxzZSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoZGF0YSBhcyBhbnkpLmRvY3VtZW50Lmxhbmd1YWdlSWQgPSAnZGRkZCcpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gKGRhdGEgYXMgYW55KS5kb2N1bWVudC5saW5lQ291bnQgPSA5KTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSwgd2hlbiBkaXNwb3NlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgc2F2ZWQ6IFVSSTtcblx0XHRjb25zdCBkYXRhID0gbmV3IEV4dEhvc3REb2N1bWVudERhdGEobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRG9jdW1lbnRzU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJHRyeVNhdmVEb2N1bWVudCh1cmk6IFVSSSkge1xuXHRcdFx0XHRhc3NlcnQub2soIXNhdmVkKTtcblx0XHRcdFx0c2F2ZWQgPSB1cmk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSwgVVJJLnBhcnNlKCdmb286YmFyJyksIFtdLCAnXFxuJywgMSwgJ3RleHQnLCB0cnVlLCAndXRmOCcpO1xuXG5cdFx0cmV0dXJuIGRhdGEuZG9jdW1lbnQuc2F2ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkLnRvU3RyaW5nKCksICdmb286YmFyJyk7XG5cblx0XHRcdGRhdGEuZGlzcG9zZSgpO1xuXG5cdFx0XHRyZXR1cm4gZGF0YS5kb2N1bWVudC5zYXZlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5vayhmYWxzZSwgJ2V4cGVjdGVkIGZhaWx1cmUnKTtcblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGFzc2VydC5vayhlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQsIHdoZW4gZGlzcG9zZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZGF0YS5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCB7IGRvY3VtZW50IH0gPSBkYXRhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb2N1bWVudC5saW5lQ291bnQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb2N1bWVudC5saW5lQXQoMCkudGV4dCwgJ1RoaXMgaXMgbGluZSBvbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbGluZXMnLCAoKSA9PiB7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5kb2N1bWVudC5saW5lQ291bnQsIDQpO1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBkYXRhLmRvY3VtZW50LmxpbmVBdCgtMSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZGF0YS5kb2N1bWVudC5saW5lQXQoZGF0YS5kb2N1bWVudC5saW5lQ291bnQpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGRhdGEuZG9jdW1lbnQubGluZUF0KE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGRhdGEuZG9jdW1lbnQubGluZUF0KE51bWJlci5NSU5fVkFMVUUpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGRhdGEuZG9jdW1lbnQubGluZUF0KDAuOCkpO1xuXG5cdFx0bGV0IGxpbmUgPSBkYXRhLmRvY3VtZW50LmxpbmVBdCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZS5saW5lTnVtYmVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZS50ZXh0Lmxlbmd0aCwgMTYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lLnRleHQsICdUaGlzIGlzIGxpbmUgb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUuaXNFbXB0eU9yV2hpdGVzcGFjZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lLmZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlckluZGV4LCAwKTtcblxuXHRcdGRhdGEub25FdmVudHMoe1xuXHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHRcdHJhbmdlT2Zmc2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRyYW5nZUxlbmd0aDogdW5kZWZpbmVkISxcblx0XHRcdFx0dGV4dDogJ1xcdCAnXG5cdFx0XHR9XSxcblx0XHRcdGVvbDogdW5kZWZpbmVkISxcblx0XHRcdHZlcnNpb25JZDogdW5kZWZpbmVkISxcblx0XHRcdGlzUmVkb2luZzogZmFsc2UsXG5cdFx0XHRpc1VuZG9pbmc6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Ly8gbGluZSBkaWRuJ3QgY2hhbmdlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUudGV4dCwgJ1RoaXMgaXMgbGluZSBvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZS5maXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXJJbmRleCwgMCk7XG5cblx0XHQvLyBmZXRjaCBsaW5lIGFnYWluXG5cdFx0bGluZSA9IGRhdGEuZG9jdW1lbnQubGluZUF0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lLnRleHQsICdcXHQgVGhpcyBpcyBsaW5lIG9uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lLmZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlckluZGV4LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnbGluZSwgaXNzdWUgIzU3MDQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgbGluZSA9IGRhdGEuZG9jdW1lbnQubGluZUF0KDApO1xuXHRcdGxldCB7IHJhbmdlLCByYW5nZUluY2x1ZGluZ0xpbmVCcmVhayB9ID0gbGluZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQuY2hhcmFjdGVyLCAxNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlSW5jbHVkaW5nTGluZUJyZWFrLmVuZC5saW5lLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VJbmNsdWRpbmdMaW5lQnJlYWsuZW5kLmNoYXJhY3RlciwgMCk7XG5cblx0XHRsaW5lID0gZGF0YS5kb2N1bWVudC5saW5lQXQoZGF0YS5kb2N1bWVudC5saW5lQ291bnQgLSAxKTtcblx0XHRyYW5nZSA9IGxpbmUucmFuZ2U7XG5cdFx0cmFuZ2VJbmNsdWRpbmdMaW5lQnJlYWsgPSBsaW5lLnJhbmdlSW5jbHVkaW5nTGluZUJyZWFrO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDI5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VJbmNsdWRpbmdMaW5lQnJlYWsuZW5kLmxpbmUsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZUluY2x1ZGluZ0xpbmVCcmVhay5lbmQuY2hhcmFjdGVyLCAyOSk7XG5cblx0fSk7XG5cblx0dGVzdCgnb2Zmc2V0QXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMCwgMCk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMSwgMSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMTYsIDE2KTtcblx0XHRhc3NlcnRPZmZzZXRBdCgxLCAwLCAxNyk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMywgMjApO1xuXHRcdGFzc2VydE9mZnNldEF0KDIsIDAsIDQ1KTtcblx0XHRhc3NlcnRPZmZzZXRBdCg0LCAyOSwgOTUpO1xuXHRcdGFzc2VydE9mZnNldEF0KDQsIDMwLCA5NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoNCwgTnVtYmVyLk1BWF9WQUxVRSwgOTUpO1xuXHRcdGFzc2VydE9mZnNldEF0KDUsIDI5LCA5NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoTnVtYmVyLk1BWF9WQUxVRSwgMjksIDk1KTtcblx0XHRhc3NlcnRPZmZzZXRBdChOdW1iZXIuTUFYX1ZBTFVFLCBOdW1iZXIuTUFYX1ZBTFVFLCA5NSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29mZnNldEF0LCBhZnRlciByZW1vdmUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkYXRhLm9uRXZlbnRzKHtcblx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogNiB9LFxuXHRcdFx0XHRyYW5nZU9mZnNldDogdW5kZWZpbmVkISxcblx0XHRcdFx0cmFuZ2VMZW5ndGg6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHRleHQ6ICcnXG5cdFx0XHR9XSxcblx0XHRcdGVvbDogdW5kZWZpbmVkISxcblx0XHRcdHZlcnNpb25JZDogdW5kZWZpbmVkISxcblx0XHRcdGlzUmVkb2luZzogZmFsc2UsXG5cdFx0XHRpc1VuZG9pbmc6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMSwgMSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMTMsIDEzKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgxLCAwLCAxNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29mZnNldEF0LCBhZnRlciByZXBsYWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGF0YS5vbkV2ZW50cyh7XG5cdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDYgfSxcblx0XHRcdFx0cmFuZ2VPZmZzZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHJhbmdlTGVuZ3RoOiB1bmRlZmluZWQhLFxuXHRcdFx0XHR0ZXh0OiAnaXMgY291bGQgYmUnXG5cdFx0XHR9XSxcblx0XHRcdGVvbDogdW5kZWZpbmVkISxcblx0XHRcdHZlcnNpb25JZDogdW5kZWZpbmVkISxcblx0XHRcdGlzUmVkb2luZzogZmFsc2UsXG5cdFx0XHRpc1VuZG9pbmc6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMSwgMSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMjQsIDI0KTtcblx0XHRhc3NlcnRPZmZzZXRBdCgxLCAwLCAyNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29mZnNldEF0LCBhZnRlciBpbnNlcnQgbGluZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRhdGEub25FdmVudHMoe1xuXHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMywgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA2IH0sXG5cdFx0XHRcdHJhbmdlT2Zmc2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRyYW5nZUxlbmd0aDogdW5kZWZpbmVkISxcblx0XHRcdFx0dGV4dDogJ2lzIGNvdWxkIGJlXFxuYSBsaW5lIHdpdGggbnVtYmVyJ1xuXHRcdFx0fV0sXG5cdFx0XHRlb2w6IHVuZGVmaW5lZCEsXG5cdFx0XHR2ZXJzaW9uSWQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRpc1JlZG9pbmc6IGZhbHNlLFxuXHRcdFx0aXNVbmRvaW5nOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdGFzc2VydE9mZnNldEF0KDAsIDEsIDEpO1xuXHRcdGFzc2VydE9mZnNldEF0KDAsIDEzLCAxMyk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMCwgMTQpO1xuXHRcdGFzc2VydE9mZnNldEF0KDEsIDE4LCAxMyArIDEgKyAxOCk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMjksIDEzICsgMSArIDI5KTtcblx0XHRhc3NlcnRPZmZzZXRBdCgyLCAwLCAxMyArIDEgKyAyOSArIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZzZXRBdCwgYWZ0ZXIgcmVtb3ZlIGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkYXRhLm9uRXZlbnRzKHtcblx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogNiB9LFxuXHRcdFx0XHRyYW5nZU9mZnNldDogdW5kZWZpbmVkISxcblx0XHRcdFx0cmFuZ2VMZW5ndGg6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHRleHQ6ICcnXG5cdFx0XHR9XSxcblx0XHRcdGVvbDogdW5kZWZpbmVkISxcblx0XHRcdHZlcnNpb25JZDogdW5kZWZpbmVkISxcblx0XHRcdGlzUmVkb2luZzogZmFsc2UsXG5cdFx0XHRpc1VuZG9pbmc6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMSwgMSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMiwgMik7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMCwgMjUpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3NpdGlvbkF0JywgKCkgPT4ge1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoMCwgMCwgMCk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdChOdW1iZXIuTUlOX1ZBTFVFLCAwLCAwKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDEsIDAsIDEpO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoMTYsIDAsIDE2KTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDE3LCAxLCAwKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDIwLCAxLCAzKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDQ1LCAyLCAwKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDk1LCAzLCAyOSk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCg5NiwgMywgMjkpO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoOTksIDMsIDI5KTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KE51bWJlci5NQVhfVkFMVUUsIDMsIDI5KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0V29yZFJhbmdlQXRQb3NpdGlvbicsICgpID0+IHtcblx0XHRkYXRhID0gbmV3IEV4dEhvc3REb2N1bWVudERhdGEodW5kZWZpbmVkISwgVVJJLmZpbGUoJycpLCBbXG5cdFx0XHQnYWFhYSBiYmJiK2NjY2MgYWJjJ1xuXHRcdF0sICdcXG4nLCAxLCAndGV4dCcsIGZhbHNlLCAndXRmOCcpO1xuXG5cdFx0bGV0IHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCAyKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQuY2hhcmFjdGVyLCA0KTtcblxuXHRcdC8vIGlnbm9yZSBiYWQgcmVndWxhciBleHByZXNzb24gLy4qL1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCAyKSwgLy4qLykhKTtcblxuXHRcdHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCA1KSwgL1thLXorXSsvKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDE0KTtcblxuXHRcdHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCAxNyksIC9bYS16K10rLykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmNoYXJhY3RlciwgMTgpO1xuXG5cdFx0cmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDExKSwgL3l5LykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0V29yZFJhbmdlQXRQb3NpdGlvbiBkb2VzblxcJ3QgcXVpdGUgdXNlIHRoZSByZWdleCBhcyBleHBlY3RlZCwgIzI5MTAyJywgZnVuY3Rpb24gKCkge1xuXHRcdGRhdGEgPSBuZXcgRXh0SG9zdERvY3VtZW50RGF0YSh1bmRlZmluZWQhLCBVUkkuZmlsZSgnJyksIFtcblx0XHRcdCdzb21lIHRleHQgaGVyZScsXG5cdFx0XHQnLyoqIGZvbyBiYXIgKi8nLFxuXHRcdFx0J2Z1bmN0aW9uKCkgeycsXG5cdFx0XHQnXHRcImZhciBib29cIicsXG5cdFx0XHQnfSdcblx0XHRdLCAnXFxuJywgMSwgJ3RleHQnLCBmYWxzZSwgJ3V0ZjgnKTtcblxuXHRcdGxldCByYW5nZSA9IGRhdGEuZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMCwgMCksIC9cXC9cXCouK1xcKlxcLy8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZSwgdW5kZWZpbmVkKTtcblxuXHRcdHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAwKSwgL1xcL1xcKi4rXFwqXFwvLykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5saW5lLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmxpbmUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQuY2hhcmFjdGVyLCAxNCk7XG5cblx0XHRyYW5nZSA9IGRhdGEuZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMywgMCksIC8oXCJ8JykuKlxcMS8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZSwgdW5kZWZpbmVkKTtcblxuXHRcdHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigzLCAxKSwgLyhcInwnKS4qXFwxLykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5saW5lLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmxpbmUsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQuY2hhcmFjdGVyLCAxMCk7XG5cdH0pO1xuXG5cblx0dGVzdCgnZ2V0V29yZFJhbmdlQXRQb3NpdGlvbiBjYW4gZnJlZXplIHRoZSBleHRlbnNpb24gaG9zdCAjOTUzMTknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCByZWdleCA9IC8oaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLygoW15cXHNdKylcXC8oW15cXHNdKykpXFwvKFteXFxzXStcXC8pPyhpc3N1ZXN8cHVsbClcXC8oWzAtOV0rKSl8KChbXlxcc10rKVxcLyhbXlxcc10rKSk/IyhbMS05XVswLTldKikoJHxbXFxzXFw6XFw7XFwtXFwoXFw9XSkvO1xuXG5cdFx0ZGF0YSA9IG5ldyBFeHRIb3N0RG9jdW1lbnREYXRhKHVuZGVmaW5lZCEsIFVSSS5maWxlKCcnKSwgW1xuXHRcdFx0cGVyZkRhdGEuXyRfJF9leHBlbnNpdmVcblx0XHRdLCAnXFxuJywgMSwgJ3RleHQnLCBmYWxzZSwgJ3V0ZjgnKTtcblxuXHRcdC8vIHRoaXMgdGVzdCBvbmx5IGVuc3VyZXMgdGhhdCB3ZSBldmVudHVhbGx5IGdpdmUgYW5kIHRpbWVvdXQgKHdoZW4gc2VhcmNoaW5nIFwiZnVubnlcIiB3b3JkcyBhbmQgbG9uZyBsaW5lcylcblx0XHQvLyBmb3IgdGhlIHNha2Ugb2Ygc3BlZWR5IHRlc3RzIHdlIGxvd2VyIHRoZSB0aW1lQnVkZ2V0IGhlcmVcblx0XHRjb25zdCBjb25maWcgPSBzZXREZWZhdWx0R2V0V29yZEF0VGV4dENvbmZpZyh7IG1heExlbjogMTAwMCwgd2luZG93U2l6ZTogMTUsIHRpbWVCdWRnZXQ6IDMwIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgcmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDFfMTc3XzE3MCksIHJlZ2V4KSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbigwLCAxMTc3MTcwKTtcblx0XHRcdHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKHBvcykhO1xuXHRcdFx0YXNzZXJ0Lm9rKHJhbmdlKTtcblx0XHRcdGFzc2VydC5vayhyYW5nZS5jb250YWlucyhwb3MpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmRvY3VtZW50LmdldFRleHQocmFuZ2UpLCAnVGFza0RlZmluaXRpb24nKTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnUmVuYW1lIHBvcHVwIHNvbWV0aW1lcyBwb3B1bGF0ZXMgd2l0aCB0ZXh0IG9uIHRoZSBsZWZ0IHNpZGUgb21pdHRlZCAjOTYwMTMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCByZWdleCA9IC8oLT9cXGQqXFwuXFxkXFx3Kil8KFteXFxgXFx+XFwhXFxAXFwjXFwkXFwlXFxeXFwmXFwqXFwoXFwpXFwtXFw9XFwrXFxbXFx7XFxdXFx9XFxcXFxcfFxcO1xcOlxcJ1xcXCJcXCxcXC5cXDxcXD5cXC9cXD9cXHNdKykvZztcblx0XHRjb25zdCBsaW5lID0gJ2ludCBhYmNkZWZoaWprbG1ub3Bxd3Zyc3R4eXo7JztcblxuXHRcdGRhdGEgPSBuZXcgRXh0SG9zdERvY3VtZW50RGF0YSh1bmRlZmluZWQhLCBVUkkuZmlsZSgnJyksIFtcblx0XHRcdGxpbmVcblx0XHRdLCAnXFxuJywgMSwgJ3RleHQnLCBmYWxzZSwgJ3V0ZjgnKTtcblxuXHRcdGNvbnN0IHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCAyNyksIHJlZ2V4KSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDI4KTtcblx0fSk7XG5cblx0dGVzdCgnQ3VzdG9tIHNuaXBwZXQgJFRNX1NFTEVDVEVEX1RFWFQgbm90IHNob3cgc3VnZ2VzdGlvbiAjMTA4ODkyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGF0YSA9IG5ldyBFeHRIb3N0RG9jdW1lbnREYXRhKHVuZGVmaW5lZCEsIFVSSS5maWxlKCcnKSwgW1xuXHRcdFx0YCAgICAgICAgPHA+PHNwYW4geG1sOmxhbmc9XCJlblwiPlNoZWxkb248L3NwYW4+LCBzb3ByYW5ub21pbmF0byBcIjxzcGFuIHhtbDpsYW5nPVwiZW5cIj5TaGVsbHk8L3NwYW4+IGRhbGxhIG1hZHJlIGUgZGFsbGEgc29yZWxsYSwgXHUwMEU4IG5hdG8gYSA8c3BhbiB4bWw6bGFuZz1cImVuXCI+R2FsdmVzdG9uPC9zcGFuPiwgaW4gPHNwYW4geG1sOmxhbmc9XCJlblwiPlRleGFzPC9zcGFuPiwgaWwgMjYgZmViYnJhaW8gMTk4MCBpbiB1biBzdXBlcm1lcmNhdG8uIFx1MDBDOCBzdGF0byB1biBiYW1iaW5vIHByb2RpZ2lvLCBjb21lIHRlc3RpbW9uaWF0byBkYWwgc3VvIHF1b3ppZW50ZSBkJ2ludGVsbGlnZW56YSAoMTg3LCBkaSBtb2x0byBzdXBlcmlvcmUgYWxsYSBub3JtYSkgZSBkYWxsYSBzdWEgcmFwaWRhIGNhcnJpZXJhIHNjb2xhc3RpY2E6IHNpIFx1MDBFOCBkaXBsb21hdG8gYWxsJ2V0YSBkaSAxMSBhbm5pIGFwcHJvZGFuZG8gYWxsYSBzdGVzc2EgZXRcdTAwRTAgYWxsYSBmb3JtYXppb25lIHVuaXZlcnNpdGFyaWEgZSBhbGwnZXRcdTAwRTAgZGkgMTYgYW5uaSBoYSBvdHRlbnV0byBpbCBzdW8gcHJpbW8gZG90dG9yYXRvIGRpIHJpY2VyY2EuIEFsbCdpbml6aW8gZGVsbGEgc2VyaWUgZSBwZXIgZ3JhbiBwYXJ0ZSBkaSBlc3NhIHZpdmUgY29uIGlsIGNvaW5xdWlsaW5vIExlb25hcmQgbmVsbCdhcHBhcnRhbWVudG8gNEEgYWwgMjMxMSA8c3BhbiB4bWw6bGFuZz1cImVuXCI+Tm9ydGggTG9zIFJvYmxlcyBBdmVudWU8L3NwYW4+IGRpIDxzcGFuIHhtbDpsYW5nPVwiZW5cIj5QYXNhZGVuYTwvc3Bhbj4sIHBlciBwb2kgdHJhc2Zlcmlyc2kgbmVsbCdhcHBhcnRhbWVudG8gZGkgPHNwYW4geG1sOmxhbmc9XCJlblwiPlBlbm55PC9zcGFuPiBjb24gPHNwYW4geG1sOmxhbmc9XCJlblwiPkFteTwvc3Bhbj4gbmVsbGEgZGVjaW1hIHN0YWdpb25lLiBDb21lIHBpXHUwMEY5IHZvbHRlIGFmZmVybWEgbHVpIHN0ZXNzbyBwb3NzaWVkZSB1bmEgbWVtb3JpYSBlaWRldGljYSBlIHVuIG9yZWNjaGlvIGFzc29sdXRvLiBcdTAwQzggc3RhdG8gZWR1Y2F0byBkYSB1bmEgbWFkcmUgZXN0cmVtYW1lbnRlIHJlbGlnaW9zYSBlLCBpbiBwaVx1MDBGOSBvY2Nhc2lvbmksIHF1ZXN0byBhc3BldHRvIGNvbnRyYXN0YSBjb24gaWwgcmlnb3JlIHNjaWVudGlmaWNvIGRpIDxzcGFuIHhtbDpsYW5nPVwiZW5cIj5TaGVsZG9uPC9zcGFuPjsgdHV0dGF2aWEgbGEgZG9ubmEgc2VtYnJhIGVzc2VyZSBsJ3VuaWNhIHBlcnNvbmEgaW4gZ3JhZG8gZGkgY29tYW5kYXJsbyBhIGJhY2NoZXR0YS48L3A+YFxuXHRcdF0sICdcXG4nLCAxLCAndGV4dCcsIGZhbHNlLCAndXRmOCcpO1xuXG5cdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDAsIDU1KTtcblx0XHRjb25zdCByYW5nZSA9IGRhdGEuZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihwb3MpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCA0Nyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDYxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5kb2N1bWVudC5nZXRUZXh0KHJhbmdlKSwgJ3NvcHJhbm5vbWluYXRvJyk7XG5cdH0pO1xufSk7XG5cbmVudW0gQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbiB7XG5cdE9mZnNldFRvUG9zaXRpb24sXG5cdFBvc2l0aW9uVG9PZmZzZXRcbn1cblxuc3VpdGUoJ0V4dEhvc3REb2N1bWVudERhdGEgdXBkYXRlcyBsaW5lIG1hcHBpbmcnLCAoKSA9PiB7XG5cblx0ZnVuY3Rpb24gcG9zaXRpb25Ub1N0cihwb3NpdGlvbjogeyBsaW5lOiBudW1iZXI7IGNoYXJhY3RlcjogbnVtYmVyIH0pOiBzdHJpbmcge1xuXHRcdHJldHVybiAnKCcgKyBwb3NpdGlvbi5saW5lICsgJywnICsgcG9zaXRpb24uY2hhcmFjdGVyICsgJyknO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZyhkb2M6IEV4dEhvc3REb2N1bWVudERhdGEsIGRpcmVjdGlvbjogQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGFsbFRleHQgPSBkb2MuZ2V0VGV4dCgpO1xuXG5cdFx0bGV0IGxpbmUgPSAwLCBjaGFyYWN0ZXIgPSAwLCBwcmV2aW91c0lzQ2FycmlhZ2VSZXR1cm4gPSBmYWxzZTtcblx0XHRmb3IgKGxldCBvZmZzZXQgPSAwOyBvZmZzZXQgPD0gYWxsVGV4dC5sZW5ndGg7IG9mZnNldCsrKSB7XG5cdFx0XHQvLyBUaGUgcG9zaXRpb24gY29vcmRpbmF0ZSBzeXN0ZW0gY2Fubm90IGV4cHJlc3MgdGhlIHBvc2l0aW9uIGJldHdlZW4gXFxyIGFuZCBcXG5cblx0XHRcdGNvbnN0IHBvc2l0aW9uOiBQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihsaW5lLCBjaGFyYWN0ZXIgKyAocHJldmlvdXNJc0NhcnJpYWdlUmV0dXJuID8gLTEgOiAwKSk7XG5cblx0XHRcdGlmIChkaXJlY3Rpb24gPT09IEFzc2VydERvY3VtZW50TGluZU1hcHBpbmdEaXJlY3Rpb24uT2Zmc2V0VG9Qb3NpdGlvbikge1xuXHRcdFx0XHRjb25zdCBhY3R1YWxQb3NpdGlvbiA9IGRvYy5kb2N1bWVudC5wb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvblRvU3RyKGFjdHVhbFBvc2l0aW9uKSwgcG9zaXRpb25Ub1N0cihwb3NpdGlvbiksICdwb3NpdGlvbkF0IG1pc21hdGNoIGZvciBvZmZzZXQgJyArIG9mZnNldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGUgcG9zaXRpb24gY29vcmRpbmF0ZSBzeXN0ZW0gY2Fubm90IGV4cHJlc3MgdGhlIHBvc2l0aW9uIGJldHdlZW4gXFxyIGFuZCBcXG5cblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRPZmZzZXQ6IG51bWJlciA9IG9mZnNldCArIChwcmV2aW91c0lzQ2FycmlhZ2VSZXR1cm4gPyAtMSA6IDApO1xuXHRcdFx0XHRjb25zdCBhY3R1YWxPZmZzZXQgPSBkb2MuZG9jdW1lbnQub2Zmc2V0QXQocG9zaXRpb24pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsT2Zmc2V0LCBleHBlY3RlZE9mZnNldCwgJ29mZnNldEF0IG1pc21hdGNoIGZvciBwb3NpdGlvbiAnICsgcG9zaXRpb25Ub1N0cihwb3NpdGlvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWxsVGV4dC5jaGFyQXQob2Zmc2V0KSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0bGluZSsrO1xuXHRcdFx0XHRjaGFyYWN0ZXIgPSAwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2hhcmFjdGVyKys7XG5cdFx0XHR9XG5cblx0XHRcdHByZXZpb3VzSXNDYXJyaWFnZVJldHVybiA9IChhbGxUZXh0LmNoYXJBdChvZmZzZXQpID09PSAnXFxyJyk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ2hhbmdlRXZlbnQocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcsIGVvbD86IHN0cmluZyk6IElNb2RlbENoYW5nZWRFdmVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdHJhbmdlOiByYW5nZSxcblx0XHRcdFx0cmFuZ2VPZmZzZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHJhbmdlTGVuZ3RoOiB1bmRlZmluZWQhLFxuXHRcdFx0XHR0ZXh0OiB0ZXh0XG5cdFx0XHR9XSxcblx0XHRcdGVvbDogZW9sISxcblx0XHRcdHZlcnNpb25JZDogdW5kZWZpbmVkISxcblx0XHRcdGlzUmVkb2luZzogZmFsc2UsXG5cdFx0XHRpc1VuZG9pbmc6IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0TGluZU1hcHBpbmdEaXJlY3Rpb25BZnRlckV2ZW50cyhsaW5lczogc3RyaW5nW10sIGVvbDogc3RyaW5nLCBkaXJlY3Rpb246IEFzc2VydERvY3VtZW50TGluZU1hcHBpbmdEaXJlY3Rpb24sIGU6IElNb2RlbENoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG15RG9jdW1lbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50RGF0YSh1bmRlZmluZWQhLCBVUkkuZmlsZSgnJyksIGxpbmVzLnNsaWNlKDApLCBlb2wsIDEsICd0ZXh0JywgZmFsc2UsICd1dGY4Jyk7XG5cdFx0YXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZyhteURvY3VtZW50LCBkaXJlY3Rpb24pO1xuXG5cdFx0bXlEb2N1bWVudC5vbkV2ZW50cyhlKTtcblx0XHRhc3NlcnREb2N1bWVudExpbmVNYXBwaW5nKG15RG9jdW1lbnQsIGRpcmVjdGlvbik7XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhsaW5lczogc3RyaW5nW10sIGU6IElNb2RlbENoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0RpcmVjdGlvbkFmdGVyRXZlbnRzKGxpbmVzLCAnXFxuJywgQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbi5Qb3NpdGlvblRvT2Zmc2V0LCBlKTtcblx0XHR0ZXN0TGluZU1hcHBpbmdEaXJlY3Rpb25BZnRlckV2ZW50cyhsaW5lcywgJ1xcbicsIEFzc2VydERvY3VtZW50TGluZU1hcHBpbmdEaXJlY3Rpb24uT2Zmc2V0VG9Qb3NpdGlvbiwgZSk7XG5cblx0XHR0ZXN0TGluZU1hcHBpbmdEaXJlY3Rpb25BZnRlckV2ZW50cyhsaW5lcywgJ1xcclxcbicsIEFzc2VydERvY3VtZW50TGluZU1hcHBpbmdEaXJlY3Rpb24uUG9zaXRpb25Ub09mZnNldCwgZSk7XG5cdFx0dGVzdExpbmVNYXBwaW5nRGlyZWN0aW9uQWZ0ZXJFdmVudHMobGluZXMsICdcXHJcXG4nLCBBc3NlcnREb2N1bWVudExpbmVNYXBwaW5nRGlyZWN0aW9uLk9mZnNldFRvUG9zaXRpb24sIGUpO1xuXHR9XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbGluZSBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJyxcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLFxuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsXG5cdFx0XSwgeyBjaGFuZ2VzOiBbXSwgZW9sOiB1bmRlZmluZWQhLCB2ZXJzaW9uSWQ6IDcsIGlzUmVkb2luZzogZmFsc2UsIGlzVW5kb2luZzogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyIHJlbW92ZScsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAzLCAxLCA2KSwgJycpKTtcblx0fSk7XG5cblx0dGVzdCgnYWZ0ZXIgcmVwbGFjZScsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAzLCAxLCA2KSwgJ2lzIGNvdWxkIGJlJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciBpbnNlcnQgbGluZScsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAzLCAxLCA2KSwgJ2lzIGNvdWxkIGJlXFxuYSBsaW5lIHdpdGggbnVtYmVyJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciBpbnNlcnQgdHdvIGxpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJyxcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLFxuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsXG5cdFx0XSwgY3JlYXRlQ2hhbmdlRXZlbnQobmV3IFJhbmdlKDEsIDMsIDEsIDYpLCAnaXMgY291bGQgYmVcXG5hIGxpbmUgd2l0aCBudW1iZXJcXG55ZXQgYW5vdGhlciBsaW5lJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciByZW1vdmUgbGluZScsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAzLCAyLCA2KSwgJycpKTtcblx0fSk7XG5cblx0dGVzdCgnYWZ0ZXIgcmVtb3ZlIHR3byBsaW5lcycsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAzLCAzLCA2KSwgJycpKTtcblx0fSk7XG5cblx0dGVzdCgnYWZ0ZXIgZGVsZXRpbmcgZW50aXJlIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVNYXBwaW5nQWZ0ZXJFdmVudHMoW1xuXHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLFxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsXG5cdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLFxuXHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJyxcblx0XHRdLCBjcmVhdGVDaGFuZ2VFdmVudChuZXcgUmFuZ2UoMSwgMywgNCwgMzApLCAnJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciByZXBsYWNpbmcgZW50aXJlIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVNYXBwaW5nQWZ0ZXJFdmVudHMoW1xuXHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLFxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsXG5cdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLFxuXHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJyxcblx0XHRdLCBjcmVhdGVDaGFuZ2VFdmVudChuZXcgUmFuZ2UoMSwgMywgNCwgMzApLCAnc29tZSBuZXcgdGV4dFxcbnRoYXRcXG5zcGFucyBtdWx0aXBsZSBsaW5lcycpKTtcblx0fSk7XG5cblx0dGVzdCgnYWZ0ZXIgY2hhbmdpbmcgRU9MIHRvIENSTEYnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVNYXBwaW5nQWZ0ZXJFdmVudHMoW1xuXHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLFxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsXG5cdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLFxuXHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJyxcblx0XHRdLCBjcmVhdGVDaGFuZ2VFdmVudChuZXcgUmFuZ2UoMSwgMSwgMSwgMSksICcnLCAnXFxyXFxuJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciBjaGFuZ2luZyBFT0wgdG8gTEYnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVNYXBwaW5nQWZ0ZXJFdmVudHMoW1xuXHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLFxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsXG5cdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLFxuXHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJyxcblx0XHRdLCBjcmVhdGVDaGFuZ2VFdmVudChuZXcgUmFuZ2UoMSwgMSwgMSwgMSksICcnLCAnXFxuJykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLDJC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LGtCQUFrQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUFBLEVBQ2pELENBQUM7QUFFRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLCtCQUEyQjtBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLGtCQUFrQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLDJDQUEyQyxDQUFDO0FBQUEsRUFDMUYsQ0FBQztBQUVELE9BQUssOEJBQThCLE1BQU07QUFDeEMsK0JBQTJCO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsa0JBQWtCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLENBQUM7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSyw0QkFBNEIsTUFBTTtBQUN0QywrQkFBMkI7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxrQkFBa0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztBQUFBLEVBQ3RELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJkYXRhIiwgIkFzc2VydERvY3VtZW50TGluZU1hcHBpbmdEaXJlY3Rpb24iXQp9Cg==
