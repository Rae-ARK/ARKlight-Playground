import assert from "assert";
import { mock } from "../../../../../../base/test/common/mock.js";
import { NotebookClipboardContribution, runCopyCells, runCutCells } from "../../../browser/contrib/clipboard/notebookClipboard.js";
import { CellKind, NOTEBOOK_EDITOR_ID, SelectionStateType } from "../../../common/notebookCommon.js";
import { withTestNotebook } from "../testNotebookEditor.js";
import { INotebookService } from "../../../common/notebookService.js";
import { FoldingModel, updateFoldingStateAtIndex } from "../../../browser/viewModel/foldingModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("Notebook Clipboard", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const createEditorService = (editor) => {
    const visibleEditorPane = new class extends mock() {
      getId() {
        return NOTEBOOK_EDITOR_ID;
      }
      getControl() {
        return editor;
      }
    }();
    const editorService = new class extends mock() {
      get activeEditorPane() {
        return visibleEditorPane;
      }
    }();
    return editorService;
  };
  test.skip("Cut multiple selected cells", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 2 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(clipboardContrib.runCutAction(accessor));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.strictEqual(viewModel.length, 1);
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "paragraph 2");
      }
    );
  });
  test.skip("Cut should take folding info into account", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3", "javascript", CellKind.Markup, [], {}],
        ["# header d", "markdown", CellKind.Markup, [], {}],
        ["var e = 4;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        const foldingModel = new FoldingModel();
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        editor.setHiddenAreas(viewModel.getHiddenRanges());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }, "model");
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        clipboardContrib.runCutAction(accessor);
        assert.strictEqual(viewModel.length, 5);
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 7);
      }
    );
  });
  test.skip("Copy should take folding info into account", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3", "javascript", CellKind.Markup, [], {}],
        ["# header d", "markdown", CellKind.Markup, [], {}],
        ["var e = 4;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        const foldingModel = new FoldingModel();
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        editor.setHiddenAreas(viewModel.getHiddenRanges());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }, "model");
        let _cells = [];
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy(cells) {
            _cells = cells;
          }
          getToCopy() {
            return { items: _cells, isCopy: true };
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        clipboardContrib.runCopyAction(accessor);
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 6, end: 7 }, selections: [{ start: 6, end: 7 }] }, "model");
        clipboardContrib.runPasteAction(accessor);
        assert.strictEqual(viewModel.length, 9);
        assert.strictEqual(viewModel.cellAt(8)?.getText(), "var b = 1;");
      }
    );
  });
  test.skip("#119773, cut last item should not focus on the top first cell", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, "model");
        assert.ok(clipboardContrib.runCutAction(accessor));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
      }
    );
  });
  test.skip("#119771, undo paste should restore selections", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return {
              items: [
                viewModel.cellAt(0).model
              ],
              isCopy: true
            };
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, "model");
        assert.ok(clipboardContrib.runPasteAction(accessor));
        assert.strictEqual(viewModel.length, 4);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 3, end: 4 });
        assert.strictEqual(viewModel.cellAt(3)?.getText(), "# header 1");
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
      }
    );
  });
  test("copy cell from ui still works if the target cell is not part of a selection", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        let _toCopy = [];
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy(toCopy) {
            _toCopy = toCopy;
          }
          getToCopy() {
            return {
              items: _toCopy,
              isCopy: true
            };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(runCopyCells(accessor, editor, viewModel.cellAt(0)));
        assert.deepStrictEqual(_toCopy, [viewModel.cellAt(0).model, viewModel.cellAt(1).model]);
        assert.ok(runCopyCells(accessor, editor, viewModel.cellAt(2)));
        assert.deepStrictEqual(_toCopy.length, 1);
        assert.deepStrictEqual(_toCopy, [viewModel.cellAt(2).model]);
      }
    );
  });
  test("cut cell from ui still works if the target cell is not part of a selection", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 3", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return { items: [], isCopy: true };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(runCutCells(accessor, editor, viewModel.cellAt(0)));
        assert.strictEqual(viewModel.length, 2);
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 4);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 2 }]);
        assert.ok(runCutCells(accessor, editor, viewModel.cellAt(2)));
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "# header 1");
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "paragraph 1");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "paragraph 3");
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 4);
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 4 }] }, "model");
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
        assert.ok(runCutCells(accessor, editor, viewModel.cellAt(0)));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
      }
    );
  });
  test("cut focus cell still works if the focus is not part of any selection", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 3", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return { items: [], isCopy: true };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 2, end: 4 }] }, "model");
        assert.ok(runCutCells(accessor, editor, void 0));
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
      }
    );
  });
  test("cut focus cell still works if the focus is not part of any selection 2", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 3", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return { items: [], isCopy: true };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(runCutCells(accessor, editor, void 0));
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 2 }]);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9jb250cmliL25vdGVib29rQ2xpcGJvYXJkLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2xpcGJvYXJkQ29udHJpYnV0aW9uLCBydW5Db3B5Q2VsbHMsIHJ1bkN1dENlbGxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb250cmliL2NsaXBib2FyZC9ub3RlYm9va0NsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgTk9URUJPT0tfRURJVE9SX0lELCBTZWxlY3Rpb25TdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4uL3Rlc3ROb3RlYm9va0VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IElWaXNpYmxlRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRm9sZGluZ01vZGVsLCB1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvZm9sZGluZ01vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdOb3RlYm9vayBDbGlwYm9hcmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNyZWF0ZUVkaXRvclNlcnZpY2UgPSAoZWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IpID0+IHtcblx0XHRjb25zdCB2aXNpYmxlRWRpdG9yUGFuZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpc2libGVFZGl0b3JQYW5lPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldElkKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBOT1RFQk9PS19FRElUT1JfSUQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRDb250cm9sKCk6IElOb3RlYm9va0VkaXRvciB7XG5cdFx0XHRcdHJldHVybiBlZGl0b3I7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXQgYWN0aXZlRWRpdG9yUGFuZSgpOiBJVmlzaWJsZUVkaXRvclBhbmUgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdmlzaWJsZUVkaXRvclBhbmU7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlO1xuXHR9O1xuXG5cdHRlc3Quc2tpcCgnQ3V0IG11bHRpcGxlIHNlbGVjdGVkIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkgeyBvdmVycmlkZSBzZXRUb0NvcHkoKSB7IH0gfSk7XG5cblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkQ29udHJpYiA9IG5ldyBOb3RlYm9va0NsaXBib2FyZENvbnRyaWJ1dGlvbihjcmVhdGVFZGl0b3JTZXJ2aWNlKGVkaXRvcikpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAwLCBlbmQ6IDIgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSB9LCAnbW9kZWwnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGNsaXBib2FyZENvbnRyaWIucnVuQ3V0QWN0aW9uKGFjY2Vzc29yKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgwKT8uZ2V0VGV4dCgpLCAncGFyYWdyYXBoIDInKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ0N1dCBzaG91bGQgdGFrZSBmb2xkaW5nIGluZm8gaW50byBhY2NvdW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBkJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBlID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwoKTtcblx0XHRcdFx0Zm9sZGluZ01vZGVsLmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAwLCB0cnVlKTtcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cdFx0XHRcdGVkaXRvci5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCkpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0gfSwgJ21vZGVsJyk7XG5cblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkgeyBvdmVycmlkZSBzZXRUb0NvcHkoKSB7IH0gfSk7XG5cblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkQ29udHJpYiA9IG5ldyBOb3RlYm9va0NsaXBib2FyZENvbnRyaWJ1dGlvbihjcmVhdGVFZGl0b3JTZXJ2aWNlKGVkaXRvcikpO1xuXHRcdFx0XHRjbGlwYm9hcmRDb250cmliLnJ1bkN1dEFjdGlvbihhY2Nlc3Nvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCA1KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDcpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnQ29weSBzaG91bGQgdGFrZSBmb2xkaW5nIGluZm8gaW50byBhY2NvdW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBkJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBlID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwoKTtcblx0XHRcdFx0Zm9sZGluZ01vZGVsLmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAwLCB0cnVlKTtcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cdFx0XHRcdGVkaXRvci5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCkpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0gfSwgJ21vZGVsJyk7XG5cblx0XHRcdFx0bGV0IF9jZWxsczogTm90ZWJvb2tDZWxsVGV4dE1vZGVsW10gPSBbXTtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHNldFRvQ29weShjZWxsczogTm90ZWJvb2tDZWxsVGV4dE1vZGVsW10pIHsgX2NlbGxzID0gY2VsbHM7IH1cblx0XHRcdFx0XHRvdmVycmlkZSBnZXRUb0NvcHkoKSB7IHJldHVybiB7IGl0ZW1zOiBfY2VsbHMsIGlzQ29weTogdHJ1ZSB9OyB9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZENvbnRyaWIgPSBuZXcgTm90ZWJvb2tDbGlwYm9hcmRDb250cmlidXRpb24oY3JlYXRlRWRpdG9yU2VydmljZShlZGl0b3IpKTtcblx0XHRcdFx0Y2xpcGJvYXJkQ29udHJpYi5ydW5Db3B5QWN0aW9uKGFjY2Vzc29yKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDYsIGVuZDogNyB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogNiwgZW5kOiA3IH1dIH0sICdtb2RlbCcpO1xuXHRcdFx0XHRjbGlwYm9hcmRDb250cmliLnJ1blBhc3RlQWN0aW9uKGFjY2Vzc29yKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgOSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDgpPy5nZXRUZXh0KCksICd2YXIgYiA9IDE7Jyk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCcjMTE5NzczLCBjdXQgbGFzdCBpdGVtIHNob3VsZCBub3QgZm9jdXMgb24gdGhlIHRvcCBmaXJzdCBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkgeyBvdmVycmlkZSBzZXRUb0NvcHkoKSB7IH0gfSk7XG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZENvbnRyaWIgPSBuZXcgTm90ZWJvb2tDbGlwYm9hcmRDb250cmlidXRpb24oY3JlYXRlRWRpdG9yU2VydmljZShlZGl0b3IpKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMiwgZW5kOiAzIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAyLCBlbmQ6IDMgfV0gfSwgJ21vZGVsJyk7XG5cdFx0XHRcdGFzc2VydC5vayhjbGlwYm9hcmRDb250cmliLnJ1bkN1dEFjdGlvbihhY2Nlc3NvcikpO1xuXHRcdFx0XHQvLyBpdCBzaG91bGQgYmUgdGhlIGxhc3QgY2VsbCwgb3RoZXIgdGhhbiB0aGUgZmlyc3Qgb25lLlxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAxLCBlbmQ6IDIgfSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCcjMTE5NzcxLCB1bmRvIHBhc3RlIHNob3VsZCByZXN0b3JlIHNlbGVjdGlvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5zdHViKElOb3RlYm9va1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgc2V0VG9Db3B5KCkgeyB9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9Db3B5KCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0XHR2aWV3TW9kZWwuY2VsbEF0KDApIS5tb2RlbFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRpc0NvcHk6IHRydWVcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjbGlwYm9hcmRDb250cmliID0gbmV3IE5vdGVib29rQ2xpcGJvYXJkQ29udHJpYnV0aW9uKGNyZWF0ZUVkaXRvclNlcnZpY2UoZWRpdG9yKSk7XG5cblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDIsIGVuZDogMyB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMiwgZW5kOiAzIH1dIH0sICdtb2RlbCcpO1xuXHRcdFx0XHRhc3NlcnQub2soY2xpcGJvYXJkQ29udHJpYi5ydW5QYXN0ZUFjdGlvbihhY2Nlc3NvcikpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCA0KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMywgZW5kOiA0IH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgzKT8uZ2V0VGV4dCgpLCAnIyBoZWFkZXIgMScpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDIsIGVuZDogMyB9KTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IGNlbGwgZnJvbSB1aSBzdGlsbCB3b3JrcyBpZiB0aGUgdGFyZ2V0IGNlbGwgaXMgbm90IHBhcnQgb2YgYSBzZWxlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRsZXQgX3RvQ29weTogTm90ZWJvb2tDZWxsVGV4dE1vZGVsW10gPSBbXTtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHNldFRvQ29weSh0b0NvcHk6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdKSB7IF90b0NvcHkgPSB0b0NvcHk7IH1cblx0XHRcdFx0XHRvdmVycmlkZSBnZXRUb0NvcHkoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRpdGVtczogX3RvQ29weSxcblx0XHRcdFx0XHRcdFx0aXNDb3B5OiB0cnVlXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDAsIGVuZDogMSB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAyIH1dIH0sICdtb2RlbCcpO1xuXHRcdFx0XHRhc3NlcnQub2socnVuQ29weUNlbGxzKGFjY2Vzc29yLCBlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMCkpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChfdG9Db3B5LCBbdmlld01vZGVsLmNlbGxBdCgwKSEubW9kZWwsIHZpZXdNb2RlbC5jZWxsQXQoMSkhLm1vZGVsXSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKHJ1bkNvcHlDZWxscyhhY2Nlc3NvciwgZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KDIpKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoX3RvQ29weS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKF90b0NvcHksIFt2aWV3TW9kZWwuY2VsbEF0KDIpIS5tb2RlbF0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1dCBjZWxsIGZyb20gdWkgc3RpbGwgd29ya3MgaWYgdGhlIHRhcmdldCBjZWxsIGlzIG5vdCBwYXJ0IG9mIGEgc2VsZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHNldFRvQ29weSgpIHsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIGdldFRvQ29weSgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSwgaXNDb3B5OiB0cnVlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDIgfV0gfSwgJ21vZGVsJyk7XG5cdFx0XHRcdGFzc2VydC5vayhydW5DdXRDZWxscyhhY2Nlc3NvciwgZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KDApKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBbeyBzdGFydDogMCwgZW5kOiAyIH1dKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJ1bkN1dENlbGxzKGFjY2Vzc29yLCBlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMikpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDApPy5nZXRUZXh0KCksICcjIGhlYWRlciAxJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDEpPy5nZXRUZXh0KCksICdwYXJhZ3JhcGggMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgyKT8uZ2V0VGV4dCgpLCAncGFyYWdyYXBoIDMnKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgNCk7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAyLCBlbmQ6IDMgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDIsIGVuZDogNCB9XSB9LCAnbW9kZWwnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMiwgZW5kOiAzIH0pO1xuXHRcdFx0XHRhc3NlcnQub2socnVuQ3V0Q2VsbHMoYWNjZXNzb3IsIGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgwKSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAxLCBlbmQ6IDIgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDEsIGVuZDogMyB9XSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3V0IGZvY3VzIGNlbGwgc3RpbGwgd29ya3MgaWYgdGhlIGZvY3VzIGlzIG5vdCBwYXJ0IG9mIGFueSBzZWxlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAzJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5zdHViKElOb3RlYm9va1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgc2V0VG9Db3B5KCkgeyB9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9Db3B5KCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgaXRlbXM6IFtdLCBpc0NvcHk6IHRydWUgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDIsIGVuZDogNCB9XSB9LCAnbW9kZWwnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJ1bkN1dENlbGxzKGFjY2Vzc29yLCBlZGl0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBbeyBzdGFydDogMSwgZW5kOiAzIH1dKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXQgZm9jdXMgY2VsbCBzdGlsbCB3b3JrcyBpZiB0aGUgZm9jdXMgaXMgbm90IHBhcnQgb2YgYW55IHNlbGVjdGlvbiAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHNldFRvQ29weSgpIHsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIGdldFRvQ29weSgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSwgaXNDb3B5OiB0cnVlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMywgZW5kOiA0IH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDIgfV0gfSwgJ21vZGVsJyk7XG5cdFx0XHRcdGFzc2VydC5vayhydW5DdXRDZWxscyhhY2Nlc3NvciwgZWRpdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAyLCBlbmQ6IDMgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSk7XG5cdFx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQkFBK0IsY0FBYyxtQkFBbUI7QUFDekUsU0FBUyxVQUFVLG9CQUFvQiwwQkFBMEI7QUFDakUsU0FBUyx3QkFBd0I7QUFJakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxjQUFjLGlDQUFpQztBQUV4RCxTQUFTLCtDQUErQztBQUV4RCxNQUFNLHNCQUFzQixNQUFNO0FBQ2pDLDBDQUF3QztBQUV4QyxRQUFNLHNCQUFzQixDQUFDLFdBQWtDO0FBQzlELFVBQU0sb0JBQW9CLElBQUksY0FBYyxLQUF5QixFQUFFO0FBQUEsTUFDN0QsUUFBZ0I7QUFDeEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNTLGFBQThCO0FBQ3RDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFVBQU0sZ0JBQWdDLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsTUFDOUUsSUFBYSxtQkFBbUQ7QUFDL0QsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFFQSxPQUFLLEtBQUssK0JBQStCLGlCQUFrQjtBQUMxRCxVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGVBQWUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ25ELENBQUMsZUFBZSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLE9BQU8sUUFBUSxXQUFXLEtBQUssYUFBYTtBQUMzQyxpQkFBUyxLQUFLLGtCQUFrQixJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLFVBQVcsWUFBWTtBQUFBLFVBQUU7QUFBQSxRQUFFLEdBQUM7QUFFdkcsY0FBTSxtQkFBbUIsSUFBSSw4QkFBOEIsb0JBQW9CLE1BQU0sQ0FBQztBQUV0RixrQkFBVSxzQkFBc0IsRUFBRSxNQUFNLG1CQUFtQixPQUFPLE9BQU8sRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLEdBQUcsWUFBWSxDQUFDLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxPQUFPO0FBQzVJLGVBQU8sR0FBRyxpQkFBaUIsYUFBYSxRQUFRLENBQUM7QUFDakQsZUFBTyxnQkFBZ0IsVUFBVSxTQUFTLEdBQUcsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDakUsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGVBQU8sWUFBWSxVQUFVLE9BQU8sQ0FBQyxHQUFHLFFBQVEsR0FBRyxhQUFhO0FBQUEsTUFDakU7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxLQUFLLDZDQUE2QyxpQkFBa0I7QUFDeEUsVUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLENBQUMsY0FBYyxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsQ0FBQyxjQUFjLGNBQWMsU0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGNBQWMsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsQ0FBQyxhQUFhLGNBQWMsU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNuRCxDQUFDLGNBQWMsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbkQ7QUFBQSxNQUNBLE9BQU8sUUFBUSxXQUFXLEtBQUssYUFBYTtBQUMzQyxjQUFNLGVBQWUsSUFBSSxhQUFhO0FBQ3RDLHFCQUFhLGdCQUFnQixTQUFTO0FBRXRDLGtDQUEwQixjQUFjLEdBQUcsSUFBSTtBQUMvQyxrQ0FBMEIsY0FBYyxHQUFHLElBQUk7QUFDL0Msa0JBQVUsb0JBQW9CLGFBQWEsT0FBTztBQUNsRCxlQUFPLGVBQWUsVUFBVSxnQkFBZ0IsQ0FBQztBQUNqRCxrQkFBVSxzQkFBc0IsRUFBRSxNQUFNLG1CQUFtQixPQUFPLE9BQU8sRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLEdBQUcsWUFBWSxDQUFDLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxPQUFPO0FBRTVJLGlCQUFTLEtBQUssa0JBQWtCLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsVUFBVyxZQUFZO0FBQUEsVUFBRTtBQUFBLFFBQUUsR0FBQztBQUV2RyxjQUFNLG1CQUFtQixJQUFJLDhCQUE4QixvQkFBb0IsTUFBTSxDQUFDO0FBQ3RGLHlCQUFpQixhQUFhLFFBQVE7QUFDdEMsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGNBQU0sVUFBVSxLQUFLO0FBQ3JCLGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUFBLE1BQ3ZDO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssS0FBSyw4Q0FBOEMsaUJBQWtCO0FBQ3pFLFVBQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxDQUFDLGNBQWMsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsYUFBYSxjQUFjLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbkQsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ25EO0FBQUEsTUFDQSxPQUFPLFFBQVEsV0FBVyxLQUFLLGFBQWE7QUFDM0MsY0FBTSxlQUFlLElBQUksYUFBYTtBQUN0QyxxQkFBYSxnQkFBZ0IsU0FBUztBQUV0QyxrQ0FBMEIsY0FBYyxHQUFHLElBQUk7QUFDL0Msa0NBQTBCLGNBQWMsR0FBRyxJQUFJO0FBQy9DLGtCQUFVLG9CQUFvQixhQUFhLE9BQU87QUFDbEQsZUFBTyxlQUFlLFVBQVUsZ0JBQWdCLENBQUM7QUFDakQsa0JBQVUsc0JBQXNCLEVBQUUsTUFBTSxtQkFBbUIsT0FBTyxPQUFPLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxHQUFHLFlBQVksQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsT0FBTztBQUU1SSxZQUFJLFNBQWtDLENBQUM7QUFDdkMsaUJBQVMsS0FBSyxrQkFBa0IsSUFBSSxjQUFjLEtBQXVCLEVBQUU7QUFBQSxVQUNqRSxVQUFVLE9BQWdDO0FBQUUscUJBQVM7QUFBQSxVQUFPO0FBQUEsVUFDNUQsWUFBWTtBQUFFLG1CQUFPLEVBQUUsT0FBTyxRQUFRLFFBQVEsS0FBSztBQUFBLFVBQUc7QUFBQSxRQUNoRSxHQUFDO0FBRUQsY0FBTSxtQkFBbUIsSUFBSSw4QkFBOEIsb0JBQW9CLE1BQU0sQ0FBQztBQUN0Rix5QkFBaUIsY0FBYyxRQUFRO0FBQ3ZDLGtCQUFVLHNCQUFzQixFQUFFLE1BQU0sbUJBQW1CLE9BQU8sT0FBTyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxZQUFZLENBQUMsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLE9BQU87QUFDNUkseUJBQWlCLGVBQWUsUUFBUTtBQUV4QyxlQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFDdEMsZUFBTyxZQUFZLFVBQVUsT0FBTyxDQUFDLEdBQUcsUUFBUSxHQUFHLFlBQVk7QUFBQSxNQUNoRTtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLEtBQUssaUVBQWlFLGlCQUFrQjtBQUM1RixVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGVBQWUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ25ELENBQUMsZUFBZSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLE9BQU8sUUFBUSxXQUFXLEtBQUssYUFBYTtBQUMzQyxpQkFBUyxLQUFLLGtCQUFrQixJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLFVBQVcsWUFBWTtBQUFBLFVBQUU7QUFBQSxRQUFFLEdBQUM7QUFDdkcsY0FBTSxtQkFBbUIsSUFBSSw4QkFBOEIsb0JBQW9CLE1BQU0sQ0FBQztBQUV0RixrQkFBVSxzQkFBc0IsRUFBRSxNQUFNLG1CQUFtQixPQUFPLE9BQU8sRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLEdBQUcsWUFBWSxDQUFDLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxPQUFPO0FBQzVJLGVBQU8sR0FBRyxpQkFBaUIsYUFBYSxRQUFRLENBQUM7QUFFakQsZUFBTyxnQkFBZ0IsVUFBVSxTQUFTLEdBQUcsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFBQSxNQUNsRTtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLEtBQUssaURBQWlELGlCQUFrQjtBQUM1RSxVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGVBQWUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ25ELENBQUMsZUFBZSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLE9BQU8sUUFBUSxXQUFXLEtBQUssYUFBYTtBQUMzQyxpQkFBUyxLQUFLLGtCQUFrQixJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLFVBQ2pFLFlBQVk7QUFBQSxVQUFFO0FBQUEsVUFDZCxZQUFZO0FBQ3BCLG1CQUFPO0FBQUEsY0FDTixPQUFPO0FBQUEsZ0JBQ04sVUFBVSxPQUFPLENBQUMsRUFBRztBQUFBLGNBQ3RCO0FBQUEsY0FDQSxRQUFRO0FBQUEsWUFDVDtBQUFBLFVBQ0Q7QUFBQSxRQUNELEdBQUM7QUFFRCxjQUFNLG1CQUFtQixJQUFJLDhCQUE4QixvQkFBb0IsTUFBTSxDQUFDO0FBRXRGLGtCQUFVLHNCQUFzQixFQUFFLE1BQU0sbUJBQW1CLE9BQU8sT0FBTyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxZQUFZLENBQUMsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLE9BQU87QUFDNUksZUFBTyxHQUFHLGlCQUFpQixlQUFlLFFBQVEsQ0FBQztBQUVuRCxlQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFDdEMsZUFBTyxnQkFBZ0IsVUFBVSxTQUFTLEdBQUcsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDakUsZUFBTyxZQUFZLFVBQVUsT0FBTyxDQUFDLEdBQUcsUUFBUSxHQUFHLFlBQVk7QUFDL0QsY0FBTSxVQUFVLEtBQUs7QUFDckIsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGVBQU8sZ0JBQWdCLFVBQVUsU0FBUyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQUEsTUFDbEU7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsWUFBWTtBQUMvRixVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGVBQWUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ25ELENBQUMsZUFBZSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLE9BQU8sUUFBUSxXQUFXLEtBQUssYUFBYTtBQUMzQyxZQUFJLFVBQW1DLENBQUM7QUFDeEMsaUJBQVMsS0FBSyxrQkFBa0IsSUFBSSxjQUFjLEtBQXVCLEVBQUU7QUFBQSxVQUNqRSxVQUFVLFFBQWlDO0FBQUUsc0JBQVU7QUFBQSxVQUFRO0FBQUEsVUFDL0QsWUFBWTtBQUNwQixtQkFBTztBQUFBLGNBQ04sT0FBTztBQUFBLGNBQ1AsUUFBUTtBQUFBLFlBQ1Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxHQUFDO0FBRUQsa0JBQVUsc0JBQXNCLEVBQUUsTUFBTSxtQkFBbUIsT0FBTyxPQUFPLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxHQUFHLFlBQVksQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsT0FBTztBQUM1SSxlQUFPLEdBQUcsYUFBYSxVQUFVLFFBQVEsVUFBVSxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQzdELGVBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxVQUFVLE9BQU8sQ0FBQyxFQUFHLE9BQU8sVUFBVSxPQUFPLENBQUMsRUFBRyxLQUFLLENBQUM7QUFFeEYsZUFBTyxHQUFHLGFBQWEsVUFBVSxRQUFRLFVBQVUsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUM3RCxlQUFPLGdCQUFnQixRQUFRLFFBQVEsQ0FBQztBQUN4QyxlQUFPLGdCQUFnQixTQUFTLENBQUMsVUFBVSxPQUFPLENBQUMsRUFBRyxLQUFLLENBQUM7QUFBQSxNQUM3RDtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLDhFQUE4RSxZQUFZO0FBQzlGLFVBQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxDQUFDLGNBQWMsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsZUFBZSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbkQsQ0FBQyxlQUFlLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNuRCxDQUFDLGVBQWUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3BEO0FBQUEsTUFDQSxPQUFPLFFBQVEsV0FBVyxLQUFLLGFBQWE7QUFDM0MsaUJBQVMsS0FBSyxrQkFBa0IsSUFBSSxjQUFjLEtBQXVCLEVBQUU7QUFBQSxVQUNqRSxZQUFZO0FBQUEsVUFBRTtBQUFBLFVBQ2QsWUFBWTtBQUNwQixtQkFBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLFFBQVEsS0FBSztBQUFBLFVBQ2xDO0FBQUEsUUFDRCxHQUFDO0FBRUQsa0JBQVUsc0JBQXNCLEVBQUUsTUFBTSxtQkFBbUIsT0FBTyxPQUFPLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxHQUFHLFlBQVksQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsT0FBTztBQUM1SSxlQUFPLEdBQUcsWUFBWSxVQUFVLFFBQVEsVUFBVSxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQzVELGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxjQUFNLFVBQVUsS0FBSztBQUNyQixlQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFFdEMsZUFBTyxnQkFBZ0IsVUFBVSxTQUFTLEdBQUcsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDakUsZUFBTyxnQkFBZ0IsVUFBVSxjQUFjLEdBQUcsQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQ3hFLGVBQU8sR0FBRyxZQUFZLFVBQVUsUUFBUSxVQUFVLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDNUQsZUFBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLGVBQU8sZ0JBQWdCLFVBQVUsU0FBUyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ2pFLGVBQU8sWUFBWSxVQUFVLE9BQU8sQ0FBQyxHQUFHLFFBQVEsR0FBRyxZQUFZO0FBQy9ELGVBQU8sWUFBWSxVQUFVLE9BQU8sQ0FBQyxHQUFHLFFBQVEsR0FBRyxhQUFhO0FBQ2hFLGVBQU8sWUFBWSxVQUFVLE9BQU8sQ0FBQyxHQUFHLFFBQVEsR0FBRyxhQUFhO0FBRWhFLGNBQU0sVUFBVSxLQUFLO0FBQ3JCLGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxrQkFBVSxzQkFBc0IsRUFBRSxNQUFNLG1CQUFtQixPQUFPLE9BQU8sRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLEdBQUcsWUFBWSxDQUFDLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxPQUFPO0FBQzVJLGVBQU8sZ0JBQWdCLFVBQVUsU0FBUyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ2pFLGVBQU8sR0FBRyxZQUFZLFVBQVUsUUFBUSxVQUFVLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDNUQsZUFBTyxnQkFBZ0IsVUFBVSxTQUFTLEdBQUcsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDakUsZUFBTyxnQkFBZ0IsVUFBVSxjQUFjLEdBQUcsQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDekU7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyx3RUFBd0UsWUFBWTtBQUN4RixVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGVBQWUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ25ELENBQUMsZUFBZSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbkQsQ0FBQyxlQUFlLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRDtBQUFBLE1BQ0EsT0FBTyxRQUFRLFdBQVcsS0FBSyxhQUFhO0FBQzNDLGlCQUFTLEtBQUssa0JBQWtCLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsVUFDakUsWUFBWTtBQUFBLFVBQUU7QUFBQSxVQUNkLFlBQVk7QUFDcEIsbUJBQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxRQUFRLEtBQUs7QUFBQSxVQUNsQztBQUFBLFFBQ0QsR0FBQztBQUVELGtCQUFVLHNCQUFzQixFQUFFLE1BQU0sbUJBQW1CLE9BQU8sT0FBTyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxZQUFZLENBQUMsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLE9BQU87QUFDNUksZUFBTyxHQUFHLFlBQVksVUFBVSxRQUFRLE1BQVMsQ0FBQztBQUNsRCxlQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFDdEMsZUFBTyxnQkFBZ0IsVUFBVSxTQUFTLEdBQUcsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDakUsZUFBTyxnQkFBZ0IsVUFBVSxjQUFjLEdBQUcsQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDekU7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSywwRUFBMEUsWUFBWTtBQUMxRixVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLGVBQWUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ25ELENBQUMsZUFBZSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbkQsQ0FBQyxlQUFlLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRDtBQUFBLE1BQ0EsT0FBTyxRQUFRLFdBQVcsS0FBSyxhQUFhO0FBQzNDLGlCQUFTLEtBQUssa0JBQWtCLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsVUFDakUsWUFBWTtBQUFBLFVBQUU7QUFBQSxVQUNkLFlBQVk7QUFDcEIsbUJBQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxRQUFRLEtBQUs7QUFBQSxVQUNsQztBQUFBLFFBQ0QsR0FBQztBQUVELGtCQUFVLHNCQUFzQixFQUFFLE1BQU0sbUJBQW1CLE9BQU8sT0FBTyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxZQUFZLENBQUMsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLE9BQU87QUFDNUksZUFBTyxHQUFHLFlBQVksVUFBVSxRQUFRLE1BQVMsQ0FBQztBQUNsRCxlQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFDdEMsZUFBTyxnQkFBZ0IsVUFBVSxTQUFTLEdBQUcsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDakUsZUFBTyxnQkFBZ0IsVUFBVSxjQUFjLEdBQUcsQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDekU7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
