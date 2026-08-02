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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { autorun, derivedOpts } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { reset } from "../../../../base/browser/dom.js";
import { ISCMService } from "../../../../workbench/contrib/scm/common/scm.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
let SyncChangesActionViewItem = class extends ActionViewItem {
  constructor(action, options, scmService, contextService) {
    super(void 0, action, { ...options, icon: false, label: true });
    this.scmService = scmService;
    this.contextService = contextService;
    this._labelUpdateDisposable = this._register(new MutableDisposable());
  }
  getTooltip() {
    return this._tooltip ?? super.getTooltip();
  }
  updateLabel() {
    this._labelUpdateDisposable.clear();
    if (!this.label) {
      return;
    }
    this.label.classList.add("sync-changes-action-view-item");
    const workspaceFolder = this.contextService.getWorkspace().folders[0];
    const repository = workspaceFolder ? Iterable.find(this.scmService.repositories, (repo) => isEqual(repo.provider.rootUri, workspaceFolder.uri)) : void 0;
    const syncActionDetailsObs = derivedOpts(
      { equalsFn: structuralEquals },
      (reader) => {
        const commands = repository?.provider.statusBarCommands.read(reader);
        const syncCommand = commands?.find((c) => c.title.startsWith("$(sync)") || c.title.startsWith("$(sync~spin)"));
        return syncCommand ? {
          title: syncCommand.title,
          tooltip: syncCommand.tooltip
        } : void 0;
      }
    );
    this._labelUpdateDisposable.value = autorun((reader) => {
      const syncActionDetails = syncActionDetailsObs.read(reader);
      reset(this.label, ...syncActionDetails ? renderLabelWithIcons(syncActionDetails.title) : []);
      this._tooltip = syncActionDetails?.tooltip;
      this.updateTooltip();
    });
  }
};
SyncChangesActionViewItem = __decorateClass([
  __decorateParam(2, ISCMService),
  __decorateParam(3, IWorkspaceContextService)
], SyncChangesActionViewItem);
export {
  SyncChangesActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci9zeW5jQ2hhbmdlc0FjdGlvblZpZXdJdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkT3B0cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJU0NNU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3NjbS9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuZXhwb3J0IGNsYXNzIFN5bmNDaGFuZ2VzQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdHByaXZhdGUgX3Rvb2x0aXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxVcGRhdGVEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90b29sdGlwID8/IHN1cGVyLmdldFRvb2x0aXAoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9sYWJlbFVwZGF0ZURpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy5sYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LmFkZCgnc3luYy1jaGFuZ2VzLWFjdGlvbi12aWV3LWl0ZW0nKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gd29ya3NwYWNlRm9sZGVyXG5cdFx0XHQ/IEl0ZXJhYmxlLmZpbmQodGhpcy5zY21TZXJ2aWNlLnJlcG9zaXRvcmllcywgcmVwbyA9PiBpc0VxdWFsKHJlcG8ucHJvdmlkZXIucm9vdFVyaSwgd29ya3NwYWNlRm9sZGVyLnVyaSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHN5bmNBY3Rpb25EZXRhaWxzT2JzID0gZGVyaXZlZE9wdHM8eyB0aXRsZTogc3RyaW5nOyB0b29sdGlwPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KHsgZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHMgfSxcblx0XHRcdHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRzID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuc3RhdHVzQmFyQ29tbWFuZHMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRcdC8vIFdlIGFyZSByZXVzaW5nIHRoZSBzeW5jIHN0YXR1cyBiYXIgY29tbWFuZCB0aGF0IGlzIGJlaW5nIGNvbnRyaWJ1dGVkIGJ5IHRoZSBnaXQgZXh0ZW5zaW9uIGFzIHRoYXQgaXNcblx0XHRcdFx0Ly8gYmVpbmcgdXBkYXRlZCBiYXNlZCBvbiB0aGUgbGF0ZXN0IHN0YXRlIGFzIHdlbGwgYXMgd2hpbGUgdGhlIGFjdGlvbiBpcyBydW5uaW5nLiBMb25nIHRlcm0sIHdlIG5lZWQgdG9cblx0XHRcdFx0Ly8gZmluZCBhIGJldHRlciB3YXkgdG8gaWRlbnRpZnkgYW5kIHJldXNlIHRoaXMgY29tbWFuZC5cblx0XHRcdFx0Y29uc3Qgc3luY0NvbW1hbmQgPSBjb21tYW5kcz8uZmluZChjID0+IGMudGl0bGUuc3RhcnRzV2l0aCgnJChzeW5jKScpIHx8IGMudGl0bGUuc3RhcnRzV2l0aCgnJChzeW5jfnNwaW4pJykpO1xuXG5cdFx0XHRcdHJldHVybiBzeW5jQ29tbWFuZFxuXHRcdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFx0dGl0bGU6IHN5bmNDb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogc3luY0NvbW1hbmQudG9vbHRpcFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXG5cdFx0dGhpcy5fbGFiZWxVcGRhdGVEaXNwb3NhYmxlLnZhbHVlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3luY0FjdGlvbkRldGFpbHMgPSBzeW5jQWN0aW9uRGV0YWlsc09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdHJlc2V0KHRoaXMubGFiZWwhLCAuLi4oc3luY0FjdGlvbkRldGFpbHMgPyByZW5kZXJMYWJlbFdpdGhJY29ucyhzeW5jQWN0aW9uRGV0YWlscy50aXRsZSkgOiBbXSkpO1xuXG5cdFx0XHR0aGlzLl90b29sdGlwID0gc3luY0FjdGlvbkRldGFpbHM/LnRvb2x0aXA7XG5cdFx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsbUJBQW1CO0FBQ3JDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFFM0IsSUFBTSw0QkFBTixjQUF3QyxlQUFlO0FBQUEsRUFJN0QsWUFDQyxRQUNBLFNBQzhCLFlBQ2EsZ0JBQzFDO0FBQ0QsVUFBTSxRQUFXLFFBQVEsRUFBRSxHQUFHLFNBQVMsTUFBTSxPQUFPLE9BQU8sS0FBSyxDQUFDO0FBSG5DO0FBQ2E7QUFONUMsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBQUEsRUFTaEY7QUFBQSxFQUVtQixhQUFpQztBQUNuRCxXQUFPLEtBQUssWUFBWSxNQUFNLFdBQVc7QUFBQSxFQUMxQztBQUFBLEVBRW1CLGNBQW9CO0FBQ3RDLFNBQUssdUJBQXVCLE1BQU07QUFFbEMsUUFBSSxDQUFDLEtBQUssT0FBTztBQUNoQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLE1BQU0sVUFBVSxJQUFJLCtCQUErQjtBQUV4RCxVQUFNLGtCQUFrQixLQUFLLGVBQWUsYUFBYSxFQUFFLFFBQVEsQ0FBQztBQUNwRSxVQUFNLGFBQWEsa0JBQ2hCLFNBQVMsS0FBSyxLQUFLLFdBQVcsY0FBYyxVQUFRLFFBQVEsS0FBSyxTQUFTLFNBQVMsZ0JBQWdCLEdBQUcsQ0FBQyxJQUN2RztBQUVILFVBQU0sdUJBQXVCO0FBQUEsTUFBNkQsRUFBRSxVQUFVLGlCQUFpQjtBQUFBLE1BQ3RILFlBQVU7QUFDVCxjQUFNLFdBQVcsWUFBWSxTQUFTLGtCQUFrQixLQUFLLE1BQU07QUFLbkUsY0FBTSxjQUFjLFVBQVUsS0FBSyxPQUFLLEVBQUUsTUFBTSxXQUFXLFNBQVMsS0FBSyxFQUFFLE1BQU0sV0FBVyxjQUFjLENBQUM7QUFFM0csZUFBTyxjQUNKO0FBQUEsVUFDRCxPQUFPLFlBQVk7QUFBQSxVQUNuQixTQUFTLFlBQVk7QUFBQSxRQUN0QixJQUNFO0FBQUEsTUFDSjtBQUFBLElBQUM7QUFFRixTQUFLLHVCQUF1QixRQUFRLFFBQVEsWUFBVTtBQUNyRCxZQUFNLG9CQUFvQixxQkFBcUIsS0FBSyxNQUFNO0FBRTFELFlBQU0sS0FBSyxPQUFRLEdBQUksb0JBQW9CLHFCQUFxQixrQkFBa0IsS0FBSyxJQUFJLENBQUMsQ0FBRTtBQUU5RixXQUFLLFdBQVcsbUJBQW1CO0FBQ25DLFdBQUssY0FBYztBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUF6RGEsNEJBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
