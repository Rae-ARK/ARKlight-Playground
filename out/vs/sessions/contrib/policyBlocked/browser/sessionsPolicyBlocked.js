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
import "./media/sessionsPolicyBlocked.css";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { $, addDisposableGenericMouseDownListener, append, EventType, addDisposableListener, getWindow } from "../../../../base/browser/dom.js";
import { localize } from "../../../../nls.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { URI } from "../../../../base/common/uri.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
var SessionsBlockedReason = /* @__PURE__ */ ((SessionsBlockedReason2) => {
  SessionsBlockedReason2["AgentDisabled"] = "agentDisabled";
  SessionsBlockedReason2["Loading"] = "loading";
  SessionsBlockedReason2["AccountPolicyGate"] = "accountPolicyGate";
  return SessionsBlockedReason2;
})(SessionsBlockedReason || {});
let SessionsPolicyBlockedOverlay = class extends Disposable {
  constructor(container, options, commandService, openerService, productService, layoutService) {
    super();
    this.commandService = commandService;
    this.openerService = openerService;
    this.productService = productService;
    this.overlay = append(container, $(".sessions-policy-blocked-overlay"));
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.tabIndex = -1;
    this.overlay.focus();
    this._register(toDisposable(() => this.overlay.remove()));
    const workbenchRoot = layoutService.mainContainer;
    workbenchRoot.classList.add("sessions-policy-blocked");
    this._register(toDisposable(() => workbenchRoot.classList.remove("sessions-policy-blocked")));
    const card = append(this.overlay, $(".sessions-policy-blocked-card"));
    this._register(addDisposableListener(getWindow(this.overlay), EventType.KEY_DOWN, (e) => {
      if (card.contains(e.target)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }, true));
    this._register(addDisposableGenericMouseDownListener(this.overlay, (e) => {
      if (e.target === this.overlay) {
        e.preventDefault();
        e.stopPropagation();
      }
    }));
    append(card, $("div.sessions-policy-blocked-logo"));
    switch (options.reason) {
      case "agentDisabled" /* AgentDisabled */:
        this._renderAgentDisabled(card);
        break;
      case "loading" /* Loading */:
        this._renderLoading(card);
        break;
      case "accountPolicyGate" /* AccountPolicyGate */:
        this._renderAccountPolicyGate(card, options);
        break;
    }
  }
  _renderAgentDisabled(card) {
    this.overlay.setAttribute("aria-label", localize("policyBlocked.aria", "Agents disabled by organization policy"));
    append(card, $("h2", void 0, localize("policyBlocked.title", "Agents Disabled")));
    const description = append(card, $("p"));
    append(description, document.createTextNode(localize("policyBlocked.description", "Your organization has disabled Agents via policy.")));
    append(description, document.createTextNode(" "));
    const learnMore = append(description, $("a.sessions-policy-blocked-link"));
    learnMore.textContent = localize("policyBlocked.learnMore", "Learn more");
    learnMore.href = "https://aka.ms/VSCode/Agents/docs";
    this._register(addDisposableListener(learnMore, EventType.CLICK, (e) => {
      e.preventDefault();
      this.openerService.open(URI.parse("https://aka.ms/VSCode/Agents/docs"));
    }));
    const button = this._register(new Button(card, { ...defaultButtonStyles, secondary: true }));
    button.label = localize("policyBlocked.openVSCode", "Open VS Code");
    this._register(button.onDidClick(() => this._openVSCode()));
  }
  _renderLoading(card) {
    this.overlay.setAttribute("aria-label", localize("loading.aria", "Loading"));
    append(card, $(
      "div.sessions-policy-blocked-progress-bar",
      void 0,
      $("div.sessions-policy-blocked-progress-bar-fill")
    ));
  }
  _renderAccountPolicyGate(card, options) {
    this.overlay.setAttribute("aria-label", localize("accountGate.aria", "Sign-in required by your administrator"));
    append(card, $("h2", void 0, localize("accountGate.title", "Sign-In Required")));
    const description = append(card, $("p"));
    if (options.accountName) {
      append(description, document.createTextNode(
        localize("accountGate.descriptionWithAccount", 'The account "{0}" is not a member of an organization that your administrator allows for Agents.', options.accountName)
      ));
    } else {
      append(description, document.createTextNode(
        localize("accountGate.descriptionNoAccount", "Your administrator restricts Agents to members of the organizations below.")
      ));
    }
    const approvedOrgs = options.approvedOrganizations ?? [];
    const hasConcreteOrgs = approvedOrgs.length > 0 && !approvedOrgs.includes("*");
    if (hasConcreteOrgs) {
      const orgSection = append(card, $("div.sessions-policy-blocked-orgs"));
      append(orgSection, $(
        "p.sessions-policy-blocked-orgs-label",
        void 0,
        localize("accountGate.approvedOrgs", "Allowed organizations:")
      ));
      const orgList = append(orgSection, $("ul"));
      for (const org of approvedOrgs) {
        append(orgList, $("li", void 0, org));
      }
    }
    const footer = append(card, $("p.sessions-policy-blocked-footer"));
    append(footer, document.createTextNode(localize("accountGate.contactAdmin", "Contact your administrator for more information.")));
    append(footer, document.createTextNode(" "));
    const learnMore = append(footer, $("a.sessions-policy-blocked-link"));
    learnMore.textContent = localize("accountGate.learnMore", "Learn more");
    learnMore.href = "https://code.visualstudio.com/docs/enterprise/overview";
    this._register(addDisposableListener(learnMore, EventType.CLICK, (e) => {
      e.preventDefault();
      this.openerService.open(URI.parse("https://code.visualstudio.com/docs/enterprise/overview"));
    }));
    const signInButton = this._register(new Button(card, { ...defaultButtonStyles }));
    signInButton.label = localize("accountGate.signIn", "Sign In");
    this._register(signInButton.onDidClick(() => {
      this.commandService.executeCommand("workbench.action.agenticSignIn");
    }));
  }
  _openVSCode() {
    const scheme = this.productService.parentPolicyConfig?.urlProtocol ?? this.productService.urlProtocol;
    this.openerService.open(URI.from({ scheme, query: "windowId=_blank" }), { openExternal: true });
  }
};
SessionsPolicyBlockedOverlay = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IWorkbenchLayoutService)
], SessionsPolicyBlockedOverlay);
export {
  SessionsBlockedReason,
  SessionsPolicyBlockedOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcG9saWN5QmxvY2tlZC9icm93c2VyL3Nlc3Npb25zUG9saWN5QmxvY2tlZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9zZXNzaW9uc1BvbGljeUJsb2NrZWQuY3NzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyLCBhcHBlbmQsIEV2ZW50VHlwZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBTZXNzaW9uc0Jsb2NrZWRSZWFzb24ge1xuXHRBZ2VudERpc2FibGVkID0gJ2FnZW50RGlzYWJsZWQnLFxuXHQvKiogVHJhbnNpZW50IGxvYWRpbmcgc3RhdGUgXHUyMDE0IGJsb2NrcyBVSSBidXQgc2hvd3Mgb25seSBhIHByb2dyZXNzIGJhci4gKi9cblx0TG9hZGluZyA9ICdsb2FkaW5nJyxcblx0LyoqIFNpZ25lZCBpbiBidXQgbm90IGluIGFuIGFwcHJvdmVkIG9yZyBcdTIwMTQgbXVzdCBzd2l0Y2ggYWNjb3VudHMuICovXG5cdEFjY291bnRQb2xpY3lHYXRlID0gJ2FjY291bnRQb2xpY3lHYXRlJyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbnNCbG9ja2VkT3ZlcmxheU9wdGlvbnMge1xuXHRyZWFkb25seSByZWFzb246IFNlc3Npb25zQmxvY2tlZFJlYXNvbjtcblx0cmVhZG9ubHkgYXBwcm92ZWRPcmdhbml6YXRpb25zPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGFjY291bnROYW1lPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEZ1bGwtd2luZG93IGltcGFzc2FibGUgb3ZlcmxheSBzaG93biB3aGVuIHRoZSBBZ2VudHMgYXBwIGlzIGJsb2NrZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1BvbGljeUJsb2NrZWRPdmVybGF5IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvdmVybGF5OiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG9wdGlvbnM6IElTZXNzaW9uc0Jsb2NrZWRPdmVybGF5T3B0aW9ucyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm92ZXJsYXkgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbnMtcG9saWN5LWJsb2NrZWQtb3ZlcmxheScpKTtcblx0XHR0aGlzLm92ZXJsYXkuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2RpYWxvZycpO1xuXHRcdHRoaXMub3ZlcmxheS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbW9kYWwnLCAndHJ1ZScpO1xuXHRcdHRoaXMub3ZlcmxheS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMub3ZlcmxheS5mb2N1cygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLm92ZXJsYXkucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHdvcmtiZW5jaFJvb3QgPSBsYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXI7XG5cdFx0d29ya2JlbmNoUm9vdC5jbGFzc0xpc3QuYWRkKCdzZXNzaW9ucy1wb2xpY3ktYmxvY2tlZCcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB3b3JrYmVuY2hSb290LmNsYXNzTGlzdC5yZW1vdmUoJ3Nlc3Npb25zLXBvbGljeS1ibG9ja2VkJykpKTtcblxuXHRcdGNvbnN0IGNhcmQgPSBhcHBlbmQodGhpcy5vdmVybGF5LCAkKCcuc2Vzc2lvbnMtcG9saWN5LWJsb2NrZWQtY2FyZCcpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihnZXRXaW5kb3codGhpcy5vdmVybGF5KSwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGNhcmQuY29udGFpbnMoZS50YXJnZXQgYXMgTm9kZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9LCB0cnVlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHRoaXMub3ZlcmxheSwgZSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQgPT09IHRoaXMub3ZlcmxheSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXBwZW5kKGNhcmQsICQoJ2Rpdi5zZXNzaW9ucy1wb2xpY3ktYmxvY2tlZC1sb2dvJykpO1xuXG5cdFx0c3dpdGNoIChvcHRpb25zLnJlYXNvbikge1xuXHRcdFx0Y2FzZSBTZXNzaW9uc0Jsb2NrZWRSZWFzb24uQWdlbnREaXNhYmxlZDpcblx0XHRcdFx0dGhpcy5fcmVuZGVyQWdlbnREaXNhYmxlZChjYXJkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFNlc3Npb25zQmxvY2tlZFJlYXNvbi5Mb2FkaW5nOlxuXHRcdFx0XHR0aGlzLl9yZW5kZXJMb2FkaW5nKGNhcmQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU2Vzc2lvbnNCbG9ja2VkUmVhc29uLkFjY291bnRQb2xpY3lHYXRlOlxuXHRcdFx0XHR0aGlzLl9yZW5kZXJBY2NvdW50UG9saWN5R2F0ZShjYXJkLCBvcHRpb25zKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQWdlbnREaXNhYmxlZChjYXJkOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMub3ZlcmxheS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgncG9saWN5QmxvY2tlZC5hcmlhJywgXCJBZ2VudHMgZGlzYWJsZWQgYnkgb3JnYW5pemF0aW9uIHBvbGljeVwiKSk7XG5cblx0XHRhcHBlbmQoY2FyZCwgJCgnaDInLCB1bmRlZmluZWQsIGxvY2FsaXplKCdwb2xpY3lCbG9ja2VkLnRpdGxlJywgXCJBZ2VudHMgRGlzYWJsZWRcIikpKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYXBwZW5kKGNhcmQsICQoJ3AnKSk7XG5cdFx0YXBwZW5kKGRlc2NyaXB0aW9uLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsb2NhbGl6ZSgncG9saWN5QmxvY2tlZC5kZXNjcmlwdGlvbicsIFwiWW91ciBvcmdhbml6YXRpb24gaGFzIGRpc2FibGVkIEFnZW50cyB2aWEgcG9saWN5LlwiKSkpO1xuXHRcdGFwcGVuZChkZXNjcmlwdGlvbiwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyAnKSk7XG5cdFx0Y29uc3QgbGVhcm5Nb3JlID0gYXBwZW5kKGRlc2NyaXB0aW9uLCAkKCdhLnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0bGVhcm5Nb3JlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BvbGljeUJsb2NrZWQubGVhcm5Nb3JlJywgXCJMZWFybiBtb3JlXCIpO1xuXHRcdGxlYXJuTW9yZS5ocmVmID0gJ2h0dHBzOi8vYWthLm1zL1ZTQ29kZS9BZ2VudHMvZG9jcyc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxlYXJuTW9yZSwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy9WU0NvZGUvQWdlbnRzL2RvY3MnKSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihjYXJkLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0YnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3BvbGljeUJsb2NrZWQub3BlblZTQ29kZScsIFwiT3BlbiBWUyBDb2RlXCIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuX29wZW5WU0NvZGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTG9hZGluZyhjYXJkOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMub3ZlcmxheS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnbG9hZGluZy5hcmlhJywgXCJMb2FkaW5nXCIpKTtcblx0XHRhcHBlbmQoY2FyZCwgJCgnZGl2LnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLXByb2dyZXNzLWJhcicsIHVuZGVmaW5lZCxcblx0XHRcdCQoJ2Rpdi5zZXNzaW9ucy1wb2xpY3ktYmxvY2tlZC1wcm9ncmVzcy1iYXItZmlsbCcpXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJBY2NvdW50UG9saWN5R2F0ZShjYXJkOiBIVE1MRWxlbWVudCwgb3B0aW9uczogSVNlc3Npb25zQmxvY2tlZE92ZXJsYXlPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5vdmVybGF5LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdhY2NvdW50R2F0ZS5hcmlhJywgXCJTaWduLWluIHJlcXVpcmVkIGJ5IHlvdXIgYWRtaW5pc3RyYXRvclwiKSk7XG5cblx0XHRhcHBlbmQoY2FyZCwgJCgnaDInLCB1bmRlZmluZWQsIGxvY2FsaXplKCdhY2NvdW50R2F0ZS50aXRsZScsIFwiU2lnbi1JbiBSZXF1aXJlZFwiKSkpO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhcHBlbmQoY2FyZCwgJCgncCcpKTtcblx0XHRpZiAob3B0aW9ucy5hY2NvdW50TmFtZSkge1xuXHRcdFx0YXBwZW5kKGRlc2NyaXB0aW9uLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcblx0XHRcdFx0bG9jYWxpemUoJ2FjY291bnRHYXRlLmRlc2NyaXB0aW9uV2l0aEFjY291bnQnLCBcIlRoZSBhY2NvdW50IFxcXCJ7MH1cXFwiIGlzIG5vdCBhIG1lbWJlciBvZiBhbiBvcmdhbml6YXRpb24gdGhhdCB5b3VyIGFkbWluaXN0cmF0b3IgYWxsb3dzIGZvciBBZ2VudHMuXCIsIG9wdGlvbnMuYWNjb3VudE5hbWUpXG5cdFx0XHQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXBwZW5kKGRlc2NyaXB0aW9uLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcblx0XHRcdFx0bG9jYWxpemUoJ2FjY291bnRHYXRlLmRlc2NyaXB0aW9uTm9BY2NvdW50JywgXCJZb3VyIGFkbWluaXN0cmF0b3IgcmVzdHJpY3RzIEFnZW50cyB0byBtZW1iZXJzIG9mIHRoZSBvcmdhbml6YXRpb25zIGJlbG93LlwiKVxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBwcm92ZWRPcmdzID0gb3B0aW9ucy5hcHByb3ZlZE9yZ2FuaXphdGlvbnMgPz8gW107XG5cdFx0Y29uc3QgaGFzQ29uY3JldGVPcmdzID0gYXBwcm92ZWRPcmdzLmxlbmd0aCA+IDAgJiYgIWFwcHJvdmVkT3Jncy5pbmNsdWRlcygnKicpO1xuXHRcdGlmIChoYXNDb25jcmV0ZU9yZ3MpIHtcblx0XHRcdGNvbnN0IG9yZ1NlY3Rpb24gPSBhcHBlbmQoY2FyZCwgJCgnZGl2LnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLW9yZ3MnKSk7XG5cdFx0XHRhcHBlbmQob3JnU2VjdGlvbiwgJCgncC5zZXNzaW9ucy1wb2xpY3ktYmxvY2tlZC1vcmdzLWxhYmVsJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWNjb3VudEdhdGUuYXBwcm92ZWRPcmdzJywgXCJBbGxvd2VkIG9yZ2FuaXphdGlvbnM6XCIpXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IG9yZ0xpc3QgPSBhcHBlbmQob3JnU2VjdGlvbiwgJCgndWwnKSk7XG5cdFx0XHRmb3IgKGNvbnN0IG9yZyBvZiBhcHByb3ZlZE9yZ3MpIHtcblx0XHRcdFx0YXBwZW5kKG9yZ0xpc3QsICQoJ2xpJywgdW5kZWZpbmVkLCBvcmcpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb290ZXIgPSBhcHBlbmQoY2FyZCwgJCgncC5zZXNzaW9ucy1wb2xpY3ktYmxvY2tlZC1mb290ZXInKSk7XG5cdFx0YXBwZW5kKGZvb3RlciwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobG9jYWxpemUoJ2FjY291bnRHYXRlLmNvbnRhY3RBZG1pbicsIFwiQ29udGFjdCB5b3VyIGFkbWluaXN0cmF0b3IgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIpKSk7XG5cdFx0YXBwZW5kKGZvb3RlciwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyAnKSk7XG5cdFx0Y29uc3QgbGVhcm5Nb3JlID0gYXBwZW5kKGZvb3RlciwgJCgnYS5zZXNzaW9ucy1wb2xpY3ktYmxvY2tlZC1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdGxlYXJuTW9yZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhY2NvdW50R2F0ZS5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmVcIik7XG5cdFx0bGVhcm5Nb3JlLmhyZWYgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lbnRlcnByaXNlL292ZXJ2aWV3Jztcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIobGVhcm5Nb3JlLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZW50ZXJwcmlzZS9vdmVydmlldycpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzaWduSW5CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGNhcmQsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0c2lnbkluQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2FjY291bnRHYXRlLnNpZ25JbicsIFwiU2lnbiBJblwiKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzaWduSW5CdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFnZW50aWNTaWduSW4nKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuVlNDb2RlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjaGVtZSA9IHRoaXMucHJvZHVjdFNlcnZpY2UucGFyZW50UG9saWN5Q29uZmlnPy51cmxQcm90b2NvbCA/PyB0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sO1xuXHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5mcm9tKHsgc2NoZW1lLCBxdWVyeTogJ3dpbmRvd0lkPV9ibGFuaycgfSksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsR0FBRyx1Q0FBdUMsUUFBUSxXQUFXLHVCQUF1QixpQkFBaUI7QUFDOUcsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUVqQyxJQUFXLHdCQUFYLGtCQUFXQSwyQkFBWDtBQUNOLEVBQUFBLHVCQUFBLG1CQUFnQjtBQUVoQixFQUFBQSx1QkFBQSxhQUFVO0FBRVYsRUFBQUEsdUJBQUEsdUJBQW9CO0FBTEgsU0FBQUE7QUFBQSxHQUFBO0FBaUJYLElBQU0sK0JBQU4sY0FBMkMsV0FBVztBQUFBLEVBSTVELFlBQ0MsV0FDQSxTQUNrQyxnQkFDRCxlQUNDLGdCQUNULGVBQ3hCO0FBQ0QsVUFBTTtBQUw0QjtBQUNEO0FBQ0M7QUFLbEMsU0FBSyxVQUFVLE9BQU8sV0FBVyxFQUFFLGtDQUFrQyxDQUFDO0FBQ3RFLFNBQUssUUFBUSxhQUFhLFFBQVEsUUFBUTtBQUMxQyxTQUFLLFFBQVEsYUFBYSxjQUFjLE1BQU07QUFDOUMsU0FBSyxRQUFRLFdBQVc7QUFDeEIsU0FBSyxRQUFRLE1BQU07QUFDbkIsU0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLFFBQVEsT0FBTyxDQUFDLENBQUM7QUFFeEQsVUFBTSxnQkFBZ0IsY0FBYztBQUNwQyxrQkFBYyxVQUFVLElBQUkseUJBQXlCO0FBQ3JELFNBQUssVUFBVSxhQUFhLE1BQU0sY0FBYyxVQUFVLE9BQU8seUJBQXlCLENBQUMsQ0FBQztBQUU1RixVQUFNLE9BQU8sT0FBTyxLQUFLLFNBQVMsRUFBRSwrQkFBK0IsQ0FBQztBQUVwRSxTQUFLLFVBQVUsc0JBQXNCLFVBQVUsS0FBSyxPQUFPLEdBQUcsVUFBVSxVQUFVLENBQUMsTUFBcUI7QUFDdkcsVUFBSSxLQUFLLFNBQVMsRUFBRSxNQUFjLEdBQUc7QUFDcEM7QUFBQSxNQUNEO0FBQ0EsUUFBRSxlQUFlO0FBQ2pCLFFBQUUsZ0JBQWdCO0FBQUEsSUFDbkIsR0FBRyxJQUFJLENBQUM7QUFFUixTQUFLLFVBQVUsc0NBQXNDLEtBQUssU0FBUyxPQUFLO0FBQ3ZFLFVBQUksRUFBRSxXQUFXLEtBQUssU0FBUztBQUM5QixVQUFFLGVBQWU7QUFDakIsVUFBRSxnQkFBZ0I7QUFBQSxNQUNuQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxNQUFNLEVBQUUsa0NBQWtDLENBQUM7QUFFbEQsWUFBUSxRQUFRLFFBQVE7QUFBQSxNQUN2QixLQUFLO0FBQ0osYUFBSyxxQkFBcUIsSUFBSTtBQUM5QjtBQUFBLE1BQ0QsS0FBSztBQUNKLGFBQUssZUFBZSxJQUFJO0FBQ3hCO0FBQUEsTUFDRCxLQUFLO0FBQ0osYUFBSyx5QkFBeUIsTUFBTSxPQUFPO0FBQzNDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixNQUF5QjtBQUNyRCxTQUFLLFFBQVEsYUFBYSxjQUFjLFNBQVMsc0JBQXNCLHdDQUF3QyxDQUFDO0FBRWhILFdBQU8sTUFBTSxFQUFFLE1BQU0sUUFBVyxTQUFTLHVCQUF1QixpQkFBaUIsQ0FBQyxDQUFDO0FBRW5GLFVBQU0sY0FBYyxPQUFPLE1BQU0sRUFBRSxHQUFHLENBQUM7QUFDdkMsV0FBTyxhQUFhLFNBQVMsZUFBZSxTQUFTLDZCQUE2QixtREFBbUQsQ0FBQyxDQUFDO0FBQ3ZJLFdBQU8sYUFBYSxTQUFTLGVBQWUsR0FBRyxDQUFDO0FBQ2hELFVBQU0sWUFBWSxPQUFPLGFBQWEsRUFBRSxnQ0FBZ0MsQ0FBQztBQUN6RSxjQUFVLGNBQWMsU0FBUywyQkFBMkIsWUFBWTtBQUN4RSxjQUFVLE9BQU87QUFDakIsU0FBSyxVQUFVLHNCQUFzQixXQUFXLFVBQVUsT0FBTyxDQUFDLE1BQU07QUFDdkUsUUFBRSxlQUFlO0FBQ2pCLFdBQUssY0FBYyxLQUFLLElBQUksTUFBTSxtQ0FBbUMsQ0FBQztBQUFBLElBQ3ZFLENBQUMsQ0FBQztBQUVGLFVBQU0sU0FBUyxLQUFLLFVBQVUsSUFBSSxPQUFPLE1BQU0sRUFBRSxHQUFHLHFCQUFxQixXQUFXLEtBQUssQ0FBQyxDQUFDO0FBQzNGLFdBQU8sUUFBUSxTQUFTLDRCQUE0QixjQUFjO0FBQ2xFLFNBQUssVUFBVSxPQUFPLFdBQVcsTUFBTSxLQUFLLFlBQVksQ0FBQyxDQUFDO0FBQUEsRUFDM0Q7QUFBQSxFQUVRLGVBQWUsTUFBeUI7QUFDL0MsU0FBSyxRQUFRLGFBQWEsY0FBYyxTQUFTLGdCQUFnQixTQUFTLENBQUM7QUFDM0UsV0FBTyxNQUFNO0FBQUEsTUFBRTtBQUFBLE1BQTRDO0FBQUEsTUFDMUQsRUFBRSwrQ0FBK0M7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEseUJBQXlCLE1BQW1CLFNBQStDO0FBQ2xHLFNBQUssUUFBUSxhQUFhLGNBQWMsU0FBUyxvQkFBb0Isd0NBQXdDLENBQUM7QUFFOUcsV0FBTyxNQUFNLEVBQUUsTUFBTSxRQUFXLFNBQVMscUJBQXFCLGtCQUFrQixDQUFDLENBQUM7QUFFbEYsVUFBTSxjQUFjLE9BQU8sTUFBTSxFQUFFLEdBQUcsQ0FBQztBQUN2QyxRQUFJLFFBQVEsYUFBYTtBQUN4QixhQUFPLGFBQWEsU0FBUztBQUFBLFFBQzVCLFNBQVMsc0NBQXNDLG1HQUFxRyxRQUFRLFdBQVc7QUFBQSxNQUN4SyxDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sYUFBTyxhQUFhLFNBQVM7QUFBQSxRQUM1QixTQUFTLG9DQUFvQyw0RUFBNEU7QUFBQSxNQUMxSCxDQUFDO0FBQUEsSUFDRjtBQUVBLFVBQU0sZUFBZSxRQUFRLHlCQUF5QixDQUFDO0FBQ3ZELFVBQU0sa0JBQWtCLGFBQWEsU0FBUyxLQUFLLENBQUMsYUFBYSxTQUFTLEdBQUc7QUFDN0UsUUFBSSxpQkFBaUI7QUFDcEIsWUFBTSxhQUFhLE9BQU8sTUFBTSxFQUFFLGtDQUFrQyxDQUFDO0FBQ3JFLGFBQU8sWUFBWTtBQUFBLFFBQUU7QUFBQSxRQUF3QztBQUFBLFFBQzVELFNBQVMsNEJBQTRCLHdCQUF3QjtBQUFBLE1BQzlELENBQUM7QUFDRCxZQUFNLFVBQVUsT0FBTyxZQUFZLEVBQUUsSUFBSSxDQUFDO0FBQzFDLGlCQUFXLE9BQU8sY0FBYztBQUMvQixlQUFPLFNBQVMsRUFBRSxNQUFNLFFBQVcsR0FBRyxDQUFDO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLE9BQU8sTUFBTSxFQUFFLGtDQUFrQyxDQUFDO0FBQ2pFLFdBQU8sUUFBUSxTQUFTLGVBQWUsU0FBUyw0QkFBNEIsa0RBQWtELENBQUMsQ0FBQztBQUNoSSxXQUFPLFFBQVEsU0FBUyxlQUFlLEdBQUcsQ0FBQztBQUMzQyxVQUFNLFlBQVksT0FBTyxRQUFRLEVBQUUsZ0NBQWdDLENBQUM7QUFDcEUsY0FBVSxjQUFjLFNBQVMseUJBQXlCLFlBQVk7QUFDdEUsY0FBVSxPQUFPO0FBQ2pCLFNBQUssVUFBVSxzQkFBc0IsV0FBVyxVQUFVLE9BQU8sQ0FBQyxNQUFNO0FBQ3ZFLFFBQUUsZUFBZTtBQUNqQixXQUFLLGNBQWMsS0FBSyxJQUFJLE1BQU0sd0RBQXdELENBQUM7QUFBQSxJQUM1RixDQUFDLENBQUM7QUFFRixVQUFNLGVBQWUsS0FBSyxVQUFVLElBQUksT0FBTyxNQUFNLEVBQUUsR0FBRyxvQkFBb0IsQ0FBQyxDQUFDO0FBQ2hGLGlCQUFhLFFBQVEsU0FBUyxzQkFBc0IsU0FBUztBQUM3RCxTQUFLLFVBQVUsYUFBYSxXQUFXLE1BQU07QUFDNUMsV0FBSyxlQUFlLGVBQWUsZ0NBQWdDO0FBQUEsSUFDcEUsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsY0FBb0I7QUFDM0IsVUFBTSxTQUFTLEtBQUssZUFBZSxvQkFBb0IsZUFBZSxLQUFLLGVBQWU7QUFDMUYsU0FBSyxjQUFjLEtBQUssSUFBSSxLQUFLLEVBQUUsUUFBUSxPQUFPLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxjQUFjLEtBQUssQ0FBQztBQUFBLEVBQy9GO0FBQ0Q7QUF4SWEsK0JBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FWVTsiLAogICJuYW1lcyI6IFsiU2Vzc2lvbnNCbG9ja2VkUmVhc29uIl0KfQo=
