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
import * as dom from "../../../../../../base/browser/dom.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { assertType } from "../../../../../../base/common/types.js";
import { localize } from "../../../../../../nls.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
const $ = dom.$;
let ChatQuotaExceededPart = class extends Disposable {
  constructor(element, content, renderer, commandService, telemetryService, chatEntitlementService) {
    super();
    this.content = content;
    const errorDetails = element.errorDetails;
    assertType(!!errorDetails, "errorDetails");
    this.domNode = $(".chat-quota-error-widget");
    const icon = dom.append(this.domNode, $("span"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
    const messageContainer = dom.append(this.domNode, $(".chat-quota-error-message"));
    const markdownContent = this._register(renderer.render(new MarkdownString(errorDetails.message)));
    dom.append(messageContainer, markdownContent.element);
    let primaryButtonLabel;
    switch (chatEntitlementService.entitlement) {
      case ChatEntitlement.EDU:
      case ChatEntitlement.Pro:
      case ChatEntitlement.ProPlus:
      case ChatEntitlement.Max:
        primaryButtonLabel = localize("manageBudget", "Manage Budget");
        break;
      case ChatEntitlement.Free:
        primaryButtonLabel = localize("upgradeToCopilotPro", "Upgrade to GitHub Copilot Pro");
        break;
    }
    if (primaryButtonLabel) {
      const primaryButton = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
      primaryButton.label = primaryButtonLabel;
      primaryButton.element.classList.add("chat-quota-error-button");
      this._register(primaryButton.onDidClick(async () => {
        const commandId = chatEntitlementService.entitlement === ChatEntitlement.Free ? "workbench.action.chat.upgradePlan" : "workbench.action.chat.manageAdditionalSpend";
        telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "chat-response" });
        await commandService.executeCommand(commandId);
      }));
    }
  }
  hasSameContent(other) {
    return other.kind === this.content.kind && !!other.errorDetails.isQuotaExceeded;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatQuotaExceededPart = __decorateClass([
  __decorateParam(3, ICommandService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IChatEntitlementService)
], ChatQuotaExceededPart);
export {
  ChatQuotaExceededPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UXVvdGFFeGNlZWRlZFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRFcnJvckRldGFpbHNQYXJ0LCBJQ2hhdFJlbmRlcmVyQ29udGVudCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBjbGFzcyBDaGF0UXVvdGFFeGNlZWRlZFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnQ6IElDaGF0RXJyb3JEZXRhaWxzUGFydCxcblx0XHRyZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVycm9yRGV0YWlscyA9IGVsZW1lbnQuZXJyb3JEZXRhaWxzO1xuXHRcdGFzc2VydFR5cGUoISFlcnJvckRldGFpbHMsICdlcnJvckRldGFpbHMnKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9ICQoJy5jaGF0LXF1b3RhLWVycm9yLXdpZGdldCcpO1xuXHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgJCgnc3BhbicpKTtcblx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi53YXJuaW5nKSk7XG5cblx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsICQoJy5jaGF0LXF1b3RhLWVycm9yLW1lc3NhZ2UnKSk7XG5cdFx0Y29uc3QgbWFya2Rvd25Db250ZW50ID0gdGhpcy5fcmVnaXN0ZXIocmVuZGVyZXIucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyhlcnJvckRldGFpbHMubWVzc2FnZSkpKTtcblx0XHRkb20uYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsIG1hcmtkb3duQ29udGVudC5lbGVtZW50KTtcblxuXHRcdGxldCBwcmltYXJ5QnV0dG9uTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpIHtcblx0XHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkVEVTpcblx0XHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LlBybzpcblx0XHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LlByb1BsdXM6XG5cdFx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5NYXg6XG5cdFx0XHRcdHByaW1hcnlCdXR0b25MYWJlbCA9IGxvY2FsaXplKCdtYW5hZ2VCdWRnZXQnLCBcIk1hbmFnZSBCdWRnZXRcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuRnJlZTpcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbkxhYmVsID0gbG9jYWxpemUoJ3VwZ3JhZGVUb0NvcGlsb3RQcm8nLCBcIlVwZ3JhZGUgdG8gR2l0SHViIENvcGlsb3QgUHJvXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAocHJpbWFyeUJ1dHRvbkxhYmVsKSB7XG5cdFx0XHRjb25zdCBwcmltYXJ5QnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihtZXNzYWdlQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0XHRwcmltYXJ5QnV0dG9uLmxhYmVsID0gcHJpbWFyeUJ1dHRvbkxhYmVsO1xuXHRcdFx0cHJpbWFyeUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVvdGEtZXJyb3ItYnV0dG9uJyk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHByaW1hcnlCdXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlID8gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC51cGdyYWRlUGxhbicgOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCc7XG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBjb21tYW5kSWQsIGZyb206ICdjaGF0LXJlc3BvbnNlJyB9KTtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gdGhpcy5jb250ZW50LmtpbmQgJiYgISFvdGhlci5lcnJvckRldGFpbHMuaXNRdW90YUV4Y2VlZGVkO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFFdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCLCtCQUErQjtBQUl6RCxNQUFNLElBQUksSUFBSTtBQUVQLElBQU0sd0JBQU4sY0FBb0MsV0FBdUM7QUFBQSxFQUlqRixZQUNDLFNBQ2lCLFNBQ2pCLFVBQ2lCLGdCQUNFLGtCQUNNLHdCQUN4QjtBQUNELFVBQU07QUFOVztBQVFqQixVQUFNLGVBQWUsUUFBUTtBQUM3QixlQUFXLENBQUMsQ0FBQyxjQUFjLGNBQWM7QUFFekMsU0FBSyxVQUFVLEVBQUUsMEJBQTBCO0FBQzNDLFVBQU0sT0FBTyxJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUsTUFBTSxDQUFDO0FBQy9DLFNBQUssVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxPQUFPLENBQUM7QUFFakUsVUFBTSxtQkFBbUIsSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLDJCQUEyQixDQUFDO0FBQ2hGLFVBQU0sa0JBQWtCLEtBQUssVUFBVSxTQUFTLE9BQU8sSUFBSSxlQUFlLGFBQWEsT0FBTyxDQUFDLENBQUM7QUFDaEcsUUFBSSxPQUFPLGtCQUFrQixnQkFBZ0IsT0FBTztBQUVwRCxRQUFJO0FBQ0osWUFBUSx1QkFBdUIsYUFBYTtBQUFBLE1BQzNDLEtBQUssZ0JBQWdCO0FBQUEsTUFDckIsS0FBSyxnQkFBZ0I7QUFBQSxNQUNyQixLQUFLLGdCQUFnQjtBQUFBLE1BQ3JCLEtBQUssZ0JBQWdCO0FBQ3BCLDZCQUFxQixTQUFTLGdCQUFnQixlQUFlO0FBQzdEO0FBQUEsTUFDRCxLQUFLLGdCQUFnQjtBQUNwQiw2QkFBcUIsU0FBUyx1QkFBdUIsK0JBQStCO0FBQ3BGO0FBQUEsSUFDRjtBQUVBLFFBQUksb0JBQW9CO0FBQ3ZCLFlBQU0sZ0JBQWdCLEtBQUssVUFBVSxJQUFJLE9BQU8sa0JBQWtCLEVBQUUsR0FBRyxxQkFBcUIsY0FBYyxLQUFLLENBQUMsQ0FBQztBQUNqSCxvQkFBYyxRQUFRO0FBQ3RCLG9CQUFjLFFBQVEsVUFBVSxJQUFJLHlCQUF5QjtBQUU3RCxXQUFLLFVBQVUsY0FBYyxXQUFXLFlBQVk7QUFDbkQsY0FBTSxZQUFZLHVCQUF1QixnQkFBZ0IsZ0JBQWdCLE9BQU8sc0NBQXNDO0FBQ3RILHlCQUFpQixXQUFnRiwyQkFBMkIsRUFBRSxJQUFJLFdBQVcsTUFBTSxnQkFBZ0IsQ0FBQztBQUNwSyxjQUFNLGVBQWUsZUFBZSxTQUFTO0FBQUEsTUFDOUMsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGVBQWUsT0FBc0M7QUFDcEQsV0FBTyxNQUFNLFNBQVMsS0FBSyxRQUFRLFFBQVEsQ0FBQyxDQUFDLE1BQU0sYUFBYTtBQUFBLEVBQ2pFO0FBQUEsRUFFQSxjQUFjLFlBQStCO0FBQzVDLFNBQUssVUFBVSxVQUFVO0FBQUEsRUFDMUI7QUFDRDtBQTFEYSx3QkFBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
