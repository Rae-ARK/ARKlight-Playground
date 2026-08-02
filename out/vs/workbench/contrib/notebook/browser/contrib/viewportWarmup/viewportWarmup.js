var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { CellEditState, RenderOutputType } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { outputDisplayLimit } from "../../viewModel/codeCellViewModel.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { cellRangesToIndexes } from "../../../common/notebookRange.js";
import { INotebookService } from "../../../common/notebookService.js";
let NotebookViewportContribution = class extends Disposable {
  constructor(_notebookEditor, _notebookService, accessibilityService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._notebookService = _notebookService;
    this._warmupDocument = null;
    this._warmupViewport = new RunOnceScheduler(() => this._warmupViewportNow(), 200);
    this._register(this._warmupViewport);
    this._register(this._notebookEditor.onDidScroll(() => {
      this._warmupViewport.schedule();
    }));
    this._warmupDocument = new RunOnceScheduler(() => this._warmupDocumentNow(), 200);
    this._register(this._warmupDocument);
    this._register(this._notebookEditor.onDidAttachViewModel(() => {
      if (this._notebookEditor.hasModel()) {
        this._warmupDocument?.schedule();
      }
    }));
    if (this._notebookEditor.hasModel()) {
      this._warmupDocument?.schedule();
    }
  }
  _warmupDocumentNow() {
    if (this._notebookEditor.hasModel()) {
      for (let i = 0; i < this._notebookEditor.getLength(); i++) {
        const cell = this._notebookEditor.cellAt(i);
        if (cell?.cellKind === CellKind.Markup && cell?.getEditState() === CellEditState.Preview && !cell.isInputCollapsed) {
        } else if (cell?.cellKind === CellKind.Code) {
          this._warmupCodeCell(cell);
        }
      }
    }
  }
  _warmupViewportNow() {
    if (this._notebookEditor.isDisposed) {
      return;
    }
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const visibleRanges = this._notebookEditor.getVisibleRangesPlusViewportAboveAndBelow();
    cellRangesToIndexes(visibleRanges).forEach((index) => {
      const cell = this._notebookEditor.cellAt(index);
      if (cell?.cellKind === CellKind.Markup && cell?.getEditState() === CellEditState.Preview && !cell.isInputCollapsed) {
        this._notebookEditor.createMarkupPreview(cell);
      } else if (cell?.cellKind === CellKind.Code) {
        this._warmupCodeCell(cell);
      }
    });
  }
  _warmupCodeCell(viewCell) {
    if (viewCell.isOutputCollapsed) {
      return;
    }
    const outputs = viewCell.outputsViewModels;
    for (const output of outputs.slice(0, outputDisplayLimit)) {
      const [mimeTypes, pick] = output.resolveMimeTypes(this._notebookEditor.textModel, void 0);
      if (!mimeTypes.find((mimeType) => mimeType.isTrusted) || mimeTypes.length === 0) {
        continue;
      }
      const pickedMimeTypeRenderer = mimeTypes[pick];
      if (!pickedMimeTypeRenderer) {
        return;
      }
      if (!this._notebookEditor.hasModel()) {
        return;
      }
      const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
      if (!renderer) {
        return;
      }
      const result = { type: RenderOutputType.Extension, renderer, source: output, mimeType: pickedMimeTypeRenderer.mimeType };
      this._notebookEditor.createOutput(viewCell, result, 0, true);
    }
  }
};
NotebookViewportContribution.id = "workbench.notebook.viewportWarmup";
NotebookViewportContribution = __decorateClass([
  __decorateParam(1, INotebookService),
  __decorateParam(2, IAccessibilityService)
], NotebookViewportContribution);
registerNotebookContribution(NotebookViewportContribution.id, NotebookViewportContribution);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi92aWV3cG9ydFdhcm11cC92aWV3cG9ydFdhcm11cC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgSUluc2V0UmVuZGVyT3V0cHV0LCBJTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiwgSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIFJlbmRlck91dHB1dFR5cGUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCwgb3V0cHV0RGlzcGxheUxpbWl0IH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL2NvZGVDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IENlbGxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IGNlbGxSYW5nZXNUb0luZGV4ZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5cbmNsYXNzIE5vdGVib29rVmlld3BvcnRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIGlkOiBzdHJpbmcgPSAnd29ya2JlbmNoLm5vdGVib29rLnZpZXdwb3J0V2FybXVwJztcblx0cHJpdmF0ZSByZWFkb25seSBfd2FybXVwVmlld3BvcnQ6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhcm11cERvY3VtZW50OiBSdW5PbmNlU2NoZWR1bGVyIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fd2FybXVwVmlld3BvcnQgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl93YXJtdXBWaWV3cG9ydE5vdygpLCAyMDApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dhcm11cFZpZXdwb3J0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va0VkaXRvci5vbkRpZFNjcm9sbCgoKSA9PiB7XG5cdFx0XHR0aGlzLl93YXJtdXBWaWV3cG9ydC5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dhcm11cERvY3VtZW50ID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fd2FybXVwRG9jdW1lbnROb3coKSwgMjAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93YXJtdXBEb2N1bWVudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tFZGl0b3Iub25EaWRBdHRhY2hWaWV3TW9kZWwoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5fd2FybXVwRG9jdW1lbnQ/LnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX3dhcm11cERvY3VtZW50Py5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dhcm11cERvY3VtZW50Tm93KCkge1xuXHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX25vdGVib29rRWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmNlbGxBdChpKTtcblxuXHRcdFx0XHRpZiAoY2VsbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsPy5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3ICYmICFjZWxsLmlzSW5wdXRDb2xsYXBzZWQpIHtcblx0XHRcdFx0XHQvLyBUT0RPQHJlYm9ybml4IGN1cnJlbnRseSB3ZSBkaXNhYmxlIG1hcmtkb3duIGNlbGwgcmVuZGVyaW5nIGluIHdlYnZpZXcgZm9yIGFjY2Vzc2liaWxpdHlcblx0XHRcdFx0XHQvLyB0aGlzLl9ub3RlYm9va0VkaXRvci5jcmVhdGVNYXJrdXBQcmV2aWV3KGNlbGwpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNlbGw/LmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRcdFx0dGhpcy5fd2FybXVwQ29kZUNlbGwoKGNlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dhcm11cFZpZXdwb3J0Tm93KCkge1xuXHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFZpc2libGVSYW5nZXNQbHVzVmlld3BvcnRBYm92ZUFuZEJlbG93KCk7XG5cdFx0Y2VsbFJhbmdlc1RvSW5kZXhlcyh2aXNpYmxlUmFuZ2VzKS5mb3JFYWNoKGluZGV4ID0+IHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5jZWxsQXQoaW5kZXgpO1xuXG5cdFx0XHRpZiAoY2VsbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsPy5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3ICYmICFjZWxsLmlzSW5wdXRDb2xsYXBzZWQpIHtcblx0XHRcdFx0KHRoaXMuX25vdGVib29rRWRpdG9yIGFzIElOb3RlYm9va0VkaXRvckRlbGVnYXRlKS5jcmVhdGVNYXJrdXBQcmV2aWV3KGNlbGwpO1xuXHRcdFx0fSBlbHNlIGlmIChjZWxsPy5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0XHR0aGlzLl93YXJtdXBDb2RlQ2VsbCgoY2VsbCBhcyBDb2RlQ2VsbFZpZXdNb2RlbCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FybXVwQ29kZUNlbGwodmlld0NlbGw6IENvZGVDZWxsVmlld01vZGVsKSB7XG5cdFx0aWYgKHZpZXdDZWxsLmlzT3V0cHV0Q29sbGFwc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3V0cHV0cyA9IHZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzO1xuXHRcdGZvciAoY29uc3Qgb3V0cHV0IG9mIG91dHB1dHMuc2xpY2UoMCwgb3V0cHV0RGlzcGxheUxpbWl0KSkge1xuXHRcdFx0Y29uc3QgW21pbWVUeXBlcywgcGlja10gPSBvdXRwdXQucmVzb2x2ZU1pbWVUeXBlcyh0aGlzLl9ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwhLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKCFtaW1lVHlwZXMuZmluZChtaW1lVHlwZSA9PiBtaW1lVHlwZS5pc1RydXN0ZWQpIHx8IG1pbWVUeXBlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBpY2tlZE1pbWVUeXBlUmVuZGVyZXIgPSBtaW1lVHlwZXNbcGlja107XG5cblx0XHRcdGlmICghcGlja2VkTWltZVR5cGVSZW5kZXJlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldFJlbmRlcmVySW5mbyhwaWNrZWRNaW1lVHlwZVJlbmRlcmVyLnJlbmRlcmVySWQpO1xuXG5cdFx0XHRpZiAoIXJlbmRlcmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBJSW5zZXRSZW5kZXJPdXRwdXQgPSB7IHR5cGU6IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uLCByZW5kZXJlciwgc291cmNlOiBvdXRwdXQsIG1pbWVUeXBlOiBwaWNrZWRNaW1lVHlwZVJlbmRlcmVyLm1pbWVUeXBlIH07XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5jcmVhdGVPdXRwdXQodmlld0NlbGwsIHJlc3VsdCwgMCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdH1cbn1cblxucmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbihOb3RlYm9va1ZpZXdwb3J0Q29udHJpYnV0aW9uLmlkLCBOb3RlYm9va1ZpZXdwb3J0Q29udHJpYnV0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUEwRyx3QkFBd0I7QUFDM0ksU0FBUyxvQ0FBb0M7QUFDN0MsU0FBNEIsMEJBQTBCO0FBQ3RELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBRWpDLElBQU0sK0JBQU4sY0FBMkMsV0FBa0Q7QUFBQSxFQUs1RixZQUNrQixpQkFDa0Isa0JBQ1osc0JBQ3RCO0FBQ0QsVUFBTTtBQUpXO0FBQ2tCO0FBSnBDLFNBQWlCLGtCQUEyQztBQVMzRCxT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
