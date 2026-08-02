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
import { localize } from "../../../nls.js";
import { ILoggerService } from "../../../platform/log/common/log.js";
import { LogService } from "../../../platform/log/common/logService.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
let ExtHostLogService = class extends LogService {
  constructor(isWorker, loggerService, initData) {
    const id = initData.remote.isRemote ? "remoteexthost" : isWorker ? "workerexthost" : "exthost";
    const name = initData.remote.isRemote ? localize("remote", "Extension Host (Remote)") : isWorker ? localize("worker", "Extension Host (Worker)") : localize("local", "Extension Host");
    super(loggerService.createLogger(id, { name }));
  }
};
ExtHostLogService = __decorateClass([
  __decorateParam(1, ILoggerService),
  __decorateParam(2, IExtHostInitDataService)
], ExtHostLogService);
export {
  ExtHostLogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RMb2dTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RMb2dTZXJ2aWNlIGV4dGVuZHMgTG9nU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aXNXb3JrZXI6IGJvb2xlYW4sXG5cdFx0QElMb2dnZXJTZXJ2aWNlIGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGlkID0gaW5pdERhdGEucmVtb3RlLmlzUmVtb3RlID8gJ3JlbW90ZWV4dGhvc3QnIDogaXNXb3JrZXIgPyAnd29ya2VyZXh0aG9zdCcgOiAnZXh0aG9zdCc7XG5cdFx0Y29uc3QgbmFtZSA9IGluaXREYXRhLnJlbW90ZS5pc1JlbW90ZSA/IGxvY2FsaXplKCdyZW1vdGUnLCBcIkV4dGVuc2lvbiBIb3N0IChSZW1vdGUpXCIpIDogaXNXb3JrZXIgPyBsb2NhbGl6ZSgnd29ya2VyJywgXCJFeHRlbnNpb24gSG9zdCAoV29ya2VyKVwiKSA6IGxvY2FsaXplKCdsb2NhbCcsIFwiRXh0ZW5zaW9uIEhvc3RcIik7XG5cdFx0c3VwZXIobG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoaWQsIHsgbmFtZSB9KSk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtCQUErQjtBQUVqQyxJQUFNLG9CQUFOLGNBQWdDLFdBQVc7QUFBQSxFQUlqRCxZQUNDLFVBQ2dCLGVBQ1MsVUFDeEI7QUFDRCxVQUFNLEtBQUssU0FBUyxPQUFPLFdBQVcsa0JBQWtCLFdBQVcsa0JBQWtCO0FBQ3JGLFVBQU0sT0FBTyxTQUFTLE9BQU8sV0FBVyxTQUFTLFVBQVUseUJBQXlCLElBQUksV0FBVyxTQUFTLFVBQVUseUJBQXlCLElBQUksU0FBUyxTQUFTLGdCQUFnQjtBQUNyTCxVQUFNLGNBQWMsYUFBYSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUMvQztBQUVEO0FBZGEsb0JBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
