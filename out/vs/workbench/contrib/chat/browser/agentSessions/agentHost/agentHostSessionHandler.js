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
import { Delayer, disposableTimeout, raceCancellation } from "../../../../../../base/common/async.js";
import { encodeBase64, VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { getErrorCode, isCancellationError } from "../../../../../../base/common/errors.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { getChatErrorDetailsFromMeta, getCopilotPlanFromEntitlement } from "../../../common/chatErrorMessages.js";
import { Disposable, DisposableResourceMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { equals } from "../../../../../../base/common/objects.js";
import { autorun, autorunPerKeyedItem, constObservable, derived, derivedOpts, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { extUriBiasedIgnorePathCase, isEqual } from "../../../../../../base/common/resources.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { isLocation } from "../../../../../../editor/common/languages.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { localize } from "../../../../../../nls.js";
import { AgentSession, CODEX_AGENT_PROVIDER_ID } from "../../../../../../platform/agentHost/common/agentService.js";
import { agentHostAuthority } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentHostElementAttachmentDisplayKind, toElementAttachmentMeta } from "../../../../../../platform/agentHost/common/meta/agentElementAttachments.js";
import { AgentFeedbackAttachmentDisplayKind, AgentFeedbackAttachmentMetadataKey } from "../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js";
import { BrowserViewAttachmentDisplayKind, BrowserViewAttachmentMetadataKey } from "../../../../../../platform/agentHost/common/meta/browserViewAttachments.js";
import { readToolCallMeta } from "../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js";
import { readCompletionAttachmentMeta } from "../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js";
import { IRemoteAgentHostService } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from "../../../../../../platform/agentHost/common/toolSearchConstants.js";
import { observableFromSubscription } from "../../../../../../platform/agentHost/common/state/agentSubscription.js";
import { CompletionItemKind as AhpCompletionItemKind } from "../../../../../../platform/agentHost/common/state/protocol/commands.js";
import { ConfirmationOptionKind, CustomizationType, McpServerStatus, SessionInputRequestKind, TerminalClaimKind, ToolCallContributorKind, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ActionType, isChatAction } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { AHP_AUTH_REQUIRED, ProtocolError } from "../../../../../../platform/agentHost/common/state/sessionProtocol.js";
import { buildSubagentChatUri, ChatOriginKind, getToolSubagentContent, isChatReadOnly, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, SessionStatus, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, parseChatUri, mergeSessionWithDefaultChat, readUsageInfoMeta } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { packErrorForTelemetry } from "../../../../../../platform/telemetry/common/errorTelemetry.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustRequestService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IAgentHostTerminalService } from "../../../../terminal/browser/agentHostTerminalService.js";
import { ITerminalChatService } from "../../../../terminal/browser/terminal.js";
import {
  AgentHostCompletionReferenceKind,
  getAgentHostCompletionReferenceKind,
  isAgentFeedbackVariableEntry,
  isBrowserViewVariableEntry,
  isChatReferenceVariableEntry,
  isImageVariableEntry
} from "../../../common/attachments/chatVariableEntries.js";
import { coerceImageBuffer } from "../../../common/chatImageExtraction.js";
import { ChatRequestQueueKind, ElicitationState, IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { isTerminalCommandPrompt, SessionType } from "../../../common/chatSessionsService.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IWorkingCopyService } from "../../../../../services/workingCopy/common/workingCopyService.js";
import { ChatMode } from "../../../common/chatModes.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../../common/constants.js";
import { IChatEditingService } from "../../../common/editing/chatEditingService.js";
import { getLanguageModelDisplayNameWithProvider, ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatInputStateOrigin, reviveSerializableInputState } from "../../../common/model/chatModel.js";
import { ChatElicitationRequestPart } from "../../../common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ILanguageModelToolsService, stringifyPromptTsxPart, ToolInvocationPresentation } from "../../../common/tools/languageModelToolsService.js";
import { IChatWidgetService } from "../../chat.js";
import { getAgentSessionProviderIcon } from "../agentSessions.js";
import { IAgentHostActiveClientService } from "./agentHostActiveClientService.js";
import { IAgentHostCustomizationService } from "./agentHostCustomizationService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "./agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostNewSessionFolderService, computeWorkingDirectories } from "./agentHostNewSessionFolderService.js";
import { AgentHostSnapshotController } from "./agentHostSnapshotController.js";
import { AgentHostResponseFileChangesProvider } from "./agentHostResponseFileChanges.js";
import { IChatResponseFileChangesService } from "../../chatResponseFileChangesService.js";
import { AgentHostSessionReferenceAttachmentDisplayKind, AgentHostSessionReferenceTrajectoryAttachmentDisplayKind, toSessionReferenceAttachmentMeta, toSessionReferenceModelRepresentation } from "./agentHostSessionReferenceAttachment.js";
import { buildHostLocalEventsPath } from "../../copilotCliEventsUri.js";
import { toolDataToDefinition } from "./agentHostToolUtils.js";
import { IAgentHostUntitledProvisionalSessionService } from "./agentHostUntitledProvisionalSessionService.js";
import { IAgentHostImportConversationStore } from "./agentHostImportConversationStore.js";
import { activeTurnToProgress, BOOLEAN_TRUE_OPTION_ID, completedToolCallToEditParts, completedToolCallToSerialized, containsAutomaticReplyAnswer, convertProtocolAnswers, convertProtocolPlanReviewResult, createInputRequestCarousel, createInputRequestPlanReview, finalizeToolInvocation, formatTurnResponseDetails, getTerminalContent, getUrlInputRequestPresentation, isSubagentTool, makeAhpTerminalToolSessionId, messageAttachmentsToVariableData, messageToVariableData, parseAhpTerminalToolSessionId, rewriteAgentHostLinkTarget, stringOrMarkdownToString, systemNotificationToChatPart, toolCallAuthenticationServer, toolCallConfirmationMessages, toolCallStateToInvocation, toolCallStateToPreparedInvocation, toolCallStateToStreamingInvocation, turnsToHistory, updateRunningToolSpecificData, updateStreamingToolInvocation, usageInfoToAutoModeResolution, usageInfoToChatUsage, usageInfoToQuotas } from "./stateToProgressAdapter.js";
import { resolveMcpServerAuthentication, agentHostMcpServerId } from "./agentHostAuth.js";
const MAX_INLINED_UNSAVED_EDITOR_BYTES = 1024 * 1024;
const CHAT_ACTIVITY_PROGRESS_ID = "agentHost.chatActivity";
function getMcpAuthenticationRequiredServers(sessionResource, state) {
  const servers = state?.customizations?.flatMap((c) => c.type === CustomizationType.McpServer ? [c] : c.children?.filter((c2) => c2.type === CustomizationType.McpServer) ?? []) ?? [];
  const toolAuthServerIds = new Set(state?.inputNeeded?.filter((request) => request.kind === SessionInputRequestKind.ToolAuthentication).map((request) => request.kind === SessionInputRequestKind.ToolAuthentication ? request.toolCall.contributor.customizationId : void 0).filter((id) => id !== void 0));
  return servers.filter((server) => server.enabled && server.state.kind === McpServerStatus.AuthRequired && !toolAuthServerIds.has(server.id)).map((server) => {
    const state2 = server.state;
    return {
      id: sessionResource.authority + "/" + server.id,
      name: server.name,
      resource: state2.resource.resource,
      oauthClient: state2.oauthClient,
      authorizationServers: state2.resource.authorization_servers,
      supportedScopes: state2.resource.scopes_supported,
      requiredScopes: state2.requiredScopes,
      reason: state2.reason
    };
  });
}
function parseTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : void 0;
}
function getSubagentTiming(state) {
  const turns = state.activeTurn ? [...state.turns, state.activeTurn] : state.turns;
  const starts = turns.map((turn) => turn.startedAt ? Date.parse(turn.startedAt) : void 0).filter((timestamp) => timestamp !== void 0 && Number.isFinite(timestamp));
  const startedAt = starts.length > 0 ? Math.min(...starts) : void 0;
  if (startedAt === void 0 || state.activeTurn) {
    return { startedAt, duration: void 0 };
  }
  const ends = state.turns.flatMap((turn) => {
    const turnStartedAt = turn.startedAt ? Date.parse(turn.startedAt) : void 0;
    return turnStartedAt !== void 0 && Number.isFinite(turnStartedAt) && typeof turn.duration === "number" && Number.isFinite(turn.duration) ? [turnStartedAt + Math.max(0, turn.duration)] : [];
  });
  const endedAt = ends.length > 0 ? Math.max(...ends) : void 0;
  return { startedAt, duration: endedAt !== void 0 ? Math.max(0, endedAt - startedAt) : void 0 };
}
function userOriginMessage(text, attachments) {
  return attachments?.length ? { text, origin: { kind: MessageKind.User }, attachments: [...attachments] } : { text, origin: { kind: MessageKind.User } };
}
function unwrapSessionLoadErrorMessage(err) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : void 0;
  if (!message) {
    return void 0;
  }
  return message.replace(/^Failed to restore session .+?: /, "");
}
function lastTurnModelSelection(state) {
  return lastTurnMessage(state)?.model;
}
function isFirstVisibleProgressPart(part) {
  return part.kind === "markdownContent" || part.kind === "thinking" || part.kind === "toolInvocation";
}
function lastTurnMessage(state) {
  return state?.activeTurn?.message ?? (state && state.turns.length ? state.turns[state.turns.length - 1].message : void 0);
}
function emptyDraftFromLastTurn(state) {
  const message = lastTurnMessage(state);
  if (!message?.model && !message?.agent) {
    return void 0;
  }
  return {
    text: "",
    origin: { kind: MessageKind.User },
    ...message.model ? { model: message.model } : {},
    ...message.agent ? { agent: message.agent } : {}
  };
}
function sameDraftUserContent(a, b) {
  return (a?.text ?? "") === (b?.text ?? "") && equals(a?.attachments, b?.attachments);
}
function confirmedReasonToProtocol(reason) {
  switch (reason?.type) {
    case ToolConfirmKind.ConfirmationNotNeeded:
      return ToolCallConfirmationReason.NotNeeded;
    case ToolConfirmKind.Setting:
    case ToolConfirmKind.LmServicePerTool:
      return ToolCallConfirmationReason.Setting;
    default:
      return ToolCallConfirmationReason.UserAction;
  }
}
function getClientToolPreApproval(toolCall) {
  if (readToolCallMeta(toolCall).autoApproveBySetting === true) {
    return { type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove };
  }
  switch (toolCall.status) {
    case ToolCallStatus.Running:
    case ToolCallStatus.AuthRequired:
      switch (toolCall.confirmed) {
        case ToolCallConfirmationReason.NotNeeded:
          return { type: ToolConfirmKind.ConfirmationNotNeeded };
        case ToolCallConfirmationReason.Setting:
          return { type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove };
        case ToolCallConfirmationReason.UserAction:
          return { type: ToolConfirmKind.UserAction };
      }
  }
  return void 0;
}
function metaWithoutToolSearchCandidates(source) {
  const meta = { ...source._meta };
  delete meta["toolSearchCandidates"];
  return meta;
}
function convertCarouselAnswers(raw, questions = []) {
  const answers = {};
  const questionKinds = new Map(questions.map((question) => [question.id, question.kind]));
  for (const [qId, answer] of Object.entries(raw)) {
    if (typeof answer === "string") {
      answers[qId] = {
        state: ChatInputAnswerState.Submitted,
        value: { kind: ChatInputAnswerValueKind.Text, value: answer }
      };
    } else if (answer && typeof answer === "object") {
      const multi = answer;
      const single = answer;
      if (Array.isArray(multi.selectedValues)) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: {
            kind: ChatInputAnswerValueKind.SelectedMany,
            value: multi.selectedValues,
            freeformValues: multi.freeformValue ? [multi.freeformValue] : void 0
          }
        };
      } else if (single.selectedValue && questionKinds.get(qId) === ChatInputQuestionKind.Boolean) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: {
            kind: ChatInputAnswerValueKind.Boolean,
            value: single.selectedValue === BOOLEAN_TRUE_OPTION_ID
          }
        };
      } else if (single.selectedValue) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: {
            kind: ChatInputAnswerValueKind.Selected,
            value: single.selectedValue,
            freeformValues: single.freeformValue ? [single.freeformValue] : void 0
          }
        };
      } else if (single.freeformValue) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: single.freeformValue }
        };
      }
    }
  }
  return answers;
}
function getPlanReviewAction(planReview, actionId, actionLabel) {
  if (actionId) {
    const action = planReview.actions.find((a) => a.id === actionId);
    if (action) {
      return action;
    }
  }
  if (actionLabel) {
    return planReview.actions.find((a) => a.label === actionLabel);
  }
  return void 0;
}
function submittedTextAnswer(value) {
  return {
    state: ChatInputAnswerState.Submitted,
    value: { kind: ChatInputAnswerValueKind.Text, value }
  };
}
function submittedSelectedAnswer(value, feedback) {
  return {
    state: ChatInputAnswerState.Submitted,
    value: {
      kind: ChatInputAnswerValueKind.Selected,
      value,
      ...feedback ? { freeformValues: [feedback] } : {}
    }
  };
}
function convertPlanReviewResult(planReview, result) {
  const feedback = result.feedback?.trim();
  if (feedback) {
    const action2 = getPlanReviewAction(planReview, result.actionId, result.action);
    return {
      response: ChatInputResponseKind.Accept,
      answers: {
        [planReview.answerQuestionId]: action2 ? submittedSelectedAnswer(action2.id, feedback) : submittedTextAnswer(feedback)
      }
    };
  }
  if (result.rejected) {
    return { response: ChatInputResponseKind.Decline };
  }
  const action = getPlanReviewAction(planReview, result.actionId, result.action);
  if (!action) {
    return { response: ChatInputResponseKind.Decline };
  }
  return {
    response: ChatInputResponseKind.Accept,
    answers: {
      [planReview.answerQuestionId]: submittedSelectedAnswer(action.id)
    }
  };
}
function inputRequestResponsePartKey(part) {
  return `ir:${part.request.id}:${JSON.stringify({ ...part.request, answers: void 0 })}`;
}
let AgentHostChatSession = class extends Disposable {
  constructor(sessionResource, history, title, sessionSubscription, chatSubscription, _promptCacheNotification, _forkSession, _renameSession, inputState, initialProgress, onDispose, interruptActiveResponse, _logService) {
    super();
    this.sessionResource = sessionResource;
    this.history = history;
    this.title = title;
    this._promptCacheNotification = _promptCacheNotification;
    this._forkSession = _forkSession;
    this._renameSession = _renameSession;
    this._logService = _logService;
    this.progressObs = observableValue("agentHostProgress", []);
    this.isCompleteObs = observableValue("agentHostComplete", true);
    this._sessionState = observableValue(this, constObservable(void 0));
    this._chatState = observableValue(this, constObservable(void 0));
    this._promptCacheTracking = this._register(new MutableDisposable());
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidStartServerRequest = this._register(new Emitter());
    this.onDidStartServerRequest = this._onDidStartServerRequest.event;
    this.setStateSubscriptions(sessionSubscription, chatSubscription);
    this.isReadOnly = derived(this, (reader) => {
      const sessionArchived = Boolean((this._sessionState.read(reader).read(reader)?.status ?? 0) & SessionStatus.IsArchived);
      return isChatReadOnly(this._chatState.read(reader).read(reader)?.interactivity, sessionArchived);
    });
    const hasActiveTurn = initialProgress !== void 0;
    this.transferredState = inputState ? { editingSession: void 0, inputState } : void 0;
    if (hasActiveTurn) {
      this.isCompleteObs.set(false, void 0);
      this.progressObs.set(initialProgress, void 0);
    }
    this._register(toDisposable(onDispose));
    this.interruptActiveResponseCallback = async () => interruptActiveResponse();
    this.forkSession = this._forkSession;
    this.renameSession = this._renameSession;
  }
  setStateSubscriptions(sessionSubscription, chatSubscription) {
    this._promptCacheTracking.clear();
    this._promptCacheTracking.value = sessionSubscription ? this._promptCacheNotification?.trackSession(this.sessionResource, sessionSubscription) : void 0;
    transaction((tx) => {
      this._sessionState.set(sessionSubscription ? observableFromSubscription(this, sessionSubscription) : constObservable(void 0), tx);
      this._chatState.set(chatSubscription ? observableFromSubscription(this, chatSubscription) : constObservable(void 0), tx);
    });
  }
  dispose() {
    if (!this._store.isDisposed) {
      this._onWillDispose.fire();
    }
    super.dispose();
  }
  /**
   * Registers a disposable to be cleaned up when this session is disposed.
   */
  registerDisposable(disposable) {
    return this._register(disposable);
  }
  /**
   * Appends new progress items to the observable. Used by the reconnection
   * flow to stream ongoing state changes into the chat UI.
   */
  appendProgress(items) {
    const current = this.progressObs.get();
    this.progressObs.set([...current, ...items], void 0);
  }
  /**
   * Marks the active turn as complete.
   */
  complete() {
    this.isCompleteObs.set(true, void 0);
  }
  /**
   * Called by the session handler when a server-initiated turn starts.
   * Resets the progress observable and signals listeners to create a new
   * request+response pair in the chat model. `turnId` is the provider's turn
   * id and is adopted as the chat request id, so features that address a turn
   * by request id (side chats, forks) can resolve it against the host.
   */
  startServerRequest(turnId, prompt, variableData, options) {
    this._logService.info("[AgentHost] Server-initiated request started");
    transaction((tx) => {
      this.progressObs.set([], tx);
      this.isCompleteObs.set(false, tx);
    });
    this._onDidStartServerRequest.fire({
      id: turnId,
      prompt,
      variableData,
      isSystemInitiated: options?.isSystemInitiated,
      timestamp: options?.timestamp,
      isTerminalRequest: options?.isTerminalRequest
    });
  }
};
AgentHostChatSession = __decorateClass([
  __decorateParam(12, ILogService)
], AgentHostChatSession);
function offsetToPosition(text, offset) {
  let lineNumber = 1;
  let column = 1;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i++) {
    if (text.charCodeAt(i) === 10) {
      lineNumber++;
      column = 1;
    } else {
      column++;
    }
  }
  return { lineNumber, column };
}
let AgentHostSessionHandler = class extends Disposable {
  constructor(config, _chatAgentService, _chatService, _chatEditingService, _logService, _workspaceContextService, _instantiationService, _terminalChatService, _agentHostTerminalService, _workingDirectoryResolver, _newSessionFolderService, _provisionalService, _importConversationStore, _toolsService, _chatWidgetService, _languageModelsService, _openerService, _activeClientService, _chatEntitlementService, _workspaceTrustRequestService, _modelService, _workingCopyService, _configurationService, _chatResponseFileChangesService, _pathService, _remoteAgentHostService, _customizationService, _telemetryService) {
    super();
    this._chatAgentService = _chatAgentService;
    this._chatService = _chatService;
    this._chatEditingService = _chatEditingService;
    this._logService = _logService;
    this._workspaceContextService = _workspaceContextService;
    this._instantiationService = _instantiationService;
    this._terminalChatService = _terminalChatService;
    this._agentHostTerminalService = _agentHostTerminalService;
    this._workingDirectoryResolver = _workingDirectoryResolver;
    this._newSessionFolderService = _newSessionFolderService;
    this._provisionalService = _provisionalService;
    this._importConversationStore = _importConversationStore;
    this._toolsService = _toolsService;
    this._chatWidgetService = _chatWidgetService;
    this._languageModelsService = _languageModelsService;
    this._openerService = _openerService;
    this._activeClientService = _activeClientService;
    this._chatEntitlementService = _chatEntitlementService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._modelService = _modelService;
    this._workingCopyService = _workingCopyService;
    this._configurationService = _configurationService;
    this._chatResponseFileChangesService = _chatResponseFileChangesService;
    this._pathService = _pathService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._customizationService = _customizationService;
    this._telemetryService = _telemetryService;
    this._activeSessions = new ResourceMap();
    this._chatURIsBySessionResource = new ResourceMap();
    /** Per-session subscription to chat model pending request changes. */
    this._pendingMessageSubscriptions = this._register(new DisposableResourceMap());
    /** Per-session debounced sync from chat input state to AHP draft state. */
    this._draftSyncSubscriptions = this._register(new DisposableResourceMap());
    /** Per-session subscription watching for server-initiated turns. */
    this._serverTurnWatchers = this._register(new DisposableResourceMap());
    /** Per-session subscription silently resolving existing MCP authentication grants. */
    this._mcpAuthWatchers = this._register(new DisposableResourceMap());
    /** Historical turns with file edits, pending hydration into the editing session. */
    this._pendingHistoryTurns = new ResourceMap();
    /**
     * Per-session set of MCP server ids that already had an authentication
     * prompt surfaced in the current conversation. A server is removed from the
     * set once it reaches the running state ({@link McpServerStatus.Ready}), so
     * that a later auth requirement for the same server prompts again instead of
     * the prompt repeating on every message.
     */
    this._surfacedMcpAuthServers = new ResourceMap();
    this._pendingMcpAutoAuthentication = /* @__PURE__ */ new Map();
    /** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
    this._clientDispatchedTurnIds = /* @__PURE__ */ new Set();
    this._turnStopWatches = /* @__PURE__ */ new Map();
    /** Active session subscriptions, keyed by backend session URI string. */
    this._sessionSubscriptions = /* @__PURE__ */ new Map();
    /**
     * Active default-chat subscriptions, keyed by backend session URI string.
     * Multi-chat is not yet surfaced: every session is served by a single
     * implicit default chat that carries the conversation contents (turns,
     * active turn, pending/queued messages, input requests). We subscribe to
     * it alongside the session and merge both into the {@link ISessionWithDefaultChat}
     * view returned by {@link _getSessionState}.
     */
    this._defaultChatSubscriptions = /* @__PURE__ */ new Map();
    /**
     * Active subscriptions for additional (non-default) peer chats, keyed by
     * the chat channel URI string. Populated when a chat widget is opened for
     * a resource that carries a chatId fragment.
     */
    this._additionalChatSubscriptions = /* @__PURE__ */ new Map();
    /**
     * Backend session URIs with an in-flight {@link provideChatSessionContent}
     * call, keyed by session URI string with a refcount value. While a chat is
     * still hydrating its subscriptions, a sibling chat of the same session
     * closing must not tear down the shared session subscription out from under
     * it (see {@link _releaseChatSessionSubscriptions} / {@link _hasOtherSessionHold}).
     */
    this._hydratingChatSessions = /* @__PURE__ */ new Map();
    this._config = config;
    this._register(this._customizationService.onDidChangeCustomizations(() => this._reconcileSurfacedMcpAuthServers()));
    this._register(autorun((reader) => {
      const defs = this._activeClientService.getClientTools(this._config.sessionType).read(reader);
      const clientId = this._config.connection.clientId;
      for (const [sessionResource] of this._activeSessions) {
        const backendSession = this._resolveSessionUri(sessionResource);
        const state = this._getSessionState(backendSession.toString());
        const existing = state?.activeClients.find((c) => c.clientId === clientId);
        if (existing) {
          this._dispatchAction(backendSession, {
            type: ActionType.SessionActiveClientSet,
            activeClient: { ...existing, tools: [...defs] }
          });
        }
      }
    }));
    this._register(this._terminalChatService.onDidContinueInBackground((terminalToolSessionId) => {
      const parsed = parseAhpTerminalToolSessionId(terminalToolSessionId);
      if (!parsed) {
        return;
      }
      this._logService.info(`[AgentHost] Continue in background: terminal=${parsed.terminal}, session=${parsed.session}`);
      this._config.connection.dispatch(parsed.terminal, {
        type: ActionType.TerminalClaimed,
        claim: {
          kind: TerminalClaimKind.Session,
          session: parsed.session
        }
      });
    }));
    this._register(this._chatEditingService.registerEditingSessionProvider(
      config.sessionType,
      {
        createEditingSession: (chatSessionResource) => {
          return this._instantiationService.createInstance(
            AgentHostSnapshotController,
            chatSessionResource,
            config.connectionAuthority
          );
        }
      }
    ));
    this._register(this._chatResponseFileChangesService.registerProvider(
      config.sessionType,
      this._register(new AgentHostResponseFileChangesProvider(
        config.connection,
        config.connectionAuthority,
        (sessionResource) => this._resolveSessionUri(sessionResource)
      ))
    ));
    const customizationsObs = this._activeClientService.getCustomizations(config.sessionType);
    this._register(autorun((reader) => {
      const refs = customizationsObs.read(reader);
      const clientId = this._config.connection.clientId;
      for (const [sessionResource] of this._activeSessions) {
        const backendSession = this._resolveSessionUri(sessionResource);
        const state = this._getSessionState(backendSession.toString());
        const existing = state?.activeClients.find((c) => c.clientId === clientId);
        if (existing && !equals(existing.customizations ?? [], refs)) {
          this._dispatchActiveClient(backendSession, [...refs]);
        }
      }
    }));
    this._registerAgent();
  }
  /**
   * Resolves the signed-in user's plan context for chat error formatting.
   * The agent host does not know the user's plan, so quota/rate-limit
   * messages are personalized here from `IChatEntitlementService`.
   */
  _chatErrorContext() {
    const quotas = this._chatEntitlementService.quotas;
    return {
      copilotPlan: getCopilotPlanFromEntitlement(this._chatEntitlementService.entitlement),
      isUsageBasedBilling: quotas.usageBasedBilling,
      quotaResetDate: quotas.resetDate
    };
  }
  async provideChatInputCompletions(sessionResource, params, token) {
    const backendSession = this._resolveSessionUri(sessionResource);
    const result = await this._config.connection.completions({
      kind: AhpCompletionItemKind.UserMessage,
      channel: backendSession.toString(),
      text: params.text,
      offset: params.offset
    });
    if (token.isCancellationRequested) {
      return void 0;
    }
    const items = [];
    for (const raw of result.items) {
      const mapped = this._toChatInputCompletionItem(raw, params.text);
      if (mapped) {
        items.push(mapped);
      }
    }
    return { items };
  }
  provideChatInputCompletionTriggerCharacters() {
    return this._config.connection.getCompletionTriggerCharacters();
  }
  _createCompletionItem(raw, text, attachment, label) {
    const item = {
      insertText: raw.insertText,
      attachment
    };
    if (label !== void 0) {
      item.label = label;
    }
    if (raw.rangeStart !== void 0) {
      item.start = offsetToPosition(text, raw.rangeStart);
    }
    if (raw.rangeEnd !== void 0) {
      item.end = offsetToPosition(text, raw.rangeEnd);
    }
    return item;
  }
  _toChatInputCompletionItem(raw, text) {
    const attachment = raw.attachment;
    switch (attachment.type) {
      case MessageAttachmentKind.Simple: {
        const completionMeta = readCompletionAttachmentMeta(attachment);
        if (completionMeta?.kind === "command") {
          return this._createCompletionItem(raw, text, {
            kind: "command",
            command: completionMeta.command,
            description: completionMeta.description ?? "",
            ...attachment._meta !== void 0 && { _meta: attachment._meta }
          }, attachment.label !== raw.insertText ? attachment.label : void 0);
        }
        if (completionMeta?.kind === "skill") {
          return this._createCompletionItem(raw, text, {
            kind: "skill",
            uri: URI.parse(completionMeta.uri),
            ...completionMeta.displayName !== void 0 ? { displayName: completionMeta.displayName } : {},
            ...completionMeta.description !== void 0 ? { description: completionMeta.description } : {},
            ...attachment._meta !== void 0 && { _meta: attachment._meta }
          });
        }
        return void 0;
      }
      case MessageAttachmentKind.Resource: {
        const uri = typeof attachment.uri === "string" ? URI.parse(attachment.uri) : URI.from(attachment.uri);
        return this._createCompletionItem(raw, text, {
          kind: "resource",
          uri,
          displayName: attachment.label,
          isDirectory: attachment.displayKind === "directory",
          ...attachment._meta !== void 0 && { _meta: attachment._meta }
        });
      }
      case MessageAttachmentKind.Chat: {
        return this._createCompletionItem(raw, text, {
          kind: "chat",
          uri: URI.parse(attachment.resource),
          endTurn: attachment.endTurn,
          title: attachment.label,
          displayName: attachment.label,
          ...attachment._meta !== void 0 && { _meta: attachment._meta }
        });
      }
      default:
        return void 0;
    }
  }
  async provideChatSessionContent(sessionResource, token) {
    if (sessionResource.path.substring(1).startsWith("untitled-")) {
      throw new Error(`Agent host chat sessions must be created by the sessions provider: ${sessionResource.toString()}`);
    }
    const resolvedSession = this._resolveSessionUri(sessionResource);
    let chatURI;
    const isNewSession = this._isNewSessionResource(sessionResource);
    const history = [];
    let initialProgress;
    let initialResponsePartCount = 0;
    let activeTurnId;
    let sessionTitle;
    let draftInputState;
    let sessionSubscription;
    let chatSubscription;
    const hydrationKey = resolvedSession.toString();
    this._hydratingChatSessions.set(hydrationKey, (this._hydratingChatSessions.get(hydrationKey) ?? 0) + 1);
    try {
      if (!isNewSession) {
        try {
          const sub = this._ensureSessionSubscription(resolvedSession.toString());
          sessionSubscription = sub;
          await this._whenSubscriptionHydrated(sub, token);
          if (sub.value instanceof Error) {
            throw sub.value;
          }
          const rawState = this._getRawSessionState(resolvedSession.toString());
          if (!rawState) {
            throw new Error(`Session state did not hydrate for ${resolvedSession.toString()}`);
          }
          chatURI = this._resolveChatUriFromState(sessionResource, rawState);
          this._setChatURI(sessionResource, chatURI);
          const chatSub = this._ensureChatSubscription(resolvedSession.toString(), chatURI);
          chatSubscription = chatSub;
          await this._whenSubscriptionHydrated(chatSub, token);
          const sessionState = this._getSessionState(resolvedSession.toString(), chatURI);
          if (sessionState) {
            sessionTitle = sessionState.title;
            const draft = sessionState.draft ?? emptyDraftFromLastTurn(sessionState);
            draftInputState = this._draftToInputState(sessionResource, draft);
            if (!sessionState.draft && draft) {
              this._config.connection.dispatch(chatURI, { type: ActionType.ChatDraftChanged, draft });
            }
            const fallbackRawModelId = lastTurnModelSelection(sessionState)?.id;
            const lookup = this._createTurnModelLookup(sessionResource, fallbackRawModelId);
            history.push(...turnsToHistory(
              resolvedSession,
              sessionState.turns,
              this._config.agentId,
              this._config.connectionAuthority,
              lookup,
              this._chatErrorContext(),
              this._config.connection.initializeResult.get()?.terminalCommandPrefix
            ));
            await this._enrichHistoryWithSubagentCalls(history, resolvedSession, sessionResource, sessionState);
            if (sessionState.turns.length > 0) {
              this._pendingHistoryTurns.set(sessionResource, sessionState.turns);
            }
            if (sessionState.activeTurn) {
              activeTurnId = sessionState.activeTurn.id;
              const activeRawModelId = sessionState.activeTurn.usage?.model ?? fallbackRawModelId;
              history.push({
                id: sessionState.activeTurn.id,
                type: "request",
                prompt: sessionState.activeTurn.message.text,
                participant: this._config.agentId,
                modelId: lookup.toLanguageModelId(activeRawModelId),
                timestamp: parseTimestamp(sessionState.activeTurn.startedAt),
                variableData: messageToVariableData(sessionState.activeTurn.message, this._config.connectionAuthority),
                isSystemInitiated: sessionState.activeTurn.message.origin.kind === MessageKind.SystemNotification
              });
              history.push({
                type: "response",
                parts: [],
                participant: this._config.agentId,
                details: lookup.toResponseDetails(activeRawModelId, sessionState.activeTurn.usage)
              });
              initialProgress = activeTurnToProgress(
                resolvedSession,
                sessionState.activeTurn,
                this._config.connectionAuthority,
                sessionResource.authority,
                this._otherClientToolInvocationOptions(resolvedSession, chatURI, sessionState.activeTurn.id)
              );
              initialResponsePartCount = sessionState.activeTurn.responseParts.length;
              const actualModelId = this._toLanguageModelId(sessionResource, sessionState.activeTurn.usage?.model);
              if (actualModelId) {
                for (const p of initialProgress) {
                  if (p.kind === "usage") {
                    p.actualModelId = actualModelId;
                  }
                }
              }
              this._logService.info(`[AgentHost] Reconnecting to active turn ${activeTurnId} for session ${resolvedSession.toString()}`);
            }
          }
        } catch (err) {
          this._logService.warn(`[AgentHost] Failed to subscribe to existing session: ${resolvedSession.toString()}`, err);
          if (history.length === 0) {
            history.push({
              type: "request",
              prompt: "",
              participant: this._config.agentId,
              isSystemInitiated: true,
              systemInitiatedLabel: localize("agentHost.sessionLoadFailedLabel", "Couldn't open session")
            });
            history.push({
              type: "response",
              parts: [],
              participant: this._config.agentId,
              errorDetails: { message: unwrapSessionLoadErrorMessage(err) ?? localize("agentHost.sessionLoadFailed", "This session couldn't be loaded.") }
            });
          }
        }
      }
    } finally {
      const remaining = (this._hydratingChatSessions.get(hydrationKey) ?? 1) - 1;
      if (remaining > 0) {
        this._hydratingChatSessions.set(hydrationKey, remaining);
      } else {
        this._hydratingChatSessions.delete(hydrationKey);
      }
    }
    const session = this._instantiationService.createInstance(
      AgentHostChatSession,
      sessionResource,
      history,
      sessionTitle,
      sessionSubscription,
      chatSubscription,
      this._config.promptCacheNotification,
      (request, token2) => {
        if (!this._getSessionState(resolvedSession.toString())) {
          throw new Error("Cannot fork session before the initial request");
        }
        return this._forkSession(sessionResource, resolvedSession, request, token2);
      },
      (title, _token) => {
        this._config.connection.dispatch(resolvedSession.toString(), {
          type: ActionType.SessionTitleChanged,
          title
        });
        return Promise.resolve();
      },
      draftInputState,
      initialProgress,
      () => {
        this._activeSessions.delete(sessionResource);
        this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
        this._draftSyncSubscriptions.deleteAndDispose(sessionResource);
        this._serverTurnWatchers.deleteAndDispose(sessionResource);
        this._mcpAuthWatchers.deleteAndDispose(sessionResource);
        this._pendingHistoryTurns.delete(sessionResource);
        this._surfacedMcpAuthServers.delete(sessionResource);
        const chatURI2 = this._chatURIsBySessionResource.get(sessionResource);
        this._chatURIsBySessionResource.delete(sessionResource);
        if (chatURI2) {
          this._releaseChatSessionSubscriptions(resolvedSession.toString(), chatURI2);
        }
      },
      () => {
        const sessionKey = resolvedSession.toString();
        const chatURI2 = this._chatURIsBySessionResource.get(sessionResource);
        if (!chatURI2) {
          return true;
        }
        const turnId = this._getSessionState(sessionKey, chatURI2)?.activeTurn?.id;
        if (!turnId) {
          return true;
        }
        this._logService.info(`[AgentHost] Cancellation requested for ${sessionKey}, dispatching turnCancelled`);
        this._config.connection.dispatch(chatURI2, {
          type: ActionType.ChatTurnCancelled,
          turnId,
          duration: this._turnDuration(chatURI2, turnId)
        });
        return true;
      }
    );
    this._activeSessions.set(sessionResource, session);
    if (!isNewSession) {
      if (chatURI !== void 0) {
        this._ensurePendingMessageSubscription(sessionResource, resolvedSession);
        this._ensureDraftSyncSubscription(sessionResource, resolvedSession, chatURI);
      }
      if (this._pendingHistoryTurns.has(sessionResource)) {
        if (this._chatService.getSession(sessionResource)) {
          this._ensureSnapshotController(sessionResource);
        } else {
          const sub = this._chatService.onDidCreateModel((model) => {
            if (isEqual(model.sessionResource, sessionResource)) {
              sub.dispose();
              this._ensureSnapshotController(sessionResource);
            }
          });
          session.registerDisposable(sub);
        }
      }
      if (activeTurnId && initialProgress !== void 0) {
        this._reconnectToActiveTurn(resolvedSession, activeTurnId, session, initialProgress, initialResponsePartCount);
      }
      if (chatURI !== void 0) {
        this._watchForServerInitiatedTurns(resolvedSession, sessionResource);
      }
    }
    return session;
  }
  // ---- Agent registration -------------------------------------------------
  _registerAgent() {
    const agentData = {
      id: this._config.agentId,
      name: this._config.agentId,
      fullName: this._config.fullName,
      description: this._config.description,
      extensionId: new ExtensionIdentifier(this._config.extensionId ?? "vscode.agent-host"),
      extensionVersion: void 0,
      extensionPublisherId: "vscode",
      extensionDisplayName: this._config.extensionDisplayName ?? "Agent Host",
      isDefault: false,
      isDynamic: true,
      isCore: true,
      metadata: { themeIcon: getAgentSessionProviderIcon(this._config.sessionType) },
      slashCommands: [],
      locations: [ChatAgentLocation.Chat],
      modes: [ChatModeKind.Agent],
      disambiguation: []
    };
    const agentImpl = {
      invoke: async (request, progress, _history, cancellationToken) => {
        return this._invokeAgent(request, progress, cancellationToken);
      }
    };
    this._register(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));
  }
  async _invokeAgent(request, progress, cancellationToken) {
    this._logService.info(`[AgentHost] _invokeAgent called for resource: ${request.sessionResource.toString()}`);
    if (!await this._ensureWorkspaceTrust(request.sessionResource)) {
      return {};
    }
    const preparingStatus = new MutableDisposable();
    let failureStage = "resolveSession";
    try {
      const resolvedSession = this._resolveSessionUri(request.sessionResource);
      const sessionKey = resolvedSession.toString();
      failureStage = "provisionalSession";
      await raceCancellation(this._provisionalService.waitForPending(request.sessionResource), cancellationToken);
      if (cancellationToken.isCancellationRequested) {
        return {};
      }
      const provisionalBackend = this._provisionalService.get(request.sessionResource);
      if (provisionalBackend) {
        this._ensureSessionSubscription(sessionKey);
      }
      failureStage = "sessionState";
      const existingState = await this._readEagerlyCreatedSessionState(resolvedSession, cancellationToken);
      if (cancellationToken.isCancellationRequested) {
        return {};
      }
      if (!existingState) {
        const imported = this._importConversationStore.take(request.sessionResource);
        if (imported) {
          preparingStatus.value = disposableTimeout(() => {
            progress([{ kind: "progressMessage", content: new MarkdownString(localize("agentHost.preparingSession", "Preparing session\u2026")), shimmer: true }]);
          }, 500);
        }
        const model = imported?.model ?? this._createModelSelection(request.userSelectedModelId, request.modelConfiguration);
        const initialConfig = {
          ...this._provisionalService.getInitialSessionConfig(),
          ...request.agentHostSessionConfig
        };
        await this._createAndSubscribe(
          request.sessionResource,
          model,
          void 0,
          Object.keys(initialConfig).length > 0 ? initialConfig : void 0,
          imported ? { turns: imported.turns, model: imported.model } : void 0,
          (stage) => failureStage = stage
        );
      } else {
        failureStage = "authentication";
        await this._ensureRequiredAuthentication();
        failureStage = "subscribeSession";
        const sessionSub = this._ensureSessionSubscription(sessionKey);
        const chatURI = this._resolveChatUriFromState(request.sessionResource, existingState);
        this._setChatURI(request.sessionResource, chatURI);
        const chatSub = this._ensureChatSubscription(sessionKey, chatURI);
        this._activeSessions.get(request.sessionResource)?.setStateSubscriptions(sessionSub, chatSub);
        this._ensurePendingMessageSubscription(request.sessionResource, resolvedSession);
        this._watchForServerInitiatedTurns(resolvedSession, request.sessionResource);
        if (request.agentHostSessionConfig && Object.keys(request.agentHostSessionConfig).length > 0) {
          this._dispatchAction(resolvedSession, {
            type: ActionType.SessionConfigChanged,
            config: request.agentHostSessionConfig
          });
        }
      }
      const stopWatch = StopWatch.create(false);
      let firstProgress;
      const measuredProgress = (parts) => {
        preparingStatus.clear();
        if (firstProgress === void 0 && parts.some(isFirstVisibleProgressPart)) {
          firstProgress = stopWatch.elapsed();
        }
        progress(parts);
      };
      failureStage = "prepareTurn";
      const completedTurn = await this._handleTurn(resolvedSession, request, measuredProgress, cancellationToken, (stage) => failureStage = stage);
      const details = this._getTurnResponseDetails(request.sessionResource, resolvedSession, completedTurn);
      const errorDetails = this._getTurnErrorDetails(completedTurn);
      return {
        timings: { firstProgress, totalElapsed: stopWatch.elapsed() },
        ...details ? { details } : {},
        ...errorDetails ? { errorDetails } : {}
      };
    } catch (error) {
      if (!isCancellationError(error)) {
        this._reportInvocationFailure(request, failureStage, error);
      }
      throw error;
    } finally {
      preparingStatus.dispose();
    }
  }
  _reportInvocationFailure(request, failureStage, error) {
    const packed = packErrorForTelemetry(error);
    const requests = this._chatService.getSession(request.sessionResource)?.getRequests();
    this._telemetryService.publicLogError2("agentHost.invocationFailed", {
      requestId: request.requestId,
      provider: this._config.provider,
      failureStage,
      isFirstRequest: requests?.[0]?.id === request.requestId,
      hasUserSelectedModel: request.userSelectedModelId !== void 0,
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: getErrorCode(error),
      msg: packed.msg,
      callstack: packed.callstack
    });
  }
  /**
   * Builds the {@link IChatResponseErrorDetails} for a failed turn so the
   * chat response renders a proper error (and, for quota errors, the upgrade
   * affordance via `ChatQuotaExceededPart`). Returns `undefined` for
   * non-error turns. Falls back to the raw error when no structured chat
   * error was forwarded in `_meta`.
   */
  _getTurnErrorDetails(turn) {
    if (turn?.state !== TurnState.Error || !turn.error) {
      return void 0;
    }
    return getChatErrorDetailsFromMeta(turn.error, this._chatErrorContext()) ?? { message: localize("agentHost.turnError", "Error: ({0}) {1}", turn.error.errorType, turn.error.message) };
  }
  /**
   * Returns the {@link SessionState} for a session that was eagerly created
   * at folder-pick time, or `undefined` if no such session exists. Uses the
   * unmanaged subscription accessor so we don't accidentally open a fresh
   * subscription (which would issue a duplicate snapshot fetch on the wire,
   * and in tests would synthesise placeholder state via the mock's auto-
   * hydration path).
   *
   * If the eager subscription exists but hasn't received its first snapshot
   * yet (creation in flight), waits for it to hydrate or error before
   * returning. This closes a race where the chat request arrives between
   * `createSession` resolving and the snapshot landing.
   */
  async _readEagerlyCreatedSessionState(resolvedSession, token) {
    const inflight = this._config.connection.getInflightSessionCreate?.(resolvedSession);
    if (inflight) {
      try {
        await inflight;
      } catch {
      }
      if (token.isCancellationRequested) {
        return void 0;
      }
    }
    const sub = this._config.connection.getSubscriptionUnmanaged(StateComponents.Session, resolvedSession);
    if (!sub) {
      return void 0;
    }
    if (sub.value !== void 0) {
      return sub.value instanceof Error ? void 0 : sub.value;
    }
    const pinRef = this._config.connection.getSubscription(StateComponents.Session, resolvedSession, "AgentHostSessionHandler");
    try {
      await this._whenSubscriptionHydrated(pinRef.object, token);
      const value = pinRef.object.value;
      this._logService.info(`[AgentHost] _readEagerlyCreatedSessionState: hydrated value=${value === void 0 ? "undefined" : value instanceof Error ? `error(${value.message})` : "state"} cancelled=${token.isCancellationRequested} for ${resolvedSession.toString()}`);
      return value instanceof Error ? void 0 : value;
    } finally {
      pinRef.dispose();
    }
  }
  // ---- Pending message sync -----------------------------------------------
  /**
   * Diffs the chat model's pending requests against the protocol state in
   * `_clientState` and dispatches Set/Removed/Reordered actions as needed.
   */
  _syncPendingMessages(sessionResource, backendSession) {
    const chatModel = this._chatService.getSession(sessionResource);
    if (!chatModel) {
      return;
    }
    const session = backendSession.toString();
    const chatURI = this._getChatURI(sessionResource);
    const pending = chatModel.getPendingRequests();
    const protocolState = this._getSessionState(session, chatURI);
    const prevSteering = protocolState?.steeringMessage;
    const prevQueued = protocolState?.queuedMessages ?? [];
    let currentSteering;
    const currentQueued = [];
    for (const p of pending) {
      const variables = p.request.variableData?.variables ?? [];
      const messageAttachments = this._variableEntriesToAttachments(variables, sessionResource, p.request.message.text);
      const attachments = messageAttachments.length > 0 ? messageAttachments : void 0;
      const snapshot = { id: p.request.id, message: userOriginMessage(p.request.message.text, attachments) };
      if (p.kind === ChatRequestQueueKind.Steering) {
        currentSteering = snapshot;
      } else {
        currentQueued.push(snapshot);
      }
    }
    if (currentSteering) {
      if (currentSteering.id !== prevSteering?.id || !equals(currentSteering.message, prevSteering.message)) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Steering,
          id: currentSteering.id,
          message: currentSteering.message
        }, chatURI);
      }
    } else if (prevSteering) {
      this._dispatchAction(backendSession, {
        type: ActionType.ChatPendingMessageRemoved,
        kind: PendingMessageKind.Steering,
        id: prevSteering.id
      }, chatURI);
    }
    const currentQueuedIds = new Set(currentQueued.map((q) => q.id));
    for (const prev of prevQueued) {
      if (!currentQueuedIds.has(prev.id)) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatPendingMessageRemoved,
          kind: PendingMessageKind.Queued,
          id: prev.id
        }, chatURI);
      }
    }
    const prevQueuedById = new Map(prevQueued.map((q) => [q.id, q]));
    for (const q of currentQueued) {
      const prev = prevQueuedById.get(q.id);
      if (!prev || !equals(q.message, prev.message)) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Queued,
          id: q.id,
          message: q.message
        }, chatURI);
      }
    }
    const updatedProtocol = this._getSessionState(session, chatURI);
    const updatedQueued = updatedProtocol?.queuedMessages ?? [];
    if (updatedQueued.length > 1 && currentQueued.length === updatedQueued.length) {
      const needsReorder = currentQueued.some((q, i) => q.id !== updatedQueued[i].id);
      if (needsReorder) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatQueuedMessagesReordered,
          order: currentQueued.map((q) => q.id)
        }, chatURI);
      }
    }
  }
  /**
   * Projects protocol pending messages into the chat model.
   * The protocol is authoritative, so matching local state is a no-op.
   */
  _applyRemotePendingMessages(sessionResource, backendSession) {
    if (!this._chatService.getSession(sessionResource)) {
      return;
    }
    const chatURI = this._chatURIsBySessionResource.get(sessionResource);
    if (!chatURI) {
      return;
    }
    const state = this._getSessionState(backendSession.toString(), chatURI);
    if (!state) {
      return;
    }
    const toRemote = (pending, kind) => ({
      id: pending.id,
      kind,
      message: pending.message.text,
      variableData: messageToVariableData(pending.message, this._config.connectionAuthority)
    });
    const remote = [];
    if (state.steeringMessage) {
      remote.push(toRemote(state.steeringMessage, ChatRequestQueueKind.Steering));
    }
    for (const queued of state.queuedMessages ?? []) {
      remote.push(toRemote(queued, ChatRequestQueueKind.Queued));
    }
    this._chatService.syncPendingRequestsFromRemote(sessionResource, remote);
  }
  _dispatchAction(channel, action, chatURI) {
    const target = isChatAction(action) ? this._requireChatURI(chatURI, action.type) : channel.toString();
    this._config.connection.dispatch(target, action);
  }
  _requireChatURI(chatURI, actionType) {
    if (!chatURI) {
      throw new Error(`Cannot dispatch ${actionType} without a resolved AHP chat channel`);
    }
    return chatURI;
  }
  _resolveChatUriFromState(sessionResource, state) {
    if (sessionResource.fragment) {
      const match = state.chats.find((summary) => parseChatUri(summary.resource)?.chatId === sessionResource.fragment);
      if (!match) {
        throw new Error(`Cannot resolve chat '${sessionResource.fragment}' from session state for ${sessionResource.toString()}`);
      }
      return match.resource.toString();
    }
    if (!state.defaultChat) {
      throw new Error(`Session ${sessionResource.toString()} has no default chat`);
    }
    return state.defaultChat.toString();
  }
  _setChatURI(sessionResource, chatURI) {
    this._chatURIsBySessionResource.set(sessionResource, chatURI);
  }
  _getChatURI(sessionResource) {
    const chatURI = this._chatURIsBySessionResource.get(sessionResource);
    if (!chatURI) {
      throw new Error(`No AHP chat URI mapped for ${sessionResource.toString()}`);
    }
    return chatURI;
  }
  _getCurrentActiveClient() {
    return this._activeClientService.getActiveClient(this._config.sessionType, this._config.connection.clientId);
  }
  _ensureActiveClientForMessage(backendSession) {
    const state = this._getSessionState(backendSession.toString());
    const activeClient = this._getCurrentActiveClient();
    const existing = state?.activeClients.find((c) => c.clientId === activeClient.clientId);
    if (equals(existing, activeClient)) {
      return;
    }
    this._dispatchAction(backendSession, {
      type: ActionType.SessionActiveClientSet,
      activeClient
    });
  }
  /**
   * Dispatches `session/activeClientSet` to add this connection as an
   * active client for this session and publish the current customizations
   * and client-provided tools. This client never removes itself.
   */
  _dispatchActiveClient(backendSession, customizations) {
    const current = this._getCurrentActiveClient();
    this._dispatchAction(backendSession, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { ...current, customizations }
    });
  }
  // ---- Server-initiated turn detection ------------------------------------
  /**
   * Sets up a persistent listener on the session's protocol state that
   * detects server-initiated turns (e.g. auto-consumed queued messages).
   * When a new `activeTurn` appears whose `turnId` was NOT dispatched by
   * this client, it signals the {@link AgentHostChatSession} to create a
   * new request in the chat model, removes the consumed pending request
   * if applicable, and pipes turn progress through `progressObs`.
   */
  _watchForServerInitiatedTurns(backendSession, sessionResource) {
    const sessionStr = backendSession.toString();
    const chatURI = this._getChatURI(sessionResource);
    this._watchForMcpAuthentication(backendSession, sessionResource, chatURI);
    const currentState = this._getSessionState(sessionStr, chatURI);
    let lastSeenTurnId = currentState?.activeTurn?.id;
    let previousQueuedIds;
    let previousSteeringId = currentState?.steeringMessage?.id;
    let previousTitle = currentState?.title;
    const disposables = new DisposableStore();
    const turnProgressDisposable = new MutableDisposable();
    disposables.add(turnProgressDisposable);
    const sessionSub = this._ensureSessionSubscription(sessionStr);
    const chatSub = this._ensureChatSubscription(sessionStr, chatURI);
    const onChange = () => {
      const state = this._getSessionState(sessionStr, chatURI);
      if (!state) {
        return;
      }
      const e = { session: sessionStr, state };
      const currentQueuedIds = new Set((e.state.queuedMessages ?? []).map((m) => m.id));
      const currentSteeringId = e.state.steeringMessage?.id;
      if (previousSteeringId && previousSteeringId !== currentSteeringId) {
        this._chatService.removePendingRequest(sessionResource, previousSteeringId);
      }
      previousSteeringId = currentSteeringId;
      const currentTitle = e.state.title;
      if (currentTitle && currentTitle !== previousTitle) {
        this._chatService.setChatSessionTitle(sessionResource, currentTitle);
      }
      previousTitle = currentTitle;
      const activeTurn = e.state.activeTurn;
      if (!activeTurn || activeTurn.id === lastSeenTurnId) {
        previousQueuedIds = currentQueuedIds;
        return;
      }
      lastSeenTurnId = activeTurn.id;
      if (this._clientDispatchedTurnIds.has(activeTurn.id)) {
        previousQueuedIds = currentQueuedIds;
        return;
      }
      const chatSession = this._activeSessions.get(sessionResource);
      if (!chatSession) {
        previousQueuedIds = currentQueuedIds;
        return;
      }
      this._logService.info(`[AgentHost] Server-initiated turn detected: ${activeTurn.id}`);
      if (previousQueuedIds) {
        for (const prevId of previousQueuedIds) {
          if (!currentQueuedIds.has(prevId)) {
            this._chatService.removePendingRequest(sessionResource, prevId);
          }
        }
      }
      previousQueuedIds = currentQueuedIds;
      chatSession.startServerRequest(
        activeTurn.id,
        activeTurn.message.text,
        messageToVariableData(activeTurn.message, this._config.connectionAuthority),
        {
          isSystemInitiated: activeTurn.message.origin.kind === MessageKind.SystemNotification,
          timestamp: parseTimestamp(activeTurn.startedAt),
          isTerminalRequest: isTerminalCommandPrompt(activeTurn.message.text, this._config.connection.initializeResult.get()?.terminalCommandPrefix)
        }
      );
      const turnStore = new DisposableStore();
      turnProgressDisposable.value = turnStore;
      this._trackServerTurnProgress(backendSession, activeTurn.id, chatSession, turnStore);
    };
    disposables.add(sessionSub.onDidChange(onChange));
    disposables.add(chatSub.onDidChange(onChange));
    this._serverTurnWatchers.set(sessionResource, disposables);
  }
  _watchForMcpAuthentication(backendSession, sessionResource, chatURI) {
    const sessionSub = this._ensureSessionSubscription(backendSession.toString());
    let previousServers;
    const reconcile = () => {
      const servers = getMcpAuthenticationRequiredServers(sessionResource, this._getSessionState(backendSession.toString(), chatURI));
      if (equals(previousServers, servers)) {
        return;
      }
      previousServers = servers;
      void this._filterAutoGrantedMcpAuthentication(sessionResource, servers);
    };
    const disposables = new DisposableStore();
    disposables.add(sessionSub.onDidChange(reconcile));
    reconcile();
    this._mcpAuthWatchers.set(sessionResource, disposables);
  }
  /**
   * Tracks protocol state changes for a specific server-initiated turn and
   * pushes `IChatProgress[]` items into the session's `progressObs`.
   * When the turn finishes, sets `isCompleteObs` to true.
   */
  _trackServerTurnProgress(backendSession, turnId, chatSession, turnDisposables) {
    const cts = new CancellationTokenSource();
    turnDisposables.add(toDisposable(() => cts.dispose(true)));
    turnDisposables.add(this._observeTurn({
      backendSession,
      sessionResource: chatSession.sessionResource,
      chatURI: this._getChatURI(chatSession.sessionResource),
      turnId,
      sink: (parts) => chatSession.appendProgress(parts),
      cancellationToken: cts.token,
      onTurnEnded: () => chatSession.isCompleteObs.set(true, void 0)
    }));
  }
  _turnStopWatchKey(chatURI, turnId) {
    return `${chatURI}\0${turnId}`;
  }
  _ensureTurnStopWatch(chatURI, turnId) {
    const key = this._turnStopWatchKey(chatURI, turnId);
    let stopWatch = this._turnStopWatches.get(key);
    if (!stopWatch) {
      stopWatch = StopWatch.create(false);
      this._turnStopWatches.set(key, stopWatch);
    }
    return stopWatch;
  }
  _turnDuration(chatURI, turnId) {
    const elapsed = this._turnStopWatches.get(this._turnStopWatchKey(chatURI, turnId))?.elapsed();
    return typeof elapsed === "number" && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  }
  _clearTurnStopWatch(chatURI, turnId) {
    this._turnStopWatches.delete(this._turnStopWatchKey(chatURI, turnId));
  }
  // ---- Turn handling (state-driven) ---------------------------------------
  async _handleTurn(session, request, progress, cancellationToken, onFailureStage) {
    if (cancellationToken.isCancellationRequested) {
      return;
    }
    onFailureStage("prepareTurn");
    const turnId = request.requestId;
    this._clientDispatchedTurnIds.add(turnId);
    const chatURI = this._getChatURI(request.sessionResource);
    const turnChannel = chatURI;
    const messageAttachments = await this._convertVariablesToAttachments(request);
    if (cancellationToken.isCancellationRequested) {
      return;
    }
    this._ensureActiveClientForMessage(session);
    const selectedModel = this._createModelSelection(request.userSelectedModelId, request.modelConfiguration);
    const requestedAgentUri = request.modeInstructions?.uri?.toString();
    const chatModel = this._chatService.getSession(request.sessionResource);
    const protocolState = this._getSessionState(session.toString(), chatURI);
    if (chatModel && protocolState?.turns.length) {
      const previousRequestIndex = chatModel.getRequests().findIndex((i) => i.id === request.requestId) - 1;
      const previousRequest = previousRequestIndex >= 0 ? chatModel.getRequests()[previousRequestIndex] : void 0;
      if (!previousRequest && protocolState.turns.length > 0) {
        const truncateAction = {
          type: ActionType.ChatTruncated
        };
        this._config.connection.dispatch(turnChannel, truncateAction);
      } else {
        const seenAtIndex = protocolState.turns.findIndex((t) => t.id === previousRequest.id);
        if (seenAtIndex !== -1 && seenAtIndex < protocolState.turns.length - 1) {
          const truncateAction = {
            type: ActionType.ChatTruncated,
            turnId: previousRequest.id
          };
          this._config.connection.dispatch(turnChannel, truncateAction);
        }
      }
    }
    this._customizationService.prepareMcpServersForTurn(request.sessionResource);
    const turnAction = {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: {
        ...userOriginMessage(request.message, messageAttachments),
        ...selectedModel ? { model: selectedModel } : {},
        ...requestedAgentUri ? { agent: { uri: requestedAgentUri } } : {}
      }
    };
    this._ensureTurnStopWatch(turnChannel, turnId);
    onFailureStage("dispatchTurn");
    this._config.connection.dispatch(turnChannel, turnAction);
    this._ensureSnapshotController(request.sessionResource)?.ensureRequestCheckpoint(request.requestId);
    onFailureStage("observeTurn");
    return new Promise((resolve) => {
      const store = new DisposableStore();
      const cancelSub = store.add(cancellationToken.onCancellationRequested(() => {
        cancelSub.dispose();
        this._logService.info(`[AgentHost] Cancellation requested for ${session.toString()}, dispatching turnCancelled`);
        this._config.connection.dispatch(turnChannel, {
          type: ActionType.ChatTurnCancelled,
          turnId,
          duration: this._turnDuration(turnChannel, turnId)
        });
      }));
      store.add(this._observeTurn({
        backendSession: session,
        sessionResource: request.sessionResource,
        chatURI,
        turnId,
        sink: progress,
        cancellationToken,
        suppressErrorMarkdown: true,
        onTurnEnded: (lastTurn) => {
          store.dispose();
          this._clientDispatchedTurnIds.delete(turnId);
          this._activeSessions.get(request.sessionResource)?.isCompleteObs.set(true, void 0);
          resolve(lastTurn);
        },
        onFileEdits: (tc) => {
          const editParts = this._hydrateFileEdits(request.sessionResource, request.requestId, tc);
          if (editParts.length > 0) {
            progress(editParts);
          }
        }
      }));
    });
  }
  // ---- Tool confirmation --------------------------------------------------
  /**
   * Awaits user confirmation on a PendingConfirmation tool call invocation
   * and dispatches `ChatToolCallConfirmed` back to the server.
   */
  _awaitToolConfirmation(invocation, toolCallId, session, turnId, cancellationToken, getProtocolOptions, chatURI) {
    IChatToolInvocation.awaitConfirmation(invocation, cancellationToken).then((reason) => {
      let selectedOption;
      const protocolOptions = getProtocolOptions();
      if (reason.type === ToolConfirmKind.UserAction && reason.selectedButton && protocolOptions) {
        selectedOption = protocolOptions.find((o) => o.id === reason.selectedButton);
      }
      const approved = selectedOption ? selectedOption.kind === ConfirmationOptionKind.Approve : reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;
      this._logService.info(`[AgentHost] Tool confirmation: toolCallId=${toolCallId}, approved=${approved}, selectedOptionId=${selectedOption?.id}`);
      const target = this._requireChatURI(chatURI, ActionType.ChatToolCallConfirmed);
      if (approved) {
        this._config.connection.dispatch(target, {
          type: ActionType.ChatToolCallConfirmed,
          turnId,
          toolCallId,
          approved: true,
          confirmed: ToolCallConfirmationReason.UserAction,
          ...selectedOption ? { selectedOptionId: selectedOption.id } : {}
        });
      } else {
        this._config.connection.dispatch(target, {
          type: ActionType.ChatToolCallConfirmed,
          turnId,
          toolCallId,
          approved: false,
          reason: ToolCallCancellationReason.Denied,
          ...selectedOption ? { selectedOptionId: selectedOption.id } : {}
        });
      }
    }).catch((err) => {
      this._logService.warn(`[AgentHost] Tool confirmation failed for toolCallId=${toolCallId}`, err);
    });
  }
  // ---- Per-turn observable graph ------------------------------------------
  /**
   * Installs the always-on observable graph that translates session state
   * into `IChatProgress[]` for a specific turn. The same graph is used for:
   *   - live turns started by the user via {@link _handleTurn},
   *   - reconnect to an in-flight turn from {@link provideChatSessionContent},
   *   - server-initiated turns detected by {@link _watchForServerInitiatedTurns}.
   *
   * Differences are captured in {@link IObserveTurnOptions.sink} (where
   * progress is delivered) and {@link IObserveTurnOptions.adoptInvocations} /
   * {@link IObserveTurnOptions.seedEmittedLengths} (snapshot continuity for
   * the reconnect case).
   *
   * The returned disposable owns the entire per-turn graph, including the
   * underlying session subscription reference.
   */
  _observeTurn(opts) {
    const sessionKey = opts.backendSession.toString();
    const store = new DisposableStore();
    this._ensureTurnStopWatch(opts.chatURI, opts.turnId);
    const sub = this._ensureSessionSubscription(sessionKey);
    const chatURI = opts.chatURI;
    const chatSub = this._ensureChatSubscription(sessionKey, chatURI);
    const sessionState$ = observableFromSubscription(this, sub);
    const chatState$ = observableFromSubscription(this, chatSub);
    const mergedState$ = derived((reader) => {
      const session = sessionState$.read(reader);
      if (!session) {
        return void 0;
      }
      return mergeSessionWithDefaultChat(session, chatState$.read(reader));
    });
    const turn$ = derived((reader) => {
      const state = mergedState$.read(reader);
      if (!state) {
        return void 0;
      }
      return state.activeTurn?.id === opts.turnId ? state.activeTurn : state.turns.find((t) => t.id === opts.turnId);
    });
    const responseParts$ = derived((reader) => turn$.read(reader)?.responseParts ?? []);
    const usage$ = derived((reader) => turn$.read(reader)?.usage);
    store.add(autorun((reader) => {
      const state = mergedState$.read(reader);
      if (state?.turns.some((turn) => turn.id === opts.turnId)) {
        this._clearTurnStopWatch(opts.chatURI, opts.turnId);
      }
    }));
    const mcpAuthRequired$ = derivedOpts({ equalsFn: equals }, (reader) => {
      return getMcpAuthenticationRequiredServers(opts.sessionResource, mergedState$.read(reader));
    });
    const mcpStarting$ = derivedOpts({ equalsFn: equals }, (reader) => {
      const state = mergedState$.read(reader);
      const servers = state?.customizations?.flatMap((c) => c.type === CustomizationType.McpServer ? [c] : c.children?.filter((c2) => c2.type === CustomizationType.McpServer) ?? []) ?? [];
      return servers.filter((server) => server.enabled && server.state.kind === McpServerStatus.Starting).map((server) => ({
        id: opts.sessionResource.authority + "/" + server.id,
        name: server.name
      }));
    });
    const subagentContext = {
      observedToolIds: /* @__PURE__ */ new Set()
    };
    store.add(autorunPerKeyedItem(
      responseParts$,
      (rp) => rp.kind === ResponsePartKind.ToolCall ? `tc:${rp.toolCall.toolCallId}` : rp.kind === ResponsePartKind.Markdown ? `md:${rp.id}` : rp.kind === ResponsePartKind.Reasoning ? `rs:${rp.id}` : rp.kind === ResponsePartKind.InputRequest ? inputRequestResponsePartKey(rp) : `other:${responseParts$.get().indexOf(rp)}`,
      (_key, part$, partStore) => {
        const initial = part$.get();
        switch (initial.kind) {
          case ResponsePartKind.Markdown:
            if (opts.subAgentInvocationId !== void 0) {
              break;
            }
            this._setupMarkdownPart(part$, partStore, opts);
            break;
          case ResponsePartKind.Reasoning:
            if (opts.subAgentInvocationId !== void 0) {
              break;
            }
            this._setupReasoningPart(part$, partStore, opts);
            break;
          case ResponsePartKind.ToolCall:
            this._setupToolCallPart(part$, partStore, opts, subagentContext);
            break;
          case ResponsePartKind.InputRequest:
            if (opts.subAgentInvocationId === void 0) {
              this._setupInputRequestPart(part$, partStore, opts);
            }
            break;
          case ResponsePartKind.SystemNotification:
            if (responseParts$.get().indexOf(initial) >= (opts.initialResponsePartCount ?? 0) && opts.subAgentInvocationId === void 0) {
              const progress = systemNotificationToChatPart(initial.content, this._config.connectionAuthority);
              if (progress) {
                opts.sink([progress]);
              }
            }
            break;
        }
      }
    ));
    if (opts.subAgentInvocationId === void 0) {
      let lastUsage;
      let lastAutoModeResolution;
      const modelLookup = this._createTurnModelLookup(opts.sessionResource, void 0);
      this._setupMcpAuthPrompt(mcpAuthRequired$, store, opts);
      store.add(autorun((reader) => {
        const activity = chatState$.read(reader)?.activity;
        if (!activity || responseParts$.read(reader).length > 0) {
          return;
        }
        opts.sink([{
          kind: "progressMessage",
          id: CHAT_ACTIVITY_PROGRESS_ID,
          content: new MarkdownString().appendText(activity),
          shimmer: true
        }]);
      }));
      store.add(autorun((reader) => {
        const resolution = modelLookup.toAutoModeResolution?.(usage$.read(reader));
        if (!resolution || equals(lastAutoModeResolution, resolution)) {
          return;
        }
        lastAutoModeResolution = resolution;
        opts.sink([resolution]);
      }));
      {
        const MCP_STARTING_GRACE_MS = 5e3;
        let didAppend = false;
        const hasContent$ = responseParts$.map((r) => r.length > 0);
        const hasServersStarting$ = mcpStarting$.map((s) => s.length > 0);
        const serversStartingInput = observableValue("mcpStartingServersInput", constObservable([]));
        store.add(autorun((reader) => {
          if (hasContent$.read(reader) || !hasServersStarting$.read(reader)) {
            serversStartingInput.set(constObservable([]), void 0);
            return;
          }
          reader.store.add(disposableTimeout(() => {
            serversStartingInput.set(mcpStarting$, void 0);
            if (!didAppend) {
              didAppend = true;
              opts.sink([{
                kind: "mcpServersStartingSlow",
                sessionResource: opts.sessionResource,
                servers: serversStartingInput.map((o, r) => o.read(r))
              }]);
            }
          }, MCP_STARTING_GRACE_MS));
        }));
        store.add(toDisposable(() => serversStartingInput.set(constObservable([]), void 0)));
      }
      store.add(autorun((reader) => {
        const rawUsage = usage$.read(reader);
        const usage = usageInfoToChatUsage(rawUsage);
        if (!usage) {
          return;
        }
        const actualModelId = this._toLanguageModelId(opts.sessionResource, rawUsage?.model);
        if (actualModelId) {
          usage.actualModelId = actualModelId;
        }
        if (lastUsage && lastUsage.promptTokens === usage.promptTokens && lastUsage.completionTokens === usage.completionTokens && lastUsage.outputBuffer === usage.outputBuffer && lastUsage.copilotCredits === usage.copilotCredits && lastUsage.sessionCopilotCredits === usage.sessionCopilotCredits && equals(lastUsage.promptTokenDetails, usage.promptTokenDetails)) {
          return;
        }
        lastUsage = usage;
        opts.sink([usage]);
      }));
      let lastQuotaSignature;
      store.add(autorun((reader) => {
        const quotaUpdate = usageInfoToQuotas(usage$.read(reader));
        if (!quotaUpdate) {
          return;
        }
        const signature = JSON.stringify(quotaUpdate);
        if (signature === lastQuotaSignature) {
          return;
        }
        lastQuotaSignature = signature;
        this._chatEntitlementService.acceptQuotas({
          ...this._chatEntitlementService.quotas,
          ...quotaUpdate
        });
      }));
    }
    if (opts.subAgentInvocationId !== void 0 && opts.subAgentCreditsAccumulator) {
      const accumulator = opts.subAgentCreditsAccumulator;
      let lastCredits = 0;
      store.add(autorun((reader) => {
        const rawUsage = usage$.read(reader);
        const credits = usageInfoToChatUsage(rawUsage)?.copilotCredits;
        if (typeof credits === "number" && credits !== lastCredits) {
          const delta = credits - lastCredits;
          lastCredits = credits;
          if (delta > 0) {
            transaction((tx) => {
              accumulator.set(accumulator.read(void 0) + delta, tx);
            });
          }
        }
      }));
    }
    if (opts.subAgentInvocationId !== void 0 && opts.subAgentModelObservable) {
      const modelObservable = opts.subAgentModelObservable;
      store.add(autorun((reader) => {
        const rawUsage = usage$.read(reader);
        const modelId = this._toLanguageModelId(opts.sessionResource, rawUsage?.model);
        const modelName = this._getLanguageModelDisplayName(modelId);
        if (modelName && modelName !== modelObservable.read(void 0)) {
          transaction((tx) => modelObservable.set(modelName, tx));
        }
      }));
    }
    let terminated = false;
    let seenActive = false;
    const finish = (lastTurn) => {
      if (terminated) {
        return;
      }
      terminated = true;
      queueMicrotask(() => {
        try {
          opts.onTurnEnded?.(lastTurn);
        } finally {
          store.dispose();
        }
      });
    };
    store.add(autorun((reader) => {
      if (terminated) {
        return;
      }
      const state = mergedState$.read(reader);
      if (!state) {
        return;
      }
      if (state.activeTurn?.id === opts.turnId) {
        seenActive = true;
        return;
      }
      const lastTurn = state.turns.find((t) => t.id === opts.turnId);
      if (lastTurn) {
        seenActive = true;
      }
      if (!seenActive) {
        return;
      }
      if (!opts.suppressErrorMarkdown && lastTurn?.state === TurnState.Error && lastTurn.error) {
        const forwarded = getChatErrorDetailsFromMeta(lastTurn.error, this._chatErrorContext());
        const content = forwarded ? new MarkdownString(`

${forwarded.message}`) : new MarkdownString(`

Error: (${lastTurn.error.errorType}) ${lastTurn.error.message}`);
        opts.sink([{ kind: "markdownContent", content }]);
      }
      finish(lastTurn);
    }));
    store.add(opts.cancellationToken.onCancellationRequested(() => {
      const current = turn$.get();
      finish(current ? { state: TurnState.Cancelled, ...current } : void 0);
    }));
    return store;
  }
  /**
   * Surfaces the "MCP server … requires authentication" prompt for a turn.
   *
   * Each server is prompted at most once per conversation: {@link mcpAuthRequired$}
   * is session-wide, so without this guard the prompt would repeat on every
   * message. The per-session {@link _surfacedMcpAuthServers surfaced set} tracks
   * which servers were already prompted; it is pruned by
   * {@link _reconcileSurfacedMcpAuthServers} once a server reaches the running
   * state, so a server that is re-required after being authenticated (e.g.
   * after a restart) prompts again.
   *
   * The emitted part lists only the servers it introduced and shrinks as they
   * authenticate.
   */
  _setupMcpAuthPrompt(mcpAuthRequired$, store, opts) {
    let part;
    let ownedIds = /* @__PURE__ */ new Set();
    let runId = 0;
    store.add(autorun((reader) => {
      const pendingAuth = mcpAuthRequired$.read(reader);
      const currentRunId = ++runId;
      this._filterAutoGrantedMcpAuthentication(opts.sessionResource, pendingAuth).then((servers) => {
        if (currentRunId !== runId) {
          return;
        }
        const surfaced = this._getSurfacedMcpAuthServers(opts.sessionResource);
        const newServers = servers.filter((server) => !surfaced.has(server.id));
        if (!newServers.length && (!part || part.isUsed)) {
          return;
        }
        if (!part || part.isUsed) {
          ownedIds = /* @__PURE__ */ new Set();
          part = {
            kind: "mcpAuthenticationRequired",
            sessionResource: opts.sessionResource.toJSON(),
            isUsed: false,
            servers: observableValue("mcpAuthNeededServers", [])
          };
          opts.sink([part]);
        }
        for (const server of newServers) {
          surfaced.add(server.id);
          ownedIds.add(server.id);
        }
        part.servers.set(servers.filter((server) => ownedIds.has(server.id)), void 0);
      });
    }));
  }
  /**
   * Returns the mutable set of MCP server ids already surfaced for
   * authentication in the given session, creating it on first use.
   */
  _getSurfacedMcpAuthServers(sessionResource) {
    let surfaced = this._surfacedMcpAuthServers.get(sessionResource);
    if (!surfaced) {
      surfaced = /* @__PURE__ */ new Set();
      this._surfacedMcpAuthServers.set(sessionResource, surfaced);
    }
    return surfaced;
  }
  /**
   * Prunes servers that reached the running ({@link McpServerStatus.Ready})
   * state from every session's {@link _surfacedMcpAuthServers surfaced set} so
   * a subsequent auth requirement surfaces a fresh prompt instead of being
   * suppressed. Only the running state counts as actioned — a server that
   * merely left {@link McpServerStatus.AuthRequired} for an error/stopped
   * state was not authenticated and stays suppressed.
   */
  _reconcileSurfacedMcpAuthServers() {
    for (const [sessionResource, surfaced] of this._surfacedMcpAuthServers) {
      if (surfaced.size === 0) {
        continue;
      }
      const ready = new Set(this._customizationService.getMcpServers(sessionResource).filter((server) => server.status === McpServerStatus.Ready).map((server) => server.id));
      for (const id of surfaced) {
        if (ready.has(id)) {
          surfaced.delete(id);
        }
      }
    }
  }
  async _filterAutoGrantedMcpAuthentication(sessionResource, servers) {
    const remaining = [];
    for (const server of servers) {
      if (!await this._autoAuthenticateMcpServer(sessionResource, server)) {
        remaining.push(server);
      }
    }
    return remaining;
  }
  async _autoAuthenticateMcpServer(sessionResource, server) {
    const key = JSON.stringify([
      agentHostMcpServerId(sessionResource.authority, server.name, server.resource),
      [...server.requiredScopes ?? []].sort(),
      server.oauthClient?.clientId
    ]);
    const pending = this._pendingMcpAutoAuthentication.get(key);
    if (pending) {
      return pending;
    }
    const operation = this._instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: server.resource,
      resource_name: server.name,
      authorization_servers: server.authorizationServers ? [...server.authorizationServers] : void 0,
      scopes_supported: server.supportedScopes ? [...server.supportedScopes] : void 0
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: agentHostMcpServerId(sessionResource.authority, server.name, server.resource),
      mcpServerName: server.name,
      mcpServerUrl: server.resource,
      oauthClient: server.oauthClient,
      scopes: server.requiredScopes ?? [],
      agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
      authenticate: (request) => this._config.connection.authenticate(request)
    }).catch((err) => {
      this._logService.error(`[AgentHost] Failed to auto-authenticate MCP server '${server.name}'`, err);
      return false;
    });
    this._pendingMcpAutoAuthentication.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this._pendingMcpAutoAuthentication.get(key) === operation) {
        this._pendingMcpAutoAuthentication.delete(key);
      }
    }
  }
  _setupMarkdownPart(part$, store, opts) {
    let lastEmitted = opts.seedEmittedLengths?.get(part$.get().id) ?? 0;
    store.add(autorun((reader) => {
      const content = part$.read(reader).content;
      if (content.length <= lastEmitted) {
        return;
      }
      const delta = content.substring(lastEmitted);
      lastEmitted = content.length;
      opts.sink([{ kind: "markdownContent", content: new MarkdownString(delta) }]);
    }));
  }
  _setupReasoningPart(part$, store, opts) {
    const partId = part$.get().id;
    let lastEmitted = opts.seedEmittedLengths?.get(partId) ?? 0;
    store.add(autorun((reader) => {
      const content = part$.read(reader).content;
      if (content.length <= lastEmitted) {
        return;
      }
      const delta = content.substring(lastEmitted);
      lastEmitted = content.length;
      opts.sink([{ kind: "thinking", value: delta, id: partId }]);
    }));
  }
  _setupToolCallPart(part$, store, opts, subagentContext) {
    const initial = part$.get().toolCall;
    const contributor = initial.contributor;
    if (contributor?.kind === ToolCallContributorKind.Client && contributor.clientId === this._config.connection.clientId) {
      this._setupClientToolCall(initial, part$, store, opts, subagentContext);
    } else if (contributor?.kind === ToolCallContributorKind.Client) {
      this._setupOtherClientToolCall(initial, part$, store, opts);
    } else {
      this._setupServerToolCall(initial, part$, store, opts, subagentContext);
    }
  }
  _setupOtherClientToolCall(initial, part$, store, opts) {
    const toolCallId = initial.toolCallId;
    const adopted = opts.adoptInvocations?.get(toolCallId);
    const invocation = adopted ?? toolCallStateToInvocation(
      initial,
      opts.subAgentInvocationId,
      opts.backendSession,
      this._config.connectionAuthority,
      opts.sessionResource.authority,
      this._otherClientToolInvocationOptions(opts.backendSession, opts.chatURI, opts.turnId)
    );
    if (!adopted) {
      opts.sink([invocation]);
    }
    store.add(autorun((reader) => {
      const toolCall = part$.read(reader).toolCall;
      if ((toolCall.status === ToolCallStatus.Completed || toolCall.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
        const fileEdits = finalizeToolInvocation(invocation, toolCall, opts.backendSession, this._config.connectionAuthority);
        if (fileEdits.length > 0) {
          opts.onFileEdits?.(toolCall, fileEdits);
        }
      }
    }));
    store.add(toDisposable(() => {
      if (!IChatToolInvocation.isComplete(invocation)) {
        invocation.didExecuteTool(void 0);
      }
    }));
  }
  _otherClientToolInvocationOptions(backendSession, chatURI, turnId) {
    return {
      currentClientId: this._config.connection.clientId,
      cancelOtherClientToolCall: (toolCall) => {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatToolCallComplete,
          turnId,
          toolCallId: toolCall.toolCallId,
          result: {
            success: false,
            pastTenseMessage: localize("agentHost.otherClientTool.skipped", "Skipped {0}", toolCall.displayName),
            error: {
              message: localize("agentHost.otherClientTool.skippedError", "{0} was skipped from another client", toolCall.displayName),
              code: "cancelled"
            }
          }
        }, chatURI);
      }
    };
  }
  /**
   * Per-call setup for a server-driven tool. Adopts a snapshot
   * {@link ChatToolInvocation} when present (reconnect parity); otherwise
   * emits a fresh one. Reacts to status transitions for re-confirmation,
   * terminal revival, finalization, and subagent observation.
   */
  _setupServerToolCall(initial, part$, store, opts, subagentContext) {
    const toolCallId = initial.toolCallId;
    const subAgentInvocationId = opts.subAgentInvocationId;
    const adopted = opts.adoptInvocations?.get(toolCallId);
    let confirmationOptions = initial.status === ToolCallStatus.PendingConfirmation ? initial.options : void 0;
    let invocation;
    if (adopted) {
      invocation = adopted;
    } else if (initial.status === ToolCallStatus.Streaming) {
      invocation = toolCallStateToStreamingInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
      opts.sink([invocation]);
    } else {
      invocation = toolCallStateToInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
      opts.sink([invocation]);
    }
    if (initial.status === ToolCallStatus.PendingConfirmation && !IChatToolInvocation.isComplete(invocation)) {
      this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, () => confirmationOptions, opts.chatURI);
    }
    this._tryObserveSubagentToolCall(initial, invocation, store, opts, subagentContext);
    const outputTerminalAttachment = {
      disposable: store.add(new MutableDisposable())
    };
    let previousStatus = initial.status;
    store.add(autorun((reader) => {
      const tc = part$.read(reader).toolCall;
      const status = tc.status;
      const priorStatus = previousStatus;
      if (status === ToolCallStatus.PendingConfirmation) {
        confirmationOptions = tc.options;
      }
      const enteringConfirmation = status === ToolCallStatus.PendingConfirmation && previousStatus !== ToolCallStatus.PendingConfirmation;
      previousStatus = status;
      if (status === ToolCallStatus.Streaming) {
        updateStreamingToolInvocation(invocation, tc, this._config.connectionAuthority);
      } else if (enteringConfirmation) {
        if (!IChatToolInvocation.isComplete(invocation)) {
          const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
          invocation.requestConfirmation(prepared);
          this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, () => confirmationOptions, opts.chatURI);
        }
      } else if (status === ToolCallStatus.PendingConfirmation) {
        invocation.updateConfirmationMessages(toolCallConfirmationMessages(tc, this._config.connectionAuthority));
      } else if (status === ToolCallStatus.AuthRequired) {
        this._ensureLeftStreaming(invocation, tc, opts);
        invocation.setAuthenticationRequired(toolCallAuthenticationServer(tc, opts.sessionResource.authority), () => {
          this._dispatchAction(opts.backendSession, {
            type: ActionType.ChatToolCallComplete,
            turnId: opts.turnId,
            toolCallId,
            result: {
              success: false,
              pastTenseMessage: localize("agentHost.mcpToolAuthentication.cancelled", "Cancelled tool call"),
              error: { message: localize("agentHost.mcpToolAuthentication.cancelledError", "MCP authentication was cancelled"), code: "cancelled" }
            }
          }, opts.chatURI);
        });
      } else if (status === ToolCallStatus.Running || status === ToolCallStatus.PendingResultConfirmation) {
        if (priorStatus === ToolCallStatus.AuthRequired) {
          invocation.setAuthenticationResolved();
        }
        this._ensureLeftStreaming(invocation, tc, opts);
        invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, this._config.connectionAuthority);
        this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession, outputTerminalAttachment);
        updateRunningToolSpecificData(invocation, tc, opts.backendSession, this._config.connectionAuthority);
      }
      this._tryObserveSubagentToolCall(tc, invocation, store, opts, subagentContext);
      if ((status === ToolCallStatus.Completed || status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
        if (status === ToolCallStatus.Completed) {
          this._ensureLeftStreaming(invocation, tc, opts);
        }
        this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession, outputTerminalAttachment);
        const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority);
        if (fileEdits.length > 0) {
          opts.onFileEdits?.(tc, fileEdits);
        }
      }
    }));
    store.add(toDisposable(() => {
      if (!IChatToolInvocation.isComplete(invocation)) {
        invocation.didExecuteTool(void 0);
      }
    }));
  }
  /** Transitions an invocation from streaming once its AHP tool call is ready. */
  _ensureLeftStreaming(invocation, tc, opts) {
    if (invocation.state.read(void 0).type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
    invocation.transitionFromStreaming(prepared, void 0, void 0);
  }
  /**
   * Observes the child chat for any subagent-spawning tool, including client-provided delegated tasks.
   */
  _tryObserveSubagentToolCall(toolCall, invocation, store, opts, subagentContext) {
    const toolCallId = toolCall.toolCallId;
    const hasSubagentContent = (toolCall.status === ToolCallStatus.Running || toolCall.status === ToolCallStatus.Completed) && !!getToolSubagentContent(toolCall);
    if (!isSubagentTool(toolCall) && !hasSubagentContent) {
      return;
    }
    const isObserved = subagentContext.observedToolIds.has(toolCallId);
    const currentData = invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData : void 0;
    const prepared = toolCallStateToPreparedInvocation(toolCall, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
    const protocolData = prepared.toolSpecificData?.kind === "subagent" ? prepared.toolSpecificData : void 0;
    if (!protocolData) {
      return;
    }
    const chatResource = protocolData.chatResource ?? currentData?.chatResource;
    const description = protocolData.description ?? currentData?.description;
    const agentName = protocolData.agentName ?? currentData?.agentName;
    if (!currentData || currentData.chatResource !== chatResource || currentData.description !== description || currentData.agentName !== agentName) {
      invocation.toolSpecificData = {
        ...currentData,
        ...protocolData,
        chatResource,
        description,
        agentName,
        isActive: currentData?.isActive ?? isObserved
      };
      invocation.notifyToolSpecificDataChanged();
    }
    if (isObserved) {
      return;
    }
    if (toolCall.status !== ToolCallStatus.Running && toolCall.status !== ToolCallStatus.Completed) {
      return;
    }
    const subagentData = invocation.toolSpecificData;
    if (subagentData?.kind !== "subagent") {
      return;
    }
    subagentContext.observedToolIds.add(toolCallId);
    subagentData.isActive = true;
    invocation.notifyToolSpecificDataChanged();
    const perInvocationCredits = observableValue("subagentInvocationCredits", 0);
    store.add(autorun((reader) => {
      const total = perInvocationCredits.read(reader);
      if (total > 0 && invocation.toolSpecificData?.kind === "subagent" && invocation.toolSpecificData.credits !== total) {
        invocation.toolSpecificData.credits = total;
        invocation.notifyToolSpecificDataChanged();
      }
    }));
    const perInvocationModel = observableValue("subagentInvocationModel", void 0);
    store.add(autorun((reader) => {
      const modelName = perInvocationModel.read(reader);
      if (modelName && invocation.toolSpecificData?.kind === "subagent" && invocation.toolSpecificData.modelName !== modelName) {
        invocation.toolSpecificData.modelName = modelName;
        invocation.notifyToolSpecificDataChanged();
      }
    }));
    const rootInvocationId = opts.subAgentInvocationId ?? toolCallId;
    const childChatUri = subagentData.chatResource || buildSubagentChatUri(opts.backendSession.toString(), toolCallId);
    this._observeSubagentSession(opts.sessionResource, opts.backendSession, toolCallId, childChatUri, rootInvocationId, invocation, opts.sink, store, subagentContext, perInvocationCredits, perInvocationModel);
  }
  /**
   * Per-call setup for a client-provided tool. Eagerly creates a streaming
   * {@link ChatToolInvocation} so the UI has a handle, then invokes the
   * tool once parameters are available. The inner autorun on `part$` is
   * idempotent: `invoked` ensures `invokeTool` runs at most once,
   * `confirmationDispatched` ensures `ChatToolCallConfirmed` is sent at
   * most once.
   */
  _setupClientToolCall(initial, part$, store, opts, subagentContext) {
    const toolCallId = initial.toolCallId;
    const toolName = initial.toolName;
    const adopted = opts.adoptInvocations?.get(toolCallId);
    if (adopted && !IChatToolInvocation.isComplete(adopted)) {
      adopted.didExecuteTool(void 0);
    }
    const clientToolName = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? CLIENT_TOOL_SEARCH_REFERENCE_NAME : toolName;
    const toolData = this._toolsService.getToolByName(clientToolName);
    if (!toolData) {
      this._logService.warn(`[AgentHost] Client tool call for unknown tool: ${toolName}`);
      this._dispatchAction(opts.backendSession, {
        type: ActionType.ChatToolCallComplete,
        turnId: opts.turnId,
        toolCallId,
        result: {
          success: false,
          pastTenseMessage: `Tool "${toolName}" is not available`,
          error: { message: `Tool "${toolName}" is not available on this client` }
        }
      }, opts.chatURI);
      return;
    }
    const invocation = this._toolsService.beginToolCall({
      toolCallId,
      toolId: toolData.id,
      subagentInvocationId: opts.subAgentInvocationId,
      sessionResource: opts.sessionResource,
      force: true
    });
    if (!invocation) {
      this._logService.warn(`[AgentHost] Failed to begin client tool invocation: ${toolName}`);
      this._dispatchAction(opts.backendSession, {
        type: ActionType.ChatToolCallComplete,
        turnId: opts.turnId,
        toolCallId,
        result: {
          success: false,
          pastTenseMessage: `Failed to start ${toolName}`,
          error: { message: `Could not create invocation for client tool "${toolName}"` }
        }
      }, opts.chatURI);
      return;
    }
    if (isSubagentTool(initial)) {
      const prepared = toolCallStateToPreparedInvocation(initial, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
      if (prepared.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData = prepared.toolSpecificData;
      }
    }
    this._tryObserveSubagentToolCall(initial, invocation, store, opts, subagentContext);
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    let invoked = false;
    let approvedDispatched = false;
    let confirmationDispatched = false;
    store.add(autorun((reader) => {
      const state = invocation.state.read(reader);
      const tc = part$.read(reader).toolCall;
      const preApproval = getClientToolPreApproval(tc);
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && preApproval) {
        state.confirm(preApproval);
        return;
      }
      if (confirmationDispatched) {
        return;
      }
      if (state.type === IChatToolInvocation.StateKind.Executing) {
        confirmationDispatched = true;
        if (cts.token.isCancellationRequested) {
          return;
        }
        approvedDispatched = true;
        this._dispatchAction(opts.backendSession, {
          type: ActionType.ChatToolCallConfirmed,
          turnId: opts.turnId,
          toolCallId,
          approved: true,
          confirmed: confirmedReasonToProtocol(state.confirmed)
        }, opts.chatURI);
      } else if (state.type === IChatToolInvocation.StateKind.Cancelled) {
        confirmationDispatched = true;
        if (cts.token.isCancellationRequested) {
          return;
        }
        this._dispatchAction(opts.backendSession, {
          type: ActionType.ChatToolCallConfirmed,
          turnId: opts.turnId,
          toolCallId,
          approved: false,
          reason: ToolCallCancellationReason.Denied
        }, opts.chatURI);
      }
    }));
    const handleSettled = (result, err) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (err !== void 0) {
        if (!isCancellationError(err)) {
          if (!approvedDispatched) {
            this._logService.warn(`[AgentHost] Client tool rejected pre-execution: ${toolName}`, err);
          } else {
            this._logService.warn(`[AgentHost] Client tool invocation failed: ${toolName}`, err);
          }
        }
        result = { content: [], toolResultError: err instanceof Error ? err.message : String(err) };
      }
      const protocolToolCall = part$.get().toolCall;
      const isProtocolToolCallComplete = protocolToolCall.status === ToolCallStatus.Completed || protocolToolCall.status === ToolCallStatus.Cancelled;
      if (!isProtocolToolCallComplete) {
        const clearedMeta = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? metaWithoutToolSearchCandidates(protocolToolCall) : void 0;
        this._dispatchAction(opts.backendSession, {
          type: ActionType.ChatToolCallComplete,
          turnId: opts.turnId,
          toolCallId,
          result: toolResultToProtocol(result ?? { content: [] }, toolName),
          ...clearedMeta !== void 0 ? { _meta: clearedMeta } : {}
        }, opts.chatURI);
      }
    };
    store.add(autorun((reader) => {
      const tc = part$.read(reader).toolCall;
      const state = invocation.state.read(reader);
      this._tryObserveSubagentToolCall(tc, invocation, store, opts, subagentContext);
      const preApproval = getClientToolPreApproval(tc);
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && preApproval) {
        state.confirm(preApproval);
      }
      if (tc.status === ToolCallStatus.Cancelled || tc.status === ToolCallStatus.Completed) {
        if (state.type === IChatToolInvocation.StateKind.Streaming) {
          const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority);
          if (fileEdits.length > 0) {
            opts.onFileEdits?.(tc, fileEdits);
          }
        }
        if (cts.token.isCancellationRequested) {
          return;
        }
        cts.cancel();
        if (!invoked && tc.status === ToolCallStatus.Cancelled && state.type !== IChatToolInvocation.StateKind.Streaming) {
          invocation.cancelFromStreaming(ToolConfirmKind.Skipped);
        }
        return;
      }
      if (invoked || cts.token.isCancellationRequested) {
        return;
      }
      const toolSearchCandidates = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? readToolCallMeta(tc).toolSearchCandidates : void 0;
      if (toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME && toolSearchCandidates === void 0) {
        return;
      }
      let toolInput = "toolInput" in tc ? tc.toolInput : void 0;
      if (toolInput === void 0) {
        if (tc.status === ToolCallStatus.Streaming) {
          return;
        }
        toolInput = "{}";
      }
      invoked = true;
      let parameters = {};
      try {
        const parsed = JSON.parse(toolInput);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("expected JSON object");
        }
        parameters = parsed;
      } catch {
        this._logService.warn(`[AgentHost] Failed to parse tool input for ${toolName}`);
        const clearedMeta = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? metaWithoutToolSearchCandidates(tc) : void 0;
        this._dispatchAction(opts.backendSession, {
          type: ActionType.ChatToolCallComplete,
          turnId: opts.turnId,
          toolCallId,
          result: {
            success: false,
            pastTenseMessage: `Failed to execute ${toolName}`,
            error: { message: `Invalid tool input for "${toolName}": expected JSON object parameters` }
          },
          ...clearedMeta !== void 0 ? { _meta: clearedMeta } : {}
        }, opts.chatURI);
        return;
      }
      if (toolSearchCandidates !== void 0) {
        parameters = { ...parameters, candidateTools: toolSearchCandidates };
      }
      const inv = {
        callId: toolCallId,
        toolId: invocation.toolId,
        parameters,
        context: { sessionResource: opts.sessionResource },
        chatStreamToolCallId: toolCallId,
        // If the agent host already resolved auto-approval for this call,
        // pass it through so the invocation transitions straight to
        // executing instead of briefly flashing a confirmation prompt
        // (which would flicker "needs input" in the sessions list).
        preApproved: getClientToolPreApproval(tc)
      };
      const noOpCountTokens = async () => 0;
      this._logService.info(`[AgentHost] Invoking client tool: ${toolName} (callId=${toolCallId})`);
      this._toolsService.invokeTool(inv, noOpCountTokens, cts.token).then(
        (result) => handleSettled(result, void 0),
        (err) => handleSettled(void 0, err)
      );
    }));
  }
  _setupInputRequestPart(part$, store, opts) {
    const inputReq = part$.get().request;
    const planReview = inputReq.planReview;
    if (planReview) {
      this._setupPlanReviewInputRequest(part$, planReview, store, opts);
      return;
    }
    if (inputReq.url) {
      this._setupUrlInputRequest(part$, inputReq.url, store, opts);
      return;
    }
    const carousel = createInputRequestCarousel(inputReq, this._config.connectionAuthority);
    opts.sink([carousel]);
    let completedFromServer = false;
    store.add(autorun((reader) => {
      const part = part$.read(reader);
      if (part.response === void 0) {
        return;
      }
      completedFromServer = true;
      const protocolAnswers = part.response === ChatInputResponseKind.Accept ? part.request.answers : void 0;
      const carouselAnswers = convertProtocolAnswers(protocolAnswers);
      const wasUsed = carousel.isUsed;
      carousel.data = carouselAnswers ?? {};
      carousel.isUsed = true;
      carousel.answeredExternally = part.response === ChatInputResponseKind.Accept && !carouselAnswers;
      carousel.autoReply = containsAutomaticReplyAnswer(protocolAnswers);
      carousel.answeredExternally ||= carousel.autoReply;
      carousel.draftAnswers = void 0;
      carousel.draftCurrentIndex = void 0;
      carousel.draftCollapsed = void 0;
      carousel.completion.complete({ answers: carouselAnswers });
      if (!wasUsed) {
        this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(void 0, inputReq.id);
      }
    }));
    carousel.completion.p.then((result) => {
      if (store.isDisposed || completedFromServer) {
        return;
      }
      if (!result.answers) {
        this._config.connection.dispatch(opts.chatURI, {
          type: ActionType.ChatInputCompleted,
          requestId: inputReq.id,
          response: ChatInputResponseKind.Cancel
        });
      } else {
        const answers = convertCarouselAnswers(result.answers, inputReq.questions);
        this._config.connection.dispatch(opts.chatURI, {
          type: ActionType.ChatInputCompleted,
          requestId: inputReq.id,
          response: ChatInputResponseKind.Accept,
          answers
        });
      }
    });
    if (opts.cancellationToken.isCancellationRequested) {
      carousel.completion.complete({ answers: void 0 });
    } else {
      const tokenListener = opts.cancellationToken.onCancellationRequested(() => {
        carousel.completion.complete({ answers: void 0 });
      });
      carousel.completion.p.finally(() => tokenListener.dispose());
    }
    store.add(toDisposable(() => {
      if (carousel.isUsed) {
        return;
      }
      carousel.data = {};
      carousel.isUsed = true;
      carousel.draftAnswers = void 0;
      carousel.draftCurrentIndex = void 0;
      carousel.draftCollapsed = void 0;
      carousel.completion.complete({ answers: void 0 });
      this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(void 0, inputReq.id);
    }));
  }
  _setupPlanReviewInputRequest(part$, planReview, store, opts) {
    const inputReq = part$.get().request;
    const review = createInputRequestPlanReview(inputReq, planReview);
    opts.sink([review]);
    let inputCompleted = false;
    let latestResult = convertProtocolPlanReviewResult(planReview, ChatInputResponseKind.Accept, inputReq.answers);
    let planReviewCleared = false;
    const clearPlanReview = () => {
      if (planReviewCleared) {
        return;
      }
      planReviewCleared = true;
      this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearPlanReview(void 0, inputReq.id);
    };
    store.add(autorun((reader) => {
      const part = part$.read(reader);
      if (part.response === void 0) {
        return;
      }
      inputCompleted = true;
      latestResult = convertProtocolPlanReviewResult(planReview, part.response, part.request.answers);
      review.data = latestResult;
      review.isUsed = true;
      review.draftFeedback = void 0;
      review.draftCollapsed = void 0;
      void review.completion.complete(latestResult);
      clearPlanReview();
    }));
    review.completion.p.then((result) => {
      if (store.isDisposed || inputCompleted) {
        return;
      }
      const completion = result ? convertPlanReviewResult(planReview, result) : { response: ChatInputResponseKind.Cancel };
      this._config.connection.dispatch(opts.chatURI, {
        type: ActionType.ChatInputCompleted,
        requestId: inputReq.id,
        ...completion
      });
    });
    if (opts.cancellationToken.isCancellationRequested) {
      review.dismiss();
    } else {
      const tokenListener = opts.cancellationToken.onCancellationRequested(() => review.dismiss());
      review.completion.p.finally(() => tokenListener.dispose());
    }
    store.add(toDisposable(() => {
      if (!review.isUsed) {
        if (inputCompleted) {
          review.data = latestResult;
          review.isUsed = true;
          review.draftFeedback = void 0;
          review.draftCollapsed = void 0;
          void review.completion.complete(latestResult);
        } else {
          review.dismiss();
        }
      }
      clearPlanReview();
    }));
  }
  /**
   * Handle a URL-style {@link ChatInputRequest} by rendering a
   * {@link ChatElicitationRequestPart} that prompts the user to open the
   * URL. Clicking the accept button opens the URL via {@link IOpenerService}
   * and dispatches `ChatInputCompleted` with `Accept`; reject dispatches
   * `Decline`; abandonment / cancellation dispatches `Cancel`.
   */
  _setupUrlInputRequest(responsePart$, url, store, opts) {
    const inputReq = responsePart$.get().request;
    let completionDispatched = false;
    let completedFromServer = false;
    const settle = (response) => {
      if (completionDispatched || completedFromServer) {
        return;
      }
      completionDispatched = true;
      this._config.connection.dispatch(opts.chatURI, {
        type: ActionType.ChatInputCompleted,
        requestId: inputReq.id,
        response
      });
    };
    const presentation = getUrlInputRequestPresentation(inputReq, url);
    const part = new ChatElicitationRequestPart(
      localize("agentHost.elicit.url.title", "Authorization Required"),
      presentation.message,
      "",
      localize("agentHost.elicit.url.open", "Open {0}", presentation.authority),
      localize("agentHost.elicit.url.cancel", "Cancel"),
      async () => {
        try {
          const opened = await this._openerService.open(url, { allowCommands: false });
          if (opened) {
            settle(ChatInputResponseKind.Accept);
            return ElicitationState.Accepted;
          }
          settle(ChatInputResponseKind.Decline);
          return ElicitationState.Rejected;
        } catch {
          settle(ChatInputResponseKind.Decline);
          return ElicitationState.Rejected;
        }
      },
      async () => {
        settle(ChatInputResponseKind.Decline);
        return ElicitationState.Rejected;
      }
    );
    opts.sink([part]);
    store.add(autorun((reader) => {
      const response = responsePart$.read(reader).response;
      if (response === void 0) {
        return;
      }
      completedFromServer = true;
      part.state.set(response === ChatInputResponseKind.Accept ? ElicitationState.Accepted : ElicitationState.Rejected, void 0);
      part.hide();
    }));
    if (opts.cancellationToken.isCancellationRequested) {
      settle(ChatInputResponseKind.Cancel);
      part.hide();
    } else {
      const tokenListener = opts.cancellationToken.onCancellationRequested(() => {
        settle(ChatInputResponseKind.Cancel);
        part.hide();
      });
      store.add(toDisposable(() => tokenListener.dispose()));
    }
    store.add(toDisposable(() => {
      settle(ChatInputResponseKind.Cancel);
      part.hide();
    }));
  }
  /**
   * Synchronizes PTY and non-PTY terminal content, including the live-to-retained output handoff, and updates invocation metadata.
   */
  _reviveTerminalIfNeeded(invocation, tc, backendSession, outputTerminalAttachment) {
    if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.PendingResultConfirmation) {
      return;
    }
    const terminalContent = getTerminalContent(tc.content);
    const terminalUri = terminalContent?.resource;
    if (!terminalContent || !terminalUri || !tc.toolInput) {
      return;
    }
    invocation.presentation = void 0;
    const toolInput = tc.toolInput;
    const sessionId = makeAhpTerminalToolSessionId(terminalUri, backendSession);
    const terminalCommandUri = URI.parse(terminalUri);
    const isPty = terminalContent.isPty !== false;
    const terminalInstance = isPty ? this._ensureTerminalInstance(terminalUri, sessionId) : void 0;
    const hasRetainedNonPtySnapshot = tc.status === ToolCallStatus.Completed && !isPty && terminalContent.result?.exitCode !== void 0 && terminalContent.result.preview !== void 0;
    if (hasRetainedNonPtySnapshot) {
      outputTerminalAttachment.disposable.clear();
      outputTerminalAttachment.sessionId = void 0;
    } else if (!isPty && outputTerminalAttachment.sessionId !== sessionId) {
      outputTerminalAttachment.disposable.value = this._agentHostTerminalService.attachOutputTerminal(this._config.connection, terminalCommandUri, sessionId);
      outputTerminalAttachment.sessionId = sessionId;
    }
    const existing = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
    const identityChanged = !!existing && (existing.commandLine.original !== toolInput || existing.terminalToolSessionId !== sessionId || existing.terminalCommandUri?.toString() !== terminalCommandUri.toString());
    if (!existing || identityChanged) {
      invocation.toolSpecificData = {
        ...existing,
        kind: "terminal",
        commandLine: { original: toolInput },
        language: "shellscript",
        terminalToolSessionId: sessionId,
        terminalCommandUri,
        isPty,
        terminalCommandId: identityChanged ? void 0 : existing?.terminalCommandId,
        terminalCommandOutput: identityChanged ? void 0 : existing?.terminalCommandOutput,
        terminalCommandState: identityChanged ? void 0 : existing?.terminalCommandState,
        terminalTheme: identityChanged ? void 0 : existing?.terminalTheme
      };
      invocation.notifyToolSpecificDataChanged();
    }
    const current = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
    if (!terminalInstance || current?.terminalCommandId) {
      if (terminalInstance) {
        void terminalInstance.catch((error) => this._logService.error(`[AgentHost] Failed to revive terminal '${terminalUri}'`, error));
      }
      return;
    }
    void terminalInstance.then(() => {
      const current2 = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
      if (!current2 || current2.terminalToolSessionId !== sessionId || current2.terminalCommandId) {
        return;
      }
      const source = this._terminalChatService.getAhpCommandSource(sessionId);
      const command = source?.executingCommandObject ?? source?.commands[source.commands.length - 1];
      if (command?.id) {
        invocation.toolSpecificData = { ...current2, terminalCommandId: command.id };
        invocation.notifyToolSpecificDataChanged();
      }
    }, (error) => this._logService.error(`[AgentHost] Failed to revive terminal '${terminalUri}'`, error));
  }
  // ---- Subagent child session observation ---------------------------------
  /**
   * Enriches serialized history with inner tool calls from subagent child
   * sessions. For each subagent tool call found in the history, subscribes
   * to the corresponding child session and appends its inner tool calls
   * (with `subAgentInvocationId` set) to the response parts.
   */
  async _enrichHistoryWithSubagentCalls(history, parentSession, sessionResource, sessionState) {
    const parentSessionStr = parentSession.toString();
    const subagentChats = new Map(sessionState.chats.flatMap(
      (chat) => chat.origin?.kind === ChatOriginKind.Tool ? [[chat.origin.toolCallId, chat]] : []
    ));
    const subagentInsertions = [];
    for (const item of history) {
      if (item.type !== "response") {
        continue;
      }
      for (let i = 0; i < item.parts.length; i++) {
        const part = item.parts[i];
        if (part.kind !== "toolInvocationSerialized") {
          continue;
        }
        const subagentChat = subagentChats.get(part.toolCallId);
        if (subagentChat) {
          const existing = part.toolSpecificData?.kind === "subagent" ? part.toolSpecificData : void 0;
          part.toolSpecificData = {
            ...existing,
            kind: "subagent",
            description: subagentChat.title || existing?.description || (typeof part.invocationMessage === "string" ? part.invocationMessage : part.invocationMessage.value),
            chatResource: subagentChat.resource.toString()
          };
        }
        if (part.toolSpecificData?.kind === "subagent") {
          const childChatUri = part.toolSpecificData.chatResource ?? subagentChat?.resource.toString() ?? buildSubagentChatUri(parentSessionStr, part.toolCallId);
          part.toolSpecificData.chatResource = childChatUri;
          subagentInsertions.push({ item, index: i, toolCallId: part.toolCallId, childChatUri });
        }
      }
    }
    if (subagentInsertions.length === 0) {
      return;
    }
    const childStateByUri = /* @__PURE__ */ new Map();
    const getChildState = (childChatUri) => {
      let existing = childStateByUri.get(childChatUri);
      if (!existing) {
        existing = this._loadSubagentState(parentSessionStr, childChatUri);
        childStateByUri.set(childChatUri, existing);
      }
      return existing;
    };
    const enrichedInsertions = await Promise.all(subagentInsertions.map(async ({ item, index, toolCallId, childChatUri }) => {
      try {
        const childState = await getChildState(childChatUri);
        if (childState) {
          this._applySubagentUsageToHistoryPart(item.parts[index], sessionResource, childState);
        }
        return { item, index, innerParts: childState ? this._getSubagentInnerParts(childChatUri, toolCallId, childState) : [] };
      } catch (err) {
        this._logService.warn(`[AgentHost] Failed to enrich history with subagent calls: ${childChatUri}`, err);
        return { item, index, innerParts: [] };
      }
    }));
    for (const { item, index, innerParts } of enrichedInsertions.sort((a, b) => b.index - a.index)) {
      if (innerParts.length > 0) {
        item.parts.splice(index + 1, 0, ...innerParts);
      }
    }
  }
  async _loadSubagentState(parentSessionUri, childChatUri) {
    const childSub = this._ensureSessionSubscription(parentSessionUri);
    try {
      await this._whenSubscriptionHydrated(childSub, CancellationToken.None);
      if (childSub.value instanceof Error) {
        throw childSub.value;
      }
      const childChatSub = this._ensureChatSubscription(parentSessionUri, childChatUri);
      await this._whenSubscriptionHydrated(childChatSub, CancellationToken.None);
      if (childChatSub.value instanceof Error) {
        throw childChatSub.value;
      }
      return this._getSessionState(parentSessionUri, childChatUri);
    } finally {
      this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri);
    }
  }
  /**
   * Writes a subagent's accumulated cost (AIC) and model — summed across its
   * child session's turns — onto its serialized subagent tool call so the
   * hover survives a reload. Mirrors the live observers in
   * {@link _setupServerToolCall}.
   */
  _applySubagentUsageToHistoryPart(part, sessionResource, childState) {
    if (part.kind !== "toolInvocationSerialized" || part.toolSpecificData?.kind !== "subagent") {
      return;
    }
    let credits = 0;
    let modelName;
    for (const turn of childState.turns) {
      const turnCredits = usageInfoToChatUsage(turn.usage)?.copilotCredits;
      if (typeof turnCredits === "number") {
        credits += turnCredits;
      }
      const turnModelId = this._toLanguageModelId(sessionResource, turn.usage?.model);
      const turnModelName = this._getLanguageModelDisplayName(turnModelId);
      if (turnModelName) {
        modelName = turnModelName;
      }
    }
    if (credits > 0) {
      part.toolSpecificData.credits = credits;
    }
    if (modelName && !part.toolSpecificData.modelName) {
      part.toolSpecificData.modelName = modelName;
    }
    const timing = getSubagentTiming(childState);
    part.toolSpecificData.startedAt = timing.startedAt;
    part.toolSpecificData.duration = timing.duration;
  }
  _getSubagentInnerParts(childSessionUri, toolCallId, childState) {
    const innerParts = [];
    for (const turn of childState.turns) {
      for (const rp of turn.responseParts) {
        if (rp.kind === ResponsePartKind.ToolCall) {
          const tc = rp.toolCall;
          if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
            const completedTc = tc;
            const fileEditParts = completedToolCallToEditParts(completedTc, this._config.connectionAuthority);
            const serialized = completedToolCallToSerialized(completedTc, toolCallId, URI.parse(childSessionUri), this._config.connectionAuthority);
            if (fileEditParts.length > 0) {
              serialized.presentation = ToolInvocationPresentation.Hidden;
            }
            innerParts.push(serialized);
            innerParts.push(...fileEditParts);
          }
        }
      }
    }
    return innerParts;
  }
  /**
   * Subscribes to a child subagent session and forwards its tool calls
   * as progress parts into the parent session's response, with
   * `subAgentInvocationId` set so the renderer groups them under the parent
   * subagent widget.
   *
   * Implementation: builds a per-turn-id keyed observation over the child
   * session's `turns` and `activeTurn`. Each turn id discovered gets its
   * own {@link _observeTurn} instance running in subagent mode (which skips
   * markdown/reasoning/input-request emission and tags tool calls with the
   * parent tool call id). Each per-turn observer self-disposes when its
   * turn reaches a terminal state; the outer observation is torn down when
   * the caller disposes `disposables`.
   */
  _observeSubagentSession(sessionResource, parentSession, parentToolCallId, childChatUri, rootInvocationId, parentInvocation, emitProgress, disposables, subagentContext, perInvocationCreditsAccumulator, perInvocationModel) {
    const parentSessionUri = parentSession.toString();
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => cts.dispose(true)));
    disposables.add(toDisposable(() => {
      if (parentInvocation.toolSpecificData?.kind === "subagent" && parentInvocation.toolSpecificData.isActive) {
        parentInvocation.toolSpecificData.isActive = false;
        parentInvocation.notifyToolSpecificDataChanged();
      }
    }));
    try {
      const childSub = this._ensureSessionSubscription(parentSessionUri);
      const childChatSub = this._ensureChatSubscription(parentSessionUri, childChatUri);
      disposables.add(toDisposable(() => this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri)));
      const childSessionState$ = observableFromSubscription(this, childSub);
      const childChatState$ = observableFromSubscription(this, childChatSub);
      const childState$ = derived((reader) => {
        const session = childSessionState$.read(reader);
        if (!session) {
          return void 0;
        }
        return mergeSessionWithDefaultChat(session, childChatState$.read(reader));
      });
      disposables.add(autorun((reader) => {
        const state = childState$.read(reader);
        if (!state || !state.activeTurn && state.turns.length === 0) {
          return;
        }
        const isActive = !!state.activeTurn;
        if (parentInvocation.toolSpecificData?.kind === "subagent") {
          const timing = getSubagentTiming(state);
          const fallbackDuration = !isActive && timing.duration === void 0 && parentInvocation.toolSpecificData.isActive && parentInvocation.toolSpecificData.startedAt !== void 0 ? Date.now() - parentInvocation.toolSpecificData.startedAt : timing.duration;
          if (parentInvocation.toolSpecificData.isActive !== isActive || parentInvocation.toolSpecificData.startedAt !== timing.startedAt || parentInvocation.toolSpecificData.duration !== fallbackDuration) {
            parentInvocation.toolSpecificData.isActive = isActive;
            parentInvocation.toolSpecificData.startedAt = timing.startedAt;
            parentInvocation.toolSpecificData.duration = fallbackDuration;
            parentInvocation.notifyToolSpecificDataChanged();
          }
        }
      }));
      const childTurnIds$ = derived((reader) => {
        const state = childState$.read(reader);
        if (!state) {
          return [];
        }
        const ids = state.turns.map((t) => ({ id: t.id }));
        const activeId = state.activeTurn?.id;
        if (activeId !== void 0 && !state.turns.some((t) => t.id === activeId)) {
          ids.push({ id: activeId });
        }
        return ids;
      });
      disposables.add(autorunPerKeyedItem(
        childTurnIds$,
        (t) => t.id,
        (turnId, _t$, turnStore) => {
          turnStore.add(this._observeTurn({
            backendSession: parentSession,
            sessionResource,
            chatURI: childChatUri,
            turnId,
            sink: emitProgress,
            cancellationToken: cts.token,
            subAgentInvocationId: rootInvocationId,
            subAgentCreditsAccumulator: perInvocationCreditsAccumulator,
            subAgentModelObservable: perInvocationModel
          }));
        }
      ));
    } catch (err) {
      subagentContext.observedToolIds.delete(parentToolCallId);
      this._logService.warn(`[AgentHost] Failed to subscribe to subagent chat: ${childChatUri}`, err);
    }
  }
  // ---- Reconnection to active turn ----------------------------------------
  /**
   * Wires up an ongoing state listener that streams incremental progress
   * from an already-running turn into the chat session's progressObs.
   * This is the reconnection counterpart of {@link _handleTurn}, which
   * handles newly-initiated turns.
   */
  _reconnectToActiveTurn(backendSession, turnId, chatSession, initialProgress, initialResponsePartCount) {
    const sessionKey = backendSession.toString();
    const chatURI = this._getChatURI(chatSession.sessionResource);
    const adoptInvocations = /* @__PURE__ */ new Map();
    for (const item of initialProgress) {
      if (item instanceof ChatToolInvocation) {
        adoptInvocations.set(item.toolCallId, item);
      }
    }
    const seedEmittedLengths = /* @__PURE__ */ new Map();
    const currentState = this._getSessionState(sessionKey, chatURI);
    if (currentState?.activeTurn) {
      for (const rp of currentState.activeTurn.responseParts) {
        if (rp.kind === ResponsePartKind.Markdown || rp.kind === ResponsePartKind.Reasoning) {
          seedEmittedLengths.set(rp.id, rp.content.length);
        }
      }
    }
    const cts = new CancellationTokenSource();
    const reconnectStore = chatSession.registerDisposable(new DisposableStore());
    reconnectStore.add(toDisposable(() => cts.dispose(true)));
    reconnectStore.add(this._observeTurn({
      backendSession,
      sessionResource: chatSession.sessionResource,
      chatURI,
      turnId,
      sink: (parts) => chatSession.appendProgress(parts),
      cancellationToken: cts.token,
      adoptInvocations,
      seedEmittedLengths,
      initialResponsePartCount,
      onTurnEnded: () => {
        chatSession.complete();
        reconnectStore.dispose();
      }
    }));
  }
  // ---- File edit routing ---------------------------------------------------
  /**
   * Ensures the chat model has a snapshot controller bound (creating one
   * via our registered editing-session provider if needed) and returns it.
   * Hydrates the controller from any pending history turns on first access.
   */
  _ensureSnapshotController(sessionResource) {
    const chatModel = this._chatService.getSession(sessionResource);
    if (!chatModel) {
      return void 0;
    }
    if (!chatModel.editingSession) {
      chatModel.startEditingSession();
    }
    const editingSession = chatModel.editingSession;
    if (!(editingSession instanceof AgentHostSnapshotController)) {
      return void 0;
    }
    const pendingTurns = this._pendingHistoryTurns.get(sessionResource);
    if (pendingTurns) {
      this._pendingHistoryTurns.delete(sessionResource);
      for (const turn of pendingTurns) {
        editingSession.ensureRequestCheckpoint(turn.id);
        for (const rp of turn.responseParts) {
          if (rp.kind === ResponsePartKind.ToolCall) {
            editingSession.addToolCallEdits(turn.id, rp.toolCall);
          }
        }
      }
    }
    return editingSession;
  }
  /**
   * Records snapshot data for a completed tool call (so restore-snapshot
   * works) and returns the {@link IChatExternalEdit} progress parts to
   * render the per-file edit pills.
   */
  _hydrateFileEdits(sessionResource, requestId, tc) {
    const controller = this._ensureSnapshotController(sessionResource);
    controller?.addToolCallEdits(requestId, tc);
    if (tc.status !== ToolCallStatus.Completed) {
      return [];
    }
    return completedToolCallToEditParts(tc, this._config.connectionAuthority);
  }
  // ---- Session resolution -------------------------------------------------
  /**
   * Attaches to an existing server-side terminal via the agent host
   * terminal service and registers it with the terminal chat service.
   *
   * Returns the terminal instance created or reused by the terminal service.
   */
  _ensureTerminalInstance(terminalUri, terminalToolSessionId) {
    return this._agentHostTerminalService.reviveTerminal(
      this._config.connection,
      URI.parse(terminalUri),
      terminalToolSessionId
    );
  }
  /** Maps a UI session resource to a backend provider URI. */
  _resolveSessionUri(sessionResource) {
    const rawId = sessionResource.path.substring(1);
    return AgentSession.uri(this._config.backendSessionScheme ?? this._config.provider, rawId);
  }
  _isNewSessionResource(sessionResource) {
    return !!this._config.isNewSession?.(sessionResource) || this._workingDirectoryResolver.isNewSession(sessionResource);
  }
  /**
   * Forks a session at the given request point by creating a new backend
   * session with the `fork` parameter. Returns an {@link IChatSessionItem}
   * pointing to the newly created session.
   */
  async _forkSession(sessionResource, backendSession, request, token) {
    if (token.isCancellationRequested) {
      throw new Error("Cancelled");
    }
    const protocolState = this._getSessionState(backendSession.toString());
    let turnIndex;
    if (request) {
      const requestIdx = protocolState?.turns.findIndex((t) => t.id === request.id);
      if (requestIdx === void 0 || requestIdx < 0) {
        throw new Error(`Cannot fork: turn for request ${request.id} not found in protocol state`);
      }
      turnIndex = requestIdx - 1;
      if (turnIndex < 0) {
        throw new Error("Cannot fork: cannot fork before the first request");
      }
    } else if (protocolState?.turns.length) {
      turnIndex = protocolState.turns.length - 1;
    }
    if (turnIndex === void 0) {
      throw new Error("Cannot fork: no turns to fork from");
    }
    const turnId = protocolState.turns[turnIndex].id;
    const chatModel = this._chatService.getSession(sessionResource);
    const forkedSession = await this._createAndSubscribe(sessionResource, lastTurnModelSelection(protocolState), {
      session: backendSession,
      turnIndex,
      turnId
    });
    const forkedRawId = AgentSession.id(forkedSession);
    const forkedResource = URI.from({ scheme: this._config.sessionType, path: `/${forkedRawId}` });
    const now = Date.now();
    const forkedTitle = this._getSessionState(forkedSession.toString())?.title;
    const forkedLabel = forkedTitle || chatModel?.title || localize("agentHost.forkedSessionLabel", "Forked Session");
    return {
      resource: forkedResource,
      label: forkedLabel,
      iconPath: getAgentSessionProviderIcon(this._config.sessionType),
      timing: { created: now, lastRequestStarted: now, lastRequestEnded: now }
    };
  }
  async _ensureRequiredAuthentication() {
    const agentInfo = this._getRootState()?.agents.find((a) => a.provider === this._config.provider);
    const protectedResources = agentInfo?.protectedResources ?? [];
    const hasRequiredAuth = protectedResources.some((r) => r.required !== false);
    if (hasRequiredAuth && this._config.resolveAuthentication) {
      const authenticated = await this._config.resolveAuthentication(protectedResources);
      if (!authenticated) {
        throw new Error(localize("agentHost.authRequired", "Authentication is required to start a session. Please sign in and try again."));
      }
    }
    return protectedResources;
  }
  /** Creates a new backend session and subscribes to its state. */
  async _createAndSubscribe(sessionResource, model, fork, config, importConversation, onFailureStage) {
    const workingDirectories = this._resolveRequestedWorkingDirectories(sessionResource);
    const requestedSession = fork ? void 0 : this._resolveSessionUri(sessionResource);
    this._logService.trace(`[AgentHost] Creating new session, model=${model?.id ?? "(default)"}, provider=${this._config.provider}${fork ? `, fork from ${fork.session.toString()} at index ${fork.turnIndex}` : ""}`);
    onFailureStage?.("authentication");
    const protectedResources = await this._ensureRequiredAuthentication();
    const activeClient = this._getCurrentActiveClient();
    const progressToken = generateUuid();
    let session;
    onFailureStage?.("createSession");
    try {
      session = await this._config.connection.createSession({
        session: requestedSession,
        model,
        provider: this._config.provider,
        workingDirectories,
        fork,
        config,
        importConversation,
        activeClient,
        progressToken
      });
    } catch (err) {
      if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
        onFailureStage?.("authentication");
        this._logService.info("[AgentHost] Authentication required, prompting user...");
        const authenticated = await this._config.resolveAuthentication(protectedResources);
        if (authenticated) {
          onFailureStage?.("createSession");
          session = await this._config.connection.createSession({
            session: requestedSession,
            model,
            provider: this._config.provider,
            workingDirectories,
            fork,
            config,
            importConversation,
            activeClient,
            progressToken
          });
        } else {
          throw new Error(localize("agentHost.authRequired", "Authentication is required to start a session. Please sign in and try again."));
        }
      } else {
        throw err;
      }
    }
    if (requestedSession && !isEqual(session, requestedSession)) {
      throw new Error(`Agent host returned unexpected session URI. Expected ${requestedSession.toString()}, got ${session.toString()}`);
    }
    this._logService.trace(`[AgentHost] Created session: ${session.toString()}`);
    onFailureStage?.("subscribeSession");
    const newSub = this._ensureSessionSubscription(session.toString());
    if (!this._getSessionState(session.toString())) {
      await this._whenSubscriptionHydrated(newSub, CancellationToken.None);
    }
    const rawState = this._requireRawSessionState(session.toString());
    const chatURI = this._resolveChatUriFromState(sessionResource, rawState);
    this._setChatURI(sessionResource, chatURI);
    const chatSub = this._ensureChatSubscription(session.toString(), chatURI);
    if (!fork) {
      this._activeSessions.get(sessionResource)?.setStateSubscriptions(newSub, chatSub);
    }
    this._ensurePendingMessageSubscription(sessionResource, session);
    this._watchForServerInitiatedTurns(session, sessionResource);
    return session;
  }
  /**
   * Keeps chat model and protocol pending messages synchronized in both directions.
   * No-ops if already subscribed.
   */
  _ensurePendingMessageSubscription(sessionResource, backendSession) {
    if (this._pendingMessageSubscriptions.has(sessionResource)) {
      return;
    }
    const chatModel = this._chatService?.getSession(sessionResource);
    if (chatModel) {
      const store = new DisposableStore();
      this._pendingMessageSubscriptions.set(sessionResource, store);
      this._applyRemotePendingMessages(sessionResource, backendSession);
      store.add(chatModel.onDidChangePendingRequests(() => {
        this._syncPendingMessages(sessionResource, backendSession);
      }));
      this._syncPendingMessages(sessionResource, backendSession);
      const sessionStr = backendSession.toString();
      const chatURI = this._chatURIsBySessionResource.get(sessionResource);
      if (chatURI) {
        const onRemoteChange = () => this._applyRemotePendingMessages(sessionResource, backendSession);
        store.add(this._ensureSessionSubscription(sessionStr).onDidChange(onRemoteChange));
        store.add(this._ensureChatSubscription(sessionStr, chatURI).onDidChange(onRemoteChange));
      }
      return;
    }
    this._pendingMessageSubscriptions.set(sessionResource, this._chatService.onDidCreateModel((model) => {
      if (!isEqual(model.sessionResource, sessionResource)) {
        return;
      }
      this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
      this._ensurePendingMessageSubscription(sessionResource, backendSession);
    }));
  }
  _ensureDraftSyncSubscription(sessionResource, backendSession, chatKey) {
    if (this._draftSyncSubscriptions.has(sessionResource)) {
      return;
    }
    const store = new DisposableStore();
    this._draftSyncSubscriptions.set(sessionResource, store);
    this._acquireOrWaitForSession(sessionResource, store).then((chatModel) => {
      if (!chatModel || store.isDisposed) {
        return;
      }
      this._installDraftSync(sessionResource, chatModel, backendSession, chatKey, store);
    }, (err) => {
      if (!store.isDisposed) {
        this._logService.error(`[AgentHost] Failed to wait for chat model for draft sync: ${sessionResource.toString()}`, err);
      }
    });
  }
  async _acquireOrWaitForSession(sessionResource, owner) {
    const existing = this._chatService.getSession(sessionResource);
    if (existing) {
      return existing;
    }
    const waitStore = owner.add(new DisposableStore());
    try {
      return await new Promise((resolve) => {
        waitStore.add(toDisposable(() => resolve(void 0)));
        waitStore.add(this._chatService.onDidCreateModel((model) => {
          if (isEqual(model.sessionResource, sessionResource)) {
            resolve(model);
          }
        }));
      });
    } finally {
      waitStore.dispose();
    }
  }
  _installDraftSync(sessionResource, chatModel, backendSession, chatKey, store) {
    const inputModel = chatModel.inputModel;
    if (!inputModel) {
      return;
    }
    const delayer = store.add(new Delayer(AgentHostSessionHandler.DRAFT_SYNC_DEBOUNCE_MS));
    const chatSubscription = this._ensureChatSubscription(backendSession.toString(), chatKey);
    const readRemoteDraft = () => {
      const value = chatSubscription.value;
      return value && !(value instanceof Error) ? value.draft : void 0;
    };
    let syncedDraft = readRemoteDraft();
    let lastRemoteDraft = syncedDraft;
    let appliedRemoteDraft;
    const syncDraft = (state) => {
      if (state?.origin === ChatInputStateOrigin.Remote) {
        return;
      }
      const draft = this._inputStateToDraft(sessionResource, state);
      if (equals(syncedDraft, draft)) {
        return;
      }
      if (appliedRemoteDraft && sameDraftUserContent(draft, appliedRemoteDraft)) {
        syncedDraft = draft;
        return;
      }
      appliedRemoteDraft = void 0;
      syncedDraft = draft;
      this._config.connection.dispatch(chatKey, {
        type: ActionType.ChatDraftChanged,
        draft
      });
    };
    store.add(autorun((reader) => {
      const state = inputModel.state.read(reader);
      delayer.trigger(() => syncDraft(state)).catch(() => {
      });
    }));
    store.add(chatSubscription.onDidChange(() => {
      const remoteDraft = readRemoteDraft();
      if (remoteDraft === lastRemoteDraft) {
        return;
      }
      lastRemoteDraft = remoteDraft;
      if (equals(syncedDraft, remoteDraft)) {
        return;
      }
      const localDraft = this._inputStateToDraft(sessionResource, inputModel.state.get());
      if (!equals(syncedDraft, localDraft)) {
        return;
      }
      syncedDraft = remoteDraft;
      appliedRemoteDraft = remoteDraft;
      this._applyRemoteDraft(inputModel, sessionResource, remoteDraft);
    }));
    store.add(toDisposable(() => {
      delayer.cancel();
      syncDraft(inputModel.state.get());
    }));
  }
  /** Applies a remote draft without replacing local input state the protocol does not carry. */
  _applyRemoteDraft(inputModel, sessionResource, draft) {
    if (!draft) {
      inputModel.setState({
        inputText: "",
        selections: [],
        attachments: [],
        origin: ChatInputStateOrigin.Remote
      });
      return;
    }
    const serializedState = this._draftToInputState(sessionResource, draft);
    if (!serializedState) {
      return;
    }
    const state = reviveSerializableInputState(serializedState);
    const partialState = {
      inputText: state.inputText,
      selections: state.selections,
      attachments: state.attachments,
      mode: state.mode,
      origin: ChatInputStateOrigin.Remote
    };
    if (state.selectedModel) {
      partialState.selectedModel = state.selectedModel;
      partialState.modelConfiguration = state.modelConfiguration;
    }
    inputModel.setState(partialState);
  }
  _inputStateToDraft(sessionResource, state) {
    if (!state) {
      return void 0;
    }
    const model = this._createModelSelection(state.selectedModel?.identifier, state.modelConfiguration);
    const agentUri = state.mode.kind === ChatModeKind.Agent && state.mode.id !== ChatMode.Agent.id ? state.mode.id : void 0;
    const attachments = this._variableEntriesToAttachments(state.attachments, sessionResource, state.inputText);
    if (!state.inputText && !model && !agentUri && attachments.length === 0) {
      return void 0;
    }
    return {
      text: state.inputText,
      origin: { kind: MessageKind.User },
      ...attachments.length > 0 ? { attachments } : {},
      ...model ? { model } : {},
      ...agentUri ? { agent: { uri: agentUri } } : {}
    };
  }
  /**
   * Check if an error is an "authentication required" error.
   * Checks for the AHP_AUTH_REQUIRED error code when available,
   * with a message-based fallback for transports that don't preserve
   * structured error codes (e.g. ProxyChannel).
   */
  _isAuthRequiredError(err) {
    if (err instanceof ProtocolError && err.code === AHP_AUTH_REQUIRED) {
      return true;
    }
    if (err instanceof Error && err.message.includes("Authentication required")) {
      return true;
    }
    return false;
  }
  _createModelSelection(languageModelIdentifier, modelConfiguration) {
    const rawModelId = this._extractRawModelId(languageModelIdentifier);
    if (!rawModelId) {
      return void 0;
    }
    const config = {};
    for (const [key, value] of Object.entries(modelConfiguration ?? {})) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        config[key] = value;
      }
    }
    return Object.keys(config).length > 0 ? { id: rawModelId, config } : { id: rawModelId };
  }
  _draftToInputState(sessionResource, draft) {
    if (!draft) {
      return void 0;
    }
    const modelId = this._toLanguageModelId(sessionResource, draft.model?.id);
    const metadata = modelId ? this._languageModelsService.lookupLanguageModel(modelId) : void 0;
    const variableData = messageAttachmentsToVariableData(draft.attachments, this._config.connectionAuthority, draft.text);
    const cursor = offsetToPosition(draft.text, draft.text.length);
    return {
      attachments: variableData?.variables ?? [],
      contrib: {},
      inputText: draft.text,
      mode: { id: draft.agent?.uri ?? ChatMode.Agent.id, kind: ChatModeKind.Agent },
      selectedModel: modelId && metadata ? {
        identifier: modelId,
        metadata,
        ...draft.model?.config ? { modelConfiguration: draft.model.config } : {}
      } : void 0,
      selections: [{
        selectionStartLineNumber: cursor.lineNumber,
        selectionStartColumn: cursor.column,
        positionLineNumber: cursor.lineNumber,
        positionColumn: cursor.column
      }]
    };
  }
  /**
   * Extracts the raw model id from a language-model service identifier.
   * E.g. "agent-host-copilot:claude-sonnet-4-20250514" → "claude-sonnet-4-20250514".
   * Foreign extension-host identifiers (`${vendor}/${id}`) are dropped so
   * the agent host falls back to its default model.
   */
  _extractRawModelId(languageModelIdentifier) {
    if (!languageModelIdentifier) {
      return void 0;
    }
    const prefix = this._config.sessionType + ":";
    if (languageModelIdentifier.startsWith(prefix)) {
      return languageModelIdentifier.substring(prefix.length);
    }
    if (languageModelIdentifier.includes("/")) {
      this._logService.warn(`[AgentHost] Dropping foreign model identifier '${languageModelIdentifier}' for session type '${this._config.sessionType}'; falling back to default model.`);
      return void 0;
    }
    return languageModelIdentifier;
  }
  _toLanguageModelId(sessionResource, rawModelId) {
    if (!rawModelId) {
      return void 0;
    }
    const prefix = `${getChatSessionType(sessionResource)}:`;
    return rawModelId.startsWith(prefix) ? rawModelId : `${prefix}${rawModelId}`;
  }
  _getLanguageModelDisplayName(modelIdentifier) {
    if (!modelIdentifier) {
      return void 0;
    }
    const metadata = this._languageModelsService.lookupLanguageModel(modelIdentifier);
    return metadata ? getLanguageModelDisplayNameWithProvider({ identifier: modelIdentifier, metadata }, this._languageModelsService) : void 0;
  }
  _getTurnResponseDetails(sessionResource, backendSession, turn) {
    const fallbackRawModelId = turn?.message?.model?.id ?? lastTurnModelSelection(this._getSessionState(backendSession.toString()))?.id;
    return this._createTurnModelLookup(sessionResource, fallbackRawModelId).toResponseDetails(turn?.usage?.model, turn?.usage);
  }
  /**
   * Builds a per-turn model lookup that namespaces raw AHP model ids into
   * chat-layer language-model ids and resolves human-readable display
   * names via the registered language-model providers (so the chat UI's
   * per-response footer can show e.g. "Claude Opus 4.7" instead of the
   * raw model id). `fallbackRawModelId` is used when a turn's
   * `usage?.model` is not yet set (e.g. older sessions or turns that
   * never reported usage).
   */
  _createTurnModelLookup(sessionResource, fallbackRawModelId) {
    const resolveRaw = (rawModelId) => rawModelId ?? fallbackRawModelId;
    const lookupModel = (rawModelId) => {
      const normalizedRaw = rawModelId?.replace(/-(\d+)$/, ".$1");
      for (const candidate of [rawModelId, normalizedRaw !== rawModelId ? normalizedRaw : void 0]) {
        const modelId = this._toLanguageModelId(sessionResource, candidate);
        if (!modelId) {
          continue;
        }
        const model = this._languageModelsService.lookupLanguageModel(modelId);
        if (model) {
          return { identifier: modelId, model, resolvedFromRaw: true };
        }
      }
      const fallbackModelId = this._toLanguageModelId(sessionResource, fallbackRawModelId);
      if (fallbackModelId) {
        const model = this._languageModelsService.lookupLanguageModel(fallbackModelId);
        if (model) {
          return { identifier: fallbackModelId, model, resolvedFromRaw: false };
        }
      }
      return void 0;
    };
    return {
      toLanguageModelId: (rawModelId) => this._toLanguageModelId(sessionResource, resolveRaw(rawModelId)),
      toResponseDetails: (rawModelId, usage) => {
        const resolved = lookupModel(rawModelId);
        const billedModelId = resolved && !resolved.resolvedFromRaw ? rawModelId : void 0;
        const responseModel = resolved ? {
          name: getLanguageModelDisplayNameWithProvider({ identifier: resolved.identifier, metadata: resolved.model }, this._languageModelsService),
          pricing: resolved.model.pricing
        } : void 0;
        return formatTurnResponseDetails(responseModel, billedModelId, usage);
      },
      toAutoModeResolution: (usage) => {
        const resolution = readUsageInfoMeta(usage).autoModeResolved;
        const resolved = resolution ? lookupModel(resolution.chosenModel) : void 0;
        const resolvedModelName = resolved?.resolvedFromRaw ? resolved.model.name : void 0;
        return usageInfoToAutoModeResolution(usage, resolvedModelName);
      }
    };
  }
  _resolveRequestedWorkingDirectory(sessionResource) {
    return this._config.resolveWorkingDirectory?.(sessionResource) ?? this._newSessionFolderService.getFolder(sessionResource) ?? this._workingDirectoryResolver.resolve(sessionResource) ?? this._newSessionFolderService.getDefaultFolder() ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
  }
  _resolveRequestedWorkingDirectories(sessionResource) {
    const primary = this._resolveRequestedWorkingDirectory(sessionResource);
    return computeWorkingDirectories(primary, this._workspaceContextService.getWorkspace().folders.map((folder) => folder.uri), this._getRootState(), this._config.provider);
  }
  /**
   * Ensures the workspace/folder the agent will run in is trusted before a
   * session is spawned. Returns `false` if the user declines.
   *
   * When the agent runs inside the currently open workspace (editor window),
   * gate on workspace trust to match how extension-host chat is gated. When
   * it targets a standalone folder outside the open workspace (Agents window
   * per-session folders), gate on that folder's trust instead. Both request
   * helpers resolve immediately when the target is already trusted, so this
   * never double-prompts.
   */
  async _ensureWorkspaceTrust(sessionResource) {
    const message = localize("agentHost.workspaceTrust", "AI features are currently only supported in trusted workspaces.");
    const workingDirectory = this._resolveRequestedWorkingDirectory(sessionResource);
    if (!workingDirectory || this._workspaceContextService.getWorkspaceFolder(workingDirectory)) {
      return !!await this._workspaceTrustRequestService.requestWorkspaceTrust({ message });
    }
    return !!await this._workspaceTrustRequestService.requestResourcesTrust({ uri: workingDirectory, message });
  }
  _convertVariablesToAttachments(request) {
    const attachments = this._variableEntriesToAttachments(request.variables.variables, request.sessionResource, request.message);
    const explicitCount = attachments.length;
    this._appendActiveEditorAttachments(attachments, request);
    if (attachments.length !== explicitCount) {
      this._logService.trace(`[AgentHost] Forwarded ${attachments.length - explicitCount} active editor attachment(s); ${attachments.length} total`);
    }
    return attachments;
  }
  /**
   * Forward the active editor (which the suggested-context flow omits in agent mode) as ambient context, deduped
   * against files the user attached explicitly. Gated on
   * {@link ChatConfiguration.ImplicitContextActiveEditor} (on by default, off in the Agents window).
   * Unsaved handling lives in {@link _convertVariableToAttachment}.
   */
  _appendActiveEditorAttachments(attachments, request) {
    if (!this._configurationService.getValue(ChatConfiguration.ImplicitContextActiveEditor)) {
      return;
    }
    const implicitContext = this._chatWidgetService.getWidgetBySessionResource(request.sessionResource)?.input.implicitContext;
    if (!implicitContext) {
      return;
    }
    const existingKeys = /* @__PURE__ */ new Set();
    for (const v of request.variables.variables) {
      const key = this._fileEntryDedupeKey(v, request.sessionResource);
      if (key) {
        existingKeys.add(key);
      }
    }
    const skipUntitled = !this._backendInlinesUnsavedEditors();
    for (const entry of implicitContext.values) {
      if (entry.value === void 0) {
        continue;
      }
      if (entry.uri?.scheme === Schemas.vscodeBrowser) {
        continue;
      }
      if (skipUntitled && entry.uri?.scheme === Schemas.untitled) {
        continue;
      }
      const key = this._fileEntryDedupeKey(entry, request.sessionResource);
      if (key) {
        if (existingKeys.has(key)) {
          continue;
        }
        existingKeys.add(key);
      }
      const attachment = this._convertVariableToAttachment(entry, request.sessionResource, request.message);
      if (!Array.isArray(attachment) && attachment) {
        attachments.push(attachment);
      }
    }
  }
  /** Dedupe identity for a file/implicit entry: rebased URI, suffixed with the range for a selection. */
  _fileEntryDedupeKey(entry, sessionResource) {
    if (entry.kind !== "file" && entry.kind !== "implicit") {
      return void 0;
    }
    const value = entry.value;
    const uri = isLocation(value) ? value.uri : value instanceof URI ? value : void 0;
    if (!uri) {
      return void 0;
    }
    const selection = this._entrySelection(entry);
    return this._attachmentDedupeKey(this._rebaseAttachmentUri(uri, sessionResource).toString(), selection);
  }
  /** The selection range carried by a file/implicit entry, or `undefined` for whole-document references. */
  _entrySelection(entry) {
    const location = this._entrySelectionLocation(entry);
    return location ? { range: this._toTextRange(location.range) } : void 0;
  }
  /** Dedupe identity: the bare URI for a whole document, suffixed with the range for a selection. */
  _attachmentDedupeKey(uri, selection) {
    if (!selection) {
      return uri;
    }
    const { start, end } = selection.range;
    return `${uri}#${start.line}:${start.character}-${end.line}:${end.character}`;
  }
  /**
   * Whether this backend reads referenced files from disk (rather than seeing the editor's
   * in-memory buffer) and therefore needs the live text of an unsaved / dirty editor inlined as
   * an embedded resource. Copilot CLI and Codex both run as separate processes with only disk
   * access, so a `@path` mention (or an `untitled:` URI) would give them stale or missing content.
   */
  _backendInlinesUnsavedEditors() {
    return this._config.provider === SessionType.CopilotCLI || this._config.provider === CODEX_AGENT_PROVIDER_ID;
  }
  /** A resource is unsaved when it's untitled or a saved file with in-memory (dirty) changes. */
  _isUnsavedResource(uri) {
    return uri.scheme === Schemas.untitled || this._workingCopyService.isDirty(uri);
  }
  /**
   * Inline the live (in-memory) text of an unsaved editor as an embedded resource so a path-reading backend still
   * gets current content, preserving the entry's selection, range and `_meta`. Selection entries inline only the
   * selected text; whole-document entries inline the full buffer. Returns `undefined` when no loaded text model is
   * available or the inlined text exceeds {@link MAX_INLINED_UNSAVED_EDITOR_BYTES}.
   */
  _buildUnsavedEditorAttachment(uri, v, range) {
    const model = this._modelService.getModel(uri);
    if (!model) {
      return void 0;
    }
    const text = this._getUnsavedEditorAttachmentText(model, this._entryModelSelectionRange(v));
    const buffer = text === void 0 ? void 0 : VSBuffer.fromString(text);
    if (!buffer || buffer.byteLength > MAX_INLINED_UNSAVED_EDITOR_BYTES) {
      this._logService.trace(`[AgentHost] Skipping inline of unsaved editor ${uri.toString()}: exceeds ${MAX_INLINED_UNSAVED_EDITOR_BYTES} byte cap`);
      return void 0;
    }
    const selection = this._entrySelection(v);
    const attachment = {
      type: MessageAttachmentKind.EmbeddedResource,
      label: v.name,
      displayKind: selection ? "selection" : "document",
      data: encodeBase64(buffer),
      contentType: "text/plain"
    };
    if (selection) {
      attachment.selection = selection;
    }
    if (range) {
      attachment.range = range;
    }
    if (v._meta) {
      attachment._meta = v._meta;
    }
    return attachment;
  }
  /**
   * The inline text to send for an unsaved editor: the selected text for a selection, else the whole buffer. Uses the
   * model length APIs so an over-cap buffer is skipped (returns `undefined`) without ever being materialized.
   */
  _getUnsavedEditorAttachmentText(model, range) {
    if (range) {
      const selection = model.validateRange(range);
      const selectionLength = model.getValueLengthInRange(selection);
      if (selectionLength > 0) {
        return selectionLength > MAX_INLINED_UNSAVED_EDITOR_BYTES ? void 0 : model.getValueInRange(selection);
      }
    }
    return model.getValueLength() > MAX_INLINED_UNSAVED_EDITOR_BYTES ? void 0 : model.getValue();
  }
  /** The editor range of a file/implicit selection entry, used to slice the live model; `undefined` otherwise. */
  _entryModelSelectionRange(entry) {
    return this._entrySelectionLocation(entry)?.range;
  }
  /** The {@link Location} of a file/implicit entry that represents a selection, or `undefined` for whole documents. */
  _entrySelectionLocation(entry) {
    const value = entry.value;
    const isSelectionEntry = (entry.kind === "file" || entry.kind === "implicit" && entry.isSelection) && isLocation(value);
    return isSelectionEntry ? value : void 0;
  }
  _variableEntriesToAttachments(variables, sessionResource, messageText) {
    const attachments = [];
    for (const v of variables) {
      const attachment = this._convertVariableToAttachment(v, sessionResource, messageText);
      if (Array.isArray(attachment)) {
        attachments.push(...attachment);
      } else if (attachment) {
        attachments.push(attachment);
      }
    }
    if (attachments.length > 0) {
      this._logService.trace(`[AgentHost] Converted ${attachments.length} attachments from ${variables.length} explicit variables`);
    }
    return attachments;
  }
  _convertVariableToAttachment(v, sessionResource, messageText) {
    const referenceRange = this._toAttachmentReferenceRange(messageText, v.range);
    if ((v.kind === "file" || v.kind === "implicit") && this._backendInlinesUnsavedEditors()) {
      const uri = isLocation(v.value) ? v.value.uri : v.value instanceof URI ? v.value : void 0;
      if (uri && this._isUnsavedResource(uri)) {
        const embedded = this._buildUnsavedEditorAttachment(uri, v, referenceRange);
        if (embedded) {
          return embedded;
        }
        if (uri.scheme !== Schemas.file) {
          return void 0;
        }
      }
    }
    if ((v.kind === "file" || v.kind === "implicit" && v.isSelection) && isLocation(v.value)) {
      return this._toSelectionAttachment(v.value, v.name, "selection", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "implicit" && isLocation(v.value)) {
      return this._toResourceAttachment(v.value.uri, v.name, "document", sessionResource, v._meta, referenceRange);
    }
    if ((v.kind === "file" || v.kind === "implicit") && v.value instanceof URI) {
      return this._toResourceAttachment(v.value, v.name, "document", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "directory" && v.value instanceof URI) {
      return this._toResourceAttachment(v.value, v.name, "directory", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "symbol" && isLocation(v.value)) {
      return this._toSelectionAttachment(v.value, v.name, "symbol", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "promptFile" && v.value instanceof URI) {
      return this._toResourceAttachment(v.value, v.name, "document", sessionResource, v._meta, referenceRange);
    }
    if (isImageVariableEntry(v)) {
      return this._toImageAttachment(v, sessionResource, referenceRange);
    }
    if (isAgentFeedbackVariableEntry(v)) {
      return this._toAgentFeedbackAttachment(v);
    }
    if (v.kind === "sessionReference" && v.value instanceof URI) {
      const trajectoryPath = this._toSessionReferenceTrajectoryPath(v.value);
      if (!trajectoryPath) {
        return void 0;
      }
      return this._toSessionReferenceAttachments(v, v.value, trajectoryPath, referenceRange);
    }
    if (isBrowserViewVariableEntry(v)) {
      return this._toSimpleAttachment(
        v.name,
        v.modelDescription ?? `Browser page: ${v.name}. The pageId is "${v.browserId}".`,
        {
          ...v._meta,
          [BrowserViewAttachmentMetadataKey]: { browserId: v.browserId, browserUri: v.value.toString() }
        },
        BrowserViewAttachmentDisplayKind,
        referenceRange
      );
    }
    if (v.kind === "element") {
      const correlationId = generateUuid();
      const metadata = { ...v._meta, ...toElementAttachmentMeta(correlationId) };
      const elementAttachment = this._toSimpleAttachment(v.name, v.value, metadata, AgentHostElementAttachmentDisplayKind, referenceRange);
      const imageAttachment = this._toElementImageAttachment(v, sessionResource, metadata);
      return imageAttachment ? [elementAttachment, imageAttachment] : elementAttachment;
    }
    if (v.kind === "paste") {
      return this._toSimpleAttachment(v.name, v.code, v._meta, void 0, referenceRange);
    }
    if (v.kind === "promptText") {
      return this._toSimpleAttachment(v.name, v.value, v._meta, void 0, referenceRange);
    }
    if (v.kind === "workspace") {
      return this._toSimpleAttachment(v.name, v.value, v._meta, "workspace", referenceRange);
    }
    if (v.kind === "string" && typeof v.value === "string") {
      return this._toSimpleAttachment(v.name, v.value, v._meta, void 0, referenceRange);
    }
    const agentHostCompletionKind = getAgentHostCompletionReferenceKind(v);
    if (agentHostCompletionKind === AgentHostCompletionReferenceKind.Command) {
      return this._toSimpleAttachment(v.name, void 0, v._meta, "command", referenceRange);
    }
    if (agentHostCompletionKind === AgentHostCompletionReferenceKind.Skill) {
      return this._toSimpleAttachment(v.name, void 0, v._meta, "skill", referenceRange);
    }
    if (isChatReferenceVariableEntry(v)) {
      return this._toChatReferenceAttachment(v, referenceRange);
    }
    return void 0;
  }
  _toChatReferenceAttachment(v, range) {
    const attachment = {
      type: MessageAttachmentKind.Chat,
      resource: v.value.toString(),
      label: v.name
    };
    if (v.endTurn !== void 0) {
      attachment.endTurn = v.endTurn;
    }
    if (range) {
      attachment.range = range;
    }
    if (v._meta) {
      attachment._meta = v._meta;
    }
    return attachment;
  }
  _toElementImageAttachment(v, sessionResource, metadata) {
    if (v.imageData instanceof Uint8Array) {
      return {
        type: MessageAttachmentKind.EmbeddedResource,
        label: `${v.name} screenshot`,
        displayKind: "image",
        data: encodeBase64(VSBuffer.wrap(v.imageData)),
        contentType: v.imageMimeType ?? "image/png",
        _meta: metadata
      };
    }
    if (URI.isUri(v.imageData)) {
      return this._toResourceAttachment(v.imageData, `${v.name} screenshot`, "image", sessionResource, metadata);
    }
    return void 0;
  }
  _toSessionReferenceAttachment(v, sessionResource, trajectoryPath, range) {
    return this._toSimpleAttachment(
      v.name,
      toSessionReferenceModelRepresentation(v.name, sessionResource, trajectoryPath),
      { ...v._meta ?? {}, ...toSessionReferenceAttachmentMeta(sessionResource) },
      AgentHostSessionReferenceAttachmentDisplayKind,
      range
    );
  }
  _toSessionReferenceAttachments(v, sessionResource, trajectoryPath, range) {
    return [
      this._toSessionReferenceAttachment(v, sessionResource, trajectoryPath, range),
      this._toSessionReferenceTrajectoryAttachment(v, sessionResource, trajectoryPath)
    ];
  }
  _toSessionReferenceTrajectoryAttachment(v, sessionResource, trajectoryPath) {
    return {
      type: MessageAttachmentKind.Resource,
      uri: URI.file(trajectoryPath).toString(),
      label: `${v.name} trajectory`,
      displayKind: AgentHostSessionReferenceTrajectoryAttachmentDisplayKind,
      _meta: { ...v._meta ?? {}, ...toSessionReferenceAttachmentMeta(sessionResource) }
    };
  }
  _toSessionReferenceTrajectoryPath(sessionResource) {
    return buildHostLocalEventsPath(
      sessionResource,
      this._pathService.userHome({ preferLocal: true }),
      (authority) => this._remoteAgentHostService.connections.find((connection) => agentHostAuthority(connection.address) === authority)
    );
  }
  _toResourceAttachment(uri, label, displayKind, sessionResource, _meta, range) {
    const attachmentUri = this._rebaseAttachmentUri(uri, sessionResource);
    const attachment = { type: MessageAttachmentKind.Resource, uri: attachmentUri.toString(), label, displayKind };
    if (range) {
      attachment.range = range;
    }
    if (_meta) {
      attachment._meta = _meta;
    }
    return attachment;
  }
  _toSelectionAttachment(location, label, displayKind, sessionResource, _meta, range) {
    const attachmentUri = this._rebaseAttachmentUri(location.uri, sessionResource);
    const attachment = {
      type: MessageAttachmentKind.Resource,
      uri: attachmentUri.toString(),
      label,
      displayKind,
      selection: { range: this._toTextRange(location.range) }
    };
    if (range) {
      attachment.range = range;
    }
    if (_meta) {
      attachment._meta = _meta;
    }
    return attachment;
  }
  _toImageAttachment(v, sessionResource, range) {
    const buffer = coerceImageBuffer(v.value);
    const contentType = v.mimeType ?? "image/png";
    if (buffer) {
      const attachment = {
        type: MessageAttachmentKind.EmbeddedResource,
        label: v.name,
        displayKind: "image",
        data: encodeBase64(VSBuffer.wrap(buffer)),
        contentType
      };
      if (range) {
        attachment.range = range;
      }
      if (v._meta) {
        attachment._meta = v._meta;
      }
      return attachment;
    }
    const refUri = v.references?.find((r) => URI.isUri(r.reference))?.reference;
    if (URI.isUri(refUri)) {
      return this._toResourceAttachment(refUri, v.name, "image", sessionResource, v._meta, range);
    }
    return void 0;
  }
  _toAgentFeedbackAttachment(v) {
    const annotationsResource = v.annotationsResource?.toString();
    if (annotationsResource && v.feedbackItems.length > 0) {
      return v.feedbackItems.map((item) => {
        const itemMeta = {
          id: item.id,
          text: item.text,
          resourceUri: item.resourceUri.toString(),
          range: this._toTextRange(item.range),
          ...item.replies?.length ? { replies: [...item.replies] } : {}
        };
        return {
          type: MessageAttachmentKind.Annotations,
          label: v.name,
          displayKind: AgentFeedbackAttachmentDisplayKind,
          resource: annotationsResource,
          annotationIds: [item.id],
          _meta: {
            ...v._meta ?? {},
            [AgentFeedbackAttachmentMetadataKey]: {
              sessionResource: v.sessionResource.toString(),
              feedbackItems: [itemMeta]
            }
          }
        };
      });
    }
    const feedbackItems = v.feedbackItems.map((item) => ({
      id: item.id,
      text: item.text,
      resourceUri: item.resourceUri.toString(),
      range: this._toTextRange(item.range),
      ...item.replies?.length ? { replies: [...item.replies] } : {}
    }));
    return this._toSimpleAttachment(
      v.name,
      typeof v.value === "string" ? v.value : void 0,
      {
        ...v._meta ?? {},
        [AgentFeedbackAttachmentMetadataKey]: {
          sessionResource: v.sessionResource.toString(),
          feedbackItems
        }
      },
      AgentFeedbackAttachmentDisplayKind
    );
  }
  _toSimpleAttachment(label, modelRepresentation, _meta, displayKind, range) {
    const attachment = { type: MessageAttachmentKind.Simple, label };
    if (modelRepresentation !== void 0) {
      attachment.modelRepresentation = modelRepresentation;
    }
    if (range) {
      attachment.range = range;
    }
    if (displayKind) {
      attachment.displayKind = displayKind;
    }
    if (_meta) {
      attachment._meta = _meta;
    }
    return attachment;
  }
  _toAttachmentReferenceRange(messageText, range) {
    if (!messageText || !range || range.start < 0 || range.endExclusive > messageText.length || range.start > range.endExclusive) {
      return void 0;
    }
    const start = offsetToPosition(messageText, range.start);
    const end = offsetToPosition(messageText, range.endExclusive);
    return {
      start: { line: start.lineNumber - 1, character: start.column - 1 },
      end: { line: end.lineNumber - 1, character: end.column - 1 }
    };
  }
  _toTextRange(range) {
    return {
      start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
      end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
    };
  }
  /**
   * Rebase a `file:`-scheme attachment URI from the session's requested
   * working directory onto the server-resolved working directory. This
   * matters on the first turn of a worktree-isolated session, where the
   * provider creates a worktree under a different path than the workspace
   * folder the workbench attached the file from. Returns the URI unchanged
   * if the requested and resolved directories match, the URI is not under
   * the requested directory, or either side is unavailable.
   */
  _rebaseAttachmentUri(uri, sessionResource) {
    const requestedDir = this._resolveRequestedWorkingDirectory(sessionResource);
    if (!requestedDir || requestedDir.scheme !== "file") {
      return uri;
    }
    const backendSession = this._resolveSessionUri(sessionResource);
    const rawResolvedDir = this._getSessionState(backendSession.toString())?.workingDirectories?.[0];
    const resolvedDir = typeof rawResolvedDir === "string" ? URI.parse(rawResolvedDir) : rawResolvedDir;
    if (!resolvedDir || resolvedDir.scheme !== "file") {
      return uri;
    }
    if (extUriBiasedIgnorePathCase.isEqual(requestedDir, resolvedDir)) {
      return uri;
    }
    if (!extUriBiasedIgnorePathCase.isEqualOrParent(uri, requestedDir)) {
      return uri;
    }
    const rel = extUriBiasedIgnorePathCase.relativePath(requestedDir, uri);
    if (rel === void 0) {
      return uri;
    }
    if (rel === "") {
      return resolvedDir;
    }
    return URI.joinPath(resolvedDir, ...rel.split("/"));
  }
  // ---- Lifecycle ----------------------------------------------------------
  // ---- Session subscription helpers ----------------------------------------
  /**
   * Get or create a session subscription. The first call for a given URI
   * triggers a server subscribe; subsequent calls increment the refcount.
   */
  _ensureSessionSubscription(sessionUri) {
    let ref = this._sessionSubscriptions.get(sessionUri);
    if (ref?.object.value instanceof Error) {
      this._sessionSubscriptions.delete(sessionUri);
      ref.dispose();
      ref = void 0;
    }
    if (!ref) {
      ref = this._config.connection.getSubscription(StateComponents.Session, URI.parse(sessionUri), "AgentHostSessionHandler");
      this._sessionSubscriptions.set(sessionUri, ref);
    }
    return ref.object;
  }
  /**
   * Get or create the default-chat subscription for a session. Mirrors the
   * refcount lifecycle of {@link _ensureSessionSubscription}.
   */
  _ensureDefaultChatSubscription(sessionUri) {
    let ref = this._defaultChatSubscriptions.get(sessionUri);
    if (ref?.object.value instanceof Error) {
      this._defaultChatSubscriptions.delete(sessionUri);
      ref.dispose();
      ref = void 0;
    }
    if (!ref) {
      const state = this._requireRawSessionState(sessionUri);
      const defaultChat = state.defaultChat;
      if (!defaultChat) {
        throw new Error(`Session ${sessionUri} has no default chat`);
      }
      const chatUri = URI.parse(defaultChat.toString());
      ref = this._config.connection.getSubscription(StateComponents.Chat, chatUri, "AgentHostSessionHandler");
      this._defaultChatSubscriptions.set(sessionUri, ref);
    }
    return ref.object;
  }
  /**
   * Release the subscriptions held by a single chat session on dispose.
   *
   * Unlike {@link _releaseSessionSubscription} (which tears down every chat
   * of a session at once), this only releases the disposed chat's own
   * conversation subscription and never touches sibling peer chats: closing
   * one chat of a multi-chat session must not strand another chat — including
   * one that is concurrently hydrating in {@link provideChatSessionContent} —
   * on a disposed subscription. The session summary subscription (and its
   * lockstep default-chat subscription) is shared by every chat of the
   * session, so it is only torn down once no sibling chat session is still
   * active or mid-hydration for the same backend session.
   */
  _releaseChatSessionSubscriptions(sessionUri, chatUri) {
    if (chatUri !== this._getRawSessionState(sessionUri)?.defaultChat?.toString()) {
      const chatRef2 = this._additionalChatSubscriptions.get(chatUri);
      if (chatRef2) {
        this._additionalChatSubscriptions.delete(chatUri);
        chatRef2.dispose();
      }
    }
    if (this._hasOtherSessionHold(sessionUri)) {
      return;
    }
    const ref = this._sessionSubscriptions.get(sessionUri);
    if (ref) {
      this._sessionSubscriptions.delete(sessionUri);
      ref.dispose();
    }
    const chatRef = this._defaultChatSubscriptions.get(sessionUri);
    if (chatRef) {
      this._defaultChatSubscriptions.delete(sessionUri);
      chatRef.dispose();
    }
  }
  /**
   * Returns whether another chat session for the given backend session URI is
   * still active or in the middle of hydrating its subscriptions, so the
   * shared session subscription must be kept alive. Callers invoke this after
   * removing their own entry from {@link _activeSessions}.
   */
  _hasOtherSessionHold(sessionUri) {
    if ((this._hydratingChatSessions.get(sessionUri) ?? 0) > 0) {
      return true;
    }
    for (const resource of this._activeSessions.keys()) {
      if (this._resolveSessionUri(resource).toString() === sessionUri) {
        return true;
      }
    }
    return false;
  }
  /**
   * Read the current optimistic session state for a backend session URI,
   * merged with its default chat so conversation contents (turns, active
   * turn, pending/queued messages, input requests) are visible.
   */
  /**
   * Resolves once a subscription has received its first snapshot (its
   * `value` is no longer `undefined`) — i.e. it has hydrated with state or
   * an error. Resolves immediately if already hydrated or if cancellation
   * is requested.
   */
  _whenSubscriptionHydrated(sub, token) {
    if (sub.value !== void 0 || token.isCancellationRequested) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const store = new DisposableStore();
      const settle = () => {
        store.dispose();
        resolve();
      };
      store.add(sub.onDidChange(() => {
        if (sub.value !== void 0) {
          settle();
        }
      }));
      const onDidError = sub.onDidError;
      if (onDidError) {
        store.add(onDidError(settle));
      }
      store.add(token.onCancellationRequested(settle));
      if (sub.value !== void 0) {
        settle();
      }
    });
  }
  _getSessionState(sessionUri, chatUri) {
    const value = this._getRawSessionState(sessionUri);
    if (!value) {
      return void 0;
    }
    const defaultChat = value.defaultChat?.toString();
    const chatState = chatUri && chatUri !== defaultChat ? this._getAdditionalChatState(chatUri) : this._getDefaultChatState(sessionUri);
    return mergeSessionWithDefaultChat(value, chatState);
  }
  _getRawSessionState(sessionUri) {
    const ref = this._sessionSubscriptions.get(sessionUri);
    const value = ref?.object.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  _requireRawSessionState(sessionUri) {
    const state = this._getRawSessionState(sessionUri);
    if (!state) {
      throw new Error(`Session state is not hydrated for ${sessionUri}`);
    }
    return state;
  }
  _requireDefaultChatUri(sessionUri) {
    const defaultChat = this._requireRawSessionState(sessionUri).defaultChat;
    if (!defaultChat) {
      throw new Error(`Session ${sessionUri} has no default chat`);
    }
    return defaultChat.toString();
  }
  /** Read the current optimistic default-chat state for a backend session URI. */
  _getDefaultChatState(sessionUri) {
    const ref = this._defaultChatSubscriptions.get(sessionUri);
    if (!ref) {
      return void 0;
    }
    const value = ref.object.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  /** Read the current optimistic state for an additional peer chat URI. */
  _getAdditionalChatState(chatUri) {
    const ref = this._additionalChatSubscriptions.get(chatUri);
    if (!ref) {
      return void 0;
    }
    const value = ref.object.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  /**
   * Get or create the subscription for an additional peer chat, keyed by the
   * chat channel URI. Mirrors {@link _ensureDefaultChatSubscription} but for
   * non-default chats so their conversation contents hydrate independently.
   */
  _ensureAdditionalChatSubscription(chatUri) {
    let ref = this._additionalChatSubscriptions.get(chatUri);
    if (ref?.object.value instanceof Error) {
      this._additionalChatSubscriptions.delete(chatUri);
      ref.dispose();
      ref = void 0;
    }
    if (!ref) {
      ref = this._config.connection.getSubscription(StateComponents.Chat, URI.parse(chatUri), "AgentHostSessionHandler");
      this._additionalChatSubscriptions.set(chatUri, ref);
    }
    return ref.object;
  }
  /**
   * Subscribe to the conversation channel of `sessionResource`'s chat and
   * return the {@link IAgentSubscription}. Routes to the default-chat
   * subscription (fragment-less resource) or to an additional peer chat.
   */
  _ensureChatSubscription(sessionUri, chatUri) {
    return chatUri === this._requireDefaultChatUri(sessionUri) ? this._ensureDefaultChatSubscription(sessionUri) : this._ensureAdditionalChatSubscription(chatUri);
  }
  resolveChatResponseUri(_sessionResource, href, _kind) {
    return rewriteAgentHostLinkTarget(href, this._config.connectionAuthority);
  }
  /**
   * Read the current root state.
   */
  _getRootState() {
    const value = this._config.connection.rootState.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  dispose() {
    for (const [, session] of this._activeSessions) {
      session.dispose();
    }
    this._activeSessions.clear();
    for (const ref of this._sessionSubscriptions.values()) {
      ref.dispose();
    }
    this._sessionSubscriptions.clear();
    for (const ref of this._defaultChatSubscriptions.values()) {
      ref.dispose();
    }
    this._defaultChatSubscriptions.clear();
    for (const ref of this._additionalChatSubscriptions.values()) {
      ref.dispose();
    }
    this._additionalChatSubscriptions.clear();
    super.dispose();
  }
};
AgentHostSessionHandler.DRAFT_SYNC_DEBOUNCE_MS = 500;
AgentHostSessionHandler = __decorateClass([
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatEditingService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ITerminalChatService),
  __decorateParam(8, IAgentHostTerminalService),
  __decorateParam(9, IAgentHostSessionWorkingDirectoryResolver),
  __decorateParam(10, IAgentHostNewSessionFolderService),
  __decorateParam(11, IAgentHostUntitledProvisionalSessionService),
  __decorateParam(12, IAgentHostImportConversationStore),
  __decorateParam(13, ILanguageModelToolsService),
  __decorateParam(14, IChatWidgetService),
  __decorateParam(15, ILanguageModelsService),
  __decorateParam(16, IOpenerService),
  __decorateParam(17, IAgentHostActiveClientService),
  __decorateParam(18, IChatEntitlementService),
  __decorateParam(19, IWorkspaceTrustRequestService),
  __decorateParam(20, IModelService),
  __decorateParam(21, IWorkingCopyService),
  __decorateParam(22, IConfigurationService),
  __decorateParam(23, IChatResponseFileChangesService),
  __decorateParam(24, IPathService),
  __decorateParam(25, IRemoteAgentHostService),
  __decorateParam(26, IAgentHostCustomizationService),
  __decorateParam(27, ITelemetryService)
], AgentHostSessionHandler);
function toolResultToProtocol(result, toolName) {
  const isError = !!result.toolResultError;
  const defaultPastTense = isError ? `${toolName} failed` : `Ran ${toolName}`;
  const pastTense = typeof result.toolResultMessage === "string" ? result.toolResultMessage : result.toolResultMessage ? { markdown: result.toolResultMessage.value } : defaultPastTense;
  const content = [];
  for (const part of result.content) {
    if (part.kind === "text") {
      content.push({ type: ToolResultContentType.Text, text: part.value });
    } else if (part.kind === "promptTsx") {
      content.push({ type: ToolResultContentType.Text, text: stringifyPromptTsxPart(part) });
    } else if (part.kind === "data") {
      content.push({
        type: ToolResultContentType.EmbeddedResource,
        data: encodeBase64(part.value.data),
        contentType: part.value.mimeType
      });
    }
  }
  return {
    success: !isError,
    pastTenseMessage: pastTense,
    content: content.length > 0 ? content : void 0,
    error: isError ? { message: typeof result.toolResultError === "string" ? result.toolResultError : `${toolName} encountered an error` } : void 0
  };
}
export {
  AgentHostSessionHandler,
  convertCarouselAnswers,
  toolDataToDefinition,
  toolResultToProtocol,
  unwrapSessionLoadErrorMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTZXNzaW9uSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlbGF5ZXIsIGRpc3Bvc2FibGVUaW1lb3V0LCByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JDb2RlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGdldENoYXRFcnJvckRldGFpbHNGcm9tTWV0YSwgZ2V0Q29waWxvdFBsYW5Gcm9tRW50aXRsZW1lbnQsIElDaGF0RXJyb3JDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRFcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVSZXNvdXJjZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCB0eXBlIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1blBlcktleWVkSXRlbSwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb24sIHR5cGUgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFnZW50UHJvdmlkZXIsIEFnZW50U2Vzc2lvbiwgQ09ERVhfQUdFTlRfUFJPVklERVJfSUQsIHR5cGUgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEVsZW1lbnRBdHRhY2htZW50RGlzcGxheUtpbmQsIHRvRWxlbWVudEF0dGFjaG1lbnRNZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50RWxlbWVudEF0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tBdHRhY2htZW50RGlzcGxheUtpbmQsIEFnZW50RmVlZGJhY2tBdHRhY2htZW50TWV0YWRhdGFLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRGZWVkYmFja0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3QXR0YWNobWVudERpc3BsYXlLaW5kLCBCcm93c2VyVmlld0F0dGFjaG1lbnRNZXRhZGF0YUtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9icm93c2VyVmlld0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHsgcmVhZENvbXBsZXRpb25BdHRhY2htZW50TWV0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudENvbXBsZXRpb25BdHRhY2htZW50TWV0YS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUsIFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi90b29sU2VhcmNoQ29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgQ2hhdElucHV0UmVxdWVzdFdpdGhQbGFuUmV2aWV3LCBJQWdlbnRIb3N0UGxhblJldmlldyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0UGxhblJldmlldy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24sIG9ic2VydmFibGVGcm9tU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0VHJ1bmNhdGVkQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCBhcyBBaHBDb21wbGV0aW9uSXRlbUtpbmQsIHR5cGUgQ29tcGxldGlvbkl0ZW0gYXMgQWhwQ29tcGxldGlvbkl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQsIEN1c3RvbWl6YXRpb25UeXBlLCBKc29uUHJpbWl0aXZlLCBNY3BTZXJ2ZXJBdXRoUmVxdWlyZWRTdGF0ZSwgTWNwU2VydmVyU3RhdHVzLCBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZCwgVGVybWluYWxDbGFpbUtpbmQsIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIHR5cGUgQ29uZmlybWF0aW9uT3B0aW9uLCB0eXBlIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEsIHR5cGUgU2Vzc2lvbkFjdGl2ZUNsaWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgQ2hhdFR1cm5TdGFydGVkQWN0aW9uLCBpc0NoYXRBY3Rpb24sIHR5cGUgQ2xpZW50Q2hhdEFjdGlvbiwgdHlwZSBDbGllbnRTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBSFBfQVVUSF9SRVFVSVJFRCwgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IGJ1aWxkU3ViYWdlbnRDaGF0VXJpLCBDaGF0T3JpZ2luS2luZCwgZ2V0VG9vbFN1YmFnZW50Q29udGVudCwgaXNDaGF0UmVhZE9ubHksIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgTWVzc2FnZUtpbmQsIFBlbmRpbmdNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIFNlc3Npb25TdGF0dXMsIFN0YXRlQ29tcG9uZW50cywgVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24sIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVHVyblN0YXRlLCBwYXJzZUNoYXRVcmksIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgcmVhZFVzYWdlSW5mb01ldGEsIHR5cGUgQ2hhdFN0YXRlLCB0eXBlIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCB0eXBlIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgSUNvbXBsZXRlZFRvb2xDYWxsLCB0eXBlIElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCwgdHlwZSBNYXJrZG93blJlc3BvbnNlUGFydCwgdHlwZSBNZXNzYWdlLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LCB0eXBlIE1lc3NhZ2VBbm5vdGF0aW9uc0F0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZUNoYXRBdHRhY2htZW50LCB0eXBlIE1lc3NhZ2VSZXNvdXJjZUF0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZUVtYmVkZGVkUmVzb3VyY2VBdHRhY2htZW50LCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFBlbmRpbmdNZXNzYWdlLCB0eXBlIFJlYXNvbmluZ1Jlc3BvbnNlUGFydCwgdHlwZSBSb290U3RhdGUsIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIENoYXRJbnB1dFF1ZXN0aW9uLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgU2Vzc2lvblN0YXRlLCB0eXBlIFN0cmluZ09yTWFya2Rvd24sIHR5cGUgVG9vbENhbGxSZXNwb25zZVBhcnQsIHR5cGUgVG9vbENhbGxTdGF0ZSwgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBwYWNrRXJyb3JGb3JUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL2Vycm9yVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDaGF0U2VydmljZSwgdHlwZSBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHtcblx0QWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsXG5cdGdldEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLFxuXHRpc0FnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5LFxuXHRpc0Jyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSxcblx0aXNDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSxcblx0aXNJbWFnZVZhcmlhYmxlRW50cnksXG5cdHR5cGUgSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5LFxuXHR0eXBlIElDaGF0UmVxdWVzdENoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5LFxuXHR0eXBlIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksXG5cdHR5cGUgSUVsZW1lbnRWYXJpYWJsZUVudHJ5LFxuXHR0eXBlIElJbWFnZVZhcmlhYmxlRW50cnlcbn0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgY29lcmNlSW1hZ2VCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdEltYWdlRXh0cmFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFF1ZXVlS2luZCwgQ29uZmlybWVkUmVhc29uLCBFbGljaXRhdGlvblN0YXRlLCBJQ2hhdFByb2dyZXNzLCBJQ2hhdFF1ZXN0aW9uQW5zd2VycywgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJUmVtb3RlUGVuZGluZ1JlcXVlc3QsIFRvb2xDb25maXJtS2luZCwgdHlwZSBJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnQsIHR5cGUgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkLCB0eXBlIElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlciwgdHlwZSBJQ2hhdE1jcFN0YXJ0aW5nU2VydmVyLCB0eXBlIElDaGF0TXVsdGlTZWxlY3RBbnN3ZXIsIHR5cGUgSUNoYXRQbGFuUmV2aWV3UmVzdWx0LCB0eXBlIElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMsIHR5cGUgSUNoYXRTaW5nbGVTZWxlY3RBbnN3ZXIsIHR5cGUgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb24sIElDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlciwgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW0sIElDaGF0U2Vzc2lvbkl0ZW0sIElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbSwgaXNUZXJtaW5hbENvbW1hbmRQcm9tcHQsIFNlc3Npb25UeXBlLCB0eXBlIElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSwgdHlwZSBJQ2hhdElucHV0Q29tcGxldGlvbnNQYXJhbXMsIHR5cGUgSUNoYXRJbnB1dENvbXBsZXRpb25zUmVzdWx0LCB0eXBlIElDaGF0U2Vzc2lvblNlcnZlclJlcXVlc3QgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlciwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0U3RhdGVPcmlnaW4sIHJldml2ZVNlcmlhbGl6YWJsZUlucHV0U3RhdGUsIHR5cGUgSUNoYXRNb2RlbCwgdHlwZSBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSwgdHlwZSBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEsIHR5cGUgSUlucHV0TW9kZWwsIHR5cGUgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sSW52b2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0VG9vbEludm9jYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiwgSUNoYXRBZ2VudFJlcXVlc3QsIElDaGF0QWdlbnRSZXN1bHQsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbEludm9jYXRpb24sIElUb29sUmVzdWx0LCBzdHJpbmdpZnlQcm9tcHRUc3hQYXJ0LCBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSwgY29tcHV0ZVdvcmtpbmdEaXJlY3RvcmllcyB9IGZyb20gJy4vYWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb24gfSBmcm9tICcuL2FnZW50SG9zdFByb21wdENhY2hlTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnREaXNwbGF5S2luZCwgQWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZVRyYWplY3RvcnlBdHRhY2htZW50RGlzcGxheUtpbmQsIHRvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnRNZXRhLCB0b1Nlc3Npb25SZWZlcmVuY2VNb2RlbFJlcHJlc2VudGF0aW9uIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uUmVmZXJlbmNlQXR0YWNobWVudC5qcyc7XG5pbXBvcnQgeyBidWlsZEhvc3RMb2NhbEV2ZW50c1BhdGggfSBmcm9tICcuLi8uLi9jb3BpbG90Q2xpRXZlbnRzVXJpLmpzJztcbmltcG9ydCB7IHRvb2xEYXRhVG9EZWZpbml0aW9uIH0gZnJvbSAnLi9hZ2VudEhvc3RUb29sVXRpbHMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSB9IGZyb20gJy4vYWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUuanMnO1xuaW1wb3J0IHsgYWN0aXZlVHVyblRvUHJvZ3Jlc3MsIEJPT0xFQU5fVFJVRV9PUFRJT05fSUQsIGNvbXBsZXRlZFRvb2xDYWxsVG9FZGl0UGFydHMsIGNvbXBsZXRlZFRvb2xDYWxsVG9TZXJpYWxpemVkLCBjb250YWluc0F1dG9tYXRpY1JlcGx5QW5zd2VyLCBjb252ZXJ0UHJvdG9jb2xBbnN3ZXJzLCBjb252ZXJ0UHJvdG9jb2xQbGFuUmV2aWV3UmVzdWx0LCBjcmVhdGVJbnB1dFJlcXVlc3RDYXJvdXNlbCwgY3JlYXRlSW5wdXRSZXF1ZXN0UGxhblJldmlldywgZmluYWxpemVUb29sSW52b2NhdGlvbiwgZm9ybWF0VHVyblJlc3BvbnNlRGV0YWlscywgZ2V0VGVybWluYWxDb250ZW50LCBnZXRVcmxJbnB1dFJlcXVlc3RQcmVzZW50YXRpb24sIGlzU3ViYWdlbnRUb29sLCBtYWtlQWhwVGVybWluYWxUb29sU2Vzc2lvbklkLCBtZXNzYWdlQXR0YWNobWVudHNUb1ZhcmlhYmxlRGF0YSwgbWVzc2FnZVRvVmFyaWFibGVEYXRhLCBwYXJzZUFocFRlcm1pbmFsVG9vbFNlc3Npb25JZCwgcmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQsIHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZywgc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydCwgdG9vbENhbGxBdXRoZW50aWNhdGlvblNlcnZlciwgdG9vbENhbGxDb25maXJtYXRpb25NZXNzYWdlcywgdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbiwgdG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uLCB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uLCB0dXJuc1RvSGlzdG9yeSwgdXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEsIHVwZGF0ZVN0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uLCB1c2FnZUluZm9Ub0F1dG9Nb2RlUmVzb2x1dGlvbiwgdXNhZ2VJbmZvVG9DaGF0VXNhZ2UsIHVzYWdlSW5mb1RvUXVvdGFzLCB0eXBlIElBZ2VudEhvc3RUb29sSW52b2NhdGlvbk9wdGlvbnMsIHR5cGUgSVRvb2xDYWxsRmlsZUVkaXQsIHR5cGUgVHVybk1vZGVsTG9va3VwIH0gZnJvbSAnLi9zdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyLmpzJztcbmltcG9ydCB7IHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwgYWdlbnRIb3N0TWNwU2VydmVySWQgfSBmcm9tICcuL2FnZW50SG9zdEF1dGguanMnO1xuZXhwb3J0IHsgdG9vbERhdGFUb0RlZmluaXRpb24gfTtcblxuLyoqXG4gKiBVcHBlciBib3VuZCBvbiB0aGUgbGl2ZSBlZGl0b3IgdGV4dCB3ZSBpbmxpbmUgZm9yIGFuIHVuc2F2ZWQgZG9jdW1lbnQsIG1hdGNoaW5nIHRoZSAxIE1CIHBlci1maWxlIGNhcCBjaGF0IHVzZXNcbiAqIGVsc2V3aGVyZSAoYGNoYXRSZXBvSW5mb2ApLiBMYXJnZXIgYnVmZmVycyBhcmUgbm90IGlubGluZWQ7IGEgZGlydHkgc2F2ZWQgZmlsZSB0aGVuIGZhbGxzIGJhY2sgdG8gaXRzIG9uLWRpc2sgcGF0aC5cbiAqL1xuY29uc3QgTUFYX0lOTElORURfVU5TQVZFRF9FRElUT1JfQllURVMgPSAxMDI0ICogMTAyNDtcblxuLyoqIFN0YWJsZSBpZCBvZiB0aGUgcHJvZ3Jlc3Mgcm93IG1pcnJvcmluZyB0aGUgaG9zdCdzIGNoYXQgYWN0aXZpdHksIHNvIHVwZGF0ZXMgcmVwbGFjZSBpdCBpbiBwbGFjZS4gKi9cbmNvbnN0IENIQVRfQUNUSVZJVFlfUFJPR1JFU1NfSUQgPSAnYWdlbnRIb3N0LmNoYXRBY3Rpdml0eSc7XG5cbnR5cGUgQWdlbnRIb3N0SW52b2NhdGlvbkZhaWx1cmVTdGFnZSA9ICdyZXNvbHZlU2Vzc2lvbicgfCAncHJvdmlzaW9uYWxTZXNzaW9uJyB8ICdzZXNzaW9uU3RhdGUnIHwgJ2F1dGhlbnRpY2F0aW9uJyB8ICdjcmVhdGVTZXNzaW9uJyB8ICdzdWJzY3JpYmVTZXNzaW9uJyB8ICdwcmVwYXJlVHVybicgfCAnZGlzcGF0Y2hUdXJuJyB8ICdvYnNlcnZlVHVybic7XG5cbnR5cGUgQWdlbnRIb3N0SW52b2NhdGlvbkZhaWxlZEV2ZW50ID0ge1xuXHRyZXF1ZXN0SWQ6IHN0cmluZztcblx0cHJvdmlkZXI6IHN0cmluZztcblx0ZmFpbHVyZVN0YWdlOiBBZ2VudEhvc3RJbnZvY2F0aW9uRmFpbHVyZVN0YWdlO1xuXHRpc0ZpcnN0UmVxdWVzdDogYm9vbGVhbjtcblx0aGFzVXNlclNlbGVjdGVkTW9kZWw6IGJvb2xlYW47XG5cdGVycm9yTmFtZTogc3RyaW5nO1xuXHRlcnJvckNvZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bXNnOiBzdHJpbmc7XG5cdGNhbGxzdGFjazogc3RyaW5nIHwgdW5kZWZpbmVkO1xufTtcblxudHlwZSBBZ2VudEhvc3RJbnZvY2F0aW9uRmFpbGVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdHJlcXVlc3RJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBjaGF0IHJlcXVlc3QgaWRlbnRpZmllciwgdXNlZCB0byBjb3JyZWxhdGUgdGhpcyBmYWlsdXJlIHdpdGggcHJvdmlkZXIgYW5kIGhvc3QgdHVybiB0ZWxlbWV0cnkuJyB9O1xuXHRwcm92aWRlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBhZ2VudCBob3N0IHByb3ZpZGVyIGhhbmRsaW5nIHRoZSByZXF1ZXN0LicgfTtcblx0ZmFpbHVyZVN0YWdlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGJvdW5kZWQgd29ya2JlbmNoIGFkYXB0ZXIgc3RhZ2UgYXQgd2hpY2ggdGhlIHJlcXVlc3QgZmFpbGVkLicgfTtcblx0aXNGaXJzdFJlcXVlc3Q6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoaXMgd2FzIHRoZSBmaXJzdCByZXF1ZXN0IGluIHRoZSBjaGF0IHNlc3Npb24uJyB9O1xuXHRoYXNVc2VyU2VsZWN0ZWRNb2RlbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIHdvcmtiZW5jaCByZXF1ZXN0IGNhcnJpZWQgYSBzZWxlY3RlZCBsYW5ndWFnZSBtb2RlbCBpZGVudGlmaWVyLicgfTtcblx0ZXJyb3JOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnQ2FsbHN0YWNrT3JFeGNlcHRpb24nOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIGV4Y2VwdGlvbi4nIH07XG5cdGVycm9yQ29kZTogeyBjbGFzc2lmaWNhdGlvbjogJ0NhbGxzdGFja09yRXhjZXB0aW9uJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBleGNlcHRpb24gb3IgcHJvdG9jb2wgZXJyb3IgY29kZSwgd2hlbiBhdmFpbGFibGUuJyB9O1xuXHRtc2c6IHsgY2xhc3NpZmljYXRpb246ICdDYWxsc3RhY2tPckV4Y2VwdGlvbic7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3IgbWVzc2FnZS4gVlMgQ29kZSB0ZWxlbWV0cnkgc2NydWJzIGZpbGUgcGF0aHMgYW5kIGxpa2VseSBzZWNyZXRzIGJlZm9yZSB0cmFuc21pc3Npb24uJyB9O1xuXHRjYWxsc3RhY2s6IHsgY2xhc3NpZmljYXRpb246ICdDYWxsc3RhY2tPckV4Y2VwdGlvbic7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3Igc3RhY2suIFZTIENvZGUgdGVsZW1ldHJ5IHNjcnVicyBmaWxlIHBhdGhzIGFuZCBsaWtlbHkgc2VjcmV0cyBiZWZvcmUgdHJhbnNtaXNzaW9uLicgfTtcblx0b3duZXI6ICdyb2Jsb3VyZW5zJztcblx0Y29tbWVudDogJ0NhcHR1cmVzIGVycm9ycyB0aGF0IHByZXZlbnQgYW4gYWdlbnQgaG9zdCByZXF1ZXN0IGZyb20gcmVhY2hpbmcgYSB0ZXJtaW5hbCBob3N0IHR1cm4uJztcbn07XG5cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEFnZW50SG9zdFNlc3Npb25IYW5kbGVyIC0gcmVuZGVyZXItc2lkZSBoYW5kbGVyIGZvciBhIHNpbmdsZSBhZ2VudCBob3N0XG4vLyBjaGF0IHNlc3Npb24gdHlwZS4gQnJpZGdlcyB0aGUgcHJvdG9jb2wgc3RhdGUgbGF5ZXIgd2l0aCB0aGUgY2hhdCBVSTpcbi8vIHN1YnNjcmliZXMgdG8gc2Vzc2lvbiBzdGF0ZSwgZGVyaXZlcyBJQ2hhdFByb2dyZXNzW10gZnJvbSBpbW11dGFibGUgc3RhdGVcbi8vIGNoYW5nZXMsIGFuZCBkaXNwYXRjaGVzIGNsaWVudCBhY3Rpb25zICh0dXJuU3RhcnRlZCwgdG9vbENhbGxDb25maXJtZWQsXG4vLyB0dXJuQ2FuY2VsbGVkKSBiYWNrIHRvIHRoZSBzZXJ2ZXIuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIE9wdGlvbnMgdGhyZWFkZWQgaW50byB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuX29ic2VydmVUdXJufS4gVGhlXG4gKiBzYW1lIG9ic2VydmF0aW9uIHBpcGVsaW5lIGlzIHVzZWQgZm9yIGxpdmUgKGBfaGFuZGxlVHVybmApLCByZWNvbm5lY3RlZFxuICogKHNuYXBzaG90IGZyb20gYHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnRgKSwgYW5kIHNlcnZlci1pbml0aWF0ZWQgdHVybnNcbiAqIChgX3dhdGNoRm9yU2VydmVySW5pdGlhdGVkVHVybnNgKS4gVGhlIGRpZmZlcmVuY2VzIGFyZSBjYXB0dXJlZCBoZXJlOlxuICpcbiAqIC0ge0BsaW5rIHNpbmt9IHJvdXRlcyBlbWl0dGVkIHByb2dyZXNzIHRvIGVpdGhlciB0aGUgYWdlbnQgaW52b2tlXG4gKiAgIGNhbGxiYWNrIChsaXZlKSBvciBgY2hhdFNlc3Npb24uYXBwZW5kUHJvZ3Jlc3NgIChyZWNvbm5lY3QgL1xuICogICBzZXJ2ZXItaW5pdGlhdGVkKS5cbiAqIC0ge0BsaW5rIGFkb3B0SW52b2NhdGlvbnN9IGNhcnJpZXMgYENoYXRUb29sSW52b2NhdGlvbmAgaW5zdGFuY2VzIHRoYXRcbiAqICAgYGFjdGl2ZVR1cm5Ub1Byb2dyZXNzYCBhbHJlYWR5IHByb2R1Y2VkIHNvIHBlci10b29sIHNldHVwIGFkb3B0cyB0aGVtXG4gKiAgIHJhdGhlciB0aGFuIHJlY3JlYXRpbmcgVUkgaGFuZGxlcy5cbiAqIC0ge0BsaW5rIHNlZWRFbWl0dGVkTGVuZ3Roc30gcHJldmVudHMgdGhlIGFsd2F5cy1vbiBncmFwaCBmcm9tIHJlLWVtaXR0aW5nXG4gKiAgIG1hcmtkb3duIC8gcmVhc29uaW5nIHByZWZpeGVzIGFscmVhZHkgY292ZXJlZCBieSB0aGUgc25hcHNob3QuXG4gKiAtIHtAbGluayBvblR1cm5FbmRlZH0gZmlyZXMgb25jZSB3aGVuIHRoZSB0dXJuIHJlYWNoZXMgYSB0ZXJtaW5hbCBzdGF0ZS5cbiAqL1xuaW50ZXJmYWNlIElPYnNlcnZlVHVybk9wdGlvbnMge1xuXHRyZWFkb25seSBiYWNrZW5kU2Vzc2lvbjogVVJJO1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0LyoqXG5cdCAqIFRoZSBjaGF0IGNoYW5uZWwgVVJJIChhcyBhIHN0cmluZykgdGhpcyB0dXJuJ3MgY29udmVyc2F0aW9uIGFjdGlvbnNcblx0ICogKHR1cm4gbGlmZWN5Y2xlLCB0b29sIGNhbGxzLCBpbnB1dCBhbnN3ZXJzKSBkaXNwYXRjaCB0by4gRm9yIGEgc2Vzc2lvbidzXG5cdCAqIGRlZmF1bHQgY2hhdCB0aGlzIGlzIHRoZSBkZWZhdWx0IGNoYXQgVVJJOyBmb3IgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQgaXRcblx0ICogaXMgdGhhdCBjaGF0J3MgVVJJLiBSZXNvbHZlZCBmcm9tIHRoZSB1cHN0cmVhbSBzZXNzaW9uL2NoYXQgc3RhdGUgYW5kXG5cdCAqIHN0b3JlZCBpbiB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuX2NoYXRVUklzQnlTZXNzaW9uUmVzb3VyY2V9LlxuXHQgKi9cblx0cmVhZG9ubHkgY2hhdFVSSTogc3RyaW5nO1xuXHRyZWFkb25seSB0dXJuSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2luazogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQ7XG5cdHJlYWRvbmx5IGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbjtcblx0cmVhZG9ubHkgYWRvcHRJbnZvY2F0aW9ucz86IFJlYWRvbmx5TWFwPHN0cmluZywgQ2hhdFRvb2xJbnZvY2F0aW9uPjtcblx0cmVhZG9ubHkgc2VlZEVtaXR0ZWRMZW5ndGhzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHRyZWFkb25seSBpbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IG9uVHVybkVuZGVkPzogKGxhc3RUdXJuOiBUdXJuIHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xuXHRyZWFkb25seSBvbkZpbGVFZGl0cz86ICh0YzogVG9vbENhbGxTdGF0ZSwgZmlsZUVkaXRzOiBJVG9vbENhbGxGaWxlRWRpdFtdKSA9PiB2b2lkO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIGEgZmFpbGVkIHR1cm4gZG9lcyBOT1QgZW1pdCBpdHMgZXJyb3IgYXMgYSBtYXJrZG93biBwcm9ncmVzc1xuXHQgKiBwYXJ0LiBUaGUgY2FsbGVyIHN1cmZhY2VzIGl0IGluc3RlYWQgYXMgdGhlIGFnZW50IHJlc3VsdCdzXG5cdCAqIGBlcnJvckRldGFpbHNgIChlLmcuIHNvIHF1b3RhIGVycm9ycyByZW5kZXIgdGhlIHVwZ3JhZGUgYWZmb3JkYW5jZSkuXG5cdCAqL1xuXHRyZWFkb25seSBzdXBwcmVzc0Vycm9yTWFya2Rvd24/OiBib29sZWFuO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoaXMgdHVybiBpcyBiZWluZyBvYnNlcnZlZCBhcyBwYXJ0IG9mIGEgc3ViYWdlbnQgc2Vzc2lvbi5cblx0ICogVG9vbCBjYWxscyBlbWl0dGVkIGludG8ge0BsaW5rIHNpbmt9IGFyZSB0YWdnZWQgd2l0aCB0aGlzIGlkIHNvIHRoZVxuXHQgKiByZW5kZXJlciBncm91cHMgdGhlbSB1bmRlciB0aGUgcGFyZW50IHN1YmFnZW50IHdpZGdldC4gTWFya2Rvd24sXG5cdCAqIHJlYXNvbmluZywgYW5kIGlucHV0IHJlcXVlc3RzIGFyZSBub3QgZm9yd2FyZGVkICh0aGUgc3ViYWdlbnQncyBvd25cblx0ICogc2Vzc2lvbiB2aWV3IHJlbmRlcnMgdGhvc2UpOyBuZXN0ZWQgc3ViYWdlbnRzIGFyZSBvYnNlcnZlZCByZWN1cnNpdmVseS5cblx0ICovXG5cdHJlYWRvbmx5IHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nO1xuXHQvKipcblx0ICogV2hlbiBzZXQgb24gYSBzdWJhZ2VudCB0dXJuIG9ic2VydmVyLCBhbiBvYnNlcnZhYmxlIHRoYXQgYWNjdW11bGF0ZXNcblx0ICogY29waWxvdCBjcmVkaXRzIHJlcG9ydGVkIGJ5IHRoaXMgc3ViYWdlbnQncyB0dXJucy4gU3ViYWdlbnQgdHVyblxuXHQgKiBvYnNlcnZlcnMgYWRkIHRoZWlyIGNyZWRpdHMgaGVyZTsgdGhlIHZhbHVlIGlzIHN1cmZhY2VkIG9uIHRoZSBzdWJhZ2VudFxuXHQgKiB0b29sJ3MgaG92ZXIgYW5kIGZvcndhcmRlZCBpbnRvIHRoZSBwYXJlbnQgdHVybidzIHNoYXJlZCBhY2N1bXVsYXRvciBzb1xuXHQgKiB0aGUgc2Vzc2lvbiBjb3N0IHN0aWxsIGluY2x1ZGVzIHRoZW0uXG5cdCAqL1xuXHRyZWFkb25seSBzdWJBZ2VudENyZWRpdHNBY2N1bXVsYXRvcj86IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPjtcblx0LyoqXG5cdCAqIFdoZW4gc2V0IG9uIGEgc3ViYWdlbnQgdHVybiBvYnNlcnZlciwgYW4gb2JzZXJ2YWJsZSB0aGF0IHJlY2VpdmVzIHRoZVxuXHQgKiBkaXNwbGF5IG5hbWUgb2YgdGhlIGxhbmd1YWdlIG1vZGVsIHRoaXMgc3ViYWdlbnQncyB0dXJucyByYW4gb24uIFVzZWQgdG9cblx0ICogc3VyZmFjZSB0aGUgbW9kZWwgb24gdGhlIHN1YmFnZW50IHRvb2wncyBob3ZlciAobWlycm9ycyB0aGUgbG9jYWxcblx0ICogc3ViYWdlbnQgcGF0aCwgd2hpY2ggc2V0cyBgbW9kZWxOYW1lYCBkaXJlY3RseSkuXG5cdCAqL1xuXHRyZWFkb25seSBzdWJBZ2VudE1vZGVsT2JzZXJ2YWJsZT86IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcbn1cblxuLyoqXG4gKiBTaGFyZWQgY29udGV4dCBmb3Igc3ViYWdlbnQgb2JzZXJ2YXRpb24gd2l0aGluIGEgcGFyZW50IHR1cm4uIFRyYWNrcyB3aGljaFxuICogc3ViYWdlbnQgdG9vbCBjYWxscyBhbHJlYWR5IGhhdmUgb2JzZXJ2ZXJzIHNvIHRoZXkgYXJlbid0IGRvdWJsZS1zdWJzY3JpYmVkLlxuICovXG5pbnRlcmZhY2UgSVN1YmFnZW50Q29udGV4dCB7XG5cdC8qKiBUb29sIGNhbGwgSURzIGFscmVhZHkgc3Vic2NyaWJlZCBcdTIwMTQgcHJldmVudHMgZHVwbGljYXRlIG9ic2VydmVycy4gKi9cblx0cmVhZG9ubHkgb2JzZXJ2ZWRUb29sSWRzOiBTZXQ8c3RyaW5nPjtcbn1cblxuaW50ZXJmYWNlIElPdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQge1xuXHRzZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPjtcbn1cblxuZnVuY3Rpb24gZ2V0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcnMoc2Vzc2lvblJlc291cmNlOiBVUkksIHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCk6IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcltdIHtcblx0Y29uc3Qgc2VydmVycyA9IHN0YXRlPy5jdXN0b21pemF0aW9ucz8uZmxhdE1hcChjID0+IGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyXG5cdFx0PyBbY11cblx0XHQ6IGMuY2hpbGRyZW4/LmZpbHRlcihjID0+IGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSA/PyBbXSkgPz8gW107XG5cdGNvbnN0IHRvb2xBdXRoU2VydmVySWRzID0gbmV3IFNldChzdGF0ZT8uaW5wdXROZWVkZWRcblx0XHQ/LmZpbHRlcihyZXF1ZXN0ID0+IHJlcXVlc3Qua2luZCA9PT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbEF1dGhlbnRpY2F0aW9uKVxuXHRcdC5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xBdXRoZW50aWNhdGlvblxuXHRcdFx0PyByZXF1ZXN0LnRvb2xDYWxsLmNvbnRyaWJ1dG9yLmN1c3RvbWl6YXRpb25JZFxuXHRcdFx0OiB1bmRlZmluZWQpXG5cdFx0LmZpbHRlcihpZCA9PiBpZCAhPT0gdW5kZWZpbmVkKSk7XG5cdHJldHVybiBzZXJ2ZXJzXG5cdFx0LmZpbHRlcihzZXJ2ZXIgPT4gc2VydmVyLmVuYWJsZWQgJiYgc2VydmVyLnN0YXRlLmtpbmQgPT09IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQgJiYgIXRvb2xBdXRoU2VydmVySWRzLmhhcyhzZXJ2ZXIuaWQpKVxuXHRcdC5tYXAoKHNlcnZlcik6IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZlci5zdGF0ZSBhcyBNY3BTZXJ2ZXJBdXRoUmVxdWlyZWRTdGF0ZTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5ICsgJy8nICsgc2VydmVyLmlkLFxuXHRcdFx0XHRuYW1lOiBzZXJ2ZXIubmFtZSxcblx0XHRcdFx0cmVzb3VyY2U6IHN0YXRlLnJlc291cmNlLnJlc291cmNlLFxuXHRcdFx0XHRvYXV0aENsaWVudDogc3RhdGUub2F1dGhDbGllbnQsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBzdGF0ZS5yZXNvdXJjZS5hdXRob3JpemF0aW9uX3NlcnZlcnMsXG5cdFx0XHRcdHN1cHBvcnRlZFNjb3Blczogc3RhdGUucmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRcdFx0cmVxdWlyZWRTY29wZXM6IHN0YXRlLnJlcXVpcmVkU2NvcGVzLFxuXHRcdFx0XHRyZWFzb246IHN0YXRlLnJlYXNvbixcblx0XHRcdH07XG5cdFx0fSk7XG59XG5cbmludGVyZmFjZSBJU3RhcnRTZXJ2ZXJSZXF1ZXN0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdGltZXN0YW1wPzogbnVtYmVyO1xuXHRyZWFkb25seSBpc1Rlcm1pbmFsUmVxdWVzdD86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIHBhcnNlVGltZXN0YW1wKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLnBhcnNlKHZhbHVlKTtcblx0cmV0dXJuIE51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApID8gdGltZXN0YW1wIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRTdWJhZ2VudFRpbWluZyhzdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQpOiB7IHN0YXJ0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkOyBkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkIH0ge1xuXHRjb25zdCB0dXJucyA9IHN0YXRlLmFjdGl2ZVR1cm4gPyBbLi4uc3RhdGUudHVybnMsIHN0YXRlLmFjdGl2ZVR1cm5dIDogc3RhdGUudHVybnM7XG5cdGNvbnN0IHN0YXJ0cyA9IHR1cm5zXG5cdFx0Lm1hcCh0dXJuID0+IHR1cm4uc3RhcnRlZEF0ID8gRGF0ZS5wYXJzZSh0dXJuLnN0YXJ0ZWRBdCkgOiB1bmRlZmluZWQpXG5cdFx0LmZpbHRlcigodGltZXN0YW1wKTogdGltZXN0YW1wIGlzIG51bWJlciA9PiB0aW1lc3RhbXAgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUodGltZXN0YW1wKSk7XG5cdGNvbnN0IHN0YXJ0ZWRBdCA9IHN0YXJ0cy5sZW5ndGggPiAwID8gTWF0aC5taW4oLi4uc3RhcnRzKSA6IHVuZGVmaW5lZDtcblx0aWYgKHN0YXJ0ZWRBdCA9PT0gdW5kZWZpbmVkIHx8IHN0YXRlLmFjdGl2ZVR1cm4pIHtcblx0XHRyZXR1cm4geyBzdGFydGVkQXQsIGR1cmF0aW9uOiB1bmRlZmluZWQgfTtcblx0fVxuXHRjb25zdCBlbmRzID0gc3RhdGUudHVybnMuZmxhdE1hcCh0dXJuID0+IHtcblx0XHRjb25zdCB0dXJuU3RhcnRlZEF0ID0gdHVybi5zdGFydGVkQXQgPyBEYXRlLnBhcnNlKHR1cm4uc3RhcnRlZEF0KSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdHVyblN0YXJ0ZWRBdCAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZSh0dXJuU3RhcnRlZEF0KSAmJiB0eXBlb2YgdHVybi5kdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHR1cm4uZHVyYXRpb24pXG5cdFx0XHQ/IFt0dXJuU3RhcnRlZEF0ICsgTWF0aC5tYXgoMCwgdHVybi5kdXJhdGlvbildXG5cdFx0XHQ6IFtdO1xuXHR9KTtcblx0Y29uc3QgZW5kZWRBdCA9IGVuZHMubGVuZ3RoID4gMCA/IE1hdGgubWF4KC4uLmVuZHMpIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4geyBzdGFydGVkQXQsIGR1cmF0aW9uOiBlbmRlZEF0ICE9PSB1bmRlZmluZWQgPyBNYXRoLm1heCgwLCBlbmRlZEF0IC0gc3RhcnRlZEF0KSA6IHVuZGVmaW5lZCB9O1xufVxuXG5mdW5jdGlvbiB1c2VyT3JpZ2luTWVzc2FnZSh0ZXh0OiBzdHJpbmcsIGF0dGFjaG1lbnRzOiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkKTogTWVzc2FnZSB7XG5cdHJldHVybiBhdHRhY2htZW50cz8ubGVuZ3RoXG5cdFx0PyB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGF0dGFjaG1lbnRzOiBbLi4uYXR0YWNobWVudHNdIH1cblx0XHQ6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9O1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGEgdXNlci1mYWNpbmcgbWVzc2FnZSBmcm9tIGEgc2Vzc2lvbi1sb2FkIGZhaWx1cmUgc28gdGhlIGFjdHVhbCBjYXVzZVxuICogKGUuZy4gYSBnaXQgd29ya3RyZWUtcmVjcmVhdGlvbiBlcnJvcikgaXMgc2hvd24gaW5zdGVhZCBvZiBhIGdlbmVyaWMgbWVzc2FnZS5cbiAqIFN0cmlwcyB0aGUgYEZhaWxlZCB0byByZXN0b3JlIHNlc3Npb24gPHVyaT46IGAgd3JhcHBlciB0aGF0IGBBZ2VudFNlcnZpY2VgXG4gKiBhZGRzIGFyb3VuZCByZXN0b3JlIGZhaWx1cmVzLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm8gbWVzc2FnZSBpcyBhdmFpbGFibGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bndyYXBTZXNzaW9uTG9hZEVycm9yTWVzc2FnZShlcnI6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICh0eXBlb2YgZXJyID09PSAnc3RyaW5nJyA/IGVyciA6IHVuZGVmaW5lZCk7XG5cdGlmICghbWVzc2FnZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gVGhlIHNlc3Npb24gVVJJIGluIHRoZSBwcmVmaXggY29udGFpbnMgYHNjaGVtZTovXHUyMDI2YCAoY29sb24tc2xhc2gpLCBuZXZlclxuXHQvLyBgOiBgIChjb2xvbi1zcGFjZSksIHNvIHRoZSBub24tZ3JlZWR5IG1hdGNoIHN0b3BzIGF0IHRoZSB3cmFwcGVyIHNlcGFyYXRvci5cblx0cmV0dXJuIG1lc3NhZ2UucmVwbGFjZSgvXkZhaWxlZCB0byByZXN0b3JlIHNlc3Npb24gLis/OiAvLCAnJyk7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYSBzZXNzaW9uJ3MgbGFzdC11c2VkIG1vZGVsIHNlbGVjdGlvbiBmcm9tIGl0cyBsaXZlIHR1cm5zLiBNb2RlbFxuICogc2VsZWN0aW9uIG1vdmVkIG9mZiB0aGUgc2Vzc2lvbi9jaGF0IHN1bW1hcnkgYW5kIG9udG8gZWFjaCB7QGxpbmsgTWVzc2FnZX07XG4gKiB0aGUgdmFsdWUgdG8gZGVmYXVsdCB0byBpcyB0aGUgb25lIGNhcnJpZWQgYnkgdGhlIG1vc3QgcmVjZW50IHR1cm4gKHRoZVxuICogYWN0aXZlIHR1cm4gaWYgb25lIGlzIHJ1bm5pbmcsIGVsc2UgdGhlIGxhc3QgY29tcGxldGVkIHR1cm4pLlxuICovXG5mdW5jdGlvbiBsYXN0VHVybk1vZGVsU2VsZWN0aW9uKHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCk6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGxhc3RUdXJuTWVzc2FnZShzdGF0ZSk/Lm1vZGVsO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgYSBwcm9ncmVzcyBlbWlzc2lvbiBjb3VudHMgYXMgdGhlIHR1cm4ncyBmaXJzdCB2aXNpYmxlIHByb2dyZXNzXG4gKiBmb3IgdGltZS10by1maXJzdC1wcm9ncmVzcyB0ZWxlbWV0cnkuIE1pcnJvcnMgdGhlIGFnZW50IGhvc3QncyBvd25cbiAqIGRlZmluaXRpb24gKHRleHQgZGVsdGEsIHJlc3BvbnNlIHBhcnQsIHRvb2wgY2FsbCBzdGFydCwgb3IgcmVhc29uaW5nKS5cbiAqL1xuZnVuY3Rpb24gaXNGaXJzdFZpc2libGVQcm9ncmVzc1BhcnQocGFydDogSUNoYXRQcm9ncmVzcyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGFydC5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyB8fCBwYXJ0LmtpbmQgPT09ICd0aGlua2luZycgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nO1xufVxuXG5mdW5jdGlvbiBsYXN0VHVybk1lc3NhZ2Uoc3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IHwgdW5kZWZpbmVkKTogTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBzdGF0ZT8uYWN0aXZlVHVybj8ubWVzc2FnZSA/PyAoc3RhdGUgJiYgc3RhdGUudHVybnMubGVuZ3RoID8gc3RhdGUudHVybnNbc3RhdGUudHVybnMubGVuZ3RoIC0gMV0ubWVzc2FnZSA6IHVuZGVmaW5lZCk7XG59XG5cbmZ1bmN0aW9uIGVtcHR5RHJhZnRGcm9tTGFzdFR1cm4oc3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0KTogTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1lc3NhZ2UgPSBsYXN0VHVybk1lc3NhZ2Uoc3RhdGUpO1xuXHRpZiAoIW1lc3NhZ2U/Lm1vZGVsICYmICFtZXNzYWdlPy5hZ2VudCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHR0ZXh0OiAnJyxcblx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdC4uLihtZXNzYWdlLm1vZGVsID8geyBtb2RlbDogbWVzc2FnZS5tb2RlbCB9IDoge30pLFxuXHRcdC4uLihtZXNzYWdlLmFnZW50ID8geyBhZ2VudDogbWVzc2FnZS5hZ2VudCB9IDoge30pLFxuXHR9O1xufVxuXG4vKipcbiAqIFdoZXRoZXIgdHdvIGRyYWZ0cyBjYXJyeSB0aGUgc2FtZSB1c2VyLWF1dGhvcmVkIGNvbnRlbnQsIGlnbm9yaW5nIHRoZVxuICoge0BsaW5rIE1lc3NhZ2UubW9kZWwgfCBtb2RlbH0gLyB7QGxpbmsgTWVzc2FnZS5hZ2VudCB8IGFnZW50fSBzZWxlY3Rpb24uXG4gKlxuICogVXNlZCB0byByZWNvZ25pemUgYSBkcmFmdCB0aGF0IGRpZmZlcnMgZnJvbSBhbiBhcHBsaWVkIHJlbW90ZSBvbmUgb25seVxuICogYmVjYXVzZSB0aGlzIGNsaWVudCBzdWJzdGl0dXRlZCBhIG1vZGVsIGl0IGNvdWxkIHJlc29sdmUgbG9jYWxseSwgd2hpY2ggbXVzdFxuICogbm90IGJlIHB1Ymxpc2hlZCBiYWNrIG92ZXIgdGhlIG9yaWdpbmF0aW5nIGNsaWVudCdzIHNlbGVjdGlvbi5cbiAqL1xuZnVuY3Rpb24gc2FtZURyYWZ0VXNlckNvbnRlbnQoYTogTWVzc2FnZSB8IHVuZGVmaW5lZCwgYjogTWVzc2FnZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGE/LnRleHQgPz8gJycpID09PSAoYj8udGV4dCA/PyAnJykgJiYgZXF1YWxzKGE/LmF0dGFjaG1lbnRzLCBiPy5hdHRhY2htZW50cyk7XG59XG5cbi8qKlxuICogTWFwIGEgbG9jYWwge0BsaW5rIENvbmZpcm1lZFJlYXNvbn0gKGhvdyB0aGUge0BsaW5rIENoYXRUb29sSW52b2NhdGlvbn1cbiAqIHJlc29sdmVkIGl0cyBjb25maXJtYXRpb24gZ2F0ZSkgdG8gdGhlIHByb3RvY29sJ3NcbiAqIHtAbGluayBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbn0uIE9ubHkgY2FsbGVkIGZvciBhcHByb3ZlZCByZWFzb25zXG4gKiAoe0BsaW5rIFRvb2xDb25maXJtS2luZC5EZW5pZWR9IC8ge0BsaW5rIFRvb2xDb25maXJtS2luZC5Ta2lwcGVkfSBhcmVcbiAqIGhhbmRsZWQgYnkgdGhlIGBhcHByb3ZlZDogZmFsc2VgIGJyYW5jaCkuXG4gKi9cbmZ1bmN0aW9uIGNvbmZpcm1lZFJlYXNvblRvUHJvdG9jb2wocmVhc29uOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQpOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiB7XG5cdHN3aXRjaCAocmVhc29uPy50eXBlKSB7XG5cdFx0Y2FzZSBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkOlxuXHRcdFx0cmV0dXJuIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZDtcblx0XHRjYXNlIFRvb2xDb25maXJtS2luZC5TZXR0aW5nOlxuXHRcdGNhc2UgVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2w6XG5cdFx0XHRyZXR1cm4gVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uU2V0dGluZztcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb247XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Q2xpZW50VG9vbFByZUFwcHJvdmFsKHRvb2xDYWxsOiBUb29sQ2FsbFN0YXRlKTogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkIHtcblx0aWYgKHJlYWRUb29sQ2FsbE1ldGEodG9vbENhbGwpLmF1dG9BcHByb3ZlQnlTZXR0aW5nID09PSB0cnVlKSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcsIGlkOiBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlIH07XG5cdH1cblxuXHQvLyBPbmx5IHRydXN0IGBSdW5uaW5nYCBhbmQgYEF1dGhSZXF1aXJlZGAgYXMgZXZpZGVuY2Ugb2YgYSBnZW51aW5lXG5cdC8vIGFwcHJvdmFsOiB0aGV5IGNhbiBvbmx5IGJlIGVudGVyZWQgYWZ0ZXIgdGhlIGFnZW50IGhvc3QgY29uZmlybWVkIHRoZVxuXHQvLyBjYWxsLCBzbyB0aGVpciBgY29uZmlybWVkYCByZWFzb24gaXMgYXV0aG9yaXRhdGl2ZS4gYENvbXBsZXRlZGAgYW5kXG5cdC8vIGBQZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uYCBhcmUgZXhjbHVkZWQgYmVjYXVzZSB0aGUgcmVkdWNlclxuXHQvLyBzeW50aGVzaXplcyBhIGBOb3ROZWVkZWRgIGNvbmZpcm1hdGlvbiB3aGVuIGEgYENoYXRUb29sQ2FsbENvbXBsZXRlYFxuXHQvLyBhcnJpdmVzIHdoaWxlIHRoZSBjYWxsIGlzIHN0aWxsIGBQZW5kaW5nQ29uZmlybWF0aW9uYCwgd2hpY2ggd291bGRcblx0Ly8gb3RoZXJ3aXNlIGxldCB1cyBmYWxzZWx5IGNvbmZpcm0gYW5kIGV4ZWN1dGUgYSBjYWxsIHRoYXQgd2FzIG5ldmVyXG5cdC8vIGFwcHJvdmVkLlxuXHRzd2l0Y2ggKHRvb2xDYWxsLnN0YXR1cykge1xuXHRcdGNhc2UgVG9vbENhbGxTdGF0dXMuUnVubmluZzpcblx0XHRjYXNlIFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZDpcblx0XHRcdHN3aXRjaCAodG9vbENhbGwuY29uZmlybWVkKSB7XG5cdFx0XHRcdGNhc2UgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkOlxuXHRcdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfTtcblx0XHRcdFx0Y2FzZSBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nOlxuXHRcdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5TZXR0aW5nLCBpZDogU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSB9O1xuXHRcdFx0XHRjYXNlIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb246XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfTtcblx0XHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgdG9vbCBjYWxsJ3MgYF9tZXRhYCB3aXRoIHRoZSB0cmFuc2llbnRcbiAqIHtAbGluayBJVG9vbENhbGxNZXRhLnRvb2xTZWFyY2hDYW5kaWRhdGVzfSBjb3JwdXMgcmVtb3ZlZC4gQWx3YXlzIHJldHVybnMgYW5cbiAqIG9iamVjdCAobmV2ZXIgYHVuZGVmaW5lZGApIHNvIGEgY29tcGxldGlvbiBhY3Rpb24gY2FuIGZvcmNlLXJlcGxhY2UgdGhlIHByaW9yXG4gKiBgX21ldGFgIFx1MjAxNCB0aGUgcmVkdWNlciBrZWVwcyB0aGUgZXhpc3RpbmcgYmFnIHdoZW4gYW4gYWN0aW9uIG9taXRzIG9uZSwgc28gYW5cbiAqIGV4cGxpY2l0IGVtcHR5IHJlcGxhY2VtZW50IGlzIHdoYXQgYWN0dWFsbHkgZHJvcHMgdGhlIGNhbmRpZGF0ZXMuXG4gKi9cbmZ1bmN0aW9uIG1ldGFXaXRob3V0VG9vbFNlYXJjaENhbmRpZGF0ZXMoc291cmNlOiB7IHJlYWRvbmx5IF9tZXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0Y29uc3QgbWV0YSA9IHsgLi4uc291cmNlLl9tZXRhIH07XG5cdGRlbGV0ZSBtZXRhWyd0b29sU2VhcmNoQ2FuZGlkYXRlcyddO1xuXHRyZXR1cm4gbWV0YTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBjYXJvdXNlbCBhbnN3ZXJzIChJQ2hhdFF1ZXN0aW9uQW5zd2VycykgdG8gcHJvdG9jb2xcbiAqIENoYXRJbnB1dEFuc3dlciByZWNvcmRzLCBoYW5kbGluZyB0ZXh0LCBzaW5nbGUtc2VsZWN0LFxuICogYm9vbGVhbiwgYW5kIG11bHRpLXNlbGVjdCBhbnN3ZXIgc2hhcGVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29udmVydENhcm91c2VsQW5zd2VycyhyYXc6IElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBxdWVzdGlvbnM6IHJlYWRvbmx5IENoYXRJbnB1dFF1ZXN0aW9uW10gPSBbXSk6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4ge1xuXHRjb25zdCBhbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+ID0ge307XG5cdGNvbnN0IHF1ZXN0aW9uS2luZHMgPSBuZXcgTWFwKHF1ZXN0aW9ucy5tYXAocXVlc3Rpb24gPT4gW3F1ZXN0aW9uLmlkLCBxdWVzdGlvbi5raW5kXSkpO1xuXHRmb3IgKGNvbnN0IFtxSWQsIGFuc3dlcl0gb2YgT2JqZWN0LmVudHJpZXMocmF3KSkge1xuXHRcdGlmICh0eXBlb2YgYW5zd2VyID09PSAnc3RyaW5nJykge1xuXHRcdFx0YW5zd2Vyc1txSWRdID0ge1xuXHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6IGFuc3dlciB9LFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGFuc3dlciAmJiB0eXBlb2YgYW5zd2VyID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29uc3QgbXVsdGkgPSBhbnN3ZXIgYXMgSUNoYXRNdWx0aVNlbGVjdEFuc3dlcjtcblx0XHRcdGNvbnN0IHNpbmdsZSA9IGFuc3dlciBhcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlcjtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KG11bHRpLnNlbGVjdGVkVmFsdWVzKSkge1xuXHRcdFx0XHQvLyBNdWx0aS1zZWxlY3QgYW5zd2VyXG5cdFx0XHRcdGFuc3dlcnNbcUlkXSA9IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LFxuXHRcdFx0XHRcdFx0dmFsdWU6IG11bHRpLnNlbGVjdGVkVmFsdWVzLFxuXHRcdFx0XHRcdFx0ZnJlZWZvcm1WYWx1ZXM6IG11bHRpLmZyZWVmb3JtVmFsdWUgPyBbbXVsdGkuZnJlZWZvcm1WYWx1ZV0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoc2luZ2xlLnNlbGVjdGVkVmFsdWUgJiYgcXVlc3Rpb25LaW5kcy5nZXQocUlkKSA9PT0gQ2hhdElucHV0UXVlc3Rpb25LaW5kLkJvb2xlYW4pIHtcblx0XHRcdFx0YW5zd2Vyc1txSWRdID0ge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5Cb29sZWFuLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHNpbmdsZS5zZWxlY3RlZFZhbHVlID09PSBCT09MRUFOX1RSVUVfT1BUSU9OX0lELFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHNpbmdsZS5zZWxlY3RlZFZhbHVlKSB7XG5cdFx0XHRcdC8vIFNpbmdsZS1zZWxlY3QgYW5zd2VyXG5cdFx0XHRcdGFuc3dlcnNbcUlkXSA9IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsXG5cdFx0XHRcdFx0XHR2YWx1ZTogc2luZ2xlLnNlbGVjdGVkVmFsdWUsXG5cdFx0XHRcdFx0XHRmcmVlZm9ybVZhbHVlczogc2luZ2xlLmZyZWVmb3JtVmFsdWUgPyBbc2luZ2xlLmZyZWVmb3JtVmFsdWVdIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHNpbmdsZS5mcmVlZm9ybVZhbHVlKSB7XG5cdFx0XHRcdC8vIEZyZWVmb3JtLW9ubHkgYW5zd2VyIChubyBzZWxlY3Rpb24pXG5cdFx0XHRcdGFuc3dlcnNbcUlkXSA9IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogc2luZ2xlLmZyZWVmb3JtVmFsdWUgfSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGFuc3dlcnM7XG59XG5cbnR5cGUgUGxhblJldmlld0lucHV0Q29tcGxldGlvbiA9IHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfTtcblxuZnVuY3Rpb24gZ2V0UGxhblJldmlld0FjdGlvbihwbGFuUmV2aWV3OiBJQWdlbnRIb3N0UGxhblJldmlldywgYWN0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgYWN0aW9uTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRpZiAoYWN0aW9uSWQpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBwbGFuUmV2aWV3LmFjdGlvbnMuZmluZChhID0+IGEuaWQgPT09IGFjdGlvbklkKTtcblx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdH1cblx0fVxuXHRpZiAoYWN0aW9uTGFiZWwpIHtcblx0XHRyZXR1cm4gcGxhblJldmlldy5hY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSBhY3Rpb25MYWJlbCk7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc3VibWl0dGVkVGV4dEFuc3dlcih2YWx1ZTogc3RyaW5nKTogQ2hhdElucHV0QW5zd2VyIHtcblx0cmV0dXJuIHtcblx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZSB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzdWJtaXR0ZWRTZWxlY3RlZEFuc3dlcih2YWx1ZTogc3RyaW5nLCBmZWVkYmFjaz86IHN0cmluZyk6IENoYXRJbnB1dEFuc3dlciB7XG5cdHJldHVybiB7XG5cdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHR2YWx1ZToge1xuXHRcdFx0a2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHQuLi4oZmVlZGJhY2sgPyB7IGZyZWVmb3JtVmFsdWVzOiBbZmVlZGJhY2tdIH0gOiB7fSksXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY29udmVydFBsYW5SZXZpZXdSZXN1bHQocGxhblJldmlldzogSUFnZW50SG9zdFBsYW5SZXZpZXcsIHJlc3VsdDogSUNoYXRQbGFuUmV2aWV3UmVzdWx0KTogUGxhblJldmlld0lucHV0Q29tcGxldGlvbiB7XG5cdGNvbnN0IGZlZWRiYWNrID0gcmVzdWx0LmZlZWRiYWNrPy50cmltKCk7XG5cdGlmIChmZWVkYmFjaykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldywgcmVzdWx0LmFjdGlvbklkLCByZXN1bHQuYWN0aW9uKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0XHRhbnN3ZXJzOiB7XG5cdFx0XHRcdFtwbGFuUmV2aWV3LmFuc3dlclF1ZXN0aW9uSWRdOiBhY3Rpb25cblx0XHRcdFx0XHQ/IHN1Ym1pdHRlZFNlbGVjdGVkQW5zd2VyKGFjdGlvbi5pZCwgZmVlZGJhY2spXG5cdFx0XHRcdFx0OiBzdWJtaXR0ZWRUZXh0QW5zd2VyKGZlZWRiYWNrKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGlmIChyZXN1bHQucmVqZWN0ZWQpIHtcblx0XHRyZXR1cm4geyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUgfTtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbiA9IGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldywgcmVzdWx0LmFjdGlvbklkLCByZXN1bHQuYWN0aW9uKTtcblx0aWYgKCFhY3Rpb24pIHtcblx0XHRyZXR1cm4geyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUgfTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0YW5zd2Vyczoge1xuXHRcdFx0W3BsYW5SZXZpZXcuYW5zd2VyUXVlc3Rpb25JZF06IHN1Ym1pdHRlZFNlbGVjdGVkQW5zd2VyKGFjdGlvbi5pZCksXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gaW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0S2V5KHBhcnQ6IElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCk6IHN0cmluZyB7XG5cdHJldHVybiBgaXI6JHtwYXJ0LnJlcXVlc3QuaWR9OiR7SlNPTi5zdHJpbmdpZnkoeyAuLi5wYXJ0LnJlcXVlc3QsIGFuc3dlcnM6IHVuZGVmaW5lZCB9KX1gO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ2hhdCBzZXNzaW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBBZ2VudEhvc3RDaGF0U2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdFNlc3Npb24ge1xuXHRyZWFkb25seSBwcm9ncmVzc09icyA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFByb2dyZXNzW10+KCdhZ2VudEhvc3RQcm9ncmVzcycsIFtdKTtcblx0cmVhZG9ubHkgaXNDb21wbGV0ZU9icyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignYWdlbnRIb3N0Q29tcGxldGUnLCB0cnVlKTtcblx0cmVhZG9ubHkgaXNSZWFkT25seTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ+Pih0aGlzLCBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJT2JzZXJ2YWJsZTxDaGF0U3RhdGUgfCB1bmRlZmluZWQ+Pih0aGlzLCBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdENhY2hlVHJhY2tpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZSA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydFNlcnZlclJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25TZXJ2ZXJSZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRTdGFydFNlcnZlclJlcXVlc3QgPSB0aGlzLl9vbkRpZFN0YXJ0U2VydmVyUmVxdWVzdC5ldmVudDtcblxuXHRyZWFkb25seSBpbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBJQ2hhdFNlc3Npb25bJ2ludGVycnVwdEFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2snXTtcblx0cmVhZG9ubHkgZm9ya1Nlc3Npb246IElDaGF0U2Vzc2lvblsnZm9ya1Nlc3Npb24nXTtcblx0cmVhZG9ubHkgcmVuYW1lU2Vzc2lvbjogSUNoYXRTZXNzaW9uWydyZW5hbWVTZXNzaW9uJ107XG5cdHJlYWRvbmx5IHRyYW5zZmVycmVkU3RhdGU6IElDaGF0U2Vzc2lvblsndHJhbnNmZXJyZWRTdGF0ZSddO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHJlYWRvbmx5IGhpc3Rvcnk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10sXG5cdFx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRzZXNzaW9uU3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB8IHVuZGVmaW5lZCxcblx0XHRjaGF0U3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248Q2hhdFN0YXRlPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRDYWNoZU5vdGlmaWNhdGlvbjogQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZm9ya1Nlc3Npb246ICgocmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SUNoYXRTZXNzaW9uSXRlbT4pLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbmFtZVNlc3Npb246ICgodGl0bGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPHZvaWQ+KSxcblx0XHRpbnB1dFN0YXRlOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRpbml0aWFsUHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSB8IHVuZGVmaW5lZCxcblx0XHRvbkRpc3Bvc2U6ICgpID0+IHZvaWQsXG5cdFx0aW50ZXJydXB0QWN0aXZlUmVzcG9uc2U6ICgpID0+IGJvb2xlYW4sXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zZXRTdGF0ZVN1YnNjcmlwdGlvbnMoc2Vzc2lvblN1YnNjcmlwdGlvbiwgY2hhdFN1YnNjcmlwdGlvbik7XG5cdFx0dGhpcy5pc1JlYWRPbmx5ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkFyY2hpdmVkID0gQm9vbGVhbigodGhpcy5fc2Vzc2lvblN0YXRlLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik/LnN0YXR1cyA/PyAwKSAmIFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCk7XG5cdFx0XHRyZXR1cm4gaXNDaGF0UmVhZE9ubHkodGhpcy5fY2hhdFN0YXRlLnJlYWQocmVhZGVyKS5yZWFkKHJlYWRlcik/LmludGVyYWN0aXZpdHksIHNlc3Npb25BcmNoaXZlZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBoYXNBY3RpdmVUdXJuID0gaW5pdGlhbFByb2dyZXNzICE9PSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50cmFuc2ZlcnJlZFN0YXRlID0gaW5wdXRTdGF0ZSA/IHsgZWRpdGluZ1Nlc3Npb246IHVuZGVmaW5lZCwgaW5wdXRTdGF0ZSB9IDogdW5kZWZpbmVkO1xuXHRcdGlmIChoYXNBY3RpdmVUdXJuKSB7XG5cdFx0XHR0aGlzLmlzQ29tcGxldGVPYnMuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5wcm9ncmVzc09icy5zZXQoaW5pdGlhbFByb2dyZXNzLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZShvbkRpc3Bvc2UpKTtcblxuXHRcdC8vIEFsd2F5cyBwcm92aWRlIGFuIGludGVycnVwdCBjYWxsYmFjayBzbyB0aGUgY2hhdCBVSSdzIHN0b3AgYnV0dG9uXG5cdFx0Ly8gY2FuIGNhbmNlbCBhIHJlbW90ZSB0dXJuIGF0IGFueSB0aW1lLiBUaGUgY2FsbGJhY2sgcmVzb2x2ZXMgdGhlXG5cdFx0Ly8gY3VycmVudCBhY3RpdmUgdHVybiBhdCBjYWxsIHRpbWUgYW5kIGRpc3BhdGNoZXMgQ2hhdFR1cm5DYW5jZWxsZWQuXG5cdFx0dGhpcy5pbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrID0gYXN5bmMgKCkgPT4gaW50ZXJydXB0QWN0aXZlUmVzcG9uc2UoKTtcblxuXHRcdHRoaXMuZm9ya1Nlc3Npb24gPSB0aGlzLl9mb3JrU2Vzc2lvbjtcblx0XHR0aGlzLnJlbmFtZVNlc3Npb24gPSB0aGlzLl9yZW5hbWVTZXNzaW9uO1xuXHR9XG5cblx0c2V0U3RhdGVTdWJzY3JpcHRpb25zKHNlc3Npb25TdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+IHwgdW5kZWZpbmVkLCBjaGF0U3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248Q2hhdFN0YXRlPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb21wdENhY2hlVHJhY2tpbmcuY2xlYXIoKTtcblx0XHR0aGlzLl9wcm9tcHRDYWNoZVRyYWNraW5nLnZhbHVlID0gc2Vzc2lvblN1YnNjcmlwdGlvbiA/IHRoaXMuX3Byb21wdENhY2hlTm90aWZpY2F0aW9uPy50cmFja1Nlc3Npb24odGhpcy5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25TdWJzY3JpcHRpb24pIDogdW5kZWZpbmVkO1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZS5zZXQoc2Vzc2lvblN1YnNjcmlwdGlvbiA/IG9ic2VydmFibGVGcm9tU3Vic2NyaXB0aW9uKHRoaXMsIHNlc3Npb25TdWJzY3JpcHRpb24pIDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksIHR4KTtcblx0XHRcdHRoaXMuX2NoYXRTdGF0ZS5zZXQoY2hhdFN1YnNjcmlwdGlvbiA/IG9ic2VydmFibGVGcm9tU3Vic2NyaXB0aW9uKHRoaXMsIGNoYXRTdWJzY3JpcHRpb24pIDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gRmlyZSBgb25XaWxsRGlzcG9zZWAgQkVGT1JFIGBzdXBlci5kaXNwb3NlKClgIHNvIGxpc3RlbmVycyAobm90YWJseVxuXHRcdC8vIGBDb250cmlidXRlZENoYXRTZXNzaW9uRGF0YWAgaW4gYENoYXRTZXNzaW9uc1NlcnZpY2VgKSBjYW4gZXZpY3Rcblx0XHQvLyB0aGlzIHNlc3Npb24gZnJvbSB0aGVpciBjYWNoZXMuXG5cdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIGRpc3Bvc2FibGUgdG8gYmUgY2xlYW5lZCB1cCB3aGVuIHRoaXMgc2Vzc2lvbiBpcyBkaXNwb3NlZC5cblx0ICovXG5cdHJlZ2lzdGVyRGlzcG9zYWJsZTxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KGRpc3Bvc2FibGU6IFQpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwZW5kcyBuZXcgcHJvZ3Jlc3MgaXRlbXMgdG8gdGhlIG9ic2VydmFibGUuIFVzZWQgYnkgdGhlIHJlY29ubmVjdGlvblxuXHQgKiBmbG93IHRvIHN0cmVhbSBvbmdvaW5nIHN0YXRlIGNoYW5nZXMgaW50byB0aGUgY2hhdCBVSS5cblx0ICovXG5cdGFwcGVuZFByb2dyZXNzKGl0ZW1zOiBJQ2hhdFByb2dyZXNzW10pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5wcm9ncmVzc09icy5nZXQoKTtcblx0XHR0aGlzLnByb2dyZXNzT2JzLnNldChbLi4uY3VycmVudCwgLi4uaXRlbXNdLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmtzIHRoZSBhY3RpdmUgdHVybiBhcyBjb21wbGV0ZS5cblx0ICovXG5cdGNvbXBsZXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNDb21wbGV0ZU9icy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgYnkgdGhlIHNlc3Npb24gaGFuZGxlciB3aGVuIGEgc2VydmVyLWluaXRpYXRlZCB0dXJuIHN0YXJ0cy5cblx0ICogUmVzZXRzIHRoZSBwcm9ncmVzcyBvYnNlcnZhYmxlIGFuZCBzaWduYWxzIGxpc3RlbmVycyB0byBjcmVhdGUgYSBuZXdcblx0ICogcmVxdWVzdCtyZXNwb25zZSBwYWlyIGluIHRoZSBjaGF0IG1vZGVsLiBgdHVybklkYCBpcyB0aGUgcHJvdmlkZXIncyB0dXJuXG5cdCAqIGlkIGFuZCBpcyBhZG9wdGVkIGFzIHRoZSBjaGF0IHJlcXVlc3QgaWQsIHNvIGZlYXR1cmVzIHRoYXQgYWRkcmVzcyBhIHR1cm5cblx0ICogYnkgcmVxdWVzdCBpZCAoc2lkZSBjaGF0cywgZm9ya3MpIGNhbiByZXNvbHZlIGl0IGFnYWluc3QgdGhlIGhvc3QuXG5cdCAqL1xuXHRzdGFydFNlcnZlclJlcXVlc3QodHVybklkOiBzdHJpbmcsIHByb21wdDogc3RyaW5nLCB2YXJpYWJsZURhdGE/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEsIG9wdGlvbnM/OiBJU3RhcnRTZXJ2ZXJSZXF1ZXN0T3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0FnZW50SG9zdF0gU2VydmVyLWluaXRpYXRlZCByZXF1ZXN0IHN0YXJ0ZWQnKTtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLnByb2dyZXNzT2JzLnNldChbXSwgdHgpO1xuXHRcdFx0dGhpcy5pc0NvbXBsZXRlT2JzLnNldChmYWxzZSwgdHgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX29uRGlkU3RhcnRTZXJ2ZXJSZXF1ZXN0LmZpcmUoe1xuXHRcdFx0aWQ6IHR1cm5JZCxcblx0XHRcdHByb21wdCxcblx0XHRcdHZhcmlhYmxlRGF0YSxcblx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiBvcHRpb25zPy5pc1N5c3RlbUluaXRpYXRlZCxcblx0XHRcdHRpbWVzdGFtcDogb3B0aW9ucz8udGltZXN0YW1wLFxuXHRcdFx0aXNUZXJtaW5hbFJlcXVlc3Q6IG9wdGlvbnM/LmlzVGVybWluYWxSZXF1ZXN0LFxuXHRcdH0pO1xuXHR9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTZXNzaW9uIGhhbmRsZXJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFNlc3Npb25IYW5kbGVyQ29uZmlnIHtcblx0cmVhZG9ubHkgcHJvdmlkZXI6IEFnZW50UHJvdmlkZXI7XG5cdC8qKlxuXHQgKiBUaGUgVVJJIHNjaGVtZSB0aGUgaG9zdCBhZGRyZXNzZXMgc2Vzc2lvbnMgdW5kZXIsIHdoZW4gaXQgZGlmZmVycyBmcm9tXG5cdCAqIHtAbGluayBwcm92aWRlcn0uIERlZmF1bHRzIHRvIHtAbGluayBwcm92aWRlcn0uXG5cdCAqXG5cdCAqIFNlc3Npb24gVVJJcyBhcmUgY2xpZW50LWNob3Nlbi4gRm9yIGFnZW50cyBjb3JlIHNwYXducywgY29yZSBwaWNrcyB0aGUgVVJJIGFuZFxuXHQgKiB1c2VzIHRoZSBwcm92aWRlciBhcyB0aGUgc2NoZW1lLiBGb3Igc2Vzc2lvbnMgY29yZSAqam9pbnMqIHJhdGhlciB0aGFuIGNyZWF0ZXNcblx0ICogKGNsb3VkIHNhbmRib3gsIHdoZXJlIE1pc3Npb24gQ29udHJvbCBjcmVhdGVkIHRoZSBzZXNzaW9uIGFzIGBhaHAtc2Vzc2lvbjovPGlkPmApLFxuXHQgKiB0aGUgY3JlYXRvcidzIHNjaGVtZSBtdXN0IGJlIHVzZWQgYmVjYXVzZSB0aGUgaG9zdCdzIHJlZ2lzdHJ5IGlzIGtleWVkIGJ5IHRoZVxuXHQgKiBleGFjdCBVUkkgXHUyMDE0IHdoaWxlIHRoZSBVSSBzdGlsbCByb3V0ZXMgdGhlIHNlc3Npb24gdG8gdGhlIGBjb3BpbG90YCBwcm92aWRlci5cblx0ICovXG5cdHJlYWRvbmx5IGJhY2tlbmRTZXNzaW9uU2NoZW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZ1bGxOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdC8qKiBUaGUgYWdlbnQgY29ubmVjdGlvbiB0byB1c2UgZm9yIHRoaXMgaGFuZGxlci4gKi9cblx0cmVhZG9ubHkgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbjtcblx0LyoqIFNhbml0aXplZCBjb25uZWN0aW9uIGF1dGhvcml0eSBmb3IgY29uc3RydWN0aW5nIHZzY29kZS1hZ2VudC1ob3N0Oi8vIFVSSXMuICovXG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZztcblx0LyoqIEV4dGVuc2lvbiBpZGVudGlmaWVyIGZvciB0aGUgcmVnaXN0ZXJlZCBhZ2VudC4gRGVmYXVsdHMgdG8gJ3ZzY29kZS5hZ2VudC1ob3N0Jy4gKi9cblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ/OiBzdHJpbmc7XG5cdC8qKiBFeHRlbnNpb24gZGlzcGxheSBuYW1lIGZvciB0aGUgcmVnaXN0ZXJlZCBhZ2VudC4gRGVmYXVsdHMgdG8gJ0FnZW50IEhvc3QnLiAqL1xuXHRyZWFkb25seSBleHRlbnNpb25EaXNwbGF5TmFtZT86IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIHRvIHJlc29sdmUgYSB3b3JraW5nIGRpcmVjdG9yeSBmb3IgYSBuZXcgc2Vzc2lvbi5cblx0ICogSWYgbm90IHByb3ZpZGVkIG9yIHVucmVzb2x2ZWQsIHNlc3Npb24gcmVzb3VyY2UgcmVzb2x2ZXJzIGFyZSBjb25zdWx0ZWQgYmVmb3JlXG5cdCAqIGZhbGxpbmcgYmFjayB0byB0aGUgZmlyc3Qgd29ya3NwYWNlIGZvbGRlci5cblx0ICovXG5cdHJlYWRvbmx5IHJlc29sdmVXb3JraW5nRGlyZWN0b3J5PzogKHNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIGEgZmluYWwtbG9va2luZyBjaGF0IHJlc291cmNlIGlzIHN0aWxsIGEgY2xpZW50LXNpZGUgZHJhZnQuICovXG5cdHJlYWRvbmx5IGlzTmV3U2Vzc2lvbj86IChzZXNzaW9uUmVzb3VyY2U6IFVSSSkgPT4gYm9vbGVhbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIGludm9rZWQgd2hlbiB0aGUgc2VydmVyIHJlamVjdHMgYW4gb3BlcmF0aW9uIGJlY2F1c2Vcblx0ICogYXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQuIFNob3VsZCB0cmlnZ2VyIGludGVyYWN0aXZlIGF1dGhlbnRpY2F0aW9uXG5cdCAqIGFuZCByZXR1cm4gdHJ1ZSBpZiB0aGUgdXNlciBhdXRoZW50aWNhdGVkIHN1Y2Nlc3NmdWxseS5cblx0ICpcblx0ICogQHBhcmFtIHByb3RlY3RlZFJlc291cmNlcyBUaGUgcHJvdGVjdGVkIHJlc291cmNlcyBmcm9tIHRoZSBhZ2VudCdzIHJvb3Rcblx0ICogICBzdGF0ZSB0aGF0IHJlcXVpcmUgYXV0aGVudGljYXRpb24uXG5cdCAqL1xuXHRyZWFkb25seSByZXNvbHZlQXV0aGVudGljYXRpb24/OiAocHJvdGVjdGVkUmVzb3VyY2VzOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10pID0+IFByb21pc2U8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IHByb21wdENhY2hlTm90aWZpY2F0aW9uPzogQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb247XG59XG5cbi8qKlxuICogQ29udmVydHMgYSBVVEYtMTYgY29kZS11bml0IG9mZnNldCBpbiBgdGV4dGAgdG8gYSAxLWJhc2VkIE1vbmFjb1xuICogYElQb3NpdGlvbmAuIFVzZWQgdG8gdHJhbnNsYXRlIEFIUCBjb21wbGV0aW9uLWl0ZW0gcmFuZ2VzICh3aGljaCB1c2VcbiAqIG9mZnNldHMpIGludG8gTW9uYWNvLXN0eWxlIHBvc2l0aW9ucyBmb3IgdGhlIGNoYXQgaW5wdXQuXG4gKi9cbmZ1bmN0aW9uIG9mZnNldFRvUG9zaXRpb24odGV4dDogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IElQb3NpdGlvbiB7XG5cdGxldCBsaW5lTnVtYmVyID0gMTtcblx0bGV0IGNvbHVtbiA9IDE7XG5cdGNvbnN0IGxpbWl0ID0gTWF0aC5taW4ob2Zmc2V0LCB0ZXh0Lmxlbmd0aCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbGltaXQ7IGkrKykge1xuXHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQoaSkgPT09IDEwIC8qIFxcbiAqLykge1xuXHRcdFx0bGluZU51bWJlcisrO1xuXHRcdFx0Y29sdW1uID0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29sdW1uKys7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9O1xufVxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFNlc3Npb25IYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRFJBRlRfU1lOQ19ERUJPVU5DRV9NUyA9IDUwMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTZXNzaW9ucyA9IG5ldyBSZXNvdXJjZU1hcDxBZ2VudEhvc3RDaGF0U2Vzc2lvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZSA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cdC8qKiBQZXItc2Vzc2lvbiBzdWJzY3JpcHRpb24gdG8gY2hhdCBtb2RlbCBwZW5kaW5nIHJlcXVlc3QgY2hhbmdlcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNvdXJjZU1hcCgpKTtcblx0LyoqIFBlci1zZXNzaW9uIGRlYm91bmNlZCBzeW5jIGZyb20gY2hhdCBpbnB1dCBzdGF0ZSB0byBBSFAgZHJhZnQgc3RhdGUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RyYWZ0U3luY1N1YnNjcmlwdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwKCkpO1xuXHQvKiogUGVyLXNlc3Npb24gc3Vic2NyaXB0aW9uIHdhdGNoaW5nIGZvciBzZXJ2ZXItaW5pdGlhdGVkIHR1cm5zLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJUdXJuV2F0Y2hlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwKCkpO1xuXHQvKiogUGVyLXNlc3Npb24gc3Vic2NyaXB0aW9uIHNpbGVudGx5IHJlc29sdmluZyBleGlzdGluZyBNQ1AgYXV0aGVudGljYXRpb24gZ3JhbnRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BBdXRoV2F0Y2hlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwKCkpO1xuXHQvKiogSGlzdG9yaWNhbCB0dXJucyB3aXRoIGZpbGUgZWRpdHMsIHBlbmRpbmcgaHlkcmF0aW9uIGludG8gdGhlIGVkaXRpbmcgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0hpc3RvcnlUdXJucyA9IG5ldyBSZXNvdXJjZU1hcDxyZWFkb25seSBUdXJuW10+KCk7XG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbiBzZXQgb2YgTUNQIHNlcnZlciBpZHMgdGhhdCBhbHJlYWR5IGhhZCBhbiBhdXRoZW50aWNhdGlvblxuXHQgKiBwcm9tcHQgc3VyZmFjZWQgaW4gdGhlIGN1cnJlbnQgY29udmVyc2F0aW9uLiBBIHNlcnZlciBpcyByZW1vdmVkIGZyb20gdGhlXG5cdCAqIHNldCBvbmNlIGl0IHJlYWNoZXMgdGhlIHJ1bm5pbmcgc3RhdGUgKHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHl9KSwgc29cblx0ICogdGhhdCBhIGxhdGVyIGF1dGggcmVxdWlyZW1lbnQgZm9yIHRoZSBzYW1lIHNlcnZlciBwcm9tcHRzIGFnYWluIGluc3RlYWQgb2Zcblx0ICogdGhlIHByb21wdCByZXBlYXRpbmcgb24gZXZlcnkgbWVzc2FnZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1cmZhY2VkTWNwQXV0aFNlcnZlcnMgPSBuZXcgUmVzb3VyY2VNYXA8U2V0PHN0cmluZz4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdNY3BBdXRvQXV0aGVudGljYXRpb24gPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxib29sZWFuPj4oKTtcblx0LyoqIFR1cm4gSURzIGRpc3BhdGNoZWQgYnkgdGhpcyBjbGllbnQsIHVzZWQgdG8gZGlzdGluZ3Vpc2ggc2VydmVyLW9yaWdpbmF0ZWQgdHVybnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudERpc3BhdGNoZWRUdXJuSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R1cm5TdG9wV2F0Y2hlcyA9IG5ldyBNYXA8c3RyaW5nLCBTdG9wV2F0Y2g+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZzogSUFnZW50SG9zdFNlc3Npb25IYW5kbGVyQ29uZmlnO1xuXG5cdC8qKiBBY3RpdmUgc2Vzc2lvbiBzdWJzY3JpcHRpb25zLCBrZXllZCBieSBiYWNrZW5kIHNlc3Npb24gVVJJIHN0cmluZy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN1YnNjcmlwdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPj4+KCk7XG5cblx0LyoqXG5cdCAqIEFjdGl2ZSBkZWZhdWx0LWNoYXQgc3Vic2NyaXB0aW9ucywga2V5ZWQgYnkgYmFja2VuZCBzZXNzaW9uIFVSSSBzdHJpbmcuXG5cdCAqIE11bHRpLWNoYXQgaXMgbm90IHlldCBzdXJmYWNlZDogZXZlcnkgc2Vzc2lvbiBpcyBzZXJ2ZWQgYnkgYSBzaW5nbGVcblx0ICogaW1wbGljaXQgZGVmYXVsdCBjaGF0IHRoYXQgY2FycmllcyB0aGUgY29udmVyc2F0aW9uIGNvbnRlbnRzICh0dXJucyxcblx0ICogYWN0aXZlIHR1cm4sIHBlbmRpbmcvcXVldWVkIG1lc3NhZ2VzLCBpbnB1dCByZXF1ZXN0cykuIFdlIHN1YnNjcmliZSB0b1xuXHQgKiBpdCBhbG9uZ3NpZGUgdGhlIHNlc3Npb24gYW5kIG1lcmdlIGJvdGggaW50byB0aGUge0BsaW5rIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0fVxuXHQgKiB2aWV3IHJldHVybmVkIGJ5IHtAbGluayBfZ2V0U2Vzc2lvblN0YXRlfS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRDaGF0U3Vic2NyaXB0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxDaGF0U3RhdGU+Pj4oKTtcblxuXHQvKipcblx0ICogQWN0aXZlIHN1YnNjcmlwdGlvbnMgZm9yIGFkZGl0aW9uYWwgKG5vbi1kZWZhdWx0KSBwZWVyIGNoYXRzLCBrZXllZCBieVxuXHQgKiB0aGUgY2hhdCBjaGFubmVsIFVSSSBzdHJpbmcuIFBvcHVsYXRlZCB3aGVuIGEgY2hhdCB3aWRnZXQgaXMgb3BlbmVkIGZvclxuXHQgKiBhIHJlc291cmNlIHRoYXQgY2FycmllcyBhIGNoYXRJZCBmcmFnbWVudC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxDaGF0U3RhdGU+Pj4oKTtcblxuXHQvKipcblx0ICogQmFja2VuZCBzZXNzaW9uIFVSSXMgd2l0aCBhbiBpbi1mbGlnaHQge0BsaW5rIHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnR9XG5cdCAqIGNhbGwsIGtleWVkIGJ5IHNlc3Npb24gVVJJIHN0cmluZyB3aXRoIGEgcmVmY291bnQgdmFsdWUuIFdoaWxlIGEgY2hhdCBpc1xuXHQgKiBzdGlsbCBoeWRyYXRpbmcgaXRzIHN1YnNjcmlwdGlvbnMsIGEgc2libGluZyBjaGF0IG9mIHRoZSBzYW1lIHNlc3Npb25cblx0ICogY2xvc2luZyBtdXN0IG5vdCB0ZWFyIGRvd24gdGhlIHNoYXJlZCBzZXNzaW9uIHN1YnNjcmlwdGlvbiBvdXQgZnJvbSB1bmRlclxuXHQgKiBpdCAoc2VlIHtAbGluayBfcmVsZWFzZUNoYXRTZXNzaW9uU3Vic2NyaXB0aW9uc30gLyB7QGxpbmsgX2hhc090aGVyU2Vzc2lvbkhvbGR9KS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2h5ZHJhdGluZ0NoYXRTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29uZmlnOiBJQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXJDb25maWcsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZTogSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSxcblx0XHRASUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIgcHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0RpcmVjdG9yeVJlc29sdmVyOiBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlcixcblx0XHRASUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlOiBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvdmlzaW9uYWxTZXJ2aWNlOiBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUgcHJpdmF0ZSByZWFkb25seSBfaW1wb3J0Q29udmVyc2F0aW9uU3RvcmU6IElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2xpZW50U2VydmljZTogSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2U6IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25TZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbmZpZyA9IGNvbmZpZztcblxuXHRcdC8vIERyb3AgTUNQIHNlcnZlcnMgZnJvbSB0aGUgcGVyLXNlc3Npb24gc3VyZmFjZWQgc2V0IG9uY2UgdGhleSByZWFjaCB0aGVcblx0XHQvLyBydW5uaW5nIHN0YXRlIHNvIGEgbGF0ZXIgYXV0aCByZXF1aXJlbWVudCBmb3IgdGhlIHNhbWUgc2VydmVyIHByb21wdHNcblx0XHQvLyBhZ2Fpbi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jdXN0b21pemF0aW9uU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKCgpID0+IHRoaXMuX3JlY29uY2lsZVN1cmZhY2VkTWNwQXV0aFNlcnZlcnMoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZGVmcyA9IHRoaXMuX2FjdGl2ZUNsaWVudFNlcnZpY2UuZ2V0Q2xpZW50VG9vbHModGhpcy5fY29uZmlnLnNlc3Npb25UeXBlKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjbGllbnRJZCA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmNsaWVudElkO1xuXHRcdFx0Zm9yIChjb25zdCBbc2Vzc2lvblJlc291cmNlXSBvZiB0aGlzLl9hY3RpdmVTZXNzaW9ucykge1xuXHRcdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHN0YXRlPy5hY3RpdmVDbGllbnRzLmZpbmQoYyA9PiBjLmNsaWVudElkID09PSBjbGllbnRJZCk7XG5cdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdFx0XHRhY3RpdmVDbGllbnQ6IHsgLi4uZXhpc3RpbmcsIHRvb2xzOiBbLi4uZGVmc10gfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gdGhlIHVzZXIgY2xpY2tzIFwiQ29udGludWUgaW4gQmFja2dyb3VuZFwiIG9uIGFuIEFIUCB0ZXJtaW5hbFxuXHRcdC8vIHRvb2wsIG5hcnJvdyB0aGUgdGVybWluYWwgY2xhaW0gc28gdGhlIHNlcnZlci1zaWRlIHRvb2wgaGFuZGxlclxuXHRcdC8vIGNhbiBkZXRlY3QgaXQgYW5kIHJldHVybiBlYXJseS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLm9uRGlkQ29udGludWVJbkJhY2tncm91bmQodGVybWluYWxUb29sU2Vzc2lvbklkID0+IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQWhwVGVybWluYWxUb29sU2Vzc2lvbklkKHRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RdIENvbnRpbnVlIGluIGJhY2tncm91bmQ6IHRlcm1pbmFsPSR7cGFyc2VkLnRlcm1pbmFsfSwgc2Vzc2lvbj0ke3BhcnNlZC5zZXNzaW9ufWApO1xuXHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2gocGFyc2VkLnRlcm1pbmFsLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDbGFpbWVkLFxuXHRcdFx0XHRjbGFpbToge1xuXHRcdFx0XHRcdGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLlNlc3Npb24sXG5cdFx0XHRcdFx0c2Vzc2lvbjogcGFyc2VkLnNlc3Npb24sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWdpc3RlciBhbiBlZGl0aW5nIHNlc3Npb24gcHJvdmlkZXIgZm9yIHRoaXMgaGFuZGxlcidzIHNlc3Npb24gdHlwZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRFZGl0aW5nU2VydmljZS5yZWdpc3RlckVkaXRpbmdTZXNzaW9uUHJvdmlkZXIoXG5cdFx0XHRjb25maWcuc2Vzc2lvblR5cGUsXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRpbmdTZXNzaW9uOiAoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0QWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLFxuXHRcdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdGNvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gU3VwcGx5IHRoZSBwZXItcmVzcG9uc2UgXCJDaGFuZ2VkIE4gZmlsZXNcIiBjaGF0IHN1bW1hcnkgZnJvbSB0aGVcblx0XHQvLyBhdXRob3JpdGF0aXZlIHNlcnZlci1jb21wdXRlZCBwZXItdHVybiBjaGFuZ2VzZXQgKHRoZSBzYW1lIHNvdXJjZSBhc1xuXHRcdC8vIHRoZSBBZ2VudHMtYXBwIENoYW5nZXMgdmlldykgaW5zdGVhZCBvZiB0aGUgZWRpdGluZyBzZXNzaW9uLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFxuXHRcdFx0Y29uZmlnLnNlc3Npb25UeXBlLFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdFJlc3BvbnNlRmlsZUNoYW5nZXNQcm92aWRlcihcblx0XHRcdFx0Y29uZmlnLmNvbm5lY3Rpb24sXG5cdFx0XHRcdGNvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UgPT4gdGhpcy5fcmVzb2x2ZVNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdCkpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gUHVzaCBjdXN0b21pemF0aW9uIGNoYW5nZXMgdG8gc2Vzc2lvbnMgd2hlcmUgdGhpcyBjbGllbnQgaXMgYWxyZWFkeSBhY3RpdmUgd2l0aG91dCByZWNsYWltaW5nLlxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zT2JzID0gdGhpcy5fYWN0aXZlQ2xpZW50U2VydmljZS5nZXRDdXN0b21pemF0aW9ucyhjb25maWcuc2Vzc2lvblR5cGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlZnMgPSBjdXN0b21pemF0aW9uc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjbGllbnRJZCA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmNsaWVudElkO1xuXHRcdFx0Zm9yIChjb25zdCBbc2Vzc2lvblJlc291cmNlXSBvZiB0aGlzLl9hY3RpdmVTZXNzaW9ucykge1xuXHRcdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHN0YXRlPy5hY3RpdmVDbGllbnRzLmZpbmQoYyA9PiBjLmNsaWVudElkID09PSBjbGllbnRJZCk7XG5cdFx0XHRcdGlmIChleGlzdGluZyAmJiAhZXF1YWxzKGV4aXN0aW5nLmN1c3RvbWl6YXRpb25zID8/IFtdLCByZWZzKSkge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aXZlQ2xpZW50KGJhY2tlbmRTZXNzaW9uLCBbLi4ucmVmc10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJBZ2VudCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBzaWduZWQtaW4gdXNlcidzIHBsYW4gY29udGV4dCBmb3IgY2hhdCBlcnJvciBmb3JtYXR0aW5nLlxuXHQgKiBUaGUgYWdlbnQgaG9zdCBkb2VzIG5vdCBrbm93IHRoZSB1c2VyJ3MgcGxhbiwgc28gcXVvdGEvcmF0ZS1saW1pdFxuXHQgKiBtZXNzYWdlcyBhcmUgcGVyc29uYWxpemVkIGhlcmUgZnJvbSBgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2VgLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hhdEVycm9yQ29udGV4dCgpOiBJQ2hhdEVycm9yQ29udGV4dCB7XG5cdFx0Y29uc3QgcXVvdGFzID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXM7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvcGlsb3RQbGFuOiBnZXRDb3BpbG90UGxhbkZyb21FbnRpdGxlbWVudCh0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50KSxcblx0XHRcdGlzVXNhZ2VCYXNlZEJpbGxpbmc6IHF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZyxcblx0XHRcdHF1b3RhUmVzZXREYXRlOiBxdW90YXMucmVzZXREYXRlLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBwcm92aWRlQ2hhdElucHV0Q29tcGxldGlvbnMoc2Vzc2lvblJlc291cmNlOiBVUkksIHBhcmFtczogSUNoYXRJbnB1dENvbXBsZXRpb25zUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0SW5wdXRDb21wbGV0aW9uc1Jlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlKTtcblx0XHQvLyBOb3RlOiB3ZSBkb24ndCBmb3J3YXJkIGB0b2tlbmAgYWNyb3NzIElQQyBcXHUyMDE0IGNhbmNlbGxhdGlvbiB0b2tlbnNcblx0XHQvLyBkb24ndCByb3VuZC10cmlwIHRocm91Z2ggdGhlIHByb3h5IGNoYW5uZWwgdG9kYXkuIFRoZSBwb3N0LWF3YWl0XG5cdFx0Ly8gYGlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkYCBjaGVjayBiZWxvdyBpcyBlbm91Z2ggdG8gZHJvcCBhIHN0YWxlXG5cdFx0Ly8gcmVzdWx0IGlmIHRoZSB1c2VyIGtlcHQgdHlwaW5nIHdoaWxlIHRoZSByZXF1ZXN0IHdhcyBpbiBmbGlnaHQuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY29tcGxldGlvbnMoe1xuXHRcdFx0a2luZDogQWhwQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLFxuXHRcdFx0Y2hhbm5lbDogYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHRleHQ6IHBhcmFtcy50ZXh0LFxuXHRcdFx0b2Zmc2V0OiBwYXJhbXMub2Zmc2V0LFxuXHRcdH0pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXM6IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByYXcgb2YgcmVzdWx0Lml0ZW1zKSB7XG5cdFx0XHRjb25zdCBtYXBwZWQgPSB0aGlzLl90b0NoYXRJbnB1dENvbXBsZXRpb25JdGVtKHJhdywgcGFyYW1zLnRleHQpO1xuXHRcdFx0aWYgKG1hcHBlZCkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKG1hcHBlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGl0ZW1zIH07XG5cdH1cblxuXHRwcm92aWRlQ2hhdElucHV0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKCk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZ2V0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDb21wbGV0aW9uSXRlbShyYXc6IEFocENvbXBsZXRpb25JdGVtLCB0ZXh0OiBzdHJpbmcsIGF0dGFjaG1lbnQ6IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbVsnYXR0YWNobWVudCddLCBsYWJlbD86IHN0cmluZyk6IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSB7XG5cdFx0Y29uc3QgaXRlbTogTXV0YWJsZTxJQ2hhdElucHV0Q29tcGxldGlvbkl0ZW0+ID0ge1xuXHRcdFx0aW5zZXJ0VGV4dDogcmF3Lmluc2VydFRleHQsXG5cdFx0XHRhdHRhY2htZW50XG5cdFx0fTtcblx0XHRpZiAobGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aXRlbS5sYWJlbCA9IGxhYmVsO1xuXHRcdH1cblx0XHRpZiAocmF3LnJhbmdlU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aXRlbS5zdGFydCA9IG9mZnNldFRvUG9zaXRpb24odGV4dCwgcmF3LnJhbmdlU3RhcnQpO1xuXHRcdH1cblx0XHRpZiAocmF3LnJhbmdlRW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGl0ZW0uZW5kID0gb2Zmc2V0VG9Qb3NpdGlvbih0ZXh0LCByYXcucmFuZ2VFbmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbTtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ2hhdElucHV0Q29tcGxldGlvbkl0ZW0ocmF3OiBBaHBDb21wbGV0aW9uSXRlbSwgdGV4dDogc3RyaW5nKTogSUNoYXRJbnB1dENvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRhY2htZW50ID0gcmF3LmF0dGFjaG1lbnQ7XG5cdFx0c3dpdGNoIChhdHRhY2htZW50LnR5cGUpIHtcblx0XHRcdGNhc2UgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZToge1xuXHRcdFx0XHRjb25zdCBjb21wbGV0aW9uTWV0YSA9IHJlYWRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEoYXR0YWNobWVudCk7XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uTWV0YT8ua2luZCA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUNvbXBsZXRpb25JdGVtKHJhdywgdGV4dCwge1xuXHRcdFx0XHRcdFx0a2luZDogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogY29tcGxldGlvbk1ldGEuY29tbWFuZCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBjb21wbGV0aW9uTWV0YS5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdC4uLihhdHRhY2htZW50Ll9tZXRhICE9PSB1bmRlZmluZWQgJiYgeyBfbWV0YTogYXR0YWNobWVudC5fbWV0YSB9KSxcblx0XHRcdFx0XHR9LCBhdHRhY2htZW50LmxhYmVsICE9PSByYXcuaW5zZXJ0VGV4dCA/IGF0dGFjaG1lbnQubGFiZWwgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uTWV0YT8ua2luZCA9PT0gJ3NraWxsJykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVDb21wbGV0aW9uSXRlbShyYXcsIHRleHQsIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdza2lsbCcsXG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjb21wbGV0aW9uTWV0YS51cmkpLFxuXHRcdFx0XHRcdFx0Li4uKGNvbXBsZXRpb25NZXRhLmRpc3BsYXlOYW1lICE9PSB1bmRlZmluZWQgPyB7IGRpc3BsYXlOYW1lOiBjb21wbGV0aW9uTWV0YS5kaXNwbGF5TmFtZSB9IDoge30pLFxuXHRcdFx0XHRcdFx0Li4uKGNvbXBsZXRpb25NZXRhLmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQgPyB7IGRlc2NyaXB0aW9uOiBjb21wbGV0aW9uTWV0YS5kZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdFx0XHRcdFx0Li4uKGF0dGFjaG1lbnQuX21ldGEgIT09IHVuZGVmaW5lZCAmJiB7IF9tZXRhOiBhdHRhY2htZW50Ll9tZXRhIH0pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZToge1xuXHRcdFx0XHRjb25zdCB1cmkgPSB0eXBlb2YgYXR0YWNobWVudC51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKGF0dGFjaG1lbnQudXJpKSA6IFVSSS5mcm9tKGF0dGFjaG1lbnQudXJpKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUNvbXBsZXRpb25JdGVtKHJhdywgdGV4dCwge1xuXHRcdFx0XHRcdGtpbmQ6ICdyZXNvdXJjZScsXG5cdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0XHRcdGlzRGlyZWN0b3J5OiBhdHRhY2htZW50LmRpc3BsYXlLaW5kID09PSAnZGlyZWN0b3J5Jyxcblx0XHRcdFx0XHQuLi4oYXR0YWNobWVudC5fbWV0YSAhPT0gdW5kZWZpbmVkICYmIHsgX21ldGE6IGF0dGFjaG1lbnQuX21ldGEgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdDoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQ29tcGxldGlvbkl0ZW0ocmF3LCB0ZXh0LCB7XG5cdFx0XHRcdFx0a2luZDogJ2NoYXQnLFxuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKGF0dGFjaG1lbnQucmVzb3VyY2UpLFxuXHRcdFx0XHRcdGVuZFR1cm46IGF0dGFjaG1lbnQuZW5kVHVybixcblx0XHRcdFx0XHR0aXRsZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdFx0XHQuLi4oYXR0YWNobWVudC5fbWV0YSAhPT0gdW5kZWZpbmVkICYmIHsgX21ldGE6IGF0dGFjaG1lbnQuX21ldGEgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gRW1iZWRkZWQgcmVzb3VyY2VzIHdpbGwgYmUgYWRkZWQgd2hlbiB0aGUgd29ya2JlbmNoIGdyb3dzIGZpcnN0LWNsYXNzIHN1cHBvcnQgZm9yIHRoZW0uXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHVua25vd24gYXR0YWNobWVudCB0eXBlXG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb24+IHtcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpLnN0YXJ0c1dpdGgoJ3VudGl0bGVkLScpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50IGhvc3QgY2hhdCBzZXNzaW9ucyBtdXN0IGJlIGNyZWF0ZWQgYnkgdGhlIHNlc3Npb25zIHByb3ZpZGVyOiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdC8vIEZvciBuZXcgc2Vzc2lvbnMsIGRlZmVyIGJhY2tlbmQgc2Vzc2lvbiBjcmVhdGlvbiB1bnRpbCB0aGUgZmlyc3QgcmVxdWVzdFxuXHRcdC8vIGFycml2ZXMgc28gdGhlIHVzZXItc2VsZWN0ZWQgbW9kZWwgaXMgYXZhaWxhYmxlLiBUaGUgY2hhdCByZXNvdXJjZSBzdGlsbFxuXHRcdC8vIGNhcnJpZXMgdGhlIHJhdyBzZXNzaW9uIGlkIHRoYXQgd2lsbCBiZSB1c2VkIHdoZW4gY3JlYXRlU2Vzc2lvbiBydW5zLlxuXHRcdGNvbnN0IHJlc29sdmVkU2Vzc2lvbiA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0bGV0IGNoYXRVUkk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIFRoZSBwb2ludCBvZiB0aGlzIGlzIHRvIGNoZWNrIHdpdGggdGhlIHNlc3Npb24gcHJvdmlkZXIgb3IgY29udHJvbGxlclxuXHRcdC8vIHdoZXRoZXIgdGhpcyBzZXNzaW9uIHJlc291cmNlIHJlcHJlc2VudHMgYSBuZXcgc2Vzc2lvbiB0aGF0IGhhc24ndCB5ZXRcblx0XHQvLyBiZWVuIGNyZWF0ZWQgb24gdGhlIGJhY2tlbmQuXG5cdFx0Y29uc3QgaXNOZXdTZXNzaW9uID0gdGhpcy5faXNOZXdTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBoaXN0b3J5OiBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbVtdID0gW107XG5cdFx0bGV0IGluaXRpYWxQcm9ncmVzczogSUNoYXRQcm9ncmVzc1tdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQgPSAwO1xuXHRcdGxldCBhY3RpdmVUdXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2Vzc2lvblRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRyYWZ0SW5wdXRTdGF0ZTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlc3Npb25TdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGF0U3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248Q2hhdFN0YXRlPiB8IHVuZGVmaW5lZDtcblx0XHQvLyBNYXJrIHRoaXMgc2Vzc2lvbiBhcyBoeWRyYXRpbmcgc28gdGhhdCBhIHNpYmxpbmcgY2hhdCBvZiB0aGUgc2FtZVxuXHRcdC8vIHNlc3Npb24gY2xvc2luZyB3aGlsZSB3ZSBhd2FpdCBvdXIgc3Vic2NyaXB0aW9ucyBkb2VzIG5vdCB0ZWFyIGRvd25cblx0XHQvLyB0aGUgc2hhcmVkIHNlc3Npb24gc3Vic2NyaXB0aW9uICh3aGljaCB3b3VsZCBzdHJhbmQgdXMgZm9yZXZlcikuXG5cdFx0Y29uc3QgaHlkcmF0aW9uS2V5ID0gcmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5faHlkcmF0aW5nQ2hhdFNlc3Npb25zLnNldChoeWRyYXRpb25LZXksICh0aGlzLl9oeWRyYXRpbmdDaGF0U2Vzc2lvbnMuZ2V0KGh5ZHJhdGlvbktleSkgPz8gMCkgKyAxKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCFpc05ld1Nlc3Npb24pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzdWIgPSB0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHJlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdFx0XHRzZXNzaW9uU3Vic2NyaXB0aW9uID0gc3ViO1xuXHRcdFx0XHRcdC8vIFdhaXQgZm9yIGJvdGggdGhlIHNlc3Npb24gc3VtbWFyeSBhbmQgaXRzIGRlZmF1bHQtY2hhdFxuXHRcdFx0XHRcdC8vIGNvbnZlcnNhdGlvbiBzdGF0ZSB0byBoeWRyYXRlIGZyb20gdGhlIHNlcnZlci4gQWZ0ZXIgdGhlXG5cdFx0XHRcdFx0Ly8gbXVsdGktY2hhdCBwcm90b2NvbCBhZG9wdGlvbiwgdHVybnMvYWN0aXZlVHVybiBsaXZlIG9uIHRoZVxuXHRcdFx0XHRcdC8vIHNlcGFyYXRlIGNoYXQgY2hhbm5lbCwgc28gcmVhZGluZyB0aGVtIGJlZm9yZSB0aGUgY2hhdFxuXHRcdFx0XHRcdC8vIHN1YnNjcmlwdGlvbiBsYW5kcyB3b3VsZCB5aWVsZCBhbiBlbXB0eSBoaXN0b3J5LlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZChzdWIsIHRva2VuKTtcblx0XHRcdFx0XHQvLyBBIGZhaWxlZCBzdWJzY3JpcHRpb24gc3VyZmFjZXMgYXMgYW4gYEVycm9yYCB2YWx1ZTsgcmV0aHJvdyBpdFxuXHRcdFx0XHRcdC8vIHNvIHRoZSByZWFsIHJlYXNvbiAoZS5nLiB0aGUgd29ya2luZyBkaXJlY3Rvcnkgbm8gbG9uZ2VyXG5cdFx0XHRcdFx0Ly8gZXhpc3RzKSBpcyBsb2dnZWQgYW5kIHJlbmRlcmVkIGluc3RlYWQgb2YgYSBnZW5lcmljIG1lc3NhZ2UuXG5cdFx0XHRcdFx0aWYgKHN1Yi52YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBzdWIudmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJhd1N0YXRlID0gdGhpcy5fZ2V0UmF3U2Vzc2lvblN0YXRlKHJlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdFx0XHRpZiAoIXJhd1N0YXRlKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gc3RhdGUgZGlkIG5vdCBoeWRyYXRlIGZvciAke3Jlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGF0VVJJID0gdGhpcy5fcmVzb2x2ZUNoYXRVcmlGcm9tU3RhdGUoc2Vzc2lvblJlc291cmNlLCByYXdTdGF0ZSk7XG5cdFx0XHRcdFx0dGhpcy5fc2V0Q2hhdFVSSShzZXNzaW9uUmVzb3VyY2UsIGNoYXRVUkkpO1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRTdWIgPSB0aGlzLl9lbnN1cmVDaGF0U3Vic2NyaXB0aW9uKHJlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpLCBjaGF0VVJJKTtcblx0XHRcdFx0XHRjaGF0U3Vic2NyaXB0aW9uID0gY2hhdFN1Yjtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl93aGVuU3Vic2NyaXB0aW9uSHlkcmF0ZWQoY2hhdFN1YiwgdG9rZW4pO1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVSSSk7XG5cdFx0XHRcdFx0aWYgKHNlc3Npb25TdGF0ZSkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvblRpdGxlID0gc2Vzc2lvblN0YXRlLnRpdGxlO1xuXHRcdFx0XHRcdFx0Y29uc3QgZHJhZnQgPSBzZXNzaW9uU3RhdGUuZHJhZnQgPz8gZW1wdHlEcmFmdEZyb21MYXN0VHVybihzZXNzaW9uU3RhdGUpO1xuXHRcdFx0XHRcdFx0ZHJhZnRJbnB1dFN0YXRlID0gdGhpcy5fZHJhZnRUb0lucHV0U3RhdGUoc2Vzc2lvblJlc291cmNlLCBkcmFmdCk7XG5cdFx0XHRcdFx0XHRpZiAoIXNlc3Npb25TdGF0ZS5kcmFmdCAmJiBkcmFmdCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChjaGF0VVJJLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCwgZHJhZnQgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBmYWxsYmFja1Jhd01vZGVsSWQgPSBsYXN0VHVybk1vZGVsU2VsZWN0aW9uKHNlc3Npb25TdGF0ZSk/LmlkO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9va3VwID0gdGhpcy5fY3JlYXRlVHVybk1vZGVsTG9va3VwKHNlc3Npb25SZXNvdXJjZSwgZmFsbGJhY2tSYXdNb2RlbElkKTtcblx0XHRcdFx0XHRcdGhpc3RvcnkucHVzaCguLi50dXJuc1RvSGlzdG9yeShcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZWRTZXNzaW9uLFxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uU3RhdGUudHVybnMsXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZy5hZ2VudElkLFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSxcblx0XHRcdFx0XHRcdFx0bG9va3VwLFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9jaGF0RXJyb3JDb250ZXh0KCksXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmluaXRpYWxpemVSZXN1bHQuZ2V0KCk/LnRlcm1pbmFsQ29tbWFuZFByZWZpeCxcblx0XHRcdFx0XHRcdCkpO1xuXG5cdFx0XHRcdFx0XHQvLyBFbnJpY2ggaGlzdG9yeSB3aXRoIGlubmVyIHRvb2wgY2FsbHMgZnJvbSBzdWJhZ2VudFxuXHRcdFx0XHRcdFx0Ly8gY2hpbGQgc2Vzc2lvbnMuIFN1YnNjcmliZXMgdG8gZWFjaCBjaGlsZCBzZXNzaW9uIHNvXG5cdFx0XHRcdFx0XHQvLyBpdHMgdG9vbCBjYWxscyBhcHBlYXIgZ3JvdXBlZCB1bmRlciB0aGUgcGFyZW50IHdpZGdldC5cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2VucmljaEhpc3RvcnlXaXRoU3ViYWdlbnRDYWxscyhoaXN0b3J5LCByZXNvbHZlZFNlc3Npb24sIHNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblN0YXRlKTtcblxuXHRcdFx0XHRcdFx0Ly8gU3RvcmUgaGlzdG9yaWNhbCB0dXJucyBzbyB0aGUgZWRpdGluZyBzZXNzaW9uIGNhbiBzZWVkIGFcblx0XHRcdFx0XHRcdC8vIHJlcXVlc3QtbGV2ZWwgY2hlY2twb2ludCBmb3IgZWFjaCB0dXJuICh3aXRoIGZpbGUgZWRpdHNcblx0XHRcdFx0XHRcdC8vIGZvbGRlZCBpbikgd2hlbiB0aGUgY29udHJvbGxlciBpcyBjcmVhdGVkIGxhemlseS4gV2Ugc2VlZFxuXHRcdFx0XHRcdFx0Ly8gZm9yIGV2ZXJ5IHR1cm4gXHUyMDE0IG5vdCBqdXN0IHRob3NlIHdpdGggZWRpdHMgXHUyMDE0IHNvIFwiUmVzdG9yZVxuXHRcdFx0XHRcdFx0Ly8gQ2hlY2twb2ludFwiIG9uIGFueSBoaXN0b3JpY2FsIHJlcXVlc3QgY2FuIGZpbmQgYSBib3VuZGFyeVxuXHRcdFx0XHRcdFx0Ly8gdG8gbmF2aWdhdGUgdG8uXG5cdFx0XHRcdFx0XHRpZiAoc2Vzc2lvblN0YXRlLnR1cm5zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0hpc3RvcnlUdXJucy5zZXQoc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uU3RhdGUudHVybnMpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBJZiB0aGVyZSdzIGFuIGFjdGl2ZSB0dXJuLCBpbmNsdWRlIGl0cyByZXF1ZXN0IGluIGhpc3Rvcnlcblx0XHRcdFx0XHRcdC8vIHdpdGggYW4gZW1wdHkgcmVzcG9uc2Ugc28gdGhlIGNoYXQgc2VydmljZSBjcmVhdGVzIGFcblx0XHRcdFx0XHRcdC8vIHBlbmRpbmcgcmVxdWVzdCwgdGhlbiBwcm92aWRlIGFjY3VtdWxhdGVkIHByb2dyZXNzIHZpYVxuXHRcdFx0XHRcdFx0Ly8gcHJvZ3Jlc3NPYnMgZm9yIGxpdmUgc3RyZWFtaW5nLlxuXHRcdFx0XHRcdFx0aWYgKHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuKSB7XG5cdFx0XHRcdFx0XHRcdGFjdGl2ZVR1cm5JZCA9IHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLmlkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVSYXdNb2RlbElkID0gc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4udXNhZ2U/Lm1vZGVsID8/IGZhbGxiYWNrUmF3TW9kZWxJZDtcblx0XHRcdFx0XHRcdFx0aGlzdG9yeS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4uaWQsXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0XHRcdFx0XHRcdHByb21wdDogc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4ubWVzc2FnZS50ZXh0LFxuXHRcdFx0XHRcdFx0XHRcdHBhcnRpY2lwYW50OiB0aGlzLl9jb25maWcuYWdlbnRJZCxcblx0XHRcdFx0XHRcdFx0XHRtb2RlbElkOiBsb29rdXAudG9MYW5ndWFnZU1vZGVsSWQoYWN0aXZlUmF3TW9kZWxJZCksXG5cdFx0XHRcdFx0XHRcdFx0dGltZXN0YW1wOiBwYXJzZVRpbWVzdGFtcChzZXNzaW9uU3RhdGUuYWN0aXZlVHVybi5zdGFydGVkQXQpLFxuXHRcdFx0XHRcdFx0XHRcdHZhcmlhYmxlRGF0YTogbWVzc2FnZVRvVmFyaWFibGVEYXRhKHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLm1lc3NhZ2UsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRcdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4ubWVzc2FnZS5vcmlnaW4ua2luZCA9PT0gTWVzc2FnZUtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0aGlzdG9yeS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAncmVzcG9uc2UnLFxuXHRcdFx0XHRcdFx0XHRcdHBhcnRzOiBbXSxcblx0XHRcdFx0XHRcdFx0XHRwYXJ0aWNpcGFudDogdGhpcy5fY29uZmlnLmFnZW50SWQsXG5cdFx0XHRcdFx0XHRcdFx0ZGV0YWlsczogbG9va3VwLnRvUmVzcG9uc2VEZXRhaWxzKGFjdGl2ZVJhd01vZGVsSWQsIHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLnVzYWdlKSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdGluaXRpYWxQcm9ncmVzcyA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFxuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmVkU2Vzc2lvbixcblx0XHRcdFx0XHRcdFx0XHRzZXNzaW9uU3RhdGUuYWN0aXZlVHVybixcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSxcblx0XHRcdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5LFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX290aGVyQ2xpZW50VG9vbEludm9jYXRpb25PcHRpb25zKHJlc29sdmVkU2Vzc2lvbiwgY2hhdFVSSSwgc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4uaWQpLFxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRpbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQgPSBzZXNzaW9uU3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLmxlbmd0aDtcblx0XHRcdFx0XHRcdFx0Ly8gRW5yaWNoIHVzYWdlIGVudHJpZXMgd2l0aCB0aGUgYWN0dWFsIG1vZGVsIHNvIHRoZVxuXHRcdFx0XHRcdFx0XHQvLyBjb250ZXh0LXVzYWdlIHdpZGdldCByZXNvbHZlcyB0aGUgcmlnaHQgY29udGV4dCB3aW5kb3dcblx0XHRcdFx0XHRcdFx0Ly8gb24gcmVjb25uZWN0aW9uIChzYW1lIGVucmljaG1lbnQgYXMgX29ic2VydmVUdXJuKS5cblx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0dWFsTW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4udXNhZ2U/Lm1vZGVsKTtcblx0XHRcdFx0XHRcdFx0aWYgKGFjdHVhbE1vZGVsSWQpIHtcblx0XHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHAgb2YgaW5pdGlhbFByb2dyZXNzKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAocC5raW5kID09PSAndXNhZ2UnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHAuYWN0dWFsTW9kZWxJZCA9IGFjdHVhbE1vZGVsSWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gUmVjb25uZWN0aW5nIHRvIGFjdGl2ZSB0dXJuICR7YWN0aXZlVHVybklkfSBmb3Igc2Vzc2lvbiAke3Jlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gc3Vic2NyaWJlIHRvIGV4aXN0aW5nIHNlc3Npb246ICR7cmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCl9YCwgZXJyKTtcblx0XHRcdFx0XHQvLyBTdXJmYWNlIGEgaGFyZCBsb2FkIGZhaWx1cmUgYXMgYSB2aXNpYmxlIGNoYXQgZXJyb3IgaW5zdGVhZCBvZlxuXHRcdFx0XHRcdC8vIGEgc2lsZW50bHkgZW1wdHkgc2Vzc2lvbi4gT25seSB3aGVuIG5vdGhpbmcgZWxzZSByZW5kZXJlZCwgc28gYVxuXHRcdFx0XHRcdC8vIHBhcnRpYWxseS1oeWRyYXRlZCBoaXN0b3J5IGlzbid0IGNsb2JiZXJlZC4gQSBiYXJlIHJlc3BvbnNlIGlzXG5cdFx0XHRcdFx0Ly8gZHJvcHBlZCB3aXRob3V0IGEgcHJlY2VkaW5nIHJlcXVlc3QsIHNvIGFuY2hvciBpdCB3aXRoIGFcblx0XHRcdFx0XHQvLyBzeXN0ZW0taW5pdGlhdGVkIHJlcXVlc3QgKHJlbmRlcnMgYXMgYSBjb21wYWN0IG5vdGljZSwgbm90IGFcblx0XHRcdFx0XHQvLyB1c2VyIGJ1YmJsZSkgYW5kIGF0dGFjaCB0aGUgZXJyb3IgdG8gaXRzIHJlc3BvbnNlLiBQcmVmZXIgdGhlXG5cdFx0XHRcdFx0Ly8gdW5kZXJseWluZyBlcnJvciBtZXNzYWdlIChlLmcuIHRoZSBnaXQgd29ya3RyZWUtcmVjcmVhdGlvblxuXHRcdFx0XHRcdC8vIGZhaWx1cmUpIHNvIHRoZSB1c2VyIHNlZXMgdGhlIGFjdHVhbCBjYXVzZSwgZmFsbGluZyBiYWNrIHRvIGFcblx0XHRcdFx0XHQvLyBnZW5lcmljIG1lc3NhZ2UuXG5cdFx0XHRcdFx0aWYgKGhpc3RvcnkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRoaXN0b3J5LnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAncmVxdWVzdCcsXG5cdFx0XHRcdFx0XHRcdHByb21wdDogJycsXG5cdFx0XHRcdFx0XHRcdHBhcnRpY2lwYW50OiB0aGlzLl9jb25maWcuYWdlbnRJZCxcblx0XHRcdFx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Mb2FkRmFpbGVkTGFiZWwnLCBcIkNvdWxkbid0IG9wZW4gc2Vzc2lvblwiKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0aGlzdG9yeS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlJyxcblx0XHRcdFx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0XHRcdFx0XHRwYXJ0aWNpcGFudDogdGhpcy5fY29uZmlnLmFnZW50SWQsXG5cdFx0XHRcdFx0XHRcdGVycm9yRGV0YWlsczogeyBtZXNzYWdlOiB1bndyYXBTZXNzaW9uTG9hZEVycm9yTWVzc2FnZShlcnIpID8/IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkxvYWRGYWlsZWQnLCBcIlRoaXMgc2Vzc2lvbiBjb3VsZG4ndCBiZSBsb2FkZWQuXCIpIH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gKHRoaXMuX2h5ZHJhdGluZ0NoYXRTZXNzaW9ucy5nZXQoaHlkcmF0aW9uS2V5KSA/PyAxKSAtIDE7XG5cdFx0XHRpZiAocmVtYWluaW5nID4gMCkge1xuXHRcdFx0XHR0aGlzLl9oeWRyYXRpbmdDaGF0U2Vzc2lvbnMuc2V0KGh5ZHJhdGlvbktleSwgcmVtYWluaW5nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2h5ZHJhdGluZ0NoYXRTZXNzaW9ucy5kZWxldGUoaHlkcmF0aW9uS2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWdlbnRIb3N0Q2hhdFNlc3Npb24sXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRoaXN0b3J5LFxuXHRcdFx0c2Vzc2lvblRpdGxlLFxuXHRcdFx0c2Vzc2lvblN1YnNjcmlwdGlvbixcblx0XHRcdGNoYXRTdWJzY3JpcHRpb24sXG5cdFx0XHR0aGlzLl9jb25maWcucHJvbXB0Q2FjaGVOb3RpZmljYXRpb24sXG5cdFx0XHQocmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9nZXRTZXNzaW9uU3RhdGUocmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9yayBzZXNzaW9uIGJlZm9yZSB0aGUgaW5pdGlhbCByZXF1ZXN0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZm9ya1Nlc3Npb24oc2Vzc2lvblJlc291cmNlLCByZXNvbHZlZFNlc3Npb24sIHJlcXVlc3QsIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHQodGl0bGU6IHN0cmluZywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0XHRkcmFmdElucHV0U3RhdGUsXG5cdFx0XHRpbml0aWFsUHJvZ3Jlc3MsXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25zLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9kcmFmdFN5bmNTdWJzY3JpcHRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fc2VydmVyVHVybldhdGNoZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fbWNwQXV0aFdhdGNoZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0hpc3RvcnlUdXJucy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fc3VyZmFjZWRNY3BBdXRoU2VydmVycy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX2NoYXRVUklzQnlTZXNzaW9uUmVzb3VyY2UuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX2NoYXRVUklzQnlTZXNzaW9uUmVzb3VyY2UuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChjaGF0VVJJKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVsZWFzZUNoYXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVSSSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSByZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX2NoYXRVUklzQnlTZXNzaW9uUmVzb3VyY2UuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmICghY2hhdFVSSSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5LCBjaGF0VVJJKT8uYWN0aXZlVHVybj8uaWQ7XG5cdFx0XHRcdGlmICghdHVybklkKSB7XG5cdFx0XHRcdFx0Ly8gTm8gYWN0aXZlIHR1cm4gKGxpa2VseSBhIHJhY2Ugd2l0aCBjb21wbGV0aW9uKS4gTm9vcC1zdWNjZXNzLlxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gQ2FuY2VsbGF0aW9uIHJlcXVlc3RlZCBmb3IgJHtzZXNzaW9uS2V5fSwgZGlzcGF0Y2hpbmcgdHVybkNhbmNlbGxlZGApO1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChjaGF0VVJJLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX3R1cm5EdXJhdGlvbihjaGF0VVJJLCB0dXJuSWQpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvbik7XG5cblx0XHRpZiAoIWlzTmV3U2Vzc2lvbikge1xuXHRcdFx0Ly8gT25seSB3aXJlIHVwIHBlbmRpbmctbWVzc2FnZS9kcmFmdCBzeW5jIG9uY2UgdGhlIGNoYXQgVVJJIGhhcyBiZWVuXG5cdFx0XHQvLyByZXNvbHZlZC4gV2hlbiBoeWRyYXRpb24gZmFpbGVkIChzZWUgdGhlIGNhdGNoIGFib3ZlKSwgYGNoYXRVUklgXG5cdFx0XHQvLyBzdGF5cyB1bmRlZmluZWQ7IHN1YnNjcmliaW5nIGFueXdheSB3b3VsZCBsYXRlciBpbnZva2Vcblx0XHRcdC8vIGBfc3luY1BlbmRpbmdNZXNzYWdlc2AsIHdob3NlIGBfZ2V0Q2hhdFVSSWAgbG9va3VwIHRocm93cyBiZWNhdXNlIG5vXG5cdFx0XHQvLyBtYXBwaW5nIHdhcyBldmVyIHN0b3JlZCBmb3IgdGhpcyBzZXNzaW9uIHJlc291cmNlLlxuXHRcdFx0aWYgKGNoYXRVUkkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9lbnN1cmVQZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbihzZXNzaW9uUmVzb3VyY2UsIHJlc29sdmVkU2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZURyYWZ0U3luY1N1YnNjcmlwdGlvbihzZXNzaW9uUmVzb3VyY2UsIHJlc29sdmVkU2Vzc2lvbiwgY2hhdFVSSSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVhZ2VybHkgY3JlYXRlIHRoZSBzbmFwc2hvdCBjb250cm9sbGVyIG9uY2UgdGhlIENoYXRNb2RlbCBmb3Jcblx0XHRcdC8vIHRoaXMgc2Vzc2lvbiBpcyBhdmFpbGFibGUgc28gdGhhdCBcIlJlc3RvcmUgQ2hlY2twb2ludFwiIHdvcmtzXG5cdFx0XHQvLyBvbiBoaXN0b3JpY2FsIHR1cm5zLiBUaGUgbW9kZWwgbWF5IGFscmVhZHkgZXhpc3QgKGluIHdoaWNoXG5cdFx0XHQvLyBjYXNlIHdlIHJ1biBzeW5jaHJvbm91c2x5KSBvciBpdCBtYXkgYmUgY3JlYXRlZCBzaG9ydGx5IGFmdGVyXG5cdFx0XHQvLyB0aGlzIGNvZGUgcnVucyBcdTIwMTQgd2Uga2VlcCB0aGUgbGlzdGVuZXIgYWxpdmUgdW50aWwgb3VyIHNlc3Npb25cblx0XHRcdC8vIG1hdGNoZXMsIHNpbmNlIGBFdmVudC5vbmNlYCB3b3VsZCBiZSBjb25zdW1lZCBieSBhbiB1bnJlbGF0ZWRcblx0XHRcdC8vIG1vZGVsIGNyZWF0ZWQgZmlyc3QuXG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ0hpc3RvcnlUdXJucy5oYXMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZW5zdXJlU25hcHNob3RDb250cm9sbGVyKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3ViID0gdGhpcy5fY2hhdFNlcnZpY2Uub25EaWRDcmVhdGVNb2RlbChtb2RlbCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNFcXVhbChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZW5zdXJlU25hcHNob3RDb250cm9sbGVyKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c2Vzc2lvbi5yZWdpc3RlckRpc3Bvc2FibGUoc3ViKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiByZWNvbm5lY3RpbmcgdG8gYW4gYWN0aXZlIHR1cm4sIHdpcmUgdXAgYW4gb25nb2luZyBzdGF0ZSBsaXN0ZW5lclxuXHRcdFx0Ly8gdG8gc3RyZWFtIG5ldyBwcm9ncmVzcyBpbnRvIHRoZSBzZXNzaW9uJ3MgcHJvZ3Jlc3NPYnMuXG5cdFx0XHRpZiAoYWN0aXZlVHVybklkICYmIGluaXRpYWxQcm9ncmVzcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlY29ubmVjdFRvQWN0aXZlVHVybihyZXNvbHZlZFNlc3Npb24sIGFjdGl2ZVR1cm5JZCwgc2Vzc2lvbiwgaW5pdGlhbFByb2dyZXNzLCBpbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3IgZXhpc3Rpbmcgc2Vzc2lvbnMsIHN0YXJ0IHdhdGNoaW5nIGZvciBzZXJ2ZXItaW5pdGlhdGVkIHR1cm5zXG5cdFx0XHQvLyBpbW1lZGlhdGVseS4gRm9yIG5ldyBzZXNzaW9ucywgdGhpcyBpcyBkZWZlcnJlZCB0byBfY3JlYXRlQW5kU3Vic2NyaWJlLlxuXHRcdFx0aWYgKGNoYXRVUkkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl93YXRjaEZvclNlcnZlckluaXRpYXRlZFR1cm5zKHJlc29sdmVkU2Vzc2lvbiwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdC8vIC0tLS0gQWdlbnQgcmVnaXN0cmF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9yZWdpc3RlckFnZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGFnZW50RGF0YTogSUNoYXRBZ2VudERhdGEgPSB7XG5cdFx0XHRpZDogdGhpcy5fY29uZmlnLmFnZW50SWQsXG5cdFx0XHRuYW1lOiB0aGlzLl9jb25maWcuYWdlbnRJZCxcblx0XHRcdGZ1bGxOYW1lOiB0aGlzLl9jb25maWcuZnVsbE5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fY29uZmlnLmRlc2NyaXB0aW9uLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKHRoaXMuX2NvbmZpZy5leHRlbnNpb25JZCA/PyAndnNjb2RlLmFnZW50LWhvc3QnKSxcblx0XHRcdGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCxcblx0XHRcdGV4dGVuc2lvblB1Ymxpc2hlcklkOiAndnNjb2RlJyxcblx0XHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiB0aGlzLl9jb25maWcuZXh0ZW5zaW9uRGlzcGxheU5hbWUgPz8gJ0FnZW50IEhvc3QnLFxuXHRcdFx0aXNEZWZhdWx0OiBmYWxzZSxcblx0XHRcdGlzRHluYW1pYzogdHJ1ZSxcblx0XHRcdGlzQ29yZTogdHJ1ZSxcblx0XHRcdG1ldGFkYXRhOiB7IHRoZW1lSWNvbjogZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKHRoaXMuX2NvbmZpZy5zZXNzaW9uVHlwZSkgfSxcblx0XHRcdHNsYXNoQ29tbWFuZHM6IFtdLFxuXHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRtb2RlczogW0NoYXRNb2RlS2luZC5BZ2VudF0sXG5cdFx0XHRkaXNhbWJpZ3VhdGlvbjogW10sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFnZW50SW1wbDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0aW52b2tlOiBhc3luYyAocmVxdWVzdCwgcHJvZ3Jlc3MsIF9oaXN0b3J5LCBjYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW52b2tlQWdlbnQocmVxdWVzdCwgcHJvZ3Jlc3MsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJEeW5hbWljQWdlbnQoYWdlbnREYXRhLCBhZ2VudEltcGwpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ludm9rZUFnZW50KFxuXHRcdHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LFxuXHRcdHByb2dyZXNzOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZCxcblx0XHRjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8SUNoYXRBZ2VudFJlc3VsdD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gX2ludm9rZUFnZW50IGNhbGxlZCBmb3IgcmVzb3VyY2U6ICR7cmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblxuXHRcdC8vIEdhdGUgc3Bhd25pbmcgYW4gYWdlbnQgb24gd29ya3NwYWNlIHRydXN0LiBWaWV3aW5nIGNoYXQgYW5kIHRoZVxuXHRcdC8vIGFnZW50IGxpc3QgZG9lcyBub3QgcmVxdWlyZSB0cnVzdCwgYnV0IHNlbmRpbmcgYSBtZXNzYWdlIGRvZXMsIHNpbmNlXG5cdFx0Ly8gdGhlIGFnZW50IHJlYWRzIGZpbGVzLCBydW5zIGNvbW1hbmRzLCBhbmQgbWFrZXMgY2hhbmdlcyBpbiB0aGVcblx0XHQvLyB0YXJnZXQgZm9sZGVyLiBNaXJyb3JzIGhvdyBleHRlbnNpb24taG9zdCBjaGF0IGlzIGdhdGVkLiBJZiB0aGUgdXNlclxuXHRcdC8vIGRlY2xpbmVzLCBhYm9ydCB3aXRob3V0IHN0YXJ0aW5nIGEgc2Vzc2lvbi5cblx0XHRpZiAoIWF3YWl0IHRoaXMuX2Vuc3VyZVdvcmtzcGFjZVRydXN0KHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdC8vIEEgXCJDb250aW51ZSBpblx1MjAyNlwiIG1pZ3JhdGlvbiBmcm9tIGEgbG9jYWwgY2hhdCBzZWVkcyB0aGUgd2hvbGUgaW1wb3J0ZWRcblx0XHQvLyBjb252ZXJzYXRpb24gZWFnZXJseSAoQ0xJIHNwYXduLCBzZWVkaW5nIHR1cm5zKSBiZWZvcmUgYW55IHR1cm4gcHJvZ3Jlc3Ncblx0XHQvLyBzdHJlYW1zLCBsZWF2aW5nIHRoZSB3aWRnZXQgdHJhbnNpZW50bHkgZW1wdHkuIE9ubHkgZm9yIHRoYXQgbWlncmF0aW9uXG5cdFx0Ly8gY2FzZSBzaG93IGEgc2hpbW1lcmluZyBzdGF0dXMgaWYgdGhlIHR1cm4gaXMgc2xvdyB0byBzdGFydCwgY2FuY2VsbGVkIGFzXG5cdFx0Ly8gc29vbiBhcyByZWFsIHByb2dyZXNzIHN0cmVhbXMuIE5vcm1hbCBhZ2VudC1ob3N0IHNlc3Npb25zIFx1MjAxNCB3aG9zZSBmaXJzdFxuXHRcdC8vIHR1cm4gaXMgYWxzbyBzbG93IHRvIHNwYXduIFx1MjAxNCBuZXZlciBmbGFzaCBpdC5cblx0XHRjb25zdCBwcmVwYXJpbmdTdGF0dXMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGUoKTtcblx0XHRsZXQgZmFpbHVyZVN0YWdlOiBBZ2VudEhvc3RJbnZvY2F0aW9uRmFpbHVyZVN0YWdlID0gJ3Jlc29sdmVTZXNzaW9uJztcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZFNlc3Npb24gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblVyaShyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gcmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cblx0XHRcdGZhaWx1cmVTdGFnZSA9ICdwcm92aXNpb25hbFNlc3Npb24nO1xuXHRcdFx0Ly8gVGhlIGNoYXQtaW5wdXQgcGlja2VyIG1heSBoYXZlIHByZS1jcmVhdGVkIGEgcHJvdmlzaW9uYWwgc2Vzc2lvblxuXHRcdFx0Ly8gYWdhaW5zdCB0aGlzIHJlc291cmNlIChgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5nZXRPckNyZWF0ZWApLlxuXHRcdFx0Ly8gSW4gdGhhdCBjYXNlIHRoZSBhZ2VudCBhbHJlYWR5IGhhcyB0aGUgc2Vzc2lvbiArIHRoZSB1c2VyJ3MgY2hpcFxuXHRcdFx0Ly8gc2VsZWN0aW9ucyBpbiBgc3RhdGUuY29uZmlnLnZhbHVlc2A7IGVuc3VyZSB3ZSBob2xkIGEgcmVmY291bnRlZFxuXHRcdFx0Ly8gc3Vic2NyaXB0aW9uIG9uIGl0IHNvIHRoZSByZXN0IG9mIHRoZSBoYW5kbGVyIG9ic2VydmVzIHRob3NlLlxuXHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbih0aGlzLl9wcm92aXNpb25hbFNlcnZpY2Uud2FpdEZvclBlbmRpbmcocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJvdmlzaW9uYWxCYWNrZW5kID0gdGhpcy5fcHJvdmlzaW9uYWxTZXJ2aWNlLmdldChyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAocHJvdmlzaW9uYWxCYWNrZW5kKSB7XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24oc2Vzc2lvbktleSk7XG5cdFx0XHR9XG5cblx0XHRcdGZhaWx1cmVTdGFnZSA9ICdzZXNzaW9uU3RhdGUnO1xuXHRcdFx0Ly8gVGhlIHNlc3Npb25zIHByb3ZpZGVyIG1heSBoYXZlIGVhZ2VybHkgY3JlYXRlZCB0aGlzIHNlc3Npb24gYXRcblx0XHRcdC8vIGZvbGRlci1waWNrIHRpbWUgYW5kIGlzIGhvbGRpbmcgdGhlIGNvbm5lY3Rpb24tbGV2ZWwgc3Vic2NyaXB0aW9uXG5cdFx0XHQvLyBvcGVuIHdpdGggaHlkcmF0ZWQgc3RhdGUuIFVzZSB0aGUgdW5tYW5hZ2VkIGFjY2Vzc29yIHRvIHBlZWtcblx0XHRcdC8vIHdpdGhvdXQgdGFraW5nIGEgZnJlc2ggc3Vic2NyaXB0aW9uLCB3aGljaCB3b3VsZCB0cmlnZ2VyIGFcblx0XHRcdC8vIGR1cGxpY2F0ZSBzbmFwc2hvdCBmZXRjaCBhbmQgKGluIHRlc3RzKSB1bnJlbGF0ZWQgbW9jayBiZWhhdmlvdXIuXG5cdFx0XHRjb25zdCBleGlzdGluZ1N0YXRlID0gYXdhaXQgdGhpcy5fcmVhZEVhZ2VybHlDcmVhdGVkU2Vzc2lvblN0YXRlKHJlc29sdmVkU2Vzc2lvbiwgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFleGlzdGluZ1N0YXRlKSB7XG5cdFx0XHRcdC8vIEVhZ2VyLWNyZWF0ZSBkaWQgbm90IHByb2R1Y2Ugc2VydmVyLXNpZGUgc3RhdGUgKGUuZy4gbm9cblx0XHRcdFx0Ly8gc2Vzc2lvbnMgcHJvdmlkZXIgaW52b2x2ZWQsIGFnZW50IGhvc3Qgbm90IGNvbm5lY3RlZCBhdFxuXHRcdFx0XHQvLyBmb2xkZXItcGljayB0aW1lLCBvciB0aGlzIHNlc3Npb24gd2FzIGNyZWF0ZWQgdmlhIGEgbGVnYWN5L1xuXHRcdFx0XHQvLyB0ZXN0IHBhdGgpLiBGYWxsIGJhY2sgdG8gdGhlIG9yaWdpbmFsIGNyZWF0ZS10aGVuLXN1YnNjcmliZVxuXHRcdFx0XHQvLyBmbG93LlxuXHRcdFx0XHQvL1xuXHRcdFx0XHQvLyBJZiBhIGNvbnZlcnNhdGlvbiB3YXMgaW1wb3J0ZWQgKFwiQ29udGludWUgaW5cdTIwMjZcIikgaW50byB0aGlzXG5cdFx0XHRcdC8vIHNlc3Npb24sIHNlZWQgaXQgYXMgcmVhbCBlZGl0YWJsZSBoaXN0b3J5IGF0IGNyZWF0aW9uIHRpbWUuXG5cdFx0XHRcdGNvbnN0IGltcG9ydGVkID0gdGhpcy5faW1wb3J0Q29udmVyc2F0aW9uU3RvcmUudGFrZShyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChpbXBvcnRlZCkge1xuXHRcdFx0XHRcdC8vIE1pZ3JhdGlvbiBjYXNlOiBtYXRlcmlhbGl6aW5nIHRoZSBpbXBvcnRlZCBjb252ZXJzYXRpb24gaXMgdGhlXG5cdFx0XHRcdFx0Ly8gc2xvdywgdmlzdWFsbHktYmxhbmsgcGhhc2UgXHUyMDE0IGFybSB0aGUgXCJQcmVwYXJpbmcgc2Vzc2lvblx1MjAyNlwiIHN0YXR1cy5cblx0XHRcdFx0XHRwcmVwYXJpbmdTdGF0dXMudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzcyhbeyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhZ2VudEhvc3QucHJlcGFyaW5nU2Vzc2lvbicsIFwiUHJlcGFyaW5nIHNlc3Npb25cdTIwMjZcIikpLCBzaGltbWVyOiB0cnVlIH1dKTtcblx0XHRcdFx0XHR9LCA1MDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gaW1wb3J0ZWQ/Lm1vZGVsID8/IHRoaXMuX2NyZWF0ZU1vZGVsU2VsZWN0aW9uKHJlcXVlc3QudXNlclNlbGVjdGVkTW9kZWxJZCwgcmVxdWVzdC5tb2RlbENvbmZpZ3VyYXRpb24pO1xuXHRcdFx0XHRjb25zdCBpbml0aWFsQ29uZmlnID0ge1xuXHRcdFx0XHRcdC4uLnRoaXMuX3Byb3Zpc2lvbmFsU2VydmljZS5nZXRJbml0aWFsU2Vzc2lvbkNvbmZpZygpLFxuXHRcdFx0XHRcdC4uLnJlcXVlc3QuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZyxcblx0XHRcdFx0fTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY3JlYXRlQW5kU3Vic2NyaWJlKFxuXHRcdFx0XHRcdHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRPYmplY3Qua2V5cyhpbml0aWFsQ29uZmlnKS5sZW5ndGggPiAwID8gaW5pdGlhbENvbmZpZyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpbXBvcnRlZCA/IHsgdHVybnM6IGltcG9ydGVkLnR1cm5zLCBtb2RlbDogaW1wb3J0ZWQubW9kZWwgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdGFnZSA9PiBmYWlsdXJlU3RhZ2UgPSBzdGFnZSxcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZhaWx1cmVTdGFnZSA9ICdhdXRoZW50aWNhdGlvbic7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Vuc3VyZVJlcXVpcmVkQXV0aGVudGljYXRpb24oKTtcblxuXHRcdFx0XHRmYWlsdXJlU3RhZ2UgPSAnc3Vic2NyaWJlU2Vzc2lvbic7XG5cdFx0XHRcdC8vIEVhZ2VyLWNyZWF0ZWQgc2Vzc2lvbjogdGFrZSBhIHJlZmNvdW50ZWQgc3Vic2NyaXB0aW9uIHNvIHRoZVxuXHRcdFx0XHQvLyBoYW5kbGVyIG9ic2VydmVzIHN0YXRlIGNoYW5nZXMgZm9yIHRoZSBkdXJhdGlvbiBvZiB0aGUgY2hhdFxuXHRcdFx0XHQvLyBzZXNzaW9uLCB0aGVuIHdpcmUgdXAgdGhlIHBlci10dXJuIG1hY2hpbmVyeSB0aGF0XG5cdFx0XHRcdC8vIGBfY3JlYXRlQW5kU3Vic2NyaWJlYCB3b3VsZCBub3JtYWxseSBzZXQgdXAuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25TdWIgPSB0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHNlc3Npb25LZXkpO1xuXHRcdFx0XHRjb25zdCBjaGF0VVJJID0gdGhpcy5fcmVzb2x2ZUNoYXRVcmlGcm9tU3RhdGUocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIGV4aXN0aW5nU3RhdGUpO1xuXHRcdFx0XHR0aGlzLl9zZXRDaGF0VVJJKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCBjaGF0VVJJKTtcblx0XHRcdFx0Y29uc3QgY2hhdFN1YiA9IHRoaXMuX2Vuc3VyZUNoYXRTdWJzY3JpcHRpb24oc2Vzc2lvbktleSwgY2hhdFVSSSk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25zLmdldChyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk/LnNldFN0YXRlU3Vic2NyaXB0aW9ucyhzZXNzaW9uU3ViLCBjaGF0U3ViKTtcblx0XHRcdFx0dGhpcy5fZW5zdXJlUGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb24ocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIHJlc29sdmVkU2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuX3dhdGNoRm9yU2VydmVySW5pdGlhdGVkVHVybnMocmVzb2x2ZWRTZXNzaW9uLCByZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdFx0Ly8gSW4gdGhlIEFnZW50cyB3aW5kb3csIHRoZSBzZXNzaW9ucyBwcm92aWRlciBzdXBwbGllcyBwZXItcmVxdWVzdFxuXHRcdFx0XHQvLyBjb25maWcgdmlhIGByZXF1ZXN0LmFnZW50SG9zdFNlc3Npb25Db25maWdgIChlLmcuIHRoZSB1c2VyJ3Ncblx0XHRcdFx0Ly8gcGVybWlzc2lvbiBsZXZlbCkuIFB1c2ggaXQgdG8gdGhlIGFnZW50IHNvIGl0cyBwcm92aXNpb25hbCByZWNvcmRcblx0XHRcdFx0Ly8gbWF0ZXJpYWxpemVzIHdpdGggdGhvc2UgdmFsdWVzLiBXb3JrYmVuY2ggZGVmYXVsdHMgKGBpc29sYXRpb25gLFxuXHRcdFx0XHQvLyBgYXV0b0FwcHJvdmVgKSBhcmUgc2VlZGVkIHVwc3RyZWFtIGF0IHByb3Zpc2lvbmFsIGBjcmVhdGVTZXNzaW9uYFxuXHRcdFx0XHQvLyB0aW1lLCBzbyB3ZSBkb24ndCBuZWVkIHRvIG1lcmdlIHRoZW0gaGVyZS4gUGlja2VyIHNlbGVjdGlvbnNcblx0XHRcdFx0Ly8gYWxyZWFkeSBsaXZlIGluIGBleGlzdGluZ1N0YXRlLmNvbmZpZz8udmFsdWVzYCBhbmQgZG9uJ3QgbmVlZCB0b1xuXHRcdFx0XHQvLyBiZSByZS1kaXNwYXRjaGVkLlxuXHRcdFx0XHRpZiAocmVxdWVzdC5hZ2VudEhvc3RTZXNzaW9uQ29uZmlnICYmIE9iamVjdC5rZXlzKHJlcXVlc3QuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZykubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKHJlc29sdmVkU2Vzc2lvbiwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0XHRcdGNvbmZpZzogcmVxdWVzdC5hZ2VudEhvc3RTZXNzaW9uQ29uZmlnLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1lYXN1cmUgdHVybiB0aW1pbmdzIHNvIHRoZSBjb3JlIGBpbnRlcmFjdGl2ZVNlc3Npb25Qcm92aWRlckludm9rZWRgXG5cdFx0XHQvLyB0ZWxlbWV0cnkgZXZlbnQgaXMgcG9wdWxhdGVkIGZvciBhZ2VudC1ob3N0IHByb3ZpZGVycy5cblx0XHRcdGNvbnN0IHN0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdFx0bGV0IGZpcnN0UHJvZ3Jlc3M6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1lYXN1cmVkUHJvZ3Jlc3MgPSAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4ge1xuXHRcdFx0XHQvLyBSZWFsIHByb2dyZXNzIGhhcyBzdGFydGVkIFx1MjAxNCBjYW5jZWwgdGhlIHBlbmRpbmcgXCJwcmVwYXJpbmdcIiBzdGF0dXMuXG5cdFx0XHRcdHByZXBhcmluZ1N0YXR1cy5jbGVhcigpO1xuXHRcdFx0XHRpZiAoZmlyc3RQcm9ncmVzcyA9PT0gdW5kZWZpbmVkICYmIHBhcnRzLnNvbWUoaXNGaXJzdFZpc2libGVQcm9ncmVzc1BhcnQpKSB7XG5cdFx0XHRcdFx0Zmlyc3RQcm9ncmVzcyA9IHN0b3BXYXRjaC5lbGFwc2VkKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJvZ3Jlc3MocGFydHMpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZmFpbHVyZVN0YWdlID0gJ3ByZXBhcmVUdXJuJztcblx0XHRcdGNvbnN0IGNvbXBsZXRlZFR1cm4gPSBhd2FpdCB0aGlzLl9oYW5kbGVUdXJuKHJlc29sdmVkU2Vzc2lvbiwgcmVxdWVzdCwgbWVhc3VyZWRQcm9ncmVzcywgY2FuY2VsbGF0aW9uVG9rZW4sIHN0YWdlID0+IGZhaWx1cmVTdGFnZSA9IHN0YWdlKTtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSB0aGlzLl9nZXRUdXJuUmVzcG9uc2VEZXRhaWxzKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCByZXNvbHZlZFNlc3Npb24sIGNvbXBsZXRlZFR1cm4pO1xuXHRcdFx0Y29uc3QgZXJyb3JEZXRhaWxzID0gdGhpcy5fZ2V0VHVybkVycm9yRGV0YWlscyhjb21wbGV0ZWRUdXJuKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGltaW5nczogeyBmaXJzdFByb2dyZXNzLCB0b3RhbEVsYXBzZWQ6IHN0b3BXYXRjaC5lbGFwc2VkKCkgfSxcblx0XHRcdFx0Li4uKGRldGFpbHMgPyB7IGRldGFpbHMgfSA6IHt9KSxcblx0XHRcdFx0Li4uKGVycm9yRGV0YWlscyA/IHsgZXJyb3JEZXRhaWxzIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydEludm9jYXRpb25GYWlsdXJlKHJlcXVlc3QsIGZhaWx1cmVTdGFnZSwgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIEFsd2F5cyBjYW5jZWwgdGhlIHBlbmRpbmcgXCJwcmVwYXJpbmdcIiBzdGF0dXMgXHUyMDE0IGluY2x1ZGluZyB3aGVuIGFuXG5cdFx0XHQvLyBhd2FpdCBhYm92ZSAoc3RhdGUgcmVhZCwgY3JlYXRlL3N1YnNjcmliZSwgdHVybiBoYW5kbGluZykgcmVqZWN0cyBcdTIwMTRcblx0XHRcdC8vIHNvIGEgc3RhbGUgc3RhdHVzIGNhbiBuZXZlciBmaXJlIGFmdGVyIHRoZSBpbnZvY2F0aW9uIGhhcyBlbmRlZC5cblx0XHRcdHByZXBhcmluZ1N0YXR1cy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0SW52b2NhdGlvbkZhaWx1cmUocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGZhaWx1cmVTdGFnZTogQWdlbnRIb3N0SW52b2NhdGlvbkZhaWx1cmVTdGFnZSwgZXJyb3I6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBwYWNrZWQgPSBwYWNrRXJyb3JGb3JUZWxlbWV0cnkoZXJyb3IpO1xuXHRcdGNvbnN0IHJlcXVlc3RzID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk/LmdldFJlcXVlc3RzKCk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2dFcnJvcjI8QWdlbnRIb3N0SW52b2NhdGlvbkZhaWxlZEV2ZW50LCBBZ2VudEhvc3RJbnZvY2F0aW9uRmFpbGVkQ2xhc3NpZmljYXRpb24+KCdhZ2VudEhvc3QuaW52b2NhdGlvbkZhaWxlZCcsIHtcblx0XHRcdHJlcXVlc3RJZDogcmVxdWVzdC5yZXF1ZXN0SWQsXG5cdFx0XHRwcm92aWRlcjogdGhpcy5fY29uZmlnLnByb3ZpZGVyLFxuXHRcdFx0ZmFpbHVyZVN0YWdlLFxuXHRcdFx0aXNGaXJzdFJlcXVlc3Q6IHJlcXVlc3RzPy5bMF0/LmlkID09PSByZXF1ZXN0LnJlcXVlc3RJZCxcblx0XHRcdGhhc1VzZXJTZWxlY3RlZE1vZGVsOiByZXF1ZXN0LnVzZXJTZWxlY3RlZE1vZGVsSWQgIT09IHVuZGVmaW5lZCxcblx0XHRcdGVycm9yTmFtZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm5hbWUgOiB0eXBlb2YgZXJyb3IsXG5cdFx0XHRlcnJvckNvZGU6IGdldEVycm9yQ29kZShlcnJvciksXG5cdFx0XHRtc2c6IHBhY2tlZC5tc2csXG5cdFx0XHRjYWxsc3RhY2s6IHBhY2tlZC5jYWxsc3RhY2ssXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSB7QGxpbmsgSUNoYXRSZXNwb25zZUVycm9yRGV0YWlsc30gZm9yIGEgZmFpbGVkIHR1cm4gc28gdGhlXG5cdCAqIGNoYXQgcmVzcG9uc2UgcmVuZGVycyBhIHByb3BlciBlcnJvciAoYW5kLCBmb3IgcXVvdGEgZXJyb3JzLCB0aGUgdXBncmFkZVxuXHQgKiBhZmZvcmRhbmNlIHZpYSBgQ2hhdFF1b3RhRXhjZWVkZWRQYXJ0YCkuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yXG5cdCAqIG5vbi1lcnJvciB0dXJucy4gRmFsbHMgYmFjayB0byB0aGUgcmF3IGVycm9yIHdoZW4gbm8gc3RydWN0dXJlZCBjaGF0XG5cdCAqIGVycm9yIHdhcyBmb3J3YXJkZWQgaW4gYF9tZXRhYC5cblx0ICovXG5cdHByaXZhdGUgX2dldFR1cm5FcnJvckRldGFpbHModHVybjogVHVybiB8IHVuZGVmaW5lZCk6IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0dXJuPy5zdGF0ZSAhPT0gVHVyblN0YXRlLkVycm9yIHx8ICF0dXJuLmVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21NZXRhKHR1cm4uZXJyb3IsIHRoaXMuX2NoYXRFcnJvckNvbnRleHQoKSlcblx0XHRcdD8/IHsgbWVzc2FnZTogbG9jYWxpemUoJ2FnZW50SG9zdC50dXJuRXJyb3InLCBcIkVycm9yOiAoezB9KSB7MX1cIiwgdHVybi5lcnJvci5lcnJvclR5cGUsIHR1cm4uZXJyb3IubWVzc2FnZSkgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB7QGxpbmsgU2Vzc2lvblN0YXRlfSBmb3IgYSBzZXNzaW9uIHRoYXQgd2FzIGVhZ2VybHkgY3JlYXRlZFxuXHQgKiBhdCBmb2xkZXItcGljayB0aW1lLCBvciBgdW5kZWZpbmVkYCBpZiBubyBzdWNoIHNlc3Npb24gZXhpc3RzLiBVc2VzIHRoZVxuXHQgKiB1bm1hbmFnZWQgc3Vic2NyaXB0aW9uIGFjY2Vzc29yIHNvIHdlIGRvbid0IGFjY2lkZW50YWxseSBvcGVuIGEgZnJlc2hcblx0ICogc3Vic2NyaXB0aW9uICh3aGljaCB3b3VsZCBpc3N1ZSBhIGR1cGxpY2F0ZSBzbmFwc2hvdCBmZXRjaCBvbiB0aGUgd2lyZSxcblx0ICogYW5kIGluIHRlc3RzIHdvdWxkIHN5bnRoZXNpc2UgcGxhY2Vob2xkZXIgc3RhdGUgdmlhIHRoZSBtb2NrJ3MgYXV0by1cblx0ICogaHlkcmF0aW9uIHBhdGgpLlxuXHQgKlxuXHQgKiBJZiB0aGUgZWFnZXIgc3Vic2NyaXB0aW9uIGV4aXN0cyBidXQgaGFzbid0IHJlY2VpdmVkIGl0cyBmaXJzdCBzbmFwc2hvdFxuXHQgKiB5ZXQgKGNyZWF0aW9uIGluIGZsaWdodCksIHdhaXRzIGZvciBpdCB0byBoeWRyYXRlIG9yIGVycm9yIGJlZm9yZVxuXHQgKiByZXR1cm5pbmcuIFRoaXMgY2xvc2VzIGEgcmFjZSB3aGVyZSB0aGUgY2hhdCByZXF1ZXN0IGFycml2ZXMgYmV0d2VlblxuXHQgKiBgY3JlYXRlU2Vzc2lvbmAgcmVzb2x2aW5nIGFuZCB0aGUgc25hcHNob3QgbGFuZGluZy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRFYWdlcmx5Q3JlYXRlZFNlc3Npb25TdGF0ZShyZXNvbHZlZFNlc3Npb246IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBJZiB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIncyBlYWdlciBgY3JlYXRlU2Vzc2lvbmAgaXMgc3RpbGwgaW4gZmxpZ2h0LCB3YWl0IGZvciBpdCBzbyBpdHMgSUlGRSBoYXMgYSBjaGFuY2UgdG9cblx0XHQvLyBvcGVuIHRoZSBzdGF0ZSBzdWJzY3JpcHRpb24gYmVmb3JlIHdlIGZhbGwgdGhyb3VnaCB0byBhIGR1cGxpY2F0ZSBgX2NyZWF0ZUFuZFN1YnNjcmliZWAgYmVsb3cuIEJvdGggd2UgYW5kXG5cdFx0Ly8gdGhlIElJRkUgYXdhaXQgdGhlIHNhbWUgcHJvbWlzZSBvYmplY3QsIHNvIG1pY3JvdGFzayBGSUZPIHJ1bnMgdGhlIElJRkUncyBjb250aW51YXRpb24gZmlyc3QgKGl0IHJlZ2lzdGVyZWRcblx0XHQvLyBiYWNrIGluIGBfc3RhcnROZXdTZXNzaW9uQmFja2VuZGApIFx1MjAxNCBpdCBvcGVucyB0aGUgc3Vic2NyaXB0aW9uLCB0aGVuIHdlIG9ic2VydmUgaXQgKGlzc3VlICMzMTk3NjQpLlxuXHRcdGNvbnN0IGluZmxpZ2h0ID0gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZ2V0SW5mbGlnaHRTZXNzaW9uQ3JlYXRlPy4ocmVzb2x2ZWRTZXNzaW9uKTtcblx0XHRpZiAoaW5mbGlnaHQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGluZmxpZ2h0O1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFN3YWxsb3cgXHUyMDE0IGBnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWRgIHJldHVybnMgdW5kZWZpbmVkIGZvciBhIGZhaWxlZCBjcmVhdGUsIG1hdGNoaW5nIGZhbGwtdGhyb3VnaC5cblx0XHRcdH1cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHN1YiA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZChTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgcmVzb2x2ZWRTZXNzaW9uKTtcblx0XHRpZiAoIXN1Yikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHN1Yi52YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gc3ViLnZhbHVlIGluc3RhbmNlb2YgRXJyb3IgPyB1bmRlZmluZWQgOiBzdWIudmFsdWU7XG5cdFx0fVxuXG5cdFx0Ly8gU25hcHNob3QgaXMgaW4gZmxpZ2h0LiBQaW4gdGhlIHN1YnNjcmlwdGlvbiB3aXRoIGEgZnJlc2hcblx0XHQvLyByZWZjb3VudCBmb3IgdGhlIGR1cmF0aW9uIG9mIHRoZSBhd2FpdCBzbyB0aGUgZWFnZXIgaG9sZGVyXG5cdFx0Ly8gcmVsZWFzaW5nIGNvbmN1cnJlbnRseSBjYW4ndCB0ZWFyIGRvd24gdGhlIHVuZGVybHlpbmcgZW1pdHRlclxuXHRcdC8vICh3aGljaCB3b3VsZCBsZWF2ZSBgb25EaWRDaGFuZ2VgIHNpbGVudCBhbmQgaGFuZyB0aGUgYXdhaXQpLlxuXHRcdGNvbnN0IHBpblJlZiA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgcmVzb2x2ZWRTZXNzaW9uLCAnQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXInKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gU2V0dGxlIG9uIHNuYXBzaG90LCBlcnJvciwgb3IgY2FuY2VsbGF0aW9uLiBMaXN0ZW5pbmcgZm9yIHRoZVxuXHRcdFx0Ly8gZXJyb3IgdHJhbnNpdGlvbiBpcyBlc3NlbnRpYWw6IGEgZmFpbGVkIHN1YnNjcmliZSBmbGlwcyB0aGVcblx0XHRcdC8vIHN1YnNjcmlwdGlvbiB2aWEgYHNldEVycm9yYCwgd2hpY2ggZmlyZXMgYG9uRGlkRXJyb3JgIGJ1dCBOT1Rcblx0XHRcdC8vIGBvbkRpZENoYW5nZWAsIHNvIGFuIGBvbkRpZENoYW5nZWAtb25seSB3YWl0IHdvdWxkIGhhbmcgZm9yIHRoZVxuXHRcdFx0Ly8gZnVsbCB0dXJuIHRpbWVvdXQgKGlzc3VlICM1MjQyKS5cblx0XHRcdGF3YWl0IHRoaXMuX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZChwaW5SZWYub2JqZWN0LCB0b2tlbik7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHBpblJlZi5vYmplY3QudmFsdWU7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RdIF9yZWFkRWFnZXJseUNyZWF0ZWRTZXNzaW9uU3RhdGU6IGh5ZHJhdGVkIHZhbHVlPSR7dmFsdWUgPT09IHVuZGVmaW5lZCA/ICd1bmRlZmluZWQnIDogdmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/IGBlcnJvcigke3ZhbHVlLm1lc3NhZ2V9KWAgOiAnc3RhdGUnfSBjYW5jZWxsZWQ9JHt0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZH0gZm9yICR7cmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm4gdmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/IHVuZGVmaW5lZCA6IHZhbHVlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwaW5SZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gUGVuZGluZyBtZXNzYWdlIHN5bmMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogRGlmZnMgdGhlIGNoYXQgbW9kZWwncyBwZW5kaW5nIHJlcXVlc3RzIGFnYWluc3QgdGhlIHByb3RvY29sIHN0YXRlIGluXG5cdCAqIGBfY2xpZW50U3RhdGVgIGFuZCBkaXNwYXRjaGVzIFNldC9SZW1vdmVkL1Jlb3JkZXJlZCBhY3Rpb25zIGFzIG5lZWRlZC5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNQZW5kaW5nTWVzc2FnZXMoc2Vzc2lvblJlc291cmNlOiBVUkksIGJhY2tlbmRTZXNzaW9uOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFjaGF0TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX2dldENoYXRVUkkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBwZW5kaW5nID0gY2hhdE1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGNvbnN0IHByb3RvY29sU3RhdGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbiwgY2hhdFVSSSk7XG5cdFx0Y29uc3QgcHJldlN0ZWVyaW5nID0gcHJvdG9jb2xTdGF0ZT8uc3RlZXJpbmdNZXNzYWdlO1xuXHRcdGNvbnN0IHByZXZRdWV1ZWQgPSBwcm90b2NvbFN0YXRlPy5xdWV1ZWRNZXNzYWdlcyA/PyBbXTtcblxuXHRcdC8vIENvbXB1dGUgY3VycmVudCBzdGF0ZSBmcm9tIGNoYXQgbW9kZWxcblx0XHRpbnRlcmZhY2UgSVBlbmRpbmdTbmFwc2hvdCB7IGlkOiBzdHJpbmc7IG1lc3NhZ2U6IE1lc3NhZ2UgfVxuXHRcdGxldCBjdXJyZW50U3RlZXJpbmc6IElQZW5kaW5nU25hcHNob3QgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3VycmVudFF1ZXVlZDogSVBlbmRpbmdTbmFwc2hvdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwIG9mIHBlbmRpbmcpIHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlcyA9IHAucmVxdWVzdC52YXJpYWJsZURhdGE/LnZhcmlhYmxlcyA/PyBbXTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VBdHRhY2htZW50cyA9IHRoaXMuX3ZhcmlhYmxlRW50cmllc1RvQXR0YWNobWVudHModmFyaWFibGVzLCBzZXNzaW9uUmVzb3VyY2UsIHAucmVxdWVzdC5tZXNzYWdlLnRleHQpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudHMgPSBtZXNzYWdlQXR0YWNobWVudHMubGVuZ3RoID4gMCA/IG1lc3NhZ2VBdHRhY2htZW50cyA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNuYXBzaG90OiBJUGVuZGluZ1NuYXBzaG90ID0geyBpZDogcC5yZXF1ZXN0LmlkLCBtZXNzYWdlOiB1c2VyT3JpZ2luTWVzc2FnZShwLnJlcXVlc3QubWVzc2FnZS50ZXh0LCBhdHRhY2htZW50cykgfTtcblx0XHRcdGlmIChwLmtpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHRcdGN1cnJlbnRTdGVlcmluZyA9IHNuYXBzaG90O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3VycmVudFF1ZXVlZC5wdXNoKHNuYXBzaG90KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAtLS0gU3RlZXJpbmcgLS0tXG5cdFx0aWYgKGN1cnJlbnRTdGVlcmluZykge1xuXHRcdFx0aWYgKGN1cnJlbnRTdGVlcmluZy5pZCAhPT0gcHJldlN0ZWVyaW5nPy5pZCB8fCAhZXF1YWxzKGN1cnJlbnRTdGVlcmluZy5tZXNzYWdlLCBwcmV2U3RlZXJpbmcubWVzc2FnZSkpIHtcblx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb24oYmFja2VuZFNlc3Npb24sIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCxcblx0XHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRcdFx0aWQ6IGN1cnJlbnRTdGVlcmluZy5pZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBjdXJyZW50U3RlZXJpbmcubWVzc2FnZSxcblx0XHRcdFx0fSwgY2hhdFVSSSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChwcmV2U3RlZXJpbmcpIHtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogcHJldlN0ZWVyaW5nLmlkLFxuXHRcdFx0fSwgY2hhdFVSSSk7XG5cdFx0fVxuXG5cdFx0Ly8gLS0tIFF1ZXVlZDogcmVtb3ZhbHMgLS0tXG5cdFx0Y29uc3QgY3VycmVudFF1ZXVlZElkcyA9IG5ldyBTZXQoY3VycmVudFF1ZXVlZC5tYXAocSA9PiBxLmlkKSk7XG5cdFx0Zm9yIChjb25zdCBwcmV2IG9mIHByZXZRdWV1ZWQpIHtcblx0XHRcdGlmICghY3VycmVudFF1ZXVlZElkcy5oYXMocHJldi5pZCkpIHtcblx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb24oYmFja2VuZFNlc3Npb24sIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQsXG5cdFx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0XHRpZDogcHJldi5pZCxcblx0XHRcdFx0fSwgY2hhdFVSSSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gLS0tIFF1ZXVlZDogYWRkaXRpb25zIC0tLVxuXHRcdGNvbnN0IHByZXZRdWV1ZWRCeUlkID0gbmV3IE1hcChwcmV2UXVldWVkLm1hcChxID0+IFtxLmlkLCBxXSkpO1xuXHRcdGZvciAoY29uc3QgcSBvZiBjdXJyZW50UXVldWVkKSB7XG5cdFx0XHRjb25zdCBwcmV2ID0gcHJldlF1ZXVlZEJ5SWQuZ2V0KHEuaWQpO1xuXHRcdFx0aWYgKCFwcmV2IHx8ICFlcXVhbHMocS5tZXNzYWdlLCBwcmV2Lm1lc3NhZ2UpKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQsXG5cdFx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0XHRpZDogcS5pZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBxLm1lc3NhZ2UsXG5cdFx0XHRcdH0sIGNoYXRVUkkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIC0tLSBRdWV1ZWQ6IHJlb3JkZXJpbmcgLS0tXG5cdFx0Ly8gQWZ0ZXIgYWRkaXRpb25zL3JlbW92YWxzLCBjaGVjayBpZiB0aGUgcmVtYWluaW5nIGNvbW1vbiBpdGVtcyBjaGFuZ2VkIG9yZGVyLlxuXHRcdC8vIFJlLXJlYWQgcHJvdG9jb2wgc3RhdGUgc2luY2UgZGlzcGF0Y2hlcyBhYm92ZSBtYXkgaGF2ZSBtdXRhdGVkIGl0LlxuXHRcdGNvbnN0IHVwZGF0ZWRQcm90b2NvbCA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShzZXNzaW9uLCBjaGF0VVJJKTtcblx0XHRjb25zdCB1cGRhdGVkUXVldWVkID0gdXBkYXRlZFByb3RvY29sPy5xdWV1ZWRNZXNzYWdlcyA/PyBbXTtcblx0XHRpZiAodXBkYXRlZFF1ZXVlZC5sZW5ndGggPiAxICYmIGN1cnJlbnRRdWV1ZWQubGVuZ3RoID09PSB1cGRhdGVkUXVldWVkLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbmVlZHNSZW9yZGVyID0gY3VycmVudFF1ZXVlZC5zb21lKChxLCBpKSA9PiBxLmlkICE9PSB1cGRhdGVkUXVldWVkW2ldLmlkKTtcblx0XHRcdGlmIChuZWVkc1Jlb3JkZXIpIHtcblx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb24oYmFja2VuZFNlc3Npb24sIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRRdWV1ZWRNZXNzYWdlc1Jlb3JkZXJlZCxcblx0XHRcdFx0XHRvcmRlcjogY3VycmVudFF1ZXVlZC5tYXAocSA9PiBxLmlkKSxcblx0XHRcdFx0fSwgY2hhdFVSSSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFByb2plY3RzIHByb3RvY29sIHBlbmRpbmcgbWVzc2FnZXMgaW50byB0aGUgY2hhdCBtb2RlbC5cblx0ICogVGhlIHByb3RvY29sIGlzIGF1dGhvcml0YXRpdmUsIHNvIG1hdGNoaW5nIGxvY2FsIHN0YXRlIGlzIGEgbm8tb3AuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseVJlbW90ZVBlbmRpbmdNZXNzYWdlcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgYmFja2VuZFNlc3Npb246IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9jaGF0VVJJc0J5U2Vzc2lvblJlc291cmNlLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghY2hhdFVSSSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCBjaGF0VVJJKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9SZW1vdGUgPSAocGVuZGluZzogUGVuZGluZ01lc3NhZ2UsIGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kKTogSVJlbW90ZVBlbmRpbmdSZXF1ZXN0ID0+ICh7XG5cdFx0XHRpZDogcGVuZGluZy5pZCxcblx0XHRcdGtpbmQsXG5cdFx0XHRtZXNzYWdlOiBwZW5kaW5nLm1lc3NhZ2UudGV4dCxcblx0XHRcdHZhcmlhYmxlRGF0YTogbWVzc2FnZVRvVmFyaWFibGVEYXRhKHBlbmRpbmcubWVzc2FnZSwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVtb3RlOiBJUmVtb3RlUGVuZGluZ1JlcXVlc3RbXSA9IFtdO1xuXHRcdGlmIChzdGF0ZS5zdGVlcmluZ01lc3NhZ2UpIHtcblx0XHRcdHJlbW90ZS5wdXNoKHRvUmVtb3RlKHN0YXRlLnN0ZWVyaW5nTWVzc2FnZSwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBxdWV1ZWQgb2Ygc3RhdGUucXVldWVkTWVzc2FnZXMgPz8gW10pIHtcblx0XHRcdHJlbW90ZS5wdXNoKHRvUmVtb3RlKHF1ZXVlZCwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhdFNlcnZpY2Uuc3luY1BlbmRpbmdSZXF1ZXN0c0Zyb21SZW1vdGUoc2Vzc2lvblJlc291cmNlLCByZW1vdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcGF0Y2hBY3Rpb24oY2hhbm5lbDogVVJJLCBhY3Rpb246IENsaWVudFNlc3Npb25BY3Rpb24gfCBDbGllbnRDaGF0QWN0aW9uLCBjaGF0VVJJPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gaXNDaGF0QWN0aW9uKGFjdGlvbilcblx0XHRcdD8gdGhpcy5fcmVxdWlyZUNoYXRVUkkoY2hhdFVSSSwgYWN0aW9uLnR5cGUpXG5cdFx0XHQ6IGNoYW5uZWwudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaCh0YXJnZXQsIGFjdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF9yZXF1aXJlQ2hhdFVSSShjaGF0VVJJOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFjdGlvblR5cGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKCFjaGF0VVJJKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBkaXNwYXRjaCAke2FjdGlvblR5cGV9IHdpdGhvdXQgYSByZXNvbHZlZCBBSFAgY2hhdCBjaGFubmVsYCk7XG5cdFx0fVxuXHRcdHJldHVybiBjaGF0VVJJO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUNoYXRVcmlGcm9tU3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkksIHN0YXRlOiBTZXNzaW9uU3RhdGUpOiBzdHJpbmcge1xuXHRcdGlmIChzZXNzaW9uUmVzb3VyY2UuZnJhZ21lbnQpIHtcblx0XHRcdGNvbnN0IG1hdGNoID0gc3RhdGUuY2hhdHMuZmluZChzdW1tYXJ5ID0+IHBhcnNlQ2hhdFVyaShzdW1tYXJ5LnJlc291cmNlKT8uY2hhdElkID09PSBzZXNzaW9uUmVzb3VyY2UuZnJhZ21lbnQpO1xuXHRcdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIGNoYXQgJyR7c2Vzc2lvblJlc291cmNlLmZyYWdtZW50fScgZnJvbSBzZXNzaW9uIHN0YXRlIGZvciAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hdGNoLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlmICghc3RhdGUuZGVmYXVsdENoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBoYXMgbm8gZGVmYXVsdCBjaGF0YCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZS5kZWZhdWx0Q2hhdC50b1N0cmluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q2hhdFVSSShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY2hhdFVSSTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZS5zZXQoc2Vzc2lvblJlc291cmNlLCBjaGF0VVJJKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoYXRVUkkoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9jaGF0VVJJc0J5U2Vzc2lvblJlc291cmNlLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghY2hhdFVSSSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBBSFAgY2hhdCBVUkkgbWFwcGVkIGZvciAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hhdFVSSTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1cnJlbnRBY3RpdmVDbGllbnQoKTogU2Vzc2lvbkFjdGl2ZUNsaWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUNsaWVudFNlcnZpY2UuZ2V0QWN0aXZlQ2xpZW50KHRoaXMuX2NvbmZpZy5zZXNzaW9uVHlwZSwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY2xpZW50SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQWN0aXZlQ2xpZW50Rm9yTWVzc2FnZShiYWNrZW5kU2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0Q3VycmVudEFjdGl2ZUNsaWVudCgpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gc3RhdGU/LmFjdGl2ZUNsaWVudHMuZmluZChjID0+IGMuY2xpZW50SWQgPT09IGFjdGl2ZUNsaWVudC5jbGllbnRJZCk7XG5cdFx0aWYgKGVxdWFscyhleGlzdGluZywgYWN0aXZlQ2xpZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihiYWNrZW5kU2Vzc2lvbiwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0YWN0aXZlQ2xpZW50LFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoZXMgYHNlc3Npb24vYWN0aXZlQ2xpZW50U2V0YCB0byBhZGQgdGhpcyBjb25uZWN0aW9uIGFzIGFuXG5cdCAqIGFjdGl2ZSBjbGllbnQgZm9yIHRoaXMgc2Vzc2lvbiBhbmQgcHVibGlzaCB0aGUgY3VycmVudCBjdXN0b21pemF0aW9uc1xuXHQgKiBhbmQgY2xpZW50LXByb3ZpZGVkIHRvb2xzLiBUaGlzIGNsaWVudCBuZXZlciByZW1vdmVzIGl0c2VsZi5cblx0ICovXG5cdHByaXZhdGUgX2Rpc3BhdGNoQWN0aXZlQ2xpZW50KGJhY2tlbmRTZXNzaW9uOiBVUkksIGN1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fZ2V0Q3VycmVudEFjdGl2ZUNsaWVudCgpO1xuXHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHsgLi4uY3VycmVudCwgY3VzdG9taXphdGlvbnMgfSxcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLS0gU2VydmVyLWluaXRpYXRlZCB0dXJuIGRldGVjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogU2V0cyB1cCBhIHBlcnNpc3RlbnQgbGlzdGVuZXIgb24gdGhlIHNlc3Npb24ncyBwcm90b2NvbCBzdGF0ZSB0aGF0XG5cdCAqIGRldGVjdHMgc2VydmVyLWluaXRpYXRlZCB0dXJucyAoZS5nLiBhdXRvLWNvbnN1bWVkIHF1ZXVlZCBtZXNzYWdlcykuXG5cdCAqIFdoZW4gYSBuZXcgYGFjdGl2ZVR1cm5gIGFwcGVhcnMgd2hvc2UgYHR1cm5JZGAgd2FzIE5PVCBkaXNwYXRjaGVkIGJ5XG5cdCAqIHRoaXMgY2xpZW50LCBpdCBzaWduYWxzIHRoZSB7QGxpbmsgQWdlbnRIb3N0Q2hhdFNlc3Npb259IHRvIGNyZWF0ZSBhXG5cdCAqIG5ldyByZXF1ZXN0IGluIHRoZSBjaGF0IG1vZGVsLCByZW1vdmVzIHRoZSBjb25zdW1lZCBwZW5kaW5nIHJlcXVlc3Rcblx0ICogaWYgYXBwbGljYWJsZSwgYW5kIHBpcGVzIHR1cm4gcHJvZ3Jlc3MgdGhyb3VnaCBgcHJvZ3Jlc3NPYnNgLlxuXHQgKi9cblx0cHJpdmF0ZSBfd2F0Y2hGb3JTZXJ2ZXJJbml0aWF0ZWRUdXJucyhiYWNrZW5kU2Vzc2lvbjogVVJJLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9nZXRDaGF0VVJJKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fd2F0Y2hGb3JNY3BBdXRoZW50aWNhdGlvbihiYWNrZW5kU2Vzc2lvbiwgc2Vzc2lvblJlc291cmNlLCBjaGF0VVJJKTtcblxuXHRcdC8vIFNlZWQgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBzbyB3ZSBkb24ndCB0cmVhdCBhbnkgcHJlLWV4aXN0aW5nIGFjdGl2ZVxuXHRcdC8vIHR1cm4gKGUuZy4gb25lIGJlaW5nIGhhbmRsZWQgYnkgX3JlY29ubmVjdFRvQWN0aXZlVHVybikgYXMgbmV3LlxuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyLCBjaGF0VVJJKTtcblx0XHRsZXQgbGFzdFNlZW5UdXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGN1cnJlbnRTdGF0ZT8uYWN0aXZlVHVybj8uaWQ7XG5cdFx0bGV0IHByZXZpb3VzUXVldWVkSWRzOiBTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJldmlvdXNTdGVlcmluZ0lkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBjdXJyZW50U3RhdGU/LnN0ZWVyaW5nTWVzc2FnZT8uaWQ7XG5cdFx0bGV0IHByZXZpb3VzVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGN1cnJlbnRTdGF0ZT8udGl0bGU7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIE11dGFibGVEaXNwb3NhYmxlIGZvciBwZXItdHVybiBwcm9ncmVzcyB0cmFja2luZyAocmVwbGFjZWQgZWFjaCB0dXJuKVxuXHRcdGNvbnN0IHR1cm5Qcm9ncmVzc0Rpc3Bvc2FibGUgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0dXJuUHJvZ3Jlc3NEaXNwb3NhYmxlKTtcblxuXHRcdGNvbnN0IHNlc3Npb25TdWIgPSB0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHNlc3Npb25TdHIpO1xuXHRcdGNvbnN0IGNoYXRTdWIgPSB0aGlzLl9lbnN1cmVDaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25TdHIsIGNoYXRVUkkpO1xuXHRcdC8vIENvbnZlcnNhdGlvbiBjb250ZW50cyBub3cgbGl2ZSBvbiB0aGUgZGVmYXVsdCBjaGF0LCB3aGlsZSB0aXRsZSBhbmRcblx0XHQvLyBvdGhlciBzZXNzaW9uLXNjb3BlZCBmaWVsZHMgc3RheSBvbiB0aGUgc2Vzc2lvbi4gUmUtZXZhbHVhdGUgb24gYVxuXHRcdC8vIGNoYW5nZSB0byBlaXRoZXIgY2hhbm5lbCwgcmVhZGluZyB0aGUgbWVyZ2VkIHZpZXcuXG5cdFx0Y29uc3Qgb25DaGFuZ2UgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyLCBjaGF0VVJJKTtcblx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZSA9IHsgc2Vzc2lvbjogc2Vzc2lvblN0ciwgc3RhdGUgfTtcblxuXHRcdFx0Ly8gVHJhY2sgcXVldWVkIG1lc3NhZ2UgSURzIHNvIHdlIGNhbiBkZXRlY3Qgd2hpY2ggb25lIHdhcyBjb25zdW1lZFxuXHRcdFx0Y29uc3QgY3VycmVudFF1ZXVlZElkcyA9IG5ldyBTZXQoKGUuc3RhdGUucXVldWVkTWVzc2FnZXMgPz8gW10pLm1hcChtID0+IG0uaWQpKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTdGVlcmluZ0lkID0gZS5zdGF0ZS5zdGVlcmluZ01lc3NhZ2U/LmlkO1xuXG5cdFx0XHQvLyBEZXRlY3Qgc3RlZXJpbmcgbWVzc2FnZSByZW1vdmFsIG9yIHJlcGxhY2VtZW50IHJlZ2FyZGxlc3Mgb2YgdHVybiBjaGFuZ2VzXG5cdFx0XHRpZiAocHJldmlvdXNTdGVlcmluZ0lkICYmIHByZXZpb3VzU3RlZXJpbmdJZCAhPT0gY3VycmVudFN0ZWVyaW5nSWQpIHtcblx0XHRcdFx0dGhpcy5fY2hhdFNlcnZpY2UucmVtb3ZlUGVuZGluZ1JlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCBwcmV2aW91c1N0ZWVyaW5nSWQpO1xuXHRcdFx0fVxuXHRcdFx0cHJldmlvdXNTdGVlcmluZ0lkID0gY3VycmVudFN0ZWVyaW5nSWQ7XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRUaXRsZSA9IGUuc3RhdGUudGl0bGU7XG5cdFx0XHRpZiAoY3VycmVudFRpdGxlICYmIGN1cnJlbnRUaXRsZSAhPT0gcHJldmlvdXNUaXRsZSkge1xuXHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZS5zZXRDaGF0U2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZSwgY3VycmVudFRpdGxlKTtcblx0XHRcdH1cblx0XHRcdHByZXZpb3VzVGl0bGUgPSBjdXJyZW50VGl0bGU7XG5cblx0XHRcdGNvbnN0IGFjdGl2ZVR1cm4gPSBlLnN0YXRlLmFjdGl2ZVR1cm47XG5cdFx0XHRpZiAoIWFjdGl2ZVR1cm4gfHwgYWN0aXZlVHVybi5pZCA9PT0gbGFzdFNlZW5UdXJuSWQpIHtcblx0XHRcdFx0cHJldmlvdXNRdWV1ZWRJZHMgPSBjdXJyZW50UXVldWVkSWRzO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsYXN0U2VlblR1cm5JZCA9IGFjdGl2ZVR1cm4uaWQ7XG5cblx0XHRcdC8vIElmIHdlIGRpc3BhdGNoZWQgdGhpcyB0dXJuLCB0aGUgZXhpc3RpbmcgX2hhbmRsZVR1cm4gZmxvdyBoYW5kbGVzIGl0XG5cdFx0XHRpZiAodGhpcy5fY2xpZW50RGlzcGF0Y2hlZFR1cm5JZHMuaGFzKGFjdGl2ZVR1cm4uaWQpKSB7XG5cdFx0XHRcdHByZXZpb3VzUXVldWVkSWRzID0gY3VycmVudFF1ZXVlZElkcztcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGF0U2Vzc2lvbiA9IHRoaXMuX2FjdGl2ZVNlc3Npb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFjaGF0U2Vzc2lvbikge1xuXHRcdFx0XHRwcmV2aW91c1F1ZXVlZElkcyA9IGN1cnJlbnRRdWV1ZWRJZHM7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0XSBTZXJ2ZXItaW5pdGlhdGVkIHR1cm4gZGV0ZWN0ZWQ6ICR7YWN0aXZlVHVybi5pZH1gKTtcblxuXHRcdFx0Ly8gRGV0ZXJtaW5lIHdoaWNoIHF1ZXVlZCBtZXNzYWdlIHdhcyBjb25zdW1lZCBieSBkaWZmaW5nIHF1ZXVlIHN0YXRlXG5cdFx0XHRpZiAocHJldmlvdXNRdWV1ZWRJZHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBwcmV2SWQgb2YgcHJldmlvdXNRdWV1ZWRJZHMpIHtcblx0XHRcdFx0XHRpZiAoIWN1cnJlbnRRdWV1ZWRJZHMuaGFzKHByZXZJZCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLnJlbW92ZVBlbmRpbmdSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgcHJldklkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHByZXZpb3VzUXVldWVkSWRzID0gY3VycmVudFF1ZXVlZElkcztcblxuXHRcdFx0Ly8gU2lnbmFsIHRoZSBzZXNzaW9uIHRvIGNyZWF0ZSBhIG5ldyByZXF1ZXN0K3Jlc3BvbnNlIHBhaXJcblx0XHRcdGNoYXRTZXNzaW9uLnN0YXJ0U2VydmVyUmVxdWVzdChcblx0XHRcdFx0YWN0aXZlVHVybi5pZCxcblx0XHRcdFx0YWN0aXZlVHVybi5tZXNzYWdlLnRleHQsXG5cdFx0XHRcdG1lc3NhZ2VUb1ZhcmlhYmxlRGF0YShhY3RpdmVUdXJuLm1lc3NhZ2UsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiBhY3RpdmVUdXJuLm1lc3NhZ2Uub3JpZ2luLmtpbmQgPT09IE1lc3NhZ2VLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHR0aW1lc3RhbXA6IHBhcnNlVGltZXN0YW1wKGFjdGl2ZVR1cm4uc3RhcnRlZEF0KSxcblx0XHRcdFx0XHRpc1Rlcm1pbmFsUmVxdWVzdDogaXNUZXJtaW5hbENvbW1hbmRQcm9tcHQoYWN0aXZlVHVybi5tZXNzYWdlLnRleHQsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmluaXRpYWxpemVSZXN1bHQuZ2V0KCk/LnRlcm1pbmFsQ29tbWFuZFByZWZpeCksXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTZXQgdXAgdHVybiBwcm9ncmVzcyB0cmFja2luZyBcdTIwMTQgcmV1c2UgdGhlIHNhbWUgc3RhdGUtdG8tcHJvZ3Jlc3Ncblx0XHRcdC8vIHRyYW5zbGF0aW9uIGFzIF9oYW5kbGVUdXJuLCBidXQgcGlwZSBvdXRwdXQgdG8gcHJvZ3Jlc3NPYnMvaXNDb21wbGV0ZU9ic1xuXHRcdFx0Y29uc3QgdHVyblN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dHVyblByb2dyZXNzRGlzcG9zYWJsZS52YWx1ZSA9IHR1cm5TdG9yZTtcblx0XHRcdHRoaXMuX3RyYWNrU2VydmVyVHVyblByb2dyZXNzKGJhY2tlbmRTZXNzaW9uLCBhY3RpdmVUdXJuLmlkLCBjaGF0U2Vzc2lvbiwgdHVyblN0b3JlKTtcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uU3ViLm9uRGlkQ2hhbmdlKG9uQ2hhbmdlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNoYXRTdWIub25EaWRDaGFuZ2Uob25DaGFuZ2UpKTtcblxuXHRcdHRoaXMuX3NlcnZlclR1cm5XYXRjaGVycy5zZXQoc2Vzc2lvblJlc291cmNlLCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwcml2YXRlIF93YXRjaEZvck1jcEF1dGhlbnRpY2F0aW9uKGJhY2tlbmRTZXNzaW9uOiBVUkksIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjaGF0VVJJOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uU3ViID0gdGhpcy5fZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbihiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRsZXQgcHJldmlvdXNTZXJ2ZXJzOiByZWFkb25seSBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXJbXSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZWNvbmNpbGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzID0gZ2V0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcnMoc2Vzc2lvblJlc291cmNlLCB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVSSSkpO1xuXHRcdFx0aWYgKGVxdWFscyhwcmV2aW91c1NlcnZlcnMsIHNlcnZlcnMpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHByZXZpb3VzU2VydmVycyA9IHNlcnZlcnM7XG5cdFx0XHR2b2lkIHRoaXMuX2ZpbHRlckF1dG9HcmFudGVkTWNwQXV0aGVudGljYXRpb24oc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXJzKTtcblx0XHR9O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uU3ViLm9uRGlkQ2hhbmdlKHJlY29uY2lsZSkpO1xuXHRcdHJlY29uY2lsZSgpO1xuXHRcdHRoaXMuX21jcEF1dGhXYXRjaGVycy5zZXQoc2Vzc2lvblJlc291cmNlLCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhY2tzIHByb3RvY29sIHN0YXRlIGNoYW5nZXMgZm9yIGEgc3BlY2lmaWMgc2VydmVyLWluaXRpYXRlZCB0dXJuIGFuZFxuXHQgKiBwdXNoZXMgYElDaGF0UHJvZ3Jlc3NbXWAgaXRlbXMgaW50byB0aGUgc2Vzc2lvbidzIGBwcm9ncmVzc09ic2AuXG5cdCAqIFdoZW4gdGhlIHR1cm4gZmluaXNoZXMsIHNldHMgYGlzQ29tcGxldGVPYnNgIHRvIHRydWUuXG5cdCAqL1xuXHRwcml2YXRlIF90cmFja1NlcnZlclR1cm5Qcm9ncmVzcyhcblx0XHRiYWNrZW5kU2Vzc2lvbjogVVJJLFxuXHRcdHR1cm5JZDogc3RyaW5nLFxuXHRcdGNoYXRTZXNzaW9uOiBBZ2VudEhvc3RDaGF0U2Vzc2lvbixcblx0XHR0dXJuRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dHVybkRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHR0dXJuRGlzcG9zYWJsZXMuYWRkKHRoaXMuX29ic2VydmVUdXJuKHtcblx0XHRcdGJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBjaGF0U2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjaGF0VVJJOiB0aGlzLl9nZXRDaGF0VVJJKGNoYXRTZXNzaW9uLnNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRzaW5rOiBwYXJ0cyA9PiBjaGF0U2Vzc2lvbi5hcHBlbmRQcm9ncmVzcyhwYXJ0cyksXG5cdFx0XHRjYW5jZWxsYXRpb25Ub2tlbjogY3RzLnRva2VuLFxuXHRcdFx0b25UdXJuRW5kZWQ6ICgpID0+IGNoYXRTZXNzaW9uLmlzQ29tcGxldGVPYnMuc2V0KHRydWUsIHVuZGVmaW5lZCksXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHVyblN0b3BXYXRjaEtleShjaGF0VVJJOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7Y2hhdFVSSX1cXDAke3R1cm5JZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlVHVyblN0b3BXYXRjaChjaGF0VVJJOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogU3RvcFdhdGNoIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl90dXJuU3RvcFdhdGNoS2V5KGNoYXRVUkksIHR1cm5JZCk7XG5cdFx0bGV0IHN0b3BXYXRjaCA9IHRoaXMuX3R1cm5TdG9wV2F0Y2hlcy5nZXQoa2V5KTtcblx0XHRpZiAoIXN0b3BXYXRjaCkge1xuXHRcdFx0c3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdFx0XHR0aGlzLl90dXJuU3RvcFdhdGNoZXMuc2V0KGtleSwgc3RvcFdhdGNoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0b3BXYXRjaDtcblx0fVxuXG5cdHByaXZhdGUgX3R1cm5EdXJhdGlvbihjaGF0VVJJOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRjb25zdCBlbGFwc2VkID0gdGhpcy5fdHVyblN0b3BXYXRjaGVzLmdldCh0aGlzLl90dXJuU3RvcFdhdGNoS2V5KGNoYXRVUkksIHR1cm5JZCkpPy5lbGFwc2VkKCk7XG5cdFx0cmV0dXJuIHR5cGVvZiBlbGFwc2VkID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZCkgPyBNYXRoLm1heCgwLCBlbGFwc2VkKSA6IDA7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhclR1cm5TdG9wV2F0Y2goY2hhdFVSSTogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3R1cm5TdG9wV2F0Y2hlcy5kZWxldGUodGhpcy5fdHVyblN0b3BXYXRjaEtleShjaGF0VVJJLCB0dXJuSWQpKTtcblx0fVxuXG5cdC8vIC0tLS0gVHVybiBoYW5kbGluZyAoc3RhdGUtZHJpdmVuKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVUdXJuKFxuXHRcdHNlc3Npb246IFVSSSxcblx0XHRyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCxcblx0XHRwcm9ncmVzczogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsXG5cdFx0Y2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdG9uRmFpbHVyZVN0YWdlOiAoc3RhZ2U6IEFnZW50SG9zdEludm9jYXRpb25GYWlsdXJlU3RhZ2UpID0+IHZvaWQsXG5cdCk6IFByb21pc2U8VHVybiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG9uRmFpbHVyZVN0YWdlKCdwcmVwYXJlVHVybicpO1xuXHRcdGNvbnN0IHR1cm5JZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuXHRcdHRoaXMuX2NsaWVudERpc3BhdGNoZWRUdXJuSWRzLmFkZCh0dXJuSWQpO1xuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9nZXRDaGF0VVJJKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCB0dXJuQ2hhbm5lbCA9IGNoYXRVUkk7XG5cdFx0Y29uc3QgbWVzc2FnZUF0dGFjaG1lbnRzID0gYXdhaXQgdGhpcy5fY29udmVydFZhcmlhYmxlc1RvQXR0YWNobWVudHMocmVxdWVzdCk7XG5cdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRoaXMgY29ubmVjdGlvbiBhcyBhbiBhY3RpdmUgY2xpZW50IGZvciB0aGUgc2Vzc2lvbiBiZWZvcmUgdGhlXG5cdFx0Ly8gdHVybiBnb2VzIG91dC4gV2Ugb25seSBkbyB0aGlzIG9uIHR1cm4gc3RhcnQgKG5vdCBvbiBzZXNzaW9uIG9wZW4pXG5cdFx0Ly8gc28gdGhhdCBvcGVuaW5nIGEgc2Vzc2lvbiBkb2Vzbid0IGVhZ2VybHkgcmVnaXN0ZXIgdGhpcyBjbGllbnQgd2hpbGVcblx0XHQvLyBhbm90aGVyIGNsaWVudCBpcyBpbiB0aGUgbWlkZGxlIG9mIGEgdHVybi5cblx0XHR0aGlzLl9lbnN1cmVBY3RpdmVDbGllbnRGb3JNZXNzYWdlKHNlc3Npb24pO1xuXG5cdFx0Ly8gTW9kZWwgYW5kIGFnZW50IHNlbGVjdGlvbiBub3cgdHJhdmVsIG9uIHRoZSB0dXJuIG1lc3NhZ2UgaXRzZWxmIHJhdGhlclxuXHRcdC8vIHRoYW4gdmlhIHRoZSByZW1vdmVkIGBzZXNzaW9uL21vZGVsQ2hhbmdlZGAgLyBgc2Vzc2lvbi9hZ2VudENoYW5nZWRgXG5cdFx0Ly8gYWN0aW9ucy4gVGhlIGhvc3QgYXBwbGllcyB0aGUgc2VsZWN0aW9uIGNhcnJpZWQgYnkgdGhlIG1lc3NhZ2UgYmVmb3JlXG5cdFx0Ly8gc2VuZGluZyB0aGUgdHVybiB0byB0aGUgYWdlbnQgYmFja2VuZC5cblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsID0gdGhpcy5fY3JlYXRlTW9kZWxTZWxlY3Rpb24ocmVxdWVzdC51c2VyU2VsZWN0ZWRNb2RlbElkLCByZXF1ZXN0Lm1vZGVsQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgcmVxdWVzdGVkQWdlbnRVcmkgPSByZXF1ZXN0Lm1vZGVJbnN0cnVjdGlvbnM/LnVyaT8udG9TdHJpbmcoKTtcblxuXHRcdC8vIElmIHRoZSBjaGF0IG1vZGVsIGhhcyBmZXdlciBwcmV2aW91cyByZXF1ZXN0cyB0aGFuIHRoZSBwcm90b2NvbCBoYXNcblx0XHQvLyB0dXJucywgYSBjaGVja3BvaW50IHdhcyByZXN0b3JlZCBvciBhIG1lc3NhZ2Ugd2FzIGVkaXRlZC4gRGlzcGF0Y2hcblx0XHQvLyBzZXNzaW9uL3RydW5jYXRlZCBzbyB0aGUgc2VydmVyIGRyb3BzIHRoZSBzdGFsZSB0YWlsLlxuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHByb3RvY29sU3RhdGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0VVJJKTtcblx0XHRpZiAoY2hhdE1vZGVsICYmIHByb3RvY29sU3RhdGU/LnR1cm5zLmxlbmd0aCkge1xuXHRcdFx0Ly8gLTIgc2luY2UgLTEgd2lsbCBhbHJlYWR5IGJlIHRoZSBjdXJyZW50IHJlcXVlc3Rcblx0XHRcdGNvbnN0IHByZXZpb3VzUmVxdWVzdEluZGV4ID0gY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuZmluZEluZGV4KGkgPT4gaS5pZCA9PT0gcmVxdWVzdC5yZXF1ZXN0SWQpIC0gMTtcblx0XHRcdGNvbnN0IHByZXZpb3VzUmVxdWVzdCA9IHByZXZpb3VzUmVxdWVzdEluZGV4ID49IDAgPyBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKVtwcmV2aW91c1JlcXVlc3RJbmRleF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXByZXZpb3VzUmVxdWVzdCAmJiBwcm90b2NvbFN0YXRlLnR1cm5zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgdHJ1bmNhdGVBY3Rpb246IENoYXRUcnVuY2F0ZWRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaCh0dXJuQ2hhbm5lbCwgdHJ1bmNhdGVBY3Rpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2VlbkF0SW5kZXggPSBwcm90b2NvbFN0YXRlLnR1cm5zLmZpbmRJbmRleCh0ID0+IHQuaWQgPT09IHByZXZpb3VzUmVxdWVzdCEuaWQpO1xuXHRcdFx0XHRpZiAoc2VlbkF0SW5kZXggIT09IC0xICYmIHNlZW5BdEluZGV4IDwgcHJvdG9jb2xTdGF0ZS50dXJucy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHJ1bmNhdGVBY3Rpb246IENoYXRUcnVuY2F0ZWRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQsXG5cdFx0XHRcdFx0XHR0dXJuSWQ6IHByZXZpb3VzUmVxdWVzdCEuaWQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaCh0dXJuQ2hhbm5lbCwgdHJ1bmNhdGVBY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VzdG9taXphdGlvblNlcnZpY2UucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIERpc3BhdGNoIHNlc3Npb24vdHVyblN0YXJ0ZWQgXHUyMDE0IHRoZSBzZXJ2ZXIgd2lsbCBjYWxsIHNlbmRNZXNzYWdlIG9uXG5cdFx0Ly8gdGhlIHByb3ZpZGVyIGFzIGEgc2lkZSBlZmZlY3QuXG5cdFx0Y29uc3QgdHVybkFjdGlvbjogQ2hhdFR1cm5TdGFydGVkQWN0aW9uID0ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0Li4udXNlck9yaWdpbk1lc3NhZ2UocmVxdWVzdC5tZXNzYWdlLCBtZXNzYWdlQXR0YWNobWVudHMpLFxuXHRcdFx0XHQuLi4oc2VsZWN0ZWRNb2RlbCA/IHsgbW9kZWw6IHNlbGVjdGVkTW9kZWwgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHJlcXVlc3RlZEFnZW50VXJpID8geyBhZ2VudDogeyB1cmk6IHJlcXVlc3RlZEFnZW50VXJpIH0gfSA6IHt9KSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0aGlzLl9lbnN1cmVUdXJuU3RvcFdhdGNoKHR1cm5DaGFubmVsLCB0dXJuSWQpO1xuXHRcdG9uRmFpbHVyZVN0YWdlKCdkaXNwYXRjaFR1cm4nKTtcblx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaCh0dXJuQ2hhbm5lbCwgdHVybkFjdGlvbik7XG5cblx0XHQvLyBFbnN1cmUgdGhlIHNuYXBzaG90IGNvbnRyb2xsZXIgcmVjb3JkcyBhIHNlbnRpbmVsIGNoZWNrcG9pbnQgZm9yIHRoaXNcblx0XHQvLyByZXF1ZXN0IHNvIGl0IGFwcGVhcnMgaW4gcmVxdWVzdERpc2FibGVtZW50IGV2ZW4gaWYgdGhlIHR1cm5cblx0XHQvLyBwcm9kdWNlcyBubyBmaWxlIGVkaXRzLlxuXHRcdHRoaXMuX2Vuc3VyZVNuYXBzaG90Q29udHJvbGxlcihyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSlcblx0XHRcdD8uZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIHR1cm4gdG8gcmVhY2ggYSB0ZXJtaW5hbCBzdGF0ZS4gVGhlIG9ic2VydmFibGUgZ3JhcGhcblx0XHQvLyBpbnN0YWxsZWQgYmVsb3cgZHJpdmVzIGFsbCBwcm9ncmVzcyBlbWlzc2lvbiB2aWEgdGhlIGBwcm9ncmVzc2Bcblx0XHQvLyBzaW5rIGFuZCByZXNvbHZlcyB0aGUgcHJvbWlzZSBmcm9tIGBvblR1cm5FbmRlZGAuIENhbmNlbGxhdGlvbiBpc1xuXHRcdC8vIHN1cmZhY2VkIHRocm91Z2ggdGhlIHNhbWUgcGF0aDogdGhlIG9ic2VydmVyIGRpc3Bvc2VzIGl0c2VsZiB3aGVuXG5cdFx0Ly8gYGNhbmNlbGxhdGlvblRva2VuYCBmaXJlcywgdGhlbiBjYWxscyBgb25UdXJuRW5kZWQodW5kZWZpbmVkKWAuXG5cdFx0b25GYWlsdXJlU3RhZ2UoJ29ic2VydmVUdXJuJyk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFR1cm4gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBjYW5jZWxTdWIgPSBzdG9yZS5hZGQoY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRjYW5jZWxTdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RdIENhbmNlbGxhdGlvbiByZXF1ZXN0ZWQgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfSwgZGlzcGF0Y2hpbmcgdHVybkNhbmNlbGxlZGApO1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaCh0dXJuQ2hhbm5lbCwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdGR1cmF0aW9uOiB0aGlzLl90dXJuRHVyYXRpb24odHVybkNoYW5uZWwsIHR1cm5JZCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQodGhpcy5fb2JzZXJ2ZVR1cm4oe1xuXHRcdFx0XHRiYWNrZW5kU2Vzc2lvbjogc2Vzc2lvbixcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0Y2hhdFVSSSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRzaW5rOiBwcm9ncmVzcyxcblx0XHRcdFx0Y2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0XHRcdHN1cHByZXNzRXJyb3JNYXJrZG93bjogdHJ1ZSxcblx0XHRcdFx0b25UdXJuRW5kZWQ6IChsYXN0VHVybikgPT4ge1xuXHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9jbGllbnREaXNwYXRjaGVkVHVybklkcy5kZWxldGUodHVybklkKTtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9ucy5nZXQocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpPy5pc0NvbXBsZXRlT2JzLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJlc29sdmUobGFzdFR1cm4pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkZpbGVFZGl0czogKHRjKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdFBhcnRzID0gdGhpcy5faHlkcmF0ZUZpbGVFZGl0cyhyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdC5yZXF1ZXN0SWQsIHRjKTtcblx0XHRcdFx0XHRpZiAoZWRpdFBhcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHByb2dyZXNzKGVkaXRQYXJ0cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tLSBUb29sIGNvbmZpcm1hdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBBd2FpdHMgdXNlciBjb25maXJtYXRpb24gb24gYSBQZW5kaW5nQ29uZmlybWF0aW9uIHRvb2wgY2FsbCBpbnZvY2F0aW9uXG5cdCAqIGFuZCBkaXNwYXRjaGVzIGBDaGF0VG9vbENhbGxDb25maXJtZWRgIGJhY2sgdG8gdGhlIHNlcnZlci5cblx0ICovXG5cdHByaXZhdGUgX2F3YWl0VG9vbENvbmZpcm1hdGlvbihcblx0XHRpbnZvY2F0aW9uOiBDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0dG9vbENhbGxJZDogc3RyaW5nLFxuXHRcdHNlc3Npb246IFVSSSxcblx0XHR0dXJuSWQ6IHN0cmluZyxcblx0XHRjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0Z2V0UHJvdG9jb2xPcHRpb25zOiAoKSA9PiBDb25maXJtYXRpb25PcHRpb25bXSB8IHVuZGVmaW5lZCxcblx0XHRjaGF0VVJJPzogc3RyaW5nLFxuXHQpOiB2b2lkIHtcblx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmF3YWl0Q29uZmlybWF0aW9uKGludm9jYXRpb24sIGNhbmNlbGxhdGlvblRva2VuKS50aGVuKHJlYXNvbiA9PiB7XG5cdFx0XHQvLyBXaGVuIHRoZSB1c2VyIHBpY2tlZCBhIGN1c3RvbSBidXR0b24sIHJlc29sdmUgdGhlIG1hdGNoaW5nXG5cdFx0XHQvLyBwcm90b2NvbCBvcHRpb24gc28gd2UgY2FuIGZvcndhcmQgYHNlbGVjdGVkT3B0aW9uSWRgIGFuZFxuXHRcdFx0Ly8gZGVyaXZlIGFwcHJvdmUvZGVueSBmcm9tIHRoZSBvcHRpb24ncyBraW5kLlxuXHRcdFx0bGV0IHNlbGVjdGVkT3B0aW9uOiBDb25maXJtYXRpb25PcHRpb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcm90b2NvbE9wdGlvbnMgPSBnZXRQcm90b2NvbE9wdGlvbnMoKTtcblx0XHRcdGlmIChyZWFzb24udHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gJiYgcmVhc29uLnNlbGVjdGVkQnV0dG9uICYmIHByb3RvY29sT3B0aW9ucykge1xuXHRcdFx0XHRzZWxlY3RlZE9wdGlvbiA9IHByb3RvY29sT3B0aW9ucy5maW5kKG8gPT4gby5pZCA9PT0gcmVhc29uLnNlbGVjdGVkQnV0dG9uKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYXBwcm92ZWQgPSBzZWxlY3RlZE9wdGlvblxuXHRcdFx0XHQ/IHNlbGVjdGVkT3B0aW9uLmtpbmQgPT09IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuQXBwcm92ZVxuXHRcdFx0XHQ6IHJlYXNvbi50eXBlICE9PSBUb29sQ29uZmlybUtpbmQuRGVuaWVkICYmIHJlYXNvbi50eXBlICE9PSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZDtcblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0XSBUb29sIGNvbmZpcm1hdGlvbjogdG9vbENhbGxJZD0ke3Rvb2xDYWxsSWR9LCBhcHByb3ZlZD0ke2FwcHJvdmVkfSwgc2VsZWN0ZWRPcHRpb25JZD0ke3NlbGVjdGVkT3B0aW9uPy5pZH1gKTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3JlcXVpcmVDaGF0VVJJKGNoYXRVUkksIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkKTtcblx0XHRcdGlmIChhcHByb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaCh0YXJnZXQsIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRcdFx0Li4uKHNlbGVjdGVkT3B0aW9uID8geyBzZWxlY3RlZE9wdGlvbklkOiBzZWxlY3RlZE9wdGlvbi5pZCB9IDoge30pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmRpc3BhdGNoKHRhcmdldCwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdGFwcHJvdmVkOiBmYWxzZSxcblx0XHRcdFx0XHRyZWFzb246IFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLkRlbmllZCxcblx0XHRcdFx0XHQuLi4oc2VsZWN0ZWRPcHRpb24gPyB7IHNlbGVjdGVkT3B0aW9uSWQ6IHNlbGVjdGVkT3B0aW9uLmlkIH0gOiB7fSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIFRvb2wgY29uZmlybWF0aW9uIGZhaWxlZCBmb3IgdG9vbENhbGxJZD0ke3Rvb2xDYWxsSWR9YCwgZXJyKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLS0gUGVyLXR1cm4gb2JzZXJ2YWJsZSBncmFwaCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogSW5zdGFsbHMgdGhlIGFsd2F5cy1vbiBvYnNlcnZhYmxlIGdyYXBoIHRoYXQgdHJhbnNsYXRlcyBzZXNzaW9uIHN0YXRlXG5cdCAqIGludG8gYElDaGF0UHJvZ3Jlc3NbXWAgZm9yIGEgc3BlY2lmaWMgdHVybi4gVGhlIHNhbWUgZ3JhcGggaXMgdXNlZCBmb3I6XG5cdCAqICAgLSBsaXZlIHR1cm5zIHN0YXJ0ZWQgYnkgdGhlIHVzZXIgdmlhIHtAbGluayBfaGFuZGxlVHVybn0sXG5cdCAqICAgLSByZWNvbm5lY3QgdG8gYW4gaW4tZmxpZ2h0IHR1cm4gZnJvbSB7QGxpbmsgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudH0sXG5cdCAqICAgLSBzZXJ2ZXItaW5pdGlhdGVkIHR1cm5zIGRldGVjdGVkIGJ5IHtAbGluayBfd2F0Y2hGb3JTZXJ2ZXJJbml0aWF0ZWRUdXJuc30uXG5cdCAqXG5cdCAqIERpZmZlcmVuY2VzIGFyZSBjYXB0dXJlZCBpbiB7QGxpbmsgSU9ic2VydmVUdXJuT3B0aW9ucy5zaW5rfSAod2hlcmVcblx0ICogcHJvZ3Jlc3MgaXMgZGVsaXZlcmVkKSBhbmQge0BsaW5rIElPYnNlcnZlVHVybk9wdGlvbnMuYWRvcHRJbnZvY2F0aW9uc30gL1xuXHQgKiB7QGxpbmsgSU9ic2VydmVUdXJuT3B0aW9ucy5zZWVkRW1pdHRlZExlbmd0aHN9IChzbmFwc2hvdCBjb250aW51aXR5IGZvclxuXHQgKiB0aGUgcmVjb25uZWN0IGNhc2UpLlxuXHQgKlxuXHQgKiBUaGUgcmV0dXJuZWQgZGlzcG9zYWJsZSBvd25zIHRoZSBlbnRpcmUgcGVyLXR1cm4gZ3JhcGgsIGluY2x1ZGluZyB0aGVcblx0ICogdW5kZXJseWluZyBzZXNzaW9uIHN1YnNjcmlwdGlvbiByZWZlcmVuY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9vYnNlcnZlVHVybihvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBvcHRzLmJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZW5zdXJlVHVyblN0b3BXYXRjaChvcHRzLmNoYXRVUkksIG9wdHMudHVybklkKTtcblx0XHQvLyBgX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb25gIHJldHVybnMgYSBwcm9jZXNzLXNoYXJlZCwgbm9uLXJlZmNvdW50ZWRcblx0XHQvLyBzdWJzY3JpcHRpb24gb3duZWQgYnkgdGhlIGNoYXQgc2Vzc2lvbiBsaWZlY3ljbGUuIERvIE5PVCByZWxlYXNlIGl0XG5cdFx0Ly8gZnJvbSBoZXJlIFx1MjAxNCBvdGhlciBjYWxsZXJzICh0aGUgc2VydmVyLXR1cm4gd2F0Y2hlciwgcmVjb25uZWN0LCB0aGVcblx0XHQvLyBoaXN0b3J5IGh5ZHJhdGlvbiBjb2RlKSBzaGFyZSB0aGUgc2FtZSBpbnN0YW5jZSBhbmQgd291bGQgbG9zZVxuXHRcdC8vIHRoZWlyIHN0YXRlIGlmIHdlIHRvcmUgaXQgZG93bi5cblx0XHRjb25zdCBzdWIgPSB0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHNlc3Npb25LZXkpO1xuXHRcdGNvbnN0IGNoYXRVUkkgPSBvcHRzLmNoYXRVUkk7XG5cdFx0Y29uc3QgY2hhdFN1YiA9IHRoaXMuX2Vuc3VyZUNoYXRTdWJzY3JpcHRpb24oc2Vzc2lvbktleSwgY2hhdFVSSSk7XG5cblx0XHRjb25zdCBzZXNzaW9uU3RhdGUkID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpcHRpb24odGhpcywgc3ViKTtcblx0XHRjb25zdCBjaGF0U3RhdGUkID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpcHRpb24odGhpcywgY2hhdFN1Yik7XG5cdFx0Ly8gTWVyZ2UgdGhlIHNlc3Npb24gd2l0aCB0aGlzIHJlc291cmNlJ3MgY2hhdCBzbyBjb252ZXJzYXRpb24gY29udGVudHNcblx0XHQvLyBhcmUgb2JzZXJ2YWJsZSBmcm9tIG9uZSBwbGFjZS5cblx0XHRjb25zdCBtZXJnZWRTdGF0ZSQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvblN0YXRlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQoc2Vzc2lvbiwgY2hhdFN0YXRlJC5yZWFkKHJlYWRlcikpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IHR1cm4kID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtZXJnZWRTdGF0ZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHN0YXRlLmFjdGl2ZVR1cm4/LmlkID09PSBvcHRzLnR1cm5JZFxuXHRcdFx0XHQ/IHN0YXRlLmFjdGl2ZVR1cm5cblx0XHRcdFx0OiBzdGF0ZS50dXJucy5maW5kKHQgPT4gdC5pZCA9PT0gb3B0cy50dXJuSWQpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlUGFydHMkID0gZGVyaXZlZChyZWFkZXIgPT4gdHVybiQucmVhZChyZWFkZXIpPy5yZXNwb25zZVBhcnRzID8/IFtdKTtcblx0XHRjb25zdCB1c2FnZSQgPSBkZXJpdmVkKHJlYWRlciA9PiB0dXJuJC5yZWFkKHJlYWRlcik/LnVzYWdlKTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtZXJnZWRTdGF0ZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHN0YXRlPy50dXJucy5zb21lKHR1cm4gPT4gdHVybi5pZCA9PT0gb3B0cy50dXJuSWQpKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyVHVyblN0b3BXYXRjaChvcHRzLmNoYXRVUkksIG9wdHMudHVybklkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgbWNwQXV0aFJlcXVpcmVkJCA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGVxdWFscyB9LCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIGdldE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXJzKG9wdHMuc2Vzc2lvblJlc291cmNlLCBtZXJnZWRTdGF0ZSQucmVhZChyZWFkZXIpKTtcblx0XHR9KTtcblx0XHRjb25zdCBtY3BTdGFydGluZyQgPSBkZXJpdmVkT3B0cyh7IGVxdWFsc0ZuOiBlcXVhbHMgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gbWVyZ2VkU3RhdGUkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNlcnZlcnMgPSBzdGF0ZT8uY3VzdG9taXphdGlvbnM/LmZsYXRNYXAoYyA9PiBjLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlclxuXHRcdFx0XHQ/IFtjXVxuXHRcdFx0XHQ6IGMuY2hpbGRyZW4/LmZpbHRlcihjID0+IGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSA/PyBbXSkgPz8gW107XG5cdFx0XHRyZXR1cm4gc2VydmVyc1xuXHRcdFx0XHQuZmlsdGVyKHNlcnZlciA9PiBzZXJ2ZXIuZW5hYmxlZCAmJiBzZXJ2ZXIuc3RhdGUua2luZCA9PT0gTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nKVxuXHRcdFx0XHQubWFwKChzZXJ2ZXIpOiBJQ2hhdE1jcFN0YXJ0aW5nU2VydmVyID0+ICh7XG5cdFx0XHRcdFx0aWQ6IG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSArICcvJyArIHNlcnZlci5pZCxcblx0XHRcdFx0XHRuYW1lOiBzZXJ2ZXIubmFtZSxcblx0XHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3ViYWdlbnQgb2JzZXJ2YXRpb24gY29udGV4dDogZGVkdXBzIHN1YmFnZW50IHRvb2wgY2FsbHMgc28gZWFjaCBpc1xuXHRcdC8vIG9ic2VydmVkIG9uY2UuXG5cdFx0Y29uc3Qgc3ViYWdlbnRDb250ZXh0OiBJU3ViYWdlbnRDb250ZXh0ID0ge1xuXHRcdFx0b2JzZXJ2ZWRUb29sSWRzOiBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHR9O1xuXG5cdFx0Ly8gUGVyIHJlc3BvbnNlIHBhcnQuIE1hcmtkb3duIC8gcmVhc29uaW5nIC8gdG9vbCBjYWxscyBlYWNoIGdldCBhXG5cdFx0Ly8gZGVkaWNhdGVkIHNldHVwIGtleWVkIGJ5IHRoZWlyIHN0YWJsZSBpZC4gUGVyLWtleSBjbG9zdXJlcyByZXBsYWNlXG5cdFx0Ly8gdGhlIGBNYXA8c3RyaW5nLCBDaGF0VG9vbEludm9jYXRpb24+YCBhbmQgYE1hcDxzdHJpbmcsIG51bWJlcj5cblx0XHQvLyBsYXN0RW1pdHRlZExlbmd0aHNgIGJvb2trZWVwaW5nIHRoYXQgdXNlZCB0byBsaXZlIG9uIGV2ZXJ5IGNhbGxcblx0XHQvLyBzaXRlIG9mIGBfcHJvY2Vzc1Nlc3Npb25TdGF0ZWAuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW5QZXJLZXllZEl0ZW0oXG5cdFx0XHRyZXNwb25zZVBhcnRzJCxcblx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGxcblx0XHRcdFx0PyBgdGM6JHtycC50b29sQ2FsbC50b29sQ2FsbElkfWBcblx0XHRcdFx0OiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duXG5cdFx0XHRcdFx0PyBgbWQ6JHtycC5pZH1gXG5cdFx0XHRcdFx0OiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZ1xuXHRcdFx0XHRcdFx0PyBgcnM6JHtycC5pZH1gXG5cdFx0XHRcdFx0XHQ6IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0XG5cdFx0XHRcdFx0XHRcdD8gaW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0S2V5KHJwKVxuXHRcdFx0XHRcdFx0XHQ6IGBvdGhlcjoke3Jlc3BvbnNlUGFydHMkLmdldCgpLmluZGV4T2YocnApfWAsXG5cdFx0XHQoX2tleSwgcGFydCQsIHBhcnRTdG9yZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbml0aWFsID0gcGFydCQuZ2V0KCk7XG5cdFx0XHRcdHN3aXRjaCAoaW5pdGlhbC5raW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duOlxuXHRcdFx0XHRcdFx0Ly8gU3ViYWdlbnQgb2JzZXJ2ZXJzIGRvbid0IGZvcndhcmQgbWFya2Rvd24gaW50byB0aGVcblx0XHRcdFx0XHRcdC8vIHBhcmVudCdzIHByb2dyZXNzIFx1MjAxNCBpdCBiZWxvbmdzIHRvIHRoZSBzdWJhZ2VudCdzIG93blxuXHRcdFx0XHRcdFx0Ly8gc2Vzc2lvbiB2aWV3LlxuXHRcdFx0XHRcdFx0aWYgKG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX3NldHVwTWFya2Rvd25QYXJ0KHBhcnQkIGFzIElPYnNlcnZhYmxlPE1hcmtkb3duUmVzcG9uc2VQYXJ0PiwgcGFydFN0b3JlLCBvcHRzKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmc6XG5cdFx0XHRcdFx0XHRpZiAob3B0cy5zdWJBZ2VudEludm9jYXRpb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fc2V0dXBSZWFzb25pbmdQYXJ0KHBhcnQkIGFzIElPYnNlcnZhYmxlPFJlYXNvbmluZ1Jlc3BvbnNlUGFydD4sIHBhcnRTdG9yZSwgb3B0cyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGw6XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXR1cFRvb2xDYWxsUGFydChwYXJ0JCBhcyBJT2JzZXJ2YWJsZTxUb29sQ2FsbFJlc3BvbnNlUGFydD4sIHBhcnRTdG9yZSwgb3B0cywgc3ViYWdlbnRDb250ZXh0KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUmVzcG9uc2VQYXJ0S2luZC5JbnB1dFJlcXVlc3Q6XG5cdFx0XHRcdFx0XHRpZiAob3B0cy5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3NldHVwSW5wdXRSZXF1ZXN0UGFydChwYXJ0JCBhcyBJT2JzZXJ2YWJsZTxJbnB1dFJlcXVlc3RSZXNwb25zZVBhcnQ+LCBwYXJ0U3RvcmUsIG9wdHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbjpcblx0XHRcdFx0XHRcdC8vIFN5c3RlbSBub3RpZmljYXRpb25zIGRvbid0IGhhdmUgYW4gaWQsIHNvIHdlIGhhdmUgdG8gaWRlbnRpZnkgaXQgYnkgaW5kZXhcblx0XHRcdFx0XHRcdGlmIChyZXNwb25zZVBhcnRzJC5nZXQoKS5pbmRleE9mKGluaXRpYWwpID49IChvcHRzLmluaXRpYWxSZXNwb25zZVBhcnRDb3VudCA/PyAwKSAmJiBvcHRzLnN1YkFnZW50SW52b2NhdGlvbklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3MgPSBzeXN0ZW1Ob3RpZmljYXRpb25Ub0NoYXRQYXJ0KGluaXRpYWwuY29udGVudCwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdFx0XHRvcHRzLnNpbmsoW3Byb2dyZXNzXSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gUGVyLXR1cm4gYWRqdW5jdHMgc2tpcHBlZCBmb3Igc3ViYWdlbnQgb2JzZXJ2ZXJzLlxuXHRcdGlmIChvcHRzLnN1YkFnZW50SW52b2NhdGlvbklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGxldCBsYXN0VXNhZ2U6IFJldHVyblR5cGU8dHlwZW9mIHVzYWdlSW5mb1RvQ2hhdFVzYWdlPjtcblx0XHRcdGxldCBsYXN0QXV0b01vZGVSZXNvbHV0aW9uOiBJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBtb2RlbExvb2t1cCA9IHRoaXMuX2NyZWF0ZVR1cm5Nb2RlbExvb2t1cChvcHRzLnNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0dGhpcy5fc2V0dXBNY3BBdXRoUHJvbXB0KG1jcEF1dGhSZXF1aXJlZCQsIHN0b3JlLCBvcHRzKTtcblxuXHRcdFx0Ly8gU3VyZmFjZSB0aGUgaG9zdCdzIGNoYXQgYWN0aXZpdHkgXHUyMDE0IGUuZy4gdGhlIGxpdmUgXCJDcmVhdGluZ1xuXHRcdFx0Ly8gaXNvbGF0ZWQgd29ya3RyZWUgKDQyJSlcIiBwcm9ncmVzcyByZXBvcnRlZCB3aGlsZSB0aGUgc2Vzc2lvbidzXG5cdFx0XHQvLyB3b3JrdHJlZSBpcyBiZWluZyBjcmVhdGVkIFx1MjAxNCBpbnN0ZWFkIG9mIHRoZSBnZW5lcmljIHdvcmtpbmdcblx0XHRcdC8vIHBsYWNlaG9sZGVyIHRoZSB3aWRnZXQgd291bGQgb3RoZXJ3aXNlIHNob3cuIFJlc3RyaWN0ZWQgdG8gdGhlXG5cdFx0XHQvLyB3aW5kb3cgYmVmb3JlIHRoZSBhZ2VudCBwcm9kdWNlcyBhbnkgY29udGVudCwgc2luY2UgZnJvbSB0aGVuIG9uXG5cdFx0XHQvLyBpdHMgb3duIHBhcnRzIHRlbGwgdGhlIHN0b3J5LiBUaGUgc3RhYmxlIGlkIG1ha2VzIGVhY2ggdXBkYXRlXG5cdFx0XHQvLyByZXBsYWNlIHRoZSBwcmV2aW91cyByb3cgcmF0aGVyIHRoYW4gc3RhY2sgYW5vdGhlciBvbmUsIGFuZCB0aGVcblx0XHRcdC8vIHJvdyBoaWRlcyBpdHNlbGYgYXMgc29vbiBhcyByZWFsIGNvbnRlbnQgZm9sbG93cyBpdC5cblx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2aXR5ID0gY2hhdFN0YXRlJC5yZWFkKHJlYWRlcik/LmFjdGl2aXR5O1xuXHRcdFx0XHRpZiAoIWFjdGl2aXR5IHx8IHJlc3BvbnNlUGFydHMkLnJlYWQocmVhZGVyKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wdHMuc2luayhbe1xuXHRcdFx0XHRcdGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLFxuXHRcdFx0XHRcdGlkOiBDSEFUX0FDVElWSVRZX1BST0dSRVNTX0lELFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoYWN0aXZpdHkpLFxuXHRcdFx0XHRcdHNoaW1tZXI6IHRydWUsXG5cdFx0XHRcdH1dKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x1dGlvbiA9IG1vZGVsTG9va3VwLnRvQXV0b01vZGVSZXNvbHV0aW9uPy4odXNhZ2UkLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdGlmICghcmVzb2x1dGlvbiB8fCBlcXVhbHMobGFzdEF1dG9Nb2RlUmVzb2x1dGlvbiwgcmVzb2x1dGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdEF1dG9Nb2RlUmVzb2x1dGlvbiA9IHJlc29sdXRpb247XG5cdFx0XHRcdG9wdHMuc2luayhbcmVzb2x1dGlvbl0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBTdXJmYWNlIGEgXCJTdGFydGluZyBNQ1Agc2VydmVycyBcdTIwMjZcIiBwcm9ncmVzcyBoaW50IHdoZW4gc2VydmVyc1xuXHRcdFx0Ly8gcmVtYWluIGluIHRoZSBgU3RhcnRpbmdgIHN0YXRlIHBhc3QgYSBzaG9ydCBncmFjZSBwZXJpb2QgYWZ0ZXIgdGhlXG5cdFx0XHQvLyB0dXJuIGJlZ2lucyB3aXRob3V0IGFueSBjb250ZW50IGFycml2aW5nIGZyb20gdGhlIGhvc3QuIFRoZSBwYXJ0XG5cdFx0XHQvLyB1cGRhdGVzIGFzIHNlcnZlcnMgZmluaXNoIGFuZCBoaWRlcyBvbmNlIGV2ZXJ5IHNlcnZlciBoYXMgc3RhcnRlZCxcblx0XHRcdC8vIGNvbnRlbnQgc3RhcnRzIGJlaW5nIHJlY2VpdmVkLCBvciB0aGUgdHVybiBlbmRzIFx1MjAxNCB3aGljaGV2ZXIgY29tZXNcblx0XHRcdC8vIGZpcnN0LiBJdCBjYXJyaWVzIG5vIGludGVyYWN0aXZlIGFmZm9yZGFuY2UgKG5vIFwiU2tpcFwiKS5cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgTUNQX1NUQVJUSU5HX0dSQUNFX01TID0gNTAwMDtcblxuXHRcdFx0XHRsZXQgZGlkQXBwZW5kID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IGhhc0NvbnRlbnQkID0gcmVzcG9uc2VQYXJ0cyQubWFwKHIgPT4gci5sZW5ndGggPiAwKTtcblx0XHRcdFx0Y29uc3QgaGFzU2VydmVyc1N0YXJ0aW5nJCA9IG1jcFN0YXJ0aW5nJC5tYXAocyA9PiBzLmxlbmd0aCA+IDApO1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXJzU3RhcnRpbmdJbnB1dCA9IG9ic2VydmFibGVWYWx1ZSgnbWNwU3RhcnRpbmdTZXJ2ZXJzSW5wdXQnLCBjb25zdE9ic2VydmFibGU8SUNoYXRNY3BTdGFydGluZ1NlcnZlcltdPihbXSkpO1xuXG5cdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0aWYgKGhhc0NvbnRlbnQkLnJlYWQocmVhZGVyKSB8fCAhaGFzU2VydmVyc1N0YXJ0aW5nJC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdHNlcnZlcnNTdGFydGluZ0lucHV0LnNldChjb25zdE9ic2VydmFibGUoW10pLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0c2VydmVyc1N0YXJ0aW5nSW5wdXQuc2V0KG1jcFN0YXJ0aW5nJCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdGlmICghZGlkQXBwZW5kKSB7XG5cdFx0XHRcdFx0XHRcdGRpZEFwcGVuZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdG9wdHMuc2luayhbe1xuXHRcdFx0XHRcdFx0XHRcdGtpbmQ6ICdtY3BTZXJ2ZXJzU3RhcnRpbmdTbG93Jyxcblx0XHRcdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IG9wdHMuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdHNlcnZlcnM6IHNlcnZlcnNTdGFydGluZ0lucHV0Lm1hcCgobywgcikgPT4gby5yZWFkKHIpKSxcblx0XHRcdFx0XHRcdFx0fV0pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fSwgTUNQX1NUQVJUSU5HX0dSQUNFX01TKSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlcnZlcnNTdGFydGluZ0lucHV0LnNldChjb25zdE9ic2VydmFibGUoW10pLCB1bmRlZmluZWQpKSk7XG5cdFx0XHR9XG5cblx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHJhd1VzYWdlID0gdXNhZ2UkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Ly8gVGhlIHBhcmVudCB0dXJuJ3MgdXNhZ2UgYWxyZWFkeSBhZ2dyZWdhdGVzIHRoZSBwYXJlbnQgYWdlbnQnc1xuXHRcdFx0XHQvLyBjYWxscyBwbHVzIGV2ZXJ5IHN1YmFnZW50J3MgY2FsbHMgKHRoZSBhZ2VudCBob3N0IGZvbGRzXG5cdFx0XHRcdC8vIHN1YmFnZW50IHVzYWdlIGludG8gdGhlIHBhcmVudCB0dXJuIHVuZGVyIHNjb3BlIGAnJ2ApLCBzbyBpdCBpc1xuXHRcdFx0XHQvLyBlbWl0dGVkIGFzLWlzIFx1MjAxNCBubyBzZXBhcmF0ZSByZS1hZ2dyZWdhdGlvbiBvZiBzdWJhZ2VudCBjcmVkaXRzLlxuXHRcdFx0XHRjb25zdCB1c2FnZSA9IHVzYWdlSW5mb1RvQ2hhdFVzYWdlKHJhd1VzYWdlKTtcblx0XHRcdFx0aWYgKCF1c2FnZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDYXJyeSB0aHJvdWdoIHRoZSBhY3R1YWwgbW9kZWwgc28gdGhlIGNvbnRleHQtdXNhZ2Ugd2lkZ2V0XG5cdFx0XHRcdC8vIGNhbiBsb29rIHVwIGNvbnRleHQgd2luZG93IG1ldGFkYXRhIHdoZW4gdGhlIHJlcXVlc3QtbGV2ZWxcblx0XHRcdFx0Ly8gbW9kZWwgKGUuZy4gXCJhdXRvXCIpIGRvZXNuJ3QgZXhwb3NlIG9uZS5cblx0XHRcdFx0Y29uc3QgYWN0dWFsTW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKG9wdHMuc2Vzc2lvblJlc291cmNlLCByYXdVc2FnZT8ubW9kZWwpO1xuXHRcdFx0XHRpZiAoYWN0dWFsTW9kZWxJZCkge1xuXHRcdFx0XHRcdHVzYWdlLmFjdHVhbE1vZGVsSWQgPSBhY3R1YWxNb2RlbElkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsYXN0VXNhZ2Vcblx0XHRcdFx0XHQmJiBsYXN0VXNhZ2UucHJvbXB0VG9rZW5zID09PSB1c2FnZS5wcm9tcHRUb2tlbnNcblx0XHRcdFx0XHQmJiBsYXN0VXNhZ2UuY29tcGxldGlvblRva2VucyA9PT0gdXNhZ2UuY29tcGxldGlvblRva2Vuc1xuXHRcdFx0XHRcdCYmIGxhc3RVc2FnZS5vdXRwdXRCdWZmZXIgPT09IHVzYWdlLm91dHB1dEJ1ZmZlclxuXHRcdFx0XHRcdCYmIGxhc3RVc2FnZS5jb3BpbG90Q3JlZGl0cyA9PT0gdXNhZ2UuY29waWxvdENyZWRpdHNcblx0XHRcdFx0XHQvLyBUaGUgc2Vzc2lvbiB0b3RhbCBtb3ZlcyBpbmRlcGVuZGVudGx5IG9mIHRoaXMgdHVybidzIG93biBjb3N0IFx1MjAxNFxuXHRcdFx0XHRcdC8vIGl0IGFsc28gY292ZXJzIHdvcmsgYmlsbGVkIHdoaWxlIG5vIHR1cm4gd2FzIGFjdGl2ZSBcdTIwMTQgc28gaXQgaGFzXG5cdFx0XHRcdFx0Ly8gdG8gYmUgY29tcGFyZWQsIG9yIGEgc2Vzc2lvbi1jb3N0IHVwZGF0ZSB3b3VsZCBiZSBkcm9wcGVkIGhlcmUuXG5cdFx0XHRcdFx0JiYgbGFzdFVzYWdlLnNlc3Npb25Db3BpbG90Q3JlZGl0cyA9PT0gdXNhZ2Uuc2Vzc2lvbkNvcGlsb3RDcmVkaXRzXG5cdFx0XHRcdFx0JiYgZXF1YWxzKGxhc3RVc2FnZS5wcm9tcHRUb2tlbkRldGFpbHMsIHVzYWdlLnByb21wdFRva2VuRGV0YWlscykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdFVzYWdlID0gdXNhZ2U7XG5cdFx0XHRcdG9wdHMuc2luayhbdXNhZ2VdKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gU3VyZmFjZSB0aGUgYWNjb3VudCBxdW90YSBzbmFwc2hvdHMgdGhlIGFnZW50IGhvc3QgcmVwb3J0cyBvbiBlYWNoIG1vZGVsLWNhbGwgdXNhZ2UgZXZlbnRcblx0XHRcdC8vIGludG8gdGhlIGVudGl0bGVtZW50IHNlcnZpY2UsIGtlZXBpbmcgdGhlIHF1b3RhIFVJIGN1cnJlbnQgZm9yIGFnZW50LWhvc3Qgc2Vzc2lvbnMgKG1pcnJvcnNcblx0XHRcdC8vIHRoZSBleHRlbnNpb24taG9zdCBDTEkgcGF0aCkuIGBhY2NlcHRRdW90YXNgIHJlcGxhY2VzIHRvcC1sZXZlbCBzdGF0ZSBhbmQgbWVyZ2VzIGZpZWxkc1xuXHRcdFx0Ly8gd2l0aGluIGVhY2ggcHJvdmlkZWQgY2F0ZWdvcnkgc25hcHNob3QuXG5cdFx0XHRsZXQgbGFzdFF1b3RhU2lnbmF0dXJlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBxdW90YVVwZGF0ZSA9IHVzYWdlSW5mb1RvUXVvdGFzKHVzYWdlJC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHRpZiAoIXF1b3RhVXBkYXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNpZ25hdHVyZSA9IEpTT04uc3RyaW5naWZ5KHF1b3RhVXBkYXRlKTtcblx0XHRcdFx0aWYgKHNpZ25hdHVyZSA9PT0gbGFzdFF1b3RhU2lnbmF0dXJlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RRdW90YVNpZ25hdHVyZSA9IHNpZ25hdHVyZTtcblx0XHRcdFx0dGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5hY2NlcHRRdW90YXMoe1xuXHRcdFx0XHRcdC4uLnRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLFxuXHRcdFx0XHRcdC4uLnF1b3RhVXBkYXRlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblxuXHRcdH1cblxuXHRcdC8vIEZvciBzdWJhZ2VudCBvYnNlcnZlcnM6IGFjY3VtdWxhdGUgY29waWxvdCBjcmVkaXRzIGZyb20gY2hpbGQgdHVybnNcblx0XHQvLyBpbnRvIHRoZSBwYXJlbnQncyBhY2N1bXVsYXRvciBzbyB0aGUgc2Vzc2lvbiBjb3N0IGluY2x1ZGVzIHRoZW0sIGFuZFxuXHRcdC8vIHN1cmZhY2UgdGhlIHBlci1zdWJhZ2VudCB0b3RhbCBvbiBpdHMgdG9vbCBob3Zlci5cblx0XHQvL1xuXHRcdC8vIE5PVEU6IHRoaXMgZGVwZW5kcyBvbiB0aGUgYWdlbnQgaG9zdCByZXBvcnRpbmcgdXNhZ2Ugb24gdGhlIHN1YmFnZW50J3Ncblx0XHQvLyBvd24gY2hpbGQgdHVybnMuIFNvbWUgaG9zdHMgKGUuZy4gY29waWxvdGNsaSkgaW5zdGVhZCBidW5kbGUgYVxuXHRcdC8vIHN1YmFnZW50J3MgbW9kZWwtY2FsbCBjb3N0IGludG8gdGhlICpwYXJlbnQqIHR1cm4ncyB1c2FnZSBhbmQgbGVhdmUgdGhlXG5cdFx0Ly8gY2hpbGQgdHVybidzIHVzYWdlIGVtcHR5OyBmb3IgdGhvc2UgdGhpcyBvYnNlcnZlciBzdGF5cyBpbmVydCBhbmQgdGhlXG5cdFx0Ly8gc3ViYWdlbnQncyBjb3N0IGlzIHN0aWxsIHJlZmxlY3RlZCBpbiB0aGUgb3ZlcmFsbCBzZXNzaW9uIGNvc3QgdmlhIHRoZVxuXHRcdC8vIHBhcmVudCB0dXJuLiBUaGUgd2lyaW5nIGxpZ2h0cyB1cCBhdXRvbWF0aWNhbGx5IGZvciBob3N0cyB0aGF0IGRvXG5cdFx0Ly8gcmVwb3J0IGNoaWxkLXR1cm4gdXNhZ2UuXG5cdFx0aWYgKG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgIT09IHVuZGVmaW5lZCAmJiBvcHRzLnN1YkFnZW50Q3JlZGl0c0FjY3VtdWxhdG9yKSB7XG5cdFx0XHRjb25zdCBhY2N1bXVsYXRvciA9IG9wdHMuc3ViQWdlbnRDcmVkaXRzQWNjdW11bGF0b3I7XG5cdFx0XHRsZXQgbGFzdENyZWRpdHMgPSAwO1xuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcmF3VXNhZ2UgPSB1c2FnZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBjcmVkaXRzID0gdXNhZ2VJbmZvVG9DaGF0VXNhZ2UocmF3VXNhZ2UpPy5jb3BpbG90Q3JlZGl0cztcblx0XHRcdFx0aWYgKHR5cGVvZiBjcmVkaXRzID09PSAnbnVtYmVyJyAmJiBjcmVkaXRzICE9PSBsYXN0Q3JlZGl0cykge1xuXHRcdFx0XHRcdGNvbnN0IGRlbHRhID0gY3JlZGl0cyAtIGxhc3RDcmVkaXRzO1xuXHRcdFx0XHRcdGxhc3RDcmVkaXRzID0gY3JlZGl0cztcblx0XHRcdFx0XHRpZiAoZGVsdGEgPiAwKSB7XG5cdFx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHRcdGFjY3VtdWxhdG9yLnNldChhY2N1bXVsYXRvci5yZWFkKHVuZGVmaW5lZCkgKyBkZWx0YSwgdHgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIHN1YmFnZW50IG9ic2VydmVyczogc3VyZmFjZSB0aGUgbGFuZ3VhZ2UgbW9kZWwgdGhpcyBzdWJhZ2VudCByYW5cblx0XHQvLyBvbiBzbyBpdCBjYW4gYmUgc2hvd24gb24gdGhlIHN1YmFnZW50IHRvb2wncyBob3Zlci4gTGlrZSB0aGUgY3JlZGl0c1xuXHRcdC8vIG9ic2VydmVyIGFib3ZlLCB0aGlzIGRlcGVuZHMgb24gdGhlIGhvc3QgcmVwb3J0aW5nIHRoZSBtb2RlbCBvbiB0aGVcblx0XHQvLyBzdWJhZ2VudCdzIG93biBjaGlsZCB0dXJucyAoaG9zdHMgdGhhdCBidW5kbGUgaW50byB0aGUgcGFyZW50IHR1cm5cblx0XHQvLyBsZWF2ZSB0aGlzIGVtcHR5KS5cblx0XHRpZiAob3B0cy5zdWJBZ2VudEludm9jYXRpb25JZCAhPT0gdW5kZWZpbmVkICYmIG9wdHMuc3ViQWdlbnRNb2RlbE9ic2VydmFibGUpIHtcblx0XHRcdGNvbnN0IG1vZGVsT2JzZXJ2YWJsZSA9IG9wdHMuc3ViQWdlbnRNb2RlbE9ic2VydmFibGU7XG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCByYXdVc2FnZSA9IHVzYWdlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IG1vZGVsSWQgPSB0aGlzLl90b0xhbmd1YWdlTW9kZWxJZChvcHRzLnNlc3Npb25SZXNvdXJjZSwgcmF3VXNhZ2U/Lm1vZGVsKTtcblx0XHRcdFx0Y29uc3QgbW9kZWxOYW1lID0gdGhpcy5fZ2V0TGFuZ3VhZ2VNb2RlbERpc3BsYXlOYW1lKG1vZGVsSWQpO1xuXHRcdFx0XHRpZiAobW9kZWxOYW1lICYmIG1vZGVsTmFtZSAhPT0gbW9kZWxPYnNlcnZhYmxlLnJlYWQodW5kZWZpbmVkKSkge1xuXHRcdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IG1vZGVsT2JzZXJ2YWJsZS5zZXQobW9kZWxOYW1lLCB0eCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZWN0IHRlcm1pbmFsIHR1cm4gc3RhdGUuIFRoZSB0dXJuIGlzIG92ZXIgd2hlbiB0aGUgYWN0aXZlIHR1cm5cblx0XHQvLyBpZCBubyBsb25nZXIgbWF0Y2hlcyBvdXIgdHVybiBpZDsgdGhlIGNvbXBsZXRlZCB0dXJuIChpZiBwcmVzZW50XG5cdFx0Ly8gaW4gYHR1cm5zYCkgc3VyZmFjZXMgYW55IGVycm9yIG1lc3NhZ2UuXG5cdFx0Ly9cblx0XHQvLyBgc2VlbkFjdGl2ZWAgZ3VhcmRzIGFnYWluc3QgZmlyaW5nIGBmaW5pc2hgIG9uIHRoZSBpbnN0YWxsIHBhc3M6XG5cdFx0Ly8gYF9oYW5kbGVUdXJuYCBjYWxscyB1cyByaWdodCBhZnRlciBkaXNwYXRjaGluZyBgQ2hhdFR1cm5TdGFydGVkYFxuXHRcdC8vIGJ1dCBiZWZvcmUgdGhlIGFjdGlvbiBoYXMgYmVlbiBlY2hvZWQgYmFjaywgc28gdGhlIHZlcnkgZmlyc3Rcblx0XHQvLyByZWFkaW5nIG9mIHN0YXRlIG1heSBub3QgeWV0IGNvbnRhaW4gb3VyIHR1cm4uIFdlIG11c3Qgd2FpdCB1bnRpbFxuXHRcdC8vIHdlJ3ZlIHNlZW4gb3VyIHR1cm4gYmVjb21lIGFjdGl2ZSBhdCBsZWFzdCBvbmNlIGJlZm9yZSB0cmVhdGluZ1xuXHRcdC8vIGl0cyBhYnNlbmNlIGFzIGEgdGVybWluYWwgdHJhbnNpdGlvbi5cblx0XHRsZXQgdGVybWluYXRlZCA9IGZhbHNlO1xuXHRcdGxldCBzZWVuQWN0aXZlID0gZmFsc2U7XG5cdFx0Y29uc3QgZmluaXNoID0gKGxhc3RUdXJuOiBUdXJuIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAodGVybWluYXRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0ZXJtaW5hdGVkID0gdHJ1ZTtcblx0XHRcdC8vIERlZmVyIHRvIGEgbWljcm90YXNrIHNvIGFueSBvdGhlciBhdXRvcnVucyByZWFjdGluZyB0byB0aGVcblx0XHRcdC8vIHNhbWUgc3RhdGUgdXBkYXRlIChlLmcuIHRvb2wgY2FsbCBmaW5hbGl6YXRpb24pIGZpbmlzaCBmaXJzdC5cblx0XHRcdC8vIFNlbGYtZGlzcG9zZSBhZnRlcndhcmRzIHNvIGNhbGxlcnMgZG8gbm90IG5lZWQgdG8gdHJhY2sgdXNcblx0XHRcdC8vIGFjcm9zcyB0aGUgbmF0dXJhbC1jb21wbGV0aW9uIHBhdGg7IGNhbmNlbGxhdGlvbiBwYXRocyBjYW5cblx0XHRcdC8vIHN0aWxsIGNhbGwgYGRpc3Bvc2UoKWAgcHJvYWN0aXZlbHkgKGlkZW1wb3RlbnQpLlxuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG9wdHMub25UdXJuRW5kZWQ/LihsYXN0VHVybik7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGVybWluYXRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1lcmdlZFN0YXRlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS5hY3RpdmVUdXJuPy5pZCA9PT0gb3B0cy50dXJuSWQpIHtcblx0XHRcdFx0c2VlbkFjdGl2ZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIEFsc28gdHJlYXQgYSBjb21wbGV0ZWQgdHVybiB3ZSBkaXNjb3ZlciBpbiBgdHVybnNgIGFzXG5cdFx0XHQvLyBcImhhdmluZyBzZWVuIGl0XCIsIHNvIHJlY29ubmVjdCAvIHNlcnZlci1pbml0aWF0ZWQgcGF0aHMgdGhhdFxuXHRcdFx0Ly8gaW5zdGFsbCB1cyBhZ2FpbnN0IGFuIGFscmVhZHktY29tcGxldGVkIHR1cm4gc3RpbGwgZmluaXNoLlxuXHRcdFx0Y29uc3QgbGFzdFR1cm4gPSBzdGF0ZS50dXJucy5maW5kKHQgPT4gdC5pZCA9PT0gb3B0cy50dXJuSWQpO1xuXHRcdFx0aWYgKGxhc3RUdXJuKSB7XG5cdFx0XHRcdHNlZW5BY3RpdmUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzZWVuQWN0aXZlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghb3B0cy5zdXBwcmVzc0Vycm9yTWFya2Rvd24gJiYgbGFzdFR1cm4/LnN0YXRlID09PSBUdXJuU3RhdGUuRXJyb3IgJiYgbGFzdFR1cm4uZXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21NZXRhKGxhc3RUdXJuLmVycm9yLCB0aGlzLl9jaGF0RXJyb3JDb250ZXh0KCkpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gZm9yd2FyZGVkXG5cdFx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcoYFxcblxcbiR7Zm9yd2FyZGVkLm1lc3NhZ2V9YClcblx0XHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhgXFxuXFxuRXJyb3I6ICgke2xhc3RUdXJuLmVycm9yLmVycm9yVHlwZX0pICR7bGFzdFR1cm4uZXJyb3IubWVzc2FnZX1gKTtcblx0XHRcdFx0b3B0cy5zaW5rKFt7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50IH1dKTtcblx0XHRcdH1cblx0XHRcdGZpbmlzaChsYXN0VHVybik7XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0Ly8gT24gY2FuY2VsbGF0aW9uIHRoZSBwcm90b2NvbCB0dXJuIGhhcyBub3QgYmVlbiBmaW5hbGl6ZWQgeWV0XG5cdFx0XHQvLyAodGhlIGBDaGF0VHVybkNhbmNlbGxlZGAgZGlzcGF0Y2ggcm91bmQtdHJpcHMgYXN5bmNocm9ub3VzbHkpLCBzb1xuXHRcdFx0Ly8gcmVzb2x2ZSB3aXRoIHRoZSBjdXJyZW50IHR1cm4gcmF0aGVyIHRoYW4gYHVuZGVmaW5lZGAuIFRoaXMga2VlcHNcblx0XHRcdC8vIHRoZSB0dXJuJ3MgYWNjdW11bGF0ZWQgYHVzYWdlYCBzbyB0aGUgcmVzcG9uc2UgZm9vdGVyIHN0aWxsIHNob3dzXG5cdFx0XHQvLyB0aGUgbW9kZWwgYW5kIHRoZSBjcmVkaXRzIGNvbnN1bWVkIGJlZm9yZSB0aGUgaW50ZXJydXB0aW9uLlxuXHRcdFx0Ly8gTWFyayBpdCBgQ2FuY2VsbGVkYCBzbyBlcnJvci1kZXRhaWwgZXh0cmFjdGlvbiB0cmVhdHMgaXQgYXMgYVxuXHRcdFx0Ly8gbm9uLWVycm9yIHRlcm1pbmFsIHR1cm4gKGFuIGFscmVhZHktZmluYWxpemVkIHR1cm4ga2VlcHMgaXRzIG93blxuXHRcdFx0Ly8gc3RhdGUpLlxuXHRcdFx0Y29uc3QgY3VycmVudCA9IHR1cm4kLmdldCgpO1xuXHRcdFx0ZmluaXNoKGN1cnJlbnQgPyB7IHN0YXRlOiBUdXJuU3RhdGUuQ2FuY2VsbGVkLCAuLi5jdXJyZW50IH0gOiB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlcyB0aGUgXCJNQ1Agc2VydmVyIFx1MjAyNiByZXF1aXJlcyBhdXRoZW50aWNhdGlvblwiIHByb21wdCBmb3IgYSB0dXJuLlxuXHQgKlxuXHQgKiBFYWNoIHNlcnZlciBpcyBwcm9tcHRlZCBhdCBtb3N0IG9uY2UgcGVyIGNvbnZlcnNhdGlvbjoge0BsaW5rIG1jcEF1dGhSZXF1aXJlZCR9XG5cdCAqIGlzIHNlc3Npb24td2lkZSwgc28gd2l0aG91dCB0aGlzIGd1YXJkIHRoZSBwcm9tcHQgd291bGQgcmVwZWF0IG9uIGV2ZXJ5XG5cdCAqIG1lc3NhZ2UuIFRoZSBwZXItc2Vzc2lvbiB7QGxpbmsgX3N1cmZhY2VkTWNwQXV0aFNlcnZlcnMgc3VyZmFjZWQgc2V0fSB0cmFja3Ncblx0ICogd2hpY2ggc2VydmVycyB3ZXJlIGFscmVhZHkgcHJvbXB0ZWQ7IGl0IGlzIHBydW5lZCBieVxuXHQgKiB7QGxpbmsgX3JlY29uY2lsZVN1cmZhY2VkTWNwQXV0aFNlcnZlcnN9IG9uY2UgYSBzZXJ2ZXIgcmVhY2hlcyB0aGUgcnVubmluZ1xuXHQgKiBzdGF0ZSwgc28gYSBzZXJ2ZXIgdGhhdCBpcyByZS1yZXF1aXJlZCBhZnRlciBiZWluZyBhdXRoZW50aWNhdGVkIChlLmcuXG5cdCAqIGFmdGVyIGEgcmVzdGFydCkgcHJvbXB0cyBhZ2Fpbi5cblx0ICpcblx0ICogVGhlIGVtaXR0ZWQgcGFydCBsaXN0cyBvbmx5IHRoZSBzZXJ2ZXJzIGl0IGludHJvZHVjZWQgYW5kIHNocmlua3MgYXMgdGhleVxuXHQgKiBhdXRoZW50aWNhdGUuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXR1cE1jcEF1dGhQcm9tcHQoXG5cdFx0bWNwQXV0aFJlcXVpcmVkJDogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyW10+LFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0b3B0czogSU9ic2VydmVUdXJuT3B0aW9ucyxcblx0KTogdm9pZCB7XG5cdFx0bGV0IHBhcnQ6IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZCAmIHsgc2VydmVyczogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXJbXT4gfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgb3duZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRsZXQgcnVuSWQgPSAwO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBlbmRpbmdBdXRoID0gbWNwQXV0aFJlcXVpcmVkJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjdXJyZW50UnVuSWQgPSArK3J1bklkO1xuXHRcdFx0dGhpcy5fZmlsdGVyQXV0b0dyYW50ZWRNY3BBdXRoZW50aWNhdGlvbihvcHRzLnNlc3Npb25SZXNvdXJjZSwgcGVuZGluZ0F1dGgpLnRoZW4oc2VydmVycyA9PiB7XG5cdFx0XHRcdC8vIElnbm9yZSBzdGFsZSBjb21wbGV0aW9uczogYSBuZXdlciBydW4gaGFzIHN1cGVyc2VkZWQgdGhpcyBvbmVcblx0XHRcdFx0Ly8gKGd1YXJkcyBhZ2FpbnN0IG91dC1vZi1vcmRlciByZXNvbHV0aW9uIG9mIHRoZSBhc3luYyBmaWx0ZXIpLlxuXHRcdFx0XHRpZiAoY3VycmVudFJ1bklkICE9PSBydW5JZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdXJmYWNlZCA9IHRoaXMuX2dldFN1cmZhY2VkTWNwQXV0aFNlcnZlcnMob3B0cy5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBuZXdTZXJ2ZXJzID0gc2VydmVycy5maWx0ZXIoc2VydmVyID0+ICFzdXJmYWNlZC5oYXMoc2VydmVyLmlkKSk7XG5cdFx0XHRcdC8vIE5vdGhpbmcgbmV3IHRvIHByb21wdCBhbmQgbm8gbGl2ZSBwcm9tcHQgdG8gdXBkYXRlL2hpZGUuXG5cdFx0XHRcdGlmICghbmV3U2VydmVycy5sZW5ndGggJiYgKCFwYXJ0IHx8IHBhcnQuaXNVc2VkKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXBhcnQgfHwgcGFydC5pc1VzZWQpIHtcblx0XHRcdFx0XHRvd25lZElkcyA9IG5ldyBTZXQoKTtcblx0XHRcdFx0XHRwYXJ0ID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ21jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQnLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBvcHRzLnNlc3Npb25SZXNvdXJjZS50b0pTT04oKSxcblx0XHRcdFx0XHRcdGlzVXNlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRzZXJ2ZXJzOiBvYnNlcnZhYmxlVmFsdWUoJ21jcEF1dGhOZWVkZWRTZXJ2ZXJzJywgW10pLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0b3B0cy5zaW5rKFtwYXJ0XSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgbmV3U2VydmVycykge1xuXHRcdFx0XHRcdHN1cmZhY2VkLmFkZChzZXJ2ZXIuaWQpO1xuXHRcdFx0XHRcdG93bmVkSWRzLmFkZChzZXJ2ZXIuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBhcnQuc2VydmVycy5zZXQoc2VydmVycy5maWx0ZXIoc2VydmVyID0+IG93bmVkSWRzLmhhcyhzZXJ2ZXIuaWQpKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBtdXRhYmxlIHNldCBvZiBNQ1Agc2VydmVyIGlkcyBhbHJlYWR5IHN1cmZhY2VkIGZvclxuXHQgKiBhdXRoZW50aWNhdGlvbiBpbiB0aGUgZ2l2ZW4gc2Vzc2lvbiwgY3JlYXRpbmcgaXQgb24gZmlyc3QgdXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U3VyZmFjZWRNY3BBdXRoU2VydmVycyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFNldDxzdHJpbmc+IHtcblx0XHRsZXQgc3VyZmFjZWQgPSB0aGlzLl9zdXJmYWNlZE1jcEF1dGhTZXJ2ZXJzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc3VyZmFjZWQpIHtcblx0XHRcdHN1cmZhY2VkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHR0aGlzLl9zdXJmYWNlZE1jcEF1dGhTZXJ2ZXJzLnNldChzZXNzaW9uUmVzb3VyY2UsIHN1cmZhY2VkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cmZhY2VkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBydW5lcyBzZXJ2ZXJzIHRoYXQgcmVhY2hlZCB0aGUgcnVubmluZyAoe0BsaW5rIE1jcFNlcnZlclN0YXR1cy5SZWFkeX0pXG5cdCAqIHN0YXRlIGZyb20gZXZlcnkgc2Vzc2lvbidzIHtAbGluayBfc3VyZmFjZWRNY3BBdXRoU2VydmVycyBzdXJmYWNlZCBzZXR9IHNvXG5cdCAqIGEgc3Vic2VxdWVudCBhdXRoIHJlcXVpcmVtZW50IHN1cmZhY2VzIGEgZnJlc2ggcHJvbXB0IGluc3RlYWQgb2YgYmVpbmdcblx0ICogc3VwcHJlc3NlZC4gT25seSB0aGUgcnVubmluZyBzdGF0ZSBjb3VudHMgYXMgYWN0aW9uZWQgXHUyMDE0IGEgc2VydmVyIHRoYXRcblx0ICogbWVyZWx5IGxlZnQge0BsaW5rIE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWR9IGZvciBhbiBlcnJvci9zdG9wcGVkXG5cdCAqIHN0YXRlIHdhcyBub3QgYXV0aGVudGljYXRlZCBhbmQgc3RheXMgc3VwcHJlc3NlZC5cblx0ICovXG5cdHByaXZhdGUgX3JlY29uY2lsZVN1cmZhY2VkTWNwQXV0aFNlcnZlcnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbc2Vzc2lvblJlc291cmNlLCBzdXJmYWNlZF0gb2YgdGhpcy5fc3VyZmFjZWRNY3BBdXRoU2VydmVycykge1xuXHRcdFx0aWYgKHN1cmZhY2VkLnNpemUgPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWFkeSA9IG5ldyBTZXQodGhpcy5fY3VzdG9taXphdGlvblNlcnZpY2UuZ2V0TWNwU2VydmVycyhzZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHRcdC5maWx0ZXIoc2VydmVyID0+IHNlcnZlci5zdGF0dXMgPT09IE1jcFNlcnZlclN0YXR1cy5SZWFkeSlcblx0XHRcdFx0Lm1hcChzZXJ2ZXIgPT4gc2VydmVyLmlkKSk7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHN1cmZhY2VkKSB7XG5cdFx0XHRcdGlmIChyZWFkeS5oYXMoaWQpKSB7XG5cdFx0XHRcdFx0c3VyZmFjZWQuZGVsZXRlKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZpbHRlckF1dG9HcmFudGVkTWNwQXV0aGVudGljYXRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlcnM6IHJlYWRvbmx5IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcltdKTogUHJvbWlzZTxyZWFkb25seSBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXJbXT4ge1xuXHRcdGNvbnN0IHJlbWFpbmluZzogSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2F1dG9BdXRoZW50aWNhdGVNY3BTZXJ2ZXIoc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIpKSB7XG5cdFx0XHRcdHJlbWFpbmluZy5wdXNoKHNlcnZlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZW1haW5pbmc7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hdXRvQXV0aGVudGljYXRlTWNwU2VydmVyKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXI6IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGtleSA9IEpTT04uc3RyaW5naWZ5KFtcblx0XHRcdGFnZW50SG9zdE1jcFNlcnZlcklkKHNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHksIHNlcnZlci5uYW1lLCBzZXJ2ZXIucmVzb3VyY2UpLFxuXHRcdFx0Wy4uLihzZXJ2ZXIucmVxdWlyZWRTY29wZXMgPz8gW10pXS5zb3J0KCksXG5cdFx0XHRzZXJ2ZXIub2F1dGhDbGllbnQ/LmNsaWVudElkLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nTWNwQXV0b0F1dGhlbnRpY2F0aW9uLmdldChrZXkpO1xuXHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gcGVuZGluZztcblx0XHR9XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCB7XG5cdFx0XHRyZXNvdXJjZTogc2VydmVyLnJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2VfbmFtZTogc2VydmVyLm5hbWUsXG5cdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IHNlcnZlci5hdXRob3JpemF0aW9uU2VydmVycyA/IFsuLi5zZXJ2ZXIuYXV0aG9yaXphdGlvblNlcnZlcnNdIDogdW5kZWZpbmVkLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogc2VydmVyLnN1cHBvcnRlZFNjb3BlcyA/IFsuLi5zZXJ2ZXIuc3VwcG9ydGVkU2NvcGVzXSA6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRhbGxvd0ludGVyYWN0aW9uOiBmYWxzZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdG1jcFNlcnZlcklkOiBhZ2VudEhvc3RNY3BTZXJ2ZXJJZChzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5LCBzZXJ2ZXIubmFtZSwgc2VydmVyLnJlc291cmNlKSxcblx0XHRcdG1jcFNlcnZlck5hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0bWNwU2VydmVyVXJsOiBzZXJ2ZXIucmVzb3VyY2UsXG5cdFx0XHRvYXV0aENsaWVudDogc2VydmVyLm9hdXRoQ2xpZW50LFxuXHRcdFx0c2NvcGVzOiBzZXJ2ZXIucmVxdWlyZWRTY29wZXMgPz8gW10sXG5cdFx0XHRhZ2VudEhvc3Q6IHsgc2NoZW1lOiBzZXNzaW9uUmVzb3VyY2Uuc2NoZW1lLCBhdXRob3JpdHk6IHNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkgfSxcblx0XHRcdGF1dGhlbnRpY2F0ZTogcmVxdWVzdCA9PiB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5hdXRoZW50aWNhdGUocmVxdWVzdCksXG5cdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudEhvc3RdIEZhaWxlZCB0byBhdXRvLWF1dGhlbnRpY2F0ZSBNQ1Agc2VydmVyICcke3NlcnZlci5uYW1lfSdgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3BlbmRpbmdNY3BBdXRvQXV0aGVudGljYXRpb24uc2V0KGtleSwgb3BlcmF0aW9uKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IG9wZXJhdGlvbjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdNY3BBdXRvQXV0aGVudGljYXRpb24uZ2V0KGtleSkgPT09IG9wZXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nTWNwQXV0b0F1dGhlbnRpY2F0aW9uLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldHVwTWFya2Rvd25QYXJ0KFxuXHRcdHBhcnQkOiBJT2JzZXJ2YWJsZTxNYXJrZG93blJlc3BvbnNlUGFydD4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHQpOiB2b2lkIHtcblx0XHQvLyBTZWVkIGZyb20gdGhlIHNuYXBzaG90IGxlbmd0aCBzbyB0aGUgYWx3YXlzLW9uIGdyYXBoIGRvZXMgbm90XG5cdFx0Ly8gcmUtZW1pdCBjb250ZW50IGFscmVhZHkgY292ZXJlZCBieSBgYWN0aXZlVHVyblRvUHJvZ3Jlc3NgIG9uXG5cdFx0Ly8gcmVjb25uZWN0LlxuXHRcdGxldCBsYXN0RW1pdHRlZCA9IG9wdHMuc2VlZEVtaXR0ZWRMZW5ndGhzPy5nZXQocGFydCQuZ2V0KCkuaWQpID8/IDA7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBwYXJ0JC5yZWFkKHJlYWRlcikuY29udGVudDtcblx0XHRcdGlmIChjb250ZW50Lmxlbmd0aCA8PSBsYXN0RW1pdHRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZWx0YSA9IGNvbnRlbnQuc3Vic3RyaW5nKGxhc3RFbWl0dGVkKTtcblx0XHRcdGxhc3RFbWl0dGVkID0gY29udGVudC5sZW5ndGg7XG5cdFx0XHRvcHRzLnNpbmsoW3sga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhkZWx0YSkgfV0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwUmVhc29uaW5nUGFydChcblx0XHRwYXJ0JDogSU9ic2VydmFibGU8UmVhc29uaW5nUmVzcG9uc2VQYXJ0Pixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhcnRJZCA9IHBhcnQkLmdldCgpLmlkO1xuXHRcdGxldCBsYXN0RW1pdHRlZCA9IG9wdHMuc2VlZEVtaXR0ZWRMZW5ndGhzPy5nZXQocGFydElkKSA/PyAwO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcGFydCQucmVhZChyZWFkZXIpLmNvbnRlbnQ7XG5cdFx0XHRpZiAoY29udGVudC5sZW5ndGggPD0gbGFzdEVtaXR0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVsdGEgPSBjb250ZW50LnN1YnN0cmluZyhsYXN0RW1pdHRlZCk7XG5cdFx0XHRsYXN0RW1pdHRlZCA9IGNvbnRlbnQubGVuZ3RoO1xuXHRcdFx0b3B0cy5zaW5rKFt7IGtpbmQ6ICd0aGlua2luZycsIHZhbHVlOiBkZWx0YSwgaWQ6IHBhcnRJZCB9XSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBUb29sQ2FsbFBhcnQoXG5cdFx0cGFydCQ6IElPYnNlcnZhYmxlPFRvb2xDYWxsUmVzcG9uc2VQYXJ0Pixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdFx0c3ViYWdlbnRDb250ZXh0OiBJU3ViYWdlbnRDb250ZXh0LFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBpbml0aWFsID0gcGFydCQuZ2V0KCkudG9vbENhbGw7XG5cdFx0Y29uc3QgY29udHJpYnV0b3IgPSBpbml0aWFsLmNvbnRyaWJ1dG9yO1xuXHRcdGlmIChjb250cmlidXRvcj8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50ICYmIGNvbnRyaWJ1dG9yLmNsaWVudElkID09PSB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5jbGllbnRJZCkge1xuXHRcdFx0dGhpcy5fc2V0dXBDbGllbnRUb29sQ2FsbChpbml0aWFsLCBwYXJ0JCwgc3RvcmUsIG9wdHMsIHN1YmFnZW50Q29udGV4dCk7XG5cdFx0fSBlbHNlIGlmIChjb250cmlidXRvcj8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50KSB7XG5cdFx0XHR0aGlzLl9zZXR1cE90aGVyQ2xpZW50VG9vbENhbGwoaW5pdGlhbCwgcGFydCQsIHN0b3JlLCBvcHRzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2V0dXBTZXJ2ZXJUb29sQ2FsbChpbml0aWFsLCBwYXJ0JCwgc3RvcmUsIG9wdHMsIHN1YmFnZW50Q29udGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBPdGhlckNsaWVudFRvb2xDYWxsKFxuXHRcdGluaXRpYWw6IFRvb2xDYWxsU3RhdGUsXG5cdFx0cGFydCQ6IElPYnNlcnZhYmxlPFRvb2xDYWxsUmVzcG9uc2VQYXJ0Pixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBpbml0aWFsLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgYWRvcHRlZCA9IG9wdHMuYWRvcHRJbnZvY2F0aW9ucz8uZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IGludm9jYXRpb24gPSBhZG9wdGVkID8/IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24oXG5cdFx0XHRpbml0aWFsLFxuXHRcdFx0b3B0cy5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdG9wdHMuYmFja2VuZFNlc3Npb24sXG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSxcblx0XHRcdG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSxcblx0XHRcdHRoaXMuX290aGVyQ2xpZW50VG9vbEludm9jYXRpb25PcHRpb25zKG9wdHMuYmFja2VuZFNlc3Npb24sIG9wdHMuY2hhdFVSSSwgb3B0cy50dXJuSWQpLFxuXHRcdCk7XG5cdFx0aWYgKCFhZG9wdGVkKSB7XG5cdFx0XHRvcHRzLnNpbmsoW2ludm9jYXRpb25dKTtcblx0XHR9XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbENhbGwgPSBwYXJ0JC5yZWFkKHJlYWRlcikudG9vbENhbGw7XG5cdFx0XHRpZiAoKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8IHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkKSAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKGludm9jYXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVFZGl0cyA9IGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwgdG9vbENhbGwsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0aWYgKGZpbGVFZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0b3B0cy5vbkZpbGVFZGl0cz8uKHRvb2xDYWxsLCBmaWxlRWRpdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShpbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3RoZXJDbGllbnRUb29sSW52b2NhdGlvbk9wdGlvbnMoYmFja2VuZFNlc3Npb246IFVSSSwgY2hhdFVSSTogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZyk6IElBZ2VudEhvc3RUb29sSW52b2NhdGlvbk9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjdXJyZW50Q2xpZW50SWQ6IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmNsaWVudElkLFxuXHRcdFx0Y2FuY2VsT3RoZXJDbGllbnRUb29sQ2FsbDogdG9vbENhbGwgPT4ge1xuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihiYWNrZW5kU2Vzc2lvbiwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3Qub3RoZXJDbGllbnRUb29sLnNraXBwZWQnLCBcIlNraXBwZWQgezB9XCIsIHRvb2xDYWxsLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3Qub3RoZXJDbGllbnRUb29sLnNraXBwZWRFcnJvcicsIFwiezB9IHdhcyBza2lwcGVkIGZyb20gYW5vdGhlciBjbGllbnRcIiwgdG9vbENhbGwuZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRcdFx0XHRjb2RlOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSwgY2hhdFVSSSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUGVyLWNhbGwgc2V0dXAgZm9yIGEgc2VydmVyLWRyaXZlbiB0b29sLiBBZG9wdHMgYSBzbmFwc2hvdFxuXHQgKiB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufSB3aGVuIHByZXNlbnQgKHJlY29ubmVjdCBwYXJpdHkpOyBvdGhlcndpc2Vcblx0ICogZW1pdHMgYSBmcmVzaCBvbmUuIFJlYWN0cyB0byBzdGF0dXMgdHJhbnNpdGlvbnMgZm9yIHJlLWNvbmZpcm1hdGlvbixcblx0ICogdGVybWluYWwgcmV2aXZhbCwgZmluYWxpemF0aW9uLCBhbmQgc3ViYWdlbnQgb2JzZXJ2YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zZXR1cFNlcnZlclRvb2xDYWxsKFxuXHRcdGluaXRpYWw6IFRvb2xDYWxsU3RhdGUsXG5cdFx0cGFydCQ6IElPYnNlcnZhYmxlPFRvb2xDYWxsUmVzcG9uc2VQYXJ0Pixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdFx0c3ViYWdlbnRDb250ZXh0OiBJU3ViYWdlbnRDb250ZXh0LFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gaW5pdGlhbC50b29sQ2FsbElkO1xuXHRcdGNvbnN0IHN1YkFnZW50SW52b2NhdGlvbklkID0gb3B0cy5zdWJBZ2VudEludm9jYXRpb25JZDtcblx0XHRjb25zdCBhZG9wdGVkID0gb3B0cy5hZG9wdEludm9jYXRpb25zPy5nZXQodG9vbENhbGxJZCk7XG5cdFx0bGV0IGNvbmZpcm1hdGlvbk9wdGlvbnMgPSBpbml0aWFsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiA/IGluaXRpYWwub3B0aW9ucyA6IHVuZGVmaW5lZDtcblx0XHQvLyBUb29scyB0aGF0IHN0cmVhbSB0aGVpciBhcmd1bWVudHMgKHJlbGlhYmx5OiB0ZXJtaW5hbC9iYXNoIGNvbW1hbmRzKVxuXHRcdC8vIGFyZSBmaXJzdCBvYnNlcnZlZCBpbiBgU3RyZWFtaW5nYC4gUmVwcmVzZW50IHRoZW0gd2l0aCBhIG5hdGl2ZVxuXHRcdC8vIHN0cmVhbWluZyBgQ2hhdFRvb2xJbnZvY2F0aW9uYCBhbmQgbGF0ZXIgZHJpdmUgaXQgdGhyb3VnaFxuXHRcdC8vIGB0cmFuc2l0aW9uRnJvbVN0cmVhbWluZ2AgKHNlZSB0aGUgYXV0b3J1biBiZWxvdyksIHNvIGEgc2luZ2xlIGNhcmRcblx0XHQvLyBzcGFucyB0aGUgd2hvbGUgbGlmZWN5Y2xlIGluc3RlYWQgb2YgYSBzZXR0bGVkIHBsYWNlaG9sZGVyIHBsdXMgYVxuXHRcdC8vIHNlcGFyYXRlIGNvbmZpcm1hdGlvbiBjYXJkICgjMzE0ODU4KS5cblx0XHRsZXQgaW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRcdGlmIChhZG9wdGVkKSB7XG5cdFx0XHRpbnZvY2F0aW9uID0gYWRvcHRlZDtcblx0XHR9IGVsc2UgaWYgKGluaXRpYWwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpIHtcblx0XHRcdGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uKGluaXRpYWwsIHN1YkFnZW50SW52b2NhdGlvbklkLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSwgb3B0cy5zZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5KTtcblx0XHRcdG9wdHMuc2luayhbaW52b2NhdGlvbl0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbihpbml0aWFsLCBzdWJBZ2VudEludm9jYXRpb25JZCwgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksIG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0XHRvcHRzLnNpbmsoW2ludm9jYXRpb25dKTtcblx0XHR9XG5cblx0XHQvLyBIb29rIHVwIGEgdG9vbCBmaXJzdCBvYnNlcnZlZCBhZnRlciBpdCBhbHJlYWR5IGVudGVyZWQgY29uZmlybWF0aW9uLlxuXHRcdGlmIChpbml0aWFsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKGludm9jYXRpb24pKSB7XG5cdFx0XHR0aGlzLl9hd2FpdFRvb2xDb25maXJtYXRpb24oaW52b2NhdGlvbiwgdG9vbENhbGxJZCwgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgb3B0cy50dXJuSWQsIG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4sICgpID0+IGNvbmZpcm1hdGlvbk9wdGlvbnMsIG9wdHMuY2hhdFVSSSk7XG5cdFx0fVxuXHRcdHRoaXMuX3RyeU9ic2VydmVTdWJhZ2VudFRvb2xDYWxsKGluaXRpYWwsIGludm9jYXRpb24sIHN0b3JlLCBvcHRzLCBzdWJhZ2VudENvbnRleHQpO1xuXHRcdGNvbnN0IG91dHB1dFRlcm1pbmFsQXR0YWNobWVudDogSU91dHB1dFRlcm1pbmFsQXR0YWNobWVudCA9IHtcblx0XHRcdGRpc3Bvc2FibGU6IHN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSlcblx0XHR9O1xuXG5cdFx0Ly8gUmV1c2UgdGhlIGludm9jYXRpb24gd2hlbmV2ZXIgYSB0b29sIGVudGVycyBjb25maXJtYXRpb24gdG8gYXZvaWQgZHVwbGljYXRlIGNhcmRzLlxuXHRcdGxldCBwcmV2aW91c1N0YXR1czogVG9vbENhbGxTdGF0dXMgfCB1bmRlZmluZWQgPSBpbml0aWFsLnN0YXR1cztcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBwYXJ0JC5yZWFkKHJlYWRlcikudG9vbENhbGw7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSB0Yy5zdGF0dXM7XG5cdFx0XHRjb25zdCBwcmlvclN0YXR1cyA9IHByZXZpb3VzU3RhdHVzO1xuXHRcdFx0aWYgKHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRjb25maXJtYXRpb25PcHRpb25zID0gdGMub3B0aW9ucztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudGVyaW5nQ29uZmlybWF0aW9uID0gc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uXG5cdFx0XHRcdCYmIHByZXZpb3VzU3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uO1xuXHRcdFx0cHJldmlvdXNTdGF0dXMgPSBzdGF0dXM7XG5cblx0XHRcdGlmIChzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZykge1xuXHRcdFx0XHR1cGRhdGVTdHJlYW1pbmdUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB0YywgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0fSBlbHNlIGlmIChlbnRlcmluZ0NvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRpZiAoIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShpbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IHByZXBhcmVkID0gdG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uKHRjLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSwgb3B0cy5zZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5KTtcblx0XHRcdFx0XHRpbnZvY2F0aW9uLnJlcXVlc3RDb25maXJtYXRpb24ocHJlcGFyZWQpO1xuXHRcdFx0XHRcdHRoaXMuX2F3YWl0VG9vbENvbmZpcm1hdGlvbihpbnZvY2F0aW9uLCB0b29sQ2FsbElkLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCBvcHRzLnR1cm5JZCwgb3B0cy5jYW5jZWxsYXRpb25Ub2tlbiwgKCkgPT4gY29uZmlybWF0aW9uT3B0aW9ucywgb3B0cy5jaGF0VVJJKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pIHtcblx0XHRcdFx0aW52b2NhdGlvbi51cGRhdGVDb25maXJtYXRpb25NZXNzYWdlcyh0b29sQ2FsbENvbmZpcm1hdGlvbk1lc3NhZ2VzKHRjLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSkpO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0XHR0aGlzLl9lbnN1cmVMZWZ0U3RyZWFtaW5nKGludm9jYXRpb24sIHRjLCBvcHRzKTtcblx0XHRcdFx0aW52b2NhdGlvbi5zZXRBdXRoZW50aWNhdGlvblJlcXVpcmVkKHRvb2xDYWxsQXV0aGVudGljYXRpb25TZXJ2ZXIodGMsIG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSksICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihvcHRzLmJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdFx0dHVybklkOiBvcHRzLnR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwVG9vbEF1dGhlbnRpY2F0aW9uLmNhbmNlbGxlZCcsIFwiQ2FuY2VsbGVkIHRvb2wgY2FsbFwiKSxcblx0XHRcdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogbG9jYWxpemUoJ2FnZW50SG9zdC5tY3BUb29sQXV0aGVudGljYXRpb24uY2FuY2VsbGVkRXJyb3InLCBcIk1DUCBhdXRoZW50aWNhdGlvbiB3YXMgY2FuY2VsbGVkXCIpLCBjb2RlOiAnY2FuY2VsbGVkJyB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LCBvcHRzLmNoYXRVUkkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIHx8IHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRpZiAocHJpb3JTdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0XHRcdGludm9jYXRpb24uc2V0QXV0aGVudGljYXRpb25SZXNvbHZlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZUxlZnRTdHJlYW1pbmcoaW52b2NhdGlvbiwgdGMsIG9wdHMpO1xuXHRcdFx0XHRpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlID0gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLmludm9jYXRpb25NZXNzYWdlLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdHRoaXMuX3Jldml2ZVRlcm1pbmFsSWZOZWVkZWQoaW52b2NhdGlvbiwgdGMsIG9wdHMuYmFja2VuZFNlc3Npb24sIG91dHB1dFRlcm1pbmFsQXR0YWNobWVudCk7XG5cdFx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHRjLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3RyeU9ic2VydmVTdWJhZ2VudFRvb2xDYWxsKHRjLCBpbnZvY2F0aW9uLCBzdG9yZSwgb3B0cywgc3ViYWdlbnRDb250ZXh0KTtcblxuXHRcdFx0aWYgKChzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCkgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShpbnZvY2F0aW9uKSkge1xuXHRcdFx0XHQvLyBEZXRhY2ggbGl2ZSBub24tUFRZIG91dHB1dCBiZWZvcmUgY29tcGxldGlvbiBzeW5jaHJvbm91c2x5IHJlYnVpbGRzIHRoZSB0ZXJtaW5hbCBzdWJwYXJ0LlxuXHRcdFx0XHRpZiAoc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9lbnN1cmVMZWZ0U3RyZWFtaW5nKGludm9jYXRpb24sIHRjLCBvcHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZXZpdmVUZXJtaW5hbElmTmVlZGVkKGludm9jYXRpb24sIHRjLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCBvdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQpO1xuXHRcdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHRjLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdGlmIChmaWxlRWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdG9wdHMub25GaWxlRWRpdHM/Lih0YywgZmlsZUVkaXRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIElmIHRoZSB0dXJuIGVuZHMgd2l0aCB0aGUgdG9vbCBzdGlsbCBtaWQtZmxpZ2h0IChlLmcuIGV4dGVybmFsXG5cdFx0Ly8gY2FuY2VsbGF0aW9uKSwgc2V0dGxlIHRoZSBpbnZvY2F0aW9uIHNvIHRoZSBVSSBkb2VzIG5vdCBnZXQgc3R1Y2suXG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShpbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIFRyYW5zaXRpb25zIGFuIGludm9jYXRpb24gZnJvbSBzdHJlYW1pbmcgb25jZSBpdHMgQUhQIHRvb2wgY2FsbCBpcyByZWFkeS4gKi9cblx0cHJpdmF0ZSBfZW5zdXJlTGVmdFN0cmVhbWluZyhcblx0XHRpbnZvY2F0aW9uOiBDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0dGM6IFRvb2xDYWxsU3RhdGUsXG5cdFx0b3B0czogSU9ic2VydmVUdXJuT3B0aW9ucyxcblx0KTogdm9pZCB7XG5cdFx0aWYgKGludm9jYXRpb24uc3RhdGUucmVhZCh1bmRlZmluZWQpLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmVwYXJlZCA9IHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbih0Yywgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksIG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0aW52b2NhdGlvbi50cmFuc2l0aW9uRnJvbVN0cmVhbWluZyhwcmVwYXJlZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9ic2VydmVzIHRoZSBjaGlsZCBjaGF0IGZvciBhbnkgc3ViYWdlbnQtc3Bhd25pbmcgdG9vbCwgaW5jbHVkaW5nIGNsaWVudC1wcm92aWRlZCBkZWxlZ2F0ZWQgdGFza3MuXG5cdCAqL1xuXHRwcml2YXRlIF90cnlPYnNlcnZlU3ViYWdlbnRUb29sQ2FsbChcblx0XHR0b29sQ2FsbDogVG9vbENhbGxTdGF0ZSxcblx0XHRpbnZvY2F0aW9uOiBDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHRcdHN1YmFnZW50Q29udGV4dDogSVN1YmFnZW50Q29udGV4dCxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHRvb2xDYWxsLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgaGFzU3ViYWdlbnRDb250ZW50ID0gKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyB8fCB0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZClcblx0XHRcdCYmICEhZ2V0VG9vbFN1YmFnZW50Q29udGVudCh0b29sQ2FsbCk7XG5cdFx0aWYgKCFpc1N1YmFnZW50VG9vbCh0b29sQ2FsbCkgJiYgIWhhc1N1YmFnZW50Q29udGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzT2JzZXJ2ZWQgPSBzdWJhZ2VudENvbnRleHQub2JzZXJ2ZWRUb29sSWRzLmhhcyh0b29sQ2FsbElkKTtcblx0XHRjb25zdCBjdXJyZW50RGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmVwYXJlZCA9IHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbih0b29sQ2FsbCwgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksIG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0Y29uc3QgcHJvdG9jb2xEYXRhID0gcHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IHByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGEgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFwcm90b2NvbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gcHJvdG9jb2xEYXRhLmNoYXRSZXNvdXJjZSA/PyBjdXJyZW50RGF0YT8uY2hhdFJlc291cmNlO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcHJvdG9jb2xEYXRhLmRlc2NyaXB0aW9uID8/IGN1cnJlbnREYXRhPy5kZXNjcmlwdGlvbjtcblx0XHRjb25zdCBhZ2VudE5hbWUgPSBwcm90b2NvbERhdGEuYWdlbnROYW1lID8/IGN1cnJlbnREYXRhPy5hZ2VudE5hbWU7XG5cdFx0aWYgKCFjdXJyZW50RGF0YVxuXHRcdFx0fHwgY3VycmVudERhdGEuY2hhdFJlc291cmNlICE9PSBjaGF0UmVzb3VyY2Vcblx0XHRcdHx8IGN1cnJlbnREYXRhLmRlc2NyaXB0aW9uICE9PSBkZXNjcmlwdGlvblxuXHRcdFx0fHwgY3VycmVudERhdGEuYWdlbnROYW1lICE9PSBhZ2VudE5hbWUpIHtcblx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0Li4uY3VycmVudERhdGEsXG5cdFx0XHRcdC4uLnByb3RvY29sRGF0YSxcblx0XHRcdFx0Y2hhdFJlc291cmNlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0YWdlbnROYW1lLFxuXHRcdFx0XHRpc0FjdGl2ZTogY3VycmVudERhdGE/LmlzQWN0aXZlID8/IGlzT2JzZXJ2ZWQsXG5cdFx0XHR9O1xuXHRcdFx0aW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdH1cblxuXHRcdGlmIChpc09ic2VydmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0b29sQ2FsbC5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgJiYgdG9vbENhbGwuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdWJhZ2VudERhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0aWYgKHN1YmFnZW50RGF0YT8ua2luZCAhPT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdWJhZ2VudENvbnRleHQub2JzZXJ2ZWRUb29sSWRzLmFkZCh0b29sQ2FsbElkKTtcblx0XHRzdWJhZ2VudERhdGEuaXNBY3RpdmUgPSB0cnVlO1xuXHRcdGludm9jYXRpb24ubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblxuXHRcdGNvbnN0IHBlckludm9jYXRpb25DcmVkaXRzID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4oJ3N1YmFnZW50SW52b2NhdGlvbkNyZWRpdHMnLCAwKTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdG90YWwgPSBwZXJJbnZvY2F0aW9uQ3JlZGl0cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodG90YWwgPiAwICYmIGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyAmJiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyAhPT0gdG90YWwpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgPSB0b3RhbDtcblx0XHRcdFx0aW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBlckludm9jYXRpb25Nb2RlbCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdzdWJhZ2VudEludm9jYXRpb25Nb2RlbCcsIHVuZGVmaW5lZCk7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsTmFtZSA9IHBlckludm9jYXRpb25Nb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAobW9kZWxOYW1lICYmIGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyAmJiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lICE9PSBtb2RlbE5hbWUpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSA9IG1vZGVsTmFtZTtcblx0XHRcdFx0aW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJvb3RJbnZvY2F0aW9uSWQgPSBvcHRzLnN1YkFnZW50SW52b2NhdGlvbklkID8/IHRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgY2hpbGRDaGF0VXJpID0gc3ViYWdlbnREYXRhLmNoYXRSZXNvdXJjZVxuXHRcdFx0fHwgYnVpbGRTdWJhZ2VudENoYXRVcmkob3B0cy5iYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCB0b29sQ2FsbElkKTtcblx0XHR0aGlzLl9vYnNlcnZlU3ViYWdlbnRTZXNzaW9uKG9wdHMuc2Vzc2lvblJlc291cmNlLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCB0b29sQ2FsbElkLCBjaGlsZENoYXRVcmksIHJvb3RJbnZvY2F0aW9uSWQsIGludm9jYXRpb24sIG9wdHMuc2luaywgc3RvcmUsIHN1YmFnZW50Q29udGV4dCwgcGVySW52b2NhdGlvbkNyZWRpdHMsIHBlckludm9jYXRpb25Nb2RlbCk7XG5cdH1cblxuXHQvKipcblx0ICogUGVyLWNhbGwgc2V0dXAgZm9yIGEgY2xpZW50LXByb3ZpZGVkIHRvb2wuIEVhZ2VybHkgY3JlYXRlcyBhIHN0cmVhbWluZ1xuXHQgKiB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufSBzbyB0aGUgVUkgaGFzIGEgaGFuZGxlLCB0aGVuIGludm9rZXMgdGhlXG5cdCAqIHRvb2wgb25jZSBwYXJhbWV0ZXJzIGFyZSBhdmFpbGFibGUuIFRoZSBpbm5lciBhdXRvcnVuIG9uIGBwYXJ0JGAgaXNcblx0ICogaWRlbXBvdGVudDogYGludm9rZWRgIGVuc3VyZXMgYGludm9rZVRvb2xgIHJ1bnMgYXQgbW9zdCBvbmNlLFxuXHQgKiBgY29uZmlybWF0aW9uRGlzcGF0Y2hlZGAgZW5zdXJlcyBgQ2hhdFRvb2xDYWxsQ29uZmlybWVkYCBpcyBzZW50IGF0XG5cdCAqIG1vc3Qgb25jZS5cblx0ICovXG5cdHByaXZhdGUgX3NldHVwQ2xpZW50VG9vbENhbGwoXG5cdFx0aW5pdGlhbDogVG9vbENhbGxTdGF0ZSxcblx0XHRwYXJ0JDogSU9ic2VydmFibGU8VG9vbENhbGxSZXNwb25zZVBhcnQ+LFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0b3B0czogSU9ic2VydmVUdXJuT3B0aW9ucyxcblx0XHRzdWJhZ2VudENvbnRleHQ6IElTdWJhZ2VudENvbnRleHQsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBpbml0aWFsLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgdG9vbE5hbWUgPSBpbml0aWFsLnRvb2xOYW1lO1xuXG5cdFx0Ly8gUmVjb25uZWN0IGFkb3B0aW9uOiBzZXR0bGUgYW55IHNuYXBzaG90IGludm9jYXRpb24gc28gdGhlIG5ld1xuXHRcdC8vIHN0cmVhbWluZyBvbmUgY3JlYXRlZCBieSBgYmVnaW5Ub29sQ2FsbGAgY2FuIHRha2Ugb3ZlciB0aGUgVUlcblx0XHQvLyBzbG90IHJhdGhlciB0aGFuIGxlYXZpbmcgdGhlIG9sZCBpbnN0YW5jZSBvcnBoYW5lZC5cblx0XHRjb25zdCBhZG9wdGVkID0gb3B0cy5hZG9wdEludm9jYXRpb25zPy5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKGFkb3B0ZWQgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShhZG9wdGVkKSkge1xuXHRcdFx0YWRvcHRlZC5kaWRFeGVjdXRlVG9vbCh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsaWVudFRvb2xOYW1lID0gdG9vbE5hbWUgPT09IFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FID8gQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FIDogdG9vbE5hbWU7XG5cdFx0Y29uc3QgdG9vbERhdGEgPSB0aGlzLl90b29sc1NlcnZpY2UuZ2V0VG9vbEJ5TmFtZShjbGllbnRUb29sTmFtZSk7XG5cdFx0aWYgKCF0b29sRGF0YSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBDbGllbnQgdG9vbCBjYWxsIGZvciB1bmtub3duIHRvb2w6ICR7dG9vbE5hbWV9YCk7XG5cdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihvcHRzLmJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogb3B0cy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGBUb29sIFwiJHt0b29sTmFtZX1cIiBpcyBub3QgYXZhaWxhYmxlYCxcblx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiBgVG9vbCBcIiR7dG9vbE5hbWV9XCIgaXMgbm90IGF2YWlsYWJsZSBvbiB0aGlzIGNsaWVudGAgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIG9wdHMuY2hhdFVSSSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGludm9jYXRpb24gPSB0aGlzLl90b29sc1NlcnZpY2UuYmVnaW5Ub29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0dG9vbElkOiB0b29sRGF0YS5pZCxcblx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiBvcHRzLnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBvcHRzLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGZvcmNlOiB0cnVlLFxuXHRcdH0pIGFzIENoYXRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICghaW52b2NhdGlvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gYmVnaW4gY2xpZW50IHRvb2wgaW52b2NhdGlvbjogJHt0b29sTmFtZX1gKTtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKG9wdHMuYmFja2VuZFNlc3Npb24sIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiBvcHRzLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogYEZhaWxlZCB0byBzdGFydCAke3Rvb2xOYW1lfWAsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogYENvdWxkIG5vdCBjcmVhdGUgaW52b2NhdGlvbiBmb3IgY2xpZW50IHRvb2wgXCIke3Rvb2xOYW1lfVwiYCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgb3B0cy5jaGF0VVJJKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNTdWJhZ2VudFRvb2woaW5pdGlhbCkpIHtcblx0XHRcdGNvbnN0IHByZXBhcmVkID0gdG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uKGluaXRpYWwsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdFx0aWYgKHByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0gcHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdHJ5T2JzZXJ2ZVN1YmFnZW50VG9vbENhbGwoaW5pdGlhbCwgaW52b2NhdGlvbiwgc3RvcmUsIG9wdHMsIHN1YmFnZW50Q29udGV4dCk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRsZXQgaW52b2tlZCA9IGZhbHNlO1xuXHRcdGxldCBhcHByb3ZlZERpc3BhdGNoZWQgPSBmYWxzZTtcblx0XHRsZXQgY29uZmlybWF0aW9uRGlzcGF0Y2hlZCA9IGZhbHNlO1xuXG5cdFx0Ly8gRHJpdmUgYENoYXRUb29sQ2FsbENvbmZpcm1lZGAgZnJvbSB0aGUgaW52b2NhdGlvbidzIGNvbmZpcm1hdGlvblxuXHRcdC8vIGdhdGUuIFRoZSBhdXRvcnVuIHJ1bnMgc3luY2hyb25vdXNseSBtYW55IHRpbWVzOyB0aGUgZ3VhcmRzIGtlZXAgaXRcblx0XHQvLyBpZGVtcG90ZW50LlxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgdGMgPSBwYXJ0JC5yZWFkKHJlYWRlcikudG9vbENhbGw7XG5cdFx0XHRjb25zdCBwcmVBcHByb3ZhbCA9IGdldENsaWVudFRvb2xQcmVBcHByb3ZhbCh0Yyk7XG5cdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJiBwcmVBcHByb3ZhbCkge1xuXHRcdFx0XHRzdGF0ZS5jb25maXJtKHByZUFwcHJvdmFsKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbmZpcm1hdGlvbkRpc3BhdGNoZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykge1xuXHRcdFx0XHRjb25maXJtYXRpb25EaXNwYXRjaGVkID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhcHByb3ZlZERpc3BhdGNoZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihvcHRzLmJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0dHVybklkOiBvcHRzLnR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogY29uZmlybWVkUmVhc29uVG9Qcm90b2NvbChzdGF0ZS5jb25maXJtZWQpLFxuXHRcdFx0XHR9LCBvcHRzLmNoYXRVUkkpO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQpIHtcblx0XHRcdFx0Ly8gUHJlLWV4ZWN1dGlvbiBjYW5jZWxsYXRpb24uIElmIHRoZSBzZXJ2ZXIgYWxyZWFkeSBrbm93c1xuXHRcdFx0XHQvLyAoY3RzIGNhbmNlbGxlZCksIHN1cHByZXNzIHRoZSBkaXNwYXRjaCBcdTIwMTQgdGhlIHNlcnZlclxuXHRcdFx0XHQvLyB0cmFuc2l0aW9uZWQgdGhlIGNhbGwgaXRzZWxmLlxuXHRcdFx0XHRjb25maXJtYXRpb25EaXNwYXRjaGVkID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihvcHRzLmJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0dHVybklkOiBvcHRzLnR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdGFwcHJvdmVkOiBmYWxzZSxcblx0XHRcdFx0XHRyZWFzb246IFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLkRlbmllZCxcblx0XHRcdFx0fSwgb3B0cy5jaGF0VVJJKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBoYW5kbGVTZXR0bGVkID0gKHJlc3VsdDogSVRvb2xSZXN1bHQgfCB1bmRlZmluZWQsIGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlcnIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdGlmICghYXBwcm92ZWREaXNwYXRjaGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIENsaWVudCB0b29sIHJlamVjdGVkIHByZS1leGVjdXRpb246ICR7dG9vbE5hbWV9YCwgZXJyKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBDbGllbnQgdG9vbCBpbnZvY2F0aW9uIGZhaWxlZDogJHt0b29sTmFtZX1gLCBlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdCA9IHsgY29udGVudDogW10sIHRvb2xSZXN1bHRFcnJvcjogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb3RvY29sVG9vbENhbGwgPSBwYXJ0JC5nZXQoKS50b29sQ2FsbDtcblx0XHRcdGNvbnN0IGlzUHJvdG9jb2xUb29sQ2FsbENvbXBsZXRlID0gcHJvdG9jb2xUb29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCBwcm90b2NvbFRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkO1xuXHRcdFx0aWYgKCFpc1Byb3RvY29sVG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0XHQvLyBUaGUgdG9vbC1zZWFyY2ggcmVhZHkgYWN0aW9uIHN0YXNoZXMgdGhlIChwb3RlbnRpYWxseSBsYXJnZSlcblx0XHRcdFx0Ly8gZGVmZXJyZWQtdG9vbCBjb3JwdXMgaW4gYF9tZXRhLnRvb2xTZWFyY2hDYW5kaWRhdGVzYCBwdXJlbHkgdG9cblx0XHRcdFx0Ly8gc2VlZCB0aGlzIGludm9jYXRpb24uIFRoZSBjb21wbGV0aW9uIHJlZHVjZXIga2VlcHMgdGhlIHByaW9yXG5cdFx0XHRcdC8vIGBfbWV0YWAgd2hlbiB0aGUgYWN0aW9uIG9taXRzIG9uZSwgc28gd2l0aG91dCBhbiBleHBsaWNpdFxuXHRcdFx0XHQvLyByZXBsYWNlbWVudCB0aGUgY29ycHVzIHdvdWxkIHBlcnNpc3Qgb24gdGhlIGNvbXBsZXRlZCBjYWxsIGFuZFxuXHRcdFx0XHQvLyBhY3Jvc3MgcmVjb25uZWN0cy4gQ2FycnkgYSBjYW5kaWRhdGUtc3RyaXBwZWQgYF9tZXRhYCBvbiB0aGVcblx0XHRcdFx0Ly8gdG9vbC1zZWFyY2ggY29tcGxldGlvbiB0byBkcm9wIGl0IG9uY2UgdGhlIHNlYXJjaCBoYXMgcnVuLlxuXHRcdFx0XHRjb25zdCBjbGVhcmVkTWV0YSA9IHRvb2xOYW1lID09PSBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRVxuXHRcdFx0XHRcdD8gbWV0YVdpdGhvdXRUb29sU2VhcmNoQ2FuZGlkYXRlcyhwcm90b2NvbFRvb2xDYWxsKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihvcHRzLmJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0XHR0dXJuSWQ6IG9wdHMudHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB0b29sUmVzdWx0VG9Qcm90b2NvbChyZXN1bHQgPz8geyBjb250ZW50OiBbXSB9LCB0b29sTmFtZSksXG5cdFx0XHRcdFx0Li4uKGNsZWFyZWRNZXRhICE9PSB1bmRlZmluZWQgPyB7IF9tZXRhOiBjbGVhcmVkTWV0YSB9IDoge30pLFxuXHRcdFx0XHR9LCBvcHRzLmNoYXRVUkkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBSZWFjdCB0byBwYXJ0JCB1cGRhdGVzOiByb3V0ZSBleHRlcm5hbCBjYW5jZWxsYXRpb24sIGFuZCB0cnkgdG9cblx0XHQvLyBpbnZva2Ugb25jZSBwYXJhbWV0ZXJzIGFyZSBwcmVzZW50LiBJZGVtcG90ZW50IHZpYSBgaW52b2tlZGAgYW5kXG5cdFx0Ly8gYGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZGAuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHRjID0gcGFydCQucmVhZChyZWFkZXIpLnRvb2xDYWxsO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBpbnZvY2F0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3RyeU9ic2VydmVTdWJhZ2VudFRvb2xDYWxsKHRjLCBpbnZvY2F0aW9uLCBzdG9yZSwgb3B0cywgc3ViYWdlbnRDb250ZXh0KTtcblx0XHRcdGNvbnN0IHByZUFwcHJvdmFsID0gZ2V0Q2xpZW50VG9vbFByZUFwcHJvdmFsKHRjKTtcblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmIHByZUFwcHJvdmFsKSB7XG5cdFx0XHRcdHN0YXRlLmNvbmZpcm0ocHJlQXBwcm92YWwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRcdC8vIFRoZSBwcm90b2NvbCB0b29sIGNhbGwgcmVhY2hlZCBhIHRlcm1pbmFsIHN0YXRlLiBJZiB0aGlzIHdhc1xuXHRcdFx0XHQvLyBkcml2ZW4gYnkgdGhlIHNlcnZlciAoZS5nLiB0aGUgY2xpZW50LXRvb2wgYnJpZGdlIGFiYW5kb25lZCB0aGVcblx0XHRcdFx0Ly8gY2FsbCBiZWNhdXNlIHRoZSBjbGllbnQgd2FzIGNvbnNpZGVyZWQgZGlzY29ubmVjdGVkLCB0aGUgdHVybiB3YXNcblx0XHRcdFx0Ly8gc3VwZXJzZWRlZCwgb3IgYSByZWNvbm5lY3Qgb2NjdXJyZWQpIHdoaWxlIG91ciBsb2NhbCBgaW52b2tlVG9vbGBcblx0XHRcdFx0Ly8gaXMgc3RpbGwgcnVubmluZywgY2FuY2VsIGl0IHNvIHRoZSB0b29sIGNsZWFucyB1cCAoZS5nLiBkaXNtaXNzZXMgYVxuXHRcdFx0XHQvLyBwZW5kaW5nIHF1ZXN0aW9uIGNhcm91c2VsKSBpbnN0ZWFkIG9mIGJsb2NraW5nIGZvcmV2ZXIgb24gYW4gYW5zd2VyXG5cdFx0XHRcdC8vIG5vYm9keSB3aWxsIGNvbnN1bWUuIEluIHRoZSBub3JtYWwgcGF0aCB3ZSBjb21wbGV0ZSB0aGUgY2FsbFxuXHRcdFx0XHQvLyBvdXJzZWx2ZXMgZmlyc3QsIHNvIGBpbnZva2VUb29sYCBoYXMgYWxyZWFkeSBzZXR0bGVkIGFuZCB0aGlzXG5cdFx0XHRcdC8vIGNhbmNlbGxhdGlvbiBpcyBhIGhhcm1sZXNzIG5vLW9wLlxuXHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZUVkaXRzID0gZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB0Yywgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0XHRcdGlmIChmaWxlRWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0b3B0cy5vbkZpbGVFZGl0cz8uKHRjLCBmaWxlRWRpdHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0aWYgKCFpbnZva2VkICYmIHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkICYmIHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0XHRcdC8vIE5vIGBpbnZva2VUb29sYCBpcyBsaXN0ZW5pbmcgdG8gdGhlIENUUyBcdTIwMTQgdHJhbnNpdGlvblxuXHRcdFx0XHRcdC8vIHRoZSBpbnZvY2F0aW9uIHRvIGBDYW5jZWxsZWRgIG91cnNlbHZlcy5cblx0XHRcdFx0XHRpbnZvY2F0aW9uLmNhbmNlbEZyb21TdHJlYW1pbmcoVG9vbENvbmZpcm1LaW5kLlNraXBwZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpbnZva2VkIHx8IGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0b29sU2VhcmNoQ2FuZGlkYXRlcyA9IHRvb2xOYW1lID09PSBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRVxuXHRcdFx0XHQ/IHJlYWRUb29sQ2FsbE1ldGEodGMpLnRvb2xTZWFyY2hDYW5kaWRhdGVzXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRvb2xOYW1lID09PSBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSAmJiB0b29sU2VhcmNoQ2FuZGlkYXRlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWluLW9wZXJhdG9yXG5cdFx0XHRsZXQgdG9vbElucHV0ID0gJ3Rvb2xJbnB1dCcgaW4gdGMgPyB0Yy50b29sSW5wdXQgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodG9vbElucHV0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gU3RpbGwgc3RyZWFtaW5nIFx1MjAxNCBwYXJhbWV0ZXJzIG1heSBzdGlsbCBiZSBhcnJpdmluZy4gT25jZVxuXHRcdFx0XHQvLyB3ZSBtb3ZlIHBhc3QgU3RyZWFtaW5nLCB0cmVhdCBhIG1pc3NpbmcgdG9vbElucHV0IGFzIGB7fWBcblx0XHRcdFx0Ly8gc28gemVyby1hcmd1bWVudCB0b29scyBhcmUgbm90IHN0dWNrLlxuXHRcdFx0XHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9vbElucHV0ID0gJ3t9Jztcblx0XHRcdH1cblx0XHRcdGludm9rZWQgPSB0cnVlO1xuXG5cdFx0XHRsZXQgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZDogdW5rbm93biA9IEpTT04ucGFyc2UodG9vbElucHV0KTtcblx0XHRcdFx0aWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZCAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdleHBlY3RlZCBKU09OIG9iamVjdCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBhcmFtZXRlcnMgPSBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gcGFyc2UgdG9vbCBpbnB1dCBmb3IgJHt0b29sTmFtZX1gKTtcblx0XHRcdFx0Y29uc3QgY2xlYXJlZE1ldGEgPSB0b29sTmFtZSA9PT0gUlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUVcblx0XHRcdFx0XHQ/IG1ldGFXaXRob3V0VG9vbFNlYXJjaENhbmRpZGF0ZXModGMpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKG9wdHMuYmFja2VuZFNlc3Npb24sIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdHR1cm5JZDogb3B0cy50dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogYEZhaWxlZCB0byBleGVjdXRlICR7dG9vbE5hbWV9YCxcblx0XHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6IGBJbnZhbGlkIHRvb2wgaW5wdXQgZm9yIFwiJHt0b29sTmFtZX1cIjogZXhwZWN0ZWQgSlNPTiBvYmplY3QgcGFyYW1ldGVyc2AgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdC4uLihjbGVhcmVkTWV0YSAhPT0gdW5kZWZpbmVkID8geyBfbWV0YTogY2xlYXJlZE1ldGEgfSA6IHt9KSxcblx0XHRcdFx0fSwgb3B0cy5jaGF0VVJJKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRvb2xTZWFyY2hDYW5kaWRhdGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFyYW1ldGVycyA9IHsgLi4ucGFyYW1ldGVycywgY2FuZGlkYXRlVG9vbHM6IHRvb2xTZWFyY2hDYW5kaWRhdGVzIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGludjogSVRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHRjYWxsSWQ6IHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xJZDogaW52b2NhdGlvbi50b29sSWQsXG5cdFx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbnRleHQ6IHsgc2Vzc2lvblJlc291cmNlOiBvcHRzLnNlc3Npb25SZXNvdXJjZSB9LFxuXHRcdFx0XHRjaGF0U3RyZWFtVG9vbENhbGxJZDogdG9vbENhbGxJZCxcblx0XHRcdFx0Ly8gSWYgdGhlIGFnZW50IGhvc3QgYWxyZWFkeSByZXNvbHZlZCBhdXRvLWFwcHJvdmFsIGZvciB0aGlzIGNhbGwsXG5cdFx0XHRcdC8vIHBhc3MgaXQgdGhyb3VnaCBzbyB0aGUgaW52b2NhdGlvbiB0cmFuc2l0aW9ucyBzdHJhaWdodCB0b1xuXHRcdFx0XHQvLyBleGVjdXRpbmcgaW5zdGVhZCBvZiBicmllZmx5IGZsYXNoaW5nIGEgY29uZmlybWF0aW9uIHByb21wdFxuXHRcdFx0XHQvLyAod2hpY2ggd291bGQgZmxpY2tlciBcIm5lZWRzIGlucHV0XCIgaW4gdGhlIHNlc3Npb25zIGxpc3QpLlxuXHRcdFx0XHRwcmVBcHByb3ZlZDogZ2V0Q2xpZW50VG9vbFByZUFwcHJvdmFsKHRjKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBub09wQ291bnRUb2tlbnMgPSBhc3luYyAoKSA9PiAwO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0XSBJbnZva2luZyBjbGllbnQgdG9vbDogJHt0b29sTmFtZX0gKGNhbGxJZD0ke3Rvb2xDYWxsSWR9KWApO1xuXHRcdFx0dGhpcy5fdG9vbHNTZXJ2aWNlLmludm9rZVRvb2woaW52LCBub09wQ291bnRUb2tlbnMsIGN0cy50b2tlbikudGhlbihcblx0XHRcdFx0cmVzdWx0ID0+IGhhbmRsZVNldHRsZWQocmVzdWx0LCB1bmRlZmluZWQpLFxuXHRcdFx0XHRlcnIgPT4gaGFuZGxlU2V0dGxlZCh1bmRlZmluZWQsIGVyciksXG5cdFx0XHQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwSW5wdXRSZXF1ZXN0UGFydChcblx0XHRwYXJ0JDogSU9ic2VydmFibGU8SW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0Pixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0UmVxID0gcGFydCQuZ2V0KCkucmVxdWVzdDtcblx0XHRjb25zdCBwbGFuUmV2aWV3ID0gKGlucHV0UmVxIGFzIENoYXRJbnB1dFJlcXVlc3RXaXRoUGxhblJldmlldykucGxhblJldmlldztcblx0XHRpZiAocGxhblJldmlldykge1xuXHRcdFx0dGhpcy5fc2V0dXBQbGFuUmV2aWV3SW5wdXRSZXF1ZXN0KHBhcnQkLCBwbGFuUmV2aWV3LCBzdG9yZSwgb3B0cyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlucHV0UmVxLnVybCkge1xuXHRcdFx0dGhpcy5fc2V0dXBVcmxJbnB1dFJlcXVlc3QocGFydCQsIGlucHV0UmVxLnVybCwgc3RvcmUsIG9wdHMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlSW5wdXRSZXF1ZXN0Q2Fyb3VzZWwoaW5wdXRSZXEsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRvcHRzLnNpbmsoW2Nhcm91c2VsXSk7XG5cblx0XHRsZXQgY29tcGxldGVkRnJvbVNlcnZlciA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcGFydCQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHBhcnQucmVzcG9uc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21wbGV0ZWRGcm9tU2VydmVyID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHByb3RvY29sQW5zd2VycyA9IHBhcnQucmVzcG9uc2UgPT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHRcblx0XHRcdFx0PyBwYXJ0LnJlcXVlc3QuYW5zd2Vyc1xuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGNhcm91c2VsQW5zd2VycyA9IGNvbnZlcnRQcm90b2NvbEFuc3dlcnMocHJvdG9jb2xBbnN3ZXJzKTtcblx0XHRcdGNvbnN0IHdhc1VzZWQgPSBjYXJvdXNlbC5pc1VzZWQ7XG5cdFx0XHRjYXJvdXNlbC5kYXRhID0gY2Fyb3VzZWxBbnN3ZXJzID8/IHt9O1xuXHRcdFx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblx0XHRcdGNhcm91c2VsLmFuc3dlcmVkRXh0ZXJuYWxseSA9IHBhcnQucmVzcG9uc2UgPT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQgJiYgIWNhcm91c2VsQW5zd2Vycztcblx0XHRcdGNhcm91c2VsLmF1dG9SZXBseSA9IGNvbnRhaW5zQXV0b21hdGljUmVwbHlBbnN3ZXIocHJvdG9jb2xBbnN3ZXJzKTtcblx0XHRcdGNhcm91c2VsLmFuc3dlcmVkRXh0ZXJuYWxseSB8fD0gY2Fyb3VzZWwuYXV0b1JlcGx5O1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRBbnN3ZXJzID0gdW5kZWZpbmVkO1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0XHRjYXJvdXNlbC5kcmFmdENvbGxhcHNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiBjYXJvdXNlbEFuc3dlcnMgfSk7XG5cdFx0XHRpZiAoIXdhc1VzZWQpIHtcblx0XHRcdFx0dGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uob3B0cy5zZXNzaW9uUmVzb3VyY2UpPy5pbnB1dC5jbGVhclF1ZXN0aW9uQ2Fyb3VzZWwodW5kZWZpbmVkLCBpbnB1dFJlcS5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5wLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkIHx8IGNvbXBsZXRlZEZyb21TZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZXN1bHQuYW5zd2Vycykge1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChvcHRzLmNoYXRVUkksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6IGlucHV0UmVxLmlkLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFuc3dlcnMgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHJlc3VsdC5hbnN3ZXJzLCBpbnB1dFJlcS5xdWVzdGlvbnMpO1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChvcHRzLmNoYXRVUkksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6IGlucHV0UmVxLmlkLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0XHRcdGFuc3dlcnMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiB1bmRlZmluZWQgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRva2VuTGlzdGVuZXIgPSBvcHRzLmNhbmNlbGxhdGlvblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5jb21wbGV0ZSh7IGFuc3dlcnM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5wLmZpbmFsbHkoKCkgPT4gdG9rZW5MaXN0ZW5lci5kaXNwb3NlKCkpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKGNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjYXJvdXNlbC5kYXRhID0ge307XG5cdFx0XHRjYXJvdXNlbC5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRBbnN3ZXJzID0gdW5kZWZpbmVkO1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0XHRjYXJvdXNlbC5kcmFmdENvbGxhcHNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShvcHRzLnNlc3Npb25SZXNvdXJjZSk/LmlucHV0LmNsZWFyUXVlc3Rpb25DYXJvdXNlbCh1bmRlZmluZWQsIGlucHV0UmVxLmlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFBsYW5SZXZpZXdJbnB1dFJlcXVlc3QoXG5cdFx0cGFydCQ6IElPYnNlcnZhYmxlPElucHV0UmVxdWVzdFJlc3BvbnNlUGFydD4sXG5cdFx0cGxhblJldmlldzogSUFnZW50SG9zdFBsYW5SZXZpZXcsXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dFJlcSA9IHBhcnQkLmdldCgpLnJlcXVlc3Q7XG5cdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlSW5wdXRSZXF1ZXN0UGxhblJldmlldyhpbnB1dFJlcSwgcGxhblJldmlldyk7XG5cdFx0b3B0cy5zaW5rKFtyZXZpZXddKTtcblxuXHRcdGxldCBpbnB1dENvbXBsZXRlZCA9IGZhbHNlO1xuXHRcdGxldCBsYXRlc3RSZXN1bHQ6IElDaGF0UGxhblJldmlld1Jlc3VsdCB8IHVuZGVmaW5lZCA9IGNvbnZlcnRQcm90b2NvbFBsYW5SZXZpZXdSZXN1bHQocGxhblJldmlldywgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgaW5wdXRSZXEuYW5zd2Vycyk7XG5cdFx0bGV0IHBsYW5SZXZpZXdDbGVhcmVkID0gZmFsc2U7XG5cdFx0Y29uc3QgY2xlYXJQbGFuUmV2aWV3ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHBsYW5SZXZpZXdDbGVhcmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHBsYW5SZXZpZXdDbGVhcmVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKG9wdHMuc2Vzc2lvblJlc291cmNlKT8uaW5wdXQuY2xlYXJQbGFuUmV2aWV3KHVuZGVmaW5lZCwgaW5wdXRSZXEuaWQpO1xuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IHBhcnQkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwYXJ0LnJlc3BvbnNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aW5wdXRDb21wbGV0ZWQgPSB0cnVlO1xuXHRcdFx0bGF0ZXN0UmVzdWx0ID0gY29udmVydFByb3RvY29sUGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3LCBwYXJ0LnJlc3BvbnNlLCBwYXJ0LnJlcXVlc3QuYW5zd2Vycyk7XG5cdFx0XHRyZXZpZXcuZGF0YSA9IGxhdGVzdFJlc3VsdDtcblx0XHRcdHJldmlldy5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0cmV2aWV3LmRyYWZ0RmVlZGJhY2sgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXZpZXcuZHJhZnRDb2xsYXBzZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR2b2lkIHJldmlldy5jb21wbGV0aW9uLmNvbXBsZXRlKGxhdGVzdFJlc3VsdCk7XG5cdFx0XHRjbGVhclBsYW5SZXZpZXcoKTtcblx0XHR9KSk7XG5cblx0XHRyZXZpZXcuY29tcGxldGlvbi5wLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkIHx8IGlucHV0Q29tcGxldGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSByZXN1bHRcblx0XHRcdFx0PyBjb252ZXJ0UGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3LCByZXN1bHQpXG5cdFx0XHRcdDogeyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCB9O1xuXHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2gob3B0cy5jaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IGlucHV0UmVxLmlkLFxuXHRcdFx0XHQuLi5jb21wbGV0aW9uLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRpZiAob3B0cy5jYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV2aWV3LmRpc21pc3MoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdG9rZW5MaXN0ZW5lciA9IG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmV2aWV3LmRpc21pc3MoKSk7XG5cdFx0XHRyZXZpZXcuY29tcGxldGlvbi5wLmZpbmFsbHkoKCkgPT4gdG9rZW5MaXN0ZW5lci5kaXNwb3NlKCkpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFyZXZpZXcuaXNVc2VkKSB7XG5cdFx0XHRcdGlmIChpbnB1dENvbXBsZXRlZCkge1xuXHRcdFx0XHRcdHJldmlldy5kYXRhID0gbGF0ZXN0UmVzdWx0O1xuXHRcdFx0XHRcdHJldmlldy5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldmlldy5kcmFmdEZlZWRiYWNrID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldmlldy5kcmFmdENvbGxhcHNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR2b2lkIHJldmlldy5jb21wbGV0aW9uLmNvbXBsZXRlKGxhdGVzdFJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV2aWV3LmRpc21pc3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2xlYXJQbGFuUmV2aWV3KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBhIFVSTC1zdHlsZSB7QGxpbmsgQ2hhdElucHV0UmVxdWVzdH0gYnkgcmVuZGVyaW5nIGFcblx0ICoge0BsaW5rIENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0fSB0aGF0IHByb21wdHMgdGhlIHVzZXIgdG8gb3BlbiB0aGVcblx0ICogVVJMLiBDbGlja2luZyB0aGUgYWNjZXB0IGJ1dHRvbiBvcGVucyB0aGUgVVJMIHZpYSB7QGxpbmsgSU9wZW5lclNlcnZpY2V9XG5cdCAqIGFuZCBkaXNwYXRjaGVzIGBDaGF0SW5wdXRDb21wbGV0ZWRgIHdpdGggYEFjY2VwdGA7IHJlamVjdCBkaXNwYXRjaGVzXG5cdCAqIGBEZWNsaW5lYDsgYWJhbmRvbm1lbnQgLyBjYW5jZWxsYXRpb24gZGlzcGF0Y2hlcyBgQ2FuY2VsYC5cblx0ICovXG5cdHByaXZhdGUgX3NldHVwVXJsSW5wdXRSZXF1ZXN0KFxuXHRcdHJlc3BvbnNlUGFydCQ6IElPYnNlcnZhYmxlPElucHV0UmVxdWVzdFJlc3BvbnNlUGFydD4sXG5cdFx0dXJsOiBzdHJpbmcsXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dFJlcSA9IHJlc3BvbnNlUGFydCQuZ2V0KCkucmVxdWVzdDtcblx0XHRsZXQgY29tcGxldGlvbkRpc3BhdGNoZWQgPSBmYWxzZTtcblx0XHRsZXQgY29tcGxldGVkRnJvbVNlcnZlciA9IGZhbHNlO1xuXHRcdGNvbnN0IHNldHRsZSA9IChyZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kKSA9PiB7XG5cdFx0XHRpZiAoY29tcGxldGlvbkRpc3BhdGNoZWQgfHwgY29tcGxldGVkRnJvbVNlcnZlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21wbGV0aW9uRGlzcGF0Y2hlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChvcHRzLmNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRDb21wbGV0ZWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogaW5wdXRSZXEuaWQsXG5cdFx0XHRcdHJlc3BvbnNlLFxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGdldFVybElucHV0UmVxdWVzdFByZXNlbnRhdGlvbihpbnB1dFJlcSwgdXJsKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBuZXcgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQoXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LmVsaWNpdC51cmwudGl0bGUnLCBcIkF1dGhvcml6YXRpb24gUmVxdWlyZWRcIiksXG5cdFx0XHRwcmVzZW50YXRpb24ubWVzc2FnZSxcblx0XHRcdCcnLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5lbGljaXQudXJsLm9wZW4nLCBcIk9wZW4gezB9XCIsIHByZXNlbnRhdGlvbi5hdXRob3JpdHkpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5lbGljaXQudXJsLmNhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih1cmwsIHsgYWxsb3dDb21tYW5kczogZmFsc2UgfSk7XG5cdFx0XHRcdFx0aWYgKG9wZW5lZCkge1xuXHRcdFx0XHRcdFx0c2V0dGxlKENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuQWNjZXB0ZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNldHRsZShDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSk7XG5cdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdHNldHRsZShDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSk7XG5cdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldHRsZShDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSk7XG5cdFx0XHRcdHJldHVybiBFbGljaXRhdGlvblN0YXRlLlJlamVjdGVkO1xuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0b3B0cy5zaW5rKFtwYXJ0XSk7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZVBhcnQkLnJlYWQocmVhZGVyKS5yZXNwb25zZTtcblx0XHRcdGlmIChyZXNwb25zZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbXBsZXRlZEZyb21TZXJ2ZXIgPSB0cnVlO1xuXHRcdFx0cGFydC5zdGF0ZS5zZXQocmVzcG9uc2UgPT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQgPyBFbGljaXRhdGlvblN0YXRlLkFjY2VwdGVkIDogRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZCwgdW5kZWZpbmVkKTtcblx0XHRcdHBhcnQuaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdGlmIChvcHRzLmNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRzZXR0bGUoQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCk7XG5cdFx0XHRwYXJ0LmhpZGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdG9rZW5MaXN0ZW5lciA9IG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRzZXR0bGUoQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCk7XG5cdFx0XHRcdHBhcnQuaGlkZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRva2VuTGlzdGVuZXIuZGlzcG9zZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zYWwgKHR1cm4gZW5kZWQpOiBpZiB0aGUgdXNlciBuZXZlciByZXNvbHZlZCB0aGUgcmVxdWVzdCxcblx0XHQvLyBkaXNwYXRjaCBDYW5jZWwgc28gdGhlIHNlcnZlciBpc24ndCBsZWZ0IGhhbmdpbmcuXG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRzZXR0bGUoQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCk7XG5cdFx0XHRwYXJ0LmhpZGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogU3luY2hyb25pemVzIFBUWSBhbmQgbm9uLVBUWSB0ZXJtaW5hbCBjb250ZW50LCBpbmNsdWRpbmcgdGhlIGxpdmUtdG8tcmV0YWluZWQgb3V0cHV0IGhhbmRvZmYsIGFuZCB1cGRhdGVzIGludm9jYXRpb24gbWV0YWRhdGEuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXZpdmVUZXJtaW5hbElmTmVlZGVkKFxuXHRcdGludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbixcblx0XHR0YzogVG9vbENhbGxTdGF0ZSxcblx0XHRiYWNrZW5kU2Vzc2lvbjogVVJJLFxuXHRcdG91dHB1dFRlcm1pbmFsQXR0YWNobWVudDogSU91dHB1dFRlcm1pbmFsQXR0YWNobWVudCxcblx0KTogdm9pZCB7XG5cdFx0Ly8gY29udGVudCBpcyBvbmx5IHByZXNlbnQgb24gUnVubmluZy9Db21wbGV0ZWQvUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbi5cblx0XHQvLyB0b29sSW5wdXQgaXMgcHJlc2VudCBvbiBhbGwgcG9zdC1zdHJlYW1pbmcgc3RhdGVzLlxuXHRcdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgJiYgdGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgJiYgdGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsQ29udGVudCA9IGdldFRlcm1pbmFsQ29udGVudCh0Yy5jb250ZW50KTtcblx0XHRjb25zdCB0ZXJtaW5hbFVyaSA9IHRlcm1pbmFsQ29udGVudD8ucmVzb3VyY2U7XG5cdFx0aWYgKCF0ZXJtaW5hbENvbnRlbnQgfHwgIXRlcm1pbmFsVXJpIHx8ICF0Yy50b29sSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aW52b2NhdGlvbi5wcmVzZW50YXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdG9vbElucHV0ID0gdGMudG9vbElucHV0O1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IG1ha2VBaHBUZXJtaW5hbFRvb2xTZXNzaW9uSWQodGVybWluYWxVcmksIGJhY2tlbmRTZXNzaW9uKTtcblx0XHRjb25zdCB0ZXJtaW5hbENvbW1hbmRVcmkgPSBVUkkucGFyc2UodGVybWluYWxVcmkpO1xuXHRcdGNvbnN0IGlzUHR5ID0gdGVybWluYWxDb250ZW50LmlzUHR5ICE9PSBmYWxzZTtcblx0XHRjb25zdCB0ZXJtaW5hbEluc3RhbmNlID0gaXNQdHkgPyB0aGlzLl9lbnN1cmVUZXJtaW5hbEluc3RhbmNlKHRlcm1pbmFsVXJpLCBzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhhc1JldGFpbmVkTm9uUHR5U25hcHNob3QgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZFxuXHRcdFx0JiYgIWlzUHR5XG5cdFx0XHQmJiB0ZXJtaW5hbENvbnRlbnQucmVzdWx0Py5leGl0Q29kZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHQmJiB0ZXJtaW5hbENvbnRlbnQucmVzdWx0LnByZXZpZXcgIT09IHVuZGVmaW5lZDtcblx0XHRpZiAoaGFzUmV0YWluZWROb25QdHlTbmFwc2hvdCkge1xuXHRcdFx0b3V0cHV0VGVybWluYWxBdHRhY2htZW50LmRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdG91dHB1dFRlcm1pbmFsQXR0YWNobWVudC5zZXNzaW9uSWQgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICghaXNQdHkgJiYgb3V0cHV0VGVybWluYWxBdHRhY2htZW50LnNlc3Npb25JZCAhPT0gc2Vzc2lvbklkKSB7XG5cdFx0XHRvdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQuZGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5hdHRhY2hPdXRwdXRUZXJtaW5hbCh0aGlzLl9jb25maWcuY29ubmVjdGlvbiwgdGVybWluYWxDb21tYW5kVXJpLCBzZXNzaW9uSWQpO1xuXHRcdFx0b3V0cHV0VGVybWluYWxBdHRhY2htZW50LnNlc3Npb25JZCA9IHNlc3Npb25JZDtcblx0XHR9XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCdcblx0XHRcdD8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGlkZW50aXR5Q2hhbmdlZCA9ICEhZXhpc3RpbmcgJiYgKFxuXHRcdFx0ZXhpc3RpbmcuY29tbWFuZExpbmUub3JpZ2luYWwgIT09IHRvb2xJbnB1dFxuXHRcdFx0fHwgZXhpc3RpbmcudGVybWluYWxUb29sU2Vzc2lvbklkICE9PSBzZXNzaW9uSWRcblx0XHRcdHx8IGV4aXN0aW5nLnRlcm1pbmFsQ29tbWFuZFVyaT8udG9TdHJpbmcoKSAhPT0gdGVybWluYWxDb21tYW5kVXJpLnRvU3RyaW5nKClcblx0XHQpO1xuXHRcdGlmICghZXhpc3RpbmcgfHwgaWRlbnRpdHlDaGFuZ2VkKSB7XG5cdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdC4uLmV4aXN0aW5nLFxuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogdG9vbElucHV0IH0sXG5cdFx0XHRcdGxhbmd1YWdlOiAnc2hlbGxzY3JpcHQnLFxuXHRcdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kVXJpLFxuXHRcdFx0XHRpc1B0eSxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kSWQ6IGlkZW50aXR5Q2hhbmdlZCA/IHVuZGVmaW5lZCA6IGV4aXN0aW5nPy50ZXJtaW5hbENvbW1hbmRJZCxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiBpZGVudGl0eUNoYW5nZWQgPyB1bmRlZmluZWQgOiBleGlzdGluZz8udGVybWluYWxDb21tYW5kT3V0cHV0LFxuXHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRTdGF0ZTogaWRlbnRpdHlDaGFuZ2VkID8gdW5kZWZpbmVkIDogZXhpc3Rpbmc/LnRlcm1pbmFsQ29tbWFuZFN0YXRlLFxuXHRcdFx0XHR0ZXJtaW5hbFRoZW1lOiBpZGVudGl0eUNoYW5nZWQgPyB1bmRlZmluZWQgOiBleGlzdGluZz8udGVybWluYWxUaGVtZSxcblx0XHRcdH07XG5cdFx0XHRpbnZvY2F0aW9uLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnQgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCdcblx0XHRcdD8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRlcm1pbmFsSW5zdGFuY2UgfHwgY3VycmVudD8udGVybWluYWxDb21tYW5kSWQpIHtcblx0XHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0XHRcdHZvaWQgdGVybWluYWxJbnN0YW5jZS5jYXRjaChlcnJvciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gcmV2aXZlIHRlcm1pbmFsICcke3Rlcm1pbmFsVXJpfSdgLCBlcnJvcikpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2b2lkIHRlcm1pbmFsSW5zdGFuY2UudGhlbigoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnXG5cdFx0XHRcdD8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFjdXJyZW50IHx8IGN1cnJlbnQudGVybWluYWxUb29sU2Vzc2lvbklkICE9PSBzZXNzaW9uSWQgfHwgY3VycmVudC50ZXJtaW5hbENvbW1hbmRJZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmdldEFocENvbW1hbmRTb3VyY2Uoc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBzb3VyY2U/LmV4ZWN1dGluZ0NvbW1hbmRPYmplY3QgPz8gc291cmNlPy5jb21tYW5kc1tzb3VyY2UuY29tbWFuZHMubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAoY29tbWFuZD8uaWQpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0geyAuLi5jdXJyZW50LCB0ZXJtaW5hbENvbW1hbmRJZDogY29tbWFuZC5pZCB9O1xuXHRcdFx0XHRpbnZvY2F0aW9uLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fSwgZXJyb3IgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdF0gRmFpbGVkIHRvIHJldml2ZSB0ZXJtaW5hbCAnJHt0ZXJtaW5hbFVyaX0nYCwgZXJyb3IpKTtcblx0fVxuXG5cdC8vIC0tLS0gU3ViYWdlbnQgY2hpbGQgc2Vzc2lvbiBvYnNlcnZhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogRW5yaWNoZXMgc2VyaWFsaXplZCBoaXN0b3J5IHdpdGggaW5uZXIgdG9vbCBjYWxscyBmcm9tIHN1YmFnZW50IGNoaWxkXG5cdCAqIHNlc3Npb25zLiBGb3IgZWFjaCBzdWJhZ2VudCB0b29sIGNhbGwgZm91bmQgaW4gdGhlIGhpc3RvcnksIHN1YnNjcmliZXNcblx0ICogdG8gdGhlIGNvcnJlc3BvbmRpbmcgY2hpbGQgc2Vzc2lvbiBhbmQgYXBwZW5kcyBpdHMgaW5uZXIgdG9vbCBjYWxsc1xuXHQgKiAod2l0aCBgc3ViQWdlbnRJbnZvY2F0aW9uSWRgIHNldCkgdG8gdGhlIHJlc3BvbnNlIHBhcnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5yaWNoSGlzdG9yeVdpdGhTdWJhZ2VudENhbGxzKFxuXHRcdGhpc3Rvcnk6IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10sXG5cdFx0cGFyZW50U2Vzc2lvbjogVVJJLFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHNlc3Npb25TdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25TdHIgPSBwYXJlbnRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRDaGF0cyA9IG5ldyBNYXAoc2Vzc2lvblN0YXRlLmNoYXRzLmZsYXRNYXAoY2hhdCA9PlxuXHRcdFx0Y2hhdC5vcmlnaW4/LmtpbmQgPT09IENoYXRPcmlnaW5LaW5kLlRvb2wgPyBbW2NoYXQub3JpZ2luLnRvb2xDYWxsSWQsIGNoYXRdIGFzIGNvbnN0XSA6IFtdXG5cdFx0KSk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRJbnNlcnRpb25zOiB7IGl0ZW06IEV4dHJhY3Q8SUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW0sIHsgdHlwZTogJ3Jlc3BvbnNlJyB9PjsgaW5kZXg6IG51bWJlcjsgdG9vbENhbGxJZDogc3RyaW5nOyBjaGlsZENoYXRVcmk6IHN0cmluZyB9W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBoaXN0b3J5KSB7XG5cdFx0XHRpZiAoaXRlbS50eXBlICE9PSAncmVzcG9uc2UnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW0ucGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgcGFydCA9IGl0ZW0ucGFydHNbaV07XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgIT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gc3ViYWdlbnRDaGF0cy5nZXQocGFydC50b29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKHN1YmFnZW50Q2hhdCkge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gcGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gcGFydC50b29sU3BlY2lmaWNEYXRhIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHBhcnQudG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0XHRcdC4uLmV4aXN0aW5nLFxuXHRcdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzdWJhZ2VudENoYXQudGl0bGUgfHwgZXhpc3Rpbmc/LmRlc2NyaXB0aW9uIHx8ICh0eXBlb2YgcGFydC5pbnZvY2F0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZycgPyBwYXJ0Lmludm9jYXRpb25NZXNzYWdlIDogcGFydC5pbnZvY2F0aW9uTWVzc2FnZS52YWx1ZSksXG5cdFx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6IHN1YmFnZW50Q2hhdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcnQudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkQ2hhdFVyaSA9IHBhcnQudG9vbFNwZWNpZmljRGF0YS5jaGF0UmVzb3VyY2Vcblx0XHRcdFx0XHRcdD8/IHN1YmFnZW50Q2hhdD8ucmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0XHRcdFx0Pz8gYnVpbGRTdWJhZ2VudENoYXRVcmkocGFyZW50U2Vzc2lvblN0ciwgcGFydC50b29sQ2FsbElkKTtcblx0XHRcdFx0XHRwYXJ0LnRvb2xTcGVjaWZpY0RhdGEuY2hhdFJlc291cmNlID0gY2hpbGRDaGF0VXJpO1xuXHRcdFx0XHRcdHN1YmFnZW50SW5zZXJ0aW9ucy5wdXNoKHsgaXRlbSwgaW5kZXg6IGksIHRvb2xDYWxsSWQ6IHBhcnQudG9vbENhbGxJZCwgY2hpbGRDaGF0VXJpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN1YmFnZW50SW5zZXJ0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZFN0YXRlQnlVcmkgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZD4+KCk7XG5cdFx0Y29uc3QgZ2V0Q2hpbGRTdGF0ZSA9IChjaGlsZENoYXRVcmk6IHN0cmluZyk6IFByb21pc2U8SVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdGxldCBleGlzdGluZyA9IGNoaWxkU3RhdGVCeVVyaS5nZXQoY2hpbGRDaGF0VXJpKTtcblx0XHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdFx0ZXhpc3RpbmcgPSB0aGlzLl9sb2FkU3ViYWdlbnRTdGF0ZShwYXJlbnRTZXNzaW9uU3RyLCBjaGlsZENoYXRVcmkpO1xuXHRcdFx0XHRjaGlsZFN0YXRlQnlVcmkuc2V0KGNoaWxkQ2hhdFVyaSwgZXhpc3RpbmcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH07XG5cblx0XHRjb25zdCBlbnJpY2hlZEluc2VydGlvbnMgPSBhd2FpdCBQcm9taXNlLmFsbChzdWJhZ2VudEluc2VydGlvbnMubWFwKGFzeW5jICh7IGl0ZW0sIGluZGV4LCB0b29sQ2FsbElkLCBjaGlsZENoYXRVcmkgfSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IGF3YWl0IGdldENoaWxkU3RhdGUoY2hpbGRDaGF0VXJpKTtcblx0XHRcdFx0aWYgKGNoaWxkU3RhdGUpIHtcblx0XHRcdFx0XHQvLyBTdXJmYWNlIHRoaXMgc3ViYWdlbnQncyBhY2N1bXVsYXRlZCBjb3N0IChBSUMpIGFuZCBtb2RlbCBvblxuXHRcdFx0XHRcdC8vIGl0cyB0b29sJ3MgaG92ZXIgYWZ0ZXIgYSByZWxvYWQgYnkgd3JpdGluZyB0aGVtIG9udG8gdGhlXG5cdFx0XHRcdFx0Ly8gc2VyaWFsaXplZCBzdWJhZ2VudCB0b29sIGNhbGwuXG5cdFx0XHRcdFx0dGhpcy5fYXBwbHlTdWJhZ2VudFVzYWdlVG9IaXN0b3J5UGFydChpdGVtLnBhcnRzW2luZGV4XSwgc2Vzc2lvblJlc291cmNlLCBjaGlsZFN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBpdGVtLCBpbmRleCwgaW5uZXJQYXJ0czogY2hpbGRTdGF0ZSA/IHRoaXMuX2dldFN1YmFnZW50SW5uZXJQYXJ0cyhjaGlsZENoYXRVcmksIHRvb2xDYWxsSWQsIGNoaWxkU3RhdGUpIDogW10gfTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIEZhaWxlZCB0byBlbnJpY2ggaGlzdG9yeSB3aXRoIHN1YmFnZW50IGNhbGxzOiAke2NoaWxkQ2hhdFVyaX1gLCBlcnIpO1xuXHRcdFx0XHRyZXR1cm4geyBpdGVtLCBpbmRleCwgaW5uZXJQYXJ0czogW10gfTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRmb3IgKGNvbnN0IHsgaXRlbSwgaW5kZXgsIGlubmVyUGFydHMgfSBvZiBlbnJpY2hlZEluc2VydGlvbnMuc29ydCgoYSwgYikgPT4gYi5pbmRleCAtIGEuaW5kZXgpKSB7XG5cdFx0XHRpZiAoaW5uZXJQYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGl0ZW0ucGFydHMuc3BsaWNlKGluZGV4ICsgMSwgMCwgLi4uaW5uZXJQYXJ0cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZFN1YmFnZW50U3RhdGUocGFyZW50U2Vzc2lvblVyaTogc3RyaW5nLCBjaGlsZENoYXRVcmk6IHN0cmluZyk6IFByb21pc2U8SVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjaGlsZFN1YiA9IHRoaXMuX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24ocGFyZW50U2Vzc2lvblVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZChjaGlsZFN1YiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoY2hpbGRTdWIudmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBjaGlsZFN1Yi52YWx1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoaWxkQ2hhdFN1YiA9IHRoaXMuX2Vuc3VyZUNoYXRTdWJzY3JpcHRpb24ocGFyZW50U2Vzc2lvblVyaSwgY2hpbGRDaGF0VXJpKTtcblx0XHRcdGF3YWl0IHRoaXMuX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZChjaGlsZENoYXRTdWIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKGNoaWxkQ2hhdFN1Yi52YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHRocm93IGNoaWxkQ2hhdFN1Yi52YWx1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9nZXRTZXNzaW9uU3RhdGUocGFyZW50U2Vzc2lvblVyaSwgY2hpbGRDaGF0VXJpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcmVsZWFzZUNoYXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhwYXJlbnRTZXNzaW9uVXJpLCBjaGlsZENoYXRVcmkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXcml0ZXMgYSBzdWJhZ2VudCdzIGFjY3VtdWxhdGVkIGNvc3QgKEFJQykgYW5kIG1vZGVsIFx1MjAxNCBzdW1tZWQgYWNyb3NzIGl0c1xuXHQgKiBjaGlsZCBzZXNzaW9uJ3MgdHVybnMgXHUyMDE0IG9udG8gaXRzIHNlcmlhbGl6ZWQgc3ViYWdlbnQgdG9vbCBjYWxsIHNvIHRoZVxuXHQgKiBob3ZlciBzdXJ2aXZlcyBhIHJlbG9hZC4gTWlycm9ycyB0aGUgbGl2ZSBvYnNlcnZlcnMgaW5cblx0ICoge0BsaW5rIF9zZXR1cFNlcnZlclRvb2xDYWxsfS5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5U3ViYWdlbnRVc2FnZVRvSGlzdG9yeVBhcnQocGFydDogSUNoYXRQcm9ncmVzcywgc2Vzc2lvblJlc291cmNlOiBVUkksIGNoaWxkU3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0KTogdm9pZCB7XG5cdFx0aWYgKHBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcgfHwgcGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBjcmVkaXRzID0gMDtcblx0XHRsZXQgbW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB0dXJuIG9mIGNoaWxkU3RhdGUudHVybnMpIHtcblx0XHRcdGNvbnN0IHR1cm5DcmVkaXRzID0gdXNhZ2VJbmZvVG9DaGF0VXNhZ2UodHVybi51c2FnZSk/LmNvcGlsb3RDcmVkaXRzO1xuXHRcdFx0aWYgKHR5cGVvZiB0dXJuQ3JlZGl0cyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0Y3JlZGl0cyArPSB0dXJuQ3JlZGl0cztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHR1cm5Nb2RlbElkID0gdGhpcy5fdG9MYW5ndWFnZU1vZGVsSWQoc2Vzc2lvblJlc291cmNlLCB0dXJuLnVzYWdlPy5tb2RlbCk7XG5cdFx0XHRjb25zdCB0dXJuTW9kZWxOYW1lID0gdGhpcy5fZ2V0TGFuZ3VhZ2VNb2RlbERpc3BsYXlOYW1lKHR1cm5Nb2RlbElkKTtcblx0XHRcdGlmICh0dXJuTW9kZWxOYW1lKSB7XG5cdFx0XHRcdG1vZGVsTmFtZSA9IHR1cm5Nb2RlbE5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjcmVkaXRzID4gMCkge1xuXHRcdFx0cGFydC50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgPSBjcmVkaXRzO1xuXHRcdH1cblx0XHRpZiAobW9kZWxOYW1lICYmICFwYXJ0LnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lKSB7XG5cdFx0XHRwYXJ0LnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lID0gbW9kZWxOYW1lO1xuXHRcdH1cblx0XHRjb25zdCB0aW1pbmcgPSBnZXRTdWJhZ2VudFRpbWluZyhjaGlsZFN0YXRlKTtcblx0XHRwYXJ0LnRvb2xTcGVjaWZpY0RhdGEuc3RhcnRlZEF0ID0gdGltaW5nLnN0YXJ0ZWRBdDtcblx0XHRwYXJ0LnRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24gPSB0aW1pbmcuZHVyYXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdWJhZ2VudElubmVyUGFydHMoY2hpbGRTZXNzaW9uVXJpOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgY2hpbGRTdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQpOiBJQ2hhdFByb2dyZXNzW10ge1xuXHRcdGNvbnN0IGlubmVyUGFydHM6IElDaGF0UHJvZ3Jlc3NbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdHVybiBvZiBjaGlsZFN0YXRlLnR1cm5zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJwIG9mIHR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0XHRpZiAocnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0XHRcdGNvbnN0IHRjID0gcnAudG9vbENhbGw7XG5cdFx0XHRcdFx0aWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21wbGV0ZWRUYyA9IHRjIGFzIElDb21wbGV0ZWRUb29sQ2FsbDtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVFZGl0UGFydHMgPSBjb21wbGV0ZWRUb29sQ2FsbFRvRWRpdFBhcnRzKGNvbXBsZXRlZFRjLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdFx0XHRjb25zdCBzZXJpYWxpemVkID0gY29tcGxldGVkVG9vbENhbGxUb1NlcmlhbGl6ZWQoY29tcGxldGVkVGMsIHRvb2xDYWxsSWQsIFVSSS5wYXJzZShjaGlsZFNlc3Npb25VcmkpLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdFx0XHRpZiAoZmlsZUVkaXRQYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHNlcmlhbGl6ZWQucHJlc2VudGF0aW9uID0gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aW5uZXJQYXJ0cy5wdXNoKHNlcmlhbGl6ZWQpO1xuXHRcdFx0XHRcdFx0aW5uZXJQYXJ0cy5wdXNoKC4uLmZpbGVFZGl0UGFydHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaW5uZXJQYXJ0cztcblx0fVxuXG5cdC8qKlxuXHQgKiBTdWJzY3JpYmVzIHRvIGEgY2hpbGQgc3ViYWdlbnQgc2Vzc2lvbiBhbmQgZm9yd2FyZHMgaXRzIHRvb2wgY2FsbHNcblx0ICogYXMgcHJvZ3Jlc3MgcGFydHMgaW50byB0aGUgcGFyZW50IHNlc3Npb24ncyByZXNwb25zZSwgd2l0aFxuXHQgKiBgc3ViQWdlbnRJbnZvY2F0aW9uSWRgIHNldCBzbyB0aGUgcmVuZGVyZXIgZ3JvdXBzIHRoZW0gdW5kZXIgdGhlIHBhcmVudFxuXHQgKiBzdWJhZ2VudCB3aWRnZXQuXG5cdCAqXG5cdCAqIEltcGxlbWVudGF0aW9uOiBidWlsZHMgYSBwZXItdHVybi1pZCBrZXllZCBvYnNlcnZhdGlvbiBvdmVyIHRoZSBjaGlsZFxuXHQgKiBzZXNzaW9uJ3MgYHR1cm5zYCBhbmQgYGFjdGl2ZVR1cm5gLiBFYWNoIHR1cm4gaWQgZGlzY292ZXJlZCBnZXRzIGl0c1xuXHQgKiBvd24ge0BsaW5rIF9vYnNlcnZlVHVybn0gaW5zdGFuY2UgcnVubmluZyBpbiBzdWJhZ2VudCBtb2RlICh3aGljaCBza2lwc1xuXHQgKiBtYXJrZG93bi9yZWFzb25pbmcvaW5wdXQtcmVxdWVzdCBlbWlzc2lvbiBhbmQgdGFncyB0b29sIGNhbGxzIHdpdGggdGhlXG5cdCAqIHBhcmVudCB0b29sIGNhbGwgaWQpLiBFYWNoIHBlci10dXJuIG9ic2VydmVyIHNlbGYtZGlzcG9zZXMgd2hlbiBpdHNcblx0ICogdHVybiByZWFjaGVzIGEgdGVybWluYWwgc3RhdGU7IHRoZSBvdXRlciBvYnNlcnZhdGlvbiBpcyB0b3JuIGRvd24gd2hlblxuXHQgKiB0aGUgY2FsbGVyIGRpc3Bvc2VzIGBkaXNwb3NhYmxlc2AuXG5cdCAqL1xuXHRwcml2YXRlIF9vYnNlcnZlU3ViYWdlbnRTZXNzaW9uKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHBhcmVudFNlc3Npb246IFVSSSxcblx0XHRwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcsXG5cdFx0Y2hpbGRDaGF0VXJpOiBzdHJpbmcsXG5cdFx0cm9vdEludm9jYXRpb25JZDogc3RyaW5nLFxuXHRcdHBhcmVudEludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbixcblx0XHRlbWl0UHJvZ3Jlc3M6IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB2b2lkLFxuXHRcdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0c3ViYWdlbnRDb250ZXh0OiBJU3ViYWdlbnRDb250ZXh0LFxuXHRcdHBlckludm9jYXRpb25DcmVkaXRzQWNjdW11bGF0b3I6IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPixcblx0XHRwZXJJbnZvY2F0aW9uTW9kZWw6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPixcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgcGFyZW50U2Vzc2lvblVyaSA9IHBhcmVudFNlc3Npb24udG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmIChwYXJlbnRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgJiYgcGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlKSB7XG5cdFx0XHRcdHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0XHRwYXJlbnRJbnZvY2F0aW9uLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNoaWxkU3ViID0gdGhpcy5fZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbihwYXJlbnRTZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IGNoaWxkQ2hhdFN1YiA9IHRoaXMuX2Vuc3VyZUNoYXRTdWJzY3JpcHRpb24ocGFyZW50U2Vzc2lvblVyaSwgY2hpbGRDaGF0VXJpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fcmVsZWFzZUNoYXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhwYXJlbnRTZXNzaW9uVXJpLCBjaGlsZENoYXRVcmkpKSk7XG5cblx0XHRcdGNvbnN0IGNoaWxkU2Vzc2lvblN0YXRlJCA9IG9ic2VydmFibGVGcm9tU3Vic2NyaXB0aW9uKHRoaXMsIGNoaWxkU3ViKTtcblx0XHRcdGNvbnN0IGNoaWxkQ2hhdFN0YXRlJCA9IG9ic2VydmFibGVGcm9tU3Vic2NyaXB0aW9uKHRoaXMsIGNoaWxkQ2hhdFN1Yik7XG5cdFx0XHRjb25zdCBjaGlsZFN0YXRlJCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNoaWxkU2Vzc2lvblN0YXRlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdChzZXNzaW9uLCBjaGlsZENoYXRTdGF0ZSQucmVhZChyZWFkZXIpKTtcblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBjaGlsZFN0YXRlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghc3RhdGUgfHwgKCFzdGF0ZS5hY3RpdmVUdXJuICYmIHN0YXRlLnR1cm5zLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaXNBY3RpdmUgPSAhIXN0YXRlLmFjdGl2ZVR1cm47XG5cdFx0XHRcdGlmIChwYXJlbnRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0XHRjb25zdCB0aW1pbmcgPSBnZXRTdWJhZ2VudFRpbWluZyhzdGF0ZSk7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2tEdXJhdGlvbiA9ICFpc0FjdGl2ZSAmJiB0aW1pbmcuZHVyYXRpb24gPT09IHVuZGVmaW5lZCAmJiBwYXJlbnRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgJiYgcGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnN0YXJ0ZWRBdCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHQ/IERhdGUubm93KCkgLSBwYXJlbnRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuc3RhcnRlZEF0XG5cdFx0XHRcdFx0XHQ6IHRpbWluZy5kdXJhdGlvbjtcblx0XHRcdFx0XHRpZiAocGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlICE9PSBpc0FjdGl2ZVxuXHRcdFx0XHRcdFx0fHwgcGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnN0YXJ0ZWRBdCAhPT0gdGltaW5nLnN0YXJ0ZWRBdFxuXHRcdFx0XHRcdFx0fHwgcGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uICE9PSBmYWxsYmFja0R1cmF0aW9uKSB7XG5cdFx0XHRcdFx0XHRwYXJlbnRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgPSBpc0FjdGl2ZTtcblx0XHRcdFx0XHRcdHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5zdGFydGVkQXQgPSB0aW1pbmcuc3RhcnRlZEF0O1xuXHRcdFx0XHRcdFx0cGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uID0gZmFsbGJhY2tEdXJhdGlvbjtcblx0XHRcdFx0XHRcdHBhcmVudEludm9jYXRpb24ubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgY2hpbGRUdXJuSWRzJCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBjaGlsZFN0YXRlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaWRzOiB7IGlkOiBzdHJpbmcgfVtdID0gc3RhdGUudHVybnMubWFwKHQgPT4gKHsgaWQ6IHQuaWQgfSkpO1xuXHRcdFx0XHRjb25zdCBhY3RpdmVJZCA9IHN0YXRlLmFjdGl2ZVR1cm4/LmlkO1xuXHRcdFx0XHRpZiAoYWN0aXZlSWQgIT09IHVuZGVmaW5lZCAmJiAhc3RhdGUudHVybnMuc29tZSh0ID0+IHQuaWQgPT09IGFjdGl2ZUlkKSkge1xuXHRcdFx0XHRcdGlkcy5wdXNoKHsgaWQ6IGFjdGl2ZUlkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpZHM7XG5cdFx0XHR9KTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW5QZXJLZXllZEl0ZW0oXG5cdFx0XHRcdGNoaWxkVHVybklkcyQsXG5cdFx0XHRcdHQgPT4gdC5pZCxcblx0XHRcdFx0KHR1cm5JZCwgX3QkLCB0dXJuU3RvcmUpID0+IHtcblx0XHRcdFx0XHR0dXJuU3RvcmUuYWRkKHRoaXMuX29ic2VydmVUdXJuKHtcblx0XHRcdFx0XHRcdGJhY2tlbmRTZXNzaW9uOiBwYXJlbnRTZXNzaW9uLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0Y2hhdFVSSTogY2hpbGRDaGF0VXJpLFxuXHRcdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdFx0c2luazogZW1pdFByb2dyZXNzLFxuXHRcdFx0XHRcdFx0Y2FuY2VsbGF0aW9uVG9rZW46IGN0cy50b2tlbixcblx0XHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiByb290SW52b2NhdGlvbklkLFxuXHRcdFx0XHRcdFx0c3ViQWdlbnRDcmVkaXRzQWNjdW11bGF0b3I6IHBlckludm9jYXRpb25DcmVkaXRzQWNjdW11bGF0b3IsXG5cdFx0XHRcdFx0XHRzdWJBZ2VudE1vZGVsT2JzZXJ2YWJsZTogcGVySW52b2NhdGlvbk1vZGVsLFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSxcblx0XHRcdCkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gUmVtb3ZlIGZyb20gb2JzZXJ2ZWQgc2V0IHNvIGEgbGF0ZXIgc3RhdGUgY2hhbmdlIGNhbiByZXRyeVxuXHRcdFx0c3ViYWdlbnRDb250ZXh0Lm9ic2VydmVkVG9vbElkcy5kZWxldGUocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIEZhaWxlZCB0byBzdWJzY3JpYmUgdG8gc3ViYWdlbnQgY2hhdDogJHtjaGlsZENoYXRVcml9YCwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIFJlY29ubmVjdGlvbiB0byBhY3RpdmUgdHVybiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFdpcmVzIHVwIGFuIG9uZ29pbmcgc3RhdGUgbGlzdGVuZXIgdGhhdCBzdHJlYW1zIGluY3JlbWVudGFsIHByb2dyZXNzXG5cdCAqIGZyb20gYW4gYWxyZWFkeS1ydW5uaW5nIHR1cm4gaW50byB0aGUgY2hhdCBzZXNzaW9uJ3MgcHJvZ3Jlc3NPYnMuXG5cdCAqIFRoaXMgaXMgdGhlIHJlY29ubmVjdGlvbiBjb3VudGVycGFydCBvZiB7QGxpbmsgX2hhbmRsZVR1cm59LCB3aGljaFxuXHQgKiBoYW5kbGVzIG5ld2x5LWluaXRpYXRlZCB0dXJucy5cblx0ICovXG5cdHByaXZhdGUgX3JlY29ubmVjdFRvQWN0aXZlVHVybihcblx0XHRiYWNrZW5kU2Vzc2lvbjogVVJJLFxuXHRcdHR1cm5JZDogc3RyaW5nLFxuXHRcdGNoYXRTZXNzaW9uOiBBZ2VudEhvc3RDaGF0U2Vzc2lvbixcblx0XHRpbml0aWFsUHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSxcblx0XHRpbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQ6IG51bWJlcixcblx0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX2dldENoYXRVUkkoY2hhdFNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIEV4dHJhY3QgbGl2ZSBDaGF0VG9vbEludm9jYXRpb24gb2JqZWN0cyBmcm9tIHRoZSBpbml0aWFsIHByb2dyZXNzXG5cdFx0Ly8gYXJyYXkgc28gcGVyLXRvb2wgc2V0dXAgYWRvcHRzIHRoZSBzYW1lIGluc3RhbmNlcyB0aGUgY2hhdCBVSSBob2xkcy5cblx0XHRjb25zdCBhZG9wdEludm9jYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIENoYXRUb29sSW52b2NhdGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaW5pdGlhbFByb2dyZXNzKSB7XG5cdFx0XHRpZiAoaXRlbSBpbnN0YW5jZW9mIENoYXRUb29sSW52b2NhdGlvbikge1xuXHRcdFx0XHRhZG9wdEludm9jYXRpb25zLnNldChpdGVtLnRvb2xDYWxsSWQsIGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNlZWQgbGFzdC1lbWl0dGVkIG1hcmtkb3duL3JlYXNvbmluZyBsZW5ndGhzIGZyb20gdGhlIHNuYXBzaG90IHNvXG5cdFx0Ly8gcGVyLXBhcnQgc2V0dXAgb25seSBlbWl0cyBjb250ZW50IGJleW9uZCB3aGF0IGBhY3RpdmVUdXJuVG9Qcm9ncmVzc2Bcblx0XHQvLyBhbHJlYWR5IHByb2R1Y2VkLlxuXHRcdGNvbnN0IHNlZWRFbWl0dGVkTGVuZ3RocyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXksIGNoYXRVUkkpO1xuXHRcdGlmIChjdXJyZW50U3RhdGU/LmFjdGl2ZVR1cm4pIHtcblx0XHRcdGZvciAoY29uc3QgcnAgb2YgY3VycmVudFN0YXRlLmFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0XHRpZiAocnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biB8fCBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZykge1xuXHRcdFx0XHRcdHNlZWRFbWl0dGVkTGVuZ3Rocy5zZXQocnAuaWQsIHJwLmNvbnRlbnQubGVuZ3RoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFN0b3JlID0gY2hhdFNlc3Npb24ucmVnaXN0ZXJEaXNwb3NhYmxlKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0cmVjb25uZWN0U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHJlY29ubmVjdFN0b3JlLmFkZCh0aGlzLl9vYnNlcnZlVHVybih7XG5cdFx0XHRiYWNrZW5kU2Vzc2lvbixcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogY2hhdFNlc3Npb24uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y2hhdFVSSSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHNpbms6IHBhcnRzID0+IGNoYXRTZXNzaW9uLmFwcGVuZFByb2dyZXNzKHBhcnRzKSxcblx0XHRcdGNhbmNlbGxhdGlvblRva2VuOiBjdHMudG9rZW4sXG5cdFx0XHRhZG9wdEludm9jYXRpb25zLFxuXHRcdFx0c2VlZEVtaXR0ZWRMZW5ndGhzLFxuXHRcdFx0aW5pdGlhbFJlc3BvbnNlUGFydENvdW50LFxuXHRcdFx0b25UdXJuRW5kZWQ6ICgpID0+IHtcblx0XHRcdFx0Y2hhdFNlc3Npb24uY29tcGxldGUoKTtcblx0XHRcdFx0cmVjb25uZWN0U3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0tIEZpbGUgZWRpdCByb3V0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIHRoZSBjaGF0IG1vZGVsIGhhcyBhIHNuYXBzaG90IGNvbnRyb2xsZXIgYm91bmQgKGNyZWF0aW5nIG9uZVxuXHQgKiB2aWEgb3VyIHJlZ2lzdGVyZWQgZWRpdGluZy1zZXNzaW9uIHByb3ZpZGVyIGlmIG5lZWRlZCkgYW5kIHJldHVybnMgaXQuXG5cdCAqIEh5ZHJhdGVzIHRoZSBjb250cm9sbGVyIGZyb20gYW55IHBlbmRpbmcgaGlzdG9yeSB0dXJucyBvbiBmaXJzdCBhY2Nlc3MuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVTbmFwc2hvdENvbnRyb2xsZXIoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWNoYXRNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTdGFydCB0aGUgZWRpdGluZyBzZXNzaW9uIGlmIG5vdCBhbHJlYWR5IHN0YXJ0ZWQgXHUyMDE0IHRoaXMgd2lsbCB1c2Vcblx0XHQvLyBvdXIgcmVnaXN0ZXJlZCBwcm92aWRlciB0byBjcmVhdGUgYW4gQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLlxuXHRcdGlmICghY2hhdE1vZGVsLmVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRjaGF0TW9kZWwuc3RhcnRFZGl0aW5nU2Vzc2lvbigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRpbmdTZXNzaW9uID0gY2hhdE1vZGVsLmVkaXRpbmdTZXNzaW9uO1xuXHRcdGlmICghKGVkaXRpbmdTZXNzaW9uIGluc3RhbmNlb2YgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBIeWRyYXRlIGZyb20gaGlzdG9yaWNhbCB0dXJucyBpZiB0aGlzIGlzIHRoZSBmaXJzdCB0aW1lXG5cdFx0Ly8gdGhlIGNvbnRyb2xsZXIgaXMgYWNjZXNzZWQgZm9yIHRoaXMgY2hhdCBzZXNzaW9uLiBXZSBzZWVkIGFcblx0XHQvLyByZXF1ZXN0LWxldmVsIGNoZWNrcG9pbnQgZm9yIGV2ZXJ5IHR1cm4gKG5vdCBqdXN0IHR1cm5zIHdpdGhcblx0XHQvLyBlZGl0cykgc28gXCJSZXN0b3JlIENoZWNrcG9pbnRcIiBvbiBhbnkgaGlzdG9yaWNhbCByZXF1ZXN0IGNhblxuXHRcdC8vIGZpbmQgYSBib3VuZGFyeSBhbmQgbWFyayBzdWJzZXF1ZW50IHJlcXVlc3RzIGFzIGRpc2FibGVkIHZpYVxuXHRcdC8vIHJlcXVlc3REaXNhYmxlbWVudC5cblx0XHRjb25zdCBwZW5kaW5nVHVybnMgPSB0aGlzLl9wZW5kaW5nSGlzdG9yeVR1cm5zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nVHVybnMpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdIaXN0b3J5VHVybnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRmb3IgKGNvbnN0IHR1cm4gb2YgcGVuZGluZ1R1cm5zKSB7XG5cdFx0XHRcdGVkaXRpbmdTZXNzaW9uLmVuc3VyZVJlcXVlc3RDaGVja3BvaW50KHR1cm4uaWQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJwIG9mIHR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0XHRcdGlmIChycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0XHRlZGl0aW5nU2Vzc2lvbi5hZGRUb29sQ2FsbEVkaXRzKHR1cm4uaWQsIHJwLnRvb2xDYWxsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdGluZ1Nlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkcyBzbmFwc2hvdCBkYXRhIGZvciBhIGNvbXBsZXRlZCB0b29sIGNhbGwgKHNvIHJlc3RvcmUtc25hcHNob3Rcblx0ICogd29ya3MpIGFuZCByZXR1cm5zIHRoZSB7QGxpbmsgSUNoYXRFeHRlcm5hbEVkaXR9IHByb2dyZXNzIHBhcnRzIHRvXG5cdCAqIHJlbmRlciB0aGUgcGVyLWZpbGUgZWRpdCBwaWxscy5cblx0ICovXG5cdHByaXZhdGUgX2h5ZHJhdGVGaWxlRWRpdHMoXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cmVxdWVzdElkOiBzdHJpbmcsXG5cdFx0dGM6IFRvb2xDYWxsU3RhdGUsXG5cdCk6IElDaGF0UHJvZ3Jlc3NbXSB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuX2Vuc3VyZVNuYXBzaG90Q29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnRyb2xsZXI/LmFkZFRvb2xDYWxsRWRpdHMocmVxdWVzdElkLCB0Yyk7XG5cdFx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBjb21wbGV0ZWRUb29sQ2FsbFRvRWRpdFBhcnRzKHRjIGFzIElDb21wbGV0ZWRUb29sQ2FsbCwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHR9XG5cblx0Ly8gLS0tLSBTZXNzaW9uIHJlc29sdXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBBdHRhY2hlcyB0byBhbiBleGlzdGluZyBzZXJ2ZXItc2lkZSB0ZXJtaW5hbCB2aWEgdGhlIGFnZW50IGhvc3Rcblx0ICogdGVybWluYWwgc2VydmljZSBhbmQgcmVnaXN0ZXJzIGl0IHdpdGggdGhlIHRlcm1pbmFsIGNoYXQgc2VydmljZS5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgdGVybWluYWwgaW5zdGFuY2UgY3JlYXRlZCBvciByZXVzZWQgYnkgdGhlIHRlcm1pbmFsIHNlcnZpY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVUZXJtaW5hbEluc3RhbmNlKHRlcm1pbmFsVXJpOiBzdHJpbmcsIHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdHJldHVybiB0aGlzLl9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UucmV2aXZlVGVybWluYWwoXG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbixcblx0XHRcdFVSSS5wYXJzZSh0ZXJtaW5hbFVyaSksXG5cdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWRcblx0XHQpO1xuXHR9XG5cblx0LyoqIE1hcHMgYSBVSSBzZXNzaW9uIHJlc291cmNlIHRvIGEgYmFja2VuZCBwcm92aWRlciBVUkkuICovXG5cdHByaXZhdGUgX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHtcblx0XHRjb25zdCByYXdJZCA9IHNlc3Npb25SZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRyZXR1cm4gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLl9jb25maWcuYmFja2VuZFNlc3Npb25TY2hlbWUgPz8gdGhpcy5fY29uZmlnLnByb3ZpZGVyLCByYXdJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc05ld1Nlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2NvbmZpZy5pc05ld1Nlc3Npb24/LihzZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHR8fCB0aGlzLl93b3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIuaXNOZXdTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogRm9ya3MgYSBzZXNzaW9uIGF0IHRoZSBnaXZlbiByZXF1ZXN0IHBvaW50IGJ5IGNyZWF0aW5nIGEgbmV3IGJhY2tlbmRcblx0ICogc2Vzc2lvbiB3aXRoIHRoZSBgZm9ya2AgcGFyYW1ldGVyLiBSZXR1cm5zIGFuIHtAbGluayBJQ2hhdFNlc3Npb25JdGVtfVxuXHQgKiBwb2ludGluZyB0byB0aGUgbmV3bHkgY3JlYXRlZCBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZm9ya1Nlc3Npb24oXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0YmFja2VuZFNlc3Npb246IFVSSSxcblx0XHRyZXF1ZXN0OiBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW0gfCB1bmRlZmluZWQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPElDaGF0U2Vzc2lvbkl0ZW0+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FuY2VsbGVkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZXJtaW5lIHRoZSB0dXJuIGluZGV4IHRvIGZvcmsgYXQuIElmIGEgc3BlY2lmaWMgcmVxdWVzdCBpc1xuXHRcdC8vIHByb3ZpZGVkLCBmb3JrIEJFRk9SRSBpdCAoa2VlcGluZyB0dXJucyB1cCB0byB0aGUgcHJldmlvdXMgb25lKS5cblx0XHQvLyBUaGlzIG1hdGNoZXMgdGhlIG5vbi1jb250cmlidXRlZCBwYXRoIGluIEZvcmtDb252ZXJzYXRpb25BY3Rpb25cblx0XHQvLyB3aGljaCB1c2VzIGByZXF1ZXN0SW5kZXggLSAxYC4gSWYgbm8gcmVxdWVzdCBpcyBwcm92aWRlZCwgZm9ya1xuXHRcdC8vIHRoZSBlbnRpcmUgc2Vzc2lvbi5cblx0XHRjb25zdCBwcm90b2NvbFN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGxldCB0dXJuSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdElkeCA9IHByb3RvY29sU3RhdGU/LnR1cm5zLmZpbmRJbmRleCh0ID0+IHQuaWQgPT09IHJlcXVlc3QuaWQpO1xuXHRcdFx0aWYgKHJlcXVlc3RJZHggPT09IHVuZGVmaW5lZCB8fCByZXF1ZXN0SWR4IDwgMCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmb3JrOiB0dXJuIGZvciByZXF1ZXN0ICR7cmVxdWVzdC5pZH0gbm90IGZvdW5kIGluIHByb3RvY29sIHN0YXRlYCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBGb3JrIGJlZm9yZSB0aGlzIHJlcXVlc3QgXHUyMDE0IGtlZXAgdHVybnMgWzAuLnJlcXVlc3RJZHgtMV1cblx0XHRcdHR1cm5JbmRleCA9IHJlcXVlc3RJZHggLSAxO1xuXHRcdFx0aWYgKHR1cm5JbmRleCA8IDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9yazogY2Fubm90IGZvcmsgYmVmb3JlIHRoZSBmaXJzdCByZXF1ZXN0Jyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChwcm90b2NvbFN0YXRlPy50dXJucy5sZW5ndGgpIHtcblx0XHRcdHR1cm5JbmRleCA9IHByb3RvY29sU3RhdGUudHVybnMubGVuZ3RoIC0gMTtcblx0XHR9XG5cblx0XHRpZiAodHVybkluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZvcms6IG5vIHR1cm5zIHRvIGZvcmsgZnJvbScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR1cm5JZCA9IHByb3RvY29sU3RhdGUhLnR1cm5zW3R1cm5JbmRleF0uaWQ7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgZm9ya2VkU2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2NyZWF0ZUFuZFN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsIGxhc3RUdXJuTW9kZWxTZWxlY3Rpb24ocHJvdG9jb2xTdGF0ZSksIHtcblx0XHRcdHNlc3Npb246IGJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0dHVybkluZGV4LFxuXHRcdFx0dHVybklkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZm9ya2VkUmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoZm9ya2VkU2Vzc2lvbik7XG5cdFx0Y29uc3QgZm9ya2VkUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5fY29uZmlnLnNlc3Npb25UeXBlLCBwYXRoOiBgLyR7Zm9ya2VkUmF3SWR9YCB9KTtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG5cdFx0Y29uc3QgZm9ya2VkVGl0bGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoZm9ya2VkU2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGU7XG5cdFx0Y29uc3QgZm9ya2VkTGFiZWwgPSBmb3JrZWRUaXRsZSB8fCBjaGF0TW9kZWw/LnRpdGxlIHx8IGxvY2FsaXplKCdhZ2VudEhvc3QuZm9ya2VkU2Vzc2lvbkxhYmVsJywgXCJGb3JrZWQgU2Vzc2lvblwiKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogZm9ya2VkUmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogZm9ya2VkTGFiZWwsXG5cdFx0XHRpY29uUGF0aDogZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKHRoaXMuX2NvbmZpZy5zZXNzaW9uVHlwZSksXG5cdFx0XHR0aW1pbmc6IHsgY3JlYXRlZDogbm93LCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG5vdywgbGFzdFJlcXVlc3RFbmRlZDogbm93IH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZVJlcXVpcmVkQXV0aGVudGljYXRpb24oKTogUHJvbWlzZTxQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10+IHtcblx0XHRjb25zdCBhZ2VudEluZm8gPSB0aGlzLl9nZXRSb290U3RhdGUoKT8uYWdlbnRzLmZpbmQoYSA9PiBhLnByb3ZpZGVyID09PSB0aGlzLl9jb25maWcucHJvdmlkZXIpO1xuXHRcdGNvbnN0IHByb3RlY3RlZFJlc291cmNlcyA9IGFnZW50SW5mbz8ucHJvdGVjdGVkUmVzb3VyY2VzID8/IFtdO1xuXHRcdGNvbnN0IGhhc1JlcXVpcmVkQXV0aCA9IHByb3RlY3RlZFJlc291cmNlcy5zb21lKHIgPT4gci5yZXF1aXJlZCAhPT0gZmFsc2UpO1xuXHRcdGlmIChoYXNSZXF1aXJlZEF1dGggJiYgdGhpcy5fY29uZmlnLnJlc29sdmVBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0Y29uc3QgYXV0aGVudGljYXRlZCA9IGF3YWl0IHRoaXMuX2NvbmZpZy5yZXNvbHZlQXV0aGVudGljYXRpb24ocHJvdGVjdGVkUmVzb3VyY2VzKTtcblx0XHRcdGlmICghYXV0aGVudGljYXRlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2FnZW50SG9zdC5hdXRoUmVxdWlyZWQnLCBcIkF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkIHRvIHN0YXJ0IGEgc2Vzc2lvbi4gUGxlYXNlIHNpZ24gaW4gYW5kIHRyeSBhZ2Fpbi5cIikpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcHJvdGVjdGVkUmVzb3VyY2VzO1xuXHR9XG5cblx0LyoqIENyZWF0ZXMgYSBuZXcgYmFja2VuZCBzZXNzaW9uIGFuZCBzdWJzY3JpYmVzIHRvIGl0cyBzdGF0ZS4gKi9cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlQW5kU3Vic2NyaWJlKHNlc3Npb25SZXNvdXJjZTogVVJJLCBtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsIGZvcms/OiB7IHNlc3Npb246IFVSSTsgdHVybkluZGV4OiBudW1iZXI7IHR1cm5JZDogc3RyaW5nIH0sIGNvbmZpZz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBpbXBvcnRDb252ZXJzYXRpb24/OiB7IHJlYWRvbmx5IHR1cm5zOiByZWFkb25seSBUdXJuW107IHJlYWRvbmx5IG1vZGVsPzogTW9kZWxTZWxlY3Rpb24gfSwgb25GYWlsdXJlU3RhZ2U/OiAoc3RhZ2U6IEFnZW50SG9zdEludm9jYXRpb25GYWlsdXJlU3RhZ2UpID0+IHZvaWQpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX3Jlc29sdmVSZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXF1ZXN0ZWRTZXNzaW9uID0gZm9yayA/IHVuZGVmaW5lZCA6IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0XSBDcmVhdGluZyBuZXcgc2Vzc2lvbiwgbW9kZWw9JHttb2RlbD8uaWQgPz8gJyhkZWZhdWx0KSd9LCBwcm92aWRlcj0ke3RoaXMuX2NvbmZpZy5wcm92aWRlcn0ke2ZvcmsgPyBgLCBmb3JrIGZyb20gJHtmb3JrLnNlc3Npb24udG9TdHJpbmcoKX0gYXQgaW5kZXggJHtmb3JrLnR1cm5JbmRleH1gIDogJyd9YCk7XG5cblx0XHRvbkZhaWx1cmVTdGFnZT8uKCdhdXRoZW50aWNhdGlvbicpO1xuXHRcdGNvbnN0IHByb3RlY3RlZFJlc291cmNlcyA9IGF3YWl0IHRoaXMuX2Vuc3VyZVJlcXVpcmVkQXV0aGVudGljYXRpb24oKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2dldEN1cnJlbnRBY3RpdmVDbGllbnQoKTtcblxuXHRcdC8vIE9wdCBpbiB0byBicmluZy11cCBwcm9ncmVzcyAoY2hpZWZseSB0aGUgbGF6eSBmaXJzdC11c2UgU0RLIGRvd25sb2FkKVxuXHRcdC8vIHNvIHRoZSBlZGl0b3Igd2luZG93IHN1cmZhY2VzIHRoZSBzYW1lIGRvd25sb2FkIG5vdGlmaWNhdGlvbiB0aGVcblx0XHQvLyBBZ2VudHMgd2luZG93IGRvZXMuIFRoZSBob3N0IGVjaG9lcyB0aGUgZG93bmxvYWQncyBvd24gaWRlbnRpdHkgb25cblx0XHQvLyBlYWNoIGZyYW1lOyB0aGlzIHRva2VuIG9ubHkgcmVjb3JkcyBpbnRlcmVzdC5cblx0XHRjb25zdCBwcm9ncmVzc1Rva2VuID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHRsZXQgc2Vzc2lvbjogVVJJO1xuXHRcdG9uRmFpbHVyZVN0YWdlPy4oJ2NyZWF0ZVNlc3Npb24nKTtcblx0XHR0cnkge1xuXHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRzZXNzaW9uOiByZXF1ZXN0ZWRTZXNzaW9uLFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0cHJvdmlkZXI6IHRoaXMuX2NvbmZpZy5wcm92aWRlcixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRmb3JrLFxuXHRcdFx0XHRjb25maWcsXG5cdFx0XHRcdGltcG9ydENvbnZlcnNhdGlvbixcblx0XHRcdFx0YWN0aXZlQ2xpZW50LFxuXHRcdFx0XHRwcm9ncmVzc1Rva2VuLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBJZiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZCAoZS5nLiB0b2tlbiBleHBpcmVkKSwgdHJ5IGludGVyYWN0aXZlIGF1dGggYW5kIHJldHJ5IG9uY2Vcblx0XHRcdGlmICh0aGlzLl9pc0F1dGhSZXF1aXJlZEVycm9yKGVycikgJiYgdGhpcy5fY29uZmlnLnJlc29sdmVBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRvbkZhaWx1cmVTdGFnZT8uKCdhdXRoZW50aWNhdGlvbicpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tBZ2VudEhvc3RdIEF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkLCBwcm9tcHRpbmcgdXNlci4uLicpO1xuXHRcdFx0XHRjb25zdCBhdXRoZW50aWNhdGVkID0gYXdhaXQgdGhpcy5fY29uZmlnLnJlc29sdmVBdXRoZW50aWNhdGlvbihwcm90ZWN0ZWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRpZiAoYXV0aGVudGljYXRlZCkge1xuXHRcdFx0XHRcdG9uRmFpbHVyZVN0YWdlPy4oJ2NyZWF0ZVNlc3Npb24nKTtcblx0XHRcdFx0XHRzZXNzaW9uID0gYXdhaXQgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0XHRzZXNzaW9uOiByZXF1ZXN0ZWRTZXNzaW9uLFxuXHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHRwcm92aWRlcjogdGhpcy5fY29uZmlnLnByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRcdFx0Zm9yayxcblx0XHRcdFx0XHRcdGNvbmZpZyxcblx0XHRcdFx0XHRcdGltcG9ydENvbnZlcnNhdGlvbixcblx0XHRcdFx0XHRcdGFjdGl2ZUNsaWVudCxcblx0XHRcdFx0XHRcdHByb2dyZXNzVG9rZW4sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdhZ2VudEhvc3QuYXV0aFJlcXVpcmVkJywgXCJBdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZCB0byBzdGFydCBhIHNlc3Npb24uIFBsZWFzZSBzaWduIGluIGFuZCB0cnkgYWdhaW4uXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXF1ZXN0ZWRTZXNzaW9uICYmICFpc0VxdWFsKHNlc3Npb24sIHJlcXVlc3RlZFNlc3Npb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50IGhvc3QgcmV0dXJuZWQgdW5leHBlY3RlZCBzZXNzaW9uIFVSSS4gRXhwZWN0ZWQgJHtyZXF1ZXN0ZWRTZXNzaW9uLnRvU3RyaW5nKCl9LCBnb3QgJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdF0gQ3JlYXRlZCBzZXNzaW9uOiAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblxuXHRcdC8vIFN1YnNjcmliZSB0byB0aGUgbmV3IHNlc3Npb24ncyBzdGF0ZVxuXHRcdG9uRmFpbHVyZVN0YWdlPy4oJ3N1YnNjcmliZVNlc3Npb24nKTtcblx0XHRjb25zdCBuZXdTdWIgPSB0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0aWYgKCF0aGlzLl9nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKSkge1xuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHN1YnNjcmlwdGlvbiB0byBoeWRyYXRlLiBgX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZGBcblx0XHRcdC8vIHNldHRsZXMgb24gc25hcHNob3QsIGVycm9yLCBvciBjYW5jZWxsYXRpb24gYW5kIGF0dGFjaGVzIGl0c1xuXHRcdFx0Ly8gbGlzdGVuZXJzIGJlZm9yZSByZS1jaGVja2luZyB0aGUgdmFsdWUsIGNsb3NpbmcgdGhlIHJhY2Ugd2hlcmUgYVxuXHRcdFx0Ly8gY29uY3VycmVudCBjb25zdW1lciAoZS5nLiB0aGUgY2hhdC1pbnB1dCBwaWNrZXIpIGh5ZHJhdGVzIHRoZVxuXHRcdFx0Ly8gc3Vic2NyaXB0aW9uIGJldHdlZW4gb3VyIGNoZWNrIGFuZCB0aGUgbGlzdGVuZXIgYXR0YWNobWVudC4gSXRcblx0XHRcdC8vIGFsc28gc2V0dGxlcyBvbiBgb25EaWRFcnJvcmAgXHUyMDE0IGEgZmFpbGVkIHN1YnNjcmliZSBmbGlwcyB0aGVcblx0XHRcdC8vIHN1YnNjcmlwdGlvbiB2aWEgYHNldEVycm9yYCwgd2hpY2ggZmlyZXMgYG9uRGlkRXJyb3JgIGJ1dCBOT1Rcblx0XHRcdC8vIGBvbkRpZENoYW5nZWAsIHNvIGFuIGBvbkRpZENoYW5nZWAtb25seSB3YWl0IHdvdWxkIGhhbmcgZm9yIHRoZVxuXHRcdFx0Ly8gZnVsbCB0dXJuIHRpbWVvdXQgKGlzc3VlICM1MjQyKS5cblx0XHRcdGF3YWl0IHRoaXMuX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZChuZXdTdWIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd1N0YXRlID0gdGhpcy5fcmVxdWlyZVJhd1Nlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9yZXNvbHZlQ2hhdFVyaUZyb21TdGF0ZShzZXNzaW9uUmVzb3VyY2UsIHJhd1N0YXRlKTtcblx0XHR0aGlzLl9zZXRDaGF0VVJJKHNlc3Npb25SZXNvdXJjZSwgY2hhdFVSSSk7XG5cdFx0Y29uc3QgY2hhdFN1YiA9IHRoaXMuX2Vuc3VyZUNoYXRTdWJzY3JpcHRpb24oc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0VVJJKTtcblx0XHRpZiAoIWZvcmspIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25zLmdldChzZXNzaW9uUmVzb3VyY2UpPy5zZXRTdGF0ZVN1YnNjcmlwdGlvbnMobmV3U3ViLCBjaGF0U3ViKTtcblx0XHR9XG5cblx0XHQvLyBTdGFydCBzeW5jaW5nIHRoZSBjaGF0IG1vZGVsJ3MgcGVuZGluZyByZXF1ZXN0cyB0byB0aGUgcHJvdG9jb2xcblx0XHR0aGlzLl9lbnN1cmVQZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbihzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb24pO1xuXG5cdFx0Ly8gU3RhcnQgd2F0Y2hpbmcgZm9yIHNlcnZlci1pbml0aWF0ZWQgdHVybnMgb24gdGhpcyBzZXNzaW9uXG5cdFx0dGhpcy5fd2F0Y2hGb3JTZXJ2ZXJJbml0aWF0ZWRUdXJucyhzZXNzaW9uLCBzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogS2VlcHMgY2hhdCBtb2RlbCBhbmQgcHJvdG9jb2wgcGVuZGluZyBtZXNzYWdlcyBzeW5jaHJvbml6ZWQgaW4gYm90aCBkaXJlY3Rpb25zLlxuXHQgKiBOby1vcHMgaWYgYWxyZWFkeSBzdWJzY3JpYmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlUGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGJhY2tlbmRTZXNzaW9uOiBVUkkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlPy5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGNoYXRNb2RlbCkge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgc3RvcmUpO1xuXG5cdFx0XHQvLyBIeWRyYXRlIGZpcnN0IHNvIHRoZSBpbml0aWFsIG91dGJvdW5kIGRpZmYgY2Fubm90IHJlbW92ZSBhbm90aGVyIGNsaWVudCdzIG1lc3NhZ2VzLlxuXHRcdFx0dGhpcy5fYXBwbHlSZW1vdGVQZW5kaW5nTWVzc2FnZXMoc2Vzc2lvblJlc291cmNlLCBiYWNrZW5kU2Vzc2lvbik7XG5cblx0XHRcdHN0b3JlLmFkZChjaGF0TW9kZWwub25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zeW5jUGVuZGluZ01lc3NhZ2VzKHNlc3Npb25SZXNvdXJjZSwgYmFja2VuZFNlc3Npb24pO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fc3luY1BlbmRpbmdNZXNzYWdlcyhzZXNzaW9uUmVzb3VyY2UsIGJhY2tlbmRTZXNzaW9uKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gdGhpcy5fY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZS5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChjaGF0VVJJKSB7XG5cdFx0XHRcdGNvbnN0IG9uUmVtb3RlQ2hhbmdlID0gKCkgPT4gdGhpcy5fYXBwbHlSZW1vdGVQZW5kaW5nTWVzc2FnZXMoc2Vzc2lvblJlc291cmNlLCBiYWNrZW5kU2Vzc2lvbik7XG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHNlc3Npb25TdHIpLm9uRGlkQ2hhbmdlKG9uUmVtb3RlQ2hhbmdlKSk7XG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9lbnN1cmVDaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25TdHIsIGNoYXRVUkkpLm9uRGlkQ2hhbmdlKG9uUmVtb3RlQ2hhbmdlKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkQ3JlYXRlTW9kZWwobW9kZWwgPT4ge1xuXHRcdFx0aWYgKCFpc0VxdWFsKG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fZW5zdXJlUGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb24oc2Vzc2lvblJlc291cmNlLCBiYWNrZW5kU2Vzc2lvbik7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlRHJhZnRTeW5jU3Vic2NyaXB0aW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBiYWNrZW5kU2Vzc2lvbjogVVJJLCBjaGF0S2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZHJhZnRTeW5jU3Vic2NyaXB0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9kcmFmdFN5bmNTdWJzY3JpcHRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHN0b3JlKTtcblx0XHR0aGlzLl9hY3F1aXJlT3JXYWl0Rm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIHN0b3JlKS50aGVuKGNoYXRNb2RlbCA9PiB7XG5cdFx0XHRpZiAoIWNoYXRNb2RlbCB8fCBzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luc3RhbGxEcmFmdFN5bmMoc2Vzc2lvblJlc291cmNlLCBjaGF0TW9kZWwsIGJhY2tlbmRTZXNzaW9uLCBjaGF0S2V5LCBzdG9yZSk7XG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gd2FpdCBmb3IgY2hhdCBtb2RlbCBmb3IgZHJhZnQgc3luYzogJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWNxdWlyZU9yV2FpdEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG93bmVyOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPElDaGF0TW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3Qgd2FpdFN0b3JlID0gb3duZXIuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0d2FpdFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRcdHdhaXRTdG9yZS5hZGQodGhpcy5fY2hhdFNlcnZpY2Uub25EaWRDcmVhdGVNb2RlbChtb2RlbCA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWwobW9kZWwuc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKG1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR3YWl0U3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2luc3RhbGxEcmFmdFN5bmMoc2Vzc2lvblJlc291cmNlOiBVUkksIGNoYXRNb2RlbDogSUNoYXRNb2RlbCwgYmFja2VuZFNlc3Npb246IFVSSSwgY2hhdEtleTogc3RyaW5nLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXRNb2RlbCA9IGNoYXRNb2RlbC5pbnB1dE1vZGVsO1xuXHRcdGlmICghaW5wdXRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZWxheWVyID0gc3RvcmUuYWRkKG5ldyBEZWxheWVyPHZvaWQ+KEFnZW50SG9zdFNlc3Npb25IYW5kbGVyLkRSQUZUX1NZTkNfREVCT1VOQ0VfTVMpKTtcblx0XHRjb25zdCBjaGF0U3Vic2NyaXB0aW9uID0gdGhpcy5fZW5zdXJlQ2hhdFN1YnNjcmlwdGlvbihiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCBjaGF0S2V5KTtcblx0XHRjb25zdCByZWFkUmVtb3RlRHJhZnQgPSAoKTogTWVzc2FnZSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGNoYXRTdWJzY3JpcHRpb24udmFsdWU7XG5cdFx0XHRyZXR1cm4gdmFsdWUgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSA/IHZhbHVlLmRyYWZ0IDogdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0bGV0IHN5bmNlZERyYWZ0ID0gcmVhZFJlbW90ZURyYWZ0KCk7XG5cdFx0Ly8gVGhlIGxhc3QgYGRyYWZ0YCBvYmplY3Qgc2VlbiBvbiB0aGUgY2hhdCBjaGFubmVsLiBQcm90b2NvbCBzdGF0ZSBpc1xuXHRcdC8vIGltbXV0YWJsZSwgc28gYW4gaWRlbnRpY2FsIHJlZmVyZW5jZSBtZWFucyB0aGUgZHJhZnQgZGlkIG5vdCBjaGFuZ2UgXHUyMDE0XG5cdFx0Ly8gbGV0dGluZyB0aGUgbGlzdGVuZXIgYmFpbCBvbiBhIHJlZmVyZW5jZSBjaGVjayBpbnN0ZWFkIG9mIGEgZGVlcFxuXHRcdC8vIGNvbXBhcmUsIHdoaWNoIG1hdHRlcnMgYmVjYXVzZSBpdCBydW5zIG9uIGV2ZXJ5IGNoYXQgc3RhdGUgY2hhbmdlXG5cdFx0Ly8gKGVhY2ggc3RyZWFtaW5nIGRlbHRhKSwgbm90IGp1c3QgZHJhZnQgY2hhbmdlcy5cblx0XHRsZXQgbGFzdFJlbW90ZURyYWZ0ID0gc3luY2VkRHJhZnQ7XG5cdFx0bGV0IGFwcGxpZWRSZW1vdGVEcmFmdDogTWVzc2FnZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzeW5jRHJhZnQgPSAoc3RhdGU6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCA9PiB7XG5cdFx0XHRpZiAoc3RhdGU/Lm9yaWdpbiA9PT0gQ2hhdElucHV0U3RhdGVPcmlnaW4uUmVtb3RlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRyYWZ0ID0gdGhpcy5faW5wdXRTdGF0ZVRvRHJhZnQoc2Vzc2lvblJlc291cmNlLCBzdGF0ZSk7XG5cdFx0XHRpZiAoZXF1YWxzKHN5bmNlZERyYWZ0LCBkcmFmdCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFwcGxpZWRSZW1vdGVEcmFmdCAmJiBzYW1lRHJhZnRVc2VyQ29udGVudChkcmFmdCwgYXBwbGllZFJlbW90ZURyYWZ0KSkge1xuXHRcdFx0XHRzeW5jZWREcmFmdCA9IGRyYWZ0O1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhcHBsaWVkUmVtb3RlRHJhZnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRzeW5jZWREcmFmdCA9IGRyYWZ0O1xuXG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChjaGF0S2V5LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCxcblx0XHRcdFx0ZHJhZnQsXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGlucHV0TW9kZWwuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0ZGVsYXllci50cmlnZ2VyKCgpID0+IHN5bmNEcmFmdChzdGF0ZSkpLmNhdGNoKCgpID0+IHsgLyogZGVsYXllciBkaXNwb3NlZCAqLyB9KTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGNoYXRTdWJzY3JpcHRpb24ub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRHJhZnQgPSByZWFkUmVtb3RlRHJhZnQoKTtcblx0XHRcdGlmIChyZW1vdGVEcmFmdCA9PT0gbGFzdFJlbW90ZURyYWZ0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxhc3RSZW1vdGVEcmFmdCA9IHJlbW90ZURyYWZ0O1xuXHRcdFx0aWYgKGVxdWFscyhzeW5jZWREcmFmdCwgcmVtb3RlRHJhZnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxvY2FsRHJhZnQgPSB0aGlzLl9pbnB1dFN0YXRlVG9EcmFmdChzZXNzaW9uUmVzb3VyY2UsIGlucHV0TW9kZWwuc3RhdGUuZ2V0KCkpO1xuXHRcdFx0aWYgKCFlcXVhbHMoc3luY2VkRHJhZnQsIGxvY2FsRHJhZnQpKSB7XG5cdFx0XHRcdC8vIFRoZSBwZW5kaW5nIG91dGJvdW5kIGRlYm91bmNlIHdpbGwgcHVibGlzaCB0aGUgbG9jYWwgZWRpdCAobGFzdCB3cml0ZXIgd2lucykuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHN5bmNlZERyYWZ0ID0gcmVtb3RlRHJhZnQ7XG5cdFx0XHRhcHBsaWVkUmVtb3RlRHJhZnQgPSByZW1vdGVEcmFmdDtcblx0XHRcdHRoaXMuX2FwcGx5UmVtb3RlRHJhZnQoaW5wdXRNb2RlbCwgc2Vzc2lvblJlc291cmNlLCByZW1vdGVEcmFmdCk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZGVsYXllci5jYW5jZWwoKTtcblx0XHRcdHN5bmNEcmFmdChpbnB1dE1vZGVsLnN0YXRlLmdldCgpKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKiogQXBwbGllcyBhIHJlbW90ZSBkcmFmdCB3aXRob3V0IHJlcGxhY2luZyBsb2NhbCBpbnB1dCBzdGF0ZSB0aGUgcHJvdG9jb2wgZG9lcyBub3QgY2FycnkuICovXG5cdHByaXZhdGUgX2FwcGx5UmVtb3RlRHJhZnQoaW5wdXRNb2RlbDogSUlucHV0TW9kZWwsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBkcmFmdDogTWVzc2FnZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghZHJhZnQpIHtcblx0XHRcdGlucHV0TW9kZWwuc2V0U3RhdGUoe1xuXHRcdFx0XHRpbnB1dFRleHQ6ICcnLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBbXSxcblx0XHRcdFx0YXR0YWNobWVudHM6IFtdLFxuXHRcdFx0XHRvcmlnaW46IENoYXRJbnB1dFN0YXRlT3JpZ2luLlJlbW90ZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJpYWxpemVkU3RhdGUgPSB0aGlzLl9kcmFmdFRvSW5wdXRTdGF0ZShzZXNzaW9uUmVzb3VyY2UsIGRyYWZ0KTtcblx0XHRpZiAoIXNlcmlhbGl6ZWRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ZSA9IHJldml2ZVNlcmlhbGl6YWJsZUlucHV0U3RhdGUoc2VyaWFsaXplZFN0YXRlKTtcblx0XHRjb25zdCBwYXJ0aWFsU3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+ID0ge1xuXHRcdFx0aW5wdXRUZXh0OiBzdGF0ZS5pbnB1dFRleHQsXG5cdFx0XHRzZWxlY3Rpb25zOiBzdGF0ZS5zZWxlY3Rpb25zLFxuXHRcdFx0YXR0YWNobWVudHM6IHN0YXRlLmF0dGFjaG1lbnRzLFxuXHRcdFx0bW9kZTogc3RhdGUubW9kZSxcblx0XHRcdG9yaWdpbjogQ2hhdElucHV0U3RhdGVPcmlnaW4uUmVtb3RlLFxuXHRcdH07XG5cdFx0aWYgKHN0YXRlLnNlbGVjdGVkTW9kZWwpIHtcblx0XHRcdHBhcnRpYWxTdGF0ZS5zZWxlY3RlZE1vZGVsID0gc3RhdGUuc2VsZWN0ZWRNb2RlbDtcblx0XHRcdHBhcnRpYWxTdGF0ZS5tb2RlbENvbmZpZ3VyYXRpb24gPSBzdGF0ZS5tb2RlbENvbmZpZ3VyYXRpb247XG5cdFx0fVxuXHRcdGlucHV0TW9kZWwuc2V0U3RhdGUocGFydGlhbFN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX2lucHV0U3RhdGVUb0RyYWZ0KHNlc3Npb25SZXNvdXJjZTogVVJJLCBzdGF0ZTogSUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQpOiBNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NyZWF0ZU1vZGVsU2VsZWN0aW9uKHN0YXRlLnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIsIHN0YXRlLm1vZGVsQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBzdGF0ZS5tb2RlLmtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCAmJiBzdGF0ZS5tb2RlLmlkICE9PSBDaGF0TW9kZS5BZ2VudC5pZCA/IHN0YXRlLm1vZGUuaWQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSB0aGlzLl92YXJpYWJsZUVudHJpZXNUb0F0dGFjaG1lbnRzKHN0YXRlLmF0dGFjaG1lbnRzLCBzZXNzaW9uUmVzb3VyY2UsIHN0YXRlLmlucHV0VGV4dCk7XG5cdFx0aWYgKCFzdGF0ZS5pbnB1dFRleHQgJiYgIW1vZGVsICYmICFhZ2VudFVyaSAmJiBhdHRhY2htZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHR0ZXh0OiBzdGF0ZS5pbnB1dFRleHQsXG5cdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0Li4uKGF0dGFjaG1lbnRzLmxlbmd0aCA+IDAgPyB7IGF0dGFjaG1lbnRzIH0gOiB7fSksXG5cdFx0XHQuLi4obW9kZWwgPyB7IG1vZGVsIH0gOiB7fSksXG5cdFx0XHQuLi4oYWdlbnRVcmkgPyB7IGFnZW50OiB7IHVyaTogYWdlbnRVcmkgfSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgYW4gZXJyb3IgaXMgYW4gXCJhdXRoZW50aWNhdGlvbiByZXF1aXJlZFwiIGVycm9yLlxuXHQgKiBDaGVja3MgZm9yIHRoZSBBSFBfQVVUSF9SRVFVSVJFRCBlcnJvciBjb2RlIHdoZW4gYXZhaWxhYmxlLFxuXHQgKiB3aXRoIGEgbWVzc2FnZS1iYXNlZCBmYWxsYmFjayBmb3IgdHJhbnNwb3J0cyB0aGF0IGRvbid0IHByZXNlcnZlXG5cdCAqIHN0cnVjdHVyZWQgZXJyb3IgY29kZXMgKGUuZy4gUHJveHlDaGFubmVsKS5cblx0ICovXG5cdHByaXZhdGUgX2lzQXV0aFJlcXVpcmVkRXJyb3IoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IgJiYgZXJyLmNvZGUgPT09IEFIUF9BVVRIX1JFUVVJUkVEKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIGVyci5tZXNzYWdlLmluY2x1ZGVzKCdBdXRoZW50aWNhdGlvbiByZXF1aXJlZCcpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTW9kZWxTZWxlY3Rpb24obGFuZ3VhZ2VNb2RlbElkZW50aWZpZXI6IHN0cmluZyB8IHVuZGVmaW5lZCwgbW9kZWxDb25maWd1cmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYXdNb2RlbElkID0gdGhpcy5fZXh0cmFjdFJhd01vZGVsSWQobGFuZ3VhZ2VNb2RlbElkZW50aWZpZXIpO1xuXHRcdGlmICghcmF3TW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBGb3J3YXJkIG1vZGVsLXNwZWNpZmljIGNvbmZpZyB2YWx1ZXMgYXMtaXMuIE1vc3QgcGlja2VycyBwcm9kdWNlIHN0cmluZ3MsXG5cdFx0Ly8gYnV0IGEgc3ludGhlc2l6ZWQgbnVtZXJpYyBwaWNrZXIgKGUuZy4gdGhlIGNvbnRleHQtc2l6ZSBwaWNrZXIsIHdob3NlIGVudW1cblx0XHQvLyB2YWx1ZXMgYXJlIHRva2VuIGNvdW50cykgaGFuZHMgYmFjayBhIG51bWJlcjsgdGhlIHByb3RvY29sIGBjb25maWdgIGJhZ1xuXHRcdC8vIGNhcnJpZXMgSlNPTiBwcmltaXRpdmVzLCBzbyB0aGUgc2VsZWN0aW9uIHN1cnZpdmVzIGludG8gaXQgKGFuZCBpcyBtYXBwZWRcblx0XHQvLyB0byB0aGUgU0RLIGNvbnRleHQgdGllciBieSB0aGUgYWdlbnQncyBgZ2V0Q29waWxvdENvbnRleHRUaWVyYCkuXG5cdFx0Y29uc3QgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBKc29uUHJpbWl0aXZlPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1vZGVsQ29uZmlndXJhdGlvbiA/PyB7fSkpIHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdFx0Y29uZmlnW2tleV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gT2JqZWN0LmtleXMoY29uZmlnKS5sZW5ndGggPiAwID8geyBpZDogcmF3TW9kZWxJZCwgY29uZmlnIH0gOiB7IGlkOiByYXdNb2RlbElkIH07XG5cdH1cblxuXHRwcml2YXRlIF9kcmFmdFRvSW5wdXRTdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZHJhZnQ6IE1lc3NhZ2UgfCB1bmRlZmluZWQpOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFkcmFmdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZSwgZHJhZnQubW9kZWw/LmlkKTtcblx0XHRjb25zdCBtZXRhZGF0YSA9IG1vZGVsSWQgPyB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB2YXJpYWJsZURhdGEgPSBtZXNzYWdlQXR0YWNobWVudHNUb1ZhcmlhYmxlRGF0YShkcmFmdC5hdHRhY2htZW50cywgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksIGRyYWZ0LnRleHQpO1xuXHRcdGNvbnN0IGN1cnNvciA9IG9mZnNldFRvUG9zaXRpb24oZHJhZnQudGV4dCwgZHJhZnQudGV4dC5sZW5ndGgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhdHRhY2htZW50czogdmFyaWFibGVEYXRhPy52YXJpYWJsZXMgPz8gW10sXG5cdFx0XHRjb250cmliOiB7fSxcblx0XHRcdGlucHV0VGV4dDogZHJhZnQudGV4dCxcblx0XHRcdG1vZGU6IHsgaWQ6IGRyYWZ0LmFnZW50Py51cmkgPz8gQ2hhdE1vZGUuQWdlbnQuaWQsIGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCB9LFxuXHRcdFx0c2VsZWN0ZWRNb2RlbDogbW9kZWxJZCAmJiBtZXRhZGF0YSA/IHtcblx0XHRcdFx0aWRlbnRpZmllcjogbW9kZWxJZCxcblx0XHRcdFx0bWV0YWRhdGEsXG5cdFx0XHRcdC4uLihkcmFmdC5tb2RlbD8uY29uZmlnID8geyBtb2RlbENvbmZpZ3VyYXRpb246IGRyYWZ0Lm1vZGVsLmNvbmZpZyB9IDoge30pLFxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdHNlbGVjdGlvbnM6IFt7XG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0TGluZU51bWJlcjogY3Vyc29yLmxpbmVOdW1iZXIsXG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0Q29sdW1uOiBjdXJzb3IuY29sdW1uLFxuXHRcdFx0XHRwb3NpdGlvbkxpbmVOdW1iZXI6IGN1cnNvci5saW5lTnVtYmVyLFxuXHRcdFx0XHRwb3NpdGlvbkNvbHVtbjogY3Vyc29yLmNvbHVtbixcblx0XHRcdH1dLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogRXh0cmFjdHMgdGhlIHJhdyBtb2RlbCBpZCBmcm9tIGEgbGFuZ3VhZ2UtbW9kZWwgc2VydmljZSBpZGVudGlmaWVyLlxuXHQgKiBFLmcuIFwiYWdlbnQtaG9zdC1jb3BpbG90OmNsYXVkZS1zb25uZXQtNC0yMDI1MDUxNFwiIFx1MjE5MiBcImNsYXVkZS1zb25uZXQtNC0yMDI1MDUxNFwiLlxuXHQgKiBGb3JlaWduIGV4dGVuc2lvbi1ob3N0IGlkZW50aWZpZXJzIChgJHt2ZW5kb3J9LyR7aWR9YCkgYXJlIGRyb3BwZWQgc29cblx0ICogdGhlIGFnZW50IGhvc3QgZmFsbHMgYmFjayB0byBpdHMgZGVmYXVsdCBtb2RlbC5cblx0ICovXG5cdHByaXZhdGUgX2V4dHJhY3RSYXdNb2RlbElkKGxhbmd1YWdlTW9kZWxJZGVudGlmaWVyOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghbGFuZ3VhZ2VNb2RlbElkZW50aWZpZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZWZpeCA9IHRoaXMuX2NvbmZpZy5zZXNzaW9uVHlwZSArICc6Jztcblx0XHRpZiAobGFuZ3VhZ2VNb2RlbElkZW50aWZpZXIuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VNb2RlbElkZW50aWZpZXIuc3Vic3RyaW5nKHByZWZpeC5sZW5ndGgpO1xuXHRcdH1cblx0XHRpZiAobGFuZ3VhZ2VNb2RlbElkZW50aWZpZXIuaW5jbHVkZXMoJy8nKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBEcm9wcGluZyBmb3JlaWduIG1vZGVsIGlkZW50aWZpZXIgJyR7bGFuZ3VhZ2VNb2RlbElkZW50aWZpZXJ9JyBmb3Igc2Vzc2lvbiB0eXBlICcke3RoaXMuX2NvbmZpZy5zZXNzaW9uVHlwZX0nOyBmYWxsaW5nIGJhY2sgdG8gZGVmYXVsdCBtb2RlbC5gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBsYW5ndWFnZU1vZGVsSWRlbnRpZmllcjtcblx0fVxuXG5cdHByaXZhdGUgX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZTogVVJJLCByYXdNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmF3TW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJlZml4ID0gYCR7Z2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSl9OmA7XG5cdFx0cmV0dXJuIHJhd01vZGVsSWQuc3RhcnRzV2l0aChwcmVmaXgpID8gcmF3TW9kZWxJZCA6IGAke3ByZWZpeH0ke3Jhd01vZGVsSWR9YDtcblx0fVxuXG5cdHByaXZhdGUgX2dldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZShtb2RlbElkZW50aWZpZXI6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFtb2RlbElkZW50aWZpZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gbWV0YWRhdGEgPyBnZXRMYW5ndWFnZU1vZGVsRGlzcGxheU5hbWVXaXRoUHJvdmlkZXIoeyBpZGVudGlmaWVyOiBtb2RlbElkZW50aWZpZXIsIG1ldGFkYXRhIH0sIHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUdXJuUmVzcG9uc2VEZXRhaWxzKHNlc3Npb25SZXNvdXJjZTogVVJJLCBiYWNrZW5kU2Vzc2lvbjogVVJJLCB0dXJuOiBUdXJuIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmYWxsYmFja1Jhd01vZGVsSWQgPSB0dXJuPy5tZXNzYWdlPy5tb2RlbD8uaWQgPz8gbGFzdFR1cm5Nb2RlbFNlbGVjdGlvbih0aGlzLl9nZXRTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSkpPy5pZDtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlVHVybk1vZGVsTG9va3VwKHNlc3Npb25SZXNvdXJjZSwgZmFsbGJhY2tSYXdNb2RlbElkKS50b1Jlc3BvbnNlRGV0YWlscyh0dXJuPy51c2FnZT8ubW9kZWwsIHR1cm4/LnVzYWdlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgYSBwZXItdHVybiBtb2RlbCBsb29rdXAgdGhhdCBuYW1lc3BhY2VzIHJhdyBBSFAgbW9kZWwgaWRzIGludG9cblx0ICogY2hhdC1sYXllciBsYW5ndWFnZS1tb2RlbCBpZHMgYW5kIHJlc29sdmVzIGh1bWFuLXJlYWRhYmxlIGRpc3BsYXlcblx0ICogbmFtZXMgdmlhIHRoZSByZWdpc3RlcmVkIGxhbmd1YWdlLW1vZGVsIHByb3ZpZGVycyAoc28gdGhlIGNoYXQgVUknc1xuXHQgKiBwZXItcmVzcG9uc2UgZm9vdGVyIGNhbiBzaG93IGUuZy4gXCJDbGF1ZGUgT3B1cyA0LjdcIiBpbnN0ZWFkIG9mIHRoZVxuXHQgKiByYXcgbW9kZWwgaWQpLiBgZmFsbGJhY2tSYXdNb2RlbElkYCBpcyB1c2VkIHdoZW4gYSB0dXJuJ3Ncblx0ICogYHVzYWdlPy5tb2RlbGAgaXMgbm90IHlldCBzZXQgKGUuZy4gb2xkZXIgc2Vzc2lvbnMgb3IgdHVybnMgdGhhdFxuXHQgKiBuZXZlciByZXBvcnRlZCB1c2FnZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9jcmVhdGVUdXJuTW9kZWxMb29rdXAoc2Vzc2lvblJlc291cmNlOiBVUkksIGZhbGxiYWNrUmF3TW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogVHVybk1vZGVsTG9va3VwIHtcblx0XHRjb25zdCByZXNvbHZlUmF3ID0gKHJhd01vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiByYXdNb2RlbElkID8/IGZhbGxiYWNrUmF3TW9kZWxJZDtcblx0XHQvLyBUcnkgdGhlIHJhdyBiaWxsZWQgaWQsIGl0cyBkb3RzLW5vcm1hbGlzZWQgZm9ybSAoc2x1ZyBtaXNtYXRjaDogYGNsYXVkZS1zb25uZXQtNC02YCBcdTIxOTIgYC42YCksXG5cdFx0Ly8gdGhlbiB0aGUgZmFsbGJhY2sgKHBpY2tlZCkgaWQuIE9ubHkgdGhlIGxhc3QgcGF0aCBzZXRzIHJlc29sdmVkRnJvbVJhdz1mYWxzZSBzbyB0aGUgY2FsbGVyXG5cdFx0Ly8gY2FuIHN1cmZhY2UgYmlsbGVkTW9kZWxJZCAoZS5nLiBcIkF1dG8gKHJhcHRvci1taW5pKVwiKSB3aGVuIHRoZSBiaWxsZWQgbW9kZWwgaXMgdW5yZWdpc3RlcmVkLlxuXHRcdGNvbnN0IGxvb2t1cE1vZGVsID0gKHJhd01vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgaWRlbnRpZmllcjogc3RyaW5nOyBtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7IHJlc29sdmVkRnJvbVJhdzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRSYXcgPSByYXdNb2RlbElkPy5yZXBsYWNlKC8tKFxcZCspJC8sICcuJDEnKTtcblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIFtyYXdNb2RlbElkLCBub3JtYWxpemVkUmF3ICE9PSByYXdNb2RlbElkID8gbm9ybWFsaXplZFJhdyA6IHVuZGVmaW5lZF0pIHtcblx0XHRcdFx0Y29uc3QgbW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZSwgY2FuZGlkYXRlKTtcblx0XHRcdFx0aWYgKCFtb2RlbElkKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZCk7XG5cdFx0XHRcdGlmIChtb2RlbCkgeyByZXR1cm4geyBpZGVudGlmaWVyOiBtb2RlbElkLCBtb2RlbCwgcmVzb2x2ZWRGcm9tUmF3OiB0cnVlIH07IH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGZhbGxiYWNrTW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZSwgZmFsbGJhY2tSYXdNb2RlbElkKTtcblx0XHRcdGlmIChmYWxsYmFja01vZGVsSWQpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChmYWxsYmFja01vZGVsSWQpO1xuXHRcdFx0XHRpZiAobW9kZWwpIHsgcmV0dXJuIHsgaWRlbnRpZmllcjogZmFsbGJhY2tNb2RlbElkLCBtb2RlbCwgcmVzb2x2ZWRGcm9tUmF3OiBmYWxzZSB9OyB9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvTGFuZ3VhZ2VNb2RlbElkOiAocmF3TW9kZWxJZCkgPT4gdGhpcy5fdG9MYW5ndWFnZU1vZGVsSWQoc2Vzc2lvblJlc291cmNlLCByZXNvbHZlUmF3KHJhd01vZGVsSWQpKSxcblx0XHRcdHRvUmVzcG9uc2VEZXRhaWxzOiAocmF3TW9kZWxJZCwgdXNhZ2UpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBsb29rdXBNb2RlbChyYXdNb2RlbElkKTtcblx0XHRcdFx0Ly8gcmVzb2x2ZWRGcm9tUmF3PWZhbHNlIG1lYW5zIHdlIGZlbGwgYmFjayB0byB0aGUgcGlja2VkIG1vZGVsOyBzdXJmYWNlIGJpbGxlZE1vZGVsSWQgc29cblx0XHRcdFx0Ly8gZS5nLiBhbiBcIkF1dG9cIiBwaWNrIHJlYWRzIFwiQXV0byAocmFwdG9yLW1pbmkpXCIuXG5cdFx0XHRcdGNvbnN0IGJpbGxlZE1vZGVsSWQgPSByZXNvbHZlZCAmJiAhcmVzb2x2ZWQucmVzb2x2ZWRGcm9tUmF3ID8gcmF3TW9kZWxJZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2VNb2RlbCA9IHJlc29sdmVkID8ge1xuXHRcdFx0XHRcdG5hbWU6IGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlcih7IGlkZW50aWZpZXI6IHJlc29sdmVkLmlkZW50aWZpZXIsIG1ldGFkYXRhOiByZXNvbHZlZC5tb2RlbCB9LCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UpLFxuXHRcdFx0XHRcdHByaWNpbmc6IHJlc29sdmVkLm1vZGVsLnByaWNpbmcsXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKHJlc3BvbnNlTW9kZWwsIGJpbGxlZE1vZGVsSWQsIHVzYWdlKTtcblx0XHRcdH0sXG5cdFx0XHR0b0F1dG9Nb2RlUmVzb2x1dGlvbjogdXNhZ2UgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHV0aW9uID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpLmF1dG9Nb2RlUmVzb2x2ZWQ7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x1dGlvbiA/IGxvb2t1cE1vZGVsKHJlc29sdXRpb24uY2hvc2VuTW9kZWwpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZE1vZGVsTmFtZSA9IHJlc29sdmVkPy5yZXNvbHZlZEZyb21SYXcgPyByZXNvbHZlZC5tb2RlbC5uYW1lIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gdXNhZ2VJbmZvVG9BdXRvTW9kZVJlc29sdXRpb24odXNhZ2UsIHJlc29sdmVkTW9kZWxOYW1lKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVSZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Py4oc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Pz8gdGhpcy5fbmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuZ2V0Rm9sZGVyKHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdD8/IHRoaXMuX3dvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5yZXNvbHZlKHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdD8/IHRoaXMuX25ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLmdldERlZmF1bHRGb2xkZXIoKVxuXHRcdFx0Pz8gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXT8udXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVJlcXVlc3RlZFdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcmltYXJ5ID0gdGhpcy5fcmVzb2x2ZVJlcXVlc3RlZFdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gY29tcHV0ZVdvcmtpbmdEaXJlY3RvcmllcyhwcmltYXJ5LCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSksIHRoaXMuX2dldFJvb3RTdGF0ZSgpLCB0aGlzLl9jb25maWcucHJvdmlkZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuc3VyZXMgdGhlIHdvcmtzcGFjZS9mb2xkZXIgdGhlIGFnZW50IHdpbGwgcnVuIGluIGlzIHRydXN0ZWQgYmVmb3JlIGFcblx0ICogc2Vzc2lvbiBpcyBzcGF3bmVkLiBSZXR1cm5zIGBmYWxzZWAgaWYgdGhlIHVzZXIgZGVjbGluZXMuXG5cdCAqXG5cdCAqIFdoZW4gdGhlIGFnZW50IHJ1bnMgaW5zaWRlIHRoZSBjdXJyZW50bHkgb3BlbiB3b3Jrc3BhY2UgKGVkaXRvciB3aW5kb3cpLFxuXHQgKiBnYXRlIG9uIHdvcmtzcGFjZSB0cnVzdCB0byBtYXRjaCBob3cgZXh0ZW5zaW9uLWhvc3QgY2hhdCBpcyBnYXRlZC4gV2hlblxuXHQgKiBpdCB0YXJnZXRzIGEgc3RhbmRhbG9uZSBmb2xkZXIgb3V0c2lkZSB0aGUgb3BlbiB3b3Jrc3BhY2UgKEFnZW50cyB3aW5kb3dcblx0ICogcGVyLXNlc3Npb24gZm9sZGVycyksIGdhdGUgb24gdGhhdCBmb2xkZXIncyB0cnVzdCBpbnN0ZWFkLiBCb3RoIHJlcXVlc3Rcblx0ICogaGVscGVycyByZXNvbHZlIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHRhcmdldCBpcyBhbHJlYWR5IHRydXN0ZWQsIHNvIHRoaXNcblx0ICogbmV2ZXIgZG91YmxlLXByb21wdHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVXb3Jrc3BhY2VUcnVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LndvcmtzcGFjZVRydXN0JywgXCJBSSBmZWF0dXJlcyBhcmUgY3VycmVudGx5IG9ubHkgc3VwcG9ydGVkIGluIHRydXN0ZWQgd29ya3NwYWNlcy5cIik7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX3Jlc29sdmVSZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkgfHwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHdvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gISFhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdCh7IG1lc3NhZ2UgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhYXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0UmVzb3VyY2VzVHJ1c3QoeyB1cmk6IHdvcmtpbmdEaXJlY3RvcnksIG1lc3NhZ2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0VmFyaWFibGVzVG9BdHRhY2htZW50cyhyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCk6IE1lc3NhZ2VBdHRhY2htZW50W10ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gdGhpcy5fdmFyaWFibGVFbnRyaWVzVG9BdHRhY2htZW50cyhyZXF1ZXN0LnZhcmlhYmxlcy52YXJpYWJsZXMsIHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdGNvbnN0IGV4cGxpY2l0Q291bnQgPSBhdHRhY2htZW50cy5sZW5ndGg7XG5cdFx0dGhpcy5fYXBwZW5kQWN0aXZlRWRpdG9yQXR0YWNobWVudHMoYXR0YWNobWVudHMsIHJlcXVlc3QpO1xuXHRcdGlmIChhdHRhY2htZW50cy5sZW5ndGggIT09IGV4cGxpY2l0Q291bnQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RdIEZvcndhcmRlZCAke2F0dGFjaG1lbnRzLmxlbmd0aCAtIGV4cGxpY2l0Q291bnR9IGFjdGl2ZSBlZGl0b3IgYXR0YWNobWVudChzKTsgJHthdHRhY2htZW50cy5sZW5ndGh9IHRvdGFsYCk7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50cztcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkIHRoZSBhY3RpdmUgZWRpdG9yICh3aGljaCB0aGUgc3VnZ2VzdGVkLWNvbnRleHQgZmxvdyBvbWl0cyBpbiBhZ2VudCBtb2RlKSBhcyBhbWJpZW50IGNvbnRleHQsIGRlZHVwZWRcblx0ICogYWdhaW5zdCBmaWxlcyB0aGUgdXNlciBhdHRhY2hlZCBleHBsaWNpdGx5LiBHYXRlZCBvblxuXHQgKiB7QGxpbmsgQ2hhdENvbmZpZ3VyYXRpb24uSW1wbGljaXRDb250ZXh0QWN0aXZlRWRpdG9yfSAob24gYnkgZGVmYXVsdCwgb2ZmIGluIHRoZSBBZ2VudHMgd2luZG93KS5cblx0ICogVW5zYXZlZCBoYW5kbGluZyBsaXZlcyBpbiB7QGxpbmsgX2NvbnZlcnRWYXJpYWJsZVRvQXR0YWNobWVudH0uXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBlbmRBY3RpdmVFZGl0b3JBdHRhY2htZW50cyhhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSwgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkltcGxpY2l0Q29udGV4dEFjdGl2ZUVkaXRvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW1wbGljaXRDb250ZXh0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpPy5pbnB1dC5pbXBsaWNpdENvbnRleHQ7XG5cdFx0aWYgKCFpbXBsaWNpdENvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gS2V5IG9uIHNvdXJjZSBlbnRyaWVzIChub3QgcHJvZHVjZWQgYXR0YWNobWVudHMpIHNvIGlubGluZWQgdW5zYXZlZCBidWZmZXJzIChubyBVUkkpIHN0aWxsIGRlZHVwZS5cblx0XHRjb25zdCBleGlzdGluZ0tleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHYgb2YgcmVxdWVzdC52YXJpYWJsZXMudmFyaWFibGVzKSB7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9maWxlRW50cnlEZWR1cGVLZXkodiwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRleGlzdGluZ0tleXMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEJhY2tlbmRzIHRoYXQgcmVhZCBmaWxlcyBmcm9tIGRpc2sgY2FuJ3Qgc2VlIGFuIHVudGl0bGVkIGJ1ZmZlciwgc28gZG9uJ3QgZm9yd2FyZCBpdCBhcyBhXG5cdFx0Ly8gYnJva2VuIHBhdGggdW5sZXNzIHdlIGlubGluZSBpdHMgbGl2ZSB0ZXh0IGJlbG93LlxuXHRcdGNvbnN0IHNraXBVbnRpdGxlZCA9ICF0aGlzLl9iYWNrZW5kSW5saW5lc1Vuc2F2ZWRFZGl0b3JzKCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBpbXBsaWNpdENvbnRleHQudmFsdWVzKSB7XG5cdFx0XHRpZiAoZW50cnkudmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChlbnRyeS51cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNraXBVbnRpdGxlZCAmJiBlbnRyeS51cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuX2ZpbGVFbnRyeURlZHVwZUtleShlbnRyeSwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdLZXlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXhpc3RpbmdLZXlzLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IHRoaXMuX2NvbnZlcnRWYXJpYWJsZVRvQXR0YWNobWVudChlbnRyeSwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QubWVzc2FnZSk7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXR0YWNobWVudCkgJiYgYXR0YWNobWVudCkge1xuXHRcdFx0XHRhdHRhY2htZW50cy5wdXNoKGF0dGFjaG1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBEZWR1cGUgaWRlbnRpdHkgZm9yIGEgZmlsZS9pbXBsaWNpdCBlbnRyeTogcmViYXNlZCBVUkksIHN1ZmZpeGVkIHdpdGggdGhlIHJhbmdlIGZvciBhIHNlbGVjdGlvbi4gKi9cblx0cHJpdmF0ZSBfZmlsZUVudHJ5RGVkdXBlS2V5KGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVudHJ5LmtpbmQgIT09ICdmaWxlJyAmJiBlbnRyeS5raW5kICE9PSAnaW1wbGljaXQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IGVudHJ5LnZhbHVlO1xuXHRcdGNvbnN0IHVyaSA9IGlzTG9jYXRpb24odmFsdWUpID8gdmFsdWUudXJpIDogKHZhbHVlIGluc3RhbmNlb2YgVVJJID8gdmFsdWUgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lbnRyeVNlbGVjdGlvbihlbnRyeSk7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaG1lbnREZWR1cGVLZXkodGhpcy5fcmViYXNlQXR0YWNobWVudFVyaSh1cmksIHNlc3Npb25SZXNvdXJjZSkudG9TdHJpbmcoKSwgc2VsZWN0aW9uKTtcblx0fVxuXG5cdC8qKiBUaGUgc2VsZWN0aW9uIHJhbmdlIGNhcnJpZWQgYnkgYSBmaWxlL2ltcGxpY2l0IGVudHJ5LCBvciBgdW5kZWZpbmVkYCBmb3Igd2hvbGUtZG9jdW1lbnQgcmVmZXJlbmNlcy4gKi9cblx0cHJpdmF0ZSBfZW50cnlTZWxlY3Rpb24oZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBNZXNzYWdlRW1iZWRkZWRSZXNvdXJjZUF0dGFjaG1lbnRbJ3NlbGVjdGlvbiddIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuX2VudHJ5U2VsZWN0aW9uTG9jYXRpb24oZW50cnkpO1xuXHRcdHJldHVybiBsb2NhdGlvbiA/IHsgcmFuZ2U6IHRoaXMuX3RvVGV4dFJhbmdlKGxvY2F0aW9uLnJhbmdlKSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIERlZHVwZSBpZGVudGl0eTogdGhlIGJhcmUgVVJJIGZvciBhIHdob2xlIGRvY3VtZW50LCBzdWZmaXhlZCB3aXRoIHRoZSByYW5nZSBmb3IgYSBzZWxlY3Rpb24uICovXG5cdHByaXZhdGUgX2F0dGFjaG1lbnREZWR1cGVLZXkodXJpOiBzdHJpbmcsIHNlbGVjdGlvbj86IE1lc3NhZ2VSZXNvdXJjZUF0dGFjaG1lbnRbJ3NlbGVjdGlvbiddKTogc3RyaW5nIHtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cdFx0Y29uc3QgeyBzdGFydCwgZW5kIH0gPSBzZWxlY3Rpb24ucmFuZ2U7XG5cdFx0cmV0dXJuIGAke3VyaX0jJHtzdGFydC5saW5lfToke3N0YXJ0LmNoYXJhY3Rlcn0tJHtlbmQubGluZX06JHtlbmQuY2hhcmFjdGVyfWA7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGlzIGJhY2tlbmQgcmVhZHMgcmVmZXJlbmNlZCBmaWxlcyBmcm9tIGRpc2sgKHJhdGhlciB0aGFuIHNlZWluZyB0aGUgZWRpdG9yJ3Ncblx0ICogaW4tbWVtb3J5IGJ1ZmZlcikgYW5kIHRoZXJlZm9yZSBuZWVkcyB0aGUgbGl2ZSB0ZXh0IG9mIGFuIHVuc2F2ZWQgLyBkaXJ0eSBlZGl0b3IgaW5saW5lZCBhc1xuXHQgKiBhbiBlbWJlZGRlZCByZXNvdXJjZS4gQ29waWxvdCBDTEkgYW5kIENvZGV4IGJvdGggcnVuIGFzIHNlcGFyYXRlIHByb2Nlc3NlcyB3aXRoIG9ubHkgZGlza1xuXHQgKiBhY2Nlc3MsIHNvIGEgYEBwYXRoYCBtZW50aW9uIChvciBhbiBgdW50aXRsZWQ6YCBVUkkpIHdvdWxkIGdpdmUgdGhlbSBzdGFsZSBvciBtaXNzaW5nIGNvbnRlbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9iYWNrZW5kSW5saW5lc1Vuc2F2ZWRFZGl0b3JzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWcucHJvdmlkZXIgPT09IFNlc3Npb25UeXBlLkNvcGlsb3RDTEkgfHwgdGhpcy5fY29uZmlnLnByb3ZpZGVyID09PSBDT0RFWF9BR0VOVF9QUk9WSURFUl9JRDtcblx0fVxuXG5cdC8qKiBBIHJlc291cmNlIGlzIHVuc2F2ZWQgd2hlbiBpdCdzIHVudGl0bGVkIG9yIGEgc2F2ZWQgZmlsZSB3aXRoIGluLW1lbW9yeSAoZGlydHkpIGNoYW5nZXMuICovXG5cdHByaXZhdGUgX2lzVW5zYXZlZFJlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgfHwgdGhpcy5fd29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkodXJpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbmxpbmUgdGhlIGxpdmUgKGluLW1lbW9yeSkgdGV4dCBvZiBhbiB1bnNhdmVkIGVkaXRvciBhcyBhbiBlbWJlZGRlZCByZXNvdXJjZSBzbyBhIHBhdGgtcmVhZGluZyBiYWNrZW5kIHN0aWxsXG5cdCAqIGdldHMgY3VycmVudCBjb250ZW50LCBwcmVzZXJ2aW5nIHRoZSBlbnRyeSdzIHNlbGVjdGlvbiwgcmFuZ2UgYW5kIGBfbWV0YWAuIFNlbGVjdGlvbiBlbnRyaWVzIGlubGluZSBvbmx5IHRoZVxuXHQgKiBzZWxlY3RlZCB0ZXh0OyB3aG9sZS1kb2N1bWVudCBlbnRyaWVzIGlubGluZSB0aGUgZnVsbCBidWZmZXIuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBubyBsb2FkZWQgdGV4dCBtb2RlbCBpc1xuXHQgKiBhdmFpbGFibGUgb3IgdGhlIGlubGluZWQgdGV4dCBleGNlZWRzIHtAbGluayBNQVhfSU5MSU5FRF9VTlNBVkVEX0VESVRPUl9CWVRFU30uXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZFVuc2F2ZWRFZGl0b3JBdHRhY2htZW50KHVyaTogVVJJLCB2OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCByYW5nZTogTWVzc2FnZUF0dGFjaG1lbnRbJ3JhbmdlJ10pOiBNZXNzYWdlQXR0YWNobWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwodXJpKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fZ2V0VW5zYXZlZEVkaXRvckF0dGFjaG1lbnRUZXh0KG1vZGVsLCB0aGlzLl9lbnRyeU1vZGVsU2VsZWN0aW9uUmFuZ2UodikpO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRleHQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IFZTQnVmZmVyLmZyb21TdHJpbmcodGV4dCk7XG5cdFx0aWYgKCFidWZmZXIgfHwgYnVmZmVyLmJ5dGVMZW5ndGggPiBNQVhfSU5MSU5FRF9VTlNBVkVEX0VESVRPUl9CWVRFUykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdF0gU2tpcHBpbmcgaW5saW5lIG9mIHVuc2F2ZWQgZWRpdG9yICR7dXJpLnRvU3RyaW5nKCl9OiBleGNlZWRzICR7TUFYX0lOTElORURfVU5TQVZFRF9FRElUT1JfQllURVN9IGJ5dGUgY2FwYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lbnRyeVNlbGVjdGlvbih2KTtcblx0XHRjb25zdCBhdHRhY2htZW50OiBNZXNzYWdlRW1iZWRkZWRSZXNvdXJjZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdGxhYmVsOiB2Lm5hbWUsXG5cdFx0XHRkaXNwbGF5S2luZDogc2VsZWN0aW9uID8gJ3NlbGVjdGlvbicgOiAnZG9jdW1lbnQnLFxuXHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KGJ1ZmZlciksXG5cdFx0XHRjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuXHRcdH07XG5cdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0YXR0YWNobWVudC5zZWxlY3Rpb24gPSBzZWxlY3Rpb247XG5cdFx0fVxuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0YXR0YWNobWVudC5yYW5nZSA9IHJhbmdlO1xuXHRcdH1cblx0XHRpZiAodi5fbWV0YSkge1xuXHRcdFx0YXR0YWNobWVudC5fbWV0YSA9IHYuX21ldGE7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBpbmxpbmUgdGV4dCB0byBzZW5kIGZvciBhbiB1bnNhdmVkIGVkaXRvcjogdGhlIHNlbGVjdGVkIHRleHQgZm9yIGEgc2VsZWN0aW9uLCBlbHNlIHRoZSB3aG9sZSBidWZmZXIuIFVzZXMgdGhlXG5cdCAqIG1vZGVsIGxlbmd0aCBBUElzIHNvIGFuIG92ZXItY2FwIGJ1ZmZlciBpcyBza2lwcGVkIChyZXR1cm5zIGB1bmRlZmluZWRgKSB3aXRob3V0IGV2ZXIgYmVpbmcgbWF0ZXJpYWxpemVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0VW5zYXZlZEVkaXRvckF0dGFjaG1lbnRUZXh0KG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IG1vZGVsLnZhbGlkYXRlUmFuZ2UocmFuZ2UpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uTGVuZ3RoID0gbW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHNlbGVjdGlvbik7XG5cdFx0XHRpZiAoc2VsZWN0aW9uTGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uTGVuZ3RoID4gTUFYX0lOTElORURfVU5TQVZFRF9FRElUT1JfQllURVMgPyB1bmRlZmluZWQgOiBtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsLmdldFZhbHVlTGVuZ3RoKCkgPiBNQVhfSU5MSU5FRF9VTlNBVkVEX0VESVRPUl9CWVRFUyA/IHVuZGVmaW5lZCA6IG1vZGVsLmdldFZhbHVlKCk7XG5cdH1cblxuXHQvKiogVGhlIGVkaXRvciByYW5nZSBvZiBhIGZpbGUvaW1wbGljaXQgc2VsZWN0aW9uIGVudHJ5LCB1c2VkIHRvIHNsaWNlIHRoZSBsaXZlIG1vZGVsOyBgdW5kZWZpbmVkYCBvdGhlcndpc2UuICovXG5cdHByaXZhdGUgX2VudHJ5TW9kZWxTZWxlY3Rpb25SYW5nZShlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IElSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJ5U2VsZWN0aW9uTG9jYXRpb24oZW50cnkpPy5yYW5nZTtcblx0fVxuXG5cdC8qKiBUaGUge0BsaW5rIExvY2F0aW9ufSBvZiBhIGZpbGUvaW1wbGljaXQgZW50cnkgdGhhdCByZXByZXNlbnRzIGEgc2VsZWN0aW9uLCBvciBgdW5kZWZpbmVkYCBmb3Igd2hvbGUgZG9jdW1lbnRzLiAqL1xuXHRwcml2YXRlIF9lbnRyeVNlbGVjdGlvbkxvY2F0aW9uKGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogTG9jYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gZW50cnkudmFsdWU7XG5cdFx0Y29uc3QgaXNTZWxlY3Rpb25FbnRyeSA9IChlbnRyeS5raW5kID09PSAnZmlsZScgfHwgKGVudHJ5LmtpbmQgPT09ICdpbXBsaWNpdCcgJiYgZW50cnkuaXNTZWxlY3Rpb24pKSAmJiBpc0xvY2F0aW9uKHZhbHVlKTtcblx0XHRyZXR1cm4gaXNTZWxlY3Rpb25FbnRyeSA/IHZhbHVlIGFzIExvY2F0aW9uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFyaWFibGVFbnRyaWVzVG9BdHRhY2htZW50cyh2YXJpYWJsZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSwgc2Vzc2lvblJlc291cmNlOiBVUkksIG1lc3NhZ2VUZXh0Pzogc3RyaW5nKTogTWVzc2FnZUF0dGFjaG1lbnRbXSB7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHYgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gdGhpcy5fY29udmVydFZhcmlhYmxlVG9BdHRhY2htZW50KHYsIHNlc3Npb25SZXNvdXJjZSwgbWVzc2FnZVRleHQpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudHMucHVzaCguLi5hdHRhY2htZW50KTtcblx0XHRcdH0gZWxzZSBpZiAoYXR0YWNobWVudCkge1xuXHRcdFx0XHRhdHRhY2htZW50cy5wdXNoKGF0dGFjaG1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYXR0YWNobWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdF0gQ29udmVydGVkICR7YXR0YWNobWVudHMubGVuZ3RofSBhdHRhY2htZW50cyBmcm9tICR7dmFyaWFibGVzLmxlbmd0aH0gZXhwbGljaXQgdmFyaWFibGVzYCk7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50cztcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRWYXJpYWJsZVRvQXR0YWNobWVudCh2OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbWVzc2FnZVRleHQ/OiBzdHJpbmcpOiBNZXNzYWdlQXR0YWNobWVudCB8IE1lc3NhZ2VBdHRhY2htZW50W10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlZmVyZW5jZVJhbmdlID0gdGhpcy5fdG9BdHRhY2htZW50UmVmZXJlbmNlUmFuZ2UobWVzc2FnZVRleHQsIHYucmFuZ2UpO1xuXHRcdC8vIENvcGlsb3QgQ0xJIGFuZCBDb2RleCBjYW4ndCByZWFkIHVuc2F2ZWQgY29udGVudCBmcm9tIGRpc2ssIHNvIGlubGluZSB0aGUgbGl2ZSBidWZmZXI7IGRyb3AgdW5yZWFkYWJsZSBzY2hlbWVzLlxuXHRcdGlmICgodi5raW5kID09PSAnZmlsZScgfHwgdi5raW5kID09PSAnaW1wbGljaXQnKSAmJiB0aGlzLl9iYWNrZW5kSW5saW5lc1Vuc2F2ZWRFZGl0b3JzKCkpIHtcblx0XHRcdGNvbnN0IHVyaSA9IGlzTG9jYXRpb24odi52YWx1ZSkgPyB2LnZhbHVlLnVyaSA6ICh2LnZhbHVlIGluc3RhbmNlb2YgVVJJID8gdi52YWx1ZSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAodXJpICYmIHRoaXMuX2lzVW5zYXZlZFJlc291cmNlKHVyaSkpIHtcblx0XHRcdFx0Y29uc3QgZW1iZWRkZWQgPSB0aGlzLl9idWlsZFVuc2F2ZWRFZGl0b3JBdHRhY2htZW50KHVyaSwgdiwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdFx0XHRpZiAoZW1iZWRkZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZW1iZWRkZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRmlsZS9pbXBsaWNpdDogYSBzZWxlY3Rpb24gTG9jYXRpb24gXHUyMTkyICdzZWxlY3Rpb24nOyBhIHdob2xlIGRvY3VtZW50L1VSSSBcdTIxOTIgJ2RvY3VtZW50JyAocmFuZ2UgZHJvcHBlZCkuXG5cdFx0aWYgKCh2LmtpbmQgPT09ICdmaWxlJyB8fCAodi5raW5kID09PSAnaW1wbGljaXQnICYmIHYuaXNTZWxlY3Rpb24pKSAmJiBpc0xvY2F0aW9uKHYudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9TZWxlY3Rpb25BdHRhY2htZW50KHYudmFsdWUsIHYubmFtZSwgJ3NlbGVjdGlvbicsIHNlc3Npb25SZXNvdXJjZSwgdi5fbWV0YSwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHRpZiAodi5raW5kID09PSAnaW1wbGljaXQnICYmIGlzTG9jYXRpb24odi52YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1Jlc291cmNlQXR0YWNobWVudCh2LnZhbHVlLnVyaSwgdi5uYW1lLCAnZG9jdW1lbnQnLCBzZXNzaW9uUmVzb3VyY2UsIHYuX21ldGEsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKCh2LmtpbmQgPT09ICdmaWxlJyB8fCB2LmtpbmQgPT09ICdpbXBsaWNpdCcpICYmIHYudmFsdWUgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1Jlc291cmNlQXR0YWNobWVudCh2LnZhbHVlLCB2Lm5hbWUsICdkb2N1bWVudCcsIHNlc3Npb25SZXNvdXJjZSwgdi5fbWV0YSwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHRpZiAodi5raW5kID09PSAnZGlyZWN0b3J5JyAmJiB2LnZhbHVlIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9SZXNvdXJjZUF0dGFjaG1lbnQodi52YWx1ZSwgdi5uYW1lLCAnZGlyZWN0b3J5Jywgc2Vzc2lvblJlc291cmNlLCB2Ll9tZXRhLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdC8vIFN5bWJvbDogYSBMb2NhdGlvbiB3aXRoIGEgJ3N5bWJvbCcgZGlzcGxheSBoaW50LlxuXHRcdGlmICh2LmtpbmQgPT09ICdzeW1ib2wnICYmIGlzTG9jYXRpb24odi52YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1NlbGVjdGlvbkF0dGFjaG1lbnQodi52YWx1ZSwgdi5uYW1lLCAnc3ltYm9sJywgc2Vzc2lvblJlc291cmNlLCB2Ll9tZXRhLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdC8vIFByb21wdCBmaWxlcyAoLnByb21wdC5tZCkgXHUyMDE0IHRyZWF0ZWQgYXMgYSByZWZlcmVuY2VkIGRvY3VtZW50LlxuXHRcdGlmICh2LmtpbmQgPT09ICdwcm9tcHRGaWxlJyAmJiB2LnZhbHVlIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9SZXNvdXJjZUF0dGFjaG1lbnQodi52YWx1ZSwgdi5uYW1lLCAnZG9jdW1lbnQnLCBzZXNzaW9uUmVzb3VyY2UsIHYuX21ldGEsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0Ly8gSW1hZ2U6IHNlbmQgaW5saW5lIGFzIGJhc2U2NCB3aGVuIHdlIGhhdmUgdGhlIGJ5dGVzOyBvdGhlcndpc2UgZmFsbFxuXHRcdC8vIGJhY2sgdG8gYSBmaWxlIHJlc291cmNlIHJlZmVyZW5jZS5cblx0XHRpZiAoaXNJbWFnZVZhcmlhYmxlRW50cnkodikpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b0ltYWdlQXR0YWNobWVudCh2LCBzZXNzaW9uUmVzb3VyY2UsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKGlzQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnkodikpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b0FnZW50RmVlZGJhY2tBdHRhY2htZW50KHYpO1xuXHRcdH1cblx0XHRpZiAodi5raW5kID09PSAnc2Vzc2lvblJlZmVyZW5jZScgJiYgdi52YWx1ZSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0Y29uc3QgdHJhamVjdG9yeVBhdGggPSB0aGlzLl90b1Nlc3Npb25SZWZlcmVuY2VUcmFqZWN0b3J5UGF0aCh2LnZhbHVlKTtcblx0XHRcdGlmICghdHJhamVjdG9yeVBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl90b1Nlc3Npb25SZWZlcmVuY2VBdHRhY2htZW50cyh2LCB2LnZhbHVlLCB0cmFqZWN0b3J5UGF0aCwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHQvLyBCcm93c2VyIHZpZXdzIGFyZSBsaXZlIHBhZ2VzIHJhdGhlciB0aGFuIGZpbGVzeXN0ZW0gcmVzb3VyY2VzLiBQcmVzZXJ2ZVxuXHRcdC8vIHRoZSBwYWdlIElEIGFzIG1vZGVsLXJlYWRhYmxlIGNvbnRleHQgc28gdGhlIGFnZW50IGNhbiBhZGRyZXNzIHRoZSBwYWdlXG5cdFx0Ly8gd2l0aCBicm93c2VyIHRvb2xzIHdpdGhvdXQgdHJ5aW5nIHRvIHJlYWQgdGhlIHZzY29kZS1icm93c2VyIFVSSS5cblx0XHRpZiAoaXNCcm93c2VyVmlld1ZhcmlhYmxlRW50cnkodikpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQoXG5cdFx0XHRcdHYubmFtZSxcblx0XHRcdFx0di5tb2RlbERlc2NyaXB0aW9uID8/IGBCcm93c2VyIHBhZ2U6ICR7di5uYW1lfS4gVGhlIHBhZ2VJZCBpcyBcIiR7di5icm93c2VySWR9XCIuYCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC4uLnYuX21ldGEsXG5cdFx0XHRcdFx0W0Jyb3dzZXJWaWV3QXR0YWNobWVudE1ldGFkYXRhS2V5XTogeyBicm93c2VySWQ6IHYuYnJvd3NlcklkLCBicm93c2VyVXJpOiB2LnZhbHVlLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0QnJvd3NlclZpZXdBdHRhY2htZW50RGlzcGxheUtpbmQsXG5cdFx0XHRcdHJlZmVyZW5jZVJhbmdlLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKHYua2luZCA9PT0gJ2VsZW1lbnQnKSB7XG5cdFx0XHRjb25zdCBjb3JyZWxhdGlvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHsgLi4udi5fbWV0YSwgLi4udG9FbGVtZW50QXR0YWNobWVudE1ldGEoY29ycmVsYXRpb25JZCkgfTtcblx0XHRcdGNvbnN0IGVsZW1lbnRBdHRhY2htZW50ID0gdGhpcy5fdG9TaW1wbGVBdHRhY2htZW50KHYubmFtZSwgdi52YWx1ZSwgbWV0YWRhdGEsIEFnZW50SG9zdEVsZW1lbnRBdHRhY2htZW50RGlzcGxheUtpbmQsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHRcdGNvbnN0IGltYWdlQXR0YWNobWVudCA9IHRoaXMuX3RvRWxlbWVudEltYWdlQXR0YWNobWVudCh2LCBzZXNzaW9uUmVzb3VyY2UsIG1ldGFkYXRhKTtcblx0XHRcdHJldHVybiBpbWFnZUF0dGFjaG1lbnQgPyBbZWxlbWVudEF0dGFjaG1lbnQsIGltYWdlQXR0YWNobWVudF0gOiBlbGVtZW50QXR0YWNobWVudDtcblx0XHR9XG5cdFx0Ly8gUGFzdGVkIGNvZGUsIHByb21wdCB0ZXh0LCB3b3Jrc3BhY2UgY29udGV4dCwgYW5kIGZyZWUtZm9ybSBzdHJpbmcgZW50cmllczogc3VyZmFjZSB0aGVpclxuXHRcdC8vIHRleHR1YWwgcmVwcmVzZW50YXRpb24gYXMgYW4gb3BhcXVlIGF0dGFjaG1lbnQuXG5cdFx0aWYgKHYua2luZCA9PT0gJ3Bhc3RlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHYuY29kZSwgdi5fbWV0YSwgdW5kZWZpbmVkLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdGlmICh2LmtpbmQgPT09ICdwcm9tcHRUZXh0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHYudmFsdWUsIHYuX21ldGEsIHVuZGVmaW5lZCwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHRpZiAodi5raW5kID09PSAnd29ya3NwYWNlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHYudmFsdWUsIHYuX21ldGEsICd3b3Jrc3BhY2UnLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdGlmICh2LmtpbmQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB2LnZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHYudmFsdWUsIHYuX21ldGEsIHVuZGVmaW5lZCwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHRjb25zdCBhZ2VudEhvc3RDb21wbGV0aW9uS2luZCA9IGdldEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kKHYpO1xuXHRcdGlmIChhZ2VudEhvc3RDb21wbGV0aW9uS2luZCA9PT0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHVuZGVmaW5lZCwgdi5fbWV0YSwgJ2NvbW1hbmQnLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdGlmIChhZ2VudEhvc3RDb21wbGV0aW9uS2luZCA9PT0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuU2tpbGwpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQodi5uYW1lLCB1bmRlZmluZWQsIHYuX21ldGEsICdza2lsbCcsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKGlzQ2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkodikpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b0NoYXRSZWZlcmVuY2VBdHRhY2htZW50KHYsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ2hhdFJlZmVyZW5jZUF0dGFjaG1lbnQodjogSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnksIHJhbmdlPzogTWVzc2FnZUF0dGFjaG1lbnRbJ3JhbmdlJ10pOiBNZXNzYWdlQXR0YWNobWVudCB7XG5cdFx0Y29uc3QgYXR0YWNobWVudDogTWVzc2FnZUNoYXRBdHRhY2htZW50ID0ge1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRyZXNvdXJjZTogdi52YWx1ZS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6IHYubmFtZSxcblx0XHR9O1xuXHRcdGlmICh2LmVuZFR1cm4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXR0YWNobWVudC5lbmRUdXJuID0gdi5lbmRUdXJuO1xuXHRcdH1cblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGF0dGFjaG1lbnQucmFuZ2UgPSByYW5nZTtcblx0XHR9XG5cdFx0aWYgKHYuX21ldGEpIHtcblx0XHRcdGF0dGFjaG1lbnQuX21ldGEgPSB2Ll9tZXRhO1xuXHRcdH1cblx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0fVxuXG5cdHByaXZhdGUgX3RvRWxlbWVudEltYWdlQXR0YWNobWVudCh2OiBJRWxlbWVudFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBNZXNzYWdlQXR0YWNobWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHYuaW1hZ2VEYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiBgJHt2Lm5hbWV9IHNjcmVlbnNob3RgLFxuXHRcdFx0XHRkaXNwbGF5S2luZDogJ2ltYWdlJyxcblx0XHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAodi5pbWFnZURhdGEpKSxcblx0XHRcdFx0Y29udGVudFR5cGU6IHYuaW1hZ2VNaW1lVHlwZSA/PyAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0X21ldGE6IG1ldGFkYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKFVSSS5pc1VyaSh2LmltYWdlRGF0YSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1Jlc291cmNlQXR0YWNobWVudCh2LmltYWdlRGF0YSwgYCR7di5uYW1lfSBzY3JlZW5zaG90YCwgJ2ltYWdlJywgc2Vzc2lvblJlc291cmNlLCBtZXRhZGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF90b1Nlc3Npb25SZWZlcmVuY2VBdHRhY2htZW50KHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0cmFqZWN0b3J5UGF0aDogc3RyaW5nLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnQge1xuXHRcdHJldHVybiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQoXG5cdFx0XHR2Lm5hbWUsXG5cdFx0XHR0b1Nlc3Npb25SZWZlcmVuY2VNb2RlbFJlcHJlc2VudGF0aW9uKHYubmFtZSwgc2Vzc2lvblJlc291cmNlLCB0cmFqZWN0b3J5UGF0aCksXG5cdFx0XHR7IC4uLih2Ll9tZXRhID8/IHt9KSwgLi4udG9TZXNzaW9uUmVmZXJlbmNlQXR0YWNobWVudE1ldGEoc2Vzc2lvblJlc291cmNlKSB9LFxuXHRcdFx0QWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnREaXNwbGF5S2luZCxcblx0XHRcdHJhbmdlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnRzKHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0cmFqZWN0b3J5UGF0aDogc3RyaW5nLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnRbXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHRoaXMuX3RvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnQodiwgc2Vzc2lvblJlc291cmNlLCB0cmFqZWN0b3J5UGF0aCwgcmFuZ2UpLFxuXHRcdFx0dGhpcy5fdG9TZXNzaW9uUmVmZXJlbmNlVHJhamVjdG9yeUF0dGFjaG1lbnQodiwgc2Vzc2lvblJlc291cmNlLCB0cmFqZWN0b3J5UGF0aCksXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2Vzc2lvblJlZmVyZW5jZVRyYWplY3RvcnlBdHRhY2htZW50KHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0cmFqZWN0b3J5UGF0aDogc3RyaW5nKTogTWVzc2FnZUF0dGFjaG1lbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHR1cmk6IFVSSS5maWxlKHRyYWplY3RvcnlQYXRoKS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6IGAke3YubmFtZX0gdHJhamVjdG9yeWAsXG5cdFx0XHRkaXNwbGF5S2luZDogQWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZVRyYWplY3RvcnlBdHRhY2htZW50RGlzcGxheUtpbmQsXG5cdFx0XHRfbWV0YTogeyAuLi4odi5fbWV0YSA/PyB7fSksIC4uLnRvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnRNZXRhKHNlc3Npb25SZXNvdXJjZSkgfSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TZXNzaW9uUmVmZXJlbmNlVHJhamVjdG9yeVBhdGgoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRPRE86IFN1cHBvcnQgbm9uLUNvcGlsb3QtQ0xJIHNlc3Npb24gcmVmZXJlbmNlcyB0aHJvdWdoIElDaGF0TW9kZWwgb3IgYSBmaXJzdC1jbGFzcyBBSFAgYXR0YWNobWVudCBwYXRoLlxuXHRcdC8vIFRPRE86IFN1cHBvcnQgZnVsbCBFSC10by1BSCBzZXNzaW9uIHBvcnRpbmcgZm9yIGNvbnRpbnVlL3Jlc3VtZSBmbG93cy5cblx0XHRyZXR1cm4gYnVpbGRIb3N0TG9jYWxFdmVudHNQYXRoKFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0dGhpcy5fcGF0aFNlcnZpY2UudXNlckhvbWUoeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KSxcblx0XHRcdGF1dGhvcml0eSA9PiB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoY29ubmVjdGlvbiA9PiBhZ2VudEhvc3RBdXRob3JpdHkoY29ubmVjdGlvbi5hZGRyZXNzKSA9PT0gYXV0aG9yaXR5KSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9SZXNvdXJjZUF0dGFjaG1lbnQodXJpOiBVUkksIGxhYmVsOiBzdHJpbmcsIGRpc3BsYXlLaW5kOiBzdHJpbmcsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsIHJhbmdlPzogTWVzc2FnZUF0dGFjaG1lbnRbJ3JhbmdlJ10pOiBNZXNzYWdlQXR0YWNobWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0YWNobWVudFVyaSA9IHRoaXMuX3JlYmFzZUF0dGFjaG1lbnRVcmkodXJpLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50ID0geyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsIHVyaTogYXR0YWNobWVudFVyaS50b1N0cmluZygpLCBsYWJlbCwgZGlzcGxheUtpbmQgfTtcblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGF0dGFjaG1lbnQucmFuZ2UgPSByYW5nZTtcblx0XHR9XG5cdFx0aWYgKF9tZXRhKSB7XG5cdFx0XHRhdHRhY2htZW50Ll9tZXRhID0gX21ldGE7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TZWxlY3Rpb25BdHRhY2htZW50KGxvY2F0aW9uOiBMb2NhdGlvbiwgbGFiZWw6IHN0cmluZywgZGlzcGxheUtpbmQ6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkksIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCwgcmFuZ2U/OiBNZXNzYWdlQXR0YWNobWVudFsncmFuZ2UnXSk6IE1lc3NhZ2VBdHRhY2htZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRhY2htZW50VXJpID0gdGhpcy5fcmViYXNlQXR0YWNobWVudFVyaShsb2NhdGlvbi51cmksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudDogTWVzc2FnZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHR1cmk6IGF0dGFjaG1lbnRVcmkudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGlzcGxheUtpbmQsXG5cdFx0XHRzZWxlY3Rpb246IHsgcmFuZ2U6IHRoaXMuX3RvVGV4dFJhbmdlKGxvY2F0aW9uLnJhbmdlKSB9LFxuXHRcdH07XG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRhdHRhY2htZW50LnJhbmdlID0gcmFuZ2U7XG5cdFx0fVxuXHRcdGlmIChfbWV0YSkge1xuXHRcdFx0YXR0YWNobWVudC5fbWV0YSA9IF9tZXRhO1xuXHRcdH1cblx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0fVxuXG5cdHByaXZhdGUgX3RvSW1hZ2VBdHRhY2htZW50KHY6IElJbWFnZVZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGNvZXJjZUltYWdlQnVmZmVyKHYudmFsdWUpO1xuXHRcdGNvbnN0IGNvbnRlbnRUeXBlID0gdi5taW1lVHlwZSA/PyAnaW1hZ2UvcG5nJztcblx0XHRpZiAoYnVmZmVyKSB7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50OiBNZXNzYWdlQXR0YWNobWVudCA9IHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiB2Lm5hbWUsXG5cdFx0XHRcdGRpc3BsYXlLaW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHRkYXRhOiBlbmNvZGVCYXNlNjQoVlNCdWZmZXIud3JhcChidWZmZXIpKSxcblx0XHRcdFx0Y29udGVudFR5cGUsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnQucmFuZ2UgPSByYW5nZTtcblx0XHRcdH1cblx0XHRcdGlmICh2Ll9tZXRhKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnQuX21ldGEgPSB2Ll9tZXRhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdFx0fVxuXHRcdC8vIE5vIGlubGluZSBieXRlcyBcdTIwMTQgZmFsbCBiYWNrIHRvIGEgZmlsZSByZWZlcmVuY2UgaWYgb25lIGlzIGF2YWlsYWJsZS5cblx0XHRjb25zdCByZWZVcmkgPSB2LnJlZmVyZW5jZXM/LmZpbmQociA9PiBVUkkuaXNVcmkoci5yZWZlcmVuY2UpKT8ucmVmZXJlbmNlO1xuXHRcdGlmIChVUkkuaXNVcmkocmVmVXJpKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvUmVzb3VyY2VBdHRhY2htZW50KHJlZlVyaSwgdi5uYW1lLCAnaW1hZ2UnLCBzZXNzaW9uUmVzb3VyY2UsIHYuX21ldGEsIHJhbmdlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RvQWdlbnRGZWVkYmFja0F0dGFjaG1lbnQodjogSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5KTogTWVzc2FnZUF0dGFjaG1lbnQgfCBNZXNzYWdlQXR0YWNobWVudFtdIHtcblx0XHQvLyBBZ2VudC1ob3N0IHNlc3Npb25zIGJhY2sgdGhlaXIgZmVlZGJhY2sgd2l0aCBhbm5vdGF0aW9ucyBvbiB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgYW5ub3RhdGlvbnMgY2hhbm5lbC4gRW1pdCBvbmUgTWVzc2FnZUFubm90YXRpb25zQXR0YWNobWVudFxuXHRcdC8vIHBlciBjb21tZW50LCByZWZlcmVuY2luZyB0aGUgc3BlY2lmaWMgYW5ub3RhdGlvbiBpZCwgc28gdGhlIGFnZW50IGNhblxuXHRcdC8vIHJlYWQgdGhlbSB2aWEgdGhlIGBsaXN0Q29tbWVudHNgIHRvb2wgYW5kIGFjdCBvbiBleGFjdGx5IHRoZXNlXG5cdFx0Ly8gY29tbWVudHMuIEVhY2ggaXRlbSBpZCBpcyB0aGUgYW5ub3RhdGlvbiBpZC5cblx0XHRjb25zdCBhbm5vdGF0aW9uc1Jlc291cmNlID0gdi5hbm5vdGF0aW9uc1Jlc291cmNlPy50b1N0cmluZygpO1xuXHRcdGlmIChhbm5vdGF0aW9uc1Jlc291cmNlICYmIHYuZmVlZGJhY2tJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdi5mZWVkYmFja0l0ZW1zLm1hcCgoaXRlbSk6IE1lc3NhZ2VBbm5vdGF0aW9uc0F0dGFjaG1lbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtTWV0YSA9IHtcblx0XHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0XHR0ZXh0OiBpdGVtLnRleHQsXG5cdFx0XHRcdFx0cmVzb3VyY2VVcmk6IGl0ZW0ucmVzb3VyY2VVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRyYW5nZTogdGhpcy5fdG9UZXh0UmFuZ2UoaXRlbS5yYW5nZSksXG5cdFx0XHRcdFx0Li4uKGl0ZW0ucmVwbGllcz8ubGVuZ3RoID8geyByZXBsaWVzOiBbLi4uaXRlbS5yZXBsaWVzXSB9IDoge30pLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5Bbm5vdGF0aW9ucyxcblx0XHRcdFx0XHRsYWJlbDogdi5uYW1lLFxuXHRcdFx0XHRcdGRpc3BsYXlLaW5kOiBBZ2VudEZlZWRiYWNrQXR0YWNobWVudERpc3BsYXlLaW5kLFxuXHRcdFx0XHRcdHJlc291cmNlOiBhbm5vdGF0aW9uc1Jlc291cmNlLFxuXHRcdFx0XHRcdGFubm90YXRpb25JZHM6IFtpdGVtLmlkXSxcblx0XHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdFx0Li4uKHYuX21ldGEgPz8ge30pLFxuXHRcdFx0XHRcdFx0W0FnZW50RmVlZGJhY2tBdHRhY2htZW50TWV0YWRhdGFLZXldOiB7XG5cdFx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdi5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0ZmVlZGJhY2tJdGVtczogW2l0ZW1NZXRhXSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEZhbGxiYWNrOiBubyBhbm5vdGF0aW9ucyBjaGFubmVsIHJlc29sdmVkIFx1MjAxNCBzZW5kIHRoZSBmZWVkYmFjayBpbmxpbmVcblx0XHQvLyBhcyBhIHNpbmdsZSBzaW1wbGUgYXR0YWNobWVudCBjYXJyeWluZyB0aGUgbW9kZWwgcmVwcmVzZW50YXRpb24uXG5cdFx0Y29uc3QgZmVlZGJhY2tJdGVtcyA9IHYuZmVlZGJhY2tJdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHR0ZXh0OiBpdGVtLnRleHQsXG5cdFx0XHRyZXNvdXJjZVVyaTogaXRlbS5yZXNvdXJjZVVyaS50b1N0cmluZygpLFxuXHRcdFx0cmFuZ2U6IHRoaXMuX3RvVGV4dFJhbmdlKGl0ZW0ucmFuZ2UpLFxuXHRcdFx0Li4uKGl0ZW0ucmVwbGllcz8ubGVuZ3RoID8geyByZXBsaWVzOiBbLi4uaXRlbS5yZXBsaWVzXSB9IDoge30pLFxuXHRcdH0pKTtcblx0XHRyZXR1cm4gdGhpcy5fdG9TaW1wbGVBdHRhY2htZW50KFxuXHRcdFx0di5uYW1lLFxuXHRcdFx0dHlwZW9mIHYudmFsdWUgPT09ICdzdHJpbmcnID8gdi52YWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0Li4uKHYuX21ldGEgPz8ge30pLFxuXHRcdFx0XHRbQWdlbnRGZWVkYmFja0F0dGFjaG1lbnRNZXRhZGF0YUtleV06IHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHYuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0ZmVlZGJhY2tJdGVtcyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRBZ2VudEZlZWRiYWNrQXR0YWNobWVudERpc3BsYXlLaW5kLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF90b1NpbXBsZUF0dGFjaG1lbnQobGFiZWw6IHN0cmluZywgbW9kZWxSZXByZXNlbnRhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsIGRpc3BsYXlLaW5kPzogc3RyaW5nLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnQge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50ID0geyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLCBsYWJlbCB9O1xuXHRcdGlmIChtb2RlbFJlcHJlc2VudGF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbiA9IG1vZGVsUmVwcmVzZW50YXRpb247XG5cdFx0fVxuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0YXR0YWNobWVudC5yYW5nZSA9IHJhbmdlO1xuXHRcdH1cblx0XHRpZiAoZGlzcGxheUtpbmQpIHtcblx0XHRcdGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPSBkaXNwbGF5S2luZDtcblx0XHR9XG5cdFx0aWYgKF9tZXRhKSB7XG5cdFx0XHRhdHRhY2htZW50Ll9tZXRhID0gX21ldGE7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9BdHRhY2htZW50UmVmZXJlbmNlUmFuZ2UobWVzc2FnZVRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmFuZ2U6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbJ3JhbmdlJ10pOiBNZXNzYWdlQXR0YWNobWVudFsncmFuZ2UnXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFtZXNzYWdlVGV4dCB8fCAhcmFuZ2UgfHwgcmFuZ2Uuc3RhcnQgPCAwIHx8IHJhbmdlLmVuZEV4Y2x1c2l2ZSA+IG1lc3NhZ2VUZXh0Lmxlbmd0aCB8fCByYW5nZS5zdGFydCA+IHJhbmdlLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnQgPSBvZmZzZXRUb1Bvc2l0aW9uKG1lc3NhZ2VUZXh0LCByYW5nZS5zdGFydCk7XG5cdFx0Y29uc3QgZW5kID0gb2Zmc2V0VG9Qb3NpdGlvbihtZXNzYWdlVGV4dCwgcmFuZ2UuZW5kRXhjbHVzaXZlKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHsgbGluZTogc3RhcnQubGluZU51bWJlciAtIDEsIGNoYXJhY3Rlcjogc3RhcnQuY29sdW1uIC0gMSB9LFxuXHRcdFx0ZW5kOiB7IGxpbmU6IGVuZC5saW5lTnVtYmVyIC0gMSwgY2hhcmFjdGVyOiBlbmQuY29sdW1uIC0gMSB9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b1RleHRSYW5nZShyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IG51bWJlcjsgc3RhcnRDb2x1bW46IG51bWJlcjsgZW5kTGluZU51bWJlcjogbnVtYmVyOyBlbmRDb2x1bW46IG51bWJlciB9KSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0OiB7IGxpbmU6IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGNoYXJhY3RlcjogcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIH0sXG5cdFx0XHRlbmQ6IHsgbGluZTogcmFuZ2UuZW5kTGluZU51bWJlciAtIDEsIGNoYXJhY3RlcjogcmFuZ2UuZW5kQ29sdW1uIC0gMSB9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUmViYXNlIGEgYGZpbGU6YC1zY2hlbWUgYXR0YWNobWVudCBVUkkgZnJvbSB0aGUgc2Vzc2lvbidzIHJlcXVlc3RlZFxuXHQgKiB3b3JraW5nIGRpcmVjdG9yeSBvbnRvIHRoZSBzZXJ2ZXItcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkuIFRoaXNcblx0ICogbWF0dGVycyBvbiB0aGUgZmlyc3QgdHVybiBvZiBhIHdvcmt0cmVlLWlzb2xhdGVkIHNlc3Npb24sIHdoZXJlIHRoZVxuXHQgKiBwcm92aWRlciBjcmVhdGVzIGEgd29ya3RyZWUgdW5kZXIgYSBkaWZmZXJlbnQgcGF0aCB0aGFuIHRoZSB3b3Jrc3BhY2Vcblx0ICogZm9sZGVyIHRoZSB3b3JrYmVuY2ggYXR0YWNoZWQgdGhlIGZpbGUgZnJvbS4gUmV0dXJucyB0aGUgVVJJIHVuY2hhbmdlZFxuXHQgKiBpZiB0aGUgcmVxdWVzdGVkIGFuZCByZXNvbHZlZCBkaXJlY3RvcmllcyBtYXRjaCwgdGhlIFVSSSBpcyBub3QgdW5kZXJcblx0ICogdGhlIHJlcXVlc3RlZCBkaXJlY3RvcnksIG9yIGVpdGhlciBzaWRlIGlzIHVuYXZhaWxhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmViYXNlQXR0YWNobWVudFVyaSh1cmk6IFVSSSwgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkge1xuXHRcdGNvbnN0IHJlcXVlc3RlZERpciA9IHRoaXMuX3Jlc29sdmVSZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFyZXF1ZXN0ZWREaXIgfHwgcmVxdWVzdGVkRGlyLnNjaGVtZSAhPT0gJ2ZpbGUnKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmF3UmVzb2x2ZWREaXIgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSk/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGNvbnN0IHJlc29sdmVkRGlyID0gdHlwZW9mIHJhd1Jlc29sdmVkRGlyID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShyYXdSZXNvbHZlZERpcikgOiByYXdSZXNvbHZlZERpcjtcblx0XHRpZiAoIXJlc29sdmVkRGlyIHx8IHJlc29sdmVkRGlyLnNjaGVtZSAhPT0gJ2ZpbGUnKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChyZXF1ZXN0ZWREaXIsIHJlc29sdmVkRGlyKSkge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cdFx0aWYgKCFleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQodXJpLCByZXF1ZXN0ZWREaXIpKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0XHRjb25zdCByZWwgPSBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5yZWxhdGl2ZVBhdGgocmVxdWVzdGVkRGlyLCB1cmkpO1xuXHRcdGlmIChyZWwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cdFx0aWYgKHJlbCA9PT0gJycpIHtcblx0XHRcdHJldHVybiByZXNvbHZlZERpcjtcblx0XHR9XG5cdFx0cmV0dXJuIFVSSS5qb2luUGF0aChyZXNvbHZlZERpciwgLi4ucmVsLnNwbGl0KCcvJykpO1xuXHR9XG5cblx0Ly8gLS0tLSBMaWZlY3ljbGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8vIC0tLS0gU2Vzc2lvbiBzdWJzY3JpcHRpb24gaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEdldCBvciBjcmVhdGUgYSBzZXNzaW9uIHN1YnNjcmlwdGlvbi4gVGhlIGZpcnN0IGNhbGwgZm9yIGEgZ2l2ZW4gVVJJXG5cdCAqIHRyaWdnZXJzIGEgc2VydmVyIHN1YnNjcmliZTsgc3Vic2VxdWVudCBjYWxscyBpbmNyZW1lbnQgdGhlIHJlZmNvdW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbihzZXNzaW9uVXJpOiBzdHJpbmcpOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB7XG5cdFx0bGV0IHJlZiA9IHRoaXMuX3Nlc3Npb25TdWJzY3JpcHRpb25zLmdldChzZXNzaW9uVXJpKTtcblx0XHRpZiAocmVmPy5vYmplY3QudmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN1YnNjcmlwdGlvbnMuZGVsZXRlKHNlc3Npb25VcmkpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJlZiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJlZiA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgVVJJLnBhcnNlKHNlc3Npb25VcmkpLCAnQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXInKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdWJzY3JpcHRpb25zLnNldChzZXNzaW9uVXJpLCByZWYpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVmLm9iamVjdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgb3IgY3JlYXRlIHRoZSBkZWZhdWx0LWNoYXQgc3Vic2NyaXB0aW9uIGZvciBhIHNlc3Npb24uIE1pcnJvcnMgdGhlXG5cdCAqIHJlZmNvdW50IGxpZmVjeWNsZSBvZiB7QGxpbmsgX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb259LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlRGVmYXVsdENoYXRTdWJzY3JpcHRpb24oc2Vzc2lvblVyaTogc3RyaW5nKTogSUFnZW50U3Vic2NyaXB0aW9uPENoYXRTdGF0ZT4ge1xuXHRcdGxldCByZWYgPSB0aGlzLl9kZWZhdWx0Q2hhdFN1YnNjcmlwdGlvbnMuZ2V0KHNlc3Npb25VcmkpO1xuXHRcdGlmIChyZWY/Lm9iamVjdC52YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0Q2hhdFN1YnNjcmlwdGlvbnMuZGVsZXRlKHNlc3Npb25VcmkpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJlZiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fcmVxdWlyZVJhd1Nlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gc3RhdGUuZGVmYXVsdENoYXQ7XG5cdFx0XHRpZiAoIWRlZmF1bHRDaGF0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25Vcml9IGhhcyBubyBkZWZhdWx0IGNoYXRgKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoZGVmYXVsdENoYXQudG9TdHJpbmcoKSk7XG5cdFx0XHRyZWYgPSB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLkNoYXQsIGNoYXRVcmksICdBZ2VudEhvc3RTZXNzaW9uSGFuZGxlcicpO1xuXHRcdFx0dGhpcy5fZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zLnNldChzZXNzaW9uVXJpLCByZWYpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVmLm9iamVjdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxlYXNlIHRoZSBzdWJzY3JpcHRpb25zIGhlbGQgYnkgYSBzaW5nbGUgY2hhdCBzZXNzaW9uIG9uIGRpc3Bvc2UuXG5cdCAqXG5cdCAqIFVubGlrZSB7QGxpbmsgX3JlbGVhc2VTZXNzaW9uU3Vic2NyaXB0aW9ufSAod2hpY2ggdGVhcnMgZG93biBldmVyeSBjaGF0XG5cdCAqIG9mIGEgc2Vzc2lvbiBhdCBvbmNlKSwgdGhpcyBvbmx5IHJlbGVhc2VzIHRoZSBkaXNwb3NlZCBjaGF0J3Mgb3duXG5cdCAqIGNvbnZlcnNhdGlvbiBzdWJzY3JpcHRpb24gYW5kIG5ldmVyIHRvdWNoZXMgc2libGluZyBwZWVyIGNoYXRzOiBjbG9zaW5nXG5cdCAqIG9uZSBjaGF0IG9mIGEgbXVsdGktY2hhdCBzZXNzaW9uIG11c3Qgbm90IHN0cmFuZCBhbm90aGVyIGNoYXQgXHUyMDE0IGluY2x1ZGluZ1xuXHQgKiBvbmUgdGhhdCBpcyBjb25jdXJyZW50bHkgaHlkcmF0aW5nIGluIHtAbGluayBwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50fSBcdTIwMTRcblx0ICogb24gYSBkaXNwb3NlZCBzdWJzY3JpcHRpb24uIFRoZSBzZXNzaW9uIHN1bW1hcnkgc3Vic2NyaXB0aW9uIChhbmQgaXRzXG5cdCAqIGxvY2tzdGVwIGRlZmF1bHQtY2hhdCBzdWJzY3JpcHRpb24pIGlzIHNoYXJlZCBieSBldmVyeSBjaGF0IG9mIHRoZVxuXHQgKiBzZXNzaW9uLCBzbyBpdCBpcyBvbmx5IHRvcm4gZG93biBvbmNlIG5vIHNpYmxpbmcgY2hhdCBzZXNzaW9uIGlzIHN0aWxsXG5cdCAqIGFjdGl2ZSBvciBtaWQtaHlkcmF0aW9uIGZvciB0aGUgc2FtZSBiYWNrZW5kIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9yZWxlYXNlQ2hhdFNlc3Npb25TdWJzY3JpcHRpb25zKHNlc3Npb25Vcmk6IHN0cmluZywgY2hhdFVyaTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gUmVsZWFzZSB0aGlzIGNoYXQncyBvd24gY29udmVyc2F0aW9uIHN1YnNjcmlwdGlvbi4gVGhlIGRlZmF1bHQgY2hhdCdzXG5cdFx0Ly8gc3Vic2NyaXB0aW9uIGlzIGtleWVkIGJ5IHNlc3Npb24gVVJJIGFuZCB0b3JuIGRvd24gdG9nZXRoZXIgd2l0aCB0aGVcblx0XHQvLyBzaGFyZWQgc2Vzc2lvbiBzdWJzY3JpcHRpb24gYmVsb3c7IHBlZXIgY2hhdHMgb3duIGEgZGVkaWNhdGVkIGVudHJ5LlxuXHRcdGlmIChjaGF0VXJpICE9PSB0aGlzLl9nZXRSYXdTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmRlZmF1bHRDaGF0Py50b1N0cmluZygpKSB7XG5cdFx0XHRjb25zdCBjaGF0UmVmID0gdGhpcy5fYWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb25zLmdldChjaGF0VXJpKTtcblx0XHRcdGlmIChjaGF0UmVmKSB7XG5cdFx0XHRcdHRoaXMuX2FkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9ucy5kZWxldGUoY2hhdFVyaSk7XG5cdFx0XHRcdGNoYXRSZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBLZWVwIHRoZSBzaGFyZWQgc2Vzc2lvbiBzdWJzY3JpcHRpb24gYWxpdmUgd2hpbGUgYW55IHNpYmxpbmcgY2hhdCBvZlxuXHRcdC8vIHRoZSBzYW1lIGJhY2tlbmQgc2Vzc2lvbiBpcyBzdGlsbCBhY3RpdmUgb3IgaHlkcmF0aW5nLlxuXHRcdGlmICh0aGlzLl9oYXNPdGhlclNlc3Npb25Ib2xkKHNlc3Npb25VcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25TdWJzY3JpcHRpb25zLmdldChzZXNzaW9uVXJpKTtcblx0XHRpZiAocmVmKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3Vic2NyaXB0aW9ucy5kZWxldGUoc2Vzc2lvblVyaSk7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0UmVmID0gdGhpcy5fZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zLmdldChzZXNzaW9uVXJpKTtcblx0XHRpZiAoY2hhdFJlZikge1xuXHRcdFx0dGhpcy5fZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zLmRlbGV0ZShzZXNzaW9uVXJpKTtcblx0XHRcdGNoYXRSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYW5vdGhlciBjaGF0IHNlc3Npb24gZm9yIHRoZSBnaXZlbiBiYWNrZW5kIHNlc3Npb24gVVJJIGlzXG5cdCAqIHN0aWxsIGFjdGl2ZSBvciBpbiB0aGUgbWlkZGxlIG9mIGh5ZHJhdGluZyBpdHMgc3Vic2NyaXB0aW9ucywgc28gdGhlXG5cdCAqIHNoYXJlZCBzZXNzaW9uIHN1YnNjcmlwdGlvbiBtdXN0IGJlIGtlcHQgYWxpdmUuIENhbGxlcnMgaW52b2tlIHRoaXMgYWZ0ZXJcblx0ICogcmVtb3ZpbmcgdGhlaXIgb3duIGVudHJ5IGZyb20ge0BsaW5rIF9hY3RpdmVTZXNzaW9uc30uXG5cdCAqL1xuXHRwcml2YXRlIF9oYXNPdGhlclNlc3Npb25Ib2xkKHNlc3Npb25Vcmk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICgodGhpcy5faHlkcmF0aW5nQ2hhdFNlc3Npb25zLmdldChzZXNzaW9uVXJpKSA/PyAwKSA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHRoaXMuX2FjdGl2ZVNlc3Npb25zLmtleXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHJlc291cmNlKS50b1N0cmluZygpID09PSBzZXNzaW9uVXJpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZCB0aGUgY3VycmVudCBvcHRpbWlzdGljIHNlc3Npb24gc3RhdGUgZm9yIGEgYmFja2VuZCBzZXNzaW9uIFVSSSxcblx0ICogbWVyZ2VkIHdpdGggaXRzIGRlZmF1bHQgY2hhdCBzbyBjb252ZXJzYXRpb24gY29udGVudHMgKHR1cm5zLCBhY3RpdmVcblx0ICogdHVybiwgcGVuZGluZy9xdWV1ZWQgbWVzc2FnZXMsIGlucHV0IHJlcXVlc3RzKSBhcmUgdmlzaWJsZS5cblx0ICovXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBvbmNlIGEgc3Vic2NyaXB0aW9uIGhhcyByZWNlaXZlZCBpdHMgZmlyc3Qgc25hcHNob3QgKGl0c1xuXHQgKiBgdmFsdWVgIGlzIG5vIGxvbmdlciBgdW5kZWZpbmVkYCkgXHUyMDE0IGkuZS4gaXQgaGFzIGh5ZHJhdGVkIHdpdGggc3RhdGUgb3Jcblx0ICogYW4gZXJyb3IuIFJlc29sdmVzIGltbWVkaWF0ZWx5IGlmIGFscmVhZHkgaHlkcmF0ZWQgb3IgaWYgY2FuY2VsbGF0aW9uXG5cdCAqIGlzIHJlcXVlc3RlZC5cblx0ICovXG5cdHByaXZhdGUgX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZDxUPihzdWI6IElBZ2VudFN1YnNjcmlwdGlvbjxUPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHN1Yi52YWx1ZSAhPT0gdW5kZWZpbmVkIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc2V0dGxlID0gKCkgPT4geyBzdG9yZS5kaXNwb3NlKCk7IHJlc29sdmUoKTsgfTtcblx0XHRcdHN0b3JlLmFkZChzdWIub25EaWRDaGFuZ2UoKCkgPT4geyBpZiAoc3ViLnZhbHVlICE9PSB1bmRlZmluZWQpIHsgc2V0dGxlKCk7IH0gfSkpO1xuXHRcdFx0Y29uc3Qgb25EaWRFcnJvciA9IHN1Yi5vbkRpZEVycm9yO1xuXHRcdFx0aWYgKG9uRGlkRXJyb3IpIHtcblx0XHRcdFx0c3RvcmUuYWRkKG9uRGlkRXJyb3Ioc2V0dGxlKSk7XG5cdFx0XHR9XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoc2V0dGxlKSk7XG5cdFx0XHRpZiAoc3ViLnZhbHVlICE9PSB1bmRlZmluZWQpIHsgc2V0dGxlKCk7IH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpOiBzdHJpbmcsIGNoYXRVcmk/OiBzdHJpbmcpOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9nZXRSYXdTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSB2YWx1ZS5kZWZhdWx0Q2hhdD8udG9TdHJpbmcoKTtcblx0XHRjb25zdCBjaGF0U3RhdGUgPSBjaGF0VXJpICYmIGNoYXRVcmkgIT09IGRlZmF1bHRDaGF0XG5cdFx0XHQ/IHRoaXMuX2dldEFkZGl0aW9uYWxDaGF0U3RhdGUoY2hhdFVyaSlcblx0XHRcdDogdGhpcy5fZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRyZXR1cm4gbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0KHZhbHVlLCBjaGF0U3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmF3U2Vzc2lvblN0YXRlKHNlc3Npb25Vcmk6IHN0cmluZyk6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fc2Vzc2lvblN1YnNjcmlwdGlvbnMuZ2V0KHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHZhbHVlID0gcmVmPy5vYmplY3QudmFsdWU7XG5cdFx0cmV0dXJuIHZhbHVlICYmICEodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlcXVpcmVSYXdTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaTogc3RyaW5nKTogU2Vzc2lvblN0YXRlIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2dldFJhd1Nlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gc3RhdGUgaXMgbm90IGh5ZHJhdGVkIGZvciAke3Nlc3Npb25Vcml9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcXVpcmVEZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gdGhpcy5fcmVxdWlyZVJhd1Nlc3Npb25TdGF0ZShzZXNzaW9uVXJpKS5kZWZhdWx0Q2hhdDtcblx0XHRpZiAoIWRlZmF1bHRDaGF0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uVXJpfSBoYXMgbm8gZGVmYXVsdCBjaGF0YCk7XG5cdFx0fVxuXHRcdHJldHVybiBkZWZhdWx0Q2hhdC50b1N0cmluZygpO1xuXHR9XG5cblx0LyoqIFJlYWQgdGhlIGN1cnJlbnQgb3B0aW1pc3RpYyBkZWZhdWx0LWNoYXQgc3RhdGUgZm9yIGEgYmFja2VuZCBzZXNzaW9uIFVSSS4gKi9cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uVXJpOiBzdHJpbmcpOiBDaGF0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX2RlZmF1bHRDaGF0U3Vic2NyaXB0aW9ucy5nZXQoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gcmVmLm9iamVjdC52YWx1ZTtcblx0XHRyZXR1cm4gKHZhbHVlICYmICEodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikpID8gdmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogUmVhZCB0aGUgY3VycmVudCBvcHRpbWlzdGljIHN0YXRlIGZvciBhbiBhZGRpdGlvbmFsIHBlZXIgY2hhdCBVUkkuICovXG5cdHByaXZhdGUgX2dldEFkZGl0aW9uYWxDaGF0U3RhdGUoY2hhdFVyaTogc3RyaW5nKTogQ2hhdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWYgPSB0aGlzLl9hZGRpdGlvbmFsQ2hhdFN1YnNjcmlwdGlvbnMuZ2V0KGNoYXRVcmkpO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IHJlZi5vYmplY3QudmFsdWU7XG5cdFx0cmV0dXJuICh2YWx1ZSAmJiAhKHZhbHVlIGluc3RhbmNlb2YgRXJyb3IpKSA/IHZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBvciBjcmVhdGUgdGhlIHN1YnNjcmlwdGlvbiBmb3IgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQsIGtleWVkIGJ5IHRoZVxuXHQgKiBjaGF0IGNoYW5uZWwgVVJJLiBNaXJyb3JzIHtAbGluayBfZW5zdXJlRGVmYXVsdENoYXRTdWJzY3JpcHRpb259IGJ1dCBmb3Jcblx0ICogbm9uLWRlZmF1bHQgY2hhdHMgc28gdGhlaXIgY29udmVyc2F0aW9uIGNvbnRlbnRzIGh5ZHJhdGUgaW5kZXBlbmRlbnRseS5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZUFkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9uKGNoYXRVcmk6IHN0cmluZyk6IElBZ2VudFN1YnNjcmlwdGlvbjxDaGF0U3RhdGU+IHtcblx0XHRsZXQgcmVmID0gdGhpcy5fYWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb25zLmdldChjaGF0VXJpKTtcblx0XHRpZiAocmVmPy5vYmplY3QudmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0dGhpcy5fYWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb25zLmRlbGV0ZShjaGF0VXJpKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZWYgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZWYgPSB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLkNoYXQsIFVSSS5wYXJzZShjaGF0VXJpKSwgJ0FnZW50SG9zdFNlc3Npb25IYW5kbGVyJyk7XG5cdFx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdFN1YnNjcmlwdGlvbnMuc2V0KGNoYXRVcmksIHJlZik7XG5cdFx0fVxuXHRcdHJldHVybiByZWYub2JqZWN0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFN1YnNjcmliZSB0byB0aGUgY29udmVyc2F0aW9uIGNoYW5uZWwgb2YgYHNlc3Npb25SZXNvdXJjZWAncyBjaGF0IGFuZFxuXHQgKiByZXR1cm4gdGhlIHtAbGluayBJQWdlbnRTdWJzY3JpcHRpb259LiBSb3V0ZXMgdG8gdGhlIGRlZmF1bHQtY2hhdFxuXHQgKiBzdWJzY3JpcHRpb24gKGZyYWdtZW50LWxlc3MgcmVzb3VyY2UpIG9yIHRvIGFuIGFkZGl0aW9uYWwgcGVlciBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlQ2hhdFN1YnNjcmlwdGlvbihzZXNzaW9uVXJpOiBzdHJpbmcsIGNoYXRVcmk6IHN0cmluZyk6IElBZ2VudFN1YnNjcmlwdGlvbjxDaGF0U3RhdGU+IHtcblx0XHRyZXR1cm4gY2hhdFVyaSA9PT0gdGhpcy5fcmVxdWlyZURlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpXG5cdFx0XHQ/IHRoaXMuX2Vuc3VyZURlZmF1bHRDaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25VcmkpXG5cdFx0XHQ6IHRoaXMuX2Vuc3VyZUFkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9uKGNoYXRVcmkpO1xuXHR9XG5cblx0cmVzb2x2ZUNoYXRSZXNwb25zZVVyaShfc2Vzc2lvblJlc291cmNlOiBVUkksIGhyZWY6IHN0cmluZywgX2tpbmQ6ICdsaW5rJyB8ICdpbWFnZScpOiBzdHJpbmcge1xuXHRcdHJldHVybiByZXdyaXRlQWdlbnRIb3N0TGlua1RhcmdldChocmVmLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZCB0aGUgY3VycmVudCByb290IHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0Um9vdFN0YXRlKCk6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5yb290U3RhdGUudmFsdWU7XG5cdFx0cmV0dXJuICh2YWx1ZSAmJiAhKHZhbHVlIGluc3RhbmNlb2YgRXJyb3IpKSA/IHZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFssIHNlc3Npb25dIG9mIHRoaXMuX2FjdGl2ZVNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbnMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLl9zZXNzaW9uU3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvblN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLl9kZWZhdWx0Q2hhdFN1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlZmF1bHRDaGF0U3Vic2NyaXB0aW9ucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIHRoaXMuX2FkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fYWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb25zLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDbGllbnQtcHJvdmlkZWQgdG9vbCBoZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIENvbnZlcnRzIGFuIGludGVybmFsIHtAbGluayBJVG9vbFJlc3VsdH0gdG8gYSBwcm90b2NvbFxuICoge0BsaW5rIGltcG9ydCgnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcycpLlRvb2xDYWxsUmVzdWx0fS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvb2xSZXN1bHRUb1Byb3RvY29sKHJlc3VsdDogSVRvb2xSZXN1bHQsIHRvb2xOYW1lOiBzdHJpbmcpOiB7XG5cdHN1Y2Nlc3M6IGJvb2xlYW47XG5cdHBhc3RUZW5zZU1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd247XG5cdGNvbnRlbnQ/OiAoeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDsgdGV4dDogc3RyaW5nIH0gfCB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlOyBkYXRhOiBzdHJpbmc7IGNvbnRlbnRUeXBlOiBzdHJpbmcgfSlbXTtcblx0ZXJyb3I/OiB7IG1lc3NhZ2U6IHN0cmluZyB9O1xufSB7XG5cdGNvbnN0IGlzRXJyb3IgPSAhIXJlc3VsdC50b29sUmVzdWx0RXJyb3I7XG5cdGNvbnN0IGRlZmF1bHRQYXN0VGVuc2UgPSBpc0Vycm9yID8gYCR7dG9vbE5hbWV9IGZhaWxlZGAgOiBgUmFuICR7dG9vbE5hbWV9YDtcblx0Y29uc3QgcGFzdFRlbnNlOiBTdHJpbmdPck1hcmtkb3duID0gdHlwZW9mIHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHQ/IHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZVxuXHRcdDogcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlXG5cdFx0XHQ/IHsgbWFya2Rvd246IHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZS52YWx1ZSB9XG5cdFx0XHQ6IGRlZmF1bHRQYXN0VGVuc2U7XG5cblx0Y29uc3QgY29udGVudDogKHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQ7IHRleHQ6IHN0cmluZyB9IHwgeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZTsgZGF0YTogc3RyaW5nOyBjb250ZW50VHlwZTogc3RyaW5nIH0pW10gPSBbXTtcblx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlc3VsdC5jb250ZW50KSB7XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRjb250ZW50LnB1c2goeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogcGFydC52YWx1ZSB9KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ3Byb21wdFRzeCcpIHtcblx0XHRcdGNvbnRlbnQucHVzaCh7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiBzdHJpbmdpZnlQcm9tcHRUc3hQYXJ0KHBhcnQpIH0pO1xuXHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdGNvbnRlbnQucHVzaCh7XG5cdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlLFxuXHRcdFx0XHRkYXRhOiBlbmNvZGVCYXNlNjQocGFydC52YWx1ZS5kYXRhKSxcblx0XHRcdFx0Y29udGVudFR5cGU6IHBhcnQudmFsdWUubWltZVR5cGUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHN1Y2Nlc3M6ICFpc0Vycm9yLFxuXHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhc3RUZW5zZSxcblx0XHRjb250ZW50OiBjb250ZW50Lmxlbmd0aCA+IDAgPyBjb250ZW50IDogdW5kZWZpbmVkLFxuXHRcdGVycm9yOiBpc0Vycm9yXG5cdFx0XHQ/IHsgbWVzc2FnZTogdHlwZW9mIHJlc3VsdC50b29sUmVzdWx0RXJyb3IgPT09ICdzdHJpbmcnID8gcmVzdWx0LnRvb2xSZXN1bHRFcnJvciA6IGAke3Rvb2xOYW1lfSBlbmNvdW50ZXJlZCBhbiBlcnJvcmAg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QUFhO0FBQ3JDLGNBQVEsS0FBSyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSx1QkFBdUIsSUFBSSxFQUFFLENBQUM7QUFBQSxJQUN0RixXQUFXLEtBQUssU0FBUyxRQUFRO0FBQ2hDLGNBQVEsS0FBSztBQUFBLFFBQ1osTUFBTSxzQkFBc0I7QUFBQSxRQUM1QixNQUFNLGFBQWEsS0FBSyxNQUFNLElBQUk7QUFBQSxRQUNsQyxhQUFhLEtBQUssTUFBTTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFBQSxJQUNOLFNBQVMsQ0FBQztBQUFBLElBQ1Ysa0JBQWtCO0FBQUEsSUFDbEIsU0FBUyxRQUFRLFNBQVMsSUFBSSxVQUFVO0FBQUEsSUFDeEMsT0FBTyxVQUNKLEVBQUUsU0FBUyxPQUFPLE9BQU8sb0JBQW9CLFdBQVcsT0FBTyxrQkFBa0IsR0FBRyxRQUFRLHdCQUF3QixJQUNwSDtBQUFBLEVBQ0o7QUFDRDsiLAogICJuYW1lcyI6IFsiYyIsICJzdGF0ZSIsICJhY3Rpb24iLCAidG9rZW4iLCAiY2hhdFVSSSIsICJjdXJyZW50IiwgImNoYXRSZWYiXQp9Cg==
