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
import { IFileService } from "../../../../platform/files/common/files.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ResourceFileEdit, ResourceTextEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { ResourceNotebookCellEdit } from "./bulkCellEdits.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let ConflictDetector = class {
  constructor(edits, fileService, modelService, logService) {
    this._conflicts = new ResourceMap();
    this._disposables = new DisposableStore();
    this._onDidConflict = new Emitter();
    this.onDidConflict = this._onDidConflict.event;
    const _workspaceEditResources = new ResourceMap();
    for (const edit of edits) {
      if (edit instanceof ResourceTextEdit) {
        _workspaceEditResources.set(edit.resource, true);
        if (typeof edit.versionId === "number") {
          const model = modelService.getModel(edit.resource);
          if (model && model.getVersionId() !== edit.versionId) {
            this._conflicts.set(edit.resource, true);
            this._onDidConflict.fire(this);
          }
        }
      } else if (edit instanceof ResourceFileEdit) {
        if (edit.newResource) {
          _workspaceEditResources.set(edit.newResource, true);
        } else if (edit.oldResource) {
          _workspaceEditResources.set(edit.oldResource, true);
        }
      } else if (edit instanceof ResourceNotebookCellEdit) {
        _workspaceEditResources.set(edit.resource, true);
      } else {
        logService.warn("UNKNOWN edit type", edit);
      }
    }
    this._disposables.add(fileService.onDidFilesChange((e) => {
      for (const uri of _workspaceEditResources.keys()) {
        if (!modelService.getModel(uri) && e.contains(uri)) {
          this._conflicts.set(uri, true);
          this._onDidConflict.fire(this);
          break;
        }
      }
    }));
    const onDidChangeModel = (model) => {
      if (_workspaceEditResources.has(model.uri)) {
        this._conflicts.set(model.uri, true);
        this._onDidConflict.fire(this);
      }
    };
    for (const model of modelService.getModels()) {
      this._disposables.add(model.onDidChangeContent(() => onDidChangeModel(model)));
    }
  }
  dispose() {
    this._disposables.dispose();
    this._onDidConflict.dispose();
  }
  list() {
    return [...this._conflicts.keys()];
  }
  hasConflicts() {
    return this._conflicts.size > 0;
  }
};
ConflictDetector = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ILogService)
], ConflictDetector);
export {
  ConflictDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvY29uZmxpY3RzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUVkaXQsIFJlc291cmNlRmlsZUVkaXQsIFJlc291cmNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0IH0gZnJvbSAnLi9idWxrQ2VsbEVkaXRzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY2xhc3MgQ29uZmxpY3REZXRlY3RvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmxpY3RzID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29uZmxpY3QgPSBuZXcgRW1pdHRlcjx0aGlzPigpO1xuXHRyZWFkb25seSBvbkRpZENvbmZsaWN0OiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkQ29uZmxpY3QuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdHM6IFJlc291cmNlRWRpdFtdLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdGNvbnN0IF93b3Jrc3BhY2VFZGl0UmVzb3VyY2VzID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VUZXh0RWRpdCkge1xuXHRcdFx0XHRfd29ya3NwYWNlRWRpdFJlc291cmNlcy5zZXQoZWRpdC5yZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdGlmICh0eXBlb2YgZWRpdC52ZXJzaW9uSWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwoZWRpdC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKG1vZGVsICYmIG1vZGVsLmdldFZlcnNpb25JZCgpICE9PSBlZGl0LnZlcnNpb25JZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29uZmxpY3RzLnNldChlZGl0LnJlc291cmNlLCB0cnVlKTtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ29uZmxpY3QuZmlyZSh0aGlzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VGaWxlRWRpdCkge1xuXHRcdFx0XHRpZiAoZWRpdC5uZXdSZXNvdXJjZSkge1xuXHRcdFx0XHRcdF93b3Jrc3BhY2VFZGl0UmVzb3VyY2VzLnNldChlZGl0Lm5ld1Jlc291cmNlLCB0cnVlKTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKGVkaXQub2xkUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRfd29ya3NwYWNlRWRpdFJlc291cmNlcy5zZXQoZWRpdC5vbGRSZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZWRpdCBpbnN0YW5jZW9mIFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdCkge1xuXHRcdFx0XHRfd29ya3NwYWNlRWRpdFJlc291cmNlcy5zZXQoZWRpdC5yZXNvdXJjZSwgdHJ1ZSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2Uud2FybignVU5LTk9XTiBlZGl0IHR5cGUnLCBlZGl0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBsaXN0ZW4gdG8gZmlsZSBjaGFuZ2VzXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIF93b3Jrc3BhY2VFZGl0UmVzb3VyY2VzLmtleXMoKSkge1xuXHRcdFx0XHQvLyBjb25mbGljdCBoYXBwZW5zIHdoZW4gYSBmaWxlIHRoYXQgd2UgYXJlIHdvcmtpbmdcblx0XHRcdFx0Ly8gb24gY2hhbmdlcyBvbiBkaXNrLiBpZ25vcmUgY2hhbmdlcyBmb3Igd2hpY2ggYSBtb2RlbFxuXHRcdFx0XHQvLyBleGlzdHMgYmVjYXVzZSB3ZSBoYXZlIGEgYmV0dGVyIGNoZWNrIGZvciBtb2RlbHNcblx0XHRcdFx0aWYgKCFtb2RlbFNlcnZpY2UuZ2V0TW9kZWwodXJpKSAmJiBlLmNvbnRhaW5zKHVyaSkpIHtcblx0XHRcdFx0XHR0aGlzLl9jb25mbGljdHMuc2V0KHVyaSwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDb25mbGljdC5maXJlKHRoaXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gbGlzdGVuIHRvIG1vZGVsIGNoYW5nZXMuLi4/XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VNb2RlbCA9IChtb2RlbDogSVRleHRNb2RlbCkgPT4ge1xuXG5cdFx0XHQvLyBjb25mbGljdFxuXHRcdFx0aWYgKF93b3Jrc3BhY2VFZGl0UmVzb3VyY2VzLmhhcyhtb2RlbC51cmkpKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZsaWN0cy5zZXQobW9kZWwudXJpLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDb25mbGljdC5maXJlKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBtb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCkpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gb25EaWRDaGFuZ2VNb2RlbChtb2RlbCkpKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENvbmZsaWN0LmRpc3Bvc2UoKTtcblx0fVxuXG5cdGxpc3QoKTogVVJJW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fY29uZmxpY3RzLmtleXMoKV07XG5cdH1cblxuXHRoYXNDb25mbGljdHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZsaWN0cy5zaXplID4gMDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQXNCO0FBRS9CLFNBQXVCLGtCQUFrQix3QkFBd0I7QUFDakUsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQkFBbUI7QUFFckIsSUFBTSxtQkFBTixNQUF1QjtBQUFBLEVBUTdCLFlBQ0MsT0FDYyxhQUNDLGNBQ0YsWUFDWjtBQVhGLFNBQWlCLGFBQWEsSUFBSSxZQUFxQjtBQUN2RCxTQUFpQixlQUFlLElBQUksZ0JBQWdCO0FBRXBELFNBQWlCLGlCQUFpQixJQUFJLFFBQWM7QUFDcEQsU0FBUyxnQkFBNkIsS0FBSyxlQUFlO0FBU3pELFVBQU0sMEJBQTBCLElBQUksWUFBcUI7QUFFekQsZUFBVyxRQUFRLE9BQU87QUFDekIsVUFBSSxnQkFBZ0Isa0JBQWtCO0FBQ3JDLGdDQUF3QixJQUFJLEtBQUssVUFBVSxJQUFJO0FBQy9DLFlBQUksT0FBTyxLQUFLLGNBQWMsVUFBVTtBQUN2QyxnQkFBTSxRQUFRLGFBQWEsU0FBUyxLQUFLLFFBQVE7QUFDakQsY0FBSSxTQUFTLE1BQU0sYUFBYSxNQUFNLEtBQUssV0FBVztBQUNyRCxpQkFBSyxXQUFXLElBQUksS0FBSyxVQUFVLElBQUk7QUFDdkMsaUJBQUssZUFBZSxLQUFLLElBQUk7QUFBQSxVQUM5QjtBQUFBLFFBQ0Q7QUFBQSxNQUVELFdBQVcsZ0JBQWdCLGtCQUFrQjtBQUM1QyxZQUFJLEtBQUssYUFBYTtBQUNyQixrQ0FBd0IsSUFBSSxLQUFLLGFBQWEsSUFBSTtBQUFBLFFBRW5ELFdBQVcsS0FBSyxhQUFhO0FBQzVCLGtDQUF3QixJQUFJLEtBQUssYUFBYSxJQUFJO0FBQUEsUUFDbkQ7QUFBQSxNQUNELFdBQVcsZ0JBQWdCLDBCQUEwQjtBQUNwRCxnQ0FBd0IsSUFBSSxLQUFLLFVBQVUsSUFBSTtBQUFBLE1BRWhELE9BQU87QUFDTixtQkFBVyxLQUFLLHFCQUFxQixJQUFJO0FBQUEsTUFDMUM7QUFBQSxJQUNEO0FBR0EsU0FBSyxhQUFhLElBQUksWUFBWSxpQkFBaUIsT0FBSztBQUV2RCxpQkFBVyxPQUFPLHdCQUF3QixLQUFLLEdBQUc7QUFJakQsWUFBSSxDQUFDLGFBQWEsU0FBUyxHQUFHLEtBQUssRUFBRSxTQUFTLEdBQUcsR0FBRztBQUNuRCxlQUFLLFdBQVcsSUFBSSxLQUFLLElBQUk7QUFDN0IsZUFBSyxlQUFlLEtBQUssSUFBSTtBQUM3QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixVQUFNLG1CQUFtQixDQUFDLFVBQXNCO0FBRy9DLFVBQUksd0JBQXdCLElBQUksTUFBTSxHQUFHLEdBQUc7QUFDM0MsYUFBSyxXQUFXLElBQUksTUFBTSxLQUFLLElBQUk7QUFDbkMsYUFBSyxlQUFlLEtBQUssSUFBSTtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUNBLGVBQVcsU0FBUyxhQUFhLFVBQVUsR0FBRztBQUM3QyxXQUFLLGFBQWEsSUFBSSxNQUFNLG1CQUFtQixNQUFNLGlCQUFpQixLQUFLLENBQUMsQ0FBQztBQUFBLElBQzlFO0FBQUEsRUFDRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLGFBQWEsUUFBUTtBQUMxQixTQUFLLGVBQWUsUUFBUTtBQUFBLEVBQzdCO0FBQUEsRUFFQSxPQUFjO0FBQ2IsV0FBTyxDQUFDLEdBQUcsS0FBSyxXQUFXLEtBQUssQ0FBQztBQUFBLEVBQ2xDO0FBQUEsRUFFQSxlQUF3QjtBQUN2QixXQUFPLEtBQUssV0FBVyxPQUFPO0FBQUEsRUFDL0I7QUFDRDtBQXBGYSxtQkFBTjtBQUFBLEVBVUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
