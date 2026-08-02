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
import { AbstractExtHostConsoleForwarder } from "../common/extHostConsoleForwarder.js";
import { IExtHostInitDataService } from "../common/extHostInitDataService.js";
import { IExtHostRpcService } from "../common/extHostRpcService.js";
let ExtHostConsoleForwarder = class extends AbstractExtHostConsoleForwarder {
  constructor(extHostRpc, initData) {
    super(extHostRpc, initData);
  }
  _nativeConsoleLogMessage(_method, original, args) {
    original.apply(console, args);
  }
};
ExtHostConsoleForwarder = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService)
], ExtHostConsoleForwarder);
export {
  ExtHostConsoleForwarder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvd29ya2VyL2V4dEhvc3RDb25zb2xlRm9yd2FyZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWJzdHJhY3RFeHRIb3N0Q29uc29sZUZvcndhcmRlciB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0Q29uc29sZUZvcndhcmRlci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q29uc29sZUZvcndhcmRlciBleHRlbmRzIEFic3RyYWN0RXh0SG9zdENvbnNvbGVGb3J3YXJkZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGV4dEhvc3RScGMsIGluaXREYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfbmF0aXZlQ29uc29sZUxvZ01lc3NhZ2UoX21ldGhvZDogdW5rbm93biwgb3JpZ2luYWw6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQsIGFyZ3M6IHVua25vd25bXSkge1xuXHRcdG9yaWdpbmFsLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBRTVCLElBQU0sMEJBQU4sY0FBc0MsZ0NBQWdDO0FBQUEsRUFFNUUsWUFDcUIsWUFDSyxVQUN4QjtBQUNELFVBQU0sWUFBWSxRQUFRO0FBQUEsRUFDM0I7QUFBQSxFQUVtQix5QkFBeUIsU0FBa0IsVUFBd0MsTUFBaUI7QUFDdEgsYUFBUyxNQUFNLFNBQVMsSUFBSTtBQUFBLEVBQzdCO0FBQ0Q7QUFaYSwwQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
