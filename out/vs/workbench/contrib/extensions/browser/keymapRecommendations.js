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
import { ExtensionRecommendations } from "./extensionRecommendations.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ExtensionRecommendationReason } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
let KeymapRecommendations = class extends ExtensionRecommendations {
  constructor(productService) {
    super();
    this.productService = productService;
    this._recommendations = [];
  }
  get recommendations() {
    return this._recommendations;
  }
  async doActivate() {
    if (this.productService.keymapExtensionTips) {
      this._recommendations = this.productService.keymapExtensionTips.map((extensionId) => ({
        extension: extensionId.toLowerCase(),
        reason: {
          reasonId: ExtensionRecommendationReason.Application,
          reasonText: ""
        }
      }));
    }
  }
};
KeymapRecommendations = __decorateClass([
  __decorateParam(0, IProductService)
], KeymapRecommendations);
export {
  KeymapRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9rZXltYXBSZWNvbW1lbmRhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMsIEV4dGVuc2lvblJlY29tbWVuZGF0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBLZXltYXBSZWNvbW1lbmRhdGlvbnMgZXh0ZW5kcyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMge1xuXG5cdHByaXZhdGUgX3JlY29tbWVuZGF0aW9uczogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25bXSA9IFtdO1xuXHRnZXQgcmVjb21tZW5kYXRpb25zKCk6IFJlYWRvbmx5QXJyYXk8RXh0ZW5zaW9uUmVjb21tZW5kYXRpb24+IHsgcmV0dXJuIHRoaXMuX3JlY29tbWVuZGF0aW9uczsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvQWN0aXZhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2Uua2V5bWFwRXh0ZW5zaW9uVGlwcykge1xuXHRcdFx0dGhpcy5fcmVjb21tZW5kYXRpb25zID0gdGhpcy5wcm9kdWN0U2VydmljZS5rZXltYXBFeHRlbnNpb25UaXBzLm1hcChleHRlbnNpb25JZCA9PiAoe1xuXHRcdFx0XHRleHRlbnNpb246IGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCksXG5cdFx0XHRcdHJlYXNvbjoge1xuXHRcdFx0XHRcdHJlYXNvbklkOiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbi5BcHBsaWNhdGlvbixcblx0XHRcdFx0XHRyZWFzb25UZXh0OiAnJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdDQUF5RDtBQUNsRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFDQUFxQztBQUV2QyxJQUFNLHdCQUFOLGNBQW9DLHlCQUF5QjtBQUFBLEVBS25FLFlBQ21DLGdCQUNqQztBQUNELFVBQU07QUFGNEI7QUFKbkMsU0FBUSxtQkFBOEMsQ0FBQztBQUFBLEVBT3ZEO0FBQUEsRUFOQSxJQUFJLGtCQUEwRDtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWtCO0FBQUEsRUFROUYsTUFBZ0IsYUFBNEI7QUFDM0MsUUFBSSxLQUFLLGVBQWUscUJBQXFCO0FBQzVDLFdBQUssbUJBQW1CLEtBQUssZUFBZSxvQkFBb0IsSUFBSSxrQkFBZ0I7QUFBQSxRQUNuRixXQUFXLFlBQVksWUFBWTtBQUFBLFFBQ25DLFFBQVE7QUFBQSxVQUNQLFVBQVUsOEJBQThCO0FBQUEsVUFDeEMsWUFBWTtBQUFBLFFBQ2I7QUFBQSxNQUNELEVBQUU7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUVEO0FBdkJhLHdCQUFOO0FBQUEsRUFNSjtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
