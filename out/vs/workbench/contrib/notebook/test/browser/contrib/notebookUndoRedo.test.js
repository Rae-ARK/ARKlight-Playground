import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CellEditType, CellKind, SelectionStateType } from "../../../common/notebookCommon.js";
import { createNotebookCellList, withTestNotebook } from "../testNotebookEditor.js";
suite("Notebook Undo/Redo", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("Basics", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, _accessor) => {
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 0);
        assert.strictEqual(viewModel.getAlternativeId(), "0_0,1;1,1");
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(viewModel.length, 0);
        assert.strictEqual(viewModel.getVersionId(), 1);
        assert.strictEqual(viewModel.getAlternativeId(), "1_");
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 2);
        assert.strictEqual(viewModel.getAlternativeId(), "0_0,1;1,1");
        await viewModel.redo();
        assert.strictEqual(viewModel.length, 0);
        assert.strictEqual(viewModel.getVersionId(), 3);
        assert.strictEqual(viewModel.getAlternativeId(), "1_");
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 0,
          cells: [
            { source: "# header 3", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(viewModel.getVersionId(), 4);
        assert.strictEqual(viewModel.getAlternativeId(), "4_2,1");
        await viewModel.undo();
        assert.strictEqual(viewModel.getVersionId(), 5);
        assert.strictEqual(viewModel.getAlternativeId(), "1_");
      }
    );
  });
  test("Invalid replace count should not throw", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, _viewModel, _ds, _accessor) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.doesNotThrow(() => {
          editor.textModel.applyEdits([{
            editType: CellEditType.Replace,
            index: 0,
            count: 2,
            cells: [
              { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
            ]
          }], true, void 0, () => void 0, void 0, true);
        });
      }
    );
  });
  test("Replace beyond length", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 1,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.deepStrictEqual(viewModel.length, 1);
        await viewModel.undo();
        assert.deepStrictEqual(viewModel.length, 2);
      }
    );
  });
  test("Invalid replace count should not affect undo/redo", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, _accessor) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: [
            { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }], true, void 0, () => void 0, void 0, true);
        assert.deepStrictEqual(viewModel.length, 1);
        await viewModel.undo();
        await viewModel.undo();
        assert.deepStrictEqual(viewModel.length, 2);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 1,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.deepStrictEqual(viewModel.length, 1);
      }
    );
  });
  test("Focus/selection update", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        const cellList = createNotebookCellList(accessor, disposables);
        cellList.attachViewModel(viewModel);
        cellList.setFocus([1]);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 0,
          cells: [
            { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }], true, { focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }], kind: SelectionStateType.Index }, () => {
          return {
            focus: { start: 2, end: 3 },
            selections: [{ start: 2, end: 3 }],
            kind: SelectionStateType.Index
          };
        }, void 0, true);
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.getVersionId(), 1);
        assert.deepStrictEqual(cellList.getFocus(), [2]);
        assert.deepStrictEqual(cellList.getSelection(), [2]);
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 2);
        assert.deepStrictEqual(cellList.getFocus(), [1]);
        assert.deepStrictEqual(cellList.getSelection(), [1]);
        await viewModel.redo();
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.getVersionId(), 3);
        assert.deepStrictEqual(cellList.getFocus(), [2]);
        assert.deepStrictEqual(cellList.getSelection(), [2]);
      }
    );
  });
  test("Batch edits", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 0,
          cells: [
            { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }, {
          editType: CellEditType.Metadata,
          index: 0,
          metadata: { inputCollapsed: false }
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(viewModel.getVersionId(), 1);
        assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, { inputCollapsed: false });
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 2);
        assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, {});
        await viewModel.redo();
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.getVersionId(), 3);
        assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, { inputCollapsed: false });
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9jb250cmliL25vdGVib29rVW5kb1JlZG8udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBDZWxsS2luZCwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZU5vdGVib29rQ2VsbExpc3QsIHdpdGhUZXN0Tm90ZWJvb2sgfSBmcm9tICcuLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2sgVW5kby9SZWRvJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0Jhc2ljcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgX2FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0QWx0ZXJuYXRpdmVJZCgpLCAnMF8wLDE7MSwxJyk7XG5cblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY291bnQ6IDIsIGNlbGxzOiBbXVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0QWx0ZXJuYXRpdmVJZCgpLCAnMV8nKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldEFsdGVybmF0aXZlSWQoKSwgJzBfMCwxOzEsMScpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZWRvKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0QWx0ZXJuYXRpdmVJZCgpLCAnMV8nKTtcblxuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjb3VudDogMCwgY2VsbHM6IFtcblx0XHRcdFx0XHRcdHsgc291cmNlOiAnIyBoZWFkZXIgMycsIGxhbmd1YWdlOiAnbWFya2Rvd24nLCBjZWxsS2luZDogQ2VsbEtpbmQuTWFya3VwLCBvdXRwdXRzOiBbXSwgbWltZTogdW5kZWZpbmVkIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0QWx0ZXJuYXRpdmVJZCgpLCAnNF8yLDEnKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldFZlcnNpb25JZCgpLCA1KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRBbHRlcm5hdGl2ZUlkKCksICcxXycpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ludmFsaWQgcmVwbGFjZSBjb3VudCBzaG91bGQgbm90IHRocm93JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIF92aWV3TW9kZWwsIF9kcywgX2FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAyLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY291bnQ6IDIsIGNlbGxzOiBbXG5cdFx0XHRcdFx0XHRcdHsgc291cmNlOiAnIyBoZWFkZXIgMicsIGxhbmd1YWdlOiAnbWFya2Rvd24nLCBjZWxsS2luZDogQ2VsbEtpbmQuTWFya3VwLCBvdXRwdXRzOiBbXSwgbWltZTogdW5kZWZpbmVkIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlcGxhY2UgYmV5b25kIGxlbmd0aCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDIsIGNlbGxzOiBbXVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnZhbGlkIHJlcGxhY2UgY291bnQgc2hvdWxkIG5vdCBhZmZlY3QgdW5kby9yZWRvJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBfYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY291bnQ6IDIsIGNlbGxzOiBbXVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY291bnQ6IDIsIGNlbGxzOiBbXG5cdFx0XHRcdFx0XHR7IHNvdXJjZTogJyMgaGVhZGVyIDInLCBsYW5ndWFnZTogJ21hcmtkb3duJywgY2VsbEtpbmQ6IENlbGxLaW5kLk1hcmt1cCwgb3V0cHV0czogW10sIG1pbWU6IHVuZGVmaW5lZCB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAyLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDEpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZvY3VzL3NlbGVjdGlvbiB1cGRhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChhY2Nlc3NvciwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0Y2VsbExpc3Quc2V0Rm9jdXMoWzFdKTtcblxuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAyLCBjb3VudDogMCwgY2VsbHM6IFtcblx0XHRcdFx0XHRcdHsgc291cmNlOiAnIyBoZWFkZXIgMicsIGxhbmd1YWdlOiAnbWFya2Rvd24nLCBjZWxsS2luZDogQ2VsbEtpbmQuTWFya3VwLCBvdXRwdXRzOiBbXSwgbWltZTogdW5kZWZpbmVkIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1dLCB0cnVlLCB7IGZvY3VzOiB7IHN0YXJ0OiAxLCBlbmQ6IDIgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDEsIGVuZDogMiB9XSwga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4IH0sICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Zm9jdXM6IHsgc3RhcnQ6IDIsIGVuZDogMyB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMiwgZW5kOiAzIH1dLCBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXhcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEZvY3VzKCksIFsyXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0U2VsZWN0aW9uKCksIFsyXSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldFZlcnNpb25JZCgpLCAyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRGb2N1cygpLCBbMV0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFNlbGVjdGlvbigpLCBbMV0pO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZWRvKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAzKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Rm9jdXMoKSwgWzJdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRTZWxlY3Rpb24oKSwgWzJdKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdCYXRjaCBlZGl0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMiwgY291bnQ6IDAsIGNlbGxzOiBbXG5cdFx0XHRcdFx0XHR7IHNvdXJjZTogJyMgaGVhZGVyIDInLCBsYW5ndWFnZTogJ21hcmtkb3duJywgY2VsbEtpbmQ6IENlbGxLaW5kLk1hcmt1cCwgb3V0cHV0czogW10sIG1pbWU6IHVuZGVmaW5lZCB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSwgaW5kZXg6IDAsIG1ldGFkYXRhOiB7IGlucHV0Q29sbGFwc2VkOiBmYWxzZSB9XG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgwKT8ubWV0YWRhdGEsIHsgaW5wdXRDb2xsYXBzZWQ6IGZhbHNlIH0pO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC51bmRvKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgwKT8ubWV0YWRhdGEsIHt9KTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVkbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMCk/Lm1ldGFkYXRhLCB7IGlucHV0Q29sbGFwc2VkOiBmYWxzZSB9KTtcblxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxjQUFjLFVBQVUsMEJBQTBCO0FBQzNELFNBQVMsd0JBQXdCLHdCQUF3QjtBQUV6RCxNQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyxVQUFVLGlCQUFrQjtBQUNoQyxVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLFFBQVEsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzdDO0FBQUEsTUFDQSxPQUFPLFFBQVEsV0FBVyxLQUFLLGNBQWM7QUFDNUMsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBQzlDLGVBQU8sWUFBWSxVQUFVLGlCQUFpQixHQUFHLFdBQVc7QUFFNUQsZUFBTyxVQUFVLFdBQVcsQ0FBQztBQUFBLFVBQzVCLFVBQVUsYUFBYTtBQUFBLFVBQVMsT0FBTztBQUFBLFVBQUcsT0FBTztBQUFBLFVBQUcsT0FBTyxDQUFDO0FBQUEsUUFDN0QsQ0FBQyxHQUFHLE1BQU0sUUFBVyxNQUFNLFFBQVcsUUFBVyxJQUFJO0FBQ3JELGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUM5QyxlQUFPLFlBQVksVUFBVSxpQkFBaUIsR0FBRyxJQUFJO0FBRXJELGNBQU0sVUFBVSxLQUFLO0FBQ3JCLGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUM5QyxlQUFPLFlBQVksVUFBVSxpQkFBaUIsR0FBRyxXQUFXO0FBRTVELGNBQU0sVUFBVSxLQUFLO0FBQ3JCLGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUM5QyxlQUFPLFlBQVksVUFBVSxpQkFBaUIsR0FBRyxJQUFJO0FBRXJELGVBQU8sVUFBVSxXQUFXLENBQUM7QUFBQSxVQUM1QixVQUFVLGFBQWE7QUFBQSxVQUFTLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxZQUMxRCxFQUFFLFFBQVEsY0FBYyxVQUFVLFlBQVksVUFBVSxTQUFTLFFBQVEsU0FBUyxDQUFDLEdBQUcsTUFBTSxPQUFVO0FBQUEsVUFDdkc7QUFBQSxRQUNELENBQUMsR0FBRyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsSUFBSTtBQUNyRCxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUM5QyxlQUFPLFlBQVksVUFBVSxpQkFBaUIsR0FBRyxPQUFPO0FBRXhELGNBQU0sVUFBVSxLQUFLO0FBQ3JCLGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBQzlDLGVBQU8sWUFBWSxVQUFVLGlCQUFpQixHQUFHLElBQUk7QUFBQSxNQUN0RDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDBDQUEwQyxpQkFBa0I7QUFDaEUsVUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLENBQUMsY0FBYyxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsQ0FBQyxRQUFRLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUM3QztBQUFBLE1BQ0EsT0FBTyxRQUFRLFlBQVksS0FBSyxjQUFjO0FBQzdDLGVBQU8sVUFBVSxXQUFXLENBQUM7QUFBQSxVQUM1QixVQUFVLGFBQWE7QUFBQSxVQUFTLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxVQUFHLE9BQU8sQ0FBQztBQUFBLFFBQzdELENBQUMsR0FBRyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsSUFBSTtBQUVyRCxlQUFPLGFBQWEsTUFBTTtBQUN6QixpQkFBTyxVQUFVLFdBQVcsQ0FBQztBQUFBLFlBQzVCLFVBQVUsYUFBYTtBQUFBLFlBQVMsT0FBTztBQUFBLFlBQUcsT0FBTztBQUFBLFlBQUcsT0FBTztBQUFBLGNBQzFELEVBQUUsUUFBUSxjQUFjLFVBQVUsWUFBWSxVQUFVLFNBQVMsUUFBUSxTQUFTLENBQUMsR0FBRyxNQUFNLE9BQVU7QUFBQSxZQUN2RztBQUFBLFVBQ0QsQ0FBQyxHQUFHLE1BQU0sUUFBVyxNQUFNLFFBQVcsUUFBVyxJQUFJO0FBQUEsUUFDdEQsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx5QkFBeUIsaUJBQWtCO0FBQy9DLFVBQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxDQUFDLGNBQWMsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsUUFBUSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDN0M7QUFBQSxNQUNBLE9BQU8sUUFBUSxjQUFjO0FBQzVCLGVBQU8sVUFBVSxXQUFXLENBQUM7QUFBQSxVQUM1QixVQUFVLGFBQWE7QUFBQSxVQUFTLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxVQUFHLE9BQU8sQ0FBQztBQUFBLFFBQzdELENBQUMsR0FBRyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsSUFBSTtBQUVyRCxlQUFPLGdCQUFnQixVQUFVLFFBQVEsQ0FBQztBQUMxQyxjQUFNLFVBQVUsS0FBSztBQUNyQixlQUFPLGdCQUFnQixVQUFVLFFBQVEsQ0FBQztBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscURBQXFELGlCQUFrQjtBQUMzRSxVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLFFBQVEsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzdDO0FBQUEsTUFDQSxPQUFPLFFBQVEsV0FBVyxLQUFLLGNBQWM7QUFDNUMsZUFBTyxVQUFVLFdBQVcsQ0FBQztBQUFBLFVBQzVCLFVBQVUsYUFBYTtBQUFBLFVBQVMsT0FBTztBQUFBLFVBQUcsT0FBTztBQUFBLFVBQUcsT0FBTyxDQUFDO0FBQUEsUUFDN0QsQ0FBQyxHQUFHLE1BQU0sUUFBVyxNQUFNLFFBQVcsUUFBVyxJQUFJO0FBRXJELGVBQU8sVUFBVSxXQUFXLENBQUM7QUFBQSxVQUM1QixVQUFVLGFBQWE7QUFBQSxVQUFTLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxZQUMxRCxFQUFFLFFBQVEsY0FBYyxVQUFVLFlBQVksVUFBVSxTQUFTLFFBQVEsU0FBUyxDQUFDLEdBQUcsTUFBTSxPQUFVO0FBQUEsVUFDdkc7QUFBQSxRQUNELENBQUMsR0FBRyxNQUFNLFFBQVcsTUFBTSxRQUFXLFFBQVcsSUFBSTtBQUVyRCxlQUFPLGdCQUFnQixVQUFVLFFBQVEsQ0FBQztBQUUxQyxjQUFNLFVBQVUsS0FBSztBQUNyQixjQUFNLFVBQVUsS0FBSztBQUVyQixlQUFPLGdCQUFnQixVQUFVLFFBQVEsQ0FBQztBQUMxQyxlQUFPLFVBQVUsV0FBVyxDQUFDO0FBQUEsVUFDNUIsVUFBVSxhQUFhO0FBQUEsVUFBUyxPQUFPO0FBQUEsVUFBRyxPQUFPO0FBQUEsVUFBRyxPQUFPLENBQUM7QUFBQSxRQUM3RCxDQUFDLEdBQUcsTUFBTSxRQUFXLE1BQU0sUUFBVyxRQUFXLElBQUk7QUFDckQsZUFBTyxnQkFBZ0IsVUFBVSxRQUFRLENBQUM7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDBCQUEwQixpQkFBa0I7QUFDaEQsVUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLENBQUMsY0FBYyxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsQ0FBQyxRQUFRLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUM3QztBQUFBLE1BQ0EsT0FBTyxRQUFRLFdBQVcsS0FBSyxhQUFhO0FBQzNDLGNBQU0sV0FBVyx1QkFBdUIsVUFBVSxXQUFXO0FBQzdELGlCQUFTLGdCQUFnQixTQUFTO0FBQ2xDLGlCQUFTLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFFckIsZUFBTyxVQUFVLFdBQVcsQ0FBQztBQUFBLFVBQzVCLFVBQVUsYUFBYTtBQUFBLFVBQVMsT0FBTztBQUFBLFVBQUcsT0FBTztBQUFBLFVBQUcsT0FBTztBQUFBLFlBQzFELEVBQUUsUUFBUSxjQUFjLFVBQVUsWUFBWSxVQUFVLFNBQVMsUUFBUSxTQUFTLENBQUMsR0FBRyxNQUFNLE9BQVU7QUFBQSxVQUN2RztBQUFBLFFBQ0QsQ0FBQyxHQUFHLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxHQUFHLFlBQVksQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLE1BQU0sbUJBQW1CLE1BQU0sR0FBRyxNQUFNO0FBQ3BILGlCQUFPO0FBQUEsWUFDTixPQUFPLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRTtBQUFBLFlBQUcsWUFBWSxDQUFDLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQUEsWUFBRyxNQUFNLG1CQUFtQjtBQUFBLFVBQzNGO0FBQUEsUUFDRCxHQUFHLFFBQVcsSUFBSTtBQUNsQixlQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFDdEMsZUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLENBQUM7QUFDOUMsZUFBTyxnQkFBZ0IsU0FBUyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDL0MsZUFBTyxnQkFBZ0IsU0FBUyxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFbkQsY0FBTSxVQUFVLEtBQUs7QUFDckIsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBQzlDLGVBQU8sZ0JBQWdCLFNBQVMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQy9DLGVBQU8sZ0JBQWdCLFNBQVMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRW5ELGNBQU0sVUFBVSxLQUFLO0FBQ3JCLGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUM5QyxlQUFPLGdCQUFnQixTQUFTLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMvQyxlQUFPLGdCQUFnQixTQUFTLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3BEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssZUFBZSxpQkFBa0I7QUFDckMsVUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLENBQUMsY0FBYyxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsQ0FBQyxRQUFRLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUM3QztBQUFBLE1BQ0EsT0FBTyxRQUFRLFdBQVcsS0FBSyxhQUFhO0FBQzNDLGVBQU8sVUFBVSxXQUFXLENBQUM7QUFBQSxVQUM1QixVQUFVLGFBQWE7QUFBQSxVQUFTLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxVQUFHLE9BQU87QUFBQSxZQUMxRCxFQUFFLFFBQVEsY0FBYyxVQUFVLFlBQVksVUFBVSxTQUFTLFFBQVEsU0FBUyxDQUFDLEdBQUcsTUFBTSxPQUFVO0FBQUEsVUFDdkc7QUFBQSxRQUNELEdBQUc7QUFBQSxVQUNGLFVBQVUsYUFBYTtBQUFBLFVBQVUsT0FBTztBQUFBLFVBQUcsVUFBVSxFQUFFLGdCQUFnQixNQUFNO0FBQUEsUUFDOUUsQ0FBQyxHQUFHLE1BQU0sUUFBVyxNQUFNLFFBQVcsUUFBVyxJQUFJO0FBQ3JELGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBQzlDLGVBQU8sZ0JBQWdCLFVBQVUsT0FBTyxDQUFDLEdBQUcsVUFBVSxFQUFFLGdCQUFnQixNQUFNLENBQUM7QUFFL0UsY0FBTSxVQUFVLEtBQUs7QUFDckIsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBQzlDLGVBQU8sZ0JBQWdCLFVBQVUsT0FBTyxDQUFDLEdBQUcsVUFBVSxDQUFDLENBQUM7QUFFeEQsY0FBTSxVQUFVLEtBQUs7QUFDckIsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBQzlDLGVBQU8sZ0JBQWdCLFVBQVUsT0FBTyxDQUFDLEdBQUcsVUFBVSxFQUFFLGdCQUFnQixNQUFNLENBQUM7QUFBQSxNQUVoRjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
