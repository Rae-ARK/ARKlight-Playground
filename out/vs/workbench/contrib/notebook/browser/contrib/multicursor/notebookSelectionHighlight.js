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
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Selection, SelectionDirection } from "../../../../../../editor/common/core/selection.js";
import { CursorChangeReason } from "../../../../../../editor/common/cursorEvents.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
let NotebookSelectionHighlighter = class extends Disposable {
  // right now this lets us mimic the more performant cache implementation of the text editor (doesn't need to be a delayer)
  // todo: in the future, implement caching and change to a 250ms delay upon recompute
  // private readonly runDelayer: Delayer<void> = this._register(new Delayer<void>(0));
  constructor(notebookEditor, configurationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.configurationService = configurationService;
    this.isEnabled = false;
    this.cellDecorationIds = /* @__PURE__ */ new Map();
    this.anchorDisposables = new DisposableStore();
    this.isEnabled = this.configurationService.getValue("editor.selectionHighlight");
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.selectionHighlight")) {
        this.isEnabled = this.configurationService.getValue("editor.selectionHighlight");
      }
    }));
    this._register(this.notebookEditor.onDidChangeActiveCell(async () => {
      if (!this.isEnabled) {
        return;
      }
      this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
      if (!this.anchorCell) {
        return;
      }
      const activeCell = this.notebookEditor.getActiveCell();
      if (!activeCell) {
        return;
      }
      if (!activeCell.editorAttached) {
        await Event.toPromise(activeCell.onDidChangeEditorAttachState);
      }
      this.clearNotebookSelectionDecorations();
      this.anchorDisposables.clear();
      this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorPosition((e) => {
        if (e.reason !== CursorChangeReason.Explicit) {
          this.clearNotebookSelectionDecorations();
          return;
        }
        if (!this.anchorCell) {
          return;
        }
        if (this.notebookEditor.hasModel()) {
          this.clearNotebookSelectionDecorations();
          this._update(this.notebookEditor);
        }
      }));
      if (this.notebookEditor.getEditorViewState().editorFocused && this.notebookEditor.hasModel()) {
        this._update(this.notebookEditor);
      }
    }));
  }
  _update(editor) {
    if (!this.anchorCell || !this.isEnabled) {
      return;
    }
    const textModel = this.anchorCell[0].textModel;
    if (!textModel || textModel.isTooLargeForTokenization()) {
      return;
    }
    const s = this.anchorCell[0].getSelections()[0];
    if (s.startLineNumber !== s.endLineNumber || s.isEmpty()) {
      return;
    }
    const searchText = this.getSearchText(s, textModel);
    if (!searchText) {
      return;
    }
    const results = editor.textModel.findMatches(
      searchText,
      false,
      true,
      null
    );
    for (const res of results) {
      const cell = editor.getCellByHandle(res.cell.handle);
      if (!cell) {
        continue;
      }
      this.updateCellDecorations(cell, res.matches);
    }
  }
  updateCellDecorations(cell, matches) {
    const selections = matches.map((m) => {
      return Selection.fromRange(m.range, SelectionDirection.LTR);
    });
    const newDecorations = [];
    selections?.map((selection) => {
      const isEmpty = selection.isEmpty();
      if (!isEmpty) {
        newDecorations.push({
          range: selection,
          options: {
            description: "",
            className: ".nb-selection-highlight"
          }
        });
      }
    });
    const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
    this.cellDecorationIds.set(cell, cell.deltaModelDecorations(
      oldDecorations,
      newDecorations
    ));
  }
  clearNotebookSelectionDecorations() {
    this.cellDecorationIds.forEach((_, cell) => {
      const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
      if (cellDecorations) {
        cell.deltaModelDecorations(cellDecorations, []);
        this.cellDecorationIds.delete(cell);
      }
    });
  }
  getSearchText(selection, model) {
    return model.getValueInRange(selection).replace(/\r\n/g, "\n");
  }
  dispose() {
    super.dispose();
    this.anchorDisposables.dispose();
  }
};
NotebookSelectionHighlighter.id = "notebook.selectionHighlighter";
NotebookSelectionHighlighter = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookSelectionHighlighter);
registerNotebookContribution(NotebookSelectionHighlighter.id, NotebookSelectionHighlighter);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9tdWx0aWN1cnNvci9ub3RlYm9va1NlbGVjdGlvbkhpZ2hsaWdodC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24sIFNlbGVjdGlvbkRpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZU5vdGVib29rRWRpdG9yLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5cbmNsYXNzIE5vdGVib29rU2VsZWN0aW9uSGlnaGxpZ2h0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQ6IHN0cmluZyA9ICdub3RlYm9vay5zZWxlY3Rpb25IaWdobGlnaHRlcic7XG5cdHByaXZhdGUgaXNFbmFibGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBjZWxsRGVjb3JhdGlvbklkcyA9IG5ldyBNYXA8SUNlbGxWaWV3TW9kZWwsIHN0cmluZ1tdPigpO1xuXHRwcml2YXRlIGFuY2hvckNlbGw6IFtJQ2VsbFZpZXdNb2RlbCwgSUNvZGVFZGl0b3JdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFuY2hvckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdC8vIHJpZ2h0IG5vdyB0aGlzIGxldHMgdXMgbWltaWMgdGhlIG1vcmUgcGVyZm9ybWFudCBjYWNoZSBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgdGV4dCBlZGl0b3IgKGRvZXNuJ3QgbmVlZCB0byBiZSBhIGRlbGF5ZXIpXG5cdC8vIHRvZG86IGluIHRoZSBmdXR1cmUsIGltcGxlbWVudCBjYWNoaW5nIGFuZCBjaGFuZ2UgdG8gYSAyNTBtcyBkZWxheSB1cG9uIHJlY29tcHV0ZVxuXHQvLyBwcml2YXRlIHJlYWRvbmx5IHJ1bkRlbGF5ZXI6IERlbGF5ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigwKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5pc0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3Iuc2VsZWN0aW9uSGlnaGxpZ2h0Jyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLnNlbGVjdGlvbkhpZ2hsaWdodCcpKSB7XG5cdFx0XHRcdHRoaXMuaXNFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLnNlbGVjdGlvbkhpZ2hsaWdodCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VBY3RpdmVDZWxsKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5pc0VuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFuY2hvckNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUNlbGxBbmRDb2RlRWRpdG9yO1xuXHRcdFx0aWYgKCF0aGlzLmFuY2hvckNlbGwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmVDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRBY3RpdmVDZWxsKCk7XG5cdFx0XHRpZiAoIWFjdGl2ZUNlbGwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFjdGl2ZUNlbGwuZWRpdG9yQXR0YWNoZWQpIHtcblx0XHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKGFjdGl2ZUNlbGwub25EaWRDaGFuZ2VFZGl0b3JBdHRhY2hTdGF0ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY2xlYXJOb3RlYm9va1NlbGVjdGlvbkRlY29yYXRpb25zKCk7XG5cblx0XHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuYW5jaG9yQ2VsbFsxXS5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLnJlYXNvbiAhPT0gQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhck5vdGVib29rU2VsZWN0aW9uRGVjb3JhdGlvbnMoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXRoaXMuYW5jaG9yQ2VsbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0XHR0aGlzLmNsZWFyTm90ZWJvb2tTZWxlY3Rpb25EZWNvcmF0aW9ucygpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZSh0aGlzLm5vdGVib29rRWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAodGhpcy5ub3RlYm9va0VkaXRvci5nZXRFZGl0b3JWaWV3U3RhdGUoKS5lZGl0b3JGb2N1c2VkICYmIHRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGUodGhpcy5ub3RlYm9va0VkaXRvcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKGVkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yKSB7XG5cdFx0aWYgKCF0aGlzLmFuY2hvckNlbGwgfHwgIXRoaXMuaXNFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVE9ETzogaXNUb29MYXJnZUZvclRva2VuaXphdGlvbiBjaGVjaywgbm90ZWJvb2sgZXF1aXZhbGVudD9cblx0XHQvLyB1bmxpa2VseSB0aGF0IGFueSBvbmUgY2VsbCdzIHRleHRtb2RlbCB3b3VsZCBiZSB0b28gbGFyZ2VcblxuXHRcdC8vIGdldCB0aGUgd29yZFxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuYW5jaG9yQ2VsbFswXS50ZXh0TW9kZWw7XG5cdFx0aWYgKCF0ZXh0TW9kZWwgfHwgdGV4dE1vZGVsLmlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzID0gdGhpcy5hbmNob3JDZWxsWzBdLmdldFNlbGVjdGlvbnMoKVswXTtcblx0XHRpZiAocy5zdGFydExpbmVOdW1iZXIgIT09IHMuZW5kTGluZU51bWJlciB8fCBzLmlzRW1wdHkoKSkge1xuXHRcdFx0Ly8gZW1wdHkgc2VsZWN0aW9ucyBkbyBub3RoaW5nXG5cdFx0XHQvLyBtdWx0aWxpbmUgZm9yYmlkZGVuIGZvciBwZXJmIHJlYXNvbnNcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VhcmNoVGV4dCA9IHRoaXMuZ2V0U2VhcmNoVGV4dChzLCB0ZXh0TW9kZWwpO1xuXHRcdGlmICghc2VhcmNoVGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBlZGl0b3IudGV4dE1vZGVsLmZpbmRNYXRjaGVzKFxuXHRcdFx0c2VhcmNoVGV4dCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG51bGwsXG5cdFx0KTtcblxuXHRcdGZvciAoY29uc3QgcmVzIG9mIHJlc3VsdHMpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSBlZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKHJlcy5jZWxsLmhhbmRsZSk7XG5cdFx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlQ2VsbERlY29yYXRpb25zKGNlbGwsIHJlcy5tYXRjaGVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNlbGxEZWNvcmF0aW9ucyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgbWF0Y2hlczogRmluZE1hdGNoW10pIHtcblx0XHRjb25zdCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IG1hdGNoZXMubWFwKG0gPT4ge1xuXHRcdFx0cmV0dXJuIFNlbGVjdGlvbi5mcm9tUmFuZ2UobS5yYW5nZSwgU2VsZWN0aW9uRGlyZWN0aW9uLkxUUik7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBuZXdEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRzZWxlY3Rpb25zPy5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdGNvbnN0IGlzRW1wdHkgPSBzZWxlY3Rpb24uaXNFbXB0eSgpO1xuXG5cdFx0XHRpZiAoIWlzRW1wdHkpIHtcblx0XHRcdFx0bmV3RGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2U6IHNlbGVjdGlvbixcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdFx0XHRjbGFzc05hbWU6ICcubmItc2VsZWN0aW9uLWhpZ2hsaWdodCcsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IG9sZERlY29yYXRpb25zID0gdGhpcy5jZWxsRGVjb3JhdGlvbklkcy5nZXQoY2VsbCkgPz8gW107XG5cdFx0dGhpcy5jZWxsRGVjb3JhdGlvbklkcy5zZXQoY2VsbCwgY2VsbC5kZWx0YU1vZGVsRGVjb3JhdGlvbnMoXG5cdFx0XHRvbGREZWNvcmF0aW9ucyxcblx0XHRcdG5ld0RlY29yYXRpb25zXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyTm90ZWJvb2tTZWxlY3Rpb25EZWNvcmF0aW9ucygpIHtcblx0XHR0aGlzLmNlbGxEZWNvcmF0aW9uSWRzLmZvckVhY2goKF8sIGNlbGwpID0+IHtcblx0XHRcdGNvbnN0IGNlbGxEZWNvcmF0aW9ucyA9IHRoaXMuY2VsbERlY29yYXRpb25JZHMuZ2V0KGNlbGwpID8/IFtdO1xuXHRcdFx0aWYgKGNlbGxEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRjZWxsLmRlbHRhTW9kZWxEZWNvcmF0aW9ucyhjZWxsRGVjb3JhdGlvbnMsIFtdKTtcblx0XHRcdFx0dGhpcy5jZWxsRGVjb3JhdGlvbklkcy5kZWxldGUoY2VsbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlYXJjaFRleHQoc2VsZWN0aW9uOiBTZWxlY3Rpb24sIG1vZGVsOiBJVGV4dE1vZGVsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbikucmVwbGFjZSgvXFxyXFxuL2csICdcXG4nKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24oTm90ZWJvb2tTZWxlY3Rpb25IaWdobGlnaHRlci5pZCwgTm90ZWJvb2tTZWxlY3Rpb25IaWdobGlnaHRlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVksdUJBQXVCO0FBRTVDLFNBQVMsV0FBVywwQkFBMEI7QUFDOUMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxvQ0FBb0M7QUFFN0MsSUFBTSwrQkFBTixjQUEyQyxXQUFrRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBYTVGLFlBQ2tCLGdCQUN1QixzQkFDdkM7QUFDRCxVQUFNO0FBSFc7QUFDdUI7QUFaekMsU0FBUSxZQUFxQjtBQUU3QixTQUFRLG9CQUFvQixvQkFBSSxJQUE4QjtBQUU5RCxTQUFpQixvQkFBb0IsSUFBSSxnQkFBZ0I7QUFZeEQsU0FBSyxZQUFZLEtBQUsscUJBQXFCLFNBQWtCLDJCQUEyQjtBQUN4RixTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE9BQUs7QUFDdEUsVUFBSSxFQUFFLHFCQUFxQiwyQkFBMkIsR0FBRztBQUN4RCxhQUFLLFlBQVksS0FBSyxxQkFBcUIsU0FBa0IsMkJBQTJCO0FBQUEsTUFDekY7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLGVBQWUsc0JBQXNCLFlBQVk7QUFDcEUsVUFBSSxDQUFDLEtBQUssV0FBVztBQUNwQjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGFBQWEsS0FBSyxlQUFlO0FBQ3RDLFVBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckI7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUFhLEtBQUssZUFBZSxjQUFjO0FBQ3JELFVBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsTUFDRDtBQUVB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
