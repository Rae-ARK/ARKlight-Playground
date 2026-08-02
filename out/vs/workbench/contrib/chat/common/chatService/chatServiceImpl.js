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
import { DeferredPromise, raceCancellationError, raceTimeout } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { BugIndicatingError, ErrorNoTelemetry } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableResourceMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { equals } from "../../../../../base/common/objects.js";
import { autorun, derived, observableValue } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { Progress } from "../../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IChatDebugService } from "../chatDebugService.js";
import { IMcpService } from "../../../mcp/common/mcpTypes.js";
import { awaitStatsForSession } from "../chat.js";
import { ChatPerfMark, clearChatMarks, markChat } from "../chatPerf.js";
import { IChatAgentService } from "../participants/chatAgents.js";
import { chatEditingSessionIsReady } from "../editing/chatEditingService.js";
import { ChatModel, ChatRequestModel, ChatRequestRemovalReason, normalizeSerializableChatData, toChatHistoryContent, updateRanges, logChangesToStateModel } from "../model/chatModel.js";
import { ChatModelStore } from "../model/chatModelStore.js";
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, chatSubcommandLeader, getPromptText } from "../requestParser/chatParserTypes.js";
import { ChatRequestParser } from "../requestParser/chatRequestParser.js";
import { ChatMcpServersStarting, ChatPendingRequestChangeEventName, ChatRequestQueueKind, ChatStopCancellationNoopEventName, ResponseModelState } from "./chatService.js";
import { ChatRequestTelemetry, ChatServiceTelemetry } from "./chatServiceTelemetry.js";
import { IChatSessionsService, isAgentHostTarget, isTerminalCommandPrompt, localChatSessionType } from "../chatSessionsService.js";
import { ChatSessionStore } from "../model/chatSessionStore.js";
import { IChatSlashCommandService } from "../participants/chatSlashCommands.js";
import { IChatTransferService } from "../model/chatTransferService.js";
import { chatSessionResourceToId, getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from "../model/chatUri.js";
import { ChatRequestVariableSet, IChatRequestVariableEntry, isExplicitFileOrImageVariableEntry, isPromptTextVariableEntry } from "../attachments/chatVariableEntries.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../constants.js";
import { ChatMessageRole, ILanguageModelsService } from "../languageModels.js";
import { ILanguageModelToolsService, ToolAndToolSetEnablementMap } from "../tools/languageModelToolsService.js";
import { ChatSessionOperationLog } from "../model/chatSessionOperationLog.js";
import { IPromptsService } from "../promptSyntax/service/promptsService.js";
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, TROUBLESHOOT_COMMAND_NAME, TROUBLESHOOT_SKILL_PATH, COPILOT_SKILL_URI_SCHEME } from "../promptSyntax/promptTypes.js";
import { mergeHooks } from "../promptSyntax/hookSchema.js";
import { ComputeAutomaticInstructions } from "../promptSyntax/computeAutomaticInstructions.js";
import { findLast } from "../../../../../base/common/arraysFind.js";
import { ChatMode } from "../chatModes.js";
const serializedChatKey = "interactive.sessions";
function hasDraftInput(model) {
  const state = model.inputModel.state.get();
  if (!state) {
    return false;
  }
  if (state.inputText.trim().length > 0) {
    return true;
  }
  return state.attachments.length > 0;
}
let CancellableRequest = class {
  constructor(cancellationTokenSource, requestId, responseCompletePromise, sendOptions, toolsService) {
    this.cancellationTokenSource = cancellationTokenSource;
    this.requestId = requestId;
    this.responseCompletePromise = responseCompletePromise;
    this.sendOptions = sendOptions;
    this.toolsService = toolsService;
    this._yieldRequested = observableValue(this, false);
  }
  get yieldRequested() {
    return this._yieldRequested;
  }
  dispose() {
    if (this.requestId) {
      this.toolsService.cancelToolCallsForRequest(this.requestId);
    }
    this.cancellationTokenSource.dispose();
  }
  cancel() {
    if (this.requestId) {
      this.toolsService.cancelToolCallsForRequest(this.requestId);
    }
    this.cancellationTokenSource.cancel();
  }
  setYieldRequested() {
    this._yieldRequested.set(true, void 0);
  }
  resetYieldRequested() {
    this._yieldRequested.set(false, void 0);
  }
};
CancellableRequest = __decorateClass([
  __decorateParam(4, ILanguageModelToolsService)
], CancellableRequest);
const EMPTY_REFERENCES = Object.freeze([]);
const EMPTY_TOOL_ENABLEMENT_MAP = ToolAndToolSetEnablementMap.fromEntries([]);
function backfillRestoredPickerState(stateToApply, savedState, defaultAgentModeId) {
  if (!stateToApply || !savedState) {
    return stateToApply;
  }
  const mode = stateToApply.mode.id === defaultAgentModeId && savedState.mode.id !== defaultAgentModeId ? savedState.mode : stateToApply.mode;
  if (mode === stateToApply.mode) {
    return stateToApply;
  }
  return { ...stateToApply, mode };
}
function backfillTransferredModel(transferredState, historyModel) {
  if (!transferredState || transferredState.selectedModel || !historyModel) {
    return transferredState;
  }
  return { ...transferredState, selectedModel: historyModel };
}
let ChatService = class extends Disposable {
  constructor(storageService, logService, telemetryService, extensionService, instantiationService, workspaceContextService, chatSlashCommandService, chatAgentService, configurationService, chatTransferService, chatSessionService, mcpService, promptsService, chatEntitlementService, languageModelsService, chatDebugService) {
    super();
    this.storageService = storageService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.extensionService = extensionService;
    this.instantiationService = instantiationService;
    this.workspaceContextService = workspaceContextService;
    this.chatSlashCommandService = chatSlashCommandService;
    this.chatAgentService = chatAgentService;
    this.configurationService = configurationService;
    this.chatTransferService = chatTransferService;
    this.chatSessionService = chatSessionService;
    this.mcpService = mcpService;
    this.promptsService = promptsService;
    this.chatEntitlementService = chatEntitlementService;
    this.languageModelsService = languageModelsService;
    this.chatDebugService = chatDebugService;
    this._pendingRequests = this._register(new DisposableResourceMap());
    this._queuedRequestDeferreds = /* @__PURE__ */ new Map();
    /** Pending requests that are synthetic streamed-turn trackers (not real in-flight requests). */
    this._syntheticPendingRequests = /* @__PURE__ */ new WeakSet();
    /**
     * In-flight untitled→real materializations, keyed by the original untitled
     * chat session resource. A first send to an untitled contributed session
     * stores the promise that resolves to the newly minted real resource (or
     * `undefined` on failure). A concurrent second send for the same untitled
     * resource awaits this instead of materializing a second real session.
     *
     * The committed (settled) untitled→real mapping is owned by
     * {@link IChatSessionsService} (published via `setMaterializedSessionResource`
     * and read via `getMaterializedSessionResource`); this map only tracks the
     * transient in-flight serialization.
     */
    this._inFlightUntitledMaterializations = new ResourceMap();
    this._saveModelsEnabled = true;
    this._onDidSubmitRequest = this._register(new Emitter());
    this.onDidSubmitRequest = this._onDidSubmitRequest.event;
    this._onDidPerformUserAction = this._register(new Emitter());
    this.onDidPerformUserAction = this._onDidPerformUserAction.event;
    this._onDidReceiveQuestionCarouselAnswer = this._register(new Emitter());
    this.onDidReceiveQuestionCarouselAnswer = this._onDidReceiveQuestionCarouselAnswer.event;
    this._onDidDisposeSession = this._register(new Emitter());
    this.onDidDisposeSession = this._onDidDisposeSession.event;
    this._sessionFollowupCancelTokens = this._register(new DisposableResourceMap());
    this._sessionModels = this._register(instantiationService.createInstance(ChatModelStore, {
      createModel: (props) => this._startSession(props),
      willDisposeModel: async (model) => {
        const localSessionId = LocalChatSessionUri.parseLocalSessionId(model.sessionResource);
        if (localSessionId && this.shouldStoreSession(model)) {
          if (model.getRequests().length === 0 && !model.customTitle) {
            logChangesToStateModel(model.inputModel, `disposing session ${model.sessionResource} (${localSessionId}) without title, deleting from storage`, void 0, void 0, this.logService);
            await this._chatSessionStore.deleteSession(localSessionId);
          } else if (this._saveModelsEnabled) {
            logChangesToStateModel(model.inputModel, `disposing session ${model.sessionResource} (${localSessionId}) with title, storing to storage`, void 0, void 0, this.logService);
            await this._chatSessionStore.storeSessions([model]);
          }
        } else if (!localSessionId && (model.getRequests().length > 0 || hasDraftInput(model))) {
          logChangesToStateModel(model.inputModel, `disposing external session ${model.sessionResource} with requests or draft input, storing metadata to storage`, void 0, void 0, this.logService);
          await this._chatSessionStore.storeSessionsMetadataOnly([model]);
        }
      }
    }));
    this._register(this._sessionModels.onDidDisposeModel((model) => {
      clearChatMarks(model.sessionResource);
      this.chatDebugService.endSession(model.sessionResource);
      this._sessionFollowupCancelTokens.get(model.sessionResource)?.cancel();
      this._sessionFollowupCancelTokens.deleteAndDispose(model.sessionResource);
      this.chatSessionService.clearMaterializedSessionResource(model.sessionResource);
      this._onDidDisposeSession.fire({ sessionResources: [model.sessionResource], reason: "cleared" });
    }));
    this._chatServiceTelemetry = this.instantiationService.createInstance(ChatServiceTelemetry);
    this._chatSessionStore = this._register(this.instantiationService.createInstance(ChatSessionStore));
    this._chatSessionStore.migrateDataIfNeeded(() => this.migrateData());
    const transferredData = this._chatSessionStore.getTransferredSessionData();
    if (transferredData) {
      this.trace("constructor", `Transferred session ${transferredData}`);
      this._transferredSessionResource = transferredData;
    }
    this._register(storageService.onWillSaveState(() => this.saveState()));
    this.chatModels = derived(this, (reader) => [...this._sessionModels.observable.read(reader).values()]);
    this.requestInProgressObs = derived((reader) => {
      const models = this._sessionModels.observable.read(reader).values();
      return Iterable.some(models, (model) => model.requestInProgress.read(reader));
    });
  }
  get transferredSessionResource() {
    return this._transferredSessionResource;
  }
  get onDidCreateModel() {
    return this._sessionModels.onDidCreateModel;
  }
  /**
   * For test use only
   */
  setSaveModelsEnabled(enabled) {
    this._saveModelsEnabled = enabled;
  }
  /**
   * For test use only
   */
  waitForModelDisposals() {
    return this._sessionModels.waitForModelDisposals();
  }
  get isEmptyWindow() {
    const workspace = this.workspaceContextService.getWorkspace();
    return !workspace.configuration && workspace.folders.length === 0;
  }
  get editingSessions() {
    return [...this._sessionModels.values()].map((v) => v.editingSession).filter(isDefined);
  }
  isEnabled(location) {
    return this.chatAgentService.getContributedDefaultAgent(location) !== void 0;
  }
  migrateData() {
    const sessionData = this.storageService.get(serializedChatKey, this.isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE, "");
    if (sessionData) {
      const persistedSessions = this.deserializeChats(sessionData);
      const countsForLog = Object.keys(persistedSessions).length;
      if (countsForLog > 0) {
        this.info("migrateData", `Restored ${countsForLog} persisted sessions`);
      }
      return persistedSessions;
    }
    return;
  }
  saveState() {
    if (!this._saveModelsEnabled) {
      return;
    }
    const liveLocalChats = Array.from(this._sessionModels.values()).filter((session) => this.shouldStoreSession(session));
    const liveNonLocalChats = Array.from(this._sessionModels.values()).filter((session) => !LocalChatSessionUri.parseLocalSessionId(session.sessionResource));
    this._chatSessionStore.updateAndFlushIndexSync(liveLocalChats, liveNonLocalChats);
    this._chatSessionStore.storeSessions(liveLocalChats);
    this._chatSessionStore.storeSessionsMetadataOnly(liveNonLocalChats);
  }
  /**
   * Only persist local sessions from chat that are not imported.
   */
  shouldStoreSession(session) {
    if (session.isDeleted) {
      return false;
    }
    if (!LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
      return false;
    }
    return session.initialLocation === ChatAgentLocation.Chat && !session.isImported;
  }
  notifyUserAction(action) {
    this._chatServiceTelemetry.notifyUserAction(action);
    this._onDidPerformUserAction.fire(action);
    if (action.action.kind === "chatEditingSessionAction") {
      const model = this._sessionModels.get(action.sessionResource);
      if (model) {
        model.notifyEditingAction(action.action);
      }
    }
  }
  notifyQuestionCarouselAnswer(requestId, resolveId, answers) {
    this._onDidReceiveQuestionCarouselAnswer.fire({ requestId, resolveId, answers });
  }
  async setChatSessionTitle(sessionResource, title) {
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.setCustomTitle(title);
    }
    const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (localSessionId) {
      await this._chatSessionStore.setSessionTitle(localSessionId, title);
      this.saveState();
    }
  }
  trace(method, message) {
    if (message) {
      this.logService.trace(`ChatService#${method}: ${message}`);
    } else {
      this.logService.trace(`ChatService#${method}`);
    }
  }
  info(method, message) {
    if (message) {
      this.logService.info(`ChatService#${method}: ${message}`);
    } else {
      this.logService.info(`ChatService#${method}`);
    }
  }
  error(method, message) {
    this.logService.error(`ChatService#${method} ${message}`);
  }
  deserializeChats(sessionData) {
    try {
      const arrayOfSessions = revive(JSON.parse(sessionData));
      if (!Array.isArray(arrayOfSessions)) {
        throw new Error("Expected array");
      }
      const sessions = arrayOfSessions.reduce((acc, session) => {
        for (const request of session.requests) {
          if (Array.isArray(request.response)) {
            request.response = request.response.map((response) => {
              if (typeof response === "string") {
                return new MarkdownString(response);
              }
              return response;
            });
          } else if (typeof request.response === "string") {
            request.response = [new MarkdownString(request.response)];
          }
        }
        acc[session.sessionId] = normalizeSerializableChatData(session);
        return acc;
      }, {});
      return sessions;
    } catch (err) {
      this.error("deserializeChats", `Malformed session data: ${err}. [${sessionData.substring(0, 20)}${sessionData.length > 20 ? "..." : ""}]`);
      return {};
    }
  }
  /**
   * Returns an array of chat details for all persisted chat sessions that have at least one request.
   * Chat sessions that have already been loaded into the chat view are excluded from the result.
   * Imported chat sessions are also excluded from the result.
   * TODO this is only used by the old "show chats" command which can be removed when the pre-agents view
   * options are removed.
   */
  async getLocalSessionHistory() {
    const liveSessionItems = await this.getLiveSessionItems();
    const historySessionItems = await this.getHistorySessionItems();
    return [...liveSessionItems, ...historySessionItems];
  }
  /**
   * Returns an array of chat details for all local live chat sessions.
   */
  async getLiveSessionItems() {
    return await Promise.all(Array.from(this._sessionModels.values()).filter((session) => this.shouldBeInHistory(session)).map(chatModelToChatDetail));
  }
  /**
   * Returns an array of chat details for all local chat sessions in history (not currently loaded).
   */
  async getHistorySessionItems() {
    const index = await this._chatSessionStore.getIndex();
    return Object.values(index).filter((entry) => !entry.isExternal).filter((entry) => !this._sessionModels.has(LocalChatSessionUri.forSession(entry.sessionId)) && entry.initialLocation === ChatAgentLocation.Chat && !entry.isEmpty).map((entry) => {
      const sessionResource = LocalChatSessionUri.forSession(entry.sessionId);
      const { workingDirectory: workingDirectoryStr, ...rest } = entry;
      return {
        ...rest,
        sessionResource,
        isActive: this._sessionModels.has(sessionResource),
        workingDirectory: workingDirectoryStr ? URI.parse(workingDirectoryStr) : void 0
      };
    });
  }
  async getMetadataForSession(sessionResource) {
    const index = await this._chatSessionStore.getIndex();
    const metadata = index[sessionResource.toString()];
    if (metadata) {
      const { workingDirectory: workingDirectoryStr, ...rest } = metadata;
      return {
        ...rest,
        sessionResource,
        isActive: this._sessionModels.has(sessionResource),
        workingDirectory: workingDirectoryStr ? URI.parse(workingDirectoryStr) : void 0
      };
    }
    return void 0;
  }
  shouldBeInHistory(entry) {
    return !entry.isImported && !entry.isDeleted && !!LocalChatSessionUri.parseLocalSessionId(entry.sessionResource) && entry.initialLocation === ChatAgentLocation.Chat;
  }
  async removeHistoryEntry(sessionResource) {
    await this._chatSessionStore.deleteSession(this.toLocalSessionId(sessionResource));
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.markDeleted();
    }
    this._onDidDisposeSession.fire({ sessionResources: [sessionResource], reason: "cleared" });
  }
  async clearAllHistoryEntries() {
    await this._chatSessionStore.clearAllSessions();
  }
  startNewLocalSession(location, options) {
    this.trace("startNewLocalSession");
    const sessionResource = LocalChatSessionUri.forSession(generateUuid());
    return this._sessionModels.acquireOrCreate({
      initialData: void 0,
      location,
      sessionResource,
      canUseTools: options?.canUseTools ?? true,
      disableBackgroundKeepAlive: options?.disableBackgroundKeepAlive
    }, options?.debugOwner ?? "ChatService#startNewLocalSession");
  }
  _startSession(props) {
    const { initialData, location, sessionResource, canUseTools, transferEditingSession, disableBackgroundKeepAlive, inputState, isReadOnly } = props;
    const model = this.instantiationService.createInstance(ChatModel, initialData, { initialLocation: location, canUseTools, resource: sessionResource, disableBackgroundKeepAlive, inputState, isReadOnly });
    if (location === ChatAgentLocation.Chat) {
      model.startEditingSession(true, transferEditingSession);
    }
    this.initializeSession(model);
    return model;
  }
  initializeSession(model) {
    this.trace("initializeSession", `Initialize session ${model.sessionResource}`);
    this.activateDefaultAgent(model.initialLocation).catch((e) => this.logService.error(e));
  }
  async activateDefaultAgent(location) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const defaultAgentData = this.chatAgentService.getContributedDefaultAgent(location) ?? this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Chat);
    if (!defaultAgentData) {
      throw new ErrorNoTelemetry("No default agent contributed");
    }
    if (!defaultAgentData.isCore) {
      await this.extensionService.activateById(defaultAgentData.extensionId, {
        activationEvent: `onChatParticipant:${defaultAgentData.id}`,
        extensionId: defaultAgentData.extensionId,
        startup: false
      });
    }
    const defaultAgent = this.chatAgentService.getActivatedAgents().find((agent) => agent.id === defaultAgentData.id);
    if (!defaultAgent) {
      throw new ErrorNoTelemetry("No default agent registered");
    }
  }
  getSession(sessionResource) {
    return this._sessionModels.get(sessionResource);
  }
  acquireExistingSession(sessionResource, debugOwner) {
    return this._sessionModels.acquireExisting(sessionResource, debugOwner ?? "ChatService#acquireExistingSession");
  }
  getChatModelReferenceDebugInfo() {
    return this._sessionModels.getReferenceDebugSnapshot();
  }
  async acquireOrRestoreLocalSession(sessionResource, debugOwner) {
    this.trace("acquireOrRestoreSession", `${sessionResource}`);
    const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
    if (existingRef) {
      return existingRef;
    }
    let sessionData;
    if (isEqual(this.transferredSessionResource, sessionResource)) {
      this._transferredSessionResource = void 0;
      sessionData = await this._chatSessionStore.readTransferredSession(sessionResource);
    } else {
      const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
      if (localSessionId) {
        sessionData = await this._chatSessionStore.readSession(localSessionId);
      }
    }
    if (!sessionData) {
      return void 0;
    }
    const sessionRef = this._sessionModels.acquireOrCreate({
      initialData: sessionData,
      location: sessionData.value.initialLocation ?? ChatAgentLocation.Chat,
      sessionResource,
      canUseTools: true
    }, debugOwner ?? "ChatService#acquireOrRestoreLocalSession");
    return sessionRef;
  }
  // There are some cases where this returns a real string. What happens if it doesn't?
  // This had titles restored from the index, so just return titles from index instead, sync.
  getSessionTitle(sessionResource) {
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (!sessionId) {
      return void 0;
    }
    return this._sessionModels.get(sessionResource)?.title ?? this._chatSessionStore.getMetadataForSessionSync(sessionResource)?.title;
  }
  loadSessionFromData(data, debugOwner) {
    const sessionId = data.sessionId ?? generateUuid();
    const sessionResource = LocalChatSessionUri.forSession(sessionId);
    return this._sessionModels.acquireOrCreate({
      initialData: { value: data, serializer: new ChatSessionOperationLog() },
      location: data.initialLocation ?? ChatAgentLocation.Chat,
      sessionResource,
      canUseTools: true
    }, debugOwner ?? "ChatService#loadSessionFromData");
  }
  async acquireOrLoadSession(sessionResource, location, token, debugOwner) {
    if (LocalChatSessionUri.isLocalSession(sessionResource)) {
      return this.acquireOrRestoreLocalSession(sessionResource, debugOwner);
    } else {
      return this.loadRemoteSession(sessionResource, location, token, debugOwner);
    }
  }
  async loadRemoteSession(sessionResource, location, token, debugOwner) {
    {
      const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
      if (existingRef) {
        return existingRef;
      }
    }
    if (!await raceCancellationError(this.chatSessionService.canResolveChatSession(getChatSessionType(sessionResource)), token)) {
      return void 0;
    }
    const providedSession = await this.chatSessionService.getOrCreateChatSession(sessionResource, token);
    {
      const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
      if (existingRef) {
        return existingRef;
      }
    }
    const chatSessionType = getChatSessionType(sessionResource);
    const modelId = findLast(providedSession.history.filter((m) => m.type === "request"), (req) => req.modelId)?.modelId;
    const agentUri = findLast(providedSession.history.filter((m) => m.type === "request"), (req) => req.modeInstructions?.uri)?.modeInstructions?.uri;
    const storedMetadata = this._chatSessionStore.getMetadataForSessionSync(sessionResource);
    const storedPermissionLevel = storedMetadata?.permissionLevel;
    const storedInputState = storedMetadata?.inputState;
    let initialData = void 0;
    let historySelectedModel = void 0;
    let historyDerivedModel = void 0;
    if (modelId || agentUri) {
      const mode = agentUri ? { kind: ChatModeKind.Agent, id: agentUri.toString() } : { kind: ChatModeKind.Agent, id: ChatMode.Agent.id };
      const modelMetadata = modelId ? this.languageModelsService.lookupLanguageModel(modelId) : void 0;
      const storedModelConfiguration = storedInputState?.selectedModel?.modelConfiguration ?? storedInputState?.modelConfiguration;
      const modelConfiguration = storedInputState?.selectedModel?.identifier === modelId ? storedModelConfiguration : void 0;
      const storedSelectedModel = storedInputState?.selectedModel;
      const selectedModel = modelId && modelMetadata ? { identifier: modelId, metadata: modelMetadata, modelConfiguration } : modelId && storedSelectedModel && storedSelectedModel.identifier === modelId ? { ...storedSelectedModel, modelConfiguration } : void 0;
      historySelectedModel = selectedModel?.identifier;
      historyDerivedModel = selectedModel;
      initialData = {
        serializer: new ChatSessionOperationLog(),
        value: {
          creationDate: Date.now(),
          initialLocation: void 0,
          customTitle: void 0,
          requests: [],
          responderUsername: "",
          sessionId: "",
          version: 3,
          inputState: {
            attachments: [],
            contrib: {},
            inputText: "",
            mode,
            selectedModel,
            selections: [],
            permissionLevel: storedPermissionLevel
          },
          pendingRequests: void 0,
          repoData: void 0
        }
      };
    }
    const restoredDraft = storedInputState ? { ...storedInputState, selectedModel: historyDerivedModel } : void 0;
    const transferredInputState = providedSession.transferredState?.inputState;
    const stateToApply = transferredInputState ? backfillTransferredModel(transferredInputState, historyDerivedModel) : restoredDraft;
    const inputState = backfillRestoredPickerState(stateToApply, storedInputState, ChatMode.Agent.id);
    const modelRef = this._sessionModels.acquireOrCreate({
      initialData,
      location,
      sessionResource,
      canUseTools: false,
      transferEditingSession: providedSession.transferredState?.editingSession,
      inputState,
      isReadOnly: providedSession.isReadOnly
    }, debugOwner ?? "ChatService#loadRemoteSession");
    logChangesToStateModel(modelRef.object.inputModel, `loadRemoteSession inputState source: session=${sessionResource.toString()}, chatSessionType=${chatSessionType}, historyModelId=${modelId}, agentUri=${agentUri?.toString()}, historySelectedModel=${historySelectedModel}, transferredSelectedModel=${providedSession.transferredState?.inputState?.selectedModel?.identifier}, storedSelectedModel=${storedInputState?.selectedModel?.identifier}, finalSelectedModel=${modelRef.object.inputModel.state.get()?.selectedModel?.identifier}, hasTransferredInputState=${!!providedSession.transferredState?.inputState}, hasStoredInputState=${!!storedInputState}, hasInitialData=${!!initialData}`, modelRef.object.inputModel.state.get(), void 0, this.logService);
    if (storedPermissionLevel && !initialData && !storedInputState) {
      modelRef.object.inputModel.setState({ permissionLevel: storedPermissionLevel });
    }
    if (providedSession.title) {
      modelRef.object.setCustomTitle(providedSession.title);
    }
    const model = modelRef.object;
    const disposables = new DisposableStore();
    disposables.add(modelRef.object.onDidDispose(() => {
      disposables.dispose();
      providedSession.dispose();
    }));
    const isAgentHostSession = isAgentHostTarget(chatSessionType);
    const requestParser = isAgentHostSession ? this.instantiationService.createInstance(ChatRequestParser) : void 0;
    const parseAgentHostHistoryPrompt = (text, agent) => {
      if (requestParser) {
        try {
          const attachmentCapabilities = this.getAttachmentCapabilitiesForParser(chatSessionType, agent);
          const parsed = requestParser.parseChatRequestWithReferences(
            EMPTY_REFERENCES,
            EMPTY_TOOL_ENABLEMENT_MAP,
            text,
            location,
            { sessionType: chatSessionType, forcedAgent: agent, attachmentCapabilities }
          );
          if (parsed.parts.length > 0) {
            return parsed;
          }
        } catch (e) {
          this.logService.warn(`ChatService#loadRemoteSession: failed to re-parse historical prompt for ${chatSessionType}`, e);
        }
      }
      return {
        text,
        parts: [new ChatRequestTextPart(
          new OffsetRange(0, text.length),
          { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: text.length + 1 },
          text
        )]
      };
    };
    let lastRequest;
    let lastResponseCompletedAt;
    const completeLastResponse = () => {
      if (Number.isFinite(lastResponseCompletedAt)) {
        lastRequest?.response?.complete(lastResponseCompletedAt);
      } else {
        lastRequest?.response?.completeWithoutTimestamp();
      }
      lastResponseCompletedAt = void 0;
    };
    for (const message of providedSession.history) {
      if (message.type === "request") {
        if (lastRequest) {
          completeLastResponse();
        }
        const requestText = message.prompt;
        const agent = message.participant ? this.chatAgentService.getAgent(message.participant) : this.chatAgentService.getAgent(chatSessionType);
        const parsedRequest = parseAgentHostHistoryPrompt(requestText, agent);
        const modeInfo = message.modeInstructions ? {
          kind: ChatModeKind.Agent,
          isBuiltin: message.modeInstructions.isBuiltin ?? false,
          modeInstructions: message.modeInstructions,
          telemetryModeId: "custom",
          applyCodeBlockSuggestionId: void 0
        } : void 0;
        lastRequest = model.addRequest(
          parsedRequest,
          message.variableData ?? { variables: [] },
          0,
          // attempt
          modeInfo,
          agent,
          void 0,
          // slashCommand
          void 0,
          // confirmation
          void 0,
          // locationData
          void 0,
          // attachments
          false,
          // Do not treat as requests completed, else edit pills won't show.
          message.modelId,
          void 0,
          message.id,
          message.isSystemInitiated,
          message.systemInitiatedLabel,
          void 0,
          // terminalExecutionId
          message.isTerminalRequest,
          message.timestamp ?? null
        );
      } else {
        if (lastRequest) {
          for (const part of message.parts) {
            model.acceptResponseProgress(lastRequest, part);
          }
          if (lastRequest.response && (message.details || message.errorDetails)) {
            lastRequest.response.setResult({
              ...message.details ? { details: message.details } : {},
              ...message.errorDetails ? { errorDetails: message.errorDetails } : {}
            });
          }
          if (lastRequest.response && typeof message.elapsedMs === "number") {
            lastRequest.response.setElapsedMs(message.elapsedMs);
          }
          lastResponseCompletedAt = message.completedAt;
        }
      }
    }
    const hasProgressStreaming = providedSession.progressObs && providedSession.interruptActiveResponseCallback;
    if (hasProgressStreaming) {
      let lastProgressLength = 0;
      const cancellationListener = disposables.add(new MutableDisposable());
      const createCancellationListener = (token2) => {
        return token2.onCancellationRequested(() => {
          providedSession.interruptActiveResponseCallback?.().then((userConfirmedInterruption) => {
            if (!userConfirmedInterruption) {
              trackNewCancellableRequest();
            }
          });
        });
      };
      const trackNewCancellableRequest = () => {
        const cancellableRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), void 0, void 0, void 0);
        this._syntheticPendingRequests.add(cancellableRequest);
        this._pendingRequests.set(model.sessionResource, cancellableRequest);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "remoteSession", chatSessionId: chatSessionResourceToId(model.sessionResource) });
        cancellationListener.value = createCancellationListener(cancellableRequest.cancellationTokenSource.token);
      };
      const ensureCancellationTracking = () => {
        if (!this._pendingRequests.has(model.sessionResource)) {
          trackNewCancellableRequest();
        }
      };
      if (lastRequest && !providedSession.isCompleteObs?.get()) {
        trackNewCancellableRequest();
      }
      if (providedSession.onDidStartServerRequest) {
        disposables.add(providedSession.onDidStartServerRequest(({ id, prompt, variableData, timestamp, isSystemInitiated, systemInitiatedLabel, isTerminalRequest }) => {
          if (lastRequest?.response && !lastRequest.response.isComplete) {
            completeLastResponse();
          }
          const agent = this.chatAgentService.getAgent(chatSessionType);
          const parsedRequest = parseAgentHostHistoryPrompt(prompt, agent);
          lastRequest = model.addRequest(
            parsedRequest,
            variableData ?? { variables: [] },
            0,
            // attempt
            void 0,
            // modeInfo
            agent,
            void 0,
            // slashCommand
            void 0,
            // confirmation
            void 0,
            // locationData
            void 0,
            // attachments
            void 0,
            // isCompleteAddedRequest
            void 0,
            // modelId
            void 0,
            // userSelectedTools
            id,
            isSystemInitiated,
            systemInitiatedLabel,
            void 0,
            // terminalExecutionId
            isTerminalRequest,
            timestamp
          );
          lastProgressLength = 0;
          ensureCancellationTracking();
        }));
      }
      if (!this._isServerManagedQueue(model.sessionResource)) {
        let dispatchingImmediateSteer = false;
        const canImmediatelyDispatch = () => {
          if (!model.getPendingRequests().some((r) => r.kind === ChatRequestQueueKind.Steering)) {
            return false;
          }
          const pending = this._pendingRequests.get(model.sessionResource);
          return !pending || this._syntheticPendingRequests.has(pending);
        };
        disposables.add(model.onDidChangePendingRequests(() => {
          if (dispatchingImmediateSteer || !canImmediatelyDispatch()) {
            return;
          }
          dispatchingImmediateSteer = true;
          queueMicrotask(() => {
            dispatchingImmediateSteer = false;
            if (this._sessionModels.get(model.sessionResource) !== model || !canImmediatelyDispatch()) {
              return;
            }
            if (this._pendingRequests.has(model.sessionResource)) {
              this._pendingRequests.deleteAndDispose(model.sessionResource);
            }
            this.processNextPendingRequest(model);
            this._pendingRequests.get(model.sessionResource)?.responseCompletePromise?.finally(() => {
              if (this._sessionModels.get(model.sessionResource) === model && !(providedSession.isCompleteObs?.get() ?? false)) {
                ensureCancellationTracking();
              }
            });
          });
        }));
      }
      disposables.add(autorun((reader) => {
        const progressArray = providedSession.progressObs?.read(reader) ?? [];
        const isComplete = providedSession.isCompleteObs?.read(reader) ?? false;
        if (!isComplete) {
          ensureCancellationTracking();
        }
        if (lastRequest && progressArray.length > lastProgressLength) {
          const newProgress = progressArray.slice(lastProgressLength);
          for (const progress of newProgress) {
            model?.acceptResponseProgress(lastRequest, progress);
          }
          lastProgressLength = progressArray.length;
        }
        if (isComplete && lastRequest) {
          this._pendingRequests.deleteAndDispose(model.sessionResource);
          cancellationListener.clear();
          completeLastResponse();
          this.processPendingRequests(model.sessionResource);
        }
      }));
    } else {
      if (providedSession.isCompleteObs?.get()) {
        completeLastResponse();
      }
      this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "notCancelable", source: "remoteSession", chatSessionId: chatSessionResourceToId(model.sessionResource) });
      if (lastRequest && model.editingSession) {
        await chatEditingSessionIsReady(model.editingSession);
        completeLastResponse();
      }
    }
    return modelRef;
  }
  async resendRequest(request, options) {
    const model = this._sessionModels.get(request.session.sessionResource);
    if (!model && model !== request.session) {
      throw new Error(`Unknown session: ${request.session.sessionResource}`);
    }
    if (model.isReadOnly.get()) {
      return;
    }
    const cts = this._pendingRequests.get(request.session.sessionResource);
    if (cts) {
      this.trace("resendRequest", `Session ${request.session.sessionResource} already has a pending request, cancelling...`);
      cts.cancel();
    }
    const location = options?.location ?? model.initialLocation;
    const attempt = options?.attempt ?? 0;
    const enableCommandDetection = !options?.noCommandDetection;
    const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind);
    model.removeRequest(request.id, ChatRequestRemovalReason.Resend);
    const resendOptions = {
      ...options,
      locationData: request.locationData,
      attachedContext: request.attachedContext
    };
    await this._sendRequestAsync(model, model.sessionResource, request.message, attempt, enableCommandDetection, defaultAgent, location, resendOptions).responseCompletePromise;
  }
  queuePendingRequest(model, sessionResource, request, options) {
    const location = options.location ?? model.initialLocation;
    const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
    const requestModel = new ChatRequestModel({
      session: model,
      message: parsedRequest,
      variableData: { variables: options.attachedContext ?? [] },
      timestamp: Date.now(),
      modeInfo: options.modeInfo,
      locationData: options.locationData,
      attachedContext: options.attachedContext,
      modelId: options.userSelectedModelId,
      userSelectedTools: options.userSelectedTools?.get(),
      isSystemInitiated: options.isSystemInitiated,
      systemInitiatedLabel: options.systemInitiatedLabel,
      terminalExecutionId: options.terminalExecutionId
    });
    const deferred = new DeferredPromise();
    this._queuedRequestDeferreds.set(requestModel.id, deferred);
    model.addPendingRequest(requestModel, options.queue ?? ChatRequestQueueKind.Queued, { ...options, queue: void 0 });
    if (options.queue === ChatRequestQueueKind.Steering) {
      this.setYieldRequested(sessionResource);
    }
    this.trace("sendRequest", `Queued message for session ${sessionResource}`);
    return { kind: "queued", deferred: deferred.p };
  }
  async sendRequest(sessionResource, request, options) {
    this.trace("sendRequest", `sessionResource: ${sessionResource.toString()}, message: ${request.substring(0, 20)}${request.length > 20 ? "[...]" : ""}}`);
    const hasExplicitFileOrImageAttachment = [...options?.attachedContext ?? [], ...options?.resolvedVariables ?? []].some(isExplicitFileOrImageVariableEntry);
    if (!request.trim() && !hasExplicitFileOrImageAttachment && !options?.slashCommand && !options?.agentId && !options?.agentIdSilent) {
      this.trace("sendRequest", "Rejected empty message");
      return { kind: "rejected", reason: "Empty message" };
    }
    let newSessionResource;
    const materializedReal = this.chatSessionService.getMaterializedSessionResource(sessionResource);
    if (materializedReal) {
      sessionResource = materializedReal;
      newSessionResource = materializedReal;
    }
    let model = this._sessionModels.get(sessionResource);
    if (!model) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    if (model.isReadOnly.get()) {
      return {
        kind: "rejected",
        reason: "Session is read-only",
        ...newSessionResource ? { newSessionResource } : {}
      };
    }
    if (!model.hasRequests && isUntitledChatSession(sessionResource) && getChatSessionType(sessionResource) !== localChatSessionType) {
      const materialized = await this._materializeUntitledSession(sessionResource, request, options, model);
      if (materialized) {
        model = materialized.model;
        sessionResource = materialized.sessionResource;
        newSessionResource = materialized.newSessionResource;
      }
    }
    if (model.isReadOnly.get()) {
      return { kind: "rejected", reason: "Session is read-only", newSessionResource };
    }
    const hasPendingRequest = this._pendingRequests.has(sessionResource);
    if (options?.queue) {
      const queued = this.queuePendingRequest(model, sessionResource, request, options);
      if (!options.pauseQueue) {
        this.processPendingRequests(sessionResource);
      }
      return queued;
    } else if (hasPendingRequest) {
      this.trace("sendRequest", `Session ${sessionResource} already has a pending request`);
      return { kind: "rejected", reason: "Request already in progress" };
    }
    const requests = model.getRequests();
    for (let i = requests.length - 1; i >= 0; i -= 1) {
      const request2 = requests[i];
      if (request2.shouldBeRemovedOnSend) {
        if (request2.shouldBeRemovedOnSend.afterUndoStop) {
          request2.response?.finalizeUndoState();
        } else {
          await this.removeRequest(sessionResource, request2.id);
        }
      }
    }
    const location = options?.location ?? model.initialLocation;
    const attempt = options?.attempt ?? 0;
    const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind);
    if (!defaultAgent) {
      this.logService.warn("sendRequest", `No default agent for location ${location}`);
      return { kind: "rejected", reason: "No default agent available" };
    }
    const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
    const silentAgent = options?.agentIdSilent ? this.chatAgentService.getAgent(options.agentIdSilent) : void 0;
    const agent = silentAgent ?? parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
    const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
    return {
      kind: "sent",
      newSessionResource,
      data: {
        ...this._sendRequestAsync(model, sessionResource, parsedRequest, attempt, !options?.noCommandDetection, silentAgent ?? defaultAgent, location, options),
        agent,
        slashCommand: agentSlashCommandPart?.command
      }
    };
  }
  /**
   * Converts an untitled contributed chat session into its real session on the
   * first send and returns the real model/resource so the caller can re-target
   * the request. Serialized per untitled resource: a first send stores an
   * in-flight promise, and a concurrent second send awaits it and converges on
   * the same real session (where the caller's pending-request check then rejects
   * the duplicate) instead of minting a second real session.
   *
   * Returns `undefined` when no conversion happened — either there is no
   * `newChatSessionItem` handler / the handler declined, or a concurrent
   * materialization failed — in which case the caller keeps using the untitled
   * session (the original behavior).
   */
  async _materializeUntitledSession(untitledResource, request, options, untitledModel) {
    const inFlight = this._inFlightUntitledMaterializations.get(untitledResource);
    if (inFlight) {
      const realResource = await inFlight;
      if (!realResource) {
        this.trace("materializeUntitledSession", `In-flight materialization of ${untitledResource.toString()} produced no real session; keeping untitled`);
        return void 0;
      }
      const realModel = this._sessionModels.get(realResource);
      if (!realModel) {
        this.info("materializeUntitledSession", `Joined in-flight materialization of ${untitledResource.toString()} but real model ${realResource.toString()} is missing; keeping untitled`);
        return void 0;
      }
      this.trace("materializeUntitledSession", `Concurrent send joined in-flight materialization ${untitledResource.toString()} -> ${realResource.toString()}`);
      return { model: realModel, sessionResource: realResource, newSessionResource: realResource };
    }
    const materialized = new DeferredPromise();
    this._inFlightUntitledMaterializations.set(untitledResource, materialized.p);
    try {
      const parsedRequest = this.parseChatRequest(untitledResource, request, options?.location ?? untitledModel.initialLocation, options);
      const commandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestSlashCommandPart);
      const requestText = getPromptText(parsedRequest).message;
      const initialSessionOptions = this.chatSessionService.getSessionOptions(untitledResource);
      const newItem = await this.chatSessionService.createNewChatSessionItem(getChatSessionType(untitledResource), { prompt: requestText, command: commandPart?.text, initialSessionOptions, untitledResource }, CancellationToken.None);
      if (!newItem) {
        materialized.complete(void 0);
        return void 0;
      }
      this.chatSessionService.registerSessionResourceAlias(untitledResource, newItem.resource);
      const tempRef = await this.loadRemoteSession(newItem.resource, untitledModel.initialLocation, CancellationToken.None);
      const realModel = tempRef?.object;
      if (!realModel) {
        throw new Error(`Failed to load session for resource: ${newItem.resource}`);
      }
      if (initialSessionOptions) {
        this.chatSessionService.updateSessionOptions(realModel.sessionResource, initialSessionOptions);
      }
      this.chatSessionService.setMaterializedSessionResource(untitledResource, newItem.resource);
      materialized.complete(newItem.resource);
      this.info("materializeUntitledSession", `Materialized untitled session ${untitledResource.toString()} into real session ${newItem.resource.toString()}`);
      return { model: realModel, sessionResource: newItem.resource, newSessionResource: newItem.resource };
    } catch (err) {
      materialized.complete(void 0);
      throw err;
    } finally {
      if (this._inFlightUntitledMaterializations.get(untitledResource) === materialized.p) {
        this._inFlightUntitledMaterializations.delete(untitledResource);
      }
    }
  }
  getAttachmentCapabilitiesForParser(chatSessionType, agent) {
    return this.chatSessionService.getCapabilitiesForSessionType(chatSessionType) ?? agent?.capabilities;
  }
  parseChatRequest(sessionResource, request, location, options) {
    let parserContext = options?.parserContext;
    let contextAgent = parserContext?.forcedAgent ?? parserContext?.selectedAgent;
    if (options?.agentId) {
      const agent = this.chatAgentService.getAgent(options.agentId);
      if (!agent) {
        throw new Error(`Unknown agent: ${options.agentId}`);
      }
      contextAgent = agent;
      parserContext = { ...parserContext, selectedAgent: agent, mode: options.modeInfo?.kind };
      const commandPart = options.slashCommand ? ` ${chatSubcommandLeader}${options.slashCommand}` : "";
      request = `${chatAgentLeader}${agent.name}${commandPart} ${request}`;
    } else if (options?.agentIdSilent && !parserContext?.forcedAgent) {
      const silentAgent = this.chatAgentService.getAgent(options.agentIdSilent);
      if (silentAgent) {
        contextAgent = silentAgent;
        parserContext = { ...parserContext, forcedAgent: silentAgent };
      }
    }
    const attachmentCapabilities = parserContext?.attachmentCapabilities ?? this.getAttachmentCapabilitiesForParser(getChatSessionType(sessionResource), contextAgent);
    if (attachmentCapabilities) {
      parserContext = { ...parserContext, attachmentCapabilities };
    }
    const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, request, location, parserContext);
    return parsedRequest;
  }
  refreshFollowupsCancellationToken(sessionResource) {
    this._sessionFollowupCancelTokens.get(sessionResource)?.cancel();
    const newTokenSource = new CancellationTokenSource();
    this._sessionFollowupCancelTokens.set(sessionResource, newTokenSource);
    return newTokenSource.token;
  }
  _sendRequestAsync(model, sessionResource, parsedRequest, attempt, enableCommandDetection, defaultAgent, location, options) {
    const followupsCancelToken = this.refreshFollowupsCancellationToken(sessionResource);
    let request;
    const agentPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart);
    const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
    const commandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestSlashCommandPart);
    const requests = [...model.getRequests()];
    const isTerminalCommand = isTerminalCommandPrompt(parsedRequest.text, this.chatSessionService.getCapabilitiesForSessionType(getChatSessionType(sessionResource))?.terminalCommandPrefix);
    const requestTelemetry = this.instantiationService.createInstance(ChatRequestTelemetry, {
      agent: agentPart?.agent ?? defaultAgent,
      agentSlashCommandPart,
      commandPart,
      sessionResource: model.sessionResource,
      location: model.initialLocation,
      options,
      enableCommandDetection
    });
    let gotProgress = false;
    const requestType = commandPart ? "slashCommand" : "string";
    const responseCreated = new DeferredPromise();
    let responseCreatedComplete = false;
    function completeResponseCreated() {
      if (!responseCreatedComplete && request?.response) {
        responseCreated.complete(request.response);
        responseCreatedComplete = true;
      }
    }
    const store = new DisposableStore();
    const source = store.add(new CancellationTokenSource());
    const token = source.token;
    const sendRequestInternal = async () => {
      const progressCallback = (progress) => {
        if (token.isCancellationRequested) {
          return;
        }
        if (!gotProgress) {
          markChat(sessionResource, ChatPerfMark.FirstToken);
        }
        gotProgress = true;
        for (let i = 0; i < progress.length; i++) {
          const isLast = i === progress.length - 1;
          const progressItem = progress[i];
          if (progressItem.kind === "markdownContent") {
            this.trace("sendRequest", `Provider returned progress for session ${model.sessionResource}, ${progressItem.content.value.length} chars`);
          } else {
            this.trace("sendRequest", `Provider returned progress: ${JSON.stringify(progressItem)}`);
          }
          if (request) {
            model.acceptResponseProgress(request, progressItem, !isLast);
          }
        }
        completeResponseCreated();
      };
      let detectedAgent;
      let detectedCommand;
      {
        const fileLoggingEnabled = this.configurationService.getValue(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
        if (!fileLoggingEnabled) {
          const isTroubleshootCommand = agentSlashCommandPart?.command.name === TROUBLESHOOT_COMMAND_NAME;
          const hasTroubleshootSkill = options?.attachedContext?.some((v) => {
            const uri = IChatRequestVariableEntry.toUri(v);
            return uri && (uri.scheme === COPILOT_SKILL_URI_SCHEME || uri.path.includes(TROUBLESHOOT_SKILL_PATH));
          });
          if (isTroubleshootCommand || hasTroubleshootSkill) {
            request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
            completeResponseCreated();
            const settingsArg = encodeURIComponent(JSON.stringify(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING));
            model.acceptResponseProgress(request, {
              kind: "markdownContent",
              content: new MarkdownString(localize(
                "agentDebugLog.troubleshootDisabled",
                "The `{0}` skill requires `{1}` to be enabled. After enabling, reload the window to apply. [Enable in Settings](command:workbench.action.openSettings?{2})",
                TROUBLESHOOT_COMMAND_NAME,
                AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING,
                settingsArg
              ), { isTrusted: { enabledCommands: ["workbench.action.openSettings"] } })
            });
            model.setResponse(request, {});
            request.response?.complete();
            store.dispose();
            return;
          }
        }
      }
      const collectHooks = async () => {
        let collectedHooks;
        let hasDisabledClaudeHooks = false;
        try {
          const hooksInfo = await this.promptsService.getHooks(token);
          if (hooksInfo) {
            collectedHooks = hooksInfo.hooks;
            hasDisabledClaudeHooks = hooksInfo.hasDisabledClaudeHooks;
          }
        } catch (error) {
          this.logService.warn("[ChatService] Failed to collect hooks:", error);
        }
        const agentName = options?.modeInfo?.modeInstructions?.name;
        if (agentName) {
          try {
            const agents = await this.promptsService.getCustomAgents(token);
            const customAgent = agents.find((a) => a.name === agentName && a.enabled);
            if (customAgent?.hooks) {
              collectedHooks = mergeHooks(collectedHooks, customAgent.hooks);
            }
          } catch (error) {
            this.logService.warn("[ChatService] Failed to collect agent hooks:", error);
          }
        }
        return { hooks: collectedHooks, hasDisabledClaudeHooks };
      };
      const collectInstructions = async () => {
        const ctx = options?.instructionContext;
        if (!ctx) {
          return [];
        }
        if (this.configurationService.getValue(ChatConfiguration.CollectInstructionsInExtension) === true) {
          return [];
        }
        markChat(sessionResource, ChatPerfMark.WillCollectInstructions);
        try {
          const variableSet = new ChatRequestVariableSet(options?.attachedContext);
          const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ctx.modeKind, ctx.enabledTools, ctx.enabledSubAgents, getChatSessionType(sessionResource));
          await computer.collect(variableSet, token);
          const originalIds = new Set((options?.attachedContext ?? []).map((v) => v.id));
          return variableSet.asArray().filter((v) => !originalIds.has(v.id));
        } catch (err) {
          this.logService.error("[ChatService] Failed to collect instructions:", err);
          return [];
        } finally {
          markChat(sessionResource, ChatPerfMark.DidCollectInstructions);
        }
      };
      const stopWatch = new StopWatch(false);
      store.add(token.onCancellationRequested(() => {
        this.trace("sendRequest", `Request for session ${model.sessionResource} was cancelled`);
        if (!request) {
          return;
        }
        requestTelemetry.complete({
          timeToFirstProgress: void 0,
          result: "cancelled",
          // Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
          totalTime: stopWatch.elapsed(),
          requestType,
          detectedAgent,
          request
        });
        model.cancelRequest(request);
      }));
      try {
        let rawResult;
        let agentOrCommandFollowups = void 0;
        if (agentPart || defaultAgent && !commandPart) {
          const initialAgent = agentPart?.agent ?? defaultAgent;
          const initialCommand = agentSlashCommandPart?.command;
          const initVariableData = { variables: [] };
          request = model.addRequest(parsedRequest, initVariableData, attempt, options?.modeInfo, initialAgent, initialCommand, options?.confirmation, options?.locationData, options?.attachedContext, void 0, options?.userSelectedModelId, options?.userSelectedTools?.get(), void 0, options?.isSystemInitiated, options?.systemInitiatedLabel, options?.terminalExecutionId, isTerminalCommand);
          const thisRequest = request;
          completeResponseCreated();
          const [hooksResult, instructionEntries] = await Promise.all([
            collectHooks(),
            collectInstructions()
          ]);
          const collectedHooks = hooksResult.hooks;
          const hasDisabledClaudeHooks = hooksResult.hasDisabledClaudeHooks;
          const allContext = this.prepareContext(request.attachedContext);
          if (instructionEntries.length > 0) {
            allContext.push(...instructionEntries);
          }
          const storedVariables = allContext.filter((v) => !(isPromptTextVariableEntry(v) && v.automaticallyAdded));
          model.updateRequest(request, { variables: storedVariables });
          let variableData = { variables: allContext };
          if (options?.resolvedVariables?.length) {
            variableData = { variables: [...variableData.variables, ...options.resolvedVariables] };
          }
          const promptTextResult = getPromptText(request.message);
          variableData = updateRanges(variableData, promptTextResult.diff);
          const message = promptTextResult.message;
          const buildAgentRequest = (agent2, command2, enableCommandDetection2, isParticipantDetected) => {
            const agentRequest = {
              sessionResource: model.sessionResource,
              requestId: thisRequest.id,
              agentId: agent2.id,
              message,
              command: command2?.name,
              variables: variableData,
              enableCommandDetection: enableCommandDetection2,
              isParticipantDetected,
              attempt,
              location,
              locationData: thisRequest.locationData,
              acceptedConfirmationData: options?.acceptedConfirmationData,
              rejectedConfirmationData: options?.rejectedConfirmationData,
              agentHostSessionConfig: options?.agentHostSessionConfig,
              userSelectedModelId: options?.userSelectedModelId,
              modelConfiguration: options?.userSelectedModelConfiguration ?? (options?.userSelectedModelId ? this.languageModelsService.getModelConfiguration(options.userSelectedModelId) : void 0),
              userSelectedTools: options?.userSelectedTools?.get(),
              modeInstructions: options?.modeInfo?.modeInstructions,
              permissionLevel: options?.modeInfo?.permissionLevel,
              editedFileEvents: thisRequest.editedFileEvents,
              hooks: collectedHooks,
              hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some((arr) => arr.length > 0),
              isVoiceModeInput: options?.isVoiceModeInput,
              isSystemInitiated: options?.isSystemInitiated,
              workingDirectory: model.workingDirectory
            };
            let isInitialTools = true;
            store.add(autorun((reader) => {
              const tools = options?.userSelectedTools?.read(reader);
              if (isInitialTools) {
                isInitialTools = false;
                return;
              }
              if (tools && request) {
                this.chatAgentService.setRequestTools(agent2.id, request.id, tools);
                agentRequest.userSelectedTools = tools;
              }
            }));
            return agentRequest;
          };
          if (this.configurationService.getValue("chat.detectParticipant.enabled") !== false && this.chatAgentService.hasChatParticipantDetectionProviders() && !agentPart && !commandPart && !agentSlashCommandPart && enableCommandDetection && location !== ChatAgentLocation.EditorInline && options?.modeInfo?.kind !== ChatModeKind.Agent && options?.modeInfo?.kind !== ChatModeKind.Edit && !options?.agentIdSilent) {
            const defaultAgentHistory = this.getHistoryEntriesFromModel(requests, location, defaultAgent.id);
            const chatAgentRequest = buildAgentRequest(defaultAgent, void 0, enableCommandDetection, false);
            const result = await this.chatAgentService.detectAgentOrCommand(chatAgentRequest, defaultAgentHistory, { location }, token);
            if (result && this.chatAgentService.getAgent(result.agent.id)?.locations?.includes(location)) {
              request?.response?.setAgent(result.agent, result.command);
              detectedAgent = result.agent;
              detectedCommand = result.command;
            }
          }
          const agent = detectedAgent ?? agentPart?.agent ?? defaultAgent;
          const command = detectedCommand ?? agentSlashCommandPart?.command;
          await this.extensionService.activateByEvent(`onChatParticipant:${agent.id}`);
          const history = this.getHistoryEntriesFromModel(requests, location, agent.id);
          const requestProps = buildAgentRequest(agent, command, enableCommandDetection, !!detectedAgent);
          this.generateInitialChatTitleIfNeeded(model, requestProps, defaultAgent, token);
          const pendingRequest = this._pendingRequests.get(sessionResource);
          if (pendingRequest) {
            store.add(autorun((reader) => {
              const yieldRequested = pendingRequest.yieldRequested.read(reader);
              if (request) {
                this.chatAgentService.setYieldRequested(agent.id, request.id, yieldRequested);
              }
            }));
            pendingRequest.requestId ??= requestProps.requestId;
            if (pendingRequest.requestId) {
              this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "sendRequestId", requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });
            }
          }
          const disabledClaudeHooksDismissedKey = "chat.disabledClaudeHooks.notification";
          if (hasDisabledClaudeHooks && !this.storageService.getBoolean(disabledClaudeHooksDismissedKey, StorageScope.WORKSPACE)) {
            this.storageService.store(disabledClaudeHooksDismissedKey, true, StorageScope.WORKSPACE, StorageTarget.USER);
            progressCallback([{ kind: "disabledClaudeHooks" }]);
          }
          if (model.canUseTools) {
            const autostartResult = new ChatMcpServersStarting(this.mcpService.autostart(token));
            if (!autostartResult.isEmpty) {
              progressCallback([autostartResult]);
              await autostartResult.wait();
            }
          }
          const agentResult = await this.chatAgentService.invokeAgent(agent.id, requestProps, progressCallback, history, token);
          rawResult = agentResult;
          agentOrCommandFollowups = this.chatAgentService.getFollowups(agent.id, requestProps, agentResult, history, followupsCancelToken);
        } else if (commandPart && this.chatSlashCommandService.hasCommand(commandPart.slashCommand.command, getChatSessionType(model.sessionResource))) {
          if (commandPart.slashCommand.silent !== true) {
            request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
            completeResponseCreated();
          }
          const history = [];
          for (const modelRequest of model.getRequests()) {
            if (!modelRequest.response) {
              continue;
            }
            history.push({ role: ChatMessageRole.User, content: [{ type: "text", value: modelRequest.message.text }] });
            history.push({ role: ChatMessageRole.Assistant, content: [{ type: "text", value: modelRequest.response.response.toString() }] });
          }
          const message = parsedRequest.text;
          const commandResult = await this.chatSlashCommandService.executeCommand(commandPart.slashCommand.command, message.substring(commandPart.slashCommand.command.length + 1).trimStart(), new Progress((p) => {
            progressCallback([p]);
          }), history, location, model.sessionResource, token, options);
          agentOrCommandFollowups = Promise.resolve(commandResult?.followUp);
          rawResult = {};
        } else {
          throw new Error(`Cannot handle request`);
        }
        if (token.isCancellationRequested && !rawResult) {
          return;
        } else if (!request) {
          shouldProcessPending = !token.isCancellationRequested;
          return;
        } else {
          if (!rawResult) {
            this.trace("sendRequest", `Provider returned no response for session ${model.sessionResource}`);
            rawResult = { errorDetails: { message: localize("emptyResponse", "Provider returned null response") } };
          }
          const result = rawResult.errorDetails?.responseIsFiltered ? "filtered" : rawResult.errorDetails && gotProgress ? "errorWithOutput" : rawResult.errorDetails ? "error" : "success";
          requestTelemetry.complete({
            timeToFirstProgress: rawResult.timings?.firstProgress,
            totalTime: rawResult.timings?.totalElapsed,
            result,
            requestType,
            detectedAgent,
            request
          });
          model.setResponse(request, rawResult);
          completeResponseCreated();
          this.trace("sendRequest", `Provider returned response for session ${model.sessionResource}`);
          if (rawResult.errorDetails?.isRateLimited) {
            this.chatEntitlementService.markAnonymousRateLimited();
          }
          shouldProcessPending = !rawResult.errorDetails && !token.isCancellationRequested && !request.response?.response.value.some((v) => v.kind === "confirmation" && !v.isUsed);
          request.response?.complete();
          if (agentOrCommandFollowups) {
            const completedRequest = request;
            agentOrCommandFollowups.then((followups) => {
              model.setFollowups(completedRequest, followups);
              const commandForTelemetry = agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command;
              this._chatServiceTelemetry.retrievedFollowups(agentPart?.agent.id ?? "", commandForTelemetry, followups?.length ?? 0);
            });
          }
        }
      } catch (err) {
        this.logService.error(`Error while handling chat request: ${toErrorMessage(err, true)}`);
        if (request) {
          requestTelemetry.complete({
            timeToFirstProgress: void 0,
            totalTime: void 0,
            result: "error",
            requestType,
            detectedAgent,
            request
          });
          const rawResult = { errorDetails: { message: err.message } };
          model.setResponse(request, rawResult);
          completeResponseCreated();
          request.response?.complete();
        }
      } finally {
        store.dispose();
      }
    };
    let shouldProcessPending = false;
    const rawResponsePromise = sendRequestInternal();
    const cancellableRequest = this.instantiationService.createInstance(CancellableRequest, source, void 0, rawResponsePromise, options);
    this._pendingRequests.set(model.sessionResource, cancellableRequest);
    this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "sendRequest", chatSessionId: chatSessionResourceToId(model.sessionResource) });
    rawResponsePromise.finally(() => {
      markChat(sessionResource, ChatPerfMark.RequestComplete);
      clearChatMarks(sessionResource);
      if (this._pendingRequests.get(model.sessionResource) === cancellableRequest) {
        this._pendingRequests.deleteAndDispose(model.sessionResource);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: "sendRequestComplete", requestId: cancellableRequest.requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
      }
      if (shouldProcessPending) {
        this.processNextPendingRequest(model);
      }
    });
    if (options?.userSelectedModelId && !options.isSystemInitiated) {
      this.languageModelsService.addToRecentlyUsedList(options.userSelectedModelId);
    }
    this._onDidSubmitRequest.fire({ chatSessionResource: model.sessionResource, message: parsedRequest });
    return {
      responseCreatedPromise: responseCreated.p,
      responseCompletePromise: rawResponsePromise
    };
  }
  processPendingRequests(sessionResource) {
    const model = this._sessionModels.get(sessionResource);
    if (model && !this._pendingRequests.has(sessionResource)) {
      this.processNextPendingRequest(model);
    }
  }
  /**
   * Returns true if the session is backed by an agent host server, which
   * controls queued-message dequeuing on the server side.
   */
  _isServerManagedQueue(sessionResource) {
    return getChatSessionType(sessionResource).startsWith("agent-host-");
  }
  /**
   * Process the next pending request from the model's queue, if any.
   * Called after a request completes to continue processing queued requests.
   * Multiple consecutive steering requests are combined into a single request.
   */
  processNextPendingRequest(model) {
    if (this._isServerManagedQueue(model.sessionResource)) {
      return;
    }
    const steeringRequests = model.dequeueAllSteeringRequests();
    const nextQueued = steeringRequests.length === 0 ? model.dequeuePendingRequest() : void 0;
    const allRequests = steeringRequests.length > 0 ? steeringRequests : nextQueued ? [nextQueued] : [];
    if (allRequests.length === 0) {
      return;
    }
    this.trace("processNextPendingRequest", `Processing ${allRequests.length} queued request(s) for session ${model.sessionResource}`);
    const deferreds = [];
    for (const req of allRequests) {
      const deferred = this._queuedRequestDeferreds.get(req.request.id);
      this._queuedRequestDeferreds.delete(req.request.id);
      if (deferred) {
        deferreds.push(deferred);
      }
    }
    const firstRequest = allRequests[0];
    const terminalIds = new Set(allRequests.map((req) => req.sendOptions.terminalExecutionId).filter((id) => !!id));
    if (terminalIds.size > 1) {
      this.info("processNextPendingRequest", `Dropping terminalExecutionId: ${terminalIds.size} conflicting terminal IDs (${[...terminalIds].join(", ")})`);
    }
    const mergedTerminalExecutionId = terminalIds.size === 1 ? [...terminalIds][0] : void 0;
    const sendOptions = {
      ...firstRequest.sendOptions,
      terminalExecutionId: mergedTerminalExecutionId,
      attachedContext: allRequests.flatMap((req) => req.request.variableData.variables.slice())
    };
    const location = sendOptions.location ?? sendOptions.locationData?.type ?? model.initialLocation;
    const defaultAgent = this.chatAgentService.getDefaultAgent(location, sendOptions.modeInfo?.kind);
    if (!defaultAgent) {
      this.logService.warn("processNextPendingRequest", `No default agent for location ${location}`);
      for (const deferred of deferreds) {
        deferred.complete({ kind: "rejected", reason: "No default agent available" });
      }
      return;
    }
    let parsedRequest;
    try {
      if (allRequests.length > 1) {
        const combinedText = allRequests.map((req) => req.request.message.text).join("\n\n");
        parsedRequest = this.parseChatRequest(model.sessionResource, combinedText, location, {
          ...sendOptions,
          agentId: void 0,
          slashCommand: void 0
        });
      } else {
        parsedRequest = firstRequest.request.message;
      }
    } catch (err) {
      this.logService.error("processNextPendingRequest: failed to parse combined chat request", err);
      const reason = toErrorMessage(err);
      for (const deferred of deferreds) {
        deferred.complete({ kind: "rejected", reason });
      }
      return;
    }
    const silentAgent = sendOptions.agentIdSilent ? this.chatAgentService.getAgent(sendOptions.agentIdSilent) : void 0;
    const agent = silentAgent ?? parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
    const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
    const responseState = this._sendRequestAsync(model, model.sessionResource, parsedRequest, firstRequest.request.attempt, !sendOptions.noCommandDetection, silentAgent ?? defaultAgent, location, sendOptions);
    const result = {
      kind: "sent",
      data: {
        ...responseState,
        agent,
        slashCommand: agentSlashCommandPart?.command
      }
    };
    for (const deferred of deferreds) {
      deferred.complete(result);
    }
  }
  generateInitialChatTitleIfNeeded(model, request, defaultAgent, token) {
    if (model.getRequests().length !== 1 || model.customTitle) {
      return;
    }
    const singleEntryHistory = [{
      request,
      response: [],
      result: {}
    }];
    const generate = async () => {
      const title = await this.chatAgentService.getChatTitle(defaultAgent.id, singleEntryHistory, token);
      if (title && !model.customTitle) {
        model.setCustomTitle(title);
      }
    };
    void generate();
  }
  prepareContext(attachedContextVariables) {
    attachedContextVariables ??= [];
    attachedContextVariables.sort((a, b) => {
      if (!a.range && !b.range) {
        return 0;
      }
      if (!a.range) {
        return 1;
      }
      if (!b.range) {
        return -1;
      }
      return b.range.start - a.range.start;
    });
    return attachedContextVariables;
  }
  getHistoryEntriesFromModel(requests, location, forAgentId) {
    const history = [];
    const agent = this.chatAgentService.getAgent(forAgentId);
    for (const request of requests) {
      if (!request.response) {
        continue;
      }
      if (forAgentId !== request.response.agent?.id && !agent?.isDefault && !agent?.canAccessPreviousChatHistory) {
        continue;
      }
      if (location === ChatAgentLocation.EditorInline) {
        continue;
      }
      const promptTextResult = getPromptText(request.message);
      const historyRequest = {
        sessionResource: request.session.sessionResource,
        requestId: request.id,
        agentId: request.response.agent?.id ?? "",
        message: promptTextResult.message,
        command: request.response.slashCommand?.name,
        variables: updateRanges(request.variableData, promptTextResult.diff),
        // TODO bit of a hack
        location: ChatAgentLocation.Chat,
        editedFileEvents: request.editedFileEvents,
        modeInstructions: request.modeInfo?.modeInstructions
      };
      history.push({ request: historyRequest, response: toChatHistoryContent(request.response.response.value), result: request.response.result ?? {} });
    }
    return history;
  }
  async removeRequest(sessionResource, requestId) {
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    const pendingRequest = this._pendingRequests.get(sessionResource);
    if (pendingRequest?.requestId === requestId) {
      pendingRequest.cancel();
      this._pendingRequests.deleteAndDispose(sessionResource);
      this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: "removeRequest", requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
    }
    model.removeRequest(requestId);
  }
  async adoptRequest(sessionResource, request) {
    if (!(request instanceof ChatRequestModel)) {
      throw new TypeError("Can only adopt requests of type ChatRequestModel");
    }
    const target = this._sessionModels.get(sessionResource);
    if (!target) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    const oldOwner = request.session;
    target.adoptRequest(request);
    if (request.response && !request.response.isComplete) {
      const cts = this._pendingRequests.deleteAndLeak(oldOwner.sessionResource);
      if (cts) {
        cts.requestId = request.id;
        this._pendingRequests.set(target.sessionResource, cts);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: "adoptRequest", requestId: request.id, chatSessionId: chatSessionResourceToId(oldOwner.sessionResource) });
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "adoptRequest", requestId: request.id, chatSessionId: chatSessionResourceToId(target.sessionResource) });
      }
    }
  }
  async addCompleteRequest(sessionResource, message, variableData, attempt, response) {
    this.trace("addCompleteRequest", `message: ${message}`);
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    const parsedRequest = typeof message === "string" ? this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, message) : message;
    const request = model.addRequest(parsedRequest, variableData || { variables: [] }, attempt ?? 0, void 0, void 0, void 0, void 0, void 0, void 0, true);
    if (typeof response.message === "string") {
      model.acceptResponseProgress(request, { content: new MarkdownString(response.message), kind: "markdownContent" });
    } else {
      for (const part of response.message) {
        model.acceptResponseProgress(request, part, true);
      }
    }
    model.setResponse(request, response.result || {});
    if (response.followups !== void 0) {
      model.setFollowups(request, response.followups);
    }
    request.response?.complete();
  }
  async cancelCurrentRequestForSession(sessionResource, source) {
    this.trace("cancelCurrentRequestForSession", `session: ${sessionResource}`);
    const pendingRequest = this._pendingRequests.get(sessionResource);
    if (!pendingRequest) {
      if (source !== "archive") {
        const model = this._sessionModels.get(sessionResource);
        const requestInProgress = model?.requestInProgress.get();
        const pendingRequestsCount = model?.getPendingRequests().length ?? 0;
        const lastRequest = model?.lastRequest;
        this.telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
          source: source ?? "chatService",
          reason: "noPendingRequest",
          requestInProgress: requestInProgress === void 0 ? "unknown" : requestInProgress ? "true" : "false",
          pendingRequests: pendingRequestsCount,
          sessionScheme: sessionResource.scheme,
          lastRequestId: lastRequest?.id,
          chatSessionId: chatSessionResourceToId(sessionResource)
        });
        this.info("cancelCurrentRequestForSession", `No pending request was found for session ${sessionResource}. requestInProgress=${requestInProgress ?? "unknown"}, pendingRequests=${pendingRequestsCount}`);
      }
      return;
    }
    const responseCompletePromise = pendingRequest.responseCompletePromise;
    pendingRequest.cancel();
    this._pendingRequests.deleteAndDispose(sessionResource);
    this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: source ?? "cancelRequest", requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });
    if (responseCompletePromise) {
      await raceTimeout(responseCompletePromise, 1e3);
    }
  }
  setYieldRequested(sessionResource) {
    const pendingRequest = this._pendingRequests.get(sessionResource);
    if (pendingRequest) {
      pendingRequest.setYieldRequested();
    }
  }
  migrateRequests(originalResource, targetResource) {
    const model = this._sessionModels.get(originalResource);
    if (!model) {
      return;
    }
    const pendingRequests = [...model.getPendingRequests()];
    if (pendingRequests.length === 0) {
      return;
    }
    for (const pending of pendingRequests) {
      this.removePendingRequest(originalResource, pending.request.id);
    }
    for (const pending of pendingRequests) {
      void this.sendRequest(targetResource, pending.request.message.text, {
        ...pending.sendOptions,
        queue: pending.kind
      });
    }
  }
  removePendingRequest(sessionResource, requestId) {
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.removePendingRequest(requestId);
      const hasSteeringRequests = model.getPendingRequests().some((r) => r.kind === ChatRequestQueueKind.Steering);
      if (!hasSteeringRequests) {
        const pendingRequest = this._pendingRequests.get(sessionResource);
        pendingRequest?.resetYieldRequested();
      }
    }
    const deferred = this._queuedRequestDeferreds.get(requestId);
    if (deferred) {
      deferred.complete({ kind: "rejected", reason: "Request was removed from queue" });
      this._queuedRequestDeferreds.delete(requestId);
    }
  }
  setPendingRequests(sessionResource, requests) {
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.setPendingRequests(requests);
    }
  }
  syncPendingRequestsFromRemote(sessionResource, requests) {
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      return;
    }
    const existing = model.getPendingRequests();
    const existingById = new Map(existing.map((request) => [request.request.id, request]));
    const reconciled = requests.map((remote) => {
      const variableData = remote.variableData ?? { variables: [] };
      const local = existingById.get(remote.id);
      if (local && local.request.message.text === remote.message && equals(local.request.variableData, variableData)) {
        return local.kind === remote.kind ? local : { ...local, kind: remote.kind };
      }
      const parsedRequest = this.parseChatRequest(sessionResource, remote.message, model.initialLocation, void 0);
      const requestModel = new ChatRequestModel({
        session: model,
        message: parsedRequest,
        variableData,
        timestamp: remote.timestamp,
        attachedContext: variableData.variables.slice(),
        restoredId: remote.id
      });
      return { request: requestModel, kind: remote.kind, sendOptions: local?.sendOptions ?? {} };
    });
    if (existing.length === reconciled.length && reconciled.every((request, index) => existing[index] === request)) {
      return;
    }
    const reconciledIds = new Set(reconciled.map((request) => request.request.id));
    model.replacePendingRequests(reconciled);
    for (const local of existing) {
      if (reconciledIds.has(local.request.id)) {
        continue;
      }
      const deferred = this._queuedRequestDeferreds.get(local.request.id);
      if (deferred) {
        deferred.complete({ kind: "rejected", reason: "Request was removed from queue" });
        this._queuedRequestDeferreds.delete(local.request.id);
      }
    }
    if (!reconciled.some((request) => request.kind === ChatRequestQueueKind.Steering)) {
      this._pendingRequests.get(sessionResource)?.resetYieldRequested();
    }
  }
  async sendPendingRequestImmediately(sessionResource, requestId) {
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      return;
    }
    const pendingRequests = model.getPendingRequests();
    const target = pendingRequests.find((r) => r.request.id === requestId);
    if (!target) {
      return;
    }
    if (this._isServerManagedQueue(sessionResource)) {
      const message = target.request.message.text;
      const attachedContext = target.request.variableData.variables.slice();
      const sendOptions = {
        ...target.sendOptions,
        queue: void 0,
        attachedContext
      };
      this.removePendingRequest(sessionResource, requestId);
      await this.cancelCurrentRequestForSession(sessionResource, "queueRunNext");
      let result;
      try {
        result = await this.sendRequest(sessionResource, message, sendOptions);
      } catch (err) {
        this.logService.error("sendPendingRequestImmediately: re-send failed", err);
      }
      if (!result || result.kind === "rejected") {
        this.info("sendPendingRequestImmediately", `Re-send was not accepted (${result?.kind ?? "error"}); restoring pending message to the queue`);
        await this.sendRequest(sessionResource, message, { ...sendOptions, attachedContext, queue: target.kind });
      }
      return;
    }
    const reordered = [
      { requestId: target.request.id, kind: target.kind },
      ...pendingRequests.filter((r) => r.request.id !== requestId).map((r) => ({ requestId: r.request.id, kind: r.kind }))
    ];
    this.setPendingRequests(sessionResource, reordered);
    await this.cancelCurrentRequestForSession(sessionResource, "queueRunNext");
    this.processPendingRequests(sessionResource);
  }
  hasSessions() {
    return this._chatSessionStore.hasSessions();
  }
  async transferChatSession(transferredSessionResource, toWorkspace) {
    if (!LocalChatSessionUri.isLocalSession(transferredSessionResource)) {
      throw new Error(`Can only transfer local chat sessions. Invalid session: ${transferredSessionResource}`);
    }
    const model = this._sessionModels.get(transferredSessionResource);
    if (!model) {
      throw new Error(`Failed to transfer session. Unknown session: ${transferredSessionResource}`);
    }
    if (model.initialLocation !== ChatAgentLocation.Chat) {
      throw new Error(`Can only transfer chat sessions located in the Chat view. Session ${transferredSessionResource} has location=${model.initialLocation}`);
    }
    await this._chatSessionStore.storeTransferSession({
      sessionResource: model.sessionResource,
      timestampInMilliseconds: Date.now(),
      toWorkspace
    }, model);
    this.chatTransferService.addWorkspaceToTransferred(toWorkspace);
    this.trace("transferChatSession", `Transferred session ${model.sessionResource} to workspace ${toWorkspace.toString()}`);
  }
  getChatStorageFolder() {
    return this._chatSessionStore.getChatStorageFolder();
  }
  logChatIndex() {
    this._chatSessionStore.logIndex();
  }
  setSessionTitle(sessionResource, title) {
    this._sessionModels.get(sessionResource)?.setCustomTitle(title);
  }
  appendProgress(request, progress) {
    const model = this._sessionModels.get(request.session.sessionResource);
    if (!(request instanceof ChatRequestModel)) {
      throw new BugIndicatingError("Can only append progress to requests of type ChatRequestModel");
    }
    model?.acceptResponseProgress(request, progress);
  }
  toLocalSessionId(sessionResource) {
    const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (!localSessionId) {
      throw new Error(`Invalid local chat session resource: ${sessionResource}`);
    }
    return localSessionId;
  }
};
ChatService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IChatSlashCommandService),
  __decorateParam(7, IChatAgentService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IChatTransferService),
  __decorateParam(10, IChatSessionsService),
  __decorateParam(11, IMcpService),
  __decorateParam(12, IPromptsService),
  __decorateParam(13, IChatEntitlementService),
  __decorateParam(14, ILanguageModelsService),
  __decorateParam(15, IChatDebugService)
], ChatService);
async function chatModelToChatDetail(model) {
  const title = model.title || localize("newChat", "New Chat");
  return {
    sessionResource: model.sessionResource,
    title,
    lastMessageDate: model.lastMessageDate,
    timing: model.timing,
    isActive: true,
    stats: await awaitStatsForSession(model),
    lastResponseState: model.lastRequest?.response?.state ?? ResponseModelState.Pending,
    workingDirectory: model.workingDirectory
  };
}
export {
  ChatService,
  backfillRestoredPickerState,
  backfillTransferredModel,
  chatModelToChatDetail
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcmFjZUNhbmNlbGxhdGlvbkVycm9yLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlUmVzb3VyY2VNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBhd2FpdFN0YXRzRm9yU2Vzc2lvbiB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFBlcmZNYXJrLCBjbGVhckNoYXRNYXJrcywgbWFya0NoYXQgfSBmcm9tICcuLi9jaGF0UGVyZi5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcywgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5LCBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBjaGF0RWRpdGluZ1Nlc3Npb25Jc1JlYWR5IH0gZnJvbSAnLi4vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsLCBDaGF0UmVxdWVzdE1vZGVsLCBDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24sIElDaGF0TW9kZWwsIElDaGF0UGVuZGluZ1JlcXVlc3QsIElDaGF0UmVxdWVzdE1vZGVsLCBJQ2hhdFJlcXVlc3RNb2RlSW5mbywgSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhLCBJQ2hhdFJlc3BvbnNlTW9kZWwsIElFeHBvcnRhYmxlQ2hhdERhdGEsIElTZXJpYWxpemFibGVDaGF0RGF0YSwgSVNlcmlhbGl6YWJsZUNoYXREYXRhSW4sIElTZXJpYWxpemFibGVDaGF0c0RhdGEsIElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UsIG5vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhLCB0b0NoYXRIaXN0b3J5Q29udGVudCwgdXBkYXRlUmFuZ2VzLCBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSwgbG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCB9IGZyb20gJy4uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWxTdG9yZSwgSVN0YXJ0U2Vzc2lvblByb3BzIH0gZnJvbSAnLi4vbW9kZWwvY2hhdE1vZGVsU3RvcmUuanMnO1xuaW1wb3J0IHsgY2hhdEFnZW50TGVhZGVyLCBDaGF0UmVxdWVzdEFnZW50UGFydCwgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0LCBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQsIENoYXRSZXF1ZXN0VGV4dFBhcnQsIGNoYXRTdWJjb21tYW5kTGVhZGVyLCBnZXRQcm9tcHRUZXh0LCBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFBhcnNlciB9IGZyb20gJy4uL3JlcXVlc3RQYXJzZXIvY2hhdFJlcXVlc3RQYXJzZXIuanMnO1xuaW1wb3J0IHsgQ2hhdE1jcFNlcnZlcnNTdGFydGluZywgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24sIENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudE5hbWUsIENoYXRSZXF1ZXN0UXVldWVLaW5kLCBDaGF0U2VuZFJlc3VsdCwgQ2hhdFNlbmRSZXN1bHRRdWV1ZWQsIENoYXRTZW5kUmVzdWx0U2VudCwgQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wQ2xhc3NpZmljYXRpb24sIENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcEV2ZW50LCBDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudE5hbWUsIElDaGF0Q29tcGxldGVSZXNwb25zZSwgSUNoYXREZXRhaWwsIElDaGF0Rm9sbG93dXAsIElDaGF0TW9kZWxSZWZlcmVuY2UsIElDaGF0UHJvZ3Jlc3MsIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgSUNoYXRTZW5kUmVxdWVzdFJlc3BvbnNlU3RhdGUsIElDaGF0U2VydmljZSwgSUNoYXRTZXNzaW9uU3RhcnRPcHRpb25zLCBJQ2hhdFVzZXJBY3Rpb25FdmVudCwgSVJlbW90ZVBlbmRpbmdSZXF1ZXN0LCBSZXNwb25zZU1vZGVsU3RhdGUgfSBmcm9tICcuL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0VGVsZW1ldHJ5LCBDaGF0U2VydmljZVRlbGVtZXRyeSB9IGZyb20gJy4vY2hhdFNlcnZpY2VUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGlzQWdlbnRIb3N0VGFyZ2V0LCBpc1Rlcm1pbmFsQ29tbWFuZFByb21wdCwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uU3RvcmUsIElDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGEgfSBmcm9tICcuLi9tb2RlbC9jaGF0U2Vzc2lvblN0b3JlLmpzJztcbmltcG9ydCB7IElDaGF0U2xhc2hDb21tYW5kU2VydmljZSB9IGZyb20gJy4uL3BhcnRpY2lwYW50cy9jaGF0U2xhc2hDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRyYW5zZmVyU2VydmljZSB9IGZyb20gJy4uL21vZGVsL2NoYXRUcmFuc2ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQsIGdldENoYXRTZXNzaW9uVHlwZSwgaXNVbnRpdGxlZENoYXRTZXNzaW9uLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0LCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5LCBpc1Byb21wdFRleHRWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJRHluYW1pY1ZhcmlhYmxlIH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TWVzc2FnZVJvbGUsIElDaGF0TWVzc2FnZSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgfSBmcm9tICcuLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uT3BlcmF0aW9uTG9nIH0gZnJvbSAnLi4vbW9kZWwvY2hhdFNlc3Npb25PcGVyYXRpb25Mb2cuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcsIFRST1VCTEVTSE9PVF9DT01NQU5EX05BTUUsIFRST1VCTEVTSE9PVF9TS0lMTF9QQVRILCBDT1BJTE9UX1NLSUxMX1VSSV9TQ0hFTUUgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcywgbWVyZ2VIb29rcyB9IGZyb20gJy4uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IENvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvY29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi9jaGF0TW9kZXMuanMnO1xuXG5jb25zdCBzZXJpYWxpemVkQ2hhdEtleSA9ICdpbnRlcmFjdGl2ZS5zZXNzaW9ucyc7XG5cbi8qKlxuICogVHJ1ZSB3aGVuIHRoZSB1c2VyIGhhcyB0eXBlZCB0ZXh0IG9yIGF0dGFjaGVkIG5vbi10cml2aWFsIGNvbnRleHQgdG8gdGhlIGlucHV0XG4gKiBidXQgbm90IHlldCBzZW50IGl0LiBVc2VkIHRvIGRlY2lkZSB3aGV0aGVyIGFuIGV4dGVybmFsIHNlc3Npb24gbmVlZHMgbWV0YWRhdGFcbiAqIHBlcnNpc3RlZCBvbiBkaXNwb3NlIHNvIHRoZSBkcmFmdCBzdXJ2aXZlcyBzd2l0Y2hpbmcgc2Vzc2lvbnMuXG4gKi9cbmZ1bmN0aW9uIGhhc0RyYWZ0SW5wdXQobW9kZWw6IENoYXRNb2RlbCk6IGJvb2xlYW4ge1xuXHRjb25zdCBzdGF0ZSA9IG1vZGVsLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCk7XG5cdGlmICghc3RhdGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHN0YXRlLmlucHV0VGV4dC50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBzdGF0ZS5hdHRhY2htZW50cy5sZW5ndGggPiAwO1xufVxuXG5jbGFzcyBDYW5jZWxsYWJsZVJlcXVlc3QgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3lpZWxkUmVxdWVzdGVkOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHRnZXQgeWllbGRSZXF1ZXN0ZWQoKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl95aWVsZFJlcXVlc3RlZDtcblx0fVxuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSxcblx0XHRwdWJsaWMgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZVxuXHQpIHsgfVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0aWYgKHRoaXMucmVxdWVzdElkKSB7XG5cdFx0XHR0aGlzLnRvb2xzU2VydmljZS5jYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0KHRoaXMucmVxdWVzdElkKTtcblx0XHR9XG5cdFx0dGhpcy5jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRjYW5jZWwoKSB7XG5cdFx0aWYgKHRoaXMucmVxdWVzdElkKSB7XG5cdFx0XHR0aGlzLnRvb2xzU2VydmljZS5jYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0KHRoaXMucmVxdWVzdElkKTtcblx0XHR9XG5cblx0XHR0aGlzLmNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHR9XG5cblx0c2V0WWllbGRSZXF1ZXN0ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5feWllbGRSZXF1ZXN0ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZXNldFlpZWxkUmVxdWVzdGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX3lpZWxkUmVxdWVzdGVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5jb25zdCBFTVBUWV9SRUZFUkVOQ0VTOiBSZWFkb25seUFycmF5PElEeW5hbWljVmFyaWFibGU+ID0gT2JqZWN0LmZyZWV6ZShbXSk7XG5jb25zdCBFTVBUWV9UT09MX0VOQUJMRU1FTlRfTUFQOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW10pO1xuXG4vKipcbiAqIFByZXNlcnZlIHRoZSBwaWNrZXIgc3RhdGUgZnJvbSBgc3RhdGVUb0FwcGx5YCwgb25seSByZWNvdmVyaW5nIGEgY3VzdG9tIGFnZW50IG1vZGUgZnJvbVxuICogYHNhdmVkU3RhdGVgIHdoZW4gdGhlIGFwcGxpZWQgc3RhdGUgZmVsbCBiYWNrIHRvIHRoZSBkZWZhdWx0IEFnZW50LlxuICpcbiAqIGBzdGF0ZVRvQXBwbHlgIGlzIHRoZSBpbnB1dCBzdGF0ZSBhYm91dCB0byBiZSBhcHBsaWVkIHRvIHRoZSBzZXNzaW9uIGJlaW5nIHJlc3RvcmVkIChhblxuICogYWdlbnQtaG9zdCB0cmFuc2ZlcnJlZCBkcmFmdCwgb3IgdGhlIHNhdmVkIGRyYWZ0IGFzIGEgZmFsbGJhY2spLiBJdHMgYHNlbGVjdGVkTW9kZWxgIGlzIHRoZVxuICogYXV0aG9yaXRhdGl2ZSBtb2RlbCBzZWxlY3Rpb24uXG4gKiBgc2F2ZWRTdGF0ZWAgaXMgb25seSB1c2VkIGZvciBgbW9kZWA6IHByZWZlciBpdHMgY3VzdG9tIGFnZW50IG92ZXIgdGhlIHBsYWluIGRlZmF1bHQgQWdlbnQsIGJ1dFxuICogbmV2ZXIgb3ZlcnJpZGUgYSBkaWZmZXJlbnQgZXhwbGljaXQgbW9kZSBhbHJlYWR5IHByZXNlbnQgaW4gYHN0YXRlVG9BcHBseWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYWNrZmlsbFJlc3RvcmVkUGlja2VyU3RhdGUoXG5cdHN0YXRlVG9BcHBseTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQsXG5cdHNhdmVkU3RhdGU6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkLFxuXHRkZWZhdWx0QWdlbnRNb2RlSWQ6IHN0cmluZyxcbik6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzdGF0ZVRvQXBwbHkgfHwgIXNhdmVkU3RhdGUpIHtcblx0XHRyZXR1cm4gc3RhdGVUb0FwcGx5O1xuXHR9XG5cdGNvbnN0IG1vZGUgPSAoc3RhdGVUb0FwcGx5Lm1vZGUuaWQgPT09IGRlZmF1bHRBZ2VudE1vZGVJZCAmJiBzYXZlZFN0YXRlLm1vZGUuaWQgIT09IGRlZmF1bHRBZ2VudE1vZGVJZClcblx0XHQ/IHNhdmVkU3RhdGUubW9kZVxuXHRcdDogc3RhdGVUb0FwcGx5Lm1vZGU7XG5cdGlmIChtb2RlID09PSBzdGF0ZVRvQXBwbHkubW9kZSkge1xuXHRcdHJldHVybiBzdGF0ZVRvQXBwbHk7XG5cdH1cblx0cmV0dXJuIHsgLi4uc3RhdGVUb0FwcGx5LCBtb2RlIH07XG59XG5cbi8qKlxuICogUmVjb3ZlciB0aGUgc2VsZWN0ZWQgbW9kZWwgb24gYSB0cmFuc2ZlcnJlZCBpbnB1dCBzdGF0ZSB3aGVuIGl0IHdhcyBkcm9wcGVkIGR1cmluZyBhIGNvbGRcbiAqIGhhbmRvZmYuXG4gKlxuICogQXQgY29sZCByZXN0b3JlIGFuIGFnZW50LWhvc3QgdHJhbnNmZXJyZWQgZHJhZnQgY2FuIGFycml2ZSB3aXRob3V0IGl0cyBgc2VsZWN0ZWRNb2RlbGAgKHRoZSBsaXZlXG4gKiBtb2RlbCBsaXN0IGlzIG5vdCBsb2FkZWQgeWV0LCBzbyB0aGUgbW9kZWwgcmVzb2x2ZWQgdG8gYHVuZGVmaW5lZGApLiBGYWxsIGJhY2sgdG8gdGhlIG1vZGVsXG4gKiBkZXJpdmVkIGZyb20gdGhlIHNlc3Npb24ncyByZXF1ZXN0IGhpc3Rvcnkgc28gdGhlIHBpY2tlciByZXN0b3JlcyB0aGUgbGFzdC11c2VkIG1vZGVsIGluc3RlYWQgb2ZcbiAqIEF1dG8uIFRoZSBoaXN0b3J5LWRlcml2ZWQgbW9kZWwgY2FycmllcyBmdWxsIG1ldGFkYXRhIChpbmNsdWRpbmcgYHRhcmdldENoYXRTZXNzaW9uVHlwZWApLCBzbyB0aGVcbiAqIGlucHV0IHBhcnQgY2FuIHdhaXQgZm9yIHRoZSBtb2RlbCBwb29sIGFuZCBhcHBseSBpdCBvbmNlIGl0IGxvYWRzLiBBbiBleHBsaWNpdCBtb2RlbCBhbHJlYWR5XG4gKiBwcmVzZW50IG9uIGB0cmFuc2ZlcnJlZFN0YXRlYCBpcyBuZXZlciBvdmVycmlkZGVuLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYmFja2ZpbGxUcmFuc2ZlcnJlZE1vZGVsKFxuXHR0cmFuc2ZlcnJlZFN0YXRlOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCxcblx0aGlzdG9yeU1vZGVsOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZVsnc2VsZWN0ZWRNb2RlbCddLFxuKTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRpZiAoIXRyYW5zZmVycmVkU3RhdGUgfHwgdHJhbnNmZXJyZWRTdGF0ZS5zZWxlY3RlZE1vZGVsIHx8ICFoaXN0b3J5TW9kZWwpIHtcblx0XHRyZXR1cm4gdHJhbnNmZXJyZWRTdGF0ZTtcblx0fVxuXHRyZXR1cm4geyAuLi50cmFuc2ZlcnJlZFN0YXRlLCBzZWxlY3RlZE1vZGVsOiBoaXN0b3J5TW9kZWwgfTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U2VydmljZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Nb2RlbHM6IENoYXRNb2RlbFN0b3JlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmVxdWVzdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwPENhbmNlbGxhYmxlUmVxdWVzdD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXVlZFJlcXVlc3REZWZlcnJlZHMgPSBuZXcgTWFwPHN0cmluZywgRGVmZXJyZWRQcm9taXNlPENoYXRTZW5kUmVzdWx0Pj4oKTtcblx0LyoqIFBlbmRpbmcgcmVxdWVzdHMgdGhhdCBhcmUgc3ludGhldGljIHN0cmVhbWVkLXR1cm4gdHJhY2tlcnMgKG5vdCByZWFsIGluLWZsaWdodCByZXF1ZXN0cykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N5bnRoZXRpY1BlbmRpbmdSZXF1ZXN0cyA9IG5ldyBXZWFrU2V0PENhbmNlbGxhYmxlUmVxdWVzdD4oKTtcblxuXHQvKipcblx0ICogSW4tZmxpZ2h0IHVudGl0bGVkXHUyMTkycmVhbCBtYXRlcmlhbGl6YXRpb25zLCBrZXllZCBieSB0aGUgb3JpZ2luYWwgdW50aXRsZWRcblx0ICogY2hhdCBzZXNzaW9uIHJlc291cmNlLiBBIGZpcnN0IHNlbmQgdG8gYW4gdW50aXRsZWQgY29udHJpYnV0ZWQgc2Vzc2lvblxuXHQgKiBzdG9yZXMgdGhlIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3bHkgbWludGVkIHJlYWwgcmVzb3VyY2UgKG9yXG5cdCAqIGB1bmRlZmluZWRgIG9uIGZhaWx1cmUpLiBBIGNvbmN1cnJlbnQgc2Vjb25kIHNlbmQgZm9yIHRoZSBzYW1lIHVudGl0bGVkXG5cdCAqIHJlc291cmNlIGF3YWl0cyB0aGlzIGluc3RlYWQgb2YgbWF0ZXJpYWxpemluZyBhIHNlY29uZCByZWFsIHNlc3Npb24uXG5cdCAqXG5cdCAqIFRoZSBjb21taXR0ZWQgKHNldHRsZWQpIHVudGl0bGVkXHUyMTkycmVhbCBtYXBwaW5nIGlzIG93bmVkIGJ5XG5cdCAqIHtAbGluayBJQ2hhdFNlc3Npb25zU2VydmljZX0gKHB1Ymxpc2hlZCB2aWEgYHNldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZWBcblx0ICogYW5kIHJlYWQgdmlhIGBnZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2VgKTsgdGhpcyBtYXAgb25seSB0cmFja3MgdGhlXG5cdCAqIHRyYW5zaWVudCBpbi1mbGlnaHQgc2VyaWFsaXphdGlvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luRmxpZ2h0VW50aXRsZWRNYXRlcmlhbGl6YXRpb25zID0gbmV3IFJlc291cmNlTWFwPFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPj4oKTtcblx0cHJpdmF0ZSBfc2F2ZU1vZGVsc0VuYWJsZWQgPSB0cnVlO1xuXG5cdHByaXZhdGUgX3RyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgdHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN1Ym1pdFJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IHRoaXMuX29uRGlkU3VibWl0UmVxdWVzdC5ldmVudDtcblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ3JlYXRlTW9kZWwoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxzLm9uRGlkQ3JlYXRlTW9kZWw7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFBlcmZvcm1Vc2VyQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRVc2VyQWN0aW9uRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRQZXJmb3JtVXNlckFjdGlvbjogRXZlbnQ8SUNoYXRVc2VyQWN0aW9uRXZlbnQ+ID0gdGhpcy5fb25EaWRQZXJmb3JtVXNlckFjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZXF1ZXN0SWQ6IHN0cmluZzsgcmVzb2x2ZUlkOiBzdHJpbmc7IGFuc3dlcnM6IElDaGF0UXVlc3Rpb25BbnN3ZXJzIHwgdW5kZWZpbmVkIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlciA9IHRoaXMuX29uRGlkUmVjZWl2ZVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgc2Vzc2lvblJlc291cmNlczogVVJJW107IHJlYXNvbjogJ2NsZWFyZWQnIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWREaXNwb3NlU2Vzc2lvbiA9IHRoaXMuX29uRGlkRGlzcG9zZVNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkZvbGxvd3VwQ2FuY2VsVG9rZW5zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNvdXJjZU1hcDxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlVGVsZW1ldHJ5OiBDaGF0U2VydmljZVRlbGVtZXRyeTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25TdG9yZTogQ2hhdFNlc3Npb25TdG9yZTtcblxuXHRyZWFkb25seSByZXF1ZXN0SW5Qcm9ncmVzc09iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cmVhZG9ubHkgY2hhdE1vZGVsczogSU9ic2VydmFibGU8SXRlcmFibGU8SUNoYXRNb2RlbD4+O1xuXG5cdC8qKlxuXHQgKiBGb3IgdGVzdCB1c2Ugb25seVxuXHQgKi9cblx0c2V0U2F2ZU1vZGVsc0VuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3NhdmVNb2RlbHNFbmFibGVkID0gZW5hYmxlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3IgdGVzdCB1c2Ugb25seVxuXHQgKi9cblx0d2FpdEZvck1vZGVsRGlzcG9zYWxzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxzLndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaXNFbXB0eVdpbmRvdygpOiBib29sZWFuIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdHJldHVybiAhd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gJiYgd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDaGF0U2xhc2hDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlOiBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0VHJhbnNmZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFRyYW5zZmVyU2VydmljZTogSUNoYXRUcmFuc2ZlclNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25TZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASVByb21wdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3Nlc3Npb25Nb2RlbHMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWxTdG9yZSwge1xuXHRcdFx0Y3JlYXRlTW9kZWw6IChwcm9wczogSVN0YXJ0U2Vzc2lvblByb3BzKSA9PiB0aGlzLl9zdGFydFNlc3Npb24ocHJvcHMpLFxuXHRcdFx0d2lsbERpc3Bvc2VNb2RlbDogYXN5bmMgKG1vZGVsOiBDaGF0TW9kZWwpID0+IHtcblx0XHRcdFx0Y29uc3QgbG9jYWxTZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQobW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKGxvY2FsU2Vzc2lvbklkICYmIHRoaXMuc2hvdWxkU3RvcmVTZXNzaW9uKG1vZGVsKSkge1xuXHRcdFx0XHRcdC8vIEFsd2F5cyBwcmVzZXJ2ZSBzZXNzaW9ucyB0aGF0IGhhdmUgY3VzdG9tIHRpdGxlcywgZXZlbiBpZiBlbXB0eVxuXHRcdFx0XHRcdGlmIChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCA9PT0gMCAmJiAhbW9kZWwuY3VzdG9tVGl0bGUpIHtcblx0XHRcdFx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwobW9kZWwuaW5wdXRNb2RlbCwgYGRpc3Bvc2luZyBzZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfSAoJHtsb2NhbFNlc3Npb25JZH0pIHdpdGhvdXQgdGl0bGUsIGRlbGV0aW5nIGZyb20gc3RvcmFnZWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5kZWxldGVTZXNzaW9uKGxvY2FsU2Vzc2lvbklkKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3NhdmVNb2RlbHNFbmFibGVkKSB7XG5cdFx0XHRcdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKG1vZGVsLmlucHV0TW9kZWwsIGBkaXNwb3Npbmcgc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX0gKCR7bG9jYWxTZXNzaW9uSWR9KSB3aXRoIHRpdGxlLCBzdG9yaW5nIHRvIHN0b3JhZ2VgLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuc3RvcmVTZXNzaW9ucyhbbW9kZWxdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWxvY2FsU2Vzc2lvbklkICYmIChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCA+IDAgfHwgaGFzRHJhZnRJbnB1dChtb2RlbCkpKSB7XG5cdFx0XHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbChtb2RlbC5pbnB1dE1vZGVsLCBgZGlzcG9zaW5nIGV4dGVybmFsIHNlc3Npb24gJHttb2RlbC5zZXNzaW9uUmVzb3VyY2V9IHdpdGggcmVxdWVzdHMgb3IgZHJhZnQgaW5wdXQsIHN0b3JpbmcgbWV0YWRhdGEgdG8gc3RvcmFnZWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdC8vIEV4dGVybmFsIHNlc3Npb25zOiBwZXJzaXN0IG1ldGFkYXRhIHdoZW4gdGhlcmUgYXJlIHJlcXVlc3RzLCBPUiB3aGVuIHRoZVxuXHRcdFx0XHRcdC8vIHVzZXIgaGFzIHR5cGVkL2F0dGFjaGVkIHVuc2VudCBpbnB1dCB3ZSBuZWVkIHRvIHJlc3RvcmUgb24gbmV4dCBvcGVuLlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuc3RvcmVTZXNzaW9uc01ldGFkYXRhT25seShbbW9kZWxdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uTW9kZWxzLm9uRGlkRGlzcG9zZU1vZGVsKG1vZGVsID0+IHtcblx0XHRcdGNsZWFyQ2hhdE1hcmtzKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZW5kU2Vzc2lvbihtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkZvbGxvd3VwQ2FuY2VsVG9rZW5zLmdldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpPy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25Gb2xsb3d1cENhbmNlbFRva2Vucy5kZWxldGVBbmREaXNwb3NlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHQvLyBEcm9wIHRoZSBmb3J3YXJkIHVudGl0bGVkXHUyMTkycmVhbCBtYXBwaW5nIGZvciB0aGlzIHNlc3Npb24gc28gaXQgc3RvcHNcblx0XHRcdC8vIHJlLXRhcmdldGluZyBsYXRlIHNlbmRzLiBUaGUgaW52ZXJzZSBhbGlhcyBpcyBpbnRlbnRpb25hbGx5IHJldGFpbmVkLlxuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvblNlcnZpY2UuY2xlYXJNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UobW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHRoaXMuX29uRGlkRGlzcG9zZVNlc3Npb24uZmlyZSh7IHNlc3Npb25SZXNvdXJjZXM6IFttb2RlbC5zZXNzaW9uUmVzb3VyY2VdLCByZWFzb246ICdjbGVhcmVkJyB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jaGF0U2VydmljZVRlbGVtZXRyeSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlcnZpY2VUZWxlbWV0cnkpO1xuXHRcdHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uU3RvcmUpKTtcblx0XHR0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLm1pZ3JhdGVEYXRhSWZOZWVkZWQoKCkgPT4gdGhpcy5taWdyYXRlRGF0YSgpKTtcblxuXHRcdGNvbnN0IHRyYW5zZmVycmVkRGF0YSA9IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdGlmICh0cmFuc2ZlcnJlZERhdGEpIHtcblx0XHRcdHRoaXMudHJhY2UoJ2NvbnN0cnVjdG9yJywgYFRyYW5zZmVycmVkIHNlc3Npb24gJHt0cmFuc2ZlcnJlZERhdGF9YCk7XG5cdFx0XHR0aGlzLl90cmFuc2ZlcnJlZFNlc3Npb25SZXNvdXJjZSA9IHRyYW5zZmVycmVkRGF0YTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4gdGhpcy5zYXZlU3RhdGUoKSkpO1xuXG5cdFx0dGhpcy5jaGF0TW9kZWxzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gWy4uLnRoaXMuX3Nlc3Npb25Nb2RlbHMub2JzZXJ2YWJsZS5yZWFkKHJlYWRlcikudmFsdWVzKCldKTtcblxuXHRcdHRoaXMucmVxdWVzdEluUHJvZ3Jlc3NPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLm9ic2VydmFibGUucmVhZChyZWFkZXIpLnZhbHVlcygpO1xuXHRcdFx0cmV0dXJuIEl0ZXJhYmxlLnNvbWUobW9kZWxzLCBtb2RlbCA9PiBtb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5yZWFkKHJlYWRlcikpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBlZGl0aW5nU2Vzc2lvbnMoKSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9uTW9kZWxzLnZhbHVlcygpXS5tYXAodiA9PiB2LmVkaXRpbmdTZXNzaW9uKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0fVxuXG5cdGlzRW5hYmxlZChsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldENvbnRyaWJ1dGVkRGVmYXVsdEFnZW50KGxvY2F0aW9uKSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBtaWdyYXRlRGF0YSgpOiBJU2VyaWFsaXphYmxlQ2hhdHNEYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uRGF0YSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHNlcmlhbGl6ZWRDaGF0S2V5LCB0aGlzLmlzRW1wdHlXaW5kb3cgPyBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04gOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAnJyk7XG5cdFx0aWYgKHNlc3Npb25EYXRhKSB7XG5cdFx0XHRjb25zdCBwZXJzaXN0ZWRTZXNzaW9ucyA9IHRoaXMuZGVzZXJpYWxpemVDaGF0cyhzZXNzaW9uRGF0YSk7XG5cdFx0XHRjb25zdCBjb3VudHNGb3JMb2cgPSBPYmplY3Qua2V5cyhwZXJzaXN0ZWRTZXNzaW9ucykubGVuZ3RoO1xuXHRcdFx0aWYgKGNvdW50c0ZvckxvZyA+IDApIHtcblx0XHRcdFx0dGhpcy5pbmZvKCdtaWdyYXRlRGF0YScsIGBSZXN0b3JlZCAke2NvdW50c0ZvckxvZ30gcGVyc2lzdGVkIHNlc3Npb25zYCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBwZXJzaXN0ZWRTZXNzaW9ucztcblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3NhdmVNb2RlbHNFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGl2ZUxvY2FsQ2hhdHMgPSBBcnJheS5mcm9tKHRoaXMuX3Nlc3Npb25Nb2RlbHMudmFsdWVzKCkpXG5cdFx0XHQuZmlsdGVyKHNlc3Npb24gPT4gdGhpcy5zaG91bGRTdG9yZVNlc3Npb24oc2Vzc2lvbikpO1xuXG5cdFx0Y29uc3QgbGl2ZU5vbkxvY2FsQ2hhdHMgPSBBcnJheS5mcm9tKHRoaXMuX3Nlc3Npb25Nb2RlbHMudmFsdWVzKCkpXG5cdFx0XHQuZmlsdGVyKHNlc3Npb24gPT4gIUxvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uLnNlc3Npb25SZXNvdXJjZSkpO1xuXG5cdFx0Ly8gU3luY2hyb25vdXNseSB1cGRhdGUgdGhlIGluZGV4IGZvciBhbGwgbGl2ZSBzZXNzaW9ucyBhbmQgZmx1c2ggaXQgdG9cblx0XHQvLyBzdG9yYWdlLiBUaGlzIGlzIGNyaXRpY2FsIGJlY2F1c2UgYG9uV2lsbFNhdmVTdGF0ZWAgaXMgc3luY2hyb25vdXMgXHUyMDE0XG5cdFx0Ly8gYWZ0ZXIgdGhpcyBoYW5kbGVyIHJldHVybnMgdGhlIHN0b3JhZ2Ugc2VydmljZSBmbHVzaGVzIGl0cyBkYXRhYmFzZXMuXG5cdFx0Ly8gVGhlIGFzeW5jIGZpbGUtd3JpdGUgd29yayBraWNrZWQgb2ZmIGJlbG93IG1heSBjb21wbGV0ZSBhZnRlciB0aGVcblx0XHQvLyBmbHVzaCwgYnV0IHRoZSBpbmRleCBtdXN0IGJlIHVwLXRvLWRhdGUgYmVmb3JlIHRoZSBmbHVzaCBoYXBwZW5zIHNvXG5cdFx0Ly8gdGhhdCBzZXNzaW9ucyBhcmUgZGlzY292ZXJhYmxlIGFmdGVyIGEgcmVsb2FkLlxuXHRcdHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUudXBkYXRlQW5kRmx1c2hJbmRleFN5bmMobGl2ZUxvY2FsQ2hhdHMsIGxpdmVOb25Mb2NhbENoYXRzKTtcblxuXHRcdC8vIEtpY2sgb2ZmIGFzeW5jIGZpbGUgd3JpdGVzIGZvciBzZXNzaW9uIGRhdGEuXG5cdFx0dGhpcy5fY2hhdFNlc3Npb25TdG9yZS5zdG9yZVNlc3Npb25zKGxpdmVMb2NhbENoYXRzKTtcblx0XHR0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLnN0b3JlU2Vzc2lvbnNNZXRhZGF0YU9ubHkobGl2ZU5vbkxvY2FsQ2hhdHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9ubHkgcGVyc2lzdCBsb2NhbCBzZXNzaW9ucyBmcm9tIGNoYXQgdGhhdCBhcmUgbm90IGltcG9ydGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBzaG91bGRTdG9yZVNlc3Npb24oc2Vzc2lvbjogQ2hhdE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0aWYgKHNlc3Npb24uaXNEZWxldGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHNlc3Npb24uc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbi5pbml0aWFsTG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQgJiYgIXNlc3Npb24uaXNJbXBvcnRlZDtcblx0fVxuXG5cdG5vdGlmeVVzZXJBY3Rpb24oYWN0aW9uOiBJQ2hhdFVzZXJBY3Rpb25FdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRTZXJ2aWNlVGVsZW1ldHJ5Lm5vdGlmeVVzZXJBY3Rpb24oYWN0aW9uKTtcblx0XHR0aGlzLl9vbkRpZFBlcmZvcm1Vc2VyQWN0aW9uLmZpcmUoYWN0aW9uKTtcblx0XHRpZiAoYWN0aW9uLmFjdGlvbi5raW5kID09PSAnY2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uJykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChhY3Rpb24uc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRtb2RlbC5ub3RpZnlFZGl0aW5nQWN0aW9uKGFjdGlvbi5hY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG5vdGlmeVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIocmVxdWVzdElkOiBzdHJpbmcsIHJlc29sdmVJZDogc3RyaW5nLCBhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkUmVjZWl2ZVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIuZmlyZSh7IHJlcXVlc3RJZCwgcmVzb2x2ZUlkLCBhbnN3ZXJzIH0pO1xuXHR9XG5cblx0YXN5bmMgc2V0Q2hhdFNlc3Npb25UaXRsZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGl0bGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdG1vZGVsLnNldEN1c3RvbVRpdGxlKHRpdGxlKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIHRpdGxlIGluIHRoZSBmaWxlIHN0b3JhZ2Vcblx0XHRjb25zdCBsb2NhbFNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChsb2NhbFNlc3Npb25JZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5zZXRTZXNzaW9uVGl0bGUobG9jYWxTZXNzaW9uSWQsIHRpdGxlKTtcblx0XHRcdC8vIFRyaWdnZXIgaW1tZWRpYXRlIHNhdmUgdG8gZW5zdXJlIGNvbnNpc3RlbmN5XG5cdFx0XHR0aGlzLnNhdmVTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhY2UobWV0aG9kOiBzdHJpbmcsIG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBDaGF0U2VydmljZSMke21ldGhvZH06ICR7bWVzc2FnZX1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBDaGF0U2VydmljZSMke21ldGhvZH1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluZm8obWV0aG9kOiBzdHJpbmcsIG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoYXRTZXJ2aWNlIyR7bWV0aG9kfTogJHttZXNzYWdlfWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlcnZpY2UjJHttZXRob2R9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlcnJvcihtZXRob2Q6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBDaGF0U2VydmljZSMke21ldGhvZH0gJHttZXNzYWdlfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBkZXNlcmlhbGl6ZUNoYXRzKHNlc3Npb25EYXRhOiBzdHJpbmcpOiBJU2VyaWFsaXphYmxlQ2hhdHNEYXRhIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXJyYXlPZlNlc3Npb25zOiBJU2VyaWFsaXphYmxlQ2hhdERhdGFJbltdID0gcmV2aXZlKEpTT04ucGFyc2Uoc2Vzc2lvbkRhdGEpKTsgLy8gUmV2aXZlIHNlcmlhbGl6ZWQgVVJJcyBpbiBzZXNzaW9uIGRhdGFcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShhcnJheU9mU2Vzc2lvbnMpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgYXJyYXknKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhcnJheU9mU2Vzc2lvbnMucmVkdWNlPElTZXJpYWxpemFibGVDaGF0c0RhdGE+KChhY2MsIHNlc3Npb24pID0+IHtcblx0XHRcdFx0Ly8gUmV2aXZlIHNlcmlhbGl6ZWQgbWFya2Rvd24gc3RyaW5ncyBpbiByZXNwb25zZSBkYXRhXG5cdFx0XHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBzZXNzaW9uLnJlcXVlc3RzKSB7XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocmVxdWVzdC5yZXNwb25zZSkpIHtcblx0XHRcdFx0XHRcdHJlcXVlc3QucmVzcG9uc2UgPSByZXF1ZXN0LnJlc3BvbnNlLm1hcCgocmVzcG9uc2UpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZXNwb25zZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKHJlc3BvbnNlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiByZXF1ZXN0LnJlc3BvbnNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZSA9IFtuZXcgTWFya2Rvd25TdHJpbmcocmVxdWVzdC5yZXNwb25zZSldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFjY1tzZXNzaW9uLnNlc3Npb25JZF0gPSBub3JtYWxpemVTZXJpYWxpemFibGVDaGF0RGF0YShzZXNzaW9uKTtcblx0XHRcdFx0cmV0dXJuIGFjYztcblx0XHRcdH0sIHt9KTtcblx0XHRcdHJldHVybiBzZXNzaW9ucztcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuZXJyb3IoJ2Rlc2VyaWFsaXplQ2hhdHMnLCBgTWFsZm9ybWVkIHNlc3Npb24gZGF0YTogJHtlcnJ9LiBbJHtzZXNzaW9uRGF0YS5zdWJzdHJpbmcoMCwgMjApfSR7c2Vzc2lvbkRhdGEubGVuZ3RoID4gMjAgPyAnLi4uJyA6ICcnfV1gKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBhcnJheSBvZiBjaGF0IGRldGFpbHMgZm9yIGFsbCBwZXJzaXN0ZWQgY2hhdCBzZXNzaW9ucyB0aGF0IGhhdmUgYXQgbGVhc3Qgb25lIHJlcXVlc3QuXG5cdCAqIENoYXQgc2Vzc2lvbnMgdGhhdCBoYXZlIGFscmVhZHkgYmVlbiBsb2FkZWQgaW50byB0aGUgY2hhdCB2aWV3IGFyZSBleGNsdWRlZCBmcm9tIHRoZSByZXN1bHQuXG5cdCAqIEltcG9ydGVkIGNoYXQgc2Vzc2lvbnMgYXJlIGFsc28gZXhjbHVkZWQgZnJvbSB0aGUgcmVzdWx0LlxuXHQgKiBUT0RPIHRoaXMgaXMgb25seSB1c2VkIGJ5IHRoZSBvbGQgXCJzaG93IGNoYXRzXCIgY29tbWFuZCB3aGljaCBjYW4gYmUgcmVtb3ZlZCB3aGVuIHRoZSBwcmUtYWdlbnRzIHZpZXdcblx0ICogb3B0aW9ucyBhcmUgcmVtb3ZlZC5cblx0ICovXG5cdGFzeW5jIGdldExvY2FsU2Vzc2lvbkhpc3RvcnkoKTogUHJvbWlzZTxJQ2hhdERldGFpbFtdPiB7XG5cdFx0Y29uc3QgbGl2ZVNlc3Npb25JdGVtcyA9IGF3YWl0IHRoaXMuZ2V0TGl2ZVNlc3Npb25JdGVtcygpO1xuXHRcdGNvbnN0IGhpc3RvcnlTZXNzaW9uSXRlbXMgPSBhd2FpdCB0aGlzLmdldEhpc3RvcnlTZXNzaW9uSXRlbXMoKTtcblxuXHRcdHJldHVybiBbLi4ubGl2ZVNlc3Npb25JdGVtcywgLi4uaGlzdG9yeVNlc3Npb25JdGVtc107XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBhcnJheSBvZiBjaGF0IGRldGFpbHMgZm9yIGFsbCBsb2NhbCBsaXZlIGNoYXQgc2Vzc2lvbnMuXG5cdCAqL1xuXHRhc3luYyBnZXRMaXZlU2Vzc2lvbkl0ZW1zKCk6IFByb21pc2U8SUNoYXREZXRhaWxbXT4ge1xuXHRcdHJldHVybiBhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKHRoaXMuX3Nlc3Npb25Nb2RlbHMudmFsdWVzKCkpXG5cdFx0XHQuZmlsdGVyKHNlc3Npb24gPT4gdGhpcy5zaG91bGRCZUluSGlzdG9yeShzZXNzaW9uKSlcblx0XHRcdC5tYXAoY2hhdE1vZGVsVG9DaGF0RGV0YWlsKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBhcnJheSBvZiBjaGF0IGRldGFpbHMgZm9yIGFsbCBsb2NhbCBjaGF0IHNlc3Npb25zIGluIGhpc3RvcnkgKG5vdCBjdXJyZW50bHkgbG9hZGVkKS5cblx0ICovXG5cdGFzeW5jIGdldEhpc3RvcnlTZXNzaW9uSXRlbXMoKTogUHJvbWlzZTxJQ2hhdERldGFpbFtdPiB7XG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLmdldEluZGV4KCk7XG5cdFx0cmV0dXJuIE9iamVjdC52YWx1ZXMoaW5kZXgpXG5cdFx0XHQuZmlsdGVyKGVudHJ5ID0+ICFlbnRyeS5pc0V4dGVybmFsKVxuXHRcdFx0LmZpbHRlcihlbnRyeSA9PiAhdGhpcy5fc2Vzc2lvbk1vZGVscy5oYXMoTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKGVudHJ5LnNlc3Npb25JZCkpICYmIGVudHJ5LmluaXRpYWxMb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCAmJiAhZW50cnkuaXNFbXB0eSlcblx0XHRcdC5tYXAoKGVudHJ5KTogSUNoYXREZXRhaWwgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oZW50cnkuc2Vzc2lvbklkKTtcblx0XHRcdFx0Y29uc3QgeyB3b3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5U3RyLCAuLi5yZXN0IH0gPSBlbnRyeTtcblx0XHRcdFx0cmV0dXJuICh7XG5cdFx0XHRcdFx0Li4ucmVzdCxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRoaXMuX3Nlc3Npb25Nb2RlbHMuaGFzKHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeVN0ciA/IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5U3RyKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldE1ldGFkYXRhRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUNoYXREZXRhaWwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuZ2V0SW5kZXgoKTtcblx0XHRjb25zdCBtZXRhZGF0YTogSUNoYXRTZXNzaW9uRW50cnlNZXRhZGF0YSB8IHVuZGVmaW5lZCA9IGluZGV4W3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpXTtcblx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdGNvbnN0IHsgd29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeVN0ciwgLi4ucmVzdCB9ID0gbWV0YWRhdGE7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5yZXN0LFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGlzQWN0aXZlOiB0aGlzLl9zZXNzaW9uTW9kZWxzLmhhcyhzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5U3RyID8gVVJJLnBhcnNlKHdvcmtpbmdEaXJlY3RvcnlTdHIpIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRCZUluSGlzdG9yeShlbnRyeTogQ2hhdE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFlbnRyeS5pc0ltcG9ydGVkICYmICFlbnRyeS5pc0RlbGV0ZWQgJiYgISFMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoZW50cnkuc2Vzc2lvblJlc291cmNlKSAmJiBlbnRyeS5pbml0aWFsTG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQ7XG5cdH1cblxuXHRhc3luYyByZW1vdmVIaXN0b3J5RW50cnkoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLmRlbGV0ZVNlc3Npb24odGhpcy50b0xvY2FsU2Vzc2lvbklkKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdG1vZGVsLm1hcmtEZWxldGVkKCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkRGlzcG9zZVNlc3Npb24uZmlyZSh7IHNlc3Npb25SZXNvdXJjZXM6IFtzZXNzaW9uUmVzb3VyY2VdLCByZWFzb246ICdjbGVhcmVkJyB9KTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyQWxsSGlzdG9yeUVudHJpZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5jbGVhckFsbFNlc3Npb25zKCk7XG5cdH1cblxuXHRzdGFydE5ld0xvY2FsU2Vzc2lvbihsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG9wdGlvbnM/OiBJQ2hhdFNlc3Npb25TdGFydE9wdGlvbnMpOiBJQ2hhdE1vZGVsUmVmZXJlbmNlIHtcblx0XHR0aGlzLnRyYWNlKCdzdGFydE5ld0xvY2FsU2Vzc2lvbicpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25Nb2RlbHMuYWNxdWlyZU9yQ3JlYXRlKHtcblx0XHRcdGluaXRpYWxEYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNhblVzZVRvb2xzOiBvcHRpb25zPy5jYW5Vc2VUb29scyA/PyB0cnVlLFxuXHRcdFx0ZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmU6IG9wdGlvbnM/LmRpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlXG5cdFx0fSwgb3B0aW9ucz8uZGVidWdPd25lciA/PyAnQ2hhdFNlcnZpY2Ujc3RhcnROZXdMb2NhbFNlc3Npb24nKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0U2Vzc2lvbihwcm9wczogSVN0YXJ0U2Vzc2lvblByb3BzKTogQ2hhdE1vZGVsIHtcblx0XHRjb25zdCB7IGluaXRpYWxEYXRhLCBsb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlLCBjYW5Vc2VUb29scywgdHJhbnNmZXJFZGl0aW5nU2Vzc2lvbiwgZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmUsIGlucHV0U3RhdGUsIGlzUmVhZE9ubHkgfSA9IHByb3BzO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIGluaXRpYWxEYXRhLCB7IGluaXRpYWxMb2NhdGlvbjogbG9jYXRpb24sIGNhblVzZVRvb2xzLCByZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLCBkaXNhYmxlQmFja2dyb3VuZEtlZXBBbGl2ZSwgaW5wdXRTdGF0ZSwgaXNSZWFkT25seSB9KTtcblx0XHRpZiAobG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQpIHtcblx0XHRcdG1vZGVsLnN0YXJ0RWRpdGluZ1Nlc3Npb24odHJ1ZSwgdHJhbnNmZXJFZGl0aW5nU2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbml0aWFsaXplU2Vzc2lvbihtb2RlbCk7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplU2Vzc2lvbihtb2RlbDogQ2hhdE1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZSgnaW5pdGlhbGl6ZVNlc3Npb24nLCBgSW5pdGlhbGl6ZSBzZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfWApO1xuXG5cdFx0Ly8gQWN0aXZhdGUgdGhlIGRlZmF1bHQgZXh0ZW5zaW9uIHByb3ZpZGVkIGFnZW50IGJ1dCBkbyBub3Qgd2FpdFxuXHRcdC8vIGZvciBpdCB0byBiZSByZWFkeSBzbyB0aGF0IHRoZSBzZXNzaW9uIGNhbiBiZSB1c2VkIGltbWVkaWF0ZWx5XG5cdFx0Ly8gd2l0aG91dCBoYXZpbmcgdG8gd2FpdCBmb3IgdGhlIGFnZW50IHRvIGJlIHJlYWR5LlxuXHRcdHRoaXMuYWN0aXZhdGVEZWZhdWx0QWdlbnQobW9kZWwuaW5pdGlhbExvY2F0aW9uKS5jYXRjaChlID0+IHRoaXMubG9nU2VydmljZS5lcnJvcihlKSk7XG5cdH1cblxuXHRhc3luYyBhY3RpdmF0ZURlZmF1bHRBZ2VudChsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cblx0XHRjb25zdCBkZWZhdWx0QWdlbnREYXRhID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldENvbnRyaWJ1dGVkRGVmYXVsdEFnZW50KGxvY2F0aW9uKSA/PyB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0Q29udHJpYnV0ZWREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0aWYgKCFkZWZhdWx0QWdlbnREYXRhKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3JOb1RlbGVtZXRyeSgnTm8gZGVmYXVsdCBhZ2VudCBjb250cmlidXRlZCcpO1xuXHRcdH1cblxuXHRcdC8vIEF3YWl0IGFjdGl2YXRpb24gb2YgdGhlIGV4dGVuc2lvbiBwcm92aWRlZCBhZ2VudFxuXHRcdC8vIFVzaW5nIGBhY3RpdmF0ZUJ5SWRgIGFzIHdvcmthcm91bmQgZm9yIHRoZSBpc3N1ZVxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTA1OTBcblx0XHRpZiAoIWRlZmF1bHRBZ2VudERhdGEuaXNDb3JlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUlkKGRlZmF1bHRBZ2VudERhdGEuZXh0ZW5zaW9uSWQsIHtcblx0XHRcdFx0YWN0aXZhdGlvbkV2ZW50OiBgb25DaGF0UGFydGljaXBhbnQ6JHtkZWZhdWx0QWdlbnREYXRhLmlkfWAsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBkZWZhdWx0QWdlbnREYXRhLmV4dGVuc2lvbklkLFxuXHRcdFx0XHRzdGFydHVwOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdEFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFjdGl2YXRlZEFnZW50cygpLmZpbmQoYWdlbnQgPT4gYWdlbnQuaWQgPT09IGRlZmF1bHRBZ2VudERhdGEuaWQpO1xuXHRcdGlmICghZGVmYXVsdEFnZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3JOb1RlbGVtZXRyeSgnTm8gZGVmYXVsdCBhZ2VudCByZWdpc3RlcmVkJyk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0YWNxdWlyZUV4aXN0aW5nU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZGVidWdPd25lcj86IHN0cmluZyk6IElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxzLmFjcXVpcmVFeGlzdGluZyhzZXNzaW9uUmVzb3VyY2UsIGRlYnVnT3duZXIgPz8gJ0NoYXRTZXJ2aWNlI2FjcXVpcmVFeGlzdGluZ1Nlc3Npb24nKTtcblx0fVxuXG5cdGdldENoYXRNb2RlbFJlZmVyZW5jZURlYnVnSW5mbygpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXRSZWZlcmVuY2VEZWJ1Z1NuYXBzaG90KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFjcXVpcmVPclJlc3RvcmVMb2NhbFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGRlYnVnT3duZXI/OiBzdHJpbmcpOiBQcm9taXNlPElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdhY3F1aXJlT3JSZXN0b3JlU2Vzc2lvbicsIGAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHRjb25zdCBleGlzdGluZ1JlZiA9IHRoaXMuYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIGRlYnVnT3duZXIpO1xuXHRcdGlmIChleGlzdGluZ1JlZikge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nUmVmO1xuXHRcdH1cblxuXHRcdGxldCBzZXNzaW9uRGF0YTogSVNlcmlhbGl6ZWRDaGF0RGF0YVJlZmVyZW5jZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNFcXVhbCh0aGlzLnRyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLl90cmFuc2ZlcnJlZFNlc3Npb25SZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRcdHNlc3Npb25EYXRhID0gYXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5yZWFkVHJhbnNmZXJyZWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxvY2FsU2Vzc2lvbklkID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAobG9jYWxTZXNzaW9uSWQpIHtcblx0XHRcdFx0c2Vzc2lvbkRhdGEgPSBhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLnJlYWRTZXNzaW9uKGxvY2FsU2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNlc3Npb25EYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZWYgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLmFjcXVpcmVPckNyZWF0ZSh7XG5cdFx0XHRpbml0aWFsRGF0YTogc2Vzc2lvbkRhdGEsXG5cdFx0XHRsb2NhdGlvbjogc2Vzc2lvbkRhdGEudmFsdWUuaW5pdGlhbExvY2F0aW9uID8/IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZSxcblx0XHR9LCBkZWJ1Z093bmVyID8/ICdDaGF0U2VydmljZSNhY3F1aXJlT3JSZXN0b3JlTG9jYWxTZXNzaW9uJyk7XG5cblx0XHRyZXR1cm4gc2Vzc2lvblJlZjtcblx0fVxuXG5cdC8vIFRoZXJlIGFyZSBzb21lIGNhc2VzIHdoZXJlIHRoaXMgcmV0dXJucyBhIHJlYWwgc3RyaW5nLiBXaGF0IGhhcHBlbnMgaWYgaXQgZG9lc24ndD9cblx0Ly8gVGhpcyBoYWQgdGl0bGVzIHJlc3RvcmVkIGZyb20gdGhlIGluZGV4LCBzbyBqdXN0IHJldHVybiB0aXRsZXMgZnJvbSBpbmRleCBpbnN0ZWFkLCBzeW5jLlxuXHRnZXRTZXNzaW9uVGl0bGUoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChzZXNzaW9uUmVzb3VyY2UpPy50aXRsZSA/P1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25TdG9yZS5nZXRNZXRhZGF0YUZvclNlc3Npb25TeW5jKHNlc3Npb25SZXNvdXJjZSk/LnRpdGxlO1xuXHR9XG5cblx0bG9hZFNlc3Npb25Gcm9tRGF0YShkYXRhOiBJRXhwb3J0YWJsZUNoYXREYXRhIHwgSVNlcmlhbGl6YWJsZUNoYXREYXRhLCBkZWJ1Z093bmVyPzogc3RyaW5nKTogSUNoYXRNb2RlbFJlZmVyZW5jZSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gKGRhdGEgYXMgSVNlcmlhbGl6YWJsZUNoYXREYXRhKS5zZXNzaW9uSWQgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25Nb2RlbHMuYWNxdWlyZU9yQ3JlYXRlKHtcblx0XHRcdGluaXRpYWxEYXRhOiB7IHZhbHVlOiBkYXRhLCBzZXJpYWxpemVyOiBuZXcgQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2coKSB9LFxuXHRcdFx0bG9jYXRpb246IGRhdGEuaW5pdGlhbExvY2F0aW9uID8/IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZSxcblx0XHR9LCBkZWJ1Z093bmVyID8/ICdDaGF0U2VydmljZSNsb2FkU2Vzc2lvbkZyb21EYXRhJyk7XG5cdH1cblxuXHRhc3luYyBhY3F1aXJlT3JMb2FkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGRlYnVnT3duZXI/OiBzdHJpbmcpOiBQcm9taXNlPElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoTG9jYWxDaGF0U2Vzc2lvblVyaS5pc0xvY2FsU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY3F1aXJlT3JSZXN0b3JlTG9jYWxTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgZGVidWdPd25lcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmxvYWRSZW1vdGVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgbG9jYXRpb24sIHRva2VuLCBkZWJ1Z093bmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRSZW1vdGVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgZGVidWdPd25lcj86IHN0cmluZyk6IFByb21pc2U8SUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIENoZWNrIGlmIHNlc3Npb24gYWxyZWFkeSBleGlzdHMgYmVmb3JlIHJlc29sdmluZyB0aGUgcHJvdmlkZXIsXG5cdFx0Ly8gc28gd2UgY2FuIHJldHVybiBhIGNhY2hlZCBtb2RlbCBldmVuIGlmIHRoZSBwcm92aWRlciB3YXMgdW5yZWdpc3RlcmVkLlxuXHRcdHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nUmVmID0gdGhpcy5hY3F1aXJlRXhpc3RpbmdTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgZGVidWdPd25lcik7XG5cdFx0XHRpZiAoZXhpc3RpbmdSZWYpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nUmVmO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuY2hhdFNlc3Npb25TZXJ2aWNlLmNhblJlc29sdmVDaGF0U2Vzc2lvbihnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSksIHRva2VuKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlZFNlc3Npb24gPSBhd2FpdCB0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHdlIGhhdmVuJ3QgY3JlYXRlZCB0aGlzIGluIHRoZSBtZWFudGltZVxuXHRcdHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nUmVmID0gdGhpcy5hY3F1aXJlRXhpc3RpbmdTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgZGVidWdPd25lcik7XG5cdFx0XHRpZiAoZXhpc3RpbmdSZWYpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nUmVmO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjaGF0U2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBtb2RlbElkID0gZmluZExhc3QocHJvdmlkZWRTZXNzaW9uLmhpc3RvcnkuZmlsdGVyKG0gPT4gbS50eXBlID09PSAncmVxdWVzdCcpLCByZXEgPT4gcmVxLm1vZGVsSWQpPy5tb2RlbElkO1xuXHRcdGNvbnN0IGFnZW50VXJpID0gZmluZExhc3QocHJvdmlkZWRTZXNzaW9uLmhpc3RvcnkuZmlsdGVyKG0gPT4gbS50eXBlID09PSAncmVxdWVzdCcpLCByZXEgPT4gcmVxLm1vZGVJbnN0cnVjdGlvbnM/LnVyaSk/Lm1vZGVJbnN0cnVjdGlvbnM/LnVyaTtcblx0XHRjb25zdCBzdG9yZWRNZXRhZGF0YSA9IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuZ2V0TWV0YWRhdGFGb3JTZXNzaW9uU3luYyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHN0b3JlZFBlcm1pc3Npb25MZXZlbCA9IHN0b3JlZE1ldGFkYXRhPy5wZXJtaXNzaW9uTGV2ZWw7XG5cdFx0Y29uc3Qgc3RvcmVkSW5wdXRTdGF0ZSA9IHN0b3JlZE1ldGFkYXRhPy5pbnB1dFN0YXRlO1xuXHRcdGxldCBpbml0aWFsRGF0YTogSVNlcmlhbGl6ZWRDaGF0RGF0YVJlZmVyZW5jZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaGlzdG9yeVNlbGVjdGVkTW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaGlzdG9yeURlcml2ZWRNb2RlbDogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGVbJ3NlbGVjdGVkTW9kZWwnXSA9IHVuZGVmaW5lZDtcblx0XHRpZiAoKG1vZGVsSWQgfHwgYWdlbnRVcmkpKSB7XG5cdFx0XHRjb25zdCBtb2RlOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZVsnbW9kZSddID0gYWdlbnRVcmkgPyB7IGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCwgaWQ6IGFnZW50VXJpLnRvU3RyaW5nKCkgfSA6IHsga2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LCBpZDogQ2hhdE1vZGUuQWdlbnQuaWQgfTtcblx0XHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSBtb2RlbElkID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdC8vIFRoZSBzZXNzaW9uIHJlcXVlc3QgaGlzdG9yeSBvbmx5IHRlbGxzIHVzIHdoaWNoIG1vZGVsIGlkIHdhcyBsYXN0IHVzZWQsIG5vdCB0aGVcblx0XHRcdC8vIHVzZXIncyBwZXItbW9kZWwgY29uZmlndXJhdGlvbiAoZS5nLiB0aGlua2luZyBlZmZvcnQsIGNvbnRleHQgd2luZG93KS4gUHJlc2VydmUgdGhhdFxuXHRcdFx0Ly8gY29uZmlndXJhdGlvbiBmcm9tIHRoZSBwZXJzaXN0ZWQgZHJhZnQgd2hlbiBpdCByZWZlcnMgdG8gdGhlIHNhbWUgbW9kZWwsIHNvIHJlb3BlbmluZ1xuXHRcdFx0Ly8gdGhlIHNlc3Npb24gcmVzdG9yZXMgdGhlIGZ1bGwgbW9kZWwgY29uZmlnIGFuZCBub3QganVzdCB0aGUgYmFyZSBtb2RlbCBpZC4gT2xkZXIgZHJhZnRzXG5cdFx0XHQvLyBzdG9yZWQgdGhlIGNvbmZpZ3VyYXRpb24gYXMgYSBzaWJsaW5nIG9mIGBzZWxlY3RlZE1vZGVsYCAobGVnYWN5IHRvcC1sZXZlbCBmaWVsZCkgcmF0aGVyXG5cdFx0XHQvLyB0aGFuIG5lc3RlZCB3aXRoaW4gaXQsIHNvIGZhbGwgYmFjayB0byB0aGF0IGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cblx0XHRcdGNvbnN0IHN0b3JlZE1vZGVsQ29uZmlndXJhdGlvbiA9IHN0b3JlZElucHV0U3RhdGU/LnNlbGVjdGVkTW9kZWw/Lm1vZGVsQ29uZmlndXJhdGlvblxuXHRcdFx0XHQ/PyAoc3RvcmVkSW5wdXRTdGF0ZSBhcyB7IG1vZGVsQ29uZmlndXJhdGlvbj86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IH0gfCB1bmRlZmluZWQpPy5tb2RlbENvbmZpZ3VyYXRpb247XG5cdFx0XHRjb25zdCBtb2RlbENvbmZpZ3VyYXRpb24gPSBzdG9yZWRJbnB1dFN0YXRlPy5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyID09PSBtb2RlbElkXG5cdFx0XHRcdD8gc3RvcmVkTW9kZWxDb25maWd1cmF0aW9uXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Ly8gV2hlbiB0aGUgbGl2ZSBtb2RlbCBsaXN0IGhhcyBub3QgbG9hZGVkIHlldCAoY29sZCByZXN0b3JlKSBgbG9va3VwTGFuZ3VhZ2VNb2RlbGBcblx0XHRcdC8vIHJldHVybnMgdW5kZWZpbmVkLiBEb24ndCBkaXNjYXJkIHRoZSBrbm93biBtb2RlbDogZmFsbCBiYWNrIHRvIHRoZSBzZXNzaW9uJ3Mgc2F2ZWRcblx0XHRcdC8vIGRyYWZ0IG1vZGVsLCB3aGljaCBjYXJyaWVzIHRoZSBmdWxsIHNlcmlhbGl6ZWQgbWV0YWRhdGEgKGluY2x1ZGluZ1xuXHRcdFx0Ly8gYHRhcmdldENoYXRTZXNzaW9uVHlwZWApLCB3aGVuIGl0IHJlZmVycyB0byB0aGUgc2FtZSBpZCB0aGUgcmVxdWVzdCBoaXN0b3J5IHJlcG9ydHNcblx0XHRcdC8vIGFzIGxhc3QgdXNlZC4gSGFuZGluZyB0aGUgaW5wdXQgcGFydCBhIG1vZGVsLXdpdGgtbWV0YWRhdGEgbGV0cyBpdCB3YWl0IGZvciB0aGVcblx0XHRcdC8vIG1vZGVsIHBvb2wgYW5kIGFwcGx5IGl0IG9uY2UgaXQgbG9hZHMsIGluc3RlYWQgb2YgZmFsbGluZyBiYWNrIHRvIEF1dG8uXG5cdFx0XHRjb25zdCBzdG9yZWRTZWxlY3RlZE1vZGVsID0gc3RvcmVkSW5wdXRTdGF0ZT8uc2VsZWN0ZWRNb2RlbDtcblx0XHRcdGNvbnN0IHNlbGVjdGVkTW9kZWw6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlWydzZWxlY3RlZE1vZGVsJ10gPSBtb2RlbElkICYmIG1vZGVsTWV0YWRhdGFcblx0XHRcdFx0PyB7IGlkZW50aWZpZXI6IG1vZGVsSWQsIG1ldGFkYXRhOiBtb2RlbE1ldGFkYXRhLCBtb2RlbENvbmZpZ3VyYXRpb24gfVxuXHRcdFx0XHQ6IChtb2RlbElkICYmIHN0b3JlZFNlbGVjdGVkTW9kZWwgJiYgc3RvcmVkU2VsZWN0ZWRNb2RlbC5pZGVudGlmaWVyID09PSBtb2RlbElkXG5cdFx0XHRcdFx0PyB7IC4uLnN0b3JlZFNlbGVjdGVkTW9kZWwsIG1vZGVsQ29uZmlndXJhdGlvbiB9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQpO1xuXHRcdFx0aGlzdG9yeVNlbGVjdGVkTW9kZWwgPSBzZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyO1xuXHRcdFx0aGlzdG9yeURlcml2ZWRNb2RlbCA9IHNlbGVjdGVkTW9kZWw7XG5cdFx0XHQvLyBUaGlzIGlzIHVzZWQgdG8gaW5pdGlhbGl6ZSB0aGUgc3RhdGUgb2YgdGhlIGNoYXQgaW5wdXQgYm94LCB3aXRoIHRoZSBzZWxlY3RlZCBtb2RlbCwgbW9kZSwgZXRjXG5cdFx0XHRpbml0aWFsRGF0YSA9IHtcblx0XHRcdFx0c2VyaWFsaXplcjogbmV3IENoYXRTZXNzaW9uT3BlcmF0aW9uTG9nKCksXG5cdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0Y3JlYXRpb25EYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGluaXRpYWxMb2NhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnJyxcblx0XHRcdFx0XHRzZXNzaW9uSWQ6ICcnLFxuXHRcdFx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRcdFx0aW5wdXRTdGF0ZToge1xuXHRcdFx0XHRcdFx0YXR0YWNobWVudHM6IFtdLFxuXHRcdFx0XHRcdFx0Y29udHJpYjoge30sXG5cdFx0XHRcdFx0XHRpbnB1dFRleHQ6ICcnLFxuXHRcdFx0XHRcdFx0bW9kZSxcblx0XHRcdFx0XHRcdHNlbGVjdGVkTW9kZWw6IHNlbGVjdGVkTW9kZWwsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zOiBbXSxcblx0XHRcdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogc3RvcmVkUGVybWlzc2lvbkxldmVsLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cGVuZGluZ1JlcXVlc3RzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmVwb0RhdGE6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIENvbnRyaWJ1dGVkIHNlc3Npb25zIGRvIG5vdCB1c2UgVUkgdG9vbHMuXG5cdFx0Ly8gUHJlZmVyIChpbiBvcmRlcik6IGEgdHJhbnNmZXJyZWQgZHJhZnQsIHRoZSBwZXJzaXN0ZWQgZHJhZnQgZnJvbSBtZXRhZGF0YSxcblx0XHQvLyBvdGhlcndpc2UgbGV0IHRoZSBjb25zdHJ1Y3RvciBmYWxsIGJhY2sgdG8gaW5pdGlhbERhdGEudmFsdWUuaW5wdXRTdGF0ZS5cblx0XHQvLyBXaGVuIHJlc3RvcmluZyB0aGUgcGVyc2lzdGVkIGRyYWZ0IHdlIGtlZXAgdGhlIHVuc2VudCB0ZXh0L3NlbGVjdGlvbnMvbW9kZSBidXRcblx0XHQvLyBkZWxpYmVyYXRlbHkgZHJvcCBpdHMgcGVyc2lzdGVkIHNlbGVjdGVkTW9kZWwgaWRlbnRpZmllciAoaXQgY2FuIGJlIHN0YWxlIG9yIGJlbG9uZ1xuXHRcdC8vIHRvIGEgZGlmZmVyZW50IG1vZGVsIHBvb2wpIGluIGZhdm91ciBvZiB0aGUgbW9kZWwgZGVyaXZlZCBmcm9tIHRoZSBzZXNzaW9uJ3MgcmVxdWVzdFxuXHRcdC8vIGhpc3RvcnkuIFRoZSB1c2VyJ3MgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gKHRoaW5raW5nIGVmZm9ydCwgY29udGV4dCB3aW5kb3cpIGlzXG5cdFx0Ly8gY2FycmllZCBvdmVyIG9udG8gdGhhdCBoaXN0b3J5LWRlcml2ZWQgbW9kZWwgYWJvdmUgd2hlbiB0aGUgaWRzIG1hdGNoLiBXaGVuIG5vXG5cdFx0Ly8gaGlzdG9yeSBtb2RlbCBpcyBhdmFpbGFibGUgdGhlIG1vZGVsIGlzIGxlZnQgdW5kZWZpbmVkIHNvIHRoZSBpbnB1dCBwYXJ0IHJlc29sdmVzXG5cdFx0Ly8gaXQgdmlhIGl0cyBvd24gc2VsZWN0aW9uIGxvZ2ljLlxuXHRcdGNvbnN0IHJlc3RvcmVkRHJhZnQ6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkID0gc3RvcmVkSW5wdXRTdGF0ZVxuXHRcdFx0PyB7IC4uLnN0b3JlZElucHV0U3RhdGUsIHNlbGVjdGVkTW9kZWw6IGhpc3RvcnlEZXJpdmVkTW9kZWwgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Ly8gQXQgY29sZCByZXN0b3JlIHRoZSBhZ2VudC1ob3N0IHRyYW5zZmVycmVkIGRyYWZ0IGNhbiBkcm9wIHRoZSB1c2VyJ3MgcGVyLXNlc3Npb24gcGlja2VyXG5cdFx0Ly8gc2VsZWN0aW9ucyAobW9kZWwvbW9kZSk7IHJlc3RvcmUgdGhlbSBmcm9tIHRoZSBzZXNzaW9uJ3Mgb3duIHNhdmVkIGBzdG9yZWRJbnB1dFN0YXRlYFxuXHRcdC8vIChtb2RlLCB2aWEge0BsaW5rIGJhY2tmaWxsUmVzdG9yZWRQaWNrZXJTdGF0ZX0pIGFuZCBmcm9tIHRoZSBoaXN0b3J5LWRlcml2ZWQgbW9kZWxcblx0XHQvLyAodmlhIHtAbGluayBiYWNrZmlsbFRyYW5zZmVycmVkTW9kZWx9KS4gVGhlIHBlcnNpc3RlZCBkcmFmdCBhbHJlYWR5IGNvbnRhaW5zXG5cdFx0Ly8gYGhpc3RvcnlEZXJpdmVkTW9kZWxgLCBzbyBvbmx5IGEgdHJhbnNmZXJyZWQgZHJhZnQgbmVlZHMgdGhpcyBiYWNrZmlsbC5cblx0XHRjb25zdCB0cmFuc2ZlcnJlZElucHV0U3RhdGUgPSBwcm92aWRlZFNlc3Npb24udHJhbnNmZXJyZWRTdGF0ZT8uaW5wdXRTdGF0ZTtcblx0XHRjb25zdCBzdGF0ZVRvQXBwbHkgPSB0cmFuc2ZlcnJlZElucHV0U3RhdGVcblx0XHRcdD8gYmFja2ZpbGxUcmFuc2ZlcnJlZE1vZGVsKHRyYW5zZmVycmVkSW5wdXRTdGF0ZSwgaGlzdG9yeURlcml2ZWRNb2RlbClcblx0XHRcdDogcmVzdG9yZWREcmFmdDtcblx0XHRjb25zdCBpbnB1dFN0YXRlID0gYmFja2ZpbGxSZXN0b3JlZFBpY2tlclN0YXRlKHN0YXRlVG9BcHBseSwgc3RvcmVkSW5wdXRTdGF0ZSwgQ2hhdE1vZGUuQWdlbnQuaWQpO1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5hY3F1aXJlT3JDcmVhdGUoe1xuXHRcdFx0aW5pdGlhbERhdGEsXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y2FuVXNlVG9vbHM6IGZhbHNlLFxuXHRcdFx0dHJhbnNmZXJFZGl0aW5nU2Vzc2lvbjogcHJvdmlkZWRTZXNzaW9uLnRyYW5zZmVycmVkU3RhdGU/LmVkaXRpbmdTZXNzaW9uLFxuXHRcdFx0aW5wdXRTdGF0ZSxcblx0XHRcdGlzUmVhZE9ubHk6IHByb3ZpZGVkU2Vzc2lvbi5pc1JlYWRPbmx5LFxuXHRcdH0sIGRlYnVnT3duZXIgPz8gJ0NoYXRTZXJ2aWNlI2xvYWRSZW1vdGVTZXNzaW9uJyk7XG5cblx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKG1vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLCBgbG9hZFJlbW90ZVNlc3Npb24gaW5wdXRTdGF0ZSBzb3VyY2U6IHNlc3Npb249JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0sIGNoYXRTZXNzaW9uVHlwZT0ke2NoYXRTZXNzaW9uVHlwZX0sIGhpc3RvcnlNb2RlbElkPSR7bW9kZWxJZH0sIGFnZW50VXJpPSR7YWdlbnRVcmk/LnRvU3RyaW5nKCl9LCBoaXN0b3J5U2VsZWN0ZWRNb2RlbD0ke2hpc3RvcnlTZWxlY3RlZE1vZGVsfSwgdHJhbnNmZXJyZWRTZWxlY3RlZE1vZGVsPSR7cHJvdmlkZWRTZXNzaW9uLnRyYW5zZmVycmVkU3RhdGU/LmlucHV0U3RhdGU/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXJ9LCBzdG9yZWRTZWxlY3RlZE1vZGVsPSR7c3RvcmVkSW5wdXRTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcn0sIGZpbmFsU2VsZWN0ZWRNb2RlbD0ke21vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLnN0YXRlLmdldCgpPy5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyfSwgaGFzVHJhbnNmZXJyZWRJbnB1dFN0YXRlPSR7ISFwcm92aWRlZFNlc3Npb24udHJhbnNmZXJyZWRTdGF0ZT8uaW5wdXRTdGF0ZX0sIGhhc1N0b3JlZElucHV0U3RhdGU9JHshIXN0b3JlZElucHV0U3RhdGV9LCBoYXNJbml0aWFsRGF0YT0keyEhaW5pdGlhbERhdGF9YCwgbW9kZWxSZWYub2JqZWN0LmlucHV0TW9kZWwuc3RhdGUuZ2V0KCksIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblxuXHRcdC8vIFJlc3RvcmUgcGVybWlzc2lvbiBsZXZlbCBmcm9tIG1ldGFkYXRhIGV2ZW4gd2hlbiBpbml0aWFsRGF0YSB3YXMgbm90IGNvbnN0cnVjdGVkXG5cdFx0Ly8gYW5kIG5vIGlucHV0U3RhdGUgY2FycmllZCBpdCB0aHJvdWdoLlxuXHRcdGlmIChzdG9yZWRQZXJtaXNzaW9uTGV2ZWwgJiYgIWluaXRpYWxEYXRhICYmICFzdG9yZWRJbnB1dFN0YXRlKSB7XG5cdFx0XHRtb2RlbFJlZi5vYmplY3QuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7IHBlcm1pc3Npb25MZXZlbDogc3RvcmVkUGVybWlzc2lvbkxldmVsIH0pO1xuXHRcdH1cblxuXHRcdGlmIChwcm92aWRlZFNlc3Npb24udGl0bGUpIHtcblx0XHRcdG1vZGVsUmVmLm9iamVjdC5zZXRDdXN0b21UaXRsZShwcm92aWRlZFNlc3Npb24udGl0bGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbFJlZi5vYmplY3Qub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHByb3ZpZGVkU2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaXNBZ2VudEhvc3RTZXNzaW9uID0gaXNBZ2VudEhvc3RUYXJnZXQoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb25zdCByZXF1ZXN0UGFyc2VyID0gaXNBZ2VudEhvc3RTZXNzaW9uID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGFyc2VBZ2VudEhvc3RIaXN0b3J5UHJvbXB0ID0gKHRleHQ6IHN0cmluZywgYWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkKTogSVBhcnNlZENoYXRSZXF1ZXN0ID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0UGFyc2VyKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgYXR0YWNobWVudENhcGFiaWxpdGllcyA9IHRoaXMuZ2V0QXR0YWNobWVudENhcGFiaWxpdGllc0ZvclBhcnNlcihjaGF0U2Vzc2lvblR5cGUsIGFnZW50KTtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSByZXF1ZXN0UGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3RXaXRoUmVmZXJlbmNlcyhcblx0XHRcdFx0XHRcdEVNUFRZX1JFRkVSRU5DRVMsXG5cdFx0XHRcdFx0XHRFTVBUWV9UT09MX0VOQUJMRU1FTlRfTUFQLFxuXHRcdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0eyBzZXNzaW9uVHlwZTogY2hhdFNlc3Npb25UeXBlLCBmb3JjZWRBZ2VudDogYWdlbnQsIGF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgfSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGlmIChwYXJzZWQucGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgQ2hhdFNlcnZpY2UjbG9hZFJlbW90ZVNlc3Npb246IGZhaWxlZCB0byByZS1wYXJzZSBoaXN0b3JpY2FsIHByb21wdCBmb3IgJHtjaGF0U2Vzc2lvblR5cGV9YCwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQoXG5cdFx0XHRcdFx0bmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSxcblx0XHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogdGV4dC5sZW5ndGggKyAxIH0sXG5cdFx0XHRcdFx0dGV4dFxuXHRcdFx0XHQpXVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0bGV0IGxhc3RSZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbXBsZXRlTGFzdFJlc3BvbnNlID0gKCkgPT4ge1xuXHRcdFx0aWYgKE51bWJlci5pc0Zpbml0ZShsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdCkpIHtcblx0XHRcdFx0bGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5jb21wbGV0ZShsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYXN0UmVxdWVzdD8ucmVzcG9uc2U/LmNvbXBsZXRlV2l0aG91dFRpbWVzdGFtcCgpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdFJlc3BvbnNlQ29tcGxldGVkQXQgPSB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgcHJvdmlkZWRTZXNzaW9uLmhpc3RvcnkpIHtcblx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09ICdyZXF1ZXN0Jykge1xuXHRcdFx0XHRpZiAobGFzdFJlcXVlc3QpIHtcblx0XHRcdFx0XHRjb21wbGV0ZUxhc3RSZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVxdWVzdFRleHQgPSBtZXNzYWdlLnByb21wdDtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPVxuXHRcdFx0XHRcdG1lc3NhZ2UucGFydGljaXBhbnRcblx0XHRcdFx0XHRcdD8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KG1lc3NhZ2UucGFydGljaXBhbnQpIC8vIFRPRE8oam9zcGljZXIpOiBSZW1vdmUgYW5kIGFsd2F5cyBoYXJkY29kZT9cblx0XHRcdFx0XHRcdDogdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSBwYXJzZUFnZW50SG9zdEhpc3RvcnlQcm9tcHQocmVxdWVzdFRleHQsIGFnZW50KTtcblx0XHRcdFx0Y29uc3QgbW9kZUluZm8gPSBtZXNzYWdlLm1vZGVJbnN0cnVjdGlvbnMgPyB7XG5cdFx0XHRcdFx0a2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRcdGlzQnVpbHRpbjogbWVzc2FnZS5tb2RlSW5zdHJ1Y3Rpb25zLmlzQnVpbHRpbiA/PyBmYWxzZSxcblx0XHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiBtZXNzYWdlLm1vZGVJbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnY3VzdG9tJyxcblx0XHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFJlcXVlc3RNb2RlSW5mbyA6IHVuZGVmaW5lZDtcblx0XHRcdFx0bGFzdFJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHBhcnNlZFJlcXVlc3QsXG5cdFx0XHRcdFx0bWVzc2FnZS52YXJpYWJsZURhdGEgPz8geyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdFx0MCwgLy8gYXR0ZW1wdFxuXHRcdFx0XHRcdG1vZGVJbmZvLFxuXHRcdFx0XHRcdGFnZW50LFxuXHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gc2xhc2hDb21tYW5kXG5cdFx0XHRcdFx0dW5kZWZpbmVkLCAvLyBjb25maXJtYXRpb25cblx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIGxvY2F0aW9uRGF0YVxuXHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gYXR0YWNobWVudHNcblx0XHRcdFx0XHRmYWxzZSwgLy8gRG8gbm90IHRyZWF0IGFzIHJlcXVlc3RzIGNvbXBsZXRlZCwgZWxzZSBlZGl0IHBpbGxzIHdvbid0IHNob3cuXG5cdFx0XHRcdFx0bWVzc2FnZS5tb2RlbElkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtZXNzYWdlLmlkLFxuXHRcdFx0XHRcdG1lc3NhZ2UuaXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0XHRcdFx0bWVzc2FnZS5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCxcblx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIHRlcm1pbmFsRXhlY3V0aW9uSWRcblx0XHRcdFx0XHRtZXNzYWdlLmlzVGVybWluYWxSZXF1ZXN0LFxuXHRcdFx0XHRcdG1lc3NhZ2UudGltZXN0YW1wID8/IG51bGwsXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyByZXNwb25zZVxuXHRcdFx0XHRpZiAobGFzdFJlcXVlc3QpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgbWVzc2FnZS5wYXJ0cykge1xuXHRcdFx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhsYXN0UmVxdWVzdCwgcGFydCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChsYXN0UmVxdWVzdC5yZXNwb25zZSAmJiAobWVzc2FnZS5kZXRhaWxzIHx8IG1lc3NhZ2UuZXJyb3JEZXRhaWxzKSkge1xuXHRcdFx0XHRcdFx0bGFzdFJlcXVlc3QucmVzcG9uc2Uuc2V0UmVzdWx0KHtcblx0XHRcdFx0XHRcdFx0Li4uKG1lc3NhZ2UuZGV0YWlscyA/IHsgZGV0YWlsczogbWVzc2FnZS5kZXRhaWxzIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRcdC4uLihtZXNzYWdlLmVycm9yRGV0YWlscyA/IHsgZXJyb3JEZXRhaWxzOiBtZXNzYWdlLmVycm9yRGV0YWlscyB9IDoge30pLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChsYXN0UmVxdWVzdC5yZXNwb25zZSAmJiB0eXBlb2YgbWVzc2FnZS5lbGFwc2VkTXMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRsYXN0UmVxdWVzdC5yZXNwb25zZS5zZXRFbGFwc2VkTXMobWVzc2FnZS5lbGFwc2VkTXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdCA9IG1lc3NhZ2UuY29tcGxldGVkQXQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXQgdXAgcHJvZ3Jlc3Mgc3RyZWFtaW5nIGFuZCBjYW5jZWxsYXRpb24gZm9yIGNvbnRyaWJ1dGVkIHNlc3Npb25zLlxuXHRcdC8vIFRoaXMgaGFuZGxlcyBib3RoIHRoZSBpbml0aWFsIGluLWZsaWdodCByZXNwb25zZSAoZnJvbSBzZXNzaW9uIGxvYWQpXG5cdFx0Ly8gYW5kIGFueSBzdWJzZXF1ZW50IHNlcnZlci1pbml0aWF0ZWQgdHVybnMgKGUuZy4gY29uc3VtZWQgcXVldWVkIG1lc3NhZ2VzKS5cblx0XHRjb25zdCBoYXNQcm9ncmVzc1N0cmVhbWluZyA9IHByb3ZpZGVkU2Vzc2lvbi5wcm9ncmVzc09icyAmJiBwcm92aWRlZFNlc3Npb24uaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjaztcblx0XHRpZiAoaGFzUHJvZ3Jlc3NTdHJlYW1pbmcpIHtcblx0XHRcdGxldCBsYXN0UHJvZ3Jlc3NMZW5ndGggPSAwO1xuXG5cdFx0XHRjb25zdCBjYW5jZWxsYXRpb25MaXN0ZW5lciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRjb25zdCBjcmVhdGVDYW5jZWxsYXRpb25MaXN0ZW5lciA9ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRwcm92aWRlZFNlc3Npb24uaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjaz8uKCkudGhlbih1c2VyQ29uZmlybWVkSW50ZXJydXB0aW9uID0+IHtcblx0XHRcdFx0XHRcdGlmICghdXNlckNvbmZpcm1lZEludGVycnVwdGlvbikge1xuXHRcdFx0XHRcdFx0XHR0cmFja05ld0NhbmNlbGxhYmxlUmVxdWVzdCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRyYWNrTmV3Q2FuY2VsbGFibGVSZXF1ZXN0ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjYW5jZWxsYWJsZVJlcXVlc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENhbmNlbGxhYmxlUmVxdWVzdCwgbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLl9zeW50aGV0aWNQZW5kaW5nUmVxdWVzdHMuYWRkKGNhbmNlbGxhYmxlUmVxdWVzdCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5zZXQobW9kZWwuc2Vzc2lvblJlc291cmNlLCBjYW5jZWxsYWJsZVJlcXVlc3QpO1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudCwgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50TmFtZSwgeyBhY3Rpb246ICdhZGQnLCBzb3VyY2U6ICdyZW1vdGVTZXNzaW9uJywgY2hhdFNlc3Npb25JZDogY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQobW9kZWwuc2Vzc2lvblJlc291cmNlKSB9KTtcblx0XHRcdFx0Y2FuY2VsbGF0aW9uTGlzdGVuZXIudmFsdWUgPSBjcmVhdGVDYW5jZWxsYXRpb25MaXN0ZW5lcihjYW5jZWxsYWJsZVJlcXVlc3QuY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZW5zdXJlQ2FuY2VsbGF0aW9uVHJhY2tpbmcgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmhhcyhtb2RlbC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dHJhY2tOZXdDYW5jZWxsYWJsZVJlcXVlc3QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGxhc3RSZXF1ZXN0ICYmICFwcm92aWRlZFNlc3Npb24uaXNDb21wbGV0ZU9icz8uZ2V0KCkpIHtcblx0XHRcdFx0dHJhY2tOZXdDYW5jZWxsYWJsZVJlcXVlc3QoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGFuZGxlIHNlcnZlci1pbml0aWF0ZWQgcmVxdWVzdHMgKGUuZy4gY29uc3VtZWQgcXVldWVkIG1lc3NhZ2VzKS5cblx0XHRcdGlmIChwcm92aWRlZFNlc3Npb24ub25EaWRTdGFydFNlcnZlclJlcXVlc3QpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVkU2Vzc2lvbi5vbkRpZFN0YXJ0U2VydmVyUmVxdWVzdCgoeyBpZCwgcHJvbXB0LCB2YXJpYWJsZURhdGEsIHRpbWVzdGFtcCwgaXNTeXN0ZW1Jbml0aWF0ZWQsIHN5c3RlbUluaXRpYXRlZExhYmVsLCBpc1Rlcm1pbmFsUmVxdWVzdCB9KSA9PiB7XG5cdFx0XHRcdFx0Ly8gQ29tcGxldGUgYW55IGluLWZsaWdodCByZXF1ZXN0XG5cdFx0XHRcdFx0aWYgKGxhc3RSZXF1ZXN0Py5yZXNwb25zZSAmJiAhbGFzdFJlcXVlc3QucmVzcG9uc2UuaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdFx0Y29tcGxldGVMYXN0UmVzcG9uc2UoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBDcmVhdGUgYSBuZXcgcmVxdWVzdCBpbiB0aGUgbW9kZWxcblx0XHRcdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSBwYXJzZUFnZW50SG9zdEhpc3RvcnlQcm9tcHQocHJvbXB0LCBhZ2VudCk7XG5cdFx0XHRcdFx0bGFzdFJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHBhcnNlZFJlcXVlc3QsXG5cdFx0XHRcdFx0XHR2YXJpYWJsZURhdGEgPz8geyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdFx0XHQwLCAvLyBhdHRlbXB0XG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIG1vZGVJbmZvXG5cdFx0XHRcdFx0XHRhZ2VudCxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gc2xhc2hDb21tYW5kXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIGNvbmZpcm1hdGlvblxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLCAvLyBsb2NhdGlvbkRhdGFcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gYXR0YWNobWVudHNcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gaXNDb21wbGV0ZUFkZGVkUmVxdWVzdFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLCAvLyBtb2RlbElkXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIHVzZXJTZWxlY3RlZFRvb2xzXG5cdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkLFxuXHRcdFx0XHRcdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWwsXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIHRlcm1pbmFsRXhlY3V0aW9uSWRcblx0XHRcdFx0XHRcdGlzVGVybWluYWxSZXF1ZXN0LFxuXHRcdFx0XHRcdFx0dGltZXN0YW1wLFxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHQvLyBSZXNldCBwcm9ncmVzcyB0cmFja2luZyBmb3IgdGhlIG5ldyB0dXJuXG5cdFx0XHRcdFx0bGFzdFByb2dyZXNzTGVuZ3RoID0gMDtcblxuXHRcdFx0XHRcdC8vIEVuc3VyZSBjYW5jZWxsYXRpb24gdHJhY2tpbmcgaXMgYWN0aXZlXG5cdFx0XHRcdFx0ZW5zdXJlQ2FuY2VsbGF0aW9uVHJhY2tpbmcoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNaWQtdHVybiBzdGVlcmluZyBmb3Igc3RyZWFtZWQgc2Vzc2lvbnM6IGRpc3BhdGNoIGEgcXVldWVkIFN0ZWVyaW5nIG1lc3NhZ2UgaW1tZWRpYXRlbHlcblx0XHRcdC8vICh0aGUgcHJvdmlkZXIgUE9TVHMgaXQgc2VydmVyLXNpZGUpIHJhdGhlciB0aGFuIHdhaXRpbmcgZm9yIHRoZSB0dXJuIHRvIGNvbXBsZXRlLCBidXQgb25seVxuXHRcdFx0Ly8gd2hlbiB0aGUgaW4tZmxpZ2h0IHJlcXVlc3QgaXMgdGhlIHN5bnRoZXRpYyBzdHJlYW1lZC10dXJuIHRyYWNrZXIgKG9yIG5vbmUpLCBuZXZlciBhIHJlYWxcblx0XHRcdC8vIHJlcXVlc3QuIFNlcnZlci1tYW5hZ2VkIChhZ2VudC1ob3N0KSBxdWV1ZXMgYXJlIGRyYWluZWQgYnkgdGhlIHNlcnZlciwgc28gdGhleSdyZSBleGNsdWRlZC5cblx0XHRcdGlmICghdGhpcy5faXNTZXJ2ZXJNYW5hZ2VkUXVldWUobW9kZWwuc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRsZXQgZGlzcGF0Y2hpbmdJbW1lZGlhdGVTdGVlciA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBjYW5JbW1lZGlhdGVseURpc3BhdGNoID0gKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkuc29tZShyID0+IHIua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0cmV0dXJuICFwZW5kaW5nIHx8IHRoaXMuX3N5bnRoZXRpY1BlbmRpbmdSZXF1ZXN0cy5oYXMocGVuZGluZyk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cygoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGRpc3BhdGNoaW5nSW1tZWRpYXRlU3RlZXIgfHwgIWNhbkltbWVkaWF0ZWx5RGlzcGF0Y2goKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkaXNwYXRjaGluZ0ltbWVkaWF0ZVN0ZWVyID0gdHJ1ZTtcblx0XHRcdFx0XHQvLyBEZWZlciBwYXN0IHRoZSBpbi1wcm9ncmVzcyBhZGRQZW5kaW5nUmVxdWVzdCBtdXRhdGlvbiB0byBhdm9pZCByZS1lbnRyYW5jeS5cblx0XHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdFx0XHRkaXNwYXRjaGluZ0ltbWVkaWF0ZVN0ZWVyID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQobW9kZWwuc2Vzc2lvblJlc291cmNlKSAhPT0gbW9kZWwgfHwgIWNhbkltbWVkaWF0ZWx5RGlzcGF0Y2goKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBSZWxlYXNlIHRoZSBzeW50aGV0aWMgdHJhY2tlciBzbyB0aGUgcXVldWUgcHJvY2Vzc29yIGNhbiBydW4sIHRoZW4gZGlzcGF0Y2guXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcGVuZGluZ1JlcXVlc3RzLmhhcyhtb2RlbC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5kZWxldGVBbmREaXNwb3NlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLnByb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QobW9kZWwpO1xuXHRcdFx0XHRcdFx0Ly8gUmVzdG9yZSB0cmFja2luZyB3aGVuIHRoZSBkaXNwYXRjaGVkIHJlcXVlc3Qgc2V0dGxlcyAoc3RyZWFtIHN0aWxsIGFjdGl2ZSkuXG5cdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSk/LnJlc3BvbnNlQ29tcGxldGVQcm9taXNlPy5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSkgPT09IG1vZGVsICYmICEocHJvdmlkZWRTZXNzaW9uLmlzQ29tcGxldGVPYnM/LmdldCgpID8/IGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0XHRcdGVuc3VyZUNhbmNlbGxhdGlvblRyYWNraW5nKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNpbmdsZSBhdXRvcnVuIHRoYXQgc3RyZWFtcyBwcm9ncmVzcyBmb3Igd2hpY2hldmVyIHJlcXVlc3QgaXMgY3VycmVudC5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb2dyZXNzQXJyYXkgPSBwcm92aWRlZFNlc3Npb24ucHJvZ3Jlc3NPYnM/LnJlYWQocmVhZGVyKSA/PyBbXTtcblx0XHRcdFx0Y29uc3QgaXNDb21wbGV0ZSA9IHByb3ZpZGVkU2Vzc2lvbi5pc0NvbXBsZXRlT2JzPy5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cblx0XHRcdFx0Ly8gQmFja3N0b3A6IGtlZXAgdGhlIHN0cmVhbWVkIHR1cm4gdHJhY2tlZCBhcyBpbi1wcm9ncmVzcyBhY3Jvc3MgaW1tZWRpYXRlLXN0ZWVyIGRpc3BhdGNoZXMuXG5cdFx0XHRcdGlmICghaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdGVuc3VyZUNhbmNlbGxhdGlvblRyYWNraW5nKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBQcm9jZXNzIG9ubHkgbmV3IHByb2dyZXNzIGl0ZW1zXG5cdFx0XHRcdGlmIChsYXN0UmVxdWVzdCAmJiBwcm9ncmVzc0FycmF5Lmxlbmd0aCA+IGxhc3RQcm9ncmVzc0xlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld1Byb2dyZXNzID0gcHJvZ3Jlc3NBcnJheS5zbGljZShsYXN0UHJvZ3Jlc3NMZW5ndGgpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcHJvZ3Jlc3Mgb2YgbmV3UHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdG1vZGVsPy5hY2NlcHRSZXNwb25zZVByb2dyZXNzKGxhc3RSZXF1ZXN0LCBwcm9ncmVzcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxhc3RQcm9ncmVzc0xlbmd0aCA9IHByb2dyZXNzQXJyYXkubGVuZ3RoO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSGFuZGxlIGNvbXBsZXRpb25cblx0XHRcdFx0aWYgKGlzQ29tcGxldGUgJiYgbGFzdFJlcXVlc3QpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlQW5kRGlzcG9zZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNhbmNlbGxhdGlvbkxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHRcdFx0Y29tcGxldGVMYXN0UmVzcG9uc2UoKTtcblx0XHRcdFx0XHQvLyBGbHVzaCBhbnkgbWVzc2FnZSBxdWV1ZWQvc3RlZXJlZCBkdXJpbmcgdGhlIHN0cmVhbWVkIHR1cm4gKG5vLW9wIGlmIG5vbmUsIG9yIHNlcnZlci1tYW5hZ2VkKS5cblx0XHRcdFx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVxdWVzdHMobW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAocHJvdmlkZWRTZXNzaW9uLmlzQ29tcGxldGVPYnM/LmdldCgpKSB7XG5cdFx0XHRcdGNvbXBsZXRlTGFzdFJlc3BvbnNlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VDbGFzc2lmaWNhdGlvbj4oQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnROYW1lLCB7IGFjdGlvbjogJ25vdENhbmNlbGFibGUnLCBzb3VyY2U6ICdyZW1vdGVTZXNzaW9uJywgY2hhdFNlc3Npb25JZDogY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQobW9kZWwuc2Vzc2lvblJlc291cmNlKSB9KTtcblx0XHRcdGlmIChsYXN0UmVxdWVzdCAmJiBtb2RlbC5lZGl0aW5nU2Vzc2lvbikge1xuXHRcdFx0XHQvLyB3YWl0IGZvciB0aW1lbGluZSB0byBsb2FkIHNvIHRoYXQgYSAnY2hhbmdlcycgcGFydCBpcyBhZGRlZCB3aGVuIHRoZSByZXNwb25zZSBjb21wbGV0ZXNcblx0XHRcdFx0YXdhaXQgY2hhdEVkaXRpbmdTZXNzaW9uSXNSZWFkeShtb2RlbC5lZGl0aW5nU2Vzc2lvbik7XG5cdFx0XHRcdGNvbXBsZXRlTGFzdFJlc3BvbnNlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsUmVmO1xuXHR9XG5cblx0YXN5bmMgcmVzZW5kUmVxdWVzdChyZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCwgb3B0aW9ucz86IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChyZXF1ZXN0LnNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsICYmIG1vZGVsICE9PSByZXF1ZXN0LnNlc3Npb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBzZXNzaW9uOiAke3JlcXVlc3Quc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5pc1JlYWRPbmx5LmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3RzID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChyZXF1ZXN0LnNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoY3RzKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdyZXNlbmRSZXF1ZXN0JywgYFNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb24uc2Vzc2lvblJlc291cmNlfSBhbHJlYWR5IGhhcyBhIHBlbmRpbmcgcmVxdWVzdCwgY2FuY2VsbGluZy4uLmApO1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9uID0gb3B0aW9ucz8ubG9jYXRpb24gPz8gbW9kZWwuaW5pdGlhbExvY2F0aW9uO1xuXHRcdGNvbnN0IGF0dGVtcHQgPSBvcHRpb25zPy5hdHRlbXB0ID8/IDA7XG5cdFx0Y29uc3QgZW5hYmxlQ29tbWFuZERldGVjdGlvbiA9ICFvcHRpb25zPy5ub0NvbW1hbmREZXRlY3Rpb247XG5cdFx0Y29uc3QgZGVmYXVsdEFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChsb2NhdGlvbiwgb3B0aW9ucz8ubW9kZUluZm8/LmtpbmQpITtcblxuXHRcdG1vZGVsLnJlbW92ZVJlcXVlc3QocmVxdWVzdC5pZCwgQ2hhdFJlcXVlc3RSZW1vdmFsUmVhc29uLlJlc2VuZCk7XG5cblx0XHRjb25zdCByZXNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRsb2NhdGlvbkRhdGE6IHJlcXVlc3QubG9jYXRpb25EYXRhLFxuXHRcdFx0YXR0YWNoZWRDb250ZXh0OiByZXF1ZXN0LmF0dGFjaGVkQ29udGV4dCxcblx0XHR9O1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0QXN5bmMobW9kZWwsIG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdC5tZXNzYWdlLCBhdHRlbXB0LCBlbmFibGVDb21tYW5kRGV0ZWN0aW9uLCBkZWZhdWx0QWdlbnQsIGxvY2F0aW9uLCByZXNlbmRPcHRpb25zKS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgcXVldWVQZW5kaW5nUmVxdWVzdChtb2RlbDogQ2hhdE1vZGVsLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdDogc3RyaW5nLCBvcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyk6IENoYXRTZW5kUmVzdWx0UXVldWVkIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IG9wdGlvbnMubG9jYXRpb24gPz8gbW9kZWwuaW5pdGlhbExvY2F0aW9uO1xuXHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB0aGlzLnBhcnNlQ2hhdFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0LCBsb2NhdGlvbiwgb3B0aW9ucyk7XG5cdFx0Y29uc3QgcmVxdWVzdE1vZGVsID0gbmV3IENoYXRSZXF1ZXN0TW9kZWwoe1xuXHRcdFx0c2Vzc2lvbjogbW9kZWwsXG5cdFx0XHRtZXNzYWdlOiBwYXJzZWRSZXF1ZXN0LFxuXHRcdFx0dmFyaWFibGVEYXRhOiB7IHZhcmlhYmxlczogb3B0aW9ucy5hdHRhY2hlZENvbnRleHQgPz8gW10gfSxcblx0XHRcdHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcblx0XHRcdG1vZGVJbmZvOiBvcHRpb25zLm1vZGVJbmZvLFxuXHRcdFx0bG9jYXRpb25EYXRhOiBvcHRpb25zLmxvY2F0aW9uRGF0YSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dDogb3B0aW9ucy5hdHRhY2hlZENvbnRleHQsXG5cdFx0XHRtb2RlbElkOiBvcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsSWQsXG5cdFx0XHR1c2VyU2VsZWN0ZWRUb29sczogb3B0aW9ucy51c2VyU2VsZWN0ZWRUb29scz8uZ2V0KCksXG5cdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogb3B0aW9ucy5pc1N5c3RlbUluaXRpYXRlZCxcblx0XHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiBvcHRpb25zLnN5c3RlbUluaXRpYXRlZExhYmVsLFxuXHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogb3B0aW9ucy50ZXJtaW5hbEV4ZWN1dGlvbklkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPENoYXRTZW5kUmVzdWx0PigpO1xuXHRcdHRoaXMuX3F1ZXVlZFJlcXVlc3REZWZlcnJlZHMuc2V0KHJlcXVlc3RNb2RlbC5pZCwgZGVmZXJyZWQpO1xuXG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdE1vZGVsLCBvcHRpb25zLnF1ZXVlID8/IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwgeyAuLi5vcHRpb25zLCBxdWV1ZTogdW5kZWZpbmVkIH0pO1xuXG5cdFx0aWYgKG9wdGlvbnMucXVldWUgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHR0aGlzLnNldFlpZWxkUmVxdWVzdGVkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZSgnc2VuZFJlcXVlc3QnLCBgUXVldWVkIG1lc3NhZ2UgZm9yIHNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0cmV0dXJuIHsga2luZDogJ3F1ZXVlZCcsIGRlZmVycmVkOiBkZWZlcnJlZC5wIH07XG5cdH1cblxuXHRhc3luYyBzZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdDogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiB7XG5cdFx0dGhpcy50cmFjZSgnc2VuZFJlcXVlc3QnLCBgc2Vzc2lvblJlc291cmNlOiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSwgbWVzc2FnZTogJHtyZXF1ZXN0LnN1YnN0cmluZygwLCAyMCl9JHtyZXF1ZXN0Lmxlbmd0aCA+IDIwID8gJ1suLi5dJyA6ICcnfX1gKTtcblxuXHRcdGNvbnN0IGhhc0V4cGxpY2l0RmlsZU9ySW1hZ2VBdHRhY2htZW50ID0gWy4uLihvcHRpb25zPy5hdHRhY2hlZENvbnRleHQgPz8gW10pLCAuLi4ob3B0aW9ucz8ucmVzb2x2ZWRWYXJpYWJsZXMgPz8gW10pXS5zb21lKGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnkpO1xuXHRcdGlmICghcmVxdWVzdC50cmltKCkgJiYgIWhhc0V4cGxpY2l0RmlsZU9ySW1hZ2VBdHRhY2htZW50ICYmICFvcHRpb25zPy5zbGFzaENvbW1hbmQgJiYgIW9wdGlvbnM/LmFnZW50SWQgJiYgIW9wdGlvbnM/LmFnZW50SWRTaWxlbnQpIHtcblx0XHRcdHRoaXMudHJhY2UoJ3NlbmRSZXF1ZXN0JywgJ1JlamVjdGVkIGVtcHR5IG1lc3NhZ2UnKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ0VtcHR5IG1lc3NhZ2UnIH07XG5cdFx0fVxuXG5cdFx0bGV0IG5ld1Nlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQSBsYXRlIHNlbmQgbWF5IGFycml2ZSBvbiBhIHN0YWxlIHVudGl0bGVkIHJlc291cmNlIGFmdGVyIGl0IGFscmVhZHlcblx0XHQvLyBtYXRlcmlhbGl6ZWQgaW50byBhIHJlYWwgc2Vzc2lvbiBidXQgYmVmb3JlIHRoZSBVSSBzd2FwcGVkIHRvIHRoZSByZWFsXG5cdFx0Ly8gcmVzb3VyY2UuIFJlLXRhcmdldCB0byB0aGUgcmVhbCByZXNvdXJjZSBzbyB3ZSBkb24ndCBtYXRlcmlhbGl6ZSBhXG5cdFx0Ly8gc2Vjb25kIHNlc3Npb24sIGFuZCByZXBvcnQgaXQgYXMgYSBuZXcgc2Vzc2lvbiBzbyB0aGUgY2FsbGVyIHN3YXBzIGl0c1xuXHRcdC8vIFVJIGZyb20gdGhlIHVudGl0bGVkIHJlc291cmNlIHRvIHRoZSByZWFsIG9uZSAobWlycm9yaW5nIHRoZSBmaXJzdCBzZW5kKS5cblx0XHRjb25zdCBtYXRlcmlhbGl6ZWRSZWFsID0gdGhpcy5jaGF0U2Vzc2lvblNlcnZpY2UuZ2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKG1hdGVyaWFsaXplZFJlYWwpIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IG1hdGVyaWFsaXplZFJlYWw7XG5cdFx0XHRuZXdTZXNzaW9uUmVzb3VyY2UgPSBtYXRlcmlhbGl6ZWRSZWFsO1xuXHRcdH1cblxuXHRcdGxldCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHNlc3Npb246ICR7c2Vzc2lvblJlc291cmNlfWApO1xuXHRcdH1cblx0XHRpZiAobW9kZWwuaXNSZWFkT25seS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ3JlamVjdGVkJyxcblx0XHRcdFx0cmVhc29uOiAnU2Vzc2lvbiBpcyByZWFkLW9ubHknLFxuXHRcdFx0XHQuLi4obmV3U2Vzc2lvblJlc291cmNlID8geyBuZXdTZXNzaW9uUmVzb3VyY2UgfSA6IHt9KSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gSW50ZXJuYWxseSBibGFuayB3aWRnZXRzIHVzZSBzcGVjaWFsIHNlc3Npb25zIHdpdGggYW4gdW50aXRsZWQtIHBhdGguXG5cdFx0Ly8gV2UgZG8gbm90IHdhbnQgdGhlc2UgbGVha2luZyBvdXQgdG8gdGhlIHJlc3Qgb2YgY29kZS4gT24gdGhlIGZpcnN0XG5cdFx0Ly8gc2VuZCwgY29udmVydCB0aGUgdW50aXRsZWQgc2Vzc2lvbiBpbnRvIGEgcmVhbCBzZXNzaW9uIChpZGVtcG90ZW50XG5cdFx0Ly8gYW5kIHNlcmlhbGl6ZWQgcGVyIHVudGl0bGVkIHJlc291cmNlIFx1MjAxNCBzZWVcblx0XHQvLyBgX21hdGVyaWFsaXplVW50aXRsZWRTZXNzaW9uYCkgYmVmb3JlIHByb2Nlc3NpbmcgdGhlIHJlcXVlc3QuXG5cdFx0aWYgKCFtb2RlbC5oYXNSZXF1ZXN0cyAmJiBpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSAmJiBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdGNvbnN0IG1hdGVyaWFsaXplZCA9IGF3YWl0IHRoaXMuX21hdGVyaWFsaXplVW50aXRsZWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdCwgb3B0aW9ucywgbW9kZWwpO1xuXHRcdFx0aWYgKG1hdGVyaWFsaXplZCkge1xuXHRcdFx0XHRtb2RlbCA9IG1hdGVyaWFsaXplZC5tb2RlbDtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlID0gbWF0ZXJpYWxpemVkLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0bmV3U2Vzc2lvblJlc291cmNlID0gbWF0ZXJpYWxpemVkLm5ld1Nlc3Npb25SZXNvdXJjZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG1vZGVsLmlzUmVhZE9ubHkuZ2V0KCkpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ1Nlc3Npb24gaXMgcmVhZC1vbmx5JywgbmV3U2Vzc2lvblJlc291cmNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzUGVuZGluZ1JlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuaGFzKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRpZiAob3B0aW9ucz8ucXVldWUpIHtcblx0XHRcdGNvbnN0IHF1ZXVlZCA9IHRoaXMucXVldWVQZW5kaW5nUmVxdWVzdChtb2RlbCwgc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0LCBvcHRpb25zKTtcblx0XHRcdGlmICghb3B0aW9ucy5wYXVzZVF1ZXVlKSB7XG5cdFx0XHRcdHRoaXMucHJvY2Vzc1BlbmRpbmdSZXF1ZXN0cyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHF1ZXVlZDtcblx0XHR9IGVsc2UgaWYgKGhhc1BlbmRpbmdSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBTZXNzaW9uICR7c2Vzc2lvblJlc291cmNlfSBhbHJlYWR5IGhhcyBhIHBlbmRpbmcgcmVxdWVzdGApO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uOiAnUmVxdWVzdCBhbHJlYWR5IGluIHByb2dyZXNzJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRmb3IgKGxldCBpID0gcmVxdWVzdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpIC09IDEpIHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSByZXF1ZXN0c1tpXTtcblx0XHRcdGlmIChyZXF1ZXN0LnNob3VsZEJlUmVtb3ZlZE9uU2VuZCkge1xuXHRcdFx0XHRpZiAocmVxdWVzdC5zaG91bGRCZVJlbW92ZWRPblNlbmQuYWZ0ZXJVbmRvU3RvcCkge1xuXHRcdFx0XHRcdHJlcXVlc3QucmVzcG9uc2U/LmZpbmFsaXplVW5kb1N0YXRlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZW1vdmVSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IG9wdGlvbnM/LmxvY2F0aW9uID8/IG1vZGVsLmluaXRpYWxMb2NhdGlvbjtcblx0XHRjb25zdCBhdHRlbXB0ID0gb3B0aW9ucz8uYXR0ZW1wdCA/PyAwO1xuXHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQobG9jYXRpb24sIG9wdGlvbnM/Lm1vZGVJbmZvPy5raW5kKTtcblx0XHRpZiAoIWRlZmF1bHRBZ2VudCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3NlbmRSZXF1ZXN0JywgYE5vIGRlZmF1bHQgYWdlbnQgZm9yIGxvY2F0aW9uICR7bG9jYXRpb259YCk7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICdObyBkZWZhdWx0IGFnZW50IGF2YWlsYWJsZScgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdGhpcy5wYXJzZUNoYXRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdCwgbG9jYXRpb24sIG9wdGlvbnMpO1xuXHRcdGNvbnN0IHNpbGVudEFnZW50ID0gb3B0aW9ucz8uYWdlbnRJZFNpbGVudCA/IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChvcHRpb25zLmFnZW50SWRTaWxlbnQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFnZW50ID0gc2lsZW50QWdlbnQgPz8gcGFyc2VkUmVxdWVzdC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdEFnZW50UGFydCA9PiByIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpPy5hZ2VudCA/PyBkZWZhdWx0QWdlbnQ7XG5cdFx0Y29uc3QgYWdlbnRTbGFzaENvbW1hbmRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQgPT4gciBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCk7XG5cblx0XHQvLyBUaGlzIG1ldGhvZCBpcyBvbmx5IHJldHVybmluZyB3aGV0aGVyIHRoZSByZXF1ZXN0IHdhcyBhY2NlcHRlZCAtIGRvbid0IGJsb2NrIG9uIHRoZSBhY3R1YWwgcmVxdWVzdFxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnc2VudCcsXG5cdFx0XHRuZXdTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdC4uLnRoaXMuX3NlbmRSZXF1ZXN0QXN5bmMobW9kZWwsIHNlc3Npb25SZXNvdXJjZSwgcGFyc2VkUmVxdWVzdCwgYXR0ZW1wdCwgIW9wdGlvbnM/Lm5vQ29tbWFuZERldGVjdGlvbiwgc2lsZW50QWdlbnQgPz8gZGVmYXVsdEFnZW50LCBsb2NhdGlvbiwgb3B0aW9ucyksXG5cdFx0XHRcdGFnZW50LFxuXHRcdFx0XHRzbGFzaENvbW1hbmQ6IGFnZW50U2xhc2hDb21tYW5kUGFydD8uY29tbWFuZCxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhbiB1bnRpdGxlZCBjb250cmlidXRlZCBjaGF0IHNlc3Npb24gaW50byBpdHMgcmVhbCBzZXNzaW9uIG9uIHRoZVxuXHQgKiBmaXJzdCBzZW5kIGFuZCByZXR1cm5zIHRoZSByZWFsIG1vZGVsL3Jlc291cmNlIHNvIHRoZSBjYWxsZXIgY2FuIHJlLXRhcmdldFxuXHQgKiB0aGUgcmVxdWVzdC4gU2VyaWFsaXplZCBwZXIgdW50aXRsZWQgcmVzb3VyY2U6IGEgZmlyc3Qgc2VuZCBzdG9yZXMgYW5cblx0ICogaW4tZmxpZ2h0IHByb21pc2UsIGFuZCBhIGNvbmN1cnJlbnQgc2Vjb25kIHNlbmQgYXdhaXRzIGl0IGFuZCBjb252ZXJnZXMgb25cblx0ICogdGhlIHNhbWUgcmVhbCBzZXNzaW9uICh3aGVyZSB0aGUgY2FsbGVyJ3MgcGVuZGluZy1yZXF1ZXN0IGNoZWNrIHRoZW4gcmVqZWN0c1xuXHQgKiB0aGUgZHVwbGljYXRlKSBpbnN0ZWFkIG9mIG1pbnRpbmcgYSBzZWNvbmQgcmVhbCBzZXNzaW9uLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm8gY29udmVyc2lvbiBoYXBwZW5lZCBcdTIwMTQgZWl0aGVyIHRoZXJlIGlzIG5vXG5cdCAqIGBuZXdDaGF0U2Vzc2lvbkl0ZW1gIGhhbmRsZXIgLyB0aGUgaGFuZGxlciBkZWNsaW5lZCwgb3IgYSBjb25jdXJyZW50XG5cdCAqIG1hdGVyaWFsaXphdGlvbiBmYWlsZWQgXHUyMDE0IGluIHdoaWNoIGNhc2UgdGhlIGNhbGxlciBrZWVwcyB1c2luZyB0aGUgdW50aXRsZWRcblx0ICogc2Vzc2lvbiAodGhlIG9yaWdpbmFsIGJlaGF2aW9yKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21hdGVyaWFsaXplVW50aXRsZWRTZXNzaW9uKHVudGl0bGVkUmVzb3VyY2U6IFVSSSwgcmVxdWVzdDogc3RyaW5nLCBvcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyB8IHVuZGVmaW5lZCwgdW50aXRsZWRNb2RlbDogQ2hhdE1vZGVsKTogUHJvbWlzZTx7IG1vZGVsOiBDaGF0TW9kZWw7IHNlc3Npb25SZXNvdXJjZTogVVJJOyBuZXdTZXNzaW9uUmVzb3VyY2U6IFVSSSB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaW5GbGlnaHQgPSB0aGlzLl9pbkZsaWdodFVudGl0bGVkTWF0ZXJpYWxpemF0aW9ucy5nZXQodW50aXRsZWRSZXNvdXJjZSk7XG5cdFx0aWYgKGluRmxpZ2h0KSB7XG5cdFx0XHQvLyBBIGNvbmN1cnJlbnQgc2VuZCBpcyBhbHJlYWR5IG1hdGVyaWFsaXppbmcgdGhpcyB1bnRpdGxlZCBzZXNzaW9uLlxuXHRcdFx0Ly8gQXdhaXQgaXRzIHJlc3VsdCBhbmQgcmUtdGFyZ2V0IHRoZSByZXN1bHRpbmcgcmVhbCByZXNvdXJjZSBpbnN0ZWFkIG9mXG5cdFx0XHQvLyBtaW50aW5nIGEgc2Vjb25kIHJlYWwgc2Vzc2lvbi5cblx0XHRcdGNvbnN0IHJlYWxSZXNvdXJjZSA9IGF3YWl0IGluRmxpZ2h0O1xuXHRcdFx0aWYgKCFyZWFsUmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy50cmFjZSgnbWF0ZXJpYWxpemVVbnRpdGxlZFNlc3Npb24nLCBgSW4tZmxpZ2h0IG1hdGVyaWFsaXphdGlvbiBvZiAke3VudGl0bGVkUmVzb3VyY2UudG9TdHJpbmcoKX0gcHJvZHVjZWQgbm8gcmVhbCBzZXNzaW9uOyBrZWVwaW5nIHVudGl0bGVkYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgd2lubmVyIGhhcyBhbHJlYWR5IGxvYWRlZCB0aGUgcmVhbCBtb2RlbCBhbmQgcmV0YWlucyBhIHJlZmVyZW5jZVxuXHRcdFx0Ly8gdG8gaXQsIHNvIGxvb2sgaXQgdXAgd2l0aG91dCBhY3F1aXJpbmcgKGFuZCBsZWFraW5nKSBhbiBhZGRpdGlvbmFsXG5cdFx0XHQvLyByZWZlcmVuY2UgcGVyIGNvbmN1cnJlbnQgc2VuZC5cblx0XHRcdGNvbnN0IHJlYWxNb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHJlYWxSZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXJlYWxNb2RlbCkge1xuXHRcdFx0XHR0aGlzLmluZm8oJ21hdGVyaWFsaXplVW50aXRsZWRTZXNzaW9uJywgYEpvaW5lZCBpbi1mbGlnaHQgbWF0ZXJpYWxpemF0aW9uIG9mICR7dW50aXRsZWRSZXNvdXJjZS50b1N0cmluZygpfSBidXQgcmVhbCBtb2RlbCAke3JlYWxSZXNvdXJjZS50b1N0cmluZygpfSBpcyBtaXNzaW5nOyBrZWVwaW5nIHVudGl0bGVkYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRyYWNlKCdtYXRlcmlhbGl6ZVVudGl0bGVkU2Vzc2lvbicsIGBDb25jdXJyZW50IHNlbmQgam9pbmVkIGluLWZsaWdodCBtYXRlcmlhbGl6YXRpb24gJHt1bnRpdGxlZFJlc291cmNlLnRvU3RyaW5nKCl9IC0+ICR7cmVhbFJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm4geyBtb2RlbDogcmVhbE1vZGVsLCBzZXNzaW9uUmVzb3VyY2U6IHJlYWxSZXNvdXJjZSwgbmV3U2Vzc2lvblJlc291cmNlOiByZWFsUmVzb3VyY2UgfTtcblx0XHR9XG5cblx0XHQvLyBUcmFjayB0aGUgbWF0ZXJpYWxpemF0aW9uIGluLWZsaWdodCAoa2V5ZWQgYnkgdGhlIG9yaWdpbmFsIHVudGl0bGVkXG5cdFx0Ly8gcmVzb3VyY2UpIHNvIGEgY29uY3VycmVudCBzZWNvbmQgc2VuZCBqb2lucyB0aGlzIG9uZSByYXRoZXIgdGhhbiBjcmVhdGluZ1xuXHRcdC8vIGEgZHVwbGljYXRlIHJlYWwgc2Vzc2lvbi4gU3RvcmUgc3luY2hyb25vdXNseSwgYmVmb3JlIGFueSBhd2FpdCwgc28gYVxuXHRcdC8vIGNvbmN1cnJlbnQgc2VuZCByZWxpYWJseSBvYnNlcnZlcyB0aGUgaW4tZmxpZ2h0IG1hdGVyaWFsaXphdGlvbi5cblx0XHRjb25zdCBtYXRlcmlhbGl6ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4oKTtcblx0XHR0aGlzLl9pbkZsaWdodFVudGl0bGVkTWF0ZXJpYWxpemF0aW9ucy5zZXQodW50aXRsZWRSZXNvdXJjZSwgbWF0ZXJpYWxpemVkLnApO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdGhpcy5wYXJzZUNoYXRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsIHJlcXVlc3QsIG9wdGlvbnM/LmxvY2F0aW9uID8/IHVudGl0bGVkTW9kZWwuaW5pdGlhbExvY2F0aW9uLCBvcHRpb25zKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQgPT4gciBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydCk7XG5cdFx0XHRjb25zdCByZXF1ZXN0VGV4dCA9IGdldFByb21wdFRleHQocGFyc2VkUmVxdWVzdCkubWVzc2FnZTtcblxuXHRcdFx0Ly8gU25hcHNob3QgdGhlIHVudGl0bGVkIHNlc3Npb24ncyBvcHRpb25zIHVwIGZyb250OiB0aGV5IHNlZWRcblx0XHRcdC8vIGBjcmVhdGVOZXdDaGF0U2Vzc2lvbkl0ZW1gIGJlbG93IGFuZCBhcmUgcHVzaGVkIG9udG8gdGhlIHJlYWwgc2Vzc2lvblxuXHRcdFx0Ly8gb25jZSBpdCBsb2Fkcy4gQ2FwdHVyaW5nIGJlZm9yZSB0aG9zZSBzdGVwcyBhdm9pZHMgcmVhZGluZyB0aGVtIGJhY2tcblx0XHRcdC8vIGFmdGVyIHRoZSB1bnRpdGxlZCBlbnRyeSBtYXkgaGF2ZSBjaGFuZ2VkIGR1cmluZyBtYXRlcmlhbGl6YXRpb24uXG5cdFx0XHRjb25zdCBpbml0aWFsU2Vzc2lvbk9wdGlvbnMgPSB0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5nZXRTZXNzaW9uT3B0aW9ucyh1bnRpdGxlZFJlc291cmNlKTtcblxuXHRcdFx0Y29uc3QgbmV3SXRlbSA9IGF3YWl0IHRoaXMuY2hhdFNlc3Npb25TZXJ2aWNlLmNyZWF0ZU5ld0NoYXRTZXNzaW9uSXRlbShnZXRDaGF0U2Vzc2lvblR5cGUodW50aXRsZWRSZXNvdXJjZSksIHsgcHJvbXB0OiByZXF1ZXN0VGV4dCwgY29tbWFuZDogY29tbWFuZFBhcnQ/LnRleHQsIGluaXRpYWxTZXNzaW9uT3B0aW9ucywgdW50aXRsZWRSZXNvdXJjZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmICghbmV3SXRlbSkge1xuXHRcdFx0XHRtYXRlcmlhbGl6ZWQuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVnaXN0ZXIgdGhlIGludmVyc2UgYWxpYXMgYmVmb3JlIGxvYWRpbmcgc28gc2Vzc2lvbi1vcHRpb24gbG9va3Vwc1xuXHRcdFx0Ly8gZm9yIHRoZSBuZXcgcmVzb3VyY2UgcmVzb2x2ZSB0byB0aGUgdW50aXRsZWQgc2Vzc2lvbidzIG9wdGlvbnMuXG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5yZWdpc3RlclNlc3Npb25SZXNvdXJjZUFsaWFzKHVudGl0bGVkUmVzb3VyY2UsIG5ld0l0ZW0ucmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBEbyBub3QgZGlzcG9zZSB0ZW1wUmVmIGFzIHBlciA2YmM1YWU4MGRlOWNhZmZiMjFlOWViNThlMThiNWNhMjRmYTJkNmU4XG5cdFx0XHRjb25zdCB0ZW1wUmVmID0gYXdhaXQgdGhpcy5sb2FkUmVtb3RlU2Vzc2lvbihuZXdJdGVtLnJlc291cmNlLCB1bnRpdGxlZE1vZGVsLmluaXRpYWxMb2NhdGlvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCByZWFsTW9kZWwgPSB0ZW1wUmVmPy5vYmplY3QgYXMgQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFyZWFsTW9kZWwpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBzZXNzaW9uIGZvciByZXNvdXJjZTogJHtuZXdJdGVtLnJlc291cmNlfWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgdGhlIG5ldyBtb2RlbCdzIGNvbnRyaWJ1dGVkIHNlc3Npb24gd2l0aCBpbml0aWFsU2Vzc2lvbk9wdGlvbnNcblx0XHRcdC8vIHNvIHRoYXQgdGhlIGFnZW50IHJlY2VpdmVzIHRoZW0gd2hlbiBpbnZva2VkLlxuXHRcdFx0aWYgKGluaXRpYWxTZXNzaW9uT3B0aW9ucykge1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uU2VydmljZS51cGRhdGVTZXNzaW9uT3B0aW9ucyhyZWFsTW9kZWwuc2Vzc2lvblJlc291cmNlLCBpbml0aWFsU2Vzc2lvbk9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQdWJsaXNoIHRoZSBmb3J3YXJkIG1hcHBpbmcgb25seSBhZnRlciBhIHN1Y2Nlc3NmdWwgbG9hZCAoc2VlXG5cdFx0XHQvLyBgc2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlYCkuXG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5zZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWRSZXNvdXJjZSwgbmV3SXRlbS5yZXNvdXJjZSk7XG5cdFx0XHRtYXRlcmlhbGl6ZWQuY29tcGxldGUobmV3SXRlbS5yZXNvdXJjZSk7XG5cdFx0XHQvLyBJZiB0aGlzIGV2ZXIgbG9ncyB0d2ljZSBmb3IgdGhlXG5cdFx0XHQvLyBzYW1lIHVudGl0bGVkIHJlc291cmNlIChkaWZmZXJlbnQgcmVhbCByZXNvdXJjZXMpLCBhIHNpbmdsZSBzZW5kXG5cdFx0XHQvLyBwcm9kdWNlZCBkdXBsaWNhdGUgc2Vzc2lvbnMuXG5cdFx0XHR0aGlzLmluZm8oJ21hdGVyaWFsaXplVW50aXRsZWRTZXNzaW9uJywgYE1hdGVyaWFsaXplZCB1bnRpdGxlZCBzZXNzaW9uICR7dW50aXRsZWRSZXNvdXJjZS50b1N0cmluZygpfSBpbnRvIHJlYWwgc2Vzc2lvbiAke25ld0l0ZW0ucmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybiB7IG1vZGVsOiByZWFsTW9kZWwsIHNlc3Npb25SZXNvdXJjZTogbmV3SXRlbS5yZXNvdXJjZSwgbmV3U2Vzc2lvblJlc291cmNlOiBuZXdJdGVtLnJlc291cmNlIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBSZXNvbHZlIChub3QgcmVqZWN0KSBzbyBhIGNvbmN1cnJlbnQgd2FpdGVyIGRlZ3JhZGVzIHRvIHRoZSBub3JtYWxcblx0XHRcdC8vIHVudGl0bGVkIHBhdGggcmF0aGVyIHRoYW4gaW5oZXJpdGluZyB0aGlzIGZhaWx1cmUsIHRoZW4gcHJvcGFnYXRlIHRoZVxuXHRcdFx0Ly8gZXJyb3IgdG8gdGhlIG9yaWdpbmF0aW5nIGNhbGxlci4gVGhlIGZvcndhcmQgbWFwcGluZyBpcyBvbmx5IHB1Ymxpc2hlZFxuXHRcdFx0Ly8gb24gc3VjY2Vzcywgc28gdGhlcmUgaXMgbm90aGluZyB0byByb2xsIGJhY2sgaGVyZS5cblx0XHRcdG1hdGVyaWFsaXplZC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5faW5GbGlnaHRVbnRpdGxlZE1hdGVyaWFsaXphdGlvbnMuZ2V0KHVudGl0bGVkUmVzb3VyY2UpID09PSBtYXRlcmlhbGl6ZWQucCkge1xuXHRcdFx0XHR0aGlzLl9pbkZsaWdodFVudGl0bGVkTWF0ZXJpYWxpemF0aW9ucy5kZWxldGUodW50aXRsZWRSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBdHRhY2htZW50Q2FwYWJpbGl0aWVzRm9yUGFyc2VyKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBhZ2VudDogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQpOiBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhdFNlc3Npb25TZXJ2aWNlLmdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZSkgPz8gYWdlbnQ/LmNhcGFiaWxpdGllcztcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VDaGF0UmVxdWVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdDogc3RyaW5nLCBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIHwgdW5kZWZpbmVkKTogSVBhcnNlZENoYXRSZXF1ZXN0IHtcblx0XHRsZXQgcGFyc2VyQ29udGV4dCA9IG9wdGlvbnM/LnBhcnNlckNvbnRleHQ7XG5cdFx0bGV0IGNvbnRleHRBZ2VudCA9IHBhcnNlckNvbnRleHQ/LmZvcmNlZEFnZW50ID8/IHBhcnNlckNvbnRleHQ/LnNlbGVjdGVkQWdlbnQ7XG5cdFx0aWYgKG9wdGlvbnM/LmFnZW50SWQpIHtcblx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KG9wdGlvbnMuYWdlbnRJZCk7XG5cdFx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBhZ2VudDogJHtvcHRpb25zLmFnZW50SWR9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb250ZXh0QWdlbnQgPSBhZ2VudDtcblx0XHRcdHBhcnNlckNvbnRleHQgPSB7IC4uLnBhcnNlckNvbnRleHQsIHNlbGVjdGVkQWdlbnQ6IGFnZW50LCBtb2RlOiBvcHRpb25zLm1vZGVJbmZvPy5raW5kIH07XG5cdFx0XHRjb25zdCBjb21tYW5kUGFydCA9IG9wdGlvbnMuc2xhc2hDb21tYW5kID8gYCAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7b3B0aW9ucy5zbGFzaENvbW1hbmR9YCA6ICcnO1xuXHRcdFx0cmVxdWVzdCA9IGAke2NoYXRBZ2VudExlYWRlcn0ke2FnZW50Lm5hbWV9JHtjb21tYW5kUGFydH0gJHtyZXF1ZXN0fWA7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zPy5hZ2VudElkU2lsZW50ICYmICFwYXJzZXJDb250ZXh0Py5mb3JjZWRBZ2VudCkge1xuXHRcdFx0Ly8gUmVzb2x2ZSBzbGFzaCBjb21tYW5kcyBpbiB0aGUgY29udGV4dCBvZiBsb2NrZWQgcGFydGljaXBhbnQgc28gaXRzIHN1YmNvbW1hbmRzIHRha2UgcHJlY2VkZW5jZSBvdmVyIGdsb2JhbFxuXHRcdFx0Ly8gc2xhc2ggY29tbWFuZHMgd2l0aCB0aGUgc2FtZSBuYW1lLlxuXHRcdFx0Y29uc3Qgc2lsZW50QWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQob3B0aW9ucy5hZ2VudElkU2lsZW50KTtcblx0XHRcdGlmIChzaWxlbnRBZ2VudCkge1xuXHRcdFx0XHRjb250ZXh0QWdlbnQgPSBzaWxlbnRBZ2VudDtcblx0XHRcdFx0cGFyc2VyQ29udGV4dCA9IHsgLi4ucGFyc2VyQ29udGV4dCwgZm9yY2VkQWdlbnQ6IHNpbGVudEFnZW50IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXR0YWNobWVudENhcGFiaWxpdGllcyA9IHBhcnNlckNvbnRleHQ/LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgPz8gdGhpcy5nZXRBdHRhY2htZW50Q2FwYWJpbGl0aWVzRm9yUGFyc2VyKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpLCBjb250ZXh0QWdlbnQpO1xuXHRcdGlmIChhdHRhY2htZW50Q2FwYWJpbGl0aWVzKSB7XG5cdFx0XHRwYXJzZXJDb250ZXh0ID0geyAuLi5wYXJzZXJDb250ZXh0LCBhdHRhY2htZW50Q2FwYWJpbGl0aWVzIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpLnBhcnNlQ2hhdFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0LCBsb2NhdGlvbiwgcGFyc2VyQ29udGV4dCk7XG5cdFx0cmV0dXJuIHBhcnNlZFJlcXVlc3Q7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hGb2xsb3d1cHNDYW5jZWxsYXRpb25Ub2tlbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IENhbmNlbGxhdGlvblRva2VuIHtcblx0XHR0aGlzLl9zZXNzaW9uRm9sbG93dXBDYW5jZWxUb2tlbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSk/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IG5ld1Rva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkZvbGxvd3VwQ2FuY2VsVG9rZW5zLnNldChzZXNzaW9uUmVzb3VyY2UsIG5ld1Rva2VuU291cmNlKTtcblxuXHRcdHJldHVybiBuZXdUb2tlblNvdXJjZS50b2tlbjtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRSZXF1ZXN0QXN5bmMobW9kZWw6IENoYXRNb2RlbCwgc2Vzc2lvblJlc291cmNlOiBVUkksIHBhcnNlZFJlcXVlc3Q6IElQYXJzZWRDaGF0UmVxdWVzdCwgYXR0ZW1wdDogbnVtYmVyLCBlbmFibGVDb21tYW5kRGV0ZWN0aW9uOiBib29sZWFuLCBkZWZhdWx0QWdlbnQ6IElDaGF0QWdlbnREYXRhLCBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG9wdGlvbnM/OiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyk6IElDaGF0U2VuZFJlcXVlc3RSZXNwb25zZVN0YXRlIHtcblx0XHRjb25zdCBmb2xsb3d1cHNDYW5jZWxUb2tlbiA9IHRoaXMucmVmcmVzaEZvbGxvd3Vwc0NhbmNlbGxhdGlvblRva2VuKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0bGV0IHJlcXVlc3Q6IENoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWdlbnRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdEFnZW50UGFydCA9PiByIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpO1xuXHRcdGNvbnN0IGFnZW50U2xhc2hDb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0ID0+IHIgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQpO1xuXHRcdGNvbnN0IGNvbW1hbmRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQgPT4gciBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydCk7XG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBbLi4ubW9kZWwuZ2V0UmVxdWVzdHMoKV07XG5cdFx0Y29uc3QgaXNUZXJtaW5hbENvbW1hbmQgPSBpc1Rlcm1pbmFsQ29tbWFuZFByb21wdChwYXJzZWRSZXF1ZXN0LnRleHQsIHRoaXMuY2hhdFNlc3Npb25TZXJ2aWNlLmdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKT8udGVybWluYWxDb21tYW5kUHJlZml4KTtcblx0XHRjb25zdCByZXF1ZXN0VGVsZW1ldHJ5ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFRlbGVtZXRyeSwge1xuXHRcdFx0YWdlbnQ6IGFnZW50UGFydD8uYWdlbnQgPz8gZGVmYXVsdEFnZW50LFxuXHRcdFx0YWdlbnRTbGFzaENvbW1hbmRQYXJ0LFxuXHRcdFx0Y29tbWFuZFBhcnQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IG1vZGVsLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGxvY2F0aW9uOiBtb2RlbC5pbml0aWFsTG9jYXRpb24sXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0ZW5hYmxlQ29tbWFuZERldGVjdGlvblxuXHRcdH0pO1xuXG5cdFx0bGV0IGdvdFByb2dyZXNzID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVxdWVzdFR5cGUgPSBjb21tYW5kUGFydCA/ICdzbGFzaENvbW1hbmQnIDogJ3N0cmluZyc7XG5cblx0XHRjb25zdCByZXNwb25zZUNyZWF0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElDaGF0UmVzcG9uc2VNb2RlbD4oKTtcblx0XHRsZXQgcmVzcG9uc2VDcmVhdGVkQ29tcGxldGUgPSBmYWxzZTtcblx0XHRmdW5jdGlvbiBjb21wbGV0ZVJlc3BvbnNlQ3JlYXRlZCgpOiB2b2lkIHtcblx0XHRcdGlmICghcmVzcG9uc2VDcmVhdGVkQ29tcGxldGUgJiYgcmVxdWVzdD8ucmVzcG9uc2UpIHtcblx0XHRcdFx0cmVzcG9uc2VDcmVhdGVkLmNvbXBsZXRlKHJlcXVlc3QucmVzcG9uc2UpO1xuXHRcdFx0XHRyZXNwb25zZUNyZWF0ZWRDb21wbGV0ZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc291cmNlID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCB0b2tlbiA9IHNvdXJjZS50b2tlbjtcblx0XHRjb25zdCBzZW5kUmVxdWVzdEludGVybmFsID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3NDYWxsYmFjayA9IChwcm9ncmVzczogSUNoYXRQcm9ncmVzc1tdKSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghZ290UHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRtYXJrQ2hhdChzZXNzaW9uUmVzb3VyY2UsIENoYXRQZXJmTWFyay5GaXJzdFRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRnb3RQcm9ncmVzcyA9IHRydWU7XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwcm9ncmVzcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGlzTGFzdCA9IGkgPT09IHByb2dyZXNzLmxlbmd0aCAtIDE7XG5cdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3NJdGVtID0gcHJvZ3Jlc3NbaV07XG5cblx0XHRcdFx0XHRpZiAocHJvZ3Jlc3NJdGVtLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBQcm92aWRlciByZXR1cm5lZCBwcm9ncmVzcyBmb3Igc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX0sICR7cHJvZ3Jlc3NJdGVtLmNvbnRlbnQudmFsdWUubGVuZ3RofSBjaGFyc2ApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBQcm92aWRlciByZXR1cm5lZCBwcm9ncmVzczogJHtKU09OLnN0cmluZ2lmeShwcm9ncmVzc0l0ZW0pfWApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHByb2dyZXNzSXRlbSwgIWlzTGFzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbXBsZXRlUmVzcG9uc2VDcmVhdGVkKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgZGV0ZWN0ZWRBZ2VudDogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZGV0ZWN0ZWRDb21tYW5kOiBJQ2hhdEFnZW50Q29tbWFuZCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gR2F0ZSAvdHJvdWJsZXNob290IGFuZCB0aGUgdHJvdWJsZXNob290IHNraWxsIGJlaGluZCB0aGUgZmlsZSBsb2dnaW5nIGZsYWcuXG5cdFx0XHQvLyBhZ2VudERlYnVnTG9nLmVuYWJsZWQgaXMgZGVwcmVjYXRlZDsgb25seSBmaWxlTG9nZ2luZy5lbmFibGVkIGlzIGF1dGhvcml0YXRpdmUuXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGZpbGVMb2dnaW5nRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcpO1xuXHRcdFx0XHRpZiAoIWZpbGVMb2dnaW5nRW5hYmxlZCkge1xuXHRcdFx0XHRcdGNvbnN0IGlzVHJvdWJsZXNob290Q29tbWFuZCA9IGFnZW50U2xhc2hDb21tYW5kUGFydD8uY29tbWFuZC5uYW1lID09PSBUUk9VQkxFU0hPT1RfQ09NTUFORF9OQU1FO1xuXHRcdFx0XHRcdGNvbnN0IGhhc1Ryb3VibGVzaG9vdFNraWxsID0gb3B0aW9ucz8uYXR0YWNoZWRDb250ZXh0Py5zb21lKHYgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeS50b1VyaSh2KTtcblx0XHRcdFx0XHRcdHJldHVybiB1cmkgJiYgKHVyaS5zY2hlbWUgPT09IENPUElMT1RfU0tJTExfVVJJX1NDSEVNRSB8fCB1cmkucGF0aC5pbmNsdWRlcyhUUk9VQkxFU0hPT1RfU0tJTExfUEFUSCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChpc1Ryb3VibGVzaG9vdENvbW1hbmQgfHwgaGFzVHJvdWJsZXNob290U2tpbGwpIHtcblx0XHRcdFx0XHRcdHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHBhcnNlZFJlcXVlc3QsIHsgdmFyaWFibGVzOiBbXSB9LCBhdHRlbXB0LCBvcHRpb25zPy5tb2RlSW5mbyk7XG5cdFx0XHRcdFx0XHRjb21wbGV0ZVJlc3BvbnNlQ3JlYXRlZCgpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBzZXR0aW5nc0FyZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShBR0VOVF9ERUJVR19MT0dfRklMRV9MT0dHSU5HX0VOQUJMRURfU0VUVElORykpO1xuXHRcdFx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J2FnZW50RGVidWdMb2cudHJvdWJsZXNob290RGlzYWJsZWQnLFxuXHRcdFx0XHRcdFx0XHRcdFwiVGhlIGB7MH1gIHNraWxsIHJlcXVpcmVzIGB7MX1gIHRvIGJlIGVuYWJsZWQuIEFmdGVyIGVuYWJsaW5nLCByZWxvYWQgdGhlIHdpbmRvdyB0byBhcHBseS4gW0VuYWJsZSBpbiBTZXR0aW5nc10oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz97Mn0pXCIsXG5cdFx0XHRcdFx0XHRcdFx0VFJPVUJMRVNIT09UX0NPTU1BTkRfTkFNRSxcblx0XHRcdFx0XHRcdFx0XHRBR0VOVF9ERUJVR19MT0dfRklMRV9MT0dHSU5HX0VOQUJMRURfU0VUVElORyxcblx0XHRcdFx0XHRcdFx0XHRzZXR0aW5nc0FyZ1xuXHRcdFx0XHRcdFx0XHQpLCB7IGlzVHJ1c3RlZDogeyBlbmFibGVkQ29tbWFuZHM6IFsnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnXSB9IH0pLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRtb2RlbC5zZXRSZXNwb25zZShyZXF1ZXN0LCB7fSk7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb2xsZWN0IGhvb2tzIGZyb20gaG9vayAuanNvbiBmaWxlc1xuXHRcdFx0Y29uc3QgY29sbGVjdEhvb2tzID0gYXN5bmMgKCk6IFByb21pc2U8eyBob29rczogQ2hhdFJlcXVlc3RIb29rcyB8IHVuZGVmaW5lZDsgaGFzRGlzYWJsZWRDbGF1ZGVIb29rczogYm9vbGVhbiB9PiA9PiB7XG5cdFx0XHRcdGxldCBjb2xsZWN0ZWRIb29rczogQ2hhdFJlcXVlc3RIb29rcyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGhhc0Rpc2FibGVkQ2xhdWRlSG9va3MgPSBmYWxzZTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBob29rc0luZm8gPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmdldEhvb2tzKHRva2VuKTtcblx0XHRcdFx0XHRpZiAoaG9va3NJbmZvKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0ZWRIb29rcyA9IGhvb2tzSW5mby5ob29rcztcblx0XHRcdFx0XHRcdGhhc0Rpc2FibGVkQ2xhdWRlSG9va3MgPSBob29rc0luZm8uaGFzRGlzYWJsZWRDbGF1ZGVIb29rcztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tDaGF0U2VydmljZV0gRmFpbGVkIHRvIGNvbGxlY3QgaG9va3M6JywgZXJyb3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTWVyZ2UgaG9va3MgZnJvbSB0aGUgc2VsZWN0ZWQgY3VzdG9tIGFnZW50J3MgZnJvbnRtYXR0ZXIgKGlmIGFueSlcblx0XHRcdFx0Y29uc3QgYWdlbnROYW1lID0gb3B0aW9ucz8ubW9kZUluZm8/Lm1vZGVJbnN0cnVjdGlvbnM/Lm5hbWU7XG5cdFx0XHRcdGlmIChhZ2VudE5hbWUpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRDdXN0b21BZ2VudHModG9rZW4pO1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VzdG9tQWdlbnQgPSBhZ2VudHMuZmluZChhID0+IGEubmFtZSA9PT0gYWdlbnROYW1lICYmIGEuZW5hYmxlZCk7XG5cdFx0XHRcdFx0XHRpZiAoY3VzdG9tQWdlbnQ/Lmhvb2tzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbGxlY3RlZEhvb2tzID0gbWVyZ2VIb29rcyhjb2xsZWN0ZWRIb29rcywgY3VzdG9tQWdlbnQuaG9va3MpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW0NoYXRTZXJ2aWNlXSBGYWlsZWQgdG8gY29sbGVjdCBhZ2VudCBob29rczonLCBlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGhvb2tzOiBjb2xsZWN0ZWRIb29rcywgaGFzRGlzYWJsZWRDbGF1ZGVIb29rcyB9O1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQ29sbGVjdCBhdXRvbWF0aWMgaW5zdHJ1Y3Rpb25zICguaW5zdHJ1Y3Rpb25zLm1kLCBza2lsbHMsIGV0Yy4pXG5cdFx0XHRjb25zdCBjb2xsZWN0SW5zdHJ1Y3Rpb25zID0gYXN5bmMgKCk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdPiA9PiB7XG5cdFx0XHRcdGNvbnN0IGN0eCA9IG9wdGlvbnM/Lmluc3RydWN0aW9uQ29udGV4dDtcblx0XHRcdFx0aWYgKCFjdHgpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gV2hlbiB0aGUgZXh0ZW5zaW9uIGlzIHJlc3BvbnNpYmxlIGZvciBpbnN0cnVjdGlvbiBjb2xsZWN0aW9uLCBza2lwIHRoZSBjb3JlIHBhdGggZW50aXJlbHkuXG5cdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNvbGxlY3RJbnN0cnVjdGlvbnNJbkV4dGVuc2lvbikgPT09IHRydWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0bWFya0NoYXQoc2Vzc2lvblJlc291cmNlLCBDaGF0UGVyZk1hcmsuV2lsbENvbGxlY3RJbnN0cnVjdGlvbnMpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIFNlZWQgdGhlIHZhcmlhYmxlIHNldCB3aXRoIGV4aXN0aW5nIGF0dGFjaG1lbnRzIHNvIHRoYXRcblx0XHRcdFx0XHQvLyBhcHBseVRvIHBhdHRlcm4gbWF0Y2hpbmcgYW5kIHJlZmVyZW5jZWQtaW5zdHJ1Y3Rpb25cblx0XHRcdFx0XHQvLyByZXNvbHV0aW9uIGNhbiBzZWUgdGhlbS4gV2UgZmlsdGVyIHRoZW0gYmFjayBvdXQgYmVsb3dcblx0XHRcdFx0XHQvLyB0byByZXR1cm4gb25seSB0aGUgZW50cmllcyB0aGF0IHdlcmUgbmV3bHkgYWRkZWQuXG5cdFx0XHRcdFx0Y29uc3QgdmFyaWFibGVTZXQgPSBuZXcgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldChvcHRpb25zPy5hdHRhY2hlZENvbnRleHQpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbXB1dGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLCBjdHgubW9kZUtpbmQsIGN0eC5lbmFibGVkVG9vbHMsIGN0eC5lbmFibGVkU3ViQWdlbnRzLCBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRcdFx0YXdhaXQgY29tcHV0ZXIuY29sbGVjdCh2YXJpYWJsZVNldCwgdG9rZW4pO1xuXHRcdFx0XHRcdC8vIFJldHVybiBvbmx5IHRoZSBlbnRyaWVzIHRoYXQgd2VyZSBhZGRlZCBieSBpbnN0cnVjdGlvbiBjb2xsZWN0aW9uXG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxJZHMgPSBuZXcgU2V0KChvcHRpb25zPy5hdHRhY2hlZENvbnRleHQgPz8gW10pLm1hcCh2ID0+IHYuaWQpKTtcblx0XHRcdFx0XHRyZXR1cm4gdmFyaWFibGVTZXQuYXNBcnJheSgpLmZpbHRlcih2ID0+ICFvcmlnaW5hbElkcy5oYXModi5pZCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tDaGF0U2VydmljZV0gRmFpbGVkIHRvIGNvbGxlY3QgaW5zdHJ1Y3Rpb25zOicsIGVycik7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdG1hcmtDaGF0KHNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcmZNYXJrLkRpZENvbGxlY3RJbnN0cnVjdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzdG9wV2F0Y2ggPSBuZXcgU3RvcFdhdGNoKGZhbHNlKTtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ3NlbmRSZXF1ZXN0JywgYFJlcXVlc3QgZm9yIHNlc3Npb24gJHttb2RlbC5zZXNzaW9uUmVzb3VyY2V9IHdhcyBjYW5jZWxsZWRgKTtcblx0XHRcdFx0aWYgKCFyZXF1ZXN0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVxdWVzdFRlbGVtZXRyeS5jb21wbGV0ZSh7XG5cdFx0XHRcdFx0dGltZVRvRmlyc3RQcm9ncmVzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlc3VsdDogJ2NhbmNlbGxlZCcsXG5cdFx0XHRcdFx0Ly8gTm9ybWFsbHkgdGltaW5ncyBoYXBwZW4gaW5zaWRlIHRoZSBFSCBhcm91bmQgdGhlIGFjdHVhbCBwcm92aWRlci4gRm9yIGNhbmNlbGxhdGlvbiB3ZSBjYW4gbWVhc3VyZSBob3cgbG9uZyB0aGUgdXNlciB3YWl0ZWQgYmVmb3JlIGNhbmNlbGxpbmdcblx0XHRcdFx0XHR0b3RhbFRpbWU6IHN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRcdFx0cmVxdWVzdFR5cGUsXG5cdFx0XHRcdFx0ZGV0ZWN0ZWRBZ2VudCxcblx0XHRcdFx0XHRyZXF1ZXN0LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2RlbC5jYW5jZWxSZXF1ZXN0KHJlcXVlc3QpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsZXQgcmF3UmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0IHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGFnZW50T3JDb21tYW5kRm9sbG93dXBzOiBQcm9taXNlPElDaGF0Rm9sbG93dXBbXSB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChhZ2VudFBhcnQgfHwgKGRlZmF1bHRBZ2VudCAmJiAhY29tbWFuZFBhcnQpKSB7XG5cdFx0XHRcdFx0Ly8gLS0tIFN0ZXAgMTogQ3JlYXRlIHRoZSByZXF1ZXN0IG1vZGVsIGltbWVkaWF0ZWx5IChiZWZvcmUgYW55IGF3YWl0cykgLS0tXG5cdFx0XHRcdFx0Ly8gVGhpcyBmaXJlcyBSZXF1ZXN0VWlVcGRhdGVkIHN5bmNocm9ub3VzbHkgc28gdGhlIHVzZXIgc2VlcyB0aGVpciBtZXNzYWdlIHJpZ2h0IGF3YXkuXG5cdFx0XHRcdFx0Y29uc3QgaW5pdGlhbEFnZW50ID0gYWdlbnRQYXJ0Py5hZ2VudCA/PyBkZWZhdWx0QWdlbnQ7XG5cdFx0XHRcdFx0Y29uc3QgaW5pdGlhbENvbW1hbmQgPSBhZ2VudFNsYXNoQ29tbWFuZFBhcnQ/LmNvbW1hbmQ7XG5cdFx0XHRcdFx0Y29uc3QgaW5pdFZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhID0geyB2YXJpYWJsZXM6IFtdIH07XG5cdFx0XHRcdFx0cmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QocGFyc2VkUmVxdWVzdCwgaW5pdFZhcmlhYmxlRGF0YSwgYXR0ZW1wdCwgb3B0aW9ucz8ubW9kZUluZm8sIGluaXRpYWxBZ2VudCwgaW5pdGlhbENvbW1hbmQsIG9wdGlvbnM/LmNvbmZpcm1hdGlvbiwgb3B0aW9ucz8ubG9jYXRpb25EYXRhLCBvcHRpb25zPy5hdHRhY2hlZENvbnRleHQsIHVuZGVmaW5lZCwgb3B0aW9ucz8udXNlclNlbGVjdGVkTW9kZWxJZCwgb3B0aW9ucz8udXNlclNlbGVjdGVkVG9vbHM/LmdldCgpLCB1bmRlZmluZWQsIG9wdGlvbnM/LmlzU3lzdGVtSW5pdGlhdGVkLCBvcHRpb25zPy5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCwgb3B0aW9ucz8udGVybWluYWxFeGVjdXRpb25JZCwgaXNUZXJtaW5hbENvbW1hbmQpO1xuXHRcdFx0XHRcdGNvbnN0IHRoaXNSZXF1ZXN0ID0gcmVxdWVzdDtcblx0XHRcdFx0XHRjb21wbGV0ZVJlc3BvbnNlQ3JlYXRlZCgpO1xuXG5cdFx0XHRcdFx0Ly8gLS0tIFN0ZXAgMjogQ29sbGVjdCBob29rcyArIGluc3RydWN0aW9ucyBpbiBwYXJhbGxlbCAoYWZ0ZXIgVUkgaXMgc2hvd24pIC0tLVxuXHRcdFx0XHRcdGNvbnN0IFtob29rc1Jlc3VsdCwgaW5zdHJ1Y3Rpb25FbnRyaWVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRcdGNvbGxlY3RIb29rcygpLFxuXHRcdFx0XHRcdFx0Y29sbGVjdEluc3RydWN0aW9ucygpLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGNvbnN0IGNvbGxlY3RlZEhvb2tzID0gaG9va3NSZXN1bHQuaG9va3M7XG5cdFx0XHRcdFx0Y29uc3QgaGFzRGlzYWJsZWRDbGF1ZGVIb29rcyA9IGhvb2tzUmVzdWx0Lmhhc0Rpc2FibGVkQ2xhdWRlSG9va3M7XG5cblx0XHRcdFx0XHQvLyAtLS0gU3RlcCAzOiBNZXJnZSBpbnN0cnVjdGlvbnMgYW5kIHJlc29sdmVkIHZhcmlhYmxlcyBpbnRvIHZhcmlhYmxlRGF0YSAtLS1cblx0XHRcdFx0XHRjb25zdCBhbGxDb250ZXh0ID0gdGhpcy5wcmVwYXJlQ29udGV4dChyZXF1ZXN0LmF0dGFjaGVkQ29udGV4dCk7XG5cdFx0XHRcdFx0aWYgKGluc3RydWN0aW9uRW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRhbGxDb250ZXh0LnB1c2goLi4uaW5zdHJ1Y3Rpb25FbnRyaWVzKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTdG9yZSBvbmx5IG5vbi1pbnN0cnVjdGlvbiB2YXJpYWJsZXMgb24gdGhlIG1vZGVsLlxuXHRcdFx0XHRcdC8vIEF1dG9tYXRpY2FsbHktYWRkZWQgcHJvbXB0VGV4dCBlbnRyaWVzICh+MzMgS0IgZWFjaCkgYXJlXG5cdFx0XHRcdFx0Ly8gZXBoZW1lcmFsIFx1MjAxNCByZS1jb2xsZWN0ZWQgZXZlcnkgdHVybiwgbmV2ZXIgcmVuZGVyZWQgaW5cblx0XHRcdFx0XHQvLyB0aGUgVUksIGFuZCBub3QgbmVlZGVkIGluIHNlcmlhbGl6ZWQgc2Vzc2lvbiBoaXN0b3J5LlxuXHRcdFx0XHRcdGNvbnN0IHN0b3JlZFZhcmlhYmxlcyA9IGFsbENvbnRleHQuZmlsdGVyKHYgPT4gIShpc1Byb21wdFRleHRWYXJpYWJsZUVudHJ5KHYpICYmIHYuYXV0b21hdGljYWxseUFkZGVkKSk7XG5cdFx0XHRcdFx0bW9kZWwudXBkYXRlUmVxdWVzdChyZXF1ZXN0LCB7IHZhcmlhYmxlczogc3RvcmVkVmFyaWFibGVzIH0pO1xuXG5cdFx0XHRcdFx0Ly8gVGhlIGZ1bGwgc2V0IChpbmNsdWRpbmcgaW5zdHJ1Y3Rpb25zKSBpcyBwYXNzZWQgdG8gdGhlXG5cdFx0XHRcdFx0Ly8gYWdlbnQgcmVxdWVzdCBvbmx5IFx1MjAxNCBub3Qgc3RvcmVkIG9uIHRoZSByZXF1ZXN0IG1vZGVsLlxuXHRcdFx0XHRcdGxldCB2YXJpYWJsZURhdGE6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSA9IHsgdmFyaWFibGVzOiBhbGxDb250ZXh0IH07XG5cblx0XHRcdFx0XHQvLyBNZXJnZSByZXNvbHZlZCB2YXJpYWJsZXMgKGUuZy4gaW1hZ2VzIGZyb20gZGlyZWN0b3JpZXMpIGZvciB0aGVcblx0XHRcdFx0XHQvLyBhZ2VudCByZXF1ZXN0IG9ubHkgLSB0aGV5IGFyZSBub3Qgc3RvcmVkIG9uIHRoZSByZXF1ZXN0IG1vZGVsLlxuXHRcdFx0XHRcdGlmIChvcHRpb25zPy5yZXNvbHZlZFZhcmlhYmxlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR2YXJpYWJsZURhdGEgPSB7IHZhcmlhYmxlczogWy4uLnZhcmlhYmxlRGF0YS52YXJpYWJsZXMsIC4uLm9wdGlvbnMucmVzb2x2ZWRWYXJpYWJsZXNdIH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcHJvbXB0VGV4dFJlc3VsdCA9IGdldFByb21wdFRleHQocmVxdWVzdC5tZXNzYWdlKTtcblx0XHRcdFx0XHR2YXJpYWJsZURhdGEgPSB1cGRhdGVSYW5nZXModmFyaWFibGVEYXRhLCBwcm9tcHRUZXh0UmVzdWx0LmRpZmYpOyAvLyBUT0RPIGJpdCBvZiBhIGhhY2tcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gcHJvbXB0VGV4dFJlc3VsdC5tZXNzYWdlO1xuXG5cdFx0XHRcdFx0Ly8gLS0tIFN0ZXAgNDogQnVpbGQgdGhlIGFnZW50IHJlcXVlc3Qgb2JqZWN0IC0tLVxuXHRcdFx0XHRcdGNvbnN0IGJ1aWxkQWdlbnRSZXF1ZXN0ID0gKGFnZW50OiBJQ2hhdEFnZW50RGF0YSwgY29tbWFuZD86IElDaGF0QWdlbnRDb21tYW5kLCBlbmFibGVDb21tYW5kRGV0ZWN0aW9uPzogYm9vbGVhbiwgaXNQYXJ0aWNpcGFudERldGVjdGVkPzogYm9vbGVhbik6IElDaGF0QWdlbnRSZXF1ZXN0ID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGFnZW50UmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QgPSB7XG5cdFx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogbW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRyZXF1ZXN0SWQ6IHRoaXNSZXF1ZXN0LmlkLFxuXHRcdFx0XHRcdFx0XHRhZ2VudElkOiBhZ2VudC5pZCxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogY29tbWFuZD8ubmFtZSxcblx0XHRcdFx0XHRcdFx0dmFyaWFibGVzOiB2YXJpYWJsZURhdGEsXG5cdFx0XHRcdFx0XHRcdGVuYWJsZUNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRcdFx0XHRcdGlzUGFydGljaXBhbnREZXRlY3RlZCxcblx0XHRcdFx0XHRcdFx0YXR0ZW1wdCxcblx0XHRcdFx0XHRcdFx0bG9jYXRpb24sXG5cdFx0XHRcdFx0XHRcdGxvY2F0aW9uRGF0YTogdGhpc1JlcXVlc3QubG9jYXRpb25EYXRhLFxuXHRcdFx0XHRcdFx0XHRhY2NlcHRlZENvbmZpcm1hdGlvbkRhdGE6IG9wdGlvbnM/LmFjY2VwdGVkQ29uZmlybWF0aW9uRGF0YSxcblx0XHRcdFx0XHRcdFx0cmVqZWN0ZWRDb25maXJtYXRpb25EYXRhOiBvcHRpb25zPy5yZWplY3RlZENvbmZpcm1hdGlvbkRhdGEsXG5cdFx0XHRcdFx0XHRcdGFnZW50SG9zdFNlc3Npb25Db25maWc6IG9wdGlvbnM/LmFnZW50SG9zdFNlc3Npb25Db25maWcsXG5cdFx0XHRcdFx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6IG9wdGlvbnM/LnVzZXJTZWxlY3RlZE1vZGVsSWQsXG5cdFx0XHRcdFx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbjogb3B0aW9ucz8udXNlclNlbGVjdGVkTW9kZWxDb25maWd1cmF0aW9uID8/IChvcHRpb25zPy51c2VyU2VsZWN0ZWRNb2RlbElkID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TW9kZWxDb25maWd1cmF0aW9uKG9wdGlvbnMudXNlclNlbGVjdGVkTW9kZWxJZCkgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdFx0XHR1c2VyU2VsZWN0ZWRUb29sczogb3B0aW9ucz8udXNlclNlbGVjdGVkVG9vbHM/LmdldCgpLFxuXHRcdFx0XHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiBvcHRpb25zPy5tb2RlSW5mbz8ubW9kZUluc3RydWN0aW9ucyxcblx0XHRcdFx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiBvcHRpb25zPy5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsLFxuXHRcdFx0XHRcdFx0XHRlZGl0ZWRGaWxlRXZlbnRzOiB0aGlzUmVxdWVzdC5lZGl0ZWRGaWxlRXZlbnRzLFxuXHRcdFx0XHRcdFx0XHRob29rczogY29sbGVjdGVkSG9va3MsXG5cdFx0XHRcdFx0XHRcdGhhc0hvb2tzRW5hYmxlZDogISFjb2xsZWN0ZWRIb29rcyAmJiBPYmplY3QudmFsdWVzKGNvbGxlY3RlZEhvb2tzKS5zb21lKGFyciA9PiBhcnIubGVuZ3RoID4gMCksXG5cdFx0XHRcdFx0XHRcdGlzVm9pY2VNb2RlSW5wdXQ6IG9wdGlvbnM/LmlzVm9pY2VNb2RlSW5wdXQsXG5cdFx0XHRcdFx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiBvcHRpb25zPy5pc1N5c3RlbUluaXRpYXRlZCxcblx0XHRcdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogbW9kZWwud29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGxldCBpc0luaXRpYWxUb29scyA9IHRydWU7XG5cblx0XHRcdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRvb2xzID0gb3B0aW9ucz8udXNlclNlbGVjdGVkVG9vbHM/LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdFx0aWYgKGlzSW5pdGlhbFRvb2xzKSB7XG5cdFx0XHRcdFx0XHRcdFx0aXNJbml0aWFsVG9vbHMgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAodG9vbHMgJiYgcmVxdWVzdCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuY2hhdEFnZW50U2VydmljZS5zZXRSZXF1ZXN0VG9vbHMoYWdlbnQuaWQsIHJlcXVlc3QuaWQsIHRvb2xzKTtcblx0XHRcdFx0XHRcdFx0XHQvLyBpbiBjYXNlIHRoZSByZXF1ZXN0IGhhcyBub3QgYmVlbiBzZW50IG91dCB5ZXQ6XG5cdFx0XHRcdFx0XHRcdFx0YWdlbnRSZXF1ZXN0LnVzZXJTZWxlY3RlZFRvb2xzID0gdG9vbHM7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIGFnZW50UmVxdWVzdDtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Ly8gLS0tIFN0ZXAgNTogUGFydGljaXBhbnQgZGV0ZWN0aW9uIC0tLVxuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2NoYXQuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZCcpICE9PSBmYWxzZSAmJlxuXHRcdFx0XHRcdFx0dGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmhhc0NoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycygpICYmXG5cdFx0XHRcdFx0XHQhYWdlbnRQYXJ0ICYmXG5cdFx0XHRcdFx0XHQhY29tbWFuZFBhcnQgJiZcblx0XHRcdFx0XHRcdCFhZ2VudFNsYXNoQ29tbWFuZFBhcnQgJiZcblx0XHRcdFx0XHRcdGVuYWJsZUNvbW1hbmREZXRlY3Rpb24gJiZcblx0XHRcdFx0XHRcdGxvY2F0aW9uICE9PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUgJiZcblx0XHRcdFx0XHRcdG9wdGlvbnM/Lm1vZGVJbmZvPy5raW5kICE9PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiZcblx0XHRcdFx0XHRcdG9wdGlvbnM/Lm1vZGVJbmZvPy5raW5kICE9PSBDaGF0TW9kZUtpbmQuRWRpdCAmJlxuXHRcdFx0XHRcdFx0IW9wdGlvbnM/LmFnZW50SWRTaWxlbnRcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdC8vIFdlIGhhdmUgbm8gYWdlbnQgb3IgY29tbWFuZCB0byBzY29wZSBoaXN0b3J5IHdpdGgsIHBhc3MgdGhlIGZ1bGwgaGlzdG9yeSB0byB0aGUgcGFydGljaXBhbnQgZGV0ZWN0aW9uIHByb3ZpZGVyXG5cdFx0XHRcdFx0XHRjb25zdCBkZWZhdWx0QWdlbnRIaXN0b3J5ID0gdGhpcy5nZXRIaXN0b3J5RW50cmllc0Zyb21Nb2RlbChyZXF1ZXN0cywgbG9jYXRpb24sIGRlZmF1bHRBZ2VudC5pZCk7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGF0QWdlbnRSZXF1ZXN0ID0gYnVpbGRBZ2VudFJlcXVlc3QoZGVmYXVsdEFnZW50LCB1bmRlZmluZWQsIGVuYWJsZUNvbW1hbmREZXRlY3Rpb24sIGZhbHNlKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmRldGVjdEFnZW50T3JDb21tYW5kKGNoYXRBZ2VudFJlcXVlc3QsIGRlZmF1bHRBZ2VudEhpc3RvcnksIHsgbG9jYXRpb24gfSwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdCAmJiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQocmVzdWx0LmFnZW50LmlkKT8ubG9jYXRpb25zPy5pbmNsdWRlcyhsb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSByZXNwb25zZSBpbiB0aGUgQ2hhdE1vZGVsIHRvIHJlZmxlY3QgdGhlIGRldGVjdGVkIGFnZW50IGFuZCBjb21tYW5kXG5cdFx0XHRcdFx0XHRcdHJlcXVlc3Q/LnJlc3BvbnNlPy5zZXRBZ2VudChyZXN1bHQuYWdlbnQsIHJlc3VsdC5jb21tYW5kKTtcblx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRBZ2VudCA9IHJlc3VsdC5hZ2VudDtcblx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRDb21tYW5kID0gcmVzdWx0LmNvbW1hbmQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgYWdlbnQgPSAoZGV0ZWN0ZWRBZ2VudCA/PyBhZ2VudFBhcnQ/LmFnZW50ID8/IGRlZmF1bHRBZ2VudCkhO1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBkZXRlY3RlZENvbW1hbmQgPz8gYWdlbnRTbGFzaENvbW1hbmRQYXJ0Py5jb21tYW5kO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25DaGF0UGFydGljaXBhbnQ6JHthZ2VudC5pZH1gKTtcblxuXHRcdFx0XHRcdC8vIFJlY29tcHV0ZSBoaXN0b3J5IGluIGNhc2UgdGhlIGFnZW50IG9yIGNvbW1hbmQgY2hhbmdlZFxuXHRcdFx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLmdldEhpc3RvcnlFbnRyaWVzRnJvbU1vZGVsKHJlcXVlc3RzLCBsb2NhdGlvbiwgYWdlbnQuaWQpO1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RQcm9wcyA9IGJ1aWxkQWdlbnRSZXF1ZXN0KGFnZW50LCBjb21tYW5kLCBlbmFibGVDb21tYW5kRGV0ZWN0aW9uLCAhIWRldGVjdGVkQWdlbnQpO1xuXHRcdFx0XHRcdHRoaXMuZ2VuZXJhdGVJbml0aWFsQ2hhdFRpdGxlSWZOZWVkZWQobW9kZWwsIHJlcXVlc3RQcm9wcywgZGVmYXVsdEFnZW50LCB0b2tlbik7XG5cdFx0XHRcdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHBlbmRpbmdSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB5aWVsZFJlcXVlc3RlZCA9IHBlbmRpbmdSZXF1ZXN0LnlpZWxkUmVxdWVzdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdFx0aWYgKHJlcXVlc3QpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmNoYXRBZ2VudFNlcnZpY2Uuc2V0WWllbGRSZXF1ZXN0ZWQoYWdlbnQuaWQsIHJlcXVlc3QuaWQsIHlpZWxkUmVxdWVzdGVkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0cGVuZGluZ1JlcXVlc3QucmVxdWVzdElkID8/PSByZXF1ZXN0UHJvcHMucmVxdWVzdElkO1xuXHRcdFx0XHRcdFx0aWYgKHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3RJZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudCwgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50TmFtZSwgeyBhY3Rpb246ICdhZGQnLCBzb3VyY2U6ICdzZW5kUmVxdWVzdElkJywgcmVxdWVzdElkOiBwZW5kaW5nUmVxdWVzdC5yZXF1ZXN0SWQsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKHNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgZm9yIGRpc2FibGVkIENsYXVkZSBDb2RlIGhvb2tzIGFuZCBub3RpZnkgdGhlIHVzZXIgb25jZSBwZXIgd29ya3NwYWNlLlxuXHRcdFx0XHRcdC8vIE9ubHkgc2V0IHRoZSBmbGFnIHdoZW4gYWN0dWFsbHkgc2hvd2luZyB0aGUgaGludCwgc28gdGhlIHNldHVwIGFnZW50IGZsb3dcblx0XHRcdFx0XHQvLyAod2hpY2ggbWF5IHJlc2VuZCByZXF1ZXN0cykgZG9lc24ndCBjb25zdW1lIHRoZSBmbGFnIGJlZm9yZSB0aGUgcmVhbCByZXF1ZXN0IHJ1bnMuXG5cdFx0XHRcdFx0Y29uc3QgZGlzYWJsZWRDbGF1ZGVIb29rc0Rpc21pc3NlZEtleSA9ICdjaGF0LmRpc2FibGVkQ2xhdWRlSG9va3Mubm90aWZpY2F0aW9uJztcblx0XHRcdFx0XHRpZiAoaGFzRGlzYWJsZWRDbGF1ZGVIb29rcyAmJiAhdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGRpc2FibGVkQ2xhdWRlSG9va3NEaXNtaXNzZWRLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGRpc2FibGVkQ2xhdWRlSG9va3NEaXNtaXNzZWRLZXksIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKFt7IGtpbmQ6ICdkaXNhYmxlZENsYXVkZUhvb2tzJyB9XSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTUNQIGF1dG9zdGFydDogb25seSBydW4gZm9yIG5hdGl2ZSBWUyBDb2RlIHNlc3Npb25zIChzaWRlYmFyLCBuZXcgZWRpdG9ycykgYnV0IG5vdCBmb3IgZXh0ZW5zaW9uIGNvbnRyaWJ1dGVkIHNlc3Npb25zIHRoYXQgaGF2ZSBpbnB1dFR5cGUgc2V0LlxuXHRcdFx0XHRcdGlmIChtb2RlbC5jYW5Vc2VUb29scykge1xuXHRcdFx0XHRcdFx0Y29uc3QgYXV0b3N0YXJ0UmVzdWx0ID0gbmV3IENoYXRNY3BTZXJ2ZXJzU3RhcnRpbmcodGhpcy5tY3BTZXJ2aWNlLmF1dG9zdGFydCh0b2tlbikpO1xuXHRcdFx0XHRcdFx0aWYgKCFhdXRvc3RhcnRSZXN1bHQuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKFthdXRvc3RhcnRSZXN1bHRdKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgYXV0b3N0YXJ0UmVzdWx0LndhaXQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBhZ2VudFJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhdEFnZW50U2VydmljZS5pbnZva2VBZ2VudChhZ2VudC5pZCwgcmVxdWVzdFByb3BzLCBwcm9ncmVzc0NhbGxiYWNrLCBoaXN0b3J5LCB0b2tlbik7XG5cdFx0XHRcdFx0cmF3UmVzdWx0ID0gYWdlbnRSZXN1bHQ7XG5cdFx0XHRcdFx0YWdlbnRPckNvbW1hbmRGb2xsb3d1cHMgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0Rm9sbG93dXBzKGFnZW50LmlkLCByZXF1ZXN0UHJvcHMsIGFnZW50UmVzdWx0LCBoaXN0b3J5LCBmb2xsb3d1cHNDYW5jZWxUb2tlbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY29tbWFuZFBhcnQgJiYgdGhpcy5jaGF0U2xhc2hDb21tYW5kU2VydmljZS5oYXNDb21tYW5kKGNvbW1hbmRQYXJ0LnNsYXNoQ29tbWFuZC5jb21tYW5kLCBnZXRDaGF0U2Vzc2lvblR5cGUobW9kZWwuc2Vzc2lvblJlc291cmNlKSkpIHtcblx0XHRcdFx0XHRpZiAoY29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLnNpbGVudCAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0cmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QocGFyc2VkUmVxdWVzdCwgeyB2YXJpYWJsZXM6IFtdIH0sIGF0dGVtcHQsIG9wdGlvbnM/Lm1vZGVJbmZvKTtcblx0XHRcdFx0XHRcdGNvbXBsZXRlUmVzcG9uc2VDcmVhdGVkKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIGNvbnRyaWJ1dGVkIHNsYXNoIGNvbW1hbmRzXG5cdFx0XHRcdFx0Ly8gVE9ETzogc3BlbGwgdGhpcyBvdXQgaW4gdGhlIFVJXG5cdFx0XHRcdFx0Y29uc3QgaGlzdG9yeTogSUNoYXRNZXNzYWdlW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IG1vZGVsUmVxdWVzdCBvZiBtb2RlbC5nZXRSZXF1ZXN0cygpKSB7XG5cdFx0XHRcdFx0XHRpZiAoIW1vZGVsUmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiBtb2RlbFJlcXVlc3QubWVzc2FnZS50ZXh0IH1dIH0pO1xuXHRcdFx0XHRcdFx0aGlzdG9yeS5wdXNoKHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudCwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogbW9kZWxSZXF1ZXN0LnJlc3BvbnNlLnJlc3BvbnNlLnRvU3RyaW5nKCkgfV0gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBwYXJzZWRSZXF1ZXN0LnRleHQ7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZFJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLmNvbW1hbmQsIG1lc3NhZ2Uuc3Vic3RyaW5nKGNvbW1hbmRQYXJ0LnNsYXNoQ29tbWFuZC5jb21tYW5kLmxlbmd0aCArIDEpLnRyaW1TdGFydCgpLCBuZXcgUHJvZ3Jlc3M8SUNoYXRQcm9ncmVzcz4ocCA9PiB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKFtwXSk7XG5cdFx0XHRcdFx0fSksIGhpc3RvcnksIGxvY2F0aW9uLCBtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHRva2VuLCBvcHRpb25zKTtcblx0XHRcdFx0XHRhZ2VudE9yQ29tbWFuZEZvbGxvd3VwcyA9IFByb21pc2UucmVzb2x2ZShjb21tYW5kUmVzdWx0Py5mb2xsb3dVcCk7XG5cdFx0XHRcdFx0cmF3UmVzdWx0ID0ge307XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBoYW5kbGUgcmVxdWVzdGApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiAhcmF3UmVzdWx0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHRcdC8vIFNpbGVudCBzbGFzaCBjb21tYW5kIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkgXHUyMDE0IGFsbG93IHF1ZXVlZFxuXHRcdFx0XHRcdC8vIHJlcXVlc3RzIHRvIHByb2NlZWQuXG5cdFx0XHRcdFx0c2hvdWxkUHJvY2Vzc1BlbmRpbmcgPSAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICghcmF3UmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBQcm92aWRlciByZXR1cm5lZCBubyByZXNwb25zZSBmb3Igc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX1gKTtcblx0XHRcdFx0XHRcdHJhd1Jlc3VsdCA9IHsgZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdlbXB0eVJlc3BvbnNlJywgXCJQcm92aWRlciByZXR1cm5lZCBudWxsIHJlc3BvbnNlXCIpIH0gfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSByYXdSZXN1bHQuZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzRmlsdGVyZWQgPyAnZmlsdGVyZWQnIDpcblx0XHRcdFx0XHRcdHJhd1Jlc3VsdC5lcnJvckRldGFpbHMgJiYgZ290UHJvZ3Jlc3MgPyAnZXJyb3JXaXRoT3V0cHV0JyA6XG5cdFx0XHRcdFx0XHRcdHJhd1Jlc3VsdC5lcnJvckRldGFpbHMgPyAnZXJyb3InIDpcblx0XHRcdFx0XHRcdFx0XHQnc3VjY2Vzcyc7XG5cblx0XHRcdFx0XHRyZXF1ZXN0VGVsZW1ldHJ5LmNvbXBsZXRlKHtcblx0XHRcdFx0XHRcdHRpbWVUb0ZpcnN0UHJvZ3Jlc3M6IHJhd1Jlc3VsdC50aW1pbmdzPy5maXJzdFByb2dyZXNzLFxuXHRcdFx0XHRcdFx0dG90YWxUaW1lOiByYXdSZXN1bHQudGltaW5ncz8udG90YWxFbGFwc2VkLFxuXHRcdFx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRcdFx0cmVxdWVzdFR5cGUsXG5cdFx0XHRcdFx0XHRkZXRlY3RlZEFnZW50LFxuXHRcdFx0XHRcdFx0cmVxdWVzdCxcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdG1vZGVsLnNldFJlc3BvbnNlKHJlcXVlc3QsIHJhd1Jlc3VsdCk7XG5cdFx0XHRcdFx0Y29tcGxldGVSZXNwb25zZUNyZWF0ZWQoKTtcblx0XHRcdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBQcm92aWRlciByZXR1cm5lZCByZXNwb25zZSBmb3Igc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX1gKTtcblxuXHRcdFx0XHRcdGlmIChyYXdSZXN1bHQuZXJyb3JEZXRhaWxzPy5pc1JhdGVMaW1pdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UubWFya0Fub255bW91c1JhdGVMaW1pdGVkKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c2hvdWxkUHJvY2Vzc1BlbmRpbmcgPSAhcmF3UmVzdWx0LmVycm9yRGV0YWlsc1xuXHRcdFx0XHRcdFx0JiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkXG5cdFx0XHRcdFx0XHQmJiAhcmVxdWVzdC5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWUuc29tZSh2ID0+IHYua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicgJiYgIXYuaXNVc2VkKTtcblx0XHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0ZSgpO1xuXG5cdFx0XHRcdFx0aWYgKGFnZW50T3JDb21tYW5kRm9sbG93dXBzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21wbGV0ZWRSZXF1ZXN0ID0gcmVxdWVzdDtcblx0XHRcdFx0XHRcdGFnZW50T3JDb21tYW5kRm9sbG93dXBzLnRoZW4oZm9sbG93dXBzID0+IHtcblx0XHRcdFx0XHRcdFx0bW9kZWwuc2V0Rm9sbG93dXBzKGNvbXBsZXRlZFJlcXVlc3QsIGZvbGxvd3Vwcyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRGb3JUZWxlbWV0cnkgPSBhZ2VudFNsYXNoQ29tbWFuZFBhcnQgPyBhZ2VudFNsYXNoQ29tbWFuZFBhcnQuY29tbWFuZC5uYW1lIDogY29tbWFuZFBhcnQ/LnNsYXNoQ29tbWFuZC5jb21tYW5kO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZVRlbGVtZXRyeS5yZXRyaWV2ZWRGb2xsb3d1cHMoYWdlbnRQYXJ0Py5hZ2VudC5pZCA/PyAnJywgY29tbWFuZEZvclRlbGVtZXRyeSwgZm9sbG93dXBzPy5sZW5ndGggPz8gMCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIGhhbmRsaW5nIGNoYXQgcmVxdWVzdDogJHt0b0Vycm9yTWVzc2FnZShlcnIsIHRydWUpfWApO1xuXHRcdFx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0XHRcdHJlcXVlc3RUZWxlbWV0cnkuY29tcGxldGUoe1xuXHRcdFx0XHRcdFx0dGltZVRvRmlyc3RQcm9ncmVzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dG90YWxUaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdlcnJvcicsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0VHlwZSxcblx0XHRcdFx0XHRcdGRldGVjdGVkQWdlbnQsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnN0IHJhd1Jlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCA9IHsgZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6IGVyci5tZXNzYWdlIH0gfTtcblx0XHRcdFx0XHRtb2RlbC5zZXRSZXNwb25zZShyZXF1ZXN0LCByYXdSZXN1bHQpO1xuXHRcdFx0XHRcdGNvbXBsZXRlUmVzcG9uc2VDcmVhdGVkKCk7XG5cdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGV0IHNob3VsZFByb2Nlc3NQZW5kaW5nID0gZmFsc2U7XG5cdFx0Y29uc3QgcmF3UmVzcG9uc2VQcm9taXNlID0gc2VuZFJlcXVlc3RJbnRlcm5hbCgpO1xuXHRcdC8vIE5vdGUtIHJlcXVlc3RJZCBpcyBub3Qga25vd24gYXQgdGhpcyBwb2ludCwgYXNzaWduZWQgbGF0ZXJcblx0XHRjb25zdCBjYW5jZWxsYWJsZVJlcXVlc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENhbmNlbGxhYmxlUmVxdWVzdCwgc291cmNlLCB1bmRlZmluZWQsIHJhd1Jlc3BvbnNlUHJvbWlzZSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGNhbmNlbGxhYmxlUmVxdWVzdCk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnQsIENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUNsYXNzaWZpY2F0aW9uPihDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudE5hbWUsIHsgYWN0aW9uOiAnYWRkJywgc291cmNlOiAnc2VuZFJlcXVlc3QnLCBjaGF0U2Vzc2lvbklkOiBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpIH0pO1xuXHRcdHJhd1Jlc3BvbnNlUHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdG1hcmtDaGF0KHNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcmZNYXJrLlJlcXVlc3RDb21wbGV0ZSk7XG5cdFx0XHRjbGVhckNoYXRNYXJrcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5nZXQobW9kZWwuc2Vzc2lvblJlc291cmNlKSA9PT0gY2FuY2VsbGFibGVSZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5kZWxldGVBbmREaXNwb3NlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VDbGFzc2lmaWNhdGlvbj4oQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnROYW1lLCB7IGFjdGlvbjogJ3JlbW92ZScsIHNvdXJjZTogJ3NlbmRSZXF1ZXN0Q29tcGxldGUnLCByZXF1ZXN0SWQ6IGNhbmNlbGxhYmxlUmVxdWVzdC5yZXF1ZXN0SWQsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBQcm9jZXNzIHRoZSBuZXh0IHBlbmRpbmcgcmVxdWVzdCBmcm9tIHRoZSBxdWV1ZSBpZiBhbnlcblx0XHRcdGlmIChzaG91bGRQcm9jZXNzUGVuZGluZykge1xuXHRcdFx0XHR0aGlzLnByb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmIChvcHRpb25zPy51c2VyU2VsZWN0ZWRNb2RlbElkICYmICFvcHRpb25zLmlzU3lzdGVtSW5pdGlhdGVkKSB7XG5cdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5hZGRUb1JlY2VudGx5VXNlZExpc3Qob3B0aW9ucy51c2VyU2VsZWN0ZWRNb2RlbElkKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRTdWJtaXRSZXF1ZXN0LmZpcmUoeyBjaGF0U2Vzc2lvblJlc291cmNlOiBtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2U6IHBhcnNlZFJlcXVlc3QgfSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc3BvbnNlQ3JlYXRlZFByb21pc2U6IHJlc3BvbnNlQ3JlYXRlZC5wLFxuXHRcdFx0cmVzcG9uc2VDb21wbGV0ZVByb21pc2U6IHJhd1Jlc3BvbnNlUHJvbWlzZSxcblx0XHR9O1xuXHR9XG5cblx0cHJvY2Vzc1BlbmRpbmdSZXF1ZXN0cyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAobW9kZWwgJiYgIXRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5oYXMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5wcm9jZXNzTmV4dFBlbmRpbmdSZXF1ZXN0KG1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBzZXNzaW9uIGlzIGJhY2tlZCBieSBhbiBhZ2VudCBob3N0IHNlcnZlciwgd2hpY2hcblx0ICogY29udHJvbHMgcXVldWVkLW1lc3NhZ2UgZGVxdWV1aW5nIG9uIHRoZSBzZXJ2ZXIgc2lkZS5cblx0ICovXG5cdHByaXZhdGUgX2lzU2VydmVyTWFuYWdlZFF1ZXVlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpLnN0YXJ0c1dpdGgoJ2FnZW50LWhvc3QtJyk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvY2VzcyB0aGUgbmV4dCBwZW5kaW5nIHJlcXVlc3QgZnJvbSB0aGUgbW9kZWwncyBxdWV1ZSwgaWYgYW55LlxuXHQgKiBDYWxsZWQgYWZ0ZXIgYSByZXF1ZXN0IGNvbXBsZXRlcyB0byBjb250aW51ZSBwcm9jZXNzaW5nIHF1ZXVlZCByZXF1ZXN0cy5cblx0ICogTXVsdGlwbGUgY29uc2VjdXRpdmUgc3RlZXJpbmcgcmVxdWVzdHMgYXJlIGNvbWJpbmVkIGludG8gYSBzaW5nbGUgcmVxdWVzdC5cblx0ICovXG5cdHByaXZhdGUgcHJvY2Vzc05leHRQZW5kaW5nUmVxdWVzdChtb2RlbDogQ2hhdE1vZGVsKTogdm9pZCB7XG5cdFx0Ly8gQWdlbnQgaG9zdCBzZXNzaW9ucyBkZWxlZ2F0ZSBxdWV1ZSBtYW5hZ2VtZW50IHRvIHRoZSBzZXJ2ZXIuXG5cdFx0Ly8gVGhlIHNlcnZlciBkaXNwYXRjaGVzIENoYXRUdXJuU3RhcnRlZCB3aXRoIHF1ZXVlZE1lc3NhZ2VJZCB3aGVuXG5cdFx0Ly8gaXQgY29uc3VtZXMgYSBxdWV1ZWQgbWVzc2FnZSwgc28gdGhlIGNsaWVudCBzaG91bGQgbm90IGRlcXVldWUgZWFnZXJseS5cblx0XHRpZiAodGhpcy5faXNTZXJ2ZXJNYW5hZ2VkUXVldWUobW9kZWwuc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERlcXVldWUgYWxsIGNvbnNlY3V0aXZlIHN0ZWVyaW5nIHJlcXVlc3RzIGFuZCBjb21iaW5lIHRoZW0gaW50byBvbmVcblx0XHRjb25zdCBzdGVlcmluZ1JlcXVlc3RzID0gbW9kZWwuZGVxdWV1ZUFsbFN0ZWVyaW5nUmVxdWVzdHMoKTtcblxuXHRcdC8vIFRoZW4gZGVxdWV1ZSBhIHNpbmdsZSBub24tc3RlZXJpbmcgcmVxdWVzdCBpZiBubyBzdGVlcmluZyB3YXMgZm91bmRcblx0XHRjb25zdCBuZXh0UXVldWVkID0gc3RlZXJpbmdSZXF1ZXN0cy5sZW5ndGggPT09IDAgPyBtb2RlbC5kZXF1ZXVlUGVuZGluZ1JlcXVlc3QoKSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGFsbFJlcXVlc3RzID0gc3RlZXJpbmdSZXF1ZXN0cy5sZW5ndGggPiAwID8gc3RlZXJpbmdSZXF1ZXN0cyA6IChuZXh0UXVldWVkID8gW25leHRRdWV1ZWRdIDogW10pO1xuXHRcdGlmIChhbGxSZXF1ZXN0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyYWNlKCdwcm9jZXNzTmV4dFBlbmRpbmdSZXF1ZXN0JywgYFByb2Nlc3NpbmcgJHthbGxSZXF1ZXN0cy5sZW5ndGh9IHF1ZXVlZCByZXF1ZXN0KHMpIGZvciBzZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfWApO1xuXG5cdFx0Ly8gQ29sbGVjdCBhbmQgcmVtb3ZlIGFsbCBkZWZlcnJlZHNcblx0XHRjb25zdCBkZWZlcnJlZHM6IERlZmVycmVkUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVxIG9mIGFsbFJlcXVlc3RzKSB7XG5cdFx0XHRjb25zdCBkZWZlcnJlZCA9IHRoaXMuX3F1ZXVlZFJlcXVlc3REZWZlcnJlZHMuZ2V0KHJlcS5yZXF1ZXN0LmlkKTtcblx0XHRcdHRoaXMuX3F1ZXVlZFJlcXVlc3REZWZlcnJlZHMuZGVsZXRlKHJlcS5yZXF1ZXN0LmlkKTtcblx0XHRcdGlmIChkZWZlcnJlZCkge1xuXHRcdFx0XHRkZWZlcnJlZHMucHVzaChkZWZlcnJlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgc2VuZCBvcHRpb25zIGZyb20gdGhlIGZpcnN0IHJlcXVlc3QsIGNvbWJpbmluZyBhdHRhY2htZW50cyBmcm9tIGFsbFxuXHRcdGNvbnN0IGZpcnN0UmVxdWVzdCA9IGFsbFJlcXVlc3RzWzBdO1xuXG5cdFx0Ly8gUHJlc2VydmUgdGVybWluYWwgY29ycmVsYXRpb24gb25seSB3aGVuIGFsbCBtZXJnZWQgcmVxdWVzdHMgYWdyZWUgb24gdGhlXG5cdFx0Ly8gc2FtZSB0ZXJtaW5hbC4gV2l0aCBzdWJhZ2VudHMsIG11bHRpcGxlIHRlcm1pbmFscyBjYW4gcXVldWUgc3RlZXJpbmdcblx0XHQvLyByZXF1ZXN0cyBzaW11bHRhbmVvdXNseSBcdTIwMTQgcGlja2luZyBvbmUgYXJiaXRyYXJpbHkgd291bGQgbWlzYXR0cmlidXRlIHRoZVxuXHRcdC8vIG5vdGlmaWNhdGlvbiwgc28gd2UgZHJvcCB0aGUgSUQgd2hlbiB0aGV5IGNvbmZsaWN0LlxuXHRcdGNvbnN0IHRlcm1pbmFsSWRzID0gbmV3IFNldChhbGxSZXF1ZXN0cy5tYXAocmVxID0+IHJlcS5zZW5kT3B0aW9ucy50ZXJtaW5hbEV4ZWN1dGlvbklkKS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+ICEhaWQpKTtcblx0XHRpZiAodGVybWluYWxJZHMuc2l6ZSA+IDEpIHtcblx0XHRcdHRoaXMuaW5mbygncHJvY2Vzc05leHRQZW5kaW5nUmVxdWVzdCcsIGBEcm9wcGluZyB0ZXJtaW5hbEV4ZWN1dGlvbklkOiAke3Rlcm1pbmFsSWRzLnNpemV9IGNvbmZsaWN0aW5nIHRlcm1pbmFsIElEcyAoJHtbLi4udGVybWluYWxJZHNdLmpvaW4oJywgJyl9KWApO1xuXHRcdH1cblx0XHRjb25zdCBtZXJnZWRUZXJtaW5hbEV4ZWN1dGlvbklkID0gdGVybWluYWxJZHMuc2l6ZSA9PT0gMSA/IFsuLi50ZXJtaW5hbElkc11bMF0gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgPSB7XG5cdFx0XHQuLi5maXJzdFJlcXVlc3Quc2VuZE9wdGlvbnMsXG5cdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkOiBtZXJnZWRUZXJtaW5hbEV4ZWN1dGlvbklkLFxuXHRcdFx0YXR0YWNoZWRDb250ZXh0OiBhbGxSZXF1ZXN0cy5mbGF0TWFwKHJlcSA9PiByZXEucmVxdWVzdC52YXJpYWJsZURhdGEudmFyaWFibGVzLnNsaWNlKCkpLFxuXHRcdH07XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHNlbmRPcHRpb25zLmxvY2F0aW9uID8/IHNlbmRPcHRpb25zLmxvY2F0aW9uRGF0YT8udHlwZSA/PyBtb2RlbC5pbml0aWFsTG9jYXRpb247XG5cdFx0Y29uc3QgZGVmYXVsdEFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChsb2NhdGlvbiwgc2VuZE9wdGlvbnMubW9kZUluZm8/LmtpbmQpO1xuXHRcdGlmICghZGVmYXVsdEFnZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigncHJvY2Vzc05leHRQZW5kaW5nUmVxdWVzdCcsIGBObyBkZWZhdWx0IGFnZW50IGZvciBsb2NhdGlvbiAke2xvY2F0aW9ufWApO1xuXHRcdFx0Zm9yIChjb25zdCBkZWZlcnJlZCBvZiBkZWZlcnJlZHMpIHtcblx0XHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoeyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICdObyBkZWZhdWx0IGFnZW50IGF2YWlsYWJsZScgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIG11bHRpcGxlIHN0ZWVyaW5nIHJlcXVlc3RzLCBjb21iaW5lIHRleHRzIGFuZCByZS1wYXJzZTsgb3RoZXJ3aXNlIHVzZSBhcy1pc1xuXHRcdGxldCBwYXJzZWRSZXF1ZXN0OiBJUGFyc2VkQ2hhdFJlcXVlc3Q7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhbGxSZXF1ZXN0cy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGNvbWJpbmVkVGV4dCA9IGFsbFJlcXVlc3RzLm1hcChyZXEgPT4gcmVxLnJlcXVlc3QubWVzc2FnZS50ZXh0KS5qb2luKCdcXG5cXG4nKTtcblx0XHRcdFx0Ly8gbWVzc2FnZS50ZXh0IGFscmVhZHkgaW5jbHVkZXMgYWdlbnQvc2xhc2gtY29tbWFuZCBwcmVmaXhlcyBmcm9tIHRoZVxuXHRcdFx0XHQvLyBvcmlnaW5hbCBwYXJzZSwgc28gY2xlYXIgdGhlbSB0byBhdm9pZCBkb3VibGUtcHJlZml4aW5nLlxuXHRcdFx0XHRwYXJzZWRSZXF1ZXN0ID0gdGhpcy5wYXJzZUNoYXRSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgY29tYmluZWRUZXh0LCBsb2NhdGlvbiwge1xuXHRcdFx0XHRcdC4uLnNlbmRPcHRpb25zLFxuXHRcdFx0XHRcdGFnZW50SWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzbGFzaENvbW1hbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXJzZWRSZXF1ZXN0ID0gZmlyc3RSZXF1ZXN0LnJlcXVlc3QubWVzc2FnZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcigncHJvY2Vzc05leHRQZW5kaW5nUmVxdWVzdDogZmFpbGVkIHRvIHBhcnNlIGNvbWJpbmVkIGNoYXQgcmVxdWVzdCcsIGVycik7XG5cdFx0XHRjb25zdCByZWFzb24gPSB0b0Vycm9yTWVzc2FnZShlcnIpO1xuXHRcdFx0Zm9yIChjb25zdCBkZWZlcnJlZCBvZiBkZWZlcnJlZHMpIHtcblx0XHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoeyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb24gfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2lsZW50QWdlbnQgPSBzZW5kT3B0aW9ucy5hZ2VudElkU2lsZW50ID8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KHNlbmRPcHRpb25zLmFnZW50SWRTaWxlbnQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFnZW50ID0gc2lsZW50QWdlbnQgPz8gcGFyc2VkUmVxdWVzdC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdEFnZW50UGFydCA9PiByIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpPy5hZ2VudCA/PyBkZWZhdWx0QWdlbnQ7XG5cdFx0Y29uc3QgYWdlbnRTbGFzaENvbW1hbmRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQgPT4gciBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCk7XG5cblx0XHRjb25zdCByZXNwb25zZVN0YXRlID0gdGhpcy5fc2VuZFJlcXVlc3RBc3luYyhtb2RlbCwgbW9kZWwuc2Vzc2lvblJlc291cmNlLCBwYXJzZWRSZXF1ZXN0LCBmaXJzdFJlcXVlc3QucmVxdWVzdC5hdHRlbXB0LCAhc2VuZE9wdGlvbnMubm9Db21tYW5kRGV0ZWN0aW9uLCBzaWxlbnRBZ2VudCA/PyBkZWZhdWx0QWdlbnQsIGxvY2F0aW9uLCBzZW5kT3B0aW9ucyk7XG5cblx0XHRjb25zdCByZXN1bHQ6IENoYXRTZW5kUmVzdWx0U2VudCA9IHtcblx0XHRcdGtpbmQ6ICdzZW50Jyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0Li4ucmVzcG9uc2VTdGF0ZSxcblx0XHRcdFx0YWdlbnQsXG5cdFx0XHRcdHNsYXNoQ29tbWFuZDogYWdlbnRTbGFzaENvbW1hbmRQYXJ0Py5jb21tYW5kLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGZvciAoY29uc3QgZGVmZXJyZWQgb2YgZGVmZXJyZWRzKSB7XG5cdFx0XHRkZWZlcnJlZC5jb21wbGV0ZShyZXN1bHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVJbml0aWFsQ2hhdFRpdGxlSWZOZWVkZWQobW9kZWw6IENoYXRNb2RlbCwgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGRlZmF1bHRBZ2VudDogSUNoYXRBZ2VudERhdGEsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHZvaWQge1xuXHRcdC8vIEdlbmVyYXRlIGEgdGl0bGUgb25seSBmb3IgdGhlIGZpcnN0IHJlcXVlc3QsIGFuZCBvbmx5IHZpYSB0aGUgZGVmYXVsdCBhZ2VudC5cblx0XHQvLyBVc2UgYSBzaW5nbGUtZW50cnkgaGlzdG9yeSBiYXNlZCBvbiB0aGUgY3VycmVudCByZXF1ZXN0IChubyBmdWxsIGNoYXQgaGlzdG9yeSkuXG5cdFx0aWYgKG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoICE9PSAxIHx8IG1vZGVsLmN1c3RvbVRpdGxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2luZ2xlRW50cnlIaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5W10gPSBbe1xuXHRcdFx0cmVxdWVzdCxcblx0XHRcdHJlc3BvbnNlOiBbXSxcblx0XHRcdHJlc3VsdDoge31cblx0XHR9XTtcblx0XHRjb25zdCBnZW5lcmF0ZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gYXdhaXQgdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldENoYXRUaXRsZShkZWZhdWx0QWdlbnQuaWQsIHNpbmdsZUVudHJ5SGlzdG9yeSwgdG9rZW4pO1xuXHRcdFx0aWYgKHRpdGxlICYmICFtb2RlbC5jdXN0b21UaXRsZSkge1xuXHRcdFx0XHRtb2RlbC5zZXRDdXN0b21UaXRsZSh0aXRsZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR2b2lkIGdlbmVyYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHByZXBhcmVDb250ZXh0KGF0dGFjaGVkQ29udGV4dFZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0XHRhdHRhY2hlZENvbnRleHRWYXJpYWJsZXMgPz89IFtdO1xuXG5cdFx0Ly8gXCJyZXZlcnNlXCIsIGhpZ2ggaW5kZXggZmlyc3Qgc28gdGhhdCByZXBsYWNlbWVudCBpcyBzaW1wbGVcblx0XHRhdHRhY2hlZENvbnRleHRWYXJpYWJsZXMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Ly8gSWYgZWl0aGVyIHJhbmdlIGlzIHVuZGVmaW5lZCwgc29ydCBpdCB0byB0aGUgYmFja1xuXHRcdFx0aWYgKCFhLnJhbmdlICYmICFiLnJhbmdlKSB7XG5cdFx0XHRcdHJldHVybiAwOyAvLyBLZWVwIHJlbGF0aXZlIG9yZGVyIGlmIGJvdGggcmFuZ2VzIGFyZSB1bmRlZmluZWRcblx0XHRcdH1cblx0XHRcdGlmICghYS5yYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gMTsgLy8gYSBnb2VzIGFmdGVyIGJcblx0XHRcdH1cblx0XHRcdGlmICghYi5yYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gLTE7IC8vIGEgZ29lcyBiZWZvcmUgYlxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGIucmFuZ2Uuc3RhcnQgLSBhLnJhbmdlLnN0YXJ0O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGF0dGFjaGVkQ29udGV4dFZhcmlhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgZ2V0SGlzdG9yeUVudHJpZXNGcm9tTW9kZWwocmVxdWVzdHM6IElDaGF0UmVxdWVzdE1vZGVsW10sIGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbiwgZm9yQWdlbnRJZDogc3RyaW5nKTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdIHtcblx0XHRjb25zdCBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5W10gPSBbXTtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChmb3JBZ2VudElkKTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgcmVxdWVzdHMpIHtcblx0XHRcdGlmICghcmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZvckFnZW50SWQgIT09IHJlcXVlc3QucmVzcG9uc2UuYWdlbnQ/LmlkICYmICFhZ2VudD8uaXNEZWZhdWx0ICYmICFhZ2VudD8uY2FuQWNjZXNzUHJldmlvdXNDaGF0SGlzdG9yeSkge1xuXHRcdFx0XHQvLyBBbiBhZ2VudCBvbmx5IGdldHMgdG8gc2VlIHJlcXVlc3RzIHRoYXQgd2VyZSBzZW50IHRvIHRoaXMgYWdlbnQuXG5cdFx0XHRcdC8vIFRoZSBkZWZhdWx0IGFnZW50ICh0aGUgdW5kZWZpbmVkIGNhc2UpLCBvciBhZ2VudHMgd2l0aCAnY2FuQWNjZXNzUHJldmlvdXNDaGF0SGlzdG9yeScsIGdldCB0byBzZWUgYWxsIG9mIHRoZW0uXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEbyBub3Qgc2F2ZSB0byBoaXN0b3J5IGlubGluZSBjb21wbGV0aW9uc1xuXHRcdFx0aWYgKGxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb21wdFRleHRSZXN1bHQgPSBnZXRQcm9tcHRUZXh0KHJlcXVlc3QubWVzc2FnZSk7XG5cdFx0XHRjb25zdCBoaXN0b3J5UmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QgPSB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVxdWVzdC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkOiByZXF1ZXN0LmlkLFxuXHRcdFx0XHRhZ2VudElkOiByZXF1ZXN0LnJlc3BvbnNlLmFnZW50Py5pZCA/PyAnJyxcblx0XHRcdFx0bWVzc2FnZTogcHJvbXB0VGV4dFJlc3VsdC5tZXNzYWdlLFxuXHRcdFx0XHRjb21tYW5kOiByZXF1ZXN0LnJlc3BvbnNlLnNsYXNoQ29tbWFuZD8ubmFtZSxcblx0XHRcdFx0dmFyaWFibGVzOiB1cGRhdGVSYW5nZXMocmVxdWVzdC52YXJpYWJsZURhdGEsIHByb21wdFRleHRSZXN1bHQuZGlmZiksIC8vIFRPRE8gYml0IG9mIGEgaGFja1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0ZWRpdGVkRmlsZUV2ZW50czogcmVxdWVzdC5lZGl0ZWRGaWxlRXZlbnRzLFxuXHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiByZXF1ZXN0Lm1vZGVJbmZvPy5tb2RlSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0fTtcblx0XHRcdGhpc3RvcnkucHVzaCh7IHJlcXVlc3Q6IGhpc3RvcnlSZXF1ZXN0LCByZXNwb25zZTogdG9DaGF0SGlzdG9yeUNvbnRlbnQocmVxdWVzdC5yZXNwb25zZS5yZXNwb25zZS52YWx1ZSksIHJlc3VsdDogcmVxdWVzdC5yZXNwb25zZS5yZXN1bHQgPz8ge30gfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhpc3Rvcnk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gc2Vzc2lvbjogJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHBlbmRpbmdSZXF1ZXN0Py5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCkge1xuXHRcdFx0cGVuZGluZ1JlcXVlc3QuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnQsIENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUNsYXNzaWZpY2F0aW9uPihDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudE5hbWUsIHsgYWN0aW9uOiAncmVtb3ZlJywgc291cmNlOiAncmVtb3ZlUmVxdWVzdCcsIHJlcXVlc3RJZCwgY2hhdFNlc3Npb25JZDogY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQobW9kZWwuc2Vzc2lvblJlc291cmNlKSB9KTtcblx0XHR9XG5cblx0XHRtb2RlbC5yZW1vdmVSZXF1ZXN0KHJlcXVlc3RJZCk7XG5cdH1cblxuXHRhc3luYyBhZG9wdFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsKSB7XG5cdFx0aWYgKCEocmVxdWVzdCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0TW9kZWwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdDYW4gb25seSBhZG9wdCByZXF1ZXN0cyBvZiB0eXBlIENoYXRSZXF1ZXN0TW9kZWwnKTtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHNlc3Npb246ICR7c2Vzc2lvblJlc291cmNlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZE93bmVyID0gcmVxdWVzdC5zZXNzaW9uO1xuXHRcdHRhcmdldC5hZG9wdFJlcXVlc3QocmVxdWVzdCk7XG5cblx0XHRpZiAocmVxdWVzdC5yZXNwb25zZSAmJiAhcmVxdWVzdC5yZXNwb25zZS5pc0NvbXBsZXRlKSB7XG5cdFx0XHRjb25zdCBjdHMgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlQW5kTGVhayhvbGRPd25lci5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGN0cykge1xuXHRcdFx0XHRjdHMucmVxdWVzdElkID0gcmVxdWVzdC5pZDtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNldCh0YXJnZXQuc2Vzc2lvblJlc291cmNlLCBjdHMpO1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudCwgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50TmFtZSwgeyBhY3Rpb246ICdyZW1vdmUnLCBzb3VyY2U6ICdhZG9wdFJlcXVlc3QnLCByZXF1ZXN0SWQ6IHJlcXVlc3QuaWQsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKG9sZE93bmVyLnNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VDbGFzc2lmaWNhdGlvbj4oQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnROYW1lLCB7IGFjdGlvbjogJ2FkZCcsIHNvdXJjZTogJ2Fkb3B0UmVxdWVzdCcsIHJlcXVlc3RJZDogcmVxdWVzdC5pZCwgY2hhdFNlc3Npb25JZDogY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQodGFyZ2V0LnNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYWRkQ29tcGxldGVSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZTogVVJJLCBtZXNzYWdlOiBJUGFyc2VkQ2hhdFJlcXVlc3QgfCBzdHJpbmcsIHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhIHwgdW5kZWZpbmVkLCBhdHRlbXB0OiBudW1iZXIgfCB1bmRlZmluZWQsIHJlc3BvbnNlOiBJQ2hhdENvbXBsZXRlUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdhZGRDb21wbGV0ZVJlcXVlc3QnLCBgbWVzc2FnZTogJHttZXNzYWdlfWApO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBzZXNzaW9uOiAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID9cblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpLnBhcnNlQ2hhdFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCBtZXNzYWdlKSA6XG5cdFx0XHRtZXNzYWdlO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHBhcnNlZFJlcXVlc3QsIHZhcmlhYmxlRGF0YSB8fCB7IHZhcmlhYmxlczogW10gfSwgYXR0ZW1wdCA/PyAwLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRpZiAodHlwZW9mIHJlc3BvbnNlLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHQvLyBUT0RPIGlzIHRoaXMgcG9zc2libGU/XG5cdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHJlc3BvbnNlLm1lc3NhZ2UpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLm1lc3NhZ2UpIHtcblx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBwYXJ0LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0bW9kZWwuc2V0UmVzcG9uc2UocmVxdWVzdCwgcmVzcG9uc2UucmVzdWx0IHx8IHt9KTtcblx0XHRpZiAocmVzcG9uc2UuZm9sbG93dXBzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG1vZGVsLnNldEZvbGxvd3VwcyhyZXF1ZXN0LCByZXNwb25zZS5mb2xsb3d1cHMpO1xuXHRcdH1cblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0ZSgpO1xuXHR9XG5cblx0YXN5bmMgY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzb3VyY2U/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNlKCdjYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24nLCBgc2Vzc2lvbjogJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFwZW5kaW5nUmVxdWVzdCkge1xuXHRcdFx0aWYgKHNvdXJjZSAhPT0gJ2FyY2hpdmUnKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdEluUHJvZ3Jlc3MgPSBtb2RlbD8ucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0c0NvdW50ID0gbW9kZWw/LmdldFBlbmRpbmdSZXF1ZXN0cygpLmxlbmd0aCA/PyAwO1xuXHRcdFx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IG1vZGVsPy5sYXN0UmVxdWVzdDtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wRXZlbnQsIENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcENsYXNzaWZpY2F0aW9uPihDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudE5hbWUsIHtcblx0XHRcdFx0XHRzb3VyY2U6IHNvdXJjZSA/PyAnY2hhdFNlcnZpY2UnLFxuXHRcdFx0XHRcdHJlYXNvbjogJ25vUGVuZGluZ1JlcXVlc3QnLFxuXHRcdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiByZXF1ZXN0SW5Qcm9ncmVzcyA9PT0gdW5kZWZpbmVkID8gJ3Vua25vd24nIDogcmVxdWVzdEluUHJvZ3Jlc3MgPyAndHJ1ZScgOiAnZmFsc2UnLFxuXHRcdFx0XHRcdHBlbmRpbmdSZXF1ZXN0czogcGVuZGluZ1JlcXVlc3RzQ291bnQsXG5cdFx0XHRcdFx0c2Vzc2lvblNjaGVtZTogc2Vzc2lvblJlc291cmNlLnNjaGVtZSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdElkOiBsYXN0UmVxdWVzdD8uaWQsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25JZDogY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQoc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuaW5mbygnY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uJywgYE5vIHBlbmRpbmcgcmVxdWVzdCB3YXMgZm91bmQgZm9yIHNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2V9LiByZXF1ZXN0SW5Qcm9ncmVzcz0ke3JlcXVlc3RJblByb2dyZXNzID8/ICd1bmtub3duJ30sIHBlbmRpbmdSZXF1ZXN0cz0ke3BlbmRpbmdSZXF1ZXN0c0NvdW50fWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlID0gcGVuZGluZ1JlcXVlc3QucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdFx0cGVuZGluZ1JlcXVlc3QuY2FuY2VsKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudCwgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50TmFtZSwgeyBhY3Rpb246ICdyZW1vdmUnLCBzb3VyY2U6IHNvdXJjZSA/PyAnY2FuY2VsUmVxdWVzdCcsIHJlcXVlc3RJZDogcGVuZGluZ1JlcXVlc3QucmVxdWVzdElkLCBjaGF0U2Vzc2lvbklkOiBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChzZXNzaW9uUmVzb3VyY2UpIH0pO1xuXG5cdFx0aWYgKHJlc3BvbnNlQ29tcGxldGVQcm9taXNlKSB7XG5cdFx0XHRhd2FpdCByYWNlVGltZW91dChyZXNwb25zZUNvbXBsZXRlUHJvbWlzZSwgMTAwMCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0WWllbGRSZXF1ZXN0ZWQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdCA9IHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAocGVuZGluZ1JlcXVlc3QpIHtcblx0XHRcdHBlbmRpbmdSZXF1ZXN0LnNldFlpZWxkUmVxdWVzdGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0bWlncmF0ZVJlcXVlc3RzKG9yaWdpbmFsUmVzb3VyY2U6IFVSSSwgdGFyZ2V0UmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQob3JpZ2luYWxSZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0cyA9IFsuLi5tb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKV07XG5cblx0XHRpZiAocGVuZGluZ1JlcXVlc3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBlYWNoIHJlbWFpbmluZyBwZW5kaW5nIHJlcXVlc3QgZnJvbSB0aGUgb3JpZ2luYWwgc2Vzc2lvblxuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiBwZW5kaW5nUmVxdWVzdHMpIHtcblx0XHRcdHRoaXMucmVtb3ZlUGVuZGluZ1JlcXVlc3Qob3JpZ2luYWxSZXNvdXJjZSwgcGVuZGluZy5yZXF1ZXN0LmlkKTtcblx0XHR9XG5cblx0XHQvLyBSZS1zZW5kIHJlbWFpbmluZyBxdWV1ZWQgcmVxdWVzdHNcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgcGVuZGluZ1JlcXVlc3RzKSB7XG5cdFx0XHR2b2lkIHRoaXMuc2VuZFJlcXVlc3QodGFyZ2V0UmVzb3VyY2UsIHBlbmRpbmcucmVxdWVzdC5tZXNzYWdlLnRleHQsIHtcblx0XHRcdFx0Li4ucGVuZGluZy5zZW5kT3B0aW9ucyxcblx0XHRcdFx0cXVldWU6IHBlbmRpbmcua2luZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZVBlbmRpbmdSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKSBhcyBDaGF0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRtb2RlbC5yZW1vdmVQZW5kaW5nUmVxdWVzdChyZXF1ZXN0SWQpO1xuXG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgbm8gbW9yZSBzdGVlcmluZyByZXF1ZXN0cyBwZW5kaW5nLCByZXNldCB5aWVsZFJlcXVlc3RlZCBvbiB0aGUgYWN0aXZlIHJlcXVlc3Rcblx0XHRcdGNvbnN0IGhhc1N0ZWVyaW5nUmVxdWVzdHMgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5zb21lKHIgPT4gci5raW5kID09PSBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyk7XG5cdFx0XHRpZiAoIWhhc1N0ZWVyaW5nUmVxdWVzdHMpIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHBlbmRpbmdSZXF1ZXN0Py5yZXNldFlpZWxkUmVxdWVzdGVkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVqZWN0IHRoZSBkZWZlcnJlZCBwcm9taXNlIGZvciB0aGUgcmVtb3ZlZCByZXF1ZXN0XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSB0aGlzLl9xdWV1ZWRSZXF1ZXN0RGVmZXJyZWRzLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmIChkZWZlcnJlZCkge1xuXHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoeyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICdSZXF1ZXN0IHdhcyByZW1vdmVkIGZyb20gcXVldWUnIH0pO1xuXHRcdFx0dGhpcy5fcXVldWVkUmVxdWVzdERlZmVycmVkcy5kZWxldGUocmVxdWVzdElkKTtcblx0XHR9XG5cdH1cblxuXHRzZXRQZW5kaW5nUmVxdWVzdHMoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlcXVlc3RzOiByZWFkb25seSB7IHJlcXVlc3RJZDogc3RyaW5nOyBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZCB9W10pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0bW9kZWwuc2V0UGVuZGluZ1JlcXVlc3RzKHJlcXVlc3RzKTtcblx0XHR9XG5cdH1cblxuXHRzeW5jUGVuZGluZ1JlcXVlc3RzRnJvbVJlbW90ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdHM6IHJlYWRvbmx5IElSZW1vdGVQZW5kaW5nUmVxdWVzdFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChzZXNzaW9uUmVzb3VyY2UpIGFzIENoYXRNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRjb25zdCBleGlzdGluZ0J5SWQgPSBuZXcgTWFwKGV4aXN0aW5nLm1hcChyZXF1ZXN0ID0+IFtyZXF1ZXN0LnJlcXVlc3QuaWQsIHJlcXVlc3RdKSk7XG5cdFx0Y29uc3QgcmVjb25jaWxlZDogSUNoYXRQZW5kaW5nUmVxdWVzdFtdID0gcmVxdWVzdHMubWFwKHJlbW90ZSA9PiB7XG5cdFx0XHRjb25zdCB2YXJpYWJsZURhdGEgPSByZW1vdGUudmFyaWFibGVEYXRhID8/IHsgdmFyaWFibGVzOiBbXSB9O1xuXHRcdFx0Y29uc3QgbG9jYWwgPSBleGlzdGluZ0J5SWQuZ2V0KHJlbW90ZS5pZCk7XG5cdFx0XHRpZiAobG9jYWwgJiYgbG9jYWwucmVxdWVzdC5tZXNzYWdlLnRleHQgPT09IHJlbW90ZS5tZXNzYWdlICYmIGVxdWFscyhsb2NhbC5yZXF1ZXN0LnZhcmlhYmxlRGF0YSwgdmFyaWFibGVEYXRhKSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWwua2luZCA9PT0gcmVtb3RlLmtpbmQgPyBsb2NhbCA6IHsgLi4ubG9jYWwsIGtpbmQ6IHJlbW90ZS5raW5kIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdGhpcy5wYXJzZUNoYXRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgcmVtb3RlLm1lc3NhZ2UsIG1vZGVsLmluaXRpYWxMb2NhdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RNb2RlbCA9IG5ldyBDaGF0UmVxdWVzdE1vZGVsKHtcblx0XHRcdFx0c2Vzc2lvbjogbW9kZWwsXG5cdFx0XHRcdG1lc3NhZ2U6IHBhcnNlZFJlcXVlc3QsXG5cdFx0XHRcdHZhcmlhYmxlRGF0YSxcblx0XHRcdFx0dGltZXN0YW1wOiByZW1vdGUudGltZXN0YW1wLFxuXHRcdFx0XHRhdHRhY2hlZENvbnRleHQ6IHZhcmlhYmxlRGF0YS52YXJpYWJsZXMuc2xpY2UoKSxcblx0XHRcdFx0cmVzdG9yZWRJZDogcmVtb3RlLmlkLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyByZXF1ZXN0OiByZXF1ZXN0TW9kZWwsIGtpbmQ6IHJlbW90ZS5raW5kLCBzZW5kT3B0aW9uczogbG9jYWw/LnNlbmRPcHRpb25zID8/IHt9IH07XG5cdFx0fSk7XG5cblx0XHRpZiAoZXhpc3RpbmcubGVuZ3RoID09PSByZWNvbmNpbGVkLmxlbmd0aCAmJiByZWNvbmNpbGVkLmV2ZXJ5KChyZXF1ZXN0LCBpbmRleCkgPT4gZXhpc3RpbmdbaW5kZXhdID09PSByZXF1ZXN0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlY29uY2lsZWRJZHMgPSBuZXcgU2V0KHJlY29uY2lsZWQubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5yZXF1ZXN0LmlkKSk7XG5cdFx0bW9kZWwucmVwbGFjZVBlbmRpbmdSZXF1ZXN0cyhyZWNvbmNpbGVkKTtcblxuXHRcdGZvciAoY29uc3QgbG9jYWwgb2YgZXhpc3RpbmcpIHtcblx0XHRcdGlmIChyZWNvbmNpbGVkSWRzLmhhcyhsb2NhbC5yZXF1ZXN0LmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlZmVycmVkID0gdGhpcy5fcXVldWVkUmVxdWVzdERlZmVycmVkcy5nZXQobG9jYWwucmVxdWVzdC5pZCk7XG5cdFx0XHRpZiAoZGVmZXJyZWQpIHtcblx0XHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoeyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICdSZXF1ZXN0IHdhcyByZW1vdmVkIGZyb20gcXVldWUnIH0pO1xuXHRcdFx0XHR0aGlzLl9xdWV1ZWRSZXF1ZXN0RGVmZXJyZWRzLmRlbGV0ZShsb2NhbC5yZXF1ZXN0LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXJlY29uY2lsZWQuc29tZShyZXF1ZXN0ID0+IHJlcXVlc3Qua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk/LnJlc2V0WWllbGRSZXF1ZXN0ZWQoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZW5kUGVuZGluZ1JlcXVlc3RJbW1lZGlhdGVseShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdHMgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBwZW5kaW5nUmVxdWVzdHMuZmluZChyID0+IHIucmVxdWVzdC5pZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc1NlcnZlck1hbmFnZWRRdWV1ZShzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHQvLyBBZ2VudCBob3N0IHF1ZXVlcyBhcmUgZHJhaW5lZCBieSB0aGUgc2VydmVyLCB3aGljaCBpbnRlbnRpb25hbGx5XG5cdFx0XHQvLyBza2lwcyBwZW5kaW5nIG1lc3NhZ2VzIG9uIGNhbmNlbGxhdGlvbi4gU28gcmVtb3ZlIHRoZSBtZXNzYWdlXG5cdFx0XHQvLyAoY2xlYXJpbmcgaXQgc2VydmVyLXNpZGUpIGFuZCByZS1zZW5kIGl0IGFzIGEgbm9ybWFsIHR1cm4gYWZ0ZXJcblx0XHRcdC8vIGNhbmNlbGxpbmcuIFJlbW92ZSBiZWZvcmUgc2VuZGluZyB0byBhdm9pZCB0aGUgc2VydmVyIGFsc29cblx0XHRcdC8vIGF1dG8tZHJhaW5pbmcgaXQgKGRvdWJsZSBzZW5kKTsgcmVzdG9yZSBpdCBvbiBmYWlsdXJlIHNvIGFcblx0XHRcdC8vIHJlamVjdGVkIHJlLXNlbmQgZG9lc24ndCBzaWxlbnRseSBkcm9wIHRoZSBtZXNzYWdlLlxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRhcmdldC5yZXF1ZXN0Lm1lc3NhZ2UudGV4dDtcblx0XHRcdGNvbnN0IGF0dGFjaGVkQ29udGV4dCA9IHRhcmdldC5yZXF1ZXN0LnZhcmlhYmxlRGF0YS52YXJpYWJsZXMuc2xpY2UoKTtcblx0XHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdFx0Li4udGFyZ2V0LnNlbmRPcHRpb25zLFxuXHRcdFx0XHRxdWV1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRhdHRhY2hlZENvbnRleHQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5yZW1vdmVQZW5kaW5nUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZCk7XG5cdFx0XHRhd2FpdCB0aGlzLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsICdxdWV1ZVJ1bk5leHQnKTtcblx0XHRcdGxldCByZXN1bHQ6IENoYXRTZW5kUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2UsIHNlbmRPcHRpb25zKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3NlbmRQZW5kaW5nUmVxdWVzdEltbWVkaWF0ZWx5OiByZS1zZW5kIGZhaWxlZCcsIGVycik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlc3VsdCB8fCByZXN1bHQua2luZCA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHR0aGlzLmluZm8oJ3NlbmRQZW5kaW5nUmVxdWVzdEltbWVkaWF0ZWx5JywgYFJlLXNlbmQgd2FzIG5vdCBhY2NlcHRlZCAoJHtyZXN1bHQ/LmtpbmQgPz8gJ2Vycm9yJ30pOyByZXN0b3JpbmcgcGVuZGluZyBtZXNzYWdlIHRvIHRoZSBxdWV1ZWApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgbWVzc2FnZSwgeyAuLi5zZW5kT3B0aW9ucywgYXR0YWNoZWRDb250ZXh0LCBxdWV1ZTogdGFyZ2V0LmtpbmQgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTG9jYWwgc2Vzc2lvbnM6IG1vdmUgdGhlIHRhcmdldCB0byB0aGUgZnJvbnQgKGtlZXBpbmcgaXRzIGtpbmQpLFxuXHRcdC8vIGNhbmNlbCB0aGUgaW4tZmxpZ2h0IHJlcXVlc3QsIGFuZCBsZXQgdGhlIHF1ZXVlIHByb2Nlc3NvciBzZW5kIGl0LlxuXHRcdGNvbnN0IHJlb3JkZXJlZCA9IFtcblx0XHRcdHsgcmVxdWVzdElkOiB0YXJnZXQucmVxdWVzdC5pZCwga2luZDogdGFyZ2V0LmtpbmQgfSxcblx0XHRcdC4uLnBlbmRpbmdSZXF1ZXN0cy5maWx0ZXIociA9PiByLnJlcXVlc3QuaWQgIT09IHJlcXVlc3RJZCkubWFwKHIgPT4gKHsgcmVxdWVzdElkOiByLnJlcXVlc3QuaWQsIGtpbmQ6IHIua2luZCB9KSksXG5cdFx0XTtcblx0XHR0aGlzLnNldFBlbmRpbmdSZXF1ZXN0cyhzZXNzaW9uUmVzb3VyY2UsIHJlb3JkZXJlZCk7XG5cdFx0YXdhaXQgdGhpcy5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCAncXVldWVSdW5OZXh0Jyk7XG5cdFx0dGhpcy5wcm9jZXNzUGVuZGluZ1JlcXVlc3RzKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgaGFzU2Vzc2lvbnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuaGFzU2Vzc2lvbnMoKTtcblx0fVxuXG5cdGFzeW5jIHRyYW5zZmVyQ2hhdFNlc3Npb24odHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9Xb3Jrc3BhY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghTG9jYWxDaGF0U2Vzc2lvblVyaS5pc0xvY2FsU2Vzc2lvbih0cmFuc2ZlcnJlZFNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2FuIG9ubHkgdHJhbnNmZXIgbG9jYWwgY2hhdCBzZXNzaW9ucy4gSW52YWxpZCBzZXNzaW9uOiAke3RyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQodHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UpIGFzIENoYXRNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byB0cmFuc2ZlciBzZXNzaW9uLiBVbmtub3duIHNlc3Npb246ICR7dHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLmluaXRpYWxMb2NhdGlvbiAhPT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW4gb25seSB0cmFuc2ZlciBjaGF0IHNlc3Npb25zIGxvY2F0ZWQgaW4gdGhlIENoYXQgdmlldy4gU2Vzc2lvbiAke3RyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlfSBoYXMgbG9jYXRpb249JHttb2RlbC5pbml0aWFsTG9jYXRpb259YCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IG1vZGVsLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHRpbWVzdGFtcEluTWlsbGlzZWNvbmRzOiBEYXRlLm5vdygpLFxuXHRcdFx0dG9Xb3Jrc3BhY2U6IHRvV29ya3NwYWNlLFxuXHRcdH0sIG1vZGVsKTtcblx0XHR0aGlzLmNoYXRUcmFuc2ZlclNlcnZpY2UuYWRkV29ya3NwYWNlVG9UcmFuc2ZlcnJlZCh0b1dvcmtzcGFjZSk7XG5cdFx0dGhpcy50cmFjZSgndHJhbnNmZXJDaGF0U2Vzc2lvbicsIGBUcmFuc2ZlcnJlZCBzZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfSB0byB3b3Jrc3BhY2UgJHt0b1dvcmtzcGFjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0Z2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5nZXRDaGF0U3RvcmFnZUZvbGRlcigpO1xuXHR9XG5cblx0bG9nQ2hhdEluZGV4KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUubG9nSW5kZXgoKTtcblx0fVxuXG5cdHNldFNlc3Npb25UaXRsZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk/LnNldEN1c3RvbVRpdGxlKHRpdGxlKTtcblx0fVxuXG5cdGFwcGVuZFByb2dyZXNzKHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsLCBwcm9ncmVzczogSUNoYXRQcm9ncmVzcyk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQocmVxdWVzdC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCEocmVxdWVzdCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0TW9kZWwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdDYW4gb25seSBhcHBlbmQgcHJvZ3Jlc3MgdG8gcmVxdWVzdHMgb2YgdHlwZSBDaGF0UmVxdWVzdE1vZGVsJyk7XG5cdFx0fVxuXG5cdFx0bW9kZWw/LmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcHJvZ3Jlc3MpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0xvY2FsU2Vzc2lvbklkKHNlc3Npb25SZXNvdXJjZTogVVJJKSB7XG5cdFx0Y29uc3QgbG9jYWxTZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWxvY2FsU2Vzc2lvbklkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbG9jYWwgY2hhdCBzZXNzaW9uIHJlc291cmNlOiAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsU2Vzc2lvbklkO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjaGF0TW9kZWxUb0NoYXREZXRhaWwobW9kZWw6IElDaGF0TW9kZWwpOiBQcm9taXNlPElDaGF0RGV0YWlsPiB7XG5cdGNvbnN0IHRpdGxlID0gbW9kZWwudGl0bGUgfHwgbG9jYWxpemUoJ25ld0NoYXQnLCBcIk5ldyBDaGF0XCIpO1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25SZXNvdXJjZTogbW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdHRpdGxlLFxuXHRcdGxhc3RNZXNzYWdlRGF0ZTogbW9kZWwubGFzdE1lc3NhZ2VEYXRlLFxuXHRcdHRpbWluZzogbW9kZWwudGltaW5nLFxuXHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdHN0YXRzOiBhd2FpdCBhd2FpdFN0YXRzRm9yU2Vzc2lvbihtb2RlbCksXG5cdFx0bGFzdFJlc3BvbnNlU3RhdGU6IG1vZGVsLmxhc3RSZXF1ZXN0Py5yZXNwb25zZT8uc3RhdGUgPz8gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogbW9kZWwud29ya2luZ0RpcmVjdG9yeSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUIsdUJBQXVCLG1CQUFtQjtBQUNwRSxTQUFTLG1CQUFtQiwrQkFBK0I7QUFFM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0Isd0JBQXdCO0FBQ3JELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLHVCQUF1QixpQkFBOEIseUJBQXlCO0FBQ25HLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLFNBQTJDLHVCQUF1QjtBQUNwRixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMs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RUFBRSxtQkFBbUIsbUJBQW1CO0FBQzNDLFlBQU0sSUFBSSxtQkFBbUIsK0RBQStEO0FBQUEsSUFDN0Y7QUFFQSxXQUFPLHVCQUF1QixTQUFTLFFBQVE7QUFBQSxFQUNoRDtBQUFBLEVBRVEsaUJBQWlCLGlCQUFzQjtBQUM5QyxVQUFNLGlCQUFpQixvQkFBb0Isb0JBQW9CLGVBQWU7QUFDOUUsUUFBSSxDQUFDLGdCQUFnQjtBQUNwQixZQUFNLElBQUksTUFBTSx3Q0FBd0MsZUFBZSxFQUFFO0FBQUEsSUFDMUU7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBL25FYSxjQUFOO0FBQUEsRUF1RUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXRGVTtBQWlvRWIsZUFBc0Isc0JBQXNCLE9BQXlDO0FBQ3BGLFFBQU0sUUFBUSxNQUFNLFNBQVMsU0FBUyxXQUFXLFVBQVU7QUFDM0QsU0FBTztBQUFBLElBQ04saUJBQWlCLE1BQU07QUFBQSxJQUN2QjtBQUFBLElBQ0EsaUJBQWlCLE1BQU07QUFBQSxJQUN2QixRQUFRLE1BQU07QUFBQSxJQUNkLFVBQVU7QUFBQSxJQUNWLE9BQU8sTUFBTSxxQkFBcUIsS0FBSztBQUFBLElBQ3ZDLG1CQUFtQixNQUFNLGFBQWEsVUFBVSxTQUFTLG1CQUFtQjtBQUFBLElBQzVFLGtCQUFrQixNQUFNO0FBQUEsRUFDekI7QUFDRDsiLAogICJuYW1lcyI6IFsidG9rZW4iLCAicmVxdWVzdCIsICJhZ2VudCIsICJjb21tYW5kIiwgImVuYWJsZUNvbW1hbmREZXRlY3Rpb24iXQp9Cg==
