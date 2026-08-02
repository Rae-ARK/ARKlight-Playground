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
import { decodeBase64 } from "../../../base/common/buffer.js";
import { revive } from "../../../base/common/marshalling.js";
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from "../../../editor/browser/services/bulkEditService.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { MainContext } from "../common/extHost.protocol.js";
import { ResourceNotebookCellEdit } from "../../contrib/bulkEdit/browser/bulkCellEdits.js";
import { CellEditType } from "../../contrib/notebook/common/notebookCommon.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadBulkEdits = class {
  constructor(_extHostContext, _bulkEditService, _logService, _uriIdentService) {
    this._bulkEditService = _bulkEditService;
    this._logService = _logService;
    this._uriIdentService = _uriIdentService;
  }
  dispose() {
  }
  $tryApplyWorkspaceEdit(dto, undoRedoGroupId, isRefactoring) {
    const edits = reviveWorkspaceEditDto(dto.value, this._uriIdentService);
    return this._bulkEditService.apply(edits, { undoRedoGroupId, respectAutoSaveConfig: isRefactoring }).then((res) => res.isApplied, (err) => {
      this._logService.warn(`IGNORING workspace edit: ${err}`);
      return false;
    });
  }
};
MainThreadBulkEdits = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadBulkEdits),
  __decorateParam(1, IBulkEditService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IUriIdentityService)
], MainThreadBulkEdits);
function reviveWorkspaceEditDto(data, uriIdentityService, resolveDataTransferFile) {
  if (!data || !data.edits) {
    return data;
  }
  const result = revive(data);
  for (const edit of result.edits) {
    if (ResourceTextEdit.is(edit)) {
      edit.resource = uriIdentityService.asCanonicalUri(edit.resource);
    }
    if (ResourceFileEdit.is(edit)) {
      if (edit.options) {
        const inContents = edit.options?.contents;
        if (inContents) {
          if (inContents.type === "base64") {
            edit.options.contents = Promise.resolve(decodeBase64(inContents.value));
          } else {
            if (resolveDataTransferFile) {
              edit.options.contents = resolveDataTransferFile(inContents.id);
            } else {
              throw new Error("Could not revive data transfer file");
            }
          }
        }
      }
      edit.newResource = edit.newResource && uriIdentityService.asCanonicalUri(edit.newResource);
      edit.oldResource = edit.oldResource && uriIdentityService.asCanonicalUri(edit.oldResource);
    }
    if (ResourceNotebookCellEdit.is(edit)) {
      edit.resource = uriIdentityService.asCanonicalUri(edit.resource);
      const cellEdit = edit.cellEdit;
      if (cellEdit.editType === CellEditType.Replace) {
        edit.cellEdit = {
          ...cellEdit,
          cells: cellEdit.cells.map((cell) => ({
            ...cell,
            outputs: cell.outputs.map((output) => ({
              ...output,
              outputs: output.items.map((item) => {
                return {
                  mime: item.mime,
                  data: item.valueBytes
                };
              })
            }))
          }))
        };
      }
    }
  }
  return data;
}
export {
  MainThreadBulkEdits,
  reviveWorkspaceEditDto
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQnVsa0VkaXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIsIGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZUZpbGVFZGl0LCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNlbGxFZGl0RHRvLCBJV29ya3NwYWNlRWRpdER0bywgSVdvcmtzcGFjZUZpbGVFZGl0RHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZEJ1bGtFZGl0c1NoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9idWxrRWRpdC9icm93c2VyL2J1bGtDZWxsRWRpdHMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0LCBleHRIb3N0TmFtZWRDdXN0b21lciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuXG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkQnVsa0VkaXRzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRCdWxrRWRpdHMgaW1wbGVtZW50cyBNYWluVGhyZWFkQnVsa0VkaXRzU2hhcGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdF9leHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJQnVsa0VkaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2J1bGtFZGl0U2VydmljZTogSUJ1bGtFZGl0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxuXG5cdCR0cnlBcHBseVdvcmtzcGFjZUVkaXQoZHRvOiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxJV29ya3NwYWNlRWRpdER0bz4sIHVuZG9SZWRvR3JvdXBJZD86IG51bWJlciwgaXNSZWZhY3RvcmluZz86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBlZGl0cyA9IHJldml2ZVdvcmtzcGFjZUVkaXREdG8oZHRvLnZhbHVlLCB0aGlzLl91cmlJZGVudFNlcnZpY2UpO1xuXHRcdHJldHVybiB0aGlzLl9idWxrRWRpdFNlcnZpY2UuYXBwbHkoZWRpdHMsIHsgdW5kb1JlZG9Hcm91cElkLCByZXNwZWN0QXV0b1NhdmVDb25maWc6IGlzUmVmYWN0b3JpbmcgfSkudGhlbigocmVzKSA9PiByZXMuaXNBcHBsaWVkLCBlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBJR05PUklORyB3b3Jrc3BhY2UgZWRpdDogJHtlcnJ9YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJldml2ZVdvcmtzcGFjZUVkaXREdG8oZGF0YTogSVdvcmtzcGFjZUVkaXREdG8sIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSwgcmVzb2x2ZURhdGFUcmFuc2ZlckZpbGU/OiAoaWQ6IHN0cmluZykgPT4gUHJvbWlzZTxWU0J1ZmZlcj4pOiBXb3Jrc3BhY2VFZGl0O1xuZXhwb3J0IGZ1bmN0aW9uIHJldml2ZVdvcmtzcGFjZUVkaXREdG8oZGF0YTogSVdvcmtzcGFjZUVkaXREdG8gfCB1bmRlZmluZWQsIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSwgcmVzb2x2ZURhdGFUcmFuc2ZlckZpbGU/OiAoaWQ6IHN0cmluZykgPT4gUHJvbWlzZTxWU0J1ZmZlcj4pOiBXb3Jrc3BhY2VFZGl0IHwgdW5kZWZpbmVkO1xuZXhwb3J0IGZ1bmN0aW9uIHJldml2ZVdvcmtzcGFjZUVkaXREdG8oZGF0YTogSVdvcmtzcGFjZUVkaXREdG8gfCB1bmRlZmluZWQsIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSwgcmVzb2x2ZURhdGFUcmFuc2ZlckZpbGU/OiAoaWQ6IHN0cmluZykgPT4gUHJvbWlzZTxWU0J1ZmZlcj4pOiBXb3Jrc3BhY2VFZGl0IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFkYXRhIHx8ICFkYXRhLmVkaXRzKSB7XG5cdFx0cmV0dXJuIDxXb3Jrc3BhY2VFZGl0PmRhdGE7XG5cdH1cblx0Y29uc3QgcmVzdWx0ID0gcmV2aXZlPFdvcmtzcGFjZUVkaXQ+KGRhdGEpO1xuXHRmb3IgKGNvbnN0IGVkaXQgb2YgcmVzdWx0LmVkaXRzKSB7XG5cdFx0aWYgKFJlc291cmNlVGV4dEVkaXQuaXMoZWRpdCkpIHtcblx0XHRcdGVkaXQucmVzb3VyY2UgPSB1cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkoZWRpdC5yZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGlmIChSZXNvdXJjZUZpbGVFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRpZiAoZWRpdC5vcHRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGluQ29udGVudHMgPSAoZWRpdCBhcyBJV29ya3NwYWNlRmlsZUVkaXREdG8pLm9wdGlvbnM/LmNvbnRlbnRzO1xuXHRcdFx0XHRpZiAoaW5Db250ZW50cykge1xuXHRcdFx0XHRcdGlmIChpbkNvbnRlbnRzLnR5cGUgPT09ICdiYXNlNjQnKSB7XG5cdFx0XHRcdFx0XHRlZGl0Lm9wdGlvbnMuY29udGVudHMgPSBQcm9taXNlLnJlc29sdmUoZGVjb2RlQmFzZTY0KGluQ29udGVudHMudmFsdWUpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKHJlc29sdmVEYXRhVHJhbnNmZXJGaWxlKSB7XG5cdFx0XHRcdFx0XHRcdGVkaXQub3B0aW9ucy5jb250ZW50cyA9IHJlc29sdmVEYXRhVHJhbnNmZXJGaWxlKGluQ29udGVudHMuaWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgcmV2aXZlIGRhdGEgdHJhbnNmZXIgZmlsZScpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWRpdC5uZXdSZXNvdXJjZSA9IGVkaXQubmV3UmVzb3VyY2UgJiYgdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGVkaXQubmV3UmVzb3VyY2UpO1xuXHRcdFx0ZWRpdC5vbGRSZXNvdXJjZSA9IGVkaXQub2xkUmVzb3VyY2UgJiYgdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGVkaXQub2xkUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRpZiAoUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRlZGl0LnJlc291cmNlID0gdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGVkaXQucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgY2VsbEVkaXQgPSAoZWRpdCBhcyBJV29ya3NwYWNlQ2VsbEVkaXREdG8pLmNlbGxFZGl0O1xuXHRcdFx0aWYgKGNlbGxFZGl0LmVkaXRUeXBlID09PSBDZWxsRWRpdFR5cGUuUmVwbGFjZSkge1xuXHRcdFx0XHRlZGl0LmNlbGxFZGl0ID0ge1xuXHRcdFx0XHRcdC4uLmNlbGxFZGl0LFxuXHRcdFx0XHRcdGNlbGxzOiBjZWxsRWRpdC5jZWxscy5tYXAoY2VsbCA9PiAoe1xuXHRcdFx0XHRcdFx0Li4uY2VsbCxcblx0XHRcdFx0XHRcdG91dHB1dHM6IGNlbGwub3V0cHV0cy5tYXAob3V0cHV0ID0+ICh7XG5cdFx0XHRcdFx0XHRcdC4uLm91dHB1dCxcblx0XHRcdFx0XHRcdFx0b3V0cHV0czogb3V0cHV0Lml0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0bWltZTogaXRlbS5taW1lLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGF0YTogaXRlbS52YWx1ZUJ5dGVzXG5cdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdH0pKVxuXHRcdFx0XHRcdH0pKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gPFdvcmtzcGFjZUVkaXQ+ZGF0YTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBbUIsb0JBQW9CO0FBQ3ZDLFNBQVMsY0FBYztBQUN2QixTQUFTLGtCQUFrQixrQkFBa0Isd0JBQXdCO0FBRXJFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQTBFLG1CQUE2QztBQUN2SCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUEwQiw0QkFBNEI7QUFLL0MsSUFBTSxzQkFBTixNQUE4RDtBQUFBLEVBRXBFLFlBQ0MsaUJBQ21DLGtCQUNMLGFBQ1Esa0JBQ3JDO0FBSGtDO0FBQ0w7QUFDUTtBQUFBLEVBQ25DO0FBQUEsRUFFSixVQUFnQjtBQUFBLEVBQUU7QUFBQSxFQUVsQix1QkFBdUIsS0FBdUQsaUJBQTBCLGVBQTJDO0FBQ2xKLFVBQU0sUUFBUSx1QkFBdUIsSUFBSSxPQUFPLEtBQUssZ0JBQWdCO0FBQ3JFLFdBQU8sS0FBSyxpQkFBaUIsTUFBTSxPQUFPLEVBQUUsaUJBQWlCLHVCQUF1QixjQUFjLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxJQUFJLFdBQVcsU0FBTztBQUN4SSxXQUFLLFlBQVksS0FBSyw0QkFBNEIsR0FBRyxFQUFFO0FBQ3ZELGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFsQmEsc0JBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLG1CQUFtQjtBQUFBLEVBS2xEO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQU5VO0FBc0JOLFNBQVMsdUJBQXVCLE1BQXFDLG9CQUF5Qyx5QkFBd0Y7QUFDNU0sTUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLE9BQU87QUFDekIsV0FBc0I7QUFBQSxFQUN2QjtBQUNBLFFBQU0sU0FBUyxPQUFzQixJQUFJO0FBQ3pDLGFBQVcsUUFBUSxPQUFPLE9BQU87QUFDaEMsUUFBSSxpQkFBaUIsR0FBRyxJQUFJLEdBQUc7QUFDOUIsV0FBSyxXQUFXLG1CQUFtQixlQUFlLEtBQUssUUFBUTtBQUFBLElBQ2hFO0FBQ0EsUUFBSSxpQkFBaUIsR0FBRyxJQUFJLEdBQUc7QUFDOUIsVUFBSSxLQUFLLFNBQVM7QUFDakIsY0FBTSxhQUFjLEtBQStCLFNBQVM7QUFDNUQsWUFBSSxZQUFZO0FBQ2YsY0FBSSxXQUFXLFNBQVMsVUFBVTtBQUNqQyxpQkFBSyxRQUFRLFdBQVcsUUFBUSxRQUFRLGFBQWEsV0FBVyxLQUFLLENBQUM7QUFBQSxVQUN2RSxPQUFPO0FBQ04sZ0JBQUkseUJBQXlCO0FBQzVCLG1CQUFLLFFBQVEsV0FBVyx3QkFBd0IsV0FBVyxFQUFFO0FBQUEsWUFDOUQsT0FBTztBQUNOLG9CQUFNLElBQUksTUFBTSxxQ0FBcUM7QUFBQSxZQUN0RDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLFdBQUssY0FBYyxLQUFLLGVBQWUsbUJBQW1CLGVBQWUsS0FBSyxXQUFXO0FBQ3pGLFdBQUssY0FBYyxLQUFLLGVBQWUsbUJBQW1CLGVBQWUsS0FBSyxXQUFXO0FBQUEsSUFDMUY7QUFDQSxRQUFJLHlCQUF5QixHQUFHLElBQUksR0FBRztBQUN0QyxXQUFLLFdBQVcsbUJBQW1CLGVBQWUsS0FBSyxRQUFRO0FBQy9ELFlBQU0sV0FBWSxLQUErQjtBQUNqRCxVQUFJLFNBQVMsYUFBYSxhQUFhLFNBQVM7QUFDL0MsYUFBSyxXQUFXO0FBQUEsVUFDZixHQUFHO0FBQUEsVUFDSCxPQUFPLFNBQVMsTUFBTSxJQUFJLFdBQVM7QUFBQSxZQUNsQyxHQUFHO0FBQUEsWUFDSCxTQUFTLEtBQUssUUFBUSxJQUFJLGFBQVc7QUFBQSxjQUNwQyxHQUFHO0FBQUEsY0FDSCxTQUFTLE9BQU8sTUFBTSxJQUFJLFVBQVE7QUFDakMsdUJBQU87QUFBQSxrQkFDTixNQUFNLEtBQUs7QUFBQSxrQkFDWCxNQUFNLEtBQUs7QUFBQSxnQkFDWjtBQUFBLGNBQ0QsQ0FBQztBQUFBLFlBQ0YsRUFBRTtBQUFBLFVBQ0gsRUFBRTtBQUFBLFFBQ0g7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFzQjtBQUN2QjsiLAogICJuYW1lcyI6IFtdCn0K
