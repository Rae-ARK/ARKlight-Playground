import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { withTestCodeEditor } from "../testCodeEditor.js";
suite("CodeEditorWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("onDidChangeModelDecorations", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let invoked = false;
      disposables.add(editor.onDidChangeModelDecorations((e) => {
        invoked = true;
      }));
      viewModel.model.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: "test" } }]);
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelLanguage", () => {
    withTestCodeEditor("", {}, (editor, viewModel, instantiationService) => {
      const languageService = instantiationService.get(ILanguageService);
      const disposables = new DisposableStore();
      disposables.add(languageService.registerLanguage({ id: "testMode" }));
      let invoked = false;
      disposables.add(editor.onDidChangeModelLanguage((e) => {
        invoked = true;
      }));
      viewModel.model.setLanguage("testMode");
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelLanguageConfiguration", () => {
    withTestCodeEditor("", {}, (editor, viewModel, instantiationService) => {
      const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
      const languageService = instantiationService.get(ILanguageService);
      const disposables = new DisposableStore();
      disposables.add(languageService.registerLanguage({ id: "testMode" }));
      viewModel.model.setLanguage("testMode");
      let invoked = false;
      disposables.add(editor.onDidChangeModelLanguageConfiguration((e) => {
        invoked = true;
      }));
      disposables.add(languageConfigurationService.register("testMode", {
        brackets: [["(", ")"]]
      }));
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelContent", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let invoked = false;
      disposables.add(editor.onDidChangeModelContent((e) => {
        invoked = true;
      }));
      viewModel.type("hello", "test");
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelOptions", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let invoked = false;
      disposables.add(editor.onDidChangeModelOptions((e) => {
        invoked = true;
      }));
      viewModel.model.updateOptions({
        tabSize: 3
      });
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("issue #145872 - Model change events are emitted before the selection updates", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let observedSelection = null;
      disposables.add(editor.onDidChangeModelContent((e) => {
        observedSelection = editor.getSelection();
      }));
      viewModel.type("hello", "test");
      assert.deepStrictEqual(observedSelection, new Selection(1, 6, 1, 6));
      disposables.dispose();
    });
  });
  test("monaco-editor issue #2774 - Wrong order of events onDidChangeModelContent and onDidChangeCursorSelection on redo", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      const calls = [];
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      viewModel.type("a", "test");
      viewModel.model.undo();
      viewModel.model.redo();
      assert.deepStrictEqual(calls, [
        "contentchange(a, 0, 0)",
        "cursorchange(1, 2)",
        "contentchange(, 0, 1)",
        "cursorchange(1, 1)",
        "contentchange(a, 0, 0)",
        "cursorchange(1, 2)"
      ]);
      disposables.dispose();
    });
  });
  test("issue #146174: Events delivered out of order when adding decorations in content change listener (1 of 2)", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      const calls = [];
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener1 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener2 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      viewModel.type("a", "test");
      assert.deepStrictEqual(calls, [
        "listener1 - contentchange(a, 0, 0)",
        "listener2 - contentchange(a, 0, 0)",
        "listener1 - cursorchange(1, 2)",
        "listener2 - cursorchange(1, 2)"
      ]);
      disposables.dispose();
    });
  });
  test("issue #146174: Events delivered out of order when adding decorations in content change listener (2 of 2)", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      const calls = [];
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener1 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
        editor.changeDecorations((changeAccessor) => {
          changeAccessor.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: "test" } }]);
        });
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener2 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      viewModel.type("a", "test");
      assert.deepStrictEqual(calls, [
        "listener1 - contentchange(a, 0, 0)",
        "listener2 - contentchange(a, 0, 0)",
        "listener1 - cursorchange(1, 2)",
        "listener2 - cursorchange(1, 2)"
      ]);
      disposables.dispose();
    });
  });
  test("getBottomForLineNumber should handle invalid line numbers gracefully", () => {
    withTestCodeEditor("line1\nline2\nline3", {}, (editor, viewModel) => {
      const result1 = editor.getBottomForLineNumber(100);
      assert.ok(result1 >= 0, "Should return a valid position for out-of-bounds line number");
      const result2 = editor.getBottomForLineNumber(0);
      assert.ok(result2 >= 0, "Should return a valid position for line number 0");
      const result3 = editor.getBottomForLineNumber(-5);
      assert.ok(result3 >= 0, "Should return a valid position for negative line number");
      const result4 = editor.getBottomForLineNumber(2);
      assert.ok(result4 > 0, "Should return a valid position for valid line number");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3JXaWRnZXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB3aXRoVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbnN1aXRlKCdDb2RlRWRpdG9yV2lkZ2V0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9ucycsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJycsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRsZXQgaW52b2tlZCA9IGZhbHNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMoKGUpID0+IHtcblx0XHRcdFx0aW52b2tlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC5tb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcgfSB9XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2tlZCwgdHJ1ZSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6ICd0ZXN0TW9kZScgfSkpO1xuXG5cdFx0XHRsZXQgaW52b2tlZCA9IGZhbHNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoKGUpID0+IHtcblx0XHRcdFx0aW52b2tlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC5tb2RlbC5zZXRMYW5ndWFnZSgndGVzdE1vZGUnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnZva2VkLCB0cnVlKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogJ3Rlc3RNb2RlJyB9KSk7XG5cdFx0XHR2aWV3TW9kZWwubW9kZWwuc2V0TGFuZ3VhZ2UoJ3Rlc3RNb2RlJyk7XG5cblx0XHRcdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdFx0aW52b2tlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKCd0ZXN0TW9kZScsIHtcblx0XHRcdFx0YnJhY2tldHM6IFtbJygnLCAnKSddXVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9rZWQsIHRydWUpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlTW9kZWxDb250ZW50JywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdGludm9rZWQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnaGVsbG8nLCAndGVzdCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9rZWQsIHRydWUpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlTW9kZWxPcHRpb25zJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxPcHRpb25zKChlKSA9PiB7XG5cdFx0XHRcdGludm9rZWQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwubW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdHRhYlNpemU6IDNcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9rZWQsIHRydWUpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDU4NzIgLSBNb2RlbCBjaGFuZ2UgZXZlbnRzIGFyZSBlbWl0dGVkIGJlZm9yZSB0aGUgc2VsZWN0aW9uIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0bGV0IG9ic2VydmVkU2VsZWN0aW9uOiBTZWxlY3Rpb24gfCBudWxsID0gbnVsbDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0b2JzZXJ2ZWRTZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdoZWxsbycsICd0ZXN0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2JzZXJ2ZWRTZWxlY3Rpb24sIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vbmFjby1lZGl0b3IgaXNzdWUgIzI3NzQgLSBXcm9uZyBvcmRlciBvZiBldmVudHMgb25EaWRDaGFuZ2VNb2RlbENvbnRlbnQgYW5kIG9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uIG9uIHJlZG8nLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYGNvbnRlbnRjaGFuZ2UoJHtlLmNoYW5nZXMucmVkdWNlPGFueVtdPigoYWdnciwgYykgPT4gWy4uLmFnZ3IsIGMudGV4dCwgYy5yYW5nZU9mZnNldCwgYy5yYW5nZUxlbmd0aF0sIFtdKS5qb2luKCcsICcpfSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgY3Vyc29yY2hhbmdlKCR7ZS5zZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyfSwgJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbn0pYCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhJywgJ3Rlc3QnKTtcblx0XHRcdHZpZXdNb2RlbC5tb2RlbC51bmRvKCk7XG5cdFx0XHR2aWV3TW9kZWwubW9kZWwucmVkbygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXG5cdFx0XHRcdCdjb250ZW50Y2hhbmdlKGEsIDAsIDApJyxcblx0XHRcdFx0J2N1cnNvcmNoYW5nZSgxLCAyKScsXG5cdFx0XHRcdCdjb250ZW50Y2hhbmdlKCwgMCwgMSknLFxuXHRcdFx0XHQnY3Vyc29yY2hhbmdlKDEsIDEpJyxcblx0XHRcdFx0J2NvbnRlbnRjaGFuZ2UoYSwgMCwgMCknLFxuXHRcdFx0XHQnY3Vyc29yY2hhbmdlKDEsIDIpJ1xuXHRcdFx0XSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0NjE3NDogRXZlbnRzIGRlbGl2ZXJlZCBvdXQgb2Ygb3JkZXIgd2hlbiBhZGRpbmcgZGVjb3JhdGlvbnMgaW4gY29udGVudCBjaGFuZ2UgbGlzdGVuZXIgKDEgb2YgMiknLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYGxpc3RlbmVyMSAtIGNvbnRlbnRjaGFuZ2UoJHtlLmNoYW5nZXMucmVkdWNlPGFueVtdPigoYWdnciwgYykgPT4gWy4uLmFnZ3IsIGMudGV4dCwgYy5yYW5nZU9mZnNldCwgYy5yYW5nZUxlbmd0aF0sIFtdKS5qb2luKCcsICcpfSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIxIC0gY3Vyc29yY2hhbmdlKCR7ZS5zZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyfSwgJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbn0pYCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYGxpc3RlbmVyMiAtIGNvbnRlbnRjaGFuZ2UoJHtlLmNoYW5nZXMucmVkdWNlPGFueVtdPigoYWdnciwgYykgPT4gWy4uLmFnZ3IsIGMudGV4dCwgYy5yYW5nZU9mZnNldCwgYy5yYW5nZUxlbmd0aF0sIFtdKS5qb2luKCcsICcpfSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIyIC0gY3Vyc29yY2hhbmdlKCR7ZS5zZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyfSwgJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbn0pYCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhJywgJ3Rlc3QnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgKFtcblx0XHRcdFx0J2xpc3RlbmVyMSAtIGNvbnRlbnRjaGFuZ2UoYSwgMCwgMCknLFxuXHRcdFx0XHQnbGlzdGVuZXIyIC0gY29udGVudGNoYW5nZShhLCAwLCAwKScsXG5cdFx0XHRcdCdsaXN0ZW5lcjEgLSBjdXJzb3JjaGFuZ2UoMSwgMiknLFxuXHRcdFx0XHQnbGlzdGVuZXIyIC0gY3Vyc29yY2hhbmdlKDEsIDIpJyxcblx0XHRcdF0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTQ2MTc0OiBFdmVudHMgZGVsaXZlcmVkIG91dCBvZiBvcmRlciB3aGVuIGFkZGluZyBkZWNvcmF0aW9ucyBpbiBjb250ZW50IGNoYW5nZSBsaXN0ZW5lciAoMiBvZiAyKScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJycsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIxIC0gY29udGVudGNoYW5nZSgke2UuY2hhbmdlcy5yZWR1Y2U8YW55W10+KChhZ2dyLCBjKSA9PiBbLi4uYWdnciwgYy50ZXh0LCBjLnJhbmdlT2Zmc2V0LCBjLnJhbmdlTGVuZ3RoXSwgW10pLmpvaW4oJywgJyl9KWApO1xuXHRcdFx0XHRlZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyhbXSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnIH0gfV0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIxIC0gY3Vyc29yY2hhbmdlKCR7ZS5zZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyfSwgJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbn0pYCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYGxpc3RlbmVyMiAtIGNvbnRlbnRjaGFuZ2UoJHtlLmNoYW5nZXMucmVkdWNlPGFueVtdPigoYWdnciwgYykgPT4gWy4uLmFnZ3IsIGMudGV4dCwgYy5yYW5nZU9mZnNldCwgYy5yYW5nZUxlbmd0aF0sIFtdKS5qb2luKCcsICcpfSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIyIC0gY3Vyc29yY2hhbmdlKCR7ZS5zZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyfSwgJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbn0pYCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhJywgJ3Rlc3QnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgKFtcblx0XHRcdFx0J2xpc3RlbmVyMSAtIGNvbnRlbnRjaGFuZ2UoYSwgMCwgMCknLFxuXHRcdFx0XHQnbGlzdGVuZXIyIC0gY29udGVudGNoYW5nZShhLCAwLCAwKScsXG5cdFx0XHRcdCdsaXN0ZW5lcjEgLSBjdXJzb3JjaGFuZ2UoMSwgMiknLFxuXHRcdFx0XHQnbGlzdGVuZXIyIC0gY3Vyc29yY2hhbmdlKDEsIDIpJyxcblx0XHRcdF0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRCb3R0b21Gb3JMaW5lTnVtYmVyIHNob3VsZCBoYW5kbGUgaW52YWxpZCBsaW5lIG51bWJlcnMgZ3JhY2VmdWxseScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJ2xpbmUxXFxubGluZTJcXG5saW5lMycsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIFRlc3Qgd2l0aCBsaW5lTnVtYmVyIGdyZWF0ZXIgdGhhbiBsaW5lIGNvdW50XG5cdFx0XHRjb25zdCByZXN1bHQxID0gZWRpdG9yLmdldEJvdHRvbUZvckxpbmVOdW1iZXIoMTAwKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQxID49IDAsICdTaG91bGQgcmV0dXJuIGEgdmFsaWQgcG9zaXRpb24gZm9yIG91dC1vZi1ib3VuZHMgbGluZSBudW1iZXInKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIGxpbmVOdW1iZXIgbGVzcyB0aGFuIDFcblx0XHRcdGNvbnN0IHJlc3VsdDIgPSBlZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcigwKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQyID49IDAsICdTaG91bGQgcmV0dXJuIGEgdmFsaWQgcG9zaXRpb24gZm9yIGxpbmUgbnVtYmVyIDAnKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIG5lZ2F0aXZlIGxpbmVOdW1iZXJcblx0XHRcdGNvbnN0IHJlc3VsdDMgPSBlZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcigtNSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0MyA+PSAwLCAnU2hvdWxkIHJldHVybiBhIHZhbGlkIHBvc2l0aW9uIGZvciBuZWdhdGl2ZSBsaW5lIG51bWJlcicpO1xuXG5cdFx0XHQvLyBUZXN0IHdpdGggdmFsaWQgbGluZU51bWJlciBzaG91bGQgc3RpbGwgd29ya1xuXHRcdFx0Y29uc3QgcmVzdWx0NCA9IGVkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDQgPiAwLCAnU2hvdWxkIHJldHVybiBhIHZhbGlkIHBvc2l0aW9uIGZvciB2YWxpZCBsaW5lIG51bWJlcicpO1xuXHRcdH0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sb0JBQW9CLE1BQU07QUFFL0IsMENBQXdD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
