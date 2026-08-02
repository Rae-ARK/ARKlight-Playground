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
import { URI } from "../../../../../../base/common/uri.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { IDebugService } from "../../../../debug/common/debug.js";
import { CellUri } from "../../../common/notebookCommon.js";
import { CellExecutionUpdateType } from "../../../common/notebookExecutionService.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
let NotebookCellPausing = class extends Disposable {
  constructor(_debugService, _notebookExecutionStateService) {
    super();
    this._debugService = _debugService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this._pausedCells = /* @__PURE__ */ new Set();
    this._register(_debugService.getModel().onDidChangeCallStack(() => {
      this.onDidChangeCallStack(true);
      this._scheduler.schedule();
    }));
    this._scheduler = this._register(new RunOnceScheduler(() => this.onDidChangeCallStack(false), 2e3));
  }
  async onDidChangeCallStack(fallBackOnStaleCallstack) {
    const newPausedCells = /* @__PURE__ */ new Set();
    for (const session of this._debugService.getModel().getSessions()) {
      for (const thread of session.getAllThreads()) {
        let callStack = thread.getCallStack();
        if (fallBackOnStaleCallstack && !callStack.length) {
          callStack = thread.getStaleCallStack();
        }
        callStack.forEach((sf) => {
          const parsed = CellUri.parse(sf.source.uri);
          if (parsed) {
            newPausedCells.add(sf.source.uri.toString());
            this.editIsPaused(sf.source.uri, true);
          }
        });
      }
    }
    for (const uri of this._pausedCells) {
      if (!newPausedCells.has(uri)) {
        this.editIsPaused(URI.parse(uri), false);
        this._pausedCells.delete(uri);
      }
    }
    newPausedCells.forEach((cell) => this._pausedCells.add(cell));
  }
  editIsPaused(cellUri, isPaused) {
    const parsed = CellUri.parse(cellUri);
    if (parsed) {
      const exeState = this._notebookExecutionStateService.getCellExecution(cellUri);
      if (exeState && (exeState.isPaused !== isPaused || !exeState.didPause)) {
        exeState.update([{
          editType: CellExecutionUpdateType.ExecutionState,
          didPause: true,
          isPaused
        }]);
      }
    }
  }
};
NotebookCellPausing = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, INotebookExecutionStateService)
], NotebookCellPausing);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookCellPausing, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9kZWJ1Zy9ub3RlYm9va0NlbGxQYXVzaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgVGhyZWFkIH0gZnJvbSAnLi4vLi4vLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDZWxsRXhlY3V0aW9uVXBkYXRlVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jbGFzcyBOb3RlYm9va0NlbGxQYXVzaW5nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXVzZWRDZWxscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgX3NjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2RlYnVnU2VydmljZS5nZXRNb2RlbCgpLm9uRGlkQ2hhbmdlQ2FsbFN0YWNrKCgpID0+IHtcblx0XHRcdC8vIEZpcnN0IHVwZGF0ZSB1c2luZyB0aGUgc3RhbGUgY2FsbHN0YWNrIGlmIHRoZSByZWFsIGNhbGxzdGFjayBpcyBlbXB0eSwgdG8gcmVkdWNlIGJsaW5raW5nIHdoaWxlIHN0ZXBwaW5nLlxuXHRcdFx0Ly8gQWZ0ZXIgbm90IHBhdXNpbmcgZm9yIDJzLCB1cGRhdGUgYWdhaW4gd2l0aCB0aGUgbGF0ZXN0IGNhbGxzdGFjay5cblx0XHRcdHRoaXMub25EaWRDaGFuZ2VDYWxsU3RhY2sodHJ1ZSk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5vbkRpZENoYW5nZUNhbGxTdGFjayhmYWxzZSksIDIwMDApKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRDaGFuZ2VDYWxsU3RhY2soZmFsbEJhY2tPblN0YWxlQ2FsbHN0YWNrOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmV3UGF1c2VkQ2VsbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBzZXNzaW9uLmdldEFsbFRocmVhZHMoKSkge1xuXHRcdFx0XHRsZXQgY2FsbFN0YWNrID0gdGhyZWFkLmdldENhbGxTdGFjaygpO1xuXHRcdFx0XHRpZiAoZmFsbEJhY2tPblN0YWxlQ2FsbHN0YWNrICYmICFjYWxsU3RhY2subGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y2FsbFN0YWNrID0gKHRocmVhZCBhcyBUaHJlYWQpLmdldFN0YWxlQ2FsbFN0YWNrKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYWxsU3RhY2suZm9yRWFjaChzZiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gQ2VsbFVyaS5wYXJzZShzZi5zb3VyY2UudXJpKTtcblx0XHRcdFx0XHRpZiAocGFyc2VkKSB7XG5cdFx0XHRcdFx0XHRuZXdQYXVzZWRDZWxscy5hZGQoc2Yuc291cmNlLnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdHRoaXMuZWRpdElzUGF1c2VkKHNmLnNvdXJjZS51cmksIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgdGhpcy5fcGF1c2VkQ2VsbHMpIHtcblx0XHRcdGlmICghbmV3UGF1c2VkQ2VsbHMuaGFzKHVyaSkpIHtcblx0XHRcdFx0dGhpcy5lZGl0SXNQYXVzZWQoVVJJLnBhcnNlKHVyaSksIGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fcGF1c2VkQ2VsbHMuZGVsZXRlKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bmV3UGF1c2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHRoaXMuX3BhdXNlZENlbGxzLmFkZChjZWxsKSk7XG5cdH1cblxuXHRwcml2YXRlIGVkaXRJc1BhdXNlZChjZWxsVXJpOiBVUkksIGlzUGF1c2VkOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gQ2VsbFVyaS5wYXJzZShjZWxsVXJpKTtcblx0XHRpZiAocGFyc2VkKSB7XG5cdFx0XHRjb25zdCBleGVTdGF0ZSA9IHRoaXMuX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24oY2VsbFVyaSk7XG5cdFx0XHRpZiAoZXhlU3RhdGUgJiYgKGV4ZVN0YXRlLmlzUGF1c2VkICE9PSBpc1BhdXNlZCB8fCAhZXhlU3RhdGUuZGlkUGF1c2UpKSB7XG5cdFx0XHRcdGV4ZVN0YXRlLnVwZGF0ZShbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRXhlY3V0aW9uVXBkYXRlVHlwZS5FeGVjdXRpb25TdGF0ZSxcblx0XHRcdFx0XHRkaWRQYXVzZTogdHJ1ZSxcblx0XHRcdFx0XHRpc1BhdXNlZFxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihOb3RlYm9va0NlbGxQYXVzaW5nLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWMsMkJBQW9GO0FBQzNHLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHNCQUFzQjtBQUUvQixJQUFNLHNCQUFOLGNBQWtDLFdBQTZDO0FBQUEsRUFLOUUsWUFDaUMsZUFDaUIsZ0NBQ2hEO0FBQ0QsVUFBTTtBQUgwQjtBQUNpQjtBQU5sRCxTQUFpQixlQUFlLG9CQUFJLElBQVk7QUFVL0MsU0FBSyxVQUFVLGNBQWMsU0FBUyxFQUFFLHFCQUFxQixNQUFNO0FBR2xFLFdBQUsscUJBQXFCLElBQUk7QUFDOUIsV0FBSyxXQUFXLFNBQVM7QUFBQSxJQUMxQixDQUFDLENBQUM7QUFDRixTQUFLLGFBQWEsS0FBSyxVQUFVLElBQUksaUJBQWlCLE1BQU0sS0FBSyxxQkFBcUIsS0FBSyxHQUFHLEdBQUksQ0FBQztBQUFBLEVBQ3BHO0FBQUEsRUFFQSxNQUFjLHFCQUFxQiwwQkFBa0Q7QUFDcEYsVUFBTSxpQkFBaUIsb0JBQUksSUFBWTtBQUV2QyxlQUFXLFdBQVcsS0FBSyxjQUFjLFNBQVMsRUFBRSxZQUFZLEdBQUc7QUFDbEUsaUJBQVcsVUFBVSxRQUFRLGNBQWMsR0FBRztBQUM3QyxZQUFJLFlBQVksT0FBTyxhQUFhO0FBQ3BDLFlBQUksNEJBQTRCLENBQUMsVUFBVSxRQUFRO0FBQ2xELHNCQUFhLE9BQWtCLGtCQUFrQjtBQUFBLFFBQ2xEO0FBRUEsa0JBQVUsUUFBUSxRQUFNO0FBQ3ZCLGdCQUFNLFNBQVMsUUFBUSxNQUFNLEdBQUcsT0FBTyxHQUFHO0FBQzFDLGNBQUksUUFBUTtBQUNYLDJCQUFlLElBQUksR0FBRyxPQUFPLElBQUksU0FBUyxDQUFDO0FBQzNDLGlCQUFLLGFBQWEsR0FBRyxPQUFPLEtBQUssSUFBSTtBQUFBLFVBQ3RDO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxlQUFXLE9BQU8sS0FBSyxjQUFjO0FBQ3BDLFVBQUksQ0FBQyxlQUFlLElBQUksR0FBRyxHQUFHO0FBQzdCLGFBQUssYUFBYSxJQUFJLE1BQU0sR0FBRyxHQUFHLEtBQUs7QUFDdkMsYUFBSyxhQUFhLE9BQU8sR0FBRztBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUVBLG1CQUFlLFFBQVEsVUFBUSxLQUFLLGFBQWEsSUFBSSxJQUFJLENBQUM7QUFBQSxFQUMzRDtBQUFBLEVBRVEsYUFBYSxTQUFjLFVBQW1CO0FBQ3JELFVBQU0sU0FBUyxRQUFRLE1BQU0sT0FBTztBQUNwQyxRQUFJLFFBQVE7QUFDWCxZQUFNLFdBQVcsS0FBSywrQkFBK0IsaUJBQWlCLE9BQU87QUFDN0UsVUFBSSxhQUFhLFNBQVMsYUFBYSxZQUFZLENBQUMsU0FBUyxXQUFXO0FBQ3ZFLGlCQUFTLE9BQU8sQ0FBQztBQUFBLFVBQ2hCLFVBQVUsd0JBQXdCO0FBQUEsVUFDbEMsVUFBVTtBQUFBLFVBQ1Y7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBL0RNLHNCQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBaUVOLFNBQVMsR0FBb0Msb0JBQW9CLFNBQVMsRUFBRSw4QkFBOEIscUJBQXFCLGVBQWUsUUFBUTsiLAogICJuYW1lcyI6IFtdCn0K
