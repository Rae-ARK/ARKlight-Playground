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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Schemas } from "../../../base/common/network.js";
import { IFileService } from "../../files/common/files.js";
import { asTextOrError, IRequestService } from "../../request/common/request.js";
let DownloadService = class {
  constructor(requestService, fileService) {
    this.requestService = requestService;
    this.fileService = fileService;
  }
  async download(resource, target, callSite, cancellationToken = CancellationToken.None) {
    if (resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeRemote) {
      await this.fileService.copy(resource, target);
      return;
    }
    const options = { type: "GET", url: resource.toString(true), callSite };
    const context = await this.requestService.request(options, cancellationToken);
    if (context.res.statusCode === 200) {
      await this.fileService.writeFile(target, context.stream);
    } else {
      const message = await asTextOrError(context);
      throw new Error(`Expected 200, got back ${context.res.statusCode} instead.

${message}`);
    }
  }
};
DownloadService = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, IFileService)
], DownloadService);
export {
  DownloadService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Rvd25sb2FkL2NvbW1vbi9kb3dubG9hZFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSURvd25sb2FkU2VydmljZSB9IGZyb20gJy4vZG93bmxvYWQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGFzVGV4dE9yRXJyb3IsIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuXG5leHBvcnQgY2xhc3MgRG93bmxvYWRTZXJ2aWNlIGltcGxlbWVudHMgSURvd25sb2FkU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBkb3dubG9hZChyZXNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgY2FsbFNpdGU6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fCByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHQvLyBJbnRlbnRpb25hbGx5IG9ubHkgc3VwcG9ydCB0aGlzIGZvciBmaWxlfHJlbW90ZTwtPmZpbGV8cmVtb3RlIHNjZW5hcmlvc1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jb3B5KHJlc291cmNlLCB0YXJnZXQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvcHRpb25zID0geyB0eXBlOiAnR0VUJyBhcyBjb25zdCwgdXJsOiByZXNvdXJjZS50b1N0cmluZyh0cnVlKSwgY2FsbFNpdGUgfTtcblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KG9wdGlvbnMsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMjAwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXQsIGNvbnRleHQuc3RyZWFtKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIDIwMCwgZ290IGJhY2sgJHtjb250ZXh0LnJlcy5zdGF0dXNDb2RlfSBpbnN0ZWFkLlxcblxcbiR7bWVzc2FnZX1gKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBR3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZSx1QkFBdUI7QUFFeEMsSUFBTSxrQkFBTixNQUFrRDtBQUFBLEVBSXhELFlBQ21DLGdCQUNILGFBQzlCO0FBRmlDO0FBQ0g7QUFBQSxFQUM1QjtBQUFBLEVBRUosTUFBTSxTQUFTLFVBQWUsUUFBYSxVQUFrQixvQkFBdUMsa0JBQWtCLE1BQXFCO0FBQzFJLFFBQUksU0FBUyxXQUFXLFFBQVEsUUFBUSxTQUFTLFdBQVcsUUFBUSxjQUFjO0FBRWpGLFlBQU0sS0FBSyxZQUFZLEtBQUssVUFBVSxNQUFNO0FBQzVDO0FBQUEsSUFDRDtBQUNBLFVBQU0sVUFBVSxFQUFFLE1BQU0sT0FBZ0IsS0FBSyxTQUFTLFNBQVMsSUFBSSxHQUFHLFNBQVM7QUFDL0UsVUFBTSxVQUFVLE1BQU0sS0FBSyxlQUFlLFFBQVEsU0FBUyxpQkFBaUI7QUFDNUUsUUFBSSxRQUFRLElBQUksZUFBZSxLQUFLO0FBQ25DLFlBQU0sS0FBSyxZQUFZLFVBQVUsUUFBUSxRQUFRLE1BQU07QUFBQSxJQUN4RCxPQUFPO0FBQ04sWUFBTSxVQUFVLE1BQU0sY0FBYyxPQUFPO0FBQzNDLFlBQU0sSUFBSSxNQUFNLDBCQUEwQixRQUFRLElBQUksVUFBVTtBQUFBO0FBQUEsRUFBZ0IsT0FBTyxFQUFFO0FBQUEsSUFDMUY7QUFBQSxFQUNEO0FBQ0Q7QUF4QmEsa0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
