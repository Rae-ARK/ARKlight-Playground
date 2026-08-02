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
import { IModelService } from "../../../../editor/common/services/model.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ISearchService, SearchProviderType, TextSearchCompleteMessageType } from "../common/search.js";
import { SearchService } from "../common/searchService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { logOnceWebWorkerWarning } from "../../../../base/common/worker/webWorker.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { WebWorkerDescriptor } from "../../../../platform/webWorker/browser/webWorkerDescriptor.js";
import { IWebWorkerService } from "../../../../platform/webWorker/browser/webWorkerService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { LocalFileSearchWorkerHost } from "../common/localFileSearchWorkerTypes.js";
import { memoize } from "../../../../base/common/decorators.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { Emitter } from "../../../../base/common/event.js";
import { localize } from "../../../../nls.js";
import { WebFileSystemAccess } from "../../../../platform/files/browser/webFileSystemAccess.js";
import { revive } from "../../../../base/common/marshalling.js";
let RemoteSearchService = class extends SearchService {
  constructor(modelService, editorService, telemetryService, logService, extensionService, fileService, instantiationService, uriIdentityService) {
    super(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService);
    this.instantiationService = instantiationService;
    const searchProvider = this.instantiationService.createInstance(LocalFileSearchWorkerClient);
    this.registerSearchResultProvider(Schemas.file, SearchProviderType.file, searchProvider);
    this.registerSearchResultProvider(Schemas.file, SearchProviderType.text, searchProvider);
  }
};
RemoteSearchService = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IUriIdentityService)
], RemoteSearchService);
let LocalFileSearchWorkerClient = class extends Disposable {
  constructor(fileService, uriIdentityService, webWorkerService) {
    super();
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.webWorkerService = webWorkerService;
    this._onDidReceiveTextSearchMatch = this._register(new Emitter());
    this.onDidReceiveTextSearchMatch = this._onDidReceiveTextSearchMatch.event;
    this.queryId = 0;
    this._worker = null;
  }
  async getAIName() {
    return void 0;
  }
  sendTextSearchMatch(match, queryId) {
    this._onDidReceiveTextSearchMatch.fire({ match, queryId });
  }
  get fileSystemProvider() {
    return this.fileService.getProvider(Schemas.file);
  }
  async cancelQuery(queryId) {
    const proxy = this._getOrCreateWorker().proxy;
    proxy.$cancelQuery(queryId);
  }
  async textSearch(query, onProgress, token) {
    try {
      const queryDisposables = new DisposableStore();
      const proxy = this._getOrCreateWorker().proxy;
      const results = [];
      let limitHit = false;
      await Promise.all(query.folderQueries.map(async (fq) => {
        const queryId = this.queryId++;
        queryDisposables.add(token?.onCancellationRequested((e) => this.cancelQuery(queryId)) || Disposable.None);
        const handle = await this.fileSystemProvider.getHandle(fq.folder);
        if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
          console.error("Could not get directory handle for ", fq);
          return;
        }
        const reviveMatch = (result2) => ({
          resource: URI.revive(result2.resource),
          results: revive(result2.results)
        });
        queryDisposables.add(this.onDidReceiveTextSearchMatch((e) => {
          if (e.queryId === queryId) {
            onProgress?.(reviveMatch(e.match));
          }
        }));
        const ignorePathCasing = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
        const folderResults = await proxy.$searchDirectory(handle, query, fq, ignorePathCasing, queryId);
        for (const folderResult of folderResults.results) {
          results.push(revive(folderResult));
        }
        if (folderResults.limitHit) {
          limitHit = true;
        }
      }));
      queryDisposables.dispose();
      const result = { messages: [], results, limitHit };
      return result;
    } catch (e) {
      console.error("Error performing web worker text search", e);
      return {
        results: [],
        messages: [{
          text: localize("errorSearchText", "Unable to search with Web Worker text searcher"),
          type: TextSearchCompleteMessageType.Warning
        }]
      };
    }
  }
  async fileSearch(query, token) {
    try {
      const queryDisposables = new DisposableStore();
      let limitHit = false;
      const proxy = this._getOrCreateWorker().proxy;
      const results = [];
      await Promise.all(query.folderQueries.map(async (fq) => {
        const queryId = this.queryId++;
        queryDisposables.add(token?.onCancellationRequested((e) => this.cancelQuery(queryId)) || Disposable.None);
        const handle = await this.fileSystemProvider.getHandle(fq.folder);
        if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
          console.error("Could not get directory handle for ", fq);
          return;
        }
        const caseSensitive = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
        const folderResults = await proxy.$listDirectory(handle, query, fq, caseSensitive, queryId);
        for (const folderResult of folderResults.results) {
          results.push({ resource: URI.joinPath(fq.folder, folderResult) });
        }
        if (folderResults.limitHit) {
          limitHit = true;
        }
      }));
      queryDisposables.dispose();
      const result = { messages: [], results, limitHit };
      return result;
    } catch (e) {
      console.error("Error performing web worker file search", e);
      return {
        results: [],
        messages: [{
          text: localize("errorSearchFile", "Unable to search with Web Worker file searcher"),
          type: TextSearchCompleteMessageType.Warning
        }]
      };
    }
  }
  async clearCache(cacheKey) {
    if (this.cache?.key === cacheKey) {
      this.cache = void 0;
    }
  }
  _getOrCreateWorker() {
    if (!this._worker) {
      try {
        this._worker = this._register(this.webWorkerService.createWorkerClient(
          new WebWorkerDescriptor({
            esmModuleLocation: FileAccess.asBrowserUri("vs/workbench/services/search/worker/localFileSearchMain.js"),
            label: "LocalFileSearchWorker"
          })
        ));
        LocalFileSearchWorkerHost.setChannel(this._worker, {
          $sendTextSearchMatch: (match, queryId) => {
            return this.sendTextSearchMatch(match, queryId);
          }
        });
      } catch (err) {
        logOnceWebWorkerWarning(err);
        throw err;
      }
    }
    return this._worker;
  }
};
__decorateClass([
  memoize
], LocalFileSearchWorkerClient.prototype, "fileSystemProvider", 1);
LocalFileSearchWorkerClient = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IWebWorkerService)
], LocalFileSearchWorkerClient);
registerSingleton(ISearchService, RemoteSearchService, InstantiationType.Delayed);
export {
  LocalFileSearchWorkerClient,
  RemoteSearchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvYnJvd3Nlci9zZWFyY2hTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZU1hdGNoLCBJRmlsZVF1ZXJ5LCBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hQcm9ncmVzc0l0ZW0sIElTZWFyY2hSZXN1bHRQcm92aWRlciwgSVNlYXJjaFNlcnZpY2UsIElUZXh0UXVlcnksIFNlYXJjaFByb3ZpZGVyVHlwZSwgVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFNlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXZWJXb3JrZXJDbGllbnQsIGxvZ09uY2VXZWJXb3JrZXJXYXJuaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vd29ya2VyL3dlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgV2ViV29ya2VyRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlckRlc2NyaXB0b3IuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJXb3JrZXIvYnJvd3Nlci93ZWJXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvY2FsRmlsZVNlYXJjaFdvcmtlciwgTG9jYWxGaWxlU2VhcmNoV29ya2VySG9zdCB9IGZyb20gJy4uL2NvbW1vbi9sb2NhbEZpbGVTZWFyY2hXb3JrZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBIVE1MRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvYnJvd3Nlci9odG1sRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFdlYkZpbGVTeXN0ZW1BY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9icm93c2VyL3dlYkZpbGVTeXN0ZW1BY2Nlc3MuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuXG5leHBvcnQgY2xhc3MgUmVtb3RlU2VhcmNoU2VydmljZSBleHRlbmRzIFNlYXJjaFNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG1vZGVsU2VydmljZSwgZWRpdG9yU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgbG9nU2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0Y29uc3Qgc2VhcmNoUHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsRmlsZVNlYXJjaFdvcmtlckNsaWVudCk7XG5cdFx0dGhpcy5yZWdpc3RlclNlYXJjaFJlc3VsdFByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgU2VhcmNoUHJvdmlkZXJUeXBlLmZpbGUsIHNlYXJjaFByb3ZpZGVyKTtcblx0XHR0aGlzLnJlZ2lzdGVyU2VhcmNoUmVzdWx0UHJvdmlkZXIoU2NoZW1hcy5maWxlLCBTZWFyY2hQcm92aWRlclR5cGUudGV4dCwgc2VhcmNoUHJvdmlkZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbEZpbGVTZWFyY2hXb3JrZXJDbGllbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlYXJjaFJlc3VsdFByb3ZpZGVyIHtcblxuXHRwcm90ZWN0ZWQgX3dvcmtlcjogSVdlYldvcmtlckNsaWVudDxJTG9jYWxGaWxlU2VhcmNoV29ya2VyPiB8IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlVGV4dFNlYXJjaE1hdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBtYXRjaDogSUZpbGVNYXRjaDxVcmlDb21wb25lbnRzPjsgcXVlcnlJZDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlY2VpdmVUZXh0U2VhcmNoTWF0Y2g6IEV2ZW50PHsgbWF0Y2g6IElGaWxlTWF0Y2g8VXJpQ29tcG9uZW50cz47IHF1ZXJ5SWQ6IG51bWJlciB9PiA9IHRoaXMuX29uRGlkUmVjZWl2ZVRleHRTZWFyY2hNYXRjaC5ldmVudDtcblxuXHRwcml2YXRlIGNhY2hlOiB7IGtleTogc3RyaW5nOyBjYWNoZTogSVNlYXJjaENvbXBsZXRlIH0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBxdWVyeUlkOiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV2ViV29ya2VyU2VydmljZSBwcml2YXRlIHdlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3dvcmtlciA9IG51bGw7XG5cdH1cblxuXHRhc3luYyBnZXRBSU5hbWUoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2VuZFRleHRTZWFyY2hNYXRjaChtYXRjaDogSUZpbGVNYXRjaDxVcmlDb21wb25lbnRzPiwgcXVlcnlJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRSZWNlaXZlVGV4dFNlYXJjaE1hdGNoLmZpcmUoeyBtYXRjaCwgcXVlcnlJZCB9KTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgZ2V0IGZpbGVTeXN0ZW1Qcm92aWRlcigpOiBIVE1MRmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZS5nZXRQcm92aWRlcihTY2hlbWFzLmZpbGUpIGFzIEhUTUxGaWxlU3lzdGVtUHJvdmlkZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNhbmNlbFF1ZXJ5KHF1ZXJ5SWQ6IG51bWJlcikge1xuXHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fZ2V0T3JDcmVhdGVXb3JrZXIoKS5wcm94eTtcblx0XHRwcm94eS4kY2FuY2VsUXVlcnkocXVlcnlJZCk7XG5cdH1cblxuXHRhc3luYyB0ZXh0U2VhcmNoKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCBvblByb2dyZXNzPzogKHA6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBxdWVyeURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBwcm94eSA9IHRoaXMuX2dldE9yQ3JlYXRlV29ya2VyKCkucHJveHk7XG5cdFx0XHRjb25zdCByZXN1bHRzOiBJRmlsZU1hdGNoW10gPSBbXTtcblxuXHRcdFx0bGV0IGxpbWl0SGl0ID0gZmFsc2U7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHF1ZXJ5LmZvbGRlclF1ZXJpZXMubWFwKGFzeW5jIGZxID0+IHtcblx0XHRcdFx0Y29uc3QgcXVlcnlJZCA9IHRoaXMucXVlcnlJZCsrO1xuXHRcdFx0XHRxdWVyeURpc3Bvc2FibGVzLmFkZCh0b2tlbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoZSA9PiB0aGlzLmNhbmNlbFF1ZXJ5KHF1ZXJ5SWQpKSB8fCBEaXNwb3NhYmxlLk5vbmUpO1xuXG5cdFx0XHRcdGNvbnN0IGhhbmRsZTogRmlsZVN5c3RlbUhhbmRsZSB8IHVuZGVmaW5lZCA9IGF3YWl0IHRoaXMuZmlsZVN5c3RlbVByb3ZpZGVyLmdldEhhbmRsZShmcS5mb2xkZXIpO1xuXHRcdFx0XHRpZiAoIWhhbmRsZSB8fCAhV2ViRmlsZVN5c3RlbUFjY2Vzcy5pc0ZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUoaGFuZGxlKSkge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBnZXQgZGlyZWN0b3J5IGhhbmRsZSBmb3IgJywgZnEpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGZvcmNlIHJlc291cmNlIHRvIHJldml2ZSB1c2luZyBVUkkucmV2aXZlLlxuXHRcdFx0XHQvLyBUT0RPIEBhbmRyZWEgc2VlIHdoeSB3ZSBjYW4ndCBqdXN0IHVzZSBgcmV2aXZlKClgIGJlbG93LiBGb3Igc29tZSByZWFzb24sICg8TWFyc2hhbGxlZE9iamVjdD5vYmopLiRtaWQgd2FzIHVuZGVmaW5lZCBmb3IgcmVzdWx0LnJlc291cmNlXG5cdFx0XHRcdGNvbnN0IHJldml2ZU1hdGNoID0gKHJlc3VsdDogSUZpbGVNYXRjaDxVcmlDb21wb25lbnRzPik6IElGaWxlTWF0Y2ggPT4gKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZShyZXN1bHQucmVzb3VyY2UpLFxuXHRcdFx0XHRcdHJlc3VsdHM6IHJldml2ZShyZXN1bHQucmVzdWx0cylcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cXVlcnlEaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZFJlY2VpdmVUZXh0U2VhcmNoTWF0Y2goZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUucXVlcnlJZCA9PT0gcXVlcnlJZCkge1xuXHRcdFx0XHRcdFx0b25Qcm9ncmVzcz8uKHJldml2ZU1hdGNoKGUubWF0Y2gpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zdCBpZ25vcmVQYXRoQ2FzaW5nID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcoZnEuZm9sZGVyKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVyUmVzdWx0cyA9IGF3YWl0IHByb3h5LiRzZWFyY2hEaXJlY3RvcnkoaGFuZGxlLCBxdWVyeSwgZnEsIGlnbm9yZVBhdGhDYXNpbmcsIHF1ZXJ5SWQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlclJlc3VsdCBvZiBmb2xkZXJSZXN1bHRzLnJlc3VsdHMpIHtcblx0XHRcdFx0XHRyZXN1bHRzLnB1c2gocmV2aXZlKGZvbGRlclJlc3VsdCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGZvbGRlclJlc3VsdHMubGltaXRIaXQpIHtcblx0XHRcdFx0XHRsaW1pdEhpdCA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSkpO1xuXG5cdFx0XHRxdWVyeURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHsgbWVzc2FnZXM6IFtdLCByZXN1bHRzLCBsaW1pdEhpdCB9O1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBwZXJmb3JtaW5nIHdlYiB3b3JrZXIgdGV4dCBzZWFyY2gnLCBlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3VsdHM6IFtdLFxuXHRcdFx0XHRtZXNzYWdlczogW3tcblx0XHRcdFx0XHR0ZXh0OiBsb2NhbGl6ZSgnZXJyb3JTZWFyY2hUZXh0JywgXCJVbmFibGUgdG8gc2VhcmNoIHdpdGggV2ViIFdvcmtlciB0ZXh0IHNlYXJjaGVyXCIpLCB0eXBlOiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZS5XYXJuaW5nXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmaWxlU2VhcmNoKHF1ZXJ5OiBJRmlsZVF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcXVlcnlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGxldCBsaW1pdEhpdCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBwcm94eSA9IHRoaXMuX2dldE9yQ3JlYXRlV29ya2VyKCkucHJveHk7XG5cdFx0XHRjb25zdCByZXN1bHRzOiBJRmlsZU1hdGNoW10gPSBbXTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHF1ZXJ5LmZvbGRlclF1ZXJpZXMubWFwKGFzeW5jIGZxID0+IHtcblx0XHRcdFx0Y29uc3QgcXVlcnlJZCA9IHRoaXMucXVlcnlJZCsrO1xuXHRcdFx0XHRxdWVyeURpc3Bvc2FibGVzLmFkZCh0b2tlbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoZSA9PiB0aGlzLmNhbmNlbFF1ZXJ5KHF1ZXJ5SWQpKSB8fCBEaXNwb3NhYmxlLk5vbmUpO1xuXG5cdFx0XHRcdGNvbnN0IGhhbmRsZTogRmlsZVN5c3RlbUhhbmRsZSB8IHVuZGVmaW5lZCA9IGF3YWl0IHRoaXMuZmlsZVN5c3RlbVByb3ZpZGVyLmdldEhhbmRsZShmcS5mb2xkZXIpO1xuXHRcdFx0XHRpZiAoIWhhbmRsZSB8fCAhV2ViRmlsZVN5c3RlbUFjY2Vzcy5pc0ZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUoaGFuZGxlKSkge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0NvdWxkIG5vdCBnZXQgZGlyZWN0b3J5IGhhbmRsZSBmb3IgJywgZnEpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjYXNlU2Vuc2l0aXZlID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcoZnEuZm9sZGVyKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVyUmVzdWx0cyA9IGF3YWl0IHByb3h5LiRsaXN0RGlyZWN0b3J5KGhhbmRsZSwgcXVlcnksIGZxLCBjYXNlU2Vuc2l0aXZlLCBxdWVyeUlkKTtcblx0XHRcdFx0Zm9yIChjb25zdCBmb2xkZXJSZXN1bHQgb2YgZm9sZGVyUmVzdWx0cy5yZXN1bHRzKSB7XG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHsgcmVzb3VyY2U6IFVSSS5qb2luUGF0aChmcS5mb2xkZXIsIGZvbGRlclJlc3VsdCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZvbGRlclJlc3VsdHMubGltaXRIaXQpIHsgbGltaXRIaXQgPSB0cnVlOyB9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1ZXJ5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB7IG1lc3NhZ2VzOiBbXSwgcmVzdWx0cywgbGltaXRIaXQgfTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgcGVyZm9ybWluZyB3ZWIgd29ya2VyIGZpbGUgc2VhcmNoJywgZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXN1bHRzOiBbXSxcblx0XHRcdFx0bWVzc2FnZXM6IFt7XG5cdFx0XHRcdFx0dGV4dDogbG9jYWxpemUoJ2Vycm9yU2VhcmNoRmlsZScsIFwiVW5hYmxlIHRvIHNlYXJjaCB3aXRoIFdlYiBXb3JrZXIgZmlsZSBzZWFyY2hlclwiKSwgdHlwZTogVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUuV2FybmluZ1xuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xlYXJDYWNoZShjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY2FjaGU/LmtleSA9PT0gY2FjaGVLZXkpIHsgdGhpcy5jYWNoZSA9IHVuZGVmaW5lZDsgfVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVXb3JrZXIoKTogSVdlYldvcmtlckNsaWVudDxJTG9jYWxGaWxlU2VhcmNoV29ya2VyPiB7XG5cdFx0aWYgKCF0aGlzLl93b3JrZXIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMud2ViV29ya2VyU2VydmljZS5jcmVhdGVXb3JrZXJDbGllbnQ8SUxvY2FsRmlsZVNlYXJjaFdvcmtlcj4oXG5cdFx0XHRcdFx0bmV3IFdlYldvcmtlckRlc2NyaXB0b3Ioe1xuXHRcdFx0XHRcdFx0ZXNtTW9kdWxlTG9jYXRpb246IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKCd2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3dvcmtlci9sb2NhbEZpbGVTZWFyY2hNYWluLmpzJyksXG5cdFx0XHRcdFx0XHRsYWJlbDogJ0xvY2FsRmlsZVNlYXJjaFdvcmtlcidcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHQpKTtcblx0XHRcdFx0TG9jYWxGaWxlU2VhcmNoV29ya2VySG9zdC5zZXRDaGFubmVsKHRoaXMuX3dvcmtlciwge1xuXHRcdFx0XHRcdCRzZW5kVGV4dFNlYXJjaE1hdGNoOiAobWF0Y2gsIHF1ZXJ5SWQpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLnNlbmRUZXh0U2VhcmNoTWF0Y2gobWF0Y2gsIHF1ZXJ5SWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0bG9nT25jZVdlYldvcmtlcldhcm5pbmcoZXJyKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd29ya2VyO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElTZWFyY2hTZXJ2aWNlLCBSZW1vdGVTZWFyY2hTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBOEYsZ0JBQTRCLG9CQUFvQixxQ0FBcUM7QUFDbkwsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBMkIsK0JBQStCO0FBQzFELFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQWlDLGlDQUFpQztBQUNsRSxTQUFTLGVBQWU7QUFFeEIsU0FBUyxZQUFZLGVBQWU7QUFDcEMsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsY0FBYztBQUVoQixJQUFNLHNCQUFOLGNBQWtDLGNBQWM7QUFBQSxFQUN0RCxZQUNnQixjQUNDLGVBQ0csa0JBQ04sWUFDTSxrQkFDTCxhQUMwQixzQkFDbkIsb0JBQ3BCO0FBQ0QsVUFBTSxjQUFjLGVBQWUsa0JBQWtCLFlBQVksa0JBQWtCLGFBQWEsa0JBQWtCO0FBSDFFO0FBSXhDLFVBQU0saUJBQWlCLEtBQUsscUJBQXFCLGVBQWUsMkJBQTJCO0FBQzNGLFNBQUssNkJBQTZCLFFBQVEsTUFBTSxtQkFBbUIsTUFBTSxjQUFjO0FBQ3ZGLFNBQUssNkJBQTZCLFFBQVEsTUFBTSxtQkFBbUIsTUFBTSxjQUFj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
