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
import { Schemas } from "../../../../base/common/network.js";
import { join } from "../../../../base/common/path.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { Promises } from "../../../../base/node/pfs.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let LogsDataCleaner = class extends Disposable {
  constructor(environmentService, logService) {
    super();
    this.environmentService = environmentService;
    this.logService = logService;
    const scheduler = this._register(new RunOnceScheduler(
      () => {
        this.cleanUpOldLogs();
      },
      10 * 1e3
      /* after 10s */
    ));
    scheduler.schedule();
  }
  async cleanUpOldLogs() {
    this.logService.trace("[logs cleanup]: Starting to clean up old logs.");
    try {
      const currentLog = basename(this.environmentService.logsHome);
      const logsRoot = dirname(this.environmentService.logsHome.with({ scheme: Schemas.file })).fsPath;
      const logFiles = await Promises.readdir(logsRoot);
      const allSessions = logFiles.filter((logFile) => /^\d{8}T\d{6}$/.test(logFile));
      const oldSessions = allSessions.sort().filter((session) => session !== currentLog);
      const sessionsToDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));
      if (sessionsToDelete.length > 0) {
        this.logService.trace(`[logs cleanup]: Removing log folders '${sessionsToDelete.join(", ")}'`);
        await Promise.all(sessionsToDelete.map((sessionToDelete) => Promises.rm(join(logsRoot, sessionToDelete))));
      }
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
LogsDataCleaner = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, ILogService)
], LogsDataCleaner);
export {
  LogsDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvbG9nc0RhdGFDbGVhbmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMb2dzRGF0YUNsZWFuZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5jbGVhblVwT2xkTG9ncygpO1xuXHRcdH0sIDEwICogMTAwMCAvKiBhZnRlciAxMHMgKi8pKTtcblx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYW5VcE9sZExvZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbbG9ncyBjbGVhbnVwXTogU3RhcnRpbmcgdG8gY2xlYW4gdXAgb2xkIGxvZ3MuJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY3VycmVudExvZyA9IGJhc2VuYW1lKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lKTtcblx0XHRcdGNvbnN0IGxvZ3NSb290ID0gZGlybmFtZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkpLmZzUGF0aDtcblx0XHRcdGNvbnN0IGxvZ0ZpbGVzID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcihsb2dzUm9vdCk7XG5cblx0XHRcdGNvbnN0IGFsbFNlc3Npb25zID0gbG9nRmlsZXMuZmlsdGVyKGxvZ0ZpbGUgPT4gL15cXGR7OH1UXFxkezZ9JC8udGVzdChsb2dGaWxlKSk7XG5cdFx0XHRjb25zdCBvbGRTZXNzaW9ucyA9IGFsbFNlc3Npb25zLnNvcnQoKS5maWx0ZXIoc2Vzc2lvbiA9PiBzZXNzaW9uICE9PSBjdXJyZW50TG9nKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zVG9EZWxldGUgPSBvbGRTZXNzaW9ucy5zbGljZSgwLCBNYXRoLm1heCgwLCBvbGRTZXNzaW9ucy5sZW5ndGggLSA5KSk7XG5cblx0XHRcdGlmIChzZXNzaW9uc1RvRGVsZXRlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbbG9ncyBjbGVhbnVwXTogUmVtb3ZpbmcgbG9nIGZvbGRlcnMgJyR7c2Vzc2lvbnNUb0RlbGV0ZS5qb2luKCcsICcpfSdgKTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChzZXNzaW9uc1RvRGVsZXRlLm1hcChzZXNzaW9uVG9EZWxldGUgPT4gUHJvbWlzZXMucm0oam9pbihsb2dzUm9vdCwgc2Vzc2lvblRvRGVsZXRlKSkpKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CO0FBRXJCLElBQU0sa0JBQU4sY0FBOEIsV0FBVztBQUFBLEVBRS9DLFlBQ3VDLG9CQUNSLFlBQzdCO0FBQ0QsVUFBTTtBQUhnQztBQUNSO0FBSTlCLFVBQU0sWUFBWSxLQUFLLFVBQVUsSUFBSTtBQUFBLE1BQWlCLE1BQU07QUFDM0QsYUFBSyxlQUFlO0FBQUEsTUFDckI7QUFBQSxNQUFHLEtBQUs7QUFBQTtBQUFBLElBQW9CLENBQUM7QUFDN0IsY0FBVSxTQUFTO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE1BQWMsaUJBQWdDO0FBQzdDLFNBQUssV0FBVyxNQUFNLGdEQUFnRDtBQUV0RSxRQUFJO0FBQ0gsWUFBTSxhQUFhLFNBQVMsS0FBSyxtQkFBbUIsUUFBUTtBQUM1RCxZQUFNLFdBQVcsUUFBUSxLQUFLLG1CQUFtQixTQUFTLEtBQUssRUFBRSxRQUFRLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUMxRixZQUFNLFdBQVcsTUFBTSxTQUFTLFFBQVEsUUFBUTtBQUVoRCxZQUFNLGNBQWMsU0FBUyxPQUFPLGFBQVcsZ0JBQWdCLEtBQUssT0FBTyxDQUFDO0FBQzVFLFlBQU0sY0FBYyxZQUFZLEtBQUssRUFBRSxPQUFPLGFBQVcsWUFBWSxVQUFVO0FBQy9FLFlBQU0sbUJBQW1CLFlBQVksTUFBTSxHQUFHLEtBQUssSUFBSSxHQUFHLFlBQVksU0FBUyxDQUFDLENBQUM7QUFFakYsVUFBSSxpQkFBaUIsU0FBUyxHQUFHO0FBQ2hDLGFBQUssV0FBVyxNQUFNLHlDQUF5QyxpQkFBaUIsS0FBSyxJQUFJLENBQUMsR0FBRztBQUU3RixjQUFNLFFBQVEsSUFBSSxpQkFBaUIsSUFBSSxxQkFBbUIsU0FBUyxHQUFHLEtBQUssVUFBVSxlQUFlLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDeEc7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLHdCQUFrQixLQUFLO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQ0Q7QUFuQ2Esa0JBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
