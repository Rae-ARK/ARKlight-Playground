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
import { EditorModel } from "./editorModel.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { Mimes } from "../../../base/common/mime.js";
let BinaryEditorModel = class extends EditorModel {
  constructor(resource, name, fileService) {
    super();
    this.resource = resource;
    this.name = name;
    this.fileService = fileService;
    this.mime = Mimes.binary;
  }
  /**
   * The name of the binary resource.
   */
  getName() {
    return this.name;
  }
  /**
   * The size of the binary resource if known.
   */
  getSize() {
    return this.size;
  }
  /**
   * The mime of the binary resource if known.
   */
  getMime() {
    return this.mime;
  }
  /**
   * The etag of the binary resource if known.
   */
  getETag() {
    return this.etag;
  }
  async resolve() {
    if (this.fileService.hasProvider(this.resource)) {
      const stat = await this.fileService.stat(this.resource);
      this.etag = stat.etag;
      if (typeof stat.size === "number") {
        this.size = stat.size;
      }
    }
    return super.resolve();
  }
};
BinaryEditorModel = __decorateClass([
  __decorateParam(2, IFileService)
], BinaryEditorModel);
export {
  BinaryEditorModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2JpbmFyeUVkaXRvck1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRWRpdG9yTW9kZWwgfSBmcm9tICcuL2VkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcblxuLyoqXG4gKiBBbiBlZGl0b3IgbW9kZWwgdGhhdCBqdXN0IHJlcHJlc2VudHMgYSByZXNvdXJjZSB0aGF0IGNhbiBiZSBsb2FkZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBCaW5hcnlFZGl0b3JNb2RlbCBleHRlbmRzIEVkaXRvck1vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1pbWUgPSBNaW1lcy5iaW5hcnk7XG5cblx0cHJpdmF0ZSBzaXplOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZXRhZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbmFtZSBvZiB0aGUgYmluYXJ5IHJlc291cmNlLlxuXHQgKi9cblx0Z2V0TmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm5hbWU7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNpemUgb2YgdGhlIGJpbmFyeSByZXNvdXJjZSBpZiBrbm93bi5cblx0ICovXG5cdGdldFNpemUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zaXplO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtaW1lIG9mIHRoZSBiaW5hcnkgcmVzb3VyY2UgaWYga25vd24uXG5cdCAqL1xuXHRnZXRNaW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubWltZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgZXRhZyBvZiB0aGUgYmluYXJ5IHJlc291cmNlIGlmIGtub3duLlxuXHQgKi9cblx0Z2V0RVRhZygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmV0YWc7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIHJlc29sdmUgdXAgdG8gZGF0ZSBzdGF0IGZvciBmaWxlIHJlc291cmNlc1xuXHRcdGlmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHRoaXMucmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5ldGFnID0gc3RhdC5ldGFnO1xuXHRcdFx0aWYgKHR5cGVvZiBzdGF0LnNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHRoaXMuc2l6ZSA9IHN0YXQuc2l6ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIucmVzb2x2ZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYTtBQUtmLElBQU0sb0JBQU4sY0FBZ0MsWUFBWTtBQUFBLEVBT2xELFlBQ1UsVUFDUSxNQUNjLGFBQzlCO0FBQ0QsVUFBTTtBQUpHO0FBQ1E7QUFDYztBQVJoQyxTQUFpQixPQUFPLE1BQU07QUFBQSxFQVc5QjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsVUFBa0I7QUFDakIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsVUFBOEI7QUFDN0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsVUFBa0I7QUFDakIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsVUFBOEI7QUFDN0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsTUFBZSxVQUF5QjtBQUd2QyxRQUFJLEtBQUssWUFBWSxZQUFZLEtBQUssUUFBUSxHQUFHO0FBQ2hELFlBQU0sT0FBTyxNQUFNLEtBQUssWUFBWSxLQUFLLEtBQUssUUFBUTtBQUN0RCxXQUFLLE9BQU8sS0FBSztBQUNqQixVQUFJLE9BQU8sS0FBSyxTQUFTLFVBQVU7QUFDbEMsYUFBSyxPQUFPLEtBQUs7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxXQUFPLE1BQU0sUUFBUTtBQUFBLEVBQ3RCO0FBQ0Q7QUF4RGEsb0JBQU47QUFBQSxFQVVKO0FBQUEsR0FWVTsiLAogICJuYW1lcyI6IFtdCn0K
