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
import "./media/sessionsTitleBarWidget.css";
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, getDomNodePagePosition, getWindow, isAncestor, reset } from "../../../../base/browser/dom.js";
import { combinedDisposable, Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { localize } from "../../../../nls.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { MenuRegistry, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { Menus } from "../../../browser/menus.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { autorun } from "../../../../base/common/observable.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { AnchorAlignment, AnchorPosition } from "../../../../base/common/layout.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IsAuxiliaryWindowContext } from "../../../../workbench/common/contextkeys.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { SessionsBlockedSessionsVisibleContext, SessionsWelcomeVisibleContext } from "../../../common/contextkeys.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from "./sessionsActions.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { getUntitledSessionTitle } from "../../../services/sessions/common/session.js";
import { BlockedSessionsList, registerBlockedSessionsItemActions } from "./blockedSessionsList.js";
import { SessionActionFeedback } from "./sessionActionFeedback.js";
import { BlockedSessionsIndicatorModel } from "./blockedSessionsIndicatorModel.js";
import { openSessionToTheSide } from "./views/sessionsView.js";
const SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID = "sessions.blockedSessions.showAllSessions";
const IGNORE_ALL_INPUT_NEEDED_COMMAND_ID = "sessions.blockedSessions.ignoreAllInputNeeded";
const HIDE_BLOCKED_SESSIONS_COMMAND_ID = "sessions.blockedSessions.hide";
function registerBlockedSessionsHeaderActions() {
  return combinedDisposable(
    MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
      command: {
        id: SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID,
        title: localize("showAllSessions", "Show All Sessions"),
        icon: Codicon.listSelection
      },
      group: "navigation",
      order: 1
    }),
    MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
      command: {
        id: IGNORE_ALL_INPUT_NEEDED_COMMAND_ID,
        title: localize("ignoreAllInputNeeded", "Ignore All Input Needed"),
        icon: Codicon.bellSlash
      },
      group: "navigation",
      order: 2
    }),
    MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
      command: {
        id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
        title: localize("closeBlockedSessions", "Close"),
        icon: Codicon.close
      },
      group: "z_close",
      order: 1
    })
  );
}
function registerBlockedSessionsHeaderCommands() {
  return combinedDisposable(
    CommandsRegistry.registerCommand(SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID, (_accessor, context) => {
      context.showAllSessions();
    }),
    CommandsRegistry.registerCommand(IGNORE_ALL_INPUT_NEEDED_COMMAND_ID, (_accessor, context) => {
      context.ignoreAllSessions();
    })
  );
}
let openBlockedSessionsView;
const BLOCKED_DROPDOWN_MIN_WIDTH = 550;
const BLOCKED_DROPDOWN_MAX_WIDTH_RATIO = 0.9;
let SessionsTitleBarWidget = class extends BaseActionViewItem {
  constructor(action, options, sessionActionFeedback, approvalModel, blockedSessions, ciFixModel, sessionsManagementService, sessionsService, sessionsProvidersService, commandService, contextViewService, layoutService, instantiationService, contextKeyService, quickInputService) {
    super(void 0, action, options);
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsService = sessionsService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.commandService = commandService;
    this.contextViewService = contextViewService;
    this.layoutService = layoutService;
    this.instantiationService = instantiationService;
    this.quickInputService = quickInputService;
    this._dynamicDisposables = this._register(new DisposableStore());
    /** Owns the blink animation's `animationend` listener, kept across re-renders. */
    this._blinkListener = this._register(new MutableDisposable());
    /** Guard to prevent re-entrant rendering */
    this._isRendering = false;
    this._blockedSessionsVisibleContext = SessionsBlockedSessionsVisibleContext.bindTo(contextKeyService);
    this._sessionActionFeedback = sessionActionFeedback ?? this._register(new SessionActionFeedback());
    this._blockedIndicator = this._register(this.instantiationService.createInstance(BlockedSessionsIndicatorModel, approvalModel, blockedSessions, ciFixModel));
    this._register(this._blockedIndicator.onDidRequestBlink(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(autorun((reader) => {
      const sessionData = this.sessionsService.activeSession.read(reader);
      if (sessionData) {
        sessionData.title.read(reader);
        sessionData.workspace.read(reader);
        sessionData.isQuickChat?.read(reader);
      }
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(autorun((reader) => {
      const blocked = this._blockedIndicator.blockedSessions.read(reader);
      this._sessionActionFeedback.approvedCount.read(reader);
      this._blockedIndicator.requiresInputKind.read(reader);
      if (this._openContextView && this._blockedList) {
        this._blockedList.setSessions(blocked.map((entry) => entry.session));
        this.contextViewService.layout();
      }
      this._render();
    }));
    this._register(this.sessionsManagementService.onDidChangeSessions(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(toDisposable(() => this._openContextView?.close()));
  }
  render(container) {
    super.render(container);
    this._container = container;
    container.classList.add("agent-sessions-titlebar-container");
    this._render();
  }
  setFocusable(_focusable) {
  }
  // Override onClick to prevent the base class from running the underlying
  // submenu action when the widget handles clicks itself.
  onClick() {
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
      const approvedCount = this._sessionActionFeedback.approvedCount.get();
      const blockedCount = this._blockedIndicator.blockedSessions.get().length;
      const requiresInput = blockedCount > 0;
      const showApproved = approvedCount > 0;
      const showRequiresInput = requiresInput && !showApproved;
      const shouldBlink = showRequiresInput && this._blockedIndicator.consumePendingBlink();
      const requiresInputKind = this._blockedIndicator.requiresInputKind.get();
      let renderState;
      if (showApproved) {
        renderState = `approved|${approvedCount}`;
      } else if (showRequiresInput) {
        renderState = `blocked|${blockedCount}|${requiresInputKind ?? "mixed"}`;
      } else {
        const icon = this._getActiveSessionIcon();
        const sessionTitle = this._getSessionTitle() ?? getUntitledSessionTitle(this.sessionsService.activeSession.get()?.isQuickChat?.get() ?? false);
        const workspaceLabel = this._getRepositoryLabel();
        renderState = `normal|${icon?.id ?? ""}|${sessionTitle ?? ""}|${workspaceLabel ?? ""}`;
      }
      if (this._lastRenderState === renderState) {
        return;
      }
      this._lastRenderState = renderState;
      if (!requiresInput && this._openContextView) {
        this._openContextView.close();
      }
      reset(this._container);
      this._dynamicDisposables.clear();
      this._container.removeAttribute("aria-hidden");
      this._container.setAttribute("role", "button");
      this._container.tabIndex = 0;
      if (!(showRequiresInput && !shouldBlink)) {
        this._container.classList.remove("agent-sessions-titlebar-blink");
      }
      this._container.classList.toggle("agent-sessions-titlebar-requires-input", showRequiresInput);
      this._container.classList.toggle("agent-sessions-titlebar-approved", showApproved);
      if (showApproved) {
        this._renderApproved(approvedCount);
      } else if (showRequiresInput) {
        this._renderRequiresInput(blockedCount, requiresInputKind, shouldBlink);
      } else {
        this._renderActiveSession();
      }
    } finally {
      this._isRendering = false;
    }
  }
  /**
   * Render the active-session pill: icon + title + workspace. Clicking opens the
   * sessions picker.
   */
  _renderActiveSession() {
    const container = this._container;
    container.setAttribute("aria-label", localize("agentSessionsShowSessions", "Show Sessions"));
    const icon = this._getActiveSessionIcon();
    const sessionTitle = this._getSessionTitle() ?? getUntitledSessionTitle(this.sessionsService.activeSession.get()?.isQuickChat?.get() ?? false);
    const workspaceLabel = this._getRepositoryLabel();
    const sessionPill = $("div.agent-sessions-titlebar-pill");
    const centerGroup = $("div.agent-sessions-titlebar-center");
    if (icon) {
      const iconEl = $("div.agent-sessions-titlebar-icon" + ThemeIcon.asCSSSelector(icon));
      centerGroup.appendChild(iconEl);
    }
    if (sessionTitle) {
      const titleEl = $("div.agent-sessions-titlebar-title");
      titleEl.textContent = sessionTitle;
      centerGroup.appendChild(titleEl);
    }
    if (workspaceLabel) {
      const separatorEl = $("div.agent-sessions-titlebar-separator");
      centerGroup.appendChild(separatorEl);
      const workspaceEl = $("div.agent-sessions-titlebar-workspace");
      workspaceEl.textContent = workspaceLabel;
      centerGroup.appendChild(workspaceEl);
    }
    sessionPill.appendChild(centerGroup);
    this._dynamicDisposables.add(addDisposableGenericMouseDownListener(sessionPill, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }));
    this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showSessionsPicker();
    }));
    container.appendChild(sessionPill);
    this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this._showSessionsPicker();
      }
    }));
  }
  /**
   * Render the requires-input pill. Clicking toggles a dropdown that lists the
   * blocked sessions below the command center box.
   */
  _renderRequiresInput(count, kind, shouldBlink) {
    const container = this._container;
    const label = this._blockedIndicator.getRequiresInputLabel(count, kind);
    container.setAttribute("aria-label", label);
    const pill = $("div.agent-sessions-titlebar-pill");
    const labelEl = $("div.agent-sessions-titlebar-requires-input-label");
    labelEl.textContent = label;
    pill.appendChild(labelEl);
    this._dynamicDisposables.add(addDisposableGenericMouseDownListener(pill, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }));
    this._dynamicDisposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._toggleBlockedSessions();
    }));
    container.appendChild(pill);
    this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this._toggleBlockedSessions();
      }
    }));
    if (shouldBlink) {
      this._triggerAttentionBlink();
    }
  }
  /**
   * Render the transient green "Approved N sessions" confirmation shown briefly
   * after the user approves one or more sessions' pending actions from the list.
   */
  _renderApproved(count) {
    const container = this._container;
    const label = count === 1 ? localize("oneSessionApproved", "Approved 1 session") : localize("nSessionsApproved", "Approved {0} sessions", count);
    container.setAttribute("aria-label", label);
    const pill = $("div.agent-sessions-titlebar-pill");
    const labelEl = $("div.agent-sessions-titlebar-approved-label");
    labelEl.textContent = label;
    pill.appendChild(labelEl);
    this._dynamicDisposables.add(addDisposableGenericMouseDownListener(pill, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }));
    this._dynamicDisposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._activateDefaultAction();
    }));
    container.appendChild(pill);
    this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this._activateDefaultAction();
      }
    }));
  }
  /**
   * Activate the widget as its non-approved state would: reveal the blocked
   * sessions when the requires-input state applies, otherwise the sessions picker.
   */
  _activateDefaultAction() {
    const requiresInput = this._blockedIndicator.blockedSessions.get().length > 0;
    if (requiresInput) {
      this._toggleBlockedSessions();
    } else {
      this._showSessionsPicker();
    }
  }
  /**
   * Restart the attention blink animation on the command center box. Re-adding
   * the class after a forced reflow guarantees the CSS animation replays even
   * when the container element persists across renders.
   */
  _triggerAttentionBlink() {
    const container = this._container;
    if (!container) {
      return;
    }
    container.classList.remove("agent-sessions-titlebar-blink");
    container.getBoundingClientRect();
    container.classList.add("agent-sessions-titlebar-blink");
    this._blinkListener.value = addDisposableListener(container, "animationend", () => {
      container.classList.remove("agent-sessions-titlebar-blink");
      this._blinkListener.clear();
    });
  }
  /**
   * Toggle the blocked-sessions dropdown open/closed.
   */
  _toggleBlockedSessions() {
    if (this._openContextView) {
      this._openContextView.close();
      return;
    }
    this._showBlockedSessions();
  }
  /**
   * Show the blocked sessions as a flat list in a dropdown anchored below the
   * command center box.
   */
  _showBlockedSessions() {
    const container = this._container;
    if (!container) {
      return;
    }
    if (this._blockedIndicator.blockedSessions.get().length === 0) {
      return;
    }
    const width = this._computeBlockedDropdownWidth(container);
    const store = new DisposableStore();
    this._openContextView = this.contextViewService.showContextView({
      getAnchor: () => this._getBlockedDropdownAnchor(container),
      anchorAlignment: AnchorAlignment.LEFT,
      anchorPosition: AnchorPosition.BELOW,
      render: (viewContainer) => {
        const list = store.add(this.instantiationService.createInstance(BlockedSessionsList, viewContainer, {
          width,
          approvalModel: this._blockedIndicator.approvalModel,
          ciFixModel: this._blockedIndicator.ciFixModel,
          onSessionOpen: (resource, preserveFocus, sideBySide) => {
            this._openContextView?.close();
            this._openBlockedSession(resource, preserveFocus, sideBySide);
          },
          onIgnoreSession: (session) => this._blockedIndicator.ignoreSession(session),
          onShowAllSessions: () => {
            this._openContextView?.close();
            this._showSessionsPicker();
          },
          onIgnoreAllSessions: () => this._blockedIndicator.ignoreAllSessions(),
          onClose: () => this._openContextView?.close()
        }));
        list.setSessions(this._blockedIndicator.blockedSessions.get().map((entry) => entry.session));
        store.add(list.onDidChangeContentHeight(() => this.contextViewService.layout()));
        store.add(list.onDidApproveSession((approved) => {
          this._blockedIndicator.dismissApproval(approved);
          this._sessionActionFeedback.notifyApproved();
        }));
        store.add(this.layoutService.onDidLayoutActiveContainer(() => {
          list.setWidth(this._computeBlockedDropdownWidth(container));
          this.contextViewService.layout();
        }));
        store.add(this.quickInputService.onShow(() => this._openContextView?.close()));
        this._blockedList = list;
        return store;
      },
      focus: () => this._blockedList?.focus(),
      onDOMEvent: (e) => {
        if (e.type === EventType.CLICK) {
          const target = e.target;
          if (target && !isAncestor(target, this.contextViewService.getContextViewElement()) && !isAncestor(target, container)) {
            this._openContextView?.close();
          }
        }
      },
      onHide: () => {
        this._blockedSessionsVisibleContext.set(false);
        store.dispose();
        this._openContextView = void 0;
        openBlockedSessionsView = void 0;
        this._blockedList = void 0;
      }
    });
    openBlockedSessionsView = this._openContextView;
    this._blockedSessionsVisibleContext.set(true);
  }
  /**
   * Compute the width of the blocked-sessions dropdown: at least as wide as the
   * command center box (the anchor) and {@link BLOCKED_DROPDOWN_MIN_WIDTH}, but
   * never wider than {@link BLOCKED_DROPDOWN_MAX_WIDTH_RATIO} of the window so it
   * stays within the viewport on narrow layouts.
   */
  _computeBlockedDropdownWidth(container) {
    const anchorWidth = getDomNodePagePosition(container).width;
    const windowWidth = getWindow(container).innerWidth;
    const minWidth = Math.max(anchorWidth, BLOCKED_DROPDOWN_MIN_WIDTH);
    const maxWidth = windowWidth * BLOCKED_DROPDOWN_MAX_WIDTH_RATIO;
    return Math.round(Math.min(minWidth, maxWidth));
  }
  /**
   * Anchor the blocked-sessions dropdown so it is horizontally centered on the
   * command center box. Because the dropdown can be wider than the box, we hand
   * the context view a zero-width anchor positioned at the dropdown's target
   * left edge (the box center minus half the dropdown width).
   */
  _getBlockedDropdownAnchor(container) {
    const position = getDomNodePagePosition(container);
    const width = this._computeBlockedDropdownWidth(container);
    const centerX = position.left + position.width / 2;
    return {
      x: Math.round(centerX - width / 2),
      y: position.top,
      width: 0,
      height: position.height
    };
  }
  _openBlockedSession(resource, preserveFocus, sideBySide) {
    if (sideBySide) {
      const session = this.sessionsManagementService.getSession(resource);
      if (session) {
        openSessionToTheSide(this.sessionsService, session, { preserveFocus }).catch(onUnexpectedError);
        return;
      }
    }
    this.sessionsService.openSession(resource, { preserveFocus }).catch(onUnexpectedError);
  }
  /**
   * Get the icon for the active session's type.
   */
  _getActiveSessionIcon() {
    const sessionData = this.sessionsService.activeSession.get();
    if (sessionData) {
      return sessionData.icon;
    }
    return void 0;
  }
  /**
   * Get the display title for the active session.
   */
  _getSessionTitle() {
    const sessionData = this.sessionsService.activeSession.get();
    return sessionData?.title.get()?.trim() || void 0;
  }
  /**
   * Get the repository label for the active session.
   */
  _getRepositoryLabel() {
    const sessionData = this.sessionsService.activeSession.get();
    if (sessionData) {
      const workspace = sessionData.workspace.get();
      if (workspace) {
        return workspace.label;
      }
    }
    return void 0;
  }
  _showSessionsPicker() {
    this.commandService.executeCommand(SHOW_SESSIONS_PICKER_COMMAND_ID);
  }
};
SessionsTitleBarWidget = __decorateClass([
  __decorateParam(6, ISessionsManagementService),
  __decorateParam(7, ISessionsService),
  __decorateParam(8, ISessionsProvidersService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IContextViewService),
  __decorateParam(11, IWorkbenchLayoutService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IContextKeyService),
  __decorateParam(14, IQuickInputService)
], SessionsTitleBarWidget);
let SessionsTitleBarContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService) {
    super();
    this._register(MenuRegistry.appendMenuItem(Menus.CommandCenter, {
      submenu: Menus.TitleBarSessionTitle,
      title: localize("agentSessionsControl", "Agent Sessions"),
      order: 101,
      when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), SessionsWelcomeVisibleContext.negate())
    }));
    this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionTitle, {
      command: {
        id: SHOW_SESSIONS_PICKER_COMMAND_ID,
        title: localize("showSessions", "Show Sessions")
      },
      group: "a_sessions",
      order: 1,
      when: IsAuxiliaryWindowContext.negate()
    }));
    this._register(registerBlockedSessionsHeaderCommands());
    this._register(registerBlockedSessionsHeaderActions());
    this._register(registerBlockedSessionsItemActions());
    this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => {
      if (!(action instanceof SubmenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(SessionsTitleBarWidget, action, options, void 0, void 0, void 0, void 0);
    }, void 0));
  }
};
SessionsTitleBarContribution.ID = "workbench.contrib.agentSessionsTitleBar";
SessionsTitleBarContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService)
], SessionsTitleBarContribution);
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
  weight: KeybindingWeight.SessionsContrib + 100,
  when: SessionsBlockedSessionsVisibleContext,
  primary: KeyCode.Escape,
  handler: (_accessor, context) => {
    if (context) {
      context.close();
    } else {
      openBlockedSessionsView?.close();
    }
  }
});
export {
  SessionsTitleBarContribution,
  SessionsTitleBarWidget,
  registerBlockedSessionsHeaderActions,
  registerBlockedSessionsHeaderCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1RpdGxlQmFyV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3Nlc3Npb25zVGl0bGVCYXJXaWRnZXQuY3NzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBnZXREb21Ob2RlUGFnZVBvc2l0aW9uLCBnZXRXaW5kb3csIGlzQW5jZXN0b3IsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQsIEFuY2hvclBvc2l0aW9uLCBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF5b3V0LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlLCBJT3BlbkNvbnRleHRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0Jsb2NrZWRTZXNzaW9uc1Zpc2libGVDb250ZXh0LCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU0hPV19TRVNTSU9OU19QSUNLRVJfQ09NTUFORF9JRCB9IGZyb20gJy4vc2Vzc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0VW50aXRsZWRTZXNzaW9uVGl0bGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBCbG9ja2VkU2Vzc2lvbnMgfSBmcm9tICcuLi8uLi9ibG9ja2VkU2Vzc2lvbnMvYnJvd3Nlci9ibG9ja2VkU2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25zTGlzdCwgSUJsb2NrZWRTZXNzaW9uc0hlYWRlckFjdGlvbkNvbnRleHQsIHJlZ2lzdGVyQmxvY2tlZFNlc3Npb25zSXRlbUFjdGlvbnMgfSBmcm9tICcuL2Jsb2NrZWRTZXNzaW9uc0xpc3QuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCB9IGZyb20gJy4vYmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQWN0aW9uRmVlZGJhY2sgfSBmcm9tICcuL3Nlc3Npb25BY3Rpb25GZWVkYmFjay5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBCbG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbCwgUmVxdWlyZXNJbnB1dEtpbmQgfSBmcm9tICcuL2Jsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsLmpzJztcbmltcG9ydCB7IG9wZW5TZXNzaW9uVG9UaGVTaWRlIH0gZnJvbSAnLi92aWV3cy9zZXNzaW9uc1ZpZXcuanMnO1xuXG4vKipcbiAqIEludGVybmFsIGNvbW1hbmQgYmVoaW5kIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIGhlYWRlcidzIFwiU2hvdyBBbGxcbiAqIFNlc3Npb25zXCIgYWN0aW9uOiBpdCBkaXNtaXNzZXMgdGhlIGRyb3Bkb3duIChhIHRyYW5zaWVudCBjb250ZXh0IHZpZXcpIGJlZm9yZVxuICogb3BlbmluZyB0aGUgZnVsbCBzZXNzaW9ucyBwaWNrZXIgc28gdGhlIHBvcHVwIGRvZXNuJ3QgbGluZ2VyIGJlaGluZCBpdC5cbiAqL1xuY29uc3QgU0hPV19BTExfU0VTU0lPTlNfRlJPTV9CTE9DS0VEX0xJU1RfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5ibG9ja2VkU2Vzc2lvbnMuc2hvd0FsbFNlc3Npb25zJztcblxuLyoqIEludGVybmFsIGNvbW1hbmQgYmVoaW5kIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIGhlYWRlcidzIGJ1bGstaWdub3JlIGFjdGlvbi4gKi9cbmNvbnN0IElHTk9SRV9BTExfSU5QVVRfTkVFREVEX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnMuYmxvY2tlZFNlc3Npb25zLmlnbm9yZUFsbElucHV0TmVlZGVkJztcblxuLyoqXG4gKiBJbnRlcm5hbCBjb21tYW5kIHRoYXQgZGlzbWlzc2VzIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duLiBCb3VuZCB0byBFc2NhcGVcbiAqIChzY29wZWQgdG8ge0BsaW5rIFNlc3Npb25zQmxvY2tlZFNlc3Npb25zVmlzaWJsZUNvbnRleHR9KSBzbyB0aGUgZHJvcGRvd24gY2FuXG4gKiBiZSBjbG9zZWQgZnJvbSBhbnl3aGVyZSBpbiB0aGUgc2Vzc2lvbnMgd2luZG93IHdoaWxlIGl0IGlzIG9wZW4sIG5vdCBvbmx5IHdoZW5cbiAqIGZvY3VzIGhhcHBlbnMgdG8gYmUgaW5zaWRlIGl0LlxuICovXG5jb25zdCBISURFX0JMT0NLRURfU0VTU0lPTlNfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5ibG9ja2VkU2Vzc2lvbnMuaGlkZSc7XG5cbi8qKiBSZWdpc3RlciB0aGUgYWN0aW9ucyBzaG93biBpbiB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBoZWFkZXIgdG9vbGJhci4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckJsb2NrZWRTZXNzaW9uc0hlYWRlckFjdGlvbnMoKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5CbG9ja2VkU2Vzc2lvbnNIZWFkZXIsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFNIT1dfQUxMX1NFU1NJT05TX0ZST01fQkxPQ0tFRF9MSVNUX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2hvd0FsbFNlc3Npb25zJywgXCJTaG93IEFsbCBTZXNzaW9uc1wiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5saXN0U2VsZWN0aW9uLFxuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRvcmRlcjogMSxcblx0XHR9KSxcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuQmxvY2tlZFNlc3Npb25zSGVhZGVyLCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBJR05PUkVfQUxMX0lOUFVUX05FRURFRF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2lnbm9yZUFsbElucHV0TmVlZGVkJywgXCJJZ25vcmUgQWxsIElucHV0IE5lZWRlZFwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5iZWxsU2xhc2gsXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAyLFxuXHRcdH0pLFxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5CbG9ja2VkU2Vzc2lvbnNIZWFkZXIsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IEhJREVfQkxPQ0tFRF9TRVNTSU9OU19DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQmxvY2tlZFNlc3Npb25zJywgXCJDbG9zZVwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ3pfY2xvc2UnLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0fSksXG5cdCk7XG59XG5cbi8qKiBSZWdpc3RlciB0aGUgY29tbWFuZHMgaW52b2tlZCBieSB0aGUgYmxvY2tlZC1zZXNzaW9ucyBoZWFkZXIgdG9vbGJhci4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckJsb2NrZWRTZXNzaW9uc0hlYWRlckNvbW1hbmRzKCk6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChTSE9XX0FMTF9TRVNTSU9OU19GUk9NX0JMT0NLRURfTElTVF9DT01NQU5EX0lELCAoX2FjY2Vzc29yLCBjb250ZXh0OiBJQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9uQ29udGV4dCkgPT4ge1xuXHRcdFx0Y29udGV4dC5zaG93QWxsU2Vzc2lvbnMoKTtcblx0XHR9KSxcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChJR05PUkVfQUxMX0lOUFVUX05FRURFRF9DT01NQU5EX0lELCAoX2FjY2Vzc29yLCBjb250ZXh0OiBJQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9uQ29udGV4dCkgPT4ge1xuXHRcdFx0Y29udGV4dC5pZ25vcmVBbGxTZXNzaW9ucygpO1xuXHRcdH0pLFxuXHQpO1xufVxuXG4vKipcbiAqIFRoZSBjdXJyZW50bHktb3BlbiBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duLCBzaGFyZWQgd2l0aCB0aGUgRXNjYXBlIGNvbW1hbmQgc29cbiAqIGl0IGNsb3NlcyB0aGlzIHNwZWNpZmljIGNvbnRleHQgdmlldy5cbiAqL1xubGV0IG9wZW5CbG9ja2VkU2Vzc2lvbnNWaWV3OiBJT3BlbkNvbnRleHRWaWV3IHwgdW5kZWZpbmVkO1xuXG4vKipcbiAqIE1pbmltdW0gd2lkdGggb2YgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24sIGluIHBpeGVscy4gVGhlIGRyb3Bkb3duIGlzIGF0XG4gKiBsZWFzdCBhcyB3aWRlIGFzIHRoZSBjb21tYW5kIGNlbnRlciBib3ggaXQgaGFuZ3Mgb2ZmLCBidXQgbmV2ZXIgbmFycm93ZXIgdGhhblxuICogdGhpcyBzbyBpdHMgcm93cyBoYXZlIHJvb20gdG8gYnJlYXRoZS5cbiAqL1xuY29uc3QgQkxPQ0tFRF9EUk9QRE9XTl9NSU5fV0lEVEggPSA1NTA7XG5cbi8qKlxuICogTWF4aW11bSB3aWR0aCBvZiB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBhcyBhIGZyYWN0aW9uIG9mIHRoZSB3aW5kb3dcbiAqIHdpZHRoLCBzbyBpdCBuZXZlciBzcGFucyAobmVhcmx5KSB0aGUgZW50aXJlIHdpbmRvdyBvbiBuYXJyb3cgbGF5b3V0cy5cbiAqL1xuY29uc3QgQkxPQ0tFRF9EUk9QRE9XTl9NQVhfV0lEVEhfUkFUSU8gPSAwLjk7XG5cbi8qKlxuICogU2Vzc2lvbnMgVGl0bGUgQmFyIFdpZGdldCAtIHJlbmRlcnMgdGhlIGFjdGl2ZSBjaGF0IHNlc3Npb25cbiAqIGluIHRoZSBjb21tYW5kIGNlbnRlciBvZiB0aGUgYWdlbnQgc2Vzc2lvbnMgd29ya2JlbmNoLlxuICpcbiAqIFNob3dzIHRoZSBjdXJyZW50IGNoYXQgc2Vzc2lvbiBhcyBhIGNsaWNrYWJsZSBwaWxsIHdpdGg6XG4gKiAtIEtpbmQgaWNvbiBhdCB0aGUgYmVnaW5uaW5nIChwcm92aWRlciB0eXBlIGljb24pXG4gKiAtIFJlcG9zaXRvcnkgZm9sZGVyIG5hbWUgYW5kIGFjdGl2ZSBicmFuY2gvd29ya3RyZWUgbmFtZSB3aGVuIGF2YWlsYWJsZVxuICpcbiAqIFdoZW4gYXQgbGVhc3Qgb25lIHNlc3Npb24gaXMgYmxvY2tlZCAobmVlZHMgaW5wdXQgb3IgaGFzIGZhaWxpbmcgQ0kgY2hlY2tzKSxcbiAqIHRoZSB3aWRnZXQgaW5zdGVhZCBhZG9wdHMgYW4gb3JhbmdlIFwiTiBzZXNzaW9ucyByZXF1aXJlIGlucHV0XCIgc3RhdGUgYW5kIHJldmVhbHMgdGhvc2Ugc2Vzc2lvbnMgYXMgYVxuICogZmxhdCBsaXN0IGluIGEgZHJvcGRvd24gYW5jaG9yZWQgYmVsb3cgdGhlIGNvbW1hbmQgY2VudGVyIGJveC4gQSBzaG9ydCBibGlua1xuICogYW5pbWF0aW9uIHBsYXlzIHdoZW5ldmVyIGEgbmV3IHNlc3Npb24gYmVjb21lcyBibG9ja2VkLiBJbiBldmVyeSBvdGhlciBjYXNlIGl0XG4gKiBiZWhhdmVzIGFzIHRoZSBhY3RpdmUtc2Vzc2lvbiBwaWxsIGFuZCBvcGVucyB0aGUgc2Vzc2lvbnMgcGlja2VyIG9uIGNsaWNrLlxuICpcbiAqIFRoZSByZXF1aXJlcy1pbnB1dCBsb2dpYyAod2hpY2ggYmxvY2tlZCBzZXNzaW9ucyB0byBzdXJmYWNlLCB0aGUgaG9tb2dlbmVvdXNcbiAqIHJlYXNvbiwgbGFiZWxzIGFuZCB3aGVuIHRvIGJsaW5rKSBpcyBvd25lZCBieSB7QGxpbmsgQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWx9O1xuICogdGhpcyB3aWRnZXQgb25seSByZW5kZXJzIGl0LlxuICpcbiAqIFNlc3Npb24gYWN0aW9ucyAoY2hhbmdlcywgdGVybWluYWwsIGV0Yy4pIGFyZSByZW5kZXJlZCB2aWEgdGhlXG4gKiBTZXNzaW9uVGl0bGVBY3Rpb25zIG1lbnUgdG9vbGJhciBuZXh0IHRvIHRoaXMgd2lkZ2V0LlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNUaXRsZUJhcldpZGdldCBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZHluYW1pY0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHQvKiogT3ducyB0aGUgYmxpbmsgYW5pbWF0aW9uJ3MgYGFuaW1hdGlvbmVuZGAgbGlzdGVuZXIsIGtlcHQgYWNyb3NzIHJlLXJlbmRlcnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JsaW5rTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0LyoqIENhY2hlZCByZW5kZXIgc3RhdGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgRE9NIHJlYnVpbGRzICovXG5cdHByaXZhdGUgX2xhc3RSZW5kZXJTdGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBHdWFyZCB0byBwcmV2ZW50IHJlLWVudHJhbnQgcmVuZGVyaW5nICovXG5cdHByaXZhdGUgX2lzUmVuZGVyaW5nID0gZmFsc2U7XG5cblx0LyoqIE1vZGVsIGJlaGluZCB0aGUgXCJOIHNlc3Npb25zIHJlcXVpcmUgaW5wdXRcIiBpbmRpY2F0b3IgKGJsb2NrZWQtc2Vzc2lvbiBzZXQsIGJsaW5rLCBsYWJlbHMpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ibG9ja2VkSW5kaWNhdG9yOiBCbG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbDtcblxuXHQvKiogVGhlIGN1cnJlbnRseSBvcGVuIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24sIGlmIGFueS4gKi9cblx0cHJpdmF0ZSBfb3BlbkNvbnRleHRWaWV3OiBJT3BlbkNvbnRleHRWaWV3IHwgdW5kZWZpbmVkO1xuXHQvKiogVGhlIGJsb2NrZWQtc2Vzc2lvbnMgbGlzdCByZW5kZXJlZCBpbnNpZGUgdGhlIG9wZW4gZHJvcGRvd24sIGlmIGFueS4gKi9cblx0cHJpdmF0ZSBfYmxvY2tlZExpc3Q6IEJsb2NrZWRTZXNzaW9uc0xpc3QgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFRyYWNrcyB3aGV0aGVyIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIGlzIG9wZW4gKGRyaXZlcyB0aGUgRXNjYXBlIGtleWJpbmRpbmcpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ibG9ja2VkU2Vzc2lvbnNWaXNpYmxlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0LyoqIERyaXZlcyB0aGUgdHJhbnNpZW50IFwiQXBwcm92ZWQgTiBzZXNzaW9uc1wiIGNvbmZpcm1hdGlvbi4gT3duZWQgYnkgdGhlIHdpZGdldC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkFjdGlvbkZlZWRiYWNrOiBTZXNzaW9uQWN0aW9uRmVlZGJhY2s7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBTdWJtZW51SXRlbUFjdGlvbixcblx0XHRvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRzZXNzaW9uQWN0aW9uRmVlZGJhY2s6IFNlc3Npb25BY3Rpb25GZWVkYmFjayB8IHVuZGVmaW5lZCxcblx0XHRhcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdGJsb2NrZWRTZXNzaW9uczogQmxvY2tlZFNlc3Npb25zIHwgdW5kZWZpbmVkLFxuXHRcdGNpRml4TW9kZWw6IEJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLl9ibG9ja2VkU2Vzc2lvbnNWaXNpYmxlQ29udGV4dCA9IFNlc3Npb25zQmxvY2tlZFNlc3Npb25zVmlzaWJsZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFRoZSB3aWRnZXQgb3ducyB0aGUgYXBwcm92YWwtZmVlZGJhY2sgc3RhdGU7IHRoZSBvcHRpb25hbCBwYXJhbWV0ZXIgaXMgYVxuXHRcdC8vIHRlc3Qgc2VhbSBzbyBmaXh0dXJlcyBjYW4gc3VwcGx5IGEgcHJlc2V0IGluc3RhbmNlLlxuXHRcdHRoaXMuX3Nlc3Npb25BY3Rpb25GZWVkYmFjayA9IHNlc3Npb25BY3Rpb25GZWVkYmFjayA/PyB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbkFjdGlvbkZlZWRiYWNrKCkpO1xuXG5cdFx0Ly8gVGhlIGJsb2NrZWQtc2Vzc2lvbiBpbmRpY2F0b3IgbW9kZWwgb3ducyB0aGUgcmVxdWlyZXMtaW5wdXQgbG9naWMgKHRoZVxuXHRcdC8vIHZpc2libGUtZmlsdGVyZWQgYmxvY2tlZCBzZXQsIHRoZSByZXF1aXJlcy1pbnB1dCBraW5kLCBvcHRpbWlzdGljIGFwcHJvdmFsXG5cdFx0Ly8gZGlzbWlzc2FscywgbGFiZWxzIGFuZCBibGluayBkZXRlY3Rpb24pLiBUaGUgb3B0aW9uYWwgYGFwcHJvdmFsTW9kZWxgLFxuXHRcdC8vIGBibG9ja2VkU2Vzc2lvbnNgIGFuZCBgY2lGaXhNb2RlbGAgYXJlIHRlc3Qgc2VhbXMgZm9yd2FyZGVkIHRvIGl0IHNvXG5cdFx0Ly8gZml4dHVyZXMgY2FuIHByZXNldCB0aGVtLlxuXHRcdHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsLCBhcHByb3ZhbE1vZGVsLCBibG9ja2VkU2Vzc2lvbnMsIGNpRml4TW9kZWwpKTtcblxuXHRcdC8vIFJlcGxheSB0aGUgYXR0ZW50aW9uIGJsaW5rIHdoZW4gdGhlIG1vZGVsIHJlcG9ydHMgYSBnZW51aW5lbHkgbmV3LCBub3QteWV0LVxuXHRcdC8vIHZpc2libGUgYmxvY2suIEludmFsaWRhdGUgdGhlIGNhY2hlZCByZW5kZXIgc3RhdGUgc28gdGhlIGlkZW50aWNhbCBwaWxsIGlzXG5cdFx0Ly8gcmVidWlsdCB3aXRoIHRoZSBibGluayBjbGFzcyAoc2VlIGBfcmVuZGVyYCkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYmxvY2tlZEluZGljYXRvci5vbkRpZFJlcXVlc3RCbGluaygoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24ncyB0aXRsZSwgd29ya3NwYWNlLCBvciBxdWljay1jaGF0IGtpbmQgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc2Vzc2lvbkRhdGEpIHtcblx0XHRcdFx0c2Vzc2lvbkRhdGEudGl0bGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRzZXNzaW9uRGF0YS53b3Jrc3BhY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRzZXNzaW9uRGF0YS5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGFzdFJlbmRlclN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gdGhlIHNldCBvZiBibG9ja2VkIHNlc3Npb25zIGNoYW5nZXM7IGl0IGZlZWRzIHRoZVxuXHRcdC8vIFwiTiBzZXNzaW9ucyByZXF1aXJlIGlucHV0XCIgc3RhdGUuIEtlZXAgYW4gb3BlbiBkcm9wZG93biBpbiBzeW5jLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGJsb2NrZWQgPSB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmJsb2NrZWRTZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9zZXNzaW9uQWN0aW9uRmVlZGJhY2suYXBwcm92ZWRDb3VudC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLnJlcXVpcmVzSW5wdXRLaW5kLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh0aGlzLl9vcGVuQ29udGV4dFZpZXcgJiYgdGhpcy5fYmxvY2tlZExpc3QpIHtcblx0XHRcdFx0dGhpcy5fYmxvY2tlZExpc3Quc2V0U2Vzc2lvbnMoYmxvY2tlZC5tYXAoZW50cnkgPT4gZW50cnkuc2Vzc2lvbikpO1xuXHRcdFx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZS5sYXlvdXQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIHNlc3Npb25zIGRhdGEgY2hhbmdlcyAoZS5nLiwgY2hhbmdlcyBpbmZvIHVwZGF0ZWQpXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlclN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gcHJvdmlkZXJzIGNoYW5nZSAoYWZmZWN0cyBwcm92aWRlciBwaWNrZXIgdmlzaWJpbGl0eSlcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFbnN1cmUgYW55IG9wZW4gZHJvcGRvd24gaXMgY2xvc2VkIHdoZW4gdGhlIHdpZGdldCBpcyBkaXNwb3NlZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fb3BlbkNvbnRleHRWaWV3Py5jbG9zZSgpKSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9ucy10aXRsZWJhci1jb250YWluZXInKTtcblxuXHRcdC8vIEluaXRpYWwgcmVuZGVyXG5cdFx0dGhpcy5fcmVuZGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRGb2N1c2FibGUoX2ZvY3VzYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIERvbid0IHNldCBmb2N1c2FibGUgb24gdGhlIGNvbnRhaW5lclxuXHR9XG5cblx0Ly8gT3ZlcnJpZGUgb25DbGljayB0byBwcmV2ZW50IHRoZSBiYXNlIGNsYXNzIGZyb20gcnVubmluZyB0aGUgdW5kZXJseWluZ1xuXHQvLyBzdWJtZW51IGFjdGlvbiB3aGVuIHRoZSB3aWRnZXQgaGFuZGxlcyBjbGlja3MgaXRzZWxmLlxuXHRvdmVycmlkZSBvbkNsaWNrKCk6IHZvaWQge1xuXHRcdC8vIE5vLW9wOiBjbGljayBoYW5kbGluZyBpcyBkb25lIGJ5IHRoZSBwaWxsIGhhbmRsZXJcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc1JlbmRlcmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc1JlbmRlcmluZyA9IHRydWU7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXBwcm92ZWRDb3VudCA9IHRoaXMuX3Nlc3Npb25BY3Rpb25GZWVkYmFjay5hcHByb3ZlZENvdW50LmdldCgpO1xuXHRcdFx0Y29uc3QgYmxvY2tlZENvdW50ID0gdGhpcy5fYmxvY2tlZEluZGljYXRvci5ibG9ja2VkU2Vzc2lvbnMuZ2V0KCkubGVuZ3RoO1xuXHRcdFx0Y29uc3QgcmVxdWlyZXNJbnB1dCA9IGJsb2NrZWRDb3VudCA+IDA7XG5cblx0XHRcdC8vIFRoZSB0cmFuc2llbnQgXCJBcHByb3ZlZCBOIHNlc3Npb25zXCIgY29uZmlybWF0aW9uIHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGVcblx0XHRcdC8vIHJlcXVpcmVzLWlucHV0IHN0YXRlIHdoaWxlIGl0IGlzIHNob3dpbmcuXG5cdFx0XHRjb25zdCBzaG93QXBwcm92ZWQgPSBhcHByb3ZlZENvdW50ID4gMDtcblx0XHRcdGNvbnN0IHNob3dSZXF1aXJlc0lucHV0ID0gcmVxdWlyZXNJbnB1dCAmJiAhc2hvd0FwcHJvdmVkO1xuXG5cdFx0XHQvLyBUaGUgYXR0ZW50aW9uIGJsaW5rIGZpcmVzIG9ubHkgd2hlbiB0aGUgaW5kaWNhdG9yIG1vZGVsIHJlcG9ydHMgYVxuXHRcdFx0Ly8gKmdlbnVpbmVseSBuZXcqIGJsb2NrZWQgc2Vzc2lvbiB3aGlsZSB0aGUgcmVxdWlyZXMtaW5wdXQgc3RhdGUgaXMgc2hvd24gXHUyMDE0XG5cdFx0XHQvLyBpbmNsdWRpbmcgdGhlIHZlcnkgZmlyc3Qgb25lLiBgY29uc3VtZVBlbmRpbmdCbGlua2AgaXMgc2hvcnQtY2lyY3VpdGVkIHNvXG5cdFx0XHQvLyB0aGUgcGVuZGluZyBibGluayBpcyBvbmx5IGNvbnN1bWVkIHdoZW4gaXQgYWN0dWFsbHkgcGxheXM7IG5hdmlnYXRpbmdcblx0XHRcdC8vIGJldHdlZW4gc2Vzc2lvbnMgKHdoaWNoIGNoYW5nZXMgdGhlIHZpc2libGUgc2V0LCBub3QgdGhlIG1vZGVsKSBuZXZlciBibGlua3MuXG5cdFx0XHRjb25zdCBzaG91bGRCbGluayA9IHNob3dSZXF1aXJlc0lucHV0ICYmIHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IuY29uc3VtZVBlbmRpbmdCbGluaygpO1xuXG5cdFx0XHRjb25zdCByZXF1aXJlc0lucHV0S2luZCA9IHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IucmVxdWlyZXNJbnB1dEtpbmQuZ2V0KCk7XG5cblx0XHRcdGxldCByZW5kZXJTdGF0ZTogc3RyaW5nO1xuXHRcdFx0aWYgKHNob3dBcHByb3ZlZCkge1xuXHRcdFx0XHRyZW5kZXJTdGF0ZSA9IGBhcHByb3ZlZHwke2FwcHJvdmVkQ291bnR9YDtcblx0XHRcdH0gZWxzZSBpZiAoc2hvd1JlcXVpcmVzSW5wdXQpIHtcblx0XHRcdFx0cmVuZGVyU3RhdGUgPSBgYmxvY2tlZHwke2Jsb2NrZWRDb3VudH18JHtyZXF1aXJlc0lucHV0S2luZCA/PyAnbWl4ZWQnfWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpY29uID0gdGhpcy5fZ2V0QWN0aXZlU2Vzc2lvbkljb24oKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblRpdGxlID0gdGhpcy5fZ2V0U2Vzc2lvblRpdGxlKCkgPz8gZ2V0VW50aXRsZWRTZXNzaW9uVGl0bGUodGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uaXNRdWlja0NoYXQ/LmdldCgpID8/IGZhbHNlKTtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlTGFiZWwgPSB0aGlzLl9nZXRSZXBvc2l0b3J5TGFiZWwoKTtcblx0XHRcdFx0cmVuZGVyU3RhdGUgPSBgbm9ybWFsfCR7aWNvbj8uaWQgPz8gJyd9fCR7c2Vzc2lvblRpdGxlID8/ICcnfXwke3dvcmtzcGFjZUxhYmVsID8/ICcnfWA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNraXAgcmUtcmVuZGVyIGlmIHN0YXRlIGhhc24ndCBjaGFuZ2VkXG5cdFx0XHRpZiAodGhpcy5fbGFzdFJlbmRlclN0YXRlID09PSByZW5kZXJTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSByZW5kZXJTdGF0ZTtcblxuXHRcdFx0Ly8gQ2xvc2UgdGhlIG9wZW4gYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBvbmx5IHdoZW4gdGhlcmUgYXJlIG5vIGJsb2NrZWRcblx0XHRcdC8vIHNlc3Npb25zIGxlZnQgdG8gc2hvdy4gTm90ZSB0aGlzIGtleXMgb2ZmIGByZXF1aXJlc0lucHV0YCwgbm90XG5cdFx0XHQvLyBgc2hvd1JlcXVpcmVzSW5wdXRgOiBhcHByb3ZpbmcgYSBzZXNzaW9uIHNob3dzIHRoZSB0cmFuc2llbnQgZ3JlZW4gc3RhdGVcblx0XHRcdC8vIChzdXBwcmVzc2luZyBgc2hvd1JlcXVpcmVzSW5wdXRgKSBidXQgdGhlIGRyb3Bkb3duIG11c3Qgc3RheSBvcGVuIHdoaWxlXG5cdFx0XHQvLyBvdGhlciBzZXNzaW9ucyByZW1haW4gYmxvY2tlZCBcdTIwMTQgaXQganVzdCBkcm9wcyB0aGUgYXBwcm92ZWQgcm93LlxuXHRcdFx0aWYgKCFyZXF1aXJlc0lucHV0ICYmIHRoaXMuX29wZW5Db250ZXh0Vmlldykge1xuXHRcdFx0XHR0aGlzLl9vcGVuQ29udGV4dFZpZXcuY2xvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYXIgZXhpc3RpbmcgY29udGVudFxuXHRcdFx0cmVzZXQodGhpcy5fY29udGFpbmVyKTtcblx0XHRcdHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHQvLyBTZXQgdXAgY29udGFpbmVyIGFzIHRoZSBidXR0b24gZGlyZWN0bHlcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJyk7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLnRhYkluZGV4ID0gMDtcblx0XHRcdC8vIFByZXNlcnZlIGFuIGluLXByb2dyZXNzIGJsaW5rIHdoZW4gcmUtcmVuZGVyaW5nIHRoZSBTQU1FIHJlcXVpcmVzLWlucHV0XG5cdFx0XHQvLyBwaWxsIHdpdGhvdXQgYSBuZXcgYmxpbmsuIE90aGVyIGF1dG9ydW5zIChlLmcuIG9uRGlkQ2hhbmdlU2Vzc2lvbnMpXG5cdFx0XHQvLyBpbnZhbGlkYXRlIHRoZSBjYWNoZWQgcmVuZGVyIHN0YXRlIGFuZCBmb3JjZSBhIHJlZHVuZGFudCByZWJ1aWxkIG9mIHRoZVxuXHRcdFx0Ly8gaWRlbnRpY2FsIHBpbGw7IHdpdGhvdXQgdGhpcyBndWFyZCB0aGF0IHJlYnVpbGQgd291bGQgc3RyaXAgdGhlIGZyZXNobHktXG5cdFx0XHQvLyBhZGRlZCBibGluayBjbGFzcyBhbmQgY3V0IHRoZSBhbmltYXRpb24gc2hvcnQgXHUyMDE0IHdoaWNoIGlzIHdoeSB0aGUgZmlyc3Rcblx0XHRcdC8vIFwiMSBzZXNzaW9uIHJlcXVpcmVzIGlucHV0XCIgbmV2ZXIgYXBwZWFyZWQgdG8gYW5pbWF0ZS5cblx0XHRcdGlmICghKHNob3dSZXF1aXJlc0lucHV0ICYmICFzaG91bGRCbGluaykpIHtcblx0XHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2FnZW50LXNlc3Npb25zLXRpdGxlYmFyLWJsaW5rJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItcmVxdWlyZXMtaW5wdXQnLCBzaG93UmVxdWlyZXNJbnB1dCk7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItYXBwcm92ZWQnLCBzaG93QXBwcm92ZWQpO1xuXG5cdFx0XHRpZiAoc2hvd0FwcHJvdmVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckFwcHJvdmVkKGFwcHJvdmVkQ291bnQpO1xuXHRcdFx0fSBlbHNlIGlmIChzaG93UmVxdWlyZXNJbnB1dCkge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJSZXF1aXJlc0lucHV0KGJsb2NrZWRDb3VudCwgcmVxdWlyZXNJbnB1dEtpbmQsIHNob3VsZEJsaW5rKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckFjdGl2ZVNlc3Npb24oKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNSZW5kZXJpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBhY3RpdmUtc2Vzc2lvbiBwaWxsOiBpY29uICsgdGl0bGUgKyB3b3Jrc3BhY2UuIENsaWNraW5nIG9wZW5zIHRoZVxuXHQgKiBzZXNzaW9ucyBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJBY3RpdmVTZXNzaW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lciE7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdhZ2VudFNlc3Npb25zU2hvd1Nlc3Npb25zJywgXCJTaG93IFNlc3Npb25zXCIpKTtcblxuXHRcdGNvbnN0IGljb24gPSB0aGlzLl9nZXRBY3RpdmVTZXNzaW9uSWNvbigpO1xuXHRcdGNvbnN0IHNlc3Npb25UaXRsZSA9IHRoaXMuX2dldFNlc3Npb25UaXRsZSgpID8/IGdldFVudGl0bGVkU2Vzc2lvblRpdGxlKHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmlzUXVpY2tDaGF0Py5nZXQoKSA/PyBmYWxzZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlTGFiZWwgPSB0aGlzLl9nZXRSZXBvc2l0b3J5TGFiZWwoKTtcblxuXHRcdC8vIFNlc3Npb24gcGlsbDogaWNvbiArIHRpdGxlICsgd29ya3NwYWNlIHRvZ2V0aGVyXG5cdFx0Y29uc3Qgc2Vzc2lvblBpbGwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItcGlsbCcpO1xuXG5cdFx0Ly8gQ2VudGVyIGdyb3VwOiBpY29uICsgdGl0bGUgKyB3b3Jrc3BhY2UgbmFtZVxuXHRcdGNvbnN0IGNlbnRlckdyb3VwID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLWNlbnRlcicpO1xuXG5cdFx0Ly8gS2luZCBpY29uIGF0IHRoZSBiZWdpbm5pbmdcblx0XHRpZiAoaWNvbikge1xuXHRcdFx0Y29uc3QgaWNvbkVsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLWljb24nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbikpO1xuXHRcdFx0Y2VudGVyR3JvdXAuYXBwZW5kQ2hpbGQoaWNvbkVsKTtcblx0XHR9XG5cblx0XHQvLyBTZXNzaW9uIHRpdGxlIHNob3duIG5leHQgdG8gdGhlIGljb25cblx0XHRpZiAoc2Vzc2lvblRpdGxlKSB7XG5cdFx0XHRjb25zdCB0aXRsZUVsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLXRpdGxlJyk7XG5cdFx0XHR0aXRsZUVsLnRleHRDb250ZW50ID0gc2Vzc2lvblRpdGxlO1xuXHRcdFx0Y2VudGVyR3JvdXAuYXBwZW5kQ2hpbGQodGl0bGVFbCk7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlIG5hbWUgc2hvd24gYWZ0ZXIgdGhlIHNlc3Npb24gdGl0bGVcblx0XHRpZiAod29ya3NwYWNlTGFiZWwpIHtcblx0XHRcdGNvbnN0IHNlcGFyYXRvckVsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLXNlcGFyYXRvcicpO1xuXHRcdFx0Y2VudGVyR3JvdXAuYXBwZW5kQ2hpbGQoc2VwYXJhdG9yRWwpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VFbCA9ICQoJ2Rpdi5hZ2VudC1zZXNzaW9ucy10aXRsZWJhci13b3Jrc3BhY2UnKTtcblx0XHRcdHdvcmtzcGFjZUVsLnRleHRDb250ZW50ID0gd29ya3NwYWNlTGFiZWw7XG5cdFx0XHRjZW50ZXJHcm91cC5hcHBlbmRDaGlsZCh3b3Jrc3BhY2VFbCk7XG5cdFx0fVxuXG5cdFx0c2Vzc2lvblBpbGwuYXBwZW5kQ2hpbGQoY2VudGVyR3JvdXApO1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlciBvbiBwaWxsXG5cdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHNlc3Npb25QaWxsLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2Vzc2lvblBpbGwsIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9zaG93U2Vzc2lvbnNQaWNrZXIoKTtcblx0XHR9KSk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2Vzc2lvblBpbGwpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgaGFuZGxlclxuXHRcdHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9zaG93U2Vzc2lvbnNQaWNrZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSByZXF1aXJlcy1pbnB1dCBwaWxsLiBDbGlja2luZyB0b2dnbGVzIGEgZHJvcGRvd24gdGhhdCBsaXN0cyB0aGVcblx0ICogYmxvY2tlZCBzZXNzaW9ucyBiZWxvdyB0aGUgY29tbWFuZCBjZW50ZXIgYm94LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyUmVxdWlyZXNJbnB1dChjb3VudDogbnVtYmVyLCBraW5kOiBSZXF1aXJlc0lucHV0S2luZCB8IHVuZGVmaW5lZCwgc2hvdWxkQmxpbms6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLl9jb250YWluZXIhO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fYmxvY2tlZEluZGljYXRvci5nZXRSZXF1aXJlc0lucHV0TGFiZWwoY291bnQsIGtpbmQpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbCk7XG5cblx0XHRjb25zdCBwaWxsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLXBpbGwnKTtcblx0XHRjb25zdCBsYWJlbEVsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLXJlcXVpcmVzLWlucHV0LWxhYmVsJyk7XG5cdFx0bGFiZWxFbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdHBpbGwuYXBwZW5kQ2hpbGQobGFiZWxFbCk7XG5cblx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIocGlsbCwgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBpbGwsIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl90b2dnbGVCbG9ja2VkU2Vzc2lvbnMoKTtcblx0XHR9KSk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQocGlsbCk7XG5cblx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fdG9nZ2xlQmxvY2tlZFNlc3Npb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHNob3VsZEJsaW5rKSB7XG5cdFx0XHR0aGlzLl90cmlnZ2VyQXR0ZW50aW9uQmxpbmsoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSB0cmFuc2llbnQgZ3JlZW4gXCJBcHByb3ZlZCBOIHNlc3Npb25zXCIgY29uZmlybWF0aW9uIHNob3duIGJyaWVmbHlcblx0ICogYWZ0ZXIgdGhlIHVzZXIgYXBwcm92ZXMgb25lIG9yIG1vcmUgc2Vzc2lvbnMnIHBlbmRpbmcgYWN0aW9ucyBmcm9tIHRoZSBsaXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyQXBwcm92ZWQoY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lciE7XG5cdFx0Y29uc3QgbGFiZWwgPSBjb3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnb25lU2Vzc2lvbkFwcHJvdmVkJywgXCJBcHByb3ZlZCAxIHNlc3Npb25cIilcblx0XHRcdDogbG9jYWxpemUoJ25TZXNzaW9uc0FwcHJvdmVkJywgXCJBcHByb3ZlZCB7MH0gc2Vzc2lvbnNcIiwgY291bnQpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbCk7XG5cblx0XHRjb25zdCBwaWxsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLXBpbGwnKTtcblx0XHRjb25zdCBsYWJlbEVsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLWFwcHJvdmVkLWxhYmVsJyk7XG5cdFx0bGFiZWxFbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdHBpbGwuYXBwZW5kQ2hpbGQobGFiZWxFbCk7XG5cblx0XHQvLyBUaGUgY29uZmlybWF0aW9uIGlzIHRyYW5zaWVudCBidXQgc3RheXMgY2xpY2thYmxlOiBjbGlja2luZyBkb2VzIHdoYXRldmVyXG5cdFx0Ly8gdGhlIHdpZGdldCdzIHVuZGVybHlpbmcgKG5vbi1hcHByb3ZlZCkgc3RhdGUgd291bGQgZG8uXG5cdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHBpbGwsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwaWxsLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fYWN0aXZhdGVEZWZhdWx0QWN0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHBpbGwpO1xuXG5cdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2YXRlRGVmYXVsdEFjdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBY3RpdmF0ZSB0aGUgd2lkZ2V0IGFzIGl0cyBub24tYXBwcm92ZWQgc3RhdGUgd291bGQ6IHJldmVhbCB0aGUgYmxvY2tlZFxuXHQgKiBzZXNzaW9ucyB3aGVuIHRoZSByZXF1aXJlcy1pbnB1dCBzdGF0ZSBhcHBsaWVzLCBvdGhlcndpc2UgdGhlIHNlc3Npb25zIHBpY2tlci5cblx0ICovXG5cdHByaXZhdGUgX2FjdGl2YXRlRGVmYXVsdEFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCByZXF1aXJlc0lucHV0ID0gdGhpcy5fYmxvY2tlZEluZGljYXRvci5ibG9ja2VkU2Vzc2lvbnMuZ2V0KCkubGVuZ3RoID4gMDtcblx0XHRpZiAocmVxdWlyZXNJbnB1dCkge1xuXHRcdFx0dGhpcy5fdG9nZ2xlQmxvY2tlZFNlc3Npb25zKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nob3dTZXNzaW9uc1BpY2tlcigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0YXJ0IHRoZSBhdHRlbnRpb24gYmxpbmsgYW5pbWF0aW9uIG9uIHRoZSBjb21tYW5kIGNlbnRlciBib3guIFJlLWFkZGluZ1xuXHQgKiB0aGUgY2xhc3MgYWZ0ZXIgYSBmb3JjZWQgcmVmbG93IGd1YXJhbnRlZXMgdGhlIENTUyBhbmltYXRpb24gcmVwbGF5cyBldmVuXG5cdCAqIHdoZW4gdGhlIGNvbnRhaW5lciBlbGVtZW50IHBlcnNpc3RzIGFjcm9zcyByZW5kZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJpZ2dlckF0dGVudGlvbkJsaW5rKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lcjtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItYmxpbmsnKTtcblx0XHRjb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7IC8vIGZvcmNlIHJlZmxvdyBzbyB0aGUgYW5pbWF0aW9uIHJlc3RhcnRzXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FnZW50LXNlc3Npb25zLXRpdGxlYmFyLWJsaW5rJyk7XG5cdFx0Ly8gT3duIHRoZSBsaXN0ZW5lciBvdXRzaWRlIGBfZHluYW1pY0Rpc3Bvc2FibGVzYCAoY2xlYXJlZCBvbiBldmVyeSByZW5kZXIpIHNvIGFcblx0XHQvLyByZWR1bmRhbnQgcmUtcmVuZGVyIGNhbid0IGRyb3AgaXQgYmVmb3JlIHRoZSBhbmltYXRpb24gZmluaXNoZXMuXG5cdFx0dGhpcy5fYmxpbmtMaXN0ZW5lci52YWx1ZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdhbmltYXRpb25lbmQnLCAoKSA9PiB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItYmxpbmsnKTtcblx0XHRcdHRoaXMuX2JsaW5rTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGUgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gb3Blbi9jbG9zZWQuXG5cdCAqL1xuXHRwcml2YXRlIF90b2dnbGVCbG9ja2VkU2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX29wZW5Db250ZXh0Vmlldykge1xuXHRcdFx0dGhpcy5fb3BlbkNvbnRleHRWaWV3LmNsb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nob3dCbG9ja2VkU2Vzc2lvbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93IHRoZSBibG9ja2VkIHNlc3Npb25zIGFzIGEgZmxhdCBsaXN0IGluIGEgZHJvcGRvd24gYW5jaG9yZWQgYmVsb3cgdGhlXG5cdCAqIGNvbW1hbmQgY2VudGVyIGJveC5cblx0ICovXG5cdHByaXZhdGUgX3Nob3dCbG9ja2VkU2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyO1xuXHRcdGlmICghY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmJsb2NrZWRTZXNzaW9ucy5nZXQoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNYXRjaCB0aGUgZHJvcGRvd24gd2lkdGggdG8gdGhlIGNvbW1hbmQgY2VudGVyIGJveCBpdCBoYW5ncyBvZmYsIGJ1dCBrZWVwXG5cdFx0Ly8gaXQgd2l0aGluIGEgc2Vuc2libGUgbWluL21heCBzbyBpdCBzdGF5cyByZWFkYWJsZSBvbiB3aWRlIGxheW91dHMgYW5kXG5cdFx0Ly8gZG9lc24ndCBvdmVyZmxvdyBvbiBuYXJyb3cgb25lcy5cblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuX2NvbXB1dGVCbG9ja2VkRHJvcGRvd25XaWR0aChjb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fb3BlbkNvbnRleHRWaWV3ID0gdGhpcy5jb250ZXh0Vmlld1NlcnZpY2Uuc2hvd0NvbnRleHRWaWV3KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gdGhpcy5fZ2V0QmxvY2tlZERyb3Bkb3duQW5jaG9yKGNvbnRhaW5lciksXG5cdFx0XHRhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudC5MRUZULFxuXHRcdFx0YW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkJFTE9XLFxuXHRcdFx0cmVuZGVyOiAodmlld0NvbnRhaW5lcik6IElEaXNwb3NhYmxlID0+IHtcblx0XHRcdFx0Y29uc3QgbGlzdCA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJsb2NrZWRTZXNzaW9uc0xpc3QsIHZpZXdDb250YWluZXIsIHtcblx0XHRcdFx0XHR3aWR0aCxcblx0XHRcdFx0XHRhcHByb3ZhbE1vZGVsOiB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmFwcHJvdmFsTW9kZWwsXG5cdFx0XHRcdFx0Y2lGaXhNb2RlbDogdGhpcy5fYmxvY2tlZEluZGljYXRvci5jaUZpeE1vZGVsLFxuXHRcdFx0XHRcdG9uU2Vzc2lvbk9wZW46IChyZXNvdXJjZSwgcHJlc2VydmVGb2N1cywgc2lkZUJ5U2lkZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BlbkNvbnRleHRWaWV3Py5jbG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BlbkJsb2NrZWRTZXNzaW9uKHJlc291cmNlLCBwcmVzZXJ2ZUZvY3VzLCBzaWRlQnlTaWRlKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9uSWdub3JlU2Vzc2lvbjogc2Vzc2lvbiA9PiB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmlnbm9yZVNlc3Npb24oc2Vzc2lvbiksXG5cdFx0XHRcdFx0b25TaG93QWxsU2Vzc2lvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX29wZW5Db250ZXh0Vmlldz8uY2xvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dTZXNzaW9uc1BpY2tlcigpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b25JZ25vcmVBbGxTZXNzaW9uczogKCkgPT4gdGhpcy5fYmxvY2tlZEluZGljYXRvci5pZ25vcmVBbGxTZXNzaW9ucygpLFxuXHRcdFx0XHRcdG9uQ2xvc2U6ICgpID0+IHRoaXMuX29wZW5Db250ZXh0Vmlldz8uY2xvc2UoKSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRsaXN0LnNldFNlc3Npb25zKHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IuYmxvY2tlZFNlc3Npb25zLmdldCgpLm1hcChlbnRyeSA9PiBlbnRyeS5zZXNzaW9uKSk7XG5cdFx0XHRcdHN0b3JlLmFkZChsaXN0Lm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoKSA9PiB0aGlzLmNvbnRleHRWaWV3U2VydmljZS5sYXlvdXQoKSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQobGlzdC5vbkRpZEFwcHJvdmVTZXNzaW9uKGFwcHJvdmVkID0+IHtcblx0XHRcdFx0XHR0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmRpc21pc3NBcHByb3ZhbChhcHByb3ZlZCk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbkFjdGlvbkZlZWRiYWNrLm5vdGlmeUFwcHJvdmVkKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBLZWVwIHRoZSBkcm9wZG93biB3aWR0aCBtYXRjaGVkIHRvIHRoZSBjb21tYW5kIGNlbnRlciBib3ggYXMgdGhlXG5cdFx0XHRcdC8vIHdpbmRvdyByZXNpemVzICh0aGUgY29tbWFuZCBjZW50ZXIgcmVmbG93cyB0byBhIG5ldyB3aWR0aCwgYW5kIHRoZVxuXHRcdFx0XHQvLyBtaW4vbWF4IGNsYW1wIHRyYWNrcyB0aGUgbmV3IHdpbmRvdyB3aWR0aCkuXG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLmxheW91dFNlcnZpY2Uub25EaWRMYXlvdXRBY3RpdmVDb250YWluZXIoKCkgPT4ge1xuXHRcdFx0XHRcdGxpc3Quc2V0V2lkdGgodGhpcy5fY29tcHV0ZUJsb2NrZWREcm9wZG93bldpZHRoKGNvbnRhaW5lcikpO1xuXHRcdFx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmxheW91dCgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gRGlzbWlzcyB0aGUgZHJvcGRvd24gd2hlbiBhIHF1aWNrIHBpY2sgb3BlbnMgb24gdG9wIG9mIGl0IChlLmcuIHRoZVxuXHRcdFx0XHQvLyBzZXNzaW9ucyBwaWNrZXIpLCBzbyBpdCBkb2Vzbid0IGxpbmdlciBiZWhpbmQgdGhlIHF1aWNrIGlucHV0LiBDbG9zZVxuXHRcdFx0XHQvLyBvdXIgc3BlY2lmaWMgY29udGV4dCB2aWV3IHJhdGhlciB0aGFuIHdoYXRldmVyIGhhcHBlbnMgdG8gYmUgb3Blbi5cblx0XHRcdFx0c3RvcmUuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2Uub25TaG93KCgpID0+IHRoaXMuX29wZW5Db250ZXh0Vmlldz8uY2xvc2UoKSkpO1xuXG5cdFx0XHRcdHRoaXMuX2Jsb2NrZWRMaXN0ID0gbGlzdDtcblx0XHRcdFx0cmV0dXJuIHN0b3JlO1xuXHRcdFx0fSxcblx0XHRcdGZvY3VzOiAoKSA9PiB0aGlzLl9ibG9ja2VkTGlzdD8uZm9jdXMoKSxcblx0XHRcdG9uRE9NRXZlbnQ6IChlOiBFdmVudCkgPT4ge1xuXHRcdFx0XHQvLyBEaXNtaXNzIG9uIGEgY2xpY2sgb3V0c2lkZSB0aGUgZHJvcGRvd24uIENsaWNrcyBvbiB0aGUgYW5jaG9yIGFyZVxuXHRcdFx0XHQvLyBpZ25vcmVkIGhlcmUgYmVjYXVzZSB0aGUgYW5jaG9yIHRvZ2dsZXMgdGhlIGRyb3Bkb3duIGl0c2VsZi4gRXNjYXBlXG5cdFx0XHRcdC8vIGlzIGhhbmRsZWQgYnkgYSBkZWRpY2F0ZWQgaGlnaC13ZWlnaHQga2V5YmluZGluZyAoc2VlXG5cdFx0XHRcdC8vIEhJREVfQkxPQ0tFRF9TRVNTSU9OU19DT01NQU5EX0lEKSBzbyBpdCBkaXNtaXNzZXMgdGhlIGRyb3Bkb3duIGV2ZW5cblx0XHRcdFx0Ly8gd2hlbiBmb2N1cyBpcyBvdXRzaWRlIG9mIGl0LlxuXHRcdFx0XHRpZiAoZS50eXBlID09PSBFdmVudFR5cGUuQ0xJQ0spIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRcdFx0aWYgKHRhcmdldFxuXHRcdFx0XHRcdFx0JiYgIWlzQW5jZXN0b3IodGFyZ2V0LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZS5nZXRDb250ZXh0Vmlld0VsZW1lbnQoKSlcblx0XHRcdFx0XHRcdCYmICFpc0FuY2VzdG9yKHRhcmdldCwgY29udGFpbmVyKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BlbkNvbnRleHRWaWV3Py5jbG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9ibG9ja2VkU2Vzc2lvbnNWaXNpYmxlQ29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX29wZW5Db250ZXh0VmlldyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0b3BlbkJsb2NrZWRTZXNzaW9uc1ZpZXcgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2Jsb2NrZWRMaXN0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdG9wZW5CbG9ja2VkU2Vzc2lvbnNWaWV3ID0gdGhpcy5fb3BlbkNvbnRleHRWaWV3O1xuXHRcdHRoaXMuX2Jsb2NrZWRTZXNzaW9uc1Zpc2libGVDb250ZXh0LnNldCh0cnVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSB3aWR0aCBvZiB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93bjogYXQgbGVhc3QgYXMgd2lkZSBhcyB0aGVcblx0ICogY29tbWFuZCBjZW50ZXIgYm94ICh0aGUgYW5jaG9yKSBhbmQge0BsaW5rIEJMT0NLRURfRFJPUERPV05fTUlOX1dJRFRIfSwgYnV0XG5cdCAqIG5ldmVyIHdpZGVyIHRoYW4ge0BsaW5rIEJMT0NLRURfRFJPUERPV05fTUFYX1dJRFRIX1JBVElPfSBvZiB0aGUgd2luZG93IHNvIGl0XG5cdCAqIHN0YXlzIHdpdGhpbiB0aGUgdmlld3BvcnQgb24gbmFycm93IGxheW91dHMuXG5cdCAqL1xuXHRwcml2YXRlIF9jb21wdXRlQmxvY2tlZERyb3Bkb3duV2lkdGgoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdFx0Y29uc3QgYW5jaG9yV2lkdGggPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKGNvbnRhaW5lcikud2lkdGg7XG5cdFx0Y29uc3Qgd2luZG93V2lkdGggPSBnZXRXaW5kb3coY29udGFpbmVyKS5pbm5lcldpZHRoO1xuXHRcdGNvbnN0IG1pbldpZHRoID0gTWF0aC5tYXgoYW5jaG9yV2lkdGgsIEJMT0NLRURfRFJPUERPV05fTUlOX1dJRFRIKTtcblx0XHRjb25zdCBtYXhXaWR0aCA9IHdpbmRvd1dpZHRoICogQkxPQ0tFRF9EUk9QRE9XTl9NQVhfV0lEVEhfUkFUSU87XG5cdFx0cmV0dXJuIE1hdGgucm91bmQoTWF0aC5taW4obWluV2lkdGgsIG1heFdpZHRoKSk7XG5cdH1cblxuXHQvKipcblx0ICogQW5jaG9yIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIHNvIGl0IGlzIGhvcml6b250YWxseSBjZW50ZXJlZCBvbiB0aGVcblx0ICogY29tbWFuZCBjZW50ZXIgYm94LiBCZWNhdXNlIHRoZSBkcm9wZG93biBjYW4gYmUgd2lkZXIgdGhhbiB0aGUgYm94LCB3ZSBoYW5kXG5cdCAqIHRoZSBjb250ZXh0IHZpZXcgYSB6ZXJvLXdpZHRoIGFuY2hvciBwb3NpdGlvbmVkIGF0IHRoZSBkcm9wZG93bidzIHRhcmdldFxuXHQgKiBsZWZ0IGVkZ2UgKHRoZSBib3ggY2VudGVyIG1pbnVzIGhhbGYgdGhlIGRyb3Bkb3duIHdpZHRoKS5cblx0ICovXG5cdHByaXZhdGUgX2dldEJsb2NrZWREcm9wZG93bkFuY2hvcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFuY2hvciB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKGNvbnRhaW5lcik7XG5cdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl9jb21wdXRlQmxvY2tlZERyb3Bkb3duV2lkdGgoY29udGFpbmVyKTtcblx0XHRjb25zdCBjZW50ZXJYID0gcG9zaXRpb24ubGVmdCArIHBvc2l0aW9uLndpZHRoIC8gMjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eDogTWF0aC5yb3VuZChjZW50ZXJYIC0gd2lkdGggLyAyKSxcblx0XHRcdHk6IHBvc2l0aW9uLnRvcCxcblx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0aGVpZ2h0OiBwb3NpdGlvbi5oZWlnaHQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5CbG9ja2VkU2Vzc2lvbihyZXNvdXJjZTogVVJJLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCBzaWRlQnlTaWRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHNpZGVCeVNpZGUpIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRvcGVuU2Vzc2lvblRvVGhlU2lkZSh0aGlzLnNlc3Npb25zU2VydmljZSwgc2Vzc2lvbiwgeyBwcmVzZXJ2ZUZvY3VzIH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnNlc3Npb25zU2VydmljZS5vcGVuU2Vzc2lvbihyZXNvdXJjZSwgeyBwcmVzZXJ2ZUZvY3VzIH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGljb24gZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHR5cGUuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRBY3RpdmVTZXNzaW9uSWNvbigpOiBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoc2Vzc2lvbkRhdGEpIHtcblx0XHRcdHJldHVybiBzZXNzaW9uRGF0YS5pY29uO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgZGlzcGxheSB0aXRsZSBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvblRpdGxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdHJldHVybiBzZXNzaW9uRGF0YT8udGl0bGUuZ2V0KCk/LnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSByZXBvc2l0b3J5IGxhYmVsIGZvciB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRSZXBvc2l0b3J5TGFiZWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uRGF0YSA9IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKHNlc3Npb25EYXRhKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uRGF0YS53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB3b3Jrc3BhY2UubGFiZWw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93U2Vzc2lvbnNQaWNrZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTSE9XX1NFU1NJT05TX1BJQ0tFUl9DT01NQU5EX0lEKTtcblx0fVxufVxuXG4vKipcbiAqIFByb3ZpZGVzIGN1c3RvbSByZW5kZXJpbmcgZm9yIHRoZSBzZXNzaW9ucyB0aXRsZSBiYXIgd2lkZ2V0XG4gKiBpbiB0aGUgY29tbWFuZCBjZW50ZXIuIFVzZXMgSUFjdGlvblZpZXdJdGVtU2VydmljZSB0byByZW5kZXIgYSBjdXN0b20gd2lkZ2V0XG4gKiBmb3IgdGhlIFRpdGxlQmFyQ29udHJvbE1lbnUgc3VibWVudS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25zVGl0bGVCYXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmFnZW50U2Vzc2lvbnNUaXRsZUJhcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSBzdWJtZW51IGl0ZW0gaW4gdGhlIEFnZW50IFNlc3Npb25zIGNvbW1hbmQgY2VudGVyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLkNvbW1hbmRDZW50ZXIsIHtcblx0XHRcdHN1Ym1lbnU6IE1lbnVzLlRpdGxlQmFyU2Vzc2lvblRpdGxlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zQ29udHJvbCcsIFwiQWdlbnQgU2Vzc2lvbnNcIiksXG5cdFx0XHRvcmRlcjogMTAxLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC5uZWdhdGUoKSwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQubmVnYXRlKCkpXG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYSBwbGFjZWhvbGRlciBhY3Rpb24gc28gdGhlIHN1Ym1lbnUgYXBwZWFyc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5UaXRsZUJhclNlc3Npb25UaXRsZSwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogU0hPV19TRVNTSU9OU19QSUNLRVJfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93U2Vzc2lvbnMnLCBcIlNob3cgU2Vzc2lvbnNcIiksXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICdhX3Nlc3Npb25zJyxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0d2hlbjogSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpXG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gaGVhZGVyJ3MgXCJTaG93IEFsbCBTZXNzaW9uc1wiIGFjdGlvbiBkaXNtaXNzZXNcblx0XHQvLyB0aGUgZHJvcGRvd24gKGEgdHJhbnNpZW50IGNvbnRleHQgdmlldykgYmVmb3JlIG9wZW5pbmcgdGhlIGZ1bGwgc2Vzc2lvbnNcblx0XHQvLyBwaWNrZXIsIHNvIHRoZSBwb3B1cCBkb2Vzbid0IGxpbmdlciBiZWhpbmQgaXQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJCbG9ja2VkU2Vzc2lvbnNIZWFkZXJDb21tYW5kcygpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckJsb2NrZWRTZXNzaW9uc0hlYWRlckFjdGlvbnMoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJCbG9ja2VkU2Vzc2lvbnNJdGVtQWN0aW9ucygpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5Db21tYW5kQ2VudGVyLCBNZW51cy5UaXRsZUJhclNlc3Npb25UaXRsZSwgKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNUaXRsZUJhcldpZGdldCwgYWN0aW9uLCBvcHRpb25zLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0sIHVuZGVmaW5lZCkpO1xuXHR9XG59XG5cbi8vIEVzY2FwZSBjbG9zZXMgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gd2hpbGUgaXQgaXMgb3Blbi4gUmVnaXN0ZXJlZCBhcyBhXG4vLyBoaWdoLXdlaWdodCBrZXliaW5kaW5nIHNjb3BlZCB0byBgU2Vzc2lvbnNCbG9ja2VkU2Vzc2lvbnNWaXNpYmxlQ29udGV4dGAgKHJhdGhlclxuLy8gdGhhbiByZWx5aW5nIG9uIGZvY3VzIGJlaW5nIGluc2lkZSB0aGUgZHJvcGRvd24pIHNvIGl0IHJlbGlhYmx5IHdpbnMgb3ZlciBvdGhlclxuLy8gRXNjYXBlIGhhbmRsZXJzLCBtaXJyb3JpbmcgaG93IHRoZSBxdWljayBwaWNrIHNjb3BlcyBpdHMgZGlzbWlzcyBrZXliaW5kaW5nIHRvIGFuXG4vLyBcImlzIHZpc2libGVcIiBjb250ZXh0IGtleS5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogSElERV9CTE9DS0VEX1NFU1NJT05TX0NPTU1BTkRfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIgKyAxMDAsXG5cdHdoZW46IFNlc3Npb25zQmxvY2tlZFNlc3Npb25zVmlzaWJsZUNvbnRleHQsXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRoYW5kbGVyOiAoX2FjY2Vzc29yLCBjb250ZXh0PzogSUJsb2NrZWRTZXNzaW9uc0hlYWRlckFjdGlvbkNvbnRleHQpID0+IHtcblx0XHRpZiAoY29udGV4dCkge1xuXHRcdFx0Y29udGV4dC5jbG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcGVuQmxvY2tlZFNlc3Npb25zVmlldz8uY2xvc2UoKTtcblx0XHR9XG5cdH0sXG59KTtc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
