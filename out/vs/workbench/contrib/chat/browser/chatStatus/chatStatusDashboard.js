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
import { $, append, EventType, addDisposableListener, EventHelper, disposableWindowInterval, getWindow } from "../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { Checkbox, TriStateCheckbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { toAction } from "../../../../../base/common/actions.js";
import { Sequencer } from "../../../../../base/common/async.js";
import { cancelOnDispose } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { safeIntl } from "../../../../../base/common/date.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { MutableDisposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { parseLinkedText } from "../../../../../base/common/linkedText.js";
import { language } from "../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isObject } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { IInlineCompletionsService } from "../../../../../editor/browser/services/inlineCompletionsService.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ITextResourceConfigurationService } from "../../../../../editor/common/services/textResourceConfiguration.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IHoverService, nativeHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { Link } from "../../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { DomWidget } from "../../../../../platform/domWidget/browser/domWidget.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../common/editor.js";
import { IChatEntitlementService, ChatEntitlement, getChatPlanName } from "../../../../services/chat/common/chatEntitlementService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { isNewUser } from "./chatStatus.js";
import { IChatStatusItemService } from "./chatStatusItemService.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import product from "../../../../../platform/product/common/product.js";
import { isCompletionsEnabled } from "../../../../../editor/common/services/completionsEnablement.js";
const defaultChat = product.defaultChatAgent;
const completionsConfigurationTargets = [
  ConfigurationTarget.WORKSPACE_FOLDER,
  ConfigurationTarget.WORKSPACE,
  ConfigurationTarget.USER_REMOTE,
  ConfigurationTarget.USER_LOCAL,
  ConfigurationTarget.APPLICATION
];
let ChatStatusDashboard = class extends DomWidget {
  constructor(options, chatEntitlementService, chatStatusItemService, commandService, configurationService, editorService, hoverService, languageService, openerService, telemetryService, textResourceConfigurationService, inlineCompletionsService, markdownRendererService, languageFeaturesService, contextViewService, storageService, defaultAccountService, notificationService) {
    super();
    this.options = options;
    this.chatEntitlementService = chatEntitlementService;
    this.chatStatusItemService = chatStatusItemService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.hoverService = hoverService;
    this.languageService = languageService;
    this.openerService = openerService;
    this.telemetryService = telemetryService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.inlineCompletionsService = inlineCompletionsService;
    this.markdownRendererService = markdownRendererService;
    this.languageFeaturesService = languageFeaturesService;
    this.contextViewService = contextViewService;
    this.storageService = storageService;
    this.defaultAccountService = defaultAccountService;
    this.notificationService = notificationService;
    this.element = $("div.chat-status-bar-entry-tooltip");
    this.dateFormatter = safeIntl.DateTimeFormat(language, { month: "short", day: "numeric" });
    this.timeFormatter = safeIntl.DateTimeFormat(language, { hour: "numeric", minute: "numeric" });
    this.quotaPercentageFormatter = safeIntl.NumberFormat(void 0, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
    this.quotaCreditsFormatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    this.render();
  }
  render() {
    const token = cancelOnDispose(this._store);
    const { chat, premiumChat, completions } = this.chatEntitlementService.quotas;
    const hasQuotas = !!(chat || premiumChat);
    const isAnonymousWithSentiment = this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed;
    const isPooledQuotaDepleted = premiumChat?.unlimited && premiumChat.hasQuota === false;
    const hasUsageSection = hasQuotas || isAnonymousWithSentiment;
    const hasVisibleUsageContent = chat?.unlimited === false || premiumChat?.unlimited === false || !this.options?.compactQuotaLayout && completions?.unlimited === false || isAnonymousWithSentiment || isPooledQuotaDepleted;
    const contributedEntries = [...this.chatStatusItemService.getEntries()];
    const hasQuickSettingsContent = !this.options?.disableInlineSuggestionsSettings || !this.options?.disableModelSelection || !this.options?.disableProviderOptions || !this.options?.disableCompletionsSnooze;
    let headerAdditionalSpendButton;
    let headerUpgradeButton;
    if (hasUsageSection && !this.options?.compactQuotaLayout) {
      const planName = getChatPlanName(this.chatEntitlementService.entitlement);
      const headerHost = this.options?.titleHeaderContainer ?? this.element;
      const header = this.renderHeader(headerHost, this._store, planName, toAction({
        id: "workbench.action.manageCopilot",
        label: localize("quotaLabel", "Manage Copilot Settings"),
        tooltip: localize("quotaTooltip", "Manage Copilot Settings"),
        class: ThemeIcon.asClassName(Codicon.settings),
        run: () => this.runCommandAndClose(() => this.openerService.open(URI.parse(this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings))))
      }));
      const canConfigureAdditionalSpend = this.chatEntitlementService.entitlement === ChatEntitlement.EDU || this.chatEntitlementService.entitlement === ChatEntitlement.Pro || this.chatEntitlementService.entitlement === ChatEntitlement.ProPlus || this.chatEntitlementService.entitlement === ChatEntitlement.Max;
      const showUpgrade = this.chatEntitlementService.quotas.canUpgradePlan ?? false;
      const actionBarElement = header.lastElementChild;
      if (canConfigureAdditionalSpend) {
        headerAdditionalSpendButton = this._store.add(new Button(header, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
        headerAdditionalSpendButton.element.classList.add("header-cta-button");
        headerAdditionalSpendButton.label = localize("manageBudget", "Manage Budget");
        this._store.add(headerAdditionalSpendButton.onDidClick(() => {
          this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.manageAdditionalSpend", from: "chat-status" });
          this.runCommandAndClose(() => this.openerService.open(URI.parse(this.defaultAccountService.resolveGitHubUrl(GitHubPaths.billingBudgets))));
        }));
        if (actionBarElement) {
          header.insertBefore(headerAdditionalSpendButton.element, actionBarElement);
        }
      }
      if (showUpgrade) {
        headerUpgradeButton = this._store.add(new Button(header, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
        headerUpgradeButton.element.classList.add("header-cta-button");
        headerUpgradeButton.label = localize("upgrade", "Upgrade");
        this._store.add(headerUpgradeButton.onDidClick(() => this.runCommandAndClose("workbench.action.chat.upgradePlan")));
        if (actionBarElement) {
          header.insertBefore(headerUpgradeButton.element, actionBarElement);
        }
      }
    }
    if (hasUsageSection && this.options?.compactQuotaLayout && this.options.ctaButtonsContainer) {
      const ctaContainer = this.options.ctaButtonsContainer;
      const canConfigureAdditionalSpend = this.chatEntitlementService.entitlement === ChatEntitlement.EDU || this.chatEntitlementService.entitlement === ChatEntitlement.Pro || this.chatEntitlementService.entitlement === ChatEntitlement.ProPlus || this.chatEntitlementService.entitlement === ChatEntitlement.Max;
      const showUpgrade = this.chatEntitlementService.quotas.canUpgradePlan ?? false;
      if (canConfigureAdditionalSpend) {
        headerAdditionalSpendButton = this._store.add(new Button(ctaContainer, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
        headerAdditionalSpendButton.label = localize("manageBudget", "Manage Budget");
        this._store.add(headerAdditionalSpendButton.onDidClick(() => {
          this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.manageAdditionalSpend", from: "chat-status" });
          this.runCommandAndClose(() => this.openerService.open(URI.parse(this.defaultAccountService.resolveGitHubUrl(GitHubPaths.billingBudgets))));
        }));
      }
      if (showUpgrade) {
        headerUpgradeButton = this._store.add(new Button(ctaContainer, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
        headerUpgradeButton.label = localize("upgrade", "Upgrade");
        this._store.add(headerUpgradeButton.onDidClick(() => this.runCommandAndClose("workbench.action.chat.upgradePlan")));
      }
    }
    if (this.options?.compactQuotaLayout) {
      this.element.classList.add("compact");
    }
    const updatePromise = this.chatEntitlementService.update(token);
    if (hasVisibleUsageContent) {
      this.renderUsageContent(this.element, token, headerAdditionalSpendButton, headerUpgradeButton, updatePromise);
    }
    const hasPremiumUnlimited = !!premiumChat?.unlimited;
    const creditsUsed = hasPremiumUnlimited && !isPooledQuotaDepleted ? premiumChat?.creditsUsed : void 0;
    if (typeof creditsUsed === "number") {
      this.createCreditsUsedIndicator(this.element, creditsUsed, premiumChat?.resetAt);
    } else if (hasPremiumUnlimited) {
      const includedTitle = this.chatEntitlementService.quotas.usageBasedBilling ? localize("includedTitleTBB", "Credits") : localize("includedTitle", "Premium Requests");
      const getIncludedDescription = () => {
        if (isPooledQuotaDepleted) {
          return {
            compact: localize("premiumLimitReachedCompact", "{0} limit reached.", includedTitle),
            default: localize("premiumLimitReached", "Organization limit reached.")
          };
        }
        return {
          compact: localize("premiumIncludedCompact", "{0} included with your organization's plan.", includedTitle),
          default: localize("premiumIncluded", "Included with your organization's plan.")
        };
      };
      const includedDescription = getIncludedDescription();
      const includedContainer = this.element.appendChild($("div.quota-indicator.included"));
      if (this.options?.compactQuotaLayout) {
        const planName = getChatPlanName(this.chatEntitlementService.entitlement);
        includedContainer.classList.add("compact");
        includedContainer.appendChild($("div.quota-title", void 0, planName));
        includedContainer.appendChild($("div.description", void 0, includedDescription.compact));
      } else {
        includedContainer.appendChild($("div.quota-title", void 0, includedTitle));
        includedContainer.appendChild($("div.description", void 0, includedDescription.default));
      }
    }
    if (hasQuickSettingsContent) {
      const hasContentAbove = hasUsageSection || hasVisibleUsageContent || hasPremiumUnlimited;
      this.renderInlineSuggestionsSection(hasContentAbove);
    }
    if (contributedEntries.length > 0) {
      this.renderContributedSections(contributedEntries);
    }
    this.renderSetupSection();
  }
  renderUsageContent(container, token, headerAdditionalSpendButton, headerUpgradeButton, updatePromise) {
    const { chat: chatQuota, completions: completionsQuota, premiumChat: premiumChatQuota } = this.chatEntitlementService.quotas;
    const compact = !!this.options?.compactQuotaLayout;
    const planName = compact ? getChatPlanName(this.chatEntitlementService.entitlement) : void 0;
    if (chatQuota || premiumChatQuota || completionsQuota) {
      const resetLabel = this.formatGlobalResetLabel();
      const globalCalloutUpdater = this.createGlobalQuotaCallout(container);
      const { calloutVisible: initialCalloutVisible } = globalCalloutUpdater();
      if (headerAdditionalSpendButton) {
        headerAdditionalSpendButton.element.style.display = initialCalloutVisible ? "" : "none";
      }
      if (headerUpgradeButton) {
        headerUpgradeButton.element.style.display = headerAdditionalSpendButton && initialCalloutVisible ? "none" : "";
      }
      let chatQuotaIndicator;
      if (chatQuota && !chatQuota.unlimited && (!this.chatEntitlementService.quotas.usageBasedBilling || this.chatEntitlementService.entitlement === ChatEntitlement.Free)) {
        const chatLabel = this.chatEntitlementService.quotas.usageBasedBilling && this.chatEntitlementService.entitlement === ChatEntitlement.Free ? localize("creditsLabel", "Credits") : localize("chatsLabel", "Chat messages");
        chatQuotaIndicator = this.createQuotaIndicator(container, chatQuota, chatLabel, resetLabel, compact ? planName : void 0);
      }
      let premiumChatQuotaIndicator;
      if (premiumChatQuota && !premiumChatQuota.unlimited && premiumChatQuota.percentRemaining >= 0) {
        const isUBB = this.chatEntitlementService.quotas.usageBasedBilling;
        const premiumChatLabel = isUBB ? localize("creditsLabel", "Credits") : this.chatEntitlementService.quotas.additionalUsageEnabled ? localize("includedPremiumChatsLabel", "Included premium requests") : localize("premiumChatsLabel", "Premium requests");
        const premiumChatResetLabel = isUBB ? this.formatResetAtLabel(premiumChatQuota.resetAt) ?? resetLabel : resetLabel;
        premiumChatQuotaIndicator = this.createQuotaIndicator(container, premiumChatQuota, premiumChatLabel, premiumChatResetLabel, compact ? planName : void 0);
      }
      let additionalBudgetIndicator;
      let additionalBudgetElement;
      const initialOverageEntitlement = this.chatEntitlementService.quotas.additionalUsageEntitlement ?? 0;
      if (initialOverageEntitlement > 0) {
        const overageCount = this.chatEntitlementService.quotas.additionalUsageCount ?? 0;
        const overagePercentRemaining = Math.max(0, Math.min(100, (initialOverageEntitlement - overageCount) / initialOverageEntitlement * 100));
        const overageSnapshot = {
          percentRemaining: overagePercentRemaining,
          unlimited: false,
          entitlement: initialOverageEntitlement,
          quotaRemaining: Math.max(0, initialOverageEntitlement - overageCount)
        };
        const additionalBudgetLabel = localize("additionalBudgetLabel", "Additional Budget");
        additionalBudgetIndicator = this.createQuotaIndicator(container, overageSnapshot, additionalBudgetLabel, resetLabel, compact ? additionalBudgetLabel : void 0);
        additionalBudgetElement = container.lastElementChild;
        const isPremiumExhausted = premiumChatQuota && premiumChatQuota.percentRemaining <= 0;
        if (!isPremiumExhausted) {
          additionalBudgetElement.classList.add("muted");
        }
      }
      let completionsQuotaIndicator;
      const showCompletions = !compact && completionsQuota && !completionsQuota.unlimited && completionsQuota.percentRemaining >= 0 && (!this.chatEntitlementService.quotas.usageBasedBilling || this.chatEntitlementService.entitlement === ChatEntitlement.Free);
      if (showCompletions) {
        completionsQuotaIndicator = this.createQuotaIndicator(container, completionsQuota, localize("completionsLabel", "Inline Suggestions"), resetLabel, compact ? planName : void 0);
      }
      const updateIndicators = () => {
        const { chat: chatQuota2, premiumChat: premiumChatQuota2, completions: completionsQuota2 } = this.chatEntitlementService.quotas;
        if (chatQuota2) {
          chatQuotaIndicator?.(chatQuota2);
        }
        if (premiumChatQuota2) {
          premiumChatQuotaIndicator?.(premiumChatQuota2);
        }
        if (completionsQuota2) {
          completionsQuotaIndicator?.(completionsQuota2);
        }
        if (additionalBudgetIndicator && additionalBudgetElement) {
          const overageEntitlement = this.chatEntitlementService.quotas.additionalUsageEntitlement ?? 0;
          const overageCount = this.chatEntitlementService.quotas.additionalUsageCount ?? 0;
          if (overageEntitlement > 0) {
            const overagePercentRemaining = Math.max(0, Math.min(100, (overageEntitlement - overageCount) / overageEntitlement * 100));
            additionalBudgetIndicator({
              percentRemaining: overagePercentRemaining,
              unlimited: false,
              entitlement: overageEntitlement,
              quotaRemaining: Math.max(0, overageEntitlement - overageCount)
            });
          }
          const premiumExhausted = premiumChatQuota2 && premiumChatQuota2.percentRemaining <= 0;
          additionalBudgetElement.classList.toggle("muted", !premiumExhausted);
        }
        const { calloutVisible } = globalCalloutUpdater();
        if (headerAdditionalSpendButton) {
          headerAdditionalSpendButton.element.style.display = calloutVisible ? "" : "none";
          headerAdditionalSpendButton.label = localize("manageBudget", "Manage Budget");
        }
        if (headerUpgradeButton) {
          headerUpgradeButton.element.style.display = headerAdditionalSpendButton && calloutVisible ? "none" : "";
        }
      };
      (async () => {
        await updatePromise;
        if (token.isCancellationRequested) {
          return;
        }
        updateIndicators();
      })();
      this._store.add(this.chatEntitlementService.onDidChangeQuotaRemaining(() => updateIndicators()));
      this._store.add(this.chatEntitlementService.onDidChangeQuotaExceeded(() => updateIndicators()));
    } else if (this.chatEntitlementService.anonymous && this.chatEntitlementService.sentiment.completed) {
      this.createQuotaIndicator(container, localize("quotaLimited", "Limited"), localize("chatsLabel", "Chat messages"));
    }
  }
  renderInlineSuggestionsSection(hasContentAbove) {
    const nonCollapsible = !!this.options?.disableQuickSettingsCollapsible;
    const collapsed = !nonCollapsible && this.storageService.getBoolean(ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY, StorageScope.PROFILE, true);
    const activeLanguageId = this.editorService.activeTextEditorLanguageId;
    const getStatusText = () => {
      if (!this.canUseChat()) {
        return localize("inlineSuggestionsDisabled", "Disabled");
      }
      const enabled = activeLanguageId ? isCompletionsEnabled(this.configurationService, activeLanguageId) : isCompletionsEnabled(this.configurationService);
      return enabled ? localize("inlineSuggestionsEnabled", "Enabled") : localize("inlineSuggestionsDisabled", "Disabled");
    };
    let disclosureHeader;
    let chevron;
    let statusEl;
    if (!nonCollapsible) {
      disclosureHeader = this.element.appendChild($("button.collapsible-header"));
      if (!hasContentAbove) {
        disclosureHeader.classList.add("no-border");
      }
      disclosureHeader.setAttribute("aria-expanded", String(!collapsed));
      disclosureHeader.appendChild($("span.collapsible-label", void 0, localize("inlineSuggestionsTab", "Inline Suggestions")));
      chevron = disclosureHeader.appendChild($("span.collapsible-chevron"));
      chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));
      statusEl = disclosureHeader.appendChild($("span.collapsible-status", void 0, getStatusText()));
    }
    const collapsibleContent = this.element.appendChild($("div.collapsible-content"));
    const collapsibleInner = collapsibleContent.appendChild($("div.collapsible-inner"));
    if (collapsed) {
      collapsibleContent.classList.add("collapsed");
      collapsibleInner.inert = true;
    }
    if (disclosureHeader && chevron) {
      const toggle = () => {
        const isCollapsed = collapsibleContent.classList.toggle("collapsed");
        collapsibleInner.inert = isCollapsed;
        disclosureHeader.setAttribute("aria-expanded", String(!isCollapsed));
        chevron.className = "collapsible-chevron";
        chevron.classList.add(...ThemeIcon.asClassNameArray(isCollapsed ? Codicon.chevronRight : Codicon.chevronDown));
        this.storageService.store(ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY, isCollapsed, StorageScope.PROFILE, StorageTarget.USER);
      };
      this._store.add(addDisposableListener(disclosureHeader, EventType.CLICK, () => toggle()));
    }
    if (statusEl) {
      this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
          statusEl.textContent = getStatusText();
        }
      }));
    }
    this.renderInlineSuggestionsContent(collapsibleInner);
  }
  renderContributedSections(contributedEntries) {
    for (const item of contributedEntries) {
      const headerLabel = typeof item.label === "string" ? item.label : item.label.label;
      let headerLink = typeof item.label === "string" ? void 0 : item.label.link;
      let linkDescription = typeof item.label === "string" ? void 0 : item.label.helpText;
      const section = this.element.appendChild($("div.contributed-section"));
      const header = section.appendChild($("div.collapsible-header.non-collapsible"));
      header.appendChild($("span.collapsible-label", void 0, headerLabel));
      if (linkDescription || headerLink) {
        const infoIcon = header.appendChild($("span.contributed-info-icon"));
        infoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
        this._store.add(this.hoverService.setupDelayedHover(infoIcon, () => {
          const hoverContent = new MarkdownString("", { isTrusted: true });
          if (linkDescription) {
            hoverContent.appendText(linkDescription);
          }
          if (headerLink) {
            if (linkDescription) {
              hoverContent.appendText(" ");
            }
            hoverContent.appendMarkdown(`[${localize("learnMore", "Learn More")}](${headerLink})`);
          }
          return { content: hoverContent };
        }, { reducedDelay: true }));
      }
      const statusEl = header.appendChild($("span.collapsible-status"));
      const statusDisposables = this._store.add(new MutableDisposable());
      const renderStatus = (text) => {
        const newStore = new DisposableStore();
        statusDisposables.value = newStore;
        this.renderTextPlus(statusEl, text, newStore);
      };
      renderStatus(item.description);
      let currentTooltip = item.tooltip;
      if (currentTooltip) {
        this._store.add(this.hoverService.setupDelayedHover(statusEl, () => ({
          content: currentTooltip ?? ""
        }), { reducedDelay: true }));
      }
      const sectionDisposables = this._store.add(new MutableDisposable());
      const sectionStore = new DisposableStore();
      sectionDisposables.value = sectionStore;
      let detailEl;
      if (item.detail) {
        detailEl = section.appendChild($("div.contributed-detail"));
        this.renderTextPlus(detailEl, item.detail, sectionStore);
      }
      this._store.add(this.chatStatusItemService.onDidChange((e) => {
        if (e.entry.id === item.id) {
          statusEl.textContent = "";
          renderStatus(e.entry.description);
          currentTooltip = e.entry.tooltip;
          headerLink = typeof e.entry.label === "string" ? void 0 : e.entry.label.link;
          linkDescription = typeof e.entry.label === "string" ? void 0 : e.entry.label.helpText;
          const newStore = new DisposableStore();
          sectionDisposables.value = newStore;
          if (detailEl) {
            if (e.entry.detail) {
              detailEl.textContent = "";
              this.renderTextPlus(detailEl, e.entry.detail, newStore);
            } else {
              detailEl.remove();
              detailEl = void 0;
            }
          } else if (e.entry.detail) {
            detailEl = section.appendChild($("div.contributed-detail"));
            this.renderTextPlus(detailEl, e.entry.detail, newStore);
          }
        }
      }));
    }
  }
  renderSetupSection() {
    const hasByokModels = this.chatEntitlementService.hasByokModels;
    const newUser = isNewUser(this.chatEntitlementService) && !hasByokModels;
    const anonymousUser = this.chatEntitlementService.anonymous;
    const disabled = this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted;
    const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
    if (!(newUser || signedOut || disabled)) {
      return;
    }
    this.element.appendChild($("hr"));
    let descriptionText;
    let descriptionClass = ".description";
    if (newUser && anonymousUser) {
      descriptionText = new MarkdownString(localize({ key: "activeDescriptionAnonymous", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl), { isTrusted: true });
      descriptionClass = `${descriptionClass}.terms`;
    } else if (newUser) {
      descriptionText = localize("activateDescription", "Set up Copilot to use AI features.");
    } else if (anonymousUser) {
      descriptionText = localize("enableMoreDescription", "Sign in to enable more Copilot AI features.");
    } else if (disabled) {
      descriptionText = localize("enableDescription", "Enable Copilot to use AI features.");
    } else {
      descriptionText = localize("signInDescription", "Sign in to use GitHub Copilot AI features.");
    }
    let buttonLabel;
    if (newUser) {
      buttonLabel = localize("enableAIFeatures", "Use AI Features");
    } else if (anonymousUser) {
      buttonLabel = localize("enableMoreAIFeatures", "Enable more AI Features");
    } else if (disabled) {
      buttonLabel = localize("enableCopilotButton", "Enable AI Features");
    } else {
      buttonLabel = localize("signInToUseAIFeatures", "Sign in to use GitHub Copilot");
    }
    let commandId;
    if (newUser && anonymousUser) {
      commandId = "workbench.action.chat.triggerSetupAnonymousWithoutDialog";
    } else {
      commandId = "workbench.action.chat.triggerSetup";
    }
    if (typeof descriptionText === "string") {
      this.element.appendChild($(`div${descriptionClass}`, void 0, descriptionText));
    } else {
      this.element.appendChild($(`div${descriptionClass}`, void 0, this._store.add(this.markdownRendererService.render(descriptionText)).element));
    }
    const button = this._store.add(new Button(this.element, { ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate }));
    button.label = buttonLabel;
    this._store.add(button.onDidClick(() => this.runCommandAndClose(commandId)));
  }
  renderInlineSuggestionsContent(container) {
    if (!this.options?.disableInlineSuggestionsSettings) {
      this.createSettings(container);
    }
    const providers = !this.options?.disableModelSelection || !this.options?.disableProviderOptions ? this.languageFeaturesService.inlineCompletionsProvider.allNoModel() : void 0;
    if (!this.options?.disableModelSelection && providers) {
      const provider = providers.find((p) => p.modelInfo && p.modelInfo.models.length > 0);
      if (provider) {
        const modelInfo = provider.modelInfo;
        const currentModel = modelInfo.models.find((m) => m.id === modelInfo.currentModelId);
        if (currentModel) {
          const modelContainer = container.appendChild($("div.model-selection"));
          modelContainer.appendChild($("span.model-text", void 0, localize("modelLabel", "Model")));
          const selectOptions = modelInfo.models.map((m) => ({ text: m.name }));
          const selectedIndex = modelInfo.models.findIndex((m) => m.id === modelInfo.currentModelId);
          const selectBox = this._store.add(new SelectBox(selectOptions, Math.max(0, selectedIndex), this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize("selectModel", "Select Model"), optionsAsChildren: true }));
          const selectContainer = modelContainer.appendChild($("div.model-select-container"));
          selectBox.render(selectContainer);
          this._store.add(selectBox.onDidSelect(async (e) => {
            const selectedModel = modelInfo.models[e.index];
            if (selectedModel && selectedModel.id !== modelInfo.currentModelId && provider.setModelId) {
              await provider.setModelId(selectedModel.id);
            }
          }));
        }
      }
    }
    if (!this.options?.disableProviderOptions && providers) {
      for (const provider of providers) {
        if (provider.providerOptions && provider.providerOptions.length > 0) {
          for (const option of provider.providerOptions) {
            const currentValue = option.values.find((v) => v.id === option.currentValueId);
            if (currentValue) {
              const optionContainer = container.appendChild($("div.suggest-option-selection"));
              optionContainer.appendChild($("span.suggest-option-text", void 0, option.label));
              const selectOptions = option.values.map((v) => ({ text: v.label }));
              const selectedIndex = option.values.findIndex((v) => v.id === option.currentValueId);
              const selectBox = this._store.add(new SelectBox(selectOptions, Math.max(0, selectedIndex), this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize("selectOption", "Select {0}", option.label), optionsAsChildren: true }));
              const selectContainer = optionContainer.appendChild($("div.suggest-option-select-container"));
              selectBox.render(selectContainer);
              this._store.add(selectBox.onDidSelect(async (e) => {
                const selectedValue = option.values[e.index];
                if (selectedValue && selectedValue.id !== option.currentValueId && provider.setProviderOption) {
                  await provider.setProviderOption(option.id, selectedValue.id);
                }
              }));
            }
          }
        }
      }
    }
    if (!this.options?.disableCompletionsSnooze && this.canUseChat()) {
      const snooze = append(container, $("div.snooze-completions"));
      this.createCompletionsSnooze(snooze, localize("settings.snooze", "Snooze"));
    }
  }
  canUseChat() {
    if (!this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
      return false;
    }
    if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown || this.chatEntitlementService.entitlement === ChatEntitlement.Available) {
      return this.chatEntitlementService.anonymous;
    }
    if (this.chatEntitlementService.entitlement === ChatEntitlement.Free && this.chatEntitlementService.quotas.chat?.percentRemaining === 0 && this.chatEntitlementService.quotas.completions?.percentRemaining === 0) {
      return false;
    }
    return true;
  }
  renderHeader(container, disposables, label, action) {
    const header = container.appendChild($("div.header"));
    header.appendChild($("span.header-label", void 0, label));
    if (action) {
      const toolbar = disposables.add(new ActionBar(header, { hoverDelegate: nativeHoverDelegate }));
      toolbar.push([action], { icon: true, label: false });
    }
    return header;
  }
  renderTextPlus(target, text, store) {
    for (const node of parseLinkedText(text).nodes) {
      if (typeof node === "string") {
        const parts = renderLabelWithIcons(node);
        target.append(...parts);
      } else {
        store.add(new Link(target, node, void 0, this.hoverService, this.openerService));
      }
    }
  }
  runCommandAndClose(commandOrFn, ...args) {
    if (typeof commandOrFn === "function") {
      commandOrFn(...args);
    } else {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: commandOrFn, from: "chat-status" });
      this.commandService.executeCommand(commandOrFn, ...args);
    }
    this.hoverService.hideHover(true);
  }
  formatResetAtLabel(resetAt) {
    if (!resetAt) {
      return void 0;
    }
    const resetDate = new Date(resetAt * 1e3);
    return localize("quotaResetsAt", "Resets {0} at {1}", this.dateFormatter.value.format(resetDate), this.timeFormatter.value.format(resetDate));
  }
  formatGlobalResetLabel() {
    const { resetDate, resetDateHasTime } = this.chatEntitlementService.quotas;
    if (!resetDate) {
      return void 0;
    }
    return resetDateHasTime ? localize("quotaResetsAt", "Resets {0} at {1}", this.dateFormatter.value.format(new Date(resetDate)), this.timeFormatter.value.format(new Date(resetDate))) : localize("quotaResets", "Resets {0}", this.dateFormatter.value.format(new Date(resetDate)));
  }
  createCreditsUsedIndicator(container, creditsUsed, resetAt) {
    const isCompact = !!this.options?.compactQuotaLayout;
    const resetLabel = this.formatResetAtLabel(resetAt) ?? this.formatGlobalResetLabel();
    const resetValue = $("span.quota-reset");
    if (resetLabel) {
      resetValue.textContent = resetLabel;
    }
    const quotaPercentage = $(
      "div.quota-percentage",
      void 0,
      $("span.quota-value", void 0, this.quotaCreditsFormatter.value.format(creditsUsed)),
      $("span.quota-value-suffix", void 0, isCompact ? localize("quotaLabelUsed", "{0} used", localize("creditsLabel", "Credits")) : localize("creditsUsedLabel", "Credits Used"))
    );
    const indicatorElement = $(
      "div.quota-indicator.included.credits-used",
      void 0,
      ...isCompact ? [$("div.quota-title", void 0, getChatPlanName(this.chatEntitlementService.entitlement))] : [],
      $(
        "div.quota-details",
        void 0,
        quotaPercentage,
        resetValue
      )
    );
    if (isCompact) {
      indicatorElement.classList.add("compact");
    }
    container.appendChild(indicatorElement);
  }
  createQuotaIndicator(container, quota, label, resetLabel, compactTitle) {
    const isCompact = !!compactTitle;
    const quotaValue = $("span.quota-value");
    const quotaValueText = isCompact ? quotaValue.appendChild($("span.quota-value-text")) : quotaValue;
    const quotaValueSuffix = $("span.quota-value-suffix");
    const quotaBit = $("div.quota-bit");
    const resetValue = $("span.quota-reset");
    if (resetLabel) {
      resetValue.textContent = resetLabel;
    }
    const quotaPercentage = $(
      "div.quota-percentage",
      void 0,
      quotaValue,
      quotaValueSuffix
    );
    quotaPercentage.tabIndex = isCompact ? -1 : 0;
    const indicatorElement = $(
      "div.quota-indicator",
      void 0,
      $(
        "div.quota-title",
        void 0,
        $("span", void 0, isCompact ? compactTitle : label),
        ...isCompact ? [] : [resetValue]
      ),
      $(
        "div.quota-details",
        void 0,
        quotaPercentage,
        ...isCompact ? [resetValue] : []
      ),
      ...isCompact ? [] : [$("div.quota-bar", void 0, quotaBit)]
    );
    if (isCompact) {
      indicatorElement.classList.add("compact");
    }
    container.appendChild(indicatorElement);
    let currentQuota = quota;
    let isHovered = false;
    const showPercentage = () => {
      if (typeof currentQuota === "string") {
        quotaValueText.textContent = currentQuota;
        quotaValueSuffix.textContent = "";
      } else {
        const usedPercentage = Math.max(0, 100 - currentQuota.percentRemaining);
        quotaValueText.textContent = localize("quotaDisplay", "{0}%", this.quotaPercentageFormatter.value.format(Math.floor(usedPercentage)));
        quotaValueSuffix.textContent = isCompact ? localize("quotaLabelUsed", "{0} used", label) : ` ${localize("quotaUsed", "used")}`;
      }
    };
    const showCredits = () => {
      if (typeof currentQuota !== "string" && currentQuota.entitlement) {
        const total = currentQuota.entitlement;
        const used = currentQuota.quotaRemaining !== void 0 ? total - currentQuota.quotaRemaining : total * (100 - currentQuota.percentRemaining) / 100;
        const usedFormatted = this.quotaCreditsFormatter.value.format(used);
        const totalFormatted = this.quotaCreditsFormatter.value.format(total);
        quotaValueText.textContent = localize("quotaCreditsDisplay", "{0} / {1}", usedFormatted, totalFormatted);
        quotaValueSuffix.textContent = isCompact ? localize("quotaLabelUsed", "{0} used", label) : ` ${localize("quotaUsed", "used")}`;
      }
    };
    const hoverTarget = isCompact ? quotaValueText : quotaPercentage;
    this._store.add(addDisposableListener(hoverTarget, EventType.MOUSE_ENTER, () => {
      isHovered = true;
      showCredits();
    }));
    this._store.add(addDisposableListener(hoverTarget, EventType.MOUSE_LEAVE, () => {
      isHovered = false;
      showPercentage();
    }));
    this._store.add(addDisposableListener(hoverTarget, EventType.FOCUS, () => {
      isHovered = true;
      showCredits();
    }));
    this._store.add(addDisposableListener(hoverTarget, EventType.BLUR, () => {
      isHovered = false;
      showPercentage();
    }));
    const update = (quota2) => {
      currentQuota = quota2;
      let usedPercentage;
      if (typeof quota2 === "string") {
        usedPercentage = 0;
      } else {
        usedPercentage = Math.max(0, 100 - quota2.percentRemaining);
      }
      if (isHovered) {
        showCredits();
      } else {
        showPercentage();
      }
      quotaBit.style.width = `${usedPercentage}%`;
    };
    update(quota);
    return update;
  }
  createGlobalQuotaCallout(container) {
    const calloutIcon = $("span.callout-icon");
    const calloutText = $("span.callout-text");
    const quotaCallout = container.appendChild($("div.quota-callout", void 0, calloutIcon, calloutText));
    quotaCallout.style.display = "none";
    const update = () => {
      const quotas = this.chatEntitlementService.quotas;
      const additionalUsageEnabled = quotas.additionalUsageEnabled ?? false;
      const isEnterpriseUser = this.chatEntitlementService.entitlement === ChatEntitlement.Enterprise || this.chatEntitlementService.entitlement === ChatEntitlement.Business;
      const isUsageBasedBilling = quotas.usageBasedBilling === true;
      const allQuotas = [];
      if (quotas.chat && !quotas.chat.unlimited) {
        allQuotas.push(quotas.chat);
      }
      if (quotas.premiumChat && !quotas.premiumChat.unlimited) {
        allQuotas.push(quotas.premiumChat);
      }
      const maxUsedPercentage = allQuotas.length > 0 ? Math.max(...allQuotas.map((q) => Math.max(0, 100 - q.percentRemaining))) : 0;
      const isPooledQuotaExhausted = quotas.premiumChat?.unlimited && quotas.premiumChat.hasQuota === false;
      if (isEnterpriseUser && isPooledQuotaExhausted) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = localize("quotaBudgetExceededEnterprise", "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage.");
      } else if (maxUsedPercentage >= 100 && additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaAdditionalUsageActiveEnterprise", "Copilot has paused because your limits are reached. Please contact your admin to increase your limits.") : isUsageBasedBilling ? localize("quotaAdditionalUsageActive", "Additional budget is configured. Usage will continue until limits reset.") : localize("quotaBudgetActive", "Premium request budget is configured. Usage will continue until limits reset.");
      } else if (maxUsedPercentage >= 75 && maxUsedPercentage < 100 && additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaAdditionalUsageApproachingEnterprise", "Copilot will pause when your limits are reached. Please contact your admin to increase your limits.") : isUsageBasedBilling ? localize("quotaAdditionalUsageApproaching", "Once the limit is reached, additional budget will be used.") : localize("quotaBudgetApproaching", "Once the limit is reached, premium request budget will be used.");
      } else if ((maxUsedPercentage >= 100 || isPooledQuotaExhausted) && !additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaPausedEnterprise", "Copilot is paused until the limit resets. Contact your administrator for more information.") : localize("quotaPaused", "Copilot is paused until the limit resets.");
      } else if (maxUsedPercentage >= 75 && !additionalUsageEnabled) {
        quotaCallout.style.display = "";
        quotaCallout.className = "quota-callout info";
        calloutIcon.className = `callout-icon ${ThemeIcon.asClassName(Codicon.info)}`;
        calloutText.textContent = isEnterpriseUser ? localize("quotaWarningEnterprise", "Copilot will pause when the limit is reached. Contact your administrator for more information.") : localize("quotaWarning", "Copilot will pause when the limit is reached.");
      } else {
        quotaCallout.style.display = "none";
      }
      return { calloutVisible: quotaCallout.style.display !== "none", additionalUsageEnabled };
    };
    update();
    return update;
  }
  createSettings(container) {
    const modeId = this.editorService.activeTextEditorLanguageId;
    const settings = container.appendChild($("div.settings"));
    {
      const globalSetting = append(settings, $("div.setting"));
      this.createInlineSuggestionsSetting(globalSetting, localize("settings.codeCompletions.allFiles", "Ghost text suggestions"), "*");
      const overriddenHint = globalSetting.appendChild($("span.setting-overridden"));
      const updateOverriddenHint = () => {
        const obj = this.configurationService.getValue(defaultChat.completionsEnablementSetting);
        const configuredValue = modeId ? this.findConfiguredCompletionsValue(modeId) : void 0;
        const hasOverride = modeId && configuredValue && isObject(obj) && Boolean(configuredValue.value[modeId]) !== Boolean(obj["*"]);
        overriddenHint.textContent = hasOverride ? localize("settings.overridden", "(overridden)") : "";
      };
      updateOverriddenHint();
      if (modeId) {
        const languageSetting = append(settings, $("div.setting"));
        const languageName = this.languageService.getLanguageName(modeId) ?? modeId;
        this.createTriStateLanguageSetting(languageSetting, localize("settings.codeCompletions.language", "Ghost text suggestions for {0}", languageName), modeId, updateOverriddenHint);
      }
    }
    {
      const setting = append(settings, $("div.setting"));
      this.createNextEditSuggestionsSetting(setting, localize("settings.nextEditSuggestions", "Next edit suggestions"), this.getCompletionsSettingAccessor(modeId));
    }
  }
  createSetting(container, settingIdsToReEvaluate, label, accessor) {
    const checkbox = this._store.add(new Checkbox(label, Boolean(accessor.readSetting()), { ...defaultCheckboxStyles }));
    container.appendChild(checkbox.domNode);
    const settingLabel = append(container, $("span.setting-label", void 0, label));
    this._store.add(Gesture.addTarget(settingLabel));
    [EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._store.add(addDisposableListener(settingLabel, eventType, (e) => {
        if (checkbox?.enabled) {
          EventHelper.stop(e, true);
          checkbox.checked = !checkbox.checked;
          accessor.writeSetting(checkbox.checked);
          checkbox.focus();
        }
      }));
    });
    this._store.add(checkbox.onChange(() => {
      accessor.writeSetting(checkbox.checked);
    }));
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (settingIdsToReEvaluate.some((id) => e.affectsConfiguration(id))) {
        checkbox.checked = Boolean(accessor.readSetting());
      }
    }));
    if (!this.canUseChat()) {
      container.classList.add("disabled");
      checkbox.disable();
      checkbox.checked = false;
    }
    return checkbox;
  }
  createInlineSuggestionsSetting(container, label, modeId) {
    this.createSetting(container, [defaultChat.completionsEnablementSetting], label, this.getCompletionsSettingAccessor(modeId));
  }
  createTriStateLanguageSetting(container, label, modeId, onStateChange) {
    const settingId = defaultChat.completionsEnablementSetting;
    const getState = () => {
      const configuredValue = this.findConfiguredCompletionsValue(modeId);
      return configuredValue ? Boolean(configuredValue.value[modeId]) : "mixed";
    };
    let requestedState = getState();
    let pendingWrites = 0;
    const checkbox = this._store.add(new TriStateCheckbox(label, requestedState, { ...defaultCheckboxStyles }));
    container.appendChild(checkbox.domNode);
    const settingLabel = append(container, $("span.setting-label", void 0, label));
    this._store.add(Gesture.addTarget(settingLabel));
    const writeSequencer = new Sequencer();
    const renderState = (state) => {
      requestedState = state;
      checkbox.checked = state;
      checkbox.domNode.setAttribute("aria-checked", state === "mixed" ? "mixed" : String(state));
    };
    const getNextState = () => requestedState === true ? false : requestedState === false ? "mixed" : true;
    const writeState = async (state) => {
      const configuredValue = this.findConfiguredCompletionsValue(modeId) ?? this.findConfiguredCompletionsValue();
      if (state === "mixed") {
        for (const configuredValue2 of this.findConfiguredCompletionsValues(modeId)) {
          const { [modeId]: _, ...rest } = configuredValue2.value;
          await this.configurationService.updateValue(settingId, rest, configuredValue2.target);
        }
      } else {
        const value = { ...configuredValue?.value, [modeId]: state };
        if (configuredValue) {
          await this.configurationService.updateValue(settingId, value, configuredValue.target);
        } else {
          await this.configurationService.updateValue(settingId, value);
        }
      }
      const enabled = isCompletionsEnabled(this.configurationService, modeId);
      this.telemetryService.publicLog2("chatStatus.settingChanged", {
        settingIdentifier: settingId,
        settingMode: modeId,
        settingEnablement: enabled ? "enabled" : "disabled"
      });
    };
    const requestStateChange = () => {
      const state = getNextState();
      renderState(state);
      pendingWrites++;
      void writeSequencer.queue(async () => {
        try {
          await writeState(state);
        } finally {
          pendingWrites--;
        }
      }).catch((error) => {
        if (pendingWrites === 0) {
          renderState(getState());
          onStateChange();
        }
        this.notificationService.error(error);
      });
    };
    renderState(requestedState);
    [EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._store.add(addDisposableListener(settingLabel, eventType, (e) => {
        if (checkbox?.enabled) {
          EventHelper.stop(e, true);
          requestStateChange();
          checkbox.focus();
        }
      }));
    });
    this._store.add(checkbox.onChange(() => {
      renderState(requestedState);
      requestStateChange();
    }));
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(settingId)) {
        const state = getState();
        if (pendingWrites === 0 || state === requestedState) {
          renderState(state);
          onStateChange();
        }
      }
    }));
    if (!this.canUseChat()) {
      container.classList.add("disabled");
      checkbox.disable();
      checkbox.checked = false;
    }
  }
  findConfiguredCompletionsValue(modeId) {
    return this.findConfiguredCompletionsValues(modeId)[0];
  }
  findConfiguredCompletionsValues(modeId) {
    const inspected = this.configurationService.inspect(defaultChat.completionsEnablementSetting);
    const result = [];
    for (const target of completionsConfigurationTargets) {
      const value = getConfigValueInTarget(inspected, target);
      if (isObject(value) && (!modeId || Object.prototype.hasOwnProperty.call(value, modeId))) {
        result.push({ target, value });
      }
    }
    return result;
  }
  getCompletionsSettingAccessor(modeId = "*") {
    const settingId = defaultChat.completionsEnablementSetting;
    return {
      readSetting: () => isCompletionsEnabled(this.configurationService, modeId),
      writeSetting: (value) => {
        this.telemetryService.publicLog2("chatStatus.settingChanged", {
          settingIdentifier: settingId,
          settingMode: modeId,
          settingEnablement: value ? "enabled" : "disabled"
        });
        let result = this.configurationService.getValue(settingId);
        if (!isObject(result)) {
          result = /* @__PURE__ */ Object.create(null);
        }
        return this.configurationService.updateValue(settingId, { ...result, [modeId]: value });
      }
    };
  }
  createNextEditSuggestionsSetting(container, label, completionsSettingAccessor) {
    const nesSettingId = defaultChat.nextEditSuggestionsSetting;
    const completionsSettingId = defaultChat.completionsEnablementSetting;
    const resource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const checkbox = this.createSetting(container, [nesSettingId, completionsSettingId], label, {
      readSetting: () => completionsSettingAccessor.readSetting() && this.textResourceConfigurationService.getValue(resource, nesSettingId),
      writeSetting: (value) => {
        this.telemetryService.publicLog2("chatStatus.settingChanged", {
          settingIdentifier: nesSettingId,
          settingEnablement: value ? "enabled" : "disabled"
        });
        return this.textResourceConfigurationService.updateValue(resource, nesSettingId, value);
      }
    });
    if (!completionsSettingAccessor.readSetting()) {
      container.classList.add("disabled");
      checkbox.disable();
    }
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(completionsSettingId)) {
        if (completionsSettingAccessor.readSetting() && this.canUseChat()) {
          checkbox.enable();
          container.classList.remove("disabled");
        } else {
          checkbox.disable();
          container.classList.add("disabled");
        }
      }
    }));
  }
  createCompletionsSnooze(container, label) {
    const isEnabled = () => {
      const completionsEnabled = isCompletionsEnabled(this.configurationService);
      const completionsEnabledActiveLanguage = isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId);
      return completionsEnabled || completionsEnabledActiveLanguage;
    };
    const button = this._store.add(new Button(container, { disabled: !isEnabled(), ...defaultButtonStyles, hoverDelegate: nativeHoverDelegate, secondary: true }));
    const timerDisplay = container.appendChild($("span.snooze-label"));
    const actionBar = container.appendChild($("div.snooze-action-bar"));
    const toolbar = this._store.add(new ActionBar(actionBar, { hoverDelegate: nativeHoverDelegate }));
    const cancelAction = toAction({
      id: "workbench.action.cancelSnoozeStatusBarLink",
      label: localize("cancelSnooze", "Cancel Snooze"),
      run: () => this.inlineCompletionsService.cancelSnooze(),
      class: ThemeIcon.asClassName(Codicon.stopCircle)
    });
    const update = (isEnabled2) => {
      container.classList.toggle("disabled", !isEnabled2);
      toolbar.clear();
      const timeLeftMs = this.inlineCompletionsService.snoozeTimeLeft;
      if (!isEnabled2 || timeLeftMs <= 0) {
        timerDisplay.textContent = localize("completions.snooze5minutesTitle", "Hide suggestions for 5 min");
        timerDisplay.title = "";
        button.label = label;
        button.setTitle(localize("completions.snooze5minutes", "Hide inline suggestions for 5 min"));
        return true;
      }
      const timeLeftSeconds = Math.ceil(timeLeftMs / 1e3);
      const minutes = Math.floor(timeLeftSeconds / 60);
      const seconds = timeLeftSeconds % 60;
      timerDisplay.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds} ${localize("completions.remainingTime", "remaining")}`;
      timerDisplay.title = localize("completions.snoozeTimeDescription", "Inline suggestions are hidden for the remaining duration");
      button.label = localize("completions.plus5min", "+5 min");
      button.setTitle(localize("completions.snoozeAdditional5minutes", "Snooze additional 5 min"));
      toolbar.push([cancelAction], { icon: true, label: false });
      return false;
    };
    const timerDisposables = this._store.add(new DisposableStore());
    function updateIntervalTimer() {
      timerDisposables.clear();
      const enabled = isEnabled();
      if (update(enabled)) {
        return;
      }
      timerDisposables.add(disposableWindowInterval(
        getWindow(container),
        () => update(enabled),
        1e3
      ));
    }
    updateIntervalTimer();
    this._store.add(button.onDidClick(() => {
      this.inlineCompletionsService.snooze();
      update(isEnabled());
    }));
    this._store.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(defaultChat.completionsEnablementSetting)) {
        button.enabled = isEnabled();
      }
      updateIntervalTimer();
    }));
    this._store.add(this.inlineCompletionsService.onDidChangeIsSnoozing(() => {
      updateIntervalTimer();
    }));
  }
};
ChatStatusDashboard.QUICK_SETTINGS_COLLAPSED_KEY = "chatStatusDashboard.quickSettingsCollapsed";
ChatStatusDashboard = __decorateClass([
  __decorateParam(1, IChatEntitlementService),
  __decorateParam(2, IChatStatusItemService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ITextResourceConfigurationService),
  __decorateParam(11, IInlineCompletionsService),
  __decorateParam(12, IMarkdownRendererService),
  __decorateParam(13, ILanguageFeaturesService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, IStorageService),
  __decorateParam(16, IDefaultAccountService),
  __decorateParam(17, INotificationService)
], ChatStatusDashboard);
export {
  ChatStatusDashboard
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3RhdHVzL2NoYXRTdGF0dXNEYXNoYm9hcmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhcHBlbmQsIEV2ZW50VHlwZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudEhlbHBlciwgZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3RCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCwgVHJpU3RhdGVDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgY2FuY2VsT25EaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUlubGluZUNvbXBsZXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2lubGluZUNvbXBsZXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIGdldENvbmZpZ1ZhbHVlSW5UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBEb21XaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kb21XaWRnZXQvYnJvd3Nlci9kb21XaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIENoYXRFbnRpdGxlbWVudCwgSVF1b3RhU25hcHNob3QsIGdldENoYXRQbGFuTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgaXNOZXdVc2VyIH0gZnJvbSAnLi9jaGF0U3RhdHVzLmpzJztcbmltcG9ydCB7IElDaGF0U3RhdHVzSXRlbVNlcnZpY2UsIENoYXRTdGF0dXNFbnRyeSB9IGZyb20gJy4vY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YlBhdGhzLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgaXNDb21wbGV0aW9uc0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2NvbXBsZXRpb25zRW5hYmxlbWVudC5qcyc7XG5cbmNvbnN0IGRlZmF1bHRDaGF0ID0gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50O1xuY29uc3QgY29tcGxldGlvbnNDb25maWd1cmF0aW9uVGFyZ2V0cyA9IFtcblx0Q29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSLFxuXHRDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSxcblx0Q29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSxcblx0Q29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLFxuXHRDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OLFxuXSBhcyBjb25zdDtcblxuaW50ZXJmYWNlIElTZXR0aW5nc0FjY2Vzc29yIHtcblx0cmVhZFNldHRpbmc6ICgpID0+IGJvb2xlYW47XG5cdHdyaXRlU2V0dGluZzogKHZhbHVlOiBib29sZWFuKSA9PiBQcm9taXNlPHZvaWQ+O1xufVxudHlwZSBDaGF0U2V0dGluZ0NoYW5nZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdicGFzZXJvJztcblx0Y29tbWVudDogJ1Byb3ZpZGVzIGluc2lnaHQgaW50byBjaGF0IHNldHRpbmdzIGNoYW5nZWQgZnJvbSB0aGUgY2hhdCBzdGF0dXMgZW50cnkuJztcblx0c2V0dGluZ0lkZW50aWZpZXI6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgc2V0dGluZyB0aGF0IGNoYW5nZWQuJyB9O1xuXHRzZXR0aW5nTW9kZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgb3B0aW9uYWwgZWRpdG9yIGxhbmd1YWdlIGZvciB3aGljaCB0aGUgc2V0dGluZyBjaGFuZ2VkLicgfTtcblx0c2V0dGluZ0VuYWJsZW1lbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBzZXR0aW5nIGdvdCBlbmFibGVkIG9yIGRpc2FibGVkLicgfTtcbn07XG50eXBlIENoYXRTZXR0aW5nQ2hhbmdlZEV2ZW50ID0ge1xuXHRzZXR0aW5nSWRlbnRpZmllcjogc3RyaW5nO1xuXHRzZXR0aW5nTW9kZT86IHN0cmluZztcblx0c2V0dGluZ0VuYWJsZW1lbnQ6ICdlbmFibGVkJyB8ICdkaXNhYmxlZCc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U3RhdHVzRGFzaGJvYXJkT3B0aW9ucyB7XG5cdC8qKiBXaGVuIHRydWUsIGRpc2FibGVzIHRoZSBJbmxpbmUgU3VnZ2VzdGlvbnMgc2V0dGluZ3Mgc2VjdGlvbiAodG9nZ2xlcyBmb3IgYWxsIGZpbGVzLCBsYW5ndWFnZSwgbmV4dCBlZGl0KS4gKi9cblx0ZGlzYWJsZUlubGluZVN1Z2dlc3Rpb25zU2V0dGluZ3M/OiBib29sZWFuO1xuXHQvKiogV2hlbiB0cnVlLCBkaXNhYmxlcyB0aGUgaW5saW5lIGNvbXBsZXRpb25zIG1vZGVsIHNlbGVjdGlvbiBzZWN0aW9uLiAqL1xuXHRkaXNhYmxlTW9kZWxTZWxlY3Rpb24/OiBib29sZWFuO1xuXHQvKiogV2hlbiB0cnVlLCBkaXNhYmxlcyB0aGUgaW5saW5lIGNvbXBsZXRpb25zIHByb3ZpZGVyIG9wdGlvbnMgc2VjdGlvbi4gKi9cblx0ZGlzYWJsZVByb3ZpZGVyT3B0aW9ucz86IGJvb2xlYW47XG5cdC8qKiBXaGVuIHRydWUsIGRpc2FibGVzIHRoZSBjb21wbGV0aW9ucyBzbm9vemUgYnV0dG9uLiAqL1xuXHRkaXNhYmxlQ29tcGxldGlvbnNTbm9vemU/OiBib29sZWFuO1xuXHQvKiogV2hlbiB0cnVlLCB0aGUgUXVpY2sgU2V0dGluZ3MgcmVnaW9uIGlzIHJlbmRlcmVkIGFsd2F5cy1leHBhbmRlZCB3aXRob3V0IGEgY29sbGFwc2libGUgaGVhZGVyLiAqL1xuXHRkaXNhYmxlUXVpY2tTZXR0aW5nc0NvbGxhcHNpYmxlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hlbiBwcm92aWRlZCwgdGhlIHRpdGxlIGhlYWRlciAocGxhbiBuYW1lICsgbWFuYWdlIC8gQ1RBIGFjdGlvbnMpIGlzXG5cdCAqIHJlbmRlcmVkIGludG8gdGhpcyBjYWxsZXItb3duZWQgY29udGFpbmVyIGluc3RlYWQgb2YgaW5saW5lIGF0IHRoZSB0b3Bcblx0ICogb2YgdGhlIGRhc2hib2FyZC4gVXNlIHRoaXMgdG8gZW1iZWQgdGhlIHRpdGxlIGhlYWRlciBpbiBhIGhvc3QgbGF5b3V0XG5cdCAqIHdpdGhvdXQgcmVhY2hpbmcgaW50byB0aGUgZGFzaGJvYXJkJ3MgcHJpdmF0ZSBET00uXG5cdCAqL1xuXHR0aXRsZUhlYWRlckNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHQvKipcblx0ICogV2hlbiB0cnVlLCB1c2VzIGEgY29tcGFjdCAyeDIgZ3JpZCBsYXlvdXQgZm9yIHF1b3RhIGluZGljYXRvcnM6XG5cdCAqIHBsYW4gbmFtZSArIHBlcmNlbnRhZ2Ugb24gdGhlIHRvcCByb3csIHJlc2V0IGRhdGUgKyBsYWJlbCBvbiB0aGUgYm90dG9tLlxuXHQgKiBUaGUgc2VwYXJhdGUgaGVhZGVyIChwbGFuIG5hbWUgKyBtYW5hZ2UgYWN0aW9uKSBpcyBub3QgcmVuZGVyZWQuXG5cdCAqL1xuXHRjb21wYWN0UXVvdGFMYXlvdXQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogV2hlbiBwcm92aWRlZCwgQ1RBIGJ1dHRvbnMgKE1hbmFnZSBCdWRnZXQsIFVwZ3JhZGUpIGFyZSByZW5kZXJlZCBpbnRvXG5cdCAqIHRoaXMgY2FsbGVyLW93bmVkIGNvbnRhaW5lciBpbnN0ZWFkIG9mIHRoZSBkYXNoYm9hcmQgaGVhZGVyLiBVc2UgdGhpc1xuXHQgKiBpbiBjb21wYWN0IG1vZGUgdG8gcGxhY2UgYWN0aW9uIGJ1dHRvbnMgaW4gdGhlIGhvc3QgaGVhZGVyLlxuXHQgKi9cblx0Y3RhQnV0dG9uc0NvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFN0YXR1c0Rhc2hib2FyZCBleHRlbmRzIERvbVdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUVVJQ0tfU0VUVElOR1NfQ09MTEFQU0VEX0tFWSA9ICdjaGF0U3RhdHVzRGFzaGJvYXJkLnF1aWNrU2V0dGluZ3NDb2xsYXBzZWQnO1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQgPSAkKCdkaXYuY2hhdC1zdGF0dXMtYmFyLWVudHJ5LXRvb2x0aXAnKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRhdGVGb3JtYXR0ZXIgPSBzYWZlSW50bC5EYXRlVGltZUZvcm1hdChsYW5ndWFnZSwgeyBtb250aDogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGltZUZvcm1hdHRlciA9IHNhZmVJbnRsLkRhdGVUaW1lRm9ybWF0KGxhbmd1YWdlLCB7IGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnbnVtZXJpYycgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVvdGFQZXJjZW50YWdlRm9ybWF0dGVyID0gc2FmZUludGwuTnVtYmVyRm9ybWF0KHVuZGVmaW5lZCwgeyBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDAsIG1pbmltdW1GcmFjdGlvbkRpZ2l0czogMCB9KTtcblx0cHJpdmF0ZSByZWFkb25seSBxdW90YUNyZWRpdHNGb3JtYXR0ZXIgPSBzYWZlSW50bC5OdW1iZXJGb3JtYXQobGFuZ3VhZ2UsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiAyLCBtaW5pbXVtRnJhY3Rpb25EaWdpdHM6IDAgfSk7XG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElDaGF0U3RhdHVzRGFzaGJvYXJkT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFN0YXR1c0l0ZW1TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlOiBJQ2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlOiBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRva2VuID0gY2FuY2VsT25EaXNwb3NlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IHsgY2hhdCwgcHJlbWl1bUNoYXQsIGNvbXBsZXRpb25zIH0gPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzO1xuXHRcdGNvbnN0IGhhc1F1b3RhcyA9ICEhKGNoYXQgfHwgcHJlbWl1bUNoYXQpO1xuXHRcdGNvbnN0IGlzQW5vbnltb3VzV2l0aFNlbnRpbWVudCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMgJiYgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5jb21wbGV0ZWQ7XG5cdFx0Y29uc3QgaXNQb29sZWRRdW90YURlcGxldGVkID0gcHJlbWl1bUNoYXQ/LnVubGltaXRlZCAmJiBwcmVtaXVtQ2hhdC5oYXNRdW90YSA9PT0gZmFsc2U7XG5cdFx0Y29uc3QgaGFzVXNhZ2VTZWN0aW9uID0gaGFzUXVvdGFzIHx8IGlzQW5vbnltb3VzV2l0aFNlbnRpbWVudDtcblx0XHRjb25zdCBoYXNWaXNpYmxlVXNhZ2VDb250ZW50ID0gY2hhdD8udW5saW1pdGVkID09PSBmYWxzZSB8fFxuXHRcdFx0cHJlbWl1bUNoYXQ/LnVubGltaXRlZCA9PT0gZmFsc2UgfHxcblx0XHRcdCghdGhpcy5vcHRpb25zPy5jb21wYWN0UXVvdGFMYXlvdXQgJiYgY29tcGxldGlvbnM/LnVubGltaXRlZCA9PT0gZmFsc2UpIHx8XG5cdFx0XHRpc0Fub255bW91c1dpdGhTZW50aW1lbnQgfHxcblx0XHRcdGlzUG9vbGVkUXVvdGFEZXBsZXRlZDtcblx0XHRjb25zdCBjb250cmlidXRlZEVudHJpZXMgPSBbLi4udGhpcy5jaGF0U3RhdHVzSXRlbVNlcnZpY2UuZ2V0RW50cmllcygpXTtcblx0XHRjb25zdCBoYXNRdWlja1NldHRpbmdzQ29udGVudCA9XG5cdFx0XHQhdGhpcy5vcHRpb25zPy5kaXNhYmxlSW5saW5lU3VnZ2VzdGlvbnNTZXR0aW5ncyB8fFxuXHRcdFx0IXRoaXMub3B0aW9ucz8uZGlzYWJsZU1vZGVsU2VsZWN0aW9uIHx8XG5cdFx0XHQhdGhpcy5vcHRpb25zPy5kaXNhYmxlUHJvdmlkZXJPcHRpb25zIHx8XG5cdFx0XHQhdGhpcy5vcHRpb25zPy5kaXNhYmxlQ29tcGxldGlvbnNTbm9vemU7XG5cblx0XHQvLyBUaXRsZSBoZWFkZXIgd2l0aCBwbGFuIG5hbWUsIENUQSBidXR0b25zLCBhbmQgbWFuYWdlIGFjdGlvblxuXHRcdGxldCBoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgaGVhZGVyVXBncmFkZUJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChoYXNVc2FnZVNlY3Rpb24gJiYgIXRoaXMub3B0aW9ucz8uY29tcGFjdFF1b3RhTGF5b3V0KSB7XG5cdFx0XHRjb25zdCBwbGFuTmFtZSA9IGdldENoYXRQbGFuTmFtZSh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpO1xuXHRcdFx0Y29uc3QgaGVhZGVySG9zdCA9IHRoaXMub3B0aW9ucz8udGl0bGVIZWFkZXJDb250YWluZXIgPz8gdGhpcy5lbGVtZW50O1xuXHRcdFx0Y29uc3QgaGVhZGVyID0gdGhpcy5yZW5kZXJIZWFkZXIoaGVhZGVySG9zdCwgdGhpcy5fc3RvcmUsIHBsYW5OYW1lLCB0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5tYW5hZ2VDb3BpbG90Jyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdxdW90YUxhYmVsJywgXCJNYW5hZ2UgQ29waWxvdCBTZXR0aW5nc1wiKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3F1b3RhVG9vbHRpcCcsIFwiTWFuYWdlIENvcGlsb3QgU2V0dGluZ3NcIiksXG5cdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zZXR0aW5ncyksXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlc29sdmVHaXRIdWJVcmwoR2l0SHViUGF0aHMuY29waWxvdFNldHRpbmdzKSkpKSxcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gQWRkIEFkZGl0aW9uYWwgU3BlbmQgLyBVcGdyYWRlIGJ1dHRvbnMgdG8gdGhlIGhlYWRlclxuXHRcdFx0Y29uc3QgY2FuQ29uZmlndXJlQWRkaXRpb25hbFNwZW5kID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRURVIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlBybyB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50Lk1heDtcblx0XHRcdGNvbnN0IHNob3dVcGdyYWRlID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5jYW5VcGdyYWRlUGxhbiA/PyBmYWxzZTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uQmFyRWxlbWVudCA9IGhlYWRlci5sYXN0RWxlbWVudENoaWxkO1xuXG5cdFx0XHRpZiAoY2FuQ29uZmlndXJlQWRkaXRpb25hbFNwZW5kKSB7XG5cdFx0XHRcdGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbiA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdFx0XHRoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoZWFkZXItY3RhLWJ1dHRvbicpO1xuXHRcdFx0XHRoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbWFuYWdlQnVkZ2V0JywgXCJNYW5hZ2UgQnVkZ2V0XCIpO1xuXHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQoaGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlQWRkaXRpb25hbFNwZW5kJywgZnJvbTogJ2NoYXQtc3RhdHVzJyB9KTtcblx0XHRcdFx0XHR0aGlzLnJ1bkNvbW1hbmRBbmRDbG9zZSgoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5iaWxsaW5nQnVkZ2V0cykpKSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0aWYgKGFjdGlvbkJhckVsZW1lbnQpIHtcblx0XHRcdFx0XHRoZWFkZXIuaW5zZXJ0QmVmb3JlKGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbi5lbGVtZW50LCBhY3Rpb25CYXJFbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2hvd1VwZ3JhZGUpIHtcblx0XHRcdFx0aGVhZGVyVXBncmFkZUJ1dHRvbiA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlIH0pKTtcblx0XHRcdFx0aGVhZGVyVXBncmFkZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2hlYWRlci1jdGEtYnV0dG9uJyk7XG5cdFx0XHRcdGhlYWRlclVwZ3JhZGVCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgndXBncmFkZScsIFwiVXBncmFkZVwiKTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKGhlYWRlclVwZ3JhZGVCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnJ1bkNvbW1hbmRBbmRDbG9zZSgnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuJykpKTtcblx0XHRcdFx0aWYgKGFjdGlvbkJhckVsZW1lbnQpIHtcblx0XHRcdFx0XHRoZWFkZXIuaW5zZXJ0QmVmb3JlKGhlYWRlclVwZ3JhZGVCdXR0b24uZWxlbWVudCwgYWN0aW9uQmFyRWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDVEEgYnV0dG9ucyBmb3IgY29tcGFjdCBtb2RlIFx1MjAxNCByZW5kZXJlZCBpbnRvIGEgY2FsbGVyLXByb3ZpZGVkIGNvbnRhaW5lclxuXHRcdGlmIChoYXNVc2FnZVNlY3Rpb24gJiYgdGhpcy5vcHRpb25zPy5jb21wYWN0UXVvdGFMYXlvdXQgJiYgdGhpcy5vcHRpb25zLmN0YUJ1dHRvbnNDb250YWluZXIpIHtcblx0XHRcdGNvbnN0IGN0YUNvbnRhaW5lciA9IHRoaXMub3B0aW9ucy5jdGFCdXR0b25zQ29udGFpbmVyO1xuXHRcdFx0Y29uc3QgY2FuQ29uZmlndXJlQWRkaXRpb25hbFNwZW5kID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRURVIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlBybyB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50Lk1heDtcblx0XHRcdGNvbnN0IHNob3dVcGdyYWRlID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5jYW5VcGdyYWRlUGxhbiA/PyBmYWxzZTtcblxuXHRcdFx0aWYgKGNhbkNvbmZpZ3VyZUFkZGl0aW9uYWxTcGVuZCkge1xuXHRcdFx0XHRoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24gPSB0aGlzLl9zdG9yZS5hZGQobmV3IEJ1dHRvbihjdGFDb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSwgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRcdFx0aGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ21hbmFnZUJ1ZGdldCcsIFwiTWFuYWdlIEJ1ZGdldFwiKTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcsIGZyb206ICdjaGF0LXN0YXR1cycgfSk7XG5cdFx0XHRcdFx0dGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlc29sdmVHaXRIdWJVcmwoR2l0SHViUGF0aHMuYmlsbGluZ0J1ZGdldHMpKSkpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaG93VXBncmFkZSkge1xuXHRcdFx0XHRoZWFkZXJVcGdyYWRlQnV0dG9uID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBCdXR0b24oY3RhQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIGhvdmVyRGVsZWdhdGU6IG5hdGl2ZUhvdmVyRGVsZWdhdGUgfSkpO1xuXHRcdFx0XHRoZWFkZXJVcGdyYWRlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3VwZ3JhZGUnLCBcIlVwZ3JhZGVcIik7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmFkZChoZWFkZXJVcGdyYWRlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC51cGdyYWRlUGxhbicpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcGFjdCBtb2RlIGNsYXNzIGZvciBDU1MgdGFyZ2V0aW5nXG5cdFx0aWYgKHRoaXMub3B0aW9ucz8uY29tcGFjdFF1b3RhTGF5b3V0KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29tcGFjdCcpO1xuXHRcdH1cblxuXHRcdC8vIEFsd2F5cyB0cmlnZ2VyIGEgZnJlc2ggcXVvdGEgZmV0Y2ggd2hlbiB0aGUgZGFzaGJvYXJkIG9wZW5zXG5cdFx0Y29uc3QgdXBkYXRlUHJvbWlzZSA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS51cGRhdGUodG9rZW4pO1xuXG5cdFx0Ly8gVXNhZ2Ugc2VjdGlvbiBcdTIwMTQgYWx3YXlzIHNob3duIGlubGluZVxuXHRcdGlmIChoYXNWaXNpYmxlVXNhZ2VDb250ZW50KSB7XG5cdFx0XHR0aGlzLnJlbmRlclVzYWdlQ29udGVudCh0aGlzLmVsZW1lbnQsIHRva2VuLCBoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24sIGhlYWRlclVwZ3JhZGVCdXR0b24sIHVwZGF0ZVByb21pc2UpO1xuXHRcdH1cblxuXHRcdC8vIFByZW1pdW0gY2hhdCBpbmNsdWRlZCBpbmRpY2F0b3IgKHNob3duIHdoZW4gcHJlbWl1bSBjaGF0IGlzIHVubGltaXRlZClcblx0XHRjb25zdCBoYXNQcmVtaXVtVW5saW1pdGVkID0gISFwcmVtaXVtQ2hhdD8udW5saW1pdGVkO1xuXHRcdGNvbnN0IGNyZWRpdHNVc2VkID0gaGFzUHJlbWl1bVVubGltaXRlZCAmJiAhaXNQb29sZWRRdW90YURlcGxldGVkID8gcHJlbWl1bUNoYXQ/LmNyZWRpdHNVc2VkIDogdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgY3JlZGl0c1VzZWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZUNyZWRpdHNVc2VkSW5kaWNhdG9yKHRoaXMuZWxlbWVudCwgY3JlZGl0c1VzZWQsIHByZW1pdW1DaGF0Py5yZXNldEF0KTtcblx0XHR9IGVsc2UgaWYgKGhhc1ByZW1pdW1VbmxpbWl0ZWQpIHtcblx0XHRcdGNvbnN0IGluY2x1ZGVkVGl0bGUgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2luY2x1ZGVkVGl0bGVUQkInLCBcIkNyZWRpdHNcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnaW5jbHVkZWRUaXRsZScsIFwiUHJlbWl1bSBSZXF1ZXN0c1wiKTtcblx0XHRcdGNvbnN0IGdldEluY2x1ZGVkRGVzY3JpcHRpb24gPSAoKSA9PiB7XG5cdFx0XHRcdGlmIChpc1Bvb2xlZFF1b3RhRGVwbGV0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29tcGFjdDogbG9jYWxpemUoJ3ByZW1pdW1MaW1pdFJlYWNoZWRDb21wYWN0JywgXCJ7MH0gbGltaXQgcmVhY2hlZC5cIiwgaW5jbHVkZWRUaXRsZSksXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBsb2NhbGl6ZSgncHJlbWl1bUxpbWl0UmVhY2hlZCcsIFwiT3JnYW5pemF0aW9uIGxpbWl0IHJlYWNoZWQuXCIpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29tcGFjdDogbG9jYWxpemUoJ3ByZW1pdW1JbmNsdWRlZENvbXBhY3QnLCBcInswfSBpbmNsdWRlZCB3aXRoIHlvdXIgb3JnYW5pemF0aW9uJ3MgcGxhbi5cIiwgaW5jbHVkZWRUaXRsZSksXG5cdFx0XHRcdFx0ZGVmYXVsdDogbG9jYWxpemUoJ3ByZW1pdW1JbmNsdWRlZCcsIFwiSW5jbHVkZWQgd2l0aCB5b3VyIG9yZ2FuaXphdGlvbidzIHBsYW4uXCIpXG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaW5jbHVkZWREZXNjcmlwdGlvbiA9IGdldEluY2x1ZGVkRGVzY3JpcHRpb24oKTtcblx0XHRcdGNvbnN0IGluY2x1ZGVkQ29udGFpbmVyID0gdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJ2Rpdi5xdW90YS1pbmRpY2F0b3IuaW5jbHVkZWQnKSk7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zPy5jb21wYWN0UXVvdGFMYXlvdXQpIHtcblx0XHRcdFx0Y29uc3QgcGxhbk5hbWUgPSBnZXRDaGF0UGxhbk5hbWUodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50KTtcblx0XHRcdFx0aW5jbHVkZWRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY29tcGFjdCcpO1xuXHRcdFx0XHRpbmNsdWRlZENvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYucXVvdGEtdGl0bGUnLCB1bmRlZmluZWQsIHBsYW5OYW1lKSk7XG5cdFx0XHRcdGluY2x1ZGVkQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5kZXNjcmlwdGlvbicsIHVuZGVmaW5lZCwgaW5jbHVkZWREZXNjcmlwdGlvbi5jb21wYWN0KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbmNsdWRlZENvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYucXVvdGEtdGl0bGUnLCB1bmRlZmluZWQsIGluY2x1ZGVkVGl0bGUpKTtcblx0XHRcdFx0aW5jbHVkZWRDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnZGl2LmRlc2NyaXB0aW9uJywgdW5kZWZpbmVkLCBpbmNsdWRlZERlc2NyaXB0aW9uLmRlZmF1bHQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBOZXh0IEVkaXQgU3VnZ2VzdGlvbnMgXHUyMDE0IGNvbGxhcHNpYmxlIHJlZ2lvblxuXHRcdGlmIChoYXNRdWlja1NldHRpbmdzQ29udGVudCkge1xuXHRcdFx0Y29uc3QgaGFzQ29udGVudEFib3ZlID0gaGFzVXNhZ2VTZWN0aW9uIHx8IGhhc1Zpc2libGVVc2FnZUNvbnRlbnQgfHwgaGFzUHJlbWl1bVVubGltaXRlZDtcblx0XHRcdHRoaXMucmVuZGVySW5saW5lU3VnZ2VzdGlvbnNTZWN0aW9uKGhhc0NvbnRlbnRBYm92ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udHJpYnV0ZWQgc2VjdGlvbnMgKGUuZy4gQ29kZWJhc2UgU2VtYW50aWMgSW5kZXgpIFx1MjAxNCBlYWNoIGdldHMgaXRzIG93biBjb2xsYXBzaWJsZVxuXHRcdGlmIChjb250cmlidXRlZEVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5yZW5kZXJDb250cmlidXRlZFNlY3Rpb25zKGNvbnRyaWJ1dGVkRW50cmllcyk7XG5cdFx0fVxuXG5cdFx0Ly8gTmV3IHRvIENoYXQgLyBTaWduZWQgb3V0XG5cdFx0dGhpcy5yZW5kZXJTZXR1cFNlY3Rpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVXNhZ2VDb250ZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgaGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQsIGhlYWRlclVwZ3JhZGVCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZCwgdXBkYXRlUHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IHZvaWQge1xuXHRcdGNvbnN0IHsgY2hhdDogY2hhdFF1b3RhLCBjb21wbGV0aW9uczogY29tcGxldGlvbnNRdW90YSwgcHJlbWl1bUNoYXQ6IHByZW1pdW1DaGF0UXVvdGEgfSA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0Y29uc3QgY29tcGFjdCA9ICEhdGhpcy5vcHRpb25zPy5jb21wYWN0UXVvdGFMYXlvdXQ7XG5cdFx0Y29uc3QgcGxhbk5hbWUgPSBjb21wYWN0ID8gZ2V0Q2hhdFBsYW5OYW1lKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCkgOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAoY2hhdFF1b3RhIHx8IHByZW1pdW1DaGF0UXVvdGEgfHwgY29tcGxldGlvbnNRdW90YSkge1xuXHRcdFx0Y29uc3QgcmVzZXRMYWJlbCA9IHRoaXMuZm9ybWF0R2xvYmFsUmVzZXRMYWJlbCgpO1xuXG5cdFx0XHQvLyBHbG9iYWwgcXVvdGEgY2FsbG91dCAoc2hvd24gYXQgdGhlIHRvcCwgYmVmb3JlIHF1b3RhIGluZGljYXRvcnMpXG5cdFx0XHRjb25zdCBnbG9iYWxDYWxsb3V0VXBkYXRlciA9IHRoaXMuY3JlYXRlR2xvYmFsUXVvdGFDYWxsb3V0KGNvbnRhaW5lcik7XG5cdFx0XHRjb25zdCB7IGNhbGxvdXRWaXNpYmxlOiBpbml0aWFsQ2FsbG91dFZpc2libGUgfSA9IGdsb2JhbENhbGxvdXRVcGRhdGVyKCk7XG5cblx0XHRcdC8vIFVwZGF0ZSBoZWFkZXIgYWRkaXRpb25hbCBzcGVuZCBidXR0b24gdmlzaWJpbGl0eSBiYXNlZCBvbiBjYWxsb3V0XG5cdFx0XHRpZiAoaGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uKSB7XG5cdFx0XHRcdGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBpbml0aWFsQ2FsbG91dFZpc2libGUgPyAnJyA6ICdub25lJztcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIGhlYWRlciB1cGdyYWRlIGJ1dHRvbiB2aXNpYmlsaXR5OiBoaWRlIHdoZW4gbWFuYWdlIGJ1ZGdldCBidXR0b24gaXMgdmlzaWJsZVxuXHRcdFx0aWYgKGhlYWRlclVwZ3JhZGVCdXR0b24pIHtcblx0XHRcdFx0aGVhZGVyVXBncmFkZUJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAoaGVhZGVyQWRkaXRpb25hbFNwZW5kQnV0dG9uICYmIGluaXRpYWxDYWxsb3V0VmlzaWJsZSkgPyAnbm9uZScgOiAnJztcblx0XHRcdH1cblxuXHRcdFx0bGV0IGNoYXRRdW90YUluZGljYXRvcjogKChxdW90YTogSVF1b3RhU25hcHNob3QgfCBzdHJpbmcpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNoYXRRdW90YSAmJiAhY2hhdFF1b3RhLnVubGltaXRlZCAmJiAoIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMudXNhZ2VCYXNlZEJpbGxpbmcgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZSkpIHtcblx0XHRcdFx0Y29uc3QgY2hhdExhYmVsID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZyAmJiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY3JlZGl0c0xhYmVsJywgXCJDcmVkaXRzXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdHNMYWJlbCcsIFwiQ2hhdCBtZXNzYWdlc1wiKTtcblx0XHRcdFx0Y2hhdFF1b3RhSW5kaWNhdG9yID0gdGhpcy5jcmVhdGVRdW90YUluZGljYXRvcihjb250YWluZXIsIGNoYXRRdW90YSwgY2hhdExhYmVsLCByZXNldExhYmVsLCBjb21wYWN0ID8gcGxhbk5hbWUgOiB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcHJlbWl1bUNoYXRRdW90YUluZGljYXRvcjogKChxdW90YTogSVF1b3RhU25hcHNob3QgfCBzdHJpbmcpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHByZW1pdW1DaGF0UXVvdGEgJiYgIXByZW1pdW1DaGF0UXVvdGEudW5saW1pdGVkICYmIHByZW1pdW1DaGF0UXVvdGEucGVyY2VudFJlbWFpbmluZyA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGlzVUJCID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZztcblx0XHRcdFx0Y29uc3QgcHJlbWl1bUNoYXRMYWJlbCA9IGlzVUJCXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY3JlZGl0c0xhYmVsJywgXCJDcmVkaXRzXCIpXG5cdFx0XHRcdFx0OiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPyBsb2NhbGl6ZSgnaW5jbHVkZWRQcmVtaXVtQ2hhdHNMYWJlbCcsIFwiSW5jbHVkZWQgcHJlbWl1bSByZXF1ZXN0c1wiKSA6IGxvY2FsaXplKCdwcmVtaXVtQ2hhdHNMYWJlbCcsIFwiUHJlbWl1bSByZXF1ZXN0c1wiKTtcblx0XHRcdFx0Y29uc3QgcHJlbWl1bUNoYXRSZXNldExhYmVsID0gaXNVQkIgPyB0aGlzLmZvcm1hdFJlc2V0QXRMYWJlbChwcmVtaXVtQ2hhdFF1b3RhLnJlc2V0QXQpID8/IHJlc2V0TGFiZWwgOiByZXNldExhYmVsO1xuXHRcdFx0XHRwcmVtaXVtQ2hhdFF1b3RhSW5kaWNhdG9yID0gdGhpcy5jcmVhdGVRdW90YUluZGljYXRvcihjb250YWluZXIsIHByZW1pdW1DaGF0UXVvdGEsIHByZW1pdW1DaGF0TGFiZWwsIHByZW1pdW1DaGF0UmVzZXRMYWJlbCwgY29tcGFjdCA/IHBsYW5OYW1lIDogdW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWRkaXRpb25hbCBCdWRnZXQgaW5kaWNhdG9yIChvdmVyYWdlIGJhciwgc2hvd24gd2hlbiBvdmVyYWdlX2VudGl0bGVtZW50ID4gMClcblx0XHRcdGxldCBhZGRpdGlvbmFsQnVkZ2V0SW5kaWNhdG9yOiAoKHF1b3RhOiBJUXVvdGFTbmFwc2hvdCB8IHN0cmluZykgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgYWRkaXRpb25hbEJ1ZGdldEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaW5pdGlhbE92ZXJhZ2VFbnRpdGxlbWVudCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuYWRkaXRpb25hbFVzYWdlRW50aXRsZW1lbnQgPz8gMDtcblx0XHRcdGlmIChpbml0aWFsT3ZlcmFnZUVudGl0bGVtZW50ID4gMCkge1xuXHRcdFx0XHRjb25zdCBvdmVyYWdlQ291bnQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLmFkZGl0aW9uYWxVc2FnZUNvdW50ID8/IDA7XG5cdFx0XHRcdGNvbnN0IG92ZXJhZ2VQZXJjZW50UmVtYWluaW5nID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCAoKGluaXRpYWxPdmVyYWdlRW50aXRsZW1lbnQgLSBvdmVyYWdlQ291bnQpIC8gaW5pdGlhbE92ZXJhZ2VFbnRpdGxlbWVudCkgKiAxMDApKTtcblx0XHRcdFx0Y29uc3Qgb3ZlcmFnZVNuYXBzaG90OiBJUXVvdGFTbmFwc2hvdCA9IHtcblx0XHRcdFx0XHRwZXJjZW50UmVtYWluaW5nOiBvdmVyYWdlUGVyY2VudFJlbWFpbmluZyxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiBpbml0aWFsT3ZlcmFnZUVudGl0bGVtZW50LFxuXHRcdFx0XHRcdHF1b3RhUmVtYWluaW5nOiBNYXRoLm1heCgwLCBpbml0aWFsT3ZlcmFnZUVudGl0bGVtZW50IC0gb3ZlcmFnZUNvdW50KSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbEJ1ZGdldExhYmVsID0gbG9jYWxpemUoJ2FkZGl0aW9uYWxCdWRnZXRMYWJlbCcsIFwiQWRkaXRpb25hbCBCdWRnZXRcIik7XG5cdFx0XHRcdGFkZGl0aW9uYWxCdWRnZXRJbmRpY2F0b3IgPSB0aGlzLmNyZWF0ZVF1b3RhSW5kaWNhdG9yKGNvbnRhaW5lciwgb3ZlcmFnZVNuYXBzaG90LCBhZGRpdGlvbmFsQnVkZ2V0TGFiZWwsIHJlc2V0TGFiZWwsIGNvbXBhY3QgPyBhZGRpdGlvbmFsQnVkZ2V0TGFiZWwgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRhZGRpdGlvbmFsQnVkZ2V0RWxlbWVudCA9IGNvbnRhaW5lci5sYXN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRjb25zdCBpc1ByZW1pdW1FeGhhdXN0ZWQgPSBwcmVtaXVtQ2hhdFF1b3RhICYmIHByZW1pdW1DaGF0UXVvdGEucGVyY2VudFJlbWFpbmluZyA8PSAwO1xuXHRcdFx0XHRpZiAoIWlzUHJlbWl1bUV4aGF1c3RlZCkge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxCdWRnZXRFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ211dGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IGNvbXBsZXRpb25zUXVvdGFJbmRpY2F0b3I6ICgocXVvdGE6IElRdW90YVNuYXBzaG90IHwgc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNob3dDb21wbGV0aW9ucyA9ICFjb21wYWN0ICYmIGNvbXBsZXRpb25zUXVvdGEgJiYgIWNvbXBsZXRpb25zUXVvdGEudW5saW1pdGVkICYmIGNvbXBsZXRpb25zUXVvdGEucGVyY2VudFJlbWFpbmluZyA+PSAwXG5cdFx0XHRcdCYmICghdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZyB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5GcmVlKTtcblx0XHRcdGlmIChzaG93Q29tcGxldGlvbnMpIHtcblx0XHRcdFx0Y29tcGxldGlvbnNRdW90YUluZGljYXRvciA9IHRoaXMuY3JlYXRlUXVvdGFJbmRpY2F0b3IoY29udGFpbmVyLCBjb21wbGV0aW9uc1F1b3RhLCBsb2NhbGl6ZSgnY29tcGxldGlvbnNMYWJlbCcsIFwiSW5saW5lIFN1Z2dlc3Rpb25zXCIpLCByZXNldExhYmVsLCBjb21wYWN0ID8gcGxhbk5hbWUgOiB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgaW5kaWNhdG9ycyBmcm9tIGN1cnJlbnQgcXVvdGEgc3RhdGVcblx0XHRcdGNvbnN0IHVwZGF0ZUluZGljYXRvcnMgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgY2hhdDogY2hhdFF1b3RhLCBwcmVtaXVtQ2hhdDogcHJlbWl1bUNoYXRRdW90YSwgY29tcGxldGlvbnM6IGNvbXBsZXRpb25zUXVvdGEgfSA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0XHRcdGlmIChjaGF0UXVvdGEpIHtcblx0XHRcdFx0XHRjaGF0UXVvdGFJbmRpY2F0b3I/LihjaGF0UXVvdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcmVtaXVtQ2hhdFF1b3RhKSB7XG5cdFx0XHRcdFx0cHJlbWl1bUNoYXRRdW90YUluZGljYXRvcj8uKHByZW1pdW1DaGF0UXVvdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uc1F1b3RhKSB7XG5cdFx0XHRcdFx0Y29tcGxldGlvbnNRdW90YUluZGljYXRvcj8uKGNvbXBsZXRpb25zUXVvdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhZGRpdGlvbmFsQnVkZ2V0SW5kaWNhdG9yICYmIGFkZGl0aW9uYWxCdWRnZXRFbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3ZlcmFnZUVudGl0bGVtZW50ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbnRpdGxlbWVudCA/PyAwO1xuXHRcdFx0XHRcdGNvbnN0IG92ZXJhZ2VDb3VudCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuYWRkaXRpb25hbFVzYWdlQ291bnQgPz8gMDtcblx0XHRcdFx0XHRpZiAob3ZlcmFnZUVudGl0bGVtZW50ID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3ZlcmFnZVBlcmNlbnRSZW1haW5pbmcgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsICgob3ZlcmFnZUVudGl0bGVtZW50IC0gb3ZlcmFnZUNvdW50KSAvIG92ZXJhZ2VFbnRpdGxlbWVudCkgKiAxMDApKTtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxCdWRnZXRJbmRpY2F0b3Ioe1xuXHRcdFx0XHRcdFx0XHRwZXJjZW50UmVtYWluaW5nOiBvdmVyYWdlUGVyY2VudFJlbWFpbmluZyxcblx0XHRcdFx0XHRcdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0ZW50aXRsZW1lbnQ6IG92ZXJhZ2VFbnRpdGxlbWVudCxcblx0XHRcdFx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IE1hdGgubWF4KDAsIG92ZXJhZ2VFbnRpdGxlbWVudCAtIG92ZXJhZ2VDb3VudCksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcHJlbWl1bUV4aGF1c3RlZCA9IHByZW1pdW1DaGF0UXVvdGEgJiYgcHJlbWl1bUNoYXRRdW90YS5wZXJjZW50UmVtYWluaW5nIDw9IDA7XG5cdFx0XHRcdFx0YWRkaXRpb25hbEJ1ZGdldEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbXV0ZWQnLCAhcHJlbWl1bUV4aGF1c3RlZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBjYWxsb3V0VmlzaWJsZSB9ID0gZ2xvYmFsQ2FsbG91dFVwZGF0ZXIoKTtcblx0XHRcdFx0aWYgKGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbikge1xuXHRcdFx0XHRcdGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBjYWxsb3V0VmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdFx0XHRcdGhlYWRlckFkZGl0aW9uYWxTcGVuZEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdtYW5hZ2VCdWRnZXQnLCBcIk1hbmFnZSBCdWRnZXRcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGhlYWRlclVwZ3JhZGVCdXR0b24pIHtcblx0XHRcdFx0XHRoZWFkZXJVcGdyYWRlQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IChoZWFkZXJBZGRpdGlvbmFsU3BlbmRCdXR0b24gJiYgY2FsbG91dFZpc2libGUpID8gJ25vbmUnIDogJyc7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIFVwZGF0ZSBvbmNlIHdoZW4gdGhlIGluaXRpYWwgZmV0Y2ggY29tcGxldGVzXG5cdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB1cGRhdGVQcm9taXNlO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dXBkYXRlSW5kaWNhdG9ycygpO1xuXHRcdFx0fSkoKTtcblxuXHRcdFx0Ly8gVXBkYXRlIGR5bmFtaWNhbGx5IHdoZW4gcXVvdGEgZGF0YSBjaGFuZ2VzIHdoaWxlIHRoZSBkYXNoYm9hcmQgaXMgb3BlblxuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nKCgpID0+IHVwZGF0ZUluZGljYXRvcnMoKSkpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQoKCkgPT4gdXBkYXRlSW5kaWNhdG9ycygpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQW5vbnltb3VzIEluZGljYXRvclxuXHRcdGVsc2UgaWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMgJiYgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5jb21wbGV0ZWQpIHtcblx0XHRcdHRoaXMuY3JlYXRlUXVvdGFJbmRpY2F0b3IoY29udGFpbmVyLCBsb2NhbGl6ZSgncXVvdGFMaW1pdGVkJywgXCJMaW1pdGVkXCIpLCBsb2NhbGl6ZSgnY2hhdHNMYWJlbCcsIFwiQ2hhdCBtZXNzYWdlc1wiKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbmxpbmVTdWdnZXN0aW9uc1NlY3Rpb24oaGFzQ29udGVudEFib3ZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9uQ29sbGFwc2libGUgPSAhIXRoaXMub3B0aW9ucz8uZGlzYWJsZVF1aWNrU2V0dGluZ3NDb2xsYXBzaWJsZTtcblx0XHRjb25zdCBjb2xsYXBzZWQgPSAhbm9uQ29sbGFwc2libGUgJiYgdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKENoYXRTdGF0dXNEYXNoYm9hcmQuUVVJQ0tfU0VUVElOR1NfQ09MTEFQU0VEX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHRydWUpO1xuXG5cdFx0Ly8gQ29tcHV0ZSBzdGF0dXMgYmFzZWQgb24gZWZmZWN0aXZlIGVuYWJsZW1lbnQgZm9yIHRoZSBhY3RpdmUgZWRpdG9yJ3MgbGFuZ3VhZ2Vcblx0XHRjb25zdCBhY3RpdmVMYW5ndWFnZUlkID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkO1xuXHRcdGNvbnN0IGdldFN0YXR1c1RleHQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuY2FuVXNlQ2hhdCgpKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdGlvbnNEaXNhYmxlZCcsIFwiRGlzYWJsZWRcIik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbmFibGVkID0gYWN0aXZlTGFuZ3VhZ2VJZFxuXHRcdFx0XHQ/IGlzQ29tcGxldGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIGFjdGl2ZUxhbmd1YWdlSWQpXG5cdFx0XHRcdDogaXNDb21wbGV0aW9uc0VuYWJsZWQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRyZXR1cm4gZW5hYmxlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdpbmxpbmVTdWdnZXN0aW9uc0VuYWJsZWQnLCBcIkVuYWJsZWRcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdGlvbnNEaXNhYmxlZCcsIFwiRGlzYWJsZWRcIik7XG5cdFx0fTtcblxuXHRcdGxldCBkaXNjbG9zdXJlSGVhZGVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2hldnJvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN0YXR1c0VsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIW5vbkNvbGxhcHNpYmxlKSB7XG5cdFx0XHRkaXNjbG9zdXJlSGVhZGVyID0gdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJ2J1dHRvbi5jb2xsYXBzaWJsZS1oZWFkZXInKSk7XG5cdFx0XHRpZiAoIWhhc0NvbnRlbnRBYm92ZSkge1xuXHRcdFx0XHRkaXNjbG9zdXJlSGVhZGVyLmNsYXNzTGlzdC5hZGQoJ25vLWJvcmRlcicpO1xuXHRcdFx0fVxuXHRcdFx0ZGlzY2xvc3VyZUhlYWRlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoIWNvbGxhcHNlZCkpO1xuXG5cdFx0XHRkaXNjbG9zdXJlSGVhZGVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY29sbGFwc2libGUtbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdpbmxpbmVTdWdnZXN0aW9uc1RhYicsIFwiSW5saW5lIFN1Z2dlc3Rpb25zXCIpKSk7XG5cblx0XHRcdGNoZXZyb24gPSBkaXNjbG9zdXJlSGVhZGVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY29sbGFwc2libGUtY2hldnJvbicpKTtcblx0XHRcdGNoZXZyb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShjb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd24pKTtcblxuXHRcdFx0c3RhdHVzRWwgPSBkaXNjbG9zdXJlSGVhZGVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY29sbGFwc2libGUtc3RhdHVzJywgdW5kZWZpbmVkLCBnZXRTdGF0dXNUZXh0KCkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb2xsYXBzaWJsZUNvbnRlbnQgPSB0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnZGl2LmNvbGxhcHNpYmxlLWNvbnRlbnQnKSk7XG5cdFx0Y29uc3QgY29sbGFwc2libGVJbm5lciA9IGNvbGxhcHNpYmxlQ29udGVudC5hcHBlbmRDaGlsZCgkKCdkaXYuY29sbGFwc2libGUtaW5uZXInKSk7XG5cdFx0aWYgKGNvbGxhcHNlZCkge1xuXHRcdFx0Y29sbGFwc2libGVDb250ZW50LmNsYXNzTGlzdC5hZGQoJ2NvbGxhcHNlZCcpO1xuXHRcdFx0Y29sbGFwc2libGVJbm5lci5pbmVydCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGRpc2Nsb3N1cmVIZWFkZXIgJiYgY2hldnJvbikge1xuXHRcdFx0Y29uc3QgdG9nZ2xlID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpc0NvbGxhcHNlZCA9IGNvbGxhcHNpYmxlQ29udGVudC5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnKTtcblx0XHRcdFx0Y29sbGFwc2libGVJbm5lci5pbmVydCA9IGlzQ29sbGFwc2VkO1xuXHRcdFx0XHRkaXNjbG9zdXJlSGVhZGVyIS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoIWlzQ29sbGFwc2VkKSk7XG5cdFx0XHRcdGNoZXZyb24hLmNsYXNzTmFtZSA9ICdjb2xsYXBzaWJsZS1jaGV2cm9uJztcblx0XHRcdFx0Y2hldnJvbiEuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpc0NvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRTdGF0dXNEYXNoYm9hcmQuUVVJQ0tfU0VUVElOR1NfQ09MTEFQU0VEX0tFWSwgaXNDb2xsYXBzZWQsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkaXNjbG9zdXJlSGVhZGVyLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRvZ2dsZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHN0YXR1cyB0ZXh0IHdoZW4gY29tcGxldGlvbnMgc2V0dGluZyBjaGFuZ2VzXG5cdFx0aWYgKHN0YXR1c0VsKSB7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmcpKSB7XG5cdFx0XHRcdFx0c3RhdHVzRWwhLnRleHRDb250ZW50ID0gZ2V0U3RhdHVzVGV4dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJJbmxpbmVTdWdnZXN0aW9uc0NvbnRlbnQoY29sbGFwc2libGVJbm5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbnRyaWJ1dGVkU2VjdGlvbnMoY29udHJpYnV0ZWRFbnRyaWVzOiBDaGF0U3RhdHVzRW50cnlbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBjb250cmlidXRlZEVudHJpZXMpIHtcblx0XHRcdGNvbnN0IGhlYWRlckxhYmVsID0gdHlwZW9mIGl0ZW0ubGFiZWwgPT09ICdzdHJpbmcnID8gaXRlbS5sYWJlbCA6IGl0ZW0ubGFiZWwubGFiZWw7XG5cdFx0XHRsZXQgaGVhZGVyTGluayA9IHR5cGVvZiBpdGVtLmxhYmVsID09PSAnc3RyaW5nJyA/IHVuZGVmaW5lZCA6IGl0ZW0ubGFiZWwubGluaztcblx0XHRcdGxldCBsaW5rRGVzY3JpcHRpb24gPSB0eXBlb2YgaXRlbS5sYWJlbCA9PT0gJ3N0cmluZycgPyB1bmRlZmluZWQgOiBpdGVtLmxhYmVsLmhlbHBUZXh0O1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdkaXYuY29udHJpYnV0ZWQtc2VjdGlvbicpKTtcblxuXHRcdFx0Ly8gU2luZ2xlIG5vbi1jb2xsYXBzaWJsZSBoZWFkZXIgcm93XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBzZWN0aW9uLmFwcGVuZENoaWxkKCQoJ2Rpdi5jb2xsYXBzaWJsZS1oZWFkZXIubm9uLWNvbGxhcHNpYmxlJykpO1xuXHRcdFx0aGVhZGVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uY29sbGFwc2libGUtbGFiZWwnLCB1bmRlZmluZWQsIGhlYWRlckxhYmVsKSk7XG5cblx0XHRcdC8vIEluZm8gaWNvbiAocmVwbGFjZXMgY2hldnJvbikgXHUyMDE0IHNob3dzIGhlbHBUZXh0IGluIGEgbmVzdGVkIGhvdmVyXG5cdFx0XHRpZiAobGlua0Rlc2NyaXB0aW9uIHx8IGhlYWRlckxpbmspIHtcblx0XHRcdFx0Y29uc3QgaW5mb0ljb24gPSBoZWFkZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jb250cmlidXRlZC1pbmZvLWljb24nKSk7XG5cdFx0XHRcdGluZm9JY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5pbmZvKSk7XG5cblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGluZm9JY29uLCAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaG92ZXJDb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRpZiAobGlua0Rlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRob3ZlckNvbnRlbnQuYXBwZW5kVGV4dChsaW5rRGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaGVhZGVyTGluaykge1xuXHRcdFx0XHRcdFx0aWYgKGxpbmtEZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0XHRob3ZlckNvbnRlbnQuYXBwZW5kVGV4dCgnICcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aG92ZXJDb250ZW50LmFwcGVuZE1hcmtkb3duKGBbJHtsb2NhbGl6ZSgnbGVhcm5Nb3JlJywgXCJMZWFybiBNb3JlXCIpfV0oJHtoZWFkZXJMaW5rfSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogaG92ZXJDb250ZW50IH07XG5cdFx0XHRcdH0sIHsgcmVkdWNlZERlbGF5OiB0cnVlIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RhdHVzIHRleHQgKHJpZ2h0LWFsaWduZWQgdmlhIG1hcmdpbi1sZWZ0OiBhdXRvKVxuXHRcdFx0Y29uc3Qgc3RhdHVzRWwgPSBoZWFkZXIuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5jb2xsYXBzaWJsZS1zdGF0dXMnKSk7XG5cdFx0XHRjb25zdCBzdGF0dXNEaXNwb3NhYmxlcyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0XHRcdGNvbnN0IHJlbmRlclN0YXR1cyA9ICh0ZXh0OiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdFx0Y29uc3QgbmV3U3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdHN0YXR1c0Rpc3Bvc2FibGVzLnZhbHVlID0gbmV3U3RvcmU7XG5cdFx0XHRcdHRoaXMucmVuZGVyVGV4dFBsdXMoc3RhdHVzRWwsIHRleHQsIG5ld1N0b3JlKTtcblx0XHRcdH07XG5cdFx0XHRyZW5kZXJTdGF0dXMoaXRlbS5kZXNjcmlwdGlvbik7XG5cblx0XHRcdC8vIFNob3cgdG9vbHRpcCBvbiBob3ZlciBvZiB0aGUgc3RhdHVzIHRleHRcblx0XHRcdGxldCBjdXJyZW50VG9vbHRpcCA9IGl0ZW0udG9vbHRpcDtcblx0XHRcdGlmIChjdXJyZW50VG9vbHRpcCkge1xuXHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoc3RhdHVzRWwsICgpID0+ICh7XG5cdFx0XHRcdFx0Y29udGVudDogY3VycmVudFRvb2x0aXAgPz8gJycsXG5cdFx0XHRcdH0pLCB7IHJlZHVjZWREZWxheTogdHJ1ZSB9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERldGFpbCAoYWN0aW9uIGxpbmspIHJlbmRlcmVkIGlubGluZVxuXHRcdFx0Y29uc3Qgc2VjdGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRcdGNvbnN0IHNlY3Rpb25TdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHNlY3Rpb25EaXNwb3NhYmxlcy52YWx1ZSA9IHNlY3Rpb25TdG9yZTtcblxuXHRcdFx0bGV0IGRldGFpbEVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpdGVtLmRldGFpbCkge1xuXHRcdFx0XHRkZXRhaWxFbCA9IHNlY3Rpb24uYXBwZW5kQ2hpbGQoJCgnZGl2LmNvbnRyaWJ1dGVkLWRldGFpbCcpKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJUZXh0UGx1cyhkZXRhaWxFbCwgaXRlbS5kZXRhaWwsIHNlY3Rpb25TdG9yZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIExpc3RlbiBmb3IgdXBkYXRlcyB0byByZS1yZW5kZXIgc3RhdHVzIGFuZCBkZXRhaWxcblx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmNoYXRTdGF0dXNJdGVtU2VydmljZS5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0aWYgKGUuZW50cnkuaWQgPT09IGl0ZW0uaWQpIHtcblx0XHRcdFx0XHQvLyBVcGRhdGUgc3RhdHVzIGluIGhlYWRlclxuXHRcdFx0XHRcdHN0YXR1c0VsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdFx0cmVuZGVyU3RhdHVzKGUuZW50cnkuZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdGN1cnJlbnRUb29sdGlwID0gZS5lbnRyeS50b29sdGlwO1xuXG5cdFx0XHRcdFx0Ly8gVXBkYXRlIG11dGFibGUgaG92ZXIgY29udGVudCByZWZlcmVuY2VzXG5cdFx0XHRcdFx0aGVhZGVyTGluayA9IHR5cGVvZiBlLmVudHJ5LmxhYmVsID09PSAnc3RyaW5nJyA/IHVuZGVmaW5lZCA6IGUuZW50cnkubGFiZWwubGluaztcblx0XHRcdFx0XHRsaW5rRGVzY3JpcHRpb24gPSB0eXBlb2YgZS5lbnRyeS5sYWJlbCA9PT0gJ3N0cmluZycgPyB1bmRlZmluZWQgOiBlLmVudHJ5LmxhYmVsLmhlbHBUZXh0O1xuXG5cdFx0XHRcdFx0Ly8gUmUtcmVuZGVyIGRldGFpbCBjb250ZW50XG5cdFx0XHRcdFx0Y29uc3QgbmV3U3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0c2VjdGlvbkRpc3Bvc2FibGVzLnZhbHVlID0gbmV3U3RvcmU7XG5cblx0XHRcdFx0XHRpZiAoZGV0YWlsRWwpIHtcblx0XHRcdFx0XHRcdGlmIChlLmVudHJ5LmRldGFpbCkge1xuXHRcdFx0XHRcdFx0XHRkZXRhaWxFbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnJlbmRlclRleHRQbHVzKGRldGFpbEVsLCBlLmVudHJ5LmRldGFpbCwgbmV3U3RvcmUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZGV0YWlsRWwucmVtb3ZlKCk7XG5cdFx0XHRcdFx0XHRcdGRldGFpbEVsID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZS5lbnRyeS5kZXRhaWwpIHtcblx0XHRcdFx0XHRcdGRldGFpbEVsID0gc2VjdGlvbi5hcHBlbmRDaGlsZCgkKCdkaXYuY29udHJpYnV0ZWQtZGV0YWlsJykpO1xuXHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJUZXh0UGx1cyhkZXRhaWxFbCwgZS5lbnRyeS5kZXRhaWwsIG5ld1N0b3JlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNldHVwU2VjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBoYXNCeW9rTW9kZWxzID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmhhc0J5b2tNb2RlbHM7XG5cdFx0Y29uc3QgbmV3VXNlciA9IGlzTmV3VXNlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UpICYmICFoYXNCeW9rTW9kZWxzO1xuXHRcdGNvbnN0IGFub255bW91c1VzZXIgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzO1xuXHRcdGNvbnN0IGRpc2FibGVkID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5kaXNhYmxlZCB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LnVudHJ1c3RlZDtcblx0XHQvLyBLZWVwIHRoZSBTaWduLWluIGVudHJ5IHZpc2libGUgZXZlbiB3aGVuIEJZT0sgbW9kZWxzIGFyZSBwcmVzZW50IHNvIGFpci1nYXBwZWRcblx0XHQvLyB1c2VycyBjYW4gc3RpbGwgYXV0aGVudGljYXRlIHRvIHVubG9jayB0aGUgZnVsbCBDb3BpbG90IGV4cGVyaWVuY2UuXG5cdFx0Y29uc3Qgc2lnbmVkT3V0ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bjtcblx0XHRpZiAoIShuZXdVc2VyIHx8IHNpZ25lZE91dCB8fCBkaXNhYmxlZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnaHInKSk7XG5cblx0XHRsZXQgZGVzY3JpcHRpb25UZXh0OiBzdHJpbmcgfCBNYXJrZG93blN0cmluZztcblx0XHRsZXQgZGVzY3JpcHRpb25DbGFzcyA9ICcuZGVzY3JpcHRpb24nO1xuXHRcdGlmIChuZXdVc2VyICYmIGFub255bW91c1VzZXIpIHtcblx0XHRcdGRlc2NyaXB0aW9uVGV4dCA9IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSh7IGtleTogJ2FjdGl2ZURlc2NyaXB0aW9uQW5vbnltb3VzJywgY29tbWVudDogWyd7TG9ja2VkPVwiXSh7Mn0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHszfSlcIn0nXSB9LCBcIkJ5IGNvbnRpbnVpbmcgd2l0aCB7MH0gQ29waWxvdCwgeW91IGFncmVlIHRvIHsxfSdzIFtUZXJtc10oezJ9KSBhbmQgW1ByaXZhY3kgU3RhdGVtZW50XSh7M30pXCIsIGRlZmF1bHRDaGF0LnByb3ZpZGVyLmRlZmF1bHQubmFtZSwgZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lLCBkZWZhdWx0Q2hhdC50ZXJtc1N0YXRlbWVudFVybCwgZGVmYXVsdENoYXQucHJpdmFjeVN0YXRlbWVudFVybCksIHsgaXNUcnVzdGVkOiB0cnVlIH0pO1xuXHRcdFx0ZGVzY3JpcHRpb25DbGFzcyA9IGAke2Rlc2NyaXB0aW9uQ2xhc3N9LnRlcm1zYDtcblx0XHR9IGVsc2UgaWYgKG5ld1VzZXIpIHtcblx0XHRcdGRlc2NyaXB0aW9uVGV4dCA9IGxvY2FsaXplKCdhY3RpdmF0ZURlc2NyaXB0aW9uJywgXCJTZXQgdXAgQ29waWxvdCB0byB1c2UgQUkgZmVhdHVyZXMuXCIpO1xuXHRcdH0gZWxzZSBpZiAoYW5vbnltb3VzVXNlcikge1xuXHRcdFx0ZGVzY3JpcHRpb25UZXh0ID0gbG9jYWxpemUoJ2VuYWJsZU1vcmVEZXNjcmlwdGlvbicsIFwiU2lnbiBpbiB0byBlbmFibGUgbW9yZSBDb3BpbG90IEFJIGZlYXR1cmVzLlwiKTtcblx0XHR9IGVsc2UgaWYgKGRpc2FibGVkKSB7XG5cdFx0XHRkZXNjcmlwdGlvblRleHQgPSBsb2NhbGl6ZSgnZW5hYmxlRGVzY3JpcHRpb24nLCBcIkVuYWJsZSBDb3BpbG90IHRvIHVzZSBBSSBmZWF0dXJlcy5cIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlc2NyaXB0aW9uVGV4dCA9IGxvY2FsaXplKCdzaWduSW5EZXNjcmlwdGlvbicsIFwiU2lnbiBpbiB0byB1c2UgR2l0SHViIENvcGlsb3QgQUkgZmVhdHVyZXMuXCIpO1xuXHRcdH1cblxuXHRcdGxldCBidXR0b25MYWJlbDogc3RyaW5nO1xuXHRcdGlmIChuZXdVc2VyKSB7XG5cdFx0XHRidXR0b25MYWJlbCA9IGxvY2FsaXplKCdlbmFibGVBSUZlYXR1cmVzJywgXCJVc2UgQUkgRmVhdHVyZXNcIik7XG5cdFx0fSBlbHNlIGlmIChhbm9ueW1vdXNVc2VyKSB7XG5cdFx0XHRidXR0b25MYWJlbCA9IGxvY2FsaXplKCdlbmFibGVNb3JlQUlGZWF0dXJlcycsIFwiRW5hYmxlIG1vcmUgQUkgRmVhdHVyZXNcIik7XG5cdFx0fSBlbHNlIGlmIChkaXNhYmxlZCkge1xuXHRcdFx0YnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnZW5hYmxlQ29waWxvdEJ1dHRvbicsIFwiRW5hYmxlIEFJIEZlYXR1cmVzXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRidXR0b25MYWJlbCA9IGxvY2FsaXplKCdzaWduSW5Ub1VzZUFJRmVhdHVyZXMnLCBcIlNpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90XCIpO1xuXHRcdH1cblxuXHRcdGxldCBjb21tYW5kSWQ6IHN0cmluZztcblx0XHRpZiAobmV3VXNlciAmJiBhbm9ueW1vdXNVc2VyKSB7XG5cdFx0XHRjb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cEFub255bW91c1dpdGhvdXREaWFsb2cnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cCc7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBkZXNjcmlwdGlvblRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoJChgZGl2JHtkZXNjcmlwdGlvbkNsYXNzfWAsIHVuZGVmaW5lZCwgZGVzY3JpcHRpb25UZXh0KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKGBkaXYke2Rlc2NyaXB0aW9uQ2xhc3N9YCwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZS5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoZGVzY3JpcHRpb25UZXh0KSkuZWxlbWVudCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQnV0dG9uKHRoaXMuZWxlbWVudCwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlIH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBidXR0b25MYWJlbDtcblx0XHR0aGlzLl9zdG9yZS5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoY29tbWFuZElkKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbmxpbmVTdWdnZXN0aW9uc0NvbnRlbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIFNldHRpbmdzIChlZGl0b3Itc3BlY2lmaWMpXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnM/LmRpc2FibGVJbmxpbmVTdWdnZXN0aW9uc1NldHRpbmdzKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZVNldHRpbmdzKGNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gKCF0aGlzLm9wdGlvbnM/LmRpc2FibGVNb2RlbFNlbGVjdGlvbiB8fCAhdGhpcy5vcHRpb25zPy5kaXNhYmxlUHJvdmlkZXJPcHRpb25zKSA/IHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5hbGxOb01vZGVsKCkgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBNb2RlbCBTZWxlY3Rpb24gKGVkaXRvci1zcGVjaWZpYylcblx0XHRpZiAoIXRoaXMub3B0aW9ucz8uZGlzYWJsZU1vZGVsU2VsZWN0aW9uICYmIHByb3ZpZGVycykge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlcnMuZmluZChwID0+IHAubW9kZWxJbmZvICYmIHAubW9kZWxJbmZvLm1vZGVscy5sZW5ndGggPiAwKTtcblxuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsSW5mbyA9IHByb3ZpZGVyLm1vZGVsSW5mbyE7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlbCA9IG1vZGVsSW5mby5tb2RlbHMuZmluZChtID0+IG0uaWQgPT09IG1vZGVsSW5mby5jdXJyZW50TW9kZWxJZCk7XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRNb2RlbCkge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsQ29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5tb2RlbC1zZWxlY3Rpb24nKSk7XG5cblx0XHRcdFx0XHRtb2RlbENvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdzcGFuLm1vZGVsLXRleHQnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdtb2RlbExhYmVsJywgXCJNb2RlbFwiKSkpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0T3B0aW9ucyA9IG1vZGVsSW5mby5tb2RlbHMubWFwKG0gPT4gKHsgdGV4dDogbS5uYW1lIH0pKTtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZEluZGV4ID0gbW9kZWxJbmZvLm1vZGVscy5maW5kSW5kZXgobSA9PiBtLmlkID09PSBtb2RlbEluZm8uY3VycmVudE1vZGVsSWQpO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdEJveCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgU2VsZWN0Qm94KHNlbGVjdE9wdGlvbnMsIE1hdGgubWF4KDAsIHNlbGVjdGVkSW5kZXgpLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgZGVmYXVsdFNlbGVjdEJveFN0eWxlcywgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdzZWxlY3RNb2RlbCcsIFwiU2VsZWN0IE1vZGVsXCIpLCBvcHRpb25zQXNDaGlsZHJlbjogdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0Q29udGFpbmVyID0gbW9kZWxDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnZGl2Lm1vZGVsLXNlbGVjdC1jb250YWluZXInKSk7XG5cdFx0XHRcdFx0c2VsZWN0Qm94LnJlbmRlcihzZWxlY3RDb250YWluZXIpO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JlLmFkZChzZWxlY3RCb3gub25EaWRTZWxlY3QoYXN5bmMgZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZE1vZGVsID0gbW9kZWxJbmZvLm1vZGVsc1tlLmluZGV4XTtcblx0XHRcdFx0XHRcdGlmIChzZWxlY3RlZE1vZGVsICYmIHNlbGVjdGVkTW9kZWwuaWQgIT09IG1vZGVsSW5mby5jdXJyZW50TW9kZWxJZCAmJiBwcm92aWRlci5zZXRNb2RlbElkKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHByb3ZpZGVyLnNldE1vZGVsSWQoc2VsZWN0ZWRNb2RlbC5pZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUHJvdmlkZXIgT3B0aW9ucyAoZWRpdG9yLXNwZWNpZmljKVxuXHRcdGlmICghdGhpcy5vcHRpb25zPy5kaXNhYmxlUHJvdmlkZXJPcHRpb25zICYmIHByb3ZpZGVycykge1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBwcm92aWRlcnMpIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLnByb3ZpZGVyT3B0aW9ucyAmJiBwcm92aWRlci5wcm92aWRlck9wdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIHByb3ZpZGVyLnByb3ZpZGVyT3B0aW9ucykge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFZhbHVlID0gb3B0aW9uLnZhbHVlcy5maW5kKHYgPT4gdi5pZCA9PT0gb3B0aW9uLmN1cnJlbnRWYWx1ZUlkKTtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50VmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3B0aW9uQ29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5zdWdnZXN0LW9wdGlvbi1zZWxlY3Rpb24nKSk7XG5cblx0XHRcdFx0XHRcdFx0b3B0aW9uQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uc3VnZ2VzdC1vcHRpb24tdGV4dCcsIHVuZGVmaW5lZCwgb3B0aW9uLmxhYmVsKSk7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0T3B0aW9ucyA9IG9wdGlvbi52YWx1ZXMubWFwKHYgPT4gKHsgdGV4dDogdi5sYWJlbCB9KSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkSW5kZXggPSBvcHRpb24udmFsdWVzLmZpbmRJbmRleCh2ID0+IHYuaWQgPT09IG9wdGlvbi5jdXJyZW50VmFsdWVJZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdEJveCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgU2VsZWN0Qm94KHNlbGVjdE9wdGlvbnMsIE1hdGgubWF4KDAsIHNlbGVjdGVkSW5kZXgpLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgZGVmYXVsdFNlbGVjdEJveFN0eWxlcywgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdzZWxlY3RPcHRpb24nLCBcIlNlbGVjdCB7MH1cIiwgb3B0aW9uLmxhYmVsKSwgb3B0aW9uc0FzQ2hpbGRyZW46IHRydWUgfSkpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RDb250YWluZXIgPSBvcHRpb25Db250YWluZXIuYXBwZW5kQ2hpbGQoJCgnZGl2LnN1Z2dlc3Qtb3B0aW9uLXNlbGVjdC1jb250YWluZXInKSk7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdEJveC5yZW5kZXIoc2VsZWN0Q29udGFpbmVyKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKHNlbGVjdEJveC5vbkRpZFNlbGVjdChhc3luYyBlID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZFZhbHVlID0gb3B0aW9uLnZhbHVlc1tlLmluZGV4XTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRWYWx1ZSAmJiBzZWxlY3RlZFZhbHVlLmlkICE9PSBvcHRpb24uY3VycmVudFZhbHVlSWQgJiYgcHJvdmlkZXIuc2V0UHJvdmlkZXJPcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IHByb3ZpZGVyLnNldFByb3ZpZGVyT3B0aW9uKG9wdGlvbi5pZCwgc2VsZWN0ZWRWYWx1ZS5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcGxldGlvbnMgU25vb3plIChlZGl0b3Itc3BlY2lmaWMpXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnM/LmRpc2FibGVDb21wbGV0aW9uc1Nub296ZSAmJiB0aGlzLmNhblVzZUNoYXQoKSkge1xuXHRcdFx0Y29uc3Qgc25vb3plID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2LnNub296ZS1jb21wbGV0aW9ucycpKTtcblx0XHRcdHRoaXMuY3JlYXRlQ29tcGxldGlvbnNTbm9vemUoc25vb3plLCBsb2NhbGl6ZSgnc2V0dGluZ3Muc25vb3plJywgXCJTbm9vemVcIikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2FuVXNlQ2hhdCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuY29tcGxldGVkIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuZGlzYWJsZWQgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC51bnRydXN0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gY2hhdCBub3QgY29tcGxldGVkIG9yIG5vdCBlbmFibGVkXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24gfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuQXZhaWxhYmxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmFub255bW91czsgLy8gc2lnbmVkIG91dCBvciBub3QteWV0LXNpZ25lZC11cCB1c2VycyBjYW4gb25seSB1c2UgQ2hhdCBpZiBhbm9ueW1vdXMgYWNjZXNzIGlzIGFsbG93ZWRcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZSAmJiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLmNoYXQ/LnBlcmNlbnRSZW1haW5pbmcgPT09IDAgJiYgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5jb21wbGV0aW9ucz8ucGVyY2VudFJlbWFpbmluZyA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBmcmVlIHVzZXIgd2l0aCBubyBxdW90YSBsZWZ0XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBsYWJlbDogc3RyaW5nLCBhY3Rpb24/OiBJQWN0aW9uKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGhlYWRlciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCdkaXYuaGVhZGVyJykpO1xuXHRcdGhlYWRlci5hcHBlbmRDaGlsZCgkKCdzcGFuLmhlYWRlci1sYWJlbCcsIHVuZGVmaW5lZCwgbGFiZWwpKTtcblxuXHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdGNvbnN0IHRvb2xiYXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihoZWFkZXIsIHsgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9KSk7XG5cdFx0XHR0b29sYmFyLnB1c2goW2FjdGlvbl0sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBoZWFkZXI7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclRleHRQbHVzKHRhcmdldDogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZywgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBwYXJzZUxpbmtlZFRleHQodGV4dCkubm9kZXMpIHtcblx0XHRcdGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSByZW5kZXJMYWJlbFdpdGhJY29ucyhub2RlKTtcblx0XHRcdFx0dGFyZ2V0LmFwcGVuZCguLi5wYXJ0cyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdG9yZS5hZGQobmV3IExpbmsodGFyZ2V0LCBub2RlLCB1bmRlZmluZWQsIHRoaXMuaG92ZXJTZXJ2aWNlLCB0aGlzLm9wZW5lclNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJ1bkNvbW1hbmRBbmRDbG9zZShjb21tYW5kT3JGbjogc3RyaW5nIHwgKCguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIGNvbW1hbmRPckZuID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRjb21tYW5kT3JGbiguLi5hcmdzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogY29tbWFuZE9yRm4sIGZyb206ICdjaGF0LXN0YXR1cycgfSk7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRPckZuLCAuLi5hcmdzKTtcblx0XHR9XG5cblx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFJlc2V0QXRMYWJlbChyZXNldEF0OiBudW1iZXIgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVzZXRBdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzZXREYXRlID0gbmV3IERhdGUocmVzZXRBdCAqIDEwMDApO1xuXHRcdHJldHVybiBsb2NhbGl6ZSgncXVvdGFSZXNldHNBdCcsIFwiUmVzZXRzIHswfSBhdCB7MX1cIiwgdGhpcy5kYXRlRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChyZXNldERhdGUpLCB0aGlzLnRpbWVGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHJlc2V0RGF0ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRHbG9iYWxSZXNldExhYmVsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgeyByZXNldERhdGUsIHJlc2V0RGF0ZUhhc1RpbWUgfSA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0aWYgKCFyZXNldERhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXNldERhdGVIYXNUaW1lXG5cdFx0XHQ/IGxvY2FsaXplKCdxdW90YVJlc2V0c0F0JywgXCJSZXNldHMgezB9IGF0IHsxfVwiLCB0aGlzLmRhdGVGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KG5ldyBEYXRlKHJlc2V0RGF0ZSkpLCB0aGlzLnRpbWVGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KG5ldyBEYXRlKHJlc2V0RGF0ZSkpKVxuXHRcdFx0OiBsb2NhbGl6ZSgncXVvdGFSZXNldHMnLCBcIlJlc2V0cyB7MH1cIiwgdGhpcy5kYXRlRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChuZXcgRGF0ZShyZXNldERhdGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNyZWRpdHNVc2VkSW5kaWNhdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGNyZWRpdHNVc2VkOiBudW1iZXIsIHJlc2V0QXQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzQ29tcGFjdCA9ICEhdGhpcy5vcHRpb25zPy5jb21wYWN0UXVvdGFMYXlvdXQ7XG5cdFx0Y29uc3QgcmVzZXRMYWJlbCA9IHRoaXMuZm9ybWF0UmVzZXRBdExhYmVsKHJlc2V0QXQpID8/IHRoaXMuZm9ybWF0R2xvYmFsUmVzZXRMYWJlbCgpO1xuXG5cdFx0Y29uc3QgcmVzZXRWYWx1ZSA9ICQoJ3NwYW4ucXVvdGEtcmVzZXQnKTtcblx0XHRpZiAocmVzZXRMYWJlbCkge1xuXHRcdFx0cmVzZXRWYWx1ZS50ZXh0Q29udGVudCA9IHJlc2V0TGFiZWw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVvdGFQZXJjZW50YWdlID0gJCgnZGl2LnF1b3RhLXBlcmNlbnRhZ2UnLCB1bmRlZmluZWQsXG5cdFx0XHQkKCdzcGFuLnF1b3RhLXZhbHVlJywgdW5kZWZpbmVkLCB0aGlzLnF1b3RhQ3JlZGl0c0Zvcm1hdHRlci52YWx1ZS5mb3JtYXQoY3JlZGl0c1VzZWQpKSxcblx0XHRcdCQoJ3NwYW4ucXVvdGEtdmFsdWUtc3VmZml4JywgdW5kZWZpbmVkLCBpc0NvbXBhY3Rcblx0XHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFMYWJlbFVzZWQnLCBcInswfSB1c2VkXCIsIGxvY2FsaXplKCdjcmVkaXRzTGFiZWwnLCBcIkNyZWRpdHNcIikpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NyZWRpdHNVc2VkTGFiZWwnLCBcIkNyZWRpdHMgVXNlZFwiKSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgaW5kaWNhdG9yRWxlbWVudCA9ICQoJ2Rpdi5xdW90YS1pbmRpY2F0b3IuaW5jbHVkZWQuY3JlZGl0cy11c2VkJywgdW5kZWZpbmVkLFxuXHRcdFx0Li4uaXNDb21wYWN0ID8gWyQoJ2Rpdi5xdW90YS10aXRsZScsIHVuZGVmaW5lZCwgZ2V0Q2hhdFBsYW5OYW1lKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCkpXSA6IFtdLFxuXHRcdFx0JCgnZGl2LnF1b3RhLWRldGFpbHMnLCB1bmRlZmluZWQsXG5cdFx0XHRcdHF1b3RhUGVyY2VudGFnZSxcblx0XHRcdFx0cmVzZXRWYWx1ZVxuXHRcdFx0KVxuXHRcdCk7XG5cdFx0aWYgKGlzQ29tcGFjdCkge1xuXHRcdFx0aW5kaWNhdG9yRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb21wYWN0Jyk7XG5cdFx0fVxuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGluZGljYXRvckVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVRdW90YUluZGljYXRvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBxdW90YTogSVF1b3RhU25hcHNob3QgfCBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHJlc2V0TGFiZWw/OiBzdHJpbmcsIGNvbXBhY3RUaXRsZT86IHN0cmluZyk6IChxdW90YTogSVF1b3RhU25hcHNob3QgfCBzdHJpbmcpID0+IHZvaWQge1xuXHRcdGNvbnN0IGlzQ29tcGFjdCA9ICEhY29tcGFjdFRpdGxlO1xuXHRcdGNvbnN0IHF1b3RhVmFsdWUgPSAkKCdzcGFuLnF1b3RhLXZhbHVlJyk7XG5cdFx0Y29uc3QgcXVvdGFWYWx1ZVRleHQgPSBpc0NvbXBhY3QgPyBxdW90YVZhbHVlLmFwcGVuZENoaWxkKCQoJ3NwYW4ucXVvdGEtdmFsdWUtdGV4dCcpKSA6IHF1b3RhVmFsdWU7XG5cdFx0Y29uc3QgcXVvdGFWYWx1ZVN1ZmZpeCA9ICQoJ3NwYW4ucXVvdGEtdmFsdWUtc3VmZml4Jyk7XG5cdFx0Y29uc3QgcXVvdGFCaXQgPSAkKCdkaXYucXVvdGEtYml0Jyk7XG5cdFx0Y29uc3QgcmVzZXRWYWx1ZSA9ICQoJ3NwYW4ucXVvdGEtcmVzZXQnKTtcblxuXHRcdGlmIChyZXNldExhYmVsKSB7XG5cdFx0XHRyZXNldFZhbHVlLnRleHRDb250ZW50ID0gcmVzZXRMYWJlbDtcblx0XHR9XG5cblx0XHRjb25zdCBxdW90YVBlcmNlbnRhZ2UgPSAkKCdkaXYucXVvdGEtcGVyY2VudGFnZScsIHVuZGVmaW5lZCxcblx0XHRcdHF1b3RhVmFsdWUsXG5cdFx0XHRxdW90YVZhbHVlU3VmZml4XG5cdFx0KTtcblx0XHRxdW90YVBlcmNlbnRhZ2UudGFiSW5kZXggPSBpc0NvbXBhY3QgPyAtMSA6IDA7XG5cblx0XHRjb25zdCBpbmRpY2F0b3JFbGVtZW50ID0gJCgnZGl2LnF1b3RhLWluZGljYXRvcicsIHVuZGVmaW5lZCxcblx0XHRcdCQoJ2Rpdi5xdW90YS10aXRsZScsIHVuZGVmaW5lZCxcblx0XHRcdFx0JCgnc3BhbicsIHVuZGVmaW5lZCwgaXNDb21wYWN0ID8gY29tcGFjdFRpdGxlIDogbGFiZWwpLFxuXHRcdFx0XHQuLi5pc0NvbXBhY3QgPyBbXSA6IFtyZXNldFZhbHVlXVxuXHRcdFx0KSxcblx0XHRcdCQoJ2Rpdi5xdW90YS1kZXRhaWxzJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRxdW90YVBlcmNlbnRhZ2UsXG5cdFx0XHRcdC4uLmlzQ29tcGFjdCA/IFtyZXNldFZhbHVlXSA6IFtdXG5cdFx0XHQpLFxuXHRcdFx0Li4uaXNDb21wYWN0ID8gW10gOiBbJCgnZGl2LnF1b3RhLWJhcicsIHVuZGVmaW5lZCwgcXVvdGFCaXQpXVxuXHRcdCk7XG5cdFx0aWYgKGlzQ29tcGFjdCkge1xuXHRcdFx0aW5kaWNhdG9yRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb21wYWN0Jyk7XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChpbmRpY2F0b3JFbGVtZW50KTtcblxuXHRcdGxldCBjdXJyZW50UXVvdGE6IElRdW90YVNuYXBzaG90IHwgc3RyaW5nID0gcXVvdGE7XG5cdFx0bGV0IGlzSG92ZXJlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3Qgc2hvd1BlcmNlbnRhZ2UgPSAoKSA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGN1cnJlbnRRdW90YSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cXVvdGFWYWx1ZVRleHQudGV4dENvbnRlbnQgPSBjdXJyZW50UXVvdGE7XG5cdFx0XHRcdHF1b3RhVmFsdWVTdWZmaXgudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHVzZWRQZXJjZW50YWdlID0gTWF0aC5tYXgoMCwgMTAwIC0gY3VycmVudFF1b3RhLnBlcmNlbnRSZW1haW5pbmcpO1xuXHRcdFx0XHRxdW90YVZhbHVlVGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdxdW90YURpc3BsYXknLCBcInswfSVcIiwgdGhpcy5xdW90YVBlcmNlbnRhZ2VGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KE1hdGguZmxvb3IodXNlZFBlcmNlbnRhZ2UpKSk7XG5cdFx0XHRcdHF1b3RhVmFsdWVTdWZmaXgudGV4dENvbnRlbnQgPSBpc0NvbXBhY3Rcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdxdW90YUxhYmVsVXNlZCcsIFwiezB9IHVzZWRcIiwgbGFiZWwpXG5cdFx0XHRcdFx0OiBgICR7bG9jYWxpemUoJ3F1b3RhVXNlZCcsIFwidXNlZFwiKX1gO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBzaG93Q3JlZGl0cyA9ICgpID0+IHtcblx0XHRcdGlmICh0eXBlb2YgY3VycmVudFF1b3RhICE9PSAnc3RyaW5nJyAmJiBjdXJyZW50UXVvdGEuZW50aXRsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgdG90YWwgPSBjdXJyZW50UXVvdGEuZW50aXRsZW1lbnQ7XG5cdFx0XHRcdGNvbnN0IHVzZWQgPSBjdXJyZW50UXVvdGEucXVvdGFSZW1haW5pbmcgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gdG90YWwgLSBjdXJyZW50UXVvdGEucXVvdGFSZW1haW5pbmdcblx0XHRcdFx0XHQ6IHRvdGFsICogKDEwMCAtIGN1cnJlbnRRdW90YS5wZXJjZW50UmVtYWluaW5nKSAvIDEwMDtcblx0XHRcdFx0Y29uc3QgdXNlZEZvcm1hdHRlZCA9IHRoaXMucXVvdGFDcmVkaXRzRm9ybWF0dGVyLnZhbHVlLmZvcm1hdCh1c2VkKTtcblx0XHRcdFx0Y29uc3QgdG90YWxGb3JtYXR0ZWQgPSB0aGlzLnF1b3RhQ3JlZGl0c0Zvcm1hdHRlci52YWx1ZS5mb3JtYXQodG90YWwpO1xuXHRcdFx0XHRxdW90YVZhbHVlVGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdxdW90YUNyZWRpdHNEaXNwbGF5JywgXCJ7MH0gLyB7MX1cIiwgdXNlZEZvcm1hdHRlZCwgdG90YWxGb3JtYXR0ZWQpO1xuXHRcdFx0XHRxdW90YVZhbHVlU3VmZml4LnRleHRDb250ZW50ID0gaXNDb21wYWN0XG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFMYWJlbFVzZWQnLCBcInswfSB1c2VkXCIsIGxhYmVsKVxuXHRcdFx0XHRcdDogYCAke2xvY2FsaXplKCdxdW90YVVzZWQnLCBcInVzZWRcIil9YDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgaG92ZXJUYXJnZXQgPSBpc0NvbXBhY3QgPyBxdW90YVZhbHVlVGV4dCA6IHF1b3RhUGVyY2VudGFnZTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyVGFyZ2V0LCBFdmVudFR5cGUuTU9VU0VfRU5URVIsICgpID0+IHsgaXNIb3ZlcmVkID0gdHJ1ZTsgc2hvd0NyZWRpdHMoKTsgfSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaG92ZXJUYXJnZXQsIEV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4geyBpc0hvdmVyZWQgPSBmYWxzZTsgc2hvd1BlcmNlbnRhZ2UoKTsgfSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaG92ZXJUYXJnZXQsIEV2ZW50VHlwZS5GT0NVUywgKCkgPT4geyBpc0hvdmVyZWQgPSB0cnVlOyBzaG93Q3JlZGl0cygpOyB9KSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihob3ZlclRhcmdldCwgRXZlbnRUeXBlLkJMVVIsICgpID0+IHsgaXNIb3ZlcmVkID0gZmFsc2U7IHNob3dQZXJjZW50YWdlKCk7IH0pKTtcblxuXHRcdGNvbnN0IHVwZGF0ZSA9IChxdW90YTogSVF1b3RhU25hcHNob3QgfCBzdHJpbmcpID0+IHtcblx0XHRcdGN1cnJlbnRRdW90YSA9IHF1b3RhO1xuXG5cdFx0XHRsZXQgdXNlZFBlcmNlbnRhZ2U6IG51bWJlcjtcblx0XHRcdGlmICh0eXBlb2YgcXVvdGEgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHVzZWRQZXJjZW50YWdlID0gMDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVzZWRQZXJjZW50YWdlID0gTWF0aC5tYXgoMCwgMTAwIC0gcXVvdGEucGVyY2VudFJlbWFpbmluZyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0hvdmVyZWQpIHtcblx0XHRcdFx0c2hvd0NyZWRpdHMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNob3dQZXJjZW50YWdlKCk7XG5cdFx0XHR9XG5cdFx0XHRxdW90YUJpdC5zdHlsZS53aWR0aCA9IGAke3VzZWRQZXJjZW50YWdlfSVgO1xuXHRcdH07XG5cblx0XHR1cGRhdGUocXVvdGEpO1xuXG5cdFx0cmV0dXJuIHVwZGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlR2xvYmFsUXVvdGFDYWxsb3V0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiAoKSA9PiB7IGNhbGxvdXRWaXNpYmxlOiBib29sZWFuOyBhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IGNhbGxvdXRJY29uID0gJCgnc3Bhbi5jYWxsb3V0LWljb24nKTtcblx0XHRjb25zdCBjYWxsb3V0VGV4dCA9ICQoJ3NwYW4uY2FsbG91dC10ZXh0Jyk7XG5cdFx0Y29uc3QgcXVvdGFDYWxsb3V0ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5xdW90YS1jYWxsb3V0JywgdW5kZWZpbmVkLCBjYWxsb3V0SWNvbiwgY2FsbG91dFRleHQpKTtcblx0XHRxdW90YUNhbGxvdXQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHF1b3RhcyA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0XHRjb25zdCBhZGRpdGlvbmFsVXNhZ2VFbmFibGVkID0gcXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPz8gZmFsc2U7XG5cdFx0XHRjb25zdCBpc0VudGVycHJpc2VVc2VyID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZSB8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5CdXNpbmVzcztcblx0XHRcdGNvbnN0IGlzVXNhZ2VCYXNlZEJpbGxpbmcgPSBxdW90YXMudXNhZ2VCYXNlZEJpbGxpbmcgPT09IHRydWU7XG5cblx0XHRcdC8vIE9ubHkgY2hhdCBxdW90YXMgZHJpdmUgdGhlIGdsb2JhbCBjYWxsb3V0LiBSZWFjaGluZyB0aGUgaW5saW5lXG5cdFx0XHQvLyBzdWdnZXN0aW9ucyAoY29tcGxldGlvbnMpIGxpbWl0IHBhdXNlcyBnaG9zdCB0ZXh0IG9ubHksIHNvIGl0IG11c3Rcblx0XHRcdC8vIG5vdCB0cmlnZ2VyIHRoZSBcIkNvcGlsb3QgaXMgcGF1c2VkXCIgbWVzc2FnZSByZXNlcnZlZCBmb3IgY2hhdCBsaW1pdHMuXG5cdFx0XHRjb25zdCBhbGxRdW90YXM6IElRdW90YVNuYXBzaG90W10gPSBbXTtcblx0XHRcdGlmIChxdW90YXMuY2hhdCAmJiAhcXVvdGFzLmNoYXQudW5saW1pdGVkKSB7IGFsbFF1b3Rhcy5wdXNoKHF1b3Rhcy5jaGF0KTsgfVxuXHRcdFx0aWYgKHF1b3Rhcy5wcmVtaXVtQ2hhdCAmJiAhcXVvdGFzLnByZW1pdW1DaGF0LnVubGltaXRlZCkgeyBhbGxRdW90YXMucHVzaChxdW90YXMucHJlbWl1bUNoYXQpOyB9XG5cblx0XHRcdGNvbnN0IG1heFVzZWRQZXJjZW50YWdlID0gYWxsUXVvdGFzLmxlbmd0aCA+IDAgPyBNYXRoLm1heCguLi5hbGxRdW90YXMubWFwKHEgPT4gTWF0aC5tYXgoMCwgMTAwIC0gcS5wZXJjZW50UmVtYWluaW5nKSkpIDogMDtcblx0XHRcdGNvbnN0IGlzUG9vbGVkUXVvdGFFeGhhdXN0ZWQgPSBxdW90YXMucHJlbWl1bUNoYXQ/LnVubGltaXRlZCAmJiBxdW90YXMucHJlbWl1bUNoYXQuaGFzUXVvdGEgPT09IGZhbHNlO1xuXG5cdFx0XHQvLyBCdXNpbmVzcy9FbnRlcnByaXNlOiBoYXNRdW90YSA9PT0gZmFsc2UgaXMgdGhlIGF1dGhvcml0YXRpdmUgc2lnbmFsXG5cdFx0XHQvLyB0aGF0IHRoZSBvcmcgaGFzIGJsb2NrZWQgdXNhZ2UsIHJlZ2FyZGxlc3Mgb2Ygb3ZlcmFnZXMgb3IgcmVtYWluaW5nIHF1b3RhLlxuXHRcdFx0aWYgKGlzRW50ZXJwcmlzZVVzZXIgJiYgaXNQb29sZWRRdW90YUV4aGF1c3RlZCkge1xuXHRcdFx0XHRxdW90YUNhbGxvdXQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRxdW90YUNhbGxvdXQuY2xhc3NOYW1lID0gJ3F1b3RhLWNhbGxvdXQgaW5mbyc7XG5cdFx0XHRcdGNhbGxvdXRJY29uLmNsYXNzTmFtZSA9IGBjYWxsb3V0LWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5pbmZvKX1gO1xuXHRcdFx0XHRjYWxsb3V0VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdxdW90YUJ1ZGdldEV4Y2VlZGVkRW50ZXJwcmlzZScsIFwiWW91ciBvcmdhbml6YXRpb24gb3IgZW50ZXJwcmlzZSBoYXMgZXhjZWVkZWQgaXRzIENvcGlsb3QgYnVkZ2V0LiBDb250YWN0IHlvdXIgYWRtaW4gdG8gcmVzdW1lIHVzYWdlLlwiKTtcblx0XHRcdH0gZWxzZSBpZiAobWF4VXNlZFBlcmNlbnRhZ2UgPj0gMTAwICYmIGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQpIHtcblx0XHRcdFx0cXVvdGFDYWxsb3V0LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0cXVvdGFDYWxsb3V0LmNsYXNzTmFtZSA9ICdxdW90YS1jYWxsb3V0IGluZm8nO1xuXHRcdFx0XHRjYWxsb3V0SWNvbi5jbGFzc05hbWUgPSBgY2FsbG91dC1pY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uaW5mbyl9YDtcblx0XHRcdFx0Y2FsbG91dFRleHQudGV4dENvbnRlbnQgPSBpc0VudGVycHJpc2VVc2VyXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFBZGRpdGlvbmFsVXNhZ2VBY3RpdmVFbnRlcnByaXNlJywgXCJDb3BpbG90IGhhcyBwYXVzZWQgYmVjYXVzZSB5b3VyIGxpbWl0cyBhcmUgcmVhY2hlZC4gUGxlYXNlIGNvbnRhY3QgeW91ciBhZG1pbiB0byBpbmNyZWFzZSB5b3VyIGxpbWl0cy5cIilcblx0XHRcdFx0XHQ6IGlzVXNhZ2VCYXNlZEJpbGxpbmdcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3F1b3RhQWRkaXRpb25hbFVzYWdlQWN0aXZlJywgXCJBZGRpdGlvbmFsIGJ1ZGdldCBpcyBjb25maWd1cmVkLiBVc2FnZSB3aWxsIGNvbnRpbnVlIHVudGlsIGxpbWl0cyByZXNldC5cIilcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3F1b3RhQnVkZ2V0QWN0aXZlJywgXCJQcmVtaXVtIHJlcXVlc3QgYnVkZ2V0IGlzIGNvbmZpZ3VyZWQuIFVzYWdlIHdpbGwgY29udGludWUgdW50aWwgbGltaXRzIHJlc2V0LlwiKTtcblx0XHRcdH0gZWxzZSBpZiAobWF4VXNlZFBlcmNlbnRhZ2UgPj0gNzUgJiYgbWF4VXNlZFBlcmNlbnRhZ2UgPCAxMDAgJiYgYWRkaXRpb25hbFVzYWdlRW5hYmxlZCkge1xuXHRcdFx0XHRxdW90YUNhbGxvdXQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRxdW90YUNhbGxvdXQuY2xhc3NOYW1lID0gJ3F1b3RhLWNhbGxvdXQgaW5mbyc7XG5cdFx0XHRcdGNhbGxvdXRJY29uLmNsYXNzTmFtZSA9IGBjYWxsb3V0LWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5pbmZvKX1gO1xuXHRcdFx0XHRjYWxsb3V0VGV4dC50ZXh0Q29udGVudCA9IGlzRW50ZXJwcmlzZVVzZXJcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdxdW90YUFkZGl0aW9uYWxVc2FnZUFwcHJvYWNoaW5nRW50ZXJwcmlzZScsIFwiQ29waWxvdCB3aWxsIHBhdXNlIHdoZW4geW91ciBsaW1pdHMgYXJlIHJlYWNoZWQuIFBsZWFzZSBjb250YWN0IHlvdXIgYWRtaW4gdG8gaW5jcmVhc2UgeW91ciBsaW1pdHMuXCIpXG5cdFx0XHRcdFx0OiBpc1VzYWdlQmFzZWRCaWxsaW5nXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdxdW90YUFkZGl0aW9uYWxVc2FnZUFwcHJvYWNoaW5nJywgXCJPbmNlIHRoZSBsaW1pdCBpcyByZWFjaGVkLCBhZGRpdGlvbmFsIGJ1ZGdldCB3aWxsIGJlIHVzZWQuXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdxdW90YUJ1ZGdldEFwcHJvYWNoaW5nJywgXCJPbmNlIHRoZSBsaW1pdCBpcyByZWFjaGVkLCBwcmVtaXVtIHJlcXVlc3QgYnVkZ2V0IHdpbGwgYmUgdXNlZC5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKChtYXhVc2VkUGVyY2VudGFnZSA+PSAxMDAgfHwgaXNQb29sZWRRdW90YUV4aGF1c3RlZCkgJiYgIWFkZGl0aW9uYWxVc2FnZUVuYWJsZWQpIHtcblx0XHRcdFx0cXVvdGFDYWxsb3V0LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0cXVvdGFDYWxsb3V0LmNsYXNzTmFtZSA9ICdxdW90YS1jYWxsb3V0IGluZm8nO1xuXHRcdFx0XHRjYWxsb3V0SWNvbi5jbGFzc05hbWUgPSBgY2FsbG91dC1pY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uaW5mbyl9YDtcblx0XHRcdFx0Y2FsbG91dFRleHQudGV4dENvbnRlbnQgPSBpc0VudGVycHJpc2VVc2VyXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgncXVvdGFQYXVzZWRFbnRlcnByaXNlJywgXCJDb3BpbG90IGlzIHBhdXNlZCB1bnRpbCB0aGUgbGltaXQgcmVzZXRzLiBDb250YWN0IHlvdXIgYWRtaW5pc3RyYXRvciBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdxdW90YVBhdXNlZCcsIFwiQ29waWxvdCBpcyBwYXVzZWQgdW50aWwgdGhlIGxpbWl0IHJlc2V0cy5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKG1heFVzZWRQZXJjZW50YWdlID49IDc1ICYmICFhZGRpdGlvbmFsVXNhZ2VFbmFibGVkKSB7XG5cdFx0XHRcdHF1b3RhQ2FsbG91dC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHF1b3RhQ2FsbG91dC5jbGFzc05hbWUgPSAncXVvdGEtY2FsbG91dCBpbmZvJztcblx0XHRcdFx0Y2FsbG91dEljb24uY2xhc3NOYW1lID0gYGNhbGxvdXQtaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmluZm8pfWA7XG5cdFx0XHRcdGNhbGxvdXRUZXh0LnRleHRDb250ZW50ID0gaXNFbnRlcnByaXNlVXNlclxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3F1b3RhV2FybmluZ0VudGVycHJpc2UnLCBcIkNvcGlsb3Qgd2lsbCBwYXVzZSB3aGVuIHRoZSBsaW1pdCBpcyByZWFjaGVkLiBDb250YWN0IHlvdXIgYWRtaW5pc3RyYXRvciBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdxdW90YVdhcm5pbmcnLCBcIkNvcGlsb3Qgd2lsbCBwYXVzZSB3aGVuIHRoZSBsaW1pdCBpcyByZWFjaGVkLlwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHF1b3RhQ2FsbG91dC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBjYWxsb3V0VmlzaWJsZTogcXVvdGFDYWxsb3V0LnN0eWxlLmRpc3BsYXkgIT09ICdub25lJywgYWRkaXRpb25hbFVzYWdlRW5hYmxlZCB9O1xuXHRcdH07XG5cblx0XHR1cGRhdGUoKTtcblxuXHRcdHJldHVybiB1cGRhdGU7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNldHRpbmdzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlSWQgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQ7XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnZGl2LnNldHRpbmdzJykpO1xuXG5cdFx0Ly8gLS0tIElubGluZSBTdWdnZXN0aW9uc1xuXHRcdHtcblx0XHRcdGNvbnN0IGdsb2JhbFNldHRpbmcgPSBhcHBlbmQoc2V0dGluZ3MsICQoJ2Rpdi5zZXR0aW5nJykpO1xuXHRcdFx0dGhpcy5jcmVhdGVJbmxpbmVTdWdnZXN0aW9uc1NldHRpbmcoZ2xvYmFsU2V0dGluZywgbG9jYWxpemUoJ3NldHRpbmdzLmNvZGVDb21wbGV0aW9ucy5hbGxGaWxlcycsIFwiR2hvc3QgdGV4dCBzdWdnZXN0aW9uc1wiKSwgJyonKTtcblxuXHRcdFx0Y29uc3Qgb3ZlcnJpZGRlbkhpbnQgPSBnbG9iYWxTZXR0aW5nLmFwcGVuZENoaWxkKCQoJ3NwYW4uc2V0dGluZy1vdmVycmlkZGVuJykpO1xuXHRcdFx0Y29uc3QgdXBkYXRlT3ZlcnJpZGRlbkhpbnQgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9iaiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmcpO1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkVmFsdWUgPSBtb2RlSWQgPyB0aGlzLmZpbmRDb25maWd1cmVkQ29tcGxldGlvbnNWYWx1ZShtb2RlSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBoYXNPdmVycmlkZSA9IG1vZGVJZCAmJiBjb25maWd1cmVkVmFsdWUgJiYgaXNPYmplY3Qob2JqKSAmJiBCb29sZWFuKGNvbmZpZ3VyZWRWYWx1ZS52YWx1ZVttb2RlSWRdKSAhPT0gQm9vbGVhbihvYmpbJyonXSk7XG5cdFx0XHRcdG92ZXJyaWRkZW5IaW50LnRleHRDb250ZW50ID0gaGFzT3ZlcnJpZGUgPyBsb2NhbGl6ZSgnc2V0dGluZ3Mub3ZlcnJpZGRlbicsIFwiKG92ZXJyaWRkZW4pXCIpIDogJyc7XG5cdFx0XHR9O1xuXHRcdFx0dXBkYXRlT3ZlcnJpZGRlbkhpbnQoKTtcblxuXHRcdFx0aWYgKG1vZGVJZCkge1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZVNldHRpbmcgPSBhcHBlbmQoc2V0dGluZ3MsICQoJ2Rpdi5zZXR0aW5nJykpO1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZU5hbWUgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobW9kZUlkKSA/PyBtb2RlSWQ7XG5cdFx0XHRcdHRoaXMuY3JlYXRlVHJpU3RhdGVMYW5ndWFnZVNldHRpbmcobGFuZ3VhZ2VTZXR0aW5nLCBsb2NhbGl6ZSgnc2V0dGluZ3MuY29kZUNvbXBsZXRpb25zLmxhbmd1YWdlJywgXCJHaG9zdCB0ZXh0IHN1Z2dlc3Rpb25zIGZvciB7MH1cIiwgbGFuZ3VhZ2VOYW1lKSwgbW9kZUlkLCB1cGRhdGVPdmVycmlkZGVuSGludCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gLS0tIE5leHQgZWRpdCBzdWdnZXN0aW9uc1xuXHRcdHtcblx0XHRcdGNvbnN0IHNldHRpbmcgPSBhcHBlbmQoc2V0dGluZ3MsICQoJ2Rpdi5zZXR0aW5nJykpO1xuXHRcdFx0dGhpcy5jcmVhdGVOZXh0RWRpdFN1Z2dlc3Rpb25zU2V0dGluZyhzZXR0aW5nLCBsb2NhbGl6ZSgnc2V0dGluZ3MubmV4dEVkaXRTdWdnZXN0aW9ucycsIFwiTmV4dCBlZGl0IHN1Z2dlc3Rpb25zXCIpLCB0aGlzLmdldENvbXBsZXRpb25zU2V0dGluZ0FjY2Vzc29yKG1vZGVJZCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2V0dGluZyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBzZXR0aW5nSWRzVG9SZUV2YWx1YXRlOiBzdHJpbmdbXSwgbGFiZWw6IHN0cmluZywgYWNjZXNzb3I6IElTZXR0aW5nc0FjY2Vzc29yKTogQ2hlY2tib3gge1xuXHRcdGNvbnN0IGNoZWNrYm94ID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBDaGVja2JveChsYWJlbCwgQm9vbGVhbihhY2Nlc3Nvci5yZWFkU2V0dGluZygpKSwgeyAuLi5kZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdGNvbnN0IHNldHRpbmdMYWJlbCA9IGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc2V0dGluZy1sYWJlbCcsIHVuZGVmaW5lZCwgbGFiZWwpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoR2VzdHVyZS5hZGRUYXJnZXQoc2V0dGluZ0xhYmVsKSk7XG5cdFx0W0V2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXS5mb3JFYWNoKGV2ZW50VHlwZSA9PiB7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNldHRpbmdMYWJlbCwgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0aWYgKGNoZWNrYm94Py5lbmFibGVkKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0XHRcdGNoZWNrYm94LmNoZWNrZWQgPSAhY2hlY2tib3guY2hlY2tlZDtcblx0XHRcdFx0XHRhY2Nlc3Nvci53cml0ZVNldHRpbmcoY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHRcdFx0Y2hlY2tib3guZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGFjY2Vzc29yLndyaXRlU2V0dGluZyhjaGVja2JveC5jaGVja2VkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoc2V0dGluZ0lkc1RvUmVFdmFsdWF0ZS5zb21lKGlkID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oaWQpKSkge1xuXHRcdFx0XHRjaGVja2JveC5jaGVja2VkID0gQm9vbGVhbihhY2Nlc3Nvci5yZWFkU2V0dGluZygpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIXRoaXMuY2FuVXNlQ2hhdCgpKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdGNoZWNrYm94LmRpc2FibGUoKTtcblx0XHRcdGNoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hlY2tib3g7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUlubGluZVN1Z2dlc3Rpb25zU2V0dGluZyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBtb2RlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuY3JlYXRlU2V0dGluZyhjb250YWluZXIsIFtkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nXSwgbGFiZWwsIHRoaXMuZ2V0Q29tcGxldGlvbnNTZXR0aW5nQWNjZXNzb3IobW9kZUlkKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRyaVN0YXRlTGFuZ3VhZ2VTZXR0aW5nKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIG1vZGVJZDogc3RyaW5nLCBvblN0YXRlQ2hhbmdlOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2V0dGluZ0lkID0gZGVmYXVsdENoYXQuY29tcGxldGlvbnNFbmFibGVtZW50U2V0dGluZztcblxuXHRcdGNvbnN0IGdldFN0YXRlID0gKCk6IGJvb2xlYW4gfCAnbWl4ZWQnID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRWYWx1ZSA9IHRoaXMuZmluZENvbmZpZ3VyZWRDb21wbGV0aW9uc1ZhbHVlKG1vZGVJZCk7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJlZFZhbHVlID8gQm9vbGVhbihjb25maWd1cmVkVmFsdWUudmFsdWVbbW9kZUlkXSkgOiAnbWl4ZWQnO1xuXHRcdH07XG5cblx0XHRsZXQgcmVxdWVzdGVkU3RhdGUgPSBnZXRTdGF0ZSgpO1xuXHRcdGxldCBwZW5kaW5nV3JpdGVzID0gMDtcblx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgVHJpU3RhdGVDaGVja2JveChsYWJlbCwgcmVxdWVzdGVkU3RhdGUsIHsgLi4uZGVmYXVsdENoZWNrYm94U3R5bGVzIH0pKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRjb25zdCBzZXR0aW5nTGFiZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNldHRpbmctbGFiZWwnLCB1bmRlZmluZWQsIGxhYmVsKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHNldHRpbmdMYWJlbCkpO1xuXHRcdGNvbnN0IHdyaXRlU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRcdGNvbnN0IHJlbmRlclN0YXRlID0gKHN0YXRlOiBib29sZWFuIHwgJ21peGVkJykgPT4ge1xuXHRcdFx0cmVxdWVzdGVkU3RhdGUgPSBzdGF0ZTtcblx0XHRcdGNoZWNrYm94LmNoZWNrZWQgPSBzdGF0ZTtcblx0XHRcdGNoZWNrYm94LmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCBzdGF0ZSA9PT0gJ21peGVkJyA/ICdtaXhlZCcgOiBTdHJpbmcoc3RhdGUpKTtcblx0XHR9O1xuXHRcdGNvbnN0IGdldE5leHRTdGF0ZSA9ICgpID0+IHJlcXVlc3RlZFN0YXRlID09PSB0cnVlID8gZmFsc2UgOiByZXF1ZXN0ZWRTdGF0ZSA9PT0gZmFsc2UgPyAnbWl4ZWQnIDogdHJ1ZTtcblxuXHRcdGNvbnN0IHdyaXRlU3RhdGUgPSBhc3luYyAoc3RhdGU6IGJvb2xlYW4gfCAnbWl4ZWQnKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkVmFsdWUgPSB0aGlzLmZpbmRDb25maWd1cmVkQ29tcGxldGlvbnNWYWx1ZShtb2RlSWQpID8/IHRoaXMuZmluZENvbmZpZ3VyZWRDb21wbGV0aW9uc1ZhbHVlKCk7XG5cdFx0XHRpZiAoc3RhdGUgPT09ICdtaXhlZCcpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25maWd1cmVkVmFsdWUgb2YgdGhpcy5maW5kQ29uZmlndXJlZENvbXBsZXRpb25zVmFsdWVzKG1vZGVJZCkpIHtcblx0XHRcdFx0XHRjb25zdCB7IFttb2RlSWRdOiBfLCAuLi5yZXN0IH0gPSBjb25maWd1cmVkVmFsdWUudmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShzZXR0aW5nSWQsIHJlc3QsIGNvbmZpZ3VyZWRWYWx1ZS50YXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHsgLi4uY29uZmlndXJlZFZhbHVlPy52YWx1ZSwgW21vZGVJZF06IHN0YXRlIH07XG5cdFx0XHRcdGlmIChjb25maWd1cmVkVmFsdWUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHNldHRpbmdJZCwgdmFsdWUsIGNvbmZpZ3VyZWRWYWx1ZS50YXJnZXQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZ0lkLCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IGlzQ29tcGxldGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIG1vZGVJZCk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0U2V0dGluZ0NoYW5nZWRFdmVudCwgQ2hhdFNldHRpbmdDaGFuZ2VkQ2xhc3NpZmljYXRpb24+KCdjaGF0U3RhdHVzLnNldHRpbmdDaGFuZ2VkJywge1xuXHRcdFx0XHRzZXR0aW5nSWRlbnRpZmllcjogc2V0dGluZ0lkLFxuXHRcdFx0XHRzZXR0aW5nTW9kZTogbW9kZUlkLFxuXHRcdFx0XHRzZXR0aW5nRW5hYmxlbWVudDogZW5hYmxlZCA/ICdlbmFibGVkJyA6ICdkaXNhYmxlZCdcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVxdWVzdFN0YXRlQ2hhbmdlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBnZXROZXh0U3RhdGUoKTtcblx0XHRcdHJlbmRlclN0YXRlKHN0YXRlKTtcblx0XHRcdHBlbmRpbmdXcml0ZXMrKztcblx0XHRcdHZvaWQgd3JpdGVTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHdyaXRlU3RhdGUoc3RhdGUpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHBlbmRpbmdXcml0ZXMtLTtcblx0XHRcdFx0fVxuXHRcdFx0fSkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRpZiAocGVuZGluZ1dyaXRlcyA9PT0gMCkge1xuXHRcdFx0XHRcdHJlbmRlclN0YXRlKGdldFN0YXRlKCkpO1xuXHRcdFx0XHRcdG9uU3RhdGVDaGFuZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRyZW5kZXJTdGF0ZShyZXF1ZXN0ZWRTdGF0ZSk7XG5cblx0XHRbRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdLmZvckVhY2goZXZlbnRUeXBlID0+IHtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2V0dGluZ0xhYmVsLCBldmVudFR5cGUsIGUgPT4ge1xuXHRcdFx0XHRpZiAoY2hlY2tib3g/LmVuYWJsZWQpIHtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdHJlcXVlc3RTdGF0ZUNoYW5nZSgpO1xuXHRcdFx0XHRcdGNoZWNrYm94LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChjaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRyZW5kZXJTdGF0ZShyZXF1ZXN0ZWRTdGF0ZSk7XG5cdFx0XHRyZXF1ZXN0U3RhdGVDaGFuZ2UoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihzZXR0aW5nSWQpKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gZ2V0U3RhdGUoKTtcblx0XHRcdFx0aWYgKHBlbmRpbmdXcml0ZXMgPT09IDAgfHwgc3RhdGUgPT09IHJlcXVlc3RlZFN0YXRlKSB7XG5cdFx0XHRcdFx0cmVuZGVyU3RhdGUoc3RhdGUpO1xuXHRcdFx0XHRcdG9uU3RhdGVDaGFuZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICghdGhpcy5jYW5Vc2VDaGF0KCkpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdFx0Y2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdFx0Y2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmluZENvbmZpZ3VyZWRDb21wbGV0aW9uc1ZhbHVlKG1vZGVJZD86IHN0cmluZyk6IHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0OyB2YWx1ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZmluZENvbmZpZ3VyZWRDb21wbGV0aW9uc1ZhbHVlcyhtb2RlSWQpWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kQ29uZmlndXJlZENvbXBsZXRpb25zVmFsdWVzKG1vZGVJZD86IHN0cmluZyk6IHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0OyB2YWx1ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gfVtdIHtcblx0XHRjb25zdCBpbnNwZWN0ZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmcpO1xuXHRcdGNvbnN0IHJlc3VsdDogeyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQ7IHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRhcmdldCBvZiBjb21wbGV0aW9uc0NvbmZpZ3VyYXRpb25UYXJnZXRzKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGdldENvbmZpZ1ZhbHVlSW5UYXJnZXQoaW5zcGVjdGVkLCB0YXJnZXQpO1xuXHRcdFx0aWYgKGlzT2JqZWN0KHZhbHVlKSAmJiAoIW1vZGVJZCB8fCBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIG1vZGVJZCkpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgdGFyZ2V0LCB2YWx1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29tcGxldGlvbnNTZXR0aW5nQWNjZXNzb3IobW9kZUlkID0gJyonKTogSVNldHRpbmdzQWNjZXNzb3Ige1xuXHRcdGNvbnN0IHNldHRpbmdJZCA9IGRlZmF1bHRDaGF0LmNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmc7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVhZFNldHRpbmc6ICgpID0+IGlzQ29tcGxldGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIG1vZGVJZCksXG5cdFx0XHR3cml0ZVNldHRpbmc6ICh2YWx1ZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0U2V0dGluZ0NoYW5nZWRFdmVudCwgQ2hhdFNldHRpbmdDaGFuZ2VkQ2xhc3NpZmljYXRpb24+KCdjaGF0U3RhdHVzLnNldHRpbmdDaGFuZ2VkJywge1xuXHRcdFx0XHRcdHNldHRpbmdJZGVudGlmaWVyOiBzZXR0aW5nSWQsXG5cdFx0XHRcdFx0c2V0dGluZ01vZGU6IG1vZGVJZCxcblx0XHRcdFx0XHRzZXR0aW5nRW5hYmxlbWVudDogdmFsdWUgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGxldCByZXN1bHQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihzZXR0aW5nSWQpO1xuXHRcdFx0XHRpZiAoIWlzT2JqZWN0KHJlc3VsdCkpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZ0lkLCB7IC4uLnJlc3VsdCwgW21vZGVJZF06IHZhbHVlIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU5leHRFZGl0U3VnZ2VzdGlvbnNTZXR0aW5nKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIGNvbXBsZXRpb25zU2V0dGluZ0FjY2Vzc29yOiBJU2V0dGluZ3NBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IG5lc1NldHRpbmdJZCA9IGRlZmF1bHRDaGF0Lm5leHRFZGl0U3VnZ2VzdGlvbnNTZXR0aW5nO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zU2V0dGluZ0lkID0gZGVmYXVsdENoYXQuY29tcGxldGlvbnNFbmFibGVtZW50U2V0dGluZztcblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXG5cdFx0Y29uc3QgY2hlY2tib3ggPSB0aGlzLmNyZWF0ZVNldHRpbmcoY29udGFpbmVyLCBbbmVzU2V0dGluZ0lkLCBjb21wbGV0aW9uc1NldHRpbmdJZF0sIGxhYmVsLCB7XG5cdFx0XHRyZWFkU2V0dGluZzogKCkgPT4gY29tcGxldGlvbnNTZXR0aW5nQWNjZXNzb3IucmVhZFNldHRpbmcoKSAmJiB0aGlzLnRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KHJlc291cmNlLCBuZXNTZXR0aW5nSWQpLFxuXHRcdFx0d3JpdGVTZXR0aW5nOiAodmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFNldHRpbmdDaGFuZ2VkRXZlbnQsIENoYXRTZXR0aW5nQ2hhbmdlZENsYXNzaWZpY2F0aW9uPignY2hhdFN0YXR1cy5zZXR0aW5nQ2hhbmdlZCcsIHtcblx0XHRcdFx0XHRzZXR0aW5nSWRlbnRpZmllcjogbmVzU2V0dGluZ0lkLFxuXHRcdFx0XHRcdHNldHRpbmdFbmFibGVtZW50OiB2YWx1ZSA/ICdlbmFibGVkJyA6ICdkaXNhYmxlZCdcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUocmVzb3VyY2UsIG5lc1NldHRpbmdJZCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gZW5hYmxlbWVudCBvZiBORVMgZGVwZW5kcyBvbiBjb21wbGV0aW9ucyBzZXR0aW5nXG5cdFx0Ly8gc28gd2UgaGF2ZSB0byB1cGRhdGUgb3VyIGNoZWNrYm94IHN0YXRlIGFjY29yZGluZ2x5XG5cdFx0aWYgKCFjb21wbGV0aW9uc1NldHRpbmdBY2Nlc3Nvci5yZWFkU2V0dGluZygpKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdGNoZWNrYm94LmRpc2FibGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihjb21wbGV0aW9uc1NldHRpbmdJZCkpIHtcblx0XHRcdFx0aWYgKGNvbXBsZXRpb25zU2V0dGluZ0FjY2Vzc29yLnJlYWRTZXR0aW5nKCkgJiYgdGhpcy5jYW5Vc2VDaGF0KCkpIHtcblx0XHRcdFx0XHRjaGVja2JveC5lbmFibGUoKTtcblx0XHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZGlzYWJsZWQnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbXBsZXRpb25zU25vb3plKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpc0VuYWJsZWQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21wbGV0aW9uc0VuYWJsZWQgPSBpc0NvbXBsZXRpb25zRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zRW5hYmxlZEFjdGl2ZUxhbmd1YWdlID0gaXNDb21wbGV0aW9uc0VuYWJsZWQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JMYW5ndWFnZUlkKTtcblx0XHRcdHJldHVybiBjb21wbGV0aW9uc0VuYWJsZWQgfHwgY29tcGxldGlvbnNFbmFibGVkQWN0aXZlTGFuZ3VhZ2U7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQnV0dG9uKGNvbnRhaW5lciwgeyBkaXNhYmxlZDogIWlzRW5hYmxlZCgpLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBob3ZlckRlbGVnYXRlOiBuYXRpdmVIb3ZlckRlbGVnYXRlLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgdGltZXJEaXNwbGF5ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ3NwYW4uc25vb3plLWxhYmVsJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJ2Rpdi5zbm9vemUtYWN0aW9uLWJhcicpKTtcblx0XHRjb25zdCB0b29sYmFyID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBBY3Rpb25CYXIoYWN0aW9uQmFyLCB7IGhvdmVyRGVsZWdhdGU6IG5hdGl2ZUhvdmVyRGVsZWdhdGUgfSkpO1xuXHRcdGNvbnN0IGNhbmNlbEFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jYW5jZWxTbm9vemVTdGF0dXNCYXJMaW5rJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2FuY2VsU25vb3plJywgXCJDYW5jZWwgU25vb3plXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmlubGluZUNvbXBsZXRpb25zU2VydmljZS5jYW5jZWxTbm9vemUoKSxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zdG9wQ2lyY2xlKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdXBkYXRlID0gKGlzRW5hYmxlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWlzRW5hYmxlZCk7XG5cdFx0XHR0b29sYmFyLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IHRpbWVMZWZ0TXMgPSB0aGlzLmlubGluZUNvbXBsZXRpb25zU2VydmljZS5zbm9vemVUaW1lTGVmdDtcblx0XHRcdGlmICghaXNFbmFibGVkIHx8IHRpbWVMZWZ0TXMgPD0gMCkge1xuXHRcdFx0XHR0aW1lckRpc3BsYXkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY29tcGxldGlvbnMuc25vb3plNW1pbnV0ZXNUaXRsZScsIFwiSGlkZSBzdWdnZXN0aW9ucyBmb3IgNSBtaW5cIik7XG5cdFx0XHRcdHRpbWVyRGlzcGxheS50aXRsZSA9ICcnO1xuXHRcdFx0XHRidXR0b24ubGFiZWwgPSBsYWJlbDtcblx0XHRcdFx0YnV0dG9uLnNldFRpdGxlKGxvY2FsaXplKCdjb21wbGV0aW9ucy5zbm9vemU1bWludXRlcycsIFwiSGlkZSBpbmxpbmUgc3VnZ2VzdGlvbnMgZm9yIDUgbWluXCIpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRpbWVMZWZ0U2Vjb25kcyA9IE1hdGguY2VpbCh0aW1lTGVmdE1zIC8gMTAwMCk7XG5cdFx0XHRjb25zdCBtaW51dGVzID0gTWF0aC5mbG9vcih0aW1lTGVmdFNlY29uZHMgLyA2MCk7XG5cdFx0XHRjb25zdCBzZWNvbmRzID0gdGltZUxlZnRTZWNvbmRzICUgNjA7XG5cblx0XHRcdHRpbWVyRGlzcGxheS50ZXh0Q29udGVudCA9IGAke21pbnV0ZXN9OiR7c2Vjb25kcyA8IDEwID8gJzAnIDogJyd9JHtzZWNvbmRzfSAke2xvY2FsaXplKCdjb21wbGV0aW9ucy5yZW1haW5pbmdUaW1lJywgXCJyZW1haW5pbmdcIil9YDtcblx0XHRcdHRpbWVyRGlzcGxheS50aXRsZSA9IGxvY2FsaXplKCdjb21wbGV0aW9ucy5zbm9vemVUaW1lRGVzY3JpcHRpb24nLCBcIklubGluZSBzdWdnZXN0aW9ucyBhcmUgaGlkZGVuIGZvciB0aGUgcmVtYWluaW5nIGR1cmF0aW9uXCIpO1xuXHRcdFx0YnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NvbXBsZXRpb25zLnBsdXM1bWluJywgXCIrNSBtaW5cIik7XG5cdFx0XHRidXR0b24uc2V0VGl0bGUobG9jYWxpemUoJ2NvbXBsZXRpb25zLnNub296ZUFkZGl0aW9uYWw1bWludXRlcycsIFwiU25vb3plIGFkZGl0aW9uYWwgNSBtaW5cIikpO1xuXHRcdFx0dG9vbGJhci5wdXNoKFtjYW5jZWxBY3Rpb25dLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHQvLyBVcGRhdGUgZXZlcnkgc2Vjb25kIGlmIHRoZXJlJ3MgdGltZSByZW1haW5pbmdcblx0XHRjb25zdCB0aW1lckRpc3Bvc2FibGVzID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0ZnVuY3Rpb24gdXBkYXRlSW50ZXJ2YWxUaW1lcigpIHtcblx0XHRcdHRpbWVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBpc0VuYWJsZWQoKTtcblxuXHRcdFx0aWYgKHVwZGF0ZShlbmFibGVkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRpbWVyRGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChcblx0XHRcdFx0Z2V0V2luZG93KGNvbnRhaW5lciksXG5cdFx0XHRcdCgpID0+IHVwZGF0ZShlbmFibGVkKSxcblx0XHRcdFx0MTAwMFxuXHRcdFx0KSk7XG5cdFx0fVxuXHRcdHVwZGF0ZUludGVydmFsVGltZXIoKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLmlubGluZUNvbXBsZXRpb25zU2VydmljZS5zbm9vemUoKTtcblx0XHRcdHVwZGF0ZShpc0VuYWJsZWQoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZGVmYXVsdENoYXQuY29tcGxldGlvbnNFbmFibGVtZW50U2V0dGluZykpIHtcblx0XHRcdFx0YnV0dG9uLmVuYWJsZWQgPSBpc0VuYWJsZWQoKTtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZUludGVydmFsVGltZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VJc1Nub296aW5nKCgpID0+IHtcblx0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eUIsT0FBTztBQUNyQyxhQUFPLFVBQVUsQ0FBQztBQUFBLElBQ25CLENBQUMsQ0FBQztBQUVGLFNBQUssT0FBTyxJQUFJLEtBQUsscUJBQXFCLHlCQUF5QixPQUFLO0FBQ3ZFLFVBQUksRUFBRSxxQkFBcUIsWUFBWSw0QkFBNEIsR0FBRztBQUNyRSxlQUFPLFVBQVUsVUFBVTtBQUFBLE1BQzVCO0FBQ0EsMEJBQW9CO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxPQUFPLElBQUksS0FBSyx5QkFBeUIsc0JBQXNCLE1BQU07QUFDekUsMEJBQW9CO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNEO0FBenFDYSxvQkFFWSwrQkFBK0I7QUFGM0Msc0JBQU47QUFBQSxFQWNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBOUJVOyIsCiAgIm5hbWVzIjogWyJjaGF0UXVvdGEiLCAicHJlbWl1bUNoYXRRdW90YSIsICJjb21wbGV0aW9uc1F1b3RhIiwgInF1b3RhIiwgImNvbmZpZ3VyZWRWYWx1ZSIsICJpc0VuYWJsZWQiXQp9Cg==
