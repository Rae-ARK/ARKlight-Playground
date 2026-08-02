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
import { PlatformToString, platform } from "../../../../base/common/platform.js";
let RemoteRecommendations = class extends ExtensionRecommendations {
  constructor(productService) {
    super();
    this.productService = productService;
    this._recommendations = [];
  }
  get recommendations() {
    return this._recommendations;
  }
  async doActivate() {
    const extensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
    const currentPlatform = PlatformToString(platform);
    this._recommendations = Object.values(extensionTips).filter(({ supportedPlatforms }) => !supportedPlatforms || supportedPlatforms.includes(currentPlatform)).map((extension) => ({
      extension: extension.extensionId.toLowerCase(),
      reason: {
        reasonId: ExtensionRecommendationReason.Application,
        reasonText: ""
      }
    }));
  }
};
RemoteRecommendations = __decorateClass([
  __decorateParam(0, IProductService)
], RemoteRecommendations);
export {
  RemoteRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9yZW1vdGVSZWNvbW1lbmRhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMsIEdhbGxlcnlFeHRlbnNpb25SZWNvbW1lbmRhdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgUGxhdGZvcm1Ub1N0cmluZywgcGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVSZWNvbW1lbmRhdGlvbnMgZXh0ZW5kcyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMge1xuXG5cdHByaXZhdGUgX3JlY29tbWVuZGF0aW9uczogR2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uW10gPSBbXTtcblx0Z2V0IHJlY29tbWVuZGF0aW9ucygpOiBSZWFkb25seUFycmF5PEdhbGxlcnlFeHRlbnNpb25SZWNvbW1lbmRhdGlvbj4geyByZXR1cm4gdGhpcy5fcmVjb21tZW5kYXRpb25zOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9BY3RpdmF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25UaXBzID0geyAuLi50aGlzLnByb2R1Y3RTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvblRpcHMsIC4uLnRoaXMucHJvZHVjdFNlcnZpY2UudmlydHVhbFdvcmtzcGFjZUV4dGVuc2lvblRpcHMgfTtcblx0XHRjb25zdCBjdXJyZW50UGxhdGZvcm0gPSBQbGF0Zm9ybVRvU3RyaW5nKHBsYXRmb3JtKTtcblx0XHR0aGlzLl9yZWNvbW1lbmRhdGlvbnMgPSBPYmplY3QudmFsdWVzKGV4dGVuc2lvblRpcHMpLmZpbHRlcigoeyBzdXBwb3J0ZWRQbGF0Zm9ybXMgfSkgPT4gIXN1cHBvcnRlZFBsYXRmb3JtcyB8fCBzdXBwb3J0ZWRQbGF0Zm9ybXMuaW5jbHVkZXMoY3VycmVudFBsYXRmb3JtKSkubWFwKGV4dGVuc2lvbiA9PiAoe1xuXHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb24uZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSxcblx0XHRcdHJlYXNvbjoge1xuXHRcdFx0XHRyZWFzb25JZDogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24uQXBwbGljYXRpb24sXG5cdFx0XHRcdHJlYXNvblRleHQ6ICcnXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQ0FBZ0U7QUFDekUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxrQkFBa0IsZ0JBQWdCO0FBRXBDLElBQU0sd0JBQU4sY0FBb0MseUJBQXlCO0FBQUEsRUFLbkUsWUFDbUMsZ0JBQ2pDO0FBQ0QsVUFBTTtBQUY0QjtBQUpuQyxTQUFRLG1CQUFxRCxDQUFDO0FBQUEsRUFPOUQ7QUFBQSxFQU5BLElBQUksa0JBQWlFO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBa0I7QUFBQSxFQVFyRyxNQUFnQixhQUE0QjtBQUMzQyxVQUFNLGdCQUFnQixFQUFFLEdBQUcsS0FBSyxlQUFlLHFCQUFxQixHQUFHLEtBQUssZUFBZSw4QkFBOEI7QUFDekgsVUFBTSxrQkFBa0IsaUJBQWlCLFFBQVE7QUFDakQsU0FBSyxtQkFBbUIsT0FBTyxPQUFPLGFBQWEsRUFBRSxPQUFPLENBQUMsRUFBRSxtQkFBbUIsTUFBTSxDQUFDLHNCQUFzQixtQkFBbUIsU0FBUyxlQUFlLENBQUMsRUFBRSxJQUFJLGdCQUFjO0FBQUEsTUFDOUssV0FBVyxVQUFVLFlBQVksWUFBWTtBQUFBLE1BQzdDLFFBQVE7QUFBQSxRQUNQLFVBQVUsOEJBQThCO0FBQUEsUUFDeEMsWUFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNELEVBQUU7QUFBQSxFQUNIO0FBQ0Q7QUF0QmEsd0JBQU47QUFBQSxFQU1KO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
