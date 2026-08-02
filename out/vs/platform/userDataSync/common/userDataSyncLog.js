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
import { joinPath } from "../../../base/common/resources.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { AbstractLogger, ILoggerService } from "../../log/common/log.js";
import { USER_DATA_SYNC_LOG_ID } from "./userDataSync.js";
let UserDataSyncLogService = class extends AbstractLogger {
  constructor(loggerService, environmentService) {
    super();
    this.logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${USER_DATA_SYNC_LOG_ID}.log`), { id: USER_DATA_SYNC_LOG_ID, name: localize("userDataSyncLog", "Settings Sync") }));
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
UserDataSyncLogService = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IEnvironmentService)
], UserDataSyncLogService);
export {
  UserDataSyncLogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jTG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdExvZ2dlciwgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgVVNFUl9EQVRBX1NZTkNfTE9HX0lEIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jTG9nU2VydmljZSBleHRlbmRzIEFic3RyYWN0TG9nZ2VyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvZ2dlcjogSUxvZ2dlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIobG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lLCBgJHtVU0VSX0RBVEFfU1lOQ19MT0dfSUR9LmxvZ2ApLCB7IGlkOiBVU0VSX0RBVEFfU1lOQ19MT0dfSUQsIG5hbWU6IGxvY2FsaXplKCd1c2VyRGF0YVN5bmNMb2cnLCBcIlNldHRpbmdzIFN5bmNcIikgfSkpO1xuXHR9XG5cblx0dHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ2dlci50cmFjZShtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIuZGVidWcobWVzc2FnZSwgLi4uYXJncyk7XG5cdH1cblxuXHRpbmZvKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIuaW5mbyhtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXG5cdHdhcm4obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ2dlci53YXJuKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHR9XG5cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmVycm9yKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHR9XG5cblx0Zmx1c2goKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIuZmx1c2goKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQXlCLHNCQUFzQjtBQUN4RCxTQUFrQyw2QkFBNkI7QUFFeEQsSUFBTSx5QkFBTixjQUFxQyxlQUFrRDtBQUFBLEVBSzdGLFlBQ2lCLGVBQ0ssb0JBQ3BCO0FBQ0QsVUFBTTtBQUNOLFNBQUssU0FBUyxLQUFLLFVBQVUsY0FBYyxhQUFhLFNBQVMsbUJBQW1CLFVBQVUsR0FBRyxxQkFBcUIsTUFBTSxHQUFHLEVBQUUsSUFBSSx1QkFBdUIsTUFBTSxTQUFTLG1CQUFtQixlQUFlLEVBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDbE47QUFBQSxFQUVBLE1BQU0sWUFBb0IsTUFBdUI7QUFDaEQsU0FBSyxPQUFPLE1BQU0sU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsTUFBTSxZQUFvQixNQUF1QjtBQUNoRCxTQUFLLE9BQU8sTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxLQUFLLFlBQW9CLE1BQXVCO0FBQy9DLFNBQUssT0FBTyxLQUFLLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDbEM7QUFBQSxFQUVBLEtBQUssWUFBb0IsTUFBdUI7QUFDL0MsU0FBSyxPQUFPLEtBQUssU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBTSxZQUE0QixNQUF1QjtBQUN4RCxTQUFLLE9BQU8sTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxPQUFPLE1BQU07QUFBQSxFQUNuQjtBQUVEO0FBckNhLHlCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
