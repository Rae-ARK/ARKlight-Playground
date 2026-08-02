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
import * as dom from "../../../../base/browser/dom.js";
import * as touch from "../../../../base/browser/touch.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { toAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { TabbedActionListWidget } from "../../../../platform/actionWidget/browser/tabbedActionListWidget.js";
import { IMenuService, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../platform/agentHost/common/remoteAgentHostService.js";
import { TUNNEL_ADDRESS_PREFIX } from "../../../../platform/agentHost/common/tunnelAgentHost.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from "../../../services/sessions/common/session.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsRecentWorkspacesService } from "../../../services/sessions/browser/sessionsRecentWorkspacesService.js";
import { isAgentHostProvider } from "../../../common/agentHostSessionsProvider.js";
import { SessionWorkspacePickerGroupContext } from "../../../common/contextkeys.js";
import { getStatusHover, getStatusLabel, removeRemoteHost, showRemoteHostOptions } from "../../providers/remoteAgentHost/browser/remoteHostOptions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { reportNewChatPickerClosed } from "./newChatPickerTelemetry.js";
import { Menus } from "../../../browser/menus.js";
import { markOnboardingTarget } from "../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
const FILTER_THRESHOLD = 10;
const TABBED_PICKER_WIDTH = 360;
const RESTORE_CONNECT_GRACE_MS = 5e3;
let WorkspacePicker = class extends Disposable {
  constructor(options, actionWidgetService, uriIdentityService, sessionsProvidersService, recentWorkspacesService, remoteAgentHostService, configurationService, commandService, menuService, contextKeyService, instantiationService, fileDialogService, telemetryService, notificationService) {
    super();
    this.options = options;
    this.actionWidgetService = actionWidgetService;
    this.uriIdentityService = uriIdentityService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.recentWorkspacesService = recentWorkspacesService;
    this.remoteAgentHostService = remoteAgentHostService;
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.fileDialogService = fileDialogService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
    this._onDidSelectWorkspace = this._register(new Emitter());
    this.onDidSelectWorkspace = this._onDidSelectWorkspace.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._selectionGeneration = 0;
    /**
     * Set to `true` once the user has explicitly picked or cleared a workspace.
     * Until then, late-arriving provider registrations are allowed to upgrade
     * the current (auto-restored) selection to the user's stored "checked"
     * entry. After the user has acted, providers coming and going never move
     * the selection out from under them.
     */
    this._userHasPicked = false;
    /**
     * Watches the connection status of a restored remote workspace. Cleared when
     * the user explicitly picks, when the connection succeeds, or when it fails
     * and we fall back.
     */
    this._connectionStatusWatch = this._register(new MutableDisposable());
    this._localBrowseAction = {
      label: localize("workspacePicker.browseSelectLocal", "Select..."),
      group: SESSION_WORKSPACE_GROUP_LOCAL,
      icon: Codicon.folderOpened,
      providerId: "",
      run: async () => (await this._browseForLocalFolder())?.workspace
    };
    /** All live trigger elements. Label updates fan out to every entry. */
    this._triggerElements = /* @__PURE__ */ new Set();
    this._renderDisposables = this._register(new DisposableStore());
    /**
     * Whether the user explicitly clicked a tab while the picker was open.
     * Reset on each fresh open so the picker re-defaults to the selected
     * workspace's group between opens.
     */
    this._userPickedTab = false;
    this._tabbedWidget = this._register(this.instantiationService.createInstance(TabbedActionListWidget));
    this._pickerGroupContext = SessionWorkspacePickerGroupContext.bindTo(this.contextKeyService);
    this._register(this._tabbedWidget.onDidChangeTab((tab) => {
      this._activeTab = tab;
      this._userPickedTab = true;
      this._pickerGroupContext.set(tab);
    }));
    this._register(this._tabbedWidget.onDidHide(() => {
      this._pickerGroupContext.reset();
    }));
    const restored = this._restoreSelectedWorkspace();
    this._applySelection(restored);
    if (this._selectedResolved) {
      this._watchForConnectionFailure(this._selectedResolved);
    }
    this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
      if (this._selectedFolderUri) {
        const reresolved = this._resolveFolder(this._selectedFolderUri);
        if (!reresolved) {
          this._selectedFolderUri = void 0;
          this._selectedResolved = void 0;
          this._connectionStatusWatch.clear();
          this._updateTriggerLabel();
          this._onDidChangeSelection.fire();
          this._onDidSelectWorkspace.fire(void 0);
        } else {
          this._selectedResolved = reresolved;
        }
      }
      if (!this._userHasPicked) {
        const restoredNow = this._restoreSelectedWorkspace();
        if (restoredNow && !this._isSelectedFolder(restoredNow.workspace.folders[0]?.root)) {
          this._applySelection(restoredNow);
          this._updateTriggerLabel();
          this._onDidChangeSelection.fire();
          this._onDidSelectWorkspace.fire(this._selectedFolderUri);
          this._watchForConnectionFailure(restoredNow);
        }
      }
    }));
    this._register(this.onDidSelectWorkspace((selection) => {
      if (selection && !this.actionWidgetService.isVisible && !this._tabbedWidget.isVisible) {
        this._userPickedTab = false;
      }
    }));
  }
  get selectedFolderUri() {
    return this._selectedFolderUri;
  }
  /**
   * Returns the currently selected folder resolved to a workspace via the
   * first provider that can resolve it. Used internally for rendering
   * (label, icon, group). The provider association is not part of the
   * picker's public contract — callers should use {@link selectedFolderUri}
   * and let the management service rediscover the provider.
   */
  get selectedResolved() {
    return this._selectedResolved;
  }
  /**
   * Renders the project picker trigger button into the given container.
   * Returns the container element.
   *
   * Calling it again replaces the trigger created by the previous
   * {@link render} call.
   */
  render(container) {
    this._renderDisposables.clear();
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot.sessions-chat-workspace-picker"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    this._renderDisposables.add(this._addTrigger(slot));
    return slot;
  }
  /**
   * Shared trigger-creation core for {@link render}. Wires up the click /
   * keyboard / touch handlers and the per-trigger lifecycle.
   */
  _addTrigger(slot) {
    const triggerDisposables = new DisposableStore();
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    this._triggerElements.add(trigger);
    this._triggerElement = trigger;
    this._renderTriggerLabel(trigger);
    triggerDisposables.add(markOnboardingTarget(trigger, "sessions.newSession.workspacePicker", {
      open: () => this.showPicker(false, trigger)
    }));
    triggerDisposables.add(touch.Gesture.addTarget(trigger));
    [dom.EventType.CLICK, touch.EventType.Tap].forEach((eventType) => {
      triggerDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this.showPicker(false, trigger);
      }));
    });
    triggerDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this.showPicker(false, trigger);
      }
    }));
    triggerDisposables.add({
      dispose: () => {
        this._triggerElements.delete(trigger);
        if (this._triggerElement === trigger) {
          this._triggerElement = this._triggerElements.values().next().value;
        }
      }
    });
    return triggerDisposables;
  }
  /**
   * Shows the workspace picker dropdown anchored to a trigger element.
   *
   * @param force When true, re-show even if the picker is already visible.
   *              Used internally when swapping items in place after a tab
   *              change.
   * @param anchor The specific trigger element to anchor the popup to. When
   *               omitted, defaults to the most-recently rendered trigger.
   *               Pass through when more than one trigger is live and the
   *               popup should align with the one the user actually clicked.
   */
  showPicker(force = false, anchor) {
    const triggerElement = anchor ?? this._triggerElement;
    if (!triggerElement) {
      return;
    }
    const alreadyVisible = this.actionWidgetService.isVisible || this._tabbedWidget.isVisible;
    if (!force && alreadyVisible) {
      return;
    }
    const tabs = this._showTabs() ? this._getAvailableTabs() : [];
    if (tabs.length > 0) {
      const selectedGroup = this._selectedResolved?.workspace.group;
      if (!this._userPickedTab && selectedGroup && tabs.some((t) => t.id === selectedGroup)) {
        this._activeTab = selectedGroup;
      }
      if (!this._activeTab || !tabs.some((t) => t.id === this._activeTab)) {
        this._activeTab = tabs[0].id;
      }
    }
    const tabbed = tabs.length > 1;
    if (tabbed) {
      this._showTabbedPicker(tabs, triggerElement);
    } else {
      this._activeTab = void 0;
      this._showFlatPicker(triggerElement);
    }
  }
  /**
   * Subclasses may opt out of the categorical tab bar (e.g. when scoped to
   * a single host).
   */
  _showTabs() {
    return true;
  }
  _getAvailableTabs() {
    const byLabel = /* @__PURE__ */ new Map();
    const remoteAgentHostsEnabled = this.configurationService.getValue(RemoteAgentHostsEnabledSettingId);
    if (remoteAgentHostsEnabled) {
      byLabel.set(SESSION_WORKSPACE_GROUP_REMOTE, {
        id: SESSION_WORKSPACE_GROUP_REMOTE,
        icon: Codicon.beaker,
        tooltip: `${SESSION_WORKSPACE_GROUP_REMOTE} (${localize("workspacePicker.experimental", "Experimental")})`
      });
    }
    for (const provider of this.sessionsProvidersService.getProviders()) {
      if (provider.supportsLocalWorkspaces && !byLabel.has(SESSION_WORKSPACE_GROUP_LOCAL)) {
        byLabel.set(SESSION_WORKSPACE_GROUP_LOCAL, { id: SESSION_WORKSPACE_GROUP_LOCAL });
      }
      for (const action of provider.browseActions) {
        if (action.group === SESSION_WORKSPACE_GROUP_REMOTE && !remoteAgentHostsEnabled) {
          continue;
        }
        if (action.group && !byLabel.has(action.group)) {
          byLabel.set(action.group, { id: action.group });
        }
      }
    }
    return Array.from(byLabel.values()).sort((a, b) => a.id === SESSION_WORKSPACE_GROUP_LOCAL ? -1 : b.id === SESSION_WORKSPACE_GROUP_LOCAL ? 1 : a.id.localeCompare(b.id));
  }
  /**
   * Builds the shared `IActionListDelegate` used by both the flat and
   * tabbed presentations.
   */
  _buildDelegate(triggerElement, hide) {
    return {
      onSelect: (item) => {
        hide();
        void this._dispatchPickerItem(item);
      },
      onHide: () => {
        triggerElement.setAttribute("aria-expanded", "false");
        triggerElement.focus();
      }
    };
  }
  _buildListOptions(items, pickerWidth) {
    const showFilter = items.filter((i) => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;
    return showFilter ? { showFilter: true, filterPlaceholder: localize("workspacePicker.filter", "Search Workspaces..."), reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth, hideDefaultKeybindingTooltip: true } : { reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth, hideDefaultKeybindingTooltip: true };
  }
  /**
   * Flat (no-tabs) presentation. Delegates rendering to the shared
   * `IActionWidgetService` so we benefit from its keybindings, focus
   * tracking and submenu chrome.
   */
  _showFlatPicker(triggerElement) {
    this._tabbedWidget.hide();
    const items = this._buildItems();
    const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
    triggerElement.setAttribute("aria-expanded", "true");
    this.actionWidgetService.show(
      "workspacePicker",
      false,
      items,
      delegate,
      triggerElement,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("workspacePicker.ariaLabel", "Workspace Picker")
      },
      this._buildListOptions(items, void 0)
    );
  }
  /**
   * Tabbed presentation. Delegates rendering and lifecycle to the
   * platform `TabbedActionListWidget`; this picker only owns the data
   * and selection logic.
   */
  _showTabbedPicker(tabs, triggerElement) {
    if (this.actionWidgetService.isVisible) {
      this.actionWidgetService.hide();
    }
    const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
    const accessibilityProvider = {
      getAriaLabel: (item) => item.label ?? "",
      getWidgetAriaLabel: () => localize("workspacePicker.ariaLabel", "Workspace Picker")
    };
    triggerElement.setAttribute("aria-expanded", "true");
    this._pickerGroupContext.set(this._activeTab ?? tabs[0].id);
    this._tabbedWidget.show({
      user: "workspacePicker",
      anchor: triggerElement,
      tabs,
      initialTab: this._activeTab ?? tabs[0].id,
      createActionList: (tab) => {
        this._activeTab = tab;
        const items = this._buildItems();
        return { items, listOptions: { inlineDescription: true, showGroupTitleOnFirstItem: true, hideDefaultKeybindingTooltip: true } };
      },
      delegate,
      accessibilityProvider,
      width: TABBED_PICKER_WIDTH,
      tabBarClassName: "sessions-workspace-picker-tabbar"
    });
  }
  /**
   * Dispatch logic for a picker item once the user picks it. Shared
   * between the desktop action-widget delegate and any mobile sheet
   * subclass that opts to render a different UI but reuse the
   * selection semantics. Treats unavailable workspaces as a no-op.
   */
  async _dispatchPickerItem(item) {
    const generation = ++this._selectionGeneration;
    this._reportPickerClosed(item);
    if (item.run) {
      item.run();
      return true;
    } else if (item.commandId) {
      void this.commandService.executeCommand(item.commandId);
      return true;
    } else if (item.folderUri && item.providerId && this._isProviderUnavailable(item.providerId)) {
      return false;
    }
    if (item.browseActionIndex !== void 0) {
      const selection = await this._executeBrowseAction(item.browseActionIndex);
      const folderUri = selection?.workspace.folders[0]?.root;
      if (!folderUri || generation !== this._selectionGeneration) {
        return false;
      }
      if (!await this._canSelectWorkspace(folderUri, selection.providerId)) {
        return false;
      }
      if (generation !== this._selectionGeneration) {
        return false;
      }
      this._selectFolder(folderUri);
      return true;
    } else if (item.folderUri) {
      if (item.providerId && !await this._connectProviderOnDemand(item.providerId)) {
        return false;
      }
      if (generation !== this._selectionGeneration) {
        return false;
      }
      if (!await this._canSelectWorkspace(item.folderUri, item.providerId)) {
        return false;
      }
      if (generation !== this._selectionGeneration) {
        return false;
      }
      this._selectFolder(item.folderUri);
      return true;
    }
    return false;
  }
  /**
   * Emits `newChatPickerClosed` telemetry on user selection. The
   * "before" value is read from storage (the currently-checked recent
   * workspace) if available, otherwise from the in-memory selection.
   * The "after" value comes from the item the user picked — undefined
   * when the item is a browse action or command rather than a workspace.
   */
  _reportPickerClosed(item) {
    const beforeFromStorage = this._restoreCheckedWorkspace();
    const before = beforeFromStorage ?? this._selectedResolved;
    const afterUri = item.folderUri;
    const afterResolved = afterUri ? this._resolveFolder(afterUri) : void 0;
    reportNewChatPickerClosed(this.telemetryService, {
      id: "NewChatWorkspacePicker",
      name: "NewChatWorkspacePicker",
      optionIdBefore: before?.workspace?.uri.toString(),
      optionIdAfter: afterResolved?.workspace?.uri.toString(),
      optionLabelBefore: before?.workspace?.label,
      optionLabelAfter: afterResolved?.workspace?.label,
      isPII: true
    });
  }
  /**
   * Programmatically set the selected workspace by folder URI.
   * @param folderUri The folder URI to select.
   * @param options.fireEvent Whether to fire the onDidSelectWorkspace event. Defaults to true.
   * @param options.providerId Optional providerId hint that wins over any historical
   *        recent entry's provider. Use when the caller knows which provider should
   *        own the resulting session (e.g. "New Session" invoked from a workspace
   *        section in the sessions list, where the existing sessions for the
   *        workspace were created by a specific provider).
   * @param options.persist Whether to persist the selection as a recent workspace. Defaults to true.
   */
  setSelectedWorkspace(folderUri, options) {
    this._selectFolder(folderUri, options?.fireEvent ?? true, options?.providerId, options?.persist ?? true);
  }
  /**
   * Hides whichever popup variant is currently visible — the shared
   * action-widget-service flat picker or our own context-view-driven
   * tabbed picker.
   */
  _hidePicker() {
    this._tabbedWidget.hide();
    if (this.actionWidgetService.isVisible) {
      this.actionWidgetService.hide();
    }
  }
  /**
   * Clears the selected project.
   */
  clearSelection() {
    this._selectionGeneration++;
    this._hidePicker();
    this._userHasPicked = true;
    this._connectionStatusWatch.clear();
    this._selectedFolderUri = void 0;
    this._selectedResolved = void 0;
    if (this._shouldPersistSelection()) {
      this.recentWorkspacesService.clearCheckedWorkspace();
    }
    this._updateTriggerLabel();
    this._onDidChangeSelection.fire();
  }
  /**
   * Clears the selection if it matches the given URI.
   */
  removeFromRecents(uri) {
    if (this._selectedFolderUri && this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, uri)) {
      this.clearSelection();
    }
  }
  _selectFolder(folderUri, fireEvent = true, providerIdHint, persist = true) {
    this._selectionGeneration++;
    this._userHasPicked = true;
    this._connectionStatusWatch.clear();
    const storedProviderId = this.recentWorkspacesService.getRecentWorkspaces().find((r) => this.uriIdentityService.extUri.isEqual(r.workspace.folders[0]?.root, folderUri))?.providerId;
    const resolved = this._resolveFolder(folderUri, providerIdHint ?? storedProviderId);
    this._selectedFolderUri = folderUri;
    this._selectedResolved = resolved;
    if (persist && this._shouldPersistSelection()) {
      this.recentWorkspacesService.addRecentWorkspace(folderUri, resolved?.providerId, true);
    }
    this._updateTriggerLabel();
    this._onDidChangeSelection.fire();
    if (fireEvent) {
      this._onDidSelectWorkspace.fire(folderUri);
    }
  }
  _shouldPersistSelection() {
    return true;
  }
  /**
   * Apply a restored selection without firing events or persisting. Used
   * during construction and after provider list changes.
   */
  _applySelection(resolved) {
    this._selectedResolved = resolved;
    this._selectedFolderUri = resolved?.workspace.folders[0]?.root;
  }
  /**
   * Iterate providers and return the first resolution of the folder URI.
   * When `preferredProviderId` is given, that provider is tried first so a
   * user's historical pick survives provider iteration order changes.
   */
  _resolveFolder(folderUri, preferredProviderId) {
    if (preferredProviderId) {
      const preferred = this.sessionsProvidersService.getProvider(preferredProviderId);
      const workspace = preferred?.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: preferredProviderId, workspace };
      }
    }
    for (const provider of this.sessionsProvidersService.getProviders()) {
      const workspace = provider.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: provider.id, workspace };
      }
    }
    return void 0;
  }
  /**
   * Executes a browse action from a provider, identified by index.
   */
  async _executeBrowseAction(actionIndex) {
    const allActions = this._getAllBrowseActions();
    const action = allActions[actionIndex];
    if (!action) {
      return void 0;
    }
    try {
      if (action === this._localBrowseAction) {
        return await this._browseForLocalFolder();
      }
      const workspace = await action.run();
      return workspace ? { workspace, providerId: action.providerId } : void 0;
    } catch {
    }
    return void 0;
  }
  async _canSelectWorkspace(folderUri, providerId) {
    return !this.options.canSelectWorkspace || await this.options.canSelectWorkspace(folderUri, providerId);
  }
  /**
   * Collects browse actions from all registered providers, scoped to the
   * currently active tab when tabs are shown.
   */
  _getAllBrowseActions() {
    const all = this.sessionsProvidersService.getProviders().flatMap((p) => p.browseActions);
    const hasLocalSupport = this.sessionsProvidersService.getProviders().some((p) => p.supportsLocalWorkspaces);
    if (hasLocalSupport) {
      all.unshift(this._localBrowseAction);
    }
    if (!this._isTabFiltered()) {
      return all;
    }
    return all.filter((a) => a.group === this._activeTab);
  }
  /**
   * Opens a folder picker dialog and returns the chosen URI. The folder's
   * provider is rediscovered later by the management service when the
   * session is created — no provider quick-pick is needed here.
   */
  async _browseForLocalFolder() {
    const localProviders = this.sessionsProvidersService.getProviders().filter((p) => p.supportsLocalWorkspaces);
    if (localProviders.length === 0) {
      return void 0;
    }
    const result = await this.fileDialogService.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false
    });
    if (!result?.length) {
      return void 0;
    }
    for (const provider of localProviders) {
      const workspace = provider.resolveWorkspace(result[0]);
      if (workspace) {
        return { workspace, providerId: provider.id };
      }
    }
    return void 0;
  }
  /** True when the picker is currently scoped to a single tab. */
  _isTabFiltered() {
    return this._showTabs() && !!this._activeTab && this._getAvailableTabs().length > 1;
  }
  /**
   * Builds the picker items list from recent workspaces.
   *
   * Items are shown in a flat recency-sorted list (most recently used first)
   * without source grouping. Own recents come first, followed by VS Code
   * recent folders.
   */
  _buildItems() {
    const items = [];
    const allProviders = this.sessionsProvidersService.getProviders();
    const providerIds = new Set(allProviders.map((p) => p.id));
    const tabFilter = this._isTabFiltered() ? (w) => w.workspace.group === this._activeTab : void 0;
    const recentWorkspaces = this._getRecentWorkspaces().filter((w) => providerIds.has(w.providerId)).filter((w) => !tabFilter || tabFilter(w));
    for (const { workspace, providerId } of recentWorkspaces) {
      const folderUri = workspace.folders[0]?.root;
      if (!folderUri) {
        continue;
      }
      const selected = this._isSelectedFolder(folderUri);
      items.push({
        kind: ActionListItemKind.Action,
        label: workspace.label,
        description: workspace.description,
        group: { title: "", icon: workspace.icon },
        disabled: this._isProviderUnavailable(providerId),
        item: { folderUri, providerId, checked: selected || void 0 },
        onRemove: () => this._removeRecentWorkspace(folderUri)
      });
    }
    const allBrowseActions = this._getAllBrowseActions();
    const remoteProviders = allProviders.filter(isAgentHostProvider).filter((p) => p.connectionStatus !== void 0);
    const includeRemoteProviders = this._activeTab === SESSION_WORKSPACE_GROUP_REMOTE;
    if (items.length > 0 && allBrowseActions.length > 0) {
      items.push({ kind: ActionListItemKind.Separator, label: "" });
    }
    allBrowseActions.forEach((action, index) => {
      const provider = allProviders.find((p) => p.id === action.providerId);
      const agentHostProvider = provider && isAgentHostProvider(provider) ? provider : void 0;
      const connectionStatus = agentHostProvider?.connectionStatus?.get();
      const isIncompatible = RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus);
      const isUnavailable = isIncompatible || !!connectionStatus && !RemoteAgentHostConnectionStatus.isConnected(connectionStatus) && !agentHostProvider?.canConnectOnDemand;
      items.push({
        kind: ActionListItemKind.Action,
        label: localize("workspacePicker.browseSelectAction", "Select..."),
        description: action.description,
        group: { title: "", icon: action.icon },
        disabled: isUnavailable,
        item: { browseActionIndex: index }
      });
    });
    const manageActions = [];
    if (includeRemoteProviders) {
      for (const provider of remoteProviders) {
        const status2 = provider.connectionStatus.get();
        const isTunnel = provider.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
        const action = toAction({
          id: `workspacePicker.remote.${provider.id}`,
          label: provider.label,
          tooltip: getStatusLabel(status2),
          enabled: true,
          run: () => {
            this._hidePicker();
            this._showRemoteHostOptionsDelayed(provider);
          }
        });
        const extended = action;
        extended.icon = RemoteAgentHostConnectionStatus.isIncompatible(status2) ? Codicon.warning : isTunnel ? Codicon.cloud : Codicon.remote;
        extended.hoverContent = getStatusHover(status2, provider.remoteAddress);
        if (provider.remoteAddress) {
          extended.onRemove = async () => {
            await removeRemoteHost(provider, this.remoteAgentHostService);
          };
        }
        manageActions.push(action);
      }
    }
    const menuActions = this.menuService.getMenuActions(Menus.SessionWorkspaceManage, this.contextKeyService, { renderShortTitle: true });
    for (const [, actions] of menuActions) {
      for (const menuAction of actions) {
        if (menuAction instanceof MenuItemAction) {
          const icon = ThemeIcon.isThemeIcon(menuAction.item.icon) ? menuAction.item.icon : void 0;
          manageActions.push(Object.assign(menuAction, { icon }));
        }
      }
    }
    if (manageActions.length > 0) {
      if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
        items.push({ kind: ActionListItemKind.Separator, label: "" });
      }
      for (const action of manageActions) {
        const extended = action;
        items.push({
          kind: ActionListItemKind.Action,
          label: action.label,
          description: extended.onRemove ? action.tooltip || void 0 : void 0,
          group: { title: "", icon: extended.icon ?? Codicon.settingsGear },
          item: { run: () => action.run(), commandId: action.id },
          onRemove: extended.onRemove
        });
      }
    }
    return items;
  }
  _showRemoteHostOptionsDelayed(provider) {
    const timeout = setTimeout(() => {
      this.instantiationService.invokeFunction((accessor) => showRemoteHostOptions(accessor, provider));
    }, 1);
    this._renderDisposables.add({ dispose: () => clearTimeout(timeout) });
  }
  _updateTriggerLabel() {
    for (const trigger of this._triggerElements) {
      this._renderTriggerLabel(trigger);
    }
  }
  _renderTriggerLabel(trigger) {
    dom.clearNode(trigger);
    const workspace = this._selectedResolved?.workspace;
    const label = workspace ? workspace.label : localize("pickWorkspace", "workspace");
    const icon = workspace ? workspace.icon : Codicon.project;
    trigger.setAttribute("aria-label", workspace ? localize("workspacePicker.selectedAriaLabel", "New session in {0}", label) : localize("workspacePicker.pickAriaLabel", "Start by picking a workspace"));
    dom.append(trigger, renderIcon(icon));
    const labelSpan = dom.append(trigger, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = label;
    dom.append(trigger, renderIcon(Codicon.chevronDownCompact)).classList.add("sessions-chat-dropdown-chevron");
  }
  /**
   * Returns whether the given provider is a remote that is currently unavailable
   * (incompatible, or disconnected/still connecting without on-demand connect).
   * Returns false for providers without connection status (e.g. local providers).
   */
  _isProviderUnavailable(providerId) {
    const provider = this.sessionsProvidersService.getProvider(providerId);
    if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
      return false;
    }
    const connectionStatus = provider.connectionStatus.get();
    return RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus) || !RemoteAgentHostConnectionStatus.isConnected(connectionStatus) && !provider.canConnectOnDemand;
  }
  async _connectProviderOnDemand(providerId) {
    const provider = this.sessionsProvidersService.getProvider(providerId);
    if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
      return true;
    }
    const connectionStatus = provider.connectionStatus.get();
    if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
      return true;
    }
    if (RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus) || !provider.canConnectOnDemand || !provider.connect) {
      return false;
    }
    const initialMessage = localize("workspacePicker.connectingRemoteAgentHost", "Connecting to {0}...", provider.label);
    const handle = this.notificationService.notify({
      severity: Severity.Info,
      message: initialMessage,
      progress: { infinite: true }
    });
    status(initialMessage);
    const progressListener = provider.onDidReportConnectProgress?.((progress) => {
      if (!provider.remoteAddress || progress.connectionKey === provider.remoteAddress) {
        handle.updateMessage(progress.message);
        status(progress.message);
      }
    });
    let connected = false;
    try {
      await provider.connect();
      connected = RemoteAgentHostConnectionStatus.isConnected(provider.connectionStatus.get());
    } catch {
    } finally {
      progressListener?.dispose();
      handle.close();
    }
    if (connected) {
      return true;
    }
    const message = localize("workspacePicker.connectRemoteAgentHostFailed", "Failed to connect to {0}.", provider.label);
    this.notificationService.error(message);
    status(message);
    return false;
  }
  _isSelectedFolder(folderUri) {
    if (!this._selectedFolderUri || !folderUri) {
      return false;
    }
    return this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, folderUri);
  }
  _restoreSelectedWorkspace() {
    const checked = this._restoreCheckedWorkspace();
    if (checked) {
      return checked;
    }
    try {
      for (const recent of this.recentWorkspacesService.getRecentWorkspaces(false)) {
        if (this._isProviderUnavailable(recent.providerId)) {
          continue;
        }
        return recent;
      }
      return void 0;
    } catch {
      return void 0;
    }
  }
  /**
   * Restore only the checked (previously selected) workspace if any
   * provider can resolve its URI. The provider's connection status is
   * intentionally NOT checked — we honor the user's explicit pick even
   * if the remote is still connecting or currently disconnected. The
   * trigger label reflects the connection state separately
   * (spinner / grayed).
   */
  _restoreCheckedWorkspace() {
    try {
      return this.recentWorkspacesService.getRecentWorkspaces(false).find((recent) => recent.checked);
    } catch {
      return void 0;
    }
  }
  /**
   * When restoring a workspace whose provider isn't currently Connected,
   * watch the connection status. Fires `onDidSelectWorkspace(undefined)`
   * (which the view pane converts to `unsetNewSession()`) if:
   *   - the status transitions to Disconnected after we start watching, or
   *   - the status is still not Connected after a short grace period.
   *
   * The grace period covers a race: provider state can transition synchronously
   * inside provider registration before our autorun's first read, so we may
   * never observe an explicit Disconnected transition. The timer ensures we
   * eventually fall back instead of leaving the picker showing an unreachable
   * remote with no session.
   *
   * Has no effect once the user makes an explicit pick (`_userHasPicked`).
   */
  _watchForConnectionFailure(resolved) {
    const provider = this.sessionsProvidersService.getProvider(resolved.providerId);
    if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
      return;
    }
    const connStatus = provider.connectionStatus;
    if (RemoteAgentHostConnectionStatus.isConnected(connStatus.get())) {
      return;
    }
    const folderUri = resolved.workspace.folders[0]?.root;
    if (!folderUri) {
      return;
    }
    const store = new DisposableStore();
    this._connectionStatusWatch.value = store;
    const fallback = () => {
      this._connectionStatusWatch.clear();
      if (!this._userHasPicked && this._isSelectedFolder(folderUri)) {
        this._selectedFolderUri = void 0;
        this._selectedResolved = void 0;
        this._updateTriggerLabel();
        this._onDidChangeSelection.fire();
        this._onDidSelectWorkspace.fire(void 0);
      }
    };
    let isFirstRun = true;
    store.add(autorun((reader) => {
      const status2 = connStatus.read(reader);
      if (RemoteAgentHostConnectionStatus.isConnected(status2)) {
        this._connectionStatusWatch.clear();
      } else if ((RemoteAgentHostConnectionStatus.isDisconnected(status2) || RemoteAgentHostConnectionStatus.isIncompatible(status2)) && !isFirstRun) {
        fallback();
      }
      isFirstRun = false;
    }));
    disposableTimeout(() => {
      if (!RemoteAgentHostConnectionStatus.isConnected(connStatus.get())) {
        fallback();
      }
    }, RESTORE_CONNECT_GRACE_MS, store);
  }
  // -- Recent workspaces (sessions' own history) --
  _getRecentWorkspaces() {
    return this.recentWorkspacesService.getRecentWorkspaces();
  }
  _removeRecentWorkspace(folderUri) {
    this.recentWorkspacesService.removeRecentWorkspace(folderUri);
    if (this._isSelectedFolder(folderUri)) {
      this._hidePicker();
      this._selectedFolderUri = void 0;
      this._selectedResolved = void 0;
      this._updateTriggerLabel();
      this._onDidSelectWorkspace.fire(void 0);
    }
  }
};
WorkspacePicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ISessionsProvidersService),
  __decorateParam(4, ISessionsRecentWorkspacesService),
  __decorateParam(5, IRemoteAgentHostService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IFileDialogService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, INotificationService)
], WorkspacePicker);
export {
  WorkspacePicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25Xb3Jrc3BhY2VQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyB0b3VjaCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0sIElBY3Rpb25MaXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSVRhYkRlc2NyaXB0b3IsIFRhYmJlZEFjdGlvbkxpc3RXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci90YWJiZWRBY3Rpb25MaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUVU5ORUxfQUREUkVTU19QUkVGSVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3R1bm5lbEFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Xb3Jrc3BhY2UsIElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBpc0FnZW50SG9zdFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbldvcmtzcGFjZVBpY2tlckdyb3VwQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnMgLS0gVE9ETzogbW92ZSByZW1vdGUgaG9zdCBvcHRpb25zIG91dCBvZiBwcm92aWRlcnNcbmltcG9ydCB7IGdldFN0YXR1c0hvdmVyLCBnZXRTdGF0dXNMYWJlbCwgcmVtb3ZlUmVtb3RlSG9zdCwgc2hvd1JlbW90ZUhvc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL3JlbW90ZUhvc3RPcHRpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyByZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkIH0gZnJvbSAnLi9uZXdDaGF0UGlja2VyVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBtYXJrT25ib2FyZGluZ1RhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL29uYm9hcmRpbmcvYnJvd3Nlci9zcG90bGlnaHQvb25ib2FyZGluZ1RhcmdldC5qcyc7XG5cblxuY29uc3QgRklMVEVSX1RIUkVTSE9MRCA9IDEwO1xuXG4vKipcbiAqIEZpeGVkIHBpY2tlciB3aWR0aCB3aGVuIHRoZSBjYXRlZ29yaWNhbCB0YWIgYmFyIGlzIHNob3duLiBLZWVwcyB0aGUgdGFiXG4gKiByb3cgYW5kIHRoZSBsaXN0IGFsaWduZWQgYW5kIHByZXZlbnRzIGhvcml6b250YWwgaml0dGVyIHdoZW4gc3dpdGNoaW5nXG4gKiB0YWJzLlxuICovXG5jb25zdCBUQUJCRURfUElDS0VSX1dJRFRIID0gMzYwO1xuXG4vKipcbiAqIEdyYWNlIHBlcmlvZCBmb3IgYSByZXN0b3JlZCByZW1vdGUgd29ya3NwYWNlJ3MgcHJvdmlkZXIgdG8gcmVhY2ggQ29ubmVjdGVkXG4gKiBiZWZvcmUgd2UgZmFsbCBiYWNrIHRvIG5vIHNlbGVjdGlvbi4gU1NIIHR1bm5lbHMgdHlwaWNhbGx5IGNvbm5lY3Qgd2l0aGluXG4gKiBhIGNvdXBsZSBzZWNvbmRzOyBpZiBpdCBoYXNuJ3QgY29ubmVjdGVkIGJ5IHRoZW4sIHdlJ2QgcmF0aGVyIHNob3cgbm9cbiAqIHNlbGVjdGlvbiB0aGFuIGxlYXZlIHRoZSB1c2VyIHN0YXJpbmcgYXQgYW4gdW5yZWFjaGFibGUgd29ya3NwYWNlLlxuICovXG5jb25zdCBSRVNUT1JFX0NPTk5FQ1RfR1JBQ0VfTVMgPSA1MDAwO1xuXG4vKipcbiAqIEEgd29ya3NwYWNlIGFzIHJlc29sdmVkIGZyb20gYSBmb2xkZXIgVVJJIGZvciByZW5kZXJpbmcuIFRoZSBgcHJvdmlkZXJJZGBcbiAqIGlzIHRoZSBwcm92aWRlciB0aGF0IHJlc29sdmVkIHRoZSBVUkkgKGZpcnN0IG1hdGNoIGluIGl0ZXJhdGlvbiBvcmRlcixcbiAqIG9yIHRoZSBwcmVmZXJyZWQgaGludCB3aGVuIGhvbm9yZWQpLiBGb3IgbG9jYWwgVVJJcyB0aGF0IGFueSBsb2NhbFxuICogcHJvdmlkZXIgY2FuIHJlc29sdmUsIHRoaXMgaXMgdGhlIGZpcnN0IHJlZ2lzdGVyZWQgbG9jYWwgcHJvdmlkZXI7IGZvclxuICogcmVtb3RlIFVSSXMgaXQgaXMgdGhlIHJlbW90ZSBwcm92aWRlciBmb3IgdGhhdCBhdXRob3JpdHkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkRm9sZGVyV29ya3NwYWNlIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlO1xufVxuXG4vKipcbiAqIEl0ZW0gdHlwZSB1c2VkIGluIHRoZSBhY3Rpb24gbGlzdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlUGlja2VySXRlbSB7XG5cdHJlYWRvbmx5IGZvbGRlclVyaT86IFVSSTtcblx0LyoqIFRoZSByZXNvbHZlZCB3b3Jrc3BhY2UgKHVzZWQgZm9yIHVuYXZhaWxhYmxlLXByb3ZpZGVyIGNoZWNrcykuICovXG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJyb3dzZUFjdGlvbkluZGV4PzogbnVtYmVyO1xuXHRyZWFkb25seSBjaGVja2VkPzogYm9vbGVhbjtcblx0LyoqIENvbW1hbmQgdG8gZXhlY3V0ZSB3aGVuIHRoaXMgaXRlbSBpcyBzZWxlY3RlZC4gKi9cblx0cmVhZG9ubHkgY29tbWFuZElkPzogc3RyaW5nO1xuXHQvKiogSW5saW5lIGFjdGlvbiB0byBydW4gd2hlbiB0aGlzIGl0ZW0gaXMgc2VsZWN0ZWQuICovXG5cdHJlYWRvbmx5IHJ1bj86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtzcGFjZVBpY2tlck9wdGlvbnMge1xuXHRyZWFkb25seSBjYW5TZWxlY3RXb3Jrc3BhY2U/OiAoZm9sZGVyVXJpOiBVUkksIHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gUHJvbWlzZTxib29sZWFuPjtcbn1cblxuaW50ZXJmYWNlIElCcm93c2VkV29ya3NwYWNlU2VsZWN0aW9uIHtcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZTtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xufVxuXG50eXBlIElXb3Jrc3BhY2VQaWNrZXJBY3Rpb24gPSBJQWN0aW9uICYgeyBpY29uPzogVGhlbWVJY29uOyBob3ZlckNvbnRlbnQ/OiBzdHJpbmc7IG9uUmVtb3ZlPzogKCkgPT4gdm9pZCB9O1xuXG4vKipcbiAqIEEgdW5pZmllZCB3b3Jrc3BhY2UgcGlja2VyIHRoYXQgc2hvd3Mgd29ya3NwYWNlcyBmcm9tIGFsbCByZWdpc3RlcmVkIHNlc3Npb25cbiAqIHByb3ZpZGVycyBpbiBhIHNpbmdsZSBkcm9wZG93bi5cbiAqXG4gKiBCcm93c2UgYWN0aW9ucyBmcm9tIHByb3ZpZGVycyBhcmUgYXBwZW5kZWQgYXQgdGhlIGJvdHRvbSBvZiB0aGUgbGlzdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRTZWxlY3RXb3Jrc3BhY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkkgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNlbGVjdFdvcmtzcGFjZTogRXZlbnQ8VVJJIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmV2ZW50O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX3NlbGVjdGVkRm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NlbGVjdGVkUmVzb2x2ZWQ6IElSZXNvbHZlZEZvbGRlcldvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uR2VuZXJhdGlvbiA9IDA7XG5cblx0LyoqXG5cdCAqIFNldCB0byBgdHJ1ZWAgb25jZSB0aGUgdXNlciBoYXMgZXhwbGljaXRseSBwaWNrZWQgb3IgY2xlYXJlZCBhIHdvcmtzcGFjZS5cblx0ICogVW50aWwgdGhlbiwgbGF0ZS1hcnJpdmluZyBwcm92aWRlciByZWdpc3RyYXRpb25zIGFyZSBhbGxvd2VkIHRvIHVwZ3JhZGVcblx0ICogdGhlIGN1cnJlbnQgKGF1dG8tcmVzdG9yZWQpIHNlbGVjdGlvbiB0byB0aGUgdXNlcidzIHN0b3JlZCBcImNoZWNrZWRcIlxuXHQgKiBlbnRyeS4gQWZ0ZXIgdGhlIHVzZXIgaGFzIGFjdGVkLCBwcm92aWRlcnMgY29taW5nIGFuZCBnb2luZyBuZXZlciBtb3ZlXG5cdCAqIHRoZSBzZWxlY3Rpb24gb3V0IGZyb20gdW5kZXIgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgX3VzZXJIYXNQaWNrZWQgPSBmYWxzZTtcblxuXHQvKipcblx0ICogV2F0Y2hlcyB0aGUgY29ubmVjdGlvbiBzdGF0dXMgb2YgYSByZXN0b3JlZCByZW1vdGUgd29ya3NwYWNlLiBDbGVhcmVkIHdoZW5cblx0ICogdGhlIHVzZXIgZXhwbGljaXRseSBwaWNrcywgd2hlbiB0aGUgY29ubmVjdGlvbiBzdWNjZWVkcywgb3Igd2hlbiBpdCBmYWlsc1xuXHQgKiBhbmQgd2UgZmFsbCBiYWNrLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvblN0YXR1c1dhdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbEJyb3dzZUFjdGlvbjogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24gPSB7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuYnJvd3NlU2VsZWN0TG9jYWwnLCBcIlNlbGVjdC4uLlwiKSxcblx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXJPcGVuZWQsXG5cdFx0cHJvdmlkZXJJZDogJycsXG5cdFx0cnVuOiBhc3luYyAoKSA9PiAoYXdhaXQgdGhpcy5fYnJvd3NlRm9yTG9jYWxGb2xkZXIoKSk/LndvcmtzcGFjZSxcblx0fTtcblxuXHQvKipcblx0ICogXCJQcmltYXJ5XCIgdHJpZ2dlci4gVGhpcyBpcyB0aGUgbW9zdCByZWNlbnRseSBjcmVhdGVkIGVudHJ5LiBQcmVzZXJ2ZWQgZm9yIHN1YmNsYXNzXG5cdCAqIHJlYWQgYWNjZXNzIChlLmcuIHtAbGluayBXZWJXb3Jrc3BhY2VQaWNrZXJ9IGFuY2hvcnMgaXRzIG1vYmlsZSBzaGVldCBoZXJlKSBhbmQgZm9yXG5cdCAqIHtAbGluayBzaG93UGlja2VyfSBjYWxscyB0aGF0IGRvIG5vdCBzdXBwbHkgYW4gYW5jaG9yLlxuXHQgKi9cblx0cHJvdGVjdGVkIF90cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBBbGwgbGl2ZSB0cmlnZ2VyIGVsZW1lbnRzLiBMYWJlbCB1cGRhdGVzIGZhbiBvdXQgdG8gZXZlcnkgZW50cnkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyaWdnZXJFbGVtZW50cyA9IG5ldyBTZXQ8SFRNTEVsZW1lbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFiYmVkV2lkZ2V0OiBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waWNrZXJHcm91cENvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cblx0LyoqXG5cdCAqIEN1cnJlbnRseSBhY3RpdmUgd29ya3NwYWNlIHRhYiAoYSBncm91cCBsYWJlbCBjb250cmlidXRlZCBieSBhXG5cdCAqIHByb3ZpZGVyLCBlLmcuIGBcIkxvY2FsXCJgIC8gYFwiQ2xvdWRcImAgLyBgXCJSZW1vdGVcImApLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWN0aXZlVGFiOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHVzZXIgZXhwbGljaXRseSBjbGlja2VkIGEgdGFiIHdoaWxlIHRoZSBwaWNrZXIgd2FzIG9wZW4uXG5cdCAqIFJlc2V0IG9uIGVhY2ggZnJlc2ggb3BlbiBzbyB0aGUgcGlja2VyIHJlLWRlZmF1bHRzIHRvIHRoZSBzZWxlY3RlZFxuXHQgKiB3b3Jrc3BhY2UncyBncm91cCBiZXR3ZWVuIG9wZW5zLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXNlclBpY2tlZFRhYiA9IGZhbHNlO1xuXG5cdGdldCBzZWxlY3RlZEZvbGRlclVyaSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZEZvbGRlclVyaTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZm9sZGVyIHJlc29sdmVkIHRvIGEgd29ya3NwYWNlIHZpYSB0aGVcblx0ICogZmlyc3QgcHJvdmlkZXIgdGhhdCBjYW4gcmVzb2x2ZSBpdC4gVXNlZCBpbnRlcm5hbGx5IGZvciByZW5kZXJpbmdcblx0ICogKGxhYmVsLCBpY29uLCBncm91cCkuIFRoZSBwcm92aWRlciBhc3NvY2lhdGlvbiBpcyBub3QgcGFydCBvZiB0aGVcblx0ICogcGlja2VyJ3MgcHVibGljIGNvbnRyYWN0IFx1MjAxNCBjYWxsZXJzIHNob3VsZCB1c2Uge0BsaW5rIHNlbGVjdGVkRm9sZGVyVXJpfVxuXHQgKiBhbmQgbGV0IHRoZSBtYW5hZ2VtZW50IHNlcnZpY2UgcmVkaXNjb3ZlciB0aGUgcHJvdmlkZXIuXG5cdCAqL1xuXHRnZXQgc2VsZWN0ZWRSZXNvbHZlZCgpOiBJUmVzb2x2ZWRGb2xkZXJXb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZFJlc29sdmVkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJV29ya3NwYWNlUGlja2VyT3B0aW9ucyxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVjZW50V29ya3NwYWNlc1NlcnZpY2U6IElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdGFiYmVkV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0KSk7XG5cdFx0dGhpcy5fcGlja2VyR3JvdXBDb250ZXh0ID0gU2Vzc2lvbldvcmtzcGFjZVBpY2tlckdyb3VwQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFiYmVkV2lkZ2V0Lm9uRGlkQ2hhbmdlVGFiKHRhYiA9PiB7XG5cdFx0XHR0aGlzLl9hY3RpdmVUYWIgPSB0YWI7XG5cdFx0XHR0aGlzLl91c2VyUGlja2VkVGFiID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3BpY2tlckdyb3VwQ29udGV4dC5zZXQodGFiKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFiYmVkV2lkZ2V0Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9waWNrZXJHcm91cENvbnRleHQucmVzZXQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZXN0b3JlIHNlbGVjdGVkIHdvcmtzcGFjZSBmcm9tIHN0b3JhZ2Vcblx0XHRjb25zdCByZXN0b3JlZCA9IHRoaXMuX3Jlc3RvcmVTZWxlY3RlZFdvcmtzcGFjZSgpO1xuXHRcdHRoaXMuX2FwcGx5U2VsZWN0aW9uKHJlc3RvcmVkKTtcblx0XHRpZiAodGhpcy5fc2VsZWN0ZWRSZXNvbHZlZCkge1xuXHRcdFx0dGhpcy5fd2F0Y2hGb3JDb25uZWN0aW9uRmFpbHVyZSh0aGlzLl9zZWxlY3RlZFJlc29sdmVkKTtcblx0XHR9XG5cblx0XHQvLyBSZWFjdCB0byBwcm92aWRlciByZWdpc3RyYXRpb25zL3JlbW92YWxzOiByZS12YWxpZGF0ZSB0aGUgY3VycmVudFxuXHRcdC8vIHNlbGVjdGlvbiwgYW5kIGlmIHRoZSB1c2VyIGhhc24ndCBleHBsaWNpdGx5IHBpY2tlZCB5ZXQsIHJlLXJlc3RvcmVcblx0XHQvLyBmcm9tIHN0b3JhZ2Ugc28gd2UgdXBncmFkZSBmcm9tIGFueSBmYWxsYmFjayB0byB0aGUgdXNlcidzIGFjdHVhbFxuXHRcdC8vIHN0b3JlZCBzZWxlY3Rpb24gb25jZSBpdHMgcHJvdmlkZXIgYXJyaXZlcy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkpIHtcblx0XHRcdFx0Ly8gUmUtcmVzb2x2ZSBpbiBjYXNlIHRoZSBwcmV2aW91cyByZXNvbHZpbmcgcHJvdmlkZXIgd2FzIHJlbW92ZWQuXG5cdFx0XHRcdGNvbnN0IHJlcmVzb2x2ZWQgPSB0aGlzLl9yZXNvbHZlRm9sZGVyKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpKTtcblx0XHRcdFx0aWYgKCFyZXJlc29sdmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRSZXNvbHZlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uU3RhdHVzV2F0Y2guY2xlYXIoKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSByZXJlc29sdmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX3VzZXJIYXNQaWNrZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVzdG9yZWROb3cgPSB0aGlzLl9yZXN0b3JlU2VsZWN0ZWRXb3Jrc3BhY2UoKTtcblx0XHRcdFx0aWYgKHJlc3RvcmVkTm93ICYmICF0aGlzLl9pc1NlbGVjdGVkRm9sZGVyKHJlc3RvcmVkTm93LndvcmtzcGFjZS5mb2xkZXJzWzBdPy5yb290KSkge1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5U2VsZWN0aW9uKHJlc3RvcmVkTm93KTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSk7XG5cdFx0XHRcdFx0dGhpcy5fd2F0Y2hGb3JDb25uZWN0aW9uRmFpbHVyZShyZXN0b3JlZE5vdyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1hcm0gYXV0by10YWIgd2hlbmV2ZXIgdGhlIHdvcmtzcGFjZSBzZWxlY3Rpb24gY2hhbmdlcyB0byBhIG5ld1xuXHRcdC8vIHZhbHVlLCBidXQgb25seSB3aGlsZSB0aGUgcGlja2VyIGlzIGNsb3NlZC4gVGhpcyB3YXkgcGlja2luZyBhIHRhYlxuXHRcdC8vIGFuZCB0aGVuIGEgd29ya3NwYWNlIHdpdGhpbiB0aGUgc2FtZSBvcGVuIGtlZXBzIHRoYXQgdGFiIGFjdGl2ZSBmb3Jcblx0XHQvLyB0aGUgY3VycmVudCBzZXNzaW9uLCB3aGlsZSB0aGUgbmV4dCBmcmVzaCBvcGVuIGZvbGxvd3MgdGhlIGxhdGVzdFxuXHRcdC8vIHNlbGVjdGlvbidzIGNhdGVnb3J5LiBDbGVhcnMgKGB1bmRlZmluZWRgKSBhcmUgaWdub3JlZCBzbyB0aGVcblx0XHQvLyBwcmV2aW91c2x5LWFjdGl2ZSB0YWIgaXMgcHJlc2VydmVkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRTZWxlY3RXb3Jrc3BhY2Uoc2VsZWN0aW9uID0+IHtcblx0XHRcdGlmIChzZWxlY3Rpb24gJiYgIXRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUgJiYgIXRoaXMuX3RhYmJlZFdpZGdldC5pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fdXNlclBpY2tlZFRhYiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSBwcm9qZWN0IHBpY2tlciB0cmlnZ2VyIGJ1dHRvbiBpbnRvIHRoZSBnaXZlbiBjb250YWluZXIuXG5cdCAqIFJldHVybnMgdGhlIGNvbnRhaW5lciBlbGVtZW50LlxuXHQgKlxuXHQgKiBDYWxsaW5nIGl0IGFnYWluIHJlcGxhY2VzIHRoZSB0cmlnZ2VyIGNyZWF0ZWQgYnkgdGhlIHByZXZpb3VzXG5cdCAqIHtAbGluayByZW5kZXJ9IGNhbGwuXG5cdCAqL1xuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgc2xvdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3Quc2Vzc2lvbnMtY2hhdC13b3Jrc3BhY2UtcGlja2VyJykpO1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHNsb3QucmVtb3ZlKCkgfSk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2FkZFRyaWdnZXIoc2xvdCkpO1xuXG5cdFx0cmV0dXJuIHNsb3Q7XG5cdH1cblxuXHQvKipcblx0ICogU2hhcmVkIHRyaWdnZXItY3JlYXRpb24gY29yZSBmb3Ige0BsaW5rIHJlbmRlcn0uIFdpcmVzIHVwIHRoZSBjbGljayAvXG5cdCAqIGtleWJvYXJkIC8gdG91Y2ggaGFuZGxlcnMgYW5kIHRoZSBwZXItdHJpZ2dlciBsaWZlY3ljbGUuXG5cdCAqL1xuXHRwcml2YXRlIF9hZGRUcmlnZ2VyKHNsb3Q6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHRyaWdnZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0XHR0cmlnZ2VyLnRhYkluZGV4ID0gMDtcblx0XHR0cmlnZ2VyLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICdsaXN0Ym94Jyk7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblxuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50cy5hZGQodHJpZ2dlcik7XG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQgPSB0cmlnZ2VyO1xuXHRcdHRoaXMuX3JlbmRlclRyaWdnZXJMYWJlbCh0cmlnZ2VyKTtcblx0XHQvLyBPbmJvYXJkaW5nIHNwb3RsaWdodCB0YXJnZXQgXHUyMDE0IGlkIGlzIHJlZmVyZW5jZWQgYnkgdGhlIFwibmV3IHNlc3Npb25cIiB0b3VyXG5cdFx0Ly8gaW4gdnMvc2Vzc2lvbnMvY29udHJpYi9vbmJvYXJkaW5nVG91cnMuXG5cdFx0dHJpZ2dlckRpc3Bvc2FibGVzLmFkZChtYXJrT25ib2FyZGluZ1RhcmdldCh0cmlnZ2VyLCAnc2Vzc2lvbnMubmV3U2Vzc2lvbi53b3Jrc3BhY2VQaWNrZXInLCB7XG5cdFx0XHRvcGVuOiAoKSA9PiB0aGlzLnNob3dQaWNrZXIoZmFsc2UsIHRyaWdnZXIpLFxuXHRcdH0pKTtcblxuXHRcdHRyaWdnZXJEaXNwb3NhYmxlcy5hZGQodG91Y2guR2VzdHVyZS5hZGRUYXJnZXQodHJpZ2dlcikpO1xuXHRcdFtkb20uRXZlbnRUeXBlLkNMSUNLLCB0b3VjaC5FdmVudFR5cGUuVGFwXS5mb3JFYWNoKGV2ZW50VHlwZSA9PiB7XG5cdFx0XHR0cmlnZ2VyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZXZlbnRUeXBlLCAoZSkgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zaG93UGlja2VyKGZhbHNlLCB0cmlnZ2VyKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0XHR0cmlnZ2VyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNob3dQaWNrZXIoZmFsc2UsIHRyaWdnZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRyaWdnZXJEaXNwb3NhYmxlcy5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudHMuZGVsZXRlKHRyaWdnZXIpO1xuXHRcdFx0XHRpZiAodGhpcy5fdHJpZ2dlckVsZW1lbnQgPT09IHRyaWdnZXIpIHtcblx0XHRcdFx0XHQvLyBEZW1vdGUgdG8gYW55IG90aGVyIGxpdmUgdHJpZ2dlciBzbyBzdWJjbGFzc2VzIHRoYXQgcmVhZFxuXHRcdFx0XHRcdC8vIGBfdHJpZ2dlckVsZW1lbnRgIChlLmcuIFdlYldvcmtzcGFjZVBpY2tlcidzIG1vYmlsZSBzaGVldFxuXHRcdFx0XHRcdC8vIHBhdGgpIGRvbid0IGRlcmVmZXJlbmNlIGEgcmVtb3ZlZCBub2RlLlxuXHRcdFx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50ID0gdGhpcy5fdHJpZ2dlckVsZW1lbnRzLnZhbHVlcygpLm5leHQoKS52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHJldHVybiB0cmlnZ2VyRGlzcG9zYWJsZXM7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgdGhlIHdvcmtzcGFjZSBwaWNrZXIgZHJvcGRvd24gYW5jaG9yZWQgdG8gYSB0cmlnZ2VyIGVsZW1lbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBmb3JjZSBXaGVuIHRydWUsIHJlLXNob3cgZXZlbiBpZiB0aGUgcGlja2VyIGlzIGFscmVhZHkgdmlzaWJsZS5cblx0ICogICAgICAgICAgICAgIFVzZWQgaW50ZXJuYWxseSB3aGVuIHN3YXBwaW5nIGl0ZW1zIGluIHBsYWNlIGFmdGVyIGEgdGFiXG5cdCAqICAgICAgICAgICAgICBjaGFuZ2UuXG5cdCAqIEBwYXJhbSBhbmNob3IgVGhlIHNwZWNpZmljIHRyaWdnZXIgZWxlbWVudCB0byBhbmNob3IgdGhlIHBvcHVwIHRvLiBXaGVuXG5cdCAqICAgICAgICAgICAgICAgb21pdHRlZCwgZGVmYXVsdHMgdG8gdGhlIG1vc3QtcmVjZW50bHkgcmVuZGVyZWQgdHJpZ2dlci5cblx0ICogICAgICAgICAgICAgICBQYXNzIHRocm91Z2ggd2hlbiBtb3JlIHRoYW4gb25lIHRyaWdnZXIgaXMgbGl2ZSBhbmQgdGhlXG5cdCAqICAgICAgICAgICAgICAgcG9wdXAgc2hvdWxkIGFsaWduIHdpdGggdGhlIG9uZSB0aGUgdXNlciBhY3R1YWxseSBjbGlja2VkLlxuXHQgKi9cblx0c2hvd1BpY2tlcihmb3JjZSA9IGZhbHNlLCBhbmNob3I/OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHRyaWdnZXJFbGVtZW50ID0gYW5jaG9yID8/IHRoaXMuX3RyaWdnZXJFbGVtZW50O1xuXHRcdGlmICghdHJpZ2dlckVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWxyZWFkeVZpc2libGUgPSB0aGlzLmFjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlIHx8IHRoaXMuX3RhYmJlZFdpZGdldC5pc1Zpc2libGU7XG5cdFx0aWYgKCFmb3JjZSAmJiBhbHJlYWR5VmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhYnMgPSB0aGlzLl9zaG93VGFicygpID8gdGhpcy5fZ2V0QXZhaWxhYmxlVGFicygpIDogW107XG5cblx0XHQvLyBEZWZhdWx0IHRoZSBhY3RpdmUgdGFiIHRvIHRoZSBncm91cCBvZiB0aGUgY3VycmVudGx5IHNlbGVjdGVkXG5cdFx0Ly8gd29ya3NwYWNlLiBUaGUgdXNlci1waWNrIGxhdGNoIGlzIHJlc2V0IG9uIGV2ZXJ5IHNlbGVjdGlvbiBjaGFuZ2UsXG5cdFx0Ly8gc28gcGlja2luZyBhIHRhYiBkdXJpbmcgb25lIG9wZW4gb2YgdGhlIHBpY2tlciBkb2Vzbid0IHBlcm1hbmVudGx5XG5cdFx0Ly8gb3ZlcnJpZGUgYXV0by10YWIuXG5cdFx0aWYgKHRhYnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRHcm91cCA9IHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQ/LndvcmtzcGFjZS5ncm91cDtcblx0XHRcdGlmICghdGhpcy5fdXNlclBpY2tlZFRhYiAmJiBzZWxlY3RlZEdyb3VwICYmIHRhYnMuc29tZSh0ID0+IHQuaWQgPT09IHNlbGVjdGVkR3JvdXApKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVRhYiA9IHNlbGVjdGVkR3JvdXA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2FjdGl2ZVRhYiB8fCAhdGFicy5zb21lKHQgPT4gdC5pZCA9PT0gdGhpcy5fYWN0aXZlVGFiKSkge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVUYWIgPSB0YWJzWzBdLmlkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRhYmJlZCA9IHRhYnMubGVuZ3RoID4gMTtcblx0XHRpZiAodGFiYmVkKSB7XG5cdFx0XHR0aGlzLl9zaG93VGFiYmVkUGlja2VyKHRhYnMsIHRyaWdnZXJFbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWN0aXZlVGFiID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc2hvd0ZsYXRQaWNrZXIodHJpZ2dlckVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdWJjbGFzc2VzIG1heSBvcHQgb3V0IG9mIHRoZSBjYXRlZ29yaWNhbCB0YWIgYmFyIChlLmcuIHdoZW4gc2NvcGVkIHRvXG5cdCAqIGEgc2luZ2xlIGhvc3QpLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG93VGFicygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0QXZhaWxhYmxlVGFicygpOiBJVGFiRGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCBieUxhYmVsID0gbmV3IE1hcDxzdHJpbmcsIElUYWJEZXNjcmlwdG9yPigpO1xuXHRcdGNvbnN0IHJlbW90ZUFnZW50SG9zdHNFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCk7XG5cdFx0aWYgKHJlbW90ZUFnZW50SG9zdHNFbmFibGVkKSB7XG5cdFx0XHRieUxhYmVsLnNldChTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUsIHtcblx0XHRcdFx0aWQ6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5iZWFrZXIsXG5cdFx0XHRcdHRvb2x0aXA6IGAke1NFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URX0gKCR7bG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5leHBlcmltZW50YWwnLCBcIkV4cGVyaW1lbnRhbFwiKX0pYCxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpKSB7XG5cdFx0XHRpZiAocHJvdmlkZXIuc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXMgJiYgIWJ5TGFiZWwuaGFzKFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMKSkge1xuXHRcdFx0XHRieUxhYmVsLnNldChTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCwgeyBpZDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwgfSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBwcm92aWRlci5icm93c2VBY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChhY3Rpb24uZ3JvdXAgPT09IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSAmJiAhcmVtb3RlQWdlbnRIb3N0c0VuYWJsZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uLmdyb3VwICYmICFieUxhYmVsLmhhcyhhY3Rpb24uZ3JvdXApKSB7XG5cdFx0XHRcdFx0YnlMYWJlbC5zZXQoYWN0aW9uLmdyb3VwLCB7IGlkOiBhY3Rpb24uZ3JvdXAgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIEFycmF5LmZyb20oYnlMYWJlbC52YWx1ZXMoKSkuc29ydCgoYSwgYikgPT5cblx0XHRcdGEuaWQgPT09IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMID8gLTFcblx0XHRcdFx0OiBiLmlkID09PSBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCA/IDFcblx0XHRcdFx0XHQ6IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBzaGFyZWQgYElBY3Rpb25MaXN0RGVsZWdhdGVgIHVzZWQgYnkgYm90aCB0aGUgZmxhdCBhbmRcblx0ICogdGFiYmVkIHByZXNlbnRhdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZERlbGVnYXRlKHRyaWdnZXJFbGVtZW50OiBIVE1MRWxlbWVudCwgaGlkZTogKCkgPT4gdm9pZCk6IElBY3Rpb25MaXN0RGVsZWdhdGU8SVdvcmtzcGFjZVBpY2tlckl0ZW0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25TZWxlY3Q6IChpdGVtKSA9PiB7XG5cdFx0XHRcdGhpZGUoKTtcblx0XHRcdFx0dm9pZCB0aGlzLl9kaXNwYXRjaFBpY2tlckl0ZW0oaXRlbSk7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHRyaWdnZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0XHR0cmlnZ2VyRWxlbWVudC5mb2N1cygpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRMaXN0T3B0aW9ucyhpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElXb3Jrc3BhY2VQaWNrZXJJdGVtPltdLCBwaWNrZXJXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkKTogSUFjdGlvbkxpc3RPcHRpb25zIHtcblx0XHRjb25zdCBzaG93RmlsdGVyID0gaXRlbXMuZmlsdGVyKGkgPT4gaS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uKS5sZW5ndGggPiBGSUxURVJfVEhSRVNIT0xEO1xuXHRcdHJldHVybiBzaG93RmlsdGVyXG5cdFx0XHQ/IHsgc2hvd0ZpbHRlcjogdHJ1ZSwgZmlsdGVyUGxhY2Vob2xkZXI6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuZmlsdGVyJywgXCJTZWFyY2ggV29ya3NwYWNlcy4uLlwiKSwgcmVzZXJ2ZVN1Ym1lbnVTcGFjZTogZmFsc2UsIGlubGluZURlc2NyaXB0aW9uOiB0cnVlLCBzaG93R3JvdXBUaXRsZU9uRmlyc3RJdGVtOiB0cnVlLCBtaW5XaWR0aDogcGlja2VyV2lkdGgsIG1heFdpZHRoOiBwaWNrZXJXaWR0aCwgaGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcDogdHJ1ZSB9XG5cdFx0XHQ6IHsgcmVzZXJ2ZVN1Ym1lbnVTcGFjZTogZmFsc2UsIGlubGluZURlc2NyaXB0aW9uOiB0cnVlLCBzaG93R3JvdXBUaXRsZU9uRmlyc3RJdGVtOiB0cnVlLCBtaW5XaWR0aDogcGlja2VyV2lkdGgsIG1heFdpZHRoOiBwaWNrZXJXaWR0aCwgaGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcDogdHJ1ZSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEZsYXQgKG5vLXRhYnMpIHByZXNlbnRhdGlvbi4gRGVsZWdhdGVzIHJlbmRlcmluZyB0byB0aGUgc2hhcmVkXG5cdCAqIGBJQWN0aW9uV2lkZ2V0U2VydmljZWAgc28gd2UgYmVuZWZpdCBmcm9tIGl0cyBrZXliaW5kaW5ncywgZm9jdXNcblx0ICogdHJhY2tpbmcgYW5kIHN1Ym1lbnUgY2hyb21lLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2hvd0ZsYXRQaWNrZXIodHJpZ2dlckVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gVGVhciBkb3duIGFueSBwcmV2aW91cyB0YWJiZWQgcG9wdXAgYmVmb3JlIGRlbGVnYXRpbmcgdG8gdGhlXG5cdFx0Ly8gc2hhcmVkIHNlcnZpY2UgXHUyMDE0IHRoZSB0d28gcHJlc2VudGF0aW9ucyBkb24ndCBjby1leGlzdC5cblx0XHR0aGlzLl90YWJiZWRXaWRnZXQuaGlkZSgpO1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fYnVpbGRJdGVtcygpO1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gdGhpcy5fYnVpbGREZWxlZ2F0ZSh0cmlnZ2VyRWxlbWVudCwgKCkgPT4gdGhpcy5faGlkZVBpY2tlcigpKTtcblx0XHR0cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXG5cdFx0dGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3c8SVdvcmtzcGFjZVBpY2tlckl0ZW0+KFxuXHRcdFx0J3dvcmtzcGFjZVBpY2tlcicsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGl0ZW1zLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHR0cmlnZ2VyRWxlbWVudCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFtdLFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtKSA9PiBpdGVtLmxhYmVsID8/ICcnLFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuYXJpYUxhYmVsJywgXCJXb3Jrc3BhY2UgUGlja2VyXCIpLFxuXHRcdFx0fSxcblx0XHRcdHRoaXMuX2J1aWxkTGlzdE9wdGlvbnMoaXRlbXMsIHVuZGVmaW5lZCksXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUYWJiZWQgcHJlc2VudGF0aW9uLiBEZWxlZ2F0ZXMgcmVuZGVyaW5nIGFuZCBsaWZlY3ljbGUgdG8gdGhlXG5cdCAqIHBsYXRmb3JtIGBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0YDsgdGhpcyBwaWNrZXIgb25seSBvd25zIHRoZSBkYXRhXG5cdCAqIGFuZCBzZWxlY3Rpb24gbG9naWMuXG5cdCAqL1xuXHRwcml2YXRlIF9zaG93VGFiYmVkUGlja2VyKHRhYnM6IHJlYWRvbmx5IElUYWJEZXNjcmlwdG9yW10sIHRyaWdnZXJFbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIEhpZGUgdGhlIGZsYXQgcGlja2VyIGlmIGl0J3MgdmlzaWJsZSBcdTIwMTQgdGhlIHR3byBwcmVzZW50YXRpb25zXG5cdFx0Ly8gZG9uJ3QgY28tZXhpc3QuXG5cdFx0aWYgKHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSB0aGlzLl9idWlsZERlbGVnYXRlKHRyaWdnZXJFbGVtZW50LCAoKSA9PiB0aGlzLl9oaWRlUGlja2VyKCkpO1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlQcm92aWRlciA9IHtcblx0XHRcdGdldEFyaWFMYWJlbDogKGl0ZW06IElBY3Rpb25MaXN0SXRlbTxJV29ya3NwYWNlUGlja2VySXRlbT4pID0+IGl0ZW0ubGFiZWwgPz8gJycsXG5cdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuYXJpYUxhYmVsJywgXCJXb3Jrc3BhY2UgUGlja2VyXCIpLFxuXHRcdH07XG5cblx0XHR0cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdHRoaXMuX3BpY2tlckdyb3VwQ29udGV4dC5zZXQodGhpcy5fYWN0aXZlVGFiID8/IHRhYnNbMF0uaWQpO1xuXHRcdHRoaXMuX3RhYmJlZFdpZGdldC5zaG93PElXb3Jrc3BhY2VQaWNrZXJJdGVtPih7XG5cdFx0XHR1c2VyOiAnd29ya3NwYWNlUGlja2VyJyxcblx0XHRcdGFuY2hvcjogdHJpZ2dlckVsZW1lbnQsXG5cdFx0XHR0YWJzLFxuXHRcdFx0aW5pdGlhbFRhYjogdGhpcy5fYWN0aXZlVGFiID8/IHRhYnNbMF0uaWQsXG5cdFx0XHRjcmVhdGVBY3Rpb25MaXN0OiAodGFiKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVRhYiA9IHRhYjtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9idWlsZEl0ZW1zKCk7XG5cdFx0XHRcdHJldHVybiB7IGl0ZW1zLCBsaXN0T3B0aW9uczogeyBpbmxpbmVEZXNjcmlwdGlvbjogdHJ1ZSwgc2hvd0dyb3VwVGl0bGVPbkZpcnN0SXRlbTogdHJ1ZSwgaGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcDogdHJ1ZSB9IH07XG5cdFx0XHR9LFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHR3aWR0aDogVEFCQkVEX1BJQ0tFUl9XSURUSCxcblx0XHRcdHRhYkJhckNsYXNzTmFtZTogJ3Nlc3Npb25zLXdvcmtzcGFjZS1waWNrZXItdGFiYmFyJyxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwYXRjaCBsb2dpYyBmb3IgYSBwaWNrZXIgaXRlbSBvbmNlIHRoZSB1c2VyIHBpY2tzIGl0LiBTaGFyZWRcblx0ICogYmV0d2VlbiB0aGUgZGVza3RvcCBhY3Rpb24td2lkZ2V0IGRlbGVnYXRlIGFuZCBhbnkgbW9iaWxlIHNoZWV0XG5cdCAqIHN1YmNsYXNzIHRoYXQgb3B0cyB0byByZW5kZXIgYSBkaWZmZXJlbnQgVUkgYnV0IHJldXNlIHRoZVxuXHQgKiBzZWxlY3Rpb24gc2VtYW50aWNzLiBUcmVhdHMgdW5hdmFpbGFibGUgd29ya3NwYWNlcyBhcyBhIG5vLW9wLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFzeW5jIF9kaXNwYXRjaFBpY2tlckl0ZW0oaXRlbTogSVdvcmtzcGFjZVBpY2tlckl0ZW0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gKyt0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uO1xuXHRcdHRoaXMuX3JlcG9ydFBpY2tlckNsb3NlZChpdGVtKTtcblx0XHRpZiAoaXRlbS5ydW4pIHtcblx0XHRcdGl0ZW0ucnVuKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGl0ZW0uY29tbWFuZElkKSB7XG5cdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoaXRlbS5jb21tYW5kSWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIGlmIChpdGVtLmZvbGRlclVyaSAmJiBpdGVtLnByb3ZpZGVySWQgJiYgdGhpcy5faXNQcm92aWRlclVuYXZhaWxhYmxlKGl0ZW0ucHJvdmlkZXJJZCkpIHtcblx0XHRcdC8vIFdvcmtzcGFjZSBiZWxvbmdzIHRvIGFuIHVuYXZhaWxhYmxlIHJlbW90ZSBcdTIwMTQgaWdub3JlIHNlbGVjdGlvblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoaXRlbS5icm93c2VBY3Rpb25JbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCB0aGlzLl9leGVjdXRlQnJvd3NlQWN0aW9uKGl0ZW0uYnJvd3NlQWN0aW9uSW5kZXgpO1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gc2VsZWN0aW9uPy53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0XHRcdGlmICghZm9sZGVyVXJpIHx8IGdlbmVyYXRpb24gIT09IHRoaXMuX3NlbGVjdGlvbkdlbmVyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9jYW5TZWxlY3RXb3Jrc3BhY2UoZm9sZGVyVXJpLCBzZWxlY3Rpb24ucHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX3NlbGVjdGlvbkdlbmVyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2VsZWN0Rm9sZGVyKGZvbGRlclVyaSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGl0ZW0uZm9sZGVyVXJpKSB7XG5cdFx0XHRpZiAoaXRlbS5wcm92aWRlcklkICYmICFhd2FpdCB0aGlzLl9jb25uZWN0UHJvdmlkZXJPbkRlbWFuZChpdGVtLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fY2FuU2VsZWN0V29ya3NwYWNlKGl0ZW0uZm9sZGVyVXJpLCBpdGVtLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlbGVjdEZvbGRlcihpdGVtLmZvbGRlclVyaSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXRzIGBuZXdDaGF0UGlja2VyQ2xvc2VkYCB0ZWxlbWV0cnkgb24gdXNlciBzZWxlY3Rpb24uIFRoZVxuXHQgKiBcImJlZm9yZVwiIHZhbHVlIGlzIHJlYWQgZnJvbSBzdG9yYWdlICh0aGUgY3VycmVudGx5LWNoZWNrZWQgcmVjZW50XG5cdCAqIHdvcmtzcGFjZSkgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgZnJvbSB0aGUgaW4tbWVtb3J5IHNlbGVjdGlvbi5cblx0ICogVGhlIFwiYWZ0ZXJcIiB2YWx1ZSBjb21lcyBmcm9tIHRoZSBpdGVtIHRoZSB1c2VyIHBpY2tlZCBcdTIwMTQgdW5kZWZpbmVkXG5cdCAqIHdoZW4gdGhlIGl0ZW0gaXMgYSBicm93c2UgYWN0aW9uIG9yIGNvbW1hbmQgcmF0aGVyIHRoYW4gYSB3b3Jrc3BhY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXBvcnRQaWNrZXJDbG9zZWQoaXRlbTogSVdvcmtzcGFjZVBpY2tlckl0ZW0pOiB2b2lkIHtcblx0XHRjb25zdCBiZWZvcmVGcm9tU3RvcmFnZSA9IHRoaXMuX3Jlc3RvcmVDaGVja2VkV29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgYmVmb3JlID0gYmVmb3JlRnJvbVN0b3JhZ2UgPz8gdGhpcy5fc2VsZWN0ZWRSZXNvbHZlZDtcblx0XHRjb25zdCBhZnRlclVyaSA9IGl0ZW0uZm9sZGVyVXJpO1xuXHRcdGNvbnN0IGFmdGVyUmVzb2x2ZWQgPSBhZnRlclVyaSA/IHRoaXMuX3Jlc29sdmVGb2xkZXIoYWZ0ZXJVcmkpIDogdW5kZWZpbmVkO1xuXHRcdHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ05ld0NoYXRXb3Jrc3BhY2VQaWNrZXInLFxuXHRcdFx0bmFtZTogJ05ld0NoYXRXb3Jrc3BhY2VQaWNrZXInLFxuXHRcdFx0b3B0aW9uSWRCZWZvcmU6IGJlZm9yZT8ud29ya3NwYWNlPy51cmkudG9TdHJpbmcoKSxcblx0XHRcdG9wdGlvbklkQWZ0ZXI6IGFmdGVyUmVzb2x2ZWQ/LndvcmtzcGFjZT8udXJpLnRvU3RyaW5nKCksXG5cdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogYmVmb3JlPy53b3Jrc3BhY2U/LmxhYmVsLFxuXHRcdFx0b3B0aW9uTGFiZWxBZnRlcjogYWZ0ZXJSZXNvbHZlZD8ud29ya3NwYWNlPy5sYWJlbCxcblx0XHRcdGlzUElJOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2dyYW1tYXRpY2FsbHkgc2V0IHRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UgYnkgZm9sZGVyIFVSSS5cblx0ICogQHBhcmFtIGZvbGRlclVyaSBUaGUgZm9sZGVyIFVSSSB0byBzZWxlY3QuXG5cdCAqIEBwYXJhbSBvcHRpb25zLmZpcmVFdmVudCBXaGV0aGVyIHRvIGZpcmUgdGhlIG9uRGlkU2VsZWN0V29ya3NwYWNlIGV2ZW50LiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKiBAcGFyYW0gb3B0aW9ucy5wcm92aWRlcklkIE9wdGlvbmFsIHByb3ZpZGVySWQgaGludCB0aGF0IHdpbnMgb3ZlciBhbnkgaGlzdG9yaWNhbFxuXHQgKiAgICAgICAgcmVjZW50IGVudHJ5J3MgcHJvdmlkZXIuIFVzZSB3aGVuIHRoZSBjYWxsZXIga25vd3Mgd2hpY2ggcHJvdmlkZXIgc2hvdWxkXG5cdCAqICAgICAgICBvd24gdGhlIHJlc3VsdGluZyBzZXNzaW9uIChlLmcuIFwiTmV3IFNlc3Npb25cIiBpbnZva2VkIGZyb20gYSB3b3Jrc3BhY2Vcblx0ICogICAgICAgIHNlY3Rpb24gaW4gdGhlIHNlc3Npb25zIGxpc3QsIHdoZXJlIHRoZSBleGlzdGluZyBzZXNzaW9ucyBmb3IgdGhlXG5cdCAqICAgICAgICB3b3Jrc3BhY2Ugd2VyZSBjcmVhdGVkIGJ5IGEgc3BlY2lmaWMgcHJvdmlkZXIpLlxuXHQgKiBAcGFyYW0gb3B0aW9ucy5wZXJzaXN0IFdoZXRoZXIgdG8gcGVyc2lzdCB0aGUgc2VsZWN0aW9uIGFzIGEgcmVjZW50IHdvcmtzcGFjZS4gRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNldFNlbGVjdGVkV29ya3NwYWNlKGZvbGRlclVyaTogVVJJLCBvcHRpb25zPzogeyBmaXJlRXZlbnQ/OiBib29sZWFuOyBwcm92aWRlcklkPzogc3RyaW5nOyBwZXJzaXN0PzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0Rm9sZGVyKGZvbGRlclVyaSwgb3B0aW9ucz8uZmlyZUV2ZW50ID8/IHRydWUsIG9wdGlvbnM/LnByb3ZpZGVySWQsIG9wdGlvbnM/LnBlcnNpc3QgPz8gdHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZXMgd2hpY2hldmVyIHBvcHVwIHZhcmlhbnQgaXMgY3VycmVudGx5IHZpc2libGUgXHUyMDE0IHRoZSBzaGFyZWRcblx0ICogYWN0aW9uLXdpZGdldC1zZXJ2aWNlIGZsYXQgcGlja2VyIG9yIG91ciBvd24gY29udGV4dC12aWV3LWRyaXZlblxuXHQgKiB0YWJiZWQgcGlja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGlkZVBpY2tlcigpOiB2b2lkIHtcblx0XHR0aGlzLl90YWJiZWRXaWRnZXQuaGlkZSgpO1xuXHRcdGlmICh0aGlzLmFjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmFjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhcnMgdGhlIHNlbGVjdGVkIHByb2plY3QuXG5cdCAqL1xuXHRjbGVhclNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5faGlkZVBpY2tlcigpO1xuXHRcdHRoaXMuX3VzZXJIYXNQaWNrZWQgPSB0cnVlO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25TdGF0dXNXYXRjaC5jbGVhcigpO1xuXHRcdHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX3Nob3VsZFBlcnNpc3RTZWxlY3Rpb24oKSkge1xuXHRcdFx0dGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5jbGVhckNoZWNrZWRXb3Jrc3BhY2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyB0aGUgc2VsZWN0aW9uIGlmIGl0IG1hdGNoZXMgdGhlIGdpdmVuIFVSSS5cblx0ICovXG5cdHJlbW92ZUZyb21SZWNlbnRzKHVyaTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpLCB1cmkpKSB7XG5cdFx0XHR0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0Rm9sZGVyKGZvbGRlclVyaTogVVJJLCBmaXJlRXZlbnQgPSB0cnVlLCBwcm92aWRlcklkSGludD86IHN0cmluZywgcGVyc2lzdCA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fdXNlckhhc1BpY2tlZCA9IHRydWU7XG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXR1c1dhdGNoLmNsZWFyKCk7XG5cdFx0Ly8gUHJlZmVyIHRoZSBjYWxsZXItc3VwcGxpZWQgcHJvdmlkZXJJZCBoaW50LCB0aGVuIHRoZSBoaXN0b3JpY2FsXG5cdFx0Ly8gcHJvdmlkZXJJZCBzdG9yZWQgaW4gdGhlIHJlY2VudHMgZm9yIHRoaXMgVVJJLCBzbyByZS1waWNraW5nIGFcblx0XHQvLyBMb2NhbCBBZ2VudCBIb3N0IGZvbGRlciByZXN0b3JlcyB0aGUgTG9jYWwgQWdlbnQgSG9zdCBhc3NvY2lhdGlvblxuXHRcdC8vIGV2ZW4gd2hlbiBhbm90aGVyIHByb3ZpZGVyIGFsc28gcmVzb2x2ZXMgdGhlIFVSSS5cblx0XHRjb25zdCBzdG9yZWRQcm92aWRlcklkID0gdGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRXb3Jrc3BhY2VzKClcblx0XHRcdC5maW5kKHIgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoci53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdCwgZm9sZGVyVXJpKSlcblx0XHRcdD8ucHJvdmlkZXJJZDtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVGb2xkZXIoZm9sZGVyVXJpLCBwcm92aWRlcklkSGludCA/PyBzdG9yZWRQcm92aWRlcklkKTtcblx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IGZvbGRlclVyaTtcblx0XHR0aGlzLl9zZWxlY3RlZFJlc29sdmVkID0gcmVzb2x2ZWQ7XG5cdFx0aWYgKHBlcnNpc3QgJiYgdGhpcy5fc2hvdWxkUGVyc2lzdFNlbGVjdGlvbigpKSB7XG5cdFx0XHR0aGlzLnJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmFkZFJlY2VudFdvcmtzcGFjZShmb2xkZXJVcmksIHJlc29sdmVkPy5wcm92aWRlcklkLCB0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSgpO1xuXHRcdGlmIChmaXJlRXZlbnQpIHtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUoZm9sZGVyVXJpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Nob3VsZFBlcnNpc3RTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgYSByZXN0b3JlZCBzZWxlY3Rpb24gd2l0aG91dCBmaXJpbmcgZXZlbnRzIG9yIHBlcnNpc3RpbmcuIFVzZWRcblx0ICogZHVyaW5nIGNvbnN0cnVjdGlvbiBhbmQgYWZ0ZXIgcHJvdmlkZXIgbGlzdCBjaGFuZ2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlTZWxlY3Rpb24ocmVzb2x2ZWQ6IElSZXNvbHZlZEZvbGRlcldvcmtzcGFjZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSByZXNvbHZlZDtcblx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IHJlc29sdmVkPy53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBJdGVyYXRlIHByb3ZpZGVycyBhbmQgcmV0dXJuIHRoZSBmaXJzdCByZXNvbHV0aW9uIG9mIHRoZSBmb2xkZXIgVVJJLlxuXHQgKiBXaGVuIGBwcmVmZXJyZWRQcm92aWRlcklkYCBpcyBnaXZlbiwgdGhhdCBwcm92aWRlciBpcyB0cmllZCBmaXJzdCBzbyBhXG5cdCAqIHVzZXIncyBoaXN0b3JpY2FsIHBpY2sgc3Vydml2ZXMgcHJvdmlkZXIgaXRlcmF0aW9uIG9yZGVyIGNoYW5nZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlRm9sZGVyKGZvbGRlclVyaTogVVJJLCBwcmVmZXJyZWRQcm92aWRlcklkPzogc3RyaW5nKTogSVJlc29sdmVkRm9sZGVyV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocHJlZmVycmVkUHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIocHJlZmVycmVkUHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcmVmZXJyZWQ/LnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJJZDogcHJlZmVycmVkUHJvdmlkZXJJZCwgd29ya3NwYWNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIHdvcmtzcGFjZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4ZWN1dGVzIGEgYnJvd3NlIGFjdGlvbiBmcm9tIGEgcHJvdmlkZXIsIGlkZW50aWZpZWQgYnkgaW5kZXguXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlQnJvd3NlQWN0aW9uKGFjdGlvbkluZGV4OiBudW1iZXIpOiBQcm9taXNlPElCcm93c2VkV29ya3NwYWNlU2VsZWN0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWxsQWN0aW9ucyA9IHRoaXMuX2dldEFsbEJyb3dzZUFjdGlvbnMoKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhbGxBY3Rpb25zW2FjdGlvbkluZGV4XTtcblx0XHRpZiAoIWFjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKGFjdGlvbiA9PT0gdGhpcy5fbG9jYWxCcm93c2VBY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2Jyb3dzZUZvckxvY2FsRm9sZGVyKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBhY3Rpb24ucnVuKCk7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlID8geyB3b3Jrc3BhY2UsIHByb3ZpZGVySWQ6IGFjdGlvbi5wcm92aWRlcklkIH0gOiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBicm93c2UgYWN0aW9uIHdhcyBjYW5jZWxsZWQgb3IgZmFpbGVkXG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYW5TZWxlY3RXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkksIHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiAhdGhpcy5vcHRpb25zLmNhblNlbGVjdFdvcmtzcGFjZVxuXHRcdFx0fHwgYXdhaXQgdGhpcy5vcHRpb25zLmNhblNlbGVjdFdvcmtzcGFjZShmb2xkZXJVcmksIHByb3ZpZGVySWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbGxlY3RzIGJyb3dzZSBhY3Rpb25zIGZyb20gYWxsIHJlZ2lzdGVyZWQgcHJvdmlkZXJzLCBzY29wZWQgdG8gdGhlXG5cdCAqIGN1cnJlbnRseSBhY3RpdmUgdGFiIHdoZW4gdGFicyBhcmUgc2hvd24uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2dldEFsbEJyb3dzZUFjdGlvbnMoKTogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWxsID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkuZmxhdE1hcChwID0+IHAuYnJvd3NlQWN0aW9ucyk7XG5cdFx0Y29uc3QgaGFzTG9jYWxTdXBwb3J0ID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkuc29tZShwID0+IHAuc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXMpO1xuXHRcdGlmIChoYXNMb2NhbFN1cHBvcnQpIHtcblx0XHRcdGFsbC51bnNoaWZ0KHRoaXMuX2xvY2FsQnJvd3NlQWN0aW9uKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9pc1RhYkZpbHRlcmVkKCkpIHtcblx0XHRcdHJldHVybiBhbGw7XG5cdFx0fVxuXHRcdHJldHVybiBhbGwuZmlsdGVyKGEgPT4gYS5ncm91cCA9PT0gdGhpcy5fYWN0aXZlVGFiKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVucyBhIGZvbGRlciBwaWNrZXIgZGlhbG9nIGFuZCByZXR1cm5zIHRoZSBjaG9zZW4gVVJJLiBUaGUgZm9sZGVyJ3Ncblx0ICogcHJvdmlkZXIgaXMgcmVkaXNjb3ZlcmVkIGxhdGVyIGJ5IHRoZSBtYW5hZ2VtZW50IHNlcnZpY2Ugd2hlbiB0aGVcblx0ICogc2Vzc2lvbiBpcyBjcmVhdGVkIFx1MjAxNCBubyBwcm92aWRlciBxdWljay1waWNrIGlzIG5lZWRlZCBoZXJlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYnJvd3NlRm9yTG9jYWxGb2xkZXIoKTogUHJvbWlzZTxJQnJvd3NlZFdvcmtzcGFjZVNlbGVjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXJzID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkuZmlsdGVyKHAgPT4gcC5zdXBwb3J0c0xvY2FsV29ya3NwYWNlcyk7XG5cdFx0aWYgKGxvY2FsUHJvdmlkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRjYW5TZWxlY3RGaWxlczogZmFsc2UsXG5cdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHR9KTtcblx0XHRpZiAoIXJlc3VsdD8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhyb3VnaCBhbnkgbG9jYWwgcHJvdmlkZXIgc28gdGhlIHJldHVybmVkIElTZXNzaW9uV29ya3NwYWNlXG5cdFx0Ly8gY2FycmllcyBhIGxhYmVsL2ljb24gZm9yIHRoZSBicm93c2UtYWN0aW9uIGhhbmRzaGFrZTsgdGhlIGFjdHVhbFxuXHRcdC8vIHByb3ZpZGVyIHVzZWQgdG8gY3JlYXRlIHRoZSBzZXNzaW9uIGlzIHJlZGlzY292ZXJlZCBhdCBjcmVhdGlvbiB0aW1lLlxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgbG9jYWxQcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UocmVzdWx0WzBdKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgd29ya3NwYWNlLCBwcm92aWRlcklkOiBwcm92aWRlci5pZCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFRydWUgd2hlbiB0aGUgcGlja2VyIGlzIGN1cnJlbnRseSBzY29wZWQgdG8gYSBzaW5nbGUgdGFiLiAqL1xuXHRwcm90ZWN0ZWQgX2lzVGFiRmlsdGVyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3dUYWJzKCkgJiYgISF0aGlzLl9hY3RpdmVUYWIgJiYgdGhpcy5fZ2V0QXZhaWxhYmxlVGFicygpLmxlbmd0aCA+IDE7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBwaWNrZXIgaXRlbXMgbGlzdCBmcm9tIHJlY2VudCB3b3Jrc3BhY2VzLlxuXHQgKlxuXHQgKiBJdGVtcyBhcmUgc2hvd24gaW4gYSBmbGF0IHJlY2VuY3ktc29ydGVkIGxpc3QgKG1vc3QgcmVjZW50bHkgdXNlZCBmaXJzdClcblx0ICogd2l0aG91dCBzb3VyY2UgZ3JvdXBpbmcuIE93biByZWNlbnRzIGNvbWUgZmlyc3QsIGZvbGxvd2VkIGJ5IFZTIENvZGVcblx0ICogcmVjZW50IGZvbGRlcnMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2J1aWxkSXRlbXMoKTogSUFjdGlvbkxpc3RJdGVtPElXb3Jrc3BhY2VQaWNrZXJJdGVtPltdIHtcblx0XHRjb25zdCBpdGVtczogSUFjdGlvbkxpc3RJdGVtPElXb3Jrc3BhY2VQaWNrZXJJdGVtPltdID0gW107XG5cblx0XHQvLyBDb2xsZWN0IHJlY2VudCB3b3Jrc3BhY2VzIGZyb20gcGlja2VyIHN0b3JhZ2UgYWNyb3NzIGFsbCBwcm92aWRlcnNcblx0XHRjb25zdCBhbGxQcm92aWRlcnMgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKTtcblx0XHRjb25zdCBwcm92aWRlcklkcyA9IG5ldyBTZXQoYWxsUHJvdmlkZXJzLm1hcChwID0+IHAuaWQpKTtcblx0XHRjb25zdCB0YWJGaWx0ZXIgPSB0aGlzLl9pc1RhYkZpbHRlcmVkKClcblx0XHRcdD8gKHc6IElSZXNvbHZlZEZvbGRlcldvcmtzcGFjZSkgPT4gdy53b3Jrc3BhY2UuZ3JvdXAgPT09IHRoaXMuX2FjdGl2ZVRhYlxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Ly8gT3duIHJlY2VudHMgZmlyc3QsIHRoZW4gVlMgQ29kZSByZWNlbnRzIChtZXJnZWQgYW5kIGRlZHVwbGljYXRlZCBieSB0aGUgc2VydmljZSlcblx0XHRjb25zdCByZWNlbnRXb3Jrc3BhY2VzID0gdGhpcy5fZ2V0UmVjZW50V29ya3NwYWNlcygpXG5cdFx0XHQuZmlsdGVyKHcgPT4gcHJvdmlkZXJJZHMuaGFzKHcucHJvdmlkZXJJZCkpXG5cdFx0XHQuZmlsdGVyKHcgPT4gIXRhYkZpbHRlciB8fCB0YWJGaWx0ZXIodykpO1xuXG5cdFx0Ly8gQnVpbGQgZmxhdCBsaXN0IGluIHJlY2VuY3kgb3JkZXIgKG5vIHNvdXJjZSBncm91cGluZylcblx0XHRmb3IgKGNvbnN0IHsgd29ya3NwYWNlLCBwcm92aWRlcklkIH0gb2YgcmVjZW50V29ya3NwYWNlcykge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gd29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0XHRpZiAoIWZvbGRlclVyaSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5faXNTZWxlY3RlZEZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiB3b3Jrc3BhY2UubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB3b3Jrc3BhY2UuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogd29ya3NwYWNlLmljb24gfSxcblx0XHRcdFx0ZGlzYWJsZWQ6IHRoaXMuX2lzUHJvdmlkZXJVbmF2YWlsYWJsZShwcm92aWRlcklkKSxcblx0XHRcdFx0aXRlbTogeyBmb2xkZXJVcmksIHByb3ZpZGVySWQsIGNoZWNrZWQ6IHNlbGVjdGVkIHx8IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRvblJlbW92ZTogKCkgPT4gdGhpcy5fcmVtb3ZlUmVjZW50V29ya3NwYWNlKGZvbGRlclVyaSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBCcm93c2UgYWN0aW9ucyBmcm9tIGFsbCBwcm92aWRlcnMgKGZpbHRlcmVkIHRvIHRoZSBhY3RpdmUgdGFiKVxuXHRcdGNvbnN0IGFsbEJyb3dzZUFjdGlvbnMgPSB0aGlzLl9nZXRBbGxCcm93c2VBY3Rpb25zKCk7XG5cdFx0Ly8gUmVtb3RlIHByb3ZpZGVycyB3aXRoIGNvbm5lY3Rpb24gc3RhdHVzIFx1MjAxNCBzaG93biBhcyBkeW5hbWljIHJvd3Ncblx0XHQvLyBpbiB0aGUgTWFuYWdlIHN1Ym1lbnUgb24gdGhlIFJlbW90ZSB0YWIuXG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXJzID0gYWxsUHJvdmlkZXJzLmZpbHRlcihpc0FnZW50SG9zdFByb3ZpZGVyKS5maWx0ZXIocCA9PiBwLmNvbm5lY3Rpb25TdGF0dXMgIT09IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaW5jbHVkZVJlbW90ZVByb3ZpZGVycyA9IHRoaXMuX2FjdGl2ZVRhYiA9PT0gU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFO1xuXG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDAgJiYgKGFsbEJyb3dzZUFjdGlvbnMubGVuZ3RoID4gMCkpIHtcblx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIGVhY2ggYnJvd3NlIGFjdGlvbiBpbmRpdmlkdWFsbHkuIFdpdGhpbiBhIHRhYiwgYWN0aW9ucyBhcmVcblx0XHQvLyBhbHJlYWR5IGNvbnN0cmFpbmVkIHRvIGEgc2luZ2xlIGNhdGVnb3J5LCBzbyBjcm9zcy1wcm92aWRlclxuXHRcdC8vIG1lcmdpbmcgaXMgbm8gbG9uZ2VyIG1lYW5pbmdmdWwuXG5cdFx0YWxsQnJvd3NlQWN0aW9ucy5mb3JFYWNoKChhY3Rpb24sIGluZGV4KSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGFsbFByb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gYWN0aW9uLnByb3ZpZGVySWQpO1xuXHRcdFx0Y29uc3QgYWdlbnRIb3N0UHJvdmlkZXIgPSBwcm92aWRlciAmJiBpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSA/IHByb3ZpZGVyIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvblN0YXR1cyA9IGFnZW50SG9zdFByb3ZpZGVyPy5jb25uZWN0aW9uU3RhdHVzPy5nZXQoKTtcblx0XHRcdC8vIGBpbmNvbXBhdGlibGVgIGFsd2F5cyBkaXNhYmxlcyB0aGUgYWN0aW9uIFx1MjAxNCB0aGUgdXNlciBjYW4ndCBmaXhcblx0XHRcdC8vIGEgcHJvdG9jb2wgbWlzbWF0Y2ggYnkgY2xpY2tpbmcuIE90aGVyd2lzZSwgaWYgdGhlIHByb3ZpZGVyXG5cdFx0XHQvLyBzdXBwb3J0cyBjb25uZWN0LW9uLWRlbWFuZCAoZS5nLiBXU0wgYm9vdHMgdGhlIGRpc3RybyBvbiBmaXJzdFxuXHRcdFx0Ly8gYnJvd3NlKSwga2VlcCB0aGUgYWN0aW9uIGxpdmUgZXZlbiB3aGlsZSBkaXNjb25uZWN0ZWQuXG5cdFx0XHRjb25zdCBpc0luY29tcGF0aWJsZSA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoY29ubmVjdGlvblN0YXR1cyk7XG5cdFx0XHRjb25zdCBpc1VuYXZhaWxhYmxlID0gaXNJbmNvbXBhdGlibGVcblx0XHRcdFx0fHwgKCEhY29ubmVjdGlvblN0YXR1c1xuXHRcdFx0XHRcdCYmICFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGNvbm5lY3Rpb25TdGF0dXMpXG5cdFx0XHRcdFx0JiYgIWFnZW50SG9zdFByb3ZpZGVyPy5jYW5Db25uZWN0T25EZW1hbmQpO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmJyb3dzZVNlbGVjdEFjdGlvbicsIFwiU2VsZWN0Li4uXCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYWN0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IGFjdGlvbi5pY29uIH0sXG5cdFx0XHRcdGRpc2FibGVkOiBpc1VuYXZhaWxhYmxlLFxuXHRcdFx0XHRpdGVtOiB7IGJyb3dzZUFjdGlvbkluZGV4OiBpbmRleCB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBJbmxpbmUgXCJNYW5hZ2VcIiBlbnRyaWVzOiBkeW5hbWljIHJlbW90ZSBwcm92aWRlciByb3dzIChzY29wZWQgdG9cblx0XHQvLyB0aGUgUmVtb3RlIHRhYikgKyBtZW51LWNvbnRyaWJ1dGVkIGFjdGlvbnMgKGZpbHRlcmVkIGJ5IHRoZVxuXHRcdC8vIGBzZXNzaW9uV29ya3NwYWNlUGlja2VyR3JvdXBgIGNvbnRleHQga2V5KS5cblx0XHRjb25zdCBtYW5hZ2VBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRpZiAoaW5jbHVkZVJlbW90ZVByb3ZpZGVycykge1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiByZW1vdGVQcm92aWRlcnMpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cyEuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGlzVHVubmVsID0gcHJvdmlkZXIucmVtb3RlQWRkcmVzcz8uc3RhcnRzV2l0aChUVU5ORUxfQUREUkVTU19QUkVGSVgpO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6IGB3b3Jrc3BhY2VQaWNrZXIucmVtb3RlLiR7cHJvdmlkZXIuaWR9YCxcblx0XHRcdFx0XHRsYWJlbDogcHJvdmlkZXIubGFiZWwsXG5cdFx0XHRcdFx0dG9vbHRpcDogZ2V0U3RhdHVzTGFiZWwoc3RhdHVzKSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5faGlkZVBpY2tlcigpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd1JlbW90ZUhvc3RPcHRpb25zRGVsYXllZChwcm92aWRlcik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuZGVkID0gYWN0aW9uIGFzIElXb3Jrc3BhY2VQaWNrZXJBY3Rpb247XG5cdFx0XHRcdGV4dGVuZGVkLmljb24gPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHN0YXR1cylcblx0XHRcdFx0XHQ/IENvZGljb24ud2FybmluZ1xuXHRcdFx0XHRcdDogKGlzVHVubmVsID8gQ29kaWNvbi5jbG91ZCA6IENvZGljb24ucmVtb3RlKTtcblx0XHRcdFx0ZXh0ZW5kZWQuaG92ZXJDb250ZW50ID0gZ2V0U3RhdHVzSG92ZXIoc3RhdHVzLCBwcm92aWRlci5yZW1vdGVBZGRyZXNzKTtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLnJlbW90ZUFkZHJlc3MpIHtcblx0XHRcdFx0XHRleHRlbmRlZC5vblJlbW92ZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHJlbW92ZVJlbW90ZUhvc3QocHJvdmlkZXIsIHRoaXMucmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYW5hZ2VBY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtZW51QWN0aW9ucyA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudXMuU2Vzc2lvbldvcmtzcGFjZU1hbmFnZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0pO1xuXHRcdGZvciAoY29uc3QgWywgYWN0aW9uc10gb2YgbWVudUFjdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgbWVudUFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChtZW51QWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRjb25zdCBpY29uID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKG1lbnVBY3Rpb24uaXRlbS5pY29uKSA/IG1lbnVBY3Rpb24uaXRlbS5pY29uIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdG1hbmFnZUFjdGlvbnMucHVzaChPYmplY3QuYXNzaWduKG1lbnVBY3Rpb24sIHsgaWNvbiB9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobWFuYWdlQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID4gMCAmJiBpdGVtc1tpdGVtcy5sZW5ndGggLSAxXS5raW5kICE9PSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBtYW5hZ2VBY3Rpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuZGVkID0gYWN0aW9uIGFzIElXb3Jrc3BhY2VQaWNrZXJBY3Rpb247XG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZXh0ZW5kZWQub25SZW1vdmUgPyBhY3Rpb24udG9vbHRpcCB8fCB1bmRlZmluZWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBleHRlbmRlZC5pY29uID8/IENvZGljb24uc2V0dGluZ3NHZWFyIH0sXG5cdFx0XHRcdFx0aXRlbTogeyBydW46ICgpID0+IGFjdGlvbi5ydW4oKSwgY29tbWFuZElkOiBhY3Rpb24uaWQgfSxcblx0XHRcdFx0XHRvblJlbW92ZTogZXh0ZW5kZWQub25SZW1vdmUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dSZW1vdGVIb3N0T3B0aW9uc0RlbGF5ZWQocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyKTogdm9pZCB7XG5cdFx0Ly8gRGVmZXIgb25lIHRpY2sgc28gdGhlIGFjdGlvbiB3aWRnZXQgZnVsbHkgdGVhcnMgZG93biAoZm9jdXMvRE9NIGNsZWFudXApXG5cdFx0Ly8gYmVmb3JlIHRoZSBRdWlja1BpY2sgb3BlbnMgYW5kIGNsYWltcyBmb2N1cy5cblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHNob3dSZW1vdGVIb3N0T3B0aW9ucyhhY2Nlc3NvciwgcHJvdmlkZXIpKTtcblx0XHR9LCAxKTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBjbGVhclRpbWVvdXQodGltZW91dCkgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3VwZGF0ZVRyaWdnZXJMYWJlbCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHRyaWdnZXIgb2YgdGhpcy5fdHJpZ2dlckVsZW1lbnRzKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJUcmlnZ2VyTGFiZWwodHJpZ2dlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9yZW5kZXJUcmlnZ2VyTGFiZWwodHJpZ2dlcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRyaWdnZXIpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQ/LndvcmtzcGFjZTtcblx0XHRjb25zdCBsYWJlbCA9IHdvcmtzcGFjZSA/IHdvcmtzcGFjZS5sYWJlbCA6IGxvY2FsaXplKCdwaWNrV29ya3NwYWNlJywgXCJ3b3Jrc3BhY2VcIik7XG5cdFx0Y29uc3QgaWNvbiA9IHdvcmtzcGFjZSA/IHdvcmtzcGFjZS5pY29uIDogQ29kaWNvbi5wcm9qZWN0O1xuXG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB3b3Jrc3BhY2Vcblx0XHRcdD8gbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEFyaWFMYWJlbCcsIFwiTmV3IHNlc3Npb24gaW4gezB9XCIsIGxhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLnBpY2tBcmlhTGFiZWwnLCBcIlN0YXJ0IGJ5IHBpY2tpbmcgYSB3b3Jrc3BhY2VcIikpO1xuXG5cdFx0ZG9tLmFwcGVuZCh0cmlnZ2VyLCByZW5kZXJJY29uKGljb24pKTtcblx0XHRjb25zdCBsYWJlbFNwYW4gPSBkb20uYXBwZW5kKHRyaWdnZXIsIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnKSk7XG5cdFx0bGFiZWxTcGFuLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0ZG9tLmFwcGVuZCh0cmlnZ2VyLCByZW5kZXJJY29uKENvZGljb24uY2hldnJvbkRvd25Db21wYWN0KSkuY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1jaGV2cm9uJyk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBwcm92aWRlciBpcyBhIHJlbW90ZSB0aGF0IGlzIGN1cnJlbnRseSB1bmF2YWlsYWJsZVxuXHQgKiAoaW5jb21wYXRpYmxlLCBvciBkaXNjb25uZWN0ZWQvc3RpbGwgY29ubmVjdGluZyB3aXRob3V0IG9uLWRlbWFuZCBjb25uZWN0KS5cblx0ICogUmV0dXJucyBmYWxzZSBmb3IgcHJvdmlkZXJzIHdpdGhvdXQgY29ubmVjdGlvbiBzdGF0dXMgKGUuZy4gbG9jYWwgcHJvdmlkZXJzKS5cblx0ICovXG5cdHByb3RlY3RlZCBfaXNQcm92aWRlclVuYXZhaWxhYmxlKHByb3ZpZGVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFwcm92aWRlciB8fCAhaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikgfHwgIXByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY29ubmVjdGlvblN0YXR1cyA9IHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMuZ2V0KCk7XG5cdFx0cmV0dXJuIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoY29ubmVjdGlvblN0YXR1cylcblx0XHRcdHx8ICghUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uZWN0aW9uU3RhdHVzKSAmJiAhcHJvdmlkZXIuY2FuQ29ubmVjdE9uRGVtYW5kKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nvbm5lY3RQcm92aWRlck9uRGVtYW5kKHByb3ZpZGVySWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFwcm92aWRlciB8fCAhaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikgfHwgIXByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBjb25uZWN0aW9uU3RhdHVzID0gcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cy5nZXQoKTtcblx0XHRpZiAoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uZWN0aW9uU3RhdHVzKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKGNvbm5lY3Rpb25TdGF0dXMpIHx8ICFwcm92aWRlci5jYW5Db25uZWN0T25EZW1hbmQgfHwgIXByb3ZpZGVyLmNvbm5lY3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5pdGlhbE1lc3NhZ2UgPSBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmNvbm5lY3RpbmdSZW1vdGVBZ2VudEhvc3QnLCBcIkNvbm5lY3RpbmcgdG8gezB9Li4uXCIsIHByb3ZpZGVyLmxhYmVsKTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogaW5pdGlhbE1lc3NhZ2UsXG5cdFx0XHRwcm9ncmVzczogeyBpbmZpbml0ZTogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdHN0YXR1cyhpbml0aWFsTWVzc2FnZSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NMaXN0ZW5lciA9IHByb3ZpZGVyLm9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzPy4ocHJvZ3Jlc3MgPT4ge1xuXHRcdFx0aWYgKCFwcm92aWRlci5yZW1vdGVBZGRyZXNzIHx8IHByb2dyZXNzLmNvbm5lY3Rpb25LZXkgPT09IHByb3ZpZGVyLnJlbW90ZUFkZHJlc3MpIHtcblx0XHRcdFx0aGFuZGxlLnVwZGF0ZU1lc3NhZ2UocHJvZ3Jlc3MubWVzc2FnZSk7XG5cdFx0XHRcdHN0YXR1cyhwcm9ncmVzcy5tZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRsZXQgY29ubmVjdGVkID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLmNvbm5lY3QoKTtcblx0XHRcdGNvbm5lY3RlZCA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQocHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cy5nZXQoKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb2dyZXNzTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdGhhbmRsZS5jbG9zZSgpO1xuXHRcdH1cblx0XHRpZiAoY29ubmVjdGVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuY29ubmVjdFJlbW90ZUFnZW50SG9zdEZhaWxlZCcsIFwiRmFpbGVkIHRvIGNvbm5lY3QgdG8gezB9LlwiLCBwcm92aWRlci5sYWJlbCk7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG1lc3NhZ2UpO1xuXHRcdHN0YXR1cyhtZXNzYWdlKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2lzU2VsZWN0ZWRGb2xkZXIoZm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpIHx8ICFmb2xkZXJVcmkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpLCBmb2xkZXJVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZVNlbGVjdGVkV29ya3NwYWNlKCk6IElSZXNvbHZlZEZvbGRlcldvcmtzcGFjZSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gVHJ5IHRoZSBjaGVja2VkIGVudHJ5IGZpcnN0XG5cdFx0Y29uc3QgY2hlY2tlZCA9IHRoaXMuX3Jlc3RvcmVDaGVja2VkV29ya3NwYWNlKCk7XG5cdFx0aWYgKGNoZWNrZWQpIHtcblx0XHRcdHJldHVybiBjaGVja2VkO1xuXHRcdH1cblxuXHRcdC8vIEZhbGwgYmFjayB0byB0aGUgZmlyc3QgcmVzb2x2YWJsZSByZWNlbnQgd29ya3NwYWNlIGZyb20gYSBjb25uZWN0ZWQgcHJvdmlkZXIuXG5cdFx0Ly8gRmFsbGJhY2tzICh2cy4gdGhlIHVzZXIncyBleHBsaWNpdCBjaGVja2VkIHBpY2spIHJlcXVpcmUgdGhlIHByb3ZpZGVyXG5cdFx0Ly8gdG8gYmUgcmVhZHk6IHdlIGRvbid0IHdhbnQgdG8gc2lsZW50bHkgbGFuZCBvbiwgZS5nLiwgYSBkaXNjb25uZWN0ZWRcblx0XHQvLyByZW1vdGUgd29ya3NwYWNlIHRoYXQgdGhlIHVzZXIgbmV2ZXIgcGlja2VkLiBSZXN0cmljdCB0byB0aGUgc2Vzc2lvbnMnXG5cdFx0Ly8gb3duIHJlY2VudCBoaXN0b3J5IChub3QgVlMgQ29kZSdzIGdsb2JhbCByZWNlbnRzKSBzbyByZXN0b3JhdGlvbiBuZXZlclxuXHRcdC8vIHNlZWRzIGEgbmV3IHNlc3Npb24gZnJvbSBhIGZvbGRlciBtZXJlbHkgb3BlbmVkIGluIGFub3RoZXIgd2luZG93LlxuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlY2VudCBvZiB0aGlzLnJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudFdvcmtzcGFjZXMoZmFsc2UpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1Byb3ZpZGVyVW5hdmFpbGFibGUocmVjZW50LnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlY2VudDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlIG9ubHkgdGhlIGNoZWNrZWQgKHByZXZpb3VzbHkgc2VsZWN0ZWQpIHdvcmtzcGFjZSBpZiBhbnlcblx0ICogcHJvdmlkZXIgY2FuIHJlc29sdmUgaXRzIFVSSS4gVGhlIHByb3ZpZGVyJ3MgY29ubmVjdGlvbiBzdGF0dXMgaXNcblx0ICogaW50ZW50aW9uYWxseSBOT1QgY2hlY2tlZCBcdTIwMTQgd2UgaG9ub3IgdGhlIHVzZXIncyBleHBsaWNpdCBwaWNrIGV2ZW5cblx0ICogaWYgdGhlIHJlbW90ZSBpcyBzdGlsbCBjb25uZWN0aW5nIG9yIGN1cnJlbnRseSBkaXNjb25uZWN0ZWQuIFRoZVxuXHQgKiB0cmlnZ2VyIGxhYmVsIHJlZmxlY3RzIHRoZSBjb25uZWN0aW9uIHN0YXRlIHNlcGFyYXRlbHlcblx0ICogKHNwaW5uZXIgLyBncmF5ZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzdG9yZUNoZWNrZWRXb3Jrc3BhY2UoKTogSVJlc29sdmVkRm9sZGVyV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVjZW50V29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50V29ya3NwYWNlcyhmYWxzZSkuZmluZChyZWNlbnQgPT4gcmVjZW50LmNoZWNrZWQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiByZXN0b3JpbmcgYSB3b3Jrc3BhY2Ugd2hvc2UgcHJvdmlkZXIgaXNuJ3QgY3VycmVudGx5IENvbm5lY3RlZCxcblx0ICogd2F0Y2ggdGhlIGNvbm5lY3Rpb24gc3RhdHVzLiBGaXJlcyBgb25EaWRTZWxlY3RXb3Jrc3BhY2UodW5kZWZpbmVkKWBcblx0ICogKHdoaWNoIHRoZSB2aWV3IHBhbmUgY29udmVydHMgdG8gYHVuc2V0TmV3U2Vzc2lvbigpYCkgaWY6XG5cdCAqICAgLSB0aGUgc3RhdHVzIHRyYW5zaXRpb25zIHRvIERpc2Nvbm5lY3RlZCBhZnRlciB3ZSBzdGFydCB3YXRjaGluZywgb3Jcblx0ICogICAtIHRoZSBzdGF0dXMgaXMgc3RpbGwgbm90IENvbm5lY3RlZCBhZnRlciBhIHNob3J0IGdyYWNlIHBlcmlvZC5cblx0ICpcblx0ICogVGhlIGdyYWNlIHBlcmlvZCBjb3ZlcnMgYSByYWNlOiBwcm92aWRlciBzdGF0ZSBjYW4gdHJhbnNpdGlvbiBzeW5jaHJvbm91c2x5XG5cdCAqIGluc2lkZSBwcm92aWRlciByZWdpc3RyYXRpb24gYmVmb3JlIG91ciBhdXRvcnVuJ3MgZmlyc3QgcmVhZCwgc28gd2UgbWF5XG5cdCAqIG5ldmVyIG9ic2VydmUgYW4gZXhwbGljaXQgRGlzY29ubmVjdGVkIHRyYW5zaXRpb24uIFRoZSB0aW1lciBlbnN1cmVzIHdlXG5cdCAqIGV2ZW50dWFsbHkgZmFsbCBiYWNrIGluc3RlYWQgb2YgbGVhdmluZyB0aGUgcGlja2VyIHNob3dpbmcgYW4gdW5yZWFjaGFibGVcblx0ICogcmVtb3RlIHdpdGggbm8gc2Vzc2lvbi5cblx0ICpcblx0ICogSGFzIG5vIGVmZmVjdCBvbmNlIHRoZSB1c2VyIG1ha2VzIGFuIGV4cGxpY2l0IHBpY2sgKGBfdXNlckhhc1BpY2tlZGApLlxuXHQgKi9cblx0cHJpdmF0ZSBfd2F0Y2hGb3JDb25uZWN0aW9uRmFpbHVyZShyZXNvbHZlZDogSVJlc29sdmVkRm9sZGVyV29ya3NwYWNlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihyZXNvbHZlZC5wcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyIHx8ICFpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSB8fCAhcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25uU3RhdHVzID0gcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cztcblx0XHRpZiAoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uU3RhdHVzLmdldCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGRlclVyaSA9IHJlc29sdmVkLndvcmtzcGFjZS5mb2xkZXJzWzBdPy5yb290O1xuXHRcdGlmICghZm9sZGVyVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXR1c1dhdGNoLnZhbHVlID0gc3RvcmU7XG5cblx0XHRjb25zdCBmYWxsYmFjayA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25TdGF0dXNXYXRjaC5jbGVhcigpO1xuXHRcdFx0aWYgKCF0aGlzLl91c2VySGFzUGlja2VkICYmIHRoaXMuX2lzU2VsZWN0ZWRGb2xkZXIoZm9sZGVyVXJpKSkge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRSZXNvbHZlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgaXNGaXJzdFJ1biA9IHRydWU7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IGNvbm5TdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoc3RhdHVzKSkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uU3RhdHVzV2F0Y2guY2xlYXIoKTtcblx0XHRcdH0gZWxzZSBpZiAoKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNEaXNjb25uZWN0ZWQoc3RhdHVzKSB8fCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHN0YXR1cykpICYmICFpc0ZpcnN0UnVuKSB7XG5cdFx0XHRcdGZhbGxiYWNrKCk7XG5cdFx0XHR9XG5cdFx0XHRpc0ZpcnN0UnVuID0gZmFsc2U7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2FmZXR5IG5ldDogaWYgdGhlIGNvbm5lY3Rpb24gaGFzbid0IHN1Y2NlZWRlZCBieSB0aGUgZ3JhY2UgcGVyaW9kLFxuXHRcdC8vIGZhbGwgYmFjay4gQ2F0Y2hlcyB0aGUgY2FzZSB3aGVyZSB0aGUgcHJvdmlkZXIncyBzdGF0dXMgZmxpcHMgYmVmb3JlXG5cdFx0Ly8gb3VyIGF1dG9ydW4gc3Vic2NyaWJlcyAoc28gd2UgbmV2ZXIgb2JzZXJ2ZSBhIHRyYW5zaXRpb24pLlxuXHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmICghUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uU3RhdHVzLmdldCgpKSkge1xuXHRcdFx0XHRmYWxsYmFjaygpO1xuXHRcdFx0fVxuXHRcdH0sIFJFU1RPUkVfQ09OTkVDVF9HUkFDRV9NUywgc3RvcmUpO1xuXHR9XG5cblx0Ly8gLS0gUmVjZW50IHdvcmtzcGFjZXMgKHNlc3Npb25zJyBvd24gaGlzdG9yeSkgLS1cblxuXHRwcm90ZWN0ZWQgX2dldFJlY2VudFdvcmtzcGFjZXMoKTogSVJlc29sdmVkRm9sZGVyV29ya3NwYWNlW10ge1xuXHRcdHJldHVybiB0aGlzLnJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudFdvcmtzcGFjZXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVtb3ZlUmVjZW50V29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5yZW1vdmVSZWNlbnRXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcblxuXHRcdC8vIENsZWFyIGN1cnJlbnQgc2VsZWN0aW9uIGlmIGl0IHdhcyB0aGUgcmVtb3ZlZCB3b3Jrc3BhY2Vcblx0XHRpZiAodGhpcy5faXNTZWxlY3RlZEZvbGRlcihmb2xkZXJVcmkpKSB7XG5cdFx0XHR0aGlzLl9oaWRlUGlja2VyKCk7XG5cdFx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsY0FBYztBQUN2QixTQUFrQixnQkFBZ0I7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFFNUUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMEJBQW9GO0FBQzdGLFNBQXlCLDhCQUE4QjtBQUN2RCxTQUFTLGNBQWMsc0JBQXNCO0FBQzdDLFNBQVMseUJBQXlCLGlDQUFpQyx3Q0FBd0M7QUFDM0csU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FB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VztBQUNmO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxTQUFLLHVCQUF1QixRQUFRO0FBRXBDLFVBQU0sV0FBVyxNQUFNO0FBQ3RCLFdBQUssdUJBQXVCLE1BQU07QUFDbEMsVUFBSSxDQUFDLEtBQUssa0JBQWtCLEtBQUssa0JBQWtCLFNBQVMsR0FBRztBQUM5RCxhQUFLLHFCQUFxQjtBQUMxQixhQUFLLG9CQUFvQjtBQUN6QixhQUFLLG9CQUFvQjtBQUN6QixhQUFLLHNCQUFzQixLQUFLO0FBQ2hDLGFBQUssc0JBQXNCLEtBQUssTUFBUztBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUVBLFFBQUksYUFBYTtBQUNqQixVQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLFlBQU1BLFVBQVMsV0FBVyxLQUFLLE1BQU07QUFDckMsVUFBSSxnQ0FBZ0MsWUFBWUEsT0FBTSxHQUFHO0FBQ3hELGFBQUssdUJBQXVCLE1BQU07QUFBQSxNQUNuQyxZQUFZLGdDQUFnQyxlQUFlQSxPQUFNLEtBQUssZ0NBQWdDLGVBQWVBLE9BQU0sTUFBTSxDQUFDLFlBQVk7QUFDN0ksaUJBQVM7QUFBQSxNQUNWO0FBQ0EsbUJBQWE7QUFBQSxJQUNkLENBQUMsQ0FBQztBQUtGLHNCQUFrQixNQUFNO0FBQ3ZCLFVBQUksQ0FBQyxnQ0FBZ0MsWUFBWSxXQUFXLElBQUksQ0FBQyxHQUFHO0FBQ25FLGlCQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0QsR0FBRywwQkFBMEIsS0FBSztBQUFBLEVBQ25DO0FBQUE7QUFBQSxFQUlVLHVCQUFtRDtBQUM1RCxXQUFPLEtBQUssd0JBQXdCLG9CQUFvQjtBQUFBLEVBQ3pEO0FBQUEsRUFFVSx1QkFBdUIsV0FBc0I7QUFDdEQsU0FBSyx3QkFBd0Isc0JBQXNCLFNBQVM7QUFHNUQsUUFBSSxLQUFLLGtCQUFrQixTQUFTLEdBQUc7QUFDdEMsV0FBSyxZQUFZO0FBQ2pCLFdBQUsscUJBQXFCO0FBQzFCLFdBQUssb0JBQW9CO0FBQ3pCLFdBQUssb0JBQW9CO0FBQ3pCLFdBQUssc0JBQXNCLEtBQUssTUFBUztBQUFBLElBQzFDO0FBQUEsRUFDRDtBQUVEO0FBOS9CYSxrQkFBTjtBQUFBLEVBNEVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4RlU7IiwKICAibmFtZXMiOiBbInN0YXR1cyJdCn0K
