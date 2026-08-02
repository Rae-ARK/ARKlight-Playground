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
import "./media/agenttitlebarstatuswidget.css";
import { $, addDisposableListener, EventType, getWindow, isHTMLElement, reset } from "../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event as EventUtils } from "../../../../../../base/common/event.js";
import { localize } from "../../../../../../nls.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { AgentStatusMode, IAgentTitleBarStatusService } from "./agentTitleBarStatusService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction } from "./agentSessionProjectionActions.js";
import { UNIFIED_QUICK_ACCESS_ACTION_ID } from "./unifiedQuickAccessActions.js";
import { IAgentSessionsService } from "../agentSessionsService.js";
import { AgentSessionStatus, isSessionInProgressStatus } from "../agentSessionsModel.js";
import { BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Separator, SubmenuAction, toAction } from "../../../../../../base/common/actions.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../../platform/workspace/common/workspace.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InEditorZenModeContext } from "../../../../../common/contextkeys.js";
import { HiddenItemStrategy, WorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { createActionViewItem } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { FocusAgentSessionsAction } from "../agentSessionsActions.js";
import { WORKBENCH_MENU_MOTION_CLASS, workbenchMenuCloseAnimation } from "../../../../../browser/actions/menuMotion.js";
import { IActionViewItemService } from "../../../../../../platform/actions/browser/actionViewItemService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { LayoutSettings } from "../../../../../services/layout/browser/layoutService.js";
import { ChatAIDisabledSettingId, ChatConfiguration } from "../../../common/constants.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IChatWidgetService } from "../../chat.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ITitleService } from "../../../../../services/title/browser/titleService.js";
const TOGGLE_CHAT_ACTION_ID = "workbench.action.chat.toggle";
const QUICK_OPEN_ACTION_ID = "workbench.action.quickOpenWithModes";
const FILTER_STORAGE_KEY = "agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu";
const PREVIOUS_FILTER_STORAGE_KEY = "agentSessions.filterExcludes.previousUserFilter";
function shouldForceHiddenAgentStatus(configurationService, contextKeyService) {
  if (contextKeyService.getContextKeyValue(InEditorZenModeContext.key) === true) {
    return true;
  }
  const aiFeaturesDisabled = configurationService.getValue(ChatAIDisabledSettingId) === true;
  const aiCustomizationsDisabled = configurationService.getValue("disableAICustomizations") === true || configurationService.getValue("workbench.disableAICustomizations") === true;
  return aiFeaturesDisabled && aiCustomizationsDisabled;
}
function getAgentStatusSettingMode(configurationService, contextKeyService) {
  if (shouldForceHiddenAgentStatus(configurationService, contextKeyService)) {
    return "hidden";
  }
  const value = configurationService.getValue(ChatConfiguration.AgentStatusEnabled);
  if (value === false || value === "hidden") {
    return "hidden";
  }
  if (value === "badge") {
    return "badge";
  }
  if (value === true || value === void 0 || value === "compact") {
    return "compact";
  }
  return "compact";
}
let AgentTitleBarStatusWidget = class extends BaseActionViewItem {
  constructor(action, _windowTitle, options, instantiationService, agentTitleBarStatusService, hoverService, commandService, keybindingService, agentSessionsService, workspaceContextService, editorGroupsService, editorService, menuService, contextKeyService, storageService, configurationService, chatEntitlementService, chatWidgetService, telemetryService) {
    super(void 0, action, options);
    this._windowTitle = _windowTitle;
    this.instantiationService = instantiationService;
    this.agentTitleBarStatusService = agentTitleBarStatusService;
    this.hoverService = hoverService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    this.agentSessionsService = agentSessionsService;
    this.workspaceContextService = workspaceContextService;
    this.editorGroupsService = editorGroupsService;
    this.editorService = editorService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatWidgetService = chatWidgetService;
    this.telemetryService = telemetryService;
    this._dynamicDisposables = this._register(new DisposableStore());
    /** Guard to prevent re-entrant rendering */
    this._isRendering = false;
    /** Roving tabindex elements for keyboard navigation */
    this._rovingElements = [];
    this._rovingIndex = 0;
    /** Tracks if this window applied a badge filter (unread/inProgress), so we only auto-clear our own filters */
    // TODO: This is imperfect. Targetted fix for vscode#290863. We should revisit storing filter state per-window to avoid this
    this._badgeFilterAppliedByThisWindow = null;
    this._commandCenterMenu = this._register(this.menuService.createMenu(MenuId.CommandCenterCenter, this.contextKeyService));
    this._chatTitleBarMenu = this._register(this.menuService.createMenu(MenuId.ChatTitleBarMenu, this.contextKeyService));
    this._register(this.agentTitleBarStatusService.onDidChangeMode(() => {
      this._render();
    }));
    this._register(this.agentTitleBarStatusService.onDidChangeSessionInfo(() => {
      this._render();
    }));
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
      this._render();
    }));
    this._register(this._windowTitle.onDidChange(() => {
      this._render();
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this._render();
    }));
    this._register(this.editorGroupsService.onDidChangeEditorPartOptions(({ newPartOptions, oldPartOptions }) => {
      if (newPartOptions.showTabs !== oldPartOptions.showTabs) {
        this._render();
      }
    }));
    this._register(this._commandCenterMenu.onDidChange(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, "agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu", this._store)(() => {
      this._render();
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set([InEditorZenModeContext.key]))) {
        this._lastRenderState = void 0;
        this._render();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled) || e.affectsConfiguration(ChatConfiguration.UnifiedAgentsBar) || e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled) || e.affectsConfiguration(ChatAIDisabledSettingId) || e.affectsConfiguration("disableAICustomizations") || e.affectsConfiguration("workbench.disableAICustomizations")) {
        this._lastRenderState = void 0;
        this._render();
      }
    }));
    this._register(EventUtils.any(
      this.chatEntitlementService.onDidChangeSentiment,
      this.chatEntitlementService.onDidChangeQuotaExceeded,
      this.chatEntitlementService.onDidChangeEntitlement,
      this.chatEntitlementService.onDidChangeAnonymous
    )(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(this.chatWidgetService.onDidAddWidget(() => {
      this._render();
    }));
    this._register(this.chatWidgetService.onDidBackgroundSession(() => {
      this._render();
    }));
  }
  render(container) {
    super.render(container);
    this._container = container;
    container.classList.add("agent-status-container");
    container.setAttribute("role", "toolbar");
    container.setAttribute("aria-label", localize("agentStatusToolbarLabel", "Agent Status"));
    container.tabIndex = -1;
    this._render();
  }
  // Override focus methods - the container itself shouldn't be focusable,
  // focus is handled by the inner interactive elements (badge sections)
  setFocusable(_focusable) {
  }
  focus() {
    this._rovingElements[this._rovingIndex]?.focus();
  }
  blur() {
    if (!this._container) {
      return;
    }
    const activeElement = getWindow(this._container).document.activeElement;
    if (isHTMLElement(activeElement) && this._container.contains(activeElement)) {
      activeElement.blur();
    }
  }
  _render() {
    if (!this._container) {
      return;
    }
    if (this._isRendering) {
      return;
    }
    this._isRendering = true;
    try {
      const mode = this.agentTitleBarStatusService.mode;
      const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
      const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
      const attentionSession = attentionNeededSessions.length > 0 ? [...attentionNeededSessions].sort((a, b) => {
        const timeA = a.timing.lastRequestStarted ?? a.timing.created;
        const timeB = b.timing.lastRequestStarted ?? b.timing.created;
        return timeB - timeA;
      })[0] : void 0;
      const attentionText = attentionSession?.description ? typeof attentionSession.description === "string" ? attentionSession.description : renderAsPlaintext(attentionSession.description) : attentionSession?.label;
      const label = this._getLabel();
      const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
      const statusMode = getAgentStatusSettingMode(this.configurationService, this.contextKeyService);
      const unifiedAgentsBarEnabled = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
      const viewSessionsEnabled = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled) !== false;
      const stateKey = JSON.stringify({
        mode,
        sessionTitle: sessionInfo?.title,
        activeCount: activeSessions.length,
        unreadCount: unreadSessions.length,
        attentionCount: attentionNeededSessions.length,
        attentionText,
        label,
        isFilteredToUnread,
        isFilteredToInProgress,
        isFilteredToNeedsInput,
        statusMode,
        unifiedAgentsBarEnabled,
        viewSessionsEnabled
      });
      if (this._lastRenderState === stateKey) {
        return;
      }
      this._lastRenderState = stateKey;
      reset(this._container);
      this._dynamicDisposables.clear();
      this._rovingElements = [];
      if (this.agentTitleBarStatusService.mode === AgentStatusMode.Session) {
        this._renderSessionMode(this._dynamicDisposables);
      } else if (this.agentTitleBarStatusService.mode === AgentStatusMode.SessionReady) {
        this._renderSessionReadyMode(this._dynamicDisposables);
      } else if (statusMode === "compact") {
        this._renderChatInputMode(this._dynamicDisposables);
      } else if (statusMode === "badge") {
        this._renderStatusBadge(this._dynamicDisposables, activeSessions, unreadSessions, attentionNeededSessions);
      }
      this._setupRovingTabIndex(this._dynamicDisposables);
    } finally {
      this._isRendering = false;
    }
  }
  /**
   * Setup roving tabindex for arrow key navigation between interactive elements.
   * Uses the elements registered in `this._rovingElements` in their existing order.
   */
  _setupRovingTabIndex(disposables) {
    if (!this._container || this._rovingElements.length === 0) {
      return;
    }
    if (this._rovingIndex >= this._rovingElements.length) {
      this._rovingIndex = 0;
    }
    for (let i = 0; i < this._rovingElements.length; i++) {
      this._rovingElements[i].tabIndex = i === this._rovingIndex ? 0 : -1;
    }
    disposables.add(addDisposableListener(this._container, EventType.KEY_DOWN, (e) => {
      const index = this._rovingElements.findIndex((el) => el === e.target || el.contains(e.target));
      if (index === -1) {
        return;
      }
      const nextIndex = this._getNextRovingIndex(index, e.key);
      if (nextIndex !== void 0 && nextIndex !== index) {
        e.preventDefault();
        e.stopPropagation();
        this._moveRovingFocus(index, nextIndex);
      }
    }));
  }
  /**
   * Moves roving focus from `currentIndex` to `nextIndex`, updating tabIndex and focusing the element.
   */
  _moveRovingFocus(currentIndex, nextIndex) {
    this._rovingElements[currentIndex].tabIndex = -1;
    this._rovingElements[nextIndex].tabIndex = 0;
    this._rovingElements[nextIndex].focus();
    this._rovingIndex = nextIndex;
  }
  /**
   * Returns the next roving index for the given key, or `undefined` if no navigation should occur.
   */
  _getNextRovingIndex(currentIndex, key) {
    const len = this._rovingElements.length;
    switch (key) {
      case "ArrowRight":
        return (currentIndex + 1) % len;
      case "ArrowLeft":
        return (currentIndex - 1 + len) % len;
      case "Home":
        return 0;
      case "End":
        return len - 1;
      default:
        return void 0;
    }
  }
  // #region Session Statistics
  /**
   * Get computed session statistics for rendering.
   * Respects the current provider (session type) filter when calculating counts.
   */
  _getSessionStats() {
    const sessions = this.agentSessionsService.model.sessions;
    const currentFilter = this._getStoredFilter();
    const excludedProviders = currentFilter?.providers ?? [];
    const filteredSessions = excludedProviders.length > 0 ? sessions.filter((s) => !excludedProviders.includes(s.providerType)) : sessions;
    const activeSessions = filteredSessions.filter((s) => isSessionInProgressStatus(s.status) && !s.isArchived());
    const unreadSessions = filteredSessions.filter((s) => !s.isRead());
    const attentionNeededSessions = filteredSessions.filter((s) => s.status === AgentSessionStatus.NeedsInput && !this.chatWidgetService.getWidgetBySessionResource(s.resource));
    return {
      activeSessions,
      unreadSessions,
      attentionNeededSessions,
      hasActiveSessions: activeSessions.length > 0,
      hasUnreadSessions: unreadSessions.length > 0,
      hasAttentionNeeded: attentionNeededSessions.length > 0
    };
  }
  // #endregion
  // #region Mode Renderers
  _renderChatInputMode(disposables) {
    if (!this._container) {
      return;
    }
    const { activeSessions, unreadSessions, attentionNeededSessions, hasAttentionNeeded } = this._getSessionStats();
    const pill = $("div.agent-status-pill.chat-input-mode");
    if (hasAttentionNeeded) {
      pill.classList.add("needs-attention");
    }
    this._container.appendChild(pill);
    this._renderCommandCenterToolbar(disposables, pill);
    const isCompactMode = true;
    pill.classList.toggle("compact-mode", isCompactMode);
    const leftIcon = $("span.agent-status-left-icon");
    if (hasAttentionNeeded) {
      const reportIcon = renderIcon(Codicon.report);
      const countSpan = $("span.agent-status-attention-count");
      countSpan.textContent = String(attentionNeededSessions.length);
      reset(leftIcon, reportIcon, countSpan);
      leftIcon.classList.add("has-attention");
    } else {
      reset(leftIcon, renderIcon(Codicon.searchSparkle));
    }
    if (!isCompactMode) {
      pill.appendChild(leftIcon);
    }
    const inputArea = $("div.agent-status-input-area");
    inputArea.setAttribute("role", "button");
    inputArea.setAttribute("aria-label", localize("openQuickAccess", "Open Quick Access"));
    inputArea.tabIndex = 0;
    this._rovingElements.push(inputArea);
    pill.appendChild(inputArea);
    const label = $("span.agent-status-label");
    const { progress: progressText } = this._getSessionNeedingAttention(attentionNeededSessions);
    const defaultLabel = isCompactMode ? this._getLabel() : progressText ?? this._getLabel();
    if (!isCompactMode && progressText) {
      label.classList.add("has-progress");
    }
    const hoverLabel = localize("askAnythingPlaceholder", "Ask anything or describe what to build");
    label.textContent = defaultLabel;
    inputArea.appendChild(label);
    if (isCompactMode) {
      disposables.add(addDisposableListener(inputArea, EventType.MOUSE_ENTER, () => {
        reset(leftIcon, renderIcon(Codicon.searchSparkle));
        leftIcon.classList.remove("has-attention");
        label.classList.remove("has-progress");
      }));
      disposables.add(addDisposableListener(inputArea, EventType.MOUSE_LEAVE, () => {
        reset(leftIcon, renderIcon(Codicon.searchSparkle));
      }));
    } else {
      const sendIcon = $("span.agent-status-send");
      reset(sendIcon, renderIcon(Codicon.send));
      sendIcon.classList.add("hidden");
      inputArea.appendChild(sendIcon);
      if (!progressText) {
        disposables.add(addDisposableListener(inputArea, EventType.MOUSE_ENTER, () => {
          reset(leftIcon, renderIcon(Codicon.searchSparkle));
          leftIcon.classList.remove("has-attention");
          label.textContent = hoverLabel;
          label.classList.remove("has-progress");
          sendIcon.classList.remove("hidden");
        }));
        disposables.add(addDisposableListener(inputArea, EventType.MOUSE_LEAVE, () => {
          reset(leftIcon, renderIcon(Codicon.searchSparkle));
          label.textContent = defaultLabel;
          sendIcon.classList.add("hidden");
        }));
      }
    }
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, inputArea, () => {
      const kbForTooltip = this.keybindingService.lookupKeybinding(UNIFIED_QUICK_ACCESS_ACTION_ID)?.getLabel();
      return kbForTooltip ? localize("askTooltip", "Open Quick Access ({0})", kbForTooltip) : localize("askTooltip2", "Open Quick Access");
    }));
    disposables.add(addDisposableListener(inputArea, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.telemetryService.publicLog2("agentStatusWidget.click", {
        source: "pill",
        action: "quickAccess"
      });
      const useUnifiedQuickAccess = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
      this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
    }));
    disposables.add(addDisposableListener(inputArea, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.telemetryService.publicLog2("agentStatusWidget.click", {
          source: "pill",
          action: "quickAccess"
        });
        const useUnifiedQuickAccess = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
        this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
      }
    }));
    this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions, pill);
  }
  _renderSessionMode(disposables) {
    if (!this._container) {
      return;
    }
    const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
    this._renderCommandCenterToolbar(disposables);
    const pill = $("div.agent-status-pill.session-mode");
    this._container.appendChild(pill);
    this._renderSearchButton(disposables, pill);
    const titleLabel = $("span.agent-status-title");
    const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
    titleLabel.textContent = sessionInfo?.title ?? localize("agentSessionProjection", "Agent Session Projection");
    pill.appendChild(titleLabel);
    this._renderEscapeButton(disposables, pill);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
      const sessionInfo2 = this.agentTitleBarStatusService.sessionInfo;
      return sessionInfo2 ? localize("agentSessionProjectionTooltip", "Agent Session Projection: {0}", sessionInfo2.title) : localize("agentSessionProjection", "Agent Session Projection");
    }));
    const exitHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
    };
    disposables.add(addDisposableListener(pill, EventType.CLICK, exitHandler));
    disposables.add(addDisposableListener(pill, EventType.MOUSE_DOWN, exitHandler));
    this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
  }
  /**
   * Render session ready mode - shows session title + enter projection button.
   * Used when a projection-capable session is available but not yet entered.
   */
  _renderSessionReadyMode(disposables) {
    if (!this._container) {
      return;
    }
    const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
    const pill = $("div.agent-status-pill.session-ready-mode");
    this._container.appendChild(pill);
    const titleLabel = $("span.agent-status-title");
    const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
    titleLabel.textContent = sessionInfo?.title ?? localize("agentSessionReady", "Review Changes");
    pill.appendChild(titleLabel);
    this._renderEnterButton(disposables, pill);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
      const sessionInfo2 = this.agentTitleBarStatusService.sessionInfo;
      return sessionInfo2 ? localize("agentSessionReadyTooltip", "Review changes from: {0}", sessionInfo2.title) : localize("agentSessionReadyGeneric", "Review agent session changes");
    }));
    const enterHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sessionInfo2 = this.agentTitleBarStatusService.sessionInfo;
      if (sessionInfo2) {
        const session = this.agentSessionsService.getSession(sessionInfo2.sessionResource);
        if (session) {
          this.commandService.executeCommand(EnterAgentSessionProjectionAction.ID, session);
        }
      }
    };
    disposables.add(addDisposableListener(pill, EventType.CLICK, enterHandler));
    disposables.add(addDisposableListener(pill, EventType.MOUSE_DOWN, enterHandler));
    this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
  }
  // #endregion
  // #region Reusable Components
  /**
   * Render command center toolbar items (like debug toolbar) that are registered to CommandCenter
   * Filters out the quick open action since we provide our own search UI.
   * Adds a dot separator after the toolbar if content was rendered.
   */
  _renderCommandCenterToolbar(disposables, parent) {
    const container = parent ?? this._container;
    if (!container) {
      return;
    }
    const allActions = [];
    for (const [, actions] of this._commandCenterMenu.getActions({ shouldForwardArgs: true })) {
      for (const action of actions) {
        if (action.id === QUICK_OPEN_ACTION_ID) {
          continue;
        }
        if (action instanceof SubmenuAction) {
          allActions.push(...action.actions);
        } else {
          allActions.push(action);
        }
      }
    }
    if (allActions.length === 0) {
      return;
    }
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const toolbarContainer = $("div.agent-status-command-center-toolbar");
    container.appendChild(toolbarContainer);
    const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "agentStatusCommandCenter",
      actionViewItemProvider: (action, options) => {
        return createActionViewItem(this.instantiationService, action, { ...options, hoverDelegate });
      }
    });
    disposables.add(toolbar);
    toolbar.setActions(allActions);
    if (parent) {
      const separator = $("span.agent-status-line-separator");
      container.appendChild(separator);
    } else {
      const separator = renderIcon(Codicon.circleSmallFilled);
      separator.classList.add("agent-status-separator");
      container.appendChild(separator);
    }
  }
  /**
   * Render the search button. If parent is provided, appends to parent; otherwise appends to container.
   */
  _renderSearchButton(disposables, parent) {
    const container = parent ?? this._container;
    if (!container) {
      return;
    }
    const searchButton = $("span.agent-status-search");
    reset(searchButton, renderIcon(Codicon.searchSparkle));
    searchButton.setAttribute("role", "button");
    searchButton.setAttribute("aria-label", localize("openQuickOpen", "Open Quick Open"));
    searchButton.tabIndex = 0;
    this._rovingElements.push(searchButton);
    container.appendChild(searchButton);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const searchKb = this.keybindingService.lookupKeybinding(QUICK_OPEN_ACTION_ID)?.getLabel();
    const searchTooltip = searchKb ? localize("openQuickOpenTooltip", "Go to File ({0})", searchKb) : localize("openQuickOpenTooltip2", "Go to File");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, searchButton, searchTooltip));
    disposables.add(addDisposableListener(searchButton, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(QUICK_OPEN_ACTION_ID);
    }));
    disposables.add(addDisposableListener(searchButton, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.commandService.executeCommand(QUICK_OPEN_ACTION_ID);
      }
    }));
  }
  /**
   * Render the status badge showing in-progress, needs-input, and/or unread session counts.
   * Shows split UI with sparkle icon on left, then unread, needs-input, and active indicators.
   * Always renders the sparkle icon section.
   */
  _renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions, inlineContainer) {
    if (!this._container) {
      return;
    }
    const hasActiveSessions = activeSessions.length > 0;
    const hasUnreadSessions = unreadSessions.length > 0;
    const hasAttentionNeeded = attentionNeededSessions.length > 0;
    this._clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions, hasAttentionNeeded);
    let badge;
    if (inlineContainer) {
      badge = inlineContainer;
    } else {
      badge = $("div.agent-status-badge");
      this._container.appendChild(badge);
    }
    const sparkleContainer = $("span.agent-status-badge-section.sparkle");
    sparkleContainer.tabIndex = 0;
    const menuActions = Separator.join(...this._chatTitleBarMenu.getActions({ shouldForwardArgs: true }).map(([, actions]) => actions));
    const primaryActionId = TOGGLE_CHAT_ACTION_ID;
    const primaryActionTitle = localize("toggleChat", "Toggle Chat");
    const primaryActionIcon = Codicon.chatSparkle;
    const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
      id: primaryActionId,
      title: primaryActionTitle,
      icon: primaryActionIcon
    }, void 0, void 0, void 0, void 0);
    const dropdownAction = toAction({
      id: "agentStatus.sparkle.dropdown",
      label: localize("agentStatus.sparkle.dropdown", "More Actions"),
      run() {
      }
    });
    const sparkleDropdown = this.instantiationService.createInstance(
      DropdownWithPrimaryActionViewItem,
      primaryAction,
      dropdownAction,
      menuActions,
      "agent-status-sparkle-dropdown",
      { skipTelemetry: true, menuClassName: WORKBENCH_MENU_MOTION_CLASS, closeAnimation: workbenchMenuCloseAnimation }
    );
    sparkleDropdown.render(sparkleContainer);
    disposables.add(sparkleDropdown);
    disposables.add(addDisposableListener(
      sparkleContainer,
      EventType.KEY_DOWN,
      (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
          const idx = this._rovingElements.indexOf(sparkleContainer);
          if (idx === -1) {
            return;
          }
          const nextIndex = this._getNextRovingIndex(idx, e.key);
          if (nextIndex !== void 0 && nextIndex !== idx) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this._moveRovingFocus(idx, nextIndex);
          }
        }
      },
      true
      /* useCapture */
    ));
    disposables.add(addDisposableListener(sparkleContainer, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.commandService.executeCommand(primaryActionId);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        sparkleDropdown.showDropdown();
      }
    }));
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const viewSessionsEnabled = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled) !== false;
    const reverseOrder = !!inlineContainer;
    if (!reverseOrder) {
      badge.appendChild(sparkleContainer);
    }
    let unreadSection;
    let activeSection;
    let needsInputSection;
    if (viewSessionsEnabled && hasUnreadSessions && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
      const { isFilteredToUnread } = this._getCurrentFilterState();
      unreadSection = $("span.agent-status-badge-section.unread");
      if (isFilteredToUnread) {
        unreadSection.classList.add("filtered");
      }
      unreadSection.setAttribute("role", "button");
      unreadSection.tabIndex = 0;
      const unreadIcon = $("span.agent-status-icon");
      reset(unreadIcon, renderIcon(Codicon.circleFilled));
      unreadSection.appendChild(unreadIcon);
      const unreadCount = $("span.agent-status-text");
      unreadCount.textContent = String(unreadSessions.length);
      unreadSection.appendChild(unreadCount);
      disposables.add(addDisposableListener(unreadSection, EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSessionsWithFilter("unread");
      }));
      disposables.add(addDisposableListener(unreadSection, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          this._openSessionsWithFilter("unread");
        }
      }));
      const unreadTooltip = unreadSessions.length === 1 ? localize("unreadSessionsTooltip1", "{0} unread session", unreadSessions.length) : localize("unreadSessionsTooltip", "{0} unread sessions", unreadSessions.length);
      disposables.add(this.hoverService.setupManagedHover(hoverDelegate, unreadSection, unreadTooltip));
    }
    if (viewSessionsEnabled && hasAttentionNeeded) {
      const { isFilteredToNeedsInput } = this._getCurrentFilterState();
      needsInputSection = $("span.agent-status-badge-section.active.needs-input");
      if (isFilteredToNeedsInput) {
        needsInputSection.classList.add("filtered");
      }
      needsInputSection.setAttribute("role", "button");
      needsInputSection.tabIndex = 0;
      const needsInputIcon = $("span.agent-status-icon");
      reset(needsInputIcon, renderIcon(Codicon.report));
      needsInputSection.appendChild(needsInputIcon);
      const needsInputCount = $("span.agent-status-text");
      needsInputCount.textContent = String(attentionNeededSessions.length);
      needsInputSection.appendChild(needsInputCount);
      disposables.add(addDisposableListener(needsInputSection, EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSessionsWithFilter("needsInput");
      }));
      disposables.add(addDisposableListener(needsInputSection, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          this._openSessionsWithFilter("needsInput");
        }
      }));
      const needsInputTooltip = attentionNeededSessions.length === 1 ? localize("needsInputSessionsTooltip1", "{0} session needs input", attentionNeededSessions.length) : localize("needsInputSessionsTooltip", "{0} sessions need input", attentionNeededSessions.length);
      disposables.add(this.hoverService.setupManagedHover(hoverDelegate, needsInputSection, needsInputTooltip));
    }
    const inProgressOnly = activeSessions.filter((s) => s.status !== AgentSessionStatus.NeedsInput);
    if (viewSessionsEnabled && inProgressOnly.length > 0) {
      const { isFilteredToInProgress } = this._getCurrentFilterState();
      activeSection = $("span.agent-status-badge-section.active");
      if (isFilteredToInProgress) {
        activeSection.classList.add("filtered");
      }
      activeSection.setAttribute("role", "button");
      activeSection.tabIndex = 0;
      const statusIcon = $("span.agent-status-icon");
      reset(statusIcon, renderIcon(Codicon.sessionInProgress));
      activeSection.appendChild(statusIcon);
      const statusCount = $("span.agent-status-text");
      statusCount.textContent = String(inProgressOnly.length);
      activeSection.appendChild(statusCount);
      disposables.add(addDisposableListener(activeSection, EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSessionsWithFilter("inProgress");
      }));
      disposables.add(addDisposableListener(activeSection, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          this._openSessionsWithFilter("inProgress");
        }
      }));
      const activeTooltip = inProgressOnly.length === 1 ? localize("activeSessionsTooltip1", "{0} session in progress", inProgressOnly.length) : localize("activeSessionsTooltip", "{0} sessions in progress", inProgressOnly.length);
      disposables.add(this.hoverService.setupManagedHover(hoverDelegate, activeSection, activeTooltip));
    }
    if (reverseOrder) {
      if (needsInputSection) {
        badge.appendChild(needsInputSection);
        this._rovingElements.push(needsInputSection);
      }
      if (activeSection) {
        badge.appendChild(activeSection);
        this._rovingElements.push(activeSection);
      }
      if (unreadSection) {
        badge.appendChild(unreadSection);
        this._rovingElements.push(unreadSection);
      }
      badge.appendChild(sparkleContainer);
      this._rovingElements.push(sparkleContainer);
    } else {
      this._rovingElements.push(sparkleContainer);
      if (unreadSection) {
        badge.appendChild(unreadSection);
        this._rovingElements.push(unreadSection);
      }
      if (activeSection) {
        badge.appendChild(activeSection);
        this._rovingElements.push(activeSection);
      }
      if (needsInputSection) {
        badge.appendChild(needsInputSection);
        this._rovingElements.push(needsInputSection);
      }
    }
  }
  /**
   * Clear the filter if the currently filtered category becomes empty.
   * For example, if filtered to "unread" but no unread sessions exist, restore user's previous filter.
   * Only auto-clears if THIS window applied the badge filter to avoid cross-window interference.
   */
  _clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions, hasAttentionNeeded) {
    if (this._badgeFilterAppliedByThisWindow === "unread" && !hasUnreadSessions) {
      this._restoreUserFilter();
    } else if (this._badgeFilterAppliedByThisWindow === "inProgress" && !hasActiveSessions) {
      this._restoreUserFilter();
    } else if (this._badgeFilterAppliedByThisWindow === "needsInput" && !hasAttentionNeeded) {
      this._restoreUserFilter();
    }
  }
  /**
   * Get the current filter state from storage.
   */
  _getCurrentFilterState() {
    const filter = this._getStoredFilter();
    if (!filter) {
      return { isFilteredToUnread: false, isFilteredToInProgress: false, isFilteredToNeedsInput: false };
    }
    const isFilteredToUnread = filter.read === true && filter.states.length === 0;
    const isFilteredToInProgress = filter.states?.length === 3 && filter.states.includes(AgentSessionStatus.NeedsInput) && filter.read === false;
    const isFilteredToNeedsInput = filter.states?.length === 3 && filter.states.includes(AgentSessionStatus.InProgress) && filter.read === false;
    return { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput };
  }
  /**
   * Get the stored filter object from storage.
   */
  _getStoredFilter() {
    const filterStr = this.storageService.get(FILTER_STORAGE_KEY, StorageScope.PROFILE);
    if (!filterStr) {
      return void 0;
    }
    try {
      return JSON.parse(filterStr);
    } catch {
      return void 0;
    }
  }
  /**
   * Store a filter object to storage.
   */
  _storeFilter(filter) {
    this.storageService.store(FILTER_STORAGE_KEY, JSON.stringify(filter), StorageScope.PROFILE, StorageTarget.USER);
  }
  /**
   * Clear all filters (reset to default).
   */
  _clearFilter() {
    this._storeFilter({
      providers: [],
      states: [],
      archived: true,
      read: false
    });
  }
  /**
   * Save the current user filter before we override it with a badge filter.
   * Only saves if the current filter is NOT already a badge filter (unread or in-progress).
   * This preserves the original user filter when switching between badge filters.
   */
  _saveUserFilter() {
    const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
    if (isFilteredToUnread || isFilteredToInProgress || isFilteredToNeedsInput) {
      return;
    }
    const currentFilter = this._getStoredFilter();
    if (currentFilter) {
      this.storageService.store(PREVIOUS_FILTER_STORAGE_KEY, JSON.stringify(currentFilter), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  /**
   * Restore the user's previous filter (saved before we applied a badge filter).
   */
  _restoreUserFilter() {
    const previousFilterStr = this.storageService.get(PREVIOUS_FILTER_STORAGE_KEY, StorageScope.PROFILE);
    if (previousFilterStr) {
      try {
        const previousFilter = JSON.parse(previousFilterStr);
        this._storeFilter(previousFilter);
      } catch {
        this._clearFilter();
      }
    } else {
      this._clearFilter();
    }
    this.storageService.remove(PREVIOUS_FILTER_STORAGE_KEY, StorageScope.PROFILE);
    this._badgeFilterAppliedByThisWindow = null;
  }
  /**
   * Opens the agent sessions view with a specific filter applied, or restores previous filter if already applied.
   * Preserves session type (provider) filters while toggling only status filters.
   */
  _openSessionsWithFilter(filterType) {
    const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
    const currentFilter = this._getStoredFilter();
    const preservedProviders = currentFilter?.providers ?? [];
    const isToggleOff = filterType === "unread" && isFilteredToUnread || filterType === "inProgress" && isFilteredToInProgress || filterType === "needsInput" && isFilteredToNeedsInput;
    this.telemetryService.publicLog2("agentStatusWidget.click", {
      source: filterType,
      action: isToggleOff ? "clearFilter" : "applyFilter"
    });
    if (isToggleOff) {
      this._restoreUserFilter();
    } else {
      this._saveUserFilter();
      if (filterType === "unread") {
        this._storeFilter({
          providers: preservedProviders,
          states: [],
          archived: true,
          read: true
        });
      } else if (filterType === "inProgress") {
        this._storeFilter({
          providers: preservedProviders,
          states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed, AgentSessionStatus.NeedsInput],
          archived: true,
          read: false
        });
      } else {
        this._storeFilter({
          providers: preservedProviders,
          states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed, AgentSessionStatus.InProgress],
          archived: true,
          read: false
        });
      }
      this._badgeFilterAppliedByThisWindow = filterType;
    }
    this.commandService.executeCommand(FocusAgentSessionsAction.id);
  }
  /**
   * Render the escape button for exiting session projection mode.
   */
  _renderEscapeButton(disposables, parent) {
    const escButton = $("span.agent-status-esc-button");
    escButton.textContent = "Esc";
    escButton.setAttribute("role", "button");
    escButton.setAttribute("aria-label", localize("exitAgentSessionProjection", "Exit Agent Session Projection"));
    escButton.tabIndex = 0;
    this._rovingElements.push(escButton);
    parent.appendChild(escButton);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, escButton, localize("exitAgentSessionProjectionTooltip", "Exit Agent Session Projection (Escape)")));
    disposables.add(addDisposableListener(escButton, EventType.MOUSE_DOWN, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
    }));
    disposables.add(addDisposableListener(escButton, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
    }));
    disposables.add(addDisposableListener(escButton, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
      }
    }));
  }
  /**
   * Render the enter button for entering session projection mode.
   */
  _renderEnterButton(disposables, parent) {
    const enterButton = $("span.agent-status-enter-button");
    const keybinding = this.keybindingService.lookupKeybinding(EnterAgentSessionProjectionAction.ID);
    enterButton.textContent = keybinding?.getLabel() ?? localize("review", "Review");
    enterButton.setAttribute("role", "button");
    enterButton.setAttribute("aria-label", localize("enterAgentSessionProjection", "Enter Agent Session Projection"));
    enterButton.tabIndex = 0;
    this._rovingElements.push(enterButton);
    parent.appendChild(enterButton);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const hoverText = keybinding ? localize("enterAgentSessionProjectionTooltip", "Review Changes ({0})", keybinding.getLabel()) : localize("enterAgentSessionProjectionTooltipNoKey", "Review Changes");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, enterButton, hoverText));
    const enterProjection = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
      if (sessionInfo) {
        const session = this.agentSessionsService.getSession(sessionInfo.sessionResource);
        if (session) {
          this.commandService.executeCommand(EnterAgentSessionProjectionAction.ID, session);
        }
      }
    };
    disposables.add(addDisposableListener(enterButton, EventType.MOUSE_DOWN, enterProjection));
    disposables.add(addDisposableListener(enterButton, EventType.CLICK, enterProjection));
    disposables.add(addDisposableListener(enterButton, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        enterProjection(e);
      }
    }));
  }
  // #endregion
  // #region Session Helpers
  /**
   * Get the session most urgently needing user attention (approval/confirmation/input).
   * Returns undefined if no sessions need attention.
   */
  _getSessionNeedingAttention(attentionNeededSessions) {
    if (attentionNeededSessions.length === 0) {
      return { session: void 0, progress: void 0 };
    }
    const sorted = [...attentionNeededSessions].sort((a, b) => {
      const timeA = a.timing.lastRequestStarted ?? a.timing.created;
      const timeB = b.timing.lastRequestStarted ?? b.timing.created;
      return timeB - timeA;
    });
    const mostRecent = sorted[0];
    if (!mostRecent.description) {
      return { session: mostRecent, progress: mostRecent.label };
    }
    const progress = typeof mostRecent.description === "string" ? mostRecent.description : renderAsPlaintext(mostRecent.description);
    return { session: mostRecent, progress };
  }
  // #endregion
  // #region Label Helpers
  /**
   * Compute the label to display in the command center.
   * Uses the workspace name (folder name) with prefix/suffix decorations.
   * Falls back to file name when tabs are hidden, or "Search" when empty.
   */
  _getLabel() {
    const { prefix, suffix } = this._windowTitle.getTitleDecorations();
    let label = this._windowTitle.workspaceName;
    if (this._windowTitle.isCustomTitleFormat()) {
      label = this._windowTitle.getWindowTitle();
    } else if (!label && this.editorGroupsService.partOptions.showTabs === "none") {
      label = this._windowTitle.fileName ?? "";
    }
    if (!label) {
      label = localize("agentStatusWidget.search", "Search");
    }
    if (prefix) {
      label = localize("label1", "{0} {1}", prefix, label);
    }
    if (suffix) {
      label = localize("label2", "{0} {1}", label, suffix);
    }
    return label.replaceAll(/\r\n|\r|\n/g, "\u23CE");
  }
  // #endregion
};
AgentTitleBarStatusWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IAgentTitleBarStatusService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IAgentSessionsService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IEditorGroupsService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IMenuService),
  __decorateParam(13, IContextKeyService),
  __decorateParam(14, IStorageService),
  __decorateParam(15, IConfigurationService),
  __decorateParam(16, IChatEntitlementService),
  __decorateParam(17, IChatWidgetService),
  __decorateParam(18, ITelemetryService)
], AgentTitleBarStatusWidget);
let AgentTitleBarStatusRendering = class extends Disposable {
  constructor(actionViewItemService, instantiationService, configurationService, contextKeyService, titleService) {
    super();
    this._register(actionViewItemService.register(MenuId.CommandCenter, MenuId.AgentsTitleBarControlMenu, (action, options) => {
      if (!(action instanceof SubmenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(AgentTitleBarStatusWidget, action, titleService.windowTitle, options);
    }, void 0));
    const chatEnabledKey = contextKeyService.getContextKeyValue("chatIsEnabled");
    let chatEnabled = !!chatEnabledKey;
    const updateClass = () => {
      const commandCenterEnabled = configurationService.getValue(LayoutSettings.COMMAND_CENTER) === true;
      const statusMode = getAgentStatusSettingMode(configurationService, contextKeyService);
      const enabled = commandCenterEnabled && chatEnabled && statusMode !== "hidden";
      const enhanced = enabled && statusMode === "compact";
      mainWindow.document.body.classList.toggle("agent-status-enabled", enabled);
      mainWindow.document.body.classList.toggle("unified-agents-bar", enhanced);
    };
    updateClass();
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled) || e.affectsConfiguration(LayoutSettings.COMMAND_CENTER) || e.affectsConfiguration(ChatAIDisabledSettingId) || e.affectsConfiguration("disableAICustomizations") || e.affectsConfiguration("workbench.disableAICustomizations")) {
        updateClass();
      }
    }));
    this._register(contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set(["chatIsEnabled", InEditorZenModeContext.key]))) {
        chatEnabled = !!contextKeyService.getContextKeyValue("chatIsEnabled");
        updateClass();
      }
    }));
  }
};
AgentTitleBarStatusRendering.ID = "workbench.contrib.agentStatus.rendering";
AgentTitleBarStatusRendering = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ITitleService)
], AgentTitleBarStatusRendering);
export {
  AgentTitleBarStatusRendering,
  AgentTitleBarStatusWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL2FnZW50VGl0bGVCYXJTdGF0dXNXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnR0aXRsZWJhcnN0YXR1c3dpZGdldC5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGdldFdpbmRvdywgaXNIVE1MRWxlbWVudCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCBhcyBFdmVudFV0aWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQWdlbnRTdGF0dXNNb2RlLCBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgfSBmcm9tICcuL2FnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEVudGVyQWdlbnRTZXNzaW9uUHJvamVjdGlvbkFjdGlvbiwgRXhpdEFnZW50U2Vzc2lvblByb2plY3Rpb25BY3Rpb24gfSBmcm9tICcuL2FnZW50U2Vzc2lvblByb2plY3Rpb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFVOSUZJRURfUVVJQ0tfQUNDRVNTX0FDVElPTl9JRCB9IGZyb20gJy4vdW5pZmllZFF1aWNrQWNjZXNzQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TdGF0dXMsIElBZ2VudFNlc3Npb24sIGlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXMgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJbkVkaXRvclplbk1vZGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IERyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9kcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEZvY3VzQWdlbnRTZXNzaW9uc0FjdGlvbiB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBXT1JLQkVOQ0hfTUVOVV9NT1RJT05fQ0xBU1MsIHdvcmtiZW5jaE1lbnVDbG9zZUFuaW1hdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9tZW51TW90aW9uLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgTGF5b3V0U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdpbmRvd1RpdGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy90aXRsZWJhci93aW5kb3dUaXRsZS5qcyc7XG5pbXBvcnQgeyBDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCwgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRpdGxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RpdGxlL2Jyb3dzZXIvdGl0bGVTZXJ2aWNlLmpzJztcblxuLy8gVGVsZW1ldHJ5IHR5cGVzXG50eXBlIEFnZW50U3RhdHVzQ2xpY2tBY3Rpb24gPVxuXHR8ICdvcGVuU2Vzc2lvbidcblx0fCAncXVpY2tBY2Nlc3MnXG5cdHwgJ2ZvY3VzU2Vzc2lvbnNWaWV3J1xuXHR8ICd0b2dnbGVDaGF0J1xuXHR8ICdzZXR1cENoYXQnXG5cdHwgJ2FwcGx5RmlsdGVyJ1xuXHR8ICdjbGVhckZpbHRlcidcblx0fCAnZW50ZXJQcm9qZWN0aW9uJ1xuXHR8ICdleGl0UHJvamVjdGlvbic7XG5cbnR5cGUgQWdlbnRTdGF0dXNDbGlja0V2ZW50ID0ge1xuXHRzb3VyY2U6ICdwaWxsJyB8ICdzcGFya2xlJyB8ICd1bnJlYWQnIHwgJ2luUHJvZ3Jlc3MnIHwgJ25lZWRzSW5wdXQnO1xuXHRhY3Rpb246IEFnZW50U3RhdHVzQ2xpY2tBY3Rpb247XG59O1xuXG50eXBlIEFnZW50U3RhdHVzQ2xpY2tDbGFzc2lmaWNhdGlvbiA9IHtcblx0c291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hpY2ggcGFydCBvZiB0aGUgYWdlbnQgc3RhdHVzIHdpZGdldCB3YXMgY2xpY2tlZC4nIH07XG5cdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3Rpb24gdGFrZW4gaW4gcmVzcG9uc2UgdG8gdGhlIGNsaWNrLicgfTtcblx0b3duZXI6ICdqb3Noc3BpY2VyJztcblx0Y29tbWVudDogJ1RyYWNrcyBpbnRlcmFjdGlvbnMgd2l0aCB0aGUgYWdlbnQgc3RhdHVzIGNvbW1hbmQgY2VudGVyIGNvbnRyb2wuJztcbn07XG5cbi8vIEFjdGlvbiBJRHNcbmNvbnN0IFRPR0dMRV9DSEFUX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudG9nZ2xlJztcbmNvbnN0IFFVSUNLX09QRU5fQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuV2l0aE1vZGVzJztcblxuLy8gU3RvcmFnZSBrZXkgZm9yIGZpbHRlciBzdGF0ZVxuY29uc3QgRklMVEVSX1NUT1JBR0VfS0VZID0gJ2FnZW50U2Vzc2lvbnMuZmlsdGVyRXhjbHVkZXMuYWdlbnRzZXNzaW9uc3ZpZXdlcmZpbHRlcnN1Ym1lbnUnO1xuLy8gU3RvcmFnZSBrZXkgZm9yIHNhdmluZyB1c2VyJ3MgZmlsdGVyIHN0YXRlIGJlZm9yZSB3ZSBvdmVycmlkZSBpdFxuY29uc3QgUFJFVklPVVNfRklMVEVSX1NUT1JBR0VfS0VZID0gJ2FnZW50U2Vzc2lvbnMuZmlsdGVyRXhjbHVkZXMucHJldmlvdXNVc2VyRmlsdGVyJztcblxudHlwZSBBZ2VudFN0YXR1c1NldHRpbmdNb2RlID0gJ2hpZGRlbicgfCAnYmFkZ2UnIHwgJ2NvbXBhY3QnO1xuXG5mdW5jdGlvbiBzaG91bGRGb3JjZUhpZGRlbkFnZW50U3RhdHVzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBib29sZWFuIHtcblx0Ly8gSGlkZSBhbGwgYWdlbnQgZGlzdHJhY3Rpb25zIHdoaWxlIGluIFplbiBtb2RlXG5cdGlmIChjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oSW5FZGl0b3JaZW5Nb2RlQ29udGV4dC5rZXkpID09PSB0cnVlKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBhaUZlYXR1cmVzRGlzYWJsZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkgPT09IHRydWU7XG5cdGNvbnN0IGFpQ3VzdG9taXphdGlvbnNEaXNhYmxlZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdkaXNhYmxlQUlDdXN0b21pemF0aW9ucycpID09PSB0cnVlXG5cdFx0fHwgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5kaXNhYmxlQUlDdXN0b21pemF0aW9ucycpID09PSB0cnVlO1xuXG5cdHJldHVybiBhaUZlYXR1cmVzRGlzYWJsZWQgJiYgYWlDdXN0b21pemF0aW9uc0Rpc2FibGVkO1xufVxuXG5mdW5jdGlvbiBnZXRBZ2VudFN0YXR1c1NldHRpbmdNb2RlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBBZ2VudFN0YXR1c1NldHRpbmdNb2RlIHtcblx0aWYgKHNob3VsZEZvcmNlSGlkZGVuQWdlbnRTdGF0dXMoY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdHJldHVybiAnaGlkZGVuJztcblx0fVxuXG5cdGNvbnN0IHZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRTdGF0dXNFbmFibGVkKTtcblxuXHRpZiAodmFsdWUgPT09IGZhbHNlIHx8IHZhbHVlID09PSAnaGlkZGVuJykge1xuXHRcdHJldHVybiAnaGlkZGVuJztcblx0fVxuXG5cdGlmICh2YWx1ZSA9PT0gJ2JhZGdlJykge1xuXHRcdHJldHVybiAnYmFkZ2UnO1xuXHR9XG5cblx0Ly8gQmFja3dhcmQgY29tcGF0aWJpbGl0eTogcHJldmlvdXMgZXhwZXJpbWVudHMgc3RvcmVkIHRoaXMgYXMgYSBib29sZWFuLlxuXHRpZiAodmFsdWUgPT09IHRydWUgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0cmV0dXJuICdjb21wYWN0Jztcblx0fVxuXG5cdHJldHVybiAnY29tcGFjdCc7XG59XG5cbi8qKlxuICogQWdlbnQgU3RhdHVzIFdpZGdldCAtIHJlbmRlcnMgYWdlbnQgc3RhdHVzIGluIHRoZSBjb21tYW5kIGNlbnRlci5cbiAqXG4gKiBTaG93cyB0d28gZGlmZmVyZW50IHN0YXRlczpcbiAqIDEuIERlZmF1bHQgc3RhdGU6IENvcGlsb3QgaWNvbiBwaWxsICh0dXJucyBibHVlIHdpdGggaW4tcHJvZ3Jlc3MgY291bnQgd2hlbiBhZ2VudHMgYXJlIHJ1bm5pbmcpXG4gKiAyLiBBZ2VudCBTZXNzaW9uIFByb2plY3Rpb24gc3RhdGU6IFNlc3Npb24gdGl0bGUgKyBjbG9zZSBidXR0b24gKHdoZW4gdmlld2luZyBhIHNlc3Npb24pXG4gKlxuICogVGhlIGNvbW1hbmQgY2VudGVyIHNlYXJjaCBib3ggYW5kIG5hdmlnYXRpb24gY29udHJvbHMgcmVtYWluIHZpc2libGUgYWxvbmdzaWRlIHRoaXMgY29udHJvbC5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50VGl0bGVCYXJTdGF0dXNXaWRnZXQgZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2R5bmFtaWNEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0LyoqIFRoZSBjdXJyZW50bHkgZGlzcGxheWVkIGluLXByb2dyZXNzIHNlc3Npb24gKGlmIGFueSkgLSBjbGlja2luZyBwaWxsIG9wZW5zIHRoaXMgKi9cblxuXHQvKiogQ2FjaGVkIHJlbmRlciBzdGF0ZSB0byBhdm9pZCB1bm5lY2Vzc2FyeSBET00gcmVidWlsZHMgKi9cblx0cHJpdmF0ZSBfbGFzdFJlbmRlclN0YXRlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIEd1YXJkIHRvIHByZXZlbnQgcmUtZW50cmFudCByZW5kZXJpbmcgKi9cblx0cHJpdmF0ZSBfaXNSZW5kZXJpbmcgPSBmYWxzZTtcblxuXHQvKiogUm92aW5nIHRhYmluZGV4IGVsZW1lbnRzIGZvciBrZXlib2FyZCBuYXZpZ2F0aW9uICovXG5cdHByaXZhdGUgX3JvdmluZ0VsZW1lbnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdHByaXZhdGUgX3JvdmluZ0luZGV4OiBudW1iZXIgPSAwO1xuXG5cdC8qKiBUcmFja3MgaWYgdGhpcyB3aW5kb3cgYXBwbGllZCBhIGJhZGdlIGZpbHRlciAodW5yZWFkL2luUHJvZ3Jlc3MpLCBzbyB3ZSBvbmx5IGF1dG8tY2xlYXIgb3VyIG93biBmaWx0ZXJzICovXG5cdC8vIFRPRE86IFRoaXMgaXMgaW1wZXJmZWN0LiBUYXJnZXR0ZWQgZml4IGZvciB2c2NvZGUjMjkwODYzLiBXZSBzaG91bGQgcmV2aXNpdCBzdG9yaW5nIGZpbHRlciBzdGF0ZSBwZXItd2luZG93IHRvIGF2b2lkIHRoaXNcblx0cHJpdmF0ZSBfYmFkZ2VGaWx0ZXJBcHBsaWVkQnlUaGlzV2luZG93OiAndW5yZWFkJyB8ICdpblByb2dyZXNzJyB8ICduZWVkc0lucHV0JyB8IG51bGwgPSBudWxsO1xuXG5cdC8qKiBSZXVzYWJsZSBtZW51IGZvciBDb21tYW5kQ2VudGVyQ2VudGVyIGl0ZW1zIChlLmcuLCBkZWJ1ZyB0b29sYmFyKSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kQ2VudGVyTWVudTtcblxuXHQvKiogTWVudSBmb3IgQ2hhdFRpdGxlQmFyTWVudSBpdGVtcyAoc2FtZSBhcyBjaGF0IGNvbnRyb2xzIGRyb3Bkb3duKSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0VGl0bGVCYXJNZW51O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aW5kb3dUaXRsZTogV2luZG93VGl0bGUsXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlOiBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElBZ2VudFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdC8vIENyZWF0ZSBtZW51IGZvciBDb21tYW5kQ2VudGVyQ2VudGVyIHRvIGdldCBpdGVtcyBsaWtlIGRlYnVnIHRvb2xiYXJcblx0XHR0aGlzLl9jb21tYW5kQ2VudGVyTWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuQ29tbWFuZENlbnRlckNlbnRlciwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIG1lbnUgZm9yIENoYXRUaXRsZUJhck1lbnUgdG8gc2hvdyBpbiBzcGFya2xlIHNlY3Rpb24gZHJvcGRvd25cblx0XHR0aGlzLl9jaGF0VGl0bGVCYXJNZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBjb250cm9sIG1vZGUgb3Igc2Vzc2lvbiBpbmZvIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLm9uRGlkQ2hhbmdlTW9kZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbkluZm8oKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gc2Vzc2lvbnMgY2hhbmdlIHRvIHVwZGF0ZSBzdGF0aXN0aWNzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIHdpbmRvdyB0aXRsZSBjaGFuZ2VzIChob25vcnMgdXNlcidzIHdpbmRvdy50aXRsZSBzZXR0aW5nKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dpbmRvd1RpdGxlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIGFjdGl2ZSBlZGl0b3IgY2hhbmdlcyAoZm9yIGZpbGUgbmFtZSBkaXNwbGF5IHdoZW4gdGFicyBhcmUgaGlkZGVuKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB0YWJzIHZpc2liaWxpdHkgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKCh7IG5ld1BhcnRPcHRpb25zLCBvbGRQYXJ0T3B0aW9ucyB9KSA9PiB7XG5cdFx0XHRpZiAobmV3UGFydE9wdGlvbnMuc2hvd1RhYnMgIT09IG9sZFBhcnRPcHRpb25zLnNob3dUYWJzKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIGNvbW1hbmQgY2VudGVyIG1lbnUgY2hhbmdlcyAoZS5nLiwgZGVidWcgdG9vbGJhciB2aXNpYmlsaXR5KVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1hbmRDZW50ZXJNZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2xhc3RSZW5kZXJTdGF0ZSA9IHVuZGVmaW5lZDsgLy8gRm9yY2UgcmUtcmVuZGVyXG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBzdG9yYWdlIGNoYW5nZXMgKGUuZy4sIGZpbHRlciBzdGF0ZSBjaGFuZ2VzIGZyb20gc2Vzc2lvbnMgdmlldylcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdhZ2VudFNlc3Npb25zLmZpbHRlckV4Y2x1ZGVzLmFnZW50c2Vzc2lvbnN2aWV3ZXJmaWx0ZXJzdWJtZW51JywgdGhpcy5fc3RvcmUpKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIFplbiBtb2RlIHRvZ2dsZXMsIHRvIGhpZGUgYWxsIGFnZW50IGRpc3RyYWN0aW9uc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUobmV3IFNldChbSW5FZGl0b3JaZW5Nb2RlQ29udGV4dC5rZXldKSkpIHtcblx0XHRcdFx0dGhpcy5fbGFzdFJlbmRlclN0YXRlID0gdW5kZWZpbmVkOyAvLyBGb3JjZSByZS1yZW5kZXJcblx0XHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gc2V0dGluZ3MgY2hhbmdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRTdGF0dXNFbmFibGVkKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlVuaWZpZWRBZ2VudHNCYXIpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2Rpc2FibGVBSUN1c3RvbWl6YXRpb25zJylcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmRpc2FibGVBSUN1c3RvbWl6YXRpb25zJylcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSB1bmRlZmluZWQ7IC8vIEZvcmNlIHJlLXJlbmRlclxuXHRcdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBjaGF0IGVudGl0bGVtZW50IG9yIHF1b3RhIGNoYW5nZXMgKGZvciBzaWduLWluIC8gcXVvdGEgZXhjZWVkZWQgc3RhdGVzKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50VXRpbHMuYW55KFxuXHRcdFx0dGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50LFxuXHRcdFx0dGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFFeGNlZWRlZCxcblx0XHRcdHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50LFxuXHRcdFx0dGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQW5vbnltb3VzXG5cdFx0KSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSB1bmRlZmluZWQ7IC8vIEZvcmNlIHJlLXJlbmRlclxuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gY2hhdCB3aWRnZXRzIGFyZSBhZGRlZCBvciBiYWNrZ3JvdW5kZWQgdG8gdXBkYXRlIGFjdGl2ZS91bnJlYWQgc2Vzc2lvbiBjb3VudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQWRkV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRCYWNrZ3JvdW5kU2Vzc2lvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc3RhdHVzLWNvbnRhaW5lcicpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAndG9vbGJhcicpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYWdlbnRTdGF0dXNUb29sYmFyTGFiZWwnLCBcIkFnZW50IFN0YXR1c1wiKSk7XG5cdFx0Ly8gQ29udGFpbmVyIHNob3VsZCBub3QgYmUgZm9jdXNhYmxlIC0gaW5uZXIgZWxlbWVudHMgaGFuZGxlIGZvY3VzXG5cdFx0Y29udGFpbmVyLnRhYkluZGV4ID0gLTE7XG5cblx0XHQvLyBJbml0aWFsIHJlbmRlclxuXHRcdHRoaXMuX3JlbmRlcigpO1xuXHR9XG5cblx0Ly8gT3ZlcnJpZGUgZm9jdXMgbWV0aG9kcyAtIHRoZSBjb250YWluZXIgaXRzZWxmIHNob3VsZG4ndCBiZSBmb2N1c2FibGUsXG5cdC8vIGZvY3VzIGlzIGhhbmRsZWQgYnkgdGhlIGlubmVyIGludGVyYWN0aXZlIGVsZW1lbnRzIChiYWRnZSBzZWN0aW9ucylcblx0b3ZlcnJpZGUgc2V0Rm9jdXNhYmxlKF9mb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBEb24ndCBzZXQgZm9jdXNhYmxlIG9uIHRoZSBjb250YWluZXJcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzW3RoaXMuX3JvdmluZ0luZGV4XT8uZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGJsdXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKGlzSFRNTEVsZW1lbnQoYWN0aXZlRWxlbWVudCkgJiYgdGhpcy5fY29udGFpbmVyLmNvbnRhaW5zKGFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRhY3RpdmVFbGVtZW50LmJsdXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNSZW5kZXJpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNSZW5kZXJpbmcgPSB0cnVlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIENvbXB1dGUgY3VycmVudCByZW5kZXIgc3RhdGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgRE9NIHJlYnVpbGRzXG5cdFx0XHRjb25zdCBtb2RlID0gdGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5tb2RlO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLnNlc3Npb25JbmZvO1xuXHRcdFx0Y29uc3QgeyBhY3RpdmVTZXNzaW9ucywgdW5yZWFkU2Vzc2lvbnMsIGF0dGVudGlvbk5lZWRlZFNlc3Npb25zIH0gPSB0aGlzLl9nZXRTZXNzaW9uU3RhdHMoKTtcblxuXHRcdFx0Ly8gR2V0IGF0dGVudGlvbiBzZXNzaW9uIGluZm8gZm9yIHN0YXRlIGNvbXB1dGF0aW9uXG5cdFx0XHRjb25zdCBhdHRlbnRpb25TZXNzaW9uID0gYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IFsuLi5hdHRlbnRpb25OZWVkZWRTZXNzaW9uc10uc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRpbWVBID0gYS50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IGEudGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHRcdFx0Y29uc3QgdGltZUIgPSBiLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQgPz8gYi50aW1pbmcuY3JlYXRlZDtcblx0XHRcdFx0XHRyZXR1cm4gdGltZUIgLSB0aW1lQTtcblx0XHRcdFx0fSlbMF1cblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGF0dGVudGlvblRleHQgPSBhdHRlbnRpb25TZXNzaW9uPy5kZXNjcmlwdGlvblxuXHRcdFx0XHQ/ICh0eXBlb2YgYXR0ZW50aW9uU2Vzc2lvbi5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQ/IGF0dGVudGlvblNlc3Npb24uZGVzY3JpcHRpb25cblx0XHRcdFx0XHQ6IHJlbmRlckFzUGxhaW50ZXh0KGF0dGVudGlvblNlc3Npb24uZGVzY3JpcHRpb24pKVxuXHRcdFx0XHQ6IGF0dGVudGlvblNlc3Npb24/LmxhYmVsO1xuXG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX2dldExhYmVsKCk7XG5cblx0XHRcdC8vIEdldCBjdXJyZW50IGZpbHRlciBzdGF0ZSBmb3Igc3RhdGUga2V5XG5cdFx0XHRjb25zdCB7IGlzRmlsdGVyZWRUb1VucmVhZCwgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzcywgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCB9ID0gdGhpcy5fZ2V0Q3VycmVudEZpbHRlclN0YXRlKCk7XG5cblx0XHRcdGNvbnN0IHN0YXR1c01vZGUgPSBnZXRBZ2VudFN0YXR1c1NldHRpbmdNb2RlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdW5pZmllZEFnZW50c0JhckVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlVuaWZpZWRBZ2VudHNCYXIpID09PSB0cnVlO1xuXHRcdFx0Y29uc3Qgdmlld1Nlc3Npb25zRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQpICE9PSBmYWxzZTtcblxuXHRcdFx0Ly8gQnVpbGQgc3RhdGUga2V5IGZvciBjb21wYXJpc29uXG5cdFx0XHRjb25zdCBzdGF0ZUtleSA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0bW9kZSxcblx0XHRcdFx0c2Vzc2lvblRpdGxlOiBzZXNzaW9uSW5mbz8udGl0bGUsXG5cdFx0XHRcdGFjdGl2ZUNvdW50OiBhY3RpdmVTZXNzaW9ucy5sZW5ndGgsXG5cdFx0XHRcdHVucmVhZENvdW50OiB1bnJlYWRTZXNzaW9ucy5sZW5ndGgsXG5cdFx0XHRcdGF0dGVudGlvbkNvdW50OiBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucy5sZW5ndGgsXG5cdFx0XHRcdGF0dGVudGlvblRleHQsXG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRpc0ZpbHRlcmVkVG9VbnJlYWQsXG5cdFx0XHRcdGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3MsXG5cdFx0XHRcdGlzRmlsdGVyZWRUb05lZWRzSW5wdXQsXG5cdFx0XHRcdHN0YXR1c01vZGUsXG5cdFx0XHRcdHVuaWZpZWRBZ2VudHNCYXJFbmFibGVkLFxuXHRcdFx0XHR2aWV3U2Vzc2lvbnNFbmFibGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNraXAgcmUtcmVuZGVyIGlmIHN0YXRlIGhhc24ndCBjaGFuZ2VkXG5cdFx0XHRpZiAodGhpcy5fbGFzdFJlbmRlclN0YXRlID09PSBzdGF0ZUtleSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSBzdGF0ZUtleTtcblxuXHRcdFx0Ly8gQ2xlYXIgZXhpc3RpbmcgY29udGVudFxuXHRcdFx0cmVzZXQodGhpcy5fY29udGFpbmVyKTtcblxuXHRcdFx0Ly8gQ2xlYXIgcHJldmlvdXMgZGlzcG9zYWJsZXMgYW5kIHJvdmluZyBlbGVtZW50cyBmb3IgZHluYW1pYyBjb250ZW50XG5cdFx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzID0gW107XG5cblx0XHRcdGlmICh0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLm1vZGUgPT09IEFnZW50U3RhdHVzTW9kZS5TZXNzaW9uKSB7XG5cdFx0XHRcdC8vIEFnZW50IFNlc3Npb24gUHJvamVjdGlvbiBtb2RlIC0gc2hvdyBzZXNzaW9uIHRpdGxlICsgY2xvc2UgYnV0dG9uXG5cdFx0XHRcdHRoaXMuX3JlbmRlclNlc3Npb25Nb2RlKHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcyk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UubW9kZSA9PT0gQWdlbnRTdGF0dXNNb2RlLlNlc3Npb25SZWFkeSkge1xuXHRcdFx0XHQvLyBTZXNzaW9uIHJlYWR5IG1vZGUgLSBzaG93IHNlc3Npb24gdGl0bGUgKyBlbnRlciBwcm9qZWN0aW9uIGJ1dHRvblxuXHRcdFx0XHR0aGlzLl9yZW5kZXJTZXNzaW9uUmVhZHlNb2RlKHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcyk7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1c01vZGUgPT09ICdjb21wYWN0Jykge1xuXHRcdFx0XHQvLyBDb21wYWN0IG1vZGUgLSByZXBsYWNlIGNvbW1hbmQgY2VudGVyIHNlYXJjaCB3aXRoIGludGVncmF0ZWQgY29udHJvbFxuXHRcdFx0XHR0aGlzLl9yZW5kZXJDaGF0SW5wdXRNb2RlKHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcyk7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1c01vZGUgPT09ICdiYWRnZScpIHtcblx0XHRcdFx0Ly8gQmFkZ2UgbW9kZSAtIHJlbmRlciBzdGF0dXMgYmFkZ2UgbmV4dCB0byBjb21tYW5kIGNlbnRlciBzZWFyY2hcblx0XHRcdFx0dGhpcy5fcmVuZGVyU3RhdHVzQmFkZ2UodGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLCBhY3RpdmVTZXNzaW9ucywgdW5yZWFkU2Vzc2lvbnMsIGF0dGVudGlvbk5lZWRlZFNlc3Npb25zKTtcblx0XHRcdH1cblx0XHRcdC8vIEhpZGRlbiBtb2RlIGludGVudGlvbmFsbHkgcmVuZGVycyBub3RoaW5nLlxuXG5cdFx0XHQvLyBTZXR1cCByb3ZpbmcgdGFiaW5kZXggZm9yIGtleWJvYXJkIG5hdmlnYXRpb25cblx0XHRcdHRoaXMuX3NldHVwUm92aW5nVGFiSW5kZXgodGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNSZW5kZXJpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2V0dXAgcm92aW5nIHRhYmluZGV4IGZvciBhcnJvdyBrZXkgbmF2aWdhdGlvbiBiZXR3ZWVuIGludGVyYWN0aXZlIGVsZW1lbnRzLlxuXHQgKiBVc2VzIHRoZSBlbGVtZW50cyByZWdpc3RlcmVkIGluIGB0aGlzLl9yb3ZpbmdFbGVtZW50c2AgaW4gdGhlaXIgZXhpc3Rpbmcgb3JkZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXR1cFJvdmluZ1RhYkluZGV4KGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lciB8fCB0aGlzLl9yb3ZpbmdFbGVtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcm92aW5nSW5kZXggPj0gdGhpcy5fcm92aW5nRWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9yb3ZpbmdJbmRleCA9IDA7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcm92aW5nRWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzW2ldLnRhYkluZGV4ID0gaSA9PT0gdGhpcy5fcm92aW5nSW5kZXggPyAwIDogLTE7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcm92aW5nRWxlbWVudHMuZmluZEluZGV4KGVsID0+IGVsID09PSBlLnRhcmdldCB8fCBlbC5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSk7XG5cdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dEluZGV4ID0gdGhpcy5fZ2V0TmV4dFJvdmluZ0luZGV4KGluZGV4LCBlLmtleSk7XG5cdFx0XHRpZiAobmV4dEluZGV4ICE9PSB1bmRlZmluZWQgJiYgbmV4dEluZGV4ICE9PSBpbmRleCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX21vdmVSb3ZpbmdGb2N1cyhpbmRleCwgbmV4dEluZGV4KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogTW92ZXMgcm92aW5nIGZvY3VzIGZyb20gYGN1cnJlbnRJbmRleGAgdG8gYG5leHRJbmRleGAsIHVwZGF0aW5nIHRhYkluZGV4IGFuZCBmb2N1c2luZyB0aGUgZWxlbWVudC5cblx0ICovXG5cdHByaXZhdGUgX21vdmVSb3ZpbmdGb2N1cyhjdXJyZW50SW5kZXg6IG51bWJlciwgbmV4dEluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yb3ZpbmdFbGVtZW50c1tjdXJyZW50SW5kZXhdLnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy5fcm92aW5nRWxlbWVudHNbbmV4dEluZGV4XS50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fcm92aW5nRWxlbWVudHNbbmV4dEluZGV4XS5mb2N1cygpO1xuXHRcdHRoaXMuX3JvdmluZ0luZGV4ID0gbmV4dEluZGV4O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG5leHQgcm92aW5nIGluZGV4IGZvciB0aGUgZ2l2ZW4ga2V5LCBvciBgdW5kZWZpbmVkYCBpZiBubyBuYXZpZ2F0aW9uIHNob3VsZCBvY2N1ci5cblx0ICovXG5cdHByaXZhdGUgX2dldE5leHRSb3ZpbmdJbmRleChjdXJyZW50SW5kZXg6IG51bWJlciwga2V5OiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxlbiA9IHRoaXMuX3JvdmluZ0VsZW1lbnRzLmxlbmd0aDtcblx0XHRzd2l0Y2ggKGtleSkge1xuXHRcdFx0Y2FzZSAnQXJyb3dSaWdodCc6IHJldHVybiAoY3VycmVudEluZGV4ICsgMSkgJSBsZW47XG5cdFx0XHRjYXNlICdBcnJvd0xlZnQnOiByZXR1cm4gKGN1cnJlbnRJbmRleCAtIDEgKyBsZW4pICUgbGVuO1xuXHRcdFx0Y2FzZSAnSG9tZSc6IHJldHVybiAwO1xuXHRcdFx0Y2FzZSAnRW5kJzogcmV0dXJuIGxlbiAtIDE7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8vICNyZWdpb24gU2Vzc2lvbiBTdGF0aXN0aWNzXG5cblx0LyoqXG5cdCAqIEdldCBjb21wdXRlZCBzZXNzaW9uIHN0YXRpc3RpY3MgZm9yIHJlbmRlcmluZy5cblx0ICogUmVzcGVjdHMgdGhlIGN1cnJlbnQgcHJvdmlkZXIgKHNlc3Npb24gdHlwZSkgZmlsdGVyIHdoZW4gY2FsY3VsYXRpbmcgY291bnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvblN0YXRzKCk6IHtcblx0XHRhY3RpdmVTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdO1xuXHRcdHVucmVhZFNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW107XG5cdFx0YXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXTtcblx0XHRoYXNBY3RpdmVTZXNzaW9uczogYm9vbGVhbjtcblx0XHRoYXNVbnJlYWRTZXNzaW9uczogYm9vbGVhbjtcblx0XHRoYXNBdHRlbnRpb25OZWVkZWQ6IGJvb2xlYW47XG5cdH0ge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucztcblxuXHRcdC8vIEdldCBleGNsdWRlZCBwcm92aWRlcnMgZnJvbSBjdXJyZW50IGZpbHRlciB0byByZXNwZWN0IHNlc3Npb24gdHlwZSBmaWx0ZXJzXG5cdFx0Y29uc3QgY3VycmVudEZpbHRlciA9IHRoaXMuX2dldFN0b3JlZEZpbHRlcigpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkUHJvdmlkZXJzID0gY3VycmVudEZpbHRlcj8ucHJvdmlkZXJzID8/IFtdO1xuXG5cdFx0Ly8gRmlsdGVyIHNlc3Npb25zIGJ5IHByb3ZpZGVyIHR5cGUgZmlyc3QgKHJlc3BlY3RzIHNlc3Npb24gdHlwZSBmaWx0ZXJzKVxuXHRcdGNvbnN0IGZpbHRlcmVkU2Vzc2lvbnMgPSBleGNsdWRlZFByb3ZpZGVycy5sZW5ndGggPiAwXG5cdFx0XHQ/IHNlc3Npb25zLmZpbHRlcihzID0+ICFleGNsdWRlZFByb3ZpZGVycy5pbmNsdWRlcyhzLnByb3ZpZGVyVHlwZSkpXG5cdFx0XHQ6IHNlc3Npb25zO1xuXG5cdFx0Ly8gQWN0aXZlIHNlc3Npb25zIGluY2x1ZGUgYm90aCBJblByb2dyZXNzIGFuZCBOZWVkc0lucHV0XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbnMgPSBmaWx0ZXJlZFNlc3Npb25zLmZpbHRlcihzID0+IGlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXMocy5zdGF0dXMpICYmICFzLmlzQXJjaGl2ZWQoKSk7XG5cdFx0Y29uc3QgdW5yZWFkU2Vzc2lvbnMgPSBmaWx0ZXJlZFNlc3Npb25zLmZpbHRlcihzID0+ICFzLmlzUmVhZCgpKTtcblx0XHQvLyBTZXNzaW9ucyB0aGF0IG5lZWQgdXNlciBpbnB1dC9hdHRlbnRpb24gKHN1YnNldCBvZiBhY3RpdmUpXG5cdFx0Y29uc3QgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMgPSBmaWx0ZXJlZFNlc3Npb25zLmZpbHRlcihzID0+IHMuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCAmJiAhdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzLnJlc291cmNlKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0YWN0aXZlU2Vzc2lvbnMsXG5cdFx0XHR1bnJlYWRTZXNzaW9ucyxcblx0XHRcdGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLFxuXHRcdFx0aGFzQWN0aXZlU2Vzc2lvbnM6IGFjdGl2ZVNlc3Npb25zLmxlbmd0aCA+IDAsXG5cdFx0XHRoYXNVbnJlYWRTZXNzaW9uczogdW5yZWFkU2Vzc2lvbnMubGVuZ3RoID4gMCxcblx0XHRcdGhhc0F0dGVudGlvbk5lZWRlZDogYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMubGVuZ3RoID4gMCxcblx0XHR9O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gTW9kZSBSZW5kZXJlcnNcblxuXHRwcml2YXRlIF9yZW5kZXJDaGF0SW5wdXRNb2RlKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgYWN0aXZlU2Vzc2lvbnMsIHVucmVhZFNlc3Npb25zLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucywgaGFzQXR0ZW50aW9uTmVlZGVkIH0gPSB0aGlzLl9nZXRTZXNzaW9uU3RhdHMoKTtcblxuXHRcdC8vIENyZWF0ZSBwaWxsXG5cdFx0Y29uc3QgcGlsbCA9ICQoJ2Rpdi5hZ2VudC1zdGF0dXMtcGlsbC5jaGF0LWlucHV0LW1vZGUnKTtcblx0XHRpZiAoaGFzQXR0ZW50aW9uTmVlZGVkKSB7XG5cdFx0XHRwaWxsLmNsYXNzTGlzdC5hZGQoJ25lZWRzLWF0dGVudGlvbicpO1xuXHRcdH1cblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQocGlsbCk7XG5cblx0XHQvLyBSZW5kZXIgY29tbWFuZCBjZW50ZXIgaXRlbXMgKGxpa2UgZGVidWcgdG9vbGJhcikgaW5zaWRlIHRoZSBwaWxsXG5cdFx0dGhpcy5fcmVuZGVyQ29tbWFuZENlbnRlclRvb2xiYXIoZGlzcG9zYWJsZXMsIHBpbGwpO1xuXG5cdFx0Ly8gQ29tcGFjdCBtb2RlIGlzIGFsd2F5cyB0cnVlIHdoZW4gcmVuZGVyaW5nIGNoYXQgaW5wdXQgbW9kZSAoY2FsbGVyIGFscmVhZHkgY2hlY2tlZCBmb3IgY29tcGFjdClcblx0XHRjb25zdCBpc0NvbXBhY3RNb2RlID0gdHJ1ZTtcblx0XHRwaWxsLmNsYXNzTGlzdC50b2dnbGUoJ2NvbXBhY3QtbW9kZScsIGlzQ29tcGFjdE1vZGUpO1xuXG5cdFx0Ly8gTGVmdCBpY29uIGNvbnRhaW5lciAoc3BhcmtsZSBieSBkZWZhdWx0LCByZXBvcnQrY291bnQgd2hlbiBhdHRlbnRpb24gbmVlZGVkLCBzZWFyY2ggb24gaG92ZXIpXG5cdFx0Y29uc3QgbGVmdEljb24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1sZWZ0LWljb24nKTtcblx0XHRpZiAoaGFzQXR0ZW50aW9uTmVlZGVkKSB7XG5cdFx0XHQvLyBTaG93IHJlcG9ydCBpY29uICsgY291bnQgd2hlbiBzZXNzaW9ucyBuZWVkIGF0dGVudGlvblxuXHRcdFx0Y29uc3QgcmVwb3J0SWNvbiA9IHJlbmRlckljb24oQ29kaWNvbi5yZXBvcnQpO1xuXHRcdFx0Y29uc3QgY291bnRTcGFuID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtYXR0ZW50aW9uLWNvdW50Jyk7XG5cdFx0XHRjb3VudFNwYW4udGV4dENvbnRlbnQgPSBTdHJpbmcoYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMubGVuZ3RoKTtcblx0XHRcdHJlc2V0KGxlZnRJY29uLCByZXBvcnRJY29uLCBjb3VudFNwYW4pO1xuXHRcdFx0bGVmdEljb24uY2xhc3NMaXN0LmFkZCgnaGFzLWF0dGVudGlvbicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNldChsZWZ0SWNvbiwgcmVuZGVySWNvbihDb2RpY29uLnNlYXJjaFNwYXJrbGUpKTtcblx0XHR9XG5cdFx0aWYgKCFpc0NvbXBhY3RNb2RlKSB7XG5cdFx0XHRwaWxsLmFwcGVuZENoaWxkKGxlZnRJY29uKTtcblx0XHR9XG5cblx0XHQvLyBJbnB1dCBhcmVhIHdyYXBwZXIgLSBob3ZlciBvbmx5IGFjdGl2YXRlcyBoZXJlLCBub3Qgb24gYmFkZ2Ugc2VjdGlvbnNcblx0XHRjb25zdCBpbnB1dEFyZWEgPSAkKCdkaXYuYWdlbnQtc3RhdHVzLWlucHV0LWFyZWEnKTtcblx0XHRpbnB1dEFyZWEuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGlucHV0QXJlYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnb3BlblF1aWNrQWNjZXNzJywgXCJPcGVuIFF1aWNrIEFjY2Vzc1wiKSk7XG5cdFx0aW5wdXRBcmVhLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9yb3ZpbmdFbGVtZW50cy5wdXNoKGlucHV0QXJlYSk7XG5cdFx0cGlsbC5hcHBlbmRDaGlsZChpbnB1dEFyZWEpO1xuXG5cdFx0Ly8gTGFiZWwgLSBhbHdheXMgc2hvd3Mgd29ya3NwYWNlIG5hbWUgaW4gY29tcGFjdCBtb2RlXG5cdFx0Y29uc3QgbGFiZWwgPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1sYWJlbCcpO1xuXHRcdGNvbnN0IHsgcHJvZ3Jlc3M6IHByb2dyZXNzVGV4dCB9ID0gdGhpcy5fZ2V0U2Vzc2lvbk5lZWRpbmdBdHRlbnRpb24oYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMpO1xuXHRcdGNvbnN0IGRlZmF1bHRMYWJlbCA9IGlzQ29tcGFjdE1vZGUgPyB0aGlzLl9nZXRMYWJlbCgpIDogKHByb2dyZXNzVGV4dCA/PyB0aGlzLl9nZXRMYWJlbCgpKTtcblxuXHRcdGlmICghaXNDb21wYWN0TW9kZSAmJiBwcm9ncmVzc1RleHQpIHtcblx0XHRcdGxhYmVsLmNsYXNzTGlzdC5hZGQoJ2hhcy1wcm9ncmVzcycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVyTGFiZWwgPSBsb2NhbGl6ZSgnYXNrQW55dGhpbmdQbGFjZWhvbGRlcicsIFwiQXNrIGFueXRoaW5nIG9yIGRlc2NyaWJlIHdoYXQgdG8gYnVpbGRcIik7XG5cblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGRlZmF1bHRMYWJlbDtcblx0XHRpbnB1dEFyZWEuYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG5cdFx0aWYgKGlzQ29tcGFjdE1vZGUpIHtcblx0XHRcdC8vIENvbXBhY3QgbW9kZTogaG92ZXIgcmVzZXRzIGljb24gc3RhdGUgYnV0IGtlZXBzIHdvcmtzcGFjZSBuYW1lXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0QXJlYSwgRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB7XG5cdFx0XHRcdHJlc2V0KGxlZnRJY29uLCByZW5kZXJJY29uKENvZGljb24uc2VhcmNoU3BhcmtsZSkpO1xuXHRcdFx0XHRsZWZ0SWNvbi5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtYXR0ZW50aW9uJyk7XG5cdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy1wcm9ncmVzcycpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0QXJlYSwgRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoKSA9PiB7XG5cdFx0XHRcdHJlc2V0KGxlZnRJY29uLCByZW5kZXJJY29uKENvZGljb24uc2VhcmNoU3BhcmtsZSkpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTZW5kIGljb24gKGhpZGRlbiBieSBkZWZhdWx0LCBzaG93biBvbiBob3ZlciAtIG9ubHkgd2hlbiBub3Qgc2hvd2luZyBhdHRlbnRpb24gbWVzc2FnZSlcblx0XHRcdGNvbnN0IHNlbmRJY29uID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtc2VuZCcpO1xuXHRcdFx0cmVzZXQoc2VuZEljb24sIHJlbmRlckljb24oQ29kaWNvbi5zZW5kKSk7XG5cdFx0XHRzZW5kSWNvbi5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdGlucHV0QXJlYS5hcHBlbmRDaGlsZChzZW5kSWNvbik7XG5cblx0XHRcdC8vIEhvdmVyIGJlaGF2aW9yIC0gc3dhcCBpY29uIGFuZCBsYWJlbCAob25seSB3aGVuIHNob3dpbmcgZGVmYXVsdCBzdGF0ZSkuXG5cdFx0XHRpZiAoIXByb2dyZXNzVGV4dCkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0QXJlYSwgRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzZXQobGVmdEljb24sIHJlbmRlckljb24oQ29kaWNvbi5zZWFyY2hTcGFya2xlKSk7XG5cdFx0XHRcdFx0bGVmdEljb24uY2xhc3NMaXN0LnJlbW92ZSgnaGFzLWF0dGVudGlvbicpO1xuXHRcdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gaG92ZXJMYWJlbDtcblx0XHRcdFx0XHRsYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtcHJvZ3Jlc3MnKTtcblx0XHRcdFx0XHRzZW5kSWNvbi5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRBcmVhLCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdFx0XHRyZXNldChsZWZ0SWNvbiwgcmVuZGVySWNvbihDb2RpY29uLnNlYXJjaFNwYXJrbGUpKTtcblx0XHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGRlZmF1bHRMYWJlbDtcblx0XHRcdFx0XHRzZW5kSWNvbi5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNldHVwIGhvdmVyIHRvb2x0aXAgb24gaW5wdXQgYXJlYVxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgaW5wdXRBcmVhLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYkZvclRvb2x0aXAgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoVU5JRklFRF9RVUlDS19BQ0NFU1NfQUNUSU9OX0lEKT8uZ2V0TGFiZWwoKTtcblx0XHRcdHJldHVybiBrYkZvclRvb2x0aXBcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYXNrVG9vbHRpcCcsIFwiT3BlbiBRdWljayBBY2Nlc3MgKHswfSlcIiwga2JGb3JUb29sdGlwKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhc2tUb29sdGlwMicsIFwiT3BlbiBRdWljayBBY2Nlc3NcIik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlciAtIGFsd2F5cyBvcGVuIHF1aWNrIGFjY2VzcyBpbiBjb21wYWN0IG1vZGUgKGF0dGVudGlvbiBzZXNzaW9ucyBhcmUgaGFuZGxlZCBieSB0aGUgYmFkZ2UpXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEFyZWEsIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZ2VudFN0YXR1c0NsaWNrRXZlbnQsIEFnZW50U3RhdHVzQ2xpY2tDbGFzc2lmaWNhdGlvbj4oJ2FnZW50U3RhdHVzV2lkZ2V0LmNsaWNrJywge1xuXHRcdFx0XHRzb3VyY2U6ICdwaWxsJyxcblx0XHRcdFx0YWN0aW9uOiAncXVpY2tBY2Nlc3MnLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB1c2VVbmlmaWVkUXVpY2tBY2Nlc3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlVuaWZpZWRBZ2VudHNCYXIpID09PSB0cnVlO1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh1c2VVbmlmaWVkUXVpY2tBY2Nlc3MgPyBVTklGSUVEX1FVSUNLX0FDQ0VTU19BQ1RJT05fSUQgOiBRVUlDS19PUEVOX0FDVElPTl9JRCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgaGFuZGxlclxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRBcmVhLCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFnZW50U3RhdHVzQ2xpY2tFdmVudCwgQWdlbnRTdGF0dXNDbGlja0NsYXNzaWZpY2F0aW9uPignYWdlbnRTdGF0dXNXaWRnZXQuY2xpY2snLCB7XG5cdFx0XHRcdFx0c291cmNlOiAncGlsbCcsXG5cdFx0XHRcdFx0YWN0aW9uOiAncXVpY2tBY2Nlc3MnLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgdXNlVW5pZmllZFF1aWNrQWNjZXNzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5VbmlmaWVkQWdlbnRzQmFyKSA9PT0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh1c2VVbmlmaWVkUXVpY2tBY2Nlc3MgPyBVTklGSUVEX1FVSUNLX0FDQ0VTU19BQ1RJT05fSUQgOiBRVUlDS19PUEVOX0FDVElPTl9JRCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW4gY29tcGFjdCBtb2RlLCByZW5kZXIgc3RhdHVzIGJhZGdlIGlubGluZSB3aXRoaW4gdGhlIHBpbGxcblx0XHR0aGlzLl9yZW5kZXJTdGF0dXNCYWRnZShkaXNwb3NhYmxlcywgYWN0aXZlU2Vzc2lvbnMsIHVucmVhZFNlc3Npb25zLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucywgcGlsbCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTZXNzaW9uTW9kZShkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFjdGl2ZVNlc3Npb25zLCB1bnJlYWRTZXNzaW9ucywgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMgfSA9IHRoaXMuX2dldFNlc3Npb25TdGF0cygpO1xuXG5cdFx0Ly8gUmVuZGVyIGNvbW1hbmQgY2VudGVyIGl0ZW1zIChsaWtlIGRlYnVnIHRvb2xiYXIpIEZJUlNUIC0gdG8gdGhlIGxlZnRcblx0XHR0aGlzLl9yZW5kZXJDb21tYW5kQ2VudGVyVG9vbGJhcihkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBwaWxsID0gJCgnZGl2LmFnZW50LXN0YXR1cy1waWxsLnNlc3Npb24tbW9kZScpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZChwaWxsKTtcblxuXHRcdC8vIFNlYXJjaCBidXR0b24gKGxlZnQgc2lkZSwgaW5zaWRlIHBpbGwpXG5cdFx0dGhpcy5fcmVuZGVyU2VhcmNoQnV0dG9uKGRpc3Bvc2FibGVzLCBwaWxsKTtcblxuXHRcdC8vIFNlc3Npb24gdGl0bGUgKGNlbnRlcilcblx0XHRjb25zdCB0aXRsZUxhYmVsID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtdGl0bGUnKTtcblx0XHRjb25zdCBzZXNzaW9uSW5mbyA9IHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2Uuc2Vzc2lvbkluZm87XG5cdFx0dGl0bGVMYWJlbC50ZXh0Q29udGVudCA9IHNlc3Npb25JbmZvPy50aXRsZSA/PyBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uUHJvamVjdGlvbicsIFwiQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uXCIpO1xuXHRcdHBpbGwuYXBwZW5kQ2hpbGQodGl0bGVMYWJlbCk7XG5cblx0XHQvLyBFc2NhcGUgYnV0dG9uIChyaWdodCBzaWRlKVxuXHRcdHRoaXMuX3JlbmRlckVzY2FwZUJ1dHRvbihkaXNwb3NhYmxlcywgcGlsbCk7XG5cblx0XHQvLyBTZXR1cCBwaWxsIGhvdmVyXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBwaWxsLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSW5mbyA9IHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2Uuc2Vzc2lvbkluZm87XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbkluZm8gPyBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uUHJvamVjdGlvblRvb2x0aXAnLCBcIkFnZW50IFNlc3Npb24gUHJvamVjdGlvbjogezB9XCIsIHNlc3Npb25JbmZvLnRpdGxlKSA6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25Qcm9qZWN0aW9uJywgXCJBZ2VudCBTZXNzaW9uIFByb2plY3Rpb25cIik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlciAtIGNsaWNraW5nIGFueXdoZXJlIG9uIGNvbnRhaW5lciBleGl0cyBwcm9qZWN0aW9uXG5cdFx0Y29uc3QgZXhpdEhhbmRsZXIgPSAoZTogRXZlbnQpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEV4aXRBZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9uLklEKTtcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocGlsbCwgRXZlbnRUeXBlLkNMSUNLLCBleGl0SGFuZGxlcikpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocGlsbCwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGV4aXRIYW5kbGVyKSk7XG5cblx0XHQvLyBTdGF0dXMgYmFkZ2UgKHNlcGFyYXRlIHJlY3RhbmdsZSBvbiByaWdodClcblx0XHR0aGlzLl9yZW5kZXJTdGF0dXNCYWRnZShkaXNwb3NhYmxlcywgYWN0aXZlU2Vzc2lvbnMsIHVucmVhZFNlc3Npb25zLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHNlc3Npb24gcmVhZHkgbW9kZSAtIHNob3dzIHNlc3Npb24gdGl0bGUgKyBlbnRlciBwcm9qZWN0aW9uIGJ1dHRvbi5cblx0ICogVXNlZCB3aGVuIGEgcHJvamVjdGlvbi1jYXBhYmxlIHNlc3Npb24gaXMgYXZhaWxhYmxlIGJ1dCBub3QgeWV0IGVudGVyZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJTZXNzaW9uUmVhZHlNb2RlKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgYWN0aXZlU2Vzc2lvbnMsIHVucmVhZFNlc3Npb25zLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucyB9ID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRzKCk7XG5cblx0XHRjb25zdCBwaWxsID0gJCgnZGl2LmFnZW50LXN0YXR1cy1waWxsLnNlc3Npb24tcmVhZHktbW9kZScpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZChwaWxsKTtcblxuXHRcdC8vIFNlc3Npb24gdGl0bGUgKGxlZnQgc2lkZSlcblx0XHRjb25zdCB0aXRsZUxhYmVsID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtdGl0bGUnKTtcblx0XHRjb25zdCBzZXNzaW9uSW5mbyA9IHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2Uuc2Vzc2lvbkluZm87XG5cdFx0dGl0bGVMYWJlbC50ZXh0Q29udGVudCA9IHNlc3Npb25JbmZvPy50aXRsZSA/PyBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uUmVhZHknLCBcIlJldmlldyBDaGFuZ2VzXCIpO1xuXHRcdHBpbGwuYXBwZW5kQ2hpbGQodGl0bGVMYWJlbCk7XG5cblx0XHQvLyBFbnRlciBidXR0b24gKHJpZ2h0IHNpZGUpXG5cdFx0dGhpcy5fcmVuZGVyRW50ZXJCdXR0b24oZGlzcG9zYWJsZXMsIHBpbGwpO1xuXG5cdFx0Ly8gU2V0dXAgcGlsbCBob3ZlclxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgcGlsbCwgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLnNlc3Npb25JbmZvO1xuXHRcdFx0cmV0dXJuIHNlc3Npb25JbmZvID8gbG9jYWxpemUoJ2FnZW50U2Vzc2lvblJlYWR5VG9vbHRpcCcsIFwiUmV2aWV3IGNoYW5nZXMgZnJvbTogezB9XCIsIHNlc3Npb25JbmZvLnRpdGxlKSA6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25SZWFkeUdlbmVyaWMnLCBcIlJldmlldyBhZ2VudCBzZXNzaW9uIGNoYW5nZXNcIik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlciAtIGNsaWNraW5nIGFueXdoZXJlIG9uIHBpbGwgZW50ZXJzIHByb2plY3Rpb25cblx0XHRjb25zdCBlbnRlckhhbmRsZXIgPSAoZTogRXZlbnQpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uSW5mbyA9IHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2Uuc2Vzc2lvbkluZm87XG5cdFx0XHRpZiAoc2Vzc2lvbkluZm8pIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uSW5mby5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRW50ZXJBZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9uLklELCBzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwaWxsLCBFdmVudFR5cGUuQ0xJQ0ssIGVudGVySGFuZGxlcikpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocGlsbCwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGVudGVySGFuZGxlcikpO1xuXG5cdFx0Ly8gU3RhdHVzIGJhZGdlIChzZXBhcmF0ZSByZWN0YW5nbGUgb24gcmlnaHQpXG5cdFx0dGhpcy5fcmVuZGVyU3RhdHVzQmFkZ2UoZGlzcG9zYWJsZXMsIGFjdGl2ZVNlc3Npb25zLCB1bnJlYWRTZXNzaW9ucywgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUmV1c2FibGUgQ29tcG9uZW50c1xuXG5cdC8qKlxuXHQgKiBSZW5kZXIgY29tbWFuZCBjZW50ZXIgdG9vbGJhciBpdGVtcyAobGlrZSBkZWJ1ZyB0b29sYmFyKSB0aGF0IGFyZSByZWdpc3RlcmVkIHRvIENvbW1hbmRDZW50ZXJcblx0ICogRmlsdGVycyBvdXQgdGhlIHF1aWNrIG9wZW4gYWN0aW9uIHNpbmNlIHdlIHByb3ZpZGUgb3VyIG93biBzZWFyY2ggVUkuXG5cdCAqIEFkZHMgYSBkb3Qgc2VwYXJhdG9yIGFmdGVyIHRoZSB0b29sYmFyIGlmIGNvbnRlbnQgd2FzIHJlbmRlcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyQ29tbWFuZENlbnRlclRvb2xiYXIoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgcGFyZW50PzogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSBwYXJlbnQgPz8gdGhpcy5fY29udGFpbmVyO1xuXHRcdGlmICghY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IG1lbnUgYWN0aW9ucyBmcm9tIENvbW1hbmRDZW50ZXJDZW50ZXIgKGUuZy4sIGRlYnVnIHRvb2xiYXIpXG5cdFx0Y29uc3QgYWxsQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbLCBhY3Rpb25zXSBvZiB0aGlzLl9jb21tYW5kQ2VudGVyTWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpIHtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0Ly8gRmlsdGVyIG91dCB0aGUgcXVpY2sgb3BlbiBhY3Rpb24gLSB3ZSBwcm92aWRlIG91ciBvd24gc2VhcmNoIFVJXG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IFFVSUNLX09QRU5fQUNUSU9OX0lEKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRm9yIHN1Ym1lbnVzIChsaWtlIGRlYnVnIHRvb2xiYXIpLCBhZGQgdGhlIHN1Ym1lbnUgYWN0aW9uc1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUFjdGlvbikge1xuXHRcdFx0XHRcdGFsbEFjdGlvbnMucHVzaCguLi5hY3Rpb24uYWN0aW9ucyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWxsQWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPbmx5IHJlbmRlciB0b29sYmFyIGlmIHRoZXJlIGFyZSBhY3Rpb25zXG5cdFx0aWYgKGFsbEFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSAkKCdkaXYuYWdlbnQtc3RhdHVzLWNvbW1hbmQtY2VudGVyLXRvb2xiYXInKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodG9vbGJhckNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0b29sYmFyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCB0b29sYmFyQ29udGFpbmVyLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdhZ2VudFN0YXR1c0NvbW1hbmRDZW50ZXInLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xiYXIpO1xuXG5cdFx0dG9vbGJhci5zZXRBY3Rpb25zKGFsbEFjdGlvbnMpO1xuXG5cdFx0Ly8gQWRkIHNlcGFyYXRvciBhZnRlciB0aGUgdG9vbGJhclxuXHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdC8vIEluc2lkZSBwaWxsIChjb21wYWN0IG1vZGUpOiB1c2UgYSB2ZXJ0aWNhbCBsaW5lIHNlcGFyYXRvclxuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtbGluZS1zZXBhcmF0b3InKTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzZXBhcmF0b3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBPdXRzaWRlIHBpbGw6IHVzZSBkb3Qgc2VwYXJhdG9yIChtYXRjaGluZyBjb21tYW5kIGNlbnRlciBzdHlsZSlcblx0XHRcdGNvbnN0IHNlcGFyYXRvciA9IHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGVTbWFsbEZpbGxlZCk7XG5cdFx0XHRzZXBhcmF0b3IuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc3RhdHVzLXNlcGFyYXRvcicpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHNlcGFyYXRvcik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgc2VhcmNoIGJ1dHRvbi4gSWYgcGFyZW50IGlzIHByb3ZpZGVkLCBhcHBlbmRzIHRvIHBhcmVudDsgb3RoZXJ3aXNlIGFwcGVuZHMgdG8gY29udGFpbmVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyU2VhcmNoQnV0dG9uKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHBhcmVudD86IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gcGFyZW50ID8/IHRoaXMuX2NvbnRhaW5lcjtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlYXJjaEJ1dHRvbiA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLXNlYXJjaCcpO1xuXHRcdHJlc2V0KHNlYXJjaEJ1dHRvbiwgcmVuZGVySWNvbihDb2RpY29uLnNlYXJjaFNwYXJrbGUpKTtcblx0XHRzZWFyY2hCdXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHNlYXJjaEJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnb3BlblF1aWNrT3BlbicsIFwiT3BlbiBRdWljayBPcGVuXCIpKTtcblx0XHRzZWFyY2hCdXR0b24udGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2goc2VhcmNoQnV0dG9uKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2VhcmNoQnV0dG9uKTtcblxuXHRcdC8vIFNldHVwIGhvdmVyXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHRcdGNvbnN0IHNlYXJjaEtiID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFFVSUNLX09QRU5fQUNUSU9OX0lEKT8uZ2V0TGFiZWwoKTtcblx0XHRjb25zdCBzZWFyY2hUb29sdGlwID0gc2VhcmNoS2Jcblx0XHRcdD8gbG9jYWxpemUoJ29wZW5RdWlja09wZW5Ub29sdGlwJywgXCJHbyB0byBGaWxlICh7MH0pXCIsIHNlYXJjaEtiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnb3BlblF1aWNrT3BlblRvb2x0aXAyJywgXCJHbyB0byBGaWxlXCIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBzZWFyY2hCdXR0b24sIHNlYXJjaFRvb2x0aXApKTtcblxuXHRcdC8vIENsaWNrIGhhbmRsZXJcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNlYXJjaEJ1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoUVVJQ0tfT1BFTl9BQ1RJT05fSUQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEtleWJvYXJkIGhhbmRsZXJcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNlYXJjaEJ1dHRvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFFVSUNLX09QRU5fQUNUSU9OX0lEKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBzdGF0dXMgYmFkZ2Ugc2hvd2luZyBpbi1wcm9ncmVzcywgbmVlZHMtaW5wdXQsIGFuZC9vciB1bnJlYWQgc2Vzc2lvbiBjb3VudHMuXG5cdCAqIFNob3dzIHNwbGl0IFVJIHdpdGggc3BhcmtsZSBpY29uIG9uIGxlZnQsIHRoZW4gdW5yZWFkLCBuZWVkcy1pbnB1dCwgYW5kIGFjdGl2ZSBpbmRpY2F0b3JzLlxuXHQgKiBBbHdheXMgcmVuZGVycyB0aGUgc3BhcmtsZSBpY29uIHNlY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJTdGF0dXNCYWRnZShkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBhY3RpdmVTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdLCB1bnJlYWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdLCBpbmxpbmVDb250YWluZXI/OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzQWN0aXZlU2Vzc2lvbnMgPSBhY3RpdmVTZXNzaW9ucy5sZW5ndGggPiAwO1xuXHRcdGNvbnN0IGhhc1VucmVhZFNlc3Npb25zID0gdW5yZWFkU2Vzc2lvbnMubGVuZ3RoID4gMDtcblx0XHRjb25zdCBoYXNBdHRlbnRpb25OZWVkZWQgPSBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucy5sZW5ndGggPiAwO1xuXG5cdFx0Ly8gQXV0by1jbGVhciBmaWx0ZXIgaWYgdGhlIGZpbHRlcmVkIGNhdGVnb3J5IGJlY29tZXMgZW1wdHkgaWYgdGhpcyB3aW5kb3cgYXBwbGllZCBpdFxuXHRcdHRoaXMuX2NsZWFyRmlsdGVySWZDYXRlZ29yeUVtcHR5KGhhc1VucmVhZFNlc3Npb25zLCBoYXNBY3RpdmVTZXNzaW9ucywgaGFzQXR0ZW50aW9uTmVlZGVkKTtcblxuXHRcdC8vIFdoZW4gaW5saW5lQ29udGFpbmVyIGlzIHByb3ZpZGVkLCByZW5kZXIgc2VjdGlvbnMgZGlyZWN0bHkgaW50byBpdCAoY29tcGFjdCBtb2RlKVxuXHRcdC8vIE90aGVyd2lzZSwgY3JlYXRlIGEgc2VwYXJhdGUgYmFkZ2UgY29udGFpbmVyXG5cdFx0bGV0IGJhZGdlOiBIVE1MRWxlbWVudDtcblx0XHRpZiAoaW5saW5lQ29udGFpbmVyKSB7XG5cdFx0XHRiYWRnZSA9IGlubGluZUNvbnRhaW5lcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFkZ2UgPSAkKCdkaXYuYWdlbnQtc3RhdHVzLWJhZGdlJyk7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQoYmFkZ2UpO1xuXHRcdH1cblxuXHRcdC8vIFNwYXJrbGUgZHJvcGRvd24gYnV0dG9uIHNlY3Rpb24gKGFsd2F5cyB2aXNpYmxlIG9uIGxlZnQpIC0gcHJvcGVyIGJ1dHRvbiB3aXRoIGRyb3Bkb3duIG1lbnVcblx0XHRjb25zdCBzcGFya2xlQ29udGFpbmVyID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtYmFkZ2Utc2VjdGlvbi5zcGFya2xlJyk7XG5cdFx0c3BhcmtsZUNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cblx0XHQvLyBHZXQgbWVudSBhY3Rpb25zIGZvciBkcm9wZG93biB3aXRoIHByb3BlciBncm91cCBzZXBhcmF0b3JzXG5cdFx0Y29uc3QgbWVudUFjdGlvbnM6IElBY3Rpb25bXSA9IFNlcGFyYXRvci5qb2luKC4uLnRoaXMuX2NoYXRUaXRsZUJhck1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLm1hcCgoWywgYWN0aW9uc10pID0+IGFjdGlvbnMpKTtcblxuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb25JZCA9IFRPR0dMRV9DSEFUX0FDVElPTl9JRDtcblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uVGl0bGUgPSBsb2NhbGl6ZSgndG9nZ2xlQ2hhdCcsIFwiVG9nZ2xlIENoYXRcIik7XG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbkljb24gPSBDb2RpY29uLmNoYXRTcGFya2xlO1xuXG5cdFx0Ly8gQ3JlYXRlIHByaW1hcnkgYWN0aW9uXG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUl0ZW1BY3Rpb24sIHtcblx0XHRcdGlkOiBwcmltYXJ5QWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogcHJpbWFyeUFjdGlvblRpdGxlLFxuXHRcdFx0aWNvbjogcHJpbWFyeUFjdGlvbkljb24sXG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIENyZWF0ZSBkcm9wZG93biBhY3Rpb24gKGVtcHR5IGxhYmVsIHByZXZlbnRzIGRlZmF1bHQgdG9vbHRpcCAtIHdlIGhhdmUgb3VyIG93biBob3Zlcilcblx0XHRjb25zdCBkcm9wZG93bkFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnYWdlbnRTdGF0dXMuc3BhcmtsZS5kcm9wZG93bicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50U3RhdHVzLnNwYXJrbGUuZHJvcGRvd24nLCBcIk1vcmUgQWN0aW9uc1wiKSxcblx0XHRcdHJ1bigpIHsgfVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBkcm9wZG93biB3aXRoIHByaW1hcnkgYWN0aW9uIGJ1dHRvblxuXHRcdGNvbnN0IHNwYXJrbGVEcm9wZG93biA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHREcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRwcmltYXJ5QWN0aW9uLFxuXHRcdFx0ZHJvcGRvd25BY3Rpb24sXG5cdFx0XHRtZW51QWN0aW9ucyxcblx0XHRcdCdhZ2VudC1zdGF0dXMtc3BhcmtsZS1kcm9wZG93bicsXG5cdFx0XHR7IHNraXBUZWxlbWV0cnk6IHRydWUsIG1lbnVDbGFzc05hbWU6IFdPUktCRU5DSF9NRU5VX01PVElPTl9DTEFTUywgY2xvc2VBbmltYXRpb246IHdvcmtiZW5jaE1lbnVDbG9zZUFuaW1hdGlvbiB9XG5cdFx0KTtcblx0XHRzcGFya2xlRHJvcGRvd24ucmVuZGVyKHNwYXJrbGVDb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzcGFya2xlRHJvcGRvd24pO1xuXG5cdFx0Ly8gQ2FwdHVyZS1waGFzZSBsaXN0ZW5lciBmb3IgQXJyb3dMZWZ0L0Fycm93UmlnaHQvSG9tZS9FbmQgdG8gcHJldmVudCBEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW1cblx0XHQvLyBmcm9tIGNvbnN1bWluZyB0aGVzZSBrZXlzIGludGVybmFsbHkuIFRoaXMgZW5zdXJlcyB0aGUgb3V0ZXIgcm92aW5nIHRhYmluZGV4IGhhbmRsZXMgbmF2aWdhdGlvbi5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNwYXJrbGVDb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0Fycm93TGVmdCcgfHwgZS5rZXkgPT09ICdBcnJvd1JpZ2h0JyB8fCBlLmtleSA9PT0gJ0hvbWUnIHx8IGUua2V5ID09PSAnRW5kJykge1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLl9yb3ZpbmdFbGVtZW50cy5pbmRleE9mKHNwYXJrbGVDb250YWluZXIpO1xuXHRcdFx0XHRpZiAoaWR4ID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuZXh0SW5kZXggPSB0aGlzLl9nZXROZXh0Um92aW5nSW5kZXgoaWR4LCBlLmtleSk7XG5cdFx0XHRcdGlmIChuZXh0SW5kZXggIT09IHVuZGVmaW5lZCAmJiBuZXh0SW5kZXggIT09IGlkeCkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuX21vdmVSb3ZpbmdGb2N1cyhpZHgsIG5leHRJbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCB0cnVlIC8qIHVzZUNhcHR1cmUgKi8pKTtcblxuXHRcdC8vIEFkZCBrZXlib2FyZCBoYW5kbGVyIGZvciBFbnRlci9TcGFjZSBvbiB0aGUgc3BhcmtsZSBjb250YWluZXJcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNwYXJrbGVDb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChwcmltYXJ5QWN0aW9uSWQpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93RG93bicgfHwgZS5rZXkgPT09ICdBcnJvd1VwJykge1xuXHRcdFx0XHQvLyBPcGVuIGRyb3Bkb3duIG1lbnUgd2l0aCBhcnJvdyBrZXlzXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0c3BhcmtsZURyb3Bkb3duLnNob3dEcm9wZG93bigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhvdmVyIGRlbGVnYXRlIGZvciBzdGF0dXMgc2VjdGlvbnNcblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyk7XG5cblx0XHQvLyBPbmx5IHNob3cgc3RhdHVzIGluZGljYXRvcnMgaWYgY2hhdC52aWV3U2Vzc2lvbnMuZW5hYmxlZCBpcyB0cnVlXG5cdFx0Y29uc3Qgdmlld1Nlc3Npb25zRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQpICE9PSBmYWxzZTtcblxuXHRcdC8vIFdoZW4gY29tcGFjdCBtb2RlIGlzIGFjdGl2ZSwgc2hvdyBzdGF0dXMgaW5kaWNhdG9ycyBiZWZvcmUgdGhlIHNwYXJrbGUgYnV0dG9uOlxuXHRcdC8vIFtuZWVkcy1pbnB1dCwgYWN0aXZlLCB1bnJlYWQsIHNwYXJrbGVdIChwb3B1bGF0aW5nIGlud2FyZClcblx0XHQvLyBPdGhlcndpc2UsIGtlZXAgb3JpZ2luYWwgb3JkZXI6IFtzcGFya2xlLCB1bnJlYWQsIGFjdGl2ZSwgbmVlZHMtaW5wdXRdXG5cdFx0Y29uc3QgcmV2ZXJzZU9yZGVyID0gISFpbmxpbmVDb250YWluZXI7XG5cblx0XHRpZiAoIXJldmVyc2VPcmRlcikge1xuXHRcdFx0Ly8gT3JpZ2luYWwgb3JkZXI6IHNwYXJrbGUgZmlyc3Rcblx0XHRcdGJhZGdlLmFwcGVuZENoaWxkKHNwYXJrbGVDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHN0YXR1cyBzZWN0aW9ucyBidXQgZG9uJ3QgYXBwZW5kIHlldCAtIHdlIG5lZWQgdG8gY29udHJvbCBvcmRlclxuXHRcdGxldCB1bnJlYWRTZWN0aW9uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0aXZlU2VjdGlvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG5lZWRzSW5wdXRTZWN0aW9uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIFVucmVhZCBzZWN0aW9uIChibHVlIGRvdCArIGNvdW50KVxuXHRcdGlmICh2aWV3U2Vzc2lvbnNFbmFibGVkICYmIGhhc1VucmVhZFNlc3Npb25zICYmIHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdGNvbnN0IHsgaXNGaWx0ZXJlZFRvVW5yZWFkIH0gPSB0aGlzLl9nZXRDdXJyZW50RmlsdGVyU3RhdGUoKTtcblx0XHRcdHVucmVhZFNlY3Rpb24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1iYWRnZS1zZWN0aW9uLnVucmVhZCcpO1xuXHRcdFx0aWYgKGlzRmlsdGVyZWRUb1VucmVhZCkge1xuXHRcdFx0XHR1bnJlYWRTZWN0aW9uLmNsYXNzTGlzdC5hZGQoJ2ZpbHRlcmVkJyk7XG5cdFx0XHR9XG5cdFx0XHR1bnJlYWRTZWN0aW9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdHVucmVhZFNlY3Rpb24udGFiSW5kZXggPSAwO1xuXHRcdFx0Y29uc3QgdW5yZWFkSWNvbiA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLWljb24nKTtcblx0XHRcdHJlc2V0KHVucmVhZEljb24sIHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGVGaWxsZWQpKTtcblx0XHRcdHVucmVhZFNlY3Rpb24uYXBwZW5kQ2hpbGQodW5yZWFkSWNvbik7XG5cdFx0XHRjb25zdCB1bnJlYWRDb3VudCA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLXRleHQnKTtcblx0XHRcdHVucmVhZENvdW50LnRleHRDb250ZW50ID0gU3RyaW5nKHVucmVhZFNlc3Npb25zLmxlbmd0aCk7XG5cdFx0XHR1bnJlYWRTZWN0aW9uLmFwcGVuZENoaWxkKHVucmVhZENvdW50KTtcblxuXHRcdFx0Ly8gQ2xpY2sgaGFuZGxlciAtIGZpbHRlciB0byB1bnJlYWQgc2Vzc2lvbnNcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodW5yZWFkU2VjdGlvbiwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29wZW5TZXNzaW9uc1dpdGhGaWx0ZXIoJ3VucmVhZCcpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih1bnJlYWRTZWN0aW9uLCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy5fb3BlblNlc3Npb25zV2l0aEZpbHRlcigndW5yZWFkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gSG92ZXIgdG9vbHRpcCBmb3IgdW5yZWFkIHNlY3Rpb25cblx0XHRcdGNvbnN0IHVucmVhZFRvb2x0aXAgPSB1bnJlYWRTZXNzaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgndW5yZWFkU2Vzc2lvbnNUb29sdGlwMScsIFwiezB9IHVucmVhZCBzZXNzaW9uXCIsIHVucmVhZFNlc3Npb25zLmxlbmd0aClcblx0XHRcdFx0OiBsb2NhbGl6ZSgndW5yZWFkU2Vzc2lvbnNUb29sdGlwJywgXCJ7MH0gdW5yZWFkIHNlc3Npb25zXCIsIHVucmVhZFNlc3Npb25zLmxlbmd0aCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgdW5yZWFkU2VjdGlvbiwgdW5yZWFkVG9vbHRpcCkpO1xuXHRcdH1cblxuXHRcdC8vIE5lZWRzLWlucHV0IHNlY3Rpb24gLSBzaG93cyBzZXNzaW9ucyByZXF1aXJpbmcgdXNlciBhdHRlbnRpb24gKGFwcHJvdmFsL2NvbmZpcm1hdGlvbi9pbnB1dClcblx0XHRpZiAodmlld1Nlc3Npb25zRW5hYmxlZCAmJiBoYXNBdHRlbnRpb25OZWVkZWQpIHtcblx0XHRcdGNvbnN0IHsgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCB9ID0gdGhpcy5fZ2V0Q3VycmVudEZpbHRlclN0YXRlKCk7XG5cdFx0XHRuZWVkc0lucHV0U2VjdGlvbiA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLWJhZGdlLXNlY3Rpb24uYWN0aXZlLm5lZWRzLWlucHV0Jyk7XG5cdFx0XHRpZiAoaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCkge1xuXHRcdFx0XHRuZWVkc0lucHV0U2VjdGlvbi5jbGFzc0xpc3QuYWRkKCdmaWx0ZXJlZCcpO1xuXHRcdFx0fVxuXHRcdFx0bmVlZHNJbnB1dFNlY3Rpb24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0bmVlZHNJbnB1dFNlY3Rpb24udGFiSW5kZXggPSAwO1xuXHRcdFx0Y29uc3QgbmVlZHNJbnB1dEljb24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1pY29uJyk7XG5cdFx0XHRyZXNldChuZWVkc0lucHV0SWNvbiwgcmVuZGVySWNvbihDb2RpY29uLnJlcG9ydCkpO1xuXHRcdFx0bmVlZHNJbnB1dFNlY3Rpb24uYXBwZW5kQ2hpbGQobmVlZHNJbnB1dEljb24pO1xuXHRcdFx0Y29uc3QgbmVlZHNJbnB1dENvdW50ID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtdGV4dCcpO1xuXHRcdFx0bmVlZHNJbnB1dENvdW50LnRleHRDb250ZW50ID0gU3RyaW5nKGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLmxlbmd0aCk7XG5cdFx0XHRuZWVkc0lucHV0U2VjdGlvbi5hcHBlbmRDaGlsZChuZWVkc0lucHV0Q291bnQpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5lZWRzSW5wdXRTZWN0aW9uLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fb3BlblNlc3Npb25zV2l0aEZpbHRlcignbmVlZHNJbnB1dCcpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihuZWVkc0lucHV0U2VjdGlvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuX29wZW5TZXNzaW9uc1dpdGhGaWx0ZXIoJ25lZWRzSW5wdXQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBuZWVkc0lucHV0VG9vbHRpcCA9IGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCduZWVkc0lucHV0U2Vzc2lvbnNUb29sdGlwMScsIFwiezB9IHNlc3Npb24gbmVlZHMgaW5wdXRcIiwgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMubGVuZ3RoKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCduZWVkc0lucHV0U2Vzc2lvbnNUb29sdGlwJywgXCJ7MH0gc2Vzc2lvbnMgbmVlZCBpbnB1dFwiLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucy5sZW5ndGgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIG5lZWRzSW5wdXRTZWN0aW9uLCBuZWVkc0lucHV0VG9vbHRpcCkpO1xuXHRcdH1cblxuXHRcdC8vIEluLXByb2dyZXNzIHNlY3Rpb24gLSBzaG93cyBzZXNzaW9ucyB0aGF0IGFyZSBhY3RpdmVseSBydW5uaW5nIChleGNsdWRlcyBuZWVkcy1pbnB1dClcblx0XHRjb25zdCBpblByb2dyZXNzT25seSA9IGFjdGl2ZVNlc3Npb25zLmZpbHRlcihzID0+IHMuc3RhdHVzICE9PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCk7XG5cdFx0aWYgKHZpZXdTZXNzaW9uc0VuYWJsZWQgJiYgaW5Qcm9ncmVzc09ubHkubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgeyBpc0ZpbHRlcmVkVG9JblByb2dyZXNzIH0gPSB0aGlzLl9nZXRDdXJyZW50RmlsdGVyU3RhdGUoKTtcblx0XHRcdGFjdGl2ZVNlY3Rpb24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1iYWRnZS1zZWN0aW9uLmFjdGl2ZScpO1xuXHRcdFx0aWYgKGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3MpIHtcblx0XHRcdFx0YWN0aXZlU2VjdGlvbi5jbGFzc0xpc3QuYWRkKCdmaWx0ZXJlZCcpO1xuXHRcdFx0fVxuXHRcdFx0YWN0aXZlU2VjdGlvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRhY3RpdmVTZWN0aW9uLnRhYkluZGV4ID0gMDtcblx0XHRcdGNvbnN0IHN0YXR1c0ljb24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1pY29uJyk7XG5cdFx0XHRyZXNldChzdGF0dXNJY29uLCByZW5kZXJJY29uKENvZGljb24uc2Vzc2lvbkluUHJvZ3Jlc3MpKTtcblx0XHRcdGFjdGl2ZVNlY3Rpb24uYXBwZW5kQ2hpbGQoc3RhdHVzSWNvbik7XG5cdFx0XHRjb25zdCBzdGF0dXNDb3VudCA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLXRleHQnKTtcblx0XHRcdHN0YXR1c0NvdW50LnRleHRDb250ZW50ID0gU3RyaW5nKGluUHJvZ3Jlc3NPbmx5Lmxlbmd0aCk7XG5cdFx0XHRhY3RpdmVTZWN0aW9uLmFwcGVuZENoaWxkKHN0YXR1c0NvdW50KTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhY3RpdmVTZWN0aW9uLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fb3BlblNlc3Npb25zV2l0aEZpbHRlcignaW5Qcm9ncmVzcycpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhY3RpdmVTZWN0aW9uLCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy5fb3BlblNlc3Npb25zV2l0aEZpbHRlcignaW5Qcm9ncmVzcycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGFjdGl2ZVRvb2x0aXAgPSBpblByb2dyZXNzT25seS5sZW5ndGggPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYWN0aXZlU2Vzc2lvbnNUb29sdGlwMScsIFwiezB9IHNlc3Npb24gaW4gcHJvZ3Jlc3NcIiwgaW5Qcm9ncmVzc09ubHkubGVuZ3RoKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhY3RpdmVTZXNzaW9uc1Rvb2x0aXAnLCBcInswfSBzZXNzaW9ucyBpbiBwcm9ncmVzc1wiLCBpblByb2dyZXNzT25seS5sZW5ndGgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIGFjdGl2ZVNlY3Rpb24sIGFjdGl2ZVRvb2x0aXApKTtcblx0XHR9XG5cblx0XHQvLyBBcHBlbmQgc3RhdHVzIHNlY3Rpb25zIGluIHRoZSBjb3JyZWN0IG9yZGVyIGFuZCByZWdpc3RlciBmb3Igcm92aW5nIHRhYmluZGV4XG5cdFx0aWYgKHJldmVyc2VPcmRlcikge1xuXHRcdFx0Ly8gW25lZWRzLWlucHV0LCBhY3RpdmUsIHVucmVhZCwgc3BhcmtsZV0gXHUyMDE0IHBvcHVsYXRlcyBpbndhcmRcblx0XHRcdGlmIChuZWVkc0lucHV0U2VjdGlvbikgeyBiYWRnZS5hcHBlbmRDaGlsZChuZWVkc0lucHV0U2VjdGlvbik7IHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2gobmVlZHNJbnB1dFNlY3Rpb24pOyB9XG5cdFx0XHRpZiAoYWN0aXZlU2VjdGlvbikgeyBiYWRnZS5hcHBlbmRDaGlsZChhY3RpdmVTZWN0aW9uKTsgdGhpcy5fcm92aW5nRWxlbWVudHMucHVzaChhY3RpdmVTZWN0aW9uKTsgfVxuXHRcdFx0aWYgKHVucmVhZFNlY3Rpb24pIHsgYmFkZ2UuYXBwZW5kQ2hpbGQodW5yZWFkU2VjdGlvbik7IHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2godW5yZWFkU2VjdGlvbik7IH1cblx0XHRcdGJhZGdlLmFwcGVuZENoaWxkKHNwYXJrbGVDb250YWluZXIpO1xuXHRcdFx0dGhpcy5fcm92aW5nRWxlbWVudHMucHVzaChzcGFya2xlQ29udGFpbmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gT3JpZ2luYWw6IFtzcGFya2xlIChhbHJlYWR5IGFwcGVuZGVkKSwgdW5yZWFkLCBhY3RpdmUsIG5lZWRzLWlucHV0XVxuXHRcdFx0dGhpcy5fcm92aW5nRWxlbWVudHMucHVzaChzcGFya2xlQ29udGFpbmVyKTtcblx0XHRcdGlmICh1bnJlYWRTZWN0aW9uKSB7IGJhZGdlLmFwcGVuZENoaWxkKHVucmVhZFNlY3Rpb24pOyB0aGlzLl9yb3ZpbmdFbGVtZW50cy5wdXNoKHVucmVhZFNlY3Rpb24pOyB9XG5cdFx0XHRpZiAoYWN0aXZlU2VjdGlvbikgeyBiYWRnZS5hcHBlbmRDaGlsZChhY3RpdmVTZWN0aW9uKTsgdGhpcy5fcm92aW5nRWxlbWVudHMucHVzaChhY3RpdmVTZWN0aW9uKTsgfVxuXHRcdFx0aWYgKG5lZWRzSW5wdXRTZWN0aW9uKSB7IGJhZGdlLmFwcGVuZENoaWxkKG5lZWRzSW5wdXRTZWN0aW9uKTsgdGhpcy5fcm92aW5nRWxlbWVudHMucHVzaChuZWVkc0lucHV0U2VjdGlvbik7IH1cblx0XHR9XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciB0aGUgZmlsdGVyIGlmIHRoZSBjdXJyZW50bHkgZmlsdGVyZWQgY2F0ZWdvcnkgYmVjb21lcyBlbXB0eS5cblx0ICogRm9yIGV4YW1wbGUsIGlmIGZpbHRlcmVkIHRvIFwidW5yZWFkXCIgYnV0IG5vIHVucmVhZCBzZXNzaW9ucyBleGlzdCwgcmVzdG9yZSB1c2VyJ3MgcHJldmlvdXMgZmlsdGVyLlxuXHQgKiBPbmx5IGF1dG8tY2xlYXJzIGlmIFRISVMgd2luZG93IGFwcGxpZWQgdGhlIGJhZGdlIGZpbHRlciB0byBhdm9pZCBjcm9zcy13aW5kb3cgaW50ZXJmZXJlbmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYXJGaWx0ZXJJZkNhdGVnb3J5RW1wdHkoaGFzVW5yZWFkU2Vzc2lvbnM6IGJvb2xlYW4sIGhhc0FjdGl2ZVNlc3Npb25zOiBib29sZWFuLCBoYXNBdHRlbnRpb25OZWVkZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBPbmx5IGF1dG8tY2xlYXIgaWYgdGhpcyB3aW5kb3cgYXBwbGllZCB0aGUgYmFkZ2UgZmlsdGVyXG5cdFx0Ly8gVGhpcyBwcmV2ZW50cyBXaW5kb3cgQiBmcm9tIGNsZWFyaW5nIGZpbHRlcnMgdGhhdCBXaW5kb3cgQSBzZXRcblx0XHRpZiAodGhpcy5fYmFkZ2VGaWx0ZXJBcHBsaWVkQnlUaGlzV2luZG93ID09PSAndW5yZWFkJyAmJiAhaGFzVW5yZWFkU2Vzc2lvbnMpIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVVc2VyRmlsdGVyKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9iYWRnZUZpbHRlckFwcGxpZWRCeVRoaXNXaW5kb3cgPT09ICdpblByb2dyZXNzJyAmJiAhaGFzQWN0aXZlU2Vzc2lvbnMpIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVVc2VyRmlsdGVyKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9iYWRnZUZpbHRlckFwcGxpZWRCeVRoaXNXaW5kb3cgPT09ICduZWVkc0lucHV0JyAmJiAhaGFzQXR0ZW50aW9uTmVlZGVkKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlVXNlckZpbHRlcigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGN1cnJlbnQgZmlsdGVyIHN0YXRlIGZyb20gc3RvcmFnZS5cblx0ICovXG5cdHByaXZhdGUgX2dldEN1cnJlbnRGaWx0ZXJTdGF0ZSgpOiB7IGlzRmlsdGVyZWRUb1VucmVhZDogYm9vbGVhbjsgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzczogYm9vbGVhbjsgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dDogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBmaWx0ZXIgPSB0aGlzLl9nZXRTdG9yZWRGaWx0ZXIoKTtcblx0XHRpZiAoIWZpbHRlcikge1xuXHRcdFx0cmV0dXJuIHsgaXNGaWx0ZXJlZFRvVW5yZWFkOiBmYWxzZSwgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzczogZmFsc2UsIGlzRmlsdGVyZWRUb05lZWRzSW5wdXQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZWN0IGlmIGZpbHRlcmVkIHRvIHVucmVhZCAocmVhZD10cnVlIGV4Y2x1ZGVzIHJlYWQgc2Vzc2lvbnMsIGxlYXZpbmcgb25seSB1bnJlYWQpXG5cdFx0Y29uc3QgaXNGaWx0ZXJlZFRvVW5yZWFkID0gZmlsdGVyLnJlYWQgPT09IHRydWUgJiYgZmlsdGVyLnN0YXRlcy5sZW5ndGggPT09IDA7XG5cdFx0Ly8gRGV0ZWN0IGlmIGZpbHRlcmVkIHRvIGluLXByb2dyZXNzIG9ubHkgKDMgZXhjbHVkZWQgc3RhdGVzIGluY2x1ZGluZyBOZWVkc0lucHV0KVxuXHRcdGNvbnN0IGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3MgPSBmaWx0ZXIuc3RhdGVzPy5sZW5ndGggPT09IDMgJiYgZmlsdGVyLnN0YXRlcy5pbmNsdWRlcyhBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCkgJiYgZmlsdGVyLnJlYWQgPT09IGZhbHNlO1xuXHRcdC8vIERldGVjdCBpZiBmaWx0ZXJlZCB0byBuZWVkcy1pbnB1dCBvbmx5ICgzIGV4Y2x1ZGVkIHN0YXRlcyBpbmNsdWRpbmcgSW5Qcm9ncmVzcylcblx0XHRjb25zdCBpc0ZpbHRlcmVkVG9OZWVkc0lucHV0ID0gZmlsdGVyLnN0YXRlcz8ubGVuZ3RoID09PSAzICYmIGZpbHRlci5zdGF0ZXMuaW5jbHVkZXMoQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpICYmIGZpbHRlci5yZWFkID09PSBmYWxzZTtcblxuXHRcdHJldHVybiB7IGlzRmlsdGVyZWRUb1VucmVhZCwgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzcywgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgc3RvcmVkIGZpbHRlciBvYmplY3QgZnJvbSBzdG9yYWdlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U3RvcmVkRmlsdGVyKCk6IHsgcHJvdmlkZXJzOiBzdHJpbmdbXTsgc3RhdGVzOiBBZ2VudFNlc3Npb25TdGF0dXNbXTsgYXJjaGl2ZWQ6IGJvb2xlYW47IHJlYWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmlsdGVyU3RyID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRklMVEVSX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKCFmaWx0ZXJTdHIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShmaWx0ZXJTdHIpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3RvcmUgYSBmaWx0ZXIgb2JqZWN0IHRvIHN0b3JhZ2UuXG5cdCAqL1xuXHRwcml2YXRlIF9zdG9yZUZpbHRlcihmaWx0ZXI6IHsgcHJvdmlkZXJzOiBzdHJpbmdbXTsgc3RhdGVzOiBBZ2VudFNlc3Npb25TdGF0dXNbXTsgYXJjaGl2ZWQ6IGJvb2xlYW47IHJlYWQ6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRklMVEVSX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShmaWx0ZXIpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciBhbGwgZmlsdGVycyAocmVzZXQgdG8gZGVmYXVsdCkuXG5cdCAqL1xuXHRwcml2YXRlIF9jbGVhckZpbHRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yZUZpbHRlcih7XG5cdFx0XHRwcm92aWRlcnM6IFtdLFxuXHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdGFyY2hpdmVkOiB0cnVlLFxuXHRcdFx0cmVhZDogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTYXZlIHRoZSBjdXJyZW50IHVzZXIgZmlsdGVyIGJlZm9yZSB3ZSBvdmVycmlkZSBpdCB3aXRoIGEgYmFkZ2UgZmlsdGVyLlxuXHQgKiBPbmx5IHNhdmVzIGlmIHRoZSBjdXJyZW50IGZpbHRlciBpcyBOT1QgYWxyZWFkeSBhIGJhZGdlIGZpbHRlciAodW5yZWFkIG9yIGluLXByb2dyZXNzKS5cblx0ICogVGhpcyBwcmVzZXJ2ZXMgdGhlIG9yaWdpbmFsIHVzZXIgZmlsdGVyIHdoZW4gc3dpdGNoaW5nIGJldHdlZW4gYmFkZ2UgZmlsdGVycy5cblx0ICovXG5cdHByaXZhdGUgX3NhdmVVc2VyRmlsdGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgaXNGaWx0ZXJlZFRvVW5yZWFkLCBpc0ZpbHRlcmVkVG9JblByb2dyZXNzLCBpc0ZpbHRlcmVkVG9OZWVkc0lucHV0IH0gPSB0aGlzLl9nZXRDdXJyZW50RmlsdGVyU3RhdGUoKTtcblxuXHRcdC8vIERvbid0IG92ZXJ3cml0ZSB0aGUgc2F2ZWQgZmlsdGVyIGlmIHdlJ3JlIGFscmVhZHkgaW4gYSBiYWRnZS1maWx0ZXJlZCBzdGF0ZVxuXHRcdC8vIFRoZSBwcmV2aW91cyB1c2VyIGZpbHRlciBzaG91bGQgYWxyZWFkeSBiZSBzYXZlZFxuXHRcdGlmIChpc0ZpbHRlcmVkVG9VbnJlYWQgfHwgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzcyB8fCBpc0ZpbHRlcmVkVG9OZWVkc0lucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudEZpbHRlciA9IHRoaXMuX2dldFN0b3JlZEZpbHRlcigpO1xuXHRcdGlmIChjdXJyZW50RmlsdGVyKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFBSRVZJT1VTX0ZJTFRFUl9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkoY3VycmVudEZpbHRlciksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlIHRoZSB1c2VyJ3MgcHJldmlvdXMgZmlsdGVyIChzYXZlZCBiZWZvcmUgd2UgYXBwbGllZCBhIGJhZGdlIGZpbHRlcikuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXN0b3JlVXNlckZpbHRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0ZpbHRlclN0ciA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFBSRVZJT1VTX0ZJTFRFUl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChwcmV2aW91c0ZpbHRlclN0cikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNGaWx0ZXIgPSBKU09OLnBhcnNlKHByZXZpb3VzRmlsdGVyU3RyKTtcblx0XHRcdFx0dGhpcy5fc3RvcmVGaWx0ZXIocHJldmlvdXNGaWx0ZXIpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIEZhbGwgYmFjayB0byBjbGVhcmluZyBpZiBwYXJzZSBmYWlsc1xuXHRcdFx0XHR0aGlzLl9jbGVhckZpbHRlcigpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBObyBwcmV2aW91cyBmaWx0ZXIgc2F2ZWQsIGNsZWFyIHRvIGRlZmF1bHRcblx0XHRcdHRoaXMuX2NsZWFyRmlsdGVyKCk7XG5cdFx0fVxuXHRcdC8vIENsZWFyIHRoZSBzYXZlZCBmaWx0ZXIgYWZ0ZXIgcmVzdG9yaW5nXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoUFJFVklPVVNfRklMVEVSX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0Ly8gQ2xlYXIgdGhlIHBlci13aW5kb3cgYmFkZ2UgZmlsdGVyIHRyYWNraW5nXG5cdFx0dGhpcy5fYmFkZ2VGaWx0ZXJBcHBsaWVkQnlUaGlzV2luZG93ID0gbnVsbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgYWdlbnQgc2Vzc2lvbnMgdmlldyB3aXRoIGEgc3BlY2lmaWMgZmlsdGVyIGFwcGxpZWQsIG9yIHJlc3RvcmVzIHByZXZpb3VzIGZpbHRlciBpZiBhbHJlYWR5IGFwcGxpZWQuXG5cdCAqIFByZXNlcnZlcyBzZXNzaW9uIHR5cGUgKHByb3ZpZGVyKSBmaWx0ZXJzIHdoaWxlIHRvZ2dsaW5nIG9ubHkgc3RhdHVzIGZpbHRlcnMuXG5cdCAqL1xuXHRwcml2YXRlIF9vcGVuU2Vzc2lvbnNXaXRoRmlsdGVyKGZpbHRlclR5cGU6ICd1bnJlYWQnIHwgJ2luUHJvZ3Jlc3MnIHwgJ25lZWRzSW5wdXQnKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBpc0ZpbHRlcmVkVG9VbnJlYWQsIGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3MsIGlzRmlsdGVyZWRUb05lZWRzSW5wdXQgfSA9IHRoaXMuX2dldEN1cnJlbnRGaWx0ZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGN1cnJlbnRGaWx0ZXIgPSB0aGlzLl9nZXRTdG9yZWRGaWx0ZXIoKTtcblx0XHQvLyBQcmVzZXJ2ZSBleGlzdGluZyBwcm92aWRlciBmaWx0ZXJzIChzZXNzaW9uIHR5cGUgZmlsdGVycyBsaWtlIExvY2FsLCBCYWNrZ3JvdW5kLCBldGMuKVxuXHRcdGNvbnN0IHByZXNlcnZlZFByb3ZpZGVycyA9IGN1cnJlbnRGaWx0ZXI/LnByb3ZpZGVycyA/PyBbXTtcblxuXHRcdC8vIExvZyB0ZWxlbWV0cnkgZm9yIGZpbHRlciBidXR0b24gY2xpY2tzXG5cdFx0Y29uc3QgaXNUb2dnbGVPZmYgPSAoZmlsdGVyVHlwZSA9PT0gJ3VucmVhZCcgJiYgaXNGaWx0ZXJlZFRvVW5yZWFkKVxuXHRcdFx0fHwgKGZpbHRlclR5cGUgPT09ICdpblByb2dyZXNzJyAmJiBpc0ZpbHRlcmVkVG9JblByb2dyZXNzKVxuXHRcdFx0fHwgKGZpbHRlclR5cGUgPT09ICduZWVkc0lucHV0JyAmJiBpc0ZpbHRlcmVkVG9OZWVkc0lucHV0KTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZ2VudFN0YXR1c0NsaWNrRXZlbnQsIEFnZW50U3RhdHVzQ2xpY2tDbGFzc2lmaWNhdGlvbj4oJ2FnZW50U3RhdHVzV2lkZ2V0LmNsaWNrJywge1xuXHRcdFx0c291cmNlOiBmaWx0ZXJUeXBlLFxuXHRcdFx0YWN0aW9uOiBpc1RvZ2dsZU9mZiA/ICdjbGVhckZpbHRlcicgOiAnYXBwbHlGaWx0ZXInLFxuXHRcdH0pO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgYWxyZWFkeSBmaWx0ZXJlZCB0byB0aGlzIHR5cGUgXHUyMDE0IHRvZ2dsZSBvZmZcblx0XHRpZiAoaXNUb2dnbGVPZmYpIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVVc2VyRmlsdGVyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNhdmUgY3VycmVudCBmaWx0ZXIgYmVmb3JlIGFwcGx5aW5nIG91ciBvd25cblx0XHRcdHRoaXMuX3NhdmVVc2VyRmlsdGVyKCk7XG5cblx0XHRcdGlmIChmaWx0ZXJUeXBlID09PSAndW5yZWFkJykge1xuXHRcdFx0XHR0aGlzLl9zdG9yZUZpbHRlcih7XG5cdFx0XHRcdFx0cHJvdmlkZXJzOiBwcmVzZXJ2ZWRQcm92aWRlcnMsXG5cdFx0XHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdFx0XHRhcmNoaXZlZDogdHJ1ZSxcblx0XHRcdFx0XHRyZWFkOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChmaWx0ZXJUeXBlID09PSAnaW5Qcm9ncmVzcycpIHtcblx0XHRcdFx0Ly8gRXhjbHVkZSBDb21wbGV0ZWQsIEZhaWxlZCwgYW5kIE5lZWRzSW5wdXQgXHUyMDE0IHNob3cgb25seSBJblByb2dyZXNzXG5cdFx0XHRcdHRoaXMuX3N0b3JlRmlsdGVyKHtcblx0XHRcdFx0XHRwcm92aWRlcnM6IHByZXNlcnZlZFByb3ZpZGVycyxcblx0XHRcdFx0XHRzdGF0ZXM6IFtBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBBZ2VudFNlc3Npb25TdGF0dXMuRmFpbGVkLCBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dF0sXG5cdFx0XHRcdFx0YXJjaGl2ZWQ6IHRydWUsXG5cdFx0XHRcdFx0cmVhZDogZmFsc2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBFeGNsdWRlIENvbXBsZXRlZCwgRmFpbGVkLCBhbmQgSW5Qcm9ncmVzcyBcdTIwMTQgc2hvdyBvbmx5IE5lZWRzSW5wdXRcblx0XHRcdFx0dGhpcy5fc3RvcmVGaWx0ZXIoe1xuXHRcdFx0XHRcdHByb3ZpZGVyczogcHJlc2VydmVkUHJvdmlkZXJzLFxuXHRcdFx0XHRcdHN0YXRlczogW0FnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIEFnZW50U2Vzc2lvblN0YXR1cy5GYWlsZWQsIEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzXSxcblx0XHRcdFx0XHRhcmNoaXZlZDogdHJ1ZSxcblx0XHRcdFx0XHRyZWFkOiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2JhZGdlRmlsdGVyQXBwbGllZEJ5VGhpc1dpbmRvdyA9IGZpbHRlclR5cGU7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiB0aGUgc2Vzc2lvbnMgdmlld1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRm9jdXNBZ2VudFNlc3Npb25zQWN0aW9uLmlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIGVzY2FwZSBidXR0b24gZm9yIGV4aXRpbmcgc2Vzc2lvbiBwcm9qZWN0aW9uIG1vZGUuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJFc2NhcGVCdXR0b24oZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgcGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVzY0J1dHRvbiA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLWVzYy1idXR0b24nKTtcblx0XHRlc2NCdXR0b24udGV4dENvbnRlbnQgPSAnRXNjJztcblx0XHRlc2NCdXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGVzY0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZXhpdEFnZW50U2Vzc2lvblByb2plY3Rpb24nLCBcIkV4aXQgQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uXCIpKTtcblx0XHRlc2NCdXR0b24udGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2goZXNjQnV0dG9uKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoZXNjQnV0dG9uKTtcblxuXHRcdC8vIFNldHVwIGhvdmVyXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBlc2NCdXR0b24sIGxvY2FsaXplKCdleGl0QWdlbnRTZXNzaW9uUHJvamVjdGlvblRvb2x0aXAnLCBcIkV4aXQgQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uIChFc2NhcGUpXCIpKSk7XG5cblx0XHQvLyBDbGljayBoYW5kbGVyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlc2NCdXR0b24sIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRXhpdEFnZW50U2Vzc2lvblByb2plY3Rpb25BY3Rpb24uSUQpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZXNjQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChFeGl0QWdlbnRTZXNzaW9uUHJvamVjdGlvbkFjdGlvbi5JRCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgaGFuZGxlclxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZXNjQnV0dG9uLCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRXhpdEFnZW50U2Vzc2lvblByb2plY3Rpb25BY3Rpb24uSUQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIGVudGVyIGJ1dHRvbiBmb3IgZW50ZXJpbmcgc2Vzc2lvbiBwcm9qZWN0aW9uIG1vZGUuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJFbnRlckJ1dHRvbihkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZW50ZXJCdXR0b24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1lbnRlci1idXR0b24nKTtcblx0XHQvLyBHZXQgdGhlIGtleWJpbmRpbmcgZm9yIHRoZSBlbnRlciBhY3Rpb25cblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEVudGVyQWdlbnRTZXNzaW9uUHJvamVjdGlvbkFjdGlvbi5JRCk7XG5cdFx0ZW50ZXJCdXR0b24udGV4dENvbnRlbnQgPSBrZXliaW5kaW5nPy5nZXRMYWJlbCgpID8/IGxvY2FsaXplKCdyZXZpZXcnLCBcIlJldmlld1wiKTtcblx0XHRlbnRlckJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0ZW50ZXJCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2VudGVyQWdlbnRTZXNzaW9uUHJvamVjdGlvbicsIFwiRW50ZXIgQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uXCIpKTtcblx0XHRlbnRlckJ1dHRvbi50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fcm92aW5nRWxlbWVudHMucHVzaChlbnRlckJ1dHRvbik7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKGVudGVyQnV0dG9uKTtcblxuXHRcdC8vIFNldHVwIGhvdmVyXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHRcdGNvbnN0IGhvdmVyVGV4dCA9IGtleWJpbmRpbmdcblx0XHRcdD8gbG9jYWxpemUoJ2VudGVyQWdlbnRTZXNzaW9uUHJvamVjdGlvblRvb2x0aXAnLCBcIlJldmlldyBDaGFuZ2VzICh7MH0pXCIsIGtleWJpbmRpbmcuZ2V0TGFiZWwoKSlcblx0XHRcdDogbG9jYWxpemUoJ2VudGVyQWdlbnRTZXNzaW9uUHJvamVjdGlvblRvb2x0aXBOb0tleScsIFwiUmV2aWV3IENoYW5nZXNcIik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIGVudGVyQnV0dG9uLCBob3ZlclRleHQpKTtcblxuXHRcdC8vIEVudGVyIHByb2plY3Rpb24gaGFuZGxlciAtIHNhbWUgYXMgY2xpY2tpbmcgdGhlIHBpbGxcblx0XHRjb25zdCBlbnRlclByb2plY3Rpb24gPSAoZTogRXZlbnQpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uSW5mbyA9IHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2Uuc2Vzc2lvbkluZm87XG5cdFx0XHRpZiAoc2Vzc2lvbkluZm8pIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uSW5mby5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRW50ZXJBZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9uLklELCBzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBDbGljayBoYW5kbGVyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbnRlckJ1dHRvbiwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGVudGVyUHJvamVjdGlvbikpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZW50ZXJCdXR0b24sIEV2ZW50VHlwZS5DTElDSywgZW50ZXJQcm9qZWN0aW9uKSk7XG5cblx0XHQvLyBLZXlib2FyZCBoYW5kbGVyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbnRlckJ1dHRvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZW50ZXJQcm9qZWN0aW9uKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFNlc3Npb24gSGVscGVyc1xuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHNlc3Npb24gbW9zdCB1cmdlbnRseSBuZWVkaW5nIHVzZXIgYXR0ZW50aW9uIChhcHByb3ZhbC9jb25maXJtYXRpb24vaW5wdXQpLlxuXHQgKiBSZXR1cm5zIHVuZGVmaW5lZCBpZiBubyBzZXNzaW9ucyBuZWVkIGF0dGVudGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2dldFNlc3Npb25OZWVkaW5nQXR0ZW50aW9uKGF0dGVudGlvbk5lZWRlZFNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiB7IHNlc3Npb246IElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ7IHByb2dyZXNzOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB7XG5cdFx0aWYgKGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogdW5kZWZpbmVkLCBwcm9ncmVzczogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCBieSBtb3N0IHJlY2VudGx5IHN0YXJ0ZWQgcmVxdWVzdFxuXHRcdGNvbnN0IHNvcnRlZCA9IFsuLi5hdHRlbnRpb25OZWVkZWRTZXNzaW9uc10uc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Y29uc3QgdGltZUEgPSBhLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQgPz8gYS50aW1pbmcuY3JlYXRlZDtcblx0XHRcdGNvbnN0IHRpbWVCID0gYi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IGIudGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHRyZXR1cm4gdGltZUIgLSB0aW1lQTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1vc3RSZWNlbnQgPSBzb3J0ZWRbMF07XG5cdFx0aWYgKCFtb3N0UmVjZW50LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uOiBtb3N0UmVjZW50LCBwcm9ncmVzczogbW9zdFJlY2VudC5sYWJlbCB9O1xuXHRcdH1cblxuXHRcdC8vIENvbnZlcnQgbWFya2Rvd24gdG8gcGxhaW4gdGV4dCBpZiBuZWVkZWRcblx0XHRjb25zdCBwcm9ncmVzcyA9IHR5cGVvZiBtb3N0UmVjZW50LmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBtb3N0UmVjZW50LmRlc2NyaXB0aW9uXG5cdFx0XHQ6IHJlbmRlckFzUGxhaW50ZXh0KG1vc3RSZWNlbnQuZGVzY3JpcHRpb24pO1xuXG5cdFx0cmV0dXJuIHsgc2Vzc2lvbjogbW9zdFJlY2VudCwgcHJvZ3Jlc3MgfTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIExhYmVsIEhlbHBlcnNcblxuXHQvKipcblx0ICogQ29tcHV0ZSB0aGUgbGFiZWwgdG8gZGlzcGxheSBpbiB0aGUgY29tbWFuZCBjZW50ZXIuXG5cdCAqIFVzZXMgdGhlIHdvcmtzcGFjZSBuYW1lIChmb2xkZXIgbmFtZSkgd2l0aCBwcmVmaXgvc3VmZml4IGRlY29yYXRpb25zLlxuXHQgKiBGYWxscyBiYWNrIHRvIGZpbGUgbmFtZSB3aGVuIHRhYnMgYXJlIGhpZGRlbiwgb3IgXCJTZWFyY2hcIiB3aGVuIGVtcHR5LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0TGFiZWwoKTogc3RyaW5nIHtcblx0XHRjb25zdCB7IHByZWZpeCwgc3VmZml4IH0gPSB0aGlzLl93aW5kb3dUaXRsZS5nZXRUaXRsZURlY29yYXRpb25zKCk7XG5cblx0XHQvLyBCYXNlIGxhYmVsOiBjdXN0b20gdGl0bGUsIHdvcmtzcGFjZSBuYW1lLCBvciBmaWxlIG5hbWUgd2hlbiB0YWJzIGFyZSBoaWRkZW5cblx0XHRsZXQgbGFiZWwgPSB0aGlzLl93aW5kb3dUaXRsZS53b3Jrc3BhY2VOYW1lO1xuXHRcdGlmICh0aGlzLl93aW5kb3dUaXRsZS5pc0N1c3RvbVRpdGxlRm9ybWF0KCkpIHtcblx0XHRcdGxhYmVsID0gdGhpcy5fd2luZG93VGl0bGUuZ2V0V2luZG93VGl0bGUoKTtcblx0XHR9IGVsc2UgaWYgKCFsYWJlbCAmJiB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UucGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdub25lJykge1xuXHRcdFx0bGFiZWwgPSB0aGlzLl93aW5kb3dUaXRsZS5maWxlTmFtZSA/PyAnJztcblx0XHR9XG5cblx0XHRpZiAoIWxhYmVsKSB7XG5cdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdhZ2VudFN0YXR1c1dpZGdldC5zZWFyY2gnLCBcIlNlYXJjaFwiKTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBwcmVmaXggYW5kIHN1ZmZpeCBkZWNvcmF0aW9uc1xuXHRcdGlmIChwcmVmaXgpIHtcblx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2xhYmVsMScsIFwiezB9IHsxfVwiLCBwcmVmaXgsIGxhYmVsKTtcblx0XHR9XG5cdFx0aWYgKHN1ZmZpeCkge1xuXHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnbGFiZWwyJywgXCJ7MH0gezF9XCIsIGxhYmVsLCBzdWZmaXgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYWJlbC5yZXBsYWNlQWxsKC9cXHJcXG58XFxyfFxcbi9nLCAnXFx1MjNDRScpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxufVxuXG4vKipcbiAqIFByb3ZpZGVzIGN1c3RvbSByZW5kZXJpbmcgZm9yIHRoZSBhZ2VudCBzdGF0dXMgaW4gdGhlIGNvbW1hbmQgY2VudGVyLlxuICogVXNlcyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIHRvIHJlbmRlciBhIGN1c3RvbSBBZ2VudFN0YXR1c1dpZGdldFxuICogZm9yIHRoZSBBZ2VudHNDb250cm9sTWVudSBzdWJtZW51LlxuICogQWxzbyBhZGRzIENTUyBjbGFzc2VzIHRvIHRoZSB3b3JrYmVuY2ggYmFzZWQgb24gc2V0dGluZ3MuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFRpdGxlQmFyU3RhdHVzUmVuZGVyaW5nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5hZ2VudFN0YXR1cy5yZW5kZXJpbmcnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRpdGxlU2VydmljZSB0aXRsZVNlcnZpY2U6IElUaXRsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudUlkLkNvbW1hbmRDZW50ZXIsIE1lbnVJZC5BZ2VudHNUaXRsZUJhckNvbnRyb2xNZW51LCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFRpdGxlQmFyU3RhdHVzV2lkZ2V0LCBhY3Rpb24sIHRpdGxlU2VydmljZS53aW5kb3dUaXRsZSwgb3B0aW9ucyk7XG5cdFx0fSwgdW5kZWZpbmVkKSk7XG5cblx0XHQvLyBBZGQvcmVtb3ZlIENTUyBjbGFzc2VzIG9uIHdvcmtiZW5jaCBiYXNlZCBvbiBzZXR0aW5ncy5cblx0XHQvLyBPbmx5IGhpZGUgdGhlIGRlZmF1bHQgY29tbWFuZCBjZW50ZXIgc2VhcmNoIGJveCAodmlhIHVuaWZpZWQtYWdlbnRzLWJhcilcblx0XHQvLyB3aGVuIGNoYXQgaXMgZW5hYmxlZCwgc28gdGhlIHNlYXJjaCBib3ggcmVtYWlucyB2aXNpYmxlIGR1cmluZyByZW1vdGVcblx0XHQvLyBjb25uZWN0aW9uIHN0YXJ0dXAgYmVmb3JlIHRoZSBhZ2VudCBzdGF0dXMgd2lkZ2V0IGlzIHJlYWR5IHRvIHJlbmRlci5cblx0XHRjb25zdCBjaGF0RW5hYmxlZEtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPignY2hhdElzRW5hYmxlZCcpO1xuXHRcdGxldCBjaGF0RW5hYmxlZCA9ICEhY2hhdEVuYWJsZWRLZXk7XG5cblx0XHRjb25zdCB1cGRhdGVDbGFzcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRDZW50ZXJFbmFibGVkID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpID09PSB0cnVlO1xuXHRcdFx0Y29uc3Qgc3RhdHVzTW9kZSA9IGdldEFnZW50U3RhdHVzU2V0dGluZ01vZGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBjb21tYW5kQ2VudGVyRW5hYmxlZCAmJiBjaGF0RW5hYmxlZCAmJiBzdGF0dXNNb2RlICE9PSAnaGlkZGVuJztcblx0XHRcdGNvbnN0IGVuaGFuY2VkID0gZW5hYmxlZCAmJiBzdGF0dXNNb2RlID09PSAnY29tcGFjdCc7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QudG9nZ2xlKCdhZ2VudC1zdGF0dXMtZW5hYmxlZCcsIGVuYWJsZWQpO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNsYXNzTGlzdC50b2dnbGUoJ3VuaWZpZWQtYWdlbnRzLWJhcicsIGVuaGFuY2VkKTtcblx0XHR9O1xuXHRcdHVwZGF0ZUNsYXNzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50U3RhdHVzRW5hYmxlZClcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5DT01NQU5EX0NFTlRFUilcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZClcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGlzYWJsZUFJQ3VzdG9taXphdGlvbnMnKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guZGlzYWJsZUFJQ3VzdG9taXphdGlvbnMnKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHVwZGF0ZUNsYXNzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ldyBTZXQoWydjaGF0SXNFbmFibGVkJywgSW5FZGl0b3JaZW5Nb2RlQ29udGV4dC5rZXldKSkpIHtcblx0XHRcdFx0Y2hhdEVuYWJsZWQgPSAhIWNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPignY2hhdElzRW5hYmxlZCcpO1xuXHRcdFx0XHR1cGRhdGVDbGFzcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLHVCQUF1QixXQUFXLFdBQVcsZUFBZSxhQUFhO0FBQ3JGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxrQkFBa0I7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQkFBaUIsbUNBQW1DO0FBQzdELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUNBQW1DLHdDQUF3QztBQUNwRixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFtQyxpQ0FBaUM7QUFDN0UsU0FBUywwQkFBc0Q7QUFDL0QsU0FBa0IsV0FBVyxlQUFlLGdCQUFnQjtBQUM1RCxTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUFjLFFBQVEsZ0JBQWdCLHlCQUF5QjtBQUN4RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG9CQUFvQix3QkFBd0I7QUFDckQsU0FBUyx5Q0FBeUM7QUFDbEQs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O0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTlDVTtBQTR2Q04sSUFBTSwrQkFBTixjQUEyQyxXQUE2QztBQUFBLEVBSTlGLFlBQ3lCLHVCQUNELHNCQUNBLHNCQUNILG1CQUNMLGNBQ2Q7QUFDRCxVQUFNO0FBRU4sU0FBSyxVQUFVLHNCQUFzQixTQUFTLE9BQU8sZUFBZSxPQUFPLDJCQUEyQixDQUFDLFFBQVEsWUFBWTtBQUMxSCxVQUFJLEVBQUUsa0JBQWtCLG9CQUFvQjtBQUMzQyxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU8scUJBQXFCLGVBQWUsMkJBQTJCLFFBQVEsYUFBYSxhQUFhLE9BQU87QUFBQSxJQUNoSCxHQUFHLE1BQVMsQ0FBQztBQU1iLFVBQU0saUJBQWlCLGtCQUFrQixtQkFBNEIsZUFBZTtBQUNwRixRQUFJLGNBQWMsQ0FBQyxDQUFDO0FBRXBCLFVBQU0sY0FBYyxNQUFNO0FBQ3pCLFlBQU0sdUJBQXVCLHFCQUFxQixTQUFrQixlQUFlLGNBQWMsTUFBTTtBQUN2RyxZQUFNLGFBQWEsMEJBQTBCLHNCQUFzQixpQkFBaUI7QUFDcEYsWUFBTSxVQUFVLHdCQUF3QixlQUFlLGVBQWU7QUFDdEUsWUFBTSxXQUFXLFdBQVcsZUFBZTtBQUUzQyxpQkFBVyxTQUFTLEtBQUssVUFBVSxPQUFPLHdCQUF3QixPQUFPO0FBQ3pFLGlCQUFXLFNBQVMsS0FBSyxVQUFVLE9BQU8sc0JBQXNCLFFBQVE7QUFBQSxJQUN6RTtBQUNBLGdCQUFZO0FBQ1osU0FBSyxVQUFVLHFCQUFxQix5QkFBeUIsT0FBSztBQUNqRSxVQUNDLEVBQUUscUJBQXFCLGtCQUFrQixrQkFBa0IsS0FDeEQsRUFBRSxxQkFBcUIsZUFBZSxjQUFjLEtBQ3BELEVBQUUscUJBQXFCLHVCQUF1QixLQUM5QyxFQUFFLHFCQUFxQix5QkFBeUIsS0FDaEQsRUFBRSxxQkFBcUIsbUNBQW1DLEdBQzVEO0FBQ0Qsb0JBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsa0JBQWtCLG1CQUFtQixPQUFLO0FBQ3hELFVBQUksRUFBRSxZQUFZLG9CQUFJLElBQUksQ0FBQyxpQkFBaUIsdUJBQXVCLEdBQUcsQ0FBQyxDQUFDLEdBQUc7QUFDMUUsc0JBQWMsQ0FBQyxDQUFDLGtCQUFrQixtQkFBNEIsZUFBZTtBQUM3RSxvQkFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQXZEYSw2QkFFSSxLQUFLO0FBRlQsK0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbInNlc3Npb25JbmZvIl0KfQo=
