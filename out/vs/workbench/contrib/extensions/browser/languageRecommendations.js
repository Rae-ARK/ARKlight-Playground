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
let LanguageRecommendations = class extends ExtensionRecommendations {
  constructor(productService) {
    super();
    this.productService = productService;
    this._recommendations = [];
  }
  get recommendations() {
    return this._recommendations;
  }
  async doActivate() {
    if (this.productService.languageExtensionTips) {
      this._recommendations = this.productService.languageExtensionTips.map((extensionId) => ({
        extension: extensionId.toLowerCase(),
        reason: {
          reasonId: ExtensionRecommendationReason.Application,
          reasonText: ""
        }
      }));
    }
  }
};
LanguageRecommendations = __decorateClass([
  __decorateParam(0, IProductService)
], LanguageRecommendations);
export {
  LanguageRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9sYW5ndWFnZVJlY29tbWVuZGF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucywgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb24gfSBmcm9tICcuL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlUmVjb21tZW5kYXRpb25zIGV4dGVuZHMgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zIHtcblxuXHRwcml2YXRlIF9yZWNvbW1lbmRhdGlvbnM6IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uW10gPSBbXTtcblx0Z2V0IHJlY29tbWVuZGF0aW9ucygpOiBSZWFkb25seUFycmF5PEV4dGVuc2lvblJlY29tbWVuZGF0aW9uPiB7IHJldHVybiB0aGlzLl9yZWNvbW1lbmRhdGlvbnM7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0FjdGl2YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLmxhbmd1YWdlRXh0ZW5zaW9uVGlwcykge1xuXHRcdFx0dGhpcy5fcmVjb21tZW5kYXRpb25zID0gdGhpcy5wcm9kdWN0U2VydmljZS5sYW5ndWFnZUV4dGVuc2lvblRpcHMubWFwKChleHRlbnNpb25JZCk6IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uID0+ICh7XG5cdFx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSxcblx0XHRcdFx0cmVhc29uOiB7XG5cdFx0XHRcdFx0cmVhc29uSWQ6IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uLkFwcGxpY2F0aW9uLFxuXHRcdFx0XHRcdHJlYXNvblRleHQ6ICcnXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQ0FBeUQ7QUFDbEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQ0FBcUM7QUFFdkMsSUFBTSwwQkFBTixjQUFzQyx5QkFBeUI7QUFBQSxFQUtyRSxZQUNtQyxnQkFDakM7QUFDRCxVQUFNO0FBRjRCO0FBSm5DLFNBQVEsbUJBQThDLENBQUM7QUFBQSxFQU92RDtBQUFBLEVBTkEsSUFBSSxrQkFBMEQ7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFrQjtBQUFBLEVBUTlGLE1BQWdCLGFBQTRCO0FBQzNDLFFBQUksS0FBSyxlQUFlLHVCQUF1QjtBQUM5QyxXQUFLLG1CQUFtQixLQUFLLGVBQWUsc0JBQXNCLElBQUksQ0FBQyxpQkFBMEM7QUFBQSxRQUNoSCxXQUFXLFlBQVksWUFBWTtBQUFBLFFBQ25DLFFBQVE7QUFBQSxVQUNQLFVBQVUsOEJBQThCO0FBQUEsVUFDeEMsWUFBWTtBQUFBLFFBQ2I7QUFBQSxNQUNELEVBQUU7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUNEO0FBdEJhLDBCQUFOO0FBQUEsRUFNSjtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
