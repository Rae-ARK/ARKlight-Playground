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
import { Action } from "../../../../../../base/common/actions.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { getAgentCanContinueIn, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from "../../agentSessions/agentSessions.js";
let ChatSuggestNextWidget = class extends Disposable {
  constructor(configurationService, contextMenuService, chatSessionsService, contextKeyService) {
    super();
    this.configurationService = configurationService;
    this.contextMenuService = contextMenuService;
    this.chatSessionsService = chatSessionsService;
    this.contextKeyService = contextKeyService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidSelectPrompt = this._register(new Emitter());
    this.onDidSelectPrompt = this._onDidSelectPrompt.event;
    this.buttonDisposables = /* @__PURE__ */ new Map();
    this.domNode = this.createSuggestNextWidget();
  }
  get height() {
    return this.domNode.style.display === "none" ? 0 : this.domNode.offsetHeight;
  }
  getCurrentMode() {
    return this._currentMode;
  }
  createSuggestNextWidget() {
    const container = dom.$(".chat-suggest-next-widget.chat-welcome-view-suggested-prompts");
    container.style.display = "none";
    this.titleElement = dom.append(container, dom.$(".chat-welcome-view-suggested-prompts-title"));
    this.promptsContainer = container;
    return container;
  }
  render(mode) {
    const handoffs = mode.handOffs?.get();
    if (!handoffs || handoffs.length === 0) {
      this.hide();
      return;
    }
    this._currentMode = mode;
    const modeName = mode.name.get() || mode.label.get() || localize("chat.currentMode", "current mode");
    this.titleElement.textContent = localize("chat.proceedFrom", "Proceed from {0}", modeName);
    const childrenToRemove = [];
    for (let i = 1; i < this.promptsContainer.children.length; i++) {
      childrenToRemove.push(this.promptsContainer.children[i]);
    }
    for (const child of childrenToRemove) {
      const disposables = this.buttonDisposables.get(child);
      if (disposables) {
        disposables.dispose();
        this.buttonDisposables.delete(child);
      }
      this.promptsContainer.removeChild(child);
    }
    const isAutopilotPolicyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const firstAutoSendHandoff = !isAutopilotPolicyRestricted ? handoffs.find((h) => h.send) : void 0;
    for (const handoff of handoffs) {
      const promptButton = this.createPromptButton(handoff);
      this.promptsContainer.appendChild(promptButton);
      if (handoff === firstAutoSendHandoff) {
        const autopilotButton = this.createAutopilotButton(handoff);
        this.promptsContainer.appendChild(autopilotButton);
      }
    }
    this.domNode.style.display = "flex";
    this._onDidChangeHeight.fire();
  }
  createPromptButton(handoff) {
    const disposables = new DisposableStore();
    const handoffLabel = handoff.label;
    const getCurrentHandoff = () => {
      const currentHandoffs = this._currentMode?.handOffs?.get();
      return currentHandoffs?.find((h) => h.label === handoffLabel) ?? handoff;
    };
    const button = dom.$(".chat-welcome-view-suggested-prompt");
    button.setAttribute("tabindex", "0");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", localize("chat.suggestNext.item", "{0}", handoff.label));
    const titleElement = dom.append(button, dom.$(".chat-welcome-view-suggested-prompt-title"));
    titleElement.textContent = handoff.label;
    const showContinueOn = handoff.showContinueOn ?? true;
    const currentSessionType = this.contextKeyService.getContextKeyValue(ChatContextKeys.chatSessionType.key);
    const contributions = this.chatSessionsService.getAllChatSessionContributions();
    const availableContributions = contributions.filter((c) => {
      if (!c.canDelegate) {
        return false;
      }
      if (c.type === currentSessionType) {
        return false;
      }
      const provider = getAgentSessionProvider(c.type);
      return provider !== void 0 && getAgentCanContinueIn(provider);
    });
    if (showContinueOn && availableContributions.length > 0) {
      button.classList.add("chat-suggest-next-has-dropdown");
      const dropdownContainer = dom.append(button, dom.$(".chat-suggest-next-dropdown"));
      dropdownContainer.setAttribute("tabindex", "0");
      dropdownContainer.setAttribute("role", "button");
      dropdownContainer.setAttribute("aria-label", localize("chat.suggestNext.moreOptions", "More options for {0}", handoff.label));
      dropdownContainer.setAttribute("aria-haspopup", "true");
      const separator = dom.append(dropdownContainer, dom.$(".chat-suggest-next-separator"));
      separator.setAttribute("aria-hidden", "true");
      const chevron = dom.append(dropdownContainer, dom.$(".codicon.codicon-chevron-down.dropdown-chevron"));
      chevron.setAttribute("aria-hidden", "true");
      const showContextMenu = (e, anchor) => {
        e.preventDefault();
        e.stopPropagation();
        const actions = availableContributions.map((contrib) => {
          const provider = getAgentSessionProvider(contrib.type);
          const icon = getAgentSessionProviderIcon(provider);
          const name = getAgentSessionProviderName(provider);
          return new Action(
            contrib.type,
            localize("continueIn", "Continue in {0}", name),
            ThemeIcon.isThemeIcon(icon) ? ThemeIcon.asClassName(icon) : void 0,
            true,
            () => {
              const currentHandoff = getCurrentHandoff();
              if (currentHandoff) {
                this._onDidSelectPrompt.fire({ handoff: currentHandoff, agentId: contrib.name });
              }
            }
          );
        });
        this.contextMenuService.showContextMenu({
          getAnchor: () => anchor || dropdownContainer,
          getActions: () => actions,
          autoSelectFirstItem: true
        });
      };
      disposables.add(dom.addDisposableListener(dropdownContainer, "click", (e) => {
        showContextMenu(e, dropdownContainer);
      }));
      disposables.add(dom.addDisposableListener(dropdownContainer, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          showContextMenu(e, dropdownContainer);
        }
      }));
      disposables.add(dom.addDisposableListener(button, "click", (e) => {
        if (dom.isHTMLElement(e.target) && e.target.closest(".chat-suggest-next-dropdown")) {
          return;
        }
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff });
        }
      }));
    } else {
      disposables.add(dom.addDisposableListener(button, "click", () => {
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff });
        }
      }));
    }
    disposables.add(dom.addDisposableListener(button, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff });
        }
      }
    }));
    this.buttonDisposables.set(button, disposables);
    return button;
  }
  createAutopilotButton(handoff) {
    const disposables = new DisposableStore();
    const handoffLabel = handoff.label;
    const getCurrentHandoff = () => {
      const currentHandoffs = this._currentMode?.handOffs?.get();
      return currentHandoffs?.find((h) => h.label === handoffLabel) ?? handoff;
    };
    const label = localize("chat.suggestNext.startWithAutopilot", "Start with Autopilot");
    const button = dom.$(".chat-welcome-view-suggested-prompt");
    button.setAttribute("tabindex", "0");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", label);
    const titleElement = dom.append(button, dom.$(".chat-welcome-view-suggested-prompt-title"));
    titleElement.textContent = label;
    disposables.add(dom.addDisposableListener(button, "click", () => {
      const currentHandoff = getCurrentHandoff();
      if (currentHandoff) {
        this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
      }
    }));
    disposables.add(dom.addDisposableListener(button, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
        }
      }
    }));
    this.buttonDisposables.set(button, disposables);
    return button;
  }
  hide() {
    if (this.domNode.style.display !== "none") {
      this._currentMode = void 0;
      this.domNode.style.display = "none";
      this._onDidChangeHeight.fire();
    }
  }
  dispose() {
    for (const disposables of this.buttonDisposables.values()) {
      disposables.dispose();
    }
    this.buttonDisposables.clear();
    super.dispose();
  }
};
ChatSuggestNextWidget = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IContextKeyService)
], ChatSuggestNextWidget);
export {
  ChatSuggestNextWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3VnZ2VzdE5leHRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhhbmRPZmYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRDYW5Db250aW51ZUluLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlciwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElOZXh0UHJvbXB0U2VsZWN0aW9uIHtcblx0cmVhZG9ubHkgaGFuZG9mZjogSUhhbmRPZmY7XG5cdHJlYWRvbmx5IGFnZW50SWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdpdGhBdXRvcGlsb3Q/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFN1Z2dlc3ROZXh0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RQcm9tcHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTmV4dFByb21wdFNlbGVjdGlvbj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFNlbGVjdFByb21wdDogRXZlbnQ8SU5leHRQcm9tcHRTZWxlY3Rpb24+ID0gdGhpcy5fb25EaWRTZWxlY3RQcm9tcHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBwcm9tcHRzQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGl0bGVFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2N1cnJlbnRNb2RlOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYnV0dG9uRGlzcG9zYWJsZXMgPSBuZXcgTWFwPEhUTUxFbGVtZW50LCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kb21Ob2RlID0gdGhpcy5jcmVhdGVTdWdnZXN0TmV4dFdpZGdldCgpO1xuXHR9XG5cblx0cHVibGljIGdldCBoZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJyA/IDAgOiB0aGlzLmRvbU5vZGUub2Zmc2V0SGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIGdldEN1cnJlbnRNb2RlKCk6IElDaGF0TW9kZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRNb2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTdWdnZXN0TmV4dFdpZGdldCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0Ly8gUmV1c2Ugd2VsY29tZSB2aWV3IGNsYXNzZXMgZm9yIGNvbnNpc3RlbnQgc3R5bGluZ1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1zdWdnZXN0LW5leHQtd2lkZ2V0LmNoYXQtd2VsY29tZS12aWV3LXN1Z2dlc3RlZC1wcm9tcHRzJyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHQvLyBUaXRsZSBlbGVtZW50IHVzaW5nIHdlbGNvbWUgdmlldyBjbGFzc1xuXHRcdHRoaXMudGl0bGVFbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY2hhdC13ZWxjb21lLXZpZXctc3VnZ2VzdGVkLXByb21wdHMtdGl0bGUnKSk7XG5cblx0XHQvLyBDb250YWluZXIgZm9yIHByb21wdCBidXR0b25zXG5cdFx0dGhpcy5wcm9tcHRzQ29udGFpbmVyID0gY29udGFpbmVyO1xuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIobW9kZTogSUNoYXRNb2RlKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFuZG9mZnMgPSBtb2RlLmhhbmRPZmZzPy5nZXQoKTtcblxuXHRcdGlmICghaGFuZG9mZnMgfHwgaGFuZG9mZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50TW9kZSA9IG1vZGU7XG5cblx0XHQvLyBVcGRhdGUgdGl0bGUgd2l0aCBtb2RlIG5hbWU6IFwiUHJvY2VlZCBmcm9tIHtNb2RlfVwiXG5cdFx0Y29uc3QgbW9kZU5hbWUgPSBtb2RlLm5hbWUuZ2V0KCkgfHwgbW9kZS5sYWJlbC5nZXQoKSB8fCBsb2NhbGl6ZSgnY2hhdC5jdXJyZW50TW9kZScsICdjdXJyZW50IG1vZGUnKTtcblx0XHR0aGlzLnRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnByb2NlZWRGcm9tJywgJ1Byb2NlZWQgZnJvbSB7MH0nLCBtb2RlTmFtZSk7XG5cblx0XHQvLyBDbGVhciBleGlzdGluZyBwcm9tcHQgYnV0dG9ucyAoa2VlcCB0aXRsZSB3aGljaCBpcyBmaXJzdCBjaGlsZClcblx0XHRjb25zdCBjaGlsZHJlblRvUmVtb3ZlOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCB0aGlzLnByb21wdHNDb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNoaWxkcmVuVG9SZW1vdmUucHVzaCh0aGlzLnByb21wdHNDb250YWluZXIuY2hpbGRyZW5baV0gYXMgSFRNTEVsZW1lbnQpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuVG9SZW1vdmUpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5idXR0b25EaXNwb3NhYmxlcy5nZXQoY2hpbGQpO1xuXHRcdFx0aWYgKGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5idXR0b25EaXNwb3NhYmxlcy5kZWxldGUoY2hpbGQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5wcm9tcHRzQ29udGFpbmVyLnJlbW92ZUNoaWxkKGNoaWxkKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0F1dG9waWxvdFBvbGljeVJlc3RyaWN0ZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpLnBvbGljeVZhbHVlID09PSBmYWxzZTtcblx0XHRjb25zdCBmaXJzdEF1dG9TZW5kSGFuZG9mZiA9ICFpc0F1dG9waWxvdFBvbGljeVJlc3RyaWN0ZWQgPyBoYW5kb2Zmcy5maW5kKGggPT4gaC5zZW5kKSA6IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgaGFuZG9mZiBvZiBoYW5kb2Zmcykge1xuXHRcdFx0Y29uc3QgcHJvbXB0QnV0dG9uID0gdGhpcy5jcmVhdGVQcm9tcHRCdXR0b24oaGFuZG9mZik7XG5cdFx0XHR0aGlzLnByb21wdHNDb250YWluZXIuYXBwZW5kQ2hpbGQocHJvbXB0QnV0dG9uKTtcblxuXHRcdFx0aWYgKGhhbmRvZmYgPT09IGZpcnN0QXV0b1NlbmRIYW5kb2ZmKSB7XG5cdFx0XHRcdGNvbnN0IGF1dG9waWxvdEJ1dHRvbiA9IHRoaXMuY3JlYXRlQXV0b3BpbG90QnV0dG9uKGhhbmRvZmYpO1xuXHRcdFx0XHR0aGlzLnByb21wdHNDb250YWluZXIuYXBwZW5kQ2hpbGQoYXV0b3BpbG90QnV0dG9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVByb21wdEJ1dHRvbihoYW5kb2ZmOiBJSGFuZE9mZik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIENhcHR1cmUgdGhlIGxhYmVsIHRvIGxvb2sgdXAgdGhlIGN1cnJlbnQgaGFuZG9mZiBhdCBjbGljayB0aW1lXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIHdlIGdldCB0aGUgbGF0ZXN0IGhhbmRvZmYgZGF0YSAoZS5nLiwgdXBkYXRlZCBtb2RlbCBmcm9tIHNldHRpbmdzKVxuXHRcdGNvbnN0IGhhbmRvZmZMYWJlbCA9IGhhbmRvZmYubGFiZWw7XG5cdFx0Y29uc3QgZ2V0Q3VycmVudEhhbmRvZmYgPSAoKTogSUhhbmRPZmYgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEhhbmRvZmZzID0gdGhpcy5fY3VycmVudE1vZGU/LmhhbmRPZmZzPy5nZXQoKTtcblx0XHRcdHJldHVybiBjdXJyZW50SGFuZG9mZnM/LmZpbmQoaCA9PiBoLmxhYmVsID09PSBoYW5kb2ZmTGFiZWwpID8/IGhhbmRvZmY7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGJ1dHRvbiA9IGRvbS4kKCcuY2hhdC13ZWxjb21lLXZpZXctc3VnZ2VzdGVkLXByb21wdCcpO1xuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdC5zdWdnZXN0TmV4dC5pdGVtJywgJ3swfScsIGhhbmRvZmYubGFiZWwpKTtcblxuXHRcdGNvbnN0IHRpdGxlRWxlbWVudCA9IGRvbS5hcHBlbmQoYnV0dG9uLCBkb20uJCgnLmNoYXQtd2VsY29tZS12aWV3LXN1Z2dlc3RlZC1wcm9tcHQtdGl0bGUnKSk7XG5cdFx0dGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gaGFuZG9mZi5sYWJlbDtcblxuXHRcdC8vIE9wdGlvbmFsIHNob3dDb250aW51ZU9uIGJlaGF2ZXMgbGlrZSBzZW5kOiBvbmx5IHByZXNlbnQgaWYgc3BlY2lmaWVkXG5cdFx0Y29uc3Qgc2hvd0NvbnRpbnVlT24gPSBoYW5kb2ZmLnNob3dDb250aW51ZU9uID8/IHRydWU7XG5cblx0XHQvLyBHZXQgY2hhdCBzZXNzaW9uIGNvbnRyaWJ1dGlvbnMgdG8gc2hvdyBpbiBjaGV2cm9uIGRyb3Bkb3duXG5cdFx0Ly8gRmlsdGVyIHRvIG9ubHkgZmlyc3QtcGFydHkgcHJvdmlkZXJzIHRoYXQgc3VwcG9ydCBcImNvbnRpbnVlIGluXCIuXG5cdFx0Ly8gVE9ETzogRXhwYW5kIGxhdGVyIHRvIGFueSBhZ2VudCB3aXRoIGBjYW5EZWxlZ2F0ZWAgPT09IHRydWUuXG5cdFx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8c3RyaW5nPihDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9ucyA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKTtcblx0XHRjb25zdCBhdmFpbGFibGVDb250cmlidXRpb25zID0gY29udHJpYnV0aW9ucy5maWx0ZXIoYyA9PiB7XG5cdFx0XHRpZiAoIWMuY2FuRGVsZWdhdGUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGMudHlwZSA9PT0gY3VycmVudFNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIoYy50eXBlKTtcblx0XHRcdHJldHVybiBwcm92aWRlciAhPT0gdW5kZWZpbmVkICYmIGdldEFnZW50Q2FuQ29udGludWVJbihwcm92aWRlcik7XG5cdFx0fSk7XG5cblx0XHRpZiAoc2hvd0NvbnRpbnVlT24gJiYgYXZhaWxhYmxlQ29udHJpYnV0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRidXR0b24uY2xhc3NMaXN0LmFkZCgnY2hhdC1zdWdnZXN0LW5leHQtaGFzLWRyb3Bkb3duJyk7XG5cdFx0XHQvLyBDcmVhdGUgYSBkcm9wZG93biBjb250YWluZXIgdGhhdCB3cmFwcyBzZXBhcmF0b3IgYW5kIGNoZXZyb24gZm9yIGEgbGFyZ2VyIGhpdCBhcmVhXG5cdFx0XHRjb25zdCBkcm9wZG93bkNvbnRhaW5lciA9IGRvbS5hcHBlbmQoYnV0dG9uLCBkb20uJCgnLmNoYXQtc3VnZ2VzdC1uZXh0LWRyb3Bkb3duJykpO1xuXHRcdFx0ZHJvcGRvd25Db250YWluZXIuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRkcm9wZG93bkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRkcm9wZG93bkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdC5zdWdnZXN0TmV4dC5tb3JlT3B0aW9ucycsICdNb3JlIG9wdGlvbnMgZm9yIHswfScsIGhhbmRvZmYubGFiZWwpKTtcblx0XHRcdGRyb3Bkb3duQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICd0cnVlJyk7XG5cblx0XHRcdGNvbnN0IHNlcGFyYXRvciA9IGRvbS5hcHBlbmQoZHJvcGRvd25Db250YWluZXIsIGRvbS4kKCcuY2hhdC1zdWdnZXN0LW5leHQtc2VwYXJhdG9yJykpO1xuXHRcdFx0c2VwYXJhdG9yLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0Y29uc3QgY2hldnJvbiA9IGRvbS5hcHBlbmQoZHJvcGRvd25Db250YWluZXIsIGRvbS4kKCcuY29kaWNvbi5jb2RpY29uLWNoZXZyb24tZG93bi5kcm9wZG93bi1jaGV2cm9uJykpO1xuXHRcdFx0Y2hldnJvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdFx0Y29uc3Qgc2hvd0NvbnRleHRNZW51ID0gKGU6IE1vdXNlRXZlbnQgfCBLZXlib2FyZEV2ZW50LCBhbmNob3I/OiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF2YWlsYWJsZUNvbnRyaWJ1dGlvbnMubWFwKGNvbnRyaWIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIoY29udHJpYi50eXBlKSE7XG5cdFx0XHRcdFx0Y29uc3QgaWNvbiA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbihwcm92aWRlcik7XG5cdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShwcm92aWRlcik7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0XHRjb250cmliLnR5cGUsXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnY29udGludWVJbicsIFwiQ29udGludWUgaW4gezB9XCIsIG5hbWUpLFxuXHRcdFx0XHRcdFx0VGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudEhhbmRvZmYgPSBnZXRDdXJyZW50SGFuZG9mZigpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY3VycmVudEhhbmRvZmYpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFByb21wdC5maXJlKHsgaGFuZG9mZjogY3VycmVudEhhbmRvZmYsIGFnZW50SWQ6IGNvbnRyaWIubmFtZSB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IgfHwgZHJvcGRvd25Db250YWluZXIsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0XHRhdXRvU2VsZWN0Rmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRyb3Bkb3duQ29udGFpbmVyLCAnY2xpY2snLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRzaG93Q29udGV4dE1lbnUoZSwgZHJvcGRvd25Db250YWluZXIpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkcm9wZG93bkNvbnRhaW5lciwgJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdHNob3dDb250ZXh0TWVudShlLCBkcm9wZG93bkNvbnRhaW5lcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgJ2NsaWNrJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KGUudGFyZ2V0KSAmJiBlLnRhcmdldC5jbG9zZXN0KCcuY2hhdC1zdWdnZXN0LW5leHQtZHJvcGRvd24nKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjdXJyZW50SGFuZG9mZiA9IGdldEN1cnJlbnRIYW5kb2ZmKCk7XG5cdFx0XHRcdGlmIChjdXJyZW50SGFuZG9mZikge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0UHJvbXB0LmZpcmUoeyBoYW5kb2ZmOiBjdXJyZW50SGFuZG9mZiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudEhhbmRvZmYgPSBnZXRDdXJyZW50SGFuZG9mZigpO1xuXHRcdFx0XHRpZiAoY3VycmVudEhhbmRvZmYpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFByb21wdC5maXJlKHsgaGFuZG9mZjogY3VycmVudEhhbmRvZmYgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudEhhbmRvZmYgPSBnZXRDdXJyZW50SGFuZG9mZigpO1xuXHRcdFx0XHRpZiAoY3VycmVudEhhbmRvZmYpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFByb21wdC5maXJlKHsgaGFuZG9mZjogY3VycmVudEhhbmRvZmYgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTdG9yZSBkaXNwb3NhYmxlcyBmb3IgdGhpcyBidXR0b24gc28gdGhleSBjYW4gYmUgZGlzcG9zZWQgd2hlbiB0aGUgYnV0dG9uIGlzIHJlbW92ZWRcblx0XHR0aGlzLmJ1dHRvbkRpc3Bvc2FibGVzLnNldChidXR0b24sIGRpc3Bvc2FibGVzKTtcblxuXHRcdHJldHVybiBidXR0b247XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUF1dG9waWxvdEJ1dHRvbihoYW5kb2ZmOiBJSGFuZE9mZik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGhhbmRvZmZMYWJlbCA9IGhhbmRvZmYubGFiZWw7XG5cdFx0Y29uc3QgZ2V0Q3VycmVudEhhbmRvZmYgPSAoKTogSUhhbmRPZmYgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEhhbmRvZmZzID0gdGhpcy5fY3VycmVudE1vZGU/LmhhbmRPZmZzPy5nZXQoKTtcblx0XHRcdHJldHVybiBjdXJyZW50SGFuZG9mZnM/LmZpbmQoaCA9PiBoLmxhYmVsID09PSBoYW5kb2ZmTGFiZWwpID8/IGhhbmRvZmY7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxhYmVsID0gbG9jYWxpemUoJ2NoYXQuc3VnZ2VzdE5leHQuc3RhcnRXaXRoQXV0b3BpbG90JywgXCJTdGFydCB3aXRoIEF1dG9waWxvdFwiKTtcblx0XHRjb25zdCBidXR0b24gPSBkb20uJCgnLmNoYXQtd2VsY29tZS12aWV3LXN1Z2dlc3RlZC1wcm9tcHQnKTtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbGFiZWwpO1xuXG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gZG9tLmFwcGVuZChidXR0b24sIGRvbS4kKCcuY2hhdC13ZWxjb21lLXZpZXctc3VnZ2VzdGVkLXByb21wdC10aXRsZScpKTtcblx0XHR0aXRsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBsYWJlbDtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEhhbmRvZmYgPSBnZXRDdXJyZW50SGFuZG9mZigpO1xuXHRcdFx0aWYgKGN1cnJlbnRIYW5kb2ZmKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0UHJvbXB0LmZpcmUoeyBoYW5kb2ZmOiBjdXJyZW50SGFuZG9mZiwgd2l0aEF1dG9waWxvdDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdrZXlkb3duJywgZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRIYW5kb2ZmID0gZ2V0Q3VycmVudEhhbmRvZmYoKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRIYW5kb2ZmKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RQcm9tcHQuZmlyZSh7IGhhbmRvZmY6IGN1cnJlbnRIYW5kb2ZmLCB3aXRoQXV0b3BpbG90OiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5idXR0b25EaXNwb3NhYmxlcy5zZXQoYnV0dG9uLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRyZXR1cm4gYnV0dG9uO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRNb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gRGlzcG9zZSBhbGwgYnV0dG9uIGRpc3Bvc2FibGVzXG5cdFx0Zm9yIChjb25zdCBkaXNwb3NhYmxlcyBvZiB0aGlzLmJ1dHRvbkRpc3Bvc2FibGVzLnZhbHVlcygpKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuYnV0dG9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx1QkFBdUIseUJBQXlCLDZCQUE2QixtQ0FBbUM7QUFRbEgsSUFBTSx3QkFBTixjQUFvQyxXQUFXO0FBQUEsRUFjckQsWUFDeUMsc0JBQ0Ysb0JBQ0MscUJBQ0YsbUJBQ3BDO0FBQ0QsVUFBTTtBQUxrQztBQUNGO0FBQ0M7QUFDRjtBQWZ0QyxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3hFLFNBQWdCLG9CQUFpQyxLQUFLLG1CQUFtQjtBQUV6RSxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBOEIsQ0FBQztBQUN4RixTQUFnQixvQkFBaUQsS0FBSyxtQkFBbUI7QUFLekYsU0FBUSxvQkFBb0Isb0JBQUks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
