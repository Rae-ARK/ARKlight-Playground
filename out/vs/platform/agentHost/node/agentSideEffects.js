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
import { getErrorCode } from "../../../base/common/errors.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { NKeyMap } from "../../../base/common/map.js";
import { equals } from "../../../base/common/objects.js";
import { autorun } from "../../../base/common/observable.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostChangesetService } from "../common/agentHostChangesetService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { AgentHostClientType } from "../common/agentHostClientInfo.js";
import { readAgentModelByokIdentifier } from "../common/agentModelByokMeta.js";
import { AgentSession } from "../common/agentService.js";
import { readToolCallMeta, toToolCallMeta } from "../common/meta/agentToolCallMeta.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { resolveChatAttachment } from "../common/state/chatAttachmentContext.js";
import { buildOpenSessionLinkForChatResource } from "../common/openSessionLink.js";
import { SessionInputRequestKind, ToolCallContributorKind } from "../common/state/protocol/state.js";
import { ActionType, isChatAction } from "../common/state/sessionActions.js";
import {
  buildSubagentChatUri,
  chatStorageUri,
  getToolFileEdits,
  isAhpChatChannel,
  isDefaultChatUri,
  isSubagentChatUri,
  isChatReadOnly,
  AH_META_IS_ARCHIVED_DB_KEY,
  AH_META_IS_READ_DB_KEY,
  MessageAttachmentKind,
  MessageKind,
  parseChatUri,
  parseRequiredSessionUriFromChatUri,
  PendingMessageKind,
  ResponsePartKind,
  ROOT_STATE_URI,
  SessionLifecycle,
  SessionStatus,
  ToolCallStatus,
  ToolResultContentType
} from "../common/state/sessionState.js";
import { AgentHostSessionTitleController } from "./agentHostSessionTitleController.js";
import { resolveChatStateForUri } from "./agentHostStateManager.js";
import { AgentHostTelemetryReporter } from "./agentHostTelemetryReporter.js";
import { AgentHostToolCallTracker } from "./agentHostToolCallTracker.js";
import { updateAgentHostTelemetryLevelFromConfig } from "./agentHostTelemetryService.js";
import { AgentHostTurnTracker } from "./agentHostTurnTracker.js";
import { AgentHostLocalCommands } from "./localCommands/localChatCommand.js";
import "./localCommands/localChatCommands.contribution.js";
import { SessionPermissionManager } from "./sessionPermissions.js";
import { stripProxyErrorMarker, toChatErrorMeta, tryParseForwardedChatError } from "./shared/forwardedChatError.js";
import { persistSessionMetadata } from "./shared/persistSessionMetadata.js";
let AgentSideEffects = class extends Disposable {
  constructor(_stateManager, _options, instantiationService, _logService, _changesets, _telemetryService, _checkpointService, _agentConfigService) {
    super();
    this._stateManager = _stateManager;
    this._options = _options;
    this._logService = _logService;
    this._changesets = _changesets;
    this._telemetryService = _telemetryService;
    this._checkpointService = _checkpointService;
    this._agentConfigService = _agentConfigService;
    /** Maps tool call IDs to the agent that owns them, for routing confirmations. */
    this._toolCallAgents = /* @__PURE__ */ new Map();
    /** Managed confirmations are human-only and must never seed host-side session permissions. */
    this._managedApprovalToolCalls = /* @__PURE__ */ new Set();
    this._lastAgentInfos = [];
    this._subagentChats = new NKeyMap();
    this._cancelledTurnIds = /* @__PURE__ */ new Map();
    /**
     * Buffers signals whose `parentToolCallId` references a subagent
     * whose `subagent_started` signal has not yet been processed. The SDK is
     * not strict about ordering: an inner `tool_start` can arrive before the
     * `subagent_started` that creates the child session. Without buffering,
     * those signals would be dispatched against the parent session and the
     * UI would render the inner tool calls flat at the top level rather than
     * grouping them under the subagent. Drained by `_handleSubagentStarted`.
     *
     */
    this._pendingSubagentSignals = new NKeyMap();
    this._queuedMessageSenders = new NKeyMap();
    this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
    this._turnTracker = new AgentHostTurnTracker(this._telemetryReporter);
    this._toolCallTracker = this._register(new AgentHostToolCallTracker(this._telemetryReporter));
    this._permissionManager = this._register(instantiationService.createInstance(SessionPermissionManager, this._stateManager, {}));
    this._localCommands = this._register(instantiationService.createInstance(
      AgentHostLocalCommands,
      this._stateManager,
      this._options.localTurns,
      // Draining the queue re-enters agent lookup / telemetry / sendMessage,
      // which is this class's responsibility, so the dispatcher hands the
      // turn back here once it has completed a host-handled command.
      (turnChannel) => this._tryConsumeNextQueuedMessage(turnChannel)
    ));
    this._titleController = this._register(instantiationService.createInstance(AgentHostSessionTitleController, this._stateManager, {
      sessionDataService: this._options.sessionDataService,
      getGitHubCopilotToken: this._options.getGitHubCopilotToken,
      copilotApiService: this._options.copilotApiService
    }));
    this._register(autorun((reader) => {
      const agents = this._options.agents.read(reader);
      this._publishAgentInfos(agents, reader);
    }));
    this._register(this._stateManager.onDidEmitEnvelope((envelope) => {
      if (isAhpChatChannel(envelope.channel) && isChatAction(envelope.action)) {
        if (envelope.action.type === ActionType.ChatTurnCancelled) {
          let turnIds = this._cancelledTurnIds.get(envelope.channel);
          if (!turnIds) {
            turnIds = /* @__PURE__ */ new Set();
            this._cancelledTurnIds.set(envelope.channel, turnIds);
          }
          turnIds.add(envelope.action.turnId);
        }
        this._syncSessionInputNeededForChatAction(envelope.channel, envelope.action);
        this._trackTurnUsage(envelope.channel, envelope.action);
      }
      if (!envelope.origin && envelope.action.type === ActionType.ChatToolCallComplete) {
        const action = envelope.action;
        if (!isAhpChatChannel(envelope.channel)) {
          return;
        }
        const sessionChannel = parseRequiredSessionUriFromChatUri(envelope.channel);
        this._notifyClientToolCallComplete(sessionChannel, envelope.channel, action.toolCallId, action.result, "server-envelope");
      }
      if (envelope.action.type === ActionType.ChatDraftChanged) {
        this._persistChatDraft(envelope.channel, envelope.action.draft);
      }
      if (envelope.action.type === ActionType.SessionConfigChanged) {
        const values = this._stateManager.getSessionState(envelope.channel)?.config?.values;
        if (values) {
          this._persistSessionFlag(envelope.channel, "configValues", JSON.stringify(values));
        }
      }
      if (!envelope.rejectionReason) {
        if (envelope.action.type === ActionType.SessionIsReadChanged) {
          this._persistSessionFlag(envelope.channel, AH_META_IS_READ_DB_KEY, envelope.action.isRead ? "true" : "");
        } else if (envelope.action.type === ActionType.SessionIsArchivedChanged) {
          this._persistSessionFlag(envelope.channel, AH_META_IS_ARCHIVED_DB_KEY, envelope.action.isArchived ? "true" : "");
        }
      }
    }));
  }
  /**
   * Publishes agent descriptors using the last known model lists.
   */
  _publishAgentInfos(agents, reader) {
    const infos = agents.map((a) => {
      const d = a.getDescriptor();
      const protectedResources = a.getProtectedResources();
      const models = reader ? a.models.read(reader) : a.models.get();
      const customizations = a.getCustomizations?.();
      return {
        provider: d.provider,
        displayName: d.displayName,
        description: d.description,
        models: models.map((m) => ({
          id: m.id,
          provider: m.provider,
          name: m.name,
          maxContextWindow: m.maxContextWindow,
          maxOutputTokens: m.maxOutputTokens,
          maxPromptTokens: m.maxPromptTokens,
          supportsVision: m.supportsVision,
          policyState: m.policyState,
          configSchema: m.configSchema,
          _meta: m._meta
        })),
        customizations: customizations?.length ? [...customizations] : void 0,
        protectedResources: protectedResources.length > 0 ? protectedResources : void 0,
        capabilities: d.capabilities ? { ...d.capabilities } : void 0
      };
    });
    if (equals(this._lastAgentInfos, infos)) {
      return;
    }
    this._lastAgentInfos = infos;
    this._stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootAgentsChanged, agents: infos });
  }
  async _publishSessionCustomizations(agent, session) {
    if (!agent.getSessionCustomizations) {
      return;
    }
    const customizations = await agent.getSessionCustomizations(URI.parse(session));
    const current = this._stateManager.getSessionState(session)?.customizations;
    if (current && equals(current, customizations)) {
      return;
    }
    this._stateManager.dispatchServerAction(session, {
      type: ActionType.SessionCustomizationsChanged,
      customizations: [...customizations]
    });
  }
  _publishSessionCustomizationsSoon(agent, session) {
    void this._publishSessionCustomizations(agent, session).catch((err) => {
      this._logService.error("[AgentSideEffects] getSessionCustomizations failed", err);
    });
  }
  _publishSessionCustomizationsForAgent(agent) {
    for (const session of this._stateManager.getSessionUris()) {
      if (this._options.getAgent(session) === agent) {
        this._publishSessionCustomizationsSoon(agent, session);
      }
    }
  }
  _publishAllSessionCustomizations() {
    for (const session of this._stateManager.getSessionUris()) {
      const agent = this._options.getAgent(session);
      if (agent) {
        this._publishSessionCustomizationsSoon(agent, session);
      }
    }
  }
  // ---- Session input-needed aggregation ----------------------------------
  //
  // Mirrors per-chat blockers (user-input elicitations, tool confirmations,
  // client-tool executions, and MCP authentication) into the owning session's
  // `inputNeeded` list so clients subscribed only to the session channel can
  // discover and answer them without subscribing to each chat. This handler
  // only produces the state; it does not consume it.
  _syncSessionInputNeededForChatAction(chatUri, action) {
    switch (action.type) {
      case ActionType.ChatInputRequested:
        this._syncChatInputNeeded(chatUri, action.request.id);
        break;
      case ActionType.ChatInputAnswerChanged:
        this._syncChatInputNeeded(chatUri, action.requestId);
        break;
      case ActionType.ChatInputCompleted:
        this._removeSessionInputNeeded(chatUri, this._chatInputNeededId(chatUri, action.requestId));
        break;
      case ActionType.ChatToolCallStart:
      case ActionType.ChatToolCallReady:
      case ActionType.ChatToolCallConfirmed:
      case ActionType.ChatToolCallComplete:
      case ActionType.ChatToolCallResultConfirmed:
      case ActionType.ChatToolCallAuthRequired:
      case ActionType.ChatToolCallAuthResolved:
        this._syncToolInputNeeded(chatUri, action.turnId, action.toolCallId);
        break;
      case ActionType.ChatTurnComplete:
      case ActionType.ChatTurnCancelled:
      case ActionType.ChatError:
      case ActionType.ChatTruncated:
        this._removeSessionInputNeededForChat(chatUri);
        break;
    }
  }
  _syncChatInputNeeded(chatUri, requestId) {
    const state = this._stateManager.getSessionState(chatUri);
    const part = state?.activeTurn?.responseParts.find(
      (part2) => part2.kind === ResponsePartKind.InputRequest && part2.response === void 0 && part2.request.id === requestId
    );
    const id = this._chatInputNeededId(chatUri, requestId);
    if (!part || part.kind !== ResponsePartKind.InputRequest) {
      this._removeSessionInputNeeded(chatUri, id);
      return;
    }
    this._setSessionInputNeeded(chatUri, {
      id,
      kind: SessionInputRequestKind.ChatInput,
      chat: chatUri,
      request: part.request
    });
  }
  _syncToolInputNeeded(chatUri, turnId, toolCallId) {
    const confirmationId = this._toolConfirmationNeededId(chatUri, turnId, toolCallId);
    const clientExecutionId = this._toolClientExecutionNeededId(chatUri, turnId, toolCallId);
    const authenticationId = this._toolAuthenticationNeededId(chatUri, turnId, toolCallId);
    const toolCall = this._findToolCall(chatUri, turnId, toolCallId);
    const autoApproved = !!toolCall && readToolCallMeta(toolCall).autoApproveBySetting === true;
    const suppressAutoApprovedConfirmation = autoApproved && toolCall?.status === ToolCallStatus.PendingConfirmation;
    const needsConfirmation = !suppressAutoApprovedConfirmation && (toolCall?.status === ToolCallStatus.PendingConfirmation || toolCall?.status === ToolCallStatus.PendingResultConfirmation);
    if (needsConfirmation && toolCall) {
      this._setSessionInputNeeded(chatUri, {
        id: confirmationId,
        kind: SessionInputRequestKind.ToolConfirmation,
        chat: chatUri,
        turnId,
        toolCall
      });
    } else {
      this._removeSessionInputNeeded(chatUri, confirmationId);
    }
    const contributor = toolCall?.contributor;
    if (!autoApproved && toolCall?.status === ToolCallStatus.Running && contributor?.kind === ToolCallContributorKind.Client) {
      this._setSessionInputNeeded(chatUri, {
        id: clientExecutionId,
        kind: SessionInputRequestKind.ToolClientExecution,
        chat: chatUri,
        turnId,
        clientId: contributor.clientId,
        toolCall
      });
    } else {
      this._removeSessionInputNeeded(chatUri, clientExecutionId);
    }
    if (toolCall?.status === ToolCallStatus.AuthRequired) {
      this._setSessionInputNeeded(chatUri, {
        id: authenticationId,
        kind: SessionInputRequestKind.ToolAuthentication,
        chat: chatUri,
        turnId,
        toolCall
      });
    } else {
      this._removeSessionInputNeeded(chatUri, authenticationId);
    }
  }
  _findToolCall(chatUri, turnId, toolCallId) {
    const state = this._stateManager.getSessionState(chatUri);
    const turn = state?.activeTurn?.id === turnId ? state.activeTurn : state?.turns.find((t) => t.id === turnId);
    const part = turn?.responseParts.find((p) => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === toolCallId);
    return part?.kind === ResponsePartKind.ToolCall ? part.toolCall : void 0;
  }
  _setSessionInputNeeded(chatUri, request) {
    const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
    const existing = this._stateManager.getSessionState(sessionUri)?.inputNeeded?.find((r) => r.id === request.id);
    if (existing && equals(existing, request)) {
      return;
    }
    this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededSet, request });
    if (request.kind !== SessionInputRequestKind.ChatInput) {
      const agent = this._options.getAgent(sessionUri);
      if (agent) {
        this._toolCallTracker.toolCallBlocked(agent.id, chatUri, request);
      }
    }
  }
  _removeSessionInputNeeded(chatUri, id) {
    const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
    this._toolCallTracker.toolCallUnblocked(chatUri, id);
    if (!this._stateManager.getSessionState(sessionUri)?.inputNeeded?.some((r) => r.id === id)) {
      return;
    }
    this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededRemoved, id });
  }
  _removeSessionInputNeededForChat(chatUri) {
    const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
    for (const request of this._stateManager.getSessionState(sessionUri)?.inputNeeded ?? []) {
      if (request.chat === chatUri) {
        this._removeSessionInputNeeded(chatUri, request.id);
      }
    }
  }
  _chatInputNeededId(chatUri, requestId) {
    return `chatInput:${chatUri}:${requestId}`;
  }
  _toolConfirmationNeededId(chatUri, turnId, toolCallId) {
    return `toolConfirmation:${chatUri}:${turnId}:${toolCallId}`;
  }
  _toolClientExecutionNeededId(chatUri, turnId, toolCallId) {
    return `toolClientExecution:${chatUri}:${turnId}:${toolCallId}`;
  }
  _toolAuthenticationNeededId(chatUri, turnId, toolCallId) {
    return `toolAuthentication:${chatUri}:${turnId}:${toolCallId}`;
  }
  // ---- Initialization ----------------------------------------------------
  /**
   * Initializes async resources (tree-sitter WASM) used for command
   * auto-approval. Await this before any session events can arrive to
   * guarantee that auto-approval checks are fully synchronous.
   */
  initialize() {
    return this._permissionManager.initialize();
  }
  // ---- Agent registration -------------------------------------------------
  /**
   * Registers a progress-signal listener on the given agent so that
   * {@link AgentSignal}s are routed/dispatched through the state manager.
   * Returns a disposable that removes the listener.
   */
  registerProgressListener(agent) {
    const disposables = new DisposableStore();
    disposables.add(agent.onDidSessionProgress((signal) => {
      this._handleAgentSignal(agent, signal);
    }));
    if (agent.onDidCustomizationsChange) {
      disposables.add(agent.onDidCustomizationsChange(() => {
        this._publishAgentInfos(this._options.agents.get());
        this._publishSessionCustomizationsForAgent(agent);
      }));
    }
    if (agent.onDidRequireAuth) {
      disposables.add(agent.onDidRequireAuth((e) => this._stateManager.emitAuthRequired(e)));
    }
    return disposables;
  }
  /**
   * Routes a single signal from `agent` to the correct session.
   *
   * Action signals with a `parentToolCallId` are routed to the matching
   * subagent session. If the subagent session does not exist yet (the SDK
   * can emit an inner `tool_start` before its `subagent_started`), the
   * signal is buffered in {@link _pendingSubagentSignals} and replayed
   * once the `subagent_started` arrives.
   */
  _handleAgentSignal(agent, signal) {
    if (signal.kind === "subagent_started") {
      this._handleSubagentStarted(signal.chat.toString(), signal.toolCallId, signal.agentName, signal.agentDisplayName, signal.agentDescription, signal.taskPrompt, signal.parentToolCallId);
      this._drainPendingSubagentSignals(signal.chat.toString(), signal.toolCallId);
      return;
    }
    if (signal.kind === "subagent_resumed") {
      this._resumeSubagentSession(signal.chat.toString(), signal.toolCallId, signal.message);
      return;
    }
    if (signal.kind === "subagent_completed") {
      this.completeSubagentSession(signal.chat.toString(), signal.toolCallId);
      return;
    }
    if (signal.kind === "steering_consumed") {
      this._stateManager.dispatchServerAction(signal.chat.toString(), {
        type: ActionType.ChatPendingMessageRemoved,
        kind: PendingMessageKind.Steering,
        id: signal.id
      });
      return;
    }
    const sessionKey = signal.kind === "action" ? signal.resource.toString() : signal.chat.toString();
    const parentToolCallId = signal.parentToolCallId;
    if (parentToolCallId) {
      const subagentSession = this._subagentChats.get(sessionKey, parentToolCallId);
      if (subagentSession) {
        const subTurnId = this._stateManager.getActiveTurnId(subagentSession.chatUri);
        if (subTurnId) {
          this._dispatchActionForSession(signal, subagentSession.chatUri, subTurnId, "remap", agent);
        } else {
          this._logService.error(`[AgentSideEffects] Dropping ${this._describeSignal(signal)} for inactive subagent ${sessionKey}/${parentToolCallId}`);
          if (signal.kind === "pending_confirmation") {
            agent.respondToPermissionRequest(signal.state.toolCallId, false);
          }
        }
        return;
      }
      const pendingSignals = this._pendingSubagentSignals.get(sessionKey, parentToolCallId);
      if (signal.kind === "pending_confirmation" && !pendingSignals) {
        this._logService.error(`[AgentSideEffects] Denying permission for unroutable subagent ${sessionKey}/${parentToolCallId}: toolCallId=${signal.state.toolCallId}`);
        agent.respondToPermissionRequest(signal.state.toolCallId, false);
        return;
      }
      this._logService.trace(`[AgentSideEffects] Buffering ${this._describeSignal(signal)} for pending subagent ${sessionKey}/${parentToolCallId}`);
      let buffer = pendingSignals;
      if (!buffer) {
        buffer = [];
        this._pendingSubagentSignals.set(buffer, sessionKey, parentToolCallId);
      }
      buffer.push({ signal, agent });
      return;
    }
    if (signal.kind === "pending_confirmation") {
      const subagentChatUri = this._findSubagentChatForToolCall(sessionKey, signal.state.toolCallId);
      if (subagentChatUri) {
        const subTurnId = this._stateManager.getActiveTurnId(subagentChatUri) ?? "";
        void this._handleToolReady(signal, subagentChatUri, subTurnId, agent).catch((err) => {
          this._logService.error("[AgentSideEffects] _handleToolReady failed", err);
        });
        return;
      }
    }
    const turnId = this._stateManager.getActiveTurnId(sessionKey);
    if (turnId) {
      this._dispatchActionForSession(signal, sessionKey, turnId, "preserve", agent);
      return;
    }
    if (signal.kind === "pending_confirmation") {
      void this._handleToolReady(signal, sessionKey, "", agent).catch((err) => {
        this._logService.error("[AgentSideEffects] _handleToolReady failed", err);
      });
      return;
    }
    if (signal.kind === "action") {
      const action = signal.action;
      if (action.type === ActionType.ChatTurnComplete && this._cancelledTurnIds.get(sessionKey)?.has(action.turnId)) {
        this._logService.trace(`[AgentSideEffects] Dropping completion for cancelled turn ${action.turnId} on ${sessionKey}`);
        return;
      }
      this._stateManager.dispatchServerAction(sessionKey, action);
      if (action.type === ActionType.ChatTurnComplete) {
        this._runTurnCompleteSideEffects(sessionKey, void 0);
      }
    }
  }
  /**
   * Dispatches a signal to a resolved chat, preserving top-level turn identity or remapping cross-channel subagent actions.
   */
  _dispatchActionForSession(signal, sessionKey, turnId, turnIdRouting, agent) {
    if (signal.kind === "pending_confirmation") {
      if (agent) {
        void this._handleToolReady(signal, sessionKey, turnId, agent).catch((err) => {
          this._logService.error("[AgentSideEffects] _handleToolReady failed", err);
        });
      }
      return;
    }
    if (signal.kind !== "action") {
      return;
    }
    let action = signal.action;
    if (action.type !== ActionType.ChatTruncated && hasKey(action, { turnId: true }) && action.turnId !== turnId) {
      if (turnIdRouting === "remap") {
        action = { ...action, turnId };
      } else {
        this._logService.trace(`[AgentSideEffects] Dropping stale ${action.type} for ${sessionKey}: producerTurnId=${action.turnId}, activeTurnId=${turnId}`);
        return;
      }
    }
    if (action.type === ActionType.ChatToolCallStart && agent) {
      this._toolCallAgents.set(`${sessionKey}:${action.toolCallId}`, agent.id);
      this._toolCallTracker.toolCallStarted(agent.id, sessionKey, action.toolCallId, action.toolName, action.contributor);
    } else if (action.type === ActionType.ChatToolCallReady) {
      this._toolCallTracker.toolCallMetadataUpdated(sessionKey, action.toolCallId, action.contributor);
      if (action.confirmed) {
        this._toolCallTracker.toolCallExecutionStarted(sessionKey, action.toolCallId);
      }
    }
    const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
    if ((action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatToolCallDelta || action.type === ActionType.ChatToolCallReady) && readToolCallMeta(action).toolKind === "subagent" && readToolCallMeta(action).subagentChatUri === void 0) {
      action = { ...action, _meta: { ...action._meta, subagentChatUri: buildSubagentChatUri(sessionUri, action.toolCallId) } };
    }
    if (action.type === ActionType.ChatToolCallComplete) {
      const subagent = this._subagentChats.get(sessionKey, action.toolCallId);
      if (subagent) {
        const parentState = this._stateManager.getSessionState(sessionKey);
        const runningContent = this._getRunningToolCallContent(parentState, turnId, action.toolCallId);
        const subagentEntry = runningContent.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
        if (subagentEntry) {
          const mergedContent = [...action.result.content ?? [], subagentEntry];
          const merged = { ...action, result: { ...action.result, content: mergedContent } };
          action = merged;
        }
      }
    }
    this._stateManager.dispatchServerAction(sessionKey, action);
    if (action.type === ActionType.ChatDelta || action.type === ActionType.ChatResponsePart || action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatReasoning) {
      this._turnTracker.markFirstProgress(sessionKey, turnId);
    }
    if (action.type === ActionType.ChatToolCallComplete) {
      this._toolCallTracker.toolCallCompleted(sessionKey, action.toolCallId, action.result);
      this._pendingSubagentSignals.delete(sessionKey, action.toolCallId);
      if (getToolFileEdits(action.result).length > 0) {
        this._changesets.onToolCallEditsApplied(sessionUri, turnId);
      }
    }
    if (action.type === ActionType.ChatTurnComplete) {
      this._turnTracker.turnCompleted(sessionKey, turnId, "success");
      this._toolCallTracker.clearSession(sessionKey);
      this._runTurnCompleteSideEffects(sessionKey, turnId);
    }
    if (action.type === ActionType.ChatTurnCancelled) {
      this._turnTracker.turnCompleted(sessionKey, turnId, "cancelled");
      this._toolCallTracker.clearSession(sessionKey);
      this._markSessionUnread(sessionUri);
    }
    if (action.type === ActionType.ChatError) {
      this._turnTracker.turnCompleted(sessionKey, turnId, "error", { stage: "provider", error: action.error });
      this._toolCallTracker.clearSession(sessionKey);
      this._markSessionUnread(sessionUri);
    }
  }
  /**
   * Post-turn side effects: flush any pending debounced diff computation,
   * compute final diffs immediately, drain the next queued message, and
   * notify the host so it can refresh git state.
   */
  _runTurnCompleteSideEffects(sessionKey, turnId) {
    const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
    if (turnId !== void 0) {
      const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri)?.map((w) => URI.parse(w));
      this._checkpointService.captureTurnCheckpoint(URI.parse(sessionUri), turnId, workingDirectories).then(() => {
        this._changesets.onTurnComplete(sessionUri, turnId);
      }, (err) => {
        this._logService.warn(`[AgentSideEffects] Turn checkpoint capture failed for ${sessionUri}/${turnId}: ${err instanceof Error ? err.message : String(err)}`);
        this._changesets.onTurnComplete(sessionUri, turnId);
      });
    } else {
      this._changesets.onTurnComplete(sessionUri, turnId);
    }
    this._tryConsumeNextQueuedMessage(sessionKey);
    this._options.onTurnComplete(sessionUri);
    const titleChatChannel = isAhpChatChannel(sessionKey) && !isDefaultChatUri(sessionKey) ? sessionKey : void 0;
    this._titleController.refineTitleFromFirstTurn(sessionUri, titleChatChannel);
    this._markSessionUnread(sessionUri);
  }
  _markSessionUnread(session) {
    const status = this._stateManager.getSessionSummary(session)?.status ?? 0;
    if (!(status & SessionStatus.IsRead)) {
      return;
    }
    this._stateManager.dispatchServerAction(session, { type: ActionType.SessionIsReadChanged, isRead: false });
  }
  _describeSignal(signal) {
    return signal.kind === "action" ? `action(${signal.action.type})` : signal.kind;
  }
  /**
   * Replays any signals that were buffered while waiting for
   * `subagent_started` to create the subagent session. Called immediately
   * after `_handleSubagentStarted`.
   */
  _drainPendingSubagentSignals(parentChatURI, parentToolCallId) {
    const buffer = this._pendingSubagentSignals.get(parentChatURI, parentToolCallId);
    if (!buffer) {
      return;
    }
    this._pendingSubagentSignals.delete(parentChatURI, parentToolCallId);
    this._logService.trace(`[AgentSideEffects] Draining ${buffer.length} buffered signal(s) for subagent ${parentChatURI}/${parentToolCallId}`);
    for (const { signal, agent } of buffer) {
      this._handleAgentSignal(agent, signal);
    }
  }
  // ---- Subagent session management ----------------------------------------
  /**
   * Starts the subagent turn in response to a `subagent_started` event and
   * wires the parent tool call to the subagent chat. The subagent chat's
   * catalog membership is owned by the spawn channel
   * ({@link AgentService._onChatSpawned}), which the orchestrator applies
   * before this runs, so this only drives the turn/tracking/parent content
   * — it does not add the chat.
   *
   * `chatURI` is always the agent's top-level chat: the subagent is
   * registered (and inner events routed) under it because inner-tool
   * signals carry the top-level chat as their resource. `spawningToolParentId`,
   * when set, is the tool call one level up from the spawning `toolCallId`
   * — the tool call in whose (subagent) chat the spawning tool lives — and
   * is used to route the discovery content block to that immediate parent
   * chat. Since subagent chats are flat (keyed off the root session), this
   * one-hop reference resolves the parent chat at any nesting depth.
   */
  _handleSubagentStarted(chatURI, toolCallId, agentName, agentDisplayName, agentDescription, taskPrompt, spawningToolParentId) {
    const parentSessionUri = parseRequiredSessionUriFromChatUri(chatURI);
    const subagentChatUri = buildSubagentChatUri(parentSessionUri, toolCallId);
    const existing = this._subagentChats.get(chatURI, toolCallId);
    if (existing) {
      this._resumeSubagentSession(chatURI, toolCallId, taskPrompt ? { text: taskPrompt, origin: { kind: MessageKind.User } } : void 0);
      return;
    }
    this._logService.info(`[AgentSideEffects] Starting subagent turn: ${subagentChatUri} (parent=${chatURI}, toolCallId=${toolCallId})`);
    const contentChatUri = spawningToolParentId ? this._subagentChats.get(chatURI, spawningToolParentId)?.chatUri ?? chatURI : chatURI;
    const turnId = generateUuid();
    this._stateManager.dispatchServerAction(subagentChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: { text: taskPrompt ?? "", origin: { kind: MessageKind.User } }
    });
    this._subagentChats.set({ parentChatUri: chatURI, toolCallId, sessionUri: parentSessionUri, chatUri: subagentChatUri, turnStopWatch: StopWatch.create(false) }, chatURI, toolCallId);
    const parentTurnId = this._stateManager.getActiveTurnId(contentChatUri);
    if (parentTurnId) {
      const parentState = this._stateManager.getSessionState(contentChatUri);
      const existingContent = this._getRunningToolCallContent(parentState, parentTurnId, toolCallId);
      this._stateManager.dispatchServerAction(contentChatUri, {
        type: ActionType.ChatToolCallContentChanged,
        turnId: parentTurnId,
        toolCallId,
        content: [
          ...existingContent,
          {
            type: ToolResultContentType.Subagent,
            resource: subagentChatUri,
            title: agentDisplayName,
            agentName,
            description: agentDescription
          }
        ]
      });
    }
  }
  /**
   * Gets the current content array from a running tool call, if any.
   */
  _getRunningToolCallContent(state, turnId, toolCallId) {
    if (!state?.activeTurn || state.activeTurn.id !== turnId) {
      return [];
    }
    for (const rp of state.activeTurn.responseParts) {
      if (rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId && rp.toolCall.status === ToolCallStatus.Running) {
        return rp.toolCall.content ? [...rp.toolCall.content] : [];
      }
    }
    return [];
  }
  _turnDuration(stopWatch) {
    const elapsed = stopWatch?.elapsed();
    return typeof elapsed === "number" && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  }
  _resumeSubagentSession(parentChatURI, toolCallId, message) {
    const subagent = this._subagentChats.get(parentChatURI, toolCallId);
    if (!subagent) {
      this._logService.error(`[AgentSideEffects] Cannot resume unknown subagent ${parentChatURI}/${toolCallId}`);
      return;
    }
    if (this._stateManager.getActiveTurnId(subagent.chatUri)) {
      return;
    }
    const turnId = generateUuid();
    this._logService.info(`[AgentSideEffects] Resuming subagent turn: ${subagent.chatUri} (parent=${parentChatURI}, toolCallId=${toolCallId})`);
    this._stateManager.dispatchServerAction(subagent.chatUri, {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: message ?? { text: "", origin: { kind: MessageKind.User } }
    });
    this._subagentChats.set({ ...subagent, turnStopWatch: StopWatch.create(false) }, parentChatURI, toolCallId);
  }
  /**
   * Cancels all active subagent sessions for a given parent session.
   */
  cancelSubagentSessions(parentChatURI) {
    for (const subagent of this._subagentChats.getAll(parentChatURI)) {
      const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
      if (turnId) {
        this._stateManager.dispatchServerAction(subagent.chatUri, {
          type: ActionType.ChatTurnCancelled,
          turnId,
          duration: this._turnDuration(subagent.turnStopWatch)
        });
        this._turnTracker.turnCompleted(subagent.chatUri, turnId, "cancelled");
      }
      this._toolCallTracker.clearSession(subagent.chatUri);
    }
    this._subagentChats.deleteAll(parentChatURI);
    this._pendingSubagentSignals.deleteAll(parentChatURI);
  }
  /**
   * Completes the active turn for the subagent associated with a parent tool
   * call. The chat remains registered so a later steered turn can resume it.
   */
  completeSubagentSession(parentChatURI, toolCallId) {
    this._pendingSubagentSignals.delete(parentChatURI, toolCallId);
    const subagent = this._subagentChats.get(parentChatURI, toolCallId);
    if (!subagent) {
      return;
    }
    const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
    if (turnId) {
      this._stateManager.dispatchServerAction(subagent.chatUri, {
        type: ActionType.ChatTurnComplete,
        turnId,
        duration: this._turnDuration(subagent.turnStopWatch)
      });
    }
  }
  /**
   * Removes all subagent chats for a given parent session from the state manager.
   */
  removeSubagentSessions(parentSession) {
    for (const chatUri of this._cancelledTurnIds.keys()) {
      if (parseRequiredSessionUriFromChatUri(chatUri) === parentSession) {
        this._cancelledTurnIds.delete(chatUri);
      }
    }
    const parentChatURIs = /* @__PURE__ */ new Set();
    for (const subagent of this._subagentChats.values()) {
      if (subagent.sessionUri === parentSession) {
        this._stateManager.removeChat(subagent.sessionUri, subagent.chatUri);
        this._toolCallTracker.clearSession(subagent.chatUri);
        parentChatURIs.add(subagent.parentChatUri);
      }
    }
    for (const parentChatURI of parentChatURIs) {
      this._subagentChats.deleteAll(parentChatURI);
      this._pendingSubagentSignals.deleteAll(parentChatURI);
    }
  }
  /**
   * Finds the subagent session that owns a given tool call by checking
   * whether the tool call was previously registered under a subagent
   * session key in `_toolCallAgents`. Scoped to subagent sessions owned
   * by the given parent to avoid cross-session collisions.
   */
  _findSubagentChatForToolCall(parentChatURI, toolCallId) {
    for (const subagent of this._subagentChats.getAll(parentChatURI)) {
      if (this._toolCallAgents.has(`${subagent.chatUri}:${toolCallId}`)) {
        return subagent.chatUri;
      }
    }
    return void 0;
  }
  _toolCallCompletionChat(chatChannel) {
    if (!isSubagentChatUri(chatChannel)) {
      return chatChannel;
    }
    for (const subagent of this._subagentChats.values()) {
      if (subagent.chatUri === chatChannel) {
        return this._toolCallCompletionChat(subagent.parentChatUri);
      }
    }
    this._logService.warn(`[AgentSideEffects] Missing parent chat for subagent tool completion: chat=${chatChannel}`);
    return chatChannel;
  }
  _notifyClientToolCallComplete(sessionChannel, chatChannel, toolCallId, result, source) {
    const completionChat = this._toolCallCompletionChat(chatChannel);
    const agent = this._options.getAgent(sessionChannel);
    if (!agent) {
      this._logService.warn(`[AgentSideEffects] No agent for client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}`);
      return;
    }
    this._logService.info(`[AgentSideEffects] Forwarding client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}, success=${result.success}`);
    agent.onClientToolCallComplete(URI.parse(sessionChannel), URI.parse(completionChat), toolCallId, result);
  }
  // ---- Side-effect handlers --------------------------------------------------
  /**
   * Handles a `pending_confirmation` signal end-to-end: checks for
   * auto-approval via the permission manager, and if not auto-approved,
   * dispatches the `ChatToolCallReady` action with confirmation options
   * for the client.
   */
  async _handleToolReady(e, sessionKey, turnId, agent) {
    const approvalEvent = {
      toolCallId: e.state.toolCallId,
      session: e.chat,
      permissionKind: e.permissionKind,
      permissionPath: e.permissionPath,
      toolInput: e.state.toolInput,
      requestSandboxBypass: e.requestSandboxBypass,
      shellLanguage: e.shellLanguage
    };
    const autoApproval = e.managedApprovalRequired ? void 0 : await this._permissionManager.getAutoApproval(approvalEvent, sessionKey);
    const part = this._stateManager.getSessionState(sessionKey)?.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === e.state.toolCallId);
    const toolCall = part?.kind === ResponsePartKind.ToolCall ? part.toolCall : void 0;
    if (toolCall && toolCall.status !== ToolCallStatus.Streaming && toolCall.status !== ToolCallStatus.Running && toolCall.status !== ToolCallStatus.PendingConfirmation) {
      const toolCallKey2 = `${sessionKey}:${e.state.toolCallId}`;
      this._toolCallAgents.delete(toolCallKey2);
      this._managedApprovalToolCalls.delete(toolCallKey2);
      this._logService.trace(`[AgentSideEffects] Dropping stale tool ready for ${e.state.toolCallId}: status=${toolCall.status}`);
      return;
    }
    const contributor = e.state.contributor ?? toolCall?.contributor;
    let effective = e;
    const toolCallKey = `${sessionKey}:${e.state.toolCallId}`;
    if (e.managedApprovalRequired) {
      this._managedApprovalToolCalls.add(toolCallKey);
    } else {
      this._managedApprovalToolCalls.delete(toolCallKey);
    }
    const clientShouldAutoApprove = autoApproval !== void 0 && contributor?.kind === ToolCallContributorKind.Client && !!e.state.confirmationTitle;
    if (clientShouldAutoApprove) {
      this._toolCallAgents.set(toolCallKey, agent.id);
      effective = { ...e, state: { ...e.state, _meta: { ...toolCall?._meta, ...e.state._meta, ...toToolCallMeta({ autoApproveBySetting: true }) } } };
    } else if (autoApproval !== void 0) {
      this._toolCallAgents.delete(toolCallKey);
      agent.respondToPermissionRequest(e.state.toolCallId, true);
      effective = { ...e, state: { ...e.state, confirmationTitle: void 0 } };
    } else if (effective.state.confirmationTitle) {
      this._toolCallAgents.set(toolCallKey, agent.id);
    }
    if (autoApproval === void 0 && !e.managedApprovalRequired && this._permissionManager.isAutoApproveRuleResolvable(approvalEvent, sessionKey)) {
      effective = { ...effective, state: { ...effective.state, _meta: { ...toolCall?._meta, ...effective.state._meta, ...toToolCallMeta({ autoApproveRuleResolvable: true }) } } };
    }
    const readyAction = this._permissionManager.createToolReadyAction(effective, sessionKey, turnId);
    this._toolCallTracker.toolCallMetadataUpdated(sessionKey, readyAction.toolCallId, readyAction.contributor);
    if (readyAction.confirmed) {
      this._toolCallTracker.toolCallExecutionStarted(sessionKey, readyAction.toolCallId);
    }
    this._stateManager.dispatchServerAction(sessionKey, readyAction);
  }
  handleAction(channel, action, clientId, clientType = AgentHostClientType.Unknown) {
    const chatChannel = isAhpChatChannel(channel) ? channel : void 0;
    const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;
    switch (action.type) {
      case ActionType.ChatTurnStarted: {
        if (!chatChannel) {
          throw new Error(`ChatTurnStarted must be handled on an AHP chat channel: ${channel}`);
        }
        const turnStopWatch = StopWatch.create(false);
        const handled = this._localCommands.tryHandle({ turnChannel: channel, turnId: action.turnId, text: action.message.text });
        if (handled) {
          if (handled.suggestedTitle !== void 0) {
            this._titleController.seedProvisionalTitle(sessionChannel, handled.suggestedTitle, chatChannel);
          }
          break;
        }
        const state = this._stateManager.getSessionState(channel);
        if (!state) {
          this._logService.info(`[AgentSideEffects] Turn started for session not in state manager: ${channel}, turnId=${action.turnId} - status/summary updates may be dropped unless the session is restored`);
        }
        this._titleController.seedTitleFromFirstMessage(sessionChannel, action.message.text, chatChannel);
        this._options.onUserMessage?.(sessionChannel, action.message.text);
        const agent = this._options.getAgent(sessionChannel);
        if (!agent) {
          this._stateManager.dispatchServerAction(channel, {
            type: ActionType.ChatError,
            turnId: action.turnId,
            duration: this._turnDuration(turnStopWatch),
            error: { errorType: "noAgent", message: "No agent found for session" }
          });
          return;
        }
        const attachments = action.message.attachments;
        this._telemetryReporter.userMessageSent(agent.id, clientType, channel, state, "direct", attachments);
        const { model, modelTelemetryKind, permissionLevel } = this._getTurnTelemetryContext(agent, state, action.message.model?.id);
        this._turnTracker.turnStarted(agent.id, channel, action.turnId, model, modelTelemetryKind, permissionLevel);
        void this._sendTurnMessage({
          agent,
          sessionChannel,
          turnChannel: channel,
          chat: channel,
          message: action.message,
          turnId: action.turnId,
          senderClientId: clientId,
          clientType,
          turnStopWatch
        });
        break;
      }
      case ActionType.ChatToolCallConfirmed: {
        if (!chatChannel) {
          throw new Error(`ChatToolCallConfirmed must be handled on an AHP chat channel: ${channel}`);
        }
        const toolCallKey = `${channel}:${action.toolCallId}`;
        if (action.approved) {
          this._toolCallTracker.toolCallExecutionStarted(channel, action.toolCallId);
        }
        const managedApprovalRequired = this._managedApprovalToolCalls.delete(toolCallKey);
        const agentId = this._toolCallAgents.get(toolCallKey);
        if (agentId) {
          this._toolCallAgents.delete(toolCallKey);
          const agent = this._options.agents.get().find((a) => a.id === agentId);
          agent?.respondToPermissionRequest(action.toolCallId, action.approved);
        } else {
          this._logService.warn(`[AgentSideEffects] No agent for tool call confirmation: ${action.toolCallId}`);
        }
        if (action.approved && !managedApprovalRequired) {
          this._permissionManager.handleToolCallConfirmed(channel, action.toolCallId, action.selectedOptionId);
        }
        break;
      }
      case ActionType.ChatInputCompleted: {
        if (!chatChannel) {
          throw new Error(`ChatInputCompleted must be handled on an AHP chat channel: ${channel}`);
        }
        const agent = this._options.getAgent(sessionChannel);
        agent?.respondToUserInputRequest(action.requestId, action.response, action.answers);
        break;
      }
      case ActionType.ChatTurnCancelled: {
        if (!chatChannel) {
          throw new Error(`ChatTurnCancelled must be handled on an AHP chat channel: ${channel}`);
        }
        this._turnTracker.turnCompleted(channel, action.turnId, "cancelled");
        this._toolCallTracker.clearSession(channel);
        this.cancelSubagentSessions(channel);
        const agent = this._options.getAgent(sessionChannel);
        if (agent) {
          const chat = URI.parse(channel);
          agent.chats.abort(chat).catch((err) => {
            this._logService.error("[AgentSideEffects] abort failed", err);
          });
        }
        break;
      }
      case ActionType.SessionTitleChanged: {
        if (chatChannel) {
          this._stateManager.updateChatTitle(sessionChannel, chatChannel, action.title);
          this._persistSessionFlag(sessionChannel, `customChatTitle:${chatChannel}`, action.title);
          break;
        }
        this._persistSessionFlag(channel, "customTitle", action.title);
        break;
      }
      case ActionType.ChatPendingMessageSet: {
        if (!chatChannel) {
          throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
        }
        const queuedMessageExists = this._stateManager.getChatState(channel)?.queuedMessages?.some((message) => message.id === action.id) === true;
        if (action.kind === PendingMessageKind.Queued && queuedMessageExists) {
          this._queuedMessageSenders.set({ clientId, clientType }, channel, action.id);
        }
        this._syncPendingMessages(channel);
        break;
      }
      case ActionType.ChatPendingMessageRemoved: {
        if (!chatChannel) {
          throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
        }
        if (action.kind === PendingMessageKind.Queued) {
          this._queuedMessageSenders.delete(channel, action.id);
        }
        this._syncPendingMessages(channel);
        break;
      }
      case ActionType.ChatQueuedMessagesReordered: {
        if (!chatChannel) {
          throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
        }
        this._syncPendingMessages(channel);
        break;
      }
      case ActionType.ChatTruncated: {
        if (!chatChannel) {
          throw new Error(`ChatTruncated must be handled on an AHP chat channel: ${channel}`);
        }
        const agent = this._options.getAgent(sessionChannel);
        const sdkTurnId = action.turnId !== void 0 ? this._options.localTurns.resolveConcreteTurnId(chatChannel, action.turnId) : action.turnId;
        agent?.truncateSession?.(URI.parse(sessionChannel), sdkTurnId, URI.parse(chatChannel)).catch((err) => {
          this._logService.error("[AgentSideEffects] truncateSession failed", err);
        });
        const survivingIds = new Set((this._stateManager.getChatState(chatChannel)?.turns ?? []).map((t) => t.id));
        const removed = this._options.localTurns.getLocalTurnIds(chatChannel).filter((id) => !survivingIds.has(id));
        this._options.localTurns.deleteLocals(sessionChannel, removed);
        this._changesets.onSessionTruncated(sessionChannel);
        break;
      }
      case ActionType.SessionActiveClientSet: {
        const agent = this._options.getAgent(channel);
        if (!agent) {
          break;
        }
        const activeClient = action.activeClient;
        const handle = agent.getOrCreateActiveClient(URI.parse(channel), {
          clientId: activeClient.clientId,
          displayName: activeClient.displayName
        });
        handle.tools = activeClient.tools;
        handle.customizations = activeClient.customizations ?? [];
        break;
      }
      case ActionType.SessionActiveClientRemoved: {
        const agent = this._options.getAgent(channel);
        agent?.removeActiveClient(URI.parse(channel), action.clientId);
        break;
      }
      case ActionType.RootConfigChanged: {
        updateAgentHostTelemetryLevelFromConfig(this._telemetryService, action.config);
        this._publishAgentInfos(this._options.agents.get());
        this._publishAllSessionCustomizations();
        break;
      }
      case ActionType.SessionMcpServerStartRequested: {
        const agent = this._options.getAgent(sessionChannel);
        agent?.startMcpServer?.(URI.parse(sessionChannel), action.id).catch((err) => {
          this._logService.warn(`[AgentSideEffects] startMcpServer failed for ${sessionChannel}`, err);
        });
        break;
      }
      case ActionType.SessionMcpServerStopRequested: {
        const agent = this._options.getAgent(sessionChannel);
        agent?.stopMcpServer?.(URI.parse(sessionChannel), action.id).catch((err) => {
          this._logService.warn(`[AgentSideEffects] stopMcpServer failed for ${sessionChannel}`, err);
        });
        break;
      }
      case ActionType.SessionIsArchivedChanged: {
        if (this._worktree) {
          const sessionUri = URI.parse(channel);
          const sessionId = AgentSession.id(channel);
          const worktreeOp = action.isArchived ? this._worktree.cleanupWorktreeOnArchive(sessionUri, sessionId) : this._worktree.recreateWorktreeOnUnarchive(sessionUri, sessionId);
          worktreeOp.catch((err) => this._logService.warn(`[AgentSideEffects] worktree ${action.isArchived ? "cleanup" : "recreate"} failed for ${channel}`, err));
        }
        const agent = this._options.getAgent(channel);
        agent?.onArchivedChanged?.(URI.parse(channel), action.isArchived).catch((err) => {
          this._logService.warn(`[AgentSideEffects] onArchivedChanged failed for ${channel}`, err);
        });
        break;
      }
      case ActionType.SessionConfigChanged: {
        const sessionState = this._stateManager.getSessionState(channel);
        const values = sessionState?.config?.values;
        if (this._worktree && sessionState?.lifecycle === SessionLifecycle.Creating) {
          const sessionId = AgentSession.id(channel);
          const isolation = values?.[SessionConfigKey.Isolation];
          if (isolation === "worktree") {
            this._worktree.notePending(sessionId);
          } else if (isolation === "folder") {
            this._worktree.clearPending(sessionId);
          }
        }
        this._options.getAgent(channel)?.onSessionConfigChanged?.(URI.parse(channel), values ?? {});
        break;
      }
      case ActionType.ChatToolCallComplete: {
        if (!chatChannel) {
          break;
        }
        this._notifyClientToolCallComplete(sessionChannel, chatChannel, action.toolCallId, action.result, "client-dispatch");
        break;
      }
    }
  }
  /** Injects the host-owned worktree isolation controller (see {@link AgentService.setWorktreeIsolation}). */
  setWorktreeIsolation(worktree) {
    this._worktree = worktree;
  }
  cancelSessionTitleGeneration(session) {
    this._titleController.cancelTitleGeneration(session);
  }
  clearQueuedMessageSenders(chat) {
    this._queuedMessageSenders.deleteAll(chat);
  }
  /**
   * Generates a content-derived title for a freshly forked session
   * (`chatChannel` undefined) or peer chat from its inherited chat
   * turns, replacing the placeholder `Forked: …` title once ready.
   */
  generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle) {
    this._titleController.generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle);
  }
  /**
   * Persists a session metadata key/value pair to the session database.
   * Used for fields the host needs to remember across restarts (custom
   * title, isRead/isArchived flags, merged config values).
   */
  _persistSessionFlag(session, key, value) {
    persistSessionMetadata(this._options.sessionDataService, this._logService, session, key, value);
  }
  /**
   * Persists the usage reported for a chat's turn.
   *
   * Agent backends do not durably record token/credit usage themselves (the
   * Copilot SDK's `assistant.usage` event is explicitly ephemeral, and the
   * Claude transcript replay produces none), so a restored session would
   * otherwise come back with no context-usage gauge and a session cost of 0.
   * See `AgentService._applyPersistedTurnUsage` for which providers can
   * currently match these rows back on restore.
   *
   * Written on every report rather than buffered until the turn ends: the row
   * is keyed by turn id and written with `INSERT OR REPLACE` through a
   * sequencer, so "last report wins" is already a property of the storage
   * layer, and persisting eagerly means a turn cut short by a crash or
   * disconnect keeps the usage it had already accrued.
   *
   * Subagent chats are skipped: their cost is already folded into the parent
   * turn's aggregate, so recording it again would double-count.
   */
  _trackTurnUsage(channel, action) {
    if (action.type !== ActionType.ChatUsage || isSubagentChatUri(channel)) {
      return;
    }
    if (!action.turnId) {
      return;
    }
    const storage = chatStorageUri(channel);
    if (!storage) {
      return;
    }
    let ref;
    try {
      ref = this._options.sessionDataService.openDatabase(storage);
    } catch (err) {
      this._logService.warn(`[AgentSideEffects] Failed to open database to persist turn usage for ${channel}`, err);
      return;
    }
    ref.object.setTurnUsage(action.turnId, JSON.stringify(action.usage)).catch((err) => {
      this._logService.warn(`[AgentSideEffects] Failed to persist turn usage for ${channel}/${action.turnId}`, err);
    }).finally(() => ref.dispose());
  }
  _persistChatDraft(channel, draft) {
    if (!isAhpChatChannel(channel)) {
      return;
    }
    const parsed = parseChatUri(channel);
    if (!parsed) {
      return;
    }
    const session = URI.parse(parsed.session);
    const ref = this._options.sessionDataService.openDatabase(session);
    ref.object.setChatDraft(URI.parse(channel), draft).catch((err) => {
      this._logService.warn(`[AgentSideEffects] Failed to persist chat draft for ${channel.toString()}`, err);
    }).finally(() => {
      ref.dispose();
    });
  }
  /**
   * Pushes the current pending message state from the chat to the agent.
   * The server controls queued message consumption; only steering messages
   * are forwarded to the agent for mid-turn injection.
   */
  _syncPendingMessages(chatChannel) {
    const sessionChannel = parseRequiredSessionUriFromChatUri(chatChannel);
    const state = this._stateManager.getSessionState(chatChannel);
    if (!state) {
      return;
    }
    const agent = this._options.getAgent(sessionChannel);
    agent?.setPendingMessages?.(
      URI.parse(chatChannel),
      state.steeringMessage,
      []
    );
    this._tryConsumeNextQueuedMessage(chatChannel);
  }
  /**
   * Consumes the next queued message by dispatching a server-initiated
   * `ChatTurnStarted` action with `queuedMessageId` set. The reducer
   * atomically creates the active turn and removes the message from the
   * queue. Only consumes one message at a time; subsequent messages are
   * consumed when the next `idle` event fires.
   */
  _tryConsumeNextQueuedMessage(session) {
    const sessionChannel = parseRequiredSessionUriFromChatUri(session);
    if (this._stateManager.getActiveTurnId(session)) {
      return;
    }
    const state = this._stateManager.getSessionState(session);
    if (!state?.queuedMessages?.length || state.steeringMessage) {
      return;
    }
    const msg = state.queuedMessages[0];
    const sender = this._queuedMessageSenders.get(session, msg.id) ?? { clientId: void 0, clientType: AgentHostClientType.Unknown };
    this._queuedMessageSenders.delete(session, msg.id);
    const turnId = generateUuid();
    this._stateManager.dispatchServerAction(session, {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: msg.message,
      queuedMessageId: msg.id
    });
    const turnStopWatch = StopWatch.create(false);
    const handled = this._localCommands.tryHandle({ turnChannel: session, turnId, text: msg.message.text });
    if (handled) {
      if (handled.suggestedTitle !== void 0) {
        this._titleController.seedProvisionalTitle(sessionChannel, handled.suggestedTitle, session);
      }
      return;
    }
    this._titleController.seedTitleFromFirstMessage(sessionChannel, msg.message.text, session);
    const agent = this._options.getAgent(sessionChannel);
    if (!agent) {
      this._stateManager.dispatchServerAction(session, {
        type: ActionType.ChatError,
        turnId,
        duration: this._turnDuration(turnStopWatch),
        error: { errorType: "noAgent", message: "No agent found for session" }
      });
      return;
    }
    const attachments = msg.message.attachments;
    const queuedState = this._stateManager.getSessionState(session);
    this._telemetryReporter.userMessageSent(agent.id, sender.clientType, session, queuedState, "queued", attachments);
    const { model, modelTelemetryKind, permissionLevel } = this._getTurnTelemetryContext(agent, queuedState, msg.message.model?.id);
    this._turnTracker.turnStarted(agent.id, session, turnId, model, modelTelemetryKind, permissionLevel);
    void this._sendTurnMessage({
      agent,
      sessionChannel,
      turnChannel: session,
      chat: session,
      message: msg.message,
      turnId,
      senderClientId: sender.clientId,
      clientType: sender.clientType,
      turnStopWatch
    });
  }
  _getTurnTelemetryContext(agent, state, modelId) {
    const permissionValue = state?.config?.values[SessionConfigKey.AutoApprove];
    const permissionLevel = typeof permissionValue === "string" ? permissionValue : void 0;
    const model = modelId === void 0 ? void 0 : agent.models.get().find((model2) => model2.id === modelId);
    let modelTelemetryKind;
    if (modelId === "auto") {
      modelTelemetryKind = "trusted";
    } else if (modelId === void 0) {
      modelTelemetryKind = void 0;
    } else if (model === void 0) {
      modelTelemetryKind = "unknown";
    } else {
      modelTelemetryKind = readAgentModelByokIdentifier(model) === void 0 ? "trusted" : "byok";
    }
    return { model: modelId, modelTelemetryKind, permissionLevel };
  }
  /**
   * Applies a turn message's model/agent selection (see
   * {@link _applyMessageSelection}) and forwards it to the agent's
   * `sendMessage`. A rejected send is wired to fail the turn: it logs,
   * dispatches {@link ActionType.ChatError} on the turn channel, and marks the
   * turn errored.
   */
  async _sendTurnMessage(options) {
    const { agent, sessionChannel, turnChannel, chat, message, turnId, senderClientId, clientType, turnStopWatch } = options;
    const chatState = this._stateManager.getChatState(chat);
    const sessionStatus = this._stateManager.getSessionSummary(options.sessionChannel)?.status ?? 0;
    const sessionArchived = (sessionStatus & SessionStatus.IsArchived) === SessionStatus.IsArchived;
    if (isChatReadOnly(chatState?.interactivity, sessionArchived)) {
      const error = sessionArchived ? { errorType: "archived", message: "This session is archived and read-only. Restore the session to continue the conversation." } : { errorType: "readOnly", message: "This chat is read-only." };
      this._logService.warn(`[AgentSideEffects] Rejecting turn on read-only chat=${chat} (archived=${sessionArchived}), turnId=${turnId}`);
      this._stateManager.dispatchServerAction(turnChannel, {
        type: ActionType.ChatError,
        turnId,
        duration: this._turnDuration(turnStopWatch),
        error
      });
      this._turnTracker.turnCompleted(turnChannel, turnId, "error", { stage: "validation", error });
      this._toolCallTracker.clearSession(turnChannel);
      return;
    }
    const chatUri = URI.parse(chat);
    let failureStage = "workingDirectory";
    try {
      const resolvedWorkingDirectories = await this._options.resolveWorkingDirectoryBeforeSend?.({ session: options.sessionChannel, chat, turnId, prompt: message.text });
      const selectionUpdates = [];
      if (message.model) {
        failureStage = "modelSelection";
        selectionUpdates.push(agent.chats.changeModel(chatUri, message.model));
      }
      selectionUpdates.push(agent.chats.changeAgent(chatUri, message.agent).catch((err) => {
        this._logService.error("[AgentSideEffects] changeAgent failed", err);
      }));
      await Promise.all(selectionUpdates);
      failureStage = "sendMessage";
      const resolvedAttachments = await this._resolveChatAttachments(message.attachments);
      await agent.chats.sendMessage(chatUri, message.text, resolvedWorkingDirectories, resolvedAttachments, turnId, senderClientId, clientType);
    } catch (err) {
      const failure = buildTurnFailure(failureStage, err);
      const error = failure.error;
      this._logService.error(`[AgentSideEffects] ${failureStage} failed for session=${turnChannel}: code=${failure.errorCode}, message=${error.message}, type=${failure.errorName}`, err);
      this._stateManager.dispatchServerAction(turnChannel, {
        type: ActionType.ChatError,
        turnId,
        duration: this._turnDuration(turnStopWatch),
        error
      });
      this._turnTracker.turnCompleted(turnChannel, turnId, "error", failure);
      this._toolCallTracker.clearSession(turnChannel);
      this._failSessionCreationIfStillCreating(sessionChannel, error);
    }
  }
  async _resolveChatAttachments(attachments) {
    if (!attachments?.some((attachment) => attachment.type === MessageAttachmentKind.Chat)) {
      return attachments;
    }
    return Promise.all(attachments.map(async (attachment) => {
      if (attachment.type !== MessageAttachmentKind.Chat) {
        return attachment;
      }
      const openLink = buildOpenSessionLinkForChatResource(attachment.resource);
      const sourceTurns = await this._resolveChatAttachmentSourceTurns(attachment.resource);
      if (sourceTurns === void 0) {
        return resolveChatAttachment({ ...attachment, endTurn: void 0 }, [], openLink);
      }
      const sourceState = resolveChatStateForUri(this._stateManager, attachment.resource);
      if (attachment.endTurn !== void 0 && sourceState?.activeTurn?.id === attachment.endTurn) {
        throw new Error(`Chat attachment endTurn must reference a completed turn: ${attachment.resource}#${attachment.endTurn}`);
      }
      return resolveChatAttachment(attachment, sourceTurns, openLink);
    }));
  }
  /**
   * Resolves the referenced chat's turns, returning `undefined` when the source
   * is unresolvable — e.g. a cross-session reference to a chat this host never
   * subscribed to and cannot restore (the resolver throws
   * `ProtocolError(AHP_SESSION_NOT_FOUND)` when no provider owns it or the
   * backend no longer has it). Such failures are logged rather than rethrown so
   * a stale reference degrades gracefully instead of failing the user's turn.
   */
  async _resolveChatAttachmentSourceTurns(resource) {
    try {
      if (this._options.resolveChatAttachmentTurns) {
        return await this._options.resolveChatAttachmentTurns(resource);
      }
      return resolveChatStateForUri(this._stateManager, resource)?.turns ?? [];
    } catch (err) {
      this._logService.warn(`[AgentSideEffects] Unable to resolve chat attachment source ${resource}; degrading to a pointer without an excerpt`, err);
      return void 0;
    }
  }
  /**
   * Surfaces a failed first turn on a not-yet-materialized session as a
   * terminal creation failure.
   *
   * Provisional sessions defer both their root-catalog `SessionAdded`
   * notification and their `Creating -> Ready` lifecycle transition until the
   * agent materializes them (worktree setup, SDK session init, …) on the
   * first `sendMessage`. When that first send rejects — e.g. worktree/branch
   * creation throws — the session never entered the catalog and its lifecycle
   * is stuck at `Creating`, so clients that optimistically rendered it as
   * in-progress keep spinning forever.
   *
   * When the failing session is still `Creating`, dispatch
   * {@link ActionType.SessionCreationFailed} to move it to a terminal
   * `CreationFailed` lifecycle, then announce its catalog entry via
   * {@link AgentHostStateManager.markSessionPersisted}. The summary's status
   * was already aggregated to `Error` by the preceding `ChatError` dispatch,
   * so subscribers render the session as failed immediately rather than
   * waiting on a client-side timeout. The provisional session survives on the
   * agent, so resending re-attempts materialization.
   */
  _failSessionCreationIfStillCreating(sessionChannel, error) {
    const state = this._stateManager.getSessionState(sessionChannel);
    if (state?.lifecycle !== SessionLifecycle.Creating) {
      return;
    }
    this._stateManager.dispatchServerAction(sessionChannel, {
      type: ActionType.SessionCreationFailed,
      error
    });
    const summary = this._stateManager.getSessionSummary(sessionChannel);
    if (summary) {
      this._stateManager.markSessionPersisted(sessionChannel, summary);
    }
  }
  dispose() {
    this._toolCallAgents.clear();
    this._managedApprovalToolCalls.clear();
    this._toolCallTracker.clear();
    super.dispose();
  }
};
AgentSideEffects = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IAgentHostChangesetService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IAgentHostCheckpointService),
  __decorateParam(7, IAgentConfigurationService)
], AgentSideEffects);
function buildTurnFailure(stage, err) {
  const error = buildTurnFailureError(stage, err);
  return {
    stage,
    error,
    errorName: err instanceof Error ? err.name : typeof err,
    errorCode: getErrorCode(err),
    errorStack: err instanceof Error ? err.stack : void 0
  };
}
function buildTurnFailureError(stage, err) {
  const message = String(err);
  const forwarded = tryParseForwardedChatError(err instanceof Error ? err.message : message);
  const errorType = stage === "modelSelection" ? "modelSelectionFailed" : stage === "workingDirectory" ? "workingDirectoryFailed" : "sendFailed";
  if (forwarded) {
    return { errorType, message: stripProxyErrorMarker(message), _meta: toChatErrorMeta(forwarded) };
  }
  return { errorType, message };
}
export {
  AgentSideEffects
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50U2lkZUVmZmVjdHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRFcnJvckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBOS2V5TWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIElSZWFkZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IHJlYWRBZ2VudE1vZGVsQnlva0lkZW50aWZpZXIgfSBmcm9tICcuLi9jb21tb24vYWdlbnRNb2RlbEJ5b2tNZXRhLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgQWdlbnRTaWduYWwsIElBZ2VudCwgSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEsIHRvVG9vbENhbGxNZXRhIH0gZnJvbSAnLi4vY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuXG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YWJhc2UsIElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNoYXRBdHRhY2htZW50IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL2NoYXRBdHRhY2htZW50Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBidWlsZE9wZW5TZXNzaW9uTGlua0ZvckNoYXRSZXNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQsIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCB0eXBlIEFnZW50SW5mbywgdHlwZSBTZXNzaW9uSW5wdXRSZXF1ZXN0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIGlzQ2hhdEFjdGlvbiwgU3RhdGVBY3Rpb24sIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRidWlsZFN1YmFnZW50Q2hhdFVyaSxcblx0Y2hhdFN0b3JhZ2VVcmksXG5cdGdldFRvb2xGaWxlRWRpdHMsXG5cdGlzQWhwQ2hhdENoYW5uZWwsXG5cdGlzRGVmYXVsdENoYXRVcmksXG5cdGlzU3ViYWdlbnRDaGF0VXJpLFxuXHRpc0NoYXRSZWFkT25seSxcblx0QUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVksXG5cdEFIX01FVEFfSVNfUkVBRF9EQl9LRVksXG5cdE1lc3NhZ2VBdHRhY2htZW50S2luZCxcblx0TWVzc2FnZUtpbmQsXG5cdHBhcnNlQ2hhdFVyaSxcblx0cGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSxcblx0UGVuZGluZ01lc3NhZ2VLaW5kLFxuXHRSZXNwb25zZVBhcnRLaW5kLFxuXHRST09UX1NUQVRFX1VSSSxcblx0U2Vzc2lvbkxpZmVjeWNsZSxcblx0U2Vzc2lvblN0YXR1cyxcblx0VG9vbENhbGxTdGF0dXMsXG5cdFRvb2xSZXN1bHRDb250ZW50VHlwZSxcblx0dHlwZSBFcnJvckluZm8sXG5cdHR5cGUgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQsXG5cdHR5cGUgTWVzc2FnZSxcblx0dHlwZSBNZXNzYWdlQXR0YWNobWVudCxcblx0dHlwZSBVUkkgYXMgUHJvdG9jb2xVUkksXG5cdHR5cGUgU2Vzc2lvblN0YXRlLFxuXHR0eXBlIFRvb2xDYWxsU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxSZXN1bHQsXG5cdHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsXG5cdHR5cGUgVHVyblxufSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdExvY2FsVHVybnMgfSBmcm9tICcuL2FnZW50SG9zdExvY2FsVHVybnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlciB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvblRpdGxlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIHJlc29sdmVDaGF0U3RhdGVGb3JVcmkgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlciwgdHlwZSBBZ2VudEhvc3RNb2RlbFRlbGVtZXRyeUtpbmQsIHR5cGUgQWdlbnRIb3N0VHVybkZhaWx1cmVTdGFnZSwgdHlwZSBJQWdlbnRIb3N0VHVybkZhaWx1cmUgfSBmcm9tICcuL2FnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRvb2xDYWxsVHJhY2tlciB9IGZyb20gJy4vYWdlbnRIb3N0VG9vbENhbGxUcmFja2VyLmpzJztcbmltcG9ydCB7IHVwZGF0ZUFnZW50SG9zdFRlbGVtZXRyeUxldmVsRnJvbUNvbmZpZyB9IGZyb20gJy4vYWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUdXJuVHJhY2tlciB9IGZyb20gJy4vYWdlbnRIb3N0VHVyblRyYWNrZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TG9jYWxDb21tYW5kcyB9IGZyb20gJy4vbG9jYWxDb21tYW5kcy9sb2NhbENoYXRDb21tYW5kLmpzJztcbmltcG9ydCAnLi9sb2NhbENvbW1hbmRzL2xvY2FsQ2hhdENvbW1hbmRzLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXIgfSBmcm9tICcuL3Nlc3Npb25QZXJtaXNzaW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHN0cmlwUHJveHlFcnJvck1hcmtlciwgdG9DaGF0RXJyb3JNZXRhLCB0cnlQYXJzZUZvcndhcmRlZENoYXRFcnJvciB9IGZyb20gJy4vc2hhcmVkL2ZvcndhcmRlZENoYXRFcnJvci5qcyc7XG5pbXBvcnQgeyBwZXJzaXN0U2Vzc2lvbk1ldGFkYXRhIH0gZnJvbSAnLi9zaGFyZWQvcGVyc2lzdFNlc3Npb25NZXRhZGF0YS5qcyc7XG5pbXBvcnQgdHlwZSB7IFdvcmt0cmVlSXNvbGF0aW9uIH0gZnJvbSAnLi9zaGFyZWQvd29ya3RyZWVJc29sYXRpb24uanMnO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIGNvbnN0cnVjdGluZyBhbiB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30gaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2lkZUVmZmVjdHNPcHRpb25zIHtcblx0LyoqIFJlc29sdmUgdGhlIGFnZW50IHJlc3BvbnNpYmxlIGZvciBhIGdpdmVuIHNlc3Npb24gVVJJLiAqL1xuXHRyZWFkb25seSBnZXRBZ2VudDogKHNlc3Npb246IFByb3RvY29sVVJJKSA9PiBJQWdlbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBPYnNlcnZhYmxlIHNldCBvZiByZWdpc3RlcmVkIGFnZW50cy4gVHJpZ2dlcnMgYHJvb3QvYWdlbnRzQ2hhbmdlZGAgd2hlbiBpdCBjaGFuZ2VzLiAqL1xuXHRyZWFkb25seSBhZ2VudHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudFtdPjtcblx0LyoqIFNlc3Npb24gZGF0YSBzZXJ2aWNlIGZvciBjbGVhbmluZyB1cCBwZXItc2Vzc2lvbiBkYXRhIG9uIGRpc3Bvc2FsLiAqL1xuXHRyZWFkb25seSBzZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2U7XG5cdC8qKiBSZWdpc3RyeSB0aGF0IHBlcnNpc3RzIGhvc3QtaW5qZWN0ZWQgYC9yZW5hbWVgIGFuZCBgIWNvbW1hbmRgIHR1cm5zLiAqL1xuXHRyZWFkb25seSBsb2NhbFR1cm5zOiBBZ2VudEhvc3RMb2NhbFR1cm5zO1xuXHQvKiogR2V0IHRoZSBHaXRIdWIgdG9rZW4gdXNlZCBmb3IgQ29waWxvdCB1dGlsaXR5IHRpdGxlIGdlbmVyYXRpb24uICovXG5cdHJlYWRvbmx5IGdldEdpdEh1YkNvcGlsb3RUb2tlbj86ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIENBUEkgc2VydmljZSB1c2VkIGZvciBDb3BpbG90IHV0aWxpdHkgdGl0bGUgZ2VuZXJhdGlvbi4gKi9cblx0cmVhZG9ubHkgY29waWxvdEFwaVNlcnZpY2U/OiBJQ29waWxvdEFwaVNlcnZpY2U7XG5cdC8qKlxuXHQgKiBIb3N0LW93bmVkIHdvcmtpbmctZGlyZWN0b3J5IHJlc29sdXRpb24gaG9vaywgYXdhaXRlZCBiZWZvcmUgdGhlIGFnZW50J3Ncblx0ICogZmlyc3Qgc2VuZCBzbyB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5IChhbiBpc29sYXRlZCB3b3JrdHJlZSBjcmVhdGVkXG5cdCAqIG9uIHRoZSBmaXJzdCBzZW5kLCBvciB0aGUgcGlja2VkIGZvbGRlcikgaXMgcmVzb2x2ZWQgYmVmb3JlIHRoZSBhZ2VudFxuXHQgKiBtYXRlcmlhbGl6ZXMgYW5kIGl0cyBjd2QgaXMgbG9ja2VkLiBSZXNvbHZlcyB0byB0aGUgd29ya2luZyBkaXJlY3RvcmllcyB0b1xuXHQgKiBoYW5kIHRoZSBhZ2VudCAoaW5kZXggMCA9IHByb2Nlc3Mgcm9vdCksIG9yIGB1bmRlZmluZWRgIGZvciB3b3Jrc3BhY2UtbGVzc1xuXHQgKiBzZXNzaW9ucy4gUHJvdmlkZWQgYnkge0BsaW5rIEFnZW50U2VydmljZX0uXG5cdCAqL1xuXHRyZWFkb25seSByZXNvbHZlV29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQ/OiAocGFyYW1zOiB7IHNlc3Npb246IFByb3RvY29sVVJJOyBjaGF0OiBQcm90b2NvbFVSSTsgdHVybklkOiBzdHJpbmc7IHByb21wdDogc3RyaW5nIH0pID0+IFByb21pc2U8cmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQ+O1xuXHQvKiogUmVzb2x2ZXMgYSByZWZlcmVuY2VkIGNoYXQncyB0dXJucywgaHlkcmF0aW5nIGl0cyBvd25pbmcgc2Vzc2lvbiB3aGVuIG5lZWRlZC4gKi9cblx0cmVhZG9ubHkgcmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnM/OiAocmVzb3VyY2U6IFByb3RvY29sVVJJKSA9PiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT47XG5cdC8qKlxuXHQgKiBDYWxsZWQgYWZ0ZXIgZWFjaCB0b3AtbGV2ZWwgc2Vzc2lvbiB0dXJuIGNvbXBsZXRlcyBzbyBnaXQgc3RhdGUgY2FuIGJlXG5cdCAqIHJlZnJlc2hlZCBhbmQgcHVibGlzaGVkIHZpYSBgU2Vzc2lvbk1ldGFDaGFuZ2VkYC4gU3ViYWdlbnQgdHVybnMgYXJlXG5cdCAqIGV4Y2x1ZGVkIFx1MjAxNCBvbmx5IHRoZSBwYXJlbnQgc2Vzc2lvbiBVUkkgaXMgcGFzc2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25UdXJuQ29tcGxldGU6IChzZXNzaW9uOiBQcm90b2NvbFVSSSkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIENhbGxlZCB3aXRoIHRoZSB0ZXh0IG9mIGV2ZXJ5IHVzZXIgbWVzc2FnZSB0aGF0IGlzIGZvcndhcmRlZCB0byBhbiBhZ2VudCxcblx0ICogc28gdGhlIGhvc3QgY2FuIGRlcml2ZSBzZXNzaW9uIHN0YXRlIGZyb20gd2hhdCB0aGUgdXNlciB3cm90ZSAoZS5nLiB0aGVcblx0ICogR2l0SHViIGlzc3VlcyB0aGUgbWVzc2FnZSByZWZlcmVuY2VzKS5cblx0ICovXG5cdHJlYWRvbmx5IG9uVXNlck1lc3NhZ2U/OiAoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHRleHQ6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuaW50ZXJmYWNlIElRdWV1ZWRNZXNzYWdlU2VuZGVyIHtcblx0cmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZTtcbn1cblxuLyoqIEEgc2lnbmFsIHRoYXQgd2FzIGRlZmVycmVkIGJlY2F1c2UgaXRzIHN1YmFnZW50IHNlc3Npb24gZG9lcyBub3QgZXhpc3QgeWV0LiAqL1xuaW50ZXJmYWNlIElQZW5kaW5nU3ViYWdlbnRTaWduYWwge1xuXHRyZWFkb25seSBzaWduYWw6IEFnZW50U2lnbmFsO1xuXHRyZWFkb25seSBhZ2VudDogSUFnZW50O1xufVxuXG5pbnRlcmZhY2UgSVN1YmFnZW50U2Vzc2lvblJlZiB7XG5cdHJlYWRvbmx5IHBhcmVudENoYXRVcmk6IFByb3RvY29sVVJJO1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25Vcmk6IFByb3RvY29sVVJJO1xuXHRyZWFkb25seSBjaGF0VXJpOiBQcm90b2NvbFVSSTtcblx0cmVhZG9ubHkgdHVyblN0b3BXYXRjaDogU3RvcFdhdGNoO1xufVxuXG50eXBlIEFnZW50U2lnbmFsVHVybklkUm91dGluZyA9ICdwcmVzZXJ2ZScgfCAncmVtYXAnO1xuXG4vKipcbiAqIFNoYXJlZCBpbXBsZW1lbnRhdGlvbiBvZiBhZ2VudCBzaWRlLWVmZmVjdCBoYW5kbGluZy5cbiAqXG4gKiBSb3V0ZXMgY2xpZW50LWRpc3BhdGNoZWQgYWN0aW9ucyB0byB0aGUgY29ycmVjdCBhZ2VudCBiYWNrZW5kLFxuICogcmVzdG9yZXMgc2Vzc2lvbnMgZnJvbSBwcmV2aW91cyBsaWZldGltZXMsIGhhbmRsZXMgZmlsZXN5c3RlbVxuICogb3BlcmF0aW9ucyAoYnJvd3NlL2ZldGNoL3dyaXRlKSwgdHJhY2tzIHBlbmRpbmcgcGVybWlzc2lvbiByZXF1ZXN0cyxcbiAqIGFuZCB3aXJlcyB1cCBhZ2VudCBwcm9ncmVzcyBldmVudHMgdG8gdGhlIHN0YXRlIG1hbmFnZXIuXG4gKlxuICogU2Vzc2lvbiBjcmVhdGUvZGlzcG9zZS9saXN0IGFuZCBhdXRoIGFyZSBoYW5kbGVkIGJ5IHtAbGluayBBZ2VudFNlcnZpY2V9LlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRTaWRlRWZmZWN0cyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8qKiBNYXBzIHRvb2wgY2FsbCBJRHMgdG8gdGhlIGFnZW50IHRoYXQgb3ducyB0aGVtLCBmb3Igcm91dGluZyBjb25maXJtYXRpb25zLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sQ2FsbEFnZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8qKiBNYW5hZ2VkIGNvbmZpcm1hdGlvbnMgYXJlIGh1bWFuLW9ubHkgYW5kIG11c3QgbmV2ZXIgc2VlZCBob3N0LXNpZGUgc2Vzc2lvbiBwZXJtaXNzaW9ucy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbWFuYWdlZEFwcHJvdmFsVG9vbENhbGxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2xhc3RBZ2VudEluZm9zOiByZWFkb25seSBBZ2VudEluZm9bXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Blcm1pc3Npb25NYW5hZ2VyOiBTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXI7XG5cblx0LyoqIFJlZ2lzdHJ5LWRyaXZlbiBkaXNwYXRjaGVyIGZvciBob3N0LWhhbmRsZWQgYC9yZW5hbWVgIC8gYCFjb21tYW5kYCBldGMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsQ29tbWFuZHM6IEFnZW50SG9zdExvY2FsQ29tbWFuZHM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3ViYWdlbnRDaGF0cyA9IG5ldyBOS2V5TWFwPElTdWJhZ2VudFNlc3Npb25SZWYsIFtQcm90b2NvbFVSSSwgc3RyaW5nXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FuY2VsbGVkVHVybklkcyA9IG5ldyBNYXA8UHJvdG9jb2xVUkksIFNldDxzdHJpbmc+PigpO1xuXG5cdC8qKlxuXHQgKiBCdWZmZXJzIHNpZ25hbHMgd2hvc2UgYHBhcmVudFRvb2xDYWxsSWRgIHJlZmVyZW5jZXMgYSBzdWJhZ2VudFxuXHQgKiB3aG9zZSBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsIGhhcyBub3QgeWV0IGJlZW4gcHJvY2Vzc2VkLiBUaGUgU0RLIGlzXG5cdCAqIG5vdCBzdHJpY3QgYWJvdXQgb3JkZXJpbmc6IGFuIGlubmVyIGB0b29sX3N0YXJ0YCBjYW4gYXJyaXZlIGJlZm9yZSB0aGVcblx0ICogYHN1YmFnZW50X3N0YXJ0ZWRgIHRoYXQgY3JlYXRlcyB0aGUgY2hpbGQgc2Vzc2lvbi4gV2l0aG91dCBidWZmZXJpbmcsXG5cdCAqIHRob3NlIHNpZ25hbHMgd291bGQgYmUgZGlzcGF0Y2hlZCBhZ2FpbnN0IHRoZSBwYXJlbnQgc2Vzc2lvbiBhbmQgdGhlXG5cdCAqIFVJIHdvdWxkIHJlbmRlciB0aGUgaW5uZXIgdG9vbCBjYWxscyBmbGF0IGF0IHRoZSB0b3AgbGV2ZWwgcmF0aGVyIHRoYW5cblx0ICogZ3JvdXBpbmcgdGhlbSB1bmRlciB0aGUgc3ViYWdlbnQuIERyYWluZWQgYnkgYF9oYW5kbGVTdWJhZ2VudFN0YXJ0ZWRgLlxuXHQgKlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1N1YmFnZW50U2lnbmFscyA9IG5ldyBOS2V5TWFwPElQZW5kaW5nU3ViYWdlbnRTaWduYWxbXSwgW1Byb3RvY29sVVJJLCBzdHJpbmddPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWV1ZWRNZXNzYWdlU2VuZGVycyA9IG5ldyBOS2V5TWFwPElRdWV1ZWRNZXNzYWdlU2VuZGVyLCBbUHJvdG9jb2xVUkksIHN0cmluZ10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVJlcG9ydGVyOiBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdHVyblRyYWNrZXI6IEFnZW50SG9zdFR1cm5UcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sQ2FsbFRyYWNrZXI6IEFnZW50SG9zdFRvb2xDYWxsVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVDb250cm9sbGVyOiBBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyO1xuXHQvKiogSG9zdC1vd25lZCB3b3JrdHJlZSBpc29sYXRpb24gY29udHJvbGxlcjsgaW5qZWN0ZWQgcG9zdC1jb25zdHJ1Y3Rpb24uICovXG5cdHByaXZhdGUgX3dvcmt0cmVlOiBXb3JrdHJlZUlzb2xhdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQWdlbnRTaWRlRWZmZWN0c09wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhbmdlc2V0czogSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hlY2twb2ludFNlcnZpY2U6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRDb25maWdTZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcih0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHR0aGlzLl90dXJuVHJhY2tlciA9IG5ldyBBZ2VudEhvc3RUdXJuVHJhY2tlcih0aGlzLl90ZWxlbWV0cnlSZXBvcnRlcik7XG5cdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdFRvb2xDYWxsVHJhY2tlcih0aGlzLl90ZWxlbWV0cnlSZXBvcnRlcikpO1xuXHRcdHRoaXMuX3Blcm1pc3Npb25NYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyLCB0aGlzLl9zdGF0ZU1hbmFnZXIsIHt9KSk7XG5cdFx0dGhpcy5fbG9jYWxDb21tYW5kcyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWdlbnRIb3N0TG9jYWxDb21tYW5kcyxcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlcixcblx0XHRcdHRoaXMuX29wdGlvbnMubG9jYWxUdXJucyxcblx0XHRcdC8vIERyYWluaW5nIHRoZSBxdWV1ZSByZS1lbnRlcnMgYWdlbnQgbG9va3VwIC8gdGVsZW1ldHJ5IC8gc2VuZE1lc3NhZ2UsXG5cdFx0XHQvLyB3aGljaCBpcyB0aGlzIGNsYXNzJ3MgcmVzcG9uc2liaWxpdHksIHNvIHRoZSBkaXNwYXRjaGVyIGhhbmRzIHRoZVxuXHRcdFx0Ly8gdHVybiBiYWNrIGhlcmUgb25jZSBpdCBoYXMgY29tcGxldGVkIGEgaG9zdC1oYW5kbGVkIGNvbW1hbmQuXG5cdFx0XHQodHVybkNoYW5uZWw6IFByb3RvY29sVVJJKSA9PiB0aGlzLl90cnlDb25zdW1lTmV4dFF1ZXVlZE1lc3NhZ2UodHVybkNoYW5uZWwpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3RpdGxlQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIsIHRoaXMuX3N0YXRlTWFuYWdlciwge1xuXHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiB0aGlzLl9vcHRpb25zLnNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdGdldEdpdEh1YkNvcGlsb3RUb2tlbjogdGhpcy5fb3B0aW9ucy5nZXRHaXRIdWJDb3BpbG90VG9rZW4sXG5cdFx0XHRjb3BpbG90QXBpU2VydmljZTogdGhpcy5fb3B0aW9ucy5jb3BpbG90QXBpU2VydmljZSxcblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuZXZlciB0aGUgYWdlbnRzIG9ic2VydmFibGUgY2hhbmdlcywgcHVibGlzaCB0byByb290IHN0YXRlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFnZW50cyA9IHRoaXMuX29wdGlvbnMuYWdlbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3B1Ymxpc2hBZ2VudEluZm9zKGFnZW50cywgcmVhZGVyKTtcblx0XHR9KSk7XG5cblx0XHQvLyBPYnNlcnZlIGVudmVsb3BlcyBmb3Igc2lkZSBlZmZlY3RzIHRoYXQgbXVzdCBpbmNsdWRlIHNlcnZlci1kaXNwYXRjaGVkXG5cdFx0Ly8gYWN0aW9ucywgd2hpY2ggYnlwYXNzIGhhbmRsZUFjdGlvbi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0aWYgKGlzQWhwQ2hhdENoYW5uZWwoZW52ZWxvcGUuY2hhbm5lbCkgJiYgaXNDaGF0QWN0aW9uKGVudmVsb3BlLmFjdGlvbikpIHtcblx0XHRcdFx0aWYgKGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0bGV0IHR1cm5JZHMgPSB0aGlzLl9jYW5jZWxsZWRUdXJuSWRzLmdldChlbnZlbG9wZS5jaGFubmVsKTtcblx0XHRcdFx0XHRpZiAoIXR1cm5JZHMpIHtcblx0XHRcdFx0XHRcdHR1cm5JZHMgPSBuZXcgU2V0KCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9jYW5jZWxsZWRUdXJuSWRzLnNldChlbnZlbG9wZS5jaGFubmVsLCB0dXJuSWRzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHVybklkcy5hZGQoZW52ZWxvcGUuYWN0aW9uLnR1cm5JZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3luY1Nlc3Npb25JbnB1dE5lZWRlZEZvckNoYXRBY3Rpb24oZW52ZWxvcGUuY2hhbm5lbCwgZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdFx0dGhpcy5fdHJhY2tUdXJuVXNhZ2UoZW52ZWxvcGUuY2hhbm5lbCwgZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmICghZW52ZWxvcGUub3JpZ2luICYmIGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRcdFx0Ly8gQ2hhdC1hY3Rpb24gZW52ZWxvcGVzIGFyZSBlbWl0dGVkIG9uIHRoZSBjaGF0IGNoYW5uZWwgVVJJO1xuXHRcdFx0XHQvLyBhZ2VudHMgYXJlIGtleWVkIGJ5IHNlc3Npb24gVVJJLCBzbyByZXNvbHZlIGJhY2sgdG8gdGhlXG5cdFx0XHRcdC8vIG93bmluZyBzZXNzaW9uIGJlZm9yZSBub3RpZnlpbmcgdGhlIGFnZW50LiBQYXNzIHRoZSBjaGF0IFVSSVxuXHRcdFx0XHQvLyBhbG9uZ3NpZGUgc28gYWdlbnRzIHRoYXQgdHJhY2sgcGVlciBjaGF0cyBjYW4gcm91dGUgY29ycmVjdGx5LlxuXHRcdFx0XHRpZiAoIWlzQWhwQ2hhdENoYW5uZWwoZW52ZWxvcGUuY2hhbm5lbCkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIE5vdCBhIGNoYXQgY2hhbm5lbDsgaWdub3JlIChhbHJlYWR5IGxvZ2dlZCBlbHNld2hlcmUpLlxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25DaGFubmVsID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShlbnZlbG9wZS5jaGFubmVsKTtcblx0XHRcdFx0dGhpcy5fbm90aWZ5Q2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uQ2hhbm5lbCwgZW52ZWxvcGUuY2hhbm5lbCwgYWN0aW9uLnRvb2xDYWxsSWQsIGFjdGlvbi5yZXN1bHQsICdzZXJ2ZXItZW52ZWxvcGUnKTtcblx0XHRcdH1cblx0XHRcdGlmIChlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX3BlcnNpc3RDaGF0RHJhZnQoZW52ZWxvcGUuY2hhbm5lbCwgZW52ZWxvcGUuYWN0aW9uLmRyYWZ0KTtcblx0XHRcdH1cblx0XHRcdGlmIChlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZXMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGVudmVsb3BlLmNoYW5uZWwpPy5jb25maWc/LnZhbHVlcztcblx0XHRcdFx0aWYgKHZhbHVlcykge1xuXHRcdFx0XHRcdHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhlbnZlbG9wZS5jaGFubmVsLCAnY29uZmlnVmFsdWVzJywgSlNPTi5zdHJpbmdpZnkodmFsdWVzKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFBlcnNpc3RpbmcgaGVyZSByYXRoZXIgdGhhbiBpbiBgaGFuZGxlQWN0aW9uYCBjb3ZlcnMgY2xpZW50LSBhbmRcblx0XHRcdC8vIHNlcnZlci1kaXNwYXRjaGVkIGNoYW5nZXMgYWxpa2UsIHNvIG5vIGRpc3BhdGNoIHBhdGggY2FuIHNraXAgaXQuXG5cdFx0XHQvLyBSZWplY3RlZCBhY3Rpb25zIG5ldmVyIHJlYWNoZWQgc3RhdGUgYW5kIG11c3Qgbm90IGJlIHdyaXR0ZW4uXG5cdFx0XHRpZiAoIWVudmVsb3BlLnJlamVjdGlvblJlYXNvbikge1xuXHRcdFx0XHRpZiAoZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoZW52ZWxvcGUuY2hhbm5lbCwgQUhfTUVUQV9JU19SRUFEX0RCX0tFWSwgZW52ZWxvcGUuYWN0aW9uLmlzUmVhZCA/ICd0cnVlJyA6ICcnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoZW52ZWxvcGUuY2hhbm5lbCwgQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVksIGVudmVsb3BlLmFjdGlvbi5pc0FyY2hpdmVkID8gJ3RydWUnIDogJycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1Ymxpc2hlcyBhZ2VudCBkZXNjcmlwdG9ycyB1c2luZyB0aGUgbGFzdCBrbm93biBtb2RlbCBsaXN0cy5cblx0ICovXG5cdHByaXZhdGUgX3B1Ymxpc2hBZ2VudEluZm9zKGFnZW50czogcmVhZG9ubHkgSUFnZW50W10sIHJlYWRlcj86IElSZWFkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvczogQWdlbnRJbmZvW10gPSBhZ2VudHMubWFwKGEgPT4ge1xuXHRcdFx0Y29uc3QgZCA9IGEuZ2V0RGVzY3JpcHRvcigpO1xuXHRcdFx0Y29uc3QgcHJvdGVjdGVkUmVzb3VyY2VzID0gYS5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IHJlYWRlciA/IGEubW9kZWxzLnJlYWQocmVhZGVyKSA6IGEubW9kZWxzLmdldCgpO1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhLmdldEN1c3RvbWl6YXRpb25zPy4oKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyOiBkLnByb3ZpZGVyLCBkaXNwbGF5TmFtZTogZC5kaXNwbGF5TmFtZSwgZGVzY3JpcHRpb246IGQuZGVzY3JpcHRpb24sIG1vZGVsczogbW9kZWxzLm1hcChtID0+ICh7XG5cdFx0XHRcdFx0aWQ6IG0uaWQsXG5cdFx0XHRcdFx0cHJvdmlkZXI6IG0ucHJvdmlkZXIsXG5cdFx0XHRcdFx0bmFtZTogbS5uYW1lLFxuXHRcdFx0XHRcdG1heENvbnRleHRXaW5kb3c6IG0ubWF4Q29udGV4dFdpbmRvdyxcblx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IG0ubWF4T3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRcdG1heFByb21wdFRva2VuczogbS5tYXhQcm9tcHRUb2tlbnMsXG5cdFx0XHRcdFx0c3VwcG9ydHNWaXNpb246IG0uc3VwcG9ydHNWaXNpb24sXG5cdFx0XHRcdFx0cG9saWN5U3RhdGU6IG0ucG9saWN5U3RhdGUsXG5cdFx0XHRcdFx0Y29uZmlnU2NoZW1hOiBtLmNvbmZpZ1NjaGVtYSxcblx0XHRcdFx0XHRfbWV0YTogbS5fbWV0YSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogY3VzdG9taXphdGlvbnM/Lmxlbmd0aCA/IFsuLi5jdXN0b21pemF0aW9uc10gOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb3RlY3RlZFJlc291cmNlczogcHJvdGVjdGVkUmVzb3VyY2VzLmxlbmd0aCA+IDAgPyBwcm90ZWN0ZWRSZXNvdXJjZXMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogZC5jYXBhYmlsaXRpZXMgPyB7IC4uLmQuY2FwYWJpbGl0aWVzIH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGlmIChlcXVhbHModGhpcy5fbGFzdEFnZW50SW5mb3MsIGluZm9zKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0QWdlbnRJbmZvcyA9IGluZm9zO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkLCBhZ2VudHM6IGluZm9zIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHVibGlzaFNlc3Npb25DdXN0b21pemF0aW9ucyhhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBQcm90b2NvbFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghYWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCBhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoVVJJLnBhcnNlKHNlc3Npb24pKTtcblxuXHRcdC8vIFNraXAgdGhlIGRpc3BhdGNoIHdoZW4gdGhlIHJlc29sdmVkIGN1c3RvbWl6YXRpb25zIG1hdGNoIHdoYXQgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBzdGF0ZSBhbHJlYWR5IGhvbGRzLiBBIHNpbmdsZSBlZGl0IHVuZGVyIGEgc2hhcmVkIGB+Ly5jbGF1ZGVgXG5cdFx0Ly8gdHJlZSBmYW5zIG91dCB0byBldmVyeSBvcGVuIHNlc3Npb24gKGFuZCwgdmlhIHRoZSBhZ2VudC1sZXZlbFxuXHRcdC8vIGBvbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlYCwgaXMgcmVwdWJsaXNoZWQgb25jZSBwZXIgc2Vzc2lvbiksIHNvXG5cdFx0Ly8gd2l0aG91dCB0aGlzIGd1YXJkIGEgc2luZ2xlIGNoYW5nZSBlbWl0dGVkIE8oTl4yKSBpZGVudGljYWxcblx0XHQvLyBgU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZGAgZW52ZWxvcGVzLiBDb21wYXJpbmcgYWdhaW5zdCB0aGVcblx0XHQvLyBhdXRob3JpdGF0aXZlIHNlc3Npb24gc3RhdGUgKHJhdGhlciB0aGFuIGEgc2lkZSBjYWNoZSkga2VlcHMgdGhpc1xuXHRcdC8vIGNvcnJlY3QgYWNyb3NzIGlkbGUtZXZpY3Rpb24gKyByZXN0b3JlOiBhIHJlc3RvcmVkIHNlc3Npb24ncyBzdGF0ZVxuXHRcdC8vIHN0YXJ0cyB3aXRob3V0IGN1c3RvbWl6YXRpb25zLCBzbyB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCByZWZyZXNoIGFsd2F5c1xuXHRcdC8vIGRpc3BhdGNoZXMgZXZlbiBpZiB0aGUgcmVzb2x2ZWQgc2V0IG1hdGNoZXMgdGhlIHByaW9yIGluY2FybmF0aW9uLlxuXHRcdC8vIEl0IGFsc28gbmVlZHMgbm8gY2xlYW51cCBvbiBzZXNzaW9uIHRlYXJkb3duLiBgdW5kZWZpbmVkYCAobmV2ZXJcblx0XHQvLyBwdWJsaXNoZWQpIG5ldmVyIGVxdWFscyBhIHJlc29sdmVkIGFycmF5LCBzbyB0aGUgaW5pdGlhbCBwdWJsaXNoXG5cdFx0Ly8gYWx3YXlzIGdvZXMgdGhyb3VnaC5cblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKT8uY3VzdG9taXphdGlvbnM7XG5cdFx0aWYgKGN1cnJlbnQgJiYgZXF1YWxzKGN1cnJlbnQsIGN1c3RvbWl6YXRpb25zKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRjdXN0b21pemF0aW9uczogWy4uLmN1c3RvbWl6YXRpb25zXSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3B1Ymxpc2hTZXNzaW9uQ3VzdG9taXphdGlvbnNTb29uKGFnZW50OiBJQWdlbnQsIHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0dm9pZCB0aGlzLl9wdWJsaXNoU2Vzc2lvbkN1c3RvbWl6YXRpb25zKGFnZW50LCBzZXNzaW9uKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2lkZUVmZmVjdHNdIGdldFNlc3Npb25DdXN0b21pemF0aW9ucyBmYWlsZWQnLCBlcnIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVibGlzaFNlc3Npb25DdXN0b21pemF0aW9uc0ZvckFnZW50KGFnZW50OiBJQWdlbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25VcmlzKCkpIHtcblx0XHRcdGlmICh0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb24pID09PSBhZ2VudCkge1xuXHRcdFx0XHR0aGlzLl9wdWJsaXNoU2Vzc2lvbkN1c3RvbWl6YXRpb25zU29vbihhZ2VudCwgc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcHVibGlzaEFsbFNlc3Npb25DdXN0b21pemF0aW9ucygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25VcmlzKCkpIHtcblx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uKTtcblx0XHRcdGlmIChhZ2VudCkge1xuXHRcdFx0XHR0aGlzLl9wdWJsaXNoU2Vzc2lvbkN1c3RvbWl6YXRpb25zU29vbihhZ2VudCwgc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGlucHV0LW5lZWRlZCBhZ2dyZWdhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vXG5cdC8vIE1pcnJvcnMgcGVyLWNoYXQgYmxvY2tlcnMgKHVzZXItaW5wdXQgZWxpY2l0YXRpb25zLCB0b29sIGNvbmZpcm1hdGlvbnMsXG5cdC8vIGNsaWVudC10b29sIGV4ZWN1dGlvbnMsIGFuZCBNQ1AgYXV0aGVudGljYXRpb24pIGludG8gdGhlIG93bmluZyBzZXNzaW9uJ3Ncblx0Ly8gYGlucHV0TmVlZGVkYCBsaXN0IHNvIGNsaWVudHMgc3Vic2NyaWJlZCBvbmx5IHRvIHRoZSBzZXNzaW9uIGNoYW5uZWwgY2FuXG5cdC8vIGRpc2NvdmVyIGFuZCBhbnN3ZXIgdGhlbSB3aXRob3V0IHN1YnNjcmliaW5nIHRvIGVhY2ggY2hhdC4gVGhpcyBoYW5kbGVyXG5cdC8vIG9ubHkgcHJvZHVjZXMgdGhlIHN0YXRlOyBpdCBkb2VzIG5vdCBjb25zdW1lIGl0LlxuXG5cdHByaXZhdGUgX3N5bmNTZXNzaW9uSW5wdXROZWVkZWRGb3JDaGF0QWN0aW9uKGNoYXRVcmk6IFByb3RvY29sVVJJLCBhY3Rpb246IENoYXRBY3Rpb24pOiB2b2lkIHtcblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkOlxuXHRcdFx0XHR0aGlzLl9zeW5jQ2hhdElucHV0TmVlZGVkKGNoYXRVcmksIGFjdGlvbi5yZXF1ZXN0LmlkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0QW5zd2VyQ2hhbmdlZDpcblx0XHRcdFx0dGhpcy5fc3luY0NoYXRJbnB1dE5lZWRlZChjaGF0VXJpLCBhY3Rpb24ucmVxdWVzdElkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkOlxuXHRcdFx0XHR0aGlzLl9yZW1vdmVTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwgdGhpcy5fY2hhdElucHV0TmVlZGVkSWQoY2hhdFVyaSwgYWN0aW9uLnJlcXVlc3RJZCkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydDpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeTpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQ6XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGU6XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVzdWx0Q29uZmlybWVkOlxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbEF1dGhSZXF1aXJlZDpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxBdXRoUmVzb2x2ZWQ6XG5cdFx0XHRcdHRoaXMuX3N5bmNUb29sSW5wdXROZWVkZWQoY2hhdFVyaSwgYWN0aW9uLnR1cm5JZCwgYWN0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlOlxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkOlxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRFcnJvcjpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkOlxuXHRcdFx0XHR0aGlzLl9yZW1vdmVTZXNzaW9uSW5wdXROZWVkZWRGb3JDaGF0KGNoYXRVcmkpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jQ2hhdElucHV0TmVlZGVkKGNoYXRVcmk6IFByb3RvY29sVVJJLCByZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGF0VXJpKTtcblx0XHRjb25zdCBwYXJ0ID0gc3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+XG5cdFx0XHRwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0XG5cdFx0XHQmJiBwYXJ0LnJlc3BvbnNlID09PSB1bmRlZmluZWRcblx0XHRcdCYmIHBhcnQucmVxdWVzdC5pZCA9PT0gcmVxdWVzdElkXG5cdFx0KTtcblx0XHRjb25zdCBpZCA9IHRoaXMuX2NoYXRJbnB1dE5lZWRlZElkKGNoYXRVcmksIHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFwYXJ0IHx8IHBhcnQua2luZCAhPT0gUmVzcG9uc2VQYXJ0S2luZC5JbnB1dFJlcXVlc3QpIHtcblx0XHRcdHRoaXMuX3JlbW92ZVNlc3Npb25JbnB1dE5lZWRlZChjaGF0VXJpLCBpZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NldFNlc3Npb25JbnB1dE5lZWRlZChjaGF0VXJpLCB7XG5cdFx0XHRpZCxcblx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLkNoYXRJbnB1dCxcblx0XHRcdGNoYXQ6IGNoYXRVcmksXG5cdFx0XHRyZXF1ZXN0OiBwYXJ0LnJlcXVlc3QsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jVG9vbElucHV0TmVlZGVkKGNoYXRVcmk6IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uSWQgPSB0aGlzLl90b29sQ29uZmlybWF0aW9uTmVlZGVkSWQoY2hhdFVyaSwgdHVybklkLCB0b29sQ2FsbElkKTtcblx0XHRjb25zdCBjbGllbnRFeGVjdXRpb25JZCA9IHRoaXMuX3Rvb2xDbGllbnRFeGVjdXRpb25OZWVkZWRJZChjaGF0VXJpLCB0dXJuSWQsIHRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uSWQgPSB0aGlzLl90b29sQXV0aGVudGljYXRpb25OZWVkZWRJZChjaGF0VXJpLCB0dXJuSWQsIHRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IHRvb2xDYWxsID0gdGhpcy5fZmluZFRvb2xDYWxsKGNoYXRVcmksIHR1cm5JZCwgdG9vbENhbGxJZCk7XG5cblx0XHQvLyBBIGNhbGwgYXV0by1hcHByb3ZlZCBieSB0aGUgc2Vzc2lvbidzIGJ5cGFzcyBzZXR0aW5nIGlzIHJ1blxuXHRcdC8vIGF1dG9tYXRpY2FsbHkgYnkgdGhlIG93bmluZyBjbGllbnQgYW5kIG5ldmVyIGJsb2NrcyBvbiB0aGUgdXNlciwgc29cblx0XHQvLyBrZWVwIGl0IG91dCBvZiB0aGUgc2Vzc2lvbiBgaW5wdXROZWVkZWRgIHF1ZXVlICh3aGljaCB3b3VsZCBmbGFzaFxuXHRcdC8vIFwiaW5wdXQgbmVlZGVkXCIgaW4gdGhlIHNlc3Npb25zIGxpc3QpLiBgYXV0b0FwcHJvdmVCeVNldHRpbmdgIGNvdmVyc1xuXHRcdC8vIG9ubHkgdGhlIHBhcmFtZXRlciBnYXRlOyBhIGBQZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uYCBpcyBhIGdlbnVpbmVcblx0XHQvLyBwcm9tcHQgYW5kIGlzIHN0aWxsIHN1cmZhY2VkLlxuXHRcdGNvbnN0IGF1dG9BcHByb3ZlZCA9ICEhdG9vbENhbGwgJiYgcmVhZFRvb2xDYWxsTWV0YSh0b29sQ2FsbCkuYXV0b0FwcHJvdmVCeVNldHRpbmcgPT09IHRydWU7XG5cblx0XHRjb25zdCBzdXBwcmVzc0F1dG9BcHByb3ZlZENvbmZpcm1hdGlvbiA9IGF1dG9BcHByb3ZlZCAmJiB0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uO1xuXHRcdGNvbnN0IG5lZWRzQ29uZmlybWF0aW9uID0gIXN1cHByZXNzQXV0b0FwcHJvdmVkQ29uZmlybWF0aW9uICYmICh0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uIHx8IHRvb2xDYWxsPy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdSZXN1bHRDb25maXJtYXRpb24pO1xuXHRcdGlmIChuZWVkc0NvbmZpcm1hdGlvbiAmJiB0b29sQ2FsbCkge1xuXHRcdFx0dGhpcy5fc2V0U2Vzc2lvbklucHV0TmVlZGVkKGNoYXRVcmksIHtcblx0XHRcdFx0aWQ6IGNvbmZpcm1hdGlvbklkLFxuXHRcdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRjaGF0OiBjaGF0VXJpLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlbW92ZVNlc3Npb25JbnB1dE5lZWRlZChjaGF0VXJpLCBjb25maXJtYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJpYnV0b3IgPSB0b29sQ2FsbD8uY29udHJpYnV0b3I7XG5cdFx0aWYgKCFhdXRvQXBwcm92ZWQgJiYgdG9vbENhbGw/LnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyAmJiBjb250cmlidXRvcj8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50KSB7XG5cdFx0XHR0aGlzLl9zZXRTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwge1xuXHRcdFx0XHRpZDogY2xpZW50RXhlY3V0aW9uSWQsXG5cdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdGNoYXQ6IGNoYXRVcmksXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0Y2xpZW50SWQ6IGNvbnRyaWJ1dG9yLmNsaWVudElkLFxuXHRcdFx0XHR0b29sQ2FsbCxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwgY2xpZW50RXhlY3V0aW9uSWQpO1xuXHRcdH1cblxuXHRcdGlmICh0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdHRoaXMuX3NldFNlc3Npb25JbnB1dE5lZWRlZChjaGF0VXJpLCB7XG5cdFx0XHRcdGlkOiBhdXRoZW50aWNhdGlvbklkLFxuXHRcdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQXV0aGVudGljYXRpb24sXG5cdFx0XHRcdGNoYXQ6IGNoYXRVcmksXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGwsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVtb3ZlU2Vzc2lvbklucHV0TmVlZGVkKGNoYXRVcmksIGF1dGhlbnRpY2F0aW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRUb29sQ2FsbChjaGF0VXJpOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IFRvb2xDYWxsU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGF0VXJpKTtcblx0XHRjb25zdCB0dXJuID0gc3RhdGU/LmFjdGl2ZVR1cm4/LmlkID09PSB0dXJuSWQgPyBzdGF0ZS5hY3RpdmVUdXJuIDogc3RhdGU/LnR1cm5zLmZpbmQodCA9PiB0LmlkID09PSB0dXJuSWQpO1xuXHRcdGNvbnN0IHBhcnQgPSB0dXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcC50b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkKTtcblx0XHRyZXR1cm4gcGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaTogUHJvdG9jb2xVUkksIHJlcXVlc3Q6IFNlc3Npb25JbnB1dFJlcXVlc3QpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0VXJpKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmlucHV0TmVlZGVkPy5maW5kKHIgPT4gci5pZCA9PT0gcmVxdWVzdC5pZCk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIGVxdWFscyhleGlzdGluZywgcmVxdWVzdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRTZXQsIHJlcXVlc3QgfSk7XG5cdFx0aWYgKHJlcXVlc3Qua2luZCAhPT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuQ2hhdElucHV0KSB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX29wdGlvbnMuZ2V0QWdlbnQoc2Vzc2lvblVyaSk7XG5cdFx0XHRpZiAoYWdlbnQpIHtcblx0XHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsQmxvY2tlZChhZ2VudC5pZCwgY2hhdFVyaSwgcmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlU2Vzc2lvbklucHV0TmVlZGVkKGNoYXRVcmk6IFByb3RvY29sVVJJLCBpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdFVyaSk7XG5cdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsVW5ibG9ja2VkKGNoYXRVcmksIGlkKTtcblx0XHRpZiAoIXRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmlucHV0TmVlZGVkPy5zb21lKHIgPT4gci5pZCA9PT0gaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkUmVtb3ZlZCwgaWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVTZXNzaW9uSW5wdXROZWVkZWRGb3JDaGF0KGNoYXRVcmk6IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdFVyaSk7XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmlucHV0TmVlZGVkID8/IFtdKSB7XG5cdFx0XHRpZiAocmVxdWVzdC5jaGF0ID09PSBjaGF0VXJpKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZVNlc3Npb25JbnB1dE5lZWRlZChjaGF0VXJpLCByZXF1ZXN0LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jaGF0SW5wdXROZWVkZWRJZChjaGF0VXJpOiBQcm90b2NvbFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgY2hhdElucHV0OiR7Y2hhdFVyaX06JHtyZXF1ZXN0SWR9YDtcblx0fVxuXG5cdHByaXZhdGUgX3Rvb2xDb25maXJtYXRpb25OZWVkZWRJZChjaGF0VXJpOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGB0b29sQ29uZmlybWF0aW9uOiR7Y2hhdFVyaX06JHt0dXJuSWR9OiR7dG9vbENhbGxJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9vbENsaWVudEV4ZWN1dGlvbk5lZWRlZElkKGNoYXRVcmk6IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYHRvb2xDbGllbnRFeGVjdXRpb246JHtjaGF0VXJpfToke3R1cm5JZH06JHt0b29sQ2FsbElkfWA7XG5cdH1cblxuXHRwcml2YXRlIF90b29sQXV0aGVudGljYXRpb25OZWVkZWRJZChjaGF0VXJpOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGB0b29sQXV0aGVudGljYXRpb246JHtjaGF0VXJpfToke3R1cm5JZH06JHt0b29sQ2FsbElkfWA7XG5cdH1cblxuXHQvLyAtLS0tIEluaXRpYWxpemF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogSW5pdGlhbGl6ZXMgYXN5bmMgcmVzb3VyY2VzICh0cmVlLXNpdHRlciBXQVNNKSB1c2VkIGZvciBjb21tYW5kXG5cdCAqIGF1dG8tYXBwcm92YWwuIEF3YWl0IHRoaXMgYmVmb3JlIGFueSBzZXNzaW9uIGV2ZW50cyBjYW4gYXJyaXZlIHRvXG5cdCAqIGd1YXJhbnRlZSB0aGF0IGF1dG8tYXBwcm92YWwgY2hlY2tzIGFyZSBmdWxseSBzeW5jaHJvbm91cy5cblx0ICovXG5cdGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Blcm1pc3Npb25NYW5hZ2VyLmluaXRpYWxpemUoKTtcblx0fVxuXG5cdC8vIC0tLS0gQWdlbnQgcmVnaXN0cmF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGEgcHJvZ3Jlc3Mtc2lnbmFsIGxpc3RlbmVyIG9uIHRoZSBnaXZlbiBhZ2VudCBzbyB0aGF0XG5cdCAqIHtAbGluayBBZ2VudFNpZ25hbH1zIGFyZSByb3V0ZWQvZGlzcGF0Y2hlZCB0aHJvdWdoIHRoZSBzdGF0ZSBtYW5hZ2VyLlxuXHQgKiBSZXR1cm5zIGEgZGlzcG9zYWJsZSB0aGF0IHJlbW92ZXMgdGhlIGxpc3RlbmVyLlxuXHQgKi9cblx0cmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50OiBJQWdlbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFnZW50Lm9uRGlkU2Vzc2lvblByb2dyZXNzKHNpZ25hbCA9PiB7XG5cdFx0XHR0aGlzLl9oYW5kbGVBZ2VudFNpZ25hbChhZ2VudCwgc2lnbmFsKTtcblx0XHR9KSk7XG5cdFx0aWYgKGFnZW50Lm9uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcHVibGlzaEFnZW50SW5mb3ModGhpcy5fb3B0aW9ucy5hZ2VudHMuZ2V0KCkpO1xuXHRcdFx0XHR0aGlzLl9wdWJsaXNoU2Vzc2lvbkN1c3RvbWl6YXRpb25zRm9yQWdlbnQoYWdlbnQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRpZiAoYWdlbnQub25EaWRSZXF1aXJlQXV0aCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFnZW50Lm9uRGlkUmVxdWlyZUF1dGgoZSA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIuZW1pdEF1dGhSZXF1aXJlZChlKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHQvKipcblx0ICogUm91dGVzIGEgc2luZ2xlIHNpZ25hbCBmcm9tIGBhZ2VudGAgdG8gdGhlIGNvcnJlY3Qgc2Vzc2lvbi5cblx0ICpcblx0ICogQWN0aW9uIHNpZ25hbHMgd2l0aCBhIGBwYXJlbnRUb29sQ2FsbElkYCBhcmUgcm91dGVkIHRvIHRoZSBtYXRjaGluZ1xuXHQgKiBzdWJhZ2VudCBzZXNzaW9uLiBJZiB0aGUgc3ViYWdlbnQgc2Vzc2lvbiBkb2VzIG5vdCBleGlzdCB5ZXQgKHRoZSBTREtcblx0ICogY2FuIGVtaXQgYW4gaW5uZXIgYHRvb2xfc3RhcnRgIGJlZm9yZSBpdHMgYHN1YmFnZW50X3N0YXJ0ZWRgKSwgdGhlXG5cdCAqIHNpZ25hbCBpcyBidWZmZXJlZCBpbiB7QGxpbmsgX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHN9IGFuZCByZXBsYXllZFxuXHQgKiBvbmNlIHRoZSBgc3ViYWdlbnRfc3RhcnRlZGAgYXJyaXZlcy5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUFnZW50U2lnbmFsKGFnZW50OiBJQWdlbnQsIHNpZ25hbDogQWdlbnRTaWduYWwpOiB2b2lkIHtcblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdzdWJhZ2VudF9zdGFydGVkJykge1xuXHRcdFx0dGhpcy5faGFuZGxlU3ViYWdlbnRTdGFydGVkKHNpZ25hbC5jaGF0LnRvU3RyaW5nKCksIHNpZ25hbC50b29sQ2FsbElkLCBzaWduYWwuYWdlbnROYW1lLCBzaWduYWwuYWdlbnREaXNwbGF5TmFtZSwgc2lnbmFsLmFnZW50RGVzY3JpcHRpb24sIHNpZ25hbC50YXNrUHJvbXB0LCBzaWduYWwucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9kcmFpblBlbmRpbmdTdWJhZ2VudFNpZ25hbHMoc2lnbmFsLmNoYXQudG9TdHJpbmcoKSwgc2lnbmFsLnRvb2xDYWxsSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChzaWduYWwua2luZCA9PT0gJ3N1YmFnZW50X3Jlc3VtZWQnKSB7XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudFNlc3Npb24oc2lnbmFsLmNoYXQudG9TdHJpbmcoKSwgc2lnbmFsLnRvb2xDYWxsSWQsIHNpZ25hbC5tZXNzYWdlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdzdWJhZ2VudF9jb21wbGV0ZWQnKSB7XG5cdFx0XHR0aGlzLmNvbXBsZXRlU3ViYWdlbnRTZXNzaW9uKHNpZ25hbC5jaGF0LnRvU3RyaW5nKCksIHNpZ25hbC50b29sQ2FsbElkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdzdGVlcmluZ19jb25zdW1lZCcpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzaWduYWwuY2hhdC50b1N0cmluZygpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogc2lnbmFsLmlkLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzaWduYWwua2luZCA9PT0gJ2FjdGlvbicgPyBzaWduYWwucmVzb3VyY2UudG9TdHJpbmcoKSA6IHNpZ25hbC5jaGF0LnRvU3RyaW5nKCk7XG5cblx0XHQvLyBSb3V0ZSBzaWduYWxzIHdpdGggcGFyZW50VG9vbENhbGxJZCB0byB0aGUgc3ViYWdlbnQgc2Vzc2lvbi5cblx0XHQvLyBCb3RoIGFjdGlvbiBzaWduYWxzIGFuZCBwZW5kaW5nX2NvbmZpcm1hdGlvbiBzaWduYWxzIGNhbiBjYXJyeVxuXHRcdC8vIGEgcGFyZW50VG9vbENhbGxJZCBcdTIwMTQgZm9yIGNsaWVudCB0b29scyBpbnNpZGUgYSBzdWJhZ2VudCB0aGVcblx0XHQvLyBwZXJtaXNzaW9uIGZsb3cgZmlyZXMgYHBlbmRpbmdfY29uZmlybWF0aW9uYCBmb3IgYW4gaW5uZXIgdG9vbFxuXHRcdC8vIGNhbGwsIGFuZCB0aGF0IHNpZ25hbCBtdXN0IGJlIHJvdXRlZCB0byB0aGUgc3ViYWdlbnQgc2Vzc2lvblxuXHRcdC8vIChvdGhlcndpc2UgdGhlIHJlc3VsdGluZyBDaGF0VG9vbENhbGxSZWFkeSB3b3VsZCBsYW5kIG9uIHRoZVxuXHRcdC8vIHBhcmVudCBzZXNzaW9uLCB3aGljaCBoYXMgbm8gbWF0Y2hpbmcgQ2hhdFRvb2xDYWxsU3RhcnQpLlxuXHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSBzaWduYWwucGFyZW50VG9vbENhbGxJZDtcblx0XHRpZiAocGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRTZXNzaW9uID0gdGhpcy5fc3ViYWdlbnRDaGF0cy5nZXQoc2Vzc2lvbktleSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoc3ViYWdlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnN0IHN1YlR1cm5JZCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc3ViYWdlbnRTZXNzaW9uLmNoYXRVcmkpO1xuXHRcdFx0XHRpZiAoc3ViVHVybklkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb25Gb3JTZXNzaW9uKHNpZ25hbCwgc3ViYWdlbnRTZXNzaW9uLmNoYXRVcmksIHN1YlR1cm5JZCwgJ3JlbWFwJywgYWdlbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudFNpZGVFZmZlY3RzXSBEcm9wcGluZyAke3RoaXMuX2Rlc2NyaWJlU2lnbmFsKHNpZ25hbCl9IGZvciBpbmFjdGl2ZSBzdWJhZ2VudCAke3Nlc3Npb25LZXl9LyR7cGFyZW50VG9vbENhbGxJZH1gKTtcblx0XHRcdFx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRcdGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHNpZ25hbC5zdGF0ZS50b29sQ2FsbElkLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGVuZGluZ1NpZ25hbHMgPSB0aGlzLl9wZW5kaW5nU3ViYWdlbnRTaWduYWxzLmdldChzZXNzaW9uS2V5LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdGlmIChzaWduYWwua2luZCA9PT0gJ3BlbmRpbmdfY29uZmlybWF0aW9uJyAmJiAhcGVuZGluZ1NpZ25hbHMpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50U2lkZUVmZmVjdHNdIERlbnlpbmcgcGVybWlzc2lvbiBmb3IgdW5yb3V0YWJsZSBzdWJhZ2VudCAke3Nlc3Npb25LZXl9LyR7cGFyZW50VG9vbENhbGxJZH06IHRvb2xDYWxsSWQ9JHtzaWduYWwuc3RhdGUudG9vbENhbGxJZH1gKTtcblx0XHRcdFx0YWdlbnQucmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3Qoc2lnbmFsLnN0YXRlLnRvb2xDYWxsSWQsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdWJhZ2VudCBzZXNzaW9uIGRvZXMgbm90IGV4aXN0IHlldCBcdTIwMTQgYnVmZmVyIHRoZSBzaWduYWwgc28gd2UgY2FuXG5cdFx0XHQvLyByZXBsYXkgaXQgYWZ0ZXIgYHN1YmFnZW50X3N0YXJ0ZWRgIGFycml2ZXMuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTaWRlRWZmZWN0c10gQnVmZmVyaW5nICR7dGhpcy5fZGVzY3JpYmVTaWduYWwoc2lnbmFsKX0gZm9yIHBlbmRpbmcgc3ViYWdlbnQgJHtzZXNzaW9uS2V5fS8ke3BhcmVudFRvb2xDYWxsSWR9YCk7XG5cdFx0XHRsZXQgYnVmZmVyID0gcGVuZGluZ1NpZ25hbHM7XG5cdFx0XHRpZiAoIWJ1ZmZlcikge1xuXHRcdFx0XHRidWZmZXIgPSBbXTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50U2lnbmFscy5zZXQoYnVmZmVyLCBzZXNzaW9uS2V5LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHRcdGJ1ZmZlci5wdXNoKHsgc2lnbmFsLCBhZ2VudCB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSb3V0ZSBwZW5kaW5nX2NvbmZpcm1hdGlvbiBzaWduYWxzIGZvciB0b29scyBpbnNpZGUgc3ViYWdlbnQgc2Vzc2lvbnNcblx0XHQvLyAobGVnYWN5IHBhdGggZm9yIHNpZ25hbHMgd2l0aG91dCBhbiBleHBsaWNpdCBwYXJlbnRUb29sQ2FsbElkIFx1MjAxNCB0aGVcblx0XHQvLyB0b29sIHdhcyBwcmV2aW91c2x5IHJlZ2lzdGVyZWQgdW5kZXIgaXRzIHN1YmFnZW50IHNlc3Npb24ga2V5IGluXG5cdFx0Ly8gX3Rvb2xDYWxsQWdlbnRzKS5cblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdGNvbnN0IHN1YmFnZW50Q2hhdFVyaSA9IHRoaXMuX2ZpbmRTdWJhZ2VudENoYXRGb3JUb29sQ2FsbChzZXNzaW9uS2V5LCBzaWduYWwuc3RhdGUudG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoc3ViYWdlbnRDaGF0VXJpKSB7XG5cdFx0XHRcdGNvbnN0IHN1YlR1cm5JZCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc3ViYWdlbnRDaGF0VXJpKSA/PyAnJztcblx0XHRcdFx0dm9pZCB0aGlzLl9oYW5kbGVUb29sUmVhZHkoc2lnbmFsLCBzdWJhZ2VudENoYXRVcmksIHN1YlR1cm5JZCwgYWdlbnQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2lkZUVmZmVjdHNdIF9oYW5kbGVUb29sUmVhZHkgZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0dXJuSWQgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHNlc3Npb25LZXkpO1xuXHRcdGlmICh0dXJuSWQpIHtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uRm9yU2Vzc2lvbihzaWduYWwsIHNlc3Npb25LZXksIHR1cm5JZCwgJ3ByZXNlcnZlJywgYWdlbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE5vIGFjdGl2ZSB0dXJuIG9uIHRoZSBzZXNzaW9uLiBOb24tYWN0aW9uIHNpZ25hbHMgYXJlIHNpbGVudGx5XG5cdFx0Ly8gZHJvcHBlZCwgYnV0IGFjdGlvbiBzaWduYWxzIGNhbiBzdGlsbCB0YXJnZXQgc2Vzc2lvbi1sZXZlbCBzdGF0ZVxuXHRcdC8vIHN1Y2ggYXMgY3VzdG9taXphdGlvbnMsIHRpdGxlLCBvciBjb25maWd1cmF0aW9uLiBBIHR1cm5Db21wbGV0ZVxuXHRcdC8vIGFjdGlvbiBhbHNvIGRyaXZlcyBwb3N0LXR1cm4gc2lkZSBlZmZlY3RzIGV2ZW4gd2hlbiB0aGUgbWF0Y2hpbmdcblx0XHQvLyB0dXJuU3RhcnRlZCB3YXMgbm90IG9ic2VydmVkIGJ5IHRoaXMgc2lkZS1lZmZlY3RzIGluc3RhbmNlLlxuXHRcdC8vXG5cdFx0Ly8gcGVuZGluZ19jb25maXJtYXRpb24gc2lnbmFscyBtdXN0IGFsc28gYmUgaGFuZGxlZCBoZXJlOiB3aGVuIGFcblx0XHQvLyBob29rLXRyaWdnZXJlZCBjb250aW51YXRpb24gcnVucyBhZnRlciB0aGUgcHJvdG9jb2wgdHVybiBoYXNcblx0XHQvLyBhbHJlYWR5IGNvbXBsZXRlZCwgdG9vbCBhY3Rpb25zIGFyZSBkaXNwYXRjaGVkIChiZWxvdykgd2l0aCBhblxuXHRcdC8vIGVtcHR5IHR1cm5JZC4gV2l0aG91dCB0aGlzLCB0aGUgcGVuZGluZ19jb25maXJtYXRpb24gaXMgc2lsZW50bHlcblx0XHQvLyBkcm9wcGVkLCB0aGUgcGVybWlzc2lvbiBkZWZlcnJlZCBuZXZlciByZXNvbHZlcywgYW5kIHRoZSBzZXNzaW9uXG5cdFx0Ly8gaGFuZ3MgaW5kZWZpbml0ZWx5LlxuXHRcdGlmIChzaWduYWwua2luZCA9PT0gJ3BlbmRpbmdfY29uZmlybWF0aW9uJykge1xuXHRcdFx0dm9pZCB0aGlzLl9oYW5kbGVUb29sUmVhZHkoc2lnbmFsLCBzZXNzaW9uS2V5LCAnJywgYWdlbnQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudFNpZGVFZmZlY3RzXSBfaGFuZGxlVG9vbFJlYWR5IGZhaWxlZCcsIGVycik7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNpZ25hbC5raW5kID09PSAnYWN0aW9uJykge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gc2lnbmFsLmFjdGlvbjtcblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlICYmIHRoaXMuX2NhbmNlbGxlZFR1cm5JZHMuZ2V0KHNlc3Npb25LZXkpPy5oYXMoYWN0aW9uLnR1cm5JZCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2lkZUVmZmVjdHNdIERyb3BwaW5nIGNvbXBsZXRpb24gZm9yIGNhbmNlbGxlZCB0dXJuICR7YWN0aW9uLnR1cm5JZH0gb24gJHtzZXNzaW9uS2V5fWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbktleSwgYWN0aW9uKTtcblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlKSB7XG5cdFx0XHRcdHRoaXMuX3J1blR1cm5Db21wbGV0ZVNpZGVFZmZlY3RzKHNlc3Npb25LZXksIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoZXMgYSBzaWduYWwgdG8gYSByZXNvbHZlZCBjaGF0LCBwcmVzZXJ2aW5nIHRvcC1sZXZlbCB0dXJuIGlkZW50aXR5IG9yIHJlbWFwcGluZyBjcm9zcy1jaGFubmVsIHN1YmFnZW50IGFjdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF9kaXNwYXRjaEFjdGlvbkZvclNlc3Npb24oc2lnbmFsOiBBZ2VudFNpZ25hbCwgc2Vzc2lvbktleTogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCB0dXJuSWRSb3V0aW5nOiBBZ2VudFNpZ25hbFR1cm5JZFJvdXRpbmcsIGFnZW50PzogSUFnZW50KTogdm9pZCB7XG5cdFx0aWYgKHNpZ25hbC5raW5kID09PSAncGVuZGluZ19jb25maXJtYXRpb24nKSB7XG5cdFx0XHRpZiAoYWdlbnQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9oYW5kbGVUb29sUmVhZHkoc2lnbmFsLCBzZXNzaW9uS2V5LCB0dXJuSWQsIGFnZW50KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudFNpZGVFZmZlY3RzXSBfaGFuZGxlVG9vbFJlYWR5IGZhaWxlZCcsIGVycik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2lnbmFsLmtpbmQgIT09ICdhY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBhY3Rpb24gPSBzaWduYWwuYWN0aW9uO1xuXHRcdGlmIChhY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkICYmIGhhc0tleShhY3Rpb24sIHsgdHVybklkOiB0cnVlIH0pICYmIGFjdGlvbi50dXJuSWQgIT09IHR1cm5JZCkge1xuXHRcdFx0aWYgKHR1cm5JZFJvdXRpbmcgPT09ICdyZW1hcCcpIHtcblx0XHRcdFx0YWN0aW9uID0geyAuLi5hY3Rpb24sIHR1cm5JZCB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2lkZUVmZmVjdHNdIERyb3BwaW5nIHN0YWxlICR7YWN0aW9uLnR5cGV9IGZvciAke3Nlc3Npb25LZXl9OiBwcm9kdWNlclR1cm5JZD0ke2FjdGlvbi50dXJuSWR9LCBhY3RpdmVUdXJuSWQ9JHt0dXJuSWR9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQgJiYgYWdlbnQpIHtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsQWdlbnRzLnNldChgJHtzZXNzaW9uS2V5fToke2FjdGlvbi50b29sQ2FsbElkfWAsIGFnZW50LmlkKTtcblx0XHRcdC8vIFN0YW1wIHRoZSB0b29sIGNhbGwgc3RhcnQgZm9yIGBsYW5ndWFnZU1vZGVsVG9vbEludm9rZWRgIHRlbGVtZXRyeS5cblx0XHRcdC8vIFJlYWR5IG1heSByZWZpbmUgdGhlIGNvbnRyaWJ1dG9yIG9uY2UgdGhlIGNvbXBsZXRlIHRvb2wgbWV0YWRhdGEgaXNcblx0XHRcdC8vIGF2YWlsYWJsZSwgc28gdGhlIHRyYWNrZXIgdXBkYXRlcyB0aGUgc291cmNlIGtpbmQgYmVsb3cgd2hlbiBuZWVkZWQuXG5cdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIudG9vbENhbGxTdGFydGVkKGFnZW50LmlkLCBzZXNzaW9uS2V5LCBhY3Rpb24udG9vbENhbGxJZCwgYWN0aW9uLnRvb2xOYW1lLCBhY3Rpb24uY29udHJpYnV0b3IpO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpIHtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci50b29sQ2FsbE1ldGFkYXRhVXBkYXRlZChzZXNzaW9uS2V5LCBhY3Rpb24udG9vbENhbGxJZCwgYWN0aW9uLmNvbnRyaWJ1dG9yKTtcblx0XHRcdGlmIChhY3Rpb24uY29uZmlybWVkKSB7XG5cdFx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci50b29sQ2FsbEV4ZWN1dGlvblN0YXJ0ZWQoc2Vzc2lvbktleSwgYWN0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBpc0FocENoYXRDaGFubmVsKHNlc3Npb25LZXkpID8gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShzZXNzaW9uS2V5KSA6IHNlc3Npb25LZXk7XG5cblx0XHQvLyBTdGFtcCB0aGUgc3ViYWdlbnQgY2hhdCBVUkkgb250byB0aGUgdG9vbCBjYWxsIGFzIHNvb24gYXMgdG9vbEtpbmRcblx0XHQvLyBpcyBrbm93biwgc28gY2xpZW50cyBnZXQgaXQgZnJvbSB0aGUgd2lyZSBpbnN0ZWFkIG9mIGRlcml2aW5nIGl0LlxuXHRcdGlmIChcblx0XHRcdChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCB8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSB8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSlcblx0XHRcdCYmIHJlYWRUb29sQ2FsbE1ldGEoYWN0aW9uKS50b29sS2luZCA9PT0gJ3N1YmFnZW50J1xuXHRcdFx0JiYgcmVhZFRvb2xDYWxsTWV0YShhY3Rpb24pLnN1YmFnZW50Q2hhdFVyaSA9PT0gdW5kZWZpbmVkXG5cdFx0KSB7XG5cdFx0XHRhY3Rpb24gPSB7IC4uLmFjdGlvbiwgX21ldGE6IHsgLi4uYWN0aW9uLl9tZXRhLCBzdWJhZ2VudENoYXRVcmk6IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmksIGFjdGlvbi50b29sQ2FsbElkKSB9IH07XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBhIHBhcmVudCB0b29sIGNhbGwgaGFzIGFuIGFzc29jaWF0ZWQgc3ViYWdlbnQgc2Vzc2lvbixcblx0XHQvLyBwcmVzZXJ2ZSB0aGUgc3ViYWdlbnQgY29udGVudCBtZXRhZGF0YSBpbiB0aGUgY29tcGxldGlvbiByZXN1bHQuXG5cdFx0Ly8gVGhlIFNESydzIHRvb2xfY29tcGxldGUgcHJvdmlkZXMgaXRzIG93biBjb250ZW50IHdoaWNoIHdvdWxkXG5cdFx0Ly8gb3ZlcndyaXRlIHRoZSBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50IHRoYXQgd2FzIHNldCB2aWFcblx0XHQvLyBDaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCB3aGlsZSBydW5uaW5nLlxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnQgPSB0aGlzLl9zdWJhZ2VudENoYXRzLmdldChzZXNzaW9uS2V5LCBhY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpO1xuXHRcdFx0XHRjb25zdCBydW5uaW5nQ29udGVudCA9IHRoaXMuX2dldFJ1bm5pbmdUb29sQ2FsbENvbnRlbnQocGFyZW50U3RhdGUsIHR1cm5JZCwgYWN0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBzdWJhZ2VudEVudHJ5ID0gcnVubmluZ0NvbnRlbnQuZmluZChjID0+IGhhc0tleShjLCB7IHR5cGU6IHRydWUgfSkgJiYgYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdFx0XHRpZiAoc3ViYWdlbnRFbnRyeSkge1xuXHRcdFx0XHRcdGNvbnN0IG1lcmdlZENvbnRlbnQgPSBbLi4uKGFjdGlvbi5yZXN1bHQuY29udGVudCA/PyBbXSksIHN1YmFnZW50RW50cnldO1xuXHRcdFx0XHRcdGNvbnN0IG1lcmdlZDogQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24gPSB7IC4uLmFjdGlvbiwgcmVzdWx0OiB7IC4uLmFjdGlvbi5yZXN1bHQsIGNvbnRlbnQ6IG1lcmdlZENvbnRlbnQgfSB9O1xuXHRcdFx0XHRcdGFjdGlvbiA9IG1lcmdlZDtcblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25LZXksIGFjdGlvbik7XG5cblx0XHQvLyBNYXJrIGZpcnN0IHZpc2libGUgcHJvZ3Jlc3MgZm9yIFRURlQgdGVsZW1ldHJ5XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXREZWx0YVxuXHRcdFx0fHwgYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydFxuXHRcdFx0fHwgYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnRcblx0XHRcdHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmcpIHtcblx0XHRcdHRoaXMuX3R1cm5UcmFja2VyLm1hcmtGaXJzdFByb2dyZXNzKHNlc3Npb25LZXksIHR1cm5JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSB7XG5cdFx0XHQvLyBFbWl0IGBsYW5ndWFnZU1vZGVsVG9vbEludm9rZWRgIHRlbGVtZXRyeSBmb3IgdGhlIGNvbXBsZXRlZCB0b29sXG5cdFx0XHQvLyBjYWxsLiBgYWN0aW9uLnJlc3VsdGAgY2FycmllcyBgc3VjY2Vzc2AvYGVycm9yLmNvZGVgIGV2ZW4gYWZ0ZXIgdGhlXG5cdFx0XHQvLyBzdWJhZ2VudC1jb250ZW50IG1lcmdlIGFib3ZlICh3aGljaCBvbmx5IHRvdWNoZXMgYHJlc3VsdC5jb250ZW50YCkuXG5cdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIudG9vbENhbGxDb21wbGV0ZWQoc2Vzc2lvbktleSwgYWN0aW9uLnRvb2xDYWxsSWQsIGFjdGlvbi5yZXN1bHQpO1xuXG5cdFx0XHQvLyBEcm9wIGFueSBldmVudHMgdGhhdCB3ZXJlIGJ1ZmZlcmVkIGZvciBhIHN1YmFnZW50IHdob3NlXG5cdFx0XHQvLyBgc3ViYWdlbnRfc3RhcnRlZGAgbmV2ZXIgYXJyaXZlZCAoZS5nLiB0aGUgcGFyZW50IHRvb2wgZmFpbGVkXG5cdFx0XHQvLyBiZWZvcmUgdGhlIHN1YmFnZW50IHdhcyBjcmVhdGVkKS4gQSByZWdpc3RlcmVkIGNoaWxkIGNoYXQgcmVtYWluc1xuXHRcdFx0Ly8gYXZhaWxhYmxlIGFjcm9zcyBjb21wbGV0ZWQgdHVybnMgc28gaXQgY2FuIGJlIHN0ZWVyZWQgYWdhaW4uXG5cdFx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRTaWduYWxzLmRlbGV0ZShzZXNzaW9uS2V5LCBhY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoZ2V0VG9vbEZpbGVFZGl0cyhhY3Rpb24ucmVzdWx0KS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2NoYW5nZXNldHMub25Ub29sQ2FsbEVkaXRzQXBwbGllZChzZXNzaW9uVXJpLCB0dXJuSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLl90dXJuVHJhY2tlci50dXJuQ29tcGxldGVkKHNlc3Npb25LZXksIHR1cm5JZCwgJ3N1Y2Nlc3MnKTtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc2Vzc2lvbktleSk7XG5cdFx0XHR0aGlzLl9ydW5UdXJuQ29tcGxldGVTaWRlRWZmZWN0cyhzZXNzaW9uS2V5LCB0dXJuSWQpO1xuXHRcdH1cblxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCkge1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIudHVybkNvbXBsZXRlZChzZXNzaW9uS2V5LCB0dXJuSWQsICdjYW5jZWxsZWQnKTtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc2Vzc2lvbktleSk7XG5cdFx0XHR0aGlzLl9tYXJrU2Vzc2lvblVucmVhZChzZXNzaW9uVXJpKTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSB7XG5cdFx0XHR0aGlzLl90dXJuVHJhY2tlci50dXJuQ29tcGxldGVkKHNlc3Npb25LZXksIHR1cm5JZCwgJ2Vycm9yJywgeyBzdGFnZTogJ3Byb3ZpZGVyJywgZXJyb3I6IGFjdGlvbi5lcnJvciB9KTtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc2Vzc2lvbktleSk7XG5cdFx0XHR0aGlzLl9tYXJrU2Vzc2lvblVucmVhZChzZXNzaW9uVXJpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUG9zdC10dXJuIHNpZGUgZWZmZWN0czogZmx1c2ggYW55IHBlbmRpbmcgZGVib3VuY2VkIGRpZmYgY29tcHV0YXRpb24sXG5cdCAqIGNvbXB1dGUgZmluYWwgZGlmZnMgaW1tZWRpYXRlbHksIGRyYWluIHRoZSBuZXh0IHF1ZXVlZCBtZXNzYWdlLCBhbmRcblx0ICogbm90aWZ5IHRoZSBob3N0IHNvIGl0IGNhbiByZWZyZXNoIGdpdCBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgX3J1blR1cm5Db21wbGV0ZVNpZGVFZmZlY3RzKHNlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdC8vIENoZWNrcG9pbnRzLCBjaGFuZ2VzZXRzIGFuZCB0aGUgaG9zdCBnaXQtcmVmcmVzaCBub3RpZmljYXRpb24gYXJlXG5cdFx0Ly8gc2NvcGVkIHRvIHRoZSBvd25pbmcgc2Vzc2lvbidzIHdvcmtpbmcgdHJlZSwgd2hpY2ggcGVlciBjaGF0c1xuXHRcdC8vIHNoYXJlLiBOb3JtYWxpemUgYW4gYWRkaXRpb25hbC1jaGF0IGNoYW5uZWwgdG8gaXRzIHNlc3Npb24gZm9yXG5cdFx0Ly8gdGhvc2UsIHdoaWxlIGtlZXBpbmcgdGhlIG9yaWdpbmFsIGNoYW5uZWwgZm9yIHBlci1jaGF0IHF1ZXVlZFxuXHRcdC8vIG1lc3NhZ2UgY29uc3VtcHRpb24gKHF1ZXVlcyBsaXZlIG9uIHRoZSBjaGF0IHN0YXRlKS4gRm9yIHRoZVxuXHRcdC8vIGRlZmF1bHQgY2hhdCAvIHNpbmdsZS1jaGF0IGNhc2UgYHNlc3Npb25LZXlgIGlzIGFscmVhZHkgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBVUkksIHNvIHRoaXMgaXMgYSBuby1vcC5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gaXNBaHBDaGF0Q2hhbm5lbChzZXNzaW9uS2V5KSA/IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoc2Vzc2lvbktleSkgOiBzZXNzaW9uS2V5O1xuXHRcdC8vIENhcHR1cmUgdGhlIGVuZC1vZi10dXJuIGdpdCBjaGVja3BvaW50IEJFRk9SRSBub3RpZnlpbmcgdGhlXG5cdFx0Ly8gY2hhbmdlc2V0IHNlcnZpY2Ugc28gdGhlIHBlci10dXJuIGNoYW5nZXNldCByZWNvbXB1dGUgY2FuIHRha2Vcblx0XHQvLyB0aGUgYXV0aG9yaXRhdGl2ZSBnaXQtZGlmZiBmYXN0IHBhdGggKHdoaWNoIGluY2x1ZGVzIHRlcm1pbmFsLXRvb2xcblx0XHQvLyBlZGl0cyB0aGUgRmlsZUVkaXRUcmFja2VyIG1pc3NlcykuIFRoZSBjYXB0dXJlIGlzIGJlc3QtZWZmb3J0IFx1MjAxNFxuXHRcdC8vIGFueSBmYWlsdXJlIGxvZ3MgYW5kIHRoZSBjaGFuZ2VzZXQgcGlwZWxpbmUgZmFsbHMgYmFjayB0byB0aGVcblx0XHQvLyBgZmlsZV9lZGl0c2AtYmFzZWQgcGF0aC4gV2UgZG9uJ3QgYmxvY2sgc3Vic2VxdWVudCBzaWRlIGVmZmVjdHNcblx0XHQvLyAocXVldWVkIG1lc3NhZ2UgZHJhaW4sIGhvc3Qgbm90aWZpY2F0aW9uKSBvbiB0aGUgY2hhbmdlc2V0XG5cdFx0Ly8gY29tcGxldGlvbiBzaW5jZSB0aG9zZSBoYXZlIGFsd2F5cyBiZWVuIGZpcmUtYW5kLWZvcmdldDsgdGhlXG5cdFx0Ly8gb3JkZXJpbmcgZ3VhcmFudGVlIHdlIGNhcmUgYWJvdXQgaXMgY2hlY2twb2ludC10aGVuLWNoYW5nZXNldC5cblx0XHRpZiAodHVybklkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFJlc29sdmVkIGhlcmUgcmF0aGVyIHRoYW4gaW5zaWRlIHRoZSBjaGVja3BvaW50IHNlcnZpY2Ugc28gdGhlXG5cdFx0XHQvLyByZXBvc2l0b3JpZXMgYSBjaGVja3BvaW50IGFjdHMgb24gYXJlIGFsd2F5cyBleHBsaWNpdCBhdCB0aGVcblx0XHRcdC8vIGNhbGwgc2l0ZS4gTm90ZSB0aGUgY2hhbmdlc2V0IHNlcnZpY2UgYmVsb3cgZGVsaWJlcmF0ZWx5IGtlZXBzXG5cdFx0XHQvLyBpdHMgb3duIHJlc29sdXRpb246IGBvblR1cm5Db21wbGV0ZWAgb25seSBzY2hlZHVsZXMgZGVmZXJyZWRcblx0XHRcdC8vIHJlY29tcHV0ZXMgdGhhdCBhcmUgc2hhcmVkIHdpdGggc3Vic2NyaXB0aW9uLCB0cnVuY2F0aW9uIGFuZFxuXHRcdFx0Ly8gbWlkLXR1cm4tZGVib3VuY2UgZW50cnkgcG9pbnRzLCBzbyBpdCBoYXMgbm8gc2luZ2xlIHBvaW50IGF0XG5cdFx0XHQvLyB3aGljaCBhIGNhbGxlci1zdXBwbGllZCBzZXQgd291bGQgYXBwbHkuXG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB0aGlzLl9hZ2VudENvbmZpZ1NlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25VcmkpPy5tYXAodyA9PiBVUkkucGFyc2UodykpO1xuXHRcdFx0dGhpcy5fY2hlY2twb2ludFNlcnZpY2UuY2FwdHVyZVR1cm5DaGVja3BvaW50KFVSSS5wYXJzZShzZXNzaW9uVXJpKSwgdHVybklkLCB3b3JraW5nRGlyZWN0b3JpZXMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VzZXRzLm9uVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCk7XG5cdFx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBUdXJuIGNoZWNrcG9pbnQgY2FwdHVyZSBmYWlsZWQgZm9yICR7c2Vzc2lvblVyaX0vJHt0dXJuSWR9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdFx0dGhpcy5fY2hhbmdlc2V0cy5vblR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLCB0dXJuSWQpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NoYW5nZXNldHMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaSwgdHVybklkKTtcblx0XHR9XG5cdFx0dGhpcy5fdHJ5Q29uc3VtZU5leHRRdWV1ZWRNZXNzYWdlKHNlc3Npb25LZXkpO1xuXHRcdHRoaXMuX29wdGlvbnMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaSk7XG5cblx0XHQvLyBBZnRlciB0aGUgZmlyc3QgdHVybiBjb21wbGV0ZXMsIHJlZmluZSB0aGUgYXV0by1nZW5lcmF0ZWQgdGl0bGUgdXNpbmdcblx0XHQvLyB0aGUgZnVsbCBmaXJzdC10dXJuIGNvbnRleHQgKHJlcXVlc3QgKyByZXNwb25zZSkuIE5vLW9wIGZvciBsYXRlclxuXHRcdC8vIHR1cm5zIG9yIHdoZW4gdGhlIHRpdGxlIGhhcyBzaW5jZSBiZWVuIGNoYW5nZWQuIGBzZXNzaW9uS2V5YCBtYXkgYmUgYW5cblx0XHQvLyBhZGRpdGlvbmFsIGNoYXQgY2hhbm5lbDsgcm91dGUgaXQgYXMgYGNoYXRDaGFubmVsYCBzbyB0aGUgcmVmaW5lbWVudFxuXHRcdC8vIHRhcmdldHMgdGhhdCBjaGF0J3MgdGl0bGUsIG1pcnJvcmluZyBgc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZWAuXG5cdFx0Y29uc3QgdGl0bGVDaGF0Q2hhbm5lbCA9IGlzQWhwQ2hhdENoYW5uZWwoc2Vzc2lvbktleSkgJiYgIWlzRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSkgPyBzZXNzaW9uS2V5IDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RpdGxlQ29udHJvbGxlci5yZWZpbmVUaXRsZUZyb21GaXJzdFR1cm4oc2Vzc2lvblVyaSwgdGl0bGVDaGF0Q2hhbm5lbCk7XG5cblx0XHQvLyBBIGNvbXBsZXRlZCB0dXJuIHByb2R1Y2VzIG5ldyBvdXRwdXQgdGhlIHVzZXIgbWF5IG5vdCBoYXZlIHNlZW4uIFJvdXRlXG5cdFx0Ly8gc3ViYWdlbnQgdHVybnMgdG8gdGhlaXIgb3duaW5nIHNlc3Npb24gdG9vIChhIGJhY2tncm91bmQgc3ViYWdlbnQgY2FuXG5cdFx0Ly8gY29tcGxldGUgYWZ0ZXIgdGhlIHBhcmVudCB0dXJuKS4gRWFjaCBjbGllbnQga2VlcHMgaXRzIGFjdGl2ZSBzZXNzaW9uXG5cdFx0Ly8gcmVhZDsgYF9tYXJrU2Vzc2lvblVucmVhZGAgaXMgaWRlbXBvdGVudC5cblx0XHR0aGlzLl9tYXJrU2Vzc2lvblVucmVhZChzZXNzaW9uVXJpKTtcblx0fVxuXG5cdHByaXZhdGUgX21hcmtTZXNzaW9uVW5yZWFkKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdHVzID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb24pPy5zdGF0dXMgPz8gMDtcblx0XHRpZiAoIShzdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzUmVhZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUGVyc2lzdGVuY2UgcmlkZXMgdGhlIGVudmVsb3BlIG9ic2VydmVyIHNldCB1cCBpbiB0aGUgY29uc3RydWN0b3IuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2Rlc2NyaWJlU2lnbmFsKHNpZ25hbDogQWdlbnRTaWduYWwpOiBzdHJpbmcge1xuXHRcdHJldHVybiBzaWduYWwua2luZCA9PT0gJ2FjdGlvbicgPyBgYWN0aW9uKCR7c2lnbmFsLmFjdGlvbi50eXBlfSlgIDogc2lnbmFsLmtpbmQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGF5cyBhbnkgc2lnbmFscyB0aGF0IHdlcmUgYnVmZmVyZWQgd2hpbGUgd2FpdGluZyBmb3Jcblx0ICogYHN1YmFnZW50X3N0YXJ0ZWRgIHRvIGNyZWF0ZSB0aGUgc3ViYWdlbnQgc2Vzc2lvbi4gQ2FsbGVkIGltbWVkaWF0ZWx5XG5cdCAqIGFmdGVyIGBfaGFuZGxlU3ViYWdlbnRTdGFydGVkYC5cblx0ICovXG5cdHByaXZhdGUgX2RyYWluUGVuZGluZ1N1YmFnZW50U2lnbmFscyhwYXJlbnRDaGF0VVJJOiBQcm90b2NvbFVSSSwgcGFyZW50VG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fcGVuZGluZ1N1YmFnZW50U2lnbmFscy5nZXQocGFyZW50Q2hhdFVSSSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0aWYgKCFidWZmZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50U2lnbmFscy5kZWxldGUocGFyZW50Q2hhdFVSSSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2lkZUVmZmVjdHNdIERyYWluaW5nICR7YnVmZmVyLmxlbmd0aH0gYnVmZmVyZWQgc2lnbmFsKHMpIGZvciBzdWJhZ2VudCAke3BhcmVudENoYXRVUkl9LyR7cGFyZW50VG9vbENhbGxJZH1gKTtcblx0XHRmb3IgKGNvbnN0IHsgc2lnbmFsLCBhZ2VudCB9IG9mIGJ1ZmZlcikge1xuXHRcdFx0dGhpcy5faGFuZGxlQWdlbnRTaWduYWwoYWdlbnQsIHNpZ25hbCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBTdWJhZ2VudCBzZXNzaW9uIG1hbmFnZW1lbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBTdGFydHMgdGhlIHN1YmFnZW50IHR1cm4gaW4gcmVzcG9uc2UgdG8gYSBgc3ViYWdlbnRfc3RhcnRlZGAgZXZlbnQgYW5kXG5cdCAqIHdpcmVzIHRoZSBwYXJlbnQgdG9vbCBjYWxsIHRvIHRoZSBzdWJhZ2VudCBjaGF0LiBUaGUgc3ViYWdlbnQgY2hhdCdzXG5cdCAqIGNhdGFsb2cgbWVtYmVyc2hpcCBpcyBvd25lZCBieSB0aGUgc3Bhd24gY2hhbm5lbFxuXHQgKiAoe0BsaW5rIEFnZW50U2VydmljZS5fb25DaGF0U3Bhd25lZH0pLCB3aGljaCB0aGUgb3JjaGVzdHJhdG9yIGFwcGxpZXNcblx0ICogYmVmb3JlIHRoaXMgcnVucywgc28gdGhpcyBvbmx5IGRyaXZlcyB0aGUgdHVybi90cmFja2luZy9wYXJlbnQgY29udGVudFxuXHQgKiBcdTIwMTQgaXQgZG9lcyBub3QgYWRkIHRoZSBjaGF0LlxuXHQgKlxuXHQgKiBgY2hhdFVSSWAgaXMgYWx3YXlzIHRoZSBhZ2VudCdzIHRvcC1sZXZlbCBjaGF0OiB0aGUgc3ViYWdlbnQgaXNcblx0ICogcmVnaXN0ZXJlZCAoYW5kIGlubmVyIGV2ZW50cyByb3V0ZWQpIHVuZGVyIGl0IGJlY2F1c2UgaW5uZXItdG9vbFxuXHQgKiBzaWduYWxzIGNhcnJ5IHRoZSB0b3AtbGV2ZWwgY2hhdCBhcyB0aGVpciByZXNvdXJjZS4gYHNwYXduaW5nVG9vbFBhcmVudElkYCxcblx0ICogd2hlbiBzZXQsIGlzIHRoZSB0b29sIGNhbGwgb25lIGxldmVsIHVwIGZyb20gdGhlIHNwYXduaW5nIGB0b29sQ2FsbElkYFxuXHQgKiBcdTIwMTQgdGhlIHRvb2wgY2FsbCBpbiB3aG9zZSAoc3ViYWdlbnQpIGNoYXQgdGhlIHNwYXduaW5nIHRvb2wgbGl2ZXMgXHUyMDE0IGFuZFxuXHQgKiBpcyB1c2VkIHRvIHJvdXRlIHRoZSBkaXNjb3ZlcnkgY29udGVudCBibG9jayB0byB0aGF0IGltbWVkaWF0ZSBwYXJlbnRcblx0ICogY2hhdC4gU2luY2Ugc3ViYWdlbnQgY2hhdHMgYXJlIGZsYXQgKGtleWVkIG9mZiB0aGUgcm9vdCBzZXNzaW9uKSwgdGhpc1xuXHQgKiBvbmUtaG9wIHJlZmVyZW5jZSByZXNvbHZlcyB0aGUgcGFyZW50IGNoYXQgYXQgYW55IG5lc3RpbmcgZGVwdGguXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVTdWJhZ2VudFN0YXJ0ZWQoXG5cdFx0Y2hhdFVSSTogUHJvdG9jb2xVUkksXG5cdFx0dG9vbENhbGxJZDogc3RyaW5nLFxuXHRcdGFnZW50TmFtZTogc3RyaW5nLFxuXHRcdGFnZW50RGlzcGxheU5hbWU6IHN0cmluZyxcblx0XHRhZ2VudERlc2NyaXB0aW9uPzogc3RyaW5nLFxuXHRcdHRhc2tQcm9tcHQ/OiBzdHJpbmcsXG5cdFx0c3Bhd25pbmdUb29sUGFyZW50SWQ/OiBzdHJpbmcsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25VcmkgPSBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRVUkkpO1xuXHRcdGNvbnN0IHN1YmFnZW50Q2hhdFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHBhcmVudFNlc3Npb25VcmksIHRvb2xDYWxsSWQpO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zdWJhZ2VudENoYXRzLmdldChjaGF0VVJJLCB0b29sQ2FsbElkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHRoaXMuX3Jlc3VtZVN1YmFnZW50U2Vzc2lvbihjaGF0VVJJLCB0b29sQ2FsbElkLCB0YXNrUHJvbXB0ID8geyB0ZXh0OiB0YXNrUHJvbXB0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50U2lkZUVmZmVjdHNdIFN0YXJ0aW5nIHN1YmFnZW50IHR1cm46ICR7c3ViYWdlbnRDaGF0VXJpfSAocGFyZW50PSR7Y2hhdFVSSX0sIHRvb2xDYWxsSWQ9JHt0b29sQ2FsbElkfSlgKTtcblxuXHRcdC8vIFRoZSBzcGF3bmluZyB0b29sIGNhbGwgbGl2ZXMgaW4gdGhlIGltbWVkaWF0ZSBwYXJlbnQgY2hhdCAodG9wLWxldmVsLCBvciB0aGUgcGFyZW50IHN1YmFnZW50IGNoYXQgd2hlbiBuZXN0ZWQpLlxuXHRcdGNvbnN0IGNvbnRlbnRDaGF0VXJpID0gc3Bhd25pbmdUb29sUGFyZW50SWRcblx0XHRcdD8gdGhpcy5fc3ViYWdlbnRDaGF0cy5nZXQoY2hhdFVSSSwgc3Bhd25pbmdUb29sUGFyZW50SWQpPy5jaGF0VXJpID8/IGNoYXRVUklcblx0XHRcdDogY2hhdFVSSTtcblxuXHRcdC8vIFNlZWQgdGhlIHN1YmFnZW50J3Mgb3BlbmluZyByZXF1ZXN0IHdpdGggdGhlIGRlbGVnYXRlZCB0YXNrIHByb21wdCxcblx0XHQvLyBzdXBwbGllZCBieSB0aGUgcHJvdmlkZXIgb24gdGhlIGBzdWJhZ2VudF9zdGFydGVkYCBzaWduYWwuXG5cdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHN1YmFnZW50Q2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogdGFza1Byb21wdCA/PyAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc3ViYWdlbnRDaGF0cy5zZXQoeyBwYXJlbnRDaGF0VXJpOiBjaGF0VVJJLCB0b29sQ2FsbElkLCBzZXNzaW9uVXJpOiBwYXJlbnRTZXNzaW9uVXJpLCBjaGF0VXJpOiBzdWJhZ2VudENoYXRVcmksIHR1cm5TdG9wV2F0Y2g6IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpIH0sIGNoYXRVUkksIHRvb2xDYWxsSWQpO1xuXG5cdFx0Ly8gRGlzcGF0Y2ggdGhlIGRpc2NvdmVyeSBjb250ZW50IG9uIHRoZSBzcGF3bmluZyB0b29sIGNhbGwncyBvd24gY2hhdDsgdGhlIHRvcC1sZXZlbCBjaGF0IGlzIGEgbm8tb3Agd2hlbiBuZXN0ZWQuXG5cdFx0Y29uc3QgcGFyZW50VHVybklkID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChjb250ZW50Q2hhdFVyaSk7XG5cdFx0aWYgKHBhcmVudFR1cm5JZCkge1xuXHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNvbnRlbnRDaGF0VXJpKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nQ29udGVudCA9IHRoaXMuX2dldFJ1bm5pbmdUb29sQ2FsbENvbnRlbnQocGFyZW50U3RhdGUsIHBhcmVudFR1cm5JZCwgdG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY29udGVudENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCxcblx0XHRcdFx0dHVybklkOiBwYXJlbnRUdXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHQuLi5leGlzdGluZ0NvbnRlbnQsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHN1YmFnZW50Q2hhdFVyaSxcblx0XHRcdFx0XHRcdHRpdGxlOiBhZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0YWdlbnROYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFnZW50RGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50IGNvbnRlbnQgYXJyYXkgZnJvbSBhIHJ1bm5pbmcgdG9vbCBjYWxsLCBpZiBhbnkuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRSdW5uaW5nVG9vbENhbGxDb250ZW50KFxuXHRcdHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCxcblx0XHR0dXJuSWQ6IHN0cmluZyxcblx0XHR0b29sQ2FsbElkOiBzdHJpbmcsXG5cdCk6IFRvb2xSZXN1bHRDb250ZW50W10ge1xuXHRcdGlmICghc3RhdGU/LmFjdGl2ZVR1cm4gfHwgc3RhdGUuYWN0aXZlVHVybi5pZCAhPT0gdHVybklkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcnAgb2Ygc3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRpZiAocnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkICYmIHJwLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZykge1xuXHRcdFx0XHRyZXR1cm4gcnAudG9vbENhbGwuY29udGVudCA/IFsuLi5ycC50b29sQ2FsbC5jb250ZW50XSA6IFtdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIF90dXJuRHVyYXRpb24oc3RvcFdhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRcdGNvbnN0IGVsYXBzZWQgPSBzdG9wV2F0Y2g/LmVsYXBzZWQoKTtcblx0XHRyZXR1cm4gdHlwZW9mIGVsYXBzZWQgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShlbGFwc2VkKSA/IE1hdGgubWF4KDAsIGVsYXBzZWQpIDogMDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3VtZVN1YmFnZW50U2Vzc2lvbihwYXJlbnRDaGF0VVJJOiBQcm90b2NvbFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCBtZXNzYWdlOiBNZXNzYWdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSB0aGlzLl9zdWJhZ2VudENoYXRzLmdldChwYXJlbnRDaGF0VVJJLCB0b29sQ2FsbElkKTtcblx0XHRpZiAoIXN1YmFnZW50KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRTaWRlRWZmZWN0c10gQ2Fubm90IHJlc3VtZSB1bmtub3duIHN1YmFnZW50ICR7cGFyZW50Q2hhdFVSSX0vJHt0b29sQ2FsbElkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzdWJhZ2VudC5jaGF0VXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50U2lkZUVmZmVjdHNdIFJlc3VtaW5nIHN1YmFnZW50IHR1cm46ICR7c3ViYWdlbnQuY2hhdFVyaX0gKHBhcmVudD0ke3BhcmVudENoYXRVUkl9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0pYCk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHN1YmFnZW50LmNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0c3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtZXNzYWdlOiBtZXNzYWdlID8/IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHR0aGlzLl9zdWJhZ2VudENoYXRzLnNldCh7IC4uLnN1YmFnZW50LCB0dXJuU3RvcFdhdGNoOiBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKSB9LCBwYXJlbnRDaGF0VVJJLCB0b29sQ2FsbElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWxzIGFsbCBhY3RpdmUgc3ViYWdlbnQgc2Vzc2lvbnMgZm9yIGEgZ2l2ZW4gcGFyZW50IHNlc3Npb24uXG5cdCAqL1xuXHRjYW5jZWxTdWJhZ2VudFNlc3Npb25zKHBhcmVudENoYXRVUkk6IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzdWJhZ2VudCBvZiB0aGlzLl9zdWJhZ2VudENoYXRzLmdldEFsbChwYXJlbnRDaGF0VVJJKSkge1xuXHRcdFx0Y29uc3QgdHVybklkID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzdWJhZ2VudC5jaGF0VXJpKTtcblx0XHRcdGlmICh0dXJuSWQpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHN1YmFnZW50LmNoYXRVcmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRkdXJhdGlvbjogdGhpcy5fdHVybkR1cmF0aW9uKHN1YmFnZW50LnR1cm5TdG9wV2F0Y2gpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fdHVyblRyYWNrZXIudHVybkNvbXBsZXRlZChzdWJhZ2VudC5jaGF0VXJpLCB0dXJuSWQsICdjYW5jZWxsZWQnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc3ViYWdlbnQuY2hhdFVyaSk7XG5cdFx0fVxuXHRcdHRoaXMuX3N1YmFnZW50Q2hhdHMuZGVsZXRlQWxsKHBhcmVudENoYXRVUkkpO1xuXHRcdC8vIERyb3AgYW55IGJ1ZmZlcmVkIGV2ZW50cyB0YXJnZXRlZCBhdCBzdWJhZ2VudHMgdGhhdCBuZXZlciBzdGFydGVkLlxuXHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZGVsZXRlQWxsKHBhcmVudENoYXRVUkkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXBsZXRlcyB0aGUgYWN0aXZlIHR1cm4gZm9yIHRoZSBzdWJhZ2VudCBhc3NvY2lhdGVkIHdpdGggYSBwYXJlbnQgdG9vbFxuXHQgKiBjYWxsLiBUaGUgY2hhdCByZW1haW5zIHJlZ2lzdGVyZWQgc28gYSBsYXRlciBzdGVlcmVkIHR1cm4gY2FuIHJlc3VtZSBpdC5cblx0ICovXG5cdGNvbXBsZXRlU3ViYWdlbnRTZXNzaW9uKHBhcmVudENoYXRVUkk6IFByb3RvY29sVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBEcm9wIGFueSBldmVudHMgdGhhdCB3ZXJlIGJ1ZmZlcmVkIHdhaXRpbmcgZm9yIGEgYHN1YmFnZW50X3N0YXJ0ZWRgXG5cdFx0Ly8gdGhhdCBuZXZlciBhcnJpdmVkIChlLmcuIHRoZSBwYXJlbnQgdG9vbCBmYWlsZWQgYmVmb3JlIHRoZSBzdWJhZ2VudFxuXHRcdC8vIHdhcyBjcmVhdGVkKS4gV2l0aG91dCB0aGlzLCB0aGUgYnVmZmVyIGVudHJ5IHdvdWxkIGxlYWsgdW50aWwgdGhlXG5cdFx0Ly8gcGFyZW50IHNlc3Npb24gaXMgZGlzcG9zZWQuXG5cdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50U2lnbmFscy5kZWxldGUocGFyZW50Q2hhdFVSSSwgdG9vbENhbGxJZCk7XG5cblx0XHRjb25zdCBzdWJhZ2VudCA9IHRoaXMuX3N1YmFnZW50Q2hhdHMuZ2V0KHBhcmVudENoYXRVUkksIHRvb2xDYWxsSWQpO1xuXHRcdGlmICghc3ViYWdlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0dXJuSWQgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHN1YmFnZW50LmNoYXRVcmkpO1xuXHRcdGlmICh0dXJuSWQpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzdWJhZ2VudC5jaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRkdXJhdGlvbjogdGhpcy5fdHVybkR1cmF0aW9uKHN1YmFnZW50LnR1cm5TdG9wV2F0Y2gpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYWxsIHN1YmFnZW50IGNoYXRzIGZvciBhIGdpdmVuIHBhcmVudCBzZXNzaW9uIGZyb20gdGhlIHN0YXRlIG1hbmFnZXIuXG5cdCAqL1xuXHRyZW1vdmVTdWJhZ2VudFNlc3Npb25zKHBhcmVudFNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjaGF0VXJpIG9mIHRoaXMuX2NhbmNlbGxlZFR1cm5JZHMua2V5cygpKSB7XG5cdFx0XHRpZiAocGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0VXJpKSA9PT0gcGFyZW50U2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxsZWRUdXJuSWRzLmRlbGV0ZShjaGF0VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcGFyZW50Q2hhdFVSSXMgPSBuZXcgU2V0PFByb3RvY29sVVJJPigpO1xuXHRcdGZvciAoY29uc3Qgc3ViYWdlbnQgb2YgdGhpcy5fc3ViYWdlbnRDaGF0cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHN1YmFnZW50LnNlc3Npb25VcmkgPT09IHBhcmVudFNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlbW92ZUNoYXQoc3ViYWdlbnQuc2Vzc2lvblVyaSwgc3ViYWdlbnQuY2hhdFVyaSk7XG5cdFx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc3ViYWdlbnQuY2hhdFVyaSk7XG5cdFx0XHRcdHBhcmVudENoYXRVUklzLmFkZChzdWJhZ2VudC5wYXJlbnRDaGF0VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwYXJlbnRDaGF0VVJJIG9mIHBhcmVudENoYXRVUklzKSB7XG5cdFx0XHR0aGlzLl9zdWJhZ2VudENoYXRzLmRlbGV0ZUFsbChwYXJlbnRDaGF0VVJJKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZGVsZXRlQWxsKHBhcmVudENoYXRVUkkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kcyB0aGUgc3ViYWdlbnQgc2Vzc2lvbiB0aGF0IG93bnMgYSBnaXZlbiB0b29sIGNhbGwgYnkgY2hlY2tpbmdcblx0ICogd2hldGhlciB0aGUgdG9vbCBjYWxsIHdhcyBwcmV2aW91c2x5IHJlZ2lzdGVyZWQgdW5kZXIgYSBzdWJhZ2VudFxuXHQgKiBzZXNzaW9uIGtleSBpbiBgX3Rvb2xDYWxsQWdlbnRzYC4gU2NvcGVkIHRvIHN1YmFnZW50IHNlc3Npb25zIG93bmVkXG5cdCAqIGJ5IHRoZSBnaXZlbiBwYXJlbnQgdG8gYXZvaWQgY3Jvc3Mtc2Vzc2lvbiBjb2xsaXNpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmluZFN1YmFnZW50Q2hhdEZvclRvb2xDYWxsKHBhcmVudENoYXRVUkk6IFByb3RvY29sVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBzdWJhZ2VudCBvZiB0aGlzLl9zdWJhZ2VudENoYXRzLmdldEFsbChwYXJlbnRDaGF0VVJJKSkge1xuXHRcdFx0aWYgKHRoaXMuX3Rvb2xDYWxsQWdlbnRzLmhhcyhgJHtzdWJhZ2VudC5jaGF0VXJpfToke3Rvb2xDYWxsSWR9YCkpIHtcblx0XHRcdFx0cmV0dXJuIHN1YmFnZW50LmNoYXRVcmk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF90b29sQ2FsbENvbXBsZXRpb25DaGF0KGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSk6IFByb3RvY29sVVJJIHtcblx0XHRpZiAoIWlzU3ViYWdlbnRDaGF0VXJpKGNoYXRDaGFubmVsKSkge1xuXHRcdFx0cmV0dXJuIGNoYXRDaGFubmVsO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc3ViYWdlbnQgb2YgdGhpcy5fc3ViYWdlbnRDaGF0cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHN1YmFnZW50LmNoYXRVcmkgPT09IGNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl90b29sQ2FsbENvbXBsZXRpb25DaGF0KHN1YmFnZW50LnBhcmVudENoYXRVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2lkZUVmZmVjdHNdIE1pc3NpbmcgcGFyZW50IGNoYXQgZm9yIHN1YmFnZW50IHRvb2wgY29tcGxldGlvbjogY2hhdD0ke2NoYXRDaGFubmVsfWApO1xuXHRcdHJldHVybiBjaGF0Q2hhbm5lbDtcblx0fVxuXG5cdHByaXZhdGUgX25vdGlmeUNsaWVudFRvb2xDYWxsQ29tcGxldGUoc2Vzc2lvbkNoYW5uZWw6IFByb3RvY29sVVJJLCBjaGF0Q2hhbm5lbDogUHJvdG9jb2xVUkksIHRvb2xDYWxsSWQ6IHN0cmluZywgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCwgc291cmNlOiAnY2xpZW50LWRpc3BhdGNoJyB8ICdzZXJ2ZXItZW52ZWxvcGUnKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcGxldGlvbkNoYXQgPSB0aGlzLl90b29sQ2FsbENvbXBsZXRpb25DaGF0KGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX29wdGlvbnMuZ2V0QWdlbnQoc2Vzc2lvbkNoYW5uZWwpO1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2lkZUVmZmVjdHNdIE5vIGFnZW50IGZvciBjbGllbnQgdG9vbCBjb21wbGV0aW9uOiBzb3VyY2U9JHtzb3VyY2V9LCBzZXNzaW9uPSR7c2Vzc2lvbkNoYW5uZWx9LCBjaGF0PSR7Y2hhdENoYW5uZWx9LCBjb21wbGV0aW9uQ2hhdD0ke2NvbXBsZXRpb25DaGF0fSwgdG9vbENhbGxJZD0ke3Rvb2xDYWxsSWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50U2lkZUVmZmVjdHNdIEZvcndhcmRpbmcgY2xpZW50IHRvb2wgY29tcGxldGlvbjogc291cmNlPSR7c291cmNlfSwgc2Vzc2lvbj0ke3Nlc3Npb25DaGFubmVsfSwgY2hhdD0ke2NoYXRDaGFubmVsfSwgY29tcGxldGlvbkNoYXQ9JHtjb21wbGV0aW9uQ2hhdH0sIHRvb2xDYWxsSWQ9JHt0b29sQ2FsbElkfSwgc3VjY2Vzcz0ke3Jlc3VsdC5zdWNjZXNzfWApO1xuXHRcdGFnZW50Lm9uQ2xpZW50VG9vbENhbGxDb21wbGV0ZShVUkkucGFyc2Uoc2Vzc2lvbkNoYW5uZWwpLCBVUkkucGFyc2UoY29tcGxldGlvbkNoYXQpLCB0b29sQ2FsbElkLCByZXN1bHQpO1xuXHR9XG5cblx0Ly8gLS0tLSBTaWRlLWVmZmVjdCBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGEgYHBlbmRpbmdfY29uZmlybWF0aW9uYCBzaWduYWwgZW5kLXRvLWVuZDogY2hlY2tzIGZvclxuXHQgKiBhdXRvLWFwcHJvdmFsIHZpYSB0aGUgcGVybWlzc2lvbiBtYW5hZ2VyLCBhbmQgaWYgbm90IGF1dG8tYXBwcm92ZWQsXG5cdCAqIGRpc3BhdGNoZXMgdGhlIGBDaGF0VG9vbENhbGxSZWFkeWAgYWN0aW9uIHdpdGggY29uZmlybWF0aW9uIG9wdGlvbnNcblx0ICogZm9yIHRoZSBjbGllbnQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVUb29sUmVhZHkoZTogSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwsIHNlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZywgYWdlbnQ6IElBZ2VudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsRXZlbnQgPSB7XG5cdFx0XHR0b29sQ2FsbElkOiBlLnN0YXRlLnRvb2xDYWxsSWQsXG5cdFx0XHRzZXNzaW9uOiBlLmNoYXQsXG5cdFx0XHRwZXJtaXNzaW9uS2luZDogZS5wZXJtaXNzaW9uS2luZCxcblx0XHRcdHBlcm1pc3Npb25QYXRoOiBlLnBlcm1pc3Npb25QYXRoLFxuXHRcdFx0dG9vbElucHV0OiBlLnN0YXRlLnRvb2xJbnB1dCxcblx0XHRcdHJlcXVlc3RTYW5kYm94QnlwYXNzOiBlLnJlcXVlc3RTYW5kYm94QnlwYXNzLFxuXHRcdFx0c2hlbGxMYW5ndWFnZTogZS5zaGVsbExhbmd1YWdlLFxuXHRcdH07XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmFsID0gZS5tYW5hZ2VkQXBwcm92YWxSZXF1aXJlZFxuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogYXdhaXQgdGhpcy5fcGVybWlzc2lvbk1hbmFnZXIuZ2V0QXV0b0FwcHJvdmFsKGFwcHJvdmFsRXZlbnQsIHNlc3Npb25LZXkpO1xuXHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSBlLnN0YXRlLnRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IHRvb2xDYWxsID0gcGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRvb2xDYWxsXG5cdFx0XHQmJiB0b29sQ2FsbC5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZ1xuXHRcdFx0JiYgdG9vbENhbGwuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nXG5cdFx0XHQmJiB0b29sQ2FsbC5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pIHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsS2V5ID0gYCR7c2Vzc2lvbktleX06JHtlLnN0YXRlLnRvb2xDYWxsSWR9YDtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsQWdlbnRzLmRlbGV0ZSh0b29sQ2FsbEtleSk7XG5cdFx0XHR0aGlzLl9tYW5hZ2VkQXBwcm92YWxUb29sQ2FsbHMuZGVsZXRlKHRvb2xDYWxsS2V5KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNpZGVFZmZlY3RzXSBEcm9wcGluZyBzdGFsZSB0b29sIHJlYWR5IGZvciAke2Uuc3RhdGUudG9vbENhbGxJZH06IHN0YXR1cz0ke3Rvb2xDYWxsLnN0YXR1c31gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udHJpYnV0b3IgPSBlLnN0YXRlLmNvbnRyaWJ1dG9yID8/IHRvb2xDYWxsPy5jb250cmlidXRvcjtcblx0XHRsZXQgZWZmZWN0aXZlID0gZTtcblx0XHRjb25zdCB0b29sQ2FsbEtleSA9IGAke3Nlc3Npb25LZXl9OiR7ZS5zdGF0ZS50b29sQ2FsbElkfWA7XG5cdFx0aWYgKGUubWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQpIHtcblx0XHRcdHRoaXMuX21hbmFnZWRBcHByb3ZhbFRvb2xDYWxscy5hZGQodG9vbENhbGxLZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9tYW5hZ2VkQXBwcm92YWxUb29sQ2FsbHMuZGVsZXRlKHRvb2xDYWxsS2V5KTtcblx0XHR9XG5cdFx0Y29uc3QgY2xpZW50U2hvdWxkQXV0b0FwcHJvdmUgPSBhdXRvQXBwcm92YWwgIT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgY29udHJpYnV0b3I/LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudFxuXHRcdFx0JiYgISFlLnN0YXRlLmNvbmZpcm1hdGlvblRpdGxlO1xuXHRcdGlmIChjbGllbnRTaG91bGRBdXRvQXBwcm92ZSkge1xuXHRcdFx0dGhpcy5fdG9vbENhbGxBZ2VudHMuc2V0KHRvb2xDYWxsS2V5LCBhZ2VudC5pZCk7XG5cdFx0XHRlZmZlY3RpdmUgPSB7IC4uLmUsIHN0YXRlOiB7IC4uLmUuc3RhdGUsIF9tZXRhOiB7IC4uLnRvb2xDYWxsPy5fbWV0YSwgLi4uZS5zdGF0ZS5fbWV0YSwgLi4udG9Ub29sQ2FsbE1ldGEoeyBhdXRvQXBwcm92ZUJ5U2V0dGluZzogdHJ1ZSB9KSB9IH0gfTtcblx0XHR9IGVsc2UgaWYgKGF1dG9BcHByb3ZhbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl90b29sQ2FsbEFnZW50cy5kZWxldGUodG9vbENhbGxLZXkpO1xuXHRcdFx0YWdlbnQucmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QoZS5zdGF0ZS50b29sQ2FsbElkLCB0cnVlKTtcblx0XHRcdC8vIFN0cmlwIGNvbmZpcm1hdGlvblRpdGxlIHNvIGNyZWF0ZVRvb2xSZWFkeUFjdGlvbiBlbWl0cyB0aGVcblx0XHRcdC8vIGF1dG8tYXBwcm92ZWQgKG5vLW9wdGlvbnMpIGFjdGlvbi5cblx0XHRcdGVmZmVjdGl2ZSA9IHsgLi4uZSwgc3RhdGU6IHsgLi4uZS5zdGF0ZSwgY29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCB9IH07XG5cdFx0fSBlbHNlIGlmIChlZmZlY3RpdmUuc3RhdGUuY29uZmlybWF0aW9uVGl0bGUpIHtcblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgYWdlbnQgaXMgcmVnaXN0ZXJlZCBmb3IgdGhlIGV2ZW50dWFsIGBDaGF0VG9vbENhbGxDb25maXJtZWRgIHJlc3BvbnNlLlxuXHRcdFx0dGhpcy5fdG9vbENhbGxBZ2VudHMuc2V0KHRvb2xDYWxsS2V5LCBhZ2VudC5pZCk7XG5cdFx0fVxuXHRcdGlmIChhdXRvQXBwcm92YWwgPT09IHVuZGVmaW5lZCAmJiAhZS5tYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiB0aGlzLl9wZXJtaXNzaW9uTWFuYWdlci5pc0F1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUoYXBwcm92YWxFdmVudCwgc2Vzc2lvbktleSkpIHtcblx0XHRcdC8vIE1hcmsgY29uZmlybWF0aW9ucyB3aGVyZSBhIHBlcnNpc3RlbnQgYWxsb3cgcnVsZSBjYW4gc3VwcHJlc3MgdGhlIG5leHQgZXF1aXZhbGVudCBwcm9tcHQuXG5cdFx0XHRlZmZlY3RpdmUgPSB7IC4uLmVmZmVjdGl2ZSwgc3RhdGU6IHsgLi4uZWZmZWN0aXZlLnN0YXRlLCBfbWV0YTogeyAuLi50b29sQ2FsbD8uX21ldGEsIC4uLmVmZmVjdGl2ZS5zdGF0ZS5fbWV0YSwgLi4udG9Ub29sQ2FsbE1ldGEoeyBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiB0cnVlIH0pIH0gfSB9O1xuXHRcdH1cblx0XHRjb25zdCByZWFkeUFjdGlvbiA9IHRoaXMuX3Blcm1pc3Npb25NYW5hZ2VyLmNyZWF0ZVRvb2xSZWFkeUFjdGlvbihlZmZlY3RpdmUsIHNlc3Npb25LZXksIHR1cm5JZCk7XG5cdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsTWV0YWRhdGFVcGRhdGVkKHNlc3Npb25LZXksIHJlYWR5QWN0aW9uLnRvb2xDYWxsSWQsIHJlYWR5QWN0aW9uLmNvbnRyaWJ1dG9yKTtcblx0XHRpZiAocmVhZHlBY3Rpb24uY29uZmlybWVkKSB7XG5cdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIudG9vbENhbGxFeGVjdXRpb25TdGFydGVkKHNlc3Npb25LZXksIHJlYWR5QWN0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbktleSwgcmVhZHlBY3Rpb24pO1xuXHR9XG5cblx0aGFuZGxlQWN0aW9uKGNoYW5uZWw6IFByb3RvY29sVVJJLCBhY3Rpb246IFN0YXRlQWN0aW9uLCBjbGllbnRJZD86IHN0cmluZywgY2xpZW50VHlwZSA9IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRDaGFubmVsID0gaXNBaHBDaGF0Q2hhbm5lbChjaGFubmVsKSA/IGNoYW5uZWwgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYW5uZWwgPSBjaGF0Q2hhbm5lbCA/IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdENoYW5uZWwpIDogY2hhbm5lbDtcblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkOiB7XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXRUdXJuU3RhcnRlZCBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHR1cm5TdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblx0XHRcdFx0Ly8gUGVyLXR1cm4gc3RyZWFtaW5nIHBhcnQgdHJhY2tpbmcgaXMgb3duZWQgYnkgdGhlIGFnZW50XG5cdFx0XHRcdC8vIChlLmcuIENvcGlsb3RBZ2VudFNlc3Npb24pIGFuZCByZXNldCBvbiBpdHMgYHNlbmQoKWAgY2FsbC5cblxuXHRcdFx0XHQvLyBHZW5lcmljLCBhZ2VudC1hZ25vc3RpYyBob3N0IGNvbW1hbmRzIChgL3JlbmFtZWAsIGAhY29tbWFuZGAsXG5cdFx0XHRcdC8vIFx1MjAyNikgYXJlIGludGVyY2VwdGVkIGhlcmUgYW5kIGhhbmRsZWQgYnkgdGhlIGxvY2FsLWNvbW1hbmRcblx0XHRcdFx0Ly8gZGlzcGF0Y2hlciByYXRoZXIgdGhhbiBmb3J3YXJkZWQgdG8gdGhlIGFnZW50IFNESy5cblx0XHRcdFx0Y29uc3QgaGFuZGxlZCA9IHRoaXMuX2xvY2FsQ29tbWFuZHMudHJ5SGFuZGxlKHsgdHVybkNoYW5uZWw6IGNoYW5uZWwsIHR1cm5JZDogYWN0aW9uLnR1cm5JZCwgdGV4dDogYWN0aW9uLm1lc3NhZ2UudGV4dCB9KTtcblx0XHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0XHRpZiAoaGFuZGxlZC5zdWdnZXN0ZWRUaXRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIuc2VlZFByb3Zpc2lvbmFsVGl0bGUoc2Vzc2lvbkNoYW5uZWwsIGhhbmRsZWQuc3VnZ2VzdGVkVGl0bGUsIGNoYXRDaGFubmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhbm5lbCk7XG5cdFx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudFNpZGVFZmZlY3RzXSBUdXJuIHN0YXJ0ZWQgZm9yIHNlc3Npb24gbm90IGluIHN0YXRlIG1hbmFnZXI6ICR7Y2hhbm5lbH0sIHR1cm5JZD0ke2FjdGlvbi50dXJuSWR9IC0gc3RhdHVzL3N1bW1hcnkgdXBkYXRlcyBtYXkgYmUgZHJvcHBlZCB1bmxlc3MgdGhlIHNlc3Npb24gaXMgcmVzdG9yZWRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uQ2hhbm5lbCwgYWN0aW9uLm1lc3NhZ2UudGV4dCwgY2hhdENoYW5uZWwpO1xuXHRcdFx0XHR0aGlzLl9vcHRpb25zLm9uVXNlck1lc3NhZ2U/LihzZXNzaW9uQ2hhbm5lbCwgYWN0aW9uLm1lc3NhZ2UudGV4dCk7XG5cblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFubmVsLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdFx0XHRcdHR1cm5JZDogYWN0aW9uLnR1cm5JZCxcblx0XHRcdFx0XHRcdGR1cmF0aW9uOiB0aGlzLl90dXJuRHVyYXRpb24odHVyblN0b3BXYXRjaCksXG5cdFx0XHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdub0FnZW50JywgbWVzc2FnZTogJ05vIGFnZW50IGZvdW5kIGZvciBzZXNzaW9uJyB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhdHRhY2htZW50cyA9IGFjdGlvbi5tZXNzYWdlLmF0dGFjaG1lbnRzO1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci51c2VyTWVzc2FnZVNlbnQoYWdlbnQuaWQsIGNsaWVudFR5cGUsIGNoYW5uZWwsIHN0YXRlLCAnZGlyZWN0JywgYXR0YWNobWVudHMpO1xuXHRcdFx0XHRjb25zdCB7IG1vZGVsLCBtb2RlbFRlbGVtZXRyeUtpbmQsIHBlcm1pc3Npb25MZXZlbCB9ID0gdGhpcy5fZ2V0VHVyblRlbGVtZXRyeUNvbnRleHQoYWdlbnQsIHN0YXRlLCBhY3Rpb24ubWVzc2FnZS5tb2RlbD8uaWQpO1xuXHRcdFx0XHR0aGlzLl90dXJuVHJhY2tlci50dXJuU3RhcnRlZChhZ2VudC5pZCwgY2hhbm5lbCwgYWN0aW9uLnR1cm5JZCwgbW9kZWwsIG1vZGVsVGVsZW1ldHJ5S2luZCwgcGVybWlzc2lvbkxldmVsKTtcblx0XHRcdFx0dm9pZCB0aGlzLl9zZW5kVHVybk1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGFnZW50LFxuXHRcdFx0XHRcdHNlc3Npb25DaGFubmVsLFxuXHRcdFx0XHRcdHR1cm5DaGFubmVsOiBjaGFubmVsLFxuXHRcdFx0XHRcdGNoYXQ6IGNoYW5uZWwsXG5cdFx0XHRcdFx0bWVzc2FnZTogYWN0aW9uLm1lc3NhZ2UsXG5cdFx0XHRcdFx0dHVybklkOiBhY3Rpb24udHVybklkLFxuXHRcdFx0XHRcdHNlbmRlckNsaWVudElkOiBjbGllbnRJZCxcblx0XHRcdFx0XHRjbGllbnRUeXBlLFxuXHRcdFx0XHRcdHR1cm5TdG9wV2F0Y2gsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQ6IHtcblx0XHRcdFx0aWYgKCFjaGF0Q2hhbm5lbCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdFRvb2xDYWxsQ29uZmlybWVkIG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYW5uZWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdG9vbENhbGxLZXkgPSBgJHtjaGFubmVsfToke2FjdGlvbi50b29sQ2FsbElkfWA7XG5cdFx0XHRcdGlmIChhY3Rpb24uYXBwcm92ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIudG9vbENhbGxFeGVjdXRpb25TdGFydGVkKGNoYW5uZWwsIGFjdGlvbi50b29sQ2FsbElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCA9IHRoaXMuX21hbmFnZWRBcHByb3ZhbFRvb2xDYWxscy5kZWxldGUodG9vbENhbGxLZXkpO1xuXHRcdFx0XHRjb25zdCBhZ2VudElkID0gdGhpcy5fdG9vbENhbGxBZ2VudHMuZ2V0KHRvb2xDYWxsS2V5KTtcblx0XHRcdFx0aWYgKGFnZW50SWQpIHtcblx0XHRcdFx0XHR0aGlzLl90b29sQ2FsbEFnZW50cy5kZWxldGUodG9vbENhbGxLZXkpO1xuXHRcdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5hZ2VudHMuZ2V0KCkuZmluZChhID0+IGEuaWQgPT09IGFnZW50SWQpO1xuXHRcdFx0XHRcdGFnZW50Py5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChhY3Rpb24udG9vbENhbGxJZCwgYWN0aW9uLmFwcHJvdmVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBObyBhZ2VudCBmb3IgdG9vbCBjYWxsIGNvbmZpcm1hdGlvbjogJHthY3Rpb24udG9vbENhbGxJZH1gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdoZW4gdGhlIHVzZXIgY2hvc2UgXCJBbGxvdyBpbiB0aGlzIFNlc3Npb25cIiwgYWRkIHRoZSB0b29sXG5cdFx0XHRcdC8vIHRvIHRoZSBzZXNzaW9uJ3MgcGVybWlzc2lvbnMgc28gZnV0dXJlIGNhbGxzIGFyZSBhdXRvLWFwcHJvdmVkLlxuXHRcdFx0XHRpZiAoYWN0aW9uLmFwcHJvdmVkICYmICFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Blcm1pc3Npb25NYW5hZ2VyLmhhbmRsZVRvb2xDYWxsQ29uZmlybWVkKGNoYW5uZWwsIGFjdGlvbi50b29sQ2FsbElkLCBhY3Rpb24uc2VsZWN0ZWRPcHRpb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkOiB7XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXRJbnB1dENvbXBsZXRlZCBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0XHRcdGFnZW50Py5yZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0KGFjdGlvbi5yZXF1ZXN0SWQsIGFjdGlvbi5yZXNwb25zZSwgYWN0aW9uLmFuc3dlcnMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZDoge1xuXHRcdFx0XHRpZiAoIWNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0VHVybkNhbmNlbGxlZCBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3R1cm5UcmFja2VyLnR1cm5Db21wbGV0ZWQoY2hhbm5lbCwgYWN0aW9uLnR1cm5JZCwgJ2NhbmNlbGxlZCcpO1xuXHRcdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIuY2xlYXJTZXNzaW9uKGNoYW5uZWwpO1xuXHRcdFx0XHQvLyBDYW5jZWwgYWxsIHN1YmFnZW50IHNlc3Npb25zIGZvciB0aGlzIHBhcmVudFxuXHRcdFx0XHR0aGlzLmNhbmNlbFN1YmFnZW50U2Vzc2lvbnMoY2hhbm5lbCk7XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0XHRcdGlmIChhZ2VudCkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoY2hhbm5lbCk7XG5cdFx0XHRcdFx0YWdlbnQuY2hhdHMuYWJvcnQoY2hhdCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudFNpZGVFZmZlY3RzXSBhYm9ydCBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEludGVudGlvbmFsbHkgZG8gTk9UIGRyYWluIHF1ZXVlZCBtZXNzYWdlcyBoZXJlOiBjYW5jZWxsaW5nIG1lYW5zXG5cdFx0XHRcdC8vIFwic3RvcFwiLCBzbyBtZXNzYWdlcyBxdWV1ZWQgYmVoaW5kIHRoZSB0dXJuIHN0YXkgcXVldWVkIGZvciB0aGVcblx0XHRcdFx0Ly8gdXNlciB0byBkZXF1ZXVlL3J1biBtYW51YWxseS4gKEEgbWVzc2FnZSB0aGUgdXNlciBzZW5kcyAqYWZ0ZXIqXG5cdFx0XHRcdC8vIHRoZSBhYm9ydCBpcyBzdGlsbCBjb25zdW1lZCB2aWEgdGhlIENoYXRQZW5kaW5nTWVzc2FnZVNldCBwYXRoXG5cdFx0XHRcdC8vIG9uY2UgY2FuY2VsbGF0aW9uIGhhcyBjbGVhcmVkIHRoZSBhY3RpdmUgdHVybi4pXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQ6IHtcblx0XHRcdFx0aWYgKGNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIHJlbmFtZSB0YXJnZXRlZCBhIHNwZWNpZmljIGNoYXQgKGRlZmF1bHQgb3IgYWRkaXRpb25hbCksXG5cdFx0XHRcdFx0Ly8gbm90IHRoZSB3aG9sZSBzZXNzaW9uLiBSb3V0ZSBpdCB0byBhIHBlci1jaGF0IHRpdGxlIHVwZGF0ZSBzb1xuXHRcdFx0XHRcdC8vIHRoZSBzZXNzaW9uIHRpdGxlIHN0YXlzIGluZGVwZW5kZW50LlxuXHRcdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci51cGRhdGVDaGF0VGl0bGUoc2Vzc2lvbkNoYW5uZWwsIGNoYXRDaGFubmVsLCBhY3Rpb24udGl0bGUpO1xuXHRcdFx0XHRcdHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhzZXNzaW9uQ2hhbm5lbCwgYGN1c3RvbUNoYXRUaXRsZToke2NoYXRDaGFubmVsfWAsIGFjdGlvbi50aXRsZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcGVyc2lzdFNlc3Npb25GbGFnKGNoYW5uZWwsICdjdXN0b21UaXRsZScsIGFjdGlvbi50aXRsZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldDoge1xuXHRcdFx0XHRpZiAoIWNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke2FjdGlvbi50eXBlfSBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHF1ZXVlZE1lc3NhZ2VFeGlzdHMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYW5uZWwpPy5xdWV1ZWRNZXNzYWdlcz8uc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuaWQgPT09IGFjdGlvbi5pZCkgPT09IHRydWU7XG5cdFx0XHRcdGlmIChhY3Rpb24ua2luZCA9PT0gUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCAmJiBxdWV1ZWRNZXNzYWdlRXhpc3RzKSB7XG5cdFx0XHRcdFx0dGhpcy5fcXVldWVkTWVzc2FnZVNlbmRlcnMuc2V0KHsgY2xpZW50SWQsIGNsaWVudFR5cGUgfSwgY2hhbm5lbCwgYWN0aW9uLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zeW5jUGVuZGluZ01lc3NhZ2VzKGNoYW5uZWwpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkOiB7XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7YWN0aW9uLnR5cGV9IG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYW5uZWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFjdGlvbi5raW5kID09PSBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcXVldWVkTWVzc2FnZVNlbmRlcnMuZGVsZXRlKGNoYW5uZWwsIGFjdGlvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3luY1BlbmRpbmdNZXNzYWdlcyhjaGFubmVsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFF1ZXVlZE1lc3NhZ2VzUmVvcmRlcmVkOiB7XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7YWN0aW9uLnR5cGV9IG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYW5uZWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3luY1BlbmRpbmdNZXNzYWdlcyhjaGFubmVsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZDoge1xuXHRcdFx0XHRpZiAoIWNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0VHJ1bmNhdGVkIG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYW5uZWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0Ly8gV2hlbiB0aGUgdHJ1bmNhdGlvbiBib3VuZGFyeSBpcyBhIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVyblxuXHRcdFx0XHQvLyAoYC9yZW5hbWVgIC8gYCFjb21tYW5kYCksIHJlZGlyZWN0IHRoZSBTREsgdHJ1bmNhdGlvbiB0byB0aGVcblx0XHRcdFx0Ly8gcHJlY2VkaW5nIGNvbmNyZXRlIHR1cm4gc28gdGhlIGFnZW50IGtlZXBzIGV2ZXJ5dGhpbmcgdXAgdG9cblx0XHRcdFx0Ly8gdGhlIHJlYWwgbWVzc2FnZSBiZWZvcmUgaXQuXG5cdFx0XHRcdGNvbnN0IHNka1R1cm5JZCA9IGFjdGlvbi50dXJuSWQgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gdGhpcy5fb3B0aW9ucy5sb2NhbFR1cm5zLnJlc29sdmVDb25jcmV0ZVR1cm5JZChjaGF0Q2hhbm5lbCwgYWN0aW9uLnR1cm5JZClcblx0XHRcdFx0XHQ6IGFjdGlvbi50dXJuSWQ7XG5cdFx0XHRcdC8vIFJvdXRlIHRvIHRoZSBjaGF0IGJlaW5nIHRydW5jYXRlZDogdGhlIGRlZmF1bHQgY2hhdCAoYWRkcmVzc2VkXG5cdFx0XHRcdC8vIGJ5IHRoZSBzZXNzaW9uKSBvciBhIHBlZXIgY2hhdCB3aXRoIGl0cyBvd24gYmFja2luZy5cblx0XHRcdFx0YWdlbnQ/LnRydW5jYXRlU2Vzc2lvbj8uKFVSSS5wYXJzZShzZXNzaW9uQ2hhbm5lbCksIHNka1R1cm5JZCwgVVJJLnBhcnNlKGNoYXRDaGFubmVsKSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRTaWRlRWZmZWN0c10gdHJ1bmNhdGVTZXNzaW9uIGZhaWxlZCcsIGVycik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHQvLyBEcm9wIHBlcnNpc3RlZCBsb2NhbCB0dXJucyB0aGF0IG5vIGxvbmdlciBzdXJ2aXZlIGluIHRoZVxuXHRcdFx0XHQvLyAoYWxyZWFkeS10cnVuY2F0ZWQpIGNoYXQgc3RhdGUuXG5cdFx0XHRcdGNvbnN0IHN1cnZpdmluZ0lkcyA9IG5ldyBTZXQoKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoY2hhdENoYW5uZWwpPy50dXJucyA/PyBbXSkubWFwKHQgPT4gdC5pZCkpO1xuXHRcdFx0XHRjb25zdCByZW1vdmVkID0gdGhpcy5fb3B0aW9ucy5sb2NhbFR1cm5zLmdldExvY2FsVHVybklkcyhjaGF0Q2hhbm5lbCkuZmlsdGVyKGlkID0+ICFzdXJ2aXZpbmdJZHMuaGFzKGlkKSk7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMubG9jYWxUdXJucy5kZWxldGVMb2NhbHMoc2Vzc2lvbkNoYW5uZWwsIHJlbW92ZWQpO1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VzZXRzLm9uU2Vzc2lvblRydW5jYXRlZChzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQ6IHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KGNoYW5uZWwpO1xuXHRcdFx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gYWN0aW9uLmFjdGl2ZUNsaWVudDtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gYWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoVVJJLnBhcnNlKGNoYW5uZWwpLCB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6IGFjdGl2ZUNsaWVudC5jbGllbnRJZCxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogYWN0aXZlQ2xpZW50LmRpc3BsYXlOYW1lLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aGFuZGxlLnRvb2xzID0gYWN0aXZlQ2xpZW50LnRvb2xzO1xuXHRcdFx0XHRoYW5kbGUuY3VzdG9taXphdGlvbnMgPSBhY3RpdmVDbGllbnQuY3VzdG9taXphdGlvbnMgPz8gW107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRSZW1vdmVkOiB7XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChjaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/LnJlbW92ZUFjdGl2ZUNsaWVudChVUkkucGFyc2UoY2hhbm5lbCksIGFjdGlvbi5jbGllbnRJZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkOiB7XG5cdFx0XHRcdHVwZGF0ZUFnZW50SG9zdFRlbGVtZXRyeUxldmVsRnJvbUNvbmZpZyh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCBhY3Rpb24uY29uZmlnKTtcblx0XHRcdFx0Ly8gSG9zdCBjdXN0b21pemF0aW9ucyBhcmUgc2VsZi1tYW5hZ2VkIGJ5IGVhY2ggYWdlbnQnc1xuXHRcdFx0XHQvLyBQbHVnaW5Db250cm9sbGVyIHZpYSBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZFJvb3RDb25maWdDaGFuZ2UuXG5cdFx0XHRcdC8vIFJlcHVibGlzaCBhZ2VudCBpbmZvcyBmb3Igbm9uLWN1c3RvbWl6YXRpb24gc2NoZW1hIGNoYW5nZXNcblx0XHRcdFx0Ly8gKGUuZy4gcGVybWlzc2lvbnMpIGFuZCBzZXNzaW9uIGN1c3RvbWl6YXRpb25zIGFzIGEgY2F0Y2hhbGwuXG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2hBZ2VudEluZm9zKHRoaXMuX29wdGlvbnMuYWdlbnRzLmdldCgpKTtcblx0XHRcdFx0dGhpcy5fcHVibGlzaEFsbFNlc3Npb25DdXN0b21pemF0aW9ucygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhcnRSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/LnN0YXJ0TWNwU2VydmVyPy4oVVJJLnBhcnNlKHNlc3Npb25DaGFubmVsKSwgYWN0aW9uLmlkKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2lkZUVmZmVjdHNdIHN0YXJ0TWNwU2VydmVyIGZhaWxlZCBmb3IgJHtzZXNzaW9uQ2hhbm5lbH1gLCBlcnIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0b3BSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/LnN0b3BNY3BTZXJ2ZXI/LihVUkkucGFyc2Uoc2Vzc2lvbkNoYW5uZWwpLCBhY3Rpb24uaWQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gc3RvcE1jcFNlcnZlciBmYWlsZWQgZm9yICR7c2Vzc2lvbkNoYW5uZWx9YCwgZXJyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZDoge1xuXHRcdFx0XHQvLyBQZXJzaXN0ZW5jZSByaWRlcyB0aGUgZW52ZWxvcGUgb2JzZXJ2ZXIgc2V0IHVwIGluIHRoZSBjb25zdHJ1Y3Rvci5cblx0XHRcdFx0Ly8gSG9zdC1vd25lZCB3b3JrdHJlZSBsaWZlY3ljbGUgKGFnZW50cyBzdGF5IHVuYXdhcmUpOiByZW1vdmUgdGhlXG5cdFx0XHRcdC8vIGNsZWFuLCBicmFuY2gtcHJlc2VydmVkIHdvcmt0cmVlIG9uIGFyY2hpdmUgYW5kIHJlY3JlYXRlIGl0IG9uXG5cdFx0XHRcdC8vIHVuYXJjaGl2ZS4gU2VyaWFsaXplZCBwZXIgc2Vzc2lvbiBpbnNpZGUgdGhlIGNvbnRyb2xsZXIgc28gaXQgY2FuJ3Rcblx0XHRcdFx0Ly8gaW50ZXJsZWF2ZSB3aXRoIGEgZmlyc3Qtc2VuZCB3b3JrdHJlZSByZXNvbHV0aW9uLlxuXHRcdFx0XHRpZiAodGhpcy5fd29ya3RyZWUpIHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKGNoYW5uZWwpO1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChjaGFubmVsKTtcblx0XHRcdFx0XHRjb25zdCB3b3JrdHJlZU9wID0gYWN0aW9uLmlzQXJjaGl2ZWRcblx0XHRcdFx0XHRcdD8gdGhpcy5fd29ya3RyZWUuY2xlYW51cFdvcmt0cmVlT25BcmNoaXZlKHNlc3Npb25VcmksIHNlc3Npb25JZClcblx0XHRcdFx0XHRcdDogdGhpcy5fd29ya3RyZWUucmVjcmVhdGVXb3JrdHJlZU9uVW5hcmNoaXZlKHNlc3Npb25VcmksIHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0d29ya3RyZWVPcC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gd29ya3RyZWUgJHthY3Rpb24uaXNBcmNoaXZlZCA/ICdjbGVhbnVwJyA6ICdyZWNyZWF0ZSd9IGZhaWxlZCBmb3IgJHtjaGFubmVsfWAsIGVycikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChjaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/Lm9uQXJjaGl2ZWRDaGFuZ2VkPy4oVVJJLnBhcnNlKGNoYW5uZWwpLCBhY3Rpb24uaXNBcmNoaXZlZCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBvbkFyY2hpdmVkQ2hhbmdlZCBmYWlsZWQgZm9yICR7Y2hhbm5lbH1gLCBlcnIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQ6IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGFubmVsKTtcblx0XHRcdFx0Y29uc3QgdmFsdWVzID0gc2Vzc2lvblN0YXRlPy5jb25maWc/LnZhbHVlcztcblx0XHRcdFx0aWYgKHRoaXMuX3dvcmt0cmVlICYmIHNlc3Npb25TdGF0ZT8ubGlmZWN5Y2xlID09PSBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKGNoYW5uZWwpO1xuXHRcdFx0XHRcdGNvbnN0IGlzb2xhdGlvbiA9IHZhbHVlcz8uW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTtcblx0XHRcdFx0XHRpZiAoaXNvbGF0aW9uID09PSAnd29ya3RyZWUnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl93b3JrdHJlZS5ub3RlUGVuZGluZyhzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNvbGF0aW9uID09PSAnZm9sZGVyJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fd29ya3RyZWUuY2xlYXJQZW5kaW5nKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFRoaXMgY2FzZSBpcyByZWFjaGVkIG9ubHkgZm9yIGNsaWVudC1kaXNwYXRjaGVkIGNvbmZpZyBjaGFuZ2VzXG5cdFx0XHRcdC8vIChhIHVzZXIgcGlja2VyIGVkaXQpOyBpbnRlcm5hbCBzZXJ2ZXItc2lkZSB3cml0ZXMgdXNlXG5cdFx0XHRcdC8vIGBkaXNwYXRjaFNlcnZlckFjdGlvbmAgYW5kIG5ldmVyIGxhbmQgaGVyZS4gU28gdGhlIHByb3ZpZGVyIGNhblxuXHRcdFx0XHQvLyBmb3J3YXJkIGEgbGl2ZSwgc2Vzc2lvbi1tdXRhYmxlIGNoYW5nZSAoZS5nLiBDbGF1ZGUnc1xuXHRcdFx0XHQvLyBgcGVybWlzc2lvbk1vZGVgKSB0byBpdHMgcnVubmluZyBTREsgd2l0aG91dCByZS1lbnRlcmluZyBpdHMgb3duXG5cdFx0XHRcdC8vIHRvb2wgY2FsbGJhY2tzLlxuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmdldEFnZW50KGNoYW5uZWwpPy5vblNlc3Npb25Db25maWdDaGFuZ2VkPy4oVVJJLnBhcnNlKGNoYW5uZWwpLCB2YWx1ZXMgPz8ge30pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZToge1xuXHRcdFx0XHRpZiAoIWNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdFx0YnJlYWs7IC8vIE5vdCBhIGNoYXQgY2hhbm5lbDsgaWdub3JlLlxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX25vdGlmeUNsaWVudFRvb2xDYWxsQ29tcGxldGUoc2Vzc2lvbkNoYW5uZWwsIGNoYXRDaGFubmVsLCBhY3Rpb24udG9vbENhbGxJZCwgYWN0aW9uLnJlc3VsdCwgJ2NsaWVudC1kaXNwYXRjaCcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogSW5qZWN0cyB0aGUgaG9zdC1vd25lZCB3b3JrdHJlZSBpc29sYXRpb24gY29udHJvbGxlciAoc2VlIHtAbGluayBBZ2VudFNlcnZpY2Uuc2V0V29ya3RyZWVJc29sYXRpb259KS4gKi9cblx0c2V0V29ya3RyZWVJc29sYXRpb24od29ya3RyZWU6IFdvcmt0cmVlSXNvbGF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3RyZWUgPSB3b3JrdHJlZTtcblx0fVxuXG5cdGNhbmNlbFNlc3Npb25UaXRsZUdlbmVyYXRpb24oc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIuY2FuY2VsVGl0bGVHZW5lcmF0aW9uKHNlc3Npb24pO1xuXHR9XG5cblx0Y2xlYXJRdWV1ZWRNZXNzYWdlU2VuZGVycyhjaGF0OiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3F1ZXVlZE1lc3NhZ2VTZW5kZXJzLmRlbGV0ZUFsbChjaGF0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZW5lcmF0ZXMgYSBjb250ZW50LWRlcml2ZWQgdGl0bGUgZm9yIGEgZnJlc2hseSBmb3JrZWQgc2Vzc2lvblxuXHQgKiAoYGNoYXRDaGFubmVsYCB1bmRlZmluZWQpIG9yIHBlZXIgY2hhdCBmcm9tIGl0cyBpbmhlcml0ZWQgY2hhdFxuXHQgKiB0dXJucywgcmVwbGFjaW5nIHRoZSBwbGFjZWhvbGRlciBgRm9ya2VkOiBcdTIwMjZgIHRpdGxlIG9uY2UgcmVhZHkuXG5cdCAqL1xuXHRnZW5lcmF0ZUZvcmtlZFRpdGxlKGNoYW5uZWw6IFByb3RvY29sVVJJLCBjaGF0Q2hhbm5lbDogUHJvdG9jb2xVUkkgfCB1bmRlZmluZWQsIHR1cm5zOiByZWFkb25seSBUdXJuW10sIGZhbGxiYWNrVGl0bGU6IHN0cmluZywgc291cmNlVGl0bGU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIuZ2VuZXJhdGVGb3JrZWRUaXRsZShjaGFubmVsLCBjaGF0Q2hhbm5lbCwgdHVybnMsIGZhbGxiYWNrVGl0bGUsIHNvdXJjZVRpdGxlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0cyBhIHNlc3Npb24gbWV0YWRhdGEga2V5L3ZhbHVlIHBhaXIgdG8gdGhlIHNlc3Npb24gZGF0YWJhc2UuXG5cdCAqIFVzZWQgZm9yIGZpZWxkcyB0aGUgaG9zdCBuZWVkcyB0byByZW1lbWJlciBhY3Jvc3MgcmVzdGFydHMgKGN1c3RvbVxuXHQgKiB0aXRsZSwgaXNSZWFkL2lzQXJjaGl2ZWQgZmxhZ3MsIG1lcmdlZCBjb25maWcgdmFsdWVzKS5cblx0ICovXG5cdHByaXZhdGUgX3BlcnNpc3RTZXNzaW9uRmxhZyhzZXNzaW9uOiBQcm90b2NvbFVSSSwga2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRwZXJzaXN0U2Vzc2lvbk1ldGFkYXRhKHRoaXMuX29wdGlvbnMuc2Vzc2lvbkRhdGFTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCBzZXNzaW9uLCBrZXksIHZhbHVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0cyB0aGUgdXNhZ2UgcmVwb3J0ZWQgZm9yIGEgY2hhdCdzIHR1cm4uXG5cdCAqXG5cdCAqIEFnZW50IGJhY2tlbmRzIGRvIG5vdCBkdXJhYmx5IHJlY29yZCB0b2tlbi9jcmVkaXQgdXNhZ2UgdGhlbXNlbHZlcyAodGhlXG5cdCAqIENvcGlsb3QgU0RLJ3MgYGFzc2lzdGFudC51c2FnZWAgZXZlbnQgaXMgZXhwbGljaXRseSBlcGhlbWVyYWwsIGFuZCB0aGVcblx0ICogQ2xhdWRlIHRyYW5zY3JpcHQgcmVwbGF5IHByb2R1Y2VzIG5vbmUpLCBzbyBhIHJlc3RvcmVkIHNlc3Npb24gd291bGRcblx0ICogb3RoZXJ3aXNlIGNvbWUgYmFjayB3aXRoIG5vIGNvbnRleHQtdXNhZ2UgZ2F1Z2UgYW5kIGEgc2Vzc2lvbiBjb3N0IG9mIDAuXG5cdCAqIFNlZSBgQWdlbnRTZXJ2aWNlLl9hcHBseVBlcnNpc3RlZFR1cm5Vc2FnZWAgZm9yIHdoaWNoIHByb3ZpZGVycyBjYW5cblx0ICogY3VycmVudGx5IG1hdGNoIHRoZXNlIHJvd3MgYmFjayBvbiByZXN0b3JlLlxuXHQgKlxuXHQgKiBXcml0dGVuIG9uIGV2ZXJ5IHJlcG9ydCByYXRoZXIgdGhhbiBidWZmZXJlZCB1bnRpbCB0aGUgdHVybiBlbmRzOiB0aGUgcm93XG5cdCAqIGlzIGtleWVkIGJ5IHR1cm4gaWQgYW5kIHdyaXR0ZW4gd2l0aCBgSU5TRVJUIE9SIFJFUExBQ0VgIHRocm91Z2ggYVxuXHQgKiBzZXF1ZW5jZXIsIHNvIFwibGFzdCByZXBvcnQgd2luc1wiIGlzIGFscmVhZHkgYSBwcm9wZXJ0eSBvZiB0aGUgc3RvcmFnZVxuXHQgKiBsYXllciwgYW5kIHBlcnNpc3RpbmcgZWFnZXJseSBtZWFucyBhIHR1cm4gY3V0IHNob3J0IGJ5IGEgY3Jhc2ggb3Jcblx0ICogZGlzY29ubmVjdCBrZWVwcyB0aGUgdXNhZ2UgaXQgaGFkIGFscmVhZHkgYWNjcnVlZC5cblx0ICpcblx0ICogU3ViYWdlbnQgY2hhdHMgYXJlIHNraXBwZWQ6IHRoZWlyIGNvc3QgaXMgYWxyZWFkeSBmb2xkZWQgaW50byB0aGUgcGFyZW50XG5cdCAqIHR1cm4ncyBhZ2dyZWdhdGUsIHNvIHJlY29yZGluZyBpdCBhZ2FpbiB3b3VsZCBkb3VibGUtY291bnQuXG5cdCAqL1xuXHRwcml2YXRlIF90cmFja1R1cm5Vc2FnZShjaGFubmVsOiBQcm90b2NvbFVSSSwgYWN0aW9uOiBDaGF0QWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRVc2FnZSB8fCBpc1N1YmFnZW50Q2hhdFVyaShjaGFubmVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBVc2FnZSByZXBvcnRlZCB3aXRoIG5vIGFjdGl2ZSB0dXJuIGNhcnJpZXMgYW4gZW1wdHkgdHVybiBpZCAoc2VlXG5cdFx0Ly8gYENvcGlsb3RBZ2VudFNlc3Npb24uX3R1cm5JZGApLiBObyB0dXJuIGNhbiBldmVyIG1hdGNoIGl0LCBhbmQgbm9cblx0XHQvLyBwcnVuZSBwYXRoIGNhbiByZW1vdmUgaXQsIHNvIGl0IHdvdWxkIGJlIGEgcGVybWFuZW50IG9ycGhhbiByb3cuXG5cdFx0aWYgKCFhY3Rpb24udHVybklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEFnZW50cyBrZXkgdGhlaXIgc3RvcmFnZSBieSB0aGUgY2hhdCdzIG93biBVUkksIHdoaWNoIGlzIHdoZXJlIHRoZVxuXHRcdC8vIGB0dXJuc2Agcm93cyB0aGF0IGBnZXRUdXJuVXNhZ2VzYCBqb2lucyBhZ2FpbnN0IGxpdmUuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGNoYXRTdG9yYWdlVXJpKGNoYW5uZWwpO1xuXHRcdGlmICghc3RvcmFnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgcmVmOiBJUmVmZXJlbmNlPElTZXNzaW9uRGF0YWJhc2U+O1xuXHRcdHRyeSB7XG5cdFx0XHRyZWYgPSB0aGlzLl9vcHRpb25zLnNlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc3RvcmFnZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBGYWlsZWQgdG8gb3BlbiBkYXRhYmFzZSB0byBwZXJzaXN0IHR1cm4gdXNhZ2UgZm9yICR7Y2hhbm5lbH1gLCBlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZWYub2JqZWN0LnNldFR1cm5Vc2FnZShhY3Rpb24udHVybklkLCBKU09OLnN0cmluZ2lmeShhY3Rpb24udXNhZ2UpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gRmFpbGVkIHRvIHBlcnNpc3QgdHVybiB1c2FnZSBmb3IgJHtjaGFubmVsfS8ke2FjdGlvbi50dXJuSWR9YCwgZXJyKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHJlZi5kaXNwb3NlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdENoYXREcmFmdChjaGFubmVsOiBQcm90b2NvbFVSSSwgZHJhZnQ6IE1lc3NhZ2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWlzQWhwQ2hhdENoYW5uZWwoY2hhbm5lbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhbm5lbCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uKTtcblx0XHRjb25zdCByZWYgPSB0aGlzLl9vcHRpb25zLnNlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0cmVmLm9iamVjdC5zZXRDaGF0RHJhZnQoVVJJLnBhcnNlKGNoYW5uZWwpLCBkcmFmdCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2lkZUVmZmVjdHNdIEZhaWxlZCB0byBwZXJzaXN0IGNoYXQgZHJhZnQgZm9yICR7Y2hhbm5lbC50b1N0cmluZygpfWAsIGVycik7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1c2hlcyB0aGUgY3VycmVudCBwZW5kaW5nIG1lc3NhZ2Ugc3RhdGUgZnJvbSB0aGUgY2hhdCB0byB0aGUgYWdlbnQuXG5cdCAqIFRoZSBzZXJ2ZXIgY29udHJvbHMgcXVldWVkIG1lc3NhZ2UgY29uc3VtcHRpb247IG9ubHkgc3RlZXJpbmcgbWVzc2FnZXNcblx0ICogYXJlIGZvcndhcmRlZCB0byB0aGUgYWdlbnQgZm9yIG1pZC10dXJuIGluamVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNQZW5kaW5nTWVzc2FnZXMoY2hhdENoYW5uZWw6IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYW5uZWwgPSBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhdENoYW5uZWwpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRhZ2VudD8uc2V0UGVuZGluZ01lc3NhZ2VzPy4oXG5cdFx0XHRVUkkucGFyc2UoY2hhdENoYW5uZWwpLFxuXHRcdFx0c3RhdGUuc3RlZXJpbmdNZXNzYWdlLFxuXHRcdFx0W10sXG5cdFx0KTtcblxuXHRcdC8vIFN0ZWVyaW5nIG1lc3NhZ2UgcmVtb3ZhbCBpcyBub3cgZGlzcGF0Y2hlZCBieSB0aGUgYWdlbnRcblx0XHQvLyB2aWEgdGhlICdzdGVlcmluZ19jb25zdW1lZCcgcHJvZ3Jlc3MgZXZlbnQgb25jZSB0aGUgbWVzc2FnZVxuXHRcdC8vIGhhcyBhY3R1YWxseSBiZWVuIHNlbnQgdG8gdGhlIG1vZGVsLlxuXG5cdFx0Ly8gSWYgdGhlIHNlc3Npb24gaXMgaWRsZSwgdHJ5IHRvIGNvbnN1bWUgdGhlIG5leHQgcXVldWVkIG1lc3NhZ2Vcblx0XHR0aGlzLl90cnlDb25zdW1lTmV4dFF1ZXVlZE1lc3NhZ2UoY2hhdENoYW5uZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnN1bWVzIHRoZSBuZXh0IHF1ZXVlZCBtZXNzYWdlIGJ5IGRpc3BhdGNoaW5nIGEgc2VydmVyLWluaXRpYXRlZFxuXHQgKiBgQ2hhdFR1cm5TdGFydGVkYCBhY3Rpb24gd2l0aCBgcXVldWVkTWVzc2FnZUlkYCBzZXQuIFRoZSByZWR1Y2VyXG5cdCAqIGF0b21pY2FsbHkgY3JlYXRlcyB0aGUgYWN0aXZlIHR1cm4gYW5kIHJlbW92ZXMgdGhlIG1lc3NhZ2UgZnJvbSB0aGVcblx0ICogcXVldWUuIE9ubHkgY29uc3VtZXMgb25lIG1lc3NhZ2UgYXQgYSB0aW1lOyBzdWJzZXF1ZW50IG1lc3NhZ2VzIGFyZVxuXHQgKiBjb25zdW1lZCB3aGVuIHRoZSBuZXh0IGBpZGxlYCBldmVudCBmaXJlcy5cblx0ICovXG5cdHByaXZhdGUgX3RyeUNvbnN1bWVOZXh0UXVldWVkTWVzc2FnZShzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25DaGFubmVsID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShzZXNzaW9uKTtcblx0XHQvLyBCYWlsIGlmIHRoZXJlJ3MgYWxyZWFkeSBhbiBhY3RpdmUgdHVyblxuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblx0XHRpZiAoIXN0YXRlPy5xdWV1ZWRNZXNzYWdlcz8ubGVuZ3RoIHx8IHN0YXRlLnN0ZWVyaW5nTWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1zZyA9IHN0YXRlLnF1ZXVlZE1lc3NhZ2VzWzBdO1xuXHRcdGNvbnN0IHNlbmRlciA9IHRoaXMuX3F1ZXVlZE1lc3NhZ2VTZW5kZXJzLmdldChzZXNzaW9uLCBtc2cuaWQpID8/IHsgY2xpZW50SWQ6IHVuZGVmaW5lZCwgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duIH07XG5cdFx0dGhpcy5fcXVldWVkTWVzc2FnZVNlbmRlcnMuZGVsZXRlKHNlc3Npb24sIG1zZy5pZCk7XG5cdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHQvLyBQZXItdHVybiBzdHJlYW1pbmcgcGFydCB0cmFja2luZyBpcyBvd25lZCBieSB0aGUgYWdlbnQgKHJlc2V0XG5cdFx0Ly8gaW5zaWRlIGl0cyBgc2VuZCgpYCBjYWxsKSwgc28gbm8gaG9zdC1zaWRlIHJlc2V0IGlzIG5lZWRlZC5cblxuXHRcdC8vIERpc3BhdGNoIHNlcnZlci1pbml0aWF0ZWQgdHVybiBzdGFydDsgdGhlIHJlZHVjZXIgcmVtb3ZlcyB0aGUgcXVldWVkIG1lc3NhZ2UgYXRvbWljYWxseVxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bWVzc2FnZTogbXNnLm1lc3NhZ2UsXG5cdFx0XHRxdWV1ZWRNZXNzYWdlSWQ6IG1zZy5pZCxcblx0XHR9KTtcblx0XHRjb25zdCB0dXJuU3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0XHQvLyBHZW5lcmljIGhvc3QgY29tbWFuZHMgKGAvcmVuYW1lYCwgYCFjb21tYW5kYCwgXHUyMDI2KSBhcmUgaW50ZXJjZXB0ZWQgYnlcblx0XHQvLyB0aGUgbG9jYWwtY29tbWFuZCBkaXNwYXRjaGVyIChzZWUgdGhlIENoYXRUdXJuU3RhcnRlZCBoYW5kbGVyKSBhbmRcblx0XHQvLyBtdXN0IG5vdCByZWFjaCB0aGUgYWdlbnQgU0RLIGV2ZW4gd2hlbiBxdWV1ZWQuXG5cdFx0Y29uc3QgaGFuZGxlZCA9IHRoaXMuX2xvY2FsQ29tbWFuZHMudHJ5SGFuZGxlKHsgdHVybkNoYW5uZWw6IHNlc3Npb24sIHR1cm5JZCwgdGV4dDogbXNnLm1lc3NhZ2UudGV4dCB9KTtcblx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0Ly8gQSBsb2NhbCBjb21tYW5kIG1heSBzdWdnZXN0IGEgcHJvdmlzaW9uYWwgdGl0bGUgKGUuZy4gYSBgIWNvbW1hbmRgXG5cdFx0XHQvLyBkZXF1ZXVlZCBiZWZvcmUgYW55IHJlYWwgcmVxdWVzdCBoYXMgdGl0bGVkIHRoZSBzZXNzaW9uKS5cblx0XHRcdGlmIChoYW5kbGVkLnN1Z2dlc3RlZFRpdGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fdGl0bGVDb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb25DaGFubmVsLCBoYW5kbGVkLnN1Z2dlc3RlZFRpdGxlLCBzZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uQ2hhbm5lbCwgbXNnLm1lc3NhZ2UudGV4dCwgc2Vzc2lvbik7XG5cblx0XHQvLyBTZW5kIHRoZSBtZXNzYWdlIHRvIHRoZSBhZ2VudCBiYWNrZW5kLiBXaGVuIGBzZXNzaW9uYCBpcyBhblxuXHRcdC8vIGFkZGl0aW9uYWwgY2hhdCBjaGFubmVsLCB0aGUgU0RLIGNoYXQgaXMgb3duZWQgYnkgdGhlXG5cdFx0Ly8gcGFyZW50IHNlc3Npb246IGxvb2sgdXAgdGhlIHByb3ZpZGVyIGJ5IHRoZSBwYXJlbnQgc2Vzc2lvbiBVUkkgYW5kXG5cdFx0Ly8gcGFzcyB0aGUgY2hhdCBjaGFubmVsIHNvIHRoZSBoYXJuZXNzIHJvdXRlcyB0byB0aGUgcmlnaHQgcGVlciBjaGF0LlxuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX3R1cm5EdXJhdGlvbih0dXJuU3RvcFdhdGNoKSxcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnbm9BZ2VudCcsIG1lc3NhZ2U6ICdObyBhZ2VudCBmb3VuZCBmb3Igc2Vzc2lvbicgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhdHRhY2htZW50cyA9IG1zZy5tZXNzYWdlLmF0dGFjaG1lbnRzO1xuXHRcdGNvbnN0IHF1ZXVlZFN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci51c2VyTWVzc2FnZVNlbnQoYWdlbnQuaWQsIHNlbmRlci5jbGllbnRUeXBlLCBzZXNzaW9uLCBxdWV1ZWRTdGF0ZSwgJ3F1ZXVlZCcsIGF0dGFjaG1lbnRzKTtcblx0XHRjb25zdCB7IG1vZGVsLCBtb2RlbFRlbGVtZXRyeUtpbmQsIHBlcm1pc3Npb25MZXZlbCB9ID0gdGhpcy5fZ2V0VHVyblRlbGVtZXRyeUNvbnRleHQoYWdlbnQsIHF1ZXVlZFN0YXRlLCBtc2cubWVzc2FnZS5tb2RlbD8uaWQpO1xuXHRcdHRoaXMuX3R1cm5UcmFja2VyLnR1cm5TdGFydGVkKGFnZW50LmlkLCBzZXNzaW9uLCB0dXJuSWQsIG1vZGVsLCBtb2RlbFRlbGVtZXRyeUtpbmQsIHBlcm1pc3Npb25MZXZlbCk7XG5cdFx0Ly8gU2VsZWN0aW9uIHRyYXZlbHMgb24gdGhlIHF1ZXVlZCBtZXNzYWdlOyBpdCBpcyBhcHBsaWVkIGJlZm9yZSBzZW5kaW5nLlxuXHRcdHZvaWQgdGhpcy5fc2VuZFR1cm5NZXNzYWdlKHtcblx0XHRcdGFnZW50LFxuXHRcdFx0c2Vzc2lvbkNoYW5uZWwsXG5cdFx0XHR0dXJuQ2hhbm5lbDogc2Vzc2lvbixcblx0XHRcdGNoYXQ6IHNlc3Npb24sXG5cdFx0XHRtZXNzYWdlOiBtc2cubWVzc2FnZSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHNlbmRlckNsaWVudElkOiBzZW5kZXIuY2xpZW50SWQsXG5cdFx0XHRjbGllbnRUeXBlOiBzZW5kZXIuY2xpZW50VHlwZSxcblx0XHRcdHR1cm5TdG9wV2F0Y2gsXG5cdFx0fSk7XG5cdH1cblxuXG5cdHByaXZhdGUgX2dldFR1cm5UZWxlbWV0cnlDb250ZXh0KGFnZW50OiBJQWdlbnQsIHN0YXRlOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQsIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgbW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZDsgbW9kZWxUZWxlbWV0cnlLaW5kOiBBZ2VudEhvc3RNb2RlbFRlbGVtZXRyeUtpbmQgfCB1bmRlZmluZWQ7IHBlcm1pc3Npb25MZXZlbDogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IHBlcm1pc3Npb25WYWx1ZSA9IHN0YXRlPy5jb25maWc/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTtcblx0XHRjb25zdCBwZXJtaXNzaW9uTGV2ZWwgPSB0eXBlb2YgcGVybWlzc2lvblZhbHVlID09PSAnc3RyaW5nJyA/IHBlcm1pc3Npb25WYWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsSWQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGFnZW50Lm1vZGVscy5nZXQoKS5maW5kKG1vZGVsID0+IG1vZGVsLmlkID09PSBtb2RlbElkKTtcblx0XHRsZXQgbW9kZWxUZWxlbWV0cnlLaW5kOiBBZ2VudEhvc3RNb2RlbFRlbGVtZXRyeUtpbmQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1vZGVsSWQgPT09ICdhdXRvJykge1xuXHRcdFx0bW9kZWxUZWxlbWV0cnlLaW5kID0gJ3RydXN0ZWQnO1xuXHRcdH0gZWxzZSBpZiAobW9kZWxJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtb2RlbFRlbGVtZXRyeUtpbmQgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChtb2RlbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtb2RlbFRlbGVtZXRyeUtpbmQgPSAndW5rbm93bic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGVsVGVsZW1ldHJ5S2luZCA9IHJlYWRBZ2VudE1vZGVsQnlva0lkZW50aWZpZXIobW9kZWwpID09PSB1bmRlZmluZWQgPyAndHJ1c3RlZCcgOiAnYnlvayc7XG5cdFx0fVxuXHRcdHJldHVybiB7IG1vZGVsOiBtb2RlbElkLCBtb2RlbFRlbGVtZXRyeUtpbmQsIHBlcm1pc3Npb25MZXZlbCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgYSB0dXJuIG1lc3NhZ2UncyBtb2RlbC9hZ2VudCBzZWxlY3Rpb24gKHNlZVxuXHQgKiB7QGxpbmsgX2FwcGx5TWVzc2FnZVNlbGVjdGlvbn0pIGFuZCBmb3J3YXJkcyBpdCB0byB0aGUgYWdlbnQnc1xuXHQgKiBgc2VuZE1lc3NhZ2VgLiBBIHJlamVjdGVkIHNlbmQgaXMgd2lyZWQgdG8gZmFpbCB0aGUgdHVybjogaXQgbG9ncyxcblx0ICogZGlzcGF0Y2hlcyB7QGxpbmsgQWN0aW9uVHlwZS5DaGF0RXJyb3J9IG9uIHRoZSB0dXJuIGNoYW5uZWwsIGFuZCBtYXJrcyB0aGVcblx0ICogdHVybiBlcnJvcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZFR1cm5NZXNzYWdlKG9wdGlvbnM6IHtcblx0XHRhZ2VudDogSUFnZW50O1xuXHRcdC8qKiBUaGUgYWdlbnQvc2Vzc2lvbiBVUkkgdGhlIGNoYXQgbGl2ZXMgb24gKHRoZSBzZW5kIHRhcmdldCkuICovXG5cdFx0c2Vzc2lvbkNoYW5uZWw6IFByb3RvY29sVVJJO1xuXHRcdC8qKiBUaGUgY2hhbm5lbCB0aGUgdHVybiBydW5zIG9uIFx1MjAxNCB3aGVyZSBgQ2hhdEVycm9yYCAvIHR1cm4gY29tcGxldGlvbiBhcmUgcmVwb3J0ZWQuICovXG5cdFx0dHVybkNoYW5uZWw6IFByb3RvY29sVVJJO1xuXHRcdC8qKiBDaGF0IGNoYW5uZWwgVVJJIHRoZSB0dXJuIHRhcmdldHMuICovXG5cdFx0Y2hhdDogUHJvdG9jb2xVUkk7XG5cdFx0bWVzc2FnZTogTWVzc2FnZTtcblx0XHR0dXJuSWQ6IHN0cmluZztcblx0XHRzZW5kZXJDbGllbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGU7XG5cdFx0dHVyblN0b3BXYXRjaDogU3RvcFdhdGNoO1xuXHR9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBhZ2VudCwgc2Vzc2lvbkNoYW5uZWwsIHR1cm5DaGFubmVsLCBjaGF0LCBtZXNzYWdlLCB0dXJuSWQsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlLCB0dXJuU3RvcFdhdGNoIH0gPSBvcHRpb25zO1xuXG5cdFx0Ly8gUmVhZC1vbmx5IGNoYXRzIHJlamVjdCB1c2VyLWRpc3BhdGNoZWQgdHVybnMuIGBpbnRlcmFjdGl2aXR5YCBpcyB0aGVcblx0XHQvLyBnZW5lcmFsIHNpZ25hbCAoZS5nLiBzdWJhZ2VudCB3b3JrZXIgY2hhdHMgYXJlIGBSZWFkT25seWApLCBhbmQgYW5cblx0XHQvLyBhcmNoaXZlZCBzZXNzaW9uIGRvd25ncmFkZXMgaXRzIGludGVyYWN0aXZlIGNoYXRzIHRvIHJlYWQtb25seSB0b28gXHUyMDE0IHNvXG5cdFx0Ly8gZW5mb3JjZSBvZmYgdGhlIGNoYXQncyBlZmZlY3RpdmUgaW50ZXJhY3Rpdml0eSByYXRoZXIgdGhhbiBzcGVjaWFsLWNhc2luZ1xuXHRcdC8vIGFyY2hpdmVkLiBUaGlzIGlzIHRoZSBlbmZvcmNlbWVudCBiZWhpbmQgdGhlIFVJIGhpZGluZyB0aGUgY29tcG9zZXIsIHNvIGFcblx0XHQvLyBidWdneSBvciByZW1vdGUgY2xpZW50IGNhbm5vdCBydW4gd29yayBpbiBhIHJlYWQtb25seSBvciBhcmNoaXZlZCBzZXNzaW9uXG5cdFx0Ly8gKHdoaWNoIG1heSBubyBsb25nZXIgaGF2ZSBpdHMgaXNvbGF0ZWQgd29ya3RyZWUgb24gZGlzaykuXG5cdFx0Y29uc3QgY2hhdFN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0KTtcblx0XHRjb25zdCBzZXNzaW9uU3RhdHVzID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KG9wdGlvbnMuc2Vzc2lvbkNoYW5uZWwpPy5zdGF0dXMgPz8gMDtcblx0XHRjb25zdCBzZXNzaW9uQXJjaGl2ZWQgPSAoc2Vzc2lvblN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCkgPT09IFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZDtcblx0XHRpZiAoaXNDaGF0UmVhZE9ubHkoY2hhdFN0YXRlPy5pbnRlcmFjdGl2aXR5LCBzZXNzaW9uQXJjaGl2ZWQpKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IHNlc3Npb25BcmNoaXZlZFxuXHRcdFx0XHQ/IHsgZXJyb3JUeXBlOiAnYXJjaGl2ZWQnLCBtZXNzYWdlOiAnVGhpcyBzZXNzaW9uIGlzIGFyY2hpdmVkIGFuZCByZWFkLW9ubHkuIFJlc3RvcmUgdGhlIHNlc3Npb24gdG8gY29udGludWUgdGhlIGNvbnZlcnNhdGlvbi4nIH1cblx0XHRcdFx0OiB7IGVycm9yVHlwZTogJ3JlYWRPbmx5JywgbWVzc2FnZTogJ1RoaXMgY2hhdCBpcyByZWFkLW9ubHkuJyB9O1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gUmVqZWN0aW5nIHR1cm4gb24gcmVhZC1vbmx5IGNoYXQ9JHtjaGF0fSAoYXJjaGl2ZWQ9JHtzZXNzaW9uQXJjaGl2ZWR9KSwgdHVybklkPSR7dHVybklkfWApO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHR1cm5DaGFubmVsLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uOiB0aGlzLl90dXJuRHVyYXRpb24odHVyblN0b3BXYXRjaCksXG5cdFx0XHRcdGVycm9yLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl90dXJuVHJhY2tlci50dXJuQ29tcGxldGVkKHR1cm5DaGFubmVsLCB0dXJuSWQsICdlcnJvcicsIHsgc3RhZ2U6ICd2YWxpZGF0aW9uJywgZXJyb3IgfSk7XG5cdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIuY2xlYXJTZXNzaW9uKHR1cm5DaGFubmVsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGNoYXQpO1xuXG5cdFx0bGV0IGZhaWx1cmVTdGFnZTogQWdlbnRIb3N0VHVybkZhaWx1cmVTdGFnZSA9ICd3b3JraW5nRGlyZWN0b3J5Jztcblx0XHR0cnkge1xuXHRcdFx0Ly8gSG9zdC1vd25lZCB3b3JraW5nLWRpcmVjdG9yeSByZXNvbHV0aW9uOiByZXNvbHZlIHRoZSBzZXNzaW9uJ3Mgd29ya2luZ1xuXHRcdFx0Ly8gZGlyZWN0b3JpZXMgYmVmb3JlIHRoZSBhZ2VudCBtYXRlcmlhbGl6ZXMsIHNvIHRoZSBhZ2VudCBydW5zIGluXG5cdFx0XHQvLyBpbmRleCAwICh0aGUgcHJvY2VzcyByb290KSB3aXRob3V0IGV2ZXIga25vd2luZyBob3cgaXQgd2FzIGRlcml2ZWQuXG5cdFx0XHQvLyBJbmRleCAwIGlzIHRoZSBjcmVhdGVkIHdvcmt0cmVlIGZvciB3b3JrdHJlZSBzZXNzaW9ucyAoY3JlYXRlZCBoZXJlIG9uXG5cdFx0XHQvLyB0aGUgZmlyc3Qgc2VuZCkgb3IgdGhlIHBpY2tlZCBmb2xkZXIgZm9yIGZvbGRlciBzZXNzaW9uczsgdW5kZWZpbmVkIGZvclxuXHRcdFx0Ly8gd29ya3NwYWNlLWxlc3Mgc2Vzc2lvbnMuIEFueSBhZGRpdGlvbmFsIHJvb3RzIGZvbGxvdyBpbmRleCAwLlxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3JpZXMgPSBhd2FpdCB0aGlzLl9vcHRpb25zLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZD8uKHsgc2Vzc2lvbjogb3B0aW9ucy5zZXNzaW9uQ2hhbm5lbCwgY2hhdCwgdHVybklkLCBwcm9tcHQ6IG1lc3NhZ2UudGV4dCB9KTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uVXBkYXRlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0XHRpZiAobWVzc2FnZS5tb2RlbCkge1xuXHRcdFx0XHRmYWlsdXJlU3RhZ2UgPSAnbW9kZWxTZWxlY3Rpb24nO1xuXHRcdFx0XHRzZWxlY3Rpb25VcGRhdGVzLnB1c2goYWdlbnQuY2hhdHMuY2hhbmdlTW9kZWwoY2hhdFVyaSwgbWVzc2FnZS5tb2RlbCkpO1xuXHRcdFx0fVxuXHRcdFx0c2VsZWN0aW9uVXBkYXRlcy5wdXNoKGFnZW50LmNoYXRzLmNoYW5nZUFnZW50KGNoYXRVcmksIG1lc3NhZ2UuYWdlbnQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudFNpZGVFZmZlY3RzXSBjaGFuZ2VBZ2VudCBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChzZWxlY3Rpb25VcGRhdGVzKTtcblxuXHRcdFx0ZmFpbHVyZVN0YWdlID0gJ3NlbmRNZXNzYWdlJztcblx0XHRcdGNvbnN0IHJlc29sdmVkQXR0YWNobWVudHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdEF0dGFjaG1lbnRzKG1lc3NhZ2UuYXR0YWNobWVudHMpO1xuXHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdFVyaSwgbWVzc2FnZS50ZXh0LCByZXNvbHZlZFdvcmtpbmdEaXJlY3RvcmllcywgcmVzb2x2ZWRBdHRhY2htZW50cywgdHVybklkLCBzZW5kZXJDbGllbnRJZCwgY2xpZW50VHlwZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCBmYWlsdXJlID0gYnVpbGRUdXJuRmFpbHVyZShmYWlsdXJlU3RhZ2UsIGVycik7XG5cdFx0XHRjb25zdCBlcnJvciA9IGZhaWx1cmUuZXJyb3I7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRTaWRlRWZmZWN0c10gJHtmYWlsdXJlU3RhZ2V9IGZhaWxlZCBmb3Igc2Vzc2lvbj0ke3R1cm5DaGFubmVsfTogY29kZT0ke2ZhaWx1cmUuZXJyb3JDb2RlfSwgbWVzc2FnZT0ke2Vycm9yLm1lc3NhZ2V9LCB0eXBlPSR7ZmFpbHVyZS5lcnJvck5hbWV9YCwgZXJyKTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih0dXJuQ2hhbm5lbCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRkdXJhdGlvbjogdGhpcy5fdHVybkR1cmF0aW9uKHR1cm5TdG9wV2F0Y2gpLFxuXHRcdFx0XHRlcnJvcixcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIudHVybkNvbXBsZXRlZCh0dXJuQ2hhbm5lbCwgdHVybklkLCAnZXJyb3InLCBmYWlsdXJlKTtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24odHVybkNoYW5uZWwpO1xuXHRcdFx0dGhpcy5fZmFpbFNlc3Npb25DcmVhdGlvbklmU3RpbGxDcmVhdGluZyhzZXNzaW9uQ2hhbm5lbCwgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDaGF0QXR0YWNobWVudHMoYXR0YWNobWVudHM6IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIWF0dGFjaG1lbnRzPy5zb21lKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdCkpIHtcblx0XHRcdHJldHVybiBhdHRhY2htZW50cztcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKGF0dGFjaG1lbnRzLm1hcChhc3luYyBhdHRhY2htZW50ID0+IHtcblx0XHRcdGlmIChhdHRhY2htZW50LnR5cGUgIT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5DaGF0KSB7XG5cdFx0XHRcdHJldHVybiBhdHRhY2htZW50O1xuXHRcdFx0fVxuXHRcdFx0Ly8gQW4gYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluayB0aGF0IGlkZW50aWZpZXMgdGhlIHJlZmVyZW5jZWQgY2hhdC5cblx0XHRcdC8vIFRoZSBkZWZhdWx0IGNoYXQgaXMgYWRkcmVzc2VkIGJ5IGl0cyBzZXNzaW9uIChubyBjaGF0IGlkKTsgcGVlciBjaGF0c1xuXHRcdFx0Ly8gY2FycnkgdGhlaXIgY2hhdCBpZCBzbyB0aGUgbGluayBvcGVucyB0aGF0IHNwZWNpZmljIGNoYXQuIEEgcmVzb3VyY2Vcblx0XHRcdC8vIHRoYXQgY2Fubm90IGJlIG1hcHBlZCB0byBhIGxpbmsgeWllbGRzIGEgcG9pbnRlciB0aGF0IG5hbWVzIHRoZSBjaGF0XG5cdFx0XHQvLyBieSBpdHMgcmF3IHJlc291cmNlIGluc3RlYWQgXHUyMDE0IGEgYmFkIHJlZmVyZW5jZSBtdXN0IG5ldmVyIGZhaWwgdGhlXG5cdFx0XHQvLyB1c2VyJ3MgdHVybi5cblx0XHRcdGNvbnN0IG9wZW5MaW5rID0gYnVpbGRPcGVuU2Vzc2lvbkxpbmtGb3JDaGF0UmVzb3VyY2UoYXR0YWNobWVudC5yZXNvdXJjZSk7XG5cdFx0XHQvLyBBIGNyb3NzLXNlc3Npb24gcmVmZXJlbmNlIG1heSBwb2ludCBhdCBhIGNoYXQgdGhpcyBob3N0IG5ldmVyXG5cdFx0XHQvLyBzdWJzY3JpYmVkIHRvOyByZXN0b3JpbmcgaXQgY2FuIHRocm93IHdoZW4gbm8gcHJvdmlkZXIgb3ducyBpdCBvclxuXHRcdFx0Ly8gdGhlIGJhY2tlbmQgbm8gbG9uZ2VyIGhhcyBpdC4gQSBzdGFsZSByZWZlcmVuY2UgbXVzdCBub3QgZmFpbCB0aGVcblx0XHRcdC8vIHVzZXIncyB3aG9sZSB0dXJuLCBzbyBhbiB1bnJlc29sdmFibGUgc291cmNlIChgdW5kZWZpbmVkYCkgZGVncmFkZXNcblx0XHRcdC8vIHRvIGEgcG9pbnRlciB3aXRob3V0IGFuIGV4Y2VycHQgYW5kIGRyb3BzIHRoZSBgZW5kVHVybmAgcGluIFx1MjAxNCB0aGVcblx0XHRcdC8vIGVtcHR5IHRyYW5zY3JpcHQgd291bGQgb3RoZXJ3aXNlIHRyaXAgZW5kVHVybiB2YWxpZGF0aW9uLlxuXHRcdFx0Y29uc3Qgc291cmNlVHVybnMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdEF0dGFjaG1lbnRTb3VyY2VUdXJucyhhdHRhY2htZW50LnJlc291cmNlKTtcblx0XHRcdGlmIChzb3VyY2VUdXJucyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlQ2hhdEF0dGFjaG1lbnQoeyAuLi5hdHRhY2htZW50LCBlbmRUdXJuOiB1bmRlZmluZWQgfSwgW10sIG9wZW5MaW5rKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNvdXJjZVN0YXRlID0gcmVzb2x2ZUNoYXRTdGF0ZUZvclVyaSh0aGlzLl9zdGF0ZU1hbmFnZXIsIGF0dGFjaG1lbnQucmVzb3VyY2UpO1xuXHRcdFx0aWYgKGF0dGFjaG1lbnQuZW5kVHVybiAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZVN0YXRlPy5hY3RpdmVUdXJuPy5pZCA9PT0gYXR0YWNobWVudC5lbmRUdXJuKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCBhdHRhY2htZW50IGVuZFR1cm4gbXVzdCByZWZlcmVuY2UgYSBjb21wbGV0ZWQgdHVybjogJHthdHRhY2htZW50LnJlc291cmNlfSMke2F0dGFjaG1lbnQuZW5kVHVybn1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNvbHZlQ2hhdEF0dGFjaG1lbnQoYXR0YWNobWVudCwgc291cmNlVHVybnMsIG9wZW5MaW5rKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIHJlZmVyZW5jZWQgY2hhdCdzIHR1cm5zLCByZXR1cm5pbmcgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc291cmNlXG5cdCAqIGlzIHVucmVzb2x2YWJsZSBcdTIwMTQgZS5nLiBhIGNyb3NzLXNlc3Npb24gcmVmZXJlbmNlIHRvIGEgY2hhdCB0aGlzIGhvc3QgbmV2ZXJcblx0ICogc3Vic2NyaWJlZCB0byBhbmQgY2Fubm90IHJlc3RvcmUgKHRoZSByZXNvbHZlciB0aHJvd3Ncblx0ICogYFByb3RvY29sRXJyb3IoQUhQX1NFU1NJT05fTk9UX0ZPVU5EKWAgd2hlbiBubyBwcm92aWRlciBvd25zIGl0IG9yIHRoZVxuXHQgKiBiYWNrZW5kIG5vIGxvbmdlciBoYXMgaXQpLiBTdWNoIGZhaWx1cmVzIGFyZSBsb2dnZWQgcmF0aGVyIHRoYW4gcmV0aHJvd24gc29cblx0ICogYSBzdGFsZSByZWZlcmVuY2UgZGVncmFkZXMgZ3JhY2VmdWxseSBpbnN0ZWFkIG9mIGZhaWxpbmcgdGhlIHVzZXIncyB0dXJuLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUNoYXRBdHRhY2htZW50U291cmNlVHVybnMocmVzb3VyY2U6IFByb3RvY29sVVJJKTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10gfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMucmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnMpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX29wdGlvbnMucmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnMocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVDaGF0U3RhdGVGb3JVcmkodGhpcy5fc3RhdGVNYW5hZ2VyLCByZXNvdXJjZSk/LnR1cm5zID8/IFtdO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gVW5hYmxlIHRvIHJlc29sdmUgY2hhdCBhdHRhY2htZW50IHNvdXJjZSAke3Jlc291cmNlfTsgZGVncmFkaW5nIHRvIGEgcG9pbnRlciB3aXRob3V0IGFuIGV4Y2VycHRgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3VyZmFjZXMgYSBmYWlsZWQgZmlyc3QgdHVybiBvbiBhIG5vdC15ZXQtbWF0ZXJpYWxpemVkIHNlc3Npb24gYXMgYVxuXHQgKiB0ZXJtaW5hbCBjcmVhdGlvbiBmYWlsdXJlLlxuXHQgKlxuXHQgKiBQcm92aXNpb25hbCBzZXNzaW9ucyBkZWZlciBib3RoIHRoZWlyIHJvb3QtY2F0YWxvZyBgU2Vzc2lvbkFkZGVkYFxuXHQgKiBub3RpZmljYXRpb24gYW5kIHRoZWlyIGBDcmVhdGluZyAtPiBSZWFkeWAgbGlmZWN5Y2xlIHRyYW5zaXRpb24gdW50aWwgdGhlXG5cdCAqIGFnZW50IG1hdGVyaWFsaXplcyB0aGVtICh3b3JrdHJlZSBzZXR1cCwgU0RLIHNlc3Npb24gaW5pdCwgXHUyMDI2KSBvbiB0aGVcblx0ICogZmlyc3QgYHNlbmRNZXNzYWdlYC4gV2hlbiB0aGF0IGZpcnN0IHNlbmQgcmVqZWN0cyBcdTIwMTQgZS5nLiB3b3JrdHJlZS9icmFuY2hcblx0ICogY3JlYXRpb24gdGhyb3dzIFx1MjAxNCB0aGUgc2Vzc2lvbiBuZXZlciBlbnRlcmVkIHRoZSBjYXRhbG9nIGFuZCBpdHMgbGlmZWN5Y2xlXG5cdCAqIGlzIHN0dWNrIGF0IGBDcmVhdGluZ2AsIHNvIGNsaWVudHMgdGhhdCBvcHRpbWlzdGljYWxseSByZW5kZXJlZCBpdCBhc1xuXHQgKiBpbi1wcm9ncmVzcyBrZWVwIHNwaW5uaW5nIGZvcmV2ZXIuXG5cdCAqXG5cdCAqIFdoZW4gdGhlIGZhaWxpbmcgc2Vzc2lvbiBpcyBzdGlsbCBgQ3JlYXRpbmdgLCBkaXNwYXRjaFxuXHQgKiB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uQ3JlYXRpb25GYWlsZWR9IHRvIG1vdmUgaXQgdG8gYSB0ZXJtaW5hbFxuXHQgKiBgQ3JlYXRpb25GYWlsZWRgIGxpZmVjeWNsZSwgdGhlbiBhbm5vdW5jZSBpdHMgY2F0YWxvZyBlbnRyeSB2aWFcblx0ICoge0BsaW5rIEFnZW50SG9zdFN0YXRlTWFuYWdlci5tYXJrU2Vzc2lvblBlcnNpc3RlZH0uIFRoZSBzdW1tYXJ5J3Mgc3RhdHVzXG5cdCAqIHdhcyBhbHJlYWR5IGFnZ3JlZ2F0ZWQgdG8gYEVycm9yYCBieSB0aGUgcHJlY2VkaW5nIGBDaGF0RXJyb3JgIGRpc3BhdGNoLFxuXHQgKiBzbyBzdWJzY3JpYmVycyByZW5kZXIgdGhlIHNlc3Npb24gYXMgZmFpbGVkIGltbWVkaWF0ZWx5IHJhdGhlciB0aGFuXG5cdCAqIHdhaXRpbmcgb24gYSBjbGllbnQtc2lkZSB0aW1lb3V0LiBUaGUgcHJvdmlzaW9uYWwgc2Vzc2lvbiBzdXJ2aXZlcyBvbiB0aGVcblx0ICogYWdlbnQsIHNvIHJlc2VuZGluZyByZS1hdHRlbXB0cyBtYXRlcmlhbGl6YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9mYWlsU2Vzc2lvbkNyZWF0aW9uSWZTdGlsbENyZWF0aW5nKHNlc3Npb25DaGFubmVsOiBQcm90b2NvbFVSSSwgZXJyb3I6IEVycm9ySW5mbyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0aWYgKHN0YXRlPy5saWZlY3ljbGUgIT09IFNlc3Npb25MaWZlY3ljbGUuQ3JlYXRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGFubmVsLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DcmVhdGlvbkZhaWxlZCxcblx0XHRcdGVycm9yLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbkNoYW5uZWwpO1xuXHRcdGlmIChzdW1tYXJ5KSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIubWFya1Nlc3Npb25QZXJzaXN0ZWQoc2Vzc2lvbkNoYW5uZWwsIHN1bW1hcnkpO1xuXHRcdH1cblx0fVxuXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl90b29sQ2FsbEFnZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuX21hbmFnZWRBcHByb3ZhbFRvb2xDYWxscy5jbGVhcigpO1xuXHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUge0BsaW5rIEVycm9ySW5mb30gZm9yIGEgZmFpbGVkIGBzZW5kTWVzc2FnZWAgcmVqZWN0aW9uLiBXaGVuIHRoZVxuICogcmVqZWN0aW9uIHRleHQgY2FycmllcyBhIGBWU0NPREVfUFJPWFlfRVJST1JgIG1hcmtlciAoZW1iZWRkZWQgYnkgYSBtb2RlbFxuICogcHJveHkgYW5kIGVjaG9lZCBiYWNrIHRocm91Z2ggdGhlIGFnZW50IFNESyksIHRoZSBkZWNvZGVkIHN0cnVjdHVyZWQgY2hhdFxuICogZXJyb3IgaXMgYXR0YWNoZWQgdG8gYF9tZXRhLmNoYXRFcnJvcmAgc28gY29yZSBjYW4gcmVuZGVyIGEgcmljaCwgbG9jYWxpemVkXG4gKiBtZXNzYWdlLiBPdGhlcndpc2UgdGhlIHJhdyBlcnJvciBtZXNzYWdlIGlzIHVzZWQgYXMtaXMuXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkVHVybkZhaWx1cmUoc3RhZ2U6IEFnZW50SG9zdFR1cm5GYWlsdXJlU3RhZ2UsIGVycjogdW5rbm93bik6IElBZ2VudEhvc3RUdXJuRmFpbHVyZSB7XG5cdGNvbnN0IGVycm9yID0gYnVpbGRUdXJuRmFpbHVyZUVycm9yKHN0YWdlLCBlcnIpO1xuXHRyZXR1cm4ge1xuXHRcdHN0YWdlLFxuXHRcdGVycm9yLFxuXHRcdGVycm9yTmFtZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubmFtZSA6IHR5cGVvZiBlcnIsXG5cdFx0ZXJyb3JDb2RlOiBnZXRFcnJvckNvZGUoZXJyKSxcblx0XHRlcnJvclN0YWNrOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5zdGFjayA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gYnVpbGRUdXJuRmFpbHVyZUVycm9yKHN0YWdlOiBBZ2VudEhvc3RUdXJuRmFpbHVyZVN0YWdlLCBlcnI6IHVua25vd24pOiBFcnJvckluZm8ge1xuXHRjb25zdCBtZXNzYWdlID0gU3RyaW5nKGVycik7XG5cdGNvbnN0IGZvcndhcmRlZCA9IHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBtZXNzYWdlKTtcblx0Y29uc3QgZXJyb3JUeXBlID0gc3RhZ2UgPT09ICdtb2RlbFNlbGVjdGlvbicgPyAnbW9kZWxTZWxlY3Rpb25GYWlsZWQnXG5cdFx0OiBzdGFnZSA9PT0gJ3dvcmtpbmdEaXJlY3RvcnknID8gJ3dvcmtpbmdEaXJlY3RvcnlGYWlsZWQnIDogJ3NlbmRGYWlsZWQnO1xuXHRpZiAoZm9yd2FyZGVkKSB7XG5cdFx0cmV0dXJuIHsgZXJyb3JUeXBlLCBtZXNzYWdlOiBzdHJpcFByb3h5RXJyb3JNYXJrZXIobWVzc2FnZSksIF9tZXRhOiB0b0NoYXRFcnJvck1ldGEoZm9yd2FyZGVkKSB9O1xuXHR9XG5cdHJldHVybiB7IGVycm9yVHlwZSwgbWVzc2FnZSB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFlBQVksdUJBQWdEO0FBQ3JFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFxQztBQUM5QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsb0JBQThFO0FBQ3ZGLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUVqRCxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHlCQUF5QiwrQkFBeUU7QUFDM0csU0FBUyxZQUFZLG9CQUFtRjtBQUN4RztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FXTTtBQUVQLFNBQVMsdUNBQXVDO0FBQ2hELFNBQWdDLDhCQUE4QjtBQUM5RCxTQUFTLGtDQUFnSTtBQUN6SSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDhCQUE4QjtBQUN2QyxPQUFPO0FBQ1AsU0FBUyxnQ0FB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
