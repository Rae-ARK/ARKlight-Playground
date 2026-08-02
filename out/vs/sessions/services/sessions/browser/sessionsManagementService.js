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
import { Emitter } from "../../../../base/common/event.js";
import { raceCancellationError } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { agentHostAuthority } from "../../../../platform/agentHost/common/agentHostUri.js";
import { IRemoteAgentHostService } from "../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IChatService } from "../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ChatAgentLocation } from "../../../../workbench/contrib/chat/common/constants.js";
import { IChatWidgetHistoryService } from "../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js";
import { buildHostLocalEventsPath, getCopilotCliSessionRawId } from "../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js";
import { IPathService } from "../../../../workbench/services/path/common/pathService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { getSessionReferenceResource } from "./sessionReference.js";
import { ISessionsManagementService, WorkspaceNotTrustedError } from "../common/sessionsManagement.js";
import { ISessionsProvidersService } from "./sessionsProvidersService.js";
import { SessionStatus } from "../common/session.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
const LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY = "sessions.quickChat.lastUsedSessionType";
let SessionsManagementService = class extends Disposable {
  constructor(logService, sessionsProvidersService, uriIdentityService, chatService, chatWidgetHistoryService, storageService, pathService, remoteAgentHostService, workspaceTrustManagementService) {
    super();
    this.logService = logService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.uriIdentityService = uriIdentityService;
    this.chatService = chatService;
    this.chatWidgetHistoryService = chatWidgetHistoryService;
    this.storageService = storageService;
    this.pathService = pathService;
    this.remoteAgentHostService = remoteAgentHostService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidStartSession = this._register(new Emitter());
    this.onDidStartSession = this._onDidStartSession.event;
    this._onWillSendRequest = this._register(new Emitter());
    this.onWillSendRequest = this._onWillSendRequest.event;
    this._onDidSendRequest = this._register(new Emitter());
    this.onDidSendRequest = this._onDidSendRequest.event;
    this._onDidArchiveSession = this._register(new Emitter());
    this.onDidArchiveSession = this._onDidArchiveSession.event;
    this._onDidUnarchiveSession = this._register(new Emitter());
    this.onDidUnarchiveSession = this._onDidUnarchiveSession.event;
    this._onDidDeleteSession = this._register(new Emitter());
    this.onDidDeleteSession = this._onDidDeleteSession.event;
    this._onDidDeleteChat = this._register(new Emitter());
    this.onDidDeleteChat = this._onDidDeleteChat.event;
    this._onDidRenameChat = this._register(new Emitter());
    this.onDidRenameChat = this._onDidRenameChat.event;
    this._onDidRenameSession = this._register(new Emitter());
    this.onDidRenameSession = this._onDidRenameSession.event;
    this._onDidChangeSessionTypes = this._register(new Emitter());
    this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
    this._onDidReplaceSession = this._register(new Emitter());
    this.onDidReplaceSession = this._onDidReplaceSession.event;
    this._onDidDiscardNewSession = this._register(new Emitter());
    this.onDidDiscardNewSession = this._onDidDiscardNewSession.event;
    this._onDidReplaceNewDraftSession = this._register(new Emitter());
    this.onDidReplaceNewDraftSession = this._onDidReplaceNewDraftSession.event;
    this._sessionTypes = [];
    /** Tracks the in-progress new session (composed but not yet sent). */
    this._newSession = observableValue(this, void 0);
    this.newSession = this._newSession;
    this._providerListeners = this._register(new DisposableMap());
    this._disposeCts = this._register(new CancellationTokenSource());
    /**
     * Chat resources for which this service has just kicked off a
     * `provider.sendRequest` and will emit `_onDidSendRequest` manually after
     * the provider call resolves. Used to suppress the duplicate event that
     * would otherwise arrive via {@link IChatService.onDidSubmitRequest},
     * which fires synchronously inside the same provider call.
     */
    this._pendingSendChatResources = /* @__PURE__ */ new Set();
    this._register(this.sessionsProvidersService.onDidChangeProviders((e) => {
      this._onProvidersChanged(e);
      this._updateSessionTypes();
    }));
    this._subscribeToProviders(this.sessionsProvidersService.getProviders());
    this._sessionTypes = this._collectSessionTypes();
    this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource, message }) => {
      if (this._pendingSendChatResources.has(chatSessionResource.toString())) {
        return;
      }
      const ownedChat = this.getSessionForChatResource(chatSessionResource);
      if (ownedChat) {
        this._onDidSendRequest.fire({
          session: ownedChat.session,
          chat: ownedChat.chat,
          isNewSession: false,
          isNewChat: false,
          options: { query: message?.text ?? "" }
        });
      }
    }));
  }
  _onProvidersChanged(e) {
    for (const provider of e.removed) {
      this._providerListeners.deleteAndDispose(provider.id);
    }
    if (e.added.length) {
      this._subscribeToProviders(e.added);
    }
  }
  _subscribeToProviders(providers) {
    for (const provider of providers) {
      const disposables = new DisposableStore();
      disposables.add(provider.onDidChangeSessions((e) => this.onDidChangeSessionsFromSessionsProviders(e)));
      if (provider.onDidReplaceSession) {
        disposables.add(provider.onDidReplaceSession((e) => this._handleDidReplaceSession(e.from, e.to)));
      }
      if (provider.onDidChangeSessionTypes) {
        disposables.add(provider.onDidChangeSessionTypes(() => this._updateSessionTypes()));
      }
      this._providerListeners.set(provider.id, disposables);
    }
  }
  _handleDidReplaceSession(from, to) {
    this.chatWidgetHistoryService.moveHistory(ChatAgentLocation.Chat, from.sessionId, to.sessionId);
    this._onDidReplaceSession.fire({ from, to });
    this._onDidChangeSessions.fire({
      added: [],
      removed: from.sessionId === to.sessionId ? [] : [from],
      changed: [to]
    });
  }
  onDidChangeSessionsFromSessionsProviders(e) {
    if (e.removed.length) {
      const current = this._newSession.get();
      if (current && e.removed.some((r) => r.sessionId === current.sessionId)) {
        this._newSession.set(void 0, void 0);
      }
    }
    this._onDidChangeSessions.fire(e);
  }
  getSessions() {
    const sessions = [];
    for (const provider of this.sessionsProvidersService.getProviders()) {
      sessions.push(...provider.getSessions());
    }
    return sessions;
  }
  getSession(resource) {
    return this.getSessions().find(
      (s) => this.uriIdentityService.extUri.isEqual(s.resource, resource)
    );
  }
  getSessionForChatResource(resource) {
    for (const session of this.getSessions()) {
      const chat = session.chats.get().find((c) => this.uriIdentityService.extUri.isEqual(c.resource, resource));
      if (chat) {
        return { session, chat };
      }
      const mainChat = session.mainChat.get();
      if (this.uriIdentityService.extUri.isEqual(mainChat.resource, resource)) {
        return { session, chat: mainChat };
      }
    }
    return void 0;
  }
  getAllSessionTypes() {
    return [...this._sessionTypes];
  }
  getSessionTypesForFolder(folderUri) {
    const result = [];
    for (const provider of this.sessionsProvidersService.getProviders()) {
      if (!provider.resolveWorkspace(folderUri)) {
        continue;
      }
      for (const sessionType of provider.getSessionTypes(folderUri)) {
        result.push({ providerId: provider.id, sessionType });
      }
    }
    return result;
  }
  getQuickChatSessionTypes() {
    const result = [];
    for (const provider of this.sessionsProvidersService.getProviders()) {
      if (!provider.supportsQuickChats) {
        continue;
      }
      for (const sessionType of provider.sessionTypes) {
        result.push({ providerId: provider.id, sessionType });
      }
    }
    return result;
  }
  isNewSessionTargetAvailable(folderUri, options) {
    return this._isTargetAvailable(this.getSessionTypesForFolder(folderUri), options);
  }
  isQuickChatTargetAvailable(options) {
    return this._isTargetAvailable(this.getQuickChatSessionTypes(), options);
  }
  _isTargetAvailable(sessionTypes, options) {
    return sessionTypes.some(
      (candidate) => (!options?.providerId || candidate.providerId === options.providerId) && (!options?.sessionTypeId || candidate.sessionType.id === options.sessionTypeId)
    );
  }
  resolveWorkspace(folderUri, preferredProviderId) {
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
  _collectSessionTypes() {
    const types = [];
    const seen = /* @__PURE__ */ new Set();
    for (const provider of this.sessionsProvidersService.getProviders()) {
      for (const type of provider.sessionTypes) {
        if (!seen.has(type.id)) {
          seen.add(type.id);
          types.push(type);
        }
      }
    }
    return types;
  }
  _updateSessionTypes() {
    this._sessionTypes = this._collectSessionTypes();
    this._onDidChangeSessionTypes.fire();
  }
  discardNewSession(session) {
    const current = this._newSession.get();
    if (!current) {
      return;
    }
    if (session && session.sessionId !== current.sessionId) {
      return;
    }
    this._newSession.set(void 0, void 0);
    this._getProvider(current)?.deleteNewSession(current.sessionId);
    this._onDidDiscardNewSession.fire(current);
  }
  /**
   * Resolve the provider and session type to use for a new session in the
   * given folder. Includes that provider's resolved workspace so headless
   * callers can enforce provider-specific trust without resolving it again.
   */
  _resolveProviderForNewSession(folderUri, options) {
    const providers = this.sessionsProvidersService.getProviders();
    let provider;
    let workspace;
    if (options?.providerId) {
      provider = providers.find((p) => p.id === options.providerId);
      if (!provider) {
        throw new Error(`Sessions provider '${options.providerId}' not found`);
      }
      workspace = provider.resolveWorkspace(folderUri);
      if (!workspace) {
        throw new Error(`Sessions provider '${options.providerId}' cannot resolve folder '${folderUri.toString()}'`);
      }
      if (options.sessionTypeId && !provider.getSessionTypes(folderUri).some((type) => type.id === options.sessionTypeId)) {
        throw new Error(`Sessions provider '${options.providerId}' does not advertise session type '${options.sessionTypeId}'`);
      }
    } else {
      for (const candidate of providers) {
        const candidateWorkspace = candidate.resolveWorkspace(folderUri);
        if (!candidateWorkspace) {
          continue;
        }
        if (options?.sessionTypeId && !candidate.getSessionTypes(folderUri).some((t) => t.id === options.sessionTypeId)) {
          continue;
        }
        provider = candidate;
        workspace = candidateWorkspace;
        break;
      }
      if (!provider || !workspace) {
        throw new Error(`No sessions provider can resolve folder '${folderUri.toString()}'`);
      }
    }
    let sessionTypeId = options?.sessionTypeId;
    if (!sessionTypeId) {
      sessionTypeId = provider.getSessionTypes(folderUri)[0]?.id;
      if (!sessionTypeId) {
        throw new Error(`No session types available for provider '${provider.id}'`);
      }
    }
    return { provider, sessionTypeId, workspace };
  }
  createNewSession(folderUri, options) {
    const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, options);
    const previousNewSession = this._newSession.get();
    const session = provider.createNewSession(folderUri, sessionTypeId);
    if (previousNewSession && previousNewSession.sessionId !== session.sessionId) {
      this._getProvider(previousNewSession)?.deleteNewSession(previousNewSession.sessionId);
      this._onDidReplaceNewDraftSession.fire({ from: previousNewSession, to: session });
    }
    this._newSession.set(session, void 0);
    return session;
  }
  /**
   * Resolve the provider and session type to use for a quick chat, keyed on
   * {@link ISessionsProvider.supportsQuickChats} instead of `resolveWorkspace`.
   * Honors an explicit `options.sessionTypeId` (validated against the chosen
   * provider) and otherwise defaults to the last-used type, then the first
   * advertised one. Throws when no capable provider/type can be resolved.
   */
  _resolveProviderForQuickChat(options) {
    const providers = this.sessionsProvidersService.getProviders();
    let provider;
    if (options?.providerId) {
      provider = providers.find((p) => p.id === options.providerId);
      if (!provider) {
        throw new Error(`Sessions provider '${options.providerId}' not found`);
      }
      if (!provider.supportsQuickChats) {
        throw new Error(`Sessions provider '${options.providerId}' does not support quick chats`);
      }
      if (options.sessionTypeId && !provider.sessionTypes.some((t) => t.id === options.sessionTypeId)) {
        throw new Error(`Sessions provider '${options.providerId}' does not advertise session type '${options.sessionTypeId}'`);
      }
    } else {
      for (const candidate of providers) {
        if (!candidate.supportsQuickChats) {
          continue;
        }
        if (options?.sessionTypeId && !candidate.sessionTypes.some((t) => t.id === options.sessionTypeId)) {
          continue;
        }
        provider = candidate;
        break;
      }
      if (!provider) {
        throw new Error("No sessions provider supports quick chats");
      }
    }
    const sessionTypeId = options?.sessionTypeId ?? this._defaultQuickChatSessionType(provider);
    if (!sessionTypeId) {
      throw new Error(`No session types available for provider '${provider.id}'`);
    }
    return { provider, sessionTypeId };
  }
  /** Default quick-chat session type: the last-used one if still advertised, else the first. */
  _defaultQuickChatSessionType(provider) {
    const lastUsed = this.storageService.get(LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY, StorageScope.PROFILE);
    if (lastUsed && provider.sessionTypes.some((t) => t.id === lastUsed)) {
      return lastUsed;
    }
    return provider.sessionTypes[0]?.id;
  }
  createQuickChat(options) {
    const { provider, sessionTypeId } = this._resolveProviderForQuickChat(options);
    const previousNewSession = this._newSession.get();
    const session = provider.createQuickChat(sessionTypeId);
    this._newSession.set(session, void 0);
    this.storageService.store(LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY, sessionTypeId, StorageScope.PROFILE, StorageTarget.USER);
    if (previousNewSession && previousNewSession.sessionId !== session.sessionId) {
      this._getProvider(previousNewSession)?.deleteNewSession(previousNewSession.sessionId);
    }
    return session;
  }
  async createNewChatInSession(session, options) {
    const provider = this._getProvider(session);
    if (!provider) {
      this.logService.warn(`[SessionsManagement] createNewChatInSession: provider '${session.providerId}' not found`);
      return void 0;
    }
    if (!options?.forceNew) {
      const existingUntitled = session.chats.get().find((c) => c.status.get() === SessionStatus.Untitled);
      if (existingUntitled) {
        return existingUntitled;
      }
    }
    const created = await provider.createNewChat(session.sessionId);
    return created;
  }
  async forkChatInSession(session, sourceChat, turnId) {
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Provider '${session.providerId}' not found for session '${session.sessionId}'`);
    }
    if (!session.capabilities.get().supportsMultipleChats) {
      throw new Error(`Session '${session.sessionId}' does not support forking into a chat`);
    }
    return provider.forkChat(session.sessionId, sourceChat, turnId);
  }
  async createSideChatInSession(session, sourceChat, turnId, selection) {
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Provider '${session.providerId}' not found for session '${session.sessionId}'`);
    }
    if (!session.capabilities.get().supportsSideChat) {
      throw new Error(`Session '${session.sessionId}' does not support side chats`);
    }
    return provider.createSideChat(session.sessionId, sourceChat, turnId, selection);
  }
  /**
   * For a `/troubleshoot` request, strip any `#session` marker attachments and
   * append a `Session log:` line with the resolved host-local `events.jsonl`
   * path(s) — the referenced sessions if present, otherwise the current one.
   * Returns `options` unchanged when there is nothing to do.
   */
  _augmentOptionsForTroubleshoot(session, options) {
    const referencedResources = [];
    let remainingAttachments;
    if (options.attachedContext?.length) {
      const remaining = [];
      for (const entry of options.attachedContext) {
        const referenced = getSessionReferenceResource(entry);
        if (referenced) {
          referencedResources.push(referenced);
        } else {
          remaining.push(entry);
        }
      }
      if (referencedResources.length) {
        remainingAttachments = remaining;
      }
    }
    const isTroubleshoot = /^\s*\/troubleshoot\b/.test(options.query);
    if (!isTroubleshoot && referencedResources.length === 0) {
      return options;
    }
    let result = options;
    if (remainingAttachments) {
      result = { ...result, attachedContext: remainingAttachments.length ? remainingAttachments : void 0 };
    }
    if (!isTroubleshoot) {
      return result;
    }
    const targets = referencedResources.length ? referencedResources : getCopilotCliSessionRawId(session.resource) ? [session.resource] : [];
    const userHome = this.pathService.userHome({ preferLocal: true });
    const getConnection = (authority) => this.remoteAgentHostService.connections.find((c) => agentHostAuthority(c.address) === authority);
    const eventPaths = Array.from(new Set(
      targets.map((resource) => buildHostLocalEventsPath(resource, userHome, getConnection)).filter((path) => !!path)
    ));
    if (eventPaths.length === 0) {
      return result;
    }
    return { ...result, query: `${result.query}

Session log: ${eventPaths.join(", ")}` };
  }
  async sendNewChatRequest(session, options) {
    this._newSession.set(void 0, void 0);
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Sessions provider '${session.providerId}' not found`);
    }
    if (options.background) {
      this._sendNewChatRequestInBackground(provider, session, options).catch((e) => {
        provider.deleteNewSession(session.sessionId);
        this.logService.error("[SessionsManagement] Failed to send background request:", e);
      });
      return;
    }
    this._onWillSendRequest.fire(session);
    const chat = await provider.createNewChat(session.sessionId, options.query);
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (updatedSession.sessionId !== session.sessionId) {
      this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
    }
    this._onDidStartSession.fire(updatedSession);
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
  }
  /**
   * Create a new session for the given folder and send a chat request to it,
   * without navigating into the started session. The started session appears
   * in the sessions list once the provider commits it, while the user's
   * current view is left untouched. Returns the committed session,
   * or `undefined` if the service was disposed during the send.
   *
   * Unlike {@link sendNewChatRequest} with `background`, this does not go
   * through the new-session composer: it creates a fresh session purely for
   * this request and never sets it as pending/active. Intended for callers
   * outside the composer that want to kick off a session programmatically.
   *
   * If the send or any configuration setter fails, the stranded draft is
   * disposed through its provider and the error is rethrown.
   */
  async createAndSendNewChatRequest(folderUri, options, createOptions, token = CancellationToken.None) {
    const { provider, sessionTypeId, workspace } = this._resolveProviderForNewSession(folderUri, createOptions);
    if (workspace.requiresWorkspaceTrust) {
      const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(folderUri);
      if (!trustInfo.trusted) {
        throw new WorkspaceNotTrustedError();
      }
    }
    const session = provider.createNewSession(folderUri, sessionTypeId);
    const supportsWorktreeConfiguration = provider.getSessionTypes(folderUri).find((sessionType) => sessionType.id === sessionTypeId)?.supportsWorktreeConfiguration === true;
    return this._configureAndSendNewSession(provider, session, options, createOptions, supportsWorktreeConfiguration, token, folderUri);
  }
  async createAndSendQuickChatRequest(options, createOptions, token = CancellationToken.None) {
    const { provider, sessionTypeId } = this._resolveProviderForQuickChat(createOptions);
    const session = provider.createQuickChat(sessionTypeId);
    return this._configureAndSendNewSession(provider, session, options, createOptions, false, token);
  }
  async _configureAndSendNewSession(provider, session, options, createOptions, supportsWorktreeConfiguration, token, folderUri) {
    try {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      if (createOptions?.modelId) {
        const resolvedModelId = await this._waitForRequestedModel(provider, session, createOptions.modelId, token, folderUri);
        provider.setModel(session.sessionId, resolvedModelId);
      }
      if (createOptions?.modeId) {
        provider.setMode?.(session.sessionId, createOptions.modeId);
      }
      if (createOptions?.permissionLevel) {
        provider.setPermissionLevel?.(session.sessionId, createOptions.permissionLevel);
      }
      if (supportsWorktreeConfiguration && (createOptions?.isolationMode || createOptions?.worktreeBranchTrack !== void 0 || createOptions?.branch)) {
        if (createOptions.isolationMode && provider.setIsolationMode) {
          await raceCancellationError(provider.setIsolationMode(session.sessionId, createOptions.isolationMode), token);
        }
        if (createOptions.worktreeBranchTrack !== void 0 && provider.setWorktreeBranchTrack) {
          await raceCancellationError(provider.setWorktreeBranchTrack(session.sessionId, createOptions.worktreeBranchTrack), token);
        }
        if (createOptions.branch && provider.setBranch) {
          await raceCancellationError(provider.setBranch(session.sessionId, createOptions.branch), token);
        }
      }
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      return await raceCancellationError(this._sendNewChatRequestInBackground(provider, session, options, token), token);
    } catch (e) {
      provider.deleteNewSession(session.sessionId);
      throw e;
    }
  }
  async _waitForRequestedModel(provider, session, modelId, token, folderUri) {
    const resolveCurrent = () => provider.getModelsSnapshot(session.sessionId, modelId).desiredModelResolution;
    const initial = resolveCurrent();
    if (initial.kind === "available") {
      return initial.model.identifier;
    }
    if (initial.kind === "notRequested") {
      return modelId;
    }
    if (initial.kind === "unavailable") {
      throw new Error(`Model '${modelId}' is unavailable for sessions provider '${provider.id}'`);
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    return new Promise((resolve, reject) => {
      const disposables = new DisposableStore();
      let settled = false;
      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        disposables.dispose();
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      };
      const check = () => {
        const resolution = resolveCurrent();
        if (resolution.kind === "available") {
          finish(resolution.model.identifier);
        } else if (resolution.kind === "notRequested") {
          finish(modelId);
        } else if (resolution.kind === "unavailable") {
          finish(new Error(`Model '${modelId}' is unavailable for sessions provider '${provider.id}'`));
        }
      };
      disposables.add(provider.onDidChangeModels(check));
      disposables.add(provider.onDidChangeSessionTypes(() => {
        const sessionTypes = folderUri ? provider.getSessionTypes(folderUri) : provider.sessionTypes;
        if (!sessionTypes.some((type) => type.id === session.sessionType)) {
          finish(new Error(`Session type '${session.sessionType}' is no longer available for sessions provider '${provider.id}'`));
        }
      }));
      disposables.add(this.sessionsProvidersService.onDidChangeProviders((event) => {
        if (event.removed.includes(provider)) {
          finish(new Error(`Sessions provider '${provider.id}' is no longer available`));
        }
      }));
      disposables.add(token.onCancellationRequested(() => finish(new CancellationError())));
      disposables.add(this._disposeCts.token.onCancellationRequested(() => finish(new CancellationError())));
      check();
    });
  }
  dispose() {
    this._disposeCts.cancel();
    super.dispose();
  }
  /**
   * Commit a new-session request: fire {@link _onWillSendRequest}, create the
   * new chat via the provider, send the request, and—on success—fire
   * {@link _onDidStartSession} and {@link _onDidSendRequest}. The started
   * session is never swapped into the visible chat slot, so it simply appears
   * in the sessions list once the provider commits it.
   *
   * Owns the full will/did send lifecycle so callers do not fire the paired
   * events themselves. Errors are propagated to the caller; this method does
   * not clean up the stranded draft, so callers own any view handling and the
   * error handling (e.g. disposing the stranded draft via
   * {@link ISessionsProvider.deleteNewSession}).
   *
   * Providers are multi-new-session aware, so the graduating session and a
   * concurrently reseeded composer draft coexist without conflict.
   */
  async _sendNewChatRequestInBackground(provider, session, options, token = CancellationToken.None) {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    this._onWillSendRequest.fire(session);
    const chatPromise = provider.createNewChat(session.sessionId, options.query);
    const chat = token === CancellationToken.None ? await chatPromise : await raceCancellationError(chatPromise, token);
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    const cancellationListener = token.onCancellationRequested(() => {
      void this.chatService.cancelCurrentRequestForSession(chat.resource, "sessionsManagement").catch((error) => {
        this.logService.warn("[SessionsManagement] Failed to cancel headless request:", error);
      });
    });
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      cancellationListener.dispose();
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    this._onDidStartSession.fire(updatedSession);
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
    return updatedSession;
  }
  async sendRequest(session, chat, options) {
    this.discardNewSession();
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Sessions provider '${session.providerId}' not found`);
    }
    if (options.background) {
      this._sendRequestInBackground(provider, session, chat, options).catch((e) => {
        this.logService.error("[SessionsManagement] Failed to send background request:", e);
      });
      return;
    }
    this._onWillSendRequest.fire(session);
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (updatedSession.sessionId !== session.sessionId) {
      this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
    }
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, isNewChat: true, options });
  }
  /**
   * Send a request for an existing chat in the background: commit the send via
   * the provider and—on success—fire {@link _onDidSendRequest}. Unlike the
   * foreground {@link sendRequest} path this does not fire
   * {@link _onWillSendRequest}, so the view's send-follow never navigates the
   * visible slot into the sent chat. Errors are propagated to the caller.
   */
  async _sendRequestInBackground(provider, session, chat, options) {
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (this._store.isDisposed) {
      return;
    }
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, isNewChat: true, options });
  }
  // -- Session Actions --
  _getProvider(session) {
    return this.sessionsProvidersService.getProviders().find((p) => p.id === session.providerId);
  }
  async archiveSession(session) {
    await this._getProvider(session)?.archiveSession(session.sessionId);
    this._onDidArchiveSession.fire(session);
  }
  async unarchiveSession(session) {
    await this._getProvider(session)?.unarchiveSession(session.sessionId);
    this._onDidUnarchiveSession.fire(session);
  }
  async setSessionReadState(session, isRead) {
    await this._getProvider(session)?.setSessionReadState(session.sessionId, isRead);
  }
  markRead(session) {
    return this.setSessionReadState(session, true);
  }
  markUnread(session) {
    return this.setSessionReadState(session, false);
  }
  async markAllRead(sessions) {
    await Promise.all(sessions.map((session) => this.setSessionReadState(session, true)));
  }
  async deleteSession(session) {
    await this._getProvider(session)?.deleteSession(session.sessionId);
    this._onDidDeleteSession.fire(session);
  }
  async deleteSessions(sessions) {
    const byProvider = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      const provider = this._getProvider(session);
      if (!provider) {
        continue;
      }
      const group = byProvider.get(provider);
      if (group) {
        group.push(session);
      } else {
        byProvider.set(provider, [session]);
      }
    }
    let firstError;
    for (const [provider, providerSessions] of byProvider) {
      try {
        await provider.deleteSessions(providerSessions.map((session) => session.sessionId));
        for (const session of providerSessions) {
          this._onDidDeleteSession.fire(session);
        }
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== void 0) {
      throw firstError;
    }
  }
  async deleteChat(session, chatUri, options) {
    const deleted = await this._getProvider(session)?.deleteChat(session.sessionId, chatUri, options);
    if (deleted) {
      this._onDidDeleteChat.fire(session);
    }
  }
  async renameChat(session, chatUri, title) {
    await this._getProvider(session)?.renameChat(session.sessionId, chatUri, title);
    this._onDidRenameChat.fire(session);
  }
  async renameSession(session, title) {
    await this._getProvider(session)?.renameSession(session.sessionId, title);
    this._onDidRenameSession.fire(session);
  }
};
SessionsManagementService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ISessionsProvidersService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IChatWidgetHistoryService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IPathService),
  __decorateParam(7, IRemoteAgentHostService),
  __decorateParam(8, IWorkspaceTrustManagementService)
], SessionsManagementService);
registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Eager);
export {
  SessionsManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0QXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRIb3N0TG9jYWxFdmVudHNQYXRoLCBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NvcGlsb3RDbGlFdmVudHNVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgZ2V0U2Vzc2lvblJlZmVyZW5jZVJlc291cmNlIH0gZnJvbSAnLi9zZXNzaW9uUmVmZXJlbmNlLmpzJztcbmltcG9ydCB7IElDcmVhdGVOZXdDaGF0SW5TZXNzaW9uT3B0aW9ucywgSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zLCBJUHJvdmlkZXJTZXNzaW9uVHlwZSwgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlbmRSZXF1ZXN0U2VudEV2ZW50LCBJU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIFdvcmtzcGFjZU5vdFRydXN0ZWRFcnJvciB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzQ2hhbmdlRXZlbnQsIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVsZXRlQ2hhdE9wdGlvbnMsIElTZXNzaW9uQ2hhbmdlRXZlbnQsIElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUNoYXQsIElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZSwgSVNpZGVDaGF0U2VsZWN0aW9uLCBTZXNzaW9uU3RhdHVzLCBJU2Vzc2lvblR5cGUgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuXG4vKiogU3RvcmFnZSBrZXkgZm9yIHRoZSBsYXN0IHNlc3Npb24gdHlwZSB1c2VkIHRvIGNyZWF0ZSBhIHF1aWNrIGNoYXQuICovXG5jb25zdCBMQVNUX1VTRURfUVVJQ0tfQ0hBVF9TRVNTSU9OX1RZUEVfU1RPUkFHRV9LRVkgPSAnc2Vzc2lvbnMucXVpY2tDaGF0Lmxhc3RVc2VkU2Vzc2lvblR5cGUnO1xuXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uc0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQ8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRTZXNzaW9uOiBFdmVudDxJU2Vzc2lvbj4gPSB0aGlzLl9vbkRpZFN0YXJ0U2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxTZW5kUmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKTtcblx0cmVhZG9ubHkgb25XaWxsU2VuZFJlcXVlc3Q6IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uV2lsbFNlbmRSZXF1ZXN0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbmRSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlbmRSZXF1ZXN0U2VudEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTZW5kUmVxdWVzdDogRXZlbnQ8SVNlbmRSZXF1ZXN0U2VudEV2ZW50PiA9IHRoaXMuX29uRGlkU2VuZFJlcXVlc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBcmNoaXZlU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRBcmNoaXZlU2Vzc2lvbjogRXZlbnQ8SVNlc3Npb24+ID0gdGhpcy5fb25EaWRBcmNoaXZlU2Vzc2lvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVbmFyY2hpdmVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVuYXJjaGl2ZVNlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkVW5hcmNoaXZlU2Vzc2lvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREZWxldGVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlbGV0ZVNlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkRGVsZXRlU2Vzc2lvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREZWxldGVDaGF0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlbGV0ZUNoYXQ6IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkRGVsZXRlQ2hhdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5hbWVDaGF0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbmFtZUNoYXQ6IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkUmVuYW1lQ2hhdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5hbWVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbmFtZVNlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkUmVuYW1lU2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcGxhY2VTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uOiBFdmVudDx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4gPSB0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzY2FyZE5ld1Nlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzY2FyZE5ld1Nlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkRGlzY2FyZE5ld1Nlc3Npb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uOiBFdmVudDx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4gPSB0aGlzLl9vbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFtdO1xuXG5cdC8qKiBUcmFja3MgdGhlIGluLXByb2dyZXNzIG5ldyBzZXNzaW9uIChjb21wb3NlZCBidXQgbm90IHlldCBzZW50KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbmV3U2Vzc2lvbjogSU9ic2VydmFibGU8SVNlc3Npb24gfCB1bmRlZmluZWQ+ID0gdGhpcy5fbmV3U2Vzc2lvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlckxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NlQ3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdC8qKlxuXHQgKiBDaGF0IHJlc291cmNlcyBmb3Igd2hpY2ggdGhpcyBzZXJ2aWNlIGhhcyBqdXN0IGtpY2tlZCBvZmYgYVxuXHQgKiBgcHJvdmlkZXIuc2VuZFJlcXVlc3RgIGFuZCB3aWxsIGVtaXQgYF9vbkRpZFNlbmRSZXF1ZXN0YCBtYW51YWxseSBhZnRlclxuXHQgKiB0aGUgcHJvdmlkZXIgY2FsbCByZXNvbHZlcy4gVXNlZCB0byBzdXBwcmVzcyB0aGUgZHVwbGljYXRlIGV2ZW50IHRoYXRcblx0ICogd291bGQgb3RoZXJ3aXNlIGFycml2ZSB2aWEge0BsaW5rIElDaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3R9LFxuXHQgKiB3aGljaCBmaXJlcyBzeW5jaHJvbm91c2x5IGluc2lkZSB0aGUgc2FtZSBwcm92aWRlciBjYWxsLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2U6IElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBTdWJzY3JpYmUgdG8gcHJvdmlkZXIgY2hhbmdlcyBmb3Igc2Vzc2lvbiB0eXBlIHVwZGF0ZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycyhlID0+IHtcblx0XHRcdHRoaXMuX29uUHJvdmlkZXJzQ2hhbmdlZChlKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVNlc3Npb25UeXBlcygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zdWJzY3JpYmVUb1Byb3ZpZGVycyh0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSk7XG5cdFx0dGhpcy5fc2Vzc2lvblR5cGVzID0gdGhpcy5fY29sbGVjdFNlc3Npb25UeXBlcygpO1xuXG5cdFx0Ly8gTWlycm9yIGZvbGxvdy11cCBjaGF0IHJlcXVlc3RzIChzZW50IGZyb20gd2l0aGluIGFuIGV4aXN0aW5nIGNoYXRcblx0XHQvLyB3aWRnZXQsIG5vdCB0aHJvdWdoIG91ciBvd24gc2VuZCBwYXRocykgb250byBgX29uRGlkU2VuZFJlcXVlc3RgIHNvXG5cdFx0Ly8gZG93bnN0cmVhbSBsaXN0ZW5lcnMgKGUuZy4sIHRlbGVtZXRyeSkgY2FuIG9ic2VydmUgZXZlcnkgdXNlclxuXHRcdC8vIHJlcXVlc3QgZm9yIGEgc2Vzc2lvbiwgbm90IGp1c3QgdGhvc2UgaW5pdGlhdGVkIGZyb20gdGhlIHNlc3Npb25zXG5cdFx0Ly8gVUkuIFNlbmRzIG9yaWdpbmF0aW5nIGZyb20ge0BsaW5rIHNlbmRSZXF1ZXN0fSBhbmRcblx0XHQvLyB7QGxpbmsgc2VuZE5ld0NoYXRSZXF1ZXN0fSBhcmUgZGVkdXBsaWNhdGVkIHZpYVxuXHRcdC8vIHtAbGluayBfcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzfS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXJ2aWNlLm9uRGlkU3VibWl0UmVxdWVzdCgoeyBjaGF0U2Vzc2lvblJlc291cmNlLCBtZXNzYWdlIH0pID0+IHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuaGFzKGNoYXRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3duZWRDaGF0ID0gdGhpcy5nZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKG93bmVkQ2hhdCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFNlbmRSZXF1ZXN0LmZpcmUoe1xuXHRcdFx0XHRcdHNlc3Npb246IG93bmVkQ2hhdC5zZXNzaW9uLFxuXHRcdFx0XHRcdGNoYXQ6IG93bmVkQ2hhdC5jaGF0LFxuXHRcdFx0XHRcdGlzTmV3U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRcdFx0aXNOZXdDaGF0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHF1ZXJ5OiBtZXNzYWdlPy50ZXh0ID8/ICcnIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX29uUHJvdmlkZXJzQ2hhbmdlZChlOiBJU2Vzc2lvbnNQcm92aWRlcnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHR0aGlzLl9wcm92aWRlckxpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKHByb3ZpZGVyLmlkKTtcblx0XHR9XG5cdFx0aWYgKGUuYWRkZWQubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9zdWJzY3JpYmVUb1Byb3ZpZGVycyhlLmFkZGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdWJzY3JpYmVUb1Byb3ZpZGVycyhwcm92aWRlcnM6IHJlYWRvbmx5IElTZXNzaW9uc1Byb3ZpZGVyW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHByb3ZpZGVycykge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHRoaXMub25EaWRDaGFuZ2VTZXNzaW9uc0Zyb21TZXNzaW9uc1Byb3ZpZGVycyhlKSkpO1xuXHRcdFx0aWYgKHByb3ZpZGVyLm9uRGlkUmVwbGFjZVNlc3Npb24pIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkUmVwbGFjZVNlc3Npb24oZSA9PiB0aGlzLl9oYW5kbGVEaWRSZXBsYWNlU2Vzc2lvbihlLmZyb20sIGUudG8pKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzKCgpID0+IHRoaXMuX3VwZGF0ZVNlc3Npb25UeXBlcygpKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm92aWRlckxpc3RlbmVycy5zZXQocHJvdmlkZXIuaWQsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVEaWRSZXBsYWNlU2Vzc2lvbihmcm9tOiBJU2Vzc2lvbiwgdG86IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UubW92ZUhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgZnJvbS5zZXNzaW9uSWQsIHRvLnNlc3Npb25JZCk7XG5cdFx0Ly8gTm90aWZ5IHRoZSB2aWV3IHNlcnZpY2Ugc28gaXQgY2FuIHVwZGF0ZSB0aGUgdmlzaWJsZSBncmlkIHNsb3QuXG5cdFx0dGhpcy5fb25EaWRSZXBsYWNlU2Vzc2lvbi5maXJlKHsgZnJvbSwgdG8gfSk7XG5cdFx0Ly8gQWx3YXlzIGZpcmUgdGhlIGNoYW5nZSBldmVudCBzbyB0aGUgU2Vzc2lvbnNMaXN0IHJlZnJlc2hlcyBldmVuIHdoZW5cblx0XHQvLyB0aGUgdXNlciBuYXZpZ2F0ZWQgdG8gYSBkaWZmZXJlbnQgc2Vzc2lvbiB3aGlsZSB0aGUgbmV3IG9uZSB3YXNcblx0XHQvLyBiZWluZyBjcmVhdGVkICh3aGljaCBpcyBob3cgZHVwbGljYXRlIHJvd3MgYXBwZWFyZWQgaW4gdGhlIGxpc3QpLlxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRhZGRlZDogW10sXG5cdFx0XHRyZW1vdmVkOiBmcm9tLnNlc3Npb25JZCA9PT0gdG8uc2Vzc2lvbklkID8gW10gOiBbZnJvbV0sXG5cdFx0XHRjaGFuZ2VkOiBbdG9dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVNlc3Npb25zRnJvbVNlc3Npb25zUHJvdmlkZXJzKGU6IElTZXNzaW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBzdGFsZSBuZXcgc2Vzc2lvbiBpZiB0aGUgcHJvdmlkZXIgcmVtb3ZlZCBpdC4gVGhlIHByb3ZpZGVyXG5cdFx0Ly8gYWxyZWFkeSBkaXNwb3NlZCBpdCwgc28ganVzdCBkcm9wIHRoZSBwb2ludGVyIChkbyBub3QgZGlzcG9zZSBhZ2FpbikuXG5cdFx0aWYgKGUucmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9uZXdTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKGN1cnJlbnQgJiYgZS5yZW1vdmVkLnNvbWUociA9PiByLnNlc3Npb25JZCA9PT0gY3VycmVudC5zZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHRoaXMuX25ld1Nlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUaGUgdmlldyBzZXJ2aWNlIHJlYWN0cyB0byB0aGlzIGV2ZW50IHRvIGRyb3AgcmVtb3ZlZCBzZXNzaW9ucyBmcm9tXG5cdFx0Ly8gdGhlIGdyaWQgYW5kIHBpY2sgYSBmYWxsYmFjayBhY3RpdmUgc2Vzc2lvbi5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoZSk7XG5cdH1cblxuXHRnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHRjb25zdCBzZXNzaW9uczogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpIHtcblx0XHRcdHNlc3Npb25zLnB1c2goLi4ucHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKSk7XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9ucztcblx0fVxuXG5cdGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTZXNzaW9ucygpLmZpbmQocyA9PlxuXHRcdFx0dGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocy5yZXNvdXJjZSwgcmVzb3VyY2UpXG5cdFx0KTtcblx0fVxuXG5cdGdldFNlc3Npb25Gb3JDaGF0UmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHsgc2Vzc2lvbjogSVNlc3Npb247IGNoYXQ6IElDaGF0IH0gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLmdldFNlc3Npb25zKCkpIHtcblx0XHRcdGNvbnN0IGNoYXQgPSBzZXNzaW9uLmNoYXRzLmdldCgpLmZpbmQoYyA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChjLnJlc291cmNlLCByZXNvdXJjZSkpO1xuXHRcdFx0aWYgKGNoYXQpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbiwgY2hhdCB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYWluQ2hhdCA9IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCk7XG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwobWFpbkNoYXQucmVzb3VyY2UsIHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uLCBjaGF0OiBtYWluQ2hhdCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0QWxsU2Vzc2lvblR5cGVzKCk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25UeXBlc107XG5cdH1cblxuXHRnZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyVXJpOiBVUkkpOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElQcm92aWRlclNlc3Npb25UeXBlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpKSB7XG5cdFx0XHRpZiAoIXByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvblR5cGUgb2YgcHJvdmlkZXIuZ2V0U2Vzc2lvblR5cGVzKGZvbGRlclVyaSkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgc2Vzc2lvblR5cGUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRRdWlja0NoYXRTZXNzaW9uVHlwZXMoKTogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0aWYgKCFwcm92aWRlci5zdXBwb3J0c1F1aWNrQ2hhdHMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb25UeXBlIG9mIHByb3ZpZGVyLnNlc3Npb25UeXBlcykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBzZXNzaW9uVHlwZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZShmb2xkZXJVcmk6IFVSSSwgb3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1RhcmdldEF2YWlsYWJsZSh0aGlzLmdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmkpLCBvcHRpb25zKTtcblx0fVxuXG5cdGlzUXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlKG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUYXJnZXRBdmFpbGFibGUodGhpcy5nZXRRdWlja0NoYXRTZXNzaW9uVHlwZXMoKSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1RhcmdldEF2YWlsYWJsZShzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElQcm92aWRlclNlc3Npb25UeXBlW10sIG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2Vzc2lvblR5cGVzLnNvbWUoY2FuZGlkYXRlID0+XG5cdFx0XHQoIW9wdGlvbnM/LnByb3ZpZGVySWQgfHwgY2FuZGlkYXRlLnByb3ZpZGVySWQgPT09IG9wdGlvbnMucHJvdmlkZXJJZClcblx0XHRcdCYmICghb3B0aW9ucz8uc2Vzc2lvblR5cGVJZCB8fCBjYW5kaWRhdGUuc2Vzc2lvblR5cGUuaWQgPT09IG9wdGlvbnMuc2Vzc2lvblR5cGVJZClcblx0XHQpO1xuXHR9XG5cblx0cmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSwgcHJlZmVycmVkUHJvdmlkZXJJZD86IHN0cmluZyk6IHsgcHJvdmlkZXJJZDogc3RyaW5nOyB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmIChwcmVmZXJyZWRQcm92aWRlcklkKSB7XG5cdFx0XHRjb25zdCBwcmVmZXJyZWQgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcmVmZXJyZWRQcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByZWZlcnJlZD8ucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcklkOiBwcmVmZXJyZWRQcm92aWRlcklkLCB3b3Jrc3BhY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgd29ya3NwYWNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsZWN0U2Vzc2lvblR5cGVzKCk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRjb25zdCB0eXBlczogSVNlc3Npb25UeXBlW10gPSBbXTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCB0eXBlIG9mIHByb3ZpZGVyLnNlc3Npb25UeXBlcykge1xuXHRcdFx0XHRpZiAoIXNlZW4uaGFzKHR5cGUuaWQpKSB7XG5cdFx0XHRcdFx0c2Vlbi5hZGQodHlwZS5pZCk7XG5cdFx0XHRcdFx0dHlwZXMucHVzaCh0eXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHlwZXM7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTZXNzaW9uVHlwZXMoKTogdm9pZCB7XG5cdFx0Ly8gQWx3YXlzIGZpcmUgXHUyMDE0IHRoZSBkZWR1cGxpY2F0ZWQgZmxhdCBsaXN0ICh1c2VkIGJ5IHN1cmZhY2VzIHRoYXRcblx0XHQvLyBvbmx5IG5lZWQgYSBzZXQgb2YgdHlwZSBpZHMpIG1heSBiZSB1bmNoYW5nZWQsIGJ1dCB0aGUgcGVyLWZvbGRlclxuXHRcdC8vIHJlc3VsdCBvZiB7QGxpbmsgZ2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyfSBjYW4gY2hhbmdlIHdoZW5ldmVyIGFueVxuXHRcdC8vIHByb3ZpZGVyJ3MgdHlwZXMgb3IgdGhlIHNldCBvZiBwcm92aWRlcnMgY2hhbmdlcywgYmVjYXVzZSBlYWNoXG5cdFx0Ly8gZW50cnkgaXMga2V5ZWQgYnkgKHByb3ZpZGVySWQgXHUwMEQ3IHNlc3Npb25UeXBlKSByYXRoZXIgdGhhbiBieSB0eXBlXG5cdFx0Ly8gaWQgYWxvbmUuXG5cdFx0dGhpcy5fc2Vzc2lvblR5cGVzID0gdGhpcy5fY29sbGVjdFNlc3Npb25UeXBlcygpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmZpcmUoKTtcblx0fVxuXG5cdGRpc2NhcmROZXdTZXNzaW9uKHNlc3Npb24/OiBJU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9uZXdTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBXaGVuIGEgc3BlY2lmaWMgc2Vzc2lvbiBpcyBnaXZlbiwgb25seSBkaXNjYXJkIGlmIGl0IGlzIHRoZSBjdXJyZW50XG5cdFx0Ly8gbmV3IHNlc3Npb247IGNsb3NpbmcgYW4gdW5yZWxhdGVkIHNlc3Npb24gbXVzdCBub3QgZHJvcCB0aGUgZHJhZnQuXG5cdFx0aWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5zZXNzaW9uSWQgIT09IGN1cnJlbnQuc2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX25ld1Nlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9nZXRQcm92aWRlcihjdXJyZW50KT8uZGVsZXRlTmV3U2Vzc2lvbihjdXJyZW50LnNlc3Npb25JZCk7XG5cdFx0dGhpcy5fb25EaWREaXNjYXJkTmV3U2Vzc2lvbi5maXJlKGN1cnJlbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIHByb3ZpZGVyIGFuZCBzZXNzaW9uIHR5cGUgdG8gdXNlIGZvciBhIG5ldyBzZXNzaW9uIGluIHRoZVxuXHQgKiBnaXZlbiBmb2xkZXIuIEluY2x1ZGVzIHRoYXQgcHJvdmlkZXIncyByZXNvbHZlZCB3b3Jrc3BhY2Ugc28gaGVhZGxlc3Ncblx0ICogY2FsbGVycyBjYW4gZW5mb3JjZSBwcm92aWRlci1zcGVjaWZpYyB0cnVzdCB3aXRob3V0IHJlc29sdmluZyBpdCBhZ2Fpbi5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVQcm92aWRlckZvck5ld1Nlc3Npb24oZm9sZGVyVXJpOiBVUkksIG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiB7IHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlcjsgc2Vzc2lvblR5cGVJZDogc3RyaW5nOyB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIH0ge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpO1xuXHRcdGxldCBwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAob3B0aW9ucz8ucHJvdmlkZXJJZCkge1xuXHRcdFx0cHJvdmlkZXIgPSBwcm92aWRlcnMuZmluZChwID0+IHAuaWQgPT09IG9wdGlvbnMucHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7b3B0aW9ucy5wcm92aWRlcklkfScgbm90IGZvdW5kYCk7XG5cdFx0XHR9XG5cdFx0XHR3b3Jrc3BhY2UgPSBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSk7XG5cdFx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb25zIHByb3ZpZGVyICcke29wdGlvbnMucHJvdmlkZXJJZH0nIGNhbm5vdCByZXNvbHZlIGZvbGRlciAnJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0nYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3B0aW9ucy5zZXNzaW9uVHlwZUlkICYmICFwcm92aWRlci5nZXRTZXNzaW9uVHlwZXMoZm9sZGVyVXJpKS5zb21lKHR5cGUgPT4gdHlwZS5pZCA9PT0gb3B0aW9ucy5zZXNzaW9uVHlwZUlkKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb25zIHByb3ZpZGVyICcke29wdGlvbnMucHJvdmlkZXJJZH0nIGRvZXMgbm90IGFkdmVydGlzZSBzZXNzaW9uIHR5cGUgJyR7b3B0aW9ucy5zZXNzaW9uVHlwZUlkfSdgKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSXRlcmF0ZSBwcm92aWRlcnMgYW5kIHBpY2sgdGhlIGZpcnN0IG9uZSB0aGF0IGNhbiByZXNvbHZlIHRoZSBmb2xkZXIuXG5cdFx0XHQvLyBXaGVuIGEgc3BlY2lmaWMgc2Vzc2lvbiB0eXBlIHdhcyByZXF1ZXN0ZWQsIGFsc28gcmVxdWlyZSB0aGUgcHJvdmlkZXIgdG9cblx0XHRcdC8vIGFkdmVydGlzZSB0aGF0IHR5cGUgZm9yIHRoZSBmb2xkZXIuXG5cdFx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBwcm92aWRlcnMpIHtcblx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlV29ya3NwYWNlID0gY2FuZGlkYXRlLnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcblx0XHRcdFx0aWYgKCFjYW5kaWRhdGVXb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucz8uc2Vzc2lvblR5cGVJZCAmJiAhY2FuZGlkYXRlLmdldFNlc3Npb25UeXBlcyhmb2xkZXJVcmkpLnNvbWUodCA9PiB0LmlkID09PSBvcHRpb25zLnNlc3Npb25UeXBlSWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJvdmlkZXIgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdHdvcmtzcGFjZSA9IGNhbmRpZGF0ZVdvcmtzcGFjZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByb3ZpZGVyIHx8ICF3b3Jrc3BhY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBzZXNzaW9ucyBwcm92aWRlciBjYW4gcmVzb2x2ZSBmb2xkZXIgJyR7Zm9sZGVyVXJpLnRvU3RyaW5nKCl9J2ApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgc2Vzc2lvblR5cGVJZCA9IG9wdGlvbnM/LnNlc3Npb25UeXBlSWQ7XG5cdFx0aWYgKCFzZXNzaW9uVHlwZUlkKSB7XG5cdFx0XHRzZXNzaW9uVHlwZUlkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvblR5cGVzKGZvbGRlclVyaSlbMF0/LmlkO1xuXHRcdFx0aWYgKCFzZXNzaW9uVHlwZUlkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc2Vzc2lvbiB0eXBlcyBhdmFpbGFibGUgZm9yIHByb3ZpZGVyICcke3Byb3ZpZGVyLmlkfSdgKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXIsIHNlc3Npb25UeXBlSWQsIHdvcmtzcGFjZSB9O1xuXHR9XG5cblx0Y3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmk6IFVSSSwgb3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IElTZXNzaW9uIHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBzZXNzaW9uVHlwZUlkIH0gPSB0aGlzLl9yZXNvbHZlUHJvdmlkZXJGb3JOZXdTZXNzaW9uKGZvbGRlclVyaSwgb3B0aW9ucyk7XG5cblx0XHRjb25zdCBwcmV2aW91c05ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaSwgc2Vzc2lvblR5cGVJZCk7XG5cblx0XHQvLyBQcm92aWRlcnMgbm8gbG9uZ2VyIGRpc3Bvc2UgdGhlIHByZXZpb3VzIG5ldyBzZXNzaW9uIGltcGxpY2l0bHksIHNvXG5cdFx0Ly8gZGlzcG9zZSB0aGUgb25lIHRoaXMgY29tcG9zZXIganVzdCByZXBsYWNlZC4gVXNlIGl0cyBvd24gcHJvdmlkZXJcblx0XHQvLyBiZWNhdXNlIHN3aXRjaGluZyB3b3Jrc3BhY2UgY2FuIHN3aXRjaCBwcm92aWRlcnMuIERvbmUgYWZ0ZXIgYVxuXHRcdC8vIHN1Y2Nlc3NmdWwgY3JlYXRlIHNvIGEgdGhyb3cgYWJvdmUgbGVhdmVzIHRoZSBwcmV2aW91cyBvbmUgaW50YWN0LlxuXHRcdGlmIChwcmV2aW91c05ld1Nlc3Npb24gJiYgcHJldmlvdXNOZXdTZXNzaW9uLnNlc3Npb25JZCAhPT0gc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX2dldFByb3ZpZGVyKHByZXZpb3VzTmV3U2Vzc2lvbik/LmRlbGV0ZU5ld1Nlc3Npb24ocHJldmlvdXNOZXdTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHQvLyBUZXJtaW5hbCBvd25lcnNoaXAgbXVzdCBtb3ZlIGJlZm9yZSB0aGUgcmVwbGFjZW1lbnQgaXMgcHVibGlzaGVkOlxuXHRcdFx0Ly8gcHVibGlzaGluZyBlYWdlcmx5IGVuc3VyZXMgYSB0ZXJtaW5hbCBmb3IgdGhlIG5ldyBkcmFmdC5cblx0XHRcdHRoaXMuX29uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5maXJlKHsgZnJvbTogcHJldmlvdXNOZXdTZXNzaW9uLCB0bzogc2Vzc2lvbiB9KTtcblx0XHR9XG5cdFx0dGhpcy5fbmV3U2Vzc2lvbi5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBwcm92aWRlciBhbmQgc2Vzc2lvbiB0eXBlIHRvIHVzZSBmb3IgYSBxdWljayBjaGF0LCBrZXllZCBvblxuXHQgKiB7QGxpbmsgSVNlc3Npb25zUHJvdmlkZXIuc3VwcG9ydHNRdWlja0NoYXRzfSBpbnN0ZWFkIG9mIGByZXNvbHZlV29ya3NwYWNlYC5cblx0ICogSG9ub3JzIGFuIGV4cGxpY2l0IGBvcHRpb25zLnNlc3Npb25UeXBlSWRgICh2YWxpZGF0ZWQgYWdhaW5zdCB0aGUgY2hvc2VuXG5cdCAqIHByb3ZpZGVyKSBhbmQgb3RoZXJ3aXNlIGRlZmF1bHRzIHRvIHRoZSBsYXN0LXVzZWQgdHlwZSwgdGhlbiB0aGUgZmlyc3Rcblx0ICogYWR2ZXJ0aXNlZCBvbmUuIFRocm93cyB3aGVuIG5vIGNhcGFibGUgcHJvdmlkZXIvdHlwZSBjYW4gYmUgcmVzb2x2ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUHJvdmlkZXJGb3JRdWlja0NoYXQob3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IHsgcHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyOyBzZXNzaW9uVHlwZUlkOiBzdHJpbmcgfSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCk7XG5cdFx0bGV0IHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChvcHRpb25zPy5wcm92aWRlcklkKSB7XG5cdFx0XHRwcm92aWRlciA9IHByb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gb3B0aW9ucy5wcm92aWRlcklkKTtcblx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9ucyBwcm92aWRlciAnJHtvcHRpb25zLnByb3ZpZGVySWR9JyBub3QgZm91bmRgKTtcblx0XHRcdH1cblx0XHRcdGlmICghcHJvdmlkZXIuc3VwcG9ydHNRdWlja0NoYXRzKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7b3B0aW9ucy5wcm92aWRlcklkfScgZG9lcyBub3Qgc3VwcG9ydCBxdWljayBjaGF0c2ApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnMuc2Vzc2lvblR5cGVJZCAmJiAhcHJvdmlkZXIuc2Vzc2lvblR5cGVzLnNvbWUodCA9PiB0LmlkID09PSBvcHRpb25zLnNlc3Npb25UeXBlSWQpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7b3B0aW9ucy5wcm92aWRlcklkfScgZG9lcyBub3QgYWR2ZXJ0aXNlIHNlc3Npb24gdHlwZSAnJHtvcHRpb25zLnNlc3Npb25UeXBlSWR9J2ApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBJdGVyYXRlIHByb3ZpZGVycyAoaW4gYG9yZGVyYCkgYW5kIHBpY2sgdGhlIGZpcnN0IHRoYXQgc3VwcG9ydHNcblx0XHRcdC8vIHF1aWNrIGNoYXRzLiBXaGVuIGEgc3BlY2lmaWMgc2Vzc2lvbiB0eXBlIHdhcyByZXF1ZXN0ZWQsIGFsc29cblx0XHRcdC8vIHJlcXVpcmUgdGhlIHByb3ZpZGVyIHRvIGFkdmVydGlzZSBpdC5cblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHByb3ZpZGVycykge1xuXHRcdFx0XHRpZiAoIWNhbmRpZGF0ZS5zdXBwb3J0c1F1aWNrQ2hhdHMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucz8uc2Vzc2lvblR5cGVJZCAmJiAhY2FuZGlkYXRlLnNlc3Npb25UeXBlcy5zb21lKHQgPT4gdC5pZCA9PT0gb3B0aW9ucy5zZXNzaW9uVHlwZUlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByb3ZpZGVyID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBzZXNzaW9ucyBwcm92aWRlciBzdXBwb3J0cyBxdWljayBjaGF0cycpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVHlwZUlkID0gb3B0aW9ucz8uc2Vzc2lvblR5cGVJZCA/PyB0aGlzLl9kZWZhdWx0UXVpY2tDaGF0U2Vzc2lvblR5cGUocHJvdmlkZXIpO1xuXHRcdGlmICghc2Vzc2lvblR5cGVJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBzZXNzaW9uIHR5cGVzIGF2YWlsYWJsZSBmb3IgcHJvdmlkZXIgJyR7cHJvdmlkZXIuaWR9J2ApO1xuXHRcdH1cblx0XHRyZXR1cm4geyBwcm92aWRlciwgc2Vzc2lvblR5cGVJZCB9O1xuXHR9XG5cblx0LyoqIERlZmF1bHQgcXVpY2stY2hhdCBzZXNzaW9uIHR5cGU6IHRoZSBsYXN0LXVzZWQgb25lIGlmIHN0aWxsIGFkdmVydGlzZWQsIGVsc2UgdGhlIGZpcnN0LiAqL1xuXHRwcml2YXRlIF9kZWZhdWx0UXVpY2tDaGF0U2Vzc2lvblR5cGUocHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYXN0VXNlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KExBU1RfVVNFRF9RVUlDS19DSEFUX1NFU1NJT05fVFlQRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChsYXN0VXNlZCAmJiBwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IGxhc3RVc2VkKSkge1xuXHRcdFx0cmV0dXJuIGxhc3RVc2VkO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdPy5pZDtcblx0fVxuXG5cdGNyZWF0ZVF1aWNrQ2hhdChvcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zKTogSVNlc3Npb24ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIHNlc3Npb25UeXBlSWQgfSA9IHRoaXMuX3Jlc29sdmVQcm92aWRlckZvclF1aWNrQ2hhdChvcHRpb25zKTtcblxuXHRcdGNvbnN0IHByZXZpb3VzTmV3U2Vzc2lvbiA9IHRoaXMuX25ld1Nlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZVF1aWNrQ2hhdChzZXNzaW9uVHlwZUlkKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9uLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTEFTVF9VU0VEX1FVSUNLX0NIQVRfU0VTU0lPTl9UWVBFX1NUT1JBR0VfS0VZLCBzZXNzaW9uVHlwZUlkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdC8vIE1pcnJvciBgY3JlYXRlTmV3U2Vzc2lvbmA6IGRpc3Bvc2UgdGhlIHByZXZpb3VzIG5ldyBzZXNzaW9uIHRoaXNcblx0XHQvLyBjb21wb3NlciBqdXN0IHJlcGxhY2VkLCB1c2luZyBpdHMgb3duIHByb3ZpZGVyLCBhZnRlciBhIHN1Y2Nlc3NmdWxcblx0XHQvLyBjcmVhdGUgc28gYSB0aHJvdyBhYm92ZSBsZWF2ZXMgdGhlIHByZXZpb3VzIG9uZSBpbnRhY3QuXG5cdFx0aWYgKHByZXZpb3VzTmV3U2Vzc2lvbiAmJiBwcmV2aW91c05ld1Nlc3Npb24uc2Vzc2lvbklkICE9PSBzZXNzaW9uLnNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fZ2V0UHJvdmlkZXIocHJldmlvdXNOZXdTZXNzaW9uKT8uZGVsZXRlTmV3U2Vzc2lvbihwcmV2aW91c05ld1Nlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRhc3luYyBjcmVhdGVOZXdDaGF0SW5TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCBvcHRpb25zPzogSUNyZWF0ZU5ld0NoYXRJblNlc3Npb25PcHRpb25zKTogUHJvbWlzZTxJQ2hhdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtTZXNzaW9uc01hbmFnZW1lbnRdIGNyZWF0ZU5ld0NoYXRJblNlc3Npb246IHByb3ZpZGVyICcke3Nlc3Npb24ucHJvdmlkZXJJZH0nIG5vdCBmb3VuZGApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gYGZvcmNlTmV3YCBza2lwcyByZXVzZSBzbyBjYWxsZXJzIGNhbiByZXNldCB0aGUgY29tcG9zZXIgcmlnaHQgYWZ0ZXJcblx0XHQvLyBzZW5kaW5nIGEgY2hhdCAod2hpY2ggbWF5IHN0aWxsIHRyYW5zaWVudGx5IHJlcG9ydCBgVW50aXRsZWRgKS5cblx0XHRpZiAoIW9wdGlvbnM/LmZvcmNlTmV3KSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ1VudGl0bGVkID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nVW50aXRsZWQpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nVW50aXRsZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gY3JlYXRlZDtcblx0fVxuXG5cdGFzeW5jIGZvcmtDaGF0SW5TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCBzb3VyY2VDaGF0OiBVUkksIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm92aWRlciAnJHtzZXNzaW9uLnByb3ZpZGVySWR9JyBub3QgZm91bmQgZm9yIHNlc3Npb24gJyR7c2Vzc2lvbi5zZXNzaW9uSWR9J2ApO1xuXHRcdH1cblx0XHRpZiAoIXNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke3Nlc3Npb24uc2Vzc2lvbklkfScgZG9lcyBub3Qgc3VwcG9ydCBmb3JraW5nIGludG8gYSBjaGF0YCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5mb3JrQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgc291cmNlQ2hhdCwgdHVybklkKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCBzb3VyY2VDaGF0OiBVUkksIHR1cm5JZDogc3RyaW5nLCBzZWxlY3Rpb24/OiBJU2lkZUNoYXRTZWxlY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb3ZpZGVyICcke3Nlc3Npb24ucHJvdmlkZXJJZH0nIG5vdCBmb3VuZCBmb3Igc2Vzc2lvbiAnJHtzZXNzaW9uLnNlc3Npb25JZH0nYCk7XG5cdFx0fVxuXHRcdGlmICghc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNTaWRlQ2hhdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke3Nlc3Npb24uc2Vzc2lvbklkfScgZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzYCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5jcmVhdGVTaWRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgc291cmNlQ2hhdCwgdHVybklkLCBzZWxlY3Rpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvciBhIGAvdHJvdWJsZXNob290YCByZXF1ZXN0LCBzdHJpcCBhbnkgYCNzZXNzaW9uYCBtYXJrZXIgYXR0YWNobWVudHMgYW5kXG5cdCAqIGFwcGVuZCBhIGBTZXNzaW9uIGxvZzpgIGxpbmUgd2l0aCB0aGUgcmVzb2x2ZWQgaG9zdC1sb2NhbCBgZXZlbnRzLmpzb25sYFxuXHQgKiBwYXRoKHMpIFx1MjAxNCB0aGUgcmVmZXJlbmNlZCBzZXNzaW9ucyBpZiBwcmVzZW50LCBvdGhlcndpc2UgdGhlIGN1cnJlbnQgb25lLlxuXHQgKiBSZXR1cm5zIGBvcHRpb25zYCB1bmNoYW5nZWQgd2hlbiB0aGVyZSBpcyBub3RoaW5nIHRvIGRvLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXVnbWVudE9wdGlvbnNGb3JUcm91Ymxlc2hvb3Qoc2Vzc2lvbjogSVNlc3Npb24sIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBJU2VuZFJlcXVlc3RPcHRpb25zIHtcblx0XHQvLyBTZXBhcmF0ZSBhbnkgYCNzZXNzaW9uYCByZWZlcmVuY2UgYXR0YWNobWVudHMgZnJvbSB0aGUgcmVhbCBjb250ZXh0LlxuXHRcdGNvbnN0IHJlZmVyZW5jZWRSZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdFx0bGV0IHJlbWFpbmluZ0F0dGFjaG1lbnRzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMuYXR0YWNoZWRDb250ZXh0Py5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHJlbWFpbmluZzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIG9wdGlvbnMuYXR0YWNoZWRDb250ZXh0KSB7XG5cdFx0XHRcdGNvbnN0IHJlZmVyZW5jZWQgPSBnZXRTZXNzaW9uUmVmZXJlbmNlUmVzb3VyY2UoZW50cnkpO1xuXHRcdFx0XHRpZiAocmVmZXJlbmNlZCkge1xuXHRcdFx0XHRcdHJlZmVyZW5jZWRSZXNvdXJjZXMucHVzaChyZWZlcmVuY2VkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZW1haW5pbmcucHVzaChlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChyZWZlcmVuY2VkUmVzb3VyY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRyZW1haW5pbmdBdHRhY2htZW50cyA9IHJlbWFpbmluZztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpc1Ryb3VibGVzaG9vdCA9IC9eXFxzKlxcL3Ryb3VibGVzaG9vdFxcYi8udGVzdChvcHRpb25zLnF1ZXJ5KTtcblx0XHRpZiAoIWlzVHJvdWJsZXNob290ICYmIHJlZmVyZW5jZWRSZXNvdXJjZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucztcblx0XHR9XG5cblx0XHQvLyBEcm9wIHRoZSByZWZlcmVuY2UgYXR0YWNobWVudHMgKG9ubHkgbWVhbmluZ2Z1bCB0byB1cywgbm90IHRoZSBtb2RlbCkuXG5cdFx0bGV0IHJlc3VsdCA9IG9wdGlvbnM7XG5cdFx0aWYgKHJlbWFpbmluZ0F0dGFjaG1lbnRzKSB7XG5cdFx0XHRyZXN1bHQgPSB7IC4uLnJlc3VsdCwgYXR0YWNoZWRDb250ZXh0OiByZW1haW5pbmdBdHRhY2htZW50cy5sZW5ndGggPyByZW1haW5pbmdBdHRhY2htZW50cyA6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0XHRpZiAoIWlzVHJvdWJsZXNob290KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhlIHRhcmdldCBzZXNzaW9uKHMpOiByZWZlcmVuY2VkIG9uZXMgaWYgcHJlc2VudCwgZWxzZSB0aGVcblx0XHQvLyBjdXJyZW50IHNlc3Npb24uXG5cdFx0Y29uc3QgdGFyZ2V0cyA9IHJlZmVyZW5jZWRSZXNvdXJjZXMubGVuZ3RoXG5cdFx0XHQ/IHJlZmVyZW5jZWRSZXNvdXJjZXNcblx0XHRcdDogKGdldENvcGlsb3RDbGlTZXNzaW9uUmF3SWQoc2Vzc2lvbi5yZXNvdXJjZSkgPyBbc2Vzc2lvbi5yZXNvdXJjZV0gOiBbXSk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKHsgcHJlZmVyTG9jYWw6IHRydWUgfSk7XG5cdFx0Y29uc3QgZ2V0Q29ubmVjdGlvbiA9IChhdXRob3JpdHk6IHN0cmluZykgPT4gdGhpcy5yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBhZ2VudEhvc3RBdXRob3JpdHkoYy5hZGRyZXNzKSA9PT0gYXV0aG9yaXR5KTtcblx0XHRjb25zdCBldmVudFBhdGhzID0gQXJyYXkuZnJvbShuZXcgU2V0KFxuXHRcdFx0dGFyZ2V0c1xuXHRcdFx0XHQubWFwKHJlc291cmNlID0+IGJ1aWxkSG9zdExvY2FsRXZlbnRzUGF0aChyZXNvdXJjZSwgdXNlckhvbWUsIGdldENvbm5lY3Rpb24pKVxuXHRcdFx0XHQuZmlsdGVyKChwYXRoKTogcGF0aCBpcyBzdHJpbmcgPT4gISFwYXRoKVxuXHRcdCkpO1xuXHRcdGlmIChldmVudFBhdGhzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgLi4ucmVzdWx0LCBxdWVyeTogYCR7cmVzdWx0LnF1ZXJ5fVxcblxcblNlc3Npb24gbG9nOiAke2V2ZW50UGF0aHMuam9pbignLCAnKX1gIH07XG5cdH1cblxuXHRhc3luYyBzZW5kTmV3Q2hhdFJlcXVlc3Qoc2Vzc2lvbjogSVNlc3Npb24sIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBUaGUgc2Vzc2lvbiBpcyBncmFkdWF0aW5nIGludG8gdGhlIGxpc3QgKGJlaW5nIHNlbnQpLFxuXHRcdC8vIHNvIHRoZSBwcm92aWRlciBrZWVwcyBvd25pbmcgaXQgXHUyMDE0IGp1c3QgZHJvcCB0aGUgcG9pbnRlciwgZG8gbm90IGRlbGV0ZS5cblx0XHQvLyBDbGVhcmluZyB0aGUgbmV3IHNlc3Npb24gcmVjb21wdXRlcyB0aGUgaXNOZXdDaGF0U2Vzc2lvbiBjb250ZXh0IGtleVxuXHRcdC8vIHZpYSB0aGUgdmlldyBzZXJ2aWNlJ3MgYWN0aXZlLXNlc3Npb24gYXV0b3J1bi5cblx0XHR0aGlzLl9uZXdTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7c2Vzc2lvbi5wcm92aWRlcklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuYmFja2dyb3VuZCkge1xuXHRcdFx0Ly8gRmlyZS1hbmQtZm9yZ2V0IHNvIHRoZSBjb21wb3NlciBjYW4gcmVzZXQgaW1tZWRpYXRlbHkuIE9uIGNvbW1pdFxuXHRcdFx0Ly8gZmFpbHVyZSB0aGUgZ3JhZHVhdGluZyBkcmFmdCBpcyBzdHJhbmRlZCwgc28gZGlzcG9zZSBpdCB0aHJvdWdoXG5cdFx0XHQvLyBpdHMgcHJvdmlkZXIgKG5vLW9wIGlmIGFscmVhZHkgZ3JhZHVhdGVkL3JlbW92ZWQpLlxuXHRcdFx0dGhpcy5fc2VuZE5ld0NoYXRSZXF1ZXN0SW5CYWNrZ3JvdW5kKHByb3ZpZGVyLCBzZXNzaW9uLCBvcHRpb25zKS5jYXRjaChlID0+IHtcblx0XHRcdFx0cHJvdmlkZXIuZGVsZXRlTmV3U2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW1Nlc3Npb25zTWFuYWdlbWVudF0gRmFpbGVkIHRvIHNlbmQgYmFja2dyb3VuZCByZXF1ZXN0OicsIGUpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9yZWdyb3VuZCBzZW5kOiBub3RpZnkgbGlzdGVuZXJzIHRoYXQgYSBzZW5kIGlzIHN0YXJ0aW5nLiBMaXN0ZW5lcnNcblx0XHQvLyAoZS5nLiwgdGVsZW1ldHJ5KSBjYW4gdXNlIHRoaXMgdG8gcHJld2FybSBjYWNoZXMgd2hvc2UgcmVzdWx0IGlzXG5cdFx0Ly8gY29uc3VtZWQgd2hlbiBgb25EaWRTZW5kUmVxdWVzdGAgZmlyZXMgYmVsb3cuIFRoZSBiYWNrZ3JvdW5kIHBhdGhcblx0XHQvLyBmaXJlcyB0aGlzIGZyb20gd2l0aGluIGBfc2VuZE5ld0NoYXRSZXF1ZXN0SW5CYWNrZ3JvdW5kYC4gVGhlIHZpZXdcblx0XHQvLyBzZXJ2aWNlIG9ic2VydmVzIHRoZSB3aWxsL2RpZCBzZW5kIHBhaXIgdG8ga2VlcCB0aGUgbmV3ZXN0IGNoYXRcblx0XHQvLyBhY3RpdmUgaW4gdGhlIHZpc2libGUgc2xvdCB3aGlsZSB0aGUgc2VuZCBtYXRlcmlhbGlzZXMuXG5cdFx0dGhpcy5fb25XaWxsU2VuZFJlcXVlc3QuZmlyZShzZXNzaW9uKTtcblxuXHRcdC8vIEFzayB0aGUgcHJvdmlkZXIgdG8gY3JlYXRlIHRoZSBuZXcgY2hhdCwgdGhlbiBzZW5kIHRoZSByZXF1ZXN0LlxuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBvcHRpb25zLnF1ZXJ5KTtcblxuXHRcdGNvbnN0IHNlbmRPcHRpb25zID0gdGhpcy5fYXVnbWVudE9wdGlvbnNGb3JUcm91Ymxlc2hvb3Qoc2Vzc2lvbiwgb3B0aW9ucyk7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlS2V5ID0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3BlbmRpbmdTZW5kQ2hhdFJlc291cmNlcy5hZGQoY2hhdFJlc291cmNlS2V5KTtcblx0XHRsZXQgdXBkYXRlZFNlc3Npb246IElTZXNzaW9uO1xuXHRcdHRyeSB7XG5cdFx0XHR1cGRhdGVkU2Vzc2lvbiA9IGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCBzZW5kT3B0aW9ucyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTZW5kQ2hhdFJlc291cmNlcy5kZWxldGUoY2hhdFJlc291cmNlS2V5KTtcblx0XHR9XG5cdFx0aWYgKHVwZGF0ZWRTZXNzaW9uLnNlc3Npb25JZCAhPT0gc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbU2Vzc2lvbnNNYW5hZ2VtZW50XSBzZW5kUmVxdWVzdDogYWN0aXZlIHNlc3Npb24gcmVwbGFjZWQ6ICR7c2Vzc2lvbi5zZXNzaW9uSWR9IC0+ICR7dXBkYXRlZFNlc3Npb24uc2Vzc2lvbklkfWApO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZFN0YXJ0U2Vzc2lvbi5maXJlKHVwZGF0ZWRTZXNzaW9uKTtcblx0XHR0aGlzLl9vbkRpZFNlbmRSZXF1ZXN0LmZpcmUoeyBzZXNzaW9uOiB1cGRhdGVkU2Vzc2lvbiwgY2hhdCwgaXNOZXdTZXNzaW9uOiB0cnVlLCBpc05ld0NoYXQ6IHRydWUsIG9wdGlvbnMgfSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHNlc3Npb24gZm9yIHRoZSBnaXZlbiBmb2xkZXIgYW5kIHNlbmQgYSBjaGF0IHJlcXVlc3QgdG8gaXQsXG5cdCAqIHdpdGhvdXQgbmF2aWdhdGluZyBpbnRvIHRoZSBzdGFydGVkIHNlc3Npb24uIFRoZSBzdGFydGVkIHNlc3Npb24gYXBwZWFyc1xuXHQgKiBpbiB0aGUgc2Vzc2lvbnMgbGlzdCBvbmNlIHRoZSBwcm92aWRlciBjb21taXRzIGl0LCB3aGlsZSB0aGUgdXNlcidzXG5cdCAqIGN1cnJlbnQgdmlldyBpcyBsZWZ0IHVudG91Y2hlZC4gUmV0dXJucyB0aGUgY29tbWl0dGVkIHNlc3Npb24sXG5cdCAqIG9yIGB1bmRlZmluZWRgIGlmIHRoZSBzZXJ2aWNlIHdhcyBkaXNwb3NlZCBkdXJpbmcgdGhlIHNlbmQuXG5cdCAqXG5cdCAqIFVubGlrZSB7QGxpbmsgc2VuZE5ld0NoYXRSZXF1ZXN0fSB3aXRoIGBiYWNrZ3JvdW5kYCwgdGhpcyBkb2VzIG5vdCBnb1xuXHQgKiB0aHJvdWdoIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlcjogaXQgY3JlYXRlcyBhIGZyZXNoIHNlc3Npb24gcHVyZWx5IGZvclxuXHQgKiB0aGlzIHJlcXVlc3QgYW5kIG5ldmVyIHNldHMgaXQgYXMgcGVuZGluZy9hY3RpdmUuIEludGVuZGVkIGZvciBjYWxsZXJzXG5cdCAqIG91dHNpZGUgdGhlIGNvbXBvc2VyIHRoYXQgd2FudCB0byBraWNrIG9mZiBhIHNlc3Npb24gcHJvZ3JhbW1hdGljYWxseS5cblx0ICpcblx0ICogSWYgdGhlIHNlbmQgb3IgYW55IGNvbmZpZ3VyYXRpb24gc2V0dGVyIGZhaWxzLCB0aGUgc3RyYW5kZWQgZHJhZnQgaXNcblx0ICogZGlzcG9zZWQgdGhyb3VnaCBpdHMgcHJvdmlkZXIgYW5kIHRoZSBlcnJvciBpcyByZXRocm93bi5cblx0ICovXG5cdGFzeW5jIGNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChmb2xkZXJVcmk6IFVSSSwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucywgY3JlYXRlT3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBzZXNzaW9uVHlwZUlkLCB3b3Jrc3BhY2UgfSA9IHRoaXMuX3Jlc29sdmVQcm92aWRlckZvck5ld1Nlc3Npb24oZm9sZGVyVXJpLCBjcmVhdGVPcHRpb25zKTtcblx0XHRpZiAod29ya3NwYWNlLnJlcXVpcmVzV29ya3NwYWNlVHJ1c3QpIHtcblx0XHRcdGNvbnN0IHRydXN0SW5mbyA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRVcmlUcnVzdEluZm8oZm9sZGVyVXJpKTtcblx0XHRcdGlmICghdHJ1c3RJbmZvLnRydXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFdvcmtzcGFjZU5vdFRydXN0ZWRFcnJvcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmksIHNlc3Npb25UeXBlSWQpO1xuXHRcdGNvbnN0IHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvblR5cGVzKGZvbGRlclVyaSlcblx0XHRcdC5maW5kKHNlc3Npb25UeXBlID0+IHNlc3Npb25UeXBlLmlkID09PSBzZXNzaW9uVHlwZUlkKT8uc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24gPT09IHRydWU7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyZUFuZFNlbmROZXdTZXNzaW9uKHByb3ZpZGVyLCBzZXNzaW9uLCBvcHRpb25zLCBjcmVhdGVPcHRpb25zLCBzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiwgdG9rZW4sIGZvbGRlclVyaSk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVBbmRTZW5kUXVpY2tDaGF0UmVxdWVzdChvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zLCBjcmVhdGVPcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIHNlc3Npb25UeXBlSWQgfSA9IHRoaXMuX3Jlc29sdmVQcm92aWRlckZvclF1aWNrQ2hhdChjcmVhdGVPcHRpb25zKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlUXVpY2tDaGF0KHNlc3Npb25UeXBlSWQpO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmVBbmRTZW5kTmV3U2Vzc2lvbihwcm92aWRlciwgc2Vzc2lvbiwgb3B0aW9ucywgY3JlYXRlT3B0aW9ucywgZmFsc2UsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbmZpZ3VyZUFuZFNlbmROZXdTZXNzaW9uKFxuXHRcdHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlcixcblx0XHRzZXNzaW9uOiBJU2Vzc2lvbixcblx0XHRvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zLFxuXHRcdGNyZWF0ZU9wdGlvbnM6IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogYm9vbGVhbixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0Zm9sZGVyVXJpPzogVVJJLFxuXHQpOiBQcm9taXNlPElTZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdGlmIChjcmVhdGVPcHRpb25zPy5tb2RlbElkKSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkTW9kZWxJZCA9IGF3YWl0IHRoaXMuX3dhaXRGb3JSZXF1ZXN0ZWRNb2RlbChwcm92aWRlciwgc2Vzc2lvbiwgY3JlYXRlT3B0aW9ucy5tb2RlbElkLCB0b2tlbiwgZm9sZGVyVXJpKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbi5zZXNzaW9uSWQsIHJlc29sdmVkTW9kZWxJZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3JlYXRlT3B0aW9ucz8ubW9kZUlkKSB7XG5cdFx0XHRcdHByb3ZpZGVyLnNldE1vZGU/LihzZXNzaW9uLnNlc3Npb25JZCwgY3JlYXRlT3B0aW9ucy5tb2RlSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNyZWF0ZU9wdGlvbnM/LnBlcm1pc3Npb25MZXZlbCkge1xuXHRcdFx0XHRwcm92aWRlci5zZXRQZXJtaXNzaW9uTGV2ZWw/LihzZXNzaW9uLnNlc3Npb25JZCwgY3JlYXRlT3B0aW9ucy5wZXJtaXNzaW9uTGV2ZWwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uICYmIChjcmVhdGVPcHRpb25zPy5pc29sYXRpb25Nb2RlIHx8IGNyZWF0ZU9wdGlvbnM/Lndvcmt0cmVlQnJhbmNoVHJhY2sgIT09IHVuZGVmaW5lZCB8fCBjcmVhdGVPcHRpb25zPy5icmFuY2gpKSB7XG5cdFx0XHRcdGlmIChjcmVhdGVPcHRpb25zLmlzb2xhdGlvbk1vZGUgJiYgcHJvdmlkZXIuc2V0SXNvbGF0aW9uTW9kZSkge1xuXHRcdFx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihwcm92aWRlci5zZXRJc29sYXRpb25Nb2RlKHNlc3Npb24uc2Vzc2lvbklkLCBjcmVhdGVPcHRpb25zLmlzb2xhdGlvbk1vZGUpLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNyZWF0ZU9wdGlvbnMud29ya3RyZWVCcmFuY2hUcmFjayAhPT0gdW5kZWZpbmVkICYmIHByb3ZpZGVyLnNldFdvcmt0cmVlQnJhbmNoVHJhY2spIHtcblx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IocHJvdmlkZXIuc2V0V29ya3RyZWVCcmFuY2hUcmFjayhzZXNzaW9uLnNlc3Npb25JZCwgY3JlYXRlT3B0aW9ucy53b3JrdHJlZUJyYW5jaFRyYWNrKSwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjcmVhdGVPcHRpb25zLmJyYW5jaCAmJiBwcm92aWRlci5zZXRCcmFuY2gpIHtcblx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IocHJvdmlkZXIuc2V0QnJhbmNoKHNlc3Npb24uc2Vzc2lvbklkLCBjcmVhdGVPcHRpb25zLmJyYW5jaCksIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuX3NlbmROZXdDaGF0UmVxdWVzdEluQmFja2dyb3VuZChwcm92aWRlciwgc2Vzc2lvbiwgb3B0aW9ucywgdG9rZW4pLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gVGhlIHNlbmQgbmV2ZXIgY29tbWl0dGVkLCBzbyB0aGUgZHJhZnQgaXMgc3RyYW5kZWQuIERpc3Bvc2UgaXRcblx0XHRcdC8vIHRocm91Z2ggaXRzIHByb3ZpZGVyIHRvIHJlbGVhc2UgdGhlIGVhZ2VyIGJhY2tlbmQgc2Vzc2lvbiBiZWZvcmVcblx0XHRcdC8vIHJldGhyb3dpbmcuIFNhZmUgbm8tb3AgaWYgdGhlIHByb3ZpZGVyIGFscmVhZHkgcmVtb3ZlZCBpdC5cblx0XHRcdHByb3ZpZGVyLmRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93YWl0Rm9yUmVxdWVzdGVkTW9kZWwocHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uOiBJU2Vzc2lvbiwgbW9kZWxJZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGZvbGRlclVyaT86IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZUN1cnJlbnQgPSAoKSA9PiBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCwgbW9kZWxJZCkuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjtcblx0XHRjb25zdCBpbml0aWFsID0gcmVzb2x2ZUN1cnJlbnQoKTtcblx0XHRpZiAoaW5pdGlhbC5raW5kID09PSAnYXZhaWxhYmxlJykge1xuXHRcdFx0cmV0dXJuIGluaXRpYWwubW9kZWwuaWRlbnRpZmllcjtcblx0XHR9XG5cdFx0aWYgKGluaXRpYWwua2luZCA9PT0gJ25vdFJlcXVlc3RlZCcpIHtcblx0XHRcdHJldHVybiBtb2RlbElkO1xuXHRcdH1cblx0XHRpZiAoaW5pdGlhbC5raW5kID09PSAndW5hdmFpbGFibGUnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1vZGVsICcke21vZGVsSWR9JyBpcyB1bmF2YWlsYWJsZSBmb3Igc2Vzc2lvbnMgcHJvdmlkZXIgJyR7cHJvdmlkZXIuaWR9J2ApO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGZpbmlzaCA9IChyZXN1bHQ6IHN0cmluZyB8IEVycm9yKSA9PiB7XG5cdFx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRcdHJlamVjdChyZXN1bHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNoZWNrID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHV0aW9uID0gcmVzb2x2ZUN1cnJlbnQoKTtcblx0XHRcdFx0aWYgKHJlc29sdXRpb24ua2luZCA9PT0gJ2F2YWlsYWJsZScpIHtcblx0XHRcdFx0XHRmaW5pc2gocmVzb2x1dGlvbi5tb2RlbC5pZGVudGlmaWVyKTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXNvbHV0aW9uLmtpbmQgPT09ICdub3RSZXF1ZXN0ZWQnKSB7XG5cdFx0XHRcdFx0ZmluaXNoKG1vZGVsSWQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJlc29sdXRpb24ua2luZCA9PT0gJ3VuYXZhaWxhYmxlJykge1xuXHRcdFx0XHRcdGZpbmlzaChuZXcgRXJyb3IoYE1vZGVsICcke21vZGVsSWR9JyBpcyB1bmF2YWlsYWJsZSBmb3Igc2Vzc2lvbnMgcHJvdmlkZXIgJyR7cHJvdmlkZXIuaWR9J2ApKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZU1vZGVscyhjaGVjaykpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzKCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGVzID0gZm9sZGVyVXJpID8gcHJvdmlkZXIuZ2V0U2Vzc2lvblR5cGVzKGZvbGRlclVyaSkgOiBwcm92aWRlci5zZXNzaW9uVHlwZXM7XG5cdFx0XHRcdGlmICghc2Vzc2lvblR5cGVzLnNvbWUodHlwZSA9PiB0eXBlLmlkID09PSBzZXNzaW9uLnNlc3Npb25UeXBlKSkge1xuXHRcdFx0XHRcdGZpbmlzaChuZXcgRXJyb3IoYFNlc3Npb24gdHlwZSAnJHtzZXNzaW9uLnNlc3Npb25UeXBlfScgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZSBmb3Igc2Vzc2lvbnMgcHJvdmlkZXIgJyR7cHJvdmlkZXIuaWR9J2ApKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvdmlkZXJzKGV2ZW50ID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50LnJlbW92ZWQuaW5jbHVkZXMocHJvdmlkZXIpKSB7XG5cdFx0XHRcdFx0ZmluaXNoKG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7cHJvdmlkZXIuaWR9JyBpcyBubyBsb25nZXIgYXZhaWxhYmxlYCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gZmluaXNoKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2Rpc3Bvc2VDdHMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gZmluaXNoKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKSkpO1xuXHRcdFx0Y2hlY2soKTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZUN0cy5jYW5jZWwoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tbWl0IGEgbmV3LXNlc3Npb24gcmVxdWVzdDogZmlyZSB7QGxpbmsgX29uV2lsbFNlbmRSZXF1ZXN0fSwgY3JlYXRlIHRoZVxuXHQgKiBuZXcgY2hhdCB2aWEgdGhlIHByb3ZpZGVyLCBzZW5kIHRoZSByZXF1ZXN0LCBhbmRcdTIwMTRvbiBzdWNjZXNzXHUyMDE0ZmlyZVxuXHQgKiB7QGxpbmsgX29uRGlkU3RhcnRTZXNzaW9ufSBhbmQge0BsaW5rIF9vbkRpZFNlbmRSZXF1ZXN0fS4gVGhlIHN0YXJ0ZWRcblx0ICogc2Vzc2lvbiBpcyBuZXZlciBzd2FwcGVkIGludG8gdGhlIHZpc2libGUgY2hhdCBzbG90LCBzbyBpdCBzaW1wbHkgYXBwZWFyc1xuXHQgKiBpbiB0aGUgc2Vzc2lvbnMgbGlzdCBvbmNlIHRoZSBwcm92aWRlciBjb21taXRzIGl0LlxuXHQgKlxuXHQgKiBPd25zIHRoZSBmdWxsIHdpbGwvZGlkIHNlbmQgbGlmZWN5Y2xlIHNvIGNhbGxlcnMgZG8gbm90IGZpcmUgdGhlIHBhaXJlZFxuXHQgKiBldmVudHMgdGhlbXNlbHZlcy4gRXJyb3JzIGFyZSBwcm9wYWdhdGVkIHRvIHRoZSBjYWxsZXI7IHRoaXMgbWV0aG9kIGRvZXNcblx0ICogbm90IGNsZWFuIHVwIHRoZSBzdHJhbmRlZCBkcmFmdCwgc28gY2FsbGVycyBvd24gYW55IHZpZXcgaGFuZGxpbmcgYW5kIHRoZVxuXHQgKiBlcnJvciBoYW5kbGluZyAoZS5nLiBkaXNwb3NpbmcgdGhlIHN0cmFuZGVkIGRyYWZ0IHZpYVxuXHQgKiB7QGxpbmsgSVNlc3Npb25zUHJvdmlkZXIuZGVsZXRlTmV3U2Vzc2lvbn0pLlxuXHQgKlxuXHQgKiBQcm92aWRlcnMgYXJlIG11bHRpLW5ldy1zZXNzaW9uIGF3YXJlLCBzbyB0aGUgZ3JhZHVhdGluZyBzZXNzaW9uIGFuZCBhXG5cdCAqIGNvbmN1cnJlbnRseSByZXNlZWRlZCBjb21wb3NlciBkcmFmdCBjb2V4aXN0IHdpdGhvdXQgY29uZmxpY3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zZW5kTmV3Q2hhdFJlcXVlc3RJbkJhY2tncm91bmQocHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uOiBJU2Vzc2lvbiwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHQvLyBOb3RpZnkgbGlzdGVuZXJzIChlLmcuLCB0ZWxlbWV0cnkpIHRoYXQgYSBzZW5kIGlzIHN0YXJ0aW5nIHNvIHRoZXkgY2FuXG5cdFx0Ly8gcHJld2FybSBjYWNoZXMgd2hvc2UgcmVzdWx0IGlzIGNvbnN1bWVkIHdoZW4gYG9uRGlkU2VuZFJlcXVlc3RgIGZpcmVzLlxuXHRcdHRoaXMuX29uV2lsbFNlbmRSZXF1ZXN0LmZpcmUoc2Vzc2lvbik7XG5cdFx0Y29uc3QgY2hhdFByb21pc2UgPSBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBvcHRpb25zLnF1ZXJ5KTtcblx0XHRjb25zdCBjaGF0ID0gdG9rZW4gPT09IENhbmNlbGxhdGlvblRva2VuLk5vbmUgPyBhd2FpdCBjaGF0UHJvbWlzZSA6IGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihjaGF0UHJvbWlzZSwgdG9rZW4pO1xuXG5cdFx0Ly8gU3VwcHJlc3MgdGhlIGBjaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3RgIG1pcnJvciBmb3IgdGhpcyBzZW5kIHNvXG5cdFx0Ly8gYF9vbkRpZFNlbmRSZXF1ZXN0YCBpcyBub3QgZmlyZWQgdHdpY2UgZm9yIHByb3ZpZGVycyB0aGF0IGRpc3BhdGNoXG5cdFx0Ly8gdGhyb3VnaCBgY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3RgIChzZWUgdGhlIG1pcnJvciBpbiB0aGUgY29uc3RydWN0b3IpLlxuXHRcdGNvbnN0IHNlbmRPcHRpb25zID0gdGhpcy5fYXVnbWVudE9wdGlvbnNGb3JUcm91Ymxlc2hvb3Qoc2Vzc2lvbiwgb3B0aW9ucyk7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlS2V5ID0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3BlbmRpbmdTZW5kQ2hhdFJlc291cmNlcy5hZGQoY2hhdFJlc291cmNlS2V5KTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25MaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5jaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24oY2hhdC5yZXNvdXJjZSwgJ3Nlc3Npb25zTWFuYWdlbWVudCcpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tTZXNzaW9uc01hbmFnZW1lbnRdIEZhaWxlZCB0byBjYW5jZWwgaGVhZGxlc3MgcmVxdWVzdDonLCBlcnJvcik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRsZXQgdXBkYXRlZFNlc3Npb246IElTZXNzaW9uO1xuXHRcdHRyeSB7XG5cdFx0XHR1cGRhdGVkU2Vzc2lvbiA9IGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCBzZW5kT3B0aW9ucyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNhbmNlbGxhdGlvbkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdTZW5kQ2hhdFJlc291cmNlcy5kZWxldGUoY2hhdFJlc291cmNlS2V5KTtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkU3RhcnRTZXNzaW9uLmZpcmUodXBkYXRlZFNlc3Npb24pO1xuXHRcdHRoaXMuX29uRGlkU2VuZFJlcXVlc3QuZmlyZSh7IHNlc3Npb246IHVwZGF0ZWRTZXNzaW9uLCBjaGF0LCBpc05ld1Nlc3Npb246IHRydWUsIGlzTmV3Q2hhdDogdHJ1ZSwgb3B0aW9ucyB9KTtcblx0XHRyZXR1cm4gdXBkYXRlZFNlc3Npb247XG5cdH1cblxuXHRhc3luYyBzZW5kUmVxdWVzdChzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdDogSUNoYXQsIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTZW5kaW5nIGludG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbiBhYmFuZG9ucyBhbnkgaW4tcHJvZ3Jlc3MgbmV3IHNlc3Npb24sXG5cdFx0Ly8gc28gZGlzcG9zZSBpdCB0byByZWxlYXNlIGl0cyBlYWdlciBiYWNrZW5kIHNlc3Npb24uXG5cdFx0dGhpcy5kaXNjYXJkTmV3U2Vzc2lvbigpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb25zIHByb3ZpZGVyICcke3Nlc3Npb24ucHJvdmlkZXJJZH0nIG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmJhY2tncm91bmQpIHtcblx0XHRcdC8vIEZpcmUtYW5kLWZvcmdldCBzbyB0aGUgY29tcG9zZXIgY2FuIHJlc2V0IGltbWVkaWF0ZWx5LiBVbmxpa2UgdGhlXG5cdFx0XHQvLyBmb3JlZ3JvdW5kIHBhdGggdGhpcyBza2lwcyBgX29uV2lsbFNlbmRSZXF1ZXN0YCBzbyB0aGUgdmlldydzXG5cdFx0XHQvLyBzZW5kLWZvbGxvdyBkb2VzIG5vdCBuYXZpZ2F0ZSB0aGUgdmlzaWJsZSBzbG90IGludG8gdGhlIHNlbnQgY2hhdC5cblx0XHRcdHRoaXMuX3NlbmRSZXF1ZXN0SW5CYWNrZ3JvdW5kKHByb3ZpZGVyLCBzZXNzaW9uLCBjaGF0LCBvcHRpb25zKS5jYXRjaChlID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbU2Vzc2lvbnNNYW5hZ2VtZW50XSBGYWlsZWQgdG8gc2VuZCBiYWNrZ3JvdW5kIHJlcXVlc3Q6JywgZSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBOb3RpZnkgbGlzdGVuZXJzIHRoYXQgYSBzZW5kIGlzIHN0YXJ0aW5nLiBMaXN0ZW5lcnMgKGUuZy4sIHRlbGVtZXRyeSlcblx0XHQvLyBjYW4gdXNlIHRoaXMgdG8gcHJld2FybSBjYWNoZXMgd2hvc2UgcmVzdWx0IGlzIGNvbnN1bWVkIHdoZW5cblx0XHQvLyBgb25EaWRTZW5kUmVxdWVzdGAgZmlyZXMgYmVsb3cuIFRoZSB2aWV3IHNlcnZpY2Ugb2JzZXJ2ZXMgdGhlIHdpbGwvZGlkXG5cdFx0Ly8gc2VuZCBwYWlyIHRvIGtlZXAgdGhlIHNlbnQgY2hhdCBhY3RpdmUgaW4gdGhlIHZpc2libGUgc2xvdC5cblx0XHR0aGlzLl9vbldpbGxTZW5kUmVxdWVzdC5maXJlKHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnMgPSB0aGlzLl9hdWdtZW50T3B0aW9uc0ZvclRyb3VibGVzaG9vdChzZXNzaW9uLCBvcHRpb25zKTtcblx0XHRjb25zdCBjaGF0UmVzb3VyY2VLZXkgPSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzLmFkZChjaGF0UmVzb3VyY2VLZXkpO1xuXHRcdGxldCB1cGRhdGVkU2Vzc2lvbjogSVNlc3Npb247XG5cdFx0dHJ5IHtcblx0XHRcdHVwZGF0ZWRTZXNzaW9uID0gYXdhaXQgcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHNlbmRPcHRpb25zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzLmRlbGV0ZShjaGF0UmVzb3VyY2VLZXkpO1xuXHRcdH1cblx0XHRpZiAodXBkYXRlZFNlc3Npb24uc2Vzc2lvbklkICE9PSBzZXNzaW9uLnNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtTZXNzaW9uc01hbmFnZW1lbnRdIHNlbmRSZXF1ZXN0OiBhY3RpdmUgc2Vzc2lvbiByZXBsYWNlZDogJHtzZXNzaW9uLnNlc3Npb25JZH0gLT4gJHt1cGRhdGVkU2Vzc2lvbi5zZXNzaW9uSWR9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRTZW5kUmVxdWVzdC5maXJlKHsgc2Vzc2lvbjogdXBkYXRlZFNlc3Npb24sIGNoYXQsIGlzTmV3U2Vzc2lvbjogZmFsc2UsIGlzTmV3Q2hhdDogdHJ1ZSwgb3B0aW9ucyB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIGEgcmVxdWVzdCBmb3IgYW4gZXhpc3RpbmcgY2hhdCBpbiB0aGUgYmFja2dyb3VuZDogY29tbWl0IHRoZSBzZW5kIHZpYVxuXHQgKiB0aGUgcHJvdmlkZXIgYW5kXHUyMDE0b24gc3VjY2Vzc1x1MjAxNGZpcmUge0BsaW5rIF9vbkRpZFNlbmRSZXF1ZXN0fS4gVW5saWtlIHRoZVxuXHQgKiBmb3JlZ3JvdW5kIHtAbGluayBzZW5kUmVxdWVzdH0gcGF0aCB0aGlzIGRvZXMgbm90IGZpcmVcblx0ICoge0BsaW5rIF9vbldpbGxTZW5kUmVxdWVzdH0sIHNvIHRoZSB2aWV3J3Mgc2VuZC1mb2xsb3cgbmV2ZXIgbmF2aWdhdGVzIHRoZVxuXHQgKiB2aXNpYmxlIHNsb3QgaW50byB0aGUgc2VudCBjaGF0LiBFcnJvcnMgYXJlIHByb3BhZ2F0ZWQgdG8gdGhlIGNhbGxlci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRSZXF1ZXN0SW5CYWNrZ3JvdW5kKHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlciwgc2Vzc2lvbjogSVNlc3Npb24sIGNoYXQ6IElDaGF0LCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnMgPSB0aGlzLl9hdWdtZW50T3B0aW9uc0ZvclRyb3VibGVzaG9vdChzZXNzaW9uLCBvcHRpb25zKTtcblx0XHRjb25zdCBjaGF0UmVzb3VyY2VLZXkgPSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzLmFkZChjaGF0UmVzb3VyY2VLZXkpO1xuXHRcdGxldCB1cGRhdGVkU2Vzc2lvbjogSVNlc3Npb247XG5cdFx0dHJ5IHtcblx0XHRcdHVwZGF0ZWRTZXNzaW9uID0gYXdhaXQgcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHNlbmRPcHRpb25zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzLmRlbGV0ZShjaGF0UmVzb3VyY2VLZXkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZFNlbmRSZXF1ZXN0LmZpcmUoeyBzZXNzaW9uOiB1cGRhdGVkU2Vzc2lvbiwgY2hhdCwgaXNOZXdTZXNzaW9uOiBmYWxzZSwgaXNOZXdDaGF0OiB0cnVlLCBvcHRpb25zIH0pO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbiBBY3Rpb25zIC0tXG5cblx0cHJpdmF0ZSBfZ2V0UHJvdmlkZXIoc2Vzc2lvbjogSVNlc3Npb24pOiBJU2Vzc2lvbnNQcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpLmZpbmQocCA9PiBwLmlkID09PSBzZXNzaW9uLnByb3ZpZGVySWQpO1xuXHR9XG5cblx0YXN5bmMgYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKT8uYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkQXJjaGl2ZVNlc3Npb24uZmlyZShzZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIHVuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKT8udW5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0dGhpcy5fb25EaWRVbmFyY2hpdmVTZXNzaW9uLmZpcmUoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyBzZXRTZXNzaW9uUmVhZFN0YXRlKHNlc3Npb246IElTZXNzaW9uLCBpc1JlYWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKT8uc2V0U2Vzc2lvblJlYWRTdGF0ZShzZXNzaW9uLnNlc3Npb25JZCwgaXNSZWFkKTtcblx0fVxuXG5cdG1hcmtSZWFkKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2V0U2Vzc2lvblJlYWRTdGF0ZShzZXNzaW9uLCB0cnVlKTtcblx0fVxuXG5cdG1hcmtVbnJlYWQoc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXRTZXNzaW9uUmVhZFN0YXRlKHNlc3Npb24sIGZhbHNlKTtcblx0fVxuXG5cdGFzeW5jIG1hcmtBbGxSZWFkKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gdGhpcy5zZXRTZXNzaW9uUmVhZFN0YXRlKHNlc3Npb24sIHRydWUpKSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik/LmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkRGVsZXRlU2Vzc2lvbi5maXJlKHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbnMoc2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBieVByb3ZpZGVyID0gbmV3IE1hcDxJU2Vzc2lvbnNQcm92aWRlciwgSVNlc3Npb25bXT4oKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik7XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZ3JvdXAgPSBieVByb3ZpZGVyLmdldChwcm92aWRlcik7XG5cdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0Z3JvdXAucHVzaChzZXNzaW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ5UHJvdmlkZXIuc2V0KHByb3ZpZGVyLCBbc2Vzc2lvbl0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBmaXJzdEVycm9yOiB1bmtub3duO1xuXHRcdGZvciAoY29uc3QgW3Byb3ZpZGVyLCBwcm92aWRlclNlc3Npb25zXSBvZiBieVByb3ZpZGVyKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwcm92aWRlci5kZWxldGVTZXNzaW9ucyhwcm92aWRlclNlc3Npb25zLm1hcChzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkKSk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBwcm92aWRlclNlc3Npb25zKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWREZWxldGVTZXNzaW9uLmZpcmUoc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpcnN0RXJyb3IgPz89IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmaXJzdEVycm9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IGZpcnN0RXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGVsZXRlQ2hhdChzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdFVyaTogVVJJLCBvcHRpb25zPzogSURlbGV0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVsZXRlZCA9IGF3YWl0IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pPy5kZWxldGVDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0VXJpLCBvcHRpb25zKTtcblx0XHRpZiAoZGVsZXRlZCkge1xuXHRcdFx0dGhpcy5fb25EaWREZWxldGVDaGF0LmZpcmUoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVuYW1lQ2hhdChzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdFVyaTogVVJJLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik/LnJlbmFtZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXRVcmksIHRpdGxlKTtcblx0XHR0aGlzLl9vbkRpZFJlbmFtZUNoYXQuZmlyZShzZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIHJlbmFtZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24sIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKT8ucmVuYW1lU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCwgdGl0bGUpO1xuXHRcdHRoaXMuX29uRGlkUmVuYW1lU2Vzc2lvbi5maXJlKHNlc3Npb24pO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSxlQUFlLHVCQUFvQztBQUN4RSxTQUFzQix1QkFBdUI7QUFFN0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywwQkFBMEIsaUNBQWlDO0FBRXBFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DO0FBQzVD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
