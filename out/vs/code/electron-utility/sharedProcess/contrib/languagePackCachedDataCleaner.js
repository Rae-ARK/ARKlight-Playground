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
import { join } from "../../../../base/common/path.js";
import { Promises } from "../../../../base/node/pfs.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
let LanguagePackCachedDataCleaner = class extends Disposable {
  constructor(environmentService, logService, productService) {
    super();
    this.environmentService = environmentService;
    this.logService = logService;
    this.dataMaxAge = productService.quality !== "stable" ? 1e3 * 60 * 60 * 24 * 7 : 1e3 * 60 * 60 * 24 * 30 * 3;
    if (this.environmentService.isBuilt) {
      const scheduler = this._register(new RunOnceScheduler(
        () => {
          this.cleanUpLanguagePackCache();
        },
        40 * 1e3
        /* after 40s */
      ));
      scheduler.schedule();
    }
  }
  async cleanUpLanguagePackCache() {
    this.logService.trace("[language pack cache cleanup]: Starting to clean up unused language packs.");
    try {
      const installed = /* @__PURE__ */ Object.create(null);
      const metaData = JSON.parse(await promises.readFile(join(this.environmentService.userDataPath, "languagepacks.json"), "utf8"));
      for (const locale of Object.keys(metaData)) {
        const entry = metaData[locale];
        installed[`${entry.hash}.${locale}`] = true;
      }
      const cacheDir = join(this.environmentService.userDataPath, "clp");
      const cacheDirExists = await Promises.exists(cacheDir);
      if (!cacheDirExists) {
        return;
      }
      const entries = await Promises.readdir(cacheDir);
      for (const entry of entries) {
        if (installed[entry]) {
          this.logService.trace(`[language pack cache cleanup]: Skipping folder ${entry}. Language pack still in use.`);
          continue;
        }
        this.logService.trace(`[language pack cache cleanup]: Removing unused language pack: ${entry}`);
        await Promises.rm(join(cacheDir, entry));
      }
      const now = Date.now();
      for (const packEntry of Object.keys(installed)) {
        const folder = join(cacheDir, packEntry);
        const entries2 = await Promises.readdir(folder);
        for (const entry of entries2) {
          if (entry === "tcf.json") {
            continue;
          }
          const candidate = join(folder, entry);
          const stat = await promises.stat(candidate);
          if (stat.isDirectory() && now - stat.mtime.getTime() > this.dataMaxAge) {
            this.logService.trace(`[language pack cache cleanup]: Removing language pack cache folder: ${join(packEntry, entry)}`);
            await Promises.rm(candidate);
          }
        }
      }
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
LanguagePackCachedDataCleaner = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService)
], LanguagePackCachedDataCleaner);
export {
  LanguagePackCachedDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvbGFuZ3VhZ2VQYWNrQ2FjaGVkRGF0YUNsZWFuZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBwcm9taXNlcyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uRW50cnkge1xuXHR2ZXJzaW9uOiBzdHJpbmc7XG5cdGV4dGVuc2lvbklkZW50aWZpZXI6IHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdHV1aWQ6IHN0cmluZztcblx0fTtcbn1cblxuaW50ZXJmYWNlIElMYW5ndWFnZVBhY2tFbnRyeSB7XG5cdGhhc2g6IHN0cmluZztcblx0ZXh0ZW5zaW9uczogSUV4dGVuc2lvbkVudHJ5W107XG59XG5cbmludGVyZmFjZSBJTGFuZ3VhZ2VQYWNrRmlsZSB7XG5cdFtsb2NhbGU6IHN0cmluZ106IElMYW5ndWFnZVBhY2tFbnRyeTtcbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlUGFja0NhY2hlZERhdGFDbGVhbmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkYXRhTWF4QWdlOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRhdGFNYXhBZ2UgPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJ1xuXHRcdFx0PyAxMDAwICogNjAgKiA2MCAqIDI0ICogNyBcdFx0Ly8gcm91Z2hseSAxIHdlZWsgKGluc2lkZXJzKVxuXHRcdFx0OiAxMDAwICogNjAgKiA2MCAqIDI0ICogMzAgKiAzOyAvLyByb3VnaGx5IDMgbW9udGhzIChzdGFibGUpXG5cblx0XHQvLyBXZSBoYXZlIG5vIExhbmd1YWdlIHBhY2sgc3VwcG9ydCBmb3IgZGV2IHZlcnNpb24gKHJ1biBmcm9tIHNvdXJjZSlcblx0XHQvLyBTbyBvbmx5IGNsZWFudXAgd2hlbiB3ZSBoYXZlIGEgYnVpbGQgdmVyc2lvbi5cblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNsZWFuVXBMYW5ndWFnZVBhY2tDYWNoZSgpO1xuXHRcdFx0fSwgNDAgKiAxMDAwIC8qIGFmdGVyIDQwcyAqLykpO1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhblVwTGFuZ3VhZ2VQYWNrQ2FjaGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbbGFuZ3VhZ2UgcGFjayBjYWNoZSBjbGVhbnVwXTogU3RhcnRpbmcgdG8gY2xlYW4gdXAgdW51c2VkIGxhbmd1YWdlIHBhY2tzLicpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluc3RhbGxlZDogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0Y29uc3QgbWV0YURhdGE6IElMYW5ndWFnZVBhY2tGaWxlID0gSlNPTi5wYXJzZShhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShqb2luKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgJ2xhbmd1YWdlcGFja3MuanNvbicpLCAndXRmOCcpKTtcblx0XHRcdGZvciAoY29uc3QgbG9jYWxlIG9mIE9iamVjdC5rZXlzKG1ldGFEYXRhKSkge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IG1ldGFEYXRhW2xvY2FsZV07XG5cdFx0XHRcdGluc3RhbGxlZFtgJHtlbnRyeS5oYXNofS4ke2xvY2FsZX1gXSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENsZWFudXAgZW50cmllcyBmb3IgbGFuZ3VhZ2UgcGFja3MgdGhhdCBhcmVuJ3QgaW5zdGFsbGVkIGFueW1vcmVcblx0XHRcdGNvbnN0IGNhY2hlRGlyID0gam9pbih0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgsICdjbHAnKTtcblx0XHRcdGNvbnN0IGNhY2hlRGlyRXhpc3RzID0gYXdhaXQgUHJvbWlzZXMuZXhpc3RzKGNhY2hlRGlyKTtcblx0XHRcdGlmICghY2FjaGVEaXJFeGlzdHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcihjYWNoZURpcik7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0aWYgKGluc3RhbGxlZFtlbnRyeV0pIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtsYW5ndWFnZSBwYWNrIGNhY2hlIGNsZWFudXBdOiBTa2lwcGluZyBmb2xkZXIgJHtlbnRyeX0uIExhbmd1YWdlIHBhY2sgc3RpbGwgaW4gdXNlLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbbGFuZ3VhZ2UgcGFjayBjYWNoZSBjbGVhbnVwXTogUmVtb3ZpbmcgdW51c2VkIGxhbmd1YWdlIHBhY2s6ICR7ZW50cnl9YCk7XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMucm0oam9pbihjYWNoZURpciwgZW50cnkpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGZvciAoY29uc3QgcGFja0VudHJ5IG9mIE9iamVjdC5rZXlzKGluc3RhbGxlZCkpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyID0gam9pbihjYWNoZURpciwgcGFja0VudHJ5KTtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIoZm9sZGVyKTtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdFx0aWYgKGVudHJ5ID09PSAndGNmLmpzb24nKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBqb2luKGZvbGRlciwgZW50cnkpO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm9taXNlcy5zdGF0KGNhbmRpZGF0ZSk7XG5cdFx0XHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkoKSAmJiAobm93IC0gc3RhdC5tdGltZS5nZXRUaW1lKCkpID4gdGhpcy5kYXRhTWF4QWdlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtsYW5ndWFnZSBwYWNrIGNhY2hlIGNsZWFudXBdOiBSZW1vdmluZyBsYW5ndWFnZSBwYWNrIGNhY2hlIGZvbGRlcjogJHtqb2luKHBhY2tFbnRyeSwgZW50cnkpfWApO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5ybShjYW5kaWRhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQW1CekIsSUFBTSxnQ0FBTixjQUE0QyxXQUFXO0FBQUEsRUFJN0QsWUFDNkMsb0JBQ2QsWUFDYixnQkFDaEI7QUFDRCxVQUFNO0FBSnNDO0FBQ2Q7QUFLOUIsU0FBSyxhQUFhLGVBQWUsWUFBWSxXQUMxQyxNQUFPLEtBQUssS0FBSyxLQUFLLElBQ3RCLE1BQU8sS0FBSyxLQUFLLEtBQUssS0FBSztBQUk5QixRQUFJLEtBQUssbUJBQW1CLFNBQVM7QUFDcEMsWUFBTSxZQUFZLEtBQUssVUFBVSxJQUFJO0FBQUEsUUFBaUIsTUFBTTtBQUMzRCxlQUFLLHlCQUF5QjtBQUFBLFFBQy9CO0FBQUEsUUFBRyxLQUFLO0FBQUE7QUFBQSxNQUFvQixDQUFDO0FBQzdCLGdCQUFVLFNBQVM7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsMkJBQTBDO0FBQ3ZELFNBQUssV0FBVyxNQUFNLDRFQUE0RTtBQUVsRyxRQUFJO0FBQ0gsWUFBTSxZQUF3Qyx1QkFBTyxPQUFPLElBQUk7QUFDaEUsWUFBTSxXQUE4QixLQUFLLE1BQU0sTUFBTSxTQUFTLFNBQVMsS0FBSyxLQUFLLG1CQUFtQixjQUFjLG9CQUFvQixHQUFHLE1BQU0sQ0FBQztBQUNoSixpQkFBVyxVQUFVLE9BQU8sS0FBSyxRQUFRLEdBQUc7QUFDM0MsY0FBTSxRQUFRLFNBQVMsTUFBTTtBQUM3QixrQkFBVSxHQUFHLE1BQU0sSUFBSSxJQUFJLE1BQU0sRUFBRSxJQUFJO0FBQUEsTUFDeEM7QUFHQSxZQUFNLFdBQVcsS0FBSyxLQUFLLG1CQUFtQixjQUFjLEtBQUs7QUFDakUsWUFBTSxpQkFBaUIsTUFBTSxTQUFTLE9BQU8sUUFBUTtBQUNyRCxVQUFJLENBQUMsZ0JBQWdCO0FBQ3BCO0FBQUEsTUFDRDtBQUVBLFlBQU0sVUFBVSxNQUFNLFNBQVMsUUFBUSxRQUFRO0FBQy9DLGlCQUFXLFNBQVMsU0FBUztBQUM1QixZQUFJLFVBQVUsS0FBSyxHQUFHO0FBQ3JCLGVBQUssV0FBVyxNQUFNLGtEQUFrRCxLQUFLLCtCQUErQjtBQUM1RztBQUFBLFFBQ0Q7QUFFQSxhQUFLLFdBQVcsTUFBTSxpRUFBaUUsS0FBSyxFQUFFO0FBRTlGLGNBQU0sU0FBUyxHQUFHLEtBQUssVUFBVSxLQUFLLENBQUM7QUFBQSxNQUN4QztBQUVBLFlBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsaUJBQVcsYUFBYSxPQUFPLEtBQUssU0FBUyxHQUFHO0FBQy9DLGNBQU0sU0FBUyxLQUFLLFVBQVUsU0FBUztBQUN2QyxjQUFNQSxXQUFVLE1BQU0sU0FBUyxRQUFRLE1BQU07QUFDN0MsbUJBQVcsU0FBU0EsVUFBUztBQUM1QixjQUFJLFVBQVUsWUFBWTtBQUN6QjtBQUFBLFVBQ0Q7QUFFQSxnQkFBTSxZQUFZLEtBQUssUUFBUSxLQUFLO0FBQ3BDLGdCQUFNLE9BQU8sTUFBTSxTQUFTLEtBQUssU0FBUztBQUMxQyxjQUFJLEtBQUssWUFBWSxLQUFNLE1BQU0sS0FBSyxNQUFNLFFBQVEsSUFBSyxLQUFLLFlBQVk7QUFDekUsaUJBQUssV0FBVyxNQUFNLHVFQUF1RSxLQUFLLFdBQVcsS0FBSyxDQUFDLEVBQUU7QUFFckgsa0JBQU0sU0FBUyxHQUFHLFNBQVM7QUFBQSxVQUM1QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZix3QkFBa0IsS0FBSztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUNEO0FBN0VhLGdDQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFsiZW50cmllcyJdCn0K
