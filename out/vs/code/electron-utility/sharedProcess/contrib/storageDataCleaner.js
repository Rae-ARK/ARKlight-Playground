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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { join } from "../../../../base/common/path.js";
import { Promises } from "../../../../base/node/pfs.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { StorageClient } from "../../../../platform/storage/common/storageIpc.js";
import { EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE } from "../../../../platform/workspace/common/workspace.js";
import { getWorkspaceIdentifier } from "../../../../platform/workspaces/common/workspaceIdentifier.js";
import { NON_EMPTY_WORKSPACE_ID_LENGTH } from "../../../../platform/workspaces/node/workspaces.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { Schemas } from "../../../../base/common/network.js";
let UnusedWorkspaceStorageDataCleaner = class extends Disposable {
  constructor(environmentService, logService, nativeHostService, mainProcessService) {
    super();
    this.environmentService = environmentService;
    this.logService = logService;
    this.nativeHostService = nativeHostService;
    this.mainProcessService = mainProcessService;
    const scheduler = this._register(new RunOnceScheduler(
      () => {
        this.cleanUpStorage();
      },
      30 * 1e3
      /* after 30s */
    ));
    scheduler.schedule();
  }
  /**
   * Public for testing.
   */
  async cleanUpStorage() {
    this.logService.trace("[storage cleanup]: Starting to clean up workspace storage folders for unused empty workspaces.");
    try {
      const workspaceStorageHome = this.environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath;
      const workspaceStorageFolders = await Promises.readdir(workspaceStorageHome);
      const storageClient = new StorageClient(this.mainProcessService.getChannel("storage"));
      await Promise.all(workspaceStorageFolders.map(async (workspaceStorageFolder) => {
        const workspaceStoragePath = join(workspaceStorageHome, workspaceStorageFolder);
        if (workspaceStorageFolder.length === NON_EMPTY_WORKSPACE_ID_LENGTH) {
          return;
        }
        if (workspaceStorageFolder === EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE.id) {
          return;
        }
        if (workspaceStorageFolder === getWorkspaceIdentifier(this.environmentService.agentSessionsWorkspace).id) {
          return;
        }
        const windows = await this.nativeHostService.getWindows({ includeAuxiliaryWindows: false });
        if (windows.some((window) => window.workspace?.id === workspaceStorageFolder)) {
          return;
        }
        const isStorageUsed = await storageClient.isUsed(workspaceStoragePath);
        if (isStorageUsed) {
          return;
        }
        this.logService.trace(`[storage cleanup]: Deleting workspace storage folder ${workspaceStorageFolder} as it seems to be an unused empty workspace.`);
        await Promises.rm(workspaceStoragePath);
      }));
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
UnusedWorkspaceStorageDataCleaner = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, ILogService),
  __decorateParam(2, INativeHostService),
  __decorateParam(3, IMainProcessService)
], UnusedWorkspaceStorageDataCleaner);
export {
  UnusedWorkspaceStorageDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvc3RvcmFnZURhdGFDbGVhbmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZUlwYy5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fREVWRUxPUE1FTlRfRU1QVFlfV0lORE9XX1dPUktTUEFDRSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGdldFdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IE5PTl9FTVBUWV9XT1JLU1BBQ0VfSURfTEVOR1RIIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9ub2RlL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgSU1haW5Qcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9jb21tb24vbWFpblByb2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuZXhwb3J0IGNsYXNzIFVudXNlZFdvcmtzcGFjZVN0b3JhZ2VEYXRhQ2xlYW5lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJTWFpblByb2Nlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFpblByb2Nlc3NTZXJ2aWNlOiBJTWFpblByb2Nlc3NTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBzY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLmNsZWFuVXBTdG9yYWdlKCk7XG5cdFx0fSwgMzAgKiAxMDAwIC8qIGFmdGVyIDMwcyAqLykpO1xuXHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1YmxpYyBmb3IgdGVzdGluZy5cblx0ICovXG5cdGFzeW5jIGNsZWFuVXBTdG9yYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW3N0b3JhZ2UgY2xlYW51cF06IFN0YXJ0aW5nIHRvIGNsZWFuIHVwIHdvcmtzcGFjZSBzdG9yYWdlIGZvbGRlcnMgZm9yIHVudXNlZCBlbXB0eSB3b3Jrc3BhY2VzLicpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZVN0b3JhZ2VIb21lID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5maWxlIH0pLmZzUGF0aDtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZVN0b3JhZ2VGb2xkZXJzID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcih3b3Jrc3BhY2VTdG9yYWdlSG9tZSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlQ2xpZW50ID0gbmV3IFN0b3JhZ2VDbGllbnQodGhpcy5tYWluUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbCgnc3RvcmFnZScpKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwod29ya3NwYWNlU3RvcmFnZUZvbGRlcnMubWFwKGFzeW5jIHdvcmtzcGFjZVN0b3JhZ2VGb2xkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VTdG9yYWdlUGF0aCA9IGpvaW4od29ya3NwYWNlU3RvcmFnZUhvbWUsIHdvcmtzcGFjZVN0b3JhZ2VGb2xkZXIpO1xuXG5cdFx0XHRcdGlmICh3b3Jrc3BhY2VTdG9yYWdlRm9sZGVyLmxlbmd0aCA9PT0gTk9OX0VNUFRZX1dPUktTUEFDRV9JRF9MRU5HVEgpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGtlZXAgd29ya3NwYWNlIHN0b3JhZ2UgZm9yIGZvbGRlcnMvd29ya3NwYWNlcyB0aGF0IGNhbiBiZSBhY2Nlc3NlZCBzdGlsbFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdvcmtzcGFjZVN0b3JhZ2VGb2xkZXIgPT09IEVYVEVOU0lPTl9ERVZFTE9QTUVOVF9FTVBUWV9XSU5ET1dfV09SS1NQQUNFLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBrZWVwIHdvcmtzcGFjZSBzdG9yYWdlIGZvciBlbXB0eSBleHRlbnNpb24gZGV2ZWxvcG1lbnQgd29ya3NwYWNlc1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdvcmtzcGFjZVN0b3JhZ2VGb2xkZXIgPT09IGdldFdvcmtzcGFjZUlkZW50aWZpZXIodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSkuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGtlZXAgd29ya3NwYWNlIHN0b3JhZ2UgZm9yIHRoZSBhZ2VudHMgd2luZG93IChwZXJtYW5lbnQgYnVpbHQtaW4gc3VyZmFjZSlcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHdpbmRvd3MgPSBhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLmdldFdpbmRvd3MoeyBpbmNsdWRlQXV4aWxpYXJ5V2luZG93czogZmFsc2UgfSk7XG5cdFx0XHRcdGlmICh3aW5kb3dzLnNvbWUod2luZG93ID0+IHdpbmRvdy53b3Jrc3BhY2U/LmlkID09PSB3b3Jrc3BhY2VTdG9yYWdlRm9sZGVyKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8ga2VlcCB3b3Jrc3BhY2Ugc3RvcmFnZSBmb3IgZW1wdHkgd29ya3NwYWNlcyBvcGVuZWQgYXMgd2luZG93XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpc1N0b3JhZ2VVc2VkID0gYXdhaXQgc3RvcmFnZUNsaWVudC5pc1VzZWQod29ya3NwYWNlU3RvcmFnZVBhdGgpO1xuXHRcdFx0XHRpZiAoaXNTdG9yYWdlVXNlZCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8ga2VlcCB3b3Jrc3BhY2Ugc3RvcmFnZSBmb3IgZW1wdHkgd29ya3NwYWNlcyB0aGF0IGFyZSBpbiB1c2Vcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3N0b3JhZ2UgY2xlYW51cF06IERlbGV0aW5nIHdvcmtzcGFjZSBzdG9yYWdlIGZvbGRlciAke3dvcmtzcGFjZVN0b3JhZ2VGb2xkZXJ9IGFzIGl0IHNlZW1zIHRvIGJlIGFuIHVudXNlZCBlbXB0eSB3b3Jrc3BhY2UuYCk7XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMucm0od29ya3NwYWNlU3RvcmFnZVBhdGgpO1xuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9EQUFvRDtBQUM3RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFFakIsSUFBTSxvQ0FBTixjQUFnRCxXQUFXO0FBQUEsRUFFakUsWUFDNkMsb0JBQ2QsWUFDTyxtQkFDQyxvQkFDckM7QUFDRCxVQUFNO0FBTHNDO0FBQ2Q7QUFDTztBQUNDO0FBSXRDLFVBQU0sWUFBWSxLQUFLLFVBQVUsSUFBSTtBQUFBLE1BQWlCLE1BQU07QUFDM0QsYUFBSyxlQUFlO0FBQUEsTUFDckI7QUFBQSxNQUFHLEtBQUs7QUFBQTtBQUFBLElBQW9CLENBQUM7QUFDN0IsY0FBVSxTQUFTO0FBQUEsRUFDcEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0saUJBQWdDO0FBQ3JDLFNBQUssV0FBVyxNQUFNLGdHQUFnRztBQUV0SCxRQUFJO0FBQ0gsWUFBTSx1QkFBdUIsS0FBSyxtQkFBbUIscUJBQXFCLEtBQUssRUFBRSxRQUFRLFFBQVEsS0FBSyxDQUFDLEVBQUU7QUFDekcsWUFBTSwwQkFBMEIsTUFBTSxTQUFTLFFBQVEsb0JBQW9CO0FBQzNFLFlBQU0sZ0JBQWdCLElBQUksY0FBYyxLQUFLLG1CQUFtQixXQUFXLFNBQVMsQ0FBQztBQUVyRixZQUFNLFFBQVEsSUFBSSx3QkFBd0IsSUFBSSxPQUFNLDJCQUEwQjtBQUM3RSxjQUFNLHVCQUF1QixLQUFLLHNCQUFzQixzQkFBc0I7QUFFOUUsWUFBSSx1QkFBdUIsV0FBVywrQkFBK0I7QUFDcEU7QUFBQSxRQUNEO0FBRUEsWUFBSSwyQkFBMkIsNkNBQTZDLElBQUk7QUFDL0U7QUFBQSxRQUNEO0FBRUEsWUFBSSwyQkFBMkIsdUJBQXVCLEtBQUssbUJBQW1CLHNCQUFzQixFQUFFLElBQUk7QUFDekc7QUFBQSxRQUNEO0FBRUEsY0FBTSxVQUFVLE1BQU0sS0FBSyxrQkFBa0IsV0FBVyxFQUFFLHlCQUF5QixNQUFNLENBQUM7QUFDMUYsWUFBSSxRQUFRLEtBQUssWUFBVSxPQUFPLFdBQVcsT0FBTyxzQkFBc0IsR0FBRztBQUM1RTtBQUFBLFFBQ0Q7QUFFQSxjQUFNLGdCQUFnQixNQUFNLGNBQWMsT0FBTyxvQkFBb0I7QUFDckUsWUFBSSxlQUFlO0FBQ2xCO0FBQUEsUUFDRDtBQUVBLGFBQUssV0FBVyxNQUFNLHdEQUF3RCxzQkFBc0IsK0NBQStDO0FBRW5KLGNBQU0sU0FBUyxHQUFHLG9CQUFvQjtBQUFBLE1BQ3ZDLENBQUMsQ0FBQztBQUFBLElBQ0gsU0FBUyxPQUFPO0FBQ2Ysd0JBQWtCLEtBQUs7QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFDRDtBQTVEYSxvQ0FBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
