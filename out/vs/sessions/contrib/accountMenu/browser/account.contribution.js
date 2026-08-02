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
import "../../../browser/media/sidebarActionButton.css";
import "./media/accountWidget.css";
import "./media/accountTitleBarWidget.css";
import "../../../../workbench/contrib/chat/browser/chatStatus/media/chatStatus.css";
import Severity from "../../../../base/common/severity.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuRegistry, registerAction2, IMenuService } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { appendUpdateMenuItems as registerUpdateMenuItems } from "../../../../workbench/contrib/update/browser/update.js";
import { Menus } from "../../../browser/menus.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { $, append, disposableWindowInterval, getDomNodePagePosition } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Separator } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { registerUpdateTitleBarMenuPlacement } from "../../../../workbench/contrib/update/browser/updateTitleBarEntry.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../workbench/services/chat/common/chatEntitlementService.js";
import { ChatStatusDashboard } from "../../../../workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { getAccountProfileImageUrl, getAccountTitleBarBadgeKey, getAccountTitleBarState, resolveAccountInfo } from "../../../browser/accountTitleBarState.js";
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from "../../../common/contextkeys.js";
import { IsAuxiliaryWindowContext } from "../../../../workbench/common/contextkeys.js";
import { IAuthenticationAccessService } from "../../../../workbench/services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationUsageService } from "../../../../workbench/services/authentication/browser/authenticationUsageService.js";
import { IAuthenticationService } from "../../../../workbench/services/authentication/common/authentication.js";
import { IChatDashboardService } from "../../../browser/chatDashboardService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
const AccountMenu = Menus.AccountMenu;
const SessionsTitleBarAccountWidgetAction = "sessions.action.titleBarAccountWidget";
const SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH = 360;
const PERSONALIZE_ACTION_IDS = [
  "workbench.action.openSettings"
];
const SIGN_OUT_ACTION_ID = "workbench.action.agenticSignOut";
const SIGN_IN_ACTION_ID = "workbench.action.agenticSignIn";
registerUpdateTitleBarMenuPlacement(Menus.TitleBarSessionMenu, {
  when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
  group: "navigation",
  order: -1
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.agenticSignIn",
      title: localize2("signIn", "Sign In"),
      icon: Codicon.signIn,
      menu: {
        id: AccountMenu,
        when: ContextKeyExpr.notEquals("defaultAccountStatus", "available"),
        group: "1_account",
        order: 1
      }
    });
  }
  async run(accessor) {
    const defaultAccountService = accessor.get(IDefaultAccountService);
    await defaultAccountService.signIn();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.agenticSignOut",
      title: localize2("signOut", "Sign Out"),
      icon: Codicon.signOut,
      menu: {
        id: AccountMenu,
        when: ContextKeyExpr.equals("defaultAccountStatus", "available"),
        group: "1_account",
        order: 1
      }
    });
  }
  async run(accessor) {
    const defaultAccountService = accessor.get(IDefaultAccountService);
    const dialogService = accessor.get(IDialogService);
    const authenticationService = accessor.get(IAuthenticationService);
    const authenticationUsageService = accessor.get(IAuthenticationUsageService);
    const authenticationAccessService = accessor.get(IAuthenticationAccessService);
    const defaultAccount = await defaultAccountService.getDefaultAccount();
    if (!defaultAccount) {
      return;
    }
    const providerId = defaultAccount.authenticationProvider.id;
    const accountLabel = defaultAccount.accountName;
    const { confirmed } = await dialogService.confirm({
      type: Severity.Info,
      message: localize("agenticSignOutMessage", "Sign out of the Agents window?"),
      detail: localize("agenticSignOutDetail", "This will sign out '{0}' from the Agents window.", accountLabel),
      primaryButton: localize({ key: "agenticSignOutButton", comment: ["&& denotes a mnemonic"] }, "&&Sign Out")
    });
    if (!confirmed) {
      return;
    }
    const allSessions = await authenticationService.getSessions(providerId);
    const sessions = allSessions.filter((session) => session.account.label === accountLabel);
    await Promise.all(sessions.map((session) => authenticationService.removeSession(providerId, session.id)));
    authenticationUsageService.removeAccountUsage(providerId, accountLabel);
    authenticationAccessService.removeAllowedExtensions(providerId, accountLabel);
  }
});
MenuRegistry.appendMenuItem(AccountMenu, {
  command: {
    id: "workbench.action.openSettings",
    title: localize("settings", "Settings"),
    icon: Codicon.settingsGear
  },
  when: IsPhoneLayoutContext.negate(),
  group: "2_settings",
  order: 1
});
registerUpdateMenuItems(AccountMenu, "3_updates");
let TitleBarAccountWidget = class extends BaseActionViewItem {
  constructor(action, options, defaultAccountService, authenticationService, menuService, contextKeyService, hoverService, instantiationService, chatEntitlementService) {
    super(void 0, action, options);
    this.defaultAccountService = defaultAccountService;
    this.authenticationService = authenticationService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.chatEntitlementService = chatEntitlementService;
    this.isAccountLoading = true;
    this.accountRequestCounter = 0;
    this.avatarRequestCounter = 0;
    this.isMenuVisible = false;
    this.copilotDashboardStore = this._register(new MutableDisposable());
    this.clickPanelDisposable = this._register(new MutableDisposable());
    this.avatarLoadDisposable = this._register(new MutableDisposable());
    this.lastState = getAccountTitleBarState({
      isAccountLoading: true,
      entitlement: this.chatEntitlementService.entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas
    });
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
    this._register(this.authenticationService.onDidChangeSessions(() => this.refreshAccount()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderState()));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderState()));
    this.refreshAccount();
  }
  setFocusable(_focusable) {
  }
  render(container) {
    super.render(container);
    this.container = container;
    container.classList.add("sessions-account-titlebar-widget");
    container.setAttribute("role", "button");
    container.tabIndex = 0;
    this.avatarElement = append(container, $("img.sessions-account-titlebar-widget-avatar", { alt: localize("accountAvatarAltFallback", "Account profile image"), draggable: "false" }));
    this.avatarElement.decoding = "async";
    this.avatarElement.referrerPolicy = "no-referrer";
    this.iconElement = append(container, $(".sessions-account-titlebar-widget-icon"));
    this.labelElement = append(container, $("span.sessions-account-titlebar-widget-label"));
    this.badgeElement = append(container, $("span.sessions-account-titlebar-widget-badge"));
    this.renderState();
  }
  onClick() {
    if (!this.container) {
      return;
    }
    this.showCombinedPanel();
  }
  async refreshAccount() {
    const requestId = ++this.accountRequestCounter;
    this.isAccountLoading = true;
    this.renderState();
    const info = await resolveAccountInfo(this.defaultAccountService, this.authenticationService);
    if (requestId !== this.accountRequestCounter || this._store.isDisposed) {
      return;
    }
    this.accountName = info?.accountName;
    this.accountProviderId = info?.accountProviderId;
    this.accountProviderLabel = info?.accountProviderLabel;
    this.isAccountLoading = false;
    this.refreshAvatar();
    this.renderState();
  }
  renderState() {
    if (!this.container || !this.avatarElement || !this.iconElement || !this.labelElement || !this.badgeElement) {
      return;
    }
    const entitlement = this.accountName && this.chatEntitlementService.entitlement === ChatEntitlement.Unknown ? ChatEntitlement.Unresolved : this.chatEntitlementService.entitlement;
    const state = getAccountTitleBarState({
      isAccountLoading: this.isAccountLoading,
      accountName: this.accountName,
      accountProviderLabel: this.accountProviderLabel,
      entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas
    });
    this.lastState = state;
    this.container.classList.remove("kind-default", "kind-accent", "kind-warning", "kind-prominent");
    this.container.classList.add(`kind-${state.kind}`);
    this.container.classList.toggle("menu-visible", this.isMenuVisible);
    this.container.setAttribute("aria-label", state.ariaLabel);
    const badgeKey = getAccountTitleBarBadgeKey(state);
    if (badgeKey !== this.lastBadgeKey) {
      this.lastBadgeKey = badgeKey;
      this.dismissedBadgeKey = void 0;
    }
    const shouldShowDotBadge = !!badgeKey && badgeKey !== this.dismissedBadgeKey;
    const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : void 0;
    const hasLoadedAvatar = !!loadedAvatarUrl;
    const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;
    this.avatarElement.classList.toggle("visible", hasLoadedAvatar);
    this.avatarElement.alt = this.getAvatarAltText(hasLoadedAvatar);
    if (hasLoadedAvatar) {
      if (this.avatarElement.src !== loadedAvatarUrl) {
        this.avatarElement.src = loadedAvatarUrl;
      }
    } else {
      this.avatarElement.removeAttribute("src");
    }
    this.iconElement.className = `sessions-account-titlebar-widget-icon ${ThemeIcon.asClassName(titleBarIcon)}`;
    this.iconElement.classList.toggle("hidden", hasLoadedAvatar);
    this.labelElement.textContent = "";
    this.badgeElement.textContent = "";
    this.badgeElement.classList.toggle("dot-badge", shouldShowDotBadge);
    this.badgeElement.classList.toggle("dot-badge-warning", shouldShowDotBadge && state.dotBadge === "warning");
    this.badgeElement.classList.toggle("dot-badge-error", shouldShowDotBadge && state.dotBadge === "error");
    this.badgeElement.style.display = shouldShowDotBadge ? "" : "none";
  }
  getAvatarAltText(hasLoadedAvatar) {
    if (hasLoadedAvatar && this.accountProviderId === "github" && this.accountName) {
      return localize("accountAvatarAlt", "GitHub profile image for {0}", this.accountName);
    }
    return localize("accountAvatarAltFallback", "Account profile image");
  }
  refreshAvatar() {
    const avatarUrl = getAccountProfileImageUrl(this.accountProviderId, this.accountName);
    if (avatarUrl === this.currentAvatarUrl) {
      return;
    }
    this.currentAvatarUrl = avatarUrl;
    this.loadedAvatarUrl = void 0;
    this.avatarLoadDisposable.clear();
    const requestId = ++this.avatarRequestCounter;
    if (!avatarUrl) {
      this.renderState();
      return;
    }
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    const clearHandlers = () => {
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => {
      if (requestId !== this.avatarRequestCounter) {
        return;
      }
      this.loadedAvatarUrl = avatarUrl;
      this.renderState();
      clearHandlers();
    };
    image.onerror = () => {
      if (requestId !== this.avatarRequestCounter) {
        return;
      }
      this.loadedAvatarUrl = void 0;
      this.renderState();
      clearHandlers();
    };
    this.avatarLoadDisposable.value = toDisposable(() => {
      clearHandlers();
      image.src = "";
    });
    image.src = avatarUrl;
    this.renderState();
  }
  getHoverTarget() {
    const { left, width } = getDomNodePagePosition(this.container);
    return {
      targetElements: [this.container],
      x: left + width - SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH
    };
  }
  showCombinedPanel() {
    if (!this.container) {
      return;
    }
    if (this.isMenuVisible) {
      this.hoverService.hideHover(true);
      this.clickPanelDisposable.clear();
      return;
    }
    this.hoverService.hideHover(true);
    this.clickPanelDisposable.clear();
    const panelStore = new DisposableStore();
    this.clickPanelDisposable.value = panelStore;
    const badgeKey = getAccountTitleBarBadgeKey(this.lastState);
    if (badgeKey) {
      this.dismissedBadgeKey = badgeKey;
    }
    this.isMenuVisible = true;
    this.container.classList.add("menu-visible");
    this.renderState();
    panelStore.add({
      dispose: () => {
        this.isMenuVisible = false;
        this.container?.classList.remove("menu-visible");
        this.renderState();
        this.container?.focus();
      }
    });
    const panelContent = this.createCombinedPanelContent(panelStore);
    const hoverWidget = this.hoverService.showInstantHover({
      content: panelContent,
      target: this.getHoverTarget(),
      additionalClasses: ["sessions-account-titlebar-panel-hover"],
      position: { hoverPosition: HoverPosition.BELOW },
      persistence: { sticky: true, hideOnHover: false },
      appearance: { showPointer: false, skipFadeInAnimation: true, maxHeightRatio: 0.8 }
    }, true);
    if (hoverWidget) {
      panelStore.add(hoverWidget);
    }
    panelStore.add(disposableWindowInterval(mainWindow, () => {
      if (!panelContent.isConnected || hoverWidget?.isDisposed) {
        this.clickPanelDisposable.clear();
      }
    }, 500));
  }
  createCombinedPanelContent(panelStore) {
    const panel = $("div.sessions-account-titlebar-panel");
    const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
    const rawActions = [];
    fillInActionBarActions(menu.getActions(), rawActions);
    menu.dispose();
    const partitioned = this.partitionMenuActions(rawActions);
    const headerSection = append(panel, $(".sessions-account-titlebar-panel-header"));
    const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : void 0;
    if (loadedAvatarUrl) {
      const avatar = append(headerSection, $("img.sessions-account-titlebar-panel-avatar", {
        alt: this.getAvatarAltText(true),
        draggable: "false",
        src: loadedAvatarUrl
      }));
      avatar.decoding = "async";
      avatar.referrerPolicy = "no-referrer";
    }
    const title = append(headerSection, $("div.sessions-account-titlebar-panel-title"));
    title.textContent = this.getPanelHeaderLabel();
    const headerActionsContainer = append(headerSection, $(".sessions-account-titlebar-panel-header-actions"));
    const ctaButtonsContainer = append(headerActionsContainer, $(".sessions-account-titlebar-panel-cta-actions"));
    const headerActionBar = panelStore.add(new ActionBar(headerActionsContainer));
    panelStore.add(headerActionBar.onWillRun(() => {
      this.hoverService.hideHover(true);
      this.clickPanelDisposable.clear();
    }));
    for (const action of partitioned.personalize) {
      headerActionBar.push(action, { icon: true, label: false });
    }
    if (partitioned.signOut) {
      headerActionBar.push(partitioned.signOut, { icon: true, label: false });
    }
    if (partitioned.other.some((a) => !(a instanceof Separator))) {
      const actionsSection = append(panel, $(".sessions-account-titlebar-panel-actions"));
      const actionsActionBar = panelStore.add(new ActionBar(actionsSection, {
        orientation: ActionsOrientation.VERTICAL
      }));
      panelStore.add(actionsActionBar.onWillRun(() => {
        this.hoverService.hideHover(true);
        this.clickPanelDisposable.clear();
      }));
      let lastWasSeparator = true;
      for (const action of partitioned.other) {
        if (action instanceof Separator) {
          if (!lastWasSeparator) {
            actionsActionBar.push(action);
            lastWasSeparator = true;
          }
          continue;
        }
        lastWasSeparator = false;
        actionsActionBar.push(action, { icon: false, label: true });
      }
    }
    const contentSection = append(panel, $(".sessions-account-titlebar-panel-content"));
    if (this.shouldShowCopilotDashboardHover()) {
      const subscriptionSection = append(contentSection, $("section.sessions-account-titlebar-panel-section.subscription", {
        "aria-label": localize("sessionsAccountSubscriptionSectionLabel", "Subscription")
      }));
      const dashboard = this.createCopilotHoverContent({ compactQuotaLayout: true, ctaButtonsContainer });
      append(subscriptionSection, dashboard);
    } else if (!this.isAccountLoading) {
      const summary = append(contentSection, $(".sessions-account-titlebar-panel-summary"));
      summary.textContent = this.lastState.ariaLabel;
    }
    return panel;
  }
  partitionMenuActions(rawActions) {
    let signOut;
    const personalizeMap = /* @__PURE__ */ new Map();
    const other = [];
    const pushSeparator = () => {
      if (other.length === 0 || other[other.length - 1] instanceof Separator) {
        return;
      }
      other.push(new Separator());
    };
    for (const action of rawActions) {
      if (action instanceof Separator) {
        pushSeparator();
        continue;
      }
      if (action.id === SIGN_OUT_ACTION_ID) {
        signOut = action;
        continue;
      }
      if (PERSONALIZE_ACTION_IDS.includes(action.id)) {
        personalizeMap.set(action.id, action);
        continue;
      }
      if (action.id.startsWith("update.")) {
        continue;
      }
      if (this.isAccountLoading && action.id === SIGN_IN_ACTION_ID) {
        continue;
      }
      other.push(action);
    }
    if (other.length > 0 && other[other.length - 1] instanceof Separator) {
      other.pop();
    }
    const personalize = PERSONALIZE_ACTION_IDS.map((id) => personalizeMap.get(id)).filter((a) => !!a);
    return { signOut, personalize, other };
  }
  getPanelHeaderLabel() {
    if (this.accountName) {
      return this.accountName;
    }
    if (this.isAccountLoading) {
      return localize("loadingAccountHeader", "Loading Account...");
    }
    return localize("accountMenuHeaderFallback", "Account");
  }
  shouldShowCopilotDashboardHover() {
    return !this.chatEntitlementService.sentiment.hidden && !!this.accountName;
  }
  createCopilotHoverContent(extraOptions) {
    const store = new DisposableStore();
    this.copilotDashboardStore.value = store;
    const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
      disableInlineSuggestionsSettings: true,
      disableModelSelection: true,
      disableProviderOptions: true,
      disableCompletionsSnooze: true,
      disableQuickSettingsCollapsible: true,
      ...extraOptions
    });
    store.add(disposableWindowInterval(mainWindow, () => {
      if (!dashboardElement.isConnected) {
        store.dispose();
      }
    }, 2e3));
    return dashboardElement;
  }
};
TitleBarAccountWidget = __decorateClass([
  __decorateParam(2, IDefaultAccountService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IChatEntitlementService)
], TitleBarAccountWidget);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SessionsTitleBarAccountWidgetAction,
      title: localize2("agentsAccountStatusTitleBar", "Agents Account and Status"),
      menu: {
        id: Menus.TitleBarRightLayout,
        group: "navigation",
        order: 100,
        when: IsAuxiliaryWindowContext.toNegated()
      }
    });
  }
  run() {
  }
});
let AccountWidgetContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService) {
    super();
    this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarAccountWidgetAction, (action, options) => {
      return instantiationService.createInstance(TitleBarAccountWidget, action, options);
    }, void 0));
  }
};
AccountWidgetContribution.ID = "workbench.contrib.sessionsWidget";
AccountWidgetContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService)
], AccountWidgetContribution);
registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, WorkbenchPhase.BlockRestore);
let ChatDashboardServiceImpl = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  createDashboardElement(store) {
    const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
      disableInlineSuggestionsSettings: true,
      disableModelSelection: true,
      disableProviderOptions: true,
      disableCompletionsSnooze: true
    });
    store.add(disposableWindowInterval(mainWindow, () => {
      if (!dashboardElement.isConnected) {
        store.dispose();
      }
    }, 2e3));
    return dashboardElement;
  }
};
ChatDashboardServiceImpl = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ChatDashboardServiceImpl);
registerSingleton(IChatDashboardService, ChatDashboardServiceImpl, InstantiationType.Delayed);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWNjb3VudE1lbnUvYnJvd3Nlci9hY2NvdW50LmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi4vLi4vLi4vYnJvd3Nlci9tZWRpYS9zaWRlYmFyQWN0aW9uQnV0dG9uLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvYWNjb3VudFdpZGdldC5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL2FjY291bnRUaXRsZUJhcldpZGdldC5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFN0YXR1cy9tZWRpYS9jaGF0U3RhdHVzLmNzcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIsIElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgYXBwZW5kVXBkYXRlTWVudUl0ZW1zIGFzIHJlZ2lzdGVyVXBkYXRlTWVudUl0ZW1zIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdXBkYXRlL2Jyb3dzZXIvdXBkYXRlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmaWxsSW5BY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsLCBnZXREb21Ob2RlUGFnZVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIEFjdGlvbnNPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJVcGRhdGVUaXRsZUJhck1lbnVQbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi91cGRhdGUvYnJvd3Nlci91cGRhdGVUaXRsZUJhckVudHJ5LmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgQ2hhdEVudGl0bGVtZW50U2VydmljZSwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U3RhdHVzRGFzaGJvYXJkLCBJQ2hhdFN0YXR1c0Rhc2hib2FyZE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFN0YXR1cy9jaGF0U3RhdHVzRGFzaGJvYXJkLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGdldEFjY291bnRQcm9maWxlSW1hZ2VVcmwsIGdldEFjY291bnRUaXRsZUJhckJhZGdlS2V5LCBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZSwgcmVzb2x2ZUFjY291bnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY2NvdW50VGl0bGVCYXJTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJc1Bob25lTGF5b3V0Q29udGV4dCwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0RGFzaGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdERhc2hib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbi8vIC0tLSBBY2NvdW50IE1lbnUgSXRlbXMgLS0tIC8vXG5jb25zdCBBY2NvdW50TWVudSA9IE1lbnVzLkFjY291bnRNZW51O1xuY29uc3QgU2Vzc2lvbnNUaXRsZUJhckFjY291bnRXaWRnZXRBY3Rpb24gPSAnc2Vzc2lvbnMuYWN0aW9uLnRpdGxlQmFyQWNjb3VudFdpZGdldCc7XG5jb25zdCBTRVNTSU9OU19BQ0NPVU5UX1RJVExFQkFSX1BBTkVMX1dJRFRIID0gMzYwO1xuXG5jb25zdCBQRVJTT05BTElaRV9BQ1RJT05fSURTOiByZWFkb25seSBzdHJpbmdbXSA9IFtcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJyxcbl07XG5jb25zdCBTSUdOX09VVF9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudGljU2lnbk91dCc7XG5jb25zdCBTSUdOX0lOX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50aWNTaWduSW4nO1xuXG4vLyBSZWdpc3RlciB0aGUgc2hhcmVkIFZTIENvZGUgdXBkYXRlIHRpdGxlIGJhciBlbnRyeSBpbnRvIHRoZSBBZ2VudHMgdGl0bGViYXIgbGF5b3V0LlxuLy8gUGxhY2VkIGFzIHRoZSBmaXJzdCAobGVmdG1vc3QpIGl0ZW0gb2YgdGhlIGxlZnRtb3N0IHJpZ2h0LWNsdXN0ZXIgY29udGFpbmVyIHNvIHRoYXQsIGluXG4vLyB0aGUgcmlnaHQtYWxpZ25lZCB0aXRsZSBiYXIsIHRoZSB1cGRhdGUgYnV0dG9uIGdyb3dzIGludG8gdGhlIGVtcHR5IHNwYWNlIG9uIGl0cyBsZWZ0XG4vLyB3aGVuIGl0IGFwcGVhcnMgYW5kIGV2ZXJ5IG90aGVyIGNvbnRyb2wgKHNlc3Npb24gdG9nZ2xlcywgYWNjb3VudCB3aWRnZXQpIHN0YXlzIGFuY2hvcmVkXG4vLyBhbmQgZG9lc24ndCBzaGlmdC5cbnJlZ2lzdGVyVXBkYXRlVGl0bGVCYXJNZW51UGxhY2VtZW50KE1lbnVzLlRpdGxlQmFyU2Vzc2lvbk1lbnUsIHtcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogLTEsXG59KTtcblxuLy8gU2lnbiBJbiAoc2hvd24gd2hlbiBzaWduZWQgb3V0KVxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudGljU2lnbkluJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NpZ25JbicsICdTaWduIEluJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNpZ25Jbixcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IEFjY291bnRNZW51LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2RlZmF1bHRBY2NvdW50U3RhdHVzJywgJ2F2YWlsYWJsZScpLFxuXHRcdFx0XHRncm91cDogJzFfYWNjb3VudCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVmYXVsdEFjY291bnRTZXJ2aWNlKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2lnbkluKCk7XG5cdH1cbn0pO1xuXG4vLyBTaWduIE91dCAoc2hvd24gd2hlbiBzaWduZWQgaW4pXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50aWNTaWduT3V0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NpZ25PdXQnLCAnU2lnbiBPdXQnKSxcblx0XHRcdGljb246IENvZGljb24uc2lnbk91dCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IEFjY291bnRNZW51LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2RlZmF1bHRBY2NvdW50U3RhdHVzJywgJ2F2YWlsYWJsZScpLFxuXHRcdFx0XHRncm91cDogJzFfYWNjb3VudCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVmYXVsdEFjY291bnRTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSk7XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnQgPSBhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnQoKTtcblx0XHRpZiAoIWRlZmF1bHRBY2NvdW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IGRlZmF1bHRBY2NvdW50LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQ7XG5cdFx0Y29uc3QgYWNjb3VudExhYmVsID0gZGVmYXVsdEFjY291bnQuYWNjb3VudE5hbWU7XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2FnZW50aWNTaWduT3V0TWVzc2FnZScsIFwiU2lnbiBvdXQgb2YgdGhlIEFnZW50cyB3aW5kb3c/XCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWdlbnRpY1NpZ25PdXREZXRhaWwnLCBcIlRoaXMgd2lsbCBzaWduIG91dCAnezB9JyBmcm9tIHRoZSBBZ2VudHMgd2luZG93LlwiLCBhY2NvdW50TGFiZWwpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdhZ2VudGljU2lnbk91dEJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNpZ24gT3V0XCIpXG5cdFx0fSk7XG5cblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbFNlc3Npb25zID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gYWxsU2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gc2Vzc2lvbi5hY2NvdW50LmxhYmVsID09PSBhY2NvdW50TGFiZWwpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHNlc3Npb25zLm1hcChzZXNzaW9uID0+IGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZW1vdmVTZXNzaW9uKHByb3ZpZGVySWQsIHNlc3Npb24uaWQpKSk7XG5cdFx0YXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UucmVtb3ZlQWNjb3VudFVzYWdlKHByb3ZpZGVySWQsIGFjY291bnRMYWJlbCk7XG5cdFx0YXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlbW92ZUFsbG93ZWRFeHRlbnNpb25zKHByb3ZpZGVySWQsIGFjY291bnRMYWJlbCk7XG5cdH1cbn0pO1xuXG4vLyBTZXR0aW5ncyAoaGlkZGVuIG9uIHBob25lIFx1MjAxNCBubyBzZXR0aW5ncyBVSSBvbiBtb2JpbGUpXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oQWNjb3VudE1lbnUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2V0dGluZ3MnLCBcIlNldHRpbmdzXCIpLFxuXHRcdGljb246IENvZGljb24uc2V0dGluZ3NHZWFyLFxuXHR9LFxuXHR3aGVuOiBJc1Bob25lTGF5b3V0Q29udGV4dC5uZWdhdGUoKSxcblx0Z3JvdXA6ICcyX3NldHRpbmdzJyxcblx0b3JkZXI6IDEsXG59KTtcblxuLy8gVXBkYXRlIGFjdGlvbnNcbnJlZ2lzdGVyVXBkYXRlTWVudUl0ZW1zKEFjY291bnRNZW51LCAnM191cGRhdGVzJyk7XG5cbmNsYXNzIFRpdGxlQmFyQWNjb3VudFdpZGdldCBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGF2YXRhckVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYmFkZ2VFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhY2NvdW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFjY291bnRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWNjb3VudFByb3ZpZGVyTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpc0FjY291bnRMb2FkaW5nID0gdHJ1ZTtcblx0cHJpdmF0ZSBhY2NvdW50UmVxdWVzdENvdW50ZXIgPSAwO1xuXHRwcml2YXRlIGF2YXRhclJlcXVlc3RDb3VudGVyID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50QXZhdGFyVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbG9hZGVkQXZhdGFyVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGFzdFN0YXRlOiBSZXR1cm5UeXBlPHR5cGVvZiBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZT47XG5cdHByaXZhdGUgaXNNZW51VmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RCYWRnZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRpc21pc3NlZEJhZGdlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29waWxvdERhc2hib2FyZFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2xpY2tQYW5lbERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhdmF0YXJMb2FkRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdHRoaXMubGFzdFN0YXRlID0gZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUoe1xuXHRcdFx0aXNBY2NvdW50TG9hZGluZzogdHJ1ZSxcblx0XHRcdGVudGl0bGVtZW50OiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQsXG5cdFx0XHRzZW50aW1lbnQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQsXG5cdFx0XHRxdW90YXM6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMsXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHRoaXMucmVmcmVzaEFjY291bnQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4gdGhpcy5yZWZyZXNoQWNjb3VudCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQoKCkgPT4gdGhpcy5yZW5kZXJTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHRoaXMucmVuZGVyU3RhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQoKCkgPT4gdGhpcy5yZW5kZXJTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcoKCkgPT4gdGhpcy5yZW5kZXJTdGF0ZSgpKSk7XG5cdFx0dGhpcy5yZWZyZXNoQWNjb3VudCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXNhYmxlKF9mb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBEb24ndCBsZXQgdGhlIEFjdGlvbkJhciByZW1vdmUgZm9jdXNhYmlsaXR5IC0gdGhpcyB3aWRnZXQgbXVzdFxuXHRcdC8vIGFsd2F5cyBiZSByZWFjaGFibGUgdmlhIFRhYiBldmVuIHdoZW4gYSBzaWJsaW5nIGl0ZW0gaXMgaGlkZGVuLlxuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXdpZGdldCcpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0Y29udGFpbmVyLnRhYkluZGV4ID0gMDtcblxuXHRcdHRoaXMuYXZhdGFyRWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJ2ltZy5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXdpZGdldC1hdmF0YXInLCB7IGFsdDogbG9jYWxpemUoJ2FjY291bnRBdmF0YXJBbHRGYWxsYmFjaycsIFwiQWNjb3VudCBwcm9maWxlIGltYWdlXCIpLCBkcmFnZ2FibGU6ICdmYWxzZScgfSkpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0dGhpcy5hdmF0YXJFbGVtZW50LmRlY29kaW5nID0gJ2FzeW5jJztcblx0XHR0aGlzLmF2YXRhckVsZW1lbnQucmVmZXJyZXJQb2xpY3kgPSAnbm8tcmVmZXJyZXInO1xuXHRcdHRoaXMuaWNvbkVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci13aWRnZXQtaWNvbicpKTtcblx0XHR0aGlzLmxhYmVsRWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci13aWRnZXQtbGFiZWwnKSk7XG5cdFx0dGhpcy5iYWRnZUVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItd2lkZ2V0LWJhZGdlJykpO1xuXG5cdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgb25DbGljaygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zaG93Q29tYmluZWRQYW5lbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoQWNjb3VudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSArK3RoaXMuYWNjb3VudFJlcXVlc3RDb3VudGVyO1xuXHRcdHRoaXMuaXNBY2NvdW50TG9hZGluZyA9IHRydWU7XG5cdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHJlc29sdmVBY2NvdW50SW5mbyh0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZSwgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYWNjb3VudFJlcXVlc3RDb3VudGVyIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFjY291bnROYW1lID0gaW5mbz8uYWNjb3VudE5hbWU7XG5cdFx0dGhpcy5hY2NvdW50UHJvdmlkZXJJZCA9IGluZm8/LmFjY291bnRQcm92aWRlcklkO1xuXHRcdHRoaXMuYWNjb3VudFByb3ZpZGVyTGFiZWwgPSBpbmZvPy5hY2NvdW50UHJvdmlkZXJMYWJlbDtcblx0XHR0aGlzLmlzQWNjb3VudExvYWRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLnJlZnJlc2hBdmF0YXIoKTtcblx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250YWluZXIgfHwgIXRoaXMuYXZhdGFyRWxlbWVudCB8fCAhdGhpcy5pY29uRWxlbWVudCB8fCAhdGhpcy5sYWJlbEVsZW1lbnQgfHwgIXRoaXMuYmFkZ2VFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB3ZSBoYXZlIGEgc2Vzc2lvbiBidXQgZW50aXRsZW1lbnQgaGFzbid0IHJlc29sdmVkIHlldCxcblx0XHQvLyB0cmVhdCBhcyBVbnJlc29sdmVkIHRvIGF2b2lkIHNob3dpbmcgXCJBZ2VudHMgU2lnbmVkIE91dFwiLlxuXHRcdGNvbnN0IGVudGl0bGVtZW50ID0gdGhpcy5hY2NvdW50TmFtZSAmJiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duXG5cdFx0XHQ/IENoYXRFbnRpdGxlbWVudC5VbnJlc29sdmVkXG5cdFx0XHQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudDtcblxuXHRcdGNvbnN0IHN0YXRlID0gZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUoe1xuXHRcdFx0aXNBY2NvdW50TG9hZGluZzogdGhpcy5pc0FjY291bnRMb2FkaW5nLFxuXHRcdFx0YWNjb3VudE5hbWU6IHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRhY2NvdW50UHJvdmlkZXJMYWJlbDogdGhpcy5hY2NvdW50UHJvdmlkZXJMYWJlbCxcblx0XHRcdGVudGl0bGVtZW50LFxuXHRcdFx0c2VudGltZW50OiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LFxuXHRcdFx0cXVvdGFzOiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLFxuXHRcdH0pO1xuXHRcdHRoaXMubGFzdFN0YXRlID0gc3RhdGU7XG5cblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdraW5kLWRlZmF1bHQnLCAna2luZC1hY2NlbnQnLCAna2luZC13YXJuaW5nJywgJ2tpbmQtcHJvbWluZW50Jyk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZChga2luZC0ke3N0YXRlLmtpbmR9YCk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbWVudS12aXNpYmxlJywgdGhpcy5pc01lbnVWaXNpYmxlKTtcblx0XHR0aGlzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBzdGF0ZS5hcmlhTGFiZWwpO1xuXG5cdFx0Y29uc3QgYmFkZ2VLZXkgPSBnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleShzdGF0ZSk7XG5cdFx0aWYgKGJhZGdlS2V5ICE9PSB0aGlzLmxhc3RCYWRnZUtleSkge1xuXHRcdFx0dGhpcy5sYXN0QmFkZ2VLZXkgPSBiYWRnZUtleTtcblx0XHRcdHRoaXMuZGlzbWlzc2VkQmFkZ2VLZXkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0RvdEJhZGdlID0gISFiYWRnZUtleSAmJiBiYWRnZUtleSAhPT0gdGhpcy5kaXNtaXNzZWRCYWRnZUtleTtcblx0XHRjb25zdCBsb2FkZWRBdmF0YXJVcmwgPSAhdGhpcy5pc0FjY291bnRMb2FkaW5nID8gdGhpcy5sb2FkZWRBdmF0YXJVcmwgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGFzTG9hZGVkQXZhdGFyID0gISFsb2FkZWRBdmF0YXJVcmw7XG5cdFx0Y29uc3QgdGl0bGVCYXJJY29uID0gc3RhdGUuZG90QmFkZ2UgPyBDb2RpY29uLmFjY291bnQgOiBzdGF0ZS5pY29uO1xuXG5cdFx0dGhpcy5hdmF0YXJFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCBoYXNMb2FkZWRBdmF0YXIpO1xuXHRcdHRoaXMuYXZhdGFyRWxlbWVudC5hbHQgPSB0aGlzLmdldEF2YXRhckFsdFRleHQoaGFzTG9hZGVkQXZhdGFyKTtcblx0XHRpZiAoaGFzTG9hZGVkQXZhdGFyKSB7XG5cdFx0XHRpZiAodGhpcy5hdmF0YXJFbGVtZW50LnNyYyAhPT0gbG9hZGVkQXZhdGFyVXJsKSB7XG5cdFx0XHRcdHRoaXMuYXZhdGFyRWxlbWVudC5zcmMgPSBsb2FkZWRBdmF0YXJVcmw7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXZhdGFyRWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3NyYycpO1xuXHRcdH1cblxuXHRcdHRoaXMuaWNvbkVsZW1lbnQuY2xhc3NOYW1lID0gYHNlc3Npb25zLWFjY291bnQtdGl0bGViYXItd2lkZ2V0LWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUodGl0bGVCYXJJY29uKX1gO1xuXHRcdHRoaXMuaWNvbkVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgaGFzTG9hZGVkQXZhdGFyKTtcblx0XHR0aGlzLmxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMuYmFkZ2VFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5iYWRnZUVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZG90LWJhZGdlJywgc2hvdWxkU2hvd0RvdEJhZGdlKTtcblx0XHR0aGlzLmJhZGdlRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkb3QtYmFkZ2Utd2FybmluZycsIHNob3VsZFNob3dEb3RCYWRnZSAmJiBzdGF0ZS5kb3RCYWRnZSA9PT0gJ3dhcm5pbmcnKTtcblx0XHR0aGlzLmJhZGdlRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkb3QtYmFkZ2UtZXJyb3InLCBzaG91bGRTaG93RG90QmFkZ2UgJiYgc3RhdGUuZG90QmFkZ2UgPT09ICdlcnJvcicpO1xuXHRcdHRoaXMuYmFkZ2VFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBzaG91bGRTaG93RG90QmFkZ2UgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXZhdGFyQWx0VGV4dChoYXNMb2FkZWRBdmF0YXI6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmIChoYXNMb2FkZWRBdmF0YXIgJiYgdGhpcy5hY2NvdW50UHJvdmlkZXJJZCA9PT0gJ2dpdGh1YicgJiYgdGhpcy5hY2NvdW50TmFtZSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhY2NvdW50QXZhdGFyQWx0JywgXCJHaXRIdWIgcHJvZmlsZSBpbWFnZSBmb3IgezB9XCIsIHRoaXMuYWNjb3VudE5hbWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWNjb3VudEF2YXRhckFsdEZhbGxiYWNrJywgXCJBY2NvdW50IHByb2ZpbGUgaW1hZ2VcIik7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hBdmF0YXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgYXZhdGFyVXJsID0gZ2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCh0aGlzLmFjY291bnRQcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRpZiAoYXZhdGFyVXJsID09PSB0aGlzLmN1cnJlbnRBdmF0YXJVcmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRBdmF0YXJVcmwgPSBhdmF0YXJVcmw7XG5cdFx0dGhpcy5sb2FkZWRBdmF0YXJVcmwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5hdmF0YXJMb2FkRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICsrdGhpcy5hdmF0YXJSZXF1ZXN0Q291bnRlcjtcblxuXHRcdGlmICghYXZhdGFyVXJsKSB7XG5cdFx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcblx0XHRpbWFnZS5yZWZlcnJlclBvbGljeSA9ICduby1yZWZlcnJlcic7XG5cdFx0Y29uc3QgY2xlYXJIYW5kbGVycyA9ICgpID0+IHtcblx0XHRcdGltYWdlLm9ubG9hZCA9IG51bGw7XG5cdFx0XHRpbWFnZS5vbmVycm9yID0gbnVsbDtcblx0XHR9O1xuXHRcdGltYWdlLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYXZhdGFyUmVxdWVzdENvdW50ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvYWRlZEF2YXRhclVybCA9IGF2YXRhclVybDtcblx0XHRcdHRoaXMucmVuZGVyU3RhdGUoKTtcblx0XHRcdGNsZWFySGFuZGxlcnMoKTtcblx0XHR9O1xuXHRcdGltYWdlLm9uZXJyb3IgPSAoKSA9PiB7XG5cdFx0XHRpZiAocmVxdWVzdElkICE9PSB0aGlzLmF2YXRhclJlcXVlc3RDb3VudGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2FkZWRBdmF0YXJVcmwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdFx0XHRjbGVhckhhbmRsZXJzKCk7XG5cdFx0fTtcblx0XHR0aGlzLmF2YXRhckxvYWREaXNwb3NhYmxlLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNsZWFySGFuZGxlcnMoKTtcblx0XHRcdGltYWdlLnNyYyA9ICcnO1xuXHRcdH0pO1xuXHRcdGltYWdlLnNyYyA9IGF2YXRhclVybDtcblx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEhvdmVyVGFyZ2V0KCk6IHsgdGFyZ2V0RWxlbWVudHM6IEhUTUxFbGVtZW50W107IHg6IG51bWJlciB9IHtcblx0XHRjb25zdCB7IGxlZnQsIHdpZHRoIH0gPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuY29udGFpbmVyISk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRhcmdldEVsZW1lbnRzOiBbdGhpcy5jb250YWluZXIhXSxcblx0XHRcdHg6IGxlZnQgKyB3aWR0aCAtIFNFU1NJT05TX0FDQ09VTlRfVElUTEVCQVJfUEFORUxfV0lEVEgsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0NvbWJpbmVkUGFuZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzTWVudVZpc2libGUpIHtcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdHRoaXMuY2xpY2tQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0dGhpcy5jbGlja1BhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgcGFuZWxTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmNsaWNrUGFuZWxEaXNwb3NhYmxlLnZhbHVlID0gcGFuZWxTdG9yZTtcblxuXHRcdGNvbnN0IGJhZGdlS2V5ID0gZ2V0QWNjb3VudFRpdGxlQmFyQmFkZ2VLZXkodGhpcy5sYXN0U3RhdGUpO1xuXHRcdGlmIChiYWRnZUtleSkge1xuXHRcdFx0dGhpcy5kaXNtaXNzZWRCYWRnZUtleSA9IGJhZGdlS2V5O1xuXHRcdH1cblxuXHRcdHRoaXMuaXNNZW51VmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbWVudS12aXNpYmxlJyk7XG5cdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXG5cdFx0cGFuZWxTdG9yZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmlzTWVudVZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5jb250YWluZXI/LmNsYXNzTGlzdC5yZW1vdmUoJ21lbnUtdmlzaWJsZScpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyPy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGFuZWxDb250ZW50ID0gdGhpcy5jcmVhdGVDb21iaW5lZFBhbmVsQ29udGVudChwYW5lbFN0b3JlKTtcblx0XHRjb25zdCBob3ZlcldpZGdldCA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0Y29udGVudDogcGFuZWxDb250ZW50LFxuXHRcdFx0dGFyZ2V0OiB0aGlzLmdldEhvdmVyVGFyZ2V0KCksXG5cdFx0XHRhZGRpdGlvbmFsQ2xhc3NlczogWydzZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLWhvdmVyJ10sXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0XHRwZXJzaXN0ZW5jZTogeyBzdGlja3k6IHRydWUsIGhpZGVPbkhvdmVyOiBmYWxzZSB9LFxuXHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogZmFsc2UsIHNraXBGYWRlSW5BbmltYXRpb246IHRydWUsIG1heEhlaWdodFJhdGlvOiAwLjggfSxcblx0XHR9LCB0cnVlKTtcblxuXHRcdGlmIChob3ZlcldpZGdldCkge1xuXHRcdFx0cGFuZWxTdG9yZS5hZGQoaG92ZXJXaWRnZXQpO1xuXHRcdH1cblxuXHRcdHBhbmVsU3RvcmUuYWRkKGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChtYWluV2luZG93LCAoKSA9PiB7XG5cdFx0XHRpZiAoIXBhbmVsQ29udGVudC5pc0Nvbm5lY3RlZCB8fCBob3ZlcldpZGdldD8uaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLmNsaWNrUGFuZWxEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSwgNTAwKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbWJpbmVkUGFuZWxDb250ZW50KHBhbmVsU3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBwYW5lbCA9ICQoJ2Rpdi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsJyk7XG5cblx0XHQvLyBCdWlsZCB0aGUgbWVudSBhY3Rpb25zIG9uY2UgYW5kIHBhcnRpdGlvbiB0aGVtLlxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoQWNjb3VudE1lbnUsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJhd0FjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGZpbGxJbkFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKCksIHJhd0FjdGlvbnMpO1xuXHRcdG1lbnUuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IHBhcnRpdGlvbmVkID0gdGhpcy5wYXJ0aXRpb25NZW51QWN0aW9ucyhyYXdBY3Rpb25zKTtcblxuXHRcdC8vIEhlYWRlcjogYWNjb3VudCBsYWJlbCArIHNpZ24tb3V0IGljb24uXG5cdFx0Y29uc3QgaGVhZGVyU2VjdGlvbiA9IGFwcGVuZChwYW5lbCwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtaGVhZGVyJykpO1xuXHRcdGNvbnN0IGxvYWRlZEF2YXRhclVybCA9ICF0aGlzLmlzQWNjb3VudExvYWRpbmcgPyB0aGlzLmxvYWRlZEF2YXRhclVybCA6IHVuZGVmaW5lZDtcblx0XHRpZiAobG9hZGVkQXZhdGFyVXJsKSB7XG5cdFx0XHRjb25zdCBhdmF0YXIgPSBhcHBlbmQoaGVhZGVyU2VjdGlvbiwgJCgnaW1nLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtYXZhdGFyJywge1xuXHRcdFx0XHRhbHQ6IHRoaXMuZ2V0QXZhdGFyQWx0VGV4dCh0cnVlKSxcblx0XHRcdFx0ZHJhZ2dhYmxlOiAnZmFsc2UnLFxuXHRcdFx0XHRzcmM6IGxvYWRlZEF2YXRhclVybCxcblx0XHRcdH0pKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdFx0YXZhdGFyLmRlY29kaW5nID0gJ2FzeW5jJztcblx0XHRcdGF2YXRhci5yZWZlcnJlclBvbGljeSA9ICduby1yZWZlcnJlcic7XG5cdFx0fVxuXHRcdGNvbnN0IHRpdGxlID0gYXBwZW5kKGhlYWRlclNlY3Rpb24sICQoJ2Rpdi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gdGhpcy5nZXRQYW5lbEhlYWRlckxhYmVsKCk7XG5cdFx0Y29uc3QgaGVhZGVyQWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChoZWFkZXJTZWN0aW9uLCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1oZWFkZXItYWN0aW9ucycpKTtcblxuXHRcdC8vIENUQSBidXR0b25zIChNYW5hZ2UgQnVkZ2V0LCBVcGdyYWRlKSB3aWxsIGJlIHJlbmRlcmVkIGhlcmUgYnkgdGhlIGRhc2hib2FyZFxuXHRcdGNvbnN0IGN0YUJ1dHRvbnNDb250YWluZXIgPSBhcHBlbmQoaGVhZGVyQWN0aW9uc0NvbnRhaW5lciwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtY3RhLWFjdGlvbnMnKSk7XG5cblx0XHRjb25zdCBoZWFkZXJBY3Rpb25CYXIgPSBwYW5lbFN0b3JlLmFkZChuZXcgQWN0aW9uQmFyKGhlYWRlckFjdGlvbnNDb250YWluZXIpKTtcblx0XHRwYW5lbFN0b3JlLmFkZChoZWFkZXJBY3Rpb25CYXIub25XaWxsUnVuKCgpID0+IHtcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdHRoaXMuY2xpY2tQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR9KSk7XG5cblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBwYXJ0aXRpb25lZC5wZXJzb25hbGl6ZSkge1xuXHRcdFx0aGVhZGVyQWN0aW9uQmFyLnB1c2goYWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR9XG5cdFx0aWYgKHBhcnRpdGlvbmVkLnNpZ25PdXQpIHtcblx0XHRcdGhlYWRlckFjdGlvbkJhci5wdXNoKHBhcnRpdGlvbmVkLnNpZ25PdXQsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyIHBhbmVsIGFjdGlvbnMgKHNpZ24taW4sIGV0Yy4pIFx1MjAxNCBvbmx5IHJlbmRlciBpZiB0aGVyZSdzIGF0IGxlYXN0IG9uZSBub24tc2VwYXJhdG9yIGFjdGlvbi5cblx0XHRpZiAocGFydGl0aW9uZWQub3RoZXIuc29tZShhID0+ICEoYSBpbnN0YW5jZW9mIFNlcGFyYXRvcikpKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zU2VjdGlvbiA9IGFwcGVuZChwYW5lbCwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtYWN0aW9ucycpKTtcblx0XHRcdGNvbnN0IGFjdGlvbnNBY3Rpb25CYXIgPSBwYW5lbFN0b3JlLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbnNTZWN0aW9uLCB7XG5cdFx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uVkVSVElDQUwsXG5cdFx0XHR9KSk7XG5cdFx0XHRwYW5lbFN0b3JlLmFkZChhY3Rpb25zQWN0aW9uQmFyLm9uV2lsbFJ1bigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdFx0dGhpcy5jbGlja1BhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0fSkpO1xuXHRcdFx0bGV0IGxhc3RXYXNTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgcGFydGl0aW9uZWQub3RoZXIpIHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0XHRcdGlmICghbGFzdFdhc1NlcGFyYXRvcikge1xuXHRcdFx0XHRcdFx0YWN0aW9uc0FjdGlvbkJhci5wdXNoKGFjdGlvbik7XG5cdFx0XHRcdFx0XHRsYXN0V2FzU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdFdhc1NlcGFyYXRvciA9IGZhbHNlO1xuXHRcdFx0XHRhY3Rpb25zQWN0aW9uQmFyLnB1c2goYWN0aW9uLCB7IGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTdWJzY3JpcHRpb24gLyBDb3BpbG90IGRhc2hib2FyZC5cblx0XHRjb25zdCBjb250ZW50U2VjdGlvbiA9IGFwcGVuZChwYW5lbCwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtY29udGVudCcpKTtcblx0XHRpZiAodGhpcy5zaG91bGRTaG93Q29waWxvdERhc2hib2FyZEhvdmVyKCkpIHtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvblNlY3Rpb24gPSBhcHBlbmQoY29udGVudFNlY3Rpb24sICQoJ3NlY3Rpb24uc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1zZWN0aW9uLnN1YnNjcmlwdGlvbicsIHtcblx0XHRcdFx0J2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnc2Vzc2lvbnNBY2NvdW50U3Vic2NyaXB0aW9uU2VjdGlvbkxhYmVsJywgXCJTdWJzY3JpcHRpb25cIilcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IGRhc2hib2FyZCA9IHRoaXMuY3JlYXRlQ29waWxvdEhvdmVyQ29udGVudCh7IGNvbXBhY3RRdW90YUxheW91dDogdHJ1ZSwgY3RhQnV0dG9uc0NvbnRhaW5lciB9KTtcblx0XHRcdGFwcGVuZChzdWJzY3JpcHRpb25TZWN0aW9uLCBkYXNoYm9hcmQpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuaXNBY2NvdW50TG9hZGluZykge1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGFwcGVuZChjb250ZW50U2VjdGlvbiwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtc3VtbWFyeScpKTtcblx0XHRcdHN1bW1hcnkudGV4dENvbnRlbnQgPSB0aGlzLmxhc3RTdGF0ZS5hcmlhTGFiZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhbmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJ0aXRpb25NZW51QWN0aW9ucyhyYXdBY3Rpb25zOiBJQWN0aW9uW10pOiB7IHNpZ25PdXQ6IElBY3Rpb24gfCB1bmRlZmluZWQ7IHBlcnNvbmFsaXplOiBJQWN0aW9uW107IG90aGVyOiBJQWN0aW9uW10gfSB7XG5cdFx0bGV0IHNpZ25PdXQ6IElBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGVyc29uYWxpemVNYXAgPSBuZXcgTWFwPHN0cmluZywgSUFjdGlvbj4oKTtcblx0XHRjb25zdCBvdGhlcjogSUFjdGlvbltdID0gW107XG5cblx0XHRjb25zdCBwdXNoU2VwYXJhdG9yID0gKCkgPT4ge1xuXHRcdFx0Ly8gQ29sbGFwc2UgcnVucyBhbmQgc2tpcCBsZWFkaW5nIHNlcGFyYXRvcnMgc28gZ3JvdXBzIHdob3NlIG9ubHlcblx0XHRcdC8vIGl0ZW1zIGdldCBmaWx0ZXJlZCAoZS5nLiB1cGRhdGUuKikgZG9uJ3QgbGVhdmUgb3JwaGFucyBiZWhpbmQuXG5cdFx0XHRpZiAob3RoZXIubGVuZ3RoID09PSAwIHx8IG90aGVyW290aGVyLmxlbmd0aCAtIDFdIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG90aGVyLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgcmF3QWN0aW9ucykge1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0XHRwdXNoU2VwYXJhdG9yKCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gU0lHTl9PVVRfQUNUSU9OX0lEKSB7XG5cdFx0XHRcdHNpZ25PdXQgPSBhY3Rpb247XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKFBFUlNPTkFMSVpFX0FDVElPTl9JRFMuaW5jbHVkZXMoYWN0aW9uLmlkKSkge1xuXHRcdFx0XHRwZXJzb25hbGl6ZU1hcC5zZXQoYWN0aW9uLmlkLCBhY3Rpb24pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb24uaWQuc3RhcnRzV2l0aCgndXBkYXRlLicpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaXNBY2NvdW50TG9hZGluZyAmJiBhY3Rpb24uaWQgPT09IFNJR05fSU5fQUNUSU9OX0lEKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0b3RoZXIucHVzaChhY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIFRyaW0gdHJhaWxpbmcgc2VwYXJhdG9yIGxlZnQgYWZ0ZXIgZmlsdGVyaW5nLlxuXHRcdGlmIChvdGhlci5sZW5ndGggPiAwICYmIG90aGVyW290aGVyLmxlbmd0aCAtIDFdIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRvdGhlci5wb3AoKTtcblx0XHR9XG5cblx0XHQvLyBQcmVzZXJ2ZSBjYW5vbmljYWwgcGVyc29uYWxpemUgb3JkZXIuXG5cdFx0Y29uc3QgcGVyc29uYWxpemUgPSBQRVJTT05BTElaRV9BQ1RJT05fSURTXG5cdFx0XHQubWFwKGlkID0+IHBlcnNvbmFsaXplTWFwLmdldChpZCkpXG5cdFx0XHQuZmlsdGVyKChhKTogYSBpcyBJQWN0aW9uID0+ICEhYSk7XG5cblx0XHRyZXR1cm4geyBzaWduT3V0LCBwZXJzb25hbGl6ZSwgb3RoZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGFuZWxIZWFkZXJMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmFjY291bnROYW1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY2NvdW50TmFtZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc0FjY291bnRMb2FkaW5nKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2xvYWRpbmdBY2NvdW50SGVhZGVyJywgXCJMb2FkaW5nIEFjY291bnQuLi5cIik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhY2NvdW50TWVudUhlYWRlckZhbGxiYWNrJywgXCJBY2NvdW50XCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93Q29waWxvdERhc2hib2FyZEhvdmVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5oaWRkZW4gJiYgISF0aGlzLmFjY291bnROYW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb3BpbG90SG92ZXJDb250ZW50KGV4dHJhT3B0aW9ucz86IFBhcnRpYWw8SUNoYXRTdGF0dXNEYXNoYm9hcmRPcHRpb25zPik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmNvcGlsb3REYXNoYm9hcmRTdG9yZS52YWx1ZSA9IHN0b3JlO1xuXHRcdGNvbnN0IGRhc2hib2FyZEVsZW1lbnQgPSBDaGF0U3RhdHVzRGFzaGJvYXJkLmluc3RhbnRpYXRlSW5Db250ZW50cyh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdG9yZSwge1xuXHRcdFx0ZGlzYWJsZUlubGluZVN1Z2dlc3Rpb25zU2V0dGluZ3M6IHRydWUsXG5cdFx0XHRkaXNhYmxlTW9kZWxTZWxlY3Rpb246IHRydWUsXG5cdFx0XHRkaXNhYmxlUHJvdmlkZXJPcHRpb25zOiB0cnVlLFxuXHRcdFx0ZGlzYWJsZUNvbXBsZXRpb25zU25vb3plOiB0cnVlLFxuXHRcdFx0ZGlzYWJsZVF1aWNrU2V0dGluZ3NDb2xsYXBzaWJsZTogdHJ1ZSxcblx0XHRcdC4uLmV4dHJhT3B0aW9ucyxcblx0XHR9KTtcblxuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdFx0aWYgKCFkYXNoYm9hcmRFbGVtZW50LmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9LCAyMDAwKSk7XG5cblx0XHRyZXR1cm4gZGFzaGJvYXJkRWxlbWVudDtcblx0fVxufVxuXG4vLyAtLS0gUmVnaXN0ZXIgY3VzdG9tIHZpZXcgaXRlbSAtLS0gLy9cblxuLy8gQWN0aW9ucyByZWdpc3RlcmVkIGF0IG1vZHVsZSBsZXZlbCBzbyBNZW51cy5UaXRsZUJhclJpZ2h0TGF5b3V0IGlzIG5vbi1lbXB0eSB3aGVuIHRoZVxuLy8gdG9vbGJhciBpcyBmaXJzdCBjb25zdHJ1Y3RlZC4gVGhlIHJ1bigpIGlzIGEgbm8tb3AgXHUyMDE0IHJlbmRlcmluZyBpcyBoYW5kbGVkIGJ5IHRoZSBjdXN0b21cbi8vIHZpZXcgaXRlbXMgcmVnaXN0ZXJlZCBpbiBBY2NvdW50V2lkZ2V0Q29udHJpYnV0aW9uLlxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZXNzaW9uc1RpdGxlQmFyQWNjb3VudFdpZGdldEFjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50c0FjY291bnRTdGF0dXNUaXRsZUJhcicsIFwiQWdlbnRzIEFjY291bnQgYW5kIFN0YXR1c1wiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlRpdGxlQmFyUmlnaHRMYXlvdXQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMDAsXG5cdFx0XHRcdHdoZW46IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bigpOiB2b2lkIHsgfVxufSk7XG5cbmNsYXNzIEFjY291bnRXaWRnZXRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zV2lkZ2V0JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLlRpdGxlQmFyUmlnaHRMYXlvdXQsIFNlc3Npb25zVGl0bGVCYXJBY2NvdW50V2lkZ2V0QWN0aW9uLCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGl0bGVCYXJBY2NvdW50V2lkZ2V0LCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH0sIHVuZGVmaW5lZCkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihBY2NvdW50V2lkZ2V0Q29udHJpYnV0aW9uLklELCBBY2NvdW50V2lkZ2V0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuXG4vLyAtLS0gQ2hhdCBEYXNoYm9hcmQgU2VydmljZSAocmVhbCBpbXBsZW1lbnRhdGlvbiBmb3IgbW9iaWxlIGFjY291bnQgc2hlZXQpIC0tLSAvL1xuXG5jbGFzcyBDaGF0RGFzaGJvYXJkU2VydmljZUltcGwgaW1wbGVtZW50cyBJQ2hhdERhc2hib2FyZFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Y3JlYXRlRGFzaGJvYXJkRWxlbWVudChzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRhc2hib2FyZEVsZW1lbnQgPSBDaGF0U3RhdHVzRGFzaGJvYXJkLmluc3RhbnRpYXRlSW5Db250ZW50cyh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdG9yZSwge1xuXHRcdFx0ZGlzYWJsZUlubGluZVN1Z2dlc3Rpb25zU2V0dGluZ3M6IHRydWUsXG5cdFx0XHRkaXNhYmxlTW9kZWxTZWxlY3Rpb246IHRydWUsXG5cdFx0XHRkaXNhYmxlUHJvdmlkZXJPcHRpb25zOiB0cnVlLFxuXHRcdFx0ZGlzYWJsZUNvbXBsZXRpb25zU25vb3plOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChtYWluV2luZG93LCAoKSA9PiB7XG5cdFx0XHRpZiAoIWRhc2hib2FyZEVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0sIDIwMDApKTtcblxuXHRcdHJldHVybiBkYXNoYm9hcmRFbGVtZW50O1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0RGFzaGJvYXJkU2VydmljZSwgQ2hhdERhc2hib2FyZFNlcnZpY2VJbXBsLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxh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
