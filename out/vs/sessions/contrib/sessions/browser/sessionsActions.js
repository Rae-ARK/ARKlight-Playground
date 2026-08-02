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
import { Codicon } from "../../../../base/common/codicons.js";
import { fromNow } from "../../../../base/common/date.js";
import { hash } from "../../../../base/common/hash.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuRegistry, MenuId, registerAction2, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { EditorAreaFocusContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from "../../../../workbench/common/contextkeys.js";
import { IWorkbenchLayoutService, Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { getQuickNavigateHandler, inQuickPickContext } from "../../../../workbench/browser/quickaccess.js";
import { Menus } from "../../../browser/menus.js";
import { SessionsCategories } from "../../../common/categories.js";
import { CanGoBackContext, CanGoForwardContext, SessionProviderIdContext, MultipleSessionsVisibleContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsStickyContext, SessionsFocusContext, SessionSupportsMultipleChatsContext, SessionsWelcomeVisibleContext, SessionIdContext, SessionHasMultipleCommittedChatsContext, SessionShouldShowChatTabsContext, SessionHasMultipleOpenChatsContext, SessionsPickerVisibleContext, SessionActiveChatIsClosableContext, SessionActiveChatIsDeletableContext, SessionChatsPickerVisibleContext, SessionActiveChatHasSubagentsContext, SessionsTitleBarNewSessionEnabledContext } from "../../../common/contextkeys.js";
import { ANY_AGENT_HOST_PROVIDER_RE } from "../../../common/agentHostSessionsProvider.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ChatOriginKind, getChatCapabilities, getUntitledSessionTitle, SessionStatus } from "../../../services/sessions/common/session.js";
import { ISessionsPartService } from "../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsListModelService } from "../../../services/sessions/browser/sessionsListModelService.js";
import { $, append, EventHelper, reset } from "../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { OS } from "../../../../base/common/platform.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { markOnboardingTarget } from "../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { IWorkbenchAssignmentService } from "../../../../workbench/services/assignment/common/assignmentService.js";
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from "../../../common/theme.js";
import { logSessionsInteraction } from "../../../common/sessionsTelemetry.js";
import { NEW_SESSION_ACTION_ID } from "../../chat/common/constants.js";
import { groupSessionsForPicker } from "./sessionsPicker.js";
import "./media/newSessionActionViewItem.css";
const SHOW_SESSIONS_PICKER_COMMAND_ID = "sessions.showSessionsPicker";
registerAction2(class ShowSessionsPickerAction extends Action2 {
  constructor() {
    super({
      id: SHOW_SESSIONS_PICKER_COMMAND_ID,
      title: localize2("showSessionsPicker", "Show Sessions Picker"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.KeyR,
        mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR },
        weight: KeybindingWeight.SessionsContrib,
        when: IsSessionsWindowContext
      }
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const quickInputService = accessor.get(IQuickInputService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const sessionsListModelService = accessor.get(ISessionsListModelService);
    const contextKeyService = accessor.get(IContextKeyService);
    const { recent, other } = sessionsService.getRecentlyOpenedSessions();
    const sessionGroups = groupSessionsForPicker(recent, other);
    const activeSessionId = sessionsService.activeSession.get()?.sessionId;
    const items = [];
    let firstSessionItem;
    items.push({
      label: `$(add) ${localize("newSession", "New Session")}`,
      session: void 0
    });
    const toPickItem = (session) => {
      const title = session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false);
      const status = session.status.get();
      const isRead = session.isRead.get();
      const isArchived = session.isArchived.get();
      const workspace = session.workspace.get();
      const pullRequestIcon = workspace?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest?.icon;
      const icon = sessionsListModelService.getStatusIcon(status, isRead, isArchived, pullRequestIcon);
      const detailParts = [];
      if (workspace?.label) {
        const isWorkspaceFolder = workspace.folders.length > 0 && workspace.folders[0]?.gitRepository?.workTreeUri === void 0;
        const workspaceIcon = workspace.isVirtualWorkspace ? Codicon.cloud : isWorkspaceFolder ? Codicon.folder : Codicon.worktree;
        detailParts.push(`$(${Codicon.blank.id}) $(${workspaceIcon.id}) ${workspace.label}`);
      } else {
        detailParts.push(`$(${Codicon.blank.id})`);
      }
      detailParts.push(fromNow(session.updatedAt.get(), true, true));
      return {
        label: title,
        detail: detailParts.join(" \xB7 "),
        iconClass: ThemeIcon.asClassName(icon),
        session
      };
    };
    const appendSessions = (label, sessions) => {
      if (sessions.length === 0) {
        return;
      }
      items.push({ type: "separator", label });
      for (const session of sessions) {
        const item = toPickItem(session);
        firstSessionItem ??= item;
        items.push(item);
      }
    };
    appendSessions(localize("sessionsPickerNeedsInput", "needs input"), sessionGroups.needsInput);
    appendSessions(localize("sessionsPickerUnread", "unread"), sessionGroups.unread);
    appendSessions(localize("recentlyOpened", "recently opened"), sessionGroups.recent);
    appendSessions(localize("otherSessions", "other sessions"), sessionGroups.other);
    const picker = quickInputService.createQuickPick({ useSeparators: true });
    picker.items = items;
    picker.placeholder = localize("searchSessions", "Search sessions by name or folder");
    picker.canAcceptInBackground = true;
    picker.matchOnDetail = true;
    if (firstSessionItem) {
      picker.activeItems = [firstSessionItem];
    }
    const disposables = new DisposableStore();
    disposables.add(picker);
    const pickerVisibleContext = SessionsPickerVisibleContext.bindTo(contextKeyService);
    pickerVisibleContext.set(true);
    disposables.add(toDisposable(() => pickerVisibleContext.reset()));
    const openSelected = (selected, inBackground, toSide) => {
      if (!selected.session) {
        sessionsService.openNewSession();
        sessionsPartService.focusSession(sessionsService.activeSession.get());
        return;
      }
      if (toSide && activeSessionId !== void 0 && selected.session.sessionId !== activeSessionId) {
        sessionsService.insertAt(selected.session, activeSessionId, "right", !inBackground);
      } else {
        sessionsService.openSession(selected.session.resource, { preserveFocus: inBackground });
      }
    };
    disposables.add(picker.onDidAccept((e) => {
      const [selected] = picker.selectedItems;
      if (selected) {
        const toSide = picker.keyMods.ctrlCmd || picker.keyMods.alt;
        openSelected(selected, e.inBackground, toSide);
      }
      if (!e.inBackground) {
        picker.hide();
      }
    }));
    disposables.add(picker.onDidHide(() => disposables.dispose()));
    picker.show();
  }
});
const SESSIONS_PICKER_NAVIGATE_NEXT_ID = "sessions.showSessionsPicker.navigateNext";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: SESSIONS_PICKER_NAVIGATE_NEXT_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_NEXT_ID, true),
  when: SessionsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR }
});
const SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID = "sessions.showSessionsPicker.navigatePrevious";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID, false),
  when: SessionsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyR }
});
registerAction2(class GoBackAction extends Action2 {
  constructor() {
    super({
      id: "sessions.goBack",
      title: {
        ...localize2("sessionsGoBack", "Go Back"),
        mnemonicTitle: localize({ key: "miSessionsBack", comment: ["&& denotes a mnemonic"] }, "&&Back")
      },
      f1: true,
      icon: Codicon.arrowLeft,
      tooltip: localize("sessionsGoBackTooltip", "Go Back One Session"),
      category: SessionsCategories.Sessions,
      precondition: CanGoBackContext,
      keybinding: {
        // Higher than `WorkbenchContrib` so the `Ctrl+Shift+Tab` secondary wins over the
        // editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
        weight: KeybindingWeight.SessionsContrib,
        win: { primary: KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
        mac: { primary: KeyMod.WinCtrl | KeyCode.Minus, secondary: [KeyCode.BrowserBack, KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab] },
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated())
      },
      menu: [{
        id: Menus.TitleBarCenterLeft,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
      }, {
        id: Menus.GoMenu,
        group: "1_history_nav",
        order: 1
      }]
    });
  }
  async run(accessor) {
    await accessor.get(ISessionsService).openPreviousSession();
  }
});
registerAction2(class GoForwardAction extends Action2 {
  constructor() {
    super({
      id: "sessions.goForward",
      title: {
        ...localize2("sessionsGoForward", "Go Forward"),
        mnemonicTitle: localize({ key: "miSessionsForward", comment: ["&& denotes a mnemonic"] }, "&&Forward")
      },
      f1: true,
      icon: Codicon.arrowRight,
      tooltip: localize("sessionsGoForwardTooltip", "Go Forward One Session"),
      category: SessionsCategories.Sessions,
      precondition: CanGoForwardContext,
      keybinding: {
        // Higher than `WorkbenchContrib` so the `Ctrl+Tab` secondary wins over the
        // editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
        weight: KeybindingWeight.SessionsContrib,
        win: { primary: KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.Tab] },
        mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Minus, secondary: [KeyCode.BrowserForward, KeyMod.WinCtrl | KeyCode.Tab] },
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.Tab] },
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated())
      },
      menu: [{
        id: Menus.TitleBarCenterLeft,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
      }, {
        id: Menus.GoMenu,
        group: "1_history_nav",
        order: 2
      }]
    });
  }
  async run(accessor) {
    await accessor.get(ISessionsService).openNextSession();
  }
});
registerAction2(class FocusActiveSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessions.focusActiveSession",
      title: localize2("focusActiveSession", "Focus Active Session"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        // Must outrank the workbench `workbench.action.chat.open` binding
        // (WorkbenchContrib) so that in the sessions window the chord
        // focuses the active session. Using the normal open chat action will not work for new session views.
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI }
      }
    });
  }
  async run(accessor) {
    const sessionsPartService = accessor.get(ISessionsPartService);
    const sessionsService = accessor.get(ISessionsService);
    sessionsPartService.focusSession(sessionsService.activeSession.get());
  }
});
for (let index = 0; index < 9; index++) {
  const position = index + 1;
  const isLast = position === 9;
  registerAction2(class FocusSessionByPositionAction extends Action2 {
    constructor() {
      super({
        id: `sessions.focusSessionInGrid${position}`,
        title: isLast ? localize2("focusLastSessionInGrid", "Focus Last Session in Grid") : localize2("focusSessionInGrid", "Focus Session {0} in Grid", position),
        f1: true,
        category: SessionsCategories.Sessions,
        keybinding: {
          weight: KeybindingWeight.SessionsContrib,
          primary: KeyMod.CtrlCmd | KeyCode.Digit1 + index,
          when: IsSessionsWindowContext
        }
      });
    }
    async run(accessor) {
      const sessionsService = accessor.get(ISessionsService);
      const sessionsPartService = accessor.get(ISessionsPartService);
      const visible = sessionsService.visibleSessions.get();
      const targetIndex = isLast ? visible.length - 1 : index;
      if (targetIndex < 0 || targetIndex >= visible.length) {
        return;
      }
      const session = visible[targetIndex];
      sessionsService.setActive(session);
      sessionsPartService.focusSession(session);
    }
  });
}
registerAction2(class CloseAllSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessions.closeAllSessions",
      title: localize2("closeAllSessions", "Close All Sessions"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: IsSessionsWindowContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyW),
        // Only fire from the keyboard while a session (its chat view) has focus.
        when: ContextKeyExpr.and(IsSessionsWindowContext, SessionsFocusContext)
      }
    });
  }
  async run(accessor) {
    accessor.get(ISessionsService).closeAllSessions();
  }
});
const CHAT_TAB_KEYBINDING_WEIGHT = KeybindingWeight.SessionsContrib + 10;
const ADD_CHAT_TO_SESSION_ACTION_ID = "sessions.chatCompositeBar.addChat";
registerAction2(class AddChatToSessionAction extends Action2 {
  constructor() {
    super({
      id: ADD_CHAT_TO_SESSION_ACTION_ID,
      title: localize2("chatCompositeBar.addChat", "New Chat"),
      icon: Codicon.add,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Like Cmd/Ctrl+T in a browser — opens a new chat tab within the
        // active session. Scoped so it does not steal the shortcut outside
        // the agents window or when the session does not support multiple chats.
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.KeyT
      },
      menu: {
        id: Menus.SessionBarToolbar,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate(), SessionShouldShowChatTabsContext.negate())
      }
    });
  }
  async run(accessor, session) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const target = session ?? sessionsService.activeSession.get();
    if (!target) {
      return;
    }
    await sessionsService.openNewChatInSession(target);
    sessionsPartService.focusSession(target);
  }
});
function navigateChatTab(accessor, direction) {
  const sessionsService = accessor.get(ISessionsService);
  const sessionsPartService = accessor.get(ISessionsPartService);
  const extUri = accessor.get(IUriIdentityService).extUri;
  const session = sessionsService.activeSession.get();
  if (!session) {
    return;
  }
  const tabs = session.visibleChatTabs.get();
  if (tabs.length < 2) {
    return;
  }
  const activeChat = session.activeChat.get();
  const currentIndex = activeChat ? tabs.findIndex((chat) => extUri.isEqual(chat.resource, activeChat.resource)) : -1;
  const from = currentIndex === -1 ? 0 : currentIndex;
  const delta = direction === "next" ? 1 : -1;
  const target = tabs[(from + delta + tabs.length) % tabs.length];
  sessionsService.openChat(session, target.resource);
  sessionsPartService.focusSession(session);
}
registerAction2(class NavigateNextChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.navigateNextChat",
      title: localize2("navigateNextChat", "Go to Next Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight
      }
    });
  }
  run(accessor) {
    navigateChatTab(accessor, "next");
  }
});
registerAction2(class NavigatePreviousChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.navigatePreviousChat",
      title: localize2("navigatePreviousChat", "Go to Previous Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft
      }
    });
  }
  run(accessor) {
    navigateChatTab(accessor, "previous");
  }
});
registerAction2(class CloseChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.closeChat",
      title: localize2("closeActiveChat", "Close Chat"),
      icon: Codicon.close,
      // Hidden from the palette: closing a specific chat is contextual (the
      // keybinding targets the active chat; the menu targets a tab).
      f1: false,
      category: SessionsCategories.Sessions,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Intercept Ctrl/Cmd+W (which otherwise closes the session) only
        // while the active chat is a closeable non-main chat, so it closes
        // the chat tab instead — like closing a tab vs the window.
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionActiveChatIsClosableContext),
        primary: KeyMod.CtrlCmd | KeyCode.KeyW,
        win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] }
      },
      // Rendered as the tab's close button by the chat tab strip; the main
      // chat's tab does not render this menu, so no per-tab gating is needed.
      menu: {
        id: Menus.SessionChatTab,
        group: "navigation",
        order: 10
      }
    });
  }
  async run(accessor, context) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const extUri = accessor.get(IUriIdentityService).extUri;
    const session = context?.session ?? sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const chat = context?.chat ?? session.activeChat.get();
    if (!chat || extUri.isEqual(chat.resource, session.mainChat.get().resource)) {
      return;
    }
    if (chat.status.get() === SessionStatus.Untitled) {
      await sessionsManagementService.deleteChat(session, chat.resource, { skipConfirmation: true });
    } else {
      await sessionsService.closeChat(session, chat);
    }
  }
});
registerAction2(class CloseAllChatsAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.closeAllChats",
      title: localize2("closeAllChats", "Close All Chats"),
      f1: true,
      category: SessionsCategories.Sessions,
      // Enabled (palette + keybinding) only while the active session has more
      // than one open chat, so the chord targets the focused session and
      // stays inert for single-chat sessions.
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          // While a modal editor has focus, let VS Code's own
          // closeEditorsInGroup (same chord) act on the editor group.
          EditorAreaFocusContext.toNegated(),
          SessionHasMultipleOpenChatsContext
        ),
        // Mirror VS Code's "Close All Editors in Group" chord (Ctrl/Cmd+K W):
        // a session is the Agents-window analogue of an editor group. Note
        // "Close All Sessions" already owns Ctrl/Cmd+K Ctrl/Cmd+W.
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyW)
      }
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const extUri = accessor.get(IUriIdentityService).extUri;
    const session = sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const mainResource = session.mainChat.get().resource;
    const chatsToClose = session.openChats.get().filter((chat) => !extUri.isEqual(chat.resource, mainResource));
    for (const chat of chatsToClose) {
      if (chat.status.get() === SessionStatus.Untitled) {
        await sessionsManagementService.deleteChat(session, chat.resource, { skipConfirmation: true });
      } else {
        await sessionsService.closeChat(session, chat);
      }
    }
  }
});
registerAction2(class DeleteChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.deleteChat",
      title: localize2("deleteActiveChat", "Delete Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Delete / Cmd+Backspace (Mac) — mirrors the file-delete keybinding
        // in the Explorer. Scoped so it never fires while typing in an input
        // (chat composer, rename field, etc.) or on the session's main chat.
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), InputFocusedContext.toNegated(), SessionActiveChatIsDeletableContext),
        primary: KeyCode.Delete,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.Backspace,
          secondary: [KeyCode.Delete]
        }
      }
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const session = sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const chat = session.activeChat.get();
    if (!chat || !getChatCapabilities(chat, session, void 0).canDelete) {
      return;
    }
    await sessionsManagementService.deleteChat(session, chat.resource);
  }
});
registerAction2(class ReopenLastClosedChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.reopenLastClosedChat",
      title: localize2("chatCompositeBar.reopenLastClosedChat", "Reopen Last Closed Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionSupportsMultipleChatsContext,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Like Cmd/Ctrl+Shift+T in a browser — reopens the most recently
        // closed chat tab. Scoped to the agents window, outside editor area.
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionIsCreatedContext, SessionSupportsMultipleChatsContext),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT
      }
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const session = sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const lastClosed = session.lastClosedChat;
    if (!lastClosed) {
      return;
    }
    await sessionsService.openChat(session, lastClosed.resource);
    sessionsPartService.focusSession(session);
  }
});
const SHOW_CHATS_PICKER_COMMAND_ID = "sessions.showChatsPicker";
const QUICK_SWITCH_NEXT_CHAT_ID = "sessions.quickSwitchNextChat";
const QUICK_SWITCH_PREVIOUS_CHAT_ID = "sessions.quickSwitchPreviousChat";
const CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID = "sessions.chatsPicker.quickNavigateNext";
const CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID = "sessions.chatsPicker.quickNavigatePrevious";
const ChatsPickerScopeContext = ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext, inQuickPickContext.negate());
function openChatsPicker(accessor, mru) {
  const sessionsService = accessor.get(ISessionsService);
  const quickInputService = accessor.get(IQuickInputService);
  const sessionsPartService = accessor.get(ISessionsPartService);
  const contextKeyService = accessor.get(IContextKeyService);
  const keybindingService = accessor.get(IKeybindingService);
  const session = sessionsService.activeSession.get();
  if (!session) {
    return;
  }
  const extUri = accessor.get(IUriIdentityService).extUri;
  const toItem = (chat) => ({
    label: chat.title.get()?.trim() || localize("untitledChat", "Untitled Chat"),
    description: fromNow(chat.updatedAt.get(), true, true),
    iconClass: ThemeIcon.asClassName(Codicon.commentDiscussion),
    chat
  });
  const openItems = (mru ? session.visibleChatTabs.get() : session.visibleChatTabs.get().filter((chat) => chat.status.get() !== SessionStatus.Untitled)).map(toItem);
  const closedItems = mru ? [] : session.closedChats.get().filter((chat) => chat.status.get() !== SessionStatus.Untitled && chat.origin?.kind !== ChatOriginKind.Tool).map(toItem);
  const pickItems = [...openItems, ...closedItems];
  if (pickItems.length === 0) {
    return;
  }
  const displayItems = closedItems.length === 0 ? openItems : [
    { type: "separator", label: localize("openChatsGroup", "Open") },
    ...openItems,
    { type: "separator", label: localize("closedChatsGroup", "Closed") },
    ...closedItems
  ];
  const activeChat = session.activeChat.get();
  const activeIndex = Math.max(0, activeChat ? pickItems.findIndex((item) => extUri.isEqual(item.chat.resource, activeChat.resource)) : -1);
  const startIndex = mru ? (activeIndex + (mru.backward ? -1 : 1) + pickItems.length) % pickItems.length : activeIndex;
  const disposables = new DisposableStore();
  const picker = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
  picker.items = displayItems;
  picker.activeItems = [pickItems[startIndex]];
  if (mru) {
    picker.hideInput = true;
    picker.quickNavigate = { keybindings: keybindingService.lookupKeybindings(CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID) };
  } else {
    picker.placeholder = localize("searchChats", "Search chats by name");
    picker.matchOnDescription = true;
  }
  const pickerVisibleContext = SessionChatsPickerVisibleContext.bindTo(contextKeyService);
  pickerVisibleContext.set(true);
  disposables.add(toDisposable(() => pickerVisibleContext.reset()));
  disposables.add(picker.onDidAccept(() => {
    const [selected] = picker.selectedItems;
    if (selected) {
      sessionsService.openChat(session, selected.chat.resource);
      sessionsPartService.focusSession(session);
    }
    picker.hide();
  }));
  disposables.add(picker.onDidHide(() => disposables.dispose()));
  picker.show();
}
registerAction2(class ShowChatsPickerAction extends Action2 {
  constructor() {
    super({
      id: SHOW_CHATS_PICKER_COMMAND_ID,
      title: localize2("showChatsPicker", "Go to Chat in Session"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleCommittedChatsContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), inQuickPickContext.negate()),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO
      }
    });
  }
  run(accessor) {
    openChatsPicker(accessor);
  }
});
registerAction2(class QuickSwitchNextChatAction extends Action2 {
  constructor() {
    super({
      id: QUICK_SWITCH_NEXT_CHAT_ID,
      title: localize2("quickSwitchNextChat", "Quick Switch to Next Chat"),
      f1: false,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib + 1,
        when: ChatsPickerScopeContext,
        primary: KeyMod.CtrlCmd | KeyCode.Tab,
        mac: { primary: KeyMod.WinCtrl | KeyCode.Tab }
      }
    });
  }
  run(accessor) {
    openChatsPicker(accessor, { backward: false });
  }
});
registerAction2(class QuickSwitchPreviousChatAction extends Action2 {
  constructor() {
    super({
      id: QUICK_SWITCH_PREVIOUS_CHAT_ID,
      title: localize2("quickSwitchPreviousChat", "Quick Switch to Previous Chat"),
      f1: false,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib + 1,
        when: ChatsPickerScopeContext,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
        mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab }
      }
    });
  }
  run(accessor) {
    openChatsPicker(accessor, { backward: true });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID, true),
  when: SessionChatsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyCode.Tab }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID, false),
  when: SessionChatsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab }
});
let CompactButtonActionViewItem = class extends BaseActionViewItem {
  constructor(action, keybindingService, hoverService, contextKeyService) {
    super(void 0, action);
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.contextKeyService = contextKeyService;
  }
  /** Optional onboarding spotlight target id for the pill. */
  get onboardingTargetId() {
    return void 0;
  }
  /** Whether to render the trailing keybinding hint chip in the label. */
  get showKeybindingHint() {
    return true;
  }
  /** Hook invoked right before the action runs (e.g. for telemetry). */
  onRun() {
  }
  render(container) {
    super.render(container);
    if (!this.element) {
      return;
    }
    const button = this._register(new Button(this.element, {
      ...defaultButtonStyles,
      buttonSecondaryBackground: asCssVariable(agentsNewSessionButtonBackground),
      buttonSecondaryForeground: asCssVariable(agentsNewSessionButtonForeground),
      buttonSecondaryHoverBackground: asCssVariable(agentsNewSessionButtonHoverBackground),
      buttonSecondaryBorder: asCssVariable(agentsNewSessionButtonBorder),
      secondary: true,
      supportIcons: true
    }));
    button.element.classList.add("agent-sessions-compact-new-button");
    const onboardingTargetId = this.onboardingTargetId;
    if (onboardingTargetId) {
      this._register(markOnboardingTarget(button.element, onboardingTargetId));
    }
    this._register(button.onDidClick((e) => {
      EventHelper.stop(e, true);
      if (!this.action.enabled) {
        return;
      }
      this.onRun();
      this.actionRunner.run(this.action, this._context);
    }));
    const buttonLabel = $("span.new-session-button-label", void 0, this.label);
    const keybindingHint = $("span.new-session-keybinding-hint");
    const keybindingHintLabel = this.showKeybindingHint ? this._register(new KeybindingLabel(keybindingHint, OS, {
      disableTitle: true,
      keybindingLabelBackground: "transparent",
      keybindingLabelForeground: "inherit",
      keybindingLabelBorder: "transparent",
      keybindingLabelBottomBorder: void 0,
      keybindingLabelShadow: void 0
    })) : void 0;
    reset(button.element, buttonLabel);
    const getKeybinding = () => {
      const primaryKeybinding = this.keybindingService.lookupKeybinding(this.commandId, this.contextKeyService, true);
      const resolvedKeybindings = this.keybindingService.lookupKeybindings(this.commandId);
      return primaryKeybinding ?? resolvedKeybindings[0];
    };
    this._register(this.hoverService.setupDelayedHover(button.element, () => ({
      content: this.getHoverContent(getKeybinding()?.getLabel() ?? void 0),
      appearance: { compact: true },
      position: { hoverPosition: HoverPosition.BELOW }
    })));
    let lastRenderedKeybindingLabel = null;
    let lastRenderedKeybindingAriaLabel = null;
    const updateButton = () => {
      const keybinding = getKeybinding();
      const keybindingLabel = keybinding?.getLabel() ?? void 0;
      const keybindingAriaLabel = keybinding?.getAriaLabel() ?? void 0;
      if (lastRenderedKeybindingLabel === keybindingLabel && lastRenderedKeybindingAriaLabel === keybindingAriaLabel) {
        return;
      }
      lastRenderedKeybindingLabel = keybindingLabel;
      lastRenderedKeybindingAriaLabel = keybindingAriaLabel;
      keybindingHintLabel?.set(keybinding);
      if (keybindingHintLabel && keybinding) {
        if (keybindingHint.parentElement !== button.element) {
          append(button.element, keybindingHint);
        }
      } else {
        keybindingHint.remove();
      }
      button.element.setAttribute("aria-label", this.getAriaLabel(keybindingAriaLabel));
    };
    this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateButton));
  }
};
CompactButtonActionViewItem = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IContextKeyService)
], CompactButtonActionViewItem);
let NewSessionActionViewItem = class extends CompactButtonActionViewItem {
  constructor(action, telemetrySource, keybindingService, hoverService, telemetryService, contextKeyService) {
    super(action, keybindingService, hoverService, contextKeyService);
    this.telemetrySource = telemetrySource;
    this.telemetryService = telemetryService;
  }
  get commandId() {
    return NEW_SESSION_ACTION_ID;
  }
  get label() {
    return localize("newCompact", "New");
  }
  get onboardingTargetId() {
    return "sessions.newSession.button";
  }
  getHoverContent(keybindingLabel) {
    return keybindingLabel ? localize("newSessionButtonTitle", "New Session ({0})", keybindingLabel) : localize("newSessionButtonTitleWithoutKeybinding", "New Session");
  }
  getAriaLabel(keybindingAriaLabel) {
    return keybindingAriaLabel ? localize("newSessionButtonAriaLabel", "New Session ({0})", keybindingAriaLabel) : localize("newSessionButtonAriaLabelWithoutKeybinding", "New Session");
  }
  onRun() {
    logSessionsInteraction(this.telemetryService, "newSession", this.telemetrySource);
  }
};
NewSessionActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IContextKeyService)
], NewSessionActionViewItem);
let NewSessionActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService, contextKeyService, assignmentService, environmentService) {
    super();
    this.assignmentService = assignmentService;
    this.environmentService = environmentService;
    this.titleBarEnabledContext = SessionsTitleBarNewSessionEnabledContext.bindTo(contextKeyService);
    const onDidRegister = this._register(new Emitter());
    const menus = [Menus.SidebarSessionsHeader, Menus.TitleBarLeftLayout];
    for (const menu of menus) {
      const source = menu === Menus.TitleBarLeftLayout ? "titleBar" : "sidebar";
      this._register(actionViewItemService.register(menu, NEW_SESSION_ACTION_ID, (action, _options, instantiationService) => {
        if (!(action instanceof MenuItemAction)) {
          return void 0;
        }
        return instantiationService.createInstance(NewSessionActionViewItem, action, source);
      }, onDidRegister.event));
    }
    onDidRegister.fire();
    this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateTitleBarTreatment()));
    this.updateTitleBarTreatment();
  }
  async updateTitleBarTreatment() {
    if (!this.environmentService.isBuilt) {
      this.titleBarEnabledContext.set(true);
      return;
    }
    const enabled = await this.assignmentService.getTreatment(NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT);
    this.titleBarEnabledContext.set(enabled === true);
  }
};
NewSessionActionViewItemContribution.ID = "workbench.contrib.sessions.newSessionActionViewItem";
/** ExP treatment that shows the new-session button in the titlebar. */
NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT = "agentSessionsTitleBarNewSession";
NewSessionActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IWorkbenchAssignmentService),
  __decorateParam(3, IEnvironmentService)
], NewSessionActionViewItemContribution);
class NewChatActionViewItem extends CompactButtonActionViewItem {
  get commandId() {
    return ADD_CHAT_TO_SESSION_ACTION_ID;
  }
  get label() {
    return localize("chatCompositeBar.addChat.compact", "New Chat");
  }
  get showKeybindingHint() {
    return false;
  }
  getHoverContent(keybindingLabel) {
    return keybindingLabel ? localize("newChatButtonTitle", "New Chat ({0})", keybindingLabel) : localize("newChatButtonTitleWithoutKeybinding", "New Chat");
  }
  getAriaLabel(keybindingAriaLabel) {
    return keybindingAriaLabel ? localize("newChatButtonAriaLabel", "New Chat ({0})", keybindingAriaLabel) : localize("newChatButtonAriaLabelWithoutKeybinding", "New Chat");
  }
}
let SessionNewChatActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(Menus.SessionBarToolbar, ADD_CHAT_TO_SESSION_ACTION_ID, (action, _options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(NewChatActionViewItem, action);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
SessionNewChatActionViewItemContribution.ID = "workbench.contrib.sessions.newChatActionViewItem";
SessionNewChatActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], SessionNewChatActionViewItemContribution);
MenuRegistry.appendMenuItem(Menus.SessionHeaderMeta, {
  submenu: Menus.SessionConversations,
  title: localize2("chatCompositeBar.conversations", "Chats"),
  icon: Codicon.commentDiscussion,
  group: "navigation",
  order: 100,
  when: ContextKeyExpr.and(SessionIsCreatedContext, SessionIsArchivedContext.negate(), ContextKeyExpr.or(ContextKeyExpr.and(SessionSupportsMultipleChatsContext, SessionHasMultipleCommittedChatsContext), SessionActiveChatHasSubagentsContext))
});
let SessionConversationsMenuContribution = class extends Disposable {
  constructor(_sessionsService, _uriIdentityService) {
    super();
    this._sessionsService = _sessionsService;
    this._uriIdentityService = _uriIdentityService;
    this._register(autorun((reader) => {
      for (const session of this._sessionsService.visibleSessions.read(reader)) {
        if (session) {
          reader.store.add(this._registerSessionConversations(session, reader));
        }
      }
    }));
  }
  _registerSessionConversations(session, reader) {
    const store = new DisposableStore();
    const that = this;
    const extUri = this._uriIdentityService.extUri;
    const scopedToSession = ContextKeyExpr.equals(SessionIdContext.key, session.sessionId);
    const allChats = session.chats.read(reader);
    const mainResource = session.mainChat.read(reader).resource;
    const visibleChatTabs = session.visibleChatTabs.read(reader);
    const activeChatResource = session.activeChat.read(reader).resource;
    const registerToggle = (chat, group, order) => {
      const chatResource = chat.resource;
      const isShown = visibleChatTabs.some((c) => extUri.isEqual(c.resource, chatResource));
      const isMain = extUri.isEqual(chatResource, mainResource);
      const title = chat.title.read(reader) || localize("untitledChat", "Untitled Chat");
      store.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `sessions.toggleChat.${session.sessionId}.${hash(chatResource.toString())}`,
            title,
            toggled: isShown ? ContextKeyExpr.true() : void 0,
            precondition: isMain ? ContextKeyExpr.false() : void 0,
            menu: { id: Menus.SessionConversations, group, order, when: scopedToSession }
          });
        }
        async run(_accessor, forwardedSession) {
          const target = forwardedSession ?? session;
          const targetChat = target.chats.get().find((c) => extUri.isEqual(c.resource, chatResource));
          if (!targetChat) {
            return;
          }
          if (target.visibleChatTabs.get().some((c) => extUri.isEqual(c.resource, chatResource))) {
            await that._sessionsService.closeChat(target, targetChat);
          } else {
            await that._sessionsService.openChat(target, targetChat.resource);
          }
        }
      }));
    };
    allChats.forEach((chat, index) => {
      if (chat.status.read(reader) === SessionStatus.Untitled) {
        return;
      }
      if (chat.origin?.kind === ChatOriginKind.Tool) {
        return;
      }
      registerToggle(chat, "1_chats", index);
    });
    allChats.filter((chat) => chat.origin?.kind === ChatOriginKind.Tool && !!chat.origin.parentChat && extUri.isEqual(chat.origin.parentChat, activeChatResource)).forEach((chat, index) => registerToggle(chat, "2_subagents", index));
    return store;
  }
};
SessionConversationsMenuContribution.ID = "workbench.contrib.sessions.conversationsMenu";
SessionConversationsMenuContribution = __decorateClass([
  __decorateParam(0, ISessionsService),
  __decorateParam(1, IUriIdentityService)
], SessionConversationsMenuContribution);
registerAction2(class TogglePinSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.togglePin",
      title: localize2("chatCompositeBar.pin", "Pin Session"),
      icon: Codicon.pin,
      toggled: {
        condition: SessionIsStickyContext,
        icon: Codicon.pinned,
        title: localize("chatCompositeBar.unpin", "Unpin Session")
      },
      menu: {
        id: Menus.SessionBarToolbar,
        group: "1_session",
        order: 10,
        when: ContextKeyExpr.and(SessionIsCreatedContext, SessionIsArchivedContext.negate())
      }
    });
  }
  async run(accessor, session) {
    if (!session) {
      return;
    }
    accessor.get(ISessionsService).toggleSessionStickiness(session);
  }
});
MenuRegistry.appendMenuItem(Menus.SessionHeaderContext, {
  command: {
    id: "sessions.chatCompositeBar.togglePin",
    title: localize("chatCompositeBar.pinView", "Pin View"),
    toggled: {
      condition: SessionIsStickyContext,
      title: localize("chatCompositeBar.unpinView", "Unpin View")
    }
  },
  group: "1_view",
  order: 1,
  when: SessionIsCreatedContext
});
registerAction2(class RenameSessionHeaderAction extends Action2 {
  constructor() {
    super({
      id: "sessions.sessionHeader.rename",
      title: localize2("renameSessionHeader", "Rename..."),
      menu: [{
        id: Menus.SessionHeaderContext,
        group: "2_edit",
        order: 1,
        when: ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE)
      }]
    });
  }
  run(accessor, session) {
    if (!session) {
      return;
    }
    accessor.get(ISessionsPartService).getSessionView(session.sessionId)?.startTitleEditing();
  }
});
registerAction2(class CloseSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.close",
      title: localize2("chatCompositeBar.close", "Close"),
      icon: Codicon.close,
      menu: [{
        id: Menus.SessionBarToolbar,
        when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
        group: "1_session",
        order: 30
      }, {
        id: Menus.SessionHeaderContext,
        when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
        group: "1_view",
        order: 2
      }]
    });
  }
  async run(accessor, session) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    sessionsService.closeSession(session);
    sessionsPartService.focusSession(sessionsService.activeSession.get());
  }
});
registerAction2(class ToggleMaximizeSessionViewAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.toggleMaximize",
      title: localize2("chatCompositeBar.maximize", "Maximize Session"),
      icon: Codicon.screenFull,
      toggled: {
        condition: SessionIsMaximizedContext,
        icon: Codicon.screenNormal,
        title: localize("chatCompositeBar.unmaximize", "Restore Session")
      },
      menu: {
        id: Menus.SessionBarToolbar,
        when: MultipleSessionsVisibleContext,
        group: "1_session",
        order: 20
      }
    });
  }
  async run(accessor, session) {
    accessor.get(ISessionsPartService).toggleMaximizeSession(session);
    accessor.get(ISessionsService).setActive(session);
  }
});
registerAction2(class CloseEditorAreaAction extends Action2 {
  constructor() {
    super({
      id: "sessions.closeEditorArea",
      title: localize2("closeEditorArea", "Close Editor Area"),
      icon: Codicon.close,
      category: SessionsCategories.Sessions,
      menu: {
        id: MenuId.EditorGroupWatermarkToolbar,
        group: "navigation",
        order: 10,
        when: IsSessionsWindowContext
      }
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    layoutService.setPartHidden(true, Parts.EDITOR_PART);
  }
});
export {
  CompactButtonActionViewItem,
  NewSessionActionViewItemContribution,
  SHOW_CHATS_PICKER_COMMAND_ID,
  SHOW_SESSIONS_PICKER_COMMAND_ID,
  SessionConversationsMenuContribution,
  SessionNewChatActionViewItemContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc0FjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVSZWdpc3RyeSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvckFyZWFGb2N1c0NvbnRleHQsIElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyLCBpblF1aWNrUGlja0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9xdWlja2FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQ2FuR29CYWNrQ29udGV4dCwgQ2FuR29Gb3J3YXJkQ29udGV4dCwgU2Vzc2lvblByb3ZpZGVySWRDb250ZXh0LCBNdWx0aXBsZVNlc3Npb25zVmlzaWJsZUNvbnRleHQsIFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dCwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNlc3Npb25Jc01heGltaXplZENvbnRleHQsIFNlc3Npb25Jc1N0aWNreUNvbnRleHQsIFNlc3Npb25zRm9jdXNDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNNdWx0aXBsZUNoYXRzQ29udGV4dCwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQsIFNlc3Npb25JZENvbnRleHQsIFNlc3Npb25IYXNNdWx0aXBsZUNvbW1pdHRlZENoYXRzQ29udGV4dCwgU2Vzc2lvblNob3VsZFNob3dDaGF0VGFic0NvbnRleHQsIFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQsIFNlc3Npb25zUGlja2VyVmlzaWJsZUNvbnRleHQsIFNlc3Npb25BY3RpdmVDaGF0SXNDbG9zYWJsZUNvbnRleHQsIFNlc3Npb25BY3RpdmVDaGF0SXNEZWxldGFibGVDb250ZXh0LCBTZXNzaW9uQ2hhdHNQaWNrZXJWaXNpYmxlQ29udGV4dCwgU2Vzc2lvbkFjdGl2ZUNoYXRIYXNTdWJhZ2VudHNDb250ZXh0LCBTZXNzaW9uc1RpdGxlQmFyTmV3U2Vzc2lvbkVuYWJsZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEFOWV9BR0VOVF9IT1NUX1BST1ZJREVSX1JFIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE9yaWdpbktpbmQsIGdldENoYXRDYXBhYmlsaXRpZXMsIGdldFVudGl0bGVkU2Vzc2lvblRpdGxlLCBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQYXJ0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCBFdmVudEhlbHBlciwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgbWFya09uYm9hcmRpbmdUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9vbmJvYXJkaW5nL2Jyb3dzZXIvc3BvdGxpZ2h0L29uYm9hcmRpbmdUYXJnZXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50c05ld1Nlc3Npb25CdXR0b25CYWNrZ3JvdW5kLCBhZ2VudHNOZXdTZXNzaW9uQnV0dG9uQm9yZGVyLCBhZ2VudHNOZXdTZXNzaW9uQnV0dG9uRm9yZWdyb3VuZCwgYWdlbnRzTmV3U2Vzc2lvbkJ1dHRvbkhvdmVyQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBsb2dTZXNzaW9uc0ludGVyYWN0aW9uLCBTZXNzaW9uc0ludGVyYWN0aW9uU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE5FV19TRVNTSU9OX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBncm91cFNlc3Npb25zRm9yUGlja2VyIH0gZnJvbSAnLi9zZXNzaW9uc1BpY2tlci5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvbmV3U2Vzc2lvbkFjdGlvblZpZXdJdGVtLmNzcyc7XG5cbi8vIC0tIFNob3cgU2Vzc2lvbnMgUGlja2VyIC0tXG5cbmV4cG9ydCBjb25zdCBTSE9XX1NFU1NJT05TX1BJQ0tFUl9DT01NQU5EX0lEID0gJ3Nlc3Npb25zLnNob3dTZXNzaW9uc1BpY2tlcic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93U2Vzc2lvbnNQaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNIT1dfU0VTU0lPTlNfUElDS0VSX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93U2Vzc2lvbnNQaWNrZXInLCBcIlNob3cgU2Vzc2lvbnMgUGlja2VyXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Uixcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5UiB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHsgcmVjZW50LCBvdGhlciB9ID0gc2Vzc2lvbnNTZXJ2aWNlLmdldFJlY2VudGx5T3BlbmVkU2Vzc2lvbnMoKTtcblx0XHRjb25zdCBzZXNzaW9uR3JvdXBzID0gZ3JvdXBTZXNzaW9uc0ZvclBpY2tlcihyZWNlbnQsIG90aGVyKTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uSWQgPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkO1xuXG5cdFx0aW50ZXJmYWNlIElTZXNzaW9uUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0XHRzZXNzaW9uPzogSVNlc3Npb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IChJU2Vzc2lvblBpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdGxldCBmaXJzdFNlc3Npb25JdGVtOiBJU2Vzc2lvblBpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gTmV3IHNlc3Npb24gaXRlbVxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0bGFiZWw6IGAkKGFkZCkgJHtsb2NhbGl6ZSgnbmV3U2Vzc2lvbicsIFwiTmV3IFNlc3Npb25cIil9YCxcblx0XHRcdHNlc3Npb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvUGlja0l0ZW0gPSAoc2Vzc2lvbjogSVNlc3Npb24pOiBJU2Vzc2lvblBpY2tJdGVtID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gc2Vzc2lvbi50aXRsZS5nZXQoKSB8fCBnZXRVbnRpdGxlZFNlc3Npb25UaXRsZShzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSA/PyBmYWxzZSk7XG5cblx0XHRcdC8vIFN0YXR1cyBpY29uLCBtaXJyb3JpbmcgdGhlIHNlc3Npb25zIGxpc3QgYW5kIHNlc3Npb24gaGVhZGVyLlxuXHRcdFx0Y29uc3Qgc3RhdHVzID0gc2Vzc2lvbi5zdGF0dXMuZ2V0KCk7XG5cdFx0XHRjb25zdCBpc1JlYWQgPSBzZXNzaW9uLmlzUmVhZC5nZXQoKTtcblx0XHRcdGNvbnN0IGlzQXJjaGl2ZWQgPSBzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0XHRcdGNvbnN0IHB1bGxSZXF1ZXN0SWNvbiA9IHdvcmtzcGFjZT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5nZXQoKT8ucHVsbFJlcXVlc3Q/Lmljb247XG5cdFx0XHRjb25zdCBpY29uID0gc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmdldFN0YXR1c0ljb24oc3RhdHVzLCBpc1JlYWQsIGlzQXJjaGl2ZWQsIHB1bGxSZXF1ZXN0SWNvbik7XG5cblx0XHRcdC8vIFNlY29uZCByb3c6IHdvcmtzcGFjZSAod2l0aCBpdHMgaWNvbiwgbGlrZSB0aGUgc2Vzc2lvbiBoZWFkZXIgL1xuXHRcdFx0Ly8gbGlzdCkgYW5kIHRoZSByZWxhdGl2ZSB0aW1lLiBBIGxlYWRpbmcgYmxhbmsgaWNvbiBhbGlnbnMgdGhlXG5cdFx0XHQvLyB3b3Jrc3BhY2UgaWNvbiB1bmRlciB0aGUgdGl0bGUgdGV4dCAodGhlIHN0YXR1cyBpY29uIHNpdHMgaW4gdGhlXG5cdFx0XHQvLyBsZWZ0IGd1dHRlcikuXG5cdFx0XHRjb25zdCBkZXRhaWxQYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmICh3b3Jrc3BhY2U/LmxhYmVsKSB7XG5cdFx0XHRcdGNvbnN0IGlzV29ya3NwYWNlRm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID4gMCAmJiB3b3Jrc3BhY2UuZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8ud29ya1RyZWVVcmkgPT09IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlSWNvbiA9IHdvcmtzcGFjZS5pc1ZpcnR1YWxXb3Jrc3BhY2UgPyBDb2RpY29uLmNsb3VkIDogaXNXb3Jrc3BhY2VGb2xkZXIgPyBDb2RpY29uLmZvbGRlciA6IENvZGljb24ud29ya3RyZWU7XG5cdFx0XHRcdGRldGFpbFBhcnRzLnB1c2goYCQoJHtDb2RpY29uLmJsYW5rLmlkfSkgJCgke3dvcmtzcGFjZUljb24uaWR9KSAke3dvcmtzcGFjZS5sYWJlbH1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRldGFpbFBhcnRzLnB1c2goYCQoJHtDb2RpY29uLmJsYW5rLmlkfSlgKTtcblx0XHRcdH1cblx0XHRcdGRldGFpbFBhcnRzLnB1c2goZnJvbU5vdyhzZXNzaW9uLnVwZGF0ZWRBdC5nZXQoKSwgdHJ1ZSwgdHJ1ZSkpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogdGl0bGUsXG5cdFx0XHRcdGRldGFpbDogZGV0YWlsUGFydHMuam9pbignIFxcdTAwQjcgJyksXG5cdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pLFxuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXBwZW5kU2Vzc2lvbnMgPSAobGFiZWw6IHN0cmluZywgc2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10pOiB2b2lkID0+IHtcblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbCB9KTtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdG9QaWNrSXRlbShzZXNzaW9uKTtcblx0XHRcdFx0Zmlyc3RTZXNzaW9uSXRlbSA/Pz0gaXRlbTtcblx0XHRcdFx0aXRlbXMucHVzaChpdGVtKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXBwZW5kU2Vzc2lvbnMobG9jYWxpemUoJ3Nlc3Npb25zUGlja2VyTmVlZHNJbnB1dCcsIFwibmVlZHMgaW5wdXRcIiksIHNlc3Npb25Hcm91cHMubmVlZHNJbnB1dCk7XG5cdFx0YXBwZW5kU2Vzc2lvbnMobG9jYWxpemUoJ3Nlc3Npb25zUGlja2VyVW5yZWFkJywgXCJ1bnJlYWRcIiksIHNlc3Npb25Hcm91cHMudW5yZWFkKTtcblx0XHRhcHBlbmRTZXNzaW9ucyhsb2NhbGl6ZSgncmVjZW50bHlPcGVuZWQnLCBcInJlY2VudGx5IG9wZW5lZFwiKSwgc2Vzc2lvbkdyb3Vwcy5yZWNlbnQpO1xuXHRcdGFwcGVuZFNlc3Npb25zKGxvY2FsaXplKCdvdGhlclNlc3Npb25zJywgXCJvdGhlciBzZXNzaW9uc1wiKSwgc2Vzc2lvbkdyb3Vwcy5vdGhlcik7XG5cblx0XHRjb25zdCBwaWNrZXIgPSBxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVNlc3Npb25QaWNrSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pO1xuXHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzZWFyY2hTZXNzaW9ucycsIFwiU2VhcmNoIHNlc3Npb25zIGJ5IG5hbWUgb3IgZm9sZGVyXCIpO1xuXHRcdHBpY2tlci5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdC8vIE1hdGNoIG9uIHRoZSBkZXRhaWwgcm93IHRvbyBzbyBzZXNzaW9ucyBjYW4gYmUgZm91bmQgYnkgdGhlaXIgZm9sZGVyLlxuXHRcdHBpY2tlci5tYXRjaE9uRGV0YWlsID0gdHJ1ZTtcblx0XHRpZiAoZmlyc3RTZXNzaW9uSXRlbSkge1xuXHRcdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW2ZpcnN0U2Vzc2lvbkl0ZW1dO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIpO1xuXG5cdFx0Ly8gRXhwb3NlIGEgY29udGV4dCBrZXkgd2hpbGUgdGhlIHBpY2tlciBpcyBvcGVuIHNvIHRoZSBuYXZpZ2F0ZVxuXHRcdC8vIGtleWJpbmRpbmdzIChib3VuZCB0byB0aGUgc2FtZSBjaG9yZCBhcyB0aGlzIGNvbW1hbmQpIGNhbiBhZHZhbmNlIHRoZVxuXHRcdC8vIHNlbGVjdGlvbiBpbnN0ZWFkIG9mIHJlLW9wZW5pbmcgdGhlIHBpY2tlci5cblx0XHRjb25zdCBwaWNrZXJWaXNpYmxlQ29udGV4dCA9IFNlc3Npb25zUGlja2VyVmlzaWJsZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRwaWNrZXJWaXNpYmxlQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwaWNrZXJWaXNpYmxlQ29udGV4dC5yZXNldCgpKSk7XG5cblx0XHRjb25zdCBvcGVuU2VsZWN0ZWQgPSAoc2VsZWN0ZWQ6IElTZXNzaW9uUGlja0l0ZW0sIGluQmFja2dyb3VuZDogYm9vbGVhbiwgdG9TaWRlOiBib29sZWFuKTogdm9pZCA9PiB7XG5cdFx0XHRpZiAoIXNlbGVjdGVkLnNlc3Npb24pIHtcblx0XHRcdFx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9uKCk7XG5cdFx0XHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPcGVuIHRvIHRoZSBzaWRlOiBwbGFjZSB0aGUgc2Vzc2lvbiBpbiBhIG5ldyBncmlkIHNsb3QgbmV4dCB0byB0aGVcblx0XHRcdC8vIGN1cnJlbnRseSBhY3RpdmUgc2Vzc2lvbiBpbnN0ZWFkIG9mIHJlcGxhY2luZyBpdC4gRmFsbHMgYmFjayB0byBhXG5cdFx0XHQvLyBub3JtYWwgb3BlbiB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uIHRvIGFuY2hvciBhZ2FpbnN0IG9yIHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbiBpcyBhbHJlYWR5IHRoZSBhY3RpdmUgb25lLlxuXHRcdFx0aWYgKHRvU2lkZSAmJiBhY3RpdmVTZXNzaW9uSWQgIT09IHVuZGVmaW5lZCAmJiBzZWxlY3RlZC5zZXNzaW9uLnNlc3Npb25JZCAhPT0gYWN0aXZlU2Vzc2lvbklkKSB7XG5cdFx0XHRcdHNlc3Npb25zU2VydmljZS5pbnNlcnRBdChzZWxlY3RlZC5zZXNzaW9uLCBhY3RpdmVTZXNzaW9uSWQsICdyaWdodCcsICFpbkJhY2tncm91bmQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5TZXNzaW9uKHNlbGVjdGVkLnNlc3Npb24ucmVzb3VyY2UsIHsgcHJlc2VydmVGb2N1czogaW5CYWNrZ3JvdW5kIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGUgPT4ge1xuXHRcdFx0Y29uc3QgW3NlbGVjdGVkXSA9IHBpY2tlci5zZWxlY3RlZEl0ZW1zO1xuXHRcdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRcdGNvbnN0IHRvU2lkZSA9IHBpY2tlci5rZXlNb2RzLmN0cmxDbWQgfHwgcGlja2VyLmtleU1vZHMuYWx0O1xuXHRcdFx0XHRvcGVuU2VsZWN0ZWQoc2VsZWN0ZWQsIGUuaW5CYWNrZ3JvdW5kLCB0b1NpZGUpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQmFja2dyb3VuZCBhY2NlcHQgKGUuZy4gUmlnaHQgQXJyb3cpIGtlZXBzIHRoZSBwaWNrZXIgb3BlbiBzbyB0aGVcblx0XHRcdC8vIHVzZXIgY2FuIGNvbnRpbnVlIG5hdmlnYXRpbmcsIG1pcnJvcmluZyBlZGl0b3IgcXVpY2sgb3Blbi5cblx0XHRcdGlmICghZS5pbkJhY2tncm91bmQpIHtcblx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRwaWNrZXIuc2hvdygpO1xuXHR9XG59KTtcblxuLy8gLS0gU2Vzc2lvbnMgUGlja2VyIFF1aWNrIE5hdmlnYXRpb24gLS1cbi8vIFdoaWxlIHRoZSBzZXNzaW9ucyBwaWNrZXIgaXMgb3BlbiwgcHJlc3NpbmcgdGhlIHNhbWUgY2hvcmQgYWdhaW4gYWR2YW5jZXMgdGhlXG4vLyBhY3RpdmUgaXRlbSAoYW5kIFNoaWZ0IGdvZXMgYmFja3dhcmRzKSwgc28gdGhlIHVzZXIgY2FuIGhvbGQgdGhlIG1vZGlmaWVyIGFuZFxuLy8gdGFiIHRocm91Z2ggc2Vzc2lvbnMsIHRoZW4gcmVsZWFzZSB0byBvcGVuIHRoZSBmb2N1c2VkIG9uZS5cblxuY29uc3QgU0VTU0lPTlNfUElDS0VSX05BVklHQVRFX05FWFRfSUQgPSAnc2Vzc2lvbnMuc2hvd1Nlc3Npb25zUGlja2VyLm5hdmlnYXRlTmV4dCc7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFNFU1NJT05TX1BJQ0tFUl9OQVZJR0FURV9ORVhUX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgNTAsXG5cdGhhbmRsZXI6IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyKFNFU1NJT05TX1BJQ0tFUl9OQVZJR0FURV9ORVhUX0lELCB0cnVlKSxcblx0d2hlbjogU2Vzc2lvbnNQaWNrZXJWaXNpYmxlQ29udGV4dCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVIgfSxcbn0pO1xuXG5jb25zdCBTRVNTSU9OU19QSUNLRVJfTkFWSUdBVEVfUFJFVklPVVNfSUQgPSAnc2Vzc2lvbnMuc2hvd1Nlc3Npb25zUGlja2VyLm5hdmlnYXRlUHJldmlvdXMnO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBTRVNTSU9OU19QSUNLRVJfTkFWSUdBVEVfUFJFVklPVVNfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIgKyA1MCxcblx0aGFuZGxlcjogZ2V0UXVpY2tOYXZpZ2F0ZUhhbmRsZXIoU0VTU0lPTlNfUElDS0VSX05BVklHQVRFX1BSRVZJT1VTX0lELCBmYWxzZSksXG5cdHdoZW46IFNlc3Npb25zUGlja2VyVmlzaWJsZUNvbnRleHQsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlSLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlSIH0sXG59KTtcblxuLy8gLS0gR28gQmFjayAtLVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgR29CYWNrQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuZ29CYWNrJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignc2Vzc2lvbnNHb0JhY2snLCBcIkdvIEJhY2tcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTZXNzaW9uc0JhY2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZCYWNrXCIpXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93TGVmdCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZXNzaW9uc0dvQmFja1Rvb2x0aXAnLCBcIkdvIEJhY2sgT25lIFNlc3Npb25cIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDYW5Hb0JhY2tDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHQvLyBIaWdoZXIgdGhhbiBgV29ya2JlbmNoQ29udHJpYmAgc28gdGhlIGBDdHJsK1NoaWZ0K1RhYmAgc2Vjb25kYXJ5IHdpbnMgb3ZlciB0aGVcblx0XHRcdFx0Ly8gZWRpdG9yIHF1aWNrLW9wZW4gYWN0aW9ucyAod2hpY2ggYmluZCB0aGUgc2FtZSBjaG9yZCBhdCBgV29ya2JlbmNoQ29udHJpYmApLlxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93LCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiXSB9LFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLk1pbnVzLCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrLCBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiXSB9LFxuXHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLk1pbnVzLCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiXSB9LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5UaXRsZUJhckNlbnRlckxlZnQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5Hb01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9oaXN0b3J5X25hdicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKS5vcGVuUHJldmlvdXNTZXNzaW9uKCk7XG5cdH1cbn0pO1xuXG4vLyAtLSBHbyBGb3J3YXJkIC0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb0ZvcndhcmRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5nb0ZvcndhcmQnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdzZXNzaW9uc0dvRm9yd2FyZCcsIFwiR28gRm9yd2FyZFwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNlc3Npb25zRm9yd2FyZCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkZvcndhcmRcIilcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dSaWdodCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZXNzaW9uc0dvRm9yd2FyZFRvb2x0aXAnLCBcIkdvIEZvcndhcmQgT25lIFNlc3Npb25cIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDYW5Hb0ZvcndhcmRDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHQvLyBIaWdoZXIgdGhhbiBgV29ya2JlbmNoQ29udHJpYmAgc28gdGhlIGBDdHJsK1RhYmAgc2Vjb25kYXJ5IHdpbnMgb3ZlciB0aGVcblx0XHRcdFx0Ly8gZWRpdG9yIHF1aWNrLW9wZW4gYWN0aW9ucyAod2hpY2ggYmluZCB0aGUgc2FtZSBjaG9yZCBhdCBgV29ya2JlbmNoQ29udHJpYmApLlxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuUmlnaHRBcnJvdywgc2Vjb25kYXJ5OiBbS2V5Q29kZS5Ccm93c2VyRm9yd2FyZCwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlRhYl0gfSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5NaW51cywgc2Vjb25kYXJ5OiBbS2V5Q29kZS5Ccm93c2VyRm9yd2FyZCwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlRhYl0gfSxcblx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLk1pbnVzLCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJGb3J3YXJkLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVGFiXSB9LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5UaXRsZUJhckNlbnRlckxlZnQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5Hb01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9oaXN0b3J5X25hdicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKS5vcGVuTmV4dFNlc3Npb24oKTtcblx0fVxufSk7XG5cbi8vIC0tIEZvY3VzIEFjdGl2ZSBTZXNzaW9uIC0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c0FjdGl2ZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5mb2N1c0FjdGl2ZVNlc3Npb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNBY3RpdmVTZXNzaW9uJywgXCJGb2N1cyBBY3RpdmUgU2Vzc2lvblwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0Ly8gTXVzdCBvdXRyYW5rIHRoZSB3b3JrYmVuY2ggYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuYCBiaW5kaW5nXG5cdFx0XHRcdC8vIChXb3JrYmVuY2hDb250cmliKSBzbyB0aGF0IGluIHRoZSBzZXNzaW9ucyB3aW5kb3cgdGhlIGNob3JkXG5cdFx0XHRcdC8vIGZvY3VzZXMgdGhlIGFjdGl2ZSBzZXNzaW9uLiBVc2luZyB0aGUgbm9ybWFsIG9wZW4gY2hhdCBhY3Rpb24gd2lsbCBub3Qgd29yayBmb3IgbmV3IHNlc3Npb24gdmlld3MuXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5SSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleUkgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24oc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCkpO1xuXHR9XG59KTtcblxuLy8gLS0gRm9jdXMgTnRoIFNlc3Npb24gaW4gdGhlIEdyaWQgKENtZC9DdHJsKzEuLjkpIC0tXG4vLyBNaXJyb3JzIFZTIENvZGUncyBcIkZvY3VzIEVkaXRvciBHcm91cCBOXCI6IEN0cmwvQ21kKzEuLjggZm9jdXMgdGhhdCBncmlkIHNsb3Rcbi8vIGFuZCBDdHJsL0NtZCs5IGZvY3VzZXMgdGhlIExBU1Qgc2xvdC4gRG9lcyBub3RoaW5nIHdoZW4gdGhlIHNsb3QgZG9lc24ndCBleGlzdC5cblxuZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IDk7IGluZGV4KyspIHtcblx0Y29uc3QgcG9zaXRpb24gPSBpbmRleCArIDE7XG5cdGNvbnN0IGlzTGFzdCA9IHBvc2l0aW9uID09PSA5O1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNTZXNzaW9uQnlQb3NpdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogYHNlc3Npb25zLmZvY3VzU2Vzc2lvbkluR3JpZCR7cG9zaXRpb259YCxcblx0XHRcdFx0dGl0bGU6IGlzTGFzdFxuXHRcdFx0XHRcdD8gbG9jYWxpemUyKCdmb2N1c0xhc3RTZXNzaW9uSW5HcmlkJywgXCJGb2N1cyBMYXN0IFNlc3Npb24gaW4gR3JpZFwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUyKCdmb2N1c1Nlc3Npb25JbkdyaWQnLCBcIkZvY3VzIFNlc3Npb24gezB9IGluIEdyaWRcIiwgcG9zaXRpb24pLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCAoS2V5Q29kZS5EaWdpdDEgKyBpbmRleCksXG5cdFx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB2aXNpYmxlID0gc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5nZXQoKTtcblx0XHRcdGNvbnN0IHRhcmdldEluZGV4ID0gaXNMYXN0ID8gdmlzaWJsZS5sZW5ndGggLSAxIDogaW5kZXg7XG5cdFx0XHRpZiAodGFyZ2V0SW5kZXggPCAwIHx8IHRhcmdldEluZGV4ID49IHZpc2libGUubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpc2libGVbdGFyZ2V0SW5kZXhdO1xuXHRcdFx0c2Vzc2lvbnNTZXJ2aWNlLnNldEFjdGl2ZShzZXNzaW9uKTtcblx0XHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0fSk7XG59XG5cbi8vIC0tIENsb3NlIEFsbCBTZXNzaW9ucyAtLVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xvc2VBbGxTZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmNsb3NlQWxsU2Vzc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VBbGxTZXNzaW9ucycsIFwiQ2xvc2UgQWxsIFNlc3Npb25zXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXKSxcblx0XHRcdFx0Ly8gT25seSBmaXJlIGZyb20gdGhlIGtleWJvYXJkIHdoaWxlIGEgc2Vzc2lvbiAoaXRzIGNoYXQgdmlldykgaGFzIGZvY3VzLlxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIFNlc3Npb25zRm9jdXNDb250ZXh0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSkuY2xvc2VBbGxTZXNzaW9ucygpO1xuXHR9XG59KTtcblxuLy8gLS0gQ2hhdCB0YWIgbmF2aWdhdGlvbiwgbmV3IGNoYXQsICYgY2xvc2UgKHdpdGhpbiB0aGUgYWN0aXZlIHNlc3Npb24ncyB0YWIgc3RyaXApIC0tXG5cbi8vIFRoZXNlIGNob3JkcyBzaXQganVzdCBhYm92ZSB0aGUgc2Vzc2lvbi1sZXZlbCBuYXZpZ2F0aW9uL2Nsb3NlIGNvbW1hbmRzIHNvXG4vLyB0aGV5IHdpbiB3aGlsZSBhIG11bHRpLWNoYXQgc2Vzc2lvbiBpcyBmb2N1c2VkLCBmYWxsaW5nIGJhY2sgdG8gdGhlXG4vLyBzZXNzaW9uLWxldmVsIGNvbW1hbmRzIHdoZW4gdGhlIHRhYiBzdHJpcCBpcyBub3Qgc2hvd24uXG5jb25zdCBDSEFUX1RBQl9LRVlCSU5ESU5HX1dFSUdIVCA9IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgMTA7XG5cbi8vIFwiTmV3IENoYXRcIiBzdGFydHMgYSBuZXcgY2hhdC4gSGlkZGVuIG9uY2UgdGhlIHNlc3Npb24gaGFzIG1vcmUgdGhhbiBvbmUgb3BlblxuLy8gY2hhdCwgc2luY2UgdGhlIGNoYXQgdGFiIHN0cmlwIHRoZW4gb2ZmZXJzIE5ldyBDaGF0IGF0IHRoZSBlbmQgb2YgdGhlIHRhYnMuXG5jb25zdCBBRERfQ0hBVF9UT19TRVNTSU9OX0FDVElPTl9JRCA9ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLmFkZENoYXQnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQWRkQ2hhdFRvU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQUREX0NIQVRfVE9fU0VTU0lPTl9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Q29tcG9zaXRlQmFyLmFkZENoYXQnLCBcIk5ldyBDaGF0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hZGQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogQ0hBVF9UQUJfS0VZQklORElOR19XRUlHSFQsXG5cdFx0XHRcdC8vIExpa2UgQ21kL0N0cmwrVCBpbiBhIGJyb3dzZXIgXHUyMDE0IG9wZW5zIGEgbmV3IGNoYXQgdGFiIHdpdGhpbiB0aGVcblx0XHRcdFx0Ly8gYWN0aXZlIHNlc3Npb24uIFNjb3BlZCBzbyBpdCBkb2VzIG5vdCBzdGVhbCB0aGUgc2hvcnRjdXQgb3V0c2lkZVxuXHRcdFx0XHQvLyB0aGUgYWdlbnRzIHdpbmRvdyBvciB3aGVuIHRoZSBzZXNzaW9uIGRvZXMgbm90IHN1cHBvcnQgbXVsdGlwbGUgY2hhdHMuXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNlc3Npb25TdXBwb3J0c011bHRpcGxlQ2hhdHNDb250ZXh0LCBTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5VCxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgU2Vzc2lvblN1cHBvcnRzTXVsdGlwbGVDaGF0c0NvbnRleHQsIFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSwgU2Vzc2lvblNob3VsZFNob3dDaGF0VGFic0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbj86IElBY3RpdmVTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXHRcdC8vIEZyb20gdGhlIG1lbnU6IHNlc3Npb24gaXMgZm9yd2FyZGVkIGFzIGNvbnRleHQuIEZyb20gdGhlIGtleWJpbmRpbmc6XG5cdFx0Ly8gZmFsbCBiYWNrIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbi5cblx0XHRjb25zdCB0YXJnZXQgPSBzZXNzaW9uID8/IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuTmV3Q2hhdEluU2Vzc2lvbih0YXJnZXQpO1xuXHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHRhcmdldCk7XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBuYXZpZ2F0ZUNoYXRUYWIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRpcmVjdGlvbjogJ25leHQnIHwgJ3ByZXZpb3VzJyk6IHZvaWQge1xuXHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXHRjb25zdCBleHRVcmkgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSkuZXh0VXJpO1xuXHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdGlmICghc2Vzc2lvbikge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCB0YWJzID0gc2Vzc2lvbi52aXNpYmxlQ2hhdFRhYnMuZ2V0KCk7XG5cdGlmICh0YWJzLmxlbmd0aCA8IDIpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgYWN0aXZlQ2hhdCA9IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKTtcblx0Y29uc3QgY3VycmVudEluZGV4ID0gYWN0aXZlQ2hhdCA/IHRhYnMuZmluZEluZGV4KGNoYXQgPT4gZXh0VXJpLmlzRXF1YWwoY2hhdC5yZXNvdXJjZSwgYWN0aXZlQ2hhdC5yZXNvdXJjZSkpIDogLTE7XG5cdGNvbnN0IGZyb20gPSBjdXJyZW50SW5kZXggPT09IC0xID8gMCA6IGN1cnJlbnRJbmRleDtcblx0Y29uc3QgZGVsdGEgPSBkaXJlY3Rpb24gPT09ICduZXh0JyA/IDEgOiAtMTtcblx0Y29uc3QgdGFyZ2V0ID0gdGFic1soZnJvbSArIGRlbHRhICsgdGFicy5sZW5ndGgpICUgdGFicy5sZW5ndGhdO1xuXHRzZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQoc2Vzc2lvbiwgdGFyZ2V0LnJlc291cmNlKTtcblx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24oc2Vzc2lvbik7XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOYXZpZ2F0ZU5leHRDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2hhdENvbXBvc2l0ZUJhci5uYXZpZ2F0ZU5leHRDaGF0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25hdmlnYXRlTmV4dENoYXQnLCBcIkdvIHRvIE5leHQgQ2hhdFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHByZWNvbmRpdGlvbjogU2Vzc2lvbkhhc011bHRpcGxlT3BlbkNoYXRzQ29udGV4dCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBDSEFUX1RBQl9LRVlCSU5ESU5HX1dFSUdIVCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uSGFzTXVsdGlwbGVPcGVuQ2hhdHNDb250ZXh0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJyYWNrZXRSaWdodCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0bmF2aWdhdGVDaGF0VGFiKGFjY2Vzc29yLCAnbmV4dCcpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5hdmlnYXRlUHJldmlvdXNDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2hhdENvbXBvc2l0ZUJhci5uYXZpZ2F0ZVByZXZpb3VzQ2hhdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduYXZpZ2F0ZVByZXZpb3VzQ2hhdCcsIFwiR28gdG8gUHJldmlvdXMgQ2hhdFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHByZWNvbmRpdGlvbjogU2Vzc2lvbkhhc011bHRpcGxlT3BlbkNoYXRzQ29udGV4dCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBDSEFUX1RBQl9LRVlCSU5ESU5HX1dFSUdIVCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uSGFzTXVsdGlwbGVPcGVuQ2hhdHNDb250ZXh0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJyYWNrZXRMZWZ0LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRuYXZpZ2F0ZUNoYXRUYWIoYWNjZXNzb3IsICdwcmV2aW91cycpO1xuXHR9XG59KTtcblxuLy8gVGhlIGNsb3NlLWNoYXQgYWN0aW9uIGlzIGJvdGggYSBrZXliaW5kaW5nIChDdHJsL0NtZCtXIGNsb3NlcyB0aGUgYWN0aXZlIGNoYXQpXG4vLyBhbmQgYSBwZXItdGFiIHRvb2xiYXIgYWN0aW9uIGNvbnRyaWJ1dGVkIHRvIHtAbGluayBNZW51cy5TZXNzaW9uQ2hhdFRhYn06IHRoZVxuLy8gY2hhdCB0YWIgc3RyaXAgcmVuZGVycyB0aGlzIG1lbnUgYW5kIGZvcndhcmRzIHRoZSB0YWIncyB7QGxpbmsgSUNoYXRUYWJDb250ZXh0fVxuLy8gYXMgdGhlIGFjdGlvbiBhcmd1bWVudCBzbyB0aGUgYnV0dG9uIGNsb3NlcyB0aGF0IHNwZWNpZmljIHRhYi5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRUYWJDb250ZXh0IHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb247XG5cdHJlYWRvbmx5IGNoYXQ6IElDaGF0O1xufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xvc2VDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2hhdENvbXBvc2l0ZUJhci5jbG9zZUNoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VBY3RpdmVDaGF0JywgXCJDbG9zZSBDaGF0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdC8vIEhpZGRlbiBmcm9tIHRoZSBwYWxldHRlOiBjbG9zaW5nIGEgc3BlY2lmaWMgY2hhdCBpcyBjb250ZXh0dWFsICh0aGVcblx0XHRcdC8vIGtleWJpbmRpbmcgdGFyZ2V0cyB0aGUgYWN0aXZlIGNoYXQ7IHRoZSBtZW51IHRhcmdldHMgYSB0YWIpLlxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBDSEFUX1RBQl9LRVlCSU5ESU5HX1dFSUdIVCxcblx0XHRcdFx0Ly8gSW50ZXJjZXB0IEN0cmwvQ21kK1cgKHdoaWNoIG90aGVyd2lzZSBjbG9zZXMgdGhlIHNlc3Npb24pIG9ubHlcblx0XHRcdFx0Ly8gd2hpbGUgdGhlIGFjdGl2ZSBjaGF0IGlzIGEgY2xvc2VhYmxlIG5vbi1tYWluIGNoYXQsIHNvIGl0IGNsb3Nlc1xuXHRcdFx0XHQvLyB0aGUgY2hhdCB0YWIgaW5zdGVhZCBcdTIwMTQgbGlrZSBjbG9zaW5nIGEgdGFiIHZzIHRoZSB3aW5kb3cuXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbkFjdGl2ZUNoYXRJc0Nsb3NhYmxlQ29udGV4dCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXLFxuXHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY0LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5V10gfSxcblx0XHRcdH0sXG5cdFx0XHQvLyBSZW5kZXJlZCBhcyB0aGUgdGFiJ3MgY2xvc2UgYnV0dG9uIGJ5IHRoZSBjaGF0IHRhYiBzdHJpcDsgdGhlIG1haW5cblx0XHRcdC8vIGNoYXQncyB0YWIgZG9lcyBub3QgcmVuZGVyIHRoaXMgbWVudSwgc28gbm8gcGVyLXRhYiBnYXRpbmcgaXMgbmVlZGVkLlxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbkNoYXRUYWIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUNoYXRUYWJDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dFVyaSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKS5leHRVcmk7XG5cdFx0Ly8gRnJvbSB0aGUgdGFiIG1lbnU6IGFjdCBvbiB0aGUgZm9yd2FyZGVkIHRhYidzIGNoYXQuIEZyb20gdGhlIGtleWJpbmRpbmc6XG5cdFx0Ly8gYWN0IG9uIHRoZSBhY3RpdmUgY2hhdCBvZiB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbnRleHQ/LnNlc3Npb24gPz8gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXQgPSBjb250ZXh0Py5jaGF0ID8/IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKTtcblx0XHRpZiAoIWNoYXQgfHwgZXh0VXJpLmlzRXF1YWwoY2hhdC5yZXNvdXJjZSwgc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQW4gdW50aXRsZWQgKGluLWNvbXBvc2VyKSBkcmFmdCBoYXMgbm90aGluZyB0byByZW9wZW4sIHNvIGRlbGV0ZSBpdFxuXHRcdC8vIG91dHJpZ2h0OyBhIGNvbW1pdHRlZCBjaGF0IGlzIGhpZGRlbiAocmVvcGVuYWJsZSkuXG5cdFx0aWYgKGNoYXQuc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmRlbGV0ZUNoYXQoc2Vzc2lvbiwgY2hhdC5yZXNvdXJjZSwgeyBza2lwQ29uZmlybWF0aW9uOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uc1NlcnZpY2UuY2xvc2VDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbG9zZUFsbENoYXRzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2hhdENvbXBvc2l0ZUJhci5jbG9zZUFsbENoYXRzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlQWxsQ2hhdHMnLCBcIkNsb3NlIEFsbCBDaGF0c1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdC8vIEVuYWJsZWQgKHBhbGV0dGUgKyBrZXliaW5kaW5nKSBvbmx5IHdoaWxlIHRoZSBhY3RpdmUgc2Vzc2lvbiBoYXMgbW9yZVxuXHRcdFx0Ly8gdGhhbiBvbmUgb3BlbiBjaGF0LCBzbyB0aGUgY2hvcmQgdGFyZ2V0cyB0aGUgZm9jdXNlZCBzZXNzaW9uIGFuZFxuXHRcdFx0Ly8gc3RheXMgaW5lcnQgZm9yIHNpbmdsZS1jaGF0IHNlc3Npb25zLlxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZXNzaW9uSGFzTXVsdGlwbGVPcGVuQ2hhdHNDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IENIQVRfVEFCX0tFWUJJTkRJTkdfV0VJR0hULFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdFx0Ly8gV2hpbGUgYSBtb2RhbCBlZGl0b3IgaGFzIGZvY3VzLCBsZXQgVlMgQ29kZSdzIG93blxuXHRcdFx0XHRcdC8vIGNsb3NlRWRpdG9yc0luR3JvdXAgKHNhbWUgY2hvcmQpIGFjdCBvbiB0aGUgZWRpdG9yIGdyb3VwLlxuXHRcdFx0XHRcdEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0U2Vzc2lvbkhhc011bHRpcGxlT3BlbkNoYXRzQ29udGV4dFxuXHRcdFx0XHQpLFxuXHRcdFx0XHQvLyBNaXJyb3IgVlMgQ29kZSdzIFwiQ2xvc2UgQWxsIEVkaXRvcnMgaW4gR3JvdXBcIiBjaG9yZCAoQ3RybC9DbWQrSyBXKTpcblx0XHRcdFx0Ly8gYSBzZXNzaW9uIGlzIHRoZSBBZ2VudHMtd2luZG93IGFuYWxvZ3VlIG9mIGFuIGVkaXRvciBncm91cC4gTm90ZVxuXHRcdFx0XHQvLyBcIkNsb3NlIEFsbCBTZXNzaW9uc1wiIGFscmVhZHkgb3ducyBDdHJsL0NtZCtLIEN0cmwvQ21kK1cuXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleVcpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRVcmkgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSkuZXh0VXJpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYWluUmVzb3VyY2UgPSBzZXNzaW9uLm1haW5DaGF0LmdldCgpLnJlc291cmNlO1xuXHRcdGNvbnN0IGNoYXRzVG9DbG9zZSA9IHNlc3Npb24ub3BlbkNoYXRzLmdldCgpLmZpbHRlcihjaGF0ID0+ICFleHRVcmkuaXNFcXVhbChjaGF0LnJlc291cmNlLCBtYWluUmVzb3VyY2UpKTtcblx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgY2hhdHNUb0Nsb3NlKSB7XG5cdFx0XHRpZiAoY2hhdC5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVDaGF0KHNlc3Npb24sIGNoYXQucmVzb3VyY2UsIHsgc2tpcENvbmZpcm1hdGlvbjogdHJ1ZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5jbG9zZUNoYXQoc2Vzc2lvbiwgY2hhdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIERlbGV0ZUNoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLmRlbGV0ZUNoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGVsZXRlQWN0aXZlQ2hhdCcsIFwiRGVsZXRlIENoYXRcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogQ0hBVF9UQUJfS0VZQklORElOR19XRUlHSFQsXG5cdFx0XHRcdC8vIERlbGV0ZSAvIENtZCtCYWNrc3BhY2UgKE1hYykgXHUyMDE0IG1pcnJvcnMgdGhlIGZpbGUtZGVsZXRlIGtleWJpbmRpbmdcblx0XHRcdFx0Ly8gaW4gdGhlIEV4cGxvcmVyLiBTY29wZWQgc28gaXQgbmV2ZXIgZmlyZXMgd2hpbGUgdHlwaW5nIGluIGFuIGlucHV0XG5cdFx0XHRcdC8vIChjaGF0IGNvbXBvc2VyLCByZW5hbWUgZmllbGQsIGV0Yy4pIG9yIG9uIHRoZSBzZXNzaW9uJ3MgbWFpbiBjaGF0LlxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksIElucHV0Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25BY3RpdmVDaGF0SXNEZWxldGFibGVDb250ZXh0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc3BhY2UsXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5EZWxldGVdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXQgPSBzZXNzaW9uLmFjdGl2ZUNoYXQuZ2V0KCk7XG5cdFx0Ly8gVGhlIG1haW4gY2hhdCBhbmQgd29ya2VyIChzdWJhZ2VudCkgY2hhdHMgcmVwb3J0IGBjYW5EZWxldGU6IGZhbHNlYC5cblx0XHRpZiAoIWNoYXQgfHwgIWdldENoYXRDYXBhYmlsaXRpZXMoY2hhdCwgc2Vzc2lvbiwgdW5kZWZpbmVkKS5jYW5EZWxldGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVDaGF0KHNlc3Npb24sIGNoYXQucmVzb3VyY2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlb3Blbkxhc3RDbG9zZWRDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2hhdENvbXBvc2l0ZUJhci5yZW9wZW5MYXN0Q2xvc2VkQ2hhdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Q29tcG9zaXRlQmFyLnJlb3Blbkxhc3RDbG9zZWRDaGF0JywgXCJSZW9wZW4gTGFzdCBDbG9zZWQgQ2hhdFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHByZWNvbmRpdGlvbjogU2Vzc2lvblN1cHBvcnRzTXVsdGlwbGVDaGF0c0NvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogQ0hBVF9UQUJfS0VZQklORElOR19XRUlHSFQsXG5cdFx0XHRcdC8vIExpa2UgQ21kL0N0cmwrU2hpZnQrVCBpbiBhIGJyb3dzZXIgXHUyMDE0IHJlb3BlbnMgdGhlIG1vc3QgcmVjZW50bHlcblx0XHRcdFx0Ly8gY2xvc2VkIGNoYXQgdGFiLiBTY29wZWQgdG8gdGhlIGFnZW50cyB3aW5kb3csIG91dHNpZGUgZWRpdG9yIGFyZWEuXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNlc3Npb25TdXBwb3J0c011bHRpcGxlQ2hhdHNDb250ZXh0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdENsb3NlZCA9IHNlc3Npb24ubGFzdENsb3NlZENoYXQ7XG5cdFx0aWYgKCFsYXN0Q2xvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCBsYXN0Q2xvc2VkLnJlc291cmNlKTtcblx0XHRzZXNzaW9uc1BhcnRTZXJ2aWNlLmZvY3VzU2Vzc2lvbihzZXNzaW9uKTtcblx0fVxufSk7XG5cbi8vIEEgbm8taW5wdXQgcXVpY2sgcGljayAocHVyZSBzd2l0Y2hlcikgb3ZlciB0aGUgYWN0aXZlIHNlc3Npb24ncyBvcGVuIGNoYXRzLFxuLy8gZWFjaCBzaG93biB3aXRoIGEgY2hhdCBpY29uLiBEcml2ZW4gYnkgQ3RybCtUYWIgLyBDdHJsK1NoaWZ0K1RhYiBpblxuLy8gZWRpdG9yLXN3aXRjaGVyIChNUlUpIHN0eWxlOiBvcGVucyB3aXRoIHF1aWNrIG5hdmlnYXRlIGFjdGl2ZSwgc28gaG9sZGluZyB0aGVcbi8vIG1vZGlmaWVyIGFuZCBwcmVzc2luZyBUYWIgY3ljbGVzIGFuZCByZWxlYXNpbmcgYWNjZXB0cyB0aGUgZm9jdXNlZCBjaGF0LiBUaGVzZVxuLy8gYXJlIGdhdGVkIHRvIHNlc3Npb25zIHdpdGggbW9yZSB0aGFuIG9uZSBvcGVuIGNoYXQgYXQgYSBoaWdoZXIgd2VpZ2h0IHRoYW4gdGhlXG4vLyBzZXNzaW9uLWhpc3Rvcnkgc2Vjb25kYXJ5IG9uIHRoZSBzYW1lIGNob3JkLCBzbyB0aGV5IGZhbGwgYmFjayB0byBzZXNzaW9uXG4vLyBuYXZpZ2F0aW9uIG90aGVyd2lzZS4gVGhlIHNhbWUgcGlja2VyIGlzIGFsc28gcmVhY2hhYmxlIGZyb20gdGhlIHBhbGV0dGUgKFwiR29cbi8vIHRvIENoYXQgaW4gU2Vzc2lvblwiKSwgd2hpY2ggYWRkaXRpb25hbGx5IGxpc3RzIGNsb3NlZCBjaGF0cyBhbmQgc2tpcHMgZHJhZnRzLlxuXG5leHBvcnQgY29uc3QgU0hPV19DSEFUU19QSUNLRVJfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5zaG93Q2hhdHNQaWNrZXInO1xuY29uc3QgUVVJQ0tfU1dJVENIX05FWFRfQ0hBVF9JRCA9ICdzZXNzaW9ucy5xdWlja1N3aXRjaE5leHRDaGF0JztcbmNvbnN0IFFVSUNLX1NXSVRDSF9QUkVWSU9VU19DSEFUX0lEID0gJ3Nlc3Npb25zLnF1aWNrU3dpdGNoUHJldmlvdXNDaGF0JztcbmNvbnN0IENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9ORVhUX0lEID0gJ3Nlc3Npb25zLmNoYXRzUGlja2VyLnF1aWNrTmF2aWdhdGVOZXh0JztcbmNvbnN0IENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9QUkVWSU9VU19JRCA9ICdzZXNzaW9ucy5jaGF0c1BpY2tlci5xdWlja05hdmlnYXRlUHJldmlvdXMnO1xuXG4vLyBUaGUgb3BlbiBjaG9yZHMgYXJlIGdhdGVkIHRvIG5vdCBmaXJlIHdoaWxlIGFub3RoZXIgcXVpY2sgcGljayBpcyBhbHJlYWR5XG4vLyBzaG93aW5nIChpblF1aWNrUGlja0NvbnRleHQgbmVnYXRlZCksIHNvIGUuZy4gdGhlIGVkaXRvcidzIG93biBDdHJsK1RhYiBwaWNrZXJcbi8vIGtlZXBzIHRoZSBjaG9yZCBmb3IgaXRzIG93biBuYXZpZ2F0aW9uIGluc3RlYWQgb2YgdGhpcyBvcGVuaW5nIG9uIHRvcCBvZiBpdC5cbi8vIFRoZSBDdHJsK1RhYiBNUlUgc3dpdGNoZXIgY3ljbGVzIG9wZW4gY2hhdHMgb25seSwgc28gaXQgaXMgZ2F0ZWQgb24gbW9yZSB0aGFuXG4vLyBvbmUgb3BlbiB0YWIuIChUaGUgcGFsZXR0ZSBjb21tYW5kLCB3aGljaCBhbHNvIGxpc3RzIGNsb3NlZCBjaGF0cywgaXMgZ2F0ZWQgb25cbi8vIG1vcmUgdGhhbiBvbmUgY29tbWl0dGVkIGNoYXQgaW5zdGVhZC4pXG5jb25zdCBDaGF0c1BpY2tlclNjb3BlQ29udGV4dCA9IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbkhhc011bHRpcGxlT3BlbkNoYXRzQ29udGV4dCwgaW5RdWlja1BpY2tDb250ZXh0Lm5lZ2F0ZSgpKTtcblxuZnVuY3Rpb24gb3BlbkNoYXRzUGlja2VyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtcnU/OiB7IHJlYWRvbmx5IGJhY2t3YXJkOiBib29sZWFuIH0pOiB2b2lkIHtcblx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblxuXHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdGlmICghc2Vzc2lvbikge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBleHRVcmkgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSkuZXh0VXJpO1xuXG5cdGludGVyZmFjZSBJQ2hhdFBpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdHJlYWRvbmx5IGNoYXQ6IElDaGF0O1xuXHR9XG5cblx0Y29uc3QgdG9JdGVtID0gKGNoYXQ6IElDaGF0KTogSUNoYXRQaWNrSXRlbSA9PiAoe1xuXHRcdGxhYmVsOiBjaGF0LnRpdGxlLmdldCgpPy50cmltKCkgfHwgbG9jYWxpemUoJ3VudGl0bGVkQ2hhdCcsIFwiVW50aXRsZWQgQ2hhdFwiKSxcblx0XHRkZXNjcmlwdGlvbjogZnJvbU5vdyhjaGF0LnVwZGF0ZWRBdC5nZXQoKSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbiksXG5cdFx0Y2hhdCxcblx0fSk7XG5cblx0Ly8gTVJVIG1vZGUgY3ljbGVzIGV2ZXJ5IG9wZW4gdGFiIChpbmNsdWRpbmcgaW4tY29tcG9zZXIgZHJhZnRzKSBzbyB0aGUgc2V0IG9mXG5cdC8vIHN3aXRjaGFibGUgY2hhdHMgbWF0Y2hlcyB0aGUgU2Vzc2lvbkhhc011bHRpcGxlT3BlbkNoYXRzQ29udGV4dCBnYXRlLiBUaGVcblx0Ly8gc2VhcmNoYWJsZSBwYWxldHRlIGZsb3cgaW5zdGVhZCBza2lwcyB1bnRpdGxlZCBkcmFmdHMgKG5vIG1lYW5pbmdmdWwgdGl0bGUsXG5cdC8vIG1pcnJvcmluZyB0aGUgQ29udmVyc2F0aW9ucyBzdWJtZW51KSBhbmQgYWRkcyB0aGUgY2xvc2VkIGNoYXRzIGJlbG93LlxuXHRjb25zdCBvcGVuSXRlbXMgPSAobXJ1XG5cdFx0PyBzZXNzaW9uLnZpc2libGVDaGF0VGFicy5nZXQoKVxuXHRcdDogc2Vzc2lvbi52aXNpYmxlQ2hhdFRhYnMuZ2V0KCkuZmlsdGVyKGNoYXQgPT4gY2hhdC5zdGF0dXMuZ2V0KCkgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpXG5cdCkubWFwKHRvSXRlbSk7XG5cdC8vIENsb3NlZCBjaGF0cyBhcmUgaGlkZGVuIGZyb20gdGhlIHRhYiBzdHJpcCBidXQgc3RpbGwgcmVvcGVuYWJsZS4gVGhleSBhcmVcblx0Ly8gb25seSBvZmZlcmVkIGluIHRoZSBzZWFyY2hhYmxlIHBhbGV0dGUgZmxvdyBcdTIwMTQgbm90IHRoZSBDdHJsK1RhYiBNUlUgc3dpdGNoZXIsXG5cdC8vIHdoaWNoIG1pcnJvcnMgdGhlIGVkaXRvciBzd2l0Y2hlciBhbmQgY3ljbGVzIG9wZW4gaXRlbXMgb25seS5cblx0Y29uc3QgY2xvc2VkSXRlbXMgPSBtcnUgPyBbXSA6IHNlc3Npb24uY2xvc2VkQ2hhdHMuZ2V0KClcblx0XHQuZmlsdGVyKGNoYXQgPT4gY2hhdC5zdGF0dXMuZ2V0KCkgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgJiYgY2hhdC5vcmlnaW4/LmtpbmQgIT09IENoYXRPcmlnaW5LaW5kLlRvb2wpXG5cdFx0Lm1hcCh0b0l0ZW0pO1xuXG5cdC8vIE5hdmlnYXRpb24gb3JkZXI6IG9wZW4gY2hhdHMgZmlyc3QsIHRoZW4gY2xvc2VkIGNoYXRzLlxuXHRjb25zdCBwaWNrSXRlbXMgPSBbLi4ub3Blbkl0ZW1zLCAuLi5jbG9zZWRJdGVtc107XG5cdGlmIChwaWNrSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgZGlzcGxheUl0ZW1zOiAoSUNoYXRQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBjbG9zZWRJdGVtcy5sZW5ndGggPT09IDBcblx0XHQ/IG9wZW5JdGVtc1xuXHRcdDogW1xuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdvcGVuQ2hhdHNHcm91cCcsIFwiT3BlblwiKSB9LFxuXHRcdFx0Li4ub3Blbkl0ZW1zLFxuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdjbG9zZWRDaGF0c0dyb3VwJywgXCJDbG9zZWRcIikgfSxcblx0XHRcdC4uLmNsb3NlZEl0ZW1zLFxuXHRcdF07XG5cblx0Y29uc3QgYWN0aXZlQ2hhdCA9IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKTtcblx0Y29uc3QgYWN0aXZlSW5kZXggPSBNYXRoLm1heCgwLCBhY3RpdmVDaGF0ID8gcGlja0l0ZW1zLmZpbmRJbmRleChpdGVtID0+IGV4dFVyaS5pc0VxdWFsKGl0ZW0uY2hhdC5yZXNvdXJjZSwgYWN0aXZlQ2hhdC5yZXNvdXJjZSkpIDogLTEpO1xuXHQvLyBNUlUgc3R5bGUgc3RhcnRzIG9uIHRoZSBhZGphY2VudCBjaGF0IHNvIGEgc2luZ2xlIHRhcCtyZWxlYXNlIHN3aXRjaGVzIHRvXG5cdC8vIGl0OyBwYWxldHRlIGludm9jYXRpb24gKG5vbi1NUlUpIGZvY3VzZXMgdGhlIGFjdGl2ZSBjaGF0LlxuXHRjb25zdCBzdGFydEluZGV4ID0gbXJ1ID8gKGFjdGl2ZUluZGV4ICsgKG1ydS5iYWNrd2FyZCA/IC0xIDogMSkgKyBwaWNrSXRlbXMubGVuZ3RoKSAlIHBpY2tJdGVtcy5sZW5ndGggOiBhY3RpdmVJbmRleDtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgcGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJQ2hhdFBpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRwaWNrZXIuaXRlbXMgPSBkaXNwbGF5SXRlbXM7XG5cdHBpY2tlci5hY3RpdmVJdGVtcyA9IFtwaWNrSXRlbXNbc3RhcnRJbmRleF1dO1xuXHRpZiAobXJ1KSB7XG5cdFx0Ly8gRWRpdG9yLXN3aXRjaGVyIHN0eWxlOiBubyBmaWx0ZXIgaW5wdXQsIGFuZCBxdWljayBuYXZpZ2F0ZSBzdGF5cyBhY3RpdmUgc29cblx0XHQvLyByZWxlYXNpbmcgdGhlIG1vZGlmaWVyIGFjY2VwdHMgdGhlIGZvY3VzZWQgY2hhdC4gVGhlIG1vZGlmaWVyIGlzIHRha2VuXG5cdFx0Ly8gZnJvbSB0aGUgcXVpY2stbmF2aWdhdGUga2V5YmluZGluZydzIGNob3JkLlxuXHRcdHBpY2tlci5oaWRlSW5wdXQgPSB0cnVlO1xuXHRcdHBpY2tlci5xdWlja05hdmlnYXRlID0geyBrZXliaW5kaW5nczoga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZ3MoQ0hBVFNfUElDS0VSX1FVSUNLX05BVklHQVRFX05FWFRfSUQpIH07XG5cdH0gZWxzZSB7XG5cdFx0Ly8gUGFsZXR0ZSBmbG93OiBhIHNlYXJjaGFibGUgbGlzdCBhY3Jvc3MgdGhlIE9wZW4gYW5kIENsb3NlZCBncm91cHMuXG5cdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NlYXJjaENoYXRzJywgXCJTZWFyY2ggY2hhdHMgYnkgbmFtZVwiKTtcblx0XHRwaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0fVxuXG5cdC8vIEV4cG9zZSBhIGNvbnRleHQga2V5IHdoaWxlIHRoZSBwaWNrZXIgaXMgb3BlbiBzbyB0aGUgbmF2aWdhdGUga2V5YmluZGluZ3Ncblx0Ly8gKGJvdW5kIHRvIHRoZSBzYW1lIGNob3JkcykgYWR2YW5jZSB0aGUgc2VsZWN0aW9uIGluc3RlYWQgb2YgcmUtb3BlbmluZy5cblx0Y29uc3QgcGlja2VyVmlzaWJsZUNvbnRleHQgPSBTZXNzaW9uQ2hhdHNQaWNrZXJWaXNpYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRwaWNrZXJWaXNpYmxlQ29udGV4dC5zZXQodHJ1ZSk7XG5cdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGlja2VyVmlzaWJsZUNvbnRleHQucmVzZXQoKSkpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdGNvbnN0IFtzZWxlY3RlZF0gPSBwaWNrZXIuc2VsZWN0ZWRJdGVtcztcblx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdHNlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCBzZWxlY3RlZC5jaGF0LnJlc291cmNlKTtcblx0XHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0XHRwaWNrZXIuaGlkZSgpO1xuXHR9KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXG5cdHBpY2tlci5zaG93KCk7XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93Q2hhdHNQaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNIT1dfQ0hBVFNfUElDS0VSX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93Q2hhdHNQaWNrZXInLCBcIkdvIHRvIENoYXQgaW4gU2Vzc2lvblwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHByZWNvbmRpdGlvbjogU2Vzc2lvbkhhc011bHRpcGxlQ29tbWl0dGVkQ2hhdHNDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksIGluUXVpY2tQaWNrQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlPLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRvcGVuQ2hhdHNQaWNrZXIoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuLy8gQ3RybCtUYWIgLyBDdHJsK1NoaWZ0K1RhYiBvcGVuIHRoZSBwaWNrZXIgaW4gZWRpdG9yLXN3aXRjaGVyIChNUlUpIG1vZGUuIEhpZGRlblxuLy8gZnJvbSB0aGUgcGFsZXR0ZSAoZjE6IGZhbHNlKSBzaW5jZSB0aGV5IG9ubHkgbWFrZSBzZW5zZSBoZWxkOyB0aGUgY2hvcmQgd2luc1xuLy8gb3ZlciB0aGUgc2Vzc2lvbi1oaXN0b3J5IHNlY29uZGFyeSB2aWEgdGhlIGhpZ2hlciB3ZWlnaHQgd2hpbGUgbXVsdGktY2hhdC5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBRdWlja1N3aXRjaE5leHRDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBRVUlDS19TV0lUQ0hfTkVYVF9DSEFUX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncXVpY2tTd2l0Y2hOZXh0Q2hhdCcsIFwiUXVpY2sgU3dpdGNoIHRvIE5leHQgQ2hhdFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRwcmVjb25kaXRpb246IFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0c1BpY2tlclNjb3BlQ29udGV4dCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlRhYixcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5UYWIgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0b3BlbkNoYXRzUGlja2VyKGFjY2Vzc29yLCB7IGJhY2t3YXJkOiBmYWxzZSB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBRdWlja1N3aXRjaFByZXZpb3VzQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUVVJQ0tfU1dJVENIX1BSRVZJT1VTX0NIQVRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdxdWlja1N3aXRjaFByZXZpb3VzQ2hhdCcsIFwiUXVpY2sgU3dpdGNoIHRvIFByZXZpb3VzIENoYXRcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZXNzaW9uSGFzTXVsdGlwbGVPcGVuQ2hhdHNDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgMSxcblx0XHRcdFx0d2hlbjogQ2hhdHNQaWNrZXJTY29wZUNvbnRleHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdG9wZW5DaGF0c1BpY2tlcihhY2Nlc3NvciwgeyBiYWNrd2FyZDogdHJ1ZSB9KTtcblx0fVxufSk7XG5cbi8vIFdoaWxlIHRoZSBwaWNrZXIgaXMgb3BlbiwgQ3RybCtUYWIgLyBDdHJsK1NoaWZ0K1RhYiBjeWNsZSBmb3J3YXJkIC8gYmFja3dhcmQuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9ORVhUX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgNTAsXG5cdGhhbmRsZXI6IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyKENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9ORVhUX0lELCB0cnVlKSxcblx0d2hlbjogU2Vzc2lvbkNoYXRzUGlja2VyVmlzaWJsZUNvbnRleHQsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5UYWIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuVGFiIH0sXG59KTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ0hBVFNfUElDS0VSX1FVSUNLX05BVklHQVRFX1BSRVZJT1VTX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgNTAsXG5cdGhhbmRsZXI6IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyKENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9QUkVWSU9VU19JRCwgZmFsc2UpLFxuXHR3aGVuOiBTZXNzaW9uQ2hhdHNQaWNrZXJWaXNpYmxlQ29udGV4dCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYixcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIgfSxcbn0pO1xuXG4vKipcbiAqIEJhc2UgY2xhc3MgZm9yIHRoZSBjb21wYWN0IHBpbGwgYnV0dG9uIHJlbmRlcmVkIGluIHRoZSBzZXNzaW9ucyBVSSAoZS5nLiB0aGUgXCJOZXdcIiBzZXNzaW9uL2NoYXRcbiAqIGJ1dHRvbnMsIHRoZSBlbXB0eSBmaWxlIGVkaXRvcidzIFwiU2VhcmNoIEZpbGVzXCIgYnV0dG9uKS4gU3ViY2xhc3NlcyBwcm92aWRlIHRoZSBjb21tYW5kIGlkLFxuICogbGFiZWwgYW5kIGhvdmVyL2FyaWEgdGV4dC5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvbXBhY3RCdXR0b25BY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24pO1xuXHR9XG5cblx0LyoqIENvbW1hbmQgaWQgdXNlZCB0byBsb29rIHVwIHRoZSB0cmFpbGluZyBrZXliaW5kaW5nIGhpbnQuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXQgY29tbWFuZElkKCk6IHN0cmluZztcblxuXHQvKiogVmlzaWJsZSBwaWxsIGxhYmVsIChlLmcuIFwiTmV3XCIsIFwiTmV3IENoYXRcIikuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXQgbGFiZWwoKTogc3RyaW5nO1xuXG5cdC8qKiBIb3ZlciB0ZXh0OyByZWNlaXZlcyB0aGUgcmVzb2x2ZWQga2V5YmluZGluZyBsYWJlbCwgaWYgYW55LiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0SG92ZXJDb250ZW50KGtleWJpbmRpbmdMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nO1xuXG5cdC8qKiBBY2Nlc3NpYmxlIG5hbWU7IHJlY2VpdmVzIHRoZSByZXNvbHZlZCBrZXliaW5kaW5nIGFyaWEgbGFiZWwsIGlmIGFueS4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEFyaWFMYWJlbChrZXliaW5kaW5nQXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmc7XG5cblx0LyoqIE9wdGlvbmFsIG9uYm9hcmRpbmcgc3BvdGxpZ2h0IHRhcmdldCBpZCBmb3IgdGhlIHBpbGwuICovXG5cdHByb3RlY3RlZCBnZXQgb25ib2FyZGluZ1RhcmdldElkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIHRvIHJlbmRlciB0aGUgdHJhaWxpbmcga2V5YmluZGluZyBoaW50IGNoaXAgaW4gdGhlIGxhYmVsLiAqL1xuXHRwcm90ZWN0ZWQgZ2V0IHNob3dLZXliaW5kaW5nSGludCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKiBIb29rIGludm9rZWQgcmlnaHQgYmVmb3JlIHRoZSBhY3Rpb24gcnVucyAoZS5nLiBmb3IgdGVsZW1ldHJ5KS4gKi9cblx0cHJvdGVjdGVkIG9uUnVuKCk6IHZvaWQgeyB9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGFnZW50c05ld1Nlc3Npb25CdXR0b25CYWNrZ3JvdW5kKSxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IGFzQ3NzVmFyaWFibGUoYWdlbnRzTmV3U2Vzc2lvbkJ1dHRvbkZvcmVncm91bmQpLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGFnZW50c05ld1Nlc3Npb25CdXR0b25Ib3ZlckJhY2tncm91bmQpLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Qm9yZGVyOiBhc0Nzc1ZhcmlhYmxlKGFnZW50c05ld1Nlc3Npb25CdXR0b25Cb3JkZXIpLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9ucy1jb21wYWN0LW5ldy1idXR0b24nKTtcblx0XHRjb25zdCBvbmJvYXJkaW5nVGFyZ2V0SWQgPSB0aGlzLm9uYm9hcmRpbmdUYXJnZXRJZDtcblx0XHRpZiAob25ib2FyZGluZ1RhcmdldElkKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihtYXJrT25ib2FyZGluZ1RhcmdldChidXR0b24uZWxlbWVudCwgb25ib2FyZGluZ1RhcmdldElkKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0Ly8gU3RvcCBwcm9wYWdhdGlvbiBzbyB0aGUgcGFyZW50IDxsaT4gY2xpY2sgaGFuZGxlciBkb2Vzbid0IHJ1biB0aGUgYWN0aW9uIHR3aWNlLlxuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdGlmICghdGhpcy5hY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm9uUnVuKCk7XG5cdFx0XHR0aGlzLmFjdGlvblJ1bm5lci5ydW4odGhpcy5hY3Rpb24sIHRoaXMuX2NvbnRleHQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGJ1dHRvbkxhYmVsID0gJCgnc3Bhbi5uZXctc2Vzc2lvbi1idXR0b24tbGFiZWwnLCB1bmRlZmluZWQsIHRoaXMubGFiZWwpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdIaW50ID0gJCgnc3Bhbi5uZXctc2Vzc2lvbi1rZXliaW5kaW5nLWhpbnQnKTtcblx0XHRjb25zdCBrZXliaW5kaW5nSGludExhYmVsID0gdGhpcy5zaG93S2V5YmluZGluZ0hpbnRcblx0XHRcdD8gdGhpcy5fcmVnaXN0ZXIobmV3IEtleWJpbmRpbmdMYWJlbChrZXliaW5kaW5nSGludCwgT1MsIHtcblx0XHRcdFx0ZGlzYWJsZVRpdGxlOiB0cnVlLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWxCYWNrZ3JvdW5kOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWxGb3JlZ3JvdW5kOiAnaW5oZXJpdCcsXG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbEJvcmRlcjogJ3RyYW5zcGFyZW50Jyxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsQm90dG9tQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbFNoYWRvdzogdW5kZWZpbmVkLFxuXHRcdFx0fSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXNldChidXR0b24uZWxlbWVudCwgYnV0dG9uTGFiZWwpO1xuXG5cdFx0Y29uc3QgZ2V0S2V5YmluZGluZyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHByaW1hcnlLZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHRoaXMuY29tbWFuZElkLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0cnVlKTtcblx0XHRcdGNvbnN0IHJlc29sdmVkS2V5YmluZGluZ3MgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmdzKHRoaXMuY29tbWFuZElkKTtcblx0XHRcdHJldHVybiBwcmltYXJ5S2V5YmluZGluZyA/PyByZXNvbHZlZEtleWJpbmRpbmdzWzBdO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihidXR0b24uZWxlbWVudCwgKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6IHRoaXMuZ2V0SG92ZXJDb250ZW50KGdldEtleWJpbmRpbmcoKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQpLFxuXHRcdFx0YXBwZWFyYW5jZTogeyBjb21wYWN0OiB0cnVlIH0sXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0fSkpKTtcblxuXHRcdGxldCBsYXN0UmVuZGVyZWRLZXliaW5kaW5nTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBsYXN0UmVuZGVyZWRLZXliaW5kaW5nQXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCB1cGRhdGVCdXR0b24gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nID0gZ2V0S2V5YmluZGluZygpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0ga2V5YmluZGluZz8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nQXJpYUxhYmVsID0ga2V5YmluZGluZz8uZ2V0QXJpYUxhYmVsKCkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGxhc3RSZW5kZXJlZEtleWJpbmRpbmdMYWJlbCA9PT0ga2V5YmluZGluZ0xhYmVsICYmIGxhc3RSZW5kZXJlZEtleWJpbmRpbmdBcmlhTGFiZWwgPT09IGtleWJpbmRpbmdBcmlhTGFiZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsYXN0UmVuZGVyZWRLZXliaW5kaW5nTGFiZWwgPSBrZXliaW5kaW5nTGFiZWw7XG5cdFx0XHRsYXN0UmVuZGVyZWRLZXliaW5kaW5nQXJpYUxhYmVsID0ga2V5YmluZGluZ0FyaWFMYWJlbDtcblxuXHRcdFx0a2V5YmluZGluZ0hpbnRMYWJlbD8uc2V0KGtleWJpbmRpbmcpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmdIaW50TGFiZWwgJiYga2V5YmluZGluZykge1xuXHRcdFx0XHRpZiAoa2V5YmluZGluZ0hpbnQucGFyZW50RWxlbWVudCAhPT0gYnV0dG9uLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRhcHBlbmQoYnV0dG9uLmVsZW1lbnQsIGtleWJpbmRpbmdIaW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0a2V5YmluZGluZ0hpbnQucmVtb3ZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuZ2V0QXJpYUxhYmVsKGtleWJpbmRpbmdBcmlhTGFiZWwpKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MsIHVwZGF0ZUJ1dHRvbikpO1xuXHR9XG59XG5cbi8qKlxuICogUmVuZGVycyB0aGUgbmV3LXNlc3Npb24gYWN0aW9uIGFzIHRoZSBjb21wYWN0IFwiTmV3XCIgcGlsbCwgc2hhcmVkIGJ5IHRoZSBzZXNzaW9ucyBzaWRlYmFyXG4gKiBoZWFkZXIgYW5kIHRoZSB0aXRsZWJhci5cbiAqL1xuY2xhc3MgTmV3U2Vzc2lvbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQ29tcGFjdEJ1dHRvbkFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTb3VyY2U6IFNlc3Npb25zSW50ZXJhY3Rpb25Tb3VyY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGFjdGlvbiwga2V5YmluZGluZ1NlcnZpY2UsIGhvdmVyU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBjb21tYW5kSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gTkVXX1NFU1NJT05fQUNUSU9OX0lEO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbmV3Q29tcGFjdCcsIFwiTmV3XCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBvbmJvYXJkaW5nVGFyZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ3Nlc3Npb25zLm5ld1Nlc3Npb24uYnV0dG9uJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRIb3ZlckNvbnRlbnQoa2V5YmluZGluZ0xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBrZXliaW5kaW5nTGFiZWxcblx0XHRcdD8gbG9jYWxpemUoJ25ld1Nlc3Npb25CdXR0b25UaXRsZScsIFwiTmV3IFNlc3Npb24gKHswfSlcIiwga2V5YmluZGluZ0xhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbmV3U2Vzc2lvbkJ1dHRvblRpdGxlV2l0aG91dEtleWJpbmRpbmcnLCBcIk5ldyBTZXNzaW9uXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEFyaWFMYWJlbChrZXliaW5kaW5nQXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBrZXliaW5kaW5nQXJpYUxhYmVsXG5cdFx0XHQ/IGxvY2FsaXplKCduZXdTZXNzaW9uQnV0dG9uQXJpYUxhYmVsJywgXCJOZXcgU2Vzc2lvbiAoezB9KVwiLCBrZXliaW5kaW5nQXJpYUxhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbmV3U2Vzc2lvbkJ1dHRvbkFyaWFMYWJlbFdpdGhvdXRLZXliaW5kaW5nJywgXCJOZXcgU2Vzc2lvblwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvblJ1bigpOiB2b2lkIHtcblx0XHRsb2dTZXNzaW9uc0ludGVyYWN0aW9uKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgJ25ld1Nlc3Npb24nLCB0aGlzLnRlbGVtZXRyeVNvdXJjZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZWdpc3RlcnMge0BsaW5rIE5ld1Nlc3Npb25BY3Rpb25WaWV3SXRlbX0gaW4gdGhlIHNlc3Npb25zIHNpZGViYXIgaGVhZGVyIGFuZCB0aGUgdGl0bGViYXIuXG4gKiBUaGUgdGl0bGViYXIgZW50cnkgaXMgZ2F0ZWQgYmVoaW5kIGFuIEEvQiBleHBlcmltZW50IHZpYSB7QGxpbmsgU2Vzc2lvbnNUaXRsZUJhck5ld1Nlc3Npb25FbmFibGVkQ29udGV4dH0uXG4gKi9cbmV4cG9ydCBjbGFzcyBOZXdTZXNzaW9uQWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLm5ld1Nlc3Npb25BY3Rpb25WaWV3SXRlbSc7XG5cblx0LyoqIEV4UCB0cmVhdG1lbnQgdGhhdCBzaG93cyB0aGUgbmV3LXNlc3Npb24gYnV0dG9uIGluIHRoZSB0aXRsZWJhci4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTkVXX1NFU1NJT05fVElUTEVCQVJfVFJFQVRNRU5UID0gJ2FnZW50U2Vzc2lvbnNUaXRsZUJhck5ld1Nlc3Npb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGl0bGVCYXJFbmFibGVkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudGl0bGVCYXJFbmFibGVkQ29udGV4dCA9IFNlc3Npb25zVGl0bGVCYXJOZXdTZXNzaW9uRW5hYmxlZENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG9uRGlkUmVnaXN0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBtZW51czogTWVudUlkW10gPSBbTWVudXMuU2lkZWJhclNlc3Npb25zSGVhZGVyLCBNZW51cy5UaXRsZUJhckxlZnRMYXlvdXRdO1xuXHRcdGZvciAoY29uc3QgbWVudSBvZiBtZW51cykge1xuXHRcdFx0Y29uc3Qgc291cmNlOiBTZXNzaW9uc0ludGVyYWN0aW9uU291cmNlID0gbWVudSA9PT0gTWVudXMuVGl0bGVCYXJMZWZ0TGF5b3V0ID8gJ3RpdGxlQmFyJyA6ICdzaWRlYmFyJztcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihtZW51LCBORVdfU0VTU0lPTl9BQ1RJT05fSUQsIChhY3Rpb24sIF9vcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdTZXNzaW9uQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgc291cmNlKTtcblx0XHRcdH0sIG9uRGlkUmVnaXN0ZXIuZXZlbnQpKTtcblx0XHR9XG5cdFx0b25EaWRSZWdpc3Rlci5maXJlKCk7XG5cblx0XHQvLyBSZXNvbHZlIHRoZSB0aXRsZWJhciBleHBlcmltZW50IG5vdyBhbmQgb24gcmVmZXRjaC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFzc2lnbm1lbnRTZXJ2aWNlLm9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzKCgpID0+IHRoaXMudXBkYXRlVGl0bGVCYXJUcmVhdG1lbnQoKSkpO1xuXHRcdHRoaXMudXBkYXRlVGl0bGVCYXJUcmVhdG1lbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlVGl0bGVCYXJUcmVhdG1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQWx3YXlzIHNob3cgaW4gZGV2IGJ1aWxkcyAocnVubmluZyBmcm9tIHNvdXJjZXMpIHRvIGVhc2UgZGV2ZWxvcG1lbnQsIHJlZ2FyZGxlc3Mgb2YgdGhlIGV4cGVyaW1lbnQuXG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHR0aGlzLnRpdGxlQmFyRW5hYmxlZENvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVkID0gYXdhaXQgdGhpcy5hc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8Ym9vbGVhbj4oTmV3U2Vzc2lvbkFjdGlvblZpZXdJdGVtQ29udHJpYnV0aW9uLk5FV19TRVNTSU9OX1RJVExFQkFSX1RSRUFUTUVOVCk7XG5cdFx0dGhpcy50aXRsZUJhckVuYWJsZWRDb250ZXh0LnNldChlbmFibGVkID09PSB0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIFwiTmV3IENoYXRcIiBhY3Rpb24gaW4gdGhlIHNlc3Npb24gaGVhZGVyIGFzIHRoZSBjb21wYWN0IHBpbGwsIG1hdGNoaW5nIHRoZVxuICogXCJOZXdcIiBzZXNzaW9uIHBpbGwgaW4gdGhlIHNlc3Npb25zIGxpc3QgaGVhZGVyIC8gdGl0bGViYXIuXG4gKi9cbmNsYXNzIE5ld0NoYXRBY3Rpb25WaWV3SXRlbSBleHRlbmRzIENvbXBhY3RCdXR0b25BY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBjb21tYW5kSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQUREX0NIQVRfVE9fU0VTU0lPTl9BQ1RJT05fSUQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0Q29tcG9zaXRlQmFyLmFkZENoYXQuY29tcGFjdCcsIFwiTmV3IENoYXRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IHNob3dLZXliaW5kaW5nSGludCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SG92ZXJDb250ZW50KGtleWJpbmRpbmdMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRyZXR1cm4ga2V5YmluZGluZ0xhYmVsXG5cdFx0XHQ/IGxvY2FsaXplKCduZXdDaGF0QnV0dG9uVGl0bGUnLCBcIk5ldyBDaGF0ICh7MH0pXCIsIGtleWJpbmRpbmdMYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ25ld0NoYXRCdXR0b25UaXRsZVdpdGhvdXRLZXliaW5kaW5nJywgXCJOZXcgQ2hhdFwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRBcmlhTGFiZWwoa2V5YmluZGluZ0FyaWFMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRyZXR1cm4ga2V5YmluZGluZ0FyaWFMYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgnbmV3Q2hhdEJ1dHRvbkFyaWFMYWJlbCcsIFwiTmV3IENoYXQgKHswfSlcIiwga2V5YmluZGluZ0FyaWFMYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ25ld0NoYXRCdXR0b25BcmlhTGFiZWxXaXRob3V0S2V5YmluZGluZycsIFwiTmV3IENoYXRcIik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25OZXdDaGF0QWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLm5ld0NoYXRBY3Rpb25WaWV3SXRlbSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gRmlyZSBvbmNlIGFmdGVyIHJlZ2lzdGVyaW5nIHNvIGEgaGVhZGVyIHRvb2xiYXIgdGhhdCB3YXMgYWxyZWFkeSBidWlsdFxuXHRcdC8vIChlLmcuIGZvciBhIHNlc3Npb24gcmVzdG9yZWQgYmVmb3JlIHRoaXMgY29udHJpYnV0aW9uIHJ1bnMpIHJlLXJlbmRlcnMgYW5kXG5cdFx0Ly8gcGlja3MgdXAgdGhpcyBmYWN0b3J5OyBvdGhlcndpc2UgTmV3IENoYXQgc3RheXMgaWNvbi1vbmx5IHVudGlsIGl0cyBtZW51XG5cdFx0Ly8gbmV4dCBjaGFuZ2VzLlxuXHRcdGNvbnN0IG9uRGlkUmVnaXN0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudXMuU2Vzc2lvbkJhclRvb2xiYXIsIEFERF9DSEFUX1RPX1NFU1NJT05fQUNUSU9OX0lELCAoYWN0aW9uLCBfb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRBY3Rpb25WaWV3SXRlbSwgYWN0aW9uKTtcblx0XHR9LCBvbkRpZFJlZ2lzdGVyLmV2ZW50KSk7XG5cdFx0b25EaWRSZWdpc3Rlci5maXJlKCk7XG5cdH1cbn1cblxuLy8gVGhlIFwiQ2hhdHNcIiB0b29sYmFyIGVudHJ5IGlzIGEgc3VibWVudTogaXQgbGlzdHMgZXZlcnkgY2hhdCBpbiB0aGUgc2Vzc2lvblxuLy8gd2l0aCBhIGNoZWNrYm94LiBDaGVja2VkIGNoYXRzIGFyZSBzaG93biBhcyB0YWJzOyB1bmNoZWNrZWQgY2hhdHMgYXJlIGNsb3NlZFxuLy8gKGhpZGRlbiBmcm9tIHRoZSB0YWIgc3RyaXApLiBUb2dnbGluZyBhbiBlbnRyeSBjbG9zZXMgb3IgcmVvcGVucyB0aGVcbi8vIGNvcnJlc3BvbmRpbmcgY2hhdC4gVGhlIG1haW4gY2hhdCBpcyBhbHdheXMgc2hvd24gYW5kIGNhbm5vdCBiZSBjbG9zZWQsIHNvIGl0c1xuLy8gZW50cnkgaXMgY2hlY2tlZCBhbmQgZGlzYWJsZWQuXG4vL1xuLy8gSXQgaXMgYWx3YXlzIHJlbmRlcmVkIGluIHRoZSBzZXNzaW9uIGhlYWRlciBtZXRhIHJvdywgYWZ0ZXIgdGhlIHBpbGxzXG4vLyAod29ya3NwYWNlIGZvbGRlciAvIGNoYW5nZXMgLyBwdWxsIHJlcXVlc3QpIGFzIHRoZSBtZXRhIHRvb2xiYXIncyBkZWZhdWx0XG4vLyBzdWJtZW51IGljb24sIGluZGVwZW5kZW50IG9mIHdoZXRoZXIgdGhlIGNoYXQgdGFiIHN0cmlwIGlzIHNob3duLiBJdCBzdXJmYWNlc1xuLy8gb25jZSB0aGUgc2Vzc2lvbiBoYXMgbW9yZSB0aGFuIG9uZSBjb21taXR0ZWQgY2hhdCwgb3Igd2hlbiB0aGUgYWN0aXZlIGNoYXQgaGFzXG4vLyBzdWJhZ2VudHMgKGEgc2VwYXJhdGUgZ3JvdXAgYXQgdGhlIGJvdHRvbSBsaXN0cyB0aGVtKSBldmVuIGlmIHRoYXQgaXMgdGhlIG9ubHlcbi8vIGNvbW1pdHRlZCBjaGF0LlxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLlNlc3Npb25IZWFkZXJNZXRhLCB7XG5cdHN1Ym1lbnU6IE1lbnVzLlNlc3Npb25Db252ZXJzYXRpb25zLFxuXHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Q29tcG9zaXRlQmFyLmNvbnZlcnNhdGlvbnMnLCBcIkNoYXRzXCIpLFxuXHRpY29uOiBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogMTAwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleUV4cHIuYW5kKFNlc3Npb25TdXBwb3J0c011bHRpcGxlQ2hhdHNDb250ZXh0LCBTZXNzaW9uSGFzTXVsdGlwbGVDb21taXR0ZWRDaGF0c0NvbnRleHQpLCBTZXNzaW9uQWN0aXZlQ2hhdEhhc1N1YmFnZW50c0NvbnRleHQpKSxcbn0pO1xuXG4vKipcbiAqIFBvcHVsYXRlcyB0aGUge0BsaW5rIE1lbnVzLlNlc3Npb25Db252ZXJzYXRpb25zfSBzdWJtZW51IGZvciBldmVyeSB2aXNpYmxlXG4gKiBzZXNzaW9uLiB7QGxpbmsgTWVudXMuU2Vzc2lvbkJhclRvb2xiYXJ9IGlzIHJlbmRlcmVkIG9uY2UgcGVyIHNlc3Npb24gdmlld1xuICogKGhlYWRlci9mbG9hdGluZyB0b29sYmFyKSBhZ2FpbnN0IHRoYXQgdmlldydzIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlLCBzb1xuICogdGhlIHN1Ym1lbnUgaXRlbXMgYXJlIHNjb3BlZCBwZXIgc2Vzc2lvbiB2aWEge0BsaW5rIFNlc3Npb25JZENvbnRleHR9OiBlYWNoXG4gKiBzZXNzaW9uJ3MgcGVyLWNoYXQgdG9nZ2xlIGFjdGlvbnMgb25seSByZW5kZXIgaW4gKGFuZCBhY3Qgb24pIHRoZWlyIG93blxuICogc2Vzc2lvbidzIHRvb2xiYXIuIFRoZSBhY3Rpb25zIGFyZSAocmUpcmVnaXN0ZXJlZCB3aGVuZXZlciB0aGUgc2V0IG9mIHZpc2libGVcbiAqIHNlc3Npb25zIG9yIHRoZWlyIGNoYXQgbGlzdHMgY2hhbmdlLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkNvbnZlcnNhdGlvbnNNZW51Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9ucy5jb252ZXJzYXRpb25zTWVudSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRoaXMuX3JlZ2lzdGVyU2Vzc2lvbkNvbnZlcnNhdGlvbnMoc2Vzc2lvbiwgcmVhZGVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclNlc3Npb25Db252ZXJzYXRpb25zKHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCByZWFkZXI6IElSZWFkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgZXh0VXJpID0gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaTtcblxuXHRcdC8vIFNjb3BlIGV2ZXJ5IGVudHJ5IHRvIHRoaXMgc2Vzc2lvbidzIHRvb2xiYXI6IHRoZSBzdWJtZW51IGlzIHJlbmRlcmVkIG9uY2Vcblx0XHQvLyBwZXIgc2Vzc2lvbiB2aWV3IGFnYWluc3QgaXRzIG93biBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSwgd2hlcmVcblx0XHQvLyBgc2Vzc2lvbklkYCByZXNvbHZlcyB0byB0aGF0IHZpZXcncyBzZXNzaW9uLlxuXHRcdGNvbnN0IHNjb3BlZFRvU2Vzc2lvbiA9IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSWRDb250ZXh0LmtleSwgc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3QgYWxsQ2hhdHMgPSBzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBtYWluUmVzb3VyY2UgPSBzZXNzaW9uLm1haW5DaGF0LnJlYWQocmVhZGVyKS5yZXNvdXJjZTtcblx0XHRjb25zdCB2aXNpYmxlQ2hhdFRhYnMgPSBzZXNzaW9uLnZpc2libGVDaGF0VGFicy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgYWN0aXZlQ2hhdFJlc291cmNlID0gc2Vzc2lvbi5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKS5yZXNvdXJjZTtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyVG9nZ2xlID0gKGNoYXQ6IElDaGF0LCBncm91cDogc3RyaW5nLCBvcmRlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSBjaGF0LnJlc291cmNlO1xuXHRcdFx0Ly8gV2hldGhlciB0aGUgY2hhdCBpcyBjdXJyZW50bHkgc2hvd24gYXMgYSB0YWIuIEZvciByZWd1bGFyIGNoYXRzIHRoaXNcblx0XHRcdC8vIG1pcnJvcnMgYG9wZW5DaGF0c2A7IGZvciBzdWJhZ2VudHMgaXQgcmVmbGVjdHMgdGhlIHNob3duLXN1YmFnZW50IHNldCxcblx0XHRcdC8vIHdoaWNoIGlzIHdoYXQgb3Blbi9jbG9zZSB0b2dnbGVzLlxuXHRcdFx0Y29uc3QgaXNTaG93biA9IHZpc2libGVDaGF0VGFicy5zb21lKGMgPT4gZXh0VXJpLmlzRXF1YWwoYy5yZXNvdXJjZSwgY2hhdFJlc291cmNlKSk7XG5cdFx0XHRjb25zdCBpc01haW4gPSBleHRVcmkuaXNFcXVhbChjaGF0UmVzb3VyY2UsIG1haW5SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGNoYXQudGl0bGUucmVhZChyZWFkZXIpIHx8IGxvY2FsaXplKCd1bnRpdGxlZENoYXQnLCBcIlVudGl0bGVkIENoYXRcIik7XG5cdFx0XHQvLyBBY3Rpb24gSURzIGFyZSBnbG9iYWwsIHNvIHNjb3BlIHRoZW0gdG8gdGhlIHNlc3Npb24gYW5kIGEgaGFzaCBvZiB0aGVcblx0XHRcdC8vIGNoYXQgcmVzb3VyY2UgKHdoaWNoIGlzIHN0YWJsZSBwZXIgY2hhdCkgcmF0aGVyIHRoYW4gZW1iZWRkaW5nIHRoZSByYXdcblx0XHRcdC8vIFVSSSwgd2hpY2ggaXMgbG9uZyBhbmQgY2FuIGNvbnRhaW4gYDpgLCBgL2AsIGAjYC5cblx0XHRcdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGBzZXNzaW9ucy50b2dnbGVDaGF0LiR7c2Vzc2lvbi5zZXNzaW9uSWR9LiR7aGFzaChjaGF0UmVzb3VyY2UudG9TdHJpbmcoKSl9YCxcblx0XHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdFx0dG9nZ2xlZDogaXNTaG93biA/IENvbnRleHRLZXlFeHByLnRydWUoKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogaXNNYWluID8gQ29udGV4dEtleUV4cHIuZmFsc2UoKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVzLlNlc3Npb25Db252ZXJzYXRpb25zLCBncm91cCwgb3JkZXIsIHdoZW46IHNjb3BlZFRvU2Vzc2lvbiB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZvcndhcmRlZFNlc3Npb24/OiBJQWN0aXZlU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IGZvcndhcmRlZFNlc3Npb24gPz8gc2Vzc2lvbjtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRDaGF0ID0gdGFyZ2V0LmNoYXRzLmdldCgpLmZpbmQoYyA9PiBleHRVcmkuaXNFcXVhbChjLnJlc291cmNlLCBjaGF0UmVzb3VyY2UpKTtcblx0XHRcdFx0XHRpZiAoIXRhcmdldENoYXQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRhcmdldC52aXNpYmxlQ2hhdFRhYnMuZ2V0KCkuc29tZShjID0+IGV4dFVyaS5pc0VxdWFsKGMucmVzb3VyY2UsIGNoYXRSZXNvdXJjZSkpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGF0Ll9zZXNzaW9uc1NlcnZpY2UuY2xvc2VDaGF0KHRhcmdldCwgdGFyZ2V0Q2hhdCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIE9wZW5pbmcgYSBjbG9zZWQgY2hhdCAob3IgaGlkZGVuIHN1YmFnZW50KSB1bi1oaWRlcyBpdCBpbiB0aGUgdGFiIHN0cmlwLlxuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fc2Vzc2lvbnNTZXJ2aWNlLm9wZW5DaGF0KHRhcmdldCwgdGFyZ2V0Q2hhdC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdGFsbENoYXRzLmZvckVhY2goKGNoYXQsIGluZGV4KSA9PiB7XG5cdFx0XHQvLyBTa2lwIHVudGl0bGVkIChpbi1jb21wb3NlcikgZHJhZnQgY2hhdHM6IHRoZXkgYXJlIHRyYW5zaWVudCBcIk5ld1xuXHRcdFx0Ly8gQ2hhdFwiIGRyYWZ0cyB0aGF0IGNhbid0IGJlIG1lYW5pbmdmdWxseSBjbG9zZWQvcmVvcGVuZWQsIGFuZCBsaXN0aW5nXG5cdFx0XHQvLyB0aGVtIGhlcmUgKHRpdGxlZCBcIk5ldyBDaGF0XCIpIGp1c3QgZHVwbGljYXRlcyB0aGUgTmV3IENoYXQgYWN0aW9uLlxuXHRcdFx0aWYgKGNoYXQuc3RhdHVzLnJlYWQocmVhZGVyKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBTdWJhZ2VudCAodG9vbC1vcmlnaW4pIGNoYXRzIGFyZSBzdXJmYWNlZCBpbiB0aGVpciBvd24gZ3JvdXAgYmVsb3csXG5cdFx0XHQvLyBzY29wZWQgdG8gdGhlIGN1cnJlbnRseS1hY3RpdmUgY2hhdC5cblx0XHRcdGlmIChjaGF0Lm9yaWdpbj8ua2luZCA9PT0gQ2hhdE9yaWdpbktpbmQuVG9vbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZWdpc3RlclRvZ2dsZShjaGF0LCAnMV9jaGF0cycsIGluZGV4KTtcblx0XHR9KTtcblxuXHRcdC8vIFN1YmFnZW50cyBvZiB0aGUgY3VycmVudGx5LWFjdGl2ZSBjaGF0LCBzaG93biBhcyBhIHNlcGFyYXRlIGdyb3VwIGF0IHRoZVxuXHRcdC8vIGJvdHRvbSAoYSBzZXBhcmF0b3IgZGl2aWRlcyB0aGVtIGZyb20gdGhlIHNlc3Npb24ncyBjaGF0cykuIFRoaXMgZ3JvdXBcblx0XHQvLyBjaGFuZ2VzIGFzIHRoZSBhY3RpdmUgY2hhdCBjaGFuZ2VzLlxuXHRcdGFsbENoYXRzXG5cdFx0XHQuZmlsdGVyKGNoYXQgPT5cblx0XHRcdFx0Y2hhdC5vcmlnaW4/LmtpbmQgPT09IENoYXRPcmlnaW5LaW5kLlRvb2wgJiZcblx0XHRcdFx0ISFjaGF0Lm9yaWdpbi5wYXJlbnRDaGF0ICYmXG5cdFx0XHRcdGV4dFVyaS5pc0VxdWFsKGNoYXQub3JpZ2luLnBhcmVudENoYXQsIGFjdGl2ZUNoYXRSZXNvdXJjZSkpXG5cdFx0XHQuZm9yRWFjaCgoY2hhdCwgaW5kZXgpID0+IHJlZ2lzdGVyVG9nZ2xlKGNoYXQsICcyX3N1YmFnZW50cycsIGluZGV4KSk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZVBpblNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLnRvZ2dsZVBpbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Q29tcG9zaXRlQmFyLnBpbicsIFwiUGluIFNlc3Npb25cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBpbixcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBTZXNzaW9uSXNTdGlja3lDb250ZXh0LFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnBpbm5lZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0Q29tcG9zaXRlQmFyLnVucGluJywgXCJVbnBpbiBTZXNzaW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25CYXJUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJzFfc2Vzc2lvbicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LCBTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpLnRvZ2dsZVNlc3Npb25TdGlja2luZXNzKHNlc3Npb24pO1xuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLlNlc3Npb25IZWFkZXJDb250ZXh0LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3Nlc3Npb25zLmNoYXRDb21wb3NpdGVCYXIudG9nZ2xlUGluJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXRDb21wb3NpdGVCYXIucGluVmlldycsIFwiUGluIFZpZXdcIiksXG5cdFx0dG9nZ2xlZDoge1xuXHRcdFx0Y29uZGl0aW9uOiBTZXNzaW9uSXNTdGlja3lDb250ZXh0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0Q29tcG9zaXRlQmFyLnVucGluVmlldycsIFwiVW5waW4gVmlld1wiKSxcblx0XHR9LFxuXHR9LFxuXHRncm91cDogJzFfdmlldycsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCxcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVuYW1lU2Vzc2lvbkhlYWRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLnNlc3Npb25IZWFkZXIucmVuYW1lJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlbmFtZVNlc3Npb25IZWFkZXInLCBcIlJlbmFtZS4uLlwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uSGVhZGVyQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIucmVnZXgoU2Vzc2lvblByb3ZpZGVySWRDb250ZXh0LmtleSwgQU5ZX0FHRU5UX0hPU1RfUFJPVklERVJfUkUpLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSkuZ2V0U2Vzc2lvblZpZXcoc2Vzc2lvbi5zZXNzaW9uSWQpPy5zdGFydFRpdGxlRWRpdGluZygpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsb3NlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmNoYXRDb21wb3NpdGVCYXIuY2xvc2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdENvbXBvc2l0ZUJhci5jbG9zZScsIFwiQ2xvc2VcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25CYXJUb29sYmFyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgTXVsdGlwbGVTZXNzaW9uc1Zpc2libGVDb250ZXh0KSxcblx0XHRcdFx0Z3JvdXA6ICcxX3Nlc3Npb24nLFxuXHRcdFx0XHRvcmRlcjogMzAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uSGVhZGVyQ29udGV4dCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIE11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlQ29udGV4dCksXG5cdFx0XHRcdGdyb3VwOiAnMV92aWV3Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cblx0XHRzZXNzaW9uc1NlcnZpY2UuY2xvc2VTZXNzaW9uKHNlc3Npb24pO1xuXHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVNYXhpbWl6ZVNlc3Npb25WaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2hhdENvbXBvc2l0ZUJhci50b2dnbGVNYXhpbWl6ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Q29tcG9zaXRlQmFyLm1heGltaXplJywgXCJNYXhpbWl6ZSBTZXNzaW9uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zY3JlZW5GdWxsLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IFNlc3Npb25Jc01heGltaXplZENvbnRleHQsXG5cdFx0XHRcdGljb246IENvZGljb24uc2NyZWVuTm9ybWFsLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXRDb21wb3NpdGVCYXIudW5tYXhpbWl6ZScsIFwiUmVzdG9yZSBTZXNzaW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25CYXJUb29sYmFyLFxuXHRcdFx0XHR3aGVuOiBNdWx0aXBsZVNlc3Npb25zVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9zZXNzaW9uJyxcblx0XHRcdFx0b3JkZXI6IDIwLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpLnRvZ2dsZU1heGltaXplU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSkuc2V0QWN0aXZlKHNlc3Npb24pO1xuXHR9XG59KTtcblxuLy8gLS0gQ2xvc2UgRWRpdG9yIEFyZWEgKFdhdGVybWFyayBUb29sYmFyKSAtLVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xvc2VFZGl0b3JBcmVhQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2xvc2VFZGl0b3JBcmVhJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlRWRpdG9yQXJlYScsIFwiQ2xvc2UgRWRpdG9yIEFyZWFcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JHcm91cFdhdGVybWFya1Rvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxlQUF3QjtBQUNqQyxTQUFT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
