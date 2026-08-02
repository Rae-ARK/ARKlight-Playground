import assert from "assert";
import { CancellationError } from "../../../../base/common/errors.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { Mimes } from "../../../../base/common/mime.js";
import { isWindows } from "../../../../base/common/platform.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import * as types from "../../common/extHostTypes.js";
function assertToJSON(a, expected) {
  const raw = JSON.stringify(a);
  const actual = JSON.parse(raw);
  assert.deepStrictEqual(actual, expected);
}
suite("ExtHostTypes", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("URI, toJSON", function() {
    const uri = URI.parse("file:///path/test.file");
    assert.deepStrictEqual(uri.toJSON(), {
      $mid: MarshalledId.Uri,
      scheme: "file",
      path: "/path/test.file"
    });
    assert.ok(uri.fsPath);
    assert.deepStrictEqual(uri.toJSON(), {
      $mid: MarshalledId.Uri,
      scheme: "file",
      path: "/path/test.file",
      fsPath: "/path/test.file".replace(/\//g, isWindows ? "\\" : "/"),
      _sep: isWindows ? 1 : void 0
    });
    assert.ok(uri.toString());
    assert.deepStrictEqual(uri.toJSON(), {
      $mid: MarshalledId.Uri,
      scheme: "file",
      path: "/path/test.file",
      fsPath: "/path/test.file".replace(/\//g, isWindows ? "\\" : "/"),
      _sep: isWindows ? 1 : void 0,
      external: "file:///path/test.file"
    });
  });
  test("Disposable", () => {
    let count = 0;
    const d = new types.Disposable(() => {
      count += 1;
      return 12;
    });
    d.dispose();
    assert.strictEqual(count, 1);
    d.dispose();
    assert.strictEqual(count, 1);
    types.Disposable.from(void 0, { dispose() {
      count += 1;
    } }).dispose();
    assert.strictEqual(count, 2);
    assert.throws(() => {
      new types.Disposable(() => {
        throw new Error();
      }).dispose();
    });
    new types.Disposable(void 0).dispose();
  });
  test("Position", () => {
    assert.throws(() => new types.Position(-1, 0));
    assert.throws(() => new types.Position(0, -1));
    const pos = new types.Position(0, 0);
    assert.throws(() => pos.line = -1);
    assert.throws(() => pos.character = -1);
    assert.throws(() => pos.line = 12);
    const { line, character } = pos.toJSON();
    assert.strictEqual(line, 0);
    assert.strictEqual(character, 0);
  });
  test("Position, toJSON", function() {
    const pos = new types.Position(4, 2);
    assertToJSON(pos, { line: 4, character: 2 });
  });
  test("Position, isBefore(OrEqual)?", function() {
    const p1 = new types.Position(1, 3);
    const p2 = new types.Position(1, 2);
    const p3 = new types.Position(0, 4);
    assert.ok(p1.isBeforeOrEqual(p1));
    assert.ok(!p1.isBefore(p1));
    assert.ok(p2.isBefore(p1));
    assert.ok(p3.isBefore(p2));
  });
  test("Position, isAfter(OrEqual)?", function() {
    const p1 = new types.Position(1, 3);
    const p2 = new types.Position(1, 2);
    const p3 = new types.Position(0, 4);
    assert.ok(p1.isAfterOrEqual(p1));
    assert.ok(!p1.isAfter(p1));
    assert.ok(p1.isAfter(p2));
    assert.ok(p2.isAfter(p3));
    assert.ok(p1.isAfter(p3));
  });
  test("Position, compareTo", function() {
    const p1 = new types.Position(1, 3);
    const p2 = new types.Position(1, 2);
    const p3 = new types.Position(0, 4);
    assert.strictEqual(p1.compareTo(p1), 0);
    assert.strictEqual(p2.compareTo(p1), -1);
    assert.strictEqual(p1.compareTo(p2), 1);
    assert.strictEqual(p2.compareTo(p3), 1);
    assert.strictEqual(p1.compareTo(p3), 1);
  });
  test("Position, translate", function() {
    const p1 = new types.Position(1, 3);
    assert.ok(p1.translate() === p1);
    assert.ok(p1.translate({}) === p1);
    assert.ok(p1.translate(0, 0) === p1);
    assert.ok(p1.translate(0) === p1);
    assert.ok(p1.translate(void 0, 0) === p1);
    assert.ok(p1.translate(void 0) === p1);
    let res = p1.translate(-1);
    assert.strictEqual(res.line, 0);
    assert.strictEqual(res.character, 3);
    res = p1.translate({ lineDelta: -1 });
    assert.strictEqual(res.line, 0);
    assert.strictEqual(res.character, 3);
    res = p1.translate(void 0, -1);
    assert.strictEqual(res.line, 1);
    assert.strictEqual(res.character, 2);
    res = p1.translate({ characterDelta: -1 });
    assert.strictEqual(res.line, 1);
    assert.strictEqual(res.character, 2);
    res = p1.translate(11);
    assert.strictEqual(res.line, 12);
    assert.strictEqual(res.character, 3);
    assert.throws(() => p1.translate(null));
    assert.throws(() => p1.translate(null, null));
    assert.throws(() => p1.translate(-2));
    assert.throws(() => p1.translate({ lineDelta: -2 }));
    assert.throws(() => p1.translate(-2, null));
    assert.throws(() => p1.translate(0, -4));
  });
  test("Position, with", function() {
    const p1 = new types.Position(1, 3);
    assert.ok(p1.with() === p1);
    assert.ok(p1.with(1) === p1);
    assert.ok(p1.with(void 0, 3) === p1);
    assert.ok(p1.with(1, 3) === p1);
    assert.ok(p1.with(void 0) === p1);
    assert.ok(p1.with({ line: 1 }) === p1);
    assert.ok(p1.with({ character: 3 }) === p1);
    assert.ok(p1.with({ line: 1, character: 3 }) === p1);
    const p2 = p1.with({ line: 0, character: 11 });
    assert.strictEqual(p2.line, 0);
    assert.strictEqual(p2.character, 11);
    assert.throws(() => p1.with(null));
    assert.throws(() => p1.with(-9));
    assert.throws(() => p1.with(0, -9));
    assert.throws(() => p1.with({ line: -1 }));
    assert.throws(() => p1.with({ character: -1 }));
  });
  test("Range", () => {
    assert.throws(() => new types.Range(-1, 0, 0, 0));
    assert.throws(() => new types.Range(0, -1, 0, 0));
    assert.throws(() => new types.Range(new types.Position(0, 0), void 0));
    assert.throws(() => new types.Range(new types.Position(0, 0), null));
    assert.throws(() => new types.Range(void 0, new types.Position(0, 0)));
    assert.throws(() => new types.Range(null, new types.Position(0, 0)));
    const range = new types.Range(1, 0, 0, 0);
    assert.throws(() => {
      range.start = null;
    });
    assert.throws(() => {
      range.start = new types.Position(0, 3);
    });
  });
  test("Range, toJSON", function() {
    const range = new types.Range(1, 2, 3, 4);
    assertToJSON(range, [{ line: 1, character: 2 }, { line: 3, character: 4 }]);
  });
  test("Range, sorting", function() {
    let range = new types.Range(1, 0, 0, 0);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.end.line, 1);
    range = new types.Range(0, 0, 1, 0);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.end.line, 1);
  });
  test("Range, isEmpty|isSingleLine", function() {
    let range = new types.Range(1, 0, 0, 0);
    assert.ok(!range.isEmpty);
    assert.ok(!range.isSingleLine);
    range = new types.Range(1, 1, 1, 1);
    assert.ok(range.isEmpty);
    assert.ok(range.isSingleLine);
    range = new types.Range(0, 1, 0, 11);
    assert.ok(!range.isEmpty);
    assert.ok(range.isSingleLine);
    range = new types.Range(0, 0, 1, 1);
    assert.ok(!range.isEmpty);
    assert.ok(!range.isSingleLine);
  });
  test("Range, contains", function() {
    const range = new types.Range(1, 1, 2, 11);
    assert.ok(range.contains(range.start));
    assert.ok(range.contains(range.end));
    assert.ok(range.contains(range));
    assert.ok(!range.contains(new types.Range(1, 0, 2, 11)));
    assert.ok(!range.contains(new types.Range(0, 1, 2, 11)));
    assert.ok(!range.contains(new types.Range(1, 1, 2, 12)));
    assert.ok(!range.contains(new types.Range(1, 1, 3, 11)));
  });
  test("Range, contains (no instanceof)", function() {
    const range = new types.Range(1, 1, 2, 11);
    const startLike = { line: range.start.line, character: range.start.character };
    const endLike = { line: range.end.line, character: range.end.character };
    const rangeLike = { start: startLike, end: endLike };
    assert.ok(range.contains(startLike));
    assert.ok(range.contains(endLike));
    assert.ok(range.contains(rangeLike));
  });
  test("Range, intersection", function() {
    const range = new types.Range(1, 1, 2, 11);
    let res;
    res = range.intersection(range);
    assert.strictEqual(res.start.line, 1);
    assert.strictEqual(res.start.character, 1);
    assert.strictEqual(res.end.line, 2);
    assert.strictEqual(res.end.character, 11);
    res = range.intersection(new types.Range(2, 12, 4, 0));
    assert.strictEqual(res, void 0);
    res = range.intersection(new types.Range(0, 0, 1, 0));
    assert.strictEqual(res, void 0);
    res = range.intersection(new types.Range(0, 0, 1, 1));
    assert.ok(res.isEmpty);
    assert.strictEqual(res.start.line, 1);
    assert.strictEqual(res.start.character, 1);
    res = range.intersection(new types.Range(2, 11, 61, 1));
    assert.ok(res.isEmpty);
    assert.strictEqual(res.start.line, 2);
    assert.strictEqual(res.start.character, 11);
    assert.throws(() => range.intersection(null));
    assert.throws(() => range.intersection(void 0));
  });
  test("Range, union", function() {
    let ran1 = new types.Range(0, 0, 5, 5);
    assert.ok(ran1.union(new types.Range(0, 0, 1, 1)) === ran1);
    let res;
    res = ran1.union(new types.Range(2, 2, 9, 9));
    assert.ok(res.start === ran1.start);
    assert.strictEqual(res.end.line, 9);
    assert.strictEqual(res.end.character, 9);
    ran1 = new types.Range(2, 1, 5, 3);
    res = ran1.union(new types.Range(1, 0, 4, 2));
    assert.ok(res.end === ran1.end);
    assert.strictEqual(res.start.line, 1);
    assert.strictEqual(res.start.character, 0);
  });
  test("Range, with", function() {
    const range = new types.Range(1, 1, 2, 11);
    assert.ok(range.with(range.start) === range);
    assert.ok(range.with(void 0, range.end) === range);
    assert.ok(range.with(range.start, range.end) === range);
    assert.ok(range.with(new types.Position(1, 1)) === range);
    assert.ok(range.with(void 0, new types.Position(2, 11)) === range);
    assert.ok(range.with() === range);
    assert.ok(range.with({ start: range.start }) === range);
    assert.ok(range.with({ start: new types.Position(1, 1) }) === range);
    assert.ok(range.with({ end: range.end }) === range);
    assert.ok(range.with({ end: new types.Position(2, 11) }) === range);
    let res = range.with(void 0, new types.Position(9, 8));
    assert.strictEqual(res.end.line, 9);
    assert.strictEqual(res.end.character, 8);
    assert.strictEqual(res.start.line, 1);
    assert.strictEqual(res.start.character, 1);
    res = range.with({ end: new types.Position(9, 8) });
    assert.strictEqual(res.end.line, 9);
    assert.strictEqual(res.end.character, 8);
    assert.strictEqual(res.start.line, 1);
    assert.strictEqual(res.start.character, 1);
    res = range.with({ end: new types.Position(9, 8), start: new types.Position(2, 3) });
    assert.strictEqual(res.end.line, 9);
    assert.strictEqual(res.end.character, 8);
    assert.strictEqual(res.start.line, 2);
    assert.strictEqual(res.start.character, 3);
    assert.throws(() => range.with(null));
    assert.throws(() => range.with(void 0, null));
  });
  test("TextEdit", () => {
    const range = new types.Range(1, 1, 2, 11);
    let edit = new types.TextEdit(range, void 0);
    assert.strictEqual(edit.newText, "");
    assertToJSON(edit, { range: [{ line: 1, character: 1 }, { line: 2, character: 11 }], newText: "" });
    edit = new types.TextEdit(range, null);
    assert.strictEqual(edit.newText, "");
    edit = new types.TextEdit(range, "");
    assert.strictEqual(edit.newText, "");
  });
  test("WorkspaceEdit", () => {
    const a = URI.file("a.ts");
    const b = URI.file("b.ts");
    const edit = new types.WorkspaceEdit();
    assert.ok(!edit.has(a));
    edit.set(a, [types.TextEdit.insert(new types.Position(0, 0), "fff")]);
    assert.ok(edit.has(a));
    assert.strictEqual(edit.size, 1);
    assertToJSON(edit, [[a.toJSON(), [{ range: [{ line: 0, character: 0 }, { line: 0, character: 0 }], newText: "fff" }]]]);
    edit.insert(b, new types.Position(1, 1), "fff");
    edit.delete(b, new types.Range(0, 0, 0, 0));
    assert.ok(edit.has(b));
    assert.strictEqual(edit.size, 2);
    assertToJSON(edit, [
      [a.toJSON(), [{ range: [{ line: 0, character: 0 }, { line: 0, character: 0 }], newText: "fff" }]],
      [b.toJSON(), [{ range: [{ line: 1, character: 1 }, { line: 1, character: 1 }], newText: "fff" }, { range: [{ line: 0, character: 0 }, { line: 0, character: 0 }], newText: "" }]]
    ]);
    edit.set(b, void 0);
    assert.ok(!edit.has(b));
    assert.strictEqual(edit.size, 1);
    edit.set(b, [types.TextEdit.insert(new types.Position(0, 0), "ffff")]);
    assert.strictEqual(edit.get(b).length, 1);
  });
  test("WorkspaceEdit - keep order of text and file changes", function() {
    const edit = new types.WorkspaceEdit();
    edit.replace(URI.parse("foo:a"), new types.Range(1, 1, 1, 1), "foo");
    edit.renameFile(URI.parse("foo:a"), URI.parse("foo:b"));
    edit.replace(URI.parse("foo:a"), new types.Range(2, 1, 2, 1), "bar");
    edit.replace(URI.parse("foo:b"), new types.Range(3, 1, 3, 1), "bazz");
    const all = edit._allEntries();
    assert.strictEqual(all.length, 4);
    const [first, second, third, fourth] = all;
    assertType(first._type === types.FileEditType.Text);
    assert.strictEqual(first.uri.toString(), "foo:a");
    assertType(second._type === types.FileEditType.File);
    assert.strictEqual(second.from.toString(), "foo:a");
    assert.strictEqual(second.to.toString(), "foo:b");
    assertType(third._type === types.FileEditType.Text);
    assert.strictEqual(third.uri.toString(), "foo:a");
    assertType(fourth._type === types.FileEditType.Text);
    assert.strictEqual(fourth.uri.toString(), "foo:b");
  });
  test("WorkspaceEdit - two edits for one resource", function() {
    const edit = new types.WorkspaceEdit();
    const uri = URI.parse("foo:bar");
    edit.insert(uri, new types.Position(0, 0), "Hello");
    edit.insert(uri, new types.Position(0, 0), "Foo");
    assert.strictEqual(edit._allEntries().length, 2);
    const [first, second] = edit._allEntries();
    assertType(first._type === types.FileEditType.Text);
    assertType(second._type === types.FileEditType.Text);
    assert.strictEqual(first.edit.newText, "Hello");
    assert.strictEqual(second.edit.newText, "Foo");
  });
  test("WorkspaceEdit - set with metadata accepts undefined", function() {
    const edit = new types.WorkspaceEdit();
    const uri = URI.parse("foo:bar");
    edit.set(uri, [
      [types.TextEdit.insert(new types.Position(0, 0), "Hello"), { needsConfirmation: true, label: "foo" }],
      [types.TextEdit.insert(new types.Position(0, 0), "Hello"), void 0]
    ]);
    const all = edit._allEntries();
    assert.strictEqual(all.length, 2);
    const [first, second] = all;
    assert.ok(first.metadata);
    assert.ok(!second.metadata);
  });
  test("DocumentLink", () => {
    assert.throws(() => new types.DocumentLink(null, null));
    assert.throws(() => new types.DocumentLink(new types.Range(1, 1, 1, 1), null));
  });
  test("toJSON & stringify", function() {
    assertToJSON(new types.Selection(3, 4, 2, 1), { start: { line: 2, character: 1 }, end: { line: 3, character: 4 }, anchor: { line: 3, character: 4 }, active: { line: 2, character: 1 } });
    assertToJSON(new types.Location(URI.file("u.ts"), new types.Position(3, 4)), { uri: URI.parse("file:///u.ts").toJSON(), range: [{ line: 3, character: 4 }, { line: 3, character: 4 }] });
    assertToJSON(new types.Location(URI.file("u.ts"), new types.Range(1, 2, 3, 4)), { uri: URI.parse("file:///u.ts").toJSON(), range: [{ line: 1, character: 2 }, { line: 3, character: 4 }] });
    const diag = new types.Diagnostic(new types.Range(0, 1, 2, 3), "hello");
    assertToJSON(diag, { severity: "Error", message: "hello", range: [{ line: 0, character: 1 }, { line: 2, character: 3 }] });
    diag.source = "me";
    assertToJSON(diag, { severity: "Error", message: "hello", range: [{ line: 0, character: 1 }, { line: 2, character: 3 }], source: "me" });
    assertToJSON(new types.DocumentHighlight(new types.Range(2, 3, 4, 5)), { range: [{ line: 2, character: 3 }, { line: 4, character: 5 }], kind: "Text" });
    assertToJSON(new types.DocumentHighlight(new types.Range(2, 3, 4, 5), types.DocumentHighlightKind.Read), { range: [{ line: 2, character: 3 }, { line: 4, character: 5 }], kind: "Read" });
    assertToJSON(new types.SymbolInformation("test", types.SymbolKind.Boolean, new types.Range(0, 1, 2, 3)), {
      name: "test",
      kind: "Boolean",
      location: {
        range: [{ line: 0, character: 1 }, { line: 2, character: 3 }]
      }
    });
    assertToJSON(new types.CodeLens(new types.Range(7, 8, 9, 10)), { range: [{ line: 7, character: 8 }, { line: 9, character: 10 }] });
    assertToJSON(new types.CodeLens(new types.Range(7, 8, 9, 10), { command: "id", title: "title" }), {
      range: [{ line: 7, character: 8 }, { line: 9, character: 10 }],
      command: { command: "id", title: "title" }
    });
    assertToJSON(new types.CompletionItem("complete"), { label: "complete" });
    const item = new types.CompletionItem("complete");
    item.kind = types.CompletionItemKind.Interface;
    assertToJSON(item, { label: "complete", kind: "Interface" });
  });
  test("SymbolInformation, old ctor", function() {
    const info = new types.SymbolInformation("foo", types.SymbolKind.Array, new types.Range(1, 1, 2, 3));
    assert.ok(info.location instanceof types.Location);
    assert.strictEqual(info.location.uri, void 0);
  });
  test("SnippetString, builder-methods", function() {
    let string;
    string = new types.SnippetString();
    assert.strictEqual(string.appendText("I need $ and $").value, "I need \\$ and \\$");
    string = new types.SnippetString();
    assert.strictEqual(string.appendText("I need \\$").value, "I need \\\\\\$");
    string = new types.SnippetString();
    string.appendPlaceholder("fo$o}");
    assert.strictEqual(string.value, "${1:fo\\$o\\}}");
    string = new types.SnippetString();
    string.appendText("foo").appendTabstop(0).appendText("bar");
    assert.strictEqual(string.value, "foo$0bar");
    string = new types.SnippetString();
    string.appendText("foo").appendTabstop().appendText("bar");
    assert.strictEqual(string.value, "foo$1bar");
    string = new types.SnippetString();
    string.appendText("foo").appendTabstop(42).appendText("bar");
    assert.strictEqual(string.value, "foo$42bar");
    string = new types.SnippetString();
    string.appendText("foo").appendPlaceholder("farboo").appendText("bar");
    assert.strictEqual(string.value, "foo${1:farboo}bar");
    string = new types.SnippetString();
    string.appendText("foo").appendPlaceholder("far$boo").appendText("bar");
    assert.strictEqual(string.value, "foo${1:far\\$boo}bar");
    string = new types.SnippetString();
    string.appendText("foo").appendPlaceholder((b) => b.appendText("abc").appendPlaceholder("nested")).appendText("bar");
    assert.strictEqual(string.value, "foo${1:abc${2:nested}}bar");
    string = new types.SnippetString();
    string.appendVariable("foo");
    assert.strictEqual(string.value, "${foo}");
    string = new types.SnippetString();
    string.appendText("foo").appendVariable("TM_SELECTED_TEXT").appendText("bar");
    assert.strictEqual(string.value, "foo${TM_SELECTED_TEXT}bar");
    string = new types.SnippetString();
    string.appendVariable("BAR", (b) => b.appendPlaceholder("ops"));
    assert.strictEqual(string.value, "${BAR:${1:ops}}");
    string = new types.SnippetString();
    string.appendVariable("BAR", (b) => {
    });
    assert.strictEqual(string.value, "${BAR}");
    string = new types.SnippetString();
    string.appendChoice(["b", "a", "r"]);
    assert.strictEqual(string.value, "${1|b,a,r|}");
    string = new types.SnippetString();
    string.appendChoice(["b,1", "a,2", "r,3"]);
    assert.strictEqual(string.value, "${1|b\\,1,a\\,2,r\\,3|}");
    string = new types.SnippetString();
    string.appendChoice(["b", "a", "r"], 0);
    assert.strictEqual(string.value, "${0|b,a,r|}");
    string = new types.SnippetString();
    string.appendText("foo").appendChoice(["far", "boo"]).appendText("bar");
    assert.strictEqual(string.value, "foo${1|far,boo|}bar");
    string = new types.SnippetString();
    string.appendText("foo").appendChoice(["far", "$boo"]).appendText("bar");
    assert.strictEqual(string.value, "foo${1|far,$boo|}bar");
    string = new types.SnippetString();
    string.appendText("foo").appendPlaceholder("farboo").appendChoice(["far", "boo"]).appendText("bar");
    assert.strictEqual(string.value, "foo${1:farboo}${2|far,boo|}bar");
  });
  test("Snippet choices are incorrectly escaped/applied #180132", function() {
    {
      const s = new types.SnippetString();
      s.appendChoice(["aaa$aaa"]);
      s.appendText("bbb$bbb");
      assert.strictEqual(s.value, "${1|aaa$aaa|}bbb\\$bbb");
    }
    {
      const s = new types.SnippetString();
      s.appendChoice(["aaa,aaa"]);
      s.appendText("bbb$bbb");
      assert.strictEqual(s.value, "${1|aaa\\,aaa|}bbb\\$bbb");
    }
    {
      const s = new types.SnippetString();
      s.appendChoice(["aaa|aaa"]);
      s.appendText("bbb$bbb");
      assert.strictEqual(s.value, "${1|aaa\\|aaa|}bbb\\$bbb");
    }
    {
      const s = new types.SnippetString();
      s.appendChoice(["aaa\\aaa"]);
      s.appendText("bbb$bbb");
      assert.strictEqual(s.value, "${1|aaa\\\\aaa|}bbb\\$bbb");
    }
  });
  test("instanceof doesn't work for FileSystemError #49386", function() {
    const error = types.FileSystemError.Unavailable("foo");
    assert.ok(error instanceof Error);
    assert.ok(error instanceof types.FileSystemError);
  });
  test("CancellationError", function() {
    const err = new CancellationError();
    assert.strictEqual(err.name, "Canceled");
    assert.strictEqual(err.message, "Canceled");
  });
  test("CodeActionKind contains", () => {
    assert.ok(types.CodeActionKind.RefactorExtract.contains(types.CodeActionKind.RefactorExtract));
    assert.ok(types.CodeActionKind.RefactorExtract.contains(types.CodeActionKind.RefactorExtract.append("other")));
    assert.ok(!types.CodeActionKind.RefactorExtract.contains(types.CodeActionKind.Refactor));
    assert.ok(!types.CodeActionKind.RefactorExtract.contains(types.CodeActionKind.Refactor.append("other")));
    assert.ok(!types.CodeActionKind.RefactorExtract.contains(types.CodeActionKind.Empty.append("other").append("refactor")));
    assert.ok(!types.CodeActionKind.RefactorExtract.contains(types.CodeActionKind.Empty.append("refactory")));
  });
  test("CodeActionKind intersects", () => {
    assert.ok(types.CodeActionKind.RefactorExtract.intersects(types.CodeActionKind.RefactorExtract));
    assert.ok(types.CodeActionKind.RefactorExtract.intersects(types.CodeActionKind.Refactor));
    assert.ok(types.CodeActionKind.RefactorExtract.intersects(types.CodeActionKind.RefactorExtract.append("other")));
    assert.ok(!types.CodeActionKind.RefactorExtract.intersects(types.CodeActionKind.Refactor.append("other")));
    assert.ok(!types.CodeActionKind.RefactorExtract.intersects(types.CodeActionKind.Empty.append("other").append("refactor")));
    assert.ok(!types.CodeActionKind.RefactorExtract.intersects(types.CodeActionKind.Empty.append("refactory")));
  });
  function toArr(uint32Arr) {
    const r = [];
    for (let i = 0, len = uint32Arr.length; i < len; i++) {
      r[i] = uint32Arr[i];
    }
    return r;
  }
  test("SemanticTokensBuilder simple", () => {
    const builder = new types.SemanticTokensBuilder();
    builder.push(1, 0, 5, 1, 1);
    builder.push(1, 10, 4, 2, 2);
    builder.push(2, 2, 3, 2, 2);
    assert.deepStrictEqual(toArr(builder.build().data), [
      1,
      0,
      5,
      1,
      1,
      0,
      10,
      4,
      2,
      2,
      1,
      2,
      3,
      2,
      2
    ]);
  });
  test("SemanticTokensBuilder no modifier", () => {
    const builder = new types.SemanticTokensBuilder();
    builder.push(1, 0, 5, 1);
    builder.push(1, 10, 4, 2);
    builder.push(2, 2, 3, 2);
    assert.deepStrictEqual(toArr(builder.build().data), [
      1,
      0,
      5,
      1,
      0,
      0,
      10,
      4,
      2,
      0,
      1,
      2,
      3,
      2,
      0
    ]);
  });
  test("SemanticTokensBuilder out of order 1", () => {
    const builder = new types.SemanticTokensBuilder();
    builder.push(2, 0, 5, 1, 1);
    builder.push(2, 10, 1, 2, 2);
    builder.push(2, 15, 2, 3, 3);
    builder.push(1, 0, 4, 4, 4);
    assert.deepStrictEqual(toArr(builder.build().data), [
      1,
      0,
      4,
      4,
      4,
      1,
      0,
      5,
      1,
      1,
      0,
      10,
      1,
      2,
      2,
      0,
      5,
      2,
      3,
      3
    ]);
  });
  test("SemanticTokensBuilder out of order 2", () => {
    const builder = new types.SemanticTokensBuilder();
    builder.push(2, 10, 5, 1, 1);
    builder.push(2, 2, 4, 2, 2);
    assert.deepStrictEqual(toArr(builder.build().data), [
      2,
      2,
      4,
      2,
      2,
      0,
      8,
      5,
      1,
      1
    ]);
  });
  test("SemanticTokensBuilder with legend", () => {
    const legend = new types.SemanticTokensLegend(
      ["aType", "bType", "cType", "dType"],
      ["mod0", "mod1", "mod2", "mod3", "mod4", "mod5"]
    );
    const builder = new types.SemanticTokensBuilder(legend);
    builder.push(new types.Range(1, 0, 1, 5), "bType");
    builder.push(new types.Range(2, 0, 2, 4), "cType", ["mod0", "mod5"]);
    builder.push(new types.Range(3, 0, 3, 3), "dType", ["mod2", "mod4"]);
    assert.deepStrictEqual(toArr(builder.build().data), [
      1,
      0,
      5,
      1,
      0,
      1,
      0,
      4,
      2,
      1 | 1 << 5,
      1,
      0,
      3,
      3,
      1 << 2 | 1 << 4
    ]);
  });
  test("Markdown codeblock rendering is swapped #111604", function() {
    const md = new types.MarkdownString().appendCodeblock('<img src=0 onerror="alert(1)">', "html");
    assert.deepStrictEqual(md.value, '\n```html\n<img src=0 onerror="alert(1)">\n```\n');
  });
  test("NotebookCellOutputItem - factories", function() {
    assert.throws(() => {
      new types.NotebookCellOutputItem(new Uint8Array(), "invalid");
    });
    let item = types.NotebookCellOutputItem.error(new Error());
    assert.strictEqual(item.mime, "application/vnd.code.notebook.error");
    item = types.NotebookCellOutputItem.error({ name: "Hello" });
    assert.strictEqual(item.mime, "application/vnd.code.notebook.error");
    item = types.NotebookCellOutputItem.json(1);
    assert.strictEqual(item.mime, "text/x-json");
    assert.deepStrictEqual(item.data, new TextEncoder().encode(JSON.stringify(1)));
    item = types.NotebookCellOutputItem.json(1, "foo/bar");
    assert.strictEqual(item.mime, "foo/bar");
    assert.deepStrictEqual(item.data, new TextEncoder().encode(JSON.stringify(1)));
    item = types.NotebookCellOutputItem.json(true);
    assert.strictEqual(item.mime, "text/x-json");
    assert.deepStrictEqual(item.data, new TextEncoder().encode(JSON.stringify(true)));
    item = types.NotebookCellOutputItem.json([true, 1, "ddd"]);
    assert.strictEqual(item.mime, "text/x-json");
    assert.deepStrictEqual(item.data, new TextEncoder().encode(JSON.stringify([true, 1, "ddd"], void 0, "	")));
    item = types.NotebookCellOutputItem.text("H\u0119\u0142l\xF6");
    assert.strictEqual(item.mime, Mimes.text);
    assert.deepStrictEqual(item.data, new TextEncoder().encode("H\u0119\u0142l\xF6"));
    item = types.NotebookCellOutputItem.text("H\u0119\u0142l\xF6", "foo/bar");
    assert.strictEqual(item.mime, "foo/bar");
    assert.deepStrictEqual(item.data, new TextEncoder().encode("H\u0119\u0142l\xF6"));
  });
  test("FileDecoration#validate", function() {
    assert.ok(types.FileDecoration.validate({ badge: "u" }));
    assert.ok(types.FileDecoration.validate({ badge: "\xFC" }));
    assert.ok(types.FileDecoration.validate({ badge: "1" }));
    assert.ok(types.FileDecoration.validate({ badge: "\xE3\xE3" }));
    assert.ok(types.FileDecoration.validate({ badge: "\u{1F44B}" }));
    assert.ok(types.FileDecoration.validate({ badge: "\u{1F44B}\u{1F44B}" }));
    assert.ok(types.FileDecoration.validate({ badge: "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}" }));
    assert.ok(types.FileDecoration.validate({ badge: "\u0BAA\u0BCB" }));
    assert.throws(() => types.FileDecoration.validate({ badge: "hel" }));
    assert.throws(() => types.FileDecoration.validate({ badge: "\u{1F44B}\u{1F44B}\u{1F44B}" }));
    assert.throws(() => types.FileDecoration.validate({ badge: "\u0BAA\u0BC1\u0BA9\u0BCD\u0B9A\u0BBF\u0BB0\u0BBF\u0BAA\u0BCD\u0BAA\u0BCB\u0B9F\u0BC1" }));
    assert.throws(() => types.FileDecoration.validate({ badge: "\xE3\xE3\xE3" }));
  });
  test("runtime stable, type-def changed", function() {
    const m = new types.LanguageModelChatMessage(types.LanguageModelChatMessageRole.User, []);
    assert.deepStrictEqual(m.content, []);
    m.content = "Hello";
    assert.deepStrictEqual(m.content, [new types.LanguageModelTextPart("Hello")]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RUeXBlcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcblxuZnVuY3Rpb24gYXNzZXJ0VG9KU09OKGE6IGFueSwgZXhwZWN0ZWQ6IGFueSkge1xuXHRjb25zdCByYXcgPSBKU09OLnN0cmluZ2lmeShhKTtcblx0Y29uc3QgYWN0dWFsID0gSlNPTi5wYXJzZShyYXcpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xufVxuXG5zdWl0ZSgnRXh0SG9zdFR5cGVzJywgZnVuY3Rpb24gKCkge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ1VSSSwgdG9KU09OJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvdGVzdC5maWxlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cmkudG9KU09OKCksIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5VcmksXG5cdFx0XHRzY2hlbWU6ICdmaWxlJyxcblx0XHRcdHBhdGg6ICcvcGF0aC90ZXN0LmZpbGUnXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2sodXJpLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cmkudG9KU09OKCksIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5VcmksXG5cdFx0XHRzY2hlbWU6ICdmaWxlJyxcblx0XHRcdHBhdGg6ICcvcGF0aC90ZXN0LmZpbGUnLFxuXHRcdFx0ZnNQYXRoOiAnL3BhdGgvdGVzdC5maWxlJy5yZXBsYWNlKC9cXC8vZywgaXNXaW5kb3dzID8gJ1xcXFwnIDogJy8nKSxcblx0XHRcdF9zZXA6IGlzV2luZG93cyA/IDEgOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2sodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXJpLnRvSlNPTigpLCB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuVXJpLFxuXHRcdFx0c2NoZW1lOiAnZmlsZScsXG5cdFx0XHRwYXRoOiAnL3BhdGgvdGVzdC5maWxlJyxcblx0XHRcdGZzUGF0aDogJy9wYXRoL3Rlc3QuZmlsZScucmVwbGFjZSgvXFwvL2csIGlzV2luZG93cyA/ICdcXFxcJyA6ICcvJyksXG5cdFx0XHRfc2VwOiBpc1dpbmRvd3MgPyAxIDogdW5kZWZpbmVkLFxuXHRcdFx0ZXh0ZXJuYWw6ICdmaWxlOi8vL3BhdGgvdGVzdC5maWxlJ1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEaXNwb3NhYmxlJywgKCkgPT4ge1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRjb25zdCBkID0gbmV3IHR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y291bnQgKz0gMTtcblx0XHRcdHJldHVybiAxMjtcblx0XHR9KTtcblx0XHRkLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXG5cdFx0ZC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblxuXHRcdHR5cGVzLkRpc3Bvc2FibGUuZnJvbSh1bmRlZmluZWQhLCB7IGRpc3Bvc2UoKSB7IGNvdW50ICs9IDE7IH0gfSkuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMik7XG5cblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0bmV3IHR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoKTtcblx0XHRcdH0pLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdG5ldyB0eXBlcy5EaXNwb3NhYmxlKHVuZGVmaW5lZCEpLmRpc3Bvc2UoKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdQb3NpdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IG5ldyB0eXBlcy5Qb3NpdGlvbigtMSwgMCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gbmV3IHR5cGVzLlBvc2l0aW9uKDAsIC0xKSk7XG5cblx0XHRjb25zdCBwb3MgPSBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAocG9zIGFzIGFueSkubGluZSA9IC0xKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IChwb3MgYXMgYW55KS5jaGFyYWN0ZXIgPSAtMSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAocG9zIGFzIGFueSkubGluZSA9IDEyKTtcblxuXHRcdGNvbnN0IHsgbGluZSwgY2hhcmFjdGVyIH0gPSBwb3MudG9KU09OKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFyYWN0ZXIsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdQb3NpdGlvbiwgdG9KU09OJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyB0eXBlcy5Qb3NpdGlvbig0LCAyKTtcblx0XHRhc3NlcnRUb0pTT04ocG9zLCB7IGxpbmU6IDQsIGNoYXJhY3RlcjogMiB9KTtcblx0fSk7XG5cblx0dGVzdCgnUG9zaXRpb24sIGlzQmVmb3JlKE9yRXF1YWwpPycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwMSA9IG5ldyB0eXBlcy5Qb3NpdGlvbigxLCAzKTtcblx0XHRjb25zdCBwMiA9IG5ldyB0eXBlcy5Qb3NpdGlvbigxLCAyKTtcblx0XHRjb25zdCBwMyA9IG5ldyB0eXBlcy5Qb3NpdGlvbigwLCA0KTtcblxuXHRcdGFzc2VydC5vayhwMS5pc0JlZm9yZU9yRXF1YWwocDEpKTtcblx0XHRhc3NlcnQub2soIXAxLmlzQmVmb3JlKHAxKSk7XG5cdFx0YXNzZXJ0Lm9rKHAyLmlzQmVmb3JlKHAxKSk7XG5cdFx0YXNzZXJ0Lm9rKHAzLmlzQmVmb3JlKHAyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Bvc2l0aW9uLCBpc0FmdGVyKE9yRXF1YWwpPycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwMSA9IG5ldyB0eXBlcy5Qb3NpdGlvbigxLCAzKTtcblx0XHRjb25zdCBwMiA9IG5ldyB0eXBlcy5Qb3NpdGlvbigxLCAyKTtcblx0XHRjb25zdCBwMyA9IG5ldyB0eXBlcy5Qb3NpdGlvbigwLCA0KTtcblxuXHRcdGFzc2VydC5vayhwMS5pc0FmdGVyT3JFcXVhbChwMSkpO1xuXHRcdGFzc2VydC5vayghcDEuaXNBZnRlcihwMSkpO1xuXHRcdGFzc2VydC5vayhwMS5pc0FmdGVyKHAyKSk7XG5cdFx0YXNzZXJ0Lm9rKHAyLmlzQWZ0ZXIocDMpKTtcblx0XHRhc3NlcnQub2socDEuaXNBZnRlcihwMykpO1xuXHR9KTtcblxuXHR0ZXN0KCdQb3NpdGlvbiwgY29tcGFyZVRvJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHAxID0gbmV3IHR5cGVzLlBvc2l0aW9uKDEsIDMpO1xuXHRcdGNvbnN0IHAyID0gbmV3IHR5cGVzLlBvc2l0aW9uKDEsIDIpO1xuXHRcdGNvbnN0IHAzID0gbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHAxLmNvbXBhcmVUbyhwMSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwMi5jb21wYXJlVG8ocDEpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHAxLmNvbXBhcmVUbyhwMiksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwMi5jb21wYXJlVG8ocDMpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocDEuY29tcGFyZVRvKHAzKSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Bvc2l0aW9uLCB0cmFuc2xhdGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcDEgPSBuZXcgdHlwZXMuUG9zaXRpb24oMSwgMyk7XG5cblx0XHRhc3NlcnQub2socDEudHJhbnNsYXRlKCkgPT09IHAxKTtcblx0XHRhc3NlcnQub2socDEudHJhbnNsYXRlKHt9KSA9PT0gcDEpO1xuXHRcdGFzc2VydC5vayhwMS50cmFuc2xhdGUoMCwgMCkgPT09IHAxKTtcblx0XHRhc3NlcnQub2socDEudHJhbnNsYXRlKDApID09PSBwMSk7XG5cdFx0YXNzZXJ0Lm9rKHAxLnRyYW5zbGF0ZSh1bmRlZmluZWQsIDApID09PSBwMSk7XG5cdFx0YXNzZXJ0Lm9rKHAxLnRyYW5zbGF0ZSh1bmRlZmluZWQpID09PSBwMSk7XG5cblx0XHRsZXQgcmVzID0gcDEudHJhbnNsYXRlKC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuY2hhcmFjdGVyLCAzKTtcblxuXHRcdHJlcyA9IHAxLnRyYW5zbGF0ZSh7IGxpbmVEZWx0YTogLTEgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNoYXJhY3RlciwgMyk7XG5cblx0XHRyZXMgPSBwMS50cmFuc2xhdGUodW5kZWZpbmVkLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNoYXJhY3RlciwgMik7XG5cblx0XHRyZXMgPSBwMS50cmFuc2xhdGUoeyBjaGFyYWN0ZXJEZWx0YTogLTEgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNoYXJhY3RlciwgMik7XG5cblx0XHRyZXMgPSBwMS50cmFuc2xhdGUoMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGluZSwgMTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuY2hhcmFjdGVyLCAzKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcDEudHJhbnNsYXRlKG51bGwhKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwMS50cmFuc2xhdGUobnVsbCEsIG51bGwhKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwMS50cmFuc2xhdGUoLTIpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHAxLnRyYW5zbGF0ZSh7IGxpbmVEZWx0YTogLTIgfSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcDEudHJhbnNsYXRlKC0yLCBudWxsISkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcDEudHJhbnNsYXRlKDAsIC00KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Bvc2l0aW9uLCB3aXRoJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHAxID0gbmV3IHR5cGVzLlBvc2l0aW9uKDEsIDMpO1xuXG5cdFx0YXNzZXJ0Lm9rKHAxLndpdGgoKSA9PT0gcDEpO1xuXHRcdGFzc2VydC5vayhwMS53aXRoKDEpID09PSBwMSk7XG5cdFx0YXNzZXJ0Lm9rKHAxLndpdGgodW5kZWZpbmVkLCAzKSA9PT0gcDEpO1xuXHRcdGFzc2VydC5vayhwMS53aXRoKDEsIDMpID09PSBwMSk7XG5cdFx0YXNzZXJ0Lm9rKHAxLndpdGgodW5kZWZpbmVkKSA9PT0gcDEpO1xuXHRcdGFzc2VydC5vayhwMS53aXRoKHsgbGluZTogMSB9KSA9PT0gcDEpO1xuXHRcdGFzc2VydC5vayhwMS53aXRoKHsgY2hhcmFjdGVyOiAzIH0pID09PSBwMSk7XG5cdFx0YXNzZXJ0Lm9rKHAxLndpdGgoeyBsaW5lOiAxLCBjaGFyYWN0ZXI6IDMgfSkgPT09IHAxKTtcblxuXHRcdGNvbnN0IHAyID0gcDEud2l0aCh7IGxpbmU6IDAsIGNoYXJhY3RlcjogMTEgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHAyLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwMi5jaGFyYWN0ZXIsIDExKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcDEud2l0aChudWxsISkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcDEud2l0aCgtOSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcDEud2l0aCgwLCAtOSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcDEud2l0aCh7IGxpbmU6IC0xIH0pKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHAxLndpdGgoeyBjaGFyYWN0ZXI6IC0xIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnUmFuZ2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBuZXcgdHlwZXMuUmFuZ2UoLTEsIDAsIDAsIDApKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IG5ldyB0eXBlcy5SYW5nZSgwLCAtMSwgMCwgMCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gbmV3IHR5cGVzLlJhbmdlKG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSwgdW5kZWZpbmVkISkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gbmV3IHR5cGVzLlJhbmdlKG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSwgbnVsbCEpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IG5ldyB0eXBlcy5SYW5nZSh1bmRlZmluZWQhLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IG5ldyB0eXBlcy5SYW5nZShudWxsISwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKSk7XG5cblx0XHRjb25zdCByYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHsgKHJhbmdlIGFzIGFueSkuc3RhcnQgPSBudWxsOyB9KTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHsgKHJhbmdlIGFzIGFueSkuc3RhcnQgPSBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMyk7IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdSYW5nZSwgdG9KU09OJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgdHlwZXMuUmFuZ2UoMSwgMiwgMywgNCk7XG5cdFx0YXNzZXJ0VG9KU09OKHJhbmdlLCBbeyBsaW5lOiAxLCBjaGFyYWN0ZXI6IDIgfSwgeyBsaW5lOiAzLCBjaGFyYWN0ZXI6IDQgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdSYW5nZSwgc29ydGluZycsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBzb3J0cyBzdGFydC9lbmRcblx0XHRsZXQgcmFuZ2UgPSBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMSk7XG5cblx0XHRyYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5saW5lLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnUmFuZ2UsIGlzRW1wdHl8aXNTaW5nbGVMaW5lJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCByYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKTtcblx0XHRhc3NlcnQub2soIXJhbmdlLmlzRW1wdHkpO1xuXHRcdGFzc2VydC5vayghcmFuZ2UuaXNTaW5nbGVMaW5lKTtcblxuXHRcdHJhbmdlID0gbmV3IHR5cGVzLlJhbmdlKDEsIDEsIDEsIDEpO1xuXHRcdGFzc2VydC5vayhyYW5nZS5pc0VtcHR5KTtcblx0XHRhc3NlcnQub2socmFuZ2UuaXNTaW5nbGVMaW5lKTtcblxuXHRcdHJhbmdlID0gbmV3IHR5cGVzLlJhbmdlKDAsIDEsIDAsIDExKTtcblx0XHRhc3NlcnQub2soIXJhbmdlLmlzRW1wdHkpO1xuXHRcdGFzc2VydC5vayhyYW5nZS5pc1NpbmdsZUxpbmUpO1xuXG5cdFx0cmFuZ2UgPSBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSk7XG5cdFx0YXNzZXJ0Lm9rKCFyYW5nZS5pc0VtcHR5KTtcblx0XHRhc3NlcnQub2soIXJhbmdlLmlzU2luZ2xlTGluZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JhbmdlLCBjb250YWlucycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAyLCAxMSk7XG5cblx0XHRhc3NlcnQub2socmFuZ2UuY29udGFpbnMocmFuZ2Uuc3RhcnQpKTtcblx0XHRhc3NlcnQub2socmFuZ2UuY29udGFpbnMocmFuZ2UuZW5kKSk7XG5cdFx0YXNzZXJ0Lm9rKHJhbmdlLmNvbnRhaW5zKHJhbmdlKSk7XG5cblx0XHRhc3NlcnQub2soIXJhbmdlLmNvbnRhaW5zKG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAyLCAxMSkpKTtcblx0XHRhc3NlcnQub2soIXJhbmdlLmNvbnRhaW5zKG5ldyB0eXBlcy5SYW5nZSgwLCAxLCAyLCAxMSkpKTtcblx0XHRhc3NlcnQub2soIXJhbmdlLmNvbnRhaW5zKG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAyLCAxMikpKTtcblx0XHRhc3NlcnQub2soIXJhbmdlLmNvbnRhaW5zKG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAzLCAxMSkpKTtcblx0fSk7XG5cblx0dGVzdCgnUmFuZ2UsIGNvbnRhaW5zIChubyBpbnN0YW5jZW9mKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAyLCAxMSk7XG5cblx0XHRjb25zdCBzdGFydExpa2UgPSB7IGxpbmU6IHJhbmdlLnN0YXJ0LmxpbmUsIGNoYXJhY3RlcjogcmFuZ2Uuc3RhcnQuY2hhcmFjdGVyIH07XG5cdFx0Y29uc3QgZW5kTGlrZSA9IHsgbGluZTogcmFuZ2UuZW5kLmxpbmUsIGNoYXJhY3RlcjogcmFuZ2UuZW5kLmNoYXJhY3RlciB9O1xuXHRcdGNvbnN0IHJhbmdlTGlrZSA9IHsgc3RhcnQ6IHN0YXJ0TGlrZSwgZW5kOiBlbmRMaWtlIH07XG5cblx0XHRhc3NlcnQub2socmFuZ2UuY29udGFpbnMoKDx0eXBlcy5Qb3NpdGlvbj5zdGFydExpa2UpKSk7XG5cdFx0YXNzZXJ0Lm9rKHJhbmdlLmNvbnRhaW5zKCg8dHlwZXMuUG9zaXRpb24+ZW5kTGlrZSkpKTtcblx0XHRhc3NlcnQub2socmFuZ2UuY29udGFpbnMoKDx0eXBlcy5SYW5nZT5yYW5nZUxpa2UpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JhbmdlLCBpbnRlcnNlY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMiwgMTEpO1xuXHRcdGxldCByZXM6IHR5cGVzLlJhbmdlO1xuXG5cdFx0cmVzID0gcmFuZ2UuaW50ZXJzZWN0aW9uKHJhbmdlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGFydC5saW5lLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXJ0LmNoYXJhY3RlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5lbmQubGluZSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5lbmQuY2hhcmFjdGVyLCAxMSk7XG5cblx0XHRyZXMgPSByYW5nZS5pbnRlcnNlY3Rpb24obmV3IHR5cGVzLlJhbmdlKDIsIDEyLCA0LCAwKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRyZXMgPSByYW5nZS5pbnRlcnNlY3Rpb24obmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDApKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgdW5kZWZpbmVkKTtcblxuXHRcdHJlcyA9IHJhbmdlLmludGVyc2VjdGlvbihuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpITtcblx0XHRhc3NlcnQub2socmVzLmlzRW1wdHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhcnQubGluZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGFydC5jaGFyYWN0ZXIsIDEpO1xuXG5cdFx0cmVzID0gcmFuZ2UuaW50ZXJzZWN0aW9uKG5ldyB0eXBlcy5SYW5nZSgyLCAxMSwgNjEsIDEpKSE7XG5cdFx0YXNzZXJ0Lm9rKHJlcy5pc0VtcHR5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXJ0LmxpbmUsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhcnQuY2hhcmFjdGVyLCAxMSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHJhbmdlLmludGVyc2VjdGlvbihudWxsISkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcmFuZ2UuaW50ZXJzZWN0aW9uKHVuZGVmaW5lZCEpKTtcblx0fSk7XG5cblx0dGVzdCgnUmFuZ2UsIHVuaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCByYW4xID0gbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDUsIDUpO1xuXHRcdGFzc2VydC5vayhyYW4xLnVuaW9uKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSkgPT09IHJhbjEpO1xuXG5cdFx0bGV0IHJlczogdHlwZXMuUmFuZ2U7XG5cdFx0cmVzID0gcmFuMS51bmlvbihuZXcgdHlwZXMuUmFuZ2UoMiwgMiwgOSwgOSkpO1xuXHRcdGFzc2VydC5vayhyZXMuc3RhcnQgPT09IHJhbjEuc3RhcnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZW5kLmxpbmUsIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZW5kLmNoYXJhY3RlciwgOSk7XG5cblx0XHRyYW4xID0gbmV3IHR5cGVzLlJhbmdlKDIsIDEsIDUsIDMpO1xuXHRcdHJlcyA9IHJhbjEudW5pb24obmV3IHR5cGVzLlJhbmdlKDEsIDAsIDQsIDIpKTtcblx0XHRhc3NlcnQub2socmVzLmVuZCA9PT0gcmFuMS5lbmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhcnQubGluZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGFydC5jaGFyYWN0ZXIsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdSYW5nZSwgd2l0aCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAyLCAxMSk7XG5cblx0XHRhc3NlcnQub2socmFuZ2Uud2l0aChyYW5nZS5zdGFydCkgPT09IHJhbmdlKTtcblx0XHRhc3NlcnQub2socmFuZ2Uud2l0aCh1bmRlZmluZWQsIHJhbmdlLmVuZCkgPT09IHJhbmdlKTtcblx0XHRhc3NlcnQub2socmFuZ2Uud2l0aChyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKSA9PT0gcmFuZ2UpO1xuXHRcdGFzc2VydC5vayhyYW5nZS53aXRoKG5ldyB0eXBlcy5Qb3NpdGlvbigxLCAxKSkgPT09IHJhbmdlKTtcblx0XHRhc3NlcnQub2socmFuZ2Uud2l0aCh1bmRlZmluZWQsIG5ldyB0eXBlcy5Qb3NpdGlvbigyLCAxMSkpID09PSByYW5nZSk7XG5cdFx0YXNzZXJ0Lm9rKHJhbmdlLndpdGgoKSA9PT0gcmFuZ2UpO1xuXHRcdGFzc2VydC5vayhyYW5nZS53aXRoKHsgc3RhcnQ6IHJhbmdlLnN0YXJ0IH0pID09PSByYW5nZSk7XG5cdFx0YXNzZXJ0Lm9rKHJhbmdlLndpdGgoeyBzdGFydDogbmV3IHR5cGVzLlBvc2l0aW9uKDEsIDEpIH0pID09PSByYW5nZSk7XG5cdFx0YXNzZXJ0Lm9rKHJhbmdlLndpdGgoeyBlbmQ6IHJhbmdlLmVuZCB9KSA9PT0gcmFuZ2UpO1xuXHRcdGFzc2VydC5vayhyYW5nZS53aXRoKHsgZW5kOiBuZXcgdHlwZXMuUG9zaXRpb24oMiwgMTEpIH0pID09PSByYW5nZSk7XG5cblx0XHRsZXQgcmVzID0gcmFuZ2Uud2l0aCh1bmRlZmluZWQsIG5ldyB0eXBlcy5Qb3NpdGlvbig5LCA4KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5lbmQubGluZSwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5lbmQuY2hhcmFjdGVyLCA4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXJ0LmxpbmUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhcnQuY2hhcmFjdGVyLCAxKTtcblxuXHRcdHJlcyA9IHJhbmdlLndpdGgoeyBlbmQ6IG5ldyB0eXBlcy5Qb3NpdGlvbig5LCA4KSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmVuZC5saW5lLCA5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmVuZC5jaGFyYWN0ZXIsIDgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhcnQubGluZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGFydC5jaGFyYWN0ZXIsIDEpO1xuXG5cdFx0cmVzID0gcmFuZ2Uud2l0aCh7IGVuZDogbmV3IHR5cGVzLlBvc2l0aW9uKDksIDgpLCBzdGFydDogbmV3IHR5cGVzLlBvc2l0aW9uKDIsIDMpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZW5kLmxpbmUsIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZW5kLmNoYXJhY3RlciwgOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGFydC5saW5lLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXJ0LmNoYXJhY3RlciwgMyk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHJhbmdlLndpdGgobnVsbCEpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHJhbmdlLndpdGgodW5kZWZpbmVkLCBudWxsISkpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXh0RWRpdCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHJhbmdlID0gbmV3IHR5cGVzLlJhbmdlKDEsIDEsIDIsIDExKTtcblx0XHRsZXQgZWRpdCA9IG5ldyB0eXBlcy5UZXh0RWRpdChyYW5nZSwgdW5kZWZpbmVkISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXQubmV3VGV4dCwgJycpO1xuXHRcdGFzc2VydFRvSlNPTihlZGl0LCB7IHJhbmdlOiBbeyBsaW5lOiAxLCBjaGFyYWN0ZXI6IDEgfSwgeyBsaW5lOiAyLCBjaGFyYWN0ZXI6IDExIH1dLCBuZXdUZXh0OiAnJyB9KTtcblxuXHRcdGVkaXQgPSBuZXcgdHlwZXMuVGV4dEVkaXQocmFuZ2UsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0Lm5ld1RleHQsICcnKTtcblxuXHRcdGVkaXQgPSBuZXcgdHlwZXMuVGV4dEVkaXQocmFuZ2UsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdC5uZXdUZXh0LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dvcmtzcGFjZUVkaXQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBhID0gVVJJLmZpbGUoJ2EudHMnKTtcblx0XHRjb25zdCBiID0gVVJJLmZpbGUoJ2IudHMnKTtcblxuXHRcdGNvbnN0IGVkaXQgPSBuZXcgdHlwZXMuV29ya3NwYWNlRWRpdCgpO1xuXHRcdGFzc2VydC5vayghZWRpdC5oYXMoYSkpO1xuXG5cdFx0ZWRpdC5zZXQoYSwgW3R5cGVzLlRleHRFZGl0Lmluc2VydChuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCksICdmZmYnKV0pO1xuXHRcdGFzc2VydC5vayhlZGl0LmhhcyhhKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXQuc2l6ZSwgMSk7XG5cdFx0YXNzZXJ0VG9KU09OKGVkaXQsIFtbYS50b0pTT04oKSwgW3sgcmFuZ2U6IFt7IGxpbmU6IDAsIGNoYXJhY3RlcjogMCB9LCB7IGxpbmU6IDAsIGNoYXJhY3RlcjogMCB9XSwgbmV3VGV4dDogJ2ZmZicgfV1dXSk7XG5cblx0XHRlZGl0Lmluc2VydChiLCBuZXcgdHlwZXMuUG9zaXRpb24oMSwgMSksICdmZmYnKTtcblx0XHRlZGl0LmRlbGV0ZShiLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpO1xuXHRcdGFzc2VydC5vayhlZGl0LmhhcyhiKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXQuc2l6ZSwgMik7XG5cdFx0YXNzZXJ0VG9KU09OKGVkaXQsIFtcblx0XHRcdFthLnRvSlNPTigpLCBbeyByYW5nZTogW3sgbGluZTogMCwgY2hhcmFjdGVyOiAwIH0sIHsgbGluZTogMCwgY2hhcmFjdGVyOiAwIH1dLCBuZXdUZXh0OiAnZmZmJyB9XV0sXG5cdFx0XHRbYi50b0pTT04oKSwgW3sgcmFuZ2U6IFt7IGxpbmU6IDEsIGNoYXJhY3RlcjogMSB9LCB7IGxpbmU6IDEsIGNoYXJhY3RlcjogMSB9XSwgbmV3VGV4dDogJ2ZmZicgfSwgeyByYW5nZTogW3sgbGluZTogMCwgY2hhcmFjdGVyOiAwIH0sIHsgbGluZTogMCwgY2hhcmFjdGVyOiAwIH1dLCBuZXdUZXh0OiAnJyB9XV1cblx0XHRdKTtcblxuXHRcdGVkaXQuc2V0KGIsIHVuZGVmaW5lZCEpO1xuXHRcdGFzc2VydC5vayghZWRpdC5oYXMoYikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0LnNpemUsIDEpO1xuXG5cdFx0ZWRpdC5zZXQoYiwgW3R5cGVzLlRleHRFZGl0Lmluc2VydChuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCksICdmZmZmJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdC5nZXQoYikubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnV29ya3NwYWNlRWRpdCAtIGtlZXAgb3JkZXIgb2YgdGV4dCBhbmQgZmlsZSBjaGFuZ2VzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZWRpdCA9IG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0ZWRpdC5yZXBsYWNlKFVSSS5wYXJzZSgnZm9vOmEnKSwgbmV3IHR5cGVzLlJhbmdlKDEsIDEsIDEsIDEpLCAnZm9vJyk7XG5cdFx0ZWRpdC5yZW5hbWVGaWxlKFVSSS5wYXJzZSgnZm9vOmEnKSwgVVJJLnBhcnNlKCdmb286YicpKTtcblx0XHRlZGl0LnJlcGxhY2UoVVJJLnBhcnNlKCdmb286YScpLCBuZXcgdHlwZXMuUmFuZ2UoMiwgMSwgMiwgMSksICdiYXInKTtcblx0XHRlZGl0LnJlcGxhY2UoVVJJLnBhcnNlKCdmb286YicpLCBuZXcgdHlwZXMuUmFuZ2UoMywgMSwgMywgMSksICdiYXp6Jyk7XG5cblx0XHRjb25zdCBhbGwgPSBlZGl0Ll9hbGxFbnRyaWVzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbC5sZW5ndGgsIDQpO1xuXG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmQsIHRoaXJkLCBmb3VydGhdID0gYWxsO1xuXHRcdGFzc2VydFR5cGUoZmlyc3QuX3R5cGUgPT09IHR5cGVzLkZpbGVFZGl0VHlwZS5UZXh0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudXJpLnRvU3RyaW5nKCksICdmb286YScpO1xuXG5cdFx0YXNzZXJ0VHlwZShzZWNvbmQuX3R5cGUgPT09IHR5cGVzLkZpbGVFZGl0VHlwZS5GaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmZyb20hLnRvU3RyaW5nKCksICdmb286YScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQudG8hLnRvU3RyaW5nKCksICdmb286YicpO1xuXG5cdFx0YXNzZXJ0VHlwZSh0aGlyZC5fdHlwZSA9PT0gdHlwZXMuRmlsZUVkaXRUeXBlLlRleHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZC51cmkudG9TdHJpbmcoKSwgJ2ZvbzphJyk7XG5cblx0XHRhc3NlcnRUeXBlKGZvdXJ0aC5fdHlwZSA9PT0gdHlwZXMuRmlsZUVkaXRUeXBlLlRleHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VydGgudXJpLnRvU3RyaW5nKCksICdmb286YicpO1xuXHR9KTtcblxuXHR0ZXN0KCdXb3Jrc3BhY2VFZGl0IC0gdHdvIGVkaXRzIGZvciBvbmUgcmVzb3VyY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZWRpdCA9IG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmb286YmFyJyk7XG5cdFx0ZWRpdC5pbnNlcnQodXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCksICdIZWxsbycpO1xuXHRcdGVkaXQuaW5zZXJ0KHVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApLCAnRm9vJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdC5fYWxsRW50cmllcygpLmxlbmd0aCwgMik7XG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gZWRpdC5fYWxsRW50cmllcygpO1xuXG5cdFx0YXNzZXJ0VHlwZShmaXJzdC5fdHlwZSA9PT0gdHlwZXMuRmlsZUVkaXRUeXBlLlRleHQpO1xuXHRcdGFzc2VydFR5cGUoc2Vjb25kLl90eXBlID09PSB0eXBlcy5GaWxlRWRpdFR5cGUuVGV4dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmVkaXQubmV3VGV4dCwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5lZGl0Lm5ld1RleHQsICdGb28nKTtcblx0fSk7XG5cblx0dGVzdCgnV29ya3NwYWNlRWRpdCAtIHNldCB3aXRoIG1ldGFkYXRhIGFjY2VwdHMgdW5kZWZpbmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGVkaXQgPSBuZXcgdHlwZXMuV29ya3NwYWNlRWRpdCgpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXG5cdFx0ZWRpdC5zZXQodXJpLCBbXG5cdFx0XHRbdHlwZXMuVGV4dEVkaXQuaW5zZXJ0KG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSwgJ0hlbGxvJyksIHsgbmVlZHNDb25maXJtYXRpb246IHRydWUsIGxhYmVsOiAnZm9vJyB9XSxcblx0XHRcdFt0eXBlcy5UZXh0RWRpdC5pbnNlcnQobmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApLCAnSGVsbG8nKSwgdW5kZWZpbmVkXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGFsbCA9IGVkaXQuX2FsbEVudHJpZXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsLmxlbmd0aCwgMik7XG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gYWxsO1xuXHRcdGFzc2VydC5vayhmaXJzdC5tZXRhZGF0YSk7XG5cdFx0YXNzZXJ0Lm9rKCFzZWNvbmQubWV0YWRhdGEpO1xuXHR9KTtcblxuXHR0ZXN0KCdEb2N1bWVudExpbmsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBuZXcgdHlwZXMuRG9jdW1lbnRMaW5rKG51bGwhLCBudWxsISkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gbmV3IHR5cGVzLkRvY3VtZW50TGluayhuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMSwgMSksIG51bGwhKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvSlNPTiAmIHN0cmluZ2lmeScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGFzc2VydFRvSlNPTihuZXcgdHlwZXMuU2VsZWN0aW9uKDMsIDQsIDIsIDEpLCB7IHN0YXJ0OiB7IGxpbmU6IDIsIGNoYXJhY3RlcjogMSB9LCBlbmQ6IHsgbGluZTogMywgY2hhcmFjdGVyOiA0IH0sIGFuY2hvcjogeyBsaW5lOiAzLCBjaGFyYWN0ZXI6IDQgfSwgYWN0aXZlOiB7IGxpbmU6IDIsIGNoYXJhY3RlcjogMSB9IH0pO1xuXG5cdFx0YXNzZXJ0VG9KU09OKG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkuZmlsZSgndS50cycpLCBuZXcgdHlwZXMuUG9zaXRpb24oMywgNCkpLCB7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3UudHMnKS50b0pTT04oKSwgcmFuZ2U6IFt7IGxpbmU6IDMsIGNoYXJhY3RlcjogNCB9LCB7IGxpbmU6IDMsIGNoYXJhY3RlcjogNCB9XSB9KTtcblx0XHRhc3NlcnRUb0pTT04obmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5maWxlKCd1LnRzJyksIG5ldyB0eXBlcy5SYW5nZSgxLCAyLCAzLCA0KSksIHsgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdS50cycpLnRvSlNPTigpLCByYW5nZTogW3sgbGluZTogMSwgY2hhcmFjdGVyOiAyIH0sIHsgbGluZTogMywgY2hhcmFjdGVyOiA0IH1dIH0pO1xuXG5cdFx0Y29uc3QgZGlhZyA9IG5ldyB0eXBlcy5EaWFnbm9zdGljKG5ldyB0eXBlcy5SYW5nZSgwLCAxLCAyLCAzKSwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0VG9KU09OKGRpYWcsIHsgc2V2ZXJpdHk6ICdFcnJvcicsIG1lc3NhZ2U6ICdoZWxsbycsIHJhbmdlOiBbeyBsaW5lOiAwLCBjaGFyYWN0ZXI6IDEgfSwgeyBsaW5lOiAyLCBjaGFyYWN0ZXI6IDMgfV0gfSk7XG5cdFx0ZGlhZy5zb3VyY2UgPSAnbWUnO1xuXHRcdGFzc2VydFRvSlNPTihkaWFnLCB7IHNldmVyaXR5OiAnRXJyb3InLCBtZXNzYWdlOiAnaGVsbG8nLCByYW5nZTogW3sgbGluZTogMCwgY2hhcmFjdGVyOiAxIH0sIHsgbGluZTogMiwgY2hhcmFjdGVyOiAzIH1dLCBzb3VyY2U6ICdtZScgfSk7XG5cblx0XHRhc3NlcnRUb0pTT04obmV3IHR5cGVzLkRvY3VtZW50SGlnaGxpZ2h0KG5ldyB0eXBlcy5SYW5nZSgyLCAzLCA0LCA1KSksIHsgcmFuZ2U6IFt7IGxpbmU6IDIsIGNoYXJhY3RlcjogMyB9LCB7IGxpbmU6IDQsIGNoYXJhY3RlcjogNSB9XSwga2luZDogJ1RleHQnIH0pO1xuXHRcdGFzc2VydFRvSlNPTihuZXcgdHlwZXMuRG9jdW1lbnRIaWdobGlnaHQobmV3IHR5cGVzLlJhbmdlKDIsIDMsIDQsIDUpLCB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodEtpbmQuUmVhZCksIHsgcmFuZ2U6IFt7IGxpbmU6IDIsIGNoYXJhY3RlcjogMyB9LCB7IGxpbmU6IDQsIGNoYXJhY3RlcjogNSB9XSwga2luZDogJ1JlYWQnIH0pO1xuXG5cdFx0YXNzZXJ0VG9KU09OKG5ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbigndGVzdCcsIHR5cGVzLlN5bWJvbEtpbmQuQm9vbGVhbiwgbmV3IHR5cGVzLlJhbmdlKDAsIDEsIDIsIDMpKSwge1xuXHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0a2luZDogJ0Jvb2xlYW4nLFxuXHRcdFx0bG9jYXRpb246IHtcblx0XHRcdFx0cmFuZ2U6IFt7IGxpbmU6IDAsIGNoYXJhY3RlcjogMSB9LCB7IGxpbmU6IDIsIGNoYXJhY3RlcjogMyB9XVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0VG9KU09OKG5ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoNywgOCwgOSwgMTApKSwgeyByYW5nZTogW3sgbGluZTogNywgY2hhcmFjdGVyOiA4IH0sIHsgbGluZTogOSwgY2hhcmFjdGVyOiAxMCB9XSB9KTtcblx0XHRhc3NlcnRUb0pTT04obmV3IHR5cGVzLkNvZGVMZW5zKG5ldyB0eXBlcy5SYW5nZSg3LCA4LCA5LCAxMCksIHsgY29tbWFuZDogJ2lkJywgdGl0bGU6ICd0aXRsZScgfSksIHtcblx0XHRcdHJhbmdlOiBbeyBsaW5lOiA3LCBjaGFyYWN0ZXI6IDggfSwgeyBsaW5lOiA5LCBjaGFyYWN0ZXI6IDEwIH1dLFxuXHRcdFx0Y29tbWFuZDogeyBjb21tYW5kOiAnaWQnLCB0aXRsZTogJ3RpdGxlJyB9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnRUb0pTT04obmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdjb21wbGV0ZScpLCB7IGxhYmVsOiAnY29tcGxldGUnIH0pO1xuXG5cdFx0Y29uc3QgaXRlbSA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnY29tcGxldGUnKTtcblx0XHRpdGVtLmtpbmQgPSB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuSW50ZXJmYWNlO1xuXHRcdGFzc2VydFRvSlNPTihpdGVtLCB7IGxhYmVsOiAnY29tcGxldGUnLCBraW5kOiAnSW50ZXJmYWNlJyB9KTtcblxuXHR9KTtcblxuXHR0ZXN0KCdTeW1ib2xJbmZvcm1hdGlvbiwgb2xkIGN0b3InLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBpbmZvID0gbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCdmb28nLCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5LCBuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMiwgMykpO1xuXHRcdGFzc2VydC5vayhpbmZvLmxvY2F0aW9uIGluc3RhbmNlb2YgdHlwZXMuTG9jYXRpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvLmxvY2F0aW9uLnVyaSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldFN0cmluZywgYnVpbGRlci1tZXRob2RzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHN0cmluZzogdHlwZXMuU25pcHBldFN0cmluZztcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy5hcHBlbmRUZXh0KCdJIG5lZWQgJCBhbmQgJCcpLnZhbHVlLCAnSSBuZWVkIFxcXFwkIGFuZCBcXFxcJCcpO1xuXG5cdFx0c3RyaW5nID0gbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5nLmFwcGVuZFRleHQoJ0kgbmVlZCBcXFxcJCcpLnZhbHVlLCAnSSBuZWVkIFxcXFxcXFxcXFxcXCQnKTtcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0c3RyaW5nLmFwcGVuZFBsYWNlaG9sZGVyKCdmbyRvfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmcudmFsdWUsICckezE6Zm9cXFxcJG9cXFxcfX0nKTtcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0c3RyaW5nLmFwcGVuZFRleHQoJ2ZvbycpLmFwcGVuZFRhYnN0b3AoMCkuYXBwZW5kVGV4dCgnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy52YWx1ZSwgJ2ZvbyQwYmFyJyk7XG5cblx0XHRzdHJpbmcgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdHN0cmluZy5hcHBlbmRUZXh0KCdmb28nKS5hcHBlbmRUYWJzdG9wKCkuYXBwZW5kVGV4dCgnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy52YWx1ZSwgJ2ZvbyQxYmFyJyk7XG5cblx0XHRzdHJpbmcgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdHN0cmluZy5hcHBlbmRUZXh0KCdmb28nKS5hcHBlbmRUYWJzdG9wKDQyKS5hcHBlbmRUZXh0KCdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5nLnZhbHVlLCAnZm9vJDQyYmFyJyk7XG5cblx0XHRzdHJpbmcgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdHN0cmluZy5hcHBlbmRUZXh0KCdmb28nKS5hcHBlbmRQbGFjZWhvbGRlcignZmFyYm9vJykuYXBwZW5kVGV4dCgnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy52YWx1ZSwgJ2ZvbyR7MTpmYXJib299YmFyJyk7XG5cblx0XHRzdHJpbmcgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdHN0cmluZy5hcHBlbmRUZXh0KCdmb28nKS5hcHBlbmRQbGFjZWhvbGRlcignZmFyJGJvbycpLmFwcGVuZFRleHQoJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmcudmFsdWUsICdmb28kezE6ZmFyXFxcXCRib299YmFyJyk7XG5cblx0XHRzdHJpbmcgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdHN0cmluZy5hcHBlbmRUZXh0KCdmb28nKS5hcHBlbmRQbGFjZWhvbGRlcihiID0+IGIuYXBwZW5kVGV4dCgnYWJjJykuYXBwZW5kUGxhY2Vob2xkZXIoJ25lc3RlZCcpKS5hcHBlbmRUZXh0KCdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5nLnZhbHVlLCAnZm9vJHsxOmFiYyR7MjpuZXN0ZWR9fWJhcicpO1xuXG5cdFx0c3RyaW5nID0gbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcoKTtcblx0XHRzdHJpbmcuYXBwZW5kVmFyaWFibGUoJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmcudmFsdWUsICcke2Zvb30nKTtcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0c3RyaW5nLmFwcGVuZFRleHQoJ2ZvbycpLmFwcGVuZFZhcmlhYmxlKCdUTV9TRUxFQ1RFRF9URVhUJykuYXBwZW5kVGV4dCgnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy52YWx1ZSwgJ2ZvbyR7VE1fU0VMRUNURURfVEVYVH1iYXInKTtcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0c3RyaW5nLmFwcGVuZFZhcmlhYmxlKCdCQVInLCBiID0+IGIuYXBwZW5kUGxhY2Vob2xkZXIoJ29wcycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5nLnZhbHVlLCAnJHtCQVI6JHsxOm9wc319Jyk7XG5cblx0XHRzdHJpbmcgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdHN0cmluZy5hcHBlbmRWYXJpYWJsZSgnQkFSJywgYiA9PiB7IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmcudmFsdWUsICcke0JBUn0nKTtcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0c3RyaW5nLmFwcGVuZENob2ljZShbJ2InLCAnYScsICdyJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmcudmFsdWUsICckezF8YixhLHJ8fScpO1xuXG5cdFx0c3RyaW5nID0gbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcoKTtcblx0XHRzdHJpbmcuYXBwZW5kQ2hvaWNlKFsnYiwxJywgJ2EsMicsICdyLDMnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy52YWx1ZSwgJyR7MXxiXFxcXCwxLGFcXFxcLDIsclxcXFwsM3x9Jyk7XG5cblx0XHRzdHJpbmcgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdHN0cmluZy5hcHBlbmRDaG9pY2UoWydiJywgJ2EnLCAnciddLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5nLnZhbHVlLCAnJHswfGIsYSxyfH0nKTtcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0c3RyaW5nLmFwcGVuZFRleHQoJ2ZvbycpLmFwcGVuZENob2ljZShbJ2ZhcicsICdib28nXSkuYXBwZW5kVGV4dCgnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy52YWx1ZSwgJ2ZvbyR7MXxmYXIsYm9vfH1iYXInKTtcblxuXHRcdHN0cmluZyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0c3RyaW5nLmFwcGVuZFRleHQoJ2ZvbycpLmFwcGVuZENob2ljZShbJ2ZhcicsICckYm9vJ10pLmFwcGVuZFRleHQoJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmcudmFsdWUsICdmb28kezF8ZmFyLCRib298fWJhcicpO1xuXG5cdFx0c3RyaW5nID0gbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcoKTtcblx0XHRzdHJpbmcuYXBwZW5kVGV4dCgnZm9vJykuYXBwZW5kUGxhY2Vob2xkZXIoJ2ZhcmJvbycpLmFwcGVuZENob2ljZShbJ2ZhcicsICdib28nXSkuYXBwZW5kVGV4dCgnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZy52YWx1ZSwgJ2ZvbyR7MTpmYXJib299JHsyfGZhcixib298fWJhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IGNob2ljZXMgYXJlIGluY29ycmVjdGx5IGVzY2FwZWQvYXBwbGllZCAjMTgwMTMyJywgZnVuY3Rpb24gKCkge1xuXHRcdHtcblx0XHRcdGNvbnN0IHMgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdFx0cy5hcHBlbmRDaG9pY2UoWydhYWEkYWFhJ10pO1xuXHRcdFx0cy5hcHBlbmRUZXh0KCdiYmIkYmJiJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocy52YWx1ZSwgJyR7MXxhYWEkYWFhfH1iYmJcXFxcJGJiYicpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBzID0gbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcoKTtcblx0XHRcdHMuYXBwZW5kQ2hvaWNlKFsnYWFhLGFhYSddKTtcblx0XHRcdHMuYXBwZW5kVGV4dCgnYmJiJGJiYicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHMudmFsdWUsICckezF8YWFhXFxcXCxhYWF8fWJiYlxcXFwkYmJiJyk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHMgPSBuZXcgdHlwZXMuU25pcHBldFN0cmluZygpO1xuXHRcdFx0cy5hcHBlbmRDaG9pY2UoWydhYWF8YWFhJ10pO1xuXHRcdFx0cy5hcHBlbmRUZXh0KCdiYmIkYmJiJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocy52YWx1ZSwgJyR7MXxhYWFcXFxcfGFhYXx9YmJiXFxcXCRiYmInKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgcyA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKCk7XG5cdFx0XHRzLmFwcGVuZENob2ljZShbJ2FhYVxcXFxhYWEnXSk7XG5cdFx0XHRzLmFwcGVuZFRleHQoJ2JiYiRiYmInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzLnZhbHVlLCAnJHsxfGFhYVxcXFxcXFxcYWFhfH1iYmJcXFxcJGJiYicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaW5zdGFuY2VvZiBkb2VzblxcJ3Qgd29yayBmb3IgRmlsZVN5c3RlbUVycm9yICM0OTM4NicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBlcnJvciA9IHR5cGVzLkZpbGVTeXN0ZW1FcnJvci5VbmF2YWlsYWJsZSgnZm9vJyk7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIHR5cGVzLkZpbGVTeXN0ZW1FcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbmNlbGxhdGlvbkVycm9yJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFRoZSBDYW5jZWxsYXRpb25FcnJvci10eXBlIGlzIHVzZWQgaW50ZXJuYWxseSBhbmQgZXhwb3J0ZWQgYXMgQVBJLiBNYWtlIHN1cmUgdGhhdCBhdFxuXHRcdC8vIGl0cyBuYW1lIGFuZCBtZXNzYWdlIGFyZSBgQ2FuY2VsZWRgXG5cdFx0Y29uc3QgZXJyID0gbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVyci5uYW1lLCAnQ2FuY2VsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLm1lc3NhZ2UsICdDYW5jZWxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlQWN0aW9uS2luZCBjb250YWlucycsICgpID0+IHtcblx0XHRhc3NlcnQub2sodHlwZXMuQ29kZUFjdGlvbktpbmQuUmVmYWN0b3JFeHRyYWN0LmNvbnRhaW5zKHR5cGVzLkNvZGVBY3Rpb25LaW5kLlJlZmFjdG9yRXh0cmFjdCkpO1xuXHRcdGFzc2VydC5vayh0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QuY29udGFpbnModHlwZXMuQ29kZUFjdGlvbktpbmQuUmVmYWN0b3JFeHRyYWN0LmFwcGVuZCgnb3RoZXInKSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QuY29udGFpbnModHlwZXMuQ29kZUFjdGlvbktpbmQuUmVmYWN0b3IpKTtcblx0XHRhc3NlcnQub2soIXR5cGVzLkNvZGVBY3Rpb25LaW5kLlJlZmFjdG9yRXh0cmFjdC5jb250YWlucyh0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3Rvci5hcHBlbmQoJ290aGVyJykpKTtcblx0XHRhc3NlcnQub2soIXR5cGVzLkNvZGVBY3Rpb25LaW5kLlJlZmFjdG9yRXh0cmFjdC5jb250YWlucyh0eXBlcy5Db2RlQWN0aW9uS2luZC5FbXB0eS5hcHBlbmQoJ290aGVyJykuYXBwZW5kKCdyZWZhY3RvcicpKSk7XG5cdFx0YXNzZXJ0Lm9rKCF0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QuY29udGFpbnModHlwZXMuQ29kZUFjdGlvbktpbmQuRW1wdHkuYXBwZW5kKCdyZWZhY3RvcnknKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlQWN0aW9uS2luZCBpbnRlcnNlY3RzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayh0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QuaW50ZXJzZWN0cyh0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QpKTtcblx0XHRhc3NlcnQub2sodHlwZXMuQ29kZUFjdGlvbktpbmQuUmVmYWN0b3JFeHRyYWN0LmludGVyc2VjdHModHlwZXMuQ29kZUFjdGlvbktpbmQuUmVmYWN0b3IpKTtcblx0XHRhc3NlcnQub2sodHlwZXMuQ29kZUFjdGlvbktpbmQuUmVmYWN0b3JFeHRyYWN0LmludGVyc2VjdHModHlwZXMuQ29kZUFjdGlvbktpbmQuUmVmYWN0b3JFeHRyYWN0LmFwcGVuZCgnb3RoZXInKSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3RvckV4dHJhY3QuaW50ZXJzZWN0cyh0eXBlcy5Db2RlQWN0aW9uS2luZC5SZWZhY3Rvci5hcHBlbmQoJ290aGVyJykpKTtcblx0XHRhc3NlcnQub2soIXR5cGVzLkNvZGVBY3Rpb25LaW5kLlJlZmFjdG9yRXh0cmFjdC5pbnRlcnNlY3RzKHR5cGVzLkNvZGVBY3Rpb25LaW5kLkVtcHR5LmFwcGVuZCgnb3RoZXInKS5hcHBlbmQoJ3JlZmFjdG9yJykpKTtcblx0XHRhc3NlcnQub2soIXR5cGVzLkNvZGVBY3Rpb25LaW5kLlJlZmFjdG9yRXh0cmFjdC5pbnRlcnNlY3RzKHR5cGVzLkNvZGVBY3Rpb25LaW5kLkVtcHR5LmFwcGVuZCgncmVmYWN0b3J5JykpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdG9BcnIodWludDMyQXJyOiBVaW50MzJBcnJheSk6IG51bWJlcltdIHtcblx0XHRjb25zdCByID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHVpbnQzMkFyci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0cltpXSA9IHVpbnQzMkFycltpXTtcblx0XHR9XG5cdFx0cmV0dXJuIHI7XG5cdH1cblxuXHR0ZXN0KCdTZW1hbnRpY1Rva2Vuc0J1aWxkZXIgc2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnNCdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5wdXNoKDEsIDAsIDUsIDEsIDEpO1xuXHRcdGJ1aWxkZXIucHVzaCgxLCAxMCwgNCwgMiwgMik7XG5cdFx0YnVpbGRlci5wdXNoKDIsIDIsIDMsIDIsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnIoYnVpbGRlci5idWlsZCgpLmRhdGEpLCBbXG5cdFx0XHQxLCAwLCA1LCAxLCAxLFxuXHRcdFx0MCwgMTAsIDQsIDIsIDIsXG5cdFx0XHQxLCAyLCAzLCAyLCAyXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbWFudGljVG9rZW5zQnVpbGRlciBubyBtb2RpZmllcicsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IHR5cGVzLlNlbWFudGljVG9rZW5zQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIucHVzaCgxLCAwLCA1LCAxKTtcblx0XHRidWlsZGVyLnB1c2goMSwgMTAsIDQsIDIpO1xuXHRcdGJ1aWxkZXIucHVzaCgyLCAyLCAzLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyKGJ1aWxkZXIuYnVpbGQoKS5kYXRhKSwgW1xuXHRcdFx0MSwgMCwgNSwgMSwgMCxcblx0XHRcdDAsIDEwLCA0LCAyLCAwLFxuXHRcdFx0MSwgMiwgMywgMiwgMFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTZW1hbnRpY1Rva2Vuc0J1aWxkZXIgb3V0IG9mIG9yZGVyIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyB0eXBlcy5TZW1hbnRpY1Rva2Vuc0J1aWxkZXIoKTtcblx0XHRidWlsZGVyLnB1c2goMiwgMCwgNSwgMSwgMSk7XG5cdFx0YnVpbGRlci5wdXNoKDIsIDEwLCAxLCAyLCAyKTtcblx0XHRidWlsZGVyLnB1c2goMiwgMTUsIDIsIDMsIDMpO1xuXHRcdGJ1aWxkZXIucHVzaCgxLCAwLCA0LCA0LCA0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyKGJ1aWxkZXIuYnVpbGQoKS5kYXRhKSwgW1xuXHRcdFx0MSwgMCwgNCwgNCwgNCxcblx0XHRcdDEsIDAsIDUsIDEsIDEsXG5cdFx0XHQwLCAxMCwgMSwgMiwgMixcblx0XHRcdDAsIDUsIDIsIDMsIDNcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnU2VtYW50aWNUb2tlbnNCdWlsZGVyIG91dCBvZiBvcmRlciAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnNCdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5wdXNoKDIsIDEwLCA1LCAxLCAxKTtcblx0XHRidWlsZGVyLnB1c2goMiwgMiwgNCwgMiwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycihidWlsZGVyLmJ1aWxkKCkuZGF0YSksIFtcblx0XHRcdDIsIDIsIDQsIDIsIDIsXG5cdFx0XHQwLCA4LCA1LCAxLCAxXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbWFudGljVG9rZW5zQnVpbGRlciB3aXRoIGxlZ2VuZCcsICgpID0+IHtcblx0XHRjb25zdCBsZWdlbmQgPSBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQoXG5cdFx0XHRbJ2FUeXBlJywgJ2JUeXBlJywgJ2NUeXBlJywgJ2RUeXBlJ10sXG5cdFx0XHRbJ21vZDAnLCAnbW9kMScsICdtb2QyJywgJ21vZDMnLCAnbW9kNCcsICdtb2Q1J11cblx0XHQpO1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnNCdWlsZGVyKGxlZ2VuZCk7XG5cdFx0YnVpbGRlci5wdXNoKG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCA1KSwgJ2JUeXBlJyk7XG5cdFx0YnVpbGRlci5wdXNoKG5ldyB0eXBlcy5SYW5nZSgyLCAwLCAyLCA0KSwgJ2NUeXBlJywgWydtb2QwJywgJ21vZDUnXSk7XG5cdFx0YnVpbGRlci5wdXNoKG5ldyB0eXBlcy5SYW5nZSgzLCAwLCAzLCAzKSwgJ2RUeXBlJywgWydtb2QyJywgJ21vZDQnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycihidWlsZGVyLmJ1aWxkKCkuZGF0YSksIFtcblx0XHRcdDEsIDAsIDUsIDEsIDAsXG5cdFx0XHQxLCAwLCA0LCAyLCAxIHwgKDEgPDwgNSksXG5cdFx0XHQxLCAwLCAzLCAzLCAoMSA8PCAyKSB8ICgxIDw8IDQpXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01hcmtkb3duIGNvZGVibG9jayByZW5kZXJpbmcgaXMgc3dhcHBlZCAjMTExNjA0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1kID0gbmV3IHR5cGVzLk1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCc8aW1nIHNyYz0wIG9uZXJyb3I9XCJhbGVydCgxKVwiPicsICdodG1sJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZC52YWx1ZSwgJ1xcbmBgYGh0bWxcXG48aW1nIHNyYz0wIG9uZXJyb3I9XCJhbGVydCgxKVwiPlxcbmBgYFxcbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdOb3RlYm9va0NlbGxPdXRwdXRJdGVtIC0gZmFjdG9yaWVzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHQvLyBpbnZhbGlkIG1pbWUgdHlwZVxuXHRcdFx0bmV3IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0obmV3IFVpbnQ4QXJyYXkoKSwgJ2ludmFsaWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIC0tLSBlcnJcblxuXHRcdGxldCBpdGVtID0gdHlwZXMuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbS5lcnJvcihuZXcgRXJyb3IoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0ubWltZSwgJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLmVycm9yJyk7XG5cdFx0aXRlbSA9IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0uZXJyb3IoeyBuYW1lOiAnSGVsbG8nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLm1pbWUsICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5lcnJvcicpO1xuXG5cdFx0Ly8gLS0tIEpTT05cblxuXHRcdGl0ZW0gPSB0eXBlcy5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtLmpzb24oMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0ubWltZSwgJ3RleHQveC1qc29uJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtLmRhdGEsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShKU09OLnN0cmluZ2lmeSgxKSkpO1xuXG5cdFx0aXRlbSA9IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0uanNvbigxLCAnZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLm1pbWUsICdmb28vYmFyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtLmRhdGEsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShKU09OLnN0cmluZ2lmeSgxKSkpO1xuXG5cdFx0aXRlbSA9IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0uanNvbih0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5taW1lLCAndGV4dC94LWpzb24nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW0uZGF0YSwgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKEpTT04uc3RyaW5naWZ5KHRydWUpKSk7XG5cblx0XHRpdGVtID0gdHlwZXMuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbS5qc29uKFt0cnVlLCAxLCAnZGRkJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLm1pbWUsICd0ZXh0L3gtanNvbicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbS5kYXRhLCBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoSlNPTi5zdHJpbmdpZnkoW3RydWUsIDEsICdkZGQnXSwgdW5kZWZpbmVkLCAnXFx0JykpKTtcblxuXHRcdC8vIC0tLSB0ZXh0XG5cblx0XHRpdGVtID0gdHlwZXMuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbS50ZXh0KCdIXHUwMTE5XHUwMTQybFx1MDBGNicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLm1pbWUsIE1pbWVzLnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbS5kYXRhLCBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ0hcdTAxMTlcdTAxNDJsXHUwMEY2JykpO1xuXG5cdFx0aXRlbSA9IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0udGV4dCgnSFx1MDExOVx1MDE0MmxcdTAwRjYnLCAnZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLm1pbWUsICdmb28vYmFyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtLmRhdGEsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnSFx1MDExOVx1MDE0MmxcdTAwRjYnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGVEZWNvcmF0aW9uI3ZhbGlkYXRlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0Lm9rKHR5cGVzLkZpbGVEZWNvcmF0aW9uLnZhbGlkYXRlKHsgYmFkZ2U6ICd1JyB9KSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVzLkZpbGVEZWNvcmF0aW9uLnZhbGlkYXRlKHsgYmFkZ2U6ICdcdTAwRkMnIH0pKTtcblx0XHRhc3NlcnQub2sodHlwZXMuRmlsZURlY29yYXRpb24udmFsaWRhdGUoeyBiYWRnZTogJzEnIH0pKTtcblx0XHRhc3NlcnQub2sodHlwZXMuRmlsZURlY29yYXRpb24udmFsaWRhdGUoeyBiYWRnZTogJ1x1MDBFM1x1MDBFMycgfSkpO1xuXHRcdGFzc2VydC5vayh0eXBlcy5GaWxlRGVjb3JhdGlvbi52YWxpZGF0ZSh7IGJhZGdlOiAnXHVEODNEXHVEQzRCJyB9KSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVzLkZpbGVEZWNvcmF0aW9uLnZhbGlkYXRlKHsgYmFkZ2U6ICdcdUQ4M0RcdURDNEJcdUQ4M0RcdURDNEInIH0pKTtcblx0XHRhc3NlcnQub2sodHlwZXMuRmlsZURlY29yYXRpb24udmFsaWRhdGUoeyBiYWRnZTogJ1x1RDgzRFx1REM2OVx1MjAwRFx1RDgzRFx1REM2OVx1MjAwRFx1RDgzRFx1REM2N1x1MjAwRFx1RDgzRFx1REM2NycgfSkpO1xuXHRcdGFzc2VydC5vayh0eXBlcy5GaWxlRGVjb3JhdGlvbi52YWxpZGF0ZSh7IGJhZGdlOiAnXHUwQkFBXHUwQkNCJyB9KSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy5GaWxlRGVjb3JhdGlvbi52YWxpZGF0ZSh7IGJhZGdlOiAnaGVsJyB9KSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy5GaWxlRGVjb3JhdGlvbi52YWxpZGF0ZSh7IGJhZGdlOiAnXHVEODNEXHVEQzRCXHVEODNEXHVEQzRCXHVEODNEXHVEQzRCJyB9KSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy5GaWxlRGVjb3JhdGlvbi52YWxpZGF0ZSh7IGJhZGdlOiAnXHUwQkFBXHUwQkMxXHUwQkE5XHUwQkNEXHUwQjlBXHUwQkJGXHUwQkIwXHUwQkJGXHUwQkFBXHUwQkNEXHUwQkFBXHUwQkNCXHUwQjlGXHUwQkMxJyB9KSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy5GaWxlRGVjb3JhdGlvbi52YWxpZGF0ZSh7IGJhZGdlOiAnXHUwMEUzXHUwMEUzXHUwMEUzJyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bnRpbWUgc3RhYmxlLCB0eXBlLWRlZiBjaGFuZ2VkJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjMxOTM4XG5cdFx0Y29uc3QgbSA9IG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UodHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLmNvbnRlbnQsIFtdKTtcblx0XHRtLmNvbnRlbnQgPSAnSGVsbG8nO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5jb250ZW50LCBbbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCgnSGVsbG8nKV0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdC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SyxzQkFBUyxTQUFTO0FBQzNELFdBQU8sWUFBWSxLQUFLLE1BQU0sU0FBUztBQUN2QyxXQUFPLGdCQUFnQixLQUFLLE1BQU0sSUFBSSxZQUFZLEVBQUUsT0FBTyxvQkFBTyxDQUFDO0FBQUEsRUFDcEUsQ0FBQztBQUVELE9BQUssMkJBQTJCLFdBQVk7QUFFM0MsV0FBTyxHQUFHLE1BQU0sZUFBZSxTQUFTLEVBQUUsT0FBTyxJQUFJLENBQUMsQ0FBQztBQUN2RCxXQUFPLEdBQUcsTUFBTSxlQUFlLFNBQVMsRUFBRSxPQUFPLE9BQUksQ0FBQyxDQUFDO0FBQ3ZELFdBQU8sR0FBRyxNQUFNLGVBQWUsU0FBUyxFQUFFLE9BQU8sSUFBSSxDQUFDLENBQUM7QUFDdkQsV0FBTyxHQUFHLE1BQU0sZUFBZSxTQUFTLEVBQUUsT0FBTyxXQUFLLENBQUMsQ0FBQztBQUN4RCxXQUFPLEdBQUcsTUFBTSxlQUFlLFNBQVMsRUFBRSxPQUFPLFlBQUssQ0FBQyxDQUFDO0FBQ3hELFdBQU8sR0FBRyxNQUFNLGVBQWUsU0FBUyxFQUFFLE9BQU8scUJBQU8sQ0FBQyxDQUFDO0FBQzFELFdBQU8sR0FBRyxNQUFNLGVBQWUsU0FBUyxFQUFFLE9BQU8seURBQWMsQ0FBQyxDQUFDO0FBQ2pFLFdBQU8sR0FBRyxNQUFNLGVBQWUsU0FBUyxFQUFFLE9BQU8sZUFBSyxDQUFDLENBQUM7QUFDeEQsV0FBTyxPQUFPLE1BQU0sTUFBTSxlQUFlLFNBQVMsRUFBRSxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQ25FLFdBQU8sT0FBTyxNQUFNLE1BQU0sZUFBZSxTQUFTLEVBQUUsT0FBTyw4QkFBUyxDQUFDLENBQUM7QUFDdEUsV0FBTyxPQUFPLE1BQU0sTUFBTSxlQUFlLFNBQVMsRUFBRSxPQUFPLHVGQUFpQixDQUFDLENBQUM7QUFDOUUsV0FBTyxPQUFPLE1BQU0sTUFBTSxlQUFlLFNBQVMsRUFBRSxPQUFPLGVBQU0sQ0FBQyxDQUFDO0FBQUEsRUFDcEUsQ0FBQztBQUVELE9BQUssb0NBQW9DLFdBQVk7QUFFcEQsVUFBTSxJQUFJLElBQUksTUFBTSx5QkFBeUIsTUFBTSw2QkFBNkIsTUFBTSxDQUFDLENBQUM7QUFDeEYsV0FBTyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUNwQyxNQUFFLFVBQVU7QUFDWixXQUFPLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxJQUFJLE1BQU0sc0JBQXNCLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDN0UsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
