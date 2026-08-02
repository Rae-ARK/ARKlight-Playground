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
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { McpGatewayToolBrokerChannelName } from "../../../../platform/mcp/common/mcpGateway.js";
import { IMcpService } from "../common/mcpTypes.js";
import { McpGatewayToolBrokerChannel } from "../common/mcpGatewayToolBrokerChannel.js";
let McpGatewayToolBrokerContribution = class {
  constructor(mainProcessService, mcpService, logService) {
    mainProcessService.registerChannel(McpGatewayToolBrokerChannelName, new McpGatewayToolBrokerChannel(mcpService, logService));
  }
};
McpGatewayToolBrokerContribution = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, IMcpService),
  __decorateParam(2, ILogService)
], McpGatewayToolBrokerContribution);
export {
  McpGatewayToolBrokerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9lbGVjdHJvbi1icm93c2VyL21jcEdhdGV3YXlUb29sQnJva2VyQ29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElNYWluUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvY29tbW9uL21haW5Qcm9jZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbE5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcEdhdGV3YXkuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsIH0gZnJvbSAnLi4vY29tbW9uL21jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNY3BHYXRld2F5VG9vbEJyb2tlckNvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1haW5Qcm9jZXNzU2VydmljZSBtYWluUHJvY2Vzc1NlcnZpY2U6IElNYWluUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0bWFpblByb2Nlc3NTZXJ2aWNlLnJlZ2lzdGVyQ2hhbm5lbChNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWxOYW1lLCBuZXcgTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsKG1jcFNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1DQUFtQztBQUVyQyxJQUFNLG1DQUFOLE1BQXlFO0FBQUEsRUFDL0UsWUFDc0Isb0JBQ1IsWUFDQSxZQUNaO0FBQ0QsdUJBQW1CLGdCQUFnQixpQ0FBaUMsSUFBSSw0QkFBNEIsWUFBWSxVQUFVLENBQUM7QUFBQSxFQUM1SDtBQUNEO0FBUmEsbUNBQU47QUFBQSxFQUVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
