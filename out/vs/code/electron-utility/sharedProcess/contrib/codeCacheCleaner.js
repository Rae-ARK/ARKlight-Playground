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
import { promises } from "fs";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { basename, dirname, join } from "../../../../base/common/path.js";
import { Promises } from "../../../../base/node/pfs.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
let CodeCacheCleaner = class extends Disposable {
  constructor(currentCodeCachePath, productService, logService) {
    super();
    this.logService = logService;
    this.dataMaxAge = productService.quality !== "stable" ? 1e3 * 60 * 60 * 24 * 7 : 1e3 * 60 * 60 * 24 * 30 * 3;
    if (currentCodeCachePath) {
      const scheduler = this._register(new RunOnceScheduler(
        () => {
          this.cleanUpCodeCaches(currentCodeCachePath);
        },
        30 * 1e3
        /* after 30s */
      ));
      scheduler.schedule();
    }
  }
  async cleanUpCodeCaches(currentCodeCachePath) {
    this.logService.trace("[code cache cleanup]: Starting to clean up old code cache folders.");
    try {
      const now = Date.now();
      const codeCacheRootPath = dirname(currentCodeCachePath);
      const currentCodeCache = basename(currentCodeCachePath);
      const codeCaches = await Promises.readdir(codeCacheRootPath);
      await Promise.all(codeCaches.map(async (codeCache) => {
        if (codeCache === currentCodeCache) {
          return;
        }
        const codeCacheEntryPath = join(codeCacheRootPath, codeCache);
        const codeCacheEntryStat = await promises.stat(codeCacheEntryPath);
        if (codeCacheEntryStat.isDirectory() && now - codeCacheEntryStat.mtime.getTime() > this.dataMaxAge) {
          this.logService.trace(`[code cache cleanup]: Removing code cache folder ${codeCache}.`);
          return Promises.rm(codeCacheEntryPath);
        }
      }));
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
CodeCacheCleaner = __decorateClass([
  __decorateParam(1, IProductService),
  __decorateParam(2, ILogService)
], CodeCacheCleaner);
export {
  CodeCacheCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvY29kZUNhY2hlQ2xlYW5lci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHByb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIENvZGVDYWNoZUNsZWFuZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRhdGFNYXhBZ2U6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjdXJyZW50Q29kZUNhY2hlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kYXRhTWF4QWdlID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZSdcblx0XHRcdD8gMTAwMCAqIDYwICogNjAgKiAyNCAqIDcgXHRcdC8vIHJvdWdobHkgMSB3ZWVrIChpbnNpZGVycylcblx0XHRcdDogMTAwMCAqIDYwICogNjAgKiAyNCAqIDMwICogMzsgLy8gcm91Z2hseSAzIG1vbnRocyAoc3RhYmxlKVxuXG5cdFx0Ly8gQ2FjaGVkIGRhdGEgaXMgc3RvcmVkIGFzIHVzZXIgZGF0YSBhbmQgd2UgcnVuIGEgY2xlYW51cCB0YXNrIGV2ZXJ5IHRpbWVcblx0XHQvLyB0aGUgZWRpdG9yIHN0YXJ0cy4gVGhlIHN0cmF0ZWd5IGlzIHRvIGRlbGV0ZSBhbGwgZmlsZXMgdGhhdCBhcmUgb2xkZXIgdGhhblxuXHRcdC8vIDMgbW9udGhzICgxIHdlZWsgcmVzcGVjdGl2ZWx5KVxuXHRcdGlmIChjdXJyZW50Q29kZUNhY2hlUGF0aCkge1xuXHRcdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNsZWFuVXBDb2RlQ2FjaGVzKGN1cnJlbnRDb2RlQ2FjaGVQYXRoKTtcblx0XHRcdH0sIDMwICogMTAwMCAvKiBhZnRlciAzMHMgKi8pKTtcblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYW5VcENvZGVDYWNoZXMoY3VycmVudENvZGVDYWNoZVBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW2NvZGUgY2FjaGUgY2xlYW51cF06IFN0YXJ0aW5nIHRvIGNsZWFuIHVwIG9sZCBjb2RlIGNhY2hlIGZvbGRlcnMuJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuXHRcdFx0Ly8gVGhlIGZvbGRlciB3aGljaCBjb250YWlucyBmb2xkZXJzIG9mIGNhY2hlZCBkYXRhLlxuXHRcdFx0Ly8gRWFjaCBvZiB0aGVzZSBmb2xkZXJzIGlzIHBhcnRpb25lZCBwZXIgY29tbWl0XG5cdFx0XHRjb25zdCBjb2RlQ2FjaGVSb290UGF0aCA9IGRpcm5hbWUoY3VycmVudENvZGVDYWNoZVBhdGgpO1xuXHRcdFx0Y29uc3QgY3VycmVudENvZGVDYWNoZSA9IGJhc2VuYW1lKGN1cnJlbnRDb2RlQ2FjaGVQYXRoKTtcblxuXHRcdFx0Y29uc3QgY29kZUNhY2hlcyA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIoY29kZUNhY2hlUm9vdFBhdGgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoY29kZUNhY2hlcy5tYXAoYXN5bmMgY29kZUNhY2hlID0+IHtcblx0XHRcdFx0aWYgKGNvZGVDYWNoZSA9PT0gY3VycmVudENvZGVDYWNoZSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gbm90IHRoZSBjdXJyZW50IGNhY2hlIGZvbGRlclxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGVsZXRlIGNhY2hlIGZvbGRlciBpZiBvbGQgZW5vdWdoXG5cdFx0XHRcdGNvbnN0IGNvZGVDYWNoZUVudHJ5UGF0aCA9IGpvaW4oY29kZUNhY2hlUm9vdFBhdGgsIGNvZGVDYWNoZSk7XG5cdFx0XHRcdGNvbnN0IGNvZGVDYWNoZUVudHJ5U3RhdCA9IGF3YWl0IHByb21pc2VzLnN0YXQoY29kZUNhY2hlRW50cnlQYXRoKTtcblx0XHRcdFx0aWYgKGNvZGVDYWNoZUVudHJ5U3RhdC5pc0RpcmVjdG9yeSgpICYmIChub3cgLSBjb2RlQ2FjaGVFbnRyeVN0YXQubXRpbWUuZ2V0VGltZSgpKSA+IHRoaXMuZGF0YU1heEFnZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2NvZGUgY2FjaGUgY2xlYW51cF06IFJlbW92aW5nIGNvZGUgY2FjaGUgZm9sZGVyICR7Y29kZUNhY2hlfS5gKTtcblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlcy5ybShjb2RlQ2FjaGVFbnRyeVBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLFNBQVMsWUFBWTtBQUN4QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUV6QixJQUFNLG1CQUFOLGNBQStCLFdBQVc7QUFBQSxFQUloRCxZQUNDLHNCQUNpQixnQkFDYSxZQUM3QjtBQUNELFVBQU07QUFGd0I7QUFJOUIsU0FBSyxhQUFhLGVBQWUsWUFBWSxXQUMxQyxNQUFPLEtBQUssS0FBSyxLQUFLLElBQ3RCLE1BQU8sS0FBSyxLQUFLLEtBQUssS0FBSztBQUs5QixRQUFJLHNCQUFzQjtBQUN6QixZQUFNLFlBQVksS0FBSyxVQUFVLElBQUk7QUFBQSxRQUFpQixNQUFNO0FBQzNELGVBQUssa0JBQWtCLG9CQUFvQjtBQUFBLFFBQzVDO0FBQUEsUUFBRyxLQUFLO0FBQUE7QUFBQSxNQUFvQixDQUFDO0FBQzdCLGdCQUFVLFNBQVM7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLHNCQUE2QztBQUM1RSxTQUFLLFdBQVcsTUFBTSxvRUFBb0U7QUFFMUYsUUFBSTtBQUNILFlBQU0sTUFBTSxLQUFLLElBQUk7QUFJckIsWUFBTSxvQkFBb0IsUUFBUSxvQkFBb0I7QUFDdEQsWUFBTSxtQkFBbUIsU0FBUyxvQkFBb0I7QUFFdEQsWUFBTSxhQUFhLE1BQU0sU0FBUyxRQUFRLGlCQUFpQjtBQUMzRCxZQUFNLFFBQVEsSUFBSSxXQUFXLElBQUksT0FBTSxjQUFhO0FBQ25ELFlBQUksY0FBYyxrQkFBa0I7QUFDbkM7QUFBQSxRQUNEO0FBR0EsY0FBTSxxQkFBcUIsS0FBSyxtQkFBbUIsU0FBUztBQUM1RCxjQUFNLHFCQUFxQixNQUFNLFNBQVMsS0FBSyxrQkFBa0I7QUFDakUsWUFBSSxtQkFBbUIsWUFBWSxLQUFNLE1BQU0sbUJBQW1CLE1BQU0sUUFBUSxJQUFLLEtBQUssWUFBWTtBQUNyRyxlQUFLLFdBQVcsTUFBTSxvREFBb0QsU0FBUyxHQUFHO0FBRXRGLGlCQUFPLFNBQVMsR0FBRyxrQkFBa0I7QUFBQSxRQUN0QztBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxTQUFTLE9BQU87QUFDZix3QkFBa0IsS0FBSztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUNEO0FBeERhLG1CQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
