import assert from "assert";
import { Lazy } from "../../../../base/common/lazy.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { RenderLineNumbersType, TextEditorCursorStyle } from "../../../../editor/common/config/editorOptions.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ExtHostDocumentData } from "../../common/extHostDocumentData.js";
import { ExtHostTextEditor, ExtHostTextEditorOptions } from "../../common/extHostTextEditor.js";
import { Range, TextEditorLineNumbersStyle } from "../../common/extHostTypes.js";
suite("ExtHostTextEditor", () => {
  let editor;
  const doc = new ExtHostDocumentData(void 0, URI.file(""), [
    "aaaa bbbb+cccc abc"
  ], "\n", 1, "text", false, "utf8");
  setup(() => {
    editor = new ExtHostTextEditor("fake", null, new NullLogService(), new Lazy(() => doc.document), [], { cursorStyle: TextEditorCursorStyle.Line, insertSpaces: true, lineNumbers: 1, tabSize: 4, indentSize: 4, originalIndentSize: "tabSize" }, [], 1);
  });
  test("disposed editor", () => {
    assert.ok(editor.value.document);
    editor._acceptViewColumn(3);
    assert.strictEqual(3, editor.value.viewColumn);
    editor.dispose();
    assert.throws(() => editor._acceptViewColumn(2));
    assert.strictEqual(3, editor.value.viewColumn);
    assert.ok(editor.value.document);
    assert.throws(() => editor._acceptOptions(null));
    assert.throws(() => editor._acceptSelections([]));
  });
  test("API [bug]: registerTextEditorCommand clears redo stack even if no edits are made #55163", async function() {
    let applyCount = 0;
    const editor2 = new ExtHostTextEditor(
      "edt1",
      new class extends mock() {
        $tryApplyEdits() {
          applyCount += 1;
          return Promise.resolve(true);
        }
      }(),
      new NullLogService(),
      new Lazy(() => doc.document),
      [],
      { cursorStyle: TextEditorCursorStyle.Line, insertSpaces: true, lineNumbers: 1, tabSize: 4, indentSize: 4, originalIndentSize: "tabSize" },
      [],
      1
    );
    await editor2.value.edit((edit) => {
    });
    assert.strictEqual(applyCount, 0);
    await editor2.value.edit((edit) => {
      edit.setEndOfLine(1);
    });
    assert.strictEqual(applyCount, 1);
    await editor2.value.edit((edit) => {
      edit.delete(new Range(0, 0, 1, 1));
    });
    assert.strictEqual(applyCount, 2);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("ExtHostTextEditorOptions", () => {
  let opts;
  let calls = [];
  setup(() => {
    calls = [];
    const mockProxy = {
      dispose: void 0,
      $trySetOptions: (id, options) => {
        assert.strictEqual(id, "1");
        calls.push(options);
        return Promise.resolve(void 0);
      },
      $tryShowTextDocument: void 0,
      $registerTextEditorDecorationType: void 0,
      $removeTextEditorDecorationType: void 0,
      $tryShowEditor: void 0,
      $tryHideEditor: void 0,
      $trySetDecorations: void 0,
      $trySetDecorationsFast: void 0,
      $tryRevealRange: void 0,
      $trySetSelections: void 0,
      $tryApplyEdits: void 0,
      $tryInsertSnippet: void 0,
      $getDiffInformation: void 0
    };
    opts = new ExtHostTextEditorOptions(mockProxy, "1", {
      tabSize: 4,
      indentSize: 4,
      originalIndentSize: "tabSize",
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    }, new NullLogService());
  });
  teardown(() => {
    opts = null;
    calls = null;
  });
  function assertState(opts2, expected) {
    const actual = {
      tabSize: opts2.value.tabSize,
      indentSize: opts2.value.indentSize,
      insertSpaces: opts2.value.insertSpaces,
      cursorStyle: opts2.value.cursorStyle,
      lineNumbers: opts2.value.lineNumbers
    };
    assert.deepStrictEqual(actual, expected);
  }
  test("can set tabSize to the same value", () => {
    opts.value.tabSize = 4;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can change tabSize to positive integer", () => {
    opts.value.tabSize = 1;
    assertState(opts, {
      tabSize: 1,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 1 }]);
  });
  test("can change tabSize to positive float", () => {
    opts.value.tabSize = 2.3;
    assertState(opts, {
      tabSize: 2,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 2 }]);
  });
  test("can change tabSize to a string number", () => {
    opts.value.tabSize = "2";
    assertState(opts, {
      tabSize: 2,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 2 }]);
  });
  test("tabSize can request indentation detection", () => {
    opts.value.tabSize = "auto";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: "auto" }]);
  });
  test("ignores invalid tabSize 1", () => {
    opts.value.tabSize = null;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid tabSize 2", () => {
    opts.value.tabSize = -5;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid tabSize 3", () => {
    opts.value.tabSize = "hello";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid tabSize 4", () => {
    opts.value.tabSize = "-17";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set indentSize to the same value", () => {
    opts.value.indentSize = 4;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 4 }]);
  });
  test("can change indentSize to positive integer", () => {
    opts.value.indentSize = 1;
    assertState(opts, {
      tabSize: 4,
      indentSize: 1,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 1 }]);
  });
  test("can change indentSize to positive float", () => {
    opts.value.indentSize = 2.3;
    assertState(opts, {
      tabSize: 4,
      indentSize: 2,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 2 }]);
  });
  test("can change indentSize to a string number", () => {
    opts.value.indentSize = "2";
    assertState(opts, {
      tabSize: 4,
      indentSize: 2,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 2 }]);
  });
  test("indentSize can request to use tabSize", () => {
    opts.value.indentSize = "tabSize";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: "tabSize" }]);
  });
  test("indentSize cannot request indentation detection", () => {
    opts.value.indentSize = "auto";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 1", () => {
    opts.value.indentSize = null;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 2", () => {
    opts.value.indentSize = -5;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 3", () => {
    opts.value.indentSize = "hello";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 4", () => {
    opts.value.indentSize = "-17";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set insertSpaces to the same value", () => {
    opts.value.insertSpaces = false;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set insertSpaces to boolean", () => {
    opts.value.insertSpaces = true;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: true,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ insertSpaces: true }]);
  });
  test("can set insertSpaces to false string", () => {
    opts.value.insertSpaces = "false";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set insertSpaces to truey", () => {
    opts.value.insertSpaces = "hello";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: true,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ insertSpaces: true }]);
  });
  test("insertSpaces can request indentation detection", () => {
    opts.value.insertSpaces = "auto";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ insertSpaces: "auto" }]);
  });
  test("can set cursorStyle to same value", () => {
    opts.value.cursorStyle = TextEditorCursorStyle.Line;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can change cursorStyle", () => {
    opts.value.cursorStyle = TextEditorCursorStyle.Block;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Block,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ cursorStyle: TextEditorCursorStyle.Block }]);
  });
  test("can set lineNumbers to same value", () => {
    opts.value.lineNumbers = TextEditorLineNumbersStyle.On;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can change lineNumbers", () => {
    opts.value.lineNumbers = TextEditorLineNumbersStyle.Off;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.Off
    });
    assert.deepStrictEqual(calls, [{ lineNumbers: RenderLineNumbersType.Off }]);
  });
  test("can do bulk updates 0", () => {
    opts.assign({
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: TextEditorLineNumbersStyle.On
    });
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 4 }]);
  });
  test("can do bulk updates 1", () => {
    opts.assign({
      tabSize: "auto",
      insertSpaces: true
    });
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: true,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: "auto", insertSpaces: true }]);
  });
  test("can do bulk updates 2", () => {
    opts.assign({
      tabSize: 3,
      insertSpaces: "auto"
    });
    assertState(opts, {
      tabSize: 3,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 3, insertSpaces: "auto" }]);
  });
  test("can do bulk updates 3", () => {
    opts.assign({
      cursorStyle: TextEditorCursorStyle.Block,
      lineNumbers: TextEditorLineNumbersStyle.Relative
    });
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Block,
      lineNumbers: RenderLineNumbersType.Relative
    });
    assert.deepStrictEqual(calls, [{ cursorStyle: TextEditorCursorStyle.Block, lineNumbers: RenderLineNumbersType.Relative }]);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RUZXh0RWRpdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSZW5kZXJMaW5lTnVtYmVyc1R5cGUsIFRleHRFZGl0b3JDdXJzb3JTdHlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbiwgSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlLCBNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudERhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50RGF0YS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGV4dEVkaXRvciwgRXh0SG9zdFRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZXh0RWRpdG9yLmpzJztcbmltcG9ydCB7IFJhbmdlLCBUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuXG5zdWl0ZSgnRXh0SG9zdFRleHRFZGl0b3InLCAoKSA9PiB7XG5cblx0bGV0IGVkaXRvcjogRXh0SG9zdFRleHRFZGl0b3I7XG5cdGNvbnN0IGRvYyA9IG5ldyBFeHRIb3N0RG9jdW1lbnREYXRhKHVuZGVmaW5lZCEsIFVSSS5maWxlKCcnKSwgW1xuXHRcdCdhYWFhIGJiYmIrY2NjYyBhYmMnXG5cdF0sICdcXG4nLCAxLCAndGV4dCcsIGZhbHNlLCAndXRmOCcpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRlZGl0b3IgPSBuZXcgRXh0SG9zdFRleHRFZGl0b3IoJ2Zha2UnLCBudWxsISwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBMYXp5KCgpID0+IGRvYy5kb2N1bWVudCksIFtdLCB7IGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSwgaW5zZXJ0U3BhY2VzOiB0cnVlLCBsaW5lTnVtYmVyczogMSwgdGFiU2l6ZTogNCwgaW5kZW50U2l6ZTogNCwgb3JpZ2luYWxJbmRlbnRTaXplOiAndGFiU2l6ZScgfSwgW10sIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlZCBlZGl0b3InLCAoKSA9PiB7XG5cblx0XHRhc3NlcnQub2soZWRpdG9yLnZhbHVlLmRvY3VtZW50KTtcblx0XHRlZGl0b3IuX2FjY2VwdFZpZXdDb2x1bW4oMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIGVkaXRvci52YWx1ZS52aWV3Q29sdW1uKTtcblxuXHRcdGVkaXRvci5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGVkaXRvci5fYWNjZXB0Vmlld0NvbHVtbigyKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIGVkaXRvci52YWx1ZS52aWV3Q29sdW1uKTtcblxuXHRcdGFzc2VydC5vayhlZGl0b3IudmFsdWUuZG9jdW1lbnQpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZWRpdG9yLl9hY2NlcHRPcHRpb25zKG51bGwhKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBlZGl0b3IuX2FjY2VwdFNlbGVjdGlvbnMoW10pKTtcblx0fSk7XG5cblx0dGVzdCgnQVBJIFtidWddOiByZWdpc3RlclRleHRFZGl0b3JDb21tYW5kIGNsZWFycyByZWRvIHN0YWNrIGV2ZW4gaWYgbm8gZWRpdHMgYXJlIG1hZGUgIzU1MTYzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBhcHBseUNvdW50ID0gMDtcblx0XHRjb25zdCBlZGl0b3IgPSBuZXcgRXh0SG9zdFRleHRFZGl0b3IoJ2VkdDEnLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICR0cnlBcHBseUVkaXRzKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdFx0XHRcdGFwcGx5Q291bnQgKz0gMTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IExhenkoKCkgPT4gZG9jLmRvY3VtZW50KSwgW10sIHsgY3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLCBpbnNlcnRTcGFjZXM6IHRydWUsIGxpbmVOdW1iZXJzOiAxLCB0YWJTaXplOiA0LCBpbmRlbnRTaXplOiA0LCBvcmlnaW5hbEluZGVudFNpemU6ICd0YWJTaXplJyB9LCBbXSwgMSk7XG5cblx0XHRhd2FpdCBlZGl0b3IudmFsdWUuZWRpdChlZGl0ID0+IHsgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGx5Q291bnQsIDApO1xuXG5cdFx0YXdhaXQgZWRpdG9yLnZhbHVlLmVkaXQoZWRpdCA9PiB7IGVkaXQuc2V0RW5kT2ZMaW5lKDEpOyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlDb3VudCwgMSk7XG5cblx0XHRhd2FpdCBlZGl0b3IudmFsdWUuZWRpdChlZGl0ID0+IHsgZWRpdC5kZWxldGUobmV3IFJhbmdlKDAsIDAsIDEsIDEpKTsgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGx5Q291bnQsIDIpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuXG5zdWl0ZSgnRXh0SG9zdFRleHRFZGl0b3JPcHRpb25zJywgKCkgPT4ge1xuXG5cdGxldCBvcHRzOiBFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnM7XG5cdGxldCBjYWxsczogSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlW10gPSBbXTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y2FsbHMgPSBbXTtcblx0XHRjb25zdCBtb2NrUHJveHk6IE1haW5UaHJlYWRUZXh0RWRpdG9yc1NoYXBlID0ge1xuXHRcdFx0ZGlzcG9zZTogdW5kZWZpbmVkISxcblx0XHRcdCR0cnlTZXRPcHRpb25zOiAoaWQ6IHN0cmluZywgb3B0aW9uczogSVRleHRFZGl0b3JDb25maWd1cmF0aW9uVXBkYXRlKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZCwgJzEnKTtcblx0XHRcdFx0Y2FsbHMucHVzaChvcHRpb25zKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSxcblx0XHRcdCR0cnlTaG93VGV4dERvY3VtZW50OiB1bmRlZmluZWQhLFxuXHRcdFx0JHJlZ2lzdGVyVGV4dEVkaXRvckRlY29yYXRpb25UeXBlOiB1bmRlZmluZWQhLFxuXHRcdFx0JHJlbW92ZVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTogdW5kZWZpbmVkISxcblx0XHRcdCR0cnlTaG93RWRpdG9yOiB1bmRlZmluZWQhLFxuXHRcdFx0JHRyeUhpZGVFZGl0b3I6IHVuZGVmaW5lZCEsXG5cdFx0XHQkdHJ5U2V0RGVjb3JhdGlvbnM6IHVuZGVmaW5lZCEsXG5cdFx0XHQkdHJ5U2V0RGVjb3JhdGlvbnNGYXN0OiB1bmRlZmluZWQhLFxuXHRcdFx0JHRyeVJldmVhbFJhbmdlOiB1bmRlZmluZWQhLFxuXHRcdFx0JHRyeVNldFNlbGVjdGlvbnM6IHVuZGVmaW5lZCEsXG5cdFx0XHQkdHJ5QXBwbHlFZGl0czogdW5kZWZpbmVkISxcblx0XHRcdCR0cnlJbnNlcnRTbmlwcGV0OiB1bmRlZmluZWQhLFxuXHRcdFx0JGdldERpZmZJbmZvcm1hdGlvbjogdW5kZWZpbmVkIVxuXHRcdH07XG5cdFx0b3B0cyA9IG5ldyBFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnMobW9ja1Byb3h5LCAnMScsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0b3JpZ2luYWxJbmRlbnRTaXplOiAndGFiU2l6ZScsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdG9wdHMgPSBudWxsITtcblx0XHRjYWxscyA9IG51bGwhO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhc3NlcnRTdGF0ZShvcHRzOiBFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnMsIGV4cGVjdGVkOiBPbWl0PElSZXNvbHZlZFRleHRFZGl0b3JDb25maWd1cmF0aW9uLCAnb3JpZ2luYWxJbmRlbnRTaXplJz4pOiB2b2lkIHtcblx0XHRjb25zdCBhY3R1YWwgPSB7XG5cdFx0XHR0YWJTaXplOiBvcHRzLnZhbHVlLnRhYlNpemUsXG5cdFx0XHRpbmRlbnRTaXplOiBvcHRzLnZhbHVlLmluZGVudFNpemUsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IG9wdHMudmFsdWUuaW5zZXJ0U3BhY2VzLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IG9wdHMudmFsdWUuY3Vyc29yU3R5bGUsXG5cdFx0XHRsaW5lTnVtYmVyczogb3B0cy52YWx1ZS5saW5lTnVtYmVyc1xuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ2NhbiBzZXQgdGFiU2l6ZSB0byB0aGUgc2FtZSB2YWx1ZScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLnRhYlNpemUgPSA0O1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgdGFiU2l6ZSB0byBwb3NpdGl2ZSBpbnRlZ2VyJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUudGFiU2l6ZSA9IDE7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogMSxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IHRhYlNpemU6IDEgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gY2hhbmdlIHRhYlNpemUgdG8gcG9zaXRpdmUgZmxvYXQnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS50YWJTaXplID0gMi4zO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDIsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyB0YWJTaXplOiAyIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGNoYW5nZSB0YWJTaXplIHRvIGEgc3RyaW5nIG51bWJlcicsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLnRhYlNpemUgPSAnMic7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogMixcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IHRhYlNpemU6IDIgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWJTaXplIGNhbiByZXF1ZXN0IGluZGVudGF0aW9uIGRldGVjdGlvbicsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLnRhYlNpemUgPSAnYXV0byc7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IHRhYlNpemU6ICdhdXRvJyB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgaW52YWxpZCB0YWJTaXplIDEnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS50YWJTaXplID0gbnVsbCE7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBpbnZhbGlkIHRhYlNpemUgMicsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLnRhYlNpemUgPSAtNTtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgdGFiU2l6ZSAzJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUudGFiU2l6ZSA9ICdoZWxsbyc7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBpbnZhbGlkIHRhYlNpemUgNCcsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLnRhYlNpemUgPSAnLTE3Jztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gc2V0IGluZGVudFNpemUgdG8gdGhlIHNhbWUgdmFsdWUnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbmRlbnRTaXplID0gNDtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgaW5kZW50U2l6ZTogNCB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgaW5kZW50U2l6ZSB0byBwb3NpdGl2ZSBpbnRlZ2VyJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUuaW5kZW50U2l6ZSA9IDE7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDEsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IGluZGVudFNpemU6IDEgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gY2hhbmdlIGluZGVudFNpemUgdG8gcG9zaXRpdmUgZmxvYXQnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbmRlbnRTaXplID0gMi4zO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiAyLFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbmRlbnRTaXplOiAyIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGNoYW5nZSBpbmRlbnRTaXplIHRvIGEgc3RyaW5nIG51bWJlcicsICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSA8YW55PicyJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogMixcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgaW5kZW50U2l6ZTogMiB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luZGVudFNpemUgY2FuIHJlcXVlc3QgdG8gdXNlIHRhYlNpemUnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbmRlbnRTaXplID0gJ3RhYlNpemUnO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbmRlbnRTaXplOiAndGFiU2l6ZScgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmRlbnRTaXplIGNhbm5vdCByZXF1ZXN0IGluZGVudGF0aW9uIGRldGVjdGlvbicsICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSA8YW55PidhdXRvJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgaW5kZW50U2l6ZSAxJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUuaW5kZW50U2l6ZSA9IG51bGwhO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgaW52YWxpZCBpbmRlbnRTaXplIDInLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbmRlbnRTaXplID0gLTU7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBpbnZhbGlkIGluZGVudFNpemUgMycsICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSA8YW55PidoZWxsbyc7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBpbnZhbGlkIGluZGVudFNpemUgNCcsICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSA8YW55PictMTcnO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBzZXQgaW5zZXJ0U3BhY2VzIHRvIHRoZSBzYW1lIHZhbHVlJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUuaW5zZXJ0U3BhY2VzID0gZmFsc2U7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIHNldCBpbnNlcnRTcGFjZXMgdG8gYm9vbGVhbicsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmluc2VydFNwYWNlcyA9IHRydWU7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IHRydWUsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgaW5zZXJ0U3BhY2VzOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIHNldCBpbnNlcnRTcGFjZXMgdG8gZmFsc2Ugc3RyaW5nJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUuaW5zZXJ0U3BhY2VzID0gJ2ZhbHNlJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gc2V0IGluc2VydFNwYWNlcyB0byB0cnVleScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmluc2VydFNwYWNlcyA9ICdoZWxsbyc7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IHRydWUsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgaW5zZXJ0U3BhY2VzOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0U3BhY2VzIGNhbiByZXF1ZXN0IGluZGVudGF0aW9uIGRldGVjdGlvbicsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmluc2VydFNwYWNlcyA9ICdhdXRvJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgaW5zZXJ0U3BhY2VzOiAnYXV0bycgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gc2V0IGN1cnNvclN0eWxlIHRvIHNhbWUgdmFsdWUnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5jdXJzb3JTdHlsZSA9IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgY3Vyc29yU3R5bGUnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5jdXJzb3JTdHlsZSA9IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9jaztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2sgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gc2V0IGxpbmVOdW1iZXJzIHRvIHNhbWUgdmFsdWUnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5saW5lTnVtYmVycyA9IFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLk9uO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgbGluZU51bWJlcnMnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5saW5lTnVtYmVycyA9IFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLk9mZjtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9mZlxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT2ZmIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGRvIGJ1bGsgdXBkYXRlcyAwJywgKCkgPT4ge1xuXHRcdG9wdHMuYXNzaWduKHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbmRlbnRTaXplOiA0IH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGRvIGJ1bGsgdXBkYXRlcyAxJywgKCkgPT4ge1xuXHRcdG9wdHMuYXNzaWduKHtcblx0XHRcdHRhYlNpemU6ICdhdXRvJyxcblx0XHRcdGluc2VydFNwYWNlczogdHJ1ZVxuXHRcdH0pO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiB0cnVlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IHRhYlNpemU6ICdhdXRvJywgaW5zZXJ0U3BhY2VzOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGRvIGJ1bGsgdXBkYXRlcyAyJywgKCkgPT4ge1xuXHRcdG9wdHMuYXNzaWduKHtcblx0XHRcdHRhYlNpemU6IDMsXG5cdFx0XHRpbnNlcnRTcGFjZXM6ICdhdXRvJ1xuXHRcdH0pO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDMsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyB0YWJTaXplOiAzLCBpbnNlcnRTcGFjZXM6ICdhdXRvJyB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBkbyBidWxrIHVwZGF0ZXMgMycsICgpID0+IHtcblx0XHRvcHRzLmFzc2lnbih7XG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrLFxuXHRcdFx0bGluZU51bWJlcnM6IFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLlJlbGF0aXZlXG5cdFx0fSk7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9jayxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuUmVsYXRpdmVcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrLCBsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLlJlbGF0aXZlIH1dKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1Qiw2QkFBNkI7QUFDN0QsU0FB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
