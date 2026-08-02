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
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { INotebookLoggingService } from "../../../common/notebookLoggingService.js";
import { IExtensionService } from "../../../../../services/extensions/common/extensions.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
let NotebookKernelDetection = class extends Disposable {
  constructor(_notebookKernelService, _extensionService, _notebookLoggingService) {
    super();
    this._notebookKernelService = _notebookKernelService;
    this._extensionService = _extensionService;
    this._notebookLoggingService = _notebookLoggingService;
    this._detectionMap = /* @__PURE__ */ new Map();
    this._localDisposableStore = this._register(new DisposableStore());
    this._registerListeners();
  }
  _registerListeners() {
    this._localDisposableStore.clear();
    this._localDisposableStore.add(this._extensionService.onWillActivateByEvent((e) => {
      if (e.event.startsWith("onNotebook:")) {
        if (this._extensionService.activationEventIsDone(e.event)) {
          return;
        }
        const notebookType = e.event.substring("onNotebook:".length);
        if (notebookType === "*") {
          return;
        }
        let shouldStartDetection = false;
        const extensionStatus = this._extensionService.getExtensionsStatus();
        this._extensionService.extensions.forEach((extension) => {
          if (extensionStatus[extension.identifier.value].activationTimes) {
            return;
          }
          if (extension.activationEvents?.includes(e.event)) {
            shouldStartDetection = true;
          }
        });
        if (shouldStartDetection && !this._detectionMap.has(notebookType)) {
          this._notebookLoggingService.debug("KernelDetection", `start extension activation for ${notebookType}`);
          const task = this._notebookKernelService.registerNotebookKernelDetectionTask({
            notebookType
          });
          this._detectionMap.set(notebookType, task);
        }
      }
    }));
    let timer = null;
    this._localDisposableStore.add(this._extensionService.onDidChangeExtensionsStatus(() => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        const taskToDelete = [];
        for (const [notebookType, task] of this._detectionMap) {
          if (this._extensionService.activationEventIsDone(`onNotebook:${notebookType}`)) {
            this._notebookLoggingService.debug("KernelDetection", `finish extension activation for ${notebookType}`);
            taskToDelete.push(notebookType);
            task.dispose();
          }
        }
        taskToDelete.forEach((notebookType) => {
          this._detectionMap.delete(notebookType);
        });
      });
    }));
    this._localDisposableStore.add({
      dispose: () => {
        if (timer) {
          clearTimeout(timer);
        }
      }
    });
  }
};
NotebookKernelDetection = __decorateClass([
  __decorateParam(0, INotebookKernelService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, INotebookLoggingService)
], NotebookKernelDetection);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookKernelDetection, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9rZXJuZWxEZXRlY3Rpb24vbm90ZWJvb2tLZXJuZWxEZXRlY3Rpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tMb2dnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmNsYXNzIE5vdGVib29rS2VybmVsRGV0ZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIF9kZXRlY3Rpb25NYXAgPSBuZXcgTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlOiBJTm90ZWJvb2tMb2dnaW5nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fZXh0ZW5zaW9uU2VydmljZS5vbldpbGxBY3RpdmF0ZUJ5RXZlbnQoZSA9PiB7XG5cdFx0XHRpZiAoZS5ldmVudC5zdGFydHNXaXRoKCdvbk5vdGVib29rOicpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRpb25FdmVudElzRG9uZShlLmV2ZW50KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHBhcnNlIHRoZSBldmVudCB0byBnZXQgdGhlIG5vdGVib29rIHR5cGVcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tUeXBlID0gZS5ldmVudC5zdWJzdHJpbmcoJ29uTm90ZWJvb2s6Jy5sZW5ndGgpO1xuXG5cdFx0XHRcdGlmIChub3RlYm9va1R5cGUgPT09ICcqJykge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBzaG91bGRTdGFydERldGVjdGlvbiA9IGZhbHNlO1xuXG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uc1N0YXR1cygpO1xuXHRcdFx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZm9yRWFjaChleHRlbnNpb24gPT4ge1xuXHRcdFx0XHRcdGlmIChleHRlbnNpb25TdGF0dXNbZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWVdLmFjdGl2YXRpb25UaW1lcykge1xuXHRcdFx0XHRcdFx0Ly8gYWxyZWFkeSBhY3RpdmF0ZWRcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzPy5pbmNsdWRlcyhlLmV2ZW50KSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkU3RhcnREZXRlY3Rpb24gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKHNob3VsZFN0YXJ0RGV0ZWN0aW9uICYmICF0aGlzLl9kZXRlY3Rpb25NYXAuaGFzKG5vdGVib29rVHlwZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmRlYnVnKCdLZXJuZWxEZXRlY3Rpb24nLCBgc3RhcnQgZXh0ZW5zaW9uIGFjdGl2YXRpb24gZm9yICR7bm90ZWJvb2tUeXBlfWApO1xuXHRcdFx0XHRcdGNvbnN0IHRhc2sgPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UucmVnaXN0ZXJOb3RlYm9va0tlcm5lbERldGVjdGlvblRhc2soe1xuXHRcdFx0XHRcdFx0bm90ZWJvb2tUeXBlOiBub3RlYm9va1R5cGVcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHRoaXMuX2RldGVjdGlvbk1hcC5zZXQobm90ZWJvb2tUeXBlLCB0YXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCB0aW1lcjogVGltZW91dCB8IG51bGwgPSBudWxsO1xuXG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzKCgpID0+IHtcblx0XHRcdGlmICh0aW1lcikge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhY3RpdmF0aW9uIHN0YXRlIG1pZ2h0IG5vdCBiZSB1cGRhdGVkIHlldCwgcG9zdHBvbmUgdG8gbmV4dCBmcmFtZVxuXHRcdFx0dGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGFza1RvRGVsZXRlOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtub3RlYm9va1R5cGUsIHRhc2tdIG9mIHRoaXMuX2RldGVjdGlvbk1hcCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRpb25FdmVudElzRG9uZShgb25Ob3RlYm9vazoke25vdGVib29rVHlwZX1gKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tMb2dnaW5nU2VydmljZS5kZWJ1ZygnS2VybmVsRGV0ZWN0aW9uJywgYGZpbmlzaCBleHRlbnNpb24gYWN0aXZhdGlvbiBmb3IgJHtub3RlYm9va1R5cGV9YCk7XG5cdFx0XHRcdFx0XHR0YXNrVG9EZWxldGUucHVzaChub3RlYm9va1R5cGUpO1xuXHRcdFx0XHRcdFx0dGFzay5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGFza1RvRGVsZXRlLmZvckVhY2gobm90ZWJvb2tUeXBlID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kZXRlY3Rpb25NYXAuZGVsZXRlKG5vdGVib29rVHlwZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlU3RvcmUuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRpbWVyKSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihOb3RlYm9va0tlcm5lbERldGVjdGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7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
