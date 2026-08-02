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
import { safeIntl } from "../../../../base/common/date.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { getSelectedModelIdentifier, getSelectedModelMetadata, isSelectedModelCopilot, SELECTED_MODEL_STORAGE_KEY_PREFIX, SELECTED_MODEL_STORAGE_SCOPE } from "../common/chatSelectedModel.js";
import { ILanguageModelsService, isAutoLanguageModel } from "../common/languageModels.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from "./widget/input/chatInputNotificationService.js";
const QUOTA_NOTIFICATION_ID = "copilot.quotaStatus";
const THRESHOLDS = [50, 75, 90, 95];
const SWITCH_TO_AUTO_TREATMENT_NAME = "config.chatQuotaWarningSwitchToAuto";
const TRAJECTORY_NUDGE_SPEC = {
  treatmentName: "config.chatQuotaTrajectoryNudge",
  shownStorageKey: "chat.quotaTrajectory.shownPeriod",
  averageDailyUsageThreshold: 4.5,
  minimumPercentUsed: 10,
  maximumPercentUsed: 35,
  msPerDay: 24 * 60 * 60 * 1e3,
  learnMoreUrl: "https://aka.ms/token-usage-tips",
  learnMoreCommandId: "workbench.action.chat.learnMoreAboutCreditUsage"
};
const QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY = "chat.quotaNotification.exhaustedDismissed";
let ChatQuotaNotificationContribution = class extends Disposable {
  constructor(_chatEntitlementService, _chatInputNotificationService, _contextKeyService, _languageModelsService, _storageService, _assignmentService, _telemetryService, _logService) {
    super();
    this._chatEntitlementService = _chatEntitlementService;
    this._chatInputNotificationService = _chatInputNotificationService;
    this._contextKeyService = _contextKeyService;
    this._languageModelsService = _languageModelsService;
    this._storageService = _storageService;
    this._assignmentService = _assignmentService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    /** Tracks whether the current notification is the quota-exhausted variant. */
    this._showingExhausted = false;
    this._switchToAutoAssignmentRequested = false;
    this._trajectoryAssignmentRequested = false;
    this._register(this._chatEntitlementService.onDidChangeQuotaRemaining(() => this._update()));
    this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => this._update()));
    this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this._update()));
    this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._refreshActiveQuotaApproachingWarning()));
    this._register(CommandsRegistry.registerCommand(TRAJECTORY_NUDGE_SPEC.learnMoreCommandId, (accessor) => this._handleCreditEfficiencyLearnMoreCommand(accessor)));
    const storageListener = this._register(new DisposableStore());
    this._register(this._storageService.onDidChangeValue(SELECTED_MODEL_STORAGE_SCOPE, void 0, storageListener)((e) => {
      if (e.key.startsWith(SELECTED_MODEL_STORAGE_KEY_PREFIX)) {
        this._refreshActiveQuotaApproachingWarning();
        this._update();
      }
    }));
    this._register(this._chatInputNotificationService.onDidDismiss((id) => {
      if (id === QUOTA_NOTIFICATION_ID && this._showingExhausted) {
        this._setExhaustedDismissed();
      }
    }));
    this._update();
  }
  async _resolveSwitchToAutoTreatment() {
    const treatment = await this._assignmentService.getTreatment(SWITCH_TO_AUTO_TREATMENT_NAME);
    this._switchToAutoTreatment = treatment;
    if (treatment === true) {
      this._refreshActiveQuotaApproachingWarning();
    }
  }
  _requestSwitchToAutoTreatment() {
    if (!this._switchToAutoAssignmentRequested) {
      this._switchToAutoAssignmentRequested = true;
      void this._resolveSwitchToAutoTreatment().catch((error) => {
        this._logService.error(`Failed to resolve ${SWITCH_TO_AUTO_TREATMENT_NAME}`, error);
        this._switchToAutoAssignmentRequested = false;
      });
    }
  }
  /**
   * Reads the already-evaluated trajectory experiment cohort. The assignment
   * service resolves the cohort asynchronously, so this is requested only once
   * the user has met every non-experiment condition required for the nudge.
   *
   * Stores the raw treatment value. `undefined` means the user is not
   * assigned to the flight (or assignments are not available); only a `true`
   * treatment renders the nudge. We deliberately do not coerce a missing
   * assignment into a synthetic "control" value, since that would assume an
   * enrollment that may not exist. Enrollment telemetry is emitted only when
   * the user is actually assigned to a flight.
   */
  async _resolveTrajectoryTreatment(warning) {
    const treatment = await this._assignmentService.getTreatment(TRAJECTORY_NUDGE_SPEC.treatmentName);
    this._trajectoryTreatment = treatment;
    if (treatment !== void 0) {
      this._logQuotaTrajectoryNudgeEnrolled(treatment, warning);
    }
    if (treatment === true) {
      this._update();
    }
  }
  _requestTrajectoryTreatment(warning) {
    if (!this._trajectoryAssignmentRequested) {
      this._trajectoryAssignmentRequested = true;
      void this._resolveTrajectoryTreatment(warning).catch((error) => {
        this._logService.error(`Failed to resolve ${TRAJECTORY_NUDGE_SPEC.treatmentName}`, error);
        this._trajectoryAssignmentRequested = false;
      });
    }
  }
  _getRelevantSnapshot() {
    const quotas = this._chatEntitlementService.quotas;
    const entitlement = this._chatEntitlementService.entitlement;
    if (entitlement === ChatEntitlement.Unknown || entitlement === ChatEntitlement.Free) {
      return quotas.chat ?? quotas.premiumChat;
    }
    return quotas.premiumChat;
  }
  _isQuotaUsedUp() {
    const snapshot = this._getRelevantSnapshot();
    if (!snapshot) {
      return false;
    }
    if (snapshot.unlimited) {
      return snapshot.hasQuota === false;
    }
    return snapshot.percentRemaining <= 0;
  }
  _isUBBEligible() {
    return this._chatEntitlementService.quotas.usageBasedBilling === true;
  }
  _update() {
    const entitlement = this._chatEntitlementService.entitlement;
    const isCopilot = this._isCopilotModelSelected();
    if (this._isQuotaKnownAvailable()) {
      this._clearExhaustedDismissed();
    }
    if (!isCopilot) {
      return;
    }
    const isQuotaNotificationEligible = entitlement === ChatEntitlement.Unknown || this._isUBBEligible();
    if (this._isManagedPlan(entitlement) && this._isManagedPlanBlocked()) {
      if (!this._isExhaustedDismissed()) {
        this._showManagedPlanBlockedNotification();
      }
      return;
    }
    if (isQuotaNotificationEligible && this._isQuotaUsedUp()) {
      const quotas = this._chatEntitlementService.quotas;
      const additionalUsageEnabled = quotas.additionalUsageEnabled ?? false;
      const wasAdditionalUsageEnabled = this._prevAdditionalUsageEnabled;
      this._prevAdditionalUsageEnabled = additionalUsageEnabled;
      if (!this._isExhaustedDismissed()) {
        if (additionalUsageEnabled) {
          if (this._prevQuotaPercentUsed !== void 0 || wasAdditionalUsageEnabled === false) {
            this._showOverageActivationNotification();
          }
        } else {
          this._showExhaustedNotification();
        }
      }
      const exhaustedSnapshot = this._getRelevantSnapshot();
      if (exhaustedSnapshot && !exhaustedSnapshot.unlimited) {
        this._prevQuotaPercentUsed = 100 - exhaustedSnapshot.percentRemaining;
      }
      return;
    }
    if (isQuotaNotificationEligible) {
      const trajectoryWarning = this._computeQuotaTrajectoryWarning();
      if (trajectoryWarning) {
        this._showQuotaTrajectoryWarning(trajectoryWarning);
        return;
      }
      const quotaWarning = this._computeQuotaWarning();
      if (quotaWarning) {
        this._showQuotaApproachingWarning(quotaWarning);
        return;
      }
    }
    const rateLimitWarning = this._computeRateLimitWarning();
    if (rateLimitWarning) {
      this._showRateLimitWarning(rateLimitWarning);
      return;
    }
    if (this._showingExhausted && !this._isQuotaUsedUp()) {
      this._hideNotification();
    }
  }
  // --- Threshold crossing detection ----------------------------------------
  _computeQuotaWarning() {
    const snapshot = this._getRelevantSnapshot();
    if (!snapshot || snapshot.unlimited) {
      this._prevQuotaPercentUsed = void 0;
      return void 0;
    }
    const percentUsed = 100 - snapshot.percentRemaining;
    const crossed = this._findCrossedThreshold(percentUsed, this._prevQuotaPercentUsed);
    this._prevQuotaPercentUsed = percentUsed;
    if (crossed !== void 0) {
      return { percentUsed: Math.floor(percentUsed), threshold: crossed };
    }
    return void 0;
  }
  _computeQuotaTrajectoryWarning() {
    if (this._isTrajectoryShownInCurrentPeriod()) {
      return void 0;
    }
    const snapshot = this._getRelevantSnapshot();
    if (!snapshot || snapshot.unlimited || snapshot.percentRemaining <= 0) {
      return void 0;
    }
    const resetDate = this._chatEntitlementService.quotas.resetDate;
    if (!resetDate) {
      return void 0;
    }
    const reset = new Date(resetDate);
    const resetTime = reset.getTime();
    if (!Number.isFinite(resetTime)) {
      return void 0;
    }
    const periodStart = new Date(resetTime);
    periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
    const periodStartTime = periodStart.getTime();
    const elapsedDays = (Date.now() - periodStartTime) / TRAJECTORY_NUDGE_SPEC.msPerDay;
    if (elapsedDays < 0) {
      return void 0;
    }
    const percentUsed = 100 - snapshot.percentRemaining;
    if (percentUsed < TRAJECTORY_NUDGE_SPEC.minimumPercentUsed || percentUsed > TRAJECTORY_NUDGE_SPEC.maximumPercentUsed) {
      return void 0;
    }
    const averageDailyUsage = percentUsed / Math.max(1, elapsedDays);
    if (averageDailyUsage < TRAJECTORY_NUDGE_SPEC.averageDailyUsageThreshold) {
      return void 0;
    }
    this._requestTrajectoryTreatment({ averageDailyUsage, percentUsed });
    return this._trajectoryTreatment === true ? { averageDailyUsage, percentUsed } : void 0;
  }
  _showQuotaTrajectoryWarning(warning) {
    this._showingExhausted = false;
    this._storeTrajectoryShown();
    const learnMoreLink = createMarkdownCommandLink({
      text: localize("quota.trajectory.learnMoreStandalone", "Learn about optimizing usage"),
      id: TRAJECTORY_NUDGE_SPEC.learnMoreCommandId,
      tooltip: localize("quota.trajectory.learnMoreTooltip", "Learn about optimizing usage")
    });
    const message = localize({ key: "quota.trajectory.message", comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "You're likely to exhaust your AI credits before your billing period. {0}.", learnMoreLink);
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "quotaTrajectoryNudge",
      severity: ChatInputNotificationSeverity.Info,
      message: new MarkdownString(message, { isTrusted: { enabledCommands: [TRAJECTORY_NUDGE_SPEC.learnMoreCommandId] } }),
      description: void 0,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: false
    });
  }
  async _handleCreditEfficiencyLearnMoreCommand(accessor) {
    this._telemetryService.publicLog2("chatQuotaTrajectoryNudgeLinkClicked");
    queueMicrotask(() => this._hideNotification());
    await accessor.get(IOpenerService).open(URI.parse(TRAJECTORY_NUDGE_SPEC.learnMoreUrl));
  }
  _logQuotaTrajectoryNudgeEnrolled(treatment, warning) {
    this._telemetryService.publicLog2("chatQuotaTrajectoryNudgeEnrolled", {
      treatment,
      entitlement: ChatEntitlement[this._chatEntitlementService.entitlement],
      averageDailyUsage: Math.round(warning.averageDailyUsage * 100) / 100,
      percentUsed: Math.round(warning.percentUsed * 100) / 100
    });
  }
  /**
   * Returns the highest threshold that was newly crossed, or `undefined`.
   */
  _findCrossedThreshold(current, previous) {
    if (previous === void 0) {
      return void 0;
    }
    for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
      const threshold = THRESHOLDS[i];
      if (previous < threshold && current >= threshold) {
        return threshold;
      }
    }
    return void 0;
  }
  // --- Quota exhausted ---------------------------------------------------
  _showExhaustedNotification() {
    this._showingExhausted = true;
    const entitlement = this._chatEntitlementService.entitlement;
    const quotas = this._chatEntitlementService.quotas;
    const hadOverage = (quotas.additionalUsageCount ?? 0) > 0;
    let description;
    let actions;
    if (entitlement === ChatEntitlement.Unknown) {
      description = localize("quota.exhausted.anonymous", "Sign in to keep going.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("signIn", "Sign In"), commandId: "workbench.action.chat.triggerSetup" }];
    } else if (entitlement === ChatEntitlement.Free) {
      description = localize("quota.exhausted.free", "Upgrade to keep going.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("upgrade", "Upgrade"), commandId: "workbench.action.chat.upgradePlan" }];
    } else if (this._isManagedPlan(entitlement)) {
      description = localize("quota.exhausted.managed", "Contact your admin to increase your limits.");
      actions = [];
    } else if (hadOverage) {
      description = localize("quota.exhausted.hadOverage", "Increase your budget to keep building.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("manageBudget", "Manage Budget"), commandId: "workbench.action.chat.manageAdditionalSpend" }];
    } else {
      description = localize("quota.exhausted.default", "Manage your budget to keep building.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("manageBudget2", "Manage Budget"), commandId: "workbench.action.chat.manageAdditionalSpend" }];
    }
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "quotaExhausted",
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.exhausted.title", "Credit Limit Reached"),
      description,
      actions,
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Overage notification -----------------------------------------------
  _showOverageActivationNotification() {
    this._showingExhausted = true;
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "overageActivation",
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.overage.title", "Credit Limit Reached"),
      description: localize("quota.overage.desc", "Additional budget is now covering extra usage."),
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Quota approaching --------------------------------------------------
  _showQuotaApproachingWarning(warning) {
    this._showingExhausted = false;
    this._activeQuotaWarning = warning;
    const entitlement = this._chatEntitlementService.entitlement;
    const quotas = this._chatEntitlementService.quotas;
    let description;
    let actions;
    if (entitlement === ChatEntitlement.Unknown || entitlement === ChatEntitlement.Free) {
      description = localize("quota.approaching.free", "Upgrade to continue past the limit.");
      actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("upgrade2", "Upgrade"), commandId: "workbench.action.chat.upgradePlan" }];
    } else if (this._isManagedPlan(entitlement)) {
      description = localize("quota.approaching.managed", "Contact your admin to increase your limits.");
      actions = [];
    } else if (quotas.additionalUsageEnabled) {
      description = localize("quota.approaching.overageEnabled", "Additional budget is enabled to cover extra usage.");
      actions = [];
    } else {
      const autoModelIdentifier = this._getAutoModelIdentifier();
      const canSwitchToAuto = !!autoModelIdentifier && !this._isAutoModelSelected(autoModelIdentifier);
      if (canSwitchToAuto) {
        this._requestSwitchToAutoTreatment();
      }
      if (this._switchToAutoTreatment === true && canSwitchToAuto) {
        description = localize("quota.approaching.switchToAuto", "Switch to Auto to reduce credit usage.");
        actions = [{ kind: ChatInputNotificationActionKind.SwitchToModel, label: localize("switchToAuto", "Switch to Auto"), modelIdentifier: autoModelIdentifier }];
      } else {
        description = localize("quota.approaching.default", "Set additional budget to cover extra usage.");
        actions = [{ kind: ChatInputNotificationActionKind.Command, label: localize("manageBudget3", "Manage Budget"), commandId: "workbench.action.chat.manageAdditionalSpend" }];
      }
    }
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: `quotaApproaching${warning.threshold}`,
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.approaching.title", "Credits at {0}%", warning.percentUsed),
      description,
      actions,
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Rate-limit warning -------------------------------------------------
  _computeRateLimitWarning() {
    const quotas = this._chatEntitlementService.quotas;
    const sessionResult = this._checkRateLimitCrossing(quotas.sessionRateLimit, this._prevSessionPercentUsed);
    this._prevSessionPercentUsed = sessionResult.newPrev;
    const weeklyResult = this._checkRateLimitCrossing(quotas.weeklyRateLimit, this._prevWeeklyPercentUsed);
    this._prevWeeklyPercentUsed = weeklyResult.newPrev;
    if (sessionResult.warning) {
      return { ...sessionResult.warning, type: "session" };
    }
    if (weeklyResult.warning) {
      return { ...weeklyResult.warning, type: "weekly" };
    }
    return void 0;
  }
  _checkRateLimitCrossing(snapshot, prevPercentUsed) {
    if (!snapshot || snapshot.unlimited) {
      return { newPrev: void 0 };
    }
    const percentUsed = 100 - snapshot.percentRemaining;
    const crossed = this._findCrossedThreshold(percentUsed, prevPercentUsed);
    return {
      newPrev: percentUsed,
      warning: crossed !== void 0 ? { percentUsed: Math.floor(percentUsed), resetDate: snapshot.resetDate } : void 0
    };
  }
  _showRateLimitWarning(warning) {
    this._showingExhausted = false;
    const message = warning.type === "session" ? localize("rateLimit.session", "You've used {0}% of your session rate limit.", warning.percentUsed) : localize("rateLimit.weekly", "You've used {0}% of your weekly rate limit.", warning.percentUsed);
    const description = warning.resetDate ? localize("rateLimit.resets", "Resets on {0}.", this._formatResetDate(warning.resetDate)) : void 0;
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: warning.type === "session" ? "sessionRateLimitWarning" : "weeklyRateLimitWarning",
      severity: ChatInputNotificationSeverity.Info,
      message,
      description,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  // --- Helpers ------------------------------------------------------------
  /**
   * Returns `true` only when a Copilot model is actively selected.
   * Returns `false` if no model is selected yet (widget not initialized)
   * or if the selected model is from a non-Copilot vendor (BYOK).
   */
  _isCopilotModelSelected() {
    return isSelectedModelCopilot(this._contextKeyService, this._storageService, this._languageModelsService);
  }
  _getAutoModelIdentifier() {
    for (const identifier of this._languageModelsService.getLanguageModelIds()) {
      const metadata = this._languageModelsService.lookupLanguageModel(identifier);
      if (metadata && isAutoLanguageModel({ identifier, metadata })) {
        return identifier;
      }
    }
    return void 0;
  }
  _isAutoModelSelected(autoModelIdentifier) {
    const identifier = getSelectedModelIdentifier(this._contextKeyService, this._storageService);
    const autoModel = this._languageModelsService.lookupLanguageModel(autoModelIdentifier);
    if (identifier === autoModelIdentifier || identifier === autoModel?.id) {
      return true;
    }
    const metadata = getSelectedModelMetadata(this._contextKeyService, this._storageService, this._languageModelsService);
    return !!metadata && isAutoLanguageModel({ identifier: identifier ?? "", metadata });
  }
  _refreshActiveQuotaApproachingWarning() {
    const warning = this._activeQuotaWarning;
    if (!warning || !this._isCopilotModelSelected()) {
      return;
    }
    const notification = this._chatInputNotificationService.getActiveNotification((candidate) => candidate.id === QUOTA_NOTIFICATION_ID);
    if (notification?.telemetryId === `quotaApproaching${warning.threshold}`) {
      this._showQuotaApproachingWarning(warning);
    }
  }
  _isManagedPlan(entitlement) {
    return entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
  }
  _isManagedPlanBlocked() {
    const snapshot = this._chatEntitlementService.quotas.premiumChat;
    return !!snapshot && snapshot.hasQuota === false;
  }
  _showManagedPlanBlockedNotification() {
    this._showingExhausted = true;
    this._setNotification({
      id: QUOTA_NOTIFICATION_ID,
      telemetryId: "managedPlanBlocked",
      severity: ChatInputNotificationSeverity.Info,
      message: localize("quota.blocked.managed.title", "Usage Blocked"),
      description: localize("quota.blocked.managed", "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage."),
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
  }
  _formatResetDate(isoDate) {
    const resetDate = new Date(isoDate);
    const now = /* @__PURE__ */ new Date();
    const includeYear = resetDate.getFullYear() !== now.getFullYear();
    return safeIntl.DateTimeFormat(
      void 0,
      includeYear ? { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" } : { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }
    ).value.format(resetDate);
  }
  _getTrajectoryPeriodKey() {
    const resetDate = this._chatEntitlementService.quotas.resetDate;
    if (!resetDate) {
      return void 0;
    }
    const date = new Date(resetDate);
    if (!Number.isFinite(date.getTime())) {
      return void 0;
    }
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
  }
  _isTrajectoryShownInCurrentPeriod() {
    const periodKey = this._getTrajectoryPeriodKey();
    return !!periodKey && this._storageService.get(TRAJECTORY_NUDGE_SPEC.shownStorageKey, StorageScope.APPLICATION) === periodKey;
  }
  _storeTrajectoryShown() {
    const periodKey = this._getTrajectoryPeriodKey();
    if (periodKey) {
      this._storageService.store(TRAJECTORY_NUDGE_SPEC.shownStorageKey, periodKey, StorageScope.APPLICATION, StorageTarget.USER);
    }
  }
  _setNotification(notification) {
    this._chatInputNotificationService.setNotification(notification);
  }
  _hideNotification() {
    this._showingExhausted = false;
    this._chatInputNotificationService.deleteNotification(QUOTA_NOTIFICATION_ID);
  }
  // --- Exhausted dismissal persistence ------------------------------------
  /**
   * Returns `true` only when there is an actual quota snapshot indicating that
   * credit is available (i.e. quota is not used up). Returns `false` when no
   * snapshot has loaded yet, so the transient "no data" state at startup/reload
   * is not mistaken for recovery.
   */
  _isQuotaKnownAvailable() {
    return !!this._getRelevantSnapshot() && !this._isQuotaUsedUp();
  }
  _isExhaustedDismissed() {
    return this._storageService.getBoolean(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
  }
  _setExhaustedDismissed() {
    this._storageService.store(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  _clearExhaustedDismissed() {
    this._storageService.remove(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION);
  }
};
ChatQuotaNotificationContribution.ID = "workbench.contrib.chatQuotaNotification";
ChatQuotaNotificationContribution = __decorateClass([
  __decorateParam(0, IChatEntitlementService),
  __decorateParam(1, IChatInputNotificationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ILanguageModelsService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchAssignmentService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, ILogService)
], ChatQuotaNotificationContribution);
export {
  ChatQuotaNotificationContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0UXVvdGFOb3RpZmljYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluaywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIElRdW90YVNuYXBzaG90LCBJUmF0ZUxpbWl0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFNlbGVjdGVkTW9kZWxJZGVudGlmaWVyLCBnZXRTZWxlY3RlZE1vZGVsTWV0YWRhdGEsIGlzU2VsZWN0ZWRNb2RlbENvcGlsb3QsIFNFTEVDVEVEX01PREVMX1NUT1JBR0VfS0VZX1BSRUZJWCwgU0VMRUNURURfTU9ERUxfU1RPUkFHRV9TQ09QRSB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2VsZWN0ZWRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBpc0F1dG9MYW5ndWFnZU1vZGVsIH0gZnJvbSAnLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQsIENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uLCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuXG5jb25zdCBRVU9UQV9OT1RJRklDQVRJT05fSUQgPSAnY29waWxvdC5xdW90YVN0YXR1cyc7XG5jb25zdCBUSFJFU0hPTERTID0gWzUwLCA3NSwgOTAsIDk1XTtcbmNvbnN0IFNXSVRDSF9UT19BVVRPX1RSRUFUTUVOVF9OQU1FID0gJ2NvbmZpZy5jaGF0UXVvdGFXYXJuaW5nU3dpdGNoVG9BdXRvJztcbmNvbnN0IFRSQUpFQ1RPUllfTlVER0VfU1BFQyA9IHtcblx0dHJlYXRtZW50TmFtZTogJ2NvbmZpZy5jaGF0UXVvdGFUcmFqZWN0b3J5TnVkZ2UnLFxuXHRzaG93blN0b3JhZ2VLZXk6ICdjaGF0LnF1b3RhVHJhamVjdG9yeS5zaG93blBlcmlvZCcsXG5cdGF2ZXJhZ2VEYWlseVVzYWdlVGhyZXNob2xkOiA0LjUsXG5cdG1pbmltdW1QZXJjZW50VXNlZDogMTAsXG5cdG1heGltdW1QZXJjZW50VXNlZDogMzUsXG5cdG1zUGVyRGF5OiAyNCAqIDYwICogNjAgKiAxMDAwLFxuXHRsZWFybk1vcmVVcmw6ICdodHRwczovL2FrYS5tcy90b2tlbi11c2FnZS10aXBzJyxcblx0bGVhcm5Nb3JlQ29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmxlYXJuTW9yZUFib3V0Q3JlZGl0VXNhZ2UnLFxufSBhcyBjb25zdDtcblxudHlwZSBDaGF0UXVvdGFUcmFqZWN0b3J5TnVkZ2VMaW5rQ2xpY2tlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3JmZWx0aXMnO1xuXHRjb21tZW50OiAnVHJhY2tzIHdoZW4gdXNlcnMgY2xpY2sgdGhlIGNoYXQgcXVvdGEgdHJhamVjdG9yeSBudWRnZSBsZWFybiBtb3JlIGxpbmsuJztcbn07XG5cbnR5cGUgQ2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsbWVudEV2ZW50ID0ge1xuXHR0cmVhdG1lbnQ6IGJvb2xlYW47XG5cdGVudGl0bGVtZW50OiBzdHJpbmc7XG5cdGF2ZXJhZ2VEYWlseVVzYWdlOiBudW1iZXI7XG5cdHBlcmNlbnRVc2VkOiBudW1iZXI7XG59O1xuXG50eXBlIENoYXRRdW90YVRyYWplY3RvcnlOdWRnZUVucm9sbG1lbnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdyZmVsdGlzJztcblx0Y29tbWVudDogJ1RyYWNrcyB3aGVuIGEgdXNlciBpcyBhc3NpZ25lZCB0byBhIGZsaWdodCBmb3IgdGhlIGNoYXQgcXVvdGEgdHJhamVjdG9yeSBudWRnZSBleHBlcmltZW50LCB0byBtZWFzdXJlIGV4cGVyaW1lbnQgZXhwb3N1cmUuJztcblx0dHJlYXRtZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHRyZWF0bWVudCB2YWx1ZSBhc3NpZ25lZCBieSB0aGUgZXhwZXJpbWVudCBzZXJ2aWNlICh0cnVlIGZvciB0aGUgdHJlYXRtZW50IGFybSwgZmFsc2UgZm9yIGNvbnRyb2wpLicgfTtcblx0ZW50aXRsZW1lbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdXNlciBlbnRpdGxlbWVudCB3aGVuIHRoZSB1c2VyIHdhcyBhc3NpZ25lZCB0byB0aGUgZXhwZXJpbWVudCBmbGlnaHQuJyB9O1xuXHRhdmVyYWdlRGFpbHlVc2FnZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBhdmVyYWdlIGRhaWx5IG1vbnRobHkgcXVvdGEgdXNhZ2UgcGVyY2VudGFnZSB3aGVuIHRoZSB1c2VyIHdhcyBhc3NpZ25lZCB0byB0aGUgZXhwZXJpbWVudCBmbGlnaHQuJyB9O1xuXHRwZXJjZW50VXNlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBtb250aGx5IHF1b3RhIHBlcmNlbnRhZ2UgdXNlZCB3aGVuIHRoZSB1c2VyIHdhcyBhc3NpZ25lZCB0byB0aGUgZXhwZXJpbWVudCBmbGlnaHQuJyB9O1xufTtcblxuLyoqXG4gKiBQZXJzaXN0ZWQgZmxhZyByZW1lbWJlcmluZyB0aGF0IHRoZSB1c2VyIGRpc21pc3NlZCB0aGUgcXVvdGEtZXhjZWVkZWRcbiAqIG5vdGlmaWNhdGlvbi4gS2VwdCB1bnRpbCBxdW90YSByZWNvdmVycyAoY3JlZGl0IGJlY29tZXMgYXZhaWxhYmxlIGFnYWluKSBzb1xuICogdGhlIGJhbm5lciBkb2VzIG5vdCByZS1hcHBlYXIgb24gZXZlcnkgd2luZG93IHJlbG9hZCB3aGlsZSBxdW90YSBpcyBzdGlsbFxuICogZXhoYXVzdGVkLlxuICovXG5jb25zdCBRVU9UQV9FWEhBVVNURURfRElTTUlTU0VEX1NUT1JBR0VfS0VZID0gJ2NoYXQucXVvdGFOb3RpZmljYXRpb24uZXhoYXVzdGVkRGlzbWlzc2VkJztcblxuLyoqXG4gKiBDb3JlLXNpZGUgd29ya2JlbmNoIGNvbnRyaWJ1dGlvbiB0aGF0IHNob3dzIGNoYXQgaW5wdXQgbm90aWZpY2F0aW9ucyBmb3JcbiAqIHF1b3RhIGV4aGF1c3Rpb24gYW5kIHF1b3RhLWFwcHJvYWNoaW5nIHRocmVzaG9sZHMuXG4gKlxuICogTGlzdGVucyB0byBgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2VgIHF1b3RhIGNoYW5nZSBldmVudHMgYW5kIGRldGVybWluZXNcbiAqIHdoZXRoZXIgYSBuZXcgdGhyZXNob2xkIGhhcyBiZWVuIGNyb3NzZWQsIHRoZW4gc2hvd3MgdGhlIGhpZ2hlc3QtcHJpb3JpdHlcbiAqIG5vdGlmaWNhdGlvbjpcbiAqXG4gKiAxLiAqKlF1b3RhIGV4aGF1c3RlZCoqIFx1MjAxNCBpbmZvLCBhdXRvLWRpc21pc3NlZCBvbiBuZXh0IG1lc3NhZ2UuXG4gKiAyLiAqKlF1b3RhIGFwcHJvYWNoaW5nKiogXHUyMDE0IGluZm8sIGF1dG8tZGlzbWlzc2VkIG9uIG5leHQgbWVzc2FnZS5cbiAqIDMuICoqUmF0ZS1saW1pdCB3YXJuaW5nKiogXHUyMDE0IGluZm8sIGF1dG8tZGlzbWlzc2VkIG9uIG5leHQgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRRdW90YU5vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFF1b3RhTm90aWZpY2F0aW9uJztcblxuXHQvKiogVHJhY2tzIHdoZXRoZXIgdGhlIGN1cnJlbnQgbm90aWZpY2F0aW9uIGlzIHRoZSBxdW90YS1leGhhdXN0ZWQgdmFyaWFudC4gKi9cblx0cHJpdmF0ZSBfc2hvd2luZ0V4aGF1c3RlZCA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBQcmV2aW91cyBwZXJjZW50LXVzZWQgZm9yIHRocmVzaG9sZCBjcm9zc2luZyBkZXRlY3Rpb24uXG5cdCAqIGB1bmRlZmluZWRgIG1lYW5zIG5vIGRhdGEgaGFzIGJlZW4gc2VlbiB5ZXQgXHUyMDE0IHRoZSBmaXJzdCB2YWx1ZVxuXHQgKiBlc3RhYmxpc2hlcyBhIGJhc2VsaW5lIHdpdGhvdXQgdHJpZ2dlcmluZyBhIG5vdGlmaWNhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3ByZXZRdW90YVBlcmNlbnRVc2VkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3ByZXZBZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcmV2U2Vzc2lvblBlcmNlbnRVc2VkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3ByZXZXZWVrbHlQZXJjZW50VXNlZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zd2l0Y2hUb0F1dG9UcmVhdG1lbnQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N3aXRjaFRvQXV0b0Fzc2lnbm1lbnRSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYWN0aXZlUXVvdGFXYXJuaW5nOiB7IHBlcmNlbnRVc2VkOiBudW1iZXI7IHRocmVzaG9sZDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RyYWplY3RvcnlUcmVhdG1lbnQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RyYWplY3RvcnlBc3NpZ25tZW50UmVxdWVzdGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Fzc2lnbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZygoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkKCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50KCgpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMoKCkgPT4gdGhpcy5fcmVmcmVzaEFjdGl2ZVF1b3RhQXBwcm9hY2hpbmdXYXJuaW5nKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChUUkFKRUNUT1JZX05VREdFX1NQRUMubGVhcm5Nb3JlQ29tbWFuZElkLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHRoaXMuX2hhbmRsZUNyZWRpdEVmZmljaWVuY3lMZWFybk1vcmVDb21tYW5kKGFjY2Vzc29yKSkpO1xuXG5cdFx0Ly8gUmUtZXZhbHVhdGUgd2hlbiB0aGUgc2VsZWN0ZWQgbW9kZWwgY2hhbmdlcyAoZS5nLiBzd2l0Y2hpbmcgYmV0d2VlbiBDb3BpbG90IGFuZCBCWU9LKS5cblx0XHQvLyBUaGUgY2hhdE1vZGVsSWQgY29udGV4dCBrZXkgaXMgd2lkZ2V0LXNjb3BlZCBhbmQgbWF5IG5vdCBidWJibGUgdG8gdGhlIGdsb2JhbFxuXHRcdC8vIHNlcnZpY2UsIHNvIHdlIGFsc28gbGlzdGVuIGZvciBzdG9yYWdlIGNoYW5nZXMgb24gdGhlIHBlcnNpc3RlZCBtb2RlbCBzZWxlY3Rpb24ga2V5LlxuXHRcdGNvbnN0IHN0b3JhZ2VMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTRUxFQ1RFRF9NT0RFTF9TVE9SQUdFX1NDT1BFLCB1bmRlZmluZWQsIHN0b3JhZ2VMaXN0ZW5lcikoZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkuc3RhcnRzV2l0aChTRUxFQ1RFRF9NT0RFTF9TVE9SQUdFX0tFWV9QUkVGSVgpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hBY3RpdmVRdW90YUFwcHJvYWNoaW5nV2FybmluZygpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZW1lbWJlciB3aGVuIHRoZSB1c2VyIGRpc21pc3NlcyB0aGUgcXVvdGEtZXhjZWVkZWQgbm90aWZpY2F0aW9uIHNvIGl0XG5cdFx0Ly8gZG9lcyBub3QgcmUtYXBwZWFyIG9uIHRoZSBuZXh0IHdpbmRvdyByZWxvYWQgd2hpbGUgcXVvdGEgaXMgc3RpbGxcblx0XHQvLyBleGhhdXN0ZWQuIFRoZSBmbGFnIGlzIGNsZWFyZWQgZnJvbSBgX3VwZGF0ZWAgb25jZSBxdW90YSByZWNvdmVycy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLm9uRGlkRGlzbWlzcyhpZCA9PiB7XG5cdFx0XHRpZiAoaWQgPT09IFFVT1RBX05PVElGSUNBVElPTl9JRCAmJiB0aGlzLl9zaG93aW5nRXhoYXVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX3NldEV4aGF1c3RlZERpc21pc3NlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENoZWNrIGluaXRpYWwgc3RhdGUgaW4gY2FzZSBxdW90YSBpcyBhbHJlYWR5IGV4aGF1c3RlZCBhdCBzdGFydHVwXG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU3dpdGNoVG9BdXRvVHJlYXRtZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyZWF0bWVudCA9IGF3YWl0IHRoaXMuX2Fzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxib29sZWFuPihTV0lUQ0hfVE9fQVVUT19UUkVBVE1FTlRfTkFNRSk7XG5cdFx0dGhpcy5fc3dpdGNoVG9BdXRvVHJlYXRtZW50ID0gdHJlYXRtZW50O1xuXHRcdGlmICh0cmVhdG1lbnQgPT09IHRydWUpIHtcblx0XHRcdHRoaXMuX3JlZnJlc2hBY3RpdmVRdW90YUFwcHJvYWNoaW5nV2FybmluZygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlcXVlc3RTd2l0Y2hUb0F1dG9UcmVhdG1lbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zd2l0Y2hUb0F1dG9Bc3NpZ25tZW50UmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLl9zd2l0Y2hUb0F1dG9Bc3NpZ25tZW50UmVxdWVzdGVkID0gdHJ1ZTtcblx0XHRcdHZvaWQgdGhpcy5fcmVzb2x2ZVN3aXRjaFRvQXV0b1RyZWF0bWVudCgpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHJlc29sdmUgJHtTV0lUQ0hfVE9fQVVUT19UUkVBVE1FTlRfTkFNRX1gLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMuX3N3aXRjaFRvQXV0b0Fzc2lnbm1lbnRSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgYWxyZWFkeS1ldmFsdWF0ZWQgdHJhamVjdG9yeSBleHBlcmltZW50IGNvaG9ydC4gVGhlIGFzc2lnbm1lbnRcblx0ICogc2VydmljZSByZXNvbHZlcyB0aGUgY29ob3J0IGFzeW5jaHJvbm91c2x5LCBzbyB0aGlzIGlzIHJlcXVlc3RlZCBvbmx5IG9uY2Vcblx0ICogdGhlIHVzZXIgaGFzIG1ldCBldmVyeSBub24tZXhwZXJpbWVudCBjb25kaXRpb24gcmVxdWlyZWQgZm9yIHRoZSBudWRnZS5cblx0ICpcblx0ICogU3RvcmVzIHRoZSByYXcgdHJlYXRtZW50IHZhbHVlLiBgdW5kZWZpbmVkYCBtZWFucyB0aGUgdXNlciBpcyBub3Rcblx0ICogYXNzaWduZWQgdG8gdGhlIGZsaWdodCAob3IgYXNzaWdubWVudHMgYXJlIG5vdCBhdmFpbGFibGUpOyBvbmx5IGEgYHRydWVgXG5cdCAqIHRyZWF0bWVudCByZW5kZXJzIHRoZSBudWRnZS4gV2UgZGVsaWJlcmF0ZWx5IGRvIG5vdCBjb2VyY2UgYSBtaXNzaW5nXG5cdCAqIGFzc2lnbm1lbnQgaW50byBhIHN5bnRoZXRpYyBcImNvbnRyb2xcIiB2YWx1ZSwgc2luY2UgdGhhdCB3b3VsZCBhc3N1bWUgYW5cblx0ICogZW5yb2xsbWVudCB0aGF0IG1heSBub3QgZXhpc3QuIEVucm9sbG1lbnQgdGVsZW1ldHJ5IGlzIGVtaXR0ZWQgb25seSB3aGVuXG5cdCAqIHRoZSB1c2VyIGlzIGFjdHVhbGx5IGFzc2lnbmVkIHRvIGEgZmxpZ2h0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVRyYWplY3RvcnlUcmVhdG1lbnQod2FybmluZzogeyBhdmVyYWdlRGFpbHlVc2FnZTogbnVtYmVyOyBwZXJjZW50VXNlZDogbnVtYmVyIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0cmVhdG1lbnQgPSBhd2FpdCB0aGlzLl9hc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8Ym9vbGVhbj4oVFJBSkVDVE9SWV9OVURHRV9TUEVDLnRyZWF0bWVudE5hbWUpO1xuXHRcdHRoaXMuX3RyYWplY3RvcnlUcmVhdG1lbnQgPSB0cmVhdG1lbnQ7XG5cdFx0aWYgKHRyZWF0bWVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sb2dRdW90YVRyYWplY3RvcnlOdWRnZUVucm9sbGVkKHRyZWF0bWVudCwgd2FybmluZyk7XG5cdFx0fVxuXHRcdGlmICh0cmVhdG1lbnQgPT09IHRydWUpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlcXVlc3RUcmFqZWN0b3J5VHJlYXRtZW50KHdhcm5pbmc6IHsgYXZlcmFnZURhaWx5VXNhZ2U6IG51bWJlcjsgcGVyY2VudFVzZWQ6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmFqZWN0b3J5QXNzaWdubWVudFJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5fdHJhamVjdG9yeUFzc2lnbm1lbnRSZXF1ZXN0ZWQgPSB0cnVlO1xuXHRcdFx0dm9pZCB0aGlzLl9yZXNvbHZlVHJhamVjdG9yeVRyZWF0bWVudCh3YXJuaW5nKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byByZXNvbHZlICR7VFJBSkVDVE9SWV9OVURHRV9TUEVDLnRyZWF0bWVudE5hbWV9YCwgZXJyb3IpO1xuXHRcdFx0XHR0aGlzLl90cmFqZWN0b3J5QXNzaWdubWVudFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVsZXZhbnRTbmFwc2hvdCgpOiBJUXVvdGFTbmFwc2hvdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcXVvdGFzID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0Y29uc3QgZW50aXRsZW1lbnQgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50O1xuXHRcdGlmIChlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24gfHwgZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlKSB7XG5cdFx0XHRyZXR1cm4gcXVvdGFzLmNoYXQgPz8gcXVvdGFzLnByZW1pdW1DaGF0O1xuXHRcdH1cblx0XHRyZXR1cm4gcXVvdGFzLnByZW1pdW1DaGF0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNRdW90YVVzZWRVcCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX2dldFJlbGV2YW50U25hcHNob3QoKTtcblx0XHRpZiAoIXNuYXBzaG90KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChzbmFwc2hvdC51bmxpbWl0ZWQpIHtcblx0XHRcdHJldHVybiBzbmFwc2hvdC5oYXNRdW90YSA9PT0gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBzbmFwc2hvdC5wZXJjZW50UmVtYWluaW5nIDw9IDA7XG5cdH1cblxuXHRwcml2YXRlIF9pc1VCQkVsaWdpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZyA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRpdGxlbWVudCA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cdFx0Y29uc3QgaXNDb3BpbG90ID0gdGhpcy5faXNDb3BpbG90TW9kZWxTZWxlY3RlZCgpO1xuXG5cdFx0Ly8gT25jZSBxdW90YSByZWNvdmVycyAoY3JlZGl0IGlzIHBvc2l0aXZlbHkgYXZhaWxhYmxlIGFnYWluKSBkcm9wIGFueVxuXHRcdC8vIHBlcnNpc3RlZCBkaXNtaXNzYWwgc28gdGhlIHF1b3RhLWV4Y2VlZGVkIG5vdGlmaWNhdGlvbiBjYW4gc2hvdyB0aGUgbmV4dFxuXHRcdC8vIHRpbWUgcXVvdGEgcnVucyBvdXQuIERvbmUgYmVmb3JlIHRoZSBDb3BpbG90L0JZT0sgZ2F0ZSBzbyBhIHJlY292ZXJ5IGlzXG5cdFx0Ly8gYWx3YXlzIG9ic2VydmVkLCBldmVuIHdoaWxlIGEgQllPSyBtb2RlbCBpcyBzZWxlY3RlZC4gR3VhcmRlZCBvbiBhXG5cdFx0Ly8gcHJlc2VudCBzbmFwc2hvdCBzbyB0aGUgdHJhbnNpZW50IFwibm8gcXVvdGEgZGF0YSB5ZXRcIiBzdGF0ZSBhdFxuXHRcdC8vIHN0YXJ0dXAvcmVsb2FkIGRvZXMgbm90IHdpcGUgdGhlIGZsYWcuXG5cdFx0aWYgKHRoaXMuX2lzUXVvdGFLbm93bkF2YWlsYWJsZSgpKSB7XG5cdFx0XHR0aGlzLl9jbGVhckV4aGF1c3RlZERpc21pc3NlZCgpO1xuXHRcdH1cblxuXHRcdC8vIERlZmVyIG5ldyBub3RpZmljYXRpb25zIHdoZW4gYSBCWU9LIG1vZGVsIGlzIHNlbGVjdGVkIG9yIHRoZSBtb2RlbFxuXHRcdC8vIHNlbGVjdGlvbiBoYXNuJ3QgbG9hZGVkIHlldCBcdTIwMTQgcXVvdGEgb25seSBhcHBsaWVzIHRvIENvcGlsb3QgbW9kZWxzLlxuXHRcdC8vIEFscmVhZHktc2hvd24gbm90aWZpY2F0aW9ucyBzdGF5IHZpc2libGUuXG5cdFx0aWYgKCFpc0NvcGlsb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIHF1b3RhIG5vdGlmaWNhdGlvbnMgZm9yIFBSVSB1c2VycyBcdTIwMTQgb25seSBzaG93IGZvciBVQkIuXG5cdFx0Y29uc3QgaXNRdW90YU5vdGlmaWNhdGlvbkVsaWdpYmxlID0gZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duIHx8IHRoaXMuX2lzVUJCRWxpZ2libGUoKTtcblxuXHRcdC8vIFByaW9yaXR5IDA6IEJ1c2luZXNzL0VudGVycHJpc2Ugb3JnLWJsb2NrZWQgXHUyMDE0IGhhc1F1b3RhID09PSBmYWxzZSBpcyB0aGVcblx0XHQvLyBhdXRob3JpdGF0aXZlIHNpZ25hbCB0aGF0IHRoZSBvcmcgaGFzIGV4Y2VlZGVkIGl0cyBidWRnZXQsIHJlZ2FyZGxlc3Mgb2Zcblx0XHQvLyBvdmVyYWdlcyBvciByZW1haW5pbmcgcXVvdGEuXG5cdFx0aWYgKHRoaXMuX2lzTWFuYWdlZFBsYW4oZW50aXRsZW1lbnQpICYmIHRoaXMuX2lzTWFuYWdlZFBsYW5CbG9ja2VkKCkpIHtcblx0XHRcdGlmICghdGhpcy5faXNFeGhhdXN0ZWREaXNtaXNzZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9zaG93TWFuYWdlZFBsYW5CbG9ja2VkTm90aWZpY2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUHJpb3JpdHkgMTogUXVvdGEgZXhoYXVzdGVkIG9yIGZ1bGx5IHVzZWRcblx0XHRpZiAoaXNRdW90YU5vdGlmaWNhdGlvbkVsaWdpYmxlICYmIHRoaXMuX2lzUXVvdGFVc2VkVXAoKSkge1xuXHRcdFx0Y29uc3QgcXVvdGFzID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0XHRjb25zdCBhZGRpdGlvbmFsVXNhZ2VFbmFibGVkID0gcXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPz8gZmFsc2U7XG5cdFx0XHRjb25zdCB3YXNBZGRpdGlvbmFsVXNhZ2VFbmFibGVkID0gdGhpcy5fcHJldkFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ7XG5cdFx0XHR0aGlzLl9wcmV2QWRkaXRpb25hbFVzYWdlRW5hYmxlZCA9IGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ7XG5cblx0XHRcdGlmICghdGhpcy5faXNFeGhhdXN0ZWREaXNtaXNzZWQoKSkge1xuXHRcdFx0XHRpZiAoYWRkaXRpb25hbFVzYWdlRW5hYmxlZCkge1xuXHRcdFx0XHRcdC8vIFNob3cgb3ZlcmFnZSBub3RpZmljYXRpb24gb24gYSBsaXZlIHRyYW5zaXRpb24gdG8gMTAwJSxcblx0XHRcdFx0XHQvLyBvciB3aGVuIG92ZXJhZ2VzIGFyZSBlbmFibGVkIHdoaWxlIGFscmVhZHkgYXQgMTAwJS5cblx0XHRcdFx0XHRpZiAodGhpcy5fcHJldlF1b3RhUGVyY2VudFVzZWQgIT09IHVuZGVmaW5lZCB8fCB3YXNBZGRpdGlvbmFsVXNhZ2VFbmFibGVkID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd092ZXJhZ2VBY3RpdmF0aW9uTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dFeGhhdXN0ZWROb3RpZmljYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBLZWVwIHRoZSBiYXNlbGluZSB1cC10by1kYXRlIHNvIHRoYXQgcmVjb3ZlcnkgZnJvbSBleGhhdXN0aW9uXG5cdFx0XHQvLyBkb2VzIG5vdCB0cmlnZ2VyIGEgc3B1cmlvdXMgdGhyZXNob2xkIG5vdGlmaWNhdGlvbi5cblx0XHRcdGNvbnN0IGV4aGF1c3RlZFNuYXBzaG90ID0gdGhpcy5fZ2V0UmVsZXZhbnRTbmFwc2hvdCgpO1xuXHRcdFx0aWYgKGV4aGF1c3RlZFNuYXBzaG90ICYmICFleGhhdXN0ZWRTbmFwc2hvdC51bmxpbWl0ZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJldlF1b3RhUGVyY2VudFVzZWQgPSAxMDAgLSBleGhhdXN0ZWRTbmFwc2hvdC5wZXJjZW50UmVtYWluaW5nO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUHJpb3JpdHkgMjogUXVvdGEgYXBwcm9hY2hpbmcgdGhyZXNob2xkXG5cdFx0aWYgKGlzUXVvdGFOb3RpZmljYXRpb25FbGlnaWJsZSkge1xuXHRcdFx0Y29uc3QgdHJhamVjdG9yeVdhcm5pbmcgPSB0aGlzLl9jb21wdXRlUXVvdGFUcmFqZWN0b3J5V2FybmluZygpO1xuXHRcdFx0aWYgKHRyYWplY3RvcnlXYXJuaW5nKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dRdW90YVRyYWplY3RvcnlXYXJuaW5nKHRyYWplY3RvcnlXYXJuaW5nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBxdW90YVdhcm5pbmcgPSB0aGlzLl9jb21wdXRlUXVvdGFXYXJuaW5nKCk7XG5cdFx0XHRpZiAocXVvdGFXYXJuaW5nKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dRdW90YUFwcHJvYWNoaW5nV2FybmluZyhxdW90YVdhcm5pbmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUHJpb3JpdHkgMzogUmF0ZS1saW1pdCB3YXJuaW5nIChzZXNzaW9uID4gd2Vla2x5KVxuXHRcdGNvbnN0IHJhdGVMaW1pdFdhcm5pbmcgPSB0aGlzLl9jb21wdXRlUmF0ZUxpbWl0V2FybmluZygpO1xuXHRcdGlmIChyYXRlTGltaXRXYXJuaW5nKSB7XG5cdFx0XHR0aGlzLl9zaG93UmF0ZUxpbWl0V2FybmluZyhyYXRlTGltaXRXYXJuaW5nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBOb3RoaW5nIG5ldyB0byBzaG93IFx1MjAxNCBvbmx5IGhpZGUgaWYgdGhlIGV4aGF1c3RlZCBub3RpZmljYXRpb24gaXNcblx0XHQvLyBhY3RpdmUgYW5kIHRoZSBxdW90YSBpcyBubyBsb25nZXIgZXhoYXVzdGVkIChzdGF0ZS1kcml2ZW4pLlxuXHRcdGlmICh0aGlzLl9zaG93aW5nRXhoYXVzdGVkICYmICF0aGlzLl9pc1F1b3RhVXNlZFVwKCkpIHtcblx0XHRcdHRoaXMuX2hpZGVOb3RpZmljYXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gVGhyZXNob2xkIGNyb3NzaW5nIGRldGVjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfY29tcHV0ZVF1b3RhV2FybmluZygpOiB7IHBlcmNlbnRVc2VkOiBudW1iZXI7IHRocmVzaG9sZDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5fZ2V0UmVsZXZhbnRTbmFwc2hvdCgpO1xuXHRcdGlmICghc25hcHNob3QgfHwgc25hcHNob3QudW5saW1pdGVkKSB7XG5cdFx0XHR0aGlzLl9wcmV2UXVvdGFQZXJjZW50VXNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHBlcmNlbnRVc2VkID0gMTAwIC0gc25hcHNob3QucGVyY2VudFJlbWFpbmluZztcblx0XHRjb25zdCBjcm9zc2VkID0gdGhpcy5fZmluZENyb3NzZWRUaHJlc2hvbGQocGVyY2VudFVzZWQsIHRoaXMuX3ByZXZRdW90YVBlcmNlbnRVc2VkKTtcblx0XHR0aGlzLl9wcmV2UXVvdGFQZXJjZW50VXNlZCA9IHBlcmNlbnRVc2VkO1xuXHRcdGlmIChjcm9zc2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHBlcmNlbnRVc2VkOiBNYXRoLmZsb29yKHBlcmNlbnRVc2VkKSwgdGhyZXNob2xkOiBjcm9zc2VkIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlUXVvdGFUcmFqZWN0b3J5V2FybmluZygpOiB7IGF2ZXJhZ2VEYWlseVVzYWdlOiBudW1iZXI7IHBlcmNlbnRVc2VkOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2lzVHJhamVjdG9yeVNob3duSW5DdXJyZW50UGVyaW9kKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLl9nZXRSZWxldmFudFNuYXBzaG90KCk7XG5cdFx0aWYgKCFzbmFwc2hvdCB8fCBzbmFwc2hvdC51bmxpbWl0ZWQgfHwgc25hcHNob3QucGVyY2VudFJlbWFpbmluZyA8PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc2V0RGF0ZSA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnJlc2V0RGF0ZTtcblx0XHRpZiAoIXJlc2V0RGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXNldCA9IG5ldyBEYXRlKHJlc2V0RGF0ZSk7XG5cdFx0Y29uc3QgcmVzZXRUaW1lID0gcmVzZXQuZ2V0VGltZSgpO1xuXHRcdGlmICghTnVtYmVyLmlzRmluaXRlKHJlc2V0VGltZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVyaW9kU3RhcnQgPSBuZXcgRGF0ZShyZXNldFRpbWUpO1xuXHRcdHBlcmlvZFN0YXJ0LnNldFVUQ01vbnRoKHBlcmlvZFN0YXJ0LmdldFVUQ01vbnRoKCkgLSAxKTtcblx0XHRjb25zdCBwZXJpb2RTdGFydFRpbWUgPSBwZXJpb2RTdGFydC5nZXRUaW1lKCk7XG5cdFx0Y29uc3QgZWxhcHNlZERheXMgPSAoRGF0ZS5ub3coKSAtIHBlcmlvZFN0YXJ0VGltZSkgLyBUUkFKRUNUT1JZX05VREdFX1NQRUMubXNQZXJEYXk7XG5cdFx0aWYgKGVsYXBzZWREYXlzIDwgMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwZXJjZW50VXNlZCA9IDEwMCAtIHNuYXBzaG90LnBlcmNlbnRSZW1haW5pbmc7XG5cdFx0aWYgKHBlcmNlbnRVc2VkIDwgVFJBSkVDVE9SWV9OVURHRV9TUEVDLm1pbmltdW1QZXJjZW50VXNlZCB8fCBwZXJjZW50VXNlZCA+IFRSQUpFQ1RPUllfTlVER0VfU1BFQy5tYXhpbXVtUGVyY2VudFVzZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXZlcmFnZURhaWx5VXNhZ2UgPSBwZXJjZW50VXNlZCAvIE1hdGgubWF4KDEsIGVsYXBzZWREYXlzKTtcblx0XHRpZiAoYXZlcmFnZURhaWx5VXNhZ2UgPCBUUkFKRUNUT1JZX05VREdFX1NQRUMuYXZlcmFnZURhaWx5VXNhZ2VUaHJlc2hvbGQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVxdWVzdFRyYWplY3RvcnlUcmVhdG1lbnQoeyBhdmVyYWdlRGFpbHlVc2FnZSwgcGVyY2VudFVzZWQgfSk7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWplY3RvcnlUcmVhdG1lbnQgPT09IHRydWUgPyB7IGF2ZXJhZ2VEYWlseVVzYWdlLCBwZXJjZW50VXNlZCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1F1b3RhVHJhamVjdG9yeVdhcm5pbmcod2FybmluZzogeyBhdmVyYWdlRGFpbHlVc2FnZTogbnVtYmVyOyBwZXJjZW50VXNlZDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93aW5nRXhoYXVzdGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fc3RvcmVUcmFqZWN0b3J5U2hvd24oKTtcblx0XHRjb25zdCBsZWFybk1vcmVMaW5rID0gY3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7XG5cdFx0XHR0ZXh0OiBsb2NhbGl6ZSgncXVvdGEudHJhamVjdG9yeS5sZWFybk1vcmVTdGFuZGFsb25lJywgXCJMZWFybiBhYm91dCBvcHRpbWl6aW5nIHVzYWdlXCIpLFxuXHRcdFx0aWQ6IFRSQUpFQ1RPUllfTlVER0VfU1BFQy5sZWFybk1vcmVDb21tYW5kSWQsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncXVvdGEudHJhamVjdG9yeS5sZWFybk1vcmVUb29sdGlwJywgXCJMZWFybiBhYm91dCBvcHRpbWl6aW5nIHVzYWdlXCIpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSh7IGtleTogJ3F1b3RhLnRyYWplY3RvcnkubWVzc2FnZScsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIltcIn0nLCAne0xvY2tlZD1cIl0oezB9KVwifSddIH0sIFwiWW91J3JlIGxpa2VseSB0byBleGhhdXN0IHlvdXIgQUkgY3JlZGl0cyBiZWZvcmUgeW91ciBiaWxsaW5nIHBlcmlvZC4gezB9LlwiLCBsZWFybk1vcmVMaW5rKTtcblxuXHRcdHRoaXMuX3NldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogUVVPVEFfTk9USUZJQ0FUSU9OX0lELFxuXHRcdFx0dGVsZW1ldHJ5SWQ6ICdxdW90YVRyYWplY3RvcnlOdWRnZScsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlLCB7IGlzVHJ1c3RlZDogeyBlbmFibGVkQ29tbWFuZHM6IFtUUkFKRUNUT1JZX05VREdFX1NQRUMubGVhcm5Nb3JlQ29tbWFuZElkXSB9IH0pLFxuXHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IHRydWUsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVDcmVkaXRFZmZpY2llbmN5TGVhcm5Nb3JlQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwgQ2hhdFF1b3RhVHJhamVjdG9yeU51ZGdlTGlua0NsaWNrZWRDbGFzc2lmaWNhdGlvbj4oJ2NoYXRRdW90YVRyYWplY3RvcnlOdWRnZUxpbmtDbGlja2VkJyk7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5faGlkZU5vdGlmaWNhdGlvbigpKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpLm9wZW4oVVJJLnBhcnNlKFRSQUpFQ1RPUllfTlVER0VfU1BFQy5sZWFybk1vcmVVcmwpKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ1F1b3RhVHJhamVjdG9yeU51ZGdlRW5yb2xsZWQodHJlYXRtZW50OiBib29sZWFuLCB3YXJuaW5nOiB7IGF2ZXJhZ2VEYWlseVVzYWdlOiBudW1iZXI7IHBlcmNlbnRVc2VkOiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UXVvdGFUcmFqZWN0b3J5TnVkZ2VFbnJvbGxtZW50RXZlbnQsIENoYXRRdW90YVRyYWplY3RvcnlOdWRnZUVucm9sbG1lbnRDbGFzc2lmaWNhdGlvbj4oJ2NoYXRRdW90YVRyYWplY3RvcnlOdWRnZUVucm9sbGVkJywge1xuXHRcdFx0dHJlYXRtZW50LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudFt0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50XSxcblx0XHRcdGF2ZXJhZ2VEYWlseVVzYWdlOiBNYXRoLnJvdW5kKHdhcm5pbmcuYXZlcmFnZURhaWx5VXNhZ2UgKiAxMDApIC8gMTAwLFxuXHRcdFx0cGVyY2VudFVzZWQ6IE1hdGgucm91bmQod2FybmluZy5wZXJjZW50VXNlZCAqIDEwMCkgLyAxMDAsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgaGlnaGVzdCB0aHJlc2hvbGQgdGhhdCB3YXMgbmV3bHkgY3Jvc3NlZCwgb3IgYHVuZGVmaW5lZGAuXG5cdCAqL1xuXHRwcml2YXRlIF9maW5kQ3Jvc3NlZFRocmVzaG9sZChjdXJyZW50OiBudW1iZXIsIHByZXZpb3VzOiBudW1iZXIgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmIChwcmV2aW91cyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gVEhSRVNIT0xEUy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgdGhyZXNob2xkID0gVEhSRVNIT0xEU1tpXTtcblx0XHRcdGlmIChwcmV2aW91cyA8IHRocmVzaG9sZCAmJiBjdXJyZW50ID49IHRocmVzaG9sZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhyZXNob2xkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gLS0tIFF1b3RhIGV4aGF1c3RlZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9zaG93RXhoYXVzdGVkTm90aWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nob3dpbmdFeGhhdXN0ZWQgPSB0cnVlO1xuXG5cdFx0Y29uc3QgZW50aXRsZW1lbnQgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50O1xuXHRcdGNvbnN0IHF1b3RhcyA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXHRcdGNvbnN0IGhhZE92ZXJhZ2UgPSAocXVvdGFzLmFkZGl0aW9uYWxVc2FnZUNvdW50ID8/IDApID4gMDtcblxuXHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdGxldCBhY3Rpb25zOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uWydhY3Rpb25zJ107XG5cblx0XHRpZiAoZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdxdW90YS5leGhhdXN0ZWQuYW5vbnltb3VzJywgXCJTaWduIGluIHRvIGtlZXAgZ29pbmcuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6IGxvY2FsaXplKCdzaWduSW4nLCBcIlNpZ24gSW5cIiksIGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXAnIH1dO1xuXHRcdH0gZWxzZSBpZiAoZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdxdW90YS5leGhhdXN0ZWQuZnJlZScsIFwiVXBncmFkZSB0byBrZWVwIGdvaW5nLlwiKTtcblx0XHRcdGFjdGlvbnMgPSBbeyBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLkNvbW1hbmQsIGxhYmVsOiBsb2NhbGl6ZSgndXBncmFkZScsIFwiVXBncmFkZVwiKSwgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuJyB9XTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzTWFuYWdlZFBsYW4oZW50aXRsZW1lbnQpKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdxdW90YS5leGhhdXN0ZWQubWFuYWdlZCcsIFwiQ29udGFjdCB5b3VyIGFkbWluIHRvIGluY3JlYXNlIHlvdXIgbGltaXRzLlwiKTtcblx0XHRcdGFjdGlvbnMgPSBbXTtcblx0XHR9IGVsc2UgaWYgKGhhZE92ZXJhZ2UpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmV4aGF1c3RlZC5oYWRPdmVyYWdlJywgXCJJbmNyZWFzZSB5b3VyIGJ1ZGdldCB0byBrZWVwIGJ1aWxkaW5nLlwiKTtcblx0XHRcdGFjdGlvbnMgPSBbeyBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLkNvbW1hbmQsIGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlQnVkZ2V0JywgXCJNYW5hZ2UgQnVkZ2V0XCIpLCBjb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlQWRkaXRpb25hbFNwZW5kJyB9XTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgncXVvdGEuZXhoYXVzdGVkLmRlZmF1bHQnLCBcIk1hbmFnZSB5b3VyIGJ1ZGdldCB0byBrZWVwIGJ1aWxkaW5nLlwiKTtcblx0XHRcdGFjdGlvbnMgPSBbeyBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLkNvbW1hbmQsIGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlQnVkZ2V0MicsIFwiTWFuYWdlIEJ1ZGdldFwiKSwgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcgfV07XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiBRVU9UQV9OT1RJRklDQVRJT05fSUQsXG5cdFx0XHR0ZWxlbWV0cnlJZDogJ3F1b3RhRXhoYXVzdGVkJyxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3F1b3RhLmV4aGF1c3RlZC50aXRsZScsIFwiQ3JlZGl0IExpbWl0IFJlYWNoZWRcIiksXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tIE92ZXJhZ2Ugbm90aWZpY2F0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfc2hvd092ZXJhZ2VBY3RpdmF0aW9uTm90aWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nob3dpbmdFeGhhdXN0ZWQgPSB0cnVlO1xuXG5cdFx0dGhpcy5fc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiBRVU9UQV9OT1RJRklDQVRJT05fSUQsXG5cdFx0XHR0ZWxlbWV0cnlJZDogJ292ZXJhZ2VBY3RpdmF0aW9uJyxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3F1b3RhLm92ZXJhZ2UudGl0bGUnLCBcIkNyZWRpdCBMaW1pdCBSZWFjaGVkXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdxdW90YS5vdmVyYWdlLmRlc2MnLCBcIkFkZGl0aW9uYWwgYnVkZ2V0IGlzIG5vdyBjb3ZlcmluZyBleHRyYSB1c2FnZS5cIiksXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHRcdGRpc21pc3NpYmxlOiB0cnVlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gUXVvdGEgYXBwcm9hY2hpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9zaG93UXVvdGFBcHByb2FjaGluZ1dhcm5pbmcod2FybmluZzogeyBwZXJjZW50VXNlZDogbnVtYmVyOyB0aHJlc2hvbGQ6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd2luZ0V4aGF1c3RlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2FjdGl2ZVF1b3RhV2FybmluZyA9IHdhcm5pbmc7XG5cblx0XHRjb25zdCBlbnRpdGxlbWVudCA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cdFx0Y29uc3QgcXVvdGFzID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cblx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZztcblx0XHRsZXQgYWN0aW9uczogSUNoYXRJbnB1dE5vdGlmaWNhdGlvblsnYWN0aW9ucyddO1xuXG5cdFx0aWYgKGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93biB8fCBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmFwcHJvYWNoaW5nLmZyZWUnLCBcIlVwZ3JhZGUgdG8gY29udGludWUgcGFzdCB0aGUgbGltaXQuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6IGxvY2FsaXplKCd1cGdyYWRlMicsIFwiVXBncmFkZVwiKSwgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuJyB9XTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzTWFuYWdlZFBsYW4oZW50aXRsZW1lbnQpKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdxdW90YS5hcHByb2FjaGluZy5tYW5hZ2VkJywgXCJDb250YWN0IHlvdXIgYWRtaW4gdG8gaW5jcmVhc2UgeW91ciBsaW1pdHMuXCIpO1xuXHRcdFx0YWN0aW9ucyA9IFtdO1xuXHRcdH0gZWxzZSBpZiAocXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3F1b3RhLmFwcHJvYWNoaW5nLm92ZXJhZ2VFbmFibGVkJywgXCJBZGRpdGlvbmFsIGJ1ZGdldCBpcyBlbmFibGVkIHRvIGNvdmVyIGV4dHJhIHVzYWdlLlwiKTtcblx0XHRcdGFjdGlvbnMgPSBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYXV0b01vZGVsSWRlbnRpZmllciA9IHRoaXMuX2dldEF1dG9Nb2RlbElkZW50aWZpZXIoKTtcblx0XHRcdGNvbnN0IGNhblN3aXRjaFRvQXV0byA9ICEhYXV0b01vZGVsSWRlbnRpZmllciAmJiAhdGhpcy5faXNBdXRvTW9kZWxTZWxlY3RlZChhdXRvTW9kZWxJZGVudGlmaWVyKTtcblx0XHRcdGlmIChjYW5Td2l0Y2hUb0F1dG8pIHtcblx0XHRcdFx0dGhpcy5fcmVxdWVzdFN3aXRjaFRvQXV0b1RyZWF0bWVudCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3N3aXRjaFRvQXV0b1RyZWF0bWVudCA9PT0gdHJ1ZSAmJiBjYW5Td2l0Y2hUb0F1dG8pIHtcblx0XHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgncXVvdGEuYXBwcm9hY2hpbmcuc3dpdGNoVG9BdXRvJywgXCJTd2l0Y2ggdG8gQXV0byB0byByZWR1Y2UgY3JlZGl0IHVzYWdlLlwiKTtcblx0XHRcdFx0YWN0aW9ucyA9IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbCwgbGFiZWw6IGxvY2FsaXplKCdzd2l0Y2hUb0F1dG8nLCBcIlN3aXRjaCB0byBBdXRvXCIpLCBtb2RlbElkZW50aWZpZXI6IGF1dG9Nb2RlbElkZW50aWZpZXIgfV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdxdW90YS5hcHByb2FjaGluZy5kZWZhdWx0JywgXCJTZXQgYWRkaXRpb25hbCBidWRnZXQgdG8gY292ZXIgZXh0cmEgdXNhZ2UuXCIpO1xuXHRcdFx0XHRhY3Rpb25zID0gW3sga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kLCBsYWJlbDogbG9jYWxpemUoJ21hbmFnZUJ1ZGdldDMnLCBcIk1hbmFnZSBCdWRnZXRcIiksIGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnIH1dO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogUVVPVEFfTk9USUZJQ0FUSU9OX0lELFxuXHRcdFx0dGVsZW1ldHJ5SWQ6IGBxdW90YUFwcHJvYWNoaW5nJHt3YXJuaW5nLnRocmVzaG9sZH1gLFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncXVvdGEuYXBwcm9hY2hpbmcudGl0bGUnLCBcIkNyZWRpdHMgYXQgezB9JVwiLCB3YXJuaW5nLnBlcmNlbnRVc2VkKSxcblx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0YWN0aW9ucyxcblx0XHRcdGRpc21pc3NpYmxlOiB0cnVlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gUmF0ZS1saW1pdCB3YXJuaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9jb21wdXRlUmF0ZUxpbWl0V2FybmluZygpOiB7IHBlcmNlbnRVc2VkOiBudW1iZXI7IHR5cGU6ICdzZXNzaW9uJyB8ICd3ZWVrbHknOyByZXNldERhdGU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBxdW90YXMgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3RhcztcblxuXHRcdGNvbnN0IHNlc3Npb25SZXN1bHQgPSB0aGlzLl9jaGVja1JhdGVMaW1pdENyb3NzaW5nKHF1b3Rhcy5zZXNzaW9uUmF0ZUxpbWl0LCB0aGlzLl9wcmV2U2Vzc2lvblBlcmNlbnRVc2VkKTtcblx0XHR0aGlzLl9wcmV2U2Vzc2lvblBlcmNlbnRVc2VkID0gc2Vzc2lvblJlc3VsdC5uZXdQcmV2O1xuXG5cdFx0Y29uc3Qgd2Vla2x5UmVzdWx0ID0gdGhpcy5fY2hlY2tSYXRlTGltaXRDcm9zc2luZyhxdW90YXMud2Vla2x5UmF0ZUxpbWl0LCB0aGlzLl9wcmV2V2Vla2x5UGVyY2VudFVzZWQpO1xuXHRcdHRoaXMuX3ByZXZXZWVrbHlQZXJjZW50VXNlZCA9IHdlZWtseVJlc3VsdC5uZXdQcmV2O1xuXG5cdFx0aWYgKHNlc3Npb25SZXN1bHQud2FybmluZykge1xuXHRcdFx0cmV0dXJuIHsgLi4uc2Vzc2lvblJlc3VsdC53YXJuaW5nLCB0eXBlOiAnc2Vzc2lvbicgfTtcblx0XHR9XG5cdFx0aWYgKHdlZWtseVJlc3VsdC53YXJuaW5nKSB7XG5cdFx0XHRyZXR1cm4geyAuLi53ZWVrbHlSZXN1bHQud2FybmluZywgdHlwZTogJ3dlZWtseScgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrUmF0ZUxpbWl0Q3Jvc3NpbmcoXG5cdFx0c25hcHNob3Q6IElSYXRlTGltaXRTbmFwc2hvdCB8IHVuZGVmaW5lZCxcblx0XHRwcmV2UGVyY2VudFVzZWQ6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0KTogeyBuZXdQcmV2OiBudW1iZXIgfCB1bmRlZmluZWQ7IHdhcm5pbmc/OiB7IHBlcmNlbnRVc2VkOiBudW1iZXI7IHJlc2V0RGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfSB7XG5cdFx0aWYgKCFzbmFwc2hvdCB8fCBzbmFwc2hvdC51bmxpbWl0ZWQpIHtcblx0XHRcdHJldHVybiB7IG5ld1ByZXY6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0XHRjb25zdCBwZXJjZW50VXNlZCA9IDEwMCAtIHNuYXBzaG90LnBlcmNlbnRSZW1haW5pbmc7XG5cdFx0Y29uc3QgY3Jvc3NlZCA9IHRoaXMuX2ZpbmRDcm9zc2VkVGhyZXNob2xkKHBlcmNlbnRVc2VkLCBwcmV2UGVyY2VudFVzZWQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRuZXdQcmV2OiBwZXJjZW50VXNlZCxcblx0XHRcdHdhcm5pbmc6IGNyb3NzZWQgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IHsgcGVyY2VudFVzZWQ6IE1hdGguZmxvb3IocGVyY2VudFVzZWQpLCByZXNldERhdGU6IHNuYXBzaG90LnJlc2V0RGF0ZSB9XG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zaG93UmF0ZUxpbWl0V2FybmluZyh3YXJuaW5nOiB7IHBlcmNlbnRVc2VkOiBudW1iZXI7IHR5cGU6ICdzZXNzaW9uJyB8ICd3ZWVrbHknOyByZXNldERhdGU6IHN0cmluZyB8IHVuZGVmaW5lZCB9KTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd2luZ0V4aGF1c3RlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IHdhcm5pbmcudHlwZSA9PT0gJ3Nlc3Npb24nXG5cdFx0XHQ/IGxvY2FsaXplKCdyYXRlTGltaXQuc2Vzc2lvbicsIFwiWW91J3ZlIHVzZWQgezB9JSBvZiB5b3VyIHNlc3Npb24gcmF0ZSBsaW1pdC5cIiwgd2FybmluZy5wZXJjZW50VXNlZClcblx0XHRcdDogbG9jYWxpemUoJ3JhdGVMaW1pdC53ZWVrbHknLCBcIllvdSd2ZSB1c2VkIHswfSUgb2YgeW91ciB3ZWVrbHkgcmF0ZSBsaW1pdC5cIiwgd2FybmluZy5wZXJjZW50VXNlZCk7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHdhcm5pbmcucmVzZXREYXRlXG5cdFx0XHQ/IGxvY2FsaXplKCdyYXRlTGltaXQucmVzZXRzJywgXCJSZXNldHMgb24gezB9LlwiLCB0aGlzLl9mb3JtYXRSZXNldERhdGUod2FybmluZy5yZXNldERhdGUpKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6IFFVT1RBX05PVElGSUNBVElPTl9JRCxcblx0XHRcdHRlbGVtZXRyeUlkOiB3YXJuaW5nLnR5cGUgPT09ICdzZXNzaW9uJyA/ICdzZXNzaW9uUmF0ZUxpbWl0V2FybmluZycgOiAnd2Vla2x5UmF0ZUxpbWl0V2FybmluZycsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IHRydWUsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLSBIZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGB0cnVlYCBvbmx5IHdoZW4gYSBDb3BpbG90IG1vZGVsIGlzIGFjdGl2ZWx5IHNlbGVjdGVkLlxuXHQgKiBSZXR1cm5zIGBmYWxzZWAgaWYgbm8gbW9kZWwgaXMgc2VsZWN0ZWQgeWV0ICh3aWRnZXQgbm90IGluaXRpYWxpemVkKVxuXHQgKiBvciBpZiB0aGUgc2VsZWN0ZWQgbW9kZWwgaXMgZnJvbSBhIG5vbi1Db3BpbG90IHZlbmRvciAoQllPSykuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0NvcGlsb3RNb2RlbFNlbGVjdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1NlbGVjdGVkTW9kZWxDb3BpbG90KHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSwgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEF1dG9Nb2RlbElkZW50aWZpZXIoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKSkge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChpZGVudGlmaWVyKTtcblx0XHRcdGlmIChtZXRhZGF0YSAmJiBpc0F1dG9MYW5ndWFnZU1vZGVsKHsgaWRlbnRpZmllciwgbWV0YWRhdGEgfSkpIHtcblx0XHRcdFx0cmV0dXJuIGlkZW50aWZpZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0F1dG9Nb2RlbFNlbGVjdGVkKGF1dG9Nb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlkZW50aWZpZXIgPSBnZXRTZWxlY3RlZE1vZGVsSWRlbnRpZmllcih0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGF1dG9Nb2RlbCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGF1dG9Nb2RlbElkZW50aWZpZXIpO1xuXHRcdGlmIChpZGVudGlmaWVyID09PSBhdXRvTW9kZWxJZGVudGlmaWVyIHx8IGlkZW50aWZpZXIgPT09IGF1dG9Nb2RlbD8uaWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBtZXRhZGF0YSA9IGdldFNlbGVjdGVkTW9kZWxNZXRhZGF0YSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UsIHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdFx0cmV0dXJuICEhbWV0YWRhdGEgJiYgaXNBdXRvTGFuZ3VhZ2VNb2RlbCh7IGlkZW50aWZpZXI6IGlkZW50aWZpZXIgPz8gJycsIG1ldGFkYXRhIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaEFjdGl2ZVF1b3RhQXBwcm9hY2hpbmdXYXJuaW5nKCk6IHZvaWQge1xuXHRcdGNvbnN0IHdhcm5pbmcgPSB0aGlzLl9hY3RpdmVRdW90YVdhcm5pbmc7XG5cdFx0aWYgKCF3YXJuaW5nIHx8ICF0aGlzLl9pc0NvcGlsb3RNb2RlbFNlbGVjdGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gdGhpcy5fY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5nZXRBY3RpdmVOb3RpZmljYXRpb24oY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gUVVPVEFfTk9USUZJQ0FUSU9OX0lEKTtcblx0XHRpZiAobm90aWZpY2F0aW9uPy50ZWxlbWV0cnlJZCA9PT0gYHF1b3RhQXBwcm9hY2hpbmcke3dhcm5pbmcudGhyZXNob2xkfWApIHtcblx0XHRcdHRoaXMuX3Nob3dRdW90YUFwcHJvYWNoaW5nV2FybmluZyh3YXJuaW5nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc01hbmFnZWRQbGFuKGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5CdXNpbmVzcyB8fCBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkVudGVycHJpc2U7XG5cdH1cblxuXHRwcml2YXRlIF9pc01hbmFnZWRQbGFuQmxvY2tlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnByZW1pdW1DaGF0O1xuXHRcdHJldHVybiAhIXNuYXBzaG90ICYmIHNuYXBzaG90Lmhhc1F1b3RhID09PSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dNYW5hZ2VkUGxhbkJsb2NrZWROb3RpZmljYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd2luZ0V4aGF1c3RlZCA9IHRydWU7XG5cblx0XHR0aGlzLl9zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6IFFVT1RBX05PVElGSUNBVElPTl9JRCxcblx0XHRcdHRlbGVtZXRyeUlkOiAnbWFuYWdlZFBsYW5CbG9ja2VkJyxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3F1b3RhLmJsb2NrZWQubWFuYWdlZC50aXRsZScsIFwiVXNhZ2UgQmxvY2tlZFwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncXVvdGEuYmxvY2tlZC5tYW5hZ2VkJywgXCJZb3VyIG9yZ2FuaXphdGlvbiBvciBlbnRlcnByaXNlIGhhcyBleGNlZWRlZCBpdHMgQ29waWxvdCBidWRnZXQuIENvbnRhY3QgeW91ciBhZG1pbiB0byByZXN1bWUgdXNhZ2UuXCIpLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0UmVzZXREYXRlKGlzb0RhdGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzZXREYXRlID0gbmV3IERhdGUoaXNvRGF0ZSk7XG5cdFx0Y29uc3Qgbm93ID0gbmV3IERhdGUoKTtcblx0XHRjb25zdCBpbmNsdWRlWWVhciA9IHJlc2V0RGF0ZS5nZXRGdWxsWWVhcigpICE9PSBub3cuZ2V0RnVsbFllYXIoKTtcblx0XHRyZXR1cm4gc2FmZUludGwuRGF0ZVRpbWVGb3JtYXQodW5kZWZpbmVkLCBpbmNsdWRlWWVhclxuXHRcdFx0PyB7IG1vbnRoOiAnbG9uZycsIGRheTogJ251bWVyaWMnLCB5ZWFyOiAnbnVtZXJpYycsIGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnMi1kaWdpdCcgfVxuXHRcdFx0OiB7IG1vbnRoOiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH1cblx0XHQpLnZhbHVlLmZvcm1hdChyZXNldERhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VHJhamVjdG9yeVBlcmlvZEtleSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc2V0RGF0ZSA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnJlc2V0RGF0ZTtcblx0XHRpZiAoIXJlc2V0RGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKHJlc2V0RGF0ZSk7XG5cdFx0aWYgKCFOdW1iZXIuaXNGaW5pdGUoZGF0ZS5nZXRUaW1lKCkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7ZGF0ZS5nZXRVVENGdWxsWWVhcigpfS0ke2RhdGUuZ2V0VVRDTW9udGgoKSArIDF9YDtcblx0fVxuXG5cdHByaXZhdGUgX2lzVHJhamVjdG9yeVNob3duSW5DdXJyZW50UGVyaW9kKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHBlcmlvZEtleSA9IHRoaXMuX2dldFRyYWplY3RvcnlQZXJpb2RLZXkoKTtcblx0XHRyZXR1cm4gISFwZXJpb2RLZXkgJiYgdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFRSQUpFQ1RPUllfTlVER0VfU1BFQy5zaG93blN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgPT09IHBlcmlvZEtleTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlVHJhamVjdG9yeVNob3duKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBlcmlvZEtleSA9IHRoaXMuX2dldFRyYWplY3RvcnlQZXJpb2RLZXkoKTtcblx0XHRpZiAocGVyaW9kS2V5KSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShUUkFKRUNUT1JZX05VREdFX1NQRUMuc2hvd25TdG9yYWdlS2V5LCBwZXJpb2RLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVOb3RpZmljYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd2luZ0V4aGF1c3RlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuZGVsZXRlTm90aWZpY2F0aW9uKFFVT1RBX05PVElGSUNBVElPTl9JRCk7XG5cdH1cblxuXHQvLyAtLS0gRXhoYXVzdGVkIGRpc21pc3NhbCBwZXJzaXN0ZW5jZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogUmV0dXJucyBgdHJ1ZWAgb25seSB3aGVuIHRoZXJlIGlzIGFuIGFjdHVhbCBxdW90YSBzbmFwc2hvdCBpbmRpY2F0aW5nIHRoYXRcblx0ICogY3JlZGl0IGlzIGF2YWlsYWJsZSAoaS5lLiBxdW90YSBpcyBub3QgdXNlZCB1cCkuIFJldHVybnMgYGZhbHNlYCB3aGVuIG5vXG5cdCAqIHNuYXBzaG90IGhhcyBsb2FkZWQgeWV0LCBzbyB0aGUgdHJhbnNpZW50IFwibm8gZGF0YVwiIHN0YXRlIGF0IHN0YXJ0dXAvcmVsb2FkXG5cdCAqIGlzIG5vdCBtaXN0YWtlbiBmb3IgcmVjb3ZlcnkuXG5cdCAqL1xuXHRwcml2YXRlIF9pc1F1b3RhS25vd25BdmFpbGFibGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fZ2V0UmVsZXZhbnRTbmFwc2hvdCgpICYmICF0aGlzLl9pc1F1b3RhVXNlZFVwKCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0V4aGF1c3RlZERpc21pc3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihRVU9UQV9FWEhBVVNURURfRElTTUlTU0VEX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEV4aGF1c3RlZERpc21pc3NlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShRVU9UQV9FWEhBVVNURURfRElTTUlTU0VEX1NUT1JBR0VfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckV4aGF1c3RlZERpc21pc3NlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoUVVPVEFfRVhIQVVTVEVEX0RJU01JU1NFRF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQixzQkFBc0I7QUFDMUQsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxpQkFBaUIsK0JBQW1FO0FBQzdGLFNBQVMsNEJBQTRCLDBCQUEwQix3QkFBd0IsbUNBQW1DLG9DQUFvQztBQUM5SixTQUFTLHdCQUF3QiwyQkFBMkI7QUFDNUQsU0FBUyxpQ0FBaUMsK0JBQXVELHFDQUFxQztBQUV0SSxNQUFNLHdCQUF3QjtBQUM5QixNQUFNLGFBQWEsQ0FBQyxJQUFJLElBQUksSUFBSSxFQUFFO0FBQ2xDLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sd0JBQXdCO0FBQUEsRUFDN0IsZUFBZTtBQUFBLEVBQ2YsaUJBQWlCO0FBQUEsRUFDakIsNEJBQTRCO0FBQUEsRUFDNUIsb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQUEsRUFDcEIsVUFBVSxLQUFLLEtBQUssS0FBSztB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
