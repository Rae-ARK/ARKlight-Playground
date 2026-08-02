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
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { localize } from "../../../../../../../nls.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IAgentHostCustomizationService } from "../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { IChatWidgetService } from "../../../chat.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
let ChatToolAuthenticationSubPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, context, instantiationService, customizationService, chatWidgetService) {
    super(toolInvocation);
    this.codeblocks = [];
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
      throw new Error("Tool authentication state is missing");
    }
    const widget = this._register(instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      context,
      {
        title: localize("chat.toolAuthentication.title", "MCP authentication required"),
        icon: Codicon.mcp,
        subtitle: state.server.name,
        buttons: [
          {
            label: localize("chat.toolAuthentication.authenticate", "Authenticate"),
            data: async () => {
              await customizationService.authenticateMcpServer(context.element.sessionResource, state.server.id);
            }
          },
          {
            label: localize("chat.toolAuthentication.cancel", "Cancel"),
            data: async () => {
              state.cancel();
            },
            isSecondary: true
          }
        ],
        message: localize("chat.toolAuthentication.message", "The MCP server {0} requires authentication to continue this tool call.", state.server.name),
        toolbarData: {
          arg: toolInvocation,
          partType: "chatToolAuthentication",
          partSource: toolInvocation.source.type
        }
      }
    ));
    this._register(widget.onDidClick(async ({ button, isTouchClick }) => {
      await button.data();
      if (!isTouchClick) {
        chatWidgetService.getWidgetBySessionResource(context.element.sessionResource)?.focusInput();
      }
    }));
    this.domNode = widget.domNode;
  }
};
ChatToolAuthenticationSubPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IAgentHostCustomizationService),
  __decorateParam(4, IChatWidgetService)
], ChatToolAuthenticationSubPart);
export {
  ChatToolAuthenticationSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sQXV0aGVudGljYXRpb25TdWJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdEN1c3RvbUNvbmZpcm1hdGlvbldpZGdldCB9IGZyb20gJy4uL2NoYXRDb25maXJtYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0LmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRUb29sQXV0aGVudGljYXRpb25TdWJQYXJ0IGV4dGVuZHMgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQge1xuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29kZWJsb2NrcyA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIGN1c3RvbWl6YXRpb25TZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbik7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rvb2wgYXV0aGVudGljYXRpb24gc3RhdGUgaXMgbWlzc2luZycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdEN1c3RvbUNvbmZpcm1hdGlvbldpZGdldDwoKSA9PiBQcm9taXNlPHZvaWQ+Pixcblx0XHRcdGNvbnRleHQsXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC50b29sQXV0aGVudGljYXRpb24udGl0bGUnLCBcIk1DUCBhdXRoZW50aWNhdGlvbiByZXF1aXJlZFwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5tY3AsXG5cdFx0XHRcdHN1YnRpdGxlOiBzdGF0ZS5zZXJ2ZXIubmFtZSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC50b29sQXV0aGVudGljYXRpb24uYXV0aGVudGljYXRlJywgXCJBdXRoZW50aWNhdGVcIiksXG5cdFx0XHRcdFx0XHRkYXRhOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGN1c3RvbWl6YXRpb25TZXJ2aWNlLmF1dGhlbnRpY2F0ZU1jcFNlcnZlcihjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLCBzdGF0ZS5zZXJ2ZXIuaWQpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC50b29sQXV0aGVudGljYXRpb24uY2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRcdFx0XHRkYXRhOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHN0YXRlLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjaGF0LnRvb2xBdXRoZW50aWNhdGlvbi5tZXNzYWdlJywgXCJUaGUgTUNQIHNlcnZlciB7MH0gcmVxdWlyZXMgYXV0aGVudGljYXRpb24gdG8gY29udGludWUgdGhpcyB0b29sIGNhbGwuXCIsIHN0YXRlLnNlcnZlci5uYW1lKSxcblx0XHRcdFx0dG9vbGJhckRhdGE6IHtcblx0XHRcdFx0XHRhcmc6IHRvb2xJbnZvY2F0aW9uLFxuXHRcdFx0XHRcdHBhcnRUeXBlOiAnY2hhdFRvb2xBdXRoZW50aWNhdGlvbicsXG5cdFx0XHRcdFx0cGFydFNvdXJjZTogdG9vbEludm9jYXRpb24uc291cmNlLnR5cGUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdpZGdldC5vbkRpZENsaWNrKGFzeW5jICh7IGJ1dHRvbiwgaXNUb3VjaENsaWNrIH0pID0+IHtcblx0XHRcdGF3YWl0IGJ1dHRvbi5kYXRhKCk7XG5cdFx0XHRpZiAoIWlzVG91Y2hDbGljaykge1xuXHRcdFx0XHRjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKT8uZm9jdXNJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmRvbU5vZGUgPSB3aWRnZXQuZG9tTm9kZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyxxQ0FBcUM7QUFFdkMsSUFBTSxnQ0FBTixjQUE0Qyw4QkFBOEI7QUFBQSxFQUloRixZQUNDLGdCQUNBLFNBQ3VCLHNCQUNTLHNCQUNaLG1CQUNuQjtBQUNELFVBQU0sY0FBYztBQVRyQixTQUFTLGFBQWEsQ0FBQztBQVV0QixVQUFNLFFBQVEsZUFBZSxNQUFNLElBQUk7QUFDdkMsUUFBSSxNQUFNLFNBQVMsb0JBQW9CLFVBQVUsMEJBQTBCO0FBQzFFLFlBQU0sSUFBSSxNQUFNLHNDQUFzQztBQUFBLElBQ3ZEO0FBRUEsVUFBTSxTQUFTLEtBQUssVUFBVSxxQkFBcUI7QUFBQSxNQUNsRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLFNBQVMsaUNBQWlDLDZCQUE2QjtBQUFBLFFBQzlFLE1BQU0sUUFBUTtBQUFBLFFBQ2QsVUFBVSxNQUFNLE9BQU87QUFBQSxRQUN2QixTQUFTO0FBQUEsVUFDUjtBQUFBLFlBQ0MsT0FBTyxTQUFTLHdDQUF3QyxjQUFjO0FBQUEsWUFDdEUsTUFBTSxZQUFZO0FBQ2pCLG9CQUFNLHFCQUFxQixzQkFBc0IsUUFBUSxRQUFRLGlCQUFpQixNQUFNLE9BQU8sRUFBRTtBQUFBLFlBQ2xHO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE9BQU8sU0FBUyxrQ0FBa0MsUUFBUTtBQUFBLFlBQzFELE1BQU0sWUFBWTtBQUNqQixvQkFBTSxPQUFPO0FBQUEsWUFDZDtBQUFBLFlBQ0EsYUFBYTtBQUFBLFVBQ2Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxTQUFTLFNBQVMsbUNBQW1DLDBFQUEwRSxNQUFNLE9BQU8sSUFBSTtBQUFBLFFBQ2hKLGFBQWE7QUFBQSxVQUNaLEtBQUs7QUFBQSxVQUNMLFVBQVU7QUFBQSxVQUNWLFlBQVksZUFBZSxPQUFPO0FBQUEsUUFDbkM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxVQUFVLE9BQU8sV0FBVyxPQUFPLEVBQUUsUUFBUSxhQUFhLE1BQU07QUFDcEUsWUFBTSxPQUFPLEtBQUs7QUFDbEIsVUFBSSxDQUFDLGNBQWM7QUFDbEIsMEJBQWtCLDJCQUEyQixRQUFRLFFBQVEsZUFBZSxHQUFHLFdBQVc7QUFBQSxNQUMzRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLE9BQU87QUFBQSxFQUN2QjtBQUNEO0FBdkRhLGdDQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFtdCn0K
