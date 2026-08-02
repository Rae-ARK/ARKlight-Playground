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
import { renderAsPlaintext } from "../../../../../../../base/browser/markdownRenderer.js";
import { status } from "../../../../../../../base/browser/ui/aria/aria.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { localize } from "../../../../../../../nls.js";
import { AccessibilityWorkbenchSettingId } from "../../../../../accessibility/browser/accessibilityConfiguration.js";
import { ChatProgressSubPart } from "../chatProgressContentPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
const skipHref = "#skip";
let ChatOtherClientToolProgressPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, renderer, announcedToolProgressKeys, instantiationService, configurationService) {
    super(toolInvocation);
    this.codeblocks = [];
    const invocationMessage = typeof toolInvocation.invocationMessage === "string" ? toolInvocation.invocationMessage : renderAsPlaintext(toolInvocation.invocationMessage);
    const content = localize(
      "agentHost.otherClientTool.runningWithSkip",
      "{0} [Skip?](#skip)",
      escapeMarkdownSyntaxTokens(invocationMessage)
    );
    let cancelled = false;
    const rendered = this._register(renderer.render(new MarkdownString(content, { isTrusted: true }), {
      actionHandler: (href) => {
        if (href === skipHref && !cancelled) {
          cancelled = true;
          toolInvocation.otherClientToolCall?.cancel();
        }
      }
    }));
    const skipLink = rendered.element.querySelector(`a[data-href="${skipHref}"]`);
    if (skipLink) {
      skipLink.setAttribute("role", "button");
      skipLink.href = "";
    }
    const announcementKey = `progress:${toolInvocation.toolCallId}`;
    if (announcedToolProgressKeys && configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates) && !announcedToolProgressKeys.has(announcementKey)) {
      announcedToolProgressKeys.add(announcementKey);
      status(localize("agentHost.otherClientTool.runningWithSkip.a11y", "{0} Skip?", invocationMessage));
    }
    this.domNode = this._register(instantiationService.createInstance(
      ChatProgressSubPart,
      rendered.element,
      Codicon.check,
      void 0
    )).domNode;
  }
};
ChatOtherClientToolProgressPart = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService)
], ChatOtherClientToolProgressPart);
export {
  ChatOtherClientToolProgressPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRPdGhlckNsaWVudFRvb2xQcm9ncmVzc1BhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29kZUJsb2NrSW5mbyB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UHJvZ3Jlc3NTdWJQYXJ0IH0gZnJvbSAnLi4vY2hhdFByb2dyZXNzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQuanMnO1xuXG5jb25zdCBza2lwSHJlZiA9ICcjc2tpcCc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0T3RoZXJDbGllbnRUb29sUHJvZ3Jlc3NQYXJ0IGV4dGVuZHMgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQge1xuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29kZWJsb2NrczogSUNoYXRDb2RlQmxvY2tJbmZvW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbixcblx0XHRyZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0YW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5czogU2V0PHN0cmluZz4gfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodG9vbEludm9jYXRpb24pO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSB0eXBlb2YgdG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IHRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlXG5cdFx0XHQ6IHJlbmRlckFzUGxhaW50ZXh0KHRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlKTtcblx0XHRjb25zdCBjb250ZW50ID0gbG9jYWxpemUoXG5cdFx0XHQnYWdlbnRIb3N0Lm90aGVyQ2xpZW50VG9vbC5ydW5uaW5nV2l0aFNraXAnLFxuXHRcdFx0J3swfSBbU2tpcD9dKCNza2lwKScsXG5cdFx0XHRlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhpbnZvY2F0aW9uTWVzc2FnZSksXG5cdFx0KTtcblx0XHRsZXQgY2FuY2VsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLl9yZWdpc3RlcihyZW5kZXJlci5yZW5kZXIobmV3IE1hcmtkb3duU3RyaW5nKGNvbnRlbnQsIHsgaXNUcnVzdGVkOiB0cnVlIH0pLCB7XG5cdFx0XHRhY3Rpb25IYW5kbGVyOiBocmVmID0+IHtcblx0XHRcdFx0aWYgKGhyZWYgPT09IHNraXBIcmVmICYmICFjYW5jZWxsZWQpIHtcblx0XHRcdFx0XHRjYW5jZWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLm90aGVyQ2xpZW50VG9vbENhbGw/LmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBza2lwTGluayA9IHJlbmRlcmVkLmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oYGFbZGF0YS1ocmVmPVwiJHtza2lwSHJlZn1cIl1gKTtcblx0XHRpZiAoc2tpcExpbmspIHtcblx0XHRcdHNraXBMaW5rLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdHNraXBMaW5rLmhyZWYgPSAnJztcblx0XHR9XG5cblx0XHRjb25zdCBhbm5vdW5jZW1lbnRLZXkgPSBgcHJvZ3Jlc3M6JHt0b29sSW52b2NhdGlvbi50b29sQ2FsbElkfWA7XG5cdFx0aWYgKGFubm91bmNlZFRvb2xQcm9ncmVzc0tleXNcblx0XHRcdCYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuVmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMpXG5cdFx0XHQmJiAhYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cy5oYXMoYW5ub3VuY2VtZW50S2V5KSkge1xuXHRcdFx0YW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cy5hZGQoYW5ub3VuY2VtZW50S2V5KTtcblx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnYWdlbnRIb3N0Lm90aGVyQ2xpZW50VG9vbC5ydW5uaW5nV2l0aFNraXAuYTExeScsICd7MH0gU2tpcD8nLCBpbnZvY2F0aW9uTWVzc2FnZSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9tTm9kZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFByb2dyZXNzU3ViUGFydCxcblx0XHRcdHJlbmRlcmVkLmVsZW1lbnQsXG5cdFx0XHRDb2RpY29uLmNoZWNrLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCkpLmRvbU5vZGU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDRCQUE0QixzQkFBc0I7QUFDM0QsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQ0FBcUM7QUFFOUMsTUFBTSxXQUFXO0FBRVYsSUFBTSxrQ0FBTixjQUE4Qyw4QkFBOEI7QUFBQSxFQUlsRixZQUNDLGdCQUNBLFVBQ0EsMkJBQ3VCLHNCQUNBLHNCQUN0QjtBQUNELFVBQU0sY0FBYztBQVRyQixTQUFTLGFBQW1DLENBQUM7QUFXNUMsVUFBTSxvQkFBb0IsT0FBTyxlQUFlLHNCQUFzQixXQUNuRSxlQUFlLG9CQUNmLGtCQUFrQixlQUFlLGlCQUFpQjtBQUNyRCxVQUFNLFVBQVU7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0EsMkJBQTJCLGlCQUFpQjtBQUFBLElBQzdDO0FBQ0EsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sV0FBVyxLQUFLLFVBQVUsU0FBUyxPQUFPLElBQUksZUFBZSxTQUFTLEVBQUUsV0FBVyxLQUFLLENBQUMsR0FBRztBQUFBLE1BQ2pHLGVBQWUsVUFBUTtBQUN0QixZQUFJLFNBQVMsWUFBWSxDQUFDLFdBQVc7QUFDcEMsc0JBQVk7QUFDWix5QkFBZSxxQkFBcUIsT0FBTztBQUFBLFFBQzVDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxXQUFXLFNBQVMsUUFBUSxjQUFpQyxnQkFBZ0IsUUFBUSxJQUFJO0FBQy9GLFFBQUksVUFBVTtBQUNiLGVBQVMsYUFBYSxRQUFRLFFBQVE7QUFDdEMsZUFBUyxPQUFPO0FBQUEsSUFDakI7QUFFQSxVQUFNLGtCQUFrQixZQUFZLGVBQWUsVUFBVTtBQUM3RCxRQUFJLDZCQUNBLHFCQUFxQixTQUFTLGdDQUFnQywwQkFBMEIsS0FDeEYsQ0FBQywwQkFBMEIsSUFBSSxlQUFlLEdBQUc7QUFDcEQsZ0NBQTBCLElBQUksZUFBZTtBQUM3QyxhQUFPLFNBQVMsa0RBQWtELGFBQWEsaUJBQWlCLENBQUM7QUFBQSxJQUNsRztBQUVBLFNBQUssVUFBVSxLQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFDbEQ7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLEVBQUU7QUFBQSxFQUNKO0FBQ0Q7QUFwRGEsa0NBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
