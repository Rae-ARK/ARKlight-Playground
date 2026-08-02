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
import { ErrorNoTelemetry } from "../../../../base/common/errors.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ITerminalLogService } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ITerminalInstanceService } from "../browser/terminal.js";
import { BaseTerminalProfileResolverService } from "../browser/terminalProfileResolverService.js";
import { ITerminalProfileService } from "../common/terminal.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
let ElectronTerminalProfileResolverService = class extends BaseTerminalProfileResolverService {
  constructor(configurationResolverService, configurationService, historyService, logService, workspaceContextService, terminalProfileService, remoteAgentService, terminalInstanceService) {
    super(
      {
        getDefaultSystemShell: async (remoteAuthority, platform) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!backend) {
            throw new ErrorNoTelemetry(`Cannot get default system shell when there is no backend for remote authority '${remoteAuthority}'`);
          }
          return backend.getDefaultSystemShell(platform);
        },
        getEnvironment: async (remoteAuthority) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!backend) {
            throw new ErrorNoTelemetry(`Cannot get environment when there is no backend for remote authority '${remoteAuthority}'`);
          }
          return backend.getEnvironment();
        }
      },
      configurationService,
      configurationResolverService,
      historyService,
      logService,
      terminalProfileService,
      workspaceContextService,
      remoteAgentService
    );
  }
};
ElectronTerminalProfileResolverService = __decorateClass([
  __decorateParam(0, IConfigurationResolverService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IHistoryService),
  __decorateParam(3, ITerminalLogService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, ITerminalProfileService),
  __decorateParam(6, IRemoteAgentService),
  __decorateParam(7, ITerminalInstanceService)
], ElectronTerminalProfileResolverService);
export {
  ElectronTerminalProfileResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2VsZWN0cm9uLWJyb3dzZXIvdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBCYXNlVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vYnJvd3Nlci90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFbGVjdHJvblRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBleHRlbmRzIEJhc2VUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBoaXN0b3J5U2VydmljZTogSUhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSB0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEluc3RhbmNlU2VydmljZSB0ZXJtaW5hbEluc3RhbmNlU2VydmljZTogSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRnZXREZWZhdWx0U3lzdGVtU2hlbGw6IGFzeW5jIChyZW1vdGVBdXRob3JpdHksIHBsYXRmb3JtKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmdldEJhY2tlbmQocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRpZiAoIWJhY2tlbmQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGBDYW5ub3QgZ2V0IGRlZmF1bHQgc3lzdGVtIHNoZWxsIHdoZW4gdGhlcmUgaXMgbm8gYmFja2VuZCBmb3IgcmVtb3RlIGF1dGhvcml0eSAnJHtyZW1vdGVBdXRob3JpdHl9J2ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYmFja2VuZC5nZXREZWZhdWx0U3lzdGVtU2hlbGwocGxhdGZvcm0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRFbnZpcm9ubWVudDogYXN5bmMgKHJlbW90ZUF1dGhvcml0eSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0ZXJtaW5hbEluc3RhbmNlU2VydmljZS5nZXRCYWNrZW5kKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRcdFx0aWYgKCFiYWNrZW5kKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3JOb1RlbGVtZXRyeShgQ2Fubm90IGdldCBlbnZpcm9ubWVudCB3aGVuIHRoZXJlIGlzIG5vIGJhY2tlbmQgZm9yIHJlbW90ZSBhdXRob3JpdHkgJyR7cmVtb3RlQXV0aG9yaXR5fSdgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGJhY2tlbmQuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRcdGhpc3RvcnlTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdHJlbW90ZUFnZW50U2VydmljZVxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFFN0IsSUFBTSx5Q0FBTixjQUFxRCxtQ0FBbUM7QUFBQSxFQUU5RixZQUNnQyw4QkFDUixzQkFDTixnQkFDSSxZQUNLLHlCQUNELHdCQUNKLG9CQUNLLHlCQUN6QjtBQUNEO0FBQUEsTUFDQztBQUFBLFFBQ0MsdUJBQXVCLE9BQU8saUJBQWlCLGFBQWE7QUFDM0QsZ0JBQU0sVUFBVSxNQUFNLHdCQUF3QixXQUFXLGVBQWU7QUFDeEUsY0FBSSxDQUFDLFNBQVM7QUFDYixrQkFBTSxJQUFJLGlCQUFpQixrRkFBa0YsZUFBZSxHQUFHO0FBQUEsVUFDaEk7QUFDQSxpQkFBTyxRQUFRLHNCQUFzQixRQUFRO0FBQUEsUUFDOUM7QUFBQSxRQUNBLGdCQUFnQixPQUFPLG9CQUFvQjtBQUMxQyxnQkFBTSxVQUFVLE1BQU0sd0JBQXdCLFdBQVcsZUFBZTtBQUN4RSxjQUFJLENBQUMsU0FBUztBQUNiLGtCQUFNLElBQUksaUJBQWlCLHlFQUF5RSxlQUFlLEdBQUc7QUFBQSxVQUN2SDtBQUNBLGlCQUFPLFFBQVEsZUFBZTtBQUFBLFFBQy9CO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBdENhLHlDQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZVOyIsCiAgIm5hbWVzIjogW10KfQo=
