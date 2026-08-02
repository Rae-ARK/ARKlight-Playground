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
import { SequencerByKey } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { AgentSessionEntry, buildSideChatSourceContext, decodeProviderData, encodeProviderData, prepareSideChatPrompt, stripSideChatContext } from "../agentPeerChats.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from "../../common/agentHostCustomizationConfig.js";
import { AgentHostClaudeMultiRootEnabledConfigKey, createSchema, platformRootSchema, platformSessionSchema, schemaProperty } from "../../common/agentHostSchema.js";
import { ClaudeSessionConfigKey, narrowClaudePermissionMode } from "../../common/claudeSessionConfigKeys.js";
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel } from "../../common/claudeModelConfig.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { AgentSession, CLAUDE_AGENT_PROVIDER_ID, SubagentChatSignal } from "../../common/agentService.js";
import { ensureWorkspacelessScratchDir } from "../workspacelessScratchDir.js";
import { ActionType, AuthRequiredReason } from "../../common/state/sessionActions.js";
import { AHP_AUTH_REQUIRED, ProtocolError } from "../../common/state/sessionProtocol.js";
import { isSubagentSession, parseSubagentSessionUri, buildDefaultChatUri, parseChatUri, parseRequiredSessionUriFromChatUri, isDefaultChatUri } from "../../common/state/sessionState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { projectFromCopilotContext } from "../copilot/copilotGitProject.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { IClaudeAgentSdkService } from "./claudeAgentSdkService.js";
import { buildModelEnumerationOptions } from "./claudeSdkOptions.js";
import { mapSessionMessagesToTurns, resolveForkAnchorUuid } from "./claudeReplayMapper.js";
import { getSubagentTranscript } from "./claudeSubagentResolver.js";
import { ClaudeAgentSession } from "./claudeAgentSession.js";
import { handleCanUseTool } from "./claudeCanUseTool.js";
import { handleElicitation } from "./claudeElicitationBridge.js";
import { createPricingMetaFromBilling, normalizeCAPIBilling } from "../../common/agentModelPricing.js";
import { tryParseClaudeModelId } from "./claudeModelId.js";
import { resolvePromptToContentBlocks } from "./claudePromptResolver.js";
import { IClaudeProxyService } from "./claudeProxyService.js";
import { readClaudePermissionMode } from "./claudeSessionPermissionMode.js";
import { ClaudeSessionMetadataStore } from "./claudeSessionMetadataStore.js";
import { IAgentHostStateManager } from "../agentHostStateManager.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
const USER_AGENT_PREFIX = "vscode_claude_code";
function isClaudeModel(m) {
  return m.vendor === "Anthropic" && !!m.supported_endpoints?.includes("/v1/messages") && !!m.model_picker_enabled && !!m.capabilities?.supports?.tool_calls && tryParseClaudeModelId(m.id) !== void 0;
}
function toAgentModelInfo(m, provider) {
  const supports = m.capabilities?.supports;
  const supportedEfforts = (supports?.reasoning_effort ?? []).filter(isClaudeEffortLevel);
  const configSchema = createClaudeThinkingLevelSchema(supportedEfforts);
  const policyState = m.policy?.state;
  const billing = normalizeCAPIBilling(m.billing);
  const priceCategory = typeof m.model_picker_price_category === "string" ? m.model_picker_price_category : void 0;
  return {
    provider,
    // CAPI/endpoint format, dotted version (e.g. `claude-haiku-4.5`) — the
    // canonical id through `ModelSelection.id`. Convert to SDK format at SDK
    // seams via `toSdkModelId`.
    id: m.id,
    name: m.name,
    maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
    maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
    maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
    supportsVision: !!supports?.vision,
    ...configSchema ? { configSchema } : {},
    ...policyState ? { policyState } : {},
    _meta: createPricingMetaFromBilling(billing, priceCategory)
  };
}
function fromSdkModelInfo(m, provider) {
  const supportedEfforts = (m.supportedEffortLevels ?? []).filter(isClaudeEffortLevel);
  const configSchema = createClaudeThinkingLevelSchema(supportedEfforts);
  return {
    provider,
    // SDK-canonical id (`m.value`, e.g. `claude-sonnet-4-5-20250929`). Native
    // ids are SDK format end to end; `toSdkModelId` is identity at this seam.
    id: m.value,
    name: m.displayName,
    supportsVision: false,
    ...configSchema ? { configSchema } : {}
  };
}
class ClaudeActiveClientHandle {
  constructor(clientId, displayName, _getTools, _setTools, _syncCustomizations) {
    this.clientId = clientId;
    this.displayName = displayName;
    this._getTools = _getTools;
    this._setTools = _setTools;
    this._syncCustomizations = _syncCustomizations;
    this._customizations = [];
  }
  get tools() {
    return this._getTools();
  }
  set tools(tools) {
    this._setTools(tools);
  }
  get customizations() {
    return this._customizations;
  }
  set customizations(customizations) {
    this._customizations = customizations;
    this._syncCustomizations(customizations);
  }
}
let ClaudeAgent = class extends Disposable {
  constructor(_logService, _copilotApiService, _claudeProxyService, _sdkService, _stateManager, _otelService, _gitService, _configurationService, _gitHubEndpointService, _instantiationService, _pluginManager, _productService, _environmentService) {
    super();
    this._logService = _logService;
    this._copilotApiService = _copilotApiService;
    this._claudeProxyService = _claudeProxyService;
    this._sdkService = _sdkService;
    this._stateManager = _stateManager;
    this._otelService = _otelService;
    this._gitService = _gitService;
    this._configurationService = _configurationService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._instantiationService = _instantiationService;
    this._pluginManager = _pluginManager;
    this._productService = _productService;
    this._environmentService = _environmentService;
    this.id = CLAUDE_AGENT_PROVIDER_ID;
    this._onDidSessionProgress = this._register(new Emitter());
    this.onDidSessionProgress = this._onDidSessionProgress.event;
    this._onDidCustomizationsChange = this._register(new Emitter());
    this.onDidCustomizationsChange = this._onDidCustomizationsChange.event;
    this._onDidRequireAuth = this._register(new Emitter());
    this.onDidRequireAuth = this._onDidRequireAuth.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    /**
     * Resolved host transport mode (Phase 19). `proxy` (default) routes through
     * the Copilot-CAPI proxy; `native` talks to Anthropic directly on the user's
     * own credentials. Resolved once from the `ClaudeUseCopilotProxy` root
     * config value and kept current by an `onDidRootConfigChange` subscription.
     * Config changes affect FUTURE sessions only — never an in-flight subprocess.
     */
    this._transportMode = "proxy";
    /**
     * Live in-memory session entries, keyed by raw session id (not URI).
     * Each {@link ClaudeSessionEntry} owns its {@link ClaudeAgentSession} plus
     * any per-session disposables registered against it (e.g. the forward
     * subscription to the session's `onDidSessionProgress` event). Disposing
     * the map disposes every entry, which in turn disposes everything
     * registered to it — no parallel maps, no implicit lockstep invariants.
     * {@link createSession} is the only writer; {@link disposeSession} and
     * {@link shutdown} remove via {@link DisposableMap.deleteAndDispose}, which
     * is idempotent if the key has already been removed.
     */
    this._sessions = this._register(new DisposableMap());
    /**
     * Live, in-memory peer-chat backings keyed by the chat's `ahp-chat` channel
     * URI string. Populated by {@link createChat} on creation and by
     * {@link materializeChat} on session restore (decoding the opaque
     * `providerData` the orchestrator persisted). This is the live source of the
     * `chatUri → sdkSessionId` mapping.
     */
    this._chatBackings = /* @__PURE__ */ new Map();
    /**
     * Fires when a peer chat's opaque `providerData` blob changes after creation
     * (e.g. a per-chat model switch) so the orchestrator can re-persist the
     * refreshed token. See {@link IAgent.onDidChangeChatData}.
     */
    this._onDidChangeChatData = this._register(new Emitter());
    this.onDidChangeChatData = this._onDidChangeChatData.event;
    /**
     * Membership channel for chats the agent spawns itself — today the
     * sub-agent chats delegated by a `Task`/`Agent` tool call (and, when the
     * harness gains them, Claude Teams teammates). Derived from the
     * `subagent_started` / `subagent_completed` signals that already flow on
     * {@link onDidSessionProgress}, so the orchestrator records the spawn edge
     * on the unified chat catalog. See {@link IAgent.onDidSpawnChat}.
     */
    this._onDidSpawnChat = this._register(new Emitter());
    this.onDidSpawnChat = this._onDidSpawnChat.event;
    /** Stable active-client handles, keyed by `${sessionId}\0${clientId}`. */
    this._activeClientHandles = /* @__PURE__ */ new Map();
    /**
     * Phase 6: fired once per session when {@link _materializeProvisional}
     * promotes a provisional record into a real {@link ClaudeAgentSession}.
     * The {@link IAgentService} subscribes via the platform contract
     * (`agentService.ts:412`) to dispatch the deferred `sessionAdded`
     * notification — observers don't see the session in their list until
     * persistence has settled.
     */
    this._onDidMaterializeSession = this._register(new Emitter());
    this.onDidMaterializeSession = this._onDidMaterializeSession.event;
    /**
     * Per-session-id serializer shared by {@link disposeSession} and
     * {@link shutdown}. Phase 5 dispose work is synchronous, so the queued
     * tasks resolve immediately and the sequencer is mostly a no-op. The
     * routing is locked in now (per plan section 3.3.4 / section 3.3.6) so
     * Phase 6's real async teardown (`Query.interrupt()`, in-flight metadata
     * writes) inherits per-session serialization for free — a concurrent
     * `disposeSession(uri)` already in flight is awaited before
     * `shutdown()` reuses the same key.
     */
    this._disposeSequencer = new SequencerByKey();
    /**
     * Phase 6: per-session-id serializer for {@link sendMessage}. Held
     * across both {@link _materializeProvisional} AND `entry.send()` so
     * two concurrent first-message calls on the same session collapse
     * into one materialize plus two ordered sends. Separate from
     * {@link _disposeSequencer} so a `disposeSession` racing a first send
     * still serializes against in-flight teardown without deadlocking
     * inside the send sequencer (different key spaces, single
     * race-resolution lattice via the underlying `AbortController`).
     */
    this._sessionSequencer = new SequencerByKey();
    // ---- Chat surface ------------------------------------------------------
    //
    // `chats` exposes the per-chat operations addressed by a single,
    // concrete chat channel URI (the default chat channel or a peer/subagent
    // URI). The default chat's SDK id is still the owning session id, derived
    // inside the harness from the chat URI.
    /**
     * The chat-addressed operation surface
     * ({@link IAgentChats}). Every method addresses a chat by a single,
     * already-resolved chat URI; this maps to the `(session, chat)` pair
     * the agent's internal SDK storage is keyed by (via
     * {@link _resolveChatTarget}).
     */
    this.chats = {
      createChat: (chat, options) => this._createChat(chat, options),
      fork: (chat, source, options) => this._createChat(chat, { ...options, fork: source }),
      disposeChat: (chatUri) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this._disposeChat(session, chat);
      },
      sendMessage: (chatUri, prompt, workingDirectories, attachments, turnId, senderClientId) => {
        return this._sendMessage(chatUri, prompt, workingDirectories, attachments, turnId, senderClientId);
      },
      abort: (chatUri) => {
        return this._abortSession(chatUri);
      },
      changeModel: (chatUri, model) => {
        return this._changeModel(chatUri, model);
      },
      changeAgent: (chatUri, agent) => {
        return this._changeAgent(chatUri, agent);
      },
      getMessages: (chat) => this.getSessionMessages(chat)
    };
    this._metadataStore = _instantiationService.createInstance(ClaudeSessionMetadataStore, this.id);
    this._register(this._claudeProxyService.onDidReportCredits((e) => {
      this._findSessionBySdkId(e.sessionId)?.recordTurnCredits(e.totalNanoAiu);
    }));
    this._register(this._stateManager.onDidChangeSessionTitle(({ session, title }) => {
      if (AgentSession.provider(session) === this.id) {
        this._otelService.emitSessionTitleChanged(AgentSession.id(session), session, title);
      }
    }));
    this._transportMode = this._resolveTransportMode();
    this._register(this._configurationService.onDidRootConfigChange(() => {
      const next = this._resolveTransportMode();
      if (next !== this._transportMode) {
        this._transportMode = next;
        this._models.set([], void 0);
        void this._startModelRefresh();
        if (next === "proxy" && !this._proxyHandle) {
          this._onDidRequireAuth.fire({
            resource: this._gitHubEndpointService.getCopilotResource().resource,
            reason: AuthRequiredReason.Required
          });
        }
      }
    }));
    if (this._transportMode === "native") {
      queueMicrotask(() => {
        void this._startModelRefresh();
      });
    }
  }
  /**
   * Unified per-session lookup. Returns the session's default chat whether it
   * is still provisional or already materialized; callers branch on
   * {@link ClaudeAgentSession.isPipelineReady} when behavior differs.
   */
  _findAnySession(sessionId) {
    return this._sessions.get(sessionId)?.defaultChat;
  }
  /**
   * Resolve the live {@link ClaudeAgentSession} for a chat — the session's
   * default (main) chat, or an additional peer chat addressed by its
   * `ahp-chat` channel URI — via a single uniform lookup in the owning
   * session's chat map. Returns `undefined` when the session (or the chat) is
   * not in memory.
   */
  _findChat(session, chat) {
    const entry = this._sessions.get(AgentSession.id(session));
    if (!entry) {
      return void 0;
    }
    return entry.getChat((chat ?? URI.parse(buildDefaultChatUri(session))).toString());
  }
  _getChatContext(chatOrSession) {
    const chat = parseChatUri(chatOrSession) ? chatOrSession : URI.parse(buildDefaultChatUri(chatOrSession));
    const session = URI.parse(parseRequiredSessionUriFromChatUri(chat));
    const sessionId = AgentSession.id(session);
    const chatKey = chat.toString();
    const resolved = this._sessions.get(sessionId)?.resolveChat(chatKey);
    return {
      session,
      sessionId,
      chatKey,
      target: resolved?.chatSession,
      isPeerChat: resolved ? !resolved.isDefault : chatKey !== buildDefaultChatUri(session)
    };
  }
  /**
   * Resolve a live {@link ClaudeAgentSession} by its SDK chat id,
   * searching every session entry's default chat and its peer chats. Used by
   * SDK-id-addressed callbacks — proxy credit reports and the `canUseTool`
   * permission bridge — which carry the SDK session id, not the chat URI.
   */
  _findSessionBySdkId(sdkSessionId) {
    for (const entry of this._sessions.values()) {
      for (const chat of entry.allChatSessions()) {
        if (chat.sessionId === sdkSessionId) {
          return chat;
        }
      }
    }
    return void 0;
  }
  /** Wrap a {@link ClaudeAgentSession} in a chat-leaf entry and forward its events. */
  _wireEntry(session) {
    const entry = new ClaudeSessionEntry(session);
    entry.addDisposable(session.onDidSessionProgress((signal) => {
      this._onDidSessionProgress.fire(signal);
      this._emitSpawnedChatEvents(signal);
    }));
    entry.addDisposable(session.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
    return entry;
  }
  /**
   * Create a session container seeding its default (main) chat as the first
   * entry in the uniform chat map, keyed by the session's default-chat URI.
   */
  _seedSessionEntry(sessionId, session, mainSession) {
    const container = new ClaudeSessionEntry();
    container.setDefaultChat(buildDefaultChatUri(session), this._wireEntry(mainSession));
    this._sessions.set(sessionId, container);
    return container;
  }
  /**
   * Bridges the agent's `subagent_started` signal onto the
   * {@link onDidSpawnChat} membership channel. The signals are still forwarded
   * verbatim on {@link onDidSessionProgress} (the orchestrator's
   * `AgentSideEffects` keeps driving the sub-agent turn + parent tool-call
   * content); this event only mirrors the spawn into the unified chat catalog.
   * A completed subagent chat stays live and subscribable (it is removed only
   * on session teardown), so there is no corresponding end event. The catalog
   * add is idempotent so the overlap with the orchestrator's own membership
   * sequencing is safe.
   */
  _emitSpawnedChatEvents(signal) {
    const spawn = SubagentChatSignal.toSpawnEvent(signal);
    if (spawn) {
      this._onDidSpawnChat.fire(spawn);
    }
  }
  _resolveTransportMode() {
    const useProxy = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.ClaudeUseCopilotProxy) ?? true;
    return useProxy ? "proxy" : "native";
  }
  // #region Descriptor + auth
  getDescriptor() {
    return {
      provider: this.id,
      displayName: localize("claudeAgent.displayName", "Claude"),
      description: localize("claudeAgent.description", "Claude agent backed by the Anthropic Claude Agent SDK"),
      capabilities: {
        multipleChats: { fork: true, sideChat: true },
        ...this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
      }
    };
  }
  _isMultiRootEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostClaudeMultiRootEnabledConfigKey) === true;
  }
  getProtectedResources() {
    if (this._transportMode !== "proxy") {
      return [this._gitHubEndpointService.getRepoResource()];
    }
    return [
      this._gitHubEndpointService.getCopilotResource(),
      this._gitHubEndpointService.getRepoResource()
    ];
  }
  /**
   * Resolve the active {@link ClaudeTransport}. In native mode the transport
   * is always ready (the SDK owns credentials); in proxied mode a started
   * proxy handle is required, otherwise {@link AHP_AUTH_REQUIRED} is thrown.
   */
  _ensureAuthenticated() {
    if (this._transportMode !== "proxy") {
      return { kind: "native" };
    }
    const handle = this._proxyHandle;
    if (!handle) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        "Authentication is required to use Claude",
        this.getProtectedResources()
      );
    }
    return { kind: "proxy", handle };
  }
  async authenticate(resource, token) {
    if (resource === this._gitHubEndpointService.getRepoResource().resource) {
      return true;
    }
    if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
      return false;
    }
    if (this._transportMode !== "proxy") {
      this._githubToken = token;
      return true;
    }
    const tokenChanged = this._githubToken !== token;
    if (!tokenChanged && this._proxyHandle) {
      this._logService.info("[Claude] Auth token unchanged");
      return true;
    }
    const newHandle = await this._claudeProxyService.start(token);
    const oldHandle = this._proxyHandle;
    this._proxyHandle = newHandle;
    this._githubToken = token;
    this._logService.info("[Claude] Auth token updated");
    oldHandle?.dispose();
    if (tokenChanged) {
      this._models.set([], void 0);
    }
    void this._startModelRefresh();
    return true;
  }
  /**
   * Whether the Claude provider routes through the Copilot-CAPI proxy.
   * Reads the resolved {@link _transportMode} (Phase 19), which the
   * constructor seeds from the `ClaudeUseCopilotProxy` root config value.
   */
  _isProxyEnabled() {
    return this._transportMode === "proxy";
  }
  /**
   * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh and
   * never rejects — {@link _refreshModels} already logs and handles failure.
   *
   * Only safe for callers with no new input to apply (the host's periodic
   * scheduler). Triggers that invalidate the in-flight request — a rotated
   * token, a transport flip — must call {@link _startModelRefresh} so they
   * are not answered by a refresh bound to the superseded input.
   */
  refreshModels() {
    return this._modelRefreshInFlight ?? this._startModelRefresh();
  }
  /**
   * Unconditionally begins a refresh, superseding any in-flight one as the
   * coalescing target. The superseded request stays harmless: its own
   * stale-write guard drops the result if the token or transport moved on.
   */
  _startModelRefresh() {
    const refresh = this._refreshModels().finally(() => {
      if (this._modelRefreshInFlight === refresh) {
        this._modelRefreshInFlight = void 0;
      }
    });
    this._modelRefreshInFlight = refresh;
    return refresh;
  }
  async _refreshModels() {
    const proxyAtStart = this._isProxyEnabled();
    const tokenAtStart = this._githubToken;
    if (proxyAtStart && !tokenAtStart) {
      this._models.set([], void 0);
      return;
    }
    try {
      const filtered = proxyAtStart ? await this._fetchProxyModels(tokenAtStart) : await this._fetchNativeModels();
      if (this._isProxyEnabled() !== proxyAtStart || proxyAtStart && this._githubToken !== tokenAtStart) {
        return;
      }
      this._logService.info(`[Claude] Models refreshed. Count: ${filtered.length}, ${filtered.map((m) => m.name).join(", ")}`);
      this._models.set(filtered, void 0);
    } catch (err) {
      this._logService.error(err, "[Claude] Failed to refresh models");
    }
  }
  /**
   * Native (BYO-Anthropic) model source: enumerate the SDK's built-in /
   * subscription models by opening a throwaway {@link IClaudeAgentSdkService.query}
   * (workspace-free options that read the user's real `~/.claude` config) and
   * calling `Query.supportedModels()` on it, then `close()`. The prompt never
   * yields, so no turn runs and no session transcript is written (verified
   * Phase 19 E2E). Projected with no commercial metadata.
   */
  async _fetchNativeModels() {
    const neverYieldingPrompt = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {
      }) })
    };
    const options = buildModelEnumerationOptions();
    const query = await this._sdkService.query({ prompt: neverYieldingPrompt, options });
    try {
      const models = await query.supportedModels();
      return models.map((m) => fromSdkModelInfo(m, this.id));
    } finally {
      query.close();
      options.abortController?.abort();
    }
  }
  /**
   * Proxied (Copilot-CAPI) model source: fetch via {@link ICopilotApiService},
   * keep the Claude family, and surface the CAPI-flagged chat-default first.
   * The picker treats `models[0]` as the de facto default (modelPicker.ts:144
   * — `_selectedModel ?? models[0]`) since `IAgentModelInfo` carries no
   * explicit `isDefault` bit; the stable comparator returns 0 for equal-
   * priority models so CAPI's ordering wins on ties.
   */
  async _fetchProxyModels(token) {
    const userAgent = `${USER_AGENT_PREFIX}/${this._productService.version}`;
    const all = await this._copilotApiService.models(token, { headers: { "User-Agent": userAgent }, suppressIntegrationId: true });
    return all.filter(isClaudeModel).sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default)).map((m) => toAgentModelInfo(m, this.id));
  }
  // #endregion
  // #region Stubs — implemented in later phases
  async createSession(config = {}) {
    this._ensureAuthenticated();
    if (config.fork) {
      return this._forkSession(config, config.fork);
    }
    const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
    const sessionUri = AgentSession.uri(this.id, sessionId);
    const existing = this._findAnySession(sessionId);
    if (existing) {
      await this._seedEagerActiveClient(sessionUri, config.activeClient);
      if (!existing.isPipelineReady) {
        return {
          session: existing.sessionUri,
          resolvedWorkingDirectory: existing.workingDirectory,
          provisional: true,
          ...existing.project ? { project: existing.project } : {}
        };
      }
      return { session: sessionUri, resolvedWorkingDirectory: config.workingDirectories?.[0] };
    }
    const requestedWorkingDirectory = config.workingDirectories?.[0];
    const workingDirectory = requestedWorkingDirectory ?? await ensureWorkspacelessScratchDir(this._environmentService.userHome, sessionId);
    const project = requestedWorkingDirectory ? await projectFromCopilotContext({ cwd: requestedWorkingDirectory.fsPath }, this._gitService) : void 0;
    const permissionMode = this._resolvePermissionMode(config.config);
    const additionalDirectories = config.workingDirectories?.slice(1) ?? [];
    const session = ClaudeAgentSession.createProvisional(
      sessionId,
      sessionUri,
      URI.parse(buildDefaultChatUri(sessionUri)),
      workingDirectory,
      project,
      config.model,
      config.agent,
      config.config,
      new PendingRequestRegistry(),
      permissionMode,
      this._metadataStore,
      this._instantiationService,
      additionalDirectories
    );
    this._seedSessionEntry(sessionId, sessionUri, session);
    await this._seedEagerActiveClient(sessionUri, config.activeClient);
    return {
      session: sessionUri,
      resolvedWorkingDirectory: workingDirectory,
      provisional: true,
      ...project ? { project } : {}
    };
  }
  /**
   * Seed the eagerly-claimed active client (tools + customizations) into the
   * SDK at session creation, mirroring the Copilot agent. Runs for fresh AND
   * reconnected sessions: when the workbench session state already carries the
   * active client, no follow-up `session/activeClientSet` is dispatched to
   * trigger the customization sync, so the built-in skills bundle would never
   * reach Claude otherwise. Progress is suppressed (`quiet`) because the AH
   * service has not created the session state yet — a
   * `SessionCustomizationUpdated` envelope would be orphaned; the completed
   * snapshot is provided via `getSessionCustomizations` immediately after.
   */
  async _seedEagerActiveClient(sessionUri, activeClient) {
    if (!activeClient) {
      return;
    }
    const handle = this.getOrCreateActiveClient(sessionUri, { clientId: activeClient.clientId, displayName: activeClient.displayName });
    handle.tools = activeClient.tools;
    if (activeClient.customizations !== void 0) {
      await this.syncClientCustomizations(sessionUri, activeClient.clientId, activeClient.customizations, { quiet: true });
    }
  }
  /**
   * In-place "Restore Checkpoint" truncation. Keeps turns
   * `[0..turnId]` INCLUSIVE (or removes all turns when `turnId` is
   * omitted) on the **same** session id / URI — unlike fork, which mints a
   * new id. The `turnId` path resolves the protocol turn to its SDK
   * assistant-envelope uuid ({@link resolveForkAnchorUuid}) and stages it
   * as a one-shot `resumeSessionAt` anchor that the next turn's rebuild
   * applies (the truncation finalizes when the next turn writes the
   * branch). Serialized on {@link _sessionSequencer} (same key as
   * `sendMessage`) so the `ChatTruncated` → `ChatTurnStarted` dispatch pair
   * stays ordered. Provisional sessions short-circuit.
   */
  async truncateSession(session, turnId) {
    const sessionId = AgentSession.id(session);
    await this._sessionSequencer.queue(sessionId, async () => {
      const existing = this._findAnySession(sessionId);
      if (existing && !existing.isPipelineReady) {
        this._logService.info(`[Claude:${sessionId}] truncateSession on a provisional session \u2014 nothing to truncate`);
        return;
      }
      if (turnId === void 0) {
        await this._removeAllTurns(session, sessionId, existing);
        return;
      }
      const messages = await this._sdkService.getSessionMessages(sessionId, { includeSystemMessages: true });
      const anchor = resolveForkAnchorUuid(messages, turnId);
      if (anchor === void 0) {
        throw new Error(`Cannot truncate session ${sessionId}: turn ${turnId} not found in transcript`);
      }
      const live = existing ?? await this._resumeSession(sessionId, session);
      await live.truncateToTurn(turnId, anchor);
      this._logService.info(`[Claude:${sessionId}] truncateSession kept [0..${turnId}] (anchor=${anchor})`);
    });
  }
  /**
   * Remove-all ("start over") branch of {@link truncateSession}: there is no
   * anchor to resume at, so tear down the live Query, delete the on-disk
   * transcript via the SDK, then recreate a fresh provisional under the SAME
   * id/URI so the next `sendMessage` materializes non-resume `{ sessionId }`
   * on a clean transcript (keeps the id stable). `deleteSession` is eagerly
   * durable (unlike the lazy `turnId` path), matching its "clear / start
   * over" semantic. `existing` is the live session, or `undefined` on the
   * cold path (unloaded session). Caller serializes on {@link _sessionSequencer}.
   */
  async _removeAllTurns(session, sessionId, existing) {
    const info = existing ? void 0 : await this._sdkService.getSessionInfo(sessionId);
    const workingDirectory = existing?.workingDirectory ?? (info?.cwd ? URI.file(info.cwd) : void 0);
    if (!workingDirectory) {
      throw new Error(`Cannot clear session ${sessionId}: workingDirectory missing (SDK cwd absent and no live session)`);
    }
    let overlay = {};
    try {
      overlay = await this._metadataStore.read(session);
    } catch (err) {
      this._logService.warn(`[Claude:${sessionId}] overlay read failed during remove-all; continuing with defaults`, err);
    }
    const workingDirectories = existing?.workingDirectories ?? (overlay.workingDirectories && overlay.workingDirectories.length > 1 ? [workingDirectory, ...overlay.workingDirectories.slice(1)] : [workingDirectory]);
    await existing?.shutdownLiveQuery();
    this._sessions.deleteAndDispose(sessionId);
    await this._sdkService.deleteSession(sessionId);
    await this.createSession({
      session,
      workingDirectories,
      ...overlay.model ? { model: overlay.model } : {},
      ...overlay.agent ? { agent: overlay.agent } : {},
      ...overlay.permissionMode ? { config: { [ClaudeSessionConfigKey.PermissionMode]: overlay.permissionMode } } : {}
    });
    await this._findAnySession(sessionId)?.pruneAllTurns();
    this._logService.info(`[Claude:${sessionId}] truncateSession removed all turns (deleteSession + fresh same-id)`);
  }
  /**
   * Map an already-resolved chat URI to the `(session, chat)` pair the agent's
   * internal SDK storage is keyed by. A peer (or subagent) chat is addressed by
   * its own `ahp-chat` channel URI, from which the owning session is recovered.
   * The default chat is addressed by its deterministic chat channel URI.
   */
  _resolveChatTarget(chat) {
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`Claude chat operation requires an AHP chat URI: ${chat.toString()}`);
    }
    return { session: URI.parse(parsed.session), chat };
  }
  /**
   * NOT started here (CONTEXT M9): `forkSession` writes the transcript to
   * disk and we return; the `Query` materializes lazily on the first
   * {@link sendMessage} via {@link _resumeSession}. `turnId` is translated
   * to the SDK envelope `uuid` by {@link resolveForkAnchorUuid};
   * `config.fork.turnIdMapping` is ignored (the SDK already remaps uuids).
   */
  async _forkSession(config, fork) {
    if (isSubagentSession(fork.session)) {
      throw new Error("Cannot fork a subagent session");
    }
    const sourceSessionId = AgentSession.id(fork.session);
    const existingSource = this._findAnySession(sourceSessionId);
    if (existingSource && !existingSource.isPipelineReady) {
      throw new Error("Cannot fork a provisional/never-sent session");
    }
    return this._sessionSequencer.queue(sourceSessionId, async () => {
      const messages = await this._sdkService.getSessionMessages(sourceSessionId, { includeSystemMessages: true });
      const upToMessageId = resolveForkAnchorUuid(messages, fork.turnId);
      if (upToMessageId === void 0) {
        throw new Error(`Cannot fork session ${sourceSessionId}: turn ${fork.turnId} not found in transcript`);
      }
      const { sessionId: newSessionId } = await this._sdkService.forkSession(sourceSessionId, { upToMessageId });
      const newSessionUri = AgentSession.uri(this.id, newSessionId);
      let sourceOverlay = {};
      try {
        sourceOverlay = await this._metadataStore.read(fork.session);
      } catch (err) {
        this._logService.warn(`[Claude] fork: source overlay read failed for ${sourceSessionId}; continuing with defaults`, err);
      }
      const model = config.model ?? sourceOverlay.model;
      const agent = config.agent ?? sourceOverlay.agent;
      const permissionMode = narrowClaudePermissionMode(config.config?.[ClaudeSessionConfigKey.PermissionMode]) ?? sourceOverlay.permissionMode;
      const sdkInfo = await this._sdkService.getSessionInfo(newSessionId);
      const workingDirectory = sdkInfo?.cwd ? URI.file(sdkInfo.cwd) : existingSource?.workingDirectory ?? sourceOverlay.workingDirectories?.[0];
      if (!workingDirectory) {
        throw new Error(`Cannot fork session ${sourceSessionId}: forked session ${newSessionId} has no working directory (SDK cwd and source working directory missing)`);
      }
      const additionalDirectories = existingSource?.workingDirectories?.slice(1) ?? sourceOverlay.workingDirectories?.slice(1) ?? [];
      await this._metadataStore.write(newSessionUri, {
        ...model ? { model } : {},
        ...permissionMode ? { permissionMode } : {},
        ...agent ? { agent } : {},
        ...additionalDirectories.length > 0 ? { workingDirectories: [workingDirectory, ...additionalDirectories] } : {}
      });
      let project;
      try {
        project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
      } catch (err) {
        this._logService.warn(`[Claude] fork: project resolution failed for ${newSessionId}; continuing without project`, err);
      }
      return {
        session: newSessionUri,
        resolvedWorkingDirectory: workingDirectory,
        ...project ? { project } : {}
      };
    });
  }
  /**
   * Builds the SDK `canUseTool` permission bridge for a session/chat. The
   * resolver searches both default chats and peer chats by SDK id so a peer
   * chat's tool-permission requests reach its own pending-permission registry.
   */
  _makeCanUseTool(sdkSessionId) {
    return (toolName, input, options) => handleCanUseTool(
      { getSession: (id) => this._findSessionBySdkId(id), configurationService: this._configurationService },
      sdkSessionId,
      toolName,
      input,
      options
    );
  }
  /**
   * Builds the SDK `onElicitation` bridge for a session/chat. Mirrors
   * {@link _makeCanUseTool}: resolves the session by SDK id (default and peer
   * chats) and delegates to the elicitation bridge, which parks on the
   * session's user-input channel. Phase 10.6.
   */
  _makeOnElicitation(sdkSessionId) {
    return (request, options) => handleElicitation(
      { getSession: (id) => this._findSessionBySdkId(id) },
      sdkSessionId,
      request,
      options
    );
  }
  /**
   * Promote a provisional {@link ClaudeAgentSession} into a live one.
   * Called from {@link sendMessage} inside the {@link _sessionSequencer.queue}
   * block, so concurrent first sends serialize naturally — exactly
   * one materialize per session.
   *
   * Failure modes:
   * - Missing session entry → programmer error, throws.
   * - Missing proxy handle → caller forgot {@link authenticate}, throws.
   * - Aborted before SDK init returns → {@link ClaudeAgentSession.materialize}
   *   disposes the `WarmQuery` and throws {@link CancellationError}.
   * - Customization-directory persistence failure → fatal: the session's
   *   `materialize` throws, the agent drops the entry, and the error
   *   propagates so the caller learns about it.
   * - Aborted post-metadata-write but pre-commit → second abort gate
   *   inside `materialize` throws so we never expose a live pipeline
   *   for a session the caller has already torn down.
   */
  async _materializeProvisional(sessionId, workingDirectories) {
    const session = this._findAnySession(sessionId);
    if (!session) {
      throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
    }
    const transport = this._ensureAuthenticated();
    const canUseTool = this._makeCanUseTool(sessionId);
    const onElicitation = this._makeOnElicitation(sessionId);
    try {
      await session.materialize({ transport, canUseTool, onElicitation, isResume: false, workingDirectory: workingDirectories?.[0], workingDirectories, serverToolHost: this._serverToolHost });
    } catch (err) {
      this._sessions.deleteAndDispose(sessionId);
      throw err;
    }
    this._onDidMaterializeSession.fire({
      session: session.sessionUri,
      project: session.project,
      workingDirectories: workingDirectories ?? session.workingDirectories
    });
    return session;
  }
  /**
   * Bring up a session whose state exists only on disk — created in
   * another window, or before an agent-host restart. Mirror of
   * `CopilotAgent._resumeSession`. Reads `workingDirectory` from the
   * SDK's session record and `model` / `permissionMode` from the
   * metadata overlay, constructs a provisional {@link ClaudeAgentSession},
   * and calls {@link ClaudeAgentSession.materialize} with `isResume: true`
   * so the SDK reloads the existing transcript instead of minting a
   * fresh one.
   *
   * Caller must hold the session sequencer so two concurrent
   * `sendMessage` calls for a freshly-resumed session collapse into
   * one resume + two ordered sends.
   */
  async _resumeSession(sessionId, sessionUri, workingDirectories) {
    this._logService.info(`[Claude:${sessionId}] _resumeSession \u2014 no in-memory state, rebuilding from disk`);
    const transport = this._ensureAuthenticated();
    const sdkInfo = await this._sdkService.getSessionInfo(sessionId);
    if (!sdkInfo) {
      throw new Error(`Cannot resume unknown session: ${sessionId} (not present in SDK transcript store)`);
    }
    const workingDirectory = sdkInfo.cwd ? URI.file(sdkInfo.cwd) : void 0;
    if (!workingDirectory) {
      throw new Error(`Cannot resume session ${sessionId}: workingDirectory missing from SDK transcript`);
    }
    let overlay = {};
    try {
      overlay = await this._metadataStore.read(sessionUri);
    } catch (err) {
      this._logService.warn(`[Claude:${sessionId}] overlay read failed during resume; continuing with defaults`, err);
    }
    const additionalDirectories = workingDirectories && workingDirectories.length > 1 ? workingDirectories.slice(1) : overlay.workingDirectories?.slice(1) ?? [];
    const permissionMode = readClaudePermissionMode(this._configurationService, sessionUri) ?? overlay.permissionMode ?? "default";
    let project;
    try {
      project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
    } catch (err) {
      this._logService.warn(`[Claude:${sessionId}] project resolution failed during resume; continuing without project`, err);
    }
    const session = ClaudeAgentSession.createProvisional(
      sessionId,
      sessionUri,
      URI.parse(buildDefaultChatUri(sessionUri)),
      workingDirectory,
      project,
      overlay.model,
      overlay.agent,
      void 0,
      new PendingRequestRegistry(),
      permissionMode,
      this._metadataStore,
      this._instantiationService,
      additionalDirectories
    );
    this._seedSessionEntry(sessionId, sessionUri, session);
    const canUseTool = this._makeCanUseTool(sessionId);
    const onElicitation = this._makeOnElicitation(sessionId);
    try {
      await session.materialize({ transport, canUseTool, onElicitation, isResume: true, serverToolHost: this._serverToolHost });
    } catch (err) {
      this._sessions.deleteAndDispose(sessionId);
      throw err;
    }
    this._onDidMaterializeSession.fire({
      session: sessionUri,
      project,
      workingDirectories: session.workingDirectories
    });
    return session;
  }
  /**
   * Pull `permissionMode` out of the post-validation `IAgentCreateSessionConfig.config`
   * bag, narrowing the runtime `unknown` value to the SDK's `PermissionMode`
   * union (5/6 values, excluding `dontAsk`; sdk.d.ts:1560). Falls back to
   * `'default'` when the bag is absent or carries something the schema
   * validator shouldn't have accepted (defense-in-depth).
   */
  _resolvePermissionMode(config) {
    return narrowClaudePermissionMode(config?.[ClaudeSessionConfigKey.PermissionMode]) ?? "default";
  }
  disposeSession(session) {
    const sessionId = AgentSession.id(session);
    return this._disposeSequencer.queue(sessionId, async () => {
      await this._teardownEntry(sessionId);
      this._pruneActiveClientHandles(sessionId);
    });
  }
  /**
   * Non-destructive counterpart to {@link disposeSession}: releases the
   * session's in-memory resources — its live SDK subprocess (via the disposed
   * pipeline) and cached entry — but preserves the on-disk session so it can
   * be transparently resumed later via {@link _resumeSession}. Used by
   * idle-session eviction to bound memory in long-lived host processes.
   *
   * No-ops for provisional sessions (never materialized, so nothing on disk to
   * resume from) and for sessions with a turn in flight — tearing the pipeline
   * down mid-turn would abort live work. Shares the same in-memory teardown as
   * {@link disposeSession}; the destructive difference (deleting durable data)
   * lives in the orchestrator, which only invokes it on dispose.
   */
  releaseSession(session) {
    const sessionId = AgentSession.id(session);
    return this._disposeSequencer.queue(sessionId, async () => {
      const entry = this._sessions.get(sessionId);
      if (!entry) {
        return;
      }
      if (!entry.defaultChat?.isPipelineReady) {
        return;
      }
      if (entry.allChatSessions().some((chatSession) => chatSession.hasActiveTurn)) {
        return;
      }
      this._logService.info(`[Claude:${sessionId}] Releasing idle session from memory (durable state preserved)`);
      await this._teardownEntry(sessionId);
      this._pruneActiveClientHandles(sessionId);
    });
  }
  /**
   * Abort and dispose a session entry — its default chat and every peer chat.
   * Each peer teardown serializes on the peer's own {@link _sessionSequencer}
   * key so it waits for any in-flight materialize/send rather than disposing
   * the chat under it.
   */
  async _teardownEntry(sessionId) {
    const entry = this._sessions.get(sessionId);
    if (!entry) {
      return;
    }
    const defaultChat = entry.defaultChat;
    if (defaultChat && !defaultChat.isPipelineReady) {
      defaultChat.abortController.abort();
    }
    await Promise.all(entry.peerChatKeys().map(
      (chatKey) => this._sessionSequencer.queue(chatKey, async () => {
        const peer = entry.getPeerChat(chatKey);
        if (peer) {
          if (!peer.isPipelineReady) {
            peer.abortController.abort();
          } else {
            peer.abort();
          }
        }
        entry.disposePeerChat(chatKey);
      })
    ));
    this._sessions.deleteAndDispose(sessionId);
    for (const chatKey of [...this._chatBackings.keys()]) {
      const parsed = parseChatUri(URI.parse(chatKey));
      if (parsed && AgentSession.id(URI.parse(parsed.session)) === sessionId) {
        this._chatBackings.delete(chatKey);
      }
    }
  }
  // #region Multi-chat — additional (non-default) peer chats
  /**
   * Create an additional peer chat within an existing session. The new chat
   * is backed by its own SDK chat (a fresh one, or a fork of the
   * source chat at a turn) that shares the parent session's working directory
   * and inherited model / agent / permission-mode parentSession. The backing is
   * recorded in the live {@link _chatBackings} map and returned as an opaque
   * `providerData` blob for the orchestrator to persist; the chat's metadata
   * overlay is seeded so a later lazy resume inherits the parent parentSession. The
   * live {@link ClaudeAgentSession} is built lazily on the chat's first send
   * (mirroring how default sessions materialize lazily).
   */
  async _createChat(chat, options) {
    this._ensureAuthenticated();
    if (isDefaultChatUri(chat)) {
      return;
    }
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`[Claude] createChat: malformed chat URI ${chat.toString()}`);
    }
    const session = URI.parse(parsed.session);
    const chatKey = chat.toString();
    const parentSessionId = AgentSession.id(session);
    let result;
    const queueKey = options?.sideChat ? chatKey : parentSessionId;
    await this._sessionSequencer.queue(queueKey, async () => {
      const existing = this._chatBackings.get(chatKey);
      if (existing) {
        result = { providerData: encodeProviderData(existing), backingSession: AgentSession.uri(this.id, existing.sdkSessionId) };
        return;
      }
      const parentSession = await this._resolveParentSession(session, parentSessionId);
      const model = options?.model ?? parentSession.model;
      let sdkSessionId;
      let sideChat;
      if (options?.fork) {
        sdkSessionId = (await this._forkChat(session, options.fork))?.sessionId;
      } else if (options?.sideChat) {
        const forked = await this._forkChat(session, { source: options.sideChat.source, turnId: options.sideChat.providerAnchorTurnId ?? options.sideChat.turnId });
        sdkSessionId = forked?.sessionId;
        const fallbackContext = options.sideChat.sourceContext ?? (!forked ? this._buildSideChatContext(session, options.sideChat.source, options.sideChat.turnId) : void 0);
        if (!forked && !fallbackContext && !options.sideChat.partialResponse) {
          throw new Error(`[Claude] createChat side chat: source turn ${options.sideChat.turnId} could not be forked`);
        }
        sideChat = {
          source: options.sideChat.source.toString(),
          turnId: options.sideChat.turnId,
          ...options.sideChat.selection ? { selection: options.sideChat.selection } : {},
          ...options.sideChat.providerAnchorTurnId ? { providerAnchorTurnId: options.sideChat.providerAnchorTurnId } : {},
          inheritedTurnCount: forked?.inheritedTurnCount ?? 0,
          ...fallbackContext ? { context: fallbackContext } : {},
          ...options.sideChat.partialResponse ? { partialResponse: options.sideChat.partialResponse } : {}
        };
      }
      sdkSessionId ??= generateUuid();
      const backing = { sdkSessionId, ...model ? { model } : {}, ...sideChat ? { sideChat } : {} };
      this._chatBackings.set(chatKey, backing);
      result = { providerData: encodeProviderData(backing), backingSession: AgentSession.uri(this.id, sdkSessionId) };
      await this._metadataStore.write(chat, {
        ...model ? { model } : {},
        ...parentSession.agent ? { agent: parentSession.agent } : {},
        ...parentSession.permissionMode ? { permissionMode: parentSession.permissionMode } : {}
      });
      this._logService.info(`[Claude] Created additional chat ${chat.toString()} in session ${session.toString()}${options?.fork ? " (forked)" : ""}`);
    });
    return result;
  }
  /**
   * Dispose an additional peer chat, tearing down its live chat (if
   * any) and dropping its live backing. The default chat cannot be disposed in
   * isolation — it lives and dies with the session.
   *
   * Routed through {@link _sessionSequencer} (keyed on the chat URI) so it
   * waits for any in-flight {@link _materializeChatLocked} or
   * {@link sendMessage} to finish before tearing down — prevents
   * use-after-dispose if a send is concurrently in progress. The durable
   * peer-chat catalog is owned by the orchestrator now, so this only drops the
   * live backing and chat.
   */
  async _disposeChat(session, chat) {
    if (isDefaultChatUri(chat)) {
      return;
    }
    const chatKey = chat.toString();
    const parentSessionId = AgentSession.id(session);
    await this._sessionSequencer.queue(chatKey, async () => {
      const entry = this._sessions.get(parentSessionId);
      const peer = entry?.getPeerChat(chatKey);
      if (peer) {
        if (!peer.isPipelineReady) {
          peer.abortController.abort();
        } else {
          peer.abort();
        }
        entry.disposePeerChat(chatKey);
      }
      this._chatBackings.delete(chatKey);
    });
  }
  /**
  /**
   * Resolve the inherited session settings (working directory, project, model, agent,
   * permission mode) a new or resumed peer chat copies from its parent
   * session. Prefers the live in-memory parent; falls back to the SDK's
   * on-disk session record + metadata overlay for an unloaded parent.
   */
  async _resolveParentSession(session, parentSessionId) {
    const parent = this._findAnySession(parentSessionId);
    let workingDirectory = parent?.workingDirectory;
    let project = parent?.project;
    if (!workingDirectory) {
      const sdkInfo = await this._sdkService.getSessionInfo(parentSessionId);
      workingDirectory = sdkInfo?.cwd ? URI.file(sdkInfo.cwd) : void 0;
    }
    if (!workingDirectory) {
      throw new Error(`[Claude] createChat: cannot resolve working directory for parent session ${session.toString()}`);
    }
    if (!project) {
      try {
        project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
      } catch (err) {
        this._logService.warn(`[Claude] createChat: project resolution failed for ${session.toString()}; continuing without project`, err);
      }
    }
    let overlay = {};
    try {
      overlay = await this._metadataStore.read(session);
    } catch (err) {
      this._logService.warn(`[Claude] createChat: parent overlay read failed for ${session.toString()}; continuing with defaults`, err);
    }
    const permissionMode = readClaudePermissionMode(this._configurationService, session) ?? overlay.permissionMode ?? "default";
    const additionalDirectories = parent?.workingDirectories?.slice(1) ?? overlay.workingDirectories?.slice(1) ?? [];
    return { workingDirectory, additionalDirectories, project, model: overlay.model, agent: overlay.agent, permissionMode };
  }
  /**
   * Fork the source chat's SDK chat at the requested turn into a new
   * chat and return its SDK session id. Returns `undefined` (so the
   * caller creates a fresh chat instead) when the source chat or the
   * fork anchor cannot be resolved.
   */
  async _forkChat(session, fork) {
    const sourceSdkId = await this._resolveChatSdkId(session, fork.source);
    if (!sourceSdkId) {
      this._logService.warn(`[Claude] createChat fork: source ${fork.source.toString()} has no SDK chat; creating fresh chat`);
      return void 0;
    }
    const messages = await this._sdkService.getSessionMessages(sourceSdkId, { includeSystemMessages: true });
    const upToMessageId = resolveForkAnchorUuid(messages, fork.turnId);
    if (upToMessageId === void 0) {
      this._logService.warn(`[Claude] createChat fork: turn ${fork.turnId} not found in source ${sourceSdkId}; creating fresh chat`);
      return void 0;
    }
    const { sessionId } = await this._sdkService.forkSession(sourceSdkId, { upToMessageId });
    const anchorIndex = messages.findIndex((message) => message.uuid === upToMessageId);
    const inheritedTurnCount = mapSessionMessagesToTurns(messages.slice(0, anchorIndex + 1), fork.source, this._logService).length;
    return { sessionId, inheritedTurnCount };
  }
  /**
   * Resolve the SDK chat id backing a chat URI — the session's
   * default chat (the parent session's own id) or an additional peer chat
   * (from the in-memory entry, else the live/legacy backing).
   */
  async _resolveChatSdkId(session, chatUri) {
    if (isDefaultChatUri(chatUri) || chatUri.toString() === session.toString()) {
      return AgentSession.id(session);
    }
    const inMemory = this._findChat(session, chatUri)?.sessionId;
    if (inMemory) {
      return inMemory;
    }
    return this._resolveChatBacking(chatUri)?.sdkSessionId;
  }
  _getSourceChatState(session, chatUri) {
    if (isDefaultChatUri(chatUri) || chatUri.toString() === session.toString()) {
      return this._stateManager.getDefaultChatState(session.toString());
    }
    return this._stateManager.getChatState(chatUri.toString());
  }
  _buildSideChatContext(session, chatUri, turnId) {
    const state = this._getSourceChatState(session, chatUri);
    if (!state) {
      return void 0;
    }
    const completedIndex = state.turns.findIndex((turn) => turn.id === turnId);
    const boundedTurns = completedIndex >= 0 ? state.turns.slice(0, completedIndex + 1) : state.activeTurn?.id === turnId ? state.turns : void 0;
    return boundedTurns ? buildSideChatSourceContext(boundedTurns, state.activeTurn?.id === turnId ? state.activeTurn : void 0) : void 0;
  }
  /**
   * Resolves the live backing for a peer chat from the in-memory
   * {@link _chatBackings} map. Returns `undefined` for a chat that has not been
   * materialized via {@link materializeChat}.
   */
  _resolveChatBacking(chat) {
    return this._chatBackings.get(chat.toString());
  }
  /**
   * Return the in-memory entry for a session, creating a provisional (not yet
   * materialized) default chat to host its peer chats if none exists — e.g. a
   * peer chat is sent to after a restart before the default chat is touched.
   * Serialized on the session id so concurrent peer sends share one entry.
   */
  _ensureSessionEntry(session) {
    const sessionId = AgentSession.id(session);
    return this._sessionSequencer.queue(sessionId, async () => {
      const existing = this._sessions.get(sessionId);
      if (existing) {
        return existing;
      }
      const parentSession = await this._resolveParentSession(session, sessionId);
      const mainSession = ClaudeAgentSession.createProvisional(
        sessionId,
        session,
        URI.parse(buildDefaultChatUri(session)),
        parentSession.workingDirectory,
        parentSession.project,
        parentSession.model,
        parentSession.agent,
        void 0,
        new PendingRequestRegistry(),
        parentSession.permissionMode,
        this._metadataStore,
        this._instantiationService,
        parentSession.additionalDirectories
      );
      return this._seedSessionEntry(sessionId, session, mainSession);
    });
  }
  /**
   * Build + materialize the peer chat's live {@link ClaudeAgentSession},
   * resuming its persisted SDK chat when one already exists on disk
   * (forked or restored chats) or starting fresh otherwise. The caller MUST
   * hold the per-chat (`chat.toString()`) {@link _sessionSequencer} lock so
   * concurrent first sends collapse into one materialize and teardown can't
   * race the build.
   */
  async _materializeChatLocked(session, chat) {
    const chatKey = chat.toString();
    const entry = await this._ensureSessionEntry(session);
    const existing = entry.getPeerChat(chatKey);
    if (existing?.isPipelineReady) {
      return existing;
    }
    const chatSession = existing ?? await this._buildProvisionalChat(session, chat, entry);
    const sdkInfo = await this._sdkService.getSessionInfo(chatSession.sessionId);
    const transport = this._ensureAuthenticated();
    const canUseTool = this._makeCanUseTool(chatSession.sessionId);
    const onElicitation = this._makeOnElicitation(chatSession.sessionId);
    try {
      await chatSession.materialize({ transport, canUseTool, onElicitation, isResume: !!sdkInfo, serverToolHost: this._serverToolHost });
    } catch (err) {
      entry.disposePeerChat(chatKey);
      throw err;
    }
    return chatSession;
  }
  /**
   * Build a provisional peer-chat {@link ClaudeAgentSession} from its live (or
   * legacy) backing + overlay: its `sessionUri` is the real parent session URI
   * and its `chatChannelUri` is the chat's own channel (never overloaded),
   * backed by the resolved SDK chat id. Registers it on the owning
   * {@link ClaudeSessionEntry}; the caller materializes it.
   */
  async _buildProvisionalChat(session, chat, entry) {
    const info = this._resolveChatBacking(chat);
    if (!info) {
      throw new Error(`[Claude] no backing chat for chat ${chat.toString()}`);
    }
    const parentSession = await this._resolveParentSession(session, AgentSession.id(session));
    let overlay = {};
    try {
      overlay = await this._metadataStore.read(chat);
    } catch (err) {
      this._logService.warn(`[Claude] chat overlay read failed for ${chat.toString()}; continuing with defaults`, err);
    }
    const permissionMode = readClaudePermissionMode(this._configurationService, chat) ?? overlay.permissionMode ?? parentSession.permissionMode;
    const model = overlay.model ?? info.model;
    const chatSession = ClaudeAgentSession.createProvisional(
      info.sdkSessionId,
      session,
      chat,
      parentSession.workingDirectory,
      parentSession.project,
      model,
      overlay.agent ?? parentSession.agent,
      void 0,
      new PendingRequestRegistry(),
      permissionMode,
      this._metadataStore,
      this._instantiationService,
      parentSession.additionalDirectories
    );
    entry.registerPeerChat(chat.toString(), this._wireEntry(chatSession));
    return chatSession;
  }
  /**
   * Update a peer chat's live backing model and push the refreshed opaque
   * `providerData` blob to the orchestrator (via
   * {@link onDidChangeChatData}) so the durable catalog stays in sync.
   */
  async _updateChatBackingModel(chat, model) {
    const backing = this._resolveChatBacking(chat);
    if (!backing) {
      return;
    }
    const updated = { ...backing, model };
    this._chatBackings.set(chat.toString(), updated);
    this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(updated) });
  }
  /**
   * Re-attach the in-memory backing for a peer chat on session restore,
   * decoding the opaque `providerData` the orchestrator persisted at creation
   * (or the latest {@link onDidChangeChatData}). After this resolves the
   * chat's backing SDK chat can be resumed lazily on its first send.
   * Best-effort — a corrupt/unknown blob is logged and dropped rather than
   * thrown.
   */
  async materializeChat(chat, providerData) {
    if (isDefaultChatUri(chat)) {
      return;
    }
    const chatInfo = parseChatUri(chat);
    if (!chatInfo) {
      return;
    }
    if (providerData === void 0) {
      return;
    }
    const backing = decodeProviderData(providerData);
    if (!backing) {
      this._logService.warn(`[Claude] materializeChat: dropping corrupt providerData for ${chat.toString()}`);
      return;
    }
    this._chatBackings.set(chat.toString(), backing);
  }
  // #endregion
  /**
   * Test-only accessor for the materialized {@link ClaudeAgentSession}.
   * Phase 6 section 5.1 Test 10 needs to inspect `_isResumed` directly because
   * Phase 6 has no teardown+recreate flow yet to observe its effect
   * (the flag drives `Options.resume = sessionId` in Phase 7+). Marked
   * `ForTesting` so the production surface stays unaware of its
   * existence; the protocol surface (`IAgent`) does not include it.
   */
  getSessionForTesting(session) {
    const sess = this._sessions.get(AgentSession.id(session))?.defaultChat;
    return sess?.isPipelineReady ? sess : void 0;
  }
  /**
   * Phase 13 — reconstruct the full turn history from the SDK's on-disk
   * JSONL transcript. Out-of-process: no live `Query` required. Subagent
   * URIs (`<parent>/subagent/<toolCallId>`) throw `TODO: Phase 12` until
   * Phase 12 wires `getSubagentMessages`. Provisional sessions return `[]`.
   * Resilient: any failure (transcript fetch, mapping, backfill) warn-logs
   * and returns `[]` rather than propagating — mirrors `listSessions`.
   */
  async getSessionMessages(session) {
    if (!await this._sdkService.canLoadWithoutDownload()) {
      this._logService.info("[Claude] SDK not downloaded yet; deferring session messages until a session triggers the download");
      return [];
    }
    if (isSubagentSession(session)) {
      const parsed = parseSubagentSessionUri(session);
      const parentSession = parsed ? this._sessions.get(AgentSession.id(parsed.parentSession))?.defaultChat : void 0;
      if (!parentSession) {
        this._logService.warn(`[Claude] getSessionMessages: parent session not found for subagent ${session.toString()} (registry unavailable)`);
        return [];
      }
      try {
        return await getSubagentTranscript(session, parentSession.subagents, this._sdkService, this._logService, CancellationToken.None);
      } catch (err) {
        this._logService.warn(`[Claude] getSubagentTranscript threw for ${session.toString()}`, err);
        return [];
      }
    }
    const chat = parseChatUri(session) ? session : URI.parse(buildDefaultChatUri(session));
    const chatInfo = parseChatUri(chat);
    if (!chatInfo) {
      return [];
    }
    const parentSessionUri = URI.parse(chatInfo.session);
    const sessionId = AgentSession.id(parentSessionUri);
    const context = this._getChatContext(chat);
    if (context.isPeerChat) {
      const sdkId = await this._resolveChatSdkId(parentSessionUri, chat);
      if (!sdkId) {
        return [];
      }
      const turns = await this._reconstructTurns(sdkId, chat, context.target);
      const sideChat = this._resolveChatBacking(chat)?.sideChat;
      return stripSideChatContext(turns.slice(sideChat?.inheritedTurnCount ?? 0), sideChat);
    }
    const sess = context.target;
    if (sess && !sess.isPipelineReady) {
      this._logService.info(`[Claude] getSessionMessages: chat ${chat.toString()} is not materialized yet; returning no turns`);
      return [];
    }
    return this._reconstructTurns(sessionId, parentSessionUri, sess);
  }
  /**
   * Fetch a chat's SDK transcript ({@link sdkSessionId}) and map it to
   * protocol {@link Turn}s routed to {@link routingUri} (the session or chat
   * channel URI). When {@link primeOn} is supplied (the materialized owning
   * session), its subagent registry is primed from the agentId suffixes the
   * SDK encoded in Task tool_result blocks. Resilient: any failure warn-logs
   * and returns `[]` rather than propagating.
   */
  async _reconstructTurns(sdkSessionId, routingUri, primeOn) {
    let messages;
    try {
      messages = await this._sdkService.getSessionMessages(sdkSessionId, { includeSystemMessages: true });
    } catch (err) {
      this._logService.warn(`[Claude] getSessionMessages SDK fetch failed for ${sdkSessionId}`, err);
      return [];
    }
    let turns;
    try {
      turns = mapSessionMessagesToTurns(messages, routingUri, this._logService);
    } catch (err) {
      this._logService.warn(`[Claude] replay mapper threw for ${sdkSessionId}`, err);
      return [];
    }
    if (turns.length === 0 && messages.length > 0) {
      this._logService.warn(`[Claude] replay produced no turns from ${messages.length} transcript message(s) for ${sdkSessionId}; chat will render empty`);
    }
    try {
      primeOn?.subagents.primeFromTranscript(turns);
    } catch (err) {
      this._logService.warn(`[Claude] primeFromTranscript threw for ${sdkSessionId}`, err);
    }
    return turns;
  }
  async listSessions() {
    let sdkEntries;
    try {
      if (!await this._sdkService.canLoadWithoutDownload()) {
        this._logService.info("[Claude] SDK not downloaded yet; deferring session list until a session triggers the download");
        return [];
      }
      sdkEntries = await this._sdkService.listSessions();
    } catch (err) {
      this._logService.warn("[Claude] SDK listSessions failed; surfacing empty list", err);
      return [];
    }
    return Promise.all(sdkEntries.map((entry) => {
      const meta = this._metadataStore.project(entry);
      return this._withPersistedWorkingDirectories(meta.session, meta);
    }));
  }
  /**
   * Phase 6.1 / Cycle D4 — per-session lookup. Mirrors
   * {@link CopilotAgent.getSessionMetadata} but accepts the
   * external-CLI case: a session that exists on disk via the raw
   * Anthropic CLI has no per-session DB, so we MUST NOT gate on the
   * sidecar (the way Copilot's variant does). The SDK is the source
   * of truth for existence.
   *
   * The SDK entry supplies the authoritative primary directory; an optional
   * per-session overlay hydrates the additional-directory tail. External
   * sessions without an overlay remain valid single-root entries. Failures in
   * the SDK lookup propagate (the caller is doing a single targeted fetch and
   * should learn that the SDK module is broken).
   */
  async getSessionMetadata(session) {
    if (!await this._sdkService.canLoadWithoutDownload()) {
      this._logService.info("[Claude] SDK not downloaded yet; deferring session metadata until a session triggers the download");
      return void 0;
    }
    const sessionId = AgentSession.id(session);
    const sdkInfo = await this._sdkService.getSessionInfo(sessionId);
    if (!sdkInfo) {
      return void 0;
    }
    return this._withPersistedWorkingDirectories(session, this._metadataStore.project(sdkInfo));
  }
  /**
   * Merge the persisted additional working directories (index 1..N) onto a
   * projected metadata's `workingDirectories`, keeping the SDK-derived `cwd`
   * as the authoritative primary. The SDK catalog only stores `cwd`, so the
   * tail of a multi-root session lives in the per-session overlay. Sessions
   * without an overlay (external Claude CLI, single-root) are returned as-is.
   */
  async _withPersistedWorkingDirectories(session, meta) {
    const primary = meta.workingDirectories?.[0];
    if (!primary) {
      return meta;
    }
    let overlay = {};
    try {
      overlay = await this._metadataStore.read(session);
    } catch (err) {
      this._logService.warn(`[Claude] overlay read failed while hydrating working directories for ${session.toString()}; using SDK cwd only`, err);
    }
    const tail = overlay.workingDirectories?.slice(1) ?? [];
    if (tail.length === 0) {
      return meta;
    }
    return { ...meta, workingDirectories: [primary, ...tail] };
  }
  resolveSessionConfig(_params) {
    const sessionSchema = createSchema({
      [ClaudeSessionConfigKey.PermissionMode]: schemaProperty({
        type: "string",
        title: localize("claude.sessionConfig.permissionMode", "Approvals"),
        description: localize("claude.sessionConfig.permissionModeDescription", "How Claude handles tool approvals."),
        enum: ["default", "acceptEdits", "plan", "auto", "bypassPermissions"],
        enumLabels: [
          localize("claude.sessionConfig.permissionMode.default", "Ask Before Edits"),
          localize("claude.sessionConfig.permissionMode.acceptEdits", "Edit Automatically"),
          localize("claude.sessionConfig.permissionMode.plan", "Plan Mode"),
          localize("claude.sessionConfig.permissionMode.auto", "Auto Mode"),
          localize("claude.sessionConfig.permissionMode.bypassPermissions", "Bypass Permissions")
        ],
        enumDescriptions: [
          localize("claude.sessionConfig.permissionMode.defaultDescription", "Claude asks before editing files."),
          localize("claude.sessionConfig.permissionMode.acceptEditsDescription", "Claude edits files without asking, and asks before using other tools."),
          localize("claude.sessionConfig.permissionMode.planDescription", "Claude creates a plan before making changes."),
          localize("claude.sessionConfig.permissionMode.autoDescription", "Claude decides whether to ask for each tool operation."),
          localize("claude.sessionConfig.permissionMode.bypassPermissionsDescription", "Claude runs all tools without asking.")
        ],
        default: "default",
        sessionMutable: true
      }),
      [SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions]
    });
    const values = sessionSchema.validateOrDefault(_params.config, {
      [ClaudeSessionConfigKey.PermissionMode]: "default"
      // Permissions intentionally omitted from defaults — leave
      // unset so auto-approval falls through to the host-level
      // default, materializing on the session only once the user
      // approves a tool "in this Session".
    });
    return Promise.resolve({
      schema: sessionSchema.toProtocol(),
      values
    });
  }
  sessionConfigCompletions(_params) {
    return Promise.resolve({ items: [] });
  }
  shutdown() {
    return this._shutdownPromise ??= (async () => {
      for (const entry of this._sessions.values()) {
        for (const chat of entry.allChatSessions()) {
          if (!chat.isPipelineReady) {
            chat.abortController.abort();
          }
        }
      }
      const sessionIds = [...this._sessions.keys()];
      await Promise.all(sessionIds.map(
        (sessionId) => this._disposeSequencer.queue(sessionId, async () => {
          await this._teardownEntry(sessionId);
          this._pruneActiveClientHandles(sessionId);
        })
      ));
    })();
  }
  async _sendMessage(chat, prompt, workingDirectories, attachments, turnId, _senderClientId) {
    const effectiveTurnId = turnId ?? generateUuid();
    const context = this._getChatContext(chat);
    if (context.isPeerChat) {
      return this._sessionSequencer.queue(context.chatKey, async () => {
        const chatSession = await this._materializeChatLocked(context.session, chat);
        const sideChat = this._resolveChatBacking(chat)?.sideChat;
        const turns = sideChat ? await this._reconstructTurns(chatSession.sessionId, chat, chatSession) : [];
        const sdkPrompt = prepareSideChatPrompt(prompt, turns, sideChat);
        await chatSession.send(this._buildSdkPrompt(chatSession.sessionId, sdkPrompt, attachments, effectiveTurnId), effectiveTurnId);
      });
    }
    return this._sessionSequencer.queue(context.sessionId, async () => {
      const existing = this._getChatContext(chat).target;
      let session;
      if (existing?.isPipelineReady) {
        session = existing;
      } else if (existing) {
        session = await this._materializeProvisional(context.sessionId, workingDirectories);
      } else {
        session = await this._resumeSession(context.sessionId, context.session, workingDirectories);
      }
      await session.send(this._buildSdkPrompt(context.sessionId, prompt, attachments, effectiveTurnId), effectiveTurnId);
    });
  }
  /** Builds the SDK user message for a send, addressed to `sdkSessionId`. */
  _buildSdkPrompt(sdkSessionId, prompt, attachments, turnId) {
    const contentBlocks = resolvePromptToContentBlocks(prompt, attachments);
    return {
      type: "user",
      message: { role: "user", content: contentBlocks },
      session_id: sdkSessionId,
      parent_tool_use_id: null,
      // M1 / Glossary: `Turn.id ↔ SDKUserMessage.uuid`. The SDK types this
      // as a branded `${string}-…` template-literal alias of Node's
      // `crypto.UUID`; cast at the boundary rather than threading the brand
      // up to every caller.
      uuid: turnId
    };
  }
  respondToPermissionRequest(requestId, approved) {
    for (const sess of this._allLiveSessions()) {
      if (sess.respondToPermissionRequest(requestId, approved)) {
        return;
      }
    }
  }
  respondToUserInputRequest(requestId, response, answers) {
    for (const sess of this._allLiveSessions()) {
      if (sess.respondToUserInputRequest(requestId, response, answers)) {
        return;
      }
    }
  }
  /** Every live chat — each session's default chat and its peers. */
  _allLiveSessions() {
    const all = [];
    for (const entry of this._sessions.values()) {
      all.push(...entry.allChatSessions());
    }
    return all;
  }
  async _abortSession(chat) {
    const sess = this._getChatContext(chat).target;
    if (!sess) {
      return;
    }
    if (!sess.isPipelineReady) {
      sess.abortController.abort();
      return;
    }
    sess.abort();
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    const context = this._getChatContext(chat);
    this._logService.info(`[Claude] setPendingMessages for ${chat.toString()}: steering=${steeringMessage?.id ?? "none"} queued=${_queuedMessages.length}`);
    if (!context.target) {
      this._logService.warn(`[Claude] setPendingMessages: chat not found for ${chat.toString()}`);
      return;
    }
    if (steeringMessage) {
      context.target.injectSteering(steeringMessage);
    }
  }
  /**
   * Forward a user/picker `permissionMode` change to the running SDK so it
   * applies to the next tool this turn, not only from the next `send()`
   * (issue #321691). Only fires for client-originated changes (the host routes
   * internal server writes elsewhere), so this can forward without re-entering
   * a `canUseTool` callback.
   *
   * `permissionMode` is a **session-scoped** config value today (AHP has no
   * per-chat config), so — matching Copilot's session-scoped approvals — we
   * apply it to EVERY materialized chat's `Query` in the session, not just the
   * one the change arrived on. A `replace` that deletes the key resolves to the
   * chat's `permissionModeFallback`, the same value the next `send()` would
   * apply, so live state mirrors the reducer. Provisional chats are skipped —
   * their first `send()` seeds the mode into `Options.permissionMode`. Fire-and-
   * forget: the SDK control round-trip isn't awaited here; the pipeline caches
   * the mode so a later rebind / send re-applies it.
   *
   * TODO: adopt per-chat config when the protocol allows for such — see
   * https://github.com/microsoft/agent-host-protocol/issues/335 — so a picker
   * change scopes to its own chat instead of the whole session.
   */
  onSessionConfigChanged(session, values) {
    const entry = this._sessions.get(this._getChatContext(session).sessionId);
    if (!entry) {
      return;
    }
    const narrowed = narrowClaudePermissionMode(values[ClaudeSessionConfigKey.PermissionMode]);
    for (const chat of entry.allChatSessions()) {
      if (!chat.isPipelineReady) {
        continue;
      }
      const mode = narrowed ?? chat.permissionModeFallback;
      chat.setPermissionMode(mode).catch((err) => {
        this._logService.warn(`[Claude:${chat.sessionId}] mid-turn setPermissionMode(${mode}) failed`, err);
      });
    }
  }
  async _changeModel(chat, model) {
    const context = this._getChatContext(chat);
    const queueKey = context.isPeerChat ? context.chatKey : context.sessionId;
    await this._sessionSequencer.queue(queueKey, async () => {
      const current = this._getChatContext(chat);
      const sess = current.target;
      if (sess) {
        await sess.setModel(model);
      } else if (current.isPeerChat) {
        await this._metadataStore.write(chat, { model });
      } else {
        await this._metadataStore.write(current.session, { model });
      }
      if (current.isPeerChat) {
        await this._updateChatBackingModel(chat, model);
      }
    });
  }
  /**
   * Switch (or clear with `undefined`) the selected custom agent for an
   * existing session. Mirrors {@link changeModel}: session owns its
   * provisional/runtime branching and metadata write
   * (see {@link ClaudeAgentSession.setAgent}). For external-only
   * sessions (no in-memory record), the agent is persisted directly to
   * the overlay so a later resume picks it up. When `chat` is an additional
   * peer chat, the change targets that chat's chat.
   */
  async _changeAgent(chat, agent) {
    const context = this._getChatContext(chat);
    const queueKey = context.isPeerChat ? context.chatKey : context.sessionId;
    await this._sessionSequencer.queue(queueKey, async () => {
      const current = this._getChatContext(chat);
      const sess = current.target;
      if (sess) {
        await sess.setAgent(agent);
      } else {
        await this._metadataStore.write(current.isPeerChat ? chat : current.session, { agent: agent ?? null });
      }
    });
  }
  setServerToolHost(host) {
    this._serverToolHost = host;
  }
  getOrCreateActiveClient(session, client) {
    const sessionId = AgentSession.id(session);
    const key = `${sessionId}\0${client.clientId}`;
    let handle = this._activeClientHandles.get(key);
    if (!handle) {
      handle = new ClaudeActiveClientHandle(
        client.clientId,
        client.displayName,
        () => this._findAnySession(sessionId)?.getClientTools(client.clientId) ?? [],
        (tools) => {
          this._logService.info(`[Claude:${sessionId}] active client ${client.clientId} tools=[${tools.map((t) => t.name).join(", ") || "(none)"}]`);
          this._findAnySession(sessionId)?.setClientTools(client.clientId, tools);
        },
        (customizations) => {
          void this.syncClientCustomizations(session, client.clientId, [...customizations]);
        }
      );
      this._activeClientHandles.set(key, handle);
    }
    return handle;
  }
  removeActiveClient(session, clientId) {
    const sessionId = AgentSession.id(session);
    this._activeClientHandles.delete(`${sessionId}\0${clientId}`);
    this._findAnySession(sessionId)?.removeClientTools(clientId);
    void this._sessionSequencer.queue(sessionId, async () => {
      this._findAnySession(sessionId)?.removeClientCustomizations(clientId);
    }).catch(() => {
    });
  }
  /** Drop cached active-client handles belonging to a session being torn down. */
  _pruneActiveClientHandles(sessionId) {
    const prefix = `${sessionId}\0`;
    for (const key of [...this._activeClientHandles.keys()]) {
      if (key.startsWith(prefix)) {
        this._activeClientHandles.delete(key);
      }
    }
  }
  onClientToolCallComplete(session, _chat, toolCallId, result) {
    let target = session;
    let parsed;
    while (parsed = parseSubagentSessionUri(target)) {
      target = parsed.parentSession;
    }
    const sessionId = AgentSession.id(target);
    const entry = this._sessions.get(sessionId);
    entry?.defaultChat?.completeClientToolCall(toolCallId, result);
  }
  async syncClientCustomizations(session, clientId, customizations, options) {
    const sessionId = AgentSession.id(session);
    const sess = this._findAnySession(sessionId);
    if (!sess) {
      this._logService.warn(`[Claude:${sessionId}] syncClientCustomizations: session not found`);
      return [];
    }
    return this._sessionSequencer.queue(sessionId, async () => {
      const synced = await this._pluginManager.syncCustomizations(
        clientId,
        customizations,
        options?.quiet ? void 0 : (status) => this._fireCustomizationUpdated(session, { customization: status })
      );
      sess.adoptClientCustomizations(clientId, synced);
      return synced;
    });
  }
  /**
   * Project a per-item sync result onto a `SessionCustomizationUpdated`
   * action and emit it on {@link onDidSessionProgress}. Lets the workbench
   * flip each row to `Loaded` / `Error` as the underlying
   * {@link IAgentPluginManager.syncCustomizations} resolves it.
   */
  _fireCustomizationUpdated(session, item) {
    this._onDidSessionProgress.fire({
      kind: "action",
      resource: session,
      action: {
        type: ActionType.SessionCustomizationUpdated,
        customization: item.customization
      }
    });
  }
  getCustomizations() {
    return [];
  }
  async getSessionCustomizations(session) {
    const sess = this._findAnySession(AgentSession.id(session));
    return sess ? await sess.getSessionCustomizations() : [];
  }
  async startMcpServer(session, id) {
    const sess = this._findAnySession(AgentSession.id(session));
    await sess?.startMcpServer(id);
  }
  async stopMcpServer(session, id) {
    const sess = this._findAnySession(AgentSession.id(session));
    await sess?.stopMcpServer(id);
  }
  // #endregion
  dispose() {
    for (const entry of this._sessions.values()) {
      for (const chat of entry.allChatSessions()) {
        if (!chat.isPipelineReady) {
          chat.abortController.abort();
        }
      }
    }
    super.dispose();
    this._proxyHandle?.dispose();
    this._proxyHandle = void 0;
    this._githubToken = void 0;
    this._models.set([], void 0);
  }
};
ClaudeAgent = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService),
  __decorateParam(2, IClaudeProxyService),
  __decorateParam(3, IClaudeAgentSdkService),
  __decorateParam(4, IAgentHostStateManager),
  __decorateParam(5, IAgentHostOTelService),
  __decorateParam(6, IAgentHostGitService),
  __decorateParam(7, IAgentConfigurationService),
  __decorateParam(8, IAgentHostGitHubEndpointService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IAgentPluginManager),
  __decorateParam(11, IProductService),
  __decorateParam(12, INativeEnvironmentService)
], ClaudeAgent);
class ClaudeSessionEntry extends AgentSessionEntry {
  /** Claude sessions always have a materialized default chat once seeded. */
  get defaultChat() {
    return super.defaultChat;
  }
}
export {
  ClaudeAgent,
  fromSdkModelInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jbGF1ZGVBZ2VudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCB0eXBlIHsgTW9kZWxJbmZvLCBPbkVsaWNpdGF0aW9uLCBPcHRpb25zLCBTREtTZXNzaW9uSW5mbywgU0RLVXNlck1lc3NhZ2UgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHR5cGUgeyBDYWxsVG9vbFJlc3VsdCB9IGZyb20gJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvdHlwZXMuanMnO1xuaW1wb3J0IHsgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luTWFuYWdlciwgSVN5bmNlZEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbkVudHJ5LCBidWlsZFNpZGVDaGF0U291cmNlQ29udGV4dCwgZGVjb2RlUHJvdmlkZXJEYXRhLCBlbmNvZGVQcm92aWRlckRhdGEsIHByZXBhcmVTaWRlQ2hhdFByb21wdCwgc3RyaXBTaWRlQ2hhdENvbnRleHQsIHR5cGUgSVBlcnNpc3RlZENoYXQgfSBmcm9tICcuLi9hZ2VudFBlZXJDaGF0cy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb25maWdLZXksIGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5LCBjcmVhdGVTY2hlbWEsIHBsYXRmb3JtUm9vdFNjaGVtYSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBzY2hlbWFQcm9wZXJ0eSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUGVybWlzc2lvbk1vZGUsIENsYXVkZVNlc3Npb25Db25maWdLZXksIG5hcnJvd0NsYXVkZVBlcm1pc3Npb25Nb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NsYXVkZVNlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNsYXVkZVRoaW5raW5nTGV2ZWxTY2hlbWEsIGlzQ2xhdWRlRWZmb3J0TGV2ZWwgfSBmcm9tICcuLi8uLi9jb21tb24vY2xhdWRlTW9kZWxDb25maWcuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBBZ2VudFByb3ZpZGVyLCBBZ2VudFNlc3Npb24sIEFnZW50U2lnbmFsLCBDTEFVREVfQUdFTlRfUFJPVklERVJfSUQsIElBY3RpdmVDbGllbnQsIElBZ2VudCwgSUFnZW50Q2hhdERhdGFDaGFuZ2UsIElBZ2VudENoYXRzLCBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsIElBZ2VudENyZWF0ZUNoYXRSZXN1bHQsIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQsIElBZ2VudERlc2NyaXB0b3IsIElBZ2VudE1hdGVyaWFsaXplU2Vzc2lvbkV2ZW50LCBJQWdlbnRNb2RlbEluZm8sIElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zLCBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMsIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgSUFnZW50U2Vzc2lvblByb2plY3RJbmZvLCBJQWdlbnRTcGF3bkNoYXRFdmVudCwgU3ViYWdlbnRDaGF0U2lnbmFsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVXb3Jrc3BhY2VsZXNzU2NyYXRjaERpciB9IGZyb20gJy4uL3dvcmtzcGFjZWxlc3NTY3JhdGNoRGlyLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIEF1dGhSZXF1aXJlZFJlYXNvbiwgdHlwZSBBdXRoUmVxdWlyZWRQYXJhbXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCwgU2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFIUF9BVVRIX1JFUVVJUkVELCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBQb2xpY3lTdGF0ZSwgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgdHlwZSBBZ2VudFNlbGVjdGlvbiwgdHlwZSBNb2RlbFNlbGVjdGlvbiwgdHlwZSBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBpc1N1YmFnZW50U2Vzc2lvbiwgcGFyc2VTdWJhZ2VudFNlc3Npb25VcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIHBhcnNlQ2hhdFVyaSwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSwgaXNEZWZhdWx0Q2hhdFVyaSwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgUGVuZGluZ01lc3NhZ2UsIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIFRvb2xDYWxsUmVzdWx0LCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQgfSBmcm9tICcuLi9jb3BpbG90L2NvcGlsb3RHaXRQcm9qZWN0LmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4uL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlIH0gZnJvbSAnLi9jbGF1ZGVBZ2VudFNka1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRNb2RlbEVudW1lcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4vY2xhdWRlU2RrT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zLCByZXNvbHZlRm9ya0FuY2hvclV1aWQgfSBmcm9tICcuL2NsYXVkZVJlcGxheU1hcHBlci5qcyc7XG5pbXBvcnQgeyBnZXRTdWJhZ2VudFRyYW5zY3JpcHQgfSBmcm9tICcuL2NsYXVkZVN1YmFnZW50UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQ2xhdWRlQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi9jbGF1ZGVBZ2VudFNlc3Npb24uanMnO1xuaW1wb3J0IHsgaGFuZGxlQ2FuVXNlVG9vbCB9IGZyb20gJy4vY2xhdWRlQ2FuVXNlVG9vbC5qcyc7XG5pbXBvcnQgeyBoYW5kbGVFbGljaXRhdGlvbiB9IGZyb20gJy4vY2xhdWRlRWxpY2l0YXRpb25CcmlkZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRTZXJ2ZXJUb29sSG9zdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZlclRvb2xzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVByaWNpbmdNZXRhRnJvbUJpbGxpbmcsIG5vcm1hbGl6ZUNBUElCaWxsaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50TW9kZWxQcmljaW5nLmpzJztcbmltcG9ydCB7IHRyeVBhcnNlQ2xhdWRlTW9kZWxJZCB9IGZyb20gJy4vY2xhdWRlTW9kZWxJZC5qcyc7XG5pbXBvcnQgeyByZXNvbHZlUHJvbXB0VG9Db250ZW50QmxvY2tzIH0gZnJvbSAnLi9jbGF1ZGVQcm9tcHRSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQ2xhdWRlUHJveHlIYW5kbGUsIElDbGF1ZGVQcm94eVNlcnZpY2UsIHR5cGUgQ2xhdWRlVHJhbnNwb3J0IH0gZnJvbSAnLi9jbGF1ZGVQcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVhZENsYXVkZVBlcm1pc3Npb25Nb2RlIH0gZnJvbSAnLi9jbGF1ZGVTZXNzaW9uUGVybWlzc2lvbk1vZGUuanMnO1xuaW1wb3J0IHsgQ2xhdWRlU2Vzc2lvbk1ldGFkYXRhU3RvcmUsIElDbGF1ZGVTZXNzaW9uT3ZlcmxheSB9IGZyb20gJy4vY2xhdWRlU2Vzc2lvbk1ldGFkYXRhU3RvcmUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcblxuY29uc3QgVVNFUl9BR0VOVF9QUkVGSVggPSAndnNjb2RlX2NsYXVkZV9jb2RlJztcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgYG1gIGlzIGEgQ2xhdWRlLWZhbWlseSBtb2RlbCB0aGF0IHNob3VsZCBiZSBhZHZlcnRpc2VkXG4gKiB0byBjbGllbnRzIHBpY2tpbmcgYSBtb2RlbCBmb3IgdGhlIENsYXVkZSBwcm92aWRlci5cbiAqXG4gKiBDb21iaW5lcyB0aGUgc2FtZSBzdXJmYWNlIGNoZWNrcyB0aGUgZXh0ZW5zaW9uIHVzZXMgKHZlbmRvciwgcGlja2VyXG4gKiBlbGlnaWJpbGl0eSwgdG9vbC1jYWxsIHN1cHBvcnQsIGAvdjEvbWVzc2FnZXNgIGVuZHBvaW50KSB3aXRoIGEgcGFyc2VcbiAqIG9mIHRoZSBtb2RlbCBpZCB2aWEge0BsaW5rIHRyeVBhcnNlQ2xhdWRlTW9kZWxJZH0sIHdoaWNoIGV4Y2x1ZGVzXG4gKiBzeW50aGV0aWMgaWRzIGxpa2UgYGF1dG9gIHRoYXQgYXJlbid0IHJlYWwgQ2xhdWRlIGVuZHBvaW50cy5cbiAqL1xuZnVuY3Rpb24gaXNDbGF1ZGVNb2RlbChtOiBDQ0FNb2RlbCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKFxuXHRcdG0udmVuZG9yID09PSAnQW50aHJvcGljJyAmJlxuXHRcdCEhbS5zdXBwb3J0ZWRfZW5kcG9pbnRzPy5pbmNsdWRlcygnL3YxL21lc3NhZ2VzJykgJiZcblx0XHQhIW0ubW9kZWxfcGlja2VyX2VuYWJsZWQgJiZcblx0XHQhIW0uY2FwYWJpbGl0aWVzPy5zdXBwb3J0cz8udG9vbF9jYWxscyAmJlxuXHRcdHRyeVBhcnNlQ2xhdWRlTW9kZWxJZChtLmlkKSAhPT0gdW5kZWZpbmVkXG5cdCk7XG59XG5cbi8qKlxuICogQXVnbWVudHMgdGhlIHB1Ymxpc2hlZCBgQHZzY29kZS9jb3BpbG90LWFwaWAgYENDQU1vZGVsU3VwcG9ydHNgIHdpdGggdGhlXG4gKiBwZXItbW9kZWwgYGFkYXB0aXZlX3RoaW5raW5nYCAvIGByZWFzb25pbmdfZWZmb3J0YCBmaWVsZHMgdGhlIHJ1bnRpbWVcbiAqIENBUEkgYC9tb2RlbHNgIHBheWxvYWQgYWxyZWFkeSBjYXJyaWVzIGJ1dCB0aGUgU0RLIHR5cGUgZG9lc24ndCB5ZXRcbiAqIGRlY2xhcmUuIFRyYWNrZWQgYXQgbWljcm9zb2Z0L3ZzY29kZS1jYXBpIzg1OyByZW1vdmUgdGhpcyB3aGVuIHRoZSBTREtcbiAqIGNhdGNoZXMgdXAuIE1pcnJvciBvZiB0aGUgc2FtZSBwYXR0ZXJuIGF0XG4gKiBgZXh0ZW5zaW9ucy9jb3BpbG90L3NyYy9wbGF0Zm9ybS9lbmRwb2ludC9jb21tb24vZW5kcG9pbnRQcm92aWRlci50c2BcbiAqIChpdHMgbG9jYWxseS1kZWNsYXJlZCBgSUNoYXRNb2RlbENhcGFiaWxpdGllc2ApLlxuICovXG5pbnRlcmZhY2UgSUNsYXVkZU1vZGVsU3VwcG9ydHMge1xuXHRyZWFkb25seSBhZGFwdGl2ZV90aGlua2luZz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlYXNvbmluZ19lZmZvcnQ/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBQcm9qZWN0IGEge0BsaW5rIENDQU1vZGVsfSBpbnRvIHRoZSBhZ2VudCBob3N0J3NcbiAqIHtAbGluayBJQWdlbnRNb2RlbEluZm99IHN1cmZhY2UuIFRoZSByZXR1cm5lZCBgcHJvdmlkZXJgIGlzIHRoZVxuICogYWdlbnQncyBpZCAoYCdjbGF1ZGUnYCkgXHUyMDE0IGNsaWVudHMgZmlsdGVyIHRoZSByb290IHN0YXRlJ3MgbW9kZWwgbGlzdFxuICogYnkgcHJvdmlkZXIsIHNvIHRoaXMgbXVzdCBtYXRjaCB7QGxpbmsgQ2xhdWRlQWdlbnQuaWR9LCBOT1QgdGhlXG4gKiB1cHN0cmVhbSBgdmVuZG9yOiAnQW50aHJvcGljJ2AgZmllbGQuXG4gKi9cbmZ1bmN0aW9uIHRvQWdlbnRNb2RlbEluZm8obTogQ0NBTW9kZWwsIHByb3ZpZGVyOiBBZ2VudFByb3ZpZGVyKTogSUFnZW50TW9kZWxJbmZvIHtcblx0Y29uc3Qgc3VwcG9ydHMgPSBtLmNhcGFiaWxpdGllcz8uc3VwcG9ydHM7XG5cdGNvbnN0IHN1cHBvcnRlZEVmZm9ydHMgPSAoKHN1cHBvcnRzIGFzIElDbGF1ZGVNb2RlbFN1cHBvcnRzIHwgdW5kZWZpbmVkKT8ucmVhc29uaW5nX2VmZm9ydCA/PyBbXSkuZmlsdGVyKGlzQ2xhdWRlRWZmb3J0TGV2ZWwpO1xuXHRjb25zdCBjb25maWdTY2hlbWEgPSBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hKHN1cHBvcnRlZEVmZm9ydHMpO1xuXHRjb25zdCBwb2xpY3lTdGF0ZSA9IG0ucG9saWN5Py5zdGF0ZSBhcyBQb2xpY3lTdGF0ZSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgYmlsbGluZyA9IG5vcm1hbGl6ZUNBUElCaWxsaW5nKG0uYmlsbGluZyk7XG5cdC8vIHByaWNlQ2F0ZWdvcnkgbWF5IGFwcGVhciBhcyBhIHRvcC1sZXZlbCBtb2RlbCBmaWVsZCBkZXBlbmRpbmcgb24gdGhlIENBUEkgdmVyc2lvbi5cblx0Y29uc3QgcHJpY2VDYXRlZ29yeSA9IHR5cGVvZiBtLm1vZGVsX3BpY2tlcl9wcmljZV9jYXRlZ29yeSA9PT0gJ3N0cmluZydcblx0XHQ/IG0ubW9kZWxfcGlja2VyX3ByaWNlX2NhdGVnb3J5XG5cdFx0OiB1bmRlZmluZWQ7XG5cdHJldHVybiB7XG5cdFx0cHJvdmlkZXIsXG5cdFx0Ly8gQ0FQSS9lbmRwb2ludCBmb3JtYXQsIGRvdHRlZCB2ZXJzaW9uIChlLmcuIGBjbGF1ZGUtaGFpa3UtNC41YCkgXHUyMDE0IHRoZVxuXHRcdC8vIGNhbm9uaWNhbCBpZCB0aHJvdWdoIGBNb2RlbFNlbGVjdGlvbi5pZGAuIENvbnZlcnQgdG8gU0RLIGZvcm1hdCBhdCBTREtcblx0XHQvLyBzZWFtcyB2aWEgYHRvU2RrTW9kZWxJZGAuXG5cdFx0aWQ6IG0uaWQsXG5cdFx0bmFtZTogbS5uYW1lLFxuXHRcdG1heENvbnRleHRXaW5kb3c6IG0uY2FwYWJpbGl0aWVzPy5saW1pdHM/Lm1heF9jb250ZXh0X3dpbmRvd190b2tlbnMsXG5cdFx0bWF4T3V0cHV0VG9rZW5zOiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfb3V0cHV0X3Rva2Vucyxcblx0XHRtYXhQcm9tcHRUb2tlbnM6IG0uY2FwYWJpbGl0aWVzPy5saW1pdHM/Lm1heF9wcm9tcHRfdG9rZW5zLFxuXHRcdHN1cHBvcnRzVmlzaW9uOiAhIXN1cHBvcnRzPy52aXNpb24sXG5cdFx0Li4uKGNvbmZpZ1NjaGVtYSA/IHsgY29uZmlnU2NoZW1hIH0gOiB7fSksXG5cdFx0Li4uKHBvbGljeVN0YXRlID8geyBwb2xpY3lTdGF0ZSB9IDoge30pLFxuXHRcdF9tZXRhOiBjcmVhdGVQcmljaW5nTWV0YUZyb21CaWxsaW5nKGJpbGxpbmcsIHByaWNlQ2F0ZWdvcnkpLFxuXHR9O1xufVxuXG4vKipcbiAqIFByb2plY3QgYW4gU0RLIHtAbGluayBNb2RlbEluZm99IGludG8gdGhlIGFnZW50IGhvc3Qnc1xuICoge0BsaW5rIElBZ2VudE1vZGVsSW5mb30gc3VyZmFjZSBmb3IgdGhlIG5hdGl2ZSAoQllPLUFudGhyb3BpYykgdHJhbnNwb3J0LlxuICogQ2FycmllcyBOTyBjb21tZXJjaWFsIG1ldGFkYXRhIChubyBgcG9saWN5U3RhdGVgLCBubyBwcmljaW5nIGBfbWV0YWApIFx1MjAxNFxuICogdGhvc2UgYXJlIENvcGlsb3QvQ0FQSSBjb25jZXB0cy4gUmV1c2VzIHRoZSBzaGFyZWQgZWZmb3J0LXNjaGVtYSBoZWxwZXJzIHNvXG4gKiB0aGUgdGhpbmtpbmctbGV2ZWwgcGlja2VyIG1hdGNoZXMgdGhlIHByb3hpZWQgcHJvamVjdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21TZGtNb2RlbEluZm8obTogTW9kZWxJbmZvLCBwcm92aWRlcjogQWdlbnRQcm92aWRlcik6IElBZ2VudE1vZGVsSW5mbyB7XG5cdGNvbnN0IHN1cHBvcnRlZEVmZm9ydHMgPSAobS5zdXBwb3J0ZWRFZmZvcnRMZXZlbHMgPz8gW10pLmZpbHRlcihpc0NsYXVkZUVmZm9ydExldmVsKTtcblx0Y29uc3QgY29uZmlnU2NoZW1hID0gY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShzdXBwb3J0ZWRFZmZvcnRzKTtcblx0cmV0dXJuIHtcblx0XHRwcm92aWRlcixcblx0XHQvLyBTREstY2Fub25pY2FsIGlkIChgbS52YWx1ZWAsIGUuZy4gYGNsYXVkZS1zb25uZXQtNC01LTIwMjUwOTI5YCkuIE5hdGl2ZVxuXHRcdC8vIGlkcyBhcmUgU0RLIGZvcm1hdCBlbmQgdG8gZW5kOyBgdG9TZGtNb2RlbElkYCBpcyBpZGVudGl0eSBhdCB0aGlzIHNlYW0uXG5cdFx0aWQ6IG0udmFsdWUsXG5cdFx0bmFtZTogbS5kaXNwbGF5TmFtZSxcblx0XHRzdXBwb3J0c1Zpc2lvbjogZmFsc2UsXG5cdFx0Li4uKGNvbmZpZ1NjaGVtYSA/IHsgY29uZmlnU2NoZW1hIH0gOiB7fSksXG5cdH07XG59XG5cbi8vIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIG5hcnJvd2luZyBhbiBhcmJpdHJhcnkgcnVudGltZSB2YWx1ZSB0b1xuLy8gdGhlIGNsb3NlZCBgQ2xhdWRlUGVybWlzc2lvbk1vZGVgIHVuaW9uIG5vdyBsaXZlcyBpblxuLy8gYC4uLy4uL2NvbW1vbi9jbGF1ZGVTZXNzaW9uQ29uZmlnS2V5cy50c2Agc28gaXQgY2FuIGJlIHNoYXJlZCBieVxuLy8gYENsYXVkZUFnZW50YCwgYENsYXVkZVNlc3Npb25NZXRhZGF0YVN0b3JlYCwgYW5kIGFueSBvdGhlciBjb25zdW1lclxuLy8gdGhhdCBuZWVkcyB0aGUgc2FtZSBuYXJyb3dpbmcgc2VtYW50aWNzLiBUaGUgbGl2ZSBwZXItc2Vzc2lvbiByZWFkXG4vLyBoZWxwZXIgbGl2ZXMgaW4gYC4vY2xhdWRlU2Vzc2lvblBlcm1pc3Npb25Nb2RlLnRzYCBzbyB0aGUgc2Vzc2lvblxuLy8gYW5kIG1hdGVyaWFsaXplciBjYW4gcmVhZCBkaXJlY3RseSB3aXRob3V0IHRocmVhZGluZyBjYWxsYmFja3Ncbi8vIHRocm91Z2ggdGhlIGFnZW50LlxuXG4vLyBQcm92aXNpb25hbCBzZXNzaW9uIHN0YXRlIGlzIGhvc3RlZCBkaXJlY3RseSBvbiB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9ufVxuLy8gKHByZS1tYXRlcmlhbGl6ZSBmaWVsZHM6IHByb2plY3QsIGFib3J0Q29udHJvbGxlciwgcHJvdmlzaW9uYWxNb2RlbCxcbi8vIHByb3Zpc2lvbmFsQ29uZmlnKS4gVGhlIGxlZ2FjeSBgSUNsYXVkZVByb3Zpc2lvbmFsU2Vzc2lvbmAgbWFwIHNoYXBlXG4vLyB3YXMgcmV0aXJlZCBpbiBQaGFzZSAxMC41IFN0ZXAgM2EuXG5cbi8qKlxuICogQ2xhdWRlIGFjdGl2ZS1jbGllbnQgaGFuZGxlLiBUb29scyByZWFkL3dyaXRlIHRocm91Z2ggdGhlIGxpdmUgc2Vzc2lvbidzXG4gKiB7QGxpbmsgU2Vzc2lvbkNsaWVudFRvb2xzTW9kZWx9OyBjdXN0b21pemF0aW9uIGFzc2lnbm1lbnQga2lja3Mgb2ZmIHRoZVxuICogYWdlbnQncyBhc3luYyBzeW5jICh2aWEgdGhlIHByb3ZpZGVkIGNsb3N1cmUpLiBUaGUgaGFuZGxlIGNhY2hlcyB0aGUgbGFzdFxuICogYXNzaWduZWQgY3VzdG9taXphdGlvbiBpbnB1dHMgc28gdGhlIGdldHRlciByZWZsZWN0cyB3aGF0IHRoZSBjbGllbnQgbW9zdFxuICogcmVjZW50bHkgcHVibGlzaGVkLlxuICovXG5jbGFzcyBDbGF1ZGVBY3RpdmVDbGllbnRIYW5kbGUgaW1wbGVtZW50cyBJQWN0aXZlQ2xpZW50IHtcblx0cHJpdmF0ZSBfY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNsaWVudElkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRUb29sczogKCkgPT4gcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXRUb29sczogKHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N5bmNDdXN0b21pemF0aW9uczogKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pID0+IHZvaWQsXG5cdCkgeyB9XG5cblx0Z2V0IHRvb2xzKCk6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRUb29scygpO1xuXHR9XG5cdHNldCB0b29scyh0b29sczogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSkge1xuXHRcdHRoaXMuX3NldFRvb2xzKHRvb2xzKTtcblx0fVxuXG5cdGdldCBjdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21pemF0aW9ucztcblx0fVxuXHRzZXQgY3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkge1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zID0gY3VzdG9taXphdGlvbnM7XG5cdFx0dGhpcy5fc3luY0N1c3RvbWl6YXRpb25zKGN1c3RvbWl6YXRpb25zKTtcblx0fVxufVxuXG4vKipcbiAqIFBoYXNlIDQgc2tlbGV0b24ge0BsaW5rIElBZ2VudH0gcHJvdmlkZXIgZm9yIHRoZSBDbGF1ZGUgQWdlbnQgU0RLLlxuICpcbiAqIFdoYXQgaXMgaW1wbGVtZW50ZWQ6XG4gKiAtIFByb3ZpZGVyIGlkLCBkZXNjcmlwdG9yLCBhbmQgcHJvdGVjdGVkIHJlc291cmNlcyBzdXJmYWNlIHNvIHJvb3RcbiAqICAgc3RhdGUgYWR2ZXJ0aXNlcyBDbGF1ZGUgYWxvbmdzaWRlIENvcGlsb3QgQ0xJLlxuICogLSBHaXRIdWIgdG9rZW4gY2FwdHVyZSB2aWEge0BsaW5rIGF1dGhlbnRpY2F0ZX0gYW5kIGxhenkgYWNxdWlzaXRpb25cbiAqICAgb2YgYW4ge0BsaW5rIElDbGF1ZGVQcm94eUhhbmRsZX0gZnJvbSB7QGxpbmsgSUNsYXVkZVByb3h5U2VydmljZX0uXG4gKiAtIHtAbGluayBtb2RlbHN9IG9ic2VydmFibGUgZGVyaXZlZCBmcm9tIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2UubW9kZWxzfVxuICogICBmaWx0ZXJlZCB0byBDbGF1ZGUtZmFtaWx5IGVudHJpZXMgdmlhIHtAbGluayBpc0NsYXVkZU1vZGVsfS5cbiAqXG4gKiBXaGF0IGlzIHN0dWJiZWQ6XG4gKiAtIEFsbCBvdGhlciB7QGxpbmsgSUFnZW50fSBtZXRob2RzIHRocm93IGBFcnJvcignVE9ETzogUGhhc2UgTicpYC4gVGhlXG4gKiAgIGV4YWN0IHBoYXNlIG51bWJlcnMgcmVmZXJlbmNlIHRoZSByb2FkbWFwIGluXG4gKiAgIGBzcmMvdnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvY2xhdWRlL3JvYWRtYXAubWRgLlxuICpcbiAqIFRoZSBjbGFzcyBpcyBpbnRlbnRpb25hbGx5IGxlYW46IGVhY2ggc3Vic2VxdWVudCBwaGFzZSBhZGRzIG9uZVxuICogY29uY2VybiAoc2Vzc2lvbnMsIHNlbmRNZXNzYWdlLCBwZXJtaXNzaW9ucywgZXRjLikgc28gdGhlIHN1cmZhY2UgYXJlYVxuICogb2YgYW55IHNpbmdsZSByZXZpZXcgc3RheXMgc21hbGwuXG4gKi9cbmV4cG9ydCBjbGFzcyBDbGF1ZGVBZ2VudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnQge1xuXHRyZWFkb25seSBpZDogQWdlbnRQcm92aWRlciA9IENMQVVERV9BR0VOVF9QUk9WSURFUl9JRDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlc3Npb25Qcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFnZW50U2lnbmFsPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZXNzaW9uUHJvZ3Jlc3MgPSB0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UgPSB0aGlzLl9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWlyZUF1dGggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxPbWl0PEF1dGhSZXF1aXJlZFBhcmFtcywgJ2NoYW5uZWwnPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWlyZUF1dGggPSB0aGlzLl9vbkRpZFJlcXVpcmVBdXRoLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVscyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXT4odGhpcywgW10pO1xuXHRyZWFkb25seSBtb2RlbHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdPiA9IHRoaXMuX21vZGVscztcblx0LyoqXG5cdCAqIEluLWZsaWdodCB7QGxpbmsgcmVmcmVzaE1vZGVsc30gY2FsbCwgc28gb3ZlcmxhcHBpbmcgdHJpZ2dlcnMgKGFuIGF1dGhcblx0ICogdG9rZW4gY2hhbmdlLCBhIHRyYW5zcG9ydCBmbGlwLCBvciBhIHBlcmlvZGljIHRpY2sgZnJvbSB0aGUgaG9zdCdzXG5cdCAqIG1vZGVsLXJlZnJlc2ggc2NoZWR1bGVyKSBjb2xsYXBzZSBpbnRvIGEgc2luZ2xlIGVudW1lcmF0aW9uIGluc3RlYWQgb2Zcblx0ICogcmFjaW5nIGVhY2ggb3RoZXIncyB3cml0ZXMgdG8ge0BsaW5rIF9tb2RlbHN9LlxuXHQgKi9cblx0cHJpdmF0ZSBfbW9kZWxSZWZyZXNoSW5GbGlnaHQ6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZ2l0aHViVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJveHlIYW5kbGU6IElDbGF1ZGVQcm94eUhhbmRsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VydmVyVG9vbEhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlZCBob3N0IHRyYW5zcG9ydCBtb2RlIChQaGFzZSAxOSkuIGBwcm94eWAgKGRlZmF1bHQpIHJvdXRlcyB0aHJvdWdoXG5cdCAqIHRoZSBDb3BpbG90LUNBUEkgcHJveHk7IGBuYXRpdmVgIHRhbGtzIHRvIEFudGhyb3BpYyBkaXJlY3RseSBvbiB0aGUgdXNlcidzXG5cdCAqIG93biBjcmVkZW50aWFscy4gUmVzb2x2ZWQgb25jZSBmcm9tIHRoZSBgQ2xhdWRlVXNlQ29waWxvdFByb3h5YCByb290XG5cdCAqIGNvbmZpZyB2YWx1ZSBhbmQga2VwdCBjdXJyZW50IGJ5IGFuIGBvbkRpZFJvb3RDb25maWdDaGFuZ2VgIHN1YnNjcmlwdGlvbi5cblx0ICogQ29uZmlnIGNoYW5nZXMgYWZmZWN0IEZVVFVSRSBzZXNzaW9ucyBvbmx5IFx1MjAxNCBuZXZlciBhbiBpbi1mbGlnaHQgc3VicHJvY2Vzcy5cblx0ICovXG5cdHByaXZhdGUgX3RyYW5zcG9ydE1vZGU6ICdwcm94eScgfCAnbmF0aXZlJyA9ICdwcm94eSc7XG5cblx0LyoqXG5cdCAqIE1lbW9pemVkIHRlYXJkb3duIHByb21pc2UuIFNldCBvbiB0aGUgZmlyc3QgY2FsbCB0byB7QGxpbmsgc2h1dGRvd259LFxuXHQgKiByZXR1cm5lZCBieSBldmVyeSBzdWJzZXF1ZW50IGNhbGwuIE1pcnJvcnMgYENvcGlsb3RBZ2VudC5zaHV0ZG93bmBcblx0ICogYXQgY29waWxvdEFnZW50LnRzOjEyNDYuIFBoYXNlIDUgaGFzIG5vIGFzeW5jIHdvcmsgc28gdGhlIHJhY2Vcblx0ICogaXMgYmVuaWduLCBidXQgdGhlIGNvbnRyYWN0IGlzIGxvY2tlZCBub3cgc28gUGhhc2UgNidzIHJlYWxcblx0ICogYXN5bmMgdGVhcmRvd24gKFF1ZXJ5LmludGVycnVwdCgpLCBpbi1mbGlnaHQgbWV0YWRhdGEgd3JpdGVzKVxuXHQgKiBjYW5ub3QgcmVncmVzcy5cblx0ICovXG5cdHByaXZhdGUgX3NodXRkb3duUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogTGl2ZSBpbi1tZW1vcnkgc2Vzc2lvbiBlbnRyaWVzLCBrZXllZCBieSByYXcgc2Vzc2lvbiBpZCAobm90IFVSSSkuXG5cdCAqIEVhY2gge0BsaW5rIENsYXVkZVNlc3Npb25FbnRyeX0gb3ducyBpdHMge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gcGx1c1xuXHQgKiBhbnkgcGVyLXNlc3Npb24gZGlzcG9zYWJsZXMgcmVnaXN0ZXJlZCBhZ2FpbnN0IGl0IChlLmcuIHRoZSBmb3J3YXJkXG5cdCAqIHN1YnNjcmlwdGlvbiB0byB0aGUgc2Vzc2lvbidzIGBvbkRpZFNlc3Npb25Qcm9ncmVzc2AgZXZlbnQpLiBEaXNwb3Npbmdcblx0ICogdGhlIG1hcCBkaXNwb3NlcyBldmVyeSBlbnRyeSwgd2hpY2ggaW4gdHVybiBkaXNwb3NlcyBldmVyeXRoaW5nXG5cdCAqIHJlZ2lzdGVyZWQgdG8gaXQgXHUyMDE0IG5vIHBhcmFsbGVsIG1hcHMsIG5vIGltcGxpY2l0IGxvY2tzdGVwIGludmFyaWFudHMuXG5cdCAqIHtAbGluayBjcmVhdGVTZXNzaW9ufSBpcyB0aGUgb25seSB3cml0ZXI7IHtAbGluayBkaXNwb3NlU2Vzc2lvbn0gYW5kXG5cdCAqIHtAbGluayBzaHV0ZG93bn0gcmVtb3ZlIHZpYSB7QGxpbmsgRGlzcG9zYWJsZU1hcC5kZWxldGVBbmREaXNwb3NlfSwgd2hpY2hcblx0ICogaXMgaWRlbXBvdGVudCBpZiB0aGUga2V5IGhhcyBhbHJlYWR5IGJlZW4gcmVtb3ZlZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBDbGF1ZGVTZXNzaW9uRW50cnk+KCkpO1xuXG5cdC8qKlxuXHQgKiBMaXZlLCBpbi1tZW1vcnkgcGVlci1jaGF0IGJhY2tpbmdzIGtleWVkIGJ5IHRoZSBjaGF0J3MgYGFocC1jaGF0YCBjaGFubmVsXG5cdCAqIFVSSSBzdHJpbmcuIFBvcHVsYXRlZCBieSB7QGxpbmsgY3JlYXRlQ2hhdH0gb24gY3JlYXRpb24gYW5kIGJ5XG5cdCAqIHtAbGluayBtYXRlcmlhbGl6ZUNoYXR9IG9uIHNlc3Npb24gcmVzdG9yZSAoZGVjb2RpbmcgdGhlIG9wYXF1ZVxuXHQgKiBgcHJvdmlkZXJEYXRhYCB0aGUgb3JjaGVzdHJhdG9yIHBlcnNpc3RlZCkuIFRoaXMgaXMgdGhlIGxpdmUgc291cmNlIG9mIHRoZVxuXHQgKiBgY2hhdFVyaSBcdTIxOTIgc2RrU2Vzc2lvbklkYCBtYXBwaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdEJhY2tpbmdzID0gbmV3IE1hcDxzdHJpbmcsIElQZXJzaXN0ZWRDaGF0PigpO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGEgcGVlciBjaGF0J3Mgb3BhcXVlIGBwcm92aWRlckRhdGFgIGJsb2IgY2hhbmdlcyBhZnRlciBjcmVhdGlvblxuXHQgKiAoZS5nLiBhIHBlci1jaGF0IG1vZGVsIHN3aXRjaCkgc28gdGhlIG9yY2hlc3RyYXRvciBjYW4gcmUtcGVyc2lzdCB0aGVcblx0ICogcmVmcmVzaGVkIHRva2VuLiBTZWUge0BsaW5rIElBZ2VudC5vbkRpZENoYW5nZUNoYXREYXRhfS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2hhdERhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRDaGF0RGF0YUNoYW5nZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdERhdGE6IEV2ZW50PElBZ2VudENoYXREYXRhQ2hhbmdlPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ2hhdERhdGEuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIE1lbWJlcnNoaXAgY2hhbm5lbCBmb3IgY2hhdHMgdGhlIGFnZW50IHNwYXducyBpdHNlbGYgXHUyMDE0IHRvZGF5IHRoZVxuXHQgKiBzdWItYWdlbnQgY2hhdHMgZGVsZWdhdGVkIGJ5IGEgYFRhc2tgL2BBZ2VudGAgdG9vbCBjYWxsIChhbmQsIHdoZW4gdGhlXG5cdCAqIGhhcm5lc3MgZ2FpbnMgdGhlbSwgQ2xhdWRlIFRlYW1zIHRlYW1tYXRlcykuIERlcml2ZWQgZnJvbSB0aGVcblx0ICogYHN1YmFnZW50X3N0YXJ0ZWRgIC8gYHN1YmFnZW50X2NvbXBsZXRlZGAgc2lnbmFscyB0aGF0IGFscmVhZHkgZmxvdyBvblxuXHQgKiB7QGxpbmsgb25EaWRTZXNzaW9uUHJvZ3Jlc3N9LCBzbyB0aGUgb3JjaGVzdHJhdG9yIHJlY29yZHMgdGhlIHNwYXduIGVkZ2Vcblx0ICogb24gdGhlIHVuaWZpZWQgY2hhdCBjYXRhbG9nLiBTZWUge0BsaW5rIElBZ2VudC5vbkRpZFNwYXduQ2hhdH0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNwYXduQ2hhdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFNwYXduQ2hhdEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTcGF3bkNoYXQ6IEV2ZW50PElBZ2VudFNwYXduQ2hhdEV2ZW50PiA9IHRoaXMuX29uRGlkU3Bhd25DaGF0LmV2ZW50O1xuXG5cdC8qKiBTdGFibGUgYWN0aXZlLWNsaWVudCBoYW5kbGVzLCBrZXllZCBieSBgJHtzZXNzaW9uSWR9XFwwJHtjbGllbnRJZH1gLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDbGllbnRIYW5kbGVzID0gbmV3IE1hcDxzdHJpbmcsIENsYXVkZUFjdGl2ZUNsaWVudEhhbmRsZT4oKTtcblxuXHQvKipcblx0ICogUGhhc2UgNjogZmlyZWQgb25jZSBwZXIgc2Vzc2lvbiB3aGVuIHtAbGluayBfbWF0ZXJpYWxpemVQcm92aXNpb25hbH1cblx0ICogcHJvbW90ZXMgYSBwcm92aXNpb25hbCByZWNvcmQgaW50byBhIHJlYWwge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0uXG5cdCAqIFRoZSB7QGxpbmsgSUFnZW50U2VydmljZX0gc3Vic2NyaWJlcyB2aWEgdGhlIHBsYXRmb3JtIGNvbnRyYWN0XG5cdCAqIChgYWdlbnRTZXJ2aWNlLnRzOjQxMmApIHRvIGRpc3BhdGNoIHRoZSBkZWZlcnJlZCBgc2Vzc2lvbkFkZGVkYFxuXHQgKiBub3RpZmljYXRpb24gXHUyMDE0IG9ic2VydmVycyBkb24ndCBzZWUgdGhlIHNlc3Npb24gaW4gdGhlaXIgbGlzdCB1bnRpbFxuXHQgKiBwZXJzaXN0ZW5jZSBoYXMgc2V0dGxlZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTWF0ZXJpYWxpemVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50TWF0ZXJpYWxpemVTZXNzaW9uRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1hdGVyaWFsaXplU2Vzc2lvbiA9IHRoaXMuX29uRGlkTWF0ZXJpYWxpemVTZXNzaW9uLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbi1pZCBzZXJpYWxpemVyIHNoYXJlZCBieSB7QGxpbmsgZGlzcG9zZVNlc3Npb259IGFuZFxuXHQgKiB7QGxpbmsgc2h1dGRvd259LiBQaGFzZSA1IGRpc3Bvc2Ugd29yayBpcyBzeW5jaHJvbm91cywgc28gdGhlIHF1ZXVlZFxuXHQgKiB0YXNrcyByZXNvbHZlIGltbWVkaWF0ZWx5IGFuZCB0aGUgc2VxdWVuY2VyIGlzIG1vc3RseSBhIG5vLW9wLiBUaGVcblx0ICogcm91dGluZyBpcyBsb2NrZWQgaW4gbm93IChwZXIgcGxhbiBzZWN0aW9uIDMuMy40IC8gc2VjdGlvbiAzLjMuNikgc29cblx0ICogUGhhc2UgNidzIHJlYWwgYXN5bmMgdGVhcmRvd24gKGBRdWVyeS5pbnRlcnJ1cHQoKWAsIGluLWZsaWdodCBtZXRhZGF0YVxuXHQgKiB3cml0ZXMpIGluaGVyaXRzIHBlci1zZXNzaW9uIHNlcmlhbGl6YXRpb24gZm9yIGZyZWUgXHUyMDE0IGEgY29uY3VycmVudFxuXHQgKiBgZGlzcG9zZVNlc3Npb24odXJpKWAgYWxyZWFkeSBpbiBmbGlnaHQgaXMgYXdhaXRlZCBiZWZvcmVcblx0ICogYHNodXRkb3duKClgIHJldXNlcyB0aGUgc2FtZSBrZXkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NlU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogUGhhc2UgNjogcGVyLXNlc3Npb24taWQgc2VyaWFsaXplciBmb3Ige0BsaW5rIHNlbmRNZXNzYWdlfS4gSGVsZFxuXHQgKiBhY3Jvc3MgYm90aCB7QGxpbmsgX21hdGVyaWFsaXplUHJvdmlzaW9uYWx9IEFORCBgZW50cnkuc2VuZCgpYCBzb1xuXHQgKiB0d28gY29uY3VycmVudCBmaXJzdC1tZXNzYWdlIGNhbGxzIG9uIHRoZSBzYW1lIHNlc3Npb24gY29sbGFwc2Vcblx0ICogaW50byBvbmUgbWF0ZXJpYWxpemUgcGx1cyB0d28gb3JkZXJlZCBzZW5kcy4gU2VwYXJhdGUgZnJvbVxuXHQgKiB7QGxpbmsgX2Rpc3Bvc2VTZXF1ZW5jZXJ9IHNvIGEgYGRpc3Bvc2VTZXNzaW9uYCByYWNpbmcgYSBmaXJzdCBzZW5kXG5cdCAqIHN0aWxsIHNlcmlhbGl6ZXMgYWdhaW5zdCBpbi1mbGlnaHQgdGVhcmRvd24gd2l0aG91dCBkZWFkbG9ja2luZ1xuXHQgKiBpbnNpZGUgdGhlIHNlbmQgc2VxdWVuY2VyIChkaWZmZXJlbnQga2V5IHNwYWNlcywgc2luZ2xlXG5cdCAqIHJhY2UtcmVzb2x1dGlvbiBsYXR0aWNlIHZpYSB0aGUgdW5kZXJseWluZyBgQWJvcnRDb250cm9sbGVyYCkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhZGF0YVN0b3JlOiBDbGF1ZGVTZXNzaW9uTWV0YWRhdGFTdG9yZTtcblxuXHQvKipcblx0ICogVW5pZmllZCBwZXItc2Vzc2lvbiBsb29rdXAuIFJldHVybnMgdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQgd2hldGhlciBpdFxuXHQgKiBpcyBzdGlsbCBwcm92aXNpb25hbCBvciBhbHJlYWR5IG1hdGVyaWFsaXplZDsgY2FsbGVycyBicmFuY2ggb25cblx0ICoge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbi5pc1BpcGVsaW5lUmVhZHl9IHdoZW4gYmVoYXZpb3IgZGlmZmVycy5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogQ2xhdWRlQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk/LmRlZmF1bHRDaGF0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIGxpdmUge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gZm9yIGEgY2hhdCBcdTIwMTQgdGhlIHNlc3Npb24nc1xuXHQgKiBkZWZhdWx0IChtYWluKSBjaGF0LCBvciBhbiBhZGRpdGlvbmFsIHBlZXIgY2hhdCBhZGRyZXNzZWQgYnkgaXRzXG5cdCAqIGBhaHAtY2hhdGAgY2hhbm5lbCBVUkkgXHUyMDE0IHZpYSBhIHNpbmdsZSB1bmlmb3JtIGxvb2t1cCBpbiB0aGUgb3duaW5nXG5cdCAqIHNlc3Npb24ncyBjaGF0IG1hcC4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIChvciB0aGUgY2hhdCkgaXNcblx0ICogbm90IGluIG1lbW9yeS5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmRDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJIHwgdW5kZWZpbmVkKTogQ2xhdWRlQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBlbnRyeS5nZXRDaGF0KChjaGF0ID8/IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGF0Q29udGV4dChjaGF0T3JTZXNzaW9uOiBVUkkpOiB7IHNlc3Npb246IFVSSTsgc2Vzc2lvbklkOiBzdHJpbmc7IGNoYXRLZXk6IHN0cmluZzsgdGFyZ2V0OiBDbGF1ZGVBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ7IGlzUGVlckNoYXQ6IGJvb2xlYW4gfSB7XG5cdFx0Ly8gQWNjZXB0IGVpdGhlciBhIGNoYXQgY2hhbm5lbCBVUkkgb3IgYSBiYXJlIHNlc3Npb24gVVJJOiBwZXIgdGhlIEFIUFxuXHRcdC8vIGNvbnZlbnRpb24gdGhlIGRlZmF1bHQgY2hhdCdzIFVSSSBlcXVhbHMgdGhlIHNlc3Npb24gVVJJLCBzbyBjYWxsZXJzXG5cdFx0Ly8gdGhhdCBhZGRyZXNzIHRoZSBkZWZhdWx0IGNoYXQgYnkgdGhlIHNlc3Npb24gVVJJIHJlc29sdmUgaGVyZSBpbiBvbmVcblx0XHQvLyBwbGFjZSByYXRoZXIgdGhhbiBlYWNoIG9wZXJhdGlvbmFsIG1ldGhvZCByZS1kZXJpdmluZyBpdC5cblx0XHRjb25zdCBjaGF0ID0gcGFyc2VDaGF0VXJpKGNoYXRPclNlc3Npb24pID8gY2hhdE9yU2Vzc2lvbiA6IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGNoYXRPclNlc3Npb24pKTtcblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdCkpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk/LnJlc29sdmVDaGF0KGNoYXRLZXkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0Y2hhdEtleSxcblx0XHRcdHRhcmdldDogcmVzb2x2ZWQ/LmNoYXRTZXNzaW9uLFxuXHRcdFx0aXNQZWVyQ2hhdDogcmVzb2x2ZWQgPyAhcmVzb2x2ZWQuaXNEZWZhdWx0IDogY2hhdEtleSAhPT0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSBsaXZlIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb259IGJ5IGl0cyBTREsgY2hhdCBpZCxcblx0ICogc2VhcmNoaW5nIGV2ZXJ5IHNlc3Npb24gZW50cnkncyBkZWZhdWx0IGNoYXQgYW5kIGl0cyBwZWVyIGNoYXRzLiBVc2VkIGJ5XG5cdCAqIFNESy1pZC1hZGRyZXNzZWQgY2FsbGJhY2tzIFx1MjAxNCBwcm94eSBjcmVkaXQgcmVwb3J0cyBhbmQgdGhlIGBjYW5Vc2VUb29sYFxuXHQgKiBwZXJtaXNzaW9uIGJyaWRnZSBcdTIwMTQgd2hpY2ggY2FycnkgdGhlIFNESyBzZXNzaW9uIGlkLCBub3QgdGhlIGNoYXQgVVJJLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmluZFNlc3Npb25CeVNka0lkKHNka1Nlc3Npb25JZDogc3RyaW5nKTogQ2xhdWRlQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgZW50cnkuYWxsQ2hhdFNlc3Npb25zKCkpIHtcblx0XHRcdFx0aWYgKGNoYXQuc2Vzc2lvbklkID09PSBzZGtTZXNzaW9uSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2hhdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFdyYXAgYSB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9ufSBpbiBhIGNoYXQtbGVhZiBlbnRyeSBhbmQgZm9yd2FyZCBpdHMgZXZlbnRzLiAqL1xuXHRwcml2YXRlIF93aXJlRW50cnkoc2Vzc2lvbjogQ2xhdWRlQWdlbnRTZXNzaW9uKTogQ2xhdWRlU2Vzc2lvbkVudHJ5IHtcblx0XHRjb25zdCBlbnRyeSA9IG5ldyBDbGF1ZGVTZXNzaW9uRW50cnkoc2Vzc2lvbik7XG5cdFx0ZW50cnkuYWRkRGlzcG9zYWJsZShzZXNzaW9uLm9uRGlkU2Vzc2lvblByb2dyZXNzKHNpZ25hbCA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHNpZ25hbCk7XG5cdFx0XHR0aGlzLl9lbWl0U3Bhd25lZENoYXRFdmVudHMoc2lnbmFsKTtcblx0XHR9KSk7XG5cdFx0ZW50cnkuYWRkRGlzcG9zYWJsZShzZXNzaW9uLm9uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZS5maXJlKCkpKTtcblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgc2Vzc2lvbiBjb250YWluZXIgc2VlZGluZyBpdHMgZGVmYXVsdCAobWFpbikgY2hhdCBhcyB0aGUgZmlyc3Rcblx0ICogZW50cnkgaW4gdGhlIHVuaWZvcm0gY2hhdCBtYXAsIGtleWVkIGJ5IHRoZSBzZXNzaW9uJ3MgZGVmYXVsdC1jaGF0IFVSSS5cblx0ICovXG5cdHByaXZhdGUgX3NlZWRTZXNzaW9uRW50cnkoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb246IFVSSSwgbWFpblNlc3Npb246IENsYXVkZUFnZW50U2Vzc2lvbik6IENsYXVkZVNlc3Npb25FbnRyeSB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gbmV3IENsYXVkZVNlc3Npb25FbnRyeSgpO1xuXHRcdGNvbnRhaW5lci5zZXREZWZhdWx0Q2hhdChidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pLCB0aGlzLl93aXJlRW50cnkobWFpblNlc3Npb24pKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBjb250YWluZXIpO1xuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHQvKipcblx0ICogQnJpZGdlcyB0aGUgYWdlbnQncyBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsIG9udG8gdGhlXG5cdCAqIHtAbGluayBvbkRpZFNwYXduQ2hhdH0gbWVtYmVyc2hpcCBjaGFubmVsLiBUaGUgc2lnbmFscyBhcmUgc3RpbGwgZm9yd2FyZGVkXG5cdCAqIHZlcmJhdGltIG9uIHtAbGluayBvbkRpZFNlc3Npb25Qcm9ncmVzc30gKHRoZSBvcmNoZXN0cmF0b3Inc1xuXHQgKiBgQWdlbnRTaWRlRWZmZWN0c2Aga2VlcHMgZHJpdmluZyB0aGUgc3ViLWFnZW50IHR1cm4gKyBwYXJlbnQgdG9vbC1jYWxsXG5cdCAqIGNvbnRlbnQpOyB0aGlzIGV2ZW50IG9ubHkgbWlycm9ycyB0aGUgc3Bhd24gaW50byB0aGUgdW5pZmllZCBjaGF0IGNhdGFsb2cuXG5cdCAqIEEgY29tcGxldGVkIHN1YmFnZW50IGNoYXQgc3RheXMgbGl2ZSBhbmQgc3Vic2NyaWJhYmxlIChpdCBpcyByZW1vdmVkIG9ubHlcblx0ICogb24gc2Vzc2lvbiB0ZWFyZG93biksIHNvIHRoZXJlIGlzIG5vIGNvcnJlc3BvbmRpbmcgZW5kIGV2ZW50LiBUaGUgY2F0YWxvZ1xuXHQgKiBhZGQgaXMgaWRlbXBvdGVudCBzbyB0aGUgb3ZlcmxhcCB3aXRoIHRoZSBvcmNoZXN0cmF0b3IncyBvd24gbWVtYmVyc2hpcFxuXHQgKiBzZXF1ZW5jaW5nIGlzIHNhZmUuXG5cdCAqL1xuXHRwcml2YXRlIF9lbWl0U3Bhd25lZENoYXRFdmVudHMoc2lnbmFsOiBBZ2VudFNpZ25hbCk6IHZvaWQge1xuXHRcdGNvbnN0IHNwYXduID0gU3ViYWdlbnRDaGF0U2lnbmFsLnRvU3Bhd25FdmVudChzaWduYWwpO1xuXHRcdGlmIChzcGF3bikge1xuXHRcdFx0dGhpcy5fb25EaWRTcGF3bkNoYXQuZmlyZShzcGF3bik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0XHRASUNsYXVkZVByb3h5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGF1ZGVQcm94eVNlcnZpY2U6IElDbGF1ZGVQcm94eVNlcnZpY2UsXG5cdFx0QElDbGF1ZGVBZ2VudFNka1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2RrU2VydmljZTogSUNsYXVkZUFnZW50U2RrU2VydmljZSxcblx0XHRASUFnZW50SG9zdFN0YXRlTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRASUFnZW50SG9zdE9UZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX290ZWxTZXJ2aWNlOiBJQWdlbnRIb3N0T1RlbFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0SHViRW5kcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5NYW5hZ2VyOiBJQWdlbnRQbHVnaW5NYW5hZ2VyLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbWV0YWRhdGFTdG9yZSA9IF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVTZXNzaW9uTWV0YWRhdGFTdG9yZSwgdGhpcy5pZCk7XG5cdFx0Ly8gQ0FQSSByZXBvcnRzIGVhY2ggcmVxdWVzdCdzIGJpbGxlZCBjcmVkaXRzIHZpYSB0aGUgcHJveHkgKHRoZSBTREtcblx0XHQvLyBzdHJpcHMgYGNvcGlsb3RfdXNhZ2VgIGZyb20gaXRzIGByZXN1bHRgKS4gUm91dGUgZXZlcnkgcmVwb3J0IHRvXG5cdFx0Ly8gdGhlIG9yaWdpbmF0aW5nIHNlc3Npb24gYnkgdGhlIHNlc3Npb24gaWQgdGhlIHByb3h5IGRlY29kZWQgZnJvbVxuXHRcdC8vIHRoZSBCZWFyZXIgdG9rZW4sIHNvIHRoZSBzZXNzaW9uIGNhbiBzdXJmYWNlIHJlYWwgcGVyLXR1cm4gY3JlZGl0cy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jbGF1ZGVQcm94eVNlcnZpY2Uub25EaWRSZXBvcnRDcmVkaXRzKGUgPT4ge1xuXHRcdFx0dGhpcy5fZmluZFNlc3Npb25CeVNka0lkKGUuc2Vzc2lvbklkKT8ucmVjb3JkVHVybkNyZWRpdHMoZS50b3RhbE5hbm9BaXUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEVtaXQgYSBob3N0LXByb2R1Y2VkIHNlc3Npb24tdGl0bGUgbWV0YWRhdGEgc3BhbiB3aGVuZXZlciB0aGlzIGFnZW50J3Ncblx0XHQvLyBzZXNzaW9uIHRpdGxlIGNoYW5nZXMuIFRoZSBzaGFyZWQgc3RhdGUgbWFuYWdlciBmaXJlcyBmb3IgZXZlcnlcblx0XHQvLyBwcm92aWRlciwgc28gZ2F0ZSBvbiBvdXIgb3duIHByb3ZpZGVyIGlkLiBNaXJyb3JzIGBDb3BpbG90QWdlbnRgLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlTWFuYWdlci5vbkRpZENoYW5nZVNlc3Npb25UaXRsZSgoeyBzZXNzaW9uLCB0aXRsZSB9KSA9PiB7XG5cdFx0XHRpZiAoQWdlbnRTZXNzaW9uLnByb3ZpZGVyKHNlc3Npb24pID09PSB0aGlzLmlkKSB7XG5cdFx0XHRcdHRoaXMuX290ZWxTZXJ2aWNlLmVtaXRTZXNzaW9uVGl0bGVDaGFuZ2VkKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSwgc2Vzc2lvbiwgdGl0bGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFBoYXNlIDE5OiByZXNvbHZlIHRoZSB0cmFuc3BvcnQgbW9kZSBub3cgYW5kIHJlLXJlc29sdmUgcmVhY3RpdmVseS5cblx0XHQvLyBBIGZsaXAgb25seSBhZmZlY3RzIHNlc3Npb25zIG1hdGVyaWFsaXplZCBhZnRlcndhcmRzOyBpbi1mbGlnaHRcblx0XHQvLyBzdWJwcm9jZXNzZXMga2VlcCB0aGVpciBvcmlnaW5hbCB0cmFuc3BvcnQuIFdoZW4gbmF0aXZlLCBraWNrIG9mZiBhblxuXHRcdC8vIGluaXRpYWwgbW9kZWwgcmVmcmVzaCBzaW5jZSBubyBHaXRIdWIgYXV0aCAod2hpY2ggd291bGQgb3RoZXJ3aXNlXG5cdFx0Ly8gdHJpZ2dlciBpdCkgaXMgcmVxdWlyZWQuXG5cdFx0dGhpcy5fdHJhbnNwb3J0TW9kZSA9IHRoaXMuX3Jlc29sdmVUcmFuc3BvcnRNb2RlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IG5leHQgPSB0aGlzLl9yZXNvbHZlVHJhbnNwb3J0TW9kZSgpO1xuXHRcdFx0aWYgKG5leHQgIT09IHRoaXMuX3RyYW5zcG9ydE1vZGUpIHtcblx0XHRcdFx0dGhpcy5fdHJhbnNwb3J0TW9kZSA9IG5leHQ7XG5cdFx0XHRcdC8vIFByb3h5IGFuZCBuYXRpdmUgZW51bWVyYXRlIGRpZmZlcmVudCBjYXRhbG9ncy4gRG8gbm90IHJldGFpblxuXHRcdFx0XHQvLyBtb2RlbHMgZnJvbSB0aGUgcHJldmlvdXMgdHJhbnNwb3J0IGlmIHRoZSByZXBsYWNlbWVudCBjYW5ub3Rcblx0XHRcdFx0Ly8gZW51bWVyYXRlIGl0cyBvd24gbGlzdC5cblx0XHRcdFx0dGhpcy5fbW9kZWxzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dm9pZCB0aGlzLl9zdGFydE1vZGVsUmVmcmVzaCgpO1xuXHRcdFx0XHQvLyBGbGlwcGluZyBpbnRvIHByb3h5IG1ha2VzIEdpdEh1YiBDb3BpbG90IGF1dGggbmV3bHkgcmVxdWlyZWQuXG5cdFx0XHRcdC8vIElmIG5vIHByb3h5IGhhbmRsZSB3YXMgZXZlciBlc3RhYmxpc2hlZCwgcHJvYWN0aXZlbHkgYXNrIHRoZVxuXHRcdFx0XHQvLyBjbGllbnQgdG8gYXV0aGVudGljYXRlIHJhdGhlciB0aGFuIHdhaXRpbmcgZm9yIHRoZSBuZXh0IGNvbW1hbmRcblx0XHRcdFx0Ly8gdG8gZmFpbCB3aXRoIGBBSFBfQVVUSF9SRVFVSVJFRGAuIEEgaGFuZGxlIHBlcnNpc3RzIGFjcm9zcyBhXG5cdFx0XHRcdC8vIHByb3h5XHUyMTkybmF0aXZlXHUyMTkycHJveHkgcm91bmQtdHJpcCAoY2xlYXJlZCBvbmx5IG9uIGRpc3Bvc2UpLCBzbyB0aGlzXG5cdFx0XHRcdC8vIGZpcmVzIG9ubHkgd2hlbiBhIGNyZWRlbnRpYWwgaXMgZ2VudWluZWx5IG1pc3NpbmcuXG5cdFx0XHRcdGlmIChuZXh0ID09PSAncHJveHknICYmICF0aGlzLl9wcm94eUhhbmRsZSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWlyZUF1dGguZmlyZSh7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0cmVhc29uOiBBdXRoUmVxdWlyZWRSZWFzb24uUmVxdWlyZWQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKHRoaXMuX3RyYW5zcG9ydE1vZGUgPT09ICduYXRpdmUnKSB7XG5cdFx0XHQvLyBPbmx5IG5hdGl2ZSBib290c3RyYXBzIGl0cyBtb2RlbCBsaXN0IGhlcmUuIFByb3h5IG1vZGUgZmV0Y2hlc1xuXHRcdFx0Ly8gbW9kZWxzIGZyb20gQ0FQSSwgd2hpY2ggbmVlZHMgdGhlIEdpdEh1YiB0b2tlbiBcdTIwMTQgc28gaXRzIGZpcnN0XG5cdFx0XHQvLyByZWZyZXNoIGlzIHRyaWdnZXJlZCBieSBgYXV0aGVudGljYXRlKClgIG9uY2UgdGhhdCB0b2tlbiBhcnJpdmVzXG5cdFx0XHQvLyAoYSByZWZyZXNoIG5vdyB3b3VsZCBqdXN0IGhpdCB0aGUgbm8tdG9rZW4gZWFybHktcmV0dXJuKS4gTmF0aXZlXG5cdFx0XHQvLyBuZWVkcyBubyBHaXRIdWIgYXV0aCBhbmQgbm90aGluZyBlbHNlIHRyaWdnZXJzIGEgcmVmcmVzaCwgc28gd2Vcblx0XHRcdC8vIGtpY2sgb2ZmIHRoZSBpbml0aWFsIGVudW1lcmF0aW9uIG91cnNlbHZlcy4gKFRyYW5zcG9ydCAqZmxpcHMqXG5cdFx0XHQvLyBhZnRlciBjb25zdHJ1Y3Rpb24gYXJlIGNvdmVyZWQgYnkgdGhlIGBvbkRpZFJvb3RDb25maWdDaGFuZ2VgXG5cdFx0XHQvLyBzdWJzY3JpcHRpb24gYWJvdmUuKSBgcXVldWVNaWNyb3Rhc2tgIHJ1bnMgaXQgb2ZmIHRoZSBjdG9yIHN0YWNrLlxuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4geyB2b2lkIHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoKCk7IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVUcmFuc3BvcnRNb2RlKCk6ICdwcm94eScgfCAnbmF0aXZlJyB7XG5cdFx0Ly8gRGVmYXVsdHMgdG8gcHJveGllZCB3aGVuIHRoZSBgY2xhdWRlVXNlQ29waWxvdFByb3h5YCByb290IHZhbHVlIGlzIHVuc2V0LlxuXHRcdGNvbnN0IHVzZVByb3h5ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIEFnZW50SG9zdENvbmZpZ0tleS5DbGF1ZGVVc2VDb3BpbG90UHJveHkpID8/IHRydWU7XG5cdFx0cmV0dXJuIHVzZVByb3h5ID8gJ3Byb3h5JyA6ICduYXRpdmUnO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBEZXNjcmlwdG9yICsgYXV0aFxuXG5cdGdldERlc2NyaXB0b3IoKTogSUFnZW50RGVzY3JpcHRvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyOiB0aGlzLmlkLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdjbGF1ZGVBZ2VudC5kaXNwbGF5TmFtZScsIFwiQ2xhdWRlXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGVBZ2VudC5kZXNjcmlwdGlvbicsIFwiQ2xhdWRlIGFnZW50IGJhY2tlZCBieSB0aGUgQW50aHJvcGljIENsYXVkZSBBZ2VudCBTREtcIiksXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0bXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlLCBzaWRlQ2hhdDogdHJ1ZSB9LFxuXHRcdFx0XHQuLi4odGhpcy5faXNNdWx0aVJvb3RFbmFibGVkKCkgPyB7IG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzOiB7IGltbXV0YWJsZVByaW1hcnk6IHRydWUgfSB9IDoge30pLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNNdWx0aVJvb3RFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZTtcblx0fVxuXG5cdGdldFByb3RlY3RlZFJlc291cmNlcygpOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10ge1xuXHRcdC8vIE5hdGl2ZSAoQllPLUFudGhyb3BpYykgbW9kZSBuZWVkcyBubyBHaXRIdWIgQ29waWxvdCBhdXRoIFx1MjAxNCB0aGUgU0RLIG93bnNcblx0XHQvLyB0aGUgQW50aHJvcGljIGNyZWRlbnRpYWwgXHUyMDE0IHNvIHRoZSByZXF1aXJlZCBDb3BpbG90IHJlc291cmNlIGlzIGRyb3BwZWQuXG5cdFx0Ly8gVGhlIG9wdGlvbmFsIHJlcG8gcmVzb3VyY2UgaXMga2VwdCBmb3IgZ2l0IG9wZXJhdGlvbnMgZWl0aGVyIHdheS5cblx0XHRpZiAodGhpcy5fdHJhbnNwb3J0TW9kZSAhPT0gJ3Byb3h5Jykge1xuXHRcdFx0cmV0dXJuIFt0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCldO1xuXHRcdH1cblx0XHRyZXR1cm4gW1xuXHRcdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLFxuXHRcdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldFJlcG9SZXNvdXJjZSgpLFxuXHRcdF07XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgYWN0aXZlIHtAbGluayBDbGF1ZGVUcmFuc3BvcnR9LiBJbiBuYXRpdmUgbW9kZSB0aGUgdHJhbnNwb3J0XG5cdCAqIGlzIGFsd2F5cyByZWFkeSAodGhlIFNESyBvd25zIGNyZWRlbnRpYWxzKTsgaW4gcHJveGllZCBtb2RlIGEgc3RhcnRlZFxuXHQgKiBwcm94eSBoYW5kbGUgaXMgcmVxdWlyZWQsIG90aGVyd2lzZSB7QGxpbmsgQUhQX0FVVEhfUkVRVUlSRUR9IGlzIHRocm93bi5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZUF1dGhlbnRpY2F0ZWQoKTogQ2xhdWRlVHJhbnNwb3J0IHtcblx0XHRpZiAodGhpcy5fdHJhbnNwb3J0TW9kZSAhPT0gJ3Byb3h5Jykge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ25hdGl2ZScgfTtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fcHJveHlIYW5kbGU7XG5cdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0XHRBSFBfQVVUSF9SRVFVSVJFRCxcblx0XHRcdFx0J0F1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkIHRvIHVzZSBDbGF1ZGUnLFxuXHRcdFx0XHR0aGlzLmdldFByb3RlY3RlZFJlc291cmNlcygpLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogJ3Byb3h5JywgaGFuZGxlIH07XG5cdH1cblxuXHRhc3luYyBhdXRoZW50aWNhdGUocmVzb3VyY2U6IHN0cmluZywgdG9rZW46IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChyZXNvdXJjZSA9PT0gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldFJlcG9SZXNvdXJjZSgpLnJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHJlc291cmNlICE9PSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCkucmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gTmF0aXZlIChCWU8tQW50aHJvcGljKSBtb2RlIG5lZWRzIG5vIHByb3h5IGFuZCBubyBHaXRIdWIgdG9rZW4uIFJlY29yZFxuXHRcdC8vIHRoZSB0b2tlbiAoaGFybWxlc3M7IGxldHMgYSBsYXRlciBmbGlwIGJhY2sgdG8gcHJveHkgcmV1c2UgaXQpIGJ1dCBkb1xuXHRcdC8vIE5PVCBzdGFydCB0aGUgcHJveHkgb3IgdHJlYXQgdGhlIGFic2VuY2Ugb2YgYSB0b2tlbiBhcyB1bmF1dGhlbnRpY2F0ZWQuXG5cdFx0aWYgKHRoaXMuX3RyYW5zcG9ydE1vZGUgIT09ICdwcm94eScpIHtcblx0XHRcdHRoaXMuX2dpdGh1YlRva2VuID0gdG9rZW47XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW5DaGFuZ2VkID0gdGhpcy5fZ2l0aHViVG9rZW4gIT09IHRva2VuO1xuXHRcdGlmICghdG9rZW5DaGFuZ2VkICYmIHRoaXMuX3Byb3h5SGFuZGxlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDbGF1ZGVdIEF1dGggdG9rZW4gdW5jaGFuZ2VkJyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Ly8gQWNxdWlyZSB0aGUgbmV3IGhhbmRsZSBCRUZPUkUgY29tbWl0dGluZyB0aGUgdG9rZW4gb3IgZGlzcG9zaW5nXG5cdFx0Ly8gdGhlIG9sZCBvbmUuIElmIGBzdGFydCgpYCB0aHJvd3MsIGxlYXZlIGBfZ2l0aHViVG9rZW5gIGFuZFxuXHRcdC8vIGBfcHJveHlIYW5kbGVgIHVudG91Y2hlZCBzbyB0aGUgbmV4dCBgYXV0aGVudGljYXRlKClgIGNhbGwgc3RpbGxcblx0XHQvLyBzZWVzIHRoZSB0b2tlbiBhcyBuZXcgYW5kIHJldHJpZXMgXHUyMDE0IG90aGVyd2lzZSBhIHRyYW5zaWVudCBwcm94eVxuXHRcdC8vIHN0YXJ0dXAgZmFpbHVyZSB3b3VsZCBsZWF2ZSB1cyBpbiBhIFwidG9rZW4gcmVjb3JkZWQsIG5vIHByb3h5XG5cdFx0Ly8gcnVubmluZ1wiIHN0YXRlIGFuZCB0aGUgcmV0cnkgcGF0aCB3b3VsZCBzaG9ydC1jaXJjdWl0IGFzXG5cdFx0Ly8gXCJ1bmNoYW5nZWRcIiBhbmQgZmFsc2VseSByZXR1cm4gdHJ1ZS5cblx0XHQvL1xuXHRcdC8vIFRoZSBwcm94eSBzZXJ2ZXIncyByZWZjb3VudCBzdGF5cyA+PSAxIHRocm91Z2hvdXQgdGhpcyBzd2FwXG5cdFx0Ly8gYmVjYXVzZSB0aGUgbmV3IGhhbmRsZSBpcyBhY3F1aXJlZCBiZWZvcmUgdGhlIG9sZCBvbmUgaXNcblx0XHQvLyBkaXNwb3NlZDsge0BsaW5rIElDbGF1ZGVQcm94eVNlcnZpY2V9IGFwcGxpZXMgbW9zdC1yZWNlbnQtdG9rZW4tXG5cdFx0Ly8gd2lucyBvbiBzdWJzZXF1ZW50IGBzdGFydCgpYCBjYWxscy5cblx0XHRjb25zdCBuZXdIYW5kbGUgPSBhd2FpdCB0aGlzLl9jbGF1ZGVQcm94eVNlcnZpY2Uuc3RhcnQodG9rZW4pO1xuXHRcdGNvbnN0IG9sZEhhbmRsZSA9IHRoaXMuX3Byb3h5SGFuZGxlO1xuXHRcdHRoaXMuX3Byb3h5SGFuZGxlID0gbmV3SGFuZGxlO1xuXHRcdHRoaXMuX2dpdGh1YlRva2VuID0gdG9rZW47XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbQ2xhdWRlXSBBdXRoIHRva2VuIHVwZGF0ZWQnKTtcblx0XHRvbGRIYW5kbGU/LmRpc3Bvc2UoKTtcblx0XHRpZiAodG9rZW5DaGFuZ2VkKSB7XG5cdFx0XHQvLyBBIGRpZmZlcmVudCBhY2NvdW50IGNhbiBoYXZlIGRpZmZlcmVudCBtb2RlbCBlbnRpdGxlbWVudHMuIERvXG5cdFx0XHQvLyBub3QgcmV0YWluIHRoZSBwcmV2aW91cyB0b2tlbidzIGNhdGFsb2cgaWYgZW51bWVyYXRpb24gZm9yIHRoZVxuXHRcdFx0Ly8gcmVwbGFjZW1lbnQgdG9rZW4gZmFpbHMuXG5cdFx0XHR0aGlzLl9tb2RlbHMuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR2b2lkIHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgQ2xhdWRlIHByb3ZpZGVyIHJvdXRlcyB0aHJvdWdoIHRoZSBDb3BpbG90LUNBUEkgcHJveHkuXG5cdCAqIFJlYWRzIHRoZSByZXNvbHZlZCB7QGxpbmsgX3RyYW5zcG9ydE1vZGV9IChQaGFzZSAxOSksIHdoaWNoIHRoZVxuXHQgKiBjb25zdHJ1Y3RvciBzZWVkcyBmcm9tIHRoZSBgQ2xhdWRlVXNlQ29waWxvdFByb3h5YCByb290IGNvbmZpZyB2YWx1ZS5cblx0ICovXG5cdHByaXZhdGUgX2lzUHJveHlFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFuc3BvcnRNb2RlID09PSAncHJveHknO1xuXHR9XG5cblx0LyoqXG5cdCAqIHtAbGluayBJQWdlbnQucmVmcmVzaE1vZGVsc30uIENvYWxlc2NlcyBvbnRvIGFuIGluLWZsaWdodCByZWZyZXNoIGFuZFxuXHQgKiBuZXZlciByZWplY3RzIFx1MjAxNCB7QGxpbmsgX3JlZnJlc2hNb2RlbHN9IGFscmVhZHkgbG9ncyBhbmQgaGFuZGxlcyBmYWlsdXJlLlxuXHQgKlxuXHQgKiBPbmx5IHNhZmUgZm9yIGNhbGxlcnMgd2l0aCBubyBuZXcgaW5wdXQgdG8gYXBwbHkgKHRoZSBob3N0J3MgcGVyaW9kaWNcblx0ICogc2NoZWR1bGVyKS4gVHJpZ2dlcnMgdGhhdCBpbnZhbGlkYXRlIHRoZSBpbi1mbGlnaHQgcmVxdWVzdCBcdTIwMTQgYSByb3RhdGVkXG5cdCAqIHRva2VuLCBhIHRyYW5zcG9ydCBmbGlwIFx1MjAxNCBtdXN0IGNhbGwge0BsaW5rIF9zdGFydE1vZGVsUmVmcmVzaH0gc28gdGhleVxuXHQgKiBhcmUgbm90IGFuc3dlcmVkIGJ5IGEgcmVmcmVzaCBib3VuZCB0byB0aGUgc3VwZXJzZWRlZCBpbnB1dC5cblx0ICovXG5cdHJlZnJlc2hNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID8/IHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoKCk7XG5cdH1cblxuXHQvKipcblx0ICogVW5jb25kaXRpb25hbGx5IGJlZ2lucyBhIHJlZnJlc2gsIHN1cGVyc2VkaW5nIGFueSBpbi1mbGlnaHQgb25lIGFzIHRoZVxuXHQgKiBjb2FsZXNjaW5nIHRhcmdldC4gVGhlIHN1cGVyc2VkZWQgcmVxdWVzdCBzdGF5cyBoYXJtbGVzczogaXRzIG93blxuXHQgKiBzdGFsZS13cml0ZSBndWFyZCBkcm9wcyB0aGUgcmVzdWx0IGlmIHRoZSB0b2tlbiBvciB0cmFuc3BvcnQgbW92ZWQgb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zdGFydE1vZGVsUmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZWZyZXNoID0gdGhpcy5fcmVmcmVzaE1vZGVscygpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID09PSByZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID0gcmVmcmVzaDtcblx0XHRyZXR1cm4gcmVmcmVzaDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJveHlBdFN0YXJ0ID0gdGhpcy5faXNQcm94eUVuYWJsZWQoKTtcblx0XHRjb25zdCB0b2tlbkF0U3RhcnQgPSB0aGlzLl9naXRodWJUb2tlbjtcblx0XHRpZiAocHJveHlBdFN0YXJ0ICYmICF0b2tlbkF0U3RhcnQpIHtcblx0XHRcdHRoaXMuX21vZGVscy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWx0ZXJlZCA9IHByb3h5QXRTdGFydFxuXHRcdFx0XHQ/IGF3YWl0IHRoaXMuX2ZldGNoUHJveHlNb2RlbHModG9rZW5BdFN0YXJ0ISlcblx0XHRcdFx0OiBhd2FpdCB0aGlzLl9mZXRjaE5hdGl2ZU1vZGVscygpO1xuXHRcdFx0Ly8gU3RhbGUtd3JpdGUgZ3VhcmQ6IGJhaWwgaWYgdGhlIHRyYW5zcG9ydCBmbGlwcGVkLCBvciAocHJveHkpIHRoZVxuXHRcdFx0Ly8gdG9rZW4gcm90YXRlZCwgd2hpbGUgd2Ugd2VyZSBhd2FpdGluZyBcdTIwMTQgYSBuZXdlciByZWZyZXNoIGFscmVhZHlcblx0XHRcdC8vIHB1Ymxpc2hlZCB0aGUgcmlnaHQgbGlzdC5cblx0XHRcdGlmICh0aGlzLl9pc1Byb3h5RW5hYmxlZCgpICE9PSBwcm94eUF0U3RhcnQgfHwgKHByb3h5QXRTdGFydCAmJiB0aGlzLl9naXRodWJUb2tlbiAhPT0gdG9rZW5BdFN0YXJ0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGVdIE1vZGVscyByZWZyZXNoZWQuIENvdW50OiAke2ZpbHRlcmVkLmxlbmd0aH0sICR7ZmlsdGVyZWQubWFwKG0gPT4gbS5uYW1lKS5qb2luKCcsICcpfWApO1xuXHRcdFx0dGhpcy5fbW9kZWxzLnNldChmaWx0ZXJlZCwgdW5kZWZpbmVkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCAnW0NsYXVkZV0gRmFpbGVkIHRvIHJlZnJlc2ggbW9kZWxzJyk7XG5cdFx0XHQvLyBLZWVwIHRoZSBsYXN0IGtub3duLWdvb2QgY2F0YWxvZy4gQSBwZXJpb2RpYyByZWZyZXNoIGlzIGFkdmlzb3J5O1xuXHRcdFx0Ly8gYSB0cmFuc2llbnQgc2VydmljZSBmYWlsdXJlIG11c3Qgbm90IG1ha2UgZXZlcnkgbW9kZWwgZGlzYXBwZWFyLlxuXHRcdFx0Ly8gSW5wdXQgY2hhbmdlcyB0aGF0IGludmFsaWRhdGUgdGhlIGNhdGFsb2cgY2xlYXIgaXQgYXQgdGhlIHBvaW50XG5cdFx0XHQvLyB3aGVyZSB0aGF0IGlucHV0IGNoYW5nZXMuXG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE5hdGl2ZSAoQllPLUFudGhyb3BpYykgbW9kZWwgc291cmNlOiBlbnVtZXJhdGUgdGhlIFNESydzIGJ1aWx0LWluIC9cblx0ICogc3Vic2NyaXB0aW9uIG1vZGVscyBieSBvcGVuaW5nIGEgdGhyb3dhd2F5IHtAbGluayBJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlLnF1ZXJ5fVxuXHQgKiAod29ya3NwYWNlLWZyZWUgb3B0aW9ucyB0aGF0IHJlYWQgdGhlIHVzZXIncyByZWFsIGB+Ly5jbGF1ZGVgIGNvbmZpZykgYW5kXG5cdCAqIGNhbGxpbmcgYFF1ZXJ5LnN1cHBvcnRlZE1vZGVscygpYCBvbiBpdCwgdGhlbiBgY2xvc2UoKWAuIFRoZSBwcm9tcHQgbmV2ZXJcblx0ICogeWllbGRzLCBzbyBubyB0dXJuIHJ1bnMgYW5kIG5vIHNlc3Npb24gdHJhbnNjcmlwdCBpcyB3cml0dGVuICh2ZXJpZmllZFxuXHQgKiBQaGFzZSAxOSBFMkUpLiBQcm9qZWN0ZWQgd2l0aCBubyBjb21tZXJjaWFsIG1ldGFkYXRhLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hOYXRpdmVNb2RlbHMoKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXT4ge1xuXHRcdC8vIEEgcHJvbXB0IGl0ZXJhYmxlIHRoYXQgbmV2ZXIgeWllbGRzOiBlbnVtZXJhdGlvbiBvbmx5IG5lZWRzIHRoZVxuXHRcdC8vIGNvbnRyb2wtcmVxdWVzdCBjaGFubmVsIChgUXVlcnkuc3VwcG9ydGVkTW9kZWxzKClgKSwgbm90IGEgcmVhbCB0dXJuLlxuXHRcdGNvbnN0IG5ldmVyWWllbGRpbmdQcm9tcHQ6IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+ID0ge1xuXHRcdFx0W1N5bWJvbC5hc3luY0l0ZXJhdG9yXTogKCkgPT4gKHsgbmV4dDogKCkgPT4gbmV3IFByb21pc2U8SXRlcmF0b3JSZXN1bHQ8U0RLVXNlck1lc3NhZ2U+PigoKSA9PiB7IC8qIG5ldmVyIHJlc29sdmVzICovIH0pIH0pLFxuXHRcdH07XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGJ1aWxkTW9kZWxFbnVtZXJhdGlvbk9wdGlvbnMoKTtcblx0XHRjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UucXVlcnkoeyBwcm9tcHQ6IG5ldmVyWWllbGRpbmdQcm9tcHQsIG9wdGlvbnMgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHF1ZXJ5LnN1cHBvcnRlZE1vZGVscygpO1xuXHRcdFx0cmV0dXJuIG1vZGVscy5tYXAobSA9PiBmcm9tU2RrTW9kZWxJbmZvKG0sIHRoaXMuaWQpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gYGNsb3NlKClgIHRlcm1pbmF0ZXMgdGhlIHN1YnByb2Nlc3M7IGFib3J0aW5nIHRoZSBjb250cm9sbGVyIGlzIGFcblx0XHRcdC8vIGJlbHQtYW5kLXN1c3BlbmRlcnMgdGVhcmRvd24gZm9yIGFueXRoaW5nIGBjbG9zZSgpYCBsZWF2ZXMgcGVuZGluZy5cblx0XHRcdHF1ZXJ5LmNsb3NlKCk7XG5cdFx0XHRvcHRpb25zLmFib3J0Q29udHJvbGxlcj8uYWJvcnQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHJveGllZCAoQ29waWxvdC1DQVBJKSBtb2RlbCBzb3VyY2U6IGZldGNoIHZpYSB7QGxpbmsgSUNvcGlsb3RBcGlTZXJ2aWNlfSxcblx0ICoga2VlcCB0aGUgQ2xhdWRlIGZhbWlseSwgYW5kIHN1cmZhY2UgdGhlIENBUEktZmxhZ2dlZCBjaGF0LWRlZmF1bHQgZmlyc3QuXG5cdCAqIFRoZSBwaWNrZXIgdHJlYXRzIGBtb2RlbHNbMF1gIGFzIHRoZSBkZSBmYWN0byBkZWZhdWx0IChtb2RlbFBpY2tlci50czoxNDRcblx0ICogXHUyMDE0IGBfc2VsZWN0ZWRNb2RlbCA/PyBtb2RlbHNbMF1gKSBzaW5jZSBgSUFnZW50TW9kZWxJbmZvYCBjYXJyaWVzIG5vXG5cdCAqIGV4cGxpY2l0IGBpc0RlZmF1bHRgIGJpdDsgdGhlIHN0YWJsZSBjb21wYXJhdG9yIHJldHVybnMgMCBmb3IgZXF1YWwtXG5cdCAqIHByaW9yaXR5IG1vZGVscyBzbyBDQVBJJ3Mgb3JkZXJpbmcgd2lucyBvbiB0aWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hQcm94eU1vZGVscyh0b2tlbjogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXT4ge1xuXHRcdGNvbnN0IHVzZXJBZ2VudCA9IGAke1VTRVJfQUdFTlRfUFJFRklYfS8ke3RoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb259YDtcblx0XHRjb25zdCBhbGwgPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5tb2RlbHModG9rZW4sIHsgaGVhZGVyczogeyAnVXNlci1BZ2VudCc6IHVzZXJBZ2VudCB9LCBzdXBwcmVzc0ludGVncmF0aW9uSWQ6IHRydWUgfSk7XG5cdFx0cmV0dXJuIGFsbFxuXHRcdFx0LmZpbHRlcihpc0NsYXVkZU1vZGVsKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IE51bWJlcihiLmlzX2NoYXRfZGVmYXVsdCkgLSBOdW1iZXIoYS5pc19jaGF0X2RlZmF1bHQpKVxuXHRcdFx0Lm1hcChtID0+IHRvQWdlbnRNb2RlbEluZm8obSwgdGhpcy5pZCkpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gU3R1YnMgXHUyMDE0IGltcGxlbWVudGVkIGluIGxhdGVyIHBoYXNlc1xuXG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnID0ge30pOiBQcm9taXNlPElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0XHR0aGlzLl9lbnN1cmVBdXRoZW50aWNhdGVkKCk7XG5cdFx0aWYgKGNvbmZpZy5mb3JrKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZm9ya1Nlc3Npb24oY29uZmlnLCBjb25maWcuZm9yayk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGNvbmZpZy5zZXNzaW9uID8gQWdlbnRTZXNzaW9uLmlkKGNvbmZpZy5zZXNzaW9uKSA6IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNlc3Npb25JZCk7XG5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHQvLyBSZS1hcHBseSB0aGUgZWFnZXIgYWN0aXZlIGNsaWVudCBvbiByZWNvbm5lY3Q6IEFnZW50U2VydmljZSByZWlzc3Vlc1xuXHRcdFx0Ly8gYGNyZWF0ZVNlc3Npb25gIGZvciBhbiBleGlzdGluZyBVUkksIHNvIHRoZSByZWNvbm5lY3RlZCBjbGllbnQnc1xuXHRcdFx0Ly8gdG9vbHMvY3VzdG9taXphdGlvbnMgbXVzdCBzdGlsbCByZWFjaCBDbGF1ZGUgKG1pcnJvcnMgQ29waWxvdCkuXG5cdFx0XHRhd2FpdCB0aGlzLl9zZWVkRWFnZXJBY3RpdmVDbGllbnQoc2Vzc2lvblVyaSwgY29uZmlnLmFjdGl2ZUNsaWVudCk7XG5cdFx0XHRpZiAoIWV4aXN0aW5nLmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHNlc3Npb246IGV4aXN0aW5nLnNlc3Npb25VcmksXG5cdFx0XHRcdFx0cmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiBleGlzdGluZy53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRcdHByb3Zpc2lvbmFsOiB0cnVlLFxuXHRcdFx0XHRcdC4uLihleGlzdGluZy5wcm9qZWN0ID8geyBwcm9qZWN0OiBleGlzdGluZy5wcm9qZWN0IH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uOiBzZXNzaW9uVXJpLCByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IGNvbmZpZy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSB9O1xuXHRcdH1cblxuXHRcdC8vIEEgd29ya3NwYWNlLWxlc3Mgc2Vzc2lvbiAobm8gYHdvcmtpbmdEaXJlY3Rvcmllc2Agc3VwcGxpZWQsIGFuZCBub3QgYVxuXHRcdC8vIGZvcmspIHJ1bnMgaW4gYSBzdGFibGUgcGVyLXNlc3Npb24gc2NyYXRjaCBkaXIgc2hhcmVkIHdpdGggdGhlIENvcGlsb3Rcblx0XHQvLyBhZ2VudDsgd2l0aG91dCBhIGN3ZCBDbGF1ZGUgdGhyb3dzIGF0IG1hdGVyaWFsaXplLiBUaGUgd29ya3NwYWNlLWxlc3Ncblx0XHQvLyBtYXJrZXIgaXRzZWxmIGlzIG93bmVkL3BlcnNpc3RlZCBjZW50cmFsbHkgYnkgdGhlIEFIIHNlcnZpY2UuXG5cdFx0Y29uc3QgcmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yeSA9IGNvbmZpZy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gcmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yeSA/PyBhd2FpdCBlbnN1cmVXb3Jrc3BhY2VsZXNzU2NyYXRjaERpcih0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUsIHNlc3Npb25JZCk7XG5cblx0XHQvLyBPbmx5IHByb2JlIGZvciBhIHByb2plY3Qgd2hlbiB0aGUgY2FsbGVyIHN1cHBsaWVkIGEgcmVhbCBmb2xkZXI7IGFcblx0XHQvLyBzY3JhdGNoIGRpciBpcyBuZXZlciBhIGNvZGUgcHJvamVjdC5cblx0XHRjb25zdCBwcm9qZWN0ID0gcmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yeVxuXHRcdFx0PyBhd2FpdCBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0KHsgY3dkOiByZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3J5LmZzUGF0aCB9LCB0aGlzLl9naXRTZXJ2aWNlKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBwZXJtaXNzaW9uTW9kZSA9IHRoaXMuX3Jlc29sdmVQZXJtaXNzaW9uTW9kZShjb25maWcuY29uZmlnKTtcblxuXHRcdC8vIFRoZSBhZGRpdGlvbmFsIChub24tcHJpbWFyeSkgcm9vdHMgb2YgYSBtdWx0aS1yb290IHNlc3Npb24uIFN0YWJsZSBmcm9tXG5cdFx0Ly8gY3JlYXRpb24gXHUyMDE0IGEgd29ya3RyZWUgcmVtYXAgb25seSBhZmZlY3RzIGluZGV4IDAgXHUyMDE0IHNvIHRoZXkgYXJlIGNhcHR1cmVkXG5cdFx0Ly8gaGVyZSBhbmQgcHJlc2VydmVkIGFjcm9zcyBldmVyeSBtYXRlcmlhbGl6YXRpb24uIEVtcHR5IGZvciBzaW5nbGUtcm9vdC5cblx0XHRjb25zdCBhZGRpdGlvbmFsRGlyZWN0b3JpZXMgPSBjb25maWcud29ya2luZ0RpcmVjdG9yaWVzPy5zbGljZSgxKSA/PyBbXTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBDbGF1ZGVBZ2VudFNlc3Npb24uY3JlYXRlUHJvdmlzaW9uYWwoXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0VVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHByb2plY3QsXG5cdFx0XHRjb25maWcubW9kZWwsXG5cdFx0XHRjb25maWcuYWdlbnQsXG5cdFx0XHRjb25maWcuY29uZmlnLFxuXHRcdFx0bmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8Q2FsbFRvb2xSZXN1bHQ+KCksXG5cdFx0XHRwZXJtaXNzaW9uTW9kZSxcblx0XHRcdHRoaXMuX21ldGFkYXRhU3RvcmUsXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGFkZGl0aW9uYWxEaXJlY3Rvcmllcyxcblx0XHQpO1xuXHRcdHRoaXMuX3NlZWRTZXNzaW9uRW50cnkoc2Vzc2lvbklkLCBzZXNzaW9uVXJpLCBzZXNzaW9uKTtcblx0XHRhd2FpdCB0aGlzLl9zZWVkRWFnZXJBY3RpdmVDbGllbnQoc2Vzc2lvblVyaSwgY29uZmlnLmFjdGl2ZUNsaWVudCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvblVyaSxcblx0XHRcdHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHByb3Zpc2lvbmFsOiB0cnVlLFxuXHRcdFx0Li4uKHByb2plY3QgPyB7IHByb2plY3QgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlZWQgdGhlIGVhZ2VybHktY2xhaW1lZCBhY3RpdmUgY2xpZW50ICh0b29scyArIGN1c3RvbWl6YXRpb25zKSBpbnRvIHRoZVxuXHQgKiBTREsgYXQgc2Vzc2lvbiBjcmVhdGlvbiwgbWlycm9yaW5nIHRoZSBDb3BpbG90IGFnZW50LiBSdW5zIGZvciBmcmVzaCBBTkRcblx0ICogcmVjb25uZWN0ZWQgc2Vzc2lvbnM6IHdoZW4gdGhlIHdvcmtiZW5jaCBzZXNzaW9uIHN0YXRlIGFscmVhZHkgY2FycmllcyB0aGVcblx0ICogYWN0aXZlIGNsaWVudCwgbm8gZm9sbG93LXVwIGBzZXNzaW9uL2FjdGl2ZUNsaWVudFNldGAgaXMgZGlzcGF0Y2hlZCB0b1xuXHQgKiB0cmlnZ2VyIHRoZSBjdXN0b21pemF0aW9uIHN5bmMsIHNvIHRoZSBidWlsdC1pbiBza2lsbHMgYnVuZGxlIHdvdWxkIG5ldmVyXG5cdCAqIHJlYWNoIENsYXVkZSBvdGhlcndpc2UuIFByb2dyZXNzIGlzIHN1cHByZXNzZWQgKGBxdWlldGApIGJlY2F1c2UgdGhlIEFIXG5cdCAqIHNlcnZpY2UgaGFzIG5vdCBjcmVhdGVkIHRoZSBzZXNzaW9uIHN0YXRlIHlldCBcdTIwMTQgYVxuXHQgKiBgU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkYCBlbnZlbG9wZSB3b3VsZCBiZSBvcnBoYW5lZDsgdGhlIGNvbXBsZXRlZFxuXHQgKiBzbmFwc2hvdCBpcyBwcm92aWRlZCB2aWEgYGdldFNlc3Npb25DdXN0b21pemF0aW9uc2AgaW1tZWRpYXRlbHkgYWZ0ZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zZWVkRWFnZXJBY3RpdmVDbGllbnQoc2Vzc2lvblVyaTogVVJJLCBhY3RpdmVDbGllbnQ6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWdbJ2FjdGl2ZUNsaWVudCddKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhY3RpdmVDbGllbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5nZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChzZXNzaW9uVXJpLCB7IGNsaWVudElkOiBhY3RpdmVDbGllbnQuY2xpZW50SWQsIGRpc3BsYXlOYW1lOiBhY3RpdmVDbGllbnQuZGlzcGxheU5hbWUgfSk7XG5cdFx0aGFuZGxlLnRvb2xzID0gYWN0aXZlQ2xpZW50LnRvb2xzO1xuXHRcdGlmIChhY3RpdmVDbGllbnQuY3VzdG9taXphdGlvbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaSwgYWN0aXZlQ2xpZW50LmNsaWVudElkLCBhY3RpdmVDbGllbnQuY3VzdG9taXphdGlvbnMsIHsgcXVpZXQ6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEluLXBsYWNlIFwiUmVzdG9yZSBDaGVja3BvaW50XCIgdHJ1bmNhdGlvbi4gS2VlcHMgdHVybnNcblx0ICogYFswLi50dXJuSWRdYCBJTkNMVVNJVkUgKG9yIHJlbW92ZXMgYWxsIHR1cm5zIHdoZW4gYHR1cm5JZGAgaXNcblx0ICogb21pdHRlZCkgb24gdGhlICoqc2FtZSoqIHNlc3Npb24gaWQgLyBVUkkgXHUyMDE0IHVubGlrZSBmb3JrLCB3aGljaCBtaW50cyBhXG5cdCAqIG5ldyBpZC4gVGhlIGB0dXJuSWRgIHBhdGggcmVzb2x2ZXMgdGhlIHByb3RvY29sIHR1cm4gdG8gaXRzIFNES1xuXHQgKiBhc3Npc3RhbnQtZW52ZWxvcGUgdXVpZCAoe0BsaW5rIHJlc29sdmVGb3JrQW5jaG9yVXVpZH0pIGFuZCBzdGFnZXMgaXRcblx0ICogYXMgYSBvbmUtc2hvdCBgcmVzdW1lU2Vzc2lvbkF0YCBhbmNob3IgdGhhdCB0aGUgbmV4dCB0dXJuJ3MgcmVidWlsZFxuXHQgKiBhcHBsaWVzICh0aGUgdHJ1bmNhdGlvbiBmaW5hbGl6ZXMgd2hlbiB0aGUgbmV4dCB0dXJuIHdyaXRlcyB0aGVcblx0ICogYnJhbmNoKS4gU2VyaWFsaXplZCBvbiB7QGxpbmsgX3Nlc3Npb25TZXF1ZW5jZXJ9IChzYW1lIGtleSBhc1xuXHQgKiBgc2VuZE1lc3NhZ2VgKSBzbyB0aGUgYENoYXRUcnVuY2F0ZWRgIFx1MjE5MiBgQ2hhdFR1cm5TdGFydGVkYCBkaXNwYXRjaCBwYWlyXG5cdCAqIHN0YXlzIG9yZGVyZWQuIFByb3Zpc2lvbmFsIHNlc3Npb25zIHNob3J0LWNpcmN1aXQuXG5cdCAqL1xuXHRhc3luYyB0cnVuY2F0ZVNlc3Npb24oc2Vzc2lvbjogVVJJLCB0dXJuSWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0YXdhaXQgdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShzZXNzaW9uSWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdGlmIChleGlzdGluZyAmJiAhZXhpc3RpbmcuaXNQaXBlbGluZVJlYWR5KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke3Nlc3Npb25JZH1dIHRydW5jYXRlU2Vzc2lvbiBvbiBhIHByb3Zpc2lvbmFsIHNlc3Npb24gXHUyMDE0IG5vdGhpbmcgdG8gdHJ1bmNhdGVgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHVybklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVtb3ZlQWxsVHVybnMoc2Vzc2lvbiwgc2Vzc2lvbklkLCBleGlzdGluZyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25NZXNzYWdlcyhzZXNzaW9uSWQsIHsgaW5jbHVkZVN5c3RlbU1lc3NhZ2VzOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgYW5jaG9yID0gcmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCB0dXJuSWQpO1xuXHRcdFx0aWYgKGFuY2hvciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHRydW5jYXRlIHNlc3Npb24gJHtzZXNzaW9uSWR9OiB0dXJuICR7dHVybklkfSBub3QgZm91bmQgaW4gdHJhbnNjcmlwdGApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPcGVyYXRlIG9uIGEgbGl2ZSBzZXNzaW9uOyBjb2xkLXJlc3VtZSBhbiB1bmxvYWRlZCBvbmUgZmlyc3Qgc29cblx0XHRcdC8vIHRoZXJlIGlzIGEgc2luZ2xlIGNvZGUgcGF0aCB0aGF0IHNldHMgdGhlIGFuY2hvciBvbiBhIGxpdmVcblx0XHRcdC8vIHBpcGVsaW5lICh0aGUgbmV4dCBzZW5kIGFwcGxpZXMgaXQpLlxuXHRcdFx0Y29uc3QgbGl2ZSA9IGV4aXN0aW5nID8/IGF3YWl0IHRoaXMuX3Jlc3VtZVNlc3Npb24oc2Vzc2lvbklkLCBzZXNzaW9uKTtcblx0XHRcdGF3YWl0IGxpdmUudHJ1bmNhdGVUb1R1cm4odHVybklkLCBhbmNob3IpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlOiR7c2Vzc2lvbklkfV0gdHJ1bmNhdGVTZXNzaW9uIGtlcHQgWzAuLiR7dHVybklkfV0gKGFuY2hvcj0ke2FuY2hvcn0pYCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlLWFsbCAoXCJzdGFydCBvdmVyXCIpIGJyYW5jaCBvZiB7QGxpbmsgdHJ1bmNhdGVTZXNzaW9ufTogdGhlcmUgaXMgbm9cblx0ICogYW5jaG9yIHRvIHJlc3VtZSBhdCwgc28gdGVhciBkb3duIHRoZSBsaXZlIFF1ZXJ5LCBkZWxldGUgdGhlIG9uLWRpc2tcblx0ICogdHJhbnNjcmlwdCB2aWEgdGhlIFNESywgdGhlbiByZWNyZWF0ZSBhIGZyZXNoIHByb3Zpc2lvbmFsIHVuZGVyIHRoZSBTQU1FXG5cdCAqIGlkL1VSSSBzbyB0aGUgbmV4dCBgc2VuZE1lc3NhZ2VgIG1hdGVyaWFsaXplcyBub24tcmVzdW1lIGB7IHNlc3Npb25JZCB9YFxuXHQgKiBvbiBhIGNsZWFuIHRyYW5zY3JpcHQgKGtlZXBzIHRoZSBpZCBzdGFibGUpLiBgZGVsZXRlU2Vzc2lvbmAgaXMgZWFnZXJseVxuXHQgKiBkdXJhYmxlICh1bmxpa2UgdGhlIGxhenkgYHR1cm5JZGAgcGF0aCksIG1hdGNoaW5nIGl0cyBcImNsZWFyIC8gc3RhcnRcblx0ICogb3ZlclwiIHNlbWFudGljLiBgZXhpc3RpbmdgIGlzIHRoZSBsaXZlIHNlc3Npb24sIG9yIGB1bmRlZmluZWRgIG9uIHRoZVxuXHQgKiBjb2xkIHBhdGggKHVubG9hZGVkIHNlc3Npb24pLiBDYWxsZXIgc2VyaWFsaXplcyBvbiB7QGxpbmsgX3Nlc3Npb25TZXF1ZW5jZXJ9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVtb3ZlQWxsVHVybnMoc2Vzc2lvbjogVVJJLCBzZXNzaW9uSWQ6IHN0cmluZywgZXhpc3Rpbmc6IENsYXVkZUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZm8gPSBleGlzdGluZyA/IHVuZGVmaW5lZCA6IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZ2V0U2Vzc2lvbkluZm8oc2Vzc2lvbklkKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gZXhpc3Rpbmc/LndvcmtpbmdEaXJlY3RvcnkgPz8gKGluZm8/LmN3ZCA/IFVSSS5maWxlKGluZm8uY3dkKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHQvLyBNaXJyb3IgYF9yZXN1bWVTZXNzaW9uYCAvIGZvcms6IGZhaWwgZmFzdCByYXRoZXIgdGhhbiByZWNyZWF0ZSBhXG5cdFx0XHQvLyBwcm92aXNpb25hbCB3aXRoIG5vIGN3ZCB0aGF0IHdvdWxkIG9ubHkgZmFpbCBsYXRlciBhdCBtYXRlcmlhbGl6ZS5cblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNsZWFyIHNlc3Npb24gJHtzZXNzaW9uSWR9OiB3b3JraW5nRGlyZWN0b3J5IG1pc3NpbmcgKFNESyBjd2QgYWJzZW50IGFuZCBubyBsaXZlIHNlc3Npb24pYCk7XG5cdFx0fVxuXHRcdGxldCBvdmVybGF5OiBJQ2xhdWRlU2Vzc2lvbk92ZXJsYXkgPSB7fTtcblx0XHR0cnkge1xuXHRcdFx0b3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChzZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3Nlc3Npb25JZH1dIG92ZXJsYXkgcmVhZCBmYWlsZWQgZHVyaW5nIHJlbW92ZS1hbGw7IGNvbnRpbnVpbmcgd2l0aCBkZWZhdWx0c2AsIGVycik7XG5cdFx0fVxuXG5cdFx0Ly8gUmVjb25zdHJ1Y3QgdGhlIGZ1bGwgb3JkZXJlZCBzZXQgc28gYSBtdWx0aS1yb290IHNlc3Npb24ga2VlcHMgZXZlcnlcblx0XHQvLyBncmFudGVkIHJvb3QgYWZ0ZXIgdGhlIHJlY3JlYXRlLiBQcmVmZXIgdGhlIGxpdmUgc2Vzc2lvbidzIHNldDsgZWxzZVxuXHRcdC8vIGNvbWJpbmUgdGhlIHJlc29sdmVkIHByaW1hcnkgd2l0aCB0aGUgcGVyc2lzdGVkIG92ZXJsYXkgdGFpbC5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBleGlzdGluZz8ud29ya2luZ0RpcmVjdG9yaWVzXG5cdFx0XHQ/PyAob3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXMgJiYgb3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID4gMVxuXHRcdFx0XHQ/IFt3b3JraW5nRGlyZWN0b3J5LCAuLi5vdmVybGF5LndvcmtpbmdEaXJlY3Rvcmllcy5zbGljZSgxKV1cblx0XHRcdFx0OiBbd29ya2luZ0RpcmVjdG9yeV0pO1xuXG5cdFx0Ly8gYHNodXRkb3duTGl2ZVF1ZXJ5YCBhd2FpdHMgdGhlIHN1YnByb2Nlc3MncyBhY3R1YWwgZXhpdCAoYW5kIGl0cyBmaW5hbFxuXHRcdC8vIHRyYW5zY3JpcHQgZmx1c2gpLCBzbyB0aGUgb24tZGlzayBgPGlkPi5qc29ubGAgaXMgbm93IHN0YWJsZSBhbmQgc2FmZVxuXHRcdC8vIHRvIGRlbGV0ZTogbm8gbGl2ZSB3cml0ZXIgY2FuIHJlY3JlYXRlIGl0IGJlZm9yZSB0aGUgbmV4dCB0dXJuXG5cdFx0Ly8gcmVzcGF3bnMgYSBmcmVzaCBgLS1zZXNzaW9uLWlkIDxpZD5gLlxuXHRcdGF3YWl0IGV4aXN0aW5nPy5zaHV0ZG93bkxpdmVRdWVyeSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblxuXHRcdGF3YWl0IHRoaXMuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0Li4uKG92ZXJsYXkubW9kZWwgPyB7IG1vZGVsOiBvdmVybGF5Lm1vZGVsIH0gOiB7fSksXG5cdFx0XHQuLi4ob3ZlcmxheS5hZ2VudCA/IHsgYWdlbnQ6IG92ZXJsYXkuYWdlbnQgfSA6IHt9KSxcblx0XHRcdC4uLihvdmVybGF5LnBlcm1pc3Npb25Nb2RlID8geyBjb25maWc6IHsgW0NsYXVkZVNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbk1vZGVdOiBvdmVybGF5LnBlcm1pc3Npb25Nb2RlIH0gfSA6IHt9KSxcblx0XHR9KTtcblx0XHQvLyBSZS1mZXRjaCAobm90IHJldXNlIGBleGlzdGluZ2ApOiBgZXhpc3RpbmdgIGlzIHRoZSBPTEQgc2Vzc2lvbiwgYWxyZWFkeVxuXHRcdC8vIHRvcm4gZG93biBieSBgZGVsZXRlQW5kRGlzcG9zZWAgYWJvdmUsIGFuZCBpcyBgdW5kZWZpbmVkYCBlbnRpcmVseSBvblxuXHRcdC8vIHRoZSBjb2xkIHBhdGguIGBjcmVhdGVTZXNzaW9uYCByZWdpc3RlcmVkIGEgZnJlc2ggaW5zdGFuY2UgdW5kZXIgdGhlXG5cdFx0Ly8gc2FtZSBpZCBcdTIwMTQgcHJ1bmUgdGhyb3VnaCB0aGF0IGxpdmUgc2Vzc2lvbiBzbyBhIHNpbmdsZSBwYXRoIGNvdmVycyBib3RoXG5cdFx0Ly8gd2FybSBhbmQgY29sZCByZW1vdmUtYWxsLlxuXHRcdGF3YWl0IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk/LnBydW5lQWxsVHVybnMoKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGU6JHtzZXNzaW9uSWR9XSB0cnVuY2F0ZVNlc3Npb24gcmVtb3ZlZCBhbGwgdHVybnMgKGRlbGV0ZVNlc3Npb24gKyBmcmVzaCBzYW1lLWlkKWApO1xuXHR9XG5cblx0Ly8gLS0tLSBDaGF0IHN1cmZhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vXG5cdC8vIGBjaGF0c2AgZXhwb3NlcyB0aGUgcGVyLWNoYXQgb3BlcmF0aW9ucyBhZGRyZXNzZWQgYnkgYSBzaW5nbGUsXG5cdC8vIGNvbmNyZXRlIGNoYXQgY2hhbm5lbCBVUkkgKHRoZSBkZWZhdWx0IGNoYXQgY2hhbm5lbCBvciBhIHBlZXIvc3ViYWdlbnRcblx0Ly8gVVJJKS4gVGhlIGRlZmF1bHQgY2hhdCdzIFNESyBpZCBpcyBzdGlsbCB0aGUgb3duaW5nIHNlc3Npb24gaWQsIGRlcml2ZWRcblx0Ly8gaW5zaWRlIHRoZSBoYXJuZXNzIGZyb20gdGhlIGNoYXQgVVJJLlxuXG5cdC8qKlxuXHQgKiBUaGUgY2hhdC1hZGRyZXNzZWQgb3BlcmF0aW9uIHN1cmZhY2Vcblx0ICogKHtAbGluayBJQWdlbnRDaGF0c30pLiBFdmVyeSBtZXRob2QgYWRkcmVzc2VzIGEgY2hhdCBieSBhIHNpbmdsZSxcblx0ICogYWxyZWFkeS1yZXNvbHZlZCBjaGF0IFVSSTsgdGhpcyBtYXBzIHRvIHRoZSBgKHNlc3Npb24sIGNoYXQpYCBwYWlyXG5cdCAqIHRoZSBhZ2VudCdzIGludGVybmFsIFNESyBzdG9yYWdlIGlzIGtleWVkIGJ5ICh2aWFcblx0ICoge0BsaW5rIF9yZXNvbHZlQ2hhdFRhcmdldH0pLlxuXHQgKi9cblx0cmVhZG9ubHkgY2hhdHM6IElBZ2VudENoYXRzID0ge1xuXHRcdGNyZWF0ZUNoYXQ6IChjaGF0LCBvcHRpb25zKSA9PiB0aGlzLl9jcmVhdGVDaGF0KGNoYXQsIG9wdGlvbnMpLFxuXHRcdGZvcms6IChjaGF0LCBzb3VyY2U6IElBZ2VudENyZWF0ZUNoYXRGb3JrU291cmNlLCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpID0+XG5cdFx0XHR0aGlzLl9jcmVhdGVDaGF0KGNoYXQsIHsgLi4ub3B0aW9ucywgZm9yazogc291cmNlIH0pLFxuXHRcdGRpc3Bvc2VDaGF0OiBjaGF0VXJpID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdFVyaSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGlzcG9zZUNoYXQoc2Vzc2lvbiwgY2hhdCk7XG5cdFx0fSxcblx0XHRzZW5kTWVzc2FnZTogKGNoYXRVcmksIHByb21wdCwgd29ya2luZ0RpcmVjdG9yaWVzLCBhdHRhY2htZW50cywgdHVybklkLCBzZW5kZXJDbGllbnRJZCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlbmRNZXNzYWdlKGNoYXRVcmksIHByb21wdCwgd29ya2luZ0RpcmVjdG9yaWVzLCBhdHRhY2htZW50cywgdHVybklkLCBzZW5kZXJDbGllbnRJZCk7XG5cdFx0fSxcblx0XHRhYm9ydDogY2hhdFVyaSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWJvcnRTZXNzaW9uKGNoYXRVcmkpO1xuXHRcdH0sXG5cdFx0Y2hhbmdlTW9kZWw6IChjaGF0VXJpLCBtb2RlbCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYW5nZU1vZGVsKGNoYXRVcmksIG1vZGVsKTtcblx0XHR9LFxuXHRcdGNoYW5nZUFnZW50OiAoY2hhdFVyaSwgYWdlbnQpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9jaGFuZ2VBZ2VudChjaGF0VXJpLCBhZ2VudCk7XG5cdFx0fSxcblx0XHRnZXRNZXNzYWdlczogY2hhdCA9PiB0aGlzLmdldFNlc3Npb25NZXNzYWdlcyhjaGF0KSxcblx0fTtcblxuXHQvKipcblx0ICogTWFwIGFuIGFscmVhZHktcmVzb2x2ZWQgY2hhdCBVUkkgdG8gdGhlIGAoc2Vzc2lvbiwgY2hhdClgIHBhaXIgdGhlIGFnZW50J3Ncblx0ICogaW50ZXJuYWwgU0RLIHN0b3JhZ2UgaXMga2V5ZWQgYnkuIEEgcGVlciAob3Igc3ViYWdlbnQpIGNoYXQgaXMgYWRkcmVzc2VkIGJ5XG5cdCAqIGl0cyBvd24gYGFocC1jaGF0YCBjaGFubmVsIFVSSSwgZnJvbSB3aGljaCB0aGUgb3duaW5nIHNlc3Npb24gaXMgcmVjb3ZlcmVkLlxuXHQgKiBUaGUgZGVmYXVsdCBjaGF0IGlzIGFkZHJlc3NlZCBieSBpdHMgZGV0ZXJtaW5pc3RpYyBjaGF0IGNoYW5uZWwgVVJJLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdDogVVJJKTogeyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSSB9IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2xhdWRlIGNoYXQgb3BlcmF0aW9uIHJlcXVpcmVzIGFuIEFIUCBjaGF0IFVSSTogJHtjaGF0LnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHNlc3Npb246IFVSSS5wYXJzZShwYXJzZWQuc2Vzc2lvbiksIGNoYXQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOT1Qgc3RhcnRlZCBoZXJlIChDT05URVhUIE05KTogYGZvcmtTZXNzaW9uYCB3cml0ZXMgdGhlIHRyYW5zY3JpcHQgdG9cblx0ICogZGlzayBhbmQgd2UgcmV0dXJuOyB0aGUgYFF1ZXJ5YCBtYXRlcmlhbGl6ZXMgbGF6aWx5IG9uIHRoZSBmaXJzdFxuXHQgKiB7QGxpbmsgc2VuZE1lc3NhZ2V9IHZpYSB7QGxpbmsgX3Jlc3VtZVNlc3Npb259LiBgdHVybklkYCBpcyB0cmFuc2xhdGVkXG5cdCAqIHRvIHRoZSBTREsgZW52ZWxvcGUgYHV1aWRgIGJ5IHtAbGluayByZXNvbHZlRm9ya0FuY2hvclV1aWR9O1xuXHQgKiBgY29uZmlnLmZvcmsudHVybklkTWFwcGluZ2AgaXMgaWdub3JlZCAodGhlIFNESyBhbHJlYWR5IHJlbWFwcyB1dWlkcykuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9mb3JrU2Vzc2lvbihjb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIGZvcms6IE5vbk51bGxhYmxlPElBZ2VudENyZWF0ZVNlc3Npb25Db25maWdbJ2ZvcmsnXT4pOiBQcm9taXNlPElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0XHRpZiAoaXNTdWJhZ2VudFNlc3Npb24oZm9yay5zZXNzaW9uKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9yayBhIHN1YmFnZW50IHNlc3Npb24nKTtcblx0XHR9XG5cdFx0Y29uc3Qgc291cmNlU2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKGZvcmsuc2Vzc2lvbik7XG5cdFx0Y29uc3QgZXhpc3RpbmdTb3VyY2UgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihzb3VyY2VTZXNzaW9uSWQpO1xuXHRcdGlmIChleGlzdGluZ1NvdXJjZSAmJiAhZXhpc3RpbmdTb3VyY2UuaXNQaXBlbGluZVJlYWR5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmb3JrIGEgcHJvdmlzaW9uYWwvbmV2ZXItc2VudCBzZXNzaW9uJyk7XG5cdFx0fVxuXHRcdC8vIFNlcmlhbGl6ZSBhZ2FpbnN0IHRoZSBTT1VSQ0Ugc2Vzc2lvbiBzbyB0aGUgdHJhbnNjcmlwdCByZWFkICsgZm9ya1xuXHRcdC8vIGNhbid0IHJhY2UgYW4gaW4tZmxpZ2h0IGBzZW5kTWVzc2FnZWAgbXV0YXRpbmcgdGhhdCBzZXNzaW9uLlxuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKHNvdXJjZVNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25NZXNzYWdlcyhzb3VyY2VTZXNzaW9uSWQsIHsgaW5jbHVkZVN5c3RlbU1lc3NhZ2VzOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgdXBUb01lc3NhZ2VJZCA9IHJlc29sdmVGb3JrQW5jaG9yVXVpZChtZXNzYWdlcywgZm9yay50dXJuSWQpO1xuXHRcdFx0aWYgKHVwVG9NZXNzYWdlSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmb3JrIHNlc3Npb24gJHtzb3VyY2VTZXNzaW9uSWR9OiB0dXJuICR7Zm9yay50dXJuSWR9IG5vdCBmb3VuZCBpbiB0cmFuc2NyaXB0YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHNlc3Npb25JZDogbmV3U2Vzc2lvbklkIH0gPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmZvcmtTZXNzaW9uKHNvdXJjZVNlc3Npb25JZCwgeyB1cFRvTWVzc2FnZUlkIH0pO1xuXHRcdFx0Y29uc3QgbmV3U2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgbmV3U2Vzc2lvbklkKTtcblxuXHRcdFx0Ly8gSW5oZXJpdCB0aGUgc291cmNlJ3MgbW9kZWwgLyBwZXJtaXNzaW9uTW9kZSAvIGFnZW50IChjcmVhdGUtY29uZmlnXG5cdFx0XHQvLyBvdmVycmlkZXMgd2luKSBzbyB0aGUgbGF6eSBgX3Jlc3VtZVNlc3Npb25gIHNlZWRzIGBPcHRpb25zYCBmcm9tXG5cdFx0XHQvLyBpdC4gYGN1c3RvbWl6YXRpb25EaXJlY3RvcnlgIGlzIE5PVCBpbmhlcml0ZWQgXHUyMDE0IGl0IGlzIHRoZSBzb3VyY2Unc1xuXHRcdFx0Ly8gcGVyLXNlc3Npb24gc3luY2VkIHBsdWdpbiBkaXIgKFBoYXNlIDExKTsgdGhlIGZvcmsgcmUtc3luY3MgaXRzIG93bi5cblx0XHRcdGxldCBzb3VyY2VPdmVybGF5OiBJQ2xhdWRlU2Vzc2lvbk92ZXJsYXkgPSB7fTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNvdXJjZU92ZXJsYXkgPSBhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLnJlYWQoZm9yay5zZXNzaW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGZvcms6IHNvdXJjZSBvdmVybGF5IHJlYWQgZmFpbGVkIGZvciAke3NvdXJjZVNlc3Npb25JZH07IGNvbnRpbnVpbmcgd2l0aCBkZWZhdWx0c2AsIGVycik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvbmZpZy5tb2RlbCA/PyBzb3VyY2VPdmVybGF5Lm1vZGVsO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjb25maWcuYWdlbnQgPz8gc291cmNlT3ZlcmxheS5hZ2VudDtcblx0XHRcdGNvbnN0IHBlcm1pc3Npb25Nb2RlID0gbmFycm93Q2xhdWRlUGVybWlzc2lvbk1vZGUoY29uZmlnLmNvbmZpZz8uW0NsYXVkZVNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbk1vZGVdKSA/PyBzb3VyY2VPdmVybGF5LnBlcm1pc3Npb25Nb2RlO1xuXG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBmb3JrZWQgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5IG5vdyBzbyB3ZSBjYW4gZmFpbFxuXHRcdFx0Ly8gZmFzdCAocmF0aGVyIHRoYW4gYXQgdGhlIGZpcnN0IGBzZW5kTWVzc2FnZWAgd2hlbiBgX3Jlc3VtZVNlc3Npb25gXG5cdFx0XHQvLyByZXF1aXJlcyBhIGN3ZCkuIFRoZSBRdWVyeSBpdHNlbGYgc3RhcnRzIGxhemlseSBcdTIwMTQgc2VlIHRoZSBKU0RvYy5cblx0XHRcdGNvbnN0IHNka0luZm8gPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25JbmZvKG5ld1Nlc3Npb25JZCk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc2RrSW5mbz8uY3dkXG5cdFx0XHRcdD8gVVJJLmZpbGUoc2RrSW5mby5jd2QpXG5cdFx0XHRcdDogZXhpc3RpbmdTb3VyY2U/LndvcmtpbmdEaXJlY3RvcnkgPz8gc291cmNlT3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmb3JrIHNlc3Npb24gJHtzb3VyY2VTZXNzaW9uSWR9OiBmb3JrZWQgc2Vzc2lvbiAke25ld1Nlc3Npb25JZH0gaGFzIG5vIHdvcmtpbmcgZGlyZWN0b3J5IChTREsgY3dkIGFuZCBzb3VyY2Ugd29ya2luZyBkaXJlY3RvcnkgbWlzc2luZylgKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlIHByb3RvY29sIGlnbm9yZXMgcmVxdWVzdC10aW1lIHdvcmtpbmdEaXJlY3RvcmllcyBmb3IgZm9ya3M6XG5cdFx0XHQvLyBpbmhlcml0IHRoZSBsaXZlIHNvdXJjZSBzZXQsIG9yIGl0cyBwZXJzaXN0ZWQgb3ZlcmxheSB3aGVuIHVubG9hZGVkLlxuXHRcdFx0Y29uc3QgYWRkaXRpb25hbERpcmVjdG9yaWVzID0gZXhpc3RpbmdTb3VyY2U/LndvcmtpbmdEaXJlY3Rvcmllcz8uc2xpY2UoMSlcblx0XHRcdFx0Pz8gc291cmNlT3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpXG5cdFx0XHRcdD8/IFtdO1xuXHRcdFx0YXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS53cml0ZShuZXdTZXNzaW9uVXJpLCB7XG5cdFx0XHRcdC4uLihtb2RlbCA/IHsgbW9kZWwgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHBlcm1pc3Npb25Nb2RlID8geyBwZXJtaXNzaW9uTW9kZSB9IDoge30pLFxuXHRcdFx0XHQuLi4oYWdlbnQgPyB7IGFnZW50IH0gOiB7fSksXG5cdFx0XHRcdC4uLihhZGRpdGlvbmFsRGlyZWN0b3JpZXMubGVuZ3RoID4gMCA/IHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbd29ya2luZ0RpcmVjdG9yeSwgLi4uYWRkaXRpb25hbERpcmVjdG9yaWVzXSB9IDoge30pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBwcm9qZWN0OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwcm9qZWN0ID0gYXdhaXQgcHJvamVjdEZyb21Db3BpbG90Q29udGV4dCh7IGN3ZDogd29ya2luZ0RpcmVjdG9yeS5mc1BhdGggfSwgdGhpcy5fZ2l0U2VydmljZSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlXSBmb3JrOiBwcm9qZWN0IHJlc29sdXRpb24gZmFpbGVkIGZvciAke25ld1Nlc3Npb25JZH07IGNvbnRpbnVpbmcgd2l0aG91dCBwcm9qZWN0YCwgZXJyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNlc3Npb246IG5ld1Nlc3Npb25VcmksXG5cdFx0XHRcdHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0Li4uKHByb2plY3QgPyB7IHByb2plY3QgfSA6IHt9KSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBTREsgYGNhblVzZVRvb2xgIHBlcm1pc3Npb24gYnJpZGdlIGZvciBhIHNlc3Npb24vY2hhdC4gVGhlXG5cdCAqIHJlc29sdmVyIHNlYXJjaGVzIGJvdGggZGVmYXVsdCBjaGF0cyBhbmQgcGVlciBjaGF0cyBieSBTREsgaWQgc28gYSBwZWVyXG5cdCAqIGNoYXQncyB0b29sLXBlcm1pc3Npb24gcmVxdWVzdHMgcmVhY2ggaXRzIG93biBwZW5kaW5nLXBlcm1pc3Npb24gcmVnaXN0cnkuXG5cdCAqL1xuXHRwcml2YXRlIF9tYWtlQ2FuVXNlVG9vbChzZGtTZXNzaW9uSWQ6IHN0cmluZyk6IE5vbk51bGxhYmxlPE9wdGlvbnNbJ2NhblVzZVRvb2wnXT4ge1xuXHRcdHJldHVybiAodG9vbE5hbWUsIGlucHV0LCBvcHRpb25zKSA9PlxuXHRcdFx0aGFuZGxlQ2FuVXNlVG9vbChcblx0XHRcdFx0eyBnZXRTZXNzaW9uOiBpZCA9PiB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoaWQpLCBjb25maWd1cmF0aW9uU2VydmljZTogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgfSxcblx0XHRcdFx0c2RrU2Vzc2lvbklkLCB0b29sTmFtZSwgaW5wdXQsIG9wdGlvbnMsXG5cdFx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgU0RLIGBvbkVsaWNpdGF0aW9uYCBicmlkZ2UgZm9yIGEgc2Vzc2lvbi9jaGF0LiBNaXJyb3JzXG5cdCAqIHtAbGluayBfbWFrZUNhblVzZVRvb2x9OiByZXNvbHZlcyB0aGUgc2Vzc2lvbiBieSBTREsgaWQgKGRlZmF1bHQgYW5kIHBlZXJcblx0ICogY2hhdHMpIGFuZCBkZWxlZ2F0ZXMgdG8gdGhlIGVsaWNpdGF0aW9uIGJyaWRnZSwgd2hpY2ggcGFya3Mgb24gdGhlXG5cdCAqIHNlc3Npb24ncyB1c2VyLWlucHV0IGNoYW5uZWwuIFBoYXNlIDEwLjYuXG5cdCAqL1xuXHRwcml2YXRlIF9tYWtlT25FbGljaXRhdGlvbihzZGtTZXNzaW9uSWQ6IHN0cmluZyk6IE9uRWxpY2l0YXRpb24ge1xuXHRcdHJldHVybiAocmVxdWVzdCwgb3B0aW9ucykgPT5cblx0XHRcdGhhbmRsZUVsaWNpdGF0aW9uKFxuXHRcdFx0XHR7IGdldFNlc3Npb246IGlkID0+IHRoaXMuX2ZpbmRTZXNzaW9uQnlTZGtJZChpZCkgfSxcblx0XHRcdFx0c2RrU2Vzc2lvbklkLCByZXF1ZXN0LCBvcHRpb25zLFxuXHRcdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9tb3RlIGEgcHJvdmlzaW9uYWwge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gaW50byBhIGxpdmUgb25lLlxuXHQgKiBDYWxsZWQgZnJvbSB7QGxpbmsgc2VuZE1lc3NhZ2V9IGluc2lkZSB0aGUge0BsaW5rIF9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlfVxuXHQgKiBibG9jaywgc28gY29uY3VycmVudCBmaXJzdCBzZW5kcyBzZXJpYWxpemUgbmF0dXJhbGx5IFx1MjAxNCBleGFjdGx5XG5cdCAqIG9uZSBtYXRlcmlhbGl6ZSBwZXIgc2Vzc2lvbi5cblx0ICpcblx0ICogRmFpbHVyZSBtb2Rlczpcblx0ICogLSBNaXNzaW5nIHNlc3Npb24gZW50cnkgXHUyMTkyIHByb2dyYW1tZXIgZXJyb3IsIHRocm93cy5cblx0ICogLSBNaXNzaW5nIHByb3h5IGhhbmRsZSBcdTIxOTIgY2FsbGVyIGZvcmdvdCB7QGxpbmsgYXV0aGVudGljYXRlfSwgdGhyb3dzLlxuXHQgKiAtIEFib3J0ZWQgYmVmb3JlIFNESyBpbml0IHJldHVybnMgXHUyMTkyIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb24ubWF0ZXJpYWxpemV9XG5cdCAqICAgZGlzcG9zZXMgdGhlIGBXYXJtUXVlcnlgIGFuZCB0aHJvd3Mge0BsaW5rIENhbmNlbGxhdGlvbkVycm9yfS5cblx0ICogLSBDdXN0b21pemF0aW9uLWRpcmVjdG9yeSBwZXJzaXN0ZW5jZSBmYWlsdXJlIFx1MjE5MiBmYXRhbDogdGhlIHNlc3Npb24nc1xuXHQgKiAgIGBtYXRlcmlhbGl6ZWAgdGhyb3dzLCB0aGUgYWdlbnQgZHJvcHMgdGhlIGVudHJ5LCBhbmQgdGhlIGVycm9yXG5cdCAqICAgcHJvcGFnYXRlcyBzbyB0aGUgY2FsbGVyIGxlYXJucyBhYm91dCBpdC5cblx0ICogLSBBYm9ydGVkIHBvc3QtbWV0YWRhdGEtd3JpdGUgYnV0IHByZS1jb21taXQgXHUyMTkyIHNlY29uZCBhYm9ydCBnYXRlXG5cdCAqICAgaW5zaWRlIGBtYXRlcmlhbGl6ZWAgdGhyb3dzIHNvIHdlIG5ldmVyIGV4cG9zZSBhIGxpdmUgcGlwZWxpbmVcblx0ICogICBmb3IgYSBzZXNzaW9uIHRoZSBjYWxsZXIgaGFzIGFscmVhZHkgdG9ybiBkb3duLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbWF0ZXJpYWxpemVQcm92aXNpb25hbChzZXNzaW9uSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPENsYXVkZUFnZW50U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9maW5kQW55U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgbWF0ZXJpYWxpemUgdW5rbm93biBwcm92aXNpb25hbCBzZXNzaW9uOiAke3Nlc3Npb25JZH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5fZW5zdXJlQXV0aGVudGljYXRlZCgpO1xuXG5cdFx0Y29uc3QgY2FuVXNlVG9vbCA9IHRoaXMuX21ha2VDYW5Vc2VUb29sKHNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgb25FbGljaXRhdGlvbiA9IHRoaXMuX21ha2VPbkVsaWNpdGF0aW9uKHNlc3Npb25JZCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlc3Npb24ubWF0ZXJpYWxpemUoeyB0cmFuc3BvcnQsIGNhblVzZVRvb2wsIG9uRWxpY2l0YXRpb24sIGlzUmVzdW1lOiBmYWxzZSwgd29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yaWVzPy5bMF0sIHdvcmtpbmdEaXJlY3Rvcmllcywgc2VydmVyVG9vbEhvc3Q6IHRoaXMuX3NlcnZlclRvb2xIb3N0IH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdC8vIEVtaXQgdGhlIGZ1bGwgcmVzb2x2ZWQgc2V0IChpbmRleCAwID0gcHJvY2VzcyByb290LCAxLi5OID0gYWRkaXRpb25hbFxuXHRcdC8vIHJvb3RzKS4gRmFsbHMgYmFjayB0byB0aGUgc2Vzc2lvbidzIG93biBvcmRlcmVkIHNldCB3aGVuIHRoZSBob3N0XG5cdFx0Ly8gZGlkbid0IGhhbmQgdXMgb25lIChlLmcuIHdvcmtzcGFjZS1sZXNzIHNpbmdsZS1yb290KS5cblx0XHR0aGlzLl9vbkRpZE1hdGVyaWFsaXplU2Vzc2lvbi5maXJlKHtcblx0XHRcdHNlc3Npb246IHNlc3Npb24uc2Vzc2lvblVyaSxcblx0XHRcdHByb2plY3Q6IHNlc3Npb24ucHJvamVjdCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yaWVzID8/IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogQnJpbmcgdXAgYSBzZXNzaW9uIHdob3NlIHN0YXRlIGV4aXN0cyBvbmx5IG9uIGRpc2sgXHUyMDE0IGNyZWF0ZWQgaW5cblx0ICogYW5vdGhlciB3aW5kb3csIG9yIGJlZm9yZSBhbiBhZ2VudC1ob3N0IHJlc3RhcnQuIE1pcnJvciBvZlxuXHQgKiBgQ29waWxvdEFnZW50Ll9yZXN1bWVTZXNzaW9uYC4gUmVhZHMgYHdvcmtpbmdEaXJlY3RvcnlgIGZyb20gdGhlXG5cdCAqIFNESydzIHNlc3Npb24gcmVjb3JkIGFuZCBgbW9kZWxgIC8gYHBlcm1pc3Npb25Nb2RlYCBmcm9tIHRoZVxuXHQgKiBtZXRhZGF0YSBvdmVybGF5LCBjb25zdHJ1Y3RzIGEgcHJvdmlzaW9uYWwge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0sXG5cdCAqIGFuZCBjYWxscyB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9uLm1hdGVyaWFsaXplfSB3aXRoIGBpc1Jlc3VtZTogdHJ1ZWBcblx0ICogc28gdGhlIFNESyByZWxvYWRzIHRoZSBleGlzdGluZyB0cmFuc2NyaXB0IGluc3RlYWQgb2YgbWludGluZyBhXG5cdCAqIGZyZXNoIG9uZS5cblx0ICpcblx0ICogQ2FsbGVyIG11c3QgaG9sZCB0aGUgc2Vzc2lvbiBzZXF1ZW5jZXIgc28gdHdvIGNvbmN1cnJlbnRcblx0ICogYHNlbmRNZXNzYWdlYCBjYWxscyBmb3IgYSBmcmVzaGx5LXJlc3VtZWQgc2Vzc2lvbiBjb2xsYXBzZSBpbnRvXG5cdCAqIG9uZSByZXN1bWUgKyB0d28gb3JkZXJlZCBzZW5kcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3VtZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25Vcmk6IFVSSSwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPENsYXVkZUFnZW50U2Vzc2lvbj4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke3Nlc3Npb25JZH1dIF9yZXN1bWVTZXNzaW9uIFx1MjAxNCBubyBpbi1tZW1vcnkgc3RhdGUsIHJlYnVpbGRpbmcgZnJvbSBkaXNrYCk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5fZW5zdXJlQXV0aGVudGljYXRlZCgpO1xuXHRcdGNvbnN0IHNka0luZm8gPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25JbmZvKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZGtJbmZvKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXN1bWUgdW5rbm93biBzZXNzaW9uOiAke3Nlc3Npb25JZH0gKG5vdCBwcmVzZW50IGluIFNESyB0cmFuc2NyaXB0IHN0b3JlKWApO1xuXHRcdH1cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc2RrSW5mby5jd2QgPyBVUkkuZmlsZShzZGtJbmZvLmN3ZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXN1bWUgc2Vzc2lvbiAke3Nlc3Npb25JZH06IHdvcmtpbmdEaXJlY3RvcnkgbWlzc2luZyBmcm9tIFNESyB0cmFuc2NyaXB0YCk7XG5cdFx0fVxuXHRcdGxldCBvdmVybGF5OiBJQ2xhdWRlU2Vzc2lvbk92ZXJsYXkgPSB7fTtcblx0XHR0cnkge1xuXHRcdFx0b3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChzZXNzaW9uVXJpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3Nlc3Npb25JZH1dIG92ZXJsYXkgcmVhZCBmYWlsZWQgZHVyaW5nIHJlc3VtZTsgY29udGludWluZyB3aXRoIGRlZmF1bHRzYCwgZXJyKTtcblx0XHR9XG5cdFx0Ly8gVGhlIGFkZGl0aW9uYWwgcm9vdHMgY29tZSBmcm9tIHRoZSBzZW5kLXRpbWUgc2V0IHdoZW4gdGhlIGhvc3Qgc3VwcGxpZWRcblx0XHQvLyBvbmUgKHRoZSBjYWxsZXIgY2FycmllcyBpdCBmcm9tIGBzZW5kTWVzc2FnZWApOyBvdGhlcndpc2UgZnJvbSB0aGVcblx0XHQvLyBwZXJzaXN0ZWQgb3ZlcmxheSBzbyBhIGNvbGQgcmVzdW1lIGZyb20gZGlzayBzdGlsbCByZWFjaGVzIGV2ZXJ5IHJvb3QuXG5cdFx0Ly8gVGhlIFNESydzIGBjd2RgIHN0YXlzIGF1dGhvcml0YXRpdmUgZm9yIHRoZSBwcmltYXJ5IChpbmRleCAwKS5cblx0XHRjb25zdCBhZGRpdGlvbmFsRGlyZWN0b3JpZXMgPSAod29ya2luZ0RpcmVjdG9yaWVzICYmIHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPiAxKVxuXHRcdFx0PyB3b3JraW5nRGlyZWN0b3JpZXMuc2xpY2UoMSlcblx0XHRcdDogb3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpID8/IFtdO1xuXHRcdGNvbnN0IHBlcm1pc3Npb25Nb2RlID0gcmVhZENsYXVkZVBlcm1pc3Npb25Nb2RlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzZXNzaW9uVXJpKVxuXHRcdFx0Pz8gb3ZlcmxheS5wZXJtaXNzaW9uTW9kZVxuXHRcdFx0Pz8gJ2RlZmF1bHQnO1xuXHRcdGxldCBwcm9qZWN0OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHByb2plY3QgPSBhd2FpdCBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0KHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCB9LCB0aGlzLl9naXRTZXJ2aWNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3Nlc3Npb25JZH1dIHByb2plY3QgcmVzb2x1dGlvbiBmYWlsZWQgZHVyaW5nIHJlc3VtZTsgY29udGludWluZyB3aXRob3V0IHByb2plY3RgLCBlcnIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSBDbGF1ZGVBZ2VudFNlc3Npb24uY3JlYXRlUHJvdmlzaW9uYWwoXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0VVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHByb2plY3QsXG5cdFx0XHRvdmVybGF5Lm1vZGVsLFxuXHRcdFx0b3ZlcmxheS5hZ2VudCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENhbGxUb29sUmVzdWx0PigpLFxuXHRcdFx0cGVybWlzc2lvbk1vZGUsXG5cdFx0XHR0aGlzLl9tZXRhZGF0YVN0b3JlLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXMsXG5cdFx0KTtcblx0XHR0aGlzLl9zZWVkU2Vzc2lvbkVudHJ5KHNlc3Npb25JZCwgc2Vzc2lvblVyaSwgc2Vzc2lvbik7XG5cblx0XHRjb25zdCBjYW5Vc2VUb29sID0gdGhpcy5fbWFrZUNhblVzZVRvb2woc2Vzc2lvbklkKTtcblx0XHRjb25zdCBvbkVsaWNpdGF0aW9uID0gdGhpcy5fbWFrZU9uRWxpY2l0YXRpb24oc2Vzc2lvbklkKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbi5tYXRlcmlhbGl6ZSh7IHRyYW5zcG9ydCwgY2FuVXNlVG9vbCwgb25FbGljaXRhdGlvbiwgaXNSZXN1bWU6IHRydWUsIHNlcnZlclRvb2xIb3N0OiB0aGlzLl9zZXJ2ZXJUb29sSG9zdCB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZE1hdGVyaWFsaXplU2Vzc2lvbi5maXJlKHtcblx0XHRcdHNlc3Npb246IHNlc3Npb25VcmksXG5cdFx0XHRwcm9qZWN0LFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR9KTtcblxuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1bGwgYHBlcm1pc3Npb25Nb2RlYCBvdXQgb2YgdGhlIHBvc3QtdmFsaWRhdGlvbiBgSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZy5jb25maWdgXG5cdCAqIGJhZywgbmFycm93aW5nIHRoZSBydW50aW1lIGB1bmtub3duYCB2YWx1ZSB0byB0aGUgU0RLJ3MgYFBlcm1pc3Npb25Nb2RlYFxuXHQgKiB1bmlvbiAoNS82IHZhbHVlcywgZXhjbHVkaW5nIGBkb250QXNrYDsgc2RrLmQudHM6MTU2MCkuIEZhbGxzIGJhY2sgdG9cblx0ICogYCdkZWZhdWx0J2Agd2hlbiB0aGUgYmFnIGlzIGFic2VudCBvciBjYXJyaWVzIHNvbWV0aGluZyB0aGUgc2NoZW1hXG5cdCAqIHZhbGlkYXRvciBzaG91bGRuJ3QgaGF2ZSBhY2NlcHRlZCAoZGVmZW5zZS1pbi1kZXB0aCkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUGVybWlzc2lvbk1vZGUoY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IENsYXVkZVBlcm1pc3Npb25Nb2RlIHtcblx0XHRyZXR1cm4gbmFycm93Q2xhdWRlUGVybWlzc2lvbk1vZGUoY29uZmlnPy5bQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZV0pID8/ICdkZWZhdWx0Jztcblx0fVxuXG5cdGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFJvdXRlZCB0aHJvdWdoIHtAbGluayBfZGlzcG9zZVNlcXVlbmNlcn0gc28gYSBjb25jdXJyZW50XG5cdFx0Ly8ge0BsaW5rIHNodXRkb3dufSBhbHJlYWR5IHNlcmlhbGl6aW5nIHRlYXJkb3duIGZvciB0aGlzIHNhbWVcblx0XHQvLyBzZXNzaW9uIGlkIGF3YWl0cyB0aGlzIHdvcmsgZmlyc3QgKGFuZCB2aWNlIHZlcnNhKS4gV2hlbiB0aGUgc2Vzc2lvblxuXHRcdC8vIGhhcyBub3QgeWV0IGJlZW4gbWF0ZXJpYWxpemVkLCBhYm9ydCB0aGUgY29udHJvbGxlciAodW5ibG9ja3MgYW55XG5cdFx0Ly8gcmFjaW5nIGBhd2FpdCBzZGsuc3RhcnR1cCgpYCkgYW5kIGRyb3AgdGhlIHJlY29yZC4gTm8gU0RLIGNvbnRhY3QsXG5cdFx0Ly8gbm8gREIgd3JpdGUgXHUyMDE0IHN5bW1ldHJpYyB3aXRoIGBjcmVhdGVTZXNzaW9uYC5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3Bvc2VTZXF1ZW5jZXIucXVldWUoc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl90ZWFyZG93bkVudHJ5KHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9wcnVuZUFjdGl2ZUNsaWVudEhhbmRsZXMoc2Vzc2lvbklkKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb24tZGVzdHJ1Y3RpdmUgY291bnRlcnBhcnQgdG8ge0BsaW5rIGRpc3Bvc2VTZXNzaW9ufTogcmVsZWFzZXMgdGhlXG5cdCAqIHNlc3Npb24ncyBpbi1tZW1vcnkgcmVzb3VyY2VzIFx1MjAxNCBpdHMgbGl2ZSBTREsgc3VicHJvY2VzcyAodmlhIHRoZSBkaXNwb3NlZFxuXHQgKiBwaXBlbGluZSkgYW5kIGNhY2hlZCBlbnRyeSBcdTIwMTQgYnV0IHByZXNlcnZlcyB0aGUgb24tZGlzayBzZXNzaW9uIHNvIGl0IGNhblxuXHQgKiBiZSB0cmFuc3BhcmVudGx5IHJlc3VtZWQgbGF0ZXIgdmlhIHtAbGluayBfcmVzdW1lU2Vzc2lvbn0uIFVzZWQgYnlcblx0ICogaWRsZS1zZXNzaW9uIGV2aWN0aW9uIHRvIGJvdW5kIG1lbW9yeSBpbiBsb25nLWxpdmVkIGhvc3QgcHJvY2Vzc2VzLlxuXHQgKlxuXHQgKiBOby1vcHMgZm9yIHByb3Zpc2lvbmFsIHNlc3Npb25zIChuZXZlciBtYXRlcmlhbGl6ZWQsIHNvIG5vdGhpbmcgb24gZGlzayB0b1xuXHQgKiByZXN1bWUgZnJvbSkgYW5kIGZvciBzZXNzaW9ucyB3aXRoIGEgdHVybiBpbiBmbGlnaHQgXHUyMDE0IHRlYXJpbmcgdGhlIHBpcGVsaW5lXG5cdCAqIGRvd24gbWlkLXR1cm4gd291bGQgYWJvcnQgbGl2ZSB3b3JrLiBTaGFyZXMgdGhlIHNhbWUgaW4tbWVtb3J5IHRlYXJkb3duIGFzXG5cdCAqIHtAbGluayBkaXNwb3NlU2Vzc2lvbn07IHRoZSBkZXN0cnVjdGl2ZSBkaWZmZXJlbmNlIChkZWxldGluZyBkdXJhYmxlIGRhdGEpXG5cdCAqIGxpdmVzIGluIHRoZSBvcmNoZXN0cmF0b3IsIHdoaWNoIG9ubHkgaW52b2tlcyBpdCBvbiBkaXNwb3NlLlxuXHQgKi9cblx0cmVsZWFzZVNlc3Npb24oc2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdHJldHVybiB0aGlzLl9kaXNwb3NlU2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUHJvdmlzaW9uYWwgc2Vzc2lvbnMgKGRlZmF1bHQgY2hhdCBub3QgbWF0ZXJpYWxpemVkKSBoYXZlIG5vXG5cdFx0XHQvLyBvbi1kaXNrIFNESyBzZXNzaW9uIHRvIHJlc3VtZSBmcm9tOyByZWxlYXNpbmcgd291bGQgbG9zZSBzdGF0ZS5cblx0XHRcdGlmICghZW50cnkuZGVmYXVsdENoYXQ/LmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBEZWZlbnNpdmUgYWN0aXZlLXR1cm4gZ3VhcmQ6IHRoZSBvcmNoZXN0cmF0b3IgYWxyZWFkeSBza2lwc1xuXHRcdFx0Ly8gZXZpY3Rpb24gd2hpbGUgYSB0dXJuIGlzIGFjdGl2ZSwgYnV0IGBkaXNwb3NlU2Vzc2lvbmAgYW5kXG5cdFx0XHQvLyBgc2VuZE1lc3NhZ2VgIHJ1biBvbiBzZXBhcmF0ZSBzZXF1ZW5jZXJzLCBzbyBhIHR1cm4gY291bGQgYmUgaW5cblx0XHRcdC8vIGZsaWdodC4gTmV2ZXIgdGVhciB0aGUgcGlwZWxpbmUgZG93biB1bmRlciBhIGxpdmUgdHVybi5cblx0XHRcdGlmIChlbnRyeS5hbGxDaGF0U2Vzc2lvbnMoKS5zb21lKGNoYXRTZXNzaW9uID0+IGNoYXRTZXNzaW9uLmhhc0FjdGl2ZVR1cm4pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke3Nlc3Npb25JZH1dIFJlbGVhc2luZyBpZGxlIHNlc3Npb24gZnJvbSBtZW1vcnkgKGR1cmFibGUgc3RhdGUgcHJlc2VydmVkKWApO1xuXHRcdFx0YXdhaXQgdGhpcy5fdGVhcmRvd25FbnRyeShzZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5fcHJ1bmVBY3RpdmVDbGllbnRIYW5kbGVzKHNlc3Npb25JZCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQWJvcnQgYW5kIGRpc3Bvc2UgYSBzZXNzaW9uIGVudHJ5IFx1MjAxNCBpdHMgZGVmYXVsdCBjaGF0IGFuZCBldmVyeSBwZWVyIGNoYXQuXG5cdCAqIEVhY2ggcGVlciB0ZWFyZG93biBzZXJpYWxpemVzIG9uIHRoZSBwZWVyJ3Mgb3duIHtAbGluayBfc2Vzc2lvblNlcXVlbmNlcn1cblx0ICoga2V5IHNvIGl0IHdhaXRzIGZvciBhbnkgaW4tZmxpZ2h0IG1hdGVyaWFsaXplL3NlbmQgcmF0aGVyIHRoYW4gZGlzcG9zaW5nXG5cdCAqIHRoZSBjaGF0IHVuZGVyIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdGVhcmRvd25FbnRyeShzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGVudHJ5LmRlZmF1bHRDaGF0O1xuXHRcdGlmIChkZWZhdWx0Q2hhdCAmJiAhZGVmYXVsdENoYXQuaXNQaXBlbGluZVJlYWR5KSB7XG5cdFx0XHRkZWZhdWx0Q2hhdC5hYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZW50cnkucGVlckNoYXRLZXlzKCkubWFwKGNoYXRLZXkgPT5cblx0XHRcdHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoY2hhdEtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwZWVyID0gZW50cnkuZ2V0UGVlckNoYXQoY2hhdEtleSk7XG5cdFx0XHRcdGlmIChwZWVyKSB7XG5cdFx0XHRcdFx0aWYgKCFwZWVyLmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRcdFx0cGVlci5hYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGVlci5hYm9ydCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlbnRyeS5kaXNwb3NlUGVlckNoYXQoY2hhdEtleSk7XG5cdFx0XHR9KVxuXHRcdCkpO1xuXHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHQvLyBEcm9wIHRoZSBsaXZlIGJhY2tpbmdzIGZvciB0aGlzIHNlc3Npb24ncyBwZWVyIGNoYXRzLiBUaGUgY2hhdCBVUklcblx0XHQvLyBlbmNvZGVzIGl0cyBwYXJlbnQgc2Vzc2lvbiwgc28gd2UgcmVjb3ZlciBpdCB2aWEgYHBhcnNlQ2hhdFVyaWAuXG5cdFx0Zm9yIChjb25zdCBjaGF0S2V5IG9mIFsuLi50aGlzLl9jaGF0QmFja2luZ3Mua2V5cygpXSkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKFVSSS5wYXJzZShjaGF0S2V5KSk7XG5cdFx0XHRpZiAocGFyc2VkICYmIEFnZW50U2Vzc2lvbi5pZChVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pKSA9PT0gc2Vzc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMuX2NoYXRCYWNraW5ncy5kZWxldGUoY2hhdEtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gI3JlZ2lvbiBNdWx0aS1jaGF0IFx1MjAxNCBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgcGVlciBjaGF0c1xuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQgd2l0aGluIGFuIGV4aXN0aW5nIHNlc3Npb24uIFRoZSBuZXcgY2hhdFxuXHQgKiBpcyBiYWNrZWQgYnkgaXRzIG93biBTREsgY2hhdCAoYSBmcmVzaCBvbmUsIG9yIGEgZm9yayBvZiB0aGVcblx0ICogc291cmNlIGNoYXQgYXQgYSB0dXJuKSB0aGF0IHNoYXJlcyB0aGUgcGFyZW50IHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeVxuXHQgKiBhbmQgaW5oZXJpdGVkIG1vZGVsIC8gYWdlbnQgLyBwZXJtaXNzaW9uLW1vZGUgcGFyZW50U2Vzc2lvbi4gVGhlIGJhY2tpbmcgaXNcblx0ICogcmVjb3JkZWQgaW4gdGhlIGxpdmUge0BsaW5rIF9jaGF0QmFja2luZ3N9IG1hcCBhbmQgcmV0dXJuZWQgYXMgYW4gb3BhcXVlXG5cdCAqIGBwcm92aWRlckRhdGFgIGJsb2IgZm9yIHRoZSBvcmNoZXN0cmF0b3IgdG8gcGVyc2lzdDsgdGhlIGNoYXQncyBtZXRhZGF0YVxuXHQgKiBvdmVybGF5IGlzIHNlZWRlZCBzbyBhIGxhdGVyIGxhenkgcmVzdW1lIGluaGVyaXRzIHRoZSBwYXJlbnQgcGFyZW50U2Vzc2lvbi4gVGhlXG5cdCAqIGxpdmUge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gaXMgYnVpbHQgbGF6aWx5IG9uIHRoZSBjaGF0J3MgZmlyc3Qgc2VuZFxuXHQgKiAobWlycm9yaW5nIGhvdyBkZWZhdWx0IHNlc3Npb25zIG1hdGVyaWFsaXplIGxhemlseSkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVDaGF0KGNoYXQ6IFVSSSwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdHRoaXMuX2Vuc3VyZUF1dGhlbnRpY2F0ZWQoKTtcblx0XHRpZiAoaXNEZWZhdWx0Q2hhdFVyaShjaGF0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NsYXVkZV0gY3JlYXRlQ2hhdDogbWFsZm9ybWVkIGNoYXQgVVJJICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uKTtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRsZXQgcmVzdWx0OiBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHF1ZXVlS2V5ID0gb3B0aW9ucz8uc2lkZUNoYXQgPyBjaGF0S2V5IDogcGFyZW50U2Vzc2lvbklkO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUocXVldWVLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHQvLyBJZGVtcG90ZW50IHJlLWNyZWF0ZTogaGFuZCBiYWNrIHRoZSBleGlzdGluZyBiYWNraW5nIHNvIHRoZVxuXHRcdFx0XHQvLyBvcmNoZXN0cmF0b3IgcmUtcGVyc2lzdHMgYSBjb25zaXN0ZW50IGJsb2IuXG5cdFx0XHRcdHJlc3VsdCA9IHsgcHJvdmlkZXJEYXRhOiBlbmNvZGVQcm92aWRlckRhdGEoZXhpc3RpbmcpLCBiYWNraW5nU2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBleGlzdGluZy5zZGtTZXNzaW9uSWQpIH07XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudFNlc3Npb24gPSBhd2FpdCB0aGlzLl9yZXNvbHZlUGFyZW50U2Vzc2lvbihzZXNzaW9uLCBwYXJlbnRTZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBvcHRpb25zPy5tb2RlbCA/PyBwYXJlbnRTZXNzaW9uLm1vZGVsO1xuXG5cdFx0XHRsZXQgc2RrU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgc2lkZUNoYXQ6IElQZXJzaXN0ZWRDaGF0WydzaWRlQ2hhdCddO1xuXHRcdFx0aWYgKG9wdGlvbnM/LmZvcmspIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGZvcmsgcG9pbnQgY2FuJ3QgYmUgcmVzb2x2ZWQsIGZhbGwgdGhyb3VnaCB0byBhIGZyZXNoXG5cdFx0XHRcdC8vIGNoYXQgcmF0aGVyIHRoYW4gaW5oZXJpdGluZyB0aGUgd2hvbGUgc291cmNlIGJhY2tlbmQuXG5cdFx0XHRcdHNka1Nlc3Npb25JZCA9IChhd2FpdCB0aGlzLl9mb3JrQ2hhdChzZXNzaW9uLCBvcHRpb25zLmZvcmspKT8uc2Vzc2lvbklkO1xuXHRcdFx0fSBlbHNlIGlmIChvcHRpb25zPy5zaWRlQ2hhdCkge1xuXHRcdFx0XHRjb25zdCBmb3JrZWQgPSBhd2FpdCB0aGlzLl9mb3JrQ2hhdChzZXNzaW9uLCB7IHNvdXJjZTogb3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2UsIHR1cm5JZDogb3B0aW9ucy5zaWRlQ2hhdC5wcm92aWRlckFuY2hvclR1cm5JZCA/PyBvcHRpb25zLnNpZGVDaGF0LnR1cm5JZCB9KTtcblx0XHRcdFx0c2RrU2Vzc2lvbklkID0gZm9ya2VkPy5zZXNzaW9uSWQ7XG5cdFx0XHRcdGNvbnN0IGZhbGxiYWNrQ29udGV4dCA9IG9wdGlvbnMuc2lkZUNoYXQuc291cmNlQ29udGV4dCA/PyAoIWZvcmtlZCA/IHRoaXMuX2J1aWxkU2lkZUNoYXRDb250ZXh0KHNlc3Npb24sIG9wdGlvbnMuc2lkZUNoYXQuc291cmNlLCBvcHRpb25zLnNpZGVDaGF0LnR1cm5JZCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAoIWZvcmtlZCAmJiAhZmFsbGJhY2tDb250ZXh0ICYmICFvcHRpb25zLnNpZGVDaGF0LnBhcnRpYWxSZXNwb25zZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NsYXVkZV0gY3JlYXRlQ2hhdCBzaWRlIGNoYXQ6IHNvdXJjZSB0dXJuICR7b3B0aW9ucy5zaWRlQ2hhdC50dXJuSWR9IGNvdWxkIG5vdCBiZSBmb3JrZWRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzaWRlQ2hhdCA9IHtcblx0XHRcdFx0XHRzb3VyY2U6IG9wdGlvbnMuc2lkZUNoYXQuc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0dHVybklkOiBvcHRpb25zLnNpZGVDaGF0LnR1cm5JZCxcblx0XHRcdFx0XHQuLi4ob3B0aW9ucy5zaWRlQ2hhdC5zZWxlY3Rpb24gPyB7IHNlbGVjdGlvbjogb3B0aW9ucy5zaWRlQ2hhdC5zZWxlY3Rpb24gfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4ob3B0aW9ucy5zaWRlQ2hhdC5wcm92aWRlckFuY2hvclR1cm5JZCA/IHsgcHJvdmlkZXJBbmNob3JUdXJuSWQ6IG9wdGlvbnMuc2lkZUNoYXQucHJvdmlkZXJBbmNob3JUdXJuSWQgfSA6IHt9KSxcblx0XHRcdFx0XHRpbmhlcml0ZWRUdXJuQ291bnQ6IGZvcmtlZD8uaW5oZXJpdGVkVHVybkNvdW50ID8/IDAsXG5cdFx0XHRcdFx0Li4uKGZhbGxiYWNrQ29udGV4dCA/IHsgY29udGV4dDogZmFsbGJhY2tDb250ZXh0IH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMuc2lkZUNoYXQucGFydGlhbFJlc3BvbnNlID8geyBwYXJ0aWFsUmVzcG9uc2U6IG9wdGlvbnMuc2lkZUNoYXQucGFydGlhbFJlc3BvbnNlIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRzZGtTZXNzaW9uSWQgPz89IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0XHQvLyBSZWNvcmQgdGhlIGxpdmUgYmFja2luZyBhbmQgaGFuZCB0aGUgb3BhcXVlIGJsb2IgYmFjayB0byB0aGVcblx0XHRcdC8vIG9yY2hlc3RyYXRvciB0byBwZXJzaXN0LlxuXHRcdFx0Y29uc3QgYmFja2luZzogSVBlcnNpc3RlZENoYXQgPSB7IHNka1Nlc3Npb25JZCwgLi4uKG1vZGVsID8geyBtb2RlbCB9IDoge30pLCAuLi4oc2lkZUNoYXQgPyB7IHNpZGVDaGF0IH0gOiB7fSkgfTtcblx0XHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdEtleSwgYmFja2luZyk7XG5cdFx0XHRyZXN1bHQgPSB7IHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKGJhY2tpbmcpLCBiYWNraW5nU2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZGtTZXNzaW9uSWQpIH07XG5cblx0XHRcdC8vIFNlZWQgdGhlIGNoYXQncyBvd24gbWV0YWRhdGEgb3ZlcmxheSBzbyBhIGxhdGVyIGxhenkgcmVzdW1lICh0aGlzXG5cdFx0XHQvLyBwcm9jZXNzIG9yIGEgcmVzdGFydCkgaW5oZXJpdHMgdGhlIHBhcmVudCdzIHBhcmVudFNlc3Npb24uXG5cdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKGNoYXQsIHtcblx0XHRcdFx0Li4uKG1vZGVsID8geyBtb2RlbCB9IDoge30pLFxuXHRcdFx0XHQuLi4ocGFyZW50U2Vzc2lvbi5hZ2VudCA/IHsgYWdlbnQ6IHBhcmVudFNlc3Npb24uYWdlbnQgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHBhcmVudFNlc3Npb24ucGVybWlzc2lvbk1vZGUgPyB7IHBlcm1pc3Npb25Nb2RlOiBwYXJlbnRTZXNzaW9uLnBlcm1pc3Npb25Nb2RlIH0gOiB7fSksXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZV0gQ3JlYXRlZCBhZGRpdGlvbmFsIGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9IGluIHNlc3Npb24gJHtzZXNzaW9uLnRvU3RyaW5nKCl9JHtvcHRpb25zPy5mb3JrID8gJyAoZm9ya2VkKScgOiAnJ31gKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2UgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQsIHRlYXJpbmcgZG93biBpdHMgbGl2ZSBjaGF0IChpZlxuXHQgKiBhbnkpIGFuZCBkcm9wcGluZyBpdHMgbGl2ZSBiYWNraW5nLiBUaGUgZGVmYXVsdCBjaGF0IGNhbm5vdCBiZSBkaXNwb3NlZCBpblxuXHQgKiBpc29sYXRpb24gXHUyMDE0IGl0IGxpdmVzIGFuZCBkaWVzIHdpdGggdGhlIHNlc3Npb24uXG5cdCAqXG5cdCAqIFJvdXRlZCB0aHJvdWdoIHtAbGluayBfc2Vzc2lvblNlcXVlbmNlcn0gKGtleWVkIG9uIHRoZSBjaGF0IFVSSSkgc28gaXRcblx0ICogd2FpdHMgZm9yIGFueSBpbi1mbGlnaHQge0BsaW5rIF9tYXRlcmlhbGl6ZUNoYXRMb2NrZWR9IG9yXG5cdCAqIHtAbGluayBzZW5kTWVzc2FnZX0gdG8gZmluaXNoIGJlZm9yZSB0ZWFyaW5nIGRvd24gXHUyMDE0IHByZXZlbnRzXG5cdCAqIHVzZS1hZnRlci1kaXNwb3NlIGlmIGEgc2VuZCBpcyBjb25jdXJyZW50bHkgaW4gcHJvZ3Jlc3MuIFRoZSBkdXJhYmxlXG5cdCAqIHBlZXItY2hhdCBjYXRhbG9nIGlzIG93bmVkIGJ5IHRoZSBvcmNoZXN0cmF0b3Igbm93LCBzbyB0aGlzIG9ubHkgZHJvcHMgdGhlXG5cdCAqIGxpdmUgYmFja2luZyBhbmQgY2hhdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3Bvc2VDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzRGVmYXVsdENoYXRVcmkoY2hhdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0YXdhaXQgdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShjaGF0S2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25zLmdldChwYXJlbnRTZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgcGVlciA9IGVudHJ5Py5nZXRQZWVyQ2hhdChjaGF0S2V5KTtcblx0XHRcdGlmIChwZWVyKSB7XG5cdFx0XHRcdGlmICghcGVlci5pc1BpcGVsaW5lUmVhZHkpIHtcblx0XHRcdFx0XHRwZWVyLmFib3J0Q29udHJvbGxlci5hYm9ydCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHBlZXIuYWJvcnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbnRyeSEuZGlzcG9zZVBlZXJDaGF0KGNoYXRLZXkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2hhdEJhY2tpbmdzLmRlbGV0ZShjaGF0S2V5KTtcblx0XHR9KTtcblx0XHQvLyBUaGUgQ2xhdWRlIFNESyBleHBvc2VzIG5vIGRlbGV0ZS1jaGF0IFJQQywgc28gdGhlIGZvcmtlZCAvXG5cdFx0Ly8gZnJlc2ggdHJhbnNjcmlwdCBpcyBsZWZ0IG9uIGRpc2s7IHdpdGhvdXQgYSBjYXRhbG9nIGVudHJ5IGl0IGlzIG5ldmVyXG5cdFx0Ly8gcmVzdW1lZCBhZ2Fpbi5cblx0fVxuXG5cdC8qKlxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgaW5oZXJpdGVkIHNlc3Npb24gc2V0dGluZ3MgKHdvcmtpbmcgZGlyZWN0b3J5LCBwcm9qZWN0LCBtb2RlbCwgYWdlbnQsXG5cdCAqIHBlcm1pc3Npb24gbW9kZSkgYSBuZXcgb3IgcmVzdW1lZCBwZWVyIGNoYXQgY29waWVzIGZyb20gaXRzIHBhcmVudFxuXHQgKiBzZXNzaW9uLiBQcmVmZXJzIHRoZSBsaXZlIGluLW1lbW9yeSBwYXJlbnQ7IGZhbGxzIGJhY2sgdG8gdGhlIFNESydzXG5cdCAqIG9uLWRpc2sgc2Vzc2lvbiByZWNvcmQgKyBtZXRhZGF0YSBvdmVybGF5IGZvciBhbiB1bmxvYWRlZCBwYXJlbnQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUGFyZW50U2Vzc2lvbihzZXNzaW9uOiBVUkksIHBhcmVudFNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx7IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSTsgYWRkaXRpb25hbERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXTsgcHJvamVjdDogSUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkOyBtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7IGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZDsgcGVybWlzc2lvbk1vZGU6IENsYXVkZVBlcm1pc3Npb25Nb2RlIH0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihwYXJlbnRTZXNzaW9uSWQpO1xuXHRcdGxldCB3b3JraW5nRGlyZWN0b3J5ID0gcGFyZW50Py53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGxldCBwcm9qZWN0ID0gcGFyZW50Py5wcm9qZWN0O1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0Y29uc3Qgc2RrSW5mbyA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZ2V0U2Vzc2lvbkluZm8ocGFyZW50U2Vzc2lvbklkKTtcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnkgPSBzZGtJbmZvPy5jd2QgPyBVUkkuZmlsZShzZGtJbmZvLmN3ZCkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ2xhdWRlXSBjcmVhdGVDaGF0OiBjYW5ub3QgcmVzb2x2ZSB3b3JraW5nIGRpcmVjdG9yeSBmb3IgcGFyZW50IHNlc3Npb24gJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGlmICghcHJvamVjdCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cHJvamVjdCA9IGF3YWl0IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQoeyBjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gY3JlYXRlQ2hhdDogcHJvamVjdCByZXNvbHV0aW9uIGZhaWxlZCBmb3IgJHtzZXNzaW9uLnRvU3RyaW5nKCl9OyBjb250aW51aW5nIHdpdGhvdXQgcHJvamVjdGAsIGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBvdmVybGF5OiBJQ2xhdWRlU2Vzc2lvbk92ZXJsYXkgPSB7fTtcblx0XHR0cnkge1xuXHRcdFx0b3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChzZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gY3JlYXRlQ2hhdDogcGFyZW50IG92ZXJsYXkgcmVhZCBmYWlsZWQgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfTsgY29udGludWluZyB3aXRoIGRlZmF1bHRzYCwgZXJyKTtcblx0XHR9XG5cdFx0Y29uc3QgcGVybWlzc2lvbk1vZGUgPSByZWFkQ2xhdWRlUGVybWlzc2lvbk1vZGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHNlc3Npb24pID8/IG92ZXJsYXkucGVybWlzc2lvbk1vZGUgPz8gJ2RlZmF1bHQnO1xuXHRcdC8vIFBlZXIgY2hhdHMgc3BhbiB0aGUgc2FtZSBkaXJlY3RvcmllcyBhcyB0aGVpciBwYXJlbnQ6IHByZWZlciB0aGUgbGl2ZVxuXHRcdC8vIHBhcmVudCdzIHRhaWwsIGVsc2UgdGhlIHBlcnNpc3RlZCBvdmVybGF5J3MuXG5cdFx0Y29uc3QgYWRkaXRpb25hbERpcmVjdG9yaWVzID0gcGFyZW50Py53b3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpID8/IG92ZXJsYXkud29ya2luZ0RpcmVjdG9yaWVzPy5zbGljZSgxKSA/PyBbXTtcblx0XHRyZXR1cm4geyB3b3JraW5nRGlyZWN0b3J5LCBhZGRpdGlvbmFsRGlyZWN0b3JpZXMsIHByb2plY3QsIG1vZGVsOiBvdmVybGF5Lm1vZGVsLCBhZ2VudDogb3ZlcmxheS5hZ2VudCwgcGVybWlzc2lvbk1vZGUgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3JrIHRoZSBzb3VyY2UgY2hhdCdzIFNESyBjaGF0IGF0IHRoZSByZXF1ZXN0ZWQgdHVybiBpbnRvIGEgbmV3XG5cdCAqIGNoYXQgYW5kIHJldHVybiBpdHMgU0RLIHNlc3Npb24gaWQuIFJldHVybnMgYHVuZGVmaW5lZGAgKHNvIHRoZVxuXHQgKiBjYWxsZXIgY3JlYXRlcyBhIGZyZXNoIGNoYXQgaW5zdGVhZCkgd2hlbiB0aGUgc291cmNlIGNoYXQgb3IgdGhlXG5cdCAqIGZvcmsgYW5jaG9yIGNhbm5vdCBiZSByZXNvbHZlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZvcmtDaGF0KHNlc3Npb246IFVSSSwgZm9yazogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnNbJ2ZvcmsnXSAmIHt9KTogUHJvbWlzZTx7IHNlc3Npb25JZDogc3RyaW5nOyBpbmhlcml0ZWRUdXJuQ291bnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc291cmNlU2RrSWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdFNka0lkKHNlc3Npb24sIGZvcmsuc291cmNlKTtcblx0XHRpZiAoIXNvdXJjZVNka0lkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGNyZWF0ZUNoYXQgZm9yazogc291cmNlICR7Zm9yay5zb3VyY2UudG9TdHJpbmcoKX0gaGFzIG5vIFNESyBjaGF0OyBjcmVhdGluZyBmcmVzaCBjaGF0YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlcyA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNvdXJjZVNka0lkLCB7IGluY2x1ZGVTeXN0ZW1NZXNzYWdlczogdHJ1ZSB9KTtcblx0XHRjb25zdCB1cFRvTWVzc2FnZUlkID0gcmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCBmb3JrLnR1cm5JZCk7XG5cdFx0aWYgKHVwVG9NZXNzYWdlSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlXSBjcmVhdGVDaGF0IGZvcms6IHR1cm4gJHtmb3JrLnR1cm5JZH0gbm90IGZvdW5kIGluIHNvdXJjZSAke3NvdXJjZVNka0lkfTsgY3JlYXRpbmcgZnJlc2ggY2hhdGApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeyBzZXNzaW9uSWQgfSA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZm9ya1Nlc3Npb24oc291cmNlU2RrSWQsIHsgdXBUb01lc3NhZ2VJZCB9KTtcblx0XHRjb25zdCBhbmNob3JJbmRleCA9IG1lc3NhZ2VzLmZpbmRJbmRleChtZXNzYWdlID0+IG1lc3NhZ2UudXVpZCA9PT0gdXBUb01lc3NhZ2VJZCk7XG5cdFx0Y29uc3QgaW5oZXJpdGVkVHVybkNvdW50ID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcy5zbGljZSgwLCBhbmNob3JJbmRleCArIDEpLCBmb3JrLnNvdXJjZSwgdGhpcy5fbG9nU2VydmljZSkubGVuZ3RoO1xuXHRcdHJldHVybiB7IHNlc3Npb25JZCwgaW5oZXJpdGVkVHVybkNvdW50IH07XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgU0RLIGNoYXQgaWQgYmFja2luZyBhIGNoYXQgVVJJIFx1MjAxNCB0aGUgc2Vzc2lvbidzXG5cdCAqIGRlZmF1bHQgY2hhdCAodGhlIHBhcmVudCBzZXNzaW9uJ3Mgb3duIGlkKSBvciBhbiBhZGRpdGlvbmFsIHBlZXIgY2hhdFxuXHQgKiAoZnJvbSB0aGUgaW4tbWVtb3J5IGVudHJ5LCBlbHNlIHRoZSBsaXZlL2xlZ2FjeSBiYWNraW5nKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDaGF0U2RrSWQoc2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChpc0RlZmF1bHRDaGF0VXJpKGNoYXRVcmkpIHx8IGNoYXRVcmkudG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdH1cblx0XHRjb25zdCBpbk1lbW9yeSA9IHRoaXMuX2ZpbmRDaGF0KHNlc3Npb24sIGNoYXRVcmkpPy5zZXNzaW9uSWQ7XG5cdFx0aWYgKGluTWVtb3J5KSB7XG5cdFx0XHRyZXR1cm4gaW5NZW1vcnk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlQ2hhdEJhY2tpbmcoY2hhdFVyaSk/LnNka1Nlc3Npb25JZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNvdXJjZUNoYXRTdGF0ZShzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSk6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzRGVmYXVsdENoYXRVcmkoY2hhdFVyaSkgfHwgY2hhdFVyaS50b1N0cmluZygpID09PSBzZXNzaW9uLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0VXJpLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRTaWRlQ2hhdENvbnRleHQoc2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBVUkksIHR1cm5JZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2dldFNvdXJjZUNoYXRTdGF0ZShzZXNzaW9uLCBjaGF0VXJpKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjb21wbGV0ZWRJbmRleCA9IHN0YXRlLnR1cm5zLmZpbmRJbmRleCh0dXJuID0+IHR1cm4uaWQgPT09IHR1cm5JZCk7XG5cdFx0Y29uc3QgYm91bmRlZFR1cm5zID0gY29tcGxldGVkSW5kZXggPj0gMFxuXHRcdFx0PyBzdGF0ZS50dXJucy5zbGljZSgwLCBjb21wbGV0ZWRJbmRleCArIDEpXG5cdFx0XHQ6IHN0YXRlLmFjdGl2ZVR1cm4/LmlkID09PSB0dXJuSWRcblx0XHRcdFx0PyBzdGF0ZS50dXJuc1xuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gYm91bmRlZFR1cm5zID8gYnVpbGRTaWRlQ2hhdFNvdXJjZUNvbnRleHQoYm91bmRlZFR1cm5zLCBzdGF0ZS5hY3RpdmVUdXJuPy5pZCA9PT0gdHVybklkID8gc3RhdGUuYWN0aXZlVHVybiA6IHVuZGVmaW5lZCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGxpdmUgYmFja2luZyBmb3IgYSBwZWVyIGNoYXQgZnJvbSB0aGUgaW4tbWVtb3J5XG5cdCAqIHtAbGluayBfY2hhdEJhY2tpbmdzfSBtYXAuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIGEgY2hhdCB0aGF0IGhhcyBub3QgYmVlblxuXHQgKiBtYXRlcmlhbGl6ZWQgdmlhIHtAbGluayBtYXRlcmlhbGl6ZUNoYXR9LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUNoYXRCYWNraW5nKGNoYXQ6IFVSSSk6IElQZXJzaXN0ZWRDaGF0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0LnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgaW4tbWVtb3J5IGVudHJ5IGZvciBhIHNlc3Npb24sIGNyZWF0aW5nIGEgcHJvdmlzaW9uYWwgKG5vdCB5ZXRcblx0ICogbWF0ZXJpYWxpemVkKSBkZWZhdWx0IGNoYXQgdG8gaG9zdCBpdHMgcGVlciBjaGF0cyBpZiBub25lIGV4aXN0cyBcdTIwMTQgZS5nLiBhXG5cdCAqIHBlZXIgY2hhdCBpcyBzZW50IHRvIGFmdGVyIGEgcmVzdGFydCBiZWZvcmUgdGhlIGRlZmF1bHQgY2hhdCBpcyB0b3VjaGVkLlxuXHQgKiBTZXJpYWxpemVkIG9uIHRoZSBzZXNzaW9uIGlkIHNvIGNvbmN1cnJlbnQgcGVlciBzZW5kcyBzaGFyZSBvbmUgZW50cnkuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVTZXNzaW9uRW50cnkoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxDbGF1ZGVTZXNzaW9uRW50cnk+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudFNlc3Npb24gPSBhd2FpdCB0aGlzLl9yZXNvbHZlUGFyZW50U2Vzc2lvbihzZXNzaW9uLCBzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgbWFpblNlc3Npb24gPSBDbGF1ZGVBZ2VudFNlc3Npb24uY3JlYXRlUHJvdmlzaW9uYWwoXG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0VVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpLFxuXHRcdFx0XHRwYXJlbnRTZXNzaW9uLndvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHBhcmVudFNlc3Npb24ucHJvamVjdCxcblx0XHRcdFx0cGFyZW50U2Vzc2lvbi5tb2RlbCxcblx0XHRcdFx0cGFyZW50U2Vzc2lvbi5hZ2VudCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxDYWxsVG9vbFJlc3VsdD4oKSxcblx0XHRcdFx0cGFyZW50U2Vzc2lvbi5wZXJtaXNzaW9uTW9kZSxcblx0XHRcdFx0dGhpcy5fbWV0YWRhdGFTdG9yZSxcblx0XHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHBhcmVudFNlc3Npb24uYWRkaXRpb25hbERpcmVjdG9yaWVzLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiB0aGlzLl9zZWVkU2Vzc2lvbkVudHJ5KHNlc3Npb25JZCwgc2Vzc2lvbiwgbWFpblNlc3Npb24pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkICsgbWF0ZXJpYWxpemUgdGhlIHBlZXIgY2hhdCdzIGxpdmUge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0sXG5cdCAqIHJlc3VtaW5nIGl0cyBwZXJzaXN0ZWQgU0RLIGNoYXQgd2hlbiBvbmUgYWxyZWFkeSBleGlzdHMgb24gZGlza1xuXHQgKiAoZm9ya2VkIG9yIHJlc3RvcmVkIGNoYXRzKSBvciBzdGFydGluZyBmcmVzaCBvdGhlcndpc2UuIFRoZSBjYWxsZXIgTVVTVFxuXHQgKiBob2xkIHRoZSBwZXItY2hhdCAoYGNoYXQudG9TdHJpbmcoKWApIHtAbGluayBfc2Vzc2lvblNlcXVlbmNlcn0gbG9jayBzb1xuXHQgKiBjb25jdXJyZW50IGZpcnN0IHNlbmRzIGNvbGxhcHNlIGludG8gb25lIG1hdGVyaWFsaXplIGFuZCB0ZWFyZG93biBjYW4ndFxuXHQgKiByYWNlIHRoZSBidWlsZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21hdGVyaWFsaXplQ2hhdExvY2tlZChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IFByb21pc2U8Q2xhdWRlQWdlbnRTZXNzaW9uPiB7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHRoaXMuX2Vuc3VyZVNlc3Npb25FbnRyeShzZXNzaW9uKTtcblx0XHRjb25zdCBleGlzdGluZyA9IGVudHJ5LmdldFBlZXJDaGF0KGNoYXRLZXkpO1xuXHRcdGlmIChleGlzdGluZz8uaXNQaXBlbGluZVJlYWR5KSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gZXhpc3RpbmcgPz8gYXdhaXQgdGhpcy5fYnVpbGRQcm92aXNpb25hbENoYXQoc2Vzc2lvbiwgY2hhdCwgZW50cnkpO1xuXHRcdC8vIFJlc3VtZSB3aGVuIHRoZSBTREsgYWxyZWFkeSBoYXMgYSB0cmFuc2NyaXB0IGZvciB0aGlzIGNoYXRcblx0XHQvLyAoZm9ya2VkIG9yIHJlc3RvcmVkKTsgb3RoZXJ3aXNlIG1hdGVyaWFsaXplIGEgZnJlc2ggb25lLlxuXHRcdGNvbnN0IHNka0luZm8gPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25JbmZvKGNoYXRTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5fZW5zdXJlQXV0aGVudGljYXRlZCgpO1xuXHRcdGNvbnN0IGNhblVzZVRvb2wgPSB0aGlzLl9tYWtlQ2FuVXNlVG9vbChjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IG9uRWxpY2l0YXRpb24gPSB0aGlzLl9tYWtlT25FbGljaXRhdGlvbihjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjaGF0U2Vzc2lvbi5tYXRlcmlhbGl6ZSh7IHRyYW5zcG9ydCwgY2FuVXNlVG9vbCwgb25FbGljaXRhdGlvbiwgaXNSZXN1bWU6ICEhc2RrSW5mbywgc2VydmVyVG9vbEhvc3Q6IHRoaXMuX3NlcnZlclRvb2xIb3N0IH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZW50cnkuZGlzcG9zZVBlZXJDaGF0KGNoYXRLZXkpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hhdFNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgYSBwcm92aXNpb25hbCBwZWVyLWNoYXQge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gZnJvbSBpdHMgbGl2ZSAob3Jcblx0ICogbGVnYWN5KSBiYWNraW5nICsgb3ZlcmxheTogaXRzIGBzZXNzaW9uVXJpYCBpcyB0aGUgcmVhbCBwYXJlbnQgc2Vzc2lvbiBVUklcblx0ICogYW5kIGl0cyBgY2hhdENoYW5uZWxVcmlgIGlzIHRoZSBjaGF0J3Mgb3duIGNoYW5uZWwgKG5ldmVyIG92ZXJsb2FkZWQpLFxuXHQgKiBiYWNrZWQgYnkgdGhlIHJlc29sdmVkIFNESyBjaGF0IGlkLiBSZWdpc3RlcnMgaXQgb24gdGhlIG93bmluZ1xuXHQgKiB7QGxpbmsgQ2xhdWRlU2Vzc2lvbkVudHJ5fTsgdGhlIGNhbGxlciBtYXRlcmlhbGl6ZXMgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9idWlsZFByb3Zpc2lvbmFsQ2hhdChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgZW50cnk6IENsYXVkZVNlc3Npb25FbnRyeSk6IFByb21pc2U8Q2xhdWRlQWdlbnRTZXNzaW9uPiB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX3Jlc29sdmVDaGF0QmFja2luZyhjaGF0KTtcblx0XHRpZiAoIWluZm8pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NsYXVkZV0gbm8gYmFja2luZyBjaGF0IGZvciBjaGF0ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVBhcmVudFNlc3Npb24oc2Vzc2lvbiwgQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblx0XHRsZXQgb3ZlcmxheTogSUNsYXVkZVNlc3Npb25PdmVybGF5ID0ge307XG5cdFx0dHJ5IHtcblx0XHRcdG92ZXJsYXkgPSBhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLnJlYWQoY2hhdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGNoYXQgb3ZlcmxheSByZWFkIGZhaWxlZCBmb3IgJHtjaGF0LnRvU3RyaW5nKCl9OyBjb250aW51aW5nIHdpdGggZGVmYXVsdHNgLCBlcnIpO1xuXHRcdH1cblx0XHRjb25zdCBwZXJtaXNzaW9uTW9kZSA9IHJlYWRDbGF1ZGVQZXJtaXNzaW9uTW9kZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgY2hhdCkgPz8gb3ZlcmxheS5wZXJtaXNzaW9uTW9kZSA/PyBwYXJlbnRTZXNzaW9uLnBlcm1pc3Npb25Nb2RlO1xuXHRcdC8vIE92ZXJsYXkgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBiYWNraW5nOiBgY2hhbmdlTW9kZWxgIGFsd2F5cyB3cml0ZXNcblx0XHQvLyB0aGUgb3ZlcmxheSBmaXJzdCAodmlhIGBzZXRNb2RlbGAgb3IgYF9tZXRhZGF0YVN0b3JlLndyaXRlYCkgYW5kIHRoZW5cblx0XHQvLyB0aGUgYmFja2luZy4gSWYgdGhlIGJhY2tpbmcgdXBkYXRlIGlzIGxvc3QsIHRoZSBvdmVybGF5IGFscmVhZHkgaG9sZHNcblx0XHQvLyB0aGUgbmV3ZXN0IG1vZGVsOyBwcmVmZXJyaW5nIGl0IGhlcmUgZW5zdXJlcyBhIG1vZGVsIGNoYW5nZSBpcyBuZXZlclxuXHRcdC8vIHNpbGVudGx5IHJldmVydGVkIGFmdGVyIGEgcmVzdGFydC5cblx0XHRjb25zdCBtb2RlbCA9IG92ZXJsYXkubW9kZWwgPz8gaW5mby5tb2RlbDtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbiA9IENsYXVkZUFnZW50U2Vzc2lvbi5jcmVhdGVQcm92aXNpb25hbChcblx0XHRcdGluZm8uc2RrU2Vzc2lvbklkLFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdGNoYXQsXG5cdFx0XHRwYXJlbnRTZXNzaW9uLndvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRwYXJlbnRTZXNzaW9uLnByb2plY3QsXG5cdFx0XHRtb2RlbCxcblx0XHRcdG92ZXJsYXkuYWdlbnQgPz8gcGFyZW50U2Vzc2lvbi5hZ2VudCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENhbGxUb29sUmVzdWx0PigpLFxuXHRcdFx0cGVybWlzc2lvbk1vZGUsXG5cdFx0XHR0aGlzLl9tZXRhZGF0YVN0b3JlLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRwYXJlbnRTZXNzaW9uLmFkZGl0aW9uYWxEaXJlY3Rvcmllcyxcblx0XHQpO1xuXHRcdGVudHJ5LnJlZ2lzdGVyUGVlckNoYXQoY2hhdC50b1N0cmluZygpLCB0aGlzLl93aXJlRW50cnkoY2hhdFNlc3Npb24pKTtcblx0XHRyZXR1cm4gY2hhdFNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIGEgcGVlciBjaGF0J3MgbGl2ZSBiYWNraW5nIG1vZGVsIGFuZCBwdXNoIHRoZSByZWZyZXNoZWQgb3BhcXVlXG5cdCAqIGBwcm92aWRlckRhdGFgIGJsb2IgdG8gdGhlIG9yY2hlc3RyYXRvciAodmlhXG5cdCAqIHtAbGluayBvbkRpZENoYW5nZUNoYXREYXRhfSkgc28gdGhlIGR1cmFibGUgY2F0YWxvZyBzdGF5cyBpbiBzeW5jLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlQ2hhdEJhY2tpbmdNb2RlbChjaGF0OiBVUkksIG1vZGVsOiBNb2RlbFNlbGVjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJhY2tpbmcgPSB0aGlzLl9yZXNvbHZlQ2hhdEJhY2tpbmcoY2hhdCk7XG5cdFx0aWYgKCFiYWNraW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVwZGF0ZWQ6IElQZXJzaXN0ZWRDaGF0ID0geyAuLi5iYWNraW5nLCBtb2RlbCB9O1xuXHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdC50b1N0cmluZygpLCB1cGRhdGVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNoYXREYXRhLmZpcmUoeyBjaGF0OiBjaGF0LCBwcm92aWRlckRhdGE6IGVuY29kZVByb3ZpZGVyRGF0YSh1cGRhdGVkKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1hdHRhY2ggdGhlIGluLW1lbW9yeSBiYWNraW5nIGZvciBhIHBlZXIgY2hhdCBvbiBzZXNzaW9uIHJlc3RvcmUsXG5cdCAqIGRlY29kaW5nIHRoZSBvcGFxdWUgYHByb3ZpZGVyRGF0YWAgdGhlIG9yY2hlc3RyYXRvciBwZXJzaXN0ZWQgYXQgY3JlYXRpb25cblx0ICogKG9yIHRoZSBsYXRlc3Qge0BsaW5rIG9uRGlkQ2hhbmdlQ2hhdERhdGF9KS4gQWZ0ZXIgdGhpcyByZXNvbHZlcyB0aGVcblx0ICogY2hhdCdzIGJhY2tpbmcgU0RLIGNoYXQgY2FuIGJlIHJlc3VtZWQgbGF6aWx5IG9uIGl0cyBmaXJzdCBzZW5kLlxuXHQgKiBCZXN0LWVmZm9ydCBcdTIwMTQgYSBjb3JydXB0L3Vua25vd24gYmxvYiBpcyBsb2dnZWQgYW5kIGRyb3BwZWQgcmF0aGVyIHRoYW5cblx0ICogdGhyb3duLlxuXHQgKi9cblx0YXN5bmMgbWF0ZXJpYWxpemVDaGF0KGNoYXQ6IFVSSSwgcHJvdmlkZXJEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaXNEZWZhdWx0Q2hhdFVyaShjaGF0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0SW5mbyA9IHBhcnNlQ2hhdFVyaShjaGF0KTtcblx0XHRpZiAoIWNoYXRJbmZvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlckRhdGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiYWNraW5nID0gZGVjb2RlUHJvdmlkZXJEYXRhKHByb3ZpZGVyRGF0YSk7XG5cdFx0aWYgKCFiYWNraW5nKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIG1hdGVyaWFsaXplQ2hhdDogZHJvcHBpbmcgY29ycnVwdCBwcm92aWRlckRhdGEgZm9yICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXQudG9TdHJpbmcoKSwgYmFja2luZyk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0LyoqXG5cdCAqIFRlc3Qtb25seSBhY2Nlc3NvciBmb3IgdGhlIG1hdGVyaWFsaXplZCB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9ufS5cblx0ICogUGhhc2UgNiBzZWN0aW9uIDUuMSBUZXN0IDEwIG5lZWRzIHRvIGluc3BlY3QgYF9pc1Jlc3VtZWRgIGRpcmVjdGx5IGJlY2F1c2Vcblx0ICogUGhhc2UgNiBoYXMgbm8gdGVhcmRvd24rcmVjcmVhdGUgZmxvdyB5ZXQgdG8gb2JzZXJ2ZSBpdHMgZWZmZWN0XG5cdCAqICh0aGUgZmxhZyBkcml2ZXMgYE9wdGlvbnMucmVzdW1lID0gc2Vzc2lvbklkYCBpbiBQaGFzZSA3KykuIE1hcmtlZFxuXHQgKiBgRm9yVGVzdGluZ2Agc28gdGhlIHByb2R1Y3Rpb24gc3VyZmFjZSBzdGF5cyB1bmF3YXJlIG9mIGl0c1xuXHQgKiBleGlzdGVuY2U7IHRoZSBwcm90b2NvbCBzdXJmYWNlIChgSUFnZW50YCkgZG9lcyBub3QgaW5jbHVkZSBpdC5cblx0ICovXG5cdGdldFNlc3Npb25Gb3JUZXN0aW5nKHNlc3Npb246IFVSSSk6IENsYXVkZUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2VzcyA9IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpPy5kZWZhdWx0Q2hhdDtcblx0XHRyZXR1cm4gc2Vzcz8uaXNQaXBlbGluZVJlYWR5ID8gc2VzcyA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaGFzZSAxMyBcdTIwMTQgcmVjb25zdHJ1Y3QgdGhlIGZ1bGwgdHVybiBoaXN0b3J5IGZyb20gdGhlIFNESydzIG9uLWRpc2tcblx0ICogSlNPTkwgdHJhbnNjcmlwdC4gT3V0LW9mLXByb2Nlc3M6IG5vIGxpdmUgYFF1ZXJ5YCByZXF1aXJlZC4gU3ViYWdlbnRcblx0ICogVVJJcyAoYDxwYXJlbnQ+L3N1YmFnZW50Lzx0b29sQ2FsbElkPmApIHRocm93IGBUT0RPOiBQaGFzZSAxMmAgdW50aWxcblx0ICogUGhhc2UgMTIgd2lyZXMgYGdldFN1YmFnZW50TWVzc2FnZXNgLiBQcm92aXNpb25hbCBzZXNzaW9ucyByZXR1cm4gYFtdYC5cblx0ICogUmVzaWxpZW50OiBhbnkgZmFpbHVyZSAodHJhbnNjcmlwdCBmZXRjaCwgbWFwcGluZywgYmFja2ZpbGwpIHdhcm4tbG9nc1xuXHQgKiBhbmQgcmV0dXJucyBgW11gIHJhdGhlciB0aGFuIHByb3BhZ2F0aW5nIFx1MjAxNCBtaXJyb3JzIGBsaXN0U2Vzc2lvbnNgLlxuXHQgKi9cblx0YXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Ly8gRG9uJ3QgdHJpZ2dlciBhIGNvbGQgU0RLIGRvd25sb2FkIGp1c3QgdG8gcmVjb25zdHJ1Y3QgYSB0cmFuc2NyaXB0XG5cdFx0Ly8gZHVyaW5nIHJlc3RvcmUgKHRoZSByZW5kZXJlciBzdWJzY3JpYmVzIHRvIHRoZSBsYXN0LWFjdGl2ZSBzZXNzaW9uXG5cdFx0Ly8gb24gc3RhcnR1cCkuIE1pcnJvcnMgYGxpc3RTZXNzaW9uc2AgLyBgZ2V0U2Vzc2lvbk1ldGFkYXRhYDogd2hlbiB0aGVcblx0XHQvLyBTREsgaXNuJ3QgbG9jYWwgeWV0LCBkZWZlciB3aXRoIGFuIGVtcHR5IHRyYW5zY3JpcHQuIFRoZSBkb3dubG9hZFxuXHRcdC8vIGZpcmVzICh3aXRoIGhvc3QtbGV2ZWwgcHJvZ3Jlc3MpIG9uY2UgdGhlIHVzZXIgc2VuZHMgdGhlIGZpcnN0XG5cdFx0Ly8gbWVzc2FnZSwgYWZ0ZXIgd2hpY2ggdGhlIHRyYW5zY3JpcHQgcmUtaHlkcmF0ZXMgb24gdGhlIG5leHQgcmVzdG9yZS5cblx0XHRpZiAoIShhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmNhbkxvYWRXaXRob3V0RG93bmxvYWQoKSkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NsYXVkZV0gU0RLIG5vdCBkb3dubG9hZGVkIHlldDsgZGVmZXJyaW5nIHNlc3Npb24gbWVzc2FnZXMgdW50aWwgYSBzZXNzaW9uIHRyaWdnZXJzIHRoZSBkb3dubG9hZCcpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHQvLyBBZGRpdGlvbmFsIHBlZXIgY2hhdDogcmVjb25zdHJ1Y3QgaXRzIG93biBTREsgY2hhdCAocmVzb2x2ZWRcblx0XHQvLyBmcm9tIHRoZSBjYXRhbG9nL2luLW1lbW9yeSksIHJvdXRlZCB0byB0aGUgY2hhdCBjaGFubmVsIFVSSS4gU2hhcmVzXG5cdFx0Ly8gdGhlIHNhbWUgZmV0Y2grbWFwIHBhdGggYXMgdGhlIGRlZmF1bHQgY2hhdCB2aWEgYF9yZWNvbnN0cnVjdFR1cm5zYC5cblx0XHRpZiAoaXNTdWJhZ2VudFNlc3Npb24oc2Vzc2lvbikpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgcGFyZW50U2Vzc2lvbiA9IHBhcnNlZCA/IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQocGFyc2VkLnBhcmVudFNlc3Npb24pKT8uZGVmYXVsdENoYXQgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXBhcmVudFNlc3Npb24pIHtcblx0XHRcdFx0Ly8gUGFyZW50IHNlc3Npb24gaXMgZ29uZSAoZGlzcG9zZWQgb3IgbmV2ZXIgbWF0ZXJpYWxpemVkKS5cblx0XHRcdFx0Ly8gVGhlIHJlZ2lzdHJ5IHRoYXQgaG9sZHMgdGhlIGFnZW50SWQgY2FjaGUgbGl2ZXMgb24gdGhlXG5cdFx0XHRcdC8vIHBhcmVudCBzZXNzaW9uLCBzbyB3ZSBjYW5ub3QgcmVzb2x2ZSB0aGUgc3ViYWdlbnQuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gZ2V0U2Vzc2lvbk1lc3NhZ2VzOiBwYXJlbnQgc2Vzc2lvbiBub3QgZm91bmQgZm9yIHN1YmFnZW50ICR7c2Vzc2lvbi50b1N0cmluZygpfSAocmVnaXN0cnkgdW5hdmFpbGFibGUpYCk7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBnZXRTdWJhZ2VudFRyYW5zY3JpcHQoc2Vzc2lvbiwgcGFyZW50U2Vzc2lvbi5zdWJhZ2VudHMsIHRoaXMuX3Nka1NlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gZ2V0U3ViYWdlbnRUcmFuc2NyaXB0IHRocmV3IGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdCA9IHBhcnNlQ2hhdFVyaShzZXNzaW9uKSA/IHNlc3Npb24gOiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0Y29uc3QgY2hhdEluZm8gPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFjaGF0SW5mbykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uVXJpID0gVVJJLnBhcnNlKGNoYXRJbmZvLnNlc3Npb24pO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChwYXJlbnRTZXNzaW9uVXJpKTtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fZ2V0Q2hhdENvbnRleHQoY2hhdCk7XG5cdFx0aWYgKGNvbnRleHQuaXNQZWVyQ2hhdCkge1xuXHRcdFx0Y29uc3Qgc2RrSWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdFNka0lkKHBhcmVudFNlc3Npb25VcmksIGNoYXQpO1xuXHRcdFx0aWYgKCFzZGtJZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0dXJucyA9IGF3YWl0IHRoaXMuX3JlY29uc3RydWN0VHVybnMoc2RrSWQsIGNoYXQsIGNvbnRleHQudGFyZ2V0KTtcblx0XHRcdGNvbnN0IHNpZGVDaGF0ID0gdGhpcy5fcmVzb2x2ZUNoYXRCYWNraW5nKGNoYXQpPy5zaWRlQ2hhdDtcblx0XHRcdHJldHVybiBzdHJpcFNpZGVDaGF0Q29udGV4dCh0dXJucy5zbGljZShzaWRlQ2hhdD8uaW5oZXJpdGVkVHVybkNvdW50ID8/IDApLCBzaWRlQ2hhdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VzcyA9IGNvbnRleHQudGFyZ2V0O1xuXHRcdGlmIChzZXNzICYmICFzZXNzLmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0Ly8gUHJvdmlzaW9uYWwgc2Vzc2lvbjogdGhlIFNESyBjaGF0IGhhcyBuZXZlciBiZWVuIG1hdGVyaWFsaXplZCwgc29cblx0XHRcdC8vIHRoZXJlIGlzIG5vIG9uLWRpc2sgdHJhbnNjcmlwdCB0byByZWFkLiBMb2dnZWQgYmVjYXVzZSBhbiBlbXB0eVxuXHRcdFx0Ly8gdHJhbnNjcmlwdCBpcyBvdGhlcndpc2UgaW5kaXN0aW5ndWlzaGFibGUgZnJvbSBhIGZhaWxlZCByZWFkLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlXSBnZXRTZXNzaW9uTWVzc2FnZXM6IGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9IGlzIG5vdCBtYXRlcmlhbGl6ZWQgeWV0OyByZXR1cm5pbmcgbm8gdHVybnNgKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Ly8gRGVmYXVsdCBjaGF0OiBpdHMgU0RLIGNoYXQgaWQgaXMgdGhlIHNlc3Npb24gaWQuXG5cdFx0cmV0dXJuIHRoaXMuX3JlY29uc3RydWN0VHVybnMoc2Vzc2lvbklkLCBwYXJlbnRTZXNzaW9uVXJpLCBzZXNzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGZXRjaCBhIGNoYXQncyBTREsgdHJhbnNjcmlwdCAoe0BsaW5rIHNka1Nlc3Npb25JZH0pIGFuZCBtYXAgaXQgdG9cblx0ICogcHJvdG9jb2wge0BsaW5rIFR1cm59cyByb3V0ZWQgdG8ge0BsaW5rIHJvdXRpbmdVcml9ICh0aGUgc2Vzc2lvbiBvciBjaGF0XG5cdCAqIGNoYW5uZWwgVVJJKS4gV2hlbiB7QGxpbmsgcHJpbWVPbn0gaXMgc3VwcGxpZWQgKHRoZSBtYXRlcmlhbGl6ZWQgb3duaW5nXG5cdCAqIHNlc3Npb24pLCBpdHMgc3ViYWdlbnQgcmVnaXN0cnkgaXMgcHJpbWVkIGZyb20gdGhlIGFnZW50SWQgc3VmZml4ZXMgdGhlXG5cdCAqIFNESyBlbmNvZGVkIGluIFRhc2sgdG9vbF9yZXN1bHQgYmxvY2tzLiBSZXNpbGllbnQ6IGFueSBmYWlsdXJlIHdhcm4tbG9nc1xuXHQgKiBhbmQgcmV0dXJucyBgW11gIHJhdGhlciB0aGFuIHByb3BhZ2F0aW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25zdHJ1Y3RUdXJucyhzZGtTZXNzaW9uSWQ6IHN0cmluZywgcm91dGluZ1VyaTogVVJJLCBwcmltZU9uOiBDbGF1ZGVBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGxldCBtZXNzYWdlcztcblx0XHR0cnkge1xuXHRcdFx0bWVzc2FnZXMgPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25NZXNzYWdlcyhzZGtTZXNzaW9uSWQsIHsgaW5jbHVkZVN5c3RlbU1lc3NhZ2VzOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlXSBnZXRTZXNzaW9uTWVzc2FnZXMgU0RLIGZldGNoIGZhaWxlZCBmb3IgJHtzZGtTZXNzaW9uSWR9YCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0bGV0IHR1cm5zOiByZWFkb25seSBUdXJuW107XG5cdFx0dHJ5IHtcblx0XHRcdHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgcm91dGluZ1VyaSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBEZWZlbnNpdmUgYm91bmRhcnk6IGEgc2luZ2xlIG1hbGZvcm1lZCBTREsgbWVzc2FnZSBtdXN0IG5vdFxuXHRcdFx0Ly8gYmxvdyB1cCB0aGUgZW50aXJlIHRyYW5zY3JpcHQgcmVhZC5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gcmVwbGF5IG1hcHBlciB0aHJldyBmb3IgJHtzZGtTZXNzaW9uSWR9YCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Ly8gQWx3YXlzIGEgYnVnOiB0aGUgU0RLIGhhbmRlZCBiYWNrIGEgdHJhbnNjcmlwdCBidXQgcmVwbGF5IHByb2R1Y2VkXG5cdFx0Ly8gbm90aGluZywgd2hpY2ggc3VyZmFjZXMgdG8gdGhlIHVzZXIgYXMgYSBjaGF0IHRoYXQgb3BlbnMgY29tcGxldGVseVxuXHRcdC8vIGVtcHR5LiBXYXJuIHNvIHRoZSBuZXh0IHJlcG9ydCBpcyBkaWFnbm9zYWJsZSBmcm9tIHRoZSBsb2cgYWxvbmUuXG5cdFx0aWYgKHR1cm5zLmxlbmd0aCA9PT0gMCAmJiBtZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIHJlcGxheSBwcm9kdWNlZCBubyB0dXJucyBmcm9tICR7bWVzc2FnZXMubGVuZ3RofSB0cmFuc2NyaXB0IG1lc3NhZ2UocykgZm9yICR7c2RrU2Vzc2lvbklkfTsgY2hhdCB3aWxsIHJlbmRlciBlbXB0eWApO1xuXHRcdH1cblx0XHQvLyBBIGJ1ZyBpbiBgcHJpbWVGcm9tVHJhbnNjcmlwdGAgTVVTVCBOT1QgYnJlYWsgYW4gb3RoZXJ3aXNlLXN1Y2Nlc3NmdWxcblx0XHQvLyB0cmFuc2NyaXB0IHJlYWQuXG5cdFx0dHJ5IHtcblx0XHRcdHByaW1lT24/LnN1YmFnZW50cy5wcmltZUZyb21UcmFuc2NyaXB0KHR1cm5zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gcHJpbWVGcm9tVHJhbnNjcmlwdCB0aHJldyBmb3IgJHtzZGtTZXNzaW9uSWR9YCwgZXJyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHR1cm5zO1xuXHR9XG5cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+IHtcblx0XHQvLyBQbGFuIHNlY3Rpb24gMy4zLjI6IFNESyBpcyB0aGUgc291cmNlIG9mIHRydXRoOyB3ZSBkZWxpYmVyYXRlbHkgZG9cblx0XHQvLyBOT1QgZmlsdGVyIGVudHJpZXMgdGhhdCBsYWNrIGEgcGVyLXNlc3Npb24gREIgXHUyMDE0IGV4dGVybmFsIENsYXVkZSBDb2RlXG5cdFx0Ly8gQ0xJIHNlc3Npb25zIGhhdmUgbm8gREIgYW5kIG11c3Qgc3RpbGwgc3VyZmFjZSAoUGhhc2UtNSBleGl0XG5cdFx0Ly8gY3JpdGVyaW9uKS4gVGhlIFNESyBlbnRyeSBzdXBwbGllcyB0aGUgYXV0aG9yaXRhdGl2ZSBwcmltYXJ5IGRpcmVjdG9yeTtcblx0XHQvLyBhbiBvcHRpb25hbCBwZXItc2Vzc2lvbiBvdmVybGF5IGh5ZHJhdGVzIHRoZSBhZGRpdGlvbmFsLWRpcmVjdG9yeSB0YWlsLlxuXHRcdC8vIEV4dGVybmFsIHNlc3Npb25zIHdpdGhvdXQgYW4gb3ZlcmxheSByZW1haW4gdmFsaWQgc2luZ2xlLXJvb3QgZW50cmllcy5cblx0XHQvL1xuXHRcdC8vIGBBZ2VudFNlcnZpY2UubGlzdFNlc3Npb25zYCBmYW5zIG91dCBhY3Jvc3MgYWxsIHByb3ZpZGVycyB2aWFcblx0XHQvLyBgUHJvbWlzZS5hbGxgIChhZ2VudFNlcnZpY2UudHM6MjAyLTIwNCkuIElmIG91ciBTREsgZHluYW1pY1xuXHRcdC8vIGltcG9ydCBmYWlscyAoY29ycnVwdCBpbnN0YWxsLCBtaXNzaW5nIG9wdGlvbmFsIGRlcCkgYW5kIHdlIGxldFxuXHRcdC8vIGl0IHJlamVjdCwgKmV2ZXJ5KiBwcm92aWRlcidzIHNlc3Npb24gbGlzdCBkaXNhcHBlYXJzIFx1MjAxNCB0aGVcblx0XHQvLyBzaWJsaW5nIENvcGlsb3QgcHJvdmlkZXIgZ2V0cyBudWtlZCB0b28uIENhdGNoIGFuZCBsb2cgaW5zdGVhZC5cblx0XHRsZXQgc2RrRW50cmllczogcmVhZG9ubHkgU0RLU2Vzc2lvbkluZm9bXTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gRG9uJ3QgdHJpZ2dlciBhIGNvbGQgU0RLIGRvd25sb2FkIGp1c3QgdG8gcG9wdWxhdGUgdGhlIHNlc3Npb25cblx0XHRcdC8vIGxpc3QgYXQgc3RhcnR1cC4gV2hlbiB0aGUgU0RLIGlzbid0IGxvY2FsIHlldCwgc3VyZmFjZSBhbiBlbXB0eVxuXHRcdFx0Ly8gbGlzdDsgdGhlIGRvd25sb2FkIGZpcmVzICh3aXRoIGhvc3QtbGV2ZWwgcHJvZ3Jlc3MpIG9uY2UgdGhlIHVzZXJcblx0XHRcdC8vIHN0YXJ0cyBhIHNlc3Npb24sIGFuZCB0aGUgbmV4dCBgbGlzdFNlc3Npb25zYCBcdTIwMTQgZHJpdmVuIGJ5IHRoZVxuXHRcdFx0Ly8gcmVuZGVyZXIncyBwb3N0LXR1cm4gcmVmcmVzaCBcdTIwMTQgcmV0dXJucyB0aGUgZnVsbCBsaXN0LlxuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fc2RrU2VydmljZS5jYW5Mb2FkV2l0aG91dERvd25sb2FkKCkpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NsYXVkZV0gU0RLIG5vdCBkb3dubG9hZGVkIHlldDsgZGVmZXJyaW5nIHNlc3Npb24gbGlzdCB1bnRpbCBhIHNlc3Npb24gdHJpZ2dlcnMgdGhlIGRvd25sb2FkJyk7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHNka0VudHJpZXMgPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmxpc3RTZXNzaW9ucygpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ2xhdWRlXSBTREsgbGlzdFNlc3Npb25zIGZhaWxlZDsgc3VyZmFjaW5nIGVtcHR5IGxpc3QnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoc2RrRW50cmllcy5tYXAoZW50cnkgPT4ge1xuXHRcdFx0Y29uc3QgbWV0YSA9IHRoaXMuX21ldGFkYXRhU3RvcmUucHJvamVjdChlbnRyeSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd2l0aFBlcnNpc3RlZFdvcmtpbmdEaXJlY3RvcmllcyhtZXRhLnNlc3Npb24sIG1ldGEpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaGFzZSA2LjEgLyBDeWNsZSBENCBcdTIwMTQgcGVyLXNlc3Npb24gbG9va3VwLiBNaXJyb3JzXG5cdCAqIHtAbGluayBDb3BpbG90QWdlbnQuZ2V0U2Vzc2lvbk1ldGFkYXRhfSBidXQgYWNjZXB0cyB0aGVcblx0ICogZXh0ZXJuYWwtQ0xJIGNhc2U6IGEgc2Vzc2lvbiB0aGF0IGV4aXN0cyBvbiBkaXNrIHZpYSB0aGUgcmF3XG5cdCAqIEFudGhyb3BpYyBDTEkgaGFzIG5vIHBlci1zZXNzaW9uIERCLCBzbyB3ZSBNVVNUIE5PVCBnYXRlIG9uIHRoZVxuXHQgKiBzaWRlY2FyICh0aGUgd2F5IENvcGlsb3QncyB2YXJpYW50IGRvZXMpLiBUaGUgU0RLIGlzIHRoZSBzb3VyY2Vcblx0ICogb2YgdHJ1dGggZm9yIGV4aXN0ZW5jZS5cblx0ICpcblx0ICogVGhlIFNESyBlbnRyeSBzdXBwbGllcyB0aGUgYXV0aG9yaXRhdGl2ZSBwcmltYXJ5IGRpcmVjdG9yeTsgYW4gb3B0aW9uYWxcblx0ICogcGVyLXNlc3Npb24gb3ZlcmxheSBoeWRyYXRlcyB0aGUgYWRkaXRpb25hbC1kaXJlY3RvcnkgdGFpbC4gRXh0ZXJuYWxcblx0ICogc2Vzc2lvbnMgd2l0aG91dCBhbiBvdmVybGF5IHJlbWFpbiB2YWxpZCBzaW5nbGUtcm9vdCBlbnRyaWVzLiBGYWlsdXJlcyBpblxuXHQgKiB0aGUgU0RLIGxvb2t1cCBwcm9wYWdhdGUgKHRoZSBjYWxsZXIgaXMgZG9pbmcgYSBzaW5nbGUgdGFyZ2V0ZWQgZmV0Y2ggYW5kXG5cdCAqIHNob3VsZCBsZWFybiB0aGF0IHRoZSBTREsgbW9kdWxlIGlzIGJyb2tlbikuXG5cdCAqL1xuXHRhc3luYyBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBEb24ndCB0cmlnZ2VyIGEgY29sZCBTREsgZG93bmxvYWQganVzdCB0byBoeWRyYXRlIHNlc3Npb24gbWV0YWRhdGFcblx0XHQvLyBkdXJpbmcgcmVzdG9yZSAodGhlIHJlbmRlcmVyIHN1YnNjcmliZXMgdG8gdGhlIGxhc3QtYWN0aXZlIHNlc3Npb25cblx0XHQvLyBvbiBzdGFydHVwKS4gTWlycm9ycyBgbGlzdFNlc3Npb25zYCAvIGBnZXRTZXNzaW9uTWVzc2FnZXNgOiB3aGVuIHRoZVxuXHRcdC8vIFNESyBpc24ndCBsb2NhbCB5ZXQsIGRlZmVyLiBUaGUgZG93bmxvYWQgZmlyZXMgKHdpdGggaG9zdC1sZXZlbFxuXHRcdC8vIHByb2dyZXNzKSBvbmNlIHRoZSB1c2VyIHNlbmRzIHRoZSBmaXJzdCBtZXNzYWdlLCBhZnRlciB3aGljaCB0aGVcblx0XHQvLyBzZXNzaW9uIHJlLWh5ZHJhdGVzIG9uIHRoZSBuZXh0IHJlc3RvcmUuXG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fc2RrU2VydmljZS5jYW5Mb2FkV2l0aG91dERvd25sb2FkKCkpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDbGF1ZGVdIFNESyBub3QgZG93bmxvYWRlZCB5ZXQ7IGRlZmVycmluZyBzZXNzaW9uIG1ldGFkYXRhIHVudGlsIGEgc2Vzc2lvbiB0cmlnZ2VycyB0aGUgZG93bmxvYWQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBzZGtJbmZvID0gYXdhaXQgdGhpcy5fc2RrU2VydmljZS5nZXRTZXNzaW9uSW5mbyhzZXNzaW9uSWQpO1xuXHRcdGlmICghc2RrSW5mbykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhQZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvbiwgdGhpcy5fbWV0YWRhdGFTdG9yZS5wcm9qZWN0KHNka0luZm8pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNZXJnZSB0aGUgcGVyc2lzdGVkIGFkZGl0aW9uYWwgd29ya2luZyBkaXJlY3RvcmllcyAoaW5kZXggMS4uTikgb250byBhXG5cdCAqIHByb2plY3RlZCBtZXRhZGF0YSdzIGB3b3JraW5nRGlyZWN0b3JpZXNgLCBrZWVwaW5nIHRoZSBTREstZGVyaXZlZCBgY3dkYFxuXHQgKiBhcyB0aGUgYXV0aG9yaXRhdGl2ZSBwcmltYXJ5LiBUaGUgU0RLIGNhdGFsb2cgb25seSBzdG9yZXMgYGN3ZGAsIHNvIHRoZVxuXHQgKiB0YWlsIG9mIGEgbXVsdGktcm9vdCBzZXNzaW9uIGxpdmVzIGluIHRoZSBwZXItc2Vzc2lvbiBvdmVybGF5LiBTZXNzaW9uc1xuXHQgKiB3aXRob3V0IGFuIG92ZXJsYXkgKGV4dGVybmFsIENsYXVkZSBDTEksIHNpbmdsZS1yb290KSBhcmUgcmV0dXJuZWQgYXMtaXMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93aXRoUGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb246IFVSSSwgbWV0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGE+IHtcblx0XHRjb25zdCBwcmltYXJ5ID0gbWV0YS53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXByaW1hcnkpIHtcblx0XHRcdHJldHVybiBtZXRhO1xuXHRcdH1cblx0XHRsZXQgb3ZlcmxheTogSUNsYXVkZVNlc3Npb25PdmVybGF5ID0ge307XG5cdFx0dHJ5IHtcblx0XHRcdG92ZXJsYXkgPSBhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLnJlYWQoc2Vzc2lvbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIG92ZXJsYXkgcmVhZCBmYWlsZWQgd2hpbGUgaHlkcmF0aW5nIHdvcmtpbmcgZGlyZWN0b3JpZXMgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfTsgdXNpbmcgU0RLIGN3ZCBvbmx5YCwgZXJyKTtcblx0XHR9XG5cdFx0Y29uc3QgdGFpbCA9IG92ZXJsYXkud29ya2luZ0RpcmVjdG9yaWVzPy5zbGljZSgxKSA/PyBbXTtcblx0XHRpZiAodGFpbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBtZXRhO1xuXHRcdH1cblx0XHRyZXR1cm4geyAuLi5tZXRhLCB3b3JraW5nRGlyZWN0b3JpZXM6IFtwcmltYXJ5LCAuLi50YWlsXSB9O1xuXHR9XG5cblx0cmVzb2x2ZVNlc3Npb25Db25maWcoX3BhcmFtczogSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0Ly8gRGVjaXNpb24gQjUgKHBsYW4gc2VjdGlvbiAzLjMuNSk6IENsYXVkZSBjb2xsYXBzZXMgdGhlIHBsYXRmb3JtJ3Ncblx0XHQvLyBgYXV0b0FwcHJvdmVgIFx1MDBENyBgbW9kZWAgdHdvLWF4aXMgYXBwcm92YWwgc3VyZmFjZSBvbnRvIGEgc2luZ2xlXG5cdFx0Ly8gYHBlcm1pc3Npb25Nb2RlYCBheGlzIG1hdGNoaW5nIHRoZSBTREsncyBuYXRpdmUgZW51bS4gVGhlXG5cdFx0Ly8gcGxhdGZvcm0gYFBlcm1pc3Npb25zYCBrZXkgaXMgcmV1c2VkIHVuY2hhbmdlZCBiZWNhdXNlIHRoZVxuXHRcdC8vIENsYXVkZSBTREsgYWNjZXB0cyBgYWxsb3dlZFRvb2xzYCAvIGBkaXNhbGxvd2VkVG9vbHNgXG5cdFx0Ly8gbmF0aXZlbHkuIFNraXBwZWQ6IEF1dG9BcHByb3ZlLCBNb2RlLCBJc29sYXRpb24sIEJyYW5jaCxcblx0XHQvLyBCcmFuY2hOYW1lSGludCBcdTIwMTQgd29ya2JlbmNoIHBpY2tlcnMga2V5IG9mZiB0aGUgcHJvcGVydHkgbmFtZXNcblx0XHQvLyB0byBkZWNpZGUgd2hhdCB0byByZW5kZXIsIHNvIG9taXR0aW5nIHRoZXNlIGludGVudGlvbmFsbHlcblx0XHQvLyBzdXBwcmVzc2VzIHRoZSBkZWZhdWx0IG1vZGUvYnJhbmNoIFVJIGZvciBDbGF1ZGUgc2Vzc2lvbnMuXG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtYSA9IGNyZWF0ZVNjaGVtYSh7XG5cdFx0XHRbQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZV06IHNjaGVtYVByb3BlcnR5PENsYXVkZVBlcm1pc3Npb25Nb2RlPih7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlJywgXCJBcHByb3ZhbHNcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGVEZXNjcmlwdGlvbicsIFwiSG93IENsYXVkZSBoYW5kbGVzIHRvb2wgYXBwcm92YWxzLlwiKSxcblx0XHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ2FjY2VwdEVkaXRzJywgJ3BsYW4nLCAnYXV0bycsICdieXBhc3NQZXJtaXNzaW9ucyddLFxuXHRcdFx0XHRlbnVtTGFiZWxzOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLmRlZmF1bHQnLCBcIkFzayBCZWZvcmUgRWRpdHNcIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLmFjY2VwdEVkaXRzJywgXCJFZGl0IEF1dG9tYXRpY2FsbHlcIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLnBsYW4nLCBcIlBsYW4gTW9kZVwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUuYXV0bycsIFwiQXV0byBNb2RlXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdjbGF1ZGUuc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uTW9kZS5ieXBhc3NQZXJtaXNzaW9ucycsIFwiQnlwYXNzIFBlcm1pc3Npb25zXCIpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLmRlZmF1bHREZXNjcmlwdGlvbicsIFwiQ2xhdWRlIGFza3MgYmVmb3JlIGVkaXRpbmcgZmlsZXMuXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdjbGF1ZGUuc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uTW9kZS5hY2NlcHRFZGl0c0Rlc2NyaXB0aW9uJywgXCJDbGF1ZGUgZWRpdHMgZmlsZXMgd2l0aG91dCBhc2tpbmcsIGFuZCBhc2tzIGJlZm9yZSB1c2luZyBvdGhlciB0b29scy5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLnBsYW5EZXNjcmlwdGlvbicsIFwiQ2xhdWRlIGNyZWF0ZXMgYSBwbGFuIGJlZm9yZSBtYWtpbmcgY2hhbmdlcy5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLmF1dG9EZXNjcmlwdGlvbicsIFwiQ2xhdWRlIGRlY2lkZXMgd2hldGhlciB0byBhc2sgZm9yIGVhY2ggdG9vbCBvcGVyYXRpb24uXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdjbGF1ZGUuc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uTW9kZS5ieXBhc3NQZXJtaXNzaW9uc0Rlc2NyaXB0aW9uJywgXCJDbGF1ZGUgcnVucyBhbGwgdG9vbHMgd2l0aG91dCBhc2tpbmcuXCIpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0XHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHRcdFx0fSksXG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc106IHBsYXRmb3JtU2Vzc2lvblNjaGVtYS5kZWZpbml0aW9uW1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdmFsdWVzID0gc2Vzc2lvblNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdChfcGFyYW1zLmNvbmZpZywge1xuXHRcdFx0W0NsYXVkZVNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbk1vZGVdOiAnZGVmYXVsdCcgc2F0aXNmaWVzIENsYXVkZVBlcm1pc3Npb25Nb2RlLFxuXHRcdFx0Ly8gUGVybWlzc2lvbnMgaW50ZW50aW9uYWxseSBvbWl0dGVkIGZyb20gZGVmYXVsdHMgXHUyMDE0IGxlYXZlXG5cdFx0XHQvLyB1bnNldCBzbyBhdXRvLWFwcHJvdmFsIGZhbGxzIHRocm91Z2ggdG8gdGhlIGhvc3QtbGV2ZWxcblx0XHRcdC8vIGRlZmF1bHQsIG1hdGVyaWFsaXppbmcgb24gdGhlIHNlc3Npb24gb25seSBvbmNlIHRoZSB1c2VyXG5cdFx0XHQvLyBhcHByb3ZlcyBhIHRvb2wgXCJpbiB0aGlzIFNlc3Npb25cIi5cblx0XHR9KTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0c2NoZW1hOiBzZXNzaW9uU2NoZW1hLnRvUHJvdG9jb2woKSxcblx0XHRcdHZhbHVlcyxcblx0XHR9KTtcblx0fVxuXG5cdHNlc3Npb25Db25maWdDb21wbGV0aW9ucyhfcGFyYW1zOiBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMpOiBQcm9taXNlPFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdC8vIFBsYW4gc2VjdGlvbiAzLjMuNTogQ2xhdWRlJ3Mgb25seSBzY2hlbWEgcHJvcGVydHkgaXMgdGhlXG5cdFx0Ly8gYHBlcm1pc3Npb25Nb2RlYCBzdGF0aWMgZW51bSwgc28gZHluYW1pYyBjb21wbGV0aW9uIGlzXG5cdFx0Ly8gZGVmaW5pdGlvbmFsbHkgZW1wdHkgaW4gUGhhc2UgNS4gQnJhbmNoIGNvbXBsZXRpb24gbGFuZHMgaW5cblx0XHQvLyBQaGFzZSA2IG9uY2Ugd29ya3RyZWUgZXh0cmFjdGlvbiAoc2VjdGlvbiA4KSBpcyBzZXR0bGVkLlxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBpdGVtczogW10gfSk7XG5cdH1cblxuXHRzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBQaGFzZSA2OiBkcmFpbiBwcm92aXNpb25hbCBzZXNzaW9ucyBGSVJTVCBzbyBhbnkgaW4tZmxpZ2h0XG5cdFx0Ly8gYGF3YWl0IHNkay5zdGFydHVwKClgIChraWNrZWQgb2ZmIGJ5IGEgcmFjaW5nIGBzZW5kTWVzc2FnZWApXG5cdFx0Ly8gb2JzZXJ2ZXMgdGhlIGFib3J0IGFuZCB1bndpbmRzLiBFYWNoIHByb3Zpc2lvbmFsIHJlY29yZCdzXG5cdFx0Ly8gQWJvcnRDb250cm9sbGVyIGlzIHdpcmVkIGludG8gT3B0aW9ucy5hYm9ydENvbnRyb2xsZXIgYXRcblx0XHQvLyBtYXRlcmlhbGl6ZSB0aW1lLCBzbyBhYm9ydGluZyBoZXJlIGZsaXBzIHRoZSBzYW1lIHNpZ25hbCB0aGVcblx0XHQvLyBTREsgaXMgcmFjaW5nIG9uLlxuXHRcdC8vXG5cdFx0Ly8gVGhlbiBkcmFpbiB0aGUgbWF0ZXJpYWxpemVkIHNlc3Npb25zIHRocm91Z2ggdGhlIGV4aXN0aW5nXG5cdFx0Ly8gcGVyLXNlc3Npb24ge0BsaW5rIF9kaXNwb3NlU2VxdWVuY2VyfSByb3V0aW5nIFx1MjAxNCB0aGF0IHBhdGhcblx0XHQvLyBpbmhlcml0cyBQaGFzZSA2J3MgcmVhbCBhc3luYyB0ZWFyZG93biAoYFF1ZXJ5LmludGVycnVwdCgpYCxcblx0XHQvLyBpbi1mbGlnaHQgbWV0YWRhdGEgd3JpdGVzKSBvbmNlIHRob3NlIGxhbmQuXG5cdFx0Ly9cblx0XHQvLyBUaGUgcHJvbWlzZSBpcyBtZW1vaXplZCBzbyBjb25jdXJyZW50IGNhbGxlcnMgc2hhcmUgYSBzaW5nbGVcblx0XHQvLyBkcmFpbiBwYXNzIFx1MjAxNCBzZWUgYF9zaHV0ZG93blByb21pc2VgIEpTRG9jLlxuXHRcdC8vIE5PVEU6IGRlY2xhcmVkIHN5bmMgKHJldHVybnMgUHJvbWlzZTx2b2lkPikgcmF0aGVyIHRoYW4gYXN5bmNcblx0XHQvLyBzbyB0aGF0IHJlLWVudHJhbnQgY2FsbHMgcmV0dXJuIHRoZSBjYWNoZWQgcHJvbWlzZSAqaWRlbnRpdHkqLFxuXHRcdC8vIG5vdCBhIGZyZXNoIG91dGVyLWFzeW5jIHdyYXBwZXIgYXJvdW5kIGl0LlxuXHRcdHJldHVybiB0aGlzLl9zaHV0ZG93blByb21pc2UgPz89IChhc3luYyAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdC8vIFByb3Zpc2lvbmFsIGNoYXRzIChhIGRlZmF1bHQgb3IgcGVlciB3aG9zZSBmaXJzdCBzZW5kJ3Ncblx0XHRcdFx0Ly8gbWF0ZXJpYWxpemUgaXMgaW4tZmxpZ2h0KSByYWNlIG9uIHRoZWlyIG93biBhYm9ydCBjb250cm9sbGVyIFx1MjAxNFxuXHRcdFx0XHQvLyBhYm9ydCB0aGVtIHVwIGZyb250IHNvIGEgcXVldWVkIGBzZGsuc3RhcnR1cCgpYCB1bndpbmRzXG5cdFx0XHRcdC8vIHByb21wdGx5IHJhdGhlciB0aGFuIHJ1bm5pbmcgcGFzdCBzaHV0ZG93biB1bnRpbCBpdHMgdGVhcmRvd25cblx0XHRcdFx0Ly8gdGFzayBkZXF1ZXVlcy5cblx0XHRcdFx0Zm9yIChjb25zdCBjaGF0IG9mIGVudHJ5LmFsbENoYXRTZXNzaW9ucygpKSB7XG5cdFx0XHRcdFx0aWYgKCFjaGF0LmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRcdFx0Y2hhdC5hYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkcyA9IFsuLi50aGlzLl9zZXNzaW9ucy5rZXlzKCldO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2Vzc2lvbklkcy5tYXAoc2Vzc2lvbklkID0+XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VTZXF1ZW5jZXIucXVldWUoc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdGVhcmRvd25FbnRyeShzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdHRoaXMuX3BydW5lQWN0aXZlQ2xpZW50SGFuZGxlcyhzZXNzaW9uSWQpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KSk7XG5cdFx0fSkoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRNZXNzYWdlKGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBfc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBgSUFnZW50LnNlbmRNZXNzYWdlYCBkZWNsYXJlcyBgdHVybklkP2AgYnV0IGV2ZXJ5IHByb2R1Y3Rpb24gY2FsbGVyIGluXG5cdFx0Ly8gYEFnZW50U2lkZUVmZmVjdHNgIHN1cHBsaWVzIG9uZS4gR2VuZXJhdGUgYSBmYWxsYmFjayBzbyB0aGVcblx0XHQvLyBzZXNzaW9uLXNpZGUgYFF1ZXVlZFJlcXVlc3QudHVybklkOiBzdHJpbmdgIGludmFyaWFudCBob2xkcyBldmVuIGlmIGFcblx0XHQvLyBoeXBvdGhldGljYWwgY2FsbGVyIGZvcmdldHMgaXQuXG5cdFx0Y29uc3QgZWZmZWN0aXZlVHVybklkID0gdHVybklkID8/IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9nZXRDaGF0Q29udGV4dChjaGF0KTtcblxuXHRcdC8vIEFkZGl0aW9uYWwgcGVlciBjaGF0OiByb3V0ZSB0byBpdHMgb3duIGNoYXQuIEl0cyBTREtcblx0XHQvLyBgc2Vzc2lvbl9pZGAgaXMgdGhlIGNoYXQncyBjaGF0IGlkLCBOT1QgdGhlIHBhcmVudCBzZXNzaW9uJ3MuXG5cdFx0Ly8gSG9sZCB0aGUgcGVyLWNoYXQgbG9jayBhY3Jvc3MgQk9USCBtYXRlcmlhbGl6ZSBhbmQgc2VuZCAobWlycm9yaW5nIHRoZVxuXHRcdC8vIGRlZmF1bHQtY2hhdCBwYXRoIGJlbG93KSBzbyBjb25jdXJyZW50IHNlbmRzIHRvIHRoZSBzYW1lIHBlZXIgY2hhdFxuXHRcdC8vIHNlcmlhbGl6ZSBhbmQgYSByYWNpbmcgZGlzcG9zZUNoYXQvZGlzcG9zZVNlc3Npb24gKHdoaWNoIHF1ZXVlIG9uIHRoZVxuXHRcdC8vIHNhbWUgY2hhdCBrZXkpIHdhaXRzIGZvciB0aGUgaW4tZmxpZ2h0IHR1cm4gaW5zdGVhZCBvZiBkaXNwb3NpbmcgdGhlXG5cdFx0Ly8gc2Vzc2lvbiB1bmRlciBpdC5cblx0XHRpZiAoY29udGV4dC5pc1BlZXJDaGF0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShjb250ZXh0LmNoYXRLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY2hhdFNlc3Npb24gPSBhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZUNoYXRMb2NrZWQoY29udGV4dC5zZXNzaW9uLCBjaGF0KTtcblx0XHRcdFx0Y29uc3Qgc2lkZUNoYXQgPSB0aGlzLl9yZXNvbHZlQ2hhdEJhY2tpbmcoY2hhdCk/LnNpZGVDaGF0O1xuXHRcdFx0XHRjb25zdCB0dXJucyA9IHNpZGVDaGF0ID8gYXdhaXQgdGhpcy5fcmVjb25zdHJ1Y3RUdXJucyhjaGF0U2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQsIGNoYXRTZXNzaW9uKSA6IFtdO1xuXHRcdFx0XHRjb25zdCBzZGtQcm9tcHQgPSBwcmVwYXJlU2lkZUNoYXRQcm9tcHQocHJvbXB0LCB0dXJucywgc2lkZUNoYXQpO1xuXHRcdFx0XHRhd2FpdCBjaGF0U2Vzc2lvbi5zZW5kKHRoaXMuX2J1aWxkU2RrUHJvbXB0KGNoYXRTZXNzaW9uLnNlc3Npb25JZCwgc2RrUHJvbXB0LCBhdHRhY2htZW50cywgZWZmZWN0aXZlVHVybklkKSwgZWZmZWN0aXZlVHVybklkKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFBsYW4gc2VjdGlvbiAzLjguIFRoZSBzZXF1ZW5jZXIgc2NvcGUgaG9sZHMgYWNyb3NzIEJPVEggbWF0ZXJpYWxpemVcblx0XHQvLyBhbmQgYHNlc3Npb24uc2VuZGAgc28gdHdvIGNvbmN1cnJlbnQgZmlyc3QtbWVzc2FnZSBjYWxscyBvbiB0aGVcblx0XHQvLyBzYW1lIHNlc3Npb24gY29sbGFwc2UgaW50byBvbmUgbWF0ZXJpYWxpemUgcGx1cyB0d28gb3JkZXJlZFxuXHRcdC8vIHNlbmRzLiBBIGBkaXNwb3NlU2Vzc2lvbmAgcmFjaW5nIGEgZmlyc3Qgc2VuZCByZWFjaGVzIGl0cyBvd25cblx0XHQvLyBkaXNwb3NlLXNlcXVlbmNlciBldmVudHVhbGx5IGJ1dCB0aGUgaW4tZmxpZ2h0IG1hdGVyaWFsaXplXG5cdFx0Ly8gY29tcGxldGVzIGZpcnN0LlxuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKGNvbnRleHQuc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpLnRhcmdldDtcblx0XHRcdGxldCBzZXNzaW9uOiBDbGF1ZGVBZ2VudFNlc3Npb247XG5cdFx0XHRpZiAoZXhpc3Rpbmc/LmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRzZXNzaW9uID0gZXhpc3Rpbmc7XG5cdFx0XHR9IGVsc2UgaWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdHNlc3Npb24gPSBhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZVByb3Zpc2lvbmFsKGNvbnRleHQuc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuX3Jlc3VtZVNlc3Npb24oY29udGV4dC5zZXNzaW9uSWQsIGNvbnRleHQuc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgc2Vzc2lvbi5zZW5kKHRoaXMuX2J1aWxkU2RrUHJvbXB0KGNvbnRleHQuc2Vzc2lvbklkLCBwcm9tcHQsIGF0dGFjaG1lbnRzLCBlZmZlY3RpdmVUdXJuSWQpLCBlZmZlY3RpdmVUdXJuSWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIEJ1aWxkcyB0aGUgU0RLIHVzZXIgbWVzc2FnZSBmb3IgYSBzZW5kLCBhZGRyZXNzZWQgdG8gYHNka1Nlc3Npb25JZGAuICovXG5cdHByaXZhdGUgX2J1aWxkU2RrUHJvbXB0KHNka1Nlc3Npb25JZDogc3RyaW5nLCBwcm9tcHQ6IHN0cmluZywgYXR0YWNobWVudHM6IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10gfCB1bmRlZmluZWQsIHR1cm5JZDogc3RyaW5nKTogU0RLVXNlck1lc3NhZ2Uge1xuXHRcdGNvbnN0IGNvbnRlbnRCbG9ja3MgPSByZXNvbHZlUHJvbXB0VG9Db250ZW50QmxvY2tzKHByb21wdCwgYXR0YWNobWVudHMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAndXNlcicsXG5cdFx0XHRtZXNzYWdlOiB7IHJvbGU6ICd1c2VyJywgY29udGVudDogY29udGVudEJsb2NrcyB9LFxuXHRcdFx0c2Vzc2lvbl9pZDogc2RrU2Vzc2lvbklkLFxuXHRcdFx0cGFyZW50X3Rvb2xfdXNlX2lkOiBudWxsLFxuXHRcdFx0Ly8gTTEgLyBHbG9zc2FyeTogYFR1cm4uaWQgXHUyMTk0IFNES1VzZXJNZXNzYWdlLnV1aWRgLiBUaGUgU0RLIHR5cGVzIHRoaXNcblx0XHRcdC8vIGFzIGEgYnJhbmRlZCBgJHtzdHJpbmd9LVx1MjAyNmAgdGVtcGxhdGUtbGl0ZXJhbCBhbGlhcyBvZiBOb2RlJ3Ncblx0XHRcdC8vIGBjcnlwdG8uVVVJRGA7IGNhc3QgYXQgdGhlIGJvdW5kYXJ5IHJhdGhlciB0aGFuIHRocmVhZGluZyB0aGUgYnJhbmRcblx0XHRcdC8vIHVwIHRvIGV2ZXJ5IGNhbGxlci5cblx0XHRcdHV1aWQ6IHR1cm5JZCBhcyBgJHtzdHJpbmd9LSR7c3RyaW5nfS0ke3N0cmluZ30tJHtzdHJpbmd9LSR7c3RyaW5nfWAsXG5cdFx0fTtcblx0fVxuXG5cdHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nLCBhcHByb3ZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIGByZXF1ZXN0SWRgIGlzIHRoZSBTREsncyBgdG9vbF91c2VfaWRgIFx1MjAxNCBnbG9iYWxseSB1bmlxdWUsIHNvIGFcblx0XHQvLyBzaW5nbGUgbWF0Y2hpbmcgY2hhdCBpcyBhbGwgd2UgbmVlZC4gU2lsZW50IG9uIG1pc3MgKHdvcmtiZW5jaCBtYXlcblx0XHQvLyBoYXZlIHJhY2VkIGEgc2Vzc2lvbiBkaXNwb3NlKS5cblx0XHRmb3IgKGNvbnN0IHNlc3Mgb2YgdGhpcy5fYWxsTGl2ZVNlc3Npb25zKCkpIHtcblx0XHRcdGlmIChzZXNzLnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3RJZCwgYXBwcm92ZWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nLCByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLCBhbnN3ZXJzPzogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPik6IHZvaWQge1xuXHRcdC8vIGByZXF1ZXN0SWRgIGlzIHRoZSBTREsncyBgdG9vbF91c2VfaWRgIChpbnRlcmFjdGl2ZSB0b29scyByZXVzZSBpdCBhc1xuXHRcdC8vIHRoZSB7QGxpbmsgQ2hhdElucHV0UmVxdWVzdC5pZH0pOyBnbG9iYWxseSB1bmlxdWUsIHNvIGEgc2luZ2xlXG5cdFx0Ly8gbWF0Y2hpbmcgY2hhdCBpcyBhbGwgd2UgbmVlZC4gU2lsZW50IG9uIG1pc3MgZm9yIHRoZSBzYW1lIHJlYXNvbnMgYXNcblx0XHQvLyB7QGxpbmsgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3R9LlxuXHRcdGZvciAoY29uc3Qgc2VzcyBvZiB0aGlzLl9hbGxMaXZlU2Vzc2lvbnMoKSkge1xuXHRcdFx0aWYgKHNlc3MucmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQsIHJlc3BvbnNlLCBhbnN3ZXJzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIEV2ZXJ5IGxpdmUgY2hhdCBcdTIwMTQgZWFjaCBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IGFuZCBpdHMgcGVlcnMuICovXG5cdHByaXZhdGUgX2FsbExpdmVTZXNzaW9ucygpOiBDbGF1ZGVBZ2VudFNlc3Npb25bXSB7XG5cdFx0Y29uc3QgYWxsOiBDbGF1ZGVBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdGFsbC5wdXNoKC4uLmVudHJ5LmFsbENoYXRTZXNzaW9ucygpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Fib3J0U2Vzc2lvbihjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBQaGFzZSA5IEQxOiBjYW5jZWwgdmlhIHRoZSBhYm9ydCBjb250cm9sbGVyLCBOT1QgYFF1ZXJ5LmludGVycnVwdCgpYC5cblx0XHQvLyBBYm9ydCBpcyBhIGNvbnRyb2wtcGxhbmUgb3BlcmF0aW9uIFx1MjAxNCBpdCBtdXN0IE5PVCBzZXJpYWxpemVcblx0XHQvLyB0aHJvdWdoIGBfc2Vzc2lvblNlcXVlbmNlcmAgYmVjYXVzZSBhbiBpbi1mbGlnaHQgYHNlbmRNZXNzYWdlYFxuXHRcdC8vIHRhc2sgaXMgcGFya2VkIG9uIGl0cyB0dXJuIGRlZmVycmVkIGFuZCB3b3VsZCBkZWFkbG9jayB0aGUgYWJvcnRcblx0XHQvLyBiZWhpbmQgdGhlIHZlcnkgdHVybiBpdCdzIHRyeWluZyB0byBjYW5jZWwuIENhbGxpbmdcblx0XHQvLyBgY2hhdC5hYm9ydCgpYCBkaXJlY3RseSByZWplY3RzIHRoZSBpbi1mbGlnaHQgZGVmZXJyZWQsXG5cdFx0Ly8gd2hpY2ggbGV0cyB0aGUgcXVldWVkIHNlbmRNZXNzYWdlIHRhc2sgY29tcGxldGUgYW5kIGZyZWVzIHRoZVxuXHRcdC8vIHNlcXVlbmNlciBmb3IgdGhlIG5leHQgY2FsbGVyLlxuXHRcdGNvbnN0IHNlc3MgPSB0aGlzLl9nZXRDaGF0Q29udGV4dChjaGF0KS50YXJnZXQ7XG5cdFx0aWYgKCFzZXNzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghc2Vzcy5pc1BpcGVsaW5lUmVhZHkpIHtcblx0XHRcdHNlc3MuYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3MuYWJvcnQoKTtcblx0fVxuXG5cdHNldFBlbmRpbmdNZXNzYWdlcyhjaGF0OiBVUkksIHN0ZWVyaW5nTWVzc2FnZTogUGVuZGluZ01lc3NhZ2UgfCB1bmRlZmluZWQsIF9xdWV1ZWRNZXNzYWdlczogcmVhZG9ubHkgUGVuZGluZ01lc3NhZ2VbXSk6IHZvaWQge1xuXHRcdC8vIFBoYXNlIDkgRDU6IHF1ZXVlZCBtZXNzYWdlcyBhcmUgaW50ZW50aW9uYWxseSBhIG5vLW9wLiBDT05URVhULm1kXG5cdFx0Ly8gTTEwICsgQWdlbnRTaWRlRWZmZWN0cyBjb25maXJtIHF1ZXVlZCBtZXNzYWdlcyBhcmUgY29uc3VtZWRcblx0XHQvLyBzZXJ2ZXItc2lkZTsgdGhlIGFnZW50IGJvdW5kYXJ5IGFsd2F5cyByZWNlaXZlcyBhbiBlbXB0eSBxdWV1ZS5cblx0XHQvL1xuXHRcdC8vIFN0ZWVyaW5nIHRhcmdldHMgdGhlIGNoYXQgdGhhdCBvd25zIHRoZSBpbi1mbGlnaHQgdHVybiBcdTIwMTQgdGhlIGNhbGxlclxuXHRcdC8vIGFsd2F5cyBhZGRyZXNzZXMgYSBjb25jcmV0ZSBjaGF0IGNoYW5uZWwgKHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0XG5cdFx0Ly8gb3IgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQpLlxuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9nZXRDaGF0Q29udGV4dChjaGF0KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGVdIHNldFBlbmRpbmdNZXNzYWdlcyBmb3IgJHtjaGF0LnRvU3RyaW5nKCl9OiBzdGVlcmluZz0ke3N0ZWVyaW5nTWVzc2FnZT8uaWQgPz8gJ25vbmUnfSBxdWV1ZWQ9JHtfcXVldWVkTWVzc2FnZXMubGVuZ3RofWApO1xuXHRcdGlmICghY29udGV4dC50YXJnZXQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gc2V0UGVuZGluZ01lc3NhZ2VzOiBjaGF0IG5vdCBmb3VuZCBmb3IgJHtjaGF0LnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzdGVlcmluZ01lc3NhZ2UpIHtcblx0XHRcdGNvbnRleHQudGFyZ2V0LmluamVjdFN0ZWVyaW5nKHN0ZWVyaW5nTWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvcndhcmQgYSB1c2VyL3BpY2tlciBgcGVybWlzc2lvbk1vZGVgIGNoYW5nZSB0byB0aGUgcnVubmluZyBTREsgc28gaXRcblx0ICogYXBwbGllcyB0byB0aGUgbmV4dCB0b29sIHRoaXMgdHVybiwgbm90IG9ubHkgZnJvbSB0aGUgbmV4dCBgc2VuZCgpYFxuXHQgKiAoaXNzdWUgIzMyMTY5MSkuIE9ubHkgZmlyZXMgZm9yIGNsaWVudC1vcmlnaW5hdGVkIGNoYW5nZXMgKHRoZSBob3N0IHJvdXRlc1xuXHQgKiBpbnRlcm5hbCBzZXJ2ZXIgd3JpdGVzIGVsc2V3aGVyZSksIHNvIHRoaXMgY2FuIGZvcndhcmQgd2l0aG91dCByZS1lbnRlcmluZ1xuXHQgKiBhIGBjYW5Vc2VUb29sYCBjYWxsYmFjay5cblx0ICpcblx0ICogYHBlcm1pc3Npb25Nb2RlYCBpcyBhICoqc2Vzc2lvbi1zY29wZWQqKiBjb25maWcgdmFsdWUgdG9kYXkgKEFIUCBoYXMgbm9cblx0ICogcGVyLWNoYXQgY29uZmlnKSwgc28gXHUyMDE0IG1hdGNoaW5nIENvcGlsb3QncyBzZXNzaW9uLXNjb3BlZCBhcHByb3ZhbHMgXHUyMDE0IHdlXG5cdCAqIGFwcGx5IGl0IHRvIEVWRVJZIG1hdGVyaWFsaXplZCBjaGF0J3MgYFF1ZXJ5YCBpbiB0aGUgc2Vzc2lvbiwgbm90IGp1c3QgdGhlXG5cdCAqIG9uZSB0aGUgY2hhbmdlIGFycml2ZWQgb24uIEEgYHJlcGxhY2VgIHRoYXQgZGVsZXRlcyB0aGUga2V5IHJlc29sdmVzIHRvIHRoZVxuXHQgKiBjaGF0J3MgYHBlcm1pc3Npb25Nb2RlRmFsbGJhY2tgLCB0aGUgc2FtZSB2YWx1ZSB0aGUgbmV4dCBgc2VuZCgpYCB3b3VsZFxuXHQgKiBhcHBseSwgc28gbGl2ZSBzdGF0ZSBtaXJyb3JzIHRoZSByZWR1Y2VyLiBQcm92aXNpb25hbCBjaGF0cyBhcmUgc2tpcHBlZCBcdTIwMTRcblx0ICogdGhlaXIgZmlyc3QgYHNlbmQoKWAgc2VlZHMgdGhlIG1vZGUgaW50byBgT3B0aW9ucy5wZXJtaXNzaW9uTW9kZWAuIEZpcmUtYW5kLVxuXHQgKiBmb3JnZXQ6IHRoZSBTREsgY29udHJvbCByb3VuZC10cmlwIGlzbid0IGF3YWl0ZWQgaGVyZTsgdGhlIHBpcGVsaW5lIGNhY2hlc1xuXHQgKiB0aGUgbW9kZSBzbyBhIGxhdGVyIHJlYmluZCAvIHNlbmQgcmUtYXBwbGllcyBpdC5cblx0ICpcblx0ICogVE9ETzogYWRvcHQgcGVyLWNoYXQgY29uZmlnIHdoZW4gdGhlIHByb3RvY29sIGFsbG93cyBmb3Igc3VjaCBcdTIwMTQgc2VlXG5cdCAqIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvYWdlbnQtaG9zdC1wcm90b2NvbC9pc3N1ZXMvMzM1IFx1MjAxNCBzbyBhIHBpY2tlclxuXHQgKiBjaGFuZ2Ugc2NvcGVzIHRvIGl0cyBvd24gY2hhdCBpbnN0ZWFkIG9mIHRoZSB3aG9sZSBzZXNzaW9uLlxuXHQgKi9cblx0b25TZXNzaW9uQ29uZmlnQ2hhbmdlZChzZXNzaW9uOiBVUkksIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9nZXRDaGF0Q29udGV4dChzZXNzaW9uKS5zZXNzaW9uSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmFycm93ZWQgPSBuYXJyb3dDbGF1ZGVQZXJtaXNzaW9uTW9kZSh2YWx1ZXNbQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZV0pO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBlbnRyeS5hbGxDaGF0U2Vzc2lvbnMoKSkge1xuXHRcdFx0aWYgKCFjaGF0LmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vZGUgPSBuYXJyb3dlZCA/PyBjaGF0LnBlcm1pc3Npb25Nb2RlRmFsbGJhY2s7XG5cdFx0XHRjaGF0LnNldFBlcm1pc3Npb25Nb2RlKG1vZGUpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke2NoYXQuc2Vzc2lvbklkfV0gbWlkLXR1cm4gc2V0UGVybWlzc2lvbk1vZGUoJHttb2RlfSkgZmFpbGVkYCwgZXJyKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoYW5nZU1vZGVsKGNoYXQ6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpO1xuXHRcdGNvbnN0IHF1ZXVlS2V5ID0gY29udGV4dC5pc1BlZXJDaGF0ID8gY29udGV4dC5jaGF0S2V5IDogY29udGV4dC5zZXNzaW9uSWQ7XG5cdFx0YXdhaXQgdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShxdWV1ZUtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpO1xuXHRcdFx0Y29uc3Qgc2VzcyA9IGN1cnJlbnQudGFyZ2V0O1xuXHRcdFx0aWYgKHNlc3MpIHtcblx0XHRcdFx0YXdhaXQgc2Vzcy5zZXRNb2RlbChtb2RlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnQuaXNQZWVyQ2hhdCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKGNoYXQsIHsgbW9kZWwgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKGN1cnJlbnQuc2Vzc2lvbiwgeyBtb2RlbCB9KTtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50LmlzUGVlckNoYXQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hhdEJhY2tpbmdNb2RlbChjaGF0LCBtb2RlbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU3dpdGNoIChvciBjbGVhciB3aXRoIGB1bmRlZmluZWRgKSB0aGUgc2VsZWN0ZWQgY3VzdG9tIGFnZW50IGZvciBhblxuXHQgKiBleGlzdGluZyBzZXNzaW9uLiBNaXJyb3JzIHtAbGluayBjaGFuZ2VNb2RlbH06IHNlc3Npb24gb3ducyBpdHNcblx0ICogcHJvdmlzaW9uYWwvcnVudGltZSBicmFuY2hpbmcgYW5kIG1ldGFkYXRhIHdyaXRlXG5cdCAqIChzZWUge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbi5zZXRBZ2VudH0pLiBGb3IgZXh0ZXJuYWwtb25seVxuXHQgKiBzZXNzaW9ucyAobm8gaW4tbWVtb3J5IHJlY29yZCksIHRoZSBhZ2VudCBpcyBwZXJzaXN0ZWQgZGlyZWN0bHkgdG9cblx0ICogdGhlIG92ZXJsYXkgc28gYSBsYXRlciByZXN1bWUgcGlja3MgaXQgdXAuIFdoZW4gYGNoYXRgIGlzIGFuIGFkZGl0aW9uYWxcblx0ICogcGVlciBjaGF0LCB0aGUgY2hhbmdlIHRhcmdldHMgdGhhdCBjaGF0J3MgY2hhdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NoYW5nZUFnZW50KGNoYXQ6IFVSSSwgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpO1xuXHRcdGNvbnN0IHF1ZXVlS2V5ID0gY29udGV4dC5pc1BlZXJDaGF0ID8gY29udGV4dC5jaGF0S2V5IDogY29udGV4dC5zZXNzaW9uSWQ7XG5cdFx0YXdhaXQgdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShxdWV1ZUtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpO1xuXHRcdFx0Y29uc3Qgc2VzcyA9IGN1cnJlbnQudGFyZ2V0O1xuXHRcdFx0aWYgKHNlc3MpIHtcblx0XHRcdFx0YXdhaXQgc2Vzcy5zZXRBZ2VudChhZ2VudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKGN1cnJlbnQuaXNQZWVyQ2hhdCA/IGNoYXQgOiBjdXJyZW50LnNlc3Npb24sIHsgYWdlbnQ6IGFnZW50ID8/IG51bGwgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRTZXJ2ZXJUb29sSG9zdChob3N0OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0ID0gaG9zdDtcblx0fVxuXG5cdGdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb246IFVSSSwgY2xpZW50OiB7IHJlYWRvbmx5IGNsaWVudElkOiBzdHJpbmc7IHJlYWRvbmx5IGRpc3BsYXlOYW1lPzogc3RyaW5nIH0pOiBJQWN0aXZlQ2xpZW50IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qga2V5ID0gYCR7c2Vzc2lvbklkfVxcdTAwMDAke2NsaWVudC5jbGllbnRJZH1gO1xuXHRcdGxldCBoYW5kbGUgPSB0aGlzLl9hY3RpdmVDbGllbnRIYW5kbGVzLmdldChrZXkpO1xuXHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHRoYW5kbGUgPSBuZXcgQ2xhdWRlQWN0aXZlQ2xpZW50SGFuZGxlKFxuXHRcdFx0XHRjbGllbnQuY2xpZW50SWQsXG5cdFx0XHRcdGNsaWVudC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKT8uZ2V0Q2xpZW50VG9vbHMoY2xpZW50LmNsaWVudElkKSA/PyBbXSxcblx0XHRcdFx0dG9vbHMgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke3Nlc3Npb25JZH1dIGFjdGl2ZSBjbGllbnQgJHtjbGllbnQuY2xpZW50SWR9IHRvb2xzPVske3Rvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKSB8fCAnKG5vbmUpJ31dYCk7XG5cdFx0XHRcdFx0dGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKT8uc2V0Q2xpZW50VG9vbHMoY2xpZW50LmNsaWVudElkLCB0b29scyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zID0+IHsgdm9pZCB0aGlzLnN5bmNDbGllbnRDdXN0b21pemF0aW9ucyhzZXNzaW9uLCBjbGllbnQuY2xpZW50SWQsIFsuLi5jdXN0b21pemF0aW9uc10pOyB9LFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuc2V0KGtleSwgaGFuZGxlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGhhbmRsZTtcblx0fVxuXG5cdHJlbW92ZUFjdGl2ZUNsaWVudChzZXNzaW9uOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0dGhpcy5fYWN0aXZlQ2xpZW50SGFuZGxlcy5kZWxldGUoYCR7c2Vzc2lvbklkfVxcdTAwMDAke2NsaWVudElkfWApO1xuXHRcdC8vIFRvb2xzIGFyZSB3cml0dGVuIHN5bmNocm9ub3VzbHksIHNvIHJlbW92ZSB0aGVtIGltbWVkaWF0ZWx5LiBUaGVcblx0XHQvLyBjdXN0b21pemF0aW9uIHN5bmMgcnVucyBpbnNpZGUgdGhlIHNlc3Npb24gc2VxdWVuY2VyLCBzbyBzZXJpYWxpemVcblx0XHQvLyBpdHMgcmVtb3ZhbCB0aGVyZSB0b28gXHUyMDE0IG90aGVyd2lzZSBhIGxhdGUgaW4tZmxpZ2h0IHN5bmMgY291bGRcblx0XHQvLyByZXN1cnJlY3QgdGhlIHJlbW92ZWQgY2xpZW50J3MgY3VzdG9taXphdGlvbnMgYWZ0ZXIgaXQgaGFzIGxlZnQuXG5cdFx0dGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKT8ucmVtb3ZlQ2xpZW50VG9vbHMoY2xpZW50SWQpO1xuXHRcdHZvaWQgdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShzZXNzaW9uSWQsIGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk/LnJlbW92ZUNsaWVudEN1c3RvbWl6YXRpb25zKGNsaWVudElkKTtcblx0XHR9KS5jYXRjaCgoKSA9PiB7IC8qIHNlc3Npb24gdG9ybiBkb3duICovIH0pO1xuXHR9XG5cblx0LyoqIERyb3AgY2FjaGVkIGFjdGl2ZS1jbGllbnQgaGFuZGxlcyBiZWxvbmdpbmcgdG8gYSBzZXNzaW9uIGJlaW5nIHRvcm4gZG93bi4gKi9cblx0cHJpdmF0ZSBfcHJ1bmVBY3RpdmVDbGllbnRIYW5kbGVzKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJlZml4ID0gYCR7c2Vzc2lvbklkfVxcdTAwMDBgO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLl9hY3RpdmVDbGllbnRIYW5kbGVzLmtleXMoKV0pIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b25DbGllbnRUb29sQ2FsbENvbXBsZXRlKHNlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCByZXN1bHQ6IFRvb2xDYWxsUmVzdWx0KTogdm9pZCB7XG5cdFx0bGV0IHRhcmdldCA9IHNlc3Npb247XG5cdFx0bGV0IHBhcnNlZDtcblx0XHR3aGlsZSAoKHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHRhcmdldCkpKSB7XG5cdFx0XHR0YXJnZXQgPSBwYXJzZWQucGFyZW50U2Vzc2lvbjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHRhcmdldCk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHQvLyBgQWdlbnRTaWRlRWZmZWN0c2AgZm9yd2FyZHMgZXZlcnkgYENoYXRUb29sQ2FsbENvbXBsZXRlYCBlbnZlbG9wZVxuXHRcdC8vIChpbmNsdWRpbmcgU0RLLW93bmVkIHRvb2xzKTsgc2lsZW50IG9uIG1pc3MgaXMgdGhlIGV4cGVjdGVkIHBhdGguXG5cdFx0ZW50cnk/LmRlZmF1bHRDaGF0Py5jb21wbGV0ZUNsaWVudFRvb2xDYWxsKHRvb2xDYWxsSWQsIHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyBzeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogVVJJLCBjbGllbnRJZDogc3RyaW5nLCBjdXN0b21pemF0aW9uczogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdLCBvcHRpb25zPzogeyByZWFkb25seSBxdWlldD86IGJvb2xlYW4gfSk6IFByb21pc2U8SVN5bmNlZEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBzZXNzID0gdGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3MpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3Nlc3Npb25JZH1dIHN5bmNDbGllbnRDdXN0b21pemF0aW9uczogc2Vzc2lvbiBub3QgZm91bmRgKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Ly8gUnVuIGluc2lkZSB0aGUgc2Vzc2lvbiBzZXF1ZW5jZXIgc28gdGhhdCBhIGZpcmUtYW5kLWZvcmdldFxuXHRcdC8vIGN1c3RvbWl6YXRpb24gc3luYyBjYW5ub3QgcmFjZSBhaGVhZCBvZiBhIGZpcnN0IGBzZW5kTWVzc2FnZWA6IGlmXG5cdFx0Ly8gYHNlbmRNZXNzYWdlYCBpcyBhbHJlYWR5IHF1ZXVlZCwgdGhlIHN5bmMgcnVucyBmaXJzdCBvciBxdWV1ZXNcblx0XHQvLyBiZWhpbmQgaXQ7IGVpdGhlciB3YXkgdGhlIG1hdGVyaWFsaXplIGNhbGwgcmVhZHMgdGhlIG1vc3QgcmVjZW50bHlcblx0XHQvLyBhZG9wdGVkIHBsdWdpbiBzZXQsIG5ldmVyIGFuIGVtcHR5IG9uZSBtaWQtc3luYy5cblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShzZXNzaW9uSWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN5bmNlZCA9IGF3YWl0IHRoaXMuX3BsdWdpbk1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKFxuXHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnMsXG5cdFx0XHRcdG9wdGlvbnM/LnF1aWV0ID8gdW5kZWZpbmVkIDogc3RhdHVzID0+IHRoaXMuX2ZpcmVDdXN0b21pemF0aW9uVXBkYXRlZChzZXNzaW9uLCB7IGN1c3RvbWl6YXRpb246IHN0YXR1cyB9KSxcblx0XHRcdCk7XG5cdFx0XHRzZXNzLmFkb3B0Q2xpZW50Q3VzdG9taXphdGlvbnMoY2xpZW50SWQsIHN5bmNlZCk7XG5cdFx0XHRyZXR1cm4gc3luY2VkO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2plY3QgYSBwZXItaXRlbSBzeW5jIHJlc3VsdCBvbnRvIGEgYFNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZGBcblx0ICogYWN0aW9uIGFuZCBlbWl0IGl0IG9uIHtAbGluayBvbkRpZFNlc3Npb25Qcm9ncmVzc30uIExldHMgdGhlIHdvcmtiZW5jaFxuXHQgKiBmbGlwIGVhY2ggcm93IHRvIGBMb2FkZWRgIC8gYEVycm9yYCBhcyB0aGUgdW5kZXJseWluZ1xuXHQgKiB7QGxpbmsgSUFnZW50UGx1Z2luTWFuYWdlci5zeW5jQ3VzdG9taXphdGlvbnN9IHJlc29sdmVzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZmlyZUN1c3RvbWl6YXRpb25VcGRhdGVkKHNlc3Npb246IFVSSSwgaXRlbTogSVN5bmNlZEN1c3RvbWl6YXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24sXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IGl0ZW0uY3VzdG9taXphdGlvbixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRcdC8vIFByb3ZpZGVyLWxldmVsIGN1c3RvbWl6YXRpb24gY2F0YWxvZ3VlIFx1MjAxNCBmZWVkcyBgQWdlbnRJbmZvLmN1c3RvbWl6YXRpb25zYFxuXHRcdC8vIG9uIGBSb290QWdlbnRzQ2hhbmdlZGAuIFNob3VsZCBhZHZlcnRpc2UgaG9zdC1jb25maWd1cmVkIHBsdWdpbiByZWZzXG5cdFx0Ly8gKHRoZSBlcXVpdmFsZW50IG9mIENvcGlsb3QncyBgYWdlbnRIb3N0LmN1c3RvbWl6YXRpb25zYCBzZXR0aW5nKS5cblx0XHQvLyBDbGF1ZGUgaGFzIG5vIHN1Y2ggc3VyZmFjZSB0b2RheTsgcmV0dXJuaW5nIGBbXWAgaXMgY29ycmVjdCByYXRoZXJcblx0XHQvLyB0aGFuIGFnZ3JlZ2F0aW5nIGNsaWVudC1wdXNoZWQgcmVmcyAodGhvc2UgbGl2ZSBvblxuXHRcdC8vIGBhY3RpdmVDbGllbnQuY3VzdG9taXphdGlvbnNgIHBlciBzZXNzaW9uKS5cblx0XHQvL1xuXHRcdC8vIFRPRE86IHdoZW4gaG9zdC1sZXZlbCBjdXN0b21pemF0aW9ucyBiZWNvbWUgYSByZWFsIGNvbmNlcHQgZm9yIHRoZVxuXHRcdC8vIGFnZW50IGhvc3QsIGxpZnQgYFBsdWdpbkNvbnRyb2xsZXJgIG91dCBvZiBgY29waWxvdC9jb3BpbG90QWdlbnQudHNgXG5cdFx0Ly8gaW50byBhIHNoYXJlZCBzZXJ2aWNlIHNvIGJvdGggcHJvdmlkZXJzIGNvbnN1bWUgdGhlIHNhbWUgY29uZmlndXJlZFxuXHRcdC8vIGhvc3QgY3VzdG9taXphdGlvbiBsaXN0IHJhdGhlciB0aGFuIGVhY2ggbWFpbnRhaW5pbmcgdGhlaXIgb3duLlxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IHNlc3MgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHRcdHJldHVybiBzZXNzID8gYXdhaXQgc2Vzcy5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoKSA6IFtdO1xuXHR9XG5cblx0YXN5bmMgc3RhcnRNY3BTZXJ2ZXIoc2Vzc2lvbjogVVJJLCBpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VzcyA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSk7XG5cdFx0YXdhaXQgc2Vzcz8uc3RhcnRNY3BTZXJ2ZXIoaWQpO1xuXHR9XG5cblx0YXN5bmMgc3RvcE1jcFNlcnZlcihzZXNzaW9uOiBVUkksIGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzID0gdGhpcy5fZmluZEFueVNlc3Npb24oQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblx0XHRhd2FpdCBzZXNzPy5zdG9wTWNwU2VydmVyKGlkKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIFBoYXNlIDYrIElOVkFSSUFOVDogU0RLIFF1ZXJ5IHN1YnByb2Nlc3NlcyAob3duZWQgYnkgaW5kaXZpZHVhbFxuXHRcdC8vIENsYXVkZUFnZW50U2Vzc2lvbiB3cmFwcGVycykgTVVTVCBkaWUgQkVGT1JFIHRoZSBwcm94eSBoYW5kbGVcblx0XHQvLyBpcyBkaXNwb3NlZC4gQWZ0ZXIgcHJveHkgZGlzcG9zYWwgdGhlIHByb3h5IG1heSByZWJpbmQgb24gYVxuXHRcdC8vIGRpZmZlcmVudCBwb3J0IGFuZCBhIHN0aWxsLXJ1bm5pbmcgc3VicHJvY2VzcyB3b3VsZCBzaWxlbnRseVxuXHRcdC8vIGxvc2UgaXRzIGVuZHBvaW50LiBTZWUgYElDbGF1ZGVQcm94eUhhbmRsZWAgZG9jIGluXG5cdFx0Ly8gYGNsYXVkZVByb3h5U2VydmljZS50c2AuXG5cdFx0Ly9cblx0XHQvLyBTdGVwIDE6IGFib3J0IGV2ZXJ5IHByb3Zpc2lvbmFsIEFib3J0Q29udHJvbGxlci4gVGhlc2UgYXJlXG5cdFx0Ly8gdGhlIHNhbWUgY29udHJvbGxlcnMgd2lyZWQgaW50byBgT3B0aW9ucy5hYm9ydENvbnRyb2xsZXJgIGF0XG5cdFx0Ly8gbWF0ZXJpYWxpemUgdGltZSAoc2RrLmQudHM6OTgyKSwgc28gYW55IGluLWZsaWdodFxuXHRcdC8vIGBhd2FpdCBzZGsuc3RhcnR1cCgpYCB3aWxsIHJlamVjdCBhbmQgYW55IHNlcXVlbmNlci1xdWV1ZWRcblx0XHQvLyBgX21hdGVyaWFsaXplUHJvdmlzaW9uYWxgIGNvbnRpbnVhdGlvbiB3aWxsIHRyaXAgaXRzXG5cdFx0Ly8gcG9zdC1zdGFydHVwIG9yIHBvc3QtY3VzdG9taXphdGlvbi13cml0ZSBhYm9ydCBnYXRlcyxcblx0XHQvLyBkaXNwb3NpbmcgdGhlIFdhcm1RdWVyeSB3aXRob3V0IGV2ZXIgcmVhY2hpbmdcblx0XHQvLyBgX3Nlc3Npb25zLnNldCguLi4pYC4gV2l0aG91dCB0aGlzIHN0ZXAsIGRpc3Bvc2UgZHVyaW5nIGFcblx0XHQvLyBjb25jdXJyZW50IGZpcnN0IGBzZW5kTWVzc2FnZWAgY291bGQgb3JwaGFuIGEgV2FybVF1ZXJ5XG5cdFx0Ly8gc3VicHJvY2Vzcy4gKENvcGlsb3QgcmV2aWV3ZXI6IGRpc3Bvc2UgbGlmZWN5Y2xlLilcblx0XHQvL1xuXHRcdC8vIFN0ZXAgMjogYHN1cGVyLmRpc3Bvc2UoKWAgc3luY2hyb25vdXNseSBkaXNwb3NlcyB0aGVcblx0XHQvLyBgX3Nlc3Npb25zYCBEaXNwb3NhYmxlTWFwLCBmaXJpbmcgZWFjaCBzZXNzaW9uIHdyYXBwZXInc1xuXHRcdC8vIGBkaXNwb3NlKClgICh3aGljaCBpbnRlcnJ1cHRzL2FzeW5jRGlzcG9zZXMgaXRzIFdhcm1RdWVyeSkuXG5cdFx0Ly9cblx0XHQvLyBTdGVwIDM6IG9ubHkgdGhlbiByZWxlYXNlIHRoZSBwcm94eSBoYW5kbGUsIHByZXNlcnZpbmcgdGhlXG5cdFx0Ly8gd3JhcHBlci1iZWZvcmUtcHJveHkgb3JkZXJpbmcgaW52YXJpYW50LiBUaGlzIGlzIGxvY2tlZCBieVxuXHRcdC8vIHRlc3QgXCJkaXNwb3NlIGRpc3Bvc2VzIHRoZSBwcm94eSBoYW5kbGUgYW5kIGlzIGlkZW1wb3RlbnRcIi5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgZW50cnkuYWxsQ2hhdFNlc3Npb25zKCkpIHtcblx0XHRcdFx0aWYgKCFjaGF0LmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRcdGNoYXQuYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Byb3h5SGFuZGxlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcHJveHlIYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZ2l0aHViVG9rZW4gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbW9kZWxzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG4vKipcbiAqIFBlci1zZXNzaW9uIGNvbnRhaW5lci4gT3ducyB0aGUgc2Vzc2lvbidzIGRlZmF1bHQgKG1haW4pIGNoYXQgYW5kIGFueVxuICogYWRkaXRpb25hbCBwZWVyIGNoYXRzIFx1MjAxNCBlYWNoIGEge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gcGx1cyB0aGVcbiAqIGV2ZW50LWZvcndhcmRpbmcgc3Vic2NyaXB0aW9ucyByZWdpc3RlcmVkIGFnYWluc3QgaXQgKGUuZy4gdGhlIGFnZW50J3NcbiAqIGZvcndhcmQgc3Vic2NyaXB0aW9uIHRvIHRoZSBzZXNzaW9uJ3MgYG9uRGlkU2Vzc2lvblByb2dyZXNzYCBldmVudCkuIEEgc2luZ2xlXG4gKiB7QGxpbmsgQ2xhdWRlQWdlbnQuX3Nlc3Npb25zfSBtYXAgb2YgdGhlc2UgZW50cmllcyBrZWVwcyBhbGwgY2hhdHMgb2YgYVxuICogc2Vzc2lvbiB0b2dldGhlciAobm8gcGFyYWxsZWwgbWFwcyksIHNvIGRpc3BhdGNoIHJlc29sdmVzIGEgY2hhdCBieSBsb29raW5nXG4gKiB1cCBpdHMgb3duaW5nIHNlc3Npb24gYW5kIHRoZW4gdGhlIGNoYXQgd2l0aGluIGl0LiBEaXNwb3NpbmcgdGhlIGVudHJ5XG4gKiBkaXNwb3NlcyB0aGUgc2Vzc2lvbiBBTkQgZXZlcnkgZXh0cmEgcmVnaXN0ZXJlZCB2aWFcbiAqIHtAbGluayBBZ2VudFNlc3Npb25FbnRyeS5hZGREaXNwb3NhYmxlfS5cbiAqL1xuY2xhc3MgQ2xhdWRlU2Vzc2lvbkVudHJ5IGV4dGVuZHMgQWdlbnRTZXNzaW9uRW50cnk8Q2xhdWRlQWdlbnRTZXNzaW9uPiB7XG5cdC8qKiBDbGF1ZGUgc2Vzc2lvbnMgYWx3YXlzIGhhdmUgYSBtYXRlcmlhbGl6ZWQgZGVmYXVsdCBjaGF0IG9uY2Ugc2VlZGVkLiAqL1xuXHRvdmVycmlkZSBnZXQgZGVmYXVsdENoYXQoKTogQ2xhdWRlQWdlbnRTZXNzaW9uIHtcblx0XHRyZXR1cm4gc3VwZXIuZGVmYXVsdENoYXQhO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVFBLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLHFCQUFxQjtBQUMxQyxTQUFzQix1QkFBdUI7QUFDN0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQWlEO0FBQzFELFNBQVMsbUJBQW1CLDRCQUE0QixvQkFBb0Isb0JBQW9CLHVCQUF1Qiw0QkFBaUQ7QUFDeEssU0FBUyxvQkFBb0IsMENBQTBDO0FBQ3ZFLFNBQVMsMENBQTBDLGNBQWMsb0JBQW9CLHVCQUF1QixzQkFBc0I7QUFDbEksU0FBK0Isd0JBQXdCLGtDQUFrQztBQUN6RixTQUFTLGlDQUFpQywyQkFBMkI7QUFDckUsU0FBUyx3QkFBd0I7QUFDakMsU0FBd0IsY0FBMkIsMEJBQXdhLDBCQUEwQjtBQUNyZixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLFlBQVksMEJBQW1EO0FBRXhFLFNBQVMsbUJBQW1CLHFCQUFxQjtBQUVqRCxTQUFTLG1CQUFtQix5QkFBeUIscUJBQXFCLGNBQWMsb0NBQW9DLHdCQUFzTjtBQUNsVixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGlDQUFpQztB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
