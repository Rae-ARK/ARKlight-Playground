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
import "./media/chatPullRequestContent.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { addDisposableListener } from "../../../../../../base/browser/dom.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
let ChatPullRequestContentPart = class extends Disposable {
  constructor(pullRequestContent, commandService) {
    super();
    this.pullRequestContent = pullRequestContent;
    this.commandService = commandService;
    this.domNode = dom.$(".chat-pull-request-content-part");
    const container = dom.append(this.domNode, dom.$(".container"));
    const contentContainer = dom.append(container, dom.$(".content-container"));
    const titleContainer = dom.append(contentContainer, dom.$(".title-container"));
    const icon = dom.append(titleContainer, dom.$(".icon"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitPullRequest));
    const titleLink = dom.append(titleContainer, dom.$("a.title"));
    titleLink.textContent = `${this.pullRequestContent.title} - ${this.pullRequestContent.author}`;
    if (this.pullRequestContent.uri) {
      titleLink.href = this.pullRequestContent.uri?.toString();
    }
    this._register(addDisposableListener(titleLink, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(this.pullRequestContent.command.id, ...this.pullRequestContent.command.arguments ?? []);
    }));
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "pullRequest";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatPullRequestContentPart = __decorateClass([
  __decorateParam(1, ICommandService)
], ChatPullRequestContentPart);
export {
  ChatPullRequestContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UHVsbFJlcXVlc3RDb250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0UHVsbFJlcXVlc3RDb250ZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRQdWxsUmVxdWVzdENvbnRlbnRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwdWxsUmVxdWVzdENvbnRlbnQ6IElDaGF0UHVsbFJlcXVlc3RDb250ZW50LFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuY2hhdC1wdWxsLXJlcXVlc3QtY29udGVudC1wYXJ0Jyk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcuY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jb250ZW50LWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IHRpdGxlQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250ZW50Q29udGFpbmVyLCBkb20uJCgnLnRpdGxlLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZCh0aXRsZUNvbnRhaW5lciwgZG9tLiQoJy5pY29uJykpO1xuXHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmdpdFB1bGxSZXF1ZXN0KSk7XG5cdFx0Y29uc3QgdGl0bGVMaW5rOiBIVE1MQW5jaG9yRWxlbWVudCA9IGRvbS5hcHBlbmQodGl0bGVDb250YWluZXIsIGRvbS4kKCdhLnRpdGxlJykpO1xuXHRcdHRpdGxlTGluay50ZXh0Q29udGVudCA9IGAke3RoaXMucHVsbFJlcXVlc3RDb250ZW50LnRpdGxlfSAtICR7dGhpcy5wdWxsUmVxdWVzdENvbnRlbnQuYXV0aG9yfWA7XG5cdFx0aWYgKHRoaXMucHVsbFJlcXVlc3RDb250ZW50LnVyaSkge1xuXHRcdFx0dGl0bGVMaW5rLmhyZWYgPSB0aGlzLnB1bGxSZXF1ZXN0Q29udGVudC51cmk/LnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aXRsZUxpbmssICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh0aGlzLnB1bGxSZXF1ZXN0Q29udGVudC5jb21tYW5kLmlkLCAuLi4odGhpcy5wdWxsUmVxdWVzdENvbnRlbnQuY29tbWFuZC5hcmd1bWVudHMgPz8gW10pKTtcblx0XHR9KSk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIGZvbGxvd2luZ0NvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10sIGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAncHVsbFJlcXVlc3QnO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBK0I7QUFLeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBRXpCLElBQU0sNkJBQU4sY0FBeUMsV0FBdUM7QUFBQSxFQUd0RixZQUNrQixvQkFDaUIsZ0JBQWlDO0FBQ25FLFVBQU07QUFGVztBQUNpQjtBQUdsQyxTQUFLLFVBQVUsSUFBSSxFQUFFLGlDQUFpQztBQUN0RCxVQUFNLFlBQVksSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsWUFBWSxDQUFDO0FBQzlELFVBQU0sbUJBQW1CLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxvQkFBb0IsQ0FBQztBQUUxRSxVQUFNLGlCQUFpQixJQUFJLE9BQU8sa0JBQWtCLElBQUksRUFBRSxrQkFBa0IsQ0FBQztBQUM3RSxVQUFNLE9BQU8sSUFBSSxPQUFPLGdCQUFnQixJQUFJLEVBQUUsT0FBTyxDQUFDO0FBQ3RELFNBQUssVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxjQUFjLENBQUM7QUFDeEUsVUFBTSxZQUErQixJQUFJLE9BQU8sZ0JBQWdCLElBQUksRUFBRSxTQUFTLENBQUM7QUFDaEYsY0FBVSxjQUFjLEdBQUcsS0FBSyxtQkFBbUIsS0FBSyxNQUFNLEtBQUssbUJBQW1CLE1BQU07QUFDNUYsUUFBSSxLQUFLLG1CQUFtQixLQUFLO0FBQ2hDLGdCQUFVLE9BQU8sS0FBSyxtQkFBbUIsS0FBSyxTQUFTO0FBQUEsSUFDeEQ7QUFDQSxTQUFLLFVBQVUsc0JBQXNCLFdBQVcsU0FBUyxDQUFDLE1BQU07QUFDL0QsUUFBRSxlQUFlO0FBQ2pCLFFBQUUsZ0JBQWdCO0FBQ2xCLFdBQUssZUFBZSxlQUFlLEtBQUssbUJBQW1CLFFBQVEsSUFBSSxHQUFJLEtBQUssbUJBQW1CLFFBQVEsYUFBYSxDQUFDLENBQUU7QUFBQSxJQUM1SCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxlQUFlLE9BQTZCLGtCQUEwQyxTQUFnQztBQUNySCxXQUFPLE1BQU0sU0FBUztBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxjQUFjLFlBQStCO0FBQzVDLFNBQUssVUFBVSxVQUFVO0FBQUEsRUFDMUI7QUFDRDtBQWxDYSw2QkFBTjtBQUFBLEVBS0o7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
