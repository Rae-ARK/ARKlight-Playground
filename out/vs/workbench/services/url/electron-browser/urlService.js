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
import { IURLService } from "../../../../platform/url/common/url.js";
import { URI } from "../../../../base/common/uri.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { URLHandlerChannel } from "../../../../platform/url/common/urlIpc.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { matchesScheme } from "../../../../base/common/network.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { FocusMode, INativeHostService } from "../../../../platform/native/common/native.js";
import { NativeURLService } from "../../../../platform/url/common/urlService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let RelayURLService = class extends NativeURLService {
  constructor(mainProcessService, openerService, nativeHostService, productService, logService) {
    super(productService);
    this.nativeHostService = nativeHostService;
    this.logService = logService;
    this.urlService = ProxyChannel.toService(mainProcessService.getChannel("url"));
    mainProcessService.registerChannel("urlHandler", new URLHandlerChannel(this));
    openerService.registerOpener(this);
  }
  create(options) {
    const uri = super.create(options);
    let query = uri.query;
    if (!query) {
      query = `windowId=${encodeURIComponent(this.nativeHostService.windowId)}`;
    } else {
      query += `&windowId=${encodeURIComponent(this.nativeHostService.windowId)}`;
    }
    return uri.with({ query });
  }
  async open(resource, options) {
    if (!matchesScheme(resource, this.productService.urlProtocol)) {
      return false;
    }
    if (typeof resource === "string") {
      resource = URI.parse(resource);
    }
    return await this.urlService.open(resource, options);
  }
  async handleURL(uri, options) {
    const result = await super.open(uri, options);
    if (result) {
      this.logService.trace("URLService#handleURL(): handled", uri.toString(true));
      await this.nativeHostService.focusWindow({ mode: FocusMode.Force, targetWindowId: this.nativeHostService.windowId });
    } else {
      this.logService.trace("URLService#handleURL(): not handled", uri.toString(true));
    }
    return result;
  }
};
RelayURLService = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, INativeHostService),
  __decorateParam(3, IProductService),
  __decorateParam(4, ILogService)
], RelayURLService);
registerSingleton(IURLService, RelayURLService, InstantiationType.Eager);
export {
  RelayURLService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91cmwvZWxlY3Ryb24tYnJvd3Nlci91cmxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVVSTFNlcnZpY2UsIElVUkxIYW5kbGVyLCBJT3BlblVSTE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU1haW5Qcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9jb21tb24vbWFpblByb2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSTEhhbmRsZXJDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmxJcGMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UsIElPcGVuZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgRm9jdXNNb2RlLCBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVVUkxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZWxheU9wZW5VUkxPcHRpb25zIGV4dGVuZHMgSU9wZW5VUkxPcHRpb25zIHtcblx0b3BlblRvU2lkZT86IGJvb2xlYW47XG5cdG9wZW5FeHRlcm5hbD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBSZWxheVVSTFNlcnZpY2UgZXh0ZW5kcyBOYXRpdmVVUkxTZXJ2aWNlIGltcGxlbWVudHMgSVVSTEhhbmRsZXIsIElPcGVuZXIge1xuXG5cdHByaXZhdGUgdXJsU2VydmljZTogSVVSTFNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYWluUHJvY2Vzc1NlcnZpY2UgbWFpblByb2Nlc3NTZXJ2aWNlOiBJTWFpblByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0dGhpcy51cmxTZXJ2aWNlID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJVVJMU2VydmljZT4obWFpblByb2Nlc3NTZXJ2aWNlLmdldENoYW5uZWwoJ3VybCcpKTtcblxuXHRcdG1haW5Qcm9jZXNzU2VydmljZS5yZWdpc3RlckNoYW5uZWwoJ3VybEhhbmRsZXInLCBuZXcgVVJMSGFuZGxlckNoYW5uZWwodGhpcykpO1xuXHRcdG9wZW5lclNlcnZpY2UucmVnaXN0ZXJPcGVuZXIodGhpcyk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGUob3B0aW9ucz86IFBhcnRpYWw8VXJpQ29tcG9uZW50cz4pOiBVUkkge1xuXHRcdGNvbnN0IHVyaSA9IHN1cGVyLmNyZWF0ZShvcHRpb25zKTtcblxuXHRcdGxldCBxdWVyeSA9IHVyaS5xdWVyeTtcblx0XHRpZiAoIXF1ZXJ5KSB7XG5cdFx0XHRxdWVyeSA9IGB3aW5kb3dJZD0ke2VuY29kZVVSSUNvbXBvbmVudCh0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd0lkKX1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRxdWVyeSArPSBgJndpbmRvd0lkPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uud2luZG93SWQpfWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVyaS53aXRoKHsgcXVlcnkgfSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBvcGVuKHJlc291cmNlOiBVUkkgfCBzdHJpbmcsIG9wdGlvbnM/OiBJUmVsYXlPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0aWYgKCFtYXRjaGVzU2NoZW1lKHJlc291cmNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgcmVzb3VyY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiBhd2FpdCB0aGlzLnVybFNlcnZpY2Uub3BlbihyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVVUkwodXJpOiBVUkksIG9wdGlvbnM/OiBJT3BlblVSTE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci5vcGVuKHVyaSwgb3B0aW9ucyk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1VSTFNlcnZpY2UjaGFuZGxlVVJMKCk6IGhhbmRsZWQnLCB1cmkudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLmZvY3VzV2luZG93KHsgbW9kZTogRm9jdXNNb2RlLkZvcmNlIC8qIEFwcGxpY2F0aW9uIG1heSBub3QgYmUgYWN0aXZlICovLCB0YXJnZXRXaW5kb3dJZDogdGhpcy5uYXRpdmVIb3N0U2VydmljZS53aW5kb3dJZCB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdVUkxTZXJ2aWNlI2hhbmRsZVVSTCgpOiBub3QgaGFuZGxlZCcsIHVyaS50b1N0cmluZyh0cnVlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVVJMU2VydmljZSwgUmVsYXlVUkxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQWlEO0FBQzFELFNBQVMsV0FBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBK0I7QUFDeEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVywwQkFBMEI7QUFDOUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUI7QUFPckIsSUFBTSxrQkFBTixjQUE4QixpQkFBaUQ7QUFBQSxFQUlyRixZQUNzQixvQkFDTCxlQUNxQixtQkFDcEIsZ0JBQ2EsWUFDN0I7QUFDRCxVQUFNLGNBQWM7QUFKaUI7QUFFUDtBQUk5QixTQUFLLGFBQWEsYUFBYSxVQUF1QixtQkFBbUIsV0FBVyxLQUFLLENBQUM7QUFFMUYsdUJBQW1CLGdCQUFnQixjQUFjLElBQUksa0JBQWtCLElBQUksQ0FBQztBQUM1RSxrQkFBYyxlQUFlLElBQUk7QUFBQSxFQUNsQztBQUFBLEVBRVMsT0FBTyxTQUF1QztBQUN0RCxVQUFNLE1BQU0sTUFBTSxPQUFPLE9BQU87QUFFaEMsUUFBSSxRQUFRLElBQUk7QUFDaEIsUUFBSSxDQUFDLE9BQU87QUFDWCxjQUFRLFlBQVksbUJBQW1CLEtBQUssa0JBQWtCLFFBQVEsQ0FBQztBQUFBLElBQ3hFLE9BQU87QUFDTixlQUFTLGFBQWEsbUJBQW1CLEtBQUssa0JBQWtCLFFBQVEsQ0FBQztBQUFBLElBQzFFO0FBRUEsV0FBTyxJQUFJLEtBQUssRUFBRSxNQUFNLENBQUM7QUFBQSxFQUMxQjtBQUFBLEVBRUEsTUFBZSxLQUFLLFVBQXdCLFNBQWtEO0FBRTdGLFFBQUksQ0FBQyxjQUFjLFVBQVUsS0FBSyxlQUFlLFdBQVcsR0FBRztBQUM5RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksT0FBTyxhQUFhLFVBQVU7QUFDakMsaUJBQVcsSUFBSSxNQUFNLFFBQVE7QUFBQSxJQUM5QjtBQUNBLFdBQU8sTUFBTSxLQUFLLFdBQVcsS0FBSyxVQUFVLE9BQU87QUFBQSxFQUNwRDtBQUFBLEVBRUEsTUFBTSxVQUFVLEtBQVUsU0FBNkM7QUFDdEUsVUFBTSxTQUFTLE1BQU0sTUFBTSxLQUFLLEtBQUssT0FBTztBQUU1QyxRQUFJLFFBQVE7QUFDWCxXQUFLLFdBQVcsTUFBTSxtQ0FBbUMsSUFBSSxTQUFTLElBQUksQ0FBQztBQUUzRSxZQUFNLEtBQUssa0JBQWtCLFlBQVksRUFBRSxNQUFNLFVBQVUsT0FBMkMsZ0JBQWdCLEtBQUssa0JBQWtCLFNBQVMsQ0FBQztBQUFBLElBQ3hKLE9BQU87QUFDTixXQUFLLFdBQVcsTUFBTSx1Q0FBdUMsSUFBSSxTQUFTLElBQUksQ0FBQztBQUFBLElBQ2hGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXpEYSxrQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTtBQTJEYixrQkFBa0IsYUFBYSxpQkFBaUIsa0JBQWtCLEtBQUs7IiwKICAibmFtZXMiOiBbXQp9Cg==
