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
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { NativeMcpDiscoveryHelperChannelName } from "../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js";
import { NativeFilesystemMcpDiscovery } from "../common/discovery/nativeMcpDiscoveryAbstract.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
let NativeMcpDiscovery = class extends NativeFilesystemMcpDiscovery {
  constructor(mainProcess, logService, labelService, fileService, instantiationService, mcpRegistry, configurationService) {
    super(null, labelService, fileService, instantiationService, mcpRegistry, configurationService);
    this.mainProcess = mainProcess;
    this.logService = logService;
  }
  start() {
    const service = ProxyChannel.toService(
      this.mainProcess.getChannel(NativeMcpDiscoveryHelperChannelName)
    );
    service.load().then(
      (data) => this.setDetails(data),
      (err) => {
        this.logService.warn("Error getting main process MCP environment", err);
        this.setDetails(void 0);
      }
    );
  }
};
NativeMcpDiscovery = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IMcpRegistry),
  __decorateParam(6, IConfigurationService)
], NativeMcpDiscovery);
export {
  NativeMcpDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9lbGVjdHJvbi1icm93c2VyL25hdGl2ZU1wY0Rpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFpblByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaXBjL2NvbW1vbi9tYWluUHJvY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlLCBOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbmF0aXZlTWNwRGlzY292ZXJ5SGVscGVyLmpzJztcbmltcG9ydCB7IE5hdGl2ZUZpbGVzeXN0ZW1NY3BEaXNjb3ZlcnkgfSBmcm9tICcuLi9jb21tb24vZGlzY292ZXJ5L25hdGl2ZU1jcERpc2NvdmVyeUFic3RyYWN0LmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZU1jcERpc2NvdmVyeSBleHRlbmRzIE5hdGl2ZUZpbGVzeXN0ZW1NY3BEaXNjb3Zlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1haW5Qcm9jZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1haW5Qcm9jZXNzOiBJTWFpblByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWNwUmVnaXN0cnkgbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGxhYmVsU2VydmljZSwgZmlsZVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtY3BSZWdpc3RyeSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHN0YXJ0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlPihcblx0XHRcdHRoaXMubWFpblByb2Nlc3MuZ2V0Q2hhbm5lbChOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJDaGFubmVsTmFtZSkpO1xuXG5cdFx0c2VydmljZS5sb2FkKCkudGhlbihcblx0XHRcdGRhdGEgPT4gdGhpcy5zZXREZXRhaWxzKGRhdGEpLFxuXHRcdFx0ZXJyID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0Vycm9yIGdldHRpbmcgbWFpbiBwcm9jZXNzIE1DUCBlbnZpcm9ubWVudCcsIGVycik7XG5cdFx0XHRcdHRoaXMuc2V0RGV0YWlscyh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBMkMsMkNBQTJDO0FBQ3RGLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsb0JBQW9CO0FBRXRCLElBQU0scUJBQU4sY0FBaUMsNkJBQTZCO0FBQUEsRUFDcEUsWUFDdUMsYUFDUixZQUNmLGNBQ0QsYUFDUyxzQkFDVCxhQUNTLHNCQUN0QjtBQUNELFVBQU0sTUFBTSxjQUFjLGFBQWEsc0JBQXNCLGFBQWEsb0JBQW9CO0FBUnhEO0FBQ1I7QUFBQSxFQVEvQjtBQUFBLEVBRWdCLFFBQWM7QUFDN0IsVUFBTSxVQUFVLGFBQWE7QUFBQSxNQUM1QixLQUFLLFlBQVksV0FBVyxtQ0FBbUM7QUFBQSxJQUFDO0FBRWpFLFlBQVEsS0FBSyxFQUFFO0FBQUEsTUFDZCxVQUFRLEtBQUssV0FBVyxJQUFJO0FBQUEsTUFDNUIsU0FBTztBQUNOLGFBQUssV0FBVyxLQUFLLDhDQUE4QyxHQUFHO0FBQ3RFLGFBQUssV0FBVyxNQUFTO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBekJhLHFCQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
