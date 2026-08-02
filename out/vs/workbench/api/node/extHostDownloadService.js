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
import { join } from "../../../base/common/path.js";
import { tmpdir } from "os";
import { generateUuid } from "../../../base/common/uuid.js";
import { IExtHostCommands } from "../common/extHostCommands.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { MainContext } from "../common/extHost.protocol.js";
import { URI } from "../../../base/common/uri.js";
import { IExtHostRpcService } from "../common/extHostRpcService.js";
let ExtHostDownloadService = class extends Disposable {
  constructor(extHostRpc, commands) {
    super();
    const proxy = extHostRpc.getProxy(MainContext.MainThreadDownloadService);
    commands.registerCommand(false, "_workbench.downloadResource", async (resource) => {
      const location = URI.file(join(tmpdir(), generateUuid()));
      await proxy.$download(resource, location);
      return location;
    });
  }
};
ExtHostDownloadService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostCommands)
], ExtHostDownloadService);
export {
  ExtHostDownloadService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRIb3N0RG93bmxvYWRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1haW5Db250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RG93bmxvYWRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0Q29tbWFuZHMgY29tbWFuZHM6IElFeHRIb3N0Q29tbWFuZHNcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHByb3h5ID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkRG93bmxvYWRTZXJ2aWNlKTtcblxuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChmYWxzZSwgJ193b3JrYmVuY2guZG93bmxvYWRSZXNvdXJjZScsIGFzeW5jIChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxhbnk+ID0+IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gVVJJLmZpbGUoam9pbih0bXBkaXIoKSwgZ2VuZXJhdGVVdWlkKCkpKTtcblx0XHRcdGF3YWl0IHByb3h5LiRkb3dubG9hZChyZXNvdXJjZSwgbG9jYXRpb24pO1xuXHRcdFx0cmV0dXJuIGxvY2F0aW9uO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWTtBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBRTVCLElBQU0seUJBQU4sY0FBcUMsV0FBVztBQUFBLEVBRXRELFlBQ3FCLFlBQ0YsVUFDakI7QUFDRCxVQUFNO0FBRU4sVUFBTSxRQUFRLFdBQVcsU0FBUyxZQUFZLHlCQUF5QjtBQUV2RSxhQUFTLGdCQUFnQixPQUFPLCtCQUErQixPQUFPLGFBQWdDO0FBQ3JHLFlBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxPQUFPLEdBQUcsYUFBYSxDQUFDLENBQUM7QUFDeEQsWUFBTSxNQUFNLFVBQVUsVUFBVSxRQUFRO0FBQ3hDLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFoQmEseUJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
