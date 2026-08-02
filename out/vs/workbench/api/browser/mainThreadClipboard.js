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
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { ILogService } from "../../../platform/log/common/log.js";
let MainThreadClipboard = class {
  constructor(_context, _clipboardService, _logService) {
    this._clipboardService = _clipboardService;
    this._logService = _logService;
  }
  dispose() {
  }
  $readText() {
    this._logService.trace("MainThreadClipboard#readText");
    const readText = this._clipboardService.readText();
    return readText;
  }
  $writeText(value) {
    this._logService.trace("MainThreadClipboard#writeText with text.length : ", value.length);
    return this._clipboardService.writeText(value);
  }
};
MainThreadClipboard = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadClipboard),
  __decorateParam(1, IClipboardService),
  __decorateParam(2, ILogService)
], MainThreadClipboard);
export {
  MainThreadClipboard
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2xpcGJvYXJkLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDbGlwYm9hcmRTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZENsaXBib2FyZClcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQ2xpcGJvYXJkIGltcGxlbWVudHMgTWFpblRocmVhZENsaXBib2FyZFNoYXBlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfY29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIG5vdGhpbmdcblx0fVxuXG5cdCRyZWFkVGV4dCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ01haW5UaHJlYWRDbGlwYm9hcmQjcmVhZFRleHQnKTtcblx0XHRjb25zdCByZWFkVGV4dCA9IHRoaXMuX2NsaXBib2FyZFNlcnZpY2UucmVhZFRleHQoKTtcblx0XHRyZXR1cm4gcmVhZFRleHQ7XG5cdH1cblxuXHQkd3JpdGVUZXh0KHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdNYWluVGhyZWFkQ2xpcGJvYXJkI3dyaXRlVGV4dCB3aXRoIHRleHQubGVuZ3RoIDogJywgdmFsdWUubGVuZ3RoKTtcblx0XHRyZXR1cm4gdGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodmFsdWUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsbUJBQTZDO0FBQ3RELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CO0FBR3JCLElBQU0sc0JBQU4sTUFBOEQ7QUFBQSxFQUVwRSxZQUNDLFVBQ29DLG1CQUNOLGFBQzdCO0FBRm1DO0FBQ047QUFBQSxFQUMzQjtBQUFBLEVBRUosVUFBZ0I7QUFBQSxFQUVoQjtBQUFBLEVBRUEsWUFBNkI7QUFDNUIsU0FBSyxZQUFZLE1BQU0sOEJBQThCO0FBQ3JELFVBQU0sV0FBVyxLQUFLLGtCQUFrQixTQUFTO0FBQ2pELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxXQUFXLE9BQThCO0FBQ3hDLFNBQUssWUFBWSxNQUFNLHFEQUFxRCxNQUFNLE1BQU07QUFDeEYsV0FBTyxLQUFLLGtCQUFrQixVQUFVLEtBQUs7QUFBQSxFQUM5QztBQUNEO0FBdEJhLHNCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxtQkFBbUI7QUFBQSxFQUtsRDtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
