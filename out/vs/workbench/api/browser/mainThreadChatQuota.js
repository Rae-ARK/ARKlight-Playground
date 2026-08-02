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
import { IChatEntitlementService } from "../../services/chat/common/chatEntitlementService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
let MainThreadChatQuota = class extends Disposable {
  constructor(extHostContext, _chatEntitlementService) {
    super();
    this._chatEntitlementService = _chatEntitlementService;
  }
  $updateQuotas(quotas) {
    this._chatEntitlementService.acceptQuotas({ ...this._chatEntitlementService.quotas, ...quotas });
  }
};
MainThreadChatQuota = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatQuota),
  __decorateParam(1, IChatEntitlementService)
], MainThreadChatQuota);
export {
  MainThreadChatQuota
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdFF1b3RhLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0LCBleHRIb3N0TmFtZWRDdXN0b21lciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSVF1b3RhU25hcHNob3RzRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENoYXRRdW90YVNoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZENoYXRRdW90YSlcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQ2hhdFF1b3RhIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRDaGF0UXVvdGFTaGFwZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQkdXBkYXRlUXVvdGFzKHF1b3RhczogSVF1b3RhU25hcHNob3RzRHRvKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5hY2NlcHRRdW90YXMoeyAuLi50aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3RhcywgLi4ucXVvdGFzIH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQTBCLDRCQUE0QjtBQUN0RCxTQUE2QixtQkFBNkM7QUFHbkUsSUFBTSxzQkFBTixjQUFrQyxXQUErQztBQUFBLEVBRXZGLFlBQ0MsZ0JBQzBDLHlCQUN6QztBQUNELFVBQU07QUFGb0M7QUFBQSxFQUczQztBQUFBLEVBRUEsY0FBYyxRQUFrQztBQUMvQyxTQUFLLHdCQUF3QixhQUFhLEVBQUUsR0FBRyxLQUFLLHdCQUF3QixRQUFRLEdBQUcsT0FBTyxDQUFDO0FBQUEsRUFDaEc7QUFDRDtBQVphLHNCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxtQkFBbUI7QUFBQSxFQUtsRDtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
