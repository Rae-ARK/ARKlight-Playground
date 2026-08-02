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
import { MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ILanguagePackService } from "../../../platform/languagePacks/common/languagePacks.js";
let MainThreadLocalization = class extends Disposable {
  constructor(extHostContext, fileService, languagePackService) {
    super();
    this.fileService = fileService;
    this.languagePackService = languagePackService;
  }
  async $fetchBuiltInBundleUri(id, language) {
    try {
      const uri = await this.languagePackService.getBuiltInExtensionTranslationsUri(id, language);
      return uri;
    } catch (e) {
      return void 0;
    }
  }
  async $fetchBundleContents(uriComponents) {
    const contents = await this.fileService.readFile(URI.revive(uriComponents));
    return contents.value.toString();
  }
};
MainThreadLocalization = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadLocalization),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILanguagePackService)
], MainThreadLocalization);
export {
  MainThreadLocalization
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTG9jYWxpemF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRMb2NhbGl6YXRpb25TaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VQYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xhbmd1YWdlUGFja3MvY29tbW9uL2xhbmd1YWdlUGFja3MuanMnO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZExvY2FsaXphdGlvbilcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkTG9jYWxpemF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRMb2NhbGl6YXRpb25TaGFwZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxhbmd1YWdlUGFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVBhY2tTZXJ2aWNlOiBJTGFuZ3VhZ2VQYWNrU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgJGZldGNoQnVpbHRJbkJ1bmRsZVVyaShpZDogc3RyaW5nLCBsYW5ndWFnZTogc3RyaW5nKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgdGhpcy5sYW5ndWFnZVBhY2tTZXJ2aWNlLmdldEJ1aWx0SW5FeHRlbnNpb25UcmFuc2xhdGlvbnNVcmkoaWQsIGxhbmd1YWdlKTtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkZmV0Y2hCdW5kbGVDb250ZW50cyh1cmlDb21wb25lbnRzOiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLnJldml2ZSh1cmlDb21wb25lbnRzKSk7XG5cdFx0cmV0dXJuIGNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBZ0Q7QUFDekQsU0FBUyw0QkFBNkM7QUFDdEQsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDRCQUE0QjtBQUc5QixJQUFNLHlCQUFOLGNBQXFDLFdBQWtEO0FBQUEsRUFFN0YsWUFDQyxnQkFDK0IsYUFDUSxxQkFDdEM7QUFDRCxVQUFNO0FBSHlCO0FBQ1E7QUFBQSxFQUd4QztBQUFBLEVBRUEsTUFBTSx1QkFBdUIsSUFBWSxVQUE0QztBQUNwRixRQUFJO0FBQ0gsWUFBTSxNQUFNLE1BQU0sS0FBSyxvQkFBb0IsbUNBQW1DLElBQUksUUFBUTtBQUMxRixhQUFPO0FBQUEsSUFDUixTQUFTLEdBQUc7QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0scUJBQXFCLGVBQStDO0FBQ3pFLFVBQU0sV0FBVyxNQUFNLEtBQUssWUFBWSxTQUFTLElBQUksT0FBTyxhQUFhLENBQUM7QUFDMUUsV0FBTyxTQUFTLE1BQU0sU0FBUztBQUFBLEVBQ2hDO0FBQ0Q7QUF2QmEseUJBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLHNCQUFzQjtBQUFBLEVBS3JEO0FBQUEsRUFDQTtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
