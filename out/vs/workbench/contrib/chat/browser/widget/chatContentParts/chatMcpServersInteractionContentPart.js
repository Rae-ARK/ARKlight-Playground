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
import { RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { escapeMarkdownSyntaxTokens, createMarkdownCommandLink, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../../../nls.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { McpCommandIds } from "../../../../mcp/common/mcpCommandIds.js";
import { IMcpService } from "../../../../mcp/common/mcpTypes.js";
import { startServerAndWaitForLiveTools } from "../../../../mcp/common/mcpTypesUtils.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatProgressContentPart } from "./chatProgressContentPart.js";
import "./media/chatMcpServersInteractionContent.css";
let ChatMcpServersInteractionContentPart = class extends Disposable {
  constructor(data, context, mcpService, instantiationService, _openerService, _markdownRendererService) {
    super();
    this.data = data;
    this.context = context;
    this.mcpService = mcpService;
    this.instantiationService = instantiationService;
    this._openerService = _openerService;
    this._markdownRendererService = _markdownRendererService;
    this.interactionMd = this._register(new MutableDisposable());
    this.showSpecificServersScheduler = this._register(new RunOnceScheduler(() => this.updateDetailedProgress(this.data.state.get()), 2500));
    this.previousParts = new Lazy(() => {
      if (!isResponseVM(this.context.element)) {
        return [];
      }
      return this.context.element.session.getItems().filter((r, i) => isResponseVM(r) && i < this.context.elementIndex).flatMap((i) => i.response.value.filter((c) => c.kind === "mcpServersStarting")).map((p) => p.state?.get());
    });
    this.domNode = dom.$(".chat-mcp-servers-interaction");
    if (data.state) {
      this._register(autorun((reader) => {
        const state = data.state.read(reader);
        this.updateForState(state);
      }));
    }
  }
  updateForState(state) {
    if (!state.working) {
      this.workingProgressPart?.domNode.remove();
      this.workingProgressPart = void 0;
      this.showSpecificServersScheduler.cancel();
    } else if (!this.workingProgressPart) {
      if (!this.showSpecificServersScheduler.isScheduled()) {
        this.showSpecificServersScheduler.schedule();
      }
    } else if (this.workingProgressPart) {
      this.updateDetailedProgress(state);
    }
    const requiringInteraction = state.serversRequiringInteraction.filter((s) => {
      if (this.data.didStartServerIds?.includes(s.id)) {
        return false;
      }
      if (this.previousParts.value.some((p) => p?.serversRequiringInteraction.some((s2) => s.id === s2.id))) {
        return false;
      }
      return true;
    });
    if (requiringInteraction.length > 0) {
      if (!this.interactionMd.value) {
        this.renderInteractionRequired(requiringInteraction);
      } else {
        this.updateInteractionRequired(this.interactionMd.value.element, requiringInteraction);
      }
    } else if (requiringInteraction.length === 0 && this.interactionContainer) {
      this.interactionContainer.remove();
      this.interactionContainer = void 0;
    }
  }
  createServerCommandLinks(servers) {
    return servers.map((s) => createMarkdownCommandLink({
      text: "`" + escapeMarkdownSyntaxTokens(s.label) + "`",
      id: McpCommandIds.ServerOptions,
      arguments: [s.id],
      tooltip: localize("mcp.server.options.tooltip", "Show options for {0}", s.label)
    }, false)).join(", ");
  }
  updateDetailedProgress(state) {
    const skipText = createMarkdownCommandLink({
      text: localize("mcp.skip.link", "Skip?"),
      id: McpCommandIds.SkipCurrentAutostart,
      tooltip: localize("mcp.skip.tooltip", "Skip starting this MCP server")
    });
    let content;
    if (state.starting.length === 0) {
      content = new MarkdownString(void 0, { isTrusted: true }).appendText(localize("mcp.working.mcp", "Activating MCP extensions...") + " ").appendMarkdown(skipText);
    } else {
      const serverLinks = this.createServerCommandLinks(state.starting);
      content = new MarkdownString(void 0, { isTrusted: true }).appendMarkdown(localize("mcp.starting.servers", "Starting MCP servers {0}...", serverLinks) + " ").appendMarkdown(skipText);
    }
    if (this.workingProgressPart) {
      this.workingProgressPart.updateMessage(content);
    } else {
      this.workingProgressPart = this._register(this.instantiationService.createInstance(
        ChatProgressContentPart,
        { kind: "progressMessage", content },
        this._markdownRendererService,
        this.context,
        true,
        // forceShowSpinner
        true,
        // forceShowMessage
        void 0,
        // icon
        void 0,
        // toolInvocation
        false
        // no shimmer for now
      ));
      this.domNode.appendChild(this.workingProgressPart.domNode);
    }
  }
  renderInteractionRequired(serversRequiringInteraction) {
    this.interactionContainer = dom.$(".chat-mcp-servers-interaction-hint");
    const messageContainer = dom.$(".chat-mcp-servers-message");
    const icon = dom.$(".chat-mcp-servers-icon");
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.mcp));
    const { messageMd } = this.createInteractionMessage(serversRequiringInteraction);
    messageContainer.appendChild(icon);
    messageContainer.appendChild(messageMd.element);
    this.interactionContainer.appendChild(messageContainer);
    this.domNode.prepend(this.interactionContainer);
  }
  updateInteractionRequired(oldElement, serversRequiringInteraction) {
    const { messageMd } = this.createInteractionMessage(serversRequiringInteraction);
    oldElement.replaceWith(messageMd.element);
  }
  createInteractionMessage(serversRequiringInteraction) {
    const count = serversRequiringInteraction.length;
    const links = this.createServerCommandLinks(serversRequiringInteraction);
    const content = count === 1 ? localize("mcp.start.single", "The MCP server {0} may have new tools and requires interaction to start. [Start it now?]({1})", links, "#start") : localize("mcp.start.multiple", "The MCP servers {0} may have new tools and require interaction to start. [Start them now?]({1})", links, "#start");
    const str = new MarkdownString(content, { isTrusted: true });
    const messageMd = this.interactionMd.value = this._markdownRendererService.render(str, {
      actionHandler: (content2) => {
        if (!content2.startsWith("command:")) {
          this._start(startLink);
          return Promise.resolve(true);
        }
        return openLinkFromMarkdown(this._openerService, content2, true);
      }
    });
    const startLink = [...messageMd.element.querySelectorAll("a")].find((a) => !a.getAttribute("data-href")?.startsWith("command:"));
    if (!startLink) {
      return { messageMd, startLink: void 0 };
    }
    startLink.setAttribute("role", "button");
    startLink.href = "";
    return { messageMd, startLink };
  }
  async _start(startLink) {
    startLink.style.pointerEvents = "none";
    startLink.style.opacity = "0.7";
    try {
      if (!this.data.state) {
        return;
      }
      const state = this.data.state.get();
      const serversToStart = state.serversRequiringInteraction;
      for (let i = 0; i < serversToStart.length; i++) {
        const serverInfo = serversToStart[i];
        startLink.textContent = localize("mcp.starting", "Starting {0}...", serverInfo.label);
        const server = this.mcpService.servers.get().find((s) => s.definition.id === serverInfo.id);
        if (server) {
          await startServerAndWaitForLiveTools(server, { promptType: "all-untrusted" });
          this.data.didStartServerIds ??= [];
          this.data.didStartServerIds.push(serverInfo.id);
        }
      }
      if (this.interactionContainer) {
        this.interactionContainer.remove();
        this.interactionContainer = void 0;
      }
    } catch (error) {
      startLink.style.pointerEvents = "";
      startLink.style.opacity = "";
      startLink.textContent = "Start now?";
    }
  }
  hasSameContent(other) {
    return other.kind === "mcpServersStarting";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatMcpServersInteractionContentPart = __decorateClass([
  __decorateParam(2, IMcpService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IMarkdownRendererService)
], ChatMcpServersInteractionContentPart);
export {
  ChatMcpServersInteractionContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWNwU2VydmVyc0ludGVyYWN0aW9uQ29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zLCBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBvcGVuTGlua0Zyb21NYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJUmVuZGVyZWRNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBNY3BDb21tYW5kSWRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BDb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IElBdXRvc3RhcnRSZXN1bHQsIElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBzdGFydFNlcnZlckFuZFdhaXRGb3JMaXZlVG9vbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9tY3AvY29tbW9uL21jcFR5cGVzVXRpbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmcsIElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nU2VyaWFsaXplZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdFByb2dyZXNzQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRQcm9ncmVzc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0TWNwU2VydmVyc0ludGVyYWN0aW9uQ29udGVudC5jc3MnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdE1jcFNlcnZlcnNJbnRlcmFjdGlvbkNvbnRlbnRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSB3b3JraW5nUHJvZ3Jlc3NQYXJ0OiBDaGF0UHJvZ3Jlc3NDb250ZW50UGFydCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpbnRlcmFjdGlvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW50ZXJhY3Rpb25NZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVuZGVyZWRNYXJrZG93bj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2hvd1NwZWNpZmljU2VydmVyc1NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMudXBkYXRlRGV0YWlsZWRQcm9ncmVzcyh0aGlzLmRhdGEuc3RhdGUhLmdldCgpKSwgMjUwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpb3VzUGFydHMgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0aWYgKCFpc1Jlc3BvbnNlVk0odGhpcy5jb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb24uZ2V0SXRlbXMoKVxuXHRcdFx0LmZpbHRlcigociwgaSk6IHIgaXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCA9PiBpc1Jlc3BvbnNlVk0ocikgJiYgaSA8IHRoaXMuY29udGV4dC5lbGVtZW50SW5kZXgpXG5cdFx0XHQuZmxhdE1hcChpID0+IGkucmVzcG9uc2UudmFsdWUuZmlsdGVyKGMgPT4gYy5raW5kID09PSAnbWNwU2VydmVyc1N0YXJ0aW5nJykpXG5cdFx0XHQubWFwKHAgPT4gcC5zdGF0ZT8uZ2V0KCkpO1xuXHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRhdGE6IElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nIHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTZXJpYWxpemVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuY2hhdC1tY3Atc2VydmVycy1pbnRlcmFjdGlvbicpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGF1dG9zdGFydCBzdGF0ZSBjaGFuZ2VzIGlmIGF2YWlsYWJsZVxuXHRcdGlmIChkYXRhLnN0YXRlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gZGF0YS5zdGF0ZSEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZvclN0YXRlKHN0YXRlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZvclN0YXRlKHN0YXRlOiBJQXV0b3N0YXJ0UmVzdWx0KTogdm9pZCB7XG5cdFx0aWYgKCFzdGF0ZS53b3JraW5nKSB7XG5cdFx0XHR0aGlzLndvcmtpbmdQcm9ncmVzc1BhcnQ/LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLndvcmtpbmdQcm9ncmVzc1BhcnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnNob3dTcGVjaWZpY1NlcnZlcnNTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0fSBlbHNlIGlmICghdGhpcy53b3JraW5nUHJvZ3Jlc3NQYXJ0KSB7XG5cdFx0XHRpZiAoIXRoaXMuc2hvd1NwZWNpZmljU2VydmVyc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuc2hvd1NwZWNpZmljU2VydmVyc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy53b3JraW5nUHJvZ3Jlc3NQYXJ0KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZURldGFpbGVkUHJvZ3Jlc3Moc3RhdGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVpcmluZ0ludGVyYWN0aW9uID0gc3RhdGUuc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uLmZpbHRlcihzID0+IHtcblx0XHRcdC8vIGRvbid0IG5vdGUgaW50ZXJhY3Rpb24gZm9yIGEgc2VydmVyIHdlIGFscmVhZHkgc3RhcnRlZFxuXHRcdFx0aWYgKHRoaXMuZGF0YS5kaWRTdGFydFNlcnZlcklkcz8uaW5jbHVkZXMocy5pZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBkb24ndCBub3RlIGludGVyYWN0aW9uIGZvciBhIHNlcnZlciB3ZSBwcmV2aW91c2x5IG5vdGVkIGludGVyYWN0aW9uIGZvclxuXHRcdFx0aWYgKHRoaXMucHJldmlvdXNQYXJ0cy52YWx1ZS5zb21lKHAgPT4gcD8uc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uLnNvbWUoczIgPT4gcy5pZCA9PT0gczIuaWQpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHJlcXVpcmluZ0ludGVyYWN0aW9uLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICghdGhpcy5pbnRlcmFjdGlvbk1kLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVySW50ZXJhY3Rpb25SZXF1aXJlZChyZXF1aXJpbmdJbnRlcmFjdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUludGVyYWN0aW9uUmVxdWlyZWQodGhpcy5pbnRlcmFjdGlvbk1kLnZhbHVlLmVsZW1lbnQsIHJlcXVpcmluZ0ludGVyYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHJlcXVpcmluZ0ludGVyYWN0aW9uLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmludGVyYWN0aW9uQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmludGVyYWN0aW9uQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlcnZlckNvbW1hbmRMaW5rcyhzZXJ2ZXJzOiBBcnJheTx7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiBzZXJ2ZXJzLm1hcChzID0+IGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmsoe1xuXHRcdFx0dGV4dDogJ2AnICsgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMocy5sYWJlbCkgKyAnYCcsXG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TZXJ2ZXJPcHRpb25zLFxuXHRcdFx0YXJndW1lbnRzOiBbcy5pZF0sXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbWNwLnNlcnZlci5vcHRpb25zLnRvb2x0aXAnLCAnU2hvdyBvcHRpb25zIGZvciB7MH0nLCBzLmxhYmVsKSxcblx0XHR9LCBmYWxzZSkpLmpvaW4oJywgJyk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURldGFpbGVkUHJvZ3Jlc3Moc3RhdGU6IElBdXRvc3RhcnRSZXN1bHQpOiB2b2lkIHtcblx0XHRjb25zdCBza2lwVGV4dCA9IGNyZWF0ZU1hcmtkb3duQ29tbWFuZExpbmsoe1xuXHRcdFx0dGV4dDogbG9jYWxpemUoJ21jcC5za2lwLmxpbmsnLCAnU2tpcD8nKSxcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNraXBDdXJyZW50QXV0b3N0YXJ0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21jcC5za2lwLnRvb2x0aXAnLCAnU2tpcCBzdGFydGluZyB0aGlzIE1DUCBzZXJ2ZXInKSxcblx0XHR9KTtcblxuXHRcdGxldCBjb250ZW50OiBNYXJrZG93blN0cmluZztcblx0XHRpZiAoc3RhdGUuc3RhcnRpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBpc1RydXN0ZWQ6IHRydWUgfSkuYXBwZW5kVGV4dChsb2NhbGl6ZSgnbWNwLndvcmtpbmcubWNwJywgJ0FjdGl2YXRpbmcgTUNQIGV4dGVuc2lvbnMuLi4nKSArICcgJykuYXBwZW5kTWFya2Rvd24oc2tpcFRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBVcGRhdGUgdG8gc2hvdyBzcGVjaWZpYyBzZXJ2ZXIgbmFtZXMgYXMgY29tbWFuZCBsaW5rc1xuXHRcdFx0Y29uc3Qgc2VydmVyTGlua3MgPSB0aGlzLmNyZWF0ZVNlcnZlckNvbW1hbmRMaW5rcyhzdGF0ZS5zdGFydGluZyk7XG5cdFx0XHRjb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBpc1RydXN0ZWQ6IHRydWUgfSkuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ21jcC5zdGFydGluZy5zZXJ2ZXJzJywgJ1N0YXJ0aW5nIE1DUCBzZXJ2ZXJzIHswfS4uLicsIHNlcnZlckxpbmtzKSArICcgJykuYXBwZW5kTWFya2Rvd24oc2tpcFRleHQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLndvcmtpbmdQcm9ncmVzc1BhcnQpIHtcblx0XHRcdHRoaXMud29ya2luZ1Byb2dyZXNzUGFydC51cGRhdGVNZXNzYWdlKGNvbnRlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndvcmtpbmdQcm9ncmVzc1BhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0UHJvZ3Jlc3NDb250ZW50UGFydCxcblx0XHRcdFx0eyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudCB9LFxuXHRcdFx0XHR0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0XHR0cnVlLCAvLyBmb3JjZVNob3dTcGlubmVyXG5cdFx0XHRcdHRydWUsIC8vIGZvcmNlU2hvd01lc3NhZ2Vcblx0XHRcdFx0dW5kZWZpbmVkLCAvLyBpY29uXG5cdFx0XHRcdHVuZGVmaW5lZCwgLy8gdG9vbEludm9jYXRpb25cblx0XHRcdFx0ZmFsc2UsIC8vIG5vIHNoaW1tZXIgZm9yIG5vd1xuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy53b3JraW5nUHJvZ3Jlc3NQYXJ0LmRvbU5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySW50ZXJhY3Rpb25SZXF1aXJlZChzZXJ2ZXJzUmVxdWlyaW5nSW50ZXJhY3Rpb246IEFycmF5PHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZXJyb3JNZXNzYWdlPzogc3RyaW5nIH0+KTogdm9pZCB7XG5cdFx0dGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1tY3Atc2VydmVycy1pbnRlcmFjdGlvbi1oaW50Jyk7XG5cblx0XHQvLyBDcmVhdGUgc3VidGxlIGhpbnQgbWVzc2FnZVxuXHRcdGNvbnN0IG1lc3NhZ2VDb250YWluZXIgPSBkb20uJCgnLmNoYXQtbWNwLXNlcnZlcnMtbWVzc2FnZScpO1xuXHRcdGNvbnN0IGljb24gPSBkb20uJCgnLmNoYXQtbWNwLXNlcnZlcnMtaWNvbicpO1xuXHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLm1jcCkpO1xuXG5cdFx0Y29uc3QgeyBtZXNzYWdlTWQgfSA9IHRoaXMuY3JlYXRlSW50ZXJhY3Rpb25NZXNzYWdlKHNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbik7XG5cblx0XHRtZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xuXHRcdG1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQobWVzc2FnZU1kLmVsZW1lbnQpO1xuXG5cdFx0dGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZChtZXNzYWdlQ29udGFpbmVyKTtcblx0XHR0aGlzLmRvbU5vZGUucHJlcGVuZCh0aGlzLmludGVyYWN0aW9uQ29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW50ZXJhY3Rpb25SZXF1aXJlZChvbGRFbGVtZW50OiBIVE1MRWxlbWVudCwgc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uOiBBcnJheTx7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGVycm9yTWVzc2FnZT86IHN0cmluZyB9Pik6IHZvaWQge1xuXHRcdGNvbnN0IHsgbWVzc2FnZU1kIH0gPSB0aGlzLmNyZWF0ZUludGVyYWN0aW9uTWVzc2FnZShzZXJ2ZXJzUmVxdWlyaW5nSW50ZXJhY3Rpb24pO1xuXHRcdG9sZEVsZW1lbnQucmVwbGFjZVdpdGgobWVzc2FnZU1kLmVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVJbnRlcmFjdGlvbk1lc3NhZ2Uoc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uOiBBcnJheTx7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGVycm9yTWVzc2FnZT86IHN0cmluZyB9Pikge1xuXHRcdGNvbnN0IGNvdW50ID0gc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uLmxlbmd0aDtcblx0XHRjb25zdCBsaW5rcyA9IHRoaXMuY3JlYXRlU2VydmVyQ29tbWFuZExpbmtzKHNlcnZlcnNSZXF1aXJpbmdJbnRlcmFjdGlvbik7XG5cblx0XHRjb25zdCBjb250ZW50ID0gY291bnQgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ21jcC5zdGFydC5zaW5nbGUnLCAnVGhlIE1DUCBzZXJ2ZXIgezB9IG1heSBoYXZlIG5ldyB0b29scyBhbmQgcmVxdWlyZXMgaW50ZXJhY3Rpb24gdG8gc3RhcnQuIFtTdGFydCBpdCBub3c/XSh7MX0pJywgbGlua3MsICcjc3RhcnQnKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbWNwLnN0YXJ0Lm11bHRpcGxlJywgJ1RoZSBNQ1Agc2VydmVycyB7MH0gbWF5IGhhdmUgbmV3IHRvb2xzIGFuZCByZXF1aXJlIGludGVyYWN0aW9uIHRvIHN0YXJ0LiBbU3RhcnQgdGhlbSBub3c/XSh7MX0pJywgbGlua3MsICcjc3RhcnQnKTtcblx0XHRjb25zdCBzdHIgPSBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCwgeyBpc1RydXN0ZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgbWVzc2FnZU1kID0gdGhpcy5pbnRlcmFjdGlvbk1kLnZhbHVlID0gdGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKHN0ciwge1xuXHRcdFx0YWN0aW9uSGFuZGxlcjogKGNvbnRlbnQpID0+IHtcblx0XHRcdFx0aWYgKCFjb250ZW50LnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6JykpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydChzdGFydExpbmshKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcGVuTGlua0Zyb21NYXJrZG93bih0aGlzLl9vcGVuZXJTZXJ2aWNlLCBjb250ZW50LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHN0YXJ0TGluayA9IFsuLi5tZXNzYWdlTWQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdhJyldLmZpbmQoYSA9PiAhYS5nZXRBdHRyaWJ1dGUoJ2RhdGEtaHJlZicpPy5zdGFydHNXaXRoKCdjb21tYW5kOicpKTtcblx0XHRpZiAoIXN0YXJ0TGluaykge1xuXHRcdFx0Ly8gU2hvdWxkIG5vdCBoYXBwZW5cblx0XHRcdHJldHVybiB7IG1lc3NhZ2VNZCwgc3RhcnRMaW5rOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHRzdGFydExpbmsuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHN0YXJ0TGluay5ocmVmID0gJyc7XG5cblx0XHRyZXR1cm4geyBtZXNzYWdlTWQsIHN0YXJ0TGluayB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnQoc3RhcnRMaW5rOiBIVE1MRWxlbWVudCkge1xuXHRcdC8vIFVwZGF0ZSB0byBzdGFydGluZyBzdGF0ZVxuXHRcdHN0YXJ0TGluay5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXHRcdHN0YXJ0TGluay5zdHlsZS5vcGFjaXR5ID0gJzAuNyc7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLmRhdGEuc3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZGF0YS5zdGF0ZS5nZXQoKTtcblx0XHRcdGNvbnN0IHNlcnZlcnNUb1N0YXJ0ID0gc3RhdGUuc2VydmVyc1JlcXVpcmluZ0ludGVyYWN0aW9uO1xuXG5cdFx0XHQvLyBTdGFydCBzZXJ2ZXJzIGluIHNlcXVlbmNlIHdpdGggcHJvZ3Jlc3MgdXBkYXRlc1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZXJ2ZXJzVG9TdGFydC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXJJbmZvID0gc2VydmVyc1RvU3RhcnRbaV07XG5cdFx0XHRcdHN0YXJ0TGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtY3Auc3RhcnRpbmcnLCBcIlN0YXJ0aW5nIHswfS4uLlwiLCBzZXJ2ZXJJbmZvLmxhYmVsKTtcblxuXHRcdFx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBzZXJ2ZXJJbmZvLmlkKTtcblx0XHRcdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0XHRcdGF3YWl0IHN0YXJ0U2VydmVyQW5kV2FpdEZvckxpdmVUb29scyhzZXJ2ZXIsIHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnIH0pO1xuXG5cdFx0XHRcdFx0dGhpcy5kYXRhLmRpZFN0YXJ0U2VydmVySWRzID8/PSBbXTtcblx0XHRcdFx0XHR0aGlzLmRhdGEuZGlkU3RhcnRTZXJ2ZXJJZHMucHVzaChzZXJ2ZXJJbmZvLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgdGhlIGludGVyYWN0aW9uIGNvbnRhaW5lciBhZnRlciBzdWNjZXNzZnVsIHN0YXJ0XG5cdFx0XHRpZiAodGhpcy5pbnRlcmFjdGlvbkNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLmludGVyYWN0aW9uQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLmludGVyYWN0aW9uQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBSZXNldCBsaW5rIG9uIGVycm9yXG5cdFx0XHRzdGFydExpbmsuc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnO1xuXHRcdFx0c3RhcnRMaW5rLnN0eWxlLm9wYWNpdHkgPSAnJztcblx0XHRcdHN0YXJ0TGluay50ZXh0Q29udGVudCA9ICdTdGFydCBub3c/Jztcblx0XHR9XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQpOiBib29sZWFuIHtcblx0XHQvLyBTaW1wbGUgaW1wbGVtZW50YXRpb24gdGhhdCBjaGVja3MgaWYgaXQncyB0aGUgc2FtZSB0eXBlXG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09ICdtY3BTZXJ2ZXJzU3RhcnRpbmcnO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyw0QkFBNEIsMkJBQTJCLHNCQUFzQjtBQUN0RixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUF5Qix5QkFBeUI7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMEJBQTBCLDRCQUE0QjtBQUUvRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUEyQixtQkFBbUI7QUFDOUMsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBdUQsb0JBQW9CO0FBRTNFLFNBQVMsK0JBQStCO0FBQ3hDLE9BQU87QUFFQSxJQUFNLHVDQUFOLGNBQW1ELFdBQXVDO0FBQUEsRUFrQmhHLFlBQ2tCLE1BQ0EsU0FDYSxZQUNVLHNCQUNQLGdCQUNVLDBCQUMxQztBQUNELFVBQU07QUFQVztBQUNBO0FBQ2E7QUFDVTtBQUNQO0FBQ1U7QUFuQjVDLFNBQWlCLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxrQkFBcUMsQ0FBQztBQUMxRixTQUFpQiwrQkFBK0IsS0FBSyxVQUFVLElBQUksaUJBQWlCLE1BQU0sS0FBSyx1QkFBdUIsS0FBSyxLQUFLLE1BQU8sSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQ3BKLFNBQWlCLGdCQUFnQixJQUFJLEtBQUssTUFBTTtBQUMvQyxVQUFJLENBQUMsYUFBYSxLQUFLLFFBQVEsT0FBTyxHQUFHO0FBQ3hDLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFFQSxhQUFPLEtBQUssUUFBUSxRQUFRLFFBQVEsU0FBUyxFQUMzQyxPQUFPLENBQUMsR0FBRyxNQUFtQyxhQUFhLENBQUMsS0FBSyxJQUFJLEtBQUssUUFBUSxZQUFZLEVBQzlGLFFBQVEsT0FBSyxFQUFFLFNBQVMsTUFBTSxPQUFPLE9BQUssRUFBRSxTQUFTLG9CQUFvQixDQUFDLEVBQzFFLElBQUksT0FBSyxFQUFFLE9BQU8sSUFBSSxDQUFDO0FBQUEsSUFDMUIsQ0FBQztBQVlBLFNBQUssVUFBVSxJQUFJLEVBQUUsK0JBQStCO0FBR3BELFFBQUksS0FBSyxPQUFPO0FBQ2YsV0FBSyxVQUFVLFFBQVEsWUFBVTtBQUNoQyxjQUFNLFFBQVEsS0FBSyxNQUFPLEtBQUssTUFBTTtBQUNyQyxhQUFLLGVBQWUsS0FBSztBQUFBLE1BQzFCLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLE9BQStCO0FBQ3JELFFBQUksQ0FBQyxNQUFNLFNBQVM7QUFDbkIsV0FBSyxxQkFBcUIsUUFBUSxPQUFPO0FBQ3pDLFdBQUssc0JBQXNCO0FBQzNCLFdBQUssNkJBQTZCLE9BQU87QUFBQSxJQUMxQyxXQUFXLENBQUMsS0FBSyxxQkFBcUI7QUFDckMsVUFBSSxDQUFDLEtBQUssNkJBQTZCLFlBQVksR0FBRztBQUNyRCxhQUFLLDZCQUE2QixTQUFTO0FBQUEsTUFDNUM7QUFBQSxJQUNELFdBQVcsS0FBSyxxQkFBcUI7QUFDcEMsV0FBSyx1QkFBdUIsS0FBSztBQUFBLElBQ2xDO0FBRUEsVUFBTSx1QkFBdUIsTUFBTSw0QkFBNEIsT0FBTyxPQUFLO0FBRTFFLFVBQUksS0FBSyxLQUFLLG1CQUFtQixTQUFTLEVBQUUsRUFBRSxHQUFHO0FBQ2hELGVBQU87QUFBQSxNQUNSO0FBR0EsVUFBSSxLQUFLLGNBQWMsTUFBTSxLQUFLLE9BQUssR0FBRyw0QkFBNEIsS0FBSyxRQUFNLEVBQUUsT0FBTyxHQUFHLEVBQUUsQ0FBQyxHQUFHO0FBQ2xHLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFFBQUkscUJBQXFCLFNBQVMsR0FBRztBQUNwQyxVQUFJLENBQUMsS0FBSyxjQUFjLE9BQU87QUFDOUIsYUFBSywwQkFBMEIsb0JBQW9CO0FBQUEsTUFDcEQsT0FBTztBQUNOLGFBQUssMEJBQTBCLEtBQUssY0FBYyxNQUFNLFNBQVMsb0JBQW9CO0FBQUEsTUFDdEY7QUFBQSxJQUNELFdBQVcscUJBQXFCLFdBQVcsS0FBSyxLQUFLLHNCQUFzQjtBQUMxRSxXQUFLLHFCQUFxQixPQUFPO0FBQ2pDLFdBQUssdUJBQXVCO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBeUIsU0FBdUQ7QUFDdkYsV0FBTyxRQUFRLElBQUksT0FBSywwQkFBMEI7QUFBQSxNQUNqRCxNQUFNLE1BQU0sMkJBQTJCLEVBQUUsS0FBSyxJQUFJO0FBQUEsTUFDbEQsSUFBSSxjQUFjO0FBQUEsTUFDbEIsV0FBVyxDQUFDLEVBQUUsRUFBRTtBQUFBLE1BQ2hCLFNBQVMsU0FBUyw4QkFBOEIsd0JBQXdCLEVBQUUsS0FBSztBQUFBLElBQ2hGLEdBQUcsS0FBSyxDQUFDLEVBQUUsS0FBSyxJQUFJO0FBQUEsRUFDckI7QUFBQSxFQUVRLHVCQUF1QixPQUErQjtBQUM3RCxVQUFNLFdBQVcsMEJBQTBCO0FBQUEsTUFDMUMsTUFBTSxTQUFTLGlCQUFpQixPQUFPO0FBQUEsTUFDdkMsSUFBSSxjQUFjO0FBQUEsTUFDbEIsU0FBUyxTQUFTLG9CQUFvQiwrQkFBK0I7QUFBQSxJQUN0RSxDQUFDO0FBRUQsUUFBSTtBQUNKLFFBQUksTUFBTSxTQUFTLFdBQVcsR0FBRztBQUNoQyxnQkFBVSxJQUFJLGVBQWUsUUFBVyxFQUFFLFdBQVcsS0FBSyxDQUFDLEVBQUUsV0FBVyxTQUFTLG1CQUFtQiw4QkFBOEIsSUFBSSxHQUFHLEVBQUUsZUFBZSxRQUFRO0FBQUEsSUFDbkssT0FBTztBQUVOLFlBQU0sY0FBYyxLQUFLLHlCQUF5QixNQUFNLFFBQVE7QUFDaEUsZ0JBQVUsSUFBSSxlQUFlLFFBQVcsRUFBRSxXQUFXLEtBQUssQ0FBQyxFQUFFLGVBQWUsU0FBUyx3QkFBd0IsK0JBQStCLFdBQVcsSUFBSSxHQUFHLEVBQUUsZUFBZSxRQUFRO0FBQUEsSUFDeEw7QUFFQSxRQUFJLEtBQUsscUJBQXFCO0FBQzdCLFdBQUssb0JBQW9CLGNBQWMsT0FBTztBQUFBLElBQy9DLE9BQU87QUFDTixXQUFLLHNCQUFzQixLQUFLLFVBQVUsS0FBSyxxQkFBcUI7QUFBQSxRQUNuRTtBQUFBLFFBQ0EsRUFBRSxNQUFNLG1CQUFtQixRQUFRO0FBQUEsUUFDbkMsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0w7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssUUFBUSxZQUFZLEtBQUssb0JBQW9CLE9BQU87QUFBQSxJQUMxRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDBCQUEwQiw2QkFBZ0c7QUFDakksU0FBSyx1QkFBdUIsSUFBSSxFQUFFLG9DQUFvQztBQUd0RSxVQUFNLG1CQUFtQixJQUFJLEVBQUUsMkJBQTJCO0FBQzFELFVBQU0sT0FBTyxJQUFJLEVBQUUsd0JBQXdCO0FBQzNDLFNBQUssVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxHQUFHLENBQUM7QUFFN0QsVUFBTSxFQUFFLFVBQVUsSUFBSSxLQUFLLHlCQUF5QiwyQkFBMkI7QUFFL0UscUJBQWlCLFlBQVksSUFBSTtBQUNqQyxxQkFBaUIsWUFBWSxVQUFVLE9BQU87QUFFOUMsU0FBSyxxQkFBcUIsWUFBWSxnQkFBZ0I7QUFDdEQsU0FBSyxRQUFRLFFBQVEsS0FBSyxvQkFBb0I7QUFBQSxFQUMvQztBQUFBLEVBRVEsMEJBQTBCLFlBQXlCLDZCQUFnRztBQUMxSixVQUFNLEVBQUUsVUFBVSxJQUFJLEtBQUsseUJBQXlCLDJCQUEyQjtBQUMvRSxlQUFXLFlBQVksVUFBVSxPQUFPO0FBQUEsRUFDekM7QUFBQSxFQUVRLHlCQUF5Qiw2QkFBMEY7QUFDMUgsVUFBTSxRQUFRLDRCQUE0QjtBQUMxQyxVQUFNLFFBQVEsS0FBSyx5QkFBeUIsMkJBQTJCO0FBRXZFLFVBQU0sVUFBVSxVQUFVLElBQ3ZCLFNBQVMsb0JBQW9CLGlHQUFpRyxPQUFPLFFBQVEsSUFDN0ksU0FBUyxzQkFBc0IsbUdBQW1HLE9BQU8sUUFBUTtBQUNwSixVQUFNLE1BQU0sSUFBSSxlQUFlLFNBQVMsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUMzRCxVQUFNLFlBQVksS0FBSyxjQUFjLFFBQVEsS0FBSyx5QkFBeUIsT0FBTyxLQUFLO0FBQUEsTUFDdEYsZUFBZSxDQUFDQSxhQUFZO0FBQzNCLFlBQUksQ0FBQ0EsU0FBUSxXQUFXLFVBQVUsR0FBRztBQUNwQyxlQUFLLE9BQU8sU0FBVTtBQUN0QixpQkFBTyxRQUFRLFFBQVEsSUFBSTtBQUFBLFFBQzVCO0FBQ0EsZUFBTyxxQkFBcUIsS0FBSyxnQkFBZ0JBLFVBQVMsSUFBSTtBQUFBLE1BQy9EO0FBQUEsSUFDRCxDQUFDO0FBR0QsVUFBTSxZQUFZLENBQUMsR0FBRyxVQUFVLFFBQVEsaUJBQWlCLEdBQUcsQ0FBQyxFQUFFLEtBQUssT0FBSyxDQUFDLEVBQUUsYUFBYSxXQUFXLEdBQUcsV0FBVyxVQUFVLENBQUM7QUFDN0gsUUFBSSxDQUFDLFdBQVc7QUFFZixhQUFPLEVBQUUsV0FBVyxXQUFXLE9BQVU7QUFBQSxJQUMxQztBQUVBLGNBQVUsYUFBYSxRQUFRLFFBQVE7QUFDdkMsY0FBVSxPQUFPO0FBRWpCLFdBQU8sRUFBRSxXQUFXLFVBQVU7QUFBQSxFQUMvQjtBQUFBLEVBRUEsTUFBYyxPQUFPLFdBQXdCO0FBRTVDLGNBQVUsTUFBTSxnQkFBZ0I7QUFDaEMsY0FBVSxNQUFNLFVBQVU7QUFFMUIsUUFBSTtBQUNILFVBQUksQ0FBQyxLQUFLLEtBQUssT0FBTztBQUNyQjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFFBQVEsS0FBSyxLQUFLLE1BQU0sSUFBSTtBQUNsQyxZQUFNLGlCQUFpQixNQUFNO0FBRzdCLGVBQVMsSUFBSSxHQUFHLElBQUksZUFBZSxRQUFRLEtBQUs7QUFDL0MsY0FBTSxhQUFhLGVBQWUsQ0FBQztBQUNuQyxrQkFBVSxjQUFjLFNBQVMsZ0JBQWdCLG1CQUFtQixXQUFXLEtBQUs7QUFFcEYsY0FBTSxTQUFTLEtBQUssV0FBVyxRQUFRLElBQUksRUFBRSxLQUFLLE9BQUssRUFBRSxXQUFXLE9BQU8sV0FBVyxFQUFFO0FBQ3hGLFlBQUksUUFBUTtBQUNYLGdCQUFNLCtCQUErQixRQUFRLEVBQUUsWUFBWSxnQkFBZ0IsQ0FBQztBQUU1RSxlQUFLLEtBQUssc0JBQXNCLENBQUM7QUFDakMsZUFBSyxLQUFLLGtCQUFrQixLQUFLLFdBQVcsRUFBRTtBQUFBLFFBQy9DO0FBQUEsTUFDRDtBQUdBLFVBQUksS0FBSyxzQkFBc0I7QUFDOUIsYUFBSyxxQkFBcUIsT0FBTztBQUNqQyxhQUFLLHVCQUF1QjtBQUFBLE1BQzdCO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFFZixnQkFBVSxNQUFNLGdCQUFnQjtBQUNoQyxnQkFBVSxNQUFNLFVBQVU7QUFDMUIsZ0JBQVUsY0FBYztBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsZUFBZSxPQUFzQztBQUVwRCxXQUFPLE1BQU0sU0FBUztBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxjQUFjLFlBQStCO0FBQzVDLFNBQUssVUFBVSxVQUFVO0FBQUEsRUFDMUI7QUFDRDtBQTlOYSx1Q0FBTjtBQUFBLEVBcUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4QlU7IiwKICAibmFtZXMiOiBbImNvbnRlbnQiXQp9Cg==
