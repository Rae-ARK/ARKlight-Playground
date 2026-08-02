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
import "./mobileChatShell.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { $, addDisposableListener, append, EventType } from "../../../../base/browser/dom.js";
import { Emitter } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Separator } from "../../../../base/common/actions.js";
import { localize } from "../../../../nls.js";
import { autorun } from "../../../../base/common/observable.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IAuthenticationService } from "../../../../workbench/services/authentication/common/authentication.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { IsNewChatSessionContext } from "../../../common/contextkeys.js";
import { SideBarVisibleContext } from "../../../../workbench/common/contextkeys.js";
import { Menus } from "../../menus.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../workbench/services/chat/common/chatEntitlementService.js";
import { getAccountTitleBarState, getAccountProfileImageUrl, getAccountTitleBarBadgeKey, resolveAccountInfo } from "../../accountTitleBarState.js";
import { IChatDashboardService } from "../../chatDashboardService.js";
import { MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID } from "./contributions/mobileChangesView.js";
let MobileTitlebarPart = class extends Disposable {
  constructor(parent, instantiationService, sessionsService, contextKeyService, defaultAccountService, authenticationService, chatEntitlementService, menuService, chatDashboardService, commandService) {
    super();
    this.sessionsService = sessionsService;
    this.contextKeyService = contextKeyService;
    this.defaultAccountService = defaultAccountService;
    this.authenticationService = authenticationService;
    this.chatEntitlementService = chatEntitlementService;
    this.menuService = menuService;
    this.chatDashboardService = chatDashboardService;
    this.commandService = commandService;
    this._onDidClickHamburger = this._register(new Emitter());
    this.onDidClickHamburger = this._onDidClickHamburger.event;
    this._onDidClickNewSession = this._register(new Emitter());
    this.onDidClickNewSession = this._onDidClickNewSession.event;
    this._onDidClickTitle = this._register(new Emitter());
    this.onDidClickTitle = this._onDidClickTitle.event;
    this.isAccountLoading = true;
    this.accountRequestCounter = 0;
    this.avatarRequestCounter = 0;
    this.isAccountMenuVisible = false;
    this.accountPanelDisposable = this._register(new MutableDisposable());
    this.avatarLoadDisposable = this._register(new MutableDisposable());
    this.copilotDashboardStore = this._register(new MutableDisposable());
    // Changes pill state — kept here so the click handler can read the
    // latest set without re-deriving it on each tap.
    this.latestChanges = [];
    this.element = document.createElement("div");
    this.element.className = "mobile-top-bar";
    this._register(toDisposable(() => this.element.remove()));
    parent.prepend(this.element);
    const hamburger = append(this.element, $("button.mobile-top-bar-button"));
    hamburger.setAttribute("aria-label", localize("mobileTopBar.openSessions", "Open sessions"));
    const hamburgerIcon = append(hamburger, $("span"));
    const closedIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeftOff);
    const openIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeft);
    hamburgerIcon.classList.add(...closedIconClasses);
    this._register(addDisposableListener(hamburger, EventType.CLICK, () => this._onDidClickHamburger.fire()));
    const sidebarVisibleKeySet = /* @__PURE__ */ new Set([SideBarVisibleContext.key]);
    const updateSidebarIcon = () => {
      const isOpen = !!SideBarVisibleContext.getValue(contextKeyService);
      hamburgerIcon.classList.remove(...closedIconClasses, ...openIconClasses);
      hamburgerIcon.classList.add(...isOpen ? openIconClasses : closedIconClasses);
      hamburger.setAttribute("aria-label", isOpen ? localize("mobileTopBar.closeSessions", "Close sessions") : localize("mobileTopBar.openSessions", "Open sessions"));
    };
    updateSidebarIcon();
    const center = append(this.element, $("div.mobile-top-bar-center"));
    this.sessionTitleElement = append(center, $("button.mobile-session-title"));
    this.sessionTitleElement.setAttribute("type", "button");
    this.sessionTitleElement.textContent = localize("mobileTopBar.newSession", "New Session");
    this._register(addDisposableListener(this.sessionTitleElement, EventType.CLICK, () => this._onDidClickTitle.fire()));
    this.actionsContainer = append(center, $("div.mobile-top-bar-actions"));
    const changesPill = append(this.element, $("button.mobile-top-bar-button.mobile-changes-pill", { type: "button" }));
    changesPill.setAttribute("aria-label", localize("mobileTopBar.changes", "View changes"));
    changesPill.style.display = "none";
    const changesIcon = append(changesPill, $("span.mobile-changes-pill-icon"));
    changesIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
    const changesAddedEl = append(changesPill, $("span.mobile-changes-pill-added"));
    const changesRemovedEl = append(changesPill, $("span.mobile-changes-pill-removed"));
    this._register(addDisposableListener(changesPill, EventType.CLICK, () => this.showChangesPicker()));
    const newSessionButton = append(this.element, $("button.mobile-top-bar-button.mobile-new-session-button"));
    newSessionButton.setAttribute("aria-label", localize("mobileTopBar.newSessionAria", "New session"));
    const newSessionIcon = append(newSessionButton, $("span"));
    newSessionIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plus));
    this._register(addDisposableListener(newSessionButton, EventType.CLICK, () => this._onDidClickNewSession.fire()));
    this.accountButton = append(this.element, $("button.mobile-top-bar-button.mobile-account-indicator"));
    this.accountButton.setAttribute("aria-label", localize("mobileTopBar.account", "Account"));
    this.accountAvatarElement = append(this.accountButton, $("img.mobile-account-avatar", { alt: "", draggable: "false" }));
    this.accountAvatarElement.decoding = "async";
    this.accountAvatarElement.referrerPolicy = "no-referrer";
    this.accountIconElement = append(this.accountButton, $("span"));
    this.accountBadgeElement = append(this.accountButton, $("span.mobile-account-badge"));
    this._register(addDisposableListener(this.accountButton, EventType.CLICK, () => this.showAccountPanel()));
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
    this._register(this.authenticationService.onDidChangeSessions(() => this.refreshAccount()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderAccountState()));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderAccountState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderAccountState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderAccountState()));
    this.refreshAccount();
    this._register(autorun((reader) => {
      const session = this.sessionsService.activeSession.read(reader);
      const title = session?.title.read(reader);
      this.sessionTitleElement.textContent = title || localize("mobileTopBar.newSession", "New Session");
    }));
    const isNewChatRef = { value: !!IsNewChatSessionContext.getValue(contextKeyService) };
    const renderChangesPill = () => {
      const changes = this.latestChanges;
      let added = 0;
      let removed = 0;
      for (const c of changes) {
        added += c.insertions;
        removed += c.deletions;
      }
      const hasChanges = changes.length > 0;
      const visible = hasChanges && !isNewChatRef.value;
      changesPill.style.display = visible ? "" : "none";
      if (visible) {
        if (added > 0 || removed > 0) {
          changesAddedEl.textContent = `+${added}`;
          changesRemovedEl.textContent = `-${removed}`;
          changesPill.title = localize("mobileTopBar.changesTooltip", "{0} files changed (+{1} -{2})", changes.length, added, removed);
        } else {
          changesAddedEl.textContent = changes.length === 1 ? localize("mobileTopBar.singleFileChanged", "1 file") : localize("mobileTopBar.filesChangedCount", "{0} files", changes.length);
          changesRemovedEl.textContent = "";
          changesPill.title = changes.length === 1 ? localize("mobileTopBar.singleFileChangedTooltip", "1 file changed") : localize("mobileTopBar.filesChangedTooltip", "{0} files changed", changes.length);
        }
      }
    };
    this._register(autorun((reader) => {
      const session = this.sessionsService.activeSession.read(reader);
      this.latestChanges = session?.changes.read(reader) ?? [];
      renderChangesPill();
    }));
    const toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this.actionsContainer, Menus.MobileTitleBarCenter, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "mobileTitlebar.center",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const newChatKeySet = /* @__PURE__ */ new Set([IsNewChatSessionContext.key]);
    const updateCenterMode = () => {
      const isNewChat = !!IsNewChatSessionContext.getValue(contextKeyService);
      const hasActions = toolbar.getItemsLength() > 0;
      this.element.classList.toggle("show-actions", isNewChat && hasActions);
      newSessionButton.style.display = isNewChat ? "none" : "";
      this.accountButton.style.display = isNewChat ? "" : "none";
      isNewChatRef.value = isNewChat;
      renderChangesPill();
    };
    updateCenterMode();
    this._register(contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(newChatKeySet)) {
        updateCenterMode();
      }
      if (e.affectsSome(sidebarVisibleKeySet)) {
        updateSidebarIcon();
      }
    }));
    this._register(toolbar.onDidChangeMenuItems(() => updateCenterMode()));
  }
  /**
   * Explicitly set the title shown in the center slot. Called only when
   * overriding the live session title (tests, placeholders). The live
   * subscription will overwrite this on the next session change.
   */
  setTitle(title) {
    this.sessionTitleElement.textContent = title;
  }
  // --- Changes Pill --- //
  /**
   * Tap handler for the changes pill. Opens the dedicated mobile
   * Changes overlay (a master list with file icons + add/remove
   * counts) via {@link MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID}. The
   * overlay's own row taps fan out into per-file diff views with
   * prev/next navigation.
   *
   * The list overlay handles its own single-file shortcut, so the
   * caller just dispatches the command unconditionally.
   */
  showChangesPicker() {
    if (!this.latestChanges.length) {
      return;
    }
    this.commandService.executeCommand(MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID);
  }
  // --- Account Indicator --- //
  async refreshAccount() {
    const requestId = ++this.accountRequestCounter;
    this.isAccountLoading = true;
    this.renderAccountState();
    const info = await resolveAccountInfo(this.defaultAccountService, this.authenticationService);
    if (requestId !== this.accountRequestCounter || this._store.isDisposed) {
      return;
    }
    this.accountName = info?.accountName;
    this.accountProviderId = info?.accountProviderId;
    this.accountProviderLabel = info?.accountProviderLabel;
    this.isAccountLoading = false;
    this.refreshAvatar();
    this.renderAccountState();
  }
  renderAccountState() {
    const entitlement = this.accountName && this.chatEntitlementService.entitlement === ChatEntitlement.Unknown ? ChatEntitlement.Unresolved : this.chatEntitlementService.entitlement;
    const state = getAccountTitleBarState({
      isAccountLoading: this.isAccountLoading,
      accountName: this.accountName,
      accountProviderLabel: this.accountProviderLabel,
      entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas
    });
    const hasAvatar = !!this.loadedAvatarUrl && !this.isAccountLoading;
    this.accountAvatarElement.classList.toggle("visible", hasAvatar);
    if (hasAvatar && this.accountAvatarElement.src !== this.loadedAvatarUrl) {
      this.accountAvatarElement.src = this.loadedAvatarUrl;
    } else if (!hasAvatar) {
      this.accountAvatarElement.removeAttribute("src");
    }
    const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;
    this.accountIconElement.className = ThemeIcon.asClassName(titleBarIcon);
    this.accountIconElement.classList.toggle("hidden", hasAvatar);
    const badgeKey = getAccountTitleBarBadgeKey(state);
    if (badgeKey !== this.lastBadgeKey) {
      this.lastBadgeKey = badgeKey;
      this.dismissedBadgeKey = void 0;
    }
    const showBadge = !!badgeKey && badgeKey !== this.dismissedBadgeKey;
    this.accountBadgeElement.style.display = showBadge ? "" : "none";
    this.accountBadgeElement.classList.toggle("dot-badge-warning", showBadge && state.dotBadge === "warning");
    this.accountBadgeElement.classList.toggle("dot-badge-error", showBadge && state.dotBadge === "error");
    this.accountButton.setAttribute("aria-label", state.ariaLabel);
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
      this.renderAccountState();
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
      this.renderAccountState();
      clearHandlers();
    };
    image.onerror = () => {
      if (requestId !== this.avatarRequestCounter) {
        return;
      }
      this.loadedAvatarUrl = void 0;
      this.renderAccountState();
      clearHandlers();
    };
    this.avatarLoadDisposable.value = toDisposable(() => {
      clearHandlers();
      image.src = "";
    });
    image.src = avatarUrl;
  }
  // --- Account Sheet --- //
  showAccountPanel() {
    if (this.isAccountMenuVisible) {
      this.accountPanelDisposable.clear();
      return;
    }
    this.accountPanelDisposable.clear();
    const panelStore = new DisposableStore();
    this.accountPanelDisposable.value = panelStore;
    const badgeKey = getAccountTitleBarBadgeKey(getAccountTitleBarState({
      isAccountLoading: this.isAccountLoading,
      accountName: this.accountName,
      accountProviderLabel: this.accountProviderLabel,
      entitlement: this.chatEntitlementService.entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas
    }));
    if (badgeKey) {
      this.dismissedBadgeKey = badgeKey;
    }
    this.isAccountMenuVisible = true;
    this.renderAccountState();
    panelStore.add({
      dispose: () => {
        this.isAccountMenuVisible = false;
        this.copilotDashboardStore.clear();
        this.renderAccountState();
      }
    });
    const closeSheet = () => this.accountPanelDisposable.clear();
    const workbenchContainer = this.element.parentElement;
    const sheet = append(workbenchContainer, $("div.mobile-account-sheet"));
    panelStore.add(toDisposable(() => sheet.remove()));
    const header = append(sheet, $("div.mobile-account-sheet-header"));
    const headerTitle = append(header, $("h2.mobile-account-sheet-title"));
    headerTitle.textContent = localize("mobileAccount.title", "Account");
    const closeButton = append(header, $("button.mobile-account-sheet-close", { type: "button" }));
    closeButton.setAttribute("aria-label", localize("mobileAccount.close", "Close"));
    append(closeButton, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
    panelStore.add(addDisposableListener(closeButton, EventType.CLICK, closeSheet));
    const content = append(sheet, $("div.mobile-account-sheet-content"));
    const profile = append(content, $("div.mobile-account-sheet-profile"));
    if (this.loadedAvatarUrl) {
      const avatar = append(profile, $("img.mobile-account-sheet-avatar", { alt: "", draggable: "false" }));
      avatar.src = this.loadedAvatarUrl;
      avatar.referrerPolicy = "no-referrer";
      avatar.decoding = "async";
    } else {
      const avatarPlaceholder = append(profile, $("div.mobile-account-sheet-avatar-placeholder"));
      append(avatarPlaceholder, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.account));
    }
    const profileInfo = append(profile, $("div.mobile-account-sheet-profile-info"));
    if (this.isAccountLoading) {
      append(profileInfo, $("div.mobile-account-sheet-name")).textContent = localize("mobileAccount.loading", "Loading...");
    } else if (this.accountName) {
      append(profileInfo, $("div.mobile-account-sheet-name")).textContent = this.accountName;
      if (this.accountProviderLabel) {
        append(profileInfo, $("div.mobile-account-sheet-provider")).textContent = this.accountProviderLabel;
      }
    } else {
      append(profileInfo, $("div.mobile-account-sheet-name")).textContent = localize("mobileAccount.signedOut", "Not signed in");
    }
    const entitlement = this.chatEntitlementService.entitlement;
    const showDashboard = !this.chatEntitlementService.sentiment.hidden && !!this.accountName && entitlement !== ChatEntitlement.Unknown && entitlement !== ChatEntitlement.Available;
    if (showDashboard) {
      const dashboardSection = append(content, $("div.mobile-account-sheet-section"));
      const store = new DisposableStore();
      this.copilotDashboardStore.value = store;
      const dashboardElement = this.chatDashboardService.createDashboardElement(store);
      if (dashboardElement) {
        append(dashboardSection, dashboardElement);
      }
    }
    const actionsSection = append(content, $("div.mobile-account-sheet-actions"));
    const allActions = this.getSheetActions();
    for (const action of allActions) {
      if (action instanceof Separator) {
        append(actionsSection, $("div.mobile-account-sheet-separator"));
        continue;
      }
      const row = append(actionsSection, $("button.mobile-account-sheet-action", { type: "button" }));
      row.disabled = !action.enabled;
      row.setAttribute("aria-label", action.tooltip || action.label);
      const icon = this.getActionIcon(action);
      if (icon) {
        append(row, $("span.mobile-account-sheet-action-icon")).classList.add(...ThemeIcon.asClassNameArray(icon));
      }
      append(row, $("span.mobile-account-sheet-action-label")).textContent = action.label;
      panelStore.add(addDisposableListener(row, EventType.CLICK, async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeSheet();
        await Promise.resolve(action.run());
      }));
    }
  }
  getSheetActions() {
    const menu = this.menuService.createMenu(Menus.AccountMenu, this.contextKeyService);
    const rawActions = [];
    fillInActionBarActions(menu.getActions(), rawActions);
    menu.dispose();
    return rawActions.filter((action) => {
      if (action instanceof Separator) {
        return true;
      }
      if (this.isAccountLoading && action.id === "workbench.action.agenticSignIn") {
        return false;
      }
      return !action.id.startsWith("update.");
    });
  }
  getActionIcon(action) {
    switch (action.id) {
      case "workbench.action.openSettings":
        return Codicon.settingsGear;
      case "workbench.action.agenticSignOut":
        return Codicon.signOut;
      case "workbench.action.agenticSignIn":
        return Codicon.signIn;
      default:
        return void 0;
    }
  }
};
MobileTitlebarPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IDefaultAccountService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IChatEntitlementService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IChatDashboardService),
  __decorateParam(9, ICommandService)
], MobileTitlebarPart);
export {
  MobileTitlebarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZVRpdGxlYmFyUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tb2JpbGVDaGF0U2hlbGwuY3NzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZmlsbEluQWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25GaWxlQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2lkZUJhclZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uL21lbnVzLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgQ2hhdEVudGl0bGVtZW50U2VydmljZSwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZSwgZ2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCwgZ2V0QWNjb3VudFRpdGxlQmFyQmFkZ2VLZXksIHJlc29sdmVBY2NvdW50SW5mbyB9IGZyb20gJy4uLy4uL2FjY291bnRUaXRsZUJhclN0YXRlLmpzJztcbmltcG9ydCB7IElDaGF0RGFzaGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXREYXNoYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1PQklMRV9PUEVOX0NIQU5HRVNfVklFV19DT01NQU5EX0lEIH0gZnJvbSAnLi9jb250cmlidXRpb25zL21vYmlsZUNoYW5nZXNWaWV3LmpzJztcblxuLyoqXG4gKiBNb2JpbGUgdGl0bGViYXIgXHUyMDE0IHByZXBlbmRlZCBhYm92ZSB0aGUgd29ya2JlbmNoIGdyaWQgb24gcGhvbmUgdmlld3BvcnRzXG4gKiBpbiBwbGFjZSBvZiB0aGUgZGVza3RvcCB0aXRsZWJhci5cbiAqXG4gKiBMYXlvdXQgKGNvbnRleHR1YWwgcmlnaHQgc2xvdCk6XG4gKlxuICogIC0gKipJbiBhIGNoYXQgc2Vzc2lvbioqIFx1MjE5MiBgW3RvZ2dsZSBzaWRlYmFyXSAgW3Nlc3Npb24gdGl0bGVdICBbY2hhbmdlcyBwaWxsXSAgWytdYFxuICogIC0gKipXZWxjb21lIC8gbmV3IHNlc3Npb24qKiBcdTIxOTIgYFt0b2dnbGUgc2lkZWJhcl0gIFtob3N0IHdpZGdldCB8IHRpdGxlXSAgW2FjY291bnRdYFxuICpcbiAqIFRoZSBjZW50ZXIgc2xvdCBzd2l0Y2hlcyBjb250ZW50IGJhc2VkIG9uIHdoZXRoZXIgdGhlIHNlc3Npb25zIHdlbGNvbWVcbiAqIChob21lL2VtcHR5KSBzY3JlZW4gaXMgdmlzaWJsZTpcbiAqXG4gKiAgLSAqKldlbGNvbWUgaGlkZGVuKiogXHUyMTkyIHNob3dzIHRoZSBhY3RpdmUgc2Vzc2lvbiB0aXRsZSAobGl2ZSwgZnJvbVxuICogICAge0BsaW5rIElTZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbn0pLlxuICogIC0gKipXZWxjb21lIHZpc2libGUqKiBcdTIxOTIgc2hvd3Mgd2hhdGV2ZXIgaXMgY29udHJpYnV0ZWQgdG8gdGhlXG4gKiAgICB7QGxpbmsgTWVudXMuTW9iaWxlVGl0bGVCYXJDZW50ZXJ9IG1lbnUuIE9uIHdlYiwgdGhlIGhvc3QgZmlsdGVyXG4gKiAgICBjb250cmlidXRpb24gYXBwZW5kcyBpdHMgaG9zdCBkcm9wZG93biArIGNvbm5lY3Rpb24gYnV0dG9uIHRoZXJlLlxuICpcbiAqIFRoZSBzd2l0Y2ggaXMgZHJpdmVuIGVudGlyZWx5IGJ5IHRoZSBtZW51OiB3aGVuIHRoZSB0b29sYmFyIGhhcyBub1xuICogaXRlbXMgdGhlIHRpdGxlIGlzIHNob3duOyBhcyBzb29uIGFzIGl0IGhhcyBpdGVtcyB0aGUgdGl0bGUgaXMgaGlkZGVuXG4gKiBhbmQgdGhlIHRvb2xiYXIgZmlsbHMgdGhlIHNsb3QuXG4gKlxuICogVGhlIHJpZ2h0IHNsb3Qgc3dhcHMgYmV0d2VlbiB0aGUgbmV3LXNlc3Npb24gKCspIGJ1dHRvbiAoaW4gYSBjaGF0KVxuICogYW5kIHRoZSBhY2NvdW50IGluZGljYXRvciAob24gd2VsY29tZSAvIG5ldyBzZXNzaW9uKS4gVGhlIGFjY291bnRcbiAqIGluZGljYXRvciBzaG93cyB0aGUgdXNlcidzIGF2YXRhciBvciBhIHBlcnNvbiBpY29uIHdpdGggYW4gb3B0aW9uYWxcbiAqIGRvdCBiYWRnZSBmb3IgcXVvdGEvc3RhdHVzIHdhcm5pbmdzLiBUYXBwaW5nIGl0IG9wZW5zIGEgcGFuZWwgd2l0aFxuICogYWNjb3VudCBpbmZvLCBjb3BpbG90IHN0YXR1cyBkYXNoYm9hcmQsIGFuZCBzaWduLWluL3NpZ24tb3V0IGFjdGlvbnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBNb2JpbGVUaXRsZWJhclBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25UaXRsZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tIYW1idXJnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGlja0hhbWJ1cmdlcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENsaWNrSGFtYnVyZ2VyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tOZXdTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tOZXdTZXNzaW9uOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2xpY2tOZXdTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tUaXRsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrVGl0bGU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbGlja1RpdGxlLmV2ZW50O1xuXG5cdC8vIEFjY291bnQgaW5kaWNhdG9yIHN0YXRlXG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEJ1dHRvbjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEF2YXRhckVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEljb25FbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBhY2NvdW50QmFkZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBhY2NvdW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFjY291bnRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWNjb3VudFByb3ZpZGVyTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpc0FjY291bnRMb2FkaW5nID0gdHJ1ZTtcblx0cHJpdmF0ZSBhY2NvdW50UmVxdWVzdENvdW50ZXIgPSAwO1xuXHRwcml2YXRlIGF2YXRhclJlcXVlc3RDb3VudGVyID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50QXZhdGFyVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbG9hZGVkQXZhdGFyVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXNBY2NvdW50TWVudVZpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBsYXN0QmFkZ2VLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkaXNtaXNzZWRCYWRnZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjY291bnRQYW5lbERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhdmF0YXJMb2FkRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb3BpbG90RGFzaGJvYXJkU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHQvLyBDaGFuZ2VzIHBpbGwgc3RhdGUgXHUyMDE0IGtlcHQgaGVyZSBzbyB0aGUgY2xpY2sgaGFuZGxlciBjYW4gcmVhZCB0aGVcblx0Ly8gbGF0ZXN0IHNldCB3aXRob3V0IHJlLWRlcml2aW5nIGl0IG9uIGVhY2ggdGFwLlxuXHRwcml2YXRlIGxhdGVzdENoYW5nZXM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNoYXREYXNoYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdERhc2hib2FyZFNlcnZpY2U6IElDaGF0RGFzaGJvYXJkU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc05hbWUgPSAnbW9iaWxlLXRvcC1iYXInO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgRE9NIHJlbW92YWwgYmVmb3JlIGFwcGVuZGluZyBzbyB0aGF0IGFueSBleGNlcHRpb25cblx0XHQvLyBiZXR3ZWVuIHRoaXMgcG9pbnQgYW5kIHRoZSBlbmQgb2YgdGhlIGNvbnN0cnVjdG9yIHN0aWxsIGNsZWFuc1xuXHRcdC8vIHVwIHRoZSBlbGVtZW50IHZpYSBkaXNwb3NhbC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5lbGVtZW50LnJlbW92ZSgpKSk7XG5cdFx0cGFyZW50LnByZXBlbmQodGhpcy5lbGVtZW50KTtcblxuXHRcdC8vIFNpZGViYXIgdG9nZ2xlIGJ1dHRvbi4gVXNlcyB0aGUgc2FtZSBpY29uIGFzIHRoZSBkZXNrdG9wL3dlYlxuXHRcdC8vIGFnZW50cy1hcHAgc2lkZWJhciB0b2dnbGUgYW5kIHJlZmxlY3RzIG9wZW4vY2xvc2VkIHN0YXRlIHZpYSB0aGVcblx0XHQvLyBTaWRlQmFyVmlzaWJsZUNvbnRleHQga2V5LlxuXHRcdGNvbnN0IGhhbWJ1cmdlciA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ2J1dHRvbi5tb2JpbGUtdG9wLWJhci1idXR0b24nKSk7XG5cdFx0aGFtYnVyZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdtb2JpbGVUb3BCYXIub3BlblNlc3Npb25zJywgXCJPcGVuIHNlc3Npb25zXCIpKTtcblx0XHRjb25zdCBoYW1idXJnZXJJY29uID0gYXBwZW5kKGhhbWJ1cmdlciwgJCgnc3BhbicpKTtcblx0XHRjb25zdCBjbG9zZWRJY29uQ2xhc3NlcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubGF5b3V0U2lkZWJhckxlZnRPZmYpO1xuXHRcdGNvbnN0IG9wZW5JY29uQ2xhc3NlcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubGF5b3V0U2lkZWJhckxlZnQpO1xuXHRcdGhhbWJ1cmdlckljb24uY2xhc3NMaXN0LmFkZCguLi5jbG9zZWRJY29uQ2xhc3Nlcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhhbWJ1cmdlciwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLl9vbkRpZENsaWNrSGFtYnVyZ2VyLmZpcmUoKSkpO1xuXG5cdFx0Y29uc3Qgc2lkZWJhclZpc2libGVLZXlTZXQgPSBuZXcgU2V0KFtTaWRlQmFyVmlzaWJsZUNvbnRleHQua2V5XSk7XG5cdFx0Y29uc3QgdXBkYXRlU2lkZWJhckljb24gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBpc09wZW4gPSAhIVNpZGVCYXJWaXNpYmxlQ29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRoYW1idXJnZXJJY29uLmNsYXNzTGlzdC5yZW1vdmUoLi4uY2xvc2VkSWNvbkNsYXNzZXMsIC4uLm9wZW5JY29uQ2xhc3Nlcyk7XG5cdFx0XHRoYW1idXJnZXJJY29uLmNsYXNzTGlzdC5hZGQoLi4uKGlzT3BlbiA/IG9wZW5JY29uQ2xhc3NlcyA6IGNsb3NlZEljb25DbGFzc2VzKSk7XG5cdFx0XHRoYW1idXJnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgaXNPcGVuXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21vYmlsZVRvcEJhci5jbG9zZVNlc3Npb25zJywgXCJDbG9zZSBzZXNzaW9uc1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdtb2JpbGVUb3BCYXIub3BlblNlc3Npb25zJywgXCJPcGVuIHNlc3Npb25zXCIpKTtcblx0XHR9O1xuXHRcdHVwZGF0ZVNpZGViYXJJY29uKCk7XG5cblx0XHQvLyBDZW50ZXIgc2xvdDogdGl0bGUgYW5kL29yIGFjdGlvbnMgY29udGFpbmVyIChtdXR1YWxseSBleGNsdXNpdmUpXG5cdFx0Y29uc3QgY2VudGVyID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnZGl2Lm1vYmlsZS10b3AtYmFyLWNlbnRlcicpKTtcblxuXHRcdHRoaXMuc2Vzc2lvblRpdGxlRWxlbWVudCA9IGFwcGVuZChjZW50ZXIsICQoJ2J1dHRvbi5tb2JpbGUtc2Vzc2lvbi10aXRsZScpKTtcblx0XHR0aGlzLnNlc3Npb25UaXRsZUVsZW1lbnQuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuc2Vzc2lvblRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtb2JpbGVUb3BCYXIubmV3U2Vzc2lvbicsIFwiTmV3IFNlc3Npb25cIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc2Vzc2lvblRpdGxlRWxlbWVudCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLl9vbkRpZENsaWNrVGl0bGUuZmlyZSgpKSk7XG5cblx0XHR0aGlzLmFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQoY2VudGVyLCAkKCdkaXYubW9iaWxlLXRvcC1iYXItYWN0aW9ucycpKTtcblxuXHRcdC8vIFJpZ2h0IHNsb3QgXHUyMDE0IGxhaWQgb3V0IGxlZnQtdG8tcmlnaHQgaW4gRE9NIG9yZGVyLiBUaGUgbmV3LXNlc3Npb25cblx0XHQvLyAoKykgYnV0dG9uIGlzIGFwcGVuZGVkIExBU1Qgc28gaXQgYWx3YXlzIHNpdHMgYXQgdGhlIHJpZ2h0IGVkZ2UsXG5cdFx0Ly8gZXZlbiB3aGVuIHRoZSBjaGFuZ2VzIHBpbGwgaXMgdmlzaWJsZS5cblxuXHRcdC8vIENoYW5nZXMgcGlsbCBcdTIwMTQgc2hvd24gd2hlbiBpbiBhIGNoYXQgdGhhdCBoYXMgcHJvZHVjZWQgY2hhbmdlcy5cblx0XHQvLyBUYXAgXHUyMTkyIG9wZW5zIGEgZmlsZSBwaWNrZXI7IHNlbGVjdGluZyBhIGZpbGUgaW52b2tlcyB0aGVcblx0XHQvLyBgc2Vzc2lvbnMubW9iaWxlLm9wZW5EaWZmVmlld2AgY29tbWFuZCBmb3IgdGhhdCBmaWxlJ3MgZGlmZi5cblx0XHRjb25zdCBjaGFuZ2VzUGlsbCA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ2J1dHRvbi5tb2JpbGUtdG9wLWJhci1idXR0b24ubW9iaWxlLWNoYW5nZXMtcGlsbCcsIHsgdHlwZTogJ2J1dHRvbicgfSkpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdGNoYW5nZXNQaWxsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdtb2JpbGVUb3BCYXIuY2hhbmdlcycsIFwiVmlldyBjaGFuZ2VzXCIpKTtcblx0XHRjaGFuZ2VzUGlsbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGNvbnN0IGNoYW5nZXNJY29uID0gYXBwZW5kKGNoYW5nZXNQaWxsLCAkKCdzcGFuLm1vYmlsZS1jaGFuZ2VzLXBpbGwtaWNvbicpKTtcblx0XHRjaGFuZ2VzSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlmZk11bHRpcGxlKSk7XG5cdFx0Y29uc3QgY2hhbmdlc0FkZGVkRWwgPSBhcHBlbmQoY2hhbmdlc1BpbGwsICQoJ3NwYW4ubW9iaWxlLWNoYW5nZXMtcGlsbC1hZGRlZCcpKTtcblx0XHRjb25zdCBjaGFuZ2VzUmVtb3ZlZEVsID0gYXBwZW5kKGNoYW5nZXNQaWxsLCAkKCdzcGFuLm1vYmlsZS1jaGFuZ2VzLXBpbGwtcmVtb3ZlZCcpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2hhbmdlc1BpbGwsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5zaG93Q2hhbmdlc1BpY2tlcigpKSk7XG5cblx0XHQvLyBOZXcgc2Vzc2lvbiBidXR0b24gKCspIFx1MjAxNCBzaG93biB3aGVuIGluIGEgY2hhdCwgaGlkZGVuIG9uIHdlbGNvbWUuXG5cdFx0Ly8gQWx3YXlzIHJpZ2h0bW9zdCB3aGVuIGluIGEgY2hhdC5cblx0XHRjb25zdCBuZXdTZXNzaW9uQnV0dG9uID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnYnV0dG9uLm1vYmlsZS10b3AtYmFyLWJ1dHRvbi5tb2JpbGUtbmV3LXNlc3Npb24tYnV0dG9uJykpO1xuXHRcdG5ld1Nlc3Npb25CdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ21vYmlsZVRvcEJhci5uZXdTZXNzaW9uQXJpYScsIFwiTmV3IHNlc3Npb25cIikpO1xuXHRcdGNvbnN0IG5ld1Nlc3Npb25JY29uID0gYXBwZW5kKG5ld1Nlc3Npb25CdXR0b24sICQoJ3NwYW4nKSk7XG5cdFx0bmV3U2Vzc2lvbkljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnBsdXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIobmV3U2Vzc2lvbkJ1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLl9vbkRpZENsaWNrTmV3U2Vzc2lvbi5maXJlKCkpKTtcblxuXHRcdC8vIEFjY291bnQgaW5kaWNhdG9yIFx1MjAxNCBzaG93biBvbiB3ZWxjb21lL25ldyBzZXNzaW9uLCBoaWRkZW4gaW4gYSBjaGF0XG5cdFx0dGhpcy5hY2NvdW50QnV0dG9uID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnYnV0dG9uLm1vYmlsZS10b3AtYmFyLWJ1dHRvbi5tb2JpbGUtYWNjb3VudC1pbmRpY2F0b3InKSk7XG5cdFx0dGhpcy5hY2NvdW50QnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdtb2JpbGVUb3BCYXIuYWNjb3VudCcsIFwiQWNjb3VudFwiKSk7XG5cdFx0dGhpcy5hY2NvdW50QXZhdGFyRWxlbWVudCA9IGFwcGVuZCh0aGlzLmFjY291bnRCdXR0b24sICQoJ2ltZy5tb2JpbGUtYWNjb3VudC1hdmF0YXInLCB7IGFsdDogJycsIGRyYWdnYWJsZTogJ2ZhbHNlJyB9KSkgYXMgSFRNTEltYWdlRWxlbWVudDtcblx0XHR0aGlzLmFjY291bnRBdmF0YXJFbGVtZW50LmRlY29kaW5nID0gJ2FzeW5jJztcblx0XHR0aGlzLmFjY291bnRBdmF0YXJFbGVtZW50LnJlZmVycmVyUG9saWN5ID0gJ25vLXJlZmVycmVyJztcblx0XHR0aGlzLmFjY291bnRJY29uRWxlbWVudCA9IGFwcGVuZCh0aGlzLmFjY291bnRCdXR0b24sICQoJ3NwYW4nKSk7XG5cdFx0dGhpcy5hY2NvdW50QmFkZ2VFbGVtZW50ID0gYXBwZW5kKHRoaXMuYWNjb3VudEJ1dHRvbiwgJCgnc3Bhbi5tb2JpbGUtYWNjb3VudC1iYWRnZScpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5hY2NvdW50QnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuc2hvd0FjY291bnRQYW5lbCgpKSk7XG5cblx0XHQvLyBUcmFjayBhY2NvdW50IHN0YXRlIFx1MjAxNCBsaXN0ZW4gdG8gbXVsdGlwbGUgc291cmNlcyB0byBjYXRjaFxuXHRcdC8vIHVwZGF0ZXMgcmVnYXJkbGVzcyBvZiBzZXJ2aWNlIGluaXRpYWxpemF0aW9uIG9yZGVyaW5nLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQoKCkgPT4gdGhpcy5yZWZyZXNoQWNjb3VudCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB0aGlzLnJlZnJlc2hBY2NvdW50KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbnRpdGxlbWVudCgoKSA9PiB0aGlzLnJlbmRlckFjY291bnRTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkKCgpID0+IHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZygoKSA9PiB0aGlzLnJlbmRlckFjY291bnRTdGF0ZSgpKSk7XG5cdFx0dGhpcy5yZWZyZXNoQWNjb3VudCgpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgdGl0bGUgaW4gc3luYyB3aXRoIHRoZSBhY3RpdmUgc2Vzc2lvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRpdGxlID0gc2Vzc2lvbj8udGl0bGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5zZXNzaW9uVGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gdGl0bGUgfHwgbG9jYWxpemUoJ21vYmlsZVRvcEJhci5uZXdTZXNzaW9uJywgXCJOZXcgU2Vzc2lvblwiKTtcblx0XHR9KSk7XG5cblx0XHQvLyBLZWVwIHRoZSBjaGFuZ2VzIHBpbGwgaW4gc3luYyB3aXRoIHRoZSBhY3RpdmUgc2Vzc2lvbidzIGNoYW5nZXMuXG5cdFx0Ly8gSGlkZGVuIHdoZW4gdGhlcmUgYXJlIG5vIGNoYW5nZXMgKGNvdW50cyBhcmUgemVybyBhbmQgbGlzdCBpcyBlbXB0eSkuXG5cdFx0Y29uc3QgaXNOZXdDaGF0UmVmID0geyB2YWx1ZTogISFJc05ld0NoYXRTZXNzaW9uQ29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSkgfTtcblx0XHRjb25zdCByZW5kZXJDaGFuZ2VzUGlsbCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmxhdGVzdENoYW5nZXM7XG5cdFx0XHRsZXQgYWRkZWQgPSAwO1xuXHRcdFx0bGV0IHJlbW92ZWQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0YWRkZWQgKz0gYy5pbnNlcnRpb25zO1xuXHRcdFx0XHRyZW1vdmVkICs9IGMuZGVsZXRpb25zO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaGFzQ2hhbmdlcyA9IGNoYW5nZXMubGVuZ3RoID4gMDtcblx0XHRcdC8vIEhpZGUgb24gd2VsY29tZSAvIG5ldy1jaGF0IFx1MjAxNCBubyBzZXNzaW9uIGNoYW5nZXMgdG8gdmlldyB0aGVyZS5cblx0XHRcdGNvbnN0IHZpc2libGUgPSBoYXNDaGFuZ2VzICYmICFpc05ld0NoYXRSZWYudmFsdWU7XG5cdFx0XHRjaGFuZ2VzUGlsbC5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0aWYgKGFkZGVkID4gMCB8fCByZW1vdmVkID4gMCkge1xuXHRcdFx0XHRcdGNoYW5nZXNBZGRlZEVsLnRleHRDb250ZW50ID0gYCske2FkZGVkfWA7XG5cdFx0XHRcdFx0Y2hhbmdlc1JlbW92ZWRFbC50ZXh0Q29udGVudCA9IGAtJHtyZW1vdmVkfWA7XG5cdFx0XHRcdFx0Y2hhbmdlc1BpbGwudGl0bGUgPSBsb2NhbGl6ZSgnbW9iaWxlVG9wQmFyLmNoYW5nZXNUb29sdGlwJywgXCJ7MH0gZmlsZXMgY2hhbmdlZCAoK3sxfSAtezJ9KVwiLCBjaGFuZ2VzLmxlbmd0aCwgYWRkZWQsIHJlbW92ZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoYW5nZXNBZGRlZEVsLnRleHRDb250ZW50ID0gY2hhbmdlcy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vYmlsZVRvcEJhci5zaW5nbGVGaWxlQ2hhbmdlZCcsIFwiMSBmaWxlXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2JpbGVUb3BCYXIuZmlsZXNDaGFuZ2VkQ291bnQnLCBcInswfSBmaWxlc1wiLCBjaGFuZ2VzLmxlbmd0aCk7XG5cdFx0XHRcdFx0Y2hhbmdlc1JlbW92ZWRFbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdGNoYW5nZXNQaWxsLnRpdGxlID0gY2hhbmdlcy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vYmlsZVRvcEJhci5zaW5nbGVGaWxlQ2hhbmdlZFRvb2x0aXAnLCBcIjEgZmlsZSBjaGFuZ2VkXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2JpbGVUb3BCYXIuZmlsZXNDaGFuZ2VkVG9vbHRpcCcsIFwiezB9IGZpbGVzIGNoYW5nZWRcIiwgY2hhbmdlcy5sZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLmxhdGVzdENoYW5nZXMgPSBzZXNzaW9uPy5jaGFuZ2VzLnJlYWQocmVhZGVyKSA/PyBbXTtcblx0XHRcdHJlbmRlckNoYW5nZXNQaWxsKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTW91bnQgdGhlIGNlbnRlciB0b29sYmFyIChob3N0IGZpbHRlciB3aWRnZXQgb24gd2ViIHdlbGNvbWUsIGV0Yy4pXG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLmFjdGlvbnNDb250YWluZXIsIE1lbnVzLk1vYmlsZVRpdGxlQmFyQ2VudGVyLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdtb2JpbGVUaXRsZWJhci5jZW50ZXInLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3dpdGNoIGJldHdlZW4gdGl0bGUgYW5kIHRvb2xiYXIgYmFzZWQgb24gd2hldGhlciBhIG5ldyAoZW1wdHkpXG5cdFx0Ly8gY2hhdCBzZXNzaW9uIGlzIGFjdGl2ZSBBTkQgd2hldGhlciB0aGUgdG9vbGJhciBoYXMgYW55dGhpbmcgdG9cblx0XHQvLyBzaG93LiBUaGUgbGF0dGVyIGlzIGltcG9ydGFudCBiZWNhdXNlIG9uIGRlc2t0b3AvZWxlY3Ryb24gb3Jcblx0XHQvLyB3aGVuIG5vIGFnZW50IGhvc3RzIGFyZSBjb25maWd1cmVkIHRoZSB0b29sYmFyIGNhbiBiZSBlbXB0eSBcdTIwMTRcblx0XHQvLyBpbiB0aGF0IGNhc2Ugd2Uga2VlcCB0aGUgdGl0bGUgdmlzaWJsZS5cblx0XHRjb25zdCBuZXdDaGF0S2V5U2V0ID0gbmV3IFNldChbSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQua2V5XSk7XG5cdFx0Y29uc3QgdXBkYXRlQ2VudGVyTW9kZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGlzTmV3Q2hhdCA9ICEhSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgaGFzQWN0aW9ucyA9IHRvb2xiYXIuZ2V0SXRlbXNMZW5ndGgoKSA+IDA7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy1hY3Rpb25zJywgaXNOZXdDaGF0ICYmIGhhc0FjdGlvbnMpO1xuXG5cdFx0XHQvLyBSaWdodCBzbG90OiBzd2FwIGJldHdlZW4gWytdIChpbi1jaGF0KSBhbmQgW2FjY291bnRdICh3ZWxjb21lKVxuXHRcdFx0bmV3U2Vzc2lvbkJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gaXNOZXdDaGF0ID8gJ25vbmUnIDogJyc7XG5cdFx0XHR0aGlzLmFjY291bnRCdXR0b24uc3R5bGUuZGlzcGxheSA9IGlzTmV3Q2hhdCA/ICcnIDogJ25vbmUnO1xuXG5cdFx0XHQvLyBDaGFuZ2VzIHBpbGwgZm9sbG93cyB0aGUgaW4tY2hhdCBzdGF0ZSBcdTIwMTQgaGlkZGVuIG9uIHdlbGNvbWUuXG5cdFx0XHRpc05ld0NoYXRSZWYudmFsdWUgPSBpc05ld0NoYXQ7XG5cdFx0XHRyZW5kZXJDaGFuZ2VzUGlsbCgpO1xuXHRcdH07XG5cdFx0dXBkYXRlQ2VudGVyTW9kZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ld0NoYXRLZXlTZXQpKSB7XG5cdFx0XHRcdHVwZGF0ZUNlbnRlck1vZGUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHNpZGViYXJWaXNpYmxlS2V5U2V0KSkge1xuXHRcdFx0XHR1cGRhdGVTaWRlYmFySWNvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sYmFyLm9uRGlkQ2hhbmdlTWVudUl0ZW1zKCgpID0+IHVwZGF0ZUNlbnRlck1vZGUoKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGxpY2l0bHkgc2V0IHRoZSB0aXRsZSBzaG93biBpbiB0aGUgY2VudGVyIHNsb3QuIENhbGxlZCBvbmx5IHdoZW5cblx0ICogb3ZlcnJpZGluZyB0aGUgbGl2ZSBzZXNzaW9uIHRpdGxlICh0ZXN0cywgcGxhY2Vob2xkZXJzKS4gVGhlIGxpdmVcblx0ICogc3Vic2NyaXB0aW9uIHdpbGwgb3ZlcndyaXRlIHRoaXMgb24gdGhlIG5leHQgc2Vzc2lvbiBjaGFuZ2UuXG5cdCAqL1xuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uVGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gdGl0bGU7XG5cdH1cblxuXHQvLyAtLS0gQ2hhbmdlcyBQaWxsIC0tLSAvL1xuXG5cdC8qKlxuXHQgKiBUYXAgaGFuZGxlciBmb3IgdGhlIGNoYW5nZXMgcGlsbC4gT3BlbnMgdGhlIGRlZGljYXRlZCBtb2JpbGVcblx0ICogQ2hhbmdlcyBvdmVybGF5IChhIG1hc3RlciBsaXN0IHdpdGggZmlsZSBpY29ucyArIGFkZC9yZW1vdmVcblx0ICogY291bnRzKSB2aWEge0BsaW5rIE1PQklMRV9PUEVOX0NIQU5HRVNfVklFV19DT01NQU5EX0lEfS4gVGhlXG5cdCAqIG92ZXJsYXkncyBvd24gcm93IHRhcHMgZmFuIG91dCBpbnRvIHBlci1maWxlIGRpZmYgdmlld3Mgd2l0aFxuXHQgKiBwcmV2L25leHQgbmF2aWdhdGlvbi5cblx0ICpcblx0ICogVGhlIGxpc3Qgb3ZlcmxheSBoYW5kbGVzIGl0cyBvd24gc2luZ2xlLWZpbGUgc2hvcnRjdXQsIHNvIHRoZVxuXHQgKiBjYWxsZXIganVzdCBkaXNwYXRjaGVzIHRoZSBjb21tYW5kIHVuY29uZGl0aW9uYWxseS5cblx0ICovXG5cdHByaXZhdGUgc2hvd0NoYW5nZXNQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhdGVzdENoYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTU9CSUxFX09QRU5fQ0hBTkdFU19WSUVXX0NPTU1BTkRfSUQpO1xuXHR9XG5cblx0Ly8gLS0tIEFjY291bnQgSW5kaWNhdG9yIC0tLSAvL1xuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaEFjY291bnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gKyt0aGlzLmFjY291bnRSZXF1ZXN0Q291bnRlcjtcblx0XHR0aGlzLmlzQWNjb3VudExvYWRpbmcgPSB0cnVlO1xuXHRcdHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCk7XG5cblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcmVzb2x2ZUFjY291bnRJbmZvKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0aWYgKHJlcXVlc3RJZCAhPT0gdGhpcy5hY2NvdW50UmVxdWVzdENvdW50ZXIgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYWNjb3VudE5hbWUgPSBpbmZvPy5hY2NvdW50TmFtZTtcblx0XHR0aGlzLmFjY291bnRQcm92aWRlcklkID0gaW5mbz8uYWNjb3VudFByb3ZpZGVySWQ7XG5cdFx0dGhpcy5hY2NvdW50UHJvdmlkZXJMYWJlbCA9IGluZm8/LmFjY291bnRQcm92aWRlckxhYmVsO1xuXHRcdHRoaXMuaXNBY2NvdW50TG9hZGluZyA9IGZhbHNlO1xuXHRcdHRoaXMucmVmcmVzaEF2YXRhcigpO1xuXHRcdHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFjY291bnRTdGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBXaGVuIHdlIGhhdmUgYSBzZXNzaW9uIGZyb20gdGhlIGF1dGggc2VydmljZSBidXQgdGhlIGVudGl0bGVtZW50XG5cdFx0Ly8gc2VydmljZSBoYXNuJ3QgcmVzb2x2ZWQgeWV0IChzdGlsbCBVbmtub3duKSwgdHJlYXQgaXQgYXMgdGhlXG5cdFx0Ly8gYWNjb3VudCBiZWluZyBhdmFpbGFibGUgcmF0aGVyIHRoYW4gc2lnbmVkIG91dC4gVGhpcyBhdm9pZHNcblx0XHQvLyBzaG93aW5nIFwiU2lnbiBJblwiIHJpZ2h0IGFmdGVyIHRoZSB3YWxrdGhyb3VnaCBjb21wbGV0ZXMuXG5cdFx0Y29uc3QgZW50aXRsZW1lbnQgPSB0aGlzLmFjY291bnROYW1lICYmIHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd25cblx0XHRcdD8gQ2hhdEVudGl0bGVtZW50LlVucmVzb2x2ZWRcblx0XHRcdDogdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50O1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZSh7XG5cdFx0XHRpc0FjY291bnRMb2FkaW5nOiB0aGlzLmlzQWNjb3VudExvYWRpbmcsXG5cdFx0XHRhY2NvdW50TmFtZTogdGhpcy5hY2NvdW50TmFtZSxcblx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiB0aGlzLmFjY291bnRQcm92aWRlckxhYmVsLFxuXHRcdFx0ZW50aXRsZW1lbnQsXG5cdFx0XHRzZW50aW1lbnQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQsXG5cdFx0XHRxdW90YXM6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMsXG5cdFx0fSk7XG5cblx0XHQvLyBBdmF0YXJcblx0XHRjb25zdCBoYXNBdmF0YXIgPSAhIXRoaXMubG9hZGVkQXZhdGFyVXJsICYmICF0aGlzLmlzQWNjb3VudExvYWRpbmc7XG5cdFx0dGhpcy5hY2NvdW50QXZhdGFyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgaGFzQXZhdGFyKTtcblx0XHRpZiAoaGFzQXZhdGFyICYmIHRoaXMuYWNjb3VudEF2YXRhckVsZW1lbnQuc3JjICE9PSB0aGlzLmxvYWRlZEF2YXRhclVybCkge1xuXHRcdFx0dGhpcy5hY2NvdW50QXZhdGFyRWxlbWVudC5zcmMgPSB0aGlzLmxvYWRlZEF2YXRhclVybCE7XG5cdFx0fSBlbHNlIGlmICghaGFzQXZhdGFyKSB7XG5cdFx0XHR0aGlzLmFjY291bnRBdmF0YXJFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29kaWNvbiBmYWxsYmFja1xuXHRcdGNvbnN0IHRpdGxlQmFySWNvbiA9IHN0YXRlLmRvdEJhZGdlID8gQ29kaWNvbi5hY2NvdW50IDogc3RhdGUuaWNvbjtcblx0XHR0aGlzLmFjY291bnRJY29uRWxlbWVudC5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUodGl0bGVCYXJJY29uKTtcblx0XHR0aGlzLmFjY291bnRJY29uRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBoYXNBdmF0YXIpO1xuXG5cdFx0Ly8gRG90IGJhZGdlXG5cdFx0Y29uc3QgYmFkZ2VLZXkgPSBnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleShzdGF0ZSk7XG5cdFx0aWYgKGJhZGdlS2V5ICE9PSB0aGlzLmxhc3RCYWRnZUtleSkge1xuXHRcdFx0dGhpcy5sYXN0QmFkZ2VLZXkgPSBiYWRnZUtleTtcblx0XHRcdHRoaXMuZGlzbWlzc2VkQmFkZ2VLZXkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNob3dCYWRnZSA9ICEhYmFkZ2VLZXkgJiYgYmFkZ2VLZXkgIT09IHRoaXMuZGlzbWlzc2VkQmFkZ2VLZXk7XG5cdFx0dGhpcy5hY2NvdW50QmFkZ2VFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBzaG93QmFkZ2UgPyAnJyA6ICdub25lJztcblx0XHR0aGlzLmFjY291bnRCYWRnZUVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZG90LWJhZGdlLXdhcm5pbmcnLCBzaG93QmFkZ2UgJiYgc3RhdGUuZG90QmFkZ2UgPT09ICd3YXJuaW5nJyk7XG5cdFx0dGhpcy5hY2NvdW50QmFkZ2VFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2RvdC1iYWRnZS1lcnJvcicsIHNob3dCYWRnZSAmJiBzdGF0ZS5kb3RCYWRnZSA9PT0gJ2Vycm9yJyk7XG5cblx0XHQvLyBBUklBXG5cdFx0dGhpcy5hY2NvdW50QnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHN0YXRlLmFyaWFMYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hBdmF0YXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgYXZhdGFyVXJsID0gZ2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCh0aGlzLmFjY291bnRQcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lKTtcblx0XHRpZiAoYXZhdGFyVXJsID09PSB0aGlzLmN1cnJlbnRBdmF0YXJVcmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRBdmF0YXJVcmwgPSBhdmF0YXJVcmw7XG5cdFx0dGhpcy5sb2FkZWRBdmF0YXJVcmwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5hdmF0YXJMb2FkRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICsrdGhpcy5hdmF0YXJSZXF1ZXN0Q291bnRlcjtcblxuXHRcdGlmICghYXZhdGFyVXJsKSB7XG5cdFx0XHR0aGlzLnJlbmRlckFjY291bnRTdGF0ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XG5cdFx0aW1hZ2UucmVmZXJyZXJQb2xpY3kgPSAnbm8tcmVmZXJyZXInO1xuXHRcdGNvbnN0IGNsZWFySGFuZGxlcnMgPSAoKSA9PiB7IGltYWdlLm9ubG9hZCA9IG51bGw7IGltYWdlLm9uZXJyb3IgPSBudWxsOyB9O1xuXHRcdGltYWdlLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYXZhdGFyUmVxdWVzdENvdW50ZXIpIHsgcmV0dXJuOyB9XG5cdFx0XHR0aGlzLmxvYWRlZEF2YXRhclVybCA9IGF2YXRhclVybDtcblx0XHRcdHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCk7XG5cdFx0XHRjbGVhckhhbmRsZXJzKCk7XG5cdFx0fTtcblx0XHRpbWFnZS5vbmVycm9yID0gKCkgPT4ge1xuXHRcdFx0aWYgKHJlcXVlc3RJZCAhPT0gdGhpcy5hdmF0YXJSZXF1ZXN0Q291bnRlcikgeyByZXR1cm47IH1cblx0XHRcdHRoaXMubG9hZGVkQXZhdGFyVXJsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5yZW5kZXJBY2NvdW50U3RhdGUoKTtcblx0XHRcdGNsZWFySGFuZGxlcnMoKTtcblx0XHR9O1xuXHRcdHRoaXMuYXZhdGFyTG9hZERpc3Bvc2FibGUudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyBjbGVhckhhbmRsZXJzKCk7IGltYWdlLnNyYyA9ICcnOyB9KTtcblx0XHRpbWFnZS5zcmMgPSBhdmF0YXJVcmw7XG5cdH1cblxuXHQvLyAtLS0gQWNjb3VudCBTaGVldCAtLS0gLy9cblxuXHRwcml2YXRlIHNob3dBY2NvdW50UGFuZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNBY2NvdW50TWVudVZpc2libGUpIHtcblx0XHRcdHRoaXMuYWNjb3VudFBhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYWNjb3VudFBhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgcGFuZWxTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmFjY291bnRQYW5lbERpc3Bvc2FibGUudmFsdWUgPSBwYW5lbFN0b3JlO1xuXG5cdFx0Y29uc3QgYmFkZ2VLZXkgPSBnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleShnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZSh7XG5cdFx0XHRpc0FjY291bnRMb2FkaW5nOiB0aGlzLmlzQWNjb3VudExvYWRpbmcsXG5cdFx0XHRhY2NvdW50TmFtZTogdGhpcy5hY2NvdW50TmFtZSxcblx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiB0aGlzLmFjY291bnRQcm92aWRlckxhYmVsLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCxcblx0XHRcdHNlbnRpbWVudDogdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudCxcblx0XHRcdHF1b3RhczogdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcyxcblx0XHR9KSk7XG5cdFx0aWYgKGJhZGdlS2V5KSB7XG5cdFx0XHR0aGlzLmRpc21pc3NlZEJhZGdlS2V5ID0gYmFkZ2VLZXk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pc0FjY291bnRNZW51VmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5yZW5kZXJBY2NvdW50U3RhdGUoKTtcblx0XHRwYW5lbFN0b3JlLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaXNBY2NvdW50TWVudVZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5jb3BpbG90RGFzaGJvYXJkU3RvcmUuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJBY2NvdW50U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGNsb3NlU2hlZXQgPSAoKSA9PiB0aGlzLmFjY291bnRQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdC8vIEZ1bGwtc2NyZWVuIHNoZWV0IGluc2lkZSB0aGUgd29ya2JlbmNoIGNvbnRhaW5lclxuXHRcdGNvbnN0IHdvcmtiZW5jaENvbnRhaW5lciA9IHRoaXMuZWxlbWVudC5wYXJlbnRFbGVtZW50ITtcblx0XHRjb25zdCBzaGVldCA9IGFwcGVuZCh3b3JrYmVuY2hDb250YWluZXIsICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldCcpKTtcblx0XHRwYW5lbFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc2hlZXQucmVtb3ZlKCkpKTtcblxuXHRcdC8vIEhlYWRlcjogdGl0bGUgKyBjbG9zZSBidXR0b25cblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQoc2hlZXQsICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldC1oZWFkZXInKSk7XG5cdFx0Y29uc3QgaGVhZGVyVGl0bGUgPSBhcHBlbmQoaGVhZGVyLCAkKCdoMi5tb2JpbGUtYWNjb3VudC1zaGVldC10aXRsZScpKTtcblx0XHRoZWFkZXJUaXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtb2JpbGVBY2NvdW50LnRpdGxlJywgXCJBY2NvdW50XCIpO1xuXHRcdGNvbnN0IGNsb3NlQnV0dG9uID0gYXBwZW5kKGhlYWRlciwgJCgnYnV0dG9uLm1vYmlsZS1hY2NvdW50LXNoZWV0LWNsb3NlJywgeyB0eXBlOiAnYnV0dG9uJyB9KSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0Y2xvc2VCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ21vYmlsZUFjY291bnQuY2xvc2UnLCBcIkNsb3NlXCIpKTtcblx0XHRhcHBlbmQoY2xvc2VCdXR0b24sICQoJ3NwYW4nKSkuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNsb3NlKSk7XG5cdFx0cGFuZWxTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNsb3NlQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssIGNsb3NlU2hlZXQpKTtcblxuXHRcdC8vIFNjcm9sbGFibGUgY29udGVudFxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhcHBlbmQoc2hlZXQsICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldC1jb250ZW50JykpO1xuXG5cdFx0Ly8gUHJvZmlsZSBzZWN0aW9uXG5cdFx0Y29uc3QgcHJvZmlsZSA9IGFwcGVuZChjb250ZW50LCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtcHJvZmlsZScpKTtcblx0XHRpZiAodGhpcy5sb2FkZWRBdmF0YXJVcmwpIHtcblx0XHRcdGNvbnN0IGF2YXRhciA9IGFwcGVuZChwcm9maWxlLCAkKCdpbWcubW9iaWxlLWFjY291bnQtc2hlZXQtYXZhdGFyJywgeyBhbHQ6ICcnLCBkcmFnZ2FibGU6ICdmYWxzZScgfSkpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHRhdmF0YXIuc3JjID0gdGhpcy5sb2FkZWRBdmF0YXJVcmw7XG5cdFx0XHRhdmF0YXIucmVmZXJyZXJQb2xpY3kgPSAnbm8tcmVmZXJyZXInO1xuXHRcdFx0YXZhdGFyLmRlY29kaW5nID0gJ2FzeW5jJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYXZhdGFyUGxhY2Vob2xkZXIgPSBhcHBlbmQocHJvZmlsZSwgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LWF2YXRhci1wbGFjZWhvbGRlcicpKTtcblx0XHRcdGFwcGVuZChhdmF0YXJQbGFjZWhvbGRlciwgJCgnc3BhbicpKS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uYWNjb3VudCkpO1xuXHRcdH1cblx0XHRjb25zdCBwcm9maWxlSW5mbyA9IGFwcGVuZChwcm9maWxlLCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtcHJvZmlsZS1pbmZvJykpO1xuXHRcdGlmICh0aGlzLmlzQWNjb3VudExvYWRpbmcpIHtcblx0XHRcdGFwcGVuZChwcm9maWxlSW5mbywgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LW5hbWUnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbW9iaWxlQWNjb3VudC5sb2FkaW5nJywgXCJMb2FkaW5nLi4uXCIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5hY2NvdW50TmFtZSkge1xuXHRcdFx0YXBwZW5kKHByb2ZpbGVJbmZvLCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtbmFtZScpKS50ZXh0Q29udGVudCA9IHRoaXMuYWNjb3VudE5hbWU7XG5cdFx0XHRpZiAodGhpcy5hY2NvdW50UHJvdmlkZXJMYWJlbCkge1xuXHRcdFx0XHRhcHBlbmQocHJvZmlsZUluZm8sICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldC1wcm92aWRlcicpKS50ZXh0Q29udGVudCA9IHRoaXMuYWNjb3VudFByb3ZpZGVyTGFiZWw7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFwcGVuZChwcm9maWxlSW5mbywgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LW5hbWUnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbW9iaWxlQWNjb3VudC5zaWduZWRPdXQnLCBcIk5vdCBzaWduZWQgaW5cIik7XG5cdFx0fVxuXG5cdFx0Ly8gQ29waWxvdCBzdGF0dXMgZGFzaGJvYXJkIFx1MjAxNCBvbmx5IHdoZW4gc2lnbmVkIGluIEFORCBlbnRpdGxlbWVudHNcblx0XHQvLyBoYXZlIHJlc29sdmVkLiBXaGVuIGVudGl0bGVtZW50IGlzIFVua25vd24gb3IgQXZhaWxhYmxlIChzZXR1cFxuXHRcdC8vIHBlbmRpbmcpLCB0aGUgZGFzaGJvYXJkIHNob3dzIGEgXCJTZXQgdXAgQ29waWxvdFwiIHByb21wdCB0aGF0XG5cdFx0Ly8gZG9lc24ndCBhcHBseSBpbiB0aGUgYWdlbnRzIGFwcC5cblx0XHRjb25zdCBlbnRpdGxlbWVudCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudDtcblx0XHRjb25zdCBzaG93RGFzaGJvYXJkID0gIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuaGlkZGVuXG5cdFx0XHQmJiAhIXRoaXMuYWNjb3VudE5hbWVcblx0XHRcdCYmIGVudGl0bGVtZW50ICE9PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93blxuXHRcdFx0JiYgZW50aXRsZW1lbnQgIT09IENoYXRFbnRpdGxlbWVudC5BdmFpbGFibGU7XG5cdFx0aWYgKHNob3dEYXNoYm9hcmQpIHtcblx0XHRcdGNvbnN0IGRhc2hib2FyZFNlY3Rpb24gPSBhcHBlbmQoY29udGVudCwgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LXNlY3Rpb24nKSk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRoaXMuY29waWxvdERhc2hib2FyZFN0b3JlLnZhbHVlID0gc3RvcmU7XG5cdFx0XHRjb25zdCBkYXNoYm9hcmRFbGVtZW50ID0gdGhpcy5jaGF0RGFzaGJvYXJkU2VydmljZS5jcmVhdGVEYXNoYm9hcmRFbGVtZW50KHN0b3JlKTtcblx0XHRcdGlmIChkYXNoYm9hcmRFbGVtZW50KSB7XG5cdFx0XHRcdGFwcGVuZChkYXNoYm9hcmRTZWN0aW9uLCBkYXNoYm9hcmRFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBY3Rpb25zIGxpc3Rcblx0XHRjb25zdCBhY3Rpb25zU2VjdGlvbiA9IGFwcGVuZChjb250ZW50LCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtYWN0aW9ucycpKTtcblx0XHRjb25zdCBhbGxBY3Rpb25zID0gdGhpcy5nZXRTaGVldEFjdGlvbnMoKTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhbGxBY3Rpb25zKSB7XG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdGFwcGVuZChhY3Rpb25zU2VjdGlvbiwgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LXNlcGFyYXRvcicpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByb3cgPSBhcHBlbmQoYWN0aW9uc1NlY3Rpb24sICQoJ2J1dHRvbi5tb2JpbGUtYWNjb3VudC1zaGVldC1hY3Rpb24nLCB7IHR5cGU6ICdidXR0b24nIH0pKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdHJvdy5kaXNhYmxlZCA9ICFhY3Rpb24uZW5hYmxlZDtcblx0XHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhY3Rpb24udG9vbHRpcCB8fCBhY3Rpb24ubGFiZWwpO1xuXHRcdFx0Y29uc3QgaWNvbiA9IHRoaXMuZ2V0QWN0aW9uSWNvbihhY3Rpb24pO1xuXHRcdFx0aWYgKGljb24pIHtcblx0XHRcdFx0YXBwZW5kKHJvdywgJCgnc3Bhbi5tb2JpbGUtYWNjb3VudC1zaGVldC1hY3Rpb24taWNvbicpKS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHRcdH1cblx0XHRcdGFwcGVuZChyb3csICQoJ3NwYW4ubW9iaWxlLWFjY291bnQtc2hlZXQtYWN0aW9uLWxhYmVsJykpLnRleHRDb250ZW50ID0gYWN0aW9uLmxhYmVsO1xuXHRcdFx0cGFuZWxTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgRXZlbnRUeXBlLkNMSUNLLCBhc3luYyBldmVudCA9PiB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjbG9zZVNoZWV0KCk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuKCkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2hlZXRBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51cy5BY2NvdW50TWVudSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgcmF3QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0ZmlsbEluQWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoKSwgcmF3QWN0aW9ucyk7XG5cdFx0bWVudS5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIHJhd0FjdGlvbnMuZmlsdGVyKGFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaXNBY2NvdW50TG9hZGluZyAmJiBhY3Rpb24uaWQgPT09ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50aWNTaWduSW4nKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAhYWN0aW9uLmlkLnN0YXJ0c1dpdGgoJ3VwZGF0ZS4nKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9uSWNvbihhY3Rpb246IElBY3Rpb24pOiBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAoYWN0aW9uLmlkKSB7XG5cdFx0XHRjYXNlICd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyc6IHJldHVybiBDb2RpY29uLnNldHRpbmdzR2Vhcjtcblx0XHRcdGNhc2UgJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRpY1NpZ25PdXQnOiByZXR1cm4gQ29kaWNvbi5zaWduT3V0O1xuXHRcdFx0Y2FzZSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudGljU2lnbkluJzogcmV0dXJuIENvZGljb24uc2lnbkluO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUM3RSxTQUFTLEdBQUcsdUJBQXVCLFFBQVEs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
