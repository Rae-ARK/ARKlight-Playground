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
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { Schemas } from "../../../../base/common/network.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
let TextResourcePropertiesService = class {
  constructor(configurationService, remoteAgentService, environmentService, storageService) {
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.remoteEnvironment = null;
    remoteAgentService.getEnvironment().then((remoteEnv) => this.remoteEnvironment = remoteEnv);
  }
  getEOL(resource, language) {
    const eol = this.configurationService.getValue("files.eol", { overrideIdentifier: language, resource });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    const os = this.getOS(resource);
    return os === OperatingSystem.Linux || os === OperatingSystem.Macintosh ? "\n" : "\r\n";
  }
  getOS(resource) {
    let os = OS;
    const remoteAuthority = this.environmentService.remoteAuthority;
    if (remoteAuthority) {
      if (resource && resource.scheme !== Schemas.file) {
        const osCacheKey = `resource.authority.os.${remoteAuthority}`;
        os = this.remoteEnvironment ? this.remoteEnvironment.os : (
          /* Get it from cache */
          this.storageService.getNumber(osCacheKey, StorageScope.WORKSPACE, OS)
        );
        this.storageService.store(osCacheKey, os, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    }
    return os;
  }
};
TextResourcePropertiesService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IStorageService)
], TextResourcePropertiesService);
registerSingleton(ITextResourcePropertiesService, TextResourcePropertiesService, InstantiationType.Delayed);
export {
  TextResourcePropertiesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0cmVzb3VyY2VQcm9wZXJ0aWVzL2NvbW1vbi90ZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50RW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIGltcGxlbWVudHMgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlbW90ZUVudmlyb25tZW50OiBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRyZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKHJlbW90ZUVudiA9PiB0aGlzLnJlbW90ZUVudmlyb25tZW50ID0gcmVtb3RlRW52KTtcblx0fVxuXG5cdGdldEVPTChyZXNvdXJjZT86IFVSSSwgbGFuZ3VhZ2U/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGVvbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2ZpbGVzLmVvbCcsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSwgcmVzb3VyY2UgfSk7XG5cdFx0aWYgKGVvbCAmJiB0eXBlb2YgZW9sID09PSAnc3RyaW5nJyAmJiBlb2wgIT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuIGVvbDtcblx0XHR9XG5cdFx0Y29uc3Qgb3MgPSB0aGlzLmdldE9TKHJlc291cmNlKTtcblx0XHRyZXR1cm4gb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCB8fCBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCA/ICdcXG4nIDogJ1xcclxcbic7XG5cdH1cblxuXHRwcml2YXRlIGdldE9TKHJlc291cmNlPzogVVJJKTogT3BlcmF0aW5nU3lzdGVtIHtcblx0XHRsZXQgb3MgPSBPUztcblxuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRpZiAocmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRpZiAocmVzb3VyY2UgJiYgcmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0Y29uc3Qgb3NDYWNoZUtleSA9IGByZXNvdXJjZS5hdXRob3JpdHkub3MuJHtyZW1vdGVBdXRob3JpdHl9YDtcblx0XHRcdFx0b3MgPSB0aGlzLnJlbW90ZUVudmlyb25tZW50ID8gdGhpcy5yZW1vdGVFbnZpcm9ubWVudC5vcyA6IC8qIEdldCBpdCBmcm9tIGNhY2hlICovIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKG9zQ2FjaGVLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIE9TKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShvc0NhY2hlS2V5LCBvcywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3M7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCBUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsaUJBQWlCLFVBQVU7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUFTLDJCQUEyQjtBQUU3QixJQUFNLGdDQUFOLE1BQThFO0FBQUEsRUFNcEYsWUFDeUMsc0JBQ25CLG9CQUMwQixvQkFDYixnQkFDakM7QUFKdUM7QUFFTztBQUNiO0FBTm5DLFNBQVEsb0JBQW9EO0FBUTNELHVCQUFtQixlQUFlLEVBQUUsS0FBSyxlQUFhLEtBQUssb0JBQW9CLFNBQVM7QUFBQSxFQUN6RjtBQUFBLEVBRUEsT0FBTyxVQUFnQixVQUEyQjtBQUNqRCxVQUFNLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxhQUFhLEVBQUUsb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3RHLFFBQUksT0FBTyxPQUFPLFFBQVEsWUFBWSxRQUFRLFFBQVE7QUFDckQsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLEtBQUssS0FBSyxNQUFNLFFBQVE7QUFDOUIsV0FBTyxPQUFPLGdCQUFnQixTQUFTLE9BQU8sZ0JBQWdCLFlBQVksT0FBTztBQUFBLEVBQ2xGO0FBQUEsRUFFUSxNQUFNLFVBQWlDO0FBQzlDLFFBQUksS0FBSztBQUVULFVBQU0sa0JBQWtCLEtBQUssbUJBQW1CO0FBQ2hELFFBQUksaUJBQWlCO0FBQ3BCLFVBQUksWUFBWSxTQUFTLFdBQVcsUUFBUSxNQUFNO0FBQ2pELGNBQU0sYUFBYSx5QkFBeUIsZUFBZTtBQUMzRCxhQUFLLEtBQUssb0JBQW9CLEtBQUssa0JBQWtCO0FBQUE7QUFBQSxVQUE2QixLQUFLLGVBQWUsVUFBVSxZQUFZLGFBQWEsV0FBVyxFQUFFO0FBQUE7QUFDdEosYUFBSyxlQUFlLE1BQU0sWUFBWSxJQUFJLGFBQWEsV0FBVyxjQUFjLE9BQU87QUFBQSxNQUN4RjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBdENhLGdDQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7QUF3Q2Isa0JBQWtCLGdDQUFnQywrQkFBK0Isa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbXQp9Cg==
