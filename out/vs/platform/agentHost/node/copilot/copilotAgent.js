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
import { CopilotClient, RuntimeConnection } from "@github/copilot-sdk";
import * as fs from "fs/promises";
import * as os from "os";
import { pathToFileURL } from "url";
import { createCancelablePromise, DeferredPromise, Delayer, disposableTimeout, Limiter, SequencerByKey } from "../../../../base/common/async.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableMap, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { FileAccess } from "../../../../base/common/network.js";
import { formatTokenCount } from "../../../../base/common/numbers.js";
import { equals } from "../../../../base/common/objects.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { delimiter, dirname, join } from "../../../../base/common/path.js";
import { basename as resourceBasename, isEqual, isEqualOrParent, joinPath as resourceJoinPath, relativePath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { rgDiskPath } from "../../../../base/node/ripgrep.js";
import { localize } from "../../../../nls.js";
import { parseAgentFile, parsePlugin, parseRuleFile, parseSkillFile, PluginFormat } from "../../../agentPlugins/common/pluginParsers.js";
import { AiAgentEnvValue, AiAgentEnvVar } from "../../../chat/common/aiAgentEnv.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService, LogLevel } from "../../../log/common/log.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { workspacelessScratchDir } from "../workspacelessScratchDir.js";
import { IAgentHostCheckpointService } from "../../common/agentHostCheckpointService.js";
import { IAgentHostReviewService } from "../../common/agentHostReviewService.js";
import { createPricingMetaFromBilling, hasLongContextSurcharge, normalizeCAPIBilling } from "../../common/agentModelPricing.js";
import { createAgentModelByokMeta } from "../../common/agentModelByokMeta.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE, toContainerCustomization } from "../../common/agentHostCustomizationConfig.js";
import { CopilotCliConfigKey, copilotCliConfigSchema } from "../../common/copilotCliConfig.js";
import { AgentHostMcpServersConfigKey, AgentHostCopilotMultiRootEnabledConfigKey, AgentHostPreferLongContextEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey, migrateLegacyAutopilotConfig, platformRootSchema, platformSessionSchema } from "../../common/agentHostSchema.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { AgentSessionEntry, decodeProviderData, encodeProviderData, prepareSideChatPrompt, stripSideChatContext } from "../agentPeerChats.js";
import { AgentSession, SubagentChatSignal } from "../../common/agentService.js";
import { getReasoningEffortDescription, getReasoningEffortLabel } from "../../common/reasoningEffort.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { getCopilotHomePath } from "../../common/copilotHome.js";
import { ISessionDataService, SESSION_DB_FILENAME } from "../../common/sessionDataService.js";
import { IAgentHostProxyResolver } from "../agentHostProxyResolver.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { CustomizationLoadStatus, CustomizationType, customizationId, buildChatUri, buildDefaultChatUri, isDefaultChatUri, parseChatUri, parseRequiredSessionUriFromChatUri, parseSubagentSessionUri, AH_META_WORKSPACELESS_DB_KEY } from "../../common/state/sessionState.js";
import { ActiveClientToolSet } from "../activeClientState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { IAgentHostCompletions } from "../agentHostCompletions.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { applyMcpServerEnablement, findMcpChildId } from "../shared/mcpCustomizationController.js";
import { IAgentHostStateManager } from "../agentHostStateManager.js";
function isCopilotRuntimeManagedSettingsSdk(value) {
  return typeof value === "object" && value !== null && "getManagedSettings" in value && typeof value.getManagedSettings === "function";
}
import { IByokLmBridgeRegistry } from "../byokLmBridgeRegistry.js";
import { SessionWorkingDirectoryMissingError } from "../shared/worktreeIsolation.js";
import { buildSessionEventLogFromTurns } from "./buildSessionEvents.js";
import { CopilotAgentSession } from "./copilotAgentSession.js";
import { projectFromCopilotContext } from "./copilotGitProject.js";
import { parsedPluginsEqual, toChildCustomizations } from "./copilotPluginConverters.js";
import { CopilotGitHubTelemetryForwarder } from "./copilotGitHubTelemetryForwarder.js";
import { CopilotSessionLauncher, ContextSizeConfigKey, ThinkingLevelConfigKey, getCopilotContextTier, isCopilotReasoningEffort, resolveCopilotReasoningEffort } from "./copilotSessionLauncher.js";
import { ShellManager } from "./copilotShellTools.js";
import { isAgentHostTelemetryService } from "../agentHostTelemetryService.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { AgentHostGitHubTelemetryRouter } from "../agentHostGitHubTelemetryRouter.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { CopilotSlashCommandCompletionProvider } from "./copilotSlashCommandCompletionProvider.js";
import { DiscoveredType, SessionCustomizationDiscovery, areDiscoveredDirectoriesEqual } from "./sessionCustomizationDiscovery.js";
import { COPILOT_INTEGRATION_ID } from "../../../endpoint/common/licenseAgreement.js";
import { getAppNodeModulesPath } from "../appNodeModules.js";
import { CopilotSlashCommandProvider } from "./copilotSlashCommandProvider.js";
const RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;
const COPILOT_CAPI_URL = "https://api.githubcopilot.com";
const COPILOT_PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];
const COPILOT_PROXY_SET_ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY"];
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
function isLinuxMuslRuntime() {
  if (process.platform !== "linux") {
    return false;
  }
  const report = process.report?.getReport();
  return !report?.header?.glibcVersionRuntime;
}
function getCopilotPlatformPackageCandidates() {
  const platformArch = `${process.platform}-${process.arch}`;
  if (process.platform !== "linux") {
    return [platformArch];
  }
  const linuxCandidates = [`linux-${process.arch}`, `linuxmusl-${process.arch}`];
  return isLinuxMuslRuntime() ? linuxCandidates.reverse() : linuxCandidates;
}
async function resolveCopilotCliPath(nodeModulesUri) {
  const tried = [];
  for (const platformPackage of getCopilotPlatformPackageCandidates()) {
    const cliPath = URI.joinPath(nodeModulesUri, "@github", `copilot-${platformPackage}`, "index.js").fsPath;
    tried.push(cliPath);
    if (await fileExists(cliPath)) {
      return cliPath;
    }
  }
  const oldTopLevelPath = URI.joinPath(nodeModulesUri, "@github", "copilot", "index.js").fsPath;
  tried.push(oldTopLevelPath);
  if (await fileExists(oldTopLevelPath)) {
    return oldTopLevelPath;
  }
  throw new Error(`Unable to resolve @github/copilot CLI path. Tried: ${tried.join(", ")}`);
}
function toRestrictedTelemetryEndpoint(endpoint) {
  return endpoint ? `${endpoint.replace(/\/+$/, "")}/telemetry` : void 0;
}
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from "./prompts/systemMessage.js";
function rebaseUnder(uri, fromDir, toDir) {
  if (!isEqualOrParent(uri, fromDir)) {
    return void 0;
  }
  const rel = relativePath(fromDir, uri);
  if (rel === void 0) {
    return void 0;
  }
  return rel.length === 0 ? toDir : resourceJoinPath(toDir, rel);
}
class CopilotSessionEntry extends AgentSessionEntry {
}
let CopilotAgent = class extends Disposable {
  constructor(_logService, _instantiationService, _sessionDataService, _gitService, _configurationService, _stateManager, _gitHubEndpointService, _otelService, completions, _checkpointService, _reviewService, _environmentService, _byokBridgeRegistry, _telemetryService, _copilotApiService, _proxyResolver) {
    super();
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._sessionDataService = _sessionDataService;
    this._gitService = _gitService;
    this._configurationService = _configurationService;
    this._stateManager = _stateManager;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._otelService = _otelService;
    this._checkpointService = _checkpointService;
    this._reviewService = _reviewService;
    this._environmentService = _environmentService;
    this._byokBridgeRegistry = _byokBridgeRegistry;
    this._telemetryService = _telemetryService;
    this._copilotApiService = _copilotApiService;
    this._proxyResolver = _proxyResolver;
    this.id = "copilotcli";
    this._onDidSessionProgress = this._register(new Emitter());
    this.onDidSessionProgress = this._onDidSessionProgress.event;
    /**
     * Membership channel for chats the agent spawns itself — sub-agents
     * delegated by a tool call (the same fan-out the `subagent_started` /
     * `subagent_completed` signals drive). The orchestrator routes these into
     * the chat catalog so harness-spawned and user-driven chats share one path.
     */
    this._onDidSpawnChat = this._register(new Emitter());
    this.onDidSpawnChat = this._onDidSpawnChat.event;
    this._onDidMaterializeSession = this._register(new Emitter());
    this.onDidMaterializeSession = this._onDidMaterializeSession.event;
    /**
     * Per-session MCP notifications, fanned in from every active
     * {@link CopilotAgentSession}. Each session contributes a single
     * subscription, disposed alongside the session.
     */
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    /**
     * The two sources merged into {@link _models}: CAPI models from the CLI's
     * `models.list` and BYOK models from the renderer bridge registry's serving
     * window. Tracked separately so each can refresh independently without
     * clobbering the other; {@link _publishModels} concatenates them for the
     * picker.
     */
    this._capiModels = [];
    this._byokModels = [];
    /** Model IDs whose long-context tier costs the same as the default tier. */
    this._freeLongContextModels = /* @__PURE__ */ new Set();
    /**
     * Bounded exponential-backoff retry for {@link _refreshModels}. The SDK's
     * `models.list` RPC can fail transiently (e.g. a `429 "too many requests"`
     * right after startup). Without a retry the model picker would stay empty
     * until the next external refresh trigger (a GitHub token change, a CLI
     * client restart, or the host's periodic scheduler), so we retry a few
     * times before giving up. Overridable in tests to avoid real delays.
     */
    this._modelRefreshMaxAttempts = 5;
    this._modelRefreshBaseDelayMs = 1e3;
    this._modelRefreshMaxDelayMs = 3e4;
    /** Pending model-refresh retry timer; cleared on a fresh refresh, shutdown, or dispose. */
    this._modelRefreshRetry = this._register(new MutableDisposable());
    /**
     * Invalidates model requests bound to a superseded token/client/catalog
     * source. Token identity alone is insufficient: restarting the client for
     * a `COPILOT_GH_HOST` change keeps the same token while changing the CAPI
     * endpoint whose catalog is authoritative.
     */
    this._modelCatalogGeneration = 0;
    this._modelRefreshSchedule = this._register(new MutableDisposable());
    /**
     * Reasons for a client restart that is parked until every chat is idle. See
     * {@link _requestClientRestart}; drained by {@link _applyPendingClientRestart}.
     */
    this._pendingClientRestartReasons = /* @__PURE__ */ new Set();
    /** Reflects the `rt=1` field on the GitHub Copilot bearer token; gates enhanced GH telemetry. */
    this._restrictedTelemetryEnabled = false;
    this._onDidChangeRestrictedTelemetry = this._register(new Emitter());
    this.onDidChangeRestrictedTelemetry = this._onDidChangeRestrictedTelemetry.event;
    /** Root AHP session id -> container that owns the default chat and all peer chats. */
    this._sessions = this._register(new DisposableMap());
    /** SDK session id -> individual chat session, used to route connection-global SDK telemetry in O(1). */
    this._sdkSessionsById = /* @__PURE__ */ new Map();
    /**
     * Live `chatUri → backing` map for additional (non-default) peer chats,
     * keyed by chat channel URI string. Records the SDK chat id (and
     * optional model override) that backs each peer chat so the agent can
     * resume it without consulting on-disk persistence. Populated by
     * {@link createChat} on creation and by {@link materializeChat} on
     * restore; the orchestrator now owns the durable peer-chat catalog (the
     * agent no longer writes `copilot.chats`).
     */
    this._chatBackings = /* @__PURE__ */ new Map();
    /**
     * Fires when a peer chat's opaque `providerData` blob changes after
     * creation (e.g. a per-chat model switch), so the orchestrator re-persists
     * the refreshed token. See {@link IAgent.onDidChangeChatData}.
     */
    this._onDidChangeChatData = this._register(new Emitter());
    this.onDidChangeChatData = this._onDidChangeChatData.event;
    /**
     * Per-session MCP-notification subscriptions, keyed by `sessionId`.
     * Disposed in lockstep with the matching {@link _sessions} entry so
     * the fan-in does not leak listeners as sessions come and go.
     */
    this._mcpNotificationSubs = this._register(new DisposableMap());
    /**
     * In-flight {@link _resumeSession} promises, keyed by sessionId. Used to
     * deduplicate concurrent resume requests for the same session so that
     * we never construct two {@link CopilotAgentSession} entries for the
     * same id — `_sessions` is a {@link DisposableMap} whose `set()` would
     * dispose the in-flight first entry mid-{@link CopilotAgentSession.initializeSession},
     * leaving the second caller with a half-initialised, eventless session.
     */
    this._resumingSessions = /* @__PURE__ */ new Map();
    /**
     * Sessions created by a client but not yet materialized into a Copilot
     * SDK session + worktree + on-disk metadata. Materialization is deferred
     * until the first {@link sendMessage}, at which point the entry moves
     * out of this map and into {@link _sessions}. See {@link IProvisionalSession}.
     */
    this._provisionalSessions = /* @__PURE__ */ new Map();
    this._sessionSequencer = new SequencerByKey();
    /** Per-session active client state for tools + plugin snapshot tracking. */
    this._activeClients = new ResourceMap();
    this._lastSessionSyncEnabled = this._isSessionSyncEnabled();
    this._lastRubberDuckEnabled = this._isRubberDuckEnabled();
    this._lastCopilotSdkLogLevelSetting = this._getCopilotSdkLogLevelSetting();
    this._lastEnterpriseHost = this._getEnterpriseHost();
    this._lastSystemProxyEnabled = this._isSystemProxyEnabled();
    /**
     * Chat-addressed surface for the chats within a session.
     */
    this.chats = {
      createChat: (chat, options) => {
        return this._createChat(chat, options);
      },
      fork: (chat, source, options) => {
        return this._createChat(chat, { ...options, fork: source });
      },
      disposeChat: (chatUri) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this._disposeChat(session, chat);
      },
      sendMessage: (chatUri, prompt, workingDirectories, attachments, turnId, senderClientId, clientType) => {
        return this._sendMessage(chatUri, prompt, attachments, turnId, senderClientId, clientType, workingDirectories);
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
      getMessages: (chat) => {
        return this.getSessionMessages(chat);
      }
    };
    this._plugins = this._register(this._instantiationService.createInstance(PluginController, () => this._ensureClient()));
    this._sessionLauncher = this._instantiationService.createInstance(CopilotSessionLauncher);
    this._gitHubTelemetryForwarder = this._instantiationService.createInstance(CopilotGitHubTelemetryForwarder, () => this._restrictedTelemetryEnabled);
    this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._ensureClient().then((c) => c.rpc.commands.list().then((c2) => c2.commands)), this._logService);
    this._githubTelemetryRouter = isAgentHostTelemetryService(this._telemetryService) ? new AgentHostGitHubTelemetryRouter(this._telemetryService) : void 0;
    this.onDidCustomizationsChange = this._plugins.onDidChange;
    this._register(this._stateManager.onDidChangeSessionTitle(({ session, title }) => {
      if (AgentSession.provider(session) === this.id) {
        this._otelService.emitSessionTitleChanged(AgentSession.id(session), session, title);
      }
    }));
    this._register(this._onDidSessionProgress.event((signal) => this._emitSpawnedChatForSubagentSignal(signal)));
    this._register(completions.registerProvider(new CopilotSlashCommandCompletionProvider(
      this.id,
      {
        isRubberDuckEnabled: () => this._isRubberDuckEnabled(),
        getRuntimeSlashCommands: (sessionId, options) => this._getRuntimeSlashCommands(sessionId, options),
        getSessionCustomizations: (sessionId) => this.getSessionCustomizations(AgentSession.uri(this.id, sessionId)),
        getSessionConfigState: (sessionId) => this._getSessionConfigState(sessionId)
      },
      RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS
    )));
    this._register(this._configurationService.onDidRootConfigChange(() => {
      this._restartClientIfStartupConfigChanged().catch(
        (err) => this._logService.error("[Copilot] Failed to apply root config change", err)
      );
    }));
    this._register(this._byokBridgeRegistry.onDidChangeModels(() => {
      this._logService.info("[Copilot] BYOK bridge changed; refreshing models");
      this._refreshByokModels();
    }));
    this._register(this._gitHubEndpointService.onDidChange(() => {
      this._restartClientIfStartupConfigChanged().catch(
        (err) => this._logService.error("[Copilot] Failed to restart client after endpoint change", err)
      );
    }));
  }
  setServerToolHost(host) {
    this._serverToolHost = host;
  }
  get restrictedTelemetryEnabled() {
    return this._restrictedTelemetryEnabled;
  }
  /**
   * Translates the sub-agent fan-out signals into the first-class spawned-
   * chat channel: `subagent_started` -> {@link onDidSpawnChat}
   * (carrying the spawning tool call as the chat's parent edge). A completed
   * subagent chat stays live and subscribable (it is removed only on session
   * teardown), so there is no corresponding end event. The signals themselves
   * are left untouched so the existing sub-agent behavior is preserved.
   */
  _emitSpawnedChatForSubagentSignal(signal) {
    const spawn = SubagentChatSignal.toSpawnEvent(signal);
    if (spawn) {
      this._onDidSpawnChat.fire(spawn);
    }
  }
  _isSessionSyncEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true;
  }
  _isRubberDuckEnabled() {
    return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.RubberDuck) === true;
  }
  _getCopilotSdkLogLevelSetting() {
    return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.CopilotSdkLogLevel) ?? "info";
  }
  _resolveCopilotSdkLogLevel(configured) {
    return configured === "trace" || this._logService.getLevel() === LogLevel.Trace ? "all" : "info";
  }
  _getEnterpriseHost() {
    return this._gitHubEndpointService.getEnterpriseHost();
  }
  _isPreferLongContextEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostPreferLongContextEnabledConfigKey) === true;
  }
  _isSystemProxyEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostSystemProxyEnabledConfigKey) !== false;
  }
  /**
   * Restarts the CLI client when a config value that is only read at client
   * startup has changed. The restart is deferred while any chat has an
   * in-flight turn — see {@link _requestClientRestart} — so the new values are
   * picked up at the next quiet point rather than by killing live work.
   * An in-flight start aborts if any startup value changes.
   */
  async _restartClientIfStartupConfigChanged() {
    const sessionSync = this._isSessionSyncEnabled();
    const rubberDuck = this._isRubberDuckEnabled();
    const copilotSdkLogLevelSetting = this._getCopilotSdkLogLevelSetting();
    const enterpriseHost = this._getEnterpriseHost();
    const systemProxyEnabled = this._isSystemProxyEnabled();
    if (this._lastSessionSyncEnabled === sessionSync && this._lastRubberDuckEnabled === rubberDuck && this._lastCopilotSdkLogLevelSetting === copilotSdkLogLevelSetting && this._lastEnterpriseHost === enterpriseHost && this._lastSystemProxyEnabled === systemProxyEnabled) {
      return;
    }
    const changed = [
      this._lastSessionSyncEnabled !== sessionSync ? `sessionSync=${sessionSync}` : void 0,
      this._lastRubberDuckEnabled !== rubberDuck ? `rubberDuck=${rubberDuck}` : void 0,
      this._lastCopilotSdkLogLevelSetting !== copilotSdkLogLevelSetting ? `copilotSdkLogLevel=${copilotSdkLogLevelSetting}` : void 0,
      this._lastEnterpriseHost !== enterpriseHost ? `enterpriseHost=${enterpriseHost}` : void 0,
      this._lastSystemProxyEnabled !== systemProxyEnabled ? `systemProxy=${systemProxyEnabled}` : void 0
    ].filter((v) => v !== void 0).join(", ");
    this._lastSessionSyncEnabled = sessionSync;
    this._lastRubberDuckEnabled = rubberDuck;
    this._lastCopilotSdkLogLevelSetting = copilotSdkLogLevelSetting;
    this._lastEnterpriseHost = enterpriseHost;
    this._lastSystemProxyEnabled = systemProxyEnabled;
    await this._requestClientRestart(`startup config changed: ${changed}`);
  }
  /**
   * Requests a CLI client restart, running it immediately when every chat is
   * idle and otherwise parking it until the last in-flight turn ends.
   *
   * Restarting tears the SDK sessions down, and a torn-down session stops
   * producing the events that finalize its protocol turn — the client would
   * be left with a turn that never completes, cancels, or errors, i.e. a
   * session that spins forever. Startup-only values (session sync, the SDK
   * log level, the enterprise host, the system proxy) can also change without
   * any user action, from an experiment or policy refresh, so this must never
   * be paid for with a running turn. The values are read fresh by
   * {@link _ensureClient} on the next start, so applying the restart late is
   * always correct.
   */
  async _requestClientRestart(reason) {
    if (this._shutdownPromise || !this._client) {
      return;
    }
    this._pendingClientRestartReasons.add(reason);
    const busyChats = this._chatsWithActiveTurn();
    if (busyChats > 0) {
      this._logService.info(`[Copilot] Deferring CopilotClient restart (${reason}) until ${busyChats} in-flight turn(s) finish`);
      return;
    }
    await this._applyPendingClientRestart();
  }
  /**
   * Runs a restart parked by {@link _requestClientRestart} once no chat has
   * an in-flight turn. No-op while any turn is still running; the next chat
   * to go idle drives this again.
   */
  async _applyPendingClientRestart() {
    if (this._pendingClientRestartReasons.size === 0 || this._shutdownPromise || !this._client || this._chatsWithActiveTurn() > 0) {
      return;
    }
    const reason = [...this._pendingClientRestartReasons].join("; ");
    this._logService.info(`[Copilot] Restarting CopilotClient (${reason})`);
    this._sessions.clearAndDisposeAll();
    this._mcpNotificationSubs.clearAndDisposeAll();
    await this._stopClient();
    this._capiModels = [];
    this._publishModels();
    void this._scheduleModelRefresh();
  }
  /**
   * Called by a {@link CopilotAgentSession} when its turn ends. Scheduled off
   * the current stack because the callback fires from inside that session's
   * SDK event handling and the restart disposes the session making the call.
   */
  _onChatTurnEnded() {
    if (this._pendingClientRestartReasons.size === 0) {
      return;
    }
    queueMicrotask(() => {
      this._applyPendingClientRestart().catch(
        (err) => this._logService.error("[Copilot] Failed to apply deferred client restart", err)
      );
    });
  }
  /** Number of live chats (default or peer, across all sessions) with an in-flight turn. */
  _chatsWithActiveTurn() {
    let count = 0;
    for (const [, entry] of this._sessions) {
      for (const chatSession of entry.allChatSessions()) {
        if (chatSession.hasActiveTurn) {
          count++;
        }
      }
    }
    return count;
  }
  _createCopilotClient(options) {
    return new CopilotClient(options);
  }
  // ---- auth ---------------------------------------------------------------
  getDescriptor() {
    return {
      provider: "copilotcli",
      displayName: "Copilot",
      description: localize("copilotAgent.description", "Copilot SDK agent running in the local agent host process"),
      capabilities: {
        multipleChats: { fork: true, sideChat: true },
        ...this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
      }
    };
  }
  _isMultiRootEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostCopilotMultiRootEnabledConfigKey) === true;
  }
  getProtectedResources() {
    return [
      this._gitHubEndpointService.getCopilotResource(),
      this._gitHubEndpointService.getRepoResource()
    ];
  }
  async getNetworkDiagnosticsEndpoints() {
    let capiUrl = process.env["VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE"] || COPILOT_CAPI_URL;
    if (this._githubToken) {
      try {
        capiUrl = await this._copilotApiService.resolveApiEndpoint(this._githubToken) || capiUrl;
      } catch (error) {
        this._logService.debug(`[Copilot] CAPI endpoint discovery for network diagnostics failed; using ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const capiPingUrl = new URL(capiUrl);
    capiPingUrl.pathname = `${capiPingUrl.pathname.replace(/\/$/, "")}/_ping`;
    return [
      { name: "GitHub API", url: this._gitHubEndpointService.getApiBaseUri() },
      { name: "Copilot API (CAPI)", url: capiPingUrl.toString() }
    ];
  }
  async getNetworkDiagnosticsAccount() {
    return this._githubToken ? this._copilotApiService.resolveUserLogin?.(this._githubToken) : void 0;
  }
  async getManagedSettingsDiagnostics() {
    const nodeModulesUri = FileAccess.asFileUri(getAppNodeModulesPath());
    const cliPath = await resolveCopilotCliPath(nodeModulesUri);
    const runtimeSdkPath = join(dirname(cliPath), "sdk", "index.js");
    if (!await fileExists(runtimeSdkPath)) {
      throw new Error(`Copilot runtime SDK not found at ${runtimeSdkPath}`);
    }
    const runtimeSdk = await import(pathToFileURL(runtimeSdkPath).href);
    if (!isCopilotRuntimeManagedSettingsSdk(runtimeSdk)) {
      throw new Error("Copilot runtime SDK does not expose getManagedSettings()");
    }
    const enterpriseHost = this._getEnterpriseHost();
    const result = await runtimeSdk.getManagedSettings({
      ...this._githubToken ? { token: this._githubToken } : {},
      ...enterpriseHost ? { host: enterpriseHost } : {}
    });
    return {
      ...result.resolved,
      ...result.account ? { account: result.account } : {}
    };
  }
  getCustomizations() {
    return this._plugins.getConfiguredHostCustomizations();
  }
  async getSessionCustomizations(session) {
    const anchors = await this._getSessionCustomizationAnchors(session);
    const activeClient = this._getOrCreateActiveClient(session, anchors.directory);
    if (anchors.applyAdditional) {
      activeClient.pluginController.setAdditionalDirectories(anchors.additionalDirectories);
    }
    const fromPlugins = await activeClient.pluginController.getCustomizationsSettled();
    const sessionId = AgentSession.id(session);
    const entry = this._findAnySession(sessionId);
    const topLevelMcp = entry?.topLevelMcpCustomizations() ?? [];
    const customizations = [...fromPlugins, ...topLevelMcp];
    const desired = this._stateManager.getSessionState(session.toString())?.customizations ?? [];
    return applyMcpServerEnablement(customizations, desired);
  }
  async handleMcpRequest(session, serverName, method, params) {
    const sessionId = AgentSession.id(session);
    const entry = this._findAnySession(sessionId);
    if (!entry) {
      throw new Error(`Method not found: no active session ${sessionId}`);
    }
    return entry.handleMcpRequest(serverName, method, params);
  }
  async startMcpServer(session, id) {
    const sessionId = AgentSession.id(session);
    await this._findAnySession(sessionId)?.startMcpServer(id);
  }
  async stopMcpServer(session, id) {
    const sessionId = AgentSession.id(session);
    await this._findAnySession(sessionId)?.stopMcpServer(id);
  }
  /**
   * The gated additional (non-primary) customization roots for a session: the
   * tail of the ordered working-directory set when multi-root is enabled, else
   * empty (so single-root / flag-off is byte-identical).
   */
  _additionalCustomizationDirectories(workingDirectories) {
    if (!this._isMultiRootEnabled() || !workingDirectories || workingDirectories.length <= 1) {
      return [];
    }
    return workingDirectories.slice(1);
  }
  /**
   * Resolves the customization anchor(s) for a session. `directory` is the
   * primary (index 0) anchor — the worktree for worktree-isolated sessions.
   * `additionalDirectories` are the non-primary roots to attach to discovery,
   * and are applied only when `applyAdditional` is true:
   * - **provisional** (pre-send) sessions carry the client-supplied set, whose
   *   non-primary folders are stable workspace folders that can be discovered
   *   immediately (the worktree, if any, only affects index 0 at send);
   * - **not-yet-live** sessions carry the persisted set from metadata;
   * - **live** (active) sessions manage their own tail via materialize/resume,
   *   so `applyAdditional` is false to avoid clobbering it.
   */
  async _getSessionCustomizationAnchors(session) {
    const sessionId = AgentSession.id(session);
    const provisional = this._provisionalSessions.get(sessionId);
    if (provisional) {
      return {
        directory: provisional.workingDirectory,
        additionalDirectories: this._additionalCustomizationDirectories(provisional.workingDirectories),
        applyAdditional: true
      };
    }
    const entry = this._findAnySession(sessionId);
    if (entry) {
      return { directory: entry.customizationDirectory, additionalDirectories: [], applyAdditional: false };
    }
    const metadata = await this._readSessionMetadata(session);
    return {
      directory: metadata.workingDirectory ?? metadata.customizationDirectory,
      additionalDirectories: this._additionalCustomizationDirectories(metadata.workingDirectories),
      applyAdditional: true
    };
  }
  async authenticate(resource, token) {
    if (resource === this._gitHubEndpointService.getRepoResource().resource) {
      return true;
    }
    if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
      return false;
    }
    const tokenChanged = this._githubToken !== token;
    this._githubToken = token;
    this._updateRestrictedTelemetry(token);
    this._logService.info(`[Copilot] Auth token ${tokenChanged ? "updated" : "unchanged"}`);
    if (tokenChanged) {
      await this._restartClientIfProxyChanged();
      void this._scheduleModelRefresh();
    }
    return true;
  }
  async handleAuthenticationToken(params) {
    let handled = false;
    for (const [, entry] of this._sessions) {
      for (const session of entry.allChatSessions()) {
        const didHandle = await session.resolveMcpAuthentication(params);
        handled ||= didHandle;
      }
    }
    return handled;
  }
  _updateRestrictedTelemetry(githubToken) {
    this._applyRestrictedTelemetry(void 0);
    if (githubToken) {
      void this._resolveRestrictedTelemetry(githubToken);
    }
  }
  async _resolveRestrictedTelemetry(githubToken) {
    try {
      const ctx = await this._copilotApiService.resolveRestrictedTelemetryContext(githubToken);
      if (this._githubToken !== githubToken) {
        return;
      }
      this._applyRestrictedTelemetry({
        ...ctx,
        telemetryEndpoint: toRestrictedTelemetryEndpoint(ctx.telemetryEndpoint)
      });
    } catch (err) {
      this._logService.debug(`[Copilot] Restricted telemetry resolution failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _applyRestrictedTelemetry(context) {
    const rtEnabled = context?.restrictedTelemetryEnabled === true;
    if (rtEnabled !== this._restrictedTelemetryEnabled) {
      this._restrictedTelemetryEnabled = rtEnabled;
      this._logService.info(`[Copilot] Enhanced (restricted) telemetry ${rtEnabled ? "enabled for this account" : "disabled"}`);
      this._onDidChangeRestrictedTelemetry.fire();
    }
    if (isAgentHostTelemetryService(this._telemetryService)) {
      this._telemetryService.setRestrictedTelemetryEnabled(rtEnabled);
      this._telemetryService.setCopilotTrackingId(context?.trackingId);
      this._telemetryService.setRestrictedTelemetryEndpoint(context?.telemetryEndpoint);
    }
  }
  async _routeGitHubTelemetry(notification) {
    const additionalProperties = { initiatorClientType: this._clientTypeForTelemetry(notification.sessionId) };
    const router = this._githubTelemetryRouter;
    if (!router?.isTarget(notification)) {
      this._gitHubTelemetryForwarder.forward(notification);
      return;
    }
    if (!notification.restricted) {
      await router.route(notification, void 0, additionalProperties);
      return;
    }
    const sessionId = notification.sessionId;
    const githubToken = this._githubToken;
    if (!githubToken) {
      await router.route(notification, void 0, additionalProperties);
      return;
    }
    try {
      const context = await this._copilotApiService.resolveRestrictedTelemetryContext(githubToken);
      if (this._githubToken !== githubToken) {
        return;
      }
      await router.route(notification, {
        restrictedTelemetryEnabled: context.restrictedTelemetryEnabled,
        trackingId: context.trackingId,
        telemetryEndpoint: toRestrictedTelemetryEndpoint(context.telemetryEndpoint),
        isInternal: context.isInternal === true,
        userName: context.userName,
        isVscodeTeamMember: context.isVscodeTeamMember === true
      }, additionalProperties);
    } catch (error) {
      this._logService.debug(`[Copilot:${sessionId}] Restricted telemetry context resolution failed; dropping ${notification.event.kind}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  _clientTypeForTelemetry(sdkSessionId) {
    return sdkSessionId ? this._sdkSessionsById.get(sdkSessionId)?.currentTurnClientType ?? AgentHostClientType.Unknown : AgentHostClientType.Unknown;
  }
  /**
   * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh and
   * never rejects — {@link _refreshModels} already logs and retains the last
   * known-good list on failure.
   *
   * Only safe for callers with no new input to apply (the host's periodic
   * scheduler). Triggers that invalidate the in-flight request — a rotated
   * token, a restarted client — must call {@link _scheduleModelRefresh} so they
   * are not answered by a refresh bound to the superseded input.
   */
  refreshModels() {
    return this._scheduledModelRefresh?.deferred.p ?? this._modelRefreshInFlight ?? this._startModelRefresh(++this._modelCatalogGeneration);
  }
  /**
   * Invalidates an in-flight refresh immediately, then starts one refresh on
   * the next task. Repeated lifecycle triggers before that task
   * share the same deferred and enumerate only the final token/client source.
   */
  _scheduleModelRefresh() {
    const generation = ++this._modelCatalogGeneration;
    if (this._scheduledModelRefresh) {
      this._scheduledModelRefresh.generation = generation;
      return this._scheduledModelRefresh.deferred.p;
    }
    const scheduled = { deferred: new DeferredPromise(), generation };
    this._scheduledModelRefresh = scheduled;
    this._modelRefreshSchedule.value = disposableTimeout(() => {
      void (async () => {
        try {
          await this._clientStopping;
          if (this._scheduledModelRefresh !== scheduled) {
            return;
          }
          this._scheduledModelRefresh = void 0;
          this._modelRefreshSchedule.clear();
          await this._startModelRefresh(scheduled.generation);
        } catch (err) {
          this._logService.error(err, "[Copilot] Failed to schedule model refresh");
        } finally {
          if (this._scheduledModelRefresh === scheduled) {
            this._scheduledModelRefresh = void 0;
            this._modelRefreshSchedule.clear();
          }
          scheduled.deferred.complete();
        }
      })();
    }, 0);
    return scheduled.deferred.p;
  }
  _startModelRefresh(generation) {
    const refresh = this._refreshModels(0, generation).finally(() => {
      if (this._modelRefreshInFlight === refresh) {
        this._modelRefreshInFlight = void 0;
      }
    });
    this._modelRefreshInFlight = refresh;
    return refresh;
  }
  async _refreshModels(attempt = 0, generation = this._modelCatalogGeneration) {
    this._modelRefreshRetry.clear();
    if (this._shutdownPromise) {
      return;
    }
    const tokenAtRefreshStart = this._githubToken;
    if (!tokenAtRefreshStart) {
      this._capiModels = [];
      this._publishModels();
      return;
    }
    try {
      const models = await this._listModels(tokenAtRefreshStart);
      if (this._githubToken === tokenAtRefreshStart && this._modelCatalogGeneration === generation) {
        this._capiModels = models;
        this._publishModels();
      }
    } catch (err) {
      if (this._githubToken !== tokenAtRefreshStart || this._modelCatalogGeneration !== generation || this._shutdownPromise) {
        return;
      }
      if (attempt + 1 < this._modelRefreshMaxAttempts) {
        const delay = this._modelRefreshBackoff(attempt);
        this._logService.warn(`[Copilot] Failed to refresh models (attempt ${attempt + 1}), retrying in ${delay}ms`, err);
        this._modelRefreshRetry.value = disposableTimeout(() => {
          void this._refreshModels(attempt + 1, generation);
        }, delay);
        return;
      }
      this._logService.error(err, "[Copilot] Failed to refresh models");
      this._publishModels();
    }
  }
  /**
   * Re-emit the merged CAPI + BYOK model list to the picker. A fresh array is
   * allocated each call so the observable always notifies its consumers.
   */
  _publishModels() {
    this._models.set([...this._capiModels, ...this._byokModels], void 0);
  }
  /**
   * (Re)publish the renderer BYOK models from the bridge registry's serving
   * window. Triggered when any renderer bridge connects, disconnects, or
   * reports a model change — the registry owns enumeration (with its own
   * connect-time retry) and caches the serving window's models, so this is a
   * cheap synchronous read of that cache.
   *
   * Each model is surfaced under the provider-qualified id `vendor/id` so a
   * selection round-trips to the per-session provider config synthesized by
   * `resolveByokSessionConfig`.
   */
  _refreshByokModels() {
    if (this._shutdownPromise) {
      return;
    }
    this._byokModels = this._byokBridgeRegistry.getModels().map((m) => {
      const byokMeta = createAgentModelByokMeta(m.modelIdentifier);
      const supportedReasoningEfforts = m.supportedReasoningEfforts?.filter(isCopilotReasoningEffort);
      const defaultReasoningEffort = supportedReasoningEfforts?.find((effort) => effort === m.defaultReasoningEffort) ?? supportedReasoningEfforts?.[0];
      const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(supportedReasoningEfforts, defaultReasoningEffort);
      return {
        provider: this.id,
        id: `${m.vendor}/${m.id}`,
        name: m.name ?? m.id,
        maxContextWindow: m.maxContextWindowTokens,
        supportsVision: m.supportsVision ?? false,
        ...thinkingLevel ? { configSchema: { type: "object", properties: { [ThinkingLevelConfigKey]: thinkingLevel } } } : {},
        ...byokMeta && { _meta: byokMeta }
      };
    });
    this._logService.trace(`[Copilot] Found ${this._byokModels.length} BYOK models${this._byokModels.length ? ": " + this._byokModels.map((m) => m.name).join(", ") : ""}`);
    this._publishModels();
  }
  /**
   * Equal-jitter exponential backoff for model-refresh retries. Doubles the
   * base delay per attempt (capped at {@link _modelRefreshMaxDelayMs}) and
   * picks a random point in the upper half of that window, so the returned
   * delay lands in `[exp/2, exp]`. The jitter avoids synchronized retries
   * across windows/agents hitting a shared rate limit, while the `exp/2`
   * floor keeps a minimum spacing between attempts.
   */
  _modelRefreshBackoff(attempt) {
    const exp = Math.min(this._modelRefreshMaxDelayMs, this._modelRefreshBaseDelayMs * 2 ** attempt);
    return Math.round(exp / 2 + Math.random() * (exp / 2));
  }
  _stopClient() {
    this._pendingClientRestartReasons.clear();
    if (this._clientStopping) {
      return this._clientStopping;
    }
    const stopping = (async () => {
      const clientStarting = this._clientStarting;
      if (clientStarting) {
        try {
          await clientStarting;
        } catch {
        }
      }
      const client = this._client;
      this._client = void 0;
      this._clientStarting = void 0;
      await client?.stop();
      await this._sessionLauncher.disposeByokProxyHandle();
    })().finally(() => {
      if (this._clientStopping === stopping) {
        this._clientStopping = void 0;
      }
    });
    this._clientStopping = stopping;
    return stopping;
  }
  /**
   * Enables plan mode by injecting `requestExitPlanMode: true` into the
   * payload of every `session.create` / `session.resume` JSON-RPC request,
   * and registers a connection-level handler for the resulting
   * `exitPlanMode.request` RPC the CLI sends back.
   *
   * The SDK (`@github/copilot-sdk@^0.3.0`) does not expose `onExitPlanMode`
   * in its public {@link SessionConfig} surface, so both the wire flag and
   * the response handler are wired through the SDK's private
   * `MessageConnection`. Once the SDK adds first-class support, this shim
   * should be removed.
   */
  _enablePlanModeOnClient(client) {
    const connection = client.connection;
    if (!connection) {
      this._logService.warn("[Copilot] Could not enable plan mode: client.connection is null");
      return;
    }
    if (typeof connection.sendRequest !== "function") {
      this._logService.warn(`[Copilot] Could not enable plan mode: client.connection.sendRequest is ${typeof connection.sendRequest}`);
      return;
    }
    if (typeof connection.onRequest !== "function") {
      this._logService.warn(`[Copilot] Could not enable plan mode: client.connection.onRequest is ${typeof connection.onRequest}`);
      return;
    }
    const originalSendRequest = connection.sendRequest.bind(connection);
    connection.sendRequest = (method, params) => {
      if ((method === "session.create" || method === "session.resume") && params && typeof params === "object") {
        return originalSendRequest(method, { ...params, requestExitPlanMode: true });
      }
      return originalSendRequest(method, params);
    };
  }
  // ---- client lifecycle ---------------------------------------------------
  async _ensureClient() {
    if (this._shutdownPromise) {
      throw new CancellationError();
    }
    while (this._clientStopping) {
      await this._clientStopping;
      if (this._shutdownPromise) {
        throw new CancellationError();
      }
    }
    if (this._client) {
      return this._client;
    }
    if (this._clientStarting) {
      return this._clientStarting;
    }
    const sessionSyncAtStartup = this._isSessionSyncEnabled();
    const rubberDuckAtStartup = this._isRubberDuckEnabled();
    const copilotSdkLogLevelSettingAtStartup = this._getCopilotSdkLogLevelSetting();
    const enterpriseHostAtStartup = this._getEnterpriseHost();
    const systemProxyEnabledAtStartup = this._isSystemProxyEnabled();
    const clientStarting = (async () => {
      this._logService.info("[Copilot] Starting CopilotClient...");
      const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1" });
      delete env["NODE_OPTIONS"];
      delete env["VSCODE_INSPECTOR_OPTIONS"];
      delete env["VSCODE_ESM_ENTRYPOINT"];
      delete env["VSCODE_HANDLES_UNCAUGHT_ERRORS"];
      for (const key of Object.keys(env)) {
        if (key === "ELECTRON_RUN_AS_NODE") {
          continue;
        }
        if (key === "VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE") {
          continue;
        }
        if (key.startsWith("VSCODE_") || key.startsWith("ELECTRON_")) {
          delete env[key];
        }
      }
      env["COPILOT_CLI_RUN_AS_NODE"] = "1";
      env["USE_BUILTIN_RIPGREP"] = "false";
      env["COPILOT_MCP_APPS"] = "true";
      env[AiAgentEnvVar] = AiAgentEnvValue;
      env["AUTO_APPROVAL"] = "true";
      await this._configureProxyEnv(env);
      if (process.platform === "linux") {
        const enabledFlags = env["COPILOT_CLI_ENABLED_FEATURE_FLAGS"];
        const flags = new Set((enabledFlags ?? "").split(",").map((f) => f.trim()).filter(Boolean));
        flags.add("SHELL_SPAWN_BACKEND");
        env["COPILOT_CLI_ENABLED_FEATURE_FLAGS"] = [...flags].join(",");
      }
      env["GITHUB_COPILOT_INTEGRATION_ID"] = COPILOT_INTEGRATION_ID;
      this._logService.info(`[Copilot] Set CLI env: GITHUB_COPILOT_INTEGRATION_ID=${COPILOT_INTEGRATION_ID}`);
      const enterpriseHost = this._getEnterpriseHost();
      if (enterpriseHost) {
        env["COPILOT_GH_HOST"] = enterpriseHost;
        this._logService.info(`[Copilot] Set CLI env: COPILOT_GH_HOST=${enterpriseHost}`);
      }
      if (this._isRubberDuckEnabled()) {
        env["RUBBER_DUCK_AGENT"] = "true";
      } else {
        delete env["RUBBER_DUCK_AGENT"];
      }
      const nodeModulesUri = FileAccess.asFileUri(getAppNodeModulesPath());
      const cliPath = await resolveCopilotCliPath(nodeModulesUri);
      env["MXC_BIN_DIR"] = URI.joinPath(nodeModulesUri, "@microsoft", "mxc-sdk", "bin").fsPath;
      const resolvedRgDiskPath = await rgDiskPath();
      const rgDir = dirname(resolvedRgDiskPath);
      const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      const currentPath = env[pathKey];
      env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
      this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);
      const telemetry = await this._otelService.getSdkTelemetryConfig();
      const copilotSdkLogLevelAtStartup = this._resolveCopilotSdkLogLevel(copilotSdkLogLevelSettingAtStartup);
      const clientOptions = {
        useLoggedInUser: false,
        connection: RuntimeConnection.forStdio({ path: cliPath }),
        env,
        telemetry,
        logLevel: copilotSdkLogLevelAtStartup,
        enableRemoteSessions: sessionSyncAtStartup,
        onGitHubTelemetry: (notification) => {
          void this._routeGitHubTelemetry(notification).catch((err) => this._logService.trace(`[Copilot] GitHub telemetry routing failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      };
      const client = this._createCopilotClient(clientOptions);
      await client.start();
      if (this._shutdownPromise) {
        await client.stop();
        throw new CancellationError();
      }
      if (this._isSessionSyncEnabled() !== sessionSyncAtStartup || this._isRubberDuckEnabled() !== rubberDuckAtStartup || this._getCopilotSdkLogLevelSetting() !== copilotSdkLogLevelSettingAtStartup || this._getEnterpriseHost() !== enterpriseHostAtStartup || this._isSystemProxyEnabled() !== systemProxyEnabledAtStartup) {
        await client.stop();
        throw new Error("Copilot startup config changed while the client was starting");
      }
      this._logService.info("[Copilot] CopilotClient started successfully");
      this._enablePlanModeOnClient(client);
      this._client = client;
      this._clientStarting = void 0;
      return client;
    })();
    this._clientStarting = clientStarting;
    void clientStarting.catch(() => {
      this._clientStarting = void 0;
    });
    return clientStarting;
  }
  // ---- session management -------------------------------------------------
  _createThinkingLevelConfigSchemaProperty(supportedReasoningEfforts, defaultReasoningEffort) {
    if (!supportedReasoningEfforts?.length) {
      return void 0;
    }
    return {
      type: "string",
      title: localize("copilot.modelThinkingLevel.title", "Thinking Level"),
      description: localize("copilot.modelThinkingLevel.description", "Controls how much reasoning effort the model uses."),
      default: defaultReasoningEffort,
      enum: [...supportedReasoningEfforts],
      enumLabels: supportedReasoningEfforts.map(getReasoningEffortLabel),
      enumDescriptions: supportedReasoningEfforts.map((value) => getReasoningEffortDescription(value) ?? "")
    };
  }
  /**
   * Synthesize a `contextSize` config property when the model exposes a `long_context` pricing tier with a distinct
   * context-max. Picker surfaces this as the "Context Size" button. Mirrors `getContextSizeOptions` in
   * `extensions/copilot/src/extension/chat/vscode-node/languageModelAccess.ts`.
   *
   * The `enum` values are the two context-window sizes (in tokens), smallest first, so the numeric token counts
   * flow to the client. The chosen value comes back in the model's `config` bag and is mapped to the SDK's
   * two-valued `contextTier` at the SDK boundary by {@link getCopilotContextTier}, using the model's long-context
   * window from {@link _longContextWindowFor}.
   */
  _createContextSizeConfigSchemaProperty(billing) {
    const tokenPrices = billing?.tokenPrices;
    const defaultMax = tokenPrices?.contextMax;
    const longContextMax = tokenPrices?.longContext?.contextMax;
    if (!defaultMax || !longContextMax || defaultMax >= longContextMax) {
      return void 0;
    }
    if (this._isPreferLongContextEnabled() && !hasLongContextSurcharge(billing)) {
      return {
        type: "number",
        title: localize("copilot.modelContextSize.title", "Context Size"),
        description: localize("copilot.modelContextSize.description", "Selects the context window size for this model."),
        default: longContextMax,
        enum: [longContextMax],
        enumLabels: [formatTokenCount(longContextMax)],
        enumDescriptions: [
          localize("copilot.modelContextSize.longerSessions", "Longer sessions")
        ]
      };
    }
    return {
      type: "number",
      title: localize("copilot.modelContextSize.title", "Context Size"),
      description: localize("copilot.modelContextSize.description", "Selects the context window size for this model."),
      default: defaultMax,
      enum: [defaultMax, longContextMax],
      enumLabels: [formatTokenCount(defaultMax), formatTokenCount(longContextMax)],
      enumDescriptions: [
        localize("copilot.modelContextSize.default", "Default"),
        localize("copilot.modelContextSize.longerSessions", "Longer sessions")
      ]
    };
  }
  /**
   * The model's long-context window (in tokens): the largest size offered by its "Context Size" picker
   * (the max numeric value in the synthesized `contextSize` {@link ConfigPropertySchema.enum}). Used by
   * {@link getCopilotContextTier} to decide whether a numeric selection opts into `long_context`.
   * Returns `undefined` when the model exposes no such picker (or the model list isn't loaded yet),
   * leaving the SDK on its default tier.
   */
  _longContextWindowFor(modelId) {
    if (!modelId) {
      return void 0;
    }
    const windows = this._models.get().find((m) => m.id === modelId)?.configSchema?.properties?.[ContextSizeConfigKey]?.enum;
    const numericWindows = windows?.filter((w) => typeof w === "number");
    return numericWindows && numericWindows.length > 0 ? Math.max(...numericWindows) : void 0;
  }
  /**
   * Whether the model has a long-context window available at no additional cost.
   * When true the model should always run in `long_context` tier without showing
   * a context-size picker.
   */
  _isFreeLongContext(modelId) {
    return !!modelId && this._freeLongContextModels.has(modelId);
  }
  /**
   * Builds the open `_meta` model picker bag from the SDK's billing and picker metadata.
   */
  _createModelPickerMeta(modelInfo, billing) {
    return createPricingMetaFromBilling(billing, modelInfo.modelPickerPriceCategory, modelInfo.modelPickerCategory);
  }
  _createModelConfigSchema(m, billing) {
    const properties = {};
    const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(m.supportedReasoningEfforts, m.defaultReasoningEffort);
    if (thinkingLevel) {
      properties[ThinkingLevelConfigKey] = thinkingLevel;
    }
    const contextSize = this._createContextSizeConfigSchemaProperty(billing);
    if (contextSize) {
      properties[ContextSizeConfigKey] = contextSize;
    }
    if (Object.keys(properties).length === 0) {
      return void 0;
    }
    return { type: "object", properties };
  }
  _serializeModelSelection(model) {
    return JSON.stringify(model);
  }
  _parseModelSelection(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && typeof value.id === "string") {
        const modelSelection = { id: value.id };
        if (value.config && typeof value.config === "object") {
          const config = {};
          for (const [key, configValue] of Object.entries(value.config)) {
            if (typeof configValue === "string") {
              config[key] = configValue;
            }
          }
          if (Object.keys(config).length > 0) {
            modelSelection.config = config;
          }
        }
        return modelSelection;
      }
    } catch {
    }
    return { id: raw };
  }
  _serializeAgentSelection(agent) {
    return JSON.stringify({ uri: agent.uri });
  }
  _parseAgentSelection(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && typeof value.uri === "string") {
        return { uri: value.uri };
      }
    } catch {
    }
    return void 0;
  }
  /**
   * Resolves an {@link AgentSelection}'s SDK-facing name from the plugin
   * snapshot that is, or will be, applied to the SDK session.
   */
  _resolveAgentName(snapshot, agent) {
    for (const plugin of snapshot.plugins) {
      const found = plugin.agents.find((a) => a.uri.toString() === agent.uri);
      if (found) {
        return found.name;
      }
    }
    return void 0;
  }
  async listSessions() {
    this._logService.info("[Copilot] Listing sessions...");
    const client = await this._ensureClient();
    const sessions = await client.listSessions();
    const projectLimiter = new Limiter(4);
    const projectByContext = /* @__PURE__ */ new Map();
    const mapped = await Promise.all(sessions.map(async (s) => {
      const session = AgentSession.uri(this.id, s.sessionId);
      const metadata = await this._readStoredSessionMetadata(session);
      if (!metadata) {
        return void 0;
      }
      let { project, resolved } = metadata;
      if (!resolved) {
        project = await this._resolveSessionProject(s.context, projectLimiter, projectByContext);
        void this._storeSessionProjectResolution(session, project);
      }
      const workingDirectories = metadata.workingDirectories ?? (typeof s.context?.workingDirectory === "string" ? [URI.file(s.context.workingDirectory)] : void 0);
      const result2 = {
        session,
        startTime: s.startTime.getTime(),
        modifiedTime: s.modifiedTime.getTime(),
        project,
        summary: s.summary,
        workingDirectories
      };
      return result2;
    }));
    const result = mapped.filter((s) => s !== void 0);
    this._logService.info(`[Copilot] Found ${result.length} sessions`);
    return result;
  }
  async getSessionMetadata(session) {
    const sessionId = AgentSession.id(session);
    const storedMetadata = await this._readStoredSessionMetadata(session);
    if (!storedMetadata) {
      return void 0;
    }
    const client = await this._ensureClient();
    const sessionMetadata = await client.getSessionMetadata(sessionId);
    if (!sessionMetadata) {
      return void 0;
    }
    let project = storedMetadata?.project;
    if (storedMetadata && !storedMetadata.resolved) {
      const projectLimiter = new Limiter(1);
      project = await this._resolveSessionProject(sessionMetadata?.context, projectLimiter, /* @__PURE__ */ new Map());
      void this._storeSessionProjectResolution(session, project);
    }
    const workingDirectories = storedMetadata?.workingDirectories ?? (typeof sessionMetadata?.context?.workingDirectory === "string" ? [URI.file(sessionMetadata.context.workingDirectory)] : void 0);
    return {
      session,
      startTime: sessionMetadata?.startTime.getTime() ?? Date.now(),
      modifiedTime: sessionMetadata?.modifiedTime.getTime() ?? Date.now(),
      project,
      summary: sessionMetadata?.summary,
      workingDirectories
    };
  }
  async _listModels(gitHubToken) {
    this._logService.info("[Copilot] Listing models...");
    const client = await this._ensureClient();
    const { models } = await client.rpc.models.list({ gitHubToken });
    this._freeLongContextModels.clear();
    const preferLongContext = this._isPreferLongContextEnabled();
    const result = models.map((m) => {
      const billing = normalizeCAPIBilling(m.billing);
      const configSchema = this._createModelConfigSchema(m, billing);
      const tokenPrices = billing?.tokenPrices;
      const hasLargerLongContext = !!tokenPrices?.contextMax && !!tokenPrices.longContext?.contextMax && tokenPrices.longContext.contextMax > tokenPrices.contextMax;
      if (preferLongContext && hasLargerLongContext && !hasLongContextSurcharge(billing)) {
        this._freeLongContextModels.add(m.id);
      }
      return {
        provider: this.id,
        id: m.id,
        name: m.name,
        // Synthetic SDK entries like `auto` ship with `capabilities: {}` and
        // no fixed context window — surface them with maxContextWindow undefined.
        maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
        maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
        maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
        supportsVision: !!m.capabilities?.supports?.vision,
        configSchema,
        policyState: m.policy?.state,
        _meta: this._createModelPickerMeta(m, billing)
      };
    });
    this._logService.info(`[Copilot] Found ${result.length} models: ${result.map((m) => m.name).join(", ")}`);
    return result;
  }
  /**
   * Resolves the working directory for a {@link createSession} call: the caller-supplied folder, else a
   * still-provisional session's folder for an idempotent re-create, else — when the session is workspace-less
   * (no `workingDirectory` supplied) — a stable per-session scratch directory.
   */
  async _resolveCreateWorkingDirectory(sessionConfig, sessionId, isWorkspaceless) {
    const existing = sessionConfig.workingDirectories?.[0] ?? this._provisionalSessions.get(sessionId)?.workingDirectory;
    if (existing) {
      return existing;
    }
    if (isWorkspaceless) {
      const scratchDir = this._workspacelessScratchDir(sessionId);
      await fs.mkdir(scratchDir.fsPath, { recursive: true });
      return scratchDir;
    }
    const tmpPath = await fs.mkdtemp(join(os.tmpdir(), "agent-host-session-"));
    const workingDirectory = URI.file(tmpPath);
    this._logService.trace(`[Copilot] No workingDirectory provided, defaulting to temp directory: ${workingDirectory.fsPath}`);
    return workingDirectory;
  }
  /**
   * Stable per-session scratch directory for a workspace-less chat:
   * `<userHome>/.copilot/chats/<sessionId>`. Deterministic, persistent, and
   * cleaned up on session delete (see {@link _cleanupWorkspacelessScratchDir}).
   */
  _workspacelessScratchDir(sessionId) {
    return workspacelessScratchDir(this._environmentService.userHome, sessionId);
  }
  /** Ensures a workspace-less chat's scratch dir exists (mkdir -p), recreating it if it was reaped. */
  async _ensureWorkspacelessScratchDir(scratchDir, sessionId) {
    try {
      await fs.mkdir(scratchDir.fsPath, { recursive: true });
      this._logService.trace(`[Copilot:${sessionId}] Workspace-less scratch directory ready: ${scratchDir.fsPath}`);
    } catch (error) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to ensure workspace-less scratch directory '${scratchDir.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /** Removes a workspace-less chat's stable scratch dir on session delete/dispose. */
  async _cleanupWorkspacelessScratchDir(scratchDir, sessionId) {
    try {
      await fs.rm(scratchDir.fsPath, { recursive: true, force: true });
      this._logService.trace(`[Copilot:${sessionId}] Removed workspace-less scratch directory: ${scratchDir.fsPath}`);
    } catch (error) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to remove workspace-less scratch directory '${scratchDir.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // ---- Chat surface ------------------------------------------------------
  //
  // The chat-addressed operation surface (see
  // {@link IAgent.chats}). The orchestrator owns the feature-level
  // `(session, chat)` mapping and hands these methods a single,
  // concrete chat channel URI: the default chat channel or an additional
  // peer chat channel. Each method re-derives the `(session, chat)` pair
  // the agent's internal SDK storage is keyed by via
  // {@link _resolveChatTarget}.
  /**
   * Maps a resolved chat URI to the `(session, chat)` pair the agent's
   * internal storage is keyed by. A peer (`ahp-chat`) chat carries its
   * owning session in its URI. The default chat is addressed by its
   * deterministic chat channel URI.
   */
  _resolveChatTarget(chat) {
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`Copilot chat operation requires an AHP chat URI: ${chat.toString()}`);
    }
    return { session: URI.parse(parsed.session), chat };
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
   * Resolve the session's materialized default (main) chat by raw session id,
   * or `undefined` when the session is provisional or not in memory. The
   * default chat is the primary {@link CopilotAgentSession} of the owning
   * {@link CopilotSessionEntry}.
   */
  _findAnySession(sessionId) {
    return this._sessions.get(sessionId)?.defaultChat;
  }
  _getRuntimeSlashCommands(sessionId, options) {
    const session = this._findAnySession(sessionId);
    if (session) {
      return session.getRuntimeSlashCommands(options) ?? [];
    }
    return this._slashCommandProvider.getSlashCommands(options);
  }
  /**
   * Resolve a live peer (non-default) chat — its own SDK chat — by
   * looking it up within the owning session's entry. Returns `undefined` when
   * the session (or the peer chat) is not in memory.
   */
  _findPeerChat(session, chat) {
    return this._sessions.get(AgentSession.id(session))?.getPeerChat(chat.toString());
  }
  /**
   * Return the owning session's entry, creating an empty one (no default chat
   * yet) if needed so a peer chat can be hosted on a still-provisional parent.
   */
  _ensureEntry(sessionId) {
    let entry = this._sessions.get(sessionId);
    if (!entry) {
      entry = new CopilotSessionEntry();
      this._sessions.set(sessionId, entry);
    }
    return entry;
  }
  async createSession(config) {
    const sessionConfig = config ?? {};
    this._logService.info(`[Copilot] Creating session... ${sessionConfig.model ? `model=${sessionConfig.model.id}` : ""}`);
    const sessionId = sessionConfig.session ? AgentSession.id(sessionConfig.session) : generateUuid();
    const isWorkspaceless = !sessionConfig.fork && sessionConfig.workingDirectories === void 0;
    const workingDirectory = await this._resolveCreateWorkingDirectory(sessionConfig, sessionId, isWorkspaceless);
    const client = await this._ensureClient();
    if (sessionConfig.fork) {
      const sourceSessionId = AgentSession.id(sessionConfig.fork.session);
      return this._sessionSequencer.queue(sourceSessionId, async () => {
        this._logService.info(`[Copilot] Forking session ${sourceSessionId} at turnId=${sessionConfig.fork.turnId}`);
        const sourceEntry = this._findAnySession(sourceSessionId) ?? await this._resumeSession(sourceSessionId);
        const toEventId = await sourceEntry.getNextTurnEventId(sessionConfig.fork.turnId);
        const forkResult = await client.rpc.sessions.fork({
          sessionId: sourceSessionId,
          ...toEventId ? { toEventId } : {}
        });
        const newSessionId = forkResult.sessionId;
        const targetDbDir = this._sessionDataService.getSessionDataDirById(newSessionId);
        const targetDbPath = URI.joinPath(targetDbDir, SESSION_DB_FILENAME);
        try {
          const sourceDbRef = await this._sessionDataService.tryOpenDatabase(sessionConfig.fork.session);
          if (sourceDbRef) {
            try {
              await fs.mkdir(targetDbDir.fsPath, { recursive: true });
              await fs.rm(targetDbPath.fsPath, { force: true });
              await sourceDbRef.object.vacuumInto(targetDbPath.fsPath);
            } finally {
              sourceDbRef.dispose();
            }
          }
        } catch (err) {
          this._logService.warn(`[Copilot] Failed to copy session database for fork: ${err instanceof Error ? err.message : String(err)}`);
        }
        const agentSession = await this._resumeSession(newSessionId);
        if (sessionConfig.fork.turnIdMapping) {
          await agentSession.remapTurnIds(sessionConfig.fork.turnIdMapping);
        }
        const session = agentSession.sessionUri;
        this._logService.info(`[Copilot] Forked session created: ${session.toString()}`);
        try {
          await this._reviewService.copyReviewedRef(sessionConfig.fork.session.toString(), session.toString(), workingDirectory);
        } catch (err) {
          this._logService.warn(`[Copilot] Failed to copy reviewed ref for fork: ${err instanceof Error ? err.message : String(err)}`);
        }
        const project2 = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
        await this._storeSessionMetadata(session, sessionConfig.model, workingDirectory, sessionConfig.workingDirectories ?? (workingDirectory ? [workingDirectory] : void 0), workingDirectory, project2, true);
        if (sessionConfig.agent !== void 0) {
          await this._storeSessionAgentMetadata(session, sessionConfig.agent);
        }
        return { session, resolvedWorkingDirectory: workingDirectory, ...project2 ? { project: project2 } : {} };
      });
    }
    if (sessionConfig.importConversation) {
      return this._importConversation(sessionConfig, sessionId, workingDirectory);
    }
    const sessionUri = AgentSession.uri(this.id, sessionId);
    if (this._findAnySession(sessionId)) {
      this._logService.info(`[Copilot] createSession is a no-op: session already materialized: ${sessionUri.toString()}`);
      const project2 = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
      return { session: sessionUri, resolvedWorkingDirectory: workingDirectory, ...project2 ? { project: project2 } : {} };
    }
    const alreadyProvisional = this._provisionalSessions.has(sessionId);
    if (sessionConfig.activeClient) {
      const ac = this._getOrCreateActiveClient(sessionUri, workingDirectory);
      ac.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(sessionConfig.workingDirectories));
      const seeded = sessionConfig.activeClient;
      ac.toolSet.set(seeded.clientId, seeded.tools);
      ac.getOrCreateHandle(seeded.clientId, seeded.displayName);
      if (seeded.customizations !== void 0) {
        await ac.pluginController.sync(seeded.clientId, seeded.customizations, { quiet: true });
      }
    }
    const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
    if (!alreadyProvisional) {
      this._provisionalSessions.set(sessionId, {
        sessionId,
        sessionUri,
        workingDirectory,
        workingDirectories: sessionConfig.workingDirectories,
        model: sessionConfig.model,
        agent: sessionConfig.agent,
        project,
        workspaceless: isWorkspaceless
      });
    }
    this._logService.info(`[Copilot] Session created (provisional): ${sessionUri.toString()}`);
    return { session: sessionUri, resolvedWorkingDirectory: workingDirectory, provisional: true, ...project ? { project } : {} };
  }
  /**
   * Materializes an imported conversation into a real, editable Copilot
   * session. Translates the supplied turns into a Copilot event log, seeds it
   * at the CLI's native per-session store, then resumes the session so the
   * SDK reconstitutes the turns as genuine backend events (editable / forkable
   * / truncatable). The turns arrive with fresh UUID ids assigned by the
   * service layer, so the seeded event ids and the seeded protocol turns stay
   * aligned. Mirrors the immediate-materialization shape of the fork path.
   */
  async _importConversation(sessionConfig, sessionId, workingDirectory) {
    const importConfig = sessionConfig.importConversation;
    const sessionUri = AgentSession.uri(this.id, sessionId);
    return this._sessionSequencer.queue(sessionId, async () => {
      this._logService.info(`[Copilot] Importing conversation into session ${sessionId} (${importConfig.turns.length} turns)`);
      const model = importConfig.model ?? sessionConfig.model;
      const projectPromise = projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
      const eventsPath = join(getCopilotHomePath(this._environmentService.userHome.fsPath, process.env), "session-state", sessionId, "events.jsonl");
      const jsonl = buildSessionEventLogFromTurns(importConfig.turns, {
        sessionId,
        workingDirectory: workingDirectory.fsPath,
        model: model?.id
      });
      await fs.mkdir(dirname(eventsPath), { recursive: true });
      await fs.writeFile(eventsPath, jsonl, "utf8");
      const project = await projectPromise;
      await this._storeSessionMetadata(sessionUri, model, workingDirectory, sessionConfig.workingDirectories ?? (workingDirectory ? [workingDirectory] : void 0), workingDirectory, project);
      if (sessionConfig.agent !== void 0) {
        await this._storeSessionAgentMetadata(sessionUri, sessionConfig.agent);
      }
      await this._resumeSession(sessionId);
      this._logService.info(`[Copilot] Imported session created: ${sessionUri.toString()}`);
      return { session: sessionUri, resolvedWorkingDirectory: workingDirectory, ...project ? { project } : {} };
    });
  }
  /**
   * Promotes a {@link IProvisionalSession} into a real Copilot SDK session
   * by performing the work that {@link createSession} previously did
   * eagerly: resolves the working directory (creating a worktree if
   * `isolation === 'worktree'`), instantiates the {@link CopilotAgentSession},
   * persists session metadata, and notifies the {@link IAgentService} via
   * {@link onDidMaterializeSession} so it can fire the deferred
   * `sessionAdded` protocol notification.
   *
   * Called from {@link sendMessage} immediately before a turn is dispatched.
   * Already runs inside the session sequencer, so concurrent sends serialize
   * naturally.
   *
   * The latest model lives on the provisional record (kept in sync via
   * {@link changeModel}). The latest provider-owned session config is read
   * straight from the state manager via
   * {@link IAgentConfigurationService.getSessionConfigValues} so any
   * `SessionConfigChanged` actions that arrived after `createSession` are
   * honoured without bespoke forwarding.
   */
  async _materializeProvisional(sessionId, resolvedWorkingDirectories) {
    const provisional = this._provisionalSessions.get(sessionId);
    if (!provisional) {
      throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
    }
    const client = await this._ensureClient();
    const sessionUri = provisional.sessionUri;
    const workingDirectory = resolvedWorkingDirectories?.[0] ?? provisional.workingDirectory;
    const customizationDirectory = workingDirectory ?? provisional.workingDirectory;
    const activeClient = this._getOrCreateActiveClient(sessionUri, customizationDirectory);
    activeClient.pluginController.reanchor(customizationDirectory);
    activeClient.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(resolvedWorkingDirectories));
    const snapshot = await activeClient.snapshot();
    const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, workingDirectory);
    let agentSession;
    let agent;
    try {
      const resolvedAgent = await this._resolveAgentWhenMaterializing(provisional, snapshot, workingDirectory);
      agent = resolvedAgent?.agent;
      const launchPlan = {
        kind: "create",
        client,
        sessionId,
        workingDirectory,
        additionalDirectories: resolvedWorkingDirectories?.slice(1),
        resolvedAgentName: resolvedAgent?.name,
        snapshot,
        activeClientToolSet: activeClient.toolSet,
        shellManager,
        githubToken: this._githubToken,
        model: provisional.model,
        longContextWindow: this._longContextWindowFor(provisional.model?.id),
        freeLongContext: this._isFreeLongContext(provisional.model?.id),
        workspaceless: provisional.workspaceless
      };
      agentSession = this._createAgentSession(launchPlan, customizationDirectory, activeClient);
      await agentSession.initializeSession();
      this._registerInitializedSession(sessionId, agentSession);
    } catch (error) {
      agentSession?.dispose();
      throw error;
    }
    const project = await projectFromCopilotContext({ cwd: workingDirectory?.fsPath }, this._gitService);
    const materializedWorkingDirectories = resolvedWorkingDirectories ?? (workingDirectory ? [workingDirectory] : void 0);
    this._provisionalSessions.delete(sessionId);
    await this._storeSessionMetadata(sessionUri, provisional.model, workingDirectory, materializedWorkingDirectories, customizationDirectory, project, true);
    if (agent !== void 0) {
      await this._storeSessionAgentMetadata(sessionUri, agent);
    }
    this._checkpointService.captureBaselineCheckpoint(sessionUri, materializedWorkingDirectories).catch((err) => {
      this._logService.warn(`[Copilot:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    this._logService.info(`[Copilot] Session materialized: ${sessionUri.toString()}`);
    this._onDidMaterializeSession.fire({ session: sessionUri, project, workingDirectories: materializedWorkingDirectories });
    return agentSession;
  }
  async _resolveAgentWhenMaterializing(provisional, snapshot, workingDirectory) {
    const agent = provisional.agent;
    if (!agent) {
      return void 0;
    }
    const alternativeAgent = this._getAlternativeAgentForWorktree(provisional, workingDirectory);
    const originalAgentName = this._resolveAgentName(snapshot, agent);
    const alternativeAgentName = alternativeAgent ? this._resolveAgentName(snapshot, alternativeAgent) : void 0;
    if (originalAgentName) {
      return { agent, name: originalAgentName };
    }
    if (alternativeAgentName && alternativeAgent) {
      this._logService.info(`[Copilot] Agent file ${agent.uri} is in the original repo; using worktree agent ${alternativeAgent?.uri}`);
      return { agent: alternativeAgent, name: alternativeAgentName };
    }
    return void 0;
  }
  _getAlternativeAgentForWorktree(provisional, workingDirectory) {
    const agent = provisional.agent;
    if (!agent) {
      return void 0;
    }
    if (!provisional.workingDirectory || !workingDirectory) {
      return void 0;
    }
    if (isEqual(provisional.workingDirectory, workingDirectory)) {
      return void 0;
    }
    const agentUri = URI.parse(agent.uri);
    const alternativeAgentUri = rebaseUnder(agentUri, provisional.workingDirectory, workingDirectory);
    return alternativeAgentUri ? { uri: alternativeAgentUri.toString() } : void 0;
  }
  async resolveSessionConfig(params) {
    const values = platformSessionSchema.validateOrDefault(migrateLegacyAutopilotConfig(params.config), {
      [SessionConfigKey.AutoApprove]: "default",
      [SessionConfigKey.Mode]: "interactive"
      // Permissions intentionally omitted — leave unset so auto-approval
      // falls through to the host-level `permissions` default, and only
      // materializes on the session once the user hits "Allow in this
      // Session".
    });
    return {
      schema: platformSessionSchema.toProtocol(),
      values
    };
  }
  async sessionConfigCompletions(_params) {
    return { items: [] };
  }
  getOrCreateActiveClient(session, client) {
    const activeClient = this._getOrCreateActiveClient(session, void 0);
    if (!activeClient.pluginController.directory) {
      this._getSessionCustomizationAnchors(session).then(
        (anchors) => {
          activeClient.pluginController.setDirectory(anchors.directory);
          if (anchors.applyAdditional) {
            activeClient.pluginController.setAdditionalDirectories(anchors.additionalDirectories);
          }
        },
        () => {
        }
      );
    }
    return activeClient.getOrCreateHandle(client.clientId, client.displayName);
  }
  removeActiveClient(session, clientId) {
    const sessionId = AgentSession.id(session);
    this._logService.info(`[Copilot:${sessionId}] removeActiveClient: clientId=${clientId}`);
    this._activeClients.get(session)?.removeClient(clientId);
  }
  onClientToolCallComplete(session, chat, toolCallId, result) {
    const sessionId = AgentSession.id(session);
    if (!isDefaultChatUri(chat)) {
      const peerChat = this._findPeerChat(session, chat);
      if (!peerChat) {
        this._logService.warn(`[Copilot:${sessionId}] Dropping client tool completion for missing peer chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] Routing client tool completion to peer chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
      peerChat.handleClientToolCallComplete(toolCallId, result);
    } else {
      const entry = this._findAnySession(sessionId);
      if (!entry) {
        this._logService.warn(`[Copilot:${sessionId}] Dropping client tool completion for missing default chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] Routing client tool completion to default chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
      entry.handleClientToolCallComplete(toolCallId, result);
    }
  }
  async _sendMessage(chat, prompt, attachments, turnId, senderClientId, clientType = AgentHostClientType.Unknown, workingDirectories) {
    const context = this._getChatContext(chat);
    if (context.isPeerChat) {
      const entry = await this._ensureChatSession(context.session, chat);
      if (!entry) {
        throw new Error(`[Copilot] sendMessage for unknown chat: ${chat.toString()}`);
      }
      if (turnId) {
        entry.resetTurnState(turnId, senderClientId, clientType);
      }
      const sideChat = this._chatBackings.get(chat.toString())?.sideChat;
      const existingTurns = sideChat ? await entry.getMessages() : [];
      const sdkPrompt = prepareSideChatPrompt(prompt, existingTurns, sideChat);
      await entry.send(sdkPrompt, attachments, turnId, this._resolveSdkMode(context.session), senderClientId, clientType);
      return;
    }
    await this._sessionSequencer.queue(context.sessionId, async () => {
      await this._activeClients.get(context.session)?.pluginController.retryFailedClientSyncIfNeeded();
      let entry;
      if (this._provisionalSessions.has(context.sessionId)) {
        entry = await this._materializeProvisional(context.sessionId, workingDirectories);
      } else {
        entry = this._getChatContext(chat).target;
      }
      const activeClient = this._activeClients.get(context.session);
      const hadCachedEntry = !!entry;
      this._logService.info(`[Copilot:${context.sessionId}] sendMessage: cachedEntry=${hadCachedEntry}, hasActiveClient=${!!activeClient}, activeClientId=${activeClient ? "(set)" : "(none)"}`);
      if (entry && activeClient && await activeClient.requiresRestart(entry.appliedSnapshot)) {
        this._logService.info(`[Copilot:${context.sessionId}] Session config changed (requiresRestart=true), refreshing session. clients=[${[...activeClient.toolSet.clientIds()].join(", ") || "(none)"}]`);
        this._sdkSessionsById.delete(entry.sessionId);
        await entry.destroySession();
        this._sessions.get(context.sessionId)?.clearDefaultChat();
        entry = void 0;
      }
      if (!entry) {
        this._logService.info(`[Copilot:${context.sessionId}] No cached entry${hadCachedEntry ? " (was evicted by requiresRestart)" : ""}, calling _resumeSession`);
      }
      entry ??= await this._resumeSession(context.sessionId);
      if (turnId) {
        entry.resetTurnState(turnId, senderClientId, clientType);
      }
      try {
        const sdkMode = this._resolveSdkMode(context.session);
        await entry.send(prompt, attachments, turnId, sdkMode, senderClientId, clientType);
      } catch (err) {
        const errCode = err?.code;
        const errMsg = err instanceof Error ? err.message : String(err);
        this._logService.error(`[Copilot:${context.sessionId}] entry.send() failed: code=${errCode}, message=${errMsg}, hadCachedEntry=${hadCachedEntry}, errorType=${err?.constructor?.name}`);
        throw err;
      }
    });
  }
  /**
   * Translates the AHP-side `mode` to the Copilot SDK's three-mode space
   * (`interactive` / `plan` / `autopilot`). With Autopilot living on the
   * `mode` axis the mapping is now direct:
   *
   *  - `mode='plan'` → SDK `plan`.
   *  - `mode='autopilot'` → SDK `autopilot` (autonomous, continue-until-done).
   *  - `mode='interactive'` → SDK `interactive`.
   *
   * Tool auto-approval is governed independently by the orthogonal
   * `autoApprove` axis (Default / Bypass), enforced by the agent
   * host's own permission handler — which the SDK still invokes even under
   * autopilot mode.
   *
   * Returns `undefined` when no mode is configured for the session, so
   * the SDK's current mode is left untouched.
   */
  _resolveSdkMode(session) {
    const sessionKey = session.toString();
    const mode = this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Mode);
    switch (mode) {
      case "plan":
        return "plan";
      case "autopilot":
        return "autopilot";
      case "interactive":
        return "interactive";
      default:
        return void 0;
    }
  }
  /**
   * Reads the session's current `mode` and `autoApprove` axis values so the
   * slash-command completion provider can hide config-action toggles that would
   * be a no-op (e.g. `/autopilot on` while already in autopilot).
   */
  _getSessionConfigState(sessionId) {
    const sessionKey = AgentSession.uri(this.id, sessionId).toString();
    return {
      mode: this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Mode),
      autoApprove: this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove)
    };
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    const context = this._getChatContext(chat);
    if (!context.target) {
      this._logService.warn(`[Copilot:${context.sessionId}] setPendingMessages: chat not found for ${chat.toString()}`);
      return;
    }
    if (steeringMessage) {
      context.target.sendSteering(steeringMessage);
    }
  }
  async getSessionMessages(session) {
    const subagentInfo = parseSubagentSessionUri(session);
    if (subagentInfo) {
      let rootSession = subagentInfo.parentSession;
      let parentParsed;
      while (parentParsed = parseSubagentSessionUri(rootSession)) {
        rootSession = parentParsed.parentSession;
      }
      const rootSessionId = AgentSession.id(rootSession);
      const parentEntry = this._findAnySession(rootSessionId) ?? await this._resumeSession(rootSessionId).catch((err) => {
        this._logService.warn(`[Copilot:${rootSessionId}] Failed to resume root for subagent restore`, err);
        return void 0;
      });
      if (!parentEntry) {
        return [];
      }
      return parentEntry.getSubagentMessages(subagentInfo.toolCallId);
    }
    const chat = parseChatUri(session) ? session : URI.parse(buildDefaultChatUri(session));
    const context = this._getChatContext(chat);
    if (context.isPeerChat) {
      const entry2 = await this._ensureChatSession(context.session, chat);
      const turns = entry2 ? await entry2.getMessages() : [];
      const sideChat = this._chatBackings.get(chat.toString())?.sideChat;
      return stripSideChatContext(turns.slice(sideChat?.inheritedTurnCount ?? 0), sideChat);
    }
    const sessionId = context.sessionId;
    if (this._provisionalSessions.has(sessionId)) {
      return [];
    }
    const entry = context.target ?? await this._resumeSession(sessionId).catch((err) => {
      if (err instanceof SessionWorkingDirectoryMissingError) {
        throw err;
      }
      this._logService.warn(`[Copilot:${sessionId}] Failed to resume session for message lookup`, err);
      return void 0;
    });
    if (!entry) {
      return [];
    }
    return entry.getMessages();
  }
  async getSubagentSessions(session) {
    const chatInfo = parseChatUri(session);
    if (chatInfo && !isDefaultChatUri(session)) {
      return [];
    }
    if (parseSubagentSessionUri(session)) {
      return [];
    }
    const sessionId = AgentSession.id(session);
    if (this._provisionalSessions.has(sessionId)) {
      return [];
    }
    const entry = this._findAnySession(sessionId) ?? await this._resumeSession(sessionId).catch((err) => {
      this._logService.warn(`[Copilot:${sessionId}] Failed to resume session for subagent lookup`, err);
      return void 0;
    });
    return entry ? entry.getSubagentSessions() : [];
  }
  async disposeSession(session) {
    const sessionId = AgentSession.id(session);
    await this._sessionSequencer.queue(sessionId, async () => {
      const provisional = this._provisionalSessions.get(sessionId);
      const isWorkspaceless = provisional ? provisional.workspaceless === true : (await this._readSessionMetadata(session).catch(() => void 0))?.workspaceless === true;
      if (!this._provisionalSessions.has(sessionId)) {
        const client = await this._ensureClient();
        await client.deleteSession(sessionId);
      }
      await this._destroyAndDisposeSession(sessionId);
      if (isWorkspaceless) {
        await this._cleanupWorkspacelessScratchDir(this._workspacelessScratchDir(sessionId), sessionId);
      }
    });
  }
  /**
   * Non-destructive counterpart to {@link disposeSession}: releases the
   * session's in-memory resources (SDK session/connection, cached entry,
   * active clients, MCP subscriptions) but preserves all durable data — the
   * SDK session log, session database, and worktree stay on disk. The session
   * transparently resumes on the next access via {@link _resumeSession}.
   *
   * No-ops for sessions that have nothing durable to resume from (provisional
   * sessions) or that aren't currently held in memory, and for sessions with a
   * running turn — disconnecting mid-turn would strand the SDK session.
   */
  async releaseSession(session) {
    const sessionId = AgentSession.id(session);
    await this._sessionSequencer.queue(sessionId, async () => {
      if (this._provisionalSessions.has(sessionId)) {
        return;
      }
      const entry = this._sessions.get(sessionId);
      if (!entry) {
        return;
      }
      if (entry.allChatSessions().some((chatSession) => chatSession.hasActiveTurn)) {
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] Releasing idle session from memory (durable state preserved)`);
      await this._releaseSessionResources(sessionId);
    });
  }
  async _abortSession(chat) {
    const context = this._getChatContext(chat);
    if (context.isPeerChat) {
      await context.target?.abort();
      return;
    }
    await this._sessionSequencer.queue(context.sessionId, async () => {
      await this._getChatContext(chat).target?.abort();
    });
  }
  async _createChat(chat, options) {
    if (isDefaultChatUri(chat)) {
      return;
    }
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`[Copilot] createChat: malformed chat URI ${chat.toString()}`);
    }
    const session = URI.parse(parsed.session);
    const chatKey = chat.toString();
    if (this._sessions.get(AgentSession.id(session))?.hasPeerChat(chatKey)) {
      const existing = this._chatBackings.get(chatKey);
      return existing ? { providerData: encodeProviderData(existing), backingSession: AgentSession.uri(this.id, existing.sdkSessionId) } : void 0;
    }
    const sessionId = AgentSession.id(session);
    let result;
    const queueKey = options?.sideChat ? chatKey : sessionId;
    await this._sessionSequencer.queue(queueKey, async () => {
      if (this._sessions.get(sessionId)?.hasPeerChat(chatKey)) {
        const existing = this._chatBackings.get(chatKey);
        result = existing ? { providerData: encodeProviderData(existing), backingSession: AgentSession.uri(this.id, existing.sdkSessionId) } : void 0;
        return;
      }
      const model = options?.model;
      const parentEntry = this._findAnySession(sessionId);
      const workingDirectory = parentEntry?.workingDirectory ?? this._provisionalSessions.get(sessionId)?.workingDirectory;
      const client = await this._ensureClient();
      const chatSdkId = generateUuid();
      const activeClient = this._getOrCreateActiveClient(session, workingDirectory);
      const snapshot = await activeClient.snapshot();
      const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
      let launchPlan;
      let sdkSessionId;
      let sideChat;
      if (options?.fork) {
        if (!workingDirectory) {
          throw new Error(`[Copilot] createChat fork: missing working directory for session ${session.toString()}`);
        }
        const sourceEntry = await this._resolveChatEntry(session, options.fork.source);
        if (!sourceEntry) {
          throw new Error(`[Copilot] createChat fork: source chat ${options.fork.source.toString()} not found`);
        }
        const forked = await this._forkSdkChat(client, sourceEntry, options.fork.turnId, this._sessionDataService.getSessionDataDir(chat));
        sdkSessionId = forked.sessionId;
        launchPlan = {
          kind: "resume",
          client,
          sessionId: sdkSessionId,
          workingDirectory,
          resolvedAgentName: void 0,
          snapshot,
          activeClientToolSet: activeClient.toolSet,
          shellManager,
          githubToken: this._githubToken,
          fallback: { model, longContextWindow: this._longContextWindowFor(model?.id), freeLongContext: this._isFreeLongContext(model?.id) }
        };
      } else if (options?.sideChat) {
        if (!workingDirectory) {
          throw new Error(`[Copilot] createChat side chat: missing working directory for session ${session.toString()}`);
        }
        const sourceEntry = await this._resolveChatEntry(session, options.sideChat.source);
        if (!sourceEntry) {
          throw new Error(`[Copilot] createChat side chat: source chat ${options.sideChat.source.toString()} not found`);
        }
        const forked = await this._forkSdkChat(client, sourceEntry, options.sideChat.providerAnchorTurnId ?? options.sideChat.turnId, this._sessionDataService.getSessionDataDir(chat));
        sdkSessionId = forked.sessionId;
        sideChat = {
          source: options.sideChat.source.toString(),
          turnId: options.sideChat.turnId,
          ...options.sideChat.selection ? { selection: options.sideChat.selection } : {},
          ...options.sideChat.providerAnchorTurnId ? { providerAnchorTurnId: options.sideChat.providerAnchorTurnId } : {},
          inheritedTurnCount: forked.inheritedTurnCount,
          ...options.sideChat.sourceContext ? { context: options.sideChat.sourceContext } : {},
          ...options.sideChat.partialResponse ? { partialResponse: options.sideChat.partialResponse } : {}
        };
        launchPlan = {
          kind: "resume",
          client,
          sessionId: sdkSessionId,
          workingDirectory,
          resolvedAgentName: void 0,
          snapshot,
          activeClientToolSet: activeClient.toolSet,
          shellManager,
          githubToken: this._githubToken,
          fallback: { model, longContextWindow: this._longContextWindowFor(model?.id), freeLongContext: this._isFreeLongContext(model?.id) }
        };
      } else {
        sdkSessionId = chatSdkId;
        launchPlan = {
          kind: "create",
          client,
          sessionId: chatSdkId,
          workingDirectory,
          resolvedAgentName: void 0,
          snapshot,
          activeClientToolSet: activeClient.toolSet,
          shellManager,
          githubToken: this._githubToken,
          model,
          longContextWindow: this._longContextWindowFor(model?.id),
          freeLongContext: this._isFreeLongContext(model?.id)
        };
      }
      let agentSession;
      try {
        agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, { sessionUri: session, chatChannelUri: chat });
        await agentSession.initializeSession();
        if (sideChat) {
          sideChat = { ...sideChat, inheritedTurnCount: (await agentSession.getMessages()).length };
        }
        if (options?.fork?.turnIdMapping) {
          await agentSession.remapTurnIds(options.fork.turnIdMapping);
        }
        this._ensureEntry(sessionId).registerPeerChat(chatKey, new CopilotSessionEntry(agentSession));
        this._sdkSessionsById.set(agentSession.sessionId, agentSession);
        const backing = { sdkSessionId, ...model ? { model } : {}, ...sideChat ? { sideChat } : {} };
        this._chatBackings.set(chatKey, backing);
        result = { providerData: encodeProviderData(backing), backingSession: AgentSession.uri(this.id, sdkSessionId) };
        this._logService.info(`[Copilot] Created additional chat ${chatKey} in session ${session.toString()}${options?.fork ? " (forked)" : ""}`);
      } catch (error) {
        agentSession?.dispose();
        throw error;
      }
    });
    return result;
  }
  /**
   * Resolves the {@link CopilotAgentSession} backing a chat URI — the
   * session's default chat (keyed by session id) or an additional peer chat
   * (keyed by the chat URI) — resuming it from disk if necessary.
   */
  async _resolveChatEntry(session, chatUri) {
    const sessionId = AgentSession.id(session);
    if (isDefaultChatUri(chatUri) || isEqual(chatUri, session)) {
      return this._findAnySession(sessionId) ?? await this._resumeSession(sessionId).catch(() => void 0);
    }
    return this._ensureChatSession(session, chatUri);
  }
  /**
   * Forks {@link sourceEntry}'s SDK chat at {@link turnId} via the
   * SDK `sessions.fork` RPC and copies its database into {@link targetDbDir}
   * so the forked chat inherits turn event IDs and file-edit
   * snapshots. Returns the new SDK session id.
   */
  async _forkSdkChat(client, sourceEntry, turnId, targetDbDir) {
    const sourceTurns = await sourceEntry.getMessages();
    const sourceTurnIndex = sourceTurns.findIndex((turn) => turn.id === turnId);
    const inheritedTurnCount = sourceTurnIndex === -1 ? sourceTurns.length : sourceTurnIndex + 1;
    const toEventId = await sourceEntry.getNextTurnEventId(turnId);
    const forkResult = await client.rpc.sessions.fork({
      sessionId: sourceEntry.sessionId,
      ...toEventId ? { toEventId } : {}
    });
    const newSessionId = forkResult.sessionId;
    const targetDbPath = URI.joinPath(targetDbDir, SESSION_DB_FILENAME);
    try {
      const sourceDbRef = await this._sessionDataService.tryOpenDatabase(sourceEntry.sessionUri);
      if (sourceDbRef) {
        try {
          await fs.mkdir(targetDbDir.fsPath, { recursive: true });
          await fs.rm(targetDbPath.fsPath, { force: true });
          await sourceDbRef.object.vacuumInto(targetDbPath.fsPath);
        } finally {
          sourceDbRef.dispose();
        }
      }
    } catch (err) {
      this._logService.warn(`[Copilot] Failed to copy session database for chat fork: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { sessionId: newSessionId, inheritedTurnCount };
  }
  async _disposeChat(session, chat) {
    if (isDefaultChatUri(chat)) {
      return;
    }
    const chatKey = chat.toString();
    let sdkSessionId = this._findPeerChat(session, chat)?.sessionId ?? this._chatBackings.get(chatKey)?.sdkSessionId;
    if (!sdkSessionId) {
      const parsed = parseChatUri(chat);
      if (parsed) {
        const persisted = await this._readPersistedChats(session);
        sdkSessionId = persisted.get(parsed.chatId)?.sdkSessionId;
      }
    }
    this._chatBackings.delete(chatKey);
    if (sdkSessionId) {
      this._sdkSessionsById.delete(sdkSessionId);
    }
    this._sessions.get(AgentSession.id(session))?.disposePeerChat(chatKey);
    if (sdkSessionId) {
      try {
        const client = await this._ensureClient();
        await client.deleteSession(sdkSessionId);
      } catch (err) {
        this._logService.warn(`[Copilot] Failed to delete SDK session for chat ${chatKey}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  /**
   * Re-attaches the in-memory backing for a peer chat on session restore,
   * decoding the opaque `providerData` the orchestrator persisted at creation
   * (or the latest {@link onDidChangeChatData}). After this resolves
   * the chat's backing SDK chat can be resumed lazily via
   * {@link _ensureChatSession}. When `providerData` is `undefined` (a legacy
   * session persisted before the orchestrator owned the catalog) the agent
   * falls back to a one-time read of its own `copilot.chats` blob. Best-effort
   * — a corrupt/unknown blob is logged and dropped rather than thrown.
   */
  async materializeChat(chat, providerData) {
    if (isDefaultChatUri(chat)) {
      return;
    }
    const chatInfo = parseChatUri(chat);
    if (!chatInfo) {
      return;
    }
    const chatKey = chat.toString();
    let backing;
    if (providerData !== void 0) {
      backing = decodeProviderData(providerData);
      if (!backing) {
        this._logService.warn(`[Copilot] materializeChat: dropping corrupt providerData for ${chatKey}`);
        return;
      }
    } else {
      const persisted = await this._readPersistedChats(URI.parse(chatInfo.session));
      backing = persisted.get(chatInfo.chatId);
      if (!backing) {
        return;
      }
    }
    this._chatBackings.set(chatKey, backing);
  }
  /**
   * Migration-only enumeration of the session's peer chats from the agent's
   * legacy `copilot.chats` catalog, mapping each entry to its channel URI and
   * the same opaque `providerData` blob {@link materializeChat}
   * decodes. The orchestrator calls this once to drain legacy chats into its
   * own catalog.
   */
  async listLegacyChats(session) {
    const persisted = await this._readPersistedChats(session);
    const result = [];
    for (const [chatId, info] of persisted) {
      result.push({ uri: URI.parse(buildChatUri(session, chatId)), providerData: encodeProviderData(info) });
    }
    return result;
  }
  /**
   * Resolves the live backing for a peer chat from the in-memory
   * {@link _chatBackings} map, falling back once to the agent's legacy
   * `copilot.chats` catalog (seeding the live map) for sessions that have not
   * been materialized via {@link materializeChat}.
   */
  async _resolveChatBacking(session, chat) {
    const chatKey = chat.toString();
    const live = this._chatBackings.get(chatKey);
    if (live) {
      return live;
    }
    const parsed = parseChatUri(chat);
    if (!parsed) {
      return void 0;
    }
    const persisted = await this._readPersistedChats(session);
    const info = persisted.get(parsed.chatId);
    if (info) {
      this._chatBackings.set(chatKey, info);
    }
    return info;
  }
  /**
   * Returns the SDK-backed {@link CopilotAgentSession} for an additional peer
   * chat, resuming its backing SDK chat if it is not already in
   * memory (e.g. after a process restart). Returns `undefined` when the chat
   * has no known backing chat.
   */
  async _ensureChatSession(session, chat) {
    const chatKey = chat.toString();
    const existing = this._findPeerChat(session, chat);
    if (existing) {
      return existing;
    }
    const parsed = parseChatUri(chat);
    if (!parsed) {
      return void 0;
    }
    const sessionId = AgentSession.id(session);
    return this._sessionSequencer.queue(sessionId, async () => {
      const again = this._findPeerChat(session, chat);
      if (again) {
        return again;
      }
      const info = await this._resolveChatBacking(session, chat);
      if (!info) {
        return void 0;
      }
      const parentEntry = this._findAnySession(sessionId) ?? await this._resumeSession(sessionId).catch(() => void 0);
      const workingDirectory = parentEntry?.workingDirectory ?? this._provisionalSessions.get(sessionId)?.workingDirectory;
      if (!workingDirectory) {
        this._logService.warn(`[Copilot] Cannot resume chat ${chatKey}: missing working directory`);
        return void 0;
      }
      const client = await this._ensureClient();
      const activeClient = this._getOrCreateActiveClient(session, workingDirectory);
      const snapshot = await activeClient.snapshot();
      const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
      const launchPlan = {
        kind: "resume",
        client,
        sessionId: info.sdkSessionId,
        workingDirectory,
        resolvedAgentName: void 0,
        snapshot,
        activeClientToolSet: activeClient.toolSet,
        shellManager,
        githubToken: this._githubToken,
        fallback: { model: info.model, longContextWindow: this._longContextWindowFor(info.model?.id), freeLongContext: this._isFreeLongContext(info.model?.id) }
      };
      let agentSession;
      try {
        agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, { sessionUri: session, chatChannelUri: chat });
        await agentSession.initializeSession();
        this._ensureEntry(sessionId).registerPeerChat(chatKey, new CopilotSessionEntry(agentSession));
        this._sdkSessionsById.set(agentSession.sessionId, agentSession);
        this._logService.info(`[Copilot] Resumed additional chat ${chatKey} in session ${session.toString()}`);
        return agentSession;
      } catch (error) {
        agentSession?.dispose();
        this._logService.warn(`[Copilot] Failed to resume additional chat ${chatKey}: ${error instanceof Error ? error.message : String(error)}`);
        return void 0;
      }
    });
  }
  async truncateSession(session, turnId, chat) {
    const sessionId = AgentSession.id(session);
    if (this._provisionalSessions.has(sessionId)) {
      return;
    }
    const isPeerChat = !isDefaultChatUri(chat);
    await this._sessionSequencer.queue(sessionId, async () => {
      this._logService.info(`[Copilot:${sessionId}] Truncating ${isPeerChat ? `peer chat ${chat.toString()}` : "session"}${turnId !== void 0 ? ` at turnId=${turnId}` : " (all turns)"}`);
      const entry = isPeerChat ? await this._resolveChatEntry(session, chat) : this._findAnySession(sessionId) ?? await this._resumeSession(sessionId);
      if (!entry) {
        this._logService.info(`[Copilot:${sessionId}] No chat entry resolved for truncation; nothing to truncate`);
        return;
      }
      let eventId;
      if (turnId) {
        eventId = await entry.getNextTurnEventId(turnId);
      } else {
        eventId = await entry.getFirstTurnEventId();
      }
      if (eventId) {
        await entry.truncateAtEventId(eventId, turnId);
      } else {
        this._logService.info(`[Copilot:${sessionId}] No event ID found for truncation, nothing to truncate`);
      }
      this._logService.info(`[Copilot:${sessionId}] Session truncated`);
    });
  }
  async _changeModel(chat, model) {
    const longContextWindow = this._longContextWindowFor(model.id);
    const freeLongContext = this._isFreeLongContext(model.id);
    const context = this._getChatContext(chat);
    if (context.isPeerChat) {
      await context.target?.setModel(model.id, resolveCopilotReasoningEffort(model, this._configurationService, this._logService, context.sessionId), getCopilotContextTier(model, longContextWindow, freeLongContext));
      const backing = this._chatBackings.get(context.chatKey);
      if (backing) {
        const updated = { ...backing, model };
        this._chatBackings.set(context.chatKey, updated);
        this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(updated) });
      }
      return;
    }
    const provisional = this._provisionalSessions.get(context.sessionId);
    if (provisional) {
      provisional.model = model;
      return;
    }
    const entry = context.target;
    if (entry) {
      await entry.setModel(model.id, resolveCopilotReasoningEffort(model, this._configurationService, this._logService, context.sessionId), getCopilotContextTier(model, longContextWindow, freeLongContext));
    }
    await this._storeSessionMetadata(context.session, model, void 0, void 0, void 0, void 0);
  }
  async _changeAgent(chat, agent) {
    const context = this._getChatContext(chat);
    if (context.isPeerChat) {
      if (context.target) {
        const resolvedAgentName = agent ? this._resolveAgentName(context.target.appliedSnapshot, agent) : void 0;
        await context.target.setAgent(resolvedAgentName);
      }
      return;
    }
    const provisional = this._provisionalSessions.get(context.sessionId);
    if (provisional) {
      provisional.agent = agent;
      return;
    }
    const entry = context.target;
    if (entry) {
      const resolvedAgentName = agent ? this._resolveAgentName(entry.appliedSnapshot, agent) : void 0;
      await entry.setAgent(resolvedAgentName);
    }
    await this._storeSessionAgentMetadata(context.session, agent);
  }
  async shutdown() {
    this._shutdownPromise ??= (async () => {
      this._modelCatalogGeneration++;
      this._modelRefreshSchedule.clear();
      this._scheduledModelRefresh?.deferred.complete();
      this._scheduledModelRefresh = void 0;
      this._modelRefreshRetry.clear();
      this._logService.info("[Copilot] Shutting down...");
      const sessionIds = /* @__PURE__ */ new Set([...this._sessions.keys()]);
      for (const sessionId of sessionIds) {
        await this._sessionSequencer.queue(sessionId, () => this._destroyAndDisposeSession(sessionId));
      }
      await this._stopClient();
    })();
    return this._shutdownPromise;
  }
  respondToPermissionRequest(requestId, approved) {
    for (const entry of this._sessions.values()) {
      for (const chat of entry.allChatSessions()) {
        if (chat.respondToPermissionRequest(requestId, approved)) {
          return;
        }
      }
    }
  }
  respondToUserInputRequest(requestId, response, answers) {
    for (const entry of this._sessions.values()) {
      for (const chat of entry.allChatSessions()) {
        if (chat.respondToUserInputRequest(requestId, response, answers)) {
          return;
        }
      }
    }
  }
  /**
   * Returns true if this provider owns the given session ID. Includes
   * provisional sessions that have not yet been materialized.
   */
  hasSession(session) {
    const sessionId = AgentSession.id(session);
    return this._sessions.has(sessionId) || this._provisionalSessions.has(sessionId);
  }
  // ---- helpers ------------------------------------------------------------
  async _configureProxyEnv(env) {
    const proxy = await this._resolveProxyForSdk(env);
    this._appliedProxy = proxy;
    if (proxy) {
      for (const key of COPILOT_PROXY_SET_ENV_KEYS) {
        env[key] = proxy;
      }
      this._logService.info("[Copilot] Resolved CAPI proxy and forwarded HTTP_PROXY/HTTPS_PROXY to Copilot SDK");
    }
  }
  async _resolveProxyForSdk(env = process.env) {
    if (!this._isSystemProxyEnabled()) {
      return void 0;
    }
    if (COPILOT_PROXY_ENV_KEYS.some((key) => env[key])) {
      this._logService.debug("[Copilot] Proxy env var already set; leaving Copilot SDK proxy configuration to the environment");
      return void 0;
    }
    let capiUrl = env["VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE"] || COPILOT_CAPI_URL;
    if (this._githubToken) {
      try {
        const discovered = await this._copilotApiService.resolveApiEndpoint(this._githubToken);
        if (discovered) {
          capiUrl = discovered;
        }
      } catch (error) {
        this._logService.debug(`[Copilot] CAPI endpoint discovery for proxy resolution failed; using ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      return await this._proxyResolver.resolveProxy(capiUrl);
    } catch (error) {
      this._logService.warn(`[Copilot] Failed to resolve CAPI proxy for ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
  /**
   * When the GitHub token changes, the token-discovered CAPI endpoint (and so
   * the resolved proxy) can change. The proxy is baked into the SDK subprocess
   * env at client start, so if it would now differ we restart the running
   * client here (deferred while a turn is in flight, see
   * {@link _requestClientRestart}); the next `_ensureClient` re-resolves it
   * against the new token. No-op when no client is running/starting or the
   * proxy is unchanged.
   */
  async _restartClientIfProxyChanged() {
    if (!this._client && !this._clientStarting) {
      return;
    }
    const oldProxy = this._appliedProxy;
    const newProxy = await this._resolveProxyForSdk();
    if (newProxy === oldProxy) {
      return;
    }
    if (this._clientStarting) {
      try {
        await this._clientStarting;
      } catch {
      }
    }
    await this._requestClientRestart(`CAPI proxy changed after token update (${oldProxy ?? "(none)"} -> ${newProxy ?? "(none)"})`);
  }
  /**
   * Disposes every peer chat hosted on the owning session's entry and drops
   * their live backings from {@link _chatBackings}. The chat URI encodes its
   * parent session, so we recover it via {@link parseChatUri}.
   */
  _disposeChildChats(sessionId) {
    const entry = this._sessions.get(sessionId);
    if (entry) {
      for (const chatKey of entry.peerChatKeys()) {
        entry.disposePeerChat(chatKey);
      }
    }
    for (const chatKey of [...this._chatBackings.keys()]) {
      const parsed = parseChatUri(URI.parse(chatKey));
      if (parsed && AgentSession.id(parsed.session) === sessionId) {
        this._chatBackings.delete(chatKey);
      }
    }
  }
  _getOrCreateActiveClient(session, directory) {
    let client = this._activeClients.get(session);
    if (!client) {
      const pluginController = this._plugins.createSessionController(session, directory);
      client = this._instantiationService.createInstance(ActiveClient, session, pluginController, this._onDidSessionProgress);
      this._activeClients.set(session, client);
    } else if (directory) {
      client.pluginController.setDirectory(directory);
    }
    return client;
  }
  /**
   * Instantiates a {@link CopilotAgentSession} for the given session id.
   * The caller is responsible for awaiting {@link CopilotAgentSession.initializeSession}
   * and, on success, registering the entry in {@link _sessions}. The
   * session is intentionally **not** registered here so a concurrent
   * {@link _resumeSession} for the same id cannot dispose this entry mid-init
   * via {@link DisposableMap.set}.
   */
  _createAgentSession(launchPlan, customizationDirectory, activeClient, identity) {
    const sessionUri = identity?.sessionUri ?? AgentSession.uri(this.id, launchPlan.sessionId);
    const chatChannelUri = identity?.chatChannelUri ?? URI.parse(buildDefaultChatUri(sessionUri));
    const agentSession = this._instantiationService.createInstance(
      CopilotAgentSession,
      {
        sessionUri,
        chatChannelUri,
        rawSessionId: launchPlan.sessionId,
        onDidSessionProgress: this._onDidSessionProgress,
        sessionLauncher: this._sessionLauncher,
        launchPlan,
        shellManager: launchPlan.shellManager,
        workingDirectory: launchPlan.workingDirectory,
        customizationDirectory,
        clientSnapshot: launchPlan.snapshot,
        activeClientToolSet: launchPlan.activeClientToolSet,
        resolveMcpChildId: (name) => findMcpChildId(activeClient.pluginController.getCustomizations(), name),
        serverToolHost: this._serverToolHost,
        isLaunchTokenCurrent: () => this._githubToken === launchPlan.githubToken,
        onTurnEnded: () => this._onChatTurnEnded()
      }
    );
    this._mcpNotificationSubs.set(launchPlan.sessionId, combinedDisposable(
      agentSession.onMcpNotification((n) => this._onMcpNotification.fire(n)),
      autorun((r) => activeClient.pluginController.mcpServerStates.set(agentSession.mcpServerStates.read(r), void 0))
    ));
    return agentSession;
  }
  /**
   * Register a freshly initialised session in `_sessions`, or — if
   * shutdown has already started between init beginning and resolving —
   * dispose the session and throw {@link CancellationError}. Without this
   * guard an in-flight `_resumeSession` / `_materializeProvisional` whose
   * `initializeSession()` resolves after `dispose()` has run would call
   * `_sessions.set(...)` on a disposed `DisposableMap`, leaking the
   * session and reproducing the very 'Trying to add a disposable to a
   * DisposableStore that has already been disposed' warning this fix
   * exists to prevent.
   */
  _registerInitializedSession(sessionId, agentSession) {
    if (this._shutdownPromise) {
      agentSession.dispose();
      throw new CancellationError();
    }
    const defaultChatKey = buildDefaultChatUri(agentSession.sessionUri.toString());
    let entry = this._sessions.get(sessionId);
    if (!entry) {
      entry = new CopilotSessionEntry();
      this._sessions.set(sessionId, entry);
    }
    entry.setDefaultChat(defaultChatKey, new CopilotSessionEntry(agentSession));
    this._sdkSessionsById.set(agentSession.sessionId, agentSession);
  }
  async _destroyAndDisposeSession(sessionId) {
    await this._releaseSessionResources(sessionId);
  }
  /**
   * Tears down a session's in-memory resources without deleting any durable
   * data: the SDK session is disconnected, peer chats and MCP subscriptions
   * are disposed, the `_sessions` entry is dropped, and active clients are
   * released. The on-disk SDK session log, session database, and worktree are
   * left untouched, so the session can be resumed later via
   * {@link _resumeSession}. Shared by the non-destructive {@link releaseSession}
   * path and the destructive {@link _destroyAndDisposeSession} path (the
   * latter reaps the worktree afterwards).
   */
  async _releaseSessionResources(sessionId) {
    for (const chat of this._sessions.get(sessionId)?.allChatSessions() ?? []) {
      this._sdkSessionsById.delete(chat.sessionId);
    }
    this._disposeChildChats(sessionId);
    const provisional = this._provisionalSessions.get(sessionId);
    if (provisional) {
      this._provisionalSessions.delete(sessionId);
      this._sessions.deleteAndDispose(sessionId);
      this._activeClients.get(provisional.sessionUri)?.dispose();
      this._activeClients.delete(provisional.sessionUri);
      return;
    }
    const entry = this._findAnySession(sessionId);
    const sessionUri = AgentSession.uri(this.id, sessionId);
    if (entry) {
      try {
        await entry.destroySession();
      } catch (error) {
        this._logService.warn(`[Copilot:${sessionId}] Failed to destroy session before cleanup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this._sessions.deleteAndDispose(sessionId);
    this._mcpNotificationSubs.deleteAndDispose(sessionId);
    this._activeClients.get(sessionUri)?.dispose();
    this._activeClients.delete(sessionUri);
    await this._applyPendingClientRestart();
  }
  _resumeSession(sessionId) {
    const existing = this._resumingSessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const promise = this._doResumeSession(sessionId);
    this._resumingSessions.set(sessionId, promise);
    const cleanup = () => {
      if (this._resumingSessions.get(sessionId) === promise) {
        this._resumingSessions.delete(sessionId);
      }
    };
    promise.then(cleanup, cleanup);
    return promise;
  }
  async _doResumeSession(sessionId) {
    this._logService.info(`[Copilot:${sessionId}] _resumeSession called \u2014 session not in memory, resuming...`);
    const client = await this._ensureClient();
    const sessionUri = AgentSession.uri(this.id, sessionId);
    const storedMetadata = await this._readSessionMetadata(sessionUri);
    const sessionMetadata = await client.getSessionMetadata(sessionId).catch((err) => {
      this._logService.warn(`[Copilot:${sessionId}] getSessionMetadata failed`, err);
      return void 0;
    });
    const workingDirectory = storedMetadata.workingDirectory ?? (typeof sessionMetadata?.context?.workingDirectory === "string" ? URI.file(sessionMetadata.context.workingDirectory) : void 0);
    if (!workingDirectory) {
      throw new Error(`workingDirectory is required to resume Copilot session '${sessionId}'`);
    }
    let resolvedWorkingDirectory = workingDirectory;
    if (storedMetadata.workspaceless) {
      await this._ensureWorkspacelessScratchDir(workingDirectory, sessionId);
    } else {
      resolvedWorkingDirectory = await this._configurationService.resolveWorkingDirectoryForResume(sessionUri.toString(), workingDirectory);
    }
    const customizationDirectory = resolvedWorkingDirectory;
    const activeClient = this._getOrCreateActiveClient(sessionUri, customizationDirectory);
    activeClient.pluginController.reanchor(customizationDirectory);
    activeClient.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(storedMetadata.workingDirectories));
    const snapshot = await activeClient.snapshot();
    const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, resolvedWorkingDirectory);
    const resolvedAgentName = storedMetadata.agent ? this._resolveAgentName(snapshot, storedMetadata.agent) : void 0;
    if (storedMetadata.agent && !resolvedAgentName) {
      this._logService.info(`[Copilot:${sessionId}] Stored custom agent is not available in the current plugin snapshot; resuming without a custom agent`);
    }
    const launchPlan = {
      kind: "resume",
      client,
      sessionId,
      workingDirectory: resolvedWorkingDirectory,
      additionalDirectories: storedMetadata.workingDirectories?.slice(1),
      resolvedAgentName,
      snapshot,
      activeClientToolSet: activeClient.toolSet,
      shellManager,
      githubToken: this._githubToken,
      workspaceless: storedMetadata.workspaceless,
      fallback: {
        model: storedMetadata.model,
        longContextWindow: this._longContextWindowFor(storedMetadata.model?.id),
        freeLongContext: this._isFreeLongContext(storedMetadata.model?.id)
      }
    };
    const agentSession = this._createAgentSession(launchPlan, customizationDirectory, activeClient);
    try {
      await agentSession.initializeSession();
      this._registerInitializedSession(sessionId, agentSession);
    } catch (err) {
      agentSession.dispose();
      throw err;
    }
    return agentSession;
  }
  /**
   * Reads the agent's legacy peer-chat catalog (`copilot.chats`) for a
   * session. Each entry maps a chatId (the `ahp-chat` authority) to the SDK
   * chat that backs it (and its optional model override). The agent
   * no longer *writes* this catalog — the orchestrator owns the durable
   * peer-chat catalog via `providerData` — but the read is retained for one
   * release to drain sessions persisted before that migration (see
   * {@link getChats} and {@link materializeChat}).
   */
  async _readPersistedChats(session) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return /* @__PURE__ */ new Map();
    }
    try {
      const raw = await ref.object.getMetadata(CopilotAgent._META_CHATS);
      if (!raw) {
        return /* @__PURE__ */ new Map();
      }
      const parsed = JSON.parse(raw);
      const result = /* @__PURE__ */ new Map();
      for (const [chatId, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object") {
          continue;
        }
        const { sdkSessionId, model } = value;
        if (typeof sdkSessionId !== "string" || !sdkSessionId) {
          continue;
        }
        result.set(chatId, { sdkSessionId, ...model ? { model } : {} });
      }
      return result;
    } catch (err) {
      this._logService.warn(`[Copilot] Failed to read persisted chats for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
      return /* @__PURE__ */ new Map();
    } finally {
      ref.dispose();
    }
  }
  async _storeSessionMetadata(session, model, workingDirectory, workingDirectories, customizationDirectory, project, projectResolved = project !== void 0) {
    const dbRef = this._sessionDataService.openDatabase(session);
    const db = dbRef.object;
    try {
      const work = [];
      if (model) {
        work.push(db.setMetadata(CopilotAgent._META_MODEL, this._serializeModelSelection(model)));
      }
      if (workingDirectory) {
        work.push(db.setMetadata(CopilotAgent._META_CWD, workingDirectory.toString()));
      }
      if (workingDirectories) {
        work.push(db.setMetadata(CopilotAgent._META_CWDS, JSON.stringify(workingDirectories.map((d) => d.toString()))));
      }
      if (customizationDirectory) {
        work.push(db.setMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY, customizationDirectory.toString()));
      }
      if (projectResolved) {
        work.push(db.setMetadata(CopilotAgent._META_PROJECT_RESOLVED, "true"));
      }
      if (project) {
        work.push(db.setMetadata(CopilotAgent._META_PROJECT_URI, project.uri.toString()));
        work.push(db.setMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME, project.displayName));
      }
      await Promise.all(work);
    } finally {
      dbRef.dispose();
    }
  }
  /**
   * Parses the persisted ordered working-directory set. Prefers the JSON
   * `_META_CWDS` array when present and valid, otherwise falls back to the
   * single legacy `_META_CWD` value. A malformed blob (the metadata store is
   * client-influenced and may be corrupt) is ignored in favour of the legacy
   * fallback so it can never reject the caller.
   */
  _parseWorkingDirectories(rawSet, fallback) {
    if (rawSet) {
      try {
        const parsed = JSON.parse(rawSet);
        if (Array.isArray(parsed)) {
          const dirs = parsed.filter((d) => typeof d === "string" && d.length > 0).map((d) => URI.parse(d));
          if (dirs.length > 0) {
            return dirs;
          }
        }
      } catch {
      }
    }
    return fallback ? [fallback] : void 0;
  }
  async _readSessionMetadata(session) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return {};
    }
    try {
      const [model, agent, cwd, cwds, customizationDirectory, workspaceless] = await Promise.all([
        ref.object.getMetadata(CopilotAgent._META_MODEL),
        ref.object.getMetadata(CopilotAgent._META_AGENT),
        ref.object.getMetadata(CopilotAgent._META_CWD),
        ref.object.getMetadata(CopilotAgent._META_CWDS),
        ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
        ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY)
      ]);
      const workingDirectory = cwd ? URI.parse(cwd) : void 0;
      return {
        model: this._parseModelSelection(model),
        agent: this._parseAgentSelection(agent),
        workingDirectory,
        workingDirectories: this._parseWorkingDirectories(cwds, workingDirectory),
        customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : void 0,
        workspaceless: workspaceless === "true"
      };
    } finally {
      ref.dispose();
    }
  }
  async _readStoredSessionMetadata(session) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return void 0;
    }
    try {
      const [model, agent, cwd, cwds, customizationDirectory, resolved, uri, displayName, workspaceless] = await Promise.all([
        ref.object.getMetadata(CopilotAgent._META_MODEL),
        ref.object.getMetadata(CopilotAgent._META_AGENT),
        ref.object.getMetadata(CopilotAgent._META_CWD),
        ref.object.getMetadata(CopilotAgent._META_CWDS),
        ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
        ref.object.getMetadata(CopilotAgent._META_PROJECT_RESOLVED),
        ref.object.getMetadata(CopilotAgent._META_PROJECT_URI),
        ref.object.getMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME),
        ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY)
      ]);
      const workingDirectory = cwd ? URI.parse(cwd) : void 0;
      const project = uri && displayName ? { uri: URI.parse(uri), displayName } : void 0;
      return {
        model: this._parseModelSelection(model),
        agent: this._parseAgentSelection(agent),
        workingDirectory,
        workingDirectories: this._parseWorkingDirectories(cwds, workingDirectory),
        customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : void 0,
        project,
        resolved: resolved === "true" || project !== void 0,
        workspaceless: workspaceless === "true"
      };
    } finally {
      ref.dispose();
    }
  }
  /**
   * Persists (or clears) the selected custom agent for a session. Writing
   * `undefined` clears the stored selection by writing an empty string,
   * which later cold reads treat as "no custom agent" because
   * `_parseAgentSelection` short-circuits on falsy metadata values.
   */
  async _storeSessionAgentMetadata(session, agent) {
    const dbRef = this._sessionDataService.openDatabase(session);
    try {
      await dbRef.object.setMetadata(CopilotAgent._META_AGENT, agent ? this._serializeAgentSelection(agent) : "");
    } finally {
      dbRef.dispose();
    }
  }
  async _storeSessionProjectResolution(session, project) {
    await this._storeSessionMetadata(session, void 0, void 0, void 0, void 0, project, true);
  }
  _resolveSessionProject(context, limiter, projectByContext) {
    const key = this._projectContextKey(context);
    if (!key) {
      return Promise.resolve(void 0);
    }
    let project = projectByContext.get(key);
    if (!project) {
      project = limiter.queue(() => projectFromCopilotContext(context, this._gitService));
      projectByContext.set(key, project);
    }
    return project;
  }
  _projectContextKey(context) {
    if (context?.cwd) {
      return `cwd:${context.cwd}`;
    }
    if (context?.gitRoot) {
      return `gitRoot:${context.gitRoot}`;
    }
    if (context?.repository) {
      return `repository:${context.repository}`;
    }
    return void 0;
  }
  dispose() {
    for (const ac of this._activeClients.values()) {
      ac.dispose();
    }
    this._activeClients.clear();
    this.shutdown().catch((err) => {
      this._logService.warn("[Copilot] Shutdown failed during dispose", err);
    }).finally(() => super.dispose());
  }
};
// ---- session metadata persistence --------------------------------------
CopilotAgent._META_MODEL = "copilot.model";
CopilotAgent._META_AGENT = "copilot.agent";
CopilotAgent._META_CWD = "copilot.workingDirectory";
/** Persisted ordered working-directory set (JSON array of URI strings; index 0 = primary). */
CopilotAgent._META_CWDS = "copilot.workingDirectories";
CopilotAgent._META_CUSTOMIZATION_DIRECTORY = "copilot.customizationDirectory";
CopilotAgent._META_PROJECT_RESOLVED = "copilot.project.resolved";
CopilotAgent._META_PROJECT_URI = "copilot.project.uri";
CopilotAgent._META_PROJECT_DISPLAY_NAME = "copilot.project.displayName";
/** Persisted catalog of additional (non-default) peer chats, keyed by chatId. */
CopilotAgent._META_CHATS = "copilot.chats";
CopilotAgent = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ISessionDataService),
  __decorateParam(3, IAgentHostGitService),
  __decorateParam(4, IAgentConfigurationService),
  __decorateParam(5, IAgentHostStateManager),
  __decorateParam(6, IAgentHostGitHubEndpointService),
  __decorateParam(7, IAgentHostOTelService),
  __decorateParam(8, IAgentHostCompletions),
  __decorateParam(9, IAgentHostCheckpointService),
  __decorateParam(10, IAgentHostReviewService),
  __decorateParam(11, INativeEnvironmentService),
  __decorateParam(12, IByokLmBridgeRegistry),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, ICopilotApiService),
  __decorateParam(15, IAgentHostProxyResolver)
], CopilotAgent);
const REFRESH_DEBOUNCE_MS = 100;
let SessionDiscoveredEntry = class extends Disposable {
  constructor(workingDirectories, userHome, _getClient, _onDidRefresh, _fileService, _configurationService, _logService, instantiationService) {
    super();
    this._getClient = _getClient;
    this._onDidRefresh = _onDidRefresh;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._refreshDelayer = this._register(new Delayer(REFRESH_DEBOUNCE_MS));
    this._refreshPromise = null;
    this._pendingRefreshNotify = false;
    this._customizations = [];
    this._discovery = this._register(instantiationService.createInstance(SessionCustomizationDiscovery, workingDirectories, userHome, URI.file));
    this._settled = this._queueRefresh(false, 0);
    this._register(this._discovery.onDidChange(() => {
      this._settled = this._queueRefresh(true);
    }));
    this._register(this._configurationService.onDidRootConfigChange(() => {
      this._settled = this._queueRefresh(true);
    }));
  }
  dispose() {
    this._refreshPromise?.cancel();
    this._refreshPromise = null;
    super.dispose();
  }
  whenSettled() {
    return this._settled;
  }
  currentCustomizations() {
    return this._customizations;
  }
  _queueRefresh(notify, delay = REFRESH_DEBOUNCE_MS) {
    this._refreshPromise?.cancel();
    this._refreshPromise = null;
    this._pendingRefreshNotify = this._pendingRefreshNotify || notify;
    return this._refreshDelayer.trigger(() => {
      const shouldNotify = this._pendingRefreshNotify;
      this._pendingRefreshNotify = false;
      const refreshPromise = this._refreshPromise = createCancelablePromise(async (token) => {
        const didRefresh = await this._refresh(token);
        if (didRefresh && shouldNotify) {
          this._onDidRefresh();
        }
      });
      return refreshPromise.then(() => {
        if (this._refreshPromise === refreshPromise) {
          this._refreshPromise = null;
        }
      }, (err) => {
        if (this._refreshPromise === refreshPromise) {
          this._refreshPromise = null;
        }
        if (err instanceof CancellationError) {
          return;
        }
        throw err;
      });
    }, delay);
  }
  async _refresh(token) {
    try {
      const mode = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.SessionCustomizationDiscoveryMode) ?? DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE;
      if (mode === "discover") {
        const customizations2 = await this._discovery.discover(await this._getClient(), token);
        if (token.isCancellationRequested) {
          return false;
        }
        if (equals(this._customizations, customizations2)) {
          return false;
        }
        this._customizations = customizations2;
        this._directories = void 0;
        return true;
      }
      const directories = await this._discovery.scan(token);
      if (token.isCancellationRequested) {
        return false;
      }
      if (this._directories && areDiscoveredDirectoriesEqual(this._directories, directories)) {
        return false;
      }
      const customizations = await toDiscoveredDirectoryCustomizations(directories, this._fileService);
      if (token.isCancellationRequested) {
        return false;
      }
      this._customizations = customizations;
      this._directories = directories;
      return true;
    } catch (err) {
      if (token.isCancellationRequested) {
        return false;
      }
      this._logService.warn(`[Copilot:SessionDiscoveredEntry] Discovery/bundle failed: ${err instanceof Error ? err.message : String(err)}`);
      const hadState = this._customizations.length > 0 || this._directories !== void 0;
      this._customizations = [];
      this._directories = void 0;
      return hadState;
    }
  }
};
SessionDiscoveredEntry = __decorateClass([
  __decorateParam(4, IFileService),
  __decorateParam(5, IAgentConfigurationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IInstantiationService)
], SessionDiscoveredEntry);
function toDiscoveredDirectoryCustomizations(directories, fileService) {
  return Promise.all(directories.map(async (directory) => {
    const protocolUri = directory.uri.toString();
    return {
      type: CustomizationType.Directory,
      id: customizationId(protocolUri),
      uri: protocolUri,
      name: directory.name,
      enabled: true,
      contents: toDirectoryContentsType(directory.type),
      writable: directory.writable,
      // whether the new customization can be created in this directory
      load: { kind: CustomizationLoadStatus.Loaded },
      children: await Promise.all(directory.files.map((file) => toDiscoveredChildCustomization(file.uri, directory.type, fileService)))
    };
  }));
}
function toDirectoryContentsType(type) {
  switch (type) {
    case DiscoveredType.Agent:
      return CustomizationType.Agent;
    case DiscoveredType.Skill:
      return CustomizationType.Skill;
    case DiscoveredType.Instruction:
    case DiscoveredType.AgentInstruction:
      return CustomizationType.Rule;
    case DiscoveredType.Hook:
      return CustomizationType.Hook;
  }
}
async function toDiscoveredChildCustomization(file, type, fileService) {
  const uri = file.toString();
  const id = customizationId(uri);
  if (type === DiscoveredType.Agent) {
    const agentInfo = await parseAgentFile(file, fileService);
    const agentCustomization = {
      type: CustomizationType.Agent,
      id,
      uri,
      name: agentInfo.name,
      description: agentInfo.description
    };
    if (agentInfo.userInvocable !== void 0) {
      agentCustomization._meta = { userInvocable: agentInfo.userInvocable };
    }
    return agentCustomization;
  }
  if (type === DiscoveredType.Skill) {
    const skillInfo = await parseSkillFile(file, fileService);
    const skillCustomization = {
      type: CustomizationType.Skill,
      id,
      uri,
      name: skillInfo.name,
      description: skillInfo.description
    };
    return skillCustomization;
  }
  if (type === DiscoveredType.Instruction) {
    const ruleInfo = await parseRuleFile(file, fileService);
    const ruleCustomization = {
      type: CustomizationType.Rule,
      id,
      uri,
      name: ruleInfo.name,
      description: ruleInfo.description,
      globs: ruleInfo.globs,
      alwaysApply: ruleInfo.alwaysApply
    };
    return ruleCustomization;
  }
  if (type === DiscoveredType.Hook) {
    const hookCustomization = {
      type: CustomizationType.Hook,
      id,
      uri,
      name: resourceBasename(file)
    };
    return hookCustomization;
  }
  return {
    type: CustomizationType.Rule,
    alwaysApply: true,
    id,
    uri,
    name: resourceBasename(file)
  };
}
function mapToParsedPlugin(customizations) {
  if (customizations.length === 0) {
    return void 0;
  }
  const agents = [];
  const skills = [];
  const instructions = [];
  for (const directory of customizations) {
    for (const child of directory.children ?? []) {
      if (child.type === CustomizationType.Agent) {
        agents.push({
          uri: URI.parse(child.uri),
          name: child.name,
          description: child.description,
          customization: child
        });
        continue;
      }
      if (child.type === CustomizationType.Skill) {
        skills.push({
          uri: URI.parse(child.uri),
          name: child.name,
          description: child.description,
          customization: child
        });
        continue;
      }
      if (child.type === CustomizationType.Rule) {
        if (child.alwaysApply && child.name.match(/\.md$/i)) {
          continue;
        }
        instructions.push({
          uri: URI.parse(child.uri),
          name: child.name,
          description: child.description,
          customization: child
        });
      }
    }
  }
  if (agents.length === 0 && skills.length === 0 && instructions.length === 0) {
    return void 0;
  }
  return {
    format: PluginFormat.Copilot,
    hooks: [],
    mcpServers: [],
    skills,
    agents,
    instructions
  };
}
let PluginController = class extends Disposable {
  constructor(_getClient, pluginManager, _logService, _fileService, _configurationService, _instantiationService, _environmentService) {
    super();
    this._getClient = _getClient;
    this.pluginManager = pluginManager;
    this._logService = _logService;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._environmentService = _environmentService;
    this._onDidChange = this._register(new Emitter());
    /** Fires when host customizations change. Session controllers forward this. */
    this.onDidChange = this._onDidChange.event;
    this._hostCustomizations = [];
    this._hostSync = Promise.resolve([]);
    this._hostRevision = 0;
    this._lastAppliedRefs = [];
    this._applyHostCustomizations();
    this._register(this._configurationService.onDidRootConfigChange(() => {
      this._applyHostCustomizations();
    }));
  }
  getConfiguredHostCustomizations() {
    return this._hostCustomizations.map((item) => item.customization);
  }
  get configurationService() {
    return this._configurationService;
  }
  /**
   * Snapshot the resolved host customizations (loading or loaded). Used by
   * {@link SessionPluginController} to compose its per-session view.
   */
  hostCustomizations() {
    return this._hostCustomizations;
  }
  /** In-flight host sync; awaited by `getCustomizationsSettled` consumers. */
  hostSync() {
    return this._hostSync;
  }
  getUserHome() {
    return this._environmentService.userHome;
  }
  async getClient() {
    return this._getClient();
  }
  /**
   * Construct a per-session controller bound to the given customization
   * directory. The returned controller is a {@link Disposable} owned by
   * the caller; disposing it releases the session's disk-discovery
   * watchers and detaches from this controller's change event.
   */
  createSessionController(session, directory) {
    return this._instantiationService.createInstance(SessionPluginController, this, session, directory);
  }
  /**
   * Reads the current host customizations from the root config and
   * resolves them. Skips the update when the configured refs have not
   * changed since the last application.
   */
  _applyHostCustomizations() {
    const entries = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.Customizations) ?? [];
    const customizations = entries.map(toContainerCustomization);
    if (equals(customizations, this._lastAppliedRefs)) {
      return;
    }
    this._lastAppliedRefs = customizations;
    const revision = ++this._hostRevision;
    this._hostCustomizations = customizations.map((customization) => ({
      customization: {
        ...customization,
        load: { kind: CustomizationLoadStatus.Loading }
      }
    }));
    this._onDidChange.fire();
    this._hostSync = Promise.all(customizations.map((customization) => this.resolveConfiguredCustomization(customization))).then((resolved) => {
      if (revision === this._hostRevision) {
        this._hostCustomizations = resolved;
      }
      return resolved;
    }).finally(() => {
      if (revision === this._hostRevision) {
        this._onDidChange.fire();
      }
    });
  }
  async resolveConfiguredCustomization(customization) {
    const pluginDir = URI.parse(customization.uri);
    const parsed = await this.tryParsePlugin(pluginDir);
    if (!parsed) {
      return {
        customization: {
          ...customization,
          load: { kind: CustomizationLoadStatus.Error, message: localize("copilotAgent.pluginParseError", "Error parsing plugin.") }
        }
      };
    }
    return {
      customization: {
        ...customization,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: toChildCustomizations([parsed])
      },
      pluginDir,
      plugin: parsed
    };
  }
  async resolveSyncedCustomization(item, clientId, input) {
    const baseCustomization = { ...item.customization, clientId };
    if (!item.pluginDir) {
      return { customization: baseCustomization, input };
    }
    const parsed = await this.tryParsePlugin(item.pluginDir);
    if (!parsed) {
      return {
        customization: {
          ...baseCustomization,
          load: { kind: CustomizationLoadStatus.Error, message: localize("copilotAgent.pluginParseError", "Error parsing plugin.") }
        },
        input
      };
    }
    return {
      customization: {
        ...baseCustomization,
        children: toChildCustomizations([parsed])
      },
      pluginDir: item.pluginDir,
      plugin: parsed,
      input
    };
  }
  async tryParsePlugin(pluginDir) {
    try {
      return await parsePlugin(pluginDir, this._fileService, void 0, this.getUserHome(), pluginDir);
    } catch (error) {
      this._logService.warn(`[Copilot:PluginController] Error parsing plugin '${pluginDir.toString()}': ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
};
PluginController = __decorateClass([
  __decorateParam(1, IAgentPluginManager),
  __decorateParam(2, ILogService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IAgentConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, INativeEnvironmentService)
], PluginController);
let SessionPluginController = class extends Disposable {
  constructor(_parent, _session, _directory, _stateManager, _logService, _instantiationService) {
    super();
    this._parent = _parent;
    this._session = _session;
    this._directory = _directory;
    this._stateManager = _stateManager;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._onDidPublish = this._register(new Emitter());
    /** Per-session action stream (reset + per-item updates). */
    this.onDidPublish = this._onDidPublish.event;
    this._previousDirectories = [];
    this._desiredCustomizationById = /* @__PURE__ */ new Map();
    /**
     * Live runtime state (`state`/`channel`) per MCP server customization id,
     * kept up to date by the owning session from its MCP controller. Overlaid
     * onto published customizations by {@link _overlayMcpState} so a re-sync
     * preserves the live state of otherwise-unchanged MCP servers instead of
     * resetting them to the `Stopped` default baked into
     * `makeMcpServerCustomization`. Exposed (not injected) so the session can
     * write to it once it holds this controller.
     */
    this.mcpServerStates = observableValue(this, /* @__PURE__ */ new Map());
    /**
     * Per-client customization state, keyed by `clientId`. Each active client
     * contributing customizations to this session has one entry; the published
     * customization list is the union across all entries (deduplicated by URI,
     * first-inserted client wins). Insertion order is preserved so the merged
     * order stays stable across updates.
     */
    this._clients = /* @__PURE__ */ new Map();
    this._sessionDiscovered = this._register(new MutableDisposable());
    /**
     * The additional (non-primary) workspace roots for a multi-root session.
     * Index 0 (the process root / worktree) is tracked separately by
     * {@link _directory}; this holds roots 1..N, which are stable workspace
     * folders that are never worktree-remapped. Empty for single-root sessions.
     */
    this._additionalDirectories = [];
  }
  get directory() {
    return this._directory;
  }
  /** The additional (non-primary) roots attached to customization discovery. */
  get additionalDirectories() {
    return this._additionalDirectories;
  }
  /**
   * Anchor (or re-anchor) the session's customization directory.
   * Only ever transitions from `undefined` → set; once a directory has
   * been bound the discovered entry is pinned to it for the remainder
   * of the session.
   */
  setDirectory(directory) {
    if (this._directory || !directory) {
      return;
    }
    this._directory = directory;
  }
  /**
   * Set the additional (non-primary) workspace roots. Recreates the discovered
   * entry when the set actually changes so discovery re-scans every root —
   * important when this is set after a primary-only entry was already created
   * (e.g. on resume). A no-op for the single-root case (empty tail).
   */
  setAdditionalDirectories(directories) {
    if (this._additionalDirectories.length === directories.length && this._additionalDirectories.every((d, i) => isEqual(d, directories[i]))) {
      return;
    }
    this._additionalDirectories = directories;
    this._sessionDiscovered.clear();
  }
  /**
   * Move the session's customization anchor to a new directory (e.g. from the
   * user-picked folder to the worktree at materialization). Recreates the
   * discovered entry so discovery/watchers re-scan the new directory.
   */
  reanchor(directory) {
    if (this._directory && isEqual(this._directory, directory)) {
      return;
    }
    const previous = this._directory;
    this._directory = directory;
    this._sessionDiscovered.clear();
    if (previous && !this._previousDirectories.some((candidate) => isEqual(candidate, previous))) {
      this._previousDirectories.push(previous);
    }
  }
  getCustomizations() {
    const result = [
      ...this._parent.hostCustomizations().map((item) => this._projectForPublish(item.customization)),
      ...this._flattenClientCustomizations().map((item) => this._projectForPublish(item.customization))
    ];
    const entry = this._discoveredEntry();
    const discovered = entry?.currentCustomizations() ?? [];
    for (const customization of discovered) {
      result.push(this._projectForPublish(customization));
    }
    return result;
  }
  /**
   * The union of every active client's resolved customizations,
   * deduplicated by URI with the first-inserted client winning. Order
   * follows client insertion order, then per-client order.
   */
  _flattenClientCustomizations() {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const client of this._clients.values()) {
      for (const item of client.customizations) {
        if (seen.has(item.customization.uri)) {
          continue;
        }
        seen.add(item.customization.uri);
        result.push(item);
      }
    }
    return result;
  }
  /**
   * Settled variant of {@link getCustomizations}: awaits the in-flight
   * host sync, every in-flight client sync, and the discovered entry's
   * initial scan + parse before snapshotting the list. Callers that
   * publish customizations into session state at session creation time
   * MUST use this — the synchronous variant can return an empty list
   * for a brand-new working directory because {@link SessionDiscoveredEntry}
   * kicks off its `_refresh()` without anyone awaiting it.
   */
  async getCustomizationsSettled() {
    const entry = this._discoveredEntry();
    await Promise.all([
      this._parent.hostSync().catch((err) => this._logService.warn("[Copilot:SessionPluginController] Host customization update failed", err)),
      ...[...this._clients.values()].map((client) => client.sync.catch((err) => this._logService.warn("[Copilot:SessionPluginController] Client customization sync failed", err))),
      entry?.whenSettled()
    ]);
    return this.getCustomizations();
  }
  /** Returns the parsed plugins currently enabled for this session, awaiting any pending sync. */
  async getAppliedPlugins() {
    const entry = this._discoveredEntry();
    const [host] = await Promise.all([
      this._parent.hostSync().catch((err) => {
        this._logService.warn("[Copilot:SessionPluginController] Host customization update failed", err);
        return this._parent.hostCustomizations();
      }),
      ...[...this._clients.values()].map((client) => client.sync.catch((err) => {
        this._logService.warn("[Copilot:SessionPluginController] Client customization sync failed", err);
        return client.customizations;
      })),
      entry?.whenSettled()
    ]);
    const discovered = entry?.currentCustomizations() ?? [];
    const sessionPlugin = discovered.some((customization) => this._isEnabled(customization)) ? mapToParsedPlugin(discovered) : void 0;
    const sessionPlugins = sessionPlugin ? [sessionPlugin] : [];
    return [
      ...host.filter((item) => !!item.plugin && this._isEnabled(item.customization)).map((item) => ({ ...item.plugin, pluginDir: item.pluginDir })),
      ...this._flattenClientCustomizations().filter((item) => !!item.plugin && this._isEnabled(item.customization)).map((item) => ({ ...item.plugin, pluginDir: item.pluginDir })),
      ...sessionPlugins
    ];
  }
  /**
   * Sync the published customizations for a single client of this session,
   * keyed by `clientId`. Replaces only that client's slice; other clients'
   * customizations are untouched. The published session-state list is the
   * union across all clients.
   *
   * @param quiet when `true`, suppress {@link onDidPublish} events for
   *   this sync. Used during eager-create paths where there is no
   *   session listener yet; the session-state snapshot picks up the
   *   final view directly when the session materializes.
   */
  sync(clientId, customizations, options) {
    const quiet = options?.quiet === true;
    let client = this._clients.get(clientId);
    if (!client) {
      client = { revision: 0, customizations: [], sync: Promise.resolve([]), inputs: [] };
      this._clients.set(clientId, client);
    } else if (equals(client.inputs, customizations)) {
      return client.sync.then((results) => results.map((item) => ({
        customization: this._projectForPublish(item.customization),
        ...item.pluginDir ? { pluginDir: item.pluginDir } : {}
      })));
    }
    const revision = ++client.revision;
    client.inputs = customizations;
    client.customizations = customizations.map((customization) => ({
      customization: {
        ...customization,
        clientId,
        load: { kind: CustomizationLoadStatus.Loading }
      },
      input: customization
    }));
    if (!quiet) {
      this._onDidPublish.fire({
        type: ActionType.SessionCustomizationsChanged,
        customizations: [...this.getCustomizations()]
      });
    }
    const published = /* @__PURE__ */ new Map();
    for (const customization of client.customizations) {
      const enabled = this._projectForPublish(customization.customization);
      published.set(enabled.uri, enabled);
    }
    const publishUpdate = (item) => {
      const customization = this._projectForPublish(item.customization);
      if (equals(published.get(customization.uri), customization)) {
        return;
      }
      published.set(customization.uri, customization);
      if (!quiet) {
        this._onDidPublish.fire({
          type: ActionType.SessionCustomizationUpdated,
          customization
        });
      }
    };
    const prev = client.sync;
    const promise = client.sync = prev.catch((err) => {
      this._logService.warn("[Copilot:SessionPluginController] Previous customization sync failed", err);
    }).then(async () => {
      const inputByUri = new Map(customizations.map((c) => [c.uri, c]));
      const result = await this._parent.pluginManager.syncCustomizations(clientId, customizations, (status) => {
        if (revision !== client.revision) {
          return;
        }
        publishUpdate({
          customization: { ...status, clientId },
          input: inputByUri.get(status.uri)
        });
      });
      const resolved = await Promise.all(result.map((item) => this._parent.resolveSyncedCustomization(item, clientId, inputByUri.get(item.customization.uri))));
      if (revision === client.revision) {
        client.customizations = resolved;
        for (const item of resolved) {
          publishUpdate(item);
        }
      }
      return resolved;
    });
    return promise.then((results) => results.map((item) => ({
      customization: this._overlayMcpState(this._applyEnablement(item.customization)),
      ...item.pluginDir ? { pluginDir: item.pluginDir } : {}
    })));
  }
  /**
   * Remove a client's customization contribution from this session,
   * publishing the updated (union) customization list so the removed
   * client's plugins disappear from session state.
   */
  removeClient(clientId) {
    const client = this._clients.get(clientId);
    if (!client) {
      return;
    }
    client.revision++;
    this._clients.delete(clientId);
    this._onDidPublish.fire({
      type: ActionType.SessionCustomizationsChanged,
      customizations: [...this.getCustomizations()]
    });
  }
  /** The raw input customizations last synced for `clientId` (empty when absent). */
  clientInputs(clientId) {
    return this._clients.get(clientId)?.inputs ?? [];
  }
  /**
   * Re-issue each client's last sync if any of its previously-synced
   * customizations is currently in an error state. Used to recover from
   * transient sync failures (e.g. a `vscode-agent-host://` connection drop
   * during reconnection) at message boundaries. Re-syncs **only** the
   * errored items and always non-quiet so listeners observe recovery.
   */
  async retryFailedClientSyncIfNeeded() {
    await Promise.all([...this._clients.values()].map((client) => client.sync.catch(() => {
    })));
    for (const [clientId, client] of [...this._clients]) {
      const errored = client.customizations.filter(
        (item) => item.customization.load?.kind === CustomizationLoadStatus.Error && item.input !== void 0
      );
      if (errored.length === 0) {
        continue;
      }
      const inputs = errored.map((item) => item.input);
      this._logService.info(`[Copilot:SessionPluginController] Retrying ${inputs.length} previously-failed client customization(s) for ${clientId}`);
      await this.sync(clientId, inputs).catch((err) => {
        this._logService.warn("[Copilot:SessionPluginController] Retried client customization sync failed", err);
      });
    }
  }
  _discoveredEntry() {
    if (!this._directory) {
      return void 0;
    }
    if (!this._sessionDiscovered.value) {
      this._sessionDiscovered.value = this._instantiationService.createInstance(
        SessionDiscoveredEntry,
        [this._directory, ...this._additionalDirectories],
        this._parent.getUserHome(),
        () => this._parent.getClient(),
        () => this._onDidPublish.fire({
          type: ActionType.SessionCustomizationsChanged,
          customizations: [...this.getCustomizations()]
        })
      );
    }
    return this._sessionDiscovered.value;
  }
  _isEnabled(customization) {
    return this._desiredEnabled(customization) ?? customization.enabled !== false;
  }
  _applyEnablement(customization) {
    const enabled = this._isEnabled(customization);
    if (customization.type === CustomizationType.McpServer) {
      return customization.enabled === enabled ? customization : { ...customization, enabled };
    }
    let changed = customization.enabled !== enabled;
    const children = customization.children?.map((child) => {
      const desiredEnabled = this._desiredEnabled(child);
      if (desiredEnabled === void 0 || desiredEnabled === child.enabled) {
        return child;
      }
      changed = true;
      return { ...child, enabled: desiredEnabled };
    });
    return changed ? { ...customization, enabled, children } : customization;
  }
  _desiredEnabled(customization) {
    const exact = this._getDesiredCustomization(customization.id);
    if (exact) {
      return exact.enabled;
    }
    if (!this._directory) {
      return void 0;
    }
    for (const previousDirectory of this._previousDirectories) {
      const previousUri = rebaseUnder(URI.parse(customization.uri), this._directory, previousDirectory);
      if (!previousUri) {
        continue;
      }
      const previousId = customizationId(previousUri.toString(), customization.range);
      const previous = this._getDesiredCustomization(previousId);
      if (previous) {
        return previous.enabled;
      }
    }
    return void 0;
  }
  _getDesiredCustomization(id) {
    const customizations = this._stateManager.getSessionState(this._session.toString())?.customizations;
    if (customizations !== this._indexedDesiredCustomizations) {
      this._indexedDesiredCustomizations = customizations;
      this._desiredCustomizationById.clear();
      for (const customization of customizations ?? []) {
        this._desiredCustomizationById.set(customization.id, customization);
        if (customization.type !== CustomizationType.McpServer) {
          for (const child of customization.children ?? []) {
            this._desiredCustomizationById.set(child.id, child);
          }
        }
      }
    }
    return this._desiredCustomizationById.get(id);
  }
  /**
   * Projects a raw customization into its published form: applies reducer-backed
   * per-session enablement, then overlays the latest
   * known MCP runtime `state`/`channel` (see {@link mcpServerStates}).
   * Every publish path runs customizations through this so enablement and
   * live MCP state stay consistent. Object identity is preserved when
   * neither step changes anything, keeping downstream equality checks
   * stable.
   */
  _projectForPublish(customization) {
    return this._overlayMcpState(this._applyEnablement(customization));
  }
  /**
   * Overlays the latest known MCP runtime `state`/`channel` (see
   * {@link mcpServerStates}) onto a customization and its children,
   * preserving object identity when nothing is overlaid so downstream
   * equality checks stay stable.
   */
  _overlayMcpState(customization) {
    const overlays = this.mcpServerStates.get();
    if (overlays.size === 0) {
      return customization;
    }
    if (customization.type === CustomizationType.McpServer) {
      const overlay = overlays.get(customization.id);
      return overlay ? { ...customization, state: overlay.state, channel: overlay.channel } : customization;
    }
    const children = customization.children;
    if (!children || children.length === 0) {
      return customization;
    }
    let changed = false;
    const overlaidChildren = children.map((child) => {
      if (child.type !== CustomizationType.McpServer) {
        return child;
      }
      const overlay = overlays.get(child.id);
      if (!overlay) {
        return child;
      }
      changed = true;
      return { ...child, state: overlay.state, channel: overlay.channel };
    });
    return changed ? { ...customization, children: overlaidChildren } : customization;
  }
};
SessionPluginController = __decorateClass([
  __decorateParam(3, IAgentHostStateManager),
  __decorateParam(4, ILogService),
  __decorateParam(5, IInstantiationService)
], SessionPluginController);
class CopilotActiveClientHandle {
  constructor(_owner, clientId, displayName) {
    this._owner = _owner;
    this.clientId = clientId;
    this.displayName = displayName;
  }
  get tools() {
    return this._owner.toolSet.get(this.clientId);
  }
  set tools(tools) {
    this._owner.toolSet.set(this.clientId, tools);
  }
  get customizations() {
    return this._owner.pluginController.clientInputs(this.clientId);
  }
  set customizations(customizations) {
    this._owner.pluginController.sync(this.clientId, [...customizations]).catch(() => {
    });
  }
}
let ActiveClient = class extends Disposable {
  constructor(_sessionUri, pluginController, onDidSessionProgress, _configurationService) {
    super();
    this._sessionUri = _sessionUri;
    this._configurationService = _configurationService;
    /**
     * Live, multi-client registry of contributed tools. Shared by reference
     * with the session's {@link CopilotAgentSession} so a window reload (new
     * `clientId`, identical tools) is reflected at tool-call stamp time without
     * restarting the SDK session, and so tool calls are attributed to the
     * contributing client.
     */
    this.toolSet = new ActiveClientToolSet();
    this._handles = /* @__PURE__ */ new Map();
    this.pluginController = this._register(pluginController);
    this._register(this.pluginController.onDidPublish((action) => {
      onDidSessionProgress.fire({ kind: "action", resource: this._sessionUri, action });
    }));
  }
  /** Get (or lazily create) the stable handle for `clientId`. */
  getOrCreateHandle(clientId, displayName) {
    let handle = this._handles.get(clientId);
    if (!handle) {
      handle = new CopilotActiveClientHandle(this, clientId, displayName);
      this._handles.set(clientId, handle);
    }
    return handle;
  }
  /** Drop a client's tool and customization contributions from this session. */
  removeClient(clientId) {
    this._handles.delete(clientId);
    this.toolSet.delete(clientId);
    this.pluginController.removeClient(clientId);
  }
  async snapshot() {
    return {
      tools: this.toolSet.merged(),
      plugins: await this.pluginController.getAppliedPlugins(),
      mcpServers: this._getMcpServers()
    };
  }
  _getMcpServers() {
    const servers = this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey) ?? {};
    return structuredClone(servers);
  }
  /**
   * Returns `true` when the SDK session must be disposed and resumed to
   * pick up a changed config. Compares ONLY plugins and the structural
   * (merged) tool set (name + description + inputSchema). The owning
   * `clientId`s are deliberately excluded — a clientId-only change is
   * reflected live via {@link toolSet} and never requires a restart.
   */
  async requiresRestart(snap) {
    const plugins = await this.pluginController.getAppliedPlugins();
    if (!parsedPluginsEqual(snap.plugins, plugins)) {
      return true;
    }
    if (!equals(snap.mcpServers, this._getMcpServers())) {
      return true;
    }
    return !this.toolSet.structuralEquals(snap.tools);
  }
};
ActiveClient = __decorateClass([
  __decorateParam(3, IAgentConfigurationService)
], ActiveClient);
export {
  COPILOT_AGENT_HOST_SYSTEM_MESSAGE,
  CopilotAgent,
  CopilotSessionEntry,
  REFRESH_DEBOUNCE_MS,
  mapToParsedPlugin,
  rebaseUnder,
  toDiscoveredDirectoryCustomizations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdEFnZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29waWxvdENsaWVudCwgUnVudGltZUNvbm5lY3Rpb24sIHR5cGUgQ29waWxvdENsaWVudE9wdGlvbnMsIHR5cGUgR2l0SHViVGVsZW1ldHJ5Tm90aWZpY2F0aW9uIH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBwYXRoVG9GaWxlVVJMIH0gZnJvbSAndXJsJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVmZXJyZWRQcm9taXNlLCBEZWxheWVyLCBkaXNwb3NhYmxlVGltZW91dCwgTGltaXRlciwgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0eXBlIENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBmb3JtYXRUb2tlbkNvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSwgdHlwZSBJU2V0dGFibGVPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBkZWxpbWl0ZXIsIGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIGFzIHJlc291cmNlQmFzZW5hbWUsIGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgam9pblBhdGggYXMgcmVzb3VyY2VKb2luUGF0aCwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IHJnRGlza1BhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcmlwZ3JlcC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUGFyc2VkQWdlbnQsIElQYXJzZWRQbHVnaW4sIElQYXJzZWRSdWxlLCBJUGFyc2VkU2tpbGwsIHBhcnNlQWdlbnRGaWxlLCBwYXJzZVBsdWdpbiwgcGFyc2VSdWxlRmlsZSwgcGFyc2VTa2lsbEZpbGUsIFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBBaUFnZW50RW52VmFsdWUsIEFpQWdlbnRFbnZWYXIgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9haUFnZW50RW52LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyB3b3Jrc3BhY2VsZXNzU2NyYXRjaERpciB9IGZyb20gJy4uL3dvcmtzcGFjZWxlc3NTY3JhdGNoRGlyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0UmV2aWV3U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RSZXZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVByaWNpbmdNZXRhRnJvbUJpbGxpbmcsIGhhc0xvbmdDb250ZXh0U3VyY2hhcmdlLCBub3JtYWxpemVDQVBJQmlsbGluZywgdHlwZSBJQ0FQSU1vZGVsQmlsbGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudE1vZGVsUHJpY2luZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudE1vZGVsQnlva01ldGEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRNb2RlbEJ5b2tNZXRhLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbmZpZ0tleSwgYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZ1NjaGVtYSwgREVGQVVMVF9TRVNTSU9OX0NVU1RPTUlaQVRJT05fRElTQ09WRVJZX01PREUsIHRvQ29udGFpbmVyQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnLmpzJztcbmltcG9ydCB7IENvcGlsb3RDbGlDb25maWdLZXksIGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIHR5cGUgQ29waWxvdFNka0xvZ0xldmVsU2V0dGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXksIEFnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RQcmVmZXJMb25nQ29udGV4dEVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFNlc3Npb25TeW5jRW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5LCBBdXRvQXBwcm92ZUxldmVsLCBTZXNzaW9uTW9kZSwgbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZywgcGxhdGZvcm1Sb290U2NoZW1hLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIHR5cGUgQWdlbnRIb3N0TWNwU2VydmVycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luTWFuYWdlciwgSVN5bmNlZEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbkVudHJ5LCBkZWNvZGVQcm92aWRlckRhdGEsIGVuY29kZVByb3ZpZGVyRGF0YSwgcHJlcGFyZVNpZGVDaGF0UHJvbXB0LCBzdHJpcFNpZGVDaGF0Q29udGV4dCwgdHlwZSBJUGVyc2lzdGVkQ2hhdCB9IGZyb20gJy4uL2FnZW50UGVlckNoYXRzLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgQWdlbnRTaWduYWwsIEF1dGhlbnRpY2F0ZVBhcmFtcywgSUFjdGl2ZUNsaWVudCwgSUFnZW50LCBJQWdlbnRDaGF0RGF0YUNoYW5nZSwgSUFnZW50Q2hhdHMsIElBZ2VudExlZ2FjeUNoYXQsIElBZ2VudENyZWF0ZUNoYXRGb3JrU291cmNlLCBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucywgSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCwgSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZywgSUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdCwgSUFnZW50RGVzY3JpcHRvciwgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1NuYXBzaG90LCBJQWdlbnRIb3N0TmV0d29ya0VuZHBvaW50LCBJQWdlbnRNYXRlcmlhbGl6ZVNlc3Npb25FdmVudCwgSUFnZW50TW9kZWxJbmZvLCBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcywgSUFnZW50U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbywgSUFnZW50U3Bhd25DaGF0RXZlbnQsIElNY3BOb3RpZmljYXRpb24sIElSZXN0b3JlZFN1YmFnZW50U2Vzc2lvbiwgU3ViYWdlbnRDaGF0U2lnbmFsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRSZWFzb25pbmdFZmZvcnREZXNjcmlwdGlvbiwgZ2V0UmVhc29uaW5nRWZmb3J0TGFiZWwgfSBmcm9tICcuLi8uLi9jb21tb24vcmVhc29uaW5nRWZmb3J0LmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U2VydmVyVG9vbEhvc3QgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2ZXJUb29scy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IElDb3BpbG90Q29uZmlnU2xhc2hDb21tYW5kU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29waWxvdENvbmZpZ1NsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgZ2V0Q29waWxvdEhvbWVQYXRoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RIb21lLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UsIFNFU1NJT05fREJfRklMRU5BTUUgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RQcm94eVJlc29sdmVyIH0gZnJvbSAnLi4vYWdlbnRIb3N0UHJveHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgdHlwZSBBZ2VudFNlbGVjdGlvbiwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIENvbmZpZ1Byb3BlcnR5U2NoZW1hLCB0eXBlIENvbmZpZ1NjaGVtYSwgdHlwZSBNb2RlbFNlbGVjdGlvbiwgdHlwZSBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRDdXN0b21pemF0aW9uLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgQ3VzdG9taXphdGlvblR5cGUsIFJ1bGVDdXN0b21pemF0aW9uLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIFNraWxsQ3VzdG9taXphdGlvbiwgY3VzdG9taXphdGlvbklkLCBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIGlzRGVmYXVsdENoYXRVcmksIHBhcnNlQ2hhdFVyaSwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSwgcGFyc2VTdWJhZ2VudFNlc3Npb25VcmksIEFIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVksIHR5cGUgQ2hpbGRDdXN0b21pemF0aW9uLCB0eXBlIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBEaXJlY3RvcnlDdXN0b21pemF0aW9uLCB0eXBlIEhvb2tDdXN0b21pemF0aW9uLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LCB0eXBlIFBlbmRpbmdNZXNzYWdlLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgUG9saWN5U3RhdGUsIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIFRvb2xDYWxsUmVzdWx0LCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi9hY3RpdmVDbGllbnRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29tcGxldGlvbnMgfSBmcm9tICcuLi9hZ2VudEhvc3RDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFwcGx5TWNwU2VydmVyRW5hYmxlbWVudCwgZmluZE1jcENoaWxkSWQsIHR5cGUgSU1jcFNlcnZlclJ1bnRpbWVTdGF0ZSB9IGZyb20gJy4uL3NoYXJlZC9tY3BDdXN0b21pemF0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuXG5pbnRlcmZhY2UgSUNvcGlsb3RSdW50aW1lTWFuYWdlZFNldHRpbmdzU2RrIHtcblx0Z2V0TWFuYWdlZFNldHRpbmdzKGlucHV0PzogeyB0b2tlbj86IHN0cmluZzsgaG9zdD86IHN0cmluZyB9KTogUHJvbWlzZTx7IGFjY291bnQ/OiBzdHJpbmc7IHJlc29sdmVkOiBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU25hcHNob3QgfT47XG59XG5cbmZ1bmN0aW9uIGlzQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NTZGsodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NTZGsge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAnZ2V0TWFuYWdlZFNldHRpbmdzJyBpbiB2YWx1ZVxuXHRcdCYmIHR5cGVvZiAodmFsdWUgYXMgeyBnZXRNYW5hZ2VkU2V0dGluZ3M/OiB1bmtub3duIH0pLmdldE1hbmFnZWRTZXR0aW5ncyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmltcG9ydCB7IElCeW9rTG1CcmlkZ2VSZWdpc3RyeSB9IGZyb20gJy4uL2J5b2tMbUJyaWRnZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5TWlzc2luZ0Vycm9yIH0gZnJvbSAnLi4vc2hhcmVkL3dvcmt0cmVlSXNvbGF0aW9uLmpzJztcbmltcG9ydCB7IGJ1aWxkU2Vzc2lvbkV2ZW50TG9nRnJvbVR1cm5zIH0gZnJvbSAnLi9idWlsZFNlc3Npb25FdmVudHMuanMnO1xuaW1wb3J0IHsgQ29waWxvdEFnZW50U2Vzc2lvbiwgdHlwZSBDb3BpbG90U2RrTW9kZSB9IGZyb20gJy4vY29waWxvdEFnZW50U2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdFNlc3Npb25Db250ZXh0LCBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0IH0gZnJvbSAnLi9jb3BpbG90R2l0UHJvamVjdC5qcyc7XG5pbXBvcnQgeyBwYXJzZWRQbHVnaW5zRXF1YWwsIHRvQ2hpbGRDdXN0b21pemF0aW9ucyB9IGZyb20gJy4vY29waWxvdFBsdWdpbkNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgQ29waWxvdEdpdEh1YlRlbGVtZXRyeUZvcndhcmRlciB9IGZyb20gJy4vY29waWxvdEdpdEh1YlRlbGVtZXRyeUZvcndhcmRlci5qcyc7XG5pbXBvcnQgeyBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyLCBDb250ZXh0U2l6ZUNvbmZpZ0tleSwgVGhpbmtpbmdMZXZlbENvbmZpZ0tleSwgZ2V0Q29waWxvdENvbnRleHRUaWVyLCBpc0NvcGlsb3RSZWFzb25pbmdFZmZvcnQsIHJlc29sdmVDb3BpbG90UmVhc29uaW5nRWZmb3J0LCB0eXBlIENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiwgdHlwZSBJQWN0aXZlQ2xpZW50U25hcHNob3QgfSBmcm9tICcuL2NvcGlsb3RTZXNzaW9uTGF1bmNoZXIuanMnO1xuaW1wb3J0IHsgU2hlbGxNYW5hZ2VyIH0gZnJvbSAnLi9jb3BpbG90U2hlbGxUb29scy5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSwgdHlwZSBJUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2l0SHViVGVsZW1ldHJ5Um91dGVyIH0gZnJvbSAnLi4vYWdlbnRIb3N0R2l0SHViVGVsZW1ldHJ5Um91dGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyLCBJQ29waWxvdFJ1bnRpbWVTbGFzaENvbW1hbmRRdWVyeU9wdGlvbnMgfSBmcm9tICcuL2NvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgRGlzY292ZXJlZFR5cGUsIFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBhcmVEaXNjb3ZlcmVkRGlyZWN0b3JpZXNFcXVhbCwgdHlwZSBJRGlzY292ZXJlZERpcmVjdG9yeSB9IGZyb20gJy4vc2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnkuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9JTlRFR1JBVElPTl9JRCB9IGZyb20gJy4uLy4uLy4uL2VuZHBvaW50L2NvbW1vbi9saWNlbnNlQWdyZWVtZW50LmpzJztcbmltcG9ydCB7IGdldEFwcE5vZGVNb2R1bGVzUGF0aCB9IGZyb20gJy4uL2FwcE5vZGVNb2R1bGVzLmpzJztcbmltcG9ydCB7IENvcGlsb3RTbGFzaENvbW1hbmRQcm92aWRlciB9IGZyb20gJy4vY29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyLmpzJztcblxuY29uc3QgUlVOVElNRV9TTEFTSF9DT01NQU5EX0NPTVBMRVRJT05fV0FJVF9NUyA9IDMwMDtcbmNvbnN0IENPUElMT1RfQ0FQSV9VUkwgPSAnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20nO1xuLyoqXG4gKiBQcm94eSBlbnYgdmFycyB0aGF0IGluZGljYXRlIHRoZSBlbnZpcm9ubWVudCBhbHJlYWR5IGNvbmZpZ3VyZXMgYSBwcm94eS5cbiAqL1xuY29uc3QgQ09QSUxPVF9QUk9YWV9FTlZfS0VZUyA9IFsnSFRUUFNfUFJPWFknLCAnaHR0cHNfcHJveHknLCAnSFRUUF9QUk9YWScsICdodHRwX3Byb3h5JywgJ0FMTF9QUk9YWScsICdhbGxfcHJveHknXSBhcyBjb25zdDtcbi8qKlxuICogUHJveHkgZW52IHZhcnMgd2Ugc2V0IHdoZW4gaW5qZWN0aW5nIHRoZSByZXNvbHZlZCBDQVBJIHByb3h5LlxuICovXG5jb25zdCBDT1BJTE9UX1BST1hZX1NFVF9FTlZfS0VZUyA9IFsnSFRUUF9QUk9YWScsICdIVFRQU19QUk9YWSddIGFzIGNvbnN0O1xuXG5hc3luYyBmdW5jdGlvbiBmaWxlRXhpc3RzKGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0dHJ5IHtcblx0XHRhd2FpdCBmcy5hY2Nlc3MoZmlsZVBhdGgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNMaW51eE11c2xSdW50aW1lKCk6IGJvb2xlYW4ge1xuXHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ2xpbnV4Jykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IHJlcG9ydCA9IHByb2Nlc3MucmVwb3J0Py5nZXRSZXBvcnQoKSBhcyB7IGhlYWRlcj86IHsgZ2xpYmNWZXJzaW9uUnVudGltZT86IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cdHJldHVybiAhcmVwb3J0Py5oZWFkZXI/LmdsaWJjVmVyc2lvblJ1bnRpbWU7XG59XG5cbmZ1bmN0aW9uIGdldENvcGlsb3RQbGF0Zm9ybVBhY2thZ2VDYW5kaWRhdGVzKCk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcGxhdGZvcm1BcmNoID0gYCR7cHJvY2Vzcy5wbGF0Zm9ybX0tJHtwcm9jZXNzLmFyY2h9YDtcblx0aWYgKHByb2Nlc3MucGxhdGZvcm0gIT09ICdsaW51eCcpIHtcblx0XHRyZXR1cm4gW3BsYXRmb3JtQXJjaF07XG5cdH1cblxuXHRjb25zdCBsaW51eENhbmRpZGF0ZXMgPSBbYGxpbnV4LSR7cHJvY2Vzcy5hcmNofWAsIGBsaW51eG11c2wtJHtwcm9jZXNzLmFyY2h9YF07XG5cdHJldHVybiBpc0xpbnV4TXVzbFJ1bnRpbWUoKSA/IGxpbnV4Q2FuZGlkYXRlcy5yZXZlcnNlKCkgOiBsaW51eENhbmRpZGF0ZXM7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVDb3BpbG90Q2xpUGF0aChub2RlTW9kdWxlc1VyaTogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3QgdHJpZWQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgcGxhdGZvcm1QYWNrYWdlIG9mIGdldENvcGlsb3RQbGF0Zm9ybVBhY2thZ2VDYW5kaWRhdGVzKCkpIHtcblx0XHRjb25zdCBjbGlQYXRoID0gVVJJLmpvaW5QYXRoKG5vZGVNb2R1bGVzVXJpLCAnQGdpdGh1YicsIGBjb3BpbG90LSR7cGxhdGZvcm1QYWNrYWdlfWAsICdpbmRleC5qcycpLmZzUGF0aDtcblx0XHR0cmllZC5wdXNoKGNsaVBhdGgpO1xuXHRcdGlmIChhd2FpdCBmaWxlRXhpc3RzKGNsaVBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gY2xpUGF0aDtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBvbGRUb3BMZXZlbFBhdGggPSBVUkkuam9pblBhdGgobm9kZU1vZHVsZXNVcmksICdAZ2l0aHViJywgJ2NvcGlsb3QnLCAnaW5kZXguanMnKS5mc1BhdGg7XG5cdHRyaWVkLnB1c2gob2xkVG9wTGV2ZWxQYXRoKTtcblx0aWYgKGF3YWl0IGZpbGVFeGlzdHMob2xkVG9wTGV2ZWxQYXRoKSkge1xuXHRcdHJldHVybiBvbGRUb3BMZXZlbFBhdGg7XG5cdH1cblxuXHR0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byByZXNvbHZlIEBnaXRodWIvY29waWxvdCBDTEkgcGF0aC4gVHJpZWQ6ICR7dHJpZWQuam9pbignLCAnKX1gKTtcbn1cblxuZXhwb3J0IHR5cGUgSUNvcGlsb3RQbHVnaW5JbmZvID0gSVBhcnNlZFBsdWdpbiAmIHsgcmVhZG9ubHkgcGx1Z2luRGlyPzogVVJJIH07XG5cbi8qKlxuICogQSBzZXNzaW9uIHRoYXQgaGFzIGJlZW4gcmVxdWVzdGVkIGJ5IGEgY2xpZW50IGJ1dCBoYXMgbm90IHlldCBiZWVuXG4gKiBtYXRlcmlhbGl6ZWQgaW50byBhIHJlYWwgQ29waWxvdCBTREsgc2Vzc2lvbiwgd29ya3RyZWUsIG9yIHBlcnNpc3RlZFxuICogbWV0YWRhdGEuIENyZWF0ZWQgYnkge0BsaW5rIENvcGlsb3RBZ2VudC5jcmVhdGVTZXNzaW9ufSB3aGVuIG5vIGZvcmsgaXNcbiAqIHJlcXVlc3RlZCwgYW5kIGNvbnN1bWVkIGJ5IHtAbGluayBDb3BpbG90QWdlbnQuX21hdGVyaWFsaXplUHJvdmlzaW9uYWx9XG4gKiBvbiB0aGUgZmlyc3Qge0BsaW5rIENvcGlsb3RBZ2VudC5zZW5kTWVzc2FnZX0uXG4gKlxuICogVW50aWwgbWF0ZXJpYWxpemF0aW9uIHRoZSBzZXNzaW9uIG9jY3VwaWVzIG9ubHkgYW4gaW4tbWVtb3J5IHNsb3QgYW5kXG4gKiBhbiBlbnRyeSBpbiB0aGUgc3RhdGUgbWFuYWdlci4gRGlzcG9zaW5nIGEgcHJvdmlzaW9uYWwgc2Vzc2lvbiBpcyBhXG4gKiBjaGVhcCBuby1vcCBjb21wYXJlZCB3aXRoIHRlYXJpbmcgZG93biBhIHJlYWwgc2Vzc2lvbiBcdTIwMTQgdGhlcmUgaXMgbm9cbiAqIHdvcmt0cmVlIHRvIHJlbW92ZSBhbmQgbm8gb24tZGlzayBzdGF0ZSB0byBkZWxldGUuXG4gKlxuICogYG1vZGVsYCBhYnNvcmJzIHtAbGluayBDb3BpbG90QWdlbnQuY2hhbmdlTW9kZWx9IHVwZGF0ZXMgdGhhdCBhcnJpdmVcbiAqIGJlZm9yZSB0aGUgZmlyc3QgbWVzc2FnZS4gVGhlIGxhdGVzdCBwcm92aWRlci1vd25lZCBzZXNzaW9uIGNvbmZpZyBpcyByZWFkXG4gKiBzdHJhaWdodCBmcm9tIHRoZSBzdGF0ZSBtYW5hZ2VyIHZpYVxuICoge0BsaW5rIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXN9IGF0XG4gKiBtYXRlcmlhbGl6YXRpb24gdGltZSwgc28gbm8gYmVzcG9rZSBmb3J3YXJkaW5nIGlzIHJlcXVpcmVkIGZvciBpdC5cbiAqL1xuaW50ZXJmYWNlIElQcm92aXNpb25hbFNlc3Npb24ge1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblVyaTogVVJJO1xuXHQvKipcblx0ICogRm9sZGVyIHRoZSB1c2VyIHBpY2tlZCBhdCBjcmVhdGUgdGltZS4gVXNlZCBhcyBib3RoIHRoZVxuXHQgKiBwcmUtd29ya3RyZWUgd29ya2luZyBkaXJlY3RvcnkgYW5kIHRoZSBjdXN0b21pemF0aW9uIGRpcmVjdG9yeVxuXHQgKiAocGx1Z2luIGRpc2NvdmVyeSBpcyBhbmNob3JlZCB0byB0aGUgb3JpZ2luYWwgZm9sZGVyLCBub3QgdG8gYVxuXHQgKiB3b3JrdHJlZSBwYXRoIHRoYXQgbWF5IG5vdCBleGlzdCB5ZXQpLlxuXHQgKi9cblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogVVJJO1xuXHQvKipcblx0ICogVGhlIGZ1bGwgb3JkZXJlZCB3b3JraW5nLWRpcmVjdG9yeSBzZXQgYXMgc2VudCBieSB0aGUgY2xpZW50IGF0IGNyZWF0ZVxuXHQgKiB0aW1lIChpbmRleCAwID0gcHJpbWFyeSA9PT0ge0BsaW5rIHdvcmtpbmdEaXJlY3Rvcnl9KSwgZm9yIGEgbXVsdGktcm9vdFxuXHQgKiB3b3Jrc3BhY2UuIFVuZGVmaW5lZCBmb3Igc2luZ2xlLWZvbGRlciAvIGxlZ2FjeSBjbGllbnRzLiBUaGUgbm9uLXByaW1hcnlcblx0ICogcm9vdHMgYXJlIGF0dGFjaGVkIHRvIGN1c3RvbWl6YXRpb24gZGlzY292ZXJ5IGltbWVkaWF0ZWx5ICh0aGV5IGFyZSBzdGFibGVcblx0ICogd29ya3NwYWNlIGZvbGRlcnMsIHVubGlrZSB0aGUgd29ya3RyZWUgdGhhdCByZXNvbHZlcyBvbmx5IGF0IHNlbmQpLlxuXHQgKi9cblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107XG5cdC8qKiBNb3N0IHJlY2VudCBtb2RlbCBzZWxlY3Rpb24uIFVwZGF0ZWQgYnkgYGNoYW5nZU1vZGVsYCB3aGlsZSBwcm92aXNpb25hbC4gKi9cblx0bW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKiogTW9zdCByZWNlbnQgY3VzdG9tIGFnZW50IHNlbGVjdGlvbi4gVXBkYXRlZCBieSBgY2hhbmdlQWdlbnRgIHdoaWxlIHByb3Zpc2lvbmFsLiAqL1xuXHRhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdC8qKiBQcm9qZWN0IGluZm8gZWFnZXJseSByZXNvbHZlZCBhdCBjcmVhdGUgdGltZSBzbyB0aGUgc3VtbWFyeSByZW5kZXJzLiAqL1xuXHRyZWFkb25seSBwcm9qZWN0OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIHRoaXMgc2Vzc2lvbiBpcyB3b3Jrc3BhY2UtbGVzcyAoc3VyZmFjZWQgaW4gdGhlIHNlc3Npb25zIFVJIGFzIGEgXCJRdWljayBDaGF0XCIpLiAqL1xuXHRyZWFkb25seSB3b3Jrc3BhY2VsZXNzPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElDb3BpbG90QWdlbnRTZXNzaW9uSWRlbnRpdHkge1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXRDaGFubmVsVXJpOiBVUkk7XG59XG5cbmZ1bmN0aW9uIHRvUmVzdHJpY3RlZFRlbGVtZXRyeUVuZHBvaW50KGVuZHBvaW50OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZW5kcG9pbnQgPyBgJHtlbmRwb2ludC5yZXBsYWNlKC9cXC8rJC8sICcnKX0vdGVsZW1ldHJ5YCA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IHsgQ09QSUxPVF9BR0VOVF9IT1NUX1NZU1RFTV9NRVNTQUdFIH0gZnJvbSAnLi9wcm9tcHRzL3N5c3RlbU1lc3NhZ2UuanMnO1xuXG50eXBlIE1vZGVsSW5mbyA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxDb3BpbG90Q2xpZW50WydycGMnXVsnbW9kZWxzJ11bJ2xpc3QnXT4+Wydtb2RlbHMnXVtudW1iZXJdO1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRNb2RlbFNlbGVjdGlvbiB7XG5cdGlkPzogdW5rbm93bjtcblx0Y29uZmlnPzogdW5rbm93bjtcbn1cblxuLyoqXG4gKiBTdWJzZXQgb2YgdGhlIEpTT04tUlBDIGBNZXNzYWdlQ29ubmVjdGlvbmAgd2UgcmVhY2ggaW50byB2aWEgdGhlIFNESydzIHByaXZhdGUgYGNvbm5lY3Rpb25gIGZpZWxkIHRvIHdpcmUgcGxhbiBtb2RlLlxuICogU2VlIHtAbGluayBDb3BpbG90QWdlbnQuX2VuYWJsZVBsYW5Nb2RlT25DbGllbnR9LlxuICovXG5pbnRlcmZhY2UgSUV4aXRQbGFuTW9kZUNvbm5lY3Rpb24ge1xuXHRzZW5kUmVxdWVzdChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duKTogUHJvbWlzZTx1bmtub3duPjtcblx0b25SZXF1ZXN0KG1ldGhvZDogc3RyaW5nLCBoYW5kbGVyOiAocGFyYW1zOiBJRXhpdFBsYW5Nb2RlUmVxdWVzdFBhcmFtcykgPT4gUHJvbWlzZTxJRXhpdFBsYW5Nb2RlUmVzcG9uc2U+KTogeyBkaXNwb3NlKCk6IHZvaWQgfTtcbn1cblxuLyoqXG4gKiBQYXlsb2FkIG9mIHRoZSBDTEkncyBgZXhpdFBsYW5Nb2RlLnJlcXVlc3RgIFJQQy4gVGhlIENMSSBkaXNwYXRjaGVzIG9uZVxuICogcGVyIGBleGl0X3BsYW5fbW9kZWAgdG9vbCBpbnZvY2F0aW9uIHdoZW4gdGhlIHNlc3Npb24gd2FzIGNyZWF0ZWQgd2l0aFxuICogYHJlcXVlc3RFeGl0UGxhbk1vZGU6IHRydWVgLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFeGl0UGxhbk1vZGVSZXF1ZXN0UGFyYW1zIHtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1bW1hcnk6IHN0cmluZztcblx0cmVhZG9ubHkgcGxhbkNvbnRlbnQ6IHN0cmluZztcblx0cmVhZG9ubHkgYWN0aW9uczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHJlY29tbWVuZGVkQWN0aW9uOiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVzcG9uc2UgZm9yIHRoZSBDTEkncyBgZXhpdFBsYW5Nb2RlLnJlcXVlc3RgIFJQQy4gVGhlIENMSSBmZWVkcyB0aGlzXG4gKiBkaXJlY3RseSBpbnRvIGBzZXNzaW9uLnJlc3BvbmRUb0V4aXRQbGFuTW9kZWAsIHdoaWNoIHJlc29sdmVzIHRoZVxuICogcGVuZGluZyB0b29sIGNhbGwgYW5kICh3aGVuIGFwcHJvdmVkKSB1cGRhdGVzIHRoZSBTREsncyBgY3VycmVudE1vZGVgLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFeGl0UGxhbk1vZGVSZXNwb25zZSB7XG5cdHJlYWRvbmx5IGFwcHJvdmVkOiBib29sZWFuO1xuXHRyZWFkb25seSBzZWxlY3RlZEFjdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgYXV0b0FwcHJvdmVFZGl0cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZlZWRiYWNrPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlYmFzZXMgYHVyaWAgZnJvbSB1bmRlciBgZnJvbURpcmAgb250byBgdG9EaXJgLCBwcmVzZXJ2aW5nIHRoZSByZWxhdGl2ZSBwYXRoLlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIGB1cmlgIGlzIG5vdCBlcXVhbCB0byBvciB1bmRlciBgZnJvbURpcmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWJhc2VVbmRlcih1cmk6IFVSSSwgZnJvbURpcjogVVJJLCB0b0RpcjogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFpc0VxdWFsT3JQYXJlbnQodXJpLCBmcm9tRGlyKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmVsID0gcmVsYXRpdmVQYXRoKGZyb21EaXIsIHVyaSk7XG5cdGlmIChyZWwgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHJlbC5sZW5ndGggPT09IDAgPyB0b0RpciA6IHJlc291cmNlSm9pblBhdGgodG9EaXIsIHJlbCk7XG59XG5cbi8qKlxuICogUGVyLXNlc3Npb24gY29udGFpbmVyLiBPd25zIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCAobWFpbikgY2hhdCBhbmQgYW55XG4gKiBhZGRpdGlvbmFsIHBlZXIgY2hhdHMsIGtlZXBpbmcgYWxsIGNoYXRzIG9mIGEgc2Vzc2lvbiB0b2dldGhlciBpbiBhIHNpbmdsZVxuICoge0BsaW5rIENvcGlsb3RBZ2VudC5fc2Vzc2lvbnN9IG1hcCAobm8gcGFyYWxsZWwgbWFwcykuIFRoZSBkZWZhdWx0IGNoYXQgaXNcbiAqIG9wdGlvbmFsIGJlY2F1c2UgYSBDb3BpbG90IHNlc3Npb24gY2FuIGV4aXN0IGFzIGEgcHJvdmlzaW9uYWwgcmVjb3JkIChpblxuICoge0BsaW5rIENvcGlsb3RBZ2VudC5fcHJvdmlzaW9uYWxTZXNzaW9uc30pIHdob3NlIFNESy1iYWNrZWQgZGVmYXVsdCBjaGF0IGhhc1xuICogbm90IG1hdGVyaWFsaXplZCB5ZXQgXHUyMDE0IGEgcGVlciBjaGF0IG1heSBzdGlsbCBiZSBjcmVhdGVkIG9uIGl0LiBEaXNwb3NpbmcgdGhlXG4gKiBlbnRyeSBkaXNwb3NlcyB0aGUgZGVmYXVsdCBjaGF0IGFuZCBldmVyeSBwZWVyIGNoYXQuXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLCB3aGljaCBpbmplY3QgZmFrZSBzZXNzaW9ucyBpbnRvIHRoZSBjb250YWluZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBDb3BpbG90U2Vzc2lvbkVudHJ5IGV4dGVuZHMgQWdlbnRTZXNzaW9uRW50cnk8Q29waWxvdEFnZW50U2Vzc2lvbj4geyB9XG5cbi8qKlxuICogQWdlbnQgcHJvdmlkZXIgYmFja2VkIGJ5IHRoZSBDb3BpbG90IFNESyB7QGxpbmsgQ29waWxvdENsaWVudH0uXG4gKi9cbmV4cG9ydCBjbGFzcyBDb3BpbG90QWdlbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50IHtcblx0cmVhZG9ubHkgaWQgPSAnY29waWxvdGNsaScgYXMgY29uc3Q7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZXNzaW9uUHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBZ2VudFNpZ25hbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2Vzc2lvblByb2dyZXNzID0gdGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZXZlbnQ7XG5cdC8qKlxuXHQgKiBNZW1iZXJzaGlwIGNoYW5uZWwgZm9yIGNoYXRzIHRoZSBhZ2VudCBzcGF3bnMgaXRzZWxmIFx1MjAxNCBzdWItYWdlbnRzXG5cdCAqIGRlbGVnYXRlZCBieSBhIHRvb2wgY2FsbCAodGhlIHNhbWUgZmFuLW91dCB0aGUgYHN1YmFnZW50X3N0YXJ0ZWRgIC9cblx0ICogYHN1YmFnZW50X2NvbXBsZXRlZGAgc2lnbmFscyBkcml2ZSkuIFRoZSBvcmNoZXN0cmF0b3Igcm91dGVzIHRoZXNlIGludG9cblx0ICogdGhlIGNoYXQgY2F0YWxvZyBzbyBoYXJuZXNzLXNwYXduZWQgYW5kIHVzZXItZHJpdmVuIGNoYXRzIHNoYXJlIG9uZSBwYXRoLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTcGF3bkNoYXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRTcGF3bkNoYXRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3Bhd25DaGF0ID0gdGhpcy5fb25EaWRTcGF3bkNoYXQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTWF0ZXJpYWxpemVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50TWF0ZXJpYWxpemVTZXNzaW9uRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1hdGVyaWFsaXplU2Vzc2lvbiA9IHRoaXMuX29uRGlkTWF0ZXJpYWxpemVTZXNzaW9uLmV2ZW50O1xuXHQvKipcblx0ICogUGVyLXNlc3Npb24gTUNQIG5vdGlmaWNhdGlvbnMsIGZhbm5lZCBpbiBmcm9tIGV2ZXJ5IGFjdGl2ZVxuXHQgKiB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbn0uIEVhY2ggc2Vzc2lvbiBjb250cmlidXRlcyBhIHNpbmdsZVxuXHQgKiBzdWJzY3JpcHRpb24sIGRpc3Bvc2VkIGFsb25nc2lkZSB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWNwTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1jcE5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uTWNwTm90aWZpY2F0aW9uID0gdGhpcy5fb25NY3BOb3RpZmljYXRpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVscyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXT4odGhpcywgW10pO1xuXHRyZWFkb25seSBtb2RlbHMgPSB0aGlzLl9tb2RlbHM7XG5cdC8qKlxuXHQgKiBUaGUgdHdvIHNvdXJjZXMgbWVyZ2VkIGludG8ge0BsaW5rIF9tb2RlbHN9OiBDQVBJIG1vZGVscyBmcm9tIHRoZSBDTEknc1xuXHQgKiBgbW9kZWxzLmxpc3RgIGFuZCBCWU9LIG1vZGVscyBmcm9tIHRoZSByZW5kZXJlciBicmlkZ2UgcmVnaXN0cnkncyBzZXJ2aW5nXG5cdCAqIHdpbmRvdy4gVHJhY2tlZCBzZXBhcmF0ZWx5IHNvIGVhY2ggY2FuIHJlZnJlc2ggaW5kZXBlbmRlbnRseSB3aXRob3V0XG5cdCAqIGNsb2JiZXJpbmcgdGhlIG90aGVyOyB7QGxpbmsgX3B1Ymxpc2hNb2RlbHN9IGNvbmNhdGVuYXRlcyB0aGVtIGZvciB0aGVcblx0ICogcGlja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FwaU1vZGVsczogcmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10gPSBbXTtcblx0cHJpdmF0ZSBfYnlva01vZGVsczogcmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10gPSBbXTtcblxuXHQvKiogTW9kZWwgSURzIHdob3NlIGxvbmctY29udGV4dCB0aWVyIGNvc3RzIHRoZSBzYW1lIGFzIHRoZSBkZWZhdWx0IHRpZXIuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZyZWVMb25nQ29udGV4dE1vZGVscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBCb3VuZGVkIGV4cG9uZW50aWFsLWJhY2tvZmYgcmV0cnkgZm9yIHtAbGluayBfcmVmcmVzaE1vZGVsc30uIFRoZSBTREsnc1xuXHQgKiBgbW9kZWxzLmxpc3RgIFJQQyBjYW4gZmFpbCB0cmFuc2llbnRseSAoZS5nLiBhIGA0MjkgXCJ0b28gbWFueSByZXF1ZXN0c1wiYFxuXHQgKiByaWdodCBhZnRlciBzdGFydHVwKS4gV2l0aG91dCBhIHJldHJ5IHRoZSBtb2RlbCBwaWNrZXIgd291bGQgc3RheSBlbXB0eVxuXHQgKiB1bnRpbCB0aGUgbmV4dCBleHRlcm5hbCByZWZyZXNoIHRyaWdnZXIgKGEgR2l0SHViIHRva2VuIGNoYW5nZSwgYSBDTElcblx0ICogY2xpZW50IHJlc3RhcnQsIG9yIHRoZSBob3N0J3MgcGVyaW9kaWMgc2NoZWR1bGVyKSwgc28gd2UgcmV0cnkgYSBmZXdcblx0ICogdGltZXMgYmVmb3JlIGdpdmluZyB1cC4gT3ZlcnJpZGFibGUgaW4gdGVzdHMgdG8gYXZvaWQgcmVhbCBkZWxheXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21vZGVsUmVmcmVzaE1heEF0dGVtcHRzOiBudW1iZXIgPSA1O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21vZGVsUmVmcmVzaEJhc2VEZWxheU1zOiBudW1iZXIgPSAxXzAwMDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9tb2RlbFJlZnJlc2hNYXhEZWxheU1zOiBudW1iZXIgPSAzMF8wMDA7XG5cdC8qKiBQZW5kaW5nIG1vZGVsLXJlZnJlc2ggcmV0cnkgdGltZXI7IGNsZWFyZWQgb24gYSBmcmVzaCByZWZyZXNoLCBzaHV0ZG93biwgb3IgZGlzcG9zZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxSZWZyZXNoUmV0cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdC8qKlxuXHQgKiBJbnZhbGlkYXRlcyBtb2RlbCByZXF1ZXN0cyBib3VuZCB0byBhIHN1cGVyc2VkZWQgdG9rZW4vY2xpZW50L2NhdGFsb2dcblx0ICogc291cmNlLiBUb2tlbiBpZGVudGl0eSBhbG9uZSBpcyBpbnN1ZmZpY2llbnQ6IHJlc3RhcnRpbmcgdGhlIGNsaWVudCBmb3Jcblx0ICogYSBgQ09QSUxPVF9HSF9IT1NUYCBjaGFuZ2Uga2VlcHMgdGhlIHNhbWUgdG9rZW4gd2hpbGUgY2hhbmdpbmcgdGhlIENBUElcblx0ICogZW5kcG9pbnQgd2hvc2UgY2F0YWxvZyBpcyBhdXRob3JpdGF0aXZlLlxuXHQgKi9cblx0cHJpdmF0ZSBfbW9kZWxDYXRhbG9nR2VuZXJhdGlvbiA9IDA7XG5cdC8qKlxuXHQgKiBGb3JjZWQgcmVmcmVzaGVzIGFyZSBkZWZlcnJlZCB0byB0aGUgbmV4dCB0YXNrIHNvIHJlbGF0ZWQgbGlmZWN5Y2xlXG5cdCAqIGNoYW5nZXMgKGZvciBleGFtcGxlIGFuIGF1dGggdXBkYXRlIGFycml2aW5nIHdpdGggYSBzdGFydHVwLWNvbmZpZ1xuXHQgKiBjaGFuZ2UpIGNvbGxhcHNlIGludG8gb25lIGVudW1lcmF0aW9uIG9mIHRoZSBmaW5hbCB0b2tlbi9jbGllbnQgc291cmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVkTW9kZWxSZWZyZXNoOiB7IHJlYWRvbmx5IGRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD47IGdlbmVyYXRpb246IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFJlZnJlc2hTY2hlZHVsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0LyoqXG5cdCAqIEluLWZsaWdodCB7QGxpbmsgcmVmcmVzaE1vZGVsc30gY2FsbCwgc28gb3ZlcmxhcHBpbmcgdHJpZ2dlcnMgKGFuIGF1dGhcblx0ICogdG9rZW4gY2hhbmdlIGxhbmRpbmcgb24gdG9wIG9mIGEgcGVyaW9kaWMgdGljaykgY29sbGFwc2UgaW50byBhIHNpbmdsZVxuXHQgKiBgbW9kZWxzLmxpc3RgIHJlcXVlc3QuIE9ubHkgY292ZXJzIHRoZSByZXF1ZXN0IGl0c2VsZjoge0BsaW5rIF9yZWZyZXNoTW9kZWxzfVxuXHQgKiByZXR1cm5zIGFzIHNvb24gYXMgaXQgKnNjaGVkdWxlcyogYSBiYWNrb2ZmIHJldHJ5LCBzbyBhIHBlbmRpbmcgcmV0cnlcblx0ICogbmV2ZXIgc3VwcHJlc3NlcyBhIGxhdGVyIHRpY2sgXHUyMDE0IHdoaWNoIGlzIHdoYXQgbGV0cyB0aGUgc2NoZWR1bGVyIGFjdCBhc1xuXHQgKiB0aGUgbG9uZy10ZXJtIHJldHJ5IHBhdGggb25jZSB0aGUgYm91bmRlZCBhdHRlbXB0cyBhcmUgZXhoYXVzdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfbW9kZWxSZWZyZXNoSW5GbGlnaHQ6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY2xpZW50OiBDb3BpbG90Q2xpZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jbGllbnRTdGFydGluZzogUHJvbWlzZTxDb3BpbG90Q2xpZW50PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2xpZW50U3RvcHBpbmc6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBQcm94eSBVUkwgaW5qZWN0ZWQgaW50byB0aGUgcnVubmluZyBjbGllbnQncyBzdWJwcm9jZXNzIGVudiAoYHVuZGVmaW5lZGBcblx0ICogd2hlbiBub25lIHdhcyBpbmplY3RlZCkuIFVzZWQgdG8gZGV0ZWN0IHdoZW4gYSB0b2tlbiBjaGFuZ2UgYWx0ZXJzIHRoZVxuXHQgKiB0b2tlbi1kaXNjb3ZlcmVkIENBUEkgZW5kcG9pbnQncyBwcm94eSBzbyB3ZSBjYW4gcmVzdGFydCB0aGUgY2xpZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbGllZFByb3h5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBSZWFzb25zIGZvciBhIGNsaWVudCByZXN0YXJ0IHRoYXQgaXMgcGFya2VkIHVudGlsIGV2ZXJ5IGNoYXQgaXMgaWRsZS4gU2VlXG5cdCAqIHtAbGluayBfcmVxdWVzdENsaWVudFJlc3RhcnR9OyBkcmFpbmVkIGJ5IHtAbGluayBfYXBwbHlQZW5kaW5nQ2xpZW50UmVzdGFydH0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2xpZW50UmVzdGFydFJlYXNvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfZ2l0aHViVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VydmVyVG9vbEhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0IHwgdW5kZWZpbmVkO1xuXG5cdHNldFNlcnZlclRvb2xIb3N0KGhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0KTogdm9pZCB7XG5cdFx0dGhpcy5fc2VydmVyVG9vbEhvc3QgPSBob3N0O1xuXHR9XG5cblx0LyoqIFJlZmxlY3RzIHRoZSBgcnQ9MWAgZmllbGQgb24gdGhlIEdpdEh1YiBDb3BpbG90IGJlYXJlciB0b2tlbjsgZ2F0ZXMgZW5oYW5jZWQgR0ggdGVsZW1ldHJ5LiAqL1xuXHRwcml2YXRlIF9yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlc3RyaWN0ZWRUZWxlbWV0cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZXN0cmljdGVkVGVsZW1ldHJ5ID0gdGhpcy5fb25EaWRDaGFuZ2VSZXN0cmljdGVkVGVsZW1ldHJ5LmV2ZW50O1xuXG5cdGdldCByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ7XG5cdH1cblxuXHQvKiogUm9vdCBBSFAgc2Vzc2lvbiBpZCAtPiBjb250YWluZXIgdGhhdCBvd25zIHRoZSBkZWZhdWx0IGNoYXQgYW5kIGFsbCBwZWVyIGNoYXRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgQ29waWxvdFNlc3Npb25FbnRyeT4oKSk7XG5cdC8qKiBTREsgc2Vzc2lvbiBpZCAtPiBpbmRpdmlkdWFsIGNoYXQgc2Vzc2lvbiwgdXNlZCB0byByb3V0ZSBjb25uZWN0aW9uLWdsb2JhbCBTREsgdGVsZW1ldHJ5IGluIE8oMSkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nka1Nlc3Npb25zQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBDb3BpbG90QWdlbnRTZXNzaW9uPigpO1xuXHQvKipcblx0ICogTGl2ZSBgY2hhdFVyaSBcdTIxOTIgYmFja2luZ2AgbWFwIGZvciBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgcGVlciBjaGF0cyxcblx0ICoga2V5ZWQgYnkgY2hhdCBjaGFubmVsIFVSSSBzdHJpbmcuIFJlY29yZHMgdGhlIFNESyBjaGF0IGlkIChhbmRcblx0ICogb3B0aW9uYWwgbW9kZWwgb3ZlcnJpZGUpIHRoYXQgYmFja3MgZWFjaCBwZWVyIGNoYXQgc28gdGhlIGFnZW50IGNhblxuXHQgKiByZXN1bWUgaXQgd2l0aG91dCBjb25zdWx0aW5nIG9uLWRpc2sgcGVyc2lzdGVuY2UuIFBvcHVsYXRlZCBieVxuXHQgKiB7QGxpbmsgY3JlYXRlQ2hhdH0gb24gY3JlYXRpb24gYW5kIGJ5IHtAbGluayBtYXRlcmlhbGl6ZUNoYXR9IG9uXG5cdCAqIHJlc3RvcmU7IHRoZSBvcmNoZXN0cmF0b3Igbm93IG93bnMgdGhlIGR1cmFibGUgcGVlci1jaGF0IGNhdGFsb2cgKHRoZVxuXHQgKiBhZ2VudCBubyBsb25nZXIgd3JpdGVzIGBjb3BpbG90LmNoYXRzYCkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0QmFja2luZ3MgPSBuZXcgTWFwPHN0cmluZywgSVBlcnNpc3RlZENoYXQ+KCk7XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGEgcGVlciBjaGF0J3Mgb3BhcXVlIGBwcm92aWRlckRhdGFgIGJsb2IgY2hhbmdlcyBhZnRlclxuXHQgKiBjcmVhdGlvbiAoZS5nLiBhIHBlci1jaGF0IG1vZGVsIHN3aXRjaCksIHNvIHRoZSBvcmNoZXN0cmF0b3IgcmUtcGVyc2lzdHNcblx0ICogdGhlIHJlZnJlc2hlZCB0b2tlbi4gU2VlIHtAbGluayBJQWdlbnQub25EaWRDaGFuZ2VDaGF0RGF0YX0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNoYXREYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50Q2hhdERhdGFDaGFuZ2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXREYXRhOiBFdmVudDxJQWdlbnRDaGF0RGF0YUNoYW5nZT4gPSB0aGlzLl9vbkRpZENoYW5nZUNoYXREYXRhLmV2ZW50O1xuXHQvKipcblx0ICogUGVyLXNlc3Npb24gTUNQLW5vdGlmaWNhdGlvbiBzdWJzY3JpcHRpb25zLCBrZXllZCBieSBgc2Vzc2lvbklkYC5cblx0ICogRGlzcG9zZWQgaW4gbG9ja3N0ZXAgd2l0aCB0aGUgbWF0Y2hpbmcge0BsaW5rIF9zZXNzaW9uc30gZW50cnkgc29cblx0ICogdGhlIGZhbi1pbiBkb2VzIG5vdCBsZWFrIGxpc3RlbmVycyBhcyBzZXNzaW9ucyBjb21lIGFuZCBnby5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21jcE5vdGlmaWNhdGlvblN1YnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHQvKipcblx0ICogSW4tZmxpZ2h0IHtAbGluayBfcmVzdW1lU2Vzc2lvbn0gcHJvbWlzZXMsIGtleWVkIGJ5IHNlc3Npb25JZC4gVXNlZCB0b1xuXHQgKiBkZWR1cGxpY2F0ZSBjb25jdXJyZW50IHJlc3VtZSByZXF1ZXN0cyBmb3IgdGhlIHNhbWUgc2Vzc2lvbiBzbyB0aGF0XG5cdCAqIHdlIG5ldmVyIGNvbnN0cnVjdCB0d28ge0BsaW5rIENvcGlsb3RBZ2VudFNlc3Npb259IGVudHJpZXMgZm9yIHRoZVxuXHQgKiBzYW1lIGlkIFx1MjAxNCBgX3Nlc3Npb25zYCBpcyBhIHtAbGluayBEaXNwb3NhYmxlTWFwfSB3aG9zZSBgc2V0KClgIHdvdWxkXG5cdCAqIGRpc3Bvc2UgdGhlIGluLWZsaWdodCBmaXJzdCBlbnRyeSBtaWQte0BsaW5rIENvcGlsb3RBZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb259LFxuXHQgKiBsZWF2aW5nIHRoZSBzZWNvbmQgY2FsbGVyIHdpdGggYSBoYWxmLWluaXRpYWxpc2VkLCBldmVudGxlc3Mgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3VtaW5nU2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPj4oKTtcblx0LyoqXG5cdCAqIFNlc3Npb25zIGNyZWF0ZWQgYnkgYSBjbGllbnQgYnV0IG5vdCB5ZXQgbWF0ZXJpYWxpemVkIGludG8gYSBDb3BpbG90XG5cdCAqIFNESyBzZXNzaW9uICsgd29ya3RyZWUgKyBvbi1kaXNrIG1ldGFkYXRhLiBNYXRlcmlhbGl6YXRpb24gaXMgZGVmZXJyZWRcblx0ICogdW50aWwgdGhlIGZpcnN0IHtAbGluayBzZW5kTWVzc2FnZX0sIGF0IHdoaWNoIHBvaW50IHRoZSBlbnRyeSBtb3Zlc1xuXHQgKiBvdXQgb2YgdGhpcyBtYXAgYW5kIGludG8ge0BsaW5rIF9zZXNzaW9uc30uIFNlZSB7QGxpbmsgSVByb3Zpc2lvbmFsU2Vzc2lvbn0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aXNpb25hbFNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElQcm92aXNpb25hbFNlc3Npb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIF9zaHV0ZG93blByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BsdWdpbnM6IFBsdWdpbkNvbnRyb2xsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25MYXVuY2hlcjogQ29waWxvdFNlc3Npb25MYXVuY2hlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyOiBDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9naXRodWJUZWxlbWV0cnlSb3V0ZXI6IEFnZW50SG9zdEdpdEh1YlRlbGVtZXRyeVJvdXRlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZTogRXZlbnQ8dm9pZD47XG5cdC8qKiBQZXItc2Vzc2lvbiBhY3RpdmUgY2xpZW50IHN0YXRlIGZvciB0b29scyArIHBsdWdpbiBzbmFwc2hvdCB0cmFja2luZy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2xpZW50cyA9IG5ldyBSZXNvdXJjZU1hcDxBY3RpdmVDbGllbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsYXNoQ29tbWFuZFByb3ZpZGVyOiBDb3BpbG90U2xhc2hDb21tYW5kUHJvdmlkZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25EYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgcHJpdmF0ZSByZWFkb25seSBfc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsXG5cdFx0QElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0SHViRW5kcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3RlbFNlcnZpY2U6IElBZ2VudEhvc3RPVGVsU2VydmljZSxcblx0XHRASUFnZW50SG9zdENvbXBsZXRpb25zIGNvbXBsZXRpb25zOiBJQWdlbnRIb3N0Q29tcGxldGlvbnMsXG5cdFx0QElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGVja3BvaW50U2VydmljZTogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0UmV2aWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXZpZXdTZXJ2aWNlOiBJQWdlbnRIb3N0UmV2aWV3U2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElCeW9rTG1CcmlkZ2VSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IF9ieW9rQnJpZGdlUmVnaXN0cnk6IElCeW9rTG1CcmlkZ2VSZWdpc3RyeSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0UHJveHlSZXNvbHZlciBwcml2YXRlIHJlYWRvbmx5IF9wcm94eVJlc29sdmVyOiBJQWdlbnRIb3N0UHJveHlSZXNvbHZlcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wbHVnaW5zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luQ29udHJvbGxlciwgKCkgPT4gdGhpcy5fZW5zdXJlQ2xpZW50KCkpKTtcblx0XHR0aGlzLl9zZXNzaW9uTGF1bmNoZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90U2Vzc2lvbkxhdW5jaGVyKTtcblx0XHR0aGlzLl9naXRIdWJUZWxlbWV0cnlGb3J3YXJkZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyLCAoKSA9PiB0aGlzLl9yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCk7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyKCgpID0+IHRoaXMuX2Vuc3VyZUNsaWVudCgpLnRoZW4oYyA9PiBjLnJwYy5jb21tYW5kcy5saXN0KCkudGhlbihjID0+IGMuY29tbWFuZHMpKSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fZ2l0aHViVGVsZW1ldHJ5Um91dGVyID0gaXNBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpXG5cdFx0XHQ/IG5ldyBBZ2VudEhvc3RHaXRIdWJUZWxlbWV0cnlSb3V0ZXIodGhpcy5fdGVsZW1ldHJ5U2VydmljZSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHRoaXMub25EaWRDdXN0b21pemF0aW9uc0NoYW5nZSA9IHRoaXMuX3BsdWdpbnMub25EaWRDaGFuZ2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlKCh7IHNlc3Npb24sIHRpdGxlIH0pID0+IHtcblx0XHRcdGlmIChBZ2VudFNlc3Npb24ucHJvdmlkZXIoc2Vzc2lvbikgPT09IHRoaXMuaWQpIHtcblx0XHRcdFx0dGhpcy5fb3RlbFNlcnZpY2UuZW1pdFNlc3Npb25UaXRsZUNoYW5nZWQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLCBzZXNzaW9uLCB0aXRsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIE1pcnJvciB0aGUgc3ViLWFnZW50IGZhbi1vdXQgc2lnbmFscyBvbnRvIHRoZSBmaXJzdC1jbGFzcyBzcGF3bmVkLVxuXHRcdC8vIGNoYXQgY2hhbm5lbCBzbyB0aGUgb3JjaGVzdHJhdG9yIG1hbmFnZXMgc3ViLWFnZW50IGNoYXRzXG5cdFx0Ly8gdGhyb3VnaCB0aGUgc2FtZSBtZW1iZXJzaGlwIHBhdGggYXMgdXNlci1kcml2ZW4gY2hhdHMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZXZlbnQoc2lnbmFsID0+IHRoaXMuX2VtaXRTcGF3bmVkQ2hhdEZvclN1YmFnZW50U2lnbmFsKHNpZ25hbCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb21wbGV0aW9ucy5yZWdpc3RlclByb3ZpZGVyKG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKHRoaXMuaWQsXG5cdFx0XHR7XG5cdFx0XHRcdGlzUnViYmVyRHVja0VuYWJsZWQ6ICgpID0+IHRoaXMuX2lzUnViYmVyRHVja0VuYWJsZWQoKSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IChzZXNzaW9uSWQsIG9wdGlvbnMpID0+IHRoaXMuX2dldFJ1bnRpbWVTbGFzaENvbW1hbmRzKHNlc3Npb25JZCwgb3B0aW9ucyksXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogKHNlc3Npb25JZCkgPT4gdGhpcy5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZXNzaW9uSWQpKSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkNvbmZpZ1N0YXRlOiAoc2Vzc2lvbklkKSA9PiB0aGlzLl9nZXRTZXNzaW9uQ29uZmlnU3RhdGUoc2Vzc2lvbklkKSxcblx0XHRcdH0sXG5cdFx0XHRSVU5USU1FX1NMQVNIX0NPTU1BTkRfQ09NUExFVElPTl9XQUlUX01TLFxuXHRcdCkpKTtcblxuXHRcdC8vIFJlc3RhcnQgdGhlIENMSSBjbGllbnQgd2hlbiBhIHNldHRpbmcgYmFrZWQgaW50byB0aGUgY2xpZW50L3N1YnByb2Nlc3MgYXRcblx0XHQvLyBzdGFydHVwIGNoYW5nZXMsIGRpc3Bvc2luZyBhbnkgYWN0aXZlIHNlc3Npb25zLiBUaGVzZSB2YWx1ZXMgYXJlIGFwcGxpZWQgaW5cblx0XHQvLyBgX2Vuc3VyZUNsaWVudGAsIHNvIHRoZXkgb25seSB0YWtlIGVmZmVjdCBvbiB0aGUgbmV4dCBjbGllbnQgc3RhcnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Jlc3RhcnRDbGllbnRJZlN0YXJ0dXBDb25maWdDaGFuZ2VkKCkuY2F0Y2goZXJyID0+XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tDb3BpbG90XSBGYWlsZWQgdG8gYXBwbHkgcm9vdCBjb25maWcgY2hhbmdlJywgZXJyKVxuXHRcdFx0KTtcblx0XHR9KSk7XG5cblx0XHQvLyBTdXJmYWNlIHJlbmRlcmVyIEJZT0sgbW9kZWxzIGluIHRoZSBwaWNrZXI6IHJlcHVibGlzaCB0aGVtIHdoZW5ldmVyIHRoZVxuXHRcdC8vIHNldCBvZiBjb25uZWN0ZWQgcmVuZGVyZXIgYnJpZGdlcywgb3IgYW55IHJlbmRlcmVyJ3MgbW9kZWxzLCBjaGFuZ2UuXG5cdFx0Ly8gVGhlIHJlZ2lzdHJ5IGlzIG9ubHkgcG9wdWxhdGVkIHdoZW4gYGNoYXQuYWdlbnRIb3N0LmJ5b2tNb2RlbHMuZW5hYmxlZGBcblx0XHQvLyBpcyBvbiwgc28gdGhpcyBzdGF5cyBhIG5vLW9wIChlbXB0eSBsaXN0KSB3aGlsZSB0aGUgZmVhdHVyZSBpcyBvZmYuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYnlva0JyaWRnZVJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlTW9kZWxzKCgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NvcGlsb3RdIEJZT0sgYnJpZGdlIGNoYW5nZWQ7IHJlZnJlc2hpbmcgbW9kZWxzJyk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoQnlva01vZGVscygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIGBDT1BJTE9UX0dIX0hPU1RgIGlzIGEgc3VicHJvY2VzcyBlbnYgdmFyIChhcHBsaWVkIGluIGBfZW5zdXJlQ2xpZW50YCkgdGhlXG5cdFx0Ly8gQ0xJIHJlYWRzIG9ubHkgYXQgc3Bhd24gdGltZS4gV2hlbiB0aGUgY29uZmlndXJlZCBHaXRIdWIgRW50ZXJwcmlzZSBob3N0XG5cdFx0Ly8gY2hhbmdlcyAtIG5vdGFibHkgdGhlIHN0YXJ0dXAgcmFjZSB3aGVyZSB0aGUgd29ya2JlbmNoIHB1c2hlc1xuXHRcdC8vIGBnaXRodWJFbnRlcnByaXNlVXJpYCBqdXN0IGFmdGVyIHRoZSBjbGllbnQncyBpbml0aWFsIHNwYXduIC0gcmVzdGFydCB0aGVcblx0XHQvLyBjbGllbnQgc28gaXQgY29tZXMgdXAgcG9pbnRlZCBhdCB0aGUgcmlnaHQgaG9zdC4gRHJpdmVuIG9mZiB0aGUgZW5kcG9pbnRcblx0XHQvLyBzZXJ2aWNlJ3MgYG9uRGlkQ2hhbmdlYCAod2hpY2ggZmlyZXMgYWZ0ZXIgaXRzIGVuZHBvaW50cyBhcmUgcmVjb21wdXRlZClcblx0XHQvLyByYXRoZXIgdGhhbiB0aGUgcmF3IGNvbmZpZyBldmVudCwgc28gYGdldEVudGVycHJpc2VIb3N0KClgIGlzIGN1cnJlbnQgaGVyZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVzdGFydENsaWVudElmU3RhcnR1cENvbmZpZ0NoYW5nZWQoKS5jYXRjaChlcnIgPT5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0NvcGlsb3RdIEZhaWxlZCB0byByZXN0YXJ0IGNsaWVudCBhZnRlciBlbmRwb2ludCBjaGFuZ2UnLCBlcnIpXG5cdFx0XHQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGVzIHRoZSBzdWItYWdlbnQgZmFuLW91dCBzaWduYWxzIGludG8gdGhlIGZpcnN0LWNsYXNzIHNwYXduZWQtXG5cdCAqIGNoYXQgY2hhbm5lbDogYHN1YmFnZW50X3N0YXJ0ZWRgIC0+IHtAbGluayBvbkRpZFNwYXduQ2hhdH1cblx0ICogKGNhcnJ5aW5nIHRoZSBzcGF3bmluZyB0b29sIGNhbGwgYXMgdGhlIGNoYXQncyBwYXJlbnQgZWRnZSkuIEEgY29tcGxldGVkXG5cdCAqIHN1YmFnZW50IGNoYXQgc3RheXMgbGl2ZSBhbmQgc3Vic2NyaWJhYmxlIChpdCBpcyByZW1vdmVkIG9ubHkgb24gc2Vzc2lvblxuXHQgKiB0ZWFyZG93biksIHNvIHRoZXJlIGlzIG5vIGNvcnJlc3BvbmRpbmcgZW5kIGV2ZW50LiBUaGUgc2lnbmFscyB0aGVtc2VsdmVzXG5cdCAqIGFyZSBsZWZ0IHVudG91Y2hlZCBzbyB0aGUgZXhpc3Rpbmcgc3ViLWFnZW50IGJlaGF2aW9yIGlzIHByZXNlcnZlZC5cblx0ICovXG5cdHByaXZhdGUgX2VtaXRTcGF3bmVkQ2hhdEZvclN1YmFnZW50U2lnbmFsKHNpZ25hbDogQWdlbnRTaWduYWwpOiB2b2lkIHtcblx0XHRjb25zdCBzcGF3biA9IFN1YmFnZW50Q2hhdFNpZ25hbC50b1NwYXduRXZlbnQoc2lnbmFsKTtcblx0XHRpZiAoc3Bhd24pIHtcblx0XHRcdHRoaXMuX29uRGlkU3Bhd25DaGF0LmZpcmUoc3Bhd24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xhc3RTZXNzaW9uU3luY0VuYWJsZWQ6IGJvb2xlYW4gPSB0aGlzLl9pc1Nlc3Npb25TeW5jRW5hYmxlZCgpO1xuXHRwcml2YXRlIF9sYXN0UnViYmVyRHVja0VuYWJsZWQ6IGJvb2xlYW4gPSB0aGlzLl9pc1J1YmJlckR1Y2tFbmFibGVkKCk7XG5cdHByaXZhdGUgX2xhc3RDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nOiBDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nID0gdGhpcy5fZ2V0Q29waWxvdFNka0xvZ0xldmVsU2V0dGluZygpO1xuXHRwcml2YXRlIF9sYXN0RW50ZXJwcmlzZUhvc3Q6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRoaXMuX2dldEVudGVycHJpc2VIb3N0KCk7XG5cdHByaXZhdGUgX2xhc3RTeXN0ZW1Qcm94eUVuYWJsZWQ6IGJvb2xlYW4gPSB0aGlzLl9pc1N5c3RlbVByb3h5RW5hYmxlZCgpO1xuXG5cdHByaXZhdGUgX2lzU2Vzc2lvblN5bmNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXkpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNSdWJiZXJEdWNrRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIENvcGlsb3RDbGlDb25maWdLZXkuUnViYmVyRHVjaykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nKCk6IENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5Db3BpbG90U2RrTG9nTGV2ZWwpID8/ICdpbmZvJztcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDb3BpbG90U2RrTG9nTGV2ZWwoY29uZmlndXJlZDogQ29waWxvdFNka0xvZ0xldmVsU2V0dGluZyk6IE5vbk51bGxhYmxlPENvcGlsb3RDbGllbnRPcHRpb25zWydsb2dMZXZlbCddPiB7XG5cdFx0cmV0dXJuIGNvbmZpZ3VyZWQgPT09ICd0cmFjZScgfHwgdGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSA/ICdhbGwnIDogJ2luZm8nO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RW50ZXJwcmlzZUhvc3QoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldEVudGVycHJpc2VIb3N0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1ByZWZlckxvbmdDb250ZXh0RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0UHJlZmVyTG9uZ0NvbnRleHRFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzU3lzdGVtUHJveHlFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRDb25maWdLZXkpICE9PSBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0YXJ0cyB0aGUgQ0xJIGNsaWVudCB3aGVuIGEgY29uZmlnIHZhbHVlIHRoYXQgaXMgb25seSByZWFkIGF0IGNsaWVudFxuXHQgKiBzdGFydHVwIGhhcyBjaGFuZ2VkLiBUaGUgcmVzdGFydCBpcyBkZWZlcnJlZCB3aGlsZSBhbnkgY2hhdCBoYXMgYW5cblx0ICogaW4tZmxpZ2h0IHR1cm4gXHUyMDE0IHNlZSB7QGxpbmsgX3JlcXVlc3RDbGllbnRSZXN0YXJ0fSBcdTIwMTQgc28gdGhlIG5ldyB2YWx1ZXMgYXJlXG5cdCAqIHBpY2tlZCB1cCBhdCB0aGUgbmV4dCBxdWlldCBwb2ludCByYXRoZXIgdGhhbiBieSBraWxsaW5nIGxpdmUgd29yay5cblx0ICogQW4gaW4tZmxpZ2h0IHN0YXJ0IGFib3J0cyBpZiBhbnkgc3RhcnR1cCB2YWx1ZSBjaGFuZ2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzdGFydENsaWVudElmU3RhcnR1cENvbmZpZ0NoYW5nZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN5bmMgPSB0aGlzLl9pc1Nlc3Npb25TeW5jRW5hYmxlZCgpO1xuXHRcdGNvbnN0IHJ1YmJlckR1Y2sgPSB0aGlzLl9pc1J1YmJlckR1Y2tFbmFibGVkKCk7XG5cdFx0Y29uc3QgY29waWxvdFNka0xvZ0xldmVsU2V0dGluZyA9IHRoaXMuX2dldENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcoKTtcblx0XHRjb25zdCBlbnRlcnByaXNlSG9zdCA9IHRoaXMuX2dldEVudGVycHJpc2VIb3N0KCk7XG5cdFx0Y29uc3Qgc3lzdGVtUHJveHlFbmFibGVkID0gdGhpcy5faXNTeXN0ZW1Qcm94eUVuYWJsZWQoKTtcblx0XHRpZiAodGhpcy5fbGFzdFNlc3Npb25TeW5jRW5hYmxlZCA9PT0gc2Vzc2lvblN5bmMgJiYgdGhpcy5fbGFzdFJ1YmJlckR1Y2tFbmFibGVkID09PSBydWJiZXJEdWNrICYmIHRoaXMuX2xhc3RDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nID09PSBjb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nICYmIHRoaXMuX2xhc3RFbnRlcnByaXNlSG9zdCA9PT0gZW50ZXJwcmlzZUhvc3QgJiYgdGhpcy5fbGFzdFN5c3RlbVByb3h5RW5hYmxlZCA9PT0gc3lzdGVtUHJveHlFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYW5nZWQgPSBbXG5cdFx0XHR0aGlzLl9sYXN0U2Vzc2lvblN5bmNFbmFibGVkICE9PSBzZXNzaW9uU3luYyA/IGBzZXNzaW9uU3luYz0ke3Nlc3Npb25TeW5jfWAgOiB1bmRlZmluZWQsXG5cdFx0XHR0aGlzLl9sYXN0UnViYmVyRHVja0VuYWJsZWQgIT09IHJ1YmJlckR1Y2sgPyBgcnViYmVyRHVjaz0ke3J1YmJlckR1Y2t9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuX2xhc3RDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nICE9PSBjb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nID8gYGNvcGlsb3RTZGtMb2dMZXZlbD0ke2NvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmd9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuX2xhc3RFbnRlcnByaXNlSG9zdCAhPT0gZW50ZXJwcmlzZUhvc3QgPyBgZW50ZXJwcmlzZUhvc3Q9JHtlbnRlcnByaXNlSG9zdH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5fbGFzdFN5c3RlbVByb3h5RW5hYmxlZCAhPT0gc3lzdGVtUHJveHlFbmFibGVkID8gYHN5c3RlbVByb3h5PSR7c3lzdGVtUHJveHlFbmFibGVkfWAgOiB1bmRlZmluZWQsXG5cdFx0XS5maWx0ZXIoKHYpOiB2IGlzIHN0cmluZyA9PiB2ICE9PSB1bmRlZmluZWQpLmpvaW4oJywgJyk7XG5cdFx0dGhpcy5fbGFzdFNlc3Npb25TeW5jRW5hYmxlZCA9IHNlc3Npb25TeW5jO1xuXHRcdHRoaXMuX2xhc3RSdWJiZXJEdWNrRW5hYmxlZCA9IHJ1YmJlckR1Y2s7XG5cdFx0dGhpcy5fbGFzdENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcgPSBjb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nO1xuXHRcdHRoaXMuX2xhc3RFbnRlcnByaXNlSG9zdCA9IGVudGVycHJpc2VIb3N0O1xuXHRcdHRoaXMuX2xhc3RTeXN0ZW1Qcm94eUVuYWJsZWQgPSBzeXN0ZW1Qcm94eUVuYWJsZWQ7XG5cdFx0YXdhaXQgdGhpcy5fcmVxdWVzdENsaWVudFJlc3RhcnQoYHN0YXJ0dXAgY29uZmlnIGNoYW5nZWQ6ICR7Y2hhbmdlZH1gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXF1ZXN0cyBhIENMSSBjbGllbnQgcmVzdGFydCwgcnVubmluZyBpdCBpbW1lZGlhdGVseSB3aGVuIGV2ZXJ5IGNoYXQgaXNcblx0ICogaWRsZSBhbmQgb3RoZXJ3aXNlIHBhcmtpbmcgaXQgdW50aWwgdGhlIGxhc3QgaW4tZmxpZ2h0IHR1cm4gZW5kcy5cblx0ICpcblx0ICogUmVzdGFydGluZyB0ZWFycyB0aGUgU0RLIHNlc3Npb25zIGRvd24sIGFuZCBhIHRvcm4tZG93biBzZXNzaW9uIHN0b3BzXG5cdCAqIHByb2R1Y2luZyB0aGUgZXZlbnRzIHRoYXQgZmluYWxpemUgaXRzIHByb3RvY29sIHR1cm4gXHUyMDE0IHRoZSBjbGllbnQgd291bGRcblx0ICogYmUgbGVmdCB3aXRoIGEgdHVybiB0aGF0IG5ldmVyIGNvbXBsZXRlcywgY2FuY2Vscywgb3IgZXJyb3JzLCBpLmUuIGFcblx0ICogc2Vzc2lvbiB0aGF0IHNwaW5zIGZvcmV2ZXIuIFN0YXJ0dXAtb25seSB2YWx1ZXMgKHNlc3Npb24gc3luYywgdGhlIFNES1xuXHQgKiBsb2cgbGV2ZWwsIHRoZSBlbnRlcnByaXNlIGhvc3QsIHRoZSBzeXN0ZW0gcHJveHkpIGNhbiBhbHNvIGNoYW5nZSB3aXRob3V0XG5cdCAqIGFueSB1c2VyIGFjdGlvbiwgZnJvbSBhbiBleHBlcmltZW50IG9yIHBvbGljeSByZWZyZXNoLCBzbyB0aGlzIG11c3QgbmV2ZXJcblx0ICogYmUgcGFpZCBmb3Igd2l0aCBhIHJ1bm5pbmcgdHVybi4gVGhlIHZhbHVlcyBhcmUgcmVhZCBmcmVzaCBieVxuXHQgKiB7QGxpbmsgX2Vuc3VyZUNsaWVudH0gb24gdGhlIG5leHQgc3RhcnQsIHNvIGFwcGx5aW5nIHRoZSByZXN0YXJ0IGxhdGUgaXNcblx0ICogYWx3YXlzIGNvcnJlY3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXF1ZXN0Q2xpZW50UmVzdGFydChyZWFzb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zaHV0ZG93blByb21pc2UgfHwgIXRoaXMuX2NsaWVudCkge1xuXHRcdFx0Ly8gTm90aGluZyBydW5uaW5nIHRvIHJlc3RhcnQ6IHRoZSBuZXh0IGBfZW5zdXJlQ2xpZW50YCBzdGFydHMgZnJvbVxuXHRcdFx0Ly8gdGhlIGN1cnJlbnQgdmFsdWVzIGFueXdheS5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zLmFkZChyZWFzb24pO1xuXHRcdGNvbnN0IGJ1c3lDaGF0cyA9IHRoaXMuX2NoYXRzV2l0aEFjdGl2ZVR1cm4oKTtcblx0XHRpZiAoYnVzeUNoYXRzID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gRGVmZXJyaW5nIENvcGlsb3RDbGllbnQgcmVzdGFydCAoJHtyZWFzb259KSB1bnRpbCAke2J1c3lDaGF0c30gaW4tZmxpZ2h0IHR1cm4ocykgZmluaXNoYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FwcGx5UGVuZGluZ0NsaWVudFJlc3RhcnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSdW5zIGEgcmVzdGFydCBwYXJrZWQgYnkge0BsaW5rIF9yZXF1ZXN0Q2xpZW50UmVzdGFydH0gb25jZSBubyBjaGF0IGhhc1xuXHQgKiBhbiBpbi1mbGlnaHQgdHVybi4gTm8tb3Agd2hpbGUgYW55IHR1cm4gaXMgc3RpbGwgcnVubmluZzsgdGhlIG5leHQgY2hhdFxuXHQgKiB0byBnbyBpZGxlIGRyaXZlcyB0aGlzIGFnYWluLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlQZW5kaW5nQ2xpZW50UmVzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zLnNpemUgPT09IDAgfHwgdGhpcy5fc2h1dGRvd25Qcm9taXNlIHx8ICF0aGlzLl9jbGllbnQgfHwgdGhpcy5fY2hhdHNXaXRoQWN0aXZlVHVybigpID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWFzb24gPSBbLi4udGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zXS5qb2luKCc7ICcpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFJlc3RhcnRpbmcgQ29waWxvdENsaWVudCAoJHtyZWFzb259KWApO1xuXHRcdHRoaXMuX3Nlc3Npb25zLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdHRoaXMuX21jcE5vdGlmaWNhdGlvblN1YnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcENsaWVudCgpO1xuXHRcdC8vIFRoZSBtb2RlbCBsaXN0IGNhbWUgZnJvbSB0aGUgc3VicHJvY2VzcyB3ZSBqdXN0IHRvcmUgZG93biwgYW5kIHRoZVxuXHRcdC8vIHJlcGxhY2VtZW50IG1heSBiZSBwb2ludGVkIGF0IGEgZGlmZmVyZW50IENBUEkgZW5kcG9pbnQgZW50aXJlbHlcblx0XHQvLyAoYENPUElMT1RfR0hfSE9TVGAgcm91dGVzIHRocm91Z2ggdGhpcyBzYW1lIGhlbHBlcikuIFJlLWVudW1lcmF0ZVxuXHRcdC8vIHJhdGhlciB0aGFuIHNlcnZpbmcgdGhlIG9sZCBjbGllbnQncyBjYXRhbG9nIHVudGlsIHRoZSBuZXh0IHRva2VuXG5cdFx0Ly8gY2hhbmdlLiBOb3QgaG9va2VkIGluIGBfZW5zdXJlQ2xpZW50YCwgc2luY2UgYF9saXN0TW9kZWxzYCBjYWxsc1xuXHRcdC8vIGl0IGFuZCB3b3VsZCByZWN1cnNlLlxuXHRcdHRoaXMuX2NhcGlNb2RlbHMgPSBbXTtcblx0XHR0aGlzLl9wdWJsaXNoTW9kZWxzKCk7XG5cdFx0dm9pZCB0aGlzLl9zY2hlZHVsZU1vZGVsUmVmcmVzaCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBieSBhIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufSB3aGVuIGl0cyB0dXJuIGVuZHMuIFNjaGVkdWxlZCBvZmZcblx0ICogdGhlIGN1cnJlbnQgc3RhY2sgYmVjYXVzZSB0aGUgY2FsbGJhY2sgZmlyZXMgZnJvbSBpbnNpZGUgdGhhdCBzZXNzaW9uJ3Ncblx0ICogU0RLIGV2ZW50IGhhbmRsaW5nIGFuZCB0aGUgcmVzdGFydCBkaXNwb3NlcyB0aGUgc2Vzc2lvbiBtYWtpbmcgdGhlIGNhbGwuXG5cdCAqL1xuXHRwcml2YXRlIF9vbkNoYXRUdXJuRW5kZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdDbGllbnRSZXN0YXJ0UmVhc29ucy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5UGVuZGluZ0NsaWVudFJlc3RhcnQoKS5jYXRjaChlcnIgPT5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0NvcGlsb3RdIEZhaWxlZCB0byBhcHBseSBkZWZlcnJlZCBjbGllbnQgcmVzdGFydCcsIGVycilcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKiogTnVtYmVyIG9mIGxpdmUgY2hhdHMgKGRlZmF1bHQgb3IgcGVlciwgYWNyb3NzIGFsbCBzZXNzaW9ucykgd2l0aCBhbiBpbi1mbGlnaHQgdHVybi4gKi9cblx0cHJpdmF0ZSBfY2hhdHNXaXRoQWN0aXZlVHVybigpOiBudW1iZXIge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBbLCBlbnRyeV0gb2YgdGhpcy5fc2Vzc2lvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgY2hhdFNlc3Npb24gb2YgZW50cnkuYWxsQ2hhdFNlc3Npb25zKCkpIHtcblx0XHRcdFx0aWYgKGNoYXRTZXNzaW9uLmhhc0FjdGl2ZVR1cm4pIHtcblx0XHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb3VudDtcblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlQ29waWxvdENsaWVudChvcHRpb25zOiBDb3BpbG90Q2xpZW50T3B0aW9ucyk6IENvcGlsb3RDbGllbnQge1xuXHRcdHJldHVybiBuZXcgQ29waWxvdENsaWVudChvcHRpb25zKTtcblx0fVxuXG5cdC8vIC0tLS0gYXV0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRnZXREZXNjcmlwdG9yKCk6IElBZ2VudERlc2NyaXB0b3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDb3BpbG90Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdEFnZW50LmRlc2NyaXB0aW9uJywgXCJDb3BpbG90IFNESyBhZ2VudCBydW5uaW5nIGluIHRoZSBsb2NhbCBhZ2VudCBob3N0IHByb2Nlc3NcIiksXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0bXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlLCBzaWRlQ2hhdDogdHJ1ZSB9LFxuXHRcdFx0XHQuLi4odGhpcy5faXNNdWx0aVJvb3RFbmFibGVkKCkgPyB7IG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzOiB7IGltbXV0YWJsZVByaW1hcnk6IHRydWUgfSB9IDoge30pLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNNdWx0aVJvb3RFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWU7XG5cdH1cblxuXHRnZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YVtdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLFxuXHRcdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldFJlcG9SZXNvdXJjZSgpLFxuXHRcdF07XG5cdH1cblxuXHRhc3luYyBnZXROZXR3b3JrRGlhZ25vc3RpY3NFbmRwb2ludHMoKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRIb3N0TmV0d29ya0VuZHBvaW50W10+IHtcblx0XHRsZXQgY2FwaVVybCA9IHByb2Nlc3MuZW52WydWU0NPREVfQUdFTlRfSE9TVF9DQVBJX1VSTF9PVkVSUklERSddIHx8IENPUElMT1RfQ0FQSV9VUkw7XG5cdFx0aWYgKHRoaXMuX2dpdGh1YlRva2VuKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjYXBpVXJsID0gYXdhaXQgdGhpcy5fY29waWxvdEFwaVNlcnZpY2UucmVzb2x2ZUFwaUVuZHBvaW50KHRoaXMuX2dpdGh1YlRva2VuKSB8fCBjYXBpVXJsO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0NvcGlsb3RdIENBUEkgZW5kcG9pbnQgZGlzY292ZXJ5IGZvciBuZXR3b3JrIGRpYWdub3N0aWNzIGZhaWxlZDsgdXNpbmcgJHtjYXBpVXJsfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGNhcGlQaW5nVXJsID0gbmV3IFVSTChjYXBpVXJsKTtcblx0XHRjYXBpUGluZ1VybC5wYXRobmFtZSA9IGAke2NhcGlQaW5nVXJsLnBhdGhuYW1lLnJlcGxhY2UoL1xcLyQvLCAnJyl9L19waW5nYDtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyBuYW1lOiAnR2l0SHViIEFQSScsIHVybDogdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldEFwaUJhc2VVcmkoKSB9LFxuXHRcdFx0eyBuYW1lOiAnQ29waWxvdCBBUEkgKENBUEkpJywgdXJsOiBjYXBpUGluZ1VybC50b1N0cmluZygpIH0sXG5cdFx0XTtcblx0fVxuXG5cdGFzeW5jIGdldE5ldHdvcmtEaWFnbm9zdGljc0FjY291bnQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2l0aHViVG9rZW4gPyB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5yZXNvbHZlVXNlckxvZ2luPy4odGhpcy5fZ2l0aHViVG9rZW4pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MoKTogUHJvbWlzZTxJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU25hcHNob3Q+IHtcblx0XHRjb25zdCBub2RlTW9kdWxlc1VyaSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKGdldEFwcE5vZGVNb2R1bGVzUGF0aCgpKTtcblx0XHRjb25zdCBjbGlQYXRoID0gYXdhaXQgcmVzb2x2ZUNvcGlsb3RDbGlQYXRoKG5vZGVNb2R1bGVzVXJpKTtcblx0XHRjb25zdCBydW50aW1lU2RrUGF0aCA9IGpvaW4oZGlybmFtZShjbGlQYXRoKSwgJ3NkaycsICdpbmRleC5qcycpO1xuXHRcdGlmICghYXdhaXQgZmlsZUV4aXN0cyhydW50aW1lU2RrUGF0aCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29waWxvdCBydW50aW1lIFNESyBub3QgZm91bmQgYXQgJHtydW50aW1lU2RrUGF0aH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcnVudGltZVNkazogdW5rbm93biA9IGF3YWl0IGltcG9ydChwYXRoVG9GaWxlVVJMKHJ1bnRpbWVTZGtQYXRoKS5ocmVmKTtcblx0XHRpZiAoIWlzQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NTZGsocnVudGltZVNkaykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29waWxvdCBydW50aW1lIFNESyBkb2VzIG5vdCBleHBvc2UgZ2V0TWFuYWdlZFNldHRpbmdzKCknKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRlcnByaXNlSG9zdCA9IHRoaXMuX2dldEVudGVycHJpc2VIb3N0KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVudGltZVNkay5nZXRNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0Li4uKHRoaXMuX2dpdGh1YlRva2VuID8geyB0b2tlbjogdGhpcy5fZ2l0aHViVG9rZW4gfSA6IHt9KSxcblx0XHRcdC4uLihlbnRlcnByaXNlSG9zdCA/IHsgaG9zdDogZW50ZXJwcmlzZUhvc3QgfSA6IHt9KSxcblx0XHR9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucmVzdWx0LnJlc29sdmVkLFxuXHRcdFx0Li4uKHJlc3VsdC5hY2NvdW50ID8geyBhY2NvdW50OiByZXN1bHQuYWNjb3VudCB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRnZXRDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9wbHVnaW5zLmdldENvbmZpZ3VyZWRIb3N0Q3VzdG9taXphdGlvbnMoKTtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IGFuY2hvcnMgPSBhd2FpdCB0aGlzLl9nZXRTZXNzaW9uQ3VzdG9taXphdGlvbkFuY2hvcnMoc2Vzc2lvbik7XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgYW5jaG9ycy5kaXJlY3RvcnkpO1xuXHRcdGlmIChhbmNob3JzLmFwcGx5QWRkaXRpb25hbCkge1xuXHRcdFx0Ly8gUHJvdmlzaW9uYWwgKHByZS1zZW5kKSBvciBwcmUtcmVzdW1lOiB0aGUgYW5jaG9ycyBjYXJyeSB0aGUgZnVsbCBvcmRlcmVkXG5cdFx0XHQvLyByb290IHNldCwgc28gYW5jaG9yIGRpc2NvdmVyeSB0byBldmVyeSByb290IGluc3RlYWQgb2YgY2FjaGluZyBhXG5cdFx0XHQvLyBwcmltYXJ5LW9ubHkgZW50cnkuIFNraXBwZWQgZm9yIGEgbGl2ZSBzZXNzaW9uIChpdHMgdGFpbCBpcyBhbHJlYWR5IHNldFxuXHRcdFx0Ly8gYnkgbWF0ZXJpYWxpemUvcmVzdW1lIFx1MjAxNCBkbyBub3QgY2xvYmJlciBpdCkuXG5cdFx0XHRhY3RpdmVDbGllbnQucGx1Z2luQ29udHJvbGxlci5zZXRBZGRpdGlvbmFsRGlyZWN0b3JpZXMoYW5jaG9ycy5hZGRpdGlvbmFsRGlyZWN0b3JpZXMpO1xuXHRcdH1cblx0XHRjb25zdCBmcm9tUGx1Z2lucyA9IGF3YWl0IGFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLmdldEN1c3RvbWl6YXRpb25zU2V0dGxlZCgpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgdG9wTGV2ZWxNY3AgPSBlbnRyeT8udG9wTGV2ZWxNY3BDdXN0b21pemF0aW9ucygpID8/IFtdO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gWy4uLmZyb21QbHVnaW5zLCAuLi50b3BMZXZlbE1jcF07XG5cdFx0Y29uc3QgZGVzaXJlZCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8uY3VzdG9taXphdGlvbnMgPz8gW107XG5cdFx0cmV0dXJuIGFwcGx5TWNwU2VydmVyRW5hYmxlbWVudChjdXN0b21pemF0aW9ucywgZGVzaXJlZCk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVNY3BSZXF1ZXN0KHNlc3Npb246IFVSSSwgc2VydmVyTmFtZTogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNZXRob2Qgbm90IGZvdW5kOiBubyBhY3RpdmUgc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJ5LmhhbmRsZU1jcFJlcXVlc3Qoc2VydmVyTmFtZSwgbWV0aG9kLCBwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgc3RhcnRNY3BTZXJ2ZXIoc2Vzc2lvbjogVVJJLCBpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk/LnN0YXJ0TWNwU2VydmVyKGlkKTtcblx0fVxuXG5cdGFzeW5jIHN0b3BNY3BTZXJ2ZXIoc2Vzc2lvbjogVVJJLCBpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk/LnN0b3BNY3BTZXJ2ZXIoaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBnYXRlZCBhZGRpdGlvbmFsIChub24tcHJpbWFyeSkgY3VzdG9taXphdGlvbiByb290cyBmb3IgYSBzZXNzaW9uOiB0aGVcblx0ICogdGFpbCBvZiB0aGUgb3JkZXJlZCB3b3JraW5nLWRpcmVjdG9yeSBzZXQgd2hlbiBtdWx0aS1yb290IGlzIGVuYWJsZWQsIGVsc2Vcblx0ICogZW1wdHkgKHNvIHNpbmdsZS1yb290IC8gZmxhZy1vZmYgaXMgYnl0ZS1pZGVudGljYWwpLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWRkaXRpb25hbEN1c3RvbWl6YXRpb25EaXJlY3Rvcmllcyh3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogcmVhZG9ubHkgVVJJW10ge1xuXHRcdGlmICghdGhpcy5faXNNdWx0aVJvb3RFbmFibGVkKCkgfHwgIXdvcmtpbmdEaXJlY3RvcmllcyB8fCB3b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHdvcmtpbmdEaXJlY3Rvcmllcy5zbGljZSgxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgY3VzdG9taXphdGlvbiBhbmNob3IocykgZm9yIGEgc2Vzc2lvbi4gYGRpcmVjdG9yeWAgaXMgdGhlXG5cdCAqIHByaW1hcnkgKGluZGV4IDApIGFuY2hvciBcdTIwMTQgdGhlIHdvcmt0cmVlIGZvciB3b3JrdHJlZS1pc29sYXRlZCBzZXNzaW9ucy5cblx0ICogYGFkZGl0aW9uYWxEaXJlY3Rvcmllc2AgYXJlIHRoZSBub24tcHJpbWFyeSByb290cyB0byBhdHRhY2ggdG8gZGlzY292ZXJ5LFxuXHQgKiBhbmQgYXJlIGFwcGxpZWQgb25seSB3aGVuIGBhcHBseUFkZGl0aW9uYWxgIGlzIHRydWU6XG5cdCAqIC0gKipwcm92aXNpb25hbCoqIChwcmUtc2VuZCkgc2Vzc2lvbnMgY2FycnkgdGhlIGNsaWVudC1zdXBwbGllZCBzZXQsIHdob3NlXG5cdCAqICAgbm9uLXByaW1hcnkgZm9sZGVycyBhcmUgc3RhYmxlIHdvcmtzcGFjZSBmb2xkZXJzIHRoYXQgY2FuIGJlIGRpc2NvdmVyZWRcblx0ICogICBpbW1lZGlhdGVseSAodGhlIHdvcmt0cmVlLCBpZiBhbnksIG9ubHkgYWZmZWN0cyBpbmRleCAwIGF0IHNlbmQpO1xuXHQgKiAtICoqbm90LXlldC1saXZlKiogc2Vzc2lvbnMgY2FycnkgdGhlIHBlcnNpc3RlZCBzZXQgZnJvbSBtZXRhZGF0YTtcblx0ICogLSAqKmxpdmUqKiAoYWN0aXZlKSBzZXNzaW9ucyBtYW5hZ2UgdGhlaXIgb3duIHRhaWwgdmlhIG1hdGVyaWFsaXplL3Jlc3VtZSxcblx0ICogICBzbyBgYXBwbHlBZGRpdGlvbmFsYCBpcyBmYWxzZSB0byBhdm9pZCBjbG9iYmVyaW5nIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25BbmNob3JzKHNlc3Npb246IFVSSSk6IFByb21pc2U8eyByZWFkb25seSBkaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgYWRkaXRpb25hbERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXTsgcmVhZG9ubHkgYXBwbHlBZGRpdGlvbmFsOiBib29sZWFuIH0+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgcHJvdmlzaW9uYWwgPSB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChwcm92aXNpb25hbCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlyZWN0b3J5OiBwcm92aXNpb25hbC53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHRoaXMuX2FkZGl0aW9uYWxDdXN0b21pemF0aW9uRGlyZWN0b3JpZXMocHJvdmlzaW9uYWwud29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdFx0YXBwbHlBZGRpdGlvbmFsOiB0cnVlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0Ly8gRm9yIG5vbi1wcm92aXNpb25hbCBzZXNzaW9ucyB0aGUgYW5jaG9yIGZvbGxvd3MgdGhlIHdvcmtpbmcgZGlyZWN0b3J5XG5cdFx0XHQvLyAodGhlIHdvcmt0cmVlKS4gUHJlZmVyIGl0IG92ZXIgYSBwZXJzaXN0ZWQgYGN1c3RvbWl6YXRpb25EaXJlY3RvcnlgLFxuXHRcdFx0Ly8gd2hpY2ggb2xkZXIgc2Vzc2lvbnMgc3RvcmVkIGFzIHRoZSBvcmlnaW5hbCB1c2VyLXBpY2tlZCBmb2xkZXIuXG5cdFx0XHRyZXR1cm4geyBkaXJlY3Rvcnk6IGVudHJ5LmN1c3RvbWl6YXRpb25EaXJlY3RvcnksIGFkZGl0aW9uYWxEaXJlY3RvcmllczogW10sIGFwcGx5QWRkaXRpb25hbDogZmFsc2UgfTtcblx0XHR9XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLl9yZWFkU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb24pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXJlY3Rvcnk6IG1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcnkgPz8gbWV0YWRhdGEuY3VzdG9taXphdGlvbkRpcmVjdG9yeSxcblx0XHRcdGFkZGl0aW9uYWxEaXJlY3RvcmllczogdGhpcy5fYWRkaXRpb25hbEN1c3RvbWl6YXRpb25EaXJlY3RvcmllcyhtZXRhZGF0YS53b3JraW5nRGlyZWN0b3JpZXMpLFxuXHRcdFx0YXBwbHlBZGRpdGlvbmFsOiB0cnVlLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBhdXRoZW50aWNhdGUocmVzb3VyY2U6IHN0cmluZywgdG9rZW46IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChyZXNvdXJjZSA9PT0gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldFJlcG9SZXNvdXJjZSgpLnJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHJlc291cmNlICE9PSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCkucmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW5DaGFuZ2VkID0gdGhpcy5fZ2l0aHViVG9rZW4gIT09IHRva2VuO1xuXHRcdHRoaXMuX2dpdGh1YlRva2VuID0gdG9rZW47XG5cdFx0dGhpcy5fdXBkYXRlUmVzdHJpY3RlZFRlbGVtZXRyeSh0b2tlbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQXV0aCB0b2tlbiAke3Rva2VuQ2hhbmdlZCA/ICd1cGRhdGVkJyA6ICd1bmNoYW5nZWQnfWApO1xuXHRcdGlmICh0b2tlbkNoYW5nZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc3RhcnRDbGllbnRJZlByb3h5Q2hhbmdlZCgpO1xuXHRcdFx0dm9pZCB0aGlzLl9zY2hlZHVsZU1vZGVsUmVmcmVzaCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZUF1dGhlbnRpY2F0aW9uVG9rZW4ocGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgaGFuZGxlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgWywgZW50cnldIG9mIHRoaXMuX3Nlc3Npb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgZW50cnkuYWxsQ2hhdFNlc3Npb25zKCkpIHtcblx0XHRcdFx0Y29uc3QgZGlkSGFuZGxlID0gYXdhaXQgc2Vzc2lvbi5yZXNvbHZlTWNwQXV0aGVudGljYXRpb24ocGFyYW1zKTtcblx0XHRcdFx0aGFuZGxlZCB8fD0gZGlkSGFuZGxlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGFuZGxlZDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlc3RyaWN0ZWRUZWxlbWV0cnkoZ2l0aHViVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdC8vIFNhZmUgZGVmYXVsdCBzeW5jaHJvbm91c2x5OiBrZWVwIHJlc3RyaWN0ZWQvZW5oYW5jZWQgdGVsZW1ldHJ5IGRpc2FibGVkIHVudGlsIHRoZSBtaW50ZWRcblx0XHQvLyBDQVBJIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbiBjb25maXJtcyB0aGUgYHJ0PTFgIG9wdC1pbi4gVGhlIEdpdEh1YiB0b2tlbiBoZXJlIGNhcnJpZXMgbm9cblx0XHQvLyBgcnRgL2B0aWRgIGNsYWltcyBcdTIwMTQgdGhvc2UgbGl2ZSBpbiB0aGUgQ29waWxvdCBzZXNzaW9uIHRva2VuLCB3aGljaCB0aGUgQVBJIHNlcnZpY2UgbWludHMgXHUyMDE0XG5cdFx0Ly8gc28gdGhlIHJlYWwgdmFsdWVzIGFyZSByZXNvbHZlZCBhc3luY2hyb25vdXNseSBiZWxvdy4gTWlycm9ycyBob3cgdGhlIENvcGlsb3QgZXh0ZW5zaW9uXG5cdFx0Ly8gcmVhZHMgYHJ0YC9gdGlkYCBvZmYgaXRzIGBDb3BpbG90VG9rZW5gIHJhdGhlciB0aGFuIHRoZSBHaXRIdWIgdG9rZW4uXG5cdFx0dGhpcy5fYXBwbHlSZXN0cmljdGVkVGVsZW1ldHJ5KHVuZGVmaW5lZCk7XG5cdFx0aWYgKGdpdGh1YlRva2VuKSB7XG5cdFx0XHR2b2lkIHRoaXMuX3Jlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5KGdpdGh1YlRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeShnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN0eCA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dChnaXRodWJUb2tlbik7XG5cdFx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4gIT09IGdpdGh1YlRva2VuKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gdG9rZW4gY2hhbmdlZCB3aGlsZSByZXNvbHZpbmc7IGEgbmV3ZXIgY2FsbCBvd25zIHRoZSBzdGF0ZVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYXBwbHlSZXN0cmljdGVkVGVsZW1ldHJ5KHtcblx0XHRcdFx0Li4uY3R4LFxuXHRcdFx0XHR0ZWxlbWV0cnlFbmRwb2ludDogdG9SZXN0cmljdGVkVGVsZW1ldHJ5RW5kcG9pbnQoY3R4LnRlbGVtZXRyeUVuZHBvaW50KSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0NvcGlsb3RdIFJlc3RyaWN0ZWQgdGVsZW1ldHJ5IHJlc29sdXRpb24gZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVJlc3RyaWN0ZWRUZWxlbWV0cnkoY29udGV4dDogSVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcnRFbmFibGVkID0gY29udGV4dD8ucmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQgPT09IHRydWU7XG5cdFx0aWYgKHJ0RW5hYmxlZCAhPT0gdGhpcy5fcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQpIHtcblx0XHRcdHRoaXMuX3Jlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkID0gcnRFbmFibGVkO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gRW5oYW5jZWQgKHJlc3RyaWN0ZWQpIHRlbGVtZXRyeSAke3J0RW5hYmxlZCA/ICdlbmFibGVkIGZvciB0aGlzIGFjY291bnQnIDogJ2Rpc2FibGVkJ31gKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzdHJpY3RlZFRlbGVtZXRyeS5maXJlKCk7XG5cdFx0fVxuXHRcdC8vIFB1c2ggdGhlIHRva2VuLWRlcml2ZWQgdGVsZW1ldHJ5IHBvbGljeS9pZGVudGl0eSB0byB0aGUgcmVzdHJpY3RlZCBzZW5kZXI6IGBydGAgZ2F0ZXNcblx0XHQvLyBlbmhhbmNlZCBHSCB0ZWxlbWV0cnkgKGtlcHQgb2ZmIGZvciBwdWJsaWMgdXNlcnMpLCBgdGlkYCBiZWNvbWVzIGBjb3BpbG90X3RyYWNraW5nSWRgLCBhbmRcblx0XHQvLyB0aGUgZW5kcG9pbnQgcm91dGVzIGF0IHRoZSB1c2VyJ3MgQ0FQSSB0ZWxlbWV0cnkgaG9zdCAoZG90Y29tLCBHSEUsIG9yIHByb3h5KS5cblx0XHRpZiAoaXNBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpKSB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnNldFJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkKHJ0RW5hYmxlZCk7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnNldENvcGlsb3RUcmFja2luZ0lkKGNvbnRleHQ/LnRyYWNraW5nSWQpO1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5zZXRSZXN0cmljdGVkVGVsZW1ldHJ5RW5kcG9pbnQoY29udGV4dD8udGVsZW1ldHJ5RW5kcG9pbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JvdXRlR2l0SHViVGVsZW1ldHJ5KG5vdGlmaWNhdGlvbjogR2l0SHViVGVsZW1ldHJ5Tm90aWZpY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWRkaXRpb25hbFByb3BlcnRpZXMgPSB7IGluaXRpYXRvckNsaWVudFR5cGU6IHRoaXMuX2NsaWVudFR5cGVGb3JUZWxlbWV0cnkobm90aWZpY2F0aW9uLnNlc3Npb25JZCkgfTtcblx0XHRjb25zdCByb3V0ZXIgPSB0aGlzLl9naXRodWJUZWxlbWV0cnlSb3V0ZXI7XG5cdFx0aWYgKCFyb3V0ZXI/LmlzVGFyZ2V0KG5vdGlmaWNhdGlvbikpIHtcblx0XHRcdHRoaXMuX2dpdEh1YlRlbGVtZXRyeUZvcndhcmRlci5mb3J3YXJkKG5vdGlmaWNhdGlvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghbm90aWZpY2F0aW9uLnJlc3RyaWN0ZWQpIHtcblx0XHRcdGF3YWl0IHJvdXRlci5yb3V0ZShub3RpZmljYXRpb24sIHVuZGVmaW5lZCwgYWRkaXRpb25hbFByb3BlcnRpZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IG5vdGlmaWNhdGlvbi5zZXNzaW9uSWQ7XG5cdFx0Y29uc3QgZ2l0aHViVG9rZW4gPSB0aGlzLl9naXRodWJUb2tlbjtcblx0XHRpZiAoIWdpdGh1YlRva2VuKSB7XG5cdFx0XHRhd2FpdCByb3V0ZXIucm91dGUobm90aWZpY2F0aW9uLCB1bmRlZmluZWQsIGFkZGl0aW9uYWxQcm9wZXJ0aWVzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dChnaXRodWJUb2tlbik7XG5cdFx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4gIT09IGdpdGh1YlRva2VuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHJvdXRlci5yb3V0ZShub3RpZmljYXRpb24sIHtcblx0XHRcdFx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGNvbnRleHQucmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQsXG5cdFx0XHRcdHRyYWNraW5nSWQ6IGNvbnRleHQudHJhY2tpbmdJZCxcblx0XHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6IHRvUmVzdHJpY3RlZFRlbGVtZXRyeUVuZHBvaW50KGNvbnRleHQudGVsZW1ldHJ5RW5kcG9pbnQpLFxuXHRcdFx0XHRpc0ludGVybmFsOiBjb250ZXh0LmlzSW50ZXJuYWwgPT09IHRydWUsXG5cdFx0XHRcdHVzZXJOYW1lOiBjb250ZXh0LnVzZXJOYW1lLFxuXHRcdFx0XHRpc1ZzY29kZVRlYW1NZW1iZXI6IGNvbnRleHQuaXNWc2NvZGVUZWFtTWVtYmVyID09PSB0cnVlLFxuXHRcdFx0fSwgYWRkaXRpb25hbFByb3BlcnRpZXMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFJlc3RyaWN0ZWQgdGVsZW1ldHJ5IGNvbnRleHQgcmVzb2x1dGlvbiBmYWlsZWQ7IGRyb3BwaW5nICR7bm90aWZpY2F0aW9uLmV2ZW50LmtpbmR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGllbnRUeXBlRm9yVGVsZW1ldHJ5KHNka1Nlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogQWdlbnRIb3N0Q2xpZW50VHlwZSB7XG5cdFx0cmV0dXJuIHNka1Nlc3Npb25JZFxuXHRcdFx0PyB0aGlzLl9zZGtTZXNzaW9uc0J5SWQuZ2V0KHNka1Nlc3Npb25JZCk/LmN1cnJlbnRUdXJuQ2xpZW50VHlwZSA/PyBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd25cblx0XHRcdDogQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duO1xuXHR9XG5cblx0LyoqXG5cdCAqIHtAbGluayBJQWdlbnQucmVmcmVzaE1vZGVsc30uIENvYWxlc2NlcyBvbnRvIGFuIGluLWZsaWdodCByZWZyZXNoIGFuZFxuXHQgKiBuZXZlciByZWplY3RzIFx1MjAxNCB7QGxpbmsgX3JlZnJlc2hNb2RlbHN9IGFscmVhZHkgbG9ncyBhbmQgcmV0YWlucyB0aGUgbGFzdFxuXHQgKiBrbm93bi1nb29kIGxpc3Qgb24gZmFpbHVyZS5cblx0ICpcblx0ICogT25seSBzYWZlIGZvciBjYWxsZXJzIHdpdGggbm8gbmV3IGlucHV0IHRvIGFwcGx5ICh0aGUgaG9zdCdzIHBlcmlvZGljXG5cdCAqIHNjaGVkdWxlcikuIFRyaWdnZXJzIHRoYXQgaW52YWxpZGF0ZSB0aGUgaW4tZmxpZ2h0IHJlcXVlc3QgXHUyMDE0IGEgcm90YXRlZFxuXHQgKiB0b2tlbiwgYSByZXN0YXJ0ZWQgY2xpZW50IFx1MjAxNCBtdXN0IGNhbGwge0BsaW5rIF9zY2hlZHVsZU1vZGVsUmVmcmVzaH0gc28gdGhleVxuXHQgKiBhcmUgbm90IGFuc3dlcmVkIGJ5IGEgcmVmcmVzaCBib3VuZCB0byB0aGUgc3VwZXJzZWRlZCBpbnB1dC5cblx0ICovXG5cdHJlZnJlc2hNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NjaGVkdWxlZE1vZGVsUmVmcmVzaD8uZGVmZXJyZWQucCA/PyB0aGlzLl9tb2RlbFJlZnJlc2hJbkZsaWdodCA/PyB0aGlzLl9zdGFydE1vZGVsUmVmcmVzaCgrK3RoaXMuX21vZGVsQ2F0YWxvZ0dlbmVyYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEludmFsaWRhdGVzIGFuIGluLWZsaWdodCByZWZyZXNoIGltbWVkaWF0ZWx5LCB0aGVuIHN0YXJ0cyBvbmUgcmVmcmVzaCBvblxuXHQgKiB0aGUgbmV4dCB0YXNrLiBSZXBlYXRlZCBsaWZlY3ljbGUgdHJpZ2dlcnMgYmVmb3JlIHRoYXQgdGFza1xuXHQgKiBzaGFyZSB0aGUgc2FtZSBkZWZlcnJlZCBhbmQgZW51bWVyYXRlIG9ubHkgdGhlIGZpbmFsIHRva2VuL2NsaWVudCBzb3VyY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9zY2hlZHVsZU1vZGVsUmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gKyt0aGlzLl9tb2RlbENhdGFsb2dHZW5lcmF0aW9uO1xuXHRcdGlmICh0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2gpIHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlZE1vZGVsUmVmcmVzaC5nZW5lcmF0aW9uID0gZ2VuZXJhdGlvbjtcblx0XHRcdHJldHVybiB0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2guZGVmZXJyZWQucDtcblx0XHR9XG5cblx0XHRjb25zdCBzY2hlZHVsZWQgPSB7IGRlZmVycmVkOiBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCksIGdlbmVyYXRpb24gfTtcblx0XHR0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2ggPSBzY2hlZHVsZWQ7XG5cdFx0dGhpcy5fbW9kZWxSZWZyZXNoU2NoZWR1bGUudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR2b2lkIChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gQSBjb25maWctdHJpZ2dlcmVkIHJlc3RhcnQgY2xlYXJzIGBfY2xpZW50YCBiZWZvcmUgaXRzXG5cdFx0XHRcdFx0Ly8gYXN5bmNocm9ub3VzIGBzdG9wKClgIGNvbXBsZXRlcy4gV2FpdCBmb3IgdGhhdCBzdG9wIHNvIHRoaXNcblx0XHRcdFx0XHQvLyByZWZyZXNoIGNhbm5vdCByZXN1cnJlY3QgdGhlIGNsaWVudCBtaWR3YXkgdGhyb3VnaCB0ZWFyZG93bi5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jbGllbnRTdG9wcGluZztcblx0XHRcdFx0XHRpZiAodGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoICE9PSBzY2hlZHVsZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaFNjaGVkdWxlLmNsZWFyKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc3RhcnRNb2RlbFJlZnJlc2goc2NoZWR1bGVkLmdlbmVyYXRpb24pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgJ1tDb3BpbG90XSBGYWlsZWQgdG8gc2NoZWR1bGUgbW9kZWwgcmVmcmVzaCcpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2ggPT09IHNjaGVkdWxlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dGhpcy5fbW9kZWxSZWZyZXNoU2NoZWR1bGUuY2xlYXIoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2NoZWR1bGVkLmRlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0fSwgMCk7XG5cdFx0cmV0dXJuIHNjaGVkdWxlZC5kZWZlcnJlZC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRNb2RlbFJlZnJlc2goZ2VuZXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVmcmVzaCA9IHRoaXMuX3JlZnJlc2hNb2RlbHMoMCwgZ2VuZXJhdGlvbikuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbW9kZWxSZWZyZXNoSW5GbGlnaHQgPT09IHJlZnJlc2gpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxSZWZyZXNoSW5GbGlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fbW9kZWxSZWZyZXNoSW5GbGlnaHQgPSByZWZyZXNoO1xuXHRcdHJldHVybiByZWZyZXNoO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hNb2RlbHMoYXR0ZW1wdCA9IDAsIGdlbmVyYXRpb24gPSB0aGlzLl9tb2RlbENhdGFsb2dHZW5lcmF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQSBmcmVzaCByZWZyZXNoIChlLmcuIGEgdG9rZW4gY2hhbmdlKSBzdXBlcnNlZGVzIGFueSBzY2hlZHVsZWQgcmV0cnkuXG5cdFx0dGhpcy5fbW9kZWxSZWZyZXNoUmV0cnkuY2xlYXIoKTtcblxuXHRcdC8vIE9uY2UgdGVhcmRvd24gaGFzIGJlZ3VuLCBza2lwIHRoZSByZWZyZXNoIGVudGlyZWx5OiBhIHJldHJ5IHRpbWVyIHRoYXRcblx0XHQvLyBmaXJlcyBkdXJpbmcgdGhlIHNodXRkb3duIHdpbmRvdyB3b3VsZCBvdGhlcndpc2UgY2FsbCBgX2Vuc3VyZUNsaWVudCgpYFxuXHRcdC8vIGFuZCByZXN1cnJlY3QgdGhlIFNESyBzdWJwcm9jZXNzIGFmdGVyIGBzaHV0ZG93bigpYCB0b3JlIGl0IGRvd24uXG5cdFx0aWYgKHRoaXMuX3NodXRkb3duUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuQXRSZWZyZXNoU3RhcnQgPSB0aGlzLl9naXRodWJUb2tlbjtcblx0XHRpZiAoIXRva2VuQXRSZWZyZXNoU3RhcnQpIHtcblx0XHRcdHRoaXMuX2NhcGlNb2RlbHMgPSBbXTtcblx0XHRcdHRoaXMuX3B1Ymxpc2hNb2RlbHMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHRoaXMuX2xpc3RNb2RlbHModG9rZW5BdFJlZnJlc2hTdGFydCk7XG5cdFx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4gPT09IHRva2VuQXRSZWZyZXNoU3RhcnQgJiYgdGhpcy5fbW9kZWxDYXRhbG9nR2VuZXJhdGlvbiA9PT0gZ2VuZXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9jYXBpTW9kZWxzID0gbW9kZWxzO1xuXHRcdFx0XHR0aGlzLl9wdWJsaXNoTW9kZWxzKCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBUb2tlbiByb3RhdGVkIG1pZC1mbGlnaHQgXHUyMDE0IGEgbmV3ZXIgcmVmcmVzaCBvd25zIHRoZSByZXN1bHQgXHUyMDE0IG9yXG5cdFx0XHQvLyB0ZWFyZG93biBiZWdhbiB3aGlsZSB0aGUgcmVxdWVzdCB3YXMgaW4gZmxpZ2h0LCBpbiB3aGljaCBjYXNlIGFcblx0XHRcdC8vIHJldHJ5IHdvdWxkIGp1c3QgcmVzdXJyZWN0IHRoZSBjbGllbnQgd2UgYXJlIHRlYXJpbmcgZG93bi5cblx0XHRcdGlmICh0aGlzLl9naXRodWJUb2tlbiAhPT0gdG9rZW5BdFJlZnJlc2hTdGFydCB8fCB0aGlzLl9tb2RlbENhdGFsb2dHZW5lcmF0aW9uICE9PSBnZW5lcmF0aW9uIHx8IHRoaXMuX3NodXRkb3duUHJvbWlzZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXR0ZW1wdCArIDEgPCB0aGlzLl9tb2RlbFJlZnJlc2hNYXhBdHRlbXB0cykge1xuXHRcdFx0XHRjb25zdCBkZWxheSA9IHRoaXMuX21vZGVsUmVmcmVzaEJhY2tvZmYoYXR0ZW1wdCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byByZWZyZXNoIG1vZGVscyAoYXR0ZW1wdCAke2F0dGVtcHQgKyAxfSksIHJldHJ5aW5nIGluICR7ZGVsYXl9bXNgLCBlcnIpO1xuXHRcdFx0XHR0aGlzLl9tb2RlbFJlZnJlc2hSZXRyeS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hNb2RlbHMoYXR0ZW1wdCArIDEsIGdlbmVyYXRpb24pO1xuXHRcdFx0XHR9LCBkZWxheSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJldHJpZXMgZXhoYXVzdGVkOiBzdXJmYWNlIHRoZSBlcnJvciBidXQga2VlcCB0aGUgbGFzdC1rbm93biBDQVBJXG5cdFx0XHQvLyBsaXN0IHNvIGEgdHJhbnNpZW50IGZhaWx1cmUgbmV2ZXIgd2lwZXMgYSBwcmV2aW91c2x5IGxvYWRlZCwgZ29vZFxuXHRcdFx0Ly8gbW9kZWwgbGlzdC4gUmVwdWJsaXNoIHNvIGEgY29uY3VycmVudGx5LXVwZGF0ZWQgQllPSyBsaXN0IHN0aWxsXG5cdFx0XHQvLyBzaG93cyB0aHJvdWdoLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsICdbQ29waWxvdF0gRmFpbGVkIHRvIHJlZnJlc2ggbW9kZWxzJyk7XG5cdFx0XHR0aGlzLl9wdWJsaXNoTW9kZWxzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWVtaXQgdGhlIG1lcmdlZCBDQVBJICsgQllPSyBtb2RlbCBsaXN0IHRvIHRoZSBwaWNrZXIuIEEgZnJlc2ggYXJyYXkgaXNcblx0ICogYWxsb2NhdGVkIGVhY2ggY2FsbCBzbyB0aGUgb2JzZXJ2YWJsZSBhbHdheXMgbm90aWZpZXMgaXRzIGNvbnN1bWVycy5cblx0ICovXG5cdHByaXZhdGUgX3B1Ymxpc2hNb2RlbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxzLnNldChbLi4udGhpcy5fY2FwaU1vZGVscywgLi4udGhpcy5fYnlva01vZGVsc10sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogKFJlKXB1Ymxpc2ggdGhlIHJlbmRlcmVyIEJZT0sgbW9kZWxzIGZyb20gdGhlIGJyaWRnZSByZWdpc3RyeSdzIHNlcnZpbmdcblx0ICogd2luZG93LiBUcmlnZ2VyZWQgd2hlbiBhbnkgcmVuZGVyZXIgYnJpZGdlIGNvbm5lY3RzLCBkaXNjb25uZWN0cywgb3Jcblx0ICogcmVwb3J0cyBhIG1vZGVsIGNoYW5nZSBcdTIwMTQgdGhlIHJlZ2lzdHJ5IG93bnMgZW51bWVyYXRpb24gKHdpdGggaXRzIG93blxuXHQgKiBjb25uZWN0LXRpbWUgcmV0cnkpIGFuZCBjYWNoZXMgdGhlIHNlcnZpbmcgd2luZG93J3MgbW9kZWxzLCBzbyB0aGlzIGlzIGFcblx0ICogY2hlYXAgc3luY2hyb25vdXMgcmVhZCBvZiB0aGF0IGNhY2hlLlxuXHQgKlxuXHQgKiBFYWNoIG1vZGVsIGlzIHN1cmZhY2VkIHVuZGVyIHRoZSBwcm92aWRlci1xdWFsaWZpZWQgaWQgYHZlbmRvci9pZGAgc28gYVxuXHQgKiBzZWxlY3Rpb24gcm91bmQtdHJpcHMgdG8gdGhlIHBlci1zZXNzaW9uIHByb3ZpZGVyIGNvbmZpZyBzeW50aGVzaXplZCBieVxuXHQgKiBgcmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnYC5cblx0ICovXG5cdHByaXZhdGUgX3JlZnJlc2hCeW9rTW9kZWxzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zaHV0ZG93blByb21pc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYnlva01vZGVscyA9IHRoaXMuX2J5b2tCcmlkZ2VSZWdpc3RyeS5nZXRNb2RlbHMoKS5tYXAoKG0pOiBJQWdlbnRNb2RlbEluZm8gPT4ge1xuXHRcdFx0Y29uc3QgYnlva01ldGEgPSBjcmVhdGVBZ2VudE1vZGVsQnlva01ldGEobS5tb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0Y29uc3Qgc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cyA9IG0uc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cz8uZmlsdGVyKGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0UmVhc29uaW5nRWZmb3J0ID0gc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cz8uZmluZChlZmZvcnQgPT4gZWZmb3J0ID09PSBtLmRlZmF1bHRSZWFzb25pbmdFZmZvcnQpID8/IHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM/LlswXTtcblx0XHRcdGNvbnN0IHRoaW5raW5nTGV2ZWwgPSB0aGlzLl9jcmVhdGVUaGlua2luZ0xldmVsQ29uZmlnU2NoZW1hUHJvcGVydHkoc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cywgZGVmYXVsdFJlYXNvbmluZ0VmZm9ydCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwcm92aWRlcjogdGhpcy5pZCxcblx0XHRcdFx0aWQ6IGAke20udmVuZG9yfS8ke20uaWR9YCxcblx0XHRcdFx0bmFtZTogbS5uYW1lID8/IG0uaWQsXG5cdFx0XHRcdG1heENvbnRleHRXaW5kb3c6IG0ubWF4Q29udGV4dFdpbmRvd1Rva2Vucyxcblx0XHRcdFx0c3VwcG9ydHNWaXNpb246IG0uc3VwcG9ydHNWaXNpb24gPz8gZmFsc2UsXG5cdFx0XHRcdC4uLih0aGlua2luZ0xldmVsID8geyBjb25maWdTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgW1RoaW5raW5nTGV2ZWxDb25maWdLZXldOiB0aGlua2luZ0xldmVsIH0gfSBzYXRpc2ZpZXMgQ29uZmlnU2NoZW1hIH0gOiB7fSksXG5cdFx0XHRcdC4uLihieW9rTWV0YSAmJiB7IF9tZXRhOiBieW9rTWV0YSB9KSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3RdIEZvdW5kICR7dGhpcy5fYnlva01vZGVscy5sZW5ndGh9IEJZT0sgbW9kZWxzJHt0aGlzLl9ieW9rTW9kZWxzLmxlbmd0aCA/ICc6ICcgKyB0aGlzLl9ieW9rTW9kZWxzLm1hcChtID0+IG0ubmFtZSkuam9pbignLCAnKSA6ICcnfWApO1xuXHRcdHRoaXMuX3B1Ymxpc2hNb2RlbHMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFcXVhbC1qaXR0ZXIgZXhwb25lbnRpYWwgYmFja29mZiBmb3IgbW9kZWwtcmVmcmVzaCByZXRyaWVzLiBEb3VibGVzIHRoZVxuXHQgKiBiYXNlIGRlbGF5IHBlciBhdHRlbXB0IChjYXBwZWQgYXQge0BsaW5rIF9tb2RlbFJlZnJlc2hNYXhEZWxheU1zfSkgYW5kXG5cdCAqIHBpY2tzIGEgcmFuZG9tIHBvaW50IGluIHRoZSB1cHBlciBoYWxmIG9mIHRoYXQgd2luZG93LCBzbyB0aGUgcmV0dXJuZWRcblx0ICogZGVsYXkgbGFuZHMgaW4gYFtleHAvMiwgZXhwXWAuIFRoZSBqaXR0ZXIgYXZvaWRzIHN5bmNocm9uaXplZCByZXRyaWVzXG5cdCAqIGFjcm9zcyB3aW5kb3dzL2FnZW50cyBoaXR0aW5nIGEgc2hhcmVkIHJhdGUgbGltaXQsIHdoaWxlIHRoZSBgZXhwLzJgXG5cdCAqIGZsb29yIGtlZXBzIGEgbWluaW11bSBzcGFjaW5nIGJldHdlZW4gYXR0ZW1wdHMuXG5cdCAqL1xuXHRwcml2YXRlIF9tb2RlbFJlZnJlc2hCYWNrb2ZmKGF0dGVtcHQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgZXhwID0gTWF0aC5taW4odGhpcy5fbW9kZWxSZWZyZXNoTWF4RGVsYXlNcywgdGhpcy5fbW9kZWxSZWZyZXNoQmFzZURlbGF5TXMgKiAyICoqIGF0dGVtcHQpO1xuXHRcdHJldHVybiBNYXRoLnJvdW5kKGV4cCAvIDIgKyBNYXRoLnJhbmRvbSgpICogKGV4cCAvIDIpKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BDbGllbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQW55IHBhcmtlZCByZXN0YXJ0IGlzIHNhdGlzZmllZCBieSB0aGlzIHN0b3A6IHRoZSBuZXh0IGBfZW5zdXJlQ2xpZW50YFxuXHRcdC8vIHN0YXJ0cyBmcm9tIHRoZSBjdXJyZW50IGNvbmZpZywgc28gbm90aGluZyBpcyBsZWZ0IHRvIHJlLWFwcGx5LiBDbGVhcmVkXG5cdFx0Ly8gc3luY2hyb25vdXNseSBzbyBhIGNvbmN1cnJlbnQgYF9hcHBseVBlbmRpbmdDbGllbnRSZXN0YXJ0YCBiYWlscyByYXRoZXJcblx0XHQvLyB0aGFuIHN0b3BwaW5nIGEgY2xpZW50IHRoaXMgY2FsbCBpcyBhbHJlYWR5IHRlYXJpbmcgZG93bi5cblx0XHR0aGlzLl9wZW5kaW5nQ2xpZW50UmVzdGFydFJlYXNvbnMuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fY2xpZW50U3RvcHBpbmcpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jbGllbnRTdG9wcGluZztcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcHBpbmcgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50U3RhcnRpbmcgPSB0aGlzLl9jbGllbnRTdGFydGluZztcblx0XHRcdGlmIChjbGllbnRTdGFydGluZykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGNsaWVudFN0YXJ0aW5nO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBBIGZhaWxlZC9zdGFsZSBzdGFydCBvd25zIGl0cyBvd24gY2xlYW51cC4gQ29udGludWUgc29cblx0XHRcdFx0XHQvLyBhbnkgY2xpZW50IGl0IG1hbmFnZWQgdG8gcHVibGlzaCBpcyBzdGlsbCBzdG9wcGVkIGJlbG93LlxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbGllbnQgPSB0aGlzLl9jbGllbnQ7XG5cdFx0XHR0aGlzLl9jbGllbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jbGllbnRTdGFydGluZyA9IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IGNsaWVudD8uc3RvcCgpO1xuXHRcdFx0Ly8gVGhlIHJ1bnRpbWUgc3VicHJvY2VzcyBpcyBub3cgZGVhZCwgc28gaXQgaXMgc2FmZSB0byByZWxlYXNlIHRoZSBCWU9LXG5cdFx0XHQvLyBwcm94eSBoYW5kbGU6IHRoZSBuZXh0IHNlc3Npb24gbGF1bmNoIG1pbnRzIGEgZnJlc2ggbm9uY2UuIFNlZSB0aGVcblx0XHRcdC8vIG93bmVyc2hpcCBpbnZhcmlhbnQgb24gYENvcGlsb3RTZXNzaW9uTGF1bmNoZXIuZGlzcG9zZUJ5b2tQcm94eUhhbmRsZWAuXG5cdFx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uTGF1bmNoZXIuZGlzcG9zZUJ5b2tQcm94eUhhbmRsZSgpO1xuXHRcdH0pKCkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY2xpZW50U3RvcHBpbmcgPT09IHN0b3BwaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2NsaWVudFN0b3BwaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2NsaWVudFN0b3BwaW5nID0gc3RvcHBpbmc7XG5cdFx0cmV0dXJuIHN0b3BwaW5nO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuYWJsZXMgcGxhbiBtb2RlIGJ5IGluamVjdGluZyBgcmVxdWVzdEV4aXRQbGFuTW9kZTogdHJ1ZWAgaW50byB0aGVcblx0ICogcGF5bG9hZCBvZiBldmVyeSBgc2Vzc2lvbi5jcmVhdGVgIC8gYHNlc3Npb24ucmVzdW1lYCBKU09OLVJQQyByZXF1ZXN0LFxuXHQgKiBhbmQgcmVnaXN0ZXJzIGEgY29ubmVjdGlvbi1sZXZlbCBoYW5kbGVyIGZvciB0aGUgcmVzdWx0aW5nXG5cdCAqIGBleGl0UGxhbk1vZGUucmVxdWVzdGAgUlBDIHRoZSBDTEkgc2VuZHMgYmFjay5cblx0ICpcblx0ICogVGhlIFNESyAoYEBnaXRodWIvY29waWxvdC1zZGtAXjAuMy4wYCkgZG9lcyBub3QgZXhwb3NlIGBvbkV4aXRQbGFuTW9kZWBcblx0ICogaW4gaXRzIHB1YmxpYyB7QGxpbmsgU2Vzc2lvbkNvbmZpZ30gc3VyZmFjZSwgc28gYm90aCB0aGUgd2lyZSBmbGFnIGFuZFxuXHQgKiB0aGUgcmVzcG9uc2UgaGFuZGxlciBhcmUgd2lyZWQgdGhyb3VnaCB0aGUgU0RLJ3MgcHJpdmF0ZVxuXHQgKiBgTWVzc2FnZUNvbm5lY3Rpb25gLiBPbmNlIHRoZSBTREsgYWRkcyBmaXJzdC1jbGFzcyBzdXBwb3J0LCB0aGlzIHNoaW1cblx0ICogc2hvdWxkIGJlIHJlbW92ZWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2VuYWJsZVBsYW5Nb2RlT25DbGllbnQoY2xpZW50OiBDb3BpbG90Q2xpZW50KTogdm9pZCB7XG5cdFx0Ly8gYGNvbm5lY3Rpb25gIGlzIGRlY2xhcmVkIHByaXZhdGUgb24gYENvcGlsb3RDbGllbnRgIGF0IHRoZSB0eXBlXG5cdFx0Ly8gbGV2ZWwgYnV0IGlzIGEgcGxhaW4gZmllbGQgYXQgcnVudGltZSBcdTIwMTQgc2VlIHRoZSBTREsncyBjb21waWxlZFxuXHRcdC8vIGBkaXN0L2NsaWVudC5qc2AuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IChjbGllbnQgYXMgdW5rbm93biBhcyB7IGNvbm5lY3Rpb24/OiBJRXhpdFBsYW5Nb2RlQ29ubmVjdGlvbiB9KS5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdF0gQ291bGQgbm90IGVuYWJsZSBwbGFuIG1vZGU6IGNsaWVudC5jb25uZWN0aW9uIGlzIG51bGwnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBjb25uZWN0aW9uLnNlbmRSZXF1ZXN0ICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBDb3VsZCBub3QgZW5hYmxlIHBsYW4gbW9kZTogY2xpZW50LmNvbm5lY3Rpb24uc2VuZFJlcXVlc3QgaXMgJHt0eXBlb2YgY29ubmVjdGlvbi5zZW5kUmVxdWVzdH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBjb25uZWN0aW9uLm9uUmVxdWVzdCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdF0gQ291bGQgbm90IGVuYWJsZSBwbGFuIG1vZGU6IGNsaWVudC5jb25uZWN0aW9uLm9uUmVxdWVzdCBpcyAke3R5cGVvZiBjb25uZWN0aW9uLm9uUmVxdWVzdH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb3JpZ2luYWxTZW5kUmVxdWVzdCA9IGNvbm5lY3Rpb24uc2VuZFJlcXVlc3QuYmluZChjb25uZWN0aW9uKTtcblx0XHRjb25uZWN0aW9uLnNlbmRSZXF1ZXN0ID0gKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24pID0+IHtcblx0XHRcdGlmICgobWV0aG9kID09PSAnc2Vzc2lvbi5jcmVhdGUnIHx8IG1ldGhvZCA9PT0gJ3Nlc3Npb24ucmVzdW1lJykgJiYgcGFyYW1zICYmIHR5cGVvZiBwYXJhbXMgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbFNlbmRSZXF1ZXN0KG1ldGhvZCwgeyAuLi5wYXJhbXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHJlcXVlc3RFeGl0UGxhbk1vZGU6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWxTZW5kUmVxdWVzdChtZXRob2QsIHBhcmFtcyk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIC0tLS0gY2xpZW50IGxpZmVjeWNsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVDbGllbnQoKTogUHJvbWlzZTxDb3BpbG90Q2xpZW50PiB7XG5cdFx0aWYgKHRoaXMuX3NodXRkb3duUHJvbWlzZSkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdHdoaWxlICh0aGlzLl9jbGllbnRTdG9wcGluZykge1xuXHRcdFx0YXdhaXQgdGhpcy5fY2xpZW50U3RvcHBpbmc7XG5cdFx0XHRpZiAodGhpcy5fc2h1dGRvd25Qcm9taXNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fY2xpZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2xpZW50O1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2xpZW50U3RhcnRpbmcpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jbGllbnRTdGFydGluZztcblx0XHR9XG5cdFx0Ly8gU25hcHNob3QgdGhlIHN0YXJ0dXAgY29uZmlnIHNvIHdlIGNhbiBkZXRlY3QgYSBjaGFuZ2UgdGhhdCBsYW5kcyB3aGlsZSB0aGVcblx0XHQvLyBjbGllbnQgaXMgc3RpbGwgc3RhcnRpbmcgYW5kIGFib3J0IHRoZSBzdGFsZSBzdGFydCAodGhlIHZhbHVlcyBhcmUgYmFrZWRcblx0XHQvLyBpbnRvIHRoZSBjbGllbnQgb3B0aW9ucyAvIHN1YnByb2Nlc3MgZW52IGJlbG93KS5cblx0XHRjb25zdCBzZXNzaW9uU3luY0F0U3RhcnR1cCA9IHRoaXMuX2lzU2Vzc2lvblN5bmNFbmFibGVkKCk7XG5cdFx0Y29uc3QgcnViYmVyRHVja0F0U3RhcnR1cCA9IHRoaXMuX2lzUnViYmVyRHVja0VuYWJsZWQoKTtcblx0XHRjb25zdCBjb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nQXRTdGFydHVwID0gdGhpcy5fZ2V0Q29waWxvdFNka0xvZ0xldmVsU2V0dGluZygpO1xuXHRcdGNvbnN0IGVudGVycHJpc2VIb3N0QXRTdGFydHVwID0gdGhpcy5fZ2V0RW50ZXJwcmlzZUhvc3QoKTtcblx0XHRjb25zdCBzeXN0ZW1Qcm94eUVuYWJsZWRBdFN0YXJ0dXAgPSB0aGlzLl9pc1N5c3RlbVByb3h5RW5hYmxlZCgpO1xuXHRcdGNvbnN0IGNsaWVudFN0YXJ0aW5nID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NvcGlsb3RdIFN0YXJ0aW5nIENvcGlsb3RDbGllbnQuLi4nKTtcblxuXHRcdFx0Ly8gQnVpbGQgYSBjbGVhbiBlbnYgZm9yIHRoZSBDTEkgc3VicHJvY2Vzcywgc3RyaXBwaW5nIEVsZWN0cm9uL1ZTIENvZGUgdmFyc1xuXHRcdFx0Ly8gdGhhdCBjYW4gaW50ZXJmZXJlIHdpdGggdGhlIE5vZGUuanMgcHJvY2VzcyB0aGUgU0RLIHNwYXducy5cblx0XHRcdGNvbnN0IGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiA9IE9iamVjdC5hc3NpZ24oe30sIHByb2Nlc3MuZW52LCB7IEVMRUNUUk9OX1JVTl9BU19OT0RFOiAnMScgfSk7XG5cdFx0XHRkZWxldGUgZW52WydOT0RFX09QVElPTlMnXTtcblx0XHRcdGRlbGV0ZSBlbnZbJ1ZTQ09ERV9JTlNQRUNUT1JfT1BUSU9OUyddO1xuXHRcdFx0ZGVsZXRlIGVudlsnVlNDT0RFX0VTTV9FTlRSWVBPSU5UJ107XG5cdFx0XHRkZWxldGUgZW52WydWU0NPREVfSEFORExFU19VTkNBVUdIVF9FUlJPUlMnXTtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGVudikpIHtcblx0XHRcdFx0aWYgKGtleSA9PT0gJ0VMRUNUUk9OX1JVTl9BU19OT0RFJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChrZXkgPT09ICdWU0NPREVfQUdFTlRfSE9TVF9DQVBJX1VSTF9PVkVSUklERScpIHtcblx0XHRcdFx0XHQvLyB1c2VkIGZvciBydW5uaW5nIHRoZSBDTEkgaW4gYSB0ZXN0IGhhcm5lc3MgYWdhaW5zdCBhIG1vY2sgQ0FQSSBzZXJ2ZXJcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgoJ1ZTQ09ERV8nKSB8fCBrZXkuc3RhcnRzV2l0aCgnRUxFQ1RST05fJykpIHtcblx0XHRcdFx0XHRkZWxldGUgZW52W2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGVudlsnQ09QSUxPVF9DTElfUlVOX0FTX05PREUnXSA9ICcxJztcblx0XHRcdGVudlsnVVNFX0JVSUxUSU5fUklQR1JFUCddID0gJ2ZhbHNlJztcblx0XHRcdGVudlsnQ09QSUxPVF9NQ1BfQVBQUyddID0gJ3RydWUnO1xuXHRcdFx0Ly8gQXR0cmlidXRlIHRoZSBDTEkgYW5kIGV2ZXJ5dGhpbmcgaXQgc3Bhd25zIChgZ2hgLCBcdTIwMjYpIGJhY2sgdG9cblx0XHRcdC8vIFZTIENvZGUuIEFscmVhZHkgaW5oZXJpdGVkIHZpYSBgcHJvY2Vzcy5lbnZgICh0aGUgc3RyaXAgbG9vcCBvbmx5XG5cdFx0XHQvLyByZW1vdmVzIGBWU0NPREVfKmAvYEVMRUNUUk9OXypgKTsgc2V0IGhlcmUgYXMgZGVmZW5zZSBpbiBkZXB0aC5cblx0XHRcdGVudltBaUFnZW50RW52VmFyXSA9IEFpQWdlbnRFbnZWYWx1ZTtcblx0XHRcdC8vIFJlcXVpcmVkIGJ5IHRoZSBjdXJyZW50bHkgYnVuZGxlZCBTREsgdG8gZW5hYmxlIGl0cyBleHBlcmltZW50YWwgYXV0by1hcHByb3ZhbCBqdWRnZS5cblx0XHRcdGVudlsnQVVUT19BUFBST1ZBTCddID0gJ3RydWUnO1xuXHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJlUHJveHlFbnYoZW52KTtcblxuXHRcdFx0Ly8gT24gTGludXggdGhlIE1YQyBidWJibGV3cmFwIHNhbmRib3ggYmFja2VuZCBkb2VzIG5vdCBmb3J3YXJkIGEgUFRZIGludG9cblx0XHRcdC8vIHRoZSBjb250YWluZXIsIHNvIHRoZSBDTEkncyBkZWZhdWx0IFBUWS1iYWNrZWQgaW50ZXJhY3RpdmUgc2hlbGwgY2FuXG5cdFx0XHQvLyBuZXZlciBzdGFydCBiYXNoIHVuZGVyIHRoZSBzYW5kYm94OiB0aGUgaW5uZXIgc2hlbGwgc2VlcyBhIG5vbi10dHlcblx0XHRcdC8vIHN0ZGluLCBydW5zIG5vbi1pbnRlcmFjdGl2ZWx5LCByZWFkcyBFT0YgYW5kIGV4aXRzIGltbWVkaWF0ZWx5LCB3aGljaFxuXHRcdFx0Ly8gc3VyZmFjZXMgYXMgXCJGYWlsZWQgdG8gc3RhcnQgYmFzaCBwcm9jZXNzXCIuIEZvcmNlIHRoZSBDTEkncyBwaXBlLWJhc2VkXG5cdFx0XHQvLyBzcGF3biBzaGVsbCBiYWNrZW5kIChgU0hFTExfU1BBV05fQkFDS0VORGApLCB3aGljaCBydW5zIGVhY2ggY29tbWFuZCBhc1xuXHRcdFx0Ly8gYSBvbmUtc2hvdCBjaGlsZCBwcm9jZXNzIGFuZCB3b3JrcyBjb3JyZWN0bHkgdW5kZXIgYnViYmxld3JhcC4gVGhlIENMSVxuXHRcdFx0Ly8gYWxyZWFkeSBmb3JjZS1lbmFibGVzIHRoaXMgb24gQWxwaW5lL211c2w7IGdsaWJjIExpbnV4IG5lZWRzIGl0IHRvbyBmb3Jcblx0XHRcdC8vIHNhbmRib3hlZCBzaGVsbHMuIFRoaXMgYmVjb21lcyBhIG5vLW9wIG9uY2UgdGhlIGJ1bmRsZWQgQ0xJIGRlZmF1bHRzIHRoZVxuXHRcdFx0Ly8gc3Bhd24gYmFja2VuZCBvbiBmb3IgYWxsIG9mIExpbnV4LlxuXHRcdFx0aWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICdsaW51eCcpIHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZEZsYWdzID0gZW52WydDT1BJTE9UX0NMSV9FTkFCTEVEX0ZFQVRVUkVfRkxBR1MnXTtcblx0XHRcdFx0Y29uc3QgZmxhZ3MgPSBuZXcgU2V0KChlbmFibGVkRmxhZ3MgPz8gJycpLnNwbGl0KCcsJykubWFwKGYgPT4gZi50cmltKCkpLmZpbHRlcihCb29sZWFuKSk7XG5cdFx0XHRcdGZsYWdzLmFkZCgnU0hFTExfU1BBV05fQkFDS0VORCcpO1xuXHRcdFx0XHRlbnZbJ0NPUElMT1RfQ0xJX0VOQUJMRURfRkVBVFVSRV9GTEFHUyddID0gWy4uLmZsYWdzXS5qb2luKCcsJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElkZW50aWZ5IFZTIENvZGUncyBhZ2VudCBob3N0IHRyYWZmaWMgaW4gQ0FQSVxuXHRcdFx0ZW52WydHSVRIVUJfQ09QSUxPVF9JTlRFR1JBVElPTl9JRCddID0gQ09QSUxPVF9JTlRFR1JBVElPTl9JRDtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFNldCBDTEkgZW52OiBHSVRIVUJfQ09QSUxPVF9JTlRFR1JBVElPTl9JRD0ke0NPUElMT1RfSU5URUdSQVRJT05fSUR9YCk7XG5cblx0XHRcdC8vIFBvaW50IHRoZSBDb3BpbG90IENMSSBhdCBhIGNvbmZpZ3VyZWQgR2l0SHViIEVudGVycHJpc2UgaG9zdCBmb3IgaXRzXG5cdFx0XHQvLyBhdXRoZW50aWNhdGlvbiBhbmQgQ0FQSSBlbmRwb2ludCBkaXNjb3ZlcnkuIGBDT1BJTE9UX0dIX0hPU1RgIGlzXG5cdFx0XHQvLyBDb3BpbG90LUNMSS1zcGVjaWZpYyAoaXQgZG9lcyBub3QgYWZmZWN0IHRoZSBgZ2hgIENMSSkuIFVuc2V0IGZvclxuXHRcdFx0Ly8gZ2l0aHViLmNvbSBzbyB0aGUgQ0xJIHVzZXMgaXRzIGRlZmF1bHQgaG9zdC5cblx0XHRcdGNvbnN0IGVudGVycHJpc2VIb3N0ID0gdGhpcy5fZ2V0RW50ZXJwcmlzZUhvc3QoKTtcblx0XHRcdGlmIChlbnRlcnByaXNlSG9zdCkge1xuXHRcdFx0XHRlbnZbJ0NPUElMT1RfR0hfSE9TVCddID0gZW50ZXJwcmlzZUhvc3Q7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFNldCBDTEkgZW52OiBDT1BJTE9UX0dIX0hPU1Q9JHtlbnRlcnByaXNlSG9zdH1gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5hYmxlIHRoZSBydWJiZXIgZHVjayBjcml0aWMgc3ViYWdlbnQgaW4gdGhlIENMSSB3aGVuIHRoZSBhZ2VudCBob3N0XG5cdFx0XHQvLyBjb25maWcgb3B0cyBpbi4gYFJVQkJFUl9EVUNLX0FHRU5UYCBpcyB0aGUgU0RLJ3MgcmVxdWlyZWQgaW50ZXJmYWNlIGZvclxuXHRcdFx0Ly8gZ2F0aW5nIHRoaXMgZXhwZXJpbWVudGFsIGZlYXR1cmVcblx0XHRcdGlmICh0aGlzLl9pc1J1YmJlckR1Y2tFbmFibGVkKCkpIHtcblx0XHRcdFx0ZW52WydSVUJCRVJfRFVDS19BR0VOVCddID0gJ3RydWUnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVsZXRlIGVudlsnUlVCQkVSX0RVQ0tfQUdFTlQnXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgQ0xJIGVudHJ5IHBvaW50IGFuZCBuYXRpdmUgU0RLIGJpbmFyaWVzIGZyb20gbm9kZV9tb2R1bGVzLlxuXHRcdFx0Ly8gSW4gdGhlIGRlc2t0b3AgYXBwIHRoZXNlIGxpdmUgbmV4dCB0byB0aGUgQVNBUiBhcmNoaXZlIGluXG5cdFx0XHQvLyBgbm9kZV9tb2R1bGVzLmFzYXIudW5wYWNrZWRgICh0aGUgYEBnaXRodWIvY29waWxvdC08cGxhdGZvcm0+YCBDTEkgYW5kXG5cdFx0XHQvLyB0aGUgYEBtaWNyb3NvZnQvbXhjLXNkay9iaW5gIGV4ZWN1dGFibGVzIGFyZSB1bnBhY2tlZCBzbyB0aGV5IGNhbiBiZVxuXHRcdFx0Ly8gc3Bhd25lZCksIHdoaWxlIGluIGRldiBhbmQgb24gdGhlIHNlcnZlciAod2hpY2ggaGFzIG5vIEFTQVIpIHRoZXkgbGl2ZVxuXHRcdFx0Ly8gaW4gYSBwbGFpbiBgbm9kZV9tb2R1bGVzYC5cblx0XHRcdC8vIFdlIGNhbid0IHVzZSByZXF1aXJlLnJlc29sdmUoKSBiZWNhdXNlIEBnaXRodWIvY29waWxvdCdzIGV4cG9ydHMgbWFwXG5cdFx0XHQvLyBibG9ja3MgZGlyZWN0IHN1YnBhdGggYWNjZXNzLlxuXHRcdFx0Y29uc3Qgbm9kZU1vZHVsZXNVcmkgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaShnZXRBcHBOb2RlTW9kdWxlc1BhdGgoKSk7XG5cdFx0XHRjb25zdCBjbGlQYXRoID0gYXdhaXQgcmVzb2x2ZUNvcGlsb3RDbGlQYXRoKG5vZGVNb2R1bGVzVXJpKTtcblxuXHRcdFx0Ly8gVGhlIFNESydzIHNhbmRib3ggYXV0by1kZXRlY3Rpb24gbG9va3MgZm9yIGA8TVhDX0JJTl9ESVI+LzxhcmNoPi93eGMtZXhlYy5leGVgXG5cdFx0XHQvLyAoYW5kIHRoZSBMaW51eC9tYWNPUyBlcXVpdmFsZW50cykuIFZTIENvZGUgY29yZSBzaGlwcyB0aGUgTVhDIHNhbmRib3ggYmluYXJpZXNcblx0XHRcdC8vIGF0IGA8bm9kZU1vZHVsZXM+L0BtaWNyb3NvZnQvbXhjLXNkay9iaW4vPGFyY2g+L2AsIHNvIHBvaW50IGBNWENfQklOX0RJUmAgdGhlcmUuXG5cdFx0XHQvLyBUaGUgQGdpdGh1Yi9jb3BpbG90IHBhY2thZ2UncyBvd24gYG14Yy1iaW4vYCBpcyBleGNsdWRlZCBmcm9tIHRoZSBwcm9kdWN0IGJ1aWxkXG5cdFx0XHQvLyAoc2VlIGJ1aWxkLy5tb2R1bGVpZ25vcmUpLCBtaXJyb3JpbmcgYENvcGlsb3RDTElTREsuZ2V0UGFja2FnZWAgaW4gdGhlIGV4dGVuc2lvbi5cblx0XHRcdGVudlsnTVhDX0JJTl9ESVInXSA9IFVSSS5qb2luUGF0aChub2RlTW9kdWxlc1VyaSwgJ0BtaWNyb3NvZnQnLCAnbXhjLXNkaycsICdiaW4nKS5mc1BhdGg7XG5cblx0XHRcdC8vIEFkZCBWUyBDb2RlJ3MgYnVpbHQtaW4gcmlwZ3JlcCB0byBQQVRIIHNvIHRoZSBDTEkgc3VicHJvY2VzcyBjYW4gZmluZCBpdC5cblx0XHRcdGNvbnN0IHJlc29sdmVkUmdEaXNrUGF0aCA9IGF3YWl0IHJnRGlza1BhdGgoKTtcblx0XHRcdGNvbnN0IHJnRGlyID0gZGlybmFtZShyZXNvbHZlZFJnRGlza1BhdGgpO1xuXHRcdFx0Ly8gT24gV2luZG93cyB0aGUgZW52IGtleSBpcyB0eXBpY2FsbHkgXCJQYXRoXCIgKG5vdCBcIlBBVEhcIikuIFNpbmNlIHdlIGNvcGllZFxuXHRcdFx0Ly8gcHJvY2Vzcy5lbnYgaW50byBhIHBsYWluIChjYXNlLXNlbnNpdGl2ZSkgb2JqZWN0LCB3ZSBtdXN0IGZpbmQgdGhlIGFjdHVhbCBrZXkuXG5cdFx0XHRjb25zdCBwYXRoS2V5ID0gT2JqZWN0LmtleXMoZW52KS5maW5kKGsgPT4gay50b1VwcGVyQ2FzZSgpID09PSAnUEFUSCcpID8/ICdQQVRIJztcblx0XHRcdGNvbnN0IGN1cnJlbnRQYXRoID0gZW52W3BhdGhLZXldO1xuXHRcdFx0ZW52W3BhdGhLZXldID0gY3VycmVudFBhdGggPyBgJHtjdXJyZW50UGF0aH0ke2RlbGltaXRlcn0ke3JnRGlyfWAgOiByZ0Rpcjtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFJlc29sdmVkIENMSSBwYXRoOiAke2NsaVBhdGh9YCk7XG5cblx0XHRcdGNvbnN0IHRlbGVtZXRyeSA9IGF3YWl0IHRoaXMuX290ZWxTZXJ2aWNlLmdldFNka1RlbGVtZXRyeUNvbmZpZygpO1xuXHRcdFx0Y29uc3QgY29waWxvdFNka0xvZ0xldmVsQXRTdGFydHVwID0gdGhpcy5fcmVzb2x2ZUNvcGlsb3RTZGtMb2dMZXZlbChjb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nQXRTdGFydHVwKTtcblxuXHRcdFx0Y29uc3QgY2xpZW50T3B0aW9uczogQ29waWxvdENsaWVudE9wdGlvbnMgPSB7XG5cdFx0XHRcdHVzZUxvZ2dlZEluVXNlcjogZmFsc2UsXG5cdFx0XHRcdGNvbm5lY3Rpb246IFJ1bnRpbWVDb25uZWN0aW9uLmZvclN0ZGlvKHsgcGF0aDogY2xpUGF0aCB9KSxcblx0XHRcdFx0ZW52LFxuXHRcdFx0XHR0ZWxlbWV0cnksXG5cdFx0XHRcdGxvZ0xldmVsOiBjb3BpbG90U2RrTG9nTGV2ZWxBdFN0YXJ0dXAsXG5cdFx0XHRcdGVuYWJsZVJlbW90ZVNlc3Npb25zOiBzZXNzaW9uU3luY0F0U3RhcnR1cCxcblx0XHRcdFx0b25HaXRIdWJUZWxlbWV0cnk6IG5vdGlmaWNhdGlvbiA9PiB7IHZvaWQgdGhpcy5fcm91dGVHaXRIdWJUZWxlbWV0cnkobm90aWZpY2F0aW9uKS5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3RdIEdpdEh1YiB0ZWxlbWV0cnkgcm91dGluZyBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApKTsgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjbGllbnQgPSB0aGlzLl9jcmVhdGVDb3BpbG90Q2xpZW50KGNsaWVudE9wdGlvbnMpO1xuXHRcdFx0YXdhaXQgY2xpZW50LnN0YXJ0KCk7XG5cdFx0XHRpZiAodGhpcy5fc2h1dGRvd25Qcm9taXNlKSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5zdG9wKCk7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2lzU2Vzc2lvblN5bmNFbmFibGVkKCkgIT09IHNlc3Npb25TeW5jQXRTdGFydHVwIHx8IHRoaXMuX2lzUnViYmVyRHVja0VuYWJsZWQoKSAhPT0gcnViYmVyRHVja0F0U3RhcnR1cCB8fCB0aGlzLl9nZXRDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nKCkgIT09IGNvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmdBdFN0YXJ0dXAgfHwgdGhpcy5fZ2V0RW50ZXJwcmlzZUhvc3QoKSAhPT0gZW50ZXJwcmlzZUhvc3RBdFN0YXJ0dXAgfHwgdGhpcy5faXNTeXN0ZW1Qcm94eUVuYWJsZWQoKSAhPT0gc3lzdGVtUHJveHlFbmFibGVkQXRTdGFydHVwKSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5zdG9wKCk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ29waWxvdCBzdGFydHVwIGNvbmZpZyBjaGFuZ2VkIHdoaWxlIHRoZSBjbGllbnQgd2FzIHN0YXJ0aW5nJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDb3BpbG90XSBDb3BpbG90Q2xpZW50IHN0YXJ0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0XHR0aGlzLl9lbmFibGVQbGFuTW9kZU9uQ2xpZW50KGNsaWVudCk7XG5cdFx0XHR0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG5cdFx0XHR0aGlzLl9jbGllbnRTdGFydGluZyA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBjbGllbnQ7XG5cdFx0fSkoKTtcblx0XHR0aGlzLl9jbGllbnRTdGFydGluZyA9IGNsaWVudFN0YXJ0aW5nO1xuXHRcdHZvaWQgY2xpZW50U3RhcnRpbmcuY2F0Y2goKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2xpZW50U3RhcnRpbmcgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGNsaWVudFN0YXJ0aW5nO1xuXHR9XG5cblx0Ly8gLS0tLSBzZXNzaW9uIG1hbmFnZW1lbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRoaW5raW5nTGV2ZWxDb25maWdTY2hlbWFQcm9wZXJ0eShzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogc3RyaW5nIHwgdW5kZWZpbmVkKTogQ29uZmlnUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29waWxvdC5tb2RlbFRoaW5raW5nTGV2ZWwudGl0bGUnLCBcIlRoaW5raW5nIExldmVsXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Lm1vZGVsVGhpbmtpbmdMZXZlbC5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgaG93IG11Y2ggcmVhc29uaW5nIGVmZm9ydCB0aGUgbW9kZWwgdXNlcy5cIiksXG5cdFx0XHRkZWZhdWx0OiBkZWZhdWx0UmVhc29uaW5nRWZmb3J0LFxuXHRcdFx0ZW51bTogWy4uLnN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHNdLFxuXHRcdFx0ZW51bUxhYmVsczogc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cy5tYXAoZ2V0UmVhc29uaW5nRWZmb3J0TGFiZWwpLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cy5tYXAodmFsdWUgPT4gZ2V0UmVhc29uaW5nRWZmb3J0RGVzY3JpcHRpb24odmFsdWUpID8/ICcnKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFN5bnRoZXNpemUgYSBgY29udGV4dFNpemVgIGNvbmZpZyBwcm9wZXJ0eSB3aGVuIHRoZSBtb2RlbCBleHBvc2VzIGEgYGxvbmdfY29udGV4dGAgcHJpY2luZyB0aWVyIHdpdGggYSBkaXN0aW5jdFxuXHQgKiBjb250ZXh0LW1heC4gUGlja2VyIHN1cmZhY2VzIHRoaXMgYXMgdGhlIFwiQ29udGV4dCBTaXplXCIgYnV0dG9uLiBNaXJyb3JzIGBnZXRDb250ZXh0U2l6ZU9wdGlvbnNgIGluXG5cdCAqIGBleHRlbnNpb25zL2NvcGlsb3Qvc3JjL2V4dGVuc2lvbi9jaGF0L3ZzY29kZS1ub2RlL2xhbmd1YWdlTW9kZWxBY2Nlc3MudHNgLlxuXHQgKlxuXHQgKiBUaGUgYGVudW1gIHZhbHVlcyBhcmUgdGhlIHR3byBjb250ZXh0LXdpbmRvdyBzaXplcyAoaW4gdG9rZW5zKSwgc21hbGxlc3QgZmlyc3QsIHNvIHRoZSBudW1lcmljIHRva2VuIGNvdW50c1xuXHQgKiBmbG93IHRvIHRoZSBjbGllbnQuIFRoZSBjaG9zZW4gdmFsdWUgY29tZXMgYmFjayBpbiB0aGUgbW9kZWwncyBgY29uZmlnYCBiYWcgYW5kIGlzIG1hcHBlZCB0byB0aGUgU0RLJ3Ncblx0ICogdHdvLXZhbHVlZCBgY29udGV4dFRpZXJgIGF0IHRoZSBTREsgYm91bmRhcnkgYnkge0BsaW5rIGdldENvcGlsb3RDb250ZXh0VGllcn0sIHVzaW5nIHRoZSBtb2RlbCdzIGxvbmctY29udGV4dFxuXHQgKiB3aW5kb3cgZnJvbSB7QGxpbmsgX2xvbmdDb250ZXh0V2luZG93Rm9yfS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZUNvbnRleHRTaXplQ29uZmlnU2NoZW1hUHJvcGVydHkoYmlsbGluZzogSUNBUElNb2RlbEJpbGxpbmcgfCB1bmRlZmluZWQpOiBDb25maWdQcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdG9rZW5QcmljZXMgPSBiaWxsaW5nPy50b2tlblByaWNlcztcblx0XHRjb25zdCBkZWZhdWx0TWF4ID0gdG9rZW5QcmljZXM/LmNvbnRleHRNYXg7XG5cdFx0Y29uc3QgbG9uZ0NvbnRleHRNYXggPSB0b2tlblByaWNlcz8ubG9uZ0NvbnRleHQ/LmNvbnRleHRNYXg7XG5cdFx0aWYgKCFkZWZhdWx0TWF4IHx8ICFsb25nQ29udGV4dE1heCB8fCBkZWZhdWx0TWF4ID49IGxvbmdDb250ZXh0TWF4KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gYm90aCB0aWVycyBjb3N0IHRoZSBzYW1lIGFuZCB0aGUgdXNlciBwcmVmZXJzIGxvbmcgY29udGV4dCwgc2hvdyBvbmx5IHRoZSBsb25nLWNvbnRleHQgb3B0aW9uIGFzIGEgbm9uLXN3aXRjaGFibGUgaW5kaWNhdG9yLiBTZWUgbWljcm9zb2Z0L3ZzY29kZSMzMjI5NTAsIG1pY3Jvc29mdC92c2NvZGUjMzIzMTE2LlxuXHRcdGlmICh0aGlzLl9pc1ByZWZlckxvbmdDb250ZXh0RW5hYmxlZCgpICYmICFoYXNMb25nQ29udGV4dFN1cmNoYXJnZShiaWxsaW5nKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29waWxvdC5tb2RlbENvbnRleHRTaXplLnRpdGxlJywgXCJDb250ZXh0IFNpemVcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdC5tb2RlbENvbnRleHRTaXplLmRlc2NyaXB0aW9uJywgXCJTZWxlY3RzIHRoZSBjb250ZXh0IHdpbmRvdyBzaXplIGZvciB0aGlzIG1vZGVsLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogbG9uZ0NvbnRleHRNYXgsXG5cdFx0XHRcdGVudW06IFtsb25nQ29udGV4dE1heF0sXG5cdFx0XHRcdGVudW1MYWJlbHM6IFtmb3JtYXRUb2tlbkNvdW50KGxvbmdDb250ZXh0TWF4KV0sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY29waWxvdC5tb2RlbENvbnRleHRTaXplLmxvbmdlclNlc3Npb25zJywgXCJMb25nZXIgc2Vzc2lvbnNcIiksXG5cdFx0XHRcdF0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29waWxvdC5tb2RlbENvbnRleHRTaXplLnRpdGxlJywgXCJDb250ZXh0IFNpemVcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvcGlsb3QubW9kZWxDb250ZXh0U2l6ZS5kZXNjcmlwdGlvbicsIFwiU2VsZWN0cyB0aGUgY29udGV4dCB3aW5kb3cgc2l6ZSBmb3IgdGhpcyBtb2RlbC5cIiksXG5cdFx0XHRkZWZhdWx0OiBkZWZhdWx0TWF4LFxuXHRcdFx0ZW51bTogW2RlZmF1bHRNYXgsIGxvbmdDb250ZXh0TWF4XSxcblx0XHRcdGVudW1MYWJlbHM6IFtmb3JtYXRUb2tlbkNvdW50KGRlZmF1bHRNYXgpLCBmb3JtYXRUb2tlbkNvdW50KGxvbmdDb250ZXh0TWF4KV0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdjb3BpbG90Lm1vZGVsQ29udGV4dFNpemUuZGVmYXVsdCcsIFwiRGVmYXVsdFwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2NvcGlsb3QubW9kZWxDb250ZXh0U2l6ZS5sb25nZXJTZXNzaW9ucycsIFwiTG9uZ2VyIHNlc3Npb25zXCIpLFxuXHRcdFx0XSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtb2RlbCdzIGxvbmctY29udGV4dCB3aW5kb3cgKGluIHRva2Vucyk6IHRoZSBsYXJnZXN0IHNpemUgb2ZmZXJlZCBieSBpdHMgXCJDb250ZXh0IFNpemVcIiBwaWNrZXJcblx0ICogKHRoZSBtYXggbnVtZXJpYyB2YWx1ZSBpbiB0aGUgc3ludGhlc2l6ZWQgYGNvbnRleHRTaXplYCB7QGxpbmsgQ29uZmlnUHJvcGVydHlTY2hlbWEuZW51bX0pLiBVc2VkIGJ5XG5cdCAqIHtAbGluayBnZXRDb3BpbG90Q29udGV4dFRpZXJ9IHRvIGRlY2lkZSB3aGV0aGVyIGEgbnVtZXJpYyBzZWxlY3Rpb24gb3B0cyBpbnRvIGBsb25nX2NvbnRleHRgLlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIG1vZGVsIGV4cG9zZXMgbm8gc3VjaCBwaWNrZXIgKG9yIHRoZSBtb2RlbCBsaXN0IGlzbid0IGxvYWRlZCB5ZXQpLFxuXHQgKiBsZWF2aW5nIHRoZSBTREsgb24gaXRzIGRlZmF1bHQgdGllci5cblx0ICovXG5cdHByaXZhdGUgX2xvbmdDb250ZXh0V2luZG93Rm9yKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFtb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB3aW5kb3dzID0gdGhpcy5fbW9kZWxzLmdldCgpLmZpbmQobSA9PiBtLmlkID09PSBtb2RlbElkKT8uY29uZmlnU2NoZW1hPy5wcm9wZXJ0aWVzPy5bQ29udGV4dFNpemVDb25maWdLZXldPy5lbnVtO1xuXHRcdGNvbnN0IG51bWVyaWNXaW5kb3dzID0gd2luZG93cz8uZmlsdGVyKCh3KTogdyBpcyBudW1iZXIgPT4gdHlwZW9mIHcgPT09ICdudW1iZXInKTtcblx0XHRyZXR1cm4gbnVtZXJpY1dpbmRvd3MgJiYgbnVtZXJpY1dpbmRvd3MubGVuZ3RoID4gMCA/IE1hdGgubWF4KC4uLm51bWVyaWNXaW5kb3dzKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBtb2RlbCBoYXMgYSBsb25nLWNvbnRleHQgd2luZG93IGF2YWlsYWJsZSBhdCBubyBhZGRpdGlvbmFsIGNvc3QuXG5cdCAqIFdoZW4gdHJ1ZSB0aGUgbW9kZWwgc2hvdWxkIGFsd2F5cyBydW4gaW4gYGxvbmdfY29udGV4dGAgdGllciB3aXRob3V0IHNob3dpbmdcblx0ICogYSBjb250ZXh0LXNpemUgcGlja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNGcmVlTG9uZ0NvbnRleHQobW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbW9kZWxJZCAmJiB0aGlzLl9mcmVlTG9uZ0NvbnRleHRNb2RlbHMuaGFzKG1vZGVsSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgb3BlbiBgX21ldGFgIG1vZGVsIHBpY2tlciBiYWcgZnJvbSB0aGUgU0RLJ3MgYmlsbGluZyBhbmQgcGlja2VyIG1ldGFkYXRhLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlTW9kZWxQaWNrZXJNZXRhKG1vZGVsSW5mbzogTW9kZWxJbmZvLCBiaWxsaW5nOiBJQ0FQSU1vZGVsQmlsbGluZyB8IHVuZGVmaW5lZCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gY3JlYXRlUHJpY2luZ01ldGFGcm9tQmlsbGluZyhiaWxsaW5nLCBtb2RlbEluZm8ubW9kZWxQaWNrZXJQcmljZUNhdGVnb3J5LCBtb2RlbEluZm8ubW9kZWxQaWNrZXJDYXRlZ29yeSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVNb2RlbENvbmZpZ1NjaGVtYShtOiBNb2RlbEluZm8sIGJpbGxpbmc6IElDQVBJTW9kZWxCaWxsaW5nIHwgdW5kZWZpbmVkKTogQ29uZmlnU2NoZW1hIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzOiBDb25maWdTY2hlbWFbJ3Byb3BlcnRpZXMnXSA9IHt9O1xuXHRcdGNvbnN0IHRoaW5raW5nTGV2ZWwgPSB0aGlzLl9jcmVhdGVUaGlua2luZ0xldmVsQ29uZmlnU2NoZW1hUHJvcGVydHkobS5zdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzLCBtLmRlZmF1bHRSZWFzb25pbmdFZmZvcnQpO1xuXHRcdGlmICh0aGlua2luZ0xldmVsKSB7XG5cdFx0XHRwcm9wZXJ0aWVzW1RoaW5raW5nTGV2ZWxDb25maWdLZXldID0gdGhpbmtpbmdMZXZlbDtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dFNpemUgPSB0aGlzLl9jcmVhdGVDb250ZXh0U2l6ZUNvbmZpZ1NjaGVtYVByb3BlcnR5KGJpbGxpbmcpO1xuXHRcdGlmIChjb250ZXh0U2l6ZSkge1xuXHRcdFx0cHJvcGVydGllc1tDb250ZXh0U2l6ZUNvbmZpZ0tleV0gPSBjb250ZXh0U2l6ZTtcblx0XHR9XG5cdFx0aWYgKE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgX3NlcmlhbGl6ZU1vZGVsU2VsZWN0aW9uKG1vZGVsOiBNb2RlbFNlbGVjdGlvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KG1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlTW9kZWxTZWxlY3Rpb24ocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZhbHVlOiBJU2VyaWFsaXplZE1vZGVsU2VsZWN0aW9uIHwgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IG51bGwgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgdmFsdWUuaWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsU2VsZWN0aW9uOiBNb2RlbFNlbGVjdGlvbiA9IHsgaWQ6IHZhbHVlLmlkIH07XG5cdFx0XHRcdGlmICh2YWx1ZS5jb25maWcgJiYgdHlwZW9mIHZhbHVlLmNvbmZpZyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRjb25zdCBjb25maWc6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZS5jb25maWcpKSB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGNvbmZpZ1ZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRjb25maWdba2V5XSA9IGNvbmZpZ1ZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMoY29uZmlnKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRtb2RlbFNlbGVjdGlvbi5jb25maWcgPSBjb25maWc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtb2RlbFNlbGVjdGlvbjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIE9sZGVyIHNlc3Npb24gbWV0YWRhdGEgc3RvcmVkIHRoZSByYXcgbW9kZWwgaWQgYXMgYSBwbGFpbiBzdHJpbmcuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaWQ6IHJhdyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VyaWFsaXplQWdlbnRTZWxlY3Rpb24oYWdlbnQ6IEFnZW50U2VsZWN0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyB1cmk6IGFnZW50LnVyaSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlQWdlbnRTZWxlY3Rpb24ocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2YWx1ZTogdW5rbm93biA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHR5cGVvZiAodmFsdWUgYXMgQWdlbnRTZWxlY3Rpb24pLnVyaSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHsgdXJpOiAodmFsdWUgYXMgQWdlbnRTZWxlY3Rpb24pLnVyaSB9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gQmFkIC8gc3RhbGUgbWV0YWRhdGEgXHUyMDE0IHRyZWF0IGFzIHVuc2V0LlxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGFuIHtAbGluayBBZ2VudFNlbGVjdGlvbn0ncyBTREstZmFjaW5nIG5hbWUgZnJvbSB0aGUgcGx1Z2luXG5cdCAqIHNuYXBzaG90IHRoYXQgaXMsIG9yIHdpbGwgYmUsIGFwcGxpZWQgdG8gdGhlIFNESyBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUFnZW50TmFtZShzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90LCBhZ2VudDogQWdlbnRTZWxlY3Rpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcGx1Z2luIG9mIHNuYXBzaG90LnBsdWdpbnMpIHtcblx0XHRcdGNvbnN0IGZvdW5kID0gcGx1Z2luLmFnZW50cy5maW5kKGEgPT4gYS51cmkudG9TdHJpbmcoKSA9PT0gYWdlbnQudXJpKTtcblx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gZm91bmQubmFtZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGxpc3RTZXNzaW9ucygpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YVtdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbQ29waWxvdF0gTGlzdGluZyBzZXNzaW9ucy4uLicpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNsaWVudCgpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY2xpZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHByb2plY3RMaW1pdGVyID0gbmV3IExpbWl0ZXI8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPig0KTtcblx0XHRjb25zdCBwcm9qZWN0QnlDb250ZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPj4oKTtcblx0XHRjb25zdCBtYXBwZWQgPSBhd2FpdCBQcm9taXNlLmFsbChzZXNzaW9ucy5tYXAoYXN5bmMgcyA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzLnNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRoaXMuX3JlYWRTdG9yZWRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbik7XG5cdFx0XHRpZiAoIW1ldGFkYXRhKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRsZXQgeyBwcm9qZWN0LCByZXNvbHZlZCB9ID0gbWV0YWRhdGE7XG5cdFx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRcdHByb2plY3QgPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2Vzc2lvblByb2plY3Qocy5jb250ZXh0LCBwcm9qZWN0TGltaXRlciwgcHJvamVjdEJ5Q29udGV4dCk7XG5cdFx0XHRcdHZvaWQgdGhpcy5fc3RvcmVTZXNzaW9uUHJvamVjdFJlc29sdXRpb24oc2Vzc2lvbiwgcHJvamVjdCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBtZXRhZGF0YS53b3JraW5nRGlyZWN0b3JpZXMgPz8gKHR5cGVvZiBzLmNvbnRleHQ/LndvcmtpbmdEaXJlY3RvcnkgPT09ICdzdHJpbmcnID8gW1VSSS5maWxlKHMuY29udGV4dC53b3JraW5nRGlyZWN0b3J5KV0gOiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdHN0YXJ0VGltZTogcy5zdGFydFRpbWUuZ2V0VGltZSgpLFxuXHRcdFx0XHRtb2RpZmllZFRpbWU6IHMubW9kaWZpZWRUaW1lLmdldFRpbWUoKSxcblx0XHRcdFx0cHJvamVjdCxcblx0XHRcdFx0c3VtbWFyeTogcy5zdW1tYXJ5LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWFwcGVkLmZpbHRlcigocyk6IHMgaXMgSUFnZW50U2Vzc2lvbk1ldGFkYXRhID0+IHMgIT09IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gRm91bmQgJHtyZXN1bHQubGVuZ3RofSBzZXNzaW9uc2ApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc3RvcmVkTWV0YWRhdGEgPSBhd2FpdCB0aGlzLl9yZWFkU3RvcmVkU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb24pO1xuXHRcdGlmICghc3RvcmVkTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbk1ldGFkYXRhID0gYXdhaXQgY2xpZW50LmdldFNlc3Npb25NZXRhZGF0YShzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbk1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBwcm9qZWN0ID0gc3RvcmVkTWV0YWRhdGE/LnByb2plY3Q7XG5cdFx0aWYgKHN0b3JlZE1ldGFkYXRhICYmICFzdG9yZWRNZXRhZGF0YS5yZXNvbHZlZCkge1xuXHRcdFx0Y29uc3QgcHJvamVjdExpbWl0ZXIgPSBuZXcgTGltaXRlcjxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+KDEpO1xuXHRcdFx0cHJvamVjdCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVTZXNzaW9uUHJvamVjdChzZXNzaW9uTWV0YWRhdGE/LmNvbnRleHQsIHByb2plY3RMaW1pdGVyLCBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+PigpKTtcblx0XHRcdHZvaWQgdGhpcy5fc3RvcmVTZXNzaW9uUHJvamVjdFJlc29sdXRpb24oc2Vzc2lvbiwgcHJvamVjdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gc3RvcmVkTWV0YWRhdGE/LndvcmtpbmdEaXJlY3RvcmllcyA/PyAodHlwZW9mIHNlc3Npb25NZXRhZGF0YT8uY29udGV4dD8ud29ya2luZ0RpcmVjdG9yeSA9PT0gJ3N0cmluZycgPyBbVVJJLmZpbGUoc2Vzc2lvbk1ldGFkYXRhLmNvbnRleHQud29ya2luZ0RpcmVjdG9yeSldIDogdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHN0YXJ0VGltZTogc2Vzc2lvbk1ldGFkYXRhPy5zdGFydFRpbWUuZ2V0VGltZSgpID8/IERhdGUubm93KCksXG5cdFx0XHRtb2RpZmllZFRpbWU6IHNlc3Npb25NZXRhZGF0YT8ubW9kaWZpZWRUaW1lLmdldFRpbWUoKSA/PyBEYXRlLm5vdygpLFxuXHRcdFx0cHJvamVjdCxcblx0XHRcdHN1bW1hcnk6IHNlc3Npb25NZXRhZGF0YT8uc3VtbWFyeSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbGlzdE1vZGVscyhnaXRIdWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJQWdlbnRNb2RlbEluZm9bXT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NvcGlsb3RdIExpc3RpbmcgbW9kZWxzLi4uJyk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cdFx0Y29uc3QgeyBtb2RlbHMgfSA9IGF3YWl0IGNsaWVudC5ycGMubW9kZWxzLmxpc3QoeyBnaXRIdWJUb2tlbiB9KTtcblx0XHR0aGlzLl9mcmVlTG9uZ0NvbnRleHRNb2RlbHMuY2xlYXIoKTtcblx0XHRjb25zdCBwcmVmZXJMb25nQ29udGV4dCA9IHRoaXMuX2lzUHJlZmVyTG9uZ0NvbnRleHRFbmFibGVkKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbW9kZWxzLm1hcCgobSk6IElBZ2VudE1vZGVsSW5mbyA9PiB7XG5cdFx0XHRjb25zdCBiaWxsaW5nID0gbm9ybWFsaXplQ0FQSUJpbGxpbmcobS5iaWxsaW5nKTtcblx0XHRcdGNvbnN0IGNvbmZpZ1NjaGVtYSA9IHRoaXMuX2NyZWF0ZU1vZGVsQ29uZmlnU2NoZW1hKG0sIGJpbGxpbmcpO1xuXHRcdFx0Ly8gQSBtb2RlbCBoYXMgZnJlZSBsb25nIGNvbnRleHQgKGxhcmdlciB3aW5kb3csIG5vIHN1cmNoYXJnZSksIGJ1dCBvbmx5IHRyZWF0IGl0IGFzIGZyZWUgd2hlbiB0aGUgdXNlciBwcmVmZXJzIGxvbmcgY29udGV4dC5cblx0XHRcdGNvbnN0IHRva2VuUHJpY2VzID0gYmlsbGluZz8udG9rZW5QcmljZXM7XG5cdFx0XHRjb25zdCBoYXNMYXJnZXJMb25nQ29udGV4dCA9ICEhdG9rZW5QcmljZXM/LmNvbnRleHRNYXhcblx0XHRcdFx0JiYgISF0b2tlblByaWNlcy5sb25nQ29udGV4dD8uY29udGV4dE1heFxuXHRcdFx0XHQmJiB0b2tlblByaWNlcy5sb25nQ29udGV4dC5jb250ZXh0TWF4ID4gdG9rZW5QcmljZXMuY29udGV4dE1heDtcblx0XHRcdGlmIChwcmVmZXJMb25nQ29udGV4dCAmJiBoYXNMYXJnZXJMb25nQ29udGV4dCAmJiAhaGFzTG9uZ0NvbnRleHRTdXJjaGFyZ2UoYmlsbGluZykpIHtcblx0XHRcdFx0dGhpcy5fZnJlZUxvbmdDb250ZXh0TW9kZWxzLmFkZChtLmlkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyOiB0aGlzLmlkLFxuXHRcdFx0XHRpZDogbS5pZCxcblx0XHRcdFx0bmFtZTogbS5uYW1lLFxuXHRcdFx0XHQvLyBTeW50aGV0aWMgU0RLIGVudHJpZXMgbGlrZSBgYXV0b2Agc2hpcCB3aXRoIGBjYXBhYmlsaXRpZXM6IHt9YCBhbmRcblx0XHRcdFx0Ly8gbm8gZml4ZWQgY29udGV4dCB3aW5kb3cgXHUyMDE0IHN1cmZhY2UgdGhlbSB3aXRoIG1heENvbnRleHRXaW5kb3cgdW5kZWZpbmVkLlxuXHRcdFx0XHRtYXhDb250ZXh0V2luZG93OiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfY29udGV4dF93aW5kb3dfdG9rZW5zLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IG0uY2FwYWJpbGl0aWVzPy5saW1pdHM/Lm1heF9vdXRwdXRfdG9rZW5zLFxuXHRcdFx0XHRtYXhQcm9tcHRUb2tlbnM6IG0uY2FwYWJpbGl0aWVzPy5saW1pdHM/Lm1heF9wcm9tcHRfdG9rZW5zLFxuXHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogISFtLmNhcGFiaWxpdGllcz8uc3VwcG9ydHM/LnZpc2lvbixcblx0XHRcdFx0Y29uZmlnU2NoZW1hLFxuXHRcdFx0XHRwb2xpY3lTdGF0ZTogbS5wb2xpY3k/LnN0YXRlIGFzIFBvbGljeVN0YXRlIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRfbWV0YTogdGhpcy5fY3JlYXRlTW9kZWxQaWNrZXJNZXRhKG0sIGJpbGxpbmcpLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBGb3VuZCAke3Jlc3VsdC5sZW5ndGh9IG1vZGVsczogJHtyZXN1bHQubWFwKG0gPT4gbS5uYW1lKS5qb2luKCcsICcpfWApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGZvciBhIHtAbGluayBjcmVhdGVTZXNzaW9ufSBjYWxsOiB0aGUgY2FsbGVyLXN1cHBsaWVkIGZvbGRlciwgZWxzZSBhXG5cdCAqIHN0aWxsLXByb3Zpc2lvbmFsIHNlc3Npb24ncyBmb2xkZXIgZm9yIGFuIGlkZW1wb3RlbnQgcmUtY3JlYXRlLCBlbHNlIFx1MjAxNCB3aGVuIHRoZSBzZXNzaW9uIGlzIHdvcmtzcGFjZS1sZXNzXG5cdCAqIChubyBgd29ya2luZ0RpcmVjdG9yeWAgc3VwcGxpZWQpIFx1MjAxNCBhIHN0YWJsZSBwZXItc2Vzc2lvbiBzY3JhdGNoIGRpcmVjdG9yeS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDcmVhdGVXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25Db25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIHNlc3Npb25JZDogc3RyaW5nLCBpc1dvcmtzcGFjZWxlc3M6IGJvb2xlYW4pOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gc2Vzc2lvbkNvbmZpZy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA/PyB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmdldChzZXNzaW9uSWQpPy53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHQvLyBBIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24gKGluZmVycmVkIGZyb20gYW4gYWJzZW50IGlucHV0XG5cdFx0Ly8gYHdvcmtpbmdEaXJlY3RvcnlgKSBnZXRzIGEgU1RBQkxFLCBkZXRlcm1pbmlzdGljIHBlci1zZXNzaW9uIHNjcmF0Y2hcblx0XHQvLyBkaXIgKG1pcnJvcmluZyB0aGUgR2l0SHViIGFwcCdzIGA8Y29waWxvdEhvbWU+L2NoYXRzLzxpZD5gKSByYXRoZXIgdGhhblxuXHRcdC8vIGEgdGhyb3dhd2F5IGBvcy50bXBkaXIoKWAgZGlyLCBzbyB0aGUgY3dkIHN1cnZpdmVzIHJlbG9hZHMgYW5kIGlzbid0XG5cdFx0Ly8gbG9zdCB0byBPUyB0ZW1wIHJlYXBpbmcuXG5cdFx0aWYgKGlzV29ya3NwYWNlbGVzcykge1xuXHRcdFx0Y29uc3Qgc2NyYXRjaERpciA9IHRoaXMuX3dvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHNlc3Npb25JZCk7XG5cdFx0XHRhd2FpdCBmcy5ta2RpcihzY3JhdGNoRGlyLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm4gc2NyYXRjaERpcjtcblx0XHR9XG5cdFx0Y29uc3QgdG1wUGF0aCA9IGF3YWl0IGZzLm1rZHRlbXAoam9pbihvcy50bXBkaXIoKSwgJ2FnZW50LWhvc3Qtc2Vzc2lvbi0nKSk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKHRtcFBhdGgpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90XSBObyB3b3JraW5nRGlyZWN0b3J5IHByb3ZpZGVkLCBkZWZhdWx0aW5nIHRvIHRlbXAgZGlyZWN0b3J5OiAke3dvcmtpbmdEaXJlY3RvcnkuZnNQYXRofWApO1xuXHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YWJsZSBwZXItc2Vzc2lvbiBzY3JhdGNoIGRpcmVjdG9yeSBmb3IgYSB3b3Jrc3BhY2UtbGVzcyBjaGF0OlxuXHQgKiBgPHVzZXJIb21lPi8uY29waWxvdC9jaGF0cy88c2Vzc2lvbklkPmAuIERldGVybWluaXN0aWMsIHBlcnNpc3RlbnQsIGFuZFxuXHQgKiBjbGVhbmVkIHVwIG9uIHNlc3Npb24gZGVsZXRlIChzZWUge0BsaW5rIF9jbGVhbnVwV29ya3NwYWNlbGVzc1NjcmF0Y2hEaXJ9KS5cblx0ICovXG5cdHByaXZhdGUgX3dvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHNlc3Npb25JZDogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gd29ya3NwYWNlbGVzc1NjcmF0Y2hEaXIodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLCBzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqIEVuc3VyZXMgYSB3b3Jrc3BhY2UtbGVzcyBjaGF0J3Mgc2NyYXRjaCBkaXIgZXhpc3RzIChta2RpciAtcCksIHJlY3JlYXRpbmcgaXQgaWYgaXQgd2FzIHJlYXBlZC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlV29ya3NwYWNlbGVzc1NjcmF0Y2hEaXIoc2NyYXRjaERpcjogVVJJLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmcy5ta2RpcihzY3JhdGNoRGlyLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFdvcmtzcGFjZS1sZXNzIHNjcmF0Y2ggZGlyZWN0b3J5IHJlYWR5OiAke3NjcmF0Y2hEaXIuZnNQYXRofWApO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGVuc3VyZSB3b3Jrc3BhY2UtbGVzcyBzY3JhdGNoIGRpcmVjdG9yeSAnJHtzY3JhdGNoRGlyLmZzUGF0aH0nOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmVtb3ZlcyBhIHdvcmtzcGFjZS1sZXNzIGNoYXQncyBzdGFibGUgc2NyYXRjaCBkaXIgb24gc2Vzc2lvbiBkZWxldGUvZGlzcG9zZS4gKi9cblx0cHJpdmF0ZSBhc3luYyBfY2xlYW51cFdvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHNjcmF0Y2hEaXI6IFVSSSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnMucm0oc2NyYXRjaERpci5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gUmVtb3ZlZCB3b3Jrc3BhY2UtbGVzcyBzY3JhdGNoIGRpcmVjdG9yeTogJHtzY3JhdGNoRGlyLmZzUGF0aH1gKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEZhaWxlZCB0byByZW1vdmUgd29ya3NwYWNlLWxlc3Mgc2NyYXRjaCBkaXJlY3RvcnkgJyR7c2NyYXRjaERpci5mc1BhdGh9JzogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBDaGF0IHN1cmZhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vXG5cdC8vIFRoZSBjaGF0LWFkZHJlc3NlZCBvcGVyYXRpb24gc3VyZmFjZSAoc2VlXG5cdC8vIHtAbGluayBJQWdlbnQuY2hhdHN9KS4gVGhlIG9yY2hlc3RyYXRvciBvd25zIHRoZSBmZWF0dXJlLWxldmVsXG5cdC8vIGAoc2Vzc2lvbiwgY2hhdClgIG1hcHBpbmcgYW5kIGhhbmRzIHRoZXNlIG1ldGhvZHMgYSBzaW5nbGUsXG5cdC8vIGNvbmNyZXRlIGNoYXQgY2hhbm5lbCBVUkk6IHRoZSBkZWZhdWx0IGNoYXQgY2hhbm5lbCBvciBhbiBhZGRpdGlvbmFsXG5cdC8vIHBlZXIgY2hhdCBjaGFubmVsLiBFYWNoIG1ldGhvZCByZS1kZXJpdmVzIHRoZSBgKHNlc3Npb24sIGNoYXQpYCBwYWlyXG5cdC8vIHRoZSBhZ2VudCdzIGludGVybmFsIFNESyBzdG9yYWdlIGlzIGtleWVkIGJ5IHZpYVxuXHQvLyB7QGxpbmsgX3Jlc29sdmVDaGF0VGFyZ2V0fS5cblxuXHQvKipcblx0ICogTWFwcyBhIHJlc29sdmVkIGNoYXQgVVJJIHRvIHRoZSBgKHNlc3Npb24sIGNoYXQpYCBwYWlyIHRoZSBhZ2VudCdzXG5cdCAqIGludGVybmFsIHN0b3JhZ2UgaXMga2V5ZWQgYnkuIEEgcGVlciAoYGFocC1jaGF0YCkgY2hhdCBjYXJyaWVzIGl0c1xuXHQgKiBvd25pbmcgc2Vzc2lvbiBpbiBpdHMgVVJJLiBUaGUgZGVmYXVsdCBjaGF0IGlzIGFkZHJlc3NlZCBieSBpdHNcblx0ICogZGV0ZXJtaW5pc3RpYyBjaGF0IGNoYW5uZWwgVVJJLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdDogVVJJKTogeyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSSB9IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29waWxvdCBjaGF0IG9wZXJhdGlvbiByZXF1aXJlcyBhbiBBSFAgY2hhdCBVUkk6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzZXNzaW9uOiBVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pLCBjaGF0OiBjaGF0IH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGF0Q29udGV4dChjaGF0T3JTZXNzaW9uOiBVUkkpOiB7IHNlc3Npb246IFVSSTsgc2Vzc2lvbklkOiBzdHJpbmc7IGNoYXRLZXk6IHN0cmluZzsgdGFyZ2V0OiBDb3BpbG90QWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkOyBpc1BlZXJDaGF0OiBib29sZWFuIH0ge1xuXHRcdC8vIEFjY2VwdCBlaXRoZXIgYSBjaGF0IGNoYW5uZWwgVVJJIG9yIGEgYmFyZSBzZXNzaW9uIFVSSTogcGVyIHRoZSBBSFBcblx0XHQvLyBjb252ZW50aW9uIHRoZSBkZWZhdWx0IGNoYXQncyBVUkkgZXF1YWxzIHRoZSBzZXNzaW9uIFVSSSwgc28gY2FsbGVyc1xuXHRcdC8vIHRoYXQgYWRkcmVzcyB0aGUgZGVmYXVsdCBjaGF0IGJ5IHRoZSBzZXNzaW9uIFVSSSByZXNvbHZlIGhlcmUgaW4gb25lXG5cdFx0Ly8gcGxhY2UgcmF0aGVyIHRoYW4gZWFjaCBvcGVyYXRpb25hbCBtZXRob2QgcmUtZGVyaXZpbmcgaXQuXG5cdFx0Y29uc3QgY2hhdCA9IHBhcnNlQ2hhdFVyaShjaGF0T3JTZXNzaW9uKSA/IGNoYXRPclNlc3Npb24gOiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShjaGF0T3JTZXNzaW9uKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZShwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXQpKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpPy5yZXNvbHZlQ2hhdChjaGF0S2V5KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdGNoYXRLZXksXG5cdFx0XHR0YXJnZXQ6IHJlc29sdmVkPy5jaGF0U2Vzc2lvbixcblx0XHRcdGlzUGVlckNoYXQ6IHJlc29sdmVkID8gIXJlc29sdmVkLmlzRGVmYXVsdCA6IGNoYXRLZXkgIT09IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbiksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBzZXNzaW9uJ3MgbWF0ZXJpYWxpemVkIGRlZmF1bHQgKG1haW4pIGNoYXQgYnkgcmF3IHNlc3Npb24gaWQsXG5cdCAqIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlIHNlc3Npb24gaXMgcHJvdmlzaW9uYWwgb3Igbm90IGluIG1lbW9yeS4gVGhlXG5cdCAqIGRlZmF1bHQgY2hhdCBpcyB0aGUgcHJpbWFyeSB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbn0gb2YgdGhlIG93bmluZ1xuXHQgKiB7QGxpbmsgQ29waWxvdFNlc3Npb25FbnRyeX0uXG5cdCAqL1xuXHRwcml2YXRlIF9maW5kQW55U2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKT8uZGVmYXVsdENoYXQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSdW50aW1lU2xhc2hDb21tYW5kcyhzZXNzaW9uSWQ6IHN0cmluZywgb3B0aW9ucz86IElDb3BpbG90UnVudGltZVNsYXNoQ29tbWFuZFF1ZXJ5T3B0aW9ucykge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9maW5kQW55U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbi5nZXRSdW50aW1lU2xhc2hDb21tYW5kcyhvcHRpb25zKSA/PyBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NsYXNoQ29tbWFuZFByb3ZpZGVyLmdldFNsYXNoQ29tbWFuZHMob3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhIGxpdmUgcGVlciAobm9uLWRlZmF1bHQpIGNoYXQgXHUyMDE0IGl0cyBvd24gU0RLIGNoYXQgXHUyMDE0IGJ5XG5cdCAqIGxvb2tpbmcgaXQgdXAgd2l0aGluIHRoZSBvd25pbmcgc2Vzc2lvbidzIGVudHJ5LiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW5cblx0ICogdGhlIHNlc3Npb24gKG9yIHRoZSBwZWVyIGNoYXQpIGlzIG5vdCBpbiBtZW1vcnkuXG5cdCAqL1xuXHRwcml2YXRlIF9maW5kUGVlckNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBDb3BpbG90QWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSk/LmdldFBlZXJDaGF0KGNoYXQudG9TdHJpbmcoKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBvd25pbmcgc2Vzc2lvbidzIGVudHJ5LCBjcmVhdGluZyBhbiBlbXB0eSBvbmUgKG5vIGRlZmF1bHQgY2hhdFxuXHQgKiB5ZXQpIGlmIG5lZWRlZCBzbyBhIHBlZXIgY2hhdCBjYW4gYmUgaG9zdGVkIG9uIGEgc3RpbGwtcHJvdmlzaW9uYWwgcGFyZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlRW50cnkoc2Vzc2lvbklkOiBzdHJpbmcpOiBDb3BpbG90U2Vzc2lvbkVudHJ5IHtcblx0XHRsZXQgZW50cnkgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRlbnRyeSA9IG5ldyBDb3BpbG90U2Vzc2lvbkVudHJ5KCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBlbnRyeSk7XG5cdFx0fVxuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGF0LWFkZHJlc3NlZCBzdXJmYWNlIGZvciB0aGUgY2hhdHMgd2l0aGluIGEgc2Vzc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IGNoYXRzOiBJQWdlbnRDaGF0cyA9IHtcblx0XHRjcmVhdGVDaGF0OiAoY2hhdDogVVJJLCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgfCB2b2lkPiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQ2hhdChjaGF0LCBvcHRpb25zKTtcblx0XHR9LFxuXHRcdGZvcms6IChjaGF0OiBVUkksIHNvdXJjZTogSUFnZW50Q3JlYXRlQ2hhdEZvcmtTb3VyY2UsIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVDaGF0KGNoYXQsIHsgLi4ub3B0aW9ucywgZm9yazogc291cmNlIH0pO1xuXHRcdH0sXG5cdFx0ZGlzcG9zZUNoYXQ6IChjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdFVyaSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGlzcG9zZUNoYXQoc2Vzc2lvbiwgY2hhdCk7XG5cdFx0fSxcblx0XHRzZW5kTWVzc2FnZTogKGNoYXRVcmk6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBzZW5kZXJDbGllbnRJZD86IHN0cmluZywgY2xpZW50VHlwZT86IEFnZW50SG9zdENsaWVudFR5cGUpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kTWVzc2FnZShjaGF0VXJpLCBwcm9tcHQsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlLCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdH0sXG5cdFx0YWJvcnQ6IChjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hYm9ydFNlc3Npb24oY2hhdFVyaSk7XG5cdFx0fSxcblx0XHRjaGFuZ2VNb2RlbDogKGNoYXRVcmk6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2hhbmdlTW9kZWwoY2hhdFVyaSwgbW9kZWwpO1xuXHRcdH0sXG5cdFx0Y2hhbmdlQWdlbnQ6IChjaGF0VXJpOiBVUkksIGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYW5nZUFnZW50KGNoYXRVcmksIGFnZW50KTtcblx0XHR9LFxuXHRcdGdldE1lc3NhZ2VzOiAoY2hhdDogVVJJKTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmdldFNlc3Npb25NZXNzYWdlcyhjaGF0KTtcblx0XHR9LFxuXHR9O1xuXG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oY29uZmlnPzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyk6IFByb21pc2U8SUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlc3Npb25Db25maWcgPSBjb25maWcgPz8ge307XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBDcmVhdGluZyBzZXNzaW9uLi4uICR7c2Vzc2lvbkNvbmZpZy5tb2RlbCA/IGBtb2RlbD0ke3Nlc3Npb25Db25maWcubW9kZWwuaWR9YCA6ICcnfWApO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHNlc3Npb25Db25maWcuc2Vzc2lvbiA/IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uQ29uZmlnLnNlc3Npb24pIDogZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Ly8gV29ya3NwYWNlLWxlc3MgaXMgaW5mZXJyZWQgYXQgY3JlYXRlIGZyb20gYW4gYWJzZW50IGlucHV0XG5cdFx0Ly8gYHdvcmtpbmdEaXJlY3RvcnlgOiBzdWNoIGEgc2Vzc2lvbiBpcyBydW4gaW4gYSBzdGFibGUgc2NyYXRjaCBkaXIuIFRoZVxuXHRcdC8vIEFIIHNlcnZpY2UgcGVyc2lzdHMgdGhlIG1hcmtlciBjZW50cmFsbHkgKGBhZ2VudEhvc3Qud29ya3NwYWNlbGVzc2ApIGFuZFxuXHRcdC8vIGhhbmRzIGl0IGJhY2sgb24gcmVzdG9yZTsgdGhlIGFnZW50IG9ubHkgcmVhZHMgaXQgKG5ldmVyIHBlcnNpc3RzIGl0KSB0b1xuXHRcdC8vIHBpY2sgdGhlIHdvcmtzcGFjZS1sZXNzIHN5c3RlbSBwcm9tcHQuIEZvcmtzIGFsd2F5cyBpbmhlcml0IHRoZSBzb3VyY2Vcblx0XHQvLyBzZXNzaW9uJ3MgY29udGV4dCwgc28gdGhleSBhcmUgbmV2ZXIgaW5mZXJyZWQgd29ya3NwYWNlLWxlc3MgZXZlbiB3aGVuIG5vXG5cdFx0Ly8gYHdvcmtpbmdEaXJlY3RvcnlgIGlzIHBhc3NlZC5cblx0XHRjb25zdCBpc1dvcmtzcGFjZWxlc3MgPSAhc2Vzc2lvbkNvbmZpZy5mb3JrICYmIHNlc3Npb25Db25maWcud29ya2luZ0RpcmVjdG9yaWVzID09PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVDcmVhdGVXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25Db25maWcsIHNlc3Npb25JZCwgaXNXb3Jrc3BhY2VsZXNzKTtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9lbnN1cmVDbGllbnQoKTtcblx0XHQvLyBXaGVuIGZvcmtpbmcsIHVzZSB0aGUgU0RLJ3Mgc2Vzc2lvbnMuZm9yayBSUEMuIEZvcmtpbmcgZnJvbSBhIHNvdXJjZVxuXHRcdC8vIHNlc3Npb24gdGhhdCBoYXMgbm8gdHVybnMgaXMgZXF1aXZhbGVudCB0byBjcmVhdGluZyBhIGZyZXNoIHNlc3Npb247XG5cdFx0Ly8gaW4gdGhhdCBjYXNlIHRoZSBhZ2VudCBzZXJ2aWNlIGRyb3BzIGBjb25maWcuZm9ya2AgYmVmb3JlIGNhbGxpbmcgdXMsXG5cdFx0Ly8gc28gd2UgbmV2ZXIgZW50ZXIgdGhpcyBicmFuY2ggd2l0aCBhIHByb3Zpc2lvbmFsIHNvdXJjZS5cblx0XHRpZiAoc2Vzc2lvbkNvbmZpZy5mb3JrKSB7XG5cdFx0XHRjb25zdCBzb3VyY2VTZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbkNvbmZpZy5mb3JrLnNlc3Npb24pO1xuXG5cdFx0XHQvLyBTZXJpYWxpemUgYWdhaW5zdCB0aGUgc291cmNlIHNlc3Npb24gdG8gcHJldmVudCBjb25jdXJyZW50XG5cdFx0XHQvLyBtb2RpZmljYXRpb25zIHdoaWxlIHdlIHJlYWQgaXRzIHN0YXRlLlxuXHRcdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoc291cmNlU2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIEZvcmtpbmcgc2Vzc2lvbiAke3NvdXJjZVNlc3Npb25JZH0gYXQgdHVybklkPSR7c2Vzc2lvbkNvbmZpZy5mb3JrIS50dXJuSWR9YCk7XG5cblx0XHRcdFx0Y29uc3Qgc291cmNlRW50cnkgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihzb3VyY2VTZXNzaW9uSWQpID8/IGF3YWl0IHRoaXMuX3Jlc3VtZVNlc3Npb24oc291cmNlU2Vzc2lvbklkKTtcblxuXHRcdFx0XHQvLyBMb29rIHVwIHRoZSBTREsgZXZlbnQgSUQgZm9yIHRoZSB0dXJuICphZnRlciogdGhlIGZvcmsgcG9pbnQuXG5cdFx0XHRcdC8vIHRvRXZlbnRJZCBpcyBleGNsdXNpdmUgXHUyMDE0IGV2ZW50cyBiZWZvcmUgaXQgYXJlIGluY2x1ZGVkLlxuXHRcdFx0XHQvLyBJZiB0aGVyZSdzIG5vIG5leHQgdHVybiwgb21pdCB0b0V2ZW50SWQgdG8gaW5jbHVkZSBhbGwgZXZlbnRzLlxuXHRcdFx0XHRjb25zdCB0b0V2ZW50SWQgPSBhd2FpdCBzb3VyY2VFbnRyeS5nZXROZXh0VHVybkV2ZW50SWQoc2Vzc2lvbkNvbmZpZy5mb3JrIS50dXJuSWQpO1xuXG5cdFx0XHRcdGNvbnN0IGZvcmtSZXN1bHQgPSBhd2FpdCBjbGllbnQucnBjLnNlc3Npb25zLmZvcmsoe1xuXHRcdFx0XHRcdHNlc3Npb25JZDogc291cmNlU2Vzc2lvbklkLFxuXHRcdFx0XHRcdC4uLih0b0V2ZW50SWQgPyB7IHRvRXZlbnRJZCB9IDoge30pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgbmV3U2Vzc2lvbklkID0gZm9ya1Jlc3VsdC5zZXNzaW9uSWQ7XG5cblx0XHRcdFx0Ly8gQ29weSB0aGUgc291cmNlIHNlc3Npb24ncyBkYXRhYmFzZSB1c2luZyBWQUNVVU0gSU5UTyBzbyB0aGVcblx0XHRcdFx0Ly8gZm9ya2VkIHNlc3Npb24gaW5oZXJpdHMgdHVybiBldmVudCBJRHMgYW5kIGZpbGUtZWRpdCBzbmFwc2hvdHMuXG5cdFx0XHRcdC8vIFZBQ1VVTSBJTlRPIGlzIHNhZmUgZXZlbiB3aGlsZSB0aGUgc291cmNlIERCIGlzIG9wZW4uXG5cdFx0XHRcdGNvbnN0IHRhcmdldERiRGlyID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLmdldFNlc3Npb25EYXRhRGlyQnlJZChuZXdTZXNzaW9uSWQpO1xuXHRcdFx0XHRjb25zdCB0YXJnZXREYlBhdGggPSBVUkkuam9pblBhdGgodGFyZ2V0RGJEaXIsIFNFU1NJT05fREJfRklMRU5BTUUpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHNvdXJjZURiUmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzZXNzaW9uQ29uZmlnLmZvcmshLnNlc3Npb24pO1xuXHRcdFx0XHRcdGlmIChzb3VyY2VEYlJlZikge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgZnMubWtkaXIodGFyZ2V0RGJEaXIuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdFx0Ly8gVkFDVVVNIElOVE8gZmFpbHMgaWYgdGhlIHRhcmdldCBhbHJlYWR5IGV4aXN0czsgY2xlYXJcblx0XHRcdFx0XHRcdFx0Ly8gYW55IHN0YWxlIERCIGxlZnQgYnkgYSBwcmV2aW91cyAoZS5nLiBjcmFzaGVkKSBhdHRlbXB0LlxuXHRcdFx0XHRcdFx0XHRhd2FpdCBmcy5ybSh0YXJnZXREYlBhdGguZnNQYXRoLCB7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBzb3VyY2VEYlJlZi5vYmplY3QudmFjdXVtSW50byh0YXJnZXREYlBhdGguZnNQYXRoKTtcblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdHNvdXJjZURiUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byBjb3B5IHNlc3Npb24gZGF0YWJhc2UgZm9yIGZvcms6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVzdW1lIHRoZSBmb3JrZWQgc2Vzc2lvbiBzbyB0aGUgU0RLIGxvYWRzIHRoZSBmb3JrZWQgaGlzdG9yeVxuXHRcdFx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSBhd2FpdCB0aGlzLl9yZXN1bWVTZXNzaW9uKG5ld1Nlc3Npb25JZCk7XG5cblx0XHRcdFx0Ly8gUmVtYXAgdHVybiBJRHMgdG8gbWF0Y2ggdGhlIG5ldyBwcm90b2NvbCB0dXJuIElEc1xuXHRcdFx0XHRpZiAoc2Vzc2lvbkNvbmZpZy5mb3JrIS50dXJuSWRNYXBwaW5nKSB7XG5cdFx0XHRcdFx0YXdhaXQgYWdlbnRTZXNzaW9uLnJlbWFwVHVybklkcyhzZXNzaW9uQ29uZmlnLmZvcmshLnR1cm5JZE1hcHBpbmcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGFnZW50U2Vzc2lvbi5zZXNzaW9uVXJpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBGb3JrZWQgc2Vzc2lvbiBjcmVhdGVkOiAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblxuXHRcdFx0XHQvLyBDb3B5IHRoZSBzb3VyY2Ugc2Vzc2lvbidzIHJldmlld2VkIHJlZiBzbyB0aGUgZm9yayBzdGFydHMgd2l0aFxuXHRcdFx0XHQvLyB0aGUgcGFyZW50J3MgcmV2aWV3IHByb2dyZXNzIChiZXN0LWVmZm9ydDsgYSBmYWlsdXJlIGp1c3QgbWVhbnNcblx0XHRcdFx0Ly8gdGhlIGZvcmsgc3RhcnRzIHVucmV2aWV3ZWQpLlxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jldmlld1NlcnZpY2UuY29weVJldmlld2VkUmVmKHNlc3Npb25Db25maWcuZm9yayEuc2Vzc2lvbi50b1N0cmluZygpLCBzZXNzaW9uLnRvU3RyaW5nKCksIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBGYWlsZWQgdG8gY29weSByZXZpZXdlZCByZWYgZm9yIGZvcms6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcHJvamVjdCA9IGF3YWl0IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQoeyBjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25NZXRhZGF0YShzZXNzaW9uLCBzZXNzaW9uQ29uZmlnLm1vZGVsLCB3b3JraW5nRGlyZWN0b3J5LCBzZXNzaW9uQ29uZmlnLndvcmtpbmdEaXJlY3RvcmllcyA/PyAod29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCksIHdvcmtpbmdEaXJlY3RvcnksIHByb2plY3QsIHRydWUpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbkNvbmZpZy5hZ2VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc3RvcmVTZXNzaW9uQWdlbnRNZXRhZGF0YShzZXNzaW9uLCBzZXNzaW9uQ29uZmlnLmFnZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uLCByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnksIC4uLihwcm9qZWN0ID8geyBwcm9qZWN0IH0gOiB7fSkgfTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChzZXNzaW9uQ29uZmlnLmltcG9ydENvbnZlcnNhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ltcG9ydENvbnZlcnNhdGlvbihzZXNzaW9uQ29uZmlnLCBzZXNzaW9uSWQsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdH1cblxuXHRcdC8vIE5vbi1mb3JrIHBhdGg6IGNyZWF0ZSBhICpwcm92aXNpb25hbCogc2Vzc2lvbi4gVGhlIENvcGlsb3QgU0RLXG5cdFx0Ly8gc2Vzc2lvbiwgdGhlIHdvcmt0cmVlIChpZiBhbnkpLCBhbmQgdGhlIG9uLWRpc2sgbWV0YWRhdGEgYXJlIGFsbFxuXHRcdC8vIGRlZmVycmVkIHVudGlsIHRoZSBmaXJzdCB7QGxpbmsgc2VuZE1lc3NhZ2V9IHZpYVxuXHRcdC8vIHtAbGluayBfbWF0ZXJpYWxpemVQcm92aXNpb25hbH0uIFVudGlsIHRoZW4gdGhpcyBzZXNzaW9uIG9jY3VwaWVzXG5cdFx0Ly8gb25seSBhbiBpbi1tZW1vcnkgc2xvdCBwbHVzIGEgc3RhdGUtbWFuYWdlciBlbnRyeSwgc28gYSB3b3Jrc3BhY2Vcblx0XHQvLyBzd2l0Y2ggKG9yIHF1aWNrIGNsb3NlKSBjb3N0cyBub3RoaW5nIG9uIGRpc2suXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbklkKTtcblxuXHRcdC8vIElkZW1wb3RlbmN5IGZvciBhbHJlYWR5LW1hdGVyaWFsaXplZCBzZXNzaW9uczogYSBkdXBsaWNhdGVcblx0XHQvLyBgY3JlYXRlU2Vzc2lvbmAgZm9yIGEgVVJJIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBwcm9tb3RlZCB0byBhIHJlYWxcblx0XHQvLyBTREsgc2Vzc2lvbiAob3IgcmVzdG9yZWQgZnJvbSBkaXNrKSBpcyBhIG5vLW9wOyB3ZSByZXR1cm4gdGhlXG5cdFx0Ly8gbm9uLXByb3Zpc2lvbmFsIHJlc3VsdCBzbyB0aGUgY2FsbGVyIGRvZXNuJ3QgcmUtZmlyZSBgU2Vzc2lvbkFkZGVkYC5cblx0XHQvLyBUaGlzIGd1YXJkcyBhZ2FpbnN0IGNsaWVudCByZXRyaWVzIHRoYXQgcmFjZSBhIHN1Y2Nlc3NmdWwgZmlyc3Rcblx0XHQvLyBtZXNzYWdlLlxuXHRcdGlmICh0aGlzLl9maW5kQW55U2Vzc2lvbihzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBjcmVhdGVTZXNzaW9uIGlzIGEgbm8tb3A6IHNlc3Npb24gYWxyZWFkeSBtYXRlcmlhbGl6ZWQ6ICR7c2Vzc2lvblVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0Y29uc3QgcHJvamVjdCA9IGF3YWl0IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQoeyBjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvblVyaSwgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5LCAuLi4ocHJvamVjdCA/IHsgcHJvamVjdCB9IDoge30pIH07XG5cdFx0fVxuXG5cdFx0Ly8gSWRlbXBvdGVudDogYSBkdXBsaWNhdGUgYGNyZWF0ZVNlc3Npb25gIGZvciBhIHN0aWxsLXByb3Zpc2lvbmFsIFVSSVxuXHRcdC8vIChlLmcuIGEgY2xpZW50IHJldHJpZWQgb24gcmVjb25uZWN0IHdpdGggdGhlIHNhbWUgVVJJKSBrZWVwcyB0aGVcblx0XHQvLyBleGlzdGluZyByZWNvcmQuIFdlIGRlbGliZXJhdGVseSBkbyBOT1Qgb3ZlcndyaXRlIGBtb2RlbGAgb3Jcblx0XHQvLyBgd29ya2luZ0RpcmVjdG9yeWA6IGEgcmUtY3JlYXRlIHBheWxvYWQgZnJvbSBhIGZyZXNoIGNvbm5lY3Rpb24gc2VuZHNcblx0XHQvLyB0aGUgZWFnZXItY3JlYXRlIGRlZmF1bHRzIChtb2RlbDogdW5kZWZpbmVkLCB0aGUgc2FtZSB3b3JraW5nRGlyZWN0b3J5KSxcblx0XHQvLyB3aGljaCB3b3VsZCBjbG9iYmVyIHRoZSB1c2VyJ3Mgc2VsZWN0aW9ucyBhY2N1bXVsYXRlZCBzaW5jZSB0aGVcblx0XHQvLyBvcmlnaW5hbCBjcmVhdGUuIFRoZSBhY3RpdmUtY2xpZW50IC8gcGx1Z2luIHN5bmMgYmVsb3cgc3RpbGwgcnVucyBzb1xuXHRcdC8vIHRoZSBuZXcgY29ubmVjdGlvbidzIGNsYWltIHRha2VzIGVmZmVjdC5cblx0XHRjb25zdCBhbHJlYWR5UHJvdmlzaW9uYWwgPSB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmhhcyhzZXNzaW9uSWQpO1xuXG5cdFx0Ly8gU2VlZCBhY3RpdmUtY2xpZW50IHNuYXBzaG90IGlmIHRoZSBjbGllbnQgY2xhaW1lZCBpdCBlYWdlcmx5LiBUaGlzXG5cdFx0Ly8gcnVucyBpZGVudGljYWxseSBmb3IgcHJvdmlzaW9uYWwgYW5kIHJlYWwgc2Vzc2lvbnM7IHRoZSBTREsgc2lkZVxuXHRcdC8vIG9mIGFjdGl2ZUNsaWVudCBzdGF0ZSBpc24ndCBlbmdhZ2VkIHVudGlsIG1hdGVyaWFsaXphdGlvbi5cblx0XHRpZiAoc2Vzc2lvbkNvbmZpZy5hY3RpdmVDbGllbnQpIHtcblx0XHRcdGNvbnN0IGFjID0gdGhpcy5fZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvblVyaSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHQvLyBNdWx0aS1yb290OiBhbmNob3IgZGlzY292ZXJ5IHRvIHRoZSBhZGRpdGlvbmFsIChub24tcHJpbWFyeSkgcm9vdHMgdG9vLCBzbyBhXG5cdFx0XHQvLyBzdGlsbC1wcm92aXNpb25hbCAocHJlLXNlbmQpIGNoYXQgc3VyZmFjZXMgY3VzdG9taXphdGlvbnMgZnJvbSBldmVyeSBmb2xkZXIgXHUyMDE0IG5vdFxuXHRcdFx0Ly8ganVzdCB0aGUgcHJpbWFyeS4gRW1wdHkgd2hlbiBzaW5nbGUtcm9vdCAvIGdhdGVkIG9mZiAoYnl0ZS1pZGVudGljYWwpLlxuXHRcdFx0YWMucGx1Z2luQ29udHJvbGxlci5zZXRBZGRpdGlvbmFsRGlyZWN0b3JpZXModGhpcy5fYWRkaXRpb25hbEN1c3RvbWl6YXRpb25EaXJlY3RvcmllcyhzZXNzaW9uQ29uZmlnLndvcmtpbmdEaXJlY3RvcmllcykpO1xuXHRcdFx0Y29uc3Qgc2VlZGVkID0gc2Vzc2lvbkNvbmZpZy5hY3RpdmVDbGllbnQ7XG5cdFx0XHRhYy50b29sU2V0LnNldChzZWVkZWQuY2xpZW50SWQsIHNlZWRlZC50b29scyk7XG5cdFx0XHRhYy5nZXRPckNyZWF0ZUhhbmRsZShzZWVkZWQuY2xpZW50SWQsIHNlZWRlZC5kaXNwbGF5TmFtZSk7XG5cdFx0XHRpZiAoc2VlZGVkLmN1c3RvbWl6YXRpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gUHJvdmlzaW9uYWwgZWFnZXItY3JlYXRlOiBubyBzZXNzaW9uLXN0YXRlIGxpc3RlbmVyIGlzXG5cdFx0XHRcdC8vIGhvb2tlZCB1cCB5ZXQsIHNvIHN1cHByZXNzIGFjdGlvbiBldmVudHMuIFRoZSBzZXNzaW9uXG5cdFx0XHRcdC8vIHJlYWRzIHRoZSBmaW5hbCB2aWV3IHZpYSBpdHMgaW5pdGlhbCBzbmFwc2hvdCBvbmNlIGl0XG5cdFx0XHRcdC8vIG1hdGVyaWFsaXplcy5cblx0XHRcdFx0YXdhaXQgYWMucGx1Z2luQ29udHJvbGxlci5zeW5jKHNlZWRlZC5jbGllbnRJZCwgc2VlZGVkLmN1c3RvbWl6YXRpb25zLCB7IHF1aWV0OiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbXB1dGUgcHJvamVjdCBtZXRhZGF0YSBjaGVhcGx5IGZyb20gdGhlIG9yaWdpbmFsIHdvcmtpbmcgZGlyLlxuXHRcdC8vIFdvcmt0cmVlcyBhcmVuJ3QgY3JlYXRlZCB1bnRpbCBtYXRlcmlhbGl6YXRpb24sIHNvIHRoZSBwcm9qZWN0IGlzXG5cdFx0Ly8gcmVwb3J0ZWQgcmVsYXRpdmUgdG8gdGhlIHVzZXIncyBjaG9zZW4gZm9sZGVyLlxuXHRcdGNvbnN0IHByb2plY3QgPSBhd2FpdCBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0KHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCB9LCB0aGlzLl9naXRTZXJ2aWNlKTtcblxuXHRcdGlmICghYWxyZWFkeVByb3Zpc2lvbmFsKSB7XG5cdFx0XHR0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLnNldChzZXNzaW9uSWQsIHtcblx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHNlc3Npb25Db25maWcud29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRtb2RlbDogc2Vzc2lvbkNvbmZpZy5tb2RlbCxcblx0XHRcdFx0YWdlbnQ6IHNlc3Npb25Db25maWcuYWdlbnQsXG5cdFx0XHRcdHByb2plY3QsXG5cdFx0XHRcdHdvcmtzcGFjZWxlc3M6IGlzV29ya3NwYWNlbGVzcyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFNlc3Npb24gY3JlYXRlZCAocHJvdmlzaW9uYWwpOiAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX1gKTtcblx0XHRyZXR1cm4geyBzZXNzaW9uOiBzZXNzaW9uVXJpLCByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnksIHByb3Zpc2lvbmFsOiB0cnVlLCAuLi4ocHJvamVjdCA/IHsgcHJvamVjdCB9IDoge30pIH07XG5cdH1cblxuXHQvKipcblx0ICogTWF0ZXJpYWxpemVzIGFuIGltcG9ydGVkIGNvbnZlcnNhdGlvbiBpbnRvIGEgcmVhbCwgZWRpdGFibGUgQ29waWxvdFxuXHQgKiBzZXNzaW9uLiBUcmFuc2xhdGVzIHRoZSBzdXBwbGllZCB0dXJucyBpbnRvIGEgQ29waWxvdCBldmVudCBsb2csIHNlZWRzIGl0XG5cdCAqIGF0IHRoZSBDTEkncyBuYXRpdmUgcGVyLXNlc3Npb24gc3RvcmUsIHRoZW4gcmVzdW1lcyB0aGUgc2Vzc2lvbiBzbyB0aGVcblx0ICogU0RLIHJlY29uc3RpdHV0ZXMgdGhlIHR1cm5zIGFzIGdlbnVpbmUgYmFja2VuZCBldmVudHMgKGVkaXRhYmxlIC8gZm9ya2FibGVcblx0ICogLyB0cnVuY2F0YWJsZSkuIFRoZSB0dXJucyBhcnJpdmUgd2l0aCBmcmVzaCBVVUlEIGlkcyBhc3NpZ25lZCBieSB0aGVcblx0ICogc2VydmljZSBsYXllciwgc28gdGhlIHNlZWRlZCBldmVudCBpZHMgYW5kIHRoZSBzZWVkZWQgcHJvdG9jb2wgdHVybnMgc3RheVxuXHQgKiBhbGlnbmVkLiBNaXJyb3JzIHRoZSBpbW1lZGlhdGUtbWF0ZXJpYWxpemF0aW9uIHNoYXBlIG9mIHRoZSBmb3JrIHBhdGguXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pbXBvcnRDb252ZXJzYXRpb24oc2Vzc2lvbkNvbmZpZzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZywgc2Vzc2lvbklkOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8SUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGltcG9ydENvbmZpZyA9IHNlc3Npb25Db25maWcuaW1wb3J0Q29udmVyc2F0aW9uITtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZXNzaW9uSWQpO1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gSW1wb3J0aW5nIGNvbnZlcnNhdGlvbiBpbnRvIHNlc3Npb24gJHtzZXNzaW9uSWR9ICgke2ltcG9ydENvbmZpZy50dXJucy5sZW5ndGh9IHR1cm5zKWApO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBpbXBvcnRDb25maWcubW9kZWwgPz8gc2Vzc2lvbkNvbmZpZy5tb2RlbDtcblxuXHRcdFx0Ly8gVHJhbnNsYXRlIHRoZSBjb252ZXJzYXRpb24gYW5kIHNlZWQgaXQgYXQgdGhlIENMSSdzIG5hdGl2ZVxuXHRcdFx0Ly8gcGVyLXNlc3Npb24gc3RvcmUgc28gYSBub3JtYWwgcmVzdW1lIHJlY29uc3RpdHV0ZXMgZWRpdGFibGUgdHVybnMuXG5cdFx0XHQvLyBEZXRlY3QgdGhlIHByb2plY3QgY29uY3VycmVudGx5IHdpdGggdGhlIChpbmRlcGVuZGVudCkgZXZlbnQtbG9nIHdyaXRlXG5cdFx0XHQvLyBzbyB0aGUgZ2l0IHByb2JlIGFuZCBmaWxlIEkvTyBvdmVybGFwIG9uIHRoZSBzZXNzaW9uLWNyZWF0aW9uIHBhdGguXG5cdFx0XHRjb25zdCBwcm9qZWN0UHJvbWlzZSA9IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQoeyBjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZXZlbnRzUGF0aCA9IGpvaW4oZ2V0Q29waWxvdEhvbWVQYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgsIHByb2Nlc3MuZW52KSwgJ3Nlc3Npb24tc3RhdGUnLCBzZXNzaW9uSWQsICdldmVudHMuanNvbmwnKTtcblx0XHRcdGNvbnN0IGpzb25sID0gYnVpbGRTZXNzaW9uRXZlbnRMb2dGcm9tVHVybnMoaW1wb3J0Q29uZmlnLnR1cm5zLCB7XG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeS5mc1BhdGgsXG5cdFx0XHRcdG1vZGVsOiBtb2RlbD8uaWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGZzLm1rZGlyKGRpcm5hbWUoZXZlbnRzUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKGV2ZW50c1BhdGgsIGpzb25sLCAndXRmOCcpO1xuXG5cdFx0XHQvLyBQZXJzaXN0IG1ldGFkYXRhIGJlZm9yZSByZXN1bWUgc28gYF9yZXN1bWVTZXNzaW9uYCBjYW4gcmVzb2x2ZSB0aGVcblx0XHRcdC8vIHdvcmtpbmcgZGlyZWN0b3J5IGFuZCBtb2RlbC5cblx0XHRcdGNvbnN0IHByb2plY3QgPSBhd2FpdCBwcm9qZWN0UHJvbWlzZTtcblx0XHRcdGF3YWl0IHRoaXMuX3N0b3JlU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb25VcmksIG1vZGVsLCB3b3JraW5nRGlyZWN0b3J5LCBzZXNzaW9uQ29uZmlnLndvcmtpbmdEaXJlY3RvcmllcyA/PyAod29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCksIHdvcmtpbmdEaXJlY3RvcnksIHByb2plY3QpO1xuXHRcdFx0aWYgKHNlc3Npb25Db25maWcuYWdlbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25BZ2VudE1ldGFkYXRhKHNlc3Npb25VcmksIHNlc3Npb25Db25maWcuYWdlbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXN1bWUgc28gdGhlIFNESyBsb2FkcyB0aGUgc2VlZGVkIGhpc3RvcnkgYXMgZWRpdGFibGUgdHVybnMuXG5cdFx0XHRhd2FpdCB0aGlzLl9yZXN1bWVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBJbXBvcnRlZCBzZXNzaW9uIGNyZWF0ZWQ6ICR7c2Vzc2lvblVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvblVyaSwgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5LCAuLi4ocHJvamVjdCA/IHsgcHJvamVjdCB9IDoge30pIH07XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvbW90ZXMgYSB7QGxpbmsgSVByb3Zpc2lvbmFsU2Vzc2lvbn0gaW50byBhIHJlYWwgQ29waWxvdCBTREsgc2Vzc2lvblxuXHQgKiBieSBwZXJmb3JtaW5nIHRoZSB3b3JrIHRoYXQge0BsaW5rIGNyZWF0ZVNlc3Npb259IHByZXZpb3VzbHkgZGlkXG5cdCAqIGVhZ2VybHk6IHJlc29sdmVzIHRoZSB3b3JraW5nIGRpcmVjdG9yeSAoY3JlYXRpbmcgYSB3b3JrdHJlZSBpZlxuXHQgKiBgaXNvbGF0aW9uID09PSAnd29ya3RyZWUnYCksIGluc3RhbnRpYXRlcyB0aGUge0BsaW5rIENvcGlsb3RBZ2VudFNlc3Npb259LFxuXHQgKiBwZXJzaXN0cyBzZXNzaW9uIG1ldGFkYXRhLCBhbmQgbm90aWZpZXMgdGhlIHtAbGluayBJQWdlbnRTZXJ2aWNlfSB2aWFcblx0ICoge0BsaW5rIG9uRGlkTWF0ZXJpYWxpemVTZXNzaW9ufSBzbyBpdCBjYW4gZmlyZSB0aGUgZGVmZXJyZWRcblx0ICogYHNlc3Npb25BZGRlZGAgcHJvdG9jb2wgbm90aWZpY2F0aW9uLlxuXHQgKlxuXHQgKiBDYWxsZWQgZnJvbSB7QGxpbmsgc2VuZE1lc3NhZ2V9IGltbWVkaWF0ZWx5IGJlZm9yZSBhIHR1cm4gaXMgZGlzcGF0Y2hlZC5cblx0ICogQWxyZWFkeSBydW5zIGluc2lkZSB0aGUgc2Vzc2lvbiBzZXF1ZW5jZXIsIHNvIGNvbmN1cnJlbnQgc2VuZHMgc2VyaWFsaXplXG5cdCAqIG5hdHVyYWxseS5cblx0ICpcblx0ICogVGhlIGxhdGVzdCBtb2RlbCBsaXZlcyBvbiB0aGUgcHJvdmlzaW9uYWwgcmVjb3JkIChrZXB0IGluIHN5bmMgdmlhXG5cdCAqIHtAbGluayBjaGFuZ2VNb2RlbH0pLiBUaGUgbGF0ZXN0IHByb3ZpZGVyLW93bmVkIHNlc3Npb24gY29uZmlnIGlzIHJlYWRcblx0ICogc3RyYWlnaHQgZnJvbSB0aGUgc3RhdGUgbWFuYWdlciB2aWFcblx0ICoge0BsaW5rIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXN9IHNvIGFueVxuXHQgKiBgU2Vzc2lvbkNvbmZpZ0NoYW5nZWRgIGFjdGlvbnMgdGhhdCBhcnJpdmVkIGFmdGVyIGBjcmVhdGVTZXNzaW9uYCBhcmVcblx0ICogaG9ub3VyZWQgd2l0aG91dCBiZXNwb2tlIGZvcndhcmRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9tYXRlcmlhbGl6ZVByb3Zpc2lvbmFsKHNlc3Npb25JZDogc3RyaW5nLCByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdKTogUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPiB7XG5cdFx0Y29uc3QgcHJvdmlzaW9uYWwgPSB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghcHJvdmlzaW9uYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IG1hdGVyaWFsaXplIHVua25vd24gcHJvdmlzaW9uYWwgc2Vzc2lvbjogJHtzZXNzaW9uSWR9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNsaWVudCgpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBwcm92aXNpb25hbC5zZXNzaW9uVXJpO1xuXG5cdFx0Ly8gVGhlIGhvc3QgaGFuZHMgdXMgdGhlIHJlc29sdmVkIHdvcmtpbmcgZGlyZWN0b3JpZXMgKGFuIGlzb2xhdGVkIHdvcmt0cmVlIGZvclxuXHRcdC8vIHdvcmt0cmVlIGlzb2xhdGlvbikgb24gdGhlIGZpcnN0IHNlbmQ7IHVzZSBpbmRleCAwICh0aGUgcHJvY2VzcyByb290KSBzbyB0aGVcblx0XHQvLyBTREsgc3VicHJvY2VzcyBzcGF3bnMgaW4gaXQuIEZhbGxzIGJhY2sgdG8gdGhlIGZvbGRlciAvIHNjcmF0Y2ggZGlyIGNhcHR1cmVkXG5cdFx0Ly8gYXQgY3JlYXRlIHRpbWUgZm9yIGZvbGRlciAvIHdvcmtzcGFjZS1sZXNzIHNlc3Npb25zLlxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcmllcz8uWzBdID8/IHByb3Zpc2lvbmFsLndvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0Ly8gVGhlIGN1c3RvbWl6YXRpb24gYW5jaG9yIGZvbGxvd3MgdGhlIHdvcmtpbmcgZGlyZWN0b3J5OiBvbmNlIGEgd29ya3RyZWVcblx0XHQvLyBpcyBjcmVhdGVkIHRoZSBhZ2VudCBtdXN0IGRpc2NvdmVyIHNraWxscy9pbnN0cnVjdGlvbnMvYWdlbnRzIGZyb20gdGhlXG5cdFx0Ly8gd29ya3RyZWUgKG5vdCB0aGUgdXNlci1waWNrZWQgZm9sZGVyKSBzbyB0aGUgbW9kZWwgcmVhZHMgYW5kIGVkaXRzIGZpbGVzXG5cdFx0Ly8gaW4gdGhlIHdvcmt0cmVlIGl0IGFjdHVhbGx5IHJ1bnMgaW4uXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbkRpcmVjdG9yeSA9IHdvcmtpbmdEaXJlY3RvcnkgPz8gcHJvdmlzaW9uYWwud29ya2luZ0RpcmVjdG9yeTtcblx0XHQvLyBBbHdheXMgY3JlYXRlIGFuIEFjdGl2ZUNsaWVudCBzbyB0aGUgc25hcHNob3QgaW5jbHVkZXMgaG9zdCArXG5cdFx0Ly8gc2Vzc2lvbi1kaXNjb3ZlcmVkIGN1c3RvbWl6YXRpb25zLCBldmVuIHdoZW4gbm8gY2xpZW50IGhhc1xuXHRcdC8vIHJlZ2lzdGVyZWQgYW4gYWN0aXZlLWNsaWVudCBoYW5kbGUgeWV0LlxuXHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2dldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb25VcmksIGN1c3RvbWl6YXRpb25EaXJlY3RvcnkpO1xuXHRcdC8vIFJlLWFuY2hvciBpbiBjYXNlIHRoZSBwcm92aXNpb25hbCBhY3RpdmUgY2xpZW50IHdhcyBhbHJlYWR5IGJvdW5kIHRvIHRoZVxuXHRcdC8vIHVzZXItcGlja2VkIGZvbGRlciBiZWZvcmUgdGhlIHdvcmt0cmVlIGV4aXN0ZWQuXG5cdFx0YWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIucmVhbmNob3IoY3VzdG9taXphdGlvbkRpcmVjdG9yeSk7XG5cdFx0Ly8gTXVsdGktcm9vdDogYW5jaG9yIGN1c3RvbWl6YXRpb24gZGlzY292ZXJ5IHRvIHRoZSBhZGRpdGlvbmFsIHdvcmtzcGFjZVxuXHRcdC8vIHJvb3RzIChpbmRleCAxLi5OIG9mIHRoZSByZXNvbHZlZCBzZXQpLiBFbXB0eSB3aGVuIHNpbmdsZS1yb290IC8gZ2F0ZWQgb2ZmLlxuXHRcdGFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLnNldEFkZGl0aW9uYWxEaXJlY3Rvcmllcyh0aGlzLl9hZGRpdGlvbmFsQ3VzdG9taXphdGlvbkRpcmVjdG9yaWVzKHJlc29sdmVkV29ya2luZ0RpcmVjdG9yaWVzKSk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCBhY3RpdmVDbGllbnQuc25hcHNob3QoKTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIHNlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcnkpO1xuXG5cdFx0bGV0IGFnZW50U2Vzc2lvbjogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZEFnZW50ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUFnZW50V2hlbk1hdGVyaWFsaXppbmcocHJvdmlzaW9uYWwsIHNuYXBzaG90LCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGFnZW50ID0gcmVzb2x2ZWRBZ2VudD8uYWdlbnQ7XG5cdFx0XHRjb25zdCBsYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gPSB7XG5cdFx0XHRcdGtpbmQ6ICdjcmVhdGUnLFxuXHRcdFx0XHRjbGllbnQsXG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzOiByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcmllcz8uc2xpY2UoMSksXG5cdFx0XHRcdHJlc29sdmVkQWdlbnROYW1lOiByZXNvbHZlZEFnZW50Py5uYW1lLFxuXHRcdFx0XHRzbmFwc2hvdCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogYWN0aXZlQ2xpZW50LnRvb2xTZXQsXG5cdFx0XHRcdHNoZWxsTWFuYWdlcixcblx0XHRcdFx0Z2l0aHViVG9rZW46IHRoaXMuX2dpdGh1YlRva2VuLFxuXHRcdFx0XHRtb2RlbDogcHJvdmlzaW9uYWwubW9kZWwsXG5cdFx0XHRcdGxvbmdDb250ZXh0V2luZG93OiB0aGlzLl9sb25nQ29udGV4dFdpbmRvd0Zvcihwcm92aXNpb25hbC5tb2RlbD8uaWQpLFxuXHRcdFx0XHRmcmVlTG9uZ0NvbnRleHQ6IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KHByb3Zpc2lvbmFsLm1vZGVsPy5pZCksXG5cdFx0XHRcdHdvcmtzcGFjZWxlc3M6IHByb3Zpc2lvbmFsLndvcmtzcGFjZWxlc3MsXG5cdFx0XHR9O1xuXHRcdFx0YWdlbnRTZXNzaW9uID0gdGhpcy5fY3JlYXRlQWdlbnRTZXNzaW9uKGxhdW5jaFBsYW4sIGN1c3RvbWl6YXRpb25EaXJlY3RvcnksIGFjdGl2ZUNsaWVudCk7XG5cdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVySW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25JZCwgYWdlbnRTZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YWdlbnRTZXNzaW9uPy5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9qZWN0ID0gYXdhaXQgcHJvamVjdEZyb21Db3BpbG90Q29udGV4dCh7IGN3ZDogd29ya2luZ0RpcmVjdG9yeT8uZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXG5cdFx0Ly8gVGhlIHJlc29sdmVkIHJvb3Qgc2V0IChpbmRleCAwID0gcHJvY2VzcyByb290LCBlLmcuIGEgd29ya3RyZWUpLlxuXHRcdC8vIFNoYXJlZCBieSB0aGUgcGVyc2lzdGVkIG1ldGFkYXRhLCB0aGUgYmFzZWxpbmUgY2hlY2twb2ludCBhbmQgdGhlXG5cdFx0Ly8gbWF0ZXJpYWxpemUgcmVjZWlwdCBzbyBhbGwgdGhyZWUgYWdyZWUgb24gdGhlIHNhbWUgZGlyZWN0b3JpZXMuXG5cdFx0Y29uc3QgbWF0ZXJpYWxpemVkV29ya2luZ0RpcmVjdG9yaWVzID0gcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3JpZXMgPz8gKHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25NZXRhZGF0YShzZXNzaW9uVXJpLCBwcm92aXNpb25hbC5tb2RlbCwgd29ya2luZ0RpcmVjdG9yeSwgbWF0ZXJpYWxpemVkV29ya2luZ0RpcmVjdG9yaWVzLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5LCBwcm9qZWN0LCB0cnVlKTtcblx0XHRpZiAoYWdlbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc3RvcmVTZXNzaW9uQWdlbnRNZXRhZGF0YShzZXNzaW9uVXJpLCBhZ2VudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgcGVyLXNlc3Npb24gYmFzZWxpbmUgKHR1cm4vMCkgZ2l0IGNoZWNrcG9pbnQgc29cblx0XHQvLyBwZXItdHVybiBkaWZmcyBjb21wdXRlZCBvbiBgQ2hhdFR1cm5Db21wbGV0ZWAgY2FuIHJlZmxlY3QgdGhlXG5cdFx0Ly8gZnVsbCB3b3JraW5nLXRyZWUgZGVsdGEgXHUyMDE0IGluY2x1ZGluZyB0ZXJtaW5hbC10b29sIGVkaXRzIHRoYXQgYXJlXG5cdFx0Ly8gaW52aXNpYmxlIHRvIHRoZSBGaWxlRWRpdFRyYWNrZXIgcGlwZWxpbmUuIEJlc3QtZWZmb3J0OiBhXG5cdFx0Ly8gbm9uLWdpdCBmb2xkZXIgb3IgY2FwdHVyZSBmYWlsdXJlIGxlYXZlcyB0aGUgc2Vzc2lvbiBydW5uaW5nXG5cdFx0Ly8gd2l0aCB0aGUgbGVnYWN5IGBmaWxlX2VkaXRzYC1iYXNlZCBwZXItdHVybiBkaWZmIHBhdGguXG5cdFx0Ly9cblx0XHQvLyBUaGUgcmVzb2x2ZWQgZGlyZWN0b3JpZXMgYXJlIHBhc3NlZCBleHBsaWNpdGx5OiB0aGUgc3RhdGUgbWFuYWdlclxuXHRcdC8vIGRvZXMgbm90IGxlYXJuIGFib3V0IHRoZW0gdW50aWwgaXQgb2JzZXJ2ZXMgdGhlIG1hdGVyaWFsaXplIGV2ZW50XG5cdFx0Ly8gZmlyZWQgYmVsb3csIHNvIGEgbG9va3VwIGhlcmUgd291bGQgc3RpbGwgc2VlIHRoZSBwcmUtd29ya3RyZWUgc2V0LlxuXHRcdHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmNhcHR1cmVCYXNlbGluZUNoZWNrcG9pbnQoc2Vzc2lvblVyaSwgbWF0ZXJpYWxpemVkV29ya2luZ0RpcmVjdG9yaWVzKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEJhc2VsaW5lIGNoZWNrcG9pbnQgY2FwdHVyZSBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gU2Vzc2lvbiBtYXRlcmlhbGl6ZWQ6ICR7c2Vzc2lvblVyaS50b1N0cmluZygpfWApO1xuXHRcdC8vIEVtaXQgdGhlIHJlc29sdmVkIHdvcmtpbmctZGlyZWN0b3J5IHNldCAoaW5kZXggMCA9IHByb2Nlc3Mgcm9vdCkuIFRoZSBob3N0XG5cdFx0Ly8gcmVwbGFjZXMgaW5kZXggMCBvZiB0aGUgc2Vzc2lvbiBzZXQgd2l0aCBpdCwgcHJlc2VydmluZyB0aGUgdGFpbC5cblx0XHR0aGlzLl9vbkRpZE1hdGVyaWFsaXplU2Vzc2lvbi5maXJlKHsgc2Vzc2lvbjogc2Vzc2lvblVyaSwgcHJvamVjdCwgd29ya2luZ0RpcmVjdG9yaWVzOiBtYXRlcmlhbGl6ZWRXb3JraW5nRGlyZWN0b3JpZXMgfSk7XG5cdFx0cmV0dXJuIGFnZW50U2Vzc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVBZ2VudFdoZW5NYXRlcmlhbGl6aW5nKHByb3Zpc2lvbmFsOiBJUHJvdmlzaW9uYWxTZXNzaW9uLCBzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90LCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHsgYWdlbnQ6IEFnZW50U2VsZWN0aW9uOyBuYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFnZW50ID0gcHJvdmlzaW9uYWwuYWdlbnQ7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYWx0ZXJuYXRpdmVBZ2VudCA9IHRoaXMuX2dldEFsdGVybmF0aXZlQWdlbnRGb3JXb3JrdHJlZShwcm92aXNpb25hbCwgd29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBvcmlnaW5hbEFnZW50TmFtZSA9IHRoaXMuX3Jlc29sdmVBZ2VudE5hbWUoc25hcHNob3QsIGFnZW50KTtcblx0XHRjb25zdCBhbHRlcm5hdGl2ZUFnZW50TmFtZSA9IGFsdGVybmF0aXZlQWdlbnQgPyB0aGlzLl9yZXNvbHZlQWdlbnROYW1lKHNuYXBzaG90LCBhbHRlcm5hdGl2ZUFnZW50KSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmIChvcmlnaW5hbEFnZW50TmFtZSkge1xuXHRcdFx0cmV0dXJuIHsgYWdlbnQ6IGFnZW50LCBuYW1lOiBvcmlnaW5hbEFnZW50TmFtZSB9O1xuXHRcdH1cblx0XHRpZiAoYWx0ZXJuYXRpdmVBZ2VudE5hbWUgJiYgYWx0ZXJuYXRpdmVBZ2VudCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQWdlbnQgZmlsZSAke2FnZW50LnVyaX0gaXMgaW4gdGhlIG9yaWdpbmFsIHJlcG87IHVzaW5nIHdvcmt0cmVlIGFnZW50ICR7YWx0ZXJuYXRpdmVBZ2VudD8udXJpfWApO1xuXHRcdFx0cmV0dXJuIHsgYWdlbnQ6IGFsdGVybmF0aXZlQWdlbnQsIG5hbWU6IGFsdGVybmF0aXZlQWdlbnROYW1lIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cHJpdmF0ZSBfZ2V0QWx0ZXJuYXRpdmVBZ2VudEZvcldvcmt0cmVlKHByb3Zpc2lvbmFsOiBJUHJvdmlzaW9uYWxTZXNzaW9uLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWdlbnQgPSBwcm92aXNpb25hbC5hZ2VudDtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXByb3Zpc2lvbmFsLndvcmtpbmdEaXJlY3RvcnkgfHwgIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChpc0VxdWFsKHByb3Zpc2lvbmFsLndvcmtpbmdEaXJlY3RvcnksIHdvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5wYXJzZShhZ2VudC51cmkpO1xuXHRcdGNvbnN0IGFsdGVybmF0aXZlQWdlbnRVcmkgPSByZWJhc2VVbmRlcihhZ2VudFVyaSwgcHJvdmlzaW9uYWwud29ya2luZ0RpcmVjdG9yeSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0cmV0dXJuIGFsdGVybmF0aXZlQWdlbnRVcmkgPyB7IHVyaTogYWx0ZXJuYXRpdmVBZ2VudFVyaS50b1N0cmluZygpIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhwYXJhbXM6IElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zKTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdC8vIElzb2xhdGlvbiAvIGJyYW5jaCBhcmUgY29udHJpYnV0ZWQgYnkgdGhlIGhvc3QgKHNlZVxuXHRcdC8vIEFnZW50U2VydmljZS5fd2l0aElzb2xhdGlvblNjaGVtYSk7IHRoaXMgYWdlbnQgb25seSBvd25zIGl0cyBwbGF0Zm9ybVxuXHRcdC8vIHNlc3Npb24gY29uZmlnIChhdXRvLWFwcHJvdmUgLyBtb2RlIC8gcGVybWlzc2lvbnMpLlxuXHRcdGNvbnN0IHZhbHVlcyA9IHBsYXRmb3JtU2Vzc2lvblNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdChtaWdyYXRlTGVnYWN5QXV0b3BpbG90Q29uZmlnKHBhcmFtcy5jb25maWcpLCB7XG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdkZWZhdWx0JyBzYXRpc2ZpZXMgQXV0b0FwcHJvdmVMZXZlbCxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiAnaW50ZXJhY3RpdmUnIHNhdGlzZmllcyBTZXNzaW9uTW9kZSxcblx0XHRcdC8vIFBlcm1pc3Npb25zIGludGVudGlvbmFsbHkgb21pdHRlZCBcdTIwMTQgbGVhdmUgdW5zZXQgc28gYXV0by1hcHByb3ZhbFxuXHRcdFx0Ly8gZmFsbHMgdGhyb3VnaCB0byB0aGUgaG9zdC1sZXZlbCBgcGVybWlzc2lvbnNgIGRlZmF1bHQsIGFuZCBvbmx5XG5cdFx0XHQvLyBtYXRlcmlhbGl6ZXMgb24gdGhlIHNlc3Npb24gb25jZSB0aGUgdXNlciBoaXRzIFwiQWxsb3cgaW4gdGhpc1xuXHRcdFx0Ly8gU2Vzc2lvblwiLlxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjaGVtYTogcGxhdGZvcm1TZXNzaW9uU2NoZW1hLnRvUHJvdG9jb2woKSxcblx0XHRcdHZhbHVlcyxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKF9wYXJhbXM6IElBZ2VudFNlc3Npb25Db25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0Ly8gQnJhbmNoIGNvbXBsZXRpb25zICh0aGUgb25seSBkeW5hbWljIENvcGlsb3QgcHJvcGVydHkpIGFyZSBvd25lZCBieSB0aGVcblx0XHQvLyBob3N0IG5vdzsgbm8gcHJvdmlkZXItc3BlY2lmaWMgY29tcGxldGlvbnMgcmVtYWluLlxuXHRcdHJldHVybiB7IGl0ZW1zOiBbXSB9O1xuXHR9XG5cblx0Z2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbjogVVJJLCBjbGllbnQ6IHsgcmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZzsgcmVhZG9ubHkgZGlzcGxheU5hbWU/OiBzdHJpbmcgfSk6IElBY3RpdmVDbGllbnQge1xuXHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2dldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0Ly8gQW5jaG9yIHRoZSBjdXN0b21pemF0aW9uIGRpcmVjdG9yeSAoYmVzdC1lZmZvcnQsIGlkZW1wb3RlbnQpIHNvXG5cdFx0Ly8gc2Vzc2lvbi1kaXNjb3ZlcmVkIGN1c3RvbWl6YXRpb25zIHN1cmZhY2UgYWxvbmdzaWRlIHRoaXMgY2xpZW50J3MsXG5cdFx0Ly8gbWlycm9yaW5nIHRoZSBwcmV2aW91cyBlYWdlciByZXNvbHV0aW9uIGluIGBzZXRDbGllbnRDdXN0b21pemF0aW9uc2AuXG5cdFx0aWYgKCFhY3RpdmVDbGllbnQucGx1Z2luQ29udHJvbGxlci5kaXJlY3RvcnkpIHtcblx0XHRcdHRoaXMuX2dldFNlc3Npb25DdXN0b21pemF0aW9uQW5jaG9ycyhzZXNzaW9uKS50aGVuKFxuXHRcdFx0XHRhbmNob3JzID0+IHtcblx0XHRcdFx0XHRhY3RpdmVDbGllbnQucGx1Z2luQ29udHJvbGxlci5zZXREaXJlY3RvcnkoYW5jaG9ycy5kaXJlY3RvcnkpO1xuXHRcdFx0XHRcdGlmIChhbmNob3JzLmFwcGx5QWRkaXRpb25hbCkge1xuXHRcdFx0XHRcdFx0YWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIuc2V0QWRkaXRpb25hbERpcmVjdG9yaWVzKGFuY2hvcnMuYWRkaXRpb25hbERpcmVjdG9yaWVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCgpID0+IHsgLyogYmVzdC1lZmZvcnQgYW5jaG9yaW5nICovIH0sXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aXZlQ2xpZW50LmdldE9yQ3JlYXRlSGFuZGxlKGNsaWVudC5jbGllbnRJZCwgY2xpZW50LmRpc3BsYXlOYW1lKTtcblx0fVxuXG5cdHJlbW92ZUFjdGl2ZUNsaWVudChzZXNzaW9uOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIHJlbW92ZUFjdGl2ZUNsaWVudDogY2xpZW50SWQ9JHtjbGllbnRJZH1gKTtcblx0XHR0aGlzLl9hY3RpdmVDbGllbnRzLmdldChzZXNzaW9uKT8ucmVtb3ZlQ2xpZW50KGNsaWVudElkKTtcblx0fVxuXG5cdG9uQ2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCByZXN1bHQ6IFRvb2xDYWxsUmVzdWx0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdC8vIFBlZXIgKG5vbi1kZWZhdWx0KSBjaGF0cyBvd24gdGhlaXIgU0RLIGNoYXQgd2l0aGluIHRoZSBvd25pbmdcblx0XHQvLyBzZXNzaW9uIGVudHJ5LCBrZXllZCBieSB0aGUgY2hhdCBVUkkuIE1pcnJvcnMgdGhlIHJvdXRpbmcgaW4gYHNlbmRNZXNzYWdlYC5cblx0XHRpZiAoIWlzRGVmYXVsdENoYXRVcmkoY2hhdCkpIHtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gdGhpcy5fZmluZFBlZXJDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdFx0aWYgKCFwZWVyQ2hhdCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRHJvcHBpbmcgY2xpZW50IHRvb2wgY29tcGxldGlvbiBmb3IgbWlzc2luZyBwZWVyIGNoYXQ6IGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIHN1Y2Nlc3M9JHtyZXN1bHQuc3VjY2Vzc31gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFJvdXRpbmcgY2xpZW50IHRvb2wgY29tcGxldGlvbiB0byBwZWVyIGNoYXQ6IGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIHN1Y2Nlc3M9JHtyZXN1bHQuc3VjY2Vzc31gKTtcblx0XHRcdHBlZXJDaGF0LmhhbmRsZUNsaWVudFRvb2xDYWxsQ29tcGxldGUodG9vbENhbGxJZCwgcmVzdWx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRHJvcHBpbmcgY2xpZW50IHRvb2wgY29tcGxldGlvbiBmb3IgbWlzc2luZyBkZWZhdWx0IGNoYXQ6IGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIHN1Y2Nlc3M9JHtyZXN1bHQuc3VjY2Vzc31gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFJvdXRpbmcgY2xpZW50IHRvb2wgY29tcGxldGlvbiB0byBkZWZhdWx0IGNoYXQ6IGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIHN1Y2Nlc3M9JHtyZXN1bHQuc3VjY2Vzc31gKTtcblx0XHRcdGVudHJ5LmhhbmRsZUNsaWVudFRvb2xDYWxsQ29tcGxldGUodG9vbENhbGxJZCwgcmVzdWx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kTWVzc2FnZShjaGF0OiBVUkksIHByb21wdDogc3RyaW5nLCBhdHRhY2htZW50cz86IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sIHR1cm5JZD86IHN0cmluZywgc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudFR5cGUgPSBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpO1xuXHRcdC8vIEFkZGl0aW9uYWwgKG5vbi1kZWZhdWx0KSBjaGF0cyBhcmUgYmFja2VkIGJ5IHRoZWlyIG93biBTREtcblx0XHQvLyBjaGF0IGhvc3RlZCBvbiB0aGUgb3duaW5nIHNlc3Npb24gZW50cnksIGtleWVkIGJ5IHRoZSBjaGF0IFVSSS5cblx0XHRpZiAoY29udGV4dC5pc1BlZXJDaGF0KSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNoYXRTZXNzaW9uKGNvbnRleHQuc2Vzc2lvbiwgY2hhdCk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RdIHNlbmRNZXNzYWdlIGZvciB1bmtub3duIGNoYXQ6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR1cm5JZCkge1xuXHRcdFx0XHRlbnRyeS5yZXNldFR1cm5TdGF0ZSh0dXJuSWQsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNpZGVDaGF0ID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0LnRvU3RyaW5nKCkpPy5zaWRlQ2hhdDtcblx0XHRcdGNvbnN0IGV4aXN0aW5nVHVybnMgPSBzaWRlQ2hhdCA/IGF3YWl0IGVudHJ5LmdldE1lc3NhZ2VzKCkgOiBbXTtcblx0XHRcdGNvbnN0IHNka1Byb21wdCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdChwcm9tcHQsIGV4aXN0aW5nVHVybnMsIHNpZGVDaGF0KTtcblx0XHRcdGF3YWl0IGVudHJ5LnNlbmQoc2RrUHJvbXB0LCBhdHRhY2htZW50cywgdHVybklkLCB0aGlzLl9yZXNvbHZlU2RrTW9kZShjb250ZXh0LnNlc3Npb24pLCBzZW5kZXJDbGllbnRJZCwgY2xpZW50VHlwZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoY29udGV4dC5zZXNzaW9uSWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX2FjdGl2ZUNsaWVudHMuZ2V0KGNvbnRleHQuc2Vzc2lvbik/LnBsdWdpbkNvbnRyb2xsZXIucmV0cnlGYWlsZWRDbGllbnRTeW5jSWZOZWVkZWQoKTtcblxuXHRcdFx0Ly8gRmlyc3QgbWVzc2FnZSBvbiBhIHByb3Zpc2lvbmFsIHNlc3Npb246IG1hdGVyaWFsaXplIHRoZSBTREtcblx0XHRcdC8vIHNlc3Npb24sIHdvcmt0cmVlLCBhbmQgb24tZGlzayBtZXRhZGF0YSBiZWZvcmUgY29udGludWluZy4gVGhlXG5cdFx0XHQvLyBwcm9tcHQgaXMgZm9yd2FyZGVkIHNvIGEgd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbiBjYW4gZGVyaXZlXG5cdFx0XHQvLyBpdHMgYnJhbmNoLW5hbWUgaGludCBmcm9tIHRoZSB1c2VyJ3MgZmlyc3QgbWVzc2FnZS5cblx0XHRcdGxldCBlbnRyeTogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmhhcyhjb250ZXh0LnNlc3Npb25JZCkpIHtcblx0XHRcdFx0ZW50cnkgPSBhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZVByb3Zpc2lvbmFsKGNvbnRleHQuc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cnkgPSB0aGlzLl9nZXRDaGF0Q29udGV4dChjaGF0KS50YXJnZXQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBhY3RpdmUgY2xpZW50J3MgY29uZmlnIGNoYW5nZWQgKHRvb2xzIG9yIHBsdWdpbnMpLFxuXHRcdFx0Ly8gZGlzcG9zZSB0aGlzIHNlc3Npb24gc28gaXQgZ2V0cyByZXN1bWVkIHdpdGggdGhlIHVwZGF0ZWQgY29uZmlnLlxuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fYWN0aXZlQ2xpZW50cy5nZXQoY29udGV4dC5zZXNzaW9uKTtcblx0XHRcdGNvbnN0IGhhZENhY2hlZEVudHJ5ID0gISFlbnRyeTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtjb250ZXh0LnNlc3Npb25JZH1dIHNlbmRNZXNzYWdlOiBjYWNoZWRFbnRyeT0ke2hhZENhY2hlZEVudHJ5fSwgaGFzQWN0aXZlQ2xpZW50PSR7ISFhY3RpdmVDbGllbnR9LCBhY3RpdmVDbGllbnRJZD0ke2FjdGl2ZUNsaWVudCA/ICcoc2V0KScgOiAnKG5vbmUpJ31gKTtcblx0XHRcdGlmIChlbnRyeSAmJiBhY3RpdmVDbGllbnQgJiYgYXdhaXQgYWN0aXZlQ2xpZW50LnJlcXVpcmVzUmVzdGFydChlbnRyeS5hcHBsaWVkU25hcHNob3QpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtjb250ZXh0LnNlc3Npb25JZH1dIFNlc3Npb24gY29uZmlnIGNoYW5nZWQgKHJlcXVpcmVzUmVzdGFydD10cnVlKSwgcmVmcmVzaGluZyBzZXNzaW9uLiBjbGllbnRzPVske1suLi5hY3RpdmVDbGllbnQudG9vbFNldC5jbGllbnRJZHMoKV0uam9pbignLCAnKSB8fCAnKG5vbmUpJ31dYCk7XG5cdFx0XHRcdC8vIEZpbmlzaCBkaXNjb25uZWN0aW5nIGJlZm9yZSByZXN1bWluZyB0aGUgc2FtZSBTREsgc2Vzc2lvbiBpZC5cblx0XHRcdFx0dGhpcy5fc2RrU2Vzc2lvbnNCeUlkLmRlbGV0ZShlbnRyeS5zZXNzaW9uSWQpO1xuXHRcdFx0XHRhd2FpdCBlbnRyeS5kZXN0cm95U2Vzc2lvbigpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9ucy5nZXQoY29udGV4dC5zZXNzaW9uSWQpPy5jbGVhckRlZmF1bHRDaGF0KCk7XG5cdFx0XHRcdGVudHJ5ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtjb250ZXh0LnNlc3Npb25JZH1dIE5vIGNhY2hlZCBlbnRyeSR7aGFkQ2FjaGVkRW50cnkgPyAnICh3YXMgZXZpY3RlZCBieSByZXF1aXJlc1Jlc3RhcnQpJyA6ICcnfSwgY2FsbGluZyBfcmVzdW1lU2Vzc2lvbmApO1xuXHRcdFx0fVxuXHRcdFx0ZW50cnkgPz89IGF3YWl0IHRoaXMuX3Jlc3VtZVNlc3Npb24oY29udGV4dC5zZXNzaW9uSWQpO1xuXG5cdFx0XHQvLyBSZXNldCBwZXItdHVybiBzdHJlYW1pbmcgc3RhdGUgb24gdGhlIHNlc3Npb24gc28gdGhhdCB0aGVcblx0XHRcdC8vIG5leHQgdGV4dC9yZWFzb25pbmcgY2h1bmsgKGFuZCBhbnkgaG9zdC1lbWl0dGVkIGFubm91bmNlbWVudClcblx0XHRcdC8vIGFsbG9jYXRlcyBhIGZyZXNoIHJlc3BvbnNlIHBhcnQuXG5cdFx0XHRpZiAodHVybklkKSB7XG5cdFx0XHRcdGVudHJ5LnJlc2V0VHVyblN0YXRlKHR1cm5JZCwgc2VuZGVyQ2xpZW50SWQsIGNsaWVudFR5cGUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZGtNb2RlID0gdGhpcy5fcmVzb2x2ZVNka01vZGUoY29udGV4dC5zZXNzaW9uKTtcblx0XHRcdFx0YXdhaXQgZW50cnkuc2VuZChwcm9tcHQsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHNka01vZGUsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb25zdCBlcnJDb2RlID0gKGVyciBhcyB7IGNvZGU/OiBudW1iZXIgfSk/LmNvZGU7XG5cdFx0XHRcdGNvbnN0IGVyck1zZyA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHtjb250ZXh0LnNlc3Npb25JZH1dIGVudHJ5LnNlbmQoKSBmYWlsZWQ6IGNvZGU9JHtlcnJDb2RlfSwgbWVzc2FnZT0ke2Vyck1zZ30sIGhhZENhY2hlZEVudHJ5PSR7aGFkQ2FjaGVkRW50cnl9LCBlcnJvclR5cGU9JHtlcnI/LmNvbnN0cnVjdG9yPy5uYW1lfWApO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNsYXRlcyB0aGUgQUhQLXNpZGUgYG1vZGVgIHRvIHRoZSBDb3BpbG90IFNESydzIHRocmVlLW1vZGUgc3BhY2Vcblx0ICogKGBpbnRlcmFjdGl2ZWAgLyBgcGxhbmAgLyBgYXV0b3BpbG90YCkuIFdpdGggQXV0b3BpbG90IGxpdmluZyBvbiB0aGVcblx0ICogYG1vZGVgIGF4aXMgdGhlIG1hcHBpbmcgaXMgbm93IGRpcmVjdDpcblx0ICpcblx0ICogIC0gYG1vZGU9J3BsYW4nYCBcdTIxOTIgU0RLIGBwbGFuYC5cblx0ICogIC0gYG1vZGU9J2F1dG9waWxvdCdgIFx1MjE5MiBTREsgYGF1dG9waWxvdGAgKGF1dG9ub21vdXMsIGNvbnRpbnVlLXVudGlsLWRvbmUpLlxuXHQgKiAgLSBgbW9kZT0naW50ZXJhY3RpdmUnYCBcdTIxOTIgU0RLIGBpbnRlcmFjdGl2ZWAuXG5cdCAqXG5cdCAqIFRvb2wgYXV0by1hcHByb3ZhbCBpcyBnb3Zlcm5lZCBpbmRlcGVuZGVudGx5IGJ5IHRoZSBvcnRob2dvbmFsXG5cdCAqIGBhdXRvQXBwcm92ZWAgYXhpcyAoRGVmYXVsdCAvIEJ5cGFzcyksIGVuZm9yY2VkIGJ5IHRoZSBhZ2VudFxuXHQgKiBob3N0J3Mgb3duIHBlcm1pc3Npb24gaGFuZGxlciBcdTIwMTQgd2hpY2ggdGhlIFNESyBzdGlsbCBpbnZva2VzIGV2ZW4gdW5kZXJcblx0ICogYXV0b3BpbG90IG1vZGUuXG5cdCAqXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBubyBtb2RlIGlzIGNvbmZpZ3VyZWQgZm9yIHRoZSBzZXNzaW9uLCBzb1xuXHQgKiB0aGUgU0RLJ3MgY3VycmVudCBtb2RlIGlzIGxlZnQgdW50b3VjaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVNka01vZGUoc2Vzc2lvbjogVVJJKTogQ29waWxvdFNka01vZGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHNlc3Npb25LZXksIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlKTtcblx0XHRzd2l0Y2ggKG1vZGUpIHtcblx0XHRcdGNhc2UgJ3BsYW4nOlxuXHRcdFx0XHRyZXR1cm4gJ3BsYW4nO1xuXHRcdFx0Y2FzZSAnYXV0b3BpbG90Jzpcblx0XHRcdFx0cmV0dXJuICdhdXRvcGlsb3QnO1xuXHRcdFx0Y2FzZSAnaW50ZXJhY3RpdmUnOlxuXHRcdFx0XHRyZXR1cm4gJ2ludGVyYWN0aXZlJztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIHRoZSBzZXNzaW9uJ3MgY3VycmVudCBgbW9kZWAgYW5kIGBhdXRvQXBwcm92ZWAgYXhpcyB2YWx1ZXMgc28gdGhlXG5cdCAqIHNsYXNoLWNvbW1hbmQgY29tcGxldGlvbiBwcm92aWRlciBjYW4gaGlkZSBjb25maWctYWN0aW9uIHRvZ2dsZXMgdGhhdCB3b3VsZFxuXHQgKiBiZSBhIG5vLW9wIChlLmcuIGAvYXV0b3BpbG90IG9uYCB3aGlsZSBhbHJlYWR5IGluIGF1dG9waWxvdCkuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRTZXNzaW9uQ29uZmlnU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcpOiBJQ29waWxvdENvbmZpZ1NsYXNoQ29tbWFuZFN0YXRlIHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZXNzaW9uSWQpLnRvU3RyaW5nKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGU6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHNlc3Npb25LZXksIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlKSxcblx0XHRcdGF1dG9BcHByb3ZlOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZShzZXNzaW9uS2V5LCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpLFxuXHRcdH07XG5cdH1cblxuXHRzZXRQZW5kaW5nTWVzc2FnZXMoY2hhdDogVVJJLCBzdGVlcmluZ01lc3NhZ2U6IFBlbmRpbmdNZXNzYWdlIHwgdW5kZWZpbmVkLCBfcXVldWVkTWVzc2FnZXM6IHJlYWRvbmx5IFBlbmRpbmdNZXNzYWdlW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fZ2V0Q2hhdENvbnRleHQoY2hhdCk7XG5cdFx0aWYgKCFjb250ZXh0LnRhcmdldCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke2NvbnRleHQuc2Vzc2lvbklkfV0gc2V0UGVuZGluZ01lc3NhZ2VzOiBjaGF0IG5vdCBmb3VuZCBmb3IgJHtjaGF0LnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RlZXJpbmc6IHNlbmQgd2l0aCBtb2RlICdpbW1lZGlhdGUnIHNvIHRoZSBTREsgaW5qZWN0cyBpdCBtaWQtdHVyblxuXHRcdGlmIChzdGVlcmluZ01lc3NhZ2UpIHtcblx0XHRcdGNvbnRleHQudGFyZ2V0LnNlbmRTdGVlcmluZyhzdGVlcmluZ01lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdC8vIFF1ZXVlZCBtZXNzYWdlcyBhcmUgY29uc3VtZWQgYnkgdGhlIHNlcnZlciAoQWdlbnRTaWRlRWZmZWN0cylcblx0XHQvLyB3aGljaCBkaXNwYXRjaGVzIENoYXRUdXJuU3RhcnRlZCBhbmQgY2FsbHMgc2VuZE1lc3NhZ2UgZGlyZWN0bHkuXG5cdFx0Ly8gTm8gU0RLLWxldmVsIGVucXVldWUgaXMgbmVlZGVkLlxuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Ly8gSWYgdGhlIFVSSSBkZXNjcmliZXMgYSBzdWJhZ2VudCBjaGlsZCBzZXNzaW9uIChgPHBhcmVudD4vc3ViYWdlbnQvPHRvb2xDYWxsSWQ+YCksXG5cdFx0Ly8gbG9hZCB0aGUgcGFyZW50J3MgZXZlbnRzIG9uY2UgYW5kIGV4dHJhY3QgdGhlIGNoaWxkJ3MgZmlsdGVyZWQgdHVybnMuXG5cdFx0Y29uc3Qgc3ViYWdlbnRJbmZvID0gcGFyc2VTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvbik7XG5cdFx0aWYgKHN1YmFnZW50SW5mbykge1xuXHRcdFx0Ly8gV2FsayB1cCB0aGUgc3ViYWdlbnQgY2hhaW4gdG8gZmluZCB0aGUgcm9vdCBTREsgc2Vzc2lvbiBlbnRyeTtcblx0XHRcdC8vIF9zZXNzaW9ucyBpcyBrZXllZCBieSByb290IHNlc3Npb24gSURzIG9ubHkuXG5cdFx0XHRsZXQgcm9vdFNlc3Npb24gPSBzdWJhZ2VudEluZm8ucGFyZW50U2Vzc2lvbjtcblx0XHRcdGxldCBwYXJlbnRQYXJzZWQ7XG5cdFx0XHR3aGlsZSAoKHBhcmVudFBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHJvb3RTZXNzaW9uKSkpIHtcblx0XHRcdFx0cm9vdFNlc3Npb24gPSBwYXJlbnRQYXJzZWQucGFyZW50U2Vzc2lvbjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJvb3RTZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQocm9vdFNlc3Npb24pO1xuXHRcdFx0Y29uc3QgcGFyZW50RW50cnkgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihyb290U2Vzc2lvbklkKSA/PyBhd2FpdCB0aGlzLl9yZXN1bWVTZXNzaW9uKHJvb3RTZXNzaW9uSWQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtyb290U2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlc3VtZSByb290IGZvciBzdWJhZ2VudCByZXN0b3JlYCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFwYXJlbnRFbnRyeSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFyZW50RW50cnkuZ2V0U3ViYWdlbnRNZXNzYWdlcyhzdWJhZ2VudEluZm8udG9vbENhbGxJZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdCA9IHBhcnNlQ2hhdFVyaShzZXNzaW9uKSA/IHNlc3Npb24gOiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpO1xuXHRcdGlmIChjb250ZXh0LmlzUGVlckNoYXQpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2hhdFNlc3Npb24oY29udGV4dC5zZXNzaW9uLCBjaGF0KTtcblx0XHRcdGNvbnN0IHR1cm5zID0gZW50cnkgPyBhd2FpdCBlbnRyeS5nZXRNZXNzYWdlcygpIDogW107XG5cdFx0XHRjb25zdCBzaWRlQ2hhdCA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY2hhdC50b1N0cmluZygpKT8uc2lkZUNoYXQ7XG5cdFx0XHRyZXR1cm4gc3RyaXBTaWRlQ2hhdENvbnRleHQodHVybnMuc2xpY2Uoc2lkZUNoYXQ/LmluaGVyaXRlZFR1cm5Db3VudCA/PyAwKSwgc2lkZUNoYXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGNvbnRleHQuc2Vzc2lvbklkO1xuXHRcdC8vIFByb3Zpc2lvbmFsIHNlc3Npb25zIGhhdmUgbm8gU0RLIGhpc3RvcnkgeWV0LlxuXHRcdGlmICh0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0gY29udGV4dC50YXJnZXQgPz8gYXdhaXQgdGhpcy5fcmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlNaXNzaW5nRXJyb3IpIHtcblx0XHRcdFx0Ly8gVW5yZWNvdmVyYWJsZTogc3VyZmFjZSB0byB0aGUgcmVzdG9yZS9zdWJzY3JpYmUgcGF0aCBzbyB0aGVcblx0XHRcdFx0Ly8gY2xpZW50IHNob3dzIGEgY2xlYXIgZXJyb3IgaW5zdGVhZCBvZiBhIHNpbGVudGx5IGVtcHR5IGNoYXQuXG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBGYWlsZWQgdG8gcmVzdW1lIHNlc3Npb24gZm9yIG1lc3NhZ2UgbG9va3VwYCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHQvLyBUaGUgaG9zdCBwcmVwZW5kcyB0aGUgd29ya3RyZWUgXCJjcmVhdGVkXCIgYW5ub3VuY2VtZW50IG9uIHJlc3RvcmUgKHNlZVxuXHRcdC8vIEFnZW50U2VydmljZS5fZ2V0Q2hhdE1lc3NhZ2VzKTsgdGhpcyBhZ2VudCBqdXN0IHJldHVybnMgaXRzIHR1cm5zLlxuXHRcdHJldHVybiBlbnRyeS5nZXRNZXNzYWdlcygpO1xuXHR9XG5cblx0YXN5bmMgZ2V0U3ViYWdlbnRTZXNzaW9ucyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IElSZXN0b3JlZFN1YmFnZW50U2Vzc2lvbltdPiB7XG5cdFx0Ly8gT25seSB0aGUgcm9vdCBTREsgc2Vzc2lvbiBlbnRyeSBvd25zIHRoZSBldmVudCBsb2c7IHBlZXItY2hhdCBhbmRcblx0XHQvLyBzdWJhZ2VudCBVUklzIGFyZSBkZXJpdmVkIGZyb20gaXQgYW5kIGhhdmUgbm8gc3ViYWdlbnRzIG9mIHRoZWlyIG93bi5cblx0XHRjb25zdCBjaGF0SW5mbyA9IHBhcnNlQ2hhdFVyaShzZXNzaW9uKTtcblx0XHRpZiAoY2hhdEluZm8gJiYgIWlzRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHQvLyBQcm92aXNpb25hbCBzZXNzaW9ucyBoYXZlIG5vIFNESyBoaXN0b3J5IChhbmQgdGh1cyBubyBzdWJhZ2VudHMpIHlldC5cblx0XHRpZiAodGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCkgPz8gYXdhaXQgdGhpcy5fcmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlc3VtZSBzZXNzaW9uIGZvciBzdWJhZ2VudCBsb29rdXBgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0XHRyZXR1cm4gZW50cnkgPyBlbnRyeS5nZXRTdWJhZ2VudFNlc3Npb25zKCkgOiBbXTtcblx0fVxuXG5cdGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgd29ya3NwYWNlLWxlc3Mgc2NyYXRjaCBkaXIgKGlmIGFueSkgYmVmb3JlIGRlbGV0aW5nLCBzbyB3ZVxuXHRcdFx0Ly8gY2FuIHJlYXAgaXQgYWZ0ZXJ3YXJkcy4gQSBwcm92aXNpb25hbCB3b3Jrc3BhY2UtbGVzcyBjaGF0IGNhcnJpZXMgaXRzIHN0YXRlXG5cdFx0XHQvLyBpbiBtZW1vcnk7IGEgbWF0ZXJpYWxpemVkL3Jlc3RvcmVkIG9uZSBwZXJzaXN0cyBgd29ya3NwYWNlbGVzc2AgbWV0YWRhdGEuXG5cdFx0XHRjb25zdCBwcm92aXNpb25hbCA9IHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBpc1dvcmtzcGFjZWxlc3MgPSBwcm92aXNpb25hbFxuXHRcdFx0XHQ/IHByb3Zpc2lvbmFsLndvcmtzcGFjZWxlc3MgPT09IHRydWVcblx0XHRcdFx0OiAoYXdhaXQgdGhpcy5fcmVhZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpKT8ud29ya3NwYWNlbGVzcyA9PT0gdHJ1ZTtcblx0XHRcdC8vIFJlbW92ZSB0aGUgc2Vzc2lvbiBmcm9tIHRoZSBTREsncyBvbi1kaXNrIHN0b3JlIGZpcnN0IHNvIGl0IGRvZXNuJ3QgcmVhcHBlYXIgaW4gYGxpc3RTZXNzaW9ucygpYCBhZnRlciBhXG5cdFx0XHQvLyByZXN0YXJ0LCBhbmQgc28gdGhhdCBhbnkgZmluYWwgcGVyc2lzdCB0cmlnZ2VyZWQgYnkgaW4tbWVtb3J5IHRlYXJkb3duIGNhbid0IHJlY3JlYXRlIGl0LiBQcm92aXNpb25hbFxuXHRcdFx0Ly8gc2Vzc2lvbnMgd2VyZSBuZXZlciBwZXJzaXN0ZWQsIHNvIHRoZXJlIGlzIG5vdGhpbmcgdG8gZGVsZXRlIG9uIHRoZSBTREsgc2lkZS5cblx0XHRcdGlmICghdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9lbnN1cmVDbGllbnQoKTtcblx0XHRcdFx0YXdhaXQgY2xpZW50LmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2Rlc3Ryb3lBbmREaXNwb3NlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKGlzV29ya3NwYWNlbGVzcykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jbGVhbnVwV29ya3NwYWNlbGVzc1NjcmF0Y2hEaXIodGhpcy5fd29ya3NwYWNlbGVzc1NjcmF0Y2hEaXIoc2Vzc2lvbklkKSwgc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb24tZGVzdHJ1Y3RpdmUgY291bnRlcnBhcnQgdG8ge0BsaW5rIGRpc3Bvc2VTZXNzaW9ufTogcmVsZWFzZXMgdGhlXG5cdCAqIHNlc3Npb24ncyBpbi1tZW1vcnkgcmVzb3VyY2VzIChTREsgc2Vzc2lvbi9jb25uZWN0aW9uLCBjYWNoZWQgZW50cnksXG5cdCAqIGFjdGl2ZSBjbGllbnRzLCBNQ1Agc3Vic2NyaXB0aW9ucykgYnV0IHByZXNlcnZlcyBhbGwgZHVyYWJsZSBkYXRhIFx1MjAxNCB0aGVcblx0ICogU0RLIHNlc3Npb24gbG9nLCBzZXNzaW9uIGRhdGFiYXNlLCBhbmQgd29ya3RyZWUgc3RheSBvbiBkaXNrLiBUaGUgc2Vzc2lvblxuXHQgKiB0cmFuc3BhcmVudGx5IHJlc3VtZXMgb24gdGhlIG5leHQgYWNjZXNzIHZpYSB7QGxpbmsgX3Jlc3VtZVNlc3Npb259LlxuXHQgKlxuXHQgKiBOby1vcHMgZm9yIHNlc3Npb25zIHRoYXQgaGF2ZSBub3RoaW5nIGR1cmFibGUgdG8gcmVzdW1lIGZyb20gKHByb3Zpc2lvbmFsXG5cdCAqIHNlc3Npb25zKSBvciB0aGF0IGFyZW4ndCBjdXJyZW50bHkgaGVsZCBpbiBtZW1vcnksIGFuZCBmb3Igc2Vzc2lvbnMgd2l0aCBhXG5cdCAqIHJ1bm5pbmcgdHVybiBcdTIwMTQgZGlzY29ubmVjdGluZyBtaWQtdHVybiB3b3VsZCBzdHJhbmQgdGhlIFNESyBzZXNzaW9uLlxuXHQgKi9cblx0YXN5bmMgcmVsZWFzZVNlc3Npb24oc2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBQcm92aXNpb25hbCBzZXNzaW9ucyB3ZXJlIG5ldmVyIHBlcnNpc3RlZCwgc28gcmVsZWFzaW5nIHRoZW0gd291bGRcblx0XHRcdC8vIGxvc2Ugc3RhdGUgd2l0aCBubyB3YXkgdG8gcmVzdW1lLiBMZWF2ZSB0aGVtIGluIG1lbW9yeS5cblx0XHRcdGlmICh0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIERlZmVuc2l2ZSBhY3RpdmUtdHVybiBndWFyZDogdGhlIG9yY2hlc3RyYXRvciBhbHJlYWR5IHNraXBzXG5cdFx0XHQvLyBldmljdGlvbiB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlLCBidXQgYSB0dXJuIGNvdWxkIGhhdmUgc3RhcnRlZFxuXHRcdFx0Ly8gYmV0d2VlbiB0aGF0IGNoZWNrIGFuZCB0aGlzIHNlcXVlbmNlZCBjYWxsYmFjay5cblx0XHRcdGlmIChlbnRyeS5hbGxDaGF0U2Vzc2lvbnMoKS5zb21lKGNoYXRTZXNzaW9uID0+IGNoYXRTZXNzaW9uLmhhc0FjdGl2ZVR1cm4pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBSZWxlYXNpbmcgaWRsZSBzZXNzaW9uIGZyb20gbWVtb3J5IChkdXJhYmxlIHN0YXRlIHByZXNlcnZlZClgKTtcblx0XHRcdGF3YWl0IHRoaXMuX3JlbGVhc2VTZXNzaW9uUmVzb3VyY2VzKHNlc3Npb25JZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hYm9ydFNlc3Npb24oY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2dldENoYXRDb250ZXh0KGNoYXQpO1xuXHRcdGlmIChjb250ZXh0LmlzUGVlckNoYXQpIHtcblx0XHRcdGF3YWl0IGNvbnRleHQudGFyZ2V0Py5hYm9ydCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKGNvbnRleHQuc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9nZXRDaGF0Q29udGV4dChjaGF0KS50YXJnZXQ/LmFib3J0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVDaGF0KGNoYXQ6IFVSSSwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdGlmIChpc0RlZmF1bHRDaGF0VXJpKGNoYXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShjaGF0KTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ29waWxvdF0gY3JlYXRlQ2hhdDogbWFsZm9ybWVkIGNoYXQgVVJJICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uKTtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKT8uaGFzUGVlckNoYXQoY2hhdEtleSkpIHtcblx0XHRcdC8vIEFscmVhZHkgbGl2ZTogaGFuZCBiYWNrIHRoZSBleGlzdGluZyBiYWNraW5nIHNvIHRoZSBvcmNoZXN0cmF0b3Jcblx0XHRcdC8vIHJlLXBlcnNpc3RzIGEgY29uc2lzdGVudCBibG9iIGZvciBhbiBpZGVtcG90ZW50IGNyZWF0ZS5cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRcdHJldHVybiBleGlzdGluZyA/IHsgcHJvdmlkZXJEYXRhOiBlbmNvZGVQcm92aWRlckRhdGEoZXhpc3RpbmcpLCBiYWNraW5nU2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBleGlzdGluZy5zZGtTZXNzaW9uSWQpIH0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRsZXQgcmVzdWx0OiBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHF1ZXVlS2V5ID0gb3B0aW9ucz8uc2lkZUNoYXQgPyBjaGF0S2V5IDogc2Vzc2lvbklkO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUocXVldWVLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlLWNoZWNrIGluc2lkZSB0aGUgcGVyLXNlc3Npb24gc2VxdWVuY2VyOiB0aGUgb3V0ZXIgYGhhc2AgY2hlY2tcblx0XHRcdC8vIGFib3ZlIGlzIG9ubHkgYSBmYXN0IGVhcmx5LW91dC4gSWYgdHdvIGBjcmVhdGVDaGF0YCBjYWxscyBmb3IgdGhlXG5cdFx0XHQvLyBzYW1lIGNoYXQgVVJJIHJhY2UsIGJvdGggY2FuIHBhc3MgdGhhdCBvdXRlciBjaGVjazsgdGhlIHNlcXVlbmNlclxuXHRcdFx0Ly8gc2VyaWFsaXplcyB0aGVtLCBzbyB0aGUgc2Vjb25kIHRhc2sgbXVzdCByZS1jaGVjayBoZXJlIHRvIGF2b2lkXG5cdFx0XHQvLyBvdmVyd3JpdGluZyAoYW5kIGRpc3Bvc2luZykgdGhlIGNoYXQgdGhlIGZpcnN0IG9uZSBzZXQuXG5cdFx0XHRpZiAodGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk/Lmhhc1BlZXJDaGF0KGNoYXRLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRcdFx0cmVzdWx0ID0gZXhpc3RpbmcgPyB7IHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKGV4aXN0aW5nKSwgYmFja2luZ1Nlc3Npb246IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgZXhpc3Rpbmcuc2RrU2Vzc2lvbklkKSB9IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IG9wdGlvbnM/Lm1vZGVsO1xuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgb3duaW5nIHNlc3Npb24gc28gdGhlIG5ldyBjaGF0IGluaGVyaXRzIGl0cyB3b3JraW5nXG5cdFx0XHQvLyBkaXJlY3Rvcnkgc2NvcGUuIFRoZSBwYXJlbnQgbWF5IGJlIHByb3Zpc2lvbmFsIChubyBTREsgc2Vzc2lvblxuXHRcdFx0Ly8geWV0KTsgaW4gdGhhdCBjYXNlIHVzZSBpdHMgcHJvdmlzaW9uYWwgd29ya2luZyBkaXJlY3RvcnkuXG5cdFx0XHRjb25zdCBwYXJlbnRFbnRyeSA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gcGFyZW50RW50cnk/LndvcmtpbmdEaXJlY3Rvcnlcblx0XHRcdFx0Pz8gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKT8ud29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNsaWVudCgpO1xuXHRcdFx0Y29uc3QgY2hhdFNka0lkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHQvLyBQZWVyIGNoYXRzIHNoYXJlIHRoZSBvd25pbmcgc2Vzc2lvbidzIEFjdGl2ZUNsaWVudCBzbyB0aGF0XG5cdFx0XHQvLyBjbGllbnQgdG9vbCAvIGN1c3RvbWl6YXRpb24gdXBkYXRlcyAod2hpY2ggYXJlIGtleWVkIGJ5IHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbiBVUkkgdmlhIHRoZSBhY3RpdmUtY2xpZW50IGhhbmRsZXMpIHJlYWNoIHRoZSBhZGRpdGlvbmFsXG5cdFx0XHQvLyBjaGF0J3MgU0RLIGNoYXQuIEtleWluZyBpdCBieSB0aGUgY2hhdCBVUkkgaW5zdGVhZCB3b3VsZFxuXHRcdFx0Ly8gc25hcHNob3QgZW1wdHkvc3RhbGUgdG9vbHMgYW5kIG5ldmVyIHNlZSBzdWJzZXF1ZW50IHVwZGF0ZXMsIGFuZFxuXHRcdFx0Ly8gd291bGQgYWxzbyBsZWFrIChub3RoaW5nIGRpc3Bvc2VzIGEgY2hhdC1rZXllZCBBY3RpdmVDbGllbnQpLlxuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGFjdGl2ZUNsaWVudC5zbmFwc2hvdCgpO1xuXHRcdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBjaGF0LCB3b3JraW5nRGlyZWN0b3J5KTtcblxuXHRcdFx0Ly8gRm9ya2luZzogbWludCB0aGUgbmV3IGNoYXQncyBiYWNraW5nIGNoYXQgYnkgZm9ya2luZyB0aGVcblx0XHRcdC8vIHNvdXJjZSBjaGF0J3MgU0RLIHNlc3Npb24gYXQgdGhlIHJlcXVlc3RlZCB0dXJuIChjb3B5aW5nIGl0c1xuXHRcdFx0Ly8gZGF0YWJhc2UgaW50byB0aGUgbmV3IGNoYXQncyBkYXRhIGRpciksIHRoZW4gcmVzdW1lIGl0LiBPdGhlcndpc2Vcblx0XHRcdC8vIHNwaW4gdXAgYSBmcmVzaCBlbXB0eSBjaGF0LlxuXHRcdFx0bGV0IGxhdW5jaFBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbjtcblx0XHRcdGxldCBzZGtTZXNzaW9uSWQ6IHN0cmluZztcblx0XHRcdGxldCBzaWRlQ2hhdDogSVBlcnNpc3RlZENoYXRbJ3NpZGVDaGF0J107XG5cdFx0XHRpZiAob3B0aW9ucz8uZm9yaykge1xuXHRcdFx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtDb3BpbG90XSBjcmVhdGVDaGF0IGZvcms6IG1pc3Npbmcgd29ya2luZyBkaXJlY3RvcnkgZm9yIHNlc3Npb24gJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc291cmNlRW50cnkgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdEVudHJ5KHNlc3Npb24sIG9wdGlvbnMuZm9yay5zb3VyY2UpO1xuXHRcdFx0XHRpZiAoIXNvdXJjZUVudHJ5KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ29waWxvdF0gY3JlYXRlQ2hhdCBmb3JrOiBzb3VyY2UgY2hhdCAke29wdGlvbnMuZm9yay5zb3VyY2UudG9TdHJpbmcoKX0gbm90IGZvdW5kYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZm9ya2VkID0gYXdhaXQgdGhpcy5fZm9ya1Nka0NoYXQoY2xpZW50LCBzb3VyY2VFbnRyeSwgb3B0aW9ucy5mb3JrLnR1cm5JZCwgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLmdldFNlc3Npb25EYXRhRGlyKGNoYXQpKTtcblx0XHRcdFx0c2RrU2Vzc2lvbklkID0gZm9ya2VkLnNlc3Npb25JZDtcblx0XHRcdFx0bGF1bmNoUGxhbiA9IHtcblx0XHRcdFx0XHRraW5kOiAncmVzdW1lJyxcblx0XHRcdFx0XHRjbGllbnQsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiBzZGtTZXNzaW9uSWQsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRyZXNvbHZlZEFnZW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNuYXBzaG90LFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQ6IGFjdGl2ZUNsaWVudC50b29sU2V0LFxuXHRcdFx0XHRcdHNoZWxsTWFuYWdlcixcblx0XHRcdFx0XHRnaXRodWJUb2tlbjogdGhpcy5fZ2l0aHViVG9rZW4sXG5cdFx0XHRcdFx0ZmFsbGJhY2s6IHsgbW9kZWwsIGxvbmdDb250ZXh0V2luZG93OiB0aGlzLl9sb25nQ29udGV4dFdpbmRvd0Zvcihtb2RlbD8uaWQpLCBmcmVlTG9uZ0NvbnRleHQ6IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KG1vZGVsPy5pZCkgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAob3B0aW9ucz8uc2lkZUNoYXQpIHtcblx0XHRcdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ29waWxvdF0gY3JlYXRlQ2hhdCBzaWRlIGNoYXQ6IG1pc3Npbmcgd29ya2luZyBkaXJlY3RvcnkgZm9yIHNlc3Npb24gJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc291cmNlRW50cnkgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdEVudHJ5KHNlc3Npb24sIG9wdGlvbnMuc2lkZUNoYXQuc291cmNlKTtcblx0XHRcdFx0aWYgKCFzb3VyY2VFbnRyeSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RdIGNyZWF0ZUNoYXQgc2lkZSBjaGF0OiBzb3VyY2UgY2hhdCAke29wdGlvbnMuc2lkZUNoYXQuc291cmNlLnRvU3RyaW5nKCl9IG5vdCBmb3VuZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZvcmtlZCA9IGF3YWl0IHRoaXMuX2ZvcmtTZGtDaGF0KGNsaWVudCwgc291cmNlRW50cnksIG9wdGlvbnMuc2lkZUNoYXQucHJvdmlkZXJBbmNob3JUdXJuSWQgPz8gb3B0aW9ucy5zaWRlQ2hhdC50dXJuSWQsIHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5nZXRTZXNzaW9uRGF0YURpcihjaGF0KSk7XG5cdFx0XHRcdHNka1Nlc3Npb25JZCA9IGZvcmtlZC5zZXNzaW9uSWQ7XG5cdFx0XHRcdHNpZGVDaGF0ID0ge1xuXHRcdFx0XHRcdHNvdXJjZTogb3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR0dXJuSWQ6IG9wdGlvbnMuc2lkZUNoYXQudHVybklkLFxuXHRcdFx0XHRcdC4uLihvcHRpb25zLnNpZGVDaGF0LnNlbGVjdGlvbiA/IHsgc2VsZWN0aW9uOiBvcHRpb25zLnNpZGVDaGF0LnNlbGVjdGlvbiB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihvcHRpb25zLnNpZGVDaGF0LnByb3ZpZGVyQW5jaG9yVHVybklkID8geyBwcm92aWRlckFuY2hvclR1cm5JZDogb3B0aW9ucy5zaWRlQ2hhdC5wcm92aWRlckFuY2hvclR1cm5JZCB9IDoge30pLFxuXHRcdFx0XHRcdGluaGVyaXRlZFR1cm5Db3VudDogZm9ya2VkLmluaGVyaXRlZFR1cm5Db3VudCxcblx0XHRcdFx0XHQuLi4ob3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2VDb250ZXh0ID8geyBjb250ZXh0OiBvcHRpb25zLnNpZGVDaGF0LnNvdXJjZUNvbnRleHQgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4ob3B0aW9ucy5zaWRlQ2hhdC5wYXJ0aWFsUmVzcG9uc2UgPyB7IHBhcnRpYWxSZXNwb25zZTogb3B0aW9ucy5zaWRlQ2hhdC5wYXJ0aWFsUmVzcG9uc2UgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdFx0bGF1bmNoUGxhbiA9IHtcblx0XHRcdFx0XHRraW5kOiAncmVzdW1lJyxcblx0XHRcdFx0XHRjbGllbnQsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiBzZGtTZXNzaW9uSWQsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRyZXNvbHZlZEFnZW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNuYXBzaG90LFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQ6IGFjdGl2ZUNsaWVudC50b29sU2V0LFxuXHRcdFx0XHRcdHNoZWxsTWFuYWdlcixcblx0XHRcdFx0XHRnaXRodWJUb2tlbjogdGhpcy5fZ2l0aHViVG9rZW4sXG5cdFx0XHRcdFx0ZmFsbGJhY2s6IHsgbW9kZWwsIGxvbmdDb250ZXh0V2luZG93OiB0aGlzLl9sb25nQ29udGV4dFdpbmRvd0Zvcihtb2RlbD8uaWQpLCBmcmVlTG9uZ0NvbnRleHQ6IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KG1vZGVsPy5pZCkgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNka1Nlc3Npb25JZCA9IGNoYXRTZGtJZDtcblx0XHRcdFx0bGF1bmNoUGxhbiA9IHtcblx0XHRcdFx0XHRraW5kOiAnY3JlYXRlJyxcblx0XHRcdFx0XHRjbGllbnQsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiBjaGF0U2RrSWQsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRyZXNvbHZlZEFnZW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNuYXBzaG90LFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQ6IGFjdGl2ZUNsaWVudC50b29sU2V0LFxuXHRcdFx0XHRcdHNoZWxsTWFuYWdlcixcblx0XHRcdFx0XHRnaXRodWJUb2tlbjogdGhpcy5fZ2l0aHViVG9rZW4sXG5cdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0bG9uZ0NvbnRleHRXaW5kb3c6IHRoaXMuX2xvbmdDb250ZXh0V2luZG93Rm9yKG1vZGVsPy5pZCksXG5cdFx0XHRcdFx0ZnJlZUxvbmdDb250ZXh0OiB0aGlzLl9pc0ZyZWVMb25nQ29udGV4dChtb2RlbD8uaWQpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0bGV0IGFnZW50U2Vzc2lvbjogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFnZW50U2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZUFnZW50U2Vzc2lvbihsYXVuY2hQbGFuLCB3b3JraW5nRGlyZWN0b3J5LCBhY3RpdmVDbGllbnQsIHsgc2Vzc2lvblVyaTogc2Vzc2lvbiwgY2hhdENoYW5uZWxVcmk6IGNoYXQgfSk7XG5cdFx0XHRcdGF3YWl0IGFnZW50U2Vzc2lvbi5pbml0aWFsaXplU2Vzc2lvbigpO1xuXHRcdFx0XHRpZiAoc2lkZUNoYXQpIHtcblx0XHRcdFx0XHRzaWRlQ2hhdCA9IHsgLi4uc2lkZUNoYXQsIGluaGVyaXRlZFR1cm5Db3VudDogKGF3YWl0IGFnZW50U2Vzc2lvbi5nZXRNZXNzYWdlcygpKS5sZW5ndGggfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucz8uZm9yaz8udHVybklkTWFwcGluZykge1xuXHRcdFx0XHRcdGF3YWl0IGFnZW50U2Vzc2lvbi5yZW1hcFR1cm5JZHMob3B0aW9ucy5mb3JrLnR1cm5JZE1hcHBpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZUVudHJ5KHNlc3Npb25JZCkucmVnaXN0ZXJQZWVyQ2hhdChjaGF0S2V5LCBuZXcgQ29waWxvdFNlc3Npb25FbnRyeShhZ2VudFNlc3Npb24pKTtcblx0XHRcdFx0dGhpcy5fc2RrU2Vzc2lvbnNCeUlkLnNldChhZ2VudFNlc3Npb24uc2Vzc2lvbklkLCBhZ2VudFNlc3Npb24pO1xuXHRcdFx0XHQvLyBSZWNvcmQgdGhlIGxpdmUgYmFja2luZyBhbmQgaGFuZCB0aGUgb3BhcXVlIGJsb2IgYmFjayB0byB0aGVcblx0XHRcdFx0Ly8gb3JjaGVzdHJhdG9yIHRvIHBlcnNpc3QuIFRoZSBhZ2VudCBubyBsb25nZXIgb3ducyBhIGR1cmFibGVcblx0XHRcdFx0Ly8gcGVlci1jaGF0IGNhdGFsb2cgKGBjb3BpbG90LmNoYXRzYCBpcyBubyBsb25nZXIgd3JpdHRlbikuXG5cdFx0XHRcdGNvbnN0IGJhY2tpbmc6IElQZXJzaXN0ZWRDaGF0ID0geyBzZGtTZXNzaW9uSWQsIC4uLihtb2RlbCA/IHsgbW9kZWwgfSA6IHt9KSwgLi4uKHNpZGVDaGF0ID8geyBzaWRlQ2hhdCB9IDoge30pIH07XG5cdFx0XHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdEtleSwgYmFja2luZyk7XG5cdFx0XHRcdHJlc3VsdCA9IHsgcHJvdmlkZXJEYXRhOiBlbmNvZGVQcm92aWRlckRhdGEoYmFja2luZyksIGJhY2tpbmdTZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNka1Nlc3Npb25JZCkgfTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQ3JlYXRlZCBhZGRpdGlvbmFsIGNoYXQgJHtjaGF0S2V5fSBpbiBzZXNzaW9uICR7c2Vzc2lvbi50b1N0cmluZygpfSR7b3B0aW9ucz8uZm9yayA/ICcgKGZvcmtlZCknIDogJyd9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRhZ2VudFNlc3Npb24/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUge0BsaW5rIENvcGlsb3RBZ2VudFNlc3Npb259IGJhY2tpbmcgYSBjaGF0IFVSSSBcdTIwMTQgdGhlXG5cdCAqIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQgKGtleWVkIGJ5IHNlc3Npb24gaWQpIG9yIGFuIGFkZGl0aW9uYWwgcGVlciBjaGF0XG5cdCAqIChrZXllZCBieSB0aGUgY2hhdCBVUkkpIFx1MjAxNCByZXN1bWluZyBpdCBmcm9tIGRpc2sgaWYgbmVjZXNzYXJ5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUNoYXRFbnRyeShzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSk6IFByb21pc2U8Q29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRpZiAoaXNEZWZhdWx0Q2hhdFVyaShjaGF0VXJpKSB8fCBpc0VxdWFsKGNoYXRVcmksIHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKSA/PyBhd2FpdCB0aGlzLl9yZXN1bWVTZXNzaW9uKHNlc3Npb25JZCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZUNoYXRTZXNzaW9uKHNlc3Npb24sIGNoYXRVcmkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmtzIHtAbGluayBzb3VyY2VFbnRyeX0ncyBTREsgY2hhdCBhdCB7QGxpbmsgdHVybklkfSB2aWEgdGhlXG5cdCAqIFNESyBgc2Vzc2lvbnMuZm9ya2AgUlBDIGFuZCBjb3BpZXMgaXRzIGRhdGFiYXNlIGludG8ge0BsaW5rIHRhcmdldERiRGlyfVxuXHQgKiBzbyB0aGUgZm9ya2VkIGNoYXQgaW5oZXJpdHMgdHVybiBldmVudCBJRHMgYW5kIGZpbGUtZWRpdFxuXHQgKiBzbmFwc2hvdHMuIFJldHVybnMgdGhlIG5ldyBTREsgc2Vzc2lvbiBpZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZvcmtTZGtDaGF0KGNsaWVudDogQ29waWxvdENsaWVudCwgc291cmNlRW50cnk6IENvcGlsb3RBZ2VudFNlc3Npb24sIHR1cm5JZDogc3RyaW5nLCB0YXJnZXREYkRpcjogVVJJKTogUHJvbWlzZTx7IHNlc3Npb25JZDogc3RyaW5nOyBpbmhlcml0ZWRUdXJuQ291bnQ6IG51bWJlciB9PiB7XG5cdFx0Y29uc3Qgc291cmNlVHVybnMgPSBhd2FpdCBzb3VyY2VFbnRyeS5nZXRNZXNzYWdlcygpO1xuXHRcdGNvbnN0IHNvdXJjZVR1cm5JbmRleCA9IHNvdXJjZVR1cm5zLmZpbmRJbmRleCh0dXJuID0+IHR1cm4uaWQgPT09IHR1cm5JZCk7XG5cdFx0Y29uc3QgaW5oZXJpdGVkVHVybkNvdW50ID0gc291cmNlVHVybkluZGV4ID09PSAtMSA/IHNvdXJjZVR1cm5zLmxlbmd0aCA6IHNvdXJjZVR1cm5JbmRleCArIDE7XG5cdFx0Ly8gdG9FdmVudElkIGlzIGV4Y2x1c2l2ZSBcdTIwMTQgZXZlbnRzIGJlZm9yZSBpdCBhcmUgaW5jbHVkZWQuIElmIHRoZXJlJ3Mgbm9cblx0XHQvLyBuZXh0IHR1cm4sIG9taXQgaXQgdG8gaW5jbHVkZSBhbGwgZXZlbnRzLlxuXHRcdGNvbnN0IHRvRXZlbnRJZCA9IGF3YWl0IHNvdXJjZUVudHJ5LmdldE5leHRUdXJuRXZlbnRJZCh0dXJuSWQpO1xuXHRcdGNvbnN0IGZvcmtSZXN1bHQgPSBhd2FpdCBjbGllbnQucnBjLnNlc3Npb25zLmZvcmsoe1xuXHRcdFx0c2Vzc2lvbklkOiBzb3VyY2VFbnRyeS5zZXNzaW9uSWQsXG5cdFx0XHQuLi4odG9FdmVudElkID8geyB0b0V2ZW50SWQgfSA6IHt9KSxcblx0XHR9KTtcblx0XHRjb25zdCBuZXdTZXNzaW9uSWQgPSBmb3JrUmVzdWx0LnNlc3Npb25JZDtcblxuXHRcdC8vIFZBQ1VVTSBJTlRPIGlzIHNhZmUgZXZlbiB3aGlsZSB0aGUgc291cmNlIERCIGlzIG9wZW4uXG5cdFx0Y29uc3QgdGFyZ2V0RGJQYXRoID0gVVJJLmpvaW5QYXRoKHRhcmdldERiRGlyLCBTRVNTSU9OX0RCX0ZJTEVOQU1FKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc291cmNlRGJSZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHNvdXJjZUVudHJ5LnNlc3Npb25VcmkpO1xuXHRcdFx0aWYgKHNvdXJjZURiUmVmKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgZnMubWtkaXIodGFyZ2V0RGJEaXIuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHQvLyBWQUNVVU0gSU5UTyBmYWlscyBpZiB0aGUgdGFyZ2V0IGFscmVhZHkgZXhpc3RzOyBjbGVhciBhbnlcblx0XHRcdFx0XHQvLyBzdGFsZSBEQiBsZWZ0IGJ5IGEgcHJldmlvdXMgKGUuZy4gY3Jhc2hlZCkgYXR0ZW1wdC5cblx0XHRcdFx0XHRhd2FpdCBmcy5ybSh0YXJnZXREYlBhdGguZnNQYXRoLCB7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGF3YWl0IHNvdXJjZURiUmVmLm9iamVjdC52YWN1dW1JbnRvKHRhcmdldERiUGF0aC5mc1BhdGgpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHNvdXJjZURiUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdF0gRmFpbGVkIHRvIGNvcHkgc2Vzc2lvbiBkYXRhYmFzZSBmb3IgY2hhdCBmb3JrOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiBuZXdTZXNzaW9uSWQsIGluaGVyaXRlZFR1cm5Db3VudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzcG9zZUNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaXNEZWZhdWx0Q2hhdFVyaShjaGF0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdC8vIFJlc29sdmUgdGhlIGNoYXQncyBiYWNraW5nIFNESyBjaGF0IGlkIFx1MjAxNCBmcm9tIHRoZSBpbi1tZW1vcnlcblx0XHQvLyBzZXNzaW9uLCB0aGUgbGl2ZSBiYWNraW5nIG1hcCwgb3IgKGZvciBsZWdhY3kgc2Vzc2lvbnMpIGEgb25lLXRpbWVcblx0XHQvLyByZWFkIG9mIHRoZSBhZ2VudCdzIHByZS1vcmNoZXN0cmF0b3IgY2F0YWxvZyBcdTIwMTQgc28gd2UgY2FuIGRlbGV0ZSBpdFxuXHRcdC8vIGZyb20gdGhlIFNESydzIG9uLWRpc2sgc3RvcmUuIFdpdGhvdXQgdGhpcyBhIGZyZXNoIHByb2Nlc3MgY291bGRcblx0XHQvLyByZS1yZXN1bWUgYW4gb3JwaGFuZWQgY2hhdC4gVGhlIGR1cmFibGUgcGVlci1jaGF0IGNhdGFsb2cgaXNcblx0XHQvLyBvd25lZCBieSB0aGUgb3JjaGVzdHJhdG9yIG5vdywgc28gdGhpcyBubyBsb25nZXIgcmV3cml0ZXNcblx0XHQvLyBgY29waWxvdC5jaGF0c2A7IGl0IG9ubHkgZHJvcHMgdGhlIGxpdmUgYmFja2luZyBhbmQgU0RLIGNoYXQuXG5cdFx0bGV0IHNka1Nlc3Npb25JZCA9IHRoaXMuX2ZpbmRQZWVyQ2hhdChzZXNzaW9uLCBjaGF0KT8uc2Vzc2lvbklkXG5cdFx0XHQ/PyB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRLZXkpPy5zZGtTZXNzaW9uSWQ7XG5cdFx0aWYgKCFzZGtTZXNzaW9uSWQpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShjaGF0KTtcblx0XHRcdGlmIChwYXJzZWQpIHtcblx0XHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgdGhpcy5fcmVhZFBlcnNpc3RlZENoYXRzKHNlc3Npb24pO1xuXHRcdFx0XHRzZGtTZXNzaW9uSWQgPSBwZXJzaXN0ZWQuZ2V0KHBhcnNlZC5jaGF0SWQpPy5zZGtTZXNzaW9uSWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NoYXRCYWNraW5ncy5kZWxldGUoY2hhdEtleSk7XG5cdFx0aWYgKHNka1Nlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fc2RrU2Vzc2lvbnNCeUlkLmRlbGV0ZShzZGtTZXNzaW9uSWQpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKT8uZGlzcG9zZVBlZXJDaGF0KGNoYXRLZXkpO1xuXHRcdGlmIChzZGtTZXNzaW9uSWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNsaWVudCgpO1xuXHRcdFx0XHRhd2FpdCBjbGllbnQuZGVsZXRlU2Vzc2lvbihzZGtTZXNzaW9uSWQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byBkZWxldGUgU0RLIHNlc3Npb24gZm9yIGNoYXQgJHtjaGF0S2V5fTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWF0dGFjaGVzIHRoZSBpbi1tZW1vcnkgYmFja2luZyBmb3IgYSBwZWVyIGNoYXQgb24gc2Vzc2lvbiByZXN0b3JlLFxuXHQgKiBkZWNvZGluZyB0aGUgb3BhcXVlIGBwcm92aWRlckRhdGFgIHRoZSBvcmNoZXN0cmF0b3IgcGVyc2lzdGVkIGF0IGNyZWF0aW9uXG5cdCAqIChvciB0aGUgbGF0ZXN0IHtAbGluayBvbkRpZENoYW5nZUNoYXREYXRhfSkuIEFmdGVyIHRoaXMgcmVzb2x2ZXNcblx0ICogdGhlIGNoYXQncyBiYWNraW5nIFNESyBjaGF0IGNhbiBiZSByZXN1bWVkIGxhemlseSB2aWFcblx0ICoge0BsaW5rIF9lbnN1cmVDaGF0U2Vzc2lvbn0uIFdoZW4gYHByb3ZpZGVyRGF0YWAgaXMgYHVuZGVmaW5lZGAgKGEgbGVnYWN5XG5cdCAqIHNlc3Npb24gcGVyc2lzdGVkIGJlZm9yZSB0aGUgb3JjaGVzdHJhdG9yIG93bmVkIHRoZSBjYXRhbG9nKSB0aGUgYWdlbnRcblx0ICogZmFsbHMgYmFjayB0byBhIG9uZS10aW1lIHJlYWQgb2YgaXRzIG93biBgY29waWxvdC5jaGF0c2AgYmxvYi4gQmVzdC1lZmZvcnRcblx0ICogXHUyMDE0IGEgY29ycnVwdC91bmtub3duIGJsb2IgaXMgbG9nZ2VkIGFuZCBkcm9wcGVkIHJhdGhlciB0aGFuIHRocm93bi5cblx0ICovXG5cdGFzeW5jIG1hdGVyaWFsaXplQ2hhdChjaGF0OiBVUkksIHByb3ZpZGVyRGF0YTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzRGVmYXVsdENoYXRVcmkoY2hhdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdEluZm8gPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFjaGF0SW5mbykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGxldCBiYWNraW5nOiBJUGVyc2lzdGVkQ2hhdCB8IHVuZGVmaW5lZDtcblx0XHRpZiAocHJvdmlkZXJEYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGJhY2tpbmcgPSBkZWNvZGVQcm92aWRlckRhdGEocHJvdmlkZXJEYXRhKTtcblx0XHRcdGlmICghYmFja2luZykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBtYXRlcmlhbGl6ZUNoYXQ6IGRyb3BwaW5nIGNvcnJ1cHQgcHJvdmlkZXJEYXRhIGZvciAke2NoYXRLZXl9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTGVnYWN5IGZhbGxiYWNrOiBjb25zdWx0IHRoZSBhZ2VudCdzIG93biBwcmUtb3JjaGVzdHJhdG9yIGNhdGFsb2dcblx0XHRcdC8vIG9uY2UgdG8gcmVjb3ZlciB0aGUgYmFja2luZyBmb3Igc2Vzc2lvbnMgcGVyc2lzdGVkIGJlZm9yZVxuXHRcdFx0Ly8gYHByb3ZpZGVyRGF0YWAgZXhpc3RlZC5cblx0XHRcdGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IHRoaXMuX3JlYWRQZXJzaXN0ZWRDaGF0cyhVUkkucGFyc2UoY2hhdEluZm8uc2Vzc2lvbikpO1xuXHRcdFx0YmFja2luZyA9IHBlcnNpc3RlZC5nZXQoY2hhdEluZm8uY2hhdElkKTtcblx0XHRcdGlmICghYmFja2luZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdEtleSwgYmFja2luZyk7XG5cdH1cblxuXHQvKipcblx0ICogTWlncmF0aW9uLW9ubHkgZW51bWVyYXRpb24gb2YgdGhlIHNlc3Npb24ncyBwZWVyIGNoYXRzIGZyb20gdGhlIGFnZW50J3Ncblx0ICogbGVnYWN5IGBjb3BpbG90LmNoYXRzYCBjYXRhbG9nLCBtYXBwaW5nIGVhY2ggZW50cnkgdG8gaXRzIGNoYW5uZWwgVVJJIGFuZFxuXHQgKiB0aGUgc2FtZSBvcGFxdWUgYHByb3ZpZGVyRGF0YWAgYmxvYiB7QGxpbmsgbWF0ZXJpYWxpemVDaGF0fVxuXHQgKiBkZWNvZGVzLiBUaGUgb3JjaGVzdHJhdG9yIGNhbGxzIHRoaXMgb25jZSB0byBkcmFpbiBsZWdhY3kgY2hhdHMgaW50byBpdHNcblx0ICogb3duIGNhdGFsb2cuXG5cdCAqL1xuXHRhc3luYyBsaXN0TGVnYWN5Q2hhdHMoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRMZWdhY3lDaGF0W10+IHtcblx0XHRjb25zdCBwZXJzaXN0ZWQgPSBhd2FpdCB0aGlzLl9yZWFkUGVyc2lzdGVkQ2hhdHMoc2Vzc2lvbik7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQWdlbnRMZWdhY3lDaGF0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtjaGF0SWQsIGluZm9dIG9mIHBlcnNpc3RlZCkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyB1cmk6IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgY2hhdElkKSksIHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKGluZm8pIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBsaXZlIGJhY2tpbmcgZm9yIGEgcGVlciBjaGF0IGZyb20gdGhlIGluLW1lbW9yeVxuXHQgKiB7QGxpbmsgX2NoYXRCYWNraW5nc30gbWFwLCBmYWxsaW5nIGJhY2sgb25jZSB0byB0aGUgYWdlbnQncyBsZWdhY3lcblx0ICogYGNvcGlsb3QuY2hhdHNgIGNhdGFsb2cgKHNlZWRpbmcgdGhlIGxpdmUgbWFwKSBmb3Igc2Vzc2lvbnMgdGhhdCBoYXZlIG5vdFxuXHQgKiBiZWVuIG1hdGVyaWFsaXplZCB2aWEge0BsaW5rIG1hdGVyaWFsaXplQ2hhdH0uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQ2hhdEJhY2tpbmcoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPElQZXJzaXN0ZWRDaGF0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBsaXZlID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRpZiAobGl2ZSkge1xuXHRcdFx0cmV0dXJuIGxpdmU7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShjaGF0KTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgdGhpcy5fcmVhZFBlcnNpc3RlZENoYXRzKHNlc3Npb24pO1xuXHRcdGNvbnN0IGluZm8gPSBwZXJzaXN0ZWQuZ2V0KHBhcnNlZC5jaGF0SWQpO1xuXHRcdGlmIChpbmZvKSB7XG5cdFx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXRLZXksIGluZm8pO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5mbztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBTREstYmFja2VkIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufSBmb3IgYW4gYWRkaXRpb25hbCBwZWVyXG5cdCAqIGNoYXQsIHJlc3VtaW5nIGl0cyBiYWNraW5nIFNESyBjaGF0IGlmIGl0IGlzIG5vdCBhbHJlYWR5IGluXG5cdCAqIG1lbW9yeSAoZS5nLiBhZnRlciBhIHByb2Nlc3MgcmVzdGFydCkuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgY2hhdFxuXHQgKiBoYXMgbm8ga25vd24gYmFja2luZyBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlQ2hhdFNlc3Npb24oc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZmluZFBlZXJDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShzZXNzaW9uSWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnYWluID0gdGhpcy5fZmluZFBlZXJDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdFx0aWYgKGFnYWluKSB7XG5cdFx0XHRcdHJldHVybiBhZ2Fpbjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdEJhY2tpbmcoc2Vzc2lvbiwgY2hhdCk7XG5cdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudEVudHJ5ID0gdGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKSA/PyBhd2FpdCB0aGlzLl9yZXN1bWVTZXNzaW9uKHNlc3Npb25JZCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBwYXJlbnRFbnRyeT8ud29ya2luZ0RpcmVjdG9yeVxuXHRcdFx0XHQ/PyB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmdldChzZXNzaW9uSWQpPy53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIENhbm5vdCByZXN1bWUgY2hhdCAke2NoYXRLZXl9OiBtaXNzaW5nIHdvcmtpbmcgZGlyZWN0b3J5YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9lbnN1cmVDbGllbnQoKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2dldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCBhY3RpdmVDbGllbnQuc25hcHNob3QoKTtcblx0XHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgY2hhdCwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBsYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gPSB7XG5cdFx0XHRcdGtpbmQ6ICdyZXN1bWUnLFxuXHRcdFx0XHRjbGllbnQsXG5cdFx0XHRcdHNlc3Npb25JZDogaW5mby5zZGtTZXNzaW9uSWQsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHJlc29sdmVkQWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNuYXBzaG90LFxuXHRcdFx0XHRhY3RpdmVDbGllbnRUb29sU2V0OiBhY3RpdmVDbGllbnQudG9vbFNldCxcblx0XHRcdFx0c2hlbGxNYW5hZ2VyLFxuXHRcdFx0XHRnaXRodWJUb2tlbjogdGhpcy5fZ2l0aHViVG9rZW4sXG5cdFx0XHRcdGZhbGxiYWNrOiB7IG1vZGVsOiBpbmZvLm1vZGVsLCBsb25nQ29udGV4dFdpbmRvdzogdGhpcy5fbG9uZ0NvbnRleHRXaW5kb3dGb3IoaW5mby5tb2RlbD8uaWQpLCBmcmVlTG9uZ0NvbnRleHQ6IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KGluZm8ubW9kZWw/LmlkKSB9LFxuXHRcdFx0fTtcblx0XHRcdGxldCBhZ2VudFNlc3Npb246IENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhZ2VudFNlc3Npb24gPSB0aGlzLl9jcmVhdGVBZ2VudFNlc3Npb24obGF1bmNoUGxhbiwgd29ya2luZ0RpcmVjdG9yeSwgYWN0aXZlQ2xpZW50LCB7IHNlc3Npb25Vcmk6IHNlc3Npb24sIGNoYXRDaGFubmVsVXJpOiBjaGF0IH0pO1xuXHRcdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdFx0dGhpcy5fZW5zdXJlRW50cnkoc2Vzc2lvbklkKS5yZWdpc3RlclBlZXJDaGF0KGNoYXRLZXksIG5ldyBDb3BpbG90U2Vzc2lvbkVudHJ5KGFnZW50U2Vzc2lvbikpO1xuXHRcdFx0XHR0aGlzLl9zZGtTZXNzaW9uc0J5SWQuc2V0KGFnZW50U2Vzc2lvbi5zZXNzaW9uSWQsIGFnZW50U2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFJlc3VtZWQgYWRkaXRpb25hbCBjaGF0ICR7Y2hhdEtleX0gaW4gc2Vzc2lvbiAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0cmV0dXJuIGFnZW50U2Vzc2lvbjtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGFnZW50U2Vzc2lvbj8uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBGYWlsZWQgdG8gcmVzdW1lIGFkZGl0aW9uYWwgY2hhdCAke2NoYXRLZXl9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHRydW5jYXRlU2Vzc2lvbihzZXNzaW9uOiBVUkksIHR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0aWYgKHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXNQZWVyQ2hhdCA9ICFpc0RlZmF1bHRDaGF0VXJpKGNoYXQpO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVHJ1bmNhdGluZyAke2lzUGVlckNoYXQgPyBgcGVlciBjaGF0ICR7Y2hhdC50b1N0cmluZygpfWAgOiAnc2Vzc2lvbid9JHt0dXJuSWQgIT09IHVuZGVmaW5lZCA/IGAgYXQgdHVybklkPSR7dHVybklkfWAgOiAnIChhbGwgdHVybnMpJ31gKTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgZW50cnkgd2hvc2UgaGlzdG9yeSBpcyBiZWluZyB0cnVuY2F0ZWQ6IGEgcGVlciBjaGF0IGhhc1xuXHRcdFx0Ly8gaXRzIG93biBiYWNraW5nIFNESyBzZXNzaW9uLCBzbyByb3V0ZSB0byBpdCByYXRoZXIgdGhhbiB0aGUgZGVmYXVsdFxuXHRcdFx0Ly8gY2hhdC4gYF9yZXNvbHZlQ2hhdEVudHJ5YCByZXN1bWVzL21hdGVyaWFsaXplcyB0aGUgY2hhdCBpZiBuZWVkZWQuXG5cdFx0XHRjb25zdCBlbnRyeSA9IGlzUGVlckNoYXRcblx0XHRcdFx0PyBhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdEVudHJ5KHNlc3Npb24sIGNoYXQpXG5cdFx0XHRcdDogKHRoaXMuX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZCkgPz8gYXdhaXQgdGhpcy5fcmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQpKTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIE5vIGNoYXQgZW50cnkgcmVzb2x2ZWQgZm9yIHRydW5jYXRpb247IG5vdGhpbmcgdG8gdHJ1bmNhdGVgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb29rIHVwIHRoZSBTREsgZXZlbnQgSUQgZm9yIHRoZSB0cnVuY2F0aW9uIGJvdW5kYXJ5LlxuXHRcdFx0Ly8gVGhlIHByb3RvY29sIHNlbWFudGljczogdHVybklkIGlzIHRoZSBsYXN0IHR1cm4gdG8gS0VFUC5cblx0XHRcdC8vIFRoZSBTREsgc2VtYW50aWNzOiBldmVudElkIGFuZCBhbGwgZXZlbnRzIGFmdGVyIGl0IGFyZSByZW1vdmVkLlxuXHRcdFx0Ly8gU28gd2UgbmVlZCB0aGUgZXZlbnQgSUQgb2YgdGhlICpuZXh0KiB0dXJuIGFmdGVyIHR1cm5JZC5cblx0XHRcdC8vIEZvciBcInJlbW92ZSBhbGxcIiwgd2UgbmVlZCB0aGUgZmlyc3QgdHVybidzIGV2ZW50IElELlxuXHRcdFx0bGV0IGV2ZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0dXJuSWQpIHtcblx0XHRcdFx0ZXZlbnRJZCA9IGF3YWl0IGVudHJ5LmdldE5leHRUdXJuRXZlbnRJZCh0dXJuSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXZlbnRJZCA9IGF3YWl0IGVudHJ5LmdldEZpcnN0VHVybkV2ZW50SWQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2ZW50SWQpIHtcblx0XHRcdFx0YXdhaXQgZW50cnkudHJ1bmNhdGVBdEV2ZW50SWQoZXZlbnRJZCwgdHVybklkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBObyBldmVudCBJRCBmb3VuZCBmb3IgdHJ1bmNhdGlvbiwgbm90aGluZyB0byB0cnVuY2F0ZWApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU2Vzc2lvbiB0cnVuY2F0ZWRgKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoYW5nZU1vZGVsKGNoYXQ6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbG9uZ0NvbnRleHRXaW5kb3cgPSB0aGlzLl9sb25nQ29udGV4dFdpbmRvd0Zvcihtb2RlbC5pZCk7XG5cdFx0Y29uc3QgZnJlZUxvbmdDb250ZXh0ID0gdGhpcy5faXNGcmVlTG9uZ0NvbnRleHQobW9kZWwuaWQpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9nZXRDaGF0Q29udGV4dChjaGF0KTtcblx0XHQvLyBTYW1lIG92ZXJyaWRlIHRoZSBsYXVuY2hlciBhcHBsaWVzIGF0IGNyZWF0ZSAodmFsaWRhdGVkICsgbG9nZ2VkIGJ5XG5cdFx0Ly8gcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQpOyBjb21wdXRlZCBhdCB0aGUgcG9pbnQgb2YgdXNlIHNvIHRoZVxuXHRcdC8vIHByb3Zpc2lvbmFsLXNlc3Npb24gcGF0aCBkb2Vzbid0IHJlc29sdmUgb3IgbG9nIGl0IHByZW1hdHVyZWx5LlxuXHRcdGlmIChjb250ZXh0LmlzUGVlckNoYXQpIHtcblx0XHRcdGF3YWl0IGNvbnRleHQudGFyZ2V0Py5zZXRNb2RlbChtb2RlbC5pZCwgcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCBjb250ZXh0LnNlc3Npb25JZCksIGdldENvcGlsb3RDb250ZXh0VGllcihtb2RlbCwgbG9uZ0NvbnRleHRXaW5kb3csIGZyZWVMb25nQ29udGV4dCkpO1xuXHRcdFx0Y29uc3QgYmFja2luZyA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY29udGV4dC5jaGF0S2V5KTtcblx0XHRcdGlmIChiYWNraW5nKSB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWQ6IElQZXJzaXN0ZWRDaGF0ID0geyAuLi5iYWNraW5nLCBtb2RlbCB9O1xuXHRcdFx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNvbnRleHQuY2hhdEtleSwgdXBkYXRlZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hhdERhdGEuZmlyZSh7IGNoYXQ6IGNoYXQsIHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKHVwZGF0ZWQpIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aXNpb25hbCA9IHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZ2V0KGNvbnRleHQuc2Vzc2lvbklkKTtcblx0XHRpZiAocHJvdmlzaW9uYWwpIHtcblx0XHRcdHByb3Zpc2lvbmFsLm1vZGVsID0gbW9kZWw7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0gY29udGV4dC50YXJnZXQ7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRhd2FpdCBlbnRyeS5zZXRNb2RlbChtb2RlbC5pZCwgcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCBjb250ZXh0LnNlc3Npb25JZCksIGdldENvcGlsb3RDb250ZXh0VGllcihtb2RlbCwgbG9uZ0NvbnRleHRXaW5kb3csIGZyZWVMb25nQ29udGV4dCkpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25NZXRhZGF0YShjb250ZXh0LnNlc3Npb24sIG1vZGVsLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hhbmdlQWdlbnQoY2hhdDogVVJJLCBhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fZ2V0Q2hhdENvbnRleHQoY2hhdCk7XG5cdFx0aWYgKGNvbnRleHQuaXNQZWVyQ2hhdCkge1xuXHRcdFx0aWYgKGNvbnRleHQudGFyZ2V0KSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkQWdlbnROYW1lID0gYWdlbnQgPyB0aGlzLl9yZXNvbHZlQWdlbnROYW1lKGNvbnRleHQudGFyZ2V0LmFwcGxpZWRTbmFwc2hvdCwgYWdlbnQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRhd2FpdCBjb250ZXh0LnRhcmdldC5zZXRBZ2VudChyZXNvbHZlZEFnZW50TmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByb3Zpc2lvbmFsID0gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoY29udGV4dC5zZXNzaW9uSWQpO1xuXHRcdGlmIChwcm92aXNpb25hbCkge1xuXHRcdFx0cHJvdmlzaW9uYWwuYWdlbnQgPSBhZ2VudDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSBjb250ZXh0LnRhcmdldDtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdC8vIFJlc29sdmUgdGhlIFVSSSBcdTIxOTIgU0RLIG5hbWUgZnJvbSB0aGUgc2Vzc2lvbidzIGN1cnJlbnRseS1hcHBsaWVkXG5cdFx0XHQvLyBwbHVnaW4gc25hcHNob3QuIElmIHRoZSBhZ2VudCBpcyBubyBsb25nZXIgcHJlc2VudCAocGx1Z2luXG5cdFx0XHQvLyByZW1vdmVkLCBuZXZlciBsb2FkZWQpLCBwYXNzIGB1bmRlZmluZWRgIHNvIHRoZSBTREsgY2xlYXJzIGl0c1xuXHRcdFx0Ly8gc2VsZWN0aW9uIHJhdGhlciB0aGFuIHNpbGVudGx5IGtlZXBpbmcgdGhlIHByZXZpb3VzIG9uZS5cblx0XHRcdGNvbnN0IHJlc29sdmVkQWdlbnROYW1lID0gYWdlbnQgPyB0aGlzLl9yZXNvbHZlQWdlbnROYW1lKGVudHJ5LmFwcGxpZWRTbmFwc2hvdCwgYWdlbnQpIDogdW5kZWZpbmVkO1xuXHRcdFx0YXdhaXQgZW50cnkuc2V0QWdlbnQocmVzb2x2ZWRBZ2VudE5hbWUpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25BZ2VudE1ldGFkYXRhKGNvbnRleHQuc2Vzc2lvbiwgYWdlbnQpO1xuXHR9XG5cblx0YXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc2h1dGRvd25Qcm9taXNlID8/PSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gSW52YWxpZGF0ZSBhbnkgcmVxdWVzdCB0aGF0IHN0YXJ0ZWQgYmVmb3JlIHRlYXJkb3duLiBUb2tlblxuXHRcdFx0Ly8gaWRlbnRpdHkgYWxvbmUgZG9lcyBub3QgY2hhbmdlIGR1cmluZyBzaHV0ZG93biwgc28gd2l0aG91dCB0aGlzXG5cdFx0XHQvLyBndWFyZCBhIGxhdGUgc3VjY2VzcyBjb3VsZCByZXB1Ymxpc2ggYWZ0ZXIgdGhlIGhvc3Qgc3RvcHBlZC5cblx0XHRcdHRoaXMuX21vZGVsQ2F0YWxvZ0dlbmVyYXRpb24rKztcblx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaFNjaGVkdWxlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2g/LmRlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2ggPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgbW9kZWwtcmVmcmVzaCByZXRyeSBzbyBpdHMgdGltZXIgY2Fubm90IGZpcmVcblx0XHRcdC8vIGFmdGVyIHRlYXJkb3duIGFuZCByZXN1cnJlY3QgdGhlIGNsaWVudC5cblx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaFJldHJ5LmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDb3BpbG90XSBTaHV0dGluZyBkb3duLi4uJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWRzID0gbmV3IFNldChbLi4udGhpcy5fc2Vzc2lvbnMua2V5cygpXSk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBzZXNzaW9uSWRzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoc2Vzc2lvbklkLCAoKSA9PiB0aGlzLl9kZXN0cm95QW5kRGlzcG9zZVNlc3Npb24oc2Vzc2lvbklkKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9zdG9wQ2xpZW50KCk7XG5cdFx0fSkoKTtcblx0XHRyZXR1cm4gdGhpcy5fc2h1dGRvd25Qcm9taXNlO1xuXHR9XG5cblx0cmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIGFwcHJvdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjaGF0IG9mIGVudHJ5LmFsbENoYXRTZXNzaW9ucygpKSB7XG5cdFx0XHRcdGlmIChjaGF0LnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3RJZCwgYXBwcm92ZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgZW50cnkuYWxsQ2hhdFNlc3Npb25zKCkpIHtcblx0XHRcdFx0aWYgKGNoYXQucmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQsIHJlc3BvbnNlLCBhbnN3ZXJzKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhpcyBwcm92aWRlciBvd25zIHRoZSBnaXZlbiBzZXNzaW9uIElELiBJbmNsdWRlc1xuXHQgKiBwcm92aXNpb25hbCBzZXNzaW9ucyB0aGF0IGhhdmUgbm90IHlldCBiZWVuIG1hdGVyaWFsaXplZC5cblx0ICovXG5cdGhhc1Nlc3Npb24oc2Vzc2lvbjogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSB8fCB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmhhcyhzZXNzaW9uSWQpO1xuXHR9XG5cblx0Ly8gLS0tLSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbmZpZ3VyZVByb3h5RW52KGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3h5ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVByb3h5Rm9yU2RrKGVudik7XG5cdFx0dGhpcy5fYXBwbGllZFByb3h5ID0gcHJveHk7XG5cdFx0aWYgKHByb3h5KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBDT1BJTE9UX1BST1hZX1NFVF9FTlZfS0VZUykge1xuXHRcdFx0XHRlbnZba2V5XSA9IHByb3h5O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbQ29waWxvdF0gUmVzb2x2ZWQgQ0FQSSBwcm94eSBhbmQgZm9yd2FyZGVkIEhUVFBfUFJPWFkvSFRUUFNfUFJPWFkgdG8gQ29waWxvdCBTREsnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUHJveHlGb3JTZGsoZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+ID0gcHJvY2Vzcy5lbnYpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5faXNTeXN0ZW1Qcm94eUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKENPUElMT1RfUFJPWFlfRU5WX0tFWVMuc29tZShrZXkgPT4gZW52W2tleV0pKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdbQ29waWxvdF0gUHJveHkgZW52IHZhciBhbHJlYWR5IHNldDsgbGVhdmluZyBDb3BpbG90IFNESyBwcm94eSBjb25maWd1cmF0aW9uIHRvIHRoZSBlbnZpcm9ubWVudCcpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgY2FwaVVybCA9IGVudlsnVlNDT0RFX0FHRU5UX0hPU1RfQ0FQSV9VUkxfT1ZFUlJJREUnXSB8fCBDT1BJTE9UX0NBUElfVVJMO1xuXHRcdGlmICh0aGlzLl9naXRodWJUb2tlbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGlzY292ZXJlZCA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc29sdmVBcGlFbmRwb2ludCh0aGlzLl9naXRodWJUb2tlbik7XG5cdFx0XHRcdGlmIChkaXNjb3ZlcmVkKSB7XG5cdFx0XHRcdFx0Y2FwaVVybCA9IGRpc2NvdmVyZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtDb3BpbG90XSBDQVBJIGVuZHBvaW50IGRpc2NvdmVyeSBmb3IgcHJveHkgcmVzb2x1dGlvbiBmYWlsZWQ7IHVzaW5nICR7Y2FwaVVybH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcHJveHlSZXNvbHZlci5yZXNvbHZlUHJveHkoY2FwaVVybCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byByZXNvbHZlIENBUEkgcHJveHkgZm9yICR7Y2FwaVVybH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiB0aGUgR2l0SHViIHRva2VuIGNoYW5nZXMsIHRoZSB0b2tlbi1kaXNjb3ZlcmVkIENBUEkgZW5kcG9pbnQgKGFuZCBzb1xuXHQgKiB0aGUgcmVzb2x2ZWQgcHJveHkpIGNhbiBjaGFuZ2UuIFRoZSBwcm94eSBpcyBiYWtlZCBpbnRvIHRoZSBTREsgc3VicHJvY2Vzc1xuXHQgKiBlbnYgYXQgY2xpZW50IHN0YXJ0LCBzbyBpZiBpdCB3b3VsZCBub3cgZGlmZmVyIHdlIHJlc3RhcnQgdGhlIHJ1bm5pbmdcblx0ICogY2xpZW50IGhlcmUgKGRlZmVycmVkIHdoaWxlIGEgdHVybiBpcyBpbiBmbGlnaHQsIHNlZVxuXHQgKiB7QGxpbmsgX3JlcXVlc3RDbGllbnRSZXN0YXJ0fSk7IHRoZSBuZXh0IGBfZW5zdXJlQ2xpZW50YCByZS1yZXNvbHZlcyBpdFxuXHQgKiBhZ2FpbnN0IHRoZSBuZXcgdG9rZW4uIE5vLW9wIHdoZW4gbm8gY2xpZW50IGlzIHJ1bm5pbmcvc3RhcnRpbmcgb3IgdGhlXG5cdCAqIHByb3h5IGlzIHVuY2hhbmdlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3RhcnRDbGllbnRJZlByb3h5Q2hhbmdlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2NsaWVudCAmJiAhdGhpcy5fY2xpZW50U3RhcnRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb2xkUHJveHkgPSB0aGlzLl9hcHBsaWVkUHJveHk7XG5cdFx0Y29uc3QgbmV3UHJveHkgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUHJveHlGb3JTZGsoKTtcblx0XHRpZiAobmV3UHJveHkgPT09IG9sZFByb3h5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIExldCBhbnkgaW4tZmxpZ2h0IHN0YXJ0IGZpbmlzaCBzbyB3ZSBzdG9wIGEgbGl2ZSBjbGllbnQgcmF0aGVyIHRoYW5cblx0XHQvLyByYWNpbmcgaXQgKHRoZSBzdGFydCB3b3VsZCBvdGhlcndpc2UgY29tZSB1cCB3aXRoIHRoZSBzdGFsZSBwcm94eSkuXG5cdFx0aWYgKHRoaXMuX2NsaWVudFN0YXJ0aW5nKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jbGllbnRTdGFydGluZztcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBTdGFydCBmYWlsZWQ7IG5vdGhpbmcgcnVubmluZyB0byByZXN0YXJ0LlxuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9yZXF1ZXN0Q2xpZW50UmVzdGFydChgQ0FQSSBwcm94eSBjaGFuZ2VkIGFmdGVyIHRva2VuIHVwZGF0ZSAoJHtvbGRQcm94eSA/PyAnKG5vbmUpJ30gLT4gJHtuZXdQcm94eSA/PyAnKG5vbmUpJ30pYCk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZXMgZXZlcnkgcGVlciBjaGF0IGhvc3RlZCBvbiB0aGUgb3duaW5nIHNlc3Npb24ncyBlbnRyeSBhbmQgZHJvcHNcblx0ICogdGhlaXIgbGl2ZSBiYWNraW5ncyBmcm9tIHtAbGluayBfY2hhdEJhY2tpbmdzfS4gVGhlIGNoYXQgVVJJIGVuY29kZXMgaXRzXG5cdCAqIHBhcmVudCBzZXNzaW9uLCBzbyB3ZSByZWNvdmVyIGl0IHZpYSB7QGxpbmsgcGFyc2VDaGF0VXJpfS5cblx0ICovXG5cdHByaXZhdGUgX2Rpc3Bvc2VDaGlsZENoYXRzKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdGZvciAoY29uc3QgY2hhdEtleSBvZiBlbnRyeS5wZWVyQ2hhdEtleXMoKSkge1xuXHRcdFx0XHRlbnRyeS5kaXNwb3NlUGVlckNoYXQoY2hhdEtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgY2hhdEtleSBvZiBbLi4udGhpcy5fY2hhdEJhY2tpbmdzLmtleXMoKV0pIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShVUkkucGFyc2UoY2hhdEtleSkpO1xuXHRcdFx0aWYgKHBhcnNlZCAmJiBBZ2VudFNlc3Npb24uaWQocGFyc2VkLnNlc3Npb24pID09PSBzZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy5fY2hhdEJhY2tpbmdzLmRlbGV0ZShjaGF0S2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChzZXNzaW9uOiBVUkksIGRpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogQWN0aXZlQ2xpZW50IHtcblx0XHRsZXQgY2xpZW50ID0gdGhpcy5fYWN0aXZlQ2xpZW50cy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFjbGllbnQpIHtcblx0XHRcdGNvbnN0IHBsdWdpbkNvbnRyb2xsZXIgPSB0aGlzLl9wbHVnaW5zLmNyZWF0ZVNlc3Npb25Db250cm9sbGVyKHNlc3Npb24sIGRpcmVjdG9yeSk7XG5cdFx0XHRjbGllbnQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3RpdmVDbGllbnQsIHNlc3Npb24sIHBsdWdpbkNvbnRyb2xsZXIsIHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudHMuc2V0KHNlc3Npb24sIGNsaWVudCk7XG5cdFx0fSBlbHNlIGlmIChkaXJlY3RvcnkpIHtcblx0XHRcdGNsaWVudC5wbHVnaW5Db250cm9sbGVyLnNldERpcmVjdG9yeShkaXJlY3RvcnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2xpZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEluc3RhbnRpYXRlcyBhIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufSBmb3IgdGhlIGdpdmVuIHNlc3Npb24gaWQuXG5cdCAqIFRoZSBjYWxsZXIgaXMgcmVzcG9uc2libGUgZm9yIGF3YWl0aW5nIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9uLmluaXRpYWxpemVTZXNzaW9ufVxuXHQgKiBhbmQsIG9uIHN1Y2Nlc3MsIHJlZ2lzdGVyaW5nIHRoZSBlbnRyeSBpbiB7QGxpbmsgX3Nlc3Npb25zfS4gVGhlXG5cdCAqIHNlc3Npb24gaXMgaW50ZW50aW9uYWxseSAqKm5vdCoqIHJlZ2lzdGVyZWQgaGVyZSBzbyBhIGNvbmN1cnJlbnRcblx0ICoge0BsaW5rIF9yZXN1bWVTZXNzaW9ufSBmb3IgdGhlIHNhbWUgaWQgY2Fubm90IGRpc3Bvc2UgdGhpcyBlbnRyeSBtaWQtaW5pdFxuXHQgKiB2aWEge0BsaW5rIERpc3Bvc2FibGVNYXAuc2V0fS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZUFnZW50U2Vzc2lvbihsYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCwgYWN0aXZlQ2xpZW50OiBBY3RpdmVDbGllbnQsIGlkZW50aXR5PzogSUNvcGlsb3RBZ2VudFNlc3Npb25JZGVudGl0eSk6IENvcGlsb3RBZ2VudFNlc3Npb24ge1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBpZGVudGl0eT8uc2Vzc2lvblVyaSA/PyBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIGxhdW5jaFBsYW4uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjaGF0Q2hhbm5lbFVyaSA9IGlkZW50aXR5Py5jaGF0Q2hhbm5lbFVyaSA/PyBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvcGlsb3RBZ2VudFNlc3Npb24sXG5cdFx0XHR7XG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdGNoYXRDaGFubmVsVXJpLFxuXHRcdFx0XHRyYXdTZXNzaW9uSWQ6IGxhdW5jaFBsYW4uc2Vzc2lvbklkLFxuXHRcdFx0XHRvbkRpZFNlc3Npb25Qcm9ncmVzczogdGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MsXG5cdFx0XHRcdHNlc3Npb25MYXVuY2hlcjogdGhpcy5fc2Vzc2lvbkxhdW5jaGVyLFxuXHRcdFx0XHRsYXVuY2hQbGFuLFxuXHRcdFx0XHRzaGVsbE1hbmFnZXI6IGxhdW5jaFBsYW4uc2hlbGxNYW5hZ2VyLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBsYXVuY2hQbGFuLndvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25EaXJlY3RvcnksXG5cdFx0XHRcdGNsaWVudFNuYXBzaG90OiBsYXVuY2hQbGFuLnNuYXBzaG90LFxuXHRcdFx0XHRhY3RpdmVDbGllbnRUb29sU2V0OiBsYXVuY2hQbGFuLmFjdGl2ZUNsaWVudFRvb2xTZXQsXG5cdFx0XHRcdHJlc29sdmVNY3BDaGlsZElkOiBuYW1lID0+IGZpbmRNY3BDaGlsZElkKGFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLmdldEN1c3RvbWl6YXRpb25zKCksIG5hbWUpLFxuXHRcdFx0XHRzZXJ2ZXJUb29sSG9zdDogdGhpcy5fc2VydmVyVG9vbEhvc3QsXG5cdFx0XHRcdGlzTGF1bmNoVG9rZW5DdXJyZW50OiAoKSA9PiB0aGlzLl9naXRodWJUb2tlbiA9PT0gbGF1bmNoUGxhbi5naXRodWJUb2tlbixcblx0XHRcdFx0b25UdXJuRW5kZWQ6ICgpID0+IHRoaXMuX29uQ2hhdFR1cm5FbmRlZCgpLFxuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fbWNwTm90aWZpY2F0aW9uU3Vicy5zZXQobGF1bmNoUGxhbi5zZXNzaW9uSWQsIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdGFnZW50U2Vzc2lvbi5vbk1jcE5vdGlmaWNhdGlvbihuID0+IHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmZpcmUobikpLFxuXHRcdFx0YXV0b3J1bihyID0+IGFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLm1jcFNlcnZlclN0YXRlcy5zZXQoYWdlbnRTZXNzaW9uLm1jcFNlcnZlclN0YXRlcy5yZWFkKHIpLCB1bmRlZmluZWQpKSxcblx0XHQpKTtcblxuXHRcdHJldHVybiBhZ2VudFNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBmcmVzaGx5IGluaXRpYWxpc2VkIHNlc3Npb24gaW4gYF9zZXNzaW9uc2AsIG9yIFx1MjAxNCBpZlxuXHQgKiBzaHV0ZG93biBoYXMgYWxyZWFkeSBzdGFydGVkIGJldHdlZW4gaW5pdCBiZWdpbm5pbmcgYW5kIHJlc29sdmluZyBcdTIwMTRcblx0ICogZGlzcG9zZSB0aGUgc2Vzc2lvbiBhbmQgdGhyb3cge0BsaW5rIENhbmNlbGxhdGlvbkVycm9yfS4gV2l0aG91dCB0aGlzXG5cdCAqIGd1YXJkIGFuIGluLWZsaWdodCBgX3Jlc3VtZVNlc3Npb25gIC8gYF9tYXRlcmlhbGl6ZVByb3Zpc2lvbmFsYCB3aG9zZVxuXHQgKiBgaW5pdGlhbGl6ZVNlc3Npb24oKWAgcmVzb2x2ZXMgYWZ0ZXIgYGRpc3Bvc2UoKWAgaGFzIHJ1biB3b3VsZCBjYWxsXG5cdCAqIGBfc2Vzc2lvbnMuc2V0KC4uLilgIG9uIGEgZGlzcG9zZWQgYERpc3Bvc2FibGVNYXBgLCBsZWFraW5nIHRoZVxuXHQgKiBzZXNzaW9uIGFuZCByZXByb2R1Y2luZyB0aGUgdmVyeSAnVHJ5aW5nIHRvIGFkZCBhIGRpc3Bvc2FibGUgdG8gYVxuXHQgKiBEaXNwb3NhYmxlU3RvcmUgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkJyB3YXJuaW5nIHRoaXMgZml4XG5cdCAqIGV4aXN0cyB0byBwcmV2ZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJJbml0aWFsaXplZFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIGFnZW50U2Vzc2lvbjogQ29waWxvdEFnZW50U2Vzc2lvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zaHV0ZG93blByb21pc2UpIHtcblx0XHRcdGFnZW50U2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0Ly8gUmV1c2UgYW4gZXhpc3RpbmcgZW50cnkgKHdoaWNoIG1heSBhbHJlYWR5IGhvc3QgcGVlciBjaGF0cyBjcmVhdGVkXG5cdFx0Ly8gd2hpbGUgdGhlIGRlZmF1bHQgY2hhdCB3YXMgc3RpbGwgcHJvdmlzaW9uYWwpIHJhdGhlciB0aGFuIHJlcGxhY2luZ1xuXHRcdC8vIGl0LCB3aGljaCB3b3VsZCBkaXNwb3NlIHRob3NlIHBlZXJzLiBUaGUgZGVmYXVsdCBjaGF0IGlzIHNlZWRlZCBpbnRvXG5cdFx0Ly8gdGhlIGVudHJ5J3MgdW5pZm9ybSBjaGF0IG1hcCBrZXllZCBieSBpdHMgZGVmYXVsdC1jaGF0IFVSSS5cblx0XHRjb25zdCBkZWZhdWx0Q2hhdEtleSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoYWdlbnRTZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0bGV0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0ZW50cnkgPSBuZXcgQ29waWxvdFNlc3Npb25FbnRyeSgpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgZW50cnkpO1xuXHRcdH1cblx0XHRlbnRyeS5zZXREZWZhdWx0Q2hhdChkZWZhdWx0Q2hhdEtleSwgbmV3IENvcGlsb3RTZXNzaW9uRW50cnkoYWdlbnRTZXNzaW9uKSk7XG5cdFx0dGhpcy5fc2RrU2Vzc2lvbnNCeUlkLnNldChhZ2VudFNlc3Npb24uc2Vzc2lvbklkLCBhZ2VudFNlc3Npb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVzdHJveUFuZERpc3Bvc2VTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVsZWFzZVNlc3Npb25SZXNvdXJjZXMoc2Vzc2lvbklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZWFycyBkb3duIGEgc2Vzc2lvbidzIGluLW1lbW9yeSByZXNvdXJjZXMgd2l0aG91dCBkZWxldGluZyBhbnkgZHVyYWJsZVxuXHQgKiBkYXRhOiB0aGUgU0RLIHNlc3Npb24gaXMgZGlzY29ubmVjdGVkLCBwZWVyIGNoYXRzIGFuZCBNQ1Agc3Vic2NyaXB0aW9uc1xuXHQgKiBhcmUgZGlzcG9zZWQsIHRoZSBgX3Nlc3Npb25zYCBlbnRyeSBpcyBkcm9wcGVkLCBhbmQgYWN0aXZlIGNsaWVudHMgYXJlXG5cdCAqIHJlbGVhc2VkLiBUaGUgb24tZGlzayBTREsgc2Vzc2lvbiBsb2csIHNlc3Npb24gZGF0YWJhc2UsIGFuZCB3b3JrdHJlZSBhcmVcblx0ICogbGVmdCB1bnRvdWNoZWQsIHNvIHRoZSBzZXNzaW9uIGNhbiBiZSByZXN1bWVkIGxhdGVyIHZpYVxuXHQgKiB7QGxpbmsgX3Jlc3VtZVNlc3Npb259LiBTaGFyZWQgYnkgdGhlIG5vbi1kZXN0cnVjdGl2ZSB7QGxpbmsgcmVsZWFzZVNlc3Npb259XG5cdCAqIHBhdGggYW5kIHRoZSBkZXN0cnVjdGl2ZSB7QGxpbmsgX2Rlc3Ryb3lBbmREaXNwb3NlU2Vzc2lvbn0gcGF0aCAodGhlXG5cdCAqIGxhdHRlciByZWFwcyB0aGUgd29ya3RyZWUgYWZ0ZXJ3YXJkcykuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWxlYXNlU2Vzc2lvblJlc291cmNlcyhzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKT8uYWxsQ2hhdFNlc3Npb25zKCkgPz8gW10pIHtcblx0XHRcdHRoaXMuX3Nka1Nlc3Npb25zQnlJZC5kZWxldGUoY2hhdC5zZXNzaW9uSWQpO1xuXHRcdH1cblx0XHQvLyBUZWFyIGRvd24gYW55IHBlZXIgY2hhdHMgb3duZWQgYnkgdGhpcyBzZXNzaW9uIGZpcnN0IHNvIHRoZWlyIFNES1xuXHRcdC8vIGNoYXRzIGRvbid0IGxlYWsgd2hlbiB0aGUgcGFyZW50IGlzIGRlbGV0ZWQvZGlzcG9zZWRcblx0XHQvLyB3aXRob3V0IGVhY2ggY2hhdCBiZWluZyBpbmRpdmlkdWFsbHkgZGlzcG9zZWQgdmlhIGBkaXNwb3NlQ2hhdGAuXG5cdFx0dGhpcy5fZGlzcG9zZUNoaWxkQ2hhdHMoc2Vzc2lvbklkKTtcblx0XHQvLyBQcm92aXNpb25hbCBzZXNzaW9ucyBoYXZlIG5vIFNESyBzZXNzaW9uLCBubyB3b3JrdHJlZSwgYW5kIG5vXG5cdFx0Ly8gb24tZGlzayBtZXRhZGF0YSBcdTIwMTQgZHJvcCB0aGUgaW4tbWVtb3J5IHJlY29yZCBhbmQgY2xlYW4gdXAgdGhlXG5cdFx0Ly8gYWN0aXZlLWNsaWVudCBzbmFwc2hvdC4gVGhlIHN0YXRlLW1hbmFnZXIgZW50cnkgaXMgcmVtb3ZlZCBieSB0aGVcblx0XHQvLyBjYWxsZXIgdmlhIHtAbGluayBJQWdlbnRTZXJ2aWNlLmRpc3Bvc2VTZXNzaW9ufS5cblx0XHRjb25zdCBwcm92aXNpb25hbCA9IHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKHByb3Zpc2lvbmFsKSB7XG5cdFx0XHR0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0Ly8gRHJvcCBhbnkgcGVlci1ob3N0IGVudHJ5IGNyZWF0ZWQgZm9yIHRoaXMgc3RpbGwtcHJvdmlzaW9uYWxcblx0XHRcdC8vIHNlc3Npb24gKGl0cyBwZWVycyB3ZXJlIGRpc3Bvc2VkIGJ5IGBfZGlzcG9zZUNoaWxkQ2hhdHNgIGFib3ZlKS5cblx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudHMuZ2V0KHByb3Zpc2lvbmFsLnNlc3Npb25VcmkpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVDbGllbnRzLmRlbGV0ZShwcm92aXNpb25hbC5zZXNzaW9uVXJpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNlc3Npb25JZCk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBlbnRyeS5kZXN0cm95U2Vzc2lvbigpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEZhaWxlZCB0byBkZXN0cm95IHNlc3Npb24gYmVmb3JlIGNsZWFudXA6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5fbWNwTm90aWZpY2F0aW9uU3Vicy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5fYWN0aXZlQ2xpZW50cy5nZXQoc2Vzc2lvblVyaSk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hY3RpdmVDbGllbnRzLmRlbGV0ZShzZXNzaW9uVXJpKTtcblx0XHQvLyBEaXNwb3NpbmcgYSBzZXNzaW9uIHdpdGggYSBydW5uaW5nIHR1cm4gcmVtb3ZlcyB0aGUgbGFzdCB0aGluZyBhXG5cdFx0Ly8gcGFya2VkIHJlc3RhcnQgY291bGQgYmUgd2FpdGluZyBvbiwgYW5kIGEgZGlzcG9zZWQgc2Vzc2lvbiBuZXZlclxuXHRcdC8vIHJlcG9ydHMgaXRzIHR1cm4gZW5kaW5nLlxuXHRcdGF3YWl0IHRoaXMuX2FwcGx5UGVuZGluZ0NsaWVudFJlc3RhcnQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Q29waWxvdEFnZW50U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcmVzdW1pbmdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMuX2RvUmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3Jlc3VtaW5nU2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgcHJvbWlzZSk7XG5cdFx0Y29uc3QgY2xlYW51cCA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9yZXN1bWluZ1Nlc3Npb25zLmdldChzZXNzaW9uSWQpID09PSBwcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3VtaW5nU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRwcm9taXNlLnRoZW4oY2xlYW51cCwgY2xlYW51cCk7XG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1Jlc3VtZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gX3Jlc3VtZVNlc3Npb24gY2FsbGVkIFx1MjAxNCBzZXNzaW9uIG5vdCBpbiBtZW1vcnksIHJlc3VtaW5nLi4uYCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHN0b3JlZE1ldGFkYXRhID0gYXdhaXQgdGhpcy5fcmVhZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBzZXNzaW9uTWV0YWRhdGEgPSBhd2FpdCBjbGllbnQuZ2V0U2Vzc2lvbk1ldGFkYXRhKHNlc3Npb25JZCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBnZXRTZXNzaW9uTWV0YWRhdGEgZmFpbGVkYCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHN0b3JlZE1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcnkgPz8gKHR5cGVvZiBzZXNzaW9uTWV0YWRhdGE/LmNvbnRleHQ/LndvcmtpbmdEaXJlY3RvcnkgPT09ICdzdHJpbmcnID8gVVJJLmZpbGUoc2Vzc2lvbk1ldGFkYXRhLmNvbnRleHQud29ya2luZ0RpcmVjdG9yeSkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB3b3JraW5nRGlyZWN0b3J5IGlzIHJlcXVpcmVkIHRvIHJlc3VtZSBDb3BpbG90IHNlc3Npb24gJyR7c2Vzc2lvbklkfSdgKTtcblx0XHR9XG5cdFx0Ly8gQSB3b3Jrc3BhY2UtbGVzcyBjaGF0J3Mgd29ya2luZyBkaXJlY3RvcnkgaXMgYSBzdGFibGUgcGVyLXNlc3Npb24gc2NyYXRjaCBkaXJcblx0XHQvLyB0aGF0IG1heSBoYXZlIGJlZW4gcmVhcGVkIChPUyB0ZW1wIGNsZWFudXAsIHJlYm9vdCkgd2hpbGUgdGhlIHNlc3Npb25cblx0XHQvLyBwZXJzaXN0ZWQuIFJlY3JlYXRlIGl0IChta2RpciAtcCkgc28gc2hlbGwvZ2l0L3NjcmF0Y2ggb3BzIGRvbid0IGZhaWwuXG5cdFx0bGV0IHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA9IHdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0aWYgKHN0b3JlZE1ldGFkYXRhLndvcmtzcGFjZWxlc3MpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Vuc3VyZVdvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHdvcmtpbmdEaXJlY3RvcnksIHNlc3Npb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0fVxuXHRcdC8vIEFuY2hvciBjdXN0b21pemF0aW9uIGRpc2NvdmVyeSB0byB0aGUgd29ya2luZyBkaXJlY3RvcnkgKHRoZSB3b3JrdHJlZSBmb3Jcblx0XHQvLyB3b3JrdHJlZS1pc29sYXRlZCBzZXNzaW9ucyksIG1hdGNoaW5nIGhvdyB0aGUgc2Vzc2lvbiB3YXMgbWF0ZXJpYWxpemVkLlxuXHRcdC8vIE9sZGVyIHNlc3Npb25zIHBlcnNpc3RlZCBgY3VzdG9taXphdGlvbkRpcmVjdG9yeWAgYXMgdGhlIHVzZXItcGlja2VkXG5cdFx0Ly8gZm9sZGVyOyBwcmVmZXJyaW5nIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBjb3JyZWN0cyB0aGVtIG9uIHJlc3VtZS5cblx0XHRjb25zdCBjdXN0b21pemF0aW9uRGlyZWN0b3J5ID0gcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5O1xuXHRcdC8vIEFsd2F5cyBjcmVhdGUgYW4gQWN0aXZlQ2xpZW50IHNvIHRoZSBzbmFwc2hvdCBpbmNsdWRlcyBob3N0ICtcblx0XHQvLyBzZXNzaW9uLWRpc2NvdmVyZWQgY3VzdG9taXphdGlvbnMsIGV2ZW4gd2hlbiBubyBjbGllbnQgaGFzXG5cdFx0Ly8gcmVnaXN0ZXJlZCBhbiBhY3RpdmUtY2xpZW50IGhhbmRsZSB5ZXQuXG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvblVyaSwgY3VzdG9taXphdGlvbkRpcmVjdG9yeSk7XG5cdFx0YWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIucmVhbmNob3IoY3VzdG9taXphdGlvbkRpcmVjdG9yeSk7XG5cdFx0Ly8gTXVsdGktcm9vdDogcmUtYXR0YWNoIHRoZSBwZXJzaXN0ZWQgbm9uLXByaW1hcnkgcm9vdHMgc28gZGlzY292ZXJ5IHNwYW5zXG5cdFx0Ly8gZXZlcnkgcm9vdCBvbiByZXN1bWUuIEVtcHR5IHdoZW4gc2luZ2xlLXJvb3QgLyBnYXRlZCBvZmYuXG5cdFx0YWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIuc2V0QWRkaXRpb25hbERpcmVjdG9yaWVzKHRoaXMuX2FkZGl0aW9uYWxDdXN0b21pemF0aW9uRGlyZWN0b3JpZXMoc3RvcmVkTWV0YWRhdGEud29ya2luZ0RpcmVjdG9yaWVzKSk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCBhY3RpdmVDbGllbnQuc25hcHNob3QoKTtcblxuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgc2Vzc2lvblVyaSwgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCByZXNvbHZlZEFnZW50TmFtZSA9IHN0b3JlZE1ldGFkYXRhLmFnZW50ID8gdGhpcy5fcmVzb2x2ZUFnZW50TmFtZShzbmFwc2hvdCwgc3RvcmVkTWV0YWRhdGEuYWdlbnQpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChzdG9yZWRNZXRhZGF0YS5hZ2VudCAmJiAhcmVzb2x2ZWRBZ2VudE5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTdG9yZWQgY3VzdG9tIGFnZW50IGlzIG5vdCBhdmFpbGFibGUgaW4gdGhlIGN1cnJlbnQgcGx1Z2luIHNuYXBzaG90OyByZXN1bWluZyB3aXRob3V0IGEgY3VzdG9tIGFnZW50YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGxhdW5jaFBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiA9IHtcblx0XHRcdGtpbmQ6ICdyZXN1bWUnLFxuXHRcdFx0Y2xpZW50LFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzOiBzdG9yZWRNZXRhZGF0YS53b3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpLFxuXHRcdFx0cmVzb2x2ZWRBZ2VudE5hbWUsXG5cdFx0XHRzbmFwc2hvdCxcblx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQ6IGFjdGl2ZUNsaWVudC50b29sU2V0LFxuXHRcdFx0c2hlbGxNYW5hZ2VyLFxuXHRcdFx0Z2l0aHViVG9rZW46IHRoaXMuX2dpdGh1YlRva2VuLFxuXHRcdFx0d29ya3NwYWNlbGVzczogc3RvcmVkTWV0YWRhdGEud29ya3NwYWNlbGVzcyxcblx0XHRcdGZhbGxiYWNrOiB7XG5cdFx0XHRcdG1vZGVsOiBzdG9yZWRNZXRhZGF0YS5tb2RlbCxcblx0XHRcdFx0bG9uZ0NvbnRleHRXaW5kb3c6IHRoaXMuX2xvbmdDb250ZXh0V2luZG93Rm9yKHN0b3JlZE1ldGFkYXRhLm1vZGVsPy5pZCksXG5cdFx0XHRcdGZyZWVMb25nQ29udGV4dDogdGhpcy5faXNGcmVlTG9uZ0NvbnRleHQoc3RvcmVkTWV0YWRhdGEubW9kZWw/LmlkKSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZUFnZW50U2Vzc2lvbihsYXVuY2hQbGFuLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5LCBhY3RpdmVDbGllbnQpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVySW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25JZCwgYWdlbnRTZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFnZW50U2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFnZW50U2Vzc2lvbjtcblx0fVxuXG5cdC8vIC0tLS0gc2Vzc2lvbiBtZXRhZGF0YSBwZXJzaXN0ZW5jZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX01PREVMID0gJ2NvcGlsb3QubW9kZWwnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUVUQV9BR0VOVCA9ICdjb3BpbG90LmFnZW50Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01FVEFfQ1dEID0gJ2NvcGlsb3Qud29ya2luZ0RpcmVjdG9yeSc7XG5cdC8qKiBQZXJzaXN0ZWQgb3JkZXJlZCB3b3JraW5nLWRpcmVjdG9yeSBzZXQgKEpTT04gYXJyYXkgb2YgVVJJIHN0cmluZ3M7IGluZGV4IDAgPSBwcmltYXJ5KS4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01FVEFfQ1dEUyA9ICdjb3BpbG90LndvcmtpbmdEaXJlY3Rvcmllcyc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX0NVU1RPTUlaQVRJT05fRElSRUNUT1JZID0gJ2NvcGlsb3QuY3VzdG9taXphdGlvbkRpcmVjdG9yeSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX1BST0pFQ1RfUkVTT0xWRUQgPSAnY29waWxvdC5wcm9qZWN0LnJlc29sdmVkJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01FVEFfUFJPSkVDVF9VUkkgPSAnY29waWxvdC5wcm9qZWN0LnVyaSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX1BST0pFQ1RfRElTUExBWV9OQU1FID0gJ2NvcGlsb3QucHJvamVjdC5kaXNwbGF5TmFtZSc7XG5cdC8qKiBQZXJzaXN0ZWQgY2F0YWxvZyBvZiBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgcGVlciBjaGF0cywga2V5ZWQgYnkgY2hhdElkLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUVUQV9DSEFUUyA9ICdjb3BpbG90LmNoYXRzJztcblxuXHQvKipcblx0ICogUmVhZHMgdGhlIGFnZW50J3MgbGVnYWN5IHBlZXItY2hhdCBjYXRhbG9nIChgY29waWxvdC5jaGF0c2ApIGZvciBhXG5cdCAqIHNlc3Npb24uIEVhY2ggZW50cnkgbWFwcyBhIGNoYXRJZCAodGhlIGBhaHAtY2hhdGAgYXV0aG9yaXR5KSB0byB0aGUgU0RLXG5cdCAqIGNoYXQgdGhhdCBiYWNrcyBpdCAoYW5kIGl0cyBvcHRpb25hbCBtb2RlbCBvdmVycmlkZSkuIFRoZSBhZ2VudFxuXHQgKiBubyBsb25nZXIgKndyaXRlcyogdGhpcyBjYXRhbG9nIFx1MjAxNCB0aGUgb3JjaGVzdHJhdG9yIG93bnMgdGhlIGR1cmFibGVcblx0ICogcGVlci1jaGF0IGNhdGFsb2cgdmlhIGBwcm92aWRlckRhdGFgIFx1MjAxNCBidXQgdGhlIHJlYWQgaXMgcmV0YWluZWQgZm9yIG9uZVxuXHQgKiByZWxlYXNlIHRvIGRyYWluIHNlc3Npb25zIHBlcnNpc3RlZCBiZWZvcmUgdGhhdCBtaWdyYXRpb24gKHNlZVxuXHQgKiB7QGxpbmsgZ2V0Q2hhdHN9IGFuZCB7QGxpbmsgbWF0ZXJpYWxpemVDaGF0fSkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFkUGVyc2lzdGVkQ2hhdHMoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBJUGVyc2lzdGVkQ2hhdD4+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcCgpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmF3ID0gYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ0hBVFMpO1xuXHRcdFx0aWYgKCFyYXcpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXAoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBJUGVyc2lzdGVkQ2hhdD4oKTtcblx0XHRcdGZvciAoY29uc3QgW2NoYXRJZCwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHBhcnNlZCkpIHtcblx0XHRcdFx0Ly8gVGhlIG1ldGFkYXRhIGJsb2IgaXMgY2xpZW50LWluZmx1ZW5jZWQgYW5kIG1heSBiZSBjb3JydXB0ZWQgb3Jcblx0XHRcdFx0Ly8gdGFtcGVyZWQ6IGRyb3AgZW50cmllcyB0aGF0IGRvbid0IGNhcnJ5IGEgdXNhYmxlIFNESyBzZXNzaW9uIGlkXG5cdFx0XHRcdC8vIHJhdGhlciB0aGFuIGxldHRpbmcgYW4gaW52YWxpZCBpZCByZWFjaCBgY2xpZW50LmRlbGV0ZVNlc3Npb25gLlxuXHRcdFx0XHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB7IHNka1Nlc3Npb25JZCwgbW9kZWwgfSA9IHZhbHVlIGFzIHsgc2RrU2Vzc2lvbklkPzogdW5rbm93bjsgbW9kZWw/OiB1bmtub3duIH07XG5cdFx0XHRcdGlmICh0eXBlb2Ygc2RrU2Vzc2lvbklkICE9PSAnc3RyaW5nJyB8fCAhc2RrU2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnNldChjaGF0SWQsIHsgc2RrU2Vzc2lvbklkLCAuLi4obW9kZWwgPyB7IG1vZGVsOiBtb2RlbCBhcyBNb2RlbFNlbGVjdGlvbiB9IDoge30pIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byByZWFkIHBlcnNpc3RlZCBjaGF0cyBmb3IgJHtzZXNzaW9uLnRvU3RyaW5nKCl9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdHJldHVybiBuZXcgTWFwKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF9zdG9yZVNlc3Npb25NZXRhZGF0YShzZXNzaW9uOiBVUkksIG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIHByb2plY3Q6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZCwgcHJvamVjdFJlc29sdmVkID0gcHJvamVjdCAhPT0gdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGJSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdGNvbnN0IGRiID0gZGJSZWYub2JqZWN0O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB3b3JrOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHR3b3JrLnB1c2goZGIuc2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX01PREVMLCB0aGlzLl9zZXJpYWxpemVNb2RlbFNlbGVjdGlvbihtb2RlbCkpKTtcblx0XHRcdH1cblx0XHRcdGlmICh3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dELCB3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkpKTtcblx0XHRcdH1cblx0XHRcdC8vIFBlcnNpc3QgdGhlIG9yZGVyZWQgc2V0IGFsb25nc2lkZSB0aGUgbGVnYWN5IHNpbmdsZSBjd2Qgc28gYVxuXHRcdFx0Ly8gbXVsdGktcm9vdCBzZXNzaW9uIHJlc3RvcmVzIGV2ZXJ5IGRpcmVjdG9yeSBvbiByZWxvYWQuIFJlYWRzIHByZWZlclxuXHRcdFx0Ly8gdGhpcyBrZXk7IGBfTUVUQV9DV0RgIHJlbWFpbnMgdGhlIGZhbGxiYWNrIGZvciBzZXNzaW9ucyBwZXJzaXN0ZWRcblx0XHRcdC8vIGJlZm9yZSB0aGlzIGtleSBleGlzdGVkLiBXcml0dGVuIHRvZ2V0aGVyIHdpdGggYF9NRVRBX0NXRGAgZnJvbSB0aGVcblx0XHRcdC8vIHNhbWUgc291cmNlIHNvIGluZGV4IDAgc3RheXMgY29uc2lzdGVudCBhY3Jvc3MgYm90aCBrZXlzLlxuXHRcdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0XHR3b3JrLnB1c2goZGIuc2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0NXRFMsIEpTT04uc3RyaW5naWZ5KHdvcmtpbmdEaXJlY3Rvcmllcy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpKSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb25EaXJlY3RvcnkpIHtcblx0XHRcdFx0d29yay5wdXNoKGRiLnNldE1ldGFkYXRhKENvcGlsb3RBZ2VudC5fTUVUQV9DVVNUT01JWkFUSU9OX0RJUkVDVE9SWSwgY3VzdG9taXphdGlvbkRpcmVjdG9yeS50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvamVjdFJlc29sdmVkKSB7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9SRVNPTFZFRCwgJ3RydWUnKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvamVjdCkge1xuXHRcdFx0XHR3b3JrLnB1c2goZGIuc2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX1BST0pFQ1RfVVJJLCBwcm9qZWN0LnVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9ESVNQTEFZX05BTUUsIHByb2plY3QuZGlzcGxheU5hbWUpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHdvcmspO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkYlJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlcyB0aGUgcGVyc2lzdGVkIG9yZGVyZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0LiBQcmVmZXJzIHRoZSBKU09OXG5cdCAqIGBfTUVUQV9DV0RTYCBhcnJheSB3aGVuIHByZXNlbnQgYW5kIHZhbGlkLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0byB0aGVcblx0ICogc2luZ2xlIGxlZ2FjeSBgX01FVEFfQ1dEYCB2YWx1ZS4gQSBtYWxmb3JtZWQgYmxvYiAodGhlIG1ldGFkYXRhIHN0b3JlIGlzXG5cdCAqIGNsaWVudC1pbmZsdWVuY2VkIGFuZCBtYXkgYmUgY29ycnVwdCkgaXMgaWdub3JlZCBpbiBmYXZvdXIgb2YgdGhlIGxlZ2FjeVxuXHQgKiBmYWxsYmFjayBzbyBpdCBjYW4gbmV2ZXIgcmVqZWN0IHRoZSBjYWxsZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9wYXJzZVdvcmtpbmdEaXJlY3RvcmllcyhyYXdTZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZmFsbGJhY2s6IFVSSSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmF3U2V0KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhd1NldCk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0XHRjb25zdCBkaXJzID0gcGFyc2VkLmZpbHRlcigoZCk6IGQgaXMgc3RyaW5nID0+IHR5cGVvZiBkID09PSAnc3RyaW5nJyAmJiBkLmxlbmd0aCA+IDApLm1hcChkID0+IFVSSS5wYXJzZShkKSk7XG5cdFx0XHRcdFx0aWYgKGRpcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRpcnM7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gTWFsZm9ybWVkIG1ldGFkYXRhIGJsb2I6IGZhbGwgdGhyb3VnaCB0byB0aGUgbGVnYWN5IGZhbGxiYWNrLlxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsbGJhY2sgPyBbZmFsbGJhY2tdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHsgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbjsgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbjsgd29ya2luZ0RpcmVjdG9yeT86IFVSSTsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107IGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk/OiBVUkk7IHdvcmtzcGFjZWxlc3M/OiBib29sZWFuIH0+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBbbW9kZWwsIGFnZW50LCBjd2QsIGN3ZHMsIGN1c3RvbWl6YXRpb25EaXJlY3RvcnksIHdvcmtzcGFjZWxlc3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKENvcGlsb3RBZ2VudC5fTUVUQV9NT0RFTCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0FHRU5UKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEUyksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0NVU1RPTUlaQVRJT05fRElSRUNUT1JZKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGN3ZCA/IFVSSS5wYXJzZShjd2QpIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bW9kZWw6IHRoaXMuX3BhcnNlTW9kZWxTZWxlY3Rpb24obW9kZWwpLFxuXHRcdFx0XHRhZ2VudDogdGhpcy5fcGFyc2VBZ2VudFNlbGVjdGlvbihhZ2VudCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy5fcGFyc2VXb3JraW5nRGlyZWN0b3JpZXMoY3dkcywgd29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IGN1c3RvbWl6YXRpb25EaXJlY3RvcnkgPyBVUkkucGFyc2UoY3VzdG9taXphdGlvbkRpcmVjdG9yeSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdvcmtzcGFjZWxlc3M6IHdvcmtzcGFjZWxlc3MgPT09ICd0cnVlJyxcblx0XHRcdH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFN0b3JlZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHsgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbjsgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbjsgd29ya2luZ0RpcmVjdG9yeT86IFVSSTsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107IGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk/OiBVUkk7IHByb2plY3Q/OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm87IHJlc29sdmVkOiBib29sZWFuOyB3b3Jrc3BhY2VsZXNzPzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFttb2RlbCwgYWdlbnQsIGN3ZCwgY3dkcywgY3VzdG9taXphdGlvbkRpcmVjdG9yeSwgcmVzb2x2ZWQsIHVyaSwgZGlzcGxheU5hbWUsIHdvcmtzcGFjZWxlc3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKENvcGlsb3RBZ2VudC5fTUVUQV9NT0RFTCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0FHRU5UKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEUyksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0NVU1RPTUlaQVRJT05fRElSRUNUT1JZKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9SRVNPTFZFRCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX1BST0pFQ1RfVVJJKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9ESVNQTEFZX05BTUUpLFxuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKEFIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVkpLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gY3dkID8gVVJJLnBhcnNlKGN3ZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcm9qZWN0ID0gdXJpICYmIGRpc3BsYXlOYW1lID8geyB1cmk6IFVSSS5wYXJzZSh1cmkpLCBkaXNwbGF5TmFtZSB9IDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bW9kZWw6IHRoaXMuX3BhcnNlTW9kZWxTZWxlY3Rpb24obW9kZWwpLFxuXHRcdFx0XHRhZ2VudDogdGhpcy5fcGFyc2VBZ2VudFNlbGVjdGlvbihhZ2VudCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy5fcGFyc2VXb3JraW5nRGlyZWN0b3JpZXMoY3dkcywgd29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IGN1c3RvbWl6YXRpb25EaXJlY3RvcnkgPyBVUkkucGFyc2UoY3VzdG9taXphdGlvbkRpcmVjdG9yeSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb2plY3QsXG5cdFx0XHRcdHJlc29sdmVkOiByZXNvbHZlZCA9PT0gJ3RydWUnIHx8IHByb2plY3QgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0d29ya3NwYWNlbGVzczogd29ya3NwYWNlbGVzcyA9PT0gJ3RydWUnLFxuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdHMgKG9yIGNsZWFycykgdGhlIHNlbGVjdGVkIGN1c3RvbSBhZ2VudCBmb3IgYSBzZXNzaW9uLiBXcml0aW5nXG5cdCAqIGB1bmRlZmluZWRgIGNsZWFycyB0aGUgc3RvcmVkIHNlbGVjdGlvbiBieSB3cml0aW5nIGFuIGVtcHR5IHN0cmluZyxcblx0ICogd2hpY2ggbGF0ZXIgY29sZCByZWFkcyB0cmVhdCBhcyBcIm5vIGN1c3RvbSBhZ2VudFwiIGJlY2F1c2Vcblx0ICogYF9wYXJzZUFnZW50U2VsZWN0aW9uYCBzaG9ydC1jaXJjdWl0cyBvbiBmYWxzeSBtZXRhZGF0YSB2YWx1ZXMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zdG9yZVNlc3Npb25BZ2VudE1ldGFkYXRhKHNlc3Npb246IFVSSSwgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGJSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBXcml0aW5nIGFuIGVtcHR5IHN0cmluZyBpcyB0cmVhdGVkIGFzIFwibm8gc2VsZWN0aW9uXCIgYnlcblx0XHRcdC8vIGBfcGFyc2VBZ2VudFNlbGVjdGlvbmAgKGl0IHNob3J0LWNpcmN1aXRzIG9uIGEgZmFsc3kgcmF3IHZhbHVlKSxcblx0XHRcdC8vIHNvIHRoaXMgaXMgdGhlIGNsZWFyIHBhdGggd2hpbGUgYHNldE1ldGFkYXRhYCBsYWNrcyBhIGRlbGV0ZS5cblx0XHRcdGF3YWl0IGRiUmVmLm9iamVjdC5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQUdFTlQsIGFnZW50ID8gdGhpcy5fc2VyaWFsaXplQWdlbnRTZWxlY3Rpb24oYWdlbnQpIDogJycpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkYlJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RvcmVTZXNzaW9uUHJvamVjdFJlc29sdXRpb24oc2Vzc2lvbjogVVJJLCBwcm9qZWN0OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25NZXRhZGF0YShzZXNzaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHByb2plY3QsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlc3Npb25Qcm9qZWN0KGNvbnRleHQ6IElDb3BpbG90U2Vzc2lvbkNvbnRleHQgfCB1bmRlZmluZWQsIGxpbWl0ZXI6IExpbWl0ZXI8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPiwgcHJvamVjdEJ5Q29udGV4dDogTWFwPHN0cmluZywgUHJvbWlzZTxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+Pik6IFByb21pc2U8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fcHJvamVjdENvbnRleHRLZXkoY29udGV4dCk7XG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRsZXQgcHJvamVjdCA9IHByb2plY3RCeUNvbnRleHQuZ2V0KGtleSk7XG5cdFx0aWYgKCFwcm9qZWN0KSB7XG5cdFx0XHRwcm9qZWN0ID0gbGltaXRlci5xdWV1ZSgoKSA9PiBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0KGNvbnRleHQsIHRoaXMuX2dpdFNlcnZpY2UpKTtcblx0XHRcdHByb2plY3RCeUNvbnRleHQuc2V0KGtleSwgcHJvamVjdCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9qZWN0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvamVjdENvbnRleHRLZXkoY29udGV4dDogSUNvcGlsb3RTZXNzaW9uQ29udGV4dCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGNvbnRleHQ/LmN3ZCkge1xuXHRcdFx0cmV0dXJuIGBjd2Q6JHtjb250ZXh0LmN3ZH1gO1xuXHRcdH1cblx0XHRpZiAoY29udGV4dD8uZ2l0Um9vdCkge1xuXHRcdFx0cmV0dXJuIGBnaXRSb290OiR7Y29udGV4dC5naXRSb290fWA7XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0Py5yZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm4gYHJlcG9zaXRvcnk6JHtjb250ZXh0LnJlcG9zaXRvcnl9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBhYyBvZiB0aGlzLl9hY3RpdmVDbGllbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRhYy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudHMuY2xlYXIoKTtcblx0XHR0aGlzLnNodXRkb3duKCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NvcGlsb3RdIFNodXRkb3duIGZhaWxlZCBkdXJpbmcgZGlzcG9zZScsIGVycik7XG5cdFx0fSkuZmluYWxseSgoKSA9PiBzdXBlci5kaXNwb3NlKCkpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJUmVzb2x2ZWRDdXN0b21pemF0aW9uIHtcblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbjtcblx0cmVhZG9ubHkgcGx1Z2luRGlyPzogVVJJO1xuXHRyZWFkb25seSBwbHVnaW4/OiBJUGFyc2VkUGx1Z2luO1xuXHQvKipcblx0ICogVGhlIG9yaWdpbmFsIGNsaWVudC1wdWJsaXNoZWQgaW5wdXQuIFJldGFpbmVkIHNvIGEgbGF0ZXJcblx0ICoge0BsaW5rIFNlc3Npb25QbHVnaW5Db250cm9sbGVyLnJldHJ5RmFpbGVkQ2xpZW50U3luY0lmTmVlZGVkfSBjYW5cblx0ICogcmUtaXNzdWUgdGhlIHN5bmMgd2l0aG91dCBuZWVkaW5nIHRoZSBjYWxsZXIgdG8gcmUtc3VwcGx5IGl0IChpblxuXHQgKiBwYXJ0aWN1bGFyLCB0aGUgb3BhcXVlIGBub25jZWAgaXMgcHJlc2VydmVkKS5cblx0ICovXG5cdHJlYWRvbmx5IGlucHV0PzogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbjtcbn1cblxuZXhwb3J0IGNvbnN0IFJFRlJFU0hfREVCT1VOQ0VfTVMgPSAxMDA7XG5cbi8qKlxuICogQSBwZXItd29ya2luZy1kaXJlY3RvcnkgYnVuZGxlIG9mIGN1c3RvbWl6YXRpb25zIHRoZSBhZ2VudCBob3N0XG4gKiBkaXNjb3ZlcmVkIGl0c2VsZiBmcm9tIGRpc2sgKHdvcmtzcGFjZSArIHVzZXItaG9tZSBjb252ZW50aW9ucykuXG4gKlxuICogT3ducyBhIHtAbGluayBTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeX0gKGZpbGVzeXN0ZW0gc2NhbiArXG4gKiB3YXRjaGVycykgYW5kIG1hcHMgZGlzY292ZXJlZCBmaWxlcyBpbnRvIGFuIGluLW1lbW9yeVxuICoge0BsaW5rIElQYXJzZWRQbHVnaW59IHdoaWxlIHByZXNlcnZpbmcgb3JpZ2luYWwgZmlsZSBVUklzLlxuICpcbiAqIFJlZnJlc2hlcyBpdHNlbGYgd2hlbiB0aGUgZGlzY292ZXJ5IGZpcmVzIGBvbkRpZENoYW5nZWAuIFRoZSBvd25pbmdcbiAqIHtAbGluayBQbHVnaW5Db250cm9sbGVyfSBpcyBub3RpZmllZCB2aWEgdGhlIHN1cHBsaWVkIGBvbkRpZFJlZnJlc2hgXG4gKiBjYWxsYmFjayBzbyBpdCBjYW4gcmUtZmlyZSBpdHMgb3duIGNoYW5nZSBldmVudCBhbmQgKGluZGlyZWN0bHkpIGNhdXNlXG4gKiBzZXNzaW9ucyB0byBwaWNrIHVwIHRoZSBuZXcgYnVuZGxlIHRocm91Z2ggdGhlIGV4aXN0aW5nXG4gKiBgaXNPdXRkYXRlZGAgc25hcHNob3QgcGF0aC5cbiAqL1xuY2xhc3MgU2Vzc2lvbkRpc2NvdmVyZWRFbnRyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzY292ZXJ5OiBTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVmcmVzaERlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPihSRUZSRVNIX0RFQk9VTkNFX01TKSk7XG5cdHByaXZhdGUgX3JlZnJlc2hQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9wZW5kaW5nUmVmcmVzaE5vdGlmeSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2N1c3RvbWl6YXRpb25zOiByZWFkb25seSBEaXJlY3RvcnlDdXN0b21pemF0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBfZGlyZWN0b3JpZXM6IHJlYWRvbmx5IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NldHRsZWQ6IFByb21pc2U8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSxcblx0XHR1c2VySG9tZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldENsaWVudDogKCkgPT4gUHJvbWlzZTxDb3BpbG90Q2xpZW50Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlZnJlc2g6ICgpID0+IHZvaWQsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kaXNjb3ZlcnkgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgd29ya2luZ0RpcmVjdG9yaWVzLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHR0aGlzLl9zZXR0bGVkID0gdGhpcy5fcXVldWVSZWZyZXNoKGZhbHNlLCAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kaXNjb3Zlcnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2V0dGxlZCA9IHRoaXMuX3F1ZXVlUmVmcmVzaCh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3NldHRsZWQgPSB0aGlzLl9xdWV1ZVJlZnJlc2godHJ1ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZyZXNoUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fcmVmcmVzaFByb21pc2UgPSBudWxsO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHdoZW5TZXR0bGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXR0bGVkO1xuXHR9XG5cblx0Y3VycmVudEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IERpcmVjdG9yeUN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbWl6YXRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfcXVldWVSZWZyZXNoKG5vdGlmeTogYm9vbGVhbiwgZGVsYXkgPSBSRUZSRVNIX0RFQk9VTkNFX01TKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVmcmVzaFByb21pc2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3JlZnJlc2hQcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLl9wZW5kaW5nUmVmcmVzaE5vdGlmeSA9IHRoaXMuX3BlbmRpbmdSZWZyZXNoTm90aWZ5IHx8IG5vdGlmeTtcblxuXHRcdHJldHVybiB0aGlzLl9yZWZyZXNoRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZE5vdGlmeSA9IHRoaXMuX3BlbmRpbmdSZWZyZXNoTm90aWZ5O1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlZnJlc2hOb3RpZnkgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHJlZnJlc2hQcm9taXNlID0gdGhpcy5fcmVmcmVzaFByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpZFJlZnJlc2ggPSBhd2FpdCB0aGlzLl9yZWZyZXNoKHRva2VuKTtcblx0XHRcdFx0aWYgKGRpZFJlZnJlc2ggJiYgc2hvdWxkTm90aWZ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZWZyZXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gcmVmcmVzaFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9yZWZyZXNoUHJvbWlzZSA9PT0gcmVmcmVzaFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWZyZXNoUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9yZWZyZXNoUHJvbWlzZSA9PT0gcmVmcmVzaFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWZyZXNoUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH0pO1xuXHRcdH0sIGRlbGF5KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2godG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZ1NjaGVtYSwgQWdlbnRIb3N0Q29uZmlnS2V5LlNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5TW9kZSlcblx0XHRcdFx0Pz8gREVGQVVMVF9TRVNTSU9OX0NVU1RPTUlaQVRJT05fRElTQ09WRVJZX01PREU7XG5cdFx0XHRpZiAobW9kZSA9PT0gJ2Rpc2NvdmVyJykge1xuXHRcdFx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IHRoaXMuX2Rpc2NvdmVyeS5kaXNjb3Zlcihhd2FpdCB0aGlzLl9nZXRDbGllbnQoKSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXF1YWxzKHRoaXMuX2N1c3RvbWl6YXRpb25zLCBjdXN0b21pemF0aW9ucykpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9jdXN0b21pemF0aW9ucyA9IGN1c3RvbWl6YXRpb25zO1xuXHRcdFx0XHR0aGlzLl9kaXJlY3RvcmllcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRpcmVjdG9yaWVzID0gYXdhaXQgdGhpcy5fZGlzY292ZXJ5LnNjYW4odG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2RpcmVjdG9yaWVzICYmIGFyZURpc2NvdmVyZWREaXJlY3Rvcmllc0VxdWFsKHRoaXMuX2RpcmVjdG9yaWVzLCBkaXJlY3RvcmllcykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IHRvRGlzY292ZXJlZERpcmVjdG9yeUN1c3RvbWl6YXRpb25zKGRpcmVjdG9yaWVzLCB0aGlzLl9maWxlU2VydmljZSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEb24ndCB1cGRhdGUgYF9jdXN0b21pemF0aW9uc2AgLyBgX2RpcmVjdG9yaWVzYCB3aGVuIGNhbmNlbGxlZC5cblx0XHRcdC8vIE90aGVyd2lzZSBhIGNhbmNlbGxlZCByZWZyZXNoIGNvdWxkIHRlbXBvcmFyaWx5IGNsZWFyIHRoZW0gYW5kIGNhdXNlIGNhbGxlcnMgdG8gc2VlIGVtcHR5IGN1c3RvbWl6YXRpb25zLlxuXHRcdFx0dGhpcy5fY3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucztcblx0XHRcdHRoaXMuX2RpcmVjdG9yaWVzID0gZGlyZWN0b3JpZXM7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIERvbid0IHVwZGF0ZSBgX2N1c3RvbWl6YXRpb25zYCAvIGBfZGlyZWN0b3JpZXNgIHdoZW4gY2FuY2VsbGVkLlxuXHRcdFx0Ly8gT3RoZXJ3aXNlIGEgY2FuY2VsbGVkIHJlZnJlc2ggY291bGQgdGVtcG9yYXJpbHkgY2xlYXIgdGhlbSBhbmQgY2F1c2UgY2FsbGVycyB0byBzZWUgZW1wdHkgY3VzdG9taXphdGlvbnMuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDpTZXNzaW9uRGlzY292ZXJlZEVudHJ5XSBEaXNjb3ZlcnkvYnVuZGxlIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRjb25zdCBoYWRTdGF0ZSA9IHRoaXMuX2N1c3RvbWl6YXRpb25zLmxlbmd0aCA+IDAgfHwgdGhpcy5fZGlyZWN0b3JpZXMgIT09IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zID0gW107XG5cdFx0XHR0aGlzLl9kaXJlY3RvcmllcyA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBoYWRTdGF0ZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvRGlzY292ZXJlZERpcmVjdG9yeUN1c3RvbWl6YXRpb25zKGRpcmVjdG9yaWVzOiByZWFkb25seSBJRGlzY292ZXJlZERpcmVjdG9yeVtdLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxEaXJlY3RvcnlDdXN0b21pemF0aW9uW10+IHtcblx0cmV0dXJuIFByb21pc2UuYWxsKGRpcmVjdG9yaWVzLm1hcChhc3luYyBkaXJlY3RvcnkgPT4ge1xuXHRcdGNvbnN0IHByb3RvY29sVXJpID0gZGlyZWN0b3J5LnVyaS50b1N0cmluZygpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnksXG5cdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHByb3RvY29sVXJpKSxcblx0XHRcdHVyaTogcHJvdG9jb2xVcmksXG5cdFx0XHRuYW1lOiBkaXJlY3RvcnkubmFtZSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjb250ZW50czogdG9EaXJlY3RvcnlDb250ZW50c1R5cGUoZGlyZWN0b3J5LnR5cGUpLFxuXHRcdFx0d3JpdGFibGU6IGRpcmVjdG9yeS53cml0YWJsZSwgLy8gd2hldGhlciB0aGUgbmV3IGN1c3RvbWl6YXRpb24gY2FuIGJlIGNyZWF0ZWQgaW4gdGhpcyBkaXJlY3Rvcnlcblx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRjaGlsZHJlbjogYXdhaXQgUHJvbWlzZS5hbGwoZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+IHRvRGlzY292ZXJlZENoaWxkQ3VzdG9taXphdGlvbihmaWxlLnVyaSwgZGlyZWN0b3J5LnR5cGUsIGZpbGVTZXJ2aWNlKSkpLFxuXHRcdH07XG5cdH0pKTtcbn1cblxuZnVuY3Rpb24gdG9EaXJlY3RvcnlDb250ZW50c1R5cGUodHlwZTogRGlzY292ZXJlZFR5cGUpOiBDaGlsZEN1c3RvbWl6YXRpb25UeXBlIHtcblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSBEaXNjb3ZlcmVkVHlwZS5BZ2VudDpcblx0XHRcdHJldHVybiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudDtcblx0XHRjYXNlIERpc2NvdmVyZWRUeXBlLlNraWxsOlxuXHRcdFx0cmV0dXJuIEN1c3RvbWl6YXRpb25UeXBlLlNraWxsO1xuXHRcdGNhc2UgRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb246XG5cdFx0Y2FzZSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uOlxuXHRcdFx0cmV0dXJuIEN1c3RvbWl6YXRpb25UeXBlLlJ1bGU7XG5cdFx0Y2FzZSBEaXNjb3ZlcmVkVHlwZS5Ib29rOlxuXHRcdFx0cmV0dXJuIEN1c3RvbWl6YXRpb25UeXBlLkhvb2s7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdG9EaXNjb3ZlcmVkQ2hpbGRDdXN0b21pemF0aW9uKGZpbGU6IFVSSSwgdHlwZTogRGlzY292ZXJlZFR5cGUsIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPENoaWxkQ3VzdG9taXphdGlvbj4ge1xuXHRjb25zdCB1cmkgPSBmaWxlLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGlkID0gY3VzdG9taXphdGlvbklkKHVyaSk7XG5cdGlmICh0eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudCkge1xuXHRcdGNvbnN0IGFnZW50SW5mbyA9IGF3YWl0IHBhcnNlQWdlbnRGaWxlKGZpbGUsIGZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBhZ2VudEN1c3RvbWl6YXRpb246IEFnZW50Q3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdFx0aWQsXG5cdFx0XHR1cmksXG5cdFx0XHRuYW1lOiBhZ2VudEluZm8ubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudEluZm8uZGVzY3JpcHRpb24sXG5cdFx0fSBzYXRpc2ZpZXMgQWdlbnRDdXN0b21pemF0aW9uO1xuXHRcdGlmIChhZ2VudEluZm8udXNlckludm9jYWJsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhZ2VudEN1c3RvbWl6YXRpb24uX21ldGEgPSB7IHVzZXJJbnZvY2FibGU6IGFnZW50SW5mby51c2VySW52b2NhYmxlIH07XG5cdFx0fVxuXHRcdHJldHVybiBhZ2VudEN1c3RvbWl6YXRpb247XG5cdH1cblx0aWYgKHR5cGUgPT09IERpc2NvdmVyZWRUeXBlLlNraWxsKSB7XG5cdFx0Y29uc3Qgc2tpbGxJbmZvID0gYXdhaXQgcGFyc2VTa2lsbEZpbGUoZmlsZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHNraWxsQ3VzdG9taXphdGlvbjogU2tpbGxDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsXG5cdFx0XHRpZCxcblx0XHRcdHVyaSxcblx0XHRcdG5hbWU6IHNraWxsSW5mby5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHNraWxsSW5mby5kZXNjcmlwdGlvbixcblx0XHR9O1xuXHRcdHJldHVybiBza2lsbEN1c3RvbWl6YXRpb247XG5cdH1cblx0aWYgKHR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uKSB7XG5cdFx0Y29uc3QgcnVsZUluZm8gPSBhd2FpdCBwYXJzZVJ1bGVGaWxlKGZpbGUsIGZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBydWxlQ3VzdG9taXphdGlvbjogUnVsZUN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5SdWxlLFxuXHRcdFx0aWQsXG5cdFx0XHR1cmksXG5cdFx0XHRuYW1lOiBydWxlSW5mby5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHJ1bGVJbmZvLmRlc2NyaXB0aW9uLFxuXHRcdFx0Z2xvYnM6IHJ1bGVJbmZvLmdsb2JzLFxuXHRcdFx0YWx3YXlzQXBwbHk6IHJ1bGVJbmZvLmFsd2F5c0FwcGx5LFxuXHRcdH07XG5cdFx0cmV0dXJuIHJ1bGVDdXN0b21pemF0aW9uO1xuXHR9XG5cdGlmICh0eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKSB7XG5cdFx0Y29uc3QgaG9va0N1c3RvbWl6YXRpb246IEhvb2tDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuSG9vayxcblx0XHRcdGlkLFxuXHRcdFx0dXJpLFxuXHRcdFx0bmFtZTogcmVzb3VyY2VCYXNlbmFtZShmaWxlKSxcblx0XHR9O1xuXHRcdHJldHVybiBob29rQ3VzdG9taXphdGlvbjtcblx0fVxuXHQvLyBhZ2VudCBpbnN0cnVjdGlvblxuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUsXG5cdFx0YWx3YXlzQXBwbHk6IHRydWUsXG5cdFx0aWQsXG5cdFx0dXJpLFxuXHRcdG5hbWU6IHJlc291cmNlQmFzZW5hbWUoZmlsZSksXG5cdH07XG59XG5cblxuLyoqXG4gKiBQcm9qZWN0cyBhbHJlYWR5LXBhcnNlZCBkaXNjb3ZlcmVkIGN1c3RvbWl6YXRpb25zIGludG8gYW4gaW4tbWVtb3J5XG4gKiB7QGxpbmsgSVBhcnNlZFBsdWdpbn0gd2hpbGUgcHJlc2VydmluZyBvcmlnaW5hbCBzb3VyY2UgVVJJcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcFRvUGFyc2VkUGx1Z2luKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBEaXJlY3RvcnlDdXN0b21pemF0aW9uW10pOiBJUGFyc2VkUGx1Z2luIHwgdW5kZWZpbmVkIHtcblx0aWYgKGN1c3RvbWl6YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBhZ2VudHM6IElQYXJzZWRBZ2VudFtdID0gW107XG5cdGNvbnN0IHNraWxsczogSVBhcnNlZFNraWxsW10gPSBbXTtcblx0Y29uc3QgaW5zdHJ1Y3Rpb25zOiBJUGFyc2VkUnVsZVtdID0gW107XG5cblx0Zm9yIChjb25zdCBkaXJlY3Rvcnkgb2YgY3VzdG9taXphdGlvbnMpIHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGRpcmVjdG9yeS5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0aWYgKGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50KSB7XG5cdFx0XHRcdGFnZW50cy5wdXNoKHtcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjaGlsZC51cmkpLFxuXHRcdFx0XHRcdG5hbWU6IGNoaWxkLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGNoaWxkLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IGNoaWxkLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCkge1xuXHRcdFx0XHRza2lsbHMucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoY2hpbGQudXJpKSxcblx0XHRcdFx0XHRuYW1lOiBjaGlsZC5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBjaGlsZC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uOiBjaGlsZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hpbGQudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUnVsZSkge1xuXHRcdFx0XHRpZiAoY2hpbGQuYWx3YXlzQXBwbHkgJiYgY2hpbGQubmFtZS5tYXRjaCgvXFwubWQkL2kpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIGFnZW50IGluc3RydWN0aW9uXG5cdFx0XHRcdH1cblx0XHRcdFx0aW5zdHJ1Y3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKGNoaWxkLnVyaSksXG5cdFx0XHRcdFx0bmFtZTogY2hpbGQubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY2hpbGQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbjogY2hpbGQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChhZ2VudHMubGVuZ3RoID09PSAwICYmIHNraWxscy5sZW5ndGggPT09IDAgJiYgaW5zdHJ1Y3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0aG9va3M6IFtdLFxuXHRcdG1jcFNlcnZlcnM6IFtdLFxuXHRcdHNraWxsczogc2tpbGxzLFxuXHRcdGFnZW50czogYWdlbnRzLFxuXHRcdGluc3RydWN0aW9uczogaW5zdHJ1Y3Rpb25zLFxuXHR9O1xufVxuXG4vKipcbiAqIFByb2Nlc3Mtd2lkZSBwbHVnaW4gc3RhdGUgc2hhcmVkIGFjcm9zcyBhbGwgc2Vzc2lvbnMuXG4gKlxuICogT3duczpcbiAqICAtIGhvc3QtY29uZmlndXJlZCBjdXN0b21pemF0aW9ucyAocmVhZCBmcm9tIHJvb3QgY29uZmlnLCB3YXRjaGVkLCBwYXJzZWQpXG4gKiAgLSB0aGUge0BsaW5rIElBZ2VudFBsdWdpbk1hbmFnZXJ9IHRoYXQgbWF0ZXJpYWxpemVzIHBsdWdpbiBzb3VyY2UgVVJJc1xuICogICAgaW50byBhIG5vbmNlLWRlZHVwZWQgb24tZGlzayBjYWNoZSAob25lIHNoYXJlZCBkaXJlY3RvcnkgZm9yIGFsbFxuICogICAgc2Vzc2lvbnMgYW5kIGNsaWVudHMpXG4gKiAgLSBwYXJzaW5nICsgcmVzb2x1dGlvbiBoZWxwZXJzIHVzZWQgYnkgYm90aCBob3N0LSBhbmQgY2xpZW50LXNpZGVcbiAqICAgIGN1c3RvbWl6YXRpb25zXG4gKlxuICogUGVyLXNlc3Npb24gc3RhdGUgKGNsaWVudC1wdWJsaXNoZWQgY3VzdG9taXphdGlvbnMgYW5kIG9uLWRpc2tcbiAqIGN1c3RvbWl6YXRpb24gZGlzY292ZXJ5IGZvciB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5KSBsaXZlcyBvbiB7QGxpbmsgU2Vzc2lvblBsdWdpbkNvbnRyb2xsZXJ9LFxuICogb25lIHBlciB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbn0uIEVhY2ggc2Vzc2lvbiBjb250cm9sbGVyIGhvbGRzXG4gKiBhIHJlZmVyZW5jZSBiYWNrIHRvIHRoaXMgc2hhcmVkIGNvbnRyb2xsZXIgZm9yIHRoZSByZXNvbHZlL3N5bmNcbiAqIGhlbHBlcnMgaXQgbmVlZHMuXG4gKi9cbmNsYXNzIFBsdWdpbkNvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0LyoqIEZpcmVzIHdoZW4gaG9zdCBjdXN0b21pemF0aW9ucyBjaGFuZ2UuIFNlc3Npb24gY29udHJvbGxlcnMgZm9yd2FyZCB0aGlzLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2hvc3RDdXN0b21pemF0aW9uczogcmVhZG9ubHkgSVJlc29sdmVkQ3VzdG9taXphdGlvbltdID0gW107XG5cdHByaXZhdGUgX2hvc3RTeW5jOiBQcm9taXNlPHJlYWRvbmx5IElSZXNvbHZlZEN1c3RvbWl6YXRpb25bXT4gPSBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRwcml2YXRlIF9ob3N0UmV2aXNpb24gPSAwO1xuXHRwcml2YXRlIF9sYXN0QXBwbGllZFJlZnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldENsaWVudDogKCkgPT4gUHJvbWlzZTxDb3BpbG90Q2xpZW50Pixcblx0XHRASUFnZW50UGx1Z2luTWFuYWdlciBwdWJsaWMgcmVhZG9ubHkgcGx1Z2luTWFuYWdlcjogSUFnZW50UGx1Z2luTWFuYWdlcixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFNlZWQgZnJvbSBjdXJyZW50IHJvb3QgY29uZmlnIGFuZCBzdWJzY3JpYmUgdG8gZnV0dXJlIGNoYW5nZXMuXG5cdFx0dGhpcy5fYXBwbHlIb3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZFJvb3RDb25maWdDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYXBwbHlIb3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29uZmlndXJlZEhvc3RDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMubWFwKGl0ZW0gPT4gaXRlbS5jdXN0b21pemF0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29uZmlndXJhdGlvblNlcnZpY2UoKTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTbmFwc2hvdCB0aGUgcmVzb2x2ZWQgaG9zdCBjdXN0b21pemF0aW9ucyAobG9hZGluZyBvciBsb2FkZWQpLiBVc2VkIGJ5XG5cdCAqIHtAbGluayBTZXNzaW9uUGx1Z2luQ29udHJvbGxlcn0gdG8gY29tcG9zZSBpdHMgcGVyLXNlc3Npb24gdmlldy5cblx0ICovXG5cdHB1YmxpYyBob3N0Q3VzdG9taXphdGlvbnMoKTogcmVhZG9ubHkgSVJlc29sdmVkQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zO1xuXHR9XG5cblx0LyoqIEluLWZsaWdodCBob3N0IHN5bmM7IGF3YWl0ZWQgYnkgYGdldEN1c3RvbWl6YXRpb25zU2V0dGxlZGAgY29uc3VtZXJzLiAqL1xuXHRwdWJsaWMgaG9zdFN5bmMoKTogUHJvbWlzZTxyZWFkb25seSBJUmVzb2x2ZWRDdXN0b21pemF0aW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdFN5bmM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VXNlckhvbWUoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldENsaWVudCgpOiBQcm9taXNlPENvcGlsb3RDbGllbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q2xpZW50KCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29uc3RydWN0IGEgcGVyLXNlc3Npb24gY29udHJvbGxlciBib3VuZCB0byB0aGUgZ2l2ZW4gY3VzdG9taXphdGlvblxuXHQgKiBkaXJlY3RvcnkuIFRoZSByZXR1cm5lZCBjb250cm9sbGVyIGlzIGEge0BsaW5rIERpc3Bvc2FibGV9IG93bmVkIGJ5XG5cdCAqIHRoZSBjYWxsZXI7IGRpc3Bvc2luZyBpdCByZWxlYXNlcyB0aGUgc2Vzc2lvbidzIGRpc2stZGlzY292ZXJ5XG5cdCAqIHdhdGNoZXJzIGFuZCBkZXRhY2hlcyBmcm9tIHRoaXMgY29udHJvbGxlcidzIGNoYW5nZSBldmVudC5cblx0ICovXG5cdHB1YmxpYyBjcmVhdGVTZXNzaW9uQ29udHJvbGxlcihzZXNzaW9uOiBVUkksIGRpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogU2Vzc2lvblBsdWdpbkNvbnRyb2xsZXIge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGx1Z2luQ29udHJvbGxlciwgdGhpcywgc2Vzc2lvbiwgZGlyZWN0b3J5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgY3VycmVudCBob3N0IGN1c3RvbWl6YXRpb25zIGZyb20gdGhlIHJvb3QgY29uZmlnIGFuZFxuXHQgKiByZXNvbHZlcyB0aGVtLiBTa2lwcyB0aGUgdXBkYXRlIHdoZW4gdGhlIGNvbmZpZ3VyZWQgcmVmcyBoYXZlIG5vdFxuXHQgKiBjaGFuZ2VkIHNpbmNlIHRoZSBsYXN0IGFwcGxpY2F0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlIb3N0Q3VzdG9taXphdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShhZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnU2NoZW1hLCBBZ2VudEhvc3RDb25maWdLZXkuQ3VzdG9taXphdGlvbnMpID8/IFtdO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gZW50cmllcy5tYXAodG9Db250YWluZXJDdXN0b21pemF0aW9uKTtcblx0XHRpZiAoZXF1YWxzKGN1c3RvbWl6YXRpb25zLCB0aGlzLl9sYXN0QXBwbGllZFJlZnMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RBcHBsaWVkUmVmcyA9IGN1c3RvbWl6YXRpb25zO1xuXG5cdFx0Y29uc3QgcmV2aXNpb24gPSArK3RoaXMuX2hvc3RSZXZpc2lvbjtcblx0XHR0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucy5tYXAoY3VzdG9taXphdGlvbiA9PiAoe1xuXHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHQuLi5jdXN0b21pemF0aW9uLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRpbmcgfSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR0aGlzLl9ob3N0U3luYyA9IFByb21pc2UuYWxsKGN1c3RvbWl6YXRpb25zLm1hcChjdXN0b21pemF0aW9uID0+IHRoaXMucmVzb2x2ZUNvbmZpZ3VyZWRDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb24pKSkudGhlbihyZXNvbHZlZCA9PiB7XG5cdFx0XHRpZiAocmV2aXNpb24gPT09IHRoaXMuX2hvc3RSZXZpc2lvbikge1xuXHRcdFx0XHR0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMgPSByZXNvbHZlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmIChyZXZpc2lvbiA9PT0gdGhpcy5faG9zdFJldmlzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlQ29uZmlndXJlZEN1c3RvbWl6YXRpb24oY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbik6IFByb21pc2U8SVJlc29sdmVkQ3VzdG9taXphdGlvbj4ge1xuXHRcdGNvbnN0IHBsdWdpbkRpciA9IFVSSS5wYXJzZShjdXN0b21pemF0aW9uLnVyaSk7XG5cdFx0Y29uc3QgcGFyc2VkID0gYXdhaXQgdGhpcy50cnlQYXJzZVBsdWdpbihwbHVnaW5EaXIpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdFx0Li4uY3VzdG9taXphdGlvbixcblx0XHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkVycm9yLCBtZXNzYWdlOiBsb2NhbGl6ZSgnY29waWxvdEFnZW50LnBsdWdpblBhcnNlRXJyb3InLCBcIkVycm9yIHBhcnNpbmcgcGx1Z2luLlwiKSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHQuLi5jdXN0b21pemF0aW9uLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbjogdG9DaGlsZEN1c3RvbWl6YXRpb25zKFtwYXJzZWRdKSxcblx0XHRcdH0sXG5cdFx0XHRwbHVnaW5EaXIsXG5cdFx0XHRwbHVnaW46IHBhcnNlZCxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVTeW5jZWRDdXN0b21pemF0aW9uKGl0ZW06IElTeW5jZWRDdXN0b21pemF0aW9uLCBjbGllbnRJZDogc3RyaW5nLCBpbnB1dDogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVJlc29sdmVkQ3VzdG9taXphdGlvbj4ge1xuXHRcdGNvbnN0IGJhc2VDdXN0b21pemF0aW9uOiBQbHVnaW5DdXN0b21pemF0aW9uID0geyAuLi5pdGVtLmN1c3RvbWl6YXRpb24sIGNsaWVudElkIH07XG5cdFx0aWYgKCFpdGVtLnBsdWdpbkRpcikge1xuXHRcdFx0cmV0dXJuIHsgY3VzdG9taXphdGlvbjogYmFzZUN1c3RvbWl6YXRpb24sIGlucHV0IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkID0gYXdhaXQgdGhpcy50cnlQYXJzZVBsdWdpbihpdGVtLnBsdWdpbkRpcik7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0XHQuLi5iYXNlQ3VzdG9taXphdGlvbixcblx0XHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkVycm9yLCBtZXNzYWdlOiBsb2NhbGl6ZSgnY29waWxvdEFnZW50LnBsdWdpblBhcnNlRXJyb3InLCBcIkVycm9yIHBhcnNpbmcgcGx1Z2luLlwiKSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnB1dCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0Li4uYmFzZUN1c3RvbWl6YXRpb24sXG5cdFx0XHRcdGNoaWxkcmVuOiB0b0NoaWxkQ3VzdG9taXphdGlvbnMoW3BhcnNlZF0pLFxuXHRcdFx0fSxcblx0XHRcdHBsdWdpbkRpcjogaXRlbS5wbHVnaW5EaXIsXG5cdFx0XHRwbHVnaW46IHBhcnNlZCxcblx0XHRcdGlucHV0LFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdHJ5UGFyc2VQbHVnaW4ocGx1Z2luRGlyOiBVUkkpOiBQcm9taXNlPElQYXJzZWRQbHVnaW4gfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHBhcnNlUGx1Z2luKHBsdWdpbkRpciwgdGhpcy5fZmlsZVNlcnZpY2UsIHVuZGVmaW5lZCwgdGhpcy5nZXRVc2VySG9tZSgpLCBwbHVnaW5EaXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OlBsdWdpbkNvbnRyb2xsZXJdIEVycm9yIHBhcnNpbmcgcGx1Z2luICcke3BsdWdpbkRpci50b1N0cmluZygpfSc6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBQZXItY2xpZW50IHNsaWNlIG9mIHtAbGluayBTZXNzaW9uUGx1Z2luQ29udHJvbGxlcn0gY3VzdG9taXphdGlvbiBzdGF0ZS5cbiAqIE9uZSBlbnRyeSBleGlzdHMgcGVyIGFjdGl2ZSBjbGllbnQgdGhhdCBoYXMgY29udHJpYnV0ZWQgY3VzdG9taXphdGlvbnMgdG9cbiAqIHRoZSBzZXNzaW9uLlxuICovXG5pbnRlcmZhY2UgSUNsaWVudEN1c3RvbWl6YXRpb25TdGF0ZSB7XG5cdC8qKiBNb25vdG9uaWMgcmV2aXNpb24gdXNlZCB0byBkZXRlY3QgYW5kIGlnbm9yZSBzdGFsZSBpbi1mbGlnaHQgc3luY3MgZm9yIHRoaXMgY2xpZW50LiAqL1xuXHRyZXZpc2lvbjogbnVtYmVyO1xuXHQvKiogVGhpcyBjbGllbnQncyByZXNvbHZlZCBjdXN0b21pemF0aW9ucyAoTG9hZGluZy9Mb2FkZWQvRXJyb3IgcGVyIGl0ZW0pLiAqL1xuXHRjdXN0b21pemF0aW9uczogcmVhZG9ubHkgSVJlc29sdmVkQ3VzdG9taXphdGlvbltdO1xuXHQvKiogVGhpcyBjbGllbnQncyBpbi1mbGlnaHQgKG9yIHNldHRsZWQpIHN5bmMgcHJvbWlzZS4gKi9cblx0c3luYzogUHJvbWlzZTxyZWFkb25seSBJUmVzb2x2ZWRDdXN0b21pemF0aW9uW10+O1xuXHQvKiogVGhlIHJhdyBpbnB1dHMgbGFzdCBwYXNzZWQgdG8ge0BsaW5rIFNlc3Npb25QbHVnaW5Db250cm9sbGVyLnN5bmN9IGZvciB0aGlzIGNsaWVudC4gKi9cblx0aW5wdXRzOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW107XG59XG5cbi8qKlxuICogUGVyLXNlc3Npb24gdmlldyBvdmVyIHtAbGluayBQbHVnaW5Db250cm9sbGVyfS5cbiAqXG4gKiBPd25zIHRoZSBzZXNzaW9uLXNjb3BlZCBzbGljZSBvZiBwbHVnaW4gc3RhdGUgXHUyMDE0IHB1Ymxpc2hlZCBjbGllbnRcbiAqIGN1c3RvbWl6YXRpb25zIGFuZCBvbi1kaXNrLWRpc2NvdmVyZWQgY3VzdG9taXphdGlvbnMgdW5kZXIgdGhlIHNlc3Npb24nc1xuICogY3VzdG9taXphdGlvbiBkaXJlY3RvcnkgXHUyMDE0IGFuZCBleHBvc2VzIGEge0BsaW5rIG9uRGlkUHVibGlzaH0gc3RyZWFtIG9mXG4gKiB7QGxpbmsgU2Vzc2lvbkFjdGlvbn1zIHRhcmdldGVkIGF0ICp0aGlzKiBzZXNzaW9uIChubyBjcm9zcy1zZXNzaW9uXG4gKiByb3V0aW5nKS5cbiAqXG4gKiBDcmVhdGVkIHZpYSB7QGxpbmsgUGx1Z2luQ29udHJvbGxlci5jcmVhdGVTZXNzaW9uQ29udHJvbGxlcn0uIFRoZVxuICogY2FsbGVyIG93bnMgdGhlIHJldHVybmVkIGRpc3Bvc2FibGUgYW5kIGRpc3Bvc2VzIGl0IHdoZW4gdGhlIHNlc3Npb25cbiAqIChwcm92aXNpb25hbCBvciBtYXRlcmlhbGl6ZWQpIGlzIHRvcm4gZG93bi5cbiAqL1xuY2xhc3MgU2Vzc2lvblBsdWdpbkNvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQdWJsaXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2Vzc2lvbkFjdGlvbj4oKSk7XG5cdC8qKiBQZXItc2Vzc2lvbiBhY3Rpb24gc3RyZWFtIChyZXNldCArIHBlci1pdGVtIHVwZGF0ZXMpLiAqL1xuXHRyZWFkb25seSBvbkRpZFB1Ymxpc2ggPSB0aGlzLl9vbkRpZFB1Ymxpc2guZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlvdXNEaXJlY3RvcmllczogVVJJW10gPSBbXTtcblx0cHJpdmF0ZSBfaW5kZXhlZERlc2lyZWRDdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXNpcmVkQ3VzdG9taXphdGlvbkJ5SWQgPSBuZXcgTWFwPHN0cmluZywgQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbj4oKTtcblx0LyoqXG5cdCAqIExpdmUgcnVudGltZSBzdGF0ZSAoYHN0YXRlYC9gY2hhbm5lbGApIHBlciBNQ1Agc2VydmVyIGN1c3RvbWl6YXRpb24gaWQsXG5cdCAqIGtlcHQgdXAgdG8gZGF0ZSBieSB0aGUgb3duaW5nIHNlc3Npb24gZnJvbSBpdHMgTUNQIGNvbnRyb2xsZXIuIE92ZXJsYWlkXG5cdCAqIG9udG8gcHVibGlzaGVkIGN1c3RvbWl6YXRpb25zIGJ5IHtAbGluayBfb3ZlcmxheU1jcFN0YXRlfSBzbyBhIHJlLXN5bmNcblx0ICogcHJlc2VydmVzIHRoZSBsaXZlIHN0YXRlIG9mIG90aGVyd2lzZS11bmNoYW5nZWQgTUNQIHNlcnZlcnMgaW5zdGVhZCBvZlxuXHQgKiByZXNldHRpbmcgdGhlbSB0byB0aGUgYFN0b3BwZWRgIGRlZmF1bHQgYmFrZWQgaW50b1xuXHQgKiBgbWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb25gLiBFeHBvc2VkIChub3QgaW5qZWN0ZWQpIHNvIHRoZSBzZXNzaW9uIGNhblxuXHQgKiB3cml0ZSB0byBpdCBvbmNlIGl0IGhvbGRzIHRoaXMgY29udHJvbGxlci5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBtY3BTZXJ2ZXJTdGF0ZXM6IElTZXR0YWJsZU9ic2VydmFibGU8UmVhZG9ubHlNYXA8c3RyaW5nLCBJTWNwU2VydmVyUnVudGltZVN0YXRlPj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgbmV3IE1hcCgpKTtcblx0LyoqXG5cdCAqIFBlci1jbGllbnQgY3VzdG9taXphdGlvbiBzdGF0ZSwga2V5ZWQgYnkgYGNsaWVudElkYC4gRWFjaCBhY3RpdmUgY2xpZW50XG5cdCAqIGNvbnRyaWJ1dGluZyBjdXN0b21pemF0aW9ucyB0byB0aGlzIHNlc3Npb24gaGFzIG9uZSBlbnRyeTsgdGhlIHB1Ymxpc2hlZFxuXHQgKiBjdXN0b21pemF0aW9uIGxpc3QgaXMgdGhlIHVuaW9uIGFjcm9zcyBhbGwgZW50cmllcyAoZGVkdXBsaWNhdGVkIGJ5IFVSSSxcblx0ICogZmlyc3QtaW5zZXJ0ZWQgY2xpZW50IHdpbnMpLiBJbnNlcnRpb24gb3JkZXIgaXMgcHJlc2VydmVkIHNvIHRoZSBtZXJnZWRcblx0ICogb3JkZXIgc3RheXMgc3RhYmxlIGFjcm9zcyB1cGRhdGVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2xpZW50Q3VzdG9taXphdGlvblN0YXRlPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EaXNjb3ZlcmVkOiBNdXRhYmxlRGlzcG9zYWJsZTxTZXNzaW9uRGlzY292ZXJlZEVudHJ5PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHQvKipcblx0ICogVGhlIGFkZGl0aW9uYWwgKG5vbi1wcmltYXJ5KSB3b3Jrc3BhY2Ugcm9vdHMgZm9yIGEgbXVsdGktcm9vdCBzZXNzaW9uLlxuXHQgKiBJbmRleCAwICh0aGUgcHJvY2VzcyByb290IC8gd29ya3RyZWUpIGlzIHRyYWNrZWQgc2VwYXJhdGVseSBieVxuXHQgKiB7QGxpbmsgX2RpcmVjdG9yeX07IHRoaXMgaG9sZHMgcm9vdHMgMS4uTiwgd2hpY2ggYXJlIHN0YWJsZSB3b3Jrc3BhY2Vcblx0ICogZm9sZGVycyB0aGF0IGFyZSBuZXZlciB3b3JrdHJlZS1yZW1hcHBlZC4gRW1wdHkgZm9yIHNpbmdsZS1yb290IHNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWRkaXRpb25hbERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudDogUGx1Z2luQ29udHJvbGxlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uOiBVUkksXG5cdFx0cHJpdmF0ZSBfZGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgcHJpdmF0ZSByZWFkb25seSBfc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHVibGljIGdldCBkaXJlY3RvcnkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0b3J5O1xuXHR9XG5cblx0LyoqIFRoZSBhZGRpdGlvbmFsIChub24tcHJpbWFyeSkgcm9vdHMgYXR0YWNoZWQgdG8gY3VzdG9taXphdGlvbiBkaXNjb3ZlcnkuICovXG5cdHB1YmxpYyBnZXQgYWRkaXRpb25hbERpcmVjdG9yaWVzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFuY2hvciAob3IgcmUtYW5jaG9yKSB0aGUgc2Vzc2lvbidzIGN1c3RvbWl6YXRpb24gZGlyZWN0b3J5LlxuXHQgKiBPbmx5IGV2ZXIgdHJhbnNpdGlvbnMgZnJvbSBgdW5kZWZpbmVkYCBcdTIxOTIgc2V0OyBvbmNlIGEgZGlyZWN0b3J5IGhhc1xuXHQgKiBiZWVuIGJvdW5kIHRoZSBkaXNjb3ZlcmVkIGVudHJ5IGlzIHBpbm5lZCB0byBpdCBmb3IgdGhlIHJlbWFpbmRlclxuXHQgKiBvZiB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHB1YmxpYyBzZXREaXJlY3RvcnkoZGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlyZWN0b3J5IHx8ICFkaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlyZWN0b3J5ID0gZGlyZWN0b3J5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgYWRkaXRpb25hbCAobm9uLXByaW1hcnkpIHdvcmtzcGFjZSByb290cy4gUmVjcmVhdGVzIHRoZSBkaXNjb3ZlcmVkXG5cdCAqIGVudHJ5IHdoZW4gdGhlIHNldCBhY3R1YWxseSBjaGFuZ2VzIHNvIGRpc2NvdmVyeSByZS1zY2FucyBldmVyeSByb290IFx1MjAxNFxuXHQgKiBpbXBvcnRhbnQgd2hlbiB0aGlzIGlzIHNldCBhZnRlciBhIHByaW1hcnktb25seSBlbnRyeSB3YXMgYWxyZWFkeSBjcmVhdGVkXG5cdCAqIChlLmcuIG9uIHJlc3VtZSkuIEEgbm8tb3AgZm9yIHRoZSBzaW5nbGUtcm9vdCBjYXNlIChlbXB0eSB0YWlsKS5cblx0ICovXG5cdHB1YmxpYyBzZXRBZGRpdGlvbmFsRGlyZWN0b3JpZXMoZGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FkZGl0aW9uYWxEaXJlY3Rvcmllcy5sZW5ndGggPT09IGRpcmVjdG9yaWVzLmxlbmd0aFxuXHRcdFx0JiYgdGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzLmV2ZXJ5KChkLCBpKSA9PiBpc0VxdWFsKGQsIGRpcmVjdG9yaWVzW2ldKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzID0gZGlyZWN0b3JpZXM7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc2NvdmVyZWQuY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlIHRoZSBzZXNzaW9uJ3MgY3VzdG9taXphdGlvbiBhbmNob3IgdG8gYSBuZXcgZGlyZWN0b3J5IChlLmcuIGZyb20gdGhlXG5cdCAqIHVzZXItcGlja2VkIGZvbGRlciB0byB0aGUgd29ya3RyZWUgYXQgbWF0ZXJpYWxpemF0aW9uKS4gUmVjcmVhdGVzIHRoZVxuXHQgKiBkaXNjb3ZlcmVkIGVudHJ5IHNvIGRpc2NvdmVyeS93YXRjaGVycyByZS1zY2FuIHRoZSBuZXcgZGlyZWN0b3J5LlxuXHQgKi9cblx0cHVibGljIHJlYW5jaG9yKGRpcmVjdG9yeTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RpcmVjdG9yeSAmJiBpc0VxdWFsKHRoaXMuX2RpcmVjdG9yeSwgZGlyZWN0b3J5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2RpcmVjdG9yeTtcblx0XHR0aGlzLl9kaXJlY3RvcnkgPSBkaXJlY3Rvcnk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc2NvdmVyZWQuY2xlYXIoKTtcblx0XHRpZiAocHJldmlvdXMgJiYgIXRoaXMuX3ByZXZpb3VzRGlyZWN0b3JpZXMuc29tZShjYW5kaWRhdGUgPT4gaXNFcXVhbChjYW5kaWRhdGUsIHByZXZpb3VzKSkpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzRGlyZWN0b3JpZXMucHVzaChwcmV2aW91cyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBDdXN0b21pemF0aW9uW10gPSBbXG5cdFx0XHQuLi50aGlzLl9wYXJlbnQuaG9zdEN1c3RvbWl6YXRpb25zKCkubWFwKGl0ZW0gPT4gdGhpcy5fcHJvamVjdEZvclB1Ymxpc2goaXRlbS5jdXN0b21pemF0aW9uKSksXG5cdFx0XHQuLi50aGlzLl9mbGF0dGVuQ2xpZW50Q3VzdG9taXphdGlvbnMoKS5tYXAoaXRlbSA9PiB0aGlzLl9wcm9qZWN0Rm9yUHVibGlzaChpdGVtLmN1c3RvbWl6YXRpb24pKSxcblx0XHRdO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZGlzY292ZXJlZEVudHJ5KCk7XG5cdFx0Y29uc3QgZGlzY292ZXJlZCA9IGVudHJ5Py5jdXJyZW50Q3VzdG9taXphdGlvbnMoKSA/PyBbXTtcblx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgZGlzY292ZXJlZCkge1xuXHRcdFx0cmVzdWx0LnB1c2godGhpcy5fcHJvamVjdEZvclB1Ymxpc2goY3VzdG9taXphdGlvbikpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSB1bmlvbiBvZiBldmVyeSBhY3RpdmUgY2xpZW50J3MgcmVzb2x2ZWQgY3VzdG9taXphdGlvbnMsXG5cdCAqIGRlZHVwbGljYXRlZCBieSBVUkkgd2l0aCB0aGUgZmlyc3QtaW5zZXJ0ZWQgY2xpZW50IHdpbm5pbmcuIE9yZGVyXG5cdCAqIGZvbGxvd3MgY2xpZW50IGluc2VydGlvbiBvcmRlciwgdGhlbiBwZXItY2xpZW50IG9yZGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmxhdHRlbkNsaWVudEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IElSZXNvbHZlZEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlc29sdmVkQ3VzdG9taXphdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBjbGllbnQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNsaWVudC5jdXN0b21pemF0aW9ucykge1xuXHRcdFx0XHRpZiAoc2Vlbi5oYXMoaXRlbS5jdXN0b21pemF0aW9uLnVyaSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWVuLmFkZChpdGVtLmN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogU2V0dGxlZCB2YXJpYW50IG9mIHtAbGluayBnZXRDdXN0b21pemF0aW9uc306IGF3YWl0cyB0aGUgaW4tZmxpZ2h0XG5cdCAqIGhvc3Qgc3luYywgZXZlcnkgaW4tZmxpZ2h0IGNsaWVudCBzeW5jLCBhbmQgdGhlIGRpc2NvdmVyZWQgZW50cnknc1xuXHQgKiBpbml0aWFsIHNjYW4gKyBwYXJzZSBiZWZvcmUgc25hcHNob3R0aW5nIHRoZSBsaXN0LiBDYWxsZXJzIHRoYXRcblx0ICogcHVibGlzaCBjdXN0b21pemF0aW9ucyBpbnRvIHNlc3Npb24gc3RhdGUgYXQgc2Vzc2lvbiBjcmVhdGlvbiB0aW1lXG5cdCAqIE1VU1QgdXNlIHRoaXMgXHUyMDE0IHRoZSBzeW5jaHJvbm91cyB2YXJpYW50IGNhbiByZXR1cm4gYW4gZW1wdHkgbGlzdFxuXHQgKiBmb3IgYSBicmFuZC1uZXcgd29ya2luZyBkaXJlY3RvcnkgYmVjYXVzZSB7QGxpbmsgU2Vzc2lvbkRpc2NvdmVyZWRFbnRyeX1cblx0ICoga2lja3Mgb2ZmIGl0cyBgX3JlZnJlc2goKWAgd2l0aG91dCBhbnlvbmUgYXdhaXRpbmcgaXQuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0Q3VzdG9taXphdGlvbnNTZXR0bGVkKCk6IFByb21pc2U8cmVhZG9ubHkgQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9kaXNjb3ZlcmVkRW50cnkoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl9wYXJlbnQuaG9zdFN5bmMoKS5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdDpTZXNzaW9uUGx1Z2luQ29udHJvbGxlcl0gSG9zdCBjdXN0b21pemF0aW9uIHVwZGF0ZSBmYWlsZWQnLCBlcnIpKSxcblx0XHRcdC4uLlsuLi50aGlzLl9jbGllbnRzLnZhbHVlcygpXS5tYXAoY2xpZW50ID0+IGNsaWVudC5zeW5jLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb3BpbG90OlNlc3Npb25QbHVnaW5Db250cm9sbGVyXSBDbGllbnQgY3VzdG9taXphdGlvbiBzeW5jIGZhaWxlZCcsIGVycikpKSxcblx0XHRcdGVudHJ5Py53aGVuU2V0dGxlZCgpLFxuXHRcdF0pO1xuXHRcdHJldHVybiB0aGlzLmdldEN1c3RvbWl6YXRpb25zKCk7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgcGFyc2VkIHBsdWdpbnMgY3VycmVudGx5IGVuYWJsZWQgZm9yIHRoaXMgc2Vzc2lvbiwgYXdhaXRpbmcgYW55IHBlbmRpbmcgc3luYy4gKi9cblx0cHVibGljIGFzeW5jIGdldEFwcGxpZWRQbHVnaW5zKCk6IFByb21pc2U8cmVhZG9ubHkgSUNvcGlsb3RQbHVnaW5JbmZvW10+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2Rpc2NvdmVyZWRFbnRyeSgpO1xuXHRcdGNvbnN0IFtob3N0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3BhcmVudC5ob3N0U3luYygpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NvcGlsb3Q6U2Vzc2lvblBsdWdpbkNvbnRyb2xsZXJdIEhvc3QgY3VzdG9taXphdGlvbiB1cGRhdGUgZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5ob3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHRcdH0pLFxuXHRcdFx0Li4uWy4uLnRoaXMuX2NsaWVudHMudmFsdWVzKCldLm1hcChjbGllbnQgPT4gY2xpZW50LnN5bmMuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdDpTZXNzaW9uUGx1Z2luQ29udHJvbGxlcl0gQ2xpZW50IGN1c3RvbWl6YXRpb24gc3luYyBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0XHRyZXR1cm4gY2xpZW50LmN1c3RvbWl6YXRpb25zO1xuXHRcdFx0fSkpLFxuXHRcdFx0ZW50cnk/LndoZW5TZXR0bGVkKCksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcmVkID0gZW50cnk/LmN1cnJlbnRDdXN0b21pemF0aW9ucygpID8/IFtdO1xuXHRcdGNvbnN0IHNlc3Npb25QbHVnaW4gPSBkaXNjb3ZlcmVkLnNvbWUoY3VzdG9taXphdGlvbiA9PiB0aGlzLl9pc0VuYWJsZWQoY3VzdG9taXphdGlvbikpID8gbWFwVG9QYXJzZWRQbHVnaW4oZGlzY292ZXJlZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvblBsdWdpbnM6IElQYXJzZWRQbHVnaW5bXSA9IHNlc3Npb25QbHVnaW4gPyBbc2Vzc2lvblBsdWdpbl0gOiBbXTtcblxuXHRcdHJldHVybiBbXG5cdFx0XHQuLi5ob3N0LmZpbHRlcihpdGVtID0+ICEhaXRlbS5wbHVnaW4gJiYgdGhpcy5faXNFbmFibGVkKGl0ZW0uY3VzdG9taXphdGlvbikpXG5cdFx0XHRcdC5tYXAoaXRlbSA9PiAoeyAuLi5pdGVtLnBsdWdpbiEsIHBsdWdpbkRpcjogaXRlbS5wbHVnaW5EaXIgfSkpLFxuXHRcdFx0Li4udGhpcy5fZmxhdHRlbkNsaWVudEN1c3RvbWl6YXRpb25zKCkuZmlsdGVyKGl0ZW0gPT4gISFpdGVtLnBsdWdpbiAmJiB0aGlzLl9pc0VuYWJsZWQoaXRlbS5jdXN0b21pemF0aW9uKSlcblx0XHRcdFx0Lm1hcChpdGVtID0+ICh7IC4uLml0ZW0ucGx1Z2luISwgcGx1Z2luRGlyOiBpdGVtLnBsdWdpbkRpciB9KSksXG5cdFx0XHQuLi5zZXNzaW9uUGx1Z2lucyxcblx0XHRdO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN5bmMgdGhlIHB1Ymxpc2hlZCBjdXN0b21pemF0aW9ucyBmb3IgYSBzaW5nbGUgY2xpZW50IG9mIHRoaXMgc2Vzc2lvbixcblx0ICoga2V5ZWQgYnkgYGNsaWVudElkYC4gUmVwbGFjZXMgb25seSB0aGF0IGNsaWVudCdzIHNsaWNlOyBvdGhlciBjbGllbnRzJ1xuXHQgKiBjdXN0b21pemF0aW9ucyBhcmUgdW50b3VjaGVkLiBUaGUgcHVibGlzaGVkIHNlc3Npb24tc3RhdGUgbGlzdCBpcyB0aGVcblx0ICogdW5pb24gYWNyb3NzIGFsbCBjbGllbnRzLlxuXHQgKlxuXHQgKiBAcGFyYW0gcXVpZXQgd2hlbiBgdHJ1ZWAsIHN1cHByZXNzIHtAbGluayBvbkRpZFB1Ymxpc2h9IGV2ZW50cyBmb3Jcblx0ICogICB0aGlzIHN5bmMuIFVzZWQgZHVyaW5nIGVhZ2VyLWNyZWF0ZSBwYXRocyB3aGVyZSB0aGVyZSBpcyBub1xuXHQgKiAgIHNlc3Npb24gbGlzdGVuZXIgeWV0OyB0aGUgc2Vzc2lvbi1zdGF0ZSBzbmFwc2hvdCBwaWNrcyB1cCB0aGVcblx0ICogICBmaW5hbCB2aWV3IGRpcmVjdGx5IHdoZW4gdGhlIHNlc3Npb24gbWF0ZXJpYWxpemVzLlxuXHQgKi9cblx0cHVibGljIHN5bmMoY2xpZW50SWQ6IHN0cmluZywgY3VzdG9taXphdGlvbnM6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSwgb3B0aW9ucz86IHsgcXVpZXQ/OiBib29sZWFuIH0pIHtcblx0XHRjb25zdCBxdWlldCA9IG9wdGlvbnM/LnF1aWV0ID09PSB0cnVlO1xuXHRcdGxldCBjbGllbnQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFjbGllbnQpIHtcblx0XHRcdGNsaWVudCA9IHsgcmV2aXNpb246IDAsIGN1c3RvbWl6YXRpb25zOiBbXSwgc3luYzogUHJvbWlzZS5yZXNvbHZlKFtdKSwgaW5wdXRzOiBbXSB9O1xuXHRcdFx0dGhpcy5fY2xpZW50cy5zZXQoY2xpZW50SWQsIGNsaWVudCk7XG5cdFx0fSBlbHNlIGlmIChlcXVhbHMoY2xpZW50LmlucHV0cywgY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHQvLyBOby1vcCByZS1zeW5jOiBhIHdpbmRvdyByZS1zdWJzY3JpYmluZyAoZS5nLiBuYXZpZ2F0aW5nIGF3YXkgZnJvbVxuXHRcdFx0Ly8gYW5kIGJhY2sgdG8gYSBzZXNzaW9uKSByZS1wdWJsaXNoZXMgdGhlIHNhbWUgY3VzdG9taXphdGlvbnMuIFNraXBcblx0XHRcdC8vIHRoZSByZXZpc2lvbiBidW1wLCB0aGUgYFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRgIGVtaXQsIGFuZCB0aGVcblx0XHRcdC8vIHJlZHVuZGFudCBwbHVnaW4tbWFuYWdlciByZS1zeW5jICh3aGljaCBvdGhlcndpc2UgcmUtcGFyc2VzIHBsdWdpbnNcblx0XHRcdC8vIGZyb20gZGlzayBvbiBldmVyeSBuYXZpZ2F0aW9uKS4gR2VudWluZSBjaGFuZ2VzIHN0aWxsIHB1Ymxpc2gsIGFuZFxuXHRcdFx0Ly8gYF9wcm9qZWN0Rm9yUHVibGlzaGAga2VlcHMgbGl2ZSBNQ1Agc3RhdGUgaW50YWN0IGFjcm9zcyB0aG9zZS5cblx0XHRcdHJldHVybiBjbGllbnQuc3luYy50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB0aGlzLl9wcm9qZWN0Rm9yUHVibGlzaChpdGVtLmN1c3RvbWl6YXRpb24pLFxuXHRcdFx0XHQuLi4oaXRlbS5wbHVnaW5EaXIgPyB7IHBsdWdpbkRpcjogaXRlbS5wbHVnaW5EaXIgfSA6IHt9KSxcblx0XHRcdH0pKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJldmlzaW9uID0gKytjbGllbnQucmV2aXNpb247XG5cdFx0Y2xpZW50LmlucHV0cyA9IGN1c3RvbWl6YXRpb25zO1xuXHRcdGNsaWVudC5jdXN0b21pemF0aW9ucyA9IGN1c3RvbWl6YXRpb25zLm1hcChjdXN0b21pemF0aW9uID0+ICh7XG5cdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdC4uLmN1c3RvbWl6YXRpb24sXG5cdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRpbmcgfSxcblx0XHRcdH0sXG5cdFx0XHRpbnB1dDogY3VzdG9taXphdGlvbixcblx0XHR9KSk7XG5cdFx0aWYgKCFxdWlldCkge1xuXHRcdFx0dGhpcy5fb25EaWRQdWJsaXNoLmZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbLi4udGhpcy5nZXRDdXN0b21pemF0aW9ucygpXSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRjb25zdCBwdWJsaXNoZWQgPSBuZXcgTWFwPHN0cmluZywgQ3VzdG9taXphdGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgY2xpZW50LmN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fcHJvamVjdEZvclB1Ymxpc2goY3VzdG9taXphdGlvbi5jdXN0b21pemF0aW9uKTtcblx0XHRcdHB1Ymxpc2hlZC5zZXQoZW5hYmxlZC51cmksIGVuYWJsZWQpO1xuXHRcdH1cblx0XHRjb25zdCBwdWJsaXNoVXBkYXRlID0gKGl0ZW06IElSZXNvbHZlZEN1c3RvbWl6YXRpb24pID0+IHtcblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb24gPSB0aGlzLl9wcm9qZWN0Rm9yUHVibGlzaChpdGVtLmN1c3RvbWl6YXRpb24pO1xuXHRcdFx0aWYgKGVxdWFscyhwdWJsaXNoZWQuZ2V0KGN1c3RvbWl6YXRpb24udXJpKSwgY3VzdG9taXphdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cHVibGlzaGVkLnNldChjdXN0b21pemF0aW9uLnVyaSwgY3VzdG9taXphdGlvbik7XG5cdFx0XHRpZiAoIXF1aWV0KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUHVibGlzaC5maXJlKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJldiA9IGNsaWVudC5zeW5jO1xuXHRcdGNvbnN0IHByb21pc2UgPSBjbGllbnQuc3luYyA9IHByZXYuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NvcGlsb3Q6U2Vzc2lvblBsdWdpbkNvbnRyb2xsZXJdIFByZXZpb3VzIGN1c3RvbWl6YXRpb24gc3luYyBmYWlsZWQnLCBlcnIpO1xuXHRcdH0pLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXRCeVVyaSA9IG5ldyBNYXAoY3VzdG9taXphdGlvbnMubWFwKGMgPT4gW2MudXJpLCBjXSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcGFyZW50LnBsdWdpbk1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKGNsaWVudElkLCBjdXN0b21pemF0aW9ucywgc3RhdHVzID0+IHtcblx0XHRcdFx0aWYgKHJldmlzaW9uICE9PSBjbGllbnQucmV2aXNpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cHVibGlzaFVwZGF0ZSh7XG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbjogeyAuLi5zdGF0dXMsIGNsaWVudElkIH0sXG5cdFx0XHRcdFx0aW5wdXQ6IGlucHV0QnlVcmkuZ2V0KHN0YXR1cy51cmkpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IFByb21pc2UuYWxsKHJlc3VsdC5tYXAoaXRlbSA9PiB0aGlzLl9wYXJlbnQucmVzb2x2ZVN5bmNlZEN1c3RvbWl6YXRpb24oaXRlbSwgY2xpZW50SWQsIGlucHV0QnlVcmkuZ2V0KGl0ZW0uY3VzdG9taXphdGlvbi51cmkpKSkpO1xuXHRcdFx0aWYgKHJldmlzaW9uID09PSBjbGllbnQucmV2aXNpb24pIHtcblx0XHRcdFx0Y2xpZW50LmN1c3RvbWl6YXRpb25zID0gcmVzb2x2ZWQ7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiByZXNvbHZlZCkge1xuXHRcdFx0XHRcdHB1Ymxpc2hVcGRhdGUoaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwcm9taXNlLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChpdGVtID0+ICh7XG5cdFx0XHRjdXN0b21pemF0aW9uOiB0aGlzLl9vdmVybGF5TWNwU3RhdGUodGhpcy5fYXBwbHlFbmFibGVtZW50KGl0ZW0uY3VzdG9taXphdGlvbikpLFxuXHRcdFx0Li4uKGl0ZW0ucGx1Z2luRGlyID8geyBwbHVnaW5EaXI6IGl0ZW0ucGx1Z2luRGlyIH0gOiB7fSksXG5cdFx0fSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgYSBjbGllbnQncyBjdXN0b21pemF0aW9uIGNvbnRyaWJ1dGlvbiBmcm9tIHRoaXMgc2Vzc2lvbixcblx0ICogcHVibGlzaGluZyB0aGUgdXBkYXRlZCAodW5pb24pIGN1c3RvbWl6YXRpb24gbGlzdCBzbyB0aGUgcmVtb3ZlZFxuXHQgKiBjbGllbnQncyBwbHVnaW5zIGRpc2FwcGVhciBmcm9tIHNlc3Npb24gc3RhdGUuXG5cdCAqL1xuXHRwdWJsaWMgcmVtb3ZlQ2xpZW50KGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjbGllbnQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFjbGllbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gSW52YWxpZGF0ZSBhbnkgaW4tZmxpZ2h0IHN5bmMgZm9yIHRoaXMgY2xpZW50IGJ5IGJ1bXBpbmcgaXRzXG5cdFx0Ly8gcmV2aXNpb24gc28gdGhlIGxhdGUgY29udGludWF0aW9uJ3MgYHJldmlzaW9uID09PSBjbGllbnQucmV2aXNpb25gXG5cdFx0Ly8gZ3VhcmRzIGZhaWwgYW5kIGl0IGRvZXMgbm90IHJlLXB1Ymxpc2ggdGhlIHJlbW92ZWQgY2xpZW50J3Ncblx0XHQvLyBjdXN0b21pemF0aW9ucy5cblx0XHRjbGllbnQucmV2aXNpb24rKztcblx0XHR0aGlzLl9jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cdFx0dGhpcy5fb25EaWRQdWJsaXNoLmZpcmUoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFsuLi50aGlzLmdldEN1c3RvbWl6YXRpb25zKCldLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFRoZSByYXcgaW5wdXQgY3VzdG9taXphdGlvbnMgbGFzdCBzeW5jZWQgZm9yIGBjbGllbnRJZGAgKGVtcHR5IHdoZW4gYWJzZW50KS4gKi9cblx0cHVibGljIGNsaWVudElucHV0cyhjbGllbnRJZDogc3RyaW5nKTogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fY2xpZW50cy5nZXQoY2xpZW50SWQpPy5pbnB1dHMgPz8gW107XG5cdH1cblxuXHQvKipcblx0ICogUmUtaXNzdWUgZWFjaCBjbGllbnQncyBsYXN0IHN5bmMgaWYgYW55IG9mIGl0cyBwcmV2aW91c2x5LXN5bmNlZFxuXHQgKiBjdXN0b21pemF0aW9ucyBpcyBjdXJyZW50bHkgaW4gYW4gZXJyb3Igc3RhdGUuIFVzZWQgdG8gcmVjb3ZlciBmcm9tXG5cdCAqIHRyYW5zaWVudCBzeW5jIGZhaWx1cmVzIChlLmcuIGEgYHZzY29kZS1hZ2VudC1ob3N0Oi8vYCBjb25uZWN0aW9uIGRyb3Bcblx0ICogZHVyaW5nIHJlY29ubmVjdGlvbikgYXQgbWVzc2FnZSBib3VuZGFyaWVzLiBSZS1zeW5jcyAqKm9ubHkqKiB0aGVcblx0ICogZXJyb3JlZCBpdGVtcyBhbmQgYWx3YXlzIG5vbi1xdWlldCBzbyBsaXN0ZW5lcnMgb2JzZXJ2ZSByZWNvdmVyeS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyByZXRyeUZhaWxlZENsaWVudFN5bmNJZk5lZWRlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy5fY2xpZW50cy52YWx1ZXMoKV0ubWFwKGNsaWVudCA9PiBjbGllbnQuc3luYy5jYXRjaCgoKSA9PiB7IH0pKSk7XG5cdFx0Zm9yIChjb25zdCBbY2xpZW50SWQsIGNsaWVudF0gb2YgWy4uLnRoaXMuX2NsaWVudHNdKSB7XG5cdFx0XHRjb25zdCBlcnJvcmVkID0gY2xpZW50LmN1c3RvbWl6YXRpb25zLmZpbHRlcihpdGVtID0+XG5cdFx0XHRcdGl0ZW0uY3VzdG9taXphdGlvbi5sb2FkPy5raW5kID09PSBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5FcnJvclxuXHRcdFx0XHQmJiBpdGVtLmlucHV0ICE9PSB1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0XHRpZiAoZXJyb3JlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnB1dHMgPSBlcnJvcmVkLm1hcChpdGVtID0+IGl0ZW0uaW5wdXQhKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6U2Vzc2lvblBsdWdpbkNvbnRyb2xsZXJdIFJldHJ5aW5nICR7aW5wdXRzLmxlbmd0aH0gcHJldmlvdXNseS1mYWlsZWQgY2xpZW50IGN1c3RvbWl6YXRpb24ocykgZm9yICR7Y2xpZW50SWR9YCk7XG5cdFx0XHRhd2FpdCB0aGlzLnN5bmMoY2xpZW50SWQsIGlucHV0cykuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdDpTZXNzaW9uUGx1Z2luQ29udHJvbGxlcl0gUmV0cmllZCBjbGllbnQgY3VzdG9taXphdGlvbiBzeW5jIGZhaWxlZCcsIGVycik7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaXNjb3ZlcmVkRW50cnkoKTogU2Vzc2lvbkRpc2NvdmVyZWRFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9kaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fc2Vzc2lvbkRpc2NvdmVyZWQudmFsdWUpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25EaXNjb3ZlcmVkLnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkRpc2NvdmVyZWRFbnRyeSxcblx0XHRcdFx0W3RoaXMuX2RpcmVjdG9yeSwgLi4udGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzXSxcblx0XHRcdFx0dGhpcy5fcGFyZW50LmdldFVzZXJIb21lKCksXG5cdFx0XHRcdCgpID0+IHRoaXMuX3BhcmVudC5nZXRDbGllbnQoKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fb25EaWRQdWJsaXNoLmZpcmUoe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogWy4uLnRoaXMuZ2V0Q3VzdG9taXphdGlvbnMoKV0sXG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbkRpc2NvdmVyZWQudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VuYWJsZWQoY3VzdG9taXphdGlvbjogQ3VzdG9taXphdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kZXNpcmVkRW5hYmxlZChjdXN0b21pemF0aW9uKSA/PyBjdXN0b21pemF0aW9uLmVuYWJsZWQgIT09IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlFbmFibGVtZW50PFQgZXh0ZW5kcyBDdXN0b21pemF0aW9uPihjdXN0b21pemF0aW9uOiBUKTogVCB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2lzRW5hYmxlZChjdXN0b21pemF0aW9uKTtcblx0XHRpZiAoY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBjdXN0b21pemF0aW9uLmVuYWJsZWQgPT09IGVuYWJsZWQgPyBjdXN0b21pemF0aW9uIDogeyAuLi5jdXN0b21pemF0aW9uLCBlbmFibGVkIH07XG5cdFx0fVxuXHRcdGxldCBjaGFuZ2VkID0gY3VzdG9taXphdGlvbi5lbmFibGVkICE9PSBlbmFibGVkO1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gY3VzdG9taXphdGlvbi5jaGlsZHJlbj8ubWFwKGNoaWxkID0+IHtcblx0XHRcdGNvbnN0IGRlc2lyZWRFbmFibGVkID0gdGhpcy5fZGVzaXJlZEVuYWJsZWQoY2hpbGQpO1xuXHRcdFx0aWYgKGRlc2lyZWRFbmFibGVkID09PSB1bmRlZmluZWQgfHwgZGVzaXJlZEVuYWJsZWQgPT09IGNoaWxkLmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNoaWxkO1xuXHRcdFx0fVxuXHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4geyAuLi5jaGlsZCwgZW5hYmxlZDogZGVzaXJlZEVuYWJsZWQgfTtcblx0XHR9KTtcblx0XHRyZXR1cm4gY2hhbmdlZCA/IHsgLi4uY3VzdG9taXphdGlvbiwgZW5hYmxlZCwgY2hpbGRyZW4gfSA6IGN1c3RvbWl6YXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9kZXNpcmVkRW5hYmxlZChjdXN0b21pemF0aW9uOiBDdXN0b21pemF0aW9uIHwgQ2hpbGRDdXN0b21pemF0aW9uKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhhY3QgPSB0aGlzLl9nZXREZXNpcmVkQ3VzdG9taXphdGlvbihjdXN0b21pemF0aW9uLmlkKTtcblx0XHRpZiAoZXhhY3QpIHtcblx0XHRcdHJldHVybiBleGFjdC5lbmFibGVkO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcmV2aW91c0RpcmVjdG9yeSBvZiB0aGlzLl9wcmV2aW91c0RpcmVjdG9yaWVzKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c1VyaSA9IHJlYmFzZVVuZGVyKFVSSS5wYXJzZShjdXN0b21pemF0aW9uLnVyaSksIHRoaXMuX2RpcmVjdG9yeSwgcHJldmlvdXNEaXJlY3RvcnkpO1xuXHRcdFx0aWYgKCFwcmV2aW91c1VyaSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByZXZpb3VzSWQgPSBjdXN0b21pemF0aW9uSWQocHJldmlvdXNVcmkudG9TdHJpbmcoKSwgY3VzdG9taXphdGlvbi5yYW5nZSk7XG5cdFx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2dldERlc2lyZWRDdXN0b21pemF0aW9uKHByZXZpb3VzSWQpO1xuXHRcdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRcdHJldHVybiBwcmV2aW91cy5lbmFibGVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVzaXJlZEN1c3RvbWl6YXRpb24oaWQ6IHN0cmluZyk6IEN1c3RvbWl6YXRpb24gfCBDaGlsZEN1c3RvbWl6YXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZSh0aGlzLl9zZXNzaW9uLnRvU3RyaW5nKCkpPy5jdXN0b21pemF0aW9ucztcblx0XHRpZiAoY3VzdG9taXphdGlvbnMgIT09IHRoaXMuX2luZGV4ZWREZXNpcmVkQ3VzdG9taXphdGlvbnMpIHtcblx0XHRcdHRoaXMuX2luZGV4ZWREZXNpcmVkQ3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucztcblx0XHRcdHRoaXMuX2Rlc2lyZWRDdXN0b21pemF0aW9uQnlJZC5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGN1c3RvbWl6YXRpb25zID8/IFtdKSB7XG5cdFx0XHRcdHRoaXMuX2Rlc2lyZWRDdXN0b21pemF0aW9uQnlJZC5zZXQoY3VzdG9taXphdGlvbi5pZCwgY3VzdG9taXphdGlvbik7XG5cdFx0XHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVzaXJlZEN1c3RvbWl6YXRpb25CeUlkLnNldChjaGlsZC5pZCwgY2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVzaXJlZEN1c3RvbWl6YXRpb25CeUlkLmdldChpZCk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvamVjdHMgYSByYXcgY3VzdG9taXphdGlvbiBpbnRvIGl0cyBwdWJsaXNoZWQgZm9ybTogYXBwbGllcyByZWR1Y2VyLWJhY2tlZFxuXHQgKiBwZXItc2Vzc2lvbiBlbmFibGVtZW50LCB0aGVuIG92ZXJsYXlzIHRoZSBsYXRlc3Rcblx0ICoga25vd24gTUNQIHJ1bnRpbWUgYHN0YXRlYC9gY2hhbm5lbGAgKHNlZSB7QGxpbmsgbWNwU2VydmVyU3RhdGVzfSkuXG5cdCAqIEV2ZXJ5IHB1Ymxpc2ggcGF0aCBydW5zIGN1c3RvbWl6YXRpb25zIHRocm91Z2ggdGhpcyBzbyBlbmFibGVtZW50IGFuZFxuXHQgKiBsaXZlIE1DUCBzdGF0ZSBzdGF5IGNvbnNpc3RlbnQuIE9iamVjdCBpZGVudGl0eSBpcyBwcmVzZXJ2ZWQgd2hlblxuXHQgKiBuZWl0aGVyIHN0ZXAgY2hhbmdlcyBhbnl0aGluZywga2VlcGluZyBkb3duc3RyZWFtIGVxdWFsaXR5IGNoZWNrc1xuXHQgKiBzdGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIF9wcm9qZWN0Rm9yUHVibGlzaDxUIGV4dGVuZHMgQ3VzdG9taXphdGlvbj4oY3VzdG9taXphdGlvbjogVCk6IFQge1xuXHRcdHJldHVybiB0aGlzLl9vdmVybGF5TWNwU3RhdGUodGhpcy5fYXBwbHlFbmFibGVtZW50KGN1c3RvbWl6YXRpb24pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPdmVybGF5cyB0aGUgbGF0ZXN0IGtub3duIE1DUCBydW50aW1lIGBzdGF0ZWAvYGNoYW5uZWxgIChzZWVcblx0ICoge0BsaW5rIG1jcFNlcnZlclN0YXRlc30pIG9udG8gYSBjdXN0b21pemF0aW9uIGFuZCBpdHMgY2hpbGRyZW4sXG5cdCAqIHByZXNlcnZpbmcgb2JqZWN0IGlkZW50aXR5IHdoZW4gbm90aGluZyBpcyBvdmVybGFpZCBzbyBkb3duc3RyZWFtXG5cdCAqIGVxdWFsaXR5IGNoZWNrcyBzdGF5IHN0YWJsZS5cblx0ICovXG5cdHByaXZhdGUgX292ZXJsYXlNY3BTdGF0ZTxUIGV4dGVuZHMgQ3VzdG9taXphdGlvbj4oY3VzdG9taXphdGlvbjogVCk6IFQge1xuXHRcdGNvbnN0IG92ZXJsYXlzID0gdGhpcy5tY3BTZXJ2ZXJTdGF0ZXMuZ2V0KCk7XG5cdFx0aWYgKG92ZXJsYXlzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiBjdXN0b21pemF0aW9uO1xuXHRcdH1cblx0XHRpZiAoY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdGNvbnN0IG92ZXJsYXkgPSBvdmVybGF5cy5nZXQoY3VzdG9taXphdGlvbi5pZCk7XG5cdFx0XHRyZXR1cm4gb3ZlcmxheSA/IHsgLi4uY3VzdG9taXphdGlvbiwgc3RhdGU6IG92ZXJsYXkuc3RhdGUsIGNoYW5uZWw6IG92ZXJsYXkuY2hhbm5lbCB9IDogY3VzdG9taXphdGlvbjtcblx0XHR9XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBjdXN0b21pemF0aW9uLmNoaWxkcmVuO1xuXHRcdGlmICghY2hpbGRyZW4gfHwgY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gY3VzdG9taXphdGlvbjtcblx0XHR9XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRjb25zdCBvdmVybGFpZENoaWxkcmVuID0gY2hpbGRyZW4ubWFwKGNoaWxkID0+IHtcblx0XHRcdGlmIChjaGlsZC50eXBlICE9PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuIGNoaWxkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IG92ZXJsYXlzLmdldChjaGlsZC5pZCk7XG5cdFx0XHRpZiAoIW92ZXJsYXkpIHtcblx0XHRcdFx0cmV0dXJuIGNoaWxkO1xuXHRcdFx0fVxuXHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4geyAuLi5jaGlsZCwgc3RhdGU6IG92ZXJsYXkuc3RhdGUsIGNoYW5uZWw6IG92ZXJsYXkuY2hhbm5lbCB9O1xuXHRcdH0pO1xuXHRcdHJldHVybiBjaGFuZ2VkID8geyAuLi5jdXN0b21pemF0aW9uLCBjaGlsZHJlbjogb3ZlcmxhaWRDaGlsZHJlbiB9IDogY3VzdG9taXphdGlvbjtcblx0fVxufVxuXG4vKipcbiAqIEEgcGVyLShzZXNzaW9uLCBjbGllbnRJZCkgaGFuZGxlIHJldHVybmVkIGJ5XG4gKiB7QGxpbmsgQ29waWxvdEFnZW50LmdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50fS4gUmVhZHMvd3JpdGVzIGZsb3cgc3RyYWlnaHRcbiAqIHRocm91Z2ggdG8gdGhlIG93bmluZyBzZXNzaW9uJ3Mge0BsaW5rIEFjdGl2ZUNsaWVudH0gKHRoZSBtdWx0aS1jbGllbnRcbiAqIGNvbnRhaW5lciksIHNvIGFzc2lnbmluZyBgdG9vbHNgIC8gYGN1c3RvbWl6YXRpb25zYCB1cGRhdGVzIG9ubHkgdGhpc1xuICogY2xpZW50J3Mgc2xpY2UuXG4gKi9cbmNsYXNzIENvcGlsb3RBY3RpdmVDbGllbnRIYW5kbGUgaW1wbGVtZW50cyBJQWN0aXZlQ2xpZW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3duZXI6IEFjdGl2ZUNsaWVudCxcblx0XHRyZWFkb25seSBjbGllbnRJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0Z2V0IHRvb2xzKCk6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9vd25lci50b29sU2V0LmdldCh0aGlzLmNsaWVudElkKTtcblx0fVxuXHRzZXQgdG9vbHModG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10pIHtcblx0XHR0aGlzLl9vd25lci50b29sU2V0LnNldCh0aGlzLmNsaWVudElkLCB0b29scyk7XG5cdH1cblxuXHRnZXQgY3VzdG9taXphdGlvbnMoKTogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fb3duZXIucGx1Z2luQ29udHJvbGxlci5jbGllbnRJbnB1dHModGhpcy5jbGllbnRJZCk7XG5cdH1cblx0c2V0IGN1c3RvbWl6YXRpb25zKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pIHtcblx0XHQvLyBGaXJlLWFuZC1mb3JnZXQ6IHByb2dyZXNzIGFuZCB0aGUgc2V0dGxlZCByZXN1bHQgZmxvdyBvdXQgdmlhIHRoZVxuXHRcdC8vIGNvbnRyb2xsZXIncyBgb25EaWRQdWJsaXNoYCBzZXNzaW9uIGFjdGlvbnMsIG5vdCB0aGUgc2V0dGVyLlxuXHRcdHRoaXMuX293bmVyLnBsdWdpbkNvbnRyb2xsZXIuc3luYyh0aGlzLmNsaWVudElkLCBbLi4uY3VzdG9taXphdGlvbnNdKS5jYXRjaCgoKSA9PiB7IC8qIGxvZ2dlZCBpbnNpZGUgc3luYyAqLyB9KTtcblx0fVxufVxuXG4vKipcbiAqIFRyYWNrcyBwZXItc2Vzc2lvbiBhY3RpdmUgY2xpZW50IGNvbnRyaWJ1dGlvbnMgKHRvb2xzIGFuZCBwbHVnaW5zKSBhY3Jvc3NcbiAqIHBvdGVudGlhbGx5IHNldmVyYWwgYWN0aXZlIGNsaWVudHMuIE93bnMgdGhlIHNlc3Npb24nc1xuICoge0BsaW5rIFNlc3Npb25QbHVnaW5Db250cm9sbGVyfSwgd2hpY2ggaXMgdGhlIGF1dGhvcml0YXRpdmUgc291cmNlIGZvciBib3RoXG4gKiB0aGUgcGx1Z2luIHNuYXBzaG90IChob3N0ICsgYWxsIGNsaWVudHMgKyBzZXNzaW9uLWRpc2NvdmVyZWQpIGFuZFxuICogcGVyLXNlc3Npb24gYWN0aW9uIGV2ZW50cywgYW5kIHRoZSB7QGxpbmsgQWN0aXZlQ2xpZW50VG9vbFNldH0gdGhhdCBtZXJnZXNcbiAqIGV2ZXJ5IGNsaWVudCdzIHRvb2xzLiBEaXNwb3NpbmcgdGhpcyB0ZWFycyBkb3duIHRoZSBjb250cm9sbGVyIGFuZCBhbnkgZGlza1xuICogd2F0Y2hlcnMgaXQgY3JlYXRlZC5cbiAqL1xuY2xhc3MgQWN0aXZlQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBMaXZlLCBtdWx0aS1jbGllbnQgcmVnaXN0cnkgb2YgY29udHJpYnV0ZWQgdG9vbHMuIFNoYXJlZCBieSByZWZlcmVuY2Vcblx0ICogd2l0aCB0aGUgc2Vzc2lvbidzIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufSBzbyBhIHdpbmRvdyByZWxvYWQgKG5ld1xuXHQgKiBgY2xpZW50SWRgLCBpZGVudGljYWwgdG9vbHMpIGlzIHJlZmxlY3RlZCBhdCB0b29sLWNhbGwgc3RhbXAgdGltZSB3aXRob3V0XG5cdCAqIHJlc3RhcnRpbmcgdGhlIFNESyBzZXNzaW9uLCBhbmQgc28gdG9vbCBjYWxscyBhcmUgYXR0cmlidXRlZCB0byB0aGVcblx0ICogY29udHJpYnV0aW5nIGNsaWVudC5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xTZXQgPSBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpO1xuXG5cdHB1YmxpYyByZWFkb25seSBwbHVnaW5Db250cm9sbGVyOiBTZXNzaW9uUGx1Z2luQ29udHJvbGxlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVzID0gbmV3IE1hcDxzdHJpbmcsIENvcGlsb3RBY3RpdmVDbGllbnRIYW5kbGU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblVyaTogVVJJLFxuXHRcdHBsdWdpbkNvbnRyb2xsZXI6IFNlc3Npb25QbHVnaW5Db250cm9sbGVyLFxuXHRcdG9uRGlkU2Vzc2lvblByb2dyZXNzOiBFbWl0dGVyPEFnZW50U2lnbmFsPixcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucGx1Z2luQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKHBsdWdpbkNvbnRyb2xsZXIpO1xuXHRcdC8vIEZvcndhcmQgcGVyLXNlc3Npb24gcHVibGlzaCBldmVudHMgaW50byB0aGUgYWdlbnQncyBwcm9ncmVzc1xuXHRcdC8vIHN0cmVhbS4gVGhpcyByZXBsYWNlcyB0aGUgcHJldmlvdXMgY2xpZW50SWQtYmFzZWQgcm91dGluZy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBsdWdpbkNvbnRyb2xsZXIub25EaWRQdWJsaXNoKGFjdGlvbiA9PiB7XG5cdFx0XHRvbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiB0aGlzLl9zZXNzaW9uVXJpLCBhY3Rpb24gfSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIEdldCAob3IgbGF6aWx5IGNyZWF0ZSkgdGhlIHN0YWJsZSBoYW5kbGUgZm9yIGBjbGllbnRJZGAuICovXG5cdGdldE9yQ3JlYXRlSGFuZGxlKGNsaWVudElkOiBzdHJpbmcsIGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBDb3BpbG90QWN0aXZlQ2xpZW50SGFuZGxlIHtcblx0XHRsZXQgaGFuZGxlID0gdGhpcy5faGFuZGxlcy5nZXQoY2xpZW50SWQpO1xuXHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHRoYW5kbGUgPSBuZXcgQ29waWxvdEFjdGl2ZUNsaWVudEhhbmRsZSh0aGlzLCBjbGllbnRJZCwgZGlzcGxheU5hbWUpO1xuXHRcdFx0dGhpcy5faGFuZGxlcy5zZXQoY2xpZW50SWQsIGhhbmRsZSk7XG5cdFx0fVxuXHRcdHJldHVybiBoYW5kbGU7XG5cdH1cblxuXHQvKiogRHJvcCBhIGNsaWVudCdzIHRvb2wgYW5kIGN1c3RvbWl6YXRpb24gY29udHJpYnV0aW9ucyBmcm9tIHRoaXMgc2Vzc2lvbi4gKi9cblx0cmVtb3ZlQ2xpZW50KGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9oYW5kbGVzLmRlbGV0ZShjbGllbnRJZCk7XG5cdFx0dGhpcy50b29sU2V0LmRlbGV0ZShjbGllbnRJZCk7XG5cdFx0dGhpcy5wbHVnaW5Db250cm9sbGVyLnJlbW92ZUNsaWVudChjbGllbnRJZCk7XG5cdH1cblxuXHRhc3luYyBzbmFwc2hvdCgpOiBQcm9taXNlPElBY3RpdmVDbGllbnRTbmFwc2hvdD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0b29sczogdGhpcy50b29sU2V0Lm1lcmdlZCgpLFxuXHRcdFx0cGx1Z2luczogYXdhaXQgdGhpcy5wbHVnaW5Db250cm9sbGVyLmdldEFwcGxpZWRQbHVnaW5zKCksXG5cdFx0XHRtY3BTZXJ2ZXJzOiB0aGlzLl9nZXRNY3BTZXJ2ZXJzKCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1jcFNlcnZlcnMoKTogQWdlbnRIb3N0TWNwU2VydmVycyB7XG5cdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkpID8/IHt9O1xuXG5cdFx0cmV0dXJuIHN0cnVjdHVyZWRDbG9uZShzZXJ2ZXJzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGB0cnVlYCB3aGVuIHRoZSBTREsgc2Vzc2lvbiBtdXN0IGJlIGRpc3Bvc2VkIGFuZCByZXN1bWVkIHRvXG5cdCAqIHBpY2sgdXAgYSBjaGFuZ2VkIGNvbmZpZy4gQ29tcGFyZXMgT05MWSBwbHVnaW5zIGFuZCB0aGUgc3RydWN0dXJhbFxuXHQgKiAobWVyZ2VkKSB0b29sIHNldCAobmFtZSArIGRlc2NyaXB0aW9uICsgaW5wdXRTY2hlbWEpLiBUaGUgb3duaW5nXG5cdCAqIGBjbGllbnRJZGBzIGFyZSBkZWxpYmVyYXRlbHkgZXhjbHVkZWQgXHUyMDE0IGEgY2xpZW50SWQtb25seSBjaGFuZ2UgaXNcblx0ICogcmVmbGVjdGVkIGxpdmUgdmlhIHtAbGluayB0b29sU2V0fSBhbmQgbmV2ZXIgcmVxdWlyZXMgYSByZXN0YXJ0LlxuXHQgKi9cblx0YXN5bmMgcmVxdWlyZXNSZXN0YXJ0KHNuYXA6IElBY3RpdmVDbGllbnRTbmFwc2hvdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLnBsdWdpbkNvbnRyb2xsZXIuZ2V0QXBwbGllZFBsdWdpbnMoKTtcblx0XHRpZiAoIXBhcnNlZFBsdWdpbnNFcXVhbChzbmFwLnBsdWdpbnMsIHBsdWdpbnMpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFlcXVhbHMoc25hcC5tY3BTZXJ2ZXJzLCB0aGlzLl9nZXRNY3BTZXJ2ZXJzKCkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuICF0aGlzLnRvb2xTZXQuc3RydWN0dXJhbEVxdWFscyhzbmFwLnRvb2xzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWUseUJBQXNGO0FBQzlHLFlBQVksUUFBUTtBQUNwQixZQUFZLFFBQVE7QUFDcEIsU0FB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
