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
import { mainWindow } from "../../../../../base/browser/window.js";
import { Event } from "../../../../../base/common/event.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { SinglePaneLayoutStrategy } from "./singlePaneLayoutStrategy.js";
let SinglePaneQuickChatEditorHideStrategy = class extends SinglePaneLayoutStrategy {
  constructor(ctx, _layoutService, _sessionsService, _editorService, _editorGroupsService) {
    super(ctx);
    this._layoutService = _layoutService;
    this._sessionsService = _sessionsService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    const mainPartEmptyObs = observableFromEvent(
      this,
      Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor),
      () => this._isMainPartEmpty()
    );
    this._register(autorun((reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      const isQuickChat = activeSession?.isQuickChat?.read(reader) ?? false;
      if (!isQuickChat || !mainPartEmptyObs.read(reader)) {
        return;
      }
      if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        return;
      }
      const suppression = this._layoutService.suppressEditorPartAutoVisibility();
      try {
        this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
      } finally {
        suppression.dispose();
      }
    }));
  }
  _isMainPartEmpty() {
    for (const group of this._editorGroupsService.mainPart.groups) {
      if (!group.isEmpty) {
        return false;
      }
    }
    return true;
  }
};
SinglePaneQuickChatEditorHideStrategy = __decorateClass([
  __decorateParam(1, IAgentWorkbenchLayoutService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService)
], SinglePaneQuickChatEditorHideStrategy);
export {
  SinglePaneQuickChatEditorHideStrategy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvbGF5b3V0L2Jyb3dzZXIvc2luZ2xlUGFuZS9zaW5nbGVQYW5lUXVpY2tDaGF0RWRpdG9ySGlkZVN0cmF0ZWd5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlUGFuZUxheW91dENvbnRleHQsIFNpbmdsZVBhbmVMYXlvdXRTdHJhdGVneSB9IGZyb20gJy4vc2luZ2xlUGFuZUxheW91dFN0cmF0ZWd5LmpzJztcblxuLyoqXG4gKiBBIHF1aWNrIGNoYXQgaGFzIG5vIHNpZGUgcGFuZSAobm8gd29ya3NwYWNlLCBDaGFuZ2VzL0ZpbGVzIGdhdGVkIG9mZikuIFRoZVxuICogZGV0YWlsIHBhbmVsIHRhcmdldCBpcyBgSGlkZGVuYCAoYXV4IGJhciBoaWRkZW4pLCBidXQgdGhlIGRvY2tlZCBlZGl0b3IgcGFydFxuICogY2FuIHN0aWxsIGJlIGxlZnQgdmlzaWJsZSB3aGVuIHN3aXRjaGluZyBpbiBmcm9tIGEgc2Vzc2lvbiB0aGF0IGhhZCBpdCBvcGVuLlxuICogSGlkZSB0aGUgZWRpdG9yIHBhcnQgd2hpbGUgYSBxdWljayBjaGF0J3MgZWRpdG9yIGdyb3VwIGlzIGVtcHR5IHNvIHRoZSB3aG9sZVxuICogc2lkZSBwYW5lIGNvbGxhcHNlcyBhbmQgdGhlIGNoYXQgaXMgZnVsbC13aWR0aC4gR2F0ZWQgb24gZW1wdGluZXNzIHNvIGEgcmVhbFxuICogZWRpdG9yIChlLmcuIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXIpIG9wZW5lZCBpbiBhIHF1aWNrIGNoYXQgaXMgbmV2ZXIgaGlkZGVuLlxuICovXG5leHBvcnQgY2xhc3MgU2luZ2xlUGFuZVF1aWNrQ2hhdEVkaXRvckhpZGVTdHJhdGVneSBleHRlbmRzIFNpbmdsZVBhbmVMYXlvdXRTdHJhdGVneSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y3R4OiBJU2luZ2xlUGFuZUxheW91dENvbnRleHQsXG5cdFx0QElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY3R4KTtcblxuXHRcdGNvbnN0IG1haW5QYXJ0RW1wdHlPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHRFdmVudC5hbnkodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgdGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEVkaXRvcnNDaGFuZ2UsIHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRDbG9zZUVkaXRvciksXG5cdFx0XHQoKSA9PiB0aGlzLl9pc01haW5QYXJ0RW1wdHkoKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNRdWlja0NoYXQgPSBhY3RpdmVTZXNzaW9uPy5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdFx0aWYgKCFpc1F1aWNrQ2hhdCB8fCAhbWFpblBhcnRFbXB0eU9icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3VwcHJlc3Npb24gPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3VwcHJlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTWFpblBhcnRFbXB0eSgpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UubWFpblBhcnQuZ3JvdXBzKSB7XG5cdFx0XHRpZiAoIWdyb3VwLmlzRW1wdHkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLDJCQUEyQjtBQUM3QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBbUMsZ0NBQWdDO0FBVTVELElBQU0sd0NBQU4sY0FBb0QseUJBQXlCO0FBQUEsRUFFbkYsWUFDQyxLQUMrQyxnQkFDWixrQkFDRixnQkFDTSxzQkFDdEM7QUFDRCxVQUFNLEdBQUc7QUFMc0M7QUFDWjtBQUNGO0FBQ007QUFJdkMsVUFBTSxtQkFBbUI7QUFBQSxNQUFvQjtBQUFBLE1BQzVDLE1BQU0sSUFBSSxLQUFLLGVBQWUseUJBQXlCLEtBQUssZUFBZSxvQkFBb0IsS0FBSyxlQUFlLGdCQUFnQjtBQUFBLE1BQ25JLE1BQU0sS0FBSyxpQkFBaUI7QUFBQSxJQUFDO0FBRTlCLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsY0FBYyxLQUFLLE1BQU07QUFDckUsWUFBTSxjQUFjLGVBQWUsYUFBYSxLQUFLLE1BQU0sS0FBSztBQUNoRSxVQUFJLENBQUMsZUFBZSxDQUFDLGlCQUFpQixLQUFLLE1BQU0sR0FBRztBQUNuRDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsS0FBSyxlQUFlLFVBQVUsTUFBTSxhQUFhLFVBQVUsR0FBRztBQUNsRTtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGNBQWMsS0FBSyxlQUFlLGlDQUFpQztBQUN6RSxVQUFJO0FBQ0gsYUFBSyxlQUFlLGNBQWMsTUFBTSxNQUFNLFdBQVc7QUFBQSxNQUMxRCxVQUFFO0FBQ0Qsb0JBQVksUUFBUTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxtQkFBNEI7QUFDbkMsZUFBVyxTQUFTLEtBQUsscUJBQXFCLFNBQVMsUUFBUTtBQUM5RCxVQUFJLENBQUMsTUFBTSxTQUFTO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF6Q2Esd0NBQU47QUFBQSxFQUlKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
