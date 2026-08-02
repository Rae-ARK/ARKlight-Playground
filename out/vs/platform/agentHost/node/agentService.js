import { open, unlink } from "fs/promises";
import { decodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { DeferredPromise, disposableTimeout, ResourceQueue } from "../../../base/common/async.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { LRUCache, ResourceMap } from "../../../base/common/map.js";
import { getExtensionForMimeType, getMediaMime } from "../../../base/common/mime.js";
import { Schemas } from "../../../base/common/network.js";
import { observableValue } from "../../../base/common/observable.js";
import { dirname as resourcesDirname, extname as resourcesExtname, extUriBiasedIgnorePathCase, isEqual, isEqualOrParent, joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { hasKey } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
import { FileChangeType, FileOperationResult, toFileOperationResult } from "../../files/common/files.js";
import { InstantiationService } from "../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../instantiation/common/serviceCollection.js";
import { ILogService } from "../../log/common/log.js";
import { AgentSession, AgentHostSessionReleaseGraceMsEnvVar, IAgentService, SubagentChatSignal } from "../common/agentService.js";
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from "../common/sessionDataService.js";
import { parseEditAttributionResource } from "../common/fileEditAttribution.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { ActionType, AuthRequiredReason } from "../common/state/sessionActions.js";
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, ResourceChangeType, ResourceType, ResourceWriteMode } from "../common/state/sessionProtocol.js";
import { ChatInteractivity, ChatOriginKind, MessageAttachmentKind } from "../common/state/protocol/state.js";
import { MessageKind, ResponsePartKind, SESSION_META_GITHUB_KEY, SESSION_META_GIT_KEY, readSessionSpawnDepth, withSessionSpawnDepth, SessionStatus, ToolCallStatus, ToolResultContentType, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, buildChatUri, buildDefaultChatUri, buildResourceWatchChannelUri, buildSubagentChatUri, buildSubagentSessionUriPrefix, hostBuildInfoFromProduct, isAhpChatChannel, isDefaultChatUri, isSubagentChatUri, isSubagentSession, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, parseResourceWatchChannelUri, parseSubagentSessionUri, readSessionGitState, readSessionWorkspaceless, withSessionGitHubState, withSessionGitState, withSessionStatusFlag, withSessionWorkspaceless, chatStorageUri, hasReportedUsage } from "../common/state/sessionState.js";
import { readToolCallMeta } from "../common/meta/agentToolCallMeta.js";
import { IProductService } from "../../product/common/productService.js";
import { buildBoundedSideChatSourceContext, getSideChatPartialResponse } from "./agentPeerChats.js";
import { AgentConfigurationService, IAgentConfigurationService } from "./agentConfigurationService.js";
import { AgentHostTerminalManager, IAgentHostTerminalManager } from "./agentHostTerminalManager.js";
import { parseSessionDbUri } from "../common/sessionDbUri.js";
import { parseGitBlobUri } from "./gitDiffContent.js";
import { AgentHostStateManager, IAgentHostStateManager } from "./agentHostStateManager.js";
import { IAgentHostGitService, tryResolvePrimaryWorktreeRoot } from "../common/agentHostGitService.js";
import { AgentSideEffects } from "./agentSideEffects.js";
import { AgentHostLocalTurns } from "./agentHostLocalTurns.js";
import { AgentServerToolHost } from "./shared/agentServerToolHost.js";
import { buildServerToolGroups } from "./shared/serverToolGroups.js";
import { WORKTREE_META_REPOSITORY_ROOT, worktreeProjectFromRepositoryRoot } from "./shared/worktreeIsolation.js";
import { AgentHostChangesetService } from "./agentHostChangesetService.js";
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from "./agentHostFileMonitorService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { IAgentHostReviewService } from "../common/agentHostReviewService.js";
import { AgentHostChangesetCoordinator } from "./agentHostChangesetCoordinator.js";
import { AgentHostCompletions } from "./agentHostCompletions.js";
import { AgentHostChatCompletionProvider } from "./agentHostChatCompletionProvider.js";
import { AgentHostFileCompletionProvider } from "./agentHostFileCompletionProvider.js";
import { AgentHostRenameCompletionProvider } from "./agentHostRenameCommand.js";
import { AgentHostSkillCompletionProvider } from "./agentHostSkillCompletionProvider.js";
import { AgentHostWorkspaceFiles } from "./agentHostWorkspaceFiles.js";
import { CopilotApiService, ICopilotApiService } from "./shared/copilotApiService.js";
import { parseMcpChannelUri } from "./shared/mcpCustomizationController.js";
import { toAgentClientUri } from "../common/agentClientUri.js";
import { AgentHostClientType } from "../common/agentHostClientInfo.js";
import { AgentHostChangesetOperationService } from "./agentHostChangesetOperationService.js";
import { AgentHostGitStateService } from "./agentHostGitStateService.js";
import { AgentHostGitHubEndpointService, IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../telemetry/common/telemetryUtils.js";
import { AgentHostAuthenticationService } from "./agentHostAuthenticationService.js";
import { updateAgentHostTelemetryLevelFromConfig } from "./agentHostTelemetryService.js";
import { AgentHostEditTelemetryEnabledConfigKey } from "../common/agentHostSchema.js";
import { AgentHostOctoKitService, IAgentHostOctoKitService } from "./shared/agentHostOctoKitService.js";
import { IAgentHostChangesetService, CHANGESET_DB_METADATA_KEYS, META_CHANGES_SUMMARY } from "../common/agentHostChangesetService.js";
import { IAgentHostChangesetSubscriptionService } from "../common/agentHostChangesetSubscriptionService.js";
import { AgentHostChangesetSubscriptionService } from "./agentHostChangesetSubscriptionService.js";
import { GIT_DB_METADATA_KEYS, IAgentHostGitStateService, META_GIT_STATE, META_GITHUB_STATE } from "../common/agentHostGitStateService.js";
import { IAgentHostChangesetOperationService } from "../common/agentHostChangesetOperationService.js";
import { AgentHostCommitOperationContribution } from "./agentHostCommitOperationProvider.js";
import { AgentHostDiscardChangesOperationContribution } from "./agentHostDiscardChangesOperationProvider.js";
import { AgentHostPullRequestOperationContribution } from "./agentHostPullRequestOperationProvider.js";
import { AgentHostSyncOperationContribution } from "./agentHostSyncOperationProvider.js";
import { AgentHostReviewService } from "./agentHostReviewService.js";
import { AgentHostCheckpointService } from "./agentHostCheckpointService.js";
const SESSION_GC_GRACE_MS = 3e4;
const HOST_OWNED_SESSION_CONFIG_KEYS = [
  SessionConfigKey.Isolation,
  SessionConfigKey.Branch,
  SessionConfigKey.WorktreeBranchPrefix,
  SessionConfigKey.WorktreeIncludeFiles,
  SessionConfigKey.WorktreeBranchTrack
];
function omitHostOwnedSessionConfig(config) {
  const result = { ...config };
  for (const key of HOST_OWNED_SESSION_CONFIG_KEYS) {
    delete result[key];
  }
  return result;
}
const RESOURCE_WATCH_GRACE_MS = 3e4;
const SUBAGENT_CHAT_PENDING_TIMEOUT_MS = 15e3;
const SESSION_RELEASE_GRACE_MS = (() => {
  const raw = process.env[AgentHostSessionReleaseGraceMsEnvVar];
  const parsed = raw !== void 0 ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3e4;
})();
const PEER_CHATS_METADATA_KEY = "peerChats";
const PEER_CHAT_BACKING_METADATA_KEY = "peerChatBacking";
function reconcileWorkingDirectories(requested, resolved) {
  if (resolved === void 0) {
    return requested?.map((d) => d.toString());
  }
  const tail = (requested ?? []).slice(resolved.length);
  return [...resolved, ...tail].map((d) => d.toString());
}
class AgentService extends Disposable {
  constructor(_logService, _fileService, _sessionDataService, _productService, _gitService, _rootConfigResource, _telemetryService = NullTelemetryService, _fileMonitorService, copilotApiService, fetchFn, providerConfigurations = []) {
    super();
    this._logService = _logService;
    this._fileService = _fileService;
    this._sessionDataService = _sessionDataService;
    this._productService = _productService;
    this._gitService = _gitService;
    this._rootConfigResource = _rootConfigResource;
    this._telemetryService = _telemetryService;
    this._resourceWriteQueue = this._register(new ResourceQueue());
    /** Protocol: fires when state is mutated by an action. */
    this._onDidAction = this._register(new Emitter());
    this.onDidAction = this._onDidAction.event;
    /** Protocol: fires for ephemeral notifications (sessionAdded/Removed). */
    this._onDidNotification = this._register(new Emitter());
    this.onDidNotification = this._onDidNotification.event;
    /** Protocol: fires for MCP server-originated notifications routed over `mcp://` channels. */
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    /** Registered providers keyed by their {@link AgentProvider} id. */
    this._providers = /* @__PURE__ */ new Map();
    /** Maps each active session URI (toString) to its owning provider. */
    this._sessionToProvider = /* @__PURE__ */ new Map();
    /**
     * Sessions that have opted in to bring-up progress, keyed by provider id.
     * A session is added here when its `createSession` carries a
     * {@link IAgentCreateSessionConfig.progressToken} and removed once it
     * materializes (the SDK is now resolved) or is disposed. The SDK download is
     * host-level and shared across every session of a provider, so this only
     * records *interest*: as long as one or more sessions of a provider is
     * registered, {@link emitDownloadProgress} surfaces that provider's download as a single
     * progress stream keyed by the download's own identity (the package id),
     * rather than one stream per session.
     */
    this._downloadProgressInterest = /* @__PURE__ */ new Map();
    /** Subscriptions to provider progress events; cleared when providers change. */
    this._providerSubscriptions = this._register(new DisposableStore());
    /**
     * Per-session tail of in-flight persisted peer-chat catalog writes, keyed by
     * session URI string. Read-modify-write updates to the {@link
     * PEER_CHATS_METADATA_KEY} blob are chained per session so a `createChat`,
     * `disposeChat`, and `onDidChangeChatData` racing for the same
     * session can't clobber each other's edits.
     */
    this._peerChatCatalogWrites = /* @__PURE__ */ new Map();
    /** Observable registered agents, drives `root/agentsChanged` via {@link AgentSideEffects}. */
    this._agents = observableValue("agents", []);
    /** Successful list-time repository-root resolutions; eviction only causes safe re-resolution. */
    this._normalizedWorktreeRepositoryRoots = new LRUCache(100);
    this._skillCompletionProviderRegistered = false;
    /**
     * Authoritative server-side per-resource subscription refcount, keyed by
     * resource URI string and valued by the set of subscribed protocol
     * client IDs. Populated by {@link subscribe} (or {@link addSubscriber}
     * for handshake fast-paths) and drained by {@link unsubscribe}. When a
     * resource's set becomes empty, the resource is dropped from the map and
     * {@link _maybeEvictIdleSession} is invoked to release any cached state
     * for it.
     */
    this._resourceSubscribers = new ResourceMap();
    this._restoreSessionInFlight = /* @__PURE__ */ new Map();
    this._restoreSubagentInFlight = /* @__PURE__ */ new Map();
    /** Subagent chats armed for a bounded wait (once execution is confirmed); resolved by {@link _onChatSpawned}, awaited by {@link subscribe}. */
    this._pendingSubagentChats = /* @__PURE__ */ new Map();
    this._pendingSubagentChatTimeouts = this._register(new DisposableMap());
    /** Subagent chats announced via `_meta.subagentChatUri` but still awaiting confirmation, keyed by `${channel}:${toolCallId}`. */
    this._pendingSubagentToolCalls = /* @__PURE__ */ new Map();
    /**
     * Pending {@link _runSessionGc} timers, keyed by session URI. A timer is
     * armed when a session loses its last subscriber while still empty (no
     * turns, no active turn) — see {@link _maybeScheduleSessionGc}. Cleared
     * whenever any client subscribes again or the timer fires.
     */
    this._pendingSessionGc = this._register(new DisposableResourceMap());
    /**
     * Pending {@link _maybeEvictIdleSession} timers, keyed by session URI. A
     * timer is armed when an idle session (with turns) loses its last subscriber
     * — see {@link unsubscribe}. Cleared when any client subscribes again
     * ({@link addSubscriber}) or the timer fires. Deferring the release avoids
     * churning the provider SDK session on rapid disconnect/reconnect cycles.
     */
    this._pendingSessionRelease = this._register(new DisposableResourceMap());
    /**
     * Active resource watches keyed by the channel URI string
     * (`ahp-resource-watch:/<encoded>`).
     *
     * Each entry owns the {@link IFileService} watcher together with the
     * decoded descriptor, the subscriber refcount, and the optional
     * grace-window dispose timer. The watch URI itself is fully
     * self-describing — {@link createResourceWatch} just encodes the
     * caller's params into the URI and returns it. State only exists
     * here once at least one client has subscribed.
     *
     * Lifecycle:
     * - First subscriber to a channel: {@link onResourceWatchSubscribed}
     *   parses the URI, creates the {@link IFileService} watcher, and
     *   installs the entry with `subscribers = 1`.
     * - Subsequent subscribers bump the refcount and cancel any pending
     *   grace-window dispose timer.
     * - {@link onResourceWatchUnsubscribed} drops the refcount; when it
     *   reaches zero we arm a {@link RESOURCE_WATCH_GRACE_MS} dispose
     *   timer rather than tearing down immediately, giving disconnected
     *   clients time to reconnect.
     */
    this._resourceWatches = this._register(new DisposableMap());
    /**
     * Per-client sequencer that serialises action dispatches whose
     * processing requires an asynchronous prelude (e.g. snapshotting
     * user-message attachments into the session database before the
     * action is reduced into state). Actions that don't need any
     * asynchronous prelude bypass the queue entirely as long as no
     * earlier action from the same client is still pending.
     *
     * todo@connor4312: we can drop this when sending a message become a command
     */
    this._clientDispatchQueues = /* @__PURE__ */ new Map();
    this._logService.info("AgentService initialized");
    this._authService = new AgentHostAuthenticationService(_logService);
    this._stateManager = this._register(new AgentHostStateManager(_logService, {
      hostBuildInfo: hostBuildInfoFromProduct(this._productService),
      changesetStateRetention: {
        // The cache calls this lazily after construction. If a future state-manager
        // initialization path registers changesets before `_changesets` is assigned,
        // keep the entry pinned rather than evicting with incomplete liveness data.
        canEvict: (changeset) => this._changesets ? this._isChangesetEvictable(changeset) : false
      }
    }));
    this._register(this._stateManager.onDidEmitEnvelope((e) => this._onDidAction.fire(e)));
    this._register(this._stateManager.onDidEmitEnvelope((e) => this._trackPendingSubagentChatFromEnvelope(e)));
    this._register(this._stateManager.onDidEmitNotification((e) => this._onDidNotification.fire(e)));
    const configurationService = this._register(new AgentConfigurationService(this._stateManager, this._logService, this._rootConfigResource, providerConfigurations));
    this._configurationService = configurationService;
    const fileMonitorService = _fileMonitorService ?? this._register(new AgentHostFileMonitorService(this._fileService, this._logService));
    updateAgentHostTelemetryLevelFromConfig(this._telemetryService, this._stateManager.rootState.config?.values);
    const services = new ServiceCollection(
      [ILogService, this._logService],
      [IAgentService, this],
      [IProductService, this._productService],
      [IAgentConfigurationService, configurationService],
      [IAgentHostStateManager, this._stateManager],
      [IAgentHostFileMonitorService, fileMonitorService],
      [IAgentHostGitService, this._gitService],
      [ITelemetryService, this._telemetryService],
      // The outer agent-host process DI registers `ISessionDataService`,
      // but this nested strict `InstantiationService` does not inherit it.
      // Add it explicitly so `@ISessionDataService` injection into the
      // changeset service (and any future sibling) resolves correctly.
      [ISessionDataService, this._sessionDataService]
    );
    const instantiationService = this._register(new InstantiationService(
      services,
      /*strict*/
      true
    ));
    this._gitHubEndpointService = this._register(instantiationService.createInstance(AgentHostGitHubEndpointService));
    services.set(IAgentHostGitHubEndpointService, this._gitHubEndpointService);
    this._register(this._gitHubEndpointService.onDidChange(() => {
      this._stateManager.emitAuthRequired({
        resource: this._gitHubEndpointService.getCopilotResource().resource,
        reason: AuthRequiredReason.Required
      });
    }));
    const agentHostOctoKitService = instantiationService.createInstance(AgentHostOctoKitService, fetchFn);
    services.set(IAgentHostOctoKitService, agentHostOctoKitService);
    const effectiveCopilotApiService = copilotApiService ?? instantiationService.createInstance(CopilotApiService, fetchFn);
    services.set(ICopilotApiService, effectiveCopilotApiService);
    this._gitStateService = this._register(instantiationService.createInstance(AgentHostGitStateService));
    services.set(IAgentHostGitStateService, this._gitStateService);
    this._checkpointService = this._register(instantiationService.createInstance(AgentHostCheckpointService));
    services.set(IAgentHostCheckpointService, this._checkpointService);
    this._changesetSubscriptions = instantiationService.createInstance(AgentHostChangesetSubscriptionService);
    services.set(IAgentHostChangesetSubscriptionService, this._changesetSubscriptions);
    this._changesetOperationService = this._register(instantiationService.createInstance(AgentHostChangesetOperationService));
    services.set(IAgentHostChangesetOperationService, this._changesetOperationService);
    this._reviewService = this._register(instantiationService.createInstance(AgentHostReviewService));
    services.set(IAgentHostReviewService, this._reviewService);
    this._changesets = this._register(instantiationService.createInstance(AgentHostChangesetService));
    services.set(IAgentHostChangesetService, this._changesets);
    this._changesetCoordinator = this._register(instantiationService.createInstance(AgentHostChangesetCoordinator));
    this._register(this._stateManager.onDidChangeSessionActiveTurn((e) => this._changesetCoordinator.onSessionTurnActiveChanged(e.session, e.active)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution)));
    this._completions = this._register(instantiationService.createInstance(AgentHostCompletions));
    const workspaceFiles = this._register(instantiationService.createInstance(AgentHostWorkspaceFiles));
    this._register(this._completions.registerProvider(
      new AgentHostFileCompletionProvider(this._stateManager, workspaceFiles)
    ));
    this._register(this._completions.registerProvider(
      new AgentHostChatCompletionProvider(this._stateManager)
    ));
    this._register(this._completions.registerProvider(
      new AgentHostRenameCompletionProvider(
        (session) => (this._stateManager.getSessionState(session)?.turns.length ?? 0) > 0
      )
    ));
    this._terminalManager = this._register(instantiationService.createInstance(AgentHostTerminalManager));
    services.set(IAgentHostTerminalManager, this._terminalManager);
    this._localTurns = new AgentHostLocalTurns(this._sessionDataService, this._logService);
    this._sideEffects = this._register(instantiationService.createInstance(AgentSideEffects, this._stateManager, {
      getAgent: (session) => this._findProviderForSession(session),
      sessionDataService: this._sessionDataService,
      localTurns: this._localTurns,
      agents: this._agents,
      copilotApiService: effectiveCopilotApiService,
      getGitHubCopilotToken: () => {
        return this.getAuthToken({
          resource: this._gitHubEndpointService.getCopilotResource().resource,
          scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported
        });
      },
      resolveWorkingDirectoryBeforeSend: (params) => this._resolveWorkingDirectoryBeforeSend(params),
      resolveChatAttachmentTurns: (resource) => this._resolveChatAttachmentTurns(resource),
      onTurnComplete: (session) => {
        const workingDirStr = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
        void this._gitStateService.attachSessionGitHubPullRequest(session, workingDirStr ? URI.parse(workingDirStr) : void 0);
      },
      onUserMessage: (session, text) => {
        void this._gitStateService.attachSessionGitHubIssues(session.toString(), text);
      }
    }));
    this._serverToolHost = new AgentServerToolHost(this._stateManager, buildServerToolGroups(this._createSessionServerToolAccessor()));
  }
  /** Exposes the state manager for co-hosting a WebSocket protocol server. */
  get stateManager() {
    return this._stateManager;
  }
  /** Exposes the configuration service so agent providers can share root config plumbing. */
  get configurationService() {
    return this._configurationService;
  }
  /** Exposes the GitHub endpoint service so agent providers share GitHub (Enterprise) resource resolution. */
  get gitHubEndpointService() {
    return this._gitHubEndpointService;
  }
  /** Exposes the checkpoint service so agent providers can capture session baselines. */
  get checkpointService() {
    return this._checkpointService;
  }
  /** Exposes the terminal manager for use by agent providers. */
  get terminalManager() {
    return this._terminalManager;
  }
  /** Exposes the completions service for use by agent providers (e.g. to register agent-scoped completion item providers). */
  get completionsService() {
    return this._completions;
  }
  /**
   * Trigger characters announced to clients via `InitializeResult.completionTriggerCharacters`.
   * Aggregated from all registered {@link IAgentHostCompletionItemProvider}s.
   */
  get completionTriggerCharacters() {
    return this._completions.triggerCharacters;
  }
  /**
   * The registered providers. Exposed so process-lifetime background jobs
   * (notably {@link AgentModelRefreshScheduler}) can observe registrations
   * without this service owning an ambient recurring timer of its own.
   */
  get agents() {
    return this._agents;
  }
  // ---- provider registration ----------------------------------------------
  /**
   * Injects the host-owned {@link WorktreeIsolation} controller and forwards it
   * to the collaborators that consult it. Called once at startup (from
   * agentHostMain / agentHostServerMain) after the branch-name generator has
   * been wired.
   */
  setWorktreeIsolation(worktree) {
    this._worktree = worktree;
    this._configurationService.setWorktreeIsolation(worktree);
    this._sideEffects.setWorktreeIsolation(worktree);
  }
  _toProviderConfig(request) {
    if (!this._worktree || !request.config) {
      return request;
    }
    return { ...request, config: omitHostOwnedSessionConfig(request.config) };
  }
  /**
   * Host-owned first-send hook (invoked by {@link AgentSideEffects} before the
   * agent locks its subprocess cwd). Resolves the working directories the session
   * will actually run in and hands them to the agent at send time:
   *  - index 0 is the process root: for `worktree` isolation the isolated
   *    worktree (created here on the first send, see
   *    {@link _resolveWorktreeBeforeSend}); for `folder` isolation the picked
   *    folder; `undefined` (whole result) for workspace-less sessions.
   *  - the tail carries any additional session roots as-is (only index 0 is
   *    worktree-remapped; additional roots are passed through unchanged).
   */
  async _resolveWorkingDirectoryBeforeSend(params) {
    const sessionId = AgentSession.id(params.session);
    const pickedFolders = this._configurationService.getEffectiveWorkingDirectories(params.session);
    const pickedFolderUri = pickedFolders?.[0] ? URI.parse(pickedFolders[0]) : void 0;
    const tail = (pickedFolders ?? []).slice(1).map((d) => URI.parse(d));
    if (!this._worktree?.isWorkingDirectoryPending(sessionId)) {
      if (!pickedFolderUri) {
        return void 0;
      }
      const resolved2 = await this._configurationService.resolveWorkingDirectoryForResume(params.session, pickedFolderUri);
      return [resolved2, ...tail];
    }
    const resolved = await this._resolveWorktreeBeforeSend({ ...params, sessionId, pickedFolderUri }) ?? pickedFolderUri;
    return resolved ? [resolved, ...tail] : void 0;
  }
  async _resolveChatAttachmentTurns(resource) {
    const readTurns = () => {
      const state = this._stateManager.getChatState(resource) ?? this._stateManager.getDefaultChatState(resource);
      return state?.turns;
    };
    const existing = readTurns();
    if (existing) {
      return existing;
    }
    const sessionUri = URI.parse(isAhpChatChannel(resource) ? parseRequiredSessionUriFromChatUri(resource) : resource);
    if (!this._stateManager.getSessionState(sessionUri.toString())) {
      await this.restoreSession(sessionUri);
    } else {
      const provider = this._findProviderForSession(sessionUri);
      if (provider) {
        await this._restorePeerChats(provider, sessionUri);
      }
    }
    return readTurns() ?? [];
  }
  /**
   * Creates the session's isolated worktree on the first send (deferred so the
   * user's prompt can name the branch), reports creation progress as the chat's
   * activity, surfaces the "Created isolated worktree" announcement as the first
   * markdown response part of the turn, and returns the created worktree URI.
   * Idempotent; safe to call once the worktree exists. Returns `undefined` when
   * worktree creation failed. Only invoked for sessions whose worktree is still
   * pending (see {@link _resolveWorkingDirectoryBeforeSend}).
   */
  async _resolveWorktreeBeforeSend(params) {
    const { sessionId, pickedFolderUri } = params;
    const worktree = this._worktree;
    if (!worktree) {
      return void 0;
    }
    let reportedActivity = false;
    try {
      await worktree.resolveOnFirstSend({
        sessionUri: URI.parse(params.session),
        sessionId,
        workingDirectory: pickedFolderUri,
        config: this._configurationService.getSessionConfigValues(params.session),
        prompt: params.prompt,
        githubToken: this.getAuthToken({
          resource: this._gitHubEndpointService.getCopilotResource().resource,
          scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported
        }),
        onProgress: (activity) => {
          reportedActivity = true;
          this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity });
        }
      });
    } catch (err) {
      this._logService.warn(`[AgentService] worktree resolution failed for ${params.session}: ${toErrorMessage(err)}`);
    }
    if (reportedActivity) {
      this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity: void 0 });
    }
    const announcement = worktree.takePendingAnnouncement(sessionId);
    if (announcement !== void 0) {
      this._stateManager.dispatchServerAction(params.chat, {
        type: ActionType.ChatResponsePart,
        turnId: params.turnId,
        part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement }
      });
    }
    return worktree.getResolvedWorktree(sessionId);
  }
  registerProvider(provider) {
    if (this._providers.has(provider.id)) {
      throw new Error(`Agent provider already registered: ${provider.id}`);
    }
    this._logService.info(`Registering agent provider: ${provider.id}`);
    this._providers.set(provider.id, provider);
    provider.setServerToolHost?.(this._serverToolHost);
    this._providerSubscriptions.add(provider.onDidSessionProgress((signal) => this._sequenceSpawnedChat(signal)));
    this._providerSubscriptions.add(this._sideEffects.registerProgressListener(provider));
    if (provider.onDidMaterializeSession) {
      this._providerSubscriptions.add(provider.onDidMaterializeSession((e) => this._onDidMaterializeSession(e)));
    }
    if (provider.onMcpNotification) {
      this._providerSubscriptions.add(provider.onMcpNotification((e) => this._onMcpNotification.fire(e)));
    }
    if (provider.onDidChangeChatData) {
      this._providerSubscriptions.add(provider.onDidChangeChatData((e) => this._onChatDataChanged(e)));
    }
    if (provider.onDidSpawnChat) {
      this._providerSubscriptions.add(provider.onDidSpawnChat((e) => this._onChatSpawned(e)));
    }
    this._registerSkillCompletionProvider();
    if (!this._defaultProvider) {
      this._defaultProvider = provider.id;
    }
    this._updateAgents();
  }
  _registerSkillCompletionProvider() {
    if (this._skillCompletionProviderRegistered) {
      return;
    }
    this._skillCompletionProviderRegistered = true;
    const provider = this._register(new AgentHostSkillCompletionProvider(
      (session) => this._findProviderForSession(session)
    ));
    this._register(this._completions.registerProvider(provider));
  }
  // ---- auth ---------------------------------------------------------------
  async authenticate(params) {
    return this._authService.authenticate(params, this._providers.values());
  }
  getAuthToken(request) {
    return this._authService.getAuthToken(request);
  }
  // ---- Changeset operation handlers --------------------------------------
  async invokeChangesetOperation(params) {
    return this._changesetOperationService.invokeChangesetOperation(params);
  }
  // ---- MCP `mcp://` channel routing --------------------------------------
  async handleMcpRequest(channel, method, params) {
    const route = parseMcpChannelUri(channel);
    if (!route) {
      throw new Error(`Method not found: invalid mcp:// channel ${channel}`);
    }
    const provider = this._providers.get(route.providerId);
    if (!provider || !provider.handleMcpRequest) {
      throw new Error(`Method not found: no provider for mcp:// channel ${channel}`);
    }
    const sessionUri = AgentSession.uri(route.providerId, route.sessionId);
    return provider.handleMcpRequest(sessionUri, route.serverName, method, params);
  }
  // ---- session management -------------------------------------------------
  /**
   * Builds the dependency surface the session server-tool group needs, bound
   * to this service so the group stays decoupled from the concrete host.
   */
  _createSessionServerToolAccessor() {
    return {
      listSessions: () => this.listSessions(),
      createSession: (config) => this.createSession(config),
      getModels: () => {
        const models = [];
        for (const provider of this._providers.values()) {
          models.push(...provider.models.get());
        }
        return models;
      },
      startPrompt: (session, chat, prompt) => this._startSessionPrompt(session, chat, prompt),
      createChat: (session, chat, options) => this.createChat(session, chat, options?.title !== void 0 || options?.model !== void 0 ? { ...options.title !== void 0 ? { title: options.title } : {}, ...options.model !== void 0 ? { model: { id: options.model.id } } : {} } : void 0),
      deleteSession: (session) => this.disposeSession(session),
      getChatContext: (session, chatId) => this._getChatContext(session, chatId),
      // Reads the `create_session` spawn depth from a session's `_meta` (0 when absent).
      getSessionSpawnDepth: (session) => readSessionSpawnDepth(this._stateManager.getSessionSummary(session.toString())?._meta),
      // Stamps a session's `create_session` spawn depth into its `_meta` (merging existing keys).
      setSessionSpawnDepth: (session, depth) => this._stateManager.dispatchServerAction(session.toString(), {
        type: ActionType.SessionMetaChanged,
        _meta: withSessionSpawnDepth(this._stateManager.getSessionSummary(session.toString())?._meta, depth)
      })
    };
  }
  /**
   * Starts the first turn on a freshly-created session by dispatching a
   * `ChatTurnStarted` and routing it through the same side-effects path a
   * client-initiated turn takes (which sends the message to the provider).
   */
  async _startSessionPrompt(session, chat, prompt) {
    const message = { text: prompt, origin: { kind: MessageKind.User } };
    const action = { type: ActionType.ChatTurnStarted, turnId: generateUuid(), startedAt: (/* @__PURE__ */ new Date()).toISOString(), message };
    this._stateManager.dispatchServerAction(chat.toString(), action);
    this._sideEffects.handleAction(chat.toString(), action);
  }
  /**
   * Reads a point-in-time snapshot of a session's chat conversation for the
   * `get_session_context` server tool. Targets the session's default chat, or a
   * specific peer chat when `chatId` is provided. Returns `undefined` when no
   * live conversation state exists (e.g. a cold/unsubscribed session).
   */
  _getChatContext(session, chatId) {
    const chatState = chatId ? this._stateManager.getChatState(buildChatUri(session.toString(), chatId)) : this._stateManager.getDefaultChatState(session.toString());
    if (!chatState) {
      return void 0;
    }
    return {
      turns: chatState.turns,
      ...chatState.activeTurn ? { activeTurn: { message: chatState.activeTurn.message, responseParts: chatState.activeTurn.responseParts } } : {},
      hasMoreHistory: !!chatState.turnsNextCursor
    };
  }
  /**
   * Repairs repository roots written by older builds that treated a parent linked checkout as the repository.
   * Listing performs this migration because archived sessions may never resume through WorktreeIsolation's metadata reader.
   */
  async _normalizeListedWorktreeRepositoryRoot(session, database, repositoryRootRaw) {
    const storedRepositoryRootRaw = repositoryRootRaw;
    const persistedRoot = URI.parse(repositoryRootRaw);
    const sessionStr = session.session.toString();
    let primaryRoot = this._normalizedWorktreeRepositoryRoots.get(sessionStr);
    if (!primaryRoot) {
      const workingDirectory = session.workingDirectories?.[0];
      const checkoutRoot = workingDirectory && await this._fileExistsSafe(workingDirectory) ? workingDirectory : persistedRoot;
      try {
        primaryRoot = await tryResolvePrimaryWorktreeRoot(this._gitService, checkoutRoot) ?? (checkoutRoot.toString() !== persistedRoot.toString() ? await tryResolvePrimaryWorktreeRoot(this._gitService, persistedRoot) : void 0);
        if (primaryRoot) {
          this._normalizedWorktreeRepositoryRoots.set(sessionStr, primaryRoot);
        }
      } catch (error) {
        this._logService.warn(`[AgentService][listSessions] Failed to resolve primary worktree for ${session.session}`, error);
      }
    }
    if (primaryRoot) {
      repositoryRootRaw = primaryRoot.toString();
    }
    if (repositoryRootRaw !== storedRepositoryRootRaw) {
      try {
        await database.setMetadata(WORKTREE_META_REPOSITORY_ROOT, repositoryRootRaw);
      } catch (error) {
        this._logService.warn(`[AgentService][listSessions] Failed to normalize worktree repository metadata for ${session.session}`, error);
      }
    }
    return repositoryRootRaw;
  }
  async listSessions() {
    this._logService.trace("[AgentService] listSessions called");
    const results = await Promise.all(
      [...this._providers.values()].map((p) => p.listSessions())
    );
    const flat = results.flat();
    const overlaid = await Promise.all(flat.map(async (s) => {
      try {
        const ref = await this._sessionDataService.tryOpenDatabase(s.session);
        if (!ref) {
          return s;
        }
        try {
          const sessionStr = s.session.toString();
          const changesetKeys = this._changesetCoordinator.getListMetadataKeys(sessionStr);
          const metadataKeys = changesetKeys ? { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [PEER_CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS, ...changesetKeys } : { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [PEER_CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS };
          const m = await ref.object.getMetadataObject(metadataKeys);
          if (m[PEER_CHAT_BACKING_METADATA_KEY]) {
            return void 0;
          }
          let updated = s;
          if (m.customTitle) {
            updated = { ...updated, summary: m.customTitle };
          }
          if (m[AH_META_IS_READ_DB_KEY] !== void 0) {
            updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsRead, m[AH_META_IS_READ_DB_KEY] === "true") };
          }
          const persistedArchived = m[AH_META_IS_ARCHIVED_DB_KEY] ?? m[AH_META_IS_DONE_DB_KEY];
          if (persistedArchived !== void 0) {
            updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsArchived, persistedArchived === "true") };
          }
          if (m[META_GIT_STATE]) {
            try {
              const gitState = JSON.parse(m[META_GIT_STATE]);
              updated = { ...updated, _meta: withSessionGitState(updated._meta, gitState) };
            } catch (e) {
              this._logService.warn(`[AgentService][listSessions] Failed to parse Git state for ${s.session}`, e);
            }
          }
          if (m[META_GITHUB_STATE]) {
            try {
              const gitHubState = JSON.parse(m[META_GITHUB_STATE]);
              updated = { ...updated, _meta: withSessionGitHubState(updated._meta, gitHubState) };
            } catch (e) {
              this._logService.warn(`[AgentService][listSessions] Failed to parse GitHub state for ${s.session}`, e);
            }
          }
          if (m[AH_META_WORKSPACELESS_DB_KEY] !== void 0) {
            updated = { ...updated, _meta: withSessionWorkspaceless(updated._meta, m[AH_META_WORKSPACELESS_DB_KEY] === "true") };
          }
          let repositoryRootRaw = m[WORKTREE_META_REPOSITORY_ROOT];
          if (repositoryRootRaw) {
            repositoryRootRaw = await this._normalizeListedWorktreeRepositoryRoot(updated, ref.object, repositoryRootRaw);
          }
          const worktreeProject = worktreeProjectFromRepositoryRoot(repositoryRootRaw);
          if (worktreeProject) {
            updated = { ...updated, project: worktreeProject };
          }
          return this._changesetCoordinator.decorateListEntry(updated, m);
        } finally {
          ref.dispose();
        }
      } catch (e) {
        this._logService.warn(`[AgentService] Failed to read session metadata overlay for ${s.session}`, e);
      }
      return s;
    }));
    const result = overlaid.filter((s) => s !== void 0);
    const withStatus = result.map((s) => {
      const liveSummary = this._stateManager.getSessionSummary(s.session.toString());
      if (liveSummary) {
        const _meta = liveSummary._meta !== void 0 || s._meta !== void 0 ? { ...s._meta, ...liveSummary._meta } : void 0;
        const liveWorkingDirs = liveSummary.workingDirectories;
        return {
          ...s,
          summary: liveSummary.title || s.summary,
          // Supersedes the flags folded in above: the state manager seeded
          // them from the same database on restore and has applied every
          // mutation since.
          status: liveSummary.status,
          activity: liveSummary.activity,
          modifiedTime: Date.parse(liveSummary.modifiedAt),
          project: liveSummary.project ? { uri: URI.parse(liveSummary.project.uri), displayName: liveSummary.project.displayName } : s.project,
          workingDirectories: liveWorkingDirs !== void 0 ? liveWorkingDirs.map((d) => URI.parse(d)) : s.workingDirectories,
          changes: liveSummary.changes ?? s.changes,
          changesets: this._stateManager.getSessionState(s.session.toString())?.changesets ?? s.changesets,
          ..._meta !== void 0 ? { _meta } : {}
        };
      }
      return s;
    });
    const known = new Set(withStatus.map((s) => s.session.toString()));
    const additions = [];
    for (const summary of this._stateManager.getOverlaySessionSummaries()) {
      if (known.has(summary.resource)) {
        continue;
      }
      if (isSubagentSession(summary.resource)) {
        continue;
      }
      const summaryWorkingDirs = summary.workingDirectories;
      additions.push({
        session: URI.parse(summary.resource),
        startTime: Date.parse(summary.createdAt),
        modifiedTime: Date.parse(summary.modifiedAt),
        summary: summary.title,
        status: summary.status,
        activity: summary.activity,
        workingDirectories: summaryWorkingDirs?.map((d) => URI.parse(d)),
        ...summary.project ? { project: { uri: URI.parse(summary.project.uri), displayName: summary.project.displayName } } : {},
        changes: summary.changes,
        // This overlay path never opens the session database (unlike the
        // provider-returned sessions handled above), so carry the
        // in-memory `summary._meta` directly. It holds the live state
        // (e.g. the GitHub state published when a PR is created), so a
        // freshly-created session that the provider transiently omits
        // still reports it here.
        ...summary._meta !== void 0 ? { _meta: summary._meta } : {}
      });
    }
    const combined = additions.length > 0 ? [...withStatus, ...additions] : withStatus;
    this._logService.trace(`[AgentService] listSessions returned ${combined.length} sessions (${additions.length} state-manager fallback)`);
    return combined;
  }
  async createSession(config) {
    const providerId = config?.provider ?? this._defaultProvider;
    const provider = providerId ? this._providers.get(providerId) : void 0;
    if (!provider) {
      throw new Error(`No agent provider registered for: ${providerId ?? "(none)"}`);
    }
    if (config?.workingDirectories && config.workingDirectories.length > 1) {
      const supportsMultiple = !!provider.getDescriptor().capabilities?.multipleWorkingDirectories;
      if (!supportsMultiple) {
        this._logService.warn(`[AgentService] Provider '${providerId}' does not advertise multipleWorkingDirectories; truncating ${config.workingDirectories.length} working directories to 1.`);
        config = { ...config, workingDirectories: [config.workingDirectories[0]] };
      }
    }
    if (config?.fork) {
      const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
      const sourceTurns = sourceState?.turns.slice(0, config.fork.turnIndex + 1) ?? [];
      if (sourceTurns.length === 0) {
        config = { ...config, fork: void 0 };
      } else {
        const turnIdMapping = /* @__PURE__ */ new Map();
        for (const t of sourceTurns) {
          turnIdMapping.set(t.id, generateUuid());
        }
        const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(buildDefaultChatUri(config.fork.session).toString(), config.fork.turnId);
        config = {
          ...config,
          fork: { ...config.fork, turnIdMapping, ...concreteForkTurnId !== void 0 ? { turnId: concreteForkTurnId } : {} }
        };
      }
    }
    if (config?.importConversation) {
      const importedTurns = config.importConversation.turns.map((t) => ({ ...t, id: generateUuid() }));
      config = { ...config, importConversation: { ...config.importConversation, turns: importedTurns } };
    }
    const initializeSideEffects = this._sideEffects.initialize();
    const sessionConfig = await this._resolveCreatedSessionConfig(provider, config);
    const deferWorktreeCreation = sessionConfig?.values?.[SessionConfigKey.Isolation] === "worktree" && !config?.fork && !config?.importConversation;
    this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
    const [, created] = await Promise.all([
      initializeSideEffects,
      this._createProviderSession(provider, config, deferWorktreeCreation)
    ]);
    const session = created.session;
    this._logService.trace(`[AgentService] createSession: initialization complete`);
    this._cancelPendingSessionGc(session);
    this._cancelPendingSessionRelease(session);
    this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model?.id ?? "(default)"}`);
    this._sessionToProvider.set(session.toString(), provider.id);
    if (config?.progressToken) {
      let sessions = this._downloadProgressInterest.get(provider.id);
      if (!sessions) {
        sessions = /* @__PURE__ */ new Set();
        this._downloadProgressInterest.set(provider.id, sessions);
      }
      sessions.add(session.toString());
    }
    this._logService.trace(`[AgentService] createSession returned: ${session.toString()}`);
    const initialCustomizations = await (provider.getSessionCustomizations ? provider.getSessionCustomizations(session).catch((err) => {
      this._logService.error("[AgentService] createSession: failed to resolve initial customizations", err);
      return void 0;
    }) : Promise.resolve(void 0));
    if (config?.fork) {
      const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
      const sourceChatUri = buildDefaultChatUri(config.fork.session).toString();
      const newChatUri = buildDefaultChatUri(session).toString();
      let sourceTurns = [];
      if (sourceState && config.fork.turnIdMapping) {
        const originalSlice = sourceState.turns.slice(0, config.fork.turnIndex + 1);
        const mapping = config.fork.turnIdMapping;
        sourceTurns = originalSlice.map((t) => ({ ...t, id: mapping.get(t.id) ?? generateUuid() }));
        this._persistForkedLocalTurns(session.toString(), sourceChatUri, newChatUri, originalSlice, sourceTurns, mapping);
      }
      const forkedTitlePrefix = localize("agentHost.forkedTitlePrefix", "Forked: ");
      const sourceTitle = sourceState?.title;
      const forkedTitle = sourceTitle ? sourceTitle.startsWith(forkedTitlePrefix) ? sourceTitle : `${forkedTitlePrefix}${sourceTitle}` : localize("agentHost.forkedSessionFallback", "Forked Session");
      const summary = this._buildInitialSummary(provider, session, config, created, forkedTitle);
      const state = this._stateManager.createSession(summary);
      state.config = sessionConfig;
      this._stateManager.seedDefaultChatTurns(summary.resource, sourceTurns);
      state.activeClients = config.activeClient ? [config.activeClient] : [];
      if (initialCustomizations && initialCustomizations.length > 0) {
        state.customizations = [...initialCustomizations];
      }
      if (sourceTurns.length > 0) {
        this._sideEffects.generateForkedTitle(summary.resource, void 0, sourceTurns, forkedTitle, sourceTitle);
      }
    } else if (config?.importConversation) {
      const importedTurns = [...config.importConversation.turns];
      const importedTitle = this._buildImportedTitle(importedTurns);
      const summary = this._buildInitialSummary(provider, session, config, created, importedTitle);
      const state = this._stateManager.createSession(summary);
      state.config = sessionConfig;
      this._stateManager.seedDefaultChatTurns(summary.resource, importedTurns);
      state.activeClients = config.activeClient ? [config.activeClient] : [];
      if (initialCustomizations && initialCustomizations.length > 0) {
        state.customizations = [...initialCustomizations];
      }
      if (importedTurns.length > 0) {
        this._sideEffects.generateForkedTitle(summary.resource, void 0, importedTurns, importedTitle);
      }
    } else {
      const summary = this._buildInitialSummary(provider, session, config, created, "");
      const state = this._stateManager.createSession(summary, { emitNotification: !created.provisional });
      state.config = sessionConfig;
      state.activeClients = config?.activeClient ? [config.activeClient] : [];
      if (initialCustomizations && initialCustomizations.length > 0) {
        state.customizations = [...initialCustomizations];
      }
    }
    if (sessionConfig?.values && Object.keys(sessionConfig.values).length > 0 && !created.provisional) {
      this._persistConfigValues(session, sessionConfig.values);
    }
    this._changesetCoordinator.onSessionCreated(session.toString());
    if (!created.provisional) {
      this._persistWorkspaceless(session, readSessionWorkspaceless(this._stateManager.getSessionSummary(session.toString())?._meta));
      this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
    }
    const workingDirectory = created.resolvedWorkingDirectory ?? config?.workingDirectories?.[0];
    void this._gitStateService.refreshSessionGitState(session.toString(), workingDirectory);
    return session;
  }
  async createChat(session, chat, options) {
    const sessionKey = session.toString();
    const provider = this._findProviderForSession(session);
    if (!provider) {
      throw new Error(`[AgentService] createChat: no provider for session ${sessionKey}`);
    }
    if (!this._supportsChats(provider)) {
      throw new Error(`[AgentService] createChat: provider ${provider.id} does not support multiple chats`);
    }
    let forkedTurns;
    let forkedTitle;
    let forkedSourceTitle;
    let createOptions = options;
    let sideChatOrigin;
    if (options?.sideChat) {
      const resolvedSideChat = this._resolveSideChatOrigin(session, options.sideChat);
      sideChatOrigin = resolvedSideChat.origin;
      createOptions = {
        ...options,
        sideChat: {
          ...options.sideChat,
          source: URI.parse(resolvedSideChat.sourceChat),
          ...resolvedSideChat.providerAnchorTurnId ? { providerAnchorTurnId: resolvedSideChat.providerAnchorTurnId } : {},
          ...resolvedSideChat.sourceContext ? { sourceContext: resolvedSideChat.sourceContext } : {},
          ...resolvedSideChat.partialResponse ? { partialResponse: resolvedSideChat.partialResponse } : {}
        }
      };
    }
    if (options?.fork) {
      const sourceKey = options.fork.source.toString();
      const peerState = this._stateManager.getChatState(sourceKey);
      const sourceState = peerState ?? this._stateManager.getDefaultChatState(sourceKey);
      const sourceChatUri = peerState ? sourceKey : buildDefaultChatUri(sourceKey);
      const sourceTurns = sourceState?.turns ?? [];
      const forkIndex = sourceTurns.findIndex((t) => t.id === options.fork.turnId);
      if (forkIndex < 0) {
        createOptions = { ...options, fork: void 0 };
      } else {
        const slice = sourceTurns.slice(0, forkIndex + 1);
        const turnIdMapping = /* @__PURE__ */ new Map();
        for (const t of slice) {
          turnIdMapping.set(t.id, generateUuid());
        }
        forkedTurns = slice.map((t) => ({ ...t, id: turnIdMapping.get(t.id) ?? generateUuid() }));
        this._persistForkedLocalTurns(sessionKey, sourceChatUri, chat.toString(), slice, forkedTurns, turnIdMapping);
        const forkedTitlePrefix = localize("agentHost.forkedTitlePrefix", "Forked: ");
        forkedSourceTitle = sourceState?.title || this._stateManager.getSessionState(sessionKey)?.title;
        forkedTitle = forkedSourceTitle ? forkedSourceTitle.startsWith(forkedTitlePrefix) ? forkedSourceTitle : `${forkedTitlePrefix}${forkedSourceTitle}` : localize("agentHost.forkedChatFallback", "Forked Chat");
        const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(sourceChatUri, options.fork.turnId);
        createOptions = { ...options, fork: { ...options.fork, turnIdMapping, ...concreteForkTurnId !== void 0 ? { turnId: concreteForkTurnId } : {} } };
      }
    }
    const createResult = await this._createChat(provider, chat, createOptions);
    const providerData = createResult?.providerData;
    this._stateManager.addChat(sessionKey, chat.toString(), {
      ...forkedTitle !== void 0 ? { title: forkedTitle } : options?.title !== void 0 ? { title: options.title } : {},
      ...forkedTurns !== void 0 ? { turns: forkedTurns } : {},
      ...providerData !== void 0 ? { providerData } : {},
      ...sideChatOrigin !== void 0 ? { origin: sideChatOrigin } : {}
    });
    void this._persistPeerChat(session, chat, providerData, sideChatOrigin);
    if (createResult?.backingSession) {
      this._markPeerChatBacking(createResult.backingSession, chat);
    }
    if (forkedTurns && forkedTurns.length > 0 && forkedTitle !== void 0) {
      this._sideEffects.generateForkedTitle(sessionKey, chat.toString(), forkedTurns, forkedTitle, forkedSourceTitle);
    }
  }
  /**
   * Validates a side chat's source and returns its {@link ChatOriginKind.SideChat}
   * origin. Throws when the source chat is not part of `session` or when the
   * referenced completed or active turn is absent.
   */
  _resolveSideChatOrigin(session, sideChat) {
    const sessionKey = session.toString();
    const sourceKey = sideChat.source.toString();
    const { sourceChatKey, sourceSessionKey, sourceState } = this._resolveSessionSourceChat(session, sideChat.source);
    if (sourceSessionKey !== sessionKey) {
      throw new Error(`[AgentService] createChat: side chat source ${sourceKey} does not belong to session ${sessionKey}`);
    }
    const activeTurn = sourceState?.activeTurn?.id === sideChat.turnId ? sourceState.activeTurn : void 0;
    const hasCompletedTurn = sourceState?.turns.some((t) => t.id === sideChat.turnId) ?? false;
    if (!hasCompletedTurn && !activeTurn) {
      throw new Error(`[AgentService] createChat: side chat source turn ${sideChat.turnId} not found in ${sourceKey}`);
    }
    const isLocalSourceTurn = !activeTurn && this._localTurns.isLocal(sourceChatKey, sideChat.turnId);
    const providerAnchorTurnId = isLocalSourceTurn ? this._localTurns.resolveConcreteTurnId(sourceChatKey, sideChat.turnId) : void 0;
    const partialResponse = getSideChatPartialResponse(activeTurn);
    const sourceContext = activeTurn || isLocalSourceTurn ? buildBoundedSideChatSourceContext(sourceState?.turns ?? [], sideChat.turnId, activeTurn) : void 0;
    const selection = sideChat.selection?.text.trim() ? sideChat.selection : sideChat.selection ? (() => {
      throw new Error("[AgentService] createChat: side chat selection text must be non-empty");
    })() : void 0;
    return {
      origin: {
        kind: ChatOriginKind.SideChat,
        chat: sourceChatKey,
        turnId: sideChat.turnId,
        ...selection ? { selection } : {}
      },
      sourceChat: sourceChatKey,
      ...selection ? { selection } : {},
      ...providerAnchorTurnId ? { providerAnchorTurnId } : {},
      ...sourceContext ? { sourceContext } : {},
      ...partialResponse ? { partialResponse } : {}
    };
  }
  _resolveSessionSourceChat(session, source) {
    const sessionKey = session.toString();
    const sourceKey = source.toString();
    const sourceSessionKey = isAhpChatChannel(sourceKey) ? parseRequiredSessionUriFromChatUri(sourceKey) : sourceKey;
    const defaultChatKey = this._stateManager.getSessionState(sessionKey)?.defaultChat ?? buildDefaultChatUri(sessionKey);
    const sourceChatKey = sourceKey === sessionKey ? defaultChatKey : this._stateManager.getChatState(sourceKey) ? sourceKey : isDefaultChatUri(sourceKey) && sourceSessionKey === sessionKey ? defaultChatKey : sourceKey;
    return {
      sourceSessionKey,
      sourceChatKey,
      sourceState: sourceChatKey === defaultChatKey ? this._stateManager.getChatState(defaultChatKey) ?? this._stateManager.getDefaultChatState(sessionKey) : this._stateManager.getChatState(sourceChatKey)
    };
  }
  async disposeChat(session, chat) {
    const sessionKey = session.toString();
    const provider = this._findProviderForSession(session);
    this._sideEffects.clearQueuedMessageSenders(chat.toString());
    this._stateManager.removeChat(sessionKey, chat.toString());
    void this._removePersistedPeerChat(session, chat);
    if (provider) {
      await this._disposeChat(provider, chat);
    }
  }
  // ---- Chat dispatch adapter ---------------------------------------------
  //
  // The orchestrator owns the feature-level `(session, chat)` →
  // `(agent, session, chat)` mapping. It dispatches against an agent's
  // chat-addressed surface ({@link IAgent.chats}) and session lifecycle
  // ({@link IAgent.createSession}/{@link IAgent.disposeSession}).
  /** Whether `provider` can host additional (peer) chats. */
  _supportsChats(provider) {
    return !!provider.chats;
  }
  async _createProviderSession(provider, config, deferWorktreeCreation) {
    const requestedSessionId = deferWorktreeCreation && config?.session ? AgentSession.id(config.session) : void 0;
    if (requestedSessionId) {
      this._worktree?.notePending(requestedSessionId);
    }
    let created;
    try {
      created = await provider.createSession(config ? this._toProviderConfig(config) : void 0);
      if (deferWorktreeCreation && created.provisional) {
        this._worktree?.notePending(AgentSession.id(created.session));
      }
      return created;
    } finally {
      const returnedPendingSessionId = created?.provisional ? AgentSession.id(created.session) : void 0;
      if (requestedSessionId && requestedSessionId !== returnedPendingSessionId) {
        this._worktree?.clearPending(requestedSessionId);
      }
    }
  }
  async _disposeSession(provider, session) {
    await provider.disposeSession(session);
  }
  /**
   * Reconstruct the turns for a chat. `chat` is the concrete chat channel URI,
   * except for legacy restore paths that still address subagent sessions.
   */
  async _getChatMessages(provider, chat) {
    const turns = await this._applyPersistedTurnUsage(chat, await provider.chats.getMessages(chat));
    if (this._worktree && isDefaultChatUri(chat)) {
      return this._worktree.applyRestoreAnnouncement(URI.parse(parseRequiredSessionUriFromChatUri(chat.toString())), turns);
    }
    return turns;
  }
  /**
   * Re-attaches persisted per-turn {@link UsageInfo} to reconstructed turns.
   *
   * Agent backends don't durably record token/credit usage — the Copilot
   * SDK's `assistant.usage` event is explicitly ephemeral and the Claude
   * transcript replay produces none — so restored turns come back without it.
   * Without this the chat's context-usage gauge stays hidden after a reload
   * and the session cost total restarts from zero. Usage recorded live by
   * {@link AgentSideEffects} is looked up by turn id (or the turn's SDK event
   * id, which is what a restored turn is keyed by).
   *
   * NOTE: the lookup only lands for providers that record the bridge between
   * the live protocol turn id (a host-generated uuid) and the id a restored
   * turn is keyed by. Today only Copilot does, via `setTurnEventId`. Claude
   * restores turns keyed by transcript uuid and never populates
   * `turns.event_id`, so its rows are written but never matched; giving it a
   * gauge after reload needs that bridge recorded first.
   */
  async _applyPersistedTurnUsage(chat, turns) {
    if (turns.length === 0 || turns.every((turn) => hasReportedUsage(turn.usage)) || isSubagentChatUri(chat.toString())) {
      return turns;
    }
    const storage = chatStorageUri(chat);
    if (!storage) {
      return turns;
    }
    let usages;
    const ref = await this._sessionDataService.tryOpenDatabase(storage);
    if (!ref) {
      return turns;
    }
    try {
      usages = await ref.object.getTurnUsages();
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to read persisted turn usage for ${storage.toString()}`, err);
      return turns;
    } finally {
      ref.dispose();
    }
    if (usages.size === 0) {
      return turns;
    }
    return turns.map((turn) => {
      const raw = hasReportedUsage(turn.usage) ? void 0 : usages.get(turn.id);
      if (!raw) {
        return turn;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return turn;
        }
        const persisted = parsed;
        const meta = { ...turn.usage?._meta, ...persisted._meta };
        return {
          ...turn,
          usage: {
            ...turn.usage,
            ...persisted,
            ...Object.keys(meta).length > 0 ? { _meta: meta } : {}
          }
        };
      } catch {
        return turn;
      }
    });
  }
  /**
   * Merges persisted host-injected local turns (`/rename`, `!command`) for
   * `chatUri` back into that chat's SDK-derived `turns`, positioned after
   * their anchor turn (the concrete turn they were recorded after). Locals
   * anchored before any real turn are prepended; locals whose anchor is absent
   * from the SDK turns (e.g. truncated away) are dropped. Also seeds the
   * in-memory local-turn index so fork/truncate resolve correctly before the
   * next reload.
   */
  async _interleaveLocalTurns(sessionStr, chatUri, turns) {
    const records = await this._localTurns.loadForChat(sessionStr, chatUri);
    if (records.length === 0) {
      return [...turns];
    }
    const knownIds = new Set(turns.map((t) => t.id));
    const byAnchor = /* @__PURE__ */ new Map();
    const head = [];
    for (const record of records) {
      let turn;
      try {
        turn = JSON.parse(record.payload);
      } catch {
        continue;
      }
      if (record.anchorTurnId === void 0) {
        head.push(turn);
      } else if (knownIds.has(record.anchorTurnId)) {
        const list = byAnchor.get(record.anchorTurnId) ?? [];
        list.push(turn);
        byAnchor.set(record.anchorTurnId, list);
      }
    }
    const merged = [...head];
    for (const turn of turns) {
      merged.push(turn);
      const locals = byAnchor.get(turn.id);
      if (locals) {
        merged.push(...locals);
      }
    }
    return merged;
  }
  /**
   * Re-persists forked host-injected local turns (`/rename`, `!command`) into
   * a newly forked chat so they survive reload and anchor future
   * fork/truncate. `originalSlice[i]` and `forkedTurns[i]` are the source turn
   * and its remapped copy (same length, 1:1); `mapping` is the old→new turn id
   * map used to remap each local turn's anchor. `persistSession` owns the
   * destination database; `sourceChatUri` / `newChatUri` key the source and
   * destination local-turn indexes.
   *
   * Shared by the {@link createSession} (default-chat) and {@link createChat}
   * (peer-chat) fork paths.
   */
  _persistForkedLocalTurns(persistSession, sourceChatUri, newChatUri, originalSlice, forkedTurns, mapping) {
    for (let i = 0; i < originalSlice.length; i++) {
      const original = originalSlice[i];
      if (!this._localTurns.isLocal(sourceChatUri, original.id)) {
        continue;
      }
      const originalAnchor = this._localTurns.resolveConcreteTurnId(sourceChatUri, original.id);
      const newAnchor = originalAnchor !== void 0 ? mapping.get(originalAnchor) : void 0;
      this._localTurns.record(persistSession, newChatUri, forkedTurns[i], newAnchor);
    }
  }
  /**
   * Create (or fork) the peer chat `chat` within `session`. `chat` is
   * always a peer URI here (the default chat is created implicitly with
   * the session), so no default-chat resolution is needed.
   */
  _createChat(provider, chat, options) {
    const convOptions = options && (options.title !== void 0 || options.model !== void 0 || options.sideChat !== void 0) ? {
      ...options.title !== void 0 ? { title: options.title } : {},
      ...options.model !== void 0 ? { model: options.model } : {},
      ...options.sideChat !== void 0 ? { sideChat: options.sideChat } : {}
    } : void 0;
    return options?.fork ? provider.chats.fork(chat, options.fork, convOptions) : provider.chats.createChat(chat, convOptions);
  }
  async _disposeChat(provider, chat) {
    await provider.chats.disposeChat(chat);
  }
  /**
   * Derives a placeholder title for an imported session from its first user
   * turn (imports seed pre-existing turns, so the normal first-message title
   * generation never fires). Deliberately unprefixed: an imported session is a
   * continuation of the source chat, not a distinct kind of session, so it
   * should read like any other. The placeholder is later refined into a
   * generated title (see the `importConversation` branch in `createSession`),
   * but a neutral non-empty fallback is kept so the session still reads like a
   * normal chat when generation is unavailable or fails.
   */
  _buildImportedTitle(turns) {
    const firstText = turns.find((t) => t.message?.text?.trim())?.message.text.trim();
    if (!firstText) {
      return localize("agentHost.importedSessionFallback", "New Session");
    }
    const MAX = 60;
    return firstText.length > MAX ? `${firstText.slice(0, MAX)}...` : firstText;
  }
  _buildInitialSummary(provider, session, config, created, title) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      resource: session.toString(),
      provider: provider.id,
      title,
      status: SessionStatus.Idle,
      createdAt: now,
      modifiedAt: now,
      ...created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {},
      // The provider resolved only its process root (index 0), which may
      // differ from the requested primary (e.g. a workspace-less scratch dir).
      // Assemble the session set by overriding the requested primary with it
      // and keeping the requested tail; the fully-resolved multi-root set
      // arrives later via the materialization receipt.
      workingDirectories: reconcileWorkingDirectories(config?.workingDirectories, created.resolvedWorkingDirectory ? [created.resolvedWorkingDirectory] : void 0),
      // Workspace-less is inferred at create from an absent input
      // `workingDirectories` (the host assigns a scratch cwd, so it can't be
      // re-inferred later) and tagged on the generic `_meta` bag. Use
      // `=== undefined` so an explicit empty set (`[]`) is NOT treated as
      // workspace-less.
      ...!config?.fork && !config?.workingDirectories ? { _meta: withSessionWorkspaceless(void 0, true) } : {}
    };
  }
  /**
   * Listen for an agent transitioning a provisional session into a fully
   * materialized SDK session. The agent has already created the worktree
   * (if any) and persisted on-disk metadata; we need to:
   * - Refresh the in-memory summary with the resolved working directory
   *   and project metadata.
   * - Persist any config values now that we have a real on-disk session.
   * - Emit the deferred `notify/sessionAdded` so other clients learn of
   *   the session.
   * - Dispatch `SessionReady` so subscribers see the lifecycle transition.
   * - Lazily attach git state for the (possibly new) working directory.
   */
  _onDidMaterializeSession(e) {
    const sessionKey = e.session.toString();
    this._clearDownloadProgressInterest(sessionKey);
    const state = this._stateManager.getSessionState(sessionKey);
    if (!state) {
      this._logService.warn(`[AgentService] onDidMaterializeSession for unknown session: ${sessionKey}`);
      return;
    }
    const currentSummary = this._stateManager.getSessionSummary(sessionKey);
    if (!currentSummary) {
      this._logService.warn(`[AgentService] onDidMaterializeSession missing summary for session: ${sessionKey}`);
      return;
    }
    const project = this._worktree?.createdWorktreeProject(AgentSession.id(e.session)) ?? e.project;
    const currentSet = currentSummary.workingDirectories?.map((d) => URI.parse(d));
    const summary = {
      ...currentSummary,
      ...project ? { project: { uri: project.uri.toString(), displayName: project.displayName } } : {},
      // The materialize receipt is authoritative for the roots it reports
      // (index 0 = the resolved process root, e.g. a worktree). A send-path
      // receipt carries the full resolved set; a resume-path receipt reports
      // only the process root, so the rest of the current set is preserved.
      workingDirectories: reconcileWorkingDirectories(currentSet, e.workingDirectories),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const configValues = state.config?.values;
    if (configValues && Object.keys(configValues).length > 0) {
      this._persistConfigValues(e.session, configValues);
    }
    this._persistWorkspaceless(e.session, readSessionWorkspaceless(summary._meta));
    this._stateManager.markSessionPersisted(sessionKey, summary);
    this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
    void this._gitStateService.refreshSessionGitState(e.session.toString(), e.workingDirectories?.[0]);
    this._changesetCoordinator.onSessionMaterialized(sessionKey);
  }
  /** Drop a session's download-progress opt-in, if any. */
  _clearDownloadProgressInterest(sessionKey) {
    for (const [provider, sessions] of this._downloadProgressInterest) {
      if (sessions.delete(sessionKey) && sessions.size === 0) {
        this._downloadProgressInterest.delete(provider);
      }
    }
  }
  /**
   * Surface a host-level SDK download as client progress. The downloader fires
   * process-global frames keyed by package id (which equals the provider id);
   * because the download is shared across every session of that provider, we
   * emit a SINGLE `progress` stream keyed by that package id — not one per
   * session — so the client shows exactly one indicator no matter how many
   * sessions of the provider are awaiting it. Frames are only emitted while at
   * least one session has opted in (supplied a
   * {@link IAgentCreateSessionConfig.progressToken} on `createSession`). A
   * terminal frame reports `total === progress` (using `receivedBytes` when the
   * size was never known) so the client dismisses the indicator deterministically.
   *
   * `displayName` is the provider's brand noun (e.g. `Claude`). It is woven
   * into the notification's localized, human-readable `message` (e.g.
   * "Downloading Claude agent") so a generic client can render the indicator
   * verbatim without knowing the resource is an agent SDK. No trailing
   * ellipsis: clients render progress as "<title>: <percent>", so an ellipsis
   * would read as an unusual "…:" (see #324455).
   */
  emitDownloadProgress(packageId, displayName, receivedBytes, totalBytes, terminal) {
    const sessions = this._downloadProgressInterest.get(packageId);
    if (!sessions || sessions.size === 0) {
      return;
    }
    const total = terminal ? receivedBytes : totalBytes;
    const message = localize("agentHost.download.agentSdkTitle", "Downloading {0} agent", displayName);
    this._stateManager.emitProgress({ progressToken: packageId, progress: receivedBytes, total, message });
    if (terminal) {
      this._downloadProgressInterest.delete(packageId);
    }
  }
  _persistWorkspaceless(session, workspaceless) {
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(session);
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to open session database to persist workspaceless for ${session.toString()}: ${toErrorMessage(err)}`);
      return;
    }
    ref.object.setMetadata(AH_META_WORKSPACELESS_DB_KEY, workspaceless ? "true" : "false").catch((err) => {
      this._logService.warn(`[AgentService] Failed to persist workspaceless for ${session.toString()}: ${toErrorMessage(err)}`);
    }).finally(() => {
      ref.dispose();
    });
  }
  _persistConfigValues(session, values) {
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(session);
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to open session database to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
      return;
    }
    ref.object.setMetadata("configValues", JSON.stringify(values)).catch((err) => {
      this._logService.warn(`[AgentService] Failed to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
    }).finally(() => {
      ref.dispose();
    });
  }
  async _resolveCreatedSessionConfig(provider, config) {
    if (!config?.config && config?.workingDirectories === void 0) {
      return void 0;
    }
    const params = {
      provider: provider.id,
      // `resolveSessionConfig` is a pre-session, single-context API:
      // resolve against the session's primary (index 0).
      workingDirectory: config.workingDirectories?.[0],
      config: config.config
    };
    try {
      const resolved = await this._withIsolationSchema(await provider.resolveSessionConfig(this._toProviderConfig(params)), params);
      return { schema: resolved.schema, values: resolved.values };
    } catch (err) {
      this._logService.error(`[AgentService] Failed to resolve created session config for provider ${provider.id}`, err);
      return config.config ? { schema: { type: "object", properties: {} }, values: config.config } : void 0;
    }
  }
  async resolveSessionConfig(params) {
    const providerId = params.provider ?? this._defaultProvider;
    const provider = providerId ? this._providers.get(providerId) : void 0;
    if (!provider) {
      throw new Error(`No agent provider registered for: ${providerId ?? "(none)"}`);
    }
    return this._withIsolationSchema(await provider.resolveSessionConfig(this._toProviderConfig(params)), params);
  }
  /**
   * Host-owned contribution of the shared `isolation` (folder / worktree),
   * `branch`, `worktreeBranchPrefix`, `worktreeIncludeFiles`, and `worktreeBranchTrack` session-config
   * properties on top of whatever an agent returned from `resolveSessionConfig`. Provider-returned
   * properties and values with these keys are replaced by the host contribution.
   */
  async _withIsolationSchema(result, params) {
    if (!this._worktree) {
      return result;
    }
    const iso = await this._worktree.resolveIsolationConfig({ workingDirectory: params.workingDirectory, config: params.config });
    const properties = {
      [SessionConfigKey.Isolation]: iso.isolationProperty.protocol,
      ...omitHostOwnedSessionConfig(result.schema.properties)
    };
    if (iso.branchProperty) {
      properties[SessionConfigKey.Branch] = iso.branchProperty.protocol;
    }
    if (iso.worktreeBranchPrefixProperty) {
      properties[SessionConfigKey.WorktreeBranchPrefix] = iso.worktreeBranchPrefixProperty.protocol;
    }
    if (iso.worktreeBranchTrackProperty) {
      properties[SessionConfigKey.WorktreeBranchTrack] = iso.worktreeBranchTrackProperty.protocol;
    }
    if (iso.worktreeIncludeFilesProperty) {
      properties[SessionConfigKey.WorktreeIncludeFiles] = iso.worktreeIncludeFilesProperty.protocol;
    }
    const values = omitHostOwnedSessionConfig(result.values);
    values[SessionConfigKey.Isolation] = iso.isolationValue;
    if (iso.branchProperty && iso.branchValue !== void 0) {
      values[SessionConfigKey.Branch] = iso.branchValue;
    }
    if (iso.worktreeBranchPrefixProperty && typeof params.config?.[SessionConfigKey.WorktreeBranchPrefix] === "string") {
      values[SessionConfigKey.WorktreeBranchPrefix] = params.config[SessionConfigKey.WorktreeBranchPrefix];
    }
    if (iso.worktreeBranchTrackProperty && typeof params.config?.[SessionConfigKey.WorktreeBranchTrack] === "boolean") {
      values[SessionConfigKey.WorktreeBranchTrack] = params.config[SessionConfigKey.WorktreeBranchTrack];
    }
    if (iso.worktreeIncludeFilesProperty && Array.isArray(params.config?.[SessionConfigKey.WorktreeIncludeFiles]) && params.config[SessionConfigKey.WorktreeIncludeFiles].every((pattern) => typeof pattern === "string")) {
      values[SessionConfigKey.WorktreeIncludeFiles] = params.config[SessionConfigKey.WorktreeIncludeFiles];
    }
    return { schema: { ...result.schema, properties }, values };
  }
  async sessionConfigCompletions(params) {
    if (params.property === SessionConfigKey.Branch && this._worktree) {
      return this._worktree.branchCompletions(params.workingDirectory, params.query);
    }
    const providerId = params.provider ?? this._defaultProvider;
    const provider = providerId ? this._providers.get(providerId) : void 0;
    if (!provider) {
      throw new Error(`No agent provider registered for: ${providerId ?? "(none)"}`);
    }
    return provider.sessionConfigCompletions(this._toProviderConfig(params));
  }
  async completions(params) {
    return this._completions.completions(params);
  }
  async getCompletionTriggerCharacters() {
    return this._completions.triggerCharacters;
  }
  async disposeSession(session) {
    this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
    const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session.toString());
    const provider = this._findProviderForSession(session);
    if (provider) {
      await this._disposeSession(provider, session);
      this._sessionToProvider.delete(session.toString());
      this._clearDownloadProgressInterest(session.toString());
    }
    await this._sessionDataService.deleteSessionData(session, workingDirectories);
    await this._worktree?.removeCreatedWorktree(AgentSession.id(session));
    this._changesetCoordinator.onSessionDisposed(session.toString());
    this._sideEffects.cancelSessionTitleGeneration(session.toString());
    for (const chat of this._stateManager.getSessionState(session.toString())?.chats ?? []) {
      this._sideEffects.clearQueuedMessageSenders(chat.resource);
    }
    this._sideEffects.removeSubagentSessions(session.toString());
    this._stateManager.deleteSession(session.toString());
  }
  // ---- Protocol methods ---------------------------------------------------
  async createTerminal(params) {
    await this._terminalManager.createTerminal(params);
  }
  async disposeTerminal(terminal) {
    this._terminalManager.disposeTerminal(terminal.toString());
  }
  async subscribe(resource, clientId) {
    this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
    const resourceStr = resource.toString();
    this.addSubscriber(resource, clientId);
    try {
      const terminalState = this._terminalManager.getTerminalState(resourceStr);
      if (terminalState) {
        return { resource: resourceStr, state: terminalState, fromSeq: this._stateManager.serverSeq };
      }
      let snapshot = this._stateManager.getSnapshot(resourceStr);
      const parsedChangeset = parseChangesetUri(resourceStr);
      if (snapshot && parsedChangeset && !this._stateManager.getSessionState(parsedChangeset.sessionUri)) {
        await this._changesetCoordinator.restoreSessionIfChangesetSubscription(resource, (s) => this.restoreSession(s));
        snapshot = this._stateManager.getSnapshot(resourceStr);
      }
      if (!snapshot) {
        const parsedChatSession = parseDefaultChatUri(resourceStr);
        if (parsedChatSession !== void 0) {
          if (!this._stateManager.getSessionState(parsedChatSession)) {
            const parentUri = URI.parse(parsedChatSession);
            const parsedSubagentParent = parseSubagentSessionUri(parentUri);
            if (parsedSubagentParent) {
              await this._restoreSubagentSession(parsedChatSession, parsedSubagentParent.parentSession);
            } else {
              await this.restoreSession(parentUri);
            }
          }
          snapshot = this._stateManager.getSnapshot(resourceStr);
        }
      }
      if (!snapshot) {
        if (isSubagentChatUri(resource)) {
          snapshot = await this._awaitPendingSubagentChat(resourceStr);
        } else {
          const handled = await this._changesetCoordinator.tryHandleSubscribe(resource, (s) => this.restoreSession(s));
          if (handled) {
            snapshot = this._stateManager.getSnapshot(resourceStr);
          } else {
            const parsedSubagent = parseSubagentSessionUri(resource);
            if (parsedSubagent) {
              await this._restoreSubagentSession(resourceStr, parsedSubagent.parentSession);
            } else {
              await this.restoreSession(resource);
            }
            snapshot = this._stateManager.getSnapshot(resourceStr);
          }
        }
      }
      if (!snapshot) {
        throw new Error(`Cannot subscribe to unknown resource: ${resourceStr}`);
      }
      const sessionState = this._stateManager.getSessionState(resourceStr);
      if (!isAhpChatChannel(resourceStr) && sessionState && readSessionGitState(sessionState._meta) === void 0) {
        const workingDirectory = sessionState.workingDirectories?.[0] ? URI.parse(sessionState.workingDirectories[0]) : void 0;
        void this._gitStateService.refreshSessionGitState(resourceStr, workingDirectory);
      }
      return snapshot;
    } catch (err) {
      this.unsubscribe(resource, clientId);
      throw err;
    }
  }
  /** Waits for an armed subagent chat to register (or its wait to time out); returns `undefined` if not armed or never registered. */
  async _awaitPendingSubagentChat(subagentChatUri) {
    const pending = this._pendingSubagentChats.get(subagentChatUri);
    if (!pending) {
      return void 0;
    }
    await pending.p;
    return this._stateManager.getSnapshot(subagentChatUri);
  }
  addSubscriber(resource, clientId) {
    let set = this._resourceSubscribers.get(resource);
    const wasUnsubscribed = !set || set.size === 0;
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this._resourceSubscribers.set(resource, set);
    }
    set.add(clientId);
    this._cancelPendingSessionGc(resource);
    this._cancelPendingSessionRelease(resource);
    if (wasUnsubscribed) {
      this._changesetCoordinator.onFirstSubscriber(resource);
    }
  }
  unsubscribe(resource, clientId) {
    const set = this._resourceSubscribers.get(resource);
    if (!set) {
      return;
    }
    set.delete(clientId);
    if (set.size > 0) {
      return;
    }
    this._resourceSubscribers.delete(resource);
    this._changesetCoordinator.onLastSubscriber(resource);
    this._stateManager.onChangesetLivenessChanged();
    if (this._maybeScheduleSessionGc(resource)) {
      return;
    }
    this._pendingSessionRelease.set(resource, disposableTimeout(() => {
      this._pendingSessionRelease.deleteAndDispose(resource);
      this._maybeEvictIdleSession(resource);
    }, SESSION_RELEASE_GRACE_MS));
  }
  _cancelPendingSessionRelease(resource) {
    this._pendingSessionRelease.deleteAndDispose(resource);
  }
  /**
   * If `resource` names a session that no client is still subscribed to and
   * that has produced no turns (and has no active turn), schedule a delayed
   * {@link _runSessionGc} to fully tear it down — provider session, worktree,
   * persisted state and all. Sessions with at least one turn are left to the
   * existing {@link _maybeEvictIdleSession} path which only drops cached
   * state and lets the session be restored from disk later.
   *
   * The delay ({@link SESSION_GC_GRACE_MS}) gives a disconnected client time
   * to reconnect or a workspace switch to settle. Any subsequent subscribe
   * (or createSession on the same URI) cancels the timer via
   * {@link _cancelPendingSessionGc}.
   *
   * Returns `true` if a GC timer was armed (existing or newly scheduled),
   * so callers can skip alternative cleanup paths.
   */
  _maybeScheduleSessionGc(resource) {
    if (parseSubagentSessionUri(resource)) {
      return false;
    }
    const key = resource.toString();
    const state = this._stateManager.getSessionState(key);
    if (!state) {
      return false;
    }
    if (state.turns.length > 0 || state.activeTurn !== void 0) {
      return false;
    }
    this._pendingSessionGc.set(resource, disposableTimeout(() => {
      this._pendingSessionGc.deleteAndDispose(resource);
      this._runSessionGc(resource).catch((err) => {
        this._logService.error(err, `[AgentService] GC failed for ${key}`);
      });
    }, SESSION_GC_GRACE_MS));
    return true;
  }
  _cancelPendingSessionGc(resource) {
    this._pendingSessionGc.deleteAndDispose(resource);
  }
  /**
   * Fires {@link SESSION_GC_GRACE_MS} after a session lost its last
   * subscriber while empty. Re-checks both invariants (still no subscribers,
   * still empty) before tearing the session down via {@link disposeSession}.
   * The cached state may already have been evicted by
   * {@link _maybeEvictIdleSession}; in that case we still proceed because
   * "evicted + no resubscribe" implies no client is observing the session.
   */
  async _runSessionGc(resource) {
    const key = resource.toString();
    if (this._resourceSubscribers.has(resource)) {
      return;
    }
    const state = this._stateManager.getSessionState(key);
    if (state && (state.turns.length > 0 || state.activeTurn !== void 0)) {
      return;
    }
    this._logService.info(`[AgentService] GC: disposing empty unsubscribed session ${key}`);
    await this.disposeSession(resource);
  }
  /**
   * If `resource` names an idle session and no client is still subscribed to
   * it (or, for a subagent URI, no sibling subagent under the same parent is
   * still subscribed), release its in-memory footprint: drop the cached AHP
   * state from the state manager AND ask the provider to release the session's
   * SDK resources ({@link IAgent.releaseSession}). Subagent URIs evict the
   * parent session entry; the parent owns the materialized turn tree that
   * backs every subagent view. Nothing durable is deleted — the next subscribe
   * rehydrates the session via {@link restoreSession} and the provider resumes
   * the SDK session on demand.
   */
  _maybeEvictIdleSession(resource) {
    const key = resource.toString();
    if (this._resourceSubscribers.has(resource)) {
      return;
    }
    let evictionTarget = resource;
    {
      let parsed;
      while (parsed = parseSubagentSessionUri(evictionTarget)) {
        evictionTarget = parsed.parentSession;
      }
    }
    if (this._resourceSubscribers.has(evictionTarget)) {
      return;
    }
    for (const subscribedUri of this._resourceSubscribers.keys()) {
      if (this._isSubagentDescendantOf(subscribedUri, evictionTarget)) {
        return;
      }
    }
    const evictionTargetKey = evictionTarget.toString();
    if (this._restoreSessionInFlight.has(evictionTargetKey)) {
      return;
    }
    const targetState = this._stateManager.getSessionState(evictionTargetKey);
    if (!targetState || targetState.activeTurn !== void 0) {
      return;
    }
    this._logService.info(`[AgentService] Evicting idle session: ${evictionTargetKey} (triggered by unsubscribe of ${key})`);
    const subagentPrefix = buildSubagentSessionUriPrefix(evictionTarget);
    for (const cachedKey of this._stateManager.getSessionUrisWithPrefix(subagentPrefix)) {
      this._stateManager.removeSession(cachedKey);
    }
    this._stateManager.removeSession(evictionTargetKey);
    const provider = this._findProviderForSession(evictionTarget);
    provider?.releaseSession?.(evictionTarget).catch((err) => {
      this._logService.error(err, `[AgentService] Failed to release idle session ${evictionTargetKey}`);
    });
  }
  // Returns true when a changeset is safe to drop from the in-memory cache.
  _isChangesetEvictable(changeset) {
    const changesetUri = URI.parse(changeset);
    if (this._resourceSubscribers.has(changesetUri)) {
      return false;
    }
    const parsed = parseChangesetUri(changeset);
    if (!parsed) {
      return false;
    }
    const sessionUri = URI.parse(parsed.sessionUri);
    if (this._resourceSubscribers.has(sessionUri)) {
      return false;
    }
    for (const subscribedUri of this._resourceSubscribers.keys()) {
      if (this._isSubagentDescendantOf(subscribedUri, sessionUri)) {
        return false;
      }
    }
    return !this._changesets.isStaticChangesetComputeActive(changeset);
  }
  _isSubagentDescendantOf(resource, parent) {
    let parsed = parseSubagentSessionUri(resource);
    while (parsed) {
      if (isEqual(parsed.parentSession, parent)) {
        return true;
      }
      parsed = parseSubagentSessionUri(parsed.parentSession);
    }
    return false;
  }
  dispatchAction(channel, action, clientId, clientSeq, clientType = AgentHostClientType.Unknown) {
    this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);
    const chatChannel = isAhpChatChannel(channel) ? channel : void 0;
    const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;
    const pending = this._clientDispatchQueues.get(clientId);
    if (!pending && !this._needsAsyncRewrite(sessionChannel, action)) {
      this._dispatchActionNow(channel, sessionChannel, action, clientId, clientSeq, clientType);
      return;
    }
    const next = (pending ?? Promise.resolve()).then(async () => {
      const rewritten = this._needsAsyncRewrite(sessionChannel, action) ? await this._rewriteUserMessageAttachments(sessionChannel, action, clientId) : action;
      if (rewritten.type === ActionType.ChangesetFilesReviewChanged) {
        await this._reviewService.setReviewState(channel, rewritten.files, rewritten.reviewed);
        const changeset = parseChangesetUri(channel);
        if (!changeset) {
          throw new Error(`Invalid changeset URI: ${channel}`);
        }
        this._changesets.refreshBranchChangeset(changeset.sessionUri);
      }
      this._dispatchActionNow(channel, sessionChannel, rewritten, clientId, clientSeq, clientType);
    }).catch((err) => {
      this._logService.error(`[AgentService] async dispatchAction failed: ${toErrorMessage(err)}`);
    });
    this._clientDispatchQueues.set(clientId, next.finally(() => {
      if (this._clientDispatchQueues.get(clientId) === next) {
        this._clientDispatchQueues.delete(clientId);
      }
    }));
  }
  _dispatchActionNow(channel, sessionChannel, action, clientId, clientSeq, clientType) {
    const origin = { clientId, clientSeq };
    this._stateManager.dispatchClientAction(channel, action, origin);
    if (action.type === ActionType.RootConfigChanged) {
      this._configurationService.persistRootConfig();
      const editTelemetryEnabled = action.config[AgentHostEditTelemetryEnabledConfigKey];
      if (typeof editTelemetryEnabled === "boolean") {
        this._editAttributionService?.setEnabled(editTelemetryEnabled);
      }
    }
    this._sideEffects.handleAction(channel, action, clientId, clientType);
  }
  _needsAsyncRewrite(channel, action) {
    if (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet) {
      return false;
    }
    const attachmentsRootStr = this._attachmentsRoot(channel).toString();
    return !!action.message.attachments?.some((a) => this._isRewritableAttachment(a, attachmentsRootStr));
  }
  _isRewritableAttachment(attachment, attachmentsRootStr) {
    if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
      return true;
    }
    if (attachment.type === MessageAttachmentKind.Resource) {
      if (attachment.displayKind === "directory") {
        return false;
      }
      if (attachment.uri.startsWith(attachmentsRootStr)) {
        return false;
      }
      return true;
    }
    return false;
  }
  _attachmentsRoot(session) {
    return joinPath(this._sessionDataService.getSessionDataDir(URI.parse(session)), SESSION_ATTACHMENTS_DIRNAME);
  }
  /**
   * Snapshot inline / client-resident attachment payloads onto disk
   * under the session's data directory and rewrite the action to
   * reference them via local `file:` URIs. Keeps potentially large
   * blobs (e.g. pasted images) out of the in-memory state tree while
   * letting the agent consume them via the standard {@link IFileService}
   * surface — no special URI scheme or blob round-tripping needed.
   *
   * Failures are isolated per-attachment: if a rewrite cannot be
   * performed (no client connection registered, `resourceRead` rejects,
   * etc.) the original attachment is preserved so the agent still has a
   * chance to make use of it.
   */
  async _rewriteUserMessageAttachments(channel, action, clientId) {
    const attachments = action.message.attachments;
    if (!attachments?.length) {
      return action;
    }
    const attachmentsRoot = this._attachmentsRoot(channel);
    const attachmentsRootStr = attachmentsRoot.toString();
    const rewritten = await Promise.all(attachments.map((a) => this._rewriteSingleAttachment(a, attachmentsRoot, attachmentsRootStr, clientId)));
    return {
      ...action,
      message: { ...action.message, attachments: rewritten }
    };
  }
  async _rewriteSingleAttachment(attachment, attachmentsRoot, attachmentsRootStr, clientId) {
    try {
      if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
        const bytes = decodeBase64(attachment.data).buffer;
        const basename = this._attachmentBasename(attachment.label, attachment.contentType);
        return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot);
      }
      if (attachment.type === MessageAttachmentKind.Resource && this._isRewritableAttachment(attachment, attachmentsRootStr)) {
        const originalUri = URI.parse(attachment.uri);
        if (originalUri.scheme === Schemas.file && await this._fileExistsSafe(originalUri)) {
          return attachment;
        }
        const bytes = await this._readClientResource(originalUri, clientId);
        const basename = this._attachmentBasename(attachment.label, getMediaMime(originalUri.path));
        return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot);
      }
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to rewrite attachment '${attachment.label}': ${toErrorMessage(err)}`);
    }
    return attachment;
  }
  /**
   * Like {@link IFileService.exists} but never throws (e.g. when no provider
   * is registered for the URI scheme), returning `false` in that case.
   */
  async _fileExistsSafe(uri) {
    try {
      return await this._fileService.exists(uri);
    } catch {
      return false;
    }
  }
  /**
   * Reads `originalUri` through the `vscode-agent-client` filesystem
   * provider so it is fetched from the originating client. Falls back to
   * a direct read against `originalUri` when no client filesystem
   * authority is registered for `clientId` (e.g. unit tests, in-process
   * agent host with a local URI).
   */
  async _readClientResource(originalUri, clientId) {
    const proxiedUri = clientId ? toAgentClientUri(originalUri, clientId) : originalUri;
    try {
      const contents = await this._fileService.readFile(proxiedUri);
      return contents.value.buffer;
    } catch (err) {
      if (proxiedUri !== originalUri) {
        try {
          const contents = await this._fileService.readFile(originalUri);
          return contents.value.buffer;
        } catch {
        }
      }
      throw err;
    }
  }
  async _writeAndRewrite(original, bytes, basename, attachmentsRoot) {
    const id = generateUuid();
    const target = joinPath(attachmentsRoot, id, basename);
    await this._fileService.writeFile(target, VSBuffer.wrap(bytes));
    const rewritten = {
      type: MessageAttachmentKind.Resource,
      uri: target.toString(),
      label: original.label,
      displayKind: original.displayKind,
      range: original.range,
      _meta: original._meta
    };
    if (original.type === MessageAttachmentKind.Resource && original.selection) {
      rewritten.selection = original.selection;
    }
    return rewritten;
  }
  /**
   * Pick a sensible on-disk basename for the snapshotted attachment,
   * preserving a usable extension where possible so the SDK and other
   * downstream consumers can detect the right type from the path alone.
   */
  _attachmentBasename(label, contentType) {
    const safeLabel = (label || "attachment").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
    if (resourcesExtname(URI.file(safeLabel))) {
      return safeLabel;
    }
    const ext = contentType ? getExtensionForMimeType(contentType) : void 0;
    return ext ? `${safeLabel}${ext}` : safeLabel;
  }
  async resourceList(uri) {
    let stat;
    try {
      stat = await this._fileService.resolve(uri);
    } catch {
      throw new ProtocolError(AhpErrorCodes.NotFound, `Directory not found: ${uri.toString()}`);
    }
    if (!stat.isDirectory) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `Not a directory: ${uri.toString()}`);
    }
    const entries = (stat.children ?? []).map((child) => ({
      name: child.name,
      type: child.isDirectory ? "directory" : "file"
    }));
    return { entries };
  }
  async restoreSession(session) {
    const sessionStr = session.toString();
    if (this._stateManager.getSessionState(sessionStr)) {
      return;
    }
    const inFlight = this._restoreSessionInFlight.get(sessionStr);
    if (inFlight) {
      return inFlight;
    }
    const restore = this._doRestoreSession(session, sessionStr);
    this._restoreSessionInFlight.set(sessionStr, restore);
    try {
      await restore;
    } finally {
      if (this._restoreSessionInFlight.get(sessionStr) === restore) {
        this._restoreSessionInFlight.delete(sessionStr);
      }
    }
  }
  async _doRestoreSession(session, sessionStr) {
    if (this._stateManager.getSessionState(sessionStr)) {
      return;
    }
    const agent = this._findProviderForSession(session);
    if (!agent) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
    }
    const meta = await this._getSessionMetadataForRestore(agent, session);
    if (!meta) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
    }
    const defaultChatUri = URI.parse(buildDefaultChatUri(sessionStr));
    let turns;
    try {
      turns = await this._getChatMessages(agent, defaultChatUri);
    } catch (err) {
      if (err instanceof ProtocolError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${sessionStr}: ${message}`);
    }
    let title = meta.summary ?? "Session";
    let isRead;
    let isArchived;
    let persistedConfigValues;
    let changes;
    let gitMetadata;
    let changesetMetadata;
    let sessionMetadata;
    const ref = this._sessionDataService.tryOpenDatabase?.(session);
    if (ref) {
      try {
        const db = await ref;
        if (db) {
          try {
            const m = await db.object.getMetadataObject({
              customTitle: true,
              [AH_META_IS_READ_DB_KEY]: true,
              [AH_META_IS_ARCHIVED_DB_KEY]: true,
              [AH_META_IS_DONE_DB_KEY]: true,
              configValues: true,
              [AH_META_WORKSPACELESS_DB_KEY]: true,
              ...GIT_DB_METADATA_KEYS,
              ...CHANGESET_DB_METADATA_KEYS
            });
            if (m.customTitle) {
              title = m.customTitle;
            }
            if (m[AH_META_IS_READ_DB_KEY] !== void 0) {
              isRead = m[AH_META_IS_READ_DB_KEY] === "true";
            }
            const persistedArchived = m[AH_META_IS_ARCHIVED_DB_KEY] ?? m[AH_META_IS_DONE_DB_KEY];
            if (persistedArchived !== void 0) {
              isArchived = persistedArchived === "true";
            }
            changesetMetadata = m;
            if (changesetMetadata[META_CHANGES_SUMMARY]) {
              try {
                changes = JSON.parse(changesetMetadata[META_CHANGES_SUMMARY]);
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse changes summary for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
            gitMetadata = m;
            if (gitMetadata[META_GIT_STATE]) {
              try {
                const gitState = JSON.parse(gitMetadata[META_GIT_STATE]);
                sessionMetadata = { [SESSION_META_GIT_KEY]: gitState };
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse Git state for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
            if (gitMetadata[META_GITHUB_STATE]) {
              try {
                const githubState = JSON.parse(gitMetadata[META_GITHUB_STATE]);
                sessionMetadata = {
                  ...sessionMetadata ? sessionMetadata : {},
                  [SESSION_META_GITHUB_KEY]: githubState
                };
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse GitHub state for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
            if (m[AH_META_WORKSPACELESS_DB_KEY] !== void 0) {
              sessionMetadata = withSessionWorkspaceless(sessionMetadata, m[AH_META_WORKSPACELESS_DB_KEY] === "true");
            }
            if (m.configValues) {
              try {
                persistedConfigValues = JSON.parse(m.configValues);
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse persisted configValues for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
          } finally {
            db.dispose();
          }
        }
      } catch {
      }
    }
    let status = SessionStatus.Idle;
    if (isRead) {
      status |= SessionStatus.IsRead;
    }
    if (isArchived) {
      status |= SessionStatus.IsArchived;
    }
    const summary = {
      resource: sessionStr,
      provider: agent.id,
      title,
      status,
      createdAt: new Date(meta.startTime).toISOString(),
      modifiedAt: new Date(meta.modifiedTime).toISOString(),
      ...meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {},
      changes: meta.changes ?? changes,
      workingDirectories: meta.workingDirectories?.map((d) => d.toString()),
      _meta: sessionMetadata || meta._meta ? { ...meta._meta ?? {}, ...sessionMetadata ?? {} } : void 0
    };
    const [defaultDraft, defaultChatTitle] = await Promise.all([
      this._getChatDraft(session, defaultChatUri),
      this._readPersistedChatTitle(session, defaultChatUri)
    ]);
    const mergedTurns = await this._interleaveLocalTurns(sessionStr, defaultChatUri.toString(), turns);
    this._stateManager.restoreSession(summary, mergedTurns, { draft: defaultDraft, defaultChatTitle });
    const promises = [];
    promises.push((async () => {
      if (agent.getSubagentSessions) {
        try {
          const children = await agent.getSubagentSessions(session);
          for (const child of children) {
            this._registerRestoredSubagent(child, summary, sessionStr);
          }
        } catch (err) {
          this._logService.warn(`[AgentService] restoreSession failed to eagerly register subagents session=${sessionStr}`, err);
        }
      }
    })());
    promises.push(this._restorePeerChats(agent, session));
    this._changesetCoordinator.onSessionRestored(sessionStr, changesetMetadata ?? {});
    if (meta._meta) {
      this._stateManager.setSessionMeta(sessionStr, meta._meta);
    }
    const [restoredConfig, restoredCustomizations] = await Promise.all([
      this._resolveCreatedSessionConfig(agent, {
        workingDirectories: meta.workingDirectories,
        config: persistedConfigValues
      }),
      agent.getSessionCustomizations ? agent.getSessionCustomizations(session).catch((err) => {
        this._logService.error("[AgentService] restoreSession: failed to resolve session customizations", err);
        return void 0;
      }) : Promise.resolve(void 0),
      ...promises
    ]);
    if (restoredConfig) {
      this._stateManager.setSessionConfig(sessionStr, restoredConfig);
    }
    if (restoredCustomizations && restoredCustomizations.length > 0) {
      this._stateManager.setSessionCustomizations(sessionStr, restoredCustomizations);
    }
    this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);
    void this._gitStateService.attachSessionGitHubPullRequest(sessionStr, meta.workingDirectories?.[0]);
  }
  /**
   * Restores the additional (non-default) peer chats for a session.
   *
   * Enumeration is driven by the orchestrator's OWN persisted catalog (the
   * {@link PEER_CHATS_METADATA_KEY} blob). For each catalog entry the agent's
   * in-memory backing is re-attached via
   * {@link IAgent.materializeChat} (handing back the opaque
   * `providerData` blob) BEFORE its history is read, then the chat is
   * re-registered in the state manager with its persisted title and draft so
   * it reappears after a process restart. Best-effort: a chat whose history
   * fails to load is restored with no turns rather than dropped.
   *
   * When the orchestrator catalog is absent ({@link _readPersistedPeerChatCatalog}
   * returns `undefined`) the session predates orchestrator-owned persistence:
   * a one-time migration ({@link _migrateLegacyPeerChats}) drains the agent's
   * legacy `*.chats` enumeration into the catalog so it is never consulted
   * again.
   */
  async _restorePeerChats(agent, session) {
    const persisted = await this._readPersistedPeerChatCatalog(session);
    if (persisted !== void 0) {
      await this._restorePeerChatsFromCatalog(agent, session, persisted);
      return;
    }
    await this._migrateLegacyPeerChats(agent, session);
  }
  /**
   * One-time migration for sessions persisted before the orchestrator owned
   * the peer-chat catalog: enumerate the agent's legacy `*.chats`
   * ({@link IAgent.listLegacyChats}), restore them via the same path as the
   * new catalog, then write the orchestrator {@link PEER_CHATS_METADATA_KEY}
   * blob so subsequent restores read the new catalog and never consult the
   * legacy read again. No-op when the agent has no legacy enumeration or none
   * is persisted.
   */
  async _migrateLegacyPeerChats(agent, session) {
    const legacy = await agent.listLegacyChats?.(session);
    if (!legacy || legacy.length === 0) {
      await this._enqueuePeerChatCatalogWrite(session, () => []);
      return;
    }
    const entries = legacy.map((chat) => ({
      uri: chat.uri.toString(),
      ...chat.providerData !== void 0 ? { providerData: chat.providerData } : {}
    }));
    await this._restorePeerChatsFromCatalog(agent, session, entries);
    await this._enqueuePeerChatCatalogWrite(session, () => [...entries]);
  }
  /**
   * Restores a set of peer chats from an enumerated catalog. Loads each
   * chat's history in parallel (after re-attaching its backing) but restores
   * them in catalog order, so the catalog never reorders by which chat's
   * history/title happened to resolve first.
   */
  async _restorePeerChatsFromCatalog(agent, session, entries) {
    const restored = await Promise.all(entries.map(async (entry) => {
      let chatUri;
      try {
        chatUri = URI.parse(entry.uri);
      } catch (err) {
        this._logService.warn(`[AgentService] Skipping malformed persisted peer chat URI '${entry.uri}': ${toErrorMessage(err)}`);
        return void 0;
      }
      if (agent.materializeChat) {
        try {
          await agent.materializeChat(chatUri, entry.providerData);
        } catch (err) {
          this._logService.warn(`[AgentService] Failed to materialize peer chat ${entry.uri}: ${toErrorMessage(err)}`);
        }
      }
      let turns = [];
      try {
        turns = await this._getChatMessages(agent, chatUri);
      } catch (err) {
        this._logService.warn(`[AgentService] Failed to load history for peer chat ${chatUri.toString()}: ${toErrorMessage(err)}`);
      }
      const [title, draft] = await Promise.all([
        this._readPersistedChatTitle(session, chatUri),
        this._getChatDraft(session, chatUri)
      ]);
      const mergedTurns = await this._interleaveLocalTurns(session.toString(), chatUri.toString(), turns);
      return { chatUri, title, turns: mergedTurns, draft, providerData: entry.providerData, origin: entry.origin };
    }));
    for (const item of restored) {
      if (!item) {
        continue;
      }
      const { chatUri, title, turns, draft, providerData, origin } = item;
      this._stateManager.restoreChat(session.toString(), chatUri.toString(), {
        title,
        turns: [...turns],
        draft,
        ...providerData !== void 0 ? { providerData } : {},
        ...origin !== void 0 ? { origin } : {}
      });
    }
  }
  /**
   * Re-persists a peer chat's opaque `providerData` blob when the agent
   * reports it changed (e.g. per-chat model switch or fork remap).
   */
  _onChatDataChanged(e) {
    const sessionStr = parseDefaultChatUri(e.chat);
    if (sessionStr === void 0) {
      this._logService.warn(`[AgentService] onDidChangeChatData for malformed chat URI: ${e.chat.toString()}`);
      return;
    }
    void this._persistPeerChat(URI.parse(sessionStr), e.chat, e.providerData);
  }
  /**
   * Deterministic membership sequencer for agent-spawned chats,
   * driven off {@link IAgent.onDidSessionProgress}: a `subagent_started` adds
   * the subagent chat to the catalog via the same spawn-channel handler
   * ({@link _onChatSpawned}) used by {@link IAgent.onDidSpawnChat}.
   * A completed subagent chat stays live and subscribable, so completion is
   * not sequenced here; subagent chats are removed only on session teardown.
   * Registered before {@link AgentSideEffects} so the subagent chat exists
   * before its turn starts; addChat is idempotent so overlapping with the
   * agent's own spawn bridge is safe.
   */
  _sequenceSpawnedChat(signal) {
    const spawn = SubagentChatSignal.toSpawnEvent(signal);
    if (spawn) {
      this._onChatSpawned(spawn);
    }
  }
  /** Marks a subagent chat as pending once its confirmed tool call reaches (or is about to reach) `Running`. */
  _trackPendingSubagentChatFromEnvelope(envelope) {
    const { channel, action } = envelope;
    if (action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatToolCallDelta || action.type === ActionType.ChatToolCallReady) {
      const key = `${channel}:${action.toolCallId}`;
      const subagentChatUri = readToolCallMeta(action).subagentChatUri ?? this._pendingSubagentToolCalls.get(key);
      if (subagentChatUri === void 0) {
        return;
      }
      if (action.type === ActionType.ChatToolCallReady && action.confirmed) {
        this._pendingSubagentToolCalls.delete(key);
        this._armPendingSubagentChat(subagentChatUri);
        return;
      }
      this._pendingSubagentToolCalls.set(key, subagentChatUri);
      return;
    }
    if (action.type === ActionType.ChatToolCallConfirmed) {
      const key = `${channel}:${action.toolCallId}`;
      const subagentChatUri = this._pendingSubagentToolCalls.get(key);
      if (subagentChatUri === void 0) {
        return;
      }
      this._pendingSubagentToolCalls.delete(key);
      if (action.approved) {
        this._armPendingSubagentChat(subagentChatUri);
      }
      return;
    }
    if (action.type === ActionType.ChatToolCallComplete) {
      this._pendingSubagentToolCalls.delete(`${channel}:${action.toolCallId}`);
    }
  }
  _armPendingSubagentChat(subagentChatUri) {
    if (this._pendingSubagentChats.has(subagentChatUri) || this._stateManager.getSnapshot(subagentChatUri)) {
      return;
    }
    const deferred = new DeferredPromise();
    this._pendingSubagentChats.set(subagentChatUri, deferred);
    this._pendingSubagentChatTimeouts.set(subagentChatUri, disposableTimeout(() => {
      this._pendingSubagentChats.delete(subagentChatUri);
      this._pendingSubagentChatTimeouts.deleteAndDispose(subagentChatUri);
      deferred.complete();
    }, SUBAGENT_CHAT_PENDING_TIMEOUT_MS));
  }
  _resolvePendingSubagentChat(resource) {
    const deferred = this._pendingSubagentChats.get(resource);
    if (!deferred) {
      return;
    }
    this._pendingSubagentChats.delete(resource);
    this._pendingSubagentChatTimeouts.deleteAndDispose(resource);
    deferred.complete();
  }
  /**
   * Routes an agent-spawned chat (e.g. a sub-agent delegated by a tool
   * call) straight into the chat catalog via {@link IAgentHostStateManager.addChat},
   * so harness-spawned chats and user-driven chats share ONE membership path.
   * The {@link IAgentSpawnChatEvent.parent} spawn edge is recorded as
   * the chat's {@link ChatOriginKind.Tool} origin. Spawned chats are
   * not written to the orchestrator's persisted peer-chat catalog — they are
   * transient children re-derived from the parent's event log on restore.
   */
  _onChatSpawned(e) {
    this._stateManager.addChat(e.session.toString(), e.chat.toString(), {
      ...e.title !== void 0 ? { title: e.title } : {},
      ...e.parent ? {
        origin: { kind: ChatOriginKind.Tool, chat: e.parent.chat.toString(), toolCallId: e.parent.toolCallId },
        // Subagent worker chats are observable but not directly steerable:
        // the user watches them and steers the lead chat. Mark read-only so
        // the UI hides the composer and shows a lock (the agent-team pattern).
        interactivity: ChatInteractivity.ReadOnly
      } : {}
    });
    this._resolvePendingSubagentChat(e.chat.toString());
  }
  /**
   * Reads the orchestrator's persisted peer-chat catalog for a session.
   * Returns `undefined` when the session has no catalog yet (a legacy session
   * predating orchestrator-owned persistence, or a corrupt blob); the caller
   * then performs a one-time migration from the agent's legacy `*.chats`
   * enumeration (see {@link _restorePeerChats} / {@link _migrateLegacyPeerChats}).
   * An empty array means the session is known to have no peer chats, so
   * migration is skipped.
   */
  async _readPersistedPeerChatCatalog(session) {
    const ref = await this._sessionDataService.tryOpenDatabase?.(session);
    if (!ref) {
      return void 0;
    }
    try {
      const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
      if (raw === void 0) {
        return void 0;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}`);
        return void 0;
      }
      return parsed.filter((entry) => typeof entry?.uri === "string").map((entry) => ({
        uri: entry.uri,
        ...typeof entry.providerData === "string" ? { providerData: entry.providerData } : {},
        ...entry.origin !== void 0 ? { origin: entry.origin } : {}
      }));
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to read peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
      return void 0;
    } finally {
      ref.dispose();
    }
  }
  /**
   * Marks a peer chat's backing SDK session (in that session's own DB) so
   * {@link listSessions} filters it out of the top-level session list. The
   * marker is persisted, so it survives a host restart. Best-effort: a failure
   * only means the backing session may transiently reappear in the list.
   */
  _markPeerChatBacking(backingSession, chat) {
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(backingSession);
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to open backing session database to mark peer-chat backing for ${backingSession.toString()}: ${toErrorMessage(err)}`);
      return;
    }
    ref.object.setMetadata(PEER_CHAT_BACKING_METADATA_KEY, chat.toString()).catch((err) => {
      this._logService.warn(`[AgentService] Failed to mark peer-chat backing for ${backingSession.toString()}: ${toErrorMessage(err)}`);
    }).finally(() => {
      ref.dispose();
    });
  }
  /**
   * Inserts or updates a single peer chat in the orchestrator's persisted
   * catalog, recording its opaque `providerData` verbatim (or clearing it when
   * `undefined`). When `origin` is supplied it is stored as the chat's
   * provenance; when omitted (e.g. a provider-driven `providerData` refresh via
   * {@link _onChatDataChanged}) any previously persisted origin is preserved so
   * a data refresh never drops a side chat's source boundary. Serialized per
   * session via {@link _enqueuePeerChatCatalogWrite}.
   */
  _persistPeerChat(session, chat, providerData, origin) {
    const chatUri = chat.toString();
    return this._enqueuePeerChatCatalogWrite(session, (entries) => {
      const existing = entries.find((entry) => entry.uri === chatUri);
      const effectiveOrigin = origin ?? existing?.origin;
      const next = entries.filter((entry) => entry.uri !== chatUri);
      next.push({
        uri: chatUri,
        ...providerData !== void 0 ? { providerData } : {},
        ...effectiveOrigin !== void 0 ? { origin: effectiveOrigin } : {}
      });
      return next;
    });
  }
  /**
   * Removes a peer chat from the orchestrator's persisted catalog. Serialized
   * per session via {@link _enqueuePeerChatCatalogWrite}.
   */
  _removePersistedPeerChat(session, chat) {
    const chatUri = chat.toString();
    return this._enqueuePeerChatCatalogWrite(session, (entries) => entries.filter((entry) => entry.uri !== chatUri));
  }
  /**
   * Chains a read-modify-write of a session's persisted peer-chat catalog
   * behind any in-flight write for the same session, so concurrent
   * create/dispose/data-change updates can't clobber each other.
   */
  _enqueuePeerChatCatalogWrite(session, mutate) {
    const key = session.toString();
    const previous = this._peerChatCatalogWrites.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {
    }).then(() => this._applyPeerChatCatalogWrite(session, mutate));
    this._peerChatCatalogWrites.set(key, next.finally(() => {
      if (this._peerChatCatalogWrites.get(key) === next) {
        this._peerChatCatalogWrites.delete(key);
      }
    }));
    return next;
  }
  async _applyPeerChatCatalogWrite(session, mutate) {
    const ref = await this._sessionDataService.tryOpenDatabase?.(session);
    if (!ref) {
      return;
    }
    try {
      let current = [];
      try {
        const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
        if (raw !== void 0) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            current = parsed.filter((entry) => typeof entry?.uri === "string").map((entry) => ({
              uri: entry.uri,
              ...typeof entry.providerData === "string" ? { providerData: entry.providerData } : {},
              ...entry.origin !== void 0 ? { origin: entry.origin } : {}
            }));
          }
        }
      } catch (err) {
        this._logService.warn(`[AgentService] Replacing malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
      }
      const updated = mutate(current);
      await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(updated));
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to persist peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
    } finally {
      ref.dispose();
    }
  }
  /** Reads a chat's persisted custom title (default or peer chat), if any. */
  async _readPersistedChatTitle(session, chatUri) {
    const ref = await this._sessionDataService.tryOpenDatabase?.(session);
    if (!ref) {
      return void 0;
    }
    try {
      return await ref.object.getMetadata(`customChatTitle:${chatUri.toString()}`) ?? void 0;
    } catch {
      return void 0;
    } finally {
      ref.dispose();
    }
  }
  async _getChatDraft(session, chatUri) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return void 0;
    }
    try {
      return await ref.object.getChatDraft(chatUri);
    } finally {
      ref.dispose();
    }
  }
  async _getSessionMetadataForRestore(agent, session) {
    const sessionStr = session.toString();
    if (agent.getSessionMetadata) {
      try {
        return await this._withWorktreeProject(session, await agent.getSessionMetadata(session));
      } catch (err) {
        if (err instanceof ProtocolError) {
          throw err;
        }
        try {
          return await this._withWorktreeProject(session, await this._getSessionMetadataFromCatalog(agent, session));
        } catch (fallbackErr) {
          if (fallbackErr instanceof ProtocolError) {
            const message = err instanceof Error ? err.message : String(err);
            throw new ProtocolError(fallbackErr.code, `Failed to get session metadata for ${sessionStr}: ${message}; ${fallbackErr.message}`, fallbackErr.data);
          }
          throw fallbackErr;
        }
      }
    }
    return this._withWorktreeProject(session, await this._getSessionMetadataFromCatalog(agent, session));
  }
  /**
   * Merges the repository project for a worktree-isolated session onto its
   * restored metadata so the session groups under the repository (not the
   * `<repo>.worktrees/<name>` directory) in the sessions UI. No-op for folder
   * sessions and for `undefined` metadata. Host-owned so agents stay unaware.
   */
  async _withWorktreeProject(session, meta) {
    if (!meta || !this._worktree) {
      return meta;
    }
    const project = await this._worktree.resolveWorktreeProject(session);
    return project ? { ...meta, project } : meta;
  }
  async _getSessionMetadataFromCatalog(agent, session) {
    const sessionStr = session.toString();
    let allSessions;
    try {
      allSessions = await agent.listSessions();
    } catch (err) {
      if (err instanceof ProtocolError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to list sessions for ${sessionStr}: ${message}`);
    }
    return allSessions.find((s) => s.session.toString() === sessionStr);
  }
  async resourceRead(uri) {
    const editAttributionRequest = parseEditAttributionResource(uri);
    if (editAttributionRequest?.kind === "prepare") {
      const prepared = await this.prepareEditAttributionFlush(editAttributionRequest.params);
      return {
        data: JSON.stringify(prepared ?? null),
        encoding: ContentEncoding.Utf8,
        contentType: "application/json"
      };
    }
    if (editAttributionRequest?.kind === "commit") {
      const result = await this.commitEditAttributionFlush(editAttributionRequest.params);
      return {
        data: JSON.stringify(result),
        encoding: ContentEncoding.Utf8,
        contentType: "application/json"
      };
    }
    if (editAttributionRequest?.kind === "cancel") {
      const result = await this.cancelEditAttributionFlush(editAttributionRequest.params);
      return {
        data: JSON.stringify(result),
        encoding: ContentEncoding.Utf8,
        contentType: "application/json"
      };
    }
    const dbFields = parseSessionDbUri(uri.toString());
    if (dbFields) {
      return this._fetchSessionDbContent(dbFields);
    }
    const blobFields = parseGitBlobUri(uri.toString());
    if (blobFields) {
      return this._fetchGitBlobContent(blobFields);
    }
    try {
      const content = await this._fileService.readFile(uri);
      return {
        data: content.value.toString(),
        encoding: ContentEncoding.Utf8,
        contentType: "text/plain"
      };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const result = toFileOperationResult(error);
      if (result === FileOperationResult.FILE_NOT_FOUND) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
      }
      throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to read content: ${uri.toString()}: ${toErrorMessage(error)}`);
    }
  }
  prepareEditAttributionFlush(params) {
    return this._editAttributionService?.prepareFlush(params) ?? Promise.resolve(void 0);
  }
  commitEditAttributionFlush(params) {
    return this._editAttributionService?.commitFlush(params) ?? Promise.resolve({ outcome: "missing", agentModifiedCount: 0 });
  }
  cancelEditAttributionFlush(params) {
    return this._editAttributionService?.cancelFlush(params) ?? Promise.resolve({ outcome: "missing", agentModifiedCount: 0 });
  }
  async resourceWrite(params) {
    const fileUri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      const parent = await this._fileService.stat(resourcesDirname(fileUri));
      if (!parent.isDirectory) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
      }
    } catch (e) {
      if (e instanceof ProtocolError) {
        throw e;
      }
      const result = toFileOperationResult(e);
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
    }
    let content;
    if (params.encoding === ContentEncoding.Base64) {
      content = decodeBase64(params.data);
    } else {
      content = VSBuffer.fromString(params.data);
    }
    const mode = params.mode ?? ResourceWriteMode.Truncate;
    const position = params.position ?? 0;
    try {
      await this._resourceWriteQueue.queueFor(fileUri, async () => {
        if (params.ifMatch !== void 0 || mode !== ResourceWriteMode.Truncate || position !== 0) {
          await this._resourceWriteWithMode(fileUri, content, mode, position, params);
        } else if (params.createOnly) {
          await this._createFileExclusive(fileUri, content);
        } else {
          await this._fileService.writeFile(fileUri, content);
        }
      }, extUriBiasedIgnorePathCase);
      return {};
    } catch (e) {
      if (e instanceof ProtocolError) {
        throw e;
      }
      const result = toFileOperationResult(e);
      if (params.createOnly && (result === FileOperationResult.FILE_MODIFIED_SINCE || result === FileOperationResult.FILE_MOVE_CONFLICT)) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
      }
      if (result === FileOperationResult.FILE_MODIFIED_SINCE) {
        const message = params.ifMatch !== void 0 ? `ifMatch precondition failed for: ${fileUri.toString()}` : `File changed while writing: ${fileUri.toString()}`;
        throw new ProtocolError(AhpErrorCodes.Conflict, message);
      }
      if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to write file: ${fileUri.toString()}`);
    }
  }
  async _createFileExclusive(fileUri, content) {
    if (fileUri.scheme !== Schemas.file) {
      await this._fileService.createFile(fileUri, content, { overwrite: false });
      return;
    }
    let handle;
    try {
      handle = await open(fileUri.fsPath, "wx");
    } catch (error) {
      if (isErrorWithCode(error, "EEXIST")) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
      }
      throw error;
    }
    let failure;
    try {
      await handle.writeFile(content.buffer);
    } catch (error) {
      failure = error;
    }
    try {
      await handle.close();
    } catch (error) {
      failure = failure ? new AggregateError([failure, error]) : error;
    }
    if (failure) {
      try {
        await unlink(fileUri.fsPath);
      } catch (cleanupError) {
        throw new AggregateError([failure, cleanupError], `Failed to create and clean up file: ${fileUri.toString()}`);
      }
      throw failure;
    }
  }
  /**
   * Slow-path for {@link resourceWrite} when the caller requested a
   * non-default {@link ResourceWriteMode}, supplied a `position`, or
   * provided an `ifMatch` etag precondition. Reads the current file
   * contents (when needed) and produces a single `writeFile` call that
   * realises the requested splice. A missing file is treated as
   * empty for `append` and `insert` (so the operation behaves like a
   * create); for `truncate` it falls through to a normal write.
   */
  async _resourceWriteWithMode(fileUri, data, mode, position, params) {
    let existing;
    let currentEtag;
    let currentMtime;
    try {
      const file = await this._fileService.readFile(fileUri);
      existing = file.value;
      currentEtag = file.etag;
      currentMtime = file.mtime;
    } catch (e) {
      if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
        throw e;
      }
    }
    if (params.createOnly && existing !== void 0) {
      throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
    }
    if (params.ifMatch !== void 0) {
      if (existing === void 0 || currentEtag !== params.ifMatch) {
        throw new ProtocolError(AhpErrorCodes.Conflict, `ifMatch precondition failed for: ${fileUri.toString()}`);
      }
    }
    const base = existing ?? VSBuffer.alloc(0);
    let next;
    switch (mode) {
      case ResourceWriteMode.Append: {
        const eof = base.byteLength;
        const splitAt = Math.max(0, eof - position);
        next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, eof)]);
        break;
      }
      case ResourceWriteMode.Insert: {
        const splitAt = Math.min(position, base.byteLength);
        next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, base.byteLength)]);
        break;
      }
      case ResourceWriteMode.Truncate:
      default: {
        const splitAt = Math.min(position, base.byteLength);
        next = VSBuffer.concat([base.slice(0, splitAt), data]);
        break;
      }
    }
    if (params.createOnly) {
      await this._createFileExclusive(fileUri, next);
    } else {
      await this._fileService.writeFile(fileUri, next, { etag: currentEtag, mtime: currentMtime });
    }
  }
  async resourceCopy(params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    try {
      await this._fileService.copy(source, destination, !params.failIfExists);
      return {};
    } catch (e) {
      const result = toFileOperationResult(e);
      if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
    }
  }
  async resourceDelete(params) {
    const fileUri = URI.parse(params.uri);
    try {
      await this._fileService.del(fileUri, { recursive: params.recursive });
      return {};
    } catch (e) {
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${fileUri.toString()}`);
    }
  }
  async resourceMove(params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    try {
      await this._fileService.move(source, destination, !params.failIfExists);
      return {};
    } catch (e) {
      const result = toFileOperationResult(e);
      if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
    }
  }
  async resourceResolve(params) {
    const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      const stat = await this._fileService.stat(uri);
      let type;
      if (stat.isSymbolicLink && params.followSymlinks === false) {
        type = ResourceType.Symlink;
      } else if (stat.isDirectory) {
        type = ResourceType.Directory;
      } else {
        type = ResourceType.File;
      }
      const result = {
        uri: uri.toString(),
        type,
        ...stat.size !== void 0 ? { size: stat.size } : {},
        ...stat.mtime !== void 0 ? { mtime: new Date(stat.mtime).toISOString() } : {},
        ...stat.ctime !== void 0 ? { ctime: new Date(stat.ctime).toISOString() } : {},
        ...stat.etag ? { etag: stat.etag } : {}
      };
      return result;
    } catch (e) {
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${uri.toString()}`);
    }
  }
  async resourceMkdir(params) {
    const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      const existing = await this._fileService.stat(uri).catch(() => void 0);
      if (existing && !existing.isDirectory) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Path exists and is not a directory: ${uri.toString()}`);
      }
      await this._fileService.createFolder(uri);
      return {};
    } catch (e) {
      if (e instanceof ProtocolError) {
        throw e;
      }
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to create directory: ${uri.toString()}`);
    }
  }
  async createResourceWatch(params) {
    const root = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      await this._fileService.stat(root);
    } catch (e) {
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${root.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${root.toString()}`);
    }
    const channel = buildResourceWatchChannelUri({
      root: root.toString(),
      recursive: params.recursive === true,
      excludes: params.excludes,
      includes: params.includes
    });
    return { channel };
  }
  /**
   * Notifies the agent service that a client subscribed to a resource
   * watch channel. On the first subscriber the underlying
   * {@link IFileService} watcher is attached; subsequent subscribers
   * bump the refcount and cancel any pending grace dispose. Returns
   * the decoded descriptor for use as the subscribe snapshot, or
   * `undefined` when `channel` is not a recognisable
   * `ahp-resource-watch:` URI.
   */
  onResourceWatchSubscribed(channel) {
    const descriptor = parseResourceWatchChannelUri(channel);
    if (!descriptor) {
      return void 0;
    }
    const existing = this._resourceWatches.get(channel);
    if (existing) {
      existing.subscribers++;
      if (existing.pendingGc) {
        existing.pendingGc.clear();
      }
      return existing.descriptor;
    }
    const disposables = new DisposableStore();
    try {
      const root = URI.parse(descriptor.root);
      const watchOptions = {
        recursive: descriptor.recursive,
        excludes: descriptor.excludes?.items ?? [],
        includes: descriptor.includes?.items
      };
      if (descriptor.recursive) {
        disposables.add(this._fileService.watch(root, watchOptions));
        disposables.add(this._fileService.onDidFilesChange((event) => {
          const filtered = collectChangesUnderRoot(event, root);
          if (filtered.length > 0) {
            this._dispatchResourceWatchChanges(channel, filtered);
          }
        }));
      } else {
        const watcher = this._fileService.createWatcher(root, { ...watchOptions, recursive: false });
        disposables.add(watcher);
        disposables.add(watcher.onDidChange((event) => {
          this._dispatchResourceWatchChanges(channel, collectChanges(event));
        }));
      }
    } catch (e) {
      disposables.dispose();
      this._logService.warn(`[AgentService] Failed to start IFileService watcher for ${channel}: ${e instanceof Error ? e.message : String(e)}`);
      return void 0;
    }
    this._resourceWatches.set(channel, {
      channel,
      descriptor,
      subscribers: 1,
      disposables,
      pendingGc: disposables.add(new MutableDisposable()),
      dispose: () => disposables.dispose()
    });
    return descriptor;
  }
  /**
   * Counterpart to {@link onResourceWatchSubscribed}. Decrements the
   * subscriber refcount for a watch channel; when it reaches zero the
   * watcher is held for {@link RESOURCE_WATCH_GRACE_MS} before being
   * disposed, giving a transient disconnect time to resubscribe.
   */
  onResourceWatchUnsubscribed(channel) {
    const entry = this._resourceWatches.get(channel);
    if (!entry) {
      return false;
    }
    entry.subscribers = Math.max(0, entry.subscribers - 1);
    if (entry.subscribers > 0) {
      return true;
    }
    entry.pendingGc.value = disposableTimeout(() => {
      const current = this._resourceWatches.get(channel);
      if (!current || current.subscribers > 0) {
        return;
      }
      this._resourceWatches.deleteAndDispose(channel);
    }, RESOURCE_WATCH_GRACE_MS);
    return true;
  }
  _dispatchResourceWatchChanges(channel, raw) {
    if (raw.length === 0) {
      return;
    }
    const items = raw.map((c) => ({
      uri: c.resource.toString(),
      type: c.type === FileChangeType.ADDED ? ResourceChangeType.Added : c.type === FileChangeType.DELETED ? ResourceChangeType.Deleted : ResourceChangeType.Updated
    }));
    this._stateManager.dispatchServerAction(channel, {
      type: ActionType.ResourceWatchChanged,
      changes: { items }
    });
  }
  async shutdown() {
    this._logService.info("AgentService: shutting down all providers...");
    const promises = [];
    for (const provider of this._providers.values()) {
      promises.push(provider.shutdown());
    }
    await Promise.all(promises);
    await this._worktree?.removeAllCreatedWorktrees();
    this._sessionToProvider.clear();
    this._downloadProgressInterest.clear();
  }
  /**
   * Wire the network diagnostics service backing {@link getNetworkDiagnosticsInfo}
   * and {@link diagnosticsFetch}. A setter rather than a constructor argument
   * because the service depends on the agent-host proxy resolver, which the
   * remote server constructs lazily — after this service.
   */
  setNetworkDiagnosticsService(service) {
    this._networkDiagnostics = service;
  }
  setEditAttributionService(service) {
    this._editAttributionService = service;
    service.setEnabled(this._stateManager.rootState.config?.values[AgentHostEditTelemetryEnabledConfigKey] !== false);
  }
  async getNetworkDiagnosticsInfo() {
    if (!this._networkDiagnostics) {
      throw new Error("Network diagnostics unavailable: service not wired");
    }
    const providers = [...this._providers.values()];
    const contributions = await Promise.all(providers.map(async (provider) => {
      try {
        return await provider.getNetworkDiagnosticsEndpoints?.() ?? [];
      } catch (error) {
        this._logService.warn(`[AgentService] Failed to resolve network diagnostics endpoints for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }));
    const accounts = await Promise.all(providers.map(async (provider) => {
      try {
        return await provider.getNetworkDiagnosticsAccount?.();
      } catch (error) {
        this._logService.warn(`[AgentService] Failed to resolve network diagnostics account for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
        return void 0;
      }
    }));
    const endpoints = [];
    const seen = /* @__PURE__ */ new Set();
    for (const endpoint of contributions.flat()) {
      let key;
      try {
        key = new URL(endpoint.url).toString();
      } catch {
        key = endpoint.url;
      }
      if (!seen.has(key)) {
        seen.add(key);
        endpoints.push(endpoint);
      }
    }
    return this._networkDiagnostics.getInfo(endpoints, accounts.find((account) => !!account));
  }
  async getManagedSettingsDiagnostics() {
    const providers = [...this._providers.values()].filter((provider) => provider.getManagedSettingsDiagnostics);
    return Promise.all(providers.map(async (provider) => {
      try {
        return { provider: provider.id, snapshot: await provider.getManagedSettingsDiagnostics() };
      } catch (error) {
        return { provider: provider.id, error: error instanceof Error ? error.message : String(error) };
      }
    }));
  }
  async diagnosticsFetch(url) {
    if (!this._networkDiagnostics) {
      throw new Error("Network diagnostics unavailable: service not wired");
    }
    return this._networkDiagnostics.fetch(url);
  }
  // ---- helpers ------------------------------------------------------------
  async _fetchSessionDbContent(fields) {
    const sessionUri = URI.parse(fields.sessionUri);
    const ref = this._sessionDataService.openDatabase(sessionUri);
    try {
      const content = await ref.object.readFileEditContent(fields.toolCallId, fields.filePath);
      if (!content) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
      }
      const bytes = fields.part === "before" ? content.beforeContent : content.afterContent;
      if (!bytes) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `No ${fields.part} content for: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
      }
      return {
        data: new TextDecoder().decode(bytes),
        encoding: ContentEncoding.Utf8,
        contentType: "text/plain"
      };
    } finally {
      ref.dispose();
    }
  }
  async _fetchGitBlobContent(fields) {
    if (!this._gitService) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `git service unavailable for: ${fields.repoRelativePath}`);
    }
    const workingDirectory = this._stateManager.getSessionState(fields.sessionUri)?.workingDirectories?.[0];
    if (!workingDirectory) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `Session has no working directory for git-blob URI: ${fields.sessionUri}`);
    }
    const blob = await this._gitService.showBlob(URI.parse(workingDirectory), fields.sha, fields.repoRelativePath);
    if (!blob) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `git blob not found: ${fields.sha}:${fields.repoRelativePath}`);
    }
    return {
      data: blob.toString(),
      encoding: ContentEncoding.Utf8,
      contentType: "text/plain"
    };
  }
  /**
   * Restores a subagent session from its parent session's event history.
   * Loads the parent's raw messages, filters for events belonging to
   * the subagent (by `parentToolCallId`), and builds the child session's
   * turns from those events.
   */
  async _restoreSubagentSession(subagentUri, parentSession) {
    if (this._stateManager.getSessionState(subagentUri)) {
      return;
    }
    const inFlight = this._restoreSubagentInFlight.get(subagentUri);
    if (inFlight) {
      return inFlight;
    }
    const restore = this._doRestoreSubagentSession(subagentUri, parentSession);
    this._restoreSubagentInFlight.set(subagentUri, restore);
    try {
      await restore;
    } finally {
      if (this._restoreSubagentInFlight.get(subagentUri) === restore) {
        this._restoreSubagentInFlight.delete(subagentUri);
      }
    }
  }
  async _doRestoreSubagentSession(subagentUri, parentSession) {
    const parentSessionKey = parentSession.toString();
    if (!this._stateManager.getSessionState(parentSessionKey)) {
      try {
        await this.restoreSession(parentSession);
      } catch {
        this._logService.warn(`[AgentService] Cannot restore parent session for subagent: ${parentSessionKey}`);
        return;
      }
    }
    const parentState = this._stateManager.getSessionState(parentSessionKey);
    if (!parentState) {
      return;
    }
    const allTurns = [...parentState.turns];
    if (parentState.activeTurn) {
      allTurns.push(parentState.activeTurn);
    }
    let subagentContent;
    for (const turn of allTurns) {
      for (const part of turn.responseParts) {
        if (part.kind === ResponsePartKind.ToolCall) {
          const tc = part.toolCall;
          const content = tc.status === ToolCallStatus.Completed ? tc.content : tc.status === ToolCallStatus.Running ? tc.content : void 0;
          if (content) {
            for (const c of content) {
              if (c.type === ToolResultContentType.Subagent && c.resource === subagentUri) {
                subagentContent = c;
                break;
              }
            }
          }
        }
      }
      if (subagentContent) {
        break;
      }
    }
    let childTurns = [];
    const agent = this._findProviderForSession(parentSession);
    if (agent) {
      try {
        childTurns = await this._getChatMessages(agent, URI.parse(subagentUri));
      } catch (err) {
        this._logService.warn(`[AgentService] Failed to load subagent turns for ${subagentUri}`, err);
      }
    }
    const title = subagentContent?.title ?? "Subagent";
    const subagentNow = (/* @__PURE__ */ new Date()).toISOString();
    const mergedChildTurns = await this._interleaveLocalTurns(parentSession.toString(), subagentUri, childTurns);
    this._stateManager.restoreSession(
      {
        resource: subagentUri,
        provider: "subagent",
        title,
        status: SessionStatus.Idle,
        createdAt: subagentNow,
        modifiedAt: subagentNow,
        ...parentState?.project ? { project: parentState.project } : {}
      },
      mergedChildTurns
    );
    this._logService.info(`[AgentService] Restored subagent session: ${subagentUri} with ${childTurns.length} turn(s)`);
  }
  /**
   * Registers a subagent child session's state up-front from data the agent
   * already reconstructed for the parent, so a later subscribe-driven
   * {@link _restoreSubagentSession} finds it present and returns early
   * instead of re-reading the parent event log. No-op if already registered.
   */
  _registerRestoredSubagent(child, parentSummary, parentSessionStr) {
    const resourceStr = child.resource.toString();
    if (this._stateManager.getSessionState(resourceStr)) {
      return;
    }
    const registeredNow = (/* @__PURE__ */ new Date()).toISOString();
    this._stateManager.restoreSession(
      {
        resource: resourceStr,
        provider: "subagent",
        title: child.title,
        status: SessionStatus.Idle,
        createdAt: registeredNow,
        modifiedAt: registeredNow,
        ...parentSummary.project ? { project: parentSummary.project } : {}
      },
      [...child.turns]
    );
    const subagentChatUri = buildSubagentChatUri(parentSessionStr, child.toolCallId);
    this._stateManager.addChat(parentSessionStr, subagentChatUri, {
      title: child.title,
      turns: [...child.turns],
      origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(parentSessionStr), toolCallId: child.toolCallId },
      interactivity: ChatInteractivity.ReadOnly
    });
  }
  _findProviderForSession(session) {
    const key = typeof session === "string" ? session : session.toString();
    const providerId = this._sessionToProvider.get(key);
    if (providerId) {
      return this._providers.get(providerId);
    }
    const schemeProvider = AgentSession.provider(session);
    if (schemeProvider) {
      return this._providers.get(schemeProvider);
    }
    if (this._defaultProvider) {
      return this._providers.get(this._defaultProvider);
    }
    return void 0;
  }
  /**
   * Sets the agents observable to trigger model re-fetch and
   * `root/agentsChanged` via the autorun in {@link AgentSideEffects}.
   */
  _updateAgents() {
    this._agents.set([...this._providers.values()], void 0);
  }
  dispose() {
    for (const provider of this._providers.values()) {
      provider.dispose();
    }
    this._providers.clear();
    super.dispose();
  }
}
function isErrorWithCode(error, code) {
  return error instanceof Error && hasErrorCode(error, code);
}
function hasErrorCode(error, code) {
  return hasKey(error, { code: true }) && error.code === code;
}
function collectChanges(event) {
  const out = [];
  for (const resource of event.rawAdded) {
    out.push({ resource, type: FileChangeType.ADDED });
  }
  for (const resource of event.rawUpdated) {
    out.push({ resource, type: FileChangeType.UPDATED });
  }
  for (const resource of event.rawDeleted) {
    out.push({ resource, type: FileChangeType.DELETED });
  }
  return out;
}
function collectChangesUnderRoot(event, root) {
  const out = [];
  const accept = (resource, type) => {
    if (isEqualOrParent(resource, root)) {
      out.push({ resource, type });
    }
  };
  for (const resource of event.rawAdded) {
    accept(resource, FileChangeType.ADDED);
  }
  for (const resource of event.rawUpdated) {
    accept(resource, FileChangeType.UPDATED);
  }
  for (const resource of event.rawDeleted) {
    accept(resource, FileChangeType.DELETED);
  }
  return out;
}
export {
  AgentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9wZW4sIHVubGluaywgdHlwZSBGaWxlSGFuZGxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCBSZXNvdXJjZVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVSZXNvdXJjZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUsIFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGdldEV4dGVuc2lvbkZvck1pbWVUeXBlLCBnZXRNZWRpYU1pbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgYXMgcmVzb3VyY2VzRGlybmFtZSwgZXh0bmFtZSBhcyByZXNvdXJjZXNFeHRuYW1lLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSwgaXNFcXVhbCwgaXNFcXVhbE9yUGFyZW50LCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVDaGFuZ2UsIElGaWxlU2VydmljZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0LCB0eXBlIEZpbGVDaGFuZ2VzRXZlbnQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRQcm92aWRlciwgQWdlbnRTZXNzaW9uLCBBZ2VudFNpZ25hbCwgQWdlbnRIb3N0U2Vzc2lvblJlbGVhc2VHcmFjZU1zRW52VmFyLCBJQWdlbnQsIElBZ2VudENoYXREYXRhQ2hhbmdlLCBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucywgSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCwgSUFnZW50Q3JlYXRlQ2hhdFNpZGVDaGF0U2VsZWN0aW9uLCBJQWdlbnRDcmVhdGVDaGF0U2lkZUNoYXRTb3VyY2UsIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQsIElBZ2VudEhvc3RBdXRoVG9rZW5SZXF1ZXN0LCBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MsIElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvLCBJQWdlbnRIb3N0TmV0d29ya0VuZHBvaW50LCBJQWdlbnRIb3N0TmV0d29ya0ZldGNoUmVzdWx0LCBJQWdlbnRNYXRlcmlhbGl6ZVNlc3Npb25FdmVudCwgSUFnZW50TW9kZWxJbmZvLCBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcywgSUFnZW50U2VydmljZSwgSUFnZW50U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIElBZ2VudFNwYXduQ2hhdEV2ZW50LCBBdXRoZW50aWNhdGVQYXJhbXMsIEF1dGhlbnRpY2F0ZVJlc3VsdCwgSU1jcE5vdGlmaWNhdGlvbiwgSVJlc3RvcmVkU3ViYWdlbnRTZXNzaW9uLCBTdWJhZ2VudENoYXRTaWduYWwgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHR5cGUgSVNlc3Npb25EYXRhYmFzZSwgSVNlc3Npb25EYXRhU2VydmljZSwgU0VTU0lPTl9BVFRBQ0hNRU5UU19ESVJOQU1FIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBJQ2FuY2VsRWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMsIElDb21taXRFZGl0QXR0cmlidXRpb25GbHVzaFBhcmFtcywgSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0LCBJUHJlcGFyZUVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zLCBJUHJlcGFyZWRFZGl0QXR0cmlidXRpb25GbHVzaCwgcGFyc2VFZGl0QXR0cmlidXRpb25SZXNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9maWxlRWRpdEF0dHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3NSZWdpc3RyYXRpb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgcGFyc2VDaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIEFjdGlvbkVudmVsb3BlLCBBdXRoUmVxdWlyZWRSZWFzb24sIElOb3RpZmljYXRpb24sIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIHR5cGUgU2Vzc2lvbkFjdGlvbiwgdHlwZSBUZXJtaW5hbEFjdGlvbiwgdHlwZSBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiwgdHlwZSBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBDb21wbGV0aW9uc1BhcmFtcywgQ29tcGxldGlvbnNSZXN1bHQsIENyZWF0ZVRlcm1pbmFsUGFyYW1zLCBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCwgU2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0LCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25QYXJhbXMsIEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1jaGFuZ2VzZXQvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWhwRXJyb3JDb2RlcywgQUhQX1NFU1NJT05fTk9UX0ZPVU5ELCBDb250ZW50RW5jb2RpbmcsIEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SLCBQcm90b2NvbEVycm9yLCBSZXNvdXJjZUNoYW5nZVR5cGUsIFJlc291cmNlVHlwZSwgUmVzb3VyY2VXcml0ZU1vZGUsIHR5cGUgQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcywgdHlwZSBDcmVhdGVSZXNvdXJjZVdhdGNoUmVzdWx0LCB0eXBlIERpcmVjdG9yeUVudHJ5LCB0eXBlIFJlc291cmNlQ29weVBhcmFtcywgdHlwZSBSZXNvdXJjZUNvcHlSZXN1bHQsIHR5cGUgUmVzb3VyY2VEZWxldGVQYXJhbXMsIHR5cGUgUmVzb3VyY2VEZWxldGVSZXN1bHQsIHR5cGUgUmVzb3VyY2VMaXN0UmVzdWx0LCB0eXBlIFJlc291cmNlTWtkaXJQYXJhbXMsIHR5cGUgUmVzb3VyY2VNa2RpclJlc3VsdCwgdHlwZSBSZXNvdXJjZU1vdmVQYXJhbXMsIHR5cGUgUmVzb3VyY2VNb3ZlUmVzdWx0LCB0eXBlIFJlc291cmNlUmVhZFJlc3VsdCwgdHlwZSBSZXNvdXJjZVJlc29sdmVQYXJhbXMsIHR5cGUgUmVzb3VyY2VSZXNvbHZlUmVzdWx0LCB0eXBlIFJlc291cmNlV2F0Y2hTdGF0ZSwgdHlwZSBSZXNvdXJjZVdyaXRlUGFyYW1zLCB0eXBlIFJlc291cmNlV3JpdGVSZXN1bHQsIHR5cGUgSVN0YXRlU25hcHNob3QgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IENoYW5nZXNTdW1tYXJ5LCBDaGF0SW50ZXJhY3Rpdml0eSwgQ2hhdE9yaWdpbktpbmQsIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgdHlwZSBDaGF0T3JpZ2luLCB0eXBlIE1lc3NhZ2UsIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZVJlc291cmNlQXR0YWNobWVudCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IENoYXRQZW5kaW5nTWVzc2FnZVNldEFjdGlvbiwgQ2hhdFR1cm5TdGFydGVkQWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25HaXRIdWJTdGF0ZSwgSVNlc3Npb25HaXRTdGF0ZSwgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFNFU1NJT05fTUVUQV9HSVRIVUJfS0VZLCBTRVNTSU9OX01FVEFfR0lUX0tFWSwgcmVhZFNlc3Npb25TcGF3bkRlcHRoLCB3aXRoU2Vzc2lvblNwYXduRGVwdGgsIFNlc3Npb25TdGF0dXMsIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIEFIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVksIEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLCBBSF9NRVRBX0lTX0RPTkVfREJfS0VZLCBBSF9NRVRBX0lTX1JFQURfREJfS0VZLCBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIGJ1aWxkUmVzb3VyY2VXYXRjaENoYW5uZWxVcmksIGJ1aWxkU3ViYWdlbnRDaGF0VXJpLCBidWlsZFN1YmFnZW50U2Vzc2lvblVyaVByZWZpeCwgaG9zdEJ1aWxkSW5mb0Zyb21Qcm9kdWN0LCBpc0FocENoYXRDaGFubmVsLCBpc0RlZmF1bHRDaGF0VXJpLCBpc1N1YmFnZW50Q2hhdFVyaSwgaXNTdWJhZ2VudFNlc3Npb24sIHBhcnNlRGVmYXVsdENoYXRVcmksIHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmksIHBhcnNlUmVzb3VyY2VXYXRjaENoYW5uZWxVcmksIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpLCByZWFkU2Vzc2lvbkdpdFN0YXRlLCByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MsIHdpdGhTZXNzaW9uR2l0SHViU3RhdGUsIHdpdGhTZXNzaW9uR2l0U3RhdGUsIHdpdGhTZXNzaW9uU3RhdHVzRmxhZywgd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCB0eXBlIFNlc3Npb25Db25maWdTdGF0ZSwgdHlwZSBTZXNzaW9uU3VtbWFyeSwgdHlwZSBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50LCB0eXBlIFR1cm4sIHR5cGUgVXNhZ2VJbmZvLCBjaGF0U3RvcmFnZVVyaSwgaGFzUmVwb3J0ZWRVc2FnZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSB9IGZyb20gJy4uL2NvbW1vbi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkQm91bmRlZFNpZGVDaGF0U291cmNlQ29udGV4dCwgZ2V0U2lkZUNoYXRQYXJ0aWFsUmVzcG9uc2UgfSBmcm9tICcuL2FnZW50UGVlckNoYXRzLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGJVcmlGaWVsZHMsIHBhcnNlU2Vzc2lvbkRiVXJpIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYlVyaS5qcyc7XG5pbXBvcnQgeyBJR2l0QmxvYlVyaUZpZWxkcywgcGFyc2VHaXRCbG9iVXJpIH0gZnJvbSAnLi9naXREaWZmQ29udGVudC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSwgdHJ5UmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNpZGVFZmZlY3RzIH0gZnJvbSAnLi9hZ2VudFNpZGVFZmZlY3RzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdExvY2FsVHVybnMgfSBmcm9tICcuL2FnZW50SG9zdExvY2FsVHVybnMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2ZXJUb29sSG9zdCB9IGZyb20gJy4vc2hhcmVkL2FnZW50U2VydmVyVG9vbEhvc3QuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXJ2ZXJUb29sR3JvdXBzIH0gZnJvbSAnLi9zaGFyZWQvc2VydmVyVG9vbEdyb3Vwcy5qcyc7XG5pbXBvcnQgeyB0eXBlIElDaGF0Q29udGV4dFNuYXBzaG90LCB0eXBlIElTZXNzaW9uU2VydmVyVG9vbEFjY2Vzc29yIH0gZnJvbSAnLi9zaGFyZWQvc2Vzc2lvblNlcnZlclRvb2xzLmpzJztcblxuaW1wb3J0IHsgV29ya3RyZWVJc29sYXRpb24sIFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09ULCB3b3JrdHJlZVByb2plY3RGcm9tUmVwb3NpdG9yeVJvb3QgfSBmcm9tICcuL3NoYXJlZC93b3JrdHJlZUlzb2xhdGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSwgSUFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0UmV2aWV3U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RSZXZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYW5nZXNldENvb3JkaW5hdG9yIH0gZnJvbSAnLi9hZ2VudEhvc3RDaGFuZ2VzZXRDb29yZGluYXRvci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9ucywgSUFnZW50SG9zdENvbXBsZXRpb25zIH0gZnJvbSAnLi9hZ2VudEhvc3RDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDaGF0Q29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RDaGF0Q29tcGxldGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEZpbGVDb21wbGV0aW9uUHJvdmlkZXIgfSBmcm9tICcuL2FnZW50SG9zdEZpbGVDb21wbGV0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVuYW1lQ29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RSZW5hbWVDb21tYW5kLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RTa2lsbENvbXBsZXRpb25Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyB9IGZyb20gJy4vYWdlbnRIb3N0V29ya3NwYWNlRmlsZXMuanMnO1xuaW1wb3J0IHsgQ29waWxvdEFwaVNlcnZpY2UsIElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlIH0gZnJvbSAnLi9uZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlTWNwQ2hhbm5lbFVyaSB9IGZyb20gJy4vc2hhcmVkL21jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IHRvQWdlbnRDbGllbnRVcmkgfSBmcm9tICcuLi9jb21tb24vYWdlbnRDbGllbnRVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLCBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RBdXRoZW50aWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdXBkYXRlQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxGcm9tQ29uZmlnIH0gZnJvbSAnLi9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEVkaXRUZWxlbWV0cnlFbmFibGVkQ29uZmlnS2V5IH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPY3RvS2l0U2VydmljZSwgSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIH0gZnJvbSAnLi9zaGFyZWQvYWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UsIENIQU5HRVNFVF9EQl9NRVRBREFUQV9LRVlTLCBNRVRBX0NIQU5HRVNfU1VNTUFSWSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHSVRfREJfTUVUQURBVEFfS0VZUywgSUFnZW50SG9zdEdpdFN0YXRlU2VydmljZSwgTUVUQV9HSVRfU1RBVEUsIE1FVEFfR0lUSFVCX1NUQVRFIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEdpdFN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RGlzY2FyZENoYW5nZXNPcGVyYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuL2FnZW50SG9zdERpc2NhcmRDaGFuZ2VzT3BlcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuL2FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3luY09wZXJhdGlvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYWdlbnRIb3N0U3luY09wZXJhdGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFJldmlld1NlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdFJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBHcmFjZSBwZXJpb2QgYmVmb3JlIGFuIGVtcHR5LCB1bnN1YnNjcmliZWQgc2Vzc2lvbiBpcyBnYXJiYWdlLWNvbGxlY3RlZFxuICogdmlhIHtAbGluayBBZ2VudFNlcnZpY2UuX3J1blNlc3Npb25HY30uIEdpdmVzIGEgZGlzY29ubmVjdGVkIGNsaWVudCB0aW1lXG4gKiB0byByZWNvbm5lY3QgKG9yIGEgd29ya3NwYWNlIHN3aXRjaCB0byBzZXR0bGUpIGJlZm9yZSB3ZSB0ZWFyIGRvd24gdGhlXG4gKiBwcm92aWRlci1zaWRlIHNlc3Npb24sIHdvcmt0cmVlLCBhbmQgb24tZGlzayBzdGF0ZS5cbiAqL1xuY29uc3QgU0VTU0lPTl9HQ19HUkFDRV9NUyA9IDMwXzAwMDtcblxuY29uc3QgSE9TVF9PV05FRF9TRVNTSU9OX0NPTkZJR19LRVlTID0gW1xuXHRTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbixcblx0U2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsXG5cdFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hQcmVmaXgsXG5cdFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXMsXG5cdFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFjayxcbl0gYXMgY29uc3Q7XG5cbmZ1bmN0aW9uIG9taXRIb3N0T3duZWRTZXNzaW9uQ29uZmlnPFQ+KGNvbmZpZzogUmVjb3JkPHN0cmluZywgVD4pOiBSZWNvcmQ8c3RyaW5nLCBUPiB7XG5cdGNvbnN0IHJlc3VsdCA9IHsgLi4uY29uZmlnIH07XG5cdGZvciAoY29uc3Qga2V5IG9mIEhPU1RfT1dORURfU0VTU0lPTl9DT05GSUdfS0VZUykge1xuXHRcdGRlbGV0ZSByZXN1bHRba2V5XTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEdyYWNlIHBlcmlvZCBiZWZvcmUgYW4gaWRsZSByZXNvdXJjZSB3YXRjaCBpcyB0b3JuIGRvd24gYWZ0ZXIgaXRzIGxhc3RcbiAqIHN1YnNjcmliZXIgdW5zdWJzY3JpYmVzIChtaXJyb3JzIHtAbGluayBTRVNTSU9OX0dDX0dSQUNFX01TfSkuIFdpdGhpblxuICogdGhpcyB3aW5kb3csIGEgcmUtc3Vic2NyaWJlIChvciByZWNvbm5lY3QpIHJldXNlcyB0aGUgc3RpbGwtcnVubmluZ1xuICoge0BsaW5rIElGaWxlU2VydmljZX0gd2F0Y2hlciBzbyB0cmFuc2llbnQgZHJvcC1vdXRzIGRvbid0IG1pc3MgY2hhbmdlXG4gKiBldmVudHMuIFJlc291cmNlIHdhdGNoIGFjdGlvbiBlbnZlbG9wZXMgZmxvdyB0aHJvdWdoIHRoZSBub3JtYWxcbiAqIGVudmVsb3BlIHJlcGxheSBidWZmZXIgZm9yIHRoZSBzYW1lIHJlYXNvbi5cbiAqL1xuY29uc3QgUkVTT1VSQ0VfV0FUQ0hfR1JBQ0VfTVMgPSAzMF8wMDA7XG5cbi8qKiBCb3VuZCBvbiBob3cgbG9uZyB7QGxpbmsgQWdlbnRTZXJ2aWNlLnN1YnNjcmliZX0gd2FpdHMgZm9yIGEgcGVuZGluZyBzdWJhZ2VudCBjaGF0IHRvIHJlZ2lzdGVyIGJlZm9yZSBnaXZpbmcgdXAuICovXG5jb25zdCBTVUJBR0VOVF9DSEFUX1BFTkRJTkdfVElNRU9VVF9NUyA9IDE1XzAwMDtcblxuLyoqXG4gKiBHcmFjZSBwZXJpb2QgYmVmb3JlIGFuIGlkbGUgc2Vzc2lvbiAob25lIHdpdGggdHVybnMsIG5vIHJlbWFpbmluZ1xuICogc3Vic2NyaWJlcnMpIGlzIHJlbGVhc2VkIGZyb20gbWVtb3J5IHZpYSB7QGxpbmsgQWdlbnRTZXJ2aWNlLl9tYXliZUV2aWN0SWRsZVNlc3Npb259LlxuICogRGVmZXJyaW5nIHRoZSByZWxlYXNlIGFsaWducyBpdCB3aXRoIHRoZSBjbGllbnQgZGlzY29ubmVjdC1ncmFjZSB3aW5kb3c6IGFcbiAqIGNsaWVudCB0aGF0IGRpc2Nvbm5lY3RzIGFuZCBxdWlja2x5IHJlY29ubmVjdHMgKG9yIGEgcmFwaWQgdW5zdWJzY3JpYmUvXG4gKiByZS1zdWJzY3JpYmUpIHJldXNlcyB0aGUgbGl2ZSBwcm92aWRlciBTREsgc2Vzc2lvbiBpbnN0ZWFkIG9mIGZvcmNpbmcgYW5cbiAqIGltbWVkaWF0ZSB7QGxpbmsgSUFnZW50LnJlbGVhc2VTZXNzaW9ufSAoU0RLIGBkaXNjb25uZWN0YCkgZm9sbG93ZWQgYnkgYVxuICogcmVzdW1lLWZyb20tZGlzay4gUmVsZWFzaW5nIHN5bmNocm9ub3VzbHkgb24gZXZlcnkgbGFzdC11bnN1YnNjcmliZSBjaHVybnNcbiAqIHRoZSBzaGFyZWQgcHJvdmlkZXIgcnVudGltZSBhbmQgcmFjZXMgY29uY3VycmVudCBzZXNzaW9uIG9wZXJhdGlvbnMuXG4gKlxuICogT3ZlcnJpZGFibGUgdmlhIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uUmVsZWFzZUdyYWNlTXNFbnZWYXJ9ICh0ZXN0IGhvb2spLlxuICovXG5jb25zdCBTRVNTSU9OX1JFTEVBU0VfR1JBQ0VfTVMgPSAoKCkgPT4ge1xuXHRjb25zdCByYXcgPSBwcm9jZXNzLmVudltBZ2VudEhvc3RTZXNzaW9uUmVsZWFzZUdyYWNlTXNFbnZWYXJdO1xuXHRjb25zdCBwYXJzZWQgPSByYXcgIT09IHVuZGVmaW5lZCA/IHBhcnNlSW50KHJhdywgMTApIDogTmFOO1xuXHRyZXR1cm4gTnVtYmVyLmlzRmluaXRlKHBhcnNlZCkgJiYgcGFyc2VkID49IDAgPyBwYXJzZWQgOiAzMF8wMDA7XG59KSgpO1xuXG4vKipcbiAqIFNlc3Npb24tZGF0YWJhc2UgbWV0YWRhdGEga2V5IHVuZGVyIHdoaWNoIHRoZSBvcmNoZXN0cmF0b3IgcGVyc2lzdHMgaXRzIG93blxuICogY2F0YWxvZyBvZiBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgcGVlciBjaGF0cyBmb3IgYSBzZXNzaW9uLiBUaGUgdmFsdWUgaXMgYVxuICogSlNPTiBhcnJheSBvZiB7QGxpbmsgSVBlcnNpc3RlZFBlZXJDaGF0fS4gVGhpcyBpcyB0aGUgb3JjaGVzdHJhdG9yJ3Mgc2luZ2xlXG4gKiBzb3VyY2Ugb2YgdHJ1dGggZm9yIHBlZXItY2hhdCBlbnVtZXJhdGlvbiBvbiByZXN0b3JlLiBXaGVuIHRoZSBrZXkgaXMgYWJzZW50XG4gKiB0aGUgc2Vzc2lvbiBwcmVkYXRlcyBvcmNoZXN0cmF0b3Itb3duZWQgcGVyc2lzdGVuY2UgYW5kIGEgb25lLXRpbWUgbWlncmF0aW9uXG4gKiBkcmFpbnMgdGhlIGFnZW50J3MgbGVnYWN5IGAqLmNoYXRzYCAoc2VlXG4gKiB7QGxpbmsgQWdlbnRTZXJ2aWNlLl9taWdyYXRlTGVnYWN5UGVlckNoYXRzfSkuXG4gKi9cbmNvbnN0IFBFRVJfQ0hBVFNfTUVUQURBVEFfS0VZID0gJ3BlZXJDaGF0cyc7XG5cbi8qKlxuICogU2Vzc2lvbi1kYXRhYmFzZSBtZXRhZGF0YSBrZXkgd3JpdHRlbiBvbiBhIHBlZXIgY2hhdCdzICpiYWNraW5nKiBTREsgc2Vzc2lvblxuICogKHNlZSB7QGxpbmsgSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdC5iYWNraW5nU2Vzc2lvbn0pLiBJdHMgcHJlc2VuY2UgbWFya3MgdGhhdFxuICogc2Vzc2lvbiBhcyBhbiBpbnRlcm5hbCBwZWVyLWNoYXQgYmFja2luZyB0aGF0IG11c3QgbmV2ZXIgc3VyZmFjZSBhcyBhXG4gKiB0b3AtbGV2ZWwgc2Vzc2lvbjsgdGhlIHZhbHVlIGlzIHRoZSBvd25pbmcgcGVlciBjaGF0J3MgY2hhbm5lbCBVUkkgc3RyaW5nLlxuICogUGVyc2lzdGVkLCBzbyBpdCBzdXJ2aXZlcyBhIGhvc3QgcmVzdGFydCB3aXRob3V0IHJlLXN0YW1waW5nLlxuICovXG5jb25zdCBQRUVSX0NIQVRfQkFDS0lOR19NRVRBREFUQV9LRVkgPSAncGVlckNoYXRCYWNraW5nJztcblxuLyoqXG4gKiBBIHNpbmdsZSBlbnRyeSBpbiB0aGUgb3JjaGVzdHJhdG9yJ3MgcGVyc2lzdGVkIHBlZXItY2hhdCBjYXRhbG9nLiBgdXJpYCBpc1xuICogdGhlIHBlZXIgY2hhdCdzIGNoYW5uZWwgVVJJOyBgcHJvdmlkZXJEYXRhYCBpcyB0aGUgb3BhcXVlLCBhZ2VudC1vd25lZCBibG9iXG4gKiAoc2VlIHtAbGluayBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0LnByb3ZpZGVyRGF0YX0pIGhhbmRlZCBiYWNrIHRvIHRoZSBhZ2VudCBvblxuICogcmVzdG9yZSBcdTIwMTQgdGhlIG9yY2hlc3RyYXRvciBuZXZlciBwYXJzZXMgaXQuIGBwcm92aWRlckRhdGFgIG1heSBiZSBvbWl0dGVkLFxuICogaW4gd2hpY2ggY2FzZSB0aGUgYWdlbnQgcmVjb3ZlcnMgaXRzIGJhY2tpbmcgZnJvbSBpdHMgb3duIHBlcnNpc3RlbmNlIG9uXG4gKiB7QGxpbmsgSUFnZW50Lm1hdGVyaWFsaXplQ2hhdH0uIGBvcmlnaW5gIHJlY29yZHMgdGhlIGNoYXQncyBwcm92ZW5hbmNlXG4gKiAoY3VycmVudGx5IG9ubHkge0BsaW5rIENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0fSwgY2FycnlpbmcgdGhlIHNvdXJjZSBjaGF0IGFuZFxuICogc3RhYmxlIHNvdXJjZSB0dXJuIGlkKSBzbyBpdCBzdXJ2aXZlcyBhIHJlc3RhcnQ7IG9taXR0ZWQgZm9yIHBsYWluIHBlZXIgY2hhdHMuXG4gKi9cbmludGVyZmFjZSBJUGVyc2lzdGVkUGVlckNoYXQge1xuXHRyZWFkb25seSB1cmk6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXJEYXRhPzogc3RyaW5nO1xuXHRyZWFkb25seSBvcmlnaW4/OiBDaGF0T3JpZ2luO1xufVxuXG4vKipcbiAqIFJlY29uY2lsZSBhIHNlc3Npb24ncyB3b3JraW5nLWRpcmVjdG9yeSBzZXQgZnJvbSBhIGNyZWF0ZS1yZXN1bHQgL1xuICogbWF0ZXJpYWxpemF0aW9uIHJlY2VpcHQuIFRoZSByZXNvbHZlZCByZWNlaXB0IGlzIGF1dGhvcml0YXRpdmUgZm9yIHRoZSByb290c1xuICogaXQgcmVwb3J0cyAoaW5kZXggMCA9IHRoZSByZXNvbHZlZCBwcm9jZXNzIHJvb3QsIGUuZy4gYSB3b3JrdHJlZSk7IGFueVxuICogYWRkaXRpb25hbCByZXF1ZXN0ZWQvY3VycmVudCByb290cyAqYmV5b25kKiB0aGUgcmVzb2x2ZWQgc2V0J3MgbGVuZ3RoIGFyZVxuICogcHJlc2VydmVkLiBUaGlzIGlzIHdoYXQgbGV0cyBhIHJlY2VpcHQgdGhhdCByZXBvcnRzIG9ubHkgdGhlIHByb2Nlc3Mgcm9vdCBcdTIwMTRcbiAqIHRoZSByZXN1bWUgcGF0aCByZWFkcyBhIHNpbmdsZSBjd2QgZnJvbSBkaXNrIFx1MjAxNCBrZWVwIHRoZSByZXN0IG9mIHRoZSBrbm93biBzZXRcbiAqIGluc3RlYWQgb2YgY29sbGFwc2luZyBgW0EsIEIsIENdYCB0byBgW2Rpcl1gLCB3aGlsZSBhIHJlY2VpcHQgdGhhdCBjYXJyaWVzIHRoZVxuICogZnVsbCByZXNvbHZlZCBzZXQgKHRoZSBzZW5kL2NyZWF0ZSBwYXRoKSBpcyB0cnVzdGVkIHZlcmJhdGltIChpbmNsdWRpbmcgYVxuICogcmVtYXBwZWQgdGFpbCkuIEEgbWlzc2luZyByZXNvbHZlZCBzZXQga2VlcHMgdGhlIHJlcXVlc3RlZCB2YWx1ZSBhcy1pcyxcbiAqIHByZXNlcnZpbmcgdGhlIGB1bmRlZmluZWRgICh3b3Jrc3BhY2UtbGVzcyAvIGluaGVyaXQpIHZzIGBbXWAgKGV4cGxpY2l0bHkgbm9uZSlcbiAqIGRpc3RpbmN0aW9uLlxuICpcbiAqIFJldHVybnMgdGhlIHByb3RvY29sIGZvcm0gKGBzdHJpbmdbXWApLCBzaW5jZSBwcm90b2NvbCBVUklzIGFyZSBzdHJpbmdzLlxuICovXG5mdW5jdGlvbiByZWNvbmNpbGVXb3JraW5nRGlyZWN0b3JpZXMocmVxdWVzdGVkOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCwgcmVzb2x2ZWQ6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRpZiAocmVzb2x2ZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiByZXF1ZXN0ZWQ/Lm1hcChkID0+IGQudG9TdHJpbmcoKSk7XG5cdH1cblx0Y29uc3QgdGFpbCA9IChyZXF1ZXN0ZWQgPz8gW10pLnNsaWNlKHJlc29sdmVkLmxlbmd0aCk7XG5cdHJldHVybiBbLi4ucmVzb2x2ZWQsIC4uLnRhaWxdLm1hcChkID0+IGQudG9TdHJpbmcoKSk7XG59XG5cbi8qKlxuICogVGhlIGFnZW50IHNlcnZpY2UgaW1wbGVtZW50YXRpb24gdGhhdCBydW5zIGluc2lkZSB0aGUgYWdlbnQtaG9zdCB1dGlsaXR5XG4gKiBwcm9jZXNzLiBEaXNwYXRjaGVzIHRvIHJlZ2lzdGVyZWQge0BsaW5rIElBZ2VudH0gaW5zdGFuY2VzIGJhc2VkXG4gKiBvbiB0aGUgcHJvdmlkZXIgaWRlbnRpZmllciBpbiB0aGUgc2Vzc2lvbiBjb25maWd1cmF0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVdyaXRlUXVldWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VRdWV1ZSgpKTtcblxuXHQvKiogUHJvdG9jb2w6IGZpcmVzIHdoZW4gc3RhdGUgaXMgbXV0YXRlZCBieSBhbiBhY3Rpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QWN0aW9uRW52ZWxvcGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuX29uRGlkQWN0aW9uLmV2ZW50O1xuXG5cdC8qKiBQcm90b2NvbDogZmlyZXMgZm9yIGVwaGVtZXJhbCBub3RpZmljYXRpb25zIChzZXNzaW9uQWRkZWQvUmVtb3ZlZCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0LyoqIFByb3RvY29sOiBmaXJlcyBmb3IgTUNQIHNlcnZlci1vcmlnaW5hdGVkIG5vdGlmaWNhdGlvbnMgcm91dGVkIG92ZXIgYG1jcDovL2AgY2hhbm5lbHMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWNwTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1jcE5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uTWNwTm90aWZpY2F0aW9uID0gdGhpcy5fb25NY3BOb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0LyoqIEF1dGhvcml0YXRpdmUgc3RhdGUgbWFuYWdlciBmb3IgdGhlIHNlc3Npb25zIHByb2Nlc3MgcHJvdG9jb2wuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXG5cdC8qKiBFeHBvc2VzIHRoZSBzdGF0ZSBtYW5hZ2VyIGZvciBjby1ob3N0aW5nIGEgV2ViU29ja2V0IHByb3RvY29sIHNlcnZlci4gKi9cblx0Z2V0IHN0YXRlTWFuYWdlcigpOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgeyByZXR1cm4gdGhpcy5fc3RhdGVNYW5hZ2VyOyB9XG5cblx0LyoqIEV4cG9zZXMgdGhlIGNvbmZpZ3VyYXRpb24gc2VydmljZSBzbyBhZ2VudCBwcm92aWRlcnMgY2FuIHNoYXJlIHJvb3QgY29uZmlnIHBsdW1iaW5nLiAqL1xuXHRnZXQgY29uZmlndXJhdGlvblNlcnZpY2UoKTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgeyByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2U7IH1cblxuXHQvKiogRXhwb3NlcyB0aGUgR2l0SHViIGVuZHBvaW50IHNlcnZpY2Ugc28gYWdlbnQgcHJvdmlkZXJzIHNoYXJlIEdpdEh1YiAoRW50ZXJwcmlzZSkgcmVzb3VyY2UgcmVzb2x1dGlvbi4gKi9cblx0Z2V0IGdpdEh1YkVuZHBvaW50U2VydmljZSgpOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZTsgfVxuXG5cdC8qKiBFeHBvc2VzIHRoZSBjaGVja3BvaW50IHNlcnZpY2Ugc28gYWdlbnQgcHJvdmlkZXJzIGNhbiBjYXB0dXJlIHNlc3Npb24gYmFzZWxpbmVzLiAqL1xuXHRnZXQgY2hlY2twb2ludFNlcnZpY2UoKTogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlOyB9XG5cblx0LyoqIFJlZ2lzdGVyZWQgcHJvdmlkZXJzIGtleWVkIGJ5IHRoZWlyIHtAbGluayBBZ2VudFByb3ZpZGVyfSBpZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzID0gbmV3IE1hcDxBZ2VudFByb3ZpZGVyLCBJQWdlbnQ+KCk7XG5cdC8qKiBNYXBzIGVhY2ggYWN0aXZlIHNlc3Npb24gVVJJICh0b1N0cmluZykgdG8gaXRzIG93bmluZyBwcm92aWRlci4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblRvUHJvdmlkZXIgPSBuZXcgTWFwPHN0cmluZywgQWdlbnRQcm92aWRlcj4oKTtcblx0LyoqXG5cdCAqIFNlc3Npb25zIHRoYXQgaGF2ZSBvcHRlZCBpbiB0byBicmluZy11cCBwcm9ncmVzcywga2V5ZWQgYnkgcHJvdmlkZXIgaWQuXG5cdCAqIEEgc2Vzc2lvbiBpcyBhZGRlZCBoZXJlIHdoZW4gaXRzIGBjcmVhdGVTZXNzaW9uYCBjYXJyaWVzIGFcblx0ICoge0BsaW5rIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcucHJvZ3Jlc3NUb2tlbn0gYW5kIHJlbW92ZWQgb25jZSBpdFxuXHQgKiBtYXRlcmlhbGl6ZXMgKHRoZSBTREsgaXMgbm93IHJlc29sdmVkKSBvciBpcyBkaXNwb3NlZC4gVGhlIFNESyBkb3dubG9hZCBpc1xuXHQgKiBob3N0LWxldmVsIGFuZCBzaGFyZWQgYWNyb3NzIGV2ZXJ5IHNlc3Npb24gb2YgYSBwcm92aWRlciwgc28gdGhpcyBvbmx5XG5cdCAqIHJlY29yZHMgKmludGVyZXN0KjogYXMgbG9uZyBhcyBvbmUgb3IgbW9yZSBzZXNzaW9ucyBvZiBhIHByb3ZpZGVyIGlzXG5cdCAqIHJlZ2lzdGVyZWQsIHtAbGluayBlbWl0RG93bmxvYWRQcm9ncmVzc30gc3VyZmFjZXMgdGhhdCBwcm92aWRlcidzIGRvd25sb2FkIGFzIGEgc2luZ2xlXG5cdCAqIHByb2dyZXNzIHN0cmVhbSBrZXllZCBieSB0aGUgZG93bmxvYWQncyBvd24gaWRlbnRpdHkgKHRoZSBwYWNrYWdlIGlkKSxcblx0ICogcmF0aGVyIHRoYW4gb25lIHN0cmVhbSBwZXIgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdCA9IG5ldyBNYXA8QWdlbnRQcm92aWRlciwgU2V0PHN0cmluZz4+KCk7XG5cdC8qKiBTdWJzY3JpcHRpb25zIHRvIHByb3ZpZGVyIHByb2dyZXNzIGV2ZW50czsgY2xlYXJlZCB3aGVuIHByb3ZpZGVycyBjaGFuZ2UuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyU3Vic2NyaXB0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbiB0YWlsIG9mIGluLWZsaWdodCBwZXJzaXN0ZWQgcGVlci1jaGF0IGNhdGFsb2cgd3JpdGVzLCBrZXllZCBieVxuXHQgKiBzZXNzaW9uIFVSSSBzdHJpbmcuIFJlYWQtbW9kaWZ5LXdyaXRlIHVwZGF0ZXMgdG8gdGhlIHtAbGlua1xuXHQgKiBQRUVSX0NIQVRTX01FVEFEQVRBX0tFWX0gYmxvYiBhcmUgY2hhaW5lZCBwZXIgc2Vzc2lvbiBzbyBhIGBjcmVhdGVDaGF0YCxcblx0ICogYGRpc3Bvc2VDaGF0YCwgYW5kIGBvbkRpZENoYW5nZUNoYXREYXRhYCByYWNpbmcgZm9yIHRoZSBzYW1lXG5cdCAqIHNlc3Npb24gY2FuJ3QgY2xvYmJlciBlYWNoIG90aGVyJ3MgZWRpdHMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZWVyQ2hhdENhdGFsb2dXcml0ZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXV0aFNlcnZpY2U6IEFnZW50SG9zdEF1dGhlbnRpY2F0aW9uU2VydmljZTtcblx0LyoqIERlZmF1bHQgcHJvdmlkZXIgdXNlZCB3aGVuIG5vIGV4cGxpY2l0IHByb3ZpZGVyIGlzIHNwZWNpZmllZC4gKi9cblx0cHJpdmF0ZSBfZGVmYXVsdFByb3ZpZGVyOiBBZ2VudFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHQvKiogT2JzZXJ2YWJsZSByZWdpc3RlcmVkIGFnZW50cywgZHJpdmVzIGByb290L2FnZW50c0NoYW5nZWRgIHZpYSB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4oJ2FnZW50cycsIFtdKTtcblx0LyoqIFNoYXJlZCBzaWRlLWVmZmVjdCBoYW5kbGVyIGZvciBhY3Rpb24gZGlzcGF0Y2ggYW5kIHNlc3Npb24gbGlmZWN5Y2xlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaWRlRWZmZWN0czogQWdlbnRTaWRlRWZmZWN0cztcblx0LyoqIE93bnMgc3RhdGljIC8gcGVyLXR1cm4gY2hhbmdlc2V0IGNvbXB1dGUsIHB1Ymxpc2gsIHBlcnNpc3QsIHJlc3RvcmUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldHM6IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlO1xuXHQvKiogU2hhcmVkIGFjdGl2ZSBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9uIHJlZ2lzdHJ5LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzZXRTdWJzY3JpcHRpb25zOiBJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZTtcblx0LyoqIE93bnMgY2hhbmdlc2V0IG9wZXJhdGlvbiBjb250cmlidXRpb25zIGFuZCBoYW5kbGVyIGFjdGl2YXRpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldE9wZXJhdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXZpZXdTZXJ2aWNlOiBJQWdlbnRIb3N0UmV2aWV3U2VydmljZTtcblx0LyoqIE93bnMgQWdlbnRTZXJ2aWNlLXNpZGUgb3JjaGVzdHJhdGlvbiBvZiB0aGUgY2hhbmdlc2V0IGZlYXR1cmUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldENvb3JkaW5hdG9yOiBBZ2VudEhvc3RDaGFuZ2VzZXRDb29yZGluYXRvcjtcblx0LyoqIE93bnMgc2Vzc2lvbiBnaXQtc3RhdGUgcHJvYmluZyBhbmQgZ2l0LWJhY2tlZCBjYXRhbG9ndWUgZGVjb3JhdGlvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2l0U3RhdGVTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlO1xuXHQvKiogTWFuYWdlcyBQVFktYmFja2VkIHRlcm1pbmFscyBmb3IgdGhlIGFnZW50IGhvc3QgcHJvdG9jb2wuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsTWFuYWdlcjogQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyO1xuXHQvKiogUGVyc2lzdHMgaG9zdC1pbmplY3RlZCBgL3JlbmFtZWAgLyBgIWNvbW1hbmRgIHR1cm5zIGZvciByZXN0b3JlICYgZm9yay90cnVuY2F0ZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbG9jYWxUdXJuczogQWdlbnRIb3N0TG9jYWxUdXJucztcblx0LyoqIFNlcnZlci1zaWRlIGhvc3QgZm9yIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJUb29sSG9zdDogQWdlbnRTZXJ2ZXJUb29sSG9zdDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdC8qKiBDYXB0dXJlcyBiYXNlbGluZSAvIHBlci10dXJuIGdpdCBjaGVja3BvaW50cyBiYWNraW5nIHRoZSBjaGFuZ2VzZXQgcGlwZWxpbmUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2U7XG5cdC8qKlxuXHQgKiBIb3N0LW93bmVkIHdvcmt0cmVlIGlzb2xhdGlvbiBjb250cm9sbGVyLiBTZXQgcG9zdC1jb25zdHJ1Y3Rpb24gdmlhXG5cdCAqIHtAbGluayBzZXRXb3JrdHJlZUlzb2xhdGlvbn0gYmVjYXVzZSBpdCBkZXBlbmRzIG9uIHRoZSBicmFuY2gtbmFtZVxuXHQgKiBnZW5lcmF0b3IsIHdoaWNoIGlzIHdpcmVkIGFmdGVyIHRoaXMgc2VydmljZSBpcyBidWlsdC4gQWxsIHdvcmt0cmVlXG5cdCAqIGJlaGF2aW9yIFx1MjAxNCBzY2hlbWEgY29udHJpYnV0aW9uLCBmaXJzdC1zZW5kIHJlc29sdXRpb24sIHByb2plY3QgL1xuXHQgKiBhbm5vdW5jZW1lbnQsIGFyY2hpdmUsIGFuZCBjbGVhbnVwIFx1MjAxNCBpcyBkcml2ZW4gZnJvbSB0aGUgaG9zdCBzbyBpbmRpdmlkdWFsXG5cdCAqIGFnZW50cyBzdGF5IHVuYXdhcmUgb2YgdGhlIGZvbGRlci12cy13b3JrdHJlZSBkaXN0aW5jdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3dvcmt0cmVlOiBXb3JrdHJlZUlzb2xhdGlvbiB8IHVuZGVmaW5lZDtcblx0LyoqIFN1Y2Nlc3NmdWwgbGlzdC10aW1lIHJlcG9zaXRvcnktcm9vdCByZXNvbHV0aW9uczsgZXZpY3Rpb24gb25seSBjYXVzZXMgc2FmZSByZS1yZXNvbHV0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3JtYWxpemVkV29ya3RyZWVSZXBvc2l0b3J5Um9vdHMgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBVUkk+KDEwMCk7XG5cdC8qKiBTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBHaXRIdWIgKEVudGVycHJpc2UpIGVuZHBvaW50cyBhbmQgcHJvdGVjdGVkIHJlc291cmNlcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2l0SHViRW5kcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlO1xuXHQvKiogUGx1Z2dhYmxlIGNvbXBsZXRpb24gaXRlbSBwcm92aWRlcnMgKGUuZy4gd29ya3NwYWNlIGZpbGUgY29tcGxldGlvbnMsIGFnZW50LXNwZWNpZmljIEAtbWVudGlvbnMpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uczogSUFnZW50SG9zdENvbXBsZXRpb25zO1xuXHRwcml2YXRlIF9za2lsbENvbXBsZXRpb25Qcm92aWRlclJlZ2lzdGVyZWQgPSBmYWxzZTtcblx0LyoqIEJhY2tzIHtAbGluayBnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvfSAvIHtAbGluayBkaWFnbm9zdGljc0ZldGNofTsgd2lyZWQgdmlhIHtAbGluayBzZXROZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlfS4gKi9cblx0cHJpdmF0ZSBfbmV0d29ya0RpYWdub3N0aWNzOiBJTmV0d29ya0RpYWdub3N0aWNzU2VydmljZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZWRpdEF0dHJpYnV0aW9uU2VydmljZTogSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQXV0aG9yaXRhdGl2ZSBzZXJ2ZXItc2lkZSBwZXItcmVzb3VyY2Ugc3Vic2NyaXB0aW9uIHJlZmNvdW50LCBrZXllZCBieVxuXHQgKiByZXNvdXJjZSBVUkkgc3RyaW5nIGFuZCB2YWx1ZWQgYnkgdGhlIHNldCBvZiBzdWJzY3JpYmVkIHByb3RvY29sXG5cdCAqIGNsaWVudCBJRHMuIFBvcHVsYXRlZCBieSB7QGxpbmsgc3Vic2NyaWJlfSAob3Ige0BsaW5rIGFkZFN1YnNjcmliZXJ9XG5cdCAqIGZvciBoYW5kc2hha2UgZmFzdC1wYXRocykgYW5kIGRyYWluZWQgYnkge0BsaW5rIHVuc3Vic2NyaWJlfS4gV2hlbiBhXG5cdCAqIHJlc291cmNlJ3Mgc2V0IGJlY29tZXMgZW1wdHksIHRoZSByZXNvdXJjZSBpcyBkcm9wcGVkIGZyb20gdGhlIG1hcCBhbmRcblx0ICoge0BsaW5rIF9tYXliZUV2aWN0SWRsZVNlc3Npb259IGlzIGludm9rZWQgdG8gcmVsZWFzZSBhbnkgY2FjaGVkIHN0YXRlXG5cdCAqIGZvciBpdC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlU3Vic2NyaWJlcnMgPSBuZXcgUmVzb3VyY2VNYXA8U2V0PHN0cmluZz4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3RvcmVTZXNzaW9uSW5GbGlnaHQgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzdG9yZVN1YmFnZW50SW5GbGlnaHQgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblxuXHQvKiogU3ViYWdlbnQgY2hhdHMgYXJtZWQgZm9yIGEgYm91bmRlZCB3YWl0IChvbmNlIGV4ZWN1dGlvbiBpcyBjb25maXJtZWQpOyByZXNvbHZlZCBieSB7QGxpbmsgX29uQ2hhdFNwYXduZWR9LCBhd2FpdGVkIGJ5IHtAbGluayBzdWJzY3JpYmV9LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3ViYWdlbnRDaGF0cyA9IG5ldyBNYXA8c3RyaW5nIC8qIHN1YmFnZW50Q2hhdFVyaSAqLywgRGVmZXJyZWRQcm9taXNlPHZvaWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3ViYWdlbnRDaGF0VGltZW91dHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcgLyogc3ViYWdlbnRDaGF0VXJpICovLCBJRGlzcG9zYWJsZT4oKSk7XG5cdC8qKiBTdWJhZ2VudCBjaGF0cyBhbm5vdW5jZWQgdmlhIGBfbWV0YS5zdWJhZ2VudENoYXRVcmlgIGJ1dCBzdGlsbCBhd2FpdGluZyBjb25maXJtYXRpb24sIGtleWVkIGJ5IGAke2NoYW5uZWx9OiR7dG9vbENhbGxJZH1gLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3ViYWdlbnRUb29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nIC8qIHN1YmFnZW50Q2hhdFVyaSAqLz4oKTtcblxuXHQvKipcblx0ICogUGVuZGluZyB7QGxpbmsgX3J1blNlc3Npb25HY30gdGltZXJzLCBrZXllZCBieSBzZXNzaW9uIFVSSS4gQSB0aW1lciBpc1xuXHQgKiBhcm1lZCB3aGVuIGEgc2Vzc2lvbiBsb3NlcyBpdHMgbGFzdCBzdWJzY3JpYmVyIHdoaWxlIHN0aWxsIGVtcHR5IChub1xuXHQgKiB0dXJucywgbm8gYWN0aXZlIHR1cm4pIFx1MjAxNCBzZWUge0BsaW5rIF9tYXliZVNjaGVkdWxlU2Vzc2lvbkdjfS4gQ2xlYXJlZFxuXHQgKiB3aGVuZXZlciBhbnkgY2xpZW50IHN1YnNjcmliZXMgYWdhaW4gb3IgdGhlIHRpbWVyIGZpcmVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Nlc3Npb25HYyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCkpO1xuXG5cdC8qKlxuXHQgKiBQZW5kaW5nIHtAbGluayBfbWF5YmVFdmljdElkbGVTZXNzaW9ufSB0aW1lcnMsIGtleWVkIGJ5IHNlc3Npb24gVVJJLiBBXG5cdCAqIHRpbWVyIGlzIGFybWVkIHdoZW4gYW4gaWRsZSBzZXNzaW9uICh3aXRoIHR1cm5zKSBsb3NlcyBpdHMgbGFzdCBzdWJzY3JpYmVyXG5cdCAqIFx1MjAxNCBzZWUge0BsaW5rIHVuc3Vic2NyaWJlfS4gQ2xlYXJlZCB3aGVuIGFueSBjbGllbnQgc3Vic2NyaWJlcyBhZ2FpblxuXHQgKiAoe0BsaW5rIGFkZFN1YnNjcmliZXJ9KSBvciB0aGUgdGltZXIgZmlyZXMuIERlZmVycmluZyB0aGUgcmVsZWFzZSBhdm9pZHNcblx0ICogY2h1cm5pbmcgdGhlIHByb3ZpZGVyIFNESyBzZXNzaW9uIG9uIHJhcGlkIGRpc2Nvbm5lY3QvcmVjb25uZWN0IGN5Y2xlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTZXNzaW9uUmVsZWFzZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCkpO1xuXG5cdC8qKlxuXHQgKiBBY3RpdmUgcmVzb3VyY2Ugd2F0Y2hlcyBrZXllZCBieSB0aGUgY2hhbm5lbCBVUkkgc3RyaW5nXG5cdCAqIChgYWhwLXJlc291cmNlLXdhdGNoOi88ZW5jb2RlZD5gKS5cblx0ICpcblx0ICogRWFjaCBlbnRyeSBvd25zIHRoZSB7QGxpbmsgSUZpbGVTZXJ2aWNlfSB3YXRjaGVyIHRvZ2V0aGVyIHdpdGggdGhlXG5cdCAqIGRlY29kZWQgZGVzY3JpcHRvciwgdGhlIHN1YnNjcmliZXIgcmVmY291bnQsIGFuZCB0aGUgb3B0aW9uYWxcblx0ICogZ3JhY2Utd2luZG93IGRpc3Bvc2UgdGltZXIuIFRoZSB3YXRjaCBVUkkgaXRzZWxmIGlzIGZ1bGx5XG5cdCAqIHNlbGYtZGVzY3JpYmluZyBcdTIwMTQge0BsaW5rIGNyZWF0ZVJlc291cmNlV2F0Y2h9IGp1c3QgZW5jb2RlcyB0aGVcblx0ICogY2FsbGVyJ3MgcGFyYW1zIGludG8gdGhlIFVSSSBhbmQgcmV0dXJucyBpdC4gU3RhdGUgb25seSBleGlzdHNcblx0ICogaGVyZSBvbmNlIGF0IGxlYXN0IG9uZSBjbGllbnQgaGFzIHN1YnNjcmliZWQuXG5cdCAqXG5cdCAqIExpZmVjeWNsZTpcblx0ICogLSBGaXJzdCBzdWJzY3JpYmVyIHRvIGEgY2hhbm5lbDoge0BsaW5rIG9uUmVzb3VyY2VXYXRjaFN1YnNjcmliZWR9XG5cdCAqICAgcGFyc2VzIHRoZSBVUkksIGNyZWF0ZXMgdGhlIHtAbGluayBJRmlsZVNlcnZpY2V9IHdhdGNoZXIsIGFuZFxuXHQgKiAgIGluc3RhbGxzIHRoZSBlbnRyeSB3aXRoIGBzdWJzY3JpYmVycyA9IDFgLlxuXHQgKiAtIFN1YnNlcXVlbnQgc3Vic2NyaWJlcnMgYnVtcCB0aGUgcmVmY291bnQgYW5kIGNhbmNlbCBhbnkgcGVuZGluZ1xuXHQgKiAgIGdyYWNlLXdpbmRvdyBkaXNwb3NlIHRpbWVyLlxuXHQgKiAtIHtAbGluayBvblJlc291cmNlV2F0Y2hVbnN1YnNjcmliZWR9IGRyb3BzIHRoZSByZWZjb3VudDsgd2hlbiBpdFxuXHQgKiAgIHJlYWNoZXMgemVybyB3ZSBhcm0gYSB7QGxpbmsgUkVTT1VSQ0VfV0FUQ0hfR1JBQ0VfTVN9IGRpc3Bvc2Vcblx0ICogICB0aW1lciByYXRoZXIgdGhhbiB0ZWFyaW5nIGRvd24gaW1tZWRpYXRlbHksIGdpdmluZyBkaXNjb25uZWN0ZWRcblx0ICogICBjbGllbnRzIHRpbWUgdG8gcmVjb25uZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VXYXRjaGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJQWN0aXZlUmVzb3VyY2VXYXRjaD4oKSk7XG5cblx0LyoqIEV4cG9zZXMgdGhlIHRlcm1pbmFsIG1hbmFnZXIgZm9yIHVzZSBieSBhZ2VudCBwcm92aWRlcnMuICovXG5cdGdldCB0ZXJtaW5hbE1hbmFnZXIoKTogSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB7IHJldHVybiB0aGlzLl90ZXJtaW5hbE1hbmFnZXI7IH1cblxuXHQvKiogRXhwb3NlcyB0aGUgY29tcGxldGlvbnMgc2VydmljZSBmb3IgdXNlIGJ5IGFnZW50IHByb3ZpZGVycyAoZS5nLiB0byByZWdpc3RlciBhZ2VudC1zY29wZWQgY29tcGxldGlvbiBpdGVtIHByb3ZpZGVycykuICovXG5cdGdldCBjb21wbGV0aW9uc1NlcnZpY2UoKTogSUFnZW50SG9zdENvbXBsZXRpb25zIHsgcmV0dXJuIHRoaXMuX2NvbXBsZXRpb25zOyB9XG5cblx0LyoqXG5cdCAqIFRyaWdnZXIgY2hhcmFjdGVycyBhbm5vdW5jZWQgdG8gY2xpZW50cyB2aWEgYEluaXRpYWxpemVSZXN1bHQuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYC5cblx0ICogQWdncmVnYXRlZCBmcm9tIGFsbCByZWdpc3RlcmVkIHtAbGluayBJQWdlbnRIb3N0Q29tcGxldGlvbkl0ZW1Qcm92aWRlcn1zLlxuXHQgKi9cblx0Z2V0IGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycygpOiByZWFkb25seSBzdHJpbmdbXSB7IHJldHVybiB0aGlzLl9jb21wbGV0aW9ucy50cmlnZ2VyQ2hhcmFjdGVyczsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcm9vdENvbmZpZ1Jlc291cmNlPzogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlID0gTnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0X2ZpbGVNb25pdG9yU2VydmljZT86IElBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UsXG5cdFx0Y29waWxvdEFwaVNlcnZpY2U/OiBJQ29waWxvdEFwaVNlcnZpY2UsXG5cdFx0ZmV0Y2hGbj86IHR5cGVvZiBnbG9iYWxUaGlzLmZldGNoLFxuXHRcdHByb3ZpZGVyQ29uZmlndXJhdGlvbnM6IHJlYWRvbmx5IElBZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5nc1JlZ2lzdHJhdGlvbltdID0gW10sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdBZ2VudFNlcnZpY2UgaW5pdGlhbGl6ZWQnKTtcblx0XHR0aGlzLl9hdXRoU2VydmljZSA9IG5ldyBBZ2VudEhvc3RBdXRoZW50aWNhdGlvblNlcnZpY2UoX2xvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIoX2xvZ1NlcnZpY2UsIHtcblx0XHRcdGhvc3RCdWlsZEluZm86IGhvc3RCdWlsZEluZm9Gcm9tUHJvZHVjdCh0aGlzLl9wcm9kdWN0U2VydmljZSksXG5cdFx0XHRjaGFuZ2VzZXRTdGF0ZVJldGVudGlvbjoge1xuXHRcdFx0XHQvLyBUaGUgY2FjaGUgY2FsbHMgdGhpcyBsYXppbHkgYWZ0ZXIgY29uc3RydWN0aW9uLiBJZiBhIGZ1dHVyZSBzdGF0ZS1tYW5hZ2VyXG5cdFx0XHRcdC8vIGluaXRpYWxpemF0aW9uIHBhdGggcmVnaXN0ZXJzIGNoYW5nZXNldHMgYmVmb3JlIGBfY2hhbmdlc2V0c2AgaXMgYXNzaWduZWQsXG5cdFx0XHRcdC8vIGtlZXAgdGhlIGVudHJ5IHBpbm5lZCByYXRoZXIgdGhhbiBldmljdGluZyB3aXRoIGluY29tcGxldGUgbGl2ZW5lc3MgZGF0YS5cblx0XHRcdFx0Y2FuRXZpY3Q6IGNoYW5nZXNldCA9PiB0aGlzLl9jaGFuZ2VzZXRzID8gdGhpcy5faXNDaGFuZ2VzZXRFdmljdGFibGUoY2hhbmdlc2V0KSA6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gdGhpcy5fb25EaWRBY3Rpb24uZmlyZShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IHRoaXMuX3RyYWNrUGVuZGluZ1N1YmFnZW50Q2hhdEZyb21FbnZlbG9wZShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlTWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24oZSA9PiB0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5maXJlKGUpKSk7XG5cblx0XHQvLyBCdWlsZCBhIGxvY2FsIGluc3RhbnRpYXRpb24gc2NvcGUgc28gZG93bnN0cmVhbSBjb21wb25lbnRzIGNhblxuXHRcdC8vIGNvbnN1bWUge0BsaW5rIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlfSAoYW5kIGxhdGVyIHtAbGluayBJTG9nU2VydmljZX0pXG5cdFx0Ly8gdmlhIERJIHJhdGhlciB0aGFuIGJlaW5nIHBsdW1iZWQgcGxhaW4tY2xhc3MgcmVmZXJlbmNlcy5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHRoaXMuX3N0YXRlTWFuYWdlciwgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5fcm9vdENvbmZpZ1Jlc291cmNlLCBwcm92aWRlckNvbmZpZ3VyYXRpb25zKSk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25zdCBmaWxlTW9uaXRvclNlcnZpY2UgPSBfZmlsZU1vbml0b3JTZXJ2aWNlID8/IHRoaXMuX3JlZ2lzdGVyKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UodGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHR1cGRhdGVBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbEZyb21Db25maWcodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fc3RhdGVNYW5hZ2VyLnJvb3RTdGF0ZS5jb25maWc/LnZhbHVlcyk7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudFNlcnZpY2UsIHRoaXNdLFxuXHRcdFx0W0lQcm9kdWN0U2VydmljZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgdGhpcy5fc3RhdGVNYW5hZ2VyXSxcblx0XHRcdFtJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLCBmaWxlTW9uaXRvclNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRTZXJ2aWNlLCB0aGlzLl9naXRTZXJ2aWNlXSxcblx0XHRcdFtJVGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0XHQvLyBUaGUgb3V0ZXIgYWdlbnQtaG9zdCBwcm9jZXNzIERJIHJlZ2lzdGVycyBgSVNlc3Npb25EYXRhU2VydmljZWAsXG5cdFx0XHQvLyBidXQgdGhpcyBuZXN0ZWQgc3RyaWN0IGBJbnN0YW50aWF0aW9uU2VydmljZWAgZG9lcyBub3QgaW5oZXJpdCBpdC5cblx0XHRcdC8vIEFkZCBpdCBleHBsaWNpdGx5IHNvIGBASVNlc3Npb25EYXRhU2VydmljZWAgaW5qZWN0aW9uIGludG8gdGhlXG5cdFx0XHQvLyBjaGFuZ2VzZXQgc2VydmljZSAoYW5kIGFueSBmdXR1cmUgc2libGluZykgcmVzb2x2ZXMgY29ycmVjdGx5LlxuXHRcdFx0W0lTZXNzaW9uRGF0YVNlcnZpY2UsIHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZV0sXG5cdFx0KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcywgLypzdHJpY3QqLyB0cnVlKSk7XG5cdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsIHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZSk7XG5cdFx0Ly8gQSBHaXRIdWIgRW50ZXJwcmlzZSBVUkkgY2hhbmdlIHJlcG9pbnRzIGV2ZXJ5IGFnZW50J3MgR2l0SHViIHJlc291cmNlXG5cdFx0Ly8gaWRlbnRpdHkgdG8gYSBkaWZmZXJlbnQgYXV0aG9yaXphdGlvbiBzZXJ2ZXIsIHNvIHRoZSBjbGllbnQgbXVzdCBvYnRhaW4gYVxuXHRcdC8vIHRva2VuIGZvciB0aGUgbmV3IHJlc291cmNlLiBPbmUgcm9vdC1jaGFubmVsIGBhdXRoL3JlcXVpcmVkYCBjb3ZlcnMgYWxsXG5cdFx0Ly8gYWdlbnRzICh0aGUgVVJJIGlzIGhvc3QtbGV2ZWwgY29uZmlnKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmVtaXRBdXRoUmVxdWlyZWQoe1xuXHRcdFx0XHRyZXNvdXJjZTogdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLnJlc291cmNlLFxuXHRcdFx0XHRyZWFzb246IEF1dGhSZXF1aXJlZFJlYXNvbi5SZXF1aXJlZCxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHRjb25zdCBhZ2VudEhvc3RPY3RvS2l0U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLCBmZXRjaEZuKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLCBhZ2VudEhvc3RPY3RvS2l0U2VydmljZSk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlQ29waWxvdEFwaVNlcnZpY2UgPSBjb3BpbG90QXBpU2VydmljZSA/PyBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90QXBpU2VydmljZSwgZmV0Y2hGbik7XG5cdFx0c2VydmljZXMuc2V0KElDb3BpbG90QXBpU2VydmljZSwgZWZmZWN0aXZlQ29waWxvdEFwaVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZ2l0U3RhdGVTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UsIHRoaXMuX2dpdFN0YXRlU2VydmljZSk7XG5cblx0XHR0aGlzLl9jaGVja3BvaW50U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSwgdGhpcy5fY2hlY2twb2ludFNlcnZpY2UpO1xuXG5cdFx0Ly8gVGhlIHN1YnNjcmlwdGlvbiBzZXJ2aWNlIG1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9ucy4gVGhlIHNlcnZpY2Vcblx0XHQvLyBpcyBhbHNvIGNvbnN1bHRlZCBieSBvdGhlciBzZXJ2aWNlcyB3aGVuIHJlZnJlc2hpbmcgY2hhbmdlc2V0cyBhbmQgY2hhbmdlc2V0IG9wZXJhdGlvbnMuXG5cdFx0dGhpcy5fY2hhbmdlc2V0U3Vic2NyaXB0aW9ucyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSwgdGhpcy5fY2hhbmdlc2V0U3Vic2NyaXB0aW9ucyk7XG5cblx0XHQvLyBUaGUgb3BlcmF0aW9uIGNvbnRyaWJ1dGlvbiBzZXJ2aWNlIG1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiBjaGFuZ2VzZXQgb3BlcmF0aW9ucy5cblx0XHR0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSwgdGhpcy5fY2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBUaGUgY2hhbmdlcyByZXZpZXcgc2VydmljZSBpcyByZXNwb25zaWJsZSBmb3IgbWFuYWdpbmcgcmV2aWV3L3VucmV2aWV3IHN0YXRlIGZvciBjaGFuZ2VzZXQgY2hhbmdlcy5cblx0XHR0aGlzLl9yZXZpZXdTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0UmV2aWV3U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0UmV2aWV3U2VydmljZSwgdGhpcy5fcmV2aWV3U2VydmljZSk7XG5cblx0XHQvLyBUaGUgY2hhbmdlc2V0IHNlcnZpY2UgaXMgcmVzcG9uc2libGUgZm9yIGNvbXB1dGluZywgcHVibGlzaGluZywgYW5kIHBlcnNpc3RpbmcgY2hhbmdlc2V0cy5cblx0XHR0aGlzLl9jaGFuZ2VzZXRzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgdGhpcy5fY2hhbmdlc2V0cyk7XG5cblx0XHQvLyBUaGUgY29vcmRpbmF0b3Igb3ducyBhbGwgQWdlbnRTZXJ2aWNlLXNpZGUgb3JjaGVzdHJhdGlvbiBvZiB0aGUgY2hhbmdlc2V0IGZlYXR1cmU6IGxpZmVjeWNsZVxuXHRcdC8vIGhvb2tzLCBsaXN0U2Vzc2lvbnMgb3ZlcmxheSwgc3Vic2NyaXB0aW9uIFVSSSByb3V0aW5nLCBhbmQgdGhlIGRlZmVycmVkLXJlZnJlc2ggc3RhdGUgbWFjaGluZS5cblx0XHR0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENoYW5nZXNldENvb3JkaW5hdG9yKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4oZSA9PiB0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChlLnNlc3Npb24sIGUuYWN0aXZlKSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGNoYW5nZXNldCBvcGVyYXRpb24gY29udHJpYnV0aW9ucy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkNvbnRyaWJ1dGlvbikpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uQ29udHJpYnV0aW9uKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U3luY09wZXJhdGlvbkNvbnRyaWJ1dGlvbikpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdERpc2NhcmRDaGFuZ2VzT3BlcmF0aW9uQ29udHJpYnV0aW9uKSkpO1xuXG5cdFx0dGhpcy5fY29tcGxldGlvbnMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RDb21wbGV0aW9ucykpO1xuXHRcdC8vIEJ1aWx0LWluIGdlbmVyaWMgcHJvdmlkZXI6IGNvbXBsZXRlcyBmaWxlcyBpbiB0aGUgc2Vzc2lvbidzIHdvcmtzcGFjZSBmb2xkZXIuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRmlsZXMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbXBsZXRpb25zLnJlZ2lzdGVyUHJvdmlkZXIoXG5cdFx0XHRuZXcgQWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlcih0aGlzLl9zdGF0ZU1hbmFnZXIsIHdvcmtzcGFjZUZpbGVzKSxcblx0XHQpKTtcblx0XHQvLyBCdWlsdC1pbiBnZW5lcmljIHByb3ZpZGVyOiBjb21wbGV0ZXMgYCNjaGF0Ojx0aXRsZT5gIHJlZmVyZW5jZXMgdG8gb3RoZXJcblx0XHQvLyBjaGF0cyBpbiB0aGUgc2FtZSBzZXNzaW9uLCBhdHRhY2hpbmcgYSBjaGF0IHRyYW5zY3JpcHQgYXR0YWNobWVudC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb21wbGV0aW9ucy5yZWdpc3RlclByb3ZpZGVyKFxuXHRcdFx0bmV3IEFnZW50SG9zdENoYXRDb21wbGV0aW9uUHJvdmlkZXIodGhpcy5fc3RhdGVNYW5hZ2VyKSxcblx0XHQpKTtcblx0XHQvLyBCdWlsdC1pbiBnZW5lcmljIHByb3ZpZGVyOiBvZmZlcnMgdGhlIGAvcmVuYW1lYCBzbGFzaCBjb21tYW5kIGZvciBhbnlcblx0XHQvLyBzZXNzaW9uIHRoYXQgYWxyZWFkeSBoYXMgaGlzdG9yeS4gRXhlY3V0aW9uIGlzIGhhbmRsZWQgc2VydmVyLXNpZGUgaW5cblx0XHQvLyBBZ2VudFNpZGVFZmZlY3RzIChyZWRpcmVjdGVkIHRvIGEgU2Vzc2lvblRpdGxlQ2hhbmdlZCBhY3Rpb24pLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbXBsZXRpb25zLnJlZ2lzdGVyUHJvdmlkZXIoXG5cdFx0XHRuZXcgQWdlbnRIb3N0UmVuYW1lQ29tcGxldGlvblByb3ZpZGVyKFxuXHRcdFx0XHRzZXNzaW9uID0+ICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy50dXJucy5sZW5ndGggPz8gMCkgPiAwLFxuXHRcdFx0KSxcblx0XHQpKTtcblxuXHRcdC8vIFRlcm1pbmFsIG1hbmFnZW1lbnQgXHUyMDE0IHRoZSB0ZXJtaW5hbCBtYW5hZ2VyIGxpc3RlbnMgdG8gdGhlIHN0YXRlXG5cdFx0Ly8gbWFuYWdlcidzIGFjdGlvbiBzdHJlYW0gYW5kIGRpc3BhdGNoZXMgUFRZIG91dHB1dCBiYWNrIHRocm91Z2ggaXQuXG5cdFx0Ly8gQ3JlYXRlZCBiZWZvcmUgQWdlbnRTaWRlRWZmZWN0cyBhbmQgcmVnaXN0ZXJlZCBpbiB0aGUgbG9jYWwgc2NvcGUgc29cblx0XHQvLyBBZ2VudFNpZGVFZmZlY3RzIGNhbiBjb25zdW1lIGl0IHZpYSBESSAoZm9yIGlubGluZSBgIWNvbW1hbmRgXG5cdFx0Ly8gZXhlY3V0aW9uKS5cblx0XHR0aGlzLl90ZXJtaW5hbE1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgdGhpcy5fdGVybWluYWxNYW5hZ2VyKTtcblxuXHRcdHRoaXMuX2xvY2FsVHVybnMgPSBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyh0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNpZGVFZmZlY3RzLCB0aGlzLl9zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdGdldEFnZW50OiBzZXNzaW9uID0+IHRoaXMuX2ZpbmRQcm92aWRlckZvclNlc3Npb24oc2Vzc2lvbiksXG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdGxvY2FsVHVybnM6IHRoaXMuX2xvY2FsVHVybnMsXG5cdFx0XHRhZ2VudHM6IHRoaXMuX2FnZW50cyxcblx0XHRcdGNvcGlsb3RBcGlTZXJ2aWNlOiBlZmZlY3RpdmVDb3BpbG90QXBpU2VydmljZSxcblx0XHRcdGdldEdpdEh1YkNvcGlsb3RUb2tlbjogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRBdXRoVG9rZW4oe1xuXHRcdFx0XHRcdHJlc291cmNlOiB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCkucmVzb3VyY2UsXG5cdFx0XHRcdFx0c2NvcGVzOiB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCkuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlCZWZvcmVTZW5kOiBwYXJhbXMgPT4gdGhpcy5fcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlCZWZvcmVTZW5kKHBhcmFtcyksXG5cdFx0XHRyZXNvbHZlQ2hhdEF0dGFjaG1lbnRUdXJuczogcmVzb3VyY2UgPT4gdGhpcy5fcmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnMocmVzb3VyY2UpLFxuXHRcdFx0b25UdXJuQ29tcGxldGU6IHNlc3Npb24gPT4ge1xuXHRcdFx0XHRjb25zdCB3b3JraW5nRGlyU3RyID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKT8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0XHRcdHZvaWQgdGhpcy5fZ2l0U3RhdGVTZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChzZXNzaW9uLCB3b3JraW5nRGlyU3RyID8gVVJJLnBhcnNlKHdvcmtpbmdEaXJTdHIpIDogdW5kZWZpbmVkKTtcblx0XHRcdH0sXG5cdFx0XHRvblVzZXJNZXNzYWdlOiAoc2Vzc2lvbiwgdGV4dCkgPT4ge1xuXHRcdFx0XHQvLyBSZWNvcmQgdGhlIEdpdEh1YiBpc3N1ZXMgdGhlIG1lc3NhZ2UgcmVmZXJlbmNlcyBvbiB0aGUgc2Vzc2lvbi5cblx0XHRcdFx0dm9pZCB0aGlzLl9naXRTdGF0ZVNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1Yklzc3VlcyhzZXNzaW9uLnRvU3RyaW5nKCksIHRleHQpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHQvLyBTZXJ2ZXItc2lkZSB0b29scywgZXhlY3V0ZWQgaW4tcHJvY2VzcyBhZ2FpbnN0IGVhY2ggc2Vzc2lvbidzIG93blxuXHRcdC8vIHN0YXRlLiBUaGUgc2V0IG9mIGdyb3VwcyAoYW5kIHRoZWlyIGRpc3BsYXkpIGlzIHRoZSBzaW5nbGUgc291cmNlIG9mXG5cdFx0Ly8gdHJ1dGggaW4gYHNlcnZlclRvb2xHcm91cHMudHNgOyB0aGUgc2Vzc2lvbi1tYW5hZ2VtZW50IGdyb3VwJ3MgcnVudGltZVxuXHRcdC8vIGRlcGVuZGVuY3kgKHRoaXMgc2VydmljZSkgaXMgaW5qZWN0ZWQgdmlhIHRoZSBhY2Nlc3Nvci5cblx0XHR0aGlzLl9zZXJ2ZXJUb29sSG9zdCA9IG5ldyBBZ2VudFNlcnZlclRvb2xIb3N0KHRoaXMuX3N0YXRlTWFuYWdlciwgYnVpbGRTZXJ2ZXJUb29sR3JvdXBzKHRoaXMuX2NyZWF0ZVNlc3Npb25TZXJ2ZXJUb29sQWNjZXNzb3IoKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSByZWdpc3RlcmVkIHByb3ZpZGVycy4gRXhwb3NlZCBzbyBwcm9jZXNzLWxpZmV0aW1lIGJhY2tncm91bmQgam9ic1xuXHQgKiAobm90YWJseSB7QGxpbmsgQWdlbnRNb2RlbFJlZnJlc2hTY2hlZHVsZXJ9KSBjYW4gb2JzZXJ2ZSByZWdpc3RyYXRpb25zXG5cdCAqIHdpdGhvdXQgdGhpcyBzZXJ2aWNlIG93bmluZyBhbiBhbWJpZW50IHJlY3VycmluZyB0aW1lciBvZiBpdHMgb3duLlxuXHQgKi9cblx0Z2V0IGFnZW50cygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9hZ2VudHM7XG5cdH1cblxuXHQvLyAtLS0tIHByb3ZpZGVyIHJlZ2lzdHJhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEluamVjdHMgdGhlIGhvc3Qtb3duZWQge0BsaW5rIFdvcmt0cmVlSXNvbGF0aW9ufSBjb250cm9sbGVyIGFuZCBmb3J3YXJkcyBpdFxuXHQgKiB0byB0aGUgY29sbGFib3JhdG9ycyB0aGF0IGNvbnN1bHQgaXQuIENhbGxlZCBvbmNlIGF0IHN0YXJ0dXAgKGZyb21cblx0ICogYWdlbnRIb3N0TWFpbiAvIGFnZW50SG9zdFNlcnZlck1haW4pIGFmdGVyIHRoZSBicmFuY2gtbmFtZSBnZW5lcmF0b3IgaGFzXG5cdCAqIGJlZW4gd2lyZWQuXG5cdCAqL1xuXHRzZXRXb3JrdHJlZUlzb2xhdGlvbih3b3JrdHJlZTogV29ya3RyZWVJc29sYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl93b3JrdHJlZSA9IHdvcmt0cmVlO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlKTtcblx0XHR0aGlzLl9zaWRlRWZmZWN0cy5zZXRXb3JrdHJlZUlzb2xhdGlvbih3b3JrdHJlZSk7XG5cdH1cblxuXHRwcml2YXRlIF90b1Byb3ZpZGVyQ29uZmlnPFQgZXh0ZW5kcyB7IHJlYWRvbmx5IGNvbmZpZz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0+KHJlcXVlc3Q6IFQpOiBUIHtcblx0XHRpZiAoIXRoaXMuX3dvcmt0cmVlIHx8ICFyZXF1ZXN0LmNvbmZpZykge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3Q7XG5cdFx0fVxuXHRcdHJldHVybiB7IC4uLnJlcXVlc3QsIGNvbmZpZzogb21pdEhvc3RPd25lZFNlc3Npb25Db25maWcocmVxdWVzdC5jb25maWcpIH07XG5cdH1cblxuXHQvKipcblx0ICogSG9zdC1vd25lZCBmaXJzdC1zZW5kIGhvb2sgKGludm9rZWQgYnkge0BsaW5rIEFnZW50U2lkZUVmZmVjdHN9IGJlZm9yZSB0aGVcblx0ICogYWdlbnQgbG9ja3MgaXRzIHN1YnByb2Nlc3MgY3dkKS4gUmVzb2x2ZXMgdGhlIHdvcmtpbmcgZGlyZWN0b3JpZXMgdGhlIHNlc3Npb25cblx0ICogd2lsbCBhY3R1YWxseSBydW4gaW4gYW5kIGhhbmRzIHRoZW0gdG8gdGhlIGFnZW50IGF0IHNlbmQgdGltZTpcblx0ICogIC0gaW5kZXggMCBpcyB0aGUgcHJvY2VzcyByb290OiBmb3IgYHdvcmt0cmVlYCBpc29sYXRpb24gdGhlIGlzb2xhdGVkXG5cdCAqICAgIHdvcmt0cmVlIChjcmVhdGVkIGhlcmUgb24gdGhlIGZpcnN0IHNlbmQsIHNlZVxuXHQgKiAgICB7QGxpbmsgX3Jlc29sdmVXb3JrdHJlZUJlZm9yZVNlbmR9KTsgZm9yIGBmb2xkZXJgIGlzb2xhdGlvbiB0aGUgcGlja2VkXG5cdCAqICAgIGZvbGRlcjsgYHVuZGVmaW5lZGAgKHdob2xlIHJlc3VsdCkgZm9yIHdvcmtzcGFjZS1sZXNzIHNlc3Npb25zLlxuXHQgKiAgLSB0aGUgdGFpbCBjYXJyaWVzIGFueSBhZGRpdGlvbmFsIHNlc3Npb24gcm9vdHMgYXMtaXMgKG9ubHkgaW5kZXggMCBpc1xuXHQgKiAgICB3b3JrdHJlZS1yZW1hcHBlZDsgYWRkaXRpb25hbCByb290cyBhcmUgcGFzc2VkIHRocm91Z2ggdW5jaGFuZ2VkKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZChwYXJhbXM6IHsgc2Vzc2lvbjogc3RyaW5nOyBjaGF0OiBzdHJpbmc7IHR1cm5JZDogc3RyaW5nOyBwcm9tcHQ6IHN0cmluZyB9KTogUHJvbWlzZTxyZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChwYXJhbXMuc2Vzc2lvbik7XG5cdFx0Y29uc3QgcGlja2VkRm9sZGVycyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhwYXJhbXMuc2Vzc2lvbik7XG5cdFx0Y29uc3QgcGlja2VkRm9sZGVyVXJpID0gcGlja2VkRm9sZGVycz8uWzBdID8gVVJJLnBhcnNlKHBpY2tlZEZvbGRlcnNbMF0pIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRhaWwgPSAocGlja2VkRm9sZGVycyA/PyBbXSkuc2xpY2UoMSkubWFwKGQgPT4gVVJJLnBhcnNlKGQpKTtcblxuXHRcdC8vIE9ubHkgd29ya3RyZWUtaXNvbGF0aW9uIHNlc3Npb25zIGRlZmVyIGRpcmVjdG9yeSByZXNvbHV0aW9uIHRvIHRoZSBmaXJzdFxuXHRcdC8vIHNlbmQgKHNvIHRoZSBwcm9tcHQgY2FuIG5hbWUgdGhlIGJyYW5jaCk7IGZvbGRlciAvIHdvcmtzcGFjZS1sZXNzXG5cdFx0Ly8gc2Vzc2lvbnMgcnVuIGRpcmVjdGx5IGluIHRoZSBwaWNrZWQgZm9sZGVyLlxuXHRcdGlmICghdGhpcy5fd29ya3RyZWU/LmlzV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcoc2Vzc2lvbklkKSkge1xuXHRcdFx0aWYgKCFwaWNrZWRGb2xkZXJVcmkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUocGFyYW1zLnNlc3Npb24sIHBpY2tlZEZvbGRlclVyaSk7XG5cdFx0XHRyZXR1cm4gW3Jlc29sdmVkLCAuLi50YWlsXTtcblx0XHR9XG5cblx0XHQvLyBGYWxsIGJhY2sgdG8gdGhlIHBpY2tlZCBmb2xkZXIgd2hlbiB3b3JrdHJlZSBjcmVhdGlvbiBmYWlsZWQgc28gdGhlXG5cdFx0Ly8gc2Vzc2lvbiBzdGlsbCBtYXRlcmlhbGl6ZXMgaW4gdGhlIHVzZXIncyBmb2xkZXIgcmF0aGVyIHRoYW4gbm93aGVyZS5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVXb3JrdHJlZUJlZm9yZVNlbmQoeyAuLi5wYXJhbXMsIHNlc3Npb25JZCwgcGlja2VkRm9sZGVyVXJpIH0pID8/IHBpY2tlZEZvbGRlclVyaTtcblx0XHRyZXR1cm4gcmVzb2x2ZWQgPyBbcmVzb2x2ZWQsIC4uLnRhaWxdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnMocmVzb3VyY2U6IHN0cmluZyk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3QgcmVhZFR1cm5zID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHJlc291cmNlKSA/PyB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShyZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gc3RhdGU/LnR1cm5zO1xuXHRcdH07XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSByZWFkVHVybnMoKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKGlzQWhwQ2hhdENoYW5uZWwocmVzb3VyY2UpID8gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShyZXNvdXJjZSkgOiByZXNvdXJjZSk7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVzdG9yZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uVXJpKTtcblx0XHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXN0b3JlUGVlckNoYXRzKHByb3ZpZGVyLCBzZXNzaW9uVXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlYWRUdXJucygpID8/IFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgdGhlIHNlc3Npb24ncyBpc29sYXRlZCB3b3JrdHJlZSBvbiB0aGUgZmlyc3Qgc2VuZCAoZGVmZXJyZWQgc28gdGhlXG5cdCAqIHVzZXIncyBwcm9tcHQgY2FuIG5hbWUgdGhlIGJyYW5jaCksIHJlcG9ydHMgY3JlYXRpb24gcHJvZ3Jlc3MgYXMgdGhlIGNoYXQnc1xuXHQgKiBhY3Rpdml0eSwgc3VyZmFjZXMgdGhlIFwiQ3JlYXRlZCBpc29sYXRlZCB3b3JrdHJlZVwiIGFubm91bmNlbWVudCBhcyB0aGUgZmlyc3Rcblx0ICogbWFya2Rvd24gcmVzcG9uc2UgcGFydCBvZiB0aGUgdHVybiwgYW5kIHJldHVybnMgdGhlIGNyZWF0ZWQgd29ya3RyZWUgVVJJLlxuXHQgKiBJZGVtcG90ZW50OyBzYWZlIHRvIGNhbGwgb25jZSB0aGUgd29ya3RyZWUgZXhpc3RzLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW5cblx0ICogd29ya3RyZWUgY3JlYXRpb24gZmFpbGVkLiBPbmx5IGludm9rZWQgZm9yIHNlc3Npb25zIHdob3NlIHdvcmt0cmVlIGlzIHN0aWxsXG5cdCAqIHBlbmRpbmcgKHNlZSB7QGxpbmsgX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZH0pLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVdvcmt0cmVlQmVmb3JlU2VuZChwYXJhbXM6IHsgc2Vzc2lvbjogc3RyaW5nOyBjaGF0OiBzdHJpbmc7IHR1cm5JZDogc3RyaW5nOyBwcm9tcHQ6IHN0cmluZzsgc2Vzc2lvbklkOiBzdHJpbmc7IHBpY2tlZEZvbGRlclVyaTogVVJJIHwgdW5kZWZpbmVkIH0pOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgc2Vzc2lvbklkLCBwaWNrZWRGb2xkZXJVcmkgfSA9IHBhcmFtcztcblx0XHRjb25zdCB3b3JrdHJlZSA9IHRoaXMuX3dvcmt0cmVlO1xuXHRcdGlmICghd29ya3RyZWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCByZXBvcnRlZEFjdGl2aXR5ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHdvcmt0cmVlLnJlc29sdmVPbkZpcnN0U2VuZCh7XG5cdFx0XHRcdHNlc3Npb25Vcmk6IFVSSS5wYXJzZShwYXJhbXMuc2Vzc2lvbiksXG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcGlja2VkRm9sZGVyVXJpLFxuXHRcdFx0XHRjb25maWc6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXMocGFyYW1zLnNlc3Npb24pLFxuXHRcdFx0XHRwcm9tcHQ6IHBhcmFtcy5wcm9tcHQsXG5cdFx0XHRcdGdpdGh1YlRva2VuOiB0aGlzLmdldEF1dGhUb2tlbih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKS5yZXNvdXJjZSxcblx0XHRcdFx0XHRzY29wZXM6IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKS5zY29wZXNfc3VwcG9ydGVkLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0b25Qcm9ncmVzczogYWN0aXZpdHkgPT4ge1xuXHRcdFx0XHRcdHJlcG9ydGVkQWN0aXZpdHkgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwYXJhbXMuY2hhdCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRBY3Rpdml0eUNoYW5nZWQsIGFjdGl2aXR5IH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIHdvcmt0cmVlIHJlc29sdXRpb24gZmFpbGVkIGZvciAke3BhcmFtcy5zZXNzaW9ufTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdH1cblx0XHQvLyBDbGVhciBvbiBldmVyeSBleGl0IHBhdGggc28gYSBmYWlsZWQgY3JlYXRpb24gY2FuJ3Qgc3RyYW5kIHRoZSBjaGF0XG5cdFx0Ly8gb24gYSBzdGFsZSBcIkNyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlXCIgYWN0aXZpdHkuXG5cdFx0aWYgKHJlcG9ydGVkQWN0aXZpdHkpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwYXJhbXMuY2hhdCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRBY3Rpdml0eUNoYW5nZWQsIGFjdGl2aXR5OiB1bmRlZmluZWQgfSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFubm91bmNlbWVudCA9IHdvcmt0cmVlLnRha2VQZW5kaW5nQW5ub3VuY2VtZW50KHNlc3Npb25JZCk7XG5cdFx0aWYgKGFubm91bmNlbWVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGFyYW1zLmNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGdlbmVyYXRlVXVpZCgpLCBjb250ZW50OiBhbm5vdW5jZW1lbnQgfSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gd29ya3RyZWUuZ2V0UmVzb2x2ZWRXb3JrdHJlZShzZXNzaW9uSWQpO1xuXHR9XG5cblx0cmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcjogSUFnZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVycy5oYXMocHJvdmlkZXIuaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50IHByb3ZpZGVyIGFscmVhZHkgcmVnaXN0ZXJlZDogJHtwcm92aWRlci5pZH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBSZWdpc3RlcmluZyBhZ2VudCBwcm92aWRlcjogJHtwcm92aWRlci5pZH1gKTtcblx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KHByb3ZpZGVyLmlkLCBwcm92aWRlcik7XG5cdFx0cHJvdmlkZXIuc2V0U2VydmVyVG9vbEhvc3Q/Lih0aGlzLl9zZXJ2ZXJUb29sSG9zdCk7XG5cdFx0Ly8gRGV0ZXJtaW5pc3RpYyBzdWJhZ2VudCBtZW1iZXJzaGlwIG9yZGVyaW5nOiBhcHBseSBhIHNwYXduZWQgc3ViYWdlbnQnc1xuXHRcdC8vIGNhdGFsb2cgbWVtYmVyc2hpcCAodmlhIHRoZSBzcGF3bi1jaGFubmVsIGhhbmRsZXJzKSBCRUZPUkVcblx0XHQvLyBBZ2VudFNpZGVFZmZlY3RzIFx1MjAxNCByZWdpc3RlcmVkIG5leHQgXHUyMDE0IGhhbmRsZXMgdGhlIHNhbWUgc2lnbmFsIGFuZCBzdGFydHNcblx0XHQvLyBhIHR1cm4gb24gdGhlIHN1YmFnZW50IGNoYXQsIHdoaWNoIHJlcXVpcmVzIHRoYXQgY2hhdCB0byBhbHJlYWR5IGV4aXN0LlxuXHRcdC8vIFJlZ2lzdGVyaW5nIHRoaXMgbGlzdGVuZXIgYWhlYWQgb2YgdGhlIHNpZGUtZWZmZWN0cyBsaXN0ZW5lciBtYWtlcyB0aGVcblx0XHQvLyBvcmRlcmluZyBpbmRlcGVuZGVudCBvZiB3aGVuIHRoZSBhZ2VudCByZWdpc3RlcnMgaXRzIG93biBzdWJhZ2VudC0+c3Bhd25cblx0XHQvLyBicmlkZ2U7IGFkZENoYXQvcmVtb3ZlQ2hhdCBhcmUgaWRlbXBvdGVudCwgc28gdGhlIG92ZXJsYXAgaXMgc2FmZS5cblx0XHR0aGlzLl9wcm92aWRlclN1YnNjcmlwdGlvbnMuYWRkKHByb3ZpZGVyLm9uRGlkU2Vzc2lvblByb2dyZXNzKHNpZ25hbCA9PiB0aGlzLl9zZXF1ZW5jZVNwYXduZWRDaGF0KHNpZ25hbCkpKTtcblx0XHR0aGlzLl9wcm92aWRlclN1YnNjcmlwdGlvbnMuYWRkKHRoaXMuX3NpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihwcm92aWRlcikpO1xuXHRcdGlmIChwcm92aWRlci5vbkRpZE1hdGVyaWFsaXplU2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJTdWJzY3JpcHRpb25zLmFkZChwcm92aWRlci5vbkRpZE1hdGVyaWFsaXplU2Vzc2lvbihlID0+IHRoaXMuX29uRGlkTWF0ZXJpYWxpemVTZXNzaW9uKGUpKSk7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlci5vbk1jcE5vdGlmaWNhdGlvbikge1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJTdWJzY3JpcHRpb25zLmFkZChwcm92aWRlci5vbk1jcE5vdGlmaWNhdGlvbihlID0+IHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmZpcmUoZSkpKTtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ2hhdERhdGEpIHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyU3Vic2NyaXB0aW9ucy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VDaGF0RGF0YShlID0+IHRoaXMuX29uQ2hhdERhdGFDaGFuZ2VkKGUpKSk7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlci5vbkRpZFNwYXduQ2hhdCkge1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJTdWJzY3JpcHRpb25zLmFkZChwcm92aWRlci5vbkRpZFNwYXduQ2hhdChlID0+IHRoaXMuX29uQ2hhdFNwYXduZWQoZSkpKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXJTa2lsbENvbXBsZXRpb25Qcm92aWRlcigpO1xuXHRcdGlmICghdGhpcy5fZGVmYXVsdFByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0UHJvdmlkZXIgPSBwcm92aWRlci5pZDtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgcm9vdCBzdGF0ZSB3aXRoIGN1cnJlbnQgYWdlbnRzIGxpc3Rcblx0XHR0aGlzLl91cGRhdGVBZ2VudHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyU2tpbGxDb21wbGV0aW9uUHJvdmlkZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NraWxsQ29tcGxldGlvblByb3ZpZGVyUmVnaXN0ZXJlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9za2lsbENvbXBsZXRpb25Qcm92aWRlclJlZ2lzdGVyZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyKFxuXHRcdFx0c2Vzc2lvbiA9PiB0aGlzLl9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKHNlc3Npb24pLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbXBsZXRpb25zLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0fVxuXG5cdC8vIC0tLS0gYXV0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBhdXRoZW50aWNhdGUocGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPEF1dGhlbnRpY2F0ZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9hdXRoU2VydmljZS5hdXRoZW50aWNhdGUocGFyYW1zLCB0aGlzLl9wcm92aWRlcnMudmFsdWVzKCkpO1xuXHR9XG5cblx0Z2V0QXV0aFRva2VuKHJlcXVlc3Q6IElBZ2VudEhvc3RBdXRoVG9rZW5SZXF1ZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYXV0aFNlcnZpY2UuZ2V0QXV0aFRva2VuKHJlcXVlc3QpO1xuXHR9XG5cblx0Ly8gLS0tLSBDaGFuZ2VzZXQgb3BlcmF0aW9uIGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uKHBhcmFtczogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zKTogUHJvbWlzZTxJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS5pbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24ocGFyYW1zKTtcblx0fVxuXG5cdC8vIC0tLS0gTUNQIGBtY3A6Ly9gIGNoYW5uZWwgcm91dGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGhhbmRsZU1jcFJlcXVlc3QoY2hhbm5lbDogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHJvdXRlID0gcGFyc2VNY3BDaGFubmVsVXJpKGNoYW5uZWwpO1xuXHRcdGlmICghcm91dGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWV0aG9kIG5vdCBmb3VuZDogaW52YWxpZCBtY3A6Ly8gY2hhbm5lbCAke2NoYW5uZWx9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJzLmdldChyb3V0ZS5wcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyIHx8ICFwcm92aWRlci5oYW5kbGVNY3BSZXF1ZXN0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1ldGhvZCBub3QgZm91bmQ6IG5vIHByb3ZpZGVyIGZvciBtY3A6Ly8gY2hhbm5lbCAke2NoYW5uZWx9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKHJvdXRlLnByb3ZpZGVySWQsIHJvdXRlLnNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHByb3ZpZGVyLmhhbmRsZU1jcFJlcXVlc3Qoc2Vzc2lvblVyaSwgcm91dGUuc2VydmVyTmFtZSwgbWV0aG9kLCBwYXJhbXMpO1xuXHR9XG5cblx0Ly8gLS0tLSBzZXNzaW9uIG1hbmFnZW1lbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIGRlcGVuZGVuY3kgc3VyZmFjZSB0aGUgc2Vzc2lvbiBzZXJ2ZXItdG9vbCBncm91cCBuZWVkcywgYm91bmRcblx0ICogdG8gdGhpcyBzZXJ2aWNlIHNvIHRoZSBncm91cCBzdGF5cyBkZWNvdXBsZWQgZnJvbSB0aGUgY29uY3JldGUgaG9zdC5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZVNlc3Npb25TZXJ2ZXJUb29sQWNjZXNzb3IoKTogSVNlc3Npb25TZXJ2ZXJUb29sQWNjZXNzb3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaXN0U2Vzc2lvbnM6ICgpID0+IHRoaXMubGlzdFNlc3Npb25zKCksXG5cdFx0XHRjcmVhdGVTZXNzaW9uOiBjb25maWcgPT4gdGhpcy5jcmVhdGVTZXNzaW9uKGNvbmZpZyksXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWxzOiBJQWdlbnRNb2RlbEluZm9bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX3Byb3ZpZGVycy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdG1vZGVscy5wdXNoKC4uLnByb3ZpZGVyLm1vZGVscy5nZXQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG1vZGVscztcblx0XHRcdH0sXG5cdFx0XHRzdGFydFByb21wdDogKHNlc3Npb24sIGNoYXQsIHByb21wdCkgPT4gdGhpcy5fc3RhcnRTZXNzaW9uUHJvbXB0KHNlc3Npb24sIGNoYXQsIHByb21wdCksXG5cdFx0XHRjcmVhdGVDaGF0OiAoc2Vzc2lvbiwgY2hhdCwgb3B0aW9ucykgPT4gdGhpcy5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXQsIChvcHRpb25zPy50aXRsZSAhPT0gdW5kZWZpbmVkIHx8IG9wdGlvbnM/Lm1vZGVsICE9PSB1bmRlZmluZWQpXG5cdFx0XHRcdD8geyAuLi4ob3B0aW9ucy50aXRsZSAhPT0gdW5kZWZpbmVkID8geyB0aXRsZTogb3B0aW9ucy50aXRsZSB9IDoge30pLCAuLi4ob3B0aW9ucy5tb2RlbCAhPT0gdW5kZWZpbmVkID8geyBtb2RlbDogeyBpZDogb3B0aW9ucy5tb2RlbC5pZCB9IH0gOiB7fSkgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCksXG5cdFx0XHRkZWxldGVTZXNzaW9uOiBzZXNzaW9uID0+IHRoaXMuZGlzcG9zZVNlc3Npb24oc2Vzc2lvbiksXG5cdFx0XHRnZXRDaGF0Q29udGV4dDogKHNlc3Npb24sIGNoYXRJZCkgPT4gdGhpcy5fZ2V0Q2hhdENvbnRleHQoc2Vzc2lvbiwgY2hhdElkKSxcblx0XHRcdC8vIFJlYWRzIHRoZSBgY3JlYXRlX3Nlc3Npb25gIHNwYXduIGRlcHRoIGZyb20gYSBzZXNzaW9uJ3MgYF9tZXRhYCAoMCB3aGVuIGFic2VudCkuXG5cdFx0XHRnZXRTZXNzaW9uU3Bhd25EZXB0aDogc2Vzc2lvbiA9PiByZWFkU2Vzc2lvblNwYXduRGVwdGgodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb24udG9TdHJpbmcoKSk/Ll9tZXRhKSxcblx0XHRcdC8vIFN0YW1wcyBhIHNlc3Npb24ncyBgY3JlYXRlX3Nlc3Npb25gIHNwYXduIGRlcHRoIGludG8gaXRzIGBfbWV0YWAgKG1lcmdpbmcgZXhpc3Rpbmcga2V5cykuXG5cdFx0XHRzZXRTZXNzaW9uU3Bhd25EZXB0aDogKHNlc3Npb24sIGRlcHRoKSA9PiB0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbi50b1N0cmluZygpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1ldGFDaGFuZ2VkLFxuXHRcdFx0XHRfbWV0YTogd2l0aFNlc3Npb25TcGF3bkRlcHRoKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uLnRvU3RyaW5nKCkpPy5fbWV0YSwgZGVwdGgpLFxuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGFydHMgdGhlIGZpcnN0IHR1cm4gb24gYSBmcmVzaGx5LWNyZWF0ZWQgc2Vzc2lvbiBieSBkaXNwYXRjaGluZyBhXG5cdCAqIGBDaGF0VHVyblN0YXJ0ZWRgIGFuZCByb3V0aW5nIGl0IHRocm91Z2ggdGhlIHNhbWUgc2lkZS1lZmZlY3RzIHBhdGggYVxuXHQgKiBjbGllbnQtaW5pdGlhdGVkIHR1cm4gdGFrZXMgKHdoaWNoIHNlbmRzIHRoZSBtZXNzYWdlIHRvIHRoZSBwcm92aWRlcikuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zdGFydFNlc3Npb25Qcm9tcHQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIHByb21wdDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWVzc2FnZTogTWVzc2FnZSA9IHsgdGV4dDogcHJvbXB0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH07XG5cdFx0Y29uc3QgYWN0aW9uID0geyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiBnZW5lcmF0ZVV1aWQoKSwgc3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksIG1lc3NhZ2UgfSBhcyBjb25zdDtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhdC50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdHRoaXMuX3NpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihjaGF0LnRvU3RyaW5nKCksIGFjdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgYSBwb2ludC1pbi10aW1lIHNuYXBzaG90IG9mIGEgc2Vzc2lvbidzIGNoYXQgY29udmVyc2F0aW9uIGZvciB0aGVcblx0ICogYGdldF9zZXNzaW9uX2NvbnRleHRgIHNlcnZlciB0b29sLiBUYXJnZXRzIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0LCBvciBhXG5cdCAqIHNwZWNpZmljIHBlZXIgY2hhdCB3aGVuIGBjaGF0SWRgIGlzIHByb3ZpZGVkLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm9cblx0ICogbGl2ZSBjb252ZXJzYXRpb24gc3RhdGUgZXhpc3RzIChlLmcuIGEgY29sZC91bnN1YnNjcmliZWQgc2Vzc2lvbikuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRDaGF0Q29udGV4dChzZXNzaW9uOiBVUkksIGNoYXRJZD86IHN0cmluZyk6IElDaGF0Q29udGV4dFNuYXBzaG90IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjaGF0U3RhdGUgPSBjaGF0SWRcblx0XHRcdD8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShidWlsZENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0SWQpKVxuXHRcdFx0OiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGlmICghY2hhdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVybnM6IGNoYXRTdGF0ZS50dXJucyxcblx0XHRcdC4uLihjaGF0U3RhdGUuYWN0aXZlVHVybiA/IHsgYWN0aXZlVHVybjogeyBtZXNzYWdlOiBjaGF0U3RhdGUuYWN0aXZlVHVybi5tZXNzYWdlLCByZXNwb25zZVBhcnRzOiBjaGF0U3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzIH0gfSA6IHt9KSxcblx0XHRcdGhhc01vcmVIaXN0b3J5OiAhIWNoYXRTdGF0ZS50dXJuc05leHRDdXJzb3IsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBhaXJzIHJlcG9zaXRvcnkgcm9vdHMgd3JpdHRlbiBieSBvbGRlciBidWlsZHMgdGhhdCB0cmVhdGVkIGEgcGFyZW50IGxpbmtlZCBjaGVja291dCBhcyB0aGUgcmVwb3NpdG9yeS5cblx0ICogTGlzdGluZyBwZXJmb3JtcyB0aGlzIG1pZ3JhdGlvbiBiZWNhdXNlIGFyY2hpdmVkIHNlc3Npb25zIG1heSBuZXZlciByZXN1bWUgdGhyb3VnaCBXb3JrdHJlZUlzb2xhdGlvbidzIG1ldGFkYXRhIHJlYWRlci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX25vcm1hbGl6ZUxpc3RlZFdvcmt0cmVlUmVwb3NpdG9yeVJvb3Qoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbk1ldGFkYXRhLCBkYXRhYmFzZTogSVNlc3Npb25EYXRhYmFzZSwgcmVwb3NpdG9yeVJvb3RSYXc6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc3RvcmVkUmVwb3NpdG9yeVJvb3RSYXcgPSByZXBvc2l0b3J5Um9vdFJhdztcblx0XHRjb25zdCBwZXJzaXN0ZWRSb290ID0gVVJJLnBhcnNlKHJlcG9zaXRvcnlSb290UmF3KTtcblx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvbi5zZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0bGV0IHByaW1hcnlSb290ID0gdGhpcy5fbm9ybWFsaXplZFdvcmt0cmVlUmVwb3NpdG9yeVJvb3RzLmdldChzZXNzaW9uU3RyKTtcblx0XHRpZiAoIXByaW1hcnlSb290KSB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRcdGNvbnN0IGNoZWNrb3V0Um9vdCA9IHdvcmtpbmdEaXJlY3RvcnkgJiYgYXdhaXQgdGhpcy5fZmlsZUV4aXN0c1NhZmUod29ya2luZ0RpcmVjdG9yeSkgPyB3b3JraW5nRGlyZWN0b3J5IDogcGVyc2lzdGVkUm9vdDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHByaW1hcnlSb290ID0gYXdhaXQgdHJ5UmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QodGhpcy5fZ2l0U2VydmljZSwgY2hlY2tvdXRSb290KVxuXHRcdFx0XHRcdD8/IChjaGVja291dFJvb3QudG9TdHJpbmcoKSAhPT0gcGVyc2lzdGVkUm9vdC50b1N0cmluZygpID8gYXdhaXQgdHJ5UmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QodGhpcy5fZ2l0U2VydmljZSwgcGVyc2lzdGVkUm9vdCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAocHJpbWFyeVJvb3QpIHtcblx0XHRcdFx0XHR0aGlzLl9ub3JtYWxpemVkV29ya3RyZWVSZXBvc2l0b3J5Um9vdHMuc2V0KHNlc3Npb25TdHIsIHByaW1hcnlSb290KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXVtsaXN0U2Vzc2lvbnNdIEZhaWxlZCB0byByZXNvbHZlIHByaW1hcnkgd29ya3RyZWUgZm9yICR7c2Vzc2lvbi5zZXNzaW9ufWAsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHByaW1hcnlSb290KSB7XG5cdFx0XHRyZXBvc2l0b3J5Um9vdFJhdyA9IHByaW1hcnlSb290LnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlmIChyZXBvc2l0b3J5Um9vdFJhdyAhPT0gc3RvcmVkUmVwb3NpdG9yeVJvb3RSYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGRhdGFiYXNlLnNldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09ULCByZXBvc2l0b3J5Um9vdFJhdyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdW2xpc3RTZXNzaW9uc10gRmFpbGVkIHRvIG5vcm1hbGl6ZSB3b3JrdHJlZSByZXBvc2l0b3J5IG1ldGFkYXRhIGZvciAke3Nlc3Npb24uc2Vzc2lvbn1gLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXBvc2l0b3J5Um9vdFJhdztcblx0fVxuXG5cdGFzeW5jIGxpc3RTZXNzaW9ucygpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YVtdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0FnZW50U2VydmljZV0gbGlzdFNlc3Npb25zIGNhbGxlZCcpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChcblx0XHRcdFsuLi50aGlzLl9wcm92aWRlcnMudmFsdWVzKCldLm1hcChwID0+IHAubGlzdFNlc3Npb25zKCkpXG5cdFx0KTtcblx0XHRjb25zdCBmbGF0ID0gcmVzdWx0cy5mbGF0KCk7XG5cblx0XHQvLyBPdmVybGF5IHBlcnNpc3RlZCBjdXN0b20gdGl0bGVzIGZyb20gcGVyLXNlc3Npb24gZGF0YWJhc2VzLlxuXHRcdGNvbnN0IG92ZXJsYWlkID0gYXdhaXQgUHJvbWlzZS5hbGwoZmxhdC5tYXAoYXN5bmMgKHMpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzLnNlc3Npb24pO1xuXHRcdFx0XHRpZiAoIXJlZikge1xuXHRcdFx0XHRcdHJldHVybiBzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gQmF0Y2ggdGhlIGFsd2F5cy1yZXF1aXJlZCBrZXlzICh0aXRsZSAvIHJlYWQgLyBhcmNoaXZlXG5cdFx0XHRcdFx0Ly8gZmxhZ3MpIHdpdGggYW55IGtleXMgdGhlIGNoYW5nZXNldCBjb29yZGluYXRvciBhc2tzIGZvclxuXHRcdFx0XHRcdC8vIHNvIHRoZSBzZXNzaW9uIERCIGlzIGhpdCBleGFjdGx5IG9uY2UuIFRoZSBjb29yZGluYXRvclxuXHRcdFx0XHRcdC8vIHJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBhIGxpdmUgc291cmNlIGNhbiBhbHJlYWR5XG5cdFx0XHRcdFx0Ly8gYW5zd2VyIHRoZSBjYXRhbG9ndWUgcXVlc3Rpb24sIGF2b2lkaW5nIHRoZVxuXHRcdFx0XHRcdC8vIHBvdGVudGlhbGx5LWxhcmdlIHBlcnNpc3RlZCBibG9icyBlbnRpcmVseS5cblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gcy5zZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QgY2hhbmdlc2V0S2V5cyA9IHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLmdldExpc3RNZXRhZGF0YUtleXMoc2Vzc2lvblN0cik7XG5cdFx0XHRcdFx0Y29uc3QgbWV0YWRhdGFLZXlzOiBSZWNvcmQ8c3RyaW5nLCB0cnVlPiA9IGNoYW5nZXNldEtleXNcblx0XHRcdFx0XHRcdD8geyBjdXN0b21UaXRsZTogdHJ1ZSwgW0FIX01FVEFfSVNfUkVBRF9EQl9LRVldOiB0cnVlLCBbQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVldOiB0cnVlLCBbQUhfTUVUQV9JU19ET05FX0RCX0tFWV06IHRydWUsIFtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXTogdHJ1ZSwgW1BFRVJfQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWV06IHRydWUsIFtXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVF06IHRydWUsIC4uLkdJVF9EQl9NRVRBREFUQV9LRVlTLCAuLi5jaGFuZ2VzZXRLZXlzIH1cblx0XHRcdFx0XHRcdDogeyBjdXN0b21UaXRsZTogdHJ1ZSwgW0FIX01FVEFfSVNfUkVBRF9EQl9LRVldOiB0cnVlLCBbQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVldOiB0cnVlLCBbQUhfTUVUQV9JU19ET05FX0RCX0tFWV06IHRydWUsIFtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXTogdHJ1ZSwgW1BFRVJfQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWV06IHRydWUsIFtXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVF06IHRydWUsIC4uLkdJVF9EQl9NRVRBREFUQV9LRVlTIH07XG5cdFx0XHRcdFx0Y29uc3QgbSA9IGF3YWl0IHJlZi5vYmplY3QuZ2V0TWV0YWRhdGFPYmplY3QobWV0YWRhdGFLZXlzKTtcblx0XHRcdFx0XHQvLyBUaGlzIHNlc3Npb24gaXMgYW4gaW50ZXJuYWwgcGVlci1jaGF0IGJhY2tpbmcgKGUuZy4gYVxuXHRcdFx0XHRcdC8vIENsYXVkZSBwZWVyIGNoYXQncyBTREsgc2Vzc2lvbiwgZW51bWVyYXRlZCBieSB0aGUgYWdlbnQnc1xuXHRcdFx0XHRcdC8vIG93biBgbGlzdFNlc3Npb25zYCkuIERyb3AgaXQgc28gaXQgbmV2ZXIgbGVha3MgYXMgYVxuXHRcdFx0XHRcdC8vIHN0YW5kYWxvbmUgdG9wLWxldmVsIHNlc3Npb24gXHUyMDE0IG1pcnJvcnMgdGhlIHN1YmFnZW50IGZpbHRlclxuXHRcdFx0XHRcdC8vIG9uIHRoZSBzdGF0ZS1tYW5hZ2VyIG92ZXJsYXkgcGF0aCBiZWxvdy5cblx0XHRcdFx0XHRpZiAobVtQRUVSX0NIQVRfQkFDS0lOR19NRVRBREFUQV9LRVldKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgdXBkYXRlZCA9IHM7XG5cdFx0XHRcdFx0aWYgKG0uY3VzdG9tVGl0bGUpIHtcblx0XHRcdFx0XHRcdHVwZGF0ZWQgPSB7IC4uLnVwZGF0ZWQsIHN1bW1hcnk6IG0uY3VzdG9tVGl0bGUgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gYGlzRG9uZWAgaXMgdGhlIGxlZ2FjeSBrZXkgZm9yIGBpc0FyY2hpdmVkYC5cblx0XHRcdFx0XHRpZiAobVtBSF9NRVRBX0lTX1JFQURfREJfS0VZXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkID0geyAuLi51cGRhdGVkLCBzdGF0dXM6IHdpdGhTZXNzaW9uU3RhdHVzRmxhZyh1cGRhdGVkLnN0YXR1cyA/PyBTZXNzaW9uU3RhdHVzLklkbGUsIFNlc3Npb25TdGF0dXMuSXNSZWFkLCBtW0FIX01FVEFfSVNfUkVBRF9EQl9LRVldID09PSAndHJ1ZScpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBlcnNpc3RlZEFyY2hpdmVkID0gbVtBSF9NRVRBX0lTX0FSQ0hJVkVEX0RCX0tFWV0gPz8gbVtBSF9NRVRBX0lTX0RPTkVfREJfS0VZXTtcblx0XHRcdFx0XHRpZiAocGVyc2lzdGVkQXJjaGl2ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dXBkYXRlZCA9IHsgLi4udXBkYXRlZCwgc3RhdHVzOiB3aXRoU2Vzc2lvblN0YXR1c0ZsYWcodXBkYXRlZC5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5JZGxlLCBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQsIHBlcnNpc3RlZEFyY2hpdmVkID09PSAndHJ1ZScpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtW01FVEFfR0lUX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZ2l0U3RhdGUgPSBKU09OLnBhcnNlKG1bTUVUQV9HSVRfU1RBVEVdKSBhcyBJU2Vzc2lvbkdpdFN0YXRlO1xuXHRcdFx0XHRcdFx0XHR1cGRhdGVkID0geyAuLi51cGRhdGVkLCBfbWV0YTogd2l0aFNlc3Npb25HaXRTdGF0ZSh1cGRhdGVkLl9tZXRhLCBnaXRTdGF0ZSkgfTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXVtsaXN0U2Vzc2lvbnNdIEZhaWxlZCB0byBwYXJzZSBHaXQgc3RhdGUgZm9yICR7cy5zZXNzaW9ufWAsIGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobVtNRVRBX0dJVEhVQl9TVEFURV0pIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGdpdEh1YlN0YXRlID0gSlNPTi5wYXJzZShtW01FVEFfR0lUSFVCX1NUQVRFXSkgYXMgSVNlc3Npb25HaXRIdWJTdGF0ZTtcblx0XHRcdFx0XHRcdFx0dXBkYXRlZCA9IHsgLi4udXBkYXRlZCwgX21ldGE6IHdpdGhTZXNzaW9uR2l0SHViU3RhdGUodXBkYXRlZC5fbWV0YSwgZ2l0SHViU3RhdGUpIH07XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV1bbGlzdFNlc3Npb25zXSBGYWlsZWQgdG8gcGFyc2UgR2l0SHViIHN0YXRlIGZvciAke3Muc2Vzc2lvbn1gLCBlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAobVtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkID0geyAuLi51cGRhdGVkLCBfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVwZGF0ZWQuX21ldGEsIG1bQUhfTUVUQV9XT1JLU1BBQ0VMRVNTX0RCX0tFWV0gPT09ICd0cnVlJykgfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgcmVwb3NpdG9yeVJvb3RSYXcgPSBtW1dPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09UXTtcblx0XHRcdFx0XHRpZiAocmVwb3NpdG9yeVJvb3RSYXcpIHtcblx0XHRcdFx0XHRcdHJlcG9zaXRvcnlSb290UmF3ID0gYXdhaXQgdGhpcy5fbm9ybWFsaXplTGlzdGVkV29ya3RyZWVSZXBvc2l0b3J5Um9vdCh1cGRhdGVkLCByZWYub2JqZWN0LCByZXBvc2l0b3J5Um9vdFJhdyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHdvcmt0cmVlUHJvamVjdCA9IHdvcmt0cmVlUHJvamVjdEZyb21SZXBvc2l0b3J5Um9vdChyZXBvc2l0b3J5Um9vdFJhdyk7XG5cdFx0XHRcdFx0aWYgKHdvcmt0cmVlUHJvamVjdCkge1xuXHRcdFx0XHRcdFx0dXBkYXRlZCA9IHsgLi4udXBkYXRlZCwgcHJvamVjdDogd29ya3RyZWVQcm9qZWN0IH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLmRlY29yYXRlTGlzdEVudHJ5KHVwZGF0ZWQsIG0gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPik7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byByZWFkIHNlc3Npb24gbWV0YWRhdGEgb3ZlcmxheSBmb3IgJHtzLnNlc3Npb259YCwgZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcztcblx0XHR9KSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gb3ZlcmxhaWQuZmlsdGVyKChzKTogcyBpcyBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgPT4gcyAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdC8vIE92ZXJsYXkgbGl2ZSBzZXNzaW9uIHN0YXRlIGZyb20gdGhlIHN0YXRlIG1hbmFnZXIuXG5cdFx0Ly8gRm9yIHRoZSB0aXRsZSwgcHJlZmVyIHRoZSBzdGF0ZSBtYW5hZ2VyJ3MgdmFsdWUgd2hlbiBpdCBpc1xuXHRcdC8vIG5vbi1lbXB0eSwgc28gU0RLLXNvdXJjZWQgdGl0bGVzIGFyZSBub3Qgb3ZlcndyaXR0ZW4gYnkgdGhlXG5cdFx0Ly8gaW5pdGlhbCBlbXB0eSBwbGFjZWhvbGRlci4gVGhlIGRlZmF1bHQgY2hhbmdlc2V0IGNhdGFsb2d1ZSBsaXZlc1xuXHRcdC8vIG9uIGBzdGF0ZS5jaGFuZ2VzZXRzYCAoc2VlZGVkIGFmdGVyIGBjcmVhdGVTZXNzaW9uYCAvXG5cdFx0Ly8gYHJlc3RvcmVTZXNzaW9uYCBhbmQgcmVmcmVzaGVkIGFmdGVyIGVhY2ggY29tcHV0ZSBwYXNzKSBhbmQgdGhlXG5cdFx0Ly8gY2hpcCBhZ2dyZWdhdGUgb24gdGhlIGNhdGFsb2cgc3VtbWFyeSdzIGBjaGFuZ2VzYDsgYm90aCBtdXN0IGJlXG5cdFx0Ly8gc3VyZmFjZWQgaGVyZSBzbyBhIGZyZXNoIGBsaXN0U2Vzc2lvbnNgIGNhbGwgcmV0dXJucyB0aGUgc2FtZSB2YWx1ZXNcblx0XHQvLyBzdWJzY3JpYmVycyBzZWUgdmlhIHRoZSBwZXItc2Vzc2lvbiBhY3Rpb24gc3RyZWFtIGFuZFxuXHRcdC8vIGBub3RpZnkvc2Vzc2lvblN1bW1hcnlDaGFuZ2VkYC5cblx0XHRjb25zdCB3aXRoU3RhdHVzID0gcmVzdWx0Lm1hcChzID0+IHtcblx0XHRcdGNvbnN0IGxpdmVTdW1tYXJ5ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHMuc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGlmIChsaXZlU3VtbWFyeSkge1xuXHRcdFx0XHQvLyBPdmVybGF5IHRoZSBsaXZlIGBfbWV0YWAgb3ZlciB0aGUgREItZGVyaXZlZCB2YWx1ZS4gVGhlIGxpdmVcblx0XHRcdFx0Ly8gYF9tZXRhYCBpcyB0aGUgZnJlc2hlc3Qgc291cmNlIChlLmcuIHRoZSBHaXRIdWIgc3RhdGUgaXNcblx0XHRcdFx0Ly8gcHVibGlzaGVkIGhlcmUgYXMgc29vbiBhcyBhIFBSIGlzIGNyZWF0ZWQpLCBzbyBhIGZyZXNobHktY3JlYXRlZFxuXHRcdFx0XHQvLyBzZXNzaW9uIHRoYXQgaGFzIG5vdCB5ZXQgcGVyc2lzdGVkIGl0cyBzdGF0ZSB0byBpdHMgc2Vzc2lvblxuXHRcdFx0XHQvLyBkYXRhYmFzZSBzdGlsbCByZXBvcnRzIGl0IGhlcmUuIEtlZXAgdGhlIERCIHZhbHVlIGFzIHRoZSBiYXNlIHNvXG5cdFx0XHRcdC8vIGFueSBrZXlzIGFic2VudCBmcm9tIHRoZSBsaXZlIGBfbWV0YWAgYXJlIHByZXNlcnZlZC5cblx0XHRcdFx0Y29uc3QgX21ldGEgPSBsaXZlU3VtbWFyeS5fbWV0YSAhPT0gdW5kZWZpbmVkIHx8IHMuX21ldGEgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8geyAuLi5zLl9tZXRhLCAuLi5saXZlU3VtbWFyeS5fbWV0YSB9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGxpdmVXb3JraW5nRGlycyA9IGxpdmVTdW1tYXJ5LndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5zLFxuXHRcdFx0XHRcdHN1bW1hcnk6IGxpdmVTdW1tYXJ5LnRpdGxlIHx8IHMuc3VtbWFyeSxcblx0XHRcdFx0XHQvLyBTdXBlcnNlZGVzIHRoZSBmbGFncyBmb2xkZWQgaW4gYWJvdmU6IHRoZSBzdGF0ZSBtYW5hZ2VyIHNlZWRlZFxuXHRcdFx0XHRcdC8vIHRoZW0gZnJvbSB0aGUgc2FtZSBkYXRhYmFzZSBvbiByZXN0b3JlIGFuZCBoYXMgYXBwbGllZCBldmVyeVxuXHRcdFx0XHRcdC8vIG11dGF0aW9uIHNpbmNlLlxuXHRcdFx0XHRcdHN0YXR1czogbGl2ZVN1bW1hcnkuc3RhdHVzLFxuXHRcdFx0XHRcdGFjdGl2aXR5OiBsaXZlU3VtbWFyeS5hY3Rpdml0eSxcblx0XHRcdFx0XHRtb2RpZmllZFRpbWU6IERhdGUucGFyc2UobGl2ZVN1bW1hcnkubW9kaWZpZWRBdCksXG5cdFx0XHRcdFx0cHJvamVjdDogbGl2ZVN1bW1hcnkucHJvamVjdFxuXHRcdFx0XHRcdFx0PyB7IHVyaTogVVJJLnBhcnNlKGxpdmVTdW1tYXJ5LnByb2plY3QudXJpKSwgZGlzcGxheU5hbWU6IGxpdmVTdW1tYXJ5LnByb2plY3QuZGlzcGxheU5hbWUgfVxuXHRcdFx0XHRcdFx0OiBzLnByb2plY3QsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBsaXZlV29ya2luZ0RpcnMgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0PyBsaXZlV29ya2luZ0RpcnMubWFwKGQgPT4gVVJJLnBhcnNlKGQpKVxuXHRcdFx0XHRcdFx0OiBzLndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdFx0XHRjaGFuZ2VzOiBsaXZlU3VtbWFyeS5jaGFuZ2VzID8/IHMuY2hhbmdlcyxcblx0XHRcdFx0XHRjaGFuZ2VzZXRzOiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHMuc2Vzc2lvbi50b1N0cmluZygpKT8uY2hhbmdlc2V0cyA/PyBzLmNoYW5nZXNldHMsXG5cdFx0XHRcdFx0Li4uKF9tZXRhICE9PSB1bmRlZmluZWQgPyB7IF9tZXRhIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcztcblx0XHR9KTtcblxuXHRcdC8vIE92ZXJsYXkgYW55IHNlc3Npb24ga25vd24gdG8gc3RhdGUgYnV0IG1pc3NpbmcgZnJvbSB0aGUgcHJvdmlkZXJzJ1xuXHRcdC8vIGBsaXN0U2Vzc2lvbnNgIHNuYXBzaG90LCBzbyByZW5kZXJlci1zaWRlIGNhY2hlcyBkb24ndCBldmljdCBhXG5cdFx0Ly8gbGl2ZS9hY3RpdmUgc2Vzc2lvbiAod2hpY2ggd291bGQgY2xvc2UgdGhlIGNoYXQgdmlldyBob2xkaW5nIHRoZVxuXHRcdC8vIGluLWZsaWdodCByZXNwb25zZSBidWJibGUpLiBUd28gY2FzZXMgbmVlZCB0aGlzOiBhIHByb3ZpZGVyIGNhblxuXHRcdC8vIHRyYW5zaWVudGx5IGRyb3AgYSBzZXNzaW9uIChlLmcuIGBDb3BpbG90QWdlbnQubGlzdFNlc3Npb25zYCByZXR1cm5zXG5cdFx0Ly8gYW4gZW1wdHkgYXJyYXkgcmlnaHQgYWZ0ZXIgYHNlc3Npb24vdHVybkNvbXBsZXRlYCksIGFuZCBhIHByb3Zpc2lvbmFsXG5cdFx0Ly8gc2Vzc2lvbiAoY3JlYXRlZCBidXQgbm90IHlldCBtYXRlcmlhbGl6ZWQgXHUyMDE0IHNlZSBgY3JlYXRlU2Vzc2lvbmApIHRoYXRcblx0XHQvLyBoYXMgaGFkIGFueSB0dXJuIGFjdGl2aXR5IG11c3Qgc3RheSB2aXNpYmxlIHVudGlsIGl0IG1hdGVyaWFsaXplcy5cblx0XHQvLyBJZGxlIHByb3Zpc2lvbmFsIHNlc3Npb25zIGFyZSBkZWxpYmVyYXRlbHkgKm5vdCogb3ZlcmxhaWQgc28gdGhlXG5cdFx0Ly8gbmV3LXNlc3Npb24gY29tcG9zZXIncyBlYWdlcmx5LWNyZWF0ZWQgc2Vzc2lvbiBkb2Vzbid0IGxlYWsgaW50byB0aGVcblx0XHQvLyBsaXN0IGJlZm9yZSBpdHMgZmlyc3QgbWVzc2FnZSAoIzMyMTI2OSkuXG5cdFx0Y29uc3Qga25vd24gPSBuZXcgU2V0KHdpdGhTdGF0dXMubWFwKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkpKTtcblx0XHRjb25zdCBhZGRpdGlvbnM6IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzdW1tYXJ5IG9mIHRoaXMuX3N0YXRlTWFuYWdlci5nZXRPdmVybGF5U2Vzc2lvblN1bW1hcmllcygpKSB7XG5cdFx0XHRpZiAoa25vd24uaGFzKHN1bW1hcnkucmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU3ViYWdlbnQgc2Vzc2lvbnMgYXJlIG5lc3RlZCB1bmRlciB0aGVpciBwYXJlbnQgYW5kIG11c3QgbmV2ZXJcblx0XHRcdC8vIHN1cmZhY2UgYXMgdG9wLWxldmVsIGVudHJpZXMgaW4gdGhlIHNlc3Npb24gbGlzdC5cblx0XHRcdGlmIChpc1N1YmFnZW50U2Vzc2lvbihzdW1tYXJ5LnJlc291cmNlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3VtbWFyeVdvcmtpbmdEaXJzID0gc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0XHRhZGRpdGlvbnMucHVzaCh7XG5cdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzdW1tYXJ5LnJlc291cmNlKSxcblx0XHRcdFx0c3RhcnRUaW1lOiBEYXRlLnBhcnNlKHN1bW1hcnkuY3JlYXRlZEF0KSxcblx0XHRcdFx0bW9kaWZpZWRUaW1lOiBEYXRlLnBhcnNlKHN1bW1hcnkubW9kaWZpZWRBdCksXG5cdFx0XHRcdHN1bW1hcnk6IHN1bW1hcnkudGl0bGUsXG5cdFx0XHRcdHN0YXR1czogc3VtbWFyeS5zdGF0dXMsXG5cdFx0XHRcdGFjdGl2aXR5OiBzdW1tYXJ5LmFjdGl2aXR5LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHN1bW1hcnlXb3JraW5nRGlycz8ubWFwKGQgPT4gVVJJLnBhcnNlKGQpKSxcblx0XHRcdFx0Li4uKHN1bW1hcnkucHJvamVjdCA/IHsgcHJvamVjdDogeyB1cmk6IFVSSS5wYXJzZShzdW1tYXJ5LnByb2plY3QudXJpKSwgZGlzcGxheU5hbWU6IHN1bW1hcnkucHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHRcdGNoYW5nZXM6IHN1bW1hcnkuY2hhbmdlcyxcblx0XHRcdFx0Ly8gVGhpcyBvdmVybGF5IHBhdGggbmV2ZXIgb3BlbnMgdGhlIHNlc3Npb24gZGF0YWJhc2UgKHVubGlrZSB0aGVcblx0XHRcdFx0Ly8gcHJvdmlkZXItcmV0dXJuZWQgc2Vzc2lvbnMgaGFuZGxlZCBhYm92ZSksIHNvIGNhcnJ5IHRoZVxuXHRcdFx0XHQvLyBpbi1tZW1vcnkgYHN1bW1hcnkuX21ldGFgIGRpcmVjdGx5LiBJdCBob2xkcyB0aGUgbGl2ZSBzdGF0ZVxuXHRcdFx0XHQvLyAoZS5nLiB0aGUgR2l0SHViIHN0YXRlIHB1Ymxpc2hlZCB3aGVuIGEgUFIgaXMgY3JlYXRlZCksIHNvIGFcblx0XHRcdFx0Ly8gZnJlc2hseS1jcmVhdGVkIHNlc3Npb24gdGhhdCB0aGUgcHJvdmlkZXIgdHJhbnNpZW50bHkgb21pdHNcblx0XHRcdFx0Ly8gc3RpbGwgcmVwb3J0cyBpdCBoZXJlLlxuXHRcdFx0XHQuLi4oc3VtbWFyeS5fbWV0YSAhPT0gdW5kZWZpbmVkID8geyBfbWV0YTogc3VtbWFyeS5fbWV0YSB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbWJpbmVkID0gYWRkaXRpb25zLmxlbmd0aCA+IDAgPyBbLi4ud2l0aFN0YXR1cywgLi4uYWRkaXRpb25zXSA6IHdpdGhTdGF0dXM7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXJ2aWNlXSBsaXN0U2Vzc2lvbnMgcmV0dXJuZWQgJHtjb21iaW5lZC5sZW5ndGh9IHNlc3Npb25zICgke2FkZGl0aW9ucy5sZW5ndGh9IHN0YXRlLW1hbmFnZXIgZmFsbGJhY2spYCk7XG5cdFx0cmV0dXJuIGNvbWJpbmVkO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gY29uZmlnPy5wcm92aWRlciA/PyB0aGlzLl9kZWZhdWx0UHJvdmlkZXI7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlcklkID8gdGhpcy5fcHJvdmlkZXJzLmdldChwcm92aWRlcklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGFnZW50IHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yOiAke3Byb3ZpZGVySWQgPz8gJyhub25lKSd9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FwYWJpbGl0eSBnYXRlOiBvbmx5IGEgcHJvdmlkZXIgdGhhdCBhZHZlcnRpc2VzXG5cdFx0Ly8gYG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzYCBhY2NlcHRzIG1vcmUgdGhhbiBvbmUgd29ya2luZyBkaXJlY3RvcnkuXG5cdFx0Ly8gRm9yIGEgcHJvdmlkZXIgdGhhdCBkb2VzIG5vdCwga2VlcCB0aGUgcHJpbWFyeSAoaW5kZXggMCA9IHRoZSBwcm9jZXNzXG5cdFx0Ly8gcm9vdCkgYW5kIGRyb3AgdGhlIHJlc3Qgc28gdGhlIHBsdXJhbCBwbHVtYmluZyBjYW5ub3QgZm9yd2FyZCBhblxuXHRcdC8vIHVuc3VwcG9ydGVkIHNldCBcdTIwMTQgdGhlIGFnZW50IHN0aWxsIGxhdW5jaGVzIGluIHRoZSB1c2VyJ3MgY2hvc2VuIGZvbGRlci5cblx0XHQvLyBUaGlzIGlzIGEgY3JlYXRlLXRpbWUtb25seSBncmFudDogcnVudGltZSBhZGQvcmVtb3ZlIG9mIGRpcmVjdG9yaWVzIGlzXG5cdFx0Ly8gc3RpbGwgcmVqZWN0ZWQgaW4gdGhlIGRpc3BhdGNoIHBhdGgsIHNvIGEgcHJvdmlkZXIgdGhhdCBvcHRzIGluIGFjY2VwdHNcblx0XHQvLyB0aGUgc2V0IGF0IGNyZWF0aW9uIGJ1dCBpdHMgbWVtYmVycyByZW1haW4gZml4ZWQgZm9yIHRoZSBzZXNzaW9uLlxuXHRcdGlmIChjb25maWc/LndvcmtpbmdEaXJlY3RvcmllcyAmJiBjb25maWcud29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IHN1cHBvcnRzTXVsdGlwbGUgPSAhIXByb3ZpZGVyLmdldERlc2NyaXB0b3IoKS5jYXBhYmlsaXRpZXM/Lm11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdFx0aWYgKCFzdXBwb3J0c011bHRpcGxlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gUHJvdmlkZXIgJyR7cHJvdmlkZXJJZH0nIGRvZXMgbm90IGFkdmVydGlzZSBtdWx0aXBsZVdvcmtpbmdEaXJlY3RvcmllczsgdHJ1bmNhdGluZyAke2NvbmZpZy53b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RofSB3b3JraW5nIGRpcmVjdG9yaWVzIHRvIDEuYCk7XG5cdFx0XHRcdGNvbmZpZyA9IHsgLi4uY29uZmlnLCB3b3JraW5nRGlyZWN0b3JpZXM6IFtjb25maWcud29ya2luZ0RpcmVjdG9yaWVzWzBdXSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdoZW4gZm9ya2luZywgYnVpbGQgdGhlIG9sZFx1MjE5Mm5ldyB0dXJuIElEIG1hcHBpbmcgYmVmb3JlIGNyZWF0aW5nIHRoZVxuXHRcdC8vIHNlc3Npb24gc28gdGhlIGFnZW50IGNhbiB1c2UgaXQgdG8gcmVtYXAgcGVyLXR1cm4gZGF0YS4gSWYgdGhlXG5cdFx0Ly8gc291cmNlIGhhcyBubyB0dXJucyB0byBjb3B5IChlLmcuIGEgc3RpbGwtcHJvdmlzaW9uYWwgc2Vzc2lvbiksIGFcblx0XHQvLyBcImZvcmtcIiBpcyBpbmRpc3Rpbmd1aXNoYWJsZSBmcm9tIGEgZnJlc2ggc2Vzc2lvbiwgc28gd2UgZHJvcCB0aGVcblx0XHQvLyBmb3JrIHBhcmFtZXRlciBhbmQgZmFsbCB0aHJvdWdoIHRvIHRoZSByZWd1bGFyIGNyZWF0ZSBwYXRoLlxuXHRcdGlmIChjb25maWc/LmZvcmspIHtcblx0XHRcdGNvbnN0IHNvdXJjZVN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjb25maWcuZm9yay5zZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3Qgc291cmNlVHVybnMgPSBzb3VyY2VTdGF0ZT8udHVybnMuc2xpY2UoMCwgY29uZmlnLmZvcmsudHVybkluZGV4ICsgMSkgPz8gW107XG5cdFx0XHRpZiAoc291cmNlVHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbmZpZyA9IHsgLi4uY29uZmlnLCBmb3JrOiB1bmRlZmluZWQgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHR1cm5JZE1hcHBpbmcgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHQgb2Ygc291cmNlVHVybnMpIHtcblx0XHRcdFx0XHR0dXJuSWRNYXBwaW5nLnNldCh0LmlkLCBnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVGhlIFNESyBmb3JrIGJvdW5kYXJ5IG11c3QgYmUgYSBjb25jcmV0ZSAoU0RLLWJhY2tlZCkgdHVybi5cblx0XHRcdFx0Ly8gV2hlbiB0aGUgY2xpZW50IGZvcmtlZCBhdCBhIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVyblxuXHRcdFx0XHQvLyAoYC9yZW5hbWVgIC8gYCFjb21tYW5kYCksIHJlZGlyZWN0IHRoZSBhZ2VudCB0byB0aGUgcHJlY2VkaW5nXG5cdFx0XHRcdC8vIGNvbmNyZXRlIHR1cm4gd2hpbGUgc3RpbGwgc2VlZGluZyB0aGUgbG9jYWwgdHVybnMgdXAgdG8gdGhlXG5cdFx0XHRcdC8vIGZvcmsgcG9pbnQgaW50byB0aGUgbmV3IHNlc3Npb24ncyBwcm90b2NvbCBzdGF0ZSBiZWxvdy5cblx0XHRcdFx0Y29uc3QgY29uY3JldGVGb3JrVHVybklkID0gdGhpcy5fbG9jYWxUdXJucy5yZXNvbHZlQ29uY3JldGVUdXJuSWQoYnVpbGREZWZhdWx0Q2hhdFVyaShjb25maWcuZm9yay5zZXNzaW9uKS50b1N0cmluZygpLCBjb25maWcuZm9yay50dXJuSWQpO1xuXHRcdFx0XHRjb25maWcgPSB7XG5cdFx0XHRcdFx0Li4uY29uZmlnLFxuXHRcdFx0XHRcdGZvcms6IHsgLi4uY29uZmlnLmZvcmssIHR1cm5JZE1hcHBpbmcsIC4uLihjb25jcmV0ZUZvcmtUdXJuSWQgIT09IHVuZGVmaW5lZCA/IHsgdHVybklkOiBjb25jcmV0ZUZvcmtUdXJuSWQgfSA6IHt9KSB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdoZW4gaW1wb3J0aW5nIGEgY29udmVyc2F0aW9uLCBhc3NpZ24gZnJlc2ggVVVJRCB0dXJuIGlkcyB1cCBmcm9udCBzb1xuXHRcdC8vIHRoZSBwcm92aWRlciBzZWVkcyBhbiBldmVudCBsb2cgd2hvc2UgaWRzIG1hdGNoIHRoZSBwcm90b2NvbCB0dXJucyB3ZVxuXHRcdC8vIHNlZWQgYmVsb3cgXHUyMDE0IGtlZXBpbmcgZWRpdCAvIGZvcmsgLyB0cnVuY2F0ZSBhZGRyZXNzYWJsZSBhdCB0aGUgU0RLXG5cdFx0Ly8gYm91bmRhcnkuXG5cdFx0aWYgKGNvbmZpZz8uaW1wb3J0Q29udmVyc2F0aW9uKSB7XG5cdFx0XHRjb25zdCBpbXBvcnRlZFR1cm5zID0gY29uZmlnLmltcG9ydENvbnZlcnNhdGlvbi50dXJucy5tYXAodCA9PiAoeyAuLi50LCBpZDogZ2VuZXJhdGVVdWlkKCkgfSkpO1xuXHRcdFx0Y29uZmlnID0geyAuLi5jb25maWcsIGltcG9ydENvbnZlcnNhdGlvbjogeyAuLi5jb25maWcuaW1wb3J0Q29udmVyc2F0aW9uLCB0dXJuczogaW1wb3J0ZWRUdXJucyB9IH07XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSBob3N0LW93bmVkIGlzb2xhdGlvbiBiZWZvcmUgcHJvdmlkZXIgY3JlYXRpb24uIFByb3ZpZGVycyBzdWNoIGFzXG5cdFx0Ly8gQ29kZXggbWF5IHNjaGVkdWxlIGVhZ2VyIHByZXdhcm1pbmcgZnJvbSBjcmVhdGVTZXNzaW9uOyBtYXJraW5nIGFcblx0XHQvLyBjbGllbnQtY2hvc2VuIHdvcmt0cmVlIHNlc3Npb24gcGVuZGluZyBmaXJzdCBwcmV2ZW50cyB0aGF0IHByZXdhcm0gZnJvbVxuXHRcdC8vIG1hdGVyaWFsaXppbmcgaW4gdGhlIHBpY2tlZCBmb2xkZXIgYmVmb3JlIHRoZSBob3N0IGNyZWF0ZXMgdGhlIHdvcmt0cmVlLlxuXHRcdGNvbnN0IGluaXRpYWxpemVTaWRlRWZmZWN0cyA9IHRoaXMuX3NpZGVFZmZlY3RzLmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBzZXNzaW9uQ29uZmlnID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNyZWF0ZWRTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBjb25maWcpO1xuXHRcdGNvbnN0IGRlZmVyV29ya3RyZWVDcmVhdGlvbiA9IHNlc3Npb25Db25maWc/LnZhbHVlcz8uW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXSA9PT0gJ3dvcmt0cmVlJyAmJiAhY29uZmlnPy5mb3JrICYmICFjb25maWc/LmltcG9ydENvbnZlcnNhdGlvbjtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlcnZpY2VdIGNyZWF0ZVNlc3Npb246IGluaXRpYWxpemluZyBhdXRvLWFwcHJvdmVyIGFuZCBjcmVhdGluZyBzZXNzaW9uLi4uYCk7XG5cdFx0Y29uc3QgWywgY3JlYXRlZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRpbml0aWFsaXplU2lkZUVmZmVjdHMsXG5cdFx0XHR0aGlzLl9jcmVhdGVQcm92aWRlclNlc3Npb24ocHJvdmlkZXIsIGNvbmZpZywgZGVmZXJXb3JrdHJlZUNyZWF0aW9uKSxcblx0XHRdKTtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlZC5zZXNzaW9uO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlcnZpY2VdIGNyZWF0ZVNlc3Npb246IGluaXRpYWxpemF0aW9uIGNvbXBsZXRlYCk7XG5cblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgR0MgYXJtZWQgZm9yIHRoaXMgVVJJLiBBIGNsaWVudCBtYXkgYmVcblx0XHQvLyByZS1pc3N1aW5nIGBjcmVhdGVTZXNzaW9uYCBmb3IgYW4gZXhpc3RpbmcgVVJJIG1pZC1ncmFjZSAoZS5nLlxuXHRcdC8vIGR1cmluZyBhIHJlY29ubmVjdCB0aGF0IHJldHVybmVkIGBtaXNzaW5nYCk7IHdpdGhvdXQgdGhpcywgdGhlXG5cdFx0Ly8gdGltZXIgd291bGQgc3RpbGwgZmlyZSBhbmQgZGlzcG9zZSB0aGUganVzdC1yZXZpdmVkIHNlc3Npb25cblx0XHQvLyBiZWZvcmUgdGhlIGZvbGxvdy11cCBgc3Vic2NyaWJlYCBhcnJpdmVzLlxuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdTZXNzaW9uR2Moc2Vzc2lvbik7XG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZ1Nlc3Npb25SZWxlYXNlKHNlc3Npb24pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gY3JlYXRlU2Vzc2lvbjogcHJvdmlkZXI9JHtwcm92aWRlci5pZH0gbW9kZWw9JHtjb25maWc/Lm1vZGVsPy5pZCA/PyAnKGRlZmF1bHQpJ31gKTtcblx0XHR0aGlzLl9zZXNzaW9uVG9Qcm92aWRlci5zZXQoc2Vzc2lvbi50b1N0cmluZygpLCBwcm92aWRlci5pZCk7XG5cdFx0Ly8gUmVjb3JkIHRoaXMgc2Vzc2lvbidzIG9wdC1pbiBzbyBhIGNvbGQgU0RLIGRvd25sb2FkIHRyaWdnZXJlZCBhdFxuXHRcdC8vIG1hdGVyaWFsaXphdGlvbiAoZmlyc3QgbWVzc2FnZSkgaXMgc3VyZmFjZWQgYXMgcHJvZ3Jlc3MuIFRoZSBkb3dubG9hZFxuXHRcdC8vIGlzIHByb3ZpZGVyLWdsb2JhbCwgc28gd2Ugb25seSB0cmFjayBpbnRlcmVzdCBoZXJlOyBlbWlzc2lvbiBpcyBrZXllZFxuXHRcdC8vIGJ5IHRoZSBkb3dubG9hZCdzIG93biBpZGVudGl0eSwgbm90IHRoaXMgdG9rZW4uIENsZWFyZWQgb25cblx0XHQvLyBtYXRlcmlhbGl6ZS9kaXNwb3NlLlxuXHRcdGlmIChjb25maWc/LnByb2dyZXNzVG9rZW4pIHtcblx0XHRcdGxldCBzZXNzaW9ucyA9IHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdC5nZXQocHJvdmlkZXIuaWQpO1xuXHRcdFx0aWYgKCFzZXNzaW9ucykge1xuXHRcdFx0XHRzZXNzaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHR0aGlzLl9kb3dubG9hZFByb2dyZXNzSW50ZXJlc3Quc2V0KHByb3ZpZGVyLmlkLCBzZXNzaW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRzZXNzaW9ucy5hZGQoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gY3JlYXRlU2Vzc2lvbiByZXR1cm5lZDogJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cblx0XHQvLyBSZXNvbHZlIGNvbmZpZyBhbmQgc2VlZCB0aGUgaW5pdGlhbCBjdXN0b21pemF0aW9uIHNldCBpbiBwYXJhbGxlbCBzb1xuXHRcdC8vIGJvdGggYXJlIGF2YWlsYWJsZSBiZWZvcmUgd2UgcmVnaXN0ZXIgdGhlIHNlc3Npb24gaW4gdGhlIHN0YXRlXG5cdFx0Ly8gbWFuYWdlci4gU2VlZGluZyBgc3RhdGUuY3VzdG9taXphdGlvbnNgIGRpcmVjdGx5IChpbnN0ZWFkIG9mXG5cdFx0Ly8gZGlzcGF0Y2hpbmcgYFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRgIGFmdGVyIHRoZSBmYWN0KSBtZWFuc1xuXHRcdC8vIHRoZSB2ZXJ5IGZpcnN0IHNuYXBzaG90IGEgc3Vic2NyaWJlciBzZWVzIGFscmVhZHkgY29udGFpbnNcblx0XHQvLyBob3N0L2dsb2JhbCBjdXN0b21pemF0aW9ucyBhbmQgdGhlIGN1c3RvbSBhZ2VudHMgdGhleSBjb250cmlidXRlLFxuXHRcdC8vIHNvIHRoZSBhZ2VudCBwaWNrZXIgZG9lc24ndCBoYXZlIHRvIHdhaXQgZm9yIGEgZm9sbG93LXVwIHJlcHVibGlzaFxuXHRcdC8vIChgUm9vdENvbmZpZ0NoYW5nZWRgLCBwbHVnaW4gcmVsb2FkLCBvciB0aGUgZmlyc3QgbWVzc2FnZSdzXG5cdFx0Ly8gYHNldENsaWVudEN1c3RvbWl6YXRpb25zYCkuIFN1YnNlcXVlbnQgdXBkYXRlcyBmbG93IHRocm91Z2ggdGhlXG5cdFx0Ly8gZXhpc3RpbmcgYFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRgIC8gYFNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZGBcblx0XHQvLyBhY3Rpb25zIHB1Ymxpc2hlZCBieSBgUGx1Z2luQ29udHJvbGxlcmAuXG5cdFx0Y29uc3QgaW5pdGlhbEN1c3RvbWl6YXRpb25zID0gYXdhaXQgKHByb3ZpZGVyLmdldFNlc3Npb25DdXN0b21pemF0aW9uc1xuXHRcdFx0PyBwcm92aWRlci5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvbikuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2VydmljZV0gY3JlYXRlU2Vzc2lvbjogZmFpbGVkIHRvIHJlc29sdmUgaW5pdGlhbCBjdXN0b21pemF0aW9ucycsIGVycik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KVxuXHRcdFx0OiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSk7XG5cblx0XHQvLyBXaGVuIGZvcmtpbmcsIHBvcHVsYXRlIHRoZSBuZXcgc2Vzc2lvbidzIHByb3RvY29sIHN0YXRlIHdpdGhcblx0XHQvLyB0aGUgc291cmNlIHNlc3Npb24ncyB0dXJucyBzbyB0aGUgY2xpZW50IHNlZXMgdGhlIGZvcmtlZCBoaXN0b3J5LlxuXHRcdGlmIChjb25maWc/LmZvcmspIHtcblx0XHRcdGNvbnN0IHNvdXJjZVN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjb25maWcuZm9yay5zZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3Qgc291cmNlQ2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoY29uZmlnLmZvcmsuc2Vzc2lvbikudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IG5ld0NoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pLnRvU3RyaW5nKCk7XG5cdFx0XHRsZXQgc291cmNlVHVybnM6IFR1cm5bXSA9IFtdO1xuXHRcdFx0aWYgKHNvdXJjZVN0YXRlICYmIGNvbmZpZy5mb3JrLnR1cm5JZE1hcHBpbmcpIHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxTbGljZSA9IHNvdXJjZVN0YXRlLnR1cm5zLnNsaWNlKDAsIGNvbmZpZy5mb3JrLnR1cm5JbmRleCArIDEpO1xuXHRcdFx0XHRjb25zdCBtYXBwaW5nID0gY29uZmlnLmZvcmsudHVybklkTWFwcGluZztcblx0XHRcdFx0c291cmNlVHVybnMgPSBvcmlnaW5hbFNsaWNlLm1hcCh0ID0+ICh7IC4uLnQsIGlkOiBtYXBwaW5nLmdldCh0LmlkKSA/PyBnZW5lcmF0ZVV1aWQoKSB9KSk7XG5cdFx0XHRcdC8vIFJlLXBlcnNpc3QgZm9ya2VkIGxvY2FsIHR1cm5zIChgL3JlbmFtZWAsIGAhY29tbWFuZGApIHVuZGVyIHRoZVxuXHRcdFx0XHQvLyBuZXcgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdC4gYHJlY29yZGAgKGtleWVkIGJ5IHR1cm4gaWQpXG5cdFx0XHRcdC8vIG92ZXJ3cml0ZXMgYW55IHJvd3MgYSBEQiBjb3B5IGNhcnJpZWQgd2l0aCB0aGUgU09VUkNFIGNoYXQgVVJJLFxuXHRcdFx0XHQvLyBhbmQgc2VlZHMgdGhlIGluLW1lbW9yeSBpbmRleCBmb3Igc2FtZS1wcm9jZXNzIGZvcmsvdHJ1bmNhdGUuXG5cdFx0XHRcdHRoaXMuX3BlcnNpc3RGb3JrZWRMb2NhbFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgc291cmNlQ2hhdFVyaSwgbmV3Q2hhdFVyaSwgb3JpZ2luYWxTbGljZSwgc291cmNlVHVybnMsIG1hcHBpbmcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcmVmaXggdGhlIGZvcmtlZCBzZXNzaW9uJ3MgdGl0bGUgc28gY29uc3VtZXJzIChzaWRlYmFyLCBjaGF0XG5cdFx0XHQvLyBtb2RlbCkgY2FuIGRpc3Rpbmd1aXNoIGl0IGZyb20gdGhlIHNvdXJjZSB3aXRob3V0IGVhY2ggc3VyZmFjZVxuXHRcdFx0Ly8gcmVpbnZlbnRpbmcgdGhlIGNvbnZlbnRpb24uIEF2b2lkIGRvdWJsZS1wcmVmaXhpbmcgd2hlbiBhIHVzZXJcblx0XHRcdC8vIGZvcmtzIGFuIGFscmVhZHktZm9ya2VkIHNlc3Npb24uXG5cdFx0XHRjb25zdCBmb3JrZWRUaXRsZVByZWZpeCA9IGxvY2FsaXplKCdhZ2VudEhvc3QuZm9ya2VkVGl0bGVQcmVmaXgnLCBcIkZvcmtlZDogXCIpO1xuXHRcdFx0Y29uc3Qgc291cmNlVGl0bGUgPSBzb3VyY2VTdGF0ZT8udGl0bGU7XG5cdFx0XHRjb25zdCBmb3JrZWRUaXRsZSA9IHNvdXJjZVRpdGxlXG5cdFx0XHRcdD8gKHNvdXJjZVRpdGxlLnN0YXJ0c1dpdGgoZm9ya2VkVGl0bGVQcmVmaXgpID8gc291cmNlVGl0bGUgOiBgJHtmb3JrZWRUaXRsZVByZWZpeH0ke3NvdXJjZVRpdGxlfWApXG5cdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdC5mb3JrZWRTZXNzaW9uRmFsbGJhY2snLCBcIkZvcmtlZCBTZXNzaW9uXCIpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHRoaXMuX2J1aWxkSW5pdGlhbFN1bW1hcnkocHJvdmlkZXIsIHNlc3Npb24sIGNvbmZpZywgY3JlYXRlZCwgZm9ya2VkVGl0bGUpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihzdW1tYXJ5KTtcblx0XHRcdHN0YXRlLmNvbmZpZyA9IHNlc3Npb25Db25maWc7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc3VtbWFyeS5yZXNvdXJjZSwgc291cmNlVHVybnMpO1xuXHRcdFx0c3RhdGUuYWN0aXZlQ2xpZW50cyA9IGNvbmZpZy5hY3RpdmVDbGllbnQgPyBbY29uZmlnLmFjdGl2ZUNsaWVudF0gOiBbXTtcblx0XHRcdGlmIChpbml0aWFsQ3VzdG9taXphdGlvbnMgJiYgaW5pdGlhbEN1c3RvbWl6YXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0c3RhdGUuY3VzdG9taXphdGlvbnMgPSBbLi4uaW5pdGlhbEN1c3RvbWl6YXRpb25zXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVmaW5lIHRoZSBmb3JrZWQgc2Vzc2lvbidzIHBsYWNlaG9sZGVyIGBGb3JrZWQ6IFx1MjAyNmAgdGl0bGUgaW50byBvbmVcblx0XHRcdC8vIGRlcml2ZWQgZnJvbSB0aGUgaW5oZXJpdGVkIGNoYXQuIEZvcmtzIHNlZWQgcHJlLWV4aXN0aW5nXG5cdFx0XHQvLyB0dXJucywgc28gdGhlIG5vcm1hbCBmaXJzdC1tZXNzYWdlL2ZpcnN0LXR1cm4gdGl0bGUgZ2VuZXJhdGlvblxuXHRcdFx0Ly8gbmV2ZXIgZmlyZXMgZm9yIHRoZW0gXHUyMDE0IHRoaXMgaXMgdGhlIGZvcmstdGltZSBlcXVpdmFsZW50LlxuXHRcdFx0aWYgKHNvdXJjZVR1cm5zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fc2lkZUVmZmVjdHMuZ2VuZXJhdGVGb3JrZWRUaXRsZShzdW1tYXJ5LnJlc291cmNlLCB1bmRlZmluZWQsIHNvdXJjZVR1cm5zLCBmb3JrZWRUaXRsZSwgc291cmNlVGl0bGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY29uZmlnPy5pbXBvcnRDb252ZXJzYXRpb24pIHtcblx0XHRcdC8vIEFuIGltcG9ydGVkIGNvbnZlcnNhdGlvbiBhcnJpdmVzIHdpdGggcHJlLWV4aXN0aW5nIHR1cm5zIChhc3NpZ25lZFxuXHRcdFx0Ly8gZnJlc2ggVVVJRCBpZHMgYWJvdmUpLiBTZWVkIHRoZW0gaW50byB0aGUgbmV3IHNlc3Npb24ncyBwcm90b2NvbFxuXHRcdFx0Ly8gc3RhdGUgc28gdGhlIGNsaWVudCByZW5kZXJzIHRoZSBpbXBvcnRlZCBoaXN0b3J5IGltbWVkaWF0ZWx5OyB0aGVcblx0XHRcdC8vIHByb3ZpZGVyIGhhcyBhbHJlYWR5IHNlZWRlZCB0aGUgbWF0Y2hpbmcgU0RLIGV2ZW50IGxvZyBzbyB0aG9zZVxuXHRcdFx0Ly8gdHVybnMgYXJlIGVkaXRhYmxlIC8gZm9ya2FibGUgLyB0cnVuY2F0YWJsZS5cblx0XHRcdGNvbnN0IGltcG9ydGVkVHVybnMgPSBbLi4uY29uZmlnLmltcG9ydENvbnZlcnNhdGlvbi50dXJuc107XG5cdFx0XHRjb25zdCBpbXBvcnRlZFRpdGxlID0gdGhpcy5fYnVpbGRJbXBvcnRlZFRpdGxlKGltcG9ydGVkVHVybnMpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHRoaXMuX2J1aWxkSW5pdGlhbFN1bW1hcnkocHJvdmlkZXIsIHNlc3Npb24sIGNvbmZpZywgY3JlYXRlZCwgaW1wb3J0ZWRUaXRsZSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHN1bW1hcnkpO1xuXHRcdFx0c3RhdGUuY29uZmlnID0gc2Vzc2lvbkNvbmZpZztcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzdW1tYXJ5LnJlc291cmNlLCBpbXBvcnRlZFR1cm5zKTtcblx0XHRcdHN0YXRlLmFjdGl2ZUNsaWVudHMgPSBjb25maWcuYWN0aXZlQ2xpZW50ID8gW2NvbmZpZy5hY3RpdmVDbGllbnRdIDogW107XG5cdFx0XHRpZiAoaW5pdGlhbEN1c3RvbWl6YXRpb25zICYmIGluaXRpYWxDdXN0b21pemF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHN0YXRlLmN1c3RvbWl6YXRpb25zID0gWy4uLmluaXRpYWxDdXN0b21pemF0aW9uc107XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlZmluZSB0aGUgcGxhY2Vob2xkZXIgdGl0bGUgaW50byBvbmUgZ2VuZXJhdGVkIGZyb20gdGhlIGltcG9ydGVkXG5cdFx0XHQvLyBjb252ZXJzYXRpb24sIG1pcnJvcmluZyBmb3Jrcy4gSW1wb3J0cyBzZWVkIHByZS1leGlzdGluZyB0dXJucywgc29cblx0XHRcdC8vIHRoZSBub3JtYWwgZmlyc3QtbWVzc2FnZSB0aXRsZSBnZW5lcmF0aW9uIG5ldmVyIGZpcmVzOyB3aXRob3V0IHRoaXNcblx0XHRcdC8vIHRoZSBzZXNzaW9uIHdvdWxkIGtlZXAgc2hvd2luZyB0aGUgcmF3IGZpcnN0LW1lc3NhZ2UgY2xpcCB3aGlsZVxuXHRcdFx0Ly8gc2libGluZyBzZXNzaW9ucyBzaG93IGNsZWFuIGdlbmVyYXRlZCB0aXRsZXMgXHUyMDE0IG1ha2luZyBpbXBvcnRzIGxvb2tcblx0XHRcdC8vIGxpa2UgYSBkaWZmZXJlbnQga2luZCBvZiBzZXNzaW9uLlxuXHRcdFx0aWYgKGltcG9ydGVkVHVybnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9zaWRlRWZmZWN0cy5nZW5lcmF0ZUZvcmtlZFRpdGxlKHN1bW1hcnkucmVzb3VyY2UsIHVuZGVmaW5lZCwgaW1wb3J0ZWRUdXJucywgaW1wb3J0ZWRUaXRsZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFByb3Zpc2lvbmFsIHNlc3Npb25zIGRlZmVyIHRoZSBgc2Vzc2lvbkFkZGVkYCBub3RpZmljYXRpb24gYW5kXG5cdFx0XHQvLyB0aGUgYFNlc3Npb25SZWFkeWAgbGlmZWN5Y2xlIHRyYW5zaXRpb24gdW50aWwgdGhlIGFnZW50IGZpcmVzXG5cdFx0XHQvLyB7QGxpbmsgSUFnZW50Lm9uRGlkTWF0ZXJpYWxpemVTZXNzaW9ufSAodHlwaWNhbGx5IG9uIGZpcnN0XG5cdFx0XHQvLyBgc2VuZE1lc3NhZ2VgKS4gVW50aWwgdGhlbiwgdGhlIHN0YXRlIGV4aXN0cyBpbiBtZW1vcnkgc29cblx0XHRcdC8vIGNsaWVudHMgY2FuIHN1YnNjcmliZSBhbmQgc3RyZWFtIGNvbmZpZyAvIG1vZGVsIGNoYW5nZXMgdGhhdFxuXHRcdFx0Ly8gdGhlIGFnZW50IHdpbGwgcGljayB1cCBhdCBtYXRlcmlhbGl6YXRpb24gdGltZS5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSB0aGlzLl9idWlsZEluaXRpYWxTdW1tYXJ5KHByb3ZpZGVyLCBzZXNzaW9uLCBjb25maWcsIGNyZWF0ZWQsICcnKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oc3VtbWFyeSwgeyBlbWl0Tm90aWZpY2F0aW9uOiAhY3JlYXRlZC5wcm92aXNpb25hbCB9KTtcblx0XHRcdHN0YXRlLmNvbmZpZyA9IHNlc3Npb25Db25maWc7XG5cdFx0XHRzdGF0ZS5hY3RpdmVDbGllbnRzID0gY29uZmlnPy5hY3RpdmVDbGllbnQgPyBbY29uZmlnLmFjdGl2ZUNsaWVudF0gOiBbXTtcblx0XHRcdGlmIChpbml0aWFsQ3VzdG9taXphdGlvbnMgJiYgaW5pdGlhbEN1c3RvbWl6YXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0c3RhdGUuY3VzdG9taXphdGlvbnMgPSBbLi4uaW5pdGlhbEN1c3RvbWl6YXRpb25zXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gUGVyc2lzdCBpbml0aWFsIGNvbmZpZyB2YWx1ZXMgc28gYSBzdWJzZXF1ZW50IGByZXN0b3JlU2Vzc2lvbmAgY2FuXG5cdFx0Ly8gcmUtaHlkcmF0ZSB0aGVtLiBXZSBwZXJzaXN0IHRoZSBmdWxsIHJlc29sdmVkIHZhbHVlcyAobm90IGp1c3QgdGhlXG5cdFx0Ly8gdXNlcidzIGlucHV0KSBzbyBjbGllbnRzIGNhbiByZW5kZXIgdGhlbSBvbiByZXN0b3JlIHdpdGhvdXQgaGF2aW5nXG5cdFx0Ly8gdG8gcmUtcmVzb2x2ZS4gTWlkLXNlc3Npb24gY2hhbmdlcyBhcmUgcGVyc2lzdGVkIGJ5IGBBZ2VudFNpZGVFZmZlY3RzYFxuXHRcdC8vIHdoZW4gaGFuZGxpbmcgYFNlc3Npb25Db25maWdDaGFuZ2VkYC5cblx0XHRpZiAoc2Vzc2lvbkNvbmZpZz8udmFsdWVzICYmIE9iamVjdC5rZXlzKHNlc3Npb25Db25maWcudmFsdWVzKS5sZW5ndGggPiAwICYmICFjcmVhdGVkLnByb3Zpc2lvbmFsKSB7XG5cdFx0XHR0aGlzLl9wZXJzaXN0Q29uZmlnVmFsdWVzKHNlc3Npb24sIHNlc3Npb25Db25maWcudmFsdWVzKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5vblNlc3Npb25DcmVhdGVkKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cblx0XHRpZiAoIWNyZWF0ZWQucHJvdmlzaW9uYWwpIHtcblx0XHRcdC8vIFBlcnNpc3QgdGhlIEFILW93bmVkIHdvcmtzcGFjZS1sZXNzIG1hcmtlciBub3cgdGhhdCB0aGUgc2Vzc2lvbiBEQlxuXHRcdFx0Ly8gZXhpc3RzLCBmcm9tIHRoZSB2YWx1ZSBgX2J1aWxkSW5pdGlhbFN1bW1hcnlgIGluZmVycmVkLiBQcm92aXNpb25hbFxuXHRcdFx0Ly8gc2Vzc2lvbnMgZGVmZXIgdGhpcyB0byBgX29uRGlkTWF0ZXJpYWxpemVTZXNzaW9uYC5cblx0XHRcdHRoaXMuX3BlcnNpc3RXb3Jrc3BhY2VsZXNzKHNlc3Npb24sIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcyh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbi50b1N0cmluZygpKT8uX21ldGEpKTtcblxuXHRcdFx0Ly8gYFNlc3Npb25SZWFkeWAgdHJhbnNpdGlvbnMgdGhlIHNlc3Npb24gbGlmZWN5Y2xlIGZyb21cblx0XHRcdC8vIGBDcmVhdGluZ2AgdG8gYFJlYWR5YC4gRm9yIHByb3Zpc2lvbmFsIHNlc3Npb25zIHdlIGRlZmVyXG5cdFx0XHQvLyB0aGlzIHRvIHtAbGluayBfb25EaWRNYXRlcmlhbGl6ZVNlc3Npb259IHNvIHN1YnNjcmliZXJzXG5cdFx0XHQvLyBkb24ndCBzZWUgYFJlYWR5YCB1bnRpbCB0aGUgYWdlbnQgYWN0dWFsbHkgaGFzIGFuIFNES1xuXHRcdFx0Ly8gc2Vzc2lvbiwgd29ya2luZyBkaXJlY3RvcnksIGV0Yy5cblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVmcmVzaCB0aGUgZ2l0IHN0YXRlIGZvciB0aGUgc2Vzc2lvbidzIHByb2Nlc3Mgcm9vdC5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gY3JlYXRlZC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPz8gY29uZmlnPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHR2b2lkIHRoaXMuX2dpdFN0YXRlU2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKHNlc3Npb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0FnZW50U2VydmljZV0gY3JlYXRlQ2hhdDogbm8gcHJvdmlkZXIgZm9yIHNlc3Npb24gJHtzZXNzaW9uS2V5fWApO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3N1cHBvcnRzQ2hhdHMocHJvdmlkZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtBZ2VudFNlcnZpY2VdIGNyZWF0ZUNoYXQ6IHByb3ZpZGVyICR7cHJvdmlkZXIuaWR9IGRvZXMgbm90IHN1cHBvcnQgbXVsdGlwbGUgY2hhdHNgKTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIGZvcmtpbmcsIHJlc29sdmUgdGhlIHNvdXJjZSBjaGF0J3MgdHVybnMgdXAgdG8gdGhlIGZvcmsgcG9pbnQgYW5kXG5cdFx0Ly8gbWludCBmcmVzaCB0dXJuIElEcyBmb3IgdGhlIG5ldyBjaGF0LiBUaGUgYWdlbnQgdXNlcyB0aGUgbWFwcGluZyB0b1xuXHRcdC8vIHJlbWFwIHBlci10dXJuIGRhdGEgaW4gdGhlIGZvcmtlZCBjaGF0OyB0aGUgc2VlZGVkIHR1cm5zIG1ha2Vcblx0XHQvLyB0aGUgbmV3IGNoYXQgc3VyZmFjZSB0aGUgZm9ya2VkIGhpc3RvcnkgaW1tZWRpYXRlbHkuXG5cdFx0bGV0IGZvcmtlZFR1cm5zOiBUdXJuW10gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGZvcmtlZFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGZvcmtlZFNvdXJjZVRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNyZWF0ZU9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdC8vIFNpZGUgY2hhdHMgdmFsaWRhdGUgYW5kIHBlcnNpc3QgdGhlaXIgcHJvdmVuYW5jZSB3aXRob3V0IHNlZWRpbmcgaG9zdC12aXNpYmxlIHR1cm5zLlxuXHRcdGxldCBzaWRlQ2hhdE9yaWdpbjogQ2hhdE9yaWdpbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucz8uc2lkZUNoYXQpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkU2lkZUNoYXQgPSB0aGlzLl9yZXNvbHZlU2lkZUNoYXRPcmlnaW4oc2Vzc2lvbiwgb3B0aW9ucy5zaWRlQ2hhdCk7XG5cdFx0XHRzaWRlQ2hhdE9yaWdpbiA9IHJlc29sdmVkU2lkZUNoYXQub3JpZ2luO1xuXHRcdFx0Y3JlYXRlT3B0aW9ucyA9IHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0c2lkZUNoYXQ6IHtcblx0XHRcdFx0XHQuLi5vcHRpb25zLnNpZGVDaGF0LFxuXHRcdFx0XHRcdHNvdXJjZTogVVJJLnBhcnNlKHJlc29sdmVkU2lkZUNoYXQuc291cmNlQ2hhdCksXG5cdFx0XHRcdFx0Li4uKHJlc29sdmVkU2lkZUNoYXQucHJvdmlkZXJBbmNob3JUdXJuSWQgPyB7IHByb3ZpZGVyQW5jaG9yVHVybklkOiByZXNvbHZlZFNpZGVDaGF0LnByb3ZpZGVyQW5jaG9yVHVybklkIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKHJlc29sdmVkU2lkZUNoYXQuc291cmNlQ29udGV4dCA/IHsgc291cmNlQ29udGV4dDogcmVzb2x2ZWRTaWRlQ2hhdC5zb3VyY2VDb250ZXh0IH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKHJlc29sdmVkU2lkZUNoYXQucGFydGlhbFJlc3BvbnNlID8geyBwYXJ0aWFsUmVzcG9uc2U6IHJlc29sdmVkU2lkZUNoYXQucGFydGlhbFJlc3BvbnNlIH0gOiB7fSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucz8uZm9yaykge1xuXHRcdFx0Y29uc3Qgc291cmNlS2V5ID0gb3B0aW9ucy5mb3JrLnNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcGVlclN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzb3VyY2VLZXkpO1xuXHRcdFx0Y29uc3Qgc291cmNlU3RhdGUgPSBwZWVyU3RhdGUgPz8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldERlZmF1bHRDaGF0U3RhdGUoc291cmNlS2V5KTtcblx0XHRcdC8vIENhbm9uaWNhbCBjaGF0IFVSSSB0aGUgc291cmNlJ3MgbG9jYWwgdHVybnMgYXJlIGtleWVkIGJ5OiB3aGVuIHRoZVxuXHRcdFx0Ly8gc291cmNlIHdhcyBmb3VuZCBhcyBhIHBlZXIgY2hhdCBpdCBpcyBgc291cmNlS2V5YDsgb3RoZXJ3aXNlIGl0IHdhc1xuXHRcdFx0Ly8gYWRkcmVzc2VkIGJ5IHNlc3Npb24gVVJJIGFuZCBpdHMgZGVmYXVsdCBjaGF0IFVSSSBpcyBjYW5vbmljYWwuXG5cdFx0XHRjb25zdCBzb3VyY2VDaGF0VXJpID0gcGVlclN0YXRlID8gc291cmNlS2V5IDogYnVpbGREZWZhdWx0Q2hhdFVyaShzb3VyY2VLZXkpO1xuXHRcdFx0Y29uc3Qgc291cmNlVHVybnMgPSBzb3VyY2VTdGF0ZT8udHVybnMgPz8gW107XG5cdFx0XHRjb25zdCBmb3JrSW5kZXggPSBzb3VyY2VUdXJucy5maW5kSW5kZXgodCA9PiB0LmlkID09PSBvcHRpb25zLmZvcmshLnR1cm5JZCk7XG5cdFx0XHRpZiAoZm9ya0luZGV4IDwgMCkge1xuXHRcdFx0XHQvLyBUaGUgZm9yayBwb2ludCBpcyB1bmtub3duLCBzbyBhIGZvcmsgaXMgaW5kaXN0aW5ndWlzaGFibGUgZnJvbSBhXG5cdFx0XHRcdC8vIGZyZXNoIGNoYXQuIERyb3AgdGhlIGZvcmsgdG8gYXZvaWQgdGhlIHByb3ZpZGVyIGluaGVyaXRpbmcgdGhlXG5cdFx0XHRcdC8vIHdob2xlIGJhY2tlbmQgY2hhdCB3aGlsZSB0aGUgVUkgaXMgc2VlZGVkIHdpdGggbm8gdHVybnMuXG5cdFx0XHRcdGNyZWF0ZU9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGZvcms6IHVuZGVmaW5lZCB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2xpY2UgPSBzb3VyY2VUdXJucy5zbGljZSgwLCBmb3JrSW5kZXggKyAxKTtcblx0XHRcdFx0Y29uc3QgdHVybklkTWFwcGluZyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgdCBvZiBzbGljZSkge1xuXHRcdFx0XHRcdHR1cm5JZE1hcHBpbmcuc2V0KHQuaWQsIGdlbmVyYXRlVXVpZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3JrZWRUdXJucyA9IHNsaWNlLm1hcCh0ID0+ICh7IC4uLnQsIGlkOiB0dXJuSWRNYXBwaW5nLmdldCh0LmlkKSA/PyBnZW5lcmF0ZVV1aWQoKSB9KSk7XG5cblx0XHRcdFx0Ly8gQ2FycnkgZm9ya2VkIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVybnMgKGAvcmVuYW1lYCwgYCFjb21tYW5kYClcblx0XHRcdFx0Ly8gaW50byB0aGUgbmV3IGNoYXQgc28gdGhleSBzdXJ2aXZlIHJlbG9hZCBhbmQgYW5jaG9yIGZ1dHVyZVxuXHRcdFx0XHQvLyBmb3JrL3RydW5jYXRlLlxuXHRcdFx0XHR0aGlzLl9wZXJzaXN0Rm9ya2VkTG9jYWxUdXJucyhzZXNzaW9uS2V5LCBzb3VyY2VDaGF0VXJpLCBjaGF0LnRvU3RyaW5nKCksIHNsaWNlLCBmb3JrZWRUdXJucywgdHVybklkTWFwcGluZyk7XG5cblx0XHRcdFx0Y29uc3QgZm9ya2VkVGl0bGVQcmVmaXggPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmZvcmtlZFRpdGxlUHJlZml4JywgXCJGb3JrZWQ6IFwiKTtcblx0XHRcdFx0Zm9ya2VkU291cmNlVGl0bGUgPSBzb3VyY2VTdGF0ZT8udGl0bGUgfHwgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KT8udGl0bGU7XG5cdFx0XHRcdGZvcmtlZFRpdGxlID0gZm9ya2VkU291cmNlVGl0bGVcblx0XHRcdFx0XHQ/IChmb3JrZWRTb3VyY2VUaXRsZS5zdGFydHNXaXRoKGZvcmtlZFRpdGxlUHJlZml4KSA/IGZvcmtlZFNvdXJjZVRpdGxlIDogYCR7Zm9ya2VkVGl0bGVQcmVmaXh9JHtmb3JrZWRTb3VyY2VUaXRsZX1gKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdC5mb3JrZWRDaGF0RmFsbGJhY2snLCBcIkZvcmtlZCBDaGF0XCIpO1xuXHRcdFx0XHQvLyBUaGUgU0RLIGZvcmsgYm91bmRhcnkgbXVzdCBiZSBhIGNvbmNyZXRlIChTREstYmFja2VkKSB0dXJuLiBXaGVuXG5cdFx0XHRcdC8vIHRoZSBjbGllbnQgZm9ya2VkIGF0IGEgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJuLCByZWRpcmVjdCB0aGVcblx0XHRcdFx0Ly8gYWdlbnQgdG8gdGhlIHByZWNlZGluZyBjb25jcmV0ZSB0dXJuICh0aGUgbG9jYWwgdHVybnMgYXJlIHN0aWxsXG5cdFx0XHRcdC8vIHNlZWRlZCBpbnRvIHRoZSBuZXcgY2hhdCdzIHByb3RvY29sIHN0YXRlIGFib3ZlKS5cblx0XHRcdFx0Y29uc3QgY29uY3JldGVGb3JrVHVybklkID0gdGhpcy5fbG9jYWxUdXJucy5yZXNvbHZlQ29uY3JldGVUdXJuSWQoc291cmNlQ2hhdFVyaSwgb3B0aW9ucy5mb3JrLnR1cm5JZCk7XG5cdFx0XHRcdGNyZWF0ZU9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGZvcms6IHsgLi4ub3B0aW9ucy5mb3JrLCB0dXJuSWRNYXBwaW5nLCAuLi4oY29uY3JldGVGb3JrVHVybklkICE9PSB1bmRlZmluZWQgPyB7IHR1cm5JZDogY29uY3JldGVGb3JrVHVybklkIH0gOiB7fSkgfSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNwaW4gdXAgdGhlIGJhY2tpbmcgY2hhdCBpbiB0aGUgaGFybmVzcyBmaXJzdCwgdGhlbiByZWdpc3RlclxuXHRcdC8vIHRoZSBjaGF0IGluIHRoZSBjYXRhbG9nIHNvIGEgYHNlc3Npb24vY2hhdEFkZGVkYCBvbmx5IHJlYWNoZXNcblx0XHQvLyBzdWJzY3JpYmVycyBvbmNlIHRoZSBjaGF0IGNhbiBhY3R1YWxseSByZWNlaXZlIG1lc3NhZ2VzLiBUaGUgYWdlbnRcblx0XHQvLyByZXR1cm5zIHRoZSBvcGFxdWUgYHByb3ZpZGVyRGF0YWAgYmxvYiB0aGUgb3JjaGVzdHJhdG9yIHBlcnNpc3RzIGZvclxuXHRcdC8vIHJlc3RvcmUgKGl0IG5ldmVyIHBhcnNlcyBpdCk7IHNpbmdsZS1jaGF0LW9ubHkgYWdlbnRzIHJldHVybiBgdm9pZGAuXG5cdFx0Y29uc3QgY3JlYXRlUmVzdWx0ID0gYXdhaXQgdGhpcy5fY3JlYXRlQ2hhdChwcm92aWRlciwgY2hhdCwgY3JlYXRlT3B0aW9ucyk7XG5cdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gY3JlYXRlUmVzdWx0Py5wcm92aWRlckRhdGE7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvbktleSwgY2hhdC50b1N0cmluZygpLCB7XG5cdFx0XHQuLi4oZm9ya2VkVGl0bGUgIT09IHVuZGVmaW5lZCA/IHsgdGl0bGU6IGZvcmtlZFRpdGxlIH0gOiBvcHRpb25zPy50aXRsZSAhPT0gdW5kZWZpbmVkID8geyB0aXRsZTogb3B0aW9ucy50aXRsZSB9IDoge30pLFxuXHRcdFx0Li4uKGZvcmtlZFR1cm5zICE9PSB1bmRlZmluZWQgPyB7IHR1cm5zOiBmb3JrZWRUdXJucyB9IDoge30pLFxuXHRcdFx0Li4uKHByb3ZpZGVyRGF0YSAhPT0gdW5kZWZpbmVkID8geyBwcm92aWRlckRhdGEgfSA6IHt9KSxcblx0XHRcdC4uLihzaWRlQ2hhdE9yaWdpbiAhPT0gdW5kZWZpbmVkID8geyBvcmlnaW46IHNpZGVDaGF0T3JpZ2luIH0gOiB7fSksXG5cdFx0fSk7XG5cblx0XHQvLyBQZXJzaXN0IHRoZSBuZXcgcGVlciBjaGF0IGludG8gdGhlIG9yY2hlc3RyYXRvci1vd25lZCBjYXRhbG9nIHNvIGl0IGlzXG5cdFx0Ly8gcmUtZW51bWVyYXRlZCBhbmQgcmUtbWF0ZXJpYWxpemVkIG9uIHRoZSBuZXh0IHJlc3RvcmUgd2l0aG91dCBhc2tpbmdcblx0XHQvLyB0aGUgYWdlbnQuIFNpZGUtY2hhdCBwcm92ZW5hbmNlIGlzIHBlcnNpc3RlZCBhbG9uZ3NpZGUgcHJvdmlkZXJEYXRhLlxuXHRcdHZvaWQgdGhpcy5fcGVyc2lzdFBlZXJDaGF0KHNlc3Npb24sIGNoYXQsIHByb3ZpZGVyRGF0YSwgc2lkZUNoYXRPcmlnaW4pO1xuXG5cdFx0Ly8gV2hlbiB0aGUgYWdlbnQgYmFja3MgdGhpcyBwZWVyIGNoYXQgd2l0aCBpdHMgb3duIHNlcGFyYXRlbHktZW51bWVyYWJsZVxuXHRcdC8vIFNESyBzZXNzaW9uIChlLmcuIENsYXVkZSksIG1hcmsgdGhhdCBzZXNzaW9uIHNvIGl0IGlzIGZpbHRlcmVkIG91dCBvZlxuXHRcdC8vIHRoZSB0b3AtbGV2ZWwgc2Vzc2lvbiBsaXN0IGluc3RlYWQgb2YgbGVha2luZyBhcyBhIHN0YW5kYWxvbmUgc2Vzc2lvbi5cblx0XHRpZiAoY3JlYXRlUmVzdWx0Py5iYWNraW5nU2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fbWFya1BlZXJDaGF0QmFja2luZyhjcmVhdGVSZXN1bHQuYmFja2luZ1Nlc3Npb24sIGNoYXQpO1xuXHRcdH1cblxuXHRcdC8vIFJlZmluZSB0aGUgZm9ya2VkIGNoYXQncyBwbGFjZWhvbGRlciBgRm9ya2VkOiBcdTIwMjZgIHRpdGxlIGludG8gb25lXG5cdFx0Ly8gZGVyaXZlZCBmcm9tIHRoZSBpbmhlcml0ZWQgY2hhdC4gRm9ya3Mgc2VlZCBwcmUtZXhpc3Rpbmdcblx0XHQvLyB0dXJucywgc28gdGhlIG5vcm1hbCBmaXJzdC1tZXNzYWdlL2ZpcnN0LXR1cm4gdGl0bGUgZ2VuZXJhdGlvbiBuZXZlclxuXHRcdC8vIGZpcmVzIGZvciB0aGVtIFx1MjAxNCB0aGlzIGlzIHRoZSBmb3JrLXRpbWUgZXF1aXZhbGVudC5cblx0XHRpZiAoZm9ya2VkVHVybnMgJiYgZm9ya2VkVHVybnMubGVuZ3RoID4gMCAmJiBmb3JrZWRUaXRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zaWRlRWZmZWN0cy5nZW5lcmF0ZUZvcmtlZFRpdGxlKHNlc3Npb25LZXksIGNoYXQudG9TdHJpbmcoKSwgZm9ya2VkVHVybnMsIGZvcmtlZFRpdGxlLCBmb3JrZWRTb3VyY2VUaXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFZhbGlkYXRlcyBhIHNpZGUgY2hhdCdzIHNvdXJjZSBhbmQgcmV0dXJucyBpdHMge0BsaW5rIENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0fVxuXHQgKiBvcmlnaW4uIFRocm93cyB3aGVuIHRoZSBzb3VyY2UgY2hhdCBpcyBub3QgcGFydCBvZiBgc2Vzc2lvbmAgb3Igd2hlbiB0aGVcblx0ICogcmVmZXJlbmNlZCBjb21wbGV0ZWQgb3IgYWN0aXZlIHR1cm4gaXMgYWJzZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVNpZGVDaGF0T3JpZ2luKHNlc3Npb246IFVSSSwgc2lkZUNoYXQ6IElBZ2VudENyZWF0ZUNoYXRTaWRlQ2hhdFNvdXJjZSk6IHsgb3JpZ2luOiBDaGF0T3JpZ2luOyBzb3VyY2VDaGF0OiBzdHJpbmc7IHNlbGVjdGlvbj86IElBZ2VudENyZWF0ZUNoYXRTaWRlQ2hhdFNlbGVjdGlvbjsgcHJvdmlkZXJBbmNob3JUdXJuSWQ/OiBzdHJpbmc7IHNvdXJjZUNvbnRleHQ/OiBzdHJpbmc7IHBhcnRpYWxSZXNwb25zZT86IHN0cmluZyB9IHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNvdXJjZUtleSA9IHNpZGVDaGF0LnNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHsgc291cmNlQ2hhdEtleSwgc291cmNlU2Vzc2lvbktleSwgc291cmNlU3RhdGUgfSA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uU291cmNlQ2hhdChzZXNzaW9uLCBzaWRlQ2hhdC5zb3VyY2UpO1xuXHRcdC8vIFRoZSBzb3VyY2UgY2hhdCBNVVNUIGJlbG9uZyB0byB0aGUgdGFyZ2V0IHNlc3Npb24uIE9sZGVyIGNhbGxlcnMgbWF5XG5cdFx0Ly8gc3RpbGwgYWRkcmVzcyB0aGUgbWFpbiBjaGF0IGJ5IHNlc3Npb24gVVJJOyBzeW5jZWQgQUhQIGNsaWVudHMgc2VuZCB0aGVcblx0XHQvLyBhY3R1YWwgZGVmYXVsdC1jaGF0IFVSSS5cblx0XHRpZiAoc291cmNlU2Vzc2lvbktleSAhPT0gc2Vzc2lvbktleSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQWdlbnRTZXJ2aWNlXSBjcmVhdGVDaGF0OiBzaWRlIGNoYXQgc291cmNlICR7c291cmNlS2V5fSBkb2VzIG5vdCBiZWxvbmcgdG8gc2Vzc2lvbiAke3Nlc3Npb25LZXl9YCk7XG5cdFx0fVxuXHRcdC8vIFRoZSBib3VuZGVkIHR1cm4gbXVzdCBiZSBhIHJlYWwgY29tcGxldGVkIG9yIGN1cnJlbnRseS1hY3RpdmUgdHVybi5cblx0XHRjb25zdCBhY3RpdmVUdXJuID0gc291cmNlU3RhdGU/LmFjdGl2ZVR1cm4/LmlkID09PSBzaWRlQ2hhdC50dXJuSWQgPyBzb3VyY2VTdGF0ZS5hY3RpdmVUdXJuIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhhc0NvbXBsZXRlZFR1cm4gPSBzb3VyY2VTdGF0ZT8udHVybnMuc29tZSh0ID0+IHQuaWQgPT09IHNpZGVDaGF0LnR1cm5JZCkgPz8gZmFsc2U7XG5cdFx0aWYgKCFoYXNDb21wbGV0ZWRUdXJuICYmICFhY3RpdmVUdXJuKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtBZ2VudFNlcnZpY2VdIGNyZWF0ZUNoYXQ6IHNpZGUgY2hhdCBzb3VyY2UgdHVybiAke3NpZGVDaGF0LnR1cm5JZH0gbm90IGZvdW5kIGluICR7c291cmNlS2V5fWApO1xuXHRcdH1cblx0XHRjb25zdCBpc0xvY2FsU291cmNlVHVybiA9ICFhY3RpdmVUdXJuICYmIHRoaXMuX2xvY2FsVHVybnMuaXNMb2NhbChzb3VyY2VDaGF0S2V5LCBzaWRlQ2hhdC50dXJuSWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyQW5jaG9yVHVybklkID0gaXNMb2NhbFNvdXJjZVR1cm4gPyB0aGlzLl9sb2NhbFR1cm5zLnJlc29sdmVDb25jcmV0ZVR1cm5JZChzb3VyY2VDaGF0S2V5LCBzaWRlQ2hhdC50dXJuSWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBhcnRpYWxSZXNwb25zZSA9IGdldFNpZGVDaGF0UGFydGlhbFJlc3BvbnNlKGFjdGl2ZVR1cm4pO1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRleHQgPSAoYWN0aXZlVHVybiB8fCBpc0xvY2FsU291cmNlVHVybilcblx0XHRcdD8gYnVpbGRCb3VuZGVkU2lkZUNoYXRTb3VyY2VDb250ZXh0KHNvdXJjZVN0YXRlPy50dXJucyA/PyBbXSwgc2lkZUNoYXQudHVybklkLCBhY3RpdmVUdXJuKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2lkZUNoYXQuc2VsZWN0aW9uPy50ZXh0LnRyaW0oKVxuXHRcdFx0PyBzaWRlQ2hhdC5zZWxlY3Rpb25cblx0XHRcdDogc2lkZUNoYXQuc2VsZWN0aW9uXG5cdFx0XHRcdD8gKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdbQWdlbnRTZXJ2aWNlXSBjcmVhdGVDaGF0OiBzaWRlIGNoYXQgc2VsZWN0aW9uIHRleHQgbXVzdCBiZSBub24tZW1wdHknKTsgfSkoKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3JpZ2luOiB7XG5cdFx0XHRcdGtpbmQ6IENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0LFxuXHRcdFx0XHRjaGF0OiBzb3VyY2VDaGF0S2V5LFxuXHRcdFx0XHR0dXJuSWQ6IHNpZGVDaGF0LnR1cm5JZCxcblx0XHRcdFx0Li4uKHNlbGVjdGlvbiA/IHsgc2VsZWN0aW9uIH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdFx0c291cmNlQ2hhdDogc291cmNlQ2hhdEtleSxcblx0XHRcdC4uLihzZWxlY3Rpb24gPyB7IHNlbGVjdGlvbiB9IDoge30pLFxuXHRcdFx0Li4uKHByb3ZpZGVyQW5jaG9yVHVybklkID8geyBwcm92aWRlckFuY2hvclR1cm5JZCB9IDoge30pLFxuXHRcdFx0Li4uKHNvdXJjZUNvbnRleHQgPyB7IHNvdXJjZUNvbnRleHQgfSA6IHt9KSxcblx0XHRcdC4uLihwYXJ0aWFsUmVzcG9uc2UgPyB7IHBhcnRpYWxSZXNwb25zZSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlU2Vzc2lvblNvdXJjZUNoYXQoc2Vzc2lvbjogVVJJLCBzb3VyY2U6IFVSSSk6IHsgc291cmNlQ2hhdEtleTogc3RyaW5nOyBzb3VyY2VTZXNzaW9uS2V5OiBzdHJpbmc7IHNvdXJjZVN0YXRlOiBSZXR1cm5UeXBlPEFnZW50SG9zdFN0YXRlTWFuYWdlclsnZ2V0Q2hhdFN0YXRlJ10+IHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc291cmNlS2V5ID0gc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc291cmNlU2Vzc2lvbktleSA9IGlzQWhwQ2hhdENoYW5uZWwoc291cmNlS2V5KSA/IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoc291cmNlS2V5KSA6IHNvdXJjZUtleTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdEtleSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk/LmRlZmF1bHRDaGF0ID8/IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSk7XG5cdFx0Y29uc3Qgc291cmNlQ2hhdEtleSA9IHNvdXJjZUtleSA9PT0gc2Vzc2lvbktleVxuXHRcdFx0PyBkZWZhdWx0Q2hhdEtleVxuXHRcdFx0OiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHNvdXJjZUtleSlcblx0XHRcdFx0PyBzb3VyY2VLZXlcblx0XHRcdFx0OiBpc0RlZmF1bHRDaGF0VXJpKHNvdXJjZUtleSkgJiYgc291cmNlU2Vzc2lvbktleSA9PT0gc2Vzc2lvbktleVxuXHRcdFx0XHRcdD8gZGVmYXVsdENoYXRLZXlcblx0XHRcdFx0XHQ6IHNvdXJjZUtleTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c291cmNlU2Vzc2lvbktleSxcblx0XHRcdHNvdXJjZUNoYXRLZXksXG5cdFx0XHRzb3VyY2VTdGF0ZTogc291cmNlQ2hhdEtleSA9PT0gZGVmYXVsdENoYXRLZXlcblx0XHRcdFx0PyAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShkZWZhdWx0Q2hhdEtleSkgPz8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldERlZmF1bHRDaGF0U3RhdGUoc2Vzc2lvbktleSkpXG5cdFx0XHRcdDogdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzb3VyY2VDaGF0S2V5KSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZGlzcG9zZUNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR0aGlzLl9zaWRlRWZmZWN0cy5jbGVhclF1ZXVlZE1lc3NhZ2VTZW5kZXJzKGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlbW92ZUNoYXQoc2Vzc2lvbktleSwgY2hhdC50b1N0cmluZygpKTtcblx0XHQvLyBEcm9wIHRoZSBjaGF0IGZyb20gdGhlIG9yY2hlc3RyYXRvci1vd25lZCBjYXRhbG9nIHNvIGl0IGlzbid0XG5cdFx0Ly8gcmUtbWF0ZXJpYWxpemVkIG9uIHRoZSBuZXh0IHJlc3RvcmUuXG5cdFx0dm9pZCB0aGlzLl9yZW1vdmVQZXJzaXN0ZWRQZWVyQ2hhdChzZXNzaW9uLCBjaGF0KTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VDaGF0KHByb3ZpZGVyLCBjaGF0KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIENoYXQgZGlzcGF0Y2ggYWRhcHRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly9cblx0Ly8gVGhlIG9yY2hlc3RyYXRvciBvd25zIHRoZSBmZWF0dXJlLWxldmVsIGAoc2Vzc2lvbiwgY2hhdClgIFx1MjE5MlxuXHQvLyBgKGFnZW50LCBzZXNzaW9uLCBjaGF0KWAgbWFwcGluZy4gSXQgZGlzcGF0Y2hlcyBhZ2FpbnN0IGFuIGFnZW50J3Ncblx0Ly8gY2hhdC1hZGRyZXNzZWQgc3VyZmFjZSAoe0BsaW5rIElBZ2VudC5jaGF0c30pIGFuZCBzZXNzaW9uIGxpZmVjeWNsZVxuXHQvLyAoe0BsaW5rIElBZ2VudC5jcmVhdGVTZXNzaW9ufS97QGxpbmsgSUFnZW50LmRpc3Bvc2VTZXNzaW9ufSkuXG5cblx0LyoqIFdoZXRoZXIgYHByb3ZpZGVyYCBjYW4gaG9zdCBhZGRpdGlvbmFsIChwZWVyKSBjaGF0cy4gKi9cblx0cHJpdmF0ZSBfc3VwcG9ydHNDaGF0cyhwcm92aWRlcjogSUFnZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhcHJvdmlkZXIuY2hhdHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVQcm92aWRlclNlc3Npb24ocHJvdmlkZXI6IElBZ2VudCwgY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnIHwgdW5kZWZpbmVkLCBkZWZlcldvcmt0cmVlQ3JlYXRpb246IGJvb2xlYW4pOiBQcm9taXNlPElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0XHRjb25zdCByZXF1ZXN0ZWRTZXNzaW9uSWQgPSBkZWZlcldvcmt0cmVlQ3JlYXRpb24gJiYgY29uZmlnPy5zZXNzaW9uID8gQWdlbnRTZXNzaW9uLmlkKGNvbmZpZy5zZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocmVxdWVzdGVkU2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLl93b3JrdHJlZT8ubm90ZVBlbmRpbmcocmVxdWVzdGVkU2Vzc2lvbklkKTtcblx0XHR9XG5cblx0XHRsZXQgY3JlYXRlZDogSUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdCB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y3JlYXRlZCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZVNlc3Npb24oY29uZmlnID8gdGhpcy5fdG9Qcm92aWRlckNvbmZpZyhjb25maWcpIDogdW5kZWZpbmVkKTtcblx0XHRcdGlmIChkZWZlcldvcmt0cmVlQ3JlYXRpb24gJiYgY3JlYXRlZC5wcm92aXNpb25hbCkge1xuXHRcdFx0XHR0aGlzLl93b3JrdHJlZT8ubm90ZVBlbmRpbmcoQWdlbnRTZXNzaW9uLmlkKGNyZWF0ZWQuc2Vzc2lvbikpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbnN0IHJldHVybmVkUGVuZGluZ1Nlc3Npb25JZCA9IGNyZWF0ZWQ/LnByb3Zpc2lvbmFsID8gQWdlbnRTZXNzaW9uLmlkKGNyZWF0ZWQuc2Vzc2lvbikgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocmVxdWVzdGVkU2Vzc2lvbklkICYmIHJlcXVlc3RlZFNlc3Npb25JZCAhPT0gcmV0dXJuZWRQZW5kaW5nU2Vzc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMuX3dvcmt0cmVlPy5jbGVhclBlbmRpbmcocmVxdWVzdGVkU2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kaXNwb3NlU2Vzc2lvbihwcm92aWRlcjogSUFnZW50LCBzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBwcm92aWRlci5kaXNwb3NlU2Vzc2lvbihzZXNzaW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbnN0cnVjdCB0aGUgdHVybnMgZm9yIGEgY2hhdC4gYGNoYXRgIGlzIHRoZSBjb25jcmV0ZSBjaGF0IGNoYW5uZWwgVVJJLFxuXHQgKiBleGNlcHQgZm9yIGxlZ2FjeSByZXN0b3JlIHBhdGhzIHRoYXQgc3RpbGwgYWRkcmVzcyBzdWJhZ2VudCBzZXNzaW9ucy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldENoYXRNZXNzYWdlcyhwcm92aWRlcjogSUFnZW50LCBjaGF0OiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gYXdhaXQgdGhpcy5fYXBwbHlQZXJzaXN0ZWRUdXJuVXNhZ2UoY2hhdCwgYXdhaXQgcHJvdmlkZXIuY2hhdHMuZ2V0TWVzc2FnZXMoY2hhdCkpO1xuXHRcdC8vIEhvc3Qtb3duZWQgd29ya3RyZWUgcmVzdG9yZSBhbm5vdW5jZW1lbnQ6IHJlLWluamVjdCB0aGUgXCJDcmVhdGVkIGlzb2xhdGVkXG5cdFx0Ly8gd29ya3RyZWVcIiBtZXNzYWdlIGF0IHRoZSB0b3Agb2YgdGhlIGRlZmF1bHQgY2hhdCdzIGZpcnN0IHR1cm4gZnJvbVxuXHRcdC8vIHBlcnNpc3RlZCBtZXRhZGF0YS4gTm8tb3AgZm9yIGZvbGRlciBzZXNzaW9ucyBhbmQgbm9uLWRlZmF1bHQgY2hhdHMgKHBlZXJcblx0XHQvLyAvIHN1YmFnZW50KS4gQWdlbnRzIHN0YXkgdW5hd2FyZSBvZiB3b3JrdHJlZXMuXG5cdFx0aWYgKHRoaXMuX3dvcmt0cmVlICYmIGlzRGVmYXVsdENoYXRVcmkoY2hhdCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl93b3JrdHJlZS5hcHBseVJlc3RvcmVBbm5vdW5jZW1lbnQoVVJJLnBhcnNlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdC50b1N0cmluZygpKSksIHR1cm5zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHR1cm5zO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWF0dGFjaGVzIHBlcnNpc3RlZCBwZXItdHVybiB7QGxpbmsgVXNhZ2VJbmZvfSB0byByZWNvbnN0cnVjdGVkIHR1cm5zLlxuXHQgKlxuXHQgKiBBZ2VudCBiYWNrZW5kcyBkb24ndCBkdXJhYmx5IHJlY29yZCB0b2tlbi9jcmVkaXQgdXNhZ2UgXHUyMDE0IHRoZSBDb3BpbG90XG5cdCAqIFNESydzIGBhc3Npc3RhbnQudXNhZ2VgIGV2ZW50IGlzIGV4cGxpY2l0bHkgZXBoZW1lcmFsIGFuZCB0aGUgQ2xhdWRlXG5cdCAqIHRyYW5zY3JpcHQgcmVwbGF5IHByb2R1Y2VzIG5vbmUgXHUyMDE0IHNvIHJlc3RvcmVkIHR1cm5zIGNvbWUgYmFjayB3aXRob3V0IGl0LlxuXHQgKiBXaXRob3V0IHRoaXMgdGhlIGNoYXQncyBjb250ZXh0LXVzYWdlIGdhdWdlIHN0YXlzIGhpZGRlbiBhZnRlciBhIHJlbG9hZFxuXHQgKiBhbmQgdGhlIHNlc3Npb24gY29zdCB0b3RhbCByZXN0YXJ0cyBmcm9tIHplcm8uIFVzYWdlIHJlY29yZGVkIGxpdmUgYnlcblx0ICoge0BsaW5rIEFnZW50U2lkZUVmZmVjdHN9IGlzIGxvb2tlZCB1cCBieSB0dXJuIGlkIChvciB0aGUgdHVybidzIFNESyBldmVudFxuXHQgKiBpZCwgd2hpY2ggaXMgd2hhdCBhIHJlc3RvcmVkIHR1cm4gaXMga2V5ZWQgYnkpLlxuXHQgKlxuXHQgKiBOT1RFOiB0aGUgbG9va3VwIG9ubHkgbGFuZHMgZm9yIHByb3ZpZGVycyB0aGF0IHJlY29yZCB0aGUgYnJpZGdlIGJldHdlZW5cblx0ICogdGhlIGxpdmUgcHJvdG9jb2wgdHVybiBpZCAoYSBob3N0LWdlbmVyYXRlZCB1dWlkKSBhbmQgdGhlIGlkIGEgcmVzdG9yZWRcblx0ICogdHVybiBpcyBrZXllZCBieS4gVG9kYXkgb25seSBDb3BpbG90IGRvZXMsIHZpYSBgc2V0VHVybkV2ZW50SWRgLiBDbGF1ZGVcblx0ICogcmVzdG9yZXMgdHVybnMga2V5ZWQgYnkgdHJhbnNjcmlwdCB1dWlkIGFuZCBuZXZlciBwb3B1bGF0ZXNcblx0ICogYHR1cm5zLmV2ZW50X2lkYCwgc28gaXRzIHJvd3MgYXJlIHdyaXR0ZW4gYnV0IG5ldmVyIG1hdGNoZWQ7IGdpdmluZyBpdCBhXG5cdCAqIGdhdWdlIGFmdGVyIHJlbG9hZCBuZWVkcyB0aGF0IGJyaWRnZSByZWNvcmRlZCBmaXJzdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5UGVyc2lzdGVkVHVyblVzYWdlKGNoYXQ6IFVSSSwgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0aWYgKHR1cm5zLmxlbmd0aCA9PT0gMCB8fCB0dXJucy5ldmVyeSh0dXJuID0+IGhhc1JlcG9ydGVkVXNhZ2UodHVybi51c2FnZSkpIHx8IGlzU3ViYWdlbnRDaGF0VXJpKGNoYXQudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybiB0dXJucztcblx0XHR9XG5cdFx0Ly8gU2FtZSBzdG9yYWdlIHRoZSB3cml0ZXIgdXNlZDsgc2VlIGBjaGF0U3RvcmFnZVVyaWAuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGNoYXRTdG9yYWdlVXJpKGNoYXQpO1xuXHRcdGlmICghc3RvcmFnZSkge1xuXHRcdFx0cmV0dXJuIHR1cm5zO1xuXHRcdH1cblx0XHRsZXQgdXNhZ2VzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2Uoc3RvcmFnZSk7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB0dXJucztcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHVzYWdlcyA9IGF3YWl0IHJlZi5vYmplY3QuZ2V0VHVyblVzYWdlcygpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVhZCBwZXJzaXN0ZWQgdHVybiB1c2FnZSBmb3IgJHtzdG9yYWdlLnRvU3RyaW5nKCl9YCwgZXJyKTtcblx0XHRcdHJldHVybiB0dXJucztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0aWYgKHVzYWdlcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHVybnM7XG5cdFx0fVxuXHRcdHJldHVybiB0dXJucy5tYXAodHVybiA9PiB7XG5cdFx0XHRjb25zdCByYXcgPSBoYXNSZXBvcnRlZFVzYWdlKHR1cm4udXNhZ2UpID8gdW5kZWZpbmVkIDogdXNhZ2VzLmdldCh0dXJuLmlkKTtcblx0XHRcdGlmICghcmF3KSB7XG5cdFx0XHRcdHJldHVybiB0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkOiB1bmtub3duID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0XHQvLyBOZXZlciBzcHJlYWQgYW4gdW50eXBlZCBwYXlsb2FkIGJsaW5kOiBhIGNvcnJ1cHRlZCBjb2x1bW5cblx0XHRcdFx0Ly8gaG9sZGluZyBhIHN0cmluZyBvciBhcnJheSB3b3VsZCBzcGxhdCBpbmRleCBrZXlzIG9udG8gdGhlXG5cdFx0XHRcdC8vIHR1cm4ncyB1c2FnZSBhbmQgZmxvdyB0aGF0IG1hbGZvcm1lZCBzaGFwZSB0byB0aGUgcmVuZGVyZXIuXG5cdFx0XHRcdGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHRcdHJldHVybiB0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBlcnNpc3RlZCA9IHBhcnNlZCBhcyBVc2FnZUluZm87XG5cdFx0XHRcdC8vIE1lcmdlIHJhdGhlciB0aGFuIHJlcGxhY2U6IGEgdHVybiB0aGF0IHJhbiBvbiBBdXRvIGFscmVhZHlcblx0XHRcdFx0Ly8gY2FycmllcyBhIHRva2VuLWxlc3Mgc3R1YiBob2xkaW5nIGBfbWV0YS5hdXRvTW9kZVJlc29sdmVkYFxuXHRcdFx0XHQvLyAoc2VlIGBtYXBTZXNzaW9uRXZlbnRzYCksIHdoaWNoIGRyaXZlcyB0aGUgXCJBdXRvIChtb2RlbClcIlxuXHRcdFx0XHQvLyBsYWJlbC4gUGVyc2lzdGVkIHZhbHVlcyB3aW47IHRoZSBzdHViIGZpbGxzIHdoYXQgdGhleSBsYWNrLlxuXHRcdFx0XHRjb25zdCBtZXRhID0geyAuLi50dXJuLnVzYWdlPy5fbWV0YSwgLi4ucGVyc2lzdGVkLl9tZXRhIH07XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4udHVybixcblx0XHRcdFx0XHR1c2FnZToge1xuXHRcdFx0XHRcdFx0Li4udHVybi51c2FnZSxcblx0XHRcdFx0XHRcdC4uLnBlcnNpc3RlZCxcblx0XHRcdFx0XHRcdC4uLihPYmplY3Qua2V5cyhtZXRhKS5sZW5ndGggPiAwID8geyBfbWV0YTogbWV0YSB9IDoge30pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIHR1cm47XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogTWVyZ2VzIHBlcnNpc3RlZCBob3N0LWluamVjdGVkIGxvY2FsIHR1cm5zIChgL3JlbmFtZWAsIGAhY29tbWFuZGApIGZvclxuXHQgKiBgY2hhdFVyaWAgYmFjayBpbnRvIHRoYXQgY2hhdCdzIFNESy1kZXJpdmVkIGB0dXJuc2AsIHBvc2l0aW9uZWQgYWZ0ZXJcblx0ICogdGhlaXIgYW5jaG9yIHR1cm4gKHRoZSBjb25jcmV0ZSB0dXJuIHRoZXkgd2VyZSByZWNvcmRlZCBhZnRlcikuIExvY2Fsc1xuXHQgKiBhbmNob3JlZCBiZWZvcmUgYW55IHJlYWwgdHVybiBhcmUgcHJlcGVuZGVkOyBsb2NhbHMgd2hvc2UgYW5jaG9yIGlzIGFic2VudFxuXHQgKiBmcm9tIHRoZSBTREsgdHVybnMgKGUuZy4gdHJ1bmNhdGVkIGF3YXkpIGFyZSBkcm9wcGVkLiBBbHNvIHNlZWRzIHRoZVxuXHQgKiBpbi1tZW1vcnkgbG9jYWwtdHVybiBpbmRleCBzbyBmb3JrL3RydW5jYXRlIHJlc29sdmUgY29ycmVjdGx5IGJlZm9yZSB0aGVcblx0ICogbmV4dCByZWxvYWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pbnRlcmxlYXZlTG9jYWxUdXJucyhzZXNzaW9uU3RyOiBzdHJpbmcsIGNoYXRVcmk6IHN0cmluZywgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSk6IFByb21pc2U8VHVybltdPiB7XG5cdFx0Y29uc3QgcmVjb3JkcyA9IGF3YWl0IHRoaXMuX2xvY2FsVHVybnMubG9hZEZvckNoYXQoc2Vzc2lvblN0ciwgY2hhdFVyaSk7XG5cdFx0aWYgKHJlY29yZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gWy4uLnR1cm5zXTtcblx0XHR9XG5cdFx0Y29uc3Qga25vd25JZHMgPSBuZXcgU2V0KHR1cm5zLm1hcCh0ID0+IHQuaWQpKTtcblx0XHRjb25zdCBieUFuY2hvciA9IG5ldyBNYXA8c3RyaW5nLCBUdXJuW10+KCk7XG5cdFx0Y29uc3QgaGVhZDogVHVybltdID0gW107XG5cdFx0Zm9yIChjb25zdCByZWNvcmQgb2YgcmVjb3Jkcykge1xuXHRcdFx0bGV0IHR1cm46IFR1cm47XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0dXJuID0gSlNPTi5wYXJzZShyZWNvcmQucGF5bG9hZCkgYXMgVHVybjtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWNvcmQuYW5jaG9yVHVybklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aGVhZC5wdXNoKHR1cm4pO1xuXHRcdFx0fSBlbHNlIGlmIChrbm93bklkcy5oYXMocmVjb3JkLmFuY2hvclR1cm5JZCkpIHtcblx0XHRcdFx0Y29uc3QgbGlzdCA9IGJ5QW5jaG9yLmdldChyZWNvcmQuYW5jaG9yVHVybklkKSA/PyBbXTtcblx0XHRcdFx0bGlzdC5wdXNoKHR1cm4pO1xuXHRcdFx0XHRieUFuY2hvci5zZXQocmVjb3JkLmFuY2hvclR1cm5JZCwgbGlzdCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBlbHNlOiBvcnBoYW5lZCAoYW5jaG9yIHRydW5jYXRlZCBhd2F5KSBcdTIxOTIgZHJvcC5cblx0XHR9XG5cdFx0Y29uc3QgbWVyZ2VkOiBUdXJuW10gPSBbLi4uaGVhZF07XG5cdFx0Zm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG5cdFx0XHRtZXJnZWQucHVzaCh0dXJuKTtcblx0XHRcdGNvbnN0IGxvY2FscyA9IGJ5QW5jaG9yLmdldCh0dXJuLmlkKTtcblx0XHRcdGlmIChsb2NhbHMpIHtcblx0XHRcdFx0bWVyZ2VkLnB1c2goLi4ubG9jYWxzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1lcmdlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1wZXJzaXN0cyBmb3JrZWQgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJucyAoYC9yZW5hbWVgLCBgIWNvbW1hbmRgKSBpbnRvXG5cdCAqIGEgbmV3bHkgZm9ya2VkIGNoYXQgc28gdGhleSBzdXJ2aXZlIHJlbG9hZCBhbmQgYW5jaG9yIGZ1dHVyZVxuXHQgKiBmb3JrL3RydW5jYXRlLiBgb3JpZ2luYWxTbGljZVtpXWAgYW5kIGBmb3JrZWRUdXJuc1tpXWAgYXJlIHRoZSBzb3VyY2UgdHVyblxuXHQgKiBhbmQgaXRzIHJlbWFwcGVkIGNvcHkgKHNhbWUgbGVuZ3RoLCAxOjEpOyBgbWFwcGluZ2AgaXMgdGhlIG9sZFx1MjE5Mm5ldyB0dXJuIGlkXG5cdCAqIG1hcCB1c2VkIHRvIHJlbWFwIGVhY2ggbG9jYWwgdHVybidzIGFuY2hvci4gYHBlcnNpc3RTZXNzaW9uYCBvd25zIHRoZVxuXHQgKiBkZXN0aW5hdGlvbiBkYXRhYmFzZTsgYHNvdXJjZUNoYXRVcmlgIC8gYG5ld0NoYXRVcmlgIGtleSB0aGUgc291cmNlIGFuZFxuXHQgKiBkZXN0aW5hdGlvbiBsb2NhbC10dXJuIGluZGV4ZXMuXG5cdCAqXG5cdCAqIFNoYXJlZCBieSB0aGUge0BsaW5rIGNyZWF0ZVNlc3Npb259IChkZWZhdWx0LWNoYXQpIGFuZCB7QGxpbmsgY3JlYXRlQ2hhdH1cblx0ICogKHBlZXItY2hhdCkgZm9yayBwYXRocy5cblx0ICovXG5cdHByaXZhdGUgX3BlcnNpc3RGb3JrZWRMb2NhbFR1cm5zKHBlcnNpc3RTZXNzaW9uOiBzdHJpbmcsIHNvdXJjZUNoYXRVcmk6IHN0cmluZywgbmV3Q2hhdFVyaTogc3RyaW5nLCBvcmlnaW5hbFNsaWNlOiByZWFkb25seSBUdXJuW10sIGZvcmtlZFR1cm5zOiByZWFkb25seSBUdXJuW10sIG1hcHBpbmc6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPik6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3JpZ2luYWxTbGljZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBvcmlnaW5hbFNsaWNlW2ldO1xuXHRcdFx0aWYgKCF0aGlzLl9sb2NhbFR1cm5zLmlzTG9jYWwoc291cmNlQ2hhdFVyaSwgb3JpZ2luYWwuaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxBbmNob3IgPSB0aGlzLl9sb2NhbFR1cm5zLnJlc29sdmVDb25jcmV0ZVR1cm5JZChzb3VyY2VDaGF0VXJpLCBvcmlnaW5hbC5pZCk7XG5cdFx0XHRjb25zdCBuZXdBbmNob3IgPSBvcmlnaW5hbEFuY2hvciAhPT0gdW5kZWZpbmVkID8gbWFwcGluZy5nZXQob3JpZ2luYWxBbmNob3IpIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fbG9jYWxUdXJucy5yZWNvcmQocGVyc2lzdFNlc3Npb24sIG5ld0NoYXRVcmksIGZvcmtlZFR1cm5zW2ldLCBuZXdBbmNob3IpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgKG9yIGZvcmspIHRoZSBwZWVyIGNoYXQgYGNoYXRgIHdpdGhpbiBgc2Vzc2lvbmAuIGBjaGF0YCBpc1xuXHQgKiBhbHdheXMgYSBwZWVyIFVSSSBoZXJlICh0aGUgZGVmYXVsdCBjaGF0IGlzIGNyZWF0ZWQgaW1wbGljaXRseSB3aXRoXG5cdCAqIHRoZSBzZXNzaW9uKSwgc28gbm8gZGVmYXVsdC1jaGF0IHJlc29sdXRpb24gaXMgbmVlZGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlQ2hhdChwcm92aWRlcjogSUFnZW50LCBjaGF0OiBVUkksIG9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdGNvbnN0IGNvbnZPcHRpb25zOiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyB8IHVuZGVmaW5lZCA9IG9wdGlvbnMgJiYgKG9wdGlvbnMudGl0bGUgIT09IHVuZGVmaW5lZCB8fCBvcHRpb25zLm1vZGVsICE9PSB1bmRlZmluZWQgfHwgb3B0aW9ucy5zaWRlQ2hhdCAhPT0gdW5kZWZpbmVkKVxuXHRcdFx0PyB7XG5cdFx0XHRcdC4uLihvcHRpb25zLnRpdGxlICE9PSB1bmRlZmluZWQgPyB7IHRpdGxlOiBvcHRpb25zLnRpdGxlIH0gOiB7fSksXG5cdFx0XHRcdC4uLihvcHRpb25zLm1vZGVsICE9PSB1bmRlZmluZWQgPyB7IG1vZGVsOiBvcHRpb25zLm1vZGVsIH0gOiB7fSksXG5cdFx0XHRcdC4uLihvcHRpb25zLnNpZGVDaGF0ICE9PSB1bmRlZmluZWQgPyB7IHNpZGVDaGF0OiBvcHRpb25zLnNpZGVDaGF0IH0gOiB7fSksXG5cdFx0XHR9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gb3B0aW9ucz8uZm9ya1xuXHRcdFx0PyBwcm92aWRlci5jaGF0cy5mb3JrKGNoYXQsIG9wdGlvbnMuZm9yaywgY29udk9wdGlvbnMpXG5cdFx0XHQ6IHByb3ZpZGVyLmNoYXRzLmNyZWF0ZUNoYXQoY2hhdCwgY29udk9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzcG9zZUNoYXQocHJvdmlkZXI6IElBZ2VudCwgY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgcHJvdmlkZXIuY2hhdHMuZGlzcG9zZUNoYXQoY2hhdCk7XG5cdH1cblxuXHQvKipcblx0ICogRGVyaXZlcyBhIHBsYWNlaG9sZGVyIHRpdGxlIGZvciBhbiBpbXBvcnRlZCBzZXNzaW9uIGZyb20gaXRzIGZpcnN0IHVzZXJcblx0ICogdHVybiAoaW1wb3J0cyBzZWVkIHByZS1leGlzdGluZyB0dXJucywgc28gdGhlIG5vcm1hbCBmaXJzdC1tZXNzYWdlIHRpdGxlXG5cdCAqIGdlbmVyYXRpb24gbmV2ZXIgZmlyZXMpLiBEZWxpYmVyYXRlbHkgdW5wcmVmaXhlZDogYW4gaW1wb3J0ZWQgc2Vzc2lvbiBpcyBhXG5cdCAqIGNvbnRpbnVhdGlvbiBvZiB0aGUgc291cmNlIGNoYXQsIG5vdCBhIGRpc3RpbmN0IGtpbmQgb2Ygc2Vzc2lvbiwgc28gaXRcblx0ICogc2hvdWxkIHJlYWQgbGlrZSBhbnkgb3RoZXIuIFRoZSBwbGFjZWhvbGRlciBpcyBsYXRlciByZWZpbmVkIGludG8gYVxuXHQgKiBnZW5lcmF0ZWQgdGl0bGUgKHNlZSB0aGUgYGltcG9ydENvbnZlcnNhdGlvbmAgYnJhbmNoIGluIGBjcmVhdGVTZXNzaW9uYCksXG5cdCAqIGJ1dCBhIG5ldXRyYWwgbm9uLWVtcHR5IGZhbGxiYWNrIGlzIGtlcHQgc28gdGhlIHNlc3Npb24gc3RpbGwgcmVhZHMgbGlrZSBhXG5cdCAqIG5vcm1hbCBjaGF0IHdoZW4gZ2VuZXJhdGlvbiBpcyB1bmF2YWlsYWJsZSBvciBmYWlscy5cblx0ICovXG5cdHByaXZhdGUgX2J1aWxkSW1wb3J0ZWRUaXRsZSh0dXJuczogcmVhZG9ubHkgVHVybltdKTogc3RyaW5nIHtcblx0XHRjb25zdCBmaXJzdFRleHQgPSB0dXJucy5maW5kKHQgPT4gdC5tZXNzYWdlPy50ZXh0Py50cmltKCkpPy5tZXNzYWdlLnRleHQudHJpbSgpO1xuXHRcdGlmICghZmlyc3RUZXh0KSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5pbXBvcnRlZFNlc3Npb25GYWxsYmFjaycsIFwiTmV3IFNlc3Npb25cIik7XG5cdFx0fVxuXHRcdGNvbnN0IE1BWCA9IDYwO1xuXHRcdHJldHVybiBmaXJzdFRleHQubGVuZ3RoID4gTUFYID8gYCR7Zmlyc3RUZXh0LnNsaWNlKDAsIE1BWCl9Li4uYCA6IGZpcnN0VGV4dDtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkSW5pdGlhbFN1bW1hcnkocHJvdmlkZXI6IElBZ2VudCwgc2Vzc2lvbjogVVJJLCBjb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcgfCB1bmRlZmluZWQsIGNyZWF0ZWQ6IHsgcHJvamVjdD86IHsgdXJpOiBVUkk7IGRpc3BsYXlOYW1lOiBzdHJpbmcgfTsgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5PzogVVJJIH0sIHRpdGxlOiBzdHJpbmcpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0Y29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXI6IHByb3ZpZGVyLmlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbm93LFxuXHRcdFx0bW9kaWZpZWRBdDogbm93LFxuXHRcdFx0Li4uKGNyZWF0ZWQucHJvamVjdCA/IHsgcHJvamVjdDogeyB1cmk6IGNyZWF0ZWQucHJvamVjdC51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IGNyZWF0ZWQucHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHQvLyBUaGUgcHJvdmlkZXIgcmVzb2x2ZWQgb25seSBpdHMgcHJvY2VzcyByb290IChpbmRleCAwKSwgd2hpY2ggbWF5XG5cdFx0XHQvLyBkaWZmZXIgZnJvbSB0aGUgcmVxdWVzdGVkIHByaW1hcnkgKGUuZy4gYSB3b3Jrc3BhY2UtbGVzcyBzY3JhdGNoIGRpcikuXG5cdFx0XHQvLyBBc3NlbWJsZSB0aGUgc2Vzc2lvbiBzZXQgYnkgb3ZlcnJpZGluZyB0aGUgcmVxdWVzdGVkIHByaW1hcnkgd2l0aCBpdFxuXHRcdFx0Ly8gYW5kIGtlZXBpbmcgdGhlIHJlcXVlc3RlZCB0YWlsOyB0aGUgZnVsbHktcmVzb2x2ZWQgbXVsdGktcm9vdCBzZXRcblx0XHRcdC8vIGFycml2ZXMgbGF0ZXIgdmlhIHRoZSBtYXRlcmlhbGl6YXRpb24gcmVjZWlwdC5cblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogcmVjb25jaWxlV29ya2luZ0RpcmVjdG9yaWVzKGNvbmZpZz8ud29ya2luZ0RpcmVjdG9yaWVzLCBjcmVhdGVkLnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA/IFtjcmVhdGVkLnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQpLFxuXHRcdFx0Ly8gV29ya3NwYWNlLWxlc3MgaXMgaW5mZXJyZWQgYXQgY3JlYXRlIGZyb20gYW4gYWJzZW50IGlucHV0XG5cdFx0XHQvLyBgd29ya2luZ0RpcmVjdG9yaWVzYCAodGhlIGhvc3QgYXNzaWducyBhIHNjcmF0Y2ggY3dkLCBzbyBpdCBjYW4ndCBiZVxuXHRcdFx0Ly8gcmUtaW5mZXJyZWQgbGF0ZXIpIGFuZCB0YWdnZWQgb24gdGhlIGdlbmVyaWMgYF9tZXRhYCBiYWcuIFVzZVxuXHRcdFx0Ly8gYD09PSB1bmRlZmluZWRgIHNvIGFuIGV4cGxpY2l0IGVtcHR5IHNldCAoYFtdYCkgaXMgTk9UIHRyZWF0ZWQgYXNcblx0XHRcdC8vIHdvcmtzcGFjZS1sZXNzLlxuXHRcdFx0Li4uKCFjb25maWc/LmZvcmsgJiYgIWNvbmZpZz8ud29ya2luZ0RpcmVjdG9yaWVzID8geyBfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgdHJ1ZSkgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3RlbiBmb3IgYW4gYWdlbnQgdHJhbnNpdGlvbmluZyBhIHByb3Zpc2lvbmFsIHNlc3Npb24gaW50byBhIGZ1bGx5XG5cdCAqIG1hdGVyaWFsaXplZCBTREsgc2Vzc2lvbi4gVGhlIGFnZW50IGhhcyBhbHJlYWR5IGNyZWF0ZWQgdGhlIHdvcmt0cmVlXG5cdCAqIChpZiBhbnkpIGFuZCBwZXJzaXN0ZWQgb24tZGlzayBtZXRhZGF0YTsgd2UgbmVlZCB0bzpcblx0ICogLSBSZWZyZXNoIHRoZSBpbi1tZW1vcnkgc3VtbWFyeSB3aXRoIHRoZSByZXNvbHZlZCB3b3JraW5nIGRpcmVjdG9yeVxuXHQgKiAgIGFuZCBwcm9qZWN0IG1ldGFkYXRhLlxuXHQgKiAtIFBlcnNpc3QgYW55IGNvbmZpZyB2YWx1ZXMgbm93IHRoYXQgd2UgaGF2ZSBhIHJlYWwgb24tZGlzayBzZXNzaW9uLlxuXHQgKiAtIEVtaXQgdGhlIGRlZmVycmVkIGBub3RpZnkvc2Vzc2lvbkFkZGVkYCBzbyBvdGhlciBjbGllbnRzIGxlYXJuIG9mXG5cdCAqICAgdGhlIHNlc3Npb24uXG5cdCAqIC0gRGlzcGF0Y2ggYFNlc3Npb25SZWFkeWAgc28gc3Vic2NyaWJlcnMgc2VlIHRoZSBsaWZlY3ljbGUgdHJhbnNpdGlvbi5cblx0ICogLSBMYXppbHkgYXR0YWNoIGdpdCBzdGF0ZSBmb3IgdGhlIChwb3NzaWJseSBuZXcpIHdvcmtpbmcgZGlyZWN0b3J5LlxuXHQgKi9cblx0cHJpdmF0ZSBfb25EaWRNYXRlcmlhbGl6ZVNlc3Npb24oZTogSUFnZW50TWF0ZXJpYWxpemVTZXNzaW9uRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gZS5zZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Ly8gVGhlIHNlc3Npb24gaXMgbm93IG1hdGVyaWFsaXplZCBcdTIwMTQgaXRzIFNESyBpcyByZXNvbHZlZCAoYW55IGNvbGRcblx0XHQvLyBkb3dubG9hZCBhbHJlYWR5IGZpbmlzaGVkKSwgc28gbm8gZnVydGhlciBwcm9ncmVzcyBpcyBleHBlY3RlZCBmb3IgaXQuXG5cdFx0dGhpcy5fY2xlYXJEb3dubG9hZFByb2dyZXNzSW50ZXJlc3Qoc2Vzc2lvbktleSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gb25EaWRNYXRlcmlhbGl6ZVNlc3Npb24gZm9yIHVua25vd24gc2Vzc2lvbjogJHtzZXNzaW9uS2V5fWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50U3VtbWFyeSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uS2V5KTtcblx0XHRpZiAoIWN1cnJlbnRTdW1tYXJ5KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIG9uRGlkTWF0ZXJpYWxpemVTZXNzaW9uIG1pc3Npbmcgc3VtbWFyeSBmb3Igc2Vzc2lvbjogJHtzZXNzaW9uS2V5fWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUaGUgYWdlbnQgbm8gbG9uZ2VyIGtub3dzIGFib3V0IHdvcmt0cmVlczsgdGhlIGhvc3QncyB3b3JrdHJlZSBwcm9qZWN0XG5cdFx0Ly8gKGNyZWF0ZWQgaW4gdGhlIGZpcnN0LXNlbmQgaG9vaykgd2lucyBmb3Igd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbnMsIGFuZFxuXHRcdC8vIGZhbGxzIGJhY2sgdG8gd2hhdGV2ZXIgdGhlIGFnZW50IHJlcG9ydGVkIGZvciBmb2xkZXIgc2Vzc2lvbnMuXG5cdFx0Y29uc3QgcHJvamVjdCA9IHRoaXMuX3dvcmt0cmVlPy5jcmVhdGVkV29ya3RyZWVQcm9qZWN0KEFnZW50U2Vzc2lvbi5pZChlLnNlc3Npb24pKSA/PyBlLnByb2plY3Q7XG5cdFx0Y29uc3QgY3VycmVudFNldCA9IGN1cnJlbnRTdW1tYXJ5LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gVVJJLnBhcnNlKGQpKTtcblx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdC4uLmN1cnJlbnRTdW1tYXJ5LFxuXHRcdFx0Li4uKHByb2plY3QgPyB7IHByb2plY3Q6IHsgdXJpOiBwcm9qZWN0LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogcHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHQvLyBUaGUgbWF0ZXJpYWxpemUgcmVjZWlwdCBpcyBhdXRob3JpdGF0aXZlIGZvciB0aGUgcm9vdHMgaXQgcmVwb3J0c1xuXHRcdFx0Ly8gKGluZGV4IDAgPSB0aGUgcmVzb2x2ZWQgcHJvY2VzcyByb290LCBlLmcuIGEgd29ya3RyZWUpLiBBIHNlbmQtcGF0aFxuXHRcdFx0Ly8gcmVjZWlwdCBjYXJyaWVzIHRoZSBmdWxsIHJlc29sdmVkIHNldDsgYSByZXN1bWUtcGF0aCByZWNlaXB0IHJlcG9ydHNcblx0XHRcdC8vIG9ubHkgdGhlIHByb2Nlc3Mgcm9vdCwgc28gdGhlIHJlc3Qgb2YgdGhlIGN1cnJlbnQgc2V0IGlzIHByZXNlcnZlZC5cblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogcmVjb25jaWxlV29ya2luZ0RpcmVjdG9yaWVzKGN1cnJlbnRTZXQsIGUud29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbmZpZ1ZhbHVlcyA9IHN0YXRlLmNvbmZpZz8udmFsdWVzO1xuXHRcdGlmIChjb25maWdWYWx1ZXMgJiYgT2JqZWN0LmtleXMoY29uZmlnVmFsdWVzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9wZXJzaXN0Q29uZmlnVmFsdWVzKGUuc2Vzc2lvbiwgY29uZmlnVmFsdWVzKTtcblx0XHR9XG5cdFx0Ly8gUGVyc2lzdCB0aGUgQUgtb3duZWQgd29ya3NwYWNlLWxlc3MgbWFya2VyIG5vdyB0aGF0IHRoZSBzZXNzaW9uIGhhcyBhXG5cdFx0Ly8gcmVhbCBvbi1kaXNrIGRhdGFiYXNlIChkZWZlcnJlZCBmcm9tIGNyZWF0ZSBmb3IgcHJvdmlzaW9uYWwgc2Vzc2lvbnMpLlxuXHRcdHRoaXMuX3BlcnNpc3RXb3Jrc3BhY2VsZXNzKGUuc2Vzc2lvbiwgcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHN1bW1hcnkuX21ldGEpKTtcblx0XHQvLyBgbWFya1Nlc3Npb25QZXJzaXN0ZWRgIHdyaXRlcyB0aGUgc3VtbWFyeSBpbnRvIHN0YXRlIGFuZCBmaXJlc1xuXHRcdC8vIHRoZSBkZWZlcnJlZCBgU2Vzc2lvbkFkZGVkYCBub3RpZmljYXRpb24gYXRvbWljYWxseSBzbyBzdWJzY3JpYmVyc1xuXHRcdC8vIHNlZSBjb25zaXN0ZW50IHN0YXRlIHRocm91Z2ggYm90aCBwYXRocy5cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIubWFya1Nlc3Npb25QZXJzaXN0ZWQoc2Vzc2lvbktleSwgc3VtbWFyeSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25LZXksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cblx0XHQvLyBBdHRhY2ggZ2l0IHN0YXRlIGZvciB0aGUgcmVzb2x2ZWQgcHJvY2VzcyByb290IChpbmRleCAwKSwgaWYgcHJlc2VudC5cblx0XHR2b2lkIHRoaXMuX2dpdFN0YXRlU2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKGUuc2Vzc2lvbi50b1N0cmluZygpLCBlLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdKTtcblxuXHRcdC8vIElmIGEgY2xpZW50IHN1YnNjcmliZWQgdG8gdGhpcyBzZXNzaW9uJ3MgdW5jb21taXR0ZWQgY2hhbmdlc2V0XG5cdFx0Ly8gYmVmb3JlIHRoZSB3b3JraW5nIGRpcmVjdG9yeSB3YXMga25vd24sIHRoZSBjb29yZGluYXRvciBkcmFpbnNcblx0XHQvLyB0aGUgZGVmZXJyZWQgcmVmcmVzaCBub3cgdGhhdCB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMgc2V0LlxuXHRcdHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLm9uU2Vzc2lvbk1hdGVyaWFsaXplZChzZXNzaW9uS2V5KTtcblx0fVxuXG5cdC8qKiBEcm9wIGEgc2Vzc2lvbidzIGRvd25sb2FkLXByb2dyZXNzIG9wdC1pbiwgaWYgYW55LiAqL1xuXHRwcml2YXRlIF9jbGVhckRvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdChzZXNzaW9uS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlciwgc2Vzc2lvbnNdIG9mIHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdCkge1xuXHRcdFx0aWYgKHNlc3Npb25zLmRlbGV0ZShzZXNzaW9uS2V5KSAmJiBzZXNzaW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdC5kZWxldGUocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlIGEgaG9zdC1sZXZlbCBTREsgZG93bmxvYWQgYXMgY2xpZW50IHByb2dyZXNzLiBUaGUgZG93bmxvYWRlciBmaXJlc1xuXHQgKiBwcm9jZXNzLWdsb2JhbCBmcmFtZXMga2V5ZWQgYnkgcGFja2FnZSBpZCAod2hpY2ggZXF1YWxzIHRoZSBwcm92aWRlciBpZCk7XG5cdCAqIGJlY2F1c2UgdGhlIGRvd25sb2FkIGlzIHNoYXJlZCBhY3Jvc3MgZXZlcnkgc2Vzc2lvbiBvZiB0aGF0IHByb3ZpZGVyLCB3ZVxuXHQgKiBlbWl0IGEgU0lOR0xFIGBwcm9ncmVzc2Agc3RyZWFtIGtleWVkIGJ5IHRoYXQgcGFja2FnZSBpZCBcdTIwMTQgbm90IG9uZSBwZXJcblx0ICogc2Vzc2lvbiBcdTIwMTQgc28gdGhlIGNsaWVudCBzaG93cyBleGFjdGx5IG9uZSBpbmRpY2F0b3Igbm8gbWF0dGVyIGhvdyBtYW55XG5cdCAqIHNlc3Npb25zIG9mIHRoZSBwcm92aWRlciBhcmUgYXdhaXRpbmcgaXQuIEZyYW1lcyBhcmUgb25seSBlbWl0dGVkIHdoaWxlIGF0XG5cdCAqIGxlYXN0IG9uZSBzZXNzaW9uIGhhcyBvcHRlZCBpbiAoc3VwcGxpZWQgYVxuXHQgKiB7QGxpbmsgSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZy5wcm9ncmVzc1Rva2VufSBvbiBgY3JlYXRlU2Vzc2lvbmApLiBBXG5cdCAqIHRlcm1pbmFsIGZyYW1lIHJlcG9ydHMgYHRvdGFsID09PSBwcm9ncmVzc2AgKHVzaW5nIGByZWNlaXZlZEJ5dGVzYCB3aGVuIHRoZVxuXHQgKiBzaXplIHdhcyBuZXZlciBrbm93bikgc28gdGhlIGNsaWVudCBkaXNtaXNzZXMgdGhlIGluZGljYXRvciBkZXRlcm1pbmlzdGljYWxseS5cblx0ICpcblx0ICogYGRpc3BsYXlOYW1lYCBpcyB0aGUgcHJvdmlkZXIncyBicmFuZCBub3VuIChlLmcuIGBDbGF1ZGVgKS4gSXQgaXMgd292ZW5cblx0ICogaW50byB0aGUgbm90aWZpY2F0aW9uJ3MgbG9jYWxpemVkLCBodW1hbi1yZWFkYWJsZSBgbWVzc2FnZWAgKGUuZy5cblx0ICogXCJEb3dubG9hZGluZyBDbGF1ZGUgYWdlbnRcIikgc28gYSBnZW5lcmljIGNsaWVudCBjYW4gcmVuZGVyIHRoZSBpbmRpY2F0b3Jcblx0ICogdmVyYmF0aW0gd2l0aG91dCBrbm93aW5nIHRoZSByZXNvdXJjZSBpcyBhbiBhZ2VudCBTREsuIE5vIHRyYWlsaW5nXG5cdCAqIGVsbGlwc2lzOiBjbGllbnRzIHJlbmRlciBwcm9ncmVzcyBhcyBcIjx0aXRsZT46IDxwZXJjZW50PlwiLCBzbyBhbiBlbGxpcHNpc1xuXHQgKiB3b3VsZCByZWFkIGFzIGFuIHVudXN1YWwgXCJcdTIwMjY6XCIgKHNlZSAjMzI0NDU1KS5cblx0ICovXG5cdGVtaXREb3dubG9hZFByb2dyZXNzKHBhY2thZ2VJZDogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nLCByZWNlaXZlZEJ5dGVzOiBudW1iZXIsIHRvdGFsQnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZCwgdGVybWluYWw6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdC5nZXQocGFja2FnZUlkKTtcblx0XHRpZiAoIXNlc3Npb25zIHx8IHNlc3Npb25zLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gT24gYSB0ZXJtaW5hbCBmcmFtZSBmb3JjZSBgcHJvZ3Jlc3MgPT09IHRvdGFsYCBzbyBjbGllbnRzIHRyZWF0IHRoZVxuXHRcdC8vIG9wZXJhdGlvbiBhcyBjb21wbGV0ZSAoY292ZXJzIGJvdGggdGhlIGRldGVybWluYXRlIGNhc2UgYW5kIHRoZVxuXHRcdC8vIGluZGV0ZXJtaW5hdGUgb25lIHdoZXJlIGB0b3RhbEJ5dGVzYCB3YXMgbmV2ZXIga25vd24sIHBsdXMgZmFpbHVyZXMgXHUyMDE0XG5cdFx0Ly8gdGhlIHJlYWwgZXJyb3Igc3VyZmFjZXMgdmlhIHRoZSBzZXNzaW9uLWZhaWx1cmUgcGF0aCkuXG5cdFx0Y29uc3QgdG90YWwgPSB0ZXJtaW5hbCA/IHJlY2VpdmVkQnl0ZXMgOiB0b3RhbEJ5dGVzO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRvd25sb2FkLmFnZW50U2RrVGl0bGUnLCBcIkRvd25sb2FkaW5nIHswfSBhZ2VudFwiLCBkaXNwbGF5TmFtZSk7XG5cdFx0Ly8gYHByb2dyZXNzVG9rZW5gIGlzIHRoZSBkb3dubG9hZCdzIG93biBzdGFibGUgaWRlbnRpdHkgKHRoZSBwYWNrYWdlIGlkKSxcblx0XHQvLyBzaGFyZWQgYnkgZXZlcnkgc2Vzc2lvbiBvZiB0aGUgcHJvdmlkZXIsIHNvIHRoZSBjbGllbnQgY29hbGVzY2VzIGFsbFxuXHRcdC8vIGZyYW1lcyBpbnRvIG9uZSBpbmRpY2F0b3IgYW5kIGRpc21pc3NlcyBpdCBvbiB0aGUgdGVybWluYWwgZnJhbWUuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmVtaXRQcm9ncmVzcyh7IHByb2dyZXNzVG9rZW46IHBhY2thZ2VJZCwgcHJvZ3Jlc3M6IHJlY2VpdmVkQnl0ZXMsIHRvdGFsLCBtZXNzYWdlIH0pO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGhpcy5fZG93bmxvYWRQcm9ncmVzc0ludGVyZXN0LmRlbGV0ZShwYWNrYWdlSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BlcnNpc3RXb3Jrc3BhY2VsZXNzKHNlc3Npb246IFVSSSwgd29ya3NwYWNlbGVzczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCByZWY7XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBvcGVuIHNlc3Npb24gZGF0YWJhc2UgdG8gcGVyc2lzdCB3b3Jrc3BhY2VsZXNzIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVmLm9iamVjdC5zZXRNZXRhZGF0YShBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZLCB3b3Jrc3BhY2VsZXNzID8gJ3RydWUnIDogJ2ZhbHNlJykuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHBlcnNpc3Qgd29ya3NwYWNlbGVzcyBmb3IgJHtzZXNzaW9uLnRvU3RyaW5nKCl9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdENvbmZpZ1ZhbHVlcyhzZXNzaW9uOiBVUkksIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRsZXQgcmVmO1xuXHRcdHRyeSB7XG5cdFx0XHRyZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gb3BlbiBzZXNzaW9uIGRhdGFiYXNlIHRvIHBlcnNpc3QgY29uZmlnVmFsdWVzIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVmLm9iamVjdC5zZXRNZXRhZGF0YSgnY29uZmlnVmFsdWVzJywgSlNPTi5zdHJpbmdpZnkodmFsdWVzKSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHBlcnNpc3QgY29uZmlnVmFsdWVzIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQ3JlYXRlZFNlc3Npb25Db25maWcocHJvdmlkZXI6IElBZ2VudCwgY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxTZXNzaW9uQ29uZmlnU3RhdGUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIWNvbmZpZz8uY29uZmlnICYmIGNvbmZpZz8ud29ya2luZ0RpcmVjdG9yaWVzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmFtczogSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMgPSB7XG5cdFx0XHRwcm92aWRlcjogcHJvdmlkZXIuaWQsXG5cdFx0XHQvLyBgcmVzb2x2ZVNlc3Npb25Db25maWdgIGlzIGEgcHJlLXNlc3Npb24sIHNpbmdsZS1jb250ZXh0IEFQSTpcblx0XHRcdC8vIHJlc29sdmUgYWdhaW5zdCB0aGUgc2Vzc2lvbidzIHByaW1hcnkgKGluZGV4IDApLlxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogY29uZmlnLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdFx0Y29uZmlnOiBjb25maWcuY29uZmlnLFxuXHRcdH07XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFdyYXAgd2l0aCB0aGUgaG9zdCdzIGlzb2xhdGlvbiBzY2hlbWEgc28gdGhlIGNyZWF0ZWQgY29uZmlnIGNhcnJpZXMgdGhlXG5cdFx0XHQvLyBgaXNvbGF0aW9uYCAvIGBicmFuY2hgIHZhbHVlcyAoYW5kIHRoZWlyIGdpdC1kZXJpdmVkIGRlZmF1bHRzKS4gVGhlXG5cdFx0XHQvLyBhZ2VudCdzIG93biBgcmVzb2x2ZVNlc3Npb25Db25maWdgIG9taXRzIHRoZW0gKGlzb2xhdGlvbiBpcyBob3N0LW93bmVkKSxcblx0XHRcdC8vIHNvIHdpdGhvdXQgdGhpcyBhIGZyZXNoIHdvcmt0cmVlIHNlc3Npb24ncyBpc29sYXRpb24gaXMgYHVuZGVmaW5lZGAgYXRcblx0XHRcdC8vIGNyZWF0ZSB0aW1lIFx1MjAxNCB0aGUgcGVuZGluZyBtYXJrIGJlbG93IGlzIHNraXBwZWQgYW5kIHRoZSBzZW5kIGZhbGxzIGJhY2tcblx0XHRcdC8vIHRvIGZvbGRlciBldmVuIHRob3VnaCB0aGUgdXNlciBwaWNrZWQgd29ya3RyZWUuXG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3dpdGhJc29sYXRpb25TY2hlbWEoYXdhaXQgcHJvdmlkZXIucmVzb2x2ZVNlc3Npb25Db25maWcodGhpcy5fdG9Qcm92aWRlckNvbmZpZyhwYXJhbXMpKSwgcGFyYW1zKTtcblx0XHRcdHJldHVybiB7IHNjaGVtYTogcmVzb2x2ZWQuc2NoZW1hLCB2YWx1ZXM6IHJlc29sdmVkLnZhbHVlcyB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHJlc29sdmUgY3JlYXRlZCBzZXNzaW9uIGNvbmZpZyBmb3IgcHJvdmlkZXIgJHtwcm92aWRlci5pZH1gLCBlcnIpO1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5jb25maWcgPyB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiBjb25maWcuY29uZmlnIH0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVNlc3Npb25Db25maWcocGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gcGFyYW1zLnByb3ZpZGVyID8/IHRoaXMuX2RlZmF1bHRQcm92aWRlcjtcblx0XHRjb25zdCBwcm92aWRlciA9IHByb3ZpZGVySWQgPyB0aGlzLl9wcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gYWdlbnQgcHJvdmlkZXIgcmVnaXN0ZXJlZCBmb3I6ICR7cHJvdmlkZXJJZCA/PyAnKG5vbmUpJ31gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhJc29sYXRpb25TY2hlbWEoYXdhaXQgcHJvdmlkZXIucmVzb2x2ZVNlc3Npb25Db25maWcodGhpcy5fdG9Qcm92aWRlckNvbmZpZyhwYXJhbXMpKSwgcGFyYW1zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIb3N0LW93bmVkIGNvbnRyaWJ1dGlvbiBvZiB0aGUgc2hhcmVkIGBpc29sYXRpb25gIChmb2xkZXIgLyB3b3JrdHJlZSksXG5cdCAqIGBicmFuY2hgLCBgd29ya3RyZWVCcmFuY2hQcmVmaXhgLCBgd29ya3RyZWVJbmNsdWRlRmlsZXNgLCBhbmQgYHdvcmt0cmVlQnJhbmNoVHJhY2tgIHNlc3Npb24tY29uZmlnXG5cdCAqIHByb3BlcnRpZXMgb24gdG9wIG9mIHdoYXRldmVyIGFuIGFnZW50IHJldHVybmVkIGZyb20gYHJlc29sdmVTZXNzaW9uQ29uZmlnYC4gUHJvdmlkZXItcmV0dXJuZWRcblx0ICogcHJvcGVydGllcyBhbmQgdmFsdWVzIHdpdGggdGhlc2Uga2V5cyBhcmUgcmVwbGFjZWQgYnkgdGhlIGhvc3QgY29udHJpYnV0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2l0aElzb2xhdGlvblNjaGVtYShyZXN1bHQ6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBwYXJhbXM6IElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zKTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdGlmICghdGhpcy5fd29ya3RyZWUpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGlzbyA9IGF3YWl0IHRoaXMuX3dvcmt0cmVlLnJlc29sdmVJc29sYXRpb25Db25maWcoeyB3b3JraW5nRGlyZWN0b3J5OiBwYXJhbXMud29ya2luZ0RpcmVjdG9yeSwgY29uZmlnOiBwYXJhbXMuY29uZmlnIH0pO1xuXHRcdGNvbnN0IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4gPSB7XG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiBpc28uaXNvbGF0aW9uUHJvcGVydHkucHJvdG9jb2wsXG5cdFx0XHQuLi5vbWl0SG9zdE93bmVkU2Vzc2lvbkNvbmZpZyhyZXN1bHQuc2NoZW1hLnByb3BlcnRpZXMpLFxuXHRcdH07XG5cdFx0aWYgKGlzby5icmFuY2hQcm9wZXJ0eSkge1xuXHRcdFx0cHJvcGVydGllc1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF0gPSBpc28uYnJhbmNoUHJvcGVydHkucHJvdG9jb2w7XG5cdFx0fVxuXHRcdGlmIChpc28ud29ya3RyZWVCcmFuY2hQcmVmaXhQcm9wZXJ0eSkge1xuXHRcdFx0cHJvcGVydGllc1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4XSA9IGlzby53b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5LnByb3RvY29sO1xuXHRcdH1cblx0XHRpZiAoaXNvLndvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eSkge1xuXHRcdFx0cHJvcGVydGllc1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoVHJhY2tdID0gaXNvLndvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eS5wcm90b2NvbDtcblx0XHR9XG5cdFx0aWYgKGlzby53b3JrdHJlZUluY2x1ZGVGaWxlc1Byb3BlcnR5KSB7XG5cdFx0XHRwcm9wZXJ0aWVzW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdID0gaXNvLndvcmt0cmVlSW5jbHVkZUZpbGVzUHJvcGVydHkucHJvdG9jb2w7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlcyA9IG9taXRIb3N0T3duZWRTZXNzaW9uQ29uZmlnKHJlc3VsdC52YWx1ZXMpO1xuXHRcdHZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0gPSBpc28uaXNvbGF0aW9uVmFsdWU7XG5cdFx0aWYgKGlzby5icmFuY2hQcm9wZXJ0eSAmJiBpc28uYnJhbmNoVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWVzW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSA9IGlzby5icmFuY2hWYWx1ZTtcblx0XHR9XG5cdFx0aWYgKGlzby53b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5ICYmIHR5cGVvZiBwYXJhbXMuY29uZmlnPy5bU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF0gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR2YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF0gPSBwYXJhbXMuY29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hQcmVmaXhdO1xuXHRcdH1cblx0XHRpZiAoaXNvLndvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eSAmJiB0eXBlb2YgcGFyYW1zLmNvbmZpZz8uW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja10gPT09ICdib29sZWFuJykge1xuXHRcdFx0dmFsdWVzW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja10gPSBwYXJhbXMuY29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja107XG5cdFx0fVxuXHRcdGlmIChpc28ud29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eVxuXHRcdFx0JiYgQXJyYXkuaXNBcnJheShwYXJhbXMuY29uZmlnPy5bU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10pXG5cdFx0XHQmJiBwYXJhbXMuY29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdLmV2ZXJ5KHBhdHRlcm4gPT4gdHlwZW9mIHBhdHRlcm4gPT09ICdzdHJpbmcnKSkge1xuXHRcdFx0dmFsdWVzW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdID0gcGFyYW1zLmNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgc2NoZW1hOiB7IC4uLnJlc3VsdC5zY2hlbWEsIHByb3BlcnRpZXMgfSwgdmFsdWVzIH07XG5cdH1cblxuXHRhc3luYyBzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMocGFyYW1zOiBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMpOiBQcm9taXNlPFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdC8vIFRoZSBob3N0IG93bnMgYnJhbmNoIGNvbXBsZXRpb25zIGZvciBldmVyeSBhZ2VudCAodGhleSBzaGFyZSB0aGUgc2FtZVxuXHRcdC8vIGdpdC1iYWNrZWQgYnJhbmNoIGxpc3QpOyBhbGwgb3RoZXIgcHJvcGVydGllcyBzdGF5IHByb3ZpZGVyLXNwZWNpZmljLlxuXHRcdGlmIChwYXJhbXMucHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQnJhbmNoICYmIHRoaXMuX3dvcmt0cmVlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya3RyZWUuYnJhbmNoQ29tcGxldGlvbnMocGFyYW1zLndvcmtpbmdEaXJlY3RvcnksIHBhcmFtcy5xdWVyeSk7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBwYXJhbXMucHJvdmlkZXIgPz8gdGhpcy5fZGVmYXVsdFByb3ZpZGVyO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJJZCA/IHRoaXMuX3Byb3ZpZGVycy5nZXQocHJvdmlkZXJJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBhZ2VudCBwcm92aWRlciByZWdpc3RlcmVkIGZvcjogJHtwcm92aWRlcklkID8/ICcobm9uZSknfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIuc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHRoaXMuX3RvUHJvdmlkZXJDb25maWcocGFyYW1zKSk7XG5cdH1cblxuXHRhc3luYyBjb21wbGV0aW9ucyhwYXJhbXM6IENvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0aW9ucy5jb21wbGV0aW9ucyhwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKCk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29tcGxldGlvbnMudHJpZ2dlckNoYXJhY3RlcnM7XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXJ2aWNlXSBkaXNwb3NlU2Vzc2lvbjogJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgd29ya2luZyBkaXJlY3RvcmllcyB1cCBmcm9udCBhbmQgcGFzcyB0aGVtIGV4cGxpY2l0bHk6XG5cdFx0Ly8gdGhlIGNoZWNrcG9pbnQgYW5kIHJldmlldyBzZXJ2aWNlcyBuZWVkIHRoZW0gdG8gbG9jYXRlIHRoZVxuXHRcdC8vIHJlcG9zaXRvcmllcyBob2xkaW5nIHRoaXMgc2Vzc2lvbidzIHJlZnMsIGFuZCByZWFkaW5nIHRoZW0gZnJvbVxuXHRcdC8vIHNlc3Npb24gc3RhdGUgd291bGQgc2lsZW50bHkgYnJlYWsgdGhlIG1vbWVudCBgZGVsZXRlU2Vzc2lvbmAgYmVsb3dcblx0XHQvLyBpcyByZW9yZGVyZWQgYWhlYWQgb2YgdGhlIGRhdGEgZGVsZXRpb24uXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKHNlc3Npb24pO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGlzcG9zZVNlc3Npb24ocHJvdmlkZXIsIHNlc3Npb24pO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblRvUHJvdmlkZXIuZGVsZXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHR0aGlzLl9jbGVhckRvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdChzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHQvLyBSZW1vdmUgdGhlIFZTIENvZGUgcGVyLXNlc3Npb24gZGF0YSBkaXJlY3RvcnkgKG1ldGFkYXRhIERCICsgY2hlY2twb2ludHMpIHRvIG1pcnJvciB0aGUgU0RLLXNpZGUgY2xlYW51cFxuXHRcdC8vIHBlcmZvcm1lZCBieSB0aGUgcHJvdmlkZXIgYWJvdmUuIE5vLW9wIHdoZW4gdGhlIGRpcmVjdG9yeSBkb2VzIG5vdCBleGlzdC5cblx0XHQvL1xuXHRcdC8vIFJ1bnMgYmVmb3JlIHRoZSB3b3JrdHJlZSBpcyByZW1vdmVkOiBzdWJzY3JpYmVycyBvZiB0aGUgd2lsbC1kZWxldGVcblx0XHQvLyBldmVudCBkcm9wIHRoaXMgc2Vzc2lvbidzIGdpdCByZWZzLCBhbmQgZm9yIGEgd29ya3RyZWUtaXNvbGF0ZWRcblx0XHQvLyBzZXNzaW9uIHRoZSB3b3JraW5nIGRpcmVjdG9yeSAqaXMqIHRoZSB3b3JrdHJlZSwgc28gb25jZSBpdCBpcyBnb25lXG5cdFx0Ly8gdGhlIHJlcG9zaXRvcnkgY2FuIG5vIGxvbmdlciBiZSByZXNvbHZlZCBhbmQgdGhlIHJlZnMgd291bGQgbGVha1xuXHRcdC8vIGludG8gdGhlIG1haW4gcmVwb3NpdG9yeSAoYHJlZnMvYWdlbnRzLypgIGlzIHNoYXJlZCwgbm90IHBlci13b3JrdHJlZSkuXG5cdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLmRlbGV0ZVNlc3Npb25EYXRhKHNlc3Npb24sIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0Ly8gUmVtb3ZlIGFueSB3b3JrdHJlZSB0aGlzIHByb2Nlc3MgY3JlYXRlZCBmb3IgdGhlIHNlc3Npb24gKGhvc3Qtb3duZWQ7XG5cdFx0Ly8gYWdlbnRzIHN0YXkgdW5hd2FyZSkuXG5cdFx0YXdhaXQgdGhpcy5fd29ya3RyZWU/LnJlbW92ZUNyZWF0ZWRXb3JrdHJlZShBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHRcdHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLm9uU2Vzc2lvbkRpc3Bvc2VkKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMuY2FuY2VsU2Vzc2lvblRpdGxlR2VuZXJhdGlvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNoYXRzID8/IFtdKSB7XG5cdFx0XHR0aGlzLl9zaWRlRWZmZWN0cy5jbGVhclF1ZXVlZE1lc3NhZ2VTZW5kZXJzKGNoYXQucmVzb3VyY2UpO1xuXHRcdH1cblx0XHQvLyBSZW1vdmUgYWxsIHN1YmFnZW50IHNlc3Npb25zIGZvciB0aGlzIHBhcmVudFxuXHRcdHRoaXMuX3NpZGVFZmZlY3RzLnJlbW92ZVN1YmFnZW50U2Vzc2lvbnMoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0Ly8gLS0tLSBQcm90b2NvbCBtZXRob2RzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGNyZWF0ZVRlcm1pbmFsKHBhcmFtczogQ3JlYXRlVGVybWluYWxQYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbE1hbmFnZXIuY3JlYXRlVGVybWluYWwocGFyYW1zKTtcblx0fVxuXG5cdGFzeW5jIGRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGVybWluYWxNYW5hZ2VyLmRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbC50b1N0cmluZygpKTtcblx0fVxuXG5cdGFzeW5jIHN1YnNjcmliZShyZXNvdXJjZTogVVJJLCBjbGllbnRJZDogc3RyaW5nKTogUHJvbWlzZTxJU3RhdGVTbmFwc2hvdD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlcnZpY2VdIHN1YnNjcmliZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdGNvbnN0IHJlc291cmNlU3RyID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHQvLyBSZWdpc3RlciB0aGUgc3Vic2NyaWJlciB1cCBmcm9udCBzbyBhIGNvbmN1cnJlbnQgdW5zdWJzY3JpYmUgY2Fubm90XG5cdFx0Ly8gZXZpY3QgdGhlIHNlc3Npb24gc3RhdGUgd2hpbGUgd2UgYXJlIGF3YWl0aW5nIHJlc3RvcmUuIE9uIGFueSBmYWlsdXJlXG5cdFx0Ly8gcGF0aCBiZWxvdyB3ZSBtdXN0IHJvbGwgdGhlIHJlZ2lzdHJhdGlvbiBiYWNrLCBvdGhlcndpc2UgdGhlIGxlYWtlZFxuXHRcdC8vIHJlZmNvdW50IHdvdWxkIHBlcm1hbmVudGx5IHBpbiAob3IgYmxvY2sgZXZpY3Rpb24gb2YpIHRoZSByZXNvdXJjZS5cblx0XHQvLyB7QGxpbmsgYWRkU3Vic2NyaWJlcn0gaXMgdGhlIHNpbmdsZSBwb2ludCB0aGF0IHRyaWdnZXJzIHRoZVxuXHRcdC8vIHVuY29tbWl0dGVkLWNoYW5nZXNldCByZWZyZXNoIG9uIHRoZSAwXHUyMTkyMSB0cmFuc2l0aW9uIChjb3ZlcnMgYm90aFxuXHRcdC8vIHRoZSBjb2xkLXNuYXBzaG90IHBhdGggaGVyZSBhbmQgdGhlIGhhbmRzaGFrZSBmYXN0LXBhdGggdXNlZCBieVxuXHRcdC8vIHtAbGluayBQcm90b2NvbFNlcnZlckhhbmRsZXJ9IHdoZW4gc3RhdGUgaXMgYWxyZWFkeSBjYWNoZWQpLlxuXHRcdHRoaXMuYWRkU3Vic2NyaWJlcihyZXNvdXJjZSwgY2xpZW50SWQpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBDaGVjayBmb3IgdGVybWluYWwgc3RhdGVcblx0XHRcdGNvbnN0IHRlcm1pbmFsU3RhdGUgPSB0aGlzLl90ZXJtaW5hbE1hbmFnZXIuZ2V0VGVybWluYWxTdGF0ZShyZXNvdXJjZVN0cik7XG5cdFx0XHRpZiAodGVybWluYWxTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4geyByZXNvdXJjZTogcmVzb3VyY2VTdHIsIHN0YXRlOiB0ZXJtaW5hbFN0YXRlLCBmcm9tU2VxOiB0aGlzLl9zdGF0ZU1hbmFnZXIuc2VydmVyU2VxIH07XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzbmFwc2hvdCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChyZXNvdXJjZVN0cik7XG5cdFx0XHRjb25zdCBwYXJzZWRDaGFuZ2VzZXQgPSBwYXJzZUNoYW5nZXNldFVyaShyZXNvdXJjZVN0cik7XG5cdFx0XHRpZiAoc25hcHNob3QgJiYgcGFyc2VkQ2hhbmdlc2V0ICYmICF0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHBhcnNlZENoYW5nZXNldC5zZXNzaW9uVXJpKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5yZXN0b3JlU2Vzc2lvbklmQ2hhbmdlc2V0U3Vic2NyaXB0aW9uKHJlc291cmNlLCBzID0+IHRoaXMucmVzdG9yZVNlc3Npb24ocykpO1xuXHRcdFx0XHRzbmFwc2hvdCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChyZXNvdXJjZVN0cik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNuYXBzaG90KSB7XG5cdFx0XHRcdC8vIENoYXQgY2hhbm5lbCBVUklzIGNhcnJ5IHRoZWlyIG93bmluZyBzZXNzaW9uIFVSSS4gVGhlIGNoYXRcblx0XHRcdFx0Ly8gc25hcHNob3Qgb25seSBtYXRlcmlhbGl6ZXMgb25jZSB0aGF0IHNlc3Npb24gaXMgcmVzdG9yZWRcblx0XHRcdFx0Ly8gKHdoaWNoIHNlZWRzIHRoZSBkZWZhdWx0IGNoYXQgc3RhdGUpLCBzbyByZXN0b3JlIHRoZSBwYXJlbnRcblx0XHRcdFx0Ly8gc2Vzc2lvbiByYXRoZXIgdGhhbiB0aGUgY2hhdCBVUkkgaXRzZWxmLiBUaGlzIG1ha2VzIHRoZVxuXHRcdFx0XHQvLyBjaGF0LWNoYW5uZWwgc3Vic2NyaWJlIHNlbGYtc3VmZmljaWVudCBhbmQgaW5kZXBlbmRlbnQgb2Zcblx0XHRcdFx0Ly8gd2hldGhlciB0aGUgc2Vzc2lvbiBjaGFubmVsIHdhcyBzdWJzY3JpYmVkIGZpcnN0LlxuXHRcdFx0XHRjb25zdCBwYXJzZWRDaGF0U2Vzc2lvbiA9IHBhcnNlRGVmYXVsdENoYXRVcmkocmVzb3VyY2VTdHIpO1xuXHRcdFx0XHRpZiAocGFyc2VkQ2hhdFNlc3Npb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJzZWRDaGF0U2Vzc2lvbikpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcmVudFVyaSA9IFVSSS5wYXJzZShwYXJzZWRDaGF0U2Vzc2lvbik7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRTdWJhZ2VudFBhcmVudCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFVyaSk7XG5cdFx0XHRcdFx0XHRpZiAocGFyc2VkU3ViYWdlbnRQYXJlbnQpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzdG9yZVN1YmFnZW50U2Vzc2lvbihwYXJzZWRDaGF0U2Vzc2lvbiwgcGFyc2VkU3ViYWdlbnRQYXJlbnQucGFyZW50U2Vzc2lvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlc3RvcmVTZXNzaW9uKHBhcmVudFVyaSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNuYXBzaG90ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHJlc291cmNlU3RyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFzbmFwc2hvdCkge1xuXHRcdFx0XHRpZiAoaXNTdWJhZ2VudENoYXRVcmkocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Ly8gTWF5IGJlIG1pZC1yZWdpc3RyYXRpb247IHdhaXQgcmF0aGVyIHRoYW4gZmFpbCBpbW1lZGlhdGVseS5cblx0XHRcdFx0XHRzbmFwc2hvdCA9IGF3YWl0IHRoaXMuX2F3YWl0UGVuZGluZ1N1YmFnZW50Q2hhdChyZXNvdXJjZVN0cik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQ2hhbmdlc2V0IFVSSXMgYXJlIHJvdXRlZCB0aHJvdWdoIHRoZSBjb29yZGluYXRvciAod2hpY2hcblx0XHRcdFx0XHQvLyBvd25zIGl0cyBVUkkgc2hhcGUsIHRoZSB1bmtub3duLWlkIGVhcmx5IHRocm93LCBhbmQgdHVyblxuXHRcdFx0XHRcdC8vIC8gc3RhdGljIHNlZWRpbmcpLiBPdGhlciBVUklzIGZhbGwgdGhyb3VnaCB0byB0aGVcblx0XHRcdFx0XHQvLyBzdWJhZ2VudCAvIHNlc3Npb24tZGVmYXVsdCBwYXRoIGJlbG93LlxuXHRcdFx0XHRcdGNvbnN0IGhhbmRsZWQgPSBhd2FpdCB0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci50cnlIYW5kbGVTdWJzY3JpYmUocmVzb3VyY2UsIHMgPT4gdGhpcy5yZXN0b3JlU2Vzc2lvbihzKSk7XG5cdFx0XHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0XHRcdHNuYXBzaG90ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHJlc291cmNlU3RyKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gVHJ5IHN1YmFnZW50IHJlc3RvcmUgYmVmb3JlIHJlZ3VsYXIgc2Vzc2lvbiByZXN0b3JlXG5cdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRTdWJhZ2VudCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHJlc291cmNlKTtcblx0XHRcdFx0XHRcdGlmIChwYXJzZWRTdWJhZ2VudCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXN0b3JlU3ViYWdlbnRTZXNzaW9uKHJlc291cmNlU3RyLCBwYXJzZWRTdWJhZ2VudC5wYXJlbnRTZXNzaW9uKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVzdG9yZVNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c25hcHNob3QgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QocmVzb3VyY2VTdHIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFzbmFwc2hvdCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBzdWJzY3JpYmUgdG8gdW5rbm93biByZXNvdXJjZTogJHtyZXNvdXJjZVN0cn1gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5zdXJlIGdpdCBzdGF0ZSBoYXMgYmVlbiBjb21wdXRlZCBmb3IgdGhpcyBzZXNzaW9uLiBXaGVuIHRoZSBzbmFwc2hvdFxuXHRcdFx0Ly8gYWxyZWFkeSBleGlzdGVkIChlLmcuIHNlZWRlZCBieSBsaXN0IHF1ZXJ5LCBvciByZXN0b3JlZCBlYXJsaWVyKSwgdGhlXG5cdFx0XHQvLyByZXN0b3JlIHBhdGggdGhhdCBub3JtYWxseSBjYWxscyBgX2F0dGFjaEdpdFN0YXRlYCBpcyBza2lwcGVkIFx1MjAxNCBzb1xuXHRcdFx0Ly8gdHJpZ2dlciBpdCBsYXppbHkgaGVyZSBmb3IgdGhlIGZpcnN0IHN1YnNjcmliZXIuIGBfYXR0YWNoR2l0U3RhdGVgXG5cdFx0XHQvLyBpcyBhc3luYyBhbmQgdXBkYXRlcyBgX21ldGEuZ2l0YCBvbmNlIHJlYWR5LCB3aGljaCBjbGllbnRzIHNlZSB2aWFcblx0XHRcdC8vIHRoZSBub3JtYWwgc3RhdGUtdXBkYXRlIHN0cmVhbS5cblx0XHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUocmVzb3VyY2VTdHIpO1xuXHRcdFx0aWYgKCFpc0FocENoYXRDaGFubmVsKHJlc291cmNlU3RyKSAmJiBzZXNzaW9uU3RhdGUgJiYgcmVhZFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uU3RhdGUuX21ldGEpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHNlc3Npb25TdGF0ZS53b3JraW5nRGlyZWN0b3JpZXM/LlswXVxuXHRcdFx0XHRcdD8gVVJJLnBhcnNlKHNlc3Npb25TdGF0ZS53b3JraW5nRGlyZWN0b3JpZXNbMF0pXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdHZvaWQgdGhpcy5fZ2l0U3RhdGVTZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUocmVzb3VyY2VTdHIsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gc25hcHNob3Q7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLnVuc3Vic2NyaWJlKHJlc291cmNlLCBjbGllbnRJZCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFdhaXRzIGZvciBhbiBhcm1lZCBzdWJhZ2VudCBjaGF0IHRvIHJlZ2lzdGVyIChvciBpdHMgd2FpdCB0byB0aW1lIG91dCk7IHJldHVybnMgYHVuZGVmaW5lZGAgaWYgbm90IGFybWVkIG9yIG5ldmVyIHJlZ2lzdGVyZWQuICovXG5cdHByaXZhdGUgYXN5bmMgX2F3YWl0UGVuZGluZ1N1YmFnZW50Q2hhdChzdWJhZ2VudENoYXRVcmk6IHN0cmluZyk6IFByb21pc2U8SVN0YXRlU25hcHNob3QgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1N1YmFnZW50Q2hhdHMuZ2V0KHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRhd2FpdCBwZW5kaW5nLnA7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChzdWJhZ2VudENoYXRVcmkpO1xuXHR9XG5cblx0YWRkU3Vic2NyaWJlcihyZXNvdXJjZTogVVJJLCBjbGllbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IHNldCA9IHRoaXMuX3Jlc291cmNlU3Vic2NyaWJlcnMuZ2V0KHJlc291cmNlKTtcblx0XHRjb25zdCB3YXNVbnN1YnNjcmliZWQgPSAhc2V0IHx8IHNldC5zaXplID09PSAwO1xuXHRcdGlmICghc2V0KSB7XG5cdFx0XHRzZXQgPSBuZXcgU2V0KCk7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLnNldChyZXNvdXJjZSwgc2V0KTtcblx0XHR9XG5cdFx0c2V0LmFkZChjbGllbnRJZCk7XG5cdFx0Ly8gQSBuZXcgc3Vic2NyaWJlciBtZWFucyB0aGUgc2Vzc2lvbiBpcyBiZWluZyBvYnNlcnZlZCBhZ2FpbjsgY2FuY2VsXG5cdFx0Ly8gYW55IHBlbmRpbmcgR0Mgb3IgaWRsZS1yZWxlYXNlIGFybWVkIHdoaWxlIGl0IGhhZCBubyBzdWJzY3JpYmVycy5cblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nU2Vzc2lvbkdjKHJlc291cmNlKTtcblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nU2Vzc2lvblJlbGVhc2UocmVzb3VyY2UpO1xuXHRcdC8vIDBcdTIxOTIxIHRyYW5zaXRpb24gXHUyMDE0IGNvdmVycyBib3RoIHRoZSBmdWxsIHN1YnNjcmliZSBwYXRoIEFORCB0aGVcblx0XHQvLyBoYW5kc2hha2UgZmFzdC1wYXRoIHVzZWQgYnkgYFByb3RvY29sU2VydmVySGFuZGxlcmAgd2hlbiBzdGF0ZSBpc1xuXHRcdC8vIGFscmVhZHkgY2FjaGVkLiBUaGUgY29vcmRpbmF0b3IgZGVjaWRlcyB3aGV0aGVyIHRoZSBVUkkgaXMgb25lXG5cdFx0Ly8gaXQgY2FyZXMgYWJvdXQgKGUuZy4gdW5jb21taXR0ZWQgY2hhbmdlc2V0IFx1MjE5MiB0cmlnZ2VyIHJlZnJlc2gpLlxuXHRcdGlmICh3YXNVbnN1YnNjcmliZWQpIHtcblx0XHRcdHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKHJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHR1bnN1YnNjcmliZShyZXNvdXJjZTogVVJJLCBjbGllbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2V0ID0gdGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghc2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNldC5kZWxldGUoY2xpZW50SWQpO1xuXHRcdGlmIChzZXQuc2l6ZSA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLm9uTGFzdFN1YnNjcmliZXIocmVzb3VyY2UpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5vbkNoYW5nZXNldExpdmVuZXNzQ2hhbmdlZCgpO1xuXHRcdC8vIEFuIGVtcHR5IHNlc3Npb24gd2hvc2UgbGFzdCBzdWJzY3JpYmVyIGRyb3BwZWQgaXMgYSBjYW5kaWRhdGUgZm9yXG5cdFx0Ly8gZnVsbCBHQyAocHJvdmlkZXIgc2Vzc2lvbiwgd29ya3RyZWUsIG9uLWRpc2sgc3RhdGUpLiBTZXNzaW9ucyB3aXRoXG5cdFx0Ly8gYXQgbGVhc3Qgb25lIHR1cm4gZmFsbCB0aHJvdWdoIHRvIHtAbGluayBfbWF5YmVFdmljdElkbGVTZXNzaW9ufSxcblx0XHQvLyB3aGljaCBvbmx5IGRyb3BzIHRoZSBpbi1tZW1vcnkgY2FjaGUgYW5kIGxldHMgdGhlIHNlc3Npb24gYmVcblx0XHQvLyByZXN0b3JlZCBmcm9tIGRpc2sgbGF0ZXIuIFNraXBwaW5nIGV2aWN0aW9uIGhlcmUgZm9yIGVtcHR5XG5cdFx0Ly8gc2Vzc2lvbnMgZW5zdXJlcyB0aGVpciBzdGF0ZSBzdGF5cyBvYnNlcnZhYmxlIHNvIGEgcmUtc3Vic2NyaWJlXG5cdFx0Ly8gY2FuIHJlLWFybSBHQy5cblx0XHRpZiAodGhpcy5fbWF5YmVTY2hlZHVsZVNlc3Npb25HYyhyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRGVmZXIgdGhlIGlkbGUtc2Vzc2lvbiByZWxlYXNlIGJlaGluZCBhIGdyYWNlIHdpbmRvdyByYXRoZXIgdGhhblxuXHRcdC8vIHJlbGVhc2luZyBzeW5jaHJvbm91c2x5LiBBIGNsaWVudCB0aGF0IHJlY29ubmVjdHMgKG9yIHJlLXN1YnNjcmliZXMpXG5cdFx0Ly8gd2l0aGluIHRoZSB3aW5kb3cgY2FuY2VscyB0aGlzIHZpYSB7QGxpbmsgX2NhbmNlbFBlbmRpbmdTZXNzaW9uUmVsZWFzZX1cblx0XHQvLyBhbmQga2VlcHMgdGhlIGxpdmUgcHJvdmlkZXIgU0RLIHNlc3Npb24sIGF2b2lkaW5nIGEgZGlzY29ubmVjdC9yZXN1bWVcblx0XHQvLyBjaHVybiBjeWNsZSB0aGF0IHJhY2VzIGNvbmN1cnJlbnQgc2Vzc2lvbiBvcGVyYXRpb25zIG9uIHRoZSBzaGFyZWRcblx0XHQvLyBwcm92aWRlciBydW50aW1lLiBBIHplcm8gZ3JhY2UgcmVsZWFzZXMgb24gdGhlIG5leHQgdGljay5cblx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvblJlbGVhc2Uuc2V0KHJlc291cmNlLCBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvblJlbGVhc2UuZGVsZXRlQW5kRGlzcG9zZShyZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9tYXliZUV2aWN0SWRsZVNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdH0sIFNFU1NJT05fUkVMRUFTRV9HUkFDRV9NUykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUGVuZGluZ1Nlc3Npb25SZWxlYXNlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvblJlbGVhc2UuZGVsZXRlQW5kRGlzcG9zZShyZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogSWYgYHJlc291cmNlYCBuYW1lcyBhIHNlc3Npb24gdGhhdCBubyBjbGllbnQgaXMgc3RpbGwgc3Vic2NyaWJlZCB0byBhbmRcblx0ICogdGhhdCBoYXMgcHJvZHVjZWQgbm8gdHVybnMgKGFuZCBoYXMgbm8gYWN0aXZlIHR1cm4pLCBzY2hlZHVsZSBhIGRlbGF5ZWRcblx0ICoge0BsaW5rIF9ydW5TZXNzaW9uR2N9IHRvIGZ1bGx5IHRlYXIgaXQgZG93biBcdTIwMTQgcHJvdmlkZXIgc2Vzc2lvbiwgd29ya3RyZWUsXG5cdCAqIHBlcnNpc3RlZCBzdGF0ZSBhbmQgYWxsLiBTZXNzaW9ucyB3aXRoIGF0IGxlYXN0IG9uZSB0dXJuIGFyZSBsZWZ0IHRvIHRoZVxuXHQgKiBleGlzdGluZyB7QGxpbmsgX21heWJlRXZpY3RJZGxlU2Vzc2lvbn0gcGF0aCB3aGljaCBvbmx5IGRyb3BzIGNhY2hlZFxuXHQgKiBzdGF0ZSBhbmQgbGV0cyB0aGUgc2Vzc2lvbiBiZSByZXN0b3JlZCBmcm9tIGRpc2sgbGF0ZXIuXG5cdCAqXG5cdCAqIFRoZSBkZWxheSAoe0BsaW5rIFNFU1NJT05fR0NfR1JBQ0VfTVN9KSBnaXZlcyBhIGRpc2Nvbm5lY3RlZCBjbGllbnQgdGltZVxuXHQgKiB0byByZWNvbm5lY3Qgb3IgYSB3b3Jrc3BhY2Ugc3dpdGNoIHRvIHNldHRsZS4gQW55IHN1YnNlcXVlbnQgc3Vic2NyaWJlXG5cdCAqIChvciBjcmVhdGVTZXNzaW9uIG9uIHRoZSBzYW1lIFVSSSkgY2FuY2VscyB0aGUgdGltZXIgdmlhXG5cdCAqIHtAbGluayBfY2FuY2VsUGVuZGluZ1Nlc3Npb25HY30uXG5cdCAqXG5cdCAqIFJldHVybnMgYHRydWVgIGlmIGEgR0MgdGltZXIgd2FzIGFybWVkIChleGlzdGluZyBvciBuZXdseSBzY2hlZHVsZWQpLFxuXHQgKiBzbyBjYWxsZXJzIGNhbiBza2lwIGFsdGVybmF0aXZlIGNsZWFudXAgcGF0aHMuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXliZVNjaGVkdWxlU2Vzc2lvbkdjKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBTdWJhZ2VudCBVUklzIGFyZSBiYWNrZWQgYnkgdGhlIHBhcmVudCBzZXNzaW9uOyB0aGUgcGFyZW50J3MgR0MgaXNcblx0XHQvLyBzY2hlZHVsZWQgd2hlbiBpdHMgb3duIHN1YnNjcmliZXIgY291bnQgcmVhY2hlcyB6ZXJvLlxuXHRcdGlmIChwYXJzZVN1YmFnZW50U2Vzc2lvblVyaShyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoa2V5KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChzdGF0ZS50dXJucy5sZW5ndGggPiAwIHx8IHN0YXRlLmFjdGl2ZVR1cm4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvbkdjLnNldChyZXNvdXJjZSwgZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25HYy5kZWxldGVBbmREaXNwb3NlKHJlc291cmNlKTtcblx0XHRcdHRoaXMuX3J1blNlc3Npb25HYyhyZXNvdXJjZSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGBbQWdlbnRTZXJ2aWNlXSBHQyBmYWlsZWQgZm9yICR7a2V5fWApO1xuXHRcdFx0fSk7XG5cdFx0fSwgU0VTU0lPTl9HQ19HUkFDRV9NUykpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUGVuZGluZ1Nlc3Npb25HYyhyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25HYy5kZWxldGVBbmREaXNwb3NlKHJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlcyB7QGxpbmsgU0VTU0lPTl9HQ19HUkFDRV9NU30gYWZ0ZXIgYSBzZXNzaW9uIGxvc3QgaXRzIGxhc3Rcblx0ICogc3Vic2NyaWJlciB3aGlsZSBlbXB0eS4gUmUtY2hlY2tzIGJvdGggaW52YXJpYW50cyAoc3RpbGwgbm8gc3Vic2NyaWJlcnMsXG5cdCAqIHN0aWxsIGVtcHR5KSBiZWZvcmUgdGVhcmluZyB0aGUgc2Vzc2lvbiBkb3duIHZpYSB7QGxpbmsgZGlzcG9zZVNlc3Npb259LlxuXHQgKiBUaGUgY2FjaGVkIHN0YXRlIG1heSBhbHJlYWR5IGhhdmUgYmVlbiBldmljdGVkIGJ5XG5cdCAqIHtAbGluayBfbWF5YmVFdmljdElkbGVTZXNzaW9ufTsgaW4gdGhhdCBjYXNlIHdlIHN0aWxsIHByb2NlZWQgYmVjYXVzZVxuXHQgKiBcImV2aWN0ZWQgKyBubyByZXN1YnNjcmliZVwiIGltcGxpZXMgbm8gY2xpZW50IGlzIG9ic2VydmluZyB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3J1blNlc3Npb25HYyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAodGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShrZXkpO1xuXHRcdGlmIChzdGF0ZSAmJiAoc3RhdGUudHVybnMubGVuZ3RoID4gMCB8fCBzdGF0ZS5hY3RpdmVUdXJuICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50U2VydmljZV0gR0M6IGRpc3Bvc2luZyBlbXB0eSB1bnN1YnNjcmliZWQgc2Vzc2lvbiAke2tleX1gKTtcblx0XHRhd2FpdCB0aGlzLmRpc3Bvc2VTZXNzaW9uKHJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZiBgcmVzb3VyY2VgIG5hbWVzIGFuIGlkbGUgc2Vzc2lvbiBhbmQgbm8gY2xpZW50IGlzIHN0aWxsIHN1YnNjcmliZWQgdG9cblx0ICogaXQgKG9yLCBmb3IgYSBzdWJhZ2VudCBVUkksIG5vIHNpYmxpbmcgc3ViYWdlbnQgdW5kZXIgdGhlIHNhbWUgcGFyZW50IGlzXG5cdCAqIHN0aWxsIHN1YnNjcmliZWQpLCByZWxlYXNlIGl0cyBpbi1tZW1vcnkgZm9vdHByaW50OiBkcm9wIHRoZSBjYWNoZWQgQUhQXG5cdCAqIHN0YXRlIGZyb20gdGhlIHN0YXRlIG1hbmFnZXIgQU5EIGFzayB0aGUgcHJvdmlkZXIgdG8gcmVsZWFzZSB0aGUgc2Vzc2lvbidzXG5cdCAqIFNESyByZXNvdXJjZXMgKHtAbGluayBJQWdlbnQucmVsZWFzZVNlc3Npb259KS4gU3ViYWdlbnQgVVJJcyBldmljdCB0aGVcblx0ICogcGFyZW50IHNlc3Npb24gZW50cnk7IHRoZSBwYXJlbnQgb3ducyB0aGUgbWF0ZXJpYWxpemVkIHR1cm4gdHJlZSB0aGF0XG5cdCAqIGJhY2tzIGV2ZXJ5IHN1YmFnZW50IHZpZXcuIE5vdGhpbmcgZHVyYWJsZSBpcyBkZWxldGVkIFx1MjAxNCB0aGUgbmV4dCBzdWJzY3JpYmVcblx0ICogcmVoeWRyYXRlcyB0aGUgc2Vzc2lvbiB2aWEge0BsaW5rIHJlc3RvcmVTZXNzaW9ufSBhbmQgdGhlIHByb3ZpZGVyIHJlc3VtZXNcblx0ICogdGhlIFNESyBzZXNzaW9uIG9uIGRlbWFuZC5cblx0ICovXG5cdHByaXZhdGUgX21heWJlRXZpY3RJZGxlU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAodGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFdhbGsgdXAgdGhlIHN1YmFnZW50IGFuY2VzdHJ5OiB0aGUgU0RLIHNlc3Npb24gYW5kIGl0cyB0dXJuIHRyZWUgYXJlXG5cdFx0Ly8gb3duZWQgYnkgdGhlIHJvb3Qgc2Vzc2lvbiwgc28gZXZpY3Rpb24gbXVzdCB0YXJnZXQgdGhlIHJvb3QuXG5cdFx0bGV0IGV2aWN0aW9uVGFyZ2V0ID0gcmVzb3VyY2U7XG5cdFx0e1xuXHRcdFx0bGV0IHBhcnNlZDtcblx0XHRcdHdoaWxlICgocGFyc2VkID0gcGFyc2VTdWJhZ2VudFNlc3Npb25VcmkoZXZpY3Rpb25UYXJnZXQpKSkge1xuXHRcdFx0XHRldmljdGlvblRhcmdldCA9IHBhcnNlZC5wYXJlbnRTZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBEb24ndCBldmljdCBpZiB0aGUgcm9vdCBvciBhbnkgb2YgaXRzIHN1YmFnZW50IGRlc2NlbmRhbnRzIHN0aWxsIGhhcyBzdWJzY3JpYmVycy5cblx0XHRpZiAodGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5oYXMoZXZpY3Rpb25UYXJnZXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc3Vic2NyaWJlZFVyaSBvZiB0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmtleXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuX2lzU3ViYWdlbnREZXNjZW5kYW50T2Yoc3Vic2NyaWJlZFVyaSwgZXZpY3Rpb25UYXJnZXQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZXZpY3Rpb25UYXJnZXRLZXkgPSBldmljdGlvblRhcmdldC50b1N0cmluZygpO1xuXHRcdC8vIEEgcmVzdG9yZS9yZXN1bWUgcmFjaW5nIHRoaXMgdW5zdWJzY3JpYmUgbWVhbnMgYSBjbGllbnQgaXMgYWJvdXQgdG9cblx0XHQvLyBvYnNlcnZlIHRoZSBzZXNzaW9uIGFnYWluOyByZWxlYXNpbmcgbm93IHdvdWxkIHRlYXIgZG93biBzdGF0ZSB0aGF0XG5cdFx0Ly8gdGhlIGluLWZsaWdodCByZWh5ZHJhdGUgaXMgcG9wdWxhdGluZy5cblx0XHRpZiAodGhpcy5fcmVzdG9yZVNlc3Npb25JbkZsaWdodC5oYXMoZXZpY3Rpb25UYXJnZXRLZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldFN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShldmljdGlvblRhcmdldEtleSk7XG5cdFx0aWYgKCF0YXJnZXRTdGF0ZSB8fCB0YXJnZXRTdGF0ZS5hY3RpdmVUdXJuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZXJ2aWNlXSBFdmljdGluZyBpZGxlIHNlc3Npb246ICR7ZXZpY3Rpb25UYXJnZXRLZXl9ICh0cmlnZ2VyZWQgYnkgdW5zdWJzY3JpYmUgb2YgJHtrZXl9KWApO1xuXHRcdC8vIEFsc28gZXZpY3QgYW55IHNpYmxpbmcgc3ViYWdlbnQgZW50cmllcyBjYWNoZWQgdW5kZXIgdGhlIHBhcmVudDogdGhlaXJcblx0XHQvLyBhdXRob3JpdGF0aXZlIHN0YXRlIGlzIHRoZSBwYXJlbnQncyB0dXJuIHRyZWUsIGFuZCBkcm9wcGluZyB0aGUgcGFyZW50XG5cdFx0Ly8gd291bGQgbGVhdmUgdGhlbSBvcnBoYW5lZC5cblx0XHRjb25zdCBzdWJhZ2VudFByZWZpeCA9IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpUHJlZml4KGV2aWN0aW9uVGFyZ2V0KTtcblx0XHRmb3IgKGNvbnN0IGNhY2hlZEtleSBvZiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblVyaXNXaXRoUHJlZml4KHN1YmFnZW50UHJlZml4KSkge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlbW92ZVNlc3Npb24oY2FjaGVkS2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlbW92ZVNlc3Npb24oZXZpY3Rpb25UYXJnZXRLZXkpO1xuXHRcdC8vIFJlbGVhc2UgdGhlIHByb3ZpZGVyJ3MgaW4tbWVtb3J5IFNESyBzZXNzaW9uIGluIGxvY2tzdGVwIHdpdGggdGhlXG5cdFx0Ly8gY2FjaGVkIHN0YXRlLiBOb24tZGVzdHJ1Y3RpdmU6IGR1cmFibGUgZGF0YSBpcyBwcmVzZXJ2ZWQgc28gdGhlXG5cdFx0Ly8gc2Vzc2lvbiByZXN1bWVzIHRyYW5zcGFyZW50bHkgb24gdGhlIG5leHQgYWNjZXNzLiBGaXJlLWFuZC1mb3JnZXQgXHUyMDE0XG5cdFx0Ly8gdGhlIHByb3ZpZGVyIHNlcXVlbmNlcyB0aGUgcmVsZWFzZSBpbnRlcm5hbGx5IGFuZCByZS1jaGVja3MgaXRzIG93blxuXHRcdC8vIGludmFyaWFudHMgKGUuZy4gYSB0dXJuIHRoYXQgc3RhcnRlZCBhZnRlciB0aGlzIGNhbGwpLlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihldmljdGlvblRhcmdldCk7XG5cdFx0cHJvdmlkZXI/LnJlbGVhc2VTZXNzaW9uPy4oZXZpY3Rpb25UYXJnZXQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byByZWxlYXNlIGlkbGUgc2Vzc2lvbiAke2V2aWN0aW9uVGFyZ2V0S2V5fWApO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gUmV0dXJucyB0cnVlIHdoZW4gYSBjaGFuZ2VzZXQgaXMgc2FmZSB0byBkcm9wIGZyb20gdGhlIGluLW1lbW9yeSBjYWNoZS5cblx0cHJpdmF0ZSBfaXNDaGFuZ2VzZXRFdmljdGFibGUoY2hhbmdlc2V0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBVUkkucGFyc2UoY2hhbmdlc2V0KTtcblx0XHQvLyBBIGRpcmVjdCBjaGFuZ2VzZXQgc3Vic2NyaWJlciBpcyByZW5kZXJpbmcgdGhpcyBleHBhbmRlZCBVUkkuIEtlZXBcblx0XHQvLyB0aGUgc3RhdGUgYWxpdmUgc28gZnV0dXJlIGVudmVsb3BlcyBzdGlsbCB0YXJnZXQgYW4gZXhpc3Rpbmcgb2JqZWN0LlxuXHRcdGlmICh0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmhhcyhjaGFuZ2VzZXRVcmkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhbmdlc2V0VXJpKGNoYW5nZXNldCk7XG5cdFx0Ly8gVGhpcyBndWFyZCBvbmx5IGhhbmRsZXMgcmVjb2duaXplZCBjaGFuZ2VzZXQgVVJJczsgbGVhdmUgYW55dGhpbmcgZWxzZSBhbG9uZS5cblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uVXJpKTtcblx0XHQvLyBBIHBhcmVudC1zZXNzaW9uIHN1YnNjcmliZXIgY2FuIHN0aWxsIHJlY2VpdmUgY2F0YWxvZ3VlIGNvdW50IHVwZGF0ZXNcblx0XHQvLyBmcm9tIHRoaXMgY2hhbmdlc2V0LCBzbyBrZWVwIHRoZSBiYWNraW5nIHN0YXRlIHdoaWxlIHRoZSBzZXNzaW9uIGlzIG9ic2VydmVkLlxuXHRcdGlmICh0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmhhcyhzZXNzaW9uVXJpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBTdWJhZ2VudCB2aWV3cyBhcmUgYmFja2VkIGJ5IHRoZSBwYXJlbnQgc2Vzc2lvbiB0cmVlOyB0cmVhdCBhbnlcblx0XHQvLyBzdWJzY3JpYmVkIGRlc2NlbmRhbnQgYXMgYSBwYXJlbnQtc2Vzc2lvbiBwaW4gZm9yIGNhY2hlIGV2aWN0aW9uLlxuXHRcdGZvciAoY29uc3Qgc3Vic2NyaWJlZFVyaSBvZiB0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmtleXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuX2lzU3ViYWdlbnREZXNjZW5kYW50T2Yoc3Vic2NyaWJlZFVyaSwgc2Vzc2lvblVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBJZiBhIGdpdC9zZXNzaW9uL3VuY29tbWl0dGVkIGNoYW5nZXNldCByZWNvbXB1dGUgaXMgY3VycmVudGx5IHJ1bm5pbmcgZm9yIHRoaXMgY2hhbmdlc2V0IFVSSSxcblx0XHQvLyBkbyBub3QgZXZpY3QgaXRzIGNhY2hlZCBzdGF0ZSB5ZXQuIE9uY2UgdGhlIGNvbXB1dGUgaXMgZG9uZSxcblx0XHQvLyBpdCBpcyBzYWZlIHRvIGV2aWN0IGJlY2F1c2UgdGhlIHN0YXRlIGlzIGp1c3QgYSBjYWNoZSBhbmQgY2FuIGJlIHJlY3JlYXRlZCBsYXRlci5cblx0XHRyZXR1cm4gIXRoaXMuX2NoYW5nZXNldHMuaXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKGNoYW5nZXNldCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1N1YmFnZW50RGVzY2VuZGFudE9mKHJlc291cmNlOiBVUkksIHBhcmVudDogVVJJKTogYm9vbGVhbiB7XG5cdFx0bGV0IHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHJlc291cmNlKTtcblx0XHR3aGlsZSAocGFyc2VkKSB7XG5cdFx0XHRpZiAoaXNFcXVhbChwYXJzZWQucGFyZW50U2Vzc2lvbiwgcGFyZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHBhcnNlZC5wYXJlbnRTZXNzaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlci1jbGllbnQgc2VxdWVuY2VyIHRoYXQgc2VyaWFsaXNlcyBhY3Rpb24gZGlzcGF0Y2hlcyB3aG9zZVxuXHQgKiBwcm9jZXNzaW5nIHJlcXVpcmVzIGFuIGFzeW5jaHJvbm91cyBwcmVsdWRlIChlLmcuIHNuYXBzaG90dGluZ1xuXHQgKiB1c2VyLW1lc3NhZ2UgYXR0YWNobWVudHMgaW50byB0aGUgc2Vzc2lvbiBkYXRhYmFzZSBiZWZvcmUgdGhlXG5cdCAqIGFjdGlvbiBpcyByZWR1Y2VkIGludG8gc3RhdGUpLiBBY3Rpb25zIHRoYXQgZG9uJ3QgbmVlZCBhbnlcblx0ICogYXN5bmNocm9ub3VzIHByZWx1ZGUgYnlwYXNzIHRoZSBxdWV1ZSBlbnRpcmVseSBhcyBsb25nIGFzIG5vXG5cdCAqIGVhcmxpZXIgYWN0aW9uIGZyb20gdGhlIHNhbWUgY2xpZW50IGlzIHN0aWxsIHBlbmRpbmcuXG5cdCAqXG5cdCAqIHRvZG9AY29ubm9yNDMxMjogd2UgY2FuIGRyb3AgdGhpcyB3aGVuIHNlbmRpbmcgYSBtZXNzYWdlIGJlY29tZSBhIGNvbW1hbmRcblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudERpc3BhdGNoUXVldWVzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cblx0ZGlzcGF0Y2hBY3Rpb24oY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgY2xpZW50SWQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIsIGNsaWVudFR5cGUgPSBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXJ2aWNlXSBkaXNwYXRjaEFjdGlvbjogdHlwZT0ke2FjdGlvbi50eXBlfSwgY2xpZW50SWQ9JHtjbGllbnRJZH0sIGNsaWVudFNlcT0ke2NsaWVudFNlcX1gLCBhY3Rpb24pO1xuXG5cdFx0Ly8gQ2xpZW50cyBkaXNwYXRjaCBjaGF0IChjaGF0KSBhY3Rpb25zIGFnYWluc3QgYSBjaGF0IGNoYW5uZWxcblx0XHQvLyBVUkkuIEtlZXAgdGhhdCBjaGF0IGNoYW5uZWwgZm9yIHRoZSBvcHRpbWlzdGljIHN0YXRlIGFwcGx5IGFuZCBmb3Jcblx0XHQvLyBwZXItY2hhdCByb3V0aW5nIGluIHNpZGUgZWZmZWN0cywgd2hpbGUgZGVyaXZpbmcgdGhlIG93bmluZyBzZXNzaW9uXG5cdFx0Ly8gVVJJIGZvciBhbGwgc2Vzc2lvbi1zY29wZWQgd29yayAoYXR0YWNobWVudCBzbmFwc2hvdHRpbmcsIGFnZW50XG5cdFx0Ly8gbG9va3VwLCB0ZWxlbWV0cnksIHBlcm1pc3Npb25zIFx1MjAxNCBhbGwga2V5ZWQgYnkgc2Vzc2lvbikuXG5cdFx0Y29uc3QgY2hhdENoYW5uZWwgPSBpc0FocENoYXRDaGFubmVsKGNoYW5uZWwpID8gY2hhbm5lbCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZXNzaW9uQ2hhbm5lbCA9IGNoYXRDaGFubmVsID8gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0Q2hhbm5lbCkgOiBjaGFubmVsO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX2NsaWVudERpc3BhdGNoUXVldWVzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFwZW5kaW5nICYmICF0aGlzLl9uZWVkc0FzeW5jUmV3cml0ZShzZXNzaW9uQ2hhbm5lbCwgYWN0aW9uKSkge1xuXHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb25Ob3coY2hhbm5lbCwgc2Vzc2lvbkNoYW5uZWwsIGFjdGlvbiwgY2xpZW50SWQsIGNsaWVudFNlcSwgY2xpZW50VHlwZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5leHQgPSAocGVuZGluZyA/PyBQcm9taXNlLnJlc29sdmUoKSkudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXdyaXR0ZW46IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiA9IHRoaXMuX25lZWRzQXN5bmNSZXdyaXRlKHNlc3Npb25DaGFubmVsLCBhY3Rpb24pXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5fcmV3cml0ZVVzZXJNZXNzYWdlQXR0YWNobWVudHMoc2Vzc2lvbkNoYW5uZWwsIGFjdGlvbiwgY2xpZW50SWQpXG5cdFx0XHRcdDogYWN0aW9uO1xuXHRcdFx0aWYgKHJld3JpdHRlbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVzUmV2aWV3Q2hhbmdlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXZpZXdTZXJ2aWNlLnNldFJldmlld1N0YXRlKGNoYW5uZWwsIHJld3JpdHRlbi5maWxlcywgcmV3cml0dGVuLnJldmlld2VkKTtcblx0XHRcdFx0Y29uc3QgY2hhbmdlc2V0ID0gcGFyc2VDaGFuZ2VzZXRVcmkoY2hhbm5lbCk7XG5cdFx0XHRcdGlmICghY2hhbmdlc2V0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGNoYW5nZXNldCBVUkk6ICR7Y2hhbm5lbH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jaGFuZ2VzZXRzLnJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoY2hhbmdlc2V0LnNlc3Npb25VcmkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb25Ob3coY2hhbm5lbCwgc2Vzc2lvbkNoYW5uZWwsIHJld3JpdHRlbiwgY2xpZW50SWQsIGNsaWVudFNlcSwgY2xpZW50VHlwZSk7XG5cdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudFNlcnZpY2VdIGFzeW5jIGRpc3BhdGNoQWN0aW9uIGZhaWxlZDogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fY2xpZW50RGlzcGF0Y2hRdWV1ZXMuc2V0KGNsaWVudElkLCBuZXh0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NsaWVudERpc3BhdGNoUXVldWVzLmdldChjbGllbnRJZCkgPT09IG5leHQpIHtcblx0XHRcdFx0dGhpcy5fY2xpZW50RGlzcGF0Y2hRdWV1ZXMuZGVsZXRlKGNsaWVudElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwYXRjaEFjdGlvbk5vdyhjaGFubmVsOiBzdHJpbmcsIHNlc3Npb25DaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBjbGllbnRJZDogc3RyaW5nLCBjbGllbnRTZXE6IG51bWJlciwgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZSk6IHZvaWQge1xuXHRcdGNvbnN0IG9yaWdpbiA9IHsgY2xpZW50SWQsIGNsaWVudFNlcSB9O1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihjaGFubmVsLCBhY3Rpb24sIG9yaWdpbik7XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5wZXJzaXN0Um9vdENvbmZpZygpO1xuXHRcdFx0Y29uc3QgZWRpdFRlbGVtZXRyeUVuYWJsZWQgPSBhY3Rpb24uY29uZmlnW0FnZW50SG9zdEVkaXRUZWxlbWV0cnlFbmFibGVkQ29uZmlnS2V5XTtcblx0XHRcdGlmICh0eXBlb2YgZWRpdFRlbGVtZXRyeUVuYWJsZWQgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHR0aGlzLl9lZGl0QXR0cmlidXRpb25TZXJ2aWNlPy5zZXRFbmFibGVkKGVkaXRUZWxlbWV0cnlFbmFibGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgY2xpZW50SWQsIGNsaWVudFR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmVlZHNBc3luY1Jld3JpdGUoY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IGFjdGlvbiBpcyBDaGF0VHVyblN0YXJ0ZWRBY3Rpb24gfCBDaGF0UGVuZGluZ01lc3NhZ2VTZXRBY3Rpb24ge1xuXHRcdGlmIChhY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQgJiYgYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGF0dGFjaG1lbnRzUm9vdFN0ciA9IHRoaXMuX2F0dGFjaG1lbnRzUm9vdChjaGFubmVsKS50b1N0cmluZygpO1xuXHRcdHJldHVybiAhIWFjdGlvbi5tZXNzYWdlLmF0dGFjaG1lbnRzPy5zb21lKGEgPT4gdGhpcy5faXNSZXdyaXRhYmxlQXR0YWNobWVudChhLCBhdHRhY2htZW50c1Jvb3RTdHIpKTtcblx0fVxuXHRwcml2YXRlIF9pc1Jld3JpdGFibGVBdHRhY2htZW50KGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50LCBhdHRhY2htZW50c1Jvb3RTdHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5FbWJlZGRlZFJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKSB7XG5cdFx0XHQvLyBEb24ndCB0cnkgdG8gZmV0Y2ggZGlyZWN0b3JpZXMgb3IgYWxyZWFkeS1yZXdyaXR0ZW4gYXR0YWNobWVudHNcblx0XHRcdC8vICh3aG9zZSBVUklzIGFscmVhZHkgcG9pbnQgdW5kZXIgb3VyIHNlc3Npb24gYXR0YWNobWVudHMgZm9sZGVyKS5cblx0XHRcdGlmIChhdHRhY2htZW50LmRpc3BsYXlLaW5kID09PSAnZGlyZWN0b3J5Jykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXR0YWNobWVudC51cmkuc3RhcnRzV2l0aChhdHRhY2htZW50c1Jvb3RTdHIpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRhY2htZW50c1Jvb3Qoc2Vzc2lvbjogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gam9pblBhdGgodGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLmdldFNlc3Npb25EYXRhRGlyKFVSSS5wYXJzZShzZXNzaW9uKSksIFNFU1NJT05fQVRUQUNITUVOVFNfRElSTkFNRSk7XG5cdH1cblxuXHQvKipcblx0ICogU25hcHNob3QgaW5saW5lIC8gY2xpZW50LXJlc2lkZW50IGF0dGFjaG1lbnQgcGF5bG9hZHMgb250byBkaXNrXG5cdCAqIHVuZGVyIHRoZSBzZXNzaW9uJ3MgZGF0YSBkaXJlY3RvcnkgYW5kIHJld3JpdGUgdGhlIGFjdGlvbiB0b1xuXHQgKiByZWZlcmVuY2UgdGhlbSB2aWEgbG9jYWwgYGZpbGU6YCBVUklzLiBLZWVwcyBwb3RlbnRpYWxseSBsYXJnZVxuXHQgKiBibG9icyAoZS5nLiBwYXN0ZWQgaW1hZ2VzKSBvdXQgb2YgdGhlIGluLW1lbW9yeSBzdGF0ZSB0cmVlIHdoaWxlXG5cdCAqIGxldHRpbmcgdGhlIGFnZW50IGNvbnN1bWUgdGhlbSB2aWEgdGhlIHN0YW5kYXJkIHtAbGluayBJRmlsZVNlcnZpY2V9XG5cdCAqIHN1cmZhY2UgXHUyMDE0IG5vIHNwZWNpYWwgVVJJIHNjaGVtZSBvciBibG9iIHJvdW5kLXRyaXBwaW5nIG5lZWRlZC5cblx0ICpcblx0ICogRmFpbHVyZXMgYXJlIGlzb2xhdGVkIHBlci1hdHRhY2htZW50OiBpZiBhIHJld3JpdGUgY2Fubm90IGJlXG5cdCAqIHBlcmZvcm1lZCAobm8gY2xpZW50IGNvbm5lY3Rpb24gcmVnaXN0ZXJlZCwgYHJlc291cmNlUmVhZGAgcmVqZWN0cyxcblx0ICogZXRjLikgdGhlIG9yaWdpbmFsIGF0dGFjaG1lbnQgaXMgcHJlc2VydmVkIHNvIHRoZSBhZ2VudCBzdGlsbCBoYXMgYVxuXHQgKiBjaGFuY2UgdG8gbWFrZSB1c2Ugb2YgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXdyaXRlVXNlck1lc3NhZ2VBdHRhY2htZW50czxUIGV4dGVuZHMgQ2hhdFR1cm5TdGFydGVkQWN0aW9uIHwgQ2hhdFBlbmRpbmdNZXNzYWdlU2V0QWN0aW9uPihjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogVCwgY2xpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gYWN0aW9uLm1lc3NhZ2UuYXR0YWNobWVudHM7XG5cdFx0aWYgKCFhdHRhY2htZW50cz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdH1cblx0XHRjb25zdCBhdHRhY2htZW50c1Jvb3QgPSB0aGlzLl9hdHRhY2htZW50c1Jvb3QoY2hhbm5lbCk7XG5cdFx0Y29uc3QgYXR0YWNobWVudHNSb290U3RyID0gYXR0YWNobWVudHNSb290LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcmV3cml0dGVuID0gYXdhaXQgUHJvbWlzZS5hbGwoYXR0YWNobWVudHMubWFwKGEgPT4gdGhpcy5fcmV3cml0ZVNpbmdsZUF0dGFjaG1lbnQoYSwgYXR0YWNobWVudHNSb290LCBhdHRhY2htZW50c1Jvb3RTdHIsIGNsaWVudElkKSkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRtZXNzYWdlOiB7IC4uLmFjdGlvbi5tZXNzYWdlLCBhdHRhY2htZW50czogcmV3cml0dGVuIH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jld3JpdGVTaW5nbGVBdHRhY2htZW50KGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50LCBhdHRhY2htZW50c1Jvb3Q6IFVSSSwgYXR0YWNobWVudHNSb290U3RyOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPE1lc3NhZ2VBdHRhY2htZW50PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5FbWJlZGRlZFJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGJ5dGVzID0gZGVjb2RlQmFzZTY0KGF0dGFjaG1lbnQuZGF0YSkuYnVmZmVyO1xuXHRcdFx0XHRjb25zdCBiYXNlbmFtZSA9IHRoaXMuX2F0dGFjaG1lbnRCYXNlbmFtZShhdHRhY2htZW50LmxhYmVsLCBhdHRhY2htZW50LmNvbnRlbnRUeXBlKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3dyaXRlQW5kUmV3cml0ZShhdHRhY2htZW50LCBieXRlcywgYmFzZW5hbWUsIGF0dGFjaG1lbnRzUm9vdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UgJiYgdGhpcy5faXNSZXdyaXRhYmxlQXR0YWNobWVudChhdHRhY2htZW50LCBhdHRhY2htZW50c1Jvb3RTdHIpKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gVVJJLnBhcnNlKGF0dGFjaG1lbnQudXJpKTtcblx0XHRcdFx0Ly8gSWYgdGhlIGF0dGFjaG1lbnQgcmVmZXJlbmNlcyBhIGZpbGUgdGhhdCBhbHJlYWR5IGV4aXN0cyBvbiB0aGUgYWdlbnRcblx0XHRcdFx0Ly8gaG9zdCBzaWRlLCBsZWF2ZSBpdCB1bnRvdWNoZWQgcmF0aGVyIHRoYW4gc25hcHNob3R0aW5nIGEgY2xpZW50IGNvcHkgKCMzMTkzMTQpLlxuXHRcdFx0XHRpZiAob3JpZ2luYWxVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgYXdhaXQgdGhpcy5fZmlsZUV4aXN0c1NhZmUob3JpZ2luYWxVcmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBieXRlcyA9IGF3YWl0IHRoaXMuX3JlYWRDbGllbnRSZXNvdXJjZShvcmlnaW5hbFVyaSwgY2xpZW50SWQpO1xuXHRcdFx0XHRjb25zdCBiYXNlbmFtZSA9IHRoaXMuX2F0dGFjaG1lbnRCYXNlbmFtZShhdHRhY2htZW50LmxhYmVsLCBnZXRNZWRpYU1pbWUob3JpZ2luYWxVcmkucGF0aCkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fd3JpdGVBbmRSZXdyaXRlKGF0dGFjaG1lbnQsIGJ5dGVzLCBiYXNlbmFtZSwgYXR0YWNobWVudHNSb290KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHJld3JpdGUgYXR0YWNobWVudCAnJHthdHRhY2htZW50LmxhYmVsfSc6ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdH1cblxuXHQvKipcblx0ICogTGlrZSB7QGxpbmsgSUZpbGVTZXJ2aWNlLmV4aXN0c30gYnV0IG5ldmVyIHRocm93cyAoZS5nLiB3aGVuIG5vIHByb3ZpZGVyXG5cdCAqIGlzIHJlZ2lzdGVyZWQgZm9yIHRoZSBVUkkgc2NoZW1lKSwgcmV0dXJuaW5nIGBmYWxzZWAgaW4gdGhhdCBjYXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmlsZUV4aXN0c1NhZmUodXJpOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBgb3JpZ2luYWxVcmlgIHRocm91Z2ggdGhlIGB2c2NvZGUtYWdlbnQtY2xpZW50YCBmaWxlc3lzdGVtXG5cdCAqIHByb3ZpZGVyIHNvIGl0IGlzIGZldGNoZWQgZnJvbSB0aGUgb3JpZ2luYXRpbmcgY2xpZW50LiBGYWxscyBiYWNrIHRvXG5cdCAqIGEgZGlyZWN0IHJlYWQgYWdhaW5zdCBgb3JpZ2luYWxVcmlgIHdoZW4gbm8gY2xpZW50IGZpbGVzeXN0ZW1cblx0ICogYXV0aG9yaXR5IGlzIHJlZ2lzdGVyZWQgZm9yIGBjbGllbnRJZGAgKGUuZy4gdW5pdCB0ZXN0cywgaW4tcHJvY2Vzc1xuXHQgKiBhZ2VudCBob3N0IHdpdGggYSBsb2NhbCBVUkkpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZENsaWVudFJlc291cmNlKG9yaWdpbmFsVXJpOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRjb25zdCBwcm94aWVkVXJpID0gY2xpZW50SWQgPyB0b0FnZW50Q2xpZW50VXJpKG9yaWdpbmFsVXJpLCBjbGllbnRJZCkgOiBvcmlnaW5hbFVyaTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShwcm94aWVkVXJpKTtcblx0XHRcdHJldHVybiBjb250ZW50cy52YWx1ZS5idWZmZXI7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAocHJveGllZFVyaSAhPT0gb3JpZ2luYWxVcmkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKG9yaWdpbmFsVXJpKTtcblx0XHRcdFx0XHRyZXR1cm4gY29udGVudHMudmFsdWUuYnVmZmVyO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dyaXRlQW5kUmV3cml0ZShcblx0XHRvcmlnaW5hbDogTWVzc2FnZUF0dGFjaG1lbnQsXG5cdFx0Ynl0ZXM6IFVpbnQ4QXJyYXksXG5cdFx0YmFzZW5hbWU6IHN0cmluZyxcblx0XHRhdHRhY2htZW50c1Jvb3Q6IFVSSSxcblx0KTogUHJvbWlzZTxNZXNzYWdlUmVzb3VyY2VBdHRhY2htZW50PiB7XG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChhdHRhY2htZW50c1Jvb3QsIGlkLCBiYXNlbmFtZSk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldCwgVlNCdWZmZXIud3JhcChieXRlcykpO1xuXHRcdGNvbnN0IHJld3JpdHRlbjogTWVzc2FnZVJlc291cmNlQXR0YWNobWVudCA9IHtcblx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdHVyaTogdGFyZ2V0LnRvU3RyaW5nKCksXG5cdFx0XHRsYWJlbDogb3JpZ2luYWwubGFiZWwsXG5cdFx0XHRkaXNwbGF5S2luZDogb3JpZ2luYWwuZGlzcGxheUtpbmQsXG5cdFx0XHRyYW5nZTogb3JpZ2luYWwucmFuZ2UsXG5cdFx0XHRfbWV0YTogb3JpZ2luYWwuX21ldGEsXG5cdFx0fTtcblx0XHRpZiAob3JpZ2luYWwudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlICYmIG9yaWdpbmFsLnNlbGVjdGlvbikge1xuXHRcdFx0cmV3cml0dGVuLnNlbGVjdGlvbiA9IG9yaWdpbmFsLnNlbGVjdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHJld3JpdHRlbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaWNrIGEgc2Vuc2libGUgb24tZGlzayBiYXNlbmFtZSBmb3IgdGhlIHNuYXBzaG90dGVkIGF0dGFjaG1lbnQsXG5cdCAqIHByZXNlcnZpbmcgYSB1c2FibGUgZXh0ZW5zaW9uIHdoZXJlIHBvc3NpYmxlIHNvIHRoZSBTREsgYW5kIG90aGVyXG5cdCAqIGRvd25zdHJlYW0gY29uc3VtZXJzIGNhbiBkZXRlY3QgdGhlIHJpZ2h0IHR5cGUgZnJvbSB0aGUgcGF0aCBhbG9uZS5cblx0ICovXG5cdHByaXZhdGUgX2F0dGFjaG1lbnRCYXNlbmFtZShsYWJlbDogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCBzYWZlTGFiZWwgPSAobGFiZWwgfHwgJ2F0dGFjaG1lbnQnKS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fFxcdTAwMDAtXFx1MDAxZl0vZywgJ18nKTtcblx0XHRpZiAocmVzb3VyY2VzRXh0bmFtZShVUkkuZmlsZShzYWZlTGFiZWwpKSkge1xuXHRcdFx0cmV0dXJuIHNhZmVMYWJlbDtcblx0XHR9XG5cdFx0Y29uc3QgZXh0ID0gY29udGVudFR5cGUgPyBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShjb250ZW50VHlwZSkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIGV4dCA/IGAke3NhZmVMYWJlbH0ke2V4dH1gIDogc2FmZUxhYmVsO1xuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VMaXN0KHVyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZUxpc3RSZXN1bHQ+IHtcblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUodXJpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBEaXJlY3Rvcnkgbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgYE5vdCBhIGRpcmVjdG9yeTogJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBEaXJlY3RvcnlFbnRyeVtdID0gKHN0YXQuY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiAoe1xuXHRcdFx0bmFtZTogY2hpbGQubmFtZSxcblx0XHRcdHR5cGU6IGNoaWxkLmlzRGlyZWN0b3J5ID8gJ2RpcmVjdG9yeScgOiAnZmlsZScsXG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IGVudHJpZXMgfTtcblx0fVxuXG5cdGFzeW5jIHJlc3RvcmVTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBBbHJlYWR5IGluIHN0YXRlIG1hbmFnZXIgLSBub3RoaW5nIHRvIGRvLlxuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5GbGlnaHQgPSB0aGlzLl9yZXN0b3JlU2Vzc2lvbkluRmxpZ2h0LmdldChzZXNzaW9uU3RyKTtcblx0XHRpZiAoaW5GbGlnaHQpIHtcblx0XHRcdHJldHVybiBpbkZsaWdodDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN0b3JlID0gdGhpcy5fZG9SZXN0b3JlU2Vzc2lvbihzZXNzaW9uLCBzZXNzaW9uU3RyKTtcblx0XHR0aGlzLl9yZXN0b3JlU2Vzc2lvbkluRmxpZ2h0LnNldChzZXNzaW9uU3RyLCByZXN0b3JlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmVzdG9yZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuX3Jlc3RvcmVTZXNzaW9uSW5GbGlnaHQuZ2V0KHNlc3Npb25TdHIpID09PSByZXN0b3JlKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3RvcmVTZXNzaW9uSW5GbGlnaHQuZGVsZXRlKHNlc3Npb25TdHIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvUmVzdG9yZVNlc3Npb24oc2Vzc2lvbjogVVJJLCBzZXNzaW9uU3RyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIGBObyBhZ2VudCBmb3Igc2Vzc2lvbjogJHtzZXNzaW9uU3RyfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1ldGEgPSBhd2FpdCB0aGlzLl9nZXRTZXNzaW9uTWV0YWRhdGFGb3JSZXN0b3JlKGFnZW50LCBzZXNzaW9uKTtcblx0XHRpZiAoIW1ldGEpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gbm90IGZvdW5kIG9uIGJhY2tlbmQ6ICR7c2Vzc2lvblN0cn1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25TdHIpKTtcblx0XHRsZXQgdHVybnM6IHJlYWRvbmx5IFR1cm5bXTtcblx0XHR0cnkge1xuXHRcdFx0dHVybnMgPSBhd2FpdCB0aGlzLl9nZXRDaGF0TWVzc2FnZXMoYWdlbnQsIGRlZmF1bHRDaGF0VXJpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKU09OX1JQQ19JTlRFUk5BTF9FUlJPUiwgYEZhaWxlZCB0byByZXN0b3JlIHNlc3Npb24gJHtzZXNzaW9uU3RyfTogJHttZXNzYWdlfWApO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBwZXJzaXN0ZWQgbWV0YWRhdGEgaW4gdGhlIHNlc3Npb24gZGF0YWJhc2Vcblx0XHRsZXQgdGl0bGUgPSBtZXRhLnN1bW1hcnkgPz8gJ1Nlc3Npb24nO1xuXHRcdGxldCBpc1JlYWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGlzQXJjaGl2ZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHBlcnNpc3RlZENvbmZpZ1ZhbHVlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2hhbmdlczogQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGdpdE1ldGFkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGFuZ2VzZXRNZXRhZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2Vzc2lvbk1ldGFkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlPy4oc2Vzc2lvbik7XG5cdFx0aWYgKHJlZikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGIgPSBhd2FpdCByZWY7XG5cdFx0XHRcdGlmIChkYikge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtID0gYXdhaXQgZGIub2JqZWN0LmdldE1ldGFkYXRhT2JqZWN0KHtcblx0XHRcdFx0XHRcdFx0Y3VzdG9tVGl0bGU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFtBSF9NRVRBX0lTX1JFQURfREJfS0VZXTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0W0FIX01FVEFfSVNfQVJDSElWRURfREJfS0VZXTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0W0FIX01FVEFfSVNfRE9ORV9EQl9LRVldOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRjb25maWdWYWx1ZXM6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Li4uR0lUX0RCX01FVEFEQVRBX0tFWVMsXG5cdFx0XHRcdFx0XHRcdC4uLkNIQU5HRVNFVF9EQl9NRVRBREFUQV9LRVlTLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAobS5jdXN0b21UaXRsZSkge1xuXHRcdFx0XHRcdFx0XHR0aXRsZSA9IG0uY3VzdG9tVGl0bGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobVtBSF9NRVRBX0lTX1JFQURfREJfS0VZXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGlzUmVhZCA9IG1bQUhfTUVUQV9JU19SRUFEX0RCX0tFWV0gPT09ICd0cnVlJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHBlcnNpc3RlZEFyY2hpdmVkID0gbVtBSF9NRVRBX0lTX0FSQ0hJVkVEX0RCX0tFWV0gPz8gbVtBSF9NRVRBX0lTX0RPTkVfREJfS0VZXTtcblx0XHRcdFx0XHRcdGlmIChwZXJzaXN0ZWRBcmNoaXZlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGlzQXJjaGl2ZWQgPSBwZXJzaXN0ZWRBcmNoaXZlZCA9PT0gJ3RydWUnO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjaGFuZ2VzZXRNZXRhZGF0YSA9IG0gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0XHRcdFx0XHRcdGlmIChjaGFuZ2VzZXRNZXRhZGF0YVtNRVRBX0NIQU5HRVNfU1VNTUFSWV0pIHtcblx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRjaGFuZ2VzID0gSlNPTi5wYXJzZShjaGFuZ2VzZXRNZXRhZGF0YVtNRVRBX0NIQU5HRVNfU1VNTUFSWV0pO1xuXHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBwYXJzZSBjaGFuZ2VzIHN1bW1hcnkgZm9yICR7c2Vzc2lvblN0cn06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRnaXRNZXRhZGF0YSA9IG0gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHRcdFx0XHRcdFx0aWYgKGdpdE1ldGFkYXRhW01FVEFfR0lUX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGdpdFN0YXRlID0gSlNPTi5wYXJzZShnaXRNZXRhZGF0YVtNRVRBX0dJVF9TVEFURV0pO1xuXHRcdFx0XHRcdFx0XHRcdHNlc3Npb25NZXRhZGF0YSA9IHsgW1NFU1NJT05fTUVUQV9HSVRfS0VZXTogZ2l0U3RhdGUgfTtcblx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcGFyc2UgR2l0IHN0YXRlIGZvciAke3Nlc3Npb25TdHJ9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGdpdE1ldGFkYXRhW01FVEFfR0lUSFVCX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGdpdGh1YlN0YXRlID0gSlNPTi5wYXJzZShnaXRNZXRhZGF0YVtNRVRBX0dJVEhVQl9TVEFURV0pO1xuXHRcdFx0XHRcdFx0XHRcdHNlc3Npb25NZXRhZGF0YSA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdC4uLihzZXNzaW9uTWV0YWRhdGEgPyBzZXNzaW9uTWV0YWRhdGEgOiB7fSksXG5cdFx0XHRcdFx0XHRcdFx0XHRbU0VTU0lPTl9NRVRBX0dJVEhVQl9LRVldOiBnaXRodWJTdGF0ZVxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHBhcnNlIEdpdEh1YiBzdGF0ZSBmb3IgJHtzZXNzaW9uU3RyfTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChtW0FIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0c2Vzc2lvbk1ldGFkYXRhID0gd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHNlc3Npb25NZXRhZGF0YSwgbVtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXSA9PT0gJ3RydWUnKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKG0uY29uZmlnVmFsdWVzKSB7XG5cdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0cGVyc2lzdGVkQ29uZmlnVmFsdWVzID0gSlNPTi5wYXJzZShtLmNvbmZpZ1ZhbHVlcyk7XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHBhcnNlIHBlcnNpc3RlZCBjb25maWdWYWx1ZXMgZm9yICR7c2Vzc2lvblN0cn06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRkYi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQmVzdC1lZmZvcnQ6IGZhbGwgYmFjayB0byBhZ2VudC1wcm92aWRlZCBtZXRhZGF0YVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVuY29kZSBpc1JlYWQvaXNBcmNoaXZlZCBhcyBzdGF0dXMgYml0bWFzayBmbGFnc1xuXHRcdGxldCBzdGF0dXM6IFNlc3Npb25TdGF0dXMgPSBTZXNzaW9uU3RhdHVzLklkbGU7XG5cdFx0aWYgKGlzUmVhZCkge1xuXHRcdFx0c3RhdHVzIHw9IFNlc3Npb25TdGF0dXMuSXNSZWFkO1xuXHRcdH1cblx0XHRpZiAoaXNBcmNoaXZlZCkge1xuXHRcdFx0c3RhdHVzIHw9IFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uU3RyLFxuXHRcdFx0cHJvdmlkZXI6IGFnZW50LmlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRzdGF0dXMsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKG1ldGEuc3RhcnRUaW1lKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUobWV0YS5tb2RpZmllZFRpbWUpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHQuLi4obWV0YS5wcm9qZWN0ID8geyBwcm9qZWN0OiB7IHVyaTogbWV0YS5wcm9qZWN0LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogbWV0YS5wcm9qZWN0LmRpc3BsYXlOYW1lIH0gfSA6IHt9KSxcblx0XHRcdGNoYW5nZXM6IG1ldGEuY2hhbmdlcyA/PyBjaGFuZ2VzLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBtZXRhLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHRcdF9tZXRhOiAoc2Vzc2lvbk1ldGFkYXRhIHx8IG1ldGEuX21ldGEpID8geyAuLi4obWV0YS5fbWV0YSA/PyB7fSksIC4uLihzZXNzaW9uTWV0YWRhdGEgPz8ge30pIH0gOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IFtkZWZhdWx0RHJhZnQsIGRlZmF1bHRDaGF0VGl0bGVdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fZ2V0Q2hhdERyYWZ0KHNlc3Npb24sIGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdHRoaXMuX3JlYWRQZXJzaXN0ZWRDaGF0VGl0bGUoc2Vzc2lvbiwgZGVmYXVsdENoYXRVcmkpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IG1lcmdlZFR1cm5zID0gYXdhaXQgdGhpcy5faW50ZXJsZWF2ZUxvY2FsVHVybnMoc2Vzc2lvblN0ciwgZGVmYXVsdENoYXRVcmkudG9TdHJpbmcoKSwgdHVybnMpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZXN0b3JlU2Vzc2lvbihzdW1tYXJ5LCBtZXJnZWRUdXJucywgeyBkcmFmdDogZGVmYXVsdERyYWZ0LCBkZWZhdWx0Q2hhdFRpdGxlIH0pO1xuXG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dW5rbm93bj5bXSA9IFtdO1xuXHRcdC8vIEVhZ2VybHkgcmVnaXN0ZXIgc3ViYWdlbnQgY2hpbGQgc2Vzc2lvbnMgZGlzY292ZXJlZCBpbiB0aGUgZXZlbnQgbG9nXG5cdFx0Ly8gc28gdGhlIGNsaWVudCdzIHBlci1zdWJhZ2VudCBzdWJzY3JpcHRpb25zIHJlc29sdmUgZnJvbSBpbi1tZW1vcnlcblx0XHQvLyBzdGF0ZSAoaGl0dGluZyBgcmVzdG9yZVN1YmFnZW50IHNraXBwZWQgZXhpc3RpbmdgKSBpbnN0ZWFkIG9mIGVhY2hcblx0XHQvLyByZS1mZXRjaGluZyBhbmQgcmUtcmVjb25zdHJ1Y3RpbmcgdGhlIGZ1bGwgcGFyZW50IGV2ZW50IGxvZy4gVGhlXG5cdFx0Ly8gYWdlbnQgc2VydmVzIHRoZXNlIGZyb20gdGhlIHNhbWUgcmVjb25zdHJ1Y3Rpb24gaXQgYWxyZWFkeSBwcm9kdWNlZFxuXHRcdC8vIGZvciB0aGUgcGFyZW50IHR1cm5zIGFib3ZlLCBzbyB0aGlzIGFkZHMgbm8gZXh0cmEgZXZlbnQtbG9nIHJlYWRzLlxuXHRcdHByb21pc2VzLnB1c2goKGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChhZ2VudC5nZXRTdWJhZ2VudFNlc3Npb25zKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBhZ2VudC5nZXRTdWJhZ2VudFNlc3Npb25zKHNlc3Npb24pO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyUmVzdG9yZWRTdWJhZ2VudChjaGlsZCwgc3VtbWFyeSwgc2Vzc2lvblN0cik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIHJlc3RvcmVTZXNzaW9uIGZhaWxlZCB0byBlYWdlcmx5IHJlZ2lzdGVyIHN1YmFnZW50cyBzZXNzaW9uPSR7c2Vzc2lvblN0cn1gLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkoKSk7XG5cblx0XHQvLyBSZXN0b3JlIGFueSBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgcGVlciBjaGF0cyB0aGUgcHJvdmlkZXIgaGFzXG5cdFx0Ly8gcGVyc2lzdGVkIGZvciB0aGlzIHNlc3Npb24sIHNlZWRpbmcgZWFjaCB3aXRoIGl0cyBvd24gaGlzdG9yeSBhbmRcblx0XHQvLyBwZXJzaXN0ZWQgdGl0bGUgc28gdGhleSByZWFwcGVhciBhZnRlciBhIHByb2Nlc3MgcmVzdGFydC5cblx0XHRwcm9taXNlcy5wdXNoKHRoaXMuX3Jlc3RvcmVQZWVyQ2hhdHMoYWdlbnQsIHNlc3Npb24pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSBzdGF0aWMgY2hhbmdlc2V0IFVSSXMgYW5kIHJlc2VlZCB0aGVtIGZyb20gYW55XG5cdFx0Ly8gcGVyc2lzdGVkIGZpbGUgbGlzdHMgaW4gdGhlIGJhdGNoZWQgbWV0YWRhdGEgcmVhZC4gVGhlIGNhdGFsb2d1ZVxuXHRcdC8vIGl0c2VsZiBpcyBzZWVkZWQgb24gYHN0YXRlLmNoYW5nZXNldHNgIHN5bmNocm9ub3VzbHkgYnkgdGhlXG5cdFx0Ly8gYHNldFNlc3Npb25DaGFuZ2VzZXRzYCBjYWxsIGFib3ZlLiBUaGUgY29vcmRpbmF0b3IgZHJhaW5zIGFueVxuXHRcdC8vIHVuY29tbWl0dGVkIHJlZnJlc2ggZGVmZXJyZWQgYnkgYW4gZWFybGllciBgYWRkU3Vic2NyaWJlcmAgXHUyMDE0XG5cdFx0Ly8gYGFkZFN1YnNjcmliZXJgJ3MgMFx1MjE5MjEgdHJpZ2dlciBtYXkgaGF2ZSBmaXJlZCBmb3Jcblx0XHQvLyBgPHNlc3Npb24+L2NoYW5nZXNldC91bmNvbW1pdHRlZGAgYmVmb3JlIHRoaXMgcmVzdG9yZSByYW4gKGUuZy5cblx0XHQvLyBhY3RpdmUtc2Vzc2lvbiBhdXRvcnVuIHN1YnNjcmliaW5nIGluIHBhcmFsbGVsIHdpdGggdGhlXG5cdFx0Ly8gY2hhdC12aWV3KTsgbm93IHRoYXQgYHN1bW1hcnkud29ya2luZ0RpcmVjdG9yeWAgaXMgcG9wdWxhdGVkLFxuXHRcdC8vIHJlLXRyaWdnZXJpbmcgdGhlIHJlZnJlc2ggZGlzcGF0Y2hlcyB0byB0aGUgY29tcHV0ZSBwYXRoLlxuXHRcdHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLm9uU2Vzc2lvblJlc3RvcmVkKHNlc3Npb25TdHIsIGNoYW5nZXNldE1ldGFkYXRhID8/IHt9KTtcblxuXHRcdC8vIFJlc3RvcmUgcGVyc2lzdGVkIGBfbWV0YWAgKGUuZy4gZ2l0IHN0YXRlKSBvbnRvIHRoZSBuZXcgc2Vzc2lvblxuXHRcdC8vIHN0YXRlLiBUaGlzIGRpc3BhdGNoZXMgYSBTZXNzaW9uTWV0YUNoYW5nZWQgYWN0aW9uLlxuXHRcdGlmIChtZXRhLl9tZXRhKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbk1ldGEoc2Vzc2lvblN0ciwgbWV0YS5fbWV0YSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgc2Vzc2lvbiBjb25maWcgc28gY2xpZW50cyAoZS5nLiB0aGUgcnVubmluZy1zZXNzaW9uXG5cdFx0Ly8gYXV0by1hcHByb3ZlIHBpY2tlcikgY2FuIHJlbmRlciBzZXNzaW9uLW11dGFibGUgcHJvcGVydGllcyBmb3Jcblx0XHQvLyBzZXNzaW9ucyB0aGF0IHdlcmUgbm90IGNyZWF0ZWQgaW4gdGhlIGN1cnJlbnQgcHJvY2VzcyBsaWZldGltZS5cblx0XHQvLyBPdmVybGF5IGFueSB2YWx1ZXMgdGhlIHVzZXIgcHJldmlvdXNseSBzZWxlY3RlZCAocGVyc2lzdGVkIHZpYVxuXHRcdC8vIGBTZXNzaW9uQ29uZmlnQ2hhbmdlZGApIG9uIHRvcCBvZiB0aGUgcHJvdmlkZXIncyByZXNvbHZlZCBkZWZhdWx0cy5cblx0XHRjb25zdCBbcmVzdG9yZWRDb25maWcsIHJlc3RvcmVkQ3VzdG9taXphdGlvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUNyZWF0ZWRTZXNzaW9uQ29uZmlnKGFnZW50LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogbWV0YS53b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRcdGNvbmZpZzogcGVyc2lzdGVkQ29uZmlnVmFsdWVzLFxuXHRcdFx0fSksXG5cdFx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnNcblx0XHRcdFx0PyBhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvbikuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRTZXJ2aWNlXSByZXN0b3JlU2Vzc2lvbjogZmFpbGVkIHRvIHJlc29sdmUgc2Vzc2lvbiBjdXN0b21pemF0aW9ucycsIGVycik7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSlcblx0XHRcdFx0OiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdC4uLnByb21pc2VzXG5cdFx0XSk7XG5cdFx0aWYgKHJlc3RvcmVkQ29uZmlnKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uU3RyLCByZXN0b3JlZENvbmZpZyk7XG5cdFx0fVxuXHRcdC8vIFNlZWQgcmVzdG9yZWQgc2Vzc2lvbiBjdXN0b21pemF0aW9ucyBpbnRvIHN0YXRlIHNvIHRoZSB2ZXJ5IGZpcnN0XG5cdFx0Ly8gc25hcHNob3QgYWZ0ZXIgc2VsZWN0aW5nIGFuIGV4aXN0aW5nIHNlc3Npb24gY29udGFpbnMgZWZmZWN0aXZlXG5cdFx0Ly8gaW5zdHJ1Y3Rpb25zL2FnZW50cyB3aXRob3V0IHdhaXRpbmcgZm9yIGEgZm9sbG93LXVwIHJlcHVibGlzaC5cblx0XHRpZiAocmVzdG9yZWRDdXN0b21pemF0aW9ucyAmJiByZXN0b3JlZEN1c3RvbWl6YXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvblN0ciwgcmVzdG9yZWRDdXN0b21pemF0aW9ucyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZXJ2aWNlXSBSZXN0b3JlZCBzZXNzaW9uICR7c2Vzc2lvblN0cn0gd2l0aCAke3R1cm5zLmxlbmd0aH0gdHVybnNgKTtcblxuXHRcdHZvaWQgdGhpcy5fZ2l0U3RhdGVTZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChzZXNzaW9uU3RyLCBtZXRhLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlcyB0aGUgYWRkaXRpb25hbCAobm9uLWRlZmF1bHQpIHBlZXIgY2hhdHMgZm9yIGEgc2Vzc2lvbi5cblx0ICpcblx0ICogRW51bWVyYXRpb24gaXMgZHJpdmVuIGJ5IHRoZSBvcmNoZXN0cmF0b3IncyBPV04gcGVyc2lzdGVkIGNhdGFsb2cgKHRoZVxuXHQgKiB7QGxpbmsgUEVFUl9DSEFUU19NRVRBREFUQV9LRVl9IGJsb2IpLiBGb3IgZWFjaCBjYXRhbG9nIGVudHJ5IHRoZSBhZ2VudCdzXG5cdCAqIGluLW1lbW9yeSBiYWNraW5nIGlzIHJlLWF0dGFjaGVkIHZpYVxuXHQgKiB7QGxpbmsgSUFnZW50Lm1hdGVyaWFsaXplQ2hhdH0gKGhhbmRpbmcgYmFjayB0aGUgb3BhcXVlXG5cdCAqIGBwcm92aWRlckRhdGFgIGJsb2IpIEJFRk9SRSBpdHMgaGlzdG9yeSBpcyByZWFkLCB0aGVuIHRoZSBjaGF0IGlzXG5cdCAqIHJlLXJlZ2lzdGVyZWQgaW4gdGhlIHN0YXRlIG1hbmFnZXIgd2l0aCBpdHMgcGVyc2lzdGVkIHRpdGxlIGFuZCBkcmFmdCBzb1xuXHQgKiBpdCByZWFwcGVhcnMgYWZ0ZXIgYSBwcm9jZXNzIHJlc3RhcnQuIEJlc3QtZWZmb3J0OiBhIGNoYXQgd2hvc2UgaGlzdG9yeVxuXHQgKiBmYWlscyB0byBsb2FkIGlzIHJlc3RvcmVkIHdpdGggbm8gdHVybnMgcmF0aGVyIHRoYW4gZHJvcHBlZC5cblx0ICpcblx0ICogV2hlbiB0aGUgb3JjaGVzdHJhdG9yIGNhdGFsb2cgaXMgYWJzZW50ICh7QGxpbmsgX3JlYWRQZXJzaXN0ZWRQZWVyQ2hhdENhdGFsb2d9XG5cdCAqIHJldHVybnMgYHVuZGVmaW5lZGApIHRoZSBzZXNzaW9uIHByZWRhdGVzIG9yY2hlc3RyYXRvci1vd25lZCBwZXJzaXN0ZW5jZTpcblx0ICogYSBvbmUtdGltZSBtaWdyYXRpb24gKHtAbGluayBfbWlncmF0ZUxlZ2FjeVBlZXJDaGF0c30pIGRyYWlucyB0aGUgYWdlbnQnc1xuXHQgKiBsZWdhY3kgYCouY2hhdHNgIGVudW1lcmF0aW9uIGludG8gdGhlIGNhdGFsb2cgc28gaXQgaXMgbmV2ZXIgY29uc3VsdGVkXG5cdCAqIGFnYWluLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzdG9yZVBlZXJDaGF0cyhhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwZXJzaXN0ZWQgPSBhd2FpdCB0aGlzLl9yZWFkUGVyc2lzdGVkUGVlckNoYXRDYXRhbG9nKHNlc3Npb24pO1xuXHRcdGlmIChwZXJzaXN0ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gVGhlIG9yY2hlc3RyYXRvciBvd25zIHRoZSBjYXRhbG9nOiBlbnVtZXJhdGUgZnJvbSBpdC5cblx0XHRcdGF3YWl0IHRoaXMuX3Jlc3RvcmVQZWVyQ2hhdHNGcm9tQ2F0YWxvZyhhZ2VudCwgc2Vzc2lvbiwgcGVyc2lzdGVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gTm8gb3JjaGVzdHJhdG9yIGNhdGFsb2cgeWV0OiBvbmUtdGltZSBtaWdyYXRpb24gZnJvbSBsZWdhY3kgYCouY2hhdHNgLlxuXHRcdGF3YWl0IHRoaXMuX21pZ3JhdGVMZWdhY3lQZWVyQ2hhdHMoYWdlbnQsIHNlc3Npb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9uZS10aW1lIG1pZ3JhdGlvbiBmb3Igc2Vzc2lvbnMgcGVyc2lzdGVkIGJlZm9yZSB0aGUgb3JjaGVzdHJhdG9yIG93bmVkXG5cdCAqIHRoZSBwZWVyLWNoYXQgY2F0YWxvZzogZW51bWVyYXRlIHRoZSBhZ2VudCdzIGxlZ2FjeSBgKi5jaGF0c2Bcblx0ICogKHtAbGluayBJQWdlbnQubGlzdExlZ2FjeUNoYXRzfSksIHJlc3RvcmUgdGhlbSB2aWEgdGhlIHNhbWUgcGF0aCBhcyB0aGVcblx0ICogbmV3IGNhdGFsb2csIHRoZW4gd3JpdGUgdGhlIG9yY2hlc3RyYXRvciB7QGxpbmsgUEVFUl9DSEFUU19NRVRBREFUQV9LRVl9XG5cdCAqIGJsb2Igc28gc3Vic2VxdWVudCByZXN0b3JlcyByZWFkIHRoZSBuZXcgY2F0YWxvZyBhbmQgbmV2ZXIgY29uc3VsdCB0aGVcblx0ICogbGVnYWN5IHJlYWQgYWdhaW4uIE5vLW9wIHdoZW4gdGhlIGFnZW50IGhhcyBubyBsZWdhY3kgZW51bWVyYXRpb24gb3Igbm9uZVxuXHQgKiBpcyBwZXJzaXN0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9taWdyYXRlTGVnYWN5UGVlckNoYXRzKGFnZW50OiBJQWdlbnQsIHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxlZ2FjeSA9IGF3YWl0IGFnZW50Lmxpc3RMZWdhY3lDaGF0cz8uKHNlc3Npb24pO1xuXHRcdGlmICghbGVnYWN5IHx8IGxlZ2FjeS5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIFdyaXRlIGFuIGVtcHR5IGNhdGFsb2cgc2VudGluZWwgc28gYF9yZWFkUGVyc2lzdGVkUGVlckNoYXRDYXRhbG9nYFxuXHRcdFx0Ly8gcmV0dXJucyBgW11gIG9uIHN1YnNlcXVlbnQgcmVzdG9yZXMgYW5kIHRoaXMgbWlncmF0aW9uIG5ldmVyIHJlLXJ1bnMuXG5cdFx0XHRhd2FpdCB0aGlzLl9lbnF1ZXVlUGVlckNoYXRDYXRhbG9nV3JpdGUoc2Vzc2lvbiwgKCkgPT4gW10pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyaWVzOiBJUGVyc2lzdGVkUGVlckNoYXRbXSA9IGxlZ2FjeS5tYXAoY2hhdCA9PiAoe1xuXHRcdFx0dXJpOiBjaGF0LnVyaS50b1N0cmluZygpLFxuXHRcdFx0Li4uKGNoYXQucHJvdmlkZXJEYXRhICE9PSB1bmRlZmluZWQgPyB7IHByb3ZpZGVyRGF0YTogY2hhdC5wcm92aWRlckRhdGEgfSA6IHt9KSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgdGhpcy5fcmVzdG9yZVBlZXJDaGF0c0Zyb21DYXRhbG9nKGFnZW50LCBzZXNzaW9uLCBlbnRyaWVzKTtcblx0XHQvLyBTaW5nbGUgYXRvbWljIHdyaXRlOiB0aGUga2V5IGlzIGFic2VudCBiZWZvcmUgYW5kIGNvbXBsZXRlIGFmdGVyLCBzbyBub1xuXHRcdC8vIHBhcnRpYWwgY2F0YWxvZyBjYW4gc3Vydml2ZSBhIGNyYXNoIG1pZC1taWdyYXRpb24gKHdoaWNoIHdvdWxkIG1ha2Vcblx0XHQvLyBgX3JlYWRQZXJzaXN0ZWRQZWVyQ2hhdENhdGFsb2dgIHJldHVybiBhIHByb3BlciBzdWJzZXQgYW5kIHBlcm1hbmVudGx5XG5cdFx0Ly8gc2tpcCByZS1taWdyYXRpb24pLiBUaGUgY2FsbGJhY2sgdGFrZXMgbm8gcGFyYW1ldGVyIHNvIGBlbnRyaWVzYCBoZXJlIGlzXG5cdFx0Ly8gdGhlIGZ1bGwgbWlncmF0ZWQgc2V0LCBub3QgdGhlIChhYnNlbnQpIGN1cnJlbnQgY2F0YWxvZy5cblx0XHRhd2FpdCB0aGlzLl9lbnF1ZXVlUGVlckNoYXRDYXRhbG9nV3JpdGUoc2Vzc2lvbiwgKCkgPT4gWy4uLmVudHJpZXNdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlcyBhIHNldCBvZiBwZWVyIGNoYXRzIGZyb20gYW4gZW51bWVyYXRlZCBjYXRhbG9nLiBMb2FkcyBlYWNoXG5cdCAqIGNoYXQncyBoaXN0b3J5IGluIHBhcmFsbGVsIChhZnRlciByZS1hdHRhY2hpbmcgaXRzIGJhY2tpbmcpIGJ1dCByZXN0b3Jlc1xuXHQgKiB0aGVtIGluIGNhdGFsb2cgb3JkZXIsIHNvIHRoZSBjYXRhbG9nIG5ldmVyIHJlb3JkZXJzIGJ5IHdoaWNoIGNoYXQnc1xuXHQgKiBoaXN0b3J5L3RpdGxlIGhhcHBlbmVkIHRvIHJlc29sdmUgZmlyc3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXN0b3JlUGVlckNoYXRzRnJvbUNhdGFsb2coYWdlbnQ6IElBZ2VudCwgc2Vzc2lvbjogVVJJLCBlbnRyaWVzOiByZWFkb25seSBJUGVyc2lzdGVkUGVlckNoYXRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gYXdhaXQgUHJvbWlzZS5hbGwoZW50cmllcy5tYXAoYXN5bmMgKGVudHJ5KSA9PiB7XG5cdFx0XHRsZXQgY2hhdFVyaTogVVJJO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2hhdFVyaSA9IFVSSS5wYXJzZShlbnRyeS51cmkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gU2tpcHBpbmcgbWFsZm9ybWVkIHBlcnNpc3RlZCBwZWVyIGNoYXQgVVJJICcke2VudHJ5LnVyaX0nOiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZS1hdHRhY2ggdGhlIGFnZW50J3MgaW4tbWVtb3J5IGJhY2tpbmcgZm9yIHRoZSBjaGF0IEJFRk9SRVxuXHRcdFx0Ly8gcmVhZGluZyBpdHMgaGlzdG9yeSwgc28gYGdldFNlc3Npb25NZXNzYWdlc2AgY2FuIHJlc29sdmUgdGhlXG5cdFx0XHQvLyBjaGF0LiBCZXN0LWVmZm9ydDogYSBjb3JydXB0L3Vua25vd24gYmxvYiBtdXN0IG5vdCBhYm9ydFxuXHRcdFx0Ly8gdGhlIHJlc3RvcmUgXHUyMDE0IHRoZSBjaGF0IGlzIHRoZW4gc3VyZmFjZWQgd2l0aCBoaXN0b3J5IGJ1dCBubyBsaXZlXG5cdFx0XHQvLyBiYWNraW5nLlxuXHRcdFx0aWYgKGFnZW50Lm1hdGVyaWFsaXplQ2hhdCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGFnZW50Lm1hdGVyaWFsaXplQ2hhdChjaGF0VXJpLCBlbnRyeS5wcm92aWRlckRhdGEpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBtYXRlcmlhbGl6ZSBwZWVyIGNoYXQgJHtlbnRyeS51cml9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxldCB0dXJuczogcmVhZG9ubHkgVHVybltdID0gW107XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0dXJucyA9IGF3YWl0IHRoaXMuX2dldENoYXRNZXNzYWdlcyhhZ2VudCwgY2hhdFVyaSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gbG9hZCBoaXN0b3J5IGZvciBwZWVyIGNoYXQgJHtjaGF0VXJpLnRvU3RyaW5nKCl9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBbdGl0bGUsIGRyYWZ0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fcmVhZFBlcnNpc3RlZENoYXRUaXRsZShzZXNzaW9uLCBjaGF0VXJpKSxcblx0XHRcdFx0dGhpcy5fZ2V0Q2hhdERyYWZ0KHNlc3Npb24sIGNoYXRVcmkpLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBtZXJnZWRUdXJucyA9IGF3YWl0IHRoaXMuX2ludGVybGVhdmVMb2NhbFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVyaS50b1N0cmluZygpLCB0dXJucyk7XG5cdFx0XHRyZXR1cm4geyBjaGF0VXJpLCB0aXRsZSwgdHVybnM6IG1lcmdlZFR1cm5zLCBkcmFmdCwgcHJvdmlkZXJEYXRhOiBlbnRyeS5wcm92aWRlckRhdGEsIG9yaWdpbjogZW50cnkub3JpZ2luIH07XG5cdFx0fSkpO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiByZXN0b3JlZCkge1xuXHRcdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBjaGF0VXJpLCB0aXRsZSwgdHVybnMsIGRyYWZ0LCBwcm92aWRlckRhdGEsIG9yaWdpbiB9ID0gaXRlbTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZXN0b3JlQ2hhdChzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXRVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0dHVybnM6IFsuLi50dXJuc10sXG5cdFx0XHRcdGRyYWZ0LFxuXHRcdFx0XHQuLi4ocHJvdmlkZXJEYXRhICE9PSB1bmRlZmluZWQgPyB7IHByb3ZpZGVyRGF0YSB9IDoge30pLFxuXHRcdFx0XHQuLi4ob3JpZ2luICE9PSB1bmRlZmluZWQgPyB7IG9yaWdpbiB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXBlcnNpc3RzIGEgcGVlciBjaGF0J3Mgb3BhcXVlIGBwcm92aWRlckRhdGFgIGJsb2Igd2hlbiB0aGUgYWdlbnRcblx0ICogcmVwb3J0cyBpdCBjaGFuZ2VkIChlLmcuIHBlci1jaGF0IG1vZGVsIHN3aXRjaCBvciBmb3JrIHJlbWFwKS5cblx0ICovXG5cdHByaXZhdGUgX29uQ2hhdERhdGFDaGFuZ2VkKGU6IElBZ2VudENoYXREYXRhQ2hhbmdlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHBhcnNlRGVmYXVsdENoYXRVcmkoZS5jaGF0KTtcblx0XHRpZiAoc2Vzc2lvblN0ciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIG9uRGlkQ2hhbmdlQ2hhdERhdGEgZm9yIG1hbGZvcm1lZCBjaGF0IFVSSTogJHtlLmNoYXQudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLl9wZXJzaXN0UGVlckNoYXQoVVJJLnBhcnNlKHNlc3Npb25TdHIpLCBlLmNoYXQsIGUucHJvdmlkZXJEYXRhKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXRlcm1pbmlzdGljIG1lbWJlcnNoaXAgc2VxdWVuY2VyIGZvciBhZ2VudC1zcGF3bmVkIGNoYXRzLFxuXHQgKiBkcml2ZW4gb2ZmIHtAbGluayBJQWdlbnQub25EaWRTZXNzaW9uUHJvZ3Jlc3N9OiBhIGBzdWJhZ2VudF9zdGFydGVkYCBhZGRzXG5cdCAqIHRoZSBzdWJhZ2VudCBjaGF0IHRvIHRoZSBjYXRhbG9nIHZpYSB0aGUgc2FtZSBzcGF3bi1jaGFubmVsIGhhbmRsZXJcblx0ICogKHtAbGluayBfb25DaGF0U3Bhd25lZH0pIHVzZWQgYnkge0BsaW5rIElBZ2VudC5vbkRpZFNwYXduQ2hhdH0uXG5cdCAqIEEgY29tcGxldGVkIHN1YmFnZW50IGNoYXQgc3RheXMgbGl2ZSBhbmQgc3Vic2NyaWJhYmxlLCBzbyBjb21wbGV0aW9uIGlzXG5cdCAqIG5vdCBzZXF1ZW5jZWQgaGVyZTsgc3ViYWdlbnQgY2hhdHMgYXJlIHJlbW92ZWQgb25seSBvbiBzZXNzaW9uIHRlYXJkb3duLlxuXHQgKiBSZWdpc3RlcmVkIGJlZm9yZSB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30gc28gdGhlIHN1YmFnZW50IGNoYXQgZXhpc3RzXG5cdCAqIGJlZm9yZSBpdHMgdHVybiBzdGFydHM7IGFkZENoYXQgaXMgaWRlbXBvdGVudCBzbyBvdmVybGFwcGluZyB3aXRoIHRoZVxuXHQgKiBhZ2VudCdzIG93biBzcGF3biBicmlkZ2UgaXMgc2FmZS5cblx0ICovXG5cdHByaXZhdGUgX3NlcXVlbmNlU3Bhd25lZENoYXQoc2lnbmFsOiBBZ2VudFNpZ25hbCk6IHZvaWQge1xuXHRcdGNvbnN0IHNwYXduID0gU3ViYWdlbnRDaGF0U2lnbmFsLnRvU3Bhd25FdmVudChzaWduYWwpO1xuXHRcdGlmIChzcGF3bikge1xuXHRcdFx0dGhpcy5fb25DaGF0U3Bhd25lZChzcGF3bik7XG5cdFx0fVxuXHR9XG5cblx0LyoqIE1hcmtzIGEgc3ViYWdlbnQgY2hhdCBhcyBwZW5kaW5nIG9uY2UgaXRzIGNvbmZpcm1lZCB0b29sIGNhbGwgcmVhY2hlcyAob3IgaXMgYWJvdXQgdG8gcmVhY2gpIGBSdW5uaW5nYC4gKi9cblx0cHJpdmF0ZSBfdHJhY2tQZW5kaW5nU3ViYWdlbnRDaGF0RnJvbUVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY2hhbm5lbCwgYWN0aW9uIH0gPSBlbnZlbG9wZTtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQgfHwgYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEgfHwgYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpIHtcblx0XHRcdGNvbnN0IGtleSA9IGAke2NoYW5uZWx9OiR7YWN0aW9uLnRvb2xDYWxsSWR9YDtcblx0XHRcdC8vIFByb3ZpZGVycyBzdGFtcCBgdG9vbEtpbmRgL2BzdWJhZ2VudENoYXRVcmlgIG9uIHdoaWNoZXZlciBhY3Rpb25cblx0XHRcdC8vIGZpcnN0IHJldmVhbHMgaXQgKENvcGlsb3QgYXQgU3RhcnQsIENsYXVkZSBhdCBSZWFkeSkgXHUyMDE0IGxhdGVyXG5cdFx0XHQvLyBhY3Rpb25zIGZvciB0aGUgc2FtZSB0b29sIGNhbGwgZG9uJ3QgcmVwZWF0IGl0LCBzbyBmYWxsIGJhY2sgdG9cblx0XHRcdC8vIHdoYXQgd2UgYWxyZWFkeSByZWNvcmRlZCBmb3IgdGhpcyB0b29sIGNhbGwuXG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXRVcmkgPSByZWFkVG9vbENhbGxNZXRhKGFjdGlvbikuc3ViYWdlbnRDaGF0VXJpID8/IHRoaXMuX3BlbmRpbmdTdWJhZ2VudFRvb2xDYWxscy5nZXQoa2V5KTtcblx0XHRcdGlmIChzdWJhZ2VudENoYXRVcmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkgJiYgYWN0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0XHQvLyBHb2VzIHN0cmFpZ2h0IHRvIFJ1bm5pbmcgXHUyMDE0IGFybSB0aGUgYm91bmRlZCB3YWl0IG5vdy5cblx0XHRcdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50VG9vbENhbGxzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR0aGlzLl9hcm1QZW5kaW5nU3ViYWdlbnRDaGF0KHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFN0aWxsIHN0cmVhbWluZyBvciBhd2FpdGluZyBjb25maXJtYXRpb24uIFJlbWVtYmVyIHRoZSBVUkkgc28gYVxuXHRcdFx0Ly8gbGF0ZXIgQ2hhdFRvb2xDYWxsQ29uZmlybWVkIGNhbiBhcm0gdGhlIHdhaXQgb25jZSAoaWYgZXZlcilcblx0XHRcdC8vIGNvbmZpcm1lZCwgd2l0aG91dCB0aW1pbmcgb3V0IHdoaWxlIHRoZSB1c2VyIGlzIHN0aWxsIGRlY2lkaW5nLlxuXHRcdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50VG9vbENhbGxzLnNldChrZXksIHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQpIHtcblx0XHRcdGNvbnN0IGtleSA9IGAke2NoYW5uZWx9OiR7YWN0aW9uLnRvb2xDYWxsSWR9YDtcblx0XHRcdGNvbnN0IHN1YmFnZW50Q2hhdFVyaSA9IHRoaXMuX3BlbmRpbmdTdWJhZ2VudFRvb2xDYWxscy5nZXQoa2V5KTtcblx0XHRcdGlmIChzdWJhZ2VudENoYXRVcmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRUb29sQ2FsbHMuZGVsZXRlKGtleSk7XG5cdFx0XHRpZiAoYWN0aW9uLmFwcHJvdmVkKSB7XG5cdFx0XHRcdHRoaXMuX2FybVBlbmRpbmdTdWJhZ2VudENoYXQoc3ViYWdlbnRDaGF0VXJpKTtcblx0XHRcdH1cblx0XHRcdC8vIERlbmllZDogdGhlIHN1YmFnZW50IHdpbGwgbmV2ZXIgc3Bhd247IG5vdGhpbmcgdG8gcmVzb2x2ZSBzaW5jZVxuXHRcdFx0Ly8gdGhlIHdhaXQgd2FzIG5ldmVyIGFybWVkIHdoaWxlIGF3YWl0aW5nIGNvbmZpcm1hdGlvbi5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSB7XG5cdFx0XHQvLyBEZWZlbnNpdmUgY2xlYW51cDogYSB0b29sIGNhbGwgY2FuIGNvbXBsZXRlIHdpdGhvdXQgZXZlciBiZWluZ1xuXHRcdFx0Ly8gY29uZmlybWVkIChlLmcuIGNhbmNlbGxlZCBieSBvdGhlciBtZWFucykgd2hpbGUgc3RpbGwgdHJhY2tlZC5cblx0XHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFRvb2xDYWxscy5kZWxldGUoYCR7Y2hhbm5lbH06JHthY3Rpb24udG9vbENhbGxJZH1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcm1QZW5kaW5nU3ViYWdlbnRDaGF0KHN1YmFnZW50Q2hhdFVyaTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdTdWJhZ2VudENoYXRzLmhhcyhzdWJhZ2VudENoYXRVcmkpIHx8IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChzdWJhZ2VudENoYXRVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudENoYXRzLnNldChzdWJhZ2VudENoYXRVcmksIGRlZmVycmVkKTtcblx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRDaGF0VGltZW91dHMuc2V0KHN1YmFnZW50Q2hhdFVyaSwgZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50Q2hhdHMuZGVsZXRlKHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRDaGF0VGltZW91dHMuZGVsZXRlQW5kRGlzcG9zZShzdWJhZ2VudENoYXRVcmkpO1xuXHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHR9LCBTVUJBR0VOVF9DSEFUX1BFTkRJTkdfVElNRU9VVF9NUykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVBlbmRpbmdTdWJhZ2VudENoYXQocmVzb3VyY2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGRlZmVycmVkID0gdGhpcy5fcGVuZGluZ1N1YmFnZW50Q2hhdHMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoIWRlZmVycmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudENoYXRzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50Q2hhdFRpbWVvdXRzLmRlbGV0ZUFuZERpc3Bvc2UocmVzb3VyY2UpO1xuXHRcdGRlZmVycmVkLmNvbXBsZXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUm91dGVzIGFuIGFnZW50LXNwYXduZWQgY2hhdCAoZS5nLiBhIHN1Yi1hZ2VudCBkZWxlZ2F0ZWQgYnkgYSB0b29sXG5cdCAqIGNhbGwpIHN0cmFpZ2h0IGludG8gdGhlIGNoYXQgY2F0YWxvZyB2aWEge0BsaW5rIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIuYWRkQ2hhdH0sXG5cdCAqIHNvIGhhcm5lc3Mtc3Bhd25lZCBjaGF0cyBhbmQgdXNlci1kcml2ZW4gY2hhdHMgc2hhcmUgT05FIG1lbWJlcnNoaXAgcGF0aC5cblx0ICogVGhlIHtAbGluayBJQWdlbnRTcGF3bkNoYXRFdmVudC5wYXJlbnR9IHNwYXduIGVkZ2UgaXMgcmVjb3JkZWQgYXNcblx0ICogdGhlIGNoYXQncyB7QGxpbmsgQ2hhdE9yaWdpbktpbmQuVG9vbH0gb3JpZ2luLiBTcGF3bmVkIGNoYXRzIGFyZVxuXHQgKiBub3Qgd3JpdHRlbiB0byB0aGUgb3JjaGVzdHJhdG9yJ3MgcGVyc2lzdGVkIHBlZXItY2hhdCBjYXRhbG9nIFx1MjAxNCB0aGV5IGFyZVxuXHQgKiB0cmFuc2llbnQgY2hpbGRyZW4gcmUtZGVyaXZlZCBmcm9tIHRoZSBwYXJlbnQncyBldmVudCBsb2cgb24gcmVzdG9yZS5cblx0ICovXG5cdHByaXZhdGUgX29uQ2hhdFNwYXduZWQoZTogSUFnZW50U3Bhd25DaGF0RXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuYWRkQ2hhdChlLnNlc3Npb24udG9TdHJpbmcoKSwgZS5jaGF0LnRvU3RyaW5nKCksIHtcblx0XHRcdC4uLihlLnRpdGxlICE9PSB1bmRlZmluZWQgPyB7IHRpdGxlOiBlLnRpdGxlIH0gOiB7fSksXG5cdFx0XHQuLi4oZS5wYXJlbnQgPyB7XG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBlLnBhcmVudC5jaGF0LnRvU3RyaW5nKCksIHRvb2xDYWxsSWQ6IGUucGFyZW50LnRvb2xDYWxsSWQgfSxcblx0XHRcdFx0Ly8gU3ViYWdlbnQgd29ya2VyIGNoYXRzIGFyZSBvYnNlcnZhYmxlIGJ1dCBub3QgZGlyZWN0bHkgc3RlZXJhYmxlOlxuXHRcdFx0XHQvLyB0aGUgdXNlciB3YXRjaGVzIHRoZW0gYW5kIHN0ZWVycyB0aGUgbGVhZCBjaGF0LiBNYXJrIHJlYWQtb25seSBzb1xuXHRcdFx0XHQvLyB0aGUgVUkgaGlkZXMgdGhlIGNvbXBvc2VyIGFuZCBzaG93cyBhIGxvY2sgKHRoZSBhZ2VudC10ZWFtIHBhdHRlcm4pLlxuXHRcdFx0XHRpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSxcblx0XHRcdH0gOiB7fSksXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVzb2x2ZVBlbmRpbmdTdWJhZ2VudENoYXQoZS5jaGF0LnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIHRoZSBvcmNoZXN0cmF0b3IncyBwZXJzaXN0ZWQgcGVlci1jaGF0IGNhdGFsb2cgZm9yIGEgc2Vzc2lvbi5cblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIGhhcyBubyBjYXRhbG9nIHlldCAoYSBsZWdhY3kgc2Vzc2lvblxuXHQgKiBwcmVkYXRpbmcgb3JjaGVzdHJhdG9yLW93bmVkIHBlcnNpc3RlbmNlLCBvciBhIGNvcnJ1cHQgYmxvYik7IHRoZSBjYWxsZXJcblx0ICogdGhlbiBwZXJmb3JtcyBhIG9uZS10aW1lIG1pZ3JhdGlvbiBmcm9tIHRoZSBhZ2VudCdzIGxlZ2FjeSBgKi5jaGF0c2Bcblx0ICogZW51bWVyYXRpb24gKHNlZSB7QGxpbmsgX3Jlc3RvcmVQZWVyQ2hhdHN9IC8ge0BsaW5rIF9taWdyYXRlTGVnYWN5UGVlckNoYXRzfSkuXG5cdCAqIEFuIGVtcHR5IGFycmF5IG1lYW5zIHRoZSBzZXNzaW9uIGlzIGtub3duIHRvIGhhdmUgbm8gcGVlciBjaGF0cywgc29cblx0ICogbWlncmF0aW9uIGlzIHNraXBwZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFkUGVyc2lzdGVkUGVlckNoYXRDYXRhbG9nKHNlc3Npb246IFVSSSk6IFByb21pc2U8SVBlcnNpc3RlZFBlZXJDaGF0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlPy4oc2Vzc2lvbik7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByYXcgPSBhd2FpdCByZWYub2JqZWN0LmdldE1ldGFkYXRhKFBFRVJfQ0hBVFNfTUVUQURBVEFfS0VZKTtcblx0XHRcdGlmIChyYXcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBJZ25vcmluZyBtYWxmb3JtZWQgcGVlci1jaGF0IGNhdGFsb2cgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfWApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnNlZFxuXHRcdFx0XHQuZmlsdGVyKChlbnRyeSk6IGVudHJ5IGlzIElQZXJzaXN0ZWRQZWVyQ2hhdCA9PiB0eXBlb2YgZW50cnk/LnVyaSA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdC5tYXAoZW50cnkgPT4gKHtcblx0XHRcdFx0XHR1cmk6IGVudHJ5LnVyaSxcblx0XHRcdFx0XHQuLi4odHlwZW9mIGVudHJ5LnByb3ZpZGVyRGF0YSA9PT0gJ3N0cmluZycgPyB7IHByb3ZpZGVyRGF0YTogZW50cnkucHJvdmlkZXJEYXRhIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKGVudHJ5Lm9yaWdpbiAhPT0gdW5kZWZpbmVkID8geyBvcmlnaW46IGVudHJ5Lm9yaWdpbiB9IDoge30pLFxuXHRcdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byByZWFkIHBlZXItY2hhdCBjYXRhbG9nIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmtzIGEgcGVlciBjaGF0J3MgYmFja2luZyBTREsgc2Vzc2lvbiAoaW4gdGhhdCBzZXNzaW9uJ3Mgb3duIERCKSBzb1xuXHQgKiB7QGxpbmsgbGlzdFNlc3Npb25zfSBmaWx0ZXJzIGl0IG91dCBvZiB0aGUgdG9wLWxldmVsIHNlc3Npb24gbGlzdC4gVGhlXG5cdCAqIG1hcmtlciBpcyBwZXJzaXN0ZWQsIHNvIGl0IHN1cnZpdmVzIGEgaG9zdCByZXN0YXJ0LiBCZXN0LWVmZm9ydDogYSBmYWlsdXJlXG5cdCAqIG9ubHkgbWVhbnMgdGhlIGJhY2tpbmcgc2Vzc2lvbiBtYXkgdHJhbnNpZW50bHkgcmVhcHBlYXIgaW4gdGhlIGxpc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXJrUGVlckNoYXRCYWNraW5nKGJhY2tpbmdTZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IHZvaWQge1xuXHRcdGxldCByZWY7XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoYmFja2luZ1Nlc3Npb24pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gb3BlbiBiYWNraW5nIHNlc3Npb24gZGF0YWJhc2UgdG8gbWFyayBwZWVyLWNoYXQgYmFja2luZyBmb3IgJHtiYWNraW5nU2Vzc2lvbi50b1N0cmluZygpfTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZWYub2JqZWN0LnNldE1ldGFkYXRhKFBFRVJfQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWSwgY2hhdC50b1N0cmluZygpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gbWFyayBwZWVyLWNoYXQgYmFja2luZyBmb3IgJHtiYWNraW5nU2Vzc2lvbi50b1N0cmluZygpfTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnNlcnRzIG9yIHVwZGF0ZXMgYSBzaW5nbGUgcGVlciBjaGF0IGluIHRoZSBvcmNoZXN0cmF0b3IncyBwZXJzaXN0ZWRcblx0ICogY2F0YWxvZywgcmVjb3JkaW5nIGl0cyBvcGFxdWUgYHByb3ZpZGVyRGF0YWAgdmVyYmF0aW0gKG9yIGNsZWFyaW5nIGl0IHdoZW5cblx0ICogYHVuZGVmaW5lZGApLiBXaGVuIGBvcmlnaW5gIGlzIHN1cHBsaWVkIGl0IGlzIHN0b3JlZCBhcyB0aGUgY2hhdCdzXG5cdCAqIHByb3ZlbmFuY2U7IHdoZW4gb21pdHRlZCAoZS5nLiBhIHByb3ZpZGVyLWRyaXZlbiBgcHJvdmlkZXJEYXRhYCByZWZyZXNoIHZpYVxuXHQgKiB7QGxpbmsgX29uQ2hhdERhdGFDaGFuZ2VkfSkgYW55IHByZXZpb3VzbHkgcGVyc2lzdGVkIG9yaWdpbiBpcyBwcmVzZXJ2ZWQgc29cblx0ICogYSBkYXRhIHJlZnJlc2ggbmV2ZXIgZHJvcHMgYSBzaWRlIGNoYXQncyBzb3VyY2UgYm91bmRhcnkuIFNlcmlhbGl6ZWQgcGVyXG5cdCAqIHNlc3Npb24gdmlhIHtAbGluayBfZW5xdWV1ZVBlZXJDaGF0Q2F0YWxvZ1dyaXRlfS5cblx0ICovXG5cdHByaXZhdGUgX3BlcnNpc3RQZWVyQ2hhdChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgcHJvdmlkZXJEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9yaWdpbj86IENoYXRPcmlnaW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0VXJpID0gY2hhdC50b1N0cmluZygpO1xuXHRcdHJldHVybiB0aGlzLl9lbnF1ZXVlUGVlckNoYXRDYXRhbG9nV3JpdGUoc2Vzc2lvbiwgZW50cmllcyA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGVudHJpZXMuZmluZChlbnRyeSA9PiBlbnRyeS51cmkgPT09IGNoYXRVcmkpO1xuXHRcdFx0Y29uc3QgZWZmZWN0aXZlT3JpZ2luID0gb3JpZ2luID8/IGV4aXN0aW5nPy5vcmlnaW47XG5cdFx0XHRjb25zdCBuZXh0ID0gZW50cmllcy5maWx0ZXIoZW50cnkgPT4gZW50cnkudXJpICE9PSBjaGF0VXJpKTtcblx0XHRcdG5leHQucHVzaCh7XG5cdFx0XHRcdHVyaTogY2hhdFVyaSxcblx0XHRcdFx0Li4uKHByb3ZpZGVyRGF0YSAhPT0gdW5kZWZpbmVkID8geyBwcm92aWRlckRhdGEgfSA6IHt9KSxcblx0XHRcdFx0Li4uKGVmZmVjdGl2ZU9yaWdpbiAhPT0gdW5kZWZpbmVkID8geyBvcmlnaW46IGVmZmVjdGl2ZU9yaWdpbiB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gbmV4dDtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGEgcGVlciBjaGF0IGZyb20gdGhlIG9yY2hlc3RyYXRvcidzIHBlcnNpc3RlZCBjYXRhbG9nLiBTZXJpYWxpemVkXG5cdCAqIHBlciBzZXNzaW9uIHZpYSB7QGxpbmsgX2VucXVldWVQZWVyQ2hhdENhdGFsb2dXcml0ZX0uXG5cdCAqL1xuXHRwcml2YXRlIF9yZW1vdmVQZXJzaXN0ZWRQZWVyQ2hhdChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2VucXVldWVQZWVyQ2hhdENhdGFsb2dXcml0ZShzZXNzaW9uLCBlbnRyaWVzID0+IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnVyaSAhPT0gY2hhdFVyaSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoYWlucyBhIHJlYWQtbW9kaWZ5LXdyaXRlIG9mIGEgc2Vzc2lvbidzIHBlcnNpc3RlZCBwZWVyLWNoYXQgY2F0YWxvZ1xuXHQgKiBiZWhpbmQgYW55IGluLWZsaWdodCB3cml0ZSBmb3IgdGhlIHNhbWUgc2Vzc2lvbiwgc28gY29uY3VycmVudFxuXHQgKiBjcmVhdGUvZGlzcG9zZS9kYXRhLWNoYW5nZSB1cGRhdGVzIGNhbid0IGNsb2JiZXIgZWFjaCBvdGhlci5cblx0ICovXG5cdHByaXZhdGUgX2VucXVldWVQZWVyQ2hhdENhdGFsb2dXcml0ZShzZXNzaW9uOiBVUkksIG11dGF0ZTogKGVudHJpZXM6IElQZXJzaXN0ZWRQZWVyQ2hhdFtdKSA9PiBJUGVyc2lzdGVkUGVlckNoYXRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3BlZXJDaGF0Q2F0YWxvZ1dyaXRlcy5nZXQoa2V5KSA/PyBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBuZXh0ID0gcHJldmlvdXNcblx0XHRcdC5jYXRjaCgoKSA9PiB7IC8qIGEgZmFpbGVkIHByaW9yIHdyaXRlIG11c3Qgbm90IGJsb2NrIGxhdGVyIG9uZXMgKi8gfSlcblx0XHRcdC50aGVuKCgpID0+IHRoaXMuX2FwcGx5UGVlckNoYXRDYXRhbG9nV3JpdGUoc2Vzc2lvbiwgbXV0YXRlKSk7XG5cdFx0dGhpcy5fcGVlckNoYXRDYXRhbG9nV3JpdGVzLnNldChrZXksIG5leHQuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcGVlckNoYXRDYXRhbG9nV3JpdGVzLmdldChrZXkpID09PSBuZXh0KSB7XG5cdFx0XHRcdHRoaXMuX3BlZXJDaGF0Q2F0YWxvZ1dyaXRlcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIG5leHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseVBlZXJDaGF0Q2F0YWxvZ1dyaXRlKHNlc3Npb246IFVSSSwgbXV0YXRlOiAoZW50cmllczogSVBlcnNpc3RlZFBlZXJDaGF0W10pID0+IElQZXJzaXN0ZWRQZWVyQ2hhdFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZT8uKHNlc3Npb24pO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRsZXQgY3VycmVudDogSVBlcnNpc3RlZFBlZXJDaGF0W10gPSBbXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoUEVFUl9DSEFUU19NRVRBREFUQV9LRVkpO1xuXHRcdFx0XHRpZiAocmF3ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHRcdFx0Y3VycmVudCA9IHBhcnNlZFxuXHRcdFx0XHRcdFx0XHQuZmlsdGVyKChlbnRyeSk6IGVudHJ5IGlzIElQZXJzaXN0ZWRQZWVyQ2hhdCA9PiB0eXBlb2YgZW50cnk/LnVyaSA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdFx0XHRcdC5tYXAoZW50cnkgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHR1cmk6IGVudHJ5LnVyaSxcblx0XHRcdFx0XHRcdFx0XHQuLi4odHlwZW9mIGVudHJ5LnByb3ZpZGVyRGF0YSA9PT0gJ3N0cmluZycgPyB7IHByb3ZpZGVyRGF0YTogZW50cnkucHJvdmlkZXJEYXRhIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRcdFx0Li4uKGVudHJ5Lm9yaWdpbiAhPT0gdW5kZWZpbmVkID8geyBvcmlnaW46IGVudHJ5Lm9yaWdpbiB9IDoge30pLFxuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBSZXBsYWNpbmcgbWFsZm9ybWVkIHBlZXItY2hhdCBjYXRhbG9nIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBtdXRhdGUoY3VycmVudCk7XG5cdFx0XHRhd2FpdCByZWYub2JqZWN0LnNldE1ldGFkYXRhKFBFRVJfQ0hBVFNfTUVUQURBVEFfS0VZLCBKU09OLnN0cmluZ2lmeSh1cGRhdGVkKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBwZXJzaXN0IHBlZXItY2hhdCBjYXRhbG9nIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmVhZHMgYSBjaGF0J3MgcGVyc2lzdGVkIGN1c3RvbSB0aXRsZSAoZGVmYXVsdCBvciBwZWVyIGNoYXQpLCBpZiBhbnkuICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRQZXJzaXN0ZWRDaGF0VGl0bGUoc2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2U/LihzZXNzaW9uKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAoYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShgY3VzdG9tQ2hhdFRpdGxlOiR7Y2hhdFVyaS50b1N0cmluZygpfWApKSA/PyB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldENoYXREcmFmdChzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSk6IFByb21pc2U8TWVzc2FnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmVmLm9iamVjdC5nZXRDaGF0RHJhZnQoY2hhdFVyaSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2Vzc2lvbk1ldGFkYXRhRm9yUmVzdG9yZShhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0aWYgKGFnZW50LmdldFNlc3Npb25NZXRhZGF0YSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3dpdGhXb3JrdHJlZVByb2plY3Qoc2Vzc2lvbiwgYXdhaXQgYWdlbnQuZ2V0U2Vzc2lvbk1ldGFkYXRhKHNlc3Npb24pKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl93aXRoV29ya3RyZWVQcm9qZWN0KHNlc3Npb24sIGF3YWl0IHRoaXMuX2dldFNlc3Npb25NZXRhZGF0YUZyb21DYXRhbG9nKGFnZW50LCBzZXNzaW9uKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGZhbGxiYWNrRXJyKSB7XG5cdFx0XHRcdFx0aWYgKGZhbGxiYWNrRXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKGZhbGxiYWNrRXJyLmNvZGUsIGBGYWlsZWQgdG8gZ2V0IHNlc3Npb24gbWV0YWRhdGEgZm9yICR7c2Vzc2lvblN0cn06ICR7bWVzc2FnZX07ICR7ZmFsbGJhY2tFcnIubWVzc2FnZX1gLCBmYWxsYmFja0Vyci5kYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgZmFsbGJhY2tFcnI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPbGRlciBwcm92aWRlcnMgb25seSBleHBvc2UgY2F0YWxvZyBlbnVtZXJhdGlvbi4gS2VlcCB0aGUgZmFsbGJhY2sgc29cblx0XHQvLyByZXN0b3JlIHJlbWFpbnMgY29tcGF0aWJsZSwgYnV0IHByb3ZpZGVycyB3aXRoIGEgZGlyZWN0IGxvb2t1cCBhdm9pZFxuXHRcdC8vIGJsb2NraW5nIHNlc3Npb24gb3BlbiBvbiBhIGZ1bGwgY2F0YWxvZyByZWZyZXNoLlxuXHRcdHJldHVybiB0aGlzLl93aXRoV29ya3RyZWVQcm9qZWN0KHNlc3Npb24sIGF3YWl0IHRoaXMuX2dldFNlc3Npb25NZXRhZGF0YUZyb21DYXRhbG9nKGFnZW50LCBzZXNzaW9uKSk7XG5cdH1cblxuXHQvKipcblx0ICogTWVyZ2VzIHRoZSByZXBvc2l0b3J5IHByb2plY3QgZm9yIGEgd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbiBvbnRvIGl0c1xuXHQgKiByZXN0b3JlZCBtZXRhZGF0YSBzbyB0aGUgc2Vzc2lvbiBncm91cHMgdW5kZXIgdGhlIHJlcG9zaXRvcnkgKG5vdCB0aGVcblx0ICogYDxyZXBvPi53b3JrdHJlZXMvPG5hbWU+YCBkaXJlY3RvcnkpIGluIHRoZSBzZXNzaW9ucyBVSS4gTm8tb3AgZm9yIGZvbGRlclxuXHQgKiBzZXNzaW9ucyBhbmQgZm9yIGB1bmRlZmluZWRgIG1ldGFkYXRhLiBIb3N0LW93bmVkIHNvIGFnZW50cyBzdGF5IHVuYXdhcmUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93aXRoV29ya3RyZWVQcm9qZWN0KHNlc3Npb246IFVSSSwgbWV0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIW1ldGEgfHwgIXRoaXMuX3dvcmt0cmVlKSB7XG5cdFx0XHRyZXR1cm4gbWV0YTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvamVjdCA9IGF3YWl0IHRoaXMuX3dvcmt0cmVlLnJlc29sdmVXb3JrdHJlZVByb2plY3Qoc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHByb2plY3QgPyB7IC4uLm1ldGEsIHByb2plY3QgfSA6IG1ldGE7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRTZXNzaW9uTWV0YWRhdGFGcm9tQ2F0YWxvZyhhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0bGV0IGFsbFNlc3Npb25zO1xuXHRcdHRyeSB7XG5cdFx0XHRhbGxTZXNzaW9ucyA9IGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SLCBgRmFpbGVkIHRvIGxpc3Qgc2Vzc2lvbnMgZm9yICR7c2Vzc2lvblN0cn06ICR7bWVzc2FnZX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbFNlc3Npb25zLmZpbmQocyA9PiBzLnNlc3Npb24udG9TdHJpbmcoKSA9PT0gc2Vzc2lvblN0cik7XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZVJlYWQodXJpOiBVUkkpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4ge1xuXHRcdGNvbnN0IGVkaXRBdHRyaWJ1dGlvblJlcXVlc3QgPSBwYXJzZUVkaXRBdHRyaWJ1dGlvblJlc291cmNlKHVyaSk7XG5cdFx0aWYgKGVkaXRBdHRyaWJ1dGlvblJlcXVlc3Q/LmtpbmQgPT09ICdwcmVwYXJlJykge1xuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVFZGl0QXR0cmlidXRpb25GbHVzaChlZGl0QXR0cmlidXRpb25SZXF1ZXN0LnBhcmFtcyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeShwcmVwYXJlZCA/PyBudWxsKSxcblx0XHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKGVkaXRBdHRyaWJ1dGlvblJlcXVlc3Q/LmtpbmQgPT09ICdjb21taXQnKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoKGVkaXRBdHRyaWJ1dGlvblJlcXVlc3QucGFyYW1zKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHJlc3VsdCksXG5cdFx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChlZGl0QXR0cmlidXRpb25SZXF1ZXN0Py5raW5kID09PSAnY2FuY2VsJykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jYW5jZWxFZGl0QXR0cmlidXRpb25GbHVzaChlZGl0QXR0cmlidXRpb25SZXF1ZXN0LnBhcmFtcyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeShyZXN1bHQpLFxuXHRcdFx0XHRlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBzZXNzaW9uLWRiOiBVUklzIHRoYXQgcmVmZXJlbmNlIGZpbGUtZWRpdCBjb250ZW50IHN0b3JlZFxuXHRcdC8vIGluIGEgcGVyLXNlc3Npb24gU1FMaXRlIGRhdGFiYXNlLlxuXHRcdGNvbnN0IGRiRmllbGRzID0gcGFyc2VTZXNzaW9uRGJVcmkodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChkYkZpZWxkcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZldGNoU2Vzc2lvbkRiQ29udGVudChkYkZpZWxkcyk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGdpdC1ibG9iOiBVUklzIHRoYXQgcmVmZXJlbmNlIGZpbGUgY29udGVudCBhdCBhIHNwZWNpZmljXG5cdFx0Ly8gZ2l0IGNvbW1pdCAodGhlIG1lcmdlLWJhc2UgdXNlZCBhcyBkaWZmIGJhc2VsaW5lKS4gVGhlIFVSSVxuXHRcdC8vIGVuY29kZXMgdGhlIHNlc3Npb24gaXQgYmVsb25ncyB0byBzbyB3ZSBjYW4gZmluZCB0aGUgcmlnaHRcblx0XHQvLyB3b3JraW5nIGRpcmVjdG9yeSB0byBydW4gYGdpdCBzaG93YCBmcm9tLlxuXHRcdGNvbnN0IGJsb2JGaWVsZHMgPSBwYXJzZUdpdEJsb2JVcmkodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChibG9iRmllbGRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmV0Y2hHaXRCbG9iQ29udGVudChibG9iRmllbGRzKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkYXRhOiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdFx0Y29udGVudFR5cGU6ICd0ZXh0L3BsYWluJyxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlIDogbmV3IEVycm9yKFN0cmluZyhlKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgQ29udGVudCBub3QgZm91bmQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKU09OX1JQQ19JTlRFUk5BTF9FUlJPUiwgYEZhaWxlZCB0byByZWFkIGNvbnRlbnQ6ICR7dXJpLnRvU3RyaW5nKCl9OiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcmVwYXJlRWRpdEF0dHJpYnV0aW9uRmx1c2gocGFyYW1zOiBJUHJlcGFyZUVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJUHJlcGFyZWRFZGl0QXR0cmlidXRpb25GbHVzaCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0QXR0cmlidXRpb25TZXJ2aWNlPy5wcmVwYXJlRmx1c2gocGFyYW1zKSA/PyBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoKHBhcmFtczogSUNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZT8uY29tbWl0Rmx1c2gocGFyYW1zKSA/PyBQcm9taXNlLnJlc29sdmUoeyBvdXRjb21lOiAnbWlzc2luZycsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9KTtcblx0fVxuXG5cdGNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoKHBhcmFtczogSUNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZT8uY2FuY2VsRmx1c2gocGFyYW1zKSA/PyBQcm9taXNlLnJlc29sdmUoeyBvdXRjb21lOiAnbWlzc2luZycsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9KTtcblx0fVxuXG5cdGFzeW5jIHJlc291cmNlV3JpdGUocGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVdyaXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShwYXJhbXMudXJpKSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2VzRGlybmFtZShmaWxlVXJpKSk7XG5cdFx0XHRpZiAoIXBhcmVudC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgUGFyZW50IGRpcmVjdG9yeSBub3QgZm91bmQ6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBQYXJlbnQgZGlyZWN0b3J5IG5vdCBmb3VuZDogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGxldCBjb250ZW50OiBWU0J1ZmZlcjtcblx0XHRpZiAocGFyYW1zLmVuY29kaW5nID09PSBDb250ZW50RW5jb2RpbmcuQmFzZTY0KSB7XG5cdFx0XHRjb250ZW50ID0gZGVjb2RlQmFzZTY0KHBhcmFtcy5kYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGVudCA9IFZTQnVmZmVyLmZyb21TdHJpbmcocGFyYW1zLmRhdGEpO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlID0gcGFyYW1zLm1vZGUgPz8gUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGU7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBwYXJhbXMucG9zaXRpb24gPz8gMDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb3VyY2VXcml0ZVF1ZXVlLnF1ZXVlRm9yKGZpbGVVcmksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHBhcmFtcy5pZk1hdGNoICE9PSB1bmRlZmluZWQgfHwgbW9kZSAhPT0gUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGUgfHwgcG9zaXRpb24gIT09IDApIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNvdXJjZVdyaXRlV2l0aE1vZGUoZmlsZVVyaSwgY29udGVudCwgbW9kZSwgcG9zaXRpb24sIHBhcmFtcyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFyYW1zLmNyZWF0ZU9ubHkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jcmVhdGVGaWxlRXhjbHVzaXZlKGZpbGVVcmksIGNvbnRlbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShmaWxlVXJpLCBjb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpO1xuXHRcdFx0aWYgKHBhcmFtcy5jcmVhdGVPbmx5ICYmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSB8fCByZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBGaWxlIGFscmVhZHkgZXhpc3RzOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gcGFyYW1zLmlmTWF0Y2ggIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gYGlmTWF0Y2ggcHJlY29uZGl0aW9uIGZhaWxlZCBmb3I6ICR7ZmlsZVVyaS50b1N0cmluZygpfWBcblx0XHRcdFx0XHQ6IGBGaWxlIGNoYW5nZWQgd2hpbGUgd3JpdGluZzogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YDtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Db25mbGljdCwgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBGaWxlIGFscmVhZHkgZXhpc3RzOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLlBlcm1pc3Npb25EZW5pZWQsIGBQZXJtaXNzaW9uIGRlbmllZDogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgRmFpbGVkIHRvIHdyaXRlIGZpbGU6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUZpbGVFeGNsdXNpdmUoZmlsZVVyaTogVVJJLCBjb250ZW50OiBWU0J1ZmZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChmaWxlVXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGaWxlKGZpbGVVcmksIGNvbnRlbnQsIHsgb3ZlcndyaXRlOiBmYWxzZSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgaGFuZGxlOiBGaWxlSGFuZGxlO1xuXHRcdHRyeSB7XG5cdFx0XHRoYW5kbGUgPSBhd2FpdCBvcGVuKGZpbGVVcmkuZnNQYXRoLCAnd3gnKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzRXJyb3JXaXRoQ29kZShlcnJvciwgJ0VFWElTVCcpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cywgYEZpbGUgYWxyZWFkeSBleGlzdHM6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0bGV0IGZhaWx1cmU6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGhhbmRsZS53cml0ZUZpbGUoY29udGVudC5idWZmZXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRmYWlsdXJlID0gZXJyb3I7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBoYW5kbGUuY2xvc2UoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZmFpbHVyZSA9IGZhaWx1cmUgPyBuZXcgQWdncmVnYXRlRXJyb3IoW2ZhaWx1cmUsIGVycm9yXSkgOiBlcnJvcjtcblx0XHR9XG5cdFx0aWYgKGZhaWx1cmUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHVubGluayhmaWxlVXJpLmZzUGF0aCk7XG5cdFx0XHR9IGNhdGNoIChjbGVhbnVwRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEFnZ3JlZ2F0ZUVycm9yKFtmYWlsdXJlLCBjbGVhbnVwRXJyb3JdLCBgRmFpbGVkIHRvIGNyZWF0ZSBhbmQgY2xlYW4gdXAgZmlsZTogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBmYWlsdXJlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTbG93LXBhdGggZm9yIHtAbGluayByZXNvdXJjZVdyaXRlfSB3aGVuIHRoZSBjYWxsZXIgcmVxdWVzdGVkIGFcblx0ICogbm9uLWRlZmF1bHQge0BsaW5rIFJlc291cmNlV3JpdGVNb2RlfSwgc3VwcGxpZWQgYSBgcG9zaXRpb25gLCBvclxuXHQgKiBwcm92aWRlZCBhbiBgaWZNYXRjaGAgZXRhZyBwcmVjb25kaXRpb24uIFJlYWRzIHRoZSBjdXJyZW50IGZpbGVcblx0ICogY29udGVudHMgKHdoZW4gbmVlZGVkKSBhbmQgcHJvZHVjZXMgYSBzaW5nbGUgYHdyaXRlRmlsZWAgY2FsbCB0aGF0XG5cdCAqIHJlYWxpc2VzIHRoZSByZXF1ZXN0ZWQgc3BsaWNlLiBBIG1pc3NpbmcgZmlsZSBpcyB0cmVhdGVkIGFzXG5cdCAqIGVtcHR5IGZvciBgYXBwZW5kYCBhbmQgYGluc2VydGAgKHNvIHRoZSBvcGVyYXRpb24gYmVoYXZlcyBsaWtlIGFcblx0ICogY3JlYXRlKTsgZm9yIGB0cnVuY2F0ZWAgaXQgZmFsbHMgdGhyb3VnaCB0byBhIG5vcm1hbCB3cml0ZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlV3JpdGVXaXRoTW9kZShcblx0XHRmaWxlVXJpOiBVUkksXG5cdFx0ZGF0YTogVlNCdWZmZXIsXG5cdFx0bW9kZTogUmVzb3VyY2VXcml0ZU1vZGUsXG5cdFx0cG9zaXRpb246IG51bWJlcixcblx0XHRwYXJhbXM6IFJlc291cmNlV3JpdGVQYXJhbXMsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBleGlzdGluZzogVlNCdWZmZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGN1cnJlbnRFdGFnOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGN1cnJlbnRNdGltZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZmlsZVVyaSk7XG5cdFx0XHRleGlzdGluZyA9IGZpbGUudmFsdWU7XG5cdFx0XHRjdXJyZW50RXRhZyA9IGZpbGUuZXRhZztcblx0XHRcdGN1cnJlbnRNdGltZSA9IGZpbGUubXRpbWU7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwYXJhbXMuY3JlYXRlT25seSAmJiBleGlzdGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBGaWxlIGFscmVhZHkgZXhpc3RzOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRpZiAocGFyYW1zLmlmTWF0Y2ggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gTWlzc2luZyBmaWxlIHdpdGggYW4gaWZNYXRjaCBpcyBhbHdheXMgYSBjb25mbGljdCAodGhlIGNhbGxlclxuXHRcdFx0Ly8gYmVsaWV2ZWQgdGhleSBoYWQgdGhlIGV0YWcgZm9yIGFuIGV4aXN0aW5nIGZpbGUpLlxuXHRcdFx0aWYgKGV4aXN0aW5nID09PSB1bmRlZmluZWQgfHwgY3VycmVudEV0YWcgIT09IHBhcmFtcy5pZk1hdGNoKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuQ29uZmxpY3QsIGBpZk1hdGNoIHByZWNvbmRpdGlvbiBmYWlsZWQgZm9yOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBiYXNlID0gZXhpc3RpbmcgPz8gVlNCdWZmZXIuYWxsb2MoMCk7XG5cdFx0bGV0IG5leHQ6IFZTQnVmZmVyO1xuXHRcdHN3aXRjaCAobW9kZSkge1xuXHRcdFx0Y2FzZSBSZXNvdXJjZVdyaXRlTW9kZS5BcHBlbmQ6IHtcblx0XHRcdFx0Y29uc3QgZW9mID0gYmFzZS5ieXRlTGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBzcGxpdEF0ID0gTWF0aC5tYXgoMCwgZW9mIC0gcG9zaXRpb24pO1xuXHRcdFx0XHRuZXh0ID0gVlNCdWZmZXIuY29uY2F0KFtiYXNlLnNsaWNlKDAsIHNwbGl0QXQpLCBkYXRhLCBiYXNlLnNsaWNlKHNwbGl0QXQsIGVvZildKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFJlc291cmNlV3JpdGVNb2RlLkluc2VydDoge1xuXHRcdFx0XHRjb25zdCBzcGxpdEF0ID0gTWF0aC5taW4ocG9zaXRpb24sIGJhc2UuYnl0ZUxlbmd0aCk7XG5cdFx0XHRcdG5leHQgPSBWU0J1ZmZlci5jb25jYXQoW2Jhc2Uuc2xpY2UoMCwgc3BsaXRBdCksIGRhdGEsIGJhc2Uuc2xpY2Uoc3BsaXRBdCwgYmFzZS5ieXRlTGVuZ3RoKV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGU6XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGNvbnN0IHNwbGl0QXQgPSBNYXRoLm1pbihwb3NpdGlvbiwgYmFzZS5ieXRlTGVuZ3RoKTtcblx0XHRcdFx0bmV4dCA9IFZTQnVmZmVyLmNvbmNhdChbYmFzZS5zbGljZSgwLCBzcGxpdEF0KSwgZGF0YV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBhcmFtcy5jcmVhdGVPbmx5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jcmVhdGVGaWxlRXhjbHVzaXZlKGZpbGVVcmksIG5leHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZmlsZVVyaSwgbmV4dCwgeyBldGFnOiBjdXJyZW50RXRhZywgbXRpbWU6IGN1cnJlbnRNdGltZSB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZUNvcHkocGFyYW1zOiBSZXNvdXJjZUNvcHlQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlQ29weVJlc3VsdD4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZShwYXJhbXMuc291cmNlKTtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IFVSSS5wYXJzZShwYXJhbXMuZGVzdGluYXRpb24pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jb3B5KHNvdXJjZSwgZGVzdGluYXRpb24sICFwYXJhbXMuZmFpbElmRXhpc3RzKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZSBhcyBFcnJvcik7XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBEZXN0aW5hdGlvbiBhbHJlYWR5IGV4aXN0czogJHtkZXN0aW5hdGlvbi50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke3NvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgYFNvdXJjZSBub3QgZm91bmQ6ICR7c291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VEZWxldGUocGFyYW1zOiBSZXNvdXJjZURlbGV0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VEZWxldGVSZXN1bHQ+IHtcblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLnBhcnNlKHBhcmFtcy51cmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwoZmlsZVVyaSwgeyByZWN1cnNpdmU6IHBhcmFtcy5yZWN1cnNpdmUgfSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBSZXNvdXJjZSBub3QgZm91bmQ6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc291cmNlTW92ZShwYXJhbXM6IFJlc291cmNlTW92ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNb3ZlUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLnBhcnNlKHBhcmFtcy5zb3VyY2UpO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gVVJJLnBhcnNlKHBhcmFtcy5kZXN0aW5hdGlvbik7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUoc291cmNlLCBkZXN0aW5hdGlvbiwgIXBhcmFtcy5mYWlsSWZFeGlzdHMpO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKTtcblx0XHRcdGlmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cywgYERlc3RpbmF0aW9uIGFscmVhZHkgZXhpc3RzOiAke2Rlc3RpbmF0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7c291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgU291cmNlIG5vdCBmb3VuZDogJHtzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZVJlc29sdmUocGFyYW1zOiBSZXNvdXJjZVJlc29sdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHVyaSA9IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShwYXJhbXMudXJpKSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5zdGF0KHVyaSk7XG5cdFx0XHRsZXQgdHlwZTogUmVzb3VyY2VUeXBlO1xuXHRcdFx0aWYgKHN0YXQuaXNTeW1ib2xpY0xpbmsgJiYgcGFyYW1zLmZvbGxvd1N5bWxpbmtzID09PSBmYWxzZSkge1xuXHRcdFx0XHQvLyBgSUZpbGVTZXJ2aWNlLnN0YXRgIGFsd2F5cyBmb2xsb3dzIHN5bWxpbmtzIGluIGl0c1xuXHRcdFx0XHQvLyB0eXBlLWNsYXNzaWZpY2F0aW9uIGxvZ2ljLCBzbyBgZm9sbG93U3ltbGlua3M6IGZhbHNlYFxuXHRcdFx0XHQvLyBvbmx5IGNoYW5nZXMgaG93IHdlIHJlcG9ydCB0aGUgcmVzdWx0IFx1MjAxNCB3ZSBzdXJmYWNlIHRoZVxuXHRcdFx0XHQvLyBsaW5rIGl0c2VsZiByYXRoZXIgdGhhbiB0aGUgdGFyZ2V0LlxuXHRcdFx0XHR0eXBlID0gUmVzb3VyY2VUeXBlLlN5bWxpbms7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0dHlwZSA9IFJlc291cmNlVHlwZS5EaXJlY3Rvcnk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0eXBlID0gUmVzb3VyY2VUeXBlLkZpbGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQ6IFJlc291cmNlUmVzb2x2ZVJlc3VsdCA9IHtcblx0XHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0dHlwZSxcblx0XHRcdFx0Li4uKHN0YXQuc2l6ZSAhPT0gdW5kZWZpbmVkID8geyBzaXplOiBzdGF0LnNpemUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHN0YXQubXRpbWUgIT09IHVuZGVmaW5lZCA/IHsgbXRpbWU6IG5ldyBEYXRlKHN0YXQubXRpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHN0YXQuY3RpbWUgIT09IHVuZGVmaW5lZCA/IHsgY3RpbWU6IG5ldyBEYXRlKHN0YXQuY3RpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHN0YXQuZXRhZyA/IHsgZXRhZzogc3RhdC5ldGFnIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgUmVzb3VyY2Ugbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc291cmNlTWtkaXIocGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0PiB7XG5cdFx0Y29uc3QgdXJpID0gdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHBhcmFtcy51cmkpIDogVVJJLnJldml2ZShwYXJhbXMudXJpKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gYElGaWxlU2VydmljZS5jcmVhdGVGb2xkZXJgIGlzIGlkZW1wb3RlbnQgZm9yIGFuIGV4aXN0aW5nXG5cdFx0XHQvLyBkaXJlY3RvcnkgYW5kIGNyZWF0ZXMgcGFyZW50cyBhcyBuZWVkZWQsIG1hdGNoaW5nIHRoZVxuXHRcdFx0Ly8gYG1rZGlyIC1wYCBzZW1hbnRpY3MgcmVxdWlyZWQgYnkgdGhlIHNwZWMuXG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQodXJpKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBQYXRoIGV4aXN0cyBhbmQgaXMgbm90IGEgZGlyZWN0b3J5OiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVyaSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yKSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgRmFpbGVkIHRvIGNyZWF0ZSBkaXJlY3Rvcnk6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY3JlYXRlUmVzb3VyY2VXYXRjaChwYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPENyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQ+IHtcblx0XHRjb25zdCByb290ID0gdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHBhcmFtcy51cmkpIDogVVJJLnJldml2ZShwYXJhbXMudXJpKTtcblx0XHQvLyBWZXJpZnkgdGhlIFVSSSBleGlzdHMgYmVmb3JlIHdlIG1pbnQgYSBjaGFubmVsOyBzcGVjIHJlcXVpcmVzXG5cdFx0Ly8gYE5vdEZvdW5kYCB3aGVuIHRoZSBVUkkgaXMgbWlzc2luZyByYXRoZXIgdGhhbiBzaWxlbnRseSBwcm9kdWNpbmdcblx0XHQvLyBhIHdhdGNoZXIgdGhhdCB3aWxsIG5ldmVyIGZpcmUuIFRoZSB3YXRjaGVyIGl0c2VsZiBpcyBub3Rcblx0XHQvLyBhdHRhY2hlZCBoZXJlIFx1MjAxNCBlbmNvZGluZyB0aGUgZGVzY3JpcHRvciBpbnRvIHRoZSBjaGFubmVsIFVSSVxuXHRcdC8vIGxldHMgYHN1YnNjcmliZWAgbWF0ZXJpYWxpc2UgdGhlIHVuZGVybHlpbmcgSUZpbGVTZXJ2aWNlXG5cdFx0Ly8gd2F0Y2hlciBsYXppbHkgb24gdGhlIGZpcnN0IHN1YnNjcmliZXIsIGFuZCB0ZWFyIGl0IGRvd24gYWdhaW5cblx0XHQvLyBhZnRlciB0aGUgbGFzdCB1bnN1YnNjcmliZSAod2l0aCBhIGdyYWNlIHdpbmRvdykuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQocm9vdCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke3Jvb3QudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBSZXNvdXJjZSBub3QgZm91bmQ6ICR7cm9vdC50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5uZWwgPSBidWlsZFJlc291cmNlV2F0Y2hDaGFubmVsVXJpKHtcblx0XHRcdHJvb3Q6IHJvb3QudG9TdHJpbmcoKSxcblx0XHRcdHJlY3Vyc2l2ZTogcGFyYW1zLnJlY3Vyc2l2ZSA9PT0gdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVzOiBwYXJhbXMuZXhjbHVkZXMsXG5cdFx0XHRpbmNsdWRlczogcGFyYW1zLmluY2x1ZGVzLFxuXHRcdH0pO1xuXHRcdHJldHVybiB7IGNoYW5uZWwgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RpZmllcyB0aGUgYWdlbnQgc2VydmljZSB0aGF0IGEgY2xpZW50IHN1YnNjcmliZWQgdG8gYSByZXNvdXJjZVxuXHQgKiB3YXRjaCBjaGFubmVsLiBPbiB0aGUgZmlyc3Qgc3Vic2NyaWJlciB0aGUgdW5kZXJseWluZ1xuXHQgKiB7QGxpbmsgSUZpbGVTZXJ2aWNlfSB3YXRjaGVyIGlzIGF0dGFjaGVkOyBzdWJzZXF1ZW50IHN1YnNjcmliZXJzXG5cdCAqIGJ1bXAgdGhlIHJlZmNvdW50IGFuZCBjYW5jZWwgYW55IHBlbmRpbmcgZ3JhY2UgZGlzcG9zZS4gUmV0dXJuc1xuXHQgKiB0aGUgZGVjb2RlZCBkZXNjcmlwdG9yIGZvciB1c2UgYXMgdGhlIHN1YnNjcmliZSBzbmFwc2hvdCwgb3Jcblx0ICogYHVuZGVmaW5lZGAgd2hlbiBgY2hhbm5lbGAgaXMgbm90IGEgcmVjb2duaXNhYmxlXG5cdCAqIGBhaHAtcmVzb3VyY2Utd2F0Y2g6YCBVUkkuXG5cdCAqL1xuXHRvblJlc291cmNlV2F0Y2hTdWJzY3JpYmVkKGNoYW5uZWw6IHN0cmluZyk6IFJlc291cmNlV2F0Y2hTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHBhcnNlUmVzb3VyY2VXYXRjaENoYW5uZWxVcmkoY2hhbm5lbCk7XG5cdFx0aWYgKCFkZXNjcmlwdG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Jlc291cmNlV2F0Y2hlcy5nZXQoY2hhbm5lbCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5zdWJzY3JpYmVycysrO1xuXHRcdFx0aWYgKGV4aXN0aW5nLnBlbmRpbmdHYykge1xuXHRcdFx0XHRleGlzdGluZy5wZW5kaW5nR2MuY2xlYXIoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleGlzdGluZy5kZXNjcmlwdG9yO1xuXHRcdH1cblx0XHQvLyBGaXJzdCBzdWJzY3JpYmVyIFx1MjAxNCBtYXRlcmlhbGlzZSB0aGUgSUZpbGVTZXJ2aWNlIHdhdGNoZXIuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBVUkkucGFyc2UoZGVzY3JpcHRvci5yb290KTtcblx0XHRcdGNvbnN0IHdhdGNoT3B0aW9ucyA9IHtcblx0XHRcdFx0cmVjdXJzaXZlOiBkZXNjcmlwdG9yLnJlY3Vyc2l2ZSxcblx0XHRcdFx0ZXhjbHVkZXM6IGRlc2NyaXB0b3IuZXhjbHVkZXM/Lml0ZW1zID8/IFtdLFxuXHRcdFx0XHRpbmNsdWRlczogZGVzY3JpcHRvci5pbmNsdWRlcz8uaXRlbXMsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGRlc2NyaXB0b3IucmVjdXJzaXZlKSB7XG5cdFx0XHRcdC8vIENvcnJlbGF0ZWQgd2F0Y2hlcnMgYXJlIG5vbi1yZWN1cnNpdmUgb25seSwgc28gcmVnaXN0ZXJcblx0XHRcdFx0Ly8gYW4gdW5jb3JyZWxhdGVkIHJlY3Vyc2l2ZSB3YXRjaCBhbmQgZmlsdGVyIHRoZSBnbG9iYWxcblx0XHRcdFx0Ly8gc3RyZWFtIGJ5IGRlc2NlbmRhbnRzIG9mIHRoZSB3YXRjaGVkIHJvb3QuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9maWxlU2VydmljZS53YXRjaChyb290LCB3YXRjaE9wdGlvbnMpKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2ZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlcmVkID0gY29sbGVjdENoYW5nZXNVbmRlclJvb3QoZXZlbnQsIHJvb3QpO1xuXHRcdFx0XHRcdGlmIChmaWx0ZXJlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaXNwYXRjaFJlc291cmNlV2F0Y2hDaGFuZ2VzKGNoYW5uZWwsIGZpbHRlcmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHdhdGNoZXIgPSB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVXYXRjaGVyKHJvb3QsIHsgLi4ud2F0Y2hPcHRpb25zLCByZWN1cnNpdmU6IGZhbHNlIH0pO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2hlcik7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaGVyLm9uRGlkQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwYXRjaFJlc291cmNlV2F0Y2hDaGFuZ2VzKGNoYW5uZWwsIGNvbGxlY3RDaGFuZ2VzKGV2ZW50KSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBzdGFydCBJRmlsZVNlcnZpY2Ugd2F0Y2hlciBmb3IgJHtjaGFubmVsfTogJHtlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSl9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNvdXJjZVdhdGNoZXMuc2V0KGNoYW5uZWwsIHtcblx0XHRcdGNoYW5uZWwsXG5cdFx0XHRkZXNjcmlwdG9yLFxuXHRcdFx0c3Vic2NyaWJlcnM6IDEsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHBlbmRpbmdHYzogZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSxcblx0XHR9KTtcblx0XHRyZXR1cm4gZGVzY3JpcHRvcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb3VudGVycGFydCB0byB7QGxpbmsgb25SZXNvdXJjZVdhdGNoU3Vic2NyaWJlZH0uIERlY3JlbWVudHMgdGhlXG5cdCAqIHN1YnNjcmliZXIgcmVmY291bnQgZm9yIGEgd2F0Y2ggY2hhbm5lbDsgd2hlbiBpdCByZWFjaGVzIHplcm8gdGhlXG5cdCAqIHdhdGNoZXIgaXMgaGVsZCBmb3Ige0BsaW5rIFJFU09VUkNFX1dBVENIX0dSQUNFX01TfSBiZWZvcmUgYmVpbmdcblx0ICogZGlzcG9zZWQsIGdpdmluZyBhIHRyYW5zaWVudCBkaXNjb25uZWN0IHRpbWUgdG8gcmVzdWJzY3JpYmUuXG5cdCAqL1xuXHRvblJlc291cmNlV2F0Y2hVbnN1YnNjcmliZWQoY2hhbm5lbDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9yZXNvdXJjZVdhdGNoZXMuZ2V0KGNoYW5uZWwpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0ZW50cnkuc3Vic2NyaWJlcnMgPSBNYXRoLm1heCgwLCBlbnRyeS5zdWJzY3JpYmVycyAtIDEpO1xuXHRcdGlmIChlbnRyeS5zdWJzY3JpYmVycyA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRlbnRyeS5wZW5kaW5nR2MudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcmVzb3VyY2VXYXRjaGVzLmdldChjaGFubmVsKTtcblx0XHRcdGlmICghY3VycmVudCB8fCBjdXJyZW50LnN1YnNjcmliZXJzID4gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZXNvdXJjZVdhdGNoZXMuZGVsZXRlQW5kRGlzcG9zZShjaGFubmVsKTtcblx0XHR9LCBSRVNPVVJDRV9XQVRDSF9HUkFDRV9NUyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwYXRjaFJlc291cmNlV2F0Y2hDaGFuZ2VzKGNoYW5uZWw6IHN0cmluZywgcmF3OiByZWFkb25seSBJRmlsZUNoYW5nZVtdKTogdm9pZCB7XG5cdFx0aWYgKHJhdy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXMgPSByYXcubWFwKGMgPT4gKHtcblx0XHRcdHVyaTogYy5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0dHlwZTogYy50eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5BRERFRCA/IFJlc291cmNlQ2hhbmdlVHlwZS5BZGRlZFxuXHRcdFx0XHQ6IGMudHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuREVMRVRFRCA/IFJlc291cmNlQ2hhbmdlVHlwZS5EZWxldGVkXG5cdFx0XHRcdFx0OiBSZXNvdXJjZUNoYW5nZVR5cGUuVXBkYXRlZCxcblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5uZWwsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUmVzb3VyY2VXYXRjaENoYW5nZWQsXG5cdFx0XHRjaGFuZ2VzOiB7IGl0ZW1zIH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ0FnZW50U2VydmljZTogc2h1dHRpbmcgZG93biBhbGwgcHJvdmlkZXJzLi4uJyk7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcHJvdmlkZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHByb3ZpZGVyLnNodXRkb3duKCkpO1xuXHRcdH1cblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0Ly8gRHJhaW4gYW55IHdvcmt0cmVlcyB0aGlzIHByb2Nlc3MgY3JlYXRlZCBzbyBub25lIGxlYWsgb24gc2h1dGRvd24uXG5cdFx0YXdhaXQgdGhpcy5fd29ya3RyZWU/LnJlbW92ZUFsbENyZWF0ZWRXb3JrdHJlZXMoKTtcblx0XHR0aGlzLl9zZXNzaW9uVG9Qcm92aWRlci5jbGVhcigpO1xuXHRcdHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdC5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdpcmUgdGhlIG5ldHdvcmsgZGlhZ25vc3RpY3Mgc2VydmljZSBiYWNraW5nIHtAbGluayBnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvfVxuXHQgKiBhbmQge0BsaW5rIGRpYWdub3N0aWNzRmV0Y2h9LiBBIHNldHRlciByYXRoZXIgdGhhbiBhIGNvbnN0cnVjdG9yIGFyZ3VtZW50XG5cdCAqIGJlY2F1c2UgdGhlIHNlcnZpY2UgZGVwZW5kcyBvbiB0aGUgYWdlbnQtaG9zdCBwcm94eSByZXNvbHZlciwgd2hpY2ggdGhlXG5cdCAqIHJlbW90ZSBzZXJ2ZXIgY29uc3RydWN0cyBsYXppbHkgXHUyMDE0IGFmdGVyIHRoaXMgc2VydmljZS5cblx0ICovXG5cdHNldE5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2Uoc2VydmljZTogSU5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9uZXR3b3JrRGlhZ25vc3RpY3MgPSBzZXJ2aWNlO1xuXHR9XG5cblx0c2V0RWRpdEF0dHJpYnV0aW9uU2VydmljZShzZXJ2aWNlOiBJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZSA9IHNlcnZpY2U7XG5cdFx0c2VydmljZS5zZXRFbmFibGVkKHRoaXMuX3N0YXRlTWFuYWdlci5yb290U3RhdGUuY29uZmlnPy52YWx1ZXNbQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXldICE9PSBmYWxzZSk7XG5cdH1cblxuXHRhc3luYyBnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvKCk6IFByb21pc2U8SUFnZW50SG9zdE5ldHdvcmtEaWFnbm9zdGljc0luZm8+IHtcblx0XHRpZiAoIXRoaXMuX25ldHdvcmtEaWFnbm9zdGljcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOZXR3b3JrIGRpYWdub3N0aWNzIHVuYXZhaWxhYmxlOiBzZXJ2aWNlIG5vdCB3aXJlZCcpO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlcnMgPSBbLi4udGhpcy5fcHJvdmlkZXJzLnZhbHVlcygpXTtcblx0XHRjb25zdCBjb250cmlidXRpb25zID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvdmlkZXJzLm1hcChhc3luYyBwcm92aWRlciA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgcHJvdmlkZXIuZ2V0TmV0d29ya0RpYWdub3N0aWNzRW5kcG9pbnRzPy4oKSA/PyBbXTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHJlc29sdmUgbmV0d29yayBkaWFnbm9zdGljcyBlbmRwb2ludHMgZm9yICR7cHJvdmlkZXIuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb3ZpZGVycy5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHByb3ZpZGVyLmdldE5ldHdvcmtEaWFnbm9zdGljc0FjY291bnQ/LigpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVzb2x2ZSBuZXR3b3JrIGRpYWdub3N0aWNzIGFjY291bnQgZm9yICR7cHJvdmlkZXIuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZW5kcG9pbnRzOiBJQWdlbnRIb3N0TmV0d29ya0VuZHBvaW50W10gPSBbXTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBlbmRwb2ludCBvZiBjb250cmlidXRpb25zLmZsYXQoKSkge1xuXHRcdFx0bGV0IGtleTogc3RyaW5nO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0a2V5ID0gbmV3IFVSTChlbmRwb2ludC51cmwpLnRvU3RyaW5nKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0a2V5ID0gZW5kcG9pbnQudXJsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKGtleSk7XG5cdFx0XHRcdGVuZHBvaW50cy5wdXNoKGVuZHBvaW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX25ldHdvcmtEaWFnbm9zdGljcy5nZXRJbmZvKGVuZHBvaW50cywgYWNjb3VudHMuZmluZChhY2NvdW50ID0+ICEhYWNjb3VudCkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MoKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3NbXT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IFsuLi50aGlzLl9wcm92aWRlcnMudmFsdWVzKCldLmZpbHRlcihwcm92aWRlciA9PiBwcm92aWRlci5nZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyk7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb3ZpZGVycy5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXI6IHByb3ZpZGVyLmlkLCBzbmFwc2hvdDogYXdhaXQgcHJvdmlkZXIuZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MhKCkgfTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB7IHByb3ZpZGVyOiBwcm92aWRlci5pZCwgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGRpYWdub3N0aWNzRmV0Y2godXJsOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQ+IHtcblx0XHRpZiAoIXRoaXMuX25ldHdvcmtEaWFnbm9zdGljcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOZXR3b3JrIGRpYWdub3N0aWNzIHVuYXZhaWxhYmxlOiBzZXJ2aWNlIG5vdCB3aXJlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmV0d29ya0RpYWdub3N0aWNzLmZldGNoKHVybCk7XG5cdH1cblxuXHQvLyAtLS0tIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hTZXNzaW9uRGJDb250ZW50KGZpZWxkczogSVNlc3Npb25EYlVyaUZpZWxkcyk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZShmaWVsZHMuc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uVXJpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlZi5vYmplY3QucmVhZEZpbGVFZGl0Q29udGVudChmaWVsZHMudG9vbENhbGxJZCwgZmllbGRzLmZpbGVQYXRoKTtcblx0XHRcdGlmICghY29udGVudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgRmlsZSBlZGl0IG5vdCBmb3VuZDogdG9vbENhbGxJZD0ke2ZpZWxkcy50b29sQ2FsbElkfSwgZmlsZVBhdGg9JHtmaWVsZHMuZmlsZVBhdGh9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBieXRlcyA9IGZpZWxkcy5wYXJ0ID09PSAnYmVmb3JlJyA/IGNvbnRlbnQuYmVmb3JlQ29udGVudCA6IGNvbnRlbnQuYWZ0ZXJDb250ZW50O1xuXHRcdFx0aWYgKCFieXRlcykge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgTm8gJHtmaWVsZHMucGFydH0gY29udGVudCBmb3I6IHRvb2xDYWxsSWQ9JHtmaWVsZHMudG9vbENhbGxJZH0sIGZpbGVQYXRoPSR7ZmllbGRzLmZpbGVQYXRofWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGF0YTogbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ5dGVzKSxcblx0XHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0XHRjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaEdpdEJsb2JDb250ZW50KGZpZWxkczogSUdpdEJsb2JVcmlGaWVsZHMpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4ge1xuXHRcdGlmICghdGhpcy5fZ2l0U2VydmljZSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgYGdpdCBzZXJ2aWNlIHVuYXZhaWxhYmxlIGZvcjogJHtmaWVsZHMucmVwb1JlbGF0aXZlUGF0aH1gKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZmllbGRzLnNlc3Npb25VcmkpPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBTZXNzaW9uIGhhcyBubyB3b3JraW5nIGRpcmVjdG9yeSBmb3IgZ2l0LWJsb2IgVVJJOiAke2ZpZWxkcy5zZXNzaW9uVXJpfWApO1xuXHRcdH1cblx0XHRjb25zdCBibG9iID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5zaG93QmxvYihVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yeSksIGZpZWxkcy5zaGEsIGZpZWxkcy5yZXBvUmVsYXRpdmVQYXRoKTtcblx0XHRpZiAoIWJsb2IpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBnaXQgYmxvYiBub3QgZm91bmQ6ICR7ZmllbGRzLnNoYX06JHtmaWVsZHMucmVwb1JlbGF0aXZlUGF0aH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IGJsb2IudG9TdHJpbmcoKSxcblx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlcyBhIHN1YmFnZW50IHNlc3Npb24gZnJvbSBpdHMgcGFyZW50IHNlc3Npb24ncyBldmVudCBoaXN0b3J5LlxuXHQgKiBMb2FkcyB0aGUgcGFyZW50J3MgcmF3IG1lc3NhZ2VzLCBmaWx0ZXJzIGZvciBldmVudHMgYmVsb25naW5nIHRvXG5cdCAqIHRoZSBzdWJhZ2VudCAoYnkgYHBhcmVudFRvb2xDYWxsSWRgKSwgYW5kIGJ1aWxkcyB0aGUgY2hpbGQgc2Vzc2lvbidzXG5cdCAqIHR1cm5zIGZyb20gdGhvc2UgZXZlbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzdG9yZVN1YmFnZW50U2Vzc2lvbihzdWJhZ2VudFVyaTogc3RyaW5nLCBwYXJlbnRTZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbkZsaWdodCA9IHRoaXMuX3Jlc3RvcmVTdWJhZ2VudEluRmxpZ2h0LmdldChzdWJhZ2VudFVyaSk7XG5cdFx0aWYgKGluRmxpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gaW5GbGlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdG9yZSA9IHRoaXMuX2RvUmVzdG9yZVN1YmFnZW50U2Vzc2lvbihzdWJhZ2VudFVyaSwgcGFyZW50U2Vzc2lvbik7XG5cdFx0dGhpcy5fcmVzdG9yZVN1YmFnZW50SW5GbGlnaHQuc2V0KHN1YmFnZW50VXJpLCByZXN0b3JlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmVzdG9yZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuX3Jlc3RvcmVTdWJhZ2VudEluRmxpZ2h0LmdldChzdWJhZ2VudFVyaSkgPT09IHJlc3RvcmUpIHtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZVN1YmFnZW50SW5GbGlnaHQuZGVsZXRlKHN1YmFnZW50VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1Jlc3RvcmVTdWJhZ2VudFNlc3Npb24oc3ViYWdlbnRVcmk6IHN0cmluZywgcGFyZW50U2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRW5zdXJlIHRoZSBwYXJlbnQgc2Vzc2lvbiBpcyBsb2FkZWQgZmlyc3Rcblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uS2V5ID0gcGFyZW50U2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdGlmICghdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJlbnRTZXNzaW9uS2V5KSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JlU2Vzc2lvbihwYXJlbnRTZXNzaW9uKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIENhbm5vdCByZXN0b3JlIHBhcmVudCBzZXNzaW9uIGZvciBzdWJhZ2VudDogJHtwYXJlbnRTZXNzaW9uS2V5fWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHBhcmVudFNlc3Npb25LZXkpO1xuXHRcdGlmICghcGFyZW50U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZWFyY2ggY29tcGxldGVkIHR1cm5zIGFuZCBhY3RpdmUgdHVybiBmb3IgdGhlIHN1YmFnZW50IGNvbnRlbnQgbWV0YWRhdGFcblx0XHRjb25zdCBhbGxUdXJucyA9IFsuLi5wYXJlbnRTdGF0ZS50dXJuc107XG5cdFx0aWYgKHBhcmVudFN0YXRlLmFjdGl2ZVR1cm4pIHtcblx0XHRcdGFsbFR1cm5zLnB1c2gocGFyZW50U3RhdGUuYWN0aXZlVHVybiBhcyBUdXJuKTtcblx0XHR9XG5cblx0XHRsZXQgc3ViYWdlbnRDb250ZW50OiBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgdHVybiBvZiBhbGxUdXJucykge1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGMgPSBwYXJ0LnRvb2xDYWxsO1xuXHRcdFx0XHRcdC8vIENoZWNrIGJvdGggY29tcGxldGVkIGFuZCBydW5uaW5nIHRvb2wgY2FsbHMgXHUyMDE0IHJ1bm5pbmdcblx0XHRcdFx0XHQvLyB0b29sIGNhbGxzIHJlY2VpdmUgc3ViYWdlbnQgY29udGVudCB2aWEgQ29udGVudENoYW5nZWRcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWRcblx0XHRcdFx0XHRcdD8gdGMuY29udGVudFxuXHRcdFx0XHRcdFx0OiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nID8gdGMuY29udGVudCA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYyBvZiBjb250ZW50KSB7XG5cdFx0XHRcdFx0XHRcdGlmIChjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCAmJiBjLnJlc291cmNlID09PSBzdWJhZ2VudFVyaSkge1xuXHRcdFx0XHRcdFx0XHRcdHN1YmFnZW50Q29udGVudCA9IGM7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzdWJhZ2VudENvbnRlbnQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTG9hZCB0aGUgc3ViYWdlbnQncyB0dXJucyBmcm9tIHRoZSBhZ2VudCAod2hpY2gga25vd3MgaG93IHRvXG5cdFx0Ly8gZXh0cmFjdCB0aGVtIGZyb20gdGhlIHBhcmVudCBzZXNzaW9uJ3MgZXZlbnQgbG9nKS5cblx0XHRsZXQgY2hpbGRUdXJuczogcmVhZG9ubHkgVHVybltdID0gW107XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKHBhcmVudFNlc3Npb24pO1xuXHRcdGlmIChhZ2VudCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2hpbGRUdXJucyA9IGF3YWl0IHRoaXMuX2dldENoYXRNZXNzYWdlcyhhZ2VudCwgVVJJLnBhcnNlKHN1YmFnZW50VXJpKSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gbG9hZCBzdWJhZ2VudCB0dXJucyBmb3IgJHtzdWJhZ2VudFVyaX1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVzZSBtZXRhZGF0YSBmcm9tIHN1YmFnZW50IGNvbnRlbnQgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2Ugc3ludGhlc2l6ZVxuXHRcdGNvbnN0IHRpdGxlID0gc3ViYWdlbnRDb250ZW50Py50aXRsZSA/PyAnU3ViYWdlbnQnO1xuXG5cdFx0Y29uc3Qgc3ViYWdlbnROb3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cdFx0Ly8gTG9jYWwgdHVybnMgZm9yIGEgc3ViYWdlbnQgY2hhdCBhcmUgcGVyc2lzdGVkIGluIHRoZSBwYXJlbnQgc2Vzc2lvbidzXG5cdFx0Ly8gZGF0YWJhc2UgKGl0cyBjaGF0IFVSSSByZXNvbHZlcyB0byB0aGUgcGFyZW50IHNlc3Npb24pLCBrZXllZCBieSB0aGVcblx0XHQvLyBzdWJhZ2VudCBjaGF0IFVSSS5cblx0XHRjb25zdCBtZXJnZWRDaGlsZFR1cm5zID0gYXdhaXQgdGhpcy5faW50ZXJsZWF2ZUxvY2FsVHVybnMocGFyZW50U2Vzc2lvbi50b1N0cmluZygpLCBzdWJhZ2VudFVyaSwgY2hpbGRUdXJucyk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNvdXJjZTogc3ViYWdlbnRVcmksXG5cdFx0XHRcdHByb3ZpZGVyOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogc3ViYWdlbnROb3csXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IHN1YmFnZW50Tm93LFxuXHRcdFx0XHQuLi4ocGFyZW50U3RhdGU/LnByb2plY3QgPyB7IHByb2plY3Q6IHBhcmVudFN0YXRlLnByb2plY3QgfSA6IHt9KSxcblx0XHRcdH0sXG5cdFx0XHRtZXJnZWRDaGlsZFR1cm5zLFxuXHRcdCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZXJ2aWNlXSBSZXN0b3JlZCBzdWJhZ2VudCBzZXNzaW9uOiAke3N1YmFnZW50VXJpfSB3aXRoICR7Y2hpbGRUdXJucy5sZW5ndGh9IHR1cm4ocylgKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBzdWJhZ2VudCBjaGlsZCBzZXNzaW9uJ3Mgc3RhdGUgdXAtZnJvbnQgZnJvbSBkYXRhIHRoZSBhZ2VudFxuXHQgKiBhbHJlYWR5IHJlY29uc3RydWN0ZWQgZm9yIHRoZSBwYXJlbnQsIHNvIGEgbGF0ZXIgc3Vic2NyaWJlLWRyaXZlblxuXHQgKiB7QGxpbmsgX3Jlc3RvcmVTdWJhZ2VudFNlc3Npb259IGZpbmRzIGl0IHByZXNlbnQgYW5kIHJldHVybnMgZWFybHlcblx0ICogaW5zdGVhZCBvZiByZS1yZWFkaW5nIHRoZSBwYXJlbnQgZXZlbnQgbG9nLiBOby1vcCBpZiBhbHJlYWR5IHJlZ2lzdGVyZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlclJlc3RvcmVkU3ViYWdlbnQoY2hpbGQ6IElSZXN0b3JlZFN1YmFnZW50U2Vzc2lvbiwgcGFyZW50U3VtbWFyeTogU2Vzc2lvblN1bW1hcnksIHBhcmVudFNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlU3RyID0gY2hpbGQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShyZXNvdXJjZVN0cikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZE5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVzdG9yZVNlc3Npb24oXG5cdFx0XHR7XG5cdFx0XHRcdHJlc291cmNlOiByZXNvdXJjZVN0cixcblx0XHRcdFx0cHJvdmlkZXI6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdHRpdGxlOiBjaGlsZC50aXRsZSxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogcmVnaXN0ZXJlZE5vdyxcblx0XHRcdFx0bW9kaWZpZWRBdDogcmVnaXN0ZXJlZE5vdyxcblx0XHRcdFx0Li4uKHBhcmVudFN1bW1hcnkucHJvamVjdCA/IHsgcHJvamVjdDogcGFyZW50U3VtbWFyeS5wcm9qZWN0IH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdFx0Wy4uLmNoaWxkLnR1cm5zXSxcblx0XHQpO1xuXG5cdFx0Ly8gTWlycm9yIHRoZSBsaXZlIGBfaGFuZGxlU3ViYWdlbnRTdGFydGVkYCBmbG93IG9uIHJlc3RvcmU6IHN1cmZhY2UgdGhlXG5cdFx0Ly8gc3ViYWdlbnQgYXMgYSByZWFkLW9ubHkgcGVlciBjaGF0IGluIHRoZSBQQVJFTlQgc2Vzc2lvbidzIGNhdGFsb2cgc28gaXRcblx0XHQvLyByZWFwcGVhcnMgYXMgYSB0YWIgKGFuZCB0aGUgaW5saW5lIFwiT3BlbiBBZ2VudFwiIGxpbmsgY2FuIHJldmVhbCBpdClcblx0XHQvLyBhZnRlciBhIHJlc3RhcnQuIFVzZXMgdGhlIHNhbWUgYGFocC1jaGF0Oi8vc3ViYWdlbnQvLi4uYCBjaGF0IFVSSSBmb3JtXG5cdFx0Ly8gYXMgdGhlIGxpdmUgcGF0aCBzbyB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIgcGFyc2VzIGFuZCBzdXJmYWNlcyBpdC5cblx0XHRjb25zdCBzdWJhZ2VudENoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShwYXJlbnRTZXNzaW9uU3RyLCBjaGlsZC50b29sQ2FsbElkKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuYWRkQ2hhdChwYXJlbnRTZXNzaW9uU3RyLCBzdWJhZ2VudENoYXRVcmksIHtcblx0XHRcdHRpdGxlOiBjaGlsZC50aXRsZSxcblx0XHRcdHR1cm5zOiBbLi4uY2hpbGQudHVybnNdLFxuXHRcdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsIGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkocGFyZW50U2Vzc2lvblN0ciksIHRvb2xDYWxsSWQ6IGNoaWxkLnRvb2xDYWxsSWQgfSxcblx0XHRcdGludGVyYWN0aXZpdHk6IENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uOiBVUkkgfCBzdHJpbmcpOiBJQWdlbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHR5cGVvZiBzZXNzaW9uID09PSAnc3RyaW5nJyA/IHNlc3Npb24gOiBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IHRoaXMuX3Nlc3Npb25Ub1Byb3ZpZGVyLmdldChrZXkpO1xuXHRcdGlmIChwcm92aWRlcklkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXJzLmdldChwcm92aWRlcklkKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2NoZW1lUHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIoc2Vzc2lvbik7XG5cdFx0aWYgKHNjaGVtZVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXJzLmdldChzY2hlbWVQcm92aWRlcik7XG5cdFx0fVxuXHRcdC8vIEZhbGxiYWNrOiB0cnkgdGhlIGRlZmF1bHQgcHJvdmlkZXIgKGhhbmRsZXMgcmVzdW1lZCBzZXNzaW9ucyBub3QgeWV0IHRyYWNrZWQpXG5cdFx0aWYgKHRoaXMuX2RlZmF1bHRQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycy5nZXQodGhpcy5fZGVmYXVsdFByb3ZpZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBhZ2VudHMgb2JzZXJ2YWJsZSB0byB0cmlnZ2VyIG1vZGVsIHJlLWZldGNoIGFuZFxuXHQgKiBgcm9vdC9hZ2VudHNDaGFuZ2VkYCB2aWEgdGhlIGF1dG9ydW4gaW4ge0BsaW5rIEFnZW50U2lkZUVmZmVjdHN9LlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlQWdlbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FnZW50cy5zZXQoWy4uLnRoaXMuX3Byb3ZpZGVycy52YWx1ZXMoKV0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcHJvdmlkZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRwcm92aWRlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVycy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0Vycm9yV2l0aENvZGUoZXJyb3I6IHVua25vd24sIGNvZGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBoYXNFcnJvckNvZGUoZXJyb3IsIGNvZGUpO1xufVxuXG5mdW5jdGlvbiBoYXNFcnJvckNvZGUoZXJyb3I6IEVycm9yIHwgeyBjb2RlOiB1bmtub3duIH0sIGNvZGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaGFzS2V5KGVycm9yLCB7IGNvZGU6IHRydWUgfSkgJiYgZXJyb3IuY29kZSA9PT0gY29kZTtcbn1cblxuLyoqXG4gKiBSdW50aW1lIG93bmVyIG9mIGFuIGFjdGl2ZSByZXNvdXJjZSB3YXRjaCBcdTIwMTQgcGFpcnMgdGhlIHtAbGluayBJRmlsZVNlcnZpY2V9XG4gKiB3YXRjaGVyIGRpc3Bvc2FibGVzIHdpdGggdGhlIHN1YnNjcmliZXIgcmVmY291bnQgYW5kIHRoZSBvcHRpb25hbFxuICogZ3JhY2Utd2luZG93IHRpbWVyIHVzZWQgdG8gZGVsYXkgZGlzcG9zYWwgYWZ0ZXIgdGhlIGxhc3QgdW5zdWJzY3JpYmUuXG4gKi9cbmludGVyZmFjZSBJQWN0aXZlUmVzb3VyY2VXYXRjaCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdG9yOiBSZXNvdXJjZVdhdGNoU3RhdGU7XG5cdHN1YnNjcmliZXJzOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHBlbmRpbmdHYzogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+O1xufVxuXG4vKipcbiAqIEZsYXR0ZW4gYSB7QGxpbmsgRmlsZUNoYW5nZXNFdmVudH0gaW50byBhIHN5bnRoZXRpYyB7QGxpbmsgSUZpbGVDaGFuZ2V9XG4gKiBsaXN0LiBUaGUgZXZlbnQgc3RvcmVzIG9ubHkgVVJJIGFycmF5cyBwdWJsaWNseSAodGhlIHVuZGVybHlpbmdcbiAqIGBJRmlsZUNoYW5nZVtdYCBpcyBwcml2YXRlKSwgc28gd2UgcmVjb25zdHJ1Y3Qgb25lIGVudHJ5IHBlciBVUkkgcGVyXG4gKiBjaGFuZ2UgdHlwZS4gVGhlIHN5bnRoZXRpYyBzaGFwZSBpcyBzdWZmaWNpZW50IGZvciB0cmFuc2xhdGlvbiBpbnRvXG4gKiBgUmVzb3VyY2VXYXRjaENoYW5nZWRBY3Rpb25gIGl0ZW1zLlxuICovXG5mdW5jdGlvbiBjb2xsZWN0Q2hhbmdlcyhldmVudDogRmlsZUNoYW5nZXNFdmVudCk6IElGaWxlQ2hhbmdlW10ge1xuXHRjb25zdCBvdXQ6IElGaWxlQ2hhbmdlW10gPSBbXTtcblx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBldmVudC5yYXdBZGRlZCkge1xuXHRcdG91dC5wdXNoKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0pO1xuXHR9XG5cdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZXZlbnQucmF3VXBkYXRlZCkge1xuXHRcdG91dC5wdXNoKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSk7XG5cdH1cblx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBldmVudC5yYXdEZWxldGVkKSB7XG5cdFx0b3V0LnB1c2goeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9KTtcblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG4vKipcbiAqIFZhcmlhbnQgb2Yge0BsaW5rIGNvbGxlY3RDaGFuZ2VzfSB0aGF0IHJlc3RyaWN0cyB0aGUgb3V0cHV0IHRvIGNoYW5nZXNcbiAqIGluc2lkZSBgcm9vdGAgKGluY2x1c2l2ZSkuIFVzZWQgZm9yIHRoZSByZWN1cnNpdmUgd2F0Y2ggZmFsbGJhY2ssXG4gKiB3aGljaCBmZWVkcyBvZmYgdGhlIHVuY29ycmVsYXRlZCBnbG9iYWwgc3RyZWFtIGFuZCBtdXN0IGZpbHRlciBvdXRcbiAqIHVucmVsYXRlZCBldmVudHMuXG4gKi9cbmZ1bmN0aW9uIGNvbGxlY3RDaGFuZ2VzVW5kZXJSb290KGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50LCByb290OiBVUkkpOiBJRmlsZUNoYW5nZVtdIHtcblx0Y29uc3Qgb3V0OiBJRmlsZUNoYW5nZVtdID0gW107XG5cdGNvbnN0IGFjY2VwdCA9IChyZXNvdXJjZTogVVJJLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZSkgPT4ge1xuXHRcdGlmIChpc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHJvb3QpKSB7XG5cdFx0XHRvdXQucHVzaCh7IHJlc291cmNlLCB0eXBlIH0pO1xuXHRcdH1cblx0fTtcblx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBldmVudC5yYXdBZGRlZCkgeyBhY2NlcHQocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTsgfVxuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGV2ZW50LnJhd1VwZGF0ZWQpIHsgYWNjZXB0KHJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTsgfVxuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGV2ZW50LnJhd0RlbGV0ZWQpIHsgYWNjZXB0KHJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTsgfVxuXHRyZXR1cm4gb3V0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxNQUFNLGNBQStCO0FBQzlDLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyxpQkFBaUIsbUJBQW1CLHFCQUFxQjtBQUNsRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGVBQWUsdUJBQXVCLGlCQUE4Qix5QkFBeUI7QUFDbEgsU0FBUyxVQUFVLG1CQUFtQjtBQUN0QyxTQUFTLHlCQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxlQUFlO0FBQ3hCLFNBQXNCLHVCQUF1QjtBQUM3QyxTQUFTLFdBQVcsa0JBQWtCLFdBQVcsa0JBQWtCLDRCQUE0QixTQUFTLGlCQUFpQixnQkFBZ0I7QUFDekksU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQixxQkFBZ0QsNkJBQW9EO0FBQzdILFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXdCLGNBQTJCLHNDQUE2ZCxlQUFzTCwwQkFBMEI7QUFDaHVCLFNBQWdDLHFCQUFxQixtQ0FBbUM7QUFDeEYsU0FBNk0sb0NBQW9DO0FBQ2pQLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBNEIsMEJBQTRMO0FBR2pPLFNBQVMsZUFBZSx1QkFBdUIsaUJBQWlCLHlCQUF5QixlQUFlLG9CQUFvQixjQUFjLHlCQUF3Z0I7QUFDbHBCLFNBQXlCLG1CQUFtQixnQkFBZ0IsNkJBQW9IO0FBRWhMLFNBQWdELGFBQWEsa0JBQWtCLHlCQUF5QixzQkFBc0IsdUJBQXVCLHVCQUF1QixlQUFlLGdCQUFnQix1QkFBdUIsOEJBQThCLDRCQUE0Qix3QkFBd0Isd0JBQXdCLGNBQWMscUJBQXFCLDhCQUE4Qixz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
