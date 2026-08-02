import assert from "assert";
import { Range } from "../../../../../../editor/common/core/range.js";
import { FindMatch, ValidAnnotatedEditOperation } from "../../../../../../editor/common/model.js";
import { USUAL_WORD_SEPARATORS } from "../../../../../../editor/common/core/wordHelper.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { FindReplaceState } from "../../../../../../editor/contrib/find/browser/findState.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { CellFindMatchModel, FindModel } from "../../../browser/contrib/find/findModel.js";
import { CellEditType, CellKind } from "../../../common/notebookCommon.js";
import { TestCell, withTestNotebook } from "../testNotebookEditor.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("Notebook Find", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const configurationValue = {
    value: USUAL_WORD_SEPARATORS
  };
  const configurationService = new class extends TestConfigurationService {
    inspect() {
      return configurationValue;
    }
  }();
  const setupEditorForTest = (editor, viewModel) => {
    editor.changeModelDecorations = (callback) => {
      return callback({
        deltaDecorations: (oldDecorations, newDecorations) => {
          const ret = [];
          newDecorations.forEach((dec) => {
            const cell = viewModel.viewCells.find((cell2) => cell2.handle === dec.ownerId);
            const decorations = cell?.deltaModelDecorations([], dec.decorations) ?? [];
            if (decorations.length > 0) {
              ret.push({ ownerId: dec.ownerId, decorations });
            }
          });
          return ret;
        }
      });
    };
  };
  test("Update find matches basics", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 2);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        assert.strictEqual(editor.textModel.length, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 3,
          count: 0,
          cells: [
            disposables.add(new TestCell(viewModel.viewType, 3, "# next paragraph 1", "markdown", CellKind.Code, [], accessor.get(ILanguageService)))
          ]
        }], true, void 0, () => void 0, void 0, true);
        await found2;
        assert.strictEqual(editor.textModel.length, 4);
        assert.strictEqual(model.findMatches.length, 3);
        assert.strictEqual(model.currentMatch, 1);
      }
    );
  });
  test("Update find matches basics 2", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.3", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        setupEditorForTest(editor, viewModel);
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 4);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 2);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 1,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        await found2;
        assert.strictEqual(model.findMatches.length, 3);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 3);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 2);
      }
    );
  });
  test("Update find matches basics 3", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.3", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        setupEditorForTest(editor, viewModel);
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 4);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 4);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 1,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        await found2;
        assert.strictEqual(model.findMatches.length, 3);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 3);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 2);
      }
    );
  });
  test("Update find matches, #112748", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.3", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        setupEditorForTest(editor, viewModel);
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 4);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        model.find({ previous: false });
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        viewModel.viewCells[1].textBuffer.applyEdits([
          new ValidAnnotatedEditOperation(null, new Range(1, 1, 1, 14), "", false, false, false)
        ], false, true);
        model.research();
        await found2;
        assert.strictEqual(model.currentMatch, 1);
      }
    );
  });
  test("Reset when match not found, #127198", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 2);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        assert.strictEqual(editor.textModel.length, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ searchString: "3" }, true);
        await found2;
        assert.strictEqual(model.currentMatch, -1);
        assert.strictEqual(model.findMatches.length, 0);
      }
    );
  });
  test("CellFindMatchModel", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["print(1)", "typescript", CellKind.Code, [], {}]
      ],
      async (editor) => {
        const mdCell = editor.cellAt(0);
        const mdModel = new CellFindMatchModel(mdCell, 0, [], []);
        assert.strictEqual(mdModel.length, 0);
        mdModel.contentMatches.push(new FindMatch(new Range(1, 1, 1, 2), []));
        assert.strictEqual(mdModel.length, 1);
        mdModel.webviewMatches.push({
          index: 0,
          searchPreviewInfo: {
            line: "",
            range: {
              start: 0,
              end: 0
            }
          }
        }, {
          index: 1,
          searchPreviewInfo: {
            line: "",
            range: {
              start: 0,
              end: 0
            }
          }
        });
        assert.strictEqual(mdModel.length, 3);
        assert.strictEqual(mdModel.getMatch(0), mdModel.contentMatches[0]);
        assert.strictEqual(mdModel.getMatch(1), mdModel.webviewMatches[0]);
        assert.strictEqual(mdModel.getMatch(2), mdModel.webviewMatches[1]);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9jb250cmliL2ZpbmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaCwgSVRleHRCdWZmZXIsIFZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVVNVQUxfV09SRF9TRVBBUkFUT1JTIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IEZpbmRSZXBsYWNlU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZFN0YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25WYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tGaW5kRmlsdGVycyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJpYi9maW5kL2ZpbmRGaWx0ZXJzLmpzJztcbmltcG9ydCB7IENlbGxGaW5kTWF0Y2hNb2RlbCwgRmluZE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb250cmliL2ZpbmQvZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IElBY3RpdmVOb3RlYm9va0VkaXRvciwgSUNlbGxNb2RlbERlY29yYXRpb25zLCBJQ2VsbE1vZGVsRGVsdGFEZWNvcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tWaWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgVGVzdENlbGwsIHdpdGhUZXN0Tm90ZWJvb2sgfSBmcm9tICcuLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdOb3RlYm9vayBGaW5kJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25WYWx1ZTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxhbnk+ID0ge1xuXHRcdHZhbHVlOiBVU1VBTF9XT1JEX1NFUEFSQVRPUlNcblx0fTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdG92ZXJyaWRlIGluc3BlY3QoKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvblZhbHVlO1xuXHRcdH1cblx0fSgpO1xuXG5cdGNvbnN0IHNldHVwRWRpdG9yRm9yVGVzdCA9IChlZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvciwgdmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCkgPT4ge1xuXHRcdGVkaXRvci5jaGFuZ2VNb2RlbERlY29yYXRpb25zID0gKGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soe1xuXHRcdFx0XHRkZWx0YURlY29yYXRpb25zOiAob2xkRGVjb3JhdGlvbnM6IElDZWxsTW9kZWxEZWNvcmF0aW9uc1tdLCBuZXdEZWNvcmF0aW9uczogSUNlbGxNb2RlbERlbHRhRGVjb3JhdGlvbnNbXSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJldDogSUNlbGxNb2RlbERlY29yYXRpb25zW10gPSBbXTtcblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9ucy5mb3JFYWNoKGRlYyA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLnZpZXdDZWxscy5maW5kKGNlbGwgPT4gY2VsbC5oYW5kbGUgPT09IGRlYy5vd25lcklkKTtcblx0XHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0gY2VsbD8uZGVsdGFNb2RlbERlY29yYXRpb25zKFtdLCBkZWMuZGVjb3JhdGlvbnMpID8/IFtdO1xuXG5cdFx0XHRcdFx0XHRpZiAoZGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXQucHVzaCh7IG93bmVySWQ6IGRlYy5vd25lcklkLCBkZWNvcmF0aW9uczogZGVjb3JhdGlvbnMgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcmV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9O1xuXG5cdHRlc3QoJ1VwZGF0ZSBmaW5kIG1hdGNoZXMgYmFzaWNzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGU8Tm90ZWJvb2tGaW5kRmlsdGVycz4oKSk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWwoZWRpdG9yLCBzdGF0ZSwgYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpKTtcblxuXHRcdFx0XHRjb25zdCBmb3VuZCA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBpc1JldmVhbGVkOiB0cnVlIH0sIHRydWUpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICcxJyB9LCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgZm91bmQ7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMSk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDApO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAxKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLnRleHRNb2RlbC5sZW5ndGgsIDMpO1xuXG5cdFx0XHRcdGNvbnN0IGZvdW5kMiA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAzLCBjb3VudDogMCwgY2VsbHM6IFtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENlbGwodmlld01vZGVsLnZpZXdUeXBlLCAzLCAnIyBuZXh0IHBhcmFncmFwaCAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuQ29kZSwgW10sIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKSkpLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCBmb3VuZDI7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IudGV4dE1vZGVsLmxlbmd0aCwgNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAxKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdVcGRhdGUgZmluZCBtYXRjaGVzIGJhc2ljcyAyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMS4xJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEuMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0c2V0dXBFZGl0b3JGb3JUZXN0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGU8Tm90ZWJvb2tGaW5kRmlsdGVycz4oKSk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWwoZWRpdG9yLCBzdGF0ZSwgYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpKTtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IGRpc3Bvc2FibGVzLmFkZChzdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubWF0Y2hlc0NvdW50KSB7IHJlc29sdmUodHJ1ZSk7IH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgaXNSZXZlYWxlZDogdHJ1ZSB9LCB0cnVlKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnMScgfSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IGZvdW5kO1xuXHRcdFx0XHQvLyBmaW5kIG1hdGNoZXMgaXMgbm90IG5lY2Vzc2FyaWx5IGZpbmQgcmVzdWx0c1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZmluZE1hdGNoZXMubGVuZ3RoLCA0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMCk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDEpO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAyKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMyk7XG5cblx0XHRcdFx0Y29uc3QgZm91bmQyID0gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiBkaXNwb3NhYmxlcy5hZGQoc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm1hdGNoZXNDb3VudCkgeyByZXNvbHZlKHRydWUpOyB9XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDIsIGNvdW50OiAxLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCBmb3VuZDI7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDMpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDApO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IHRydWUgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDMpO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMSk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDIpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VwZGF0ZSBmaW5kIG1hdGNoZXMgYmFzaWNzIDMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxLjEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMS4zJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRzZXR1cEVkaXRvckZvclRlc3QoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0XHRhY2Nlc3Nvci5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZTxOb3RlYm9va0ZpbmRGaWx0ZXJzPigpKTtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbChlZGl0b3IsIHN0YXRlLCBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpO1xuXHRcdFx0XHRjb25zdCBmb3VuZCA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBpc1JldmVhbGVkOiB0cnVlIH0sIHRydWUpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICcxJyB9LCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgZm91bmQ7XG5cdFx0XHRcdC8vIGZpbmQgbWF0Y2hlcyBpcyBub3QgbmVjZXNzYXJpbHkgZmluZCByZXN1bHRzXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiB0cnVlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCA0KTtcblxuXHRcdFx0XHRjb25zdCBmb3VuZDIgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IGRpc3Bvc2FibGVzLmFkZChzdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubWF0Y2hlc0NvdW50KSB7IHJlc29sdmUodHJ1ZSk7IH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMiwgY291bnQ6IDEsIGNlbGxzOiBbXVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IGZvdW5kMjtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmZpbmRNYXRjaGVzLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDApO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IHRydWUgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDMpO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IHRydWUgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDIpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VwZGF0ZSBmaW5kIG1hdGNoZXMsICMxMTI3NDgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxLjEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMS4zJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRzZXR1cEVkaXRvckZvclRlc3QoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0XHRhY2Nlc3Nvci5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZTxOb3RlYm9va0ZpbmRGaWx0ZXJzPigpKTtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbChlZGl0b3IsIHN0YXRlLCBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpO1xuXHRcdFx0XHRjb25zdCBmb3VuZCA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBpc1JldmVhbGVkOiB0cnVlIH0sIHRydWUpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICcxJyB9LCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgZm91bmQ7XG5cdFx0XHRcdC8vIGZpbmQgbWF0Y2hlcyBpcyBub3QgbmVjZXNzYXJpbHkgZmluZCByZXN1bHRzXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMyk7XG5cdFx0XHRcdGNvbnN0IGZvdW5kMiA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHQodmlld01vZGVsLnZpZXdDZWxsc1sxXS50ZXh0QnVmZmVyIGFzIElUZXh0QnVmZmVyKS5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHRuZXcgVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uKG51bGwsIG5ldyBSYW5nZSgxLCAxLCAxLCAxNCksICcnLCBmYWxzZSwgZmFsc2UsIGZhbHNlKVxuXHRcdFx0XHRdLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdC8vIGNlbGwgY29udGVudCB1cGRhdGVzLCByZWNvbXB1dGVcblx0XHRcdFx0bW9kZWwucmVzZWFyY2goKTtcblx0XHRcdFx0YXdhaXQgZm91bmQyO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAxKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNldCB3aGVuIG1hdGNoIG5vdCBmb3VuZCwgIzEyNzE5OCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlPE5vdGVib29rRmluZEZpbHRlcnM+KCkpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsKGVkaXRvciwgc3RhdGUsIGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpKSk7XG5cdFx0XHRcdGNvbnN0IGZvdW5kID0gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiBkaXNwb3NhYmxlcy5hZGQoc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm1hdGNoZXNDb3VudCkgeyByZXNvbHZlKHRydWUpOyB9XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdHN0YXRlLmNoYW5nZSh7IGlzUmV2ZWFsZWQ6IHRydWUgfSwgdHJ1ZSk7XG5cdFx0XHRcdHN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJzEnIH0sIHRydWUpO1xuXHRcdFx0XHRhd2FpdCBmb3VuZDtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmZpbmRNYXRjaGVzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDApO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAxKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMCk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDEpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IudGV4dE1vZGVsLmxlbmd0aCwgMyk7XG5cblx0XHRcdFx0Y29uc3QgZm91bmQyID0gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiBkaXNwb3NhYmxlcy5hZGQoc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm1hdGNoZXNDb3VudCkgeyByZXNvbHZlKHRydWUpOyB9XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdHN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJzMnIH0sIHRydWUpO1xuXHRcdFx0XHRhd2FpdCBmb3VuZDI7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIC0xKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmZpbmRNYXRjaGVzLmxlbmd0aCwgMCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2VsbEZpbmRNYXRjaE1vZGVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwcmludCgxKScsICd0eXBlc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1kQ2VsbCA9IGVkaXRvci5jZWxsQXQoMCk7XG5cdFx0XHRcdGNvbnN0IG1kTW9kZWwgPSBuZXcgQ2VsbEZpbmRNYXRjaE1vZGVsKG1kQ2VsbCwgMCwgW10sIFtdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kTW9kZWwubGVuZ3RoLCAwKTtcblxuXHRcdFx0XHRtZE1vZGVsLmNvbnRlbnRNYXRjaGVzLnB1c2gobmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMSwgMSwgMiksIFtdKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZE1vZGVsLmxlbmd0aCwgMSk7XG5cdFx0XHRcdG1kTW9kZWwud2Vidmlld01hdGNoZXMucHVzaCh7XG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0c2VhcmNoUHJldmlld0luZm86IHtcblx0XHRcdFx0XHRcdGxpbmU6ICcnLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRcdFx0c3RhcnQ6IDAsXG5cdFx0XHRcdFx0XHRcdGVuZDogMCxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRzZWFyY2hQcmV2aWV3SW5mbzoge1xuXHRcdFx0XHRcdFx0bGluZTogJycsXG5cdFx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0XHRzdGFydDogMCxcblx0XHRcdFx0XHRcdFx0ZW5kOiAwLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kTW9kZWwubGVuZ3RoLCAzKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kTW9kZWwuZ2V0TWF0Y2goMCksIG1kTW9kZWwuY29udGVudE1hdGNoZXNbMF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRNb2RlbC5nZXRNYXRjaCgxKSwgbWRNb2RlbC53ZWJ2aWV3TWF0Y2hlc1swXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZE1vZGVsLmdldE1hdGNoKDIpLCBtZE1vZGVsLndlYnZpZXdNYXRjaGVzWzFdKTtcblx0XHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQXdCLG1DQUFtQztBQUNwRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUFrRDtBQUMzRCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLG9CQUFvQixpQkFBaUI7QUFHOUMsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLFVBQVUsd0JBQXdCO0FBQzNDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0saUJBQWlCLE1BQU07QUFDNUIsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxRQUFNLHFCQUErQztBQUFBLElBQ3BELE9BQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSx1QkFBdUIsSUFBSSxjQUFjLHlCQUF5QjtBQUFBLElBQzlELFVBQVU7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNELEVBQUU7QUFFRixRQUFNLHFCQUFxQixDQUFDLFFBQStCLGNBQWlDO0FBQzNGLFdBQU8seUJBQXlCLENBQUMsYUFBYTtBQUM3QyxhQUFPLFNBQVM7QUFBQSxRQUNmLGtCQUFrQixDQUFDLGdCQUF5QyxtQkFBaUQ7QUFDNUcsZ0JBQU0sTUFBK0IsQ0FBQztBQUN0Qyx5QkFBZSxRQUFRLFNBQU87QUFDN0Isa0JBQU0sT0FBTyxVQUFVLFVBQVUsS0FBSyxDQUFBQSxVQUFRQSxNQUFLLFdBQVcsSUFBSSxPQUFPO0FBQ3pFLGtCQUFNLGNB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Q0FBQyxDQUFDO0FBQ0gsY0FBTSxPQUFPLEVBQUUsY0FBYyxJQUFJLEdBQUcsSUFBSTtBQUN4QyxjQUFNO0FBQ04sZUFBTyxZQUFZLE1BQU0sY0FBYyxFQUFFO0FBQ3pDLGVBQU8sWUFBWSxNQUFNLFlBQVksUUFBUSxDQUFDO0FBQUEsTUFDL0M7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxzQkFBc0IsaUJBQWtCO0FBQzVDLFVBQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxDQUFDLGNBQWMsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsWUFBWSxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDakQ7QUFBQSxNQUNBLE9BQU8sV0FBVztBQUNqQixjQUFNLFNBQVMsT0FBTyxPQUFPLENBQUM7QUFDOUIsY0FBTSxVQUFVLElBQUksbUJBQW1CLFFBQVEsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3hELGVBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUVwQyxnQkFBUSxlQUFlLEtBQUssSUFBSSxVQUFVLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDcEUsZUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGdCQUFRLGVBQWUsS0FBSztBQUFBLFVBQzNCLE9BQU87QUFBQSxVQUNQLG1CQUFtQjtBQUFBLFlBQ2xCLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxjQUNOLE9BQU87QUFBQSxjQUNQLEtBQUs7QUFBQSxZQUNOO0FBQUEsVUFDRDtBQUFBLFFBQ0QsR0FBRztBQUFBLFVBQ0YsT0FBTztBQUFBLFVBQ1AsbUJBQW1CO0FBQUEsWUFDbEIsTUFBTTtBQUFBLFlBQ04sT0FBTztBQUFBLGNBQ04sT0FBTztBQUFBLGNBQ1AsS0FBSztBQUFBLFlBQ047QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBRUQsZUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGVBQU8sWUFBWSxRQUFRLFNBQVMsQ0FBQyxHQUFHLFFBQVEsZUFBZSxDQUFDLENBQUM7QUFDakUsZUFBTyxZQUFZLFFBQVEsU0FBUyxDQUFDLEdBQUcsUUFBUSxlQUFlLENBQUMsQ0FBQztBQUNqRSxlQUFPLFlBQVksUUFBUSxTQUFTLENBQUMsR0FBRyxRQUFRLGVBQWUsQ0FBQyxDQUFDO0FBQUEsTUFDbEU7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiY2VsbCJdCn0K
