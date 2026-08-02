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
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { CellEditState, getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { RedoCommand, UndoCommand } from "../../../../../../editor/browser/editorExtensions.js";
let NotebookUndoRedoContribution = class extends Disposable {
  constructor(_editorService) {
    super();
    this._editorService = _editorService;
    const PRIORITY = 105;
    this._register(UndoCommand.addImplementation(PRIORITY, "notebook-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      const viewModel = editor?.getViewModel();
      if (editor && editor.hasEditorFocus() && editor.hasModel() && viewModel) {
        return viewModel.undo().then((cellResources) => {
          if (cellResources?.length) {
            for (let i = 0; i < editor.getLength(); i++) {
              const cell = editor.cellAt(i);
              if (cell.cellKind === CellKind.Markup && cellResources.find((resource) => resource.fragment === cell.model.uri.fragment)) {
                cell.updateEditState(CellEditState.Editing, "undo");
              }
            }
            editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
          }
        });
      }
      return false;
    }));
    this._register(RedoCommand.addImplementation(PRIORITY, "notebook-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      const viewModel = editor?.getViewModel();
      if (editor && editor.hasEditorFocus() && editor.hasModel() && viewModel) {
        return viewModel.redo().then((cellResources) => {
          if (cellResources?.length) {
            for (let i = 0; i < editor.getLength(); i++) {
              const cell = editor.cellAt(i);
              if (cell.cellKind === CellKind.Markup && cellResources.find((resource) => resource.fragment === cell.model.uri.fragment)) {
                cell.updateEditState(CellEditState.Editing, "redo");
              }
            }
            editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
          }
        });
      }
      return false;
    }));
  }
};
NotebookUndoRedoContribution.ID = "workbench.contrib.notebookUndoRedo";
NotebookUndoRedoContribution = __decorateClass([
  __decorateParam(0, IEditorService)
], NotebookUndoRedoContribution);
registerWorkbenchContribution2(NotebookUndoRedoContribution.ID, NotebookUndoRedoContribution, WorkbenchPhase.BlockRestore);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi91bmRvUmVkby9ub3RlYm9va1VuZG9SZWRvLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBSZWRvQ29tbWFuZCwgVW5kb0NvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL25vdGVib29rVmlld01vZGVsSW1wbC5qcyc7XG5cbmNsYXNzIE5vdGVib29rVW5kb1JlZG9Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubm90ZWJvb2tVbmRvUmVkbyc7XG5cblx0Y29uc3RydWN0b3IoQElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IFBSSU9SSVRZID0gMTA1O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFVuZG9Db21tYW5kLmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnbm90ZWJvb2stdW5kby1yZWRvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yPy5nZXRWaWV3TW9kZWwoKSBhcyBOb3RlYm9va1ZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChlZGl0b3IgJiYgZWRpdG9yLmhhc0VkaXRvckZvY3VzKCkgJiYgZWRpdG9yLmhhc01vZGVsKCkgJiYgdmlld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybiB2aWV3TW9kZWwudW5kbygpLnRoZW4oY2VsbFJlc291cmNlcyA9PiB7XG5cdFx0XHRcdFx0aWYgKGNlbGxSZXNvdXJjZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlZGl0b3IuZ2V0TGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjZWxsID0gZWRpdG9yLmNlbGxBdChpKTtcblx0XHRcdFx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsUmVzb3VyY2VzLmZpbmQocmVzb3VyY2UgPT4gcmVzb3VyY2UuZnJhZ21lbnQgPT09IGNlbGwubW9kZWwudXJpLmZyYWdtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuRWRpdGluZywgJ3VuZG8nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRlZGl0b3I/LnNldE9wdGlvbnMoeyBjZWxsT3B0aW9uczogeyByZXNvdXJjZTogY2VsbFJlc291cmNlc1swXSB9LCBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihSZWRvQ29tbWFuZC5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLXVuZG8tcmVkbycsICgpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvcj8uZ2V0Vmlld01vZGVsKCkgYXMgTm90ZWJvb2tWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChlZGl0b3IgJiYgZWRpdG9yLmhhc0VkaXRvckZvY3VzKCkgJiYgZWRpdG9yLmhhc01vZGVsKCkgJiYgdmlld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybiB2aWV3TW9kZWwucmVkbygpLnRoZW4oY2VsbFJlc291cmNlcyA9PiB7XG5cdFx0XHRcdFx0aWYgKGNlbGxSZXNvdXJjZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlZGl0b3IuZ2V0TGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjZWxsID0gZWRpdG9yLmNlbGxBdChpKTtcblx0XHRcdFx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsUmVzb3VyY2VzLmZpbmQocmVzb3VyY2UgPT4gcmVzb3VyY2UuZnJhZ21lbnQgPT09IGNlbGwubW9kZWwudXJpLmZyYWdtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuRWRpdGluZywgJ3JlZG8nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRlZGl0b3I/LnNldE9wdGlvbnMoeyBjZWxsT3B0aW9uczogeyByZXNvdXJjZTogY2VsbFJlc291cmNlc1swXSB9LCBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE5vdGVib29rVW5kb1JlZG9Db250cmlidXRpb24uSUQsIE5vdGVib29rVW5kb1JlZG9Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCLHNDQUFzQztBQUMvRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWUsdUNBQXVDO0FBQy9ELFNBQVMsYUFBYSxtQkFBbUI7QUFHekMsSUFBTSwrQkFBTixjQUEyQyxXQUFXO0FBQUEsRUFJckQsWUFBNkMsZ0JBQWdDO0FBQzVFLFVBQU07QUFEc0M7QUFHNUMsVUFBTSxXQUFXO0FBQ2pCLFNBQUssVUFBVSxZQUFZLGtCQUFrQixVQUFVLHNCQUFzQixNQUFNO0FBQ2xGLFlBQU0sU0FBUyxnQ0FBZ0MsS0FBSyxlQUFlLGdCQUFnQjtBQUNuRixZQUFNLFlBQVksUUFBUSxhQUFhO0FBQ3ZDLFVBQUksVUFBVSxPQUFPLGVBQWUsS0FBSyxPQUFPLFNBQVMsS0FBSyxXQUFXO0FBQ3hFLGVBQU8sVUFBVSxLQUFLLEVBQUUsS0FBSyxtQkFBaUI7QUFDN0MsY0FBSSxlQUFlLFFBQVE7QUFDMUIscUJBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxVQUFVLEdBQUcsS0FBSztBQUM1QyxvQkFBTSxPQUFPLE9BQU8sT0FBTyxDQUFDO0FBQzVCLGtCQUFJLEtBQUssYUFBYSxTQUFTLFVBQVUsY0FBYyxLQUFLLGNBQVksU0FBUyxhQUFhLEtBQUssTUFBTSxJQUFJLFFBQVEsR0FBRztBQUN2SCxxQkFBSyxnQkFBZ0IsY0FBYyxTQUFTLE1BQU07QUFBQSxjQUNuRDtBQUFBLFlBQ0Q7QUFFQSxvQkFBUSxXQUFXLEVBQUUsYUFBYSxFQUFFLFVBQVUsY0FBYyxDQUFDLEVBQUUsR0FBRyxlQUFlLEtBQUssQ0FBQztBQUFBLFVBQ3hGO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUVBLGFBQU87QUFBQSxJQUNSLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxZQUFZLGtCQUFrQixVQUFVLHNCQUFzQixNQUFNO0FBQ2xGLFlBQU0sU0FBUyxnQ0FBZ0MsS0FBSyxlQUFlLGdCQUFnQjtBQUNuRixZQUFNLFlBQVksUUFBUSxhQUFhO0FBRXZDLFVBQUksVUFBVSxPQUFPLGVBQWUsS0FBSyxPQUFPLFNBQVMsS0FBSyxXQUFXO0FBQ3hFLGVBQU8sVUFBVSxLQUFLLEVBQUUsS0FBSyxtQkFBaUI7QUFDN0MsY0FBSSxlQUFlLFFBQVE7QUFDMUIscUJBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxVQUFVLEdBQUcsS0FBSztBQUM1QyxvQkFBTSxPQUFPLE9BQU8sT0FBTyxDQUFDO0FBQzVCLGtCQUFJLEtBQUssYUFBYSxTQUFTLFVBQVUsY0FBYyxLQUFLLGNBQVksU0FBUyxhQUFhLEtBQUssTUFBTSxJQUFJLFFBQVEsR0FBRztBQUN2SCxxQkFBSyxnQkFBZ0IsY0FBYyxTQUFTLE1BQU07QUFBQSxjQUNuRDtBQUFBLFlBQ0Q7QUFFQSxvQkFBUSxXQUFXLEVBQUUsYUFBYSxFQUFFLFVBQVUsY0FBYyxDQUFDLEVBQUUsR0FBRyxlQUFlLEtBQUssQ0FBQztBQUFBLFVBQ3hGO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUVBLGFBQU87QUFBQSxJQUNSLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQW5ETSw2QkFFVyxLQUFLO0FBRmhCLCtCQUFOO0FBQUEsRUFJYztBQUFBLEdBSlI7QUFxRE4sK0JBQStCLDZCQUE2QixJQUFJLDhCQUE4QixlQUFlLFlBQVk7IiwKICAibmFtZXMiOiBbXQp9Cg==
