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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { Promises } from "../../../../base/common/async.js";
let LogsDataCleaner = class extends Disposable {
  constructor(environmentService, fileService, lifecycleService) {
    super();
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.lifecycleService = lifecycleService;
    this.cleanUpOldLogsSoon();
  }
  cleanUpOldLogsSoon() {
    let handle = setTimeout(async () => {
      handle = void 0;
      const stat = await this.fileService.resolve(dirname(this.environmentService.logsHome));
      if (stat.children) {
        const currentLog = basename(this.environmentService.logsHome);
        const allSessions = stat.children.filter((stat2) => stat2.isDirectory && /^\d{8}T\d{6}$/.test(stat2.name));
        const oldSessions = allSessions.sort().filter((d, i) => d.name !== currentLog);
        const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 49));
        Promises.settled(toDelete.map((stat2) => this.fileService.del(stat2.resource, { recursive: true })));
      }
    }, 10 * 1e3);
    this._register(this.lifecycleService.onWillShutdown(() => {
      if (handle) {
        clearTimeout(handle);
        handle = void 0;
      }
    }));
  }
};
LogsDataCleaner = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILifecycleService)
], LogsDataCleaner);
export {
  LogsDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2xvZ3MvY29tbW9uL2xvZ3NEYXRhQ2xlYW5lci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMb2dzRGF0YUNsZWFuZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNsZWFuVXBPbGRMb2dzU29vbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhblVwT2xkTG9nc1Nvb24oKTogdm9pZCB7XG5cdFx0bGV0IGhhbmRsZTogVGltZW91dCB8IHVuZGVmaW5lZCA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShkaXJuYW1lKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lKSk7XG5cdFx0XHRpZiAoc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TG9nID0gYmFzZW5hbWUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUpO1xuXHRcdFx0XHRjb25zdCBhbGxTZXNzaW9ucyA9IHN0YXQuY2hpbGRyZW4uZmlsdGVyKHN0YXQgPT4gc3RhdC5pc0RpcmVjdG9yeSAmJiAvXlxcZHs4fVRcXGR7Nn0kLy50ZXN0KHN0YXQubmFtZSkpO1xuXHRcdFx0XHRjb25zdCBvbGRTZXNzaW9ucyA9IGFsbFNlc3Npb25zLnNvcnQoKS5maWx0ZXIoKGQsIGkpID0+IGQubmFtZSAhPT0gY3VycmVudExvZyk7XG5cdFx0XHRcdGNvbnN0IHRvRGVsZXRlID0gb2xkU2Vzc2lvbnMuc2xpY2UoMCwgTWF0aC5tYXgoMCwgb2xkU2Vzc2lvbnMubGVuZ3RoIC0gNDkpKTtcblx0XHRcdFx0UHJvbWlzZXMuc2V0dGxlZCh0b0RlbGV0ZS5tYXAoc3RhdCA9PiB0aGlzLmZpbGVTZXJ2aWNlLmRlbChzdGF0LnJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KSkpO1xuXHRcdFx0fVxuXHRcdH0sIDEwICogMTAwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKCgpID0+IHtcblx0XHRcdGlmIChoYW5kbGUpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KGhhbmRsZSk7XG5cdFx0XHRcdGhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFFbEIsSUFBTSxrQkFBTixjQUE4QixXQUFXO0FBQUEsRUFFL0MsWUFDZ0Qsb0JBQ2hCLGFBQ0ssa0JBQ25DO0FBQ0QsVUFBTTtBQUp5QztBQUNoQjtBQUNLO0FBR3BDLFNBQUssbUJBQW1CO0FBQUEsRUFDekI7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxRQUFJLFNBQThCLFdBQVcsWUFBWTtBQUN4RCxlQUFTO0FBQ1QsWUFBTSxPQUFPLE1BQU0sS0FBSyxZQUFZLFFBQVEsUUFBUSxLQUFLLG1CQUFtQixRQUFRLENBQUM7QUFDckYsVUFBSSxLQUFLLFVBQVU7QUFDbEIsY0FBTSxhQUFhLFNBQVMsS0FBSyxtQkFBbUIsUUFBUTtBQUM1RCxjQUFNLGNBQWMsS0FBSyxTQUFTLE9BQU8sQ0FBQUEsVUFBUUEsTUFBSyxlQUFlLGdCQUFnQixLQUFLQSxNQUFLLElBQUksQ0FBQztBQUNwRyxjQUFNLGNBQWMsWUFBWSxLQUFLLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxFQUFFLFNBQVMsVUFBVTtBQUM3RSxjQUFNLFdBQVcsWUFBWSxNQUFNLEdBQUcsS0FBSyxJQUFJLEdBQUcsWUFBWSxTQUFTLEVBQUUsQ0FBQztBQUMxRSxpQkFBUyxRQUFRLFNBQVMsSUFBSSxDQUFBQSxVQUFRLEtBQUssWUFBWSxJQUFJQSxNQUFLLFVBQVUsRUFBRSxXQUFXLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUNoRztBQUFBLElBQ0QsR0FBRyxLQUFLLEdBQUk7QUFDWixTQUFLLFVBQVUsS0FBSyxpQkFBaUIsZUFBZSxNQUFNO0FBQ3pELFVBQUksUUFBUTtBQUNYLHFCQUFhLE1BQU07QUFDbkIsaUJBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUE5QmEsa0JBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogWyJzdGF0Il0KfQo=
