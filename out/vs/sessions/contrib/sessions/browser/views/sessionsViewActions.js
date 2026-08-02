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
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { isMobile, isWeb } from "../../../../../base/common/platform.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from "../../../../browser/workbench.js";
import { EditorsVisibleContext, EditorAreaFocusContext, IsSessionsWindowContext } from "../../../../../workbench/common/contextkeys.js";
import { SessionsCategories } from "../../../../common/categories.js";
import { ARCHIVE_SESSION_COMMAND_ID, RENAME_SESSION_COMMAND_ID, UNARCHIVE_SESSION_COMMAND_ID } from "../../../../common/sessionCommands.js";
import { SessionSupportsDeleteContext, SessionSupportsRenameContext, IsNewChatSessionContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsReadContext } from "../../../../common/contextkeys.js";
import { SessionItemToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, SessionSectionTypeContext, SessionGroupHasVisibleSessionsContext, SessionGroupIsEmptyContext, IsSessionPinnedContext, SessionsGrouping, SessionsSorting } from "./sessionsList.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionGroupsService } from "../../../../services/sessions/browser/sessionGroupsService.js";
import { IsWorkspaceGroupCappedContext, SessionsViewFilterOptionsSubMenu, SessionsViewFilterSubMenu, SessionsViewGroupingContext, SessionsViewId, SessionsViewSortingContext, openSessionToTheSide } from "./sessionsView.js";
import { Menus } from "../../../../browser/menus.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ChatContextKeys } from "../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionPresentation, getChatSessionArchiveActionWording } from "../../../../../platform/chat/common/sessionArchiveActions.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ISessionsPartService } from "../../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { URI } from "../../../../../base/common/uri.js";
import { AUTOMATIONS_CUSTOM_VIEW_ID } from "./automationsView.js";
const CLOSE_SESSION_COMMAND_ID = "sessionsViewPane.closeSession";
registerAction2(class CloseSessionAction extends Action2 {
  constructor() {
    super({
      id: CLOSE_SESSION_COMMAND_ID,
      title: localize2("closeSession", "Close Session"),
      f1: true,
      precondition: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
      category: SessionsCategories.Sessions
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    sessionsService.openNewSession();
  }
});
KeybindingsRegistry.registerKeybindingRule({
  id: CLOSE_SESSION_COMMAND_ID,
  weight: KeybindingWeight.SessionsContrib,
  when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
  primary: KeyMod.CtrlCmd | KeyCode.KeyW,
  win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] }
});
const OPEN_SESSION_AT_INDEX_COMMAND_ID = "sessionsViewPane.openSessionAtIndex";
function digitToKeyCode(digit) {
  switch (digit) {
    case 1:
      return KeyCode.Digit1;
    case 2:
      return KeyCode.Digit2;
    case 3:
      return KeyCode.Digit3;
    case 4:
      return KeyCode.Digit4;
    case 5:
      return KeyCode.Digit5;
    case 6:
      return KeyCode.Digit6;
    case 7:
      return KeyCode.Digit7;
    case 8:
      return KeyCode.Digit8;
    case 9:
      return KeyCode.Digit9;
    default:
      return KeyCode.Unknown;
  }
}
const openSessionAtIndex = (accessor, sessionIndex) => {
  if (typeof sessionIndex !== "number") {
    return;
  }
  const viewsService = accessor.get(IViewsService);
  const sessionsService = accessor.get(ISessionsService);
  const view = viewsService.getViewWithId(SessionsViewId);
  const visible = view?.sessionsControl?.getVisibleSessions() ?? [];
  if (visible.length === 0) {
    return;
  }
  const target = sessionIndex === -1 ? visible[visible.length - 1] : visible[sessionIndex];
  if (!target) {
    return;
  }
  sessionsService.openSession(target.resource);
};
CommandsRegistry.registerCommand({
  id: OPEN_SESSION_AT_INDEX_COMMAND_ID,
  handler: openSessionAtIndex
});
for (let visibleIndex = 1; visibleIndex <= 9; visibleIndex++) {
  const sessionIndex = visibleIndex === 9 ? -1 : visibleIndex - 1;
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: OPEN_SESSION_AT_INDEX_COMMAND_ID + visibleIndex,
    weight: KeybindingWeight.SessionsContrib,
    when: IsSessionsWindowContext,
    primary: KeyMod.Alt | digitToKeyCode(visibleIndex),
    mac: { primary: KeyMod.WinCtrl | digitToKeyCode(visibleIndex) },
    handler: (accessor) => openSessionAtIndex(accessor, sessionIndex)
  });
}
const navigateSessionInList = async (accessor, direction) => {
  const viewsService = accessor.get(IViewsService);
  const sessionsService = accessor.get(ISessionsService);
  const view = viewsService.getViewWithId(SessionsViewId);
  const visible = view?.sessionsControl?.getVisibleSessions() ?? [];
  if (visible.length === 0) {
    return;
  }
  const activeResource = sessionsService.activeSession.get()?.resource.toString();
  const currentIndex = activeResource === void 0 ? -1 : visible.findIndex((session) => session.resource.toString() === activeResource);
  let targetIndex;
  if (currentIndex === -1) {
    targetIndex = direction === "next" ? 0 : visible.length - 1;
  } else {
    targetIndex = direction === "next" ? Math.min(currentIndex + 1, visible.length - 1) : Math.max(currentIndex - 1, 0);
  }
  if (targetIndex === currentIndex) {
    return;
  }
  const target = visible[targetIndex];
  if (target) {
    await sessionsService.openSession(target.resource);
  }
};
registerAction2(class NavigatePreviousSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.navigatePreviousSession",
      title: {
        value: localize("navigatePreviousSession", "Go to Previous Session"),
        original: "Go to Previous Session",
        mnemonicTitle: localize("navigatePreviousSession.mnemonic", "&&Previous Session")
      },
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        // Mirror core "Previous Editor"; keep Alt+Up as a sessions-only alternate outside the editor area.
        weight: KeybindingWeight.SessionsContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
        primary: KeyMod.CtrlCmd | KeyCode.PageUp,
        secondary: [KeyMod.Alt | KeyCode.UpArrow],
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft, KeyMod.Alt | KeyCode.UpArrow]
        }
      },
      menu: [{
        id: Menus.GoMenu,
        group: "2_list_nav",
        order: 1
      }]
    });
  }
  run(accessor) {
    return navigateSessionInList(accessor, "previous");
  }
});
registerAction2(class NavigateNextSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.navigateNextSession",
      title: {
        value: localize("navigateNextSession", "Go to Next Session"),
        original: "Go to Next Session",
        mnemonicTitle: localize("navigateNextSession.mnemonic", "&&Next Session")
      },
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        // Mirror core "Next Editor"; keep Alt+Down as a sessions-only alternate outside the editor area.
        weight: KeybindingWeight.SessionsContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
        primary: KeyMod.CtrlCmd | KeyCode.PageDown,
        secondary: [KeyMod.Alt | KeyCode.DownArrow],
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight, KeyMod.Alt | KeyCode.DownArrow]
        }
      },
      menu: [{
        id: Menus.GoMenu,
        group: "2_list_nav",
        order: 2
      }]
    });
  }
  run(accessor) {
    return navigateSessionInList(accessor, "next");
  }
});
MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
  submenu: SessionsViewFilterSubMenu,
  title: localize2("filterSessions", "Filter Sessions"),
  icon: Codicon.settings,
  group: "navigation",
  order: 10
});
MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
  command: {
    id: "sessionsViewPane.find",
    title: localize2("find", "Find Session"),
    icon: Codicon.search
  },
  group: "navigation",
  order: 20
});
MenuRegistry.appendMenuItem(SessionsViewFilterSubMenu, {
  submenu: SessionsViewFilterOptionsSubMenu,
  title: localize2("filter", "Filter"),
  group: "0_filter",
  order: 0
});
registerAction2(class SortByCreatedAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.sortByCreated",
      title: localize2("sortByCreated", "Sort by Created"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Created),
      menu: [{ id: SessionsViewFilterSubMenu, group: "1_sort", order: 0 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setSorting(SessionsSorting.Created);
  }
});
registerAction2(class SortByUpdatedAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.sortByUpdated",
      title: localize2("sortByUpdated", "Sort by Updated"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Updated),
      menu: [{ id: SessionsViewFilterSubMenu, group: "1_sort", order: 1 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setSorting(SessionsSorting.Updated);
  }
});
registerAction2(class GroupByWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.groupByWorkspace",
      title: localize2("groupByWorkspace", "Group by Workspace"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace),
      menu: [{ id: SessionsViewFilterSubMenu, group: "2_group", order: 0 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setGrouping(SessionsGrouping.Workspace);
  }
});
registerAction2(class GroupByTimeAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.groupByTime",
      title: localize2("groupByTime", "Group by Time"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Date),
      menu: [{ id: SessionsViewFilterSubMenu, group: "2_group", order: 1 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setGrouping(SessionsGrouping.Date);
  }
});
registerAction2(class ShowRecentWorkspaceSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.showRecentSessions",
      title: localize2("showRecentSessions", "Show Recent Sessions"),
      category: SessionsCategories.Sessions,
      toggled: IsWorkspaceGroupCappedContext,
      menu: [{
        id: SessionsViewFilterSubMenu,
        group: "3_cap",
        order: 0,
        when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace)
      }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.sessionsControl?.setWorkspaceGroupCapped(true);
    IsWorkspaceGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(true);
  }
});
registerAction2(class ShowAllWorkspaceSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.showAllSessions",
      title: localize2("showAllSessions", "Show All Sessions"),
      category: SessionsCategories.Sessions,
      toggled: IsWorkspaceGroupCappedContext.negate(),
      menu: [{
        id: SessionsViewFilterSubMenu,
        group: "3_cap",
        order: 1,
        when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace)
      }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.sessionsControl?.setWorkspaceGroupCapped(false);
    IsWorkspaceGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(false);
  }
});
registerAction2(class CollapseAllGroupsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.collapseAllGroups",
      title: localize2("collapseAllGroups", "Collapse All Groups"),
      category: SessionsCategories.Sessions,
      menu: [{ id: SessionsViewFilterSubMenu, group: "4_collapse", order: 0 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.sessionsControl?.collapseAllSections();
  }
});
registerAction2(class RefreshSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.refresh",
      title: localize2("refresh", "Refresh Sessions"),
      icon: Codicon.refresh,
      f1: true,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    return view?.sessionsControl?.refresh();
  }
});
registerAction2(class FindSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.find",
      title: localize2("find", "Find Session"),
      icon: Codicon.search,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    return view?.openFind();
  }
});
registerAction2(class NewSessionForWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.sectionNewSession",
      title: localize2("newSessionForWorkspace", "New Session"),
      icon: Codicon.plus,
      menu: [{
        id: SessionSectionToolbarMenuId,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals(SessionSectionTypeContext.key, "workspace")
      }]
    });
  }
  async run(accessor, context) {
    if (!context || !context.sessions || context.sessions.length === 0) {
      return;
    }
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const commandService = accessor.get(ICommandService);
    sessionsService.openNewSession();
    const session = context.sessions[0];
    const workspace = session.workspace.get();
    const folderUri = workspace?.folders[0]?.root;
    const providerId = session.providerId;
    const newSession = sessionsService.activeSession.get();
    if (folderUri) {
      sessionsPartService.getSessionView(newSession?.sessionId)?.selectWorkspace(folderUri, providerId);
    }
    if (isWeb && isMobile) {
      commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
    }
    sessionsPartService.focusSession(newSession);
  }
});
const NEW_QUICK_CHAT_COMMAND_ID = "sessionsView.newQuickChat";
const QuickChatEnabledContext = ContextKeyExpr.and(
  ChatContextKeys.enabled,
  AGENT_HOST_ENABLED_CONTEXT_KEY
);
registerAction2(class NewQuickChatAction extends Action2 {
  constructor() {
    super({
      id: NEW_QUICK_CHAT_COMMAND_ID,
      title: localize2("newQuickChat", "New Quick Chat"),
      icon: Codicon.add,
      category: SessionsCategories.Sessions,
      f1: true,
      precondition: QuickChatEnabledContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyN),
        when: ContextKeyExpr.and(QuickChatEnabledContext, IsSessionsWindowContext, EditorAreaFocusContext.negate())
      },
      menu: [
        {
          // Sole create affordance for quick chats: the "+" on the
          // always-visible in-list "Chats" section header. Opens the
          // composer; the session type is chosen via its inline picker.
          id: SessionSectionToolbarMenuId,
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(QuickChatEnabledContext, ContextKeyExpr.equals(SessionSectionTypeContext.key, "quickchats"))
        }
      ]
    });
  }
  run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const activeQuickChat = sessionsService.openQuickChat();
    if (isWeb && isMobile) {
      accessor.get(ICommandService).executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
    }
    accessor.get(ISessionsPartService).focusSession(activeQuickChat);
  }
});
const ConfirmArchiveStorageKey = "sessions.confirmArchive";
function getArchiveSectionConfirmationMessage(context, wording) {
  if (context.id === "pinned") {
    if (context.sessions.length === 1) {
      return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markPinnedSectionSessionDone.confirmSingle", "Are you sure you want to mark 1 pinned session as done?") : localize("archivePinnedSectionSession.confirmSingle", "Are you sure you want to archive 1 pinned session?");
    }
    return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markPinnedSectionSessionsDone.confirm", "Are you sure you want to mark {0} pinned sessions as done?", context.sessions.length) : localize("archivePinnedSectionSessions.confirm", "Are you sure you want to archive {0} pinned sessions?", context.sessions.length);
  }
  if (context.sessions.length === 1) {
    return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSectionSessionDone.confirmSingle", "Are you sure you want to mark 1 session from '{0}' as done?", context.label) : localize("archiveSectionSession.confirmSingle", "Are you sure you want to archive 1 session from '{0}'?", context.label);
  }
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSectionSessionsDone.confirm", "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.label) : localize("archiveSectionSessions.confirm", "Are you sure you want to archive {0} sessions from '{1}'?", context.sessions.length, context.label);
}
class BaseArchiveSectionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "sessionsView.sectionArchive",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionSectionToolbarMenuId,
        group: "navigation",
        order: 0,
        // Not on Done itself, and not on the "Chats" (quick chats) section.
        // Also not on Automations.
        when: ContextKeyExpr.and(
          ContextKeyExpr.notEquals(SessionSectionTypeContext.key, "archived"),
          ContextKeyExpr.notEquals(SessionSectionTypeContext.key, "quickchats"),
          ContextKeyExpr.notEquals(SessionSectionTypeContext.key, "automations")
        )
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !context.sessions || context.sessions.length === 0) {
      return;
    }
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
    if (!skipConfirmation) {
      const confirmed = await dialogService.confirm({
        message: getArchiveSectionConfirmationMessage(context, this.wording),
        detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSectionSessionsDone.detail", "You can restore sessions later if needed from the sessions view.") : localize("archiveSectionSessions.detail", "You can unarchive sessions later if needed from the sessions view."),
        primaryButton: getChatSessionArchiveActionPresentation(this.wording).archiveAll.title.value,
        checkbox: {
          label: localize("doNotAskAgain", "Do not ask me again")
        }
      });
      if (!confirmed.confirmed) {
        return;
      }
      if (confirmed.checkboxChecked) {
        storageService.store(ConfirmArchiveStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
      }
    }
    for (const session of context.sessions) {
      await sessionsManagementService.archiveSession(session);
    }
  }
}
class ArchiveSectionAction extends BaseArchiveSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkSectionSessionsDoneAction extends BaseArchiveSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
function getArchiveGroupConfirmationMessage(context, wording) {
  if (context.sessions.length === 1) {
    return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markGroupSessionDone.confirmSingle", "Are you sure you want to mark 1 session from '{0}' as done?", context.group.name) : localize("archiveGroupSession.confirmSingle", "Are you sure you want to archive 1 session from '{0}'?", context.group.name);
  }
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markGroupSessionsDone.confirm", "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.group.name) : localize("archiveGroupSessions.confirm", "Are you sure you want to archive {0} sessions from '{1}'?", context.sessions.length, context.group.name);
}
class BaseArchiveSessionsInGroupAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "sessionsView.markAllInGroupAsDone",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionGroupToolbarMenuId,
        group: "navigation",
        order: 0,
        when: SessionGroupHasVisibleSessionsContext
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !context.sessions || context.sessions.length === 0) {
      return;
    }
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
    if (!skipConfirmation) {
      const confirmed = await dialogService.confirm({
        message: getArchiveGroupConfirmationMessage(context, this.wording),
        detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markGroupSessionsDone.detail", "You can restore sessions later if needed from the sessions view.") : localize("archiveGroupSessions.detail", "You can unarchive sessions later if needed from the sessions view."),
        primaryButton: getChatSessionArchiveActionPresentation(this.wording).archiveAll.title.value,
        checkbox: {
          label: localize("doNotAskAgain", "Do not ask me again")
        }
      });
      if (!confirmed.confirmed) {
        return;
      }
      if (confirmed.checkboxChecked) {
        storageService.store(ConfirmArchiveStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
      }
    }
    for (const session of context.sessions) {
      await sessionsManagementService.archiveSession(session);
    }
  }
}
class ArchiveSessionsInGroupAction extends BaseArchiveSessionsInGroupAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAllSessionsInGroupAsDoneAction extends BaseArchiveSessionsInGroupAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
registerAction2(class DeleteEmptySessionGroupAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.deleteEmptyGroup",
      title: localize2("deleteEmptyGroup", "Delete Group"),
      icon: Codicon.trash,
      menu: [{
        id: SessionGroupToolbarMenuId,
        group: "navigation",
        order: 0,
        when: SessionGroupIsEmptyContext
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessionGroupsService = accessor.get(ISessionGroupsService);
    if (sessionGroupsService.getSessionIdsInGroup(context.group.id).length === 0) {
      sessionGroupsService.deleteGroup(context.group.id);
    }
  }
});
registerAction2(class NewSessionInGroupAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.newSessionInGroup",
      title: localize2("newSessionInGroup", "New Session"),
      icon: Codicon.plus,
      menu: [{
        id: SessionGroupToolbarMenuId,
        group: "navigation",
        order: 1
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const sessionGroupsService = accessor.get(ISessionGroupsService);
    const commandService = accessor.get(ICommandService);
    sessionsService.openNewSession();
    sessionGroupsService.setPendingNewSessionGroup(context.group.id);
    if (isWeb && isMobile) {
      commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
    }
    sessionsPartService.focusSession(sessionsService.activeSession.get());
  }
});
registerAction2(class PinSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.pinSession",
      title: localize2("pinSession", "Pin"),
      icon: Codicon.pin,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }, {
        id: SessionItemContextMenuId,
        group: "0_pin",
        order: 0,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    for (const session of sessions) {
      view?.sessionsControl?.pinSession(session);
    }
  }
});
registerAction2(class UnpinSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.unpinSession",
      title: localize2("unpinSession", "Unpin"),
      icon: Codicon.pinned,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }, {
        id: SessionItemContextMenuId,
        group: "0_pin",
        order: 0,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    for (const session of sessions) {
      view?.sessionsControl?.unpinSession(session);
    }
  }
});
class BaseArchiveSessionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archive;
    super({
      id: ARCHIVE_SESSION_COMMAND_ID,
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
      }, {
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 2,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
      }, {
        id: Menus.SessionBarToolbar,
        group: "1_session",
        order: 5,
        when: ContextKeyExpr.and(SessionIsCreatedContext, ContextKeyExpr.equals(SessionIsArchivedContext.key, false))
      }]
    });
  }
  async run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    for (const session of sessions) {
      await sessionsManagementService.archiveSession(session);
    }
  }
}
class ArchiveSessionAction extends BaseArchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkSessionAsDoneAction extends BaseArchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class BaseUnarchiveSessionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchive;
    super({
      id: UNARCHIVE_SESSION_COMMAND_ID,
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true)
      }, {
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 2,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true)
      }, {
        id: Menus.SessionBarToolbar,
        group: "navigation",
        order: 5,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true)
      }]
    });
  }
  async run(accessor, context) {
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const sessionsService = accessor.get(ISessionsService);
    if (!context) {
      const activeSession = sessionsService.activeSession.get();
      if (activeSession) {
        await sessionsManagementService.unarchiveSession(activeSession);
      }
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    for (const session of sessions) {
      await sessionsManagementService.unarchiveSession(session);
    }
  }
}
class UnarchiveSessionAction extends BaseUnarchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreArchivedSessionAction extends BaseUnarchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
registerAction2(class RenameSessionAction extends Action2 {
  constructor() {
    super({
      id: RENAME_SESSION_COMMAND_ID,
      title: localize2("renameSession", "Rename..."),
      menu: [{
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 1,
        when: SessionSupportsRenameContext
      }]
    });
  }
  async run(accessor, context) {
    const session = Array.isArray(context) ? context[0] : context;
    if (!session || !session.capabilities.get().supportsRename) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const newTitle = await quickInputService.input({
      value: session.title.get(),
      prompt: localize("renameSession.prompt", "New agent session title"),
      validateInput: async (value) => {
        if (!value.trim()) {
          return localize("renameSession.empty", "Title cannot be empty");
        }
        return void 0;
      }
    });
    if (newTitle) {
      const trimmedTitle = newTitle.trim();
      if (trimmedTitle && trimmedTitle !== session.title.get().trim()) {
        await sessionsManagementService.renameSession(session, trimmedTitle);
      }
    }
  }
});
registerAction2(class DeleteSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.deleteSession",
      title: localize2("deleteSession", "Delete..."),
      menu: [{
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 4,
        when: SessionSupportsDeleteContext
      }]
    });
  }
  async run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = (Array.isArray(context) ? context : [context]).filter((session) => session.capabilities.get().supportsDelete);
    if (sessions.length === 0) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const confirmed = await dialogService.confirm({
      message: sessions.length === 1 ? localize("deleteSession.confirm", "Are you sure you want to delete this session?") : localize("deleteSessions.confirm", "Are you sure you want to delete {0} sessions?", sessions.length),
      detail: localize("deleteSession.detail", "This action cannot be undone."),
      primaryButton: localize("deleteSession.delete", "Delete")
    });
    if (!confirmed.confirmed) {
      return;
    }
    try {
      await sessionsManagementService.deleteSessions(sessions);
    } catch (err) {
      dialogService.error(sessions.length === 1 ? localize("deleteSession.error", "Failed to delete the session: {0}", toErrorMessage(err)) : localize("deleteSessions.error", "Failed to delete the sessions: {0}", toErrorMessage(err)));
    }
  }
});
registerAction2(class MarkSessionReadAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.markRead",
      title: localize2("markRead", "Mark as Read"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "0_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext.negate(),
          SessionIsArchivedContext.negate()
        )
      }, {
        id: Menus.SessionHeaderContext,
        group: "3_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext.negate(),
          SessionIsArchivedContext.negate()
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    sessionsManagementService.markAllRead(sessions);
  }
});
registerAction2(class MarkSessionUnreadAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.markUnread",
      title: localize2("markUnread", "Mark as Unread"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "0_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext,
          SessionIsArchivedContext.negate()
        )
      }, {
        id: Menus.SessionHeaderContext,
        group: "3_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext,
          SessionIsArchivedContext.negate()
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    for (const session of sessions) {
      sessionsManagementService.markUnread(session);
    }
  }
});
registerAction2(class OpenSessionToTheSideAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.openToTheSide",
      title: localize2("openToTheSide", "Open to the Side"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "navigation",
        order: -1,
        when: IsSessionsWindowContext
      }]
    });
  }
  async run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    for (let i = 0; i < sessions.length - 1; i++) {
      const session = sessions[i];
      const visible = sessionsService.visibleSessions.get();
      const lastVisible = visible[visible.length - 1];
      if (lastVisible && lastVisible.sessionId !== session.sessionId) {
        sessionsService.insertAt(session, lastVisible.sessionId, "right");
      }
    }
    const lastRequested = sessions[sessions.length - 1];
    await openSessionToTheSide(sessionsService, lastRequested);
    const visibleAfterOpen = sessionsService.visibleSessions.get();
    const opened = visibleAfterOpen.find((s) => s?.sessionId === lastRequested.sessionId);
    if (opened) {
      sessionsPartService.focusSession(opened);
    }
  }
});
registerAction2(class MarkAllSessionsReadAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.markAllRead",
      title: localize2("markAllRead", "Mark All as Read"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "0_read",
        order: 1
      }]
    });
  }
  run(accessor) {
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const sessions = sessionsManagementService.getSessions().filter((s) => !s.isArchived.get() && !s.isRead.get());
    sessionsManagementService.markAllRead(sessions);
  }
});
class BaseUnarchiveActiveSessionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchive;
    super({
      id: "agentSession.restore",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: MenuId.AgentsChangesToolbar,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          SessionIsArchivedContext
        )
      }]
    });
  }
  async run(accessor) {
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const sessionsService = accessor.get(ISessionsService);
    const activeSession = sessionsService.activeSession.get();
    if (!activeSession || activeSession.status.get() === SessionStatus.Untitled) {
      return;
    }
    await sessionsManagementService.unarchiveSession(activeSession);
  }
}
class UnarchiveActiveSessionAction extends BaseUnarchiveActiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreActiveSessionAction extends BaseUnarchiveActiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
function getSessionsArchiveActionConstructors(wording) {
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? [
    MarkSectionSessionsDoneAction,
    MarkAllSessionsInGroupAsDoneAction,
    MarkSessionAsDoneAction,
    RestoreArchivedSessionAction,
    RestoreActiveSessionAction
  ] : [
    ArchiveSectionAction,
    ArchiveSessionsInGroupAction,
    ArchiveSessionAction,
    UnarchiveSessionAction,
    UnarchiveActiveSessionAction
  ];
}
let SessionsArchiveActionsContribution = class extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this.actionRegistrations = this._register(new DisposableStore());
    this.registerActions();
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
        this.registerActions();
      }
    }));
  }
  registerActions() {
    this.actionRegistrations.clear();
    const wording = getChatSessionArchiveActionWording(this.configurationService);
    for (const action of getSessionsArchiveActionConstructors(wording)) {
      this.actionRegistrations.add(registerAction2(action));
    }
  }
};
SessionsArchiveActionsContribution.ID = "workbench.contrib.sessionsArchiveActions";
SessionsArchiveActionsContribution = __decorateClass([
  __decorateParam(0, IConfigurationService)
], SessionsArchiveActionsContribution);
registerWorkbenchContribution2(SessionsArchiveActionsContribution.ID, SessionsArchiveActionsContribution, WorkbenchPhase.BlockStartup);
registerAction2(class ManageAutomationsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.manageAutomations",
      title: localize2("manageAutomations", "Manage Automations"),
      menu: []
    });
  }
  run(accessor) {
    accessor.get(ICustomViewService).showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
  }
});
const MARK_ALL_AUTOMATION_RUNS_READ_COMMAND_ID = "sessionsView.markAllAutomationRunsRead";
registerAction2(class MarkAllAutomationRunsReadAction extends Action2 {
  constructor() {
    super({
      id: MARK_ALL_AUTOMATION_RUNS_READ_COMMAND_ID,
      title: localize2("markAllAutomationRunsRead", "Mark All as Read")
    });
  }
  async run(accessor) {
    const automationService = accessor.get(IAutomationService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const runs = automationService.runs.get();
    const sessions = /* @__PURE__ */ new Map();
    for (const run of runs) {
      if ((run.status === "completed" || run.status === "failed") && run.sessionResource) {
        const session = sessionsManagementService.getSession(URI.parse(run.sessionResource));
        if (session && !session.isRead.get()) {
          sessions.set(session.resource.toString(), session);
        }
      }
    }
    await sessionsManagementService.markAllRead([...sessions.values()]);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci92aWV3cy9zZXNzaW9uc1ZpZXdBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNb2JpbGUsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENMT1NFX01PQklMRV9TSURFQkFSX0RSQVdFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgRWRpdG9yc1Zpc2libGVDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQVJDSElWRV9TRVNTSU9OX0NPTU1BTkRfSUQsIFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQsIFVOQVJDSElWRV9TRVNTSU9OX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdXBwb3J0c0RlbGV0ZUNvbnRleHQsIFNlc3Npb25TdXBwb3J0c1JlbmFtZUNvbnRleHQsIElzTmV3Q2hhdFNlc3Npb25Db250ZXh0LCBTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQsIFNlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LCBTZXNzaW9uSXNSZWFkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSXRlbVRvb2xiYXJNZW51SWQsIFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCwgU2Vzc2lvblNlY3Rpb25Ub29sYmFyTWVudUlkLCBTZXNzaW9uR3JvdXBUb29sYmFyTWVudUlkLCBTZXNzaW9uU2VjdGlvblR5cGVDb250ZXh0LCBTZXNzaW9uR3JvdXBIYXNWaXNpYmxlU2Vzc2lvbnNDb250ZXh0LCBTZXNzaW9uR3JvdXBJc0VtcHR5Q29udGV4dCwgSXNTZXNzaW9uUGlubmVkQ29udGV4dCwgU2Vzc2lvbnNHcm91cGluZywgU2Vzc2lvbnNTb3J0aW5nLCBJU2Vzc2lvblNlY3Rpb24sIElTZXNzaW9uR3JvdXBJdGVtIH0gZnJvbSAnLi9zZXNzaW9uc0xpc3QuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzV29ya3NwYWNlR3JvdXBDYXBwZWRDb250ZXh0LCBTZXNzaW9uc1ZpZXdGaWx0ZXJPcHRpb25zU3ViTWVudSwgU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSwgU2Vzc2lvbnNWaWV3R3JvdXBpbmdDb250ZXh0LCBTZXNzaW9uc1ZpZXdJZCwgU2Vzc2lvbnNWaWV3LCBTZXNzaW9uc1ZpZXdTb3J0aW5nQ29udGV4dCwgb3BlblNlc3Npb25Ub1RoZVNpZGUgfSBmcm9tICcuL3Nlc3Npb25zVmlldy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcsIENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmdTZXR0aW5nSWQsIGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbiwgZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL3Nlc3Npb25BcmNoaXZlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQgfSBmcm9tICcuL2F1dG9tYXRpb25zVmlldy5qcyc7XG5cbmNvbnN0IENMT1NFX1NFU1NJT05fQ09NTUFORF9JRCA9ICdzZXNzaW9uc1ZpZXdQYW5lLmNsb3NlU2Vzc2lvbic7XG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xvc2VTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDTE9TRV9TRVNTSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZVNlc3Npb24nLCBcIkNsb3NlIFNlc3Npb25cIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElzTmV3Q2hhdFNlc3Npb25Db250ZXh0Lm5lZ2F0ZSgpLCBFZGl0b3JzVmlzaWJsZUNvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9uKCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ0xPU0VfU0VTU0lPTl9DT01NQU5EX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQubmVnYXRlKCksIEVkaXRvcnNWaXNpYmxlQ29udGV4dC5uZWdhdGUoKSksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXLFxuXHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkY0LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5V10gfSxcbn0pO1xuXG4vLyAgT3BlbiBTZXNzaW9uIGF0IEluZGV4IChDdHJsL0NtZCsxLi45KVxuXG5jb25zdCBPUEVOX1NFU1NJT05fQVRfSU5ERVhfQ09NTUFORF9JRCA9ICdzZXNzaW9uc1ZpZXdQYW5lLm9wZW5TZXNzaW9uQXRJbmRleCc7XG5cbmZ1bmN0aW9uIGRpZ2l0VG9LZXlDb2RlKGRpZ2l0OiBudW1iZXIpOiBLZXlDb2RlIHtcblx0c3dpdGNoIChkaWdpdCkge1xuXHRcdGNhc2UgMTogcmV0dXJuIEtleUNvZGUuRGlnaXQxO1xuXHRcdGNhc2UgMjogcmV0dXJuIEtleUNvZGUuRGlnaXQyO1xuXHRcdGNhc2UgMzogcmV0dXJuIEtleUNvZGUuRGlnaXQzO1xuXHRcdGNhc2UgNDogcmV0dXJuIEtleUNvZGUuRGlnaXQ0O1xuXHRcdGNhc2UgNTogcmV0dXJuIEtleUNvZGUuRGlnaXQ1O1xuXHRcdGNhc2UgNjogcmV0dXJuIEtleUNvZGUuRGlnaXQ2O1xuXHRcdGNhc2UgNzogcmV0dXJuIEtleUNvZGUuRGlnaXQ3O1xuXHRcdGNhc2UgODogcmV0dXJuIEtleUNvZGUuRGlnaXQ4O1xuXHRcdGNhc2UgOTogcmV0dXJuIEtleUNvZGUuRGlnaXQ5O1xuXHRcdGRlZmF1bHQ6IHJldHVybiBLZXlDb2RlLlVua25vd247XG5cdH1cbn1cblxuY29uc3Qgb3BlblNlc3Npb25BdEluZGV4ID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uSW5kZXg6IHVua25vd24pOiB2b2lkID0+IHtcblx0aWYgKHR5cGVvZiBzZXNzaW9uSW5kZXggIT09ICdudW1iZXInKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdGNvbnN0IHZpc2libGUgPSB2aWV3Py5zZXNzaW9uc0NvbnRyb2w/LmdldFZpc2libGVTZXNzaW9ucygpID8/IFtdO1xuXHRpZiAodmlzaWJsZS5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Ly8gSW5kZXggLTEgbWVhbnMgXCJsYXN0IHNlc3Npb25cIlxuXHRjb25zdCB0YXJnZXQgPSBzZXNzaW9uSW5kZXggPT09IC0xXG5cdFx0PyB2aXNpYmxlW3Zpc2libGUubGVuZ3RoIC0gMV1cblx0XHQ6IHZpc2libGVbc2Vzc2lvbkluZGV4XTtcblx0aWYgKCF0YXJnZXQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5TZXNzaW9uKHRhcmdldC5yZXNvdXJjZSk7XG59O1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBPUEVOX1NFU1NJT05fQVRfSU5ERVhfQ09NTUFORF9JRCxcblx0aGFuZGxlcjogb3BlblNlc3Npb25BdEluZGV4XG59KTtcblxuLy8gT3BlbiBOdGggc2Vzc2lvbiBmcm9tIHRoZSBsaXN0LiBXaW5kb3dzL0xpbnV4OiBBbHQrMS4uOSAoQ3RybCsxLi45IGlzIHJlc2VydmVkXG4vLyBmb3IgZm9jdXNpbmcgc2Vzc2lvbnMgaW4gdGhlIGdyaWQpLiBtYWNPUzogQ3RybCsxLi45IChXaW5DdHJsKSBcdTIwMTQgdGhlIGdyaWQgdXNlc1xuLy8gQ21kKzEuLjkgdGhlcmUsIHNvIEN0cmwgaXMgZnJlZSBhbmQgYXZvaWRzIE9wdGlvbitkaWdpdCB0eXBpbmcgc3ltYm9scy5cbi8vIDEuLjggb3BlbiB0aGF0IHNlc3Npb247IDkgb3BlbnMgdGhlIGxhc3Qgc2Vzc2lvbi5cbmZvciAobGV0IHZpc2libGVJbmRleCA9IDE7IHZpc2libGVJbmRleCA8PSA5OyB2aXNpYmxlSW5kZXgrKykge1xuXHRjb25zdCBzZXNzaW9uSW5kZXggPSB2aXNpYmxlSW5kZXggPT09IDkgPyAtMSA6IHZpc2libGVJbmRleCAtIDE7XG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBPUEVOX1NFU1NJT05fQVRfSU5ERVhfQ09NTUFORF9JRCArIHZpc2libGVJbmRleCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBkaWdpdFRvS2V5Q29kZSh2aXNpYmxlSW5kZXgpLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IGRpZ2l0VG9LZXlDb2RlKHZpc2libGVJbmRleCkgfSxcblx0XHRoYW5kbGVyOiBhY2Nlc3NvciA9PiBvcGVuU2Vzc2lvbkF0SW5kZXgoYWNjZXNzb3IsIHNlc3Npb25JbmRleClcblx0fSk7XG59XG5cbi8vICBOYXZpZ2F0ZSBQcmV2aW91cyAvIE5leHQgU2Vzc2lvbiAobGlzdCBvcmRlcilcblxuY29uc3QgbmF2aWdhdGVTZXNzaW9uSW5MaXN0ID0gYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkaXJlY3Rpb246ICdwcmV2aW91cycgfCAnbmV4dCcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IHZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxTZXNzaW9uc1ZpZXc+KFNlc3Npb25zVmlld0lkKTtcblx0Y29uc3QgdmlzaWJsZSA9IHZpZXc/LnNlc3Npb25zQ29udHJvbD8uZ2V0VmlzaWJsZVNlc3Npb25zKCkgPz8gW107XG5cdGlmICh2aXNpYmxlLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIExvY2F0ZSB0aGUgYWN0aXZlIHNlc3Npb24gd2l0aGluIHRoZSB2aXNpYmxlIGxpc3Qgc28gbmF2aWdhdGlvbiBmb2xsb3dzXG5cdC8vIHdoYXQgdGhlIHVzZXIgc2VlcyAocmVzcGVjdGluZyBncm91cGluZywgZmlsdGVyaW5nLCBhbmQgY29sbGFwc2VkIHNlY3Rpb25zKS5cblx0Y29uc3QgYWN0aXZlUmVzb3VyY2UgPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0Y29uc3QgY3VycmVudEluZGV4ID0gYWN0aXZlUmVzb3VyY2UgPT09IHVuZGVmaW5lZFxuXHRcdD8gLTFcblx0XHQ6IHZpc2libGUuZmluZEluZGV4KHNlc3Npb24gPT4gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpID09PSBhY3RpdmVSZXNvdXJjZSk7XG5cblx0bGV0IHRhcmdldEluZGV4OiBudW1iZXI7XG5cdGlmIChjdXJyZW50SW5kZXggPT09IC0xKSB7XG5cdFx0Ly8gTm8gYWN0aXZlIHNlc3Npb24gaW4gdGhlIHZpc2libGUgbGlzdDogc3RhcnQgZnJvbSB0aGUgbmVhcmVzdCBlZGdlLlxuXHRcdHRhcmdldEluZGV4ID0gZGlyZWN0aW9uID09PSAnbmV4dCcgPyAwIDogdmlzaWJsZS5sZW5ndGggLSAxO1xuXHR9IGVsc2Uge1xuXHRcdHRhcmdldEluZGV4ID0gZGlyZWN0aW9uID09PSAnbmV4dCdcblx0XHRcdD8gTWF0aC5taW4oY3VycmVudEluZGV4ICsgMSwgdmlzaWJsZS5sZW5ndGggLSAxKVxuXHRcdFx0OiBNYXRoLm1heChjdXJyZW50SW5kZXggLSAxLCAwKTtcblx0fVxuXG5cdC8vIEF0IHRoZSBsaXN0IGVkZ2VzIHRoZSB0YXJnZXQgY2xhbXBzIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbjsgZG9uJ3QgcmUtb3BlbiBpdC5cblx0aWYgKHRhcmdldEluZGV4ID09PSBjdXJyZW50SW5kZXgpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCB0YXJnZXQgPSB2aXNpYmxlW3RhcmdldEluZGV4XTtcblx0aWYgKHRhcmdldCkge1xuXHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuU2Vzc2lvbih0YXJnZXQucmVzb3VyY2UpO1xuXHR9XG59O1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTmF2aWdhdGVQcmV2aW91c1Nlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLm5hdmlnYXRlUHJldmlvdXNTZXNzaW9uJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnbmF2aWdhdGVQcmV2aW91c1Nlc3Npb24nLCBcIkdvIHRvIFByZXZpb3VzIFNlc3Npb25cIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnR28gdG8gUHJldmlvdXMgU2Vzc2lvbicsXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKCduYXZpZ2F0ZVByZXZpb3VzU2Vzc2lvbi5tbmVtb25pYycsIFwiJiZQcmV2aW91cyBTZXNzaW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0Ly8gTWlycm9yIGNvcmUgXCJQcmV2aW91cyBFZGl0b3JcIjsga2VlcCBBbHQrVXAgYXMgYSBzZXNzaW9ucy1vbmx5IGFsdGVybmF0ZSBvdXRzaWRlIHRoZSBlZGl0b3IgYXJlYS5cblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VVcCxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvd10sXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CcmFja2V0TGVmdCwgS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvd10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLkdvTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcyX2xpc3RfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuYXZpZ2F0ZVNlc3Npb25Jbkxpc3QoYWNjZXNzb3IsICdwcmV2aW91cycpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5hdmlnYXRlTmV4dFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLm5hdmlnYXRlTmV4dFNlc3Npb24nLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCduYXZpZ2F0ZU5leHRTZXNzaW9uJywgXCJHbyB0byBOZXh0IFNlc3Npb25cIiksXG5cdFx0XHRcdG9yaWdpbmFsOiAnR28gdG8gTmV4dCBTZXNzaW9uJyxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoJ25hdmlnYXRlTmV4dFNlc3Npb24ubW5lbW9uaWMnLCBcIiYmTmV4dCBTZXNzaW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0Ly8gTWlycm9yIGNvcmUgXCJOZXh0IEVkaXRvclwiOyBrZWVwIEFsdCtEb3duIGFzIGEgc2Vzc2lvbnMtb25seSBhbHRlcm5hdGUgb3V0c2lkZSB0aGUgZWRpdG9yIGFyZWEuXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlRG93bixcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93XSxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5SaWdodEFycm93LFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsIEtleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvd10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLkdvTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcyX2xpc3RfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuYXZpZ2F0ZVNlc3Npb25Jbkxpc3QoYWNjZXNzb3IsICduZXh0Jyk7XG5cdH1cbn0pO1xuXG4vLyAgVmlldyBUaXRsZSBNZW51XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5TaWRlYmFyU2Vzc2lvbnNIZWFkZXIsIHtcblx0c3VibWVudTogU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSxcblx0dGl0bGU6IGxvY2FsaXplMignZmlsdGVyU2Vzc2lvbnMnLCBcIkZpbHRlciBTZXNzaW9uc1wiKSxcblx0aWNvbjogQ29kaWNvbi5zZXR0aW5ncyxcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDEwLFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5TaWRlYmFyU2Vzc2lvbnNIZWFkZXIsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5maW5kJyxcblx0XHR0aXRsZTogbG9jYWxpemUyKCdmaW5kJywgXCJGaW5kIFNlc3Npb25cIiksXG5cdFx0aWNvbjogQ29kaWNvbi5zZWFyY2gsXG5cdH0sXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAyMCxcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSwge1xuXHRzdWJtZW51OiBTZXNzaW9uc1ZpZXdGaWx0ZXJPcHRpb25zU3ViTWVudSxcblx0dGl0bGU6IGxvY2FsaXplMignZmlsdGVyJywgXCJGaWx0ZXJcIiksXG5cdGdyb3VwOiAnMF9maWx0ZXInLFxuXHRvcmRlcjogMCxcbn0pO1xuXG4vLyAgU29ydCAvIEdyb3VwIEFjdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNvcnRCeUNyZWF0ZWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLnNvcnRCeUNyZWF0ZWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc29ydEJ5Q3JlYXRlZCcsIFwiU29ydCBieSBDcmVhdGVkXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uc1ZpZXdTb3J0aW5nQ29udGV4dC5rZXksIFNlc3Npb25zU29ydGluZy5DcmVhdGVkKSxcblx0XHRcdG1lbnU6IFt7IGlkOiBTZXNzaW9uc1ZpZXdGaWx0ZXJTdWJNZW51LCBncm91cDogJzFfc29ydCcsIG9yZGVyOiAwIH1dXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxTZXNzaW9uc1ZpZXc+KFNlc3Npb25zVmlld0lkKTtcblx0XHR2aWV3Py5zZXRTb3J0aW5nKFNlc3Npb25zU29ydGluZy5DcmVhdGVkKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTb3J0QnlVcGRhdGVkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5zb3J0QnlVcGRhdGVkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NvcnRCeVVwZGF0ZWQnLCBcIlNvcnQgYnkgVXBkYXRlZFwiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbnNWaWV3U29ydGluZ0NvbnRleHQua2V5LCBTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCksXG5cdFx0XHRtZW51OiBbeyBpZDogU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSwgZ3JvdXA6ICcxX3NvcnQnLCBvcmRlcjogMSB9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0dmlldz8uc2V0U29ydGluZyhTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgR3JvdXBCeVdvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUuZ3JvdXBCeVdvcmtzcGFjZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdncm91cEJ5V29ya3NwYWNlJywgXCJHcm91cCBieSBXb3Jrc3BhY2VcIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25zVmlld0dyb3VwaW5nQ29udGV4dC5rZXksIFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlKSxcblx0XHRcdG1lbnU6IFt7IGlkOiBTZXNzaW9uc1ZpZXdGaWx0ZXJTdWJNZW51LCBncm91cDogJzJfZ3JvdXAnLCBvcmRlcjogMCB9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0dmlldz8uc2V0R3JvdXBpbmcoU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdyb3VwQnlUaW1lQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5ncm91cEJ5VGltZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdncm91cEJ5VGltZScsIFwiR3JvdXAgYnkgVGltZVwiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbnNWaWV3R3JvdXBpbmdDb250ZXh0LmtleSwgU2Vzc2lvbnNHcm91cGluZy5EYXRlKSxcblx0XHRcdG1lbnU6IFt7IGlkOiBTZXNzaW9uc1ZpZXdGaWx0ZXJTdWJNZW51LCBncm91cDogJzJfZ3JvdXAnLCBvcmRlcjogMSB9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0dmlldz8uc2V0R3JvdXBpbmcoU2Vzc2lvbnNHcm91cGluZy5EYXRlKTtcblx0fVxufSk7XG5cbi8vICBXb3Jrc3BhY2UgR3JvdXAgQ2FwcGluZ1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd1JlY2VudFdvcmtzcGFjZVNlc3Npb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5zaG93UmVjZW50U2Vzc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd1JlY2VudFNlc3Npb25zJywgXCJTaG93IFJlY2VudCBTZXNzaW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHR0b2dnbGVkOiBJc1dvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uc1ZpZXdGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzNfY2FwJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uc1ZpZXdHcm91cGluZ0NvbnRleHQua2V5LCBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0dmlldz8uc2Vzc2lvbnNDb250cm9sPy5zZXRXb3Jrc3BhY2VHcm91cENhcHBlZCh0cnVlKTtcblx0XHRJc1dvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dC5iaW5kVG8oYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkpLnNldCh0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93QWxsV29ya3NwYWNlU2Vzc2lvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLnNob3dBbGxTZXNzaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93QWxsU2Vzc2lvbnMnLCBcIlNob3cgQWxsIFNlc3Npb25zXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHRvZ2dsZWQ6IElzV29ya3NwYWNlR3JvdXBDYXBwZWRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25zVmlld0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19jYXAnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25zVmlld0dyb3VwaW5nQ29udGV4dC5rZXksIFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxTZXNzaW9uc1ZpZXc+KFNlc3Npb25zVmlld0lkKTtcblx0XHR2aWV3Py5zZXNzaW9uc0NvbnRyb2w/LnNldFdvcmtzcGFjZUdyb3VwQ2FwcGVkKGZhbHNlKTtcblx0XHRJc1dvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dC5iaW5kVG8oYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkpLnNldChmYWxzZSk7XG5cdH1cbn0pO1xuXG4vLyAgQ29sbGFwc2UgQWxsIEdyb3Vwc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29sbGFwc2VBbGxHcm91cHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLmNvbGxhcHNlQWxsR3JvdXBzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbGxhcHNlQWxsR3JvdXBzJywgXCJDb2xsYXBzZSBBbGwgR3JvdXBzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdG1lbnU6IFt7IGlkOiBTZXNzaW9uc1ZpZXdGaWx0ZXJTdWJNZW51LCBncm91cDogJzRfY29sbGFwc2UnLCBvcmRlcjogMCB9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0dmlldz8uc2Vzc2lvbnNDb250cm9sPy5jb2xsYXBzZUFsbFNlY3Rpb25zKCk7XG5cdH1cbn0pO1xuXG4vLyAgVmlldyBUb29sYmFyIEFjdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlZnJlc2hTZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUucmVmcmVzaCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZWZyZXNoJywgXCJSZWZyZXNoIFNlc3Npb25zXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZWZyZXNoLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0cmV0dXJuIHZpZXc/LnNlc3Npb25zQ29udHJvbD8ucmVmcmVzaCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZpbmRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5maW5kJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZpbmQnLCBcIkZpbmQgU2Vzc2lvblwiKSxcblx0XHRcdGljb246IENvZGljb24uc2VhcmNoLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRcdHJldHVybiB2aWV3Py5vcGVuRmluZCgpO1xuXHR9XG59KTtcblxuLy8gIFNlY3Rpb24gQWN0aW9uc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3U2Vzc2lvbkZvcldvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlldy5zZWN0aW9uTmV3U2Vzc2lvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduZXdTZXNzaW9uRm9yV29ya3NwYWNlJywgXCJOZXcgU2Vzc2lvblwiKSxcblx0XHRcdGljb246IENvZGljb24ucGx1cyxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uU2VjdGlvblRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvblNlY3Rpb25UeXBlQ29udGV4dC5rZXksICd3b3Jrc3BhY2UnKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb25TZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICFjb250ZXh0LnNlc3Npb25zIHx8IGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9uKCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gY29udGV4dC5zZXNzaW9uc1swXTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IHNlc3Npb24ucHJvdmlkZXJJZDtcblxuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoZm9sZGVyVXJpKSB7XG5cdFx0XHRzZXNzaW9uc1BhcnRTZXJ2aWNlLmdldFNlc3Npb25WaWV3KG5ld1Nlc3Npb24/LnNlc3Npb25JZCk/LnNlbGVjdFdvcmtzcGFjZShmb2xkZXJVcmksIHByb3ZpZGVySWQpO1xuXHRcdH1cblxuXHRcdC8vIE9uIG1vYmlsZSB3ZWIsIHRoZSBzaWRlYmFyIGRyYXdlciBjb3ZlcnMgdGhlIHZpZXdwb3J0OyBjbG9zZSBpdCBzb1xuXHRcdC8vIHRoZSBuZXcgc2Vzc2lvbiB2aWV3IGJlY29tZXMgdmlzaWJsZSBhZnRlciBjcmVhdGlvbi4gUm91dGVzIHRocm91Z2hcblx0XHQvLyB0aGUgZHJhd2VyLWNsb3NlIGNvbW1hbmQgdG8ga2VlcCB0aGUgbW9iaWxlIG5hdi9oaXN0b3J5IHN0YWNrIGluIHN5bmMuXG5cdFx0aWYgKGlzV2ViICYmIGlzTW9iaWxlKSB7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDTE9TRV9NT0JJTEVfU0lERUJBUl9EUkFXRVJfQ09NTUFORF9JRCk7XG5cdFx0fVxuXG5cdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24obmV3U2Vzc2lvbik7XG5cdH1cbn0pO1xuXG5jb25zdCBORVdfUVVJQ0tfQ0hBVF9DT01NQU5EX0lEID0gJ3Nlc3Npb25zVmlldy5uZXdRdWlja0NoYXQnO1xuXG4vLyBHYXRlIG9uIEFJIGZlYXR1cmVzIGJlaW5nIGVuYWJsZWQgYW5kIHRoZSBsb2NhbCBhZ2VudCBob3N0ICh3aGljaCBzZXJ2ZXNcbi8vIHF1aWNrIGNoYXRzKSBiZWluZyBhdmFpbGFibGUuXG5jb25zdCBRdWlja0NoYXRFbmFibGVkQ29udGV4dCA9IENvbnRleHRLZXlFeHByLmFuZChcblx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWSxcbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXdRdWlja0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5FV19RVUlDS19DSEFUX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduZXdRdWlja0NoYXQnLCBcIk5ldyBRdWljayBDaGF0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hZGQsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IFF1aWNrQ2hhdEVuYWJsZWRDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU4pLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUXVpY2tDaGF0RW5hYmxlZENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBTb2xlIGNyZWF0ZSBhZmZvcmRhbmNlIGZvciBxdWljayBjaGF0czogdGhlIFwiK1wiIG9uIHRoZVxuXHRcdFx0XHRcdC8vIGFsd2F5cy12aXNpYmxlIGluLWxpc3QgXCJDaGF0c1wiIHNlY3Rpb24gaGVhZGVyLiBPcGVucyB0aGVcblx0XHRcdFx0XHQvLyBjb21wb3NlcjsgdGhlIHNlc3Npb24gdHlwZSBpcyBjaG9zZW4gdmlhIGl0cyBpbmxpbmUgcGlja2VyLlxuXHRcdFx0XHRcdGlkOiBTZXNzaW9uU2VjdGlvblRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUXVpY2tDaGF0RW5hYmxlZENvbnRleHQsIENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uU2VjdGlvblR5cGVDb250ZXh0LmtleSwgJ3F1aWNrY2hhdHMnKSksXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Ly8gT3BlbnMgdGhlIGNvbXBvc2VyIHdpdGggdGhlIGRlZmF1bHQgKGxhc3QtdXNlZCBvciBmaXJzdCkgcXVpY2stY2hhdFxuXHRcdC8vIHNlc3Npb24gdHlwZTsgdGhlIHVzZXIgY2hhbmdlcyBpdCB2aWEgdGhlIGlubGluZSBjb21wb3NlciBwaWNrZXIuXG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZVF1aWNrQ2hhdCA9IHNlc3Npb25zU2VydmljZS5vcGVuUXVpY2tDaGF0KCk7XG5cblx0XHQvLyBPbiBtb2JpbGUgd2ViLCB0aGUgc2lkZWJhciBkcmF3ZXIgY292ZXJzIHRoZSB2aWV3cG9ydDsgY2xvc2UgaXQgc28gdGhlXG5cdFx0Ly8gbmV3IHF1aWNrIGNoYXQgY29tcG9zZXIgYmVjb21lcyB2aXNpYmxlIGFmdGVyIGNyZWF0aW9uLlxuXHRcdGlmIChpc1dlYiAmJiBpc01vYmlsZSkge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoQ0xPU0VfTU9CSUxFX1NJREVCQVJfRFJBV0VSX0NPTU1BTkRfSUQpO1xuXHRcdH1cblxuXHRcdGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSkuZm9jdXNTZXNzaW9uKGFjdGl2ZVF1aWNrQ2hhdCk7XG5cdH1cbn0pO1xuXG5jb25zdCBDb25maXJtQXJjaGl2ZVN0b3JhZ2VLZXkgPSAnc2Vzc2lvbnMuY29uZmlybUFyY2hpdmUnO1xuXG5mdW5jdGlvbiBnZXRBcmNoaXZlU2VjdGlvbkNvbmZpcm1hdGlvbk1lc3NhZ2UoY29udGV4dDogSVNlc3Npb25TZWN0aW9uLCB3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKTogc3RyaW5nIHtcblx0aWYgKGNvbnRleHQuaWQgPT09ICdwaW5uZWQnKSB7XG5cdFx0aWYgKGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gd29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21hcmtQaW5uZWRTZWN0aW9uU2Vzc2lvbkRvbmUuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgMSBwaW5uZWQgc2Vzc2lvbiBhcyBkb25lP1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlUGlubmVkU2VjdGlvblNlc3Npb24uY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGFyY2hpdmUgMSBwaW5uZWQgc2Vzc2lvbj9cIik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0PyBsb2NhbGl6ZSgnbWFya1Bpbm5lZFNlY3Rpb25TZXNzaW9uc0RvbmUuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgezB9IHBpbm5lZCBzZXNzaW9ucyBhcyBkb25lP1wiLCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aClcblx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVQaW5uZWRTZWN0aW9uU2Vzc2lvbnMuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGFyY2hpdmUgezB9IHBpbm5lZCBzZXNzaW9ucz9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgpO1xuXHR9XG5cblx0aWYgKGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIHdvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0PyBsb2NhbGl6ZSgnbWFya1NlY3Rpb25TZXNzaW9uRG9uZS5jb25maXJtU2luZ2xlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gbWFyayAxIHNlc3Npb24gZnJvbSAnezB9JyBhcyBkb25lP1wiLCBjb250ZXh0LmxhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZVNlY3Rpb25TZXNzaW9uLmNvbmZpcm1TaW5nbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBhcmNoaXZlIDEgc2Vzc2lvbiBmcm9tICd7MH0nP1wiLCBjb250ZXh0LmxhYmVsKTtcblx0fVxuXG5cdHJldHVybiB3b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHQ/IGxvY2FsaXplKCdtYXJrU2VjdGlvblNlc3Npb25zRG9uZS5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gbWFyayB7MH0gc2Vzc2lvbnMgZnJvbSAnezF9JyBhcyBkb25lP1wiLCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCwgY29udGV4dC5sYWJlbClcblx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlU2VjdGlvblNlc3Npb25zLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBhcmNoaXZlIHswfSBzZXNzaW9ucyBmcm9tICd7MX0nP1wiLCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCwgY29udGV4dC5sYWJlbCk7XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VBcmNoaXZlU2VjdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24od29yZGluZykuYXJjaGl2ZUFsbDtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlldy5zZWN0aW9uQXJjaGl2ZScsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvblNlY3Rpb25Ub29sYmFyTWVudUlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Ly8gTm90IG9uIERvbmUgaXRzZWxmLCBhbmQgbm90IG9uIHRoZSBcIkNoYXRzXCIgKHF1aWNrIGNoYXRzKSBzZWN0aW9uLlxuXHRcdFx0XHQvLyBBbHNvIG5vdCBvbiBBdXRvbWF0aW9ucy5cblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhTZXNzaW9uU2VjdGlvblR5cGVDb250ZXh0LmtleSwgJ2FyY2hpdmVkJyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKFNlc3Npb25TZWN0aW9uVHlwZUNvbnRleHQua2V5LCAncXVpY2tjaGF0cycpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhTZXNzaW9uU2VjdGlvblR5cGVDb250ZXh0LmtleSwgJ2F1dG9tYXRpb25zJyksXG5cdFx0XHRcdCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uU2VjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghY29udGV4dCB8fCAhY29udGV4dC5zZXNzaW9ucyB8fCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBza2lwQ29uZmlybWF0aW9uID0gc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDb25maXJtQXJjaGl2ZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBmYWxzZSk7XG5cdFx0aWYgKCFza2lwQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRtZXNzYWdlOiBnZXRBcmNoaXZlU2VjdGlvbkNvbmZpcm1hdGlvbk1lc3NhZ2UoY29udGV4dCwgdGhpcy53b3JkaW5nKSxcblx0XHRcdFx0ZGV0YWlsOiB0aGlzLndvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ21hcmtTZWN0aW9uU2Vzc2lvbnNEb25lLmRldGFpbCcsIFwiWW91IGNhbiByZXN0b3JlIHNlc3Npb25zIGxhdGVyIGlmIG5lZWRlZCBmcm9tIHRoZSBzZXNzaW9ucyB2aWV3LlwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVTZWN0aW9uU2Vzc2lvbnMuZGV0YWlsJywgXCJZb3UgY2FuIHVuYXJjaGl2ZSBzZXNzaW9ucyBsYXRlciBpZiBuZWVkZWQgZnJvbSB0aGUgc2Vzc2lvbnMgdmlldy5cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih0aGlzLndvcmRpbmcpLmFyY2hpdmVBbGwudGl0bGUudmFsdWUsXG5cdFx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkb05vdEFza0FnYWluJywgXCJEbyBub3QgYXNrIG1lIGFnYWluXCIpXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIWNvbmZpcm1lZC5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29uZmlybWVkLmNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShDb25maXJtQXJjaGl2ZVN0b3JhZ2VLZXksIHRydWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjb250ZXh0LnNlc3Npb25zKSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFyY2hpdmVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBcmNoaXZlU2VjdGlvbkFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlU2VjdGlvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuQXJjaGl2ZSk7XG5cdH1cbn1cblxuY2xhc3MgTWFya1NlY3Rpb25TZXNzaW9uc0RvbmVBY3Rpb24gZXh0ZW5kcyBCYXNlQXJjaGl2ZVNlY3Rpb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmUpO1xuXHR9XG59XG5cbi8vICBHcm91cCBIZWFkZXIgQWN0aW9uc1xuXG5mdW5jdGlvbiBnZXRBcmNoaXZlR3JvdXBDb25maXJtYXRpb25NZXNzYWdlKGNvbnRleHQ6IElTZXNzaW9uR3JvdXBJdGVtLCB3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKTogc3RyaW5nIHtcblx0aWYgKGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIHdvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0PyBsb2NhbGl6ZSgnbWFya0dyb3VwU2Vzc2lvbkRvbmUuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgMSBzZXNzaW9uIGZyb20gJ3swfScgYXMgZG9uZT9cIiwgY29udGV4dC5ncm91cC5uYW1lKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZUdyb3VwU2Vzc2lvbi5jb25maXJtU2luZ2xlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYXJjaGl2ZSAxIHNlc3Npb24gZnJvbSAnezB9Jz9cIiwgY29udGV4dC5ncm91cC5uYW1lKTtcblx0fVxuXG5cdHJldHVybiB3b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHQ/IGxvY2FsaXplKCdtYXJrR3JvdXBTZXNzaW9uc0RvbmUuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgezB9IHNlc3Npb25zIGZyb20gJ3sxfScgYXMgZG9uZT9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgsIGNvbnRleHQuZ3JvdXAubmFtZSlcblx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlR3JvdXBTZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYXJjaGl2ZSB7MH0gc2Vzc2lvbnMgZnJvbSAnezF9Jz9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgsIGNvbnRleHQuZ3JvdXAubmFtZSk7XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VBcmNoaXZlU2Vzc2lvbnNJbkdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS5hcmNoaXZlQWxsO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3Lm1hcmtBbGxJbkdyb3VwQXNEb25lJyxcblx0XHRcdHRpdGxlOiBhY3Rpb24udGl0bGUsXG5cdFx0XHRpY29uOiBhY3Rpb24uaWNvbixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uR3JvdXBUb29sYmFyTWVudUlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogU2Vzc2lvbkdyb3VwSGFzVmlzaWJsZVNlc3Npb25zQ29udGV4dCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb25Hcm91cEl0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWNvbnRleHQgfHwgIWNvbnRleHQuc2Vzc2lvbnMgfHwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2tpcENvbmZpcm1hdGlvbiA9IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgZmFsc2UpO1xuXHRcdGlmICghc2tpcENvbmZpcm1hdGlvbikge1xuXHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogZ2V0QXJjaGl2ZUdyb3VwQ29uZmlybWF0aW9uTWVzc2FnZShjb250ZXh0LCB0aGlzLndvcmRpbmcpLFxuXHRcdFx0XHRkZXRhaWw6IHRoaXMud29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbWFya0dyb3VwU2Vzc2lvbnNEb25lLmRldGFpbCcsIFwiWW91IGNhbiByZXN0b3JlIHNlc3Npb25zIGxhdGVyIGlmIG5lZWRlZCBmcm9tIHRoZSBzZXNzaW9ucyB2aWV3LlwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVHcm91cFNlc3Npb25zLmRldGFpbCcsIFwiWW91IGNhbiB1bmFyY2hpdmUgc2Vzc2lvbnMgbGF0ZXIgaWYgbmVlZGVkIGZyb20gdGhlIHNlc3Npb25zIHZpZXcuXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24odGhpcy53b3JkaW5nKS5hcmNoaXZlQWxsLnRpdGxlLnZhbHVlLFxuXHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZG9Ob3RBc2tBZ2FpbicsIFwiRG8gbm90IGFzayBtZSBhZ2FpblwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpcm1lZC5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY29udGV4dC5zZXNzaW9ucykge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQXJjaGl2ZVNlc3Npb25zSW5Hcm91cEFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlU2Vzc2lvbnNJbkdyb3VwQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5jbGFzcyBNYXJrQWxsU2Vzc2lvbnNJbkdyb3VwQXNEb25lQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVTZXNzaW9uc0luR3JvdXBBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmUpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEZWxldGVFbXB0eVNlc3Npb25Hcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlldy5kZWxldGVFbXB0eUdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlbGV0ZUVtcHR5R3JvdXAnLCBcIkRlbGV0ZSBHcm91cFwiKSxcblx0XHRcdGljb246IENvZGljb24udHJhc2gsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkdyb3VwVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IFNlc3Npb25Hcm91cElzRW1wdHlDb250ZXh0LFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJU2Vzc2lvbkdyb3VwSXRlbSk6IHZvaWQge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UpO1xuXHRcdGlmIChzZXNzaW9uR3JvdXBzU2VydmljZS5nZXRTZXNzaW9uSWRzSW5Hcm91cChjb250ZXh0Lmdyb3VwLmlkKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHNlc3Npb25Hcm91cHNTZXJ2aWNlLmRlbGV0ZUdyb3VwKGNvbnRleHQuZ3JvdXAuaWQpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXdTZXNzaW9uSW5Hcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlldy5uZXdTZXNzaW9uSW5Hcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduZXdTZXNzaW9uSW5Hcm91cCcsIFwiTmV3IFNlc3Npb25cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBsdXMsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkdyb3VwVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uR3JvdXBJdGVtKTogdm9pZCB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRzZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb24oKTtcblx0XHRzZXNzaW9uR3JvdXBzU2VydmljZS5zZXRQZW5kaW5nTmV3U2Vzc2lvbkdyb3VwKGNvbnRleHQuZ3JvdXAuaWQpO1xuXG5cdFx0Ly8gT24gbW9iaWxlIHdlYiwgdGhlIHNpZGViYXIgZHJhd2VyIGNvdmVycyB0aGUgdmlld3BvcnQ7IGNsb3NlIGl0IHNvXG5cdFx0Ly8gdGhlIG5ldyBzZXNzaW9uIHZpZXcgYmVjb21lcyB2aXNpYmxlIGFmdGVyIGNyZWF0aW9uLlxuXHRcdGlmIChpc1dlYiAmJiBpc01vYmlsZSkge1xuXHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0xPU0VfTU9CSUxFX1NJREVCQVJfRFJBV0VSX0NPTU1BTkRfSUQpO1xuXHRcdH1cblxuXHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpKTtcblx0fVxufSk7XG5cbi8vICBTZXNzaW9uIEl0ZW0gQWN0aW9uc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUGluU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUucGluU2Vzc2lvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwaW5TZXNzaW9uJywgXCJQaW5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBpbixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbVRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKElzU2Vzc2lvblBpbm5lZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIGZhbHNlKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICcwX3BpbicsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKElzU2Vzc2lvblBpbm5lZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIGZhbHNlKSxcblx0XHRcdFx0KSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuaXNBcnJheShjb250ZXh0KSA/IGNvbnRleHQgOiBbY29udGV4dF07XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxTZXNzaW9uc1ZpZXc+KFNlc3Npb25zVmlld0lkKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHZpZXc/LnNlc3Npb25zQ29udHJvbD8ucGluU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVW5waW5TZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS51bnBpblNlc3Npb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndW5waW5TZXNzaW9uJywgXCJVbnBpblwiKSxcblx0XHRcdGljb246IENvZGljb24ucGlubmVkLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoSXNTZXNzaW9uUGlubmVkQ29udGV4dC5rZXksIHRydWUpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHRcdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnMF9waW4nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhJc1Nlc3Npb25QaW5uZWRDb250ZXh0LmtleSwgdHJ1ZSksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIGZhbHNlKSxcblx0XHRcdFx0KSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuaXNBcnJheShjb250ZXh0KSA/IGNvbnRleHQgOiBbY29udGV4dF07XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxTZXNzaW9uc1ZpZXc+KFNlc3Npb25zVmlld0lkKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHZpZXc/LnNlc3Npb25zQ29udHJvbD8udW5waW5TZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0fVxufSk7XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VBcmNoaXZlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3Rvcih3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKSB7XG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHdvcmRpbmcpLmFyY2hpdmU7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFSQ0hJVkVfU0VTU0lPTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnMV9lZGl0Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICcxX3Nlc3Npb24nLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LCBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0LmtleSwgZmFsc2UpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuaXNBcnJheShjb250ZXh0KSA/IGNvbnRleHQgOiBbY29udGV4dF07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFyY2hpdmVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBcmNoaXZlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlU2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuQXJjaGl2ZSk7XG5cdH1cbn1cblxuY2xhc3MgTWFya1Nlc3Npb25Bc0RvbmVBY3Rpb24gZXh0ZW5kcyBCYXNlQXJjaGl2ZVNlc3Npb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmUpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VVbmFyY2hpdmVTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24od29yZGluZykudW5hcmNoaXZlO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBVTkFSQ0hJVkVfU0VTU0lPTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCB0cnVlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIHRydWUpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbkJhclRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0LmtleSwgdHJ1ZSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uIHwgSVNlc3Npb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UudW5hcmNoaXZlU2Vzc2lvbihhY3RpdmVTZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBBcnJheS5pc0FycmF5KGNvbnRleHQpID8gY29udGV4dCA6IFtjb250ZXh0XTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UudW5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVW5hcmNoaXZlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VVbmFyY2hpdmVTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5jbGFzcyBSZXN0b3JlQXJjaGl2ZWRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZVVuYXJjaGl2ZVNlc3Npb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmUpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZW5hbWVTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVuYW1lU2Vzc2lvbicsIFwiUmVuYW1lLi4uXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogU2Vzc2lvblN1cHBvcnRzUmVuYW1lQ29udGV4dCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFycmF5LmlzQXJyYXkoY29udGV4dCkgPyBjb250ZXh0WzBdIDogY29udGV4dDtcblx0XHRpZiAoIXNlc3Npb24gfHwgIXNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzUmVuYW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbmV3VGl0bGUgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR2YWx1ZTogc2Vzc2lvbi50aXRsZS5nZXQoKSxcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ3JlbmFtZVNlc3Npb24ucHJvbXB0JywgXCJOZXcgYWdlbnQgc2Vzc2lvbiB0aXRsZVwiKSxcblx0XHRcdHZhbGlkYXRlSW5wdXQ6IGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0aWYgKCF2YWx1ZS50cmltKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3JlbmFtZVNlc3Npb24uZW1wdHknLCBcIlRpdGxlIGNhbm5vdCBiZSBlbXB0eVwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmIChuZXdUaXRsZSkge1xuXHRcdFx0Y29uc3QgdHJpbW1lZFRpdGxlID0gbmV3VGl0bGUudHJpbSgpO1xuXHRcdFx0aWYgKHRyaW1tZWRUaXRsZSAmJiB0cmltbWVkVGl0bGUgIT09IHNlc3Npb24udGl0bGUuZ2V0KCkudHJpbSgpKSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UucmVuYW1lU2Vzc2lvbihzZXNzaW9uLCB0cmltbWVkVGl0bGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEZWxldGVTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5kZWxldGVTZXNzaW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlbGV0ZVNlc3Npb24nLCBcIkRlbGV0ZS4uLlwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnMV9lZGl0Jyxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdHdoZW46IFNlc3Npb25TdXBwb3J0c0RlbGV0ZUNvbnRleHQsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uIHwgSVNlc3Npb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IChBcnJheS5pc0FycmF5KGNvbnRleHQpID8gY29udGV4dCA6IFtjb250ZXh0XSkuZmlsdGVyKHNlc3Npb24gPT4gc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNEZWxldGUpO1xuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBzZXNzaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGVsZXRlU2Vzc2lvbi5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHRoaXMgc2Vzc2lvbj9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZGVsZXRlU2Vzc2lvbnMuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB7MH0gc2Vzc2lvbnM/XCIsIHNlc3Npb25zLmxlbmd0aCksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkZWxldGVTZXNzaW9uLmRldGFpbCcsIFwiVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGVsZXRlU2Vzc2lvbi5kZWxldGUnLCBcIkRlbGV0ZVwiKVxuXHRcdH0pO1xuXHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmRlbGV0ZVNlc3Npb25zKHNlc3Npb25zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGRpYWxvZ1NlcnZpY2UuZXJyb3Ioc2Vzc2lvbnMubGVuZ3RoID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2RlbGV0ZVNlc3Npb24uZXJyb3InLCBcIkZhaWxlZCB0byBkZWxldGUgdGhlIHNlc3Npb246IHswfVwiLCB0b0Vycm9yTWVzc2FnZShlcnIpKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkZWxldGVTZXNzaW9ucy5lcnJvcicsIFwiRmFpbGVkIHRvIGRlbGV0ZSB0aGUgc2Vzc2lvbnM6IHswfVwiLCB0b0Vycm9yTWVzc2FnZShlcnIpKSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE1hcmtTZXNzaW9uUmVhZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUubWFya1JlYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya1JlYWQnLCBcIk1hcmsgYXMgUmVhZFwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnMF9yZWFkJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRTZXNzaW9uSXNSZWFkQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uSGVhZGVyQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICczX3JlYWQnLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFNlc3Npb25Jc1JlYWRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuaXNBcnJheShjb250ZXh0KSA/IGNvbnRleHQgOiBbY29udGV4dF07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrQWxsUmVhZChzZXNzaW9ucyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTWFya1Nlc3Npb25VbnJlYWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLm1hcmtVbnJlYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya1VucmVhZCcsIFwiTWFyayBhcyBVbnJlYWRcIiksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLFxuXHRcdFx0XHRncm91cDogJzBfcmVhZCcsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2Vzc2lvbklzUmVhZENvbnRleHQsXG5cdFx0XHRcdFx0U2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbkhlYWRlckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19yZWFkJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRTZXNzaW9uSXNSZWFkQ29udGV4dCxcblx0XHRcdFx0XHRTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uIHwgSVNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmlzQXJyYXkoY29udGV4dCkgPyBjb250ZXh0IDogW2NvbnRleHRdO1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrVW5yZWFkKHNlc3Npb24pO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuU2Vzc2lvblRvVGhlU2lkZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUub3BlblRvVGhlU2lkZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuVG9UaGVTaWRlJywgXCJPcGVuIHRvIHRoZSBTaWRlXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuaXNBcnJheShjb250ZXh0KSA/IGNvbnRleHQgOiBbY29udGV4dF07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZXNzaW9ucy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1tpXTtcblx0XHRcdGNvbnN0IHZpc2libGUgPSBzZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLmdldCgpO1xuXHRcdFx0Y29uc3QgbGFzdFZpc2libGUgPSB2aXNpYmxlW3Zpc2libGUubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAobGFzdFZpc2libGUgJiYgbGFzdFZpc2libGUuc2Vzc2lvbklkICE9PSBzZXNzaW9uLnNlc3Npb25JZCkge1xuXHRcdFx0XHRzZXNzaW9uc1NlcnZpY2UuaW5zZXJ0QXQoc2Vzc2lvbiwgbGFzdFZpc2libGUuc2Vzc2lvbklkLCAncmlnaHQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBsYXN0UmVxdWVzdGVkID0gc2Vzc2lvbnNbc2Vzc2lvbnMubGVuZ3RoIC0gMV07XG5cdFx0YXdhaXQgb3BlblNlc3Npb25Ub1RoZVNpZGUoc2Vzc2lvbnNTZXJ2aWNlLCBsYXN0UmVxdWVzdGVkKTtcblxuXHRcdGNvbnN0IHZpc2libGVBZnRlck9wZW4gPSBzZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLmdldCgpO1xuXHRcdGNvbnN0IG9wZW5lZCA9IHZpc2libGVBZnRlck9wZW4uZmluZChzID0+IHM/LnNlc3Npb25JZCA9PT0gbGFzdFJlcXVlc3RlZC5zZXNzaW9uSWQpO1xuXHRcdGlmIChvcGVuZWQpIHtcblx0XHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKG9wZW5lZCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE1hcmtBbGxTZXNzaW9uc1JlYWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLm1hcmtBbGxSZWFkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hcmtBbGxSZWFkJywgXCJNYXJrIEFsbCBhcyBSZWFkXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICcwX3JlYWQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25zKClcblx0XHRcdC5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkLmdldCgpICYmICFzLmlzUmVhZC5nZXQoKSk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrQWxsUmVhZChzZXNzaW9ucyk7XG5cdH1cbn0pO1xuXG5hYnN0cmFjdCBjbGFzcyBCYXNlVW5hcmNoaXZlQWN0aXZlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24od29yZGluZykudW5hcmNoaXZlO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uLnJlc3RvcmUnLFxuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudHNDaGFuZ2VzVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0XHRTZXNzaW9uSXNBcmNoaXZlZENvbnRleHRcblx0XHRcdFx0KVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8IGFjdGl2ZVNlc3Npb24uc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS51bmFyY2hpdmVTZXNzaW9uKGFjdGl2ZVNlc3Npb24pO1xuXHR9XG59XG5cbmNsYXNzIFVuYXJjaGl2ZUFjdGl2ZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlVW5hcmNoaXZlQWN0aXZlU2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuQXJjaGl2ZSk7XG5cdH1cbn1cblxuY2xhc3MgUmVzdG9yZUFjdGl2ZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlVW5hcmNoaXZlQWN0aXZlU2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U2Vzc2lvbnNBcmNoaXZlQWN0aW9uQ29uc3RydWN0b3JzKHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpOiByZWFkb25seSB7IG5ldygpOiBBY3Rpb24yIH1bXSB7XG5cdHJldHVybiB3b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHQ/IFtcblx0XHRcdE1hcmtTZWN0aW9uU2Vzc2lvbnNEb25lQWN0aW9uLFxuXHRcdFx0TWFya0FsbFNlc3Npb25zSW5Hcm91cEFzRG9uZUFjdGlvbixcblx0XHRcdE1hcmtTZXNzaW9uQXNEb25lQWN0aW9uLFxuXHRcdFx0UmVzdG9yZUFyY2hpdmVkU2Vzc2lvbkFjdGlvbixcblx0XHRcdFJlc3RvcmVBY3RpdmVTZXNzaW9uQWN0aW9uLFxuXHRcdF1cblx0XHQ6IFtcblx0XHRcdEFyY2hpdmVTZWN0aW9uQWN0aW9uLFxuXHRcdFx0QXJjaGl2ZVNlc3Npb25zSW5Hcm91cEFjdGlvbixcblx0XHRcdEFyY2hpdmVTZXNzaW9uQWN0aW9uLFxuXHRcdFx0VW5hcmNoaXZlU2Vzc2lvbkFjdGlvbixcblx0XHRcdFVuYXJjaGl2ZUFjdGl2ZVNlc3Npb25BY3Rpb24sXG5cdFx0XTtcbn1cblxuY2xhc3MgU2Vzc2lvbnNBcmNoaXZlQWN0aW9uc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnNBcmNoaXZlQWN0aW9ucyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25SZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aW9uUmVnaXN0cmF0aW9ucy5jbGVhcigpO1xuXHRcdGNvbnN0IHdvcmRpbmcgPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGdldFNlc3Npb25zQXJjaGl2ZUFjdGlvbkNvbnN0cnVjdG9ycyh3b3JkaW5nKSkge1xuXHRcdFx0dGhpcy5hY3Rpb25SZWdpc3RyYXRpb25zLmFkZChyZWdpc3RlckFjdGlvbjIoYWN0aW9uKSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihTZXNzaW9uc0FyY2hpdmVBY3Rpb25zQ29udHJpYnV0aW9uLklELCBTZXNzaW9uc0FyY2hpdmVBY3Rpb25zQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTWFuYWdlQXV0b21hdGlvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXcubWFuYWdlQXV0b21hdGlvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFuYWdlQXV0b21hdGlvbnMnLCBcIk1hbmFnZSBBdXRvbWF0aW9uc1wiKSxcblx0XHRcdG1lbnU6IFtdXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDdXN0b21WaWV3U2VydmljZSkuc2hvd0N1c3RvbVZpZXcoQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQpO1xuXHR9XG59KTtcblxuY29uc3QgTUFSS19BTExfQVVUT01BVElPTl9SVU5TX1JFQURfQ09NTUFORF9JRCA9ICdzZXNzaW9uc1ZpZXcubWFya0FsbEF1dG9tYXRpb25SdW5zUmVhZCc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBNYXJrQWxsQXV0b21hdGlvblJ1bnNSZWFkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNQVJLX0FMTF9BVVRPTUFUSU9OX1JVTlNfUkVBRF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya0FsbEF1dG9tYXRpb25SdW5zUmVhZCcsIFwiTWFyayBBbGwgYXMgUmVhZFwiKSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0b21hdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcnVucyA9IGF1dG9tYXRpb25TZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb24+KCk7XG5cdFx0Zm9yIChjb25zdCBydW4gb2YgcnVucykge1xuXHRcdFx0aWYgKChydW4uc3RhdHVzID09PSAnY29tcGxldGVkJyB8fCBydW4uc3RhdHVzID09PSAnZmFpbGVkJykgJiYgcnVuLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKFVSSS5wYXJzZShydW4uc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRcdGlmIChzZXNzaW9uICYmICFzZXNzaW9uLmlzUmVhZC5nZXQoKSkge1xuXHRcdFx0XHRcdHNlc3Npb25zLnNldChzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UubWFya0FsbFJlYWQoWy4uLnNlc3Npb25zLnZhbHVlcygpXSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsVUFBVSxhQUFhO0FBQ2hDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDBCQUEwQjtBQUNu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SyxvQkFBb0IsTUFBTTtBQUMvQixVQUFNLFVBQVUsbUNBQW1DLEtBQUssb0JBQW9CO0FBQzVFLGVBQVcsVUFBVSxxQ0FBcUMsT0FBTyxHQUFHO0FBQ25FLFdBQUssb0JBQW9CLElBQUksZ0JBQWdCLE1BQU0sQ0FBQztBQUFBLElBQ3JEO0FBQUEsRUFDRDtBQUNEO0FBekJNLG1DQUVXLEtBQUs7QUFGaEIscUNBQU47QUFBQSxFQU9HO0FBQUEsR0FQRztBQTJCTiwrQkFBK0IsbUNBQW1DLElBQUksb0NBQW9DLGVBQWUsWUFBWTtBQUVySSxnQkFBZ0IsTUFBTSxnQ0FBZ0MsUUFBUTtBQUFBLEVBQzdELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUscUJBQXFCLG9CQUFvQjtBQUFBLE1BQzFELE1BQU0sQ0FBQztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUNTLElBQUksVUFBa0M7QUFDOUMsYUFBUyxJQUFJLGtCQUFrQixFQUFFLGVBQWUsMEJBQTBCO0FBQUEsRUFDM0U7QUFDRCxDQUFDO0FBRUQsTUFBTSwyQ0FBMkM7QUFFakQsZ0JBQWdCLE1BQU0sd0NBQXdDLFFBQVE7QUFBQSxFQUNyRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLDZCQUE2QixrQkFBa0I7QUFBQSxJQUNqRSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBZSxJQUFJLFVBQTJDO0FBQzdELFVBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFDekQsVUFBTSw0QkFBNEIsU0FBUyxJQUFJLDBCQUEwQjtBQUV6RSxVQUFNLE9BQU8sa0JBQWtCLEtBQUssSUFBSTtBQUN4QyxVQUFNLFdBQVcsb0JBQUksSUFBc0I7QUFDM0MsZUFBVyxPQUFPLE1BQU07QUFDdkIsV0FBSyxJQUFJLFdBQVcsZUFBZSxJQUFJLFdBQVcsYUFBYSxJQUFJLGlCQUFpQjtBQUNuRixjQUFNLFVBQVUsMEJBQTBCLFdBQVcsSUFBSSxNQUFNLElBQUksZUFBZSxDQUFDO0FBQ25GLFlBQUksV0FBVyxDQUFDLFFBQVEsT0FBTyxJQUFJLEdBQUc7QUFDckMsbUJBQVMsSUFBSSxRQUFRLFNBQVMsU0FBUyxHQUFHLE9BQU87QUFBQSxRQUNsRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSwwQkFBMEIsWUFBWSxDQUFDLEdBQUcsU0FBUyxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ25FO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
