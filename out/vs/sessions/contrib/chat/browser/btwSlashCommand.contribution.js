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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IChatWidgetService } from "../../../../workbench/contrib/chat/browser/chat.js";
import { IWorkbenchEnvironmentService } from "../../../../workbench/services/environment/common/environmentService.js";
import { ChatAgentLocation } from "../../../../workbench/contrib/chat/common/constants.js";
import { IChatService } from "../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSlashCommandService } from "../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js";
import { captureSideChatSelection } from "../../../../workbench/contrib/chat/browser/chatSideChat.js";
import { IsSessionsWindowContext } from "../../../../workbench/common/contextkeys.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { SessionIsArchivedContext, SessionIsCreatedContext, SessionSupportsSideChatContext } from "../../../common/contextkeys.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { openAndSendSideChat } from "./sideChatOrchestration.js";
let BtwSlashCommandContribution = class extends Disposable {
  constructor(slashCommandService, sessionsService, sessionsManagementService, chatService, chatWidgetService, environmentService, logService, notificationService) {
    super();
    if (!environmentService.isSessionsWindow) {
      return;
    }
    this._register(slashCommandService.registerSlashCommand({
      command: "btw",
      detail: localize("btw", "Ask a side question without adding it to this conversation"),
      sortText: "z2_btw",
      executeImmediately: false,
      executeDuringRequest: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      when: ContextKeyExpr.and(
        IsSessionsWindowContext,
        SessionIsCreatedContext,
        SessionIsArchivedContext.negate(),
        SessionSupportsSideChatContext
      )
    }, async (prompt, _progress, _history, _location, sessionResource) => {
      const remainder = prompt.trim();
      if (!remainder) {
        notificationService.warn(localize("btw.missingPrompt", "Enter a question after `/btw`."));
        return;
      }
      const found = sessionsManagementService.getSessionForChatResource(sessionResource);
      if (!found) {
        notificationService.warn(localize("btw.sessionUnavailable", "A side chat cannot be created from this conversation."));
        return;
      }
      const { session, chat } = found;
      if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
        notificationService.warn(localize("btw.unsupported", "This conversation does not support side chats."));
        return;
      }
      const sourceTurn = chatService.getSession(chat.resource)?.getRequests().at(-1);
      if (!sourceTurn) {
        logService.warn("[btw] No turn to branch a side chat from");
        notificationService.warn(localize("btw.noTurn", "Send a message in this conversation before starting a side chat."));
        return;
      }
      const selection = captureSideChatSelection(chatWidgetService.getWidgetBySessionResource(chat.resource));
      let sideChat;
      try {
        sideChat = await sessionsManagementService.createSideChatInSession(session, chat.resource, sourceTurn.id, selection);
      } catch (err) {
        logService.error("[btw] Failed to create side chat", err);
        notificationService.error(localize("btw.createFailed", "The side chat could not be created."));
        return;
      }
      await openAndSendSideChat(sessionsManagementService, sessionsService, session, sideChat, remainder);
    }));
  }
};
BtwSlashCommandContribution.ID = "sessions.contrib.btwSlashCommand";
BtwSlashCommandContribution = __decorateClass([
  __decorateParam(0, IChatSlashCommandService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, ISessionsManagementService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, ILogService),
  __decorateParam(7, INotificationService)
], BtwSlashCommandContribution);
registerWorkbenchContribution2(BtwSlashCommandContribution.ID, BtwSlashCommandContribution, WorkbenchPhase.Eventually);
export {
  BtwSlashCommandContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL2J0d1NsYXNoQ29tbWFuZC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IGNhcHR1cmVTaWRlQ2hhdFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2lkZUNoYXQuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0LCBTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgU2Vzc2lvblN1cHBvcnRzU2lkZUNoYXRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBvcGVuQW5kU2VuZFNpZGVDaGF0IH0gZnJvbSAnLi9zaWRlQ2hhdE9yY2hlc3RyYXRpb24uanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBCdHdTbGFzaENvbW1hbmRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nlc3Npb25zLmNvbnRyaWIuYnR3U2xhc2hDb21tYW5kJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIHNsYXNoQ29tbWFuZFNlcnZpY2U6IElDaGF0U2xhc2hDb21tYW5kU2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoIWVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnYnR3Jyxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2J0dycsIFwiQXNrIGEgc2lkZSBxdWVzdGlvbiB3aXRob3V0IGFkZGluZyBpdCB0byB0aGlzIGNvbnZlcnNhdGlvblwiKSxcblx0XHRcdHNvcnRUZXh0OiAnejJfYnR3Jyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogZmFsc2UsXG5cdFx0XHRleGVjdXRlRHVyaW5nUmVxdWVzdDogdHJ1ZSxcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0U2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsXG5cdFx0XHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0U2Vzc2lvblN1cHBvcnRzU2lkZUNoYXRDb250ZXh0LFxuXHRcdFx0KSxcblx0XHR9LCBhc3luYyAocHJvbXB0LCBfcHJvZ3Jlc3MsIF9oaXN0b3J5LCBfbG9jYXRpb24sIHNlc3Npb25SZXNvdXJjZSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVtYWluZGVyID0gcHJvbXB0LnRyaW0oKTtcblx0XHRcdGlmICghcmVtYWluZGVyKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnYnR3Lm1pc3NpbmdQcm9tcHQnLCBcIkVudGVyIGEgcXVlc3Rpb24gYWZ0ZXIgYC9idHdgLlwiKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvdW5kID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnYnR3LnNlc3Npb25VbmF2YWlsYWJsZScsIFwiQSBzaWRlIGNoYXQgY2Fubm90IGJlIGNyZWF0ZWQgZnJvbSB0aGlzIGNvbnZlcnNhdGlvbi5cIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHNlc3Npb24sIGNoYXQgfSA9IGZvdW5kO1xuXHRcdFx0aWYgKHNlc3Npb24uc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIHx8IHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSB8fCAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNTaWRlQ2hhdCkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ2J0dy51bnN1cHBvcnRlZCcsIFwiVGhpcyBjb252ZXJzYXRpb24gZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzLlwiKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc291cmNlVHVybiA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24oY2hhdC5yZXNvdXJjZSk/LmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0aWYgKCFzb3VyY2VUdXJuKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2Uud2FybignW2J0d10gTm8gdHVybiB0byBicmFuY2ggYSBzaWRlIGNoYXQgZnJvbScpO1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ2J0dy5ub1R1cm4nLCBcIlNlbmQgYSBtZXNzYWdlIGluIHRoaXMgY29udmVyc2F0aW9uIGJlZm9yZSBzdGFydGluZyBhIHNpZGUgY2hhdC5cIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBjYXB0dXJlU2lkZUNoYXRTZWxlY3Rpb24oY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY2hhdC5yZXNvdXJjZSkpO1xuXG5cdFx0XHRsZXQgc2lkZUNoYXQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzaWRlQ2hhdCA9IGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlU2lkZUNoYXRJblNlc3Npb24oc2Vzc2lvbiwgY2hhdC5yZXNvdXJjZSwgc291cmNlVHVybi5pZCwgc2VsZWN0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbYnR3XSBGYWlsZWQgdG8gY3JlYXRlIHNpZGUgY2hhdCcsIGVycik7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2J0dy5jcmVhdGVGYWlsZWQnLCBcIlRoZSBzaWRlIGNoYXQgY291bGQgbm90IGJlIGNyZWF0ZWQuXCIpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBvcGVuQW5kU2VuZFNpZGVDaGF0KHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgc2Vzc2lvbiwgc2lkZUNoYXQsIHJlbWFpbmRlcik7XG5cdFx0fSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihCdHdTbGFzaENvbW1hbmRDb250cmlidXRpb24uSUQsIEJ0d1NsYXNoQ29tbWFuZENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywwQkFBMEIseUJBQXlCLHNDQUFzQztBQUNsRyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUc3QixJQUFNLDhCQUFOLGNBQTBDLFdBQTZDO0FBQUEsRUFJN0YsWUFDMkIscUJBQ1IsaUJBQ1UsMkJBQ2QsYUFDTSxtQkFDVSxvQkFDakIsWUFDUyxxQkFDckI7QUFDRCxVQUFNO0FBRU4sUUFBSSxDQUFDLG1CQUFtQixrQkFBa0I7QUFDekM7QUFBQSxJQUNEO0FBRUEsU0FBSyxVQUFVLG9CQUFvQixxQkFBcUI7QUFBQSxNQUN2RCxTQUFTO0FBQUEsTUFDVCxRQUFRLFNBQVMsT0FBTyw0REFBNEQ7QUFBQSxNQUNwRixVQUFVO0FBQUEsTUFDVixvQkFBb0I7QUFBQSxNQUNwQixzQkFBc0I7QUFBQSxNQUN0QixRQUFRO0FBQUEsTUFDUixXQUFXLENBQUMsa0JBQWtCLElBQUk7QUFBQSxNQUNsQyxNQUFNLGVBQWU7QUFBQSxRQUNwQjtBQUFBLFFBQ0E7QUFBQSxRQUNBLHlCQUF5QixPQUFPO0FBQUEsUUFDaEM7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE9BQU8sUUFBUSxXQUFXLFVBQVUsV0FBVyxvQkFBb0I7QUFDckUsWUFBTSxZQUFZLE9BQU8sS0FBSztBQUM5QixVQUFJLENBQUMsV0FBVztBQUNmLDRCQUFvQixLQUFLLFNBQVMscUJBQXFCLGdDQUFnQyxDQUFDO0FBQ3hGO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBUSwwQkFBMEIsMEJBQTBCLGVBQWU7QUFDakYsVUFBSSxDQUFDLE9BQU87QUFDWCw0QkFBb0IsS0FBSyxTQUFTLDBCQUEwQix1REFBdUQsQ0FBQztBQUNwSDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEVBQUUsU0FBUyxLQUFLLElBQUk7QUFDMUIsVUFBSSxRQUFRLE9BQU8sSUFBSSxNQUFNLGNBQWMsWUFBWSxRQUFRLFdBQVcsSUFBSSxLQUFLLENBQUMsUUFBUSxhQUFhLElBQUksRUFBRSxrQkFBa0I7QUFDaEksNEJBQW9CLEtBQUssU0FBUyxtQkFBbUIsZ0RBQWdELENBQUM7QUFDdEc7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUFhLFlBQVksV0FBVyxLQUFLLFFBQVEsR0FBRyxZQUFZLEVBQUUsR0FBRyxFQUFFO0FBQzdFLFVBQUksQ0FBQyxZQUFZO0FBQ2hCLG1CQUFXLEtBQUssMENBQTBDO0FBQzFELDRCQUFvQixLQUFLLFNBQVMsY0FBYyxrRUFBa0UsQ0FBQztBQUNuSDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFlBQVkseUJBQXlCLGtCQUFrQiwyQkFBMkIsS0FBSyxRQUFRLENBQUM7QUFFdEcsVUFBSTtBQUNKLFVBQUk7QUFDSCxtQkFBVyxNQUFNLDBCQUEwQix3QkFBd0IsU0FBUyxLQUFLLFVBQVUsV0FBVyxJQUFJLFNBQVM7QUFBQSxNQUNwSCxTQUFTLEtBQUs7QUFDYixtQkFBVyxNQUFNLG9DQUFvQyxHQUFHO0FBQ3hELDRCQUFvQixNQUFNLFNBQVMsb0JBQW9CLHFDQUFxQyxDQUFDO0FBQzdGO0FBQUEsTUFDRDtBQUVBLFlBQU0sb0JBQW9CLDJCQUEyQixpQkFBaUIsU0FBUyxVQUFVLFNBQVM7QUFBQSxJQUNuRyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUF2RWEsNEJBRUksS0FBSztBQUZULDhCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVO0FBeUViLCtCQUErQiw0QkFBNEIsSUFBSSw2QkFBNkIsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogW10KfQo=
