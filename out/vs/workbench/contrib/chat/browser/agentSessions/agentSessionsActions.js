import { localize, localize2 } from "../../../../../nls.js";
import { AgentSessionSection, isAgentHostAgentSessionItem, isAgentSessionSection, isLocalAgentSessionItem, isMarshalledAgentSessionContext } from "./agentSessionsModel.js";
import { Action2, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID, AgentSessionProviders, AgentSessionsViewerOrientation } from "./agentSessions.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { ChatContextKeyExprs, ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
import { ChatViewId, IChatWidgetService } from "../chat.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { IWorkbenchLayoutService, Position } from "../../../../services/layout/browser/layoutService.js";
import { IAgentSessionsService } from "./agentSessionsService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ChatEditorInput, showClearEditingSessionConfirmation } from "../widgetHosts/editor/chatEditorInput.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../common/constants.js";
import { ACTION_ID_NEW_CHAT } from "../actions/chatActions.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { AgentSessionsPicker } from "./agentSessionsPicker.js";
import { ActiveEditorContext, IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IPaneCompositePartService } from "../../../../services/panecomposite/browser/panecomposite.js";
import { ChatSessionArchiveActionWording, getChatSessionArchiveActionPresentation } from "../../../../../platform/chat/common/sessionArchiveActions.js";
const AGENT_SESSIONS_CATEGORY = localize2("chatSessions", "Chat Agent Sessions");
class ToggleShowAgentSessionsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.toggleShowAgentSessions",
      title: localize2("chat.showSessions", "Show Sessions"),
      toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
      menu: {
        id: MenuId.ChatWelcomeContext,
        group: "0_sessions",
        order: 2,
        when: ChatContextKeys.inChatEditor.negate()
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentValue = configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled);
    await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, !currentValue);
  }
}
const agentSessionsOrientationSubmenu = new MenuId("chatAgentSessionsOrientationSubmenu");
MenuRegistry.appendMenuItem(MenuId.ChatWelcomeContext, {
  submenu: agentSessionsOrientationSubmenu,
  title: localize2("chat.sessionsOrientation", "Sessions Orientation"),
  group: "0_sessions",
  order: 1,
  when: ChatContextKeys.inChatEditor.negate()
});
class SetAgentSessionsOrientationStackedAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.setAgentSessionsOrientationStacked",
      title: localize2("chat.sessionsOrientation.stacked", "Stacked"),
      toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsOrientation}`, "stacked"),
      precondition: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
      menu: {
        id: agentSessionsOrientationSubmenu,
        group: "navigation",
        order: 2
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(HideAgentSessionsSidebar.ID);
  }
}
class SetAgentSessionsOrientationSideBySideAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.setAgentSessionsOrientationSideBySide",
      title: localize2("chat.sessionsOrientation.sideBySide", "Side by Side"),
      toggled: ContextKeyExpr.notEquals(`config.${ChatConfiguration.ChatViewSessionsOrientation}`, "stacked"),
      precondition: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
      menu: {
        id: agentSessionsOrientationSubmenu,
        group: "navigation",
        order: 1
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
  }
}
class PickAgentSessionAction extends Action2 {
  constructor() {
    super({
      id: `workbench.action.chat.history`,
      title: localize2("agentSessions.open", "Open Agent Session..."),
      menu: [
        {
          id: MenuId.ViewTitle,
          when: ContextKeyExpr.and(
            ContextKeyExpr.equals("view", ChatViewId),
            ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, false)
          ),
          group: "navigation",
          order: 2
        },
        {
          id: MenuId.EditorTitle,
          when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID)
        }
      ],
      category: AGENT_SESSIONS_CATEGORY,
      icon: Codicon.history,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker, void 0, void 0);
    await agentSessionsPicker.pickAgentSession();
  }
}
class BaseArchiveAllAgentSessionsAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "workbench.action.chat.archiveAllAgentSessions",
      title: action.title,
      icon: action.icon,
      precondition: ChatContextKeys.enabled,
      category: AGENT_SESSIONS_CATEGORY,
      f1: true
    });
    this.wording = wording;
  }
  async run(accessor) {
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const dialogService = accessor.get(IDialogService);
    const sessionsToArchive = agentSessionsService.model.sessions.filter((session) => !session.isArchived());
    if (sessionsToArchive.length === 0) {
      return;
    }
    const confirmed = await dialogService.confirm({
      message: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? sessionsToArchive.length === 1 ? localize("markAllSessionsDone.confirmSingle", "Are you sure you want to mark 1 agent session as done?") : localize("markAllSessionsDone.confirm", "Are you sure you want to mark {0} agent sessions as done?", sessionsToArchive.length) : sessionsToArchive.length === 1 ? localize("archiveAllSessions.confirmSingle", "Are you sure you want to archive 1 agent session?") : localize("archiveAllSessions.confirm", "Are you sure you want to archive {0} agent sessions?", sessionsToArchive.length),
      detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markAllSessionsDone.detail", "You can restore sessions later if needed from the sessions view.") : localize("archiveAllSessions.detail", "You can unarchive sessions later if needed from the sessions view."),
      primaryButton: getChatSessionArchiveActionPresentation(this.wording).archiveAll.title.value
    });
    if (!confirmed.confirmed) {
      return;
    }
    for (const session of sessionsToArchive) {
      session.setArchived(true);
    }
  }
}
class ArchiveAllAgentSessionsAction extends BaseArchiveAllAgentSessionsAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAllAgentSessionsDoneAction extends BaseArchiveAllAgentSessionsAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class MarkAllAgentSessionsReadAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.markAllAgentSessionsRead",
      title: localize2("markAllRead.label", "Mark All as Read"),
      precondition: ChatContextKeys.enabled,
      category: AGENT_SESSIONS_CATEGORY,
      f1: true,
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "0_read",
        order: 2,
        when: ChatContextKeys.isArchivedAgentSession.negate()
        // no read state for archived sessions
      }
    });
  }
  async run(accessor) {
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const sessionsToMarkRead = agentSessionsService.model.sessions.filter((session) => !session.isArchived() && !session.isRead());
    if (sessionsToMarkRead.length === 0) {
      return;
    }
    for (const session of sessionsToMarkRead) {
      session.setRead(true);
    }
  }
}
const ConfirmArchiveStorageKey = "chat.sessions.confirmArchive";
class BaseArchiveAgentSessionSectionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "agentSessionSection.archive",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: MenuId.AgentSessionSectionToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.agentSessionSection.notEqualsTo(AgentSessionSection.Archived)
      }, {
        id: MenuId.AgentSessionSectionContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.agentSessionSection.notEqualsTo(AgentSessionSection.Archived)
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !isAgentSessionSection(context)) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
    if (!skipConfirmation) {
      const confirmed = await dialogService.confirm({
        message: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? context.sessions.length === 1 ? localize("markSectionSessionsDone.confirmSingle", "Are you sure you want to mark 1 agent session from '{0}' as done?", context.label) : localize("markSectionSessionsDone.confirm", "Are you sure you want to mark {0} agent sessions from '{1}' as done?", context.sessions.length, context.label) : context.sessions.length === 1 ? localize("archiveSectionSessions.confirmSingle", "Are you sure you want to archive 1 agent session from '{0}'?", context.label) : localize("archiveSectionSessions.confirm", "Are you sure you want to archive {0} agent sessions from '{1}'?", context.sessions.length, context.label),
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
      session.setArchived(true);
    }
  }
}
class ArchiveAgentSessionSectionAction extends BaseArchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAgentSessionSectionDoneAction extends BaseArchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class BaseUnarchiveAgentSessionSectionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchiveAll;
    super({
      id: "agentSessionSection.unarchive",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: MenuId.AgentSessionSectionToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.agentSessionSection.isEqualTo(AgentSessionSection.Archived)
      }, {
        id: MenuId.AgentSessionSectionContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.agentSessionSection.isEqualTo(AgentSessionSection.Archived)
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !isAgentSessionSection(context)) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    if (context.sessions.length > 1) {
      const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
      if (!skipConfirmation) {
        const confirmed = await dialogService.confirm({
          message: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("restoreSectionSessions.confirm", "Are you sure you want to restore {0} agent sessions?", context.sessions.length) : localize("unarchiveSectionSessions.confirm", "Are you sure you want to unarchive {0} agent sessions?", context.sessions.length),
          primaryButton: getChatSessionArchiveActionPresentation(this.wording).unarchiveAll.title.value,
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
    }
    for (const session of context.sessions) {
      session.setArchived(false);
    }
  }
}
class UnarchiveAgentSessionSectionAction extends BaseUnarchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreAgentSessionSectionAction extends BaseUnarchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class MarkAgentSessionSectionReadAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionSection.markRead",
      title: localize2("markSectionRead", "Mark All as Read"),
      menu: [{
        id: MenuId.AgentSessionSectionContext,
        group: "1_edit",
        order: 1,
        when: ChatContextKeys.agentSessionSection.notEqualsTo(AgentSessionSection.Archived)
      }]
    });
  }
  async run(accessor, context) {
    if (!context || !isAgentSessionSection(context)) {
      return;
    }
    for (const session of context.sessions) {
      session.setRead(true);
    }
  }
}
class CollapseAllAgentSessionSectionsAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionSection.collapseAll",
      title: localize2("collapseAll", "Collapse All"),
      menu: [{
        id: MenuId.AgentSessionSectionContext,
        group: "2_collapse",
        order: 1
      }]
    });
  }
  async run(accessor, _section, control) {
    control?.collapseAllSections();
  }
}
class BaseAgentSessionAction extends Action2 {
  async run(accessor, context) {
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const viewsService = accessor.get(IViewsService);
    let sessions = [];
    if (isMarshalledAgentSessionContext(context)) {
      sessions = coalesce((context.sessions ?? [context.session]).map((session) => agentSessionsService.getSession(session.resource)));
    } else if (context) {
      sessions = [context];
    }
    if (sessions.length === 0) {
      const chatView = viewsService.getActiveViewWithId(ChatViewId);
      const focused = chatView?.getFocusedSessions().at(0);
      if (focused) {
        sessions = [focused];
      }
    }
    if (sessions.length > 0) {
      await this.runWithSessions(sessions, accessor);
    }
  }
}
class MarkAgentSessionUnreadAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.markUnread",
      title: localize2("markUnread", "Mark as Unread"),
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "0_read",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isReadAgentSession,
          ChatContextKeys.isArchivedAgentSession.negate()
          // no read state for archived sessions
        )
      }
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setRead(false);
    }
  }
}
class MarkAgentSessionReadAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.markRead",
      title: localize2("markRead", "Mark as Read"),
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "0_read",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isReadAgentSession.negate(),
          ChatContextKeys.isArchivedAgentSession.negate()
          // no read state for archived sessions
        )
      }
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setRead(true);
    }
  }
}
class BaseArchiveAgentSessionAction extends BaseAgentSessionAction {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archive;
    super({
      id: "agentSession.archive",
      title: action.title,
      icon: action.icon,
      keybinding: {
        primary: KeyCode.Delete,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.agentSessionsViewerFocused,
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      },
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.isArchivedAgentSession.negate()
      }, {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.isArchivedAgentSession.negate()
      }]
    });
    this.wording = wording;
  }
  async runWithSessions(sessions, accessor) {
    const chatService = accessor.get(IChatService);
    const dialogService = accessor.get(IDialogService);
    for (const session of sessions) {
      const chatModel = chatService.getSession(session.resource);
      if (chatModel && !await showClearEditingSessionConfirmation(chatModel, dialogService, {
        isArchiveAction: true,
        titleOverride: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSessionDone", "Mark chat as done with pending edits?") : localize("archiveSession", "Archive chat with pending edits?"),
        messageOverride: localize("archiveSessionDescription", "You have pending changes in this chat session.")
      })) {
        return;
      }
      session.setArchived(true);
    }
  }
}
class ArchiveAgentSessionAction extends BaseArchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAgentSessionDoneAction extends BaseArchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class BaseUnarchiveAgentSessionAction extends BaseAgentSessionAction {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchive;
    super({
      id: "agentSession.unarchive",
      title: action.title,
      icon: action.icon,
      keybinding: {
        primary: KeyMod.Shift | KeyCode.Delete,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backspace
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.agentSessionsViewerFocused,
          ChatContextKeys.isArchivedAgentSession
        )
      },
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.isArchivedAgentSession
      }, {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.isArchivedAgentSession
      }]
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setArchived(false);
    }
  }
}
class UnarchiveAgentSessionAction extends BaseUnarchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreAgentSessionAction extends BaseUnarchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
function getAgentSessionArchiveActionConstructors(wording) {
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? [
    MarkAllAgentSessionsDoneAction,
    MarkAgentSessionSectionDoneAction,
    RestoreAgentSessionSectionAction,
    MarkAgentSessionDoneAction,
    RestoreAgentSessionAction
  ] : [
    ArchiveAllAgentSessionsAction,
    ArchiveAgentSessionSectionAction,
    UnarchiveAgentSessionSectionAction,
    ArchiveAgentSessionAction,
    UnarchiveAgentSessionAction
  ];
}
class PinAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.pin",
      title: localize2("pin", "Pin"),
      icon: Codicon.pin,
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession.negate(),
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }, {
        id: MenuId.AgentSessionsContext,
        group: "0_pin",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession.negate(),
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }]
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setPinned(true);
    }
  }
}
class UnpinAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.unpin",
      title: localize2("unpin", "Unpin"),
      icon: Codicon.pinned,
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession,
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }, {
        id: MenuId.AgentSessionsContext,
        group: "0_pin",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession,
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }]
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setPinned(false);
    }
  }
}
const renameSupportedSessionTypes = ContextKeyExpr.or(
  ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local),
  ChatContextKeyExprs.isAgentHostSessionItem
);
class RenameAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: AGENT_SESSION_RENAME_ACTION_ID,
      title: localize2("rename", "Rename..."),
      precondition: ChatContextKeys.hasMultipleAgentSessionsSelected.negate(),
      keybinding: {
        primary: KeyCode.F2,
        mac: {
          primary: KeyCode.Enter
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.agentSessionsViewerFocused,
          renameSupportedSessionTypes
        )
      },
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 3,
        when: renameSupportedSessionTypes
      }
    });
  }
  async runWithSessions(sessions, accessor) {
    const session = sessions.at(0);
    if (!session) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const chatService = accessor.get(IChatService);
    const chatSessionsService = accessor.get(IChatSessionsService);
    const title = await quickInputService.input({ prompt: localize("newChatTitle", "New agent session title"), value: session.label });
    if (title) {
      if (isAgentHostAgentSessionItem(session)) {
        await chatSessionsService.renameChatSession(session.resource, title, CancellationToken.None);
      } else {
        chatService.setChatSessionTitle(session.resource, title);
      }
    }
  }
}
class DeleteAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: AGENT_SESSION_DELETE_ACTION_ID,
      title: localize2("delete", "Delete..."),
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 4,
        when: ContextKeyExpr.or(
          ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local),
          ChatContextKeyExprs.isAgentHostSessionItem
        )
      }
    });
  }
  async runWithSessions(sessions, accessor) {
    if (sessions.length === 0) {
      return;
    }
    const chatService = accessor.get(IChatService);
    const chatSessionsService = accessor.get(IChatSessionsService);
    const dialogService = accessor.get(IDialogService);
    const widgetService = accessor.get(IChatWidgetService);
    const commandService = accessor.get(ICommandService);
    const confirmed = await dialogService.confirm({
      message: sessions.length === 1 ? localize("deleteSession.confirm", "Are you sure you want to delete this chat session?") : localize("deleteSessions.confirm", "Are you sure you want to delete {0} chat sessions?", sessions.length),
      detail: localize("deleteSession.detail", "This action cannot be undone."),
      primaryButton: localize("deleteSession.delete", "Delete")
    });
    if (!confirmed.confirmed) {
      return;
    }
    const deletedSessionIds = [];
    for (const session of sessions) {
      if (isLocalAgentSessionItem(session)) {
        await widgetService.getWidgetBySessionResource(session.resource)?.clear();
        await chatService.removeHistoryEntry(session.resource);
        const sessionId = LocalChatSessionUri.parseLocalSessionId(session.resource);
        if (sessionId) {
          deletedSessionIds.push(sessionId);
        }
      } else if (isAgentHostAgentSessionItem(session)) {
        try {
          await chatSessionsService.deleteChatSessionItem(session.resource, CancellationToken.None);
          await widgetService.getWidgetBySessionResource(session.resource)?.clear();
        } catch (err) {
          dialogService.error(localize("deleteSession.error", "Failed to delete chat session: {0}", toErrorMessage(err)));
        }
      }
    }
    if (deletedSessionIds.length > 0) {
      commandService.executeCommand("github.copilot.sessionSync.deleteSessionFromCloud", deletedSessionIds).catch(() => {
      });
    }
  }
}
class DeleteAllLocalSessionsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.clearHistory",
      title: localize2("agentSessions.deleteAll", "Delete All Local Workspace Chat Sessions"),
      precondition: ChatContextKeys.enabled,
      category: AGENT_SESSIONS_CATEGORY,
      f1: true
    });
  }
  async run(accessor, ...args) {
    const chatService = accessor.get(IChatService);
    const widgetService = accessor.get(IChatWidgetService);
    const dialogService = accessor.get(IDialogService);
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const localSessionsCount = agentSessionsService.model.sessions.filter((session) => isLocalAgentSessionItem(session)).length;
    if (localSessionsCount === 0) {
      return;
    }
    const confirmed = await dialogService.confirm({
      message: localSessionsCount === 1 ? localize("deleteAllChats.confirmSingle", "Are you sure you want to delete 1 local workspace chat session?") : localize("deleteAllChats.confirm", "Are you sure you want to delete {0} local workspace chat sessions?", localSessionsCount),
      detail: localize("deleteAllChats.detail", "This action cannot be undone."),
      primaryButton: localize("deleteAllChats.button", "Delete All")
    });
    if (!confirmed.confirmed) {
      return;
    }
    await Promise.all(widgetService.getAllWidgets().map((widget) => widget.clear()));
    await chatService.clearAllHistoryEntries();
  }
}
class BaseOpenAgentSessionAction extends BaseAgentSessionAction {
  async runWithSessions(sessions, accessor) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const targetGroup = this.getTargetGroup();
    for (const session of sessions) {
      const uri = session.resource;
      await chatWidgetService.openSession(uri, targetGroup, {
        ...this.getOptions(),
        pinned: true
      });
    }
  }
}
const _OpenAgentSessionInEditorGroupAction = class _OpenAgentSessionInEditorGroupAction extends BaseOpenAgentSessionAction {
  constructor() {
    super({
      id: _OpenAgentSessionInEditorGroupAction.id,
      title: localize2("chat.openSessionInEditorGroup.label", "Open as Editor"),
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Enter
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, IsSessionsWindowContext.negate())
      },
      menu: {
        id: MenuId.AgentSessionsContext,
        when: IsSessionsWindowContext.negate(),
        order: 1,
        group: "navigation"
      }
    });
  }
  getTargetGroup() {
    return ACTIVE_GROUP;
  }
  getOptions() {
    return {};
  }
};
_OpenAgentSessionInEditorGroupAction.id = "workbench.action.chat.openSessionInEditorGroup";
let OpenAgentSessionInEditorGroupAction = _OpenAgentSessionInEditorGroupAction;
const _OpenAgentSessionInNewEditorGroupAction = class _OpenAgentSessionInNewEditorGroupAction extends BaseOpenAgentSessionAction {
  constructor() {
    super({
      id: _OpenAgentSessionInNewEditorGroupAction.id,
      title: localize2("chat.openSessionInNewEditorGroup.label", "Open to the Side"),
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Enter
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, IsSessionsWindowContext.negate())
      },
      menu: {
        id: MenuId.AgentSessionsContext,
        when: IsSessionsWindowContext.negate(),
        order: 2,
        group: "navigation"
      }
    });
  }
  getTargetGroup() {
    return SIDE_GROUP;
  }
  getOptions() {
    return {};
  }
};
_OpenAgentSessionInNewEditorGroupAction.id = "workbench.action.chat.openSessionInNewEditorGroup";
let OpenAgentSessionInNewEditorGroupAction = _OpenAgentSessionInNewEditorGroupAction;
const _OpenAgentSessionInNewWindowAction = class _OpenAgentSessionInNewWindowAction extends BaseOpenAgentSessionAction {
  constructor() {
    super({
      id: _OpenAgentSessionInNewWindowAction.id,
      title: localize2("chat.openSessionInNewWindow.label", "Open in New Window"),
      menu: {
        id: MenuId.AgentSessionsContext,
        order: 3,
        group: "navigation"
      }
    });
  }
  getTargetGroup() {
    return AUX_WINDOW_GROUP;
  }
  getOptions() {
    return {
      auxiliary: { compact: true, bounds: { width: 800, height: 640 } }
    };
  }
};
_OpenAgentSessionInNewWindowAction.id = "workbench.action.chat.openSessionInNewWindow";
let OpenAgentSessionInNewWindowAction = _OpenAgentSessionInNewWindowAction;
class RefreshAgentSessionsViewerAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionsViewer.refresh",
      title: localize2("refresh", "Refresh Agent Sessions"),
      icon: Codicon.refresh,
      menu: {
        id: MenuId.AgentSessionsToolbar,
        group: "navigation",
        order: 1
      }
    });
  }
  run(accessor, agentSessionsControl) {
    const control = agentSessionsControl ?? accessor.get(IViewsService).getActiveViewWithId(ChatViewId)?.agentSessionsControl;
    if (control) {
      control.refresh();
    } else {
      accessor.get(ICommandService).executeCommand("sessionsViewPane.refresh");
    }
  }
}
class FindAgentSessionInViewerAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionsViewer.find",
      title: localize2("find", "Find Agent Session"),
      icon: Codicon.search,
      menu: {
        id: MenuId.AgentSessionsToolbar,
        group: "navigation",
        order: 2
      }
    });
  }
  run(accessor, agentSessionsControl) {
    const control = agentSessionsControl ?? accessor.get(IViewsService).getActiveViewWithId(ChatViewId)?.agentSessionsControl;
    if (control) {
      return control.openFind();
    } else {
      return accessor.get(ICommandService).executeCommand("sessionsViewPane.find");
    }
  }
}
class UpdateChatViewWidthAction extends Action2 {
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const configurationService = accessor.get(IConfigurationService);
    const viewsService = accessor.get(IViewsService);
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
    if (typeof chatLocation !== "number") {
      return;
    }
    const panelPosition = layoutService.getPanelPosition();
    const canResizeView = chatLocation !== ViewContainerLocation.Panel || (panelPosition === Position.LEFT || panelPosition === Position.RIGHT);
    const chatViewSessionsEnabled = configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled);
    if (!chatViewSessionsEnabled) {
      await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, true);
    }
    let chatView = viewsService.getActiveViewWithId(ChatViewId);
    if (!chatView) {
      chatView = await viewsService.openView(ChatViewId, false);
    }
    if (!chatView) {
      return;
    }
    const configuredOrientation = configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
    let validatedConfiguredOrientation;
    if (configuredOrientation === "stacked" || configuredOrientation === "sideBySide") {
      validatedConfiguredOrientation = configuredOrientation;
    } else {
      validatedConfiguredOrientation = "sideBySide";
    }
    const newOrientation = this.getOrientation();
    const lastWidthForOrientation = chatView?.getLastDimensions(newOrientation)?.width;
    if ((!canResizeView || validatedConfiguredOrientation === "sideBySide") && newOrientation === AgentSessionsViewerOrientation.Stacked) {
      chatView.updateConfiguredSessionsViewerOrientation("stacked");
    } else if ((!canResizeView || validatedConfiguredOrientation === "stacked") && newOrientation === AgentSessionsViewerOrientation.SideBySide) {
      chatView.updateConfiguredSessionsViewerOrientation("sideBySide");
    }
    if (!canResizeView) {
      return;
    }
    const part = paneCompositeService.getPartId(chatLocation);
    let currentSize = layoutService.getSize(part);
    const chatViewDefaultWidth = 300;
    const sessionsViewDefaultWidth = chatViewDefaultWidth;
    const sideBySideMinWidth = chatViewDefaultWidth + sessionsViewDefaultWidth + 1;
    if (newOrientation === AgentSessionsViewerOrientation.SideBySide && currentSize.width >= sideBySideMinWidth || // already wide enough to show side by side
    newOrientation === AgentSessionsViewerOrientation.Stacked && chatLocation === ViewContainerLocation.AuxiliaryBar && layoutService.isAuxiliaryBarMaximized()) {
      return;
    }
    if (chatLocation === ViewContainerLocation.AuxiliaryBar) {
      layoutService.setAuxiliaryBarMaximized(false);
      currentSize = layoutService.getSize(part);
    }
    let newWidth;
    if (newOrientation === AgentSessionsViewerOrientation.SideBySide) {
      newWidth = Math.max(sideBySideMinWidth, lastWidthForOrientation || Math.round(layoutService.mainContainerDimension.width / 2));
    } else {
      newWidth = lastWidthForOrientation || Math.max(chatViewDefaultWidth, currentSize.width - sessionsViewDefaultWidth);
    }
    layoutService.setSize(part, { width: newWidth, height: currentSize.height });
    const actualSize = layoutService.getSize(part);
    if (chatLocation === ViewContainerLocation.AuxiliaryBar && // only applicable for auxiliary bar
    newOrientation === AgentSessionsViewerOrientation.SideBySide && // only applicable when going to side by side
    actualSize.width < sideBySideMinWidth) {
      layoutService.setAuxiliaryBarMaximized(true);
    }
  }
}
const _ShowAgentSessionsSidebar = class _ShowAgentSessionsSidebar extends UpdateChatViewWidthAction {
  constructor() {
    super({
      id: _ShowAgentSessionsSidebar.ID,
      title: _ShowAgentSessionsSidebar.TITLE,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked)
      ),
      f1: true,
      category: AGENT_SESSIONS_CATEGORY
    });
  }
  getOrientation() {
    return AgentSessionsViewerOrientation.SideBySide;
  }
};
_ShowAgentSessionsSidebar.ID = "agentSessions.showAgentSessionsSidebar";
_ShowAgentSessionsSidebar.TITLE = localize2("showAgentSessionsSidebar", "Show Agent Sessions Sidebar");
let ShowAgentSessionsSidebar = _ShowAgentSessionsSidebar;
const _HideAgentSessionsSidebar = class _HideAgentSessionsSidebar extends UpdateChatViewWidthAction {
  constructor() {
    super({
      id: _HideAgentSessionsSidebar.ID,
      title: _HideAgentSessionsSidebar.TITLE,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide)
      ),
      f1: true,
      category: AGENT_SESSIONS_CATEGORY
    });
  }
  getOrientation() {
    return AgentSessionsViewerOrientation.Stacked;
  }
};
_HideAgentSessionsSidebar.ID = "agentSessions.hideAgentSessionsSidebar";
_HideAgentSessionsSidebar.TITLE = localize2("hideAgentSessionsSidebar", "Hide Agent Sessions Sidebar");
let HideAgentSessionsSidebar = _HideAgentSessionsSidebar;
const _ToggleAgentSessionsSidebar = class _ToggleAgentSessionsSidebar extends Action2 {
  constructor() {
    super({
      id: _ToggleAgentSessionsSidebar.ID,
      title: _ToggleAgentSessionsSidebar.TITLE,
      precondition: ChatContextKeys.enabled,
      f1: true,
      category: AGENT_SESSIONS_CATEGORY
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    const viewsService = accessor.get(IViewsService);
    const chatView = viewsService.getActiveViewWithId(ChatViewId);
    const currentOrientation = chatView?.getSessionsViewerOrientation();
    if (currentOrientation === AgentSessionsViewerOrientation.SideBySide) {
      await commandService.executeCommand(HideAgentSessionsSidebar.ID);
    } else {
      await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
    }
  }
};
_ToggleAgentSessionsSidebar.ID = "agentSessions.toggleAgentSessionsSidebar";
_ToggleAgentSessionsSidebar.TITLE = localize2("toggleAgentSessionsSidebar", "Toggle Agent Sessions Sidebar");
let ToggleAgentSessionsSidebar = _ToggleAgentSessionsSidebar;
const _FocusAgentSessionsAction = class _FocusAgentSessionsAction extends Action2 {
  constructor() {
    super({
      id: _FocusAgentSessionsAction.id,
      title: localize2("chat.focusAgentSessionsViewer.label", "Focus Agent Sessions"),
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true)
      ),
      category: AGENT_SESSIONS_CATEGORY,
      f1: true
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const configurationService = accessor.get(IConfigurationService);
    const commandService = accessor.get(ICommandService);
    const chatView = await viewsService.openView(ChatViewId, true);
    const focused = chatView?.focusSessions();
    if (focused) {
      return;
    }
    const configuredSessionsViewerOrientation = configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
    if (configuredSessionsViewerOrientation === "stacked") {
      await commandService.executeCommand(ACTION_ID_NEW_CHAT);
    } else {
      await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
    }
    chatView?.focusSessions();
  }
};
_FocusAgentSessionsAction.id = "workbench.action.chat.focusAgentSessionsViewer";
let FocusAgentSessionsAction = _FocusAgentSessionsAction;
export {
  ArchiveAgentSessionAction,
  ArchiveAgentSessionSectionAction,
  ArchiveAllAgentSessionsAction,
  CollapseAllAgentSessionSectionsAction,
  DeleteAgentSessionAction,
  DeleteAllLocalSessionsAction,
  FindAgentSessionInViewerAction,
  FocusAgentSessionsAction,
  HideAgentSessionsSidebar,
  MarkAgentSessionDoneAction,
  MarkAgentSessionReadAction,
  MarkAgentSessionSectionDoneAction,
  MarkAgentSessionSectionReadAction,
  MarkAgentSessionUnreadAction,
  MarkAllAgentSessionsDoneAction,
  MarkAllAgentSessionsReadAction,
  OpenAgentSessionInEditorGroupAction,
  OpenAgentSessionInNewEditorGroupAction,
  OpenAgentSessionInNewWindowAction,
  PickAgentSessionAction,
  PinAgentSessionAction,
  RefreshAgentSessionsViewerAction,
  RenameAgentSessionAction,
  RestoreAgentSessionAction,
  RestoreAgentSessionSectionAction,
  SetAgentSessionsOrientationSideBySideAction,
  SetAgentSessionsOrientationStackedAction,
  ShowAgentSessionsSidebar,
  ToggleAgentSessionsSidebar,
  ToggleShowAgentSessionsAction,
  UnarchiveAgentSessionAction,
  UnarchiveAgentSessionSectionAction,
  UnpinAgentSessionAction,
  getAgentSessionArchiveActionConstructors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TZWN0aW9uLCBJQWdlbnRTZXNzaW9uLCBJQWdlbnRTZXNzaW9uU2VjdGlvbiwgSU1hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0LCBpc0FnZW50SG9zdEFnZW50U2Vzc2lvbkl0ZW0sIGlzQWdlbnRTZXNzaW9uU2VjdGlvbiwgaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0sIGlzTWFyc2hhbGxlZEFnZW50U2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFHRU5UX1NFU1NJT05fREVMRVRFX0FDVElPTl9JRCwgQUdFTlRfU0VTU0lPTl9SRU5BTUVfQUNUSU9OX0lELCBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiwgSUFnZW50U2Vzc2lvbnNDb250cm9sIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5RXhwcnMsIENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIEFVWF9XSU5ET1dfR1JPVVAsIFByZWZlcnJlZEdyb3VwLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4vYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCwgc2hvd0NsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb24gfSBmcm9tICcuLi93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fSURfTkVXX0NIQVQgfSBmcm9tICcuLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRWaWV3UGFuZSB9IGZyb20gJy4uL3dpZGdldEhvc3RzL3ZpZXdQYW5lL2NoYXRWaWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zUGlja2VyIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zUGlja2VyLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckNvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLCBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jaGF0L2NvbW1vbi9zZXNzaW9uQXJjaGl2ZUFjdGlvbnMuanMnO1xuXG5jb25zdCBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSA9IGxvY2FsaXplMignY2hhdFNlc3Npb25zJywgXCJDaGF0IEFnZW50IFNlc3Npb25zXCIpO1xuXG4vLyNyZWdpb24gQ2hhdCBWaWV3XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVTaG93QWdlbnRTZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZVNob3dBZ2VudFNlc3Npb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc2hvd1Nlc3Npb25zJywgXCJTaG93IFNlc3Npb25zXCIpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZH1gLCB0cnVlKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0V2VsY29tZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMF9zZXNzaW9ucycsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0RWRpdG9yLm5lZ2F0ZSgpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCwgIWN1cnJlbnRWYWx1ZSk7XG5cdH1cbn1cblxuY29uc3QgYWdlbnRTZXNzaW9uc09yaWVudGF0aW9uU3VibWVudSA9IG5ldyBNZW51SWQoJ2NoYXRBZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdWJtZW51Jyk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRXZWxjb21lQ29udGV4dCwge1xuXHRzdWJtZW51OiBhZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdWJtZW51LFxuXHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnNlc3Npb25zT3JpZW50YXRpb24nLCBcIlNlc3Npb25zIE9yaWVudGF0aW9uXCIpLFxuXHRncm91cDogJzBfc2Vzc2lvbnMnLFxuXHRvcmRlcjogMSxcblx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdEVkaXRvci5uZWdhdGUoKVxufSk7XG5cbmV4cG9ydCBjbGFzcyBTZXRBZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdGFja2VkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2V0QWdlbnRTZXNzaW9uc09yaWVudGF0aW9uU3RhY2tlZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnNlc3Npb25zT3JpZW50YXRpb24uc3RhY2tlZCcsIFwiU3RhY2tlZFwiKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc09yaWVudGF0aW9ufWAsICdzdGFja2VkJyksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWR9YCwgdHJ1ZSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBhZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdWJtZW51LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEhpZGVBZ2VudFNlc3Npb25zU2lkZWJhci5JRCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldEFnZW50U2Vzc2lvbnNPcmllbnRhdGlvblNpZGVCeVNpZGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zZXRBZ2VudFNlc3Npb25zT3JpZW50YXRpb25TaWRlQnlTaWRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc2Vzc2lvbnNPcmllbnRhdGlvbi5zaWRlQnlTaWRlJywgXCJTaWRlIGJ5IFNpZGVcIiksXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNPcmllbnRhdGlvbn1gLCAnc3RhY2tlZCcpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkfWAsIHRydWUpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogYWdlbnRTZXNzaW9uc09yaWVudGF0aW9uU3VibWVudSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTaG93QWdlbnRTZXNzaW9uc1NpZGViYXIuSUQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQaWNrQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQuaGlzdG9yeWAsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudFNlc3Npb25zLm9wZW4nLCBcIk9wZW4gQWdlbnQgU2Vzc2lvbi4uLlwiKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIENoYXRWaWV3SWQpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZH1gLCBmYWxzZSlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oQ2hhdEVkaXRvcklucHV0LkVkaXRvcklEKSxcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGNhdGVnb3J5OiBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uaGlzdG9yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNQaWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zUGlja2VyLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgYWdlbnRTZXNzaW9uc1BpY2tlci5waWNrQWdlbnRTZXNzaW9uKCk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZUFyY2hpdmVBbGxBZ2VudFNlc3Npb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKSB7XG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHdvcmRpbmcpLmFyY2hpdmVBbGw7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXJjaGl2ZUFsbEFnZW50U2Vzc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGNhdGVnb3J5OiBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBzZXNzaW9uc1RvQXJjaGl2ZSA9IGFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+ICFzZXNzaW9uLmlzQXJjaGl2ZWQoKSk7XG5cdFx0aWYgKHNlc3Npb25zVG9BcmNoaXZlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiB0aGlzLndvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0XHQ/IHNlc3Npb25zVG9BcmNoaXZlLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ21hcmtBbGxTZXNzaW9uc0RvbmUuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgMSBhZ2VudCBzZXNzaW9uIGFzIGRvbmU/XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbWFya0FsbFNlc3Npb25zRG9uZS5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gbWFyayB7MH0gYWdlbnQgc2Vzc2lvbnMgYXMgZG9uZT9cIiwgc2Vzc2lvbnNUb0FyY2hpdmUubGVuZ3RoKVxuXHRcdFx0XHQ6IHNlc3Npb25zVG9BcmNoaXZlLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FyY2hpdmVBbGxTZXNzaW9ucy5jb25maXJtU2luZ2xlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYXJjaGl2ZSAxIGFnZW50IHNlc3Npb24/XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZUFsbFNlc3Npb25zLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBhcmNoaXZlIHswfSBhZ2VudCBzZXNzaW9ucz9cIiwgc2Vzc2lvbnNUb0FyY2hpdmUubGVuZ3RoKSxcblx0XHRcdGRldGFpbDogdGhpcy53b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnbWFya0FsbFNlc3Npb25zRG9uZS5kZXRhaWwnLCBcIllvdSBjYW4gcmVzdG9yZSBzZXNzaW9ucyBsYXRlciBpZiBuZWVkZWQgZnJvbSB0aGUgc2Vzc2lvbnMgdmlldy5cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZUFsbFNlc3Npb25zLmRldGFpbCcsIFwiWW91IGNhbiB1bmFyY2hpdmUgc2Vzc2lvbnMgbGF0ZXIgaWYgbmVlZGVkIGZyb20gdGhlIHNlc3Npb25zIHZpZXcuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHRoaXMud29yZGluZykuYXJjaGl2ZUFsbC50aXRsZS52YWx1ZVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zVG9BcmNoaXZlKSB7XG5cdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXJjaGl2ZUFsbEFnZW50U2Vzc2lvbnNBY3Rpb24gZXh0ZW5kcyBCYXNlQXJjaGl2ZUFsbEFnZW50U2Vzc2lvbnNBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLkFyY2hpdmUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrQWxsQWdlbnRTZXNzaW9uc0RvbmVBY3Rpb24gZXh0ZW5kcyBCYXNlQXJjaGl2ZUFsbEFnZW50U2Vzc2lvbnNBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrQWxsQWdlbnRTZXNzaW9uc1JlYWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYXJrQWxsQWdlbnRTZXNzaW9uc1JlYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya0FsbFJlYWQubGFiZWwnLCBcIk1hcmsgQWxsIGFzIFJlYWRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0Y2F0ZWdvcnk6IEFHRU5UX1NFU1NJT05TX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMF9yZWFkJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLm5lZ2F0ZSgpIC8vIG5vIHJlYWQgc3RhdGUgZm9yIGFyY2hpdmVkIHNlc3Npb25zXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zVG9NYXJrUmVhZCA9IGFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+ICFzZXNzaW9uLmlzQXJjaGl2ZWQoKSAmJiAhc2Vzc2lvbi5pc1JlYWQoKSk7XG5cdFx0aWYgKHNlc3Npb25zVG9NYXJrUmVhZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnNUb01hcmtSZWFkKSB7XG5cdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IENvbmZpcm1BcmNoaXZlU3RvcmFnZUtleSA9ICdjaGF0LnNlc3Npb25zLmNvbmZpcm1BcmNoaXZlJztcblxuYWJzdHJhY3QgY2xhc3MgQmFzZUFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKSB7XG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHdvcmRpbmcpLmFyY2hpdmVBbGw7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb25TZWN0aW9uLmFyY2hpdmUnLFxuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25TZWN0aW9uVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25TZWN0aW9uLm5vdEVxdWFsc1RvKEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvblNlY3Rpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uU2VjdGlvbi5ub3RFcXVhbHNUbyhBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJQWdlbnRTZXNzaW9uU2VjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghY29udGV4dCB8fCAhaXNBZ2VudFNlc3Npb25TZWN0aW9uKGNvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNraXBDb25maXJtYXRpb24gPSBzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKENvbmZpcm1BcmNoaXZlU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGZhbHNlKTtcblx0XHRpZiAoIXNraXBDb25maXJtYXRpb24pIHtcblx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdG1lc3NhZ2U6IHRoaXMud29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0XHRcdFx0PyBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbWFya1NlY3Rpb25TZXNzaW9uc0RvbmUuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgMSBhZ2VudCBzZXNzaW9uIGZyb20gJ3swfScgYXMgZG9uZT9cIiwgY29udGV4dC5sYWJlbClcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ21hcmtTZWN0aW9uU2Vzc2lvbnNEb25lLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtYXJrIHswfSBhZ2VudCBzZXNzaW9ucyBmcm9tICd7MX0nIGFzIGRvbmU/XCIsIGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoLCBjb250ZXh0LmxhYmVsKVxuXHRcdFx0XHRcdDogY29udGV4dC5zZXNzaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FyY2hpdmVTZWN0aW9uU2Vzc2lvbnMuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGFyY2hpdmUgMSBhZ2VudCBzZXNzaW9uIGZyb20gJ3swfSc/XCIsIGNvbnRleHQubGFiZWwpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlU2VjdGlvblNlc3Npb25zLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBhcmNoaXZlIHswfSBhZ2VudCBzZXNzaW9ucyBmcm9tICd7MX0nP1wiLCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCwgY29udGV4dC5sYWJlbCksXG5cdFx0XHRcdGRldGFpbDogdGhpcy53b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtYXJrU2VjdGlvblNlc3Npb25zRG9uZS5kZXRhaWwnLCBcIllvdSBjYW4gcmVzdG9yZSBzZXNzaW9ucyBsYXRlciBpZiBuZWVkZWQgZnJvbSB0aGUgc2Vzc2lvbnMgdmlldy5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlU2VjdGlvblNlc3Npb25zLmRldGFpbCcsIFwiWW91IGNhbiB1bmFyY2hpdmUgc2Vzc2lvbnMgbGF0ZXIgaWYgbmVlZGVkIGZyb20gdGhlIHNlc3Npb25zIHZpZXcuXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24odGhpcy53b3JkaW5nKS5hcmNoaXZlQWxsLnRpdGxlLnZhbHVlLFxuXHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZG9Ob3RBc2tBZ2FpbicsIFwiRG8gbm90IGFzayBtZSBhZ2FpblwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpcm1lZC5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY29udGV4dC5zZXNzaW9ucykge1xuXHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya0FnZW50U2Vzc2lvblNlY3Rpb25Eb25lQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlVW5hcmNoaXZlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS51bmFyY2hpdmVBbGw7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb25TZWN0aW9uLnVuYXJjaGl2ZScsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvblNlY3Rpb25Ub29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblNlY3Rpb24uaXNFcXVhbFRvKEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvblNlY3Rpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uU2VjdGlvbi5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUFnZW50U2Vzc2lvblNlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWNvbnRleHQgfHwgIWlzQWdlbnRTZXNzaW9uU2VjdGlvbihjb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cblx0XHRpZiAoY29udGV4dC5zZXNzaW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBza2lwQ29uZmlybWF0aW9uID0gc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDb25maXJtQXJjaGl2ZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBmYWxzZSk7XG5cdFx0XHRpZiAoIXNraXBDb25maXJtYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRtZXNzYWdlOiB0aGlzLndvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncmVzdG9yZVNlY3Rpb25TZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcmVzdG9yZSB7MH0gYWdlbnQgc2Vzc2lvbnM/XCIsIGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgndW5hcmNoaXZlU2VjdGlvblNlc3Npb25zLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byB1bmFyY2hpdmUgezB9IGFnZW50IHNlc3Npb25zP1wiLCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCksXG5cdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHRoaXMud29yZGluZykudW5hcmNoaXZlQWxsLnRpdGxlLnZhbHVlLFxuXHRcdFx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RvTm90QXNrQWdhaW4nLCBcIkRvIG5vdCBhc2sgbWUgYWdhaW5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb25maXJtZWQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjb250ZXh0LnNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKGZhbHNlKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVuYXJjaGl2ZUFnZW50U2Vzc2lvblNlY3Rpb25BY3Rpb24gZXh0ZW5kcyBCYXNlVW5hcmNoaXZlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuQXJjaGl2ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc3RvcmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uIGV4dGVuZHMgQmFzZVVuYXJjaGl2ZUFnZW50U2Vzc2lvblNlY3Rpb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrQWdlbnRTZXNzaW9uU2VjdGlvblJlYWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvblNlY3Rpb24ubWFya1JlYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya1NlY3Rpb25SZWFkJywgXCJNYXJrIEFsbCBhcyBSZWFkXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25TZWN0aW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblNlY3Rpb24ubm90RXF1YWxzVG8oQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUFnZW50U2Vzc2lvblNlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWNvbnRleHQgfHwgIWlzQWdlbnRTZXNzaW9uU2VjdGlvbihjb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjb250ZXh0LnNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2xsYXBzZUFsbEFnZW50U2Vzc2lvblNlY3Rpb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb25TZWN0aW9uLmNvbGxhcHNlQWxsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbGxhcHNlQWxsJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvblNlY3Rpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY29sbGFwc2UnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9zZWN0aW9uOiB1bmtub3duLCBjb250cm9sPzogSUFnZW50U2Vzc2lvbnNDb250cm9sKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29udHJvbD8uY29sbGFwc2VBbGxTZWN0aW9ucygpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2Vzc2lvbiBBY3Rpb25zXG5cbmFic3RyYWN0IGNsYXNzIEJhc2VBZ2VudFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJQWdlbnRTZXNzaW9uIHwgSU1hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cblx0XHRsZXQgc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdGlmIChpc01hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0KGNvbnRleHQpKSB7XG5cdFx0XHRzZXNzaW9ucyA9IGNvYWxlc2NlKChjb250ZXh0LnNlc3Npb25zID8/IFtjb250ZXh0LnNlc3Npb25dKS5tYXAoc2Vzc2lvbiA9PiBhZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpKSk7XG5cdFx0fSBlbHNlIGlmIChjb250ZXh0KSB7XG5cdFx0XHRzZXNzaW9ucyA9IFtjb250ZXh0XTtcblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb25zdCBjaGF0VmlldyA9IHZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkPENoYXRWaWV3UGFuZT4oQ2hhdFZpZXdJZCk7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gY2hhdFZpZXc/LmdldEZvY3VzZWRTZXNzaW9ucygpLmF0KDApO1xuXHRcdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdFx0c2Vzc2lvbnMgPSBbZm9jdXNlZF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGF3YWl0IHRoaXMucnVuV2l0aFNlc3Npb25zKHNlc3Npb25zLCBhY2Nlc3Nvcik7XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3QgcnVuV2l0aFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrQWdlbnRTZXNzaW9uVW5yZWFkQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb24ubWFya1VucmVhZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYXJrVW5yZWFkJywgXCJNYXJrIGFzIFVucmVhZFwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcwX3JlYWQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc1JlYWRBZ2VudFNlc3Npb24sXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24ubmVnYXRlKCkgLy8gbm8gcmVhZCBzdGF0ZSBmb3IgYXJjaGl2ZWQgc2Vzc2lvbnNcblx0XHRcdFx0KSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bldpdGhTZXNzaW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uLnNldFJlYWQoZmFsc2UpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya0FnZW50U2Vzc2lvblJlYWRBY3Rpb24gZXh0ZW5kcyBCYXNlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvbi5tYXJrUmVhZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYXJrUmVhZCcsIFwiTWFyayBhcyBSZWFkXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzBfcmVhZCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzUmVhZEFnZW50U2Vzc2lvbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5uZWdhdGUoKSAvLyBubyByZWFkIHN0YXRlIGZvciBhcmNoaXZlZCBzZXNzaW9uc1xuXHRcdFx0XHQpLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuV2l0aFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHNlc3Npb24uc2V0UmVhZCh0cnVlKTtcblx0XHR9XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZUFyY2hpdmVBZ2VudFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24od29yZGluZykuYXJjaGl2ZTtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvbi5hcmNoaXZlJyxcblx0XHRcdHRpdGxlOiBhY3Rpb24udGl0bGUsXG5cdFx0XHRpY29uOiBhY3Rpb24uaWNvbixcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25zVmlld2VyRm9jdXNlZCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5uZWdhdGUoKVxuXHRcdFx0XHQpXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25JdGVtVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLm5lZ2F0ZSgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5uZWdhdGUoKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhTZXNzaW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cblx0XHQvLyBBcmNoaXZlIGFsbCBzZXNzaW9uc1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdGlmIChjaGF0TW9kZWwgJiYgIWF3YWl0IHNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uKGNoYXRNb2RlbCwgZGlhbG9nU2VydmljZSwge1xuXHRcdFx0XHRpc0FyY2hpdmVBY3Rpb246IHRydWUsXG5cdFx0XHRcdHRpdGxlT3ZlcnJpZGU6IHRoaXMud29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbWFya1Nlc3Npb25Eb25lJywgXCJNYXJrIGNoYXQgYXMgZG9uZSB3aXRoIHBlbmRpbmcgZWRpdHM/XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZVNlc3Npb24nLCBcIkFyY2hpdmUgY2hhdCB3aXRoIHBlbmRpbmcgZWRpdHM/XCIpLFxuXHRcdFx0XHRtZXNzYWdlT3ZlcnJpZGU6IGxvY2FsaXplKCdhcmNoaXZlU2Vzc2lvbkRlc2NyaXB0aW9uJywgXCJZb3UgaGF2ZSBwZW5kaW5nIGNoYW5nZXMgaW4gdGhpcyBjaGF0IHNlc3Npb24uXCIpXG5cdFx0XHR9KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVBZ2VudFNlc3Npb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLkFyY2hpdmUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrQWdlbnRTZXNzaW9uRG9uZUFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlVW5hcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3Iod29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS51bmFyY2hpdmU7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb24udW5hcmNoaXZlJyxcblx0XHRcdHRpdGxlOiBhY3Rpb24udGl0bGUsXG5cdFx0XHRpY29uOiBhY3Rpb24uaWNvbixcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5EZWxldGUsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CYWNrc3BhY2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25zVmlld2VyRm9jdXNlZCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvblxuXHRcdFx0XHQpXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25JdGVtVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbixcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW5XaXRoU2Vzc2lvbnMoc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZChmYWxzZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmFyY2hpdmVBZ2VudFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlVW5hcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVzdG9yZUFnZW50U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VVbmFyY2hpdmVBZ2VudFNlc3Npb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBZ2VudFNlc3Npb25BcmNoaXZlQWN0aW9uQ29uc3RydWN0b3JzKHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpOiByZWFkb25seSB7IG5ldygpOiBBY3Rpb24yIH1bXSB7XG5cdHJldHVybiB3b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHQ/IFtcblx0XHRcdE1hcmtBbGxBZ2VudFNlc3Npb25zRG9uZUFjdGlvbixcblx0XHRcdE1hcmtBZ2VudFNlc3Npb25TZWN0aW9uRG9uZUFjdGlvbixcblx0XHRcdFJlc3RvcmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uLFxuXHRcdFx0TWFya0FnZW50U2Vzc2lvbkRvbmVBY3Rpb24sXG5cdFx0XHRSZXN0b3JlQWdlbnRTZXNzaW9uQWN0aW9uLFxuXHRcdF1cblx0XHQ6IFtcblx0XHRcdEFyY2hpdmVBbGxBZ2VudFNlc3Npb25zQWN0aW9uLFxuXHRcdFx0QXJjaGl2ZUFnZW50U2Vzc2lvblNlY3Rpb25BY3Rpb24sXG5cdFx0XHRVbmFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uLFxuXHRcdFx0QXJjaGl2ZUFnZW50U2Vzc2lvbkFjdGlvbixcblx0XHRcdFVuYXJjaGl2ZUFnZW50U2Vzc2lvbkFjdGlvbixcblx0XHRdO1xufVxuXG5leHBvcnQgY2xhc3MgUGluQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb24ucGluJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3BpbicsIFwiUGluXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5waW4sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbkl0ZW1Ub29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc1Bpbm5lZEFnZW50U2Vzc2lvbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzBfcGluJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNQaW5uZWRBZ2VudFNlc3Npb24ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24ubmVnYXRlKClcblx0XHRcdFx0KSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW5XaXRoU2Vzc2lvbnMoc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0c2Vzc2lvbi5zZXRQaW5uZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbnBpbkFnZW50U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VBZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uLnVucGluJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3VucGluJywgXCJVbnBpblwiKSxcblx0XHRcdGljb246IENvZGljb24ucGlubmVkLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25JdGVtVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNQaW5uZWRBZ2VudFNlc3Npb24sXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24ubmVnYXRlKClcblx0XHRcdFx0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcwX3BpbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzUGlubmVkQWdlbnRTZXNzaW9uLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLm5lZ2F0ZSgpXG5cdFx0XHRcdCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuV2l0aFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHNlc3Npb24uc2V0UGlubmVkKGZhbHNlKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBNYXRjaGVzIGV2ZXJ5IHNlc3Npb24gdHlwZSB0aGF0IHN1cHBvcnRzIHJlbmFtaW5nOiBsb2NhbCBzZXNzaW9ucyBhbmQgYWxsXG4gKiBhZ2VudC1ob3N0IHNlc3Npb24gdHlwZXMgKGBhZ2VudC1ob3N0LSpgIGFuZCBgcmVtb3RlLSpgKSwgbWlycm9yaW5nIHRoZVxuICogZ2VuZXJpYyBgaXNBZ2VudEhvc3RUYXJnZXRgIGNoZWNrIHVzZWQgYnkgdGhlIHJlbmFtZSBhY3Rpb24gYm9keS5cbiAqL1xuY29uc3QgcmVuYW1lU3VwcG9ydGVkU2Vzc2lvblR5cGVzID0gQ29udGV4dEtleUV4cHIub3IoXG5cdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmlzRXF1YWxUbyhBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwpLFxuXHRDaGF0Q29udGV4dEtleUV4cHJzLmlzQWdlbnRIb3N0U2Vzc2lvbkl0ZW0sXG4pO1xuXG5leHBvcnQgY2xhc3MgUmVuYW1lQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFHRU5UX1NFU1NJT05fUkVOQU1FX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlbmFtZScsIFwiUmVuYW1lLi4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuaGFzTXVsdGlwbGVBZ2VudFNlc3Npb25zU2VsZWN0ZWQubmVnYXRlKCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRjIsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXJcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJGb2N1c2VkLFxuXHRcdFx0XHRcdHJlbmFtZVN1cHBvcnRlZFNlc3Npb25UeXBlc1xuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogcmVuYW1lU3VwcG9ydGVkU2Vzc2lvblR5cGVzXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoU2Vzc2lvbnMoc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnMuYXQoMCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5pbnB1dCh7IHByb21wdDogbG9jYWxpemUoJ25ld0NoYXRUaXRsZScsIFwiTmV3IGFnZW50IHNlc3Npb24gdGl0bGVcIiksIHZhbHVlOiBzZXNzaW9uLmxhYmVsIH0pO1xuXHRcdGlmICh0aXRsZSkge1xuXHRcdFx0aWYgKGlzQWdlbnRIb3N0QWdlbnRTZXNzaW9uSXRlbShzZXNzaW9uKSkge1xuXHRcdFx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlbmFtZUNoYXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UsIHRpdGxlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNoYXRTZXJ2aWNlLnNldENoYXRTZXNzaW9uVGl0bGUoc2Vzc2lvbi5yZXNvdXJjZSwgdGl0bGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFHRU5UX1NFU1NJT05fREVMRVRFX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlbGV0ZScsIFwiRGVsZXRlLi4uXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleUV4cHJzLmlzQWdlbnRIb3N0U2Vzc2lvbkl0ZW0sXG5cdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhTZXNzaW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IHNlc3Npb25zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdkZWxldGVTZXNzaW9uLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgdGhpcyBjaGF0IHNlc3Npb24/XCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2RlbGV0ZVNlc3Npb25zLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgezB9IGNoYXQgc2Vzc2lvbnM/XCIsIHNlc3Npb25zLmxlbmd0aCksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkZWxldGVTZXNzaW9uLmRldGFpbCcsIFwiVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGVsZXRlU2Vzc2lvbi5kZWxldGUnLCBcIkRlbGV0ZVwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVsZXRlZFNlc3Npb25JZHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGlmIChpc0xvY2FsQWdlbnRTZXNzaW9uSXRlbShzZXNzaW9uKSkge1xuXHRcdFx0XHQvLyBDbGVhciBjaGF0IHdpZGdldCBiZWZvcmUgZGVsZXRpb246IGxvY2FsIHNlc3Npb25zIGFyZSBzdG9yZWQgaW4tcHJvY2VzcyBhbmQgcmVtb3ZhbCBjYW5ub3QgZmFpbC5cblx0XHRcdFx0YXdhaXQgd2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzZXNzaW9uLnJlc291cmNlKT8uY2xlYXIoKTtcblxuXHRcdFx0XHQvLyBSZW1vdmUgZnJvbSBzdG9yYWdlXG5cdFx0XHRcdGF3YWl0IGNoYXRTZXJ2aWNlLnJlbW92ZUhpc3RvcnlFbnRyeShzZXNzaW9uLnJlc291cmNlKTtcblxuXHRcdFx0XHQvLyBUcmFjayBzZXNzaW9uIElEIGZvciBjbG91ZCBjbGVhbnVwXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdFx0aWYgKHNlc3Npb25JZCkge1xuXHRcdFx0XHRcdGRlbGV0ZWRTZXNzaW9uSWRzLnB1c2goc2Vzc2lvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc0FnZW50SG9zdEFnZW50U2Vzc2lvbkl0ZW0oc2Vzc2lvbikpIHtcblx0XHRcdFx0Ly8gRGVsZWdhdGUgdG8gdGhlIGFnZW50IGhvc3Qgc2Vzc2lvbiBjb250cm9sbGVyLCB3aGljaCBkaXNwb3NlcyB0aGUgYmFja2VuZCBzZXNzaW9uIGFuZCByZW1vdmVzXG5cdFx0XHRcdC8vIHRoZSBpdGVtIGZyb20gdGhlIHNpZGViYXIuIE9ubHkgY2xlYXIgdGhlIGNoYXQgd2lkZ2V0IGFmdGVyIGEgc3VjY2Vzc2Z1bCBkZWxldGUgc28gdGhhdCBhXG5cdFx0XHRcdC8vIGZhaWx1cmUgKGFuZCB0aGUgcmVzdWx0aW5nIGVycm9yIGRpYWxvZykgbGVhdmVzIHRoZSB1c2VyIG9uIHRoZSBzdGlsbC1leGlzdGluZyBzZXNzaW9uLlxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZGVsZXRlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb24ucmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk/LmNsZWFyKCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGRpYWxvZ1NlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2RlbGV0ZVNlc3Npb24uZXJyb3InLCBcIkZhaWxlZCB0byBkZWxldGUgY2hhdCBzZXNzaW9uOiB7MH1cIiwgdG9FcnJvck1lc3NhZ2UoZXJyKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm90aWZ5IGV4dGVuc2lvbnMgdG8gY2xlYW4gdXAgY2xvdWQgZGF0YSAoYmVzdCBlZmZvcnQpXG5cdFx0aWYgKGRlbGV0ZWRTZXNzaW9uSWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdnaXRodWIuY29waWxvdC5zZXNzaW9uU3luYy5kZWxldGVTZXNzaW9uRnJvbUNsb3VkJywgZGVsZXRlZFNlc3Npb25JZHMpLmNhdGNoKCgpID0+IHsgLyogYmVzdCBlZmZvcnQgKi8gfSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVBbGxMb2NhbFNlc3Npb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY2xlYXJIaXN0b3J5Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50U2Vzc2lvbnMuZGVsZXRlQWxsJywgXCJEZWxldGUgQWxsIExvY2FsIFdvcmtzcGFjZSBDaGF0IFNlc3Npb25zXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGNhdGVnb3J5OiBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBhZ2VudFNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbG9jYWxTZXNzaW9uc0NvdW50ID0gYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0oc2Vzc2lvbikpLmxlbmd0aDtcblx0XHRpZiAobG9jYWxTZXNzaW9uc0NvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsU2Vzc2lvbnNDb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdkZWxldGVBbGxDaGF0cy5jb25maXJtU2luZ2xlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIDEgbG9jYWwgd29ya3NwYWNlIGNoYXQgc2Vzc2lvbj9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZGVsZXRlQWxsQ2hhdHMuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB7MH0gbG9jYWwgd29ya3NwYWNlIGNoYXQgc2Vzc2lvbnM/XCIsIGxvY2FsU2Vzc2lvbnNDb3VudCksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkZWxldGVBbGxDaGF0cy5kZXRhaWwnLCBcIlRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2RlbGV0ZUFsbENoYXRzLmJ1dHRvbicsIFwiRGVsZXRlIEFsbFwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgYWxsIGNoYXQgd2lkZ2V0c1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHdpZGdldFNlcnZpY2UuZ2V0QWxsV2lkZ2V0cygpLm1hcCh3aWRnZXQgPT4gd2lkZ2V0LmNsZWFyKCkpKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIHN0b3JhZ2Vcblx0XHRhd2FpdCBjaGF0U2VydmljZS5jbGVhckFsbEhpc3RvcnlFbnRyaWVzKCk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZU9wZW5BZ2VudFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblxuXHRhc3luYyBydW5XaXRoU2Vzc2lvbnMoc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0aGlzLmdldFRhcmdldEdyb3VwKCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBzZXNzaW9uLnJlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjaGF0V2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbih1cmksIHRhcmdldEdyb3VwLCB7XG5cdFx0XHRcdC4uLnRoaXMuZ2V0T3B0aW9ucygpLFxuXHRcdFx0XHRwaW5uZWQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRUYXJnZXRHcm91cCgpOiBQcmVmZXJyZWRHcm91cDtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0T3B0aW9ucygpOiBJQ2hhdEVkaXRvck9wdGlvbnM7XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuQWdlbnRTZXNzaW9uSW5FZGl0b3JHcm91cEFjdGlvbiBleHRlbmRzIEJhc2VPcGVuQWdlbnRTZXNzaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5TZXNzaW9uSW5FZGl0b3JHcm91cCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5BZ2VudFNlc3Npb25JbkVkaXRvckdyb3VwQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5vcGVuU2Vzc2lvbkluRWRpdG9yR3JvdXAubGFiZWwnLCBcIk9wZW4gYXMgRWRpdG9yXCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5FbnRlclxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uc1ZpZXdlckZvY3VzZWQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFRhcmdldEdyb3VwKCk6IFByZWZlcnJlZEdyb3VwIHtcblx0XHRyZXR1cm4gQUNUSVZFX0dST1VQO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldE9wdGlvbnMoKTogSUNoYXRFZGl0b3JPcHRpb25zIHtcblx0XHRyZXR1cm4ge307XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5BZ2VudFNlc3Npb25Jbk5ld0VkaXRvckdyb3VwQWN0aW9uIGV4dGVuZHMgQmFzZU9wZW5BZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblNlc3Npb25Jbk5ld0VkaXRvckdyb3VwJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkFnZW50U2Vzc2lvbkluTmV3RWRpdG9yR3JvdXBBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lm9wZW5TZXNzaW9uSW5OZXdFZGl0b3JHcm91cC5sYWJlbCcsIFwiT3BlbiB0byB0aGUgU2lkZVwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbnRlclxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uc1ZpZXdlckZvY3VzZWQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFRhcmdldEdyb3VwKCk6IFByZWZlcnJlZEdyb3VwIHtcblx0XHRyZXR1cm4gU0lERV9HUk9VUDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRPcHRpb25zKCk6IElDaGF0RWRpdG9yT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuQWdlbnRTZXNzaW9uSW5OZXdXaW5kb3dBY3Rpb24gZXh0ZW5kcyBCYXNlT3BlbkFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuU2Vzc2lvbkluTmV3V2luZG93JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkFnZW50U2Vzc2lvbkluTmV3V2luZG93QWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5vcGVuU2Vzc2lvbkluTmV3V2luZG93LmxhYmVsJywgXCJPcGVuIGluIE5ldyBXaW5kb3dcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VGFyZ2V0R3JvdXAoKTogUHJlZmVycmVkR3JvdXAge1xuXHRcdHJldHVybiBBVVhfV0lORE9XX0dST1VQO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldE9wdGlvbnMoKTogSUNoYXRFZGl0b3JPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YXV4aWxpYXJ5OiB7IGNvbXBhY3Q6IHRydWUsIGJvdW5kczogeyB3aWR0aDogODAwLCBoZWlnaHQ6IDY0MCB9IH1cblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQWdlbnQgU2Vzc2lvbnMgU2lkZWJhclxuXG5leHBvcnQgY2xhc3MgUmVmcmVzaEFnZW50U2Vzc2lvbnNWaWV3ZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvbnNWaWV3ZXIucmVmcmVzaCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZWZyZXNoJywgXCJSZWZyZXNoIEFnZW50IFNlc3Npb25zXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZWZyZXNoLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFnZW50U2Vzc2lvbnNDb250cm9sPzogSUFnZW50U2Vzc2lvbnNDb250cm9sKSB7XG5cdFx0Y29uc3QgY29udHJvbCA9IGFnZW50U2Vzc2lvbnNDb250cm9sID8/IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3V2l0aElkPENoYXRWaWV3UGFuZT4oQ2hhdFZpZXdJZCk/LmFnZW50U2Vzc2lvbnNDb250cm9sO1xuXHRcdGlmIChjb250cm9sKSB7XG5cdFx0XHRjb250cm9sLnJlZnJlc2goKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ3Nlc3Npb25zVmlld1BhbmUucmVmcmVzaCcpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmluZEFnZW50U2Vzc2lvbkluVmlld2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb25zVmlld2VyLmZpbmQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZmluZCcsIFwiRmluZCBBZ2VudCBTZXNzaW9uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zZWFyY2gsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc1Rvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhZ2VudFNlc3Npb25zQ29udHJvbD86IElBZ2VudFNlc3Npb25zQ29udHJvbCkge1xuXHRcdGNvbnN0IGNvbnRyb2wgPSBhZ2VudFNlc3Npb25zQ29udHJvbCA/PyBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZDxDaGF0Vmlld1BhbmU+KENoYXRWaWV3SWQpPy5hZ2VudFNlc3Npb25zQ29udHJvbDtcblx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0cmV0dXJuIGNvbnRyb2wub3BlbkZpbmQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKCdzZXNzaW9uc1ZpZXdQYW5lLmZpbmQnKTtcblx0XHR9XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgVXBkYXRlQ2hhdFZpZXdXaWR0aEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNoYXRMb2NhdGlvbiA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKENoYXRWaWV3SWQpO1xuXHRcdGlmICh0eXBlb2YgY2hhdExvY2F0aW9uICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBuZWVkIGEgdmlldyBsb2NhdGlvblxuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSBpZiB3ZSBjYW4gcmVzaXplIHRoZSB2aWV3OiB0aGlzIGlzIG5vdCBwb3NzaWJsZVxuXHRcdC8vIGZvciB3aGVuIHRoZSBjaGF0IHZpZXcgaXMgaW4gdGhlIHBhbmVsIGF0IHRoZSB0b3Agb3IgYm90dG9tXG5cdFx0Y29uc3QgcGFuZWxQb3NpdGlvbiA9IGxheW91dFNlcnZpY2UuZ2V0UGFuZWxQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGNhblJlc2l6ZVZpZXcgPSBjaGF0TG9jYXRpb24gIT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCB8fCAocGFuZWxQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCB8fCBwYW5lbFBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVCk7XG5cblx0XHQvLyBVcGRhdGUgY29uZmlndXJhdGlvbiBpZiBuZWVkZWRcblx0XHRjb25zdCBjaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkKTtcblx0XHRpZiAoIWNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkKSB7XG5cdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0bGV0IGNoYXRWaWV3ID0gdmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8Q2hhdFZpZXdQYW5lPihDaGF0Vmlld0lkKTtcblx0XHRpZiAoIWNoYXRWaWV3KSB7XG5cdFx0XHRjaGF0VmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldzxDaGF0Vmlld1BhbmU+KENoYXRWaWV3SWQsIGZhbHNlKTtcblx0XHR9XG5cdFx0aWYgKCFjaGF0Vmlldykge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBuZWVkIHRoZSBjaGF0IHZpZXdcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmVkT3JpZW50YXRpb24gPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnc3RhY2tlZCcgfCAnc2lkZUJ5U2lkZScgfCB1bmtub3duPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb24pO1xuXHRcdGxldCB2YWxpZGF0ZWRDb25maWd1cmVkT3JpZW50YXRpb246ICdzdGFja2VkJyB8ICdzaWRlQnlTaWRlJztcblx0XHRpZiAoY29uZmlndXJlZE9yaWVudGF0aW9uID09PSAnc3RhY2tlZCcgfHwgY29uZmlndXJlZE9yaWVudGF0aW9uID09PSAnc2lkZUJ5U2lkZScpIHtcblx0XHRcdHZhbGlkYXRlZENvbmZpZ3VyZWRPcmllbnRhdGlvbiA9IGNvbmZpZ3VyZWRPcmllbnRhdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsaWRhdGVkQ29uZmlndXJlZE9yaWVudGF0aW9uID0gJ3NpZGVCeVNpZGUnOyAvLyBkZWZhdWx0XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3T3JpZW50YXRpb24gPSB0aGlzLmdldE9yaWVudGF0aW9uKCk7XG5cdFx0Y29uc3QgbGFzdFdpZHRoRm9yT3JpZW50YXRpb24gPSBjaGF0Vmlldz8uZ2V0TGFzdERpbWVuc2lvbnMobmV3T3JpZW50YXRpb24pPy53aWR0aDtcblxuXHRcdGlmICgoIWNhblJlc2l6ZVZpZXcgfHwgdmFsaWRhdGVkQ29uZmlndXJlZE9yaWVudGF0aW9uID09PSAnc2lkZUJ5U2lkZScpICYmIG5ld09yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCkge1xuXHRcdFx0Y2hhdFZpZXcudXBkYXRlQ29uZmlndXJlZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24oJ3N0YWNrZWQnKTtcblx0XHR9IGVsc2UgaWYgKCghY2FuUmVzaXplVmlldyB8fCB2YWxpZGF0ZWRDb25maWd1cmVkT3JpZW50YXRpb24gPT09ICdzdGFja2VkJykgJiYgbmV3T3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlKSB7XG5cdFx0XHRjaGF0Vmlldy51cGRhdGVDb25maWd1cmVkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbignc2lkZUJ5U2lkZScpO1xuXHRcdH1cblxuXHRcdGlmICghY2FuUmVzaXplVmlldykge1xuXHRcdFx0cmV0dXJuOyAvLyBsb2NhdGlvbiBkb2VzIG5vdCBhbGxvdyBmb3IgcmVzaXplIChwYW5lbCB0b3Agb3IgYm90dG9tKVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnQgPSBwYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQYXJ0SWQoY2hhdExvY2F0aW9uKTtcblx0XHRsZXQgY3VycmVudFNpemUgPSBsYXlvdXRTZXJ2aWNlLmdldFNpemUocGFydCk7XG5cblx0XHRjb25zdCBjaGF0Vmlld0RlZmF1bHRXaWR0aCA9IDMwMDtcblx0XHRjb25zdCBzZXNzaW9uc1ZpZXdEZWZhdWx0V2lkdGggPSBjaGF0Vmlld0RlZmF1bHRXaWR0aDtcblx0XHRjb25zdCBzaWRlQnlTaWRlTWluV2lkdGggPSBjaGF0Vmlld0RlZmF1bHRXaWR0aCArIHNlc3Npb25zVmlld0RlZmF1bHRXaWR0aCArIDE7XHQvLyBhY2NvdW50IGZvciBwb3NzaWJsZSB0aGVtZSBib3JkZXJcblxuXHRcdGlmIChcblx0XHRcdChuZXdPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUgJiYgY3VycmVudFNpemUud2lkdGggPj0gc2lkZUJ5U2lkZU1pbldpZHRoKSB8fFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gYWxyZWFkeSB3aWRlIGVub3VnaCB0byBzaG93IHNpZGUgYnkgc2lkZVxuXHRcdFx0KG5ld09yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCAmJiBjaGF0TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIgJiYgbGF5b3V0U2VydmljZS5pc0F1eGlsaWFyeUJhck1heGltaXplZCgpKSBcdC8vIHRyeSB0byBub3QgbGVhdmUgbWF4aW1pemVkIHN0YXRlIGlmIG1heGltaXplZFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIExlYXZlIG1heGltaXplZCBzdGF0ZSBpZiBhcHBsaWNhYmxlXG5cdFx0aWYgKGNoYXRMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikge1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpO1xuXHRcdFx0Y3VycmVudFNpemUgPSBsYXlvdXRTZXJ2aWNlLmdldFNpemUocGFydCk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlndXJlIG91dCB0aGUgcmlnaHQgbmV3IHdpZHRoXG5cdFx0bGV0IG5ld1dpZHRoOiBudW1iZXI7XG5cdFx0aWYgKG5ld09yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSkge1xuXHRcdFx0bmV3V2lkdGggPSBNYXRoLm1heChzaWRlQnlTaWRlTWluV2lkdGgsIGxhc3RXaWR0aEZvck9yaWVudGF0aW9uIHx8IE1hdGgucm91bmQobGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIC8gMikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdXaWR0aCA9IGxhc3RXaWR0aEZvck9yaWVudGF0aW9uIHx8IE1hdGgubWF4KGNoYXRWaWV3RGVmYXVsdFdpZHRoLCBjdXJyZW50U2l6ZS53aWR0aCAtIHNlc3Npb25zVmlld0RlZmF1bHRXaWR0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgdGhlIG5ldyB3aWR0aFxuXHRcdGxheW91dFNlcnZpY2Uuc2V0U2l6ZShwYXJ0LCB7IHdpZHRoOiBuZXdXaWR0aCwgaGVpZ2h0OiBjdXJyZW50U2l6ZS5oZWlnaHQgfSk7XG5cblx0XHQvLyBJZiB3ZSBmaWd1cmUgb3V0IHRoYXQgdGhlIHdpZHRoIHdhcyBub3QgYXBwbGllZCBkdWUgdG8gY29uc3RyYWludHMgKHN1Y2ggYXMgd2luZG93IGRpbWVuc2lvbnMpLFxuXHRcdC8vIHdlIG1heGltaXplIHRoZSBhdXhpbGlhcnkgYmFyIHRvIGVuc3VyZSB0aGUgc2lkZSBieSBzaWRlIGV4cGVyaWVuY2UgaXMgb3B0aW1hbFxuXHRcdGNvbnN0IGFjdHVhbFNpemUgPSBsYXlvdXRTZXJ2aWNlLmdldFNpemUocGFydCk7XG5cdFx0aWYgKFxuXHRcdFx0Y2hhdExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyICYmXHRcdFx0Ly8gb25seSBhcHBsaWNhYmxlIGZvciBhdXhpbGlhcnkgYmFyXG5cdFx0XHRuZXdPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUgJiZcdC8vIG9ubHkgYXBwbGljYWJsZSB3aGVuIGdvaW5nIHRvIHNpZGUgYnkgc2lkZVxuXHRcdFx0YWN0dWFsU2l6ZS53aWR0aCA8IHNpZGVCeVNpZGVNaW5XaWR0aFx0XHRcdFx0XHRcdFx0Ly8gd2lkdGggaXMgc3RpbGwgbm90IGVub3VnaCBmb3Igc2lkZSBieSBzaWRlXG5cdFx0KSB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnNldEF1eGlsaWFyeUJhck1heGltaXplZCh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRhYnN0cmFjdCBnZXRPcmllbnRhdGlvbigpOiBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93QWdlbnRTZXNzaW9uc1NpZGViYXIgZXh0ZW5kcyBVcGRhdGVDaGF0Vmlld1dpZHRoQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnYWdlbnRTZXNzaW9ucy5zaG93QWdlbnRTZXNzaW9uc1NpZGViYXInO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEUgPSBsb2NhbGl6ZTIoJ3Nob3dBZ2VudFNlc3Npb25zU2lkZWJhcicsIFwiU2hvdyBBZ2VudCBTZXNzaW9ucyBTaWRlYmFyXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93QWdlbnRTZXNzaW9uc1NpZGViYXIuSUQsXG5cdFx0XHR0aXRsZTogU2hvd0FnZW50U2Vzc2lvbnNTaWRlYmFyLlRJVExFLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLmlzRXF1YWxUbyhBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCksXG5cdFx0XHQpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQUdFTlRfU0VTU0lPTlNfQ0FURUdPUlksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRPcmllbnRhdGlvbigpOiBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24ge1xuXHRcdHJldHVybiBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSGlkZUFnZW50U2Vzc2lvbnNTaWRlYmFyIGV4dGVuZHMgVXBkYXRlQ2hhdFZpZXdXaWR0aEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FnZW50U2Vzc2lvbnMuaGlkZUFnZW50U2Vzc2lvbnNTaWRlYmFyJztcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFID0gbG9jYWxpemUyKCdoaWRlQWdlbnRTZXNzaW9uc1NpZGViYXInLCBcIkhpZGUgQWdlbnQgU2Vzc2lvbnMgU2lkZWJhclwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSGlkZUFnZW50U2Vzc2lvbnNTaWRlYmFyLklELFxuXHRcdFx0dGl0bGU6IEhpZGVBZ2VudFNlc3Npb25zU2lkZWJhci5USVRMRSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUpLFxuXHRcdFx0KSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IEFHRU5UX1NFU1NJT05TX0NBVEVHT1JZLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0T3JpZW50YXRpb24oKTogQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uIHtcblx0XHRyZXR1cm4gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUFnZW50U2Vzc2lvbnNTaWRlYmFyIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FnZW50U2Vzc2lvbnMudG9nZ2xlQWdlbnRTZXNzaW9uc1NpZGViYXInO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEUgPSBsb2NhbGl6ZTIoJ3RvZ2dsZUFnZW50U2Vzc2lvbnNTaWRlYmFyJywgXCJUb2dnbGUgQWdlbnQgU2Vzc2lvbnMgU2lkZWJhclwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlQWdlbnRTZXNzaW9uc1NpZGViYXIuSUQsXG5cdFx0XHR0aXRsZTogVG9nZ2xlQWdlbnRTZXNzaW9uc1NpZGViYXIuVElUTEUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQUdFTlRfU0VTU0lPTlNfQ0FURUdPUlksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNoYXRWaWV3ID0gdmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8Q2hhdFZpZXdQYW5lPihDaGF0Vmlld0lkKTtcblx0XHRjb25zdCBjdXJyZW50T3JpZW50YXRpb24gPSBjaGF0Vmlldz8uZ2V0U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbigpO1xuXG5cdFx0aWYgKGN1cnJlbnRPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUpIHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEhpZGVBZ2VudFNlc3Npb25zU2lkZWJhci5JRCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNob3dBZ2VudFNlc3Npb25zU2lkZWJhci5JRCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c0FnZW50U2Vzc2lvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmZvY3VzQWdlbnRTZXNzaW9uc1ZpZXdlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZvY3VzQWdlbnRTZXNzaW9uc0FjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuZm9jdXNBZ2VudFNlc3Npb25zVmlld2VyLmxhYmVsJywgXCJGb2N1cyBBZ2VudCBTZXNzaW9uc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZH1gLCB0cnVlKVxuXHRcdFx0KSxcblx0XHRcdGNhdGVnb3J5OiBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNoYXRWaWV3ID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3PENoYXRWaWV3UGFuZT4oQ2hhdFZpZXdJZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGNoYXRWaWV3Py5mb2N1c1Nlc3Npb25zKCk7XG5cdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmVkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdzdGFja2VkJyB8ICdzaWRlQnlTaWRlJyB8IHVua25vd24+KENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNPcmllbnRhdGlvbik7XG5cdFx0aWYgKGNvbmZpZ3VyZWRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSAnc3RhY2tlZCcpIHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNob3dBZ2VudFNlc3Npb25zU2lkZWJhci5JRCk7XG5cdFx0fVxuXG5cdFx0Y2hhdFZpZXc/LmZvY3VzU2Vzc2lvbnMoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxxQkFBMEYsNkJBQTZCLHVCQUF1Qix5QkFBeUIsdUNBQXVDO0FBQ3ZOLFNBQVMsU0FBUyxRQUFRLG9CQUFvQjtBQUM5QyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQ0FBZ0MsZ0NBQWdDLHVCQUF1QixzQ0FBNkQ7QUFDN0osU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQ3JELFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsWUFBWSwwQkFBMEI7QUFDL0MsU0FBUyxjQUFjLGtCQUFrQyxrQkFBa0I7QUFDM0UsU0FBUyx3QkFBd0IsNkJBQTZCO0FBQzlELFNBQVMseUJBQXlCLGdCQUFnQjtBQUNsRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQiwyQ0FBMkM7QUFDckUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FB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TSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUUvQyxVQUFNLFdBQVcsYUFBYSxvQkFBa0MsVUFBVTtBQUMxRSxVQUFNLHFCQUFxQixVQUFVLDZCQUE2QjtBQUVsRSxRQUFJLHVCQUF1QiwrQkFBK0IsWUFBWTtBQUNyRSxZQUFNLGVBQWUsZUFBZSx5QkFBeUIsRUFBRTtBQUFBLElBQ2hFLE9BQU87QUFDTixZQUFNLGVBQWUsZUFBZSx5QkFBeUIsRUFBRTtBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUNEO0FBNUJhLDRCQUVJLEtBQUs7QUFGVCw0QkFHSSxRQUFRLFVBQVUsOEJBQThCLCtCQUErQjtBQUh6RixJQUFNLDZCQUFOO0FBOEJBLE1BQU0sNEJBQU4sTUFBTSxrQ0FBaUMsUUFBUTtBQUFBLEVBSXJELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLDBCQUF5QjtBQUFBLE1BQzdCLE9BQU8sVUFBVSx1Q0FBdUMsc0JBQXNCO0FBQUEsTUFDOUUsY0FBYyxlQUFlO0FBQUEsUUFDNUIsZ0JBQWdCO0FBQUEsUUFDaEIsZUFBZSxPQUFPLFVBQVUsa0JBQWtCLHVCQUF1QixJQUFJLElBQUk7QUFBQSxNQUNsRjtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQ1YsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxVQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUVuRCxVQUFNLFdBQVcsTUFBTSxhQUFhLFNBQXVCLFlBQVksSUFBSTtBQUMzRSxVQUFNLFVBQVUsVUFBVSxjQUFjO0FBQ3hDLFFBQUksU0FBUztBQUNaO0FBQUEsSUFDRDtBQUVBLFVBQU0sc0NBQXNDLHFCQUFxQixTQUE2QyxrQkFBa0IsMkJBQTJCO0FBQzNKLFFBQUksd0NBQXdDLFdBQVc7QUFDdEQsWUFBTSxlQUFlLGVBQWUsa0JBQWtCO0FBQUEsSUFDdkQsT0FBTztBQUNOLFlBQU0sZUFBZSxlQUFlLHlCQUF5QixFQUFFO0FBQUEsSUFDaEU7QUFFQSxjQUFVLGNBQWM7QUFBQSxFQUN6QjtBQUNEO0FBckNhLDBCQUVJLEtBQUs7QUFGZixJQUFNLDJCQUFOOyIsCiAgIm5hbWVzIjogW10KfQo=
