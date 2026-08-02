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
import { localize } from "../../../nls.js";
import { ActionBar, ActionsOrientation } from "../../../base/browser/ui/actionbar/actionbar.js";
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from "../../common/activity.js";
import { IActivityService } from "../../services/activity/common/activity.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DisposableStore, Disposable } from "../../../base/common/lifecycle.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { CompositeBarActionViewItem, CompositeBarAction } from "./compositeBarActions.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { registerIcon } from "../../../platform/theme/common/iconRegistry.js";
import { Action, Separator, SubmenuAction, toAction } from "../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../platform/actions/common/actions.js";
import { addDisposableListener, EventType, append, clearNode, hide, show, EventHelper, $, runWhenWindowIdle, getWindow } from "../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { EventType as TouchEventType } from "../../../base/browser/touch.js";
import { AnchorAlignment, AnchorAxisAlignment } from "../../../base/browser/ui/contextview/contextview.js";
import { Lazy } from "../../../base/common/lazy.js";
import { getActionBarActions } from "../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { ISecretStorageService } from "../../../platform/secrets/common/secrets.js";
import { getCurrentAuthenticationSessionInfo } from "../../services/authentication/browser/authenticationService.js";
import { IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from "../../services/authentication/common/authentication.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { ILifecycleService, LifecyclePhase } from "../../services/lifecycle/common/lifecycle.js";
import { IUserDataProfileService } from "../../services/userDataProfile/common/userDataProfile.js";
import { DEFAULT_ICON } from "../../services/userDataProfile/common/userDataProfileIcons.js";
import { isString } from "../../../base/common/types.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND } from "../../common/theme.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { WORKBENCH_MENU_MOTION_CLASS, workbenchMenuCloseAnimation } from "../actions/menuMotion.js";
let GlobalCompositeBar = class extends Disposable {
  constructor(contextMenuActionsProvider, colors, activityHoverOptions, configurationService, instantiationService, storageService, extensionService) {
    super();
    this.contextMenuActionsProvider = contextMenuActionsProvider;
    this.colors = colors;
    this.activityHoverOptions = activityHoverOptions;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.globalActivityAction = this._register(new Action(GLOBAL_ACTIVITY_ID));
    this.accountAction = this._register(new Action(ACCOUNTS_ACTIVITY_ID));
    this.element = $("div");
    const contextMenuAlignmentOptions = () => ({
      anchorAlignment: configurationService.getValue("workbench.sideBar.location") === "left" ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT,
      anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL
    });
    this.globalActivityActionBar = this._register(new ActionBar(this.element, {
      actionViewItemProvider: (action, options) => {
        if (action.id === GLOBAL_ACTIVITY_ID) {
          return this.instantiationService.createInstance(GlobalActivityActionViewItem, this.contextMenuActionsProvider, { ...options, colors: this.colors, hoverOptions: this.activityHoverOptions }, contextMenuAlignmentOptions);
        }
        if (action.id === ACCOUNTS_ACTIVITY_ID) {
          return this.instantiationService.createInstance(
            AccountsActivityActionViewItem,
            this.contextMenuActionsProvider,
            {
              ...options,
              colors: this.colors,
              hoverOptions: this.activityHoverOptions
            },
            contextMenuAlignmentOptions,
            (actions) => {
              actions.unshift(...[
                toAction({ id: "hideAccounts", label: localize("hideAccounts", "Hide Accounts"), run: () => setAccountsActionVisible(storageService, false) }),
                new Separator()
              ]);
            }
          );
        }
        throw new Error(`No view item for action '${action.id}'`);
      },
      orientation: ActionsOrientation.VERTICAL,
      ariaLabel: localize("manage", "Manage"),
      preventLoopNavigation: true
    }));
    if (this.accountsVisibilityPreference) {
      this.globalActivityActionBar.push(this.accountAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
    }
    this.globalActivityActionBar.push(this.globalActivityAction);
    this.registerListeners();
  }
  registerListeners() {
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      if (!this._store.isDisposed) {
        this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, this._store)(() => this.toggleAccountsActivity()));
      }
    });
  }
  create(parent) {
    parent.appendChild(this.element);
  }
  focus() {
    this.globalActivityActionBar.focus(true);
  }
  size() {
    return this.globalActivityActionBar.viewItems.length;
  }
  getContextMenuActions() {
    return [toAction({ id: "toggleAccountsVisibility", label: localize("accounts", "Accounts"), checked: this.accountsVisibilityPreference, run: () => this.accountsVisibilityPreference = !this.accountsVisibilityPreference })];
  }
  toggleAccountsActivity() {
    if (this.globalActivityActionBar.length() === 2 && this.accountsVisibilityPreference) {
      return;
    }
    if (this.globalActivityActionBar.length() === 2) {
      this.globalActivityActionBar.pull(GlobalCompositeBar.ACCOUNTS_ACTION_INDEX);
    } else {
      this.globalActivityActionBar.push(this.accountAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
    }
  }
  get accountsVisibilityPreference() {
    return isAccountsActionVisible(this.storageService);
  }
  set accountsVisibilityPreference(value) {
    setAccountsActionVisible(this.storageService, value);
  }
};
GlobalCompositeBar.ACCOUNTS_ACTION_INDEX = 0;
GlobalCompositeBar.ACCOUNTS_ICON = registerIcon("accounts-view-bar-icon", Codicon.account, localize("accountsViewBarIcon", "Accounts icon in the view bar."));
GlobalCompositeBar = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService)
], GlobalCompositeBar);
let AbstractGlobalActivityActionViewItem = class extends CompositeBarActionViewItem {
  constructor(menuId, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService) {
    super(action, { draggable: false, icon: true, hasPopup: true, ...options }, () => true, themeService, hoverService, configurationService, keybindingService);
    this.menuId = menuId;
    this.contextMenuActionsProvider = contextMenuActionsProvider;
    this.contextMenuAlignmentOptions = contextMenuAlignmentOptions;
    this.menuService = menuService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.activityService = activityService;
    this.updateItemActivity();
    this._register(this.activityService.onDidChangeActivity((viewContainerOrAction) => {
      if (isString(viewContainerOrAction) && viewContainerOrAction === this.compositeBarActionItem.id) {
        this.updateItemActivity();
      }
    }));
  }
  updateItemActivity() {
    this.action.activities = this.activityService.getActivity(this.compositeBarActionItem.id);
  }
  render(container) {
    super.render(container);
    this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, async (e) => {
      EventHelper.stop(e, true);
      const isLeftClick = e?.button !== 2;
      if (isLeftClick) {
        this.run();
      }
    }));
    this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, async (e) => {
      e.stopPropagation();
      const disposables = new DisposableStore();
      const actions = await this.resolveContextMenuActions(disposables);
      const event = new StandardMouseEvent(getWindow(this.container), e);
      this.contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => actions,
        getMenuClassName: () => WORKBENCH_MENU_MOTION_CLASS,
        onHide: () => disposables.dispose(),
        closeAnimation: workbenchMenuCloseAnimation
      });
    }));
    this._register(addDisposableListener(this.container, EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        EventHelper.stop(e, true);
        this.run();
      }
    }));
    this._register(addDisposableListener(this.container, TouchEventType.Tap, (e) => {
      EventHelper.stop(e, true);
      this.run();
    }));
  }
  async resolveContextMenuActions(disposables) {
    return this.contextMenuActionsProvider();
  }
  async run() {
    const disposables = new DisposableStore();
    const menu = disposables.add(this.menuService.createMenu(this.menuId, this.contextKeyService));
    const actions = await this.resolveMainMenuActions(menu, disposables);
    const { anchorAlignment, anchorAxisAlignment } = this.contextMenuAlignmentOptions() ?? { anchorAlignment: void 0, anchorAxisAlignment: void 0 };
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.label,
      anchorAlignment,
      anchorAxisAlignment,
      getActions: () => actions,
      getMenuClassName: () => WORKBENCH_MENU_MOTION_CLASS,
      onHide: () => disposables.dispose(),
      menuActionOptions: { renderShortTitle: true },
      closeAnimation: workbenchMenuCloseAnimation
    });
  }
  async resolveMainMenuActions(menu, _disposable) {
    return getActionBarActions(menu.getActions({ renderShortTitle: true })).secondary;
  }
};
AbstractGlobalActivityActionViewItem = __decorateClass([
  __decorateParam(5, IThemeService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IKeybindingService),
  __decorateParam(12, IActivityService)
], AbstractGlobalActivityActionViewItem);
let AccountsActivityActionViewItem = class extends AbstractGlobalActivityActionViewItem {
  constructor(contextMenuActionsProvider, options, contextMenuAlignmentOptions, fillContextMenuActions, themeService, lifecycleService, hoverService, contextMenuService, menuService, contextKeyService, authenticationService, environmentService, productService, configurationService, keybindingService, secretStorageService, logService, activityService, instantiationService, commandService) {
    const action = instantiationService.createInstance(CompositeBarAction, {
      id: ACCOUNTS_ACTIVITY_ID,
      name: localize("accounts", "Accounts"),
      classNames: ThemeIcon.asClassNameArray(GlobalCompositeBar.ACCOUNTS_ICON)
    });
    super(MenuId.AccountsContext, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService);
    this.fillContextMenuActions = fillContextMenuActions;
    this.lifecycleService = lifecycleService;
    this.authenticationService = authenticationService;
    this.productService = productService;
    this.secretStorageService = secretStorageService;
    this.logService = logService;
    this.commandService = commandService;
    this.groupedAccounts = /* @__PURE__ */ new Map();
    this.problematicProviders = /* @__PURE__ */ new Set();
    this.initialized = false;
    this.sessionFromEmbedder = new Lazy(() => getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService));
    this._register(action);
    this.registerListeners();
    this.initialize();
  }
  registerListeners() {
    this._register(this.authenticationService.onDidRegisterAuthenticationProvider(async (e) => {
      await this.addAccountsFromProvider(e.id);
    }));
    this._register(this.authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      this.groupedAccounts.delete(e.id);
      this.problematicProviders.delete(e.id);
    }));
    this._register(this.authenticationService.onDidChangeSessions(async (e) => {
      if (e.event.removed) {
        for (const removed of e.event.removed) {
          this.removeAccount(e.providerId, removed.account);
        }
      }
      for (const changed of [...e.event.changed ?? [], ...e.event.added ?? []]) {
        try {
          await this.addOrUpdateAccount(e.providerId, changed.account);
        } catch (e2) {
          this.logService.error(e2);
        }
      }
    }));
  }
  // This function exists to ensure that the accounts are added for auth providers that had already been registered
  // before the menu was created.
  async initialize() {
    await this.lifecycleService.when(LifecyclePhase.Restored);
    if (this._store.isDisposed) {
      return;
    }
    const disposable = this._register(runWhenWindowIdle(getWindow(this.element), async () => {
      await this.doInitialize();
      disposable.dispose();
    }));
  }
  async doInitialize() {
    const providerIds = this.authenticationService.getProviderIds();
    const results = await Promise.allSettled(providerIds.map((providerId) => this.addAccountsFromProvider(providerId)));
    for (const result of results) {
      if (result.status === "rejected") {
        this.logService.error(result.reason);
      }
    }
    this.initialized = true;
  }
  //#region overrides
  async resolveMainMenuActions(accountsMenu, disposables) {
    await super.resolveMainMenuActions(accountsMenu, disposables);
    const providers = this.authenticationService.getProviderIds().filter((p) => !p.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX));
    const otherCommands = accountsMenu.getActions();
    let menus = [];
    const registeredProviders = providers.filter((providerId) => !this.authenticationService.isDynamicAuthenticationProvider(providerId));
    const dynamicProviders = providers.filter((providerId) => this.authenticationService.isDynamicAuthenticationProvider(providerId));
    if (!this.initialized) {
      const noAccountsAvailableAction = disposables.add(new Action("noAccountsAvailable", localize("loading", "Loading..."), void 0, false));
      menus.push(noAccountsAvailableAction);
    } else {
      for (const providerId of registeredProviders) {
        const provider = this.authenticationService.getProvider(providerId);
        const accounts = this.groupedAccounts.get(providerId);
        if (!accounts) {
          if (this.problematicProviders.has(providerId)) {
            const providerUnavailableAction = disposables.add(new Action("providerUnavailable", localize("authProviderUnavailable", "{0} is currently unavailable", provider.label), void 0, false));
            menus.push(providerUnavailableAction);
            try {
              await this.addAccountsFromProvider(providerId);
            } catch (e) {
              this.logService.error(e);
            }
          }
          continue;
        }
        const canUseMcp = !!provider.authorizationServers?.length;
        for (const account of accounts) {
          const manageExtensionsAction = toAction({
            id: `configureSessions${account.label}`,
            label: localize("manageTrustedExtensions", "Manage Trusted Extensions"),
            enabled: true,
            run: () => this.commandService.executeCommand("_manageTrustedExtensionsForAccount", { providerId, accountLabel: account.label })
          });
          const providerSubMenuActions = [manageExtensionsAction];
          if (canUseMcp) {
            const manageMCPAction = toAction({
              id: `configureSessions${account.label}`,
              label: localize("manageTrustedMCPServers", "Manage Trusted MCP Servers"),
              enabled: true,
              run: () => this.commandService.executeCommand("_manageTrustedMCPServersForAccount", { providerId, accountLabel: account.label })
            });
            providerSubMenuActions.push(manageMCPAction);
          }
          if (account.canSignOut) {
            providerSubMenuActions.push(toAction({
              id: "signOut",
              label: localize("signOut", "Sign Out"),
              enabled: true,
              run: () => this.commandService.executeCommand("_signOutOfAccount", { providerId, accountLabel: account.label })
            }));
          }
          const providerSubMenu = new SubmenuAction("activitybar.submenu", `${account.label} (${provider.label})`, providerSubMenuActions);
          menus.push(providerSubMenu);
        }
      }
      if (dynamicProviders.length && registeredProviders.length) {
        menus.push(new Separator());
      }
      for (const providerId of dynamicProviders) {
        const provider = this.authenticationService.getProvider(providerId);
        const accounts = this.groupedAccounts.get(providerId);
        const manageDynamicAuthProvidersAction = toAction({
          id: "manageDynamicAuthProviders",
          label: localize("manageDynamicAuthProviders", "Manage Dynamic Authentication Providers..."),
          enabled: true,
          run: () => this.commandService.executeCommand("workbench.action.removeDynamicAuthenticationProviders")
        });
        if (!accounts) {
          if (this.problematicProviders.has(providerId)) {
            const providerUnavailableAction = disposables.add(new Action("providerUnavailable", localize("authProviderUnavailable", "{0} is currently unavailable", provider.label), void 0, false));
            menus.push(providerUnavailableAction);
            try {
              await this.addAccountsFromProvider(providerId);
            } catch (e) {
              this.logService.error(e);
            }
          }
          menus.push(manageDynamicAuthProvidersAction);
          continue;
        }
        for (const account of accounts) {
          const providerSubMenuActions = [];
          const manageMCPAction = toAction({
            id: `configureSessions${account.label}`,
            label: localize("manageTrustedMCPServers", "Manage Trusted MCP Servers"),
            enabled: true,
            run: () => this.commandService.executeCommand("_manageTrustedMCPServersForAccount", { providerId, accountLabel: account.label })
          });
          providerSubMenuActions.push(manageMCPAction);
          providerSubMenuActions.push(manageDynamicAuthProvidersAction);
          if (account.canSignOut) {
            providerSubMenuActions.push(toAction({
              id: "signOut",
              label: localize("signOut", "Sign Out"),
              enabled: true,
              run: () => this.commandService.executeCommand("_signOutOfAccount", { providerId, accountLabel: account.label })
            }));
          }
          const providerSubMenu = new SubmenuAction("activitybar.submenu", `${account.label} (${provider.label})`, providerSubMenuActions);
          menus.push(providerSubMenu);
        }
      }
    }
    if (menus.length && otherCommands.length) {
      menus.push(new Separator());
    }
    otherCommands.forEach((group, i) => {
      const actions = group[1];
      menus = menus.concat(actions);
      if (i !== otherCommands.length - 1) {
        menus.push(new Separator());
      }
    });
    return menus;
  }
  async resolveContextMenuActions(disposables) {
    const actions = await super.resolveContextMenuActions(disposables);
    this.fillContextMenuActions(actions);
    return actions;
  }
  //#endregion
  //#region groupedAccounts helpers
  async addOrUpdateAccount(providerId, account) {
    let accounts = this.groupedAccounts.get(providerId);
    if (!accounts) {
      accounts = [];
      this.groupedAccounts.set(providerId, accounts);
    }
    const sessionFromEmbedder = await this.sessionFromEmbedder.value;
    let canSignOut = true;
    if (sessionFromEmbedder && !sessionFromEmbedder.canSignOut && (await this.authenticationService.getSessions(providerId)).some(
      (s) => s.id === sessionFromEmbedder.id && s.account.id === account.id
    )) {
      canSignOut = false;
    }
    const existingAccount = accounts.find((a) => a.label === account.label);
    if (existingAccount) {
      if (!canSignOut) {
        existingAccount.canSignOut = canSignOut;
      }
    } else {
      accounts.push({ ...account, canSignOut });
    }
  }
  removeAccount(providerId, account) {
    const accounts = this.groupedAccounts.get(providerId);
    if (!accounts) {
      return;
    }
    const index = accounts.findIndex((a) => a.id === account.id);
    if (index === -1) {
      return;
    }
    accounts.splice(index, 1);
    if (accounts.length === 0) {
      this.groupedAccounts.delete(providerId);
    }
  }
  async addAccountsFromProvider(providerId) {
    try {
      const sessions = await this.authenticationService.getSessions(providerId);
      this.problematicProviders.delete(providerId);
      for (const session of sessions) {
        try {
          await this.addOrUpdateAccount(providerId, session.account);
        } catch (e) {
          this.logService.error(e);
        }
      }
    } catch (e) {
      this.logService.error(e);
      this.problematicProviders.add(providerId);
    }
  }
  //#endregion
};
AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY = "workbench.activity.showAccounts";
AccountsActivityActionViewItem = __decorateClass([
  __decorateParam(4, IThemeService),
  __decorateParam(5, ILifecycleService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IAuthenticationService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IProductService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, ISecretStorageService),
  __decorateParam(16, ILogService),
  __decorateParam(17, IActivityService),
  __decorateParam(18, IInstantiationService),
  __decorateParam(19, ICommandService)
], AccountsActivityActionViewItem);
let GlobalActivityActionViewItem = class extends AbstractGlobalActivityActionViewItem {
  constructor(contextMenuActionsProvider, options, contextMenuAlignmentOptions, userDataProfileService, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService, instantiationService, activityService) {
    const action = instantiationService.createInstance(CompositeBarAction, {
      id: GLOBAL_ACTIVITY_ID,
      name: localize("manage", "Manage"),
      classNames: ThemeIcon.asClassNameArray(userDataProfileService.currentProfile.icon ? ThemeIcon.fromId(userDataProfileService.currentProfile.icon) : DEFAULT_ICON)
    });
    super(MenuId.GlobalActivity, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService);
    this.userDataProfileService = userDataProfileService;
    this._register(action);
    this._register(this.userDataProfileService.onDidChangeCurrentProfile((e) => {
      action.compositeBarActionItem = {
        ...action.compositeBarActionItem,
        classNames: ThemeIcon.asClassNameArray(userDataProfileService.currentProfile.icon ? ThemeIcon.fromId(userDataProfileService.currentProfile.icon) : DEFAULT_ICON)
      };
    }));
  }
  render(container) {
    super.render(container);
    this.profileBadge = append(container, $(".profile-badge"));
    this.profileBadgeContent = append(this.profileBadge, $(".profile-badge-content"));
    this.updateProfileBadge();
  }
  updateProfileBadge() {
    if (!this.profileBadge || !this.profileBadgeContent) {
      return;
    }
    clearNode(this.profileBadgeContent);
    hide(this.profileBadge);
    if (this.userDataProfileService.currentProfile.isDefault) {
      return;
    }
    if (this.userDataProfileService.currentProfile.icon && this.userDataProfileService.currentProfile.icon !== DEFAULT_ICON.id) {
      return;
    }
    if (this.action.activities.length > 0) {
      return;
    }
    show(this.profileBadge);
    this.profileBadgeContent.classList.add("profile-text-overlay");
    this.profileBadgeContent.textContent = this.userDataProfileService.currentProfile.name.substring(0, 2).toUpperCase();
  }
  updateActivity() {
    super.updateActivity();
    this.updateProfileBadge();
  }
  computeTitle() {
    return this.userDataProfileService.currentProfile.isDefault ? super.computeTitle() : localize("manage profile", "Manage {0} (Profile)", this.userDataProfileService.currentProfile.name);
  }
};
GlobalActivityActionViewItem = __decorateClass([
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IKeybindingService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IActivityService)
], GlobalActivityActionViewItem);
let SimpleAccountActivityActionViewItem = class extends AccountsActivityActionViewItem {
  constructor(hoverOptions, options, themeService, lifecycleService, hoverService, contextMenuService, menuService, contextKeyService, authenticationService, environmentService, productService, configurationService, keybindingService, secretStorageService, storageService, logService, activityService, instantiationService, commandService) {
    super(
      () => simpleActivityContextMenuActions(storageService, true),
      {
        ...options,
        colors: (theme) => ({
          badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
          badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND)
        }),
        hoverOptions,
        compact: true
      },
      () => void 0,
      (actions) => actions,
      themeService,
      lifecycleService,
      hoverService,
      contextMenuService,
      menuService,
      contextKeyService,
      authenticationService,
      environmentService,
      productService,
      configurationService,
      keybindingService,
      secretStorageService,
      logService,
      activityService,
      instantiationService,
      commandService
    );
  }
};
SimpleAccountActivityActionViewItem = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IAuthenticationService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IKeybindingService),
  __decorateParam(13, ISecretStorageService),
  __decorateParam(14, IStorageService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IActivityService),
  __decorateParam(17, IInstantiationService),
  __decorateParam(18, ICommandService)
], SimpleAccountActivityActionViewItem);
let SimpleGlobalActivityActionViewItem = class extends GlobalActivityActionViewItem {
  constructor(hoverOptions, options, userDataProfileService, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService, instantiationService, activityService, storageService) {
    super(
      () => simpleActivityContextMenuActions(storageService, false),
      {
        ...options,
        colors: (theme) => ({
          badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
          badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND)
        }),
        hoverOptions,
        compact: true
      },
      () => void 0,
      userDataProfileService,
      themeService,
      hoverService,
      menuService,
      contextMenuService,
      contextKeyService,
      configurationService,
      environmentService,
      keybindingService,
      instantiationService,
      activityService
    );
  }
};
SimpleGlobalActivityActionViewItem = __decorateClass([
  __decorateParam(2, IUserDataProfileService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IActivityService),
  __decorateParam(13, IStorageService)
], SimpleGlobalActivityActionViewItem);
function simpleActivityContextMenuActions(storageService, isAccount) {
  const currentElementContextMenuActions = [];
  if (isAccount) {
    currentElementContextMenuActions.push(
      toAction({ id: "hideAccounts", label: localize("hideAccounts", "Hide Accounts"), run: () => setAccountsActionVisible(storageService, false) }),
      new Separator()
    );
  }
  return [
    ...currentElementContextMenuActions,
    toAction({ id: "toggle.hideAccounts", label: localize("accounts", "Accounts"), checked: isAccountsActionVisible(storageService), run: () => setAccountsActionVisible(storageService, !isAccountsActionVisible(storageService)) }),
    toAction({ id: "toggle.hideManage", label: localize("manage", "Manage"), checked: true, enabled: false, run: () => {
      throw new Error('"Manage" can not be hidden');
    } })
  ];
}
function isAccountsActionVisible(storageService) {
  return storageService.getBoolean(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, StorageScope.PROFILE, true);
}
function setAccountsActionVisible(storageService, visible) {
  storageService.store(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, visible, StorageScope.PROFILE, StorageTarget.USER);
}
export {
  AccountsActivityActionViewItem,
  GlobalActivityActionViewItem,
  GlobalCompositeBar,
  SimpleAccountActivityActionViewItem,
  SimpleGlobalActivityActionViewItem,
  isAccountsActionVisible
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2dsb2JhbENvbXBvc2l0ZUJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciwgQWN0aW9uc09yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQUNDT1VOVFNfQUNUSVZJVFlfSUQsIEdMT0JBTF9BQ1RJVklUWV9JRCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtLCBDb21wb3NpdGVCYXJBY3Rpb24sIElBY3Rpdml0eUhvdmVyT3B0aW9ucywgSUNvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtT3B0aW9ucywgSUNvbXBvc2l0ZUJhckNvbG9ycyB9IGZyb20gJy4vY29tcG9zaXRlQmFyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWVudSwgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBhcHBlbmQsIGNsZWFyTm9kZSwgaGlkZSwgc2hvdywgRXZlbnRIZWxwZXIsICQsIHJ1bldoZW5XaW5kb3dJZGxlLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSwgR2VzdHVyZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgQW5jaG9yQXhpc0FsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvLCBnZXRDdXJyZW50QXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQsIElBdXRoZW50aWNhdGlvblNlcnZpY2UsIElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9JQ09OIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGVJY29ucy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBBQ1RJVklUWV9CQVJfQkFER0VfQkFDS0dST1VORCwgQUNUSVZJVFlfQkFSX0JBREdFX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgV09SS0JFTkNIX01FTlVfTU9USU9OX0NMQVNTLCB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb24gfSBmcm9tICcuLi9hY3Rpb25zL21lbnVNb3Rpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgR2xvYmFsQ29tcG9zaXRlQmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQUNDT1VOVFNfQUNUSU9OX0lOREVYID0gMDtcblx0c3RhdGljIHJlYWRvbmx5IEFDQ09VTlRTX0lDT04gPSByZWdpc3Rlckljb24oJ2FjY291bnRzLXZpZXctYmFyLWljb24nLCBDb2RpY29uLmFjY291bnQsIGxvY2FsaXplKCdhY2NvdW50c1ZpZXdCYXJJY29uJywgXCJBY2NvdW50cyBpY29uIGluIHRoZSB2aWV3IGJhci5cIikpO1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsQWN0aXZpdHlBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKEdMT0JBTF9BQ1RJVklUWV9JRCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjY291bnRBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKEFDQ09VTlRTX0FDVElWSVRZX0lEKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXI6IEFjdGlvbkJhcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51QWN0aW9uc1Byb3ZpZGVyOiAoKSA9PiBJQWN0aW9uW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb2xvcnM6ICh0aGVtZTogSUNvbG9yVGhlbWUpID0+IElDb21wb3NpdGVCYXJDb2xvcnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eUhvdmVyT3B0aW9uczogSUFjdGl2aXR5SG92ZXJPcHRpb25zLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9ICQoJ2RpdicpO1xuXHRcdGNvbnN0IGNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9ucyA9ICgpID0+ICh7XG5cdFx0XHRhbmNob3JBbGlnbm1lbnQ6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicpID09PSAnbGVmdCcgPyBBbmNob3JBbGlnbm1lbnQuUklHSFQgOiBBbmNob3JBbGlnbm1lbnQuTEVGVCxcblx0XHRcdGFuY2hvckF4aXNBbGlnbm1lbnQ6IEFuY2hvckF4aXNBbGlnbm1lbnQuSE9SSVpPTlRBTFxuXHRcdH0pO1xuXHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBHTE9CQUxfQUNUSVZJVFlfSUQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtLCB0aGlzLmNvbnRleHRNZW51QWN0aW9uc1Byb3ZpZGVyLCB7IC4uLm9wdGlvbnMsIGNvbG9yczogdGhpcy5jb2xvcnMsIGhvdmVyT3B0aW9uczogdGhpcy5hY3Rpdml0eUhvdmVyT3B0aW9ucyB9LCBjb250ZXh0TWVudUFsaWdubWVudE9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQUNDT1VOVFNfQUNUSVZJVFlfSUQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY2NvdW50c0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdFx0XHR0aGlzLmNvbnRleHRNZW51QWN0aW9uc1Byb3ZpZGVyLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0XHRjb2xvcnM6IHRoaXMuY29sb3JzLFxuXHRcdFx0XHRcdFx0XHRob3Zlck9wdGlvbnM6IHRoaXMuYWN0aXZpdHlIb3Zlck9wdGlvbnNcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjb250ZXh0TWVudUFsaWdubWVudE9wdGlvbnMsXG5cdFx0XHRcdFx0XHQoYWN0aW9uczogSUFjdGlvbltdKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGFjdGlvbnMudW5zaGlmdCguLi5bXG5cdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oeyBpZDogJ2hpZGVBY2NvdW50cycsIGxhYmVsOiBsb2NhbGl6ZSgnaGlkZUFjY291bnRzJywgXCJIaWRlIEFjY291bnRzXCIpLCBydW46ICgpID0+IHNldEFjY291bnRzQWN0aW9uVmlzaWJsZShzdG9yYWdlU2VydmljZSwgZmFsc2UpIH0pLFxuXHRcdFx0XHRcdFx0XHRcdG5ldyBTZXBhcmF0b3IoKVxuXHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyB2aWV3IGl0ZW0gZm9yIGFjdGlvbiAnJHthY3Rpb24uaWR9J2ApO1xuXHRcdFx0fSxcblx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uVkVSVElDQUwsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdtYW5hZ2UnLCBcIk1hbmFnZVwiKSxcblx0XHRcdHByZXZlbnRMb29wTmF2aWdhdGlvbjogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLmFjY291bnRzVmlzaWJpbGl0eVByZWZlcmVuY2UpIHtcblx0XHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIucHVzaCh0aGlzLmFjY291bnRBY3Rpb24sIHsgaW5kZXg6IEdsb2JhbENvbXBvc2l0ZUJhci5BQ0NPVU5UU19BQ1RJT05fSU5ERVggfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5nbG9iYWxBY3Rpdml0eUFjdGlvbkJhci5wdXNoKHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb24pO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBBY2NvdW50c0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0uQUNDT1VOVFNfVklTSUJJTElUWV9QUkVGRVJFTkNFX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHRoaXMudG9nZ2xlQWNjb3VudHNBY3Rpdml0eSgpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5nbG9iYWxBY3Rpdml0eUFjdGlvbkJhci5mb2N1cyh0cnVlKTtcblx0fVxuXG5cdHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nbG9iYWxBY3Rpdml0eUFjdGlvbkJhci52aWV3SXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0Z2V0Q29udGV4dE1lbnVBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIFt0b0FjdGlvbih7IGlkOiAndG9nZ2xlQWNjb3VudHNWaXNpYmlsaXR5JywgbGFiZWw6IGxvY2FsaXplKCdhY2NvdW50cycsIFwiQWNjb3VudHNcIiksIGNoZWNrZWQ6IHRoaXMuYWNjb3VudHNWaXNpYmlsaXR5UHJlZmVyZW5jZSwgcnVuOiAoKSA9PiB0aGlzLmFjY291bnRzVmlzaWJpbGl0eVByZWZlcmVuY2UgPSAhdGhpcy5hY2NvdW50c1Zpc2liaWxpdHlQcmVmZXJlbmNlIH0pXTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlQWNjb3VudHNBY3Rpdml0eSgpIHtcblx0XHRpZiAodGhpcy5nbG9iYWxBY3Rpdml0eUFjdGlvbkJhci5sZW5ndGgoKSA9PT0gMiAmJiB0aGlzLmFjY291bnRzVmlzaWJpbGl0eVByZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIubGVuZ3RoKCkgPT09IDIpIHtcblx0XHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIucHVsbChHbG9iYWxDb21wb3NpdGVCYXIuQUNDT1VOVFNfQUNUSU9OX0lOREVYKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5nbG9iYWxBY3Rpdml0eUFjdGlvbkJhci5wdXNoKHRoaXMuYWNjb3VudEFjdGlvbiwgeyBpbmRleDogR2xvYmFsQ29tcG9zaXRlQmFyLkFDQ09VTlRTX0FDVElPTl9JTkRFWCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBhY2NvdW50c1Zpc2liaWxpdHlQcmVmZXJlbmNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0FjY291bnRzQWN0aW9uVmlzaWJsZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGFjY291bnRzVmlzaWJpbGl0eVByZWZlcmVuY2UodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRzZXRBY2NvdW50c0FjdGlvblZpc2libGUodGhpcy5zdG9yYWdlU2VydmljZSwgdmFsdWUpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0R2xvYmFsQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSBleHRlbmRzIENvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lbnVJZDogTWVudUlkLFxuXHRcdGFjdGlvbjogQ29tcG9zaXRlQmFyQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudUFjdGlvbnNQcm92aWRlcjogKCkgPT4gSUFjdGlvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVBbGlnbm1lbnRPcHRpb25zOiAoKSA9PiBSZWFkb25seTx7IGFuY2hvckFsaWdubWVudDogQW5jaG9yQWxpZ25tZW50OyBhbmNob3JBeGlzQWxpZ25tZW50OiBBbmNob3JBeGlzQWxpZ25tZW50IH0+IHwgdW5kZWZpbmVkLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLCB7IGRyYWdnYWJsZTogZmFsc2UsIGljb246IHRydWUsIGhhc1BvcHVwOiB0cnVlLCAuLi5vcHRpb25zIH0sICgpID0+IHRydWUsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy51cGRhdGVJdGVtQWN0aXZpdHkoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjdGl2aXR5U2VydmljZS5vbkRpZENoYW5nZUFjdGl2aXR5KHZpZXdDb250YWluZXJPckFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoaXNTdHJpbmcodmlld0NvbnRhaW5lck9yQWN0aW9uKSAmJiB2aWV3Q29udGFpbmVyT3JBY3Rpb24gPT09IHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUl0ZW1BY3Rpdml0eSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSXRlbUFjdGl2aXR5KCk6IHZvaWQge1xuXHRcdCh0aGlzLmFjdGlvbiBhcyBDb21wb3NpdGVCYXJBY3Rpb24pLmFjdGl2aXRpZXMgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5nZXRBY3Rpdml0eSh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGFzeW5jIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0Y29uc3QgaXNMZWZ0Q2xpY2sgPSBlPy5idXR0b24gIT09IDI7XG5cdFx0XHQvLyBMZWZ0LWNsaWNrIHJ1blxuXHRcdFx0aWYgKGlzTGVmdENsaWNrKSB7XG5cdFx0XHRcdHRoaXMucnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGhlIHJlc3Qgb2YgdGhlIGFjdGl2aXR5IGJhciB1c2VzIGNvbnRleHQgbWVudSBldmVudCBmb3IgdGhlIGNvbnRleHQgbWVudSwgc28gd2UgbWF0Y2ggdGhpc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgYXN5bmMgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdC8vIExldCB0aGUgaXRlbSBkZWNpZGUgb24gdGhlIGNvbnRleHQgbWVudSBpbnN0ZWFkIG9mIHRoZSB0b29sYmFyXG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCB0aGlzLnJlc29sdmVDb250ZXh0TWVudUFjdGlvbnMoZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKSwgZSk7XG5cblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdGdldE1lbnVDbGFzc05hbWU6ICgpID0+IFdPUktCRU5DSF9NRU5VX01PVElPTl9DTEFTUyxcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCksXG5cdFx0XHRcdGNsb3NlQW5pbWF0aW9uOiB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb25cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9VUCwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMucnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBUb3VjaEV2ZW50VHlwZS5UYXAsIChlOiBHZXN0dXJlRXZlbnQpID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLnJ1bigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyByZXNvbHZlQ29udGV4dE1lbnVBY3Rpb25zKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPElBY3Rpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLmNvbnRleHRNZW51QWN0aW9uc1Byb3ZpZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtZW51ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudSh0aGlzLm1lbnVJZCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCB0aGlzLnJlc29sdmVNYWluTWVudUFjdGlvbnMobWVudSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHsgYW5jaG9yQWxpZ25tZW50LCBhbmNob3JBeGlzQWxpZ25tZW50IH0gPSB0aGlzLmNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9ucygpID8/IHsgYW5jaG9yQWxpZ25tZW50OiB1bmRlZmluZWQsIGFuY2hvckF4aXNBbGlnbm1lbnQ6IHVuZGVmaW5lZCB9O1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gdGhpcy5sYWJlbCxcblx0XHRcdGFuY2hvckFsaWdubWVudCxcblx0XHRcdGFuY2hvckF4aXNBbGlnbm1lbnQsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0TWVudUNsYXNzTmFtZTogKCkgPT4gV09SS0JFTkNIX01FTlVfTU9USU9OX0NMQVNTLFxuXHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCksXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0sXG5cdFx0XHRjbG9zZUFuaW1hdGlvbjogd29ya2JlbmNoTWVudUNsb3NlQW5pbWF0aW9uXG5cdFx0fSk7XG5cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyByZXNvbHZlTWFpbk1lbnVBY3Rpb25zKG1lbnU6IElNZW51LCBfZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTxJQWN0aW9uW10+IHtcblx0XHRyZXR1cm4gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0pKS5zZWNvbmRhcnk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjY291bnRzQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFic3RyYWN0R2xvYmFsQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IEFDQ09VTlRTX1ZJU0lCSUxJVFlfUFJFRkVSRU5DRV9LRVkgPSAnd29ya2JlbmNoLmFjdGl2aXR5LnNob3dBY2NvdW50cyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBncm91cGVkQWNjb3VudHM6IE1hcDxzdHJpbmcsIChBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50ICYgeyBjYW5TaWduT3V0OiBib29sZWFuIH0pW10+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2JsZW1hdGljUHJvdmlkZXJzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuXHRwcml2YXRlIGluaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgc2Vzc2lvbkZyb21FbWJlZGRlciA9IG5ldyBMYXp5PFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyB8IHVuZGVmaW5lZD4+KCgpID0+IGdldEN1cnJlbnRBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvKHRoaXMuc2VjcmV0U3RvcmFnZVNlcnZpY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0TWVudUFjdGlvbnNQcm92aWRlcjogKCkgPT4gSUFjdGlvbltdLFxuXHRcdG9wdGlvbnM6IElDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0Y29udGV4dE1lbnVBbGlnbm1lbnRPcHRpb25zOiAoKSA9PiBSZWFkb25seTx7IGFuY2hvckFsaWdubWVudDogQW5jaG9yQWxpZ25tZW50OyBhbmNob3JBeGlzQWxpZ25tZW50OiBBbmNob3JBeGlzQWxpZ25tZW50IH0+IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsbENvbnRleHRNZW51QWN0aW9uczogKGFjdGlvbnM6IElBY3Rpb25bXSkgPT4gdm9pZCxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tcG9zaXRlQmFyQWN0aW9uLCB7XG5cdFx0XHRpZDogQUNDT1VOVFNfQUNUSVZJVFlfSUQsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjb3VudHMnLCBcIkFjY291bnRzXCIpLFxuXHRcdFx0Y2xhc3NOYW1lczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoR2xvYmFsQ29tcG9zaXRlQmFyLkFDQ09VTlRTX0lDT04pXG5cdFx0fSk7XG5cdFx0c3VwZXIoTWVudUlkLkFjY291bnRzQ29udGV4dCwgYWN0aW9uLCBvcHRpb25zLCBjb250ZXh0TWVudUFjdGlvbnNQcm92aWRlciwgY29udGV4dE1lbnVBbGlnbm1lbnRPcHRpb25zLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgbWVudVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgYWN0aXZpdHlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb24pO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLmluaXRpYWxpemUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoYXN5bmMgKGUpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuYWRkQWNjb3VudHNGcm9tUHJvdmlkZXIoZS5pZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcigoZSkgPT4ge1xuXHRcdFx0dGhpcy5ncm91cGVkQWNjb3VudHMuZGVsZXRlKGUuaWQpO1xuXHRcdFx0dGhpcy5wcm9ibGVtYXRpY1Byb3ZpZGVycy5kZWxldGUoZS5pZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmV2ZW50LnJlbW92ZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByZW1vdmVkIG9mIGUuZXZlbnQucmVtb3ZlZCkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlQWNjb3VudChlLnByb3ZpZGVySWQsIHJlbW92ZWQuYWNjb3VudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgY2hhbmdlZCBvZiBbLi4uKGUuZXZlbnQuY2hhbmdlZCA/PyBbXSksIC4uLihlLmV2ZW50LmFkZGVkID8/IFtdKV0pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yVXBkYXRlQWNjb3VudChlLnByb3ZpZGVySWQsIGNoYW5nZWQuYWNjb3VudCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyBUaGlzIGZ1bmN0aW9uIGV4aXN0cyB0byBlbnN1cmUgdGhhdCB0aGUgYWNjb3VudHMgYXJlIGFkZGVkIGZvciBhdXRoIHByb3ZpZGVycyB0aGF0IGhhZCBhbHJlYWR5IGJlZW4gcmVnaXN0ZXJlZFxuXHQvLyBiZWZvcmUgdGhlIG1lbnUgd2FzIGNyZWF0ZWQuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBSZXNvbHZpbmcgdGhlIG1lbnUgZG9lc24ndCBuZWVkIHRvIGhhcHBlbiBpbW1lZGlhdGVseSwgc28gd2UgY2FuIHdhaXQgdW50aWwgYWZ0ZXIgdGhlIHdvcmtiZW5jaCBoYXMgYmVlbiByZXN0b3JlZFxuXHRcdC8vIGFuZCBvbmx5IHJ1biB0aGlzIHdoZW4gdGhlIHN5c3RlbSBpcyBpZGxlLlxuXHRcdGF3YWl0IHRoaXMubGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIocnVuV2hlbldpbmRvd0lkbGUoZ2V0V2luZG93KHRoaXMuZWxlbWVudCksIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuZG9Jbml0aWFsaXplKCk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkcyA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChwcm92aWRlcklkcy5tYXAocHJvdmlkZXJJZCA9PiB0aGlzLmFkZEFjY291bnRzRnJvbVByb3ZpZGVyKHByb3ZpZGVySWQpKSk7XG5cblx0XHQvLyBMb2cgYW55IGVycm9ycyB0aGF0IG9jY3VycmVkIHdoaWxlIGluaXRpYWxpemluZy4gV2UgdHJ5IHRvIGJlIGJlc3QgZWZmb3J0IGhlcmUgdG8gc2hvdyB0aGUgbW9zdCBhbW91bnQgb2YgYWNjb3VudHNcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IocmVzdWx0LnJlYXNvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5pbml0aWFsaXplZCA9IHRydWU7XG5cdH1cblxuXHQvLyNyZWdpb24gb3ZlcnJpZGVzXG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJlc29sdmVNYWluTWVudUFjdGlvbnMoYWNjb3VudHNNZW51OiBJTWVudSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8SUFjdGlvbltdPiB7XG5cdFx0YXdhaXQgc3VwZXIucmVzb2x2ZU1haW5NZW51QWN0aW9ucyhhY2NvdW50c01lbnUsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCkuZmlsdGVyKHAgPT4gIXAuc3RhcnRzV2l0aChJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCkpO1xuXHRcdGNvbnN0IG90aGVyQ29tbWFuZHMgPSBhY2NvdW50c01lbnUuZ2V0QWN0aW9ucygpO1xuXHRcdGxldCBtZW51czogSUFjdGlvbltdID0gW107XG5cblx0XHRjb25zdCByZWdpc3RlcmVkUHJvdmlkZXJzID0gcHJvdmlkZXJzLmZpbHRlcihwcm92aWRlcklkID0+ICF0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5pc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVySWQpKTtcblx0XHRjb25zdCBkeW5hbWljUHJvdmlkZXJzID0gcHJvdmlkZXJzLmZpbHRlcihwcm92aWRlcklkID0+IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXJJZCkpO1xuXG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemVkKSB7XG5cdFx0XHRjb25zdCBub0FjY291bnRzQXZhaWxhYmxlQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ25vQWNjb3VudHNBdmFpbGFibGUnLCBsb2NhbGl6ZSgnbG9hZGluZycsIFwiTG9hZGluZy4uLlwiKSwgdW5kZWZpbmVkLCBmYWxzZSkpO1xuXHRcdFx0bWVudXMucHVzaChub0FjY291bnRzQXZhaWxhYmxlQWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHJlZ2lzdGVyZWRQcm92aWRlcnMpIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdFx0Y29uc3QgYWNjb3VudHMgPSB0aGlzLmdyb3VwZWRBY2NvdW50cy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0XHRcdGlmICghYWNjb3VudHMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5wcm9ibGVtYXRpY1Byb3ZpZGVycy5oYXMocHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbigncHJvdmlkZXJVbmF2YWlsYWJsZScsIGxvY2FsaXplKCdhdXRoUHJvdmlkZXJVbmF2YWlsYWJsZScsICd7MH0gaXMgY3VycmVudGx5IHVuYXZhaWxhYmxlJywgcHJvdmlkZXIubGFiZWwpLCB1bmRlZmluZWQsIGZhbHNlKSk7XG5cdFx0XHRcdFx0XHRtZW51cy5wdXNoKHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24pO1xuXHRcdFx0XHRcdFx0Ly8gdHJ5IGFnYWluIGluIHRoZSBiYWNrZ3JvdW5kIHNvIHRoYXQgaWYgdGhlIGZhaWx1cmUgd2FzIGludGVybWl0dGVudCwgd2UgY2FuIHJlc29sdmUgaXQgb24gdGhlIG5leHQgc2hvd2luZyBvZiB0aGUgbWVudVxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5hZGRBY2NvdW50c0Zyb21Qcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNhblVzZU1jcCA9ICEhcHJvdmlkZXIuYXV0aG9yaXphdGlvblNlcnZlcnM/Lmxlbmd0aDtcblx0XHRcdFx0Zm9yIChjb25zdCBhY2NvdW50IG9mIGFjY291bnRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWFuYWdlRXh0ZW5zaW9uc0FjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiBgY29uZmlndXJlU2Vzc2lvbnMke2FjY291bnQubGFiZWx9YCxcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlVHJ1c3RlZEV4dGVuc2lvbnMnLCBcIk1hbmFnZSBUcnVzdGVkIEV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfbWFuYWdlVHJ1c3RlZEV4dGVuc2lvbnNGb3JBY2NvdW50JywgeyBwcm92aWRlcklkLCBhY2NvdW50TGFiZWw6IGFjY291bnQubGFiZWwgfSlcblx0XHRcdFx0XHR9KTtcblxuXG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXJTdWJNZW51QWN0aW9uczogSUFjdGlvbltdID0gW21hbmFnZUV4dGVuc2lvbnNBY3Rpb25dO1xuXHRcdFx0XHRcdGlmIChjYW5Vc2VNY3ApIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1hbmFnZU1DUEFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGBjb25maWd1cmVTZXNzaW9ucyR7YWNjb3VudC5sYWJlbH1gLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRNQ1BTZXJ2ZXJzJywgXCJNYW5hZ2UgVHJ1c3RlZCBNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfbWFuYWdlVHJ1c3RlZE1DUFNlcnZlcnNGb3JBY2NvdW50JywgeyBwcm92aWRlcklkLCBhY2NvdW50TGFiZWw6IGFjY291bnQubGFiZWwgfSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cHJvdmlkZXJTdWJNZW51QWN0aW9ucy5wdXNoKG1hbmFnZU1DUEFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChhY2NvdW50LmNhblNpZ25PdXQpIHtcblx0XHRcdFx0XHRcdHByb3ZpZGVyU3ViTWVudUFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdGlkOiAnc2lnbk91dCcsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2lnbk91dCcsIFwiU2lnbiBPdXRcIiksXG5cdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX3NpZ25PdXRPZkFjY291bnQnLCB7IHByb3ZpZGVySWQsIGFjY291bnRMYWJlbDogYWNjb3VudC5sYWJlbCB9KVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyU3ViTWVudSA9IG5ldyBTdWJtZW51QWN0aW9uKCdhY3Rpdml0eWJhci5zdWJtZW51JywgYCR7YWNjb3VudC5sYWJlbH0gKCR7cHJvdmlkZXIubGFiZWx9KWAsIHByb3ZpZGVyU3ViTWVudUFjdGlvbnMpO1xuXHRcdFx0XHRcdG1lbnVzLnB1c2gocHJvdmlkZXJTdWJNZW51KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZHluYW1pY1Byb3ZpZGVycy5sZW5ndGggJiYgcmVnaXN0ZXJlZFByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0bWVudXMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVySWQgb2YgZHluYW1pY1Byb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdFx0XHRjb25zdCBhY2NvdW50cyA9IHRoaXMuZ3JvdXBlZEFjY291bnRzLmdldChwcm92aWRlcklkKTtcblx0XHRcdFx0Ly8gUHJvdmlkZSBfc29tZV8gZGlzY292ZXJhYmxlIHdheSB0byBtYW5hZ2UgZHluYW1pYyBhdXRoZW50aWNhdGlvbiBwcm92aWRlcnMuXG5cdFx0XHRcdC8vIFRoaXMgd2lsbCBlaXRoZXIgc2hvdyB1cCBpbnNpZGUgdGhlIGFjY291bnQgc3VibWVudSBvciBhcyBhIHRvcC1sZXZlbCBtZW51IGl0ZW0gaWYgdGhlcmVcblx0XHRcdFx0Ly8gYXJlIG5vIGFjY291bnRzLlxuXHRcdFx0XHRjb25zdCBtYW5hZ2VEeW5hbWljQXV0aFByb3ZpZGVyc0FjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ21hbmFnZUR5bmFtaWNBdXRoUHJvdmlkZXJzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZUR5bmFtaWNBdXRoUHJvdmlkZXJzJywgXCJNYW5hZ2UgRHluYW1pYyBBdXRoZW50aWNhdGlvbiBQcm92aWRlcnMuLi5cIiksXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ucmVtb3ZlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzJylcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghYWNjb3VudHMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5wcm9ibGVtYXRpY1Byb3ZpZGVycy5oYXMocHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbigncHJvdmlkZXJVbmF2YWlsYWJsZScsIGxvY2FsaXplKCdhdXRoUHJvdmlkZXJVbmF2YWlsYWJsZScsICd7MH0gaXMgY3VycmVudGx5IHVuYXZhaWxhYmxlJywgcHJvdmlkZXIubGFiZWwpLCB1bmRlZmluZWQsIGZhbHNlKSk7XG5cdFx0XHRcdFx0XHRtZW51cy5wdXNoKHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24pO1xuXHRcdFx0XHRcdFx0Ly8gdHJ5IGFnYWluIGluIHRoZSBiYWNrZ3JvdW5kIHNvIHRoYXQgaWYgdGhlIGZhaWx1cmUgd2FzIGludGVybWl0dGVudCwgd2UgY2FuIHJlc29sdmUgaXQgb24gdGhlIG5leHQgc2hvd2luZyBvZiB0aGUgbWVudVxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5hZGRBY2NvdW50c0Zyb21Qcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtZW51cy5wdXNoKG1hbmFnZUR5bmFtaWNBdXRoUHJvdmlkZXJzQWN0aW9uKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgYWNjb3VudCBvZiBhY2NvdW50cykge1xuXHRcdFx0XHRcdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IElzIHRoZXJlIGEgbmljZSB3YXkgdG8gYnJpbmcgdGhpcyBiYWNrP1xuXHRcdFx0XHRcdC8vIGNvbnN0IG1hbmFnZUV4dGVuc2lvbnNBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRcdFx0Ly8gXHRpZDogYGNvbmZpZ3VyZVNlc3Npb25zJHthY2NvdW50LmxhYmVsfWAsXG5cdFx0XHRcdFx0Ly8gXHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRFeHRlbnNpb25zJywgXCJNYW5hZ2UgVHJ1c3RlZCBFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHRcdC8vIFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHQvLyBcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX21hbmFnZVRydXN0ZWRFeHRlbnNpb25zRm9yQWNjb3VudCcsIHsgcHJvdmlkZXJJZCwgYWNjb3VudExhYmVsOiBhY2NvdW50LmxhYmVsIH0pXG5cdFx0XHRcdFx0Ly8gfSk7XG5cblx0XHRcdFx0XHRjb25zdCBwcm92aWRlclN1Yk1lbnVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdFx0XHRjb25zdCBtYW5hZ2VNQ1BBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRpZDogYGNvbmZpZ3VyZVNlc3Npb25zJHthY2NvdW50LmxhYmVsfWAsXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRNQ1BTZXJ2ZXJzJywgXCJNYW5hZ2UgVHJ1c3RlZCBNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19tYW5hZ2VUcnVzdGVkTUNQU2VydmVyc0ZvckFjY291bnQnLCB7IHByb3ZpZGVySWQsIGFjY291bnRMYWJlbDogYWNjb3VudC5sYWJlbCB9KVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHByb3ZpZGVyU3ViTWVudUFjdGlvbnMucHVzaChtYW5hZ2VNQ1BBY3Rpb24pO1xuXHRcdFx0XHRcdHByb3ZpZGVyU3ViTWVudUFjdGlvbnMucHVzaChtYW5hZ2VEeW5hbWljQXV0aFByb3ZpZGVyc0FjdGlvbik7XG5cdFx0XHRcdFx0aWYgKGFjY291bnQuY2FuU2lnbk91dCkge1xuXHRcdFx0XHRcdFx0cHJvdmlkZXJTdWJNZW51QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0aWQ6ICdzaWduT3V0Jyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaWduT3V0JywgXCJTaWduIE91dFwiKSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfc2lnbk91dE9mQWNjb3VudCcsIHsgcHJvdmlkZXJJZCwgYWNjb3VudExhYmVsOiBhY2NvdW50LmxhYmVsIH0pXG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXJTdWJNZW51ID0gbmV3IFN1Ym1lbnVBY3Rpb24oJ2FjdGl2aXR5YmFyLnN1Ym1lbnUnLCBgJHthY2NvdW50LmxhYmVsfSAoJHtwcm92aWRlci5sYWJlbH0pYCwgcHJvdmlkZXJTdWJNZW51QWN0aW9ucyk7XG5cdFx0XHRcdFx0bWVudXMucHVzaChwcm92aWRlclN1Yk1lbnUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1lbnVzLmxlbmd0aCAmJiBvdGhlckNvbW1hbmRzLmxlbmd0aCkge1xuXHRcdFx0bWVudXMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdH1cblxuXHRcdG90aGVyQ29tbWFuZHMuZm9yRWFjaCgoZ3JvdXAsIGkpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBncm91cFsxXTtcblx0XHRcdG1lbnVzID0gbWVudXMuY29uY2F0KGFjdGlvbnMpO1xuXHRcdFx0aWYgKGkgIT09IG90aGVyQ29tbWFuZHMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRtZW51cy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbWVudXM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUNvbnRleHRNZW51QWN0aW9ucyhkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTxJQWN0aW9uW10+IHtcblx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgc3VwZXIucmVzb2x2ZUNvbnRleHRNZW51QWN0aW9ucyhkaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5maWxsQ29udGV4dE1lbnVBY3Rpb25zKGFjdGlvbnMpO1xuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGdyb3VwZWRBY2NvdW50cyBoZWxwZXJzXG5cblx0cHJpdmF0ZSBhc3luYyBhZGRPclVwZGF0ZUFjY291bnQocHJvdmlkZXJJZDogc3RyaW5nLCBhY2NvdW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGFjY291bnRzID0gdGhpcy5ncm91cGVkQWNjb3VudHMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdGlmICghYWNjb3VudHMpIHtcblx0XHRcdGFjY291bnRzID0gW107XG5cdFx0XHR0aGlzLmdyb3VwZWRBY2NvdW50cy5zZXQocHJvdmlkZXJJZCwgYWNjb3VudHMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25Gcm9tRW1iZWRkZXIgPSBhd2FpdCB0aGlzLnNlc3Npb25Gcm9tRW1iZWRkZXIudmFsdWU7XG5cdFx0bGV0IGNhblNpZ25PdXQgPSB0cnVlO1xuXHRcdGlmIChcblx0XHRcdHNlc3Npb25Gcm9tRW1iZWRkZXJcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBpZiB3ZSBoYXZlIGEgc2Vzc2lvbiBmcm9tIHRoZSBlbWJlZGRlclxuXHRcdFx0JiYgIXNlc3Npb25Gcm9tRW1iZWRkZXIuY2FuU2lnbk91dFx0XHRcdFx0XHRcdFx0XHQvLyBhbmQgdGhhdCBzZXNzaW9uIHNheXMgd2UgY2FuJ3Qgc2lnbiBvdXRcblx0XHRcdCYmIChhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkKSlcdC8vIGFuZCB0aGF0IHNlc3Npb24gaXMgYXNzb2NpYXRlZCB3aXRoIHRoZSBhY2NvdW50IHdlIGFyZSBhZGRpbmcvdXBkYXRpbmdcblx0XHRcdFx0LnNvbWUocyA9PlxuXHRcdFx0XHRcdHMuaWQgPT09IHNlc3Npb25Gcm9tRW1iZWRkZXIuaWRcblx0XHRcdFx0XHQmJiBzLmFjY291bnQuaWQgPT09IGFjY291bnQuaWRcblx0XHRcdFx0KVxuXHRcdCkge1xuXHRcdFx0Y2FuU2lnbk91dCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nQWNjb3VudCA9IGFjY291bnRzLmZpbmQoYSA9PiBhLmxhYmVsID09PSBhY2NvdW50LmxhYmVsKTtcblx0XHRpZiAoZXhpc3RpbmdBY2NvdW50KSB7XG5cdFx0XHQvLyBpZiB3ZSBoYXZlIGFuIGV4aXN0aW5nIGFjY291bnQgYW5kIHdlIGRpc2NvdmVyIHRoYXQgd2Vcblx0XHRcdC8vIGNhbid0IHNpZ24gb3V0IG9mIGl0LCB1cGRhdGUgdGhlIGFjY291bnQgdG8gbWFyayBpdCBhcyBcImNhbid0IHNpZ24gb3V0XCJcblx0XHRcdGlmICghY2FuU2lnbk91dCkge1xuXHRcdFx0XHRleGlzdGluZ0FjY291bnQuY2FuU2lnbk91dCA9IGNhblNpZ25PdXQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjY291bnRzLnB1c2goeyAuLi5hY2NvdW50LCBjYW5TaWduT3V0IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlQWNjb3VudChwcm92aWRlcklkOiBzdHJpbmcsIGFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQpOiB2b2lkIHtcblx0XHRjb25zdCBhY2NvdW50cyA9IHRoaXMuZ3JvdXBlZEFjY291bnRzLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAoIWFjY291bnRzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSBhY2NvdW50cy5maW5kSW5kZXgoYSA9PiBhLmlkID09PSBhY2NvdW50LmlkKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWNjb3VudHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRpZiAoYWNjb3VudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmdyb3VwZWRBY2NvdW50cy5kZWxldGUocHJvdmlkZXJJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRBY2NvdW50c0Zyb21Qcm92aWRlcihwcm92aWRlcklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkKTtcblx0XHRcdHRoaXMucHJvYmxlbWF0aWNQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVySWQpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yVXBkYXRlQWNjb3VudChwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0dGhpcy5wcm9ibGVtYXRpY1Byb3ZpZGVycy5hZGQocHJvdmlkZXJJZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBjbGFzcyBHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWJzdHJhY3RHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHByb2ZpbGVCYWRnZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJvZmlsZUJhZGdlQ29udGVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXI6ICgpID0+IElBY3Rpb25bXSxcblx0XHRvcHRpb25zOiBJQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdGNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9uczogKCkgPT4gUmVhZG9ubHk8eyBhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudDsgYW5jaG9yQXhpc0FsaWdubWVudDogQW5jaG9yQXhpc0FsaWdubWVudCB9PiB8IHVuZGVmaW5lZCxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXBvc2l0ZUJhckFjdGlvbiwge1xuXHRcdFx0aWQ6IEdMT0JBTF9BQ1RJVklUWV9JRCxcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdtYW5hZ2UnLCBcIk1hbmFnZVwiKSxcblx0XHRcdGNsYXNzTmFtZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWNvbiA/IFRoZW1lSWNvbi5mcm9tSWQodXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pY29uKSA6IERFRkFVTFRfSUNPTilcblx0XHR9KTtcblx0XHRzdXBlcihNZW51SWQuR2xvYmFsQWN0aXZpdHksIGFjdGlvbiwgb3B0aW9ucywgY29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXIsIGNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9ucywgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIG1lbnVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGFjdGl2aXR5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IHtcblx0XHRcdGFjdGlvbi5jb21wb3NpdGVCYXJBY3Rpb25JdGVtID0ge1xuXHRcdFx0XHQuLi5hY3Rpb24uY29tcG9zaXRlQmFyQWN0aW9uSXRlbSxcblx0XHRcdFx0Y2xhc3NOYW1lczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pY29uID8gVGhlbWVJY29uLmZyb21JZCh1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmljb24pIDogREVGQVVMVF9JQ09OKVxuXHRcdFx0fTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy5wcm9maWxlQmFkZ2UgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1iYWRnZScpKTtcblx0XHR0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQgPSBhcHBlbmQodGhpcy5wcm9maWxlQmFkZ2UsICQoJy5wcm9maWxlLWJhZGdlLWNvbnRlbnQnKSk7XG5cdFx0dGhpcy51cGRhdGVQcm9maWxlQmFkZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJvZmlsZUJhZGdlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5wcm9maWxlQmFkZ2UgfHwgIXRoaXMucHJvZmlsZUJhZGdlQ29udGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNsZWFyTm9kZSh0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQpO1xuXHRcdGhpZGUodGhpcy5wcm9maWxlQmFkZ2UpO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmljb24gJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmljb24gIT09IERFRkFVTFRfSUNPTi5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICgodGhpcy5hY3Rpb24gYXMgQ29tcG9zaXRlQmFyQWN0aW9uKS5hY3Rpdml0aWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzaG93KHRoaXMucHJvZmlsZUJhZGdlKTtcblx0XHR0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQuY2xhc3NMaXN0LmFkZCgncHJvZmlsZS10ZXh0LW92ZXJsYXknKTtcblx0XHR0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQudGV4dENvbnRlbnQgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubmFtZS5zdWJzdHJpbmcoMCwgMikudG9VcHBlckNhc2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVBY3Rpdml0eSgpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVBY3Rpdml0eSgpO1xuXHRcdHRoaXMudXBkYXRlUHJvZmlsZUJhZGdlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZVRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQgPyBzdXBlci5jb21wdXRlVGl0bGUoKSA6IGxvY2FsaXplKCdtYW5hZ2UgcHJvZmlsZScsIFwiTWFuYWdlIHswfSAoUHJvZmlsZSlcIiwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm5hbWUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaW1wbGVBY2NvdW50QWN0aXZpdHlBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjY291bnRzQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aG92ZXJPcHRpb25zOiBJQWN0aXZpdHlIb3Zlck9wdGlvbnMsXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHNlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigoKSA9PiBzaW1wbGVBY3Rpdml0eUNvbnRleHRNZW51QWN0aW9ucyhzdG9yYWdlU2VydmljZSwgdHJ1ZSksXG5cdFx0XHR7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdGNvbG9yczogdGhlbWUgPT4gKHtcblx0XHRcdFx0XHRiYWRnZUJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQURHRV9CQUNLR1JPVU5EKSxcblx0XHRcdFx0XHRiYWRnZUZvcmVncm91bmQ6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQURHRV9GT1JFR1JPVU5EKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGhvdmVyT3B0aW9ucyxcblx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdH0sICgpID0+IHVuZGVmaW5lZCwgYWN0aW9ucyA9PiBhY3Rpb25zLCB0aGVtZVNlcnZpY2UsIGxpZmVjeWNsZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBtZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGF1dGhlbnRpY2F0aW9uU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBzZWNyZXRTdG9yYWdlU2VydmljZSwgbG9nU2VydmljZSwgYWN0aXZpdHlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaW1wbGVHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgR2xvYmFsQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aG92ZXJPcHRpb25zOiBJQWN0aXZpdHlIb3Zlck9wdGlvbnMsXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKCkgPT4gc2ltcGxlQWN0aXZpdHlDb250ZXh0TWVudUFjdGlvbnMoc3RvcmFnZVNlcnZpY2UsIGZhbHNlKSxcblx0XHRcdHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0Y29sb3JzOiB0aGVtZSA9PiAoe1xuXHRcdFx0XHRcdGJhZGdlQmFja2dyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0JBREdFX0JBQ0tHUk9VTkQpLFxuXHRcdFx0XHRcdGJhZGdlRm9yZWdyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0JBREdFX0ZPUkVHUk9VTkQpLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0aG92ZXJPcHRpb25zLFxuXHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0fSwgKCkgPT4gdW5kZWZpbmVkLCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgbWVudVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aXZpdHlTZXJ2aWNlKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzaW1wbGVBY3Rpdml0eUNvbnRleHRNZW51QWN0aW9ucyhzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLCBpc0FjY291bnQ6IGJvb2xlYW4pOiBJQWN0aW9uW10ge1xuXHRjb25zdCBjdXJyZW50RWxlbWVudENvbnRleHRNZW51QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGlmIChpc0FjY291bnQpIHtcblx0XHRjdXJyZW50RWxlbWVudENvbnRleHRNZW51QWN0aW9ucy5wdXNoKFxuXHRcdFx0dG9BY3Rpb24oeyBpZDogJ2hpZGVBY2NvdW50cycsIGxhYmVsOiBsb2NhbGl6ZSgnaGlkZUFjY291bnRzJywgXCJIaWRlIEFjY291bnRzXCIpLCBydW46ICgpID0+IHNldEFjY291bnRzQWN0aW9uVmlzaWJsZShzdG9yYWdlU2VydmljZSwgZmFsc2UpIH0pLFxuXHRcdFx0bmV3IFNlcGFyYXRvcigpXG5cdFx0KTtcblx0fVxuXHRyZXR1cm4gW1xuXHRcdC4uLmN1cnJlbnRFbGVtZW50Q29udGV4dE1lbnVBY3Rpb25zLFxuXHRcdHRvQWN0aW9uKHsgaWQ6ICd0b2dnbGUuaGlkZUFjY291bnRzJywgbGFiZWw6IGxvY2FsaXplKCdhY2NvdW50cycsIFwiQWNjb3VudHNcIiksIGNoZWNrZWQ6IGlzQWNjb3VudHNBY3Rpb25WaXNpYmxlKHN0b3JhZ2VTZXJ2aWNlKSwgcnVuOiAoKSA9PiBzZXRBY2NvdW50c0FjdGlvblZpc2libGUoc3RvcmFnZVNlcnZpY2UsICFpc0FjY291bnRzQWN0aW9uVmlzaWJsZShzdG9yYWdlU2VydmljZSkpIH0pLFxuXHRcdHRvQWN0aW9uKHsgaWQ6ICd0b2dnbGUuaGlkZU1hbmFnZScsIGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlJywgXCJNYW5hZ2VcIiksIGNoZWNrZWQ6IHRydWUsIGVuYWJsZWQ6IGZhbHNlLCBydW46ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdcIk1hbmFnZVwiIGNhbiBub3QgYmUgaGlkZGVuJyk7IH0gfSlcblx0XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWNjb3VudHNBY3Rpb25WaXNpYmxlKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiBib29sZWFuIHtcblx0cmV0dXJuIHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQWNjb3VudHNBY3Rpdml0eUFjdGlvblZpZXdJdGVtLkFDQ09VTlRTX1ZJU0lCSUxJVFlfUFJFRkVSRU5DRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gc2V0QWNjb3VudHNBY3Rpb25WaXNpYmxlKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIHZpc2libGU6IGJvb2xlYW4pIHtcblx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWNjb3VudHNBY3Rpdml0eUFjdGlvblZpZXdJdGVtLkFDQ09VTlRTX1ZJU0lCSUxJVFlfUFJFRkVSRU5DRV9LRVksIHZpc2libGUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVcsMEJBQTBCO0FBQzlDLFNBQVMsc0JBQXNCLDBCQUEwQjtBQUN6RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixrQkFBa0I7QUFDNUMsU0FBc0IscUJBQXFCO0FBQzNDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCLDBCQUEwRztBQUMvSSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxRQUFpQixXQUFXLGVBQWUsZ0JBQWdCO0FBQ3BFLFNBQWdCLGNBQWMsY0FBYztBQUM1QyxTQUFTLHVCQUF1QixXQUFXLFFBQVEsV0FBVyxNQUFNLE1BQU0sYUFBYSxHQUFHLG1CQUFtQixpQkFBaUI7QUFDOUgsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxhQUFhLHNCQUFvQztBQUMxRCxTQUFTLGlCQUFpQiwyQkFBMkI7QUFDckQsU0FBUyxZQUFZO0FBQ3JCLFNB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
