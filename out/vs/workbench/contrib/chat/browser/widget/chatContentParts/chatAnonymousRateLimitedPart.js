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
import { $, append } from "../../../../../../base/browser/dom.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
let ChatAnonymousRateLimitedPart = class extends Disposable {
  constructor(content, commandService, telemetryService, chatEntitlementService) {
    super();
    this.content = content;
    this.domNode = $(".chat-rate-limited-widget");
    const icon = append(this.domNode, $("span"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    const messageContainer = append(this.domNode, $(".chat-rate-limited-message"));
    const message = append(messageContainer, $("div"));
    message.textContent = localize("anonymousRateLimited", "Continue the conversation by signing in. Your free account gets 50 premium requests a month plus access to more models and AI features.");
    const signInButton = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
    signInButton.label = localize("enableMoreAIFeatures", "Enable more AI features");
    signInButton.element.classList.add("chat-rate-limited-button");
    this._register(signInButton.onDidClick(async () => {
      const commandId = "workbench.action.chat.triggerSetup";
      telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "chat-response" });
      await commandService.executeCommand(commandId);
    }));
  }
  hasSameContent(other) {
    return other.kind === this.content.kind && !!other.errorDetails.isRateLimited;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatAnonymousRateLimitedPart = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IChatEntitlementService)
], ChatAnonymousRateLimitedPart);
export {
  ChatAnonymousRateLimitedPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0QW5vbnltb3VzUmF0ZUxpbWl0ZWRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYXBwZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RXJyb3JEZXRhaWxzUGFydCwgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRBbm9ueW1vdXNSYXRlTGltaXRlZFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50OiBJQ2hhdEVycm9yRGV0YWlsc1BhcnQsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9ICQoJy5jaGF0LXJhdGUtbGltaXRlZC13aWRnZXQnKTtcblxuXHRcdGNvbnN0IGljb24gPSBhcHBlbmQodGhpcy5kb21Ob2RlLCAkKCdzcGFuJykpO1xuXHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmluZm8pKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VDb250YWluZXIgPSBhcHBlbmQodGhpcy5kb21Ob2RlLCAkKCcuY2hhdC1yYXRlLWxpbWl0ZWQtbWVzc2FnZScpKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBhcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgJCgnZGl2JykpO1xuXHRcdG1lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYW5vbnltb3VzUmF0ZUxpbWl0ZWQnLCBcIkNvbnRpbnVlIHRoZSBjb252ZXJzYXRpb24gYnkgc2lnbmluZyBpbi4gWW91ciBmcmVlIGFjY291bnQgZ2V0cyA1MCBwcmVtaXVtIHJlcXVlc3RzIGEgbW9udGggcGx1cyBhY2Nlc3MgdG8gbW9yZSBtb2RlbHMgYW5kIEFJIGZlYXR1cmVzLlwiKTtcblxuXHRcdGNvbnN0IHNpZ25JbkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24obWVzc2FnZUNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdHNpZ25JbkJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdlbmFibGVNb3JlQUlGZWF0dXJlcycsIFwiRW5hYmxlIG1vcmUgQUkgZmVhdHVyZXNcIik7XG5cdFx0c2lnbkluQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1yYXRlLWxpbWl0ZWQtYnV0dG9uJyk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihzaWduSW5CdXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cCc7XG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogY29tbWFuZElkLCBmcm9tOiAnY2hhdC1yZXNwb25zZScgfSk7XG5cblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09IHRoaXMuY29udGVudC5raW5kICYmICEhb3RoZXIuZXJyb3JEZXRhaWxzLmlzUmF0ZUxpbWl0ZWQ7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFHLGNBQWM7QUFDMUIsU0FBUyxjQUFjO0FBRXZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtCQUErQjtBQUlqQyxJQUFNLCtCQUFOLGNBQTJDLFdBQXVDO0FBQUEsRUFJeEYsWUFDa0IsU0FDQSxnQkFDRSxrQkFDTSx3QkFDeEI7QUFDRCxVQUFNO0FBTFc7QUFPakIsU0FBSyxVQUFVLEVBQUUsMkJBQTJCO0FBRTVDLFVBQU0sT0FBTyxPQUFPLEtBQUssU0FBUyxFQUFFLE1BQU0sQ0FBQztBQUMzQyxTQUFLLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsSUFBSSxDQUFDO0FBRTlELFVBQU0sbUJBQW1CLE9BQU8sS0FBSyxTQUFTLEVBQUUsNEJBQTRCLENBQUM7QUFFN0UsVUFBTSxVQUFVLE9BQU8sa0JBQWtCLEVBQUUsS0FBSyxDQUFDO0FBQ2pELFlBQVEsY0FBYyxTQUFTLHdCQUF3Qix5SUFBeUk7QUFFaE0sVUFBTSxlQUFlLEtBQUssVUFBVSxJQUFJLE9BQU8sa0JBQWtCLEVBQUUsR0FBRyxxQkFBcUIsY0FBYyxLQUFLLENBQUMsQ0FBQztBQUNoSCxpQkFBYSxRQUFRLFNBQVMsd0JBQXdCLHlCQUF5QjtBQUMvRSxpQkFBYSxRQUFRLFVBQVUsSUFBSSwwQkFBMEI7QUFFN0QsU0FBSyxVQUFVLGFBQWEsV0FBVyxZQUFZO0FBQ2xELFlBQU0sWUFBWTtBQUNsQix1QkFBaUIsV0FBZ0YsMkJBQTJCLEVBQUUsSUFBSSxXQUFXLE1BQU0sZ0JBQWdCLENBQUM7QUFFcEssWUFBTSxlQUFlLGVBQWUsU0FBUztBQUFBLElBQzlDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLGVBQWUsT0FBc0M7QUFDcEQsV0FBTyxNQUFNLFNBQVMsS0FBSyxRQUFRLFFBQVEsQ0FBQyxDQUFDLE1BQU0sYUFBYTtBQUFBLEVBQ2pFO0FBQUEsRUFFQSxjQUFjLFlBQStCO0FBQzVDLFNBQUssVUFBVSxVQUFVO0FBQUEsRUFDMUI7QUFDRDtBQXpDYSwrQkFBTjtBQUFBLEVBTUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
