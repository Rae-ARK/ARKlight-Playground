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
import { joinPath } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { AbstractLogger, ILoggerService } from "../../../../platform/log/common/log.js";
import { windowLogGroup } from "../../../services/log/common/logConstants.js";
import { editSessionsLogId } from "./editSessions.js";
let EditSessionsLogService = class extends AbstractLogger {
  constructor(loggerService, environmentService) {
    super();
    this.logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${editSessionsLogId}.log`), { id: editSessionsLogId, name: localize("cloudChangesLog", "Cloud Changes"), group: windowLogGroup }));
  }
  trace(message, ...args) {
    this.logger.trace(message, ...args);
  }
  debug(message, ...args) {
    this.logger.debug(message, ...args);
  }
  info(message, ...args) {
    this.logger.info(message, ...args);
  }
  warn(message, ...args) {
    this.logger.warn(message, ...args);
  }
  error(message, ...args) {
    this.logger.error(message, ...args);
  }
  flush() {
    this.logger.flush();
  }
};
EditSessionsLogService = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IEnvironmentService)
], EditSessionsLogService);
export {
  EditSessionsLogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRTZXNzaW9ucy9jb21tb24vZWRpdFNlc3Npb25zTG9nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RMb2dnZXIsIElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgd2luZG93TG9nR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sb2cvY29tbW9uL2xvZ0NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJRWRpdFNlc3Npb25zTG9nU2VydmljZSwgZWRpdFNlc3Npb25zTG9nSWQgfSBmcm9tICcuL2VkaXRTZXNzaW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RMb2dnZXIgaW1wbGVtZW50cyBJRWRpdFNlc3Npb25zTG9nU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBJTG9nZ2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nZ2VyU2VydmljZSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmxvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSwgYCR7ZWRpdFNlc3Npb25zTG9nSWR9LmxvZ2ApLCB7IGlkOiBlZGl0U2Vzc2lvbnNMb2dJZCwgbmFtZTogbG9jYWxpemUoJ2Nsb3VkQ2hhbmdlc0xvZycsIFwiQ2xvdWQgQ2hhbmdlc1wiKSwgZ3JvdXA6IHdpbmRvd0xvZ0dyb3VwIH0pKTtcblx0fVxuXG5cdHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIudHJhY2UobWVzc2FnZSwgLi4uYXJncyk7XG5cdH1cblxuXHRkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmRlYnVnKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHR9XG5cblx0aW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmluZm8obWVzc2FnZSwgLi4uYXJncyk7XG5cdH1cblxuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIud2FybihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ2dlci5lcnJvcihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdGZsdXNoKCk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmZsdXNoKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBeUIsc0JBQXNCO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQWtDLHlCQUF5QjtBQUVwRCxJQUFNLHlCQUFOLGNBQXFDLGVBQWtEO0FBQUEsRUFLN0YsWUFDaUIsZUFDSyxvQkFDcEI7QUFDRCxVQUFNO0FBQ04sU0FBSyxTQUFTLEtBQUssVUFBVSxjQUFjLGFBQWEsU0FBUyxtQkFBbUIsVUFBVSxHQUFHLGlCQUFpQixNQUFNLEdBQUcsRUFBRSxJQUFJLG1CQUFtQixNQUFNLFNBQVMsbUJBQW1CLGVBQWUsR0FBRyxPQUFPLGVBQWUsQ0FBQyxDQUFDO0FBQUEsRUFDak87QUFBQSxFQUVBLE1BQU0sWUFBb0IsTUFBdUI7QUFDaEQsU0FBSyxPQUFPLE1BQU0sU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsTUFBTSxZQUFvQixNQUF1QjtBQUNoRCxTQUFLLE9BQU8sTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxLQUFLLFlBQW9CLE1BQXVCO0FBQy9DLFNBQUssT0FBTyxLQUFLLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDbEM7QUFBQSxFQUVBLEtBQUssWUFBb0IsTUFBdUI7QUFDL0MsU0FBSyxPQUFPLEtBQUssU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBTSxZQUE0QixNQUF1QjtBQUN4RCxTQUFLLE9BQU8sTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxPQUFPLE1BQU07QUFBQSxFQUNuQjtBQUNEO0FBcENhLHlCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
