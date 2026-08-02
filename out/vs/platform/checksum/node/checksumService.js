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
import { createHash } from "crypto";
import { listenStream } from "../../../base/common/stream.js";
import { IFileService } from "../../files/common/files.js";
let ChecksumService = class {
  constructor(fileService) {
    this.fileService = fileService;
  }
  async checksum(resource) {
    const stream = (await this.fileService.readFileStream(resource)).value;
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      listenStream(stream, {
        onData: (data) => hash.update(data.buffer),
        onError: (error) => reject(error),
        onEnd: () => resolve(hash.digest("base64").replace(/=+$/, ""))
      });
    });
  }
};
ChecksumService = __decorateClass([
  __decorateParam(0, IFileService)
], ChecksumService);
export {
  ChecksumService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NoZWNrc3VtL25vZGUvY2hlY2tzdW1TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlSGFzaCB9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgeyBsaXN0ZW5TdHJlYW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDaGVja3N1bVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hlY2tzdW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGVja3N1bVNlcnZpY2UgaW1wbGVtZW50cyBJQ2hlY2tzdW1TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSkgeyB9XG5cblx0YXN5bmMgY2hlY2tzdW0ocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc3RyZWFtID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGVTdHJlYW0ocmVzb3VyY2UpKS52YWx1ZTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBoYXNoID0gY3JlYXRlSGFzaCgnc2hhMjU2Jyk7XG5cblx0XHRcdGxpc3RlblN0cmVhbShzdHJlYW0sIHtcblx0XHRcdFx0b25EYXRhOiBkYXRhID0+IGhhc2gudXBkYXRlKGRhdGEuYnVmZmVyKSxcblx0XHRcdFx0b25FcnJvcjogZXJyb3IgPT4gcmVqZWN0KGVycm9yKSxcblx0XHRcdFx0b25FbmQ6ICgpID0+IHJlc29sdmUoaGFzaC5kaWdlc3QoJ2Jhc2U2NCcpLnJlcGxhY2UoLz0rJC8sICcnKSlcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0JBQW9CO0FBRzdCLFNBQVMsb0JBQW9CO0FBRXRCLElBQU0sa0JBQU4sTUFBa0Q7QUFBQSxFQUl4RCxZQUEyQyxhQUEyQjtBQUEzQjtBQUFBLEVBQTZCO0FBQUEsRUFFeEUsTUFBTSxTQUFTLFVBQWdDO0FBQzlDLFVBQU0sVUFBVSxNQUFNLEtBQUssWUFBWSxlQUFlLFFBQVEsR0FBRztBQUNqRSxXQUFPLElBQUksUUFBZ0IsQ0FBQyxTQUFTLFdBQVc7QUFDL0MsWUFBTSxPQUFPLFdBQVcsUUFBUTtBQUVoQyxtQkFBYSxRQUFRO0FBQUEsUUFDcEIsUUFBUSxVQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxRQUN2QyxTQUFTLFdBQVMsT0FBTyxLQUFLO0FBQUEsUUFDOUIsT0FBTyxNQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVEsRUFBRSxRQUFRLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDOUQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWxCYSxrQkFBTjtBQUFBLEVBSU87QUFBQSxHQUpEOyIsCiAgIm5hbWVzIjogW10KfQo=
