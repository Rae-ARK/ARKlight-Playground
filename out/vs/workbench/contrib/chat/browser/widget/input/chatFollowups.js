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
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { formatChatQuestion } from "../../../common/requestParser/chatParserTypes.js";
const $ = dom.$;
let ChatFollowups = class extends Disposable {
  constructor(container, followups, location, options, clickHandler, chatAgentService) {
    super();
    this.location = location;
    this.options = options;
    this.clickHandler = clickHandler;
    this.chatAgentService = chatAgentService;
    const followupsContainer = dom.append(container, $(".interactive-session-followups"));
    followups.forEach((followup) => this.renderFollowup(followupsContainer, followup));
  }
  renderFollowup(container, followup) {
    if (!this.chatAgentService.getDefaultAgent(this.location)) {
      return;
    }
    const tooltipPrefix = formatChatQuestion(this.chatAgentService, this.location, "", followup.agentId, followup.subCommand);
    if (tooltipPrefix === void 0) {
      return;
    }
    const baseTitle = followup.kind === "reply" ? followup.title || followup.message : followup.title;
    const message = followup.kind === "reply" ? followup.message : followup.title;
    const tooltip = (tooltipPrefix + (followup.tooltip || message)).trim();
    const button = this._register(new Button(container, { ...this.options, title: tooltip }));
    if (followup.kind === "reply") {
      button.element.classList.add("interactive-followup-reply");
    } else if (followup.kind === "command") {
      button.element.classList.add("interactive-followup-command");
    }
    button.element.ariaLabel = localize("followUpAriaLabel", "Follow up question: {0}", baseTitle);
    button.label = new MarkdownString(baseTitle);
    this._register(button.onDidClick(() => this.clickHandler(followup)));
  }
};
ChatFollowups = __decorateClass([
  __decorateParam(5, IChatAgentService)
], ChatFollowups);
export {
  ChatFollowups
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdEZvbGxvd3Vwcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgSUJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRDaGF0UXVlc3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRGb2xsb3d1cCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBjbGFzcyBDaGF0Rm9sbG93dXBzPFQgZXh0ZW5kcyBJQ2hhdEZvbGxvd3VwPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGZvbGxvd3VwczogVFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUJ1dHRvblN0eWxlcyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNsaWNrSGFuZGxlcjogKGZvbGxvd3VwOiBUKSA9PiB2b2lkLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBmb2xsb3d1cHNDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmludGVyYWN0aXZlLXNlc3Npb24tZm9sbG93dXBzJykpO1xuXHRcdGZvbGxvd3Vwcy5mb3JFYWNoKGZvbGxvd3VwID0+IHRoaXMucmVuZGVyRm9sbG93dXAoZm9sbG93dXBzQ29udGFpbmVyLCBmb2xsb3d1cCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGb2xsb3d1cChjb250YWluZXI6IEhUTUxFbGVtZW50LCBmb2xsb3d1cDogVCk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KHRoaXMubG9jYXRpb24pKSB7XG5cdFx0XHQvLyBObyBkZWZhdWx0IGFnZW50IHlldCwgd2hpY2ggYWZmZWN0cyBob3cgZm9sbG93dXBzIGFyZSByZW5kZXJlZCwgc28gY2FuJ3QgcmVuZGVyIHRoaXMgeWV0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9vbHRpcFByZWZpeCA9IGZvcm1hdENoYXRRdWVzdGlvbih0aGlzLmNoYXRBZ2VudFNlcnZpY2UsIHRoaXMubG9jYXRpb24sICcnLCBmb2xsb3d1cC5hZ2VudElkLCBmb2xsb3d1cC5zdWJDb21tYW5kKTtcblx0XHRpZiAodG9vbHRpcFByZWZpeCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFzZVRpdGxlID0gZm9sbG93dXAua2luZCA9PT0gJ3JlcGx5JyA/XG5cdFx0XHQoZm9sbG93dXAudGl0bGUgfHwgZm9sbG93dXAubWVzc2FnZSlcblx0XHRcdDogZm9sbG93dXAudGl0bGU7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGZvbGxvd3VwLmtpbmQgPT09ICdyZXBseScgPyBmb2xsb3d1cC5tZXNzYWdlIDogZm9sbG93dXAudGl0bGU7XG5cdFx0Y29uc3QgdG9vbHRpcCA9ICh0b29sdGlwUHJlZml4ICtcblx0XHRcdChmb2xsb3d1cC50b29sdGlwIHx8IG1lc3NhZ2UpKS50cmltKCk7XG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihjb250YWluZXIsIHsgLi4udGhpcy5vcHRpb25zLCB0aXRsZTogdG9vbHRpcCB9KSk7XG5cdFx0aWYgKGZvbGxvd3VwLmtpbmQgPT09ICdyZXBseScpIHtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludGVyYWN0aXZlLWZvbGxvd3VwLXJlcGx5Jyk7XG5cdFx0fSBlbHNlIGlmIChmb2xsb3d1cC5raW5kID09PSAnY29tbWFuZCcpIHtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludGVyYWN0aXZlLWZvbGxvd3VwLWNvbW1hbmQnKTtcblx0XHR9XG5cdFx0YnV0dG9uLmVsZW1lbnQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ2ZvbGxvd1VwQXJpYUxhYmVsJywgXCJGb2xsb3cgdXAgcXVlc3Rpb246IHswfVwiLCBiYXNlVGl0bGUpO1xuXHRcdGJ1dHRvbi5sYWJlbCA9IG5ldyBNYXJrZG93blN0cmluZyhiYXNlVGl0bGUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5jbGlja0hhbmRsZXIoZm9sbG93dXApKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFJbkMsTUFBTSxJQUFJLElBQUk7QUFFUCxJQUFNLGdCQUFOLGNBQXFELFdBQVc7QUFBQSxFQUN0RSxZQUNDLFdBQ0EsV0FDaUIsVUFDQSxTQUNBLGNBQ21CLGtCQUNuQztBQUNELFVBQU07QUFMVztBQUNBO0FBQ0E7QUFDbUI7QUFJcEMsVUFBTSxxQkFBcUIsSUFBSSxPQUFPLFdBQVcsRUFBRSxnQ0FBZ0MsQ0FBQztBQUNwRixjQUFVLFFBQVEsY0FBWSxLQUFLLGVBQWUsb0JBQW9CLFFBQVEsQ0FBQztBQUFBLEVBQ2hGO0FBQUEsRUFFUSxlQUFlLFdBQXdCLFVBQW1CO0FBRWpFLFFBQUksQ0FBQyxLQUFLLGlCQUFpQixnQkFBZ0IsS0FBSyxRQUFRLEdBQUc7QUFFMUQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxnQkFBZ0IsbUJBQW1CLEtBQUssa0JBQWtCLEtBQUssVUFBVSxJQUFJLFNBQVMsU0FBUyxTQUFTLFVBQVU7QUFDeEgsUUFBSSxrQkFBa0IsUUFBVztBQUNoQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksU0FBUyxTQUFTLFVBQ2xDLFNBQVMsU0FBUyxTQUFTLFVBQzFCLFNBQVM7QUFDWixVQUFNLFVBQVUsU0FBUyxTQUFTLFVBQVUsU0FBUyxVQUFVLFNBQVM7QUFDeEUsVUFBTSxXQUFXLGlCQUNmLFNBQVMsV0FBVyxVQUFVLEtBQUs7QUFDckMsVUFBTSxTQUFTLEtBQUssVUFBVSxJQUFJLE9BQU8sV0FBVyxFQUFFLEdBQUcsS0FBSyxTQUFTLE9BQU8sUUFBUSxDQUFDLENBQUM7QUFDeEYsUUFBSSxTQUFTLFNBQVMsU0FBUztBQUM5QixhQUFPLFFBQVEsVUFBVSxJQUFJLDRCQUE0QjtBQUFBLElBQzFELFdBQVcsU0FBUyxTQUFTLFdBQVc7QUFDdkMsYUFBTyxRQUFRLFVBQVUsSUFBSSw4QkFBOEI7QUFBQSxJQUM1RDtBQUNBLFdBQU8sUUFBUSxZQUFZLFNBQVMscUJBQXFCLDJCQUEyQixTQUFTO0FBQzdGLFdBQU8sUUFBUSxJQUFJLGVBQWUsU0FBUztBQUUzQyxTQUFLLFVBQVUsT0FBTyxXQUFXLE1BQU0sS0FBSyxhQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDcEU7QUFDRDtBQTVDYSxnQkFBTjtBQUFBLEVBT0o7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
