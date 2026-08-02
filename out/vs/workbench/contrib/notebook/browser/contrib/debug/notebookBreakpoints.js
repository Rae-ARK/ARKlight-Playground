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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { IDebugService } from "../../../../debug/common/debug.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { CellUri, NotebookCellsChangeType } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { hasKey } from "../../../../../../base/common/types.js";
let NotebookBreakpoints = class extends Disposable {
  constructor(_debugService, _notebookService, _editorService) {
    super();
    this._debugService = _debugService;
    this._editorService = _editorService;
    const listeners = new ResourceMap();
    this._register(_notebookService.onWillAddNotebookDocument((model) => {
      listeners.set(model.uri, model.onWillAddRemoveCells((e) => {
        const debugModel = this._debugService.getModel();
        if (!debugModel.getBreakpoints().length) {
          return;
        }
        if (e.rawEvent.kind !== NotebookCellsChangeType.ModelChange) {
          return;
        }
        for (const change of e.rawEvent.changes) {
          const [start, deleteCount] = change;
          if (deleteCount > 0) {
            const deleted = model.cells.slice(start, start + deleteCount);
            for (const deletedCell of deleted) {
              const cellBps = debugModel.getBreakpoints({ uri: deletedCell.uri });
              cellBps.forEach((cellBp) => this._debugService.removeBreakpoints(cellBp.getId()));
            }
          }
        }
      }));
    }));
    this._register(_notebookService.onWillRemoveNotebookDocument((model) => {
      this.updateBreakpoints(model);
      listeners.get(model.uri)?.dispose();
      listeners.delete(model.uri);
    }));
    this._register(this._debugService.getModel().onDidChangeBreakpoints((e) => {
      const newCellBp = e?.added?.find((bp) => hasKey(bp, { uri: true }) && bp.uri.scheme === Schemas.vscodeNotebookCell);
      if (newCellBp) {
        const parsed = CellUri.parse(newCellBp.uri);
        if (!parsed) {
          return;
        }
        const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        if (!editor || !editor.hasModel() || editor.textModel.uri.toString() !== parsed.notebook.toString()) {
          return;
        }
        const cell = editor.getCellByHandle(parsed.handle);
        if (!cell) {
          return;
        }
        editor.focusElement(cell);
      }
    }));
  }
  updateBreakpoints(model) {
    const bps = this._debugService.getModel().getBreakpoints();
    if (!bps.length || !model.cells.length) {
      return;
    }
    const idxMap = new ResourceMap();
    model.cells.forEach((cell, i) => {
      idxMap.set(cell.uri, i);
    });
    bps.forEach((bp) => {
      const idx = idxMap.get(bp.uri);
      if (typeof idx !== "number") {
        return;
      }
      const notebook = CellUri.parse(bp.uri)?.notebook;
      if (!notebook) {
        return;
      }
      const newUri = CellUri.generate(notebook, idx);
      if (isEqual(newUri, bp.uri)) {
        return;
      }
      this._debugService.removeBreakpoints(bp.getId());
      this._debugService.addBreakpoints(newUri, [
        {
          column: bp.column,
          condition: bp.condition,
          enabled: bp.enabled,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          lineNumber: bp.lineNumber
        }
      ]);
    });
  }
};
NotebookBreakpoints = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, INotebookService),
  __decorateParam(2, IEditorService)
], NotebookBreakpoints);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookBreakpoints, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9kZWJ1Zy9ub3RlYm9va0JyZWFrcG9pbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQnJlYWtwb2ludCwgSURlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxVcmksIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5jbGFzcyBOb3RlYm9va0JyZWFrcG9pbnRzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rU2VydmljZS5vbldpbGxBZGROb3RlYm9va0RvY3VtZW50KG1vZGVsID0+IHtcblx0XHRcdGxpc3RlbmVycy5zZXQobW9kZWwudXJpLCBtb2RlbC5vbldpbGxBZGRSZW1vdmVDZWxscyhlID0+IHtcblx0XHRcdFx0Ly8gV2hlbiBkZWxldGluZyBhIGNlbGwsIHJlbW92ZSBpdHMgYnJlYWtwb2ludHNcblx0XHRcdFx0Y29uc3QgZGVidWdNb2RlbCA9IHRoaXMuX2RlYnVnU2VydmljZS5nZXRNb2RlbCgpO1xuXHRcdFx0XHRpZiAoIWRlYnVnTW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZS5yYXdFdmVudC5raW5kICE9PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGUucmF3RXZlbnQuY2hhbmdlcykge1xuXHRcdFx0XHRcdGNvbnN0IFtzdGFydCwgZGVsZXRlQ291bnRdID0gY2hhbmdlO1xuXHRcdFx0XHRcdGlmIChkZWxldGVDb3VudCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRlbGV0ZWQgPSBtb2RlbC5jZWxscy5zbGljZShzdGFydCwgc3RhcnQgKyBkZWxldGVDb3VudCk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGRlbGV0ZWRDZWxsIG9mIGRlbGV0ZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2VsbEJwcyA9IGRlYnVnTW9kZWwuZ2V0QnJlYWtwb2ludHMoeyB1cmk6IGRlbGV0ZWRDZWxsLnVyaSB9KTtcblx0XHRcdFx0XHRcdFx0Y2VsbEJwcy5mb3JFYWNoKGNlbGxCcCA9PiB0aGlzLl9kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoY2VsbEJwLmdldElkKCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihfbm90ZWJvb2tTZXJ2aWNlLm9uV2lsbFJlbW92ZU5vdGVib29rRG9jdW1lbnQobW9kZWwgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVCcmVha3BvaW50cyhtb2RlbCk7XG5cdFx0XHRsaXN0ZW5lcnMuZ2V0KG1vZGVsLnVyaSk/LmRpc3Bvc2UoKTtcblx0XHRcdGxpc3RlbmVycy5kZWxldGUobW9kZWwudXJpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKGUgPT4ge1xuXHRcdFx0Y29uc3QgbmV3Q2VsbEJwID0gZT8uYWRkZWQ/LmZpbmQoYnAgPT4gaGFzS2V5KGJwLCB7IHVyaTogdHJ1ZSB9KSAmJiBicC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCkgYXMgSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobmV3Q2VsbEJwKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZCA9IENlbGxVcmkucGFyc2UobmV3Q2VsbEJwLnVyaSk7XG5cdFx0XHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdFx0XHRpZiAoIWVkaXRvciB8fCAhZWRpdG9yLmhhc01vZGVsKCkgfHwgZWRpdG9yLnRleHRNb2RlbC51cmkudG9TdHJpbmcoKSAhPT0gcGFyc2VkLm5vdGVib29rLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBlZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKHBhcnNlZC5oYW5kbGUpO1xuXHRcdFx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlZGl0b3IuZm9jdXNFbGVtZW50KGNlbGwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQnJlYWtwb2ludHMobW9kZWw6IE5vdGVib29rVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgYnBzID0gdGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoKTtcblx0XHRpZiAoIWJwcy5sZW5ndGggfHwgIW1vZGVsLmNlbGxzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlkeE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxudW1iZXI+KCk7XG5cdFx0bW9kZWwuY2VsbHMuZm9yRWFjaCgoY2VsbCwgaSkgPT4ge1xuXHRcdFx0aWR4TWFwLnNldChjZWxsLnVyaSwgaSk7XG5cdFx0fSk7XG5cblx0XHRicHMuZm9yRWFjaChicCA9PiB7XG5cdFx0XHRjb25zdCBpZHggPSBpZHhNYXAuZ2V0KGJwLnVyaSk7XG5cdFx0XHRpZiAodHlwZW9mIGlkeCAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub3RlYm9vayA9IENlbGxVcmkucGFyc2UoYnAudXJpKT8ubm90ZWJvb2s7XG5cdFx0XHRpZiAoIW5vdGVib29rKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3VXJpID0gQ2VsbFVyaS5nZW5lcmF0ZShub3RlYm9vaywgaWR4KTtcblx0XHRcdGlmIChpc0VxdWFsKG5ld1VyaSwgYnAudXJpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2RlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicC5nZXRJZCgpKTtcblx0XHRcdHRoaXMuX2RlYnVnU2VydmljZS5hZGRCcmVha3BvaW50cyhuZXdVcmksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbHVtbjogYnAuY29sdW1uLFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogYnAuY29uZGl0aW9uLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGJwLmVuYWJsZWQsXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uOiBicC5oaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZTogYnAubG9nTWVzc2FnZSxcblx0XHRcdFx0XHRsaW5lTnVtYmVyOiBicC5saW5lTnVtYmVyXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihOb3RlYm9va0JyZWFrcG9pbnRzLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIs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
