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
import "./media/chatStatus.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from "../../../../services/statusbar/browser/statusbar.js";
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { disposableLongTimeout, disposableTimeout } from "../../../../../base/common/async.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { IInlineCompletionsService } from "../../../../../editor/browser/services/inlineCompletionsService.js";
import { ChatStatusDashboard } from "./chatStatusDashboard.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { $ as h, disposableWindowInterval } from "../../../../../base/browser/dom.js";
import { isNewUser } from "./chatStatus.js";
import product from "../../../../../platform/product/common/product.js";
import { isCompletionsEnabled } from "../../../../../editor/common/services/completionsEnablement.js";
import { CHAT_SETUP_ACTION_ID } from "../actions/chatActions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { InEditorZenModeContext } from "../../../../common/contextkeys.js";
import { ChatConfiguration } from "../../common/constants.js";
function isTrackedEntitlement(entitlement) {
  switch (entitlement) {
    case ChatEntitlement.Free:
    case ChatEntitlement.EDU:
    case ChatEntitlement.Pro:
    case ChatEntitlement.ProPlus:
    case ChatEntitlement.Business:
    case ChatEntitlement.Enterprise:
      return true;
    default:
      return false;
  }
}
function isQuotaBlocked(quotas) {
  const premiumChat = quotas.premiumChat;
  if (premiumChat === void 0) {
    return false;
  }
  return premiumChat.unlimited ? premiumChat.hasQuota === false : premiumChat.percentRemaining === 0;
}
function hasResolvedQuota(quotas) {
  return quotas.premiumChat !== void 0;
}
function computeQuotaResumeState(previous, entitlement, quotas) {
  if (!isTrackedEntitlement(entitlement)) {
    return "none";
  }
  const additionalSpend = quotas.additionalUsageEnabled === true;
  if (!additionalSpend && isQuotaBlocked(quotas)) {
    return "blocked";
  }
  if (previous !== "blocked") {
    return previous;
  }
  if (additionalSpend) {
    return "none";
  }
  return hasResolvedQuota(quotas) ? "resumed" : "blocked";
}
let ChatStatusBarEntry = class extends Disposable {
  constructor(chatEntitlementService, instantiationService, statusbarService, editorService, configurationService, completionsService, contextKeyService, storageService) {
    super();
    this.chatEntitlementService = chatEntitlementService;
    this.instantiationService = instantiationService;
    this.statusbarService = statusbarService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.completionsService = completionsService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    // re-check 5 min after a passed reset time
    this.entry = void 0;
    this.activeCodeEditorListener = this._register(new MutableDisposable());
    this.entryAnchor = h("span");
    this.quotaResetTimer = this._register(new MutableDisposable());
    this.quotaRefresh = this._register(new MutableDisposable());
    this.clearResumedScheduler = this._register(new MutableDisposable());
    this.quotaResumeState = this.readPersistedQuotaResumeState();
    this.dashboardTooltip = {
      element: (token) => {
        this.onDashboardOpened();
        const store = new DisposableStore();
        store.add(token.onCancellationRequested(() => {
          store.dispose();
        }));
        const elem = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, void 0);
        store.add(disposableWindowInterval(mainWindow, () => {
          if (!elem.isConnected) {
            store.dispose();
          }
        }, 2e3));
        return elem;
      }
    };
    this.update();
    this.registerListeners();
    this.initializeQuotaResumeState();
  }
  update() {
    const sentiment = this.chatEntitlementService.sentiment;
    if (!sentiment.hidden) {
      const props = this.getEntryProps();
      if (this.entry) {
        this.entry.update(props);
      } else {
        this.entry = this.statusbarService.addEntry(props, "chat.statusBarEntry", StatusbarAlignment.RIGHT, { location: { id: "status.editor.mode", priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });
      }
    } else {
      this.entry?.dispose();
      this.entry = void 0;
    }
  }
  registerListeners() {
    this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.onQuotaChanged()));
    this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.onQuotaChanged()));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.update()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.onQuotaChanged()));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(ChatStatusBarEntry.TITLE_BAR_CONTEXT_KEYS)) {
        this.update();
      }
    }));
    this._register(this.completionsService.onDidChangeIsSnoozing(() => this.update()));
    this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(product.defaultChatAgent?.completionsEnablementSetting) || e.affectsConfiguration(ChatConfiguration.TitleBarSignInEnabled)) {
        this.update();
      }
    }));
  }
  onDidActiveEditorChange() {
    this.update();
    this.activeCodeEditorListener.clear();
    const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
    if (activeCodeEditor) {
      this.activeCodeEditorListener.value = activeCodeEditor.onDidChangeModelLanguage(() => {
        this.update();
      });
    }
  }
  //#region --- Quota Resume Tracking
  onQuotaChanged() {
    this.evaluateQuotaResumeState();
    this.update();
  }
  evaluateQuotaResumeState() {
    const next = computeQuotaResumeState(this.quotaResumeState, this.chatEntitlementService.entitlement, this.chatEntitlementService.quotas);
    this.setQuotaResumeState(next);
    if (next === "blocked") {
      this.scheduleQuotaResetRefresh();
    } else {
      this.quotaResetTimer.clear();
    }
  }
  getQuotaResetTime() {
    const quotas = this.chatEntitlementService.quotas;
    const premiumResetAt = quotas.premiumChat?.resetAt;
    if (typeof premiumResetAt === "number") {
      return premiumResetAt * 1e3;
    }
    if (quotas.resetDate) {
      const parsed = Date.parse(quotas.resetDate);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return void 0;
  }
  scheduleQuotaResetRefresh() {
    const resetAt = this.getQuotaResetTime();
    if (resetAt === void 0) {
      this.quotaResetTimer.clear();
      return;
    }
    const delay = resetAt > Date.now() ? resetAt - Date.now() : ChatStatusBarEntry.QUOTA_RESET_RETRY_DELAY;
    this.quotaResetTimer.value = disposableLongTimeout(() => this.refreshQuotaAndEvaluate(), delay);
  }
  refreshQuotaAndEvaluate() {
    const cts = new CancellationTokenSource();
    this.quotaRefresh.value = toDisposable(() => cts.dispose(true));
    (async () => {
      try {
        await this.chatEntitlementService.update(cts.token);
      } catch {
      }
      if (cts.token.isCancellationRequested) {
        return;
      }
      this.evaluateQuotaResumeState();
      this.update();
    })();
  }
  initializeQuotaResumeState() {
    if (this.quotaResumeState === "blocked") {
      this.refreshQuotaAndEvaluate();
    } else {
      this.evaluateQuotaResumeState();
    }
  }
  readPersistedQuotaResumeState() {
    const stored = this.storageService.get(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, StorageScope.PROFILE);
    return stored === "blocked" || stored === "resumed" ? stored : "none";
  }
  setQuotaResumeState(state) {
    if (this.quotaResumeState === state) {
      return;
    }
    this.quotaResumeState = state;
    if (state === "none") {
      this.storageService.remove(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, state, StorageScope.PROFILE, StorageTarget.MACHINE);
    }
  }
  onDashboardOpened() {
    if (this.quotaResumeState !== "resumed") {
      return;
    }
    this.clearResumedScheduler.value = disposableTimeout(() => {
      this.setQuotaResumeState("none");
      this.update();
    }, 0);
  }
  //#endregion
  getEntryProps() {
    let text = "$(copilot)";
    let ariaLabel = localize("chatStatusAria", "Copilot status");
    let kind;
    if (isNewUser(this.chatEntitlementService)) {
      const entitlement = this.chatEntitlementService.entitlement;
      if (this.chatEntitlementService.sentiment.later || // user skipped setup
      entitlement === ChatEntitlement.Available || // user is entitled
      isProUser(entitlement) || // user is already pro
      entitlement === ChatEntitlement.Free) {
        return this.getSetupEntryProps();
      }
    } else {
      const quotas = this.chatEntitlementService.quotas;
      if (this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
        text = "$(copilot-unavailable)";
        ariaLabel = localize("copilotDisabledStatus", "Copilot disabled");
      } else if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
        return this.getSetupEntryProps();
      } else if (isTrackedEntitlement(this.chatEntitlementService.entitlement) && isQuotaBlocked(quotas)) {
        const quotaWarning = localize("chatQuotaExceededStatus", "Quota reached");
        text = `$(copilot-warning) ${quotaWarning}`;
        ariaLabel = quotaWarning;
        kind = "prominent";
      } else if (this.quotaResumeState === "resumed") {
        const resumedLabel = localize("chatResumedStatus", "Copilot Resumed");
        text = `$(copilot) ${resumedLabel}`;
        ariaLabel = resumedLabel;
        kind = "prominent";
      } else if (this.editorService.activeTextEditorLanguageId && !isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId)) {
        text = "$(copilot-unavailable)";
        ariaLabel = localize("completionsDisabledStatus", "Inline suggestions disabled");
      } else if (this.completionsService.isSnoozing()) {
        text = "$(copilot-snooze)";
        ariaLabel = localize("completionsSnoozedStatus", "Inline suggestions snoozed");
      }
    }
    const baseResult = {
      name: localize("chatStatus", "Copilot Status"),
      text,
      ariaLabel,
      command: ShowTooltipCommand,
      showInAllWindows: true,
      kind,
      content: this.entryAnchor,
      tooltip: this.dashboardTooltip
    };
    return baseResult;
  }
  getSetupEntryProps() {
    const showSignInLabel = !this.isSignInTitleBarAffordanceVisible();
    const signInLabel = localize("signIn", "Sign In");
    return {
      name: localize("chatStatus", "Copilot Status"),
      text: showSignInLabel ? `$(copilot) ${signInLabel}` : "$(copilot)",
      ariaLabel: showSignInLabel ? signInLabel : localize("chatStatusAria", "Copilot status"),
      command: CHAT_SETUP_ACTION_ID,
      showInAllWindows: true,
      kind: void 0,
      content: this.entryAnchor
    };
  }
  isSignInTitleBarAffordanceVisible() {
    if (isWeb) {
      return false;
    }
    if (this.chatEntitlementService.entitlement !== ChatEntitlement.Unknown) {
      return false;
    }
    if (this.chatEntitlementService.sentiment.hidden || this.chatEntitlementService.sentiment.disabledInWorkspace) {
      return false;
    }
    const hasTitleBarUpdate = Boolean(this.contextKeyService.getContextKeyValue("updateTitleBar"));
    if (hasTitleBarUpdate) {
      return false;
    }
    const inZenMode = Boolean(this.contextKeyService.getContextKeyValue(InEditorZenModeContext.key));
    if (inZenMode) {
      return false;
    }
    const signInTitleBarEnabled = this.configurationService.getValue(ChatConfiguration.TitleBarSignInEnabled) !== false;
    return signInTitleBarEnabled;
  }
  dispose() {
    super.dispose();
    this.entry?.dispose();
    this.entry = void 0;
  }
};
ChatStatusBarEntry.ID = "workbench.contrib.chatStatusBarEntry";
ChatStatusBarEntry.TITLE_BAR_CONTEXT_KEYS = /* @__PURE__ */ new Set(["updateTitleBar", InEditorZenModeContext.key, ChatEntitlementContextKeys.hasByokModels.key]);
ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY = "chat.quotaResumeState";
ChatStatusBarEntry.QUOTA_RESET_RETRY_DELAY = 5 * 60 * 1e3;
ChatStatusBarEntry = __decorateClass([
  __decorateParam(0, IChatEntitlementService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IStatusbarService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInlineCompletionsService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IStorageService)
], ChatStatusBarEntry);
export {
  ChatStatusBarEntry,
  computeQuotaResumeState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3RhdHVzL2NoYXRTdGF0dXNFbnRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0U3RhdHVzLmNzcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJTZXJ2aWNlLCBTaG93VG9vbHRpcENvbW1hbmQsIFN0YXR1c2JhckFsaWdubWVudCwgU3RhdHVzYmFyRW50cnlLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMsIENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBpc1Byb1VzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlTG9uZ1RpbWVvdXQsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLmpzJztcblxuaW1wb3J0IHsgQ2hhdFN0YXR1c0Rhc2hib2FyZCB9IGZyb20gJy4vY2hhdFN0YXR1c0Rhc2hib2FyZC5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyAkIGFzIGgsIGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgaXNOZXdVc2VyIH0gZnJvbSAnLi9jaGF0U3RhdHVzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgaXNDb21wbGV0aW9uc0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2NvbXBsZXRpb25zRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBDSEFUX1NFVFVQX0FDVElPTl9JRCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEluRWRpdG9yWmVuTW9kZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcblxuLyoqXG4gKiBUcmFja3Mgd2hldGhlciBDb3BpbG90IGlzIGN1cnJlbnRseSBibG9ja2VkIGJ5IGEgcmVhY2hlZCBxdW90YSBsaW1pdCwgaGFzXG4gKiByZXN1bWVkIGFmdGVyIGEgbGltaXQgcmVzZXQsIG9yIG5laXRoZXIuIFBlcnNpc3RlZCBhY3Jvc3Mgc2Vzc2lvbnMgc28gYSByZXNldFxuICogdGhhdCBoYXBwZW5zIHdoaWxlIFZTIENvZGUgaXMgY2xvc2VkIGNhbiBzdGlsbCBiZSBzdXJmYWNlZCBvbiBuZXh0IGxhdW5jaC5cbiAqL1xuZXhwb3J0IHR5cGUgQ2hhdFF1b3RhUmVzdW1lU3RhdGUgPSAnbm9uZScgfCAnYmxvY2tlZCcgfCAncmVzdW1lZCc7XG5cbnR5cGUgQ2hhdFF1b3RhcyA9IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlWydxdW90YXMnXTtcblxuLyoqXG4gKiBXaGV0aGVyIHRoaXMgZW50cnkgdHJhY2tzIHF1b3RhIGZvciB0aGUgZ2l2ZW4gZW50aXRsZW1lbnQuIEFsbCBzaWduZWQtdXAgcGxhbnNcbiAqIGFyZSB0cmFja2VkIHZpYSB0aGUgdW5pZmllZCBwcmVtaXVtIGNoYXQgcXVvdGEuIFRyYW5zaWVudCBzdGF0ZXMgKHNpZ25lZCBvdXQsXG4gKiB1bnJlc29sdmVkLCBub3QgZW50aXRsZWQpIGFyZSBub3QgdHJhY2tlZC5cbiAqL1xuZnVuY3Rpb24gaXNUcmFja2VkRW50aXRsZW1lbnQoZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCk6IGJvb2xlYW4ge1xuXHRzd2l0Y2ggKGVudGl0bGVtZW50KSB7XG5cdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuRnJlZTpcblx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5FRFU6XG5cdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuUHJvOlxuXHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LlByb1BsdXM6XG5cdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuQnVzaW5lc3M6XG5cdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZTpcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNRdW90YUJsb2NrZWQocXVvdGFzOiBDaGF0UXVvdGFzKTogYm9vbGVhbiB7XG5cdGNvbnN0IHByZW1pdW1DaGF0ID0gcXVvdGFzLnByZW1pdW1DaGF0O1xuXHRpZiAocHJlbWl1bUNoYXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiBwcmVtaXVtQ2hhdC51bmxpbWl0ZWQgPyBwcmVtaXVtQ2hhdC5oYXNRdW90YSA9PT0gZmFsc2UgOiBwcmVtaXVtQ2hhdC5wZXJjZW50UmVtYWluaW5nID09PSAwO1xufVxuXG5mdW5jdGlvbiBoYXNSZXNvbHZlZFF1b3RhKHF1b3RhczogQ2hhdFF1b3Rhcyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcXVvdGFzLnByZW1pdW1DaGF0ICE9PSB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUHVyZSBzdGF0ZSB0cmFuc2l0aW9uIGZvciB0aGUgQ29waWxvdCBxdW90YSBcInJlc3VtZWRcIiBpbmRpY2F0b3I6XG4gKiAtIEVudGVycyBgYmxvY2tlZGAgd2hpbGUgYSBsaW1pdCBpcyByZWFjaGVkIGFuZCB0aGUgdXNlciBpcyBub3Qgb24gYWRkaXRpb25hbCBzcGVuZC5cbiAqIC0gTW92ZXMgYGJsb2NrZWRgIC0+IGByZXN1bWVkYCBvbmx5IG9uIGEgZ2VudWluZSBsaW1pdCByZXNldCAoZnJlc2ggcXVvdGEsIG5vIGFkZGl0aW9uYWwgc3BlbmQpLlxuICogLSBNb3ZlcyBgYmxvY2tlZGAgLT4gYG5vbmVgIHdoZW4gdW5ibG9ja2VkIHZpYSBhZGRpdGlvbmFsIHNwZW5kIChub3QgYSByZXNldCkuXG4gKiAtIEtlZXBzIGBibG9ja2VkYCB3aGlsZSBmcmVzaCBxdW90YSBoYXMgbm90IGJlZW4gcmVzb2x2ZWQgeWV0IChlLmcuIG9mZmxpbmUpIHRvIGF2b2lkIGZhbHNlIHBvc2l0aXZlcy5cbiAqIC0gT3RoZXJ3aXNlIHByZXNlcnZlcyB0aGUgcHJldmlvdXMgc3RhdGUsIHNvIGByZXN1bWVkYCBwZXJzaXN0cyB1bnRpbCBkaXNtaXNzZWQuXG4gKiAtIFJlc2V0cyB0byBgbm9uZWAgZm9yIGVudGl0bGVtZW50cyB0aGlzIGVudHJ5IGRvZXNuJ3QgdHJhY2ssIHNvIHRoZSBzdGF0ZSBjYW4ndCBnZXQgc3R1Y2sgKGUuZy4gdXBncmFkaW5nIGZyb20gRnJlZSB3aGlsZSBgYmxvY2tlZGApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZVF1b3RhUmVzdW1lU3RhdGUocHJldmlvdXM6IENoYXRRdW90YVJlc3VtZVN0YXRlLCBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LCBxdW90YXM6IENoYXRRdW90YXMpOiBDaGF0UXVvdGFSZXN1bWVTdGF0ZSB7XG5cdGlmICghaXNUcmFja2VkRW50aXRsZW1lbnQoZW50aXRsZW1lbnQpKSB7XG5cdFx0cmV0dXJuICdub25lJztcblx0fVxuXG5cdGNvbnN0IGFkZGl0aW9uYWxTcGVuZCA9IHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkID09PSB0cnVlO1xuXG5cdGlmICghYWRkaXRpb25hbFNwZW5kICYmIGlzUXVvdGFCbG9ja2VkKHF1b3RhcykpIHtcblx0XHRyZXR1cm4gJ2Jsb2NrZWQnO1xuXHR9XG5cblx0aWYgKHByZXZpb3VzICE9PSAnYmxvY2tlZCcpIHtcblx0XHRyZXR1cm4gcHJldmlvdXM7XG5cdH1cblxuXHRpZiAoYWRkaXRpb25hbFNwZW5kKSB7XG5cdFx0cmV0dXJuICdub25lJztcblx0fVxuXG5cdHJldHVybiBoYXNSZXNvbHZlZFF1b3RhKHF1b3RhcykgPyAncmVzdW1lZCcgOiAnYmxvY2tlZCc7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U3RhdHVzQmFyRW50cnkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRTdGF0dXNCYXJFbnRyeSc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVElUTEVfQkFSX0NPTlRFWFRfS0VZUyA9IG5ldyBTZXQoWyd1cGRhdGVUaXRsZUJhcicsIEluRWRpdG9yWmVuTW9kZUNvbnRleHQua2V5LCBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5oYXNCeW9rTW9kZWxzLmtleV0pO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFFVT1RBX1JFU1VNRV9TVEFURV9LRVkgPSAnY2hhdC5xdW90YVJlc3VtZVN0YXRlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUVVPVEFfUkVTRVRfUkVUUllfREVMQVkgPSA1ICogNjAgKiAxMDAwOyAvLyByZS1jaGVjayA1IG1pbiBhZnRlciBhIHBhc3NlZCByZXNldCB0aW1lXG5cblx0cHJpdmF0ZSBlbnRyeTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVDb2RlRWRpdG9yTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW50cnlBbmNob3IgPSBoKCdzcGFuJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGFzaGJvYXJkVG9vbHRpcDogSVN0YXR1c2JhckVudHJ5Wyd0b29sdGlwJ107XG5cblx0cHJpdmF0ZSBxdW90YVJlc3VtZVN0YXRlOiBDaGF0UXVvdGFSZXN1bWVTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBxdW90YVJlc2V0VGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVvdGFSZWZyZXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNsZWFyUmVzdW1lZFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tcGxldGlvbnNTZXJ2aWNlOiBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5xdW90YVJlc3VtZVN0YXRlID0gdGhpcy5yZWFkUGVyc2lzdGVkUXVvdGFSZXN1bWVTdGF0ZSgpO1xuXG5cdFx0dGhpcy5kYXNoYm9hcmRUb29sdGlwID0ge1xuXHRcdFx0ZWxlbWVudDogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHR0aGlzLm9uRGFzaGJvYXJkT3BlbmVkKCk7XG5cblx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGNvbnN0IGVsZW0gPSBDaGF0U3RhdHVzRGFzaGJvYXJkLmluc3RhbnRpYXRlSW5Db250ZW50cyh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdG9yZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTIvQGJlbmliZW5qOiB3b3JrYXJvdW5kIGZvciAjMjU3OTIzXG5cdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghZWxlbS5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMjAwMCkpO1xuXG5cdFx0XHRcdHJldHVybiBlbGVtO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXG5cdFx0dGhpcy5pbml0aWFsaXplUXVvdGFSZXN1bWVTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VudGltZW50ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudDtcblx0XHRpZiAoIXNlbnRpbWVudC5oaWRkZW4pIHtcblx0XHRcdGNvbnN0IHByb3BzID0gdGhpcy5nZXRFbnRyeVByb3BzKCk7XG5cdFx0XHRpZiAodGhpcy5lbnRyeSkge1xuXHRcdFx0XHR0aGlzLmVudHJ5LnVwZGF0ZShwcm9wcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVudHJ5ID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHByb3BzLCAnY2hhdC5zdGF0dXNCYXJFbnRyeScsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgeyBsb2NhdGlvbjogeyBpZDogJ3N0YXR1cy5lZGl0b3IubW9kZScsIHByaW9yaXR5OiAxMDAuMSB9LCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbnRyeT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5lbnRyeSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQoKCkgPT4gdGhpcy5vblF1b3RhQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcoKCkgPT4gdGhpcy5vblF1b3RhQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbnRpdGxlbWVudCgoKSA9PiB0aGlzLm9uUXVvdGFDaGFuZ2VkKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKENoYXRTdGF0dXNCYXJFbnRyeS5USVRMRV9CQVJfQ09OVEVYVF9LRVlTKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tcGxldGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlSXNTbm9vemluZygoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uY29tcGxldGlvbnNFbmFibGVtZW50U2V0dGluZykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UaXRsZUJhclNpZ25JbkVuYWJsZWQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXG5cdFx0dGhpcy5hY3RpdmVDb2RlRWRpdG9yTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdC8vIExpc3RlbiB0byBsYW5ndWFnZSBjaGFuZ2VzIGluIHRoZSBhY3RpdmUgY29kZSBlZGl0b3Jcblx0XHRjb25zdCBhY3RpdmVDb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRcdGlmIChhY3RpdmVDb2RlRWRpdG9yKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUNvZGVFZGl0b3JMaXN0ZW5lci52YWx1ZSA9IGFjdGl2ZUNvZGVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vI3JlZ2lvbiAtLS0gUXVvdGEgUmVzdW1lIFRyYWNraW5nXG5cblx0cHJpdmF0ZSBvblF1b3RhQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLmV2YWx1YXRlUXVvdGFSZXN1bWVTdGF0ZSgpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGV2YWx1YXRlUXVvdGFSZXN1bWVTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gY29tcHV0ZVF1b3RhUmVzdW1lU3RhdGUodGhpcy5xdW90YVJlc3VtZVN0YXRlLCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQsIHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMpO1xuXHRcdHRoaXMuc2V0UXVvdGFSZXN1bWVTdGF0ZShuZXh0KTtcblxuXHRcdC8vIFdoaWxlIGJsb2NrZWQsIHNjaGVkdWxlIGEgcmVmcmVzaCBmb3Igd2hlbiB0aGUgbGltaXQgaXMgZXhwZWN0ZWQgdG8gcmVzZXQuXG5cdFx0aWYgKG5leHQgPT09ICdibG9ja2VkJykge1xuXHRcdFx0dGhpcy5zY2hlZHVsZVF1b3RhUmVzZXRSZWZyZXNoKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucXVvdGFSZXNldFRpbWVyLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRRdW90YVJlc2V0VGltZSgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHF1b3RhcyA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cblx0XHRjb25zdCBwcmVtaXVtUmVzZXRBdCA9IHF1b3Rhcy5wcmVtaXVtQ2hhdD8ucmVzZXRBdDtcblx0XHRpZiAodHlwZW9mIHByZW1pdW1SZXNldEF0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHByZW1pdW1SZXNldEF0ICogMTAwMDtcblx0XHR9XG5cblx0XHRpZiAocXVvdGFzLnJlc2V0RGF0ZSkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gRGF0ZS5wYXJzZShxdW90YXMucmVzZXREYXRlKTtcblx0XHRcdGlmICghaXNOYU4ocGFyc2VkKSkge1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlUXVvdGFSZXNldFJlZnJlc2goKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzZXRBdCA9IHRoaXMuZ2V0UXVvdGFSZXNldFRpbWUoKTtcblx0XHRpZiAocmVzZXRBdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnF1b3RhUmVzZXRUaW1lci5jbGVhcigpOyAvLyBubyBrbm93biByZXNldCB0aW1lOiByZWx5IG9uIHF1b3RhIGV2ZW50cyBhbmQgbmV4dCBsYXVuY2hcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCYWNrIG9mZiB3aGVuIHRoZSByZXNldCB0aW1lIGhhcyBhbHJlYWR5IHBhc3NlZCBidXQgd2UgYXJlIHN0aWxsIGJsb2NrZWQsXG5cdFx0Ly8gc28gd2UgcmUtY2hlY2sgcGVyaW9kaWNhbGx5IGluc3RlYWQgb2YgaGFtbWVyaW5nIHRoZSBzZXJ2aWNlLlxuXHRcdGNvbnN0IGRlbGF5ID0gcmVzZXRBdCA+IERhdGUubm93KCkgPyByZXNldEF0IC0gRGF0ZS5ub3coKSA6IENoYXRTdGF0dXNCYXJFbnRyeS5RVU9UQV9SRVNFVF9SRVRSWV9ERUxBWTtcblx0XHR0aGlzLnF1b3RhUmVzZXRUaW1lci52YWx1ZSA9IGRpc3Bvc2FibGVMb25nVGltZW91dCgoKSA9PiB0aGlzLnJlZnJlc2hRdW90YUFuZEV2YWx1YXRlKCksIGRlbGF5KTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaFF1b3RhQW5kRXZhbHVhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5xdW90YVJlZnJlc2gudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpO1xuXG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS51cGRhdGUoY3RzLnRva2VuKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBJZ25vcmUgcmVmcmVzaCBmYWlsdXJlczoga2VlcCB0aGUgbGFzdCBrbm93biBzdGF0ZSBhbmQgbGV0IGEgZnV0dXJlXG5cdFx0XHRcdC8vIHF1b3RhIHVwZGF0ZSBvciB0aGUgbmV4dCBsYXVuY2ggcmUtZXZhbHVhdGUuXG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmV2YWx1YXRlUXVvdGFSZXN1bWVTdGF0ZSgpO1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9KSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplUXVvdGFSZXN1bWVTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5xdW90YVJlc3VtZVN0YXRlID09PSAnYmxvY2tlZCcpIHtcblx0XHRcdC8vIEEgYmxvY2tlZCBzdGF0ZSB3YXMgcmVjb3JkZWQgaW4gYSBwcmV2aW91cyBzZXNzaW9uOiB2ZXJpZnkgYWdhaW5zdCBmcmVzaFxuXHRcdFx0Ly8gcXVvdGEgZGF0YSB3aGV0aGVyIHRoZSBsaW1pdCBoYXMgc2luY2UgcmVzZXQgd2hpbGUgVlMgQ29kZSB3YXMgY2xvc2VkLlxuXHRcdFx0dGhpcy5yZWZyZXNoUXVvdGFBbmRFdmFsdWF0ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmV2YWx1YXRlUXVvdGFSZXN1bWVTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZFBlcnNpc3RlZFF1b3RhUmVzdW1lU3RhdGUoKTogQ2hhdFF1b3RhUmVzdW1lU3RhdGUge1xuXHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KENoYXRTdGF0dXNCYXJFbnRyeS5RVU9UQV9SRVNVTUVfU1RBVEVfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0cmV0dXJuIHN0b3JlZCA9PT0gJ2Jsb2NrZWQnIHx8IHN0b3JlZCA9PT0gJ3Jlc3VtZWQnID8gc3RvcmVkIDogJ25vbmUnO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRRdW90YVJlc3VtZVN0YXRlKHN0YXRlOiBDaGF0UXVvdGFSZXN1bWVTdGF0ZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnF1b3RhUmVzdW1lU3RhdGUgPT09IHN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5xdW90YVJlc3VtZVN0YXRlID0gc3RhdGU7XG5cdFx0aWYgKHN0YXRlID09PSAnbm9uZScpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKENoYXRTdGF0dXNCYXJFbnRyeS5RVU9UQV9SRVNVTUVfU1RBVEVfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFN0YXR1c0JhckVudHJ5LlFVT1RBX1JFU1VNRV9TVEFURV9LRVksIHN0YXRlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGFzaGJvYXJkT3BlbmVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnF1b3RhUmVzdW1lU3RhdGUgIT09ICdyZXN1bWVkJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERlZmVyIGNsZWFyaW5nIHRvIGF2b2lkIHJlLWVudHJhbnQgc3RhdHVzIGJhciB1cGRhdGVzIHdoaWxlIHRoZSBkYXNoYm9hcmRcblx0XHQvLyB0b29sdGlwIGlzIGJlaW5nIGJ1aWx0LlxuXHRcdHRoaXMuY2xlYXJSZXN1bWVkU2NoZWR1bGVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXRRdW90YVJlc3VtZVN0YXRlKCdub25lJyk7XG5cdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdH0sIDApO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBnZXRFbnRyeVByb3BzKCk6IElTdGF0dXNiYXJFbnRyeSB7XG5cdFx0bGV0IHRleHQgPSAnJChjb3BpbG90KSc7XG5cdFx0bGV0IGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0U3RhdHVzQXJpYScsIFwiQ29waWxvdCBzdGF0dXNcIik7XG5cdFx0bGV0IGtpbmQ6IFN0YXR1c2JhckVudHJ5S2luZCB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChpc05ld1VzZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlKSkge1xuXHRcdFx0Y29uc3QgZW50aXRsZW1lbnQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cblx0XHRcdC8vIFNpZ24gSW5cblx0XHRcdGlmIChcblx0XHRcdFx0dGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5sYXRlciB8fFx0Ly8gdXNlciBza2lwcGVkIHNldHVwXG5cdFx0XHRcdGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuQXZhaWxhYmxlIHx8XHQvLyB1c2VyIGlzIGVudGl0bGVkXG5cdFx0XHRcdGlzUHJvVXNlcihlbnRpdGxlbWVudCkgfHxcdFx0XHRcdFx0XHQvLyB1c2VyIGlzIGFscmVhZHkgcHJvXG5cdFx0XHRcdGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZVx0XHRcdC8vIHVzZXIgaXMgYWxyZWFkeSBmcmVlXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0U2V0dXBFbnRyeVByb3BzKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHF1b3RhcyA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cblx0XHRcdC8vIERpc2FibGVkXG5cdFx0XHRpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5kaXNhYmxlZCB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LnVudHJ1c3RlZCkge1xuXHRcdFx0XHR0ZXh0ID0gJyQoY29waWxvdC11bmF2YWlsYWJsZSknO1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY29waWxvdERpc2FibGVkU3RhdHVzJywgXCJDb3BpbG90IGRpc2FibGVkXCIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaWduZWQgb3V0IFx1MjAxNCBrZWVwIHNob3dpbmcgU2lnbi1pbiBhZmZvcmRhbmNlIGV2ZW4gd2hlbiBCWU9LIG1vZGVscyBhcmUgcHJlc2VudFxuXHRcdFx0Ly8gc28gYWlyLWdhcHBlZCB1c2VycyBjYW4gc3RpbGwgYXV0aGVudGljYXRlIHRvIHVubG9jayB0aGUgZnVsbCBDb3BpbG90IGV4cGVyaWVuY2UuXG5cdFx0XHRlbHNlIGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFNldHVwRW50cnlQcm9wcygpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBRdW90YSBFeGNlZWRlZCAoYWxsIHRyYWNrZWQgcGxhbnMgc2hhcmUgdGhlIHByZW1pdW0gY2hhdCBxdW90YSlcblx0XHRcdGVsc2UgaWYgKGlzVHJhY2tlZEVudGl0bGVtZW50KHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCkgJiYgaXNRdW90YUJsb2NrZWQocXVvdGFzKSkge1xuXHRcdFx0XHRjb25zdCBxdW90YVdhcm5pbmcgPSBsb2NhbGl6ZSgnY2hhdFF1b3RhRXhjZWVkZWRTdGF0dXMnLCBcIlF1b3RhIHJlYWNoZWRcIik7XG5cdFx0XHRcdHRleHQgPSBgJChjb3BpbG90LXdhcm5pbmcpICR7cXVvdGFXYXJuaW5nfWA7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IHF1b3RhV2FybmluZztcblx0XHRcdFx0a2luZCA9ICdwcm9taW5lbnQnO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb3BpbG90IFJlc3VtZWQgKGxpbWl0IHJlc2V0IGFmdGVyIHRoZSB1c2VyIHdhcyBwcmV2aW91c2x5IGJsb2NrZWQpXG5cdFx0XHRlbHNlIGlmICh0aGlzLnF1b3RhUmVzdW1lU3RhdGUgPT09ICdyZXN1bWVkJykge1xuXHRcdFx0XHRjb25zdCByZXN1bWVkTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdFJlc3VtZWRTdGF0dXMnLCBcIkNvcGlsb3QgUmVzdW1lZFwiKTtcblx0XHRcdFx0dGV4dCA9IGAkKGNvcGlsb3QpICR7cmVzdW1lZExhYmVsfWA7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IHJlc3VtZWRMYWJlbDtcblx0XHRcdFx0a2luZCA9ICdwcm9taW5lbnQnO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb21wbGV0aW9ucyBEaXNhYmxlZFxuXHRcdFx0ZWxzZSBpZiAodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkICYmICFpc0NvbXBsZXRpb25zRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQpKSB7XG5cdFx0XHRcdHRleHQgPSAnJChjb3BpbG90LXVuYXZhaWxhYmxlKSc7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjb21wbGV0aW9uc0Rpc2FibGVkU3RhdHVzJywgXCJJbmxpbmUgc3VnZ2VzdGlvbnMgZGlzYWJsZWRcIik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbXBsZXRpb25zIFNub296ZWRcblx0XHRcdGVsc2UgaWYgKHRoaXMuY29tcGxldGlvbnNTZXJ2aWNlLmlzU25vb3ppbmcoKSkge1xuXHRcdFx0XHR0ZXh0ID0gJyQoY29waWxvdC1zbm9vemUpJztcblx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NvbXBsZXRpb25zU25vb3plZFN0YXR1cycsIFwiSW5saW5lIHN1Z2dlc3Rpb25zIHNub296ZWRcIik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFzZVJlc3VsdCA9IHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdjaGF0U3RhdHVzJywgXCJDb3BpbG90IFN0YXR1c1wiKSxcblx0XHRcdHRleHQsXG5cdFx0XHRhcmlhTGFiZWwsXG5cdFx0XHRjb21tYW5kOiBTaG93VG9vbHRpcENvbW1hbmQsXG5cdFx0XHRzaG93SW5BbGxXaW5kb3dzOiB0cnVlLFxuXHRcdFx0a2luZCxcblx0XHRcdGNvbnRlbnQ6IHRoaXMuZW50cnlBbmNob3IsXG5cdFx0XHR0b29sdGlwOiB0aGlzLmRhc2hib2FyZFRvb2x0aXBcblx0XHR9IHNhdGlzZmllcyBJU3RhdHVzYmFyRW50cnk7XG5cblx0XHRyZXR1cm4gYmFzZVJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2V0dXBFbnRyeVByb3BzKCk6IElTdGF0dXNiYXJFbnRyeSB7XG5cdFx0Y29uc3Qgc2hvd1NpZ25JbkxhYmVsID0gIXRoaXMuaXNTaWduSW5UaXRsZUJhckFmZm9yZGFuY2VWaXNpYmxlKCk7XG5cdFx0Y29uc3Qgc2lnbkluTGFiZWwgPSBsb2NhbGl6ZSgnc2lnbkluJywgXCJTaWduIEluXCIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnY2hhdFN0YXR1cycsIFwiQ29waWxvdCBTdGF0dXNcIiksXG5cdFx0XHR0ZXh0OiBzaG93U2lnbkluTGFiZWwgPyBgJChjb3BpbG90KSAke3NpZ25JbkxhYmVsfWAgOiAnJChjb3BpbG90KScsXG5cdFx0XHRhcmlhTGFiZWw6IHNob3dTaWduSW5MYWJlbCA/IHNpZ25JbkxhYmVsIDogbG9jYWxpemUoJ2NoYXRTdGF0dXNBcmlhJywgXCJDb3BpbG90IHN0YXR1c1wiKSxcblx0XHRcdGNvbW1hbmQ6IENIQVRfU0VUVVBfQUNUSU9OX0lELFxuXHRcdFx0c2hvd0luQWxsV2luZG93czogdHJ1ZSxcblx0XHRcdGtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNvbnRlbnQ6IHRoaXMuZW50cnlBbmNob3IsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgaXNTaWduSW5UaXRsZUJhckFmZm9yZGFuY2VWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFRpdGxlIGJhciBzaWduLWluIGJ1dHRvbiBvbmx5IHNob3dzIHdoZW4gdXNlciBpcyBzaWduZWQgb3V0XG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCAhPT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5oaWRkZW4gfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5kaXNhYmxlZEluV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzVGl0bGVCYXJVcGRhdGUgPSBCb29sZWFuKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKCd1cGRhdGVUaXRsZUJhcicpKTtcblx0XHRpZiAoaGFzVGl0bGVCYXJVcGRhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBpblplbk1vZGUgPSBCb29sZWFuKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKEluRWRpdG9yWmVuTW9kZUNvbnRleHQua2V5KSk7XG5cdFx0aWYgKGluWmVuTW9kZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpZ25JblRpdGxlQmFyRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJTaWduSW5FbmFibGVkKSAhPT0gZmFsc2U7XG5cdFx0cmV0dXJuIHNpZ25JblRpdGxlQmFyRW5hYmxlZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5lbnRyeT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuZW50cnkgPSB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUM3RSxTQUFTLGdCQUFnQjtBQUV6QixTQUFtRCxtQkFBbUIsb0JBQW9CLDBCQUE4QztBQUN4SSxTQUFTLGlCQUFpQiw0QkFBb0QseUJBQXlCLGlCQUFpQjtBQUN4SCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyx1QkFBdUIseUJBQXlCO0FBQ3pELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsS0FBSyxHQUFHLGdDQUFnQztBQUNqRCxTQUFTLGlCQUFpQjtBQUMxQixPQUFPLGFBQWE7QUFDcEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFD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
