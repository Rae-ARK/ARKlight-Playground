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
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
let NativeWorkspacesService = class {
  constructor(mainProcessService, nativeHostService) {
    return ProxyChannel.toService(mainProcessService.getChannel("workspaces"), { context: nativeHostService.windowId });
  }
};
NativeWorkspacesService = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, INativeHostService)
], NativeWorkspacesService);
registerSingleton(IWorkspacesService, NativeWorkspacesService, InstantiationType.Delayed);
export {
  NativeWorkspacesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3Jrc3BhY2VzL2VsZWN0cm9uLWJyb3dzZXIvd29ya3NwYWNlc1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElNYWluUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvY29tbW9uL21haW5Qcm9jZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuXG4vLyBAdHMtZXhwZWN0LWVycm9yOiBpbnRlcmZhY2UgaXMgaW1wbGVtZW50ZWQgdmlhIHByb3h5XG5leHBvcnQgY2xhc3MgTmF0aXZlV29ya3NwYWNlc1NlcnZpY2UgaW1wbGVtZW50cyBJV29ya3NwYWNlc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWFpblByb2Nlc3NTZXJ2aWNlIG1haW5Qcm9jZXNzU2VydmljZTogSU1haW5Qcm9jZXNzU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2Vcblx0KSB7XG5cdFx0cmV0dXJuIFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SVdvcmtzcGFjZXNTZXJ2aWNlPihtYWluUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbCgnd29ya3NwYWNlcycpLCB7IGNvbnRleHQ6IG5hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd0lkIH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElXb3Jrc3BhY2VzU2VydmljZSwgTmF0aXZlV29ya3NwYWNlc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFHNUIsSUFBTSwwQkFBTixNQUE0RDtBQUFBLEVBSWxFLFlBQ3NCLG9CQUNELG1CQUNuQjtBQUNELFdBQU8sYUFBYSxVQUE4QixtQkFBbUIsV0FBVyxZQUFZLEdBQUcsRUFBRSxTQUFTLGtCQUFrQixTQUFTLENBQUM7QUFBQSxFQUN2STtBQUNEO0FBVmEsMEJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7QUFZYixrQkFBa0Isb0JBQW9CLHlCQUF5QixrQkFBa0IsT0FBTzsiLAogICJuYW1lcyI6IFtdCn0K
