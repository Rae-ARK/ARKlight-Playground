import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ChatEntitlement } from "../../../../../workbench/services/chat/common/chatEntitlementService.js";
import { getAccountProfileImageUrl, getAccountTitleBarBadgeKey, getAccountTitleBarState } from "../../../../browser/accountTitleBarState.js";
suite("Sessions - Account Title Bar State", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createState(overrides = {}) {
    return {
      isAccountLoading: false,
      accountName: "lee@example.com",
      accountProviderLabel: "GitHub",
      entitlement: ChatEntitlement.Pro,
      sentiment: {},
      quotas: {},
      ...overrides
    };
  }
  test("shows low token badge for Copilot Free users", () => {
    const state = getAccountTitleBarState(createState({
      entitlement: ChatEntitlement.Free,
      quotas: { chat: { percentRemaining: 10, unlimited: false } }
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      badge: state.badge,
      dotBadge: state.dotBadge,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Tokens Remaining",
      badge: "10%",
      dotBadge: "error",
      kind: "warning"
    });
    assert.strictEqual(getAccountTitleBarBadgeKey(state), "copilot:error:10%");
  });
  test("shows warning dot badge for low but non-critical tokens", () => {
    const state = getAccountTitleBarState(createState({
      entitlement: ChatEntitlement.Free,
      quotas: { chat: { percentRemaining: 20, unlimited: false } }
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      badge: state.badge,
      dotBadge: state.dotBadge,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Tokens Remaining",
      badge: "20%",
      dotBadge: "warning",
      kind: "accent"
    });
  });
  test("shows quota reached warning when free quota is exhausted", () => {
    const state = getAccountTitleBarState(createState({
      entitlement: ChatEntitlement.Free,
      quotas: { completions: { percentRemaining: 0, unlimited: false } }
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      dotBadge: state.dotBadge,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Quota Reached",
      dotBadge: "error",
      kind: "warning"
    });
    assert.strictEqual(getAccountTitleBarBadgeKey(state), "copilot:error:");
  });
  test("falls back to signed-in account label when no higher-priority state exists", () => {
    const state = getAccountTitleBarState(createState());
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      kind: state.kind,
      revealLabelOnHover: state.revealLabelOnHover
    }, {
      source: "account",
      label: "lee@example.com",
      kind: "default",
      revealLabelOnHover: true
    });
  });
  test("reveals loading account label only on hover", () => {
    const state = getAccountTitleBarState(createState({
      isAccountLoading: true,
      accountName: void 0,
      accountProviderLabel: void 0,
      entitlement: ChatEntitlement.Unknown
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      kind: state.kind,
      revealLabelOnHover: state.revealLabelOnHover
    }, {
      source: "account",
      label: "Loading Account...",
      kind: "default",
      revealLabelOnHover: true
    });
  });
  test("shows sign in state when no account is available", () => {
    const state = getAccountTitleBarState(createState({
      accountName: void 0,
      accountProviderLabel: void 0,
      entitlement: ChatEntitlement.Unknown
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Agents Signed Out",
      kind: "prominent"
    });
  });
  test("returns a GitHub profile image URL for GitHub accounts", () => {
    assert.strictEqual(
      getAccountProfileImageUrl("github", "mona lisa"),
      "https://github.com/mona%20lisa.png?size=64"
    );
  });
  test("falls back to the codicon when no GitHub profile image URL is available", () => {
    assert.strictEqual(getAccountProfileImageUrl(void 0, "octocat"), void 0);
    assert.strictEqual(getAccountProfileImageUrl("github-enterprise", "octocat"), void 0);
    assert.strictEqual(getAccountProfileImageUrl("github", void 0), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWNjb3VudE1lbnUvdGVzdC9icm93c2VyL2FjY291bnRUaXRsZUJhclN0YXRlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEFjY291bnRQcm9maWxlSW1hZ2VVcmwsIGdldEFjY291bnRUaXRsZUJhckJhZGdlS2V5LCBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZSwgSUFjY291bnRUaXRsZUJhclN0YXRlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvYWNjb3VudFRpdGxlQmFyU3RhdGUuanMnO1xuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBBY2NvdW50IFRpdGxlIEJhciBTdGF0ZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdGF0ZShvdmVycmlkZXM6IFBhcnRpYWw8SUFjY291bnRUaXRsZUJhclN0YXRlQ29udGV4dD4gPSB7fSk6IElBY2NvdW50VGl0bGVCYXJTdGF0ZUNvbnRleHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc0FjY291bnRMb2FkaW5nOiBmYWxzZSxcblx0XHRcdGFjY291bnROYW1lOiAnbGVlQGV4YW1wbGUuY29tJyxcblx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiAnR2l0SHViJyxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdFx0c2VudGltZW50OiB7fSxcblx0XHRcdHF1b3Rhczoge30sXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Nob3dzIGxvdyB0b2tlbiBiYWRnZSBmb3IgQ29waWxvdCBGcmVlIHVzZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUoY3JlYXRlU3RhdGUoe1xuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdFx0cXVvdGFzOiB7IGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMTAsIHVubGltaXRlZDogZmFsc2UgfSB9LFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c291cmNlOiBzdGF0ZS5zb3VyY2UsXG5cdFx0XHRsYWJlbDogc3RhdGUubGFiZWwsXG5cdFx0XHRiYWRnZTogc3RhdGUuYmFkZ2UsXG5cdFx0XHRkb3RCYWRnZTogc3RhdGUuZG90QmFkZ2UsXG5cdFx0XHRraW5kOiBzdGF0ZS5raW5kLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZTogJ2NvcGlsb3QnLFxuXHRcdFx0bGFiZWw6ICdUb2tlbnMgUmVtYWluaW5nJyxcblx0XHRcdGJhZGdlOiAnMTAlJyxcblx0XHRcdGRvdEJhZGdlOiAnZXJyb3InLFxuXHRcdFx0a2luZDogJ3dhcm5pbmcnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFjY291bnRUaXRsZUJhckJhZGdlS2V5KHN0YXRlKSwgJ2NvcGlsb3Q6ZXJyb3I6MTAlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIHdhcm5pbmcgZG90IGJhZGdlIGZvciBsb3cgYnV0IG5vbi1jcml0aWNhbCB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZShjcmVhdGVTdGF0ZSh7XG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUsXG5cdFx0XHRxdW90YXM6IHsgY2hhdDogeyBwZXJjZW50UmVtYWluaW5nOiAyMCwgdW5saW1pdGVkOiBmYWxzZSB9IH0sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2U6IHN0YXRlLnNvdXJjZSxcblx0XHRcdGxhYmVsOiBzdGF0ZS5sYWJlbCxcblx0XHRcdGJhZGdlOiBzdGF0ZS5iYWRnZSxcblx0XHRcdGRvdEJhZGdlOiBzdGF0ZS5kb3RCYWRnZSxcblx0XHRcdGtpbmQ6IHN0YXRlLmtpbmQsXG5cdFx0fSwge1xuXHRcdFx0c291cmNlOiAnY29waWxvdCcsXG5cdFx0XHRsYWJlbDogJ1Rva2VucyBSZW1haW5pbmcnLFxuXHRcdFx0YmFkZ2U6ICcyMCUnLFxuXHRcdFx0ZG90QmFkZ2U6ICd3YXJuaW5nJyxcblx0XHRcdGtpbmQ6ICdhY2NlbnQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBxdW90YSByZWFjaGVkIHdhcm5pbmcgd2hlbiBmcmVlIHF1b3RhIGlzIGV4aGF1c3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGdldEFjY291bnRUaXRsZUJhclN0YXRlKGNyZWF0ZVN0YXRlKHtcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHRcdHF1b3RhczogeyBjb21wbGV0aW9uczogeyBwZXJjZW50UmVtYWluaW5nOiAwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0gfSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNvdXJjZTogc3RhdGUuc291cmNlLFxuXHRcdFx0bGFiZWw6IHN0YXRlLmxhYmVsLFxuXHRcdFx0ZG90QmFkZ2U6IHN0YXRlLmRvdEJhZGdlLFxuXHRcdFx0a2luZDogc3RhdGUua2luZCxcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2U6ICdjb3BpbG90Jyxcblx0XHRcdGxhYmVsOiAnUXVvdGEgUmVhY2hlZCcsXG5cdFx0XHRkb3RCYWRnZTogJ2Vycm9yJyxcblx0XHRcdGtpbmQ6ICd3YXJuaW5nJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleShzdGF0ZSksICdjb3BpbG90OmVycm9yOicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHNpZ25lZC1pbiBhY2NvdW50IGxhYmVsIHdoZW4gbm8gaGlnaGVyLXByaW9yaXR5IHN0YXRlIGV4aXN0cycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGdldEFjY291bnRUaXRsZUJhclN0YXRlKGNyZWF0ZVN0YXRlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2U6IHN0YXRlLnNvdXJjZSxcblx0XHRcdGxhYmVsOiBzdGF0ZS5sYWJlbCxcblx0XHRcdGtpbmQ6IHN0YXRlLmtpbmQsXG5cdFx0XHRyZXZlYWxMYWJlbE9uSG92ZXI6IHN0YXRlLnJldmVhbExhYmVsT25Ib3Zlcixcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2U6ICdhY2NvdW50Jyxcblx0XHRcdGxhYmVsOiAnbGVlQGV4YW1wbGUuY29tJyxcblx0XHRcdGtpbmQ6ICdkZWZhdWx0Jyxcblx0XHRcdHJldmVhbExhYmVsT25Ib3ZlcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV2ZWFscyBsb2FkaW5nIGFjY291bnQgbGFiZWwgb25seSBvbiBob3ZlcicsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGdldEFjY291bnRUaXRsZUJhclN0YXRlKGNyZWF0ZVN0YXRlKHtcblx0XHRcdGlzQWNjb3VudExvYWRpbmc6IHRydWUsXG5cdFx0XHRhY2NvdW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0YWNjb3VudFByb3ZpZGVyTGFiZWw6IHVuZGVmaW5lZCxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuVW5rbm93bixcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNvdXJjZTogc3RhdGUuc291cmNlLFxuXHRcdFx0bGFiZWw6IHN0YXRlLmxhYmVsLFxuXHRcdFx0a2luZDogc3RhdGUua2luZCxcblx0XHRcdHJldmVhbExhYmVsT25Ib3Zlcjogc3RhdGUucmV2ZWFsTGFiZWxPbkhvdmVyLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZTogJ2FjY291bnQnLFxuXHRcdFx0bGFiZWw6ICdMb2FkaW5nIEFjY291bnQuLi4nLFxuXHRcdFx0a2luZDogJ2RlZmF1bHQnLFxuXHRcdFx0cmV2ZWFsTGFiZWxPbkhvdmVyOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBzaWduIGluIHN0YXRlIHdoZW4gbm8gYWNjb3VudCBpcyBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZShjcmVhdGVTdGF0ZSh7XG5cdFx0XHRhY2NvdW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0YWNjb3VudFByb3ZpZGVyTGFiZWw6IHVuZGVmaW5lZCxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuVW5rbm93bixcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNvdXJjZTogc3RhdGUuc291cmNlLFxuXHRcdFx0bGFiZWw6IHN0YXRlLmxhYmVsLFxuXHRcdFx0a2luZDogc3RhdGUua2luZCxcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2U6ICdjb3BpbG90Jyxcblx0XHRcdGxhYmVsOiAnQWdlbnRzIFNpZ25lZCBPdXQnLFxuXHRcdFx0a2luZDogJ3Byb21pbmVudCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYSBHaXRIdWIgcHJvZmlsZSBpbWFnZSBVUkwgZm9yIEdpdEh1YiBhY2NvdW50cycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsKCdnaXRodWInLCAnbW9uYSBsaXNhJyksXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21vbmElMjBsaXNhLnBuZz9zaXplPTY0J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIGNvZGljb24gd2hlbiBubyBHaXRIdWIgcHJvZmlsZSBpbWFnZSBVUkwgaXMgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsKHVuZGVmaW5lZCwgJ29jdG9jYXQnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCgnZ2l0aHViLWVudGVycHJpc2UnLCAnb2N0b2NhdCcpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsKCdnaXRodWInLCB1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
