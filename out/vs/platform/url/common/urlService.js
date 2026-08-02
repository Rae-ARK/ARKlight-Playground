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
import { first } from "../../../base/common/async.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { IProductService } from "../../product/common/productService.js";
class AbstractURLService extends Disposable {
  constructor() {
    super(...arguments);
    this.handlers = /* @__PURE__ */ new Set();
  }
  open(uri, options) {
    const handlers = [...this.handlers.values()];
    return first(handlers.map((h) => () => h.handleURL(uri, options)), void 0, false).then((val) => val || false);
  }
  registerHandler(handler) {
    this.handlers.add(handler);
    return toDisposable(() => this.handlers.delete(handler));
  }
}
let NativeURLService = class extends AbstractURLService {
  constructor(productService) {
    super();
    this.productService = productService;
  }
  create(options) {
    let { authority, path, query, fragment } = options ? options : { authority: void 0, path: void 0, query: void 0, fragment: void 0 };
    if (authority && path && path.indexOf("/") !== 0) {
      path = `/${path}`;
    }
    return URI.from({ scheme: this.productService.urlProtocol, authority, path, query, fragment });
  }
};
NativeURLService = __decorateClass([
  __decorateParam(0, IProductService)
], NativeURLService);
export {
  AbstractURLService,
  NativeURLService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VybC9jb21tb24vdXJsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZpcnN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5VUkxPcHRpb25zLCBJVVJMSGFuZGxlciwgSVVSTFNlcnZpY2UgfSBmcm9tICcuL3VybC5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFVSTFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVVSTFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaGFuZGxlcnMgPSBuZXcgU2V0PElVUkxIYW5kbGVyPigpO1xuXG5cdGFic3RyYWN0IGNyZWF0ZShvcHRpb25zPzogUGFydGlhbDxVcmlDb21wb25lbnRzPik6IFVSSTtcblxuXHRvcGVuKHVyaTogVVJJLCBvcHRpb25zPzogSU9wZW5VUkxPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgaGFuZGxlcnMgPSBbLi4udGhpcy5oYW5kbGVycy52YWx1ZXMoKV07XG5cdFx0cmV0dXJuIGZpcnN0KGhhbmRsZXJzLm1hcChoID0+ICgpID0+IGguaGFuZGxlVVJMKHVyaSwgb3B0aW9ucykpLCB1bmRlZmluZWQsIGZhbHNlKS50aGVuKHZhbCA9PiB2YWwgfHwgZmFsc2UpO1xuXHR9XG5cblx0cmVnaXN0ZXJIYW5kbGVyKGhhbmRsZXI6IElVUkxIYW5kbGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuaGFuZGxlcnMuYWRkKGhhbmRsZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5oYW5kbGVycy5kZWxldGUoaGFuZGxlcikpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVVUkxTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RVUkxTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRjcmVhdGUob3B0aW9ucz86IFBhcnRpYWw8VXJpQ29tcG9uZW50cz4pOiBVUkkge1xuXHRcdGxldCB7IGF1dGhvcml0eSwgcGF0aCwgcXVlcnksIGZyYWdtZW50IH0gPSBvcHRpb25zID8gb3B0aW9ucyA6IHsgYXV0aG9yaXR5OiB1bmRlZmluZWQsIHBhdGg6IHVuZGVmaW5lZCwgcXVlcnk6IHVuZGVmaW5lZCwgZnJhZ21lbnQ6IHVuZGVmaW5lZCB9O1xuXG5cdFx0aWYgKGF1dGhvcml0eSAmJiBwYXRoICYmIHBhdGguaW5kZXhPZignLycpICE9PSAwKSB7XG5cdFx0XHRwYXRoID0gYC8ke3BhdGh9YDsgLy8gVVJJIHZhbGlkYXRpb24gcmVxdWlyZXMgYSBwYXRoIGlmIHRoZXJlIGlzIGFuIGF1dGhvcml0eVxuXHRcdH1cblxuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5wcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCwgYXV0aG9yaXR5LCBwYXRoLCBxdWVyeSwgZnJhZ21lbnQgfSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQVMsV0FBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFHekIsTUFBZSwyQkFBMkIsV0FBa0M7QUFBQSxFQUE1RTtBQUFBO0FBSU4sU0FBUSxXQUFXLG9CQUFJLElBQWlCO0FBQUE7QUFBQSxFQUl4QyxLQUFLLEtBQVUsU0FBNkM7QUFDM0QsVUFBTSxXQUFXLENBQUMsR0FBRyxLQUFLLFNBQVMsT0FBTyxDQUFDO0FBQzNDLFdBQU8sTUFBTSxTQUFTLElBQUksT0FBSyxNQUFNLEVBQUUsVUFBVSxLQUFLLE9BQU8sQ0FBQyxHQUFHLFFBQVcsS0FBSyxFQUFFLEtBQUssU0FBTyxPQUFPLEtBQUs7QUFBQSxFQUM1RztBQUFBLEVBRUEsZ0JBQWdCLFNBQW1DO0FBQ2xELFNBQUssU0FBUyxJQUFJLE9BQU87QUFDekIsV0FBTyxhQUFhLE1BQU0sS0FBSyxTQUFTLE9BQU8sT0FBTyxDQUFDO0FBQUEsRUFDeEQ7QUFDRDtBQUVPLElBQU0sbUJBQU4sY0FBK0IsbUJBQW1CO0FBQUEsRUFFeEQsWUFDcUMsZ0JBQ25DO0FBQ0QsVUFBTTtBQUY4QjtBQUFBLEVBR3JDO0FBQUEsRUFFQSxPQUFPLFNBQXVDO0FBQzdDLFFBQUksRUFBRSxXQUFXLE1BQU0sT0FBTyxTQUFTLElBQUksVUFBVSxVQUFVLEVBQUUsV0FBVyxRQUFXLE1BQU0sUUFBVyxPQUFPLFFBQVcsVUFBVSxPQUFVO0FBRTlJLFFBQUksYUFBYSxRQUFRLEtBQUssUUFBUSxHQUFHLE1BQU0sR0FBRztBQUNqRCxhQUFPLElBQUksSUFBSTtBQUFBLElBQ2hCO0FBRUEsV0FBTyxJQUFJLEtBQUssRUFBRSxRQUFRLEtBQUssZUFBZSxhQUFhLFdBQVcsTUFBTSxPQUFPLFNBQVMsQ0FBQztBQUFBLEVBQzlGO0FBQ0Q7QUFqQmEsbUJBQU47QUFBQSxFQUdKO0FBQUEsR0FIVTsiLAogICJuYW1lcyI6IFtdCn0K
