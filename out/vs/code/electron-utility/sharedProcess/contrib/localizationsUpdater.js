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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILanguagePackService } from "../../../../platform/languagePacks/common/languagePacks.js";
let LocalizationsUpdater = class extends Disposable {
  constructor(localizationsService) {
    super();
    this.localizationsService = localizationsService;
    this.updateLocalizations();
  }
  updateLocalizations() {
    this.localizationsService.update();
  }
};
LocalizationsUpdater = __decorateClass([
  __decorateParam(0, ILanguagePackService)
], LocalizationsUpdater);
export {
  LocalizationsUpdater
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvbG9jYWxpemF0aW9uc1VwZGF0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVBhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFuZ3VhZ2VQYWNrcy9jb21tb24vbGFuZ3VhZ2VQYWNrcy5qcyc7XG5pbXBvcnQgeyBOYXRpdmVMYW5ndWFnZVBhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFuZ3VhZ2VQYWNrcy9ub2RlL2xhbmd1YWdlUGFja3MuanMnO1xuXG5leHBvcnQgY2xhc3MgTG9jYWxpemF0aW9uc1VwZGF0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlUGFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2NhbGl6YXRpb25zU2VydmljZTogTmF0aXZlTGFuZ3VhZ2VQYWNrU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cGRhdGVMb2NhbGl6YXRpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxvY2FsaXphdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2NhbGl6YXRpb25zU2VydmljZS51cGRhdGUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDRCQUE0QjtBQUc5QixJQUFNLHVCQUFOLGNBQW1DLFdBQVc7QUFBQSxFQUVwRCxZQUN3QyxzQkFDdEM7QUFDRCxVQUFNO0FBRmlDO0FBSXZDLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFBQSxFQUVRLHNCQUE0QjtBQUNuQyxTQUFLLHFCQUFxQixPQUFPO0FBQUEsRUFDbEM7QUFDRDtBQWJhLHVCQUFOO0FBQUEsRUFHSjtBQUFBLEdBSFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
