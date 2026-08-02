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
import "./media/agentsessionprojection.css";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { createDecorator } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { IEditorService, MODAL_GROUP } from "../../../../../services/editor/common/editorService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { isSessionInProgressStatus } from "../agentSessionsModel.js";
import { IChatWidgetService } from "../../chat.js";
import { AgentSessionProviders } from "../agentSessions.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../services/layout/browser/layoutService.js";
import { ACTION_ID_NEW_CHAT } from "../../actions/chatActions.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { IAgentTitleBarStatusService } from "./agentTitleBarStatusService.js";
import { inAgentSessionProjection } from "./agentSessionProjection.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IAgentSessionsService } from "../agentSessionsService.js";
const AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS = new Set(Object.values(AgentSessionProviders));
const IAgentSessionProjectionService = createDecorator("agentSessionProjectionService");
let AgentSessionProjectionService = class extends Disposable {
  constructor(contextKeyService, configurationService, editorGroupsService, editorService, logService, chatWidgetService, chatSessionsService, layoutService, commandService, chatEditingService, agentTitleBarStatusService, agentSessionsService) {
    super();
    this.configurationService = configurationService;
    this.editorGroupsService = editorGroupsService;
    this.editorService = editorService;
    this.logService = logService;
    this.chatWidgetService = chatWidgetService;
    this.chatSessionsService = chatSessionsService;
    this.layoutService = layoutService;
    this.commandService = commandService;
    this.chatEditingService = chatEditingService;
    this.agentTitleBarStatusService = agentTitleBarStatusService;
    this.agentSessionsService = agentSessionsService;
    this._isActive = false;
    /** Prevents re-entrant exits and enter-on-exit races */
    this._isExiting = false;
    /** Prevents checkForEmptyEditors from exiting during session swaps */
    this._isSwappingSessions = false;
    this._onDidChangeProjectionMode = this._register(new Emitter());
    this.onDidChangeProjectionMode = this._onDidChangeProjectionMode.event;
    this._onDidChangeActiveSession = this._register(new Emitter());
    this.onDidChangeActiveSession = this._onDidChangeActiveSession.event;
    /** Working sets per session, keyed by session resource URI string */
    this._sessionWorkingSets = /* @__PURE__ */ new Map();
    /** Whether the auxiliary bar was maximized when entering projection mode */
    this._wasAuxiliaryBarMaximized = false;
    this._inProjectionModeContextKey = inAgentSessionProjection.bindTo(contextKeyService);
    this._register(this.editorService.onDidCloseEditor(() => this._checkForEmptyEditors()));
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => this._checkForInProgressSession()));
  }
  get isActive() {
    return this._isActive;
  }
  get activeSession() {
    return this._activeSession;
  }
  _isEnabled() {
    return this.configurationService.getValue(ChatConfiguration.AgentSessionProjectionEnabled) === true;
  }
  _checkForEmptyEditors() {
    if (!this._isActive || this._isExiting || this._isSwappingSessions) {
      return;
    }
    const hasVisibleEditors = this.editorService.visibleEditors.length > 0;
    if (!hasVisibleEditors) {
      this.logService.trace("[AgentSessionProjection] All editors closed, exiting projection mode");
      this.exitProjection();
    }
  }
  _checkForInProgressSession() {
    if (!this._isActive || !this._activeSession) {
      return;
    }
    const updatedSession = this.agentSessionsService.getSession(this._activeSession.resource);
    if (!updatedSession) {
      return;
    }
    if (isSessionInProgressStatus(updatedSession.status)) {
      this.logService.trace("[AgentSessionProjection] Active session transitioned to in-progress, exiting projection mode");
      this.exitProjection({ startNewChat: false });
    }
  }
  /**
   * Opens a session in the chat panel without entering projection mode.
   */
  async _openSessionInChatPanel(session) {
    session.setRead(true);
    await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
    await this.chatWidgetService.openSession(session.resource, void 0, {
      title: { preferred: session.label },
      revealIfOpened: true
    });
  }
  /**
   * Open the session's files in a multi-diff editor.
   * @returns true if any files were opened, false if nothing to display
   */
  async _openSessionFiles(session) {
    this.logService.trace(`[AgentSessionProjection] Opening files for session '${session.label}'`, {
      hasChanges: !!session.changes,
      isArray: Array.isArray(session.changes),
      changeCount: Array.isArray(session.changes) ? session.changes.length : 0
    });
    if (session.changes && Array.isArray(session.changes) && session.changes.length > 0) {
      const diffResources = session.changes.filter((change) => change.originalUri).map((change) => ({
        originalUri: change.originalUri,
        modifiedUri: change.modifiedUri
      }));
      this.logService.trace(`[AgentSessionProjection] Found ${diffResources.length} files with diffs to display`);
      if (diffResources.length > 0) {
        await this.editorService.openEditor({
          multiDiffSource: session.resource.with({ scheme: session.resource.scheme + "-agent-session-projection" }),
          resources: diffResources.map((dr) => ({
            original: { resource: dr.originalUri },
            modified: { resource: dr.modifiedUri }
          })),
          label: localize("agentSessionProjection.changes.title", "{0} - All Changes", session.label)
        }, MODAL_GROUP);
        this.logService.trace(`[AgentSessionProjection] Multi-diff editor opened successfully in modal view`);
        const sessionKey = session.resource.toString();
        const newWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
        this._sessionWorkingSets.set(sessionKey, newWorkingSet);
        return true;
      } else {
        this.logService.trace(`[AgentSessionProjection] No files with diffs to display (all changes missing originalUri)`);
        return false;
      }
    } else {
      this.logService.trace(`[AgentSessionProjection] Session has no changes to display`);
      return false;
    }
  }
  async enterProjection(session) {
    if (!this._isEnabled()) {
      this.logService.trace("[AgentSessionProjection] Agent Session Projection is disabled");
      return;
    }
    if (!AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS.has(session.providerType)) {
      this.logService.trace(`[AgentSessionProjection] Provider type '${session.providerType}' does not support agent session projection`);
      return;
    }
    const isAuxBarMaximized = this.layoutService.isAuxiliaryBarMaximized();
    this.logService.trace("[AgentSessionProjection] enterProjection auxiliary bar state", {
      isAuxiliaryBarMaximized: isAuxBarMaximized
    });
    if (isSessionInProgressStatus(session.status)) {
      this.logService.trace("[AgentSessionProjection] Session is in progress, opening chat without projection mode");
      if (this._isActive) {
        await this.exitProjection({ startNewChat: false });
      }
      await this._openSessionInChatPanel(session);
      return;
    }
    let hasUndecidedChanges = true;
    let editingSessionExists = true;
    if (session.providerType === AgentSessionProviders.Local) {
      const editingSession = this.chatEditingService.getEditingSession(session.resource);
      editingSessionExists = !!editingSession;
      if (editingSession) {
        hasUndecidedChanges = editingSession.entries.get().some((e) => e.state.get() === ModifiedFileEntryState.Modified);
        if (!hasUndecidedChanges) {
          this.logService.trace("[AgentSessionProjection] Local session has no undecided changes, opening chat without projection mode");
        }
      } else {
        hasUndecidedChanges = false;
        this.logService.trace("[AgentSessionProjection] Local session has no editing session yet");
      }
    }
    if (!hasUndecidedChanges && this._isActive && editingSessionExists) {
      this.logService.trace("[AgentSessionProjection] Switching to session without changes while in projection mode, exiting projection");
      await this.exitProjection({ startNewChat: false });
      await this._openSessionInChatPanel(session);
      return;
    }
    if (!hasUndecidedChanges && this._isActive && !editingSessionExists) {
      this.logService.trace("[AgentSessionProjection] Switching to session without editing session while in projection mode, staying in projection");
      await this._openSessionInChatPanel(session);
      return;
    }
    if (hasUndecidedChanges) {
      if (!this._isActive && !this._preProjectionWorkingSet) {
        const visibleEditorsBefore = this.editorService.visibleEditors.length;
        this._preProjectionWorkingSet = this.editorGroupsService.saveWorkingSet("agent-session-projection-backup");
        this.logService.trace("[AgentSessionProjection] saved pre-projection working set", {
          id: this._preProjectionWorkingSet.id,
          visibleEditorsBefore
        });
      }
      const isSwapping = this._isActive && this._activeSession;
      if (isSwapping) {
        this._isSwappingSessions = true;
        const previousSessionKey = this._activeSession.resource.toString();
        const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${previousSessionKey}`);
        this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);
      }
      try {
        let filesOpened = false;
        if (session.providerType === AgentSessionProviders.Local) {
          filesOpened = true;
        } else {
          filesOpened = await this._openSessionFiles(session);
        }
        if (!filesOpened) {
          this.logService.trace("[AgentSessionProjection] No files to display, opening chat without projection mode");
          if (!this._isActive && this._preProjectionWorkingSet) {
            await this.editorGroupsService.applyWorkingSet(this._preProjectionWorkingSet);
            this.editorGroupsService.deleteWorkingSet(this._preProjectionWorkingSet);
            this._preProjectionWorkingSet = void 0;
          }
        } else {
          const wasActive = this._isActive;
          this._isActive = true;
          this._activeSession = session;
          this._inProjectionModeContextKey.set(true);
          this.layoutService.mainContainer.classList.add("agent-session-projection-active");
          if (!wasActive) {
            this._wasAuxiliaryBarMaximized = isAuxBarMaximized;
            this.logService.trace("[AgentSessionProjection] captured auxiliary bar maximized state", {
              wasAuxiliaryBarMaximized: this._wasAuxiliaryBarMaximized
            });
          }
          this.agentTitleBarStatusService.enterSessionMode(session.resource, session.label);
          if (!wasActive) {
            this._onDidChangeProjectionMode.fire(true);
          }
          this._onDidChangeActiveSession.fire(session);
        }
      } finally {
        this._isSwappingSessions = false;
      }
    }
    await this._openSessionInChatPanel(session);
    if (session.providerType === AgentSessionProviders.Local && hasUndecidedChanges) {
      await this.commandService.executeCommand("chatEditing.viewChanges");
    }
    if (this._wasAuxiliaryBarMaximized) {
      this.logService.trace("[AgentSessionProjection] hiding maximized auxiliary bar during projection");
      this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    }
  }
  async exitProjection(options) {
    if (!this._isActive || this._isExiting) {
      return;
    }
    const startNewChat = options?.startNewChat ?? true;
    this._isExiting = true;
    this.logService.trace("[AgentSessionProjection] exitProjection start", {
      hasPreProjectionWorkingSet: !!this._preProjectionWorkingSet,
      activeSession: this._activeSession?.label,
      startNewChat,
      wasAuxiliaryBarMaximized: this._wasAuxiliaryBarMaximized
    });
    if (this._activeSession) {
      const sessionKey = this._activeSession.resource.toString();
      const workingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
      this._sessionWorkingSets.set(sessionKey, workingSet);
    }
    for (const group of this.editorGroupsService.groups) {
      await group.closeAllEditors();
    }
    this.logService.trace("[AgentSessionProjection] exitProjection closed editors", { visible: this.editorService.visibleEditors.length });
    if (this._preProjectionWorkingSet) {
      await this.editorGroupsService.applyWorkingSet(this._preProjectionWorkingSet);
      this.logService.trace("[AgentSessionProjection] exitProjection applied pre-projection working set", {
        visible: this.editorService.visibleEditors.length,
        id: this._preProjectionWorkingSet.id
      });
      this.editorGroupsService.deleteWorkingSet(this._preProjectionWorkingSet);
      this._preProjectionWorkingSet = void 0;
    } else {
      await this.editorGroupsService.applyWorkingSet("empty", { preserveFocus: true });
      this.logService.trace("[AgentSessionProjection] exitProjection no pre-working set, applied empty");
    }
    this._isActive = false;
    this._activeSession = void 0;
    this._inProjectionModeContextKey.set(false);
    const shouldRestoreMaximized = this._wasAuxiliaryBarMaximized;
    this._wasAuxiliaryBarMaximized = false;
    this.layoutService.mainContainer.classList.remove("agent-session-projection-active");
    this.agentTitleBarStatusService.exitSessionMode();
    this._onDidChangeProjectionMode.fire(false);
    this._onDidChangeActiveSession.fire(void 0);
    if (startNewChat) {
      await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
    }
    if (shouldRestoreMaximized) {
      this.logService.trace("[AgentSessionProjection] restoring auxiliary bar maximized state");
      this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
      await this.commandService.executeCommand("workbench.action.maximizeAuxiliaryBar");
    }
    this.logService.trace("[AgentSessionProjection] exitProjection complete");
    this._isExiting = false;
  }
};
AgentSessionProjectionService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEditorGroupsService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IChatSessionsService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, IChatEditingService),
  __decorateParam(10, IAgentTitleBarStatusService),
  __decorateParam(11, IAgentSessionsService)
], AgentSessionProjectionService);
export {
  AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS,
  AgentSessionProjectionService,
  IAgentSessionProjectionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL2FnZW50U2Vzc2lvblByb2plY3Rpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2FnZW50c2Vzc2lvbnByb2plY3Rpb24uY3NzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvcldvcmtpbmdTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIE1PREFMX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uLCBpc1Nlc3Npb25JblByb2dyZXNzU3RhdHVzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUNUSU9OX0lEX05FV19DSEFUIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZSB9IGZyb20gJy4vYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaW5BZ2VudFNlc3Npb25Qcm9qZWN0aW9uIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25Qcm9qZWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5cbi8vI3JlZ2lvbiBDb25maWd1cmF0aW9uXG5cbi8qKlxuICogUHJvdmlkZXIgdHlwZXMgdGhhdCBzdXBwb3J0IGFnZW50IHNlc3Npb24gcHJvamVjdGlvbiBtb2RlLlxuICogT25seSBzZXNzaW9ucyBmcm9tIHRoZXNlIHByb3ZpZGVycyB3aWxsIHRyaWdnZXIgcHJvamVjdGlvbiBtb2RlLlxuICovXG5leHBvcnQgY29uc3QgQUdFTlRfU0VTU0lPTl9QUk9KRUNUSU9OX0VOQUJMRURfUFJPVklERVJTOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoT2JqZWN0LnZhbHVlcyhBZ2VudFNlc3Npb25Qcm92aWRlcnMpKTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBBZ2VudCBTZXNzaW9uIFByb2plY3Rpb24gU2VydmljZSBJbnRlcmZhY2VcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTZXNzaW9uUHJvamVjdGlvblNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgcHJvamVjdGlvbiBtb2RlIGlzIGFjdGl2ZS5cblx0ICovXG5cdHJlYWRvbmx5IGlzQWN0aXZlOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uIGluIHByb2plY3Rpb24gbW9kZSwgaWYgYW55LlxuXHQgKi9cblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRXZlbnQgZmlyZWQgd2hlbiBwcm9qZWN0aW9uIG1vZGUgY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvamVjdGlvbk1vZGU6IEV2ZW50PGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBFdmVudCBmaXJlZCB3aGVuIHRoZSBhY3RpdmUgc2Vzc2lvbiBjaGFuZ2VzIChpbmNsdWRpbmcgd2hlbiBzd2l0Y2hpbmcgYmV0d2VlbiBzZXNzaW9ucykuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVNlc3Npb246IEV2ZW50PElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBFbnRlciBwcm9qZWN0aW9uIG1vZGUgZm9yIHRoZSBnaXZlbiBzZXNzaW9uLlxuXHQgKi9cblx0ZW50ZXJQcm9qZWN0aW9uKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBFeGl0IHByb2plY3Rpb24gbW9kZS5cblx0ICogQHBhcmFtIG9wdGlvbnMuc3RhcnROZXdDaGF0IElmIHRydWUgKGRlZmF1bHQpLCBzdGFydHMgYSBuZXcgY2hhdCBhZnRlciBleGl0aW5nLiBTZXQgdG8gZmFsc2UgdG8ga2VlcCB0aGUgY3VycmVudCBjaGF0IG9wZW4uXG5cdCAqL1xuXHRleGl0UHJvamVjdGlvbihvcHRpb25zPzogeyBzdGFydE5ld0NoYXQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY29uc3QgSUFnZW50U2Vzc2lvblByb2plY3Rpb25TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudFNlc3Npb25Qcm9qZWN0aW9uU2VydmljZT4oJ2FnZW50U2Vzc2lvblByb2plY3Rpb25TZXJ2aWNlJyk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uIFNlcnZpY2UgSW1wbGVtZW50YXRpb25cblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvblByb2plY3Rpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudFNlc3Npb25Qcm9qZWN0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfaXNBY3RpdmUgPSBmYWxzZTtcblx0Z2V0IGlzQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNBY3RpdmU7IH1cblxuXHQvKiogUHJldmVudHMgcmUtZW50cmFudCBleGl0cyBhbmQgZW50ZXItb24tZXhpdCByYWNlcyAqL1xuXHRwcml2YXRlIF9pc0V4aXRpbmcgPSBmYWxzZTtcblxuXHQvKiogUHJldmVudHMgY2hlY2tGb3JFbXB0eUVkaXRvcnMgZnJvbSBleGl0aW5nIGR1cmluZyBzZXNzaW9uIHN3YXBzICovXG5cdHByaXZhdGUgX2lzU3dhcHBpbmdTZXNzaW9ucyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2FjdGl2ZVNlc3Npb246IElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdGdldCBhY3RpdmVTZXNzaW9uKCk6IElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fYWN0aXZlU2Vzc2lvbjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvamVjdGlvbk1vZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9qZWN0aW9uTW9kZSA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvamVjdGlvbk1vZGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvbiA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pblByb2plY3Rpb25Nb2RlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0LyoqIFdvcmtpbmcgc2V0IHNhdmVkIHdoZW4gZW50ZXJpbmcgcHJvamVjdGlvbiBtb2RlICh0byByZXN0b3JlIG9uIGV4aXQpICovXG5cdHByaXZhdGUgX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0OiBJRWRpdG9yV29ya2luZ1NldCB8IHVuZGVmaW5lZDtcblxuXHQvKiogV29ya2luZyBzZXRzIHBlciBzZXNzaW9uLCBrZXllZCBieSBzZXNzaW9uIHJlc291cmNlIFVSSSBzdHJpbmcgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbldvcmtpbmdTZXRzID0gbmV3IE1hcDxzdHJpbmcsIElFZGl0b3JXb3JraW5nU2V0PigpO1xuXG5cdC8qKiBXaGV0aGVyIHRoZSBhdXhpbGlhcnkgYmFyIHdhcyBtYXhpbWl6ZWQgd2hlbiBlbnRlcmluZyBwcm9qZWN0aW9uIG1vZGUgKi9cblx0cHJpdmF0ZSBfd2FzQXV4aWxpYXJ5QmFyTWF4aW1pemVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVkaXRpbmdTZXJ2aWNlOiBJQ2hhdEVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZTogSUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faW5Qcm9qZWN0aW9uTW9kZUNvbnRleHRLZXkgPSBpbkFnZW50U2Vzc2lvblByb2plY3Rpb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgZWRpdG9yIGNsb3NlIGV2ZW50cyB0byBleGl0IHByb2plY3Rpb24gbW9kZSB3aGVuIGFsbCBlZGl0b3JzIGFyZSBjbG9zZWRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRDbG9zZUVkaXRvcigoKSA9PiB0aGlzLl9jaGVja0ZvckVtcHR5RWRpdG9ycygpKSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNlc3Npb24gY2hhbmdlcyB0byBleGl0IHByb2plY3Rpb24gbW9kZSBpZiBhY3RpdmUgc2Vzc2lvbiBiZWNvbWVzIGluIHByb2dyZXNzXG5cdFx0Ly8gTm90ZTogb25EaWRDaGFuZ2VTZXNzaW9ucyBmaXJlcyBmb3IgYW55IHNlc3Npb24gY2hhbmdlLCBidXQgX2NoZWNrRm9ySW5Qcm9ncmVzc1Nlc3Npb24oKVxuXHRcdC8vIGhhcyBlYXJseSBleGl0IGd1YXJkcyBhbmQgb25seSBjaGVja3Mgd2hlbiBwcm9qZWN0aW9uIG1vZGUgaXMgYWN0aXZlLCBtYWtpbmcgdGhpcyBlZmZpY2llbnRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4gdGhpcy5fY2hlY2tGb3JJblByb2dyZXNzU2Vzc2lvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRTZXNzaW9uUHJvamVjdGlvbkVuYWJsZWQpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tGb3JFbXB0eUVkaXRvcnMoKTogdm9pZCB7XG5cdFx0Ly8gT25seSBjaGVjayBpZiB3ZSdyZSBpbiBwcm9qZWN0aW9uIG1vZGUgYW5kIG5vdCBzd2FwcGluZyBzZXNzaW9uc1xuXHRcdGlmICghdGhpcy5faXNBY3RpdmUgfHwgdGhpcy5faXNFeGl0aW5nIHx8IHRoaXMuX2lzU3dhcHBpbmdTZXNzaW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbnkgdmlzaWJsZSBlZGl0b3JzXG5cdFx0Y29uc3QgaGFzVmlzaWJsZUVkaXRvcnMgPSB0aGlzLmVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvcnMubGVuZ3RoID4gMDtcblxuXHRcdGlmICghaGFzVmlzaWJsZUVkaXRvcnMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIEFsbCBlZGl0b3JzIGNsb3NlZCwgZXhpdGluZyBwcm9qZWN0aW9uIG1vZGUnKTtcblx0XHRcdHRoaXMuZXhpdFByb2plY3Rpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja0ZvckluUHJvZ3Jlc3NTZXNzaW9uKCk6IHZvaWQge1xuXHRcdC8vIE9ubHkgY2hlY2sgaWYgd2UncmUgaW4gcHJvamVjdGlvbiBtb2RlXG5cdFx0aWYgKCF0aGlzLl9pc0FjdGl2ZSB8fCAhdGhpcy5fYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgdXBkYXRlZCBzZXNzaW9uIGZyb20gdGhlIG1vZGVsXG5cdFx0Y29uc3QgdXBkYXRlZFNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24odGhpcy5fYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0aWYgKCF1cGRhdGVkU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBzZXNzaW9uIGlzIG5vdyBpbiBwcm9ncmVzcywgZXhpdCBwcm9qZWN0aW9uIG1vZGVcblx0XHRpZiAoaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyh1cGRhdGVkU2Vzc2lvbi5zdGF0dXMpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBBY3RpdmUgc2Vzc2lvbiB0cmFuc2l0aW9uZWQgdG8gaW4tcHJvZ3Jlc3MsIGV4aXRpbmcgcHJvamVjdGlvbiBtb2RlJyk7XG5cdFx0XHR0aGlzLmV4aXRQcm9qZWN0aW9uKHsgc3RhcnROZXdDaGF0OiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogT3BlbnMgYSBzZXNzaW9uIGluIHRoZSBjaGF0IHBhbmVsIHdpdGhvdXQgZW50ZXJpbmcgcHJvamVjdGlvbiBtb2RlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfb3BlblNlc3Npb25JbkNoYXRQYW5lbChzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXHRcdGF3YWl0IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5hY3RpdmF0ZUNoYXRTZXNzaW9uSXRlbVByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJUeXBlKTtcblx0XHRhd2FpdCB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UsIHVuZGVmaW5lZCwge1xuXHRcdFx0dGl0bGU6IHsgcHJlZmVycmVkOiBzZXNzaW9uLmxhYmVsIH0sXG5cdFx0XHRyZXZlYWxJZk9wZW5lZDogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW4gdGhlIHNlc3Npb24ncyBmaWxlcyBpbiBhIG11bHRpLWRpZmYgZWRpdG9yLlxuXHQgKiBAcmV0dXJucyB0cnVlIGlmIGFueSBmaWxlcyB3ZXJlIG9wZW5lZCwgZmFsc2UgaWYgbm90aGluZyB0byBkaXNwbGF5XG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vcGVuU2Vzc2lvbkZpbGVzKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBPcGVuaW5nIGZpbGVzIGZvciBzZXNzaW9uICcke3Nlc3Npb24ubGFiZWx9J2AsIHtcblx0XHRcdGhhc0NoYW5nZXM6ICEhc2Vzc2lvbi5jaGFuZ2VzLFxuXHRcdFx0aXNBcnJheTogQXJyYXkuaXNBcnJheShzZXNzaW9uLmNoYW5nZXMpLFxuXHRcdFx0Y2hhbmdlQ291bnQ6IEFycmF5LmlzQXJyYXkoc2Vzc2lvbi5jaGFuZ2VzKSA/IHNlc3Npb24uY2hhbmdlcy5sZW5ndGggOiAwXG5cdFx0fSk7XG5cblx0XHQvLyBPcGVuIGNoYW5nZXMgZnJvbSB0aGUgc2Vzc2lvbiBhcyBhIG11bHRpLWRpZmYgZWRpdG9yIChsaWtlIGVkaXQgc2Vzc2lvbiB2aWV3KVxuXHRcdGlmIChzZXNzaW9uLmNoYW5nZXMgJiYgQXJyYXkuaXNBcnJheShzZXNzaW9uLmNoYW5nZXMpICYmIHNlc3Npb24uY2hhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBGaWx0ZXIgdG8gY2hhbmdlcyB0aGF0IGhhdmUgYm90aCBvcmlnaW5hbCBhbmQgbW9kaWZpZWQgVVJJcyBmb3IgZGlmZiB2aWV3XG5cdFx0XHRjb25zdCBkaWZmUmVzb3VyY2VzID0gc2Vzc2lvbi5jaGFuZ2VzXG5cdFx0XHRcdC5maWx0ZXIoY2hhbmdlID0+IGNoYW5nZS5vcmlnaW5hbFVyaSlcblx0XHRcdFx0Lm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogY2hhbmdlLm9yaWdpbmFsVXJpISxcblx0XHRcdFx0XHRtb2RpZmllZFVyaTogY2hhbmdlLm1vZGlmaWVkVXJpXG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gRm91bmQgJHtkaWZmUmVzb3VyY2VzLmxlbmd0aH0gZmlsZXMgd2l0aCBkaWZmcyB0byBkaXNwbGF5YCk7XG5cblx0XHRcdGlmIChkaWZmUmVzb3VyY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gT3BlbiBtdWx0aS1kaWZmIGVkaXRvciBzaG93aW5nIGFsbCBjaGFuZ2VzIGluIGEgbW9kYWwgZWRpdG9yXG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRtdWx0aURpZmZTb3VyY2U6IHNlc3Npb24ucmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogc2Vzc2lvbi5yZXNvdXJjZS5zY2hlbWUgKyAnLWFnZW50LXNlc3Npb24tcHJvamVjdGlvbicgfSksXG5cdFx0XHRcdFx0cmVzb3VyY2VzOiBkaWZmUmVzb3VyY2VzLm1hcChkciA9PiAoe1xuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IGRyLm9yaWdpbmFsVXJpIH0sXG5cdFx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogZHIubW9kaWZpZWRVcmkgfVxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50U2Vzc2lvblByb2plY3Rpb24uY2hhbmdlcy50aXRsZScsICd7MH0gLSBBbGwgQ2hhbmdlcycsIHNlc3Npb24ubGFiZWwpLFxuXHRcdFx0XHR9LCBNT0RBTF9HUk9VUCk7XG5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gTXVsdGktZGlmZiBlZGl0b3Igb3BlbmVkIHN1Y2Nlc3NmdWxseSBpbiBtb2RhbCB2aWV3YCk7XG5cblx0XHRcdFx0Ly8gU2F2ZSB0aGlzIGFzIHRoZSBzZXNzaW9uJ3Mgd29ya2luZyBzZXRcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgbmV3V29ya2luZ1NldCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5zYXZlV29ya2luZ1NldChgYWdlbnQtc2Vzc2lvbi1wcm9qZWN0aW9uLSR7c2Vzc2lvbktleX1gKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbldvcmtpbmdTZXRzLnNldChzZXNzaW9uS2V5LCBuZXdXb3JraW5nU2V0KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBObyBmaWxlcyB3aXRoIGRpZmZzIHRvIGRpc3BsYXkgKGFsbCBjaGFuZ2VzIG1pc3Npbmcgb3JpZ2luYWxVcmkpYCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gU2Vzc2lvbiBoYXMgbm8gY2hhbmdlcyB0byBkaXNwbGF5YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZW50ZXJQcm9qZWN0aW9uKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDaGVjayBpZiB0aGUgZmVhdHVyZSBpcyBlbmFibGVkXG5cdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uIGlzIGRpc2FibGVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBzZXNzaW9uJ3MgcHJvdmlkZXIgdHlwZSBzdXBwb3J0cyBhZ2VudCBzZXNzaW9uIHByb2plY3Rpb25cblx0XHRpZiAoIUFHRU5UX1NFU1NJT05fUFJPSkVDVElPTl9FTkFCTEVEX1BST1ZJREVSUy5oYXMoc2Vzc2lvbi5wcm92aWRlclR5cGUpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBQcm92aWRlciB0eXBlICcke3Nlc3Npb24ucHJvdmlkZXJUeXBlfScgZG9lcyBub3Qgc3VwcG9ydCBhZ2VudCBzZXNzaW9uIHByb2plY3Rpb25gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZXRlY3QgaWYgYXV4aWxpYXJ5IGJhciBpcyBtYXhpbWl6ZWQgYmVmb3JlIGFueSBsYXlvdXQgY2hhbmdlc1xuXHRcdGNvbnN0IGlzQXV4QmFyTWF4aW1pemVkID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gZW50ZXJQcm9qZWN0aW9uIGF1eGlsaWFyeSBiYXIgc3RhdGUnLCB7XG5cdFx0XHRpc0F1eGlsaWFyeUJhck1heGltaXplZDogaXNBdXhCYXJNYXhpbWl6ZWRcblx0XHR9KTtcblxuXHRcdC8vIE5ldmVyIGVudGVyIHByb2plY3Rpb24gbW9kZSBmb3Igc2Vzc2lvbnMgdGhhdCBhcmUgaW4gcHJvZ3Jlc3Ncblx0XHQvLyBUaGUgdXNlciBzaG91bGQgb25seSBiZSBpbiBwcm9qZWN0aW9uIG1vZGUgd2hlbiByZXZpZXdpbmcgY29tcGxldGVkIGNvZGVcblx0XHRpZiAoaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyhzZXNzaW9uLnN0YXR1cykpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIFNlc3Npb24gaXMgaW4gcHJvZ3Jlc3MsIG9wZW5pbmcgY2hhdCB3aXRob3V0IHByb2plY3Rpb24gbW9kZScpO1xuXHRcdFx0Ly8gSWYgd2UncmUgYWxyZWFkeSBpbiBwcm9qZWN0aW9uIG1vZGUgYW5kIHN3aXRjaGluZyB0byBhbiBpbi1wcm9ncmVzcyBzZXNzaW9uLCBleGl0IHByb2plY3Rpb25cblx0XHRcdGlmICh0aGlzLl9pc0FjdGl2ZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4aXRQcm9qZWN0aW9uKHsgc3RhcnROZXdDaGF0OiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX29wZW5TZXNzaW9uSW5DaGF0UGFuZWwoc2Vzc2lvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGxvY2FsIHNlc3Npb25zLCBjaGVjayBpZiB0aGVyZSBhcmUgcGVuZGluZyBlZGl0cyB0byBzaG93XG5cdFx0Ly8gSWYgdGhlcmUncyBub3RoaW5nIHRvIGZvY3VzLCBqdXN0IG9wZW4gdGhlIGNoYXQgd2l0aG91dCBlbnRlcmluZyBwcm9qZWN0aW9uIG1vZGVcblx0XHRsZXQgaGFzVW5kZWNpZGVkQ2hhbmdlcyA9IHRydWU7XG5cdFx0bGV0IGVkaXRpbmdTZXNzaW9uRXhpc3RzID0gdHJ1ZTtcblx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlclR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkge1xuXHRcdFx0Y29uc3QgZWRpdGluZ1Nlc3Npb24gPSB0aGlzLmNoYXRFZGl0aW5nU2VydmljZS5nZXRFZGl0aW5nU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdGVkaXRpbmdTZXNzaW9uRXhpc3RzID0gISFlZGl0aW5nU2Vzc2lvbjtcblx0XHRcdGlmIChlZGl0aW5nU2Vzc2lvbikge1xuXHRcdFx0XHRoYXNVbmRlY2lkZWRDaGFuZ2VzID0gZWRpdGluZ1Nlc3Npb24uZW50cmllcy5nZXQoKS5zb21lKGUgPT4gZS5zdGF0ZS5nZXQoKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cdFx0XHRcdGlmICghaGFzVW5kZWNpZGVkQ2hhbmdlcykge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIExvY2FsIHNlc3Npb24gaGFzIG5vIHVuZGVjaWRlZCBjaGFuZ2VzLCBvcGVuaW5nIGNoYXQgd2l0aG91dCBwcm9qZWN0aW9uIG1vZGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRWRpdGluZyBzZXNzaW9uIGRvZXNuJ3QgZXhpc3QgeWV0IC0gdHJlYXQgYXMgbm8gY2hhbmdlcyBmb3Igbm93XG5cdFx0XHRcdGhhc1VuZGVjaWRlZENoYW5nZXMgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gTG9jYWwgc2Vzc2lvbiBoYXMgbm8gZWRpdGluZyBzZXNzaW9uIHlldCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG5vIHVuZGVjaWRlZCBjaGFuZ2VzIGFuZCB3ZSdyZSBhbHJlYWR5IGluIHByb2plY3Rpb24gbW9kZSwgZXhpdCBwcm9qZWN0aW9uXG5cdFx0Ly8gQnV0IG9ubHkgaWYgd2UgYWN0dWFsbHkgY2hlY2tlZCB0aGUgZWRpdGluZyBzZXNzaW9uIChpdCBleGlzdHMpIC0gaWYgaXQncyB1bmRlZmluZWQsXG5cdFx0Ly8gaXQgbWlnaHQganVzdCBub3QgYmUgbG9hZGVkIHlldCwgc28gZG9uJ3QgZXhpdCBwcm9qZWN0aW9uIGluIHRoYXQgY2FzZVxuXHRcdGlmICghaGFzVW5kZWNpZGVkQ2hhbmdlcyAmJiB0aGlzLl9pc0FjdGl2ZSAmJiBlZGl0aW5nU2Vzc2lvbkV4aXN0cykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gU3dpdGNoaW5nIHRvIHNlc3Npb24gd2l0aG91dCBjaGFuZ2VzIHdoaWxlIGluIHByb2plY3Rpb24gbW9kZSwgZXhpdGluZyBwcm9qZWN0aW9uJyk7XG5cdFx0XHRhd2FpdCB0aGlzLmV4aXRQcm9qZWN0aW9uKHsgc3RhcnROZXdDaGF0OiBmYWxzZSB9KTtcblx0XHRcdGF3YWl0IHRoaXMuX29wZW5TZXNzaW9uSW5DaGF0UGFuZWwoc2Vzc2lvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UncmUgc3dpdGNoaW5nIHRvIGEgc2Vzc2lvbiB3aXRob3V0IGFuIGVkaXRpbmcgc2Vzc2lvbiB5ZXQgd2hpbGUgaW4gcHJvamVjdGlvbixcblx0XHQvLyBqdXN0IG9wZW4gdGhlIGNoYXQgcGFuZWwgYnV0IHN0YXkgaW4gcHJvamVjdGlvbiBtb2RlIChsZXQgdGhlIGVkaXRpbmcgc2Vzc2lvbiBsb2FkKVxuXHRcdGlmICghaGFzVW5kZWNpZGVkQ2hhbmdlcyAmJiB0aGlzLl9pc0FjdGl2ZSAmJiAhZWRpdGluZ1Nlc3Npb25FeGlzdHMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIFN3aXRjaGluZyB0byBzZXNzaW9uIHdpdGhvdXQgZWRpdGluZyBzZXNzaW9uIHdoaWxlIGluIHByb2plY3Rpb24gbW9kZSwgc3RheWluZyBpbiBwcm9qZWN0aW9uJyk7XG5cdFx0XHRhd2FpdCB0aGlzLl9vcGVuU2Vzc2lvbkluQ2hhdFBhbmVsKHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgZW50ZXIgcHJvamVjdGlvbiBtb2RlIGlmIHRoZXJlIGFyZSBjaGFuZ2VzIHRvIHNob3dcblx0XHRpZiAoaGFzVW5kZWNpZGVkQ2hhbmdlcykge1xuXHRcdFx0Ly8gQ2FwdHVyZSB0aGUgdXNlcidzIHdvcmtpbmcgc2V0IGltbWVkaWF0ZWx5IChiZWZvcmUgYW55IGVkaXRvcnMgYXJlIGNsZWFyZWQpXG5cdFx0XHRpZiAoIXRoaXMuX2lzQWN0aXZlICYmICF0aGlzLl9wcmVQcm9qZWN0aW9uV29ya2luZ1NldCkge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlRWRpdG9yc0JlZm9yZSA9IHRoaXMuZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9ycy5sZW5ndGg7XG5cdFx0XHRcdHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLnNhdmVXb3JraW5nU2V0KCdhZ2VudC1zZXNzaW9uLXByb2plY3Rpb24tYmFja3VwJyk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIHNhdmVkIHByZS1wcm9qZWN0aW9uIHdvcmtpbmcgc2V0Jywge1xuXHRcdFx0XHRcdGlkOiB0aGlzLl9wcmVQcm9qZWN0aW9uV29ya2luZ1NldC5pZCxcblx0XHRcdFx0XHR2aXNpYmxlRWRpdG9yc0JlZm9yZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IHN3YXBwaW5nIGZsYWcgdG8gcHJldmVudCBjaGVja0ZvckVtcHR5RWRpdG9ycyBmcm9tIGV4aXRpbmcgZHVyaW5nIHNlc3Npb24gc3dhcFxuXHRcdFx0Y29uc3QgaXNTd2FwcGluZyA9IHRoaXMuX2lzQWN0aXZlICYmIHRoaXMuX2FjdGl2ZVNlc3Npb247XG5cdFx0XHRpZiAoaXNTd2FwcGluZykge1xuXHRcdFx0XHR0aGlzLl9pc1N3YXBwaW5nU2Vzc2lvbnMgPSB0cnVlO1xuXHRcdFx0XHQvLyBBbHJlYWR5IGluIHByb2plY3Rpb24gbW9kZSwgc3dpdGNoaW5nIHNlc3Npb25zIC0gc2F2ZSB0aGUgY3VycmVudCBzZXNzaW9uJ3Mgd29ya2luZyBzZXRcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNTZXNzaW9uS2V5ID0gdGhpcy5fYWN0aXZlU2Vzc2lvbiEucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNXb3JraW5nU2V0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLnNhdmVXb3JraW5nU2V0KGBhZ2VudC1zZXNzaW9uLXByb2plY3Rpb24tJHtwcmV2aW91c1Nlc3Npb25LZXl9YCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Xb3JraW5nU2V0cy5zZXQocHJldmlvdXNTZXNzaW9uS2V5LCBwcmV2aW91c1dvcmtpbmdTZXQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBGb3IgbG9jYWwgc2Vzc2lvbnMsIGNoYW5nZXMgYXJlIHNob3duIHZpYSBjaGF0RWRpdGluZy52aWV3Q2hhbmdlcywgbm90IF9vcGVuU2Vzc2lvbkZpbGVzXG5cdFx0XHRcdC8vIEZvciBvdGhlciBwcm92aWRlcnMsIHRyeSB0byBvcGVuIHNlc3Npb24gZmlsZXMgZnJvbSBzZXNzaW9uLmNoYW5nZXNcblx0XHRcdFx0bGV0IGZpbGVzT3BlbmVkID0gZmFsc2U7XG5cdFx0XHRcdGlmIChzZXNzaW9uLnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKSB7XG5cdFx0XHRcdFx0Ly8gTG9jYWwgc2Vzc2lvbnMgdXNlIGVkaXRpbmcgc2Vzc2lvbiBmb3IgY2hhbmdlcyAtIHdlIGFscmVhZHkgdmVyaWZpZWQgaGFzVW5kZWNpZGVkQ2hhbmdlcyBhYm92ZVxuXHRcdFx0XHRcdGZpbGVzT3BlbmVkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBUcnkgdG8gb3BlbiBzZXNzaW9uIGZpbGVzIC0gb25seSBjb250aW51ZSB3aXRoIHByb2plY3Rpb24gaWYgZmlsZXMgd2VyZSBkaXNwbGF5ZWRcblx0XHRcdFx0XHRmaWxlc09wZW5lZCA9IGF3YWl0IHRoaXMuX29wZW5TZXNzaW9uRmlsZXMoc2Vzc2lvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWZpbGVzT3BlbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gTm8gZmlsZXMgdG8gZGlzcGxheSwgb3BlbmluZyBjaGF0IHdpdGhvdXQgcHJvamVjdGlvbiBtb2RlJyk7XG5cdFx0XHRcdFx0Ly8gUmVzdG9yZSB0aGUgd29ya2luZyBzZXQgd2UganVzdCBzYXZlZCBpZiB0aGlzIHdhcyBvdXIgZmlyc3QgYXR0ZW1wdFxuXHRcdFx0XHRcdGlmICghdGhpcy5faXNBY3RpdmUgJiYgdGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5hcHBseVdvcmtpbmdTZXQodGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQpO1xuXHRcdFx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmRlbGV0ZVdvcmtpbmdTZXQodGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEZhbGwgdGhyb3VnaCB0byBqdXN0IG9wZW4gdGhlIGNoYXQgcGFuZWxcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBTZXQgYWN0aXZlIHN0YXRlXG5cdFx0XHRcdFx0Y29uc3Qgd2FzQWN0aXZlID0gdGhpcy5faXNBY3RpdmU7XG5cdFx0XHRcdFx0dGhpcy5faXNBY3RpdmUgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb24gPSBzZXNzaW9uO1xuXHRcdFx0XHRcdHRoaXMuX2luUHJvamVjdGlvbk1vZGVDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9uLXByb2plY3Rpb24tYWN0aXZlJyk7XG5cblx0XHRcdFx0XHQvLyBDYXB0dXJlIGF1eGlsaWFyeSBiYXIgbWF4aW1pemVkIHN0YXRlIHdoZW4gZmlyc3QgZW50ZXJpbmcgcHJvamVjdGlvblxuXHRcdFx0XHRcdGlmICghd2FzQWN0aXZlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl93YXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQgPSBpc0F1eEJhck1heGltaXplZDtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIGNhcHR1cmVkIGF1eGlsaWFyeSBiYXIgbWF4aW1pemVkIHN0YXRlJywge1xuXHRcdFx0XHRcdFx0XHR3YXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQ6IHRoaXMuX3dhc0F1eGlsaWFyeUJhck1heGltaXplZFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBhZ2VudCBzdGF0dXMgdG8gc2hvdyBzZXNzaW9uIG1vZGVcblx0XHRcdFx0XHR0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLmVudGVyU2Vzc2lvbk1vZGUoc2Vzc2lvbi5yZXNvdXJjZSwgc2Vzc2lvbi5sYWJlbCk7XG5cblx0XHRcdFx0XHRpZiAoIXdhc0FjdGl2ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9qZWN0aW9uTW9kZS5maXJlKHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBBbHdheXMgZmlyZSBzZXNzaW9uIGNoYW5nZSBldmVudCAoZm9yIHRpdGxlIHVwZGF0ZXMgd2hlbiBzd2l0Y2hpbmcgc2Vzc2lvbnMpXG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uLmZpcmUoc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdC8vIENsZWFyIHN3YXBwaW5nIGZsYWdcblx0XHRcdFx0dGhpcy5faXNTd2FwcGluZ1Nlc3Npb25zID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiB0aGUgc2Vzc2lvbiBpbiB0aGUgY2hhdCBwYW5lbCAoYWx3YXlzLCBldmVuIHdpdGhvdXQgY2hhbmdlcylcblx0XHRhd2FpdCB0aGlzLl9vcGVuU2Vzc2lvbkluQ2hhdFBhbmVsKHNlc3Npb24pO1xuXG5cdFx0Ly8gRm9yIGxvY2FsIHNlc3Npb25zIHdpdGggY2hhbmdlcywgYWxzbyBwb3Agb3BlbiB0aGUgZWRpdCBzZXNzaW9uJ3MgY2hhbmdlcyB2aWV3XG5cdFx0Ly8gTXVzdCBiZSBhZnRlciBvcGVuU2Vzc2lvbiBzbyB0aGUgZWRpdGluZyBzZXNzaW9uIGNvbnRleHQgaXMgYXZhaWxhYmxlXG5cdFx0aWYgKHNlc3Npb24ucHJvdmlkZXJUeXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwgJiYgaGFzVW5kZWNpZGVkQ2hhbmdlcykge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnY2hhdEVkaXRpbmcudmlld0NoYW5nZXMnKTtcblx0XHR9XG5cblx0XHQvLyBJZiBhdXhpbGlhcnkgYmFyIHdhcyBtYXhpbWl6ZWQsIGhpZGUgaXQgZHVyaW5nIHByb2plY3Rpb24gdG8gc2hvdyBmdWxsIGVkaXRvclxuXHRcdC8vIFRoaXMgbXVzdCBiZSBkb25lIGFmdGVyIG9wZW5pbmcgdGhlIHNlc3Npb24gdG8gYXZvaWQgdGhlIHNlc3Npb24gb3BlbmluZyByZS1zaG93aW5nIHRoZSBiYXJcblx0XHRpZiAodGhpcy5fd2FzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBoaWRpbmcgbWF4aW1pemVkIGF1eGlsaWFyeSBiYXIgZHVyaW5nIHByb2plY3Rpb24nKTtcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBleGl0UHJvamVjdGlvbihvcHRpb25zPzogeyBzdGFydE5ld0NoYXQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2lzQWN0aXZlIHx8IHRoaXMuX2lzRXhpdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0TmV3Q2hhdCA9IG9wdGlvbnM/LnN0YXJ0TmV3Q2hhdCA/PyB0cnVlO1xuXHRcdHRoaXMuX2lzRXhpdGluZyA9IHRydWU7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gZXhpdFByb2plY3Rpb24gc3RhcnQnLCB7XG5cdFx0XHRoYXNQcmVQcm9qZWN0aW9uV29ya2luZ1NldDogISF0aGlzLl9wcmVQcm9qZWN0aW9uV29ya2luZ1NldCxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHRoaXMuX2FjdGl2ZVNlc3Npb24/LmxhYmVsLFxuXHRcdFx0c3RhcnROZXdDaGF0LFxuXHRcdFx0d2FzQXV4aWxpYXJ5QmFyTWF4aW1pemVkOiB0aGlzLl93YXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWRcblx0XHR9KTtcblxuXHRcdC8vIFNhdmUgdGhlIGN1cnJlbnQgc2Vzc2lvbidzIHdvcmtpbmcgc2V0IGJlZm9yZSBleGl0aW5nXG5cdFx0aWYgKHRoaXMuX2FjdGl2ZVNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSB0aGlzLl9hY3RpdmVTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCB3b3JraW5nU2V0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLnNhdmVXb3JraW5nU2V0KGBhZ2VudC1zZXNzaW9uLXByb2plY3Rpb24tJHtzZXNzaW9uS2V5fWApO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbldvcmtpbmdTZXRzLnNldChzZXNzaW9uS2V5LCB3b3JraW5nU2V0KTtcblx0XHR9XG5cblx0XHQvLyBDbG9zZSBwcm9qZWN0aW9uIGVkaXRvcnMgKG11bHRpLWRpZmYsIGV0Yy4pIHNvIHRoZSByZXN0b3JlZCBzZXQgaXMgY2xlYW5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdH1cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBleGl0UHJvamVjdGlvbiBjbG9zZWQgZWRpdG9ycycsIHsgdmlzaWJsZTogdGhpcy5lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JzLmxlbmd0aCB9KTtcblxuXHRcdC8vIFJlc3RvcmUgdGhlIHByZS1wcm9qZWN0aW9uIHdvcmtpbmcgc2V0IChvcmlnaW5hbCB0YWJzKVxuXHRcdGlmICh0aGlzLl9wcmVQcm9qZWN0aW9uV29ya2luZ1NldCkge1xuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFwcGx5V29ya2luZ1NldCh0aGlzLl9wcmVQcm9qZWN0aW9uV29ya2luZ1NldCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBleGl0UHJvamVjdGlvbiBhcHBsaWVkIHByZS1wcm9qZWN0aW9uIHdvcmtpbmcgc2V0Jywge1xuXHRcdFx0XHR2aXNpYmxlOiB0aGlzLmVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvcnMubGVuZ3RoLFxuXHRcdFx0XHRpZDogdGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQuaWRcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmRlbGV0ZVdvcmtpbmdTZXQodGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQpO1xuXHRcdFx0dGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5hcHBseVdvcmtpbmdTZXQoJ2VtcHR5JywgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gZXhpdFByb2plY3Rpb24gbm8gcHJlLXdvcmtpbmcgc2V0LCBhcHBsaWVkIGVtcHR5Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNBY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2luUHJvamVjdGlvbk1vZGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0Y29uc3Qgc2hvdWxkUmVzdG9yZU1heGltaXplZCA9IHRoaXMuX3dhc0F1eGlsaWFyeUJhck1heGltaXplZDtcblx0XHR0aGlzLl93YXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHR0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdhZ2VudC1zZXNzaW9uLXByb2plY3Rpb24tYWN0aXZlJyk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIGFnZW50IHN0YXR1cyB0byBleGl0IHNlc3Npb24gbW9kZVxuXHRcdHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UuZXhpdFNlc3Npb25Nb2RlKCk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb2plY3Rpb25Nb2RlLmZpcmUoZmFsc2UpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvbi5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTdGFydCBhIG5ldyBjaGF0IHRvIGNsZWFyIHRoZSBzaWRlYmFyICh1bmxlc3MgY2FsbGVyIHdhbnRzIHRvIGtlZXAgY3VycmVudCBjaGF0KVxuXHRcdGlmIChzdGFydE5ld0NoYXQpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUNUSU9OX0lEX05FV19DSEFUKTtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIGF1eGlsaWFyeSBiYXIgbWF4aW1pemVkIHN0YXRlIGlmIGl0IHdhcyBtYXhpbWl6ZWQgYmVmb3JlIGVudGVyaW5nIHByb2plY3Rpb25cblx0XHRpZiAoc2hvdWxkUmVzdG9yZU1heGltaXplZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gcmVzdG9yaW5nIGF1eGlsaWFyeSBiYXIgbWF4aW1pemVkIHN0YXRlJyk7XG5cdFx0XHQvLyBGaXJzdCBzaG93IHRoZSBhdXhpbGlhcnkgYmFyLCB0aGVuIG1heGltaXplIGl0XG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5tYXhpbWl6ZUF1eGlsaWFyeUJhcicpO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIGV4aXRQcm9qZWN0aW9uIGNvbXBsZXRlJyk7XG5cdFx0dGhpcy5faXNFeGl0aW5nID0gZmFsc2U7XG5cdH1cbn1cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBK0M7QUFDeEQsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzVDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXdCLGlDQUFpQztBQUN6RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QixhQUFhO0FBQy9DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLDhCQUE4QjtBQUM1RCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQVEvQixNQUFNLDZDQUEwRCxJQUFJLElBQUksT0FBTyxPQUFPLHFCQUFxQixDQUFDO0FBeUM1RyxNQUFNLGlDQUFpQyxnQkFBZ0QsK0JBQStCO0FBTXRILElBQU0sZ0NB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
