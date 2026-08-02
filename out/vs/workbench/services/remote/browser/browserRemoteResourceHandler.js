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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { getMediaOrTextMime } from "../../../../base/common/mime.js";
import { URI } from "../../../../base/common/uri.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
let BrowserRemoteResourceLoader = class extends Disposable {
  constructor(fileService, provider) {
    super();
    this.provider = provider;
    this._register(provider.onDidReceiveRequest(async (request) => {
      let uri;
      try {
        uri = JSON.parse(decodeURIComponent(request.uri.query));
      } catch {
        return request.respondWith(404, new Uint8Array(), {});
      }
      let content;
      try {
        content = await fileService.readFile(URI.from(uri, true));
      } catch (e) {
        const str = VSBuffer.fromString(e.message).buffer;
        if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
          return request.respondWith(404, str, {});
        } else {
          return request.respondWith(500, str, {});
        }
      }
      const mime = uri.path && getMediaOrTextMime(uri.path);
      request.respondWith(200, content.value.buffer, mime ? { "content-type": mime } : {});
    }));
  }
  getResourceUriProvider() {
    const baseUri = URI.parse(document.location.href);
    return (uri) => baseUri.with({
      path: this.provider.path,
      query: JSON.stringify(uri)
    });
  }
};
BrowserRemoteResourceLoader = __decorateClass([
  __decorateParam(0, IFileService)
], BrowserRemoteResourceLoader);
export {
  BrowserRemoteResourceLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9yZW1vdGUvYnJvd3Nlci9icm93c2VyUmVtb3RlUmVzb3VyY2VIYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZXRNZWRpYU9yVGV4dE1pbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlQ29udGVudCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElSZW1vdGVSZXNvdXJjZVByb3ZpZGVyLCBJUmVzb3VyY2VVcmlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2ViLmFwaS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyUmVtb3RlUmVzb3VyY2VMb2FkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXI6IElSZW1vdGVSZXNvdXJjZVByb3ZpZGVyLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvdmlkZXIub25EaWRSZWNlaXZlUmVxdWVzdChhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdGxldCB1cmk6IFVyaUNvbXBvbmVudHM7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR1cmkgPSBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudChyZXF1ZXN0LnVyaS5xdWVyeSkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0LnJlc3BvbmRXaXRoKDQwNCwgbmV3IFVpbnQ4QXJyYXkoKSwge30pO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY29udGVudDogSUZpbGVDb250ZW50O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5mcm9tKHVyaSwgdHJ1ZSkpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zdCBzdHIgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKGUubWVzc2FnZSkuYnVmZmVyO1xuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvciAmJiBlLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5yZXNwb25kV2l0aCg0MDQsIHN0ciwge30pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LnJlc3BvbmRXaXRoKDUwMCwgc3RyLCB7fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWltZSA9IHVyaS5wYXRoICYmIGdldE1lZGlhT3JUZXh0TWltZSh1cmkucGF0aCk7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbmRXaXRoKDIwMCwgY29udGVudC52YWx1ZS5idWZmZXIsIG1pbWUgPyB7ICdjb250ZW50LXR5cGUnOiBtaW1lIH0gOiB7fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldFJlc291cmNlVXJpUHJvdmlkZXIoKTogSVJlc291cmNlVXJpUHJvdmlkZXIge1xuXHRcdGNvbnN0IGJhc2VVcmkgPSBVUkkucGFyc2UoZG9jdW1lbnQubG9jYXRpb24uaHJlZik7XG5cdFx0cmV0dXJuIHVyaSA9PiBiYXNlVXJpLndpdGgoe1xuXHRcdFx0cGF0aDogdGhpcy5wcm92aWRlci5wYXRoLFxuXHRcdFx0cXVlcnk6IEpTT04uc3RyaW5naWZ5KHVyaSksXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLG9CQUFvQixxQkFBbUMsb0JBQW9CO0FBRzdFLElBQU0sOEJBQU4sY0FBMEMsV0FBVztBQUFBLEVBQzNELFlBQ2UsYUFDRyxVQUNoQjtBQUNELFVBQU07QUFGVztBQUlqQixTQUFLLFVBQVUsU0FBUyxvQkFBb0IsT0FBTSxZQUFXO0FBQzVELFVBQUk7QUFDSixVQUFJO0FBQ0gsY0FBTSxLQUFLLE1BQU0sbUJBQW1CLFFBQVEsSUFBSSxLQUFLLENBQUM7QUFBQSxNQUN2RCxRQUFRO0FBQ1AsZUFBTyxRQUFRLFlBQVksS0FBSyxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNyRDtBQUVBLFVBQUk7QUFDSixVQUFJO0FBQ0gsa0JBQVUsTUFBTSxZQUFZLFNBQVMsSUFBSSxLQUFLLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDekQsU0FBUyxHQUFHO0FBQ1gsY0FBTSxNQUFNLFNBQVMsV0FBVyxFQUFFLE9BQU8sRUFBRTtBQUMzQyxZQUFJLGFBQWEsc0JBQXNCLEVBQUUsd0JBQXdCLG9CQUFvQixnQkFBZ0I7QUFDcEcsaUJBQU8sUUFBUSxZQUFZLEtBQUssS0FBSyxDQUFDLENBQUM7QUFBQSxRQUN4QyxPQUFPO0FBQ04saUJBQU8sUUFBUSxZQUFZLEtBQUssS0FBSyxDQUFDLENBQUM7QUFBQSxRQUN4QztBQUFBLE1BQ0Q7QUFFQSxZQUFNLE9BQU8sSUFBSSxRQUFRLG1CQUFtQixJQUFJLElBQUk7QUFDcEQsY0FBUSxZQUFZLEtBQUssUUFBUSxNQUFNLFFBQVEsT0FBTyxFQUFFLGdCQUFnQixLQUFLLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFDcEYsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRU8seUJBQStDO0FBQ3JELFVBQU0sVUFBVSxJQUFJLE1BQU0sU0FBUyxTQUFTLElBQUk7QUFDaEQsV0FBTyxTQUFPLFFBQVEsS0FBSztBQUFBLE1BQzFCLE1BQU0sS0FBSyxTQUFTO0FBQUEsTUFDcEIsT0FBTyxLQUFLLFVBQVUsR0FBRztBQUFBLElBQzFCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUF2Q2EsOEJBQU47QUFBQSxFQUVKO0FBQUEsR0FGVTsiLAogICJuYW1lcyI6IFtdCn0K
