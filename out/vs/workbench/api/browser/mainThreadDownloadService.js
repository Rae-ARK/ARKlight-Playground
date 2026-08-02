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
import { Disposable } from "../../../base/common/lifecycle.js";
import { MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IDownloadService } from "../../../platform/download/common/download.js";
import { URI } from "../../../base/common/uri.js";
let MainThreadDownloadService = class extends Disposable {
  constructor(extHostContext, downloadService) {
    super();
    this.downloadService = downloadService;
  }
  $download(uri, to) {
    return this.downloadService.download(URI.revive(uri), URI.revive(to), "mainThreadDownloadService.download");
  }
};
MainThreadDownloadService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDownloadService),
  __decorateParam(1, IDownloadService)
], MainThreadDownloadService);
export {
  MainThreadDownloadService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRG93bmxvYWRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYWluQ29udGV4dCwgTWFpblRocmVhZERvd25sb2FkU2VydmljZVNoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSURvd25sb2FkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Rvd25sb2FkL2NvbW1vbi9kb3dubG9hZC5qcyc7XG5pbXBvcnQgeyBVcmlDb21wb25lbnRzLCBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZERvd25sb2FkU2VydmljZSlcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkRG93bmxvYWRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWREb3dubG9hZFNlcnZpY2VTaGFwZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASURvd25sb2FkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRvd25sb2FkU2VydmljZTogSURvd25sb2FkU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0JGRvd25sb2FkKHVyaTogVXJpQ29tcG9uZW50cywgdG86IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5kb3dubG9hZFNlcnZpY2UuZG93bmxvYWQoVVJJLnJldml2ZSh1cmkpLCBVUkkucmV2aXZlKHRvKSwgJ21haW5UaHJlYWREb3dubG9hZFNlcnZpY2UuZG93bmxvYWQnKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1EO0FBQzVELFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQXdCLFdBQVc7QUFHNUIsSUFBTSw0QkFBTixjQUF3QyxXQUFxRDtBQUFBLEVBRW5HLFlBQ0MsZ0JBQ21DLGlCQUNsQztBQUNELFVBQU07QUFGNkI7QUFBQSxFQUdwQztBQUFBLEVBRUEsVUFBVSxLQUFvQixJQUFrQztBQUMvRCxXQUFPLEtBQUssZ0JBQWdCLFNBQVMsSUFBSSxPQUFPLEdBQUcsR0FBRyxJQUFJLE9BQU8sRUFBRSxHQUFHLG9DQUFvQztBQUFBLEVBQzNHO0FBRUQ7QUFiYSw0QkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVkseUJBQXlCO0FBQUEsRUFLeEQ7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
