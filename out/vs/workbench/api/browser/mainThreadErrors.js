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
import { onUnexpectedError, transformErrorFromSerialization } from "../../../base/common/errors.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
let MainThreadErrors = class {
  dispose() {
  }
  $onUnexpectedError(err) {
    if (err?.$isError) {
      err = transformErrorFromSerialization(err);
    }
    onUnexpectedError(err);
  }
};
MainThreadErrors = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadErrors)
], MainThreadErrors);
export {
  MainThreadErrors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRXJyb3JzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VyaWFsaXplZEVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciwgdHJhbnNmb3JtRXJyb3JGcm9tU2VyaWFsaXphdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRFcnJvcnNTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRFcnJvcnMpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZEVycm9ycyBpbXBsZW1lbnRzIE1haW5UaHJlYWRFcnJvcnNTaGFwZSB7XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvL1xuXHR9XG5cblx0JG9uVW5leHBlY3RlZEVycm9yKGVycjogdW5rbm93biB8IFNlcmlhbGl6ZWRFcnJvcik6IHZvaWQge1xuXHRcdGlmICgoZXJyIGFzIFNlcmlhbGl6ZWRFcnJvciB8IHVuZGVmaW5lZCk/LiRpc0Vycm9yKSB7XG5cdFx0XHRlcnIgPSB0cmFuc2Zvcm1FcnJvckZyb21TZXJpYWxpemF0aW9uKGVyciBhcyBTZXJpYWxpemVkRXJyb3IpO1xuXHRcdH1cblx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBMEIsbUJBQW1CLHVDQUF1QztBQUNwRixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1CQUEwQztBQUc1QyxJQUFNLG1CQUFOLE1BQXdEO0FBQUEsRUFFOUQsVUFBZ0I7QUFBQSxFQUVoQjtBQUFBLEVBRUEsbUJBQW1CLEtBQXNDO0FBQ3hELFFBQUssS0FBcUMsVUFBVTtBQUNuRCxZQUFNLGdDQUFnQyxHQUFzQjtBQUFBLElBQzdEO0FBQ0Esc0JBQWtCLEdBQUc7QUFBQSxFQUN0QjtBQUNEO0FBWmEsbUJBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLGdCQUFnQjtBQUFBLEdBQ3JDOyIsCiAgIm5hbWVzIjogW10KfQo=
