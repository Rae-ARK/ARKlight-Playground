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
import { dispose } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { IShareService } from "../../contrib/share/common/share.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadShare = class {
  constructor(extHostContext, shareService) {
    this.shareService = shareService;
    this.providers = /* @__PURE__ */ new Map();
    this.providerDisposables = /* @__PURE__ */ new Map();
    this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostShare);
  }
  $registerShareProvider(handle, selector, id, label, priority) {
    const provider = {
      id,
      label,
      selector,
      priority,
      provideShare: async (item) => {
        const result = await this.proxy.$provideShare(handle, item, CancellationToken.None);
        return typeof result === "string" ? result : URI.revive(result);
      }
    };
    this.providers.set(handle, provider);
    const disposable = this.shareService.registerShareProvider(provider);
    this.providerDisposables.set(handle, disposable);
  }
  $unregisterShareProvider(handle) {
    this.providers.delete(handle);
    this.providerDisposables.delete(handle);
  }
  dispose() {
    this.providers.clear();
    dispose(this.providerDisposables.values());
    this.providerDisposables.clear();
  }
};
MainThreadShare = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadShare),
  __decorateParam(1, IShareService)
], MainThreadShare);
export {
  MainThreadShare
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkU2hhcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RTaGFyZVNoYXBlLCBJRG9jdW1lbnRGaWx0ZXJEdG8sIE1haW5Db250ZXh0LCBNYWluVGhyZWFkU2hhcmVTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElTaGFyZVByb3ZpZGVyLCBJU2hhcmVTZXJ2aWNlLCBJU2hhcmVhYmxlSXRlbSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2hhcmUvY29tbW9uL3NoYXJlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCwgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRTaGFyZSlcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkU2hhcmUgaW1wbGVtZW50cyBNYWluVGhyZWFkU2hhcmVTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogRXh0SG9zdFNoYXJlU2hhcGU7XG5cdHByaXZhdGUgcHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIElTaGFyZVByb3ZpZGVyPigpO1xuXHRwcml2YXRlIHByb3ZpZGVyRGlzcG9zYWJsZXMgPSBuZXcgTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASVNoYXJlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNoYXJlU2VydmljZTogSVNoYXJlU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLnByb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdFNoYXJlKTtcblx0fVxuXG5cdCRyZWdpc3RlclNoYXJlUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgcHJpb3JpdHk6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBJU2hhcmVQcm92aWRlciA9IHtcblx0XHRcdGlkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRzZWxlY3Rvcixcblx0XHRcdHByaW9yaXR5LFxuXHRcdFx0cHJvdmlkZVNoYXJlOiBhc3luYyAoaXRlbTogSVNoYXJlYWJsZUl0ZW0pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcm94eS4kcHJvdmlkZVNoYXJlKGhhbmRsZSwgaXRlbSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdHJldHVybiB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IFVSSS5yZXZpdmUocmVzdWx0KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMucHJvdmlkZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5zaGFyZVNlcnZpY2UucmVnaXN0ZXJTaGFyZVByb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHR0aGlzLnByb3ZpZGVyRGlzcG9zYWJsZXMuc2V0KGhhbmRsZSwgZGlzcG9zYWJsZSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlclNoYXJlUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHR0aGlzLnByb3ZpZGVyRGlzcG9zYWJsZXMuZGVsZXRlKGhhbmRsZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMucHJvdmlkZXJzLmNsZWFyKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLnByb3ZpZGVyRGlzcG9zYWJsZXMudmFsdWVzKCkpO1xuXHRcdHRoaXMucHJvdmlkZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLGVBQWU7QUFDckMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQXVELG1CQUF5QztBQUN6RyxTQUF5QixxQkFBcUM7QUFDOUQsU0FBMEIsNEJBQTRCO0FBRy9DLElBQU0sa0JBQU4sTUFBc0Q7QUFBQSxFQU01RCxZQUNDLGdCQUNnQyxjQUMvQjtBQUQrQjtBQUxqQyxTQUFRLFlBQVksb0JBQUksSUFBNEI7QUFDcEQsU0FBUSxzQkFBc0Isb0JBQUksSUFBeUI7QUFNMUQsU0FBSyxRQUFRLGVBQWUsU0FBUyxlQUFlLFlBQVk7QUFBQSxFQUNqRTtBQUFBLEVBRUEsdUJBQXVCLFFBQWdCLFVBQWdDLElBQVksT0FBZSxVQUF3QjtBQUN6SCxVQUFNLFdBQTJCO0FBQUEsTUFDaEM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGNBQWMsT0FBTyxTQUF5QjtBQUM3QyxjQUFNLFNBQVMsTUFBTSxLQUFLLE1BQU0sY0FBYyxRQUFRLE1BQU0sa0JBQWtCLElBQUk7QUFDbEYsZUFBTyxPQUFPLFdBQVcsV0FBVyxTQUFTLElBQUksT0FBTyxNQUFNO0FBQUEsTUFDL0Q7QUFBQSxJQUNEO0FBQ0EsU0FBSyxVQUFVLElBQUksUUFBUSxRQUFRO0FBQ25DLFVBQU0sYUFBYSxLQUFLLGFBQWEsc0JBQXNCLFFBQVE7QUFDbkUsU0FBSyxvQkFBb0IsSUFBSSxRQUFRLFVBQVU7QUFBQSxFQUNoRDtBQUFBLEVBRUEseUJBQXlCLFFBQXNCO0FBQzlDLFNBQUssVUFBVSxPQUFPLE1BQU07QUFDNUIsU0FBSyxvQkFBb0IsT0FBTyxNQUFNO0FBQUEsRUFDdkM7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxVQUFVLE1BQU07QUFDckIsWUFBUSxLQUFLLG9CQUFvQixPQUFPLENBQUM7QUFDekMsU0FBSyxvQkFBb0IsTUFBTTtBQUFBLEVBQ2hDO0FBQ0Q7QUF2Q2Esa0JBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLGVBQWU7QUFBQSxFQVM5QztBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
