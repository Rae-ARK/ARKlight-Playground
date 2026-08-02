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
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { McpGatewayChannelName } from "../../../../platform/mcp/common/mcpGateway.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
let BrowserMcpGatewayService = class {
  constructor(_remoteAgentService, _logService) {
    this._remoteAgentService = _remoteAgentService;
    this._logService = _logService;
  }
  async createGateway(inRemote, chatSessionResource) {
    this._logService.debug(`[McpGateway][BrowserWorkbench] createGateway requested (inRemote=${inRemote})`);
    if (!inRemote) {
      this._logService.info("[McpGateway][BrowserWorkbench] Cannot create local gateway in browser environment");
      return void 0;
    }
    const connection = this._remoteAgentService.getConnection();
    if (!connection) {
      this._logService.info("[McpGateway][BrowserWorkbench] No remote connection available (serverless web)");
      return void 0;
    }
    this._logService.info("[McpGateway][BrowserWorkbench] Creating remote gateway via remote server");
    return connection.withChannel(McpGatewayChannelName, async (channel) => {
      const info = await channel.call(
        "createGateway",
        chatSessionResource ? { chatSessionResource: chatSessionResource.toString() } : void 0
      );
      const servers = reviveServers(info.servers);
      this._logService.info(`[McpGateway][BrowserWorkbench] Remote gateway created with ${servers.length} server(s)`);
      const onDidChangeServers = Event.map(
        Event.filter(
          channel.listen("onDidChangeGatewayServers"),
          (e) => e.gatewayId === info.gatewayId
        ),
        (e) => reviveServers(e.servers)
      );
      return {
        servers,
        onDidChangeServers,
        dispose: () => {
          this._logService.info(`[McpGateway][BrowserWorkbench] Disposing remote gateway: ${info.gatewayId}`);
          void channel.call("disposeGateway", info.gatewayId).then(void 0, (error) => {
            this._logService.warn(`[McpGateway][BrowserWorkbench] Failed to dispose remote gateway: ${info.gatewayId}`, error);
          });
        }
      };
    });
  }
};
BrowserMcpGatewayService = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, ILogService)
], BrowserMcpGatewayService);
function reviveServers(servers) {
  return servers.map((s) => ({ label: s.label, address: URI.revive(s.address) }));
}
export {
  BrowserMcpGatewayService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcEdhdGV3YXlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWNwR2F0ZXdheVNlcnZlckluZm8sIE1jcEdhdGV3YXlDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2F0ZXdheS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1jcEdhdGV3YXlSZXN1bHQsIElNY3BHYXRld2F5UmVzdWx0U2VydmVyLCBJV29ya2JlbmNoTWNwR2F0ZXdheVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbWNwR2F0ZXdheVNlcnZpY2UuanMnO1xuXG4vKipcbiAqIEJyb3dzZXIgaW1wbGVtZW50YXRpb24gb2YgdGhlIE1DUCBHYXRld2F5IFNlcnZpY2UuXG4gKlxuICogSW4gYnJvd3Nlci9zZXJ2ZXJsZXNzIHdlYiBlbnZpcm9ubWVudHMgd2l0aG91dCBhIHJlbW90ZSBjb25uZWN0aW9uLFxuICogdGhlcmUgaXMgbm8gTm9kZS5qcyBwcm9jZXNzIGF2YWlsYWJsZSB0byBjcmVhdGUgYW4gSFRUUCBzZXJ2ZXIuXG4gKlxuICogV2hlbiBydW5uaW5nIHdpdGggYSByZW1vdGUgY29ubmVjdGlvbiwgdGhlIGdhdGV3YXkgaXMgY3JlYXRlZCBvbiB0aGVcbiAqIHJlbW90ZSBzZXJ2ZXIgdmlhIElQQy5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJNY3BHYXRld2F5U2VydmljZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hNY3BHYXRld2F5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgY3JlYXRlR2F0ZXdheShpblJlbW90ZTogYm9vbGVhbiwgY2hhdFNlc3Npb25SZXNvdXJjZT86IFVSSSk6IFByb21pc2U8SU1jcEdhdGV3YXlSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbTWNwR2F0ZXdheV1bQnJvd3NlcldvcmtiZW5jaF0gY3JlYXRlR2F0ZXdheSByZXF1ZXN0ZWQgKGluUmVtb3RlPSR7aW5SZW1vdGV9KWApO1xuXG5cdFx0Ly8gQnJvd3NlciBjYW4gb25seSBjcmVhdGUgZ2F0ZXdheXMgaW4gcmVtb3RlIGVudmlyb25tZW50XG5cdFx0aWYgKCFpblJlbW90ZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbTWNwR2F0ZXdheV1bQnJvd3NlcldvcmtiZW5jaF0gQ2Fubm90IGNyZWF0ZSBsb2NhbCBnYXRld2F5IGluIGJyb3dzZXIgZW52aXJvbm1lbnQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tNY3BHYXRld2F5XVtCcm93c2VyV29ya2JlbmNoXSBObyByZW1vdGUgY29ubmVjdGlvbiBhdmFpbGFibGUgKHNlcnZlcmxlc3Mgd2ViKScpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tNY3BHYXRld2F5XVtCcm93c2VyV29ya2JlbmNoXSBDcmVhdGluZyByZW1vdGUgZ2F0ZXdheSB2aWEgcmVtb3RlIHNlcnZlcicpO1xuXHRcdC8vIFVzZSB0aGUgcmVtb3RlIHNlcnZlcidzIGdhdGV3YXkgc2VydmljZVxuXHRcdHJldHVybiBjb25uZWN0aW9uLndpdGhDaGFubmVsKE1jcEdhdGV3YXlDaGFubmVsTmFtZSwgYXN5bmMgY2hhbm5lbCA9PiB7XG5cdFx0XHRjb25zdCBpbmZvID0gYXdhaXQgY2hhbm5lbC5jYWxsPHsgZ2F0ZXdheUlkOiBzdHJpbmc7IHNlcnZlcnM6IHJlYWRvbmx5IElNY3BHYXRld2F5U2VydmVySW5mb1tdIH0+KFxuXHRcdFx0XHQnY3JlYXRlR2F0ZXdheScsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UgPyB7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IGNoYXRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSB9IDogdW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IHJldml2ZVNlcnZlcnMoaW5mby5zZXJ2ZXJzKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW01jcEdhdGV3YXldW0Jyb3dzZXJXb3JrYmVuY2hdIFJlbW90ZSBnYXRld2F5IGNyZWF0ZWQgd2l0aCAke3NlcnZlcnMubGVuZ3RofSBzZXJ2ZXIocylgKTtcblxuXHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXJ2ZXJzID0gRXZlbnQubWFwKFxuXHRcdFx0XHRFdmVudC5maWx0ZXIoXG5cdFx0XHRcdFx0Y2hhbm5lbC5saXN0ZW48eyBnYXRld2F5SWQ6IHN0cmluZzsgc2VydmVyczogcmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJJbmZvW10gfT4oJ29uRGlkQ2hhbmdlR2F0ZXdheVNlcnZlcnMnKSxcblx0XHRcdFx0XHRlID0+IGUuZ2F0ZXdheUlkID09PSBpbmZvLmdhdGV3YXlJZCxcblx0XHRcdFx0KSxcblx0XHRcdFx0ZSA9PiByZXZpdmVTZXJ2ZXJzKGUuc2VydmVycyksXG5cdFx0XHQpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzZXJ2ZXJzLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNlcnZlcnMsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtNY3BHYXRld2F5XVtCcm93c2VyV29ya2JlbmNoXSBEaXNwb3NpbmcgcmVtb3RlIGdhdGV3YXk6ICR7aW5mby5nYXRld2F5SWR9YCk7XG5cdFx0XHRcdFx0dm9pZCBjaGFubmVsLmNhbGwoJ2Rpc3Bvc2VHYXRld2F5JywgaW5mby5nYXRld2F5SWQpLnRoZW4odW5kZWZpbmVkLCBlcnJvciA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtNY3BHYXRld2F5XVtCcm93c2VyV29ya2JlbmNoXSBGYWlsZWQgdG8gZGlzcG9zZSByZW1vdGUgZ2F0ZXdheTogJHtpbmZvLmdhdGV3YXlJZH1gLCBlcnJvcik7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmV2aXZlU2VydmVycyhzZXJ2ZXJzOiByZWFkb25seSBJTWNwR2F0ZXdheVNlcnZlckluZm9bXSk6IElNY3BHYXRld2F5UmVzdWx0U2VydmVyW10ge1xuXHRyZXR1cm4gc2VydmVycy5tYXAocyA9PiAoeyBsYWJlbDogcy5sYWJlbCwgYWRkcmVzczogVVJJLnJldml2ZShzLmFkZHJlc3MpIH0pKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUM1QixTQUFnQyw2QkFBNkI7QUFDN0QsU0FBUywyQkFBMkI7QUFZN0IsSUFBTSwyQkFBTixNQUFzRTtBQUFBLEVBRzVFLFlBQ3VDLHFCQUNSLGFBQzdCO0FBRnFDO0FBQ1I7QUFBQSxFQUMzQjtBQUFBLEVBRUosTUFBTSxjQUFjLFVBQW1CLHFCQUFtRTtBQUN6RyxTQUFLLFlBQVksTUFBTSxvRUFBb0UsUUFBUSxHQUFHO0FBR3RHLFFBQUksQ0FBQyxVQUFVO0FBQ2QsV0FBSyxZQUFZLEtBQUssbUZBQW1GO0FBQ3pHLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxhQUFhLEtBQUssb0JBQW9CLGNBQWM7QUFDMUQsUUFBSSxDQUFDLFlBQVk7QUFDaEIsV0FBSyxZQUFZLEtBQUssZ0ZBQWdGO0FBQ3RHLGFBQU87QUFBQSxJQUNSO0FBRUEsU0FBSyxZQUFZLEtBQUssMEVBQTBFO0FBRWhHLFdBQU8sV0FBVyxZQUFZLHVCQUF1QixPQUFNLFlBQVc7QUFDckUsWUFBTSxPQUFPLE1BQU0sUUFBUTtBQUFBLFFBQzFCO0FBQUEsUUFDQSxzQkFBc0IsRUFBRSxxQkFBcUIsb0JBQW9CLFNBQVMsRUFBRSxJQUFJO0FBQUEsTUFDakY7QUFDQSxZQUFNLFVBQVUsY0FBYyxLQUFLLE9BQU87QUFDMUMsV0FBSyxZQUFZLEtBQUssOERBQThELFFBQVEsTUFBTSxZQUFZO0FBRTlHLFlBQU0scUJBQXFCLE1BQU07QUFBQSxRQUNoQyxNQUFNO0FBQUEsVUFDTCxRQUFRLE9BQXlFLDJCQUEyQjtBQUFBLFVBQzVHLE9BQUssRUFBRSxjQUFjLEtBQUs7QUFBQSxRQUMzQjtBQUFBLFFBQ0EsT0FBSyxjQUFjLEVBQUUsT0FBTztBQUFBLE1BQzdCO0FBRUEsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBO0FBQUEsUUFDQSxTQUFTLE1BQU07QUFDZCxlQUFLLFlBQVksS0FBSyw0REFBNEQsS0FBSyxTQUFTLEVBQUU7QUFDbEcsZUFBSyxRQUFRLEtBQUssa0JBQWtCLEtBQUssU0FBUyxFQUFFLEtBQUssUUFBVyxXQUFTO0FBQzVFLGlCQUFLLFlBQVksS0FBSyxvRUFBb0UsS0FBSyxTQUFTLElBQUksS0FBSztBQUFBLFVBQ2xILENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXJEYSwyQkFBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsR0FMVTtBQXVEYixTQUFTLGNBQWMsU0FBc0U7QUFDNUYsU0FBTyxRQUFRLElBQUksUUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLFNBQVMsSUFBSSxPQUFPLEVBQUUsT0FBTyxFQUFFLEVBQUU7QUFDN0U7IiwKICAibmFtZXMiOiBbXQp9Cg==
