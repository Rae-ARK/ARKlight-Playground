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
import * as DOM from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { errorStateIcon, executingStateIcon, pendingStateIcon, successStateIcon } from "../../notebookIcons.js";
import { NotebookCellExecutionState } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
let CollapsedCodeCellExecutionIcon = class extends Disposable {
  constructor(_notebookEditor, _cell, _element, _executionStateService) {
    super();
    this._cell = _cell;
    this._element = _element;
    this._executionStateService = _executionStateService;
    this._visible = false;
    this._update();
    this._register(this._executionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && e.affectsCell(this._cell.uri)) {
        this._update();
      }
    }));
    this._register(this._cell.model.onDidChangeInternalMetadata(() => this._update()));
  }
  setVisibility(visible) {
    this._visible = visible;
    this._update();
  }
  _update() {
    if (!this._visible) {
      return;
    }
    const runState = this._executionStateService.getCellExecution(this._cell.uri);
    const item = this._getItemForState(runState, this._cell.model.internalMetadata);
    if (item) {
      this._element.style.display = "";
      DOM.reset(this._element, ...renderLabelWithIcons(item.text));
      this._element.title = item.tooltip ?? "";
    } else {
      this._element.style.display = "none";
      DOM.reset(this._element);
    }
  }
  _getItemForState(runState, internalMetadata) {
    const state = runState?.state;
    const { lastRunSuccess } = internalMetadata;
    if (!state && lastRunSuccess) {
      return {
        text: `$(${successStateIcon.id})`,
        tooltip: localize("notebook.cell.status.success", "Success")
      };
    } else if (!state && lastRunSuccess === false) {
      return {
        text: `$(${errorStateIcon.id})`,
        tooltip: localize("notebook.cell.status.failure", "Failure")
      };
    } else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
      return {
        text: `$(${pendingStateIcon.id})`,
        tooltip: localize("notebook.cell.status.pending", "Pending")
      };
    } else if (state === NotebookCellExecutionState.Executing) {
      const icon = ThemeIcon.modify(executingStateIcon, "spin");
      return {
        text: `$(${icon.id})`,
        tooltip: localize("notebook.cell.status.executing", "Executing")
      };
    }
    return;
  }
};
CollapsedCodeCellExecutionIcon = __decorateClass([
  __decorateParam(3, INotebookExecutionStateService)
], CollapsedCodeCellExecutionIcon);
export {
  CollapsedCodeCellExecutionIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY29kZUNlbGxFeGVjdXRpb25JY29uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IGVycm9yU3RhdGVJY29uLCBleGVjdXRpbmdTdGF0ZUljb24sIHBlbmRpbmdTdGF0ZUljb24sIHN1Y2Nlc3NTdGF0ZUljb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0ljb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLCBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxFeGVjdXRpb24sIElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgTm90ZWJvb2tFeGVjdXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElFeGVjdXRpb25JdGVtIHtcblx0dGV4dDogc3RyaW5nO1xuXHR0b29sdGlwPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQ29sbGFwc2VkQ29kZUNlbGxFeGVjdXRpb25JY29uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3Zpc2libGUgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NlbGw6IElDZWxsVmlld01vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSBfZXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUuY2VsbCAmJiBlLmFmZmVjdHNDZWxsKHRoaXMuX2NlbGwudXJpKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2VsbC5tb2RlbC5vbkRpZENoYW5nZUludGVybmFsTWV0YWRhdGEoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0fVxuXG5cdHNldFZpc2liaWxpdHkodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy5fdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJ1blN0YXRlID0gdGhpcy5fZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24odGhpcy5fY2VsbC51cmkpO1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9nZXRJdGVtRm9yU3RhdGUocnVuU3RhdGUsIHRoaXMuX2NlbGwubW9kZWwuaW50ZXJuYWxNZXRhZGF0YSk7XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0RE9NLnJlc2V0KHRoaXMuX2VsZW1lbnQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGl0ZW0udGV4dCkpO1xuXHRcdFx0dGhpcy5fZWxlbWVudC50aXRsZSA9IGl0ZW0udG9vbHRpcCA/PyAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0RE9NLnJlc2V0KHRoaXMuX2VsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEl0ZW1Gb3JTdGF0ZShydW5TdGF0ZTogSU5vdGVib29rQ2VsbEV4ZWN1dGlvbiB8IHVuZGVmaW5lZCwgaW50ZXJuYWxNZXRhZGF0YTogTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSk6IElFeGVjdXRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHJ1blN0YXRlPy5zdGF0ZTtcblx0XHRjb25zdCB7IGxhc3RSdW5TdWNjZXNzIH0gPSBpbnRlcm5hbE1ldGFkYXRhO1xuXHRcdGlmICghc3RhdGUgJiYgbGFzdFJ1blN1Y2Nlc3MpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRleHQ6IGAkKCR7c3VjY2Vzc1N0YXRlSWNvbi5pZH0pYCxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzLnN1Y2Nlc3MnLCBcIlN1Y2Nlc3NcIiksXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoIXN0YXRlICYmIGxhc3RSdW5TdWNjZXNzID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGV4dDogYCQoJHtlcnJvclN0YXRlSWNvbi5pZH0pYCxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzLmZhaWx1cmUnLCBcIkZhaWx1cmVcIiksXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLlBlbmRpbmcgfHwgc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLlVuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXh0OiBgJCgke3BlbmRpbmdTdGF0ZUljb24uaWR9KWAsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnN0YXR1cy5wZW5kaW5nJywgXCJQZW5kaW5nXCIpLFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcpIHtcblx0XHRcdGNvbnN0IGljb24gPSBUaGVtZUljb24ubW9kaWZ5KGV4ZWN1dGluZ1N0YXRlSWNvbiwgJ3NwaW4nKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRleHQ6IGAkKCR7aWNvbi5pZH0pYCxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuc3RhdHVzLmV4ZWN1dGluZycsIFwiRXhlY3V0aW5nXCIpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCLG9CQUFvQixrQkFBa0Isd0JBQXdCO0FBQ3ZGLFNBQVMsa0NBQWdFO0FBQ3pFLFNBQWlDLGdDQUFnQyw2QkFBNkI7QUFPdkYsSUFBTSxpQ0FBTixjQUE2QyxXQUFXO0FBQUEsRUFHOUQsWUFDQyxpQkFDaUIsT0FDQSxVQUN1Qix3QkFDdkM7QUFDRCxVQUFNO0FBSlc7QUFDQTtBQUN1QjtBQU56QyxTQUFRLFdBQVc7QUFVbEIsU0FBSyxRQUFRO0FBQ2IsU0FBSyxVQUFVLEtBQUssdUJBQXVCLHFCQUFxQixPQUFLO0FBQ3BFLFVBQUksRUFBRSxTQUFTLHNCQUFzQixRQUFRLEVBQUUsWUFBWSxLQUFLLE1BQU0sR0FBRyxHQUFHO0FBQzNFLGFBQUssUUFBUTtBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLE1BQU0sTUFBTSw0QkFBNEIsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDbEY7QUFBQSxFQUVBLGNBQWMsU0FBd0I7QUFDckMsU0FBSyxXQUFXO0FBQ2hCLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVRLFVBQVU7QUFDakIsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUNuQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsS0FBSyx1QkFBdUIsaUJBQWlCLEtBQUssTUFBTSxHQUFHO0FBQzVFLFVBQU0sT0FBTyxLQUFLLGlCQUFpQixVQUFVLEtBQUssTUFBTSxNQUFNLGdCQUFnQjtBQUM5RSxRQUFJLE1BQU07QUFDVCxXQUFLLFNBQVMsTUFBTSxVQUFVO0FBQzlCLFVBQUksTUFBTSxLQUFLLFVBQVUsR0FBRyxxQkFBcUIsS0FBSyxJQUFJLENBQUM7QUFDM0QsV0FBSyxTQUFTLFFBQVEsS0FBSyxXQUFXO0FBQUEsSUFDdkMsT0FBTztBQUNOLFdBQUssU0FBUyxNQUFNLFVBQVU7QUFDOUIsVUFBSSxNQUFNLEtBQUssUUFBUTtBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFVBQThDLGtCQUE0RTtBQUNsSixVQUFNLFFBQVEsVUFBVTtBQUN4QixVQUFNLEVBQUUsZUFBZSxJQUFJO0FBQzNCLFFBQUksQ0FBQyxTQUFTLGdCQUFnQjtBQUM3QixhQUFPO0FBQUEsUUFDTixNQUFNLEtBQUssaUJBQWlCLEVBQUU7QUFBQSxRQUM5QixTQUFTLFNBQVMsZ0NBQWdDLFNBQVM7QUFBQSxNQUM1RDtBQUFBLElBQ0QsV0FBVyxDQUFDLFNBQVMsbUJBQW1CLE9BQU87QUFDOUMsYUFBTztBQUFBLFFBQ04sTUFBTSxLQUFLLGVBQWUsRUFBRTtBQUFBLFFBQzVCLFNBQVMsU0FBUyxnQ0FBZ0MsU0FBUztBQUFBLE1BQzVEO0FBQUEsSUFDRCxXQUFXLFVBQVUsMkJBQTJCLFdBQVcsVUFBVSwyQkFBMkIsYUFBYTtBQUM1RyxhQUFPO0FBQUEsUUFDTixNQUFNLEtBQUssaUJBQWlCLEVBQUU7QUFBQSxRQUM5QixTQUFTLFNBQVMsZ0NBQWdDLFNBQVM7QUFBQSxNQUM1RDtBQUFBLElBQ0QsV0FBVyxVQUFVLDJCQUEyQixXQUFXO0FBQzFELFlBQU0sT0FBTyxVQUFVLE9BQU8sb0JBQW9CLE1BQU07QUFDeEQsYUFBTztBQUFBLFFBQ04sTUFBTSxLQUFLLEtBQUssRUFBRTtBQUFBLFFBQ2xCLFNBQVMsU0FBUyxrQ0FBa0MsV0FBVztBQUFBLE1BQ2hFO0FBQUEsSUFDRDtBQUVBO0FBQUEsRUFDRDtBQUNEO0FBdEVhLGlDQUFOO0FBQUEsRUFPSjtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
