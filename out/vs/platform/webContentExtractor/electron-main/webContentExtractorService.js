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
import { BrowserWindow } from "electron";
import { Limiter } from "../../../base/common/async.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentNetworkFilterService } from "../../networkFilter/common/networkFilterService.js";
import { isURLDomainTrusted } from "../../url/common/trustedDomains.js";
import { WebContentCache } from "./webContentCache.js";
import { WebPageLoader } from "./webPageLoader.js";
let NativeWebContentExtractorService = class extends Disposable {
  constructor(_logger, _agentNetworkFilterService) {
    super();
    this._logger = _logger;
    this._agentNetworkFilterService = _agentNetworkFilterService;
    // Only allow 3 windows to be opened at a time
    // to avoid overwhelming the system with too many processes.
    this._limiter = new Limiter(3);
    this._webContentsCache = new WebContentCache();
    this._register(this._agentNetworkFilterService.onDidChange(() => this._webContentsCache.clear()));
  }
  extract(uris, options) {
    if (uris.length === 0) {
      this._logger.info("No URIs provided for extraction");
      return Promise.resolve([]);
    }
    this._logger.info(`Extracting content from ${uris.length} URIs`);
    return Promise.all(uris.map((uri) => this._limiter.queue(() => this.doExtract(uri, options))));
  }
  async doExtract(uri, options) {
    const cached = this._webContentsCache.tryGet(uri, options);
    if (cached !== void 0) {
      this._logger.info(`Found cached content for ${uri.toString()}`);
      return cached;
    }
    const loader = new WebPageLoader(
      (options2) => new BrowserWindow(options2),
      this._logger,
      uri,
      options,
      (uri2) => isURLDomainTrusted(uri2, options?.trustedDomains || []),
      this._agentNetworkFilterService
    );
    try {
      const result = await loader.load();
      this._webContentsCache.add(uri, options, result);
      return result;
    } finally {
      loader.dispose();
    }
  }
};
NativeWebContentExtractorService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IAgentNetworkFilterService)
], NativeWebContentExtractorService);
export {
  NativeWebContentExtractorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvZWxlY3Ryb24tbWFpbi93ZWJDb250ZW50RXh0cmFjdG9yU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJyb3dzZXJXaW5kb3cgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBMaW1pdGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uL25ldHdvcmtGaWx0ZXIvY29tbW9uL25ldHdvcmtGaWx0ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVVJMRG9tYWluVHJ1c3RlZCB9IGZyb20gJy4uLy4uL3VybC9jb21tb24vdHJ1c3RlZERvbWFpbnMuanMnO1xuaW1wb3J0IHsgSVdlYkNvbnRlbnRFeHRyYWN0b3JPcHRpb25zLCBJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsIFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgV2ViQ29udGVudENhY2hlIH0gZnJvbSAnLi93ZWJDb250ZW50Q2FjaGUuanMnO1xuaW1wb3J0IHsgV2ViUGFnZUxvYWRlciB9IGZyb20gJy4vd2ViUGFnZUxvYWRlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Ly8gT25seSBhbGxvdyAzIHdpbmRvd3MgdG8gYmUgb3BlbmVkIGF0IGEgdGltZVxuXHQvLyB0byBhdm9pZCBvdmVyd2hlbG1pbmcgdGhlIHN5c3RlbSB3aXRoIHRvbyBtYW55IHByb2Nlc3Nlcy5cblx0cHJpdmF0ZSBfbGltaXRlciA9IG5ldyBMaW1pdGVyPFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0PigzKTtcblx0cHJpdmF0ZSBfd2ViQ29udGVudHNDYWNoZSA9IG5ldyBXZWJDb250ZW50Q2FjaGUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJTG9nU2VydmljZSxcblx0XHRASUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl93ZWJDb250ZW50c0NhY2hlLmNsZWFyKCkpKTtcblx0fVxuXG5cdGV4dHJhY3QodXJpczogVVJJW10sIG9wdGlvbnM/OiBJV2ViQ29udGVudEV4dHJhY3Rvck9wdGlvbnMpOiBQcm9taXNlPFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0W10+IHtcblx0XHRpZiAodXJpcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKCdObyBVUklzIHByb3ZpZGVkIGZvciBleHRyYWN0aW9uJyk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYEV4dHJhY3RpbmcgY29udGVudCBmcm9tICR7dXJpcy5sZW5ndGh9IFVSSXNgKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwodXJpcy5tYXAoKHVyaSkgPT4gdGhpcy5fbGltaXRlci5xdWV1ZSgoKSA9PiB0aGlzLmRvRXh0cmFjdCh1cmksIG9wdGlvbnMpKSkpO1xuXHR9XG5cblx0YXN5bmMgZG9FeHRyYWN0KHVyaTogVVJJLCBvcHRpb25zOiBJV2ViQ29udGVudEV4dHJhY3Rvck9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0PiB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fd2ViQ29udGVudHNDYWNoZS50cnlHZXQodXJpLCBvcHRpb25zKTtcblx0XHRpZiAoY2FjaGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBGb3VuZCBjYWNoZWQgY29udGVudCBmb3IgJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9hZGVyID0gbmV3IFdlYlBhZ2VMb2FkZXIoXG5cdFx0XHQob3B0aW9ucykgPT4gbmV3IEJyb3dzZXJXaW5kb3cob3B0aW9ucyksXG5cdFx0XHR0aGlzLl9sb2dnZXIsXG5cdFx0XHR1cmksXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0KHVyaSkgPT4gaXNVUkxEb21haW5UcnVzdGVkKHVyaSwgb3B0aW9ucz8udHJ1c3RlZERvbWFpbnMgfHwgW10pLFxuXHRcdFx0dGhpcy5fYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZGVyLmxvYWQoKTtcblx0XHRcdHRoaXMuX3dlYkNvbnRlbnRzQ2FjaGUuYWRkKHVyaSwgb3B0aW9ucywgcmVzdWx0KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxvYWRlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQjtBQUV2QixJQUFNLG1DQUFOLGNBQStDLFdBQWtEO0FBQUEsRUFRdkcsWUFDK0IsU0FDZSw0QkFDNUM7QUFDRCxVQUFNO0FBSHdCO0FBQ2U7QUFMOUM7QUFBQTtBQUFBLFNBQVEsV0FBVyxJQUFJLFFBQWlDLENBQUM7QUFDekQsU0FBUSxvQkFBb0IsSUFBSSxnQkFBZ0I7QUFPL0MsU0FBSyxVQUFVLEtBQUssMkJBQTJCLFlBQVksTUFBTSxLQUFLLGtCQUFrQixNQUFNLENBQUMsQ0FBQztBQUFBLEVBQ2pHO0FBQUEsRUFFQSxRQUFRLE1BQWEsU0FBMkU7QUFDL0YsUUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QixXQUFLLFFBQVEsS0FBSyxpQ0FBaUM7QUFDbkQsYUFBTyxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDMUI7QUFDQSxTQUFLLFFBQVEsS0FBSywyQkFBMkIsS0FBSyxNQUFNLE9BQU87QUFDL0QsV0FBTyxRQUFRLElBQUksS0FBSyxJQUFJLENBQUMsUUFBUSxLQUFLLFNBQVMsTUFBTSxNQUFNLEtBQUssVUFBVSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUM5RjtBQUFBLEVBRUEsTUFBTSxVQUFVLEtBQVUsU0FBb0Y7QUFDN0csVUFBTSxTQUFTLEtBQUssa0JBQWtCLE9BQU8sS0FBSyxPQUFPO0FBQ3pELFFBQUksV0FBVyxRQUFXO0FBQ3pCLFdBQUssUUFBUSxLQUFLLDRCQUE0QixJQUFJLFNBQVMsQ0FBQyxFQUFFO0FBQzlELGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFTLElBQUk7QUFBQSxNQUNsQixDQUFDQSxhQUFZLElBQUksY0FBY0EsUUFBTztBQUFBLE1BQ3RDLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0EsQ0FBQ0MsU0FBUSxtQkFBbUJBLE1BQUssU0FBUyxrQkFBa0IsQ0FBQyxDQUFDO0FBQUEsTUFDOUQsS0FBSztBQUFBLElBQTBCO0FBRWhDLFFBQUk7QUFDSCxZQUFNLFNBQVMsTUFBTSxPQUFPLEtBQUs7QUFDakMsV0FBSyxrQkFBa0IsSUFBSSxLQUFLLFNBQVMsTUFBTTtBQUMvQyxhQUFPO0FBQUEsSUFDUixVQUFFO0FBQ0QsYUFBTyxRQUFRO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQ0Q7QUFoRGEsbUNBQU47QUFBQSxFQVNKO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbIm9wdGlvbnMiLCAidXJpIl0KfQo=
