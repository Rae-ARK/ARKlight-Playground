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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../../../nls.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { PromptsConfig } from "../../../common/promptSyntax/config/config.js";
import "./media/chatDisabledClaudeHooksContent.css";
let ChatDisabledClaudeHooksContentPart = class extends Disposable {
  constructor(_context, _openerService, _markdownRendererService) {
    super();
    this._openerService = _openerService;
    this._markdownRendererService = _markdownRendererService;
    this.domNode = dom.$(".chat-disabled-claude-hooks");
    const messageContainer = dom.$(".chat-disabled-claude-hooks-message");
    const icon = dom.$(".chat-disabled-claude-hooks-icon");
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    const enableLink = createMarkdownCommandLink({
      text: localize("chat.disabledClaudeHooks.enableLink", "Enable"),
      id: "workbench.action.openSettings",
      arguments: [PromptsConfig.USE_CLAUDE_HOOKS],
      tooltip: localize("chat.disabledClaudeHooks.enableLink.tooltip", "Open settings to enable Claude Code hooks")
    });
    const message = localize("chat.disabledClaudeHooks.message", "Claude Code hooks are available for this workspace. {0}", enableLink);
    const content = new MarkdownString(message, { isTrusted: true });
    const rendered = this._register(this._markdownRendererService.render(content, {
      actionHandler: (href) => openLinkFromMarkdown(this._openerService, href, true)
    }));
    messageContainer.appendChild(icon);
    messageContainer.appendChild(rendered.element);
    this.domNode.appendChild(messageContainer);
  }
  hasSameContent(other) {
    return other.kind === "disabledClaudeHooks";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatDisabledClaudeHooksContentPart = __decorateClass([
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IMarkdownRendererService)
], ChatDisabledClaudeHooksContentPart);
export {
  ChatDisabledClaudeHooksContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0RGlzYWJsZWRDbGF1ZGVIb29rc0NvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmssIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgb3BlbkxpbmtGcm9tTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IFByb21wdHNDb25maWcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9jb25maWcuanMnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXREaXNhYmxlZENsYXVkZUhvb2tzQ29udGVudC5jc3MnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdF9jb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy5jaGF0LWRpc2FibGVkLWNsYXVkZS1ob29rcycpO1xuXHRcdGNvbnN0IG1lc3NhZ2VDb250YWluZXIgPSBkb20uJCgnLmNoYXQtZGlzYWJsZWQtY2xhdWRlLWhvb2tzLW1lc3NhZ2UnKTtcblxuXHRcdGNvbnN0IGljb24gPSBkb20uJCgnLmNoYXQtZGlzYWJsZWQtY2xhdWRlLWhvb2tzLWljb24nKTtcblx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5pbmZvKSk7XG5cblx0XHRjb25zdCBlbmFibGVMaW5rID0gY3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7XG5cdFx0XHR0ZXh0OiBsb2NhbGl6ZSgnY2hhdC5kaXNhYmxlZENsYXVkZUhvb2tzLmVuYWJsZUxpbmsnLCBcIkVuYWJsZVwiKSxcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHRcdFx0YXJndW1lbnRzOiBbUHJvbXB0c0NvbmZpZy5VU0VfQ0xBVURFX0hPT0tTXSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjaGF0LmRpc2FibGVkQ2xhdWRlSG9va3MuZW5hYmxlTGluay50b29sdGlwJywgXCJPcGVuIHNldHRpbmdzIHRvIGVuYWJsZSBDbGF1ZGUgQ29kZSBob29rc1wiKSxcblx0XHR9KTtcblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ2NoYXQuZGlzYWJsZWRDbGF1ZGVIb29rcy5tZXNzYWdlJywgXCJDbGF1ZGUgQ29kZSBob29rcyBhcmUgYXZhaWxhYmxlIGZvciB0aGlzIHdvcmtzcGFjZS4gezB9XCIsIGVuYWJsZUxpbmspO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcobWVzc2FnZSwgeyBpc1RydXN0ZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihjb250ZW50LCB7XG5cdFx0XHRhY3Rpb25IYW5kbGVyOiAoaHJlZikgPT4gb3BlbkxpbmtGcm9tTWFya2Rvd24odGhpcy5fb3BlbmVyU2VydmljZSwgaHJlZiwgdHJ1ZSksXG5cdFx0fSkpO1xuXG5cdFx0bWVzc2FnZUNvbnRhaW5lci5hcHBlbmRDaGlsZChpY29uKTtcblx0XHRtZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChtZXNzYWdlQ29udGFpbmVyKTtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAnZGlzYWJsZWRDbGF1ZGVIb29rcyc7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQixzQkFBc0I7QUFDMUQsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywwQkFBMEIsNEJBQTRCO0FBQy9ELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMscUJBQXFCO0FBQzlCLE9BQU87QUFFQSxJQUFNLHFDQUFOLGNBQWlELFdBQXVDO0FBQUEsRUFHOUYsWUFDQyxVQUNpQyxnQkFDVSwwQkFDMUM7QUFDRCxVQUFNO0FBSDJCO0FBQ1U7QUFJM0MsU0FBSyxVQUFVLElBQUksRUFBRSw2QkFBNkI7QUFDbEQsVUFBTSxtQkFBbUIsSUFBSSxFQUFFLHFDQUFxQztBQUVwRSxVQUFNLE9BQU8sSUFBSSxFQUFFLGtDQUFrQztBQUNyRCxTQUFLLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsSUFBSSxDQUFDO0FBRTlELFVBQU0sYUFBYSwwQkFBMEI7QUFBQSxNQUM1QyxNQUFNLFNBQVMsdUNBQXVDLFFBQVE7QUFBQSxNQUM5RCxJQUFJO0FBQUEsTUFDSixXQUFXLENBQUMsY0FBYyxnQkFBZ0I7QUFBQSxNQUMxQyxTQUFTLFNBQVMsK0NBQStDLDJDQUEyQztBQUFBLElBQzdHLENBQUM7QUFDRCxVQUFNLFVBQVUsU0FBUyxvQ0FBb0MsMkRBQTJELFVBQVU7QUFDbEksVUFBTSxVQUFVLElBQUksZUFBZSxTQUFTLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFFL0QsVUFBTSxXQUFXLEtBQUssVUFBVSxLQUFLLHlCQUF5QixPQUFPLFNBQVM7QUFBQSxNQUM3RSxlQUFlLENBQUMsU0FBUyxxQkFBcUIsS0FBSyxnQkFBZ0IsTUFBTSxJQUFJO0FBQUEsSUFDOUUsQ0FBQyxDQUFDO0FBRUYscUJBQWlCLFlBQVksSUFBSTtBQUNqQyxxQkFBaUIsWUFBWSxTQUFTLE9BQU87QUFDN0MsU0FBSyxRQUFRLFlBQVksZ0JBQWdCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLGVBQWUsT0FBc0M7QUFDcEQsV0FBTyxNQUFNLFNBQVM7QUFBQSxFQUN2QjtBQUFBLEVBRUEsY0FBYyxZQUErQjtBQUM1QyxTQUFLLFVBQVUsVUFBVTtBQUFBLEVBQzFCO0FBQ0Q7QUF6Q2EscUNBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
