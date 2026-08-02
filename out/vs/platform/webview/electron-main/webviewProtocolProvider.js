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
import { protocol } from "electron";
import { COI, FileAccess, Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../files/common/files.js";
let WebviewProtocolProvider = class {
  constructor(_fileService) {
    this._fileService = _fileService;
    const webviewHandler = this.handleWebviewRequest.bind(this);
    protocol.handle(Schemas.vscodeWebview, webviewHandler);
  }
  dispose() {
    protocol.unhandle(Schemas.vscodeWebview);
  }
  async handleWebviewRequest(request) {
    try {
      const uri = URI.parse(request.url);
      const entry = WebviewProtocolProvider.validWebviewFilePaths.get(uri.path);
      if (entry) {
        const relativeResourcePath = `vs/workbench/contrib/webview/browser/pre${uri.path}`;
        const url = FileAccess.asFileUri(relativeResourcePath);
        const content = await this._fileService.readFile(url);
        return new Response(content.value.buffer, {
          headers: {
            "Content-Type": entry.mime,
            ...COI.getHeadersFromQuery(request.url),
            "Cross-Origin-Resource-Policy": "cross-origin"
          }
        });
      } else {
        return new Response(null, { status: 403 });
      }
    } catch {
    }
    return new Response(null, { status: 500 });
  }
};
WebviewProtocolProvider.validWebviewFilePaths = /* @__PURE__ */ new Map([
  ["/index.html", { mime: "text/html" }],
  ["/fake.html", { mime: "text/html" }],
  ["/service-worker.js", { mime: "application/javascript" }]
]);
WebviewProtocolProvider = __decorateClass([
  __decorateParam(0, IFileService)
], WebviewProtocolProvider);
export {
  WebviewProtocolProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dlYnZpZXcvZWxlY3Ryb24tbWFpbi93ZWJ2aWV3UHJvdG9jb2xQcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHByb3RvY29sIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQXBwUmVzb3VyY2VQYXRoLCBDT0ksIEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBXZWJ2aWV3UHJvdG9jb2xQcm92aWRlciBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyB2YWxpZFdlYnZpZXdGaWxlUGF0aHMgPSBuZXcgTWFwPHN0cmluZywgeyByZWFkb25seSBtaW1lOiBzdHJpbmcgfT4oW1xuXHRcdFsnL2luZGV4Lmh0bWwnLCB7IG1pbWU6ICd0ZXh0L2h0bWwnIH1dLFxuXHRcdFsnL2Zha2UuaHRtbCcsIHsgbWltZTogJ3RleHQvaHRtbCcgfV0sXG5cdFx0Wycvc2VydmljZS13b3JrZXIuanMnLCB7IG1pbWU6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0JyB9XSxcblx0XSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdC8vIFJlZ2lzdGVyIHRoZSBwcm90b2NvbCBmb3IgbG9hZGluZyB3ZWJ2aWV3IGh0bWxcblx0XHRjb25zdCB3ZWJ2aWV3SGFuZGxlciA9IHRoaXMuaGFuZGxlV2Vidmlld1JlcXVlc3QuYmluZCh0aGlzKTtcblx0XHRwcm90b2NvbC5oYW5kbGUoU2NoZW1hcy52c2NvZGVXZWJ2aWV3LCB3ZWJ2aWV3SGFuZGxlcik7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHByb3RvY29sLnVuaGFuZGxlKFNjaGVtYXMudnNjb2RlV2Vidmlldyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVdlYnZpZXdSZXF1ZXN0KHJlcXVlc3Q6IEdsb2JhbFJlcXVlc3QpOiBQcm9taXNlPEdsb2JhbFJlc3BvbnNlPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShyZXF1ZXN0LnVybCk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IFdlYnZpZXdQcm90b2NvbFByb3ZpZGVyLnZhbGlkV2Vidmlld0ZpbGVQYXRocy5nZXQodXJpLnBhdGgpO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdGNvbnN0IHJlbGF0aXZlUmVzb3VyY2VQYXRoOiBBcHBSZXNvdXJjZVBhdGggPSBgdnMvd29ya2JlbmNoL2NvbnRyaWIvd2Vidmlldy9icm93c2VyL3ByZSR7dXJpLnBhdGh9YDtcblx0XHRcdFx0Y29uc3QgdXJsID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkocmVsYXRpdmVSZXNvdXJjZVBhdGgpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZSh1cmwpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlc3BvbnNlKGNvbnRlbnQudmFsdWUuYnVmZmVyIGFzIEFycmF5QnVmZmVyVmlldzxBcnJheUJ1ZmZlcj4sIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogZW50cnkubWltZSxcblx0XHRcdFx0XHRcdC4uLkNPSS5nZXRIZWFkZXJzRnJvbVF1ZXJ5KHJlcXVlc3QudXJsKSxcblx0XHRcdFx0XHRcdCdDcm9zcy1PcmlnaW4tUmVzb3VyY2UtUG9saWN5JzogJ2Nyb3NzLW9yaWdpbicsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UobnVsbCwgeyBzdGF0dXM6IDQwMyB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5vb3Bcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSZXNwb25zZShudWxsLCB7IHN0YXR1czogNTAwIH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQTBCLEtBQUssWUFBWSxlQUFlO0FBQzFELFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUd0QixJQUFNLDBCQUFOLE1BQXFEO0FBQUEsRUFRM0QsWUFDZ0MsY0FDOUI7QUFEOEI7QUFHL0IsVUFBTSxpQkFBaUIsS0FBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQzFELGFBQVMsT0FBTyxRQUFRLGVBQWUsY0FBYztBQUFBLEVBQ3REO0FBQUEsRUFFQSxVQUFnQjtBQUNmLGFBQVMsU0FBUyxRQUFRLGFBQWE7QUFBQSxFQUN4QztBQUFBLEVBRUEsTUFBYyxxQkFBcUIsU0FBaUQ7QUFDbkYsUUFBSTtBQUNILFlBQU0sTUFBTSxJQUFJLE1BQU0sUUFBUSxHQUFHO0FBQ2pDLFlBQU0sUUFBUSx3QkFBd0Isc0JBQXNCLElBQUksSUFBSSxJQUFJO0FBQ3hFLFVBQUksT0FBTztBQUNWLGNBQU0sdUJBQXdDLDJDQUEyQyxJQUFJLElBQUk7QUFDakcsY0FBTSxNQUFNLFdBQVcsVUFBVSxvQkFBb0I7QUFFckQsY0FBTSxVQUFVLE1BQU0sS0FBSyxhQUFhLFNBQVMsR0FBRztBQUNwRCxlQUFPLElBQUksU0FBUyxRQUFRLE1BQU0sUUFBd0M7QUFBQSxVQUN6RSxTQUFTO0FBQUEsWUFDUixnQkFBZ0IsTUFBTTtBQUFBLFlBQ3RCLEdBQUcsSUFBSSxvQkFBb0IsUUFBUSxHQUFHO0FBQUEsWUFDdEMsZ0NBQWdDO0FBQUEsVUFDakM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLE9BQU87QUFDTixlQUFPLElBQUksU0FBUyxNQUFNLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUMxQztBQUFBLElBQ0QsUUFBUTtBQUFBLElBRVI7QUFDQSxXQUFPLElBQUksU0FBUyxNQUFNLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxFQUMxQztBQUNEO0FBNUNhLHdCQUVHLHdCQUF3QixvQkFBSSxJQUF1QztBQUFBLEVBQ2pGLENBQUMsZUFBZSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQUEsRUFDckMsQ0FBQyxjQUFjLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFBQSxFQUNwQyxDQUFDLHNCQUFzQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDMUQsQ0FBQztBQU5XLDBCQUFOO0FBQUEsRUFTSjtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
