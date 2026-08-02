import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { DiffEditorHeightCalculatorService } from "../../../browser/diff/editorHeightCalculator.js";
import { URI } from "../../../../../../base/common/uri.js";
import { createTextModel as createTextModelWithText } from "../../../../../../editor/test/common/testTextModel.js";
import { DefaultLinesDiffComputer } from "../../../../../../editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js";
import { getEditorPadding } from "../../../browser/diff/diffCellEditorOptions.js";
import { HeightOfHiddenLinesRegionInDiffEditor } from "../../../browser/diff/diffElementViewModel.js";
suite("NotebookDiff EditorHeightCalculator", () => {
  ["Hide Unchanged Regions", "Show Unchanged Regions"].forEach((suiteTitle) => {
    suite(suiteTitle, () => {
      const fontInfo = { lineHeight: 18, fontSize: 18 };
      let disposables;
      let textModelResolver;
      let editorWorkerService;
      const original = URI.parse("original");
      const modified = URI.parse("modified");
      let originalModel;
      let modifiedModel;
      const diffComputer = new DefaultLinesDiffComputer();
      let calculator;
      const hideUnchangedRegions = suiteTitle.startsWith("Hide");
      const configurationService = new TestConfigurationService({
        notebook: { diff: { ignoreMetadata: true } },
        diffEditor: {
          hideUnchangedRegions: {
            enabled: hideUnchangedRegions,
            minimumLineCount: 3,
            contextLineCount: 3
          }
        }
      });
      function createTextModel(lines) {
        return createTextModelWithText(lines.join("\n"));
      }
      teardown(() => disposables.dispose());
      ensureNoDisposablesAreLeakedInTestSuite();
      setup(() => {
        disposables = new DisposableStore();
        textModelResolver = new class extends mock() {
          async createModelReference(resource) {
            return {
              dispose: () => {
              },
              object: {
                textEditorModel: resource === original ? originalModel : modifiedModel,
                getLanguageId: () => "javascript"
              }
            };
          }
        }();
        editorWorkerService = new class extends mock() {
          async computeDiff(_original, _modified, options, _algorithm) {
            const originalLines = new Array(originalModel.getLineCount()).fill(0).map((_, i) => originalModel.getLineContent(i + 1));
            const modifiedLines = new Array(modifiedModel.getLineCount()).fill(0).map((_, i) => modifiedModel.getLineContent(i + 1));
            const result = diffComputer.computeDiff(originalLines, modifiedLines, options);
            const identical = originalLines.join("") === modifiedLines.join("");
            return {
              identical,
              quitEarly: result.hitTimeout,
              changes: result.changes,
              moves: result.moves
            };
          }
        }();
        calculator = new DiffEditorHeightCalculatorService(fontInfo.lineHeight, textModelResolver, editorWorkerService, configurationService);
      });
      test("1 original line with change in same line", async () => {
        originalModel = disposables.add(createTextModel(["Hello World"]));
        modifiedModel = disposables.add(createTextModel(["Foo Bar"]));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(1, 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("1 original line with insertion of a new line", async () => {
        originalModel = disposables.add(createTextModel(["Hello World"]));
        modifiedModel = disposables.add(createTextModel(["Hello World", "Foo Bar"]));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(2, 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("1 line with update to a line and insert of a new line", async () => {
        originalModel = disposables.add(createTextModel(["Hello World"]));
        modifiedModel = disposables.add(createTextModel(["Foo Bar", "Bar Baz"]));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(2, 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("10 line with update to a line and insert of a new line", async () => {
        originalModel = disposables.add(createTextModel(createLines(10)));
        modifiedModel = disposables.add(createTextModel(createLines(10).concat("Foo Bar")));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(hideUnchangedRegions ? 4 : 11, hideUnchangedRegions ? 1 : 0);
        assert.strictEqual(height, expectedHeight);
      });
      test("50 lines with updates, deletions and inserts", async () => {
        originalModel = disposables.add(createTextModel(createLines(60)));
        const modifiedLines = createLines(60);
        modifiedLines[3] = "Foo Bar";
        modifiedLines.splice(7, 3);
        modifiedLines.splice(10, 0, "Foo Bar1", "Foo Bar2", "Foo Bar3");
        modifiedLines.splice(30, 0, "", "");
        modifiedLines.splice(40, 4);
        modifiedLines.splice(50, 0, "1", "2", "3", "4", "5");
        modifiedModel = disposables.add(createTextModel(modifiedLines));
        const height = await calculator.diffAndComputeHeight(original, modified);
        const expectedHeight = getExpectedHeight(hideUnchangedRegions ? 50 : 70, hideUnchangedRegions ? 3 : 0);
        assert.strictEqual(height, expectedHeight);
      });
      function getExpectedHeight(visibleLineCount, unchangeRegionsHeight) {
        return visibleLineCount * fontInfo.lineHeight + getEditorPadding(visibleLineCount).top + getEditorPadding(visibleLineCount).bottom + unchangeRegionsHeight * HeightOfHiddenLinesRegionInDiffEditor;
      }
      function createLines(count, linePrefix = "Hello World") {
        return new Array(count).fill(0).map((_, i) => `${linePrefix} ${i}`);
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9kaWZmL2VkaXRvckhlaWdodENhbGN1bGF0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9kaWZmL2VkaXRvckhlaWdodENhbGN1bGF0b3IuanMnO1xuaW1wb3J0IHsgRm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCBhcyBjcmVhdGVUZXh0TW9kZWxXaXRoVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IERlZmF1bHRMaW5lc0RpZmZDb21wdXRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIvZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IERpZmZBbGdvcml0aG1OYW1lLCBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElEb2N1bWVudERpZmZQcm92aWRlck9wdGlvbnMsIElEb2N1bWVudERpZmYgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvZG9jdW1lbnREaWZmUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yUGFkZGluZyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9kaWZmQ2VsbEVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSGVpZ2h0T2ZIaWRkZW5MaW5lc1JlZ2lvbkluRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9kaWZmRWxlbWVudFZpZXdNb2RlbC5qcyc7XG5cbnN1aXRlKCdOb3RlYm9va0RpZmYgRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvcicsICgpID0+IHtcblx0WydIaWRlIFVuY2hhbmdlZCBSZWdpb25zJywgJ1Nob3cgVW5jaGFuZ2VkIFJlZ2lvbnMnXS5mb3JFYWNoKHN1aXRlVGl0bGUgPT4ge1xuXHRcdHN1aXRlKHN1aXRlVGl0bGUsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbnRJbmZvOiBGb250SW5mbyA9IHsgbGluZUhlaWdodDogMTgsIGZvbnRTaXplOiAxOCB9IGFzIEZvbnRJbmZvO1xuXHRcdFx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdFx0XHRsZXQgdGV4dE1vZGVsUmVzb2x2ZXI6IElUZXh0TW9kZWxTZXJ2aWNlO1xuXHRcdFx0bGV0IGVkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWw6IFVSSSA9IFVSSS5wYXJzZSgnb3JpZ2luYWwnKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkOiBVUkkgPSBVUkkucGFyc2UoJ21vZGlmaWVkJyk7XG5cdFx0XHRsZXQgb3JpZ2luYWxNb2RlbDogSVRleHRNb2RlbDtcblx0XHRcdGxldCBtb2RpZmllZE1vZGVsOiBJVGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgZGlmZkNvbXB1dGVyID0gbmV3IERlZmF1bHRMaW5lc0RpZmZDb21wdXRlcigpO1xuXHRcdFx0bGV0IGNhbGN1bGF0b3I6IERpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZTtcblx0XHRcdGNvbnN0IGhpZGVVbmNoYW5nZWRSZWdpb25zID0gc3VpdGVUaXRsZS5zdGFydHNXaXRoKCdIaWRlJyk7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRub3RlYm9vazogeyBkaWZmOiB7IGlnbm9yZU1ldGFkYXRhOiB0cnVlIH0gfSwgZGlmZkVkaXRvcjoge1xuXHRcdFx0XHRcdGhpZGVVbmNoYW5nZWRSZWdpb25zOiB7XG5cdFx0XHRcdFx0XHRlbmFibGVkOiBoaWRlVW5jaGFuZ2VkUmVnaW9ucywgbWluaW11bUxpbmVDb3VudDogMywgY29udGV4dExpbmVDb3VudDogM1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGZ1bmN0aW9uIGNyZWF0ZVRleHRNb2RlbChsaW5lczogc3RyaW5nW10pOiBJVGV4dE1vZGVsIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZVRleHRNb2RlbFdpdGhUZXh0KGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHRcdH1cblxuXHRcdFx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblx0XHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHR0ZXh0TW9kZWxSZXNvbHZlciA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPj4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHRcdFx0XHRvYmplY3Q6IHtcblx0XHRcdFx0XHRcdFx0XHR0ZXh0RWRpdG9yTW9kZWw6IHJlc291cmNlID09PSBvcmlnaW5hbCA/IG9yaWdpbmFsTW9kZWwgOiBtb2RpZmllZE1vZGVsLFxuXHRcdFx0XHRcdFx0XHRcdGdldExhbmd1YWdlSWQ6ICgpID0+ICdqYXZhc2NyaXB0Jyxcblx0XHRcdFx0XHRcdFx0fSBhcyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRlZGl0b3JXb3JrZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yV29ya2VyU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY29tcHV0ZURpZmYoX29yaWdpbmFsOiBVUkksIF9tb2RpZmllZDogVVJJLCBvcHRpb25zOiBJRG9jdW1lbnREaWZmUHJvdmlkZXJPcHRpb25zLCBfYWxnb3JpdGhtOiBEaWZmQWxnb3JpdGhtTmFtZSk6IFByb21pc2U8SURvY3VtZW50RGlmZiB8IG51bGw+IHtcblx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsTGluZXMgPSBuZXcgQXJyYXkob3JpZ2luYWxNb2RlbC5nZXRMaW5lQ291bnQoKSkuZmlsbCgwKS5tYXAoKF8sIGkpID0+IG9yaWdpbmFsTW9kZWwuZ2V0TGluZUNvbnRlbnQoaSArIDEpKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSBuZXcgQXJyYXkobW9kaWZpZWRNb2RlbC5nZXRMaW5lQ291bnQoKSkuZmlsbCgwKS5tYXAoKF8sIGkpID0+IG1vZGlmaWVkTW9kZWwuZ2V0TGluZUNvbnRlbnQoaSArIDEpKTtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGRpZmZDb21wdXRlci5jb21wdXRlRGlmZihvcmlnaW5hbExpbmVzLCBtb2RpZmllZExpbmVzLCBvcHRpb25zKTtcblx0XHRcdFx0XHRcdGNvbnN0IGlkZW50aWNhbCA9IG9yaWdpbmFsTGluZXMuam9pbignJykgPT09IG1vZGlmaWVkTGluZXMuam9pbignJyk7XG5cblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGlkZW50aWNhbCxcblx0XHRcdFx0XHRcdFx0cXVpdEVhcmx5OiByZXN1bHQuaGl0VGltZW91dCxcblx0XHRcdFx0XHRcdFx0Y2hhbmdlczogcmVzdWx0LmNoYW5nZXMsXG5cdFx0XHRcdFx0XHRcdG1vdmVzOiByZXN1bHQubW92ZXMsXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjYWxjdWxhdG9yID0gbmV3IERpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZShmb250SW5mby5saW5lSGVpZ2h0LCB0ZXh0TW9kZWxSZXNvbHZlciwgZWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJzEgb3JpZ2luYWwgbGluZSB3aXRoIGNoYW5nZSBpbiBzYW1lIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKFsnSGVsbG8gV29ybGQnXSkpO1xuXHRcdFx0XHRtb2RpZmllZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChbJ0ZvbyBCYXInXSkpO1xuXG5cdFx0XHRcdGNvbnN0IGhlaWdodCA9IGF3YWl0IGNhbGN1bGF0b3IuZGlmZkFuZENvbXB1dGVIZWlnaHQob3JpZ2luYWwsIG1vZGlmaWVkKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRIZWlnaHQgPSBnZXRFeHBlY3RlZEhlaWdodCgxLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVpZ2h0LCBleHBlY3RlZEhlaWdodCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnMSBvcmlnaW5hbCBsaW5lIHdpdGggaW5zZXJ0aW9uIG9mIGEgbmV3IGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKFsnSGVsbG8gV29ybGQnXSkpO1xuXHRcdFx0XHRtb2RpZmllZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChbJ0hlbGxvIFdvcmxkJywgJ0ZvbyBCYXInXSkpO1xuXG5cdFx0XHRcdGNvbnN0IGhlaWdodCA9IGF3YWl0IGNhbGN1bGF0b3IuZGlmZkFuZENvbXB1dGVIZWlnaHQob3JpZ2luYWwsIG1vZGlmaWVkKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRIZWlnaHQgPSBnZXRFeHBlY3RlZEhlaWdodCgyLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVpZ2h0LCBleHBlY3RlZEhlaWdodCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnMSBsaW5lIHdpdGggdXBkYXRlIHRvIGEgbGluZSBhbmQgaW5zZXJ0IG9mIGEgbmV3IGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKFsnSGVsbG8gV29ybGQnXSkpO1xuXHRcdFx0XHRtb2RpZmllZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChbJ0ZvbyBCYXInLCAnQmFyIEJheiddKSk7XG5cblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gYXdhaXQgY2FsY3VsYXRvci5kaWZmQW5kQ29tcHV0ZUhlaWdodChvcmlnaW5hbCwgbW9kaWZpZWQpO1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZEhlaWdodCA9IGdldEV4cGVjdGVkSGVpZ2h0KDIsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWlnaHQsIGV4cGVjdGVkSGVpZ2h0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCcxMCBsaW5lIHdpdGggdXBkYXRlIHRvIGEgbGluZSBhbmQgaW5zZXJ0IG9mIGEgbmV3IGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGNyZWF0ZUxpbmVzKDEwKSkpO1xuXHRcdFx0XHRtb2RpZmllZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjcmVhdGVMaW5lcygxMCkuY29uY2F0KCdGb28gQmFyJykpKTtcblxuXHRcdFx0XHRjb25zdCBoZWlnaHQgPSBhd2FpdCBjYWxjdWxhdG9yLmRpZmZBbmRDb21wdXRlSGVpZ2h0KG9yaWdpbmFsLCBtb2RpZmllZCk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gZ2V0RXhwZWN0ZWRIZWlnaHQoaGlkZVVuY2hhbmdlZFJlZ2lvbnMgPyA0IDogMTEsIGhpZGVVbmNoYW5nZWRSZWdpb25zID8gMSA6IDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWlnaHQsIGV4cGVjdGVkSGVpZ2h0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCc1MCBsaW5lcyB3aXRoIHVwZGF0ZXMsIGRlbGV0aW9ucyBhbmQgaW5zZXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0b3JpZ2luYWxNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY3JlYXRlTGluZXMoNjApKSk7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSBjcmVhdGVMaW5lcyg2MCk7XG5cdFx0XHRcdG1vZGlmaWVkTGluZXNbM10gPSAnRm9vIEJhcic7XG5cdFx0XHRcdG1vZGlmaWVkTGluZXMuc3BsaWNlKDcsIDMpO1xuXHRcdFx0XHRtb2RpZmllZExpbmVzLnNwbGljZSgxMCwgMCwgJ0ZvbyBCYXIxJywgJ0ZvbyBCYXIyJywgJ0ZvbyBCYXIzJyk7XG5cdFx0XHRcdG1vZGlmaWVkTGluZXMuc3BsaWNlKDMwLCAwLCAnJywgJycpO1xuXHRcdFx0XHRtb2RpZmllZExpbmVzLnNwbGljZSg0MCwgNCk7XG5cdFx0XHRcdG1vZGlmaWVkTGluZXMuc3BsaWNlKDUwLCAwLCAnMScsICcyJywgJzMnLCAnNCcsICc1Jyk7XG5cblx0XHRcdFx0bW9kaWZpZWRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwobW9kaWZpZWRMaW5lcykpO1xuXG5cdFx0XHRcdGNvbnN0IGhlaWdodCA9IGF3YWl0IGNhbGN1bGF0b3IuZGlmZkFuZENvbXB1dGVIZWlnaHQob3JpZ2luYWwsIG1vZGlmaWVkKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRIZWlnaHQgPSBnZXRFeHBlY3RlZEhlaWdodChoaWRlVW5jaGFuZ2VkUmVnaW9ucyA/IDUwIDogNzAsIGhpZGVVbmNoYW5nZWRSZWdpb25zID8gMyA6IDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWlnaHQsIGV4cGVjdGVkSGVpZ2h0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRmdW5jdGlvbiBnZXRFeHBlY3RlZEhlaWdodCh2aXNpYmxlTGluZUNvdW50OiBudW1iZXIsIHVuY2hhbmdlUmVnaW9uc0hlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuICh2aXNpYmxlTGluZUNvdW50ICogZm9udEluZm8ubGluZUhlaWdodCkgKyBnZXRFZGl0b3JQYWRkaW5nKHZpc2libGVMaW5lQ291bnQpLnRvcCArIGdldEVkaXRvclBhZGRpbmcodmlzaWJsZUxpbmVDb3VudCkuYm90dG9tICsgKHVuY2hhbmdlUmVnaW9uc0hlaWdodCAqIEhlaWdodE9mSGlkZGVuTGluZXNSZWdpb25JbkRpZmZFZGl0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBjcmVhdGVMaW5lcyhjb3VudDogbnVtYmVyLCBsaW5lUHJlZml4ID0gJ0hlbGxvIFdvcmxkJyk6IHN0cmluZ1tdIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBBcnJheShjb3VudCkuZmlsbCgwKS5tYXAoKF8sIGkpID0+IGAke2xpbmVQcmVmaXh9ICR7aX1gKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUFtQztBQUM1QyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5Q0FBeUM7QUFHbEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUUzRCxTQUFTLGdDQUFnQztBQUd6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZDQUE2QztBQUV0RCxNQUFNLHVDQUF1QyxNQUFNO0FBQ2xELEdBQUMsMEJBQTBCLHdCQUF3QixFQUFFLFFBQVEsZ0JBQWM7QUFDMUUsVUFBTSxZQUFZLE1BQU07QUFDdkIsWUFBTSxXQUFxQixFQUFFLFlBQVksSUFBSSxVQUFVLEdBQUc7QUFDMUQsVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJO0FBQ0osWUFBTSxXQUFnQixJQUFJLE1BQU0sVUFBVTtBQUMxQyxZQUFNLFdBQWdCLElBQUksTUFBTSxVQUFVO0FBQzFDLFVBQUk7QUFDSixVQUFJO0FBQ0osWUFBTSxlQUFlLElBQUkseUJBQXlCO0FBQ2xELFVBQUk7QUFDSixZQUFNLHVCQUF1QixXQUFXLFdBQVcsTUFBTTtBQUN6RCxZQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUFBLFFBQ3pELFVBQVUsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEtBQUssRUFBRTtBQUFBLFFBQUcsWUFBWTtBQUFBLFVBQ3pELHNCQUFzQjtBQUFBLFlBQ3JCLFNBQVM7QUFBQSxZQUFzQixrQkFBa0I7QUFBQSxZQUFHLGtCQUFrQjtBQUFBLFVBQ3ZFO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELGVBQVMsZ0JBQWdCLE9BQTZCO0FBQ3JELGVBQU8sd0JBQXdCLE1B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
